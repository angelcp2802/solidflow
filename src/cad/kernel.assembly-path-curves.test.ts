import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade, { type BRepAdaptor_Curve } from 'replicad-opencascadejs'
import { cast, getOC, makeCircle, makeEllipse, makeLine, makePolygon, setOC, type Edge } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { observeAssemblyPathCurve, evaluateAssemblyPathCurve, AssemblyPathCurvePrecisionError, UnsupportedAssemblyPathCurveError } from './kernel.assembly-path-curves'
import { NativeCleanupError, withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const near = (a: readonly number[], b: readonly number[], band = 1e-10) => { expect(a.length).toBe(b.length); a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(band)) }
function arc(o: NativeOwners, first = 0, last = Math.PI / 2, center: Vec3 = [3, -2, 5], radius = 2): Edge {
  const oc = getOC(), p = o.own(new oc.gp_Pnt(...center)), n = o.own(new oc.gp_Dir(0, 0, 1)), x = o.own(new oc.gp_Dir(1, 0, 0)), frame = o.own(new oc.gp_Ax2(p, n, x)), circle = o.own(new oc.gp_Circ(frame, radius))
  const builder = o.own(new oc.BRepBuilderAPI_MakeEdge(circle, first, last)), raw = o.own(builder.Edge())
  return o.own(cast(raw)) as Edge
}
for (const sense of [1, -1] as const) it('measures a finite 3-4-5 LINE with explicit directed sense ' + sense, () => withNativeOwners(o => {
  const edge = o.own(makeLine([1, 2, 3], [4, 6, 3])), r = observeAssemblyPathCurve(edge, sense)
  expect(r.kind).toBe('line'); expect(r.lengthMm).toBe(5); expect(r.closed).toBe(false); expect(r.periodic).toBe(false); expect(r.period).toBeNull()
  near(r.startPoint, sense === 1 ? [1, 2, 3] : [4, 6, 3]); near(r.endPoint, sense === 1 ? [4, 6, 3] : [1, 2, 3])
  const evaluated = evaluateAssemblyPathCurve(edge, sense, { kind: 'arc-length', distanceMm: 2 })
  near(evaluated.point, sense === 1 ? [2.2, 3.6, 3] : [2.8, 4.4, 3]); near(evaluated.tangent, [.6 * sense, .8 * sense, 0]); expect(evaluated.arcLengthMm).toBe(2)
  expect(edge.wrapped.IsNull()).toBe(false)
}))
it('reports raw native parameters independently of directed arc length and does not extrapolate', () => withNativeOwners(o => {
  const edge = o.own(makeLine([1, 2, 3], [4, 6, 3])), r = observeAssemblyPathCurve(edge, -1), u = r.parameterDomain.first + 1
  const q = evaluateAssemblyPathCurve(edge, -1, { kind: 'parameter', parameter: u })
  expect(q.parameter).toBe(u); expect(q.arcLengthMm).toBe(4); near(q.point, [1.6, 2.8, 3])
  expect(() => evaluateAssemblyPathCurve(edge, 1, { kind: 'arc-length', distanceMm: -1 })).toThrow(/outside/)
  expect(() => evaluateAssemblyPathCurve(edge, 1, { kind: 'arc-length', distanceMm: 6 })).toThrow(/outside/)
  expect(() => evaluateAssemblyPathCurve(edge, 1, { kind: 'parameter', parameter: r.parameterDomain.last + 1 })).toThrow(/outside/)
}))
it('retains parameter sense when TopAbs traversal is reversed', () => withNativeOwners(o => {
  const edge = o.own(makeLine([1, 2, 3], [4, 6, 3])), reversed = o.own(cast(o.own(edge.wrapped.Reversed()))) as Edge
  near(evaluateAssemblyPathCurve(reversed, 1, { kind: 'arc-length', distanceMm: 2 }).point, [2.2, 3.6, 3])
  near(evaluateAssemblyPathCurve(reversed, -1, { kind: 'arc-length', distanceMm: 2 }).tangent, [-.6, -.8, 0])
}))
it('measures a true quarter circle from its trimmed native domain', () => withNativeOwners(o => {
  const edge = arc(o), r = observeAssemblyPathCurve(edge, 1)
  expect(r.kind).toBe('circle'); expect(r.closed).toBe(false); expect(r.lengthMm).toBeCloseTo(Math.PI, 12)
  near(r.startPoint, [5, -2, 5]); near(r.endPoint, [3, 0, 5])
  const q = evaluateAssemblyPathCurve(edge, 1, { kind: 'arc-length', distanceMm: Math.PI / 2 })
  near(q.point, [3 + Math.SQRT2, -2 + Math.SQRT2, 5]); near(q.tangent, [-Math.SQRT1_2, Math.SQRT1_2, 0]); expect(q.parameter).toBeCloseTo(Math.PI / 4, 12)
  near(evaluateAssemblyPathCurve(edge, -1, { kind: 'arc-length', distanceMm: 0 }).tangent, [1, 0, 0])
}))
it('retains a full circle seam and a shifted native parameter origin without normalizing it away', () => withNativeOwners(o => {
  const first = Math.PI / 4, edge = arc(o, first, first + 2 * Math.PI), r = observeAssemblyPathCurve(edge, 1)
  expect(r.closed).toBe(true); expect(r.periodic).toBe(true); expect(r.period).toBeCloseTo(2 * Math.PI, 12); expect(r.lengthMm).toBeCloseTo(4 * Math.PI, 12)
  expect(r.parameterDomain.first).toBeCloseTo(first, 12); near(r.startPoint, [3 + Math.SQRT2, -2 + Math.SQRT2, 5]); near(r.startPoint, r.endPoint)
  const q = evaluateAssemblyPathCurve(edge, 1, { kind: 'arc-length', distanceMm: Math.PI })
  near(q.point, [3 - Math.SQRT2, -2 + Math.SQRT2, 5]); near(q.tangent, [-Math.SQRT1_2, -Math.SQRT1_2, 0])
  expect(evaluateAssemblyPathCurve(edge, -1, { kind: 'arc-length', distanceMm: r.lengthMm }).parameter).toBe(r.parameterDomain.first)
}))
it('measures an original oblique line with literal Cartesian position and tangent', () => withNativeOwners(o => {
  const edge = o.own(makeLine([10, -3, 5], [13.6, -3, .2])), r = evaluateAssemblyPathCurve(edge, 1, { kind: 'arc-length', distanceMm: 3 })
  near(r.point, [11.8, -3, 2.6]); near(r.tangent, [.6, 0, -.8]); expect(r.observation.lengthMm).toBeCloseTo(6, 12)
}))
it('rejects unsupported ellipses and non-edge shapes instead of fitting a path', () => withNativeOwners(o => {
  const ellipse = o.own(makeEllipse(3, 2)), face = o.own(makePolygon([[0, 0, 0], [1, 0, 0], [0, 1, 0]]))
  expect(() => observeAssemblyPathCurve(ellipse, 1)).toThrow(UnsupportedAssemblyPathCurveError)
  expect(() => observeAssemblyPathCurve(face as unknown as Edge, 1)).toThrow(/native edge/)
}))
it('does not accept a requested band that cannot retain distant coordinates or vertex uncertainty', () => withNativeOwners(o => {
  const distant = o.own(makeLine([1e12, 2, 3], [1e12 + 5, 2, 3]))
  expect(() => observeAssemblyPathCurve(distant, 1)).toThrow(AssemblyPathCurvePrecisionError)
  const edge = o.own(makeLine([0, 0, 0], [5, 0, 0])), oc = getOC(), tolerance = oc.BRep_Tool.Tolerance
  const spy = vi.spyOn(oc.BRep_Tool, 'Tolerance').mockImplementation(raw => raw.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_VERTEX ? 2e-6 : tolerance(raw))
  try { expect(() => observeAssemblyPathCurve(edge, 1)).toThrow(AssemblyPathCurvePrecisionError); expect(observeAssemblyPathCurve(edge, 1, { lengthToleranceMm: 1e-5 }).nativeToleranceMm).toBe(2e-6) }
  finally { spy.mockRestore() }
}))
it('rejects malformed coordinate/band data without invoking accessors', () => withNativeOwners(o => {
  const edge = o.own(makeCircle(2)); let reads = 0
  const coordinate = { kind: 'parameter' as const, get parameter() { reads++; return 0 } }
  expect(() => evaluateAssemblyPathCurve(edge, 1, coordinate)).toThrow(); expect(reads).toBe(0)
  expect(() => observeAssemblyPathCurve(edge, 0 as never)).toThrow(/sense/)
  expect(() => observeAssemblyPathCurve(edge, 1, { angleToleranceRad: Math.PI })).toThrow(/bands/)
}))
it('fails closed on invalid native intervals and releases every acquired curve wrapper', () => withNativeOwners(o => {
  const edge = o.own(makeLine([0, 0, 0], [5, 0, 0])), original = ownership.NativeOwners.prototype.own; let released = 0
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().BRepAdaptor_Curve) {
      const curve: BRepAdaptor_Curve = value, release = curve.delete.bind(curve); curve.delete = () => { released++; release() }
      vi.spyOn(curve, 'LastParameter').mockReturnValue(Infinity)
    }
    return original.call(this, value) as T
  })
  try { expect(() => observeAssemblyPathCurve(edge, 1)).toThrow(/finite increasing/); expect(released).toBe(1) }
  finally { spy.mockRestore() }
  expect(edge.wrapped.IsNull()).toBe(false)
}))
it('rejects an inconsistent interior native tangent even when its speed and point agree', () => withNativeOwners(o => {
  const edge = o.own(makeLine([0, 0, 0], [5, 0, 0])), original = ownership.NativeOwners.prototype.own
  const coordinates: ReturnType<typeof vi.spyOn>[] = []; let patched = false
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().BRepAdaptor_Curve) {
      const curve: BRepAdaptor_Curve = value, d1 = curve.D1.bind(curve)
      vi.spyOn(curve, 'D1').mockImplementation((u, p, tangent) => {
        d1(u, p, tangent)
        if (u > 0) { patched = true; coordinates.push(vi.spyOn(tangent, 'X').mockReturnValue(0), vi.spyOn(tangent, 'Y').mockReturnValue(1)) }
      })
    }
    return original.call(this, value) as T
  })
  try { expect(() => evaluateAssemblyPathCurve(edge, 1, { kind: 'arc-length', distanceMm: 2 })).toThrow(AssemblyPathCurvePrecisionError); expect(patched).toBe(true) }
  finally { spy.mockRestore(); coordinates.forEach(s => s.mockRestore()) }
  expect(edge.wrapped.IsNull()).toBe(false)
}))
it('does not hide a partial native point-query failure or delete the borrowed edge', () => withNativeOwners(o => {
  const edge = o.own(makeLine([0, 0, 0], [5, 0, 0])), original = ownership.NativeOwners.prototype.own; let query = false
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().BRepAdaptor_Curve) {
      const curve: BRepAdaptor_Curve = value, native = curve.Value.bind(curve)
      vi.spyOn(curve, 'Value').mockImplementation(u => { if (u > 0) { query = true; throw Error('Original endpoint query failure') } return native(u) })
    }
    return original.call(this, value) as T
  })
  try { expect(() => observeAssemblyPathCurve(edge, 1)).toThrow('Original endpoint query failure'); expect(query).toBe(true) }
  finally { spy.mockRestore() }
  expect(edge.wrapped.IsNull()).toBe(false)
}))
it('aggregates native release failure without returning an observation', () => withNativeOwners(o => {
  const edge = o.own(makeLine([0, 0, 0], [5, 0, 0])), original = ownership.NativeOwners.prototype.own; let patched = false
  const spy = vi.spyOn(ownership.NativeOwners.prototype, 'own').mockImplementation(function<T extends ownership.NativeOwner>(this: NativeOwners, value: T): T {
    if (value instanceof getOC().BRepAdaptor_Curve && !patched) { patched = true; const release = value.delete.bind(value); value.delete = () => { release(); throw Error('Original path release failure') } }
    return original.call(this, value) as T
  })
  try { expect(() => observeAssemblyPathCurve(edge, 1)).toThrow(NativeCleanupError); expect(patched).toBe(true) }
  finally { spy.mockRestore() }
}))
