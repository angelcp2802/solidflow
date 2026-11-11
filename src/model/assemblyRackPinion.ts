import type { Vec3 } from '../cad/kernel.types'
import { composeRigidPoses, identityRigidPose, rigidRotationMatrix, validateRigidPose, type Quaternion, type RigidPose } from './rigidPose'
import { assemblyGearStepAdmissible, measureAssemblyGearTwist, type AssemblyGearTwist } from './assemblyGear'
import type { RigidMateEndpoint, RigidMateProblem, RigidRackPinionConstraint } from './assemblySolveTypes'

export interface AssemblyRackPinionConversion { mode: 'diameter' | 'travel'; override: number | null }
export interface AssemblyRackPinionData {
  /** Null override uses the current authenticated pinion cylinder radius. */
  conversion: AssemblyRackPinionConversion
  reverse: boolean
  /** Q_rack^-1 * Q_pinion at authenticated capture. */
  neutralRotation: Quaternion
  /** Pinion relative to rack about the native directed pinion axis, lifted radians. */
  angle: number
  /** Captured rack-axis projection of rack origin minus canonical pinion axis point, mm. */
  neutralTravel: number
}
const TAU = 2 * Math.PI
export const ASSEMBLY_RACK_DIRECTION_EPSILON = 1e-12
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(name + ' must be finite.')
  return value
}
function record(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Rack and pinion fields must be plain data.')
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !keys.includes(key) || !field.enumerable || !('value' in field)) throw new Error('Unknown or executable rack and pinion field.')
    output[key] = field.value
  }
  if (keys.some(key => !Object.hasOwn(output, key))) throw new Error('Missing rack and pinion field.')
  return output
}
function vector(value: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Rack and pinion needs three finite coordinates.')
  return [0, 1, 2].map(i => {
    const field = Object.getOwnPropertyDescriptor(value, String(i))
    if (!field || !('value' in field)) throw new Error('Rack and pinion coordinates must be data.')
    return finite(field.value, 'Rack and pinion coordinate')
  }) as Vec3
}
function unit(value: Vec3): Vec3 {
  const copy = vector(value), length = Math.hypot(...copy)
  if (!(length > 0) || !Number.isFinite(length)) throw new RangeError('Rack and pinion direction must be nondegenerate.')
  return copy.map(coordinate => coordinate / length) as Vec3
}
function conversionData(input: unknown): AssemblyRackPinionConversion {
  const source = record(input, ['mode', 'override'])
  if (source.mode !== 'diameter' && source.mode !== 'travel') throw new Error('Unknown rack and pinion conversion mode.')
  const override = source.override === null ? null : finite(source.override, 'Rack and pinion override')
  if (override !== null && override <= 0) throw new Error('Rack and pinion override must be positive.')
  return { mode: source.mode, override }
}
/** Positive physical conversion; native radius is supplied afresh by the CAD adapter. */
export function assemblyRackPinionConversion(conversion: AssemblyRackPinionConversion, nativeRadius: number): { diameter: number; distancePerTurn: number; advance: number } {
  const checked = conversionData(conversion), radius = finite(nativeRadius, 'Native pinion radius')
  if (radius <= 0) throw new Error('Native pinion radius must be positive.')
  const advance = checked.override === null ? radius : checked.mode === 'diameter' ? checked.override / 2 : checked.override / TAU
  const diameter = checked.override !== null && checked.mode === 'diameter' ? checked.override : finite(2 * advance, 'Pitch diameter')
  const distancePerTurn = checked.override !== null && checked.mode === 'travel' ? checked.override : finite(TAU * advance, 'Rack travel per turn')
  if (!(advance > 0) || !Number.isFinite(advance) || !(diameter > 0) || !(distancePerTurn > 0)) throw new RangeError('Rack and pinion conversion is not representable.')
  return { diameter, distancePerTurn, advance }
}
export function assemblyRackPinionAdvance(conversion: AssemblyRackPinionConversion, reverse: boolean, nativeRadius: number): number {
  if (typeof reverse !== 'boolean') throw new Error('Rack and pinion reverse must be explicit.')
  const advance = assemblyRackPinionConversion(conversion, nativeRadius).advance
  return reverse ? -advance : advance
}
export function validateAssemblyRackPinionData(input: unknown): AssemblyRackPinionData {
  const source = record(input, ['conversion', 'reverse', 'neutralRotation', 'angle', 'neutralTravel']), conversion = conversionData(source.conversion)
  // Validate an explicit conversion without substituting a saved/default radius.
  if (conversion.override !== null) assemblyRackPinionConversion(conversion, 1)
  if (typeof source.reverse !== 'boolean') throw new Error('Rack and pinion reverse must be explicit.')
  return { conversion, reverse: source.reverse,
    neutralRotation: validateRigidPose({ translation: [0, 0, 0], rotation: source.neutralRotation }).rotation,
    angle: finite(source.angle, 'Lifted rack and pinion angle'), neutralTravel: finite(source.neutralTravel, 'Rack and pinion neutral travel') }
}
/** The local line is undirected. Preserve every component and choose a stable declared sign. */
export function canonicalAssemblyRackDirection(axis: Vec3): Vec3 {
  const direction = unit(axis), first = direction.find(value => Math.abs(value) > ASSEMBLY_RACK_DIRECTION_EPSILON)!
  return first < 0 ? direction.map(value => -value) as Vec3 : direction
}
/** Closest local axis point to the component origin, independent of axial parameter origin. */
export function assemblyRackPinionAxisPoint(point: Vec3, axis: Vec3, lengthTolerance?: number): Vec3 {
  const p = vector(point), a = unit(axis), projection = finite(a[0] * p[0] + a[1] * p[1] + a[2] * p[2], 'Pinion axis projection')
  if (lengthTolerance !== undefined) {
    const tolerance = finite(lengthTolerance, 'Pinion axis point precision')
    if (tolerance <= 0) throw new Error('Pinion axis point precision must be positive.')
    // Cartesian projection only copies coordinates or subtracts a value from
    // itself. General large oblique parameter origins can lose the perpendicular
    // axis location by cancellation; do not publish that loss as a zero frame.
    const cartesian = a.some((value, index) => Math.abs(value) === 1 && a.every((other, i) => i === index || other === 0))
    if (!cartesian) {
      const magnitude = finite(a.reduce((sum, value, i) => sum + Math.abs(value * p[i]), 0), 'Pinion axis projection magnitude')
      const error = Math.max(...a.map((value, i) => value === 0 ? 0 : 8 * Number.EPSILON * (Math.abs(p[i]) + Math.abs(value) * (Math.abs(projection) + magnitude))))
      if (!Number.isFinite(error) || error > tolerance) throw new RangeError('Canonical pinion axis point exceeds the requested length precision.')
    }
  }
  return p.map((value, i) => finite(value - a[i] * projection, 'Canonical pinion axis point')) as Vec3
}
function rotation(endpoint: RigidMateEndpoint, poses: ReadonlyMap<string, RigidPose>): Quaternion {
  const frame = validateRigidPose(endpoint.frame)
  if (endpoint.bodyId === null) return frame.rotation
  const body = poses.get(endpoint.bodyId)
  if (!body) throw new Error('Rack and pinion endpoint names a missing body.')
  return composeRigidPoses({ translation: [0, 0, 0], rotation: body.rotation }, { translation: [0, 0, 0], rotation: frame.rotation }).rotation
}
export function rigidRackPinionTwist(constraint: RigidRackPinionConstraint, poses: ReadonlyMap<string, RigidPose>, angleTolerance: number): AssemblyGearTwist {
  if (constraint.first.support?.kind !== 'cylinder' || !constraint.second.support || !['line', 'cylinder'].includes(constraint.second.support.kind)) {
    throw new Error('Rack and pinion requires a pinion cylinder and a rack line or cylinder.')
  }
  return measureAssemblyGearTwist(constraint.neutralRotation, rotation(constraint.second, poses), rotation(constraint.first, poses),
    constraint.first.support.axis, constraint.angle, angleTolerance)
}
/** Condition component origins before adding local points; never compose a distant world point first. */
export function rigidRackPinionCoordinates(constraint: RigidRackPinionConstraint, poses: ReadonlyMap<string, RigidPose>, angleTolerance: number,
  conditioning: { origin: Vec3; lengthScale: number } = { origin: [0, 0, 0], lengthScale: 1 }): { angle: number; travel: number; twist: AssemblyGearTwist } {
  const twist = rigidRackPinionTwist(constraint, poses, angleTolerance), first = constraint.first.support!, second = constraint.second.support!
  if (first.kind !== 'cylinder' || second.kind !== 'line' && second.kind !== 'cylinder') throw new Error('Rack and pinion supports are invalid.')
  const scale = finite(conditioning.lengthScale, 'Rack and pinion scale'), center = vector(conditioning.origin)
  if (scale <= 0) throw new Error('Rack and pinion scale must be positive.')
  const rotate = (q: Quaternion, v: Vec3): Vec3 => {
    const m = rigidRotationMatrix(q)
    return [0, 1, 2].map(i => finite(m[i * 3] * v[0] + m[i * 3 + 1] * v[1] + m[i * 3 + 2] * v[2], 'Rack and pinion coordinate')) as Vec3
  }
  const origin = (endpoint: RigidMateEndpoint): Vec3 => {
    const frame = validateRigidPose(endpoint.frame), body = endpoint.bodyId === null ? identityRigidPose() : poses.get(endpoint.bodyId)!
    const base = endpoint.bodyId === null ? frame.translation : body.translation
    const offset = endpoint.bodyId === null ? [0, 0, 0] as Vec3 : rotate(body.rotation, frame.translation.map(value => value / scale) as Vec3)
    return base.map((value, i) => finite((value - center[i]) / scale + offset[i], 'Rack and pinion conditioned origin')) as Vec3
  }
  const a = origin(constraint.first), b = origin(constraint.second), offset = rotate(rotation(constraint.first, poses), assemblyRackPinionAxisPoint(first.point, first.axis).map(value => value / scale) as Vec3)
  const e = rotate(rotation(constraint.second, poses), canonicalAssemblyRackDirection(second.axis))
  const travel = finite(e.reduce((sum, value, i) => finite(sum + value * finite(b[i] - a[i] - offset[i], 'Rack and pinion separation'), 'Rack and pinion projection'), 0) * scale, 'Rack and pinion travel')
  return { angle: twist.angle, travel, twist }
}
export function deriveRigidRackPinionAngles(problem: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>): Map<string, number> {
  const output = new Map<string, number>()
  for (const constraint of [...problem.constraints.filter((value): value is RigidRackPinionConstraint => value.type === 'rack-pinion'), ...(problem.passiveRackPinions ?? [])]) {
    output.set(constraint.id, rigidRackPinionTwist(constraint, poses, problem.angleTolerance).angle)
  }
  return output
}
export function rebaseRigidRackPinionAngles(problem: RigidMateProblem, angles: ReadonlyMap<string, number>): RigidMateProblem {
  const rebase = (constraint: RigidRackPinionConstraint): RigidRackPinionConstraint => angles.has(constraint.id) ? { ...constraint, angle: angles.get(constraint.id)! } : constraint
  return { ...problem, constraints: problem.constraints.map(constraint => constraint.type === 'rack-pinion' ? rebase(constraint) : constraint),
    ...(problem.passiveRackPinions ? { passiveRackPinions: problem.passiveRackPinions.map(rebase) } : {}) }
}
export function admitRigidRackPinionStep(problem: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>, rotationSteps: ReadonlyMap<string, number>): boolean {
  for (const constraint of [...problem.constraints.filter((value): value is RigidRackPinionConstraint => value.type === 'rack-pinion'), ...(problem.passiveRackPinions ?? [])]) {
    const twist = rigidRackPinionTwist(constraint, poses, problem.angleTolerance)
    const step = (endpoint: RigidMateEndpoint) => endpoint.bodyId === null ? 0 : rotationSteps.get(endpoint.bodyId) ?? 0
    if (!assemblyGearStepAdmissible(twist.rho, step(constraint.first), step(constraint.second))) return false
  }
  return true
}
