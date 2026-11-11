import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, getOC, Plane as NativePlane, setOC, sketchCircle, sketchRectangle, Vector, Wire,
  measureShapeSurfaceProperties, measureShapeVolumeProperties, type Shape3D, type Sketch } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { makeOwnedPrimitiveSketch } from './kernel.primitive-sketch';
import { CadEngine } from './kernel.engine';
import { createFaceCatalog, resolveSelectedFaces } from './kernel.faces';
import { createEdgeCatalog, resolveEdgeReferences } from './kernel.edges';
import { framePoint } from './kernel.frames';
import { ownedNativeTopology } from './kernel.native-topology';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import type { Feature, Plane, PlaneFrame, SketchFeature, Vec3 } from './kernel.types';

// Original 2x3 rectangle/R2 circle, center(1.25,-.75), offset1.5, depth4.
// Independent principal frames and rational R60 about(1,1,1) supply geometry.
// SDK comparisons below attest legacy arithmetic/order/refs, not geometry.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const CONTEXT = 'Primitive sketch construction or release failed.';
const OBLIQUE: PlaneFrame = { origin: [7, -5, 11], xDirection: [2 / 3, 2 / 3, -1 / 3], normal: [2 / 3, -1 / 3, 2 / 3] };
interface Fixture { kind: 'rectangle' | 'circle'; plane: Plane; frame?: PlaneFrame }
const fixtures: Fixture[] = (['rectangle', 'circle'] as const).flatMap(kind => [
  ...(['XY', 'XZ', 'YZ'] as const).map(plane => ({ kind, plane })), { kind, plane: 'XY' as const, frame: OBLIQUE }]);
function feature(fixture: Fixture): SketchFeature {
  return { id: 'original-primitive', name: 'Original owned primitive', type: 'sketch', suppressed: false, plane: fixture.plane, offset: 1.5,
    profile: fixture.kind === 'rectangle' ? { kind: 'rectangle', center: [1.25, -.75], width: 2, height: 3 }
      : { kind: 'circle', center: [1.25, -.75], radius: 2 } };
}
function expected(fixture: Fixture) {
  const x: Vec3 = fixture.frame ? [2 / 3, 2 / 3, -1 / 3] : fixture.plane === 'YZ' ? [0, 1, 0] : [1, 0, 0],
    y: Vec3 = fixture.frame ? [-1 / 3, 2 / 3, 2 / 3] : fixture.plane === 'XY' ? [0, 1, 0] : [0, 0, 1],
    normal: Vec3 = fixture.frame ? [2 / 3, -1 / 3, 2 / 3] : fixture.plane === 'XY' ? [0, 0, 1]
      : fixture.plane === 'XZ' ? [0, -1, 0] : [1, 0, 0],
    origin: Vec3 = fixture.frame ? [7, -5, 11] : fixture.plane === 'XY' ? [0, 0, 1.5]
      : fixture.plane === 'XZ' ? [0, -1.5, 0] : [1.5, 0, 0],
    center = origin.map((v, i) => v + 1.25 * x[i] - .75 * y[i]) as Vec3;
  const corners = [-1, 1].flatMap(u => [-1.5, 1.5].flatMap(v => [0, 4].map(d =>
    center.map((c, i) => c + u * x[i] + v * y[i] + d * normal[i]) as Vec3)));
  const minimum = [0, 1, 2].map(i => fixture.kind === 'rectangle' ? Math.min(...corners.map(p => p[i]))
    : center[i] + Math.min(0, 4 * normal[i]) - 2 * Math.sqrt(1 - normal[i] ** 2)) as Vec3,
    maximum = [0, 1, 2].map(i => fixture.kind === 'rectangle' ? Math.max(...corners.map(p => p[i]))
      : center[i] + Math.max(0, 4 * normal[i]) + 2 * Math.sqrt(1 - normal[i] ** 2)) as Vec3;
  return { center, normal, minimum, maximum, volume: fixture.kind === 'rectangle' ? 24 : 16 * Math.PI,
    area: fixture.kind === 'rectangle' ? 52 : 24 * Math.PI };
}
const close = (actual: number, wanted: number, tolerance = 1e-6) => expect(Math.abs(actual - wanted)).toBeLessThanOrEqual(tolerance);
function solid(sketch: Sketch, owners: NativeOwners): Shape3D {
  const oc = getOC(), faceBuilder = owners.own(new oc.BRepBuilderAPI_MakeFace(sketch.wire.wrapped, false));
  expect(faceBuilder.IsDone()).toBe(true);
  const face = owners.own(faceBuilder.Face()), vector = owners.own(new oc.gp_Vec(...sketch.defaultDirection.toTuple()));
  vector.Normalize(); vector.Multiply(4);
  const builder = owners.own(new oc.BRepPrimAPI_MakePrism(face, vector, false, true)), raw = owners.own(builder.Shape());
  return owners.own(cast(raw)).asShape3D();
}
function metrics(shape: Shape3D, wanted: ReturnType<typeof expected>, owners: NativeOwners): void {
  const oc = getOC();
  expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)).IsValid()).toBe(true);
  expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1);
  close(owners.own(measureShapeVolumeProperties(shape)).volume, wanted.volume, 1e-5);
  close(owners.own(measureShapeSurfaceProperties(shape)).area, wanted.area, 1e-5);
  owners.own(shape.boundingBox).bounds.forEach((side, j) => side.forEach((v, i) => close(v, [wanted.minimum, wanted.maximum][j][i])));
}

it.each(fixtures)('builds independently measured original $kind in $plane with support $frame', fixture => withNativeOwners(owners => {
  const input = feature(fixture), before = JSON.stringify([input, fixture.frame]), wanted = expected(fixture),
    sketch = owners.own(makeOwnedPrimitiveSketch(input, input.offset, fixture.frame));
  sketch.defaultOrigin.toTuple().forEach((v, i) => close(v, wanted.center[i], 1e-12));
  sketch.defaultDirection.toTuple().forEach((v, i) => close(v, wanted.normal[i], 1e-12));
  metrics(solid(sketch, owners), wanted, owners);
  expect(JSON.stringify([input, fixture.frame])).toBe(before);
}), 60_000);

function legacy(fixture: Fixture, owners: NativeOwners): Sketch {
  const input = feature(fixture);
  if (input.profile.kind === 'entities') throw new Error('Original primitive profile required.');
  const [u, v] = input.profile.center,
    origin: Vec3 = fixture.frame ? framePoint(fixture.frame, u, v) : fixture.plane === 'XY' ? [u, v, input.offset]
      : fixture.plane === 'XZ' ? [u, -input.offset, v] : [input.offset, u, v];
  if (fixture.frame) {
    const plane = owners.own(new NativePlane(origin, fixture.frame.xDirection, fixture.frame.normal));
    return owners.own(fixture.kind === 'rectangle' ? sketchRectangle(2, 3, { plane }) : sketchCircle(2, { plane }));
  }
  return owners.own(fixture.kind === 'rectangle' ? sketchRectangle(2, 3, { plane: fixture.plane, origin }) : sketchCircle(2, { plane: fixture.plane, origin }));
}
function wireSamples(sketch: Sketch, owners: NativeOwners): Vec3[][] {
  return owners.ownAll(ownedNativeTopology(sketch.wire, 'edge')).map(edge => {
    const curve = owners.own(new (getOC().BRepAdaptor_Curve)(edge.wrapped)), first = curve.FirstParameter(), last = curve.LastParameter();
    return [0, .125, .25, .5, .75, 1].map(t => {
      const p = owners.own(curve.Value(first + (last - first) * t)); return [p.X(), p.Y(), p.Z()] as Vec3;
    });
  });
}
function ownCatalog<C extends { dispose(): void }>(owners: NativeOwners, catalog: C): C {
  owners.own({ delete: () => catalog.dispose() }); return catalog;
}
it.each(fixtures)('preserves exact legacy $kind wire traversal, circle seam and saved references in $plane with support $frame', fixture => withNativeOwners(owners => {
  const input = feature(fixture), actual = owners.own(makeOwnedPrimitiveSketch(input, input.offset, fixture.frame)), baseline = legacy(fixture, owners),
    actualSamples = wireSamples(actual, owners), oldSamples = wireSamples(baseline, owners);
  expect(actualSamples).toHaveLength(fixture.kind === 'rectangle' ? 4 : 1); expect(actualSamples).toHaveLength(oldSamples.length);
  actualSamples.forEach((edge, i) => edge.forEach((p, j) => p.forEach((v, k) => expect(v === oldSamples[i][j][k]).toBe(true))));
  const actualSolid = solid(actual, owners), oldSolid = solid(baseline, owners),
    a = ownCatalog(owners, createFaceCatalog(actualSolid, 'original-primitive-solid')), b = ownCatalog(owners, createFaceCatalog(oldSolid, 'original-primitive-solid')),
    ae = ownCatalog(owners, createEdgeCatalog(actualSolid, 'original-primitive-solid')), be = ownCatalog(owners, createEdgeCatalog(oldSolid, 'original-primitive-solid'));
  expect(a.entries.map(e => e.ref)).toEqual(b.entries.map(e => e.ref)); expect(ae.entries.map(e => e.ref)).toEqual(be.entries.map(e => e.ref));
  // Consume copied legacy refs against fresh native catalogs. This checks
  // persistable reference compatibility, not complete document save/reopen.
  const oldFaces = JSON.parse(JSON.stringify(b.entries.map(e => e.ref))), oldEdges = JSON.parse(JSON.stringify(be.entries.map(e => e.ref)));
  const boundFaces = resolveSelectedFaces(a, oldFaces, 'original-primitive-solid'), boundEdges = resolveEdgeReferences(ae, oldEdges, 'original-primitive-solid');
  expect(boundFaces).toHaveLength(a.entries.length); expect(boundEdges).toHaveLength(ae.entries.length);
  boundFaces.forEach((face, i) => expect(face).toBe(a.entries[i].face)); boundEdges.forEach((edge, i) => expect(edge).toBe(ae.entries[i].edge));
}), 60_000);

interface Record { value: NativeOwner; kind: string; releases: number; fallbackReleases: number }
interface Faults { patch?: (value: NativeOwner, kind: string) => void; transferFailure?: Error }
function observe<T>(records: Record[], faults: Faults, operation: () => T): T {
  return withNativeOwners(fallback => {
    const real = ownership.withNativeOwners, seen = new Set<NativeOwner>(), oc = getOC();
    const kindOf = (value: NativeOwner): string => value instanceof Wire ? 'wire' : value instanceof Vector ? 'metadata'
      : value instanceof oc.gp_Vec ? 'vector' : value instanceof oc.gp_Pnt ? 'point' : value instanceof oc.gp_Dir ? 'direction'
        : value instanceof oc.gp_Ax3 ? 'axis3' : value instanceof oc.gp_Ax2 ? 'axis2' : value instanceof oc.gp_Trsf ? 'transform'
          : value instanceof oc.gp_Circ ? 'circle' : value instanceof oc.BRepBuilderAPI_MakeEdge ? 'edge builder'
            : value instanceof oc.BRepBuilderAPI_MakeWire ? 'wire builder' : value instanceof oc.TopoDS_Edge ? 'edge'
              : value instanceof oc.TopoDS_Wire ? 'raw wire' : 'unexpected';
    const replacement: typeof real = <R>(action: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      if (context === CONTEXT) {
        const own = owners.own.bind(owners);
        owners.own = <S extends NativeOwner>(value: S): S => {
          const physical = value instanceof Wire || value instanceof Vector ? value.wrapped : value;
          if (!seen.has(physical)) {
            seen.add(physical); const kind = kindOf(value), record = { value: physical, kind, releases: 0, fallbackReleases: 0 }; records.push(record);
            faults.patch?.(value, kind);
            const release = physical.delete.bind(physical);
            Object.defineProperty(physical, 'delete', { configurable: true, value: () => { record.releases++; release(); } });
            fallback.own({ delete: () => { if (record.releases === 0) { record.fallbackReleases++; physical.delete(); } } });
          }
          return own(value);
        };
      }
      return action(owners);
    }, result => { const values = retained(result); if (context === CONTEXT && faults.transferFailure) throw faults.transferFailure; return values; }, context);
    const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
    try { return operation(); } finally { spy.mockRestore(); }
  });
}
function released(records: Record[]): void {
  expect(records.length).toBeGreaterThan(0); expect(records.some(r => r.kind === 'unexpected')).toBe(false);
  records.forEach(record => { expect(record.fallbackReleases).toBe(0); expect(record.releases).toBe(1); });
}
function caught(operation: () => unknown): unknown { try { operation(); } catch (error) { return error; } return undefined; }

it.each(['rectangle', 'circle'] as const)('releases every received native %s construction owner and transfers only the three sketch children', kind => {
  const fixture: Fixture = { kind, plane: 'XY', frame: OBLIQUE }, input = feature(fixture), before = JSON.stringify([input, fixture.frame]), records: Record[] = [];
  observe(records, {}, () => {
    const sketch = makeOwnedPrimitiveSketch(input, input.offset, fixture.frame);
    expect(records).toHaveLength(kind === 'rectangle' ? 48 : 18);
    expect(records.filter(r => r.kind === 'transform')).toHaveLength(2);
    expect(records.filter(r => r.kind === 'metadata')).toHaveLength(2); expect(records.filter(r => r.kind === 'wire')).toHaveLength(1);
    for (const record of records) expect(record.releases).toBe(record.kind === 'wire' || record.kind === 'metadata' ? 0 : 1);
    sketch.delete(); released(records); expect(JSON.stringify([input, fixture.frame])).toBe(before);
  });
}, 60_000);

it.each(['Normalize', 'SetTransformation', 'Build'] as const)('drains all received owners after real native %s work reports failure without publishing a sketch', method => {
  const input = feature({ kind: 'rectangle', plane: 'XY' }), before = JSON.stringify(input), records: Record[] = [], primary = new Error('Original native primitive query failure');
  let patched = false, queried = 0, result: Sketch | undefined;
  const failure = caught(() => observe(records, { patch: (value, kind) => {
    if (patched) return;
    const oc = getOC();
    if (method === 'Normalize' && kind === 'vector' && value instanceof oc.gp_Vec) {
      patched = true; const query = value.Normalize.bind(value);
      Object.defineProperty(value, method, { configurable: true, value: () => { query(); queried++; throw primary; } });
    } else if (method === 'SetTransformation' && kind === 'transform' && value instanceof oc.gp_Trsf) {
      patched = true; const query = value.SetTransformation.bind(value);
      const replacement = (...args: unknown[]) => { Reflect.apply(query, value, args); queried++; throw primary; };
      Object.defineProperty(value, method, { configurable: true, value: replacement });
    } else if (method === 'Build' && kind === 'wire builder' && value instanceof oc.BRepBuilderAPI_MakeWire) {
      patched = true; const query = value.Build.bind(value);
      Object.defineProperty(value, method, { configurable: true, value: () => { query(); queried++; throw primary; } });
    }
  } }, () => { result = makeOwnedPrimitiveSketch(input); }));
  expect(failure).toBe(primary); expect(queried).toBe(1); expect(result).toBeUndefined(); released(records); expect(JSON.stringify(input)).toBe(before);
}, 60_000);

it.each(['vector', 'point', 'direction', 'axis3', 'transform', 'edge builder', 'edge', 'wire builder', 'raw wire', 'wire', 'metadata', 'axis2', 'circle'])(
  'attempts every received physical release after transfer rejection and a real %s deletion failure', target => {
    const input = feature({ kind: target === 'axis2' || target === 'circle' ? 'circle' : 'rectangle', plane: 'XZ' }), before = JSON.stringify(input), records: Record[] = [],
      primary = new Error('Original primitive result transfer failure'), cleanup = new Error('Original native primitive cleanup failure');
    let patched = false, result: Sketch | undefined;
    const failure = caught(() => observe(records, { transferFailure: primary, patch: (value, kind) => {
      if (patched || kind !== target) return;
      patched = true; const physical = value instanceof Wire || value instanceof Vector ? value.wrapped : value, release = physical.delete.bind(physical);
      Object.defineProperty(physical, 'delete', { configurable: true, value: () => { release(); throw cleanup; } });
    } }, () => { result = makeOwnedPrimitiveSketch(input); }));
    expect(patched).toBe(true); expect(result).toBeUndefined(); expect(failure).toBeInstanceOf(NativeCleanupError);
    expect((failure as Error).cause).toBe(primary); expect([...(failure as AggregateError).errors]).toEqual([primary, cleanup]);
    released(records); expect(JSON.stringify(input)).toBe(before);
  }, 60_000);

it('withholds current native body authority after actual primitive wire construction fails, preserving the source declarations', () => {
  const profile = feature({ kind: 'rectangle', plane: 'XY' }), input: Feature[] = [profile,
    { id: 'original-owned-extrude', name: 'Original owned 4 mm prism', type: 'extrude', suppressed: false, sketchId: profile.id,
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'original-owned-body' } }],
    before = JSON.stringify(input), records: Record[] = [], primary = new Error('Original actual wire construction failure'), engine = new CadEngine();
  let queried = 0, patched = false;
  try {
    observe(records, { patch: (value, kind) => {
      if (patched || kind !== 'wire builder' || !(value instanceof getOC().BRepBuilderAPI_MakeWire)) return;
      patched = true; const query = value.Build.bind(value);
      Object.defineProperty(value, 'Build', { configurable: true, value: () => { query(); queried++; throw primary; } });
    } }, () => {
      const result = engine.build(input);
      expect(queried).toBe(1); expect(result.featureErrors).toEqual([{ id: 'original-owned-extrude', message: primary.message }]);
      expect(result.vertices).toEqual([]); expect(result.bodies ?? []).toEqual([]);
      expect(() => engine.copyCurrentBodyShape({ bodyId: 'original-owned-body', sourceFeatureId: 'original-owned-extrude' })).toThrow('reconstrucción completa y vigente');
      expect(JSON.stringify(input)).toBe(before); released(records);
    });
  } finally { engine.dispose(); }
}, 60_000);
