import { assemblyOccurrencePathKey, type AssemblyDocument } from '../model/assemblyDocument'
import { validateAssemblyProfileReferencePair } from '../model/assemblyProfileReferences'
import { measureOrderedProfileCenters, type ProfileCenterObservation } from '../model/assemblyProfileCenterMeasurement'
import { transformRigidDirection, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyProfilePlacementArithmetic, type AssemblyProfileWitness } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

export interface AssemblyProfileMeasurementOptions { lengthResolutionMm?: number; angleResolutionRad?: number }
type Measurement = ReturnType<typeof measureOrderedProfileCenters>
export type AssemblyNativeProfileMeasurement = Measurement & {
  scopePath: string[]
  componentPaths: { first: string[]; second: string[] }
  profileKinds: { first: 'rectangle' | 'circle'; second: 'rectangle' | 'circle' }
  coordinateFrame: 'world-axes-relative-to-first-placement'
  measurementOnly: true
}
class ProfileCompositionPrecisionError extends RangeError {}

function policy(input: AssemblyProfileMeasurementOptions): Required<AssemblyProfileMeasurementOptions> {
  if (!input || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw Error('Profile measurement policy requires a plain data record.')
  const result = { lengthResolutionMm: 1e-6, angleResolutionRad: 1e-8 }
  for (const name of Reflect.ownKeys(input)) {
    const field = Object.getOwnPropertyDescriptor(input, name)!
    if (typeof name !== 'string' || !Object.hasOwn(result, name) || !field.enumerable || !('value' in field)
      || typeof field.value !== 'number' || !Number.isFinite(field.value) || field.value <= 0) throw Error('Invalid profile numerical resolution.')
    result[name as keyof typeof result] = field.value
  }
  if (result.angleResolutionRad >= Math.PI) throw Error('Profile angular resolution must be less than pi.')
  return result
}
function measured(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, witness: AssemblyProfileWitness, origin: Vec3): ProfileCenterObservation {
  snapshot.assertProfileWitness(witness, document)
  const local = witness.localSupport, pose: RigidPose = { translation: [...witness.declaredWorldPose.translation], rotation: [...witness.declaredWorldPose.rotation] }
  const localCenter: Vec3 = [...local.center], rotated = transformRigidDirection(pose, localCenter)
  // Subtract the common translation before adding the local point. Keep all
  // original chain magnitudes in the budget even if their final pose cancels.
  const centerMm = rotated.map((v, i) => v + (pose.translation[i] - origin[i])) as Vec3
  const arithmetic = assemblyProfilePlacementArithmetic(witness, document), round = 128 * Number.EPSILON * (arithmetic.depth + 1)
  const centerErrorMm = local.uncertainty.positionErrorMm + round * arithmetic.placementSum + round * Math.hypot(...localCenter)
    + round * Math.hypot(...origin) + round * Math.hypot(...centerMm)
  const normal = transformRigidDirection(pose, [...local.normal]), normalErrorRad = local.uncertainty.normalErrorRad + round
  if (![...centerMm, ...normal, centerErrorMm, normalErrorRad].every(Number.isFinite)) throw new ProfileCompositionPrecisionError('Profile relative composition exceeds finite arithmetic.')
  snapshot.assertProfileWitness(witness, document)
  return { centerMm, normal, centerErrorMm, normalErrorRad }
}

/** Two fresh bounded-profile queries with live, separate-purpose native proof.
 * Measures ordered centers/normals only: no solver, target, roll, compatibility
 * admission, saved mate or Apply authority. Successful calculation retains the
 * borrowed snapshot. Native/query failures dispose it; malformed selection,
 * scope and policy reject before native queries and leave it with the caller. */
export function measureAssemblyProfileReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, input: unknown,
  options: AssemblyProfileMeasurementOptions = {}, scopePath: readonly string[] = []): AssemblyNativeProfileMeasurement {
  const request = validateAssemblyProfileReferencePair(input), config = policy(options)
  const scope = JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
  try {
    const bands = { lengthToleranceMm: config.lengthResolutionMm, angleToleranceRad: config.angleResolutionRad }
    const first = snapshot.resolveProfileFaceSelection(document, request.first, scope, bands)
    const second = snapshot.resolveProfileFaceSelection(document, request.second, scope, bands)
    const origin: Vec3 = [...first.declaredWorldPose.translation]
    let result: Measurement
    try {
      const a = measured(snapshot, document, first, origin), b = measured(snapshot, document, second, origin)
      result = measureOrderedProfileCenters(a, b, { lengthMm: config.lengthResolutionMm, angleRad: config.angleResolutionRad })
    } catch (error) {
      if (!(error instanceof ProfileCompositionPrecisionError)) throw error
      result = { status: 'precisionLimit', message: error.message }
    }
    // Every query and document validation can be reentrant. Neither a prior
    // valid witness nor a copied display report can replace this final check.
    snapshot.assertProfileWitness(first, document)
    snapshot.assertProfileWitness(second, document)
    return { ...result, scopePath: scope, componentPaths: { first: [...first.componentPath], second: [...second.componentPath] },
      profileKinds: { first: first.localSupport.kind, second: second.localSupport.kind },
      coordinateFrame: 'world-axes-relative-to-first-placement', measurementOnly: true }
  } catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Profile measurement or release failed.') }
    throw error
  }
}
