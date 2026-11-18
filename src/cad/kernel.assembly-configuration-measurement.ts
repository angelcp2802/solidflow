import { transformRigidDirection, validateRigidPose } from '../model/rigidPose'
import { AssemblyConfigurationGeometrySnapshot, assemblyConfigurationPlacementArithmetic,
  type AssemblyConfigurationGeometryInput, type AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import type { ConfiguredResolvedMate } from './kernel.assembly-configuration-relations'
import type { Vec3 } from './kernel.types'

export interface ConfiguredMeasurementOptions { lengthToleranceMm?: number; angleToleranceRad?: number }
export class ConfiguredMeasurementPrecisionError extends RangeError {}
const ROUND = 128 * Number.EPSILON
const intrinsicRelation = AssemblyConfigurationGeometrySnapshot.prototype.assertResolvedMate
const intrinsicWitness = AssemblyConfigurationGeometrySnapshot.prototype.assertWitness
const norm = (value: readonly number[]) => Math.hypot(...value)

/** Strict requested bands. Native envelopes consume these bands; they never enlarge them. */
export function configuredMeasurementBands(input: ConfiguredMeasurementOptions = {}): Required<ConfiguredMeasurementOptions> {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('Configured measurement options require plain own data.')
  const result = { lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 }
  for (const key of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, key)!
    if (typeof key !== 'string' || !Object.hasOwn(result, key) || !field.enumerable || !('value' in field)
      || typeof field.value !== 'number' || !Number.isFinite(field.value) || field.value <= 0) throw Error('Configured measurement bands require positive finite own values.')
    result[key as keyof typeof result] = field.value
  }
  if (result.angleToleranceRad >= Math.PI / 2) throw Error('Configured measurement angular bands must distinguish axial and radial directions.')
  return result
}

/** Intrinsic private-registry checks, including all children, resist instance method overrides.
 * Use at both boundaries, including precision-limit returns. No borrowed session is disposed. */
export function authenticateConfiguredMeasurement(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, value: ConfiguredResolvedMate): void {
  // The native implementation checks the complete context before and after
  // all privately registered child identities in one atomic sequence. Calling
  // each public child check again would repeat the same declaration parsing.
  intrinsicRelation.call(snapshot, value, input)
}
export function metadataConfiguredMeasurement(value: ConfiguredResolvedMate) {
  return { mateId: value.mate.id, scopePath: [...value.scopePath], scope: { ...value.scope }, configuration: value.configuration,
    configurationAncestry: structuredClone(value.configurationAncestry), scopePose: structuredClone(value.scopePose),
    suppressed: value.suppressed, scopeSuppressed: value.scopeSuppressed, supportOnly: true as const, verificationOnly: true as const }
}

type DirectionWitness = Extract<AssemblyConfigurationWitness, { kind: 'configured-plane' | 'configured-support' | 'configured-direction' | 'configured-cylinder-surface' }>
function directionWitness(witness: AssemblyConfigurationWitness): DirectionWitness {
  if (witness.kind !== 'configured-plane' && witness.kind !== 'configured-support' && witness.kind !== 'configured-direction' && witness.kind !== 'configured-cylinder-surface') throw Error('Configured direction measurement requires a genuine directional purpose.')
  return witness
}
function rotatedUnit(pose: Parameters<typeof transformRigidDirection>[0], direction: readonly number[], round: number) {
  const source: Vec3 = [direction[0], direction[1], direction[2]], rotated = transformRigidDirection(pose, source), magnitude = norm(rotated)
  if (!Number.isFinite(magnitude) || magnitude < .5 || magnitude > 1.5) throw new ConfiguredMeasurementPrecisionError('Configured direction cannot be resolved as a finite unit vector.')
  const errorRad = round + Math.abs(norm(source) - 1) + Math.abs(magnitude - 1)
  const unit = rotated.map(x => x / magnitude) as Vec3
  if (!Number.isFinite(errorRad) || !unit.every(Number.isFinite)) throw new ConfiguredMeasurementPrecisionError('Configured direction arithmetic is not finite.')
  return { unit, errorRad, ball: 2 * Math.sin(Math.min(Math.PI, errorRad) / 2) }
}
/** Directions deliberately omit positional/native topology uncertainty. */
export function measureConfiguredDirection(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput, witness: AssemblyConfigurationWitness) {
  intrinsicWitness.call(snapshot, witness, input)
  const w = directionWitness(witness), local = w.localSupport, pose = validateRigidPose(w.declaredWorldPose)
  const arithmetic = assemblyConfigurationPlacementArithmetic(w, input)
  const result = rotatedUnit(pose, local.kind === 'plane' ? local.normal : local.axis, ROUND * (arithmetic.depth + 2))
  intrinsicWitness.call(snapshot, witness, input)
  return result
}

export interface ConfiguredMeasuredSupport {
  kind: 'plane' | 'line' | 'cylinder' | 'point' | 'cylinder-surface' | 'sphere-surface'
  pointMm: Vec3
  direction: Vec3 | null
  xDirection: Vec3 | null
  radiusMm: number | null
  positionErrorMm: number
  directionErrorRad: number | null
  radiusErrorMm: number | null
  radialMaterialSense: 1 | -1 | null
  nativeToleranceMm: number
}
/** Compose positional purposes directly around a nearby anchor. Original full-chain
 * translations remain in the uncertainty before cancellation; no inverse-world frame.
 * Detached numbers do not issue native proof or promote an axis into a material surface. */
export function measureConfiguredSupport(snapshot: AssemblyConfigurationGeometrySnapshot, input: AssemblyConfigurationGeometryInput,
  witness: AssemblyConfigurationWitness, origin: Vec3): ConfiguredMeasuredSupport {
  intrinsicWitness.call(snapshot, witness, input)
  if (witness.kind !== 'configured-plane' && witness.kind !== 'configured-support' && witness.kind !== 'configured-point'
    && witness.kind !== 'configured-cylinder-surface' && witness.kind !== 'configured-sphere-surface') throw Error('Configured positional measurement requires the declared complete native support purpose.')
  if (!Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) throw Error('Configured measurement anchor must be a finite vector.')
  const local = witness.localSupport, pose = validateRigidPose(witness.declaredWorldPose)
  const point: Vec3 = local.kind === 'sphere-surface' ? [...local.center] : [...local.point]
  const arithmetic = assemblyConfigurationPlacementArithmetic(witness, input), round = ROUND * (arithmetic.depth + 2)
  const rotated = transformRigidDirection(pose, point)
  const pointMm = rotated.map((v, i) => v + (pose.translation[i] - origin[i])) as Vec3
  const positionErrorMm = local.tolerance + round * (arithmetic.placementSum + norm(point) + norm(origin) + norm(pose.translation) + norm(pointMm))
  const oriented = local.kind === 'plane' || local.kind === 'line' || local.kind === 'cylinder' || local.kind === 'cylinder-surface'
    ? rotatedUnit(pose, local.kind === 'plane' ? local.normal : local.axis, round) : null
  const x = 'xDirection' in local ? rotatedUnit(pose, local.xDirection, round) : null
  const radiusMm = 'radius' in local ? local.radius : null
  const radiusErrorMm = radiusMm === null ? null : local.tolerance + round * radiusMm
  if (![...pointMm, positionErrorMm, ...(radiusMm === null ? [] : [radiusMm, radiusErrorMm!])].every(Number.isFinite)) throw new ConfiguredMeasurementPrecisionError('Configured support composition exceeds finite measurement precision.')
  intrinsicWitness.call(snapshot, witness, input)
  return { kind: local.kind, pointMm, direction: oriented?.unit ?? null, xDirection: x?.unit ?? null, radiusMm,
    positionErrorMm, directionErrorRad: oriented === null ? null : Math.max(oriented.errorRad, x?.errorRad ?? 0), radiusErrorMm,
    radialMaterialSense: 'radialMaterialSense' in local ? local.radialMaterialSense : null, nativeToleranceMm: local.tolerance }
}
