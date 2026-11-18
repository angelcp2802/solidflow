import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it } from 'vitest';
import { addFeature, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import type { AllFeaturePatternOperation } from '../model/featurePatterns';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { withNativeOwners } from './kernel.native-ownership';
import type { BodyReference, Feature, RepetitionFeature, Vec3 } from './kernel.types';

const require = createRequire(import.meta.url), seed: BodyReference = { bodyId: 'A', sourceFeatureId: 'seed-cap' };
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')) })), 60_000);
const original = () => validateDocument(require('../../scripts/desktop-part-additive-all-original.cjs')());
type Kind = RepetitionFeature['type'];
type AllPattern = RepetitionFeature & { featurePattern: AllFeaturePatternOperation };
function pattern(kind: Kind = 'linearPattern', count = 2): AllPattern {
  const common = { id: 'positive-all', name: 'Original positive ALL pattern', baseFeatureId: 'create-c', suppressed: false,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: ['seed-cap'] },
    featurePattern: { mode: 'regenerate' as const, scope: 'all' as const, reevaluateAt: 'patternInput' as const,
      bindings: [{ source: seed, targetBodyIds: 'scope' as const }], referencePolicies: [], variation: { kind: 'none' as const } } };
  if (kind === 'linearPattern') return { ...common, type: kind, first: { direction: [1, 0, 0], spacing: 10, count }, second: null, secondSeedOnly: false, skipped: [] };
  if (kind === 'circularPattern') return { ...common, type: kind, axis: { origin: [5, 5, 0], direction: [0, 0, 1] }, count: 2, angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  return { ...common, type: kind, support: { kind: 'plane', planeId: 'mirror-x5' }, mergeBodies: false };
}
function fixture(check: (engine: CadEngine) => void) {
  const engine = new CadEngine(); let primary: unknown;
  try { check(engine); } catch (error) { primary = error; }
  try { engine.dispose(); } catch (error) { throw new AggregateError(primary ? [primary, error] : [error], 'Original additive ALL fixture cleanup failed.'); }
  if (primary) throw primary;
}
function catalog(engine: CadEngine): NativeBodyCatalog {
  const value = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!value) throw Error('Expected the actual native body catalog'); return value;
}
function metrics(engine: CadEngine, ref: BodyReference, volume: number, area: number, min: Vec3, max: Vec3) {
  const shape = catalog(engine).resolve(ref).shape; validateBodyShape(shape);
  withNativeOwners(owners => {
    expect(owners.own(shape.boundingBox).bounds).toHaveLength(2);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((v, j) => expect(Math.abs(bounds[i][j] - v)).toBeLessThan(1e-6)));
  });
}
/** Physical cap placement is not deduced from a cube-dominated outer box. */
function capGeometry(engine: CadEngine, ref: BodyReference, profile: 'rectangle' | 'circle', baseOrigin: [number, number], center: [number, number]) {
  withNativeOwners(owners => {
    const shape = catalog(engine).resolve(ref).shape, oc = getOC(), properties = owners.own(new oc.GProp_GProps());
    oc.BRepGProp.VolumeProperties(shape.wrapped, properties, 1e-10, false, false);
    const point = owners.own(properties.CentreOfMass()), capVolume = profile === 'rectangle' ? 8 : 2 * Math.PI;
    const expectedCentroid = [
      (64 * (baseOrigin[0] + 2) + capVolume * center[0]) / (64 + capVolume),
      (64 * (baseOrigin[1] + 2) + capVolume * center[1]) / (64 + capVolume),
      (128 + 5 * capVolume) / (64 + capVolume),
    ];
    [point.X(), point.Y(), point.Z()].forEach((value, axis) => expect(Math.abs(value - expectedCentroid[axis])).toBeLessThan(1e-6));
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let tops = 0, cylinders = 0;
    while (explorer.More()) {
      const raw = owners.own(explorer.Current()), face = owners.own(oc.TopoDS.Face(raw)), surface = owners.own(new oc.BRepAdaptor_Surface(face, false));
      const bounds = owners.own(new oc.Bnd_Box()), area = owners.own(new oc.GProp_GProps());
      oc.BRepBndLib.AddOptimal(face, bounds, false, false); oc.BRepGProp.SurfaceProperties(face, area, false, false);
      const box = { min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] };
      if (Math.abs(box.min[2] - 6) < 1e-6 && Math.abs(box.max[2] - 6) < 1e-6) {
        tops++; expect(surface.GetType()).toBe(oc.GeomAbs_SurfaceType.GeomAbs_Plane);
        expect(Math.abs(area.Mass() - (profile === 'rectangle' ? 4 : Math.PI))).toBeLessThan(1e-5);
        for (const side of ['min', 'max'] as const) [center[0] + (side === 'min' ? -1 : 1), center[1] + (side === 'min' ? -1 : 1), 6]
          .forEach((value, axis) => expect(Math.abs(box[side][axis] - value)).toBeLessThan(1e-6));
        const uv = oc.BRepTools.UVBounds(face, 0, 0, 0, 0), p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec());
        surface.D1((uv.UMin + uv.UMax) / 2, (uv.VMin + uv.VMax) / 2, p, du, dv);
        const a = [du.X(), du.Y(), du.Z()], b = [dv.X(), dv.Y(), dv.Z()];
        const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], length = Math.hypot(...cross);
        expect(length).toBeGreaterThan(0);
        const orientation = face.Orientation(); expect([oc.TopAbs_Orientation.TopAbs_FORWARD, oc.TopAbs_Orientation.TopAbs_REVERSED]).toContain(orientation);
        const sign = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1;
        cross.forEach((v, axis) => expect(Math.abs(sign * v / length - [0, 0, 1][axis])).toBeLessThan(1e-8));
      }
      if (surface.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
        cylinders++; expect(profile).toBe('circle');
        const cylinder = owners.own(surface.Cylinder()), location = owners.own(cylinder.Location()), axis = owners.own(cylinder.Axis()), direction = owners.own(axis.Direction());
        expect(Math.abs(cylinder.Radius() - 1)).toBeLessThan(1e-8);
        expect(Math.abs(location.X() - center[0])).toBeLessThan(1e-6); expect(Math.abs(location.Y() - center[1])).toBeLessThan(1e-6);
        expect(Math.abs(direction.X())).toBeLessThan(1e-8); expect(Math.abs(direction.Y())).toBeLessThan(1e-8); expect(Math.abs(Math.abs(direction.Z()) - 1)).toBeLessThan(1e-8);
        expect(Math.abs(box.min[2] - 4)).toBeLessThan(1e-6); expect(Math.abs(box.max[2] - 6)).toBeLessThan(1e-6);
        expect(Math.abs(area.Mass() - 4 * Math.PI)).toBeLessThan(1e-5);
      }
      explorer.Next();
    }
    expect(tops).toBe(1); expect(cylinders).toBe(profile === 'circle' ? 1 : 0);
  });
}
function healthy(engine: CadEngine, document: Document) {
  const before = serializeDocument(document), result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]); expect(serializeDocument(document)).toBe(before); return result;
}
const rows = (['linearPattern', 'circularPattern', 'mirror'] as const).flatMap(kind => (['rectangle', 'circle'] as const).map(profile => ({ kind, profile })));
it.each(rows)('regenerates one positive contact and keeps remote refs after Save/Open for $kind/$profile', row => fixture(engine => {
  let prefix = original();
  const x = row.kind === 'linearPattern' ? 10 : 6, y = row.kind === 'circularPattern' ? 6 : 0;
  prefix = updateFeature(prefix, 'create-b-profile', { profile: { kind: 'rectangle', center: [x + 2, y + 2], width: 4, height: 4 } });
  if (row.kind === 'mirror') {
    const index = prefix.features.findIndex(f => f.id === 'create-c-profile');
    prefix = validateDocument({ ...prefix, features: [...prefix.features.slice(0, index),
      { id: 'mirror-x5', name: 'Original X5 mirror plane', type: 'plane', support: { kind: 'principal', plane: 'YZ' }, offset: 5, reversed: false, suppressed: false },
      ...prefix.features.slice(index)] });
  }
  if (row.profile === 'circle') prefix = updateFeature(prefix, 'cap-profile', { profile: { kind: 'circle', center: [1, 1], radius: 1 } });
  const before = healthy(engine, prefix), sourceBody = structuredClone(before.bodies!.find(b => b.ref.bodyId === 'A')),
    remote = structuredClone(before.bodies!.find(b => b.ref.bodyId === 'C'));
  const operation = pattern(row.kind), saved = parseDocument(serializeDocument(addFeature(prefix, operation))), result = healthy(engine, saved);
  expect(saved.features.at(-1)).toEqual(operation); expect(result.bodies).toHaveLength(3);
  expect(result.bodies!.find(b => b.ref.bodyId === 'A')).toEqual(sourceBody); expect(result.bodies!.find(b => b.ref.bodyId === 'C')).toEqual(remote);
  const amount = row.profile === 'circle' ? 2 * Math.PI : 8, surface = row.profile === 'circle' ? 4 * Math.PI : 16;
  metrics(engine, seed, 64 + amount, 96 + surface, [0, 0, 0], [4, 4, 6]);
  metrics(engine, { bodyId: 'B', sourceFeatureId: operation.id }, 64 + amount, 96 + surface, [x, y, 0], [x + 4, y + 4, 6]);
  capGeometry(engine, seed, row.profile, [0, 0], [1, 1]);
  capGeometry(engine, { bodyId: 'B', sourceFeatureId: operation.id }, row.profile, [x, y],
    row.kind === 'linearPattern' ? [11, 1] : row.kind === 'circularPattern' ? [9, 9] : [9, 1]);
  metrics(engine, { bodyId: 'C', sourceFeatureId: 'create-c' }, 64, 96, [30, 0, 0], [34, 4, 4]);
  expect(() => catalog(engine).resolve({ bodyId: 'A', sourceFeatureId: operation.id })).toThrow();
  expect(() => catalog(engine).resolve({ bodyId: 'C', sourceFeatureId: operation.id })).toThrow();
  expect(Math.abs(result.volume - (192 + 2 * amount))).toBeLessThan(1e-5);
}), 60_000);

it('discovers an earlier D before the same last predecessor and retains unchanged saved ALL intent through history', () => fixture(engine => {
  const prefix = original(), operation = pattern('linearPattern', 3), c = prefix.features.findIndex(f => f.id === 'create-c-profile');
  const d = structuredClone(prefix.features.filter(f => f.id.startsWith('create-b'))).map(f => f.type === 'sketch'
    ? { ...f, id: 'create-d-profile', name: 'Original D profile', profile: { kind: 'rectangle' as const, center: [22, 2] as [number, number], width: 4, height: 4 } }
    : { ...f, id: 'create-d', name: 'Original D', sketchId: 'create-d-profile', bodyOperation: { mode: 'new' as const, bodyId: 'D' } });
  const withD = validateDocument({ ...prefix, features: [...prefix.features.slice(0, c), ...d, ...prefix.features.slice(c)] });
  const saved = addFeature(withD, operation), history = new DocumentHistory(saved), result = healthy(engine, parseDocument(serializeDocument(saved)));
  expect(result.bodies).toHaveLength(4); expect(saved.features.at(-1)).toEqual(operation); expect(saved.features.at(-2)!.id).toBe('create-c');
  metrics(engine, { bodyId: 'B', sourceFeatureId: operation.id }, 72, 112, [10, 0, 0], [14, 4, 6]);
  metrics(engine, { bodyId: 'D', sourceFeatureId: operation.id }, 72, 112, [20, 0, 0], [24, 4, 6]);
  expect(Math.abs(result.volume - 280)).toBeLessThan(1e-5);
  const changed = updateFeature(saved, 'cap-profile', { profile: { kind: 'rectangle', center: [1, 1], width: 2, height: 1 } });
  history.apply(changed); healthy(engine, history.current); healthy(engine, history.undo());
  expect(history.current.features).toEqual(saved.features); healthy(engine, history.redo());
  expect((history.current.features.at(-1) as AllPattern).featurePattern).toEqual(operation.featurePattern);
}), 60_000);

it('measures actual partial overlap and rejects fully contained addresses without allocating poststates', () => fixture(engine => {
  const operation = pattern(), overlap = updateFeature(original(), 'create-b-profile', { offset: 5 });
  healthy(engine, addFeature(overlap, operation)); metrics(engine, { bodyId: 'B', sourceFeatureId: operation.id }, 68, 104, [10, 0, 4], [14, 4, 9]);
  let contained = updateFeature(original(), 'create-b-profile', { offset: 3, profile: { kind: 'rectangle', center: [12, 2], width: 6, height: 6 } });
  const before = healthy(engine, contained), containedPrefix = contained, serialized = serializeDocument(contained); contained = addFeature(contained, operation);
  const rejected = engine.build(contained.features);
  expect(rejected.featureErrors).toHaveLength(1); expect(rejected.featureErrors[0].id).toBe(operation.id); expect(rejected.featureErrors[0].message).toMatch(/changes no material/);
  expect(rejected.bodies).toEqual(before.bodies); expect(serializeDocument(containedPrefix)).toBe(serialized);
  expect(() => catalog(engine).resolve({ bodyId: 'B', sourceFeatureId: operation.id })).toThrow();
  expect(() => engine.export('step')).toThrow(/errores/);
}), 60_000);

it('uses the changed working owner for the next address rather than its historical input shape', () => fixture(engine => {
  const prefix = original(), baseline = healthy(engine, prefix), operation = pattern('linearPattern', 3);
  if (operation.type !== 'linearPattern') throw Error('Original linear operation required');
  operation.first.spacing = 2;
  const result = healthy(engine, addFeature(prefix, operation));
  // Address X2 extends the cap to X4. Only that real intermediate output gives
  // the following X4 tool a whole side-face contact; the input owner only meets
  // it along an invalid edge. Cap6x2x2 adds24 volume and40 exposed area to base.
  metrics(engine, { bodyId: 'A', sourceFeatureId: operation.id }, 88, 136, [0, 0, 0], [6, 4, 6]);
  expect(result.bodies!.filter(b => b.ref.bodyId !== 'A')).toEqual(baseline.bodies!.filter(b => b.ref.bodyId !== 'A'));
  const edge = pattern(); if (edge.type !== 'linearPattern') throw Error('Linear operation required'); edge.first.spacing = 4;
  const rejected = engine.build(addFeature(prefix, edge).features);
  expect(rejected.featureErrors).toHaveLength(1); expect(rejected.bodies).toEqual(baseline.bodies);
}), 60_000);

it('rejects a two-owner bridge and an indeterminate positive gap without changing the input owners', () => fixture(engine => {
  let bridge = updateFeature(original(), 'create-b-profile', { profile: { kind: 'rectangle', center: [10.5, 2], width: 1, height: 4 } });
  const index = bridge.features.findIndex(f => f.id === 'create-c-profile');
  bridge = validateDocument({ ...bridge, features: [...bridge.features.slice(0, index),
    { id: 'bridge-d-profile', name: 'Original adjacent D profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [11.5, 2], width: 1, height: 4 } },
    { id: 'create-d', name: 'Original adjacent D', type: 'extrude', sketchId: 'bridge-d-profile', depth: 4, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: 'D' }, suppressed: false }, ...bridge.features.slice(index)] });
  const originalBridge = healthy(engine, bridge), rejected = engine.build(addFeature(bridge, pattern()).features);
  expect(rejected.featureErrors).toHaveLength(1); expect(rejected.featureErrors[0].message).toMatch(/toca varios cuerpos/);
  expect(rejected.bodies).toEqual(originalBridge.bodies);
  const near = updateFeature(original(), 'create-b', { depth: 3.9999998 }), originalNear = healthy(engine, near);
  const gap = engine.build(addFeature(near, pattern()).features);
  expect(gap.featureErrors).toHaveLength(1); expect(gap.featureErrors[0].message).toMatch(/demasiado cerca/);
  expect(gap.bodies).toEqual(originalNear.bodies); expect(() => engine.export('step')).toThrow(/errores/);
}), 60_000);
