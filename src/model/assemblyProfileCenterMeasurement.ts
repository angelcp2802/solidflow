import type { Vec3 } from '../cad/kernel.types'

/** Detached geometry only. These values do not authenticate a native profile. */
export interface ProfileCenterObservation {
  centerMm: Vec3
  normal: Vec3
  centerErrorMm?: number
  normalErrorRad?: number
}
/** Requested numerical resolution, not a mate satisfaction tolerance. */
export interface ProfileCenterResolution { lengthMm: number; angleRad: number }
export interface OrderedProfileCenterMeasurement {
  status: 'ok'
  deltaMm: Vec3
  centerDistanceMm: number
  /** nFirst dot (centerSecond - centerFirst), in millimeters. */
  axialMm: number
  transverseMm: Vec3
  transverseDistanceMm: number
  alignedAngleRad: number
  opposedAngleRad: number
  /** Conservative first-order estimates, not certified intervals. */
  precision: { deltaMm: number; centerDistanceMm: number; axialMm: number; transverseMm: number; angleRad: number }
}
export interface ProfileCenterPrecisionLimit { status: 'precisionLimit'; message: string }

const ROUND = 64 * Number.EPSILON, MIN_NORMAL = 2 ** -1022
const norm = (a: Vec3): number => Math.hypot(...a)
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
function data(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw Error('Profile measurements need plain data records.')
  const result: Record<string, unknown> = {}, allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw Error('Unknown profile measurement field.')
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (!field.enumerable || !('value' in field)) throw Error('Profile measurements forbid executable fields.')
    result[key] = field.value
  }
  if (required.some(key => !Object.hasOwn(result, key))) throw Error('Missing profile measurement field.')
  return result
}
function vector(value: unknown): Vec3 {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 3 || Reflect.ownKeys(value).length !== 4) throw Error('Profile measurements need dense three-coordinate vectors.')
  return [0, 1, 2].map(index => {
    const field = Object.getOwnPropertyDescriptor(value, String(index))
    if (!field?.enumerable || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) throw Error('Profile measurements need finite own numeric coordinates.')
    return field.value
  }) as Vec3
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw Error('Profile measurement resolution must be finite and positive.')
  return value
}
function uncertainty(value: unknown): number {
  if (value === undefined) return 0
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw Error('Profile measurement uncertainty must be finite and nonnegative.')
  return value
}
function observation(value: ProfileCenterObservation) {
  const raw = data(value, ['centerMm', 'normal'], ['centerErrorMm', 'normalErrorRad'])
  const center = vector(raw.centerMm), n = vector(raw.normal), length = norm(n)
  if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-12) throw Error('Profile normals must be unit length within 1e-12.')
  return { center, normal: mul(n, 1 / length), centerError: uncertainty(raw.centerErrorMm),
    normalError: uncertainty(raw.normalErrorRad) + Math.abs(length - 1) + ROUND }
}
const subnormal = (value: number): boolean => value !== 0 && Math.abs(value) < MIN_NORMAL
const fail = (): ProfileCenterPrecisionLimit => ({ status: 'precisionLimit', message: 'Profile center arithmetic or declared uncertainty exceeds the requested numerical resolution.' })

/**
 * Ordered center/normal measurement in one common frame, in mm and radians.
 * No shape compatibility, offset/flip policy, roll, owner mobility or constraint
 * satisfaction is inferred. An ok result admits only its numerical resolution.
 * World-coordinate magnitudes are retained before cancellation. Callers that
 * compose points in a nearby frame must also retain their original placement
 * uncertainty; this function cannot recover information already lost upstream.
 */
export function measureOrderedProfileCenters(first: ProfileCenterObservation, second: ProfileCenterObservation,
  requested: ProfileCenterResolution): OrderedProfileCenterMeasurement | ProfileCenterPrecisionLimit {
  const a = observation(first), b = observation(second), r = data(requested, ['lengthMm', 'angleRad'])
  const lengthMm = positive(r.lengthMm), angleRad = positive(r.angleRad)
  if (angleRad >= Math.PI) throw Error('Profile angular resolution must be less than pi.')
  if ([...a.center, ...b.center, a.centerError, b.centerError, lengthMm, angleRad].some(subnormal)) return fail()
  const deltaMm = sub(b.center, a.center), centerDistanceMm = norm(deltaMm), axialMm = dot(a.normal, deltaMm)
  const transverseMm = sub(deltaMm, mul(a.normal, axialMm)), transverseDistanceMm = norm(transverseMm)
  const normalCross = norm(cross(a.normal, b.normal)), normalDot = dot(a.normal, b.normal)
  const alignedAngleRad = Math.atan2(normalCross, normalDot), opposedAngleRad = Math.atan2(normalCross, -normalDot)
  const deltaError = a.centerError + b.centerError + ROUND * (norm(a.center) + norm(b.center) + centerDistanceMm)
  const precision = {
    deltaMm: deltaError,
    centerDistanceMm: deltaError + ROUND * centerDistanceMm,
    axialMm: deltaError + centerDistanceMm * a.normalError + ROUND * centerDistanceMm,
    transverseMm: deltaError + 2 * centerDistanceMm * a.normalError + ROUND * (centerDistanceMm + Math.abs(axialMm) + transverseDistanceMm),
    angleRad: a.normalError + b.normalError + ROUND,
  }
  const outputs = [...deltaMm, centerDistanceMm, axialMm, ...transverseMm, transverseDistanceMm, alignedAngleRad, opposedAngleRad, ...Object.values(precision)]
  if (!outputs.every(Number.isFinite) || outputs.some(subnormal) || precision.deltaMm > lengthMm || precision.centerDistanceMm > lengthMm
    || precision.axialMm > lengthMm || precision.transverseMm > lengthMm || precision.angleRad > angleRad) return fail()
  return { status: 'ok', deltaMm, centerDistanceMm, axialMm, transverseMm, transverseDistanceMm, alignedAngleRad, opposedAngleRad, precision }
}
