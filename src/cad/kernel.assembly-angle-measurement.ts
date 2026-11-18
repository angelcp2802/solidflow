import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { ASSEMBLY_DIRECTED_ANGLE_TOLERANCE_RADIANS, measureDirectedAngle, validateAssemblyDirectedAngleRequest,
  type AssemblyDirectedAngleRequest, type AssemblyDirectedAngleReport } from '../model/assemblyDirectedAngle'
import { transformRigidDirection } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyEndpointPlacementArithmetic, type AssemblyEndpointWitness } from './kernel.assembly-snapshot'
import { withNativeOwners } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

/** Uses native-owned placement evidence; a copied or stale witness cannot pass. */
export function measureAssemblyDirectedAngleWitnesses(document: AssemblyDocument,
  witnesses: readonly [AssemblyEndpointWitness, AssemblyEndpointWitness, AssemblyEndpointWitness],
  tolerance = ASSEMBLY_DIRECTED_ANGLE_TOLERANCE_RADIANS): Omit<AssemblyDirectedAngleReport, keyof AssemblyDirectedAngleRequest> {
  const actual = (witness: AssemblyEndpointWitness): { kind: 'plane' | 'cylinder' | 'line'; direction: Vec3; error: number } => {
    const arithmetic = assemblyEndpointPlacementArithmetic(witness, document)
    if (witness.kind !== 'support') throw new Error('La medición angular necesita una normal, un eje cilíndrico o una arista LINE actual.')
    const support = witness.localSupport, direction = transformRigidDirection({ translation: [...witness.declaredWorldPose.translation], rotation: [...witness.declaredWorldPose.rotation] },
      [...(support.kind === 'plane' ? support.normal : support.axis)] as Vec3), length = Math.hypot(...direction)
    if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-8) throw new Error('La dirección angular nativa no es unitaria.')
    return { kind: support.kind, direction: direction.map(value => value / length) as Vec3,
      error: 128 * Number.EPSILON * (arithmetic.depth + 1) }
  }
  const [first, second, guide] = witnesses.map(actual),
    measured = measureDirectedAngle(first.direction, second.direction, guide.direction, tolerance),
    compositionAllowance = 8 * ((first.error + guide.error) / measured.projectionLengths.first
      + (second.error + guide.error) / measured.projectionLengths.second)
  // Explicit Float64 admission policy for composed frames; not a native SDK
  // interval or permission to increase the requested angular tolerance.
  if (!Number.isFinite(compositionAllowance) || compositionAllowance > tolerance) {
    throw new RangeError('La composición y proyección de los marcos excede la precisión angular solicitada.')
  }
  return { coordinate: 'directed-about-axis', angleDegrees: measured.angleRadians * 180 / Math.PI,
    angleToleranceRadians: tolerance, firstKind: first.kind, secondKind: second.kind, guideKind: guide.kind,
    firstDirection: [...first.direction] as Vec3, secondDirection: [...second.direction] as Vec3, guideDirection: [...guide.direction] as Vec3,
    projectionLengths: { ...measured.projectionLengths }, supportOnly: true }
}

/** Fresh, read-only native directions. Does not create/discard a solve capability. */
export function measureAssemblyDirectedAngleNative(current: AssemblyDocument, input: AssemblyDirectedAngleRequest): AssemblyDirectedAngleReport {
  const document = validateAssemblyDocument(current), request = validateAssemblyDirectedAngleRequest(input)
  return withNativeOwners<AssemblyDirectedAngleReport>(owners => {
    const snapshot = new AssemblyGeometrySnapshot(document)
    owners.own({ delete: () => snapshot.dispose() })
    const witnesses = [request.first, request.second, request.guide].map(reference =>
      snapshot.resolveDirectionReference(document, reference, request.scopePath))
    witnesses.forEach(witness => snapshot.assertWitness(witness, document))
    const measured = measureAssemblyDirectedAngleWitnesses(document, [witnesses[0], witnesses[1], witnesses[2]])
    return { ...measured, scopePath: [...request.scopePath],
      first: structuredClone(request.first), second: structuredClone(request.second), guide: structuredClone(request.guide), supportOnly: true }
  }, undefined, 'Assembly directed-angle query or release failed.')
}
