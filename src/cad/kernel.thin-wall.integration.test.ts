import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { exportSTEP, getOC, importSTEP, setOC, type Shape3D } from 'replicad';
import type { EntityProfile } from '../sketch/types';
import type { SketchFeature, ThinWallDefinition, Vec3 } from './kernel.types';
import { entityProfileSolid } from './kernel.profiles';
import { withNativeOwners } from './kernel.native-ownership';
import { prepareThinSection } from './kernel.thin-wall';
import { resolveThinWall } from './thinWall';

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);

// All profiles below are original dimensioned analytic fixtures. Expected
// properties come from rectangles, circular sectors and cylinder formulas;
// neither an offset helper nor the resulting solid supplies expected values.
const one: ThinWallDefinition = { kind: 'one-side', thickness: 1, reversed: false };
const sketch = (profile: SketchFeature['profile']): SketchFeature => ({ id: 's', type: 'sketch', name: 'Original thin section',
  suppressed: false, plane: 'XY', offset: 0, profile });
const polyline = (points: [number, number][]): EntityProfile => ({ kind: 'entities',
  points: points.map(([x, y], index) => ({ id: `p${index}`, x, y })),
  entities: points.slice(0, -1).map((_, index) => ({ id: `e${index}`, type: 'line', construction: false, start: `p${index}`, end: `p${index + 1}` })), constraints: [] });
function nearVector(actual: number[], expected: Vec3): void {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-6));
}
function nativeProperties(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3, solids: number): void {
  withNativeOwners((owners) => {
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0;
    while (explorer.More()) { count++; explorer.Next(); }
    expect(count).toBe(solids);
    const mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false);
    expect(Math.abs(mass.Mass() - volume)).toBeLessThan(1e-5);
    expect(Math.abs(surface.Mass() - area)).toBeLessThan(1e-5);
    nearVector([box.GetXMin(), box.GetYMin(), box.GetZMin()], min);
    nearVector([box.GetXMax(), box.GetYMax(), box.GetZMax()], max);
  });
}
async function verify(profile: SketchFeature['profile'], definition: ThinWallDefinition,
  properties: { volume: number; area: number; min: Vec3; max: Vec3; solids?: number }, revolve = false): Promise<void> {
  const source = sketch(profile), before = structuredClone(source);
  const prepared = prepareThinSection(source, resolveThinWall({ thinWall: definition })!);
  if (prepared.sketch.profile.kind !== 'entities') throw new Error('Expected an entity section');
  const shape = entityProfileSolid(prepared.sketch.profile, 'XY', 0,
    revolve ? { type: 'revolve', angle: 360 } : { type: 'extrude', depth: 3 });
  try {
    nativeProperties(shape, properties.volume, properties.area, properties.min, properties.max, properties.solids ?? 1);
    const step = exportSTEP([{ shape, name: 'Original analytic thin section' }]);
    expect(step.size).toBeGreaterThan(500);
    const reopened = (await importSTEP(step)).asShape3D();
    try { nativeProperties(reopened, properties.volume, properties.area, properties.min, properties.max, properties.solids ?? 1); }
    finally { reopened.delete(); }
  } finally { shape.delete(); }
  expect(source).toEqual(before);
}

describe('native construction of prepared thin sections', () => {
  it('extrudes a capped LINE strip and retains its exact STEP properties', async () => {
    await verify(polyline([[0, 0], [10, 0]]), { kind: 'one-side', thickness: 2, reversed: false },
      { volume: 60, area: 112, min: [0, -2, 0], max: [10, 0, 3] });
  });
  it('extrudes a sharp exterior L band', async () => {
    await verify(polyline([[0, 0], [10, 0], [10, 8]]), one,
      { volume: 57, area: 158, min: [0, -1, 0], max: [11, 8, 3] });
  });
  it('extrudes the reversed sharp interior L band', async () => {
    await verify(polyline([[0, 0], [10, 0], [10, 8]]), { ...one, reversed: true },
      { volume: 51, area: 142, min: [0, 0, 0], max: [10, 8, 3] });
  });
  it('extrudes a sharp midpoint L with both offset sides', async () => {
    await verify(polyline([[0, 0], [10, 0], [10, 8]]), { kind: 'mid-plane', thickness: 2 },
      { volume: 108, area: 192, min: [0, -1, 0], max: [11, 8, 3] });
  });
  it('extrudes different thicknesses on the two L sides', async () => {
    await verify(polyline([[0, 0], [10, 0], [10, 8]]), { kind: 'two-sides', firstThickness: .5, secondThickness: 1 },
      { volume: 78.75, area: 166.5, min: [0, -.5, 0], max: [10.5, 8, 3] });
  });
  it('extrudes a closed rectangular wall rather than its filled interior', async () => {
    await verify({ kind: 'rectangle', center: [5, 3], width: 10, height: 6 }, one,
      { volume: 108, area: 288, min: [-1, -1, 0], max: [11, 7, 3] });
  });
  it('extrudes a circular wall using exact concentric native circles', async () => {
    await verify({ kind: 'circle', center: [0, 0], radius: 5 }, one,
      { volume: 33 * Math.PI, area: 88 * Math.PI, min: [-6, -6, 0], max: [6, 6, 3] });
  });
  it('extrudes asymmetric outside/inside thicknesses of a closed rectangular wall', async () => {
    await verify({ kind: 'rectangle', center: [5, 3], width: 10, height: 6 }, { kind: 'two-sides', firstThickness: 1, secondThickness: .5 },
      { volume: 153, area: 306, min: [-1, -1, 0], max: [11, 7, 3] });
  });
  it('extrudes an open quarter-ARC midpoint with straight radial caps', async () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 's', x: 5, y: 0 }, { id: 'e', x: 0, y: 5 }],
      entities: [{ id: 'arc', type: 'arc', construction: false, center: 'origin', start: 's', end: 'e', clockwise: false }], constraints: [] };
    await verify(profile, { kind: 'mid-plane', thickness: 2 },
      { volume: 15 * Math.PI, area: 25 * Math.PI + 12, min: [0, 0, 0], max: [6, 6, 3] });
  });
  it('extrudes a tangent LINE/ARC band without tessellating the curved wall', async () => {
    const profile = polyline([[0, 0], [10, 0], [15, 5]]);
    profile.points.push({ id: 'center', x: 10, y: 5 });
    profile.entities[1] = { id: 'e1', type: 'arc', construction: false, start: 'p1', end: 'p2', center: 'center', clockwise: false };
    await verify(profile, one, { volume: 30 + 33 * Math.PI / 4, area: 86 + 22 * Math.PI, min: [0, -1, 0], max: [16, 5, 3] });
  });
  it('retains separate nested wall components instead of dropping one native solid', async () => {
    const profile: EntityProfile = { kind: 'entities', points: [], entities: [
      { id: 'a', type: 'circle', center: 'origin', radius: 10, construction: false },
      { id: 'b', type: 'circle', center: 'origin', radius: 5, construction: false },
    ], constraints: [] };
    await verify(profile, one, { volume: 96 * Math.PI, area: 256 * Math.PI, min: [-11, -11, 0], max: [11, 11, 3], solids: 2 });
  });
  it('revolves an open LINE wall into an annular cylinder', async () => {
    await verify(polyline([[5, 0], [5, 8]]), one,
      { volume: 88 * Math.PI, area: 198 * Math.PI, min: [-6, 0, -6], max: [6, 8, 6] }, true);
  });
});
