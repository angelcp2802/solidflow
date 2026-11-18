import type { Vec3 } from '../cad/kernel.types'
import { measureDirectedAngle } from './assemblyDirectedAngle'
import { assemblyDirectedAngleArcRadians, evaluateAssemblyDirectedAngleArc,
  validateAssemblyDirectedAngleArc, type AssemblyDirectedAngleArc, type AssemblyDirectedAngleArcEvaluation } from './assemblyLimitDirectedAngle'

export interface AssemblyHingeStopsGeometryInput {
  first: Vec3
  second: Vec3
  guide: Vec3
  directionErrorsRad: [number, number, number]
  arc: AssemblyDirectedAngleArc
  angleTolerance: number
}
export interface AssemblyHingeStopsGeometryEvaluation {
  value: AssemblyDirectedAngleArcEvaluation
  directionErrorRad: number
  projectionLengths: { first: number; second: number }
  /** Nominal derivatives with respect to the three input directions, including
   * normalization. These do not differentiate the conservative error budget. */
  gradients: { first: Vec3; second: Vec3; guide: Vec3 }
}
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale = (a: Vec3, x: number): Vec3 => a.map(v => v * x) as Vec3
const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3
const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3
function data(input: unknown, names: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('Hinge stops require plain numeric data.')
  const keys = Reflect.ownKeys(input)
  if (keys.length !== names.length) throw Error('Hinge stops require exact fields.')
  return Object.fromEntries(keys.map(key => {
    const d = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !names.includes(key) || !d.enumerable || !('value' in d)) throw Error('Hinge stops require own data fields.')
    return [key, d.value]
  }))
}
function triple(input: unknown): Vec3 {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length !== 3 || Reflect.ownKeys(input).length !== 4) throw Error('Hinge stops require dense numeric triples.')
  return [0, 1, 2].map(i => {
    const d = Object.getOwnPropertyDescriptor(input, String(i))
    if (!d?.enumerable || !('value' in d) || typeof d.value !== 'number' || !Number.isFinite(d.value)) throw Error('Hinge stops require finite own numeric coordinates.')
    return d.value as number
  }) as Vec3
}
/** Unit-direction cone converted to a Euclidean ball. A cone at least pi wide
 * covers the sphere; it must not wrap through the sine function. */
const chord = (angle: number) => 2 * Math.sin(Math.min(Math.PI, angle) / 2)

/** Explicit numerical support only: no native proof, saved zero, turns or Apply
 * authority. All three direction cones contribute, including a moving guide. */
export function evaluateHingeStopsGeometry(input: AssemblyHingeStopsGeometryInput): AssemblyHingeStopsGeometryEvaluation {
  const fields = data(input, ['first', 'second', 'guide', 'directionErrorsRad', 'arc', 'angleTolerance']),
    raw = [triple(fields.first), triple(fields.second), triple(fields.guide)], errors = triple(fields.directionErrorsRad),
    arc = validateAssemblyDirectedAngleArc(fields.arc), tolerance = fields.angleTolerance
  if (typeof tolerance !== 'number' || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= Math.PI || errors.some(v => v < 0)) throw RangeError('Hinge stop direction errors and angular tolerance are invalid.')
  const lengths = raw.map(v => Math.hypot(...v))
  if (lengths.some(n => !Number.isFinite(n) || Math.abs(n - 1) > 1e-8)) throw RangeError('Hinge stop directions must be unit vectors.')
  const [a, b, g] = raw.map((v, i) => scale(v, 1 / lengths[i])), measured = measureDirectedAngle(a, b, g, tolerance),
    la = measured.projectionLengths.first, lb = measured.projectionLengths.second,
    u = scale(sub(a, scale(g, dot(g, a))), 1 / la), v = scale(sub(b, scale(g, dot(g, b))), 1 / lb),
    x = dot(u, v), uv = cross(u, v), y = dot(g, uv), radius = Math.hypot(x, y)
  // Preserve any submitted unit-norm defect and normalization arithmetic rather
  // than silently granting exact directions after dividing by their norms.
  const balls = errors.map((error, i) => chord(error) + Math.abs(lengths[i] - 1) + 32 * Number.EPSILON),
    ea = balls[0] + 2 * balls[2], eb = balls[1] + 2 * balls[2]
  if (!(ea < la && eb < lb)) throw RangeError('A hinge stop direction cone reaches an unobservable projected direction.')
  const du = chord(Math.asin(ea / la)), dv = chord(Math.asin(eb / lb)),
    xError = du + dv, yError = balls[2] + du + dv, phaseBall = Math.hypot(xError, yError)
  if (!(phaseBall < radius)) throw RangeError('The hinge stop phase is not observable within its direction cones.')
  // Conservative Float64 composition allowance, separate from directional
  // declarations and never inferred from a positional topology tolerance.
  const arithmetic = 512 * Number.EPSILON * (1 + 1 / la + 1 / lb + 1 / radius),
    directionErrorRad = Math.asin(phaseBall / radius) + arithmetic
  if (!Number.isFinite(directionErrorRad) || directionErrorRad > tolerance) throw RangeError('Hinge stop directional precision exceeds the requested angular band.')
  const value = evaluateAssemblyDirectedAngleArc(measured.angleRadians, arc, tolerance)
  if (!value.fullCircle) {
    const center = assemblyDirectedAngleArcRadians(arc).center,
      offset = Math.atan2(Math.sin(measured.angleRadians - center), Math.cos(measured.angleRadians - center)),
      branchArithmetic = 64 * Number.EPSILON * (1 + Math.abs(center) + Math.abs(measured.angleRadians))
    if (Math.PI - Math.abs(offset) <= directionErrorRad + branchArithmetic) throw RangeError('The hinge stop direction cone intersects the circular chart cut.')
  }
  const gradients = raw.map((_raw, group) => [0, 1, 2].map(column => {
    const basis: Vec3 = [0, 0, 0]; basis[column] = 1
    const q = [a, b, g][group], derivative = scale(sub(basis, scale(q, q[column])), 1 / lengths[group]),
      da: Vec3 = group === 0 ? derivative : [0, 0, 0], db: Vec3 = group === 1 ? derivative : [0, 0, 0], dg: Vec3 = group === 2 ? derivative : [0, 0, 0],
      dpa = sub(sub(da, scale(dg, dot(g, a))), scale(g, dot(dg, a) + dot(g, da))),
      dpb = sub(sub(db, scale(dg, dot(g, b))), scale(g, dot(dg, b) + dot(g, db))),
      dua = scale(sub(dpa, scale(u, dot(u, dpa))), 1 / la), dvb = scale(sub(dpb, scale(v, dot(v, dpb))), 1 / lb),
      dx = dot(dua, v) + dot(u, dvb), dy = dot(dg, uv) + dot(g, add(cross(dua, v), cross(u, dvb)))
    const result = (x * dy - y * dx) / (radius * radius)
    if (!Number.isFinite(result)) throw RangeError('Hinge stop derivative is not finite.')
    return result
  }) as Vec3)
  return { value, directionErrorRad, projectionLengths: { ...measured.projectionLengths }, gradients: { first: gradients[0], second: gradients[1], guide: gradients[2] } }
}
