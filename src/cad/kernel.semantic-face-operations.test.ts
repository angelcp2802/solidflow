import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EntityProfile } from '../sketch/types';
import { draftSolid, shellSolid } from './kernel.face-operations';
import { entityProfilePrismWithProvenance } from './kernel.provenance';
import { principalPlaneFrame } from './kernel.frames';
import { createFaceCatalog } from './kernel.faces';
import * as catalogs from './kernel.semantic-catalogs';
import type { EntityPrismContextV2 } from './kernel.semantic-references';
import type { DraftFeature, FaceReference, PlaneFrame, ShellFeature } from './kernel.types';

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => vi.restoreAllMocks());

// Original Cartesian fixtures authored here in millimeters. All oracles below
// come from rectangular cavities and circular frusta, with no imported model.
const tolerance = 5e-6;
const context: EntityPrismContextV2 = {
  sourceFeatureId: 'extrude', sketchFeatureId: 'sketch', history: [
    { id: 'sketch', type: 'sketch', suppressed: false, plane: 'XY' },
    { id: 'extrude', type: 'extrude', suppressed: false, sketchId: 'sketch', symmetric: false, direction: 'positive' },
  ],
};

function rectangle(width = 10): EntityProfile {
  return { kind: 'entities', points: [
    { id: 'p0', x: 0, y: 0 }, { id: 'p1', x: width, y: 0 },
    { id: 'p2', x: width, y: 6 }, { id: 'p3', x: 0, y: 6 },
  ], entities: [
    { id: 'bottom', type: 'line', start: 'p0', end: 'p1', construction: false },
    { id: 'right', type: 'line', start: 'p1', end: 'p2', construction: false },
    { id: 'top', type: 'line', start: 'p2', end: 'p3', construction: false },
    { id: 'left', type: 'line', start: 'p3', end: 'p0', construction: false },
  ], constraints: [] };
}

function plate(radiusA = 3, radiusB = 6, centerA = 0): EntityProfile {
  const profile = rectangle(50);
  profile.points = [
    { id: 'p0', x: -10, y: -10 }, { id: 'p1', x: 40, y: -10 },
    { id: 'p2', x: 40, y: 10 }, { id: 'p3', x: -10, y: 10 },
    { id: 'center-a', x: centerA, y: 0 }, { id: 'center-b', x: 20, y: 0 },
  ];
  profile.entities.push(
    { id: 'hole-a', type: 'circle', center: 'center-a', radius: radiusA, construction: false },
    { id: 'hole-b', type: 'circle', center: 'center-b', radius: radiusB, construction: false },
  );
  return profile;
}

function specimen(profile: EntityProfile) {
  const owner = entityProfilePrismWithProvenance(profile, 'XY', 0, 4);
  try {
    const prepared = catalogs.preparePrismReferencesV2(profile, context, owner.provenance);
    if (prepared.status !== 'verified') throw new Error(prepared.diagnostic);
    return { owner, references: prepared.references };
  } catch (error) { owner.dispose(); throw error; }
}
type Specimen = ReturnType<typeof specimen>;

function faceReference(current: Specimen, role: 'endCap' | 'side', entityId?: string): FaceReference {
  const entry = current.references.faces.find(binding => binding.role.role === role &&
    (binding.role.role !== 'side' || binding.role.entityId === entityId));
  if (!entry) throw new Error('Missing original fixture role.');
  return { ...entry.ref };
}

function legacyAlias(current: Specimen, reference: FaceReference): FaceReference {
  const catalog = catalogs.createSemanticFaceCatalog(current.owner.shape, 'extrude', 'legacy-lineage', current.references);
  try {
    const entry = catalog.entries.find(item => item.ref.key === reference.key);
    if (!entry) throw new Error('Missing current alias.');
    return { ...entry.aliases[0] };
  } finally { catalog.dispose(); }
}

function shell(reference: FaceReference): ShellFeature {
  return { id: 'shell', name: 'Open rectangular cavity', type: 'shell', suppressed: false,
    baseFeatureId: 'extrude', thickness: 1, direction: 'inward', removedFaces: [reference] };
}
function draft(reference: FaceReference): DraftFeature {
  return { id: 'draft', name: 'One hole taper', type: 'draft', suppressed: false,
    baseFeatureId: 'extrude', angle: 5, reversed: false, propagation: 'tangent',
    support: { kind: 'principal', plane: 'XY' }, faces: [reference] };
}

function exactVolume(shape: Shape3D): number {
  const oc = getOC(), properties = new oc.GProp_GProps();
  try { oc.BRepGProp.VolumeProperties(shape.wrapped, properties, 1e-10, false, false); return properties.Mass(); }
  finally { properties.delete(); }
}

function validate(shape: Shape3D): number {
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false), solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true);
    expect(solids).toHaveLength(1);
    const volume = exactVolume(shape);
    expect(volume).toBeGreaterThan(0);
    return volume;
  } finally { analyzer.delete(); solids.forEach(solid => solid.delete()); }
}

function metrics(shape: Shape3D, expectedVolume: number, expectedArea: number, bounds: number[]): void {
  expect(Math.abs(validate(shape) - expectedVolume)).toBeLessThan(tolerance);
  const surface = measureShapeSurfaceProperties(shape), box = shape.boundingBox;
  try {
    expect(Math.abs(surface.area - expectedArea)).toBeLessThan(tolerance);
    box.bounds.flat().forEach((value, index) => expect(Math.abs(value - bounds[index])).toBeLessThan(tolerance));
  } finally { surface.delete(); box.delete(); }
}

function cavityMetrics(shape: Shape3D, width: number): void {
  // Exterior minus the 1 mm inset cavity, whose floor is z=1 and opening is z=4.
  metrics(shape, width * 6 * 4 - (width - 2) * 4 * 3,
    2 * width * 6 + 2 * 4 * (width + 6) + 2 * 3 * (width + 2), [0, 0, 0, width, 6, 4]);
}

function taperedHoleMetrics(shape: Shape3D, radiusA: number, radiusB: number, centerA: number): void {
  const height = 4, endRadius = radiusA + height * Math.tan(5 * Math.PI / 180);
  const coneVolume = Math.PI * height / 3 * (radiusA ** 2 + radiusA * endRadius + endRadius ** 2);
  const expectedVolume = 4000 - coneVolume - Math.PI * height * radiusB ** 2;
  const planarArea = 2000 - Math.PI * (radiusA ** 2 + endRadius ** 2 + 2 * radiusB ** 2);
  const coneArea = Math.PI * (radiusA + endRadius) * Math.hypot(height, endRadius - radiusA);
  metrics(shape, expectedVolume, planarArea + 560 + coneArea + 2 * Math.PI * radiusB * height,
    [-10, -10, 0, 40, 10, 4]);
  const faces = shape.faces;
  try {
    const cones = faces.filter(face => face.geomType === 'CONE');
    const cylinders = faces.filter(face => face.geomType === 'CYLINDRE');
    expect(cones).toHaveLength(1); expect(cylinders).toHaveLength(1);
    for (const [face, expected] of [
      [cones[0], [centerA - endRadius, -endRadius, 0, centerA + endRadius, endRadius, 4]],
      [cylinders[0], [20 - radiusB, -radiusB, 0, 20 + radiusB, radiusB, 4]],
    ] as const) {
      const box = face.boundingBox;
      try { box.bounds.flat().forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(tolerance)); }
      finally { box.delete(); }
    }
  } finally { faces.forEach(face => face.delete()); }
}

describe('semantic selections consumed by shell and draft', () => {
  it('keeps the saved generation end cap when a rectangular source width changes', () => {
    const initial = specimen(rectangle());
    try {
      const saved = faceReference(initial, 'endCap');
      for (const width of [10, 12]) {
        const current = specimen(rectangle(width));
        let result: Shape3D | undefined;
        try {
          result = shellSolid(current.owner.shape, shell(saved), 'legacy-lineage', validate, current.references);
          cavityMetrics(result, width);
          expect(validate(current.owner.shape)).toBeCloseTo(width * 6 * 4, 7);
        } finally { result?.delete(); expect(current.owner.dispose()).toEqual([]); }
      }
    } finally { expect(initial.owner.dispose()).toEqual([]); }
  }, 60_000);

  it('tapers the same hole after radius, position and radius-order edits', () => {
    const initial = specimen(plate());
    try {
      const saved = faceReference(initial, 'side', 'hole-a');
      for (const [a, b, x] of [[3, 6, 0], [3.5, 6.5, -1], [6, 3, 0]]) {
        const current = specimen(plate(a, b, x));
        let result: Shape3D | undefined;
        try {
          result = draftSolid(current.owner.shape, draft(saved), principalPlaneFrame('XY'), 'legacy-lineage', validate, current.references);
          taperedHoleMetrics(result, a, b, x);
          expect(Math.abs(validate(current.owner.shape) - 4 * (1000 - Math.PI * (a ** 2 + b ** 2)))).toBeLessThan(tolerance);
        } finally { result?.delete(); expect(current.owner.dispose()).toEqual([]); }
      }
    } finally { expect(initial.owner.dispose()).toEqual([]); }
  }, 60_000);

  it('keeps existing v1 selections usable with and without a verified overlay', () => {
    for (const operation of ['shell', 'draft'] as const) {
      const current = specimen(operation === 'shell' ? rectangle() : plate());
      const catalog = createFaceCatalog(current.owner.shape, 'extrude', 'legacy-lineage');
      try {
        const reference = faceReference(current, operation === 'shell' ? 'endCap' : 'side', 'hole-a');
        const alias = legacyAlias(current, reference);
        expect(catalog.entries.some(entry => entry.ref.key === alias.key)).toBe(true);
        for (const semantic of [undefined, current.references]) {
          const result = operation === 'shell'
            ? shellSolid(current.owner.shape, shell(alias), 'legacy-lineage', validate, semantic)
            : draftSolid(current.owner.shape, draft(alias), principalPlaneFrame('XY'), 'legacy-lineage', validate, semantic);
          try {
            if (operation === 'shell') cavityMetrics(result, 10);
            else taperedHoleMetrics(result, 3, 6, 0);
          } finally { result.delete(); }
        }
      } finally { catalog.dispose(); expect(current.owner.dispose()).toEqual([]); }
    }
  }, 60_000);

  it('rejects absent, foreign, recreated and mixed-alias v2 selections before modifying either source', () => {
    const initial = specimen(plate());
    const profile = plate();
    profile.entities.find(entity => entity.id === 'hole-a')!.id = 'hole-a-recreated';
    const current = specimen(profile);
    const box = specimen(rectangle());
    try {
      const saved = faceReference(initial, 'side', 'hole-a');
      expect(() => draftSolid(initial.owner.shape, draft(saved), principalPlaneFrame('XY'), 'legacy-lineage', validate)).toThrow();
      expect(() => draftSolid(current.owner.shape, draft(saved), principalPlaneFrame('XY'), 'legacy-lineage', validate, current.references)).toThrow(/identificar/);
      const cap = faceReference(box, 'endCap'), alias = legacyAlias(box, cap);
      expect(() => shellSolid(box.owner.shape, shell(cap), 'legacy-lineage', validate)).toThrow();
      expect(() => shellSolid(box.owner.shape, shell({ ...cap, sourceFeatureId: 'another-source' }),
        'legacy-lineage', validate, box.references)).toThrow(/otro sólido/);
      expect(() => shellSolid(box.owner.shape, { ...shell(cap), removedFaces: [cap, alias] },
        'legacy-lineage', validate, box.references)).toThrow(/duplicada/);
      const sideAlias = legacyAlias(initial, saved);
      expect(() => draftSolid(initial.owner.shape, { ...draft(saved), faces: [saved, sideAlias] },
        principalPlaneFrame('XY'), 'legacy-lineage', validate, initial.references)).toThrow(/duplicada/);
      expect(Math.abs(validate(initial.owner.shape) - 4 * (1000 - 45 * Math.PI))).toBeLessThan(tolerance);
      expect(Math.abs(validate(current.owner.shape) - 4 * (1000 - 45 * Math.PI))).toBeLessThan(tolerance);
      expect(validate(box.owner.shape)).toBeCloseTo(240, 7);
    } finally { initial.owner.dispose(); current.owner.dispose(); box.owner.dispose(); }
  }, 60_000);

  it('releases a partially constructed draft once and preserves both operation and catalog-release errors', () => {
    const current = specimen(plate());
    try {
      const operationError = new Error('controlled frame read failure'), releaseError = new Error('controlled catalog release failure');
      const originalFactory = catalogs.createSemanticFaceCatalog;
      let catalogReleaseAttempts = 0;
      vi.spyOn(catalogs, 'createSemanticFaceCatalog').mockImplementationOnce((...args) => {
        const catalog = originalFactory(...args), release = catalog.dispose;
        return { ...catalog, dispose() { catalogReleaseAttempts++; release(); throw releaseError; } };
      });
      const builderDelete = vi.spyOn(getOC().BRepOffsetAPI_DraftAngle.prototype, 'delete');
      const frame: PlaneFrame = { ...principalPlaneFrame('XY'), get origin(): [number, number, number] { throw operationError; } };
      let caught: unknown;
      try {
        draftSolid(current.owner.shape, draft(faceReference(current, 'side', 'hole-a')), frame,
          'legacy-lineage', validate, current.references);
      } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toEqual([operationError, releaseError]);
      expect(builderDelete).toHaveBeenCalledTimes(1);
      expect(catalogReleaseAttempts).toBe(1);
      expect(Math.abs(validate(current.owner.shape) - 4 * (1000 - 45 * Math.PI))).toBeLessThan(tolerance);
    } finally { vi.restoreAllMocks(); expect(current.owner.dispose()).toEqual([]); }
  }, 60_000);

  it('releases a completed shell candidate if catalog cleanup fails before ownership transfer', () => {
    const current = specimen(rectangle());
    try {
      const releaseError = new Error('controlled release after successful shell');
      const originalFactory = catalogs.createSemanticFaceCatalog;
      let catalogReleaseAttempts = 0;
      vi.spyOn(catalogs, 'createSemanticFaceCatalog').mockImplementationOnce((...args) => {
        const catalog = originalFactory(...args), release = catalog.dispose;
        return { ...catalog, dispose() { catalogReleaseAttempts++; release(); throw releaseError; } };
      });
      let candidateObserved = false, candidateDeleteAttempts = 0;
      const validateCandidate = (shape: Shape3D): number => {
        if (!candidateObserved) {
          candidateObserved = true;
          const release = shape.delete.bind(shape);
          vi.spyOn(shape, 'delete').mockImplementation(() => { candidateDeleteAttempts++; release(); });
        }
        return validate(shape);
      };
      let caught: unknown;
      try {
        shellSolid(current.owner.shape, shell(faceReference(current, 'endCap')), 'legacy-lineage', validateCandidate, current.references);
      } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toEqual([releaseError]);
      expect(candidateObserved).toBe(true);
      expect(candidateDeleteAttempts).toBe(1);
      expect(catalogReleaseAttempts).toBe(1);
      expect(validate(current.owner.shape)).toBeCloseTo(240, 7);
    } finally { vi.restoreAllMocks(); expect(current.owner.dispose()).toEqual([]); }
  }, 60_000);
});
