import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, Face, getOC, makeBox, makePolygon, makeSphere, measureShapeSurfaceProperties,
  measureShapeVolumeProperties, revolution, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { placeAssemblyBody } from './kernel.assembly-placements';
import { extractAssemblyFaceSupport, UnsupportedAssemblySurfaceError, type AssemblyNativeSupport } from './kernel.assembly-supports';
import { bodyBoolean, validateBodyShape } from './kernel.bodies';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';

// Original native boxes, explicit-axis cylinders and a revolved triangle, in
// mm. Expected coordinates/radii/normals are Cartesian construction oracles,
// not mesh/bounds approximations, nominal document fields or extractor outputs.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const CONTEXT = 'Assembly face support extraction or release failed.';
function close(actual: Vec3, expected: Vec3): void {
  actual.forEach((coordinate, index) => expect(Math.abs(coordinate - expected[index])).toBeLessThan(1e-8));
}
function metrics(shape: Shape3D, volume: number, area: number): void {
  withNativeOwners(owners => {
    validateBodyShape(shape); expect(owners.ownAll(shape.solids)).toHaveLength(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
  });
}
function cylinder(owners: NativeOwners, radius = 2, height = 12, point: Vec3 = [3, 4, 5]): Shape3D {
  const oc = getOC(), p = owners.own(new oc.gp_Pnt(...point)), axis = owners.own(new oc.gp_Dir(0, 0, 1)),
    x = owners.own(new oc.gp_Dir(1, 0, 0)), frame = owners.own(new oc.gp_Ax2(p, axis, x)),
    builder = owners.own(new oc.BRepPrimAPI_MakeCylinder(frame, radius, height)), raw = owners.own(builder.Shape());
  return owners.own(cast(raw)).asShape3D();
}
function surface(owners: NativeOwners, shape: Shape3D, kind: 'CYLINDRE' | 'SPHERE' | 'CONE'): Face {
  const faces = owners.ownAll(shape.faces).filter(face => face.geomType === kind);
  expect(faces).toHaveLength(1); return faces[0];
}
function top(owners: NativeOwners, shape: Shape3D, center: Vec3): Face {
  const faces = owners.ownAll(shape.faces).filter(face => withNativeOwners(local => {
    const actual = local.own(measureShapeSurfaceProperties(face)).centerOfMass;
    return actual.every((coordinate, index) => Math.abs(coordinate - center[index]) < 1e-8);
  }));
  expect(faces).toHaveLength(1); return faces[0];
}
function cylinderData(face: Face) {
  const data = extractAssemblyFaceSupport(face);
  if (data.kind !== 'cylinder') throw new Error('Original cylinder fixture was not classified.');
  return data;
}
function planeData(face: Face) {
  const data = extractAssemblyFaceSupport(face);
  if (data.kind !== 'plane') throw new Error('Original plane fixture was not classified.');
  return data;
}
function tolerance(face: Face, data: AssemblyNativeSupport): void {
  const actual = getOC().BRep_Tool.Tolerance(face.wrapped);
  expect(Number.isFinite(actual) && actual >= 0).toBe(true); expect(data.tolerance).toBe(actual);
}

it('extracts all six outward box planes with canonical support points and stable X', () => withNativeOwners(owners => {
  const shape = owners.own(makeBox([-2, -3, 1], [4, 5, 7])), faces = owners.ownAll(shape.faces);
  const expected: { normal: Vec3; point: Vec3; x: Vec3 }[] = [
    { normal: [-1, 0, 0], point: [-2, 0, 0], x: [0, 1, 0] }, { normal: [1, 0, 0], point: [4, 0, 0], x: [0, 1, 0] },
    { normal: [0, -1, 0], point: [0, -3, 0], x: [1, 0, 0] }, { normal: [0, 1, 0], point: [0, 5, 0], x: [1, 0, 0] },
    { normal: [0, 0, -1], point: [0, 0, 1], x: [1, 0, 0] }, { normal: [0, 0, 1], point: [0, 0, 7], x: [1, 0, 0] },
  ];
  const data = faces.map(face => ({ face, data: planeData(face) })); expect(data).toHaveLength(6);
  for (const oracle of expected) {
    const match = data.filter(item => item.data.normal.every((coordinate, i) => Math.abs(coordinate - oracle.normal[i]) < 1e-8));
    expect(match).toHaveLength(1); close(match[0].data.point, oracle.point); close(match[0].data.xDirection, oracle.x); tolerance(match[0].face, match[0].data);
  }
  metrics(shape, 288, 264);
}), 60_000);

it('reverses a planar normal without changing the borrowed face or plane support', () => withNativeOwners(owners => {
  const shape = owners.own(makeBox([-2, -3, 1], [4, 5, 7])), face = top(owners, shape, [1, 1, 7]),
    orientation = face.wrapped.Orientation(), reversed = owners.own(face.flipOrientation());
  const a = planeData(face), b = planeData(reversed);
  close(a.normal, [0, 0, 1]); close(b.normal, [0, 0, -1]); close(a.point, [0, 0, 7]); close(b.point, [0, 0, 7]);
  close(a.xDirection, [1, 0, 0]); close(b.xDirection, [1, 0, 0]); expect(face.wrapped.Orientation()).toBe(orientation);
  metrics(shape, 288, 264);
}), 60_000);

it('extracts an explicitly constructed cylinder axis, radial X, radius and native face tolerance', () => withNativeOwners(owners => {
  const shape = cylinder(owners), face = surface(owners, shape, 'CYLINDRE'), data = cylinderData(face);
  close(data.point, [3, 4, 5]); close(data.axis, [0, 0, 1]); close(data.xDirection, [1, 0, 0]); expect(Math.abs(data.radius - 2)).toBeLessThan(1e-12);
  tolerance(face, data); metrics(shape, 48 * Math.PI, 56 * Math.PI);
}), 60_000);

it('keeps cylinder cap normals outward independently of its geometric axis', () => withNativeOwners(owners => {
  const shape = cylinder(owners), lower = top(owners, shape, [3, 4, 5]), upper = top(owners, shape, [3, 4, 17]);
  close(planeData(lower).normal, [0, 0, -1]); close(planeData(upper).normal, [0, 0, 1]);
  close(planeData(lower).point, [0, 0, 5]); close(planeData(upper).point, [0, 0, 17]);
}), 60_000);

it('reads the real eccentric bore cylinder without turning face reversal into a reversed axis', () => withNativeOwners(owners => {
  const outer = cylinder(owners, 2, 12, [0, 0, 0]), bore = cylinder(owners, .25, 12, [1, 0, 0]),
    shape = owners.own(bodyBoolean('subtract', outer, bore)), faces = owners.ownAll(shape.faces).filter(face => face.geomType === 'CYLINDRE');
  expect(faces).toHaveLength(2);
  const values = faces.map(face => ({ face, data: cylinderData(face) })), inner = values.filter(item => Math.abs(item.data.radius - .25) < 1e-12);
  expect(inner).toHaveLength(1); close(inner[0].data.axis, [0, 0, 1]);
  expect(Math.abs(inner[0].data.point[0] - 1)).toBeLessThan(1e-8); expect(Math.abs(inner[0].data.point[1])).toBeLessThan(1e-8);
  expect(inner[0].face.wrapped.Orientation()).toBe(getOC().TopAbs_Orientation.TopAbs_REVERSED);
  tolerance(inner[0].face, inner[0].data); metrics(shape, 189 * Math.PI / 4, 495 * Math.PI / 8);
}), 60_000);

it('keeps geometric cylinder axes unchanged when only face orientation is reversed', () => withNativeOwners(owners => {
  const shape = cylinder(owners), face = surface(owners, shape, 'CYLINDRE'), reversed = owners.own(face.flipOrientation());
  expect(cylinderData(reversed)).toEqual(cylinderData(face)); metrics(shape, 48 * Math.PI, 56 * Math.PI);
}), 60_000);

it.each([
  { name: 'Z90', q: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number], t: [7, -5, 9] as Vec3,
    point: [3, -2, 14] as Vec3, axis: [0, 0, 1] as Vec3, x: [0, 1, 0] as Vec3 },
  { name: 'X90', q: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number], t: [7, 8, 9] as Vec3,
    point: [10, 3, 13] as Vec3, axis: [0, -1, 0] as Vec3, x: [1, 0, 0] as Vec3 },
])('extracts actual native $name cylinder placement rather than source metadata', row => withNativeOwners(owners => {
  const source = cylinder(owners), shape = owners.own(placeAssemblyBody(source, { translation: row.t, rotation: row.q })),
    face = surface(owners, shape, 'CYLINDRE'), data = cylinderData(face);
  close(data.point, row.point); close(data.axis, row.axis); close(data.xDirection, row.x); expect(Math.abs(data.radius - 2)).toBeLessThan(1e-12);
  tolerance(face, data); metrics(shape, 48 * Math.PI, 56 * Math.PI); metrics(source, 48 * Math.PI, 56 * Math.PI);
}), 60_000);

it('uses the placed plane and the existing canonical frame convention after a native rotation', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([-2, -3, 1], [4, 5, 7])), shape = owners.own(placeAssemblyBody(source,
    { translation: [7, -5, 9], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }));
  const upper = planeData(top(owners, shape, [6, -4, 16])), side = planeData(top(owners, shape, [6, -1, 13]));
  close(upper.point, [0, 0, 16]); close(upper.normal, [0, 0, 1]); close(upper.xDirection, [1, 0, 0]);
  close(side.point, [0, -1, 0]); close(side.normal, [0, 1, 0]); close(side.xDirection, [1, 0, 0]); metrics(source, 288, 264);
}), 60_000);

it.each(['plane', 'cylinder'] as const)('returns detached %s data that survives face and solid disposal', kind => {
  const data = withNativeOwners(owners => {
    const shape = kind === 'plane' ? owners.own(makeBox([-2, -3, 1], [4, 5, 7])) : cylinder(owners);
    const face = kind === 'plane' ? top(owners, shape, [1, 1, 7]) : surface(owners, shape, 'CYLINDRE');
    const a = extractAssemblyFaceSupport(face), b = extractAssemblyFaceSupport(face);
    expect(a.point).not.toBe(b.point); expect(a.xDirection).not.toBe(b.xDirection); return a;
  });
  expect(Object.hasOwn(data, 'wrapped') || Object.hasOwn(data, 'delete')).toBe(false);
  if (data.kind === 'plane') { close(data.point, [0, 0, 7]); close(data.normal, [0, 0, 1]); }
  else { close(data.point, [3, 4, 5]); close(data.axis, [0, 0, 1]); expect(data.radius).toBe(2); }
});

it.each(['SPHERE', 'CONE'] as const)('rejects a genuine native %s instead of fitting an axis or plane', kind => withNativeOwners(owners => {
  const shape = kind === 'SPHERE' ? owners.own(makeSphere(3))
    : owners.own(revolution(owners.own(makePolygon([[0, 0, 0], [2, 0, 0], [0, 0, 4]])), [0, 0, 0], [0, 0, 1], 360));
  const face = surface(owners, shape, kind), orientation = face.wrapped.Orientation();
  expect(() => extractAssemblyFaceSupport(face)).toThrow(UnsupportedAssemblySurfaceError); expect(face.wrapped.Orientation()).toBe(orientation);
  metrics(shape, kind === 'SPHERE' ? 36 * Math.PI : 16 * Math.PI / 3,
    kind === 'SPHERE' ? 36 * Math.PI : 4 * Math.PI + 4 * Math.PI * Math.sqrt(5));
}), 60_000);

it.each(['TopAbs_INTERNAL', 'TopAbs_EXTERNAL'] as const)('rejects ambiguous material orientation %s without mutating the borrowed original', name => withNativeOwners(owners => {
  const shape = owners.own(makeBox([-2, -3, 1], [4, 5, 7])), face = top(owners, shape, [1, 1, 7]),
    raw = owners.own(face.wrapped.Oriented(getOC().TopAbs_Orientation[name])), selected = owners.own(cast(raw));
  if (!(selected instanceof Face)) throw new Error('Original face downcast failed.');
  const failure = captured(() => extractAssemblyFaceSupport(selected));
  expect(failure).toBeInstanceOf(Error); expect(failure).not.toBeInstanceOf(UnsupportedAssemblySurfaceError);
  expect((failure as Error).message).toContain('orientación'); close(planeData(face).normal, [0, 0, 1]);
}), 60_000);

function captured(action: () => unknown): unknown { try { action(); } catch (error) { return error; } return undefined; }
function errorTree(error: unknown): unknown[] {
  return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(errorTree) : [])];
}
/** Patch only wrappers actually received by this component before arena adoption. */
function supportFault<T>(patch: (owner: NativeOwner) => void, action: () => T): T {
  const real = ownership.withNativeOwners;
  const replacement: typeof ownership.withNativeOwners = <R>(operation: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      if (context === CONTEXT) { const own = owners.own.bind(owners); owners.own = <S extends NativeOwner>(value: S): S => { patch(value); return own(value); }; }
      return operation(owners);
    }, retained, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return action(); } finally { spy.mockRestore(); }
}

it.each(['type', 'point', 'radius'] as const)('preserves a real native %s query failure and releases every received wrapper once', fault => withNativeOwners(owners => {
  const shape = fault === 'radius' ? cylinder(owners) : owners.own(makeBox([-2, -3, 1], [4, 5, 7])),
    face = fault === 'radius' ? surface(owners, shape, 'CYLINDRE') : top(owners, shape, [1, 1, 7]),
    oc = getOC(), primary = new Error('Original support query failure ' + fault), records: { releases: number }[] = [];
  const error = captured(() => supportFault(value => {
    const record = { releases: 0 }, realDelete = value.delete.bind(value); records.push(record);
    Object.defineProperty(value, 'delete', { configurable: true, value: () => { record.releases++; realDelete(); } });
    if (fault === 'type' && value instanceof oc.BRepAdaptor_Surface) {
      const realQuery = value.GetType.bind(value); Object.defineProperty(value, 'GetType', { configurable: true, value: () => { realQuery(); throw primary; } });
    } else if (fault === 'point' && value instanceof oc.gp_Pnt) {
      const realQuery = value.X.bind(value); Object.defineProperty(value, 'X', { configurable: true, value: () => { realQuery(); throw primary; } });
    } else if (fault === 'radius' && value instanceof oc.gp_Cylinder) {
      const realQuery = value.Radius.bind(value); Object.defineProperty(value, 'Radius', { configurable: true, value: () => { realQuery(); throw primary; } });
    }
  }, () => extractAssemblyFaceSupport(face)));
  expect(error).toBe(primary); expect(records.length).toBeGreaterThan(0); expect(records.every(item => item.releases === 1)).toBe(true);
  expect(face.wrapped.IsNull()).toBe(false); metrics(shape, fault === 'radius' ? 48 * Math.PI : 288, fault === 'radius' ? 56 * Math.PI : 264);
}), 60_000);

it.each(['point NaN', 'zero direction', 'parallel directions'] as const)('rejects an invalid observed native plane %s', fault => withNativeOwners(owners => {
  const shape = owners.own(makeBox([-2, -3, 1], [4, 5, 7])), face = top(owners, shape, [1, 1, 7]), oc = getOC(); let directions = 0;
  expect(() => supportFault(value => {
    if (fault === 'point NaN' && value instanceof oc.gp_Pnt) {
      const actual = value.X.bind(value); Object.defineProperty(value, 'X', { configurable: true, value: () => { actual(); return NaN; } });
    }
    if (value instanceof oc.gp_Dir && ++directions === (fault === 'parallel directions' ? 2 : 1) && fault !== 'point NaN') {
      for (const [index, name] of (['X', 'Y', 'Z'] as const).entries()) {
        const actual = value[name].bind(value); Object.defineProperty(value, name, { configurable: true, value: () => { actual(); return fault === 'parallel directions' && index === 0 ? 1 : 0; } });
      }
    }
  }, () => extractAssemblyFaceSupport(face))).toThrow(); metrics(shape, 288, 264);
}), 60_000);

it.each([0, -1, NaN, Infinity])('rejects invalid native cylinder radius %s after a real query', radius => withNativeOwners(owners => {
  const shape = cylinder(owners), face = surface(owners, shape, 'CYLINDRE'), oc = getOC();
  expect(() => supportFault(value => {
    if (value instanceof oc.gp_Cylinder) { const actual = value.Radius.bind(value); Object.defineProperty(value, 'Radius', { configurable: true, value: () => { actual(); return radius; } }); }
  }, () => extractAssemblyFaceSupport(face))).toThrow('radio'); metrics(shape, 48 * Math.PI, 56 * Math.PI);
}), 60_000);

it.each(['non-finite', 'degenerate'] as const)('rejects a genuinely queried cylinder axis with %s observations', fault => withNativeOwners(owners => {
  const shape = cylinder(owners), face = surface(owners, shape, 'CYLINDRE'), oc = getOC(); let directions = 0;
  expect(() => supportFault(value => {
    if (value instanceof oc.gp_Dir && ++directions === 1) {
      for (const name of ['X', 'Y', 'Z'] as const) {
        const actual = value[name].bind(value);
        Object.defineProperty(value, name, { configurable: true, value: () => {
          const observed = actual(); return fault === 'degenerate' ? 0 : name === 'X' ? NaN : observed;
        } });
      }
    }
  }, () => extractAssemblyFaceSupport(face))).toThrow(); metrics(shape, 48 * Math.PI, 56 * Math.PI);
}), 60_000);

it.each(['primary', 'NaN', 'negative'] as const)('rejects native face tolerance %s without consuming the borrowed face', fault => withNativeOwners(owners => {
  const shape = cylinder(owners), face = surface(owners, shape, 'CYLINDRE'), oc = getOC(), actual = oc.BRep_Tool.Tolerance.bind(oc.BRep_Tool), primary = new Error('Original native tolerance query failure');
  let queried = 0;
  const query = vi.spyOn(oc.BRep_Tool, 'Tolerance').mockImplementation(raw => { actual(raw); queried++; if (fault === 'primary') throw primary; return fault === 'NaN' ? NaN : -1; });
  let error: unknown; try { error = captured(() => extractAssemblyFaceSupport(face)); } finally { query.mockRestore(); }
  expect(queried).toBe(1); if (fault === 'primary') expect(error).toBe(primary); else expect((error as Error).message).toContain('tolerancia');
  expect(face.wrapped.IsNull()).toBe(false); metrics(shape, 48 * Math.PI, 56 * Math.PI);
}), 60_000);

it.each(['adaptor', 'position', 'coordinate', 'primary plus cleanup'] as const)('withholds detached data after %s release failure and retains all causes', fault => withNativeOwners(owners => {
  const shape = owners.own(makeBox([-2, -3, 1], [4, 5, 7])), face = top(owners, shape, [1, 1, 7]), oc = getOC(),
    primary = new Error('Original support primary failure'), cleanup = new Error('Original support cleanup failure'), records: { releases: number }[] = [];
  let delivered: AssemblyNativeSupport | undefined;
  const error = captured(() => supportFault(value => {
    const record = { releases: 0 }, actualDelete = value.delete.bind(value); records.push(record);
    const failRelease = (fault === 'adaptor' || fault === 'primary plus cleanup') && value instanceof oc.BRepAdaptor_Surface
      || fault === 'position' && value instanceof oc.gp_Ax3 || fault === 'coordinate' && value instanceof oc.gp_Pnt;
    Object.defineProperty(value, 'delete', { configurable: true, value: () => { record.releases++; actualDelete(); if (failRelease) throw cleanup; } });
    if (fault === 'primary plus cleanup' && value instanceof oc.gp_Pnt) {
      const actualQuery = value.X.bind(value); Object.defineProperty(value, 'X', { configurable: true, value: () => { actualQuery(); throw primary; } });
    }
  }, () => { delivered = extractAssemblyFaceSupport(face); }));
  expect(delivered).toBeUndefined(); expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup);
  if (fault === 'primary plus cleanup') expect(errorTree(error)).toContain(primary);
  expect(records.every(item => item.releases === 1)).toBe(true); expect(face.wrapped.IsNull()).toBe(false); metrics(shape, 288, 264);
}), 60_000);
