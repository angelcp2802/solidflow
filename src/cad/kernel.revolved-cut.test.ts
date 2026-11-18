import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC } from 'replicad';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import type { Feature, RevolvedCutFeature, SketchFeature } from './kernel.types';

const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);
afterEach(() => engine.dispose());

// Original analytic fixture: cylinder R5, height10; annular groove removes
// r3..5 over z4..6. V=(250-32)pi; area=(150-20+12+32)pi.
// Partial quarter grooves add two radial rectangles, each 2 by 2 mm.
const disk = (id = 'disk', x = 0, offset = 0): SketchFeature => ({
  id, name: id, type: 'sketch', plane: 'XY', offset, suppressed: false,
  profile: { kind: 'circle', center: [x, 0], radius: 5 },
});
const groove = (id = 'groove', height = 2, z = 5): SketchFeature => ({
  id, name: id, type: 'sketch', plane: 'XZ', offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [4.5, z], width: 3, height },
});
const base = (): Feature[] => [disk(), {
  id: 'base', name: 'Original cylinder', type: 'extrude', sketchId: 'disk', depth: 10, symmetric: false, suppressed: false,
}];
const cut = (patch: Partial<RevolvedCutFeature> = {}): RevolvedCutFeature => ({
  id: 'groove-cut', name: 'Original revolved groove', type: 'revolvedCut', sketchId: 'groove', angle: 360, suppressed: false, ...patch,
});
const close = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(1e-5);

async function verify(features: Feature[], volume: number, area: number) {
  const before = structuredClone(features), result = engine.build(features);
  expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]);
  close(result.volume, volume);
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  withNativeOwners(owners => {
    owners.own(shape);
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const solids = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0; while (solids.More()) { count++; solids.Next(); } expect(count).toBe(1);
    const mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false);
    close(mass.Mass(), volume); close(surface.Mass(), area);
    [box.GetXMin(), box.GetYMin(), box.GetZMin(), box.GetXMax(), box.GetYMax(), box.GetZMax()]
      .forEach((value, index) => close(value, [-5, -5, 0, 5, 5, 10][index]));
  });
  expect(features).toEqual(before);
  return result;
}

it('subtracts a full annular groove and exports one valid solid with independently known metrology', async () => {
  await verify([...base(), groove(), cut()], 218 * Math.PI, 174 * Math.PI);
});

it.each([false, true])('subtracts an asymmetric two-direction quarter groove with reversed=%s', async reversed => {
  await verify([...base(), groove(), cut({ angle: 60, extent: { kind: 'two-directions', secondAngle: 30 }, reversed })],
    242 * Math.PI, 156 * Math.PI + 8);
});

it('interprets a mid-plane cut angle as the total rather than doubling the removed material', async () => {
  await verify([...base(), groove(), cut({ angle: 90, extent: { kind: 'mid-plane' } })],
    242 * Math.PI, 156 * Math.PI + 8);
});

it('rebuilds two successive original revolved cuts without recreating the previous removed material', async () => {
  const second: SketchFeature = { ...groove('second-groove'), profile: { kind: 'rectangle', center: [5, 7.5], width: 2, height: 1 } };
  await verify([...base(), groove(), cut(), second, {
    ...cut(), id: 'second-cut', sketchId: 'second-groove',
  }], 209 * Math.PI, 190 * Math.PI);
});

it('consumes the exact first-cut poststate in a second native scoped cut and preserves the original body identity', async () => {
  const initial = base();
  initial[1] = { ...initial[1], bodyOperation: { mode: 'new', bodyId: 'cylinder' } } as Feature;
  const second: SketchFeature = { ...groove('second-groove'), profile: { kind: 'rectangle', center: [5, 7.5], width: 2, height: 1 } };
  const result = await verify([...initial, groove(), cut({ bodyScope: [{ bodyId: 'cylinder', sourceFeatureId: 'base' }] }), second,
    cut({ id: 'second-cut', sketchId: 'second-groove', bodyScope: [{ bodyId: 'cylinder', sourceFeatureId: 'groove-cut' }] })],
  209 * Math.PI, 190 * Math.PI);
  expect(result.bodies?.map(body => body.ref)).toEqual([{ bodyId: 'cylinder', sourceFeatureId: 'second-cut' }]);
});

const catalogBase = (): Feature[] => [disk('a-disk'), {
  id: 'a-base', name: 'Original A', type: 'extrude', sketchId: 'a-disk', depth: 10, symmetric: false, suppressed: false,
  bodyOperation: { mode: 'new', bodyId: 'A' },
}, disk('b-disk', 14), {
  id: 'b-base', name: 'Original B', type: 'extrude', sketchId: 'b-disk', depth: 10, symmetric: false, suppressed: false,
  bodyOperation: { mode: 'new', bodyId: 'B' },
}];

it('cuts only the exact selected body and advances only its current state', () => {
  const result = engine.build([...catalogBase(), groove(), cut({ bodyScope: [{ bodyId: 'A', sourceFeatureId: 'a-base' }] })]);
  expect(result.featureErrors).toEqual([]); close(result.volume, 468 * Math.PI);
  expect(result.bodies?.map(body => body.ref)).toEqual([
    { bodyId: 'A', sourceFeatureId: 'groove-cut' }, { bodyId: 'B', sourceFeatureId: 'b-base' },
  ]);
  close(result.bodies!.find(body => body.ref.bodyId === 'A')!.volume, 218 * Math.PI);
  close(result.bodies!.find(body => body.ref.bodyId === 'B')!.volume, 250 * Math.PI);
});

it.each([
  undefined,
  [],
  [{ bodyId: 'A', sourceFeatureId: 'stale' }],
  [{ bodyId: 'B', sourceFeatureId: 'b-base' }],
  [{ bodyId: 'A', sourceFeatureId: 'a-base' }, { bodyId: 'B', sourceFeatureId: 'b-base' }],
])('rejects absent, empty, stale or nonintersecting scopes without adopting a partial cut: %j', bodyScope => {
  const result = engine.build([...catalogBase(), groove(), cut({ ...(bodyScope === undefined ? {} : { bodyScope }) })]);
  expect(result.featureErrors).toHaveLength(1); close(result.volume, 500 * Math.PI);
  expect(result.bodies?.map(body => body.ref)).toEqual([
    { bodyId: 'A', sourceFeatureId: 'a-base' }, { bodyId: 'B', sourceFeatureId: 'b-base' },
  ]);
});

it('rejects a cut without earlier material and a disjoint aggregate cut', () => {
  const empty = engine.build([groove(), cut()]); expect(empty.featureErrors).toHaveLength(1);
  const disjoint = engine.build([...base(), groove('distant', 2, 20), cut({ sketchId: 'distant' })]);
  expect(disjoint.featureErrors).toHaveLength(1); close(disjoint.volume, 250 * Math.PI);
});

it('cuts two exact coaxial bodies in one transaction while retaining their separate identities', () => {
  // Two cylinders R5, height2, at z0..2 and z4..6. The groove removes
  // (25-9)pi *1.5 from each: two remaining volumes of26pi.
  const features: Feature[] = [disk('lower'), {
    id: 'lower-base', name: 'Lower', type: 'extrude', sketchId: 'lower', depth: 2, symmetric: false, suppressed: false,
    bodyOperation: { mode: 'new', bodyId: 'lower-body' },
  }, disk('upper', 0, 4), {
    id: 'upper-base', name: 'Upper', type: 'extrude', sketchId: 'upper', depth: 2, symmetric: false, suppressed: false,
    bodyOperation: { mode: 'new', bodyId: 'upper-body' },
  }, groove('groove', 5, 3), cut({ bodyScope: [
    { bodyId: 'lower-body', sourceFeatureId: 'lower-base' }, { bodyId: 'upper-body', sourceFeatureId: 'upper-base' },
  ] })];
  const result = engine.build(features);
  expect(result.featureErrors).toEqual([]); close(result.volume, 52 * Math.PI);
  expect(result.bodies?.map(body => body.ref)).toEqual([
    { bodyId: 'lower-body', sourceFeatureId: 'groove-cut' }, { bodyId: 'upper-body', sourceFeatureId: 'groove-cut' },
  ]);
  result.bodies!.forEach(body => close(body.volume, 26 * Math.PI));
});
