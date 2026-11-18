import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade, { type BRepAdaptor_Curve } from 'replicad-opencascadejs'
import { assembleWire, cast, getOC, makeCircle, makeFace, makeLine, setOC, type Edge } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { extractAssemblyRectangleAxisSupport } from './kernel.assembly-profile-supports'
import { NativeCleanupError, withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'
import { ownedNativeTopology } from './kernel.native-topology'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
// Original 6x4 rectangle with explicitly constructed increasing-parameter LINE
// directions +X,+Y,-X,-Y. Membership is native topology, not matching coordinates.
function rectangle(o: NativeOwners, square = false, dx = 0) {
  const p: Vec3[] = [[1 + dx, 2, 3], [7 + dx, 2, 3], [7 + dx, square ? 8 : 6, 3], [1 + dx, square ? 8 : 6, 3]]
  const constructed = p.map((v, i) => o.own(makeLine(v, p[(i + 1) % 4])))
  const face = o.own(makeFace(o.own(assembleWire(constructed)))), actual = o.ownAll(ownedNativeTopology(face, 'edge'))
  // Wire construction can replace input edges while welding vertices. Select
  // actual fixture boundary identities using exact literal endpoint pairs;
  // this is a test oracle, never a production reference-repair policy.
  const edges = p.map((point, i) => {
    const found = actual.filter(edge => withNativeOwners(local => {
      const curve = local.own(new (getOC().BRepAdaptor_Curve)(edge.wrapped)), first = local.own(curve.Value(curve.FirstParameter())), last = local.own(curve.Value(curve.LastParameter()))
      const start = [first.X(), first.Y(), first.Z()], end = [last.X(), last.Y(), last.Z()]
      return start.every((v, j) => Math.abs(v - point[j]) < 1e-12) && end.every((v, j) => Math.abs(v - p[(i + 1) % 4][j]) < 1e-12)
    }))
    expect(found).toHaveLength(1); return found[0]
  })
  return { face, edges }
}
const near = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(1e-12))
for (const side of [0, 1, 2, 3]) for (const sense of [1, -1] as const) it('retains explicit boundary side ' + side + ' sense ' + sense, () => withNativeOwners(o => {
  const { face, edges } = rectangle(o), result = extractAssemblyRectangleAxisSupport(face, edges[side], sense)
  const directions: Vec3[] = [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]]
  near(result.xDirection, directions[side].map(v => sense * v)); near(result.profile.center, [4, 4, 3])
  expect(result.edgeLengthMm).toBe(side % 2 ? 4 : 6); expect(result.sense).toBe(sense)
  expect(result.xDirectionErrorRad).toBeGreaterThan(0); expect(result.xDirectionErrorRad).toBeLessThan(1e-8)
  expect(face.wrapped.IsNull()).toBe(false); expect(edges[side].wrapped.IsNull()).toBe(false)
}))
it('accepts every square edge without selecting a unique long axis', () => withNativeOwners(o => {
  const { face, edges } = rectangle(o, true)
  for (const edge of edges) expect(extractAssemblyRectangleAxisSupport(face, edge, 1).edgeLengthMm).toBe(6)
}))
it('rejects a geometrically identical separate edge and an edge of another face', () => withNativeOwners(o => {
  const { face } = rectangle(o), duplicate = o.own(makeLine([1, 2, 3], [7, 2, 3])), foreign = rectangle(o)
  expect(() => extractAssemblyRectangleAxisSupport(face, duplicate, 1)).toThrow(/exact member/)
  expect(() => extractAssemblyRectangleAxisSupport(face, foreign.edges[0], 1)).toThrow(/exact member/)
}))
it('keeps increasing-parameter sense independent of TopAbs edge reversal', () => withNativeOwners(o => {
  const { face, edges } = rectangle(o), raw = o.own(edges[0].wrapped.Reversed()), reversed = o.own(cast(raw)) as Edge
  near(extractAssemblyRectangleAxisSupport(face, reversed, 1).xDirection, [1, 0, 0])
  near(extractAssemblyRectangleAxisSupport(face, reversed, -1).xDirection, [-1, 0, 0])
}))
it('has a literal oblique material direction from the selected edge rather than traversal order', () => withNativeOwners(o => {
  const points: Vec3[] = [[13, -1, 6], [16.6, -1, 1.2], [16.6, 3, 1.2], [13, 3, 6]]
  const edges = points.map((p, i) => o.own(makeLine(p, points[(i + 1) % 4]))), face = o.own(makeFace(o.own(assembleWire(edges))))
  const result = extractAssemblyRectangleAxisSupport(face, edges[0], 1)
  near(result.xDirection, [.6, 0, -.8]); near(result.profile.normal, [.8, 0, .6]); near(result.profile.center, [14.8, 1, 3.6])
}))
it('does not invent a circular material axis or coerce sense', () => withNativeOwners(o => {
  const circle = o.own(makeCircle(2)), face = o.own(makeFace(o.own(assembleWire([circle]))))
  expect(() => extractAssemblyRectangleAxisSupport(face, circle, 1)).toThrow(/circular profile/)
  expect(() => extractAssemblyRectangleAxisSupport(face, circle, 0 as never)).toThrow(/exactly/)
}))
it('rejects unresolved direction arithmetic although the bounded center still fits its length band', () => withNativeOwners(o => {
  const { face, edges } = rectangle(o, false, 1e7)
  expect(() => extractAssemblyRectangleAxisSupport(face, edges[0], 1)).toThrow(/axis precisionLimit/)
}))
it('charges the observed in-plane projection correction and rejects a tighter requested angle', () => withNativeOwners(o => {
  const { face, edges } = rectangle(o), original = ownership.NativeOwners.prototype.own
  const coordinateSpies: ReturnType<typeof vi.spyOn>[] = []
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().BRepAdaptor_Curve) {
      const curve: BRepAdaptor_Curve = value, d1 = curve.D1.bind(curve)
      vi.spyOn(curve, 'D1').mockImplementation((parameter, point, tangent) => {
        d1(parameter, point, tangent); coordinateSpies.push(vi.spyOn(tangent, 'Z').mockReturnValue(5e-10))
      })
    }
    return original.call(this, value) as T
  })
  try {
    const result = extractAssemblyRectangleAxisSupport(face, edges[0], 1)
    near(result.xDirection, [1, 0, 0]); expect(result.xDirectionErrorRad).toBeGreaterThan(5e-10)
    expect(() => extractAssemblyRectangleAxisSupport(face, edges[0], 1, { angleToleranceRad: 1e-10 })).toThrow(/axis precisionLimit/)
  } finally { spy.mockRestore(); coordinateSpies.forEach(s => s.mockRestore()) }
}))
it('releases received curve wrappers after a D1 fault and keeps borrowed topology alive', () => withNativeOwners(o => {
  const { face, edges } = rectangle(o), original = ownership.NativeOwners.prototype.own
  const releases: ReturnType<typeof vi.spyOn>[] = []; let called = false
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().BRepAdaptor_Curve) {
      const curve: BRepAdaptor_Curve = value
      releases.push(vi.spyOn(curve, 'delete')); vi.spyOn(curve, 'D1').mockImplementation(() => { called = true; throw Error('Original selected LINE D1 fault') })
    }
    return original.call(this, value) as T
  })
  try { expect(() => extractAssemblyRectangleAxisSupport(face, edges[0], 1)).toThrow('Original selected LINE D1 fault'); expect(called).toBe(true); releases.forEach(r => expect(r).toHaveBeenCalledTimes(1)) }
  finally { spy.mockRestore(); releases.forEach(r => r.mockRestore()) }
  expect(face.wrapped.IsNull()).toBe(false); expect(edges[0].wrapped.IsNull()).toBe(false)
}))
it('does not publish an axis after native cleanup failure', () => withNativeOwners(o => {
  const { face, edges } = rectangle(o), original = ownership.NativeOwners.prototype.own; let patched = false
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().BRepAdaptor_Curve && !patched) { patched = true; const release = value.delete.bind(value); value.delete = () => { release(); throw Error('Original curve release fault') } }
    return original.call(this, value) as T
  })
  try { expect(() => extractAssemblyRectangleAxisSupport(face, edges[0], 1)).toThrow(NativeCleanupError); expect(patched).toBe(true) }
  finally { spy.mockRestore() }
}))
