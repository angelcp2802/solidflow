import { validateAssemblySymmetryReferenceSet, type AssemblySymmetryReferenceSet } from '../model/assemblySymmetryReferences'
import { measureSymmetrySupports, type SymmetryMeasuredSupport } from '../model/assemblySymmetryMeasurement'
import type { AssemblyDocument } from '../model/assemblyDocument'
import { transformRigidDirection, type RigidPose } from '../model/rigidPose'
import type { Vec3 } from './kernel.types'
import { AssemblyGeometrySnapshot, assemblyEndpointPlacementArithmetic, assemblyPointPlacementArithmetic,
  type AssemblyEndpointWitness, type AssemblyPointWitness } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'

export interface AssemblySymmetryMeasurementOptions { lengthToleranceMm?: number; angleToleranceRad?: number }
type Witness = AssemblyEndpointWitness | AssemblyPointWitness
type Measurement = ReturnType<typeof measureSymmetrySupports>
class SymmetryCompositionPrecisionError extends RangeError {}
export type AssemblyNativeSymmetryMeasurement = Measurement & {
  entityKind: AssemblySymmetryReferenceSet['entityKind']
  alignment: AssemblySymmetryReferenceSet['alignment']
  scopePath: string[]
  componentPaths: { source: string[]; target: string[]; mirror: string[] }
  /** Analytic infinite supports only. A detached report grants no Apply authority. */
  supportOnly: true
}
export type AssemblySymmetrySupportReport = Extract<AssemblyNativeSymmetryMeasurement, { status: 'ok' }> & {
  kind: 'symmetry'; mateId: string; lengthTolerance: number; angleTolerance: number
}

function policy(input: AssemblySymmetryMeasurementOptions): Required<AssemblySymmetryMeasurementOptions> {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('La política de medida debe contener datos propios.')
  const result = { lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 }
  for (const name of Reflect.ownKeys(input)) {
    const value = Object.getOwnPropertyDescriptor(input, name)!
    if (typeof name !== 'string' || !Object.hasOwn(result, name) || !value.enumerable || !('value' in value)
      || typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value <= 0) throw new Error('Tolerancias de simetría no válidas.')
    result[name as keyof typeof result] = value.value
  }
  if (result.angleToleranceRad >= Math.PI) throw new Error('La tolerancia angular debe ser inferior a pi.')
  return result
}
function scopeCopy(input: readonly string[]): string[] {
  if (!Array.isArray(input) || input.length > 64 || Reflect.ownKeys(input).length !== input.length + 1) throw new Error('El ámbito necesita una ruta densa de ocurrencias.')
  return Array.from({ length: input.length }, (_, index) => {
    const field = Object.getOwnPropertyDescriptor(input, String(index))
    if (!field || !field.enumerable || !('value' in field) || typeof field.value !== 'string' || !field.value.length) throw new Error('El ámbito necesita identificadores propios.')
    return field.value
  })
}
function assert(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, witness: Witness): void {
  if (witness.kind === 'point') snapshot.assertPointWitness(witness, document)
  else snapshot.assertWitness(witness, document)
}
function resolve(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  reference: AssemblySymmetryReferenceSet['source'] | AssemblySymmetryReferenceSet['mirror'], scopePath: readonly string[]): Witness {
  if (reference.kind === 'vertex') return snapshot.resolveVertexReference(document, reference, scopePath)
  if (reference.kind === 'face' && reference.support === 'cylinder-surface') return snapshot.resolveCylinderSurfaceReference(document, reference, scopePath)
  if (reference.kind === 'face' && reference.support === 'sphere-surface') return snapshot.resolveSphereSurfaceReference(document, reference, scopePath)
  return snapshot.resolveReference(document, reference, scopePath)
}
/** Compose directly relative to the common anchor. Original placement-chain
 * magnitudes are retained separately, so cancellation cannot erase the guard. */
function relativePoint(pose: RigidPose, point: Vec3, origin: Vec3): Vec3 {
  const rotated = transformRigidDirection(pose, point)
  return rotated.map((value, axis) => value + (pose.translation[axis] - origin[axis])) as Vec3
}
function measured(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, witness: Witness,
  kind: AssemblySymmetryReferenceSet['entityKind'], origin: Vec3): SymmetryMeasuredSupport {
  assert(snapshot, document, witness)
  const value = witness.kind === 'point' || witness.kind === 'support' || witness.kind === 'cylinder-surface' || witness.kind === 'sphere-surface' ? witness.localSupport : null
  if (!value) throw new Error('La simetría necesita los soportes analíticos declarados.')
  const localPoint: Vec3 = value.kind === 'sphere-surface' ? [...value.center] : [...value.point]
  const pose: RigidPose = { translation: [...witness.declaredWorldPose.translation], rotation: [...witness.declaredWorldPose.rotation] }
  const arithmetic = witness.kind === 'point' ? assemblyPointPlacementArithmetic(witness, document) : assemblyEndpointPlacementArithmetic(witness, document)
  const round = 128 * Number.EPSILON * (arithmetic.depth + 1)
  const pointMm = relativePoint(pose, localPoint, origin)
  // Native shape tolerance is a declared linear support envelope, not a
  // measured angular uncertainty or a physical metrology certificate.
  const positionErrorMm = value.tolerance + round * arithmetic.placementSum + round * Math.hypot(...localPoint)
    + round * Math.hypot(...origin) + round * Math.hypot(...pointMm)
  if (!pointMm.every(Number.isFinite) || !Number.isFinite(positionErrorMm)) throw new SymmetryCompositionPrecisionError('La composición relativa de las referencias excede la precisión finita.')
  const common = { pointMm, positionErrorMm }
  if (kind === 'point' && witness.kind === 'point' && value.kind === 'point') return { ...common, kind: 'point' }
  if (kind === 'sphere' && witness.kind === 'sphere-surface' && value.kind === 'sphere-surface') return {
    ...common, kind: 'sphere', radiusMm: value.radius, radiusErrorMm: value.tolerance + round * value.radius }
  if (kind === 'plane' && witness.kind === 'support' && value.kind === 'plane') return {
    ...common, kind: 'plane', normal: transformRigidDirection(pose, [...value.normal]), directionErrorRad: round }
  if (kind === 'line' && witness.kind === 'support' && (value.kind === 'line' || value.kind === 'cylinder')) return {
    ...common, kind: 'line', axis: transformRigidDirection(pose, [...value.axis]), directionErrorRad: round }
  if (kind === 'cylinder' && witness.kind === 'cylinder-surface' && value.kind === 'cylinder-surface') return {
    ...common, kind: 'cylinder', axis: transformRigidDirection(pose, [...value.axis]), directionErrorRad: round,
    radiusMm: value.radius, radiusErrorMm: value.tolerance + round * value.radius }
  throw new Error('El propósito nativo no coincide con la familia de simetría declarada.')
}

/** Three fresh current-native observations, followed by independent physical
 * reflection and uncertainty admission. No solver rows or saved mate are used. */
export function measureAssemblySymmetryReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  input: unknown, options: AssemblySymmetryMeasurementOptions = {}, scopePath: readonly string[] = []): AssemblyNativeSymmetryMeasurement {
  const request = validateAssemblySymmetryReferenceSet(input), config = policy(options), scope = scopeCopy(scopePath)
  try {
    const source = resolve(snapshot, document, request.source, scope)
    const target = resolve(snapshot, document, request.target, scope)
    const mirror = resolve(snapshot, document, request.mirror, scope)
    const origin: Vec3 = [...mirror.declaredWorldPose.translation]
    let result: Measurement
    try {
      const a = measured(snapshot, document, source, request.entityKind, origin)
      const b = measured(snapshot, document, target, request.entityKind, origin)
      const m = measured(snapshot, document, mirror, 'plane', origin)
      if (m.kind !== 'plane') throw new Error('La tercera referencia de simetría necesita un plano.')
      result = measureSymmetrySupports(a, b, m, request.alignment, config.lengthToleranceMm, config.angleToleranceRad)
    } catch (error) {
      if (!(error instanceof SymmetryCompositionPrecisionError)) throw error
      result = { status: 'precisionLimit', message: error.message }
    }
    // Validation and all native queries may be reentrant. Recheck every private
    // witness against the original live document immediately before returning.
    for (const value of [source, target, mirror]) assert(snapshot, document, value)
    return { ...result, entityKind: request.entityKind, alignment: request.alignment, scopePath: scope,
      componentPaths: { source: [...source.componentPath], target: [...target.componentPath], mirror: [...mirror.componentPath] }, supportOnly: true }
  } catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Symmetry measurement or release failed.') }
    throw error
  }
}
