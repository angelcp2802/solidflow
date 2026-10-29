import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import { validateBodyShape } from './kernel.bodies';
import * as profiles from './kernel.profiles';
import { createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature } from '../model/document';
import type { ExtrudeFeature, Feature, SketchFeature, ThinWallDefinition, Vec3 } from './kernel.types';

// Original rectangular solids/cavities. All expectations use their independent
// Cartesian envelopes, never the extent or native builder under test.
const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url)
  .resolve('replicad-opencascadejs/wasm')), print: () => undefined })), 60_000);
afterEach(() => { vi.restoreAllMocks(); engine.dispose(); });
const near = (actual: number, expected: number, tolerance = 1e-5) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
function profile(): SketchFeature {
  return { id: 'profile', name: 'Original12x8', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [6, 4], width: 12, height: 8 } };
}
function extrusion(patch: Partial<ExtrudeFeature> = {}): ExtrudeFeature {
  return { id: 'operation', name: 'Original two-direction extrusion', type: 'extrude', suppressed: false,
    sketchId: 'profile', depth: 20, symmetric: false, secondDirection: { enabled: true, depth: 10 },
    bodyOperation: { mode: 'new', bodyId: 'body' }, ...patch } as ExtrudeFeature;
}
function inspect(shape: Shape3D, volume: number, area: number, center: Vec3, min: Vec3, max: Vec3, solidCount = 1) {
  withNativeOwners(owners => {
    const solids = owners.ownAll(shape.solids); expect(solids).toHaveLength(solidCount); solids.forEach(solid => validateBodyShape(solid));
    const oc = getOC(), mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false);
    near(mass.Mass(), volume); near(surface.Mass(), area);
    const centroid = owners.own(mass.CentreOfMass());
    [centroid.X(), centroid.Y(), centroid.Z()].forEach((v, i) => near(v, center[i], 1e-6));
    [box.GetXMin(), box.GetYMin(), box.GetZMin(), box.GetXMax(), box.GetYMax(), box.GetZMax()]
      .forEach((v, i) => near(v, [...min, ...max][i], 1e-6));
  });
}
async function verify(features: Feature[], volume: number, area: number, center: Vec3, min: Vec3, max: Vec3, solidCount = 1) {
  const before = structuredClone(features), result = engine.build(features);
  expect(result.featureErrors).toEqual([]); near(result.volume, volume);
  result.bounds.min.forEach((v, i) => near(v, min[i], 1e-6)); result.bounds.max.forEach((v, i) => near(v, max[i], 1e-6));
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  try { inspect(shape, volume, area, center, min, max, solidCount); } finally { shape.delete(); }
  expect(features).toEqual(before); return result;
}

it.each([20, -20])('constructs the independent unequal interval and STEP at signedD1%s', async depth => {
  const sign = Math.sign(depth);
  await verify([profile(), extrusion({ depth })], 2880, 1392, [6, 4, sign * 5], [0, 0, sign > 0 ? -10 : -20], [12, 8, sign > 0 ? 20 : 10]);
});

it.each([
  { depth: 20, second: 10, cap: 1, volume: 3072, area: 3376, z: 5, low: -10, high: 20 },
  { depth: -20, second: 10, cap: 1, volume: 3072, area: 3376, z: -5, low: -20, high: 10 },
  { depth: 13, second: 7, cap: 4, volume: 2688, area: 2176, z: 3, low: -7, high: 13 },
])('caps only external ends over D1=$depth/D2=$second/cap=$cap', async row => {
  const thinWall: ThinWallDefinition = { kind: 'one-side', thickness: 2, reversed: false, endCaps: { enabled: true, thickness: row.cap } };
  await verify([profile(), extrusion({ thinWall, depth: row.depth, secondDirection: { enabled: true, depth: row.second } })],
    row.volume, row.area, [6, 4, row.z], [-2, -2, row.low], [14, 10, row.high]);
});

it('thickens an open solved source across both branches without filling its source region', async () => {
  const source = profile(); source.profile = { kind: 'entities', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 12, y: 0 }],
    entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }], constraints: [] };
  await verify([source, extrusion({ thinWall: { kind: 'one-side', thickness: 2, reversed: false } })],
    720, 888, [6, -1, 5], [0, -2, -10], [12, 0, 20]);
});

it('cuts both independent branches from exactly its declared owner', async () => {
  const prefix: Feature[] = [
    { ...profile(), id: 'base-profile', offset: -15 },
    { id: 'base', name: 'Original selected owner', type: 'extrude', suppressed: false, sketchId: 'base-profile',
      depth: 40, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'selected' } },
    { ...profile(), id: 'other-profile', offset: -15, profile: { kind: 'rectangle', center: [36, 4], width: 12, height: 8 } },
    { id: 'other', name: 'Original untouched owner', type: 'extrude', suppressed: false, sketchId: 'other-profile',
      depth: 40, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'untouched' } },
  ];
  const before = engine.build(prefix); expect(before.featureErrors).toEqual([]);
  const result = await verify([...prefix, { ...profile(), profile: { kind: 'rectangle', center: [6, 4], width: 2, height: 2 } },
    { id: 'operation', name: 'Original selected cavity', type: 'cut', suppressed: false, sketchId: 'profile',
      depth: 20, symmetric: false, secondDirection: { enabled: true, depth: 10 }, bodyScope: [{ bodyId: 'selected', sourceFeatureId: 'base' }] }],
  7560, 3832, [446 / 21, 4, 5], [0, 0, -15], [42, 8, 25], 2);
  expect(result.bodies!.map(body => body.ref)).toEqual([{ bodyId: 'selected', sourceFeatureId: 'operation' }, { bodyId: 'untouched', sourceFeatureId: 'other' }]);
  near(result.bodies![0].volume, 3720); near(result.bodies![1].volume, 3840);
  expect(result.bodies![1].edges.map(edge => edge.ref)).toEqual(before.bodies![1].edges.map(edge => edge.ref));
});

it('cuts both selected owners on opposite sides of a gap with one shared span', async () => {
  const prefix: Feature[] = [];
  for (const [id, offset] of [['negative', -8], ['positive', 2]] as const) {
    prefix.push({ ...profile(), id: id + '-profile', offset },
      { id, name: 'Original separated owner', type: 'extrude', suppressed: false, sketchId: id + '-profile',
        depth: 6, symmetric: false, bodyOperation: { mode: 'new', bodyId: id } });
  }
  const result = await verify([...prefix, { ...profile(), profile: { kind: 'rectangle', center: [6, 4], width: 2, height: 2 } },
    { id: 'operation', name: 'Original two-sided selected cut', type: 'cut', suppressed: false, sketchId: 'profile', depth: 5, symmetric: false,
      secondDirection: { enabled: true, depth: 5 }, bodyScope: [
        { bodyId: 'negative', sourceFeatureId: 'negative' }, { bodyId: 'positive', sourceFeatureId: 'positive' }] }],
  1128, 912, [6, 4, 0], [0, 0, -8], [12, 8, 8], 2);
  expect(result.bodies!.map(body => body.ref)).toEqual([
    { bodyId: 'negative', sourceFeatureId: 'operation' }, { bodyId: 'positive', sourceFeatureId: 'operation' }]);
  result.bodies!.forEach(body => near(body.volume, 564));
});

it('handles the full200000mm calculated span without relaxing either source parameter', async () => {
  const source = profile(); source.profile = { kind: 'rectangle', center: [0, 0], width: 1, height: 1 };
  await verify([source, extrusion({ depth: 100_000, secondDirection: { enabled: true, depth: 100_000 } })],
    200_000, 800_002, [0, 0, 0], [-.5, -.5, -100_000], [.5, .5, 100_000]);
});

it('uses the incoming supported offset once across both branches', async () => {
  const datum: Feature = { id: 'datum', name: 'Original offset3', type: 'plane', suppressed: false,
    support: { kind: 'principal', plane: 'XY' }, offset: 3, reversed: false };
  await verify([datum, { ...profile(), offset: 4, support: { kind: 'plane', planeId: 'datum' } }, extrusion()],
    2880, 1392, [6, 4, 12], [0, 0, -3], [12, 8, 27]);
});

it('does not take the legacy single-entity semantic-prism bypass or solve twice', async () => {
  const source = profile(); source.profile = { kind: 'entities', points: [
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 10, y: 6 }, { id: 'd', x: 0, y: 6 },
  ], entities: [
    { id: 'ab', type: 'line', start: 'a', end: 'b', construction: false }, { id: 'bc', type: 'line', start: 'b', end: 'c', construction: false },
    { id: 'cd', type: 'line', start: 'c', end: 'd', construction: false }, { id: 'da', type: 'line', start: 'd', end: 'a', construction: false },
  ], constraints: [['a', 0, 0], ['b', 12, 0], ['c', 12, 8], ['d', 0, 8]].map(([id, x, y]) =>
    ({ id: 'fix-' + id, type: 'fix', pointId: id as string, x: x as number, y: y as number })) };
  const operation = extrusion(); if (operation.type !== 'extrude') throw Error('Expected additive extrusion'); delete operation.bodyOperation;
  const solve = vi.spyOn(profiles, 'solveEntityProfileResult');
  await verify([source, operation], 2880, 1392, [6, 4, 5], [0, 0, -10], [12, 8, 20]);
  expect(solve).toHaveBeenCalledTimes(1);
});

it('keeps exact body identity through saved independent depth edits and OFF recovery', async () => {
  const document = createDocument('Original two-direction history'); document.features = [profile(), extrusion()];
  const history = new DocumentHistory(document);
  const before = await verify(history.current.features, 2880, 1392, [6, 4, 5], [0, 0, -10], [12, 8, 20]);
  history.apply(updateFeature(history.current, 'operation', { secondDirection: { enabled: true, depth: 5 } }));
  const edited = await verify(parseDocument(serializeDocument(history.current)).features, 2400, 1192, [6, 4, 7.5], [0, 0, -5], [12, 8, 20]);
  expect(edited.bodies!.map(body => body.ref)).toEqual(before.bodies!.map(body => body.ref));
  await verify(history.undo().features, 2880, 1392, [6, 4, 5], [0, 0, -10], [12, 8, 20]);
  await verify(history.redo().features, 2400, 1192, [6, 4, 7.5], [0, 0, -5], [12, 8, 20]);
  history.apply(updateFeature(history.current, 'operation', { secondDirection: { enabled: false, depth: 5 } }));
  await verify(history.current.features, 1920, 992, [6, 4, 10], [0, 0, 0], [12, 8, 20]);
});

it.each(['symmetric', 'throughAll', 'untilNext', 'upToSurface'] as const)('rejects active second direction with %s before native factories', kind => {
  const operation = extrusion();
  if (kind === 'symmetric') operation.symmetric = true;
  else operation.endCondition = kind === 'upToSurface' ? { kind, target: { kind: 'principal', plane: 'XY' } }
    : kind === 'throughAll' ? { kind, baseFeatureId: 'missing', bothDirections: false } : { kind, baseFeatureId: 'missing' };
  const result = engine.build([profile(), operation]);
  expect(result.featureErrors).toHaveLength(1); expect(result.featureErrors[0].message).toMatch(/profundidad ciega/);
  expect(() => engine.export('step')).toThrow(/errores/);
});
