import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import { validateBodyShape } from './kernel.bodies';
import { buildExplicitFramePrimitive } from './kernel.recipe-primitives';
import type { ExtrudeFeature, Feature, PlaneFrame, Vec3 } from './kernel.types';

// Original Cartesian envelopes and independent oblique-plane integrals in mm.
// No expected value comes from a limit resolver, mesh or imported sample.
const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url)
  .resolve('replicad-opencascadejs/wasm')), print: () => undefined })), 60_000);
afterEach(() => engine.dispose());
const near = (actual: number, expected: number, tolerance = 1e-5) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
function planes(): Feature[] {
  return [-3, 16].map((offset, i) => ({ id: i ? 'upper' : 'lower', name: 'Original world plane', type: 'plane',
    suppressed: false, support: { kind: 'principal', plane: 'XY' }, offset, reversed: false }));
}
function fixture(source: number, first: boolean, second: boolean, reversed = false): Feature[] {
  const operation: ExtrudeFeature = { id: 'operation', name: 'Original anchored directions', type: 'extrude', suppressed: false,
    sketchId: 'profile', depth: reversed ? -11 : 11, symmetric: false,
    ...(first ? { endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: reversed ? 'lower' : 'upper' } } } : {}),
    secondDirection: { enabled: true, depth: 8, ...(second ? { endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: reversed ? 'upper' : 'lower' } } } : {}) },
    bodyOperation: { mode: 'new', bodyId: 'body' } };
  return [...planes(), { id: 'profile', name: 'Original10x6', type: 'sketch', suppressed: false, plane: 'XY', offset: source,
    profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 } }, operation];
}
function inspect(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3, center?: Vec3, count = 1): void {
  withNativeOwners(owners => {
    const solids = owners.ownAll(shape.solids); expect(solids).toHaveLength(count); solids.forEach(solid => validateBodyShape(solid));
    const oc = getOC(), mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false); near(mass.Mass(), volume); near(surface.Mass(), area);
    [box.GetXMin(), box.GetYMin(), box.GetZMin(), box.GetXMax(), box.GetYMax(), box.GetZMax()].forEach((value, i) => near(value, [...min, ...max][i], 1e-6));
    if (center) { const point = owners.own(mass.CentreOfMass()); [point.X(), point.Y(), point.Z()].forEach((value, i) => near(value, center[i], 1e-6)); }
  });
}
async function verify(features: Feature[], volume: number, area: number, min: Vec3, max: Vec3, center?: Vec3, count = 1) {
  const before = structuredClone(features), result = engine.build(features); expect(result.featureErrors).toEqual([]); near(result.volume, volume);
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  try { inspect(shape, volume, area, min, max, center, count); } finally { shape.delete(); }
  expect(features).toEqual(before); return result;
}

it.each([false, true])('keeps both world-plane ends anchored after source5→7, reversed=%s', async reversed => {
  for (const source of [5, 7]) await verify(fixture(source, true, true, reversed), 1140, 728, [-5, -3, -3], [5, 3, 16], [0, 0, 6.5]);
});
it.each([
  { first: true, second: false, low: -1, high: 16, volume: 1020, area: 664 },
  { first: false, second: true, low: -3, high: 18, volume: 1260, area: 792 },
])('moves only the blind endpoint after source5→7, firstAuto=$first', async row => {
  await verify(fixture(5, row.first, row.second), 1140, 728, [-5, -3, -3], [5, 3, 16]);
  await verify(fixture(7, row.first, row.second), row.volume, row.area, [-5, -3, row.low], [5, 3, row.high]);
});

it('reuses a thin section for both automatic ends and rejects active automatic caps', async () => {
  const features = fixture(5, true, true), profile = features[2], operation = features[3];
  if (profile.type !== 'sketch' || operation.type !== 'extrude') throw Error('Fixture');
  profile.profile = { kind: 'rectangle', center: [6, 4], width: 12, height: 8 };
  operation.thinWall = { kind: 'one-side', thickness: 2, reversed: false, endCaps: { enabled: false, thickness: 4 } };
  await verify(features, 1824, 2016, [-2, -2, -3], [14, 10, 16]);
  operation.thinWall.endCaps!.enabled = true;
  const rejected = engine.build(features); expect(rejected.featureErrors).toHaveLength(1); expect(rejected.featureErrors[0].message).toMatch(/aditiva ciega/);
});

function owners(partial = false): Feature[] {
  return [['negative', -9, 6], ['positive', 16, 3]].flatMap(([id, offset, depth]) => [
    { id: id + '-profile', name: 'Original separated owner', type: 'sketch', suppressed: false, plane: 'XY', offset,
      profile: { kind: 'rectangle', center: [10, 7], width: partial && id === 'negative' ? 2 : 20, height: 14 } },
    { id, name: 'Original body', type: 'extrude', suppressed: false, sketchId: id + '-profile', depth, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: id } },
  ]) as Feature[];
}
function cut(): Feature[] {
  return [{ id: 'profile', name: 'Original4x3 cut', type: 'sketch', suppressed: false, plane: 'XY', offset: 5,
    profile: { kind: 'rectangle', center: [10, 7], width: 4, height: 3 } },
  { id: 'operation', name: 'Original opposite-owner cut', type: 'cut', suppressed: false, sketchId: 'profile', depth: 1, symmetric: false,
    endCondition: { kind: 'untilNext', baseFeatureId: 'positive' }, secondDirection: { enabled: true, depth: 1,
      endCondition: { kind: 'untilNext', baseFeatureId: 'positive' } }, bodyScope: [
      { bodyId: 'positive', sourceFeatureId: 'positive' }, { bodyId: 'negative', sourceFeatureId: 'negative' }] }];
}
it('accepts only natively proven empty rays while each selected owner loses material', async () => {
  const result = await verify([...owners(), ...cut()], 2412, 1810, [0, 0, -9], [20, 14, 19], [10, 7, 11 / 6], 2);
  expect(result.bodies!.map(body => body.ref)).toEqual([{ bodyId: 'negative', sourceFeatureId: 'operation' }, { bodyId: 'positive', sourceFeatureId: 'operation' }]);
});
it('rejects an incomplete next face atomically instead of treating it as an empty ray', () => {
  const prefix = owners(true), before = engine.build(prefix), result = engine.build([...prefix, ...cut()]);
  expect(result.featureErrors).toHaveLength(1); expect(result.featureErrors[0].message).toMatch(/intercepta|incompatibles|perfil/);
  near(result.volume, before.volume); expect(result.bodies!.map(body => body.ref)).toEqual(before.bodies!.map(body => body.ref));
});

it('resolves a real second historical face, rebinds its depth and retains an inactive unavailable reference', async () => {
  const base: Feature[] = [
    { id: 'base-profile', name: 'Original20x14', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [10, 7], width: 20, height: 14 } },
    { id: 'base', name: 'Original historical target', type: 'extrude', suppressed: false, sketchId: 'base-profile', depth: 4, symmetric: false },
  ];
  const before = engine.build(base), face = before.faces!.find(face => face.frame?.normal[2] === 1)!.ref;
  const rest: Feature[] = [
    { ...base[0], id: 'boss-profile', offset: 4 } as Feature,
    { id: 'boss', name: 'Later material burying the old face', type: 'extrude', suppressed: false, sketchId: 'boss-profile', depth: 10, symmetric: false },
    { id: 'profile', name: 'Original internal4x3', type: 'sketch', suppressed: false, plane: 'XY', offset: 10,
      profile: { kind: 'rectangle', center: [10, 7], width: 4, height: 3 } },
    { id: 'operation', name: 'Original historical-face cut', type: 'cut', suppressed: false, sketchId: 'profile', depth: 2, symmetric: false,
      secondDirection: { enabled: true, depth: 1, endCondition: { kind: 'upToSurface', target: { kind: 'face', face } } } },
  ];
  await verify([...base, ...rest], 3824, 1648, [0, 0, 0], [20, 14, 14]);
  if (base[1].type !== 'extrude') throw Error('Fixture'); base[1].depth = 6;
  await verify([...base, ...rest], 3848, 1620, [0, 0, 0], [20, 14, 14]);
  base[1].suppressed = true;
  const rejected = engine.build([...base, ...rest]); expect(rejected.featureErrors).toHaveLength(1); near(rejected.volume, 2800);
  if (rest[3].type !== 'cut') throw Error('Fixture'); rest[3].secondDirection!.enabled = false;
  await verify([...base, ...rest], 2776, 1292, [0, 0, 4], [20, 14, 14]);
});

it('uses exact inclined ends rather than an average or bounding-box depth', () => {
  const n = (slope: number): Vec3 => [-slope / Math.hypot(slope, 1), 0, 1 / Math.hypot(slope, 1)];
  const frame = (z: number, slope: number): PlaneFrame => ({ origin: [0, 0, z], normal: n(slope), xDirection: [1 / Math.hypot(slope, 1), 0, slope / Math.hypot(slope, 1)] });
  const shape = buildExplicitFramePrimitive({ profile: { kind: 'rectangle', center: [2, 1], width: 4, height: 2 },
    frame: { origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] }, signedDepth: 1,
    termination: { kind: 'upToSurface', limit: { frame: frame(12, .5) } },
    secondDirection: { enabled: true, depth: 1, endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: 'original-lower' } } },
    secondTermination: { kind: 'upToSurface', limit: { frame: frame(-4, .25) } }, operation: 'add', validateTool: validateBodyShape });
  try { inspect(shape, 132, 198 + 4 * Math.sqrt(5) + 2 * Math.sqrt(17), [0, 0, -4], [4, 2, 14], [200 / 99, 1, 157 / 33]); }
  finally { shape.delete(); }
});
