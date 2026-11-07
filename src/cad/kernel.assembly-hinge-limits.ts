import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyDefinition, type AssemblyDocument } from '../model/assemblyDocument'
import { validateAssemblyLimitedHingeReferenceRequest } from '../model/assemblyLimitedHingeReferences'
import { copyRigidHingeConstraint } from '../model/assemblyHingeNumeric'
import { composeRigidPoses, identityRigidPose } from '../model/rigidPose'
import type { RigidHingeConstraint, RigidMateEndpoint } from '../model/assemblySolveTypes'
import type { AssemblyDirectedAngleArc } from '../model/assemblyLimitDirectedAngle'
import { AssemblyGeometrySnapshot, assemblyEndpointPlacementArithmetic, type AssemblyEndpointWitness } from './kernel.assembly-snapshot'
import { resolveAssemblyHingeReferences, assertAssemblyHingeReferences, buildAssemblyHingeConstraint,
  type AssemblyResolvedHingeReferences, type AssemblyHingeMeasurementOptions } from './kernel.assembly-hinge'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

export interface AssemblyResolvedLimitedHingeReferences extends AssemblyResolvedHingeReferences {
  readonly stops: {
    readonly coordinate: 'directed-about-axis'
    readonly angular: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness]
    readonly arc: Readonly<AssemblyDirectedAngleArc>
  }
}
const issued = new WeakMap<object, { snapshot: AssemblyGeometrySnapshot; base: AssemblyResolvedHingeReferences }>()
export function assertAssemblyLimitedHingeReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  value: AssemblyResolvedLimitedHingeReferences): void {
  const proof = value && issued.get(value)
  if (!proof || proof.snapshot !== snapshot) throw Error('Limited hinge references were not issued by this snapshot.')
  assertAssemblyHingeReferences(snapshot, document, proof.base)
  for (const witness of value.stops.angular) snapshot.assertWitness(witness, document)
}
/** Internal composition bridge: returns only the already-issued base after all
 * six proofs are checked. It grants no additional native or Apply authority. */
export function getAssemblyLimitedHingeBase(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  value: AssemblyResolvedLimitedHingeReferences): AssemblyResolvedHingeReferences {
  assertAssemblyLimitedHingeReferences(snapshot, document, value)
  return issued.get(value)!.base
}
/** Syntax failures precede native queries. Once resolution begins, any failure
 * closes the whole borrowed snapshot; no partial six-role proof is published. */
export function resolveAssemblyLimitedHingeReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument,
  input: unknown, scopePath: readonly string[] = []): AssemblyResolvedLimitedHingeReferences {
  const request = validateAssemblyLimitedHingeReferenceRequest(input)
  const base = resolveAssemblyHingeReferences(snapshot, document, { axis: request.axis, axial: request.axial, alignment: request.alignment }, scopePath)
  try {
    const angular = request.stops.angular.map(reference => snapshot.resolveReference(document, reference, base.scopePath)) as [AssemblyEndpointWitness, AssemblyEndpointWitness]
    for (let i = 0; i < 2; i++) {
      const witness = angular[i]
      if (witness.kind !== 'support' || witness.localSupport.kind !== 'plane') throw Error('Limited hinge angular role requires current native planar support.')
      if ((witness.componentPath[0] ?? null) !== (base.axis[i].componentPath[0] ?? null)) throw Error('Limited hinge angular plane must share its corresponding effective rigid owner.')
    }
    assertAssemblyHingeReferences(snapshot, document, base)
    for (const witness of angular) snapshot.assertWitness(witness, document)
    const value: AssemblyResolvedLimitedHingeReferences = Object.freeze({ ...base, stops: Object.freeze({ coordinate: 'directed-about-axis' as const,
      angular: Object.freeze(angular), arc: Object.freeze({ ...request.stops.arc }) }) })
    issued.set(value, { snapshot, base })
    return value
  } catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Limited hinge resolution or release failed.') }
    throw error
  }
}
function angularEndpoint(document: AssemblyDocument, witness: AssemblyEndpointWitness): RigidMateEndpoint {
  if (witness.kind !== 'support' || witness.localSupport.kind !== 'plane') throw Error('Limited hinge angular role requires native plane support.')
  const table = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  let node: AssemblyDefinition = document, frame = identityRigidPose()
  for (let i = 0; i < witness.componentPath.length; i++) {
    if (node.kind !== 'assembly') throw Error('Limited hinge path crosses a part.')
    const occurrence = node.occurrences.find(value => value.id === witness.componentPath[i])
    if (!occurrence || occurrence.suppressed) throw Error('Limited hinge angular occurrence is unavailable.')
    if (i > 0) frame = composeRigidPoses(frame, occurrence.pose)
    const next = table.get(assemblyDefinitionKey(occurrence.definition))
    if (!next) throw Error('Limited hinge angular source is unavailable.')
    node = next
  }
  const support = witness.localSupport
  return { bodyId: witness.componentPath[0] ?? null, frame, support: { kind: 'plane', point: [...support.point] as Vec3,
    normal: [...support.normal] as Vec3, xDirection: [...support.xDirection] as Vec3, tolerance: support.tolerance } }
}
/** Detached numerical intent only. Projection observability, stop satisfaction
 * and finite angular error admission remain the evaluator/measurement's job. */
export function buildAssemblyLimitedHingeConstraint(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument,
  value: AssemblyResolvedLimitedHingeReferences, id: string, options: AssemblyHingeMeasurementOptions = {}): RigidHingeConstraint {
  const base = getAssemblyLimitedHingeBase(snapshot, input, value)
  const document = validateAssemblyDocument(input)
  const unlimited = buildAssemblyHingeConstraint(snapshot, input, base, id, options)
  const angular = value.stops.angular.map(witness => angularEndpoint(document, witness)) as [RigidMateEndpoint, RigidMateEndpoint]
  const uncertainty = value.stops.angular.map(witness => {
    if (witness.kind !== 'support') throw Error('Limited hinge needs actual support.')
    const arithmetic = assemblyEndpointPlacementArithmetic(witness, input), round = 128 * Number.EPSILON * (arithmetic.depth + 1)
    const positionErrorMm = witness.localSupport.tolerance + round * (arithmetic.placementSum + Math.hypot(...witness.localSupport.point))
    if (!Number.isFinite(positionErrorMm)) throw new RangeError('Limited hinge original placement uncertainty is not finite.')
    return { positionErrorMm, directionErrorRad: round }
  }) as NonNullable<NonNullable<RigidHingeConstraint['stops']>['uncertainty']>
  const result = copyRigidHingeConstraint({ ...unlimited, stops: { coordinate: value.stops.coordinate,
    angular, arc: { ...value.stops.arc }, uncertainty } })
  assertAssemblyLimitedHingeReferences(snapshot, input, value)
  return result
}
