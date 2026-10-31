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
beforeAll(async () => {
  const wasmBinary = await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'));
  setOC(await initOpenCascade({ wasmBinary, print: () => undefined }));
}, 60_000);
afterEach(() => engine.dispose());

// Original analytic profiles, authored here; no imported or third-party models.
const sketch = (profile: SketchFeature['profile'] = { kind: 'rectangle', center: [2, 0], width: 4, height: 10 }): SketchFeature =>
  ({ id: 's', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile });
const revolution = (patch: Partial<RevolveFeature> = {}): RevolveFeature =>
  ({ id: 'r', name: 'Revolution', type: 'revolve', sketchId: 's', angle: 360, suppressed: false, ...patch });
const polygon = (points: [number, number][]): EntityProfile => ({ kind: 'entities',
  points: points.map(([x, y], index) => ({ id: `p${index}`, x, y })),
  entities: points.map((_, index) => ({ id: `e${index}`, type: 'line', start: `p${index}`, end: `p${(index + 1) % points.length}`, construction: false })),
  constraints: [] });
const vector = (actual: readonly number[], expected: readonly number[]) => actual.forEach((value, axis) => expect(Math.abs(value - expected[axis])).toBeLessThan(1e-6));

async function verify(features: Feature[], volume: number, area: number, min: Vec3, max: Vec3) {
  const result = engine.build(features);
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
  return result;
}

describe('selected revolution axes and directed native geometry', () => {
  it('retains legacy cylinder geometry and exact historical lineage when reverse is false', async () => {
    const original = await verify([sketch(), revolution()], 160 * Math.PI, 112 * Math.PI, [-4, -5, -4], [4, 5, 4]);
    const lineage = advanceLineage('', ['r', 'revolve', 's', 'XY', 'rectangle', ['local-Y', 1, true]]);
    expect(original.edges.length).toBeGreaterThan(0);
    expect(original.edges.every(edge => edge.ref.key.includes(lineage))).toBe(true);
    const next = engine.build([sketch(), revolution({ reversed: false })]);
    expect(next.edges.map(edge => edge.ref)).toEqual(original.edges.map(edge => edge.ref));
    expect(next.faces?.map(face => face.ref)).toEqual(original.faces?.map(face => face.ref));
  });

  it('rebuilds opposite quarter turns with identical volumes and different bounds, then restores references', async () => {
    const declaration = revolution({ axis: { kind: 'sketch-axis', axis: 'y' }, angle: 90 });
    const forward = await verify([sketch(), declaration], 40 * Math.PI, 28 * Math.PI + 80, [0, -5, -4], [4, 5, 0]);
    const reversed = await verify([sketch(), { ...declaration, reversed: true }], 40 * Math.PI, 28 * Math.PI + 80, [0, -5, 0], [4, 5, 4]);
    expect(reversed.edges.every(edge => !forward.edges.some(previous => previous.ref.key === edge.ref.key))).toBe(true);
    const restored = engine.build([sketch(), declaration]);
    expect(restored.edges.map(edge => edge.ref)).toEqual(forward.edges.map(edge => edge.ref));
    const stale = engine.build([sketch(), { ...declaration, reversed: true }, { id: 'finish', name: 'Old edge', type: 'chamfer',
      baseFeatureId: 'r', size: .1, selection: { mode: 'selected', edges: [forward.edges[0].ref] }, suppressed: false }]);
    expect(stale.featureErrors.some(error => error.id === 'finish')).toBe(true);
    expect(() => engine.export('step')).toThrow();
  });

  it.each([false, true])('revolves a primitive rectangle about X with reversed=%s', async reversed => {
    await verify([sketch({ kind: 'rectangle', center: [0, 2], width: 10, height: 4 }),
      revolution({ axis: { kind: 'sketch-axis', axis: 'x' }, reversed, angle: 90 })], 40 * Math.PI, 28 * Math.PI + 80,
    reversed ? [-5, 0, -4] : [-5, 0, 0], reversed ? [5, 4, 0] : [5, 4, 4]);
  });

  it('revolves a construction-line rectangle at a translated axis', async () => {
    const profile = polygon([[3, -5], [7, -5], [7, 5], [3, 5]]);
    profile.entities.push({ id: 'axis', type: 'line', start: 'p0', end: 'p3', construction: true });
    await verify([sketch(profile), revolution({ axis: { kind: 'sketch-line', entityId: 'axis' } })],
      160 * Math.PI, 112 * Math.PI, [-1, -5, -4], [7, 5, 4]);
  });

  it('reverses the entity contour path around its translated line for a half turn', async () => {
    const profile = polygon([[3, -5], [7, -5], [7, 5], [3, 5]]);
    profile.entities.push({ id: 'axis', type: 'line', start: 'p0', end: 'p3', construction: true });
    await verify([sketch(profile), revolution({ axis: { kind: 'sketch-line', entityId: 'axis' }, reversed: true, angle: 180 })],
      80 * Math.PI, 56 * Math.PI + 80, [-1, -5, 0], [7, 5, 4]);
  });

  it('preserves explicit new-body identity and supports a subsequent scoped bore cut', async () => {
    const source = sketch({ kind: 'rectangle', center: [0, 2], width: 10, height: 4 });
    const feature = revolution({ axis: { kind: 'sketch-axis', axis: 'x' }, bodyOperation: { mode: 'new', bodyId: 'body' } });
    const result = await verify([source, feature,
      { ...sketch({ kind: 'circle', center: [0, 0], radius: 1 }), id: 'bore', plane: 'YZ' },
      { id: 'cut', name: 'Axial bore', type: 'cut', sketchId: 'bore', depth: 20, symmetric: true, suppressed: false,
        bodyScope: [{ bodyId: 'body', sourceFeatureId: 'r' }] }],
    150 * Math.PI, 130 * Math.PI, [-5, -4, -4], [5, 4, 4]);
    expect(result.bodies?.map(body => body.ref)).toEqual([{ bodyId: 'body', sourceFeatureId: 'cut' }]);
  });

  it('revolves about an oblique profile-boundary line with independent 3-4-5 bounds', async () => {
    const profile = polygon([[-2, -2], [1.2, -4.4], [7.2, 3.6], [4, 6]]);
    // e3 runs back along the axis; full rotation is independent of its sense.
    await verify([sketch(profile), revolution({ axis: { kind: 'sketch-line', entityId: 'e3' } })],
      160 * Math.PI, 112 * Math.PI, [-5.2, -4.4, -4], [7.2, 8.4, 4]);
  });

  it('uses solved axis endpoints and rebuilds a changed line without stale geometry', async () => {
    const profile = polygon([[3, -5], [7, -5], [7, 5], [3, 5]]);
    profile.points.push({ id: 'a', x: 0, y: -5 }, { id: 'b', x: 0, y: 5 });
    profile.entities.push({ id: 'axis', type: 'line', start: 'a', end: 'b', construction: true });
    profile.constraints.push({ id: 'fix-a', type: 'fix', pointId: 'a', x: 3, y: -5 }, { id: 'fix-b', type: 'fix', pointId: 'b', x: 3, y: 5 });
    const feature = revolution({ axis: { kind: 'sketch-line', entityId: 'axis' } });
    await verify([sketch(profile), feature], 160 * Math.PI, 112 * Math.PI, [-1, -5, -4], [7, 5, 4]);
    profile.constraints = [{ id: 'fix-a', type: 'fix', pointId: 'a', x: 2, y: -5 }, { id: 'fix-b', type: 'fix', pointId: 'b', x: 2, y: 5 }];
    // Annular cylinder R5/r1/H10, around x=2.
    await verify([sketch(profile), feature], 240 * Math.PI, 168 * Math.PI, [-3, -5, -5], [7, 5, 5]);
  });

  it('maps X and reverse through an associative reversed reference-plane frame', async () => {
    const attached = { ...sketch({ kind: 'rectangle', center: [0, 2], width: 10, height: 4 }),
      support: { kind: 'plane', planeId: 'plane' } as const };
    await verify([{ id: 'plane', type: 'plane', name: 'Original plane', support: { kind: 'principal', plane: 'XY' },
      offset: 10, reversed: true, suppressed: false }, attached,
    revolution({ axis: { kind: 'sketch-axis', axis: 'x' }, reversed: true, angle: 90 })],
    40 * Math.PI, 28 * Math.PI + 80, [-5, -4, 10], [5, 0, 14]);
  });

  it('rotates a separated circle around X to a valid torus', async () => {
    await verify([sketch({ kind: 'circle', center: [0, 6], radius: 2 }), revolution({ axis: { kind: 'sketch-axis', axis: 'x' } })],
      48 * Math.PI ** 2, 48 * Math.PI ** 2, [-2, -8, -8], [2, 8, 8]);
  });

  it.each(['crossing', 'tangent', 'missing-line', 'retyped-line', 'degenerate-line'])('rejects %s without exposing a stale native export', kind => {
    engine.build([sketch(), revolution()]);
    let profile: SketchFeature['profile'] = { kind: 'rectangle', center: [0, 0], width: 4, height: 10 };
    let feature = revolution({ axis: { kind: 'sketch-axis', axis: 'x' } });
    if (kind === 'tangent') profile = { kind: 'circle', center: [0, 2], radius: 2 };
    if (kind.endsWith('line')) {
      profile = polygon([[0, -5], [4, -5], [4, 5], [0, 5]]);
      feature = revolution({ axis: { kind: 'sketch-line', entityId: 'axis' } });
      if (kind === 'retyped-line') profile.entities.push({ id: 'axis', type: 'circle', center: 'origin', radius: 2, construction: true });
      if (kind === 'degenerate-line') profile.entities.push({ id: 'axis', type: 'line', start: 'p0', end: 'p0', construction: true });
    }
    const result = engine.build([sketch(profile), feature]);
    expect(result.featureErrors.length).toBeGreaterThan(0);
    expect(result.volume).toBe(0); expect(() => engine.export('step')).toThrow();
    expect(engine.build([sketch(), revolution()]).featureErrors).toEqual([]);
  });
});
