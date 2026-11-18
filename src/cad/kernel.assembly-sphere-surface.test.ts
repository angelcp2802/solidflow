import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { cast, Face, getOC, makeBox, makeSphere, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { extractAssemblySphereSurfaceSupport, extractAssemblyFaceSupport, extractAssemblyCylinderSurfaceSupport,
  UnsupportedAssemblySphereSurfaceError, UnsupportedAssemblySurfaceError, UnsupportedAssemblyCylinderSurfaceError } from './kernel.assembly-supports'
import * as supports from './kernel.assembly-supports'
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import { bodyBoolean } from './kernel.bodies'
import { CadEngine } from './kernel.engine'
import { placeAssemblyBody } from './kernel.assembly-placements'
import { parseDocument, type Document } from '../model/document'
import type { Vec3 } from './kernel.types'

let original: Document
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  original = parseDocument(await readFile(new URL('./fixtures/sphere-revolve-original.json', import.meta.url), 'utf8'))
}, 60_000)
const context = 'Assembly sphere surface extraction or release failed.'
const near = (a: number, b: number, tolerance = 1e-8) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
const tuple = (p: { X(): number; Y(): number; Z(): number }): Vec3 => [p.X(), p.Y(), p.Z()]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const caught = (operation: () => unknown): unknown => { try { operation() } catch (error) { return error } return undefined }
const tree = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(tree) : [])]
function sphere(owners: NativeOwners, radius = 3, center: Vec3 = [3, 4, 5]): Shape3D {
  const source = owners.own(makeSphere(radius))
  return owners.own(placeAssemblyBody(source, { translation: center, rotation: [0, 0, 0, 1] }))
}
function sphericalFace(owners: NativeOwners, shape: Shape3D, radius = 3): Face {
  const matches = owners.ownAll(ownedNativeTopology(shape, 'face')).filter(face => withNativeOwners(local => {
    const adaptor = local.own(new (getOC().BRepAdaptor_Surface)(face.wrapped, false))
    return adaptor.GetType() === getOC().GeomAbs_SurfaceType.GeomAbs_Sphere && Math.abs(local.own(adaptor.Sphere()).Radius() - radius) < 1e-10
  }))
  expect(matches).toHaveLength(1); return matches[0]
}
function metrics(shape: Shape3D, volume: number, area: number, center?: Vec3, radius?: number): void {
  withNativeOwners(owners => {
    const oc = getOC(), check = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), v = owners.own(new oc.GProp_GProps()), s = owners.own(new oc.GProp_GProps())
    expect(check.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
    oc.BRepGProp.VolumeProperties(shape.wrapped, v, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, s, false, false)
    near(v.Mass(), volume, 1e-5); near(s.Mass(), area, 1e-5)
    if (center && radius !== undefined) {
      const box = owners.own(new oc.Bnd_Box()); oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false)
      const min = tuple(owners.own(box.CornerMin())), max = tuple(owners.own(box.CornerMax()))
      min.forEach((value, i) => near(value, center[i] - radius)); max.forEach((value, i) => near(value, center[i] + radius))
    }
  })
}
/** Original radial normal oracle uses native D1, never the extractor's frame determinant. */
function derivativeSense(face: Face, center: Vec3, radius: number, expected: 1 | -1): void {
  withNativeOwners(owners => {
    const oc = getOC(), adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false)), p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
    adaptor.D1(.73, .4, p, du, dv)
    const radial = tuple(p).map((value, i) => value - center[i]) as Vec3, normal = cross(tuple(du), tuple(dv)),
      sign = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1
    near(Math.hypot(...radial), radius); expect(Math.hypot(...normal)).toBeGreaterThan(0)
    near(sign * dot(normal, radial) / (Math.hypot(...normal) * radius), expected)
  })
}
function observe<T>(patch: (owner: NativeOwner, index: number) => void, operation: () => T): T {
  const actual = ownership.withNativeOwners
  const replacement: typeof actual = <R>(work: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], label?: string): R => actual(owners => {
    if (label === context) {
      const own = owners.own.bind(owners); let index = 0
      owners.own = <V extends NativeOwner>(value: V): V => { patch(value, index++); return own(value) }
    }
    return work(owners)
  }, retained, label)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement)
  try { return operation() } finally { spy.mockRestore() }
}

it('extracts a genuine eccentric spherical surface without exposing an arbitrary parameter axis or widening old supports', () => withNativeOwners(owners => {
  const shape = sphere(owners), face = sphericalFace(owners, shape), value = extractAssemblySphereSurfaceSupport(face)
  expect(value).toEqual({ kind: 'sphere-surface', center: [3, 4, 5], radius: 3, tolerance: getOC().BRep_Tool.Tolerance(face.wrapped), radialMaterialSense: 1 })
  expect('axis' in value || 'xDirection' in value || 'wrapped' in value || 'delete' in value).toBe(false)
  expect(() => extractAssemblyFaceSupport(face)).toThrow(UnsupportedAssemblySurfaceError)
  expect(() => extractAssemblyCylinderSurfaceSupport(face)).toThrow(UnsupportedAssemblyCylinderSurfaceError)
  derivativeSense(face, [3, 4, 5], 3, 1); metrics(shape, 36 * Math.PI, 36 * Math.PI, [3, 4, 5], 3)
}), 60_000)

it('attests an original actual inner spherical cavity by native derivatives and closed-shell mass', () => withNativeOwners(owners => {
  const outer = sphere(owners, 7, [0, 0, 0]), tool = sphere(owners, 5, [0, 0, 0]), hollow = owners.own(bodyBoolean('subtract', outer, tool)), face = sphericalFace(owners, hollow, 5)
  expect(extractAssemblySphereSurfaceSupport(face).radialMaterialSense).toBe(-1)
  derivativeSense(face, [0, 0, 0], 5, -1); metrics(hollow, 872 * Math.PI / 3, 296 * Math.PI, [0, 0, 0], 7)
}), 60_000)

it('reverses only the spherical radial normal sense and preserves the borrowed native face', () => withNativeOwners(owners => {
  const shape = sphere(owners), face = sphericalFace(owners, shape), orientation = face.wrapped.Orientation(), reversed = owners.own(face.flipOrientation())
  expect(extractAssemblySphereSurfaceSupport(reversed)).toEqual({ ...extractAssemblySphereSurfaceSupport(face), radialMaterialSense: -1 })
  expect(face.wrapped.Orientation()).toBe(orientation); derivativeSense(reversed, [3, 4, 5], 3, -1)
}), 60_000)

it.each([false, true])('attests actual indirect spherical parameterization and native D1 normals (reversed=%s)', reversed => withNativeOwners(owners => {
  const oc = getOC(), p = owners.own(new oc.gp_Pnt(3, 4, 5)), z = owners.own(new oc.gp_Dir(0, 0, 1)), x = owners.own(new oc.gp_Dir(1, 0, 0)), frame = owners.own(new oc.gp_Ax3(p, z, x))
  frame.XReverse(); expect(frame.Direct()).toBe(false)
  const surface = owners.own(new oc.gp_Sphere(frame, 3)), builder = owners.own(new oc.BRepBuilderAPI_MakeFace(surface, 0, 2 * Math.PI, -Math.PI / 2, Math.PI / 2)),
    raw = owners.own(builder.Face()), oriented = owners.own(raw.Oriented(reversed ? oc.TopAbs_Orientation.TopAbs_REVERSED : oc.TopAbs_Orientation.TopAbs_FORWARD)), face = owners.own(cast(oriented))
  if (!(face instanceof Face)) throw new Error('Actual indirect spherical face required')
  const expected = reversed ? 1 : -1
  expect(extractAssemblySphereSurfaceSupport(face).radialMaterialSense).toBe(expected); derivativeSense(face, [3, 4, 5], 3, expected)
}), 60_000)

it.each(['plane', 'cylinder'] as const)('rejects a genuine native %s without fitting a sphere', kind => withNativeOwners(owners => {
  const oc = getOC(), builder = kind === 'cylinder' ? owners.own(new oc.BRepPrimAPI_MakeCylinder(2, 12)) : undefined,
    raw = builder ? owners.own(builder.Shape()) : undefined, shape = raw ? owners.own(cast(raw)).asShape3D() : owners.own(makeBox([0, 0, 0], [2, 3, 4]))
  for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) expect(() => extractAssemblySphereSurfaceSupport(face)).toThrow(UnsupportedAssemblySphereSurfaceError)
}), 60_000)

it.each(['TopAbs_INTERNAL', 'TopAbs_EXTERNAL'] as const)('rejects native spherical orientation %s with no material-normal interpretation', orientation => withNativeOwners(owners => {
  const face = sphericalFace(owners, sphere(owners)), raw = owners.own(face.wrapped.Oriented(getOC().TopAbs_Orientation[orientation])), changed = owners.own(cast(raw))
  if (!(changed instanceof Face)) throw new Error('Actual oriented sphere face required')
  expect(() => extractAssemblySphereSurfaceSupport(changed)).toThrow('orientación'); expect(extractAssemblySphereSurfaceSupport(face).radialMaterialSense).toBe(1)
}), 60_000)

it.each([0, 1, 2, 3, 4, 5, 6])('drains all seven received sphere owners once and withholds data when release %i fails', index => withNativeOwners(owners => {
  const face = sphericalFace(owners, sphere(owners)), failure = new Error('Original sphere wrapper release fault'), released: number[] = []
  const error = caught(() => observe((owner, current) => {
    const remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(current); remove(); if (current === index) throw failure } })
  }, () => extractAssemblySphereSurfaceSupport(face)))
  expect(error).toBeInstanceOf(NativeCleanupError); expect(tree(error)).toContain(failure); expect(released).toEqual([6, 5, 4, 3, 2, 1, 0])
  expect(extractAssemblySphereSurfaceSupport(face).radialMaterialSense).toBe(1)
}), 60_000)

it.each([{ index: 0, method: 'GetType' }, { index: 1, method: 'Radius' }, { index: 3, method: 'X' },
  { index: 4, method: 'Y' }, { index: 5, method: 'Z' }, { index: 6, method: 'X' }])('preserves real query failure $index/$method and cleans every received spherical wrapper', fault => withNativeOwners(owners => {
  const face = sphericalFace(owners, sphere(owners)), failure = new Error('Original sphere scalar query fault'), received: NativeOwner[] = [], released: NativeOwner[] = []
  const error = caught(() => observe((owner, index) => {
    received.push(owner); const remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(owner); remove() } })
    if (index === fault.index) {
      const target = owner as NativeOwner & Record<string, () => unknown>, actual = target[fault.method].bind(owner)
      Object.defineProperty(owner, fault.method, { configurable: true, value: () => { actual(); throw failure } })
    }
  }, () => extractAssemblySphereSurfaceSupport(face)))
  expect(error).toBe(failure); expect(released).toEqual([...received].reverse()); expect(new Set(released).size).toBe(received.length)
}), 60_000)

it('retains actual primary plus cleanup failures without deleting the borrowed spherical face', () => withNativeOwners(owners => {
  const face = sphericalFace(owners, sphere(owners)), primary = new Error('Original sphere coordinate fault'), cleanup = new Error('Original sphere direction release fault'); let releases = 0
  const error = caught(() => observe((owner, index) => {
    if (index !== 6) return
    const target = owner as NativeOwner & { X(): number }, query = target.X.bind(owner), remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'X', { configurable: true, value: () => { query(); throw primary } })
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
  }, () => extractAssemblySphereSurfaceSupport(face)))
  expect(error).toBeInstanceOf(NativeCleanupError); expect(tree(error)).toContain(primary); expect(tree(error)).toContain(cleanup); expect(releases).toBe(1)
  expect(face.wrapped.IsNull()).toBe(false)
}), 60_000)

it.each(['center', 'radius-zero', 'radius-nonfinite', 'basis', 'unknown-kind'] as const)('rejects controlled invalid native sphere %s after delegating actual scalar queries', fault => withNativeOwners(owners => {
  const face = sphericalFace(owners, sphere(owners))
  const error = caught(() => observe((owner, index) => {
    const override = (name: string, bad: number) => {
      const target = owner as NativeOwner & Record<string, () => unknown>, query = target[name].bind(owner)
      Object.defineProperty(owner, name, { configurable: true, value: () => { query(); return bad } })
    }
    if (fault === 'center' && index === 3) override('X', NaN)
    if ((fault === 'radius-zero' || fault === 'radius-nonfinite') && index === 1) override('Radius', fault === 'radius-zero' ? 0 : NaN)
    if (fault === 'unknown-kind' && index === 0) override('GetType', NaN)
    if (fault === 'basis' && index === 6) { override('X', 0); override('Y', 0); override('Z', 1) }
  }, () => extractAssemblySphereSurfaceSupport(face)))
  expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(UnsupportedAssemblySphereSurfaceError)
}), 60_000)

it.each([
  { rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number], translation: [7, -5, 9] as Vec3, center: [3, -2, 14] as Vec3 },
  { rotation: [.5, -.5, .5, .5] as [number, number, number, number], translation: [7, -5, 9] as Vec3, center: [3, -10, 12] as Vec3 },
])('preserves an actual placed sphere centre and radial normals under proper noncommuting placement $center', pose => withNativeOwners(owners => {
  const source = sphere(owners), placed = owners.own(placeAssemblyBody(source, { rotation: pose.rotation, translation: pose.translation })), face = sphericalFace(owners, placed)
  const value = extractAssemblySphereSurfaceSupport(face)
  value.center.forEach((coordinate, i) => near(coordinate, pose.center[i])); expect(value.radialMaterialSense).toBe(1)
  derivativeSense(face, pose.center, 3, 1); metrics(placed, 36 * Math.PI, 36 * Math.PI, pose.center, 3); metrics(source, 36 * Math.PI, 36 * Math.PI, [3, 4, 5], 3)
}), 60_000)

it('returns detached spherical coordinates after every native wrapper retires', () => {
  const values = withNativeOwners(owners => { const face = sphericalFace(owners, sphere(owners)); return [extractAssemblySphereSurfaceSupport(face), extractAssemblySphereSurfaceSupport(face)] })
  expect(values[0]).toEqual(values[1]); expect(values[0].center).not.toBe(values[1].center)
  values[0].center[0] = 999; expect(values[1].center).toEqual([3, 4, 5]); expect(values[1].radialMaterialSense).toBe(1)
})

it('queries every spherical observation afresh from an exact current catalog and rejects foreign/retired generations', () => {
  const engine = new CadEngine(), query = vi.spyOn(supports, 'extractAssemblySphereSurfaceSupport')
  try {
    const result = engine.build(original.features), body = result.bodies![0], face = body.faces[0]
    for (let index = 0; index < 3; index++) expect(engine.inspectCurrentSphereSurfaceSupport(face.ref, body.ref).radialMaterialSense).toBe(1)
    expect(query).toHaveBeenCalledTimes(3)
    expect(() => engine.inspectCurrentSphereSurfaceSupport(face.ref, null)).toThrow('cuerpo explícito')
    expect(() => engine.inspectCurrentSphereSurfaceSupport(face.ref, { ...body.ref, sourceFeatureId: 'foreign-state' })).toThrow()
    expect(() => engine.inspectCurrentSphereSurfaceSupport({ ...face.ref, key: 'face-v1|foreign' }, body.ref)).toThrow()
    engine.rebuildForAssemblyReferences([]); expect(() => engine.inspectCurrentSphereSurfaceSupport(face.ref, body.ref)).toThrow('reconstrucción')
    engine.dispose(); expect(() => engine.inspectCurrentSphereSurfaceSupport(face.ref, body.ref)).toThrow('reconstrucción')
  } finally { query.mockRestore(); engine.dispose() }
}, 60_000)

it('withholds a sphere observation if native cleanup reenters a new actual engine generation', () => {
  const engine = new CadEngine(), result = engine.build(original.features), body = result.bodies![0], face = body.faces[0]; let entered = false
  try {
    expect(() => observe((owner, index) => {
      if (index !== 6) return
      const remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { remove(); if (!entered) { entered = true; engine.rebuildForAssemblyReferences(original.features) } } })
    }, () => engine.inspectCurrentSphereSurfaceSupport(face.ref, body.ref))).toThrow('geometría cambió')
    expect(entered).toBe(true); expect(engine.inspectCurrentSphereSurfaceSupport(face.ref, body.ref).radialMaterialSense).toBe(1)
  } finally { engine.dispose() }
}, 60_000)
