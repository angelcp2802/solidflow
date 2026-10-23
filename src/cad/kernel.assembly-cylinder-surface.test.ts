import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { cast, Face, getOC, makeBox, makeSphere, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { extractAssemblyCylinderSurfaceSupport, extractAssemblyFaceSupport, UnsupportedAssemblyCylinderSurfaceError } from './kernel.assembly-supports'
import * as supports from './kernel.assembly-supports'
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import { bodyBoolean } from './kernel.bodies'
import { CadEngine } from './kernel.engine'
import { placeAssemblyBody } from './kernel.assembly-placements'
import { parseAssemblyDocument } from '../model/assemblyDocument'
import type { Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const context = 'Assembly cylinder surface extraction or release failed.'
const near = (a: number, b: number, tolerance = 1e-8) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const caught = (operation: () => unknown): unknown => { try { operation() } catch (error) { return error } return undefined }
const tree = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(tree) : [])]
function cylinder(owners: NativeOwners, radius = 2, point: Vec3 = [3, 4, 5]): Shape3D {
  const oc = getOC(), p = owners.own(new oc.gp_Pnt(...point)), axis = owners.own(new oc.gp_Dir(0, 0, 1)), x = owners.own(new oc.gp_Dir(1, 0, 0)),
    frame = owners.own(new oc.gp_Ax2(p, axis, x)), builder = owners.own(new oc.BRepPrimAPI_MakeCylinder(frame, radius, 12)), raw = owners.own(builder.Shape())
  return owners.own(cast(raw)).asShape3D()
}
function cylindricalFace(owners: NativeOwners, shape: Shape3D, radius = 2): Face {
  const matches = owners.ownAll(ownedNativeTopology(shape, 'face')).filter(face => withNativeOwners(local => {
    const adaptor = local.own(new (getOC().BRepAdaptor_Surface)(face.wrapped, false))
    return adaptor.GetType() === getOC().GeomAbs_SurfaceType.GeomAbs_Cylinder && Math.abs(local.own(adaptor.Cylinder()).Radius() - radius) < 1e-10
  }))
  expect(matches).toHaveLength(1); return matches[0]
}
function metrics(shape: Shape3D, volume: number, area: number): void {
  withNativeOwners(owners => {
    const oc = getOC(), check = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), v = owners.own(new oc.GProp_GProps()), s = owners.own(new oc.GProp_GProps())
    expect(check.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
    oc.BRepGProp.VolumeProperties(shape.wrapped, v, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, s, false, false)
    near(v.Mass(), volume, 1e-5); near(s.Mass(), area, 1e-5)
  })
}
/** Actual native differential normal, independent of the extractor's frame determinant. */
function derivativeSense(face: Face, center: Vec3, axis: Vec3, radius: number, expected: 1 | -1): void {
  withNativeOwners(owners => {
    const oc = getOC(), adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false)), p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
    adaptor.D1(.73, 4, p, du, dv)
    const point: Vec3 = [p.X(), p.Y(), p.Z()], u: Vec3 = [du.X(), du.Y(), du.Z()], v: Vec3 = [dv.X(), dv.Y(), dv.Z()]
    const delta = point.map((value, i) => value - center[i]) as Vec3, along = dot(delta, axis), radial = delta.map((value, i) => value - along * axis[i]) as Vec3
    near(Math.hypot(...radial), radius, 1e-9)
    const normal = cross(u, v), sign = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1
    expect(Math.hypot(...normal)).toBeGreaterThan(0); near(sign * dot(normal, radial) / (Math.hypot(...normal) * radius), expected, 1e-9)
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

it('reads an actual outer cylindrical surface without changing its pre-existing derived axis DTO', () => withNativeOwners(owners => {
  const shape = cylinder(owners), face = cylindricalFace(owners, shape), before = extractAssemblyFaceSupport(face), data = extractAssemblyCylinderSurfaceSupport(face)
  expect(data).toEqual({ ...before, kind: 'cylinder-surface', radialMaterialSense: 1 }); expect(extractAssemblyFaceSupport(face)).toEqual(before)
  derivativeSense(face, [3, 4, 5], [0, 0, 1], 2, 1); metrics(shape, 48 * Math.PI, 56 * Math.PI)
  expect('wrapped' in data || 'delete' in data).toBe(false)
}), 60_000)

it('attests an actual eccentric bore normal independently of its unchanged geometric axis', () => withNativeOwners(owners => {
  const outer = cylinder(owners, 2, [0, 0, 0]), tool = cylinder(owners, .25, [1, 0, 0]), hollow = owners.own(bodyBoolean('subtract', outer, tool)), face = cylindricalFace(owners, hollow, .25)
  const before = extractAssemblyFaceSupport(face), data = extractAssemblyCylinderSurfaceSupport(face)
  expect(data.radialMaterialSense).toBe(-1); expect(extractAssemblyFaceSupport(face)).toEqual(before)
  derivativeSense(face, [1, 0, 0], [0, 0, 1], .25, -1); metrics(hollow, 189 * Math.PI / 4, 495 * Math.PI / 8)
}), 60_000)

it('reverses only the surface normal sense while retaining the borrowed face and axis data', () => withNativeOwners(owners => {
  const shape = cylinder(owners), face = cylindricalFace(owners, shape), orientation = face.wrapped.Orientation(), reversed = owners.own(face.flipOrientation()), before = extractAssemblyFaceSupport(face)
  expect(extractAssemblyFaceSupport(reversed)).toEqual(before); expect(extractAssemblyCylinderSurfaceSupport(reversed).radialMaterialSense).toBe(-1)
  expect(face.wrapped.Orientation()).toBe(orientation); derivativeSense(reversed, [3, 4, 5], [0, 0, 1], 2, -1)
}), 60_000)

it.each([false, true])('attests native indirect-frame handedness with independent D1 normals (reversed=%s)', reversed => withNativeOwners(owners => {
  const oc = getOC(), p = owners.own(new oc.gp_Pnt(3, 4, 5)), axis = owners.own(new oc.gp_Dir(0, 0, 1)), x = owners.own(new oc.gp_Dir(1, 0, 0)),
    frame = owners.own(new oc.gp_Ax3(p, axis, x))
  frame.XReverse(); expect(frame.Direct()).toBe(false)
  const surface = owners.own(new oc.gp_Cylinder(frame, 2)), builder = owners.own(new oc.BRepBuilderAPI_MakeFace(surface, 0, 2 * Math.PI, 0, 12)),
    raw = owners.own(builder.Face()), oriented = owners.own(raw.Oriented(reversed ? oc.TopAbs_Orientation.TopAbs_REVERSED : oc.TopAbs_Orientation.TopAbs_FORWARD)), face = owners.own(cast(oriented))
  if (!(face instanceof Face)) throw new Error('Actual indirect cylindrical face required')
  const expected = reversed ? 1 : -1, data = extractAssemblyCylinderSurfaceSupport(face)
  expect(data.radialMaterialSense).toBe(expected); derivativeSense(face, [3, 4, 5], [0, 0, 1], 2, expected)
}), 60_000)

it.each(['plane', 'sphere'] as const)('rejects a real native %s instead of fitting a cylinder', kind => withNativeOwners(owners => {
  const shape = owners.own(kind === 'plane' ? makeBox([0, 0, 0], [2, 3, 4]) : makeSphere(3)), face = owners.ownAll(ownedNativeTopology(shape, 'face'))[0]
  expect(() => extractAssemblyCylinderSurfaceSupport(face)).toThrow(UnsupportedAssemblyCylinderSurfaceError)
}), 60_000)

it.each(['TopAbs_INTERNAL', 'TopAbs_EXTERNAL'] as const)('rejects ambiguous native surface orientation %s', orientation => withNativeOwners(owners => {
  const shape = cylinder(owners), face = cylindricalFace(owners, shape), raw = owners.own(face.wrapped.Oriented(getOC().TopAbs_Orientation[orientation])), changed = owners.own(cast(raw))
  if (!(changed instanceof Face)) throw new Error('Actual oriented face required')
  expect(() => extractAssemblyCylinderSurfaceSupport(changed)).toThrow('orientación'); expect(extractAssemblyCylinderSurfaceSupport(face).radialMaterialSense).toBe(1)
}), 60_000)

it.each([0, 1, 2, 3, 4, 5, 6])('withholds the computed DTO if received native owner %i release fails and drains all seven once', index => withNativeOwners(owners => {
  const shape = cylinder(owners), face = cylindricalFace(owners, shape), failures = new Error('Original cylinder surface owner release failure'), released: number[] = []
  const error = caught(() => observe((owner, current) => {
    const remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(current); remove(); if (current === index) throw failures } })
  }, () => extractAssemblyCylinderSurfaceSupport(face)))
  expect(error).toBeInstanceOf(NativeCleanupError); expect(tree(error)).toContain(failures); expect(released).toEqual([6, 5, 4, 3, 2, 1, 0])
  expect(extractAssemblyCylinderSurfaceSupport(face).radialMaterialSense).toBe(1)
}), 60_000)

it.each([{ index: 0, method: 'GetType' }, { index: 1, method: 'Radius' }, { index: 3, method: 'X' },
  { index: 4, method: 'Y' }, { index: 5, method: 'Z' }, { index: 6, method: 'X' }])('drains actual received native wrappers on query failure $index/$method', fault => withNativeOwners(owners => {
  const shape = cylinder(owners), face = cylindricalFace(owners, shape), failure = new Error('Original surface scalar query failure'), received: NativeOwner[] = [], released: NativeOwner[] = []
  const error = caught(() => observe((owner, index) => {
    received.push(owner); const remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(owner); remove() } })
    if (index === fault.index) {
      const receiver = owner as NativeOwner & Record<string, () => unknown>, actual = receiver[fault.method].bind(owner)
      Object.defineProperty(owner, fault.method, { configurable: true, value: () => { actual(); throw failure } })
    }
  }, () => extractAssemblyCylinderSurfaceSupport(face)))
  expect(error).toBe(failure); expect(released).toEqual([...received].reverse()); expect(new Set(released).size).toBe(received.length)
}), 60_000)

it('preserves actual primary and cleanup faults without a lost returned wrapper or borrowed-face deletion', () => withNativeOwners(owners => {
  const shape = cylinder(owners), face = cylindricalFace(owners, shape), primary = new Error('Original Y coordinate failure'), cleanup = new Error('Original Y release failure'); let releases = 0
  const error = caught(() => observe((owner, index) => {
    if (index !== 6) return
    const receiver = owner as NativeOwner & { X(): number }, read = receiver.X.bind(owner), remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'X', { configurable: true, value: () => { read(); throw primary } })
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
  }, () => extractAssemblyCylinderSurfaceSupport(face)))
  expect(error).toBeInstanceOf(NativeCleanupError); expect(tree(error)).toContain(primary); expect(tree(error)).toContain(cleanup); expect(releases).toBe(1)
}), 60_000)

it('returns separately detached coordinates and scalar sense after the native owners retire', () => {
  const values = withNativeOwners(owners => { const face = cylindricalFace(owners, cylinder(owners)); return [extractAssemblyCylinderSurfaceSupport(face), extractAssemblyCylinderSurfaceSupport(face)] })
  expect(values[0]).toEqual(values[1]); expect(values[0].point).not.toBe(values[1].point); expect(values[0].axis).not.toBe(values[1].axis)
  values[0].point[0] = 999; expect(values[1].point).toEqual([3, 4, 5]); expect(values[1].radialMaterialSense).toBe(1)
})

it.each(['point', 'radius-zero', 'radius-nonfinite', 'basis'] as const)('rejects controlled invalid native %s after real scalar queries', fault => withNativeOwners(owners => {
  const shape = cylinder(owners), face = cylindricalFace(owners, shape)
  const error = caught(() => observe((owner, index) => {
    if (fault === 'point' && index === 3) {
      const point = owner as NativeOwner & { X(): number }, read = point.X.bind(owner)
      Object.defineProperty(owner, 'X', { configurable: true, value: () => { read(); return NaN } })
    }
    if ((fault === 'radius-zero' || fault === 'radius-nonfinite') && index === 1) {
      const cylinder = owner as NativeOwner & { Radius(): number }, read = cylinder.Radius.bind(owner)
      Object.defineProperty(owner, 'Radius', { configurable: true, value: () => { read(); return fault === 'radius-zero' ? 0 : NaN } })
    }
    if (fault === 'basis' && index === 6) {
      const direction = owner as NativeOwner & { X(): number; Y(): number; Z(): number }
      for (const [method, bad] of [['X', 0], ['Y', 0], ['Z', 1]] as const) {
        const read = direction[method].bind(owner)
        Object.defineProperty(owner, method, { configurable: true, value: () => { read(); return bad } })
      }
    }
  }, () => extractAssemblyCylinderSurfaceSupport(face)))
  expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(UnsupportedAssemblyCylinderSurfaceError)
}), 60_000)

it.each([
  { rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number], translation: [7, -5, 9] as Vec3, center: [3, -2, 14] as Vec3, axis: [0, 0, 1] as Vec3 },
  { rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number], translation: [7, 8, 9] as Vec3, center: [10, 3, 13] as Vec3, axis: [0, -1, 0] as Vec3 },
])('preserves radial sense in actual placed native BReps $center', pose => withNativeOwners(owners => {
  const source = cylinder(owners), placed = owners.own(placeAssemblyBody(source, { rotation: pose.rotation, translation: pose.translation })), face = cylindricalFace(owners, placed)
  const data = extractAssemblyCylinderSurfaceSupport(face); expect(data.radialMaterialSense).toBe(1)
  derivativeSense(face, pose.center, pose.axis, 2, 1); metrics(placed, 48 * Math.PI, 56 * Math.PI); metrics(source, 48 * Math.PI, 56 * Math.PI)
}), 60_000)

it('uses fresh surface extraction from the exact retained current catalog and rejects replacement/disposed generations', async () => {
  const input = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-tangent-plane-cylinder-original.json', import.meta.url), 'utf8')), part = input.definitions.find(value => value.id === 'tangent-roller')!
  if (part.kind !== 'part') throw new Error('Original roller required')
  const engine = new CadEngine(), query = vi.spyOn(supports, 'extractAssemblyCylinderSurfaceSupport')
  try {
    const result = engine.build(part.document.features), body = result.bodies![0], face = body.faces.find(face => face.frame === null)!
    for (let index = 0; index < 3; index++) expect(engine.inspectCurrentCylinderSurfaceSupport(face.ref, body.ref).radialMaterialSense).toBe(1)
    expect(query).toHaveBeenCalledTimes(3)
    expect(() => engine.inspectCurrentCylinderSurfaceSupport(face.ref, null)).toThrow('cuerpo explícito')
    expect(() => engine.inspectCurrentCylinderSurfaceSupport(face.ref, { ...body.ref, sourceFeatureId: 'wrong-state' })).toThrow()
    engine.build([]); expect(() => engine.inspectCurrentCylinderSurfaceSupport(face.ref, body.ref)).toThrow('reconstrucción')
    engine.dispose(); expect(() => engine.inspectCurrentCylinderSurfaceSupport(face.ref, body.ref)).toThrow('reconstrucción')
  } finally { query.mockRestore(); engine.dispose() }
}, 60_000)

it('withholds surface evidence if a real rebuild reenters during owned YDirection cleanup', async () => {
  const input = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-tangent-plane-cylinder-original.json', import.meta.url), 'utf8')), part = input.definitions.find(value => value.id === 'tangent-roller')!
  if (part.kind !== 'part') throw new Error('Original roller required')
  const engine = new CadEngine(), result = engine.build(part.document.features), body = result.bodies![0], face = body.faces.find(face => face.frame === null)!; let entered = false
  try {
    expect(() => observe((owner, index) => {
      if (index !== 6) return
      const remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { remove(); if (!entered) { entered = true; engine.rebuildForAssemblyReferences(part.document.features) } } })
    }, () => engine.inspectCurrentCylinderSurfaceSupport(face.ref, body.ref))).toThrow('geometría cambió')
    expect(entered).toBe(true); expect(engine.inspectCurrentCylinderSurfaceSupport(face.ref, body.ref).radialMaterialSense).toBe(1)
  } finally { engine.dispose() }
}, 60_000)
