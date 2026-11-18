import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { importSTEP, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { CadEngine } from './kernel.engine';
import { validateBodyShape } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';
import { DocumentHistory, createDocument, parseDocument, serializeDocument, updateFeature } from '../model/document';
import type { Feature, SketchFeature, ThinWallDefinition, Vec3 } from './kernel.types';

// Original analytical L, in mm: (x,0) -> (x+20,0) -> (x+20,15).
// For a right wall2 with inner radius3: area58+4pi, perimeter62+4pi.
// No expected value is computed by the corner/offset/native helper under test.
const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);
afterEach(() => engine.dispose());

function profile(x = 0, offset = 0): SketchFeature {
  return { id: 'profile', name: 'Original analytical L', type: 'sketch', suppressed: false, plane: 'XY', offset,
    profile: { kind: 'entities', points: [{ id: 'a', x, y: 0 }, { id: 'b', x: x + 20, y: 0 }, { id: 'c', x: x + 20, y: 15 }],
      entities: [{ id: 'horizontal', type: 'line', start: 'a', end: 'b', construction: false },
        { id: 'vertical', type: 'line', start: 'b', end: 'c', construction: false }], constraints: [] } };
}
function wall(reversed = false, radius = 3): ThinWallDefinition {
  return { kind: 'one-side', thickness: 2, reversed, autoCorners: { enabled: true, radius } };
}
function extrude(thinWall = wall()): Feature {
  return { id: 'wall', name: 'Rounded wall', type: 'extrude', sketchId: 'profile', suppressed: false,
    depth: 10, symmetric: false, thinWall, bodyOperation: { mode: 'new', bodyId: 'wall-body' } };
}
const near = (actual: number, expected: number, tolerance = 1e-5) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);
async function verify(features: Feature[], volume: number, area: number, min: Vec3, max: Vec3) {
  const original = structuredClone(features), result = engine.build(features);
  expect(result.featureErrors).toEqual([]);
  near(result.volume, volume);
  result.bounds.min.forEach((value, i) => near(value, min[i], 1e-6));
  result.bounds.max.forEach((value, i) => near(value, max[i], 1e-6));
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  withNativeOwners(owners => {
    owners.own(shape);
    validateBodyShape(shape);
    expect(owners.ownAll(shape.solids)).toHaveLength(1);
    near(owners.own(measureShapeVolumeProperties(shape)).volume, volume);
    near(owners.own(measureShapeSurfaceProperties(shape)).area, area);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((value, j) => near(bounds[i][j], value, 1e-6)));
  });
  expect(features).toEqual(original);
  return result;
}

it.each([
  { reversed: false, radius: 3, volume: 580 + 40 * Math.PI, area: 736 + 48 * Math.PI,
    min: [0, -2, 0], max: [22, 15, 10] },
  { reversed: true, radius: 3, volume: 500 + 40 * Math.PI, area: 640 + 48 * Math.PI,
    min: [0, 0, 0], max: [20, 15, 10] },
  { reversed: true, radius: .001, volume: 10 * (61.996 + 1.001 * Math.PI), area: 783.952 + 12.012 * Math.PI,
    min: [0, 0, 0], max: [20, 15, 10] },
] as { reversed: boolean; radius: number; volume: number; area: number; min: Vec3; max: Vec3 }[])(
  'constructs/STEP-reopens the inner-radius wall reversed=$reversed radius=$radius', async item => {
    await verify([profile(), extrude(wall(item.reversed, item.radius))], item.volume, item.area, item.min, item.max);
  });

it('cuts an internal rounded wall from exactly the selected owner', async () => {
  const base: Feature[] = [{ id: 'base-profile', name: 'Original enclosure', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [10, 6.5], width: 30, height: 25 } },
  { id: 'base', name: 'Original owner', type: 'extrude', suppressed: false, sketchId: 'base-profile', depth: 20,
    symmetric: false, bodyOperation: { mode: 'new', bodyId: 'base-body' } }];
  const cut: Feature = { id: 'wall', name: 'Rounded internal cut', type: 'cut', suppressed: false, sketchId: 'profile',
    depth: 10, symmetric: false, thinWall: wall(), bodyScope: [{ bodyId: 'base-body', sourceFeatureId: 'base' }] };
  await verify([...base, profile(0, 5), cut], 15000 - (580 + 40 * Math.PI), 3700 + 736 + 48 * Math.PI,
    [-5, -6, 0], [25, 19, 20]);
});

// Pappus oracles for the original right-wall section translated +10 in X:
// integral(x dA)=4217/3+108pi; integral(x ds)=1489+108pi.
// Both include the two LINE ends and the quarter annulus, not a tessellation.
const turnedVolume = 2 * Math.PI * (4217 / 3 + 108 * Math.PI);
const turnedArea = 2 * Math.PI * (1489 + 108 * Math.PI);
it('revolves the rounded section around the original local axis', async () => {
  const operation: Feature = { id: 'wall', name: 'Original rounded turn', type: 'revolve', suppressed: false, sketchId: 'profile',
    angle: 360, thinWall: wall(), bodyOperation: { mode: 'new', bodyId: 'turn-body' } };
  await verify([profile(10), operation], turnedVolume, turnedArea, [-32, -2, -32], [32, 15, 32]);
});

it('subtracts the rounded full turn without changing the exact owner envelope', async () => {
  const base: Feature[] = [{ id: 'base-profile', name: 'Original cylinder', type: 'sketch', suppressed: false, plane: 'XZ', offset: 3,
    profile: { kind: 'circle', center: [0, 0], radius: 40 } },
  { id: 'base', name: 'Original cylinder owner', type: 'extrude', suppressed: false, sketchId: 'base-profile', depth: -20,
    symmetric: false, bodyOperation: { mode: 'new', bodyId: 'base-body' } }];
  const cut: Feature = { id: 'wall', name: 'Original rounded groove', type: 'revolvedCut', suppressed: false,
    sketchId: 'profile', angle: 360, thinWall: wall(), bodyScope: [{ bodyId: 'base-body', sourceFeatureId: 'base' }] };
  await verify([...base, profile(10), cut], 32000 * Math.PI - turnedVolume, 4800 * Math.PI + turnedArea,
    [-40, -3, -40], [40, 17, 40]);
});

it('rebuilds a saved radius edit, history and fresh reopening without changing its source', async () => {
  const initial = createDocument('Original rounded wall');
  initial.features = [profile(), extrude(wall(true))];
  const history = new DocumentHistory(parseDocument(serializeDocument(initial)));
  const before = await verify(history.current.features, 500 + 40 * Math.PI, 640 + 48 * Math.PI, [0, 0, 0], [20, 15, 10]);
  history.apply(updateFeature(history.current, 'wall', { thinWall: wall(true, .001) }));
  const reopened = parseDocument(serializeDocument(history.current));
  expect(reopened.features[0]).toEqual(initial.features[0]);
  const after = await verify(reopened.features, 10 * (61.996 + 1.001 * Math.PI), 783.952 + 12.012 * Math.PI, [0, 0, 0], [20, 15, 10]);
  expect(after.bodies?.map(body => body.ref)).toEqual(before.bodies?.map(body => body.ref));
  await verify(history.undo().features, 500 + 40 * Math.PI, 640 + 48 * Math.PI, [0, 0, 0], [20, 15, 10]);
  await verify(history.redo().features, 10 * (61.996 + 1.001 * Math.PI), 783.952 + 12.012 * Math.PI, [0, 0, 0], [20, 15, 10]);
});

it('recovers an earlier profile closed after rounding by explicitly disabling the saved option', async () => {
  const closed = profile();
  if (closed.profile.kind !== 'entities') throw Error('Expected original LINE source');
  closed.profile.entities.push({ id: 'closing-line', type: 'line', start: 'c', end: 'a', construction: false });
  const operation = extrude(), original = structuredClone([closed, operation]);
  const rejected = engine.build([closed, operation]);
  expect(rejected.featureErrors).toHaveLength(1);
  expect(rejected.featureErrors[0].message).toMatch(/abiert|cerrad|mixt/);
  const document = createDocument('Original source-closure recovery');
  document.features = [closed, operation];
  const repaired = parseDocument(serializeDocument(updateFeature(document, 'wall', {
    thinWall: { ...wall(), autoCorners: { enabled: false, radius: 3 } },
  })));
  // The closed20/15/25 triangle has inradius5. Its outward2 miter image
  // scales sides by7/5: outer area294 minus inner150 gives section144.
  // Outer/inner perimeter84+60 gives extruded area288+1440=1728.
  await verify(repaired.features, 1440, 1728, [-6, -2, 0], [22, 19, 10]);
  expect(repaired.features[0]).toEqual(closed);
  expect([closed, operation]).toEqual(original);
});
