import type { Vec3 } from '../cad/kernel.types'
import type { Quaternion, RigidPose } from './rigidPose'
import { composeRigidPoses, identityRigidPose, rigidRotationMatrix, validateRigidPose } from './rigidPose'
import { assemblyGearStepAdmissible, measureAssemblyGearTwist, type AssemblyGearTwist } from './assemblyGear'
import type { RigidMateEndpoint, RigidMateProblem, RigidScrewConstraint } from './assemblySolveTypes'

export interface AssemblyScrewData {
  /** Positive millimeters per full relative turn. */
  lead: number
  reverse: boolean
  alignment: 'aligned' | 'opposed'
  /** Q_second^-1 * Q_first at authenticated aligned capture. */
  neutralRotation: Quaternion
  /** First relative to second, about the first native axis; lifted radians. */
  angle: number
  /** Captured first-axis projection of second minus first component origins, mm. */
  neutralTravel: number
}
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(name + ' must be finite.')
  return value
}
/** Signed mm/radian coefficient; never infer lead or handedness from radii. */
export function assemblyScrewAdvance(lead: number, reverse: boolean): number {
  finite(lead, 'Screw lead')
  if (lead <= 0 || typeof reverse !== 'boolean') throw new Error('Screw needs positive lead and explicit reverse.')
  const advance = lead / (2 * Math.PI)
  if (advance === 0 || !Number.isFinite(advance)) throw new RangeError('Screw advance is not representable.')
  return reverse ? -advance : advance
}
export function validateAssemblyScrewData(input: unknown): AssemblyScrewData {
  const keys = ['lead', 'reverse', 'alignment', 'neutralRotation', 'angle', 'neutralTravel']
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Screw needs plain data.')
  const source: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !keys.includes(key) || !field.enumerable || !('value' in field)) throw new Error('Unknown or executable screw field.')
    source[key] = field.value
  }
  if (keys.some(key => !Object.hasOwn(source, key))) throw new Error('Missing screw field.')
  const lead = finite(source.lead, 'Screw lead')
  assemblyScrewAdvance(lead, source.reverse as boolean)
  if (source.alignment !== 'aligned' && source.alignment !== 'opposed') throw new Error('Unknown screw alignment.')
  return { lead, reverse: source.reverse as boolean, alignment: source.alignment,
    neutralRotation: validateRigidPose({ translation: [0, 0, 0], rotation: source.neutralRotation }).rotation,
    angle: finite(source.angle, 'Lifted screw angle'), neutralTravel: finite(source.neutralTravel, 'Screw neutral travel') }
}
function endpointRotation(endpoint: RigidMateEndpoint, poses: ReadonlyMap<string, RigidPose>): Quaternion {
  const frame = validateRigidPose(endpoint.frame)
  if (endpoint.bodyId === null) return frame.rotation
  const body = poses.get(endpoint.bodyId)
  if (!body) throw new Error('Screw endpoint names a missing body.')
  return composeRigidPoses({ translation: [0, 0, 0], rotation: body.rotation }, { translation: [0, 0, 0], rotation: frame.rotation }).rotation
}
export function rigidScrewTwist(constraint: RigidScrewConstraint, poses: ReadonlyMap<string, RigidPose>, angleTolerance: number): AssemblyGearTwist {
  if (constraint.first.support?.kind !== 'cylinder' || constraint.second.support?.kind !== 'cylinder') throw new Error('Screw mates require two cylinder supports.')
  return measureAssemblyGearTwist(constraint.neutralRotation, endpointRotation(constraint.second, poses),
    endpointRotation(constraint.first, poses), constraint.first.support.axis, constraint.angle, angleTolerance)
}
/** Component-origin travel; cylinder parameter origins never define screw phase. */
export function rigidScrewCoordinates(constraint: RigidScrewConstraint, poses: ReadonlyMap<string, RigidPose>, angleTolerance: number,
  conditioning: { origin: Vec3; lengthScale: number } = { origin: [0, 0, 0], lengthScale: 1 }): { angle: number; travel: number; twist: AssemblyGearTwist } {
  const twist = rigidScrewTwist(constraint, poses, angleTolerance), firstRotation = endpointRotation(constraint.first, poses)
  const scale = finite(conditioning.lengthScale, 'Screw length scale')
  if (scale <= 0) throw new Error('Screw length scale must be positive.')
  const origin = validateRigidPose({ translation: conditioning.origin, rotation: identityRigidPose().rotation }).translation
  const rotate = (q: Quaternion, vector: Vec3): Vec3 => {
    const r = rigidRotationMatrix(q)
    return [0, 1, 2].map(i => finite(r[i * 3] * vector[0] + r[i * 3 + 1] * vector[1] + r[i * 3 + 2] * vector[2], 'Screw coordinate')) as Vec3
  }
  const localOrigin = (endpoint: RigidMateEndpoint): Vec3 => {
    const body = endpoint.bodyId === null ? identityRigidPose() : poses.get(endpoint.bodyId)!
    const frame = validateRigidPose(endpoint.frame)
    const base = endpoint.bodyId === null ? frame.translation : body.translation
    const offset = endpoint.bodyId === null ? [0, 0, 0] as Vec3 : rotate(body.rotation, frame.translation.map(value => value / scale) as Vec3)
    return base.map((value, i) => finite((value - origin[i]) / scale + offset[i], 'Screw conditioned origin')) as Vec3
  }
  const support = constraint.first.support
  if (support?.kind !== 'cylinder') throw new Error('Screw needs a first native cylinder axis.')
  const a = localOrigin(constraint.first), b = localOrigin(constraint.second), n = rotate(firstRotation, support.axis)
  const travel = finite((n[0] * (b[0] - a[0]) + n[1] * (b[1] - a[1]) + n[2] * (b[2] - a[2])) * scale, 'Screw travel')
  return { angle: twist.angle, travel, twist }
}
export function deriveRigidScrewAngles(problem: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>): Map<string, number> {
  const result = new Map<string, number>()
  for (const constraint of [...problem.constraints.filter((value): value is RigidScrewConstraint => value.type === 'screw'), ...(problem.passiveScrews ?? [])]) {
    result.set(constraint.id, rigidScrewTwist(constraint, poses, problem.angleTolerance).angle)
  }
  return result
}
export function rebaseRigidScrewAngles(problem: RigidMateProblem, angles: ReadonlyMap<string, number>): RigidMateProblem {
  const rebase = (constraint: RigidScrewConstraint): RigidScrewConstraint => angles.has(constraint.id) ? { ...constraint, angle: angles.get(constraint.id)! } : constraint
  return { ...problem, constraints: problem.constraints.map(value => value.type === 'screw' ? rebase(value) : value),
    ...(problem.passiveScrews ? { passiveScrews: problem.passiveScrews.map(rebase) } : {}) }
}
export function admitRigidScrewStep(problem: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>, rotationSteps: ReadonlyMap<string, number>): boolean {
  for (const constraint of [...problem.constraints.filter((value): value is RigidScrewConstraint => value.type === 'screw'), ...(problem.passiveScrews ?? [])]) {
    const twist = rigidScrewTwist(constraint, poses, problem.angleTolerance)
    const step = (endpoint: RigidMateEndpoint) => endpoint.bodyId === null ? 0 : rotationSteps.get(endpoint.bodyId) ?? 0
    if (!assemblyGearStepAdmissible(twist.rho, step(constraint.first), step(constraint.second))) return false
  }
  return true
}
