import type { Vec3 } from '../cad/kernel.types'
import { RotationChartError } from './assemblyKinematics'
import { composeRigidPoses, identityRigidPose, rigidRotationMatrix, validateRigidPose, type Quaternion, type RigidPose } from './rigidPose'
import type { RigidGearConstraint, RigidMateEndpoint, RigidMateProblem } from './assemblySolveTypes'

export interface AssemblyGearRatio { numerator: number; denominator: number }
export type AssemblyGearDirection = 'same' | 'opposed'
/** Lifted radians, not principal angles or a modulo-2pi phase. */
export interface AssemblyGearAngles { first: number; second: number }
export interface AssemblyGearData {
  ratio: AssemblyGearRatio
  direction: AssemblyGearDirection
  /** Endpoint rotations relative to the explicitly declared carrier at capture. */
  neutralRotations: { first: Quaternion; second: Quaternion }
  angles: AssemblyGearAngles
  /** Weighted radians: a*first + sign*b*second, never reduced modulo 2pi. */
  phase: number
}
const TAU = 2 * Math.PI
export const ASSEMBLY_GEAR_CHART_MARGIN = 1e-7
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(name + ' must be finite.')
  return value
}
function record(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Gear fields must be plain data.')
  const output: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !keys.includes(key) || !field.enumerable || !('value' in field)) throw new Error('Unknown or executable gear field.')
    output[key] = field.value
  }
  if (keys.some(key => !Object.hasOwn(output, key))) throw new Error('Missing gear field.')
  return output
}
export function assemblyGearWeights(ratio: AssemblyGearRatio): { first: number; second: number } {
  const numerator = finite(ratio.numerator, 'Gear numerator'), denominator = finite(ratio.denominator, 'Gear denominator')
  if (numerator <= 0 || denominator <= 0) throw new Error('Gear ratio terms must be positive.')
  const maximum = Math.max(numerator, denominator), first = numerator / maximum, second = denominator / maximum
  if (first === 0 || second === 0) throw new RangeError('Gear ratio normalization underflows.')
  return { first, second }
}
export function assemblyGearFollowerPhase(ratio: AssemblyGearRatio, direction: AssemblyGearDirection, followerRadians: number): number {
  if (direction !== 'same' && direction !== 'opposed') throw new Error('Unknown gear direction.')
  return finite((direction === 'opposed' ? 1 : -1) * assemblyGearWeights(ratio).second * finite(followerRadians, 'Follower angle'), 'Gear phase')
}
export function assemblyGearFollowerAngle(ratio: AssemblyGearRatio, direction: AssemblyGearDirection, phase: number): number {
  if (direction !== 'same' && direction !== 'opposed') throw new Error('Unknown gear direction.')
  return finite(finite(phase, 'Gear phase') / ((direction === 'opposed' ? 1 : -1) * assemblyGearWeights(ratio).second), 'Follower angle')
}
export function validateAssemblyGearData(input: unknown): AssemblyGearData {
  const source = record(input, ['ratio', 'direction', 'neutralRotations', 'angles', 'phase']), ratio = record(source.ratio, ['numerator', 'denominator'])
  const checkedRatio = { numerator: finite(ratio.numerator, 'Gear numerator'), denominator: finite(ratio.denominator, 'Gear denominator') }
  assemblyGearWeights(checkedRatio)
  if (source.direction !== 'same' && source.direction !== 'opposed') throw new Error('Unknown gear direction.')
  const neutral = record(source.neutralRotations, ['first', 'second']), angles = record(source.angles, ['first', 'second'])
  const rotation = (value: unknown) => validateRigidPose({ translation: [0, 0, 0], rotation: value }).rotation
  return { ratio: checkedRatio, direction: source.direction, neutralRotations: { first: rotation(neutral.first), second: rotation(neutral.second) },
    angles: { first: finite(angles.first, 'First lifted angle'), second: finite(angles.second, 'Second lifted angle') }, phase: finite(source.phase, 'Gear phase') }
}
function product(a: Quaternion, b: Quaternion): Quaternion {
  return composeRigidPoses({ translation: [0, 0, 0], rotation: a }, { translation: [0, 0, 0], rotation: b }).rotation
}
function inverse(q: Quaternion): Quaternion { return [-q[0], -q[1], -q[2], q[3]] }
function rotate(q: Quaternion, v: Vec3): Vec3 {
  const m = rigidRotationMatrix(q)
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
}
export interface AssemblyGearTwist { angle: number; wrappedAngle: number; rho: number; gradient: Vec3 }
/** Pure local chart measurement. Numeric frames never confer native authority. */
export function measureAssemblyGearTwist(neutral: Quaternion, carrier: Quaternion, endpoint: Quaternion,
  nativeAxis: Vec3, anchorAngle: number, angleTolerance = 1e-8): AssemblyGearTwist {
  finite(anchorAngle, 'Lift anchor'); finite(angleTolerance, 'Angle tolerance')
  if (angleTolerance <= 0) throw new Error('Angle tolerance must be positive.')
  const axis = validateRigidPose({ translation: nativeAxis, rotation: identityRigidPose().rotation }).translation
  if (Math.abs(Math.hypot(...axis) - 1) > 1e-8) throw new Error('Gear axis must be unit finite data.')
  const checked = (value: Quaternion) => validateRigidPose({ translation: [0, 0, 0], rotation: value }).rotation
  const q = product(inverse(checked(neutral)), product(inverse(checked(carrier)), checked(endpoint))), [x, y, z, w] = q, v: Vec3 = [x, y, z]
  const t = axis[0] * x + axis[1] * y + axis[2] * z, denominator = w * w + t * t, rho = Math.sqrt(denominator)
  if (!(rho > ASSEMBLY_GEAR_CHART_MARGIN)) throw new RotationChartError('Gear swing/twist chart is singular; no angular branch is inferred.')
  let wrappedAngle = 2 * Math.atan2(t, w)
  wrappedAngle -= TAU * Math.floor((wrappedAngle + Math.PI) / TAU)
  const angle = finite(wrappedAngle + TAU * Math.round((anchorAngle - wrappedAngle) / TAU), 'Lifted gear angle')
  if (Math.abs(Math.abs(angle - anchorAngle) - Math.PI) <= ASSEMBLY_GEAR_CHART_MARGIN) {
    throw new RotationChartError('Gear angular continuation is ambiguous at a half turn; an explicit continuous path is required.')
  }
  if (32 * Number.EPSILON * Math.max(1, Math.abs(anchorAngle), Math.abs(angle)) > angleTolerance) {
    throw new RangeError('Lifted gear angle exceeds the requested angular precision.')
  }
  const cross: Vec3 = [v[1] * axis[2] - v[2] * axis[1], v[2] * axis[0] - v[0] * axis[2], v[0] * axis[1] - v[1] * axis[0]]
  const local = axis.map((value, i) => (w * w * value + w * cross[i] + t * v[i]) / denominator) as Vec3
  const gradient = rotate(carrier, rotate(neutral, local))
  if (!gradient.every(Number.isFinite)) throw new RangeError('Gear twist derivative exceeds finite precision.')
  return { angle, wrappedAngle, rho, gradient }
}
/** Conservative continuation admission along a left-retraction trial. */
export function assemblyGearStepAdmissible(rho: number, endpointStep: number, carrierStep: number): boolean {
  if (![rho, endpointStep, carrierStep].every(Number.isFinite) || endpointStep < 0 || carrierStep < 0) return false
  const length = endpointStep + carrierStep, lower = rho - length / 2
  return lower > ASSEMBLY_GEAR_CHART_MARGIN && length / lower < Math.PI - ASSEMBLY_GEAR_CHART_MARGIN
}
/** Rebase only accepted angular states; all other declarations remain intact. */
export function rebaseRigidGearAngles(problem: RigidMateProblem, angles: ReadonlyMap<string, AssemblyGearAngles>): RigidMateProblem {
  const rebase = (constraint: RigidGearConstraint): RigidGearConstraint => angles.has(constraint.id) ? { ...constraint, angles: { ...angles.get(constraint.id)! } } : constraint
  return { ...problem, constraints: problem.constraints.map(constraint => constraint.type === 'gear' ? rebase(constraint) : constraint),
    ...(problem.passiveGears ? { passiveGears: problem.passiveGears.map(rebase) } : {}) }
}
export function rigidGearTwists(constraint: RigidGearConstraint, poses: ReadonlyMap<string, RigidPose>, angleTolerance: number): { first: AssemblyGearTwist; second: AssemblyGearTwist } {
  const rotation = (endpoint: RigidMateEndpoint | null): Quaternion => {
    if (endpoint === null) return identityRigidPose().rotation
    if (endpoint.bodyId === null) return endpoint.frame.rotation
    const body = poses.get(endpoint.bodyId)
    if (!body) throw new Error('Gear endpoint names a missing body.')
    return product(body.rotation, endpoint.frame.rotation)
  }
  if (constraint.first.support?.kind !== 'cylinder' || constraint.second.support?.kind !== 'cylinder') throw new Error('Gear mates require two cylinder supports.')
  const carrier = rotation(constraint.carrier)
  return { first: measureAssemblyGearTwist(constraint.neutralRotations.first, carrier, rotation(constraint.first), constraint.first.support.axis, constraint.angles.first, angleTolerance),
    second: measureAssemblyGearTwist(constraint.neutralRotations.second, carrier, rotation(constraint.second), constraint.second.support.axis, constraint.angles.second, angleTolerance) }
}
export function deriveRigidGearAngles(problem: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>): Map<string, AssemblyGearAngles> {
  const output = new Map<string, AssemblyGearAngles>()
  for (const constraint of [...problem.constraints.filter((value): value is RigidGearConstraint => value.type === 'gear'), ...(problem.passiveGears ?? [])]) {
    const value = rigidGearTwists(constraint, poses, problem.angleTolerance)
    output.set(constraint.id, { first: value.first.angle, second: value.second.angle })
  }
  return output
}
/** Every moving endpoint is bounded against the same accepted chart state. */
export function admitRigidGearStep(problem: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>, rotationSteps: ReadonlyMap<string, number>): boolean {
  for (const constraint of [...problem.constraints.filter((value): value is RigidGearConstraint => value.type === 'gear'), ...(problem.passiveGears ?? [])]) {
    const twists = rigidGearTwists(constraint, poses, problem.angleTolerance)
    const step = (endpoint: RigidMateEndpoint | null) => endpoint?.bodyId ? rotationSteps.get(endpoint.bodyId) ?? 0 : 0
    if (!assemblyGearStepAdmissible(twists.first.rho, step(constraint.first), step(constraint.carrier))
      || !assemblyGearStepAdmissible(twists.second.rho, step(constraint.second), step(constraint.carrier))) return false
  }
  return true
}
