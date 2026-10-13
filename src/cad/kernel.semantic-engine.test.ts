import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, isShape3D, localGC, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import {
  addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature,
  validateDocument, type Document,
} from '../model/document';
import { planSketchOffset, type OffsetParameters } from '../sketch/offset';
import { removeSelection } from '../sketch/editing';
import { solveOffsetApplication } from '../sketch/offsetApplication';
import { solveSketch } from '../sketch/solver';
import type { EntityProfile } from '../sketch/types';
import { CadEngine } from './kernel.engine';
import type { CadResult, EdgeReference, FaceReference, PickableEdge, PickableFace } from './kernel.types';

// Original in-memory Cartesian fixtures, in mm: a 50 x 20 x 4 plate, with two
// holes produced by the actual offset command. No external model is consumed.
// STEP round trips use the same OCCT implementation and are not independent
// interoperability evidence. V/A expectations below are analytic, not snapshots.
const sketchId = 'semantic-engine-sketch', solidId = 'semantic-engine-solid';
const engine = new CadEngine();
const coordinateTolerance = 5e-7, cadTolerance = 5e-6;
const parameters: OffsetParameters = {
  distance: 1, reverse: false, bothDirections: false, chain: true,
  cap: 'none', construction: 'source', addDimensions: true,
};
type Settings = { distance: number; sourceA: number; sourceB: number; centerA: number; centerB: number };
type Metrics = { volume: number; area: number; bounds: readonly (readonly number[])[] };
type RimGeometry = { centerX: number; radius: number; z: number };
const edits: readonly Settings[] = [
  { distance: 1, sourceA: 2, sourceB: 5, centerA: 0, centerB: 20 },
  { distance: 1.5, sourceA: 2, sourceB: 5, centerA: 0, centerB: 20 },
  { distance: 1.5, sourceA: 2.25, sourceB: 5, centerA: 0, centerB: 20 },
  { distance: 1.5, sourceA: 2.25, sourceB: 5, centerA: -1, centerB: 21 },
  { distance: 1, sourceA: 6, sourceB: 1, centerA: -1, centerB: 20 },
];

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => { vi.restoreAllMocks(); engine.dispose(); });

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing expected fixture item.');
  return value;
}
function profile(document: Document): EntityProfile {
  const feature = document.features.find(feature => feature.id === sketchId);
  if (feature?.type !== 'sketch' || feature.profile.kind !== 'entities') throw new Error('Entity sketch expected.');
  return feature.profile;
}
function healthy(target: EntityProfile) {
  const before = structuredClone(target), result = solveSketch(target);
  expect(target).toEqual(before);
  expect(['fullyDefined', 'underdefined'], result.message).toContain(result.status);
  expect(result.conflictingConstraintIds).toEqual([]);
  expect(result.maxResidual).toBeLessThanOrEqual(1e-7);
  return result;
}
function sourcePlate(): Document {
  const corners = [
    { id: 'plate-a', x: -10, y: -10 }, { id: 'plate-b', x: 40, y: -10 },
    { id: 'plate-c', x: 40, y: 10 }, { id: 'plate-d', x: -10, y: 10 },
  ];
  const target: EntityProfile = {
    kind: 'entities', points: [...corners, { id: 'center-a', x: 0, y: 0 }, { id: 'center-b', x: 20, y: 0 }],
    entities: [
      ...corners.map((point, index) => ({ id: `plate-edge-${index}`, type: 'line' as const,
        start: point.id, end: corners[(index + 1) % corners.length].id, construction: false })),
      { id: 'circle-a', type: 'circle', center: 'center-a', radius: 2, construction: false },
      { id: 'circle-b', type: 'circle', center: 'center-b', radius: 5, construction: false },
    ],
    constraints: [
      ...corners.map(point => ({ id: `fixed-${point.id}`, type: 'fix' as const,
        pointId: point.id, x: point.x, y: point.y })),
      { id: 'fixed-center-a', type: 'fix', pointId: 'center-a', x: 0, y: 0 },
      { id: 'fixed-center-b', type: 'fix', pointId: 'center-b', x: 20, y: 0 },
      { id: 'radius-a', type: 'radius', entityId: 'circle-a', value: 2 },
      { id: 'radius-b', type: 'radius', entityId: 'circle-b', value: 5 },
    ],
  };
  return validateDocument({ ...createDocument('Original semantic reference plate'), features: [
    { id: sketchId, name: 'Two offset hole supports', type: 'sketch', plane: 'XY', offset: 0,
      profile: target, suppressed: false },
  ] });
}
function specimen(): Document {
  const original = sourcePlate(), originalBytes = serializeDocument(original);
  const current = healthy(profile(original)), before = structuredClone(current.profile);
  const plan = planSketchOffset(current.profile,
    ['circle-a', 'circle-b'].map(id => ({ kind: 'entity', id })), parameters);
  expect(plan.changed, plan.message).toBe(true);
  expect(plan.sourceProfile).toBe(current.profile);
  expect(current.profile).toEqual(before);
  expect(serializeDocument(original)).toBe(originalBytes);
  const application = solveOffsetApplication(current, plan);
  if (!application.accepted) throw new Error(application.message);
  const document = updateFeature(original, sketchId, { profile: application.solution.profile });
  expect(profile(document).constraints.filter(constraint => constraint.type === 'equalOffsetDistance')).toHaveLength(1);
  expect(profile(document).constraints.filter(constraint => constraint.type === 'offsetDistance')).toHaveLength(1);
  expect(profile(document).entities.filter(entity => entity.construction)).toHaveLength(2);
  return addFeature(document, { id: solidId, name: 'Finite plate thickness', type: 'extrude',
    sketchId, depth: 4, symmetric: false, suppressed: false });
}
function imageId(document: Document, sourceId: string): string {
  const relation = profile(document).constraints.find(constraint =>
    constraint.type === 'offset' && constraint.sources.some(source => source.entityId === sourceId));
  if (relation?.type !== 'offset' || relation.images.length !== 1 || relation.images[0].entityIds.length !== 1) {
    throw new Error('Single circular offset image expected.');
  }
  return relation.images[0].entityIds[0];
}
function savedIds(document: Document) {
  const target = profile(document);
  return { points: target.points.map(point => point.id), entities: target.entities.map(entity => entity.id),
    constraints: target.constraints.map(constraint => constraint.id) };
}
function edit(document: Document, settings: Settings): Document {
  const target = structuredClone(profile(document));
  for (const constraint of target.constraints) {
    if (constraint.type === 'offsetDistance') constraint.value = settings.distance;
    else if (constraint.type === 'radius' && constraint.id === 'radius-a') constraint.value = settings.sourceA;
    else if (constraint.type === 'radius' && constraint.id === 'radius-b') constraint.value = settings.sourceB;
    else if (constraint.type === 'fix' && constraint.id === 'fixed-center-a') constraint.x = settings.centerA;
    else if (constraint.type === 'fix' && constraint.id === 'fixed-center-b') constraint.x = settings.centerB;
  }
  const changed = updateFeature(document, sketchId, { profile: healthy(target).profile });
  for (const [source, radius, centerX] of [
    ['circle-a', settings.sourceA + settings.distance, settings.centerA],
    ['circle-b', settings.sourceB + settings.distance, settings.centerB],
  ] as const) {
    const circle = required(profile(changed).entities.find(entity => entity.id === imageId(changed, source)));
    if (circle.type !== 'circle') throw new Error('Circular image expected.');
    const center = circle.center === 'origin' ? { x: 0, y: 0 } :
      required(profile(changed).points.find(point => point.id === circle.center));
    expect(Math.abs(circle.radius - radius)).toBeLessThan(coordinateTolerance);
    expect(Math.abs(center.x - centerX)).toBeLessThan(coordinateTolerance);
    expect(Math.abs(center.y)).toBeLessThan(coordinateTolerance);
  }
  return changed;
}
function expected(settings: Settings): Metrics {
  const a = settings.sourceA + settings.distance, b = settings.sourceB + settings.distance;
  const section = 1000 - Math.PI * (a * a + b * b), perimeter = 140 + 2 * Math.PI * (a + b);
  return { volume: 4 * section, area: 2 * section + 4 * perimeter, bounds: [[-10, -10, 0], [40, 10, 4]] };
}
function build(document: Document, expectedWarnings: readonly string[] = []): CadResult {
  const before = structuredClone(document), result = engine.build(document.features);
  expect(document).toEqual(before);
  expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual(expectedWarnings);
  return result;
}
function near(actual: number, wanted: number, tolerance = cadTolerance): void {
  expect(Math.abs(actual - wanted)).toBeLessThanOrEqual(tolerance);
}
function expectBounds(actual: Metrics['bounds'], wanted: Metrics['bounds']): void {
  actual.forEach((side, i) => side.forEach((value, j) => near(value, wanted[i][j])));
}
function measure(shape: Shape3D, solidCount = 1): Metrics {
  const [own, cleanup] = localGC();
  try {
    const oc = getOC(), analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    const mass = own(new oc.GProp_GProps()), surface = own(measureShapeSurfaceProperties(shape));
    const box = own(shape.boundingBox), solids = shape.solids;
    solids.forEach(own);
    expect(solids).toHaveLength(solidCount);
    expect(analyzer.IsValid()).toBe(true);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    return { volume: mass.Mass(), area: surface.area, bounds: box.bounds };
  } finally { cleanup(); }
}
function expectNativeRims(shape: Shape3D, wanted: readonly RimGeometry[]): void {
  const [own, cleanup] = localGC();
  try {
    const edges = shape.edges; edges.forEach(own);
    const curves = edges.map(edge => own(edge.curve));
    const circles = curves.filter(curve => curve.curveType === 'CIRCLE' && curve.isClosed);
    for (const rim of wanted) {
      const matches = circles.filter(edge => Array.from({ length: 8 }, (_, index) => index / 8).every(parameter => {
        // pointAt evaluates the native curve; no tessellation or Float32 conversion.
        const [x, y, z] = own(edge.pointAt(parameter)).toTuple();
        return Math.abs(Math.hypot(x - rim.centerX, y) - rim.radius) <= coordinateTolerance &&
          Math.abs(z - rim.z) <= coordinateTolerance;
      }));
      expect(matches, `Native closed circle at x=${rim.centerX}, r=${rim.radius}, z=${rim.z}`).toHaveLength(1);
    }
  } finally { cleanup(); }
}
async function freshStep(document: Document, wanted: Metrics, solidCount = 1,
  rims: readonly RimGeometry[] = []): Promise<void> {
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  // Explicit features force reconstruction in a fresh engine, rather than exporting a preview.
  const shape = await importSTEP(engine.export('step', reopened.features));
  try {
    if (!isShape3D(shape)) throw new Error('Fresh STEP must contain a three-dimensional shape.');
    const actual = measure(shape, solidCount);
    near(actual.volume, wanted.volume); near(actual.area, wanted.area);
    expectBounds(actual.bounds, wanted.bounds);
    if (rims.length) expectNativeRims(shape, rims);
  } finally { shape.delete(); }
}
function sameReference(a: EdgeReference | FaceReference, b: EdgeReference | FaceReference): boolean {
  return a.sourceFeatureId === b.sourceFeatureId && a.key === b.key;
}
function displayRoundoff(value: number): number {
  // meshEdges reads native coordinates through Float32Array. Half a Float32
  // ULP bounds each coordinate's rounding; keep the native oracle at 5e-7.
  return Math.max(2 ** (Math.floor(Math.log2(Math.abs(value))) - 24), 2 ** -150);
}
function radial(edge: PickableEdge, centerX: number, radius: number, z: number): boolean {
  return edge.lines.length >= 12 && edge.lines.every((coordinate, index, points) => {
    if (index % 3 !== 0) return true;
    const y = points[index + 1], currentZ = points[index + 2];
    if (![coordinate, y, currentZ].every(Number.isFinite)) return false;
    return Math.abs(Math.hypot(coordinate - centerX, y) - radius) <= coordinateTolerance +
      Math.hypot(displayRoundoff(coordinate), displayRoundoff(y)) &&
      Math.abs(currentZ - z) <= coordinateTolerance + displayRoundoff(currentZ);
  });
}
function endRim(result: CadResult, radius = 3): PickableEdge {
  const matches = result.edges.filter(edge => radial(edge, 0, radius, 4));
  expect(matches).toHaveLength(1);
  expect(matches[0].ref.key).toMatch(/^edge-v2\|/);
  return matches[0];
}
function endCap(result: CadResult): PickableFace {
  const matches = (result.faces ?? []).filter(face => face.frame &&
    Math.abs(face.frame.origin[2] - 4) < coordinateTolerance && Math.abs(face.frame.normal[2] - 1) < coordinateTolerance);
  expect(matches).toHaveLength(1);
  expect(matches[0].ref.key).toMatch(/^face-v2\|/);
  return matches[0];
}
function aliases(result: CadResult): void {
  const faces = result.faces ?? [];
  expect(faces).toHaveLength(8); expect(result.edges).toHaveLength(18);
  expect(faces.every(face => face.ref.key.startsWith('face-v2|'))).toBe(true);
  expect(result.edges.filter(edge => edge.ref.key.startsWith('edge-v2|'))).toHaveLength(12);
  expect(result.edges.filter(edge => edge.ref.key.startsWith('edge-v1|'))).toHaveLength(6);
  for (const [entries, kind] of [[faces, 'face'], [result.edges, 'edge']] as const) {
    expect(new Set(entries.map(entry => entry.ref.key)).size).toBe(entries.length);
    const legacyAliases = entries.flatMap(entry => entry.aliases ?? []);
    expect(new Set(legacyAliases.map(ref => ref.key)).size).toBe(legacyAliases.length);
    for (const entry of entries.filter(entry => entry.ref.key.startsWith(`${kind}-v2|`))) {
      expect(entry.ref.sourceFeatureId).toBe(solidId);
      expect(entry.aliases).toHaveLength(1);
      expect(entry.aliases?.[0].key).toMatch(new RegExp(`^${kind}-v1\\|`));
      expect(entry.aliases?.[0].sourceFeatureId).toBe(solidId);
    }
  }
}
function expectTargets(result: CadResult, rim: EdgeReference, cap: FaceReference, settings: Settings): void {
  const currentRim = required(result.edges.find(edge => sameReference(edge.ref, rim)));
  expect(radial(currentRim, settings.centerA, settings.sourceA + settings.distance, 4)).toBe(true);
  // Also establish that the other hole remains at its independently edited center/radius.
  expect(result.edges.filter(edge => radial(edge, settings.centerB, settings.sourceB + settings.distance, 4))).toHaveLength(1);
  const currentCap = required(result.faces?.find(face => sameReference(face.ref, cap)));
  expect(currentCap.frame).toEqual({ origin: [0, 0, 4], xDirection: [1, 0, 0], normal: [0, 0, 1] });
  near(result.volume, expected(settings).volume);
  expectBounds([result.bounds.min, result.bounds.max], expected(settings).bounds);
}
function finish(document: Document, reference: EdgeReference, type: 'fillet' | 'chamfer' = 'fillet', size = 0.25): Document {
  return addFeature(document, { id: 'selected-finish', name: 'Selected current hole A rim', type,
    baseFeatureId: solidId, size, selection: { mode: 'selected', edges: [reference] }, suppressed: false });
}
function remember(document: Document, rim: EdgeReference, cap: FaceReference): Document {
  return addFeature(addFeature(document, { id: 'saved-finish', name: 'Saved inactive rim selection', type: 'fillet',
    baseFeatureId: solidId, size: 0.25, selection: { mode: 'selected', edges: [rim] }, suppressed: true }),
  { id: 'saved-support', name: 'Saved inactive planar support', type: 'sketch', plane: 'XY', offset: 0,
    support: { kind: 'face', face: cap }, profile: { kind: 'circle', center: [30, 0], radius: 1 }, suppressed: true });
}
function expectRemembered(document: Document, rim: EdgeReference, cap: FaceReference): void {
  const savedFinish = document.features.find(feature => feature.id === 'saved-finish');
  const savedSupport = document.features.find(feature => feature.id === 'saved-support');
  if (savedFinish?.type !== 'fillet' || savedFinish.selection.mode !== 'selected' || savedSupport?.type !== 'sketch') {
    throw new Error('Saved selection fixture expected.');
  }
  expect(savedFinish.selection.edges).toEqual([rim]);
  expect(savedSupport.support).toEqual({ kind: 'face', face: cap });
}

it('keeps semantic targets and saved IDs through actual offset edits, reopen, undo and redo', async () => {
  let document = specimen();
  const initial = build(document), rim = endRim(initial).ref, cap = endCap(initial).ref;
  aliases(initial);
  const identity = savedIds(document), imageA = imageId(document, 'circle-a'), imageB = imageId(document, 'circle-b');
  document = remember(document, rim, cap);
  const history = new DocumentHistory(document);
  for (const settings of edits) {
    document = edit(document, settings);
    expect(savedIds(document)).toEqual(identity);
    expect(imageId(document, 'circle-a')).toBe(imageA); expect(imageId(document, 'circle-b')).toBe(imageB);
    history.apply(document);
    const reopened = parseDocument(serializeDocument(document));
    expectRemembered(reopened, rim, cap);
    const current = build(reopened);
    aliases(current); expectTargets(current, rim, cap, settings);
    await freshStep(reopened, expected(settings), 1, [
      { centerX: settings.centerA, radius: settings.sourceA + settings.distance, z: 4 },
      { centerX: settings.centerB, radius: settings.sourceB + settings.distance, z: 4 },
    ]);
  }
  const previous = history.undo();
  expect(savedIds(previous)).toEqual(identity); expectRemembered(previous, rim, cap);
  expectTargets(build(previous), rim, cap, edits[edits.length - 2]);
  const restored = history.redo();
  expect(savedIds(restored)).toEqual(identity); expectRemembered(restored, rim, cap);
  expectTargets(build(parseDocument(serializeDocument(restored))), rim, cap, edits[edits.length - 1]);
}, 60_000);

function expectedFinish(settings: Settings, type: 'fillet' | 'chamfer', size: number): Metrics {
  const wanted = expected(settings), radius = settings.sourceA + settings.distance;
  if (type === 'chamfer') {
    // Revolution of the triangular removed section, at the top inner rim.
    wanted.volume -= Math.PI * (radius * size ** 2 + size ** 3 / 3);
    wanted.area += Math.PI * ((2 * Math.SQRT2 - 4) * radius * size + (Math.SQRT2 - 1) * size ** 2);
  } else {
    // Revolve A=f^2*(1-pi/4), Mx=f^3*(5/6-pi/4): removed V=2*pi*(r*A+Mx).
    // The replacement quarter-torus area gives the independent surface delta.
    wanted.volume -= Math.PI * (radius * size ** 2 * (2 - Math.PI / 2) + size ** 3 * (5 / 3 - Math.PI / 2));
    wanted.area += (Math.PI ** 2 - 4 * Math.PI) * radius * size + (Math.PI ** 2 - 3 * Math.PI) * size ** 2;
  }
  return wanted;
}
for (const type of ['fillet', 'chamfer'] as const) {
  it(`keeps a selected hole-A ${type} after offset, source radius, center and radius-order edits`, async () => {
    let document = specimen();
    const rim = endRim(build(document)).ref, size = 0.25;
    // Create the active finish once; history edits retain this exact saved selection.
    document = finish(document, rim, type, size);
    const identity = savedIds(document), history = new DocumentHistory(document);
    const check = async (saved: Document, settings: Settings) => {
      const reopened = parseDocument(serializeDocument(saved));
      expect(savedIds(reopened)).toEqual(identity);
      const active = reopened.features.find(feature => feature.id === 'selected-finish');
      if (active?.type !== 'fillet' && active?.type !== 'chamfer') {
        throw new Error('Active saved edge finish expected.');
      }
      expect(active.type).toBe(type); expect(active.suppressed).toBe(false); expect(active.size).toBe(size);
      expect(active.selection).toEqual({ mode: 'selected', edges: [rim] });
      const result = build(reopened), wanted = expectedFinish(settings, type, size);
      expectBounds([result.bounds.min, result.bounds.max], wanted.bounds);
      expect(result.edges.every(edge => edge.ref.key.startsWith('edge-v1|'))).toBe(true);
      expect(result.faces?.every(face => face.ref.key.startsWith('face-v1|'))).toBe(true);
      // Native mass is measured on the fresh STEP B-rep, not inferred from the mesh/DTO.
      await freshStep(reopened, wanted);
    };
    for (const settings of edits) {
      document = edit(document, settings); history.apply(document);
      await check(document, settings);
    }
    await check(history.undo(), edits[edits.length - 2]);
    await check(history.redo(), edits[edits.length - 1]);
  }, 60_000);
}

function historicalBoss(document: Document, cap: FaceReference): Document {
  let result = addFeature(document, { id: 'boss-sketch', name: 'Original supported 4 x 4 boss', type: 'sketch',
    plane: 'XY', offset: 0, support: { kind: 'face', face: cap },
    profile: { kind: 'rectangle', width: 4, height: 4, center: [30, 0] }, suppressed: false });
  result = addFeature(result, { id: 'boss', name: 'Boss from original cap', type: 'extrude',
    sketchId: 'boss-sketch', depth: 4, symmetric: false, suppressed: false });
  result = addFeature(result, { id: 'cut-sketch', name: 'Original R1 boss bore', type: 'sketch',
    plane: 'XY', offset: 8, profile: { kind: 'circle', center: [30, 0], radius: 1 }, suppressed: false });
  return addFeature(result, { id: 'cut-to-original-cap', name: 'Blind cut to historical cap', type: 'cut',
    sketchId: 'cut-sketch', depth: -4, symmetric: false,
    endCondition: { kind: 'upToSurface', target: { kind: 'face', face: cap } }, suppressed: false });
}
it('uses the historical v2 cap for a supported boss and a native up-to-surface cut after edits and history', async () => {
  const initial = specimen(), cap = endCap(build(initial)).ref;
  let document = historicalBoss(initial, cap);
  const history = new DocumentHistory(document);
  const checked = [edits[0], edits[2], edits[3], edits[4]];
  const check = async (saved: Document, settings: Settings) => {
    const reopened = parseDocument(serializeDocument(saved)), result = build(reopened), wanted = expected(settings);
    wanted.volume += 64 - 4 * Math.PI; wanted.area += 64 + 8 * Math.PI;
    wanted.bounds = [[-10, -10, 0], [40, 10, 8]];
    near(result.volume, wanted.volume); expectBounds([result.bounds.min, result.bounds.max], wanted.bounds);
    // Boolean outputs have their own legacy identity; source prism metadata is not inherited.
    expect(result.faces?.every(face => face.ref.key.startsWith('face-v1|'))).toBe(true);
    expect(result.edges.every(edge => edge.ref.key.startsWith('edge-v1|'))).toBe(true);
    const support = reopened.features.find(feature => feature.id === 'boss-sketch');
    const cut = reopened.features.find(feature => feature.id === 'cut-to-original-cap');
    expect(support?.type === 'sketch' && support.support).toEqual({ kind: 'face', face: cap });
    expect(cut?.type === 'cut' && cut.endCondition).toEqual({ kind: 'upToSurface', target: { kind: 'face', face: cap } });
    await freshStep(reopened, wanted);
  };
  for (const settings of checked) {
    document = edit(document, settings); history.apply(document);
    await check(document, settings);
  }
  await check(history.undo(), checked[checked.length - 2]);
  await check(history.redo(), checked[checked.length - 1]);
}, 60_000);

function expectRejectedFinish(document: Document, rim: EdgeReference): CadResult {
  const bare = build(document), rejected = engine.build(finish(document, rim).features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual(['selected-finish']);
  expect(rejected.featureErrors[0].message).toMatch(/arista|referencia/i);
  near(rejected.volume, bare.volume);
  expect(rejected.faces).toEqual(bare.faces); expect(rejected.edges).toEqual(bare.edges);
  expect(() => engine.export('step')).toThrow(/errores/);
  return bare;
}
for (const variant of [
  { name: 'negative direction', depth: -4, symmetric: false, bounds: [[-10, -10, -4], [40, 10, 0]] },
  { name: 'symmetric placement', depth: 4, symmetric: true, bounds: [[-10, -10, -2], [40, 10, 2]] },
] as const) {
  it(`builds a valid ${variant.name} prism while rejecting its former positive end-rim reference`, async () => {
    const original = specimen(), rim = endRim(build(original)).ref;
    const changed = updateFeature(original, solidId, { depth: variant.depth, symmetric: variant.symmetric });
    const result = expectRejectedFinish(changed, rim), wanted = expected(edits[0]);
    wanted.bounds = variant.bounds;
    expect(result.edges.some(edge => sameReference(edge.ref, rim))).toBe(false);
    expect(result.edges.filter(edge => edge.ref.key.startsWith('edge-v2|'))).toHaveLength(12);
    await freshStep(changed, wanted);
  }, 60_000);
}

function plainPlate(): Document {
  const original = specimen(), target = structuredClone(profile(original));
  target.entities = target.entities.filter(entity => !entity.construction);
  target.constraints = [];
  return updateFeature(original, sketchId, { profile: target });
}
it('rejects saved rim and cap references after deleting and recreating an actual offset image', async () => {
  const original = specimen(), initial = build(original);
  const rim = endRim(initial).ref, cap = endCap(initial).ref;
  const remembered = remember(original, rim, cap);
  const oldImageA = imageId(remembered, 'circle-a'), imageB = imageId(remembered, 'circle-b');
  const originalProfile = structuredClone(profile(remembered));
  const deleted = removeSelection(profile(remembered), [{ kind: 'entity', id: oldImageA }]);
  expect(profile(remembered)).toEqual(originalProfile);
  expect(deleted.entities.some(entity => entity.id === oldImageA)).toBe(false);
  expect(deleted.entities.some(entity => entity.id === 'circle-a' && entity.construction)).toBe(true);
  expect(deleted.constraints.filter(constraint => constraint.type === 'offset')).toHaveLength(1);
  expect(deleted.constraints.filter(constraint => constraint.type === 'offsetDistance')).toHaveLength(0);
  expect(deleted.constraints.filter(constraint => constraint.type === 'equalOffsetDistance')).toHaveLength(0);
  const intermediate = updateFeature(remembered, sketchId, { profile: healthy(deleted).profile });
  expect(imageId(intermediate, 'circle-b')).toBe(imageB);
  const current = healthy(profile(intermediate));
  const plan = planSketchOffset(current.profile, [{ kind: 'entity', id: 'circle-a' }],
    { ...parameters, distance: 1.5 });
  expect(plan.changed, plan.message).toBe(true);
  expect(plan.sourceProfile).toBe(current.profile);
  const application = solveOffsetApplication(current, plan);
  if (!application.accepted) throw new Error(application.message);
  const recreated = parseDocument(serializeDocument(updateFeature(intermediate, sketchId,
    { profile: application.solution.profile })));
  expect(imageId(recreated, 'circle-a')).not.toBe(oldImageA);
  expect(imageId(recreated, 'circle-b')).toBe(imageB);
  expect(profile(recreated).entities.some(entity => entity.id === oldImageA)).toBe(false);
  expect(profile(recreated).constraints.filter(constraint => constraint.type === 'offsetDistance')
    .map(constraint => constraint.value)).toEqual([1.5]);
  expect(profile(recreated).constraints.filter(constraint => constraint.type === 'equalOffsetDistance')).toHaveLength(0);
  expectRemembered(recreated, rim, cap);
  const bare = expectRejectedFinish(recreated, rim);
  expect(bare.edges.some(edge => sameReference(edge.ref, rim))).toBe(false);
  expect(bare.faces?.some(face => sameReference(face.ref, cap))).toBe(false);
  const rejectedSupport = engine.build(updateFeature(recreated, 'saved-support', { suppressed: false }).features);
  expect(rejectedSupport.featureErrors.map(error => error.id)).toEqual(['saved-support']);
  expect(rejectedSupport.featureErrors[0].message).toMatch(/cara|referencia|soporte/i);
  near(rejectedSupport.volume, bare.volume);
  expect(rejectedSupport.faces).toEqual(bare.faces); expect(rejectedSupport.edges).toEqual(bare.edges);
  expect(() => engine.export('step')).toThrow(/errores/);
  // Deletion removes A's driver and the shared family; recreation adds only A's new driver.
  // R3.5 and the surviving R6 hole give independent V/A, not an identity-only experiment.
  await freshStep(recreated, { volume: 4000 - 193 * Math.PI, area: 2560 - 20.5 * Math.PI,
    bounds: [[-10, -10, 0], [40, 10, 4]] }, 1,
  [{ centerX: 0, radius: 3.5, z: 4 }, { centerX: 20, radius: 6, z: 4 }]);
}, 60_000);

it('rejects a deleted and recreated circular entity even when its bare geometry is identical', async () => {
  const original = plainPlate(), rim = endRim(build(original)).ref, target = structuredClone(profile(original));
  // Remove the actual material entity and create identical geometry with a new saved identity.
  const source = required(target.entities.find(entity => entity.type === 'circle' && Math.abs(entity.radius - 3) < coordinateTolerance));
  target.entities = target.entities.filter(entity => entity.id !== source.id);
  target.entities.push({ ...source, id: 'recreated-hole-with-new-identity' });
  expect(target.entities.some(entity => entity.id === source.id)).toBe(false);
  const changed = updateFeature(original, sketchId, { profile: target });
  const result = expectRejectedFinish(changed, rim);
  expect(result.edges.some(edge => sameReference(edge.ref, rim))).toBe(false);
  await freshStep(changed, expected(edits[0]));
}, 60_000);

it('rejects a former circle rim after replacing it with a valid semicircular D-hole', async () => {
  const original = plainPlate(), rim = endRim(build(original)).ref, target = structuredClone(profile(original));
  const source = required(target.entities.find(entity => entity.type === 'circle' && Math.abs(entity.radius - 3) < coordinateTolerance));
  const index = target.entities.indexOf(source);
  if (source.type !== 'circle') throw new Error('Original circular hole expected.');
  target.points.push({ id: 'd-right', x: 3, y: 0 }, { id: 'd-left', x: -3, y: 0 });
  target.entities[index] = { id: source.id, type: 'arc', center: source.center,
    start: 'd-right', end: 'd-left', clockwise: false, construction: false };
  target.entities.push({ id: 'd-chord', type: 'line', start: 'd-left', end: 'd-right', construction: false });
  const changed = updateFeature(original, sketchId, { profile: target });
  const result = expectRejectedFinish(changed, rim);
  expect(result.edges.some(edge => sameReference(edge.ref, rim))).toBe(false);
  // The replacement removes a half disk R3, plus the unchanged disk R6.
  const section = 1000 - Math.PI * (9 / 2 + 36), perimeter = 140 + 3 * Math.PI + 6 + 12 * Math.PI;
  await freshStep(changed, { volume: 4 * section, area: 2 * section + 4 * perimeter,
    bounds: [[-10, -10, 0], [40, 10, 4]] });
}, 60_000);

it('suppresses the only prism without retaining a solid, selections or exportable geometry', () => {
  const original = specimen(); build(original);
  const result = build(updateFeature(original, solidId, { suppressed: true }));
  expect(result.volume).toBe(0); expect(result.faces).toEqual([]); expect(result.edges).toEqual([]);
  expect(() => engine.export('step')).toThrow(/ningún sólido/);
}, 60_000);

it('keeps the last valid prism and its semantic picking after an invalid finish size', () => {
  const original = specimen(), before = build(original), rim = endRim(before).ref;
  const validFinish = finish(original, rim);
  // Bypass only document validation to exercise the engine's independent guard.
  // addFeature deliberately rejects zero size before native reconstruction.
  const invalidFeatures = validFinish.features.map(feature =>
    feature.id === 'selected-finish' && feature.type === 'fillet' ? { ...feature, size: 0 } : feature);
  const failed = engine.build(invalidFeatures);
  expect(validFinish.features.find(feature => feature.id === 'selected-finish')).toMatchObject({ size: 0.25 });
  expect(failed.featureErrors.map(error => error.id)).toEqual(['selected-finish']);
  near(failed.volume, expected(edits[0]).volume);
  expect(failed.faces).toEqual(before.faces); expect(failed.edges).toEqual(before.edges);
  aliases(failed);
  expect(() => engine.export('step')).toThrow(/errores/);
}, 60_000);

it('propagates a native primitive Shape failure without retrying the legacy geometry path', () => {
  const document = specimen();
  const shape = vi.spyOn(getOC().BRepPrimAPI_MakePrism.prototype, 'Shape')
    .mockImplementation(() => { throw new Error('Injected primitive Shape failure'); });
  const result = engine.build(document.features);
  expect(shape).toHaveBeenCalledTimes(1);
  expect(result.featureErrors).toEqual([{ id: solidId, message: expect.stringContaining('Injected primitive Shape failure') }]);
  expect(result.volume).toBe(0); expect(result.faces).toEqual([]); expect(result.edges).toEqual([]);
}, 60_000);

it('keeps valid legacy geometry on a Generated failure but rejects a stored semantic selection', async () => {
  const document = specimen(), rim = endRim(build(document)).ref;
  const generated = vi.spyOn(getOC().BRepPrimAPI_MakePrism.prototype, 'Generated')
    .mockImplementation(() => { throw new Error('Injected primitive Generated failure'); });
  const bare = build(document);
  expect(generated).toHaveBeenCalled();
  near(bare.volume, expected(edits[0]).volume);
  expect(bare.faces?.every(face => face.ref.key.startsWith('face-v1|'))).toBe(true);
  expect(bare.edges.every(edge => edge.ref.key.startsWith('edge-v1|'))).toBe(true);
  expect(bare.edges.some(edge => sameReference(edge.ref, rim))).toBe(false);
  await freshStep(document, expected(edits[0]));
  const rejected = engine.build(finish(document, rim).features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual(['selected-finish']);
  near(rejected.volume, bare.volume);
  expect(rejected.edges).toEqual(bare.edges);
}, 60_000);

it('keeps two separated circular material regions on the legacy two-solid path', async () => {
  const target: EntityProfile = { kind: 'entities', points: [{ id: 'other-center', x: 5, y: 0 }], entities: [
    { id: 'region-a', type: 'circle', center: 'origin', radius: 1, construction: false },
    { id: 'region-b', type: 'circle', center: 'other-center', radius: 1, construction: false },
  ], constraints: [] };
  const document = validateDocument({ ...createDocument('Original separated circular regions'), features: [
    { id: sketchId, type: 'sketch', name: 'Two separated disks', plane: 'XY', offset: 0, profile: target, suppressed: false },
    { id: solidId, type: 'extrude', name: 'Two separate prisms', sketchId, depth: 4, symmetric: false, suppressed: false },
  ] });
  const result = build(document, ['La pieza contiene 2 sólidos separados.']);
  near(result.volume, 8 * Math.PI);
  expect(result.faces?.every(face => face.ref.key.startsWith('face-v1|'))).toBe(true);
  expect(result.edges.every(edge => edge.ref.key.startsWith('edge-v1|'))).toBe(true);
  await freshStep(document, { volume: 8 * Math.PI, area: 20 * Math.PI, bounds: [[-1, -1, 0], [6, 1, 4]] }, 2);
}, 60_000);
