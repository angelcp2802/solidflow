import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC } from 'replicad';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import * as edgeCatalogs from './kernel.edges';
import { UnsupportedAssemblyCurveError } from './kernel.assembly-supports';
import type { BodyReference, CadResult, EdgeReference, ExtrudeFeature, Feature, RevolveFeature, SketchFeature, Vec3 } from './kernel.types';

const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);
afterEach(() => { vi.restoreAllMocks(); engine.dispose(); });

// Original dimensioned geometry. An axis cube is disjoint from the revolved
// material: x=0..2, y=10..12, z=0..2. Its edge x=2,z=0 defines infinite +Y.
const axisBody: BodyReference = { bodyId: 'axis-body', sourceFeatureId: 'axis-base' };
const profile = (id = 'profile', center = 5, width = 4): SketchFeature => ({ id, name: id, type: 'sketch', plane: 'XY',
  offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [center, 0], width, height: 10 } });
const revolve = (patch: Partial<RevolveFeature> = {}): RevolveFeature => ({ id: 'revolution', name: 'Original external-axis revolution',
  type: 'revolve', sketchId: 'profile', angle: 360, suppressed: false, ...patch });
function cube(explicit = true, entities = false): Feature[] {
  const sketch: SketchFeature = { id: 'axis-profile', name: 'Original axis cube', type: 'sketch', plane: 'XY', offset: 0,
    suppressed: false, profile: entities ? { kind: 'entities',
      points: [{ id: 'a', x: 0, y: 10 }, { id: 'b', x: 2, y: 10 }, { id: 'c', x: 2, y: 12 }, { id: 'd', x: 0, y: 12 }],
      entities: [{ id: 'bottom', type: 'line', start: 'a', end: 'b', construction: false },
        { id: 'right', type: 'line', start: 'b', end: 'c', construction: false },
        { id: 'top', type: 'line', start: 'c', end: 'd', construction: false },
        { id: 'left', type: 'line', start: 'd', end: 'a', construction: false }], constraints: [] }
      : { kind: 'rectangle', center: [1, 11], width: 2, height: 2 } };
  const extrusion: ExtrudeFeature = { id: 'axis-base', name: 'Original axis cube', type: 'extrude', sketchId: sketch.id,
    depth: 2, symmetric: false, suppressed: false, ...(explicit ? { bodyOperation: { mode: 'new', bodyId: axisBody.bodyId } as const } : {}) };
  return [sketch, extrusion];
}
const vector = (actual: readonly number[], expected: readonly number[], tolerance = 1e-6) => {
  expect(actual).toHaveLength(3);
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(tolerance));
};
async function verify(features: Feature[], volume: number, area: number, min: Vec3, max: Vec3, solids = 1): Promise<CadResult> {
  const before = structuredClone(features), result = engine.build(features);
  expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual(solids > 1 ? [`La pieza contiene ${solids} sólidos separados.`] : []);
  expect(Math.abs(result.volume - volume)).toBeLessThan(1e-5);
  vector(result.bounds.min, min); vector(result.bounds.max, max);
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  withNativeOwners(owners => {
    owners.own(shape);
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0; while (explorer.More()) { count++; explorer.Next(); } expect(count).toBe(solids);
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
function selectedLine(result: CadResult, body: BodyReference | null, direction: Vec3 = [0, 1, 0]): EdgeReference {
  const edges = body ? result.bodies!.find(value => value.ref.bodyId === body.bodyId)!.edges : result.edges;
  const matches = edges.filter(edge => {
    try {
      const support = engine.inspectCurrentEdgeSupport(edge.ref, body);
      return Math.hypot(...support.axis.map((value, index) => value - direction[index])) < 1e-8
        && Math.abs(support.point[0] - 2) < 1e-8 && Math.abs(support.point[2]) < 1e-8
        && (direction[2] === 0 || Math.abs(support.point[1] - 10) < 1e-8);
    } catch { return false; }
  });
  expect(matches).toHaveLength(1);
  return structuredClone(matches[0].ref);
}
async function axisPrefix(explicit = true, entities = false) {
  const features = cube(explicit, entities), result = engine.build(features);
  expect(result.featureErrors).toEqual([]);
  const edge = selectedLine(result, explicit ? axisBody : null);
  // Independent native reader of the PRECEDING STEP: no result of revolution
  // exists yet, and no modelling/support extraction helper supplies this oracle.
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  withNativeOwners(owners => {
    owners.own(shape);
    const oc = getOC(), edges = owners.ownAll(shape.edges);
    const matches = edges.filter(value => {
      const curve = owners.own(new oc.BRepAdaptor_Curve(value.wrapped));
      if (curve.GetType() !== oc.GeomAbs_CurveType.GeomAbs_Line) return false;
      const p = owners.own(new oc.gp_Pnt()), d = owners.own(new oc.gp_Vec());
      curve.D1(curve.FirstParameter(), p, d);
      return Math.abs(p.X() - 2) < 1e-8 && Math.abs(p.Z()) < 1e-8
        && Math.abs(d.X()) < 1e-8 && Math.abs(d.Z()) < 1e-8 && Math.abs(d.Y()) > 1e-8;
    });
    expect(matches).toHaveLength(1);
  });
  return { features, result, edge };
}
function externalSketch(): SketchFeature {
  return { id: 'axis-sketch', name: 'Solved source on a different plane', type: 'sketch', plane: 'YZ', offset: 2,
    suppressed: false, profile: { kind: 'entities', points: [{ id: 'a', x: -2, y: 1 }, { id: 'b', x: 2, y: 1 }],
      entities: [{ id: 'axis-line', type: 'line', start: 'a', end: 'b', construction: true }],
      constraints: [{ id: 'fix-a', type: 'fix', pointId: 'a', x: -2, y: 0 }, { id: 'fix-b', type: 'fix', pointId: 'b', x: 2, y: 0 }] } };
}

describe('external revolution axes resolve against preceding geometry', () => {
  it('uses the literal world Y axis with independent annular-cylinder measurements', async () => {
    await verify([profile('profile', 3), revolve({ axis: { kind: 'principal-axis', axis: 'Y' } })],
      240 * Math.PI, 168 * Math.PI, [-5, -5, -5], [5, 5, 5]);
  });

  it('uses the solved line and real frame of another sketch, not its stored unsolved coordinates', async () => {
    const result = await verify([externalSketch(), profile(), revolve({ axis: { kind: 'external-sketch-line', sketchId: 'axis-sketch', entityId: 'axis-line' } })],
      240 * Math.PI, 168 * Math.PI, [-3, -5, -5], [7, 5, 5]);
    const lines = result.sketches!.find(value => value.id === 'axis-sketch')!.lineEntities!;
    expect(lines).toHaveLength(1); expect(lines[0]).toMatchObject({ entityId: 'axis-line', construction: true });
    vector(lines[0].start, [2, -2, 0], 1e-8); vector(lines[0].end, [2, 2, 0], 1e-8);
  });

  it.each([false, true])('directs an external solved axis through a quarter turn with reversed=%s', async reversed => {
    await verify([externalSketch(), profile(), revolve({ angle: 90, reversed,
      axis: { kind: 'external-sketch-line', sketchId: 'axis-sketch', entityId: 'axis-line' } })],
    60 * Math.PI, 42 * Math.PI + 80, reversed ? [2, -5, 0] : [2, -5, -5], reversed ? [7, 5, 5] : [7, 5, 0]);
  });

  it('includes the external support lineage and restores prior references on history replay', async () => {
    const source = externalSketch(); source.offset = 0; source.support = { kind: 'plane', planeId: 'axis-plane' };
    const plane: Feature = { id: 'axis-plane', name: 'Original support', type: 'plane', support: { kind: 'principal', plane: 'YZ' },
      offset: 2, reversed: false, suppressed: false };
    const operation = revolve({ axis: { kind: 'external-sketch-line', sketchId: source.id, entityId: 'axis-line' } });
    const features = [plane, source, profile(), operation];
    const first = await verify(features, 240 * Math.PI, 168 * Math.PI, [-3, -5, -5], [7, 5, 5]);
    const second = await verify([{ ...plane, reversed: true }, ...features.slice(1)], 240 * Math.PI, 168 * Math.PI, [-3, -5, -5], [7, 5, 5]);
    expect(second.edges.every(edge => !first.edges.some(before => before.ref.key === edge.ref.key))).toBe(true);
    const restored = engine.build(features);
    expect(restored.featureErrors).toEqual([]); expect(restored.edges.map(value => value.ref)).toEqual(first.edges.map(value => value.ref));
  });

  it('resolves a current exact body LINE before creating a separate revolved body', async () => {
    const prefix = await axisPrefix();
    const result = await verify([...prefix.features, profile(), revolve({ axis: { kind: 'linear-edge', edge: prefix.edge, body: axisBody },
      bodyOperation: { mode: 'new', bodyId: 'revolved-body' } })],
    8 + 240 * Math.PI, 24 + 168 * Math.PI, [-3, -5, -5], [7, 12, 5], 2);
    expect(result.bodies!.map(value => value.ref)).toEqual([axisBody, { bodyId: 'revolved-body', sourceFeatureId: 'revolution' }]);
  });

  it('keeps an untouched axis body current when a different body changes the global feature state', async () => {
    const prefix = await axisPrefix();
    const otherSketch: SketchFeature = { ...profile('other-profile'), profile: { kind: 'rectangle', center: [30, 30], width: 2, height: 2 } };
    const other: ExtrudeFeature = { id: 'other-base', name: 'Unrelated cube', type: 'extrude', sketchId: otherSketch.id,
      depth: 2, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'other-body' } };
    const result = await verify([...prefix.features, otherSketch, other, profile(), revolve({
      axis: { kind: 'linear-edge', edge: prefix.edge, body: axisBody }, bodyOperation: { mode: 'new', bodyId: 'revolved-body' } })],
    16 + 240 * Math.PI, 48 + 168 * Math.PI, [-3, -5, -5], [31, 31, 5], 3);
    expect(result.bodies!.find(value => value.ref.bodyId === axisBody.bodyId)!.ref).toEqual(axisBody);
  });

  it('resolves semantic legacy edges and their stored v1 aliases against the preceding native aggregate', async () => {
    const prefix = await axisPrefix(false, true);
    expect(prefix.edge.key).toMatch(/^edge-v2\|/);
    const alias = prefix.result.edges.find(value => value.ref.key === prefix.edge.key)!.aliases![0];
    for (const edge of [prefix.edge, alias]) {
      await verify([...prefix.features, profile(), revolve({ axis: { kind: 'linear-edge', edge, body: null } })],
        8 + 240 * Math.PI, 24 + 168 * Math.PI, [-3, -5, -5], [7, 12, 5], 2);
    }
  });

  it.each(['merge', 'cut'] as const)('uses an axis body as read-only geometry during %s', async kind => {
    const prefix = await axisPrefix(), axis = { kind: 'linear-edge' as const, edge: prefix.edge, body: axisBody };
    const target = revolve({ id: 'target', sketchId: 'target-profile', axis, bodyOperation: { mode: 'new', bodyId: 'target-body' } });
    const operation: Feature = kind === 'cut'
      ? { id: 'change', name: 'Axial bore', type: 'revolvedCut', sketchId: 'profile', angle: 360, axis,
        bodyScope: [{ bodyId: 'target-body', sourceFeatureId: 'target' }], suppressed: false }
      : revolve({ id: 'change', axis, bodyOperation: { mode: 'merge', target: { bodyId: 'target-body', sourceFeatureId: 'target' } } });
    const result = await verify([...prefix.features, profile('target-profile', 5, 6),
      target, kind === 'cut' ? profile('profile', 4.5, 5) : profile('profile', 8.5, 1), operation],
    8 + (kind === 'cut' ? 110 : 490) * Math.PI, 24 + (kind === 'cut' ? 242 : 238) * Math.PI,
    kind === 'cut' ? [-4, -5, -6] : [-5, -5, -7], kind === 'cut' ? [8, 12, 6] : [9, 12, 7], 2);
    expect(result.bodies!.map(value => value.ref)).toEqual([axisBody, { bodyId: 'target-body', sourceFeatureId: 'change' }]);
  });

  it.each(['absent-body', 'stale-state', 'aggregate-alias', 'missing-edge', 'noncoplanar'])(
    'rejects %s native selection without retaining a usable stale export', async kind => {
      const prefix = await axisPrefix();
      let body: BodyReference | null = { ...axisBody }, edge = prefix.edge;
      if (kind === 'absent-body') body.bodyId = 'missing';
      if (kind === 'stale-state') body.sourceFeatureId = 'old';
      if (kind === 'aggregate-alias') body = null;
      if (kind === 'missing-edge') edge = { ...edge, key: 'edge-v1|not-current' };
      if (kind === 'noncoplanar') edge = selectedLine(prefix.result, axisBody, [0, 0, 1]);
      const result = engine.build([...prefix.features, profile(), revolve({ axis: { kind: 'linear-edge', edge, body },
        bodyOperation: { mode: 'new', bodyId: 'revolved-body' } })]);
      expect(result.featureErrors.some(value => value.id === 'revolution')).toBe(true);
      expect(() => engine.export('step')).toThrow();
      expect(engine.build(prefix.features).featureErrors).toEqual([]);
    });

  it.each(['missing', 'suppressed', 'missing-line', 'off-plane'])(
    'rejects a %s external sketch source', kind => {
      const source = externalSketch();
      if (kind === 'suppressed') source.suppressed = true;
      if (kind === 'off-plane' && source.profile.kind === 'entities') source.profile.constraints = [];
      const result = engine.build([source, profile(), revolve({ axis: { kind: 'external-sketch-line',
        sketchId: kind === 'missing' ? 'future' : source.id, entityId: kind === 'missing-line' ? 'removed' : 'axis-line' } })]);
      expect(result.featureErrors.length).toBeGreaterThan(0); expect(() => engine.export('step')).toThrow();
    });

  it('rejects an actual native circle instead of using its tessellation as a LINE axis', () => {
    const source = cube();
    source[0] = { ...(source[0] as SketchFeature), profile: { kind: 'circle', center: [1, 11], radius: 1 } };
    const prefix = engine.build(source);
    expect(prefix.featureErrors).toEqual([]);
    const circular = prefix.bodies![0].edges.find(edge => {
      try { engine.inspectCurrentEdgeSupport(edge.ref, axisBody); return false; }
      catch (error) { if (!(error instanceof UnsupportedAssemblyCurveError)) throw error; return true; }
    });
    expect(circular).toBeDefined();
    const result = engine.build([...source, profile(), revolve({ axis: { kind: 'linear-edge', edge: circular!.ref, body: axisBody },
      bodyOperation: { mode: 'new', bodyId: 'revolved-body' } })]);
    expect(result.featureErrors.some(value => value.id === 'revolution')).toBe(true);
    expect(() => engine.export('step')).toThrow();
  });

  it('treats axis-catalog release failure as fatal and never retries its native owners', async () => {
    const prefix = await axisPrefix(), actual = edgeCatalogs.createEdgeCatalog;
    let releases = 0;
    vi.spyOn(edgeCatalogs, 'createEdgeCatalog').mockImplementationOnce((...args) => {
      const catalog = actual(...args);
      return { ...catalog, dispose: () => { releases++; catalog.dispose(); throw Error('original-axis-release-failure'); } };
    });
    expect(() => engine.build([...prefix.features, profile(), revolve({ axis: { kind: 'linear-edge', edge: prefix.edge, body: axisBody },
      bodyOperation: { mode: 'new', bodyId: 'revolved-body' } })])).toThrow(AggregateError);
    expect(releases).toBe(1);
  });
});
