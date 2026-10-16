import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { beforeAll, expect, it, vi } from 'vitest';
import initOpenCascade, { type BRepPrimAPI_MakePrism, type TopoDS_Shape } from 'replicad-opencascadejs';
import { getOC, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import type { EntityProfile } from '../sketch/types';
import { entityProfilePrismWithProvenance, type OwnedEntityPrism, type PrismProvenance } from './kernel.provenance';
import { entityProfileSolid } from './kernel.profiles';
import { createFaceCatalog } from './kernel.faces';
import { createEdgeCatalog } from './kernel.edges';

// Original Cartesian fixtures authored here in mm. No imported model, private
// artifact, generated reference oracle or desktop application is used.
const tolerance = 5e-6;
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

function plate(radiusA: number, radiusB: number): EntityProfile {
  const points = [{ id: 'a', x: -10, y: -10 }, { id: 'b', x: 40, y: -10 },
    { id: 'c', x: 40, y: 10 }, { id: 'd', x: -10, y: 10 }, { id: 'hole-b-center', x: 20, y: 0 }];
  return { kind: 'entities', points, entities: [
    ...points.slice(0, 4).map((point, index) => ({ id: `outer-${index}`, type: 'line' as const,
      start: point.id, end: points[(index + 1) % 4].id, construction: false })),
    { id: 'hole-a', type: 'circle', center: 'origin', radius: radiusA, construction: false },
    { id: 'hole-b', type: 'circle', center: 'hole-b-center', radius: radiusB, construction: false },
  ], constraints: [] };
}
function verified(owner: OwnedEntityPrism): Extract<PrismProvenance, { status: 'verified' }> {
  const provenance = owner.provenance;
  expect(provenance.status, JSON.stringify(provenance.status === 'unavailable' ? provenance.diagnostics : [])).toBe('verified');
  if (provenance.status !== 'verified') throw new Error('Expected complete primitive correspondence.');
  return provenance;
}
function metrics(shape: Shape3D, radiusA: number, radiusB: number, depth = 4) {
  const oc = getOC(), volume = new oc.GProp_GProps();
  const surface = measureShapeSurfaceProperties(shape), box = shape.boundingBox;
  const solids = shape.solids, analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
  try {
    oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false);
    const section = 1000 - Math.PI * (radiusA ** 2 + radiusB ** 2);
    expect(analyzer.IsValid()).toBe(true);
    expect(solids).toHaveLength(1);
    expect(Math.abs(volume.Mass() - Math.abs(depth) * section)).toBeLessThan(tolerance);
    expect(Math.abs(surface.area - (2 * section + Math.abs(depth) * (140 + 2 * Math.PI * (radiusA + radiusB))))).toBeLessThan(tolerance);
    const expected = [[-10, -10, Math.min(0, depth)], [40, 10, Math.max(0, depth)]];
    box.bounds.forEach((corner, side) => corner.forEach((coordinate, axis) =>
      expect(Math.abs(coordinate - expected[side][axis])).toBeLessThan(tolerance)));
  } finally {
    analyzer.delete(); solids.forEach(solid => solid.delete()); box.delete(); surface.delete(); volume.delete();
  }
}
function bindingRoleKeys(provenance: Extract<PrismProvenance, { status: 'verified' }>) {
  return [...provenance.faces, ...provenance.edges].map(binding =>
    `${binding.role}|${'entityId' in binding ? binding.entityId + '|' + binding.entityType : ''}`).sort();
}
function expectCoordinates(actual: readonly (readonly number[])[], expected: readonly (readonly number[])[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((tuple, index) => tuple.forEach((coordinate, axis) =>
    expect(Math.abs(coordinate - expected[index][axis])).toBeLessThan(5e-7)));
}
function expectHoleTargets(provenance: Extract<PrismProvenance, { status: 'verified' }>, entityId: string, radius: number, x: number): void {
  const bindings = [...provenance.faces, ...provenance.edges].filter(binding => 'entityId' in binding && binding.entityId === entityId);
  expect(bindings).toHaveLength(3);
  for (const binding of bindings) {
    const box = binding.target.boundingBox;
    const lowerZ = binding.role === 'endRim' ? 4 : 0, upperZ = binding.role === 'startRim' ? 0 : 4;
    const expected = [[x - radius, -radius, lowerZ], [x + radius, radius, upperZ]];
    try { box.bounds.forEach((corner, side) => corner.forEach((coordinate, axis) =>
      expect(Math.abs(coordinate - expected[side][axis])).toBeLessThan(tolerance))); }
    finally { box.delete(); }
  }
}

it.each([[2, 5, 1], [2, 5, 1.5], [2.25, 5, 1.5]])(
  'binds the 50x20x4 plate with radii %s/%s and analytical offset %s',
  (sourceA, sourceB, distance) => {
    const radiusA = sourceA + distance, radiusB = sourceB + distance;
    const profile = plate(radiusA, radiusB), before = structuredClone(profile);
    const owner = entityProfilePrismWithProvenance(profile, 'XY', 0, 4);
    try {
      expect(profile).toEqual(before);
      metrics(owner.shape, radiusA, radiusB);
      const provenance = verified(owner);
      expect(provenance.direction).toBe('positive');
      expect(provenance.faces).toHaveLength(8);
      expect(provenance.edges).toHaveLength(12);
      expect(provenance.bodyFaces).toHaveLength(8);
      expect(provenance.bodyEdges).toHaveLength(18);
      expect(provenance.unboundEdgeCount).toBe(6); // Four verticals + two circle seams, unnamed.
      expect(new Set(bindingRoleKeys(provenance)).size).toBe(20);
      expectHoleTargets(provenance, 'hole-a', radiusA, 0);
      expectHoleTargets(provenance, 'hole-b', radiusB, 20);
      expect(new Set(provenance.materialRegion.outer)).toEqual(new Set(['outer-0', 'outer-1', 'outer-2', 'outer-3']));
      expect(provenance.materialRegion.holes.map(hole => [...hole].sort()).sort()).toEqual([['hole-a'], ['hole-b']]);
      for (const binding of provenance.faces) {
        expect(provenance.bodyFaces.filter(face => face.isSame(binding.target))).toHaveLength(1);
        expect(provenance.faces.filter(other => other.target.isSame(binding.target))).toHaveLength(1);
      }
      for (const binding of provenance.edges) {
        expect(provenance.bodyEdges.filter(edge => edge.isSame(binding.target))).toHaveLength(1);
        const cap = provenance.faces.find(face => face.role === (binding.role === 'startRim' ? 'startCap' : 'endCap'))!;
        const capEdges = cap.target.edges;
        try { expect(capEdges.filter(edge => edge.isSame(binding.target))).toHaveLength(1); }
        finally { capEdges.forEach(edge => edge.delete()); }
      }
      const caps = provenance.faces.filter(binding => binding.role !== 'side');
      expectCoordinates(caps.map(binding => binding.frame.origin), [[0, 0, 0], [0, 0, 4]]);
      expect(caps.map(binding => binding.frame.normal[2])).toEqual([-1, 1]);
      expect(provenance.faces.filter(binding => binding.role === 'side' && binding.entityType === 'circle')
        .every(binding => binding.frame === null && binding.target.geomType === 'CYLINDRE')).toBe(true);
    } finally { expect(owner.dispose()).toEqual([]); }
  }, 60_000,
);

it('keeps source roles when radii exchange size order, without matching between rebuilds by geometry', () => {
  const first = entityProfilePrismWithProvenance(plate(3, 6), 'XY', 0, 4);
  const second = entityProfilePrismWithProvenance(plate(6, 3), 'XY', 0, 4);
  try {
    metrics(first.shape, 3, 6); metrics(second.shape, 6, 3);
    expect(bindingRoleKeys(verified(first))).toEqual(bindingRoleKeys(verified(second)));
    expectHoleTargets(verified(first), 'hole-a', 3, 0); expectHoleTargets(verified(first), 'hole-b', 6, 20);
    expectHoleTargets(verified(second), 'hole-a', 6, 0); expectHoleTargets(verified(second), 'hole-b', 3, 20);
    for (const owner of [first, second]) {
      const sides = verified(owner).faces.filter(binding => binding.role === 'side' && binding.entityType === 'circle');
      expect(sides.map(binding => 'entityId' in binding ? binding.entityId : '')).toEqual(['hole-a', 'hole-b']);
    }
  } finally { first.dispose(); second.dispose(); }
}, 60_000);

it('uses generation start/end and actual outward normals for negative depth', () => {
  const owner = entityProfilePrismWithProvenance(plate(3, 6), 'XY', 0, -4);
  try {
    metrics(owner.shape, 3, 6, -4);
    const provenance = verified(owner), caps = provenance.faces.filter(binding => binding.role !== 'side');
    expect(provenance.direction).toBe('negative');
    expectCoordinates(caps.map(binding => binding.frame.origin), [[0, 0, 0], [0, 0, -4]]);
    expect(caps.map(binding => binding.frame.normal[2])).toEqual([1, -1]);
  } finally { owner.dispose(); }
}, 60_000);

it('derives cap frames from the supplied generating frame while hole radii change', () => {
  const frame = { origin: [7, -4, 9] as [number, number, number], normal: [0, 0, 1] as [number, number, number],
    xDirection: [0, 1, 0] as [number, number, number] };
  const first = entityProfilePrismWithProvenance(plate(3, 6), 'XY', 100, 4, frame);
  const second = entityProfilePrismWithProvenance(plate(3.5, 6.5), 'XY', 100, 4, frame);
  try {
    const frames = [first, second].map(owner => verified(owner).faces.filter(binding => binding.role !== 'side').map(binding => binding.frame));
    expect(frames[0]).toEqual(frames[1]);
    expectCoordinates(frames[0].map(value => value.origin), [[0, 0, 9], [0, 0, 13]]);
    const catalog = createFaceCatalog(first.shape, 'placed-prism');
    try { expectFrameParity(first, catalog); } finally { catalog.dispose(); }
    const box = first.shape.boundingBox;
    try { box.bounds.forEach((corner, side) => corner.forEach((coordinate, axis) =>
      expect(Math.abs(coordinate - [[-3, -14, 9], [17, 36, 13]][side][axis])).toBeLessThan(tolerance))); }
    finally { box.delete(); }
  } finally { first.dispose(); second.dispose(); }
}, 60_000);

it('reports an arc source kind after a circle becomes a D-shaped contour under the same entity ID', () => {
  const profile = plate(3, 6);
  profile.points.push({ id: 'arc-start', x: 3, y: 0 }, { id: 'arc-end', x: -3, y: 0 });
  profile.entities = profile.entities.map(entity => entity.id === 'hole-a'
    ? { id: entity.id, type: 'arc', center: 'origin', start: 'arc-start', end: 'arc-end', clockwise: false, construction: false }
    : entity);
  profile.entities.push({ id: 'arc-chord', type: 'line', start: 'arc-end', end: 'arc-start', construction: false });
  const owner = entityProfilePrismWithProvenance(profile, 'XY', 0, 4);
  try {
    const provenance = verified(owner);
    expect(provenance.faces).toHaveLength(9);
    expect(provenance.faces.find(binding => binding.role === 'side' && binding.entityId === 'hole-a'))
      .toMatchObject({ entityId: 'hole-a', entityType: 'arc', frame: null });
    expect(provenance.faces.some(binding => binding.role === 'side' && binding.entityId === 'hole-a' && binding.entityType === 'circle')).toBe(false);
    const mass = new (getOC().GProp_GProps)(), analyzer = new (getOC().BRepCheck_Analyzer)(owner.shape.wrapped, true, false, false);
    try {
      getOC().BRepGProp.VolumeProperties(owner.shape.wrapped, mass, 1e-10, false, false);
      expect(analyzer.IsValid()).toBe(true);
      expect(Math.abs(mass.Mass() - 4 * (1000 - 4.5 * Math.PI - 36 * Math.PI))).toBeLessThan(tolerance);
    } finally { analyzer.delete(); mass.delete(); }
  } finally { owner.dispose(); }
}, 60_000);

it('rejects unsupported multiple material regions and invalid placement without mutating the sketch', () => {
  const profile: EntityProfile = { kind: 'entities', points: [{ id: 'other', x: 20, y: 0 }], entities: [
    { id: 'one', type: 'circle', center: 'origin', radius: 3, construction: false },
    { id: 'two', type: 'circle', center: 'other', radius: 3, construction: false },
  ], constraints: [] }, before = structuredClone(profile);
  expect(() => entityProfilePrismWithProvenance(profile, 'XY', 0, 4)).toThrow('único exterior');
  expect(profile).toEqual(before);
  const duplicate = plate(3, 6);
  duplicate.entities[1].id = duplicate.entities[0].id;
  const duplicateInput = structuredClone(duplicate);
  expect(() => entityProfilePrismWithProvenance(duplicate, 'XY', 0, 4)).toThrow('duplicado');
  expect(duplicate).toEqual(duplicateInput);
  expect(() => entityProfilePrismWithProvenance(plate(3, 6), 'XY', 0, 0)).toThrow('profundidad');
  expect(() => entityProfilePrismWithProvenance(plate(3, 6), 'XY', 0, 4,
    { origin: [0, 0, 0], normal: [0, 0, 2], xDirection: [1, 0, 0] })).toThrow('ortonormal');
}, 60_000);

it('preserves a valid solid and releases the copied history list when a history read fails', () => {
  const prototype = getOC().BRepPrimAPI_MakePrism.prototype, original = prototype.Generated;
  const lists: ReturnType<typeof original>[] = [], releases: { mock: { calls: unknown[][] } }[] = [];
  const history = vi.spyOn(prototype, 'Generated').mockImplementation(function (this: BRepPrimAPI_MakePrism, source: TopoDS_Shape) {
    const list = original.call(this, source); lists.push(list);
    releases.push(vi.spyOn(list, 'delete'));
    vi.spyOn(list, 'Size').mockImplementation(() => { throw new Error('Injected history read failure'); });
    return list;
  });
  let owner: OwnedEntityPrism | undefined;
  try {
    owner = entityProfilePrismWithProvenance(plate(3, 6), 'XY', 0, 4);
    expect(owner.provenance).toMatchObject({ status: 'unavailable', diagnostics: [
      { stage: 'primitive-history', message: 'Injected history read failure' },
    ] });
    metrics(owner.shape, 3, 6);
    expect(lists).toHaveLength(1);
    expect(releases[0]).toHaveBeenCalledTimes(1);
  } finally { owner?.dispose(); history.mockRestore(); vi.restoreAllMocks(); }
}, 60_000);

it('preserves the legacy v1 face and edge key inventory for the original primitive', () => {
  const profile = plate(3, 6), legacy = entityProfileSolid(profile, 'XY', 0, { type: 'extrude', depth: 4 });
  const owner = entityProfilePrismWithProvenance(profile, 'XY', 0, 4);
  const legacyFaces = createFaceCatalog(legacy, 'original-prism', 'same-lineage');
  const producerFaces = createFaceCatalog(owner.shape, 'original-prism', 'same-lineage');
  const legacyEdges = createEdgeCatalog(legacy, 'original-prism', 'same-lineage');
  const producerEdges = createEdgeCatalog(owner.shape, 'original-prism', 'same-lineage');
  try {
    metrics(legacy, 3, 6); metrics(owner.shape, 3, 6);
    expect(producerFaces.entries.map(entry => entry.ref.key).sort()).toEqual(legacyFaces.entries.map(entry => entry.ref.key).sort());
    expect(producerEdges.entries.map(entry => entry.ref.key).sort()).toEqual(legacyEdges.entries.map(entry => entry.ref.key).sort());
    expectFrameParity(owner, producerFaces);
  } finally {
    producerEdges.dispose(); legacyEdges.dispose(); producerFaces.dispose(); legacyFaces.dispose(); owner.dispose(); legacy.delete();
  }
}, 60_000);

function expectFrameParity(owner: OwnedEntityPrism, catalog: ReturnType<typeof createFaceCatalog>): void {
  for (const binding of verified(owner).faces) {
    const matches = catalog.entries.filter(entry => entry.face.isSame(binding.target));
    expect(matches).toHaveLength(1);
    if (binding.frame === null) { expect(matches[0].frame).toBeNull(); continue; }
    const actual = matches[0].frame;
    if (!actual) throw new Error('Expected the current planar support frame.');
    for (const key of ['origin', 'normal', 'xDirection'] as const)
      binding.frame[key].forEach((coordinate, axis) => expect(Math.abs(coordinate - actual[key][axis])).toBeLessThan(5e-7));
  }
}

it('transfers the body once and releases the provenance pool independently and idempotently', () => {
  const owner = entityProfilePrismWithProvenance(plate(3, 6), 'XY', 0, 4);
  const provenance = verified(owner), firstFace = provenance.bodyFaces[0];
  const original = firstFace.delete.bind(firstFace);
  const faceRelease = vi.spyOn(firstFace, 'delete').mockImplementation(() => { original(); throw new Error('Injected release notification'); });
  const remainingRelease = vi.spyOn(provenance.bodyFaces[1], 'delete');
  const body = owner.takeShape(), bodyRelease = vi.spyOn(body, 'delete');
  try {
    expect(() => owner.takeShape()).toThrow('transferred');
    expect(() => owner.shape).toThrow('transferred');
    expect(owner.dispose()).toEqual(['Injected release notification']);
    expect(owner.dispose()).toEqual(['Injected release notification']);
    expect(faceRelease).toHaveBeenCalledTimes(1);
    expect(remainingRelease).toHaveBeenCalledTimes(1);
    expect(bodyRelease).not.toHaveBeenCalled();
    expect(() => owner.provenance).toThrow('disposed');
    metrics(body, 3, 6);
  } finally { body.delete(); vi.restoreAllMocks(); }
}, 60_000);
