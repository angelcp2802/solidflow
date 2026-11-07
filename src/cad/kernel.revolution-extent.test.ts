import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC } from 'replicad';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import { advanceLineage } from './kernel.naming';
import type { EntityProfile } from '../sketch/types';
import type { Feature, RevolveFeature, SketchFeature, Vec3 } from './kernel.types';

const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);
afterEach(() => engine.dispose());

// Original analytic annular-sector recipe: r=2..5, axial y=1..7. No imported model.
const sketch = (profile: SketchFeature['profile'] = { kind: 'rectangle', center: [3.5, 4], width: 3, height: 6 }): SketchFeature =>
  ({ id: 's', name: 'Original annular sector profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile });
const revolution = (patch: Partial<RevolveFeature> = {}): RevolveFeature =>
  ({ id: 'r', name: 'Original two-sided revolution', type: 'revolve', sketchId: 's', angle: 60,
    extent: { kind: 'two-directions', secondAngle: 30 }, suppressed: false, ...patch });
const polygon = (points: [number, number][], prefix = ''): EntityProfile => ({ kind: 'entities',
  points: points.map(([x, y], index) => ({ id: `${prefix}p${index}`, x, y })),
  entities: points.map((_, index) => ({ id: `${prefix}e${index}`, type: 'line', start: `${prefix}p${index}`,
    end: `${prefix}p${(index + 1) % points.length}`, construction: false })), constraints: [] });
const vector = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(3);
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-6));
};

async function verify(features: Feature[], volume: number, area: number, min: Vec3, max: Vec3) {
  const before = structuredClone(features), result = engine.build(features);
  expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]);
  expect(Math.abs(result.volume - volume)).toBeLessThan(1e-5);
  vector(result.bounds.min, min); vector(result.bounds.max, max);
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  withNativeOwners(owners => {
    owners.own(shape);
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0; while (explorer.More()) { count++; explorer.Next(); } expect(count).toBe(1);
    const mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false);
    expect(Math.abs(mass.Mass() - volume)).toBeLessThan(1e-5);
    expect(Math.abs(surface.Mass() - area)).toBeLessThan(1e-5);
    vector([box.GetXMin(), box.GetYMin(), box.GetZMin()], min);
    vector([box.GetXMax(), box.GetYMax(), box.GetZMax()], max);
  });
  expect(features).toEqual(before);
  return result;
}

describe('two-direction and mid-plane native revolution', () => {
  it.each([false, true])('builds asymmetric 60/30 degree sectors with reversed=%s', async reversed => {
    await verify([sketch(), revolution({ reversed })], 31.5 * Math.PI, 31.5 * Math.PI + 36,
      [1, 1, reversed ? -2.5 : -5 * Math.sqrt(3) / 2], [5, 7, reversed ? 5 * Math.sqrt(3) / 2 : 2.5]);
  });

  it('interprets the mid-plane angle as total and preserves geometry and references when reverse toggles', async () => {
    const feature = revolution({ angle: 90, extent: { kind: 'mid-plane' }, reversed: false });
    const first = await verify([sketch(), feature], 31.5 * Math.PI, 31.5 * Math.PI + 36,
      [Math.SQRT2, 1, -5 / Math.SQRT2], [5, 7, 5 / Math.SQRT2]);
    const second = await verify([sketch(), { ...feature, reversed: true }], 31.5 * Math.PI, 31.5 * Math.PI + 36,
      [Math.SQRT2, 1, -5 / Math.SQRT2], [5, 7, 5 / Math.SQRT2]);
    expect(second.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
    expect(second.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  });

  it.each([0, 90])('allows one zero side without a zero-volume sub-solid (first side %s)', async angle => {
    await verify([sketch(), revolution({ angle, extent: { kind: 'two-directions', secondAngle: 90 - angle } })],
      31.5 * Math.PI, 31.5 * Math.PI + 36, [0, 1, angle ? -5 : 0], [5, 7, angle ? 0 : 5]);
  });

  it.each([
    { angle: 270, extent: { kind: 'two-directions' as const, secondAngle: 90 } },
    { angle: 0, extent: { kind: 'two-directions' as const, secondAngle: 360 } },
    { angle: 360, extent: { kind: 'mid-plane' as const } },
  ])('builds one full annulus without internal radial caps: %j', async patch => {
    await verify([sketch(), revolution(patch)], 126 * Math.PI, 126 * Math.PI, [-5, 1, -5], [5, 7, 5]);
  });

  it('maps the interval to the local X axis', async () => {
    await verify([sketch({ kind: 'rectangle', center: [4, 3.5], width: 6, height: 3 }),
      revolution({ axis: { kind: 'sketch-axis', axis: 'x' } })], 31.5 * Math.PI, 31.5 * Math.PI + 36,
    [1, 1, -2.5], [7, 5, 5 * Math.sqrt(3) / 2]);
  });

  it('uses the current transformed support frame for both sweep and initial offset', async () => {
    await verify([{ id: 'plane', name: 'Original inverted plane', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 10, reversed: true },
    { ...sketch(), support: { kind: 'plane', planeId: 'plane' } }, revolution()],
    31.5 * Math.PI, 31.5 * Math.PI + 36, [1, -7, 7.5], [5, -1, 10 + 5 * Math.sqrt(3) / 2]);
  });

  it('positions an entity sweep about a translated oblique 3-4-5 line', async () => {
    // O=(10,20,3), axis=(3/5,4/5,0), radial=(4/5,-3/5,0), t=1..7/r=2..5.
    const profile = polygon([[12.2, 19.6], [14.6, 17.8], [18.2, 22.6], [15.8, 24.4]]);
    profile.points.push({ id: 'a', x: 10, y: 20 }, { id: 'b', x: 13, y: 24 });
    profile.entities.push({ id: 'axis', type: 'line', start: 'a', end: 'b', construction: true });
    await verify([{ ...sketch(profile), offset: 3 }, revolution({ axis: { kind: 'sketch-line', entityId: 'axis' } })],
      31.5 * Math.PI, 31.5 * Math.PI + 36, [11.4, 17.8, 3 - 5 * Math.sqrt(3) / 2], [18.2, 25, 5.5]);
  });

  it('retains a nested hole across both sides instead of filling or duplicating its material', async () => {
    const outer = polygon([[2, 1], [5, 1], [5, 7], [2, 7]]), hole = polygon([[3, 2], [4, 2], [4, 6], [3, 6]], 'hole-');
    outer.points.push(...hole.points); outer.entities.push(...hole.entities);
    await verify([sketch(outer), revolution()], 24.5 * Math.PI, 49 * Math.PI + 28,
      [1, 1, -5 * Math.sqrt(3) / 2], [5, 7, 2.5]);
  });

  it('centers a circular profile sector without changing its analytic caps', async () => {
    await verify([sketch({ kind: 'circle', center: [4, 3], radius: 1 }), revolution({ angle: 90, extent: { kind: 'mid-plane' } })],
      2 * Math.PI ** 2, 4 * Math.PI ** 2 + 2 * Math.PI, [3 / Math.SQRT2, 2, -5 / Math.SQRT2], [5, 4, 5 / Math.SQRT2]);
  });

  it('retains an explicit body ID through a subsequent scoped bore cut', async () => {
    const result = await verify([sketch(), revolution({ angle: 270, extent: { kind: 'two-directions', secondAngle: 90 },
      bodyOperation: { mode: 'new', bodyId: 'annulus' } }),
    { ...sketch({ kind: 'circle', center: [0, 0], radius: 3 }), id: 'bore', plane: 'XZ' },
    { id: 'cut', name: 'Original axial bore', type: 'cut', sketchId: 'bore', depth: 20, symmetric: true,
      bodyScope: [{ bodyId: 'annulus', sourceFeatureId: 'r' }], suppressed: false }],
    96 * Math.PI, 128 * Math.PI, [-5, 1, -5], [5, 7, 5]);
    expect(result.bodies?.map(body => body.ref)).toEqual([{ bodyId: 'annulus', sourceFeatureId: 'cut' }]);
  });

  it('keeps legacy lineage byte-identical and rejects references from a different extent mode', async () => {
    const legacy: RevolveFeature = { id: 'r', name: 'Legacy', type: 'revolve', sketchId: 's', angle: 90, suppressed: false };
    const first = await verify([sketch(), legacy], 31.5 * Math.PI, 31.5 * Math.PI + 36, [0, 1, -5], [5, 7, 0]);
    const lineage = advanceLineage('', ['r', 'revolve', 's', 'XY', 'rectangle', ['local-Y', 1, false]]);
    expect(first.edges.every(edge => edge.ref.key.includes(lineage))).toBe(true);
    const two = revolution({ angle: 90, extent: { kind: 'two-directions', secondAngle: 0 } });
    const next = engine.build([sketch(), two]);
    expect(next.featureErrors).toEqual([]);
    expect(next.edges.every(edge => !first.edges.some(previous => previous.ref.key === edge.ref.key))).toBe(true);
    const stale = engine.build([sketch(), two, { id: 'finish', name: 'Obsolete edge', type: 'chamfer', baseFeatureId: 'r', size: .1,
      selection: { mode: 'selected', edges: [first.edges[0].ref] }, suppressed: false }]);
    expect(stale.featureErrors.some(error => error.id === 'finish')).toBe(true);
    expect(() => engine.export('step')).toThrow();
    const restored = engine.build([sketch(), { ...legacy, reversed: false }]);
    expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
    expect(restored.faces?.map(face => face.ref)).toEqual(first.faces?.map(face => face.ref));
  });

  it.each([
    { angle: 0, extent: { kind: 'two-directions', secondAngle: 0 } },
    { angle: 300, extent: { kind: 'two-directions', secondAngle: 61 } },
    { angle: 60, extent: { kind: 'two-directions', secondAngle: -1 } },
    { angle: 0, extent: { kind: 'mid-plane' } },
    { angle: 90, extent: undefined },
  ])('invalidates native export on bad extent and recovers the original model: %j', patch => {
    const original = engine.build([sketch(), revolution()]);
    expect(original.featureErrors).toEqual([]);
    const failed = engine.build([sketch(), revolution(patch as Partial<RevolveFeature>)]);
    expect(failed.featureErrors.some(error => error.id === 'r')).toBe(true);
    expect(failed.volume).toBe(0); expect(() => engine.export('step')).toThrow();
    const recovered = engine.build([sketch(), revolution()]);
    expect(recovered.featureErrors).toEqual([]);
    expect(recovered.edges.map(edge => edge.ref)).toEqual(original.edges.map(edge => edge.ref));
    vector(recovered.bounds.min, [1, 1, -5 * Math.sqrt(3) / 2]); vector(recovered.bounds.max, [5, 7, 2.5]);
  });
});
