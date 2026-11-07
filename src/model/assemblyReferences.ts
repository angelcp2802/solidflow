import type { RigidPose } from './rigidPose'
import { composeRigidPoses, identityRigidPose } from './rigidPose'
import { bodyReferenceCreationFeatureId } from './bodyReferences'
import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyComponentReference,
  type AssemblyHingeMate, type AssemblyDefinition, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyBinaryMate, type AssemblyWidthCenteredMate,
  type AssemblyOccurrence, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference, type EmbeddedAssemblyDefinition, type AssemblyVertexReference, type AssemblySymmetryMate, type AssemblyProfileCenterMate, type AssemblyLinePathMate, type AssemblyCircularPathMate } from './assemblyDocument'

export type AssemblyReferenceProblem = 'MISSING_OCCURRENCE' | 'PATH_THROUGH_PART' | 'STALE_DEFINITION'
  | 'SUPPRESSED_COMPONENT' | 'FACE_REQUIRES_PART' | 'MISSING_FACE_PRODUCER'
  | 'SUPPRESSED_FACE_PRODUCER' | 'MISSING_BODY_STATE' | 'SUPPRESSED_BODY_PRODUCER'
  | 'FACE_BODY_STATE_MISMATCH'
  | 'EDGE_REQUIRES_PART' | 'MISSING_EDGE_PRODUCER' | 'SUPPRESSED_EDGE_PRODUCER' | 'EDGE_BODY_STATE_MISMATCH'
  | 'VERTEX_REQUIRES_PART' | 'MISSING_VERTEX_PRODUCER' | 'SUPPRESSED_VERTEX_PRODUCER' | 'VERTEX_BODY_STATE_MISMATCH'

export interface AssemblyReferenceDiagnostic {
  code: AssemblyReferenceProblem
  /** Full occurrence path, scoped to this actual assembly occurrence. */
  path: string[]
}
export interface AssemblyComponentCandidate {
  path: string[]
  definition: AssemblyDefinition
  chain: AssemblyOccurrence[]
  /** Declared placement only; neither solved nor native geometry evidence. */
  worldPose: RigidPose
  suppressed: boolean
  visible: boolean
}
export interface AssemblyEndpointInspection {
  /** Null also covers a principal plane of the declaring assembly frame. */
  candidate: AssemblyComponentCandidate | null
  diagnostics: AssemblyReferenceDiagnostic[]
}
interface AssemblyMateInspectionBase {
  scopePath: string[]
  scopePose: RigidPose
  suppressed: boolean
  /** An empty syntax diagnostic list never attests a native face or a solution. */
  nativeVerificationRequired: true
}
export interface AssemblyBinaryMateInspection extends AssemblyMateInspectionBase {
  mate: AssemblyBinaryMate
  first: AssemblyEndpointInspection
  second: AssemblyEndpointInspection
  /** Present for a gear; null candidate denotes its explicitly fixed scope carrier. */
  carrier?: AssemblyEndpointInspection
  /** Explicit directional guide for a circular angular stop. */
  guide?: AssemblyEndpointInspection
}
export interface AssemblyWidthMateInspection extends AssemblyMateInspectionBase {
  mate: AssemblyWidthCenteredMate
  width: [AssemblyEndpointInspection, AssemblyEndpointInspection]
  tab: [AssemblyEndpointInspection, AssemblyEndpointInspection]
}
export interface AssemblySymmetryMateInspection extends AssemblyMateInspectionBase {
  mate: AssemblySymmetryMate
  source: AssemblyEndpointInspection
  target: AssemblyEndpointInspection
  mirror: AssemblyEndpointInspection
}
export interface AssemblyProfileCenterMateInspection extends AssemblyMateInspectionBase {
  mate: AssemblyProfileCenterMate
  first: AssemblyEndpointInspection
  second: AssemblyEndpointInspection
}
export interface AssemblyLinePathMateInspection extends AssemblyMateInspectionBase { mate: AssemblyLinePathMate; point: AssemblyEndpointInspection; path: AssemblyEndpointInspection; up?: AssemblyEndpointInspection }
export function isAssemblyLinePathMateInspection(inspection: AssemblyMateInspection): inspection is AssemblyLinePathMateInspection { return inspection.mate.type === 'line-path' }
export interface AssemblyCircularPathMateInspection extends AssemblyMateInspectionBase { mate: AssemblyCircularPathMate; point: AssemblyEndpointInspection; path: AssemblyEndpointInspection; up?: AssemblyEndpointInspection }
export function isAssemblyCircularPathMateInspection(inspection: AssemblyMateInspection): inspection is AssemblyCircularPathMateInspection { return inspection.mate.type === 'circular-path' }
export interface AssemblyHingeMateInspection extends AssemblyMateInspectionBase {
  mate: AssemblyHingeMate
  angular?: [AssemblyEndpointInspection, AssemblyEndpointInspection]
  axis: [AssemblyEndpointInspection, AssemblyEndpointInspection]
  axial: [AssemblyEndpointInspection, AssemblyEndpointInspection]
}
export function isAssemblyHingeMateInspection(inspection: AssemblyMateInspection): inspection is AssemblyHingeMateInspection { return inspection.mate.type === 'hinge' }
export type AssemblyMateInspection = AssemblyHingeMateInspection | AssemblyCircularPathMateInspection | AssemblyLinePathMateInspection | AssemblyBinaryMateInspection | AssemblyWidthMateInspection | AssemblySymmetryMateInspection | AssemblyProfileCenterMateInspection
export function isAssemblyProfileCenterMateInspection(inspection: AssemblyMateInspection): inspection is AssemblyProfileCenterMateInspection { return inspection.mate.type === 'profile-center' }
export function isAssemblySymmetryMateInspection(inspection: AssemblyMateInspection): inspection is AssemblySymmetryMateInspection { return inspection.mate.type === 'symmetry' }
export function isAssemblyBinaryMateInspection(inspection: AssemblyMateInspection): inspection is AssemblyBinaryMateInspection {
  switch (inspection.mate.type) {
    case 'hinge': case 'circular-path': case 'line-path': case 'profile-center': case 'symmetry': case 'width': return false
    case 'concentric': case 'coincident': case 'distance': case 'limit-distance': case 'limit-angle': case 'limit-directed-angle':
    case 'angle': case 'parallel': case 'perpendicular': case 'tangent': case 'skew-cylinder-tangent': case 'parallel-cylinder-tangent':
    case 'plane-sphere-tangent': case 'sphere-sphere-tangent': case 'cylinder-sphere-tangent': case 'lock': case 'gear': case 'screw': case 'rack-pinion': return true
    default: { const unsupported: never = inspection.mate; throw new Error('Unknown assembly inspection family: ' + unsupported) }
  }
}
export function isAssemblyWidthMateInspection(inspection: AssemblyMateInspection): inspection is AssemblyWidthMateInspection {
  return inspection.mate.type === 'width'
}

type Node = AssemblyDocument | EmbeddedAssemblyDefinition
type Endpoint = Omit<Extract<AssemblyGeometryReference, {kind:'edge'}>, 'support'> | AssemblyGeometryReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference | AssemblyComponentReference | AssemblyVertexReference
interface Scope {
  node: Node
  path: string[]
  pose: RigidPose
  chain: AssemblyOccurrence[]
  suppressed: boolean
  visible: boolean
}

/**
 * Inspect repairable declarations in every actual occurrence namespace. This
 * preserves stale endpoints and makes no nearest-face or same-name substitution.
 * Native current body/face identity, analytic support and solver residuals are
 * deliberately outside this pure document inspection boundary.
 */
export function inspectAssemblyMateReferences(input: AssemblyDocument): AssemblyMateInspection[] {
  const document = validateAssemblyDocument(input)
  const definitions = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  const result: AssemblyMateInspection[] = []

  function endpoint(scope: Scope, reference: Endpoint): AssemblyEndpointInspection {
    const component = 'occurrencePath' in reference ? reference : reference.component
    if (component === null) return { candidate: null, diagnostics: [] }
    const diagnostics: AssemblyReferenceDiagnostic[] = []
    const problem = (code: AssemblyReferenceProblem, path: string[]) => diagnostics.push({ code, path: [...path] })
    let node: AssemblyDefinition = scope.node, path = [...scope.path], pose = scope.pose
    let chain = [...scope.chain], suppressed = scope.suppressed, visible = scope.visible
    for (const id of component.occurrencePath) {
      if (node.kind !== 'assembly') {
        problem('PATH_THROUGH_PART', path)
        return { candidate: null, diagnostics }
      }
      const occurrence: AssemblyOccurrence | undefined = node.occurrences.find(value => value.id === id)
      path = [...path, id]
      if (!occurrence) {
        problem('MISSING_OCCURRENCE', path)
        return { candidate: null, diagnostics }
      }
      pose = composeRigidPoses(pose, occurrence.pose); chain = [...chain, occurrence]
      suppressed ||= occurrence.suppressed; visible &&= occurrence.visible
      // The validated definition graph guarantees this exact revision exists.
      node = definitions.get(assemblyDefinitionKey(occurrence.definition))!
    }
    const candidate = { path, definition: node, chain, worldPose: pose, suppressed, visible }
    if (assemblyDefinitionKey(node) !== assemblyDefinitionKey(component.definition)) problem('STALE_DEFINITION', path)
    if (suppressed) problem('SUPPRESSED_COMPONENT', path)
    // Do not reinterpret stale face IDs against a different part definition.
    if (diagnostics.some(value => value.code === 'STALE_DEFINITION') || !('kind' in reference) || reference.kind === 'principal-plane' || reference.kind === 'principal-axis') {
      return { candidate, diagnostics }
    }
    if (node.kind !== 'part') {
      problem(reference.kind === 'vertex' ? 'VERTEX_REQUIRES_PART' : reference.kind === 'edge' ? 'EDGE_REQUIRES_PART' : 'FACE_REQUIRES_PART', path)
      return { candidate, diagnostics }
    }
    const features = node.document.features
    const topology = reference.kind === 'vertex' ? reference.vertex : reference.kind === 'edge' ? reference.edge : reference.face
    const producer = features.find(value => value.id === topology.sourceFeatureId)
    if (!producer || producer.type === 'sketch' || producer.type === 'plane') problem(reference.kind === 'vertex' ? 'MISSING_VERTEX_PRODUCER' : reference.kind === 'edge' ? 'MISSING_EDGE_PRODUCER' : 'MISSING_FACE_PRODUCER', path)
    else if (producer.suppressed) problem(reference.kind === 'vertex' ? 'SUPPRESSED_VERTEX_PRODUCER' : reference.kind === 'edge' ? 'SUPPRESSED_EDGE_PRODUCER' : 'SUPPRESSED_FACE_PRODUCER', path)
    if (reference.body !== null) {
      if (!bodyReferenceCreationFeatureId(features, reference.body)) problem('MISSING_BODY_STATE', path)
      else if (features.find(value => value.id === reference.body!.sourceFeatureId)?.suppressed) problem('SUPPRESSED_BODY_PRODUCER', path)
      if (topology.sourceFeatureId !== reference.body.sourceFeatureId) problem(reference.kind === 'vertex' ? 'VERTEX_BODY_STATE_MISMATCH' : reference.kind === 'edge' ? 'EDGE_BODY_STATE_MISMATCH' : 'FACE_BODY_STATE_MISMATCH', path)
    }
    return { candidate, diagnostics }
  }

  function walk(scope: Scope): void {
    for (const mate of scope.node.mates) {
      const common = { scopePath: [...scope.path], scopePose: scope.pose, suppressed: scope.suppressed || mate.suppressed,
        nativeVerificationRequired: true as const }
      if (mate.type === 'line-path' || mate.type === 'circular-path') {
        const edge = endpoint(scope, { kind: 'edge', component: mate.path.component, body: mate.path.body, edge: mate.path.edge })
        const start = endpoint(scope, { kind: 'vertex', component: mate.path.component, body: mate.path.body, vertex: mate.path.startVertex, support: 'point' })
        const inspected = { ...common, point: endpoint(scope, mate.point), path: { candidate: edge.candidate, diagnostics: [...edge.diagnostics, ...start.diagnostics] },
          ...(mate.orientation.roll === 'free' ? {} : { up: endpoint(scope, mate.orientation.roll.guide) }) }
        if (mate.type === 'circular-path') result.push({ ...inspected, mate })
        else result.push({ ...inspected, mate })
      }
      else if (mate.type === 'profile-center') {
        const profile = (selection: AssemblyProfileCenterMate['first']): AssemblyEndpointInspection => {
          const face = endpoint(scope, { kind: 'face', ...selection.face, support: 'plane' })
          if (selection.axis === null) return face
          const edge = endpoint(scope, { kind: 'edge', component: selection.face.component, body: selection.face.body, edge: selection.axis.edge, support: 'line' })
          return { candidate: face.candidate, diagnostics: [...face.diagnostics, ...edge.diagnostics] }
        }
        result.push({ ...common, mate, first: profile(mate.first), second: profile(mate.second) })
      }
      else if (mate.type === 'symmetry') result.push({ ...common, mate, source: endpoint(scope, mate.source), target: endpoint(scope, mate.target), mirror: endpoint(scope, mate.mirror) })
      else if (mate.type === 'hinge') result.push({ ...common, mate,
        axis: [endpoint(scope, mate.axis[0]), endpoint(scope, mate.axis[1])],
        axial: [endpoint(scope, mate.axial[0]), endpoint(scope, mate.axial[1])],
        ...(mate.stops ? { angular: [endpoint(scope, mate.stops.angular[0]), endpoint(scope, mate.stops.angular[1])] as [AssemblyEndpointInspection, AssemblyEndpointInspection] } : {}) })
      else if (mate.type === 'width') result.push({ ...common, mate,
        width: [endpoint(scope, mate.width[0]), endpoint(scope, mate.width[1])],
        tab: [endpoint(scope, mate.tab[0]), endpoint(scope, mate.tab[1])] })
      else result.push({ ...common, mate, first: endpoint(scope, mate.first), second: endpoint(scope, mate.second),
        ...(mate.type === 'gear' ? { carrier: mate.carrier === null ? { candidate: null, diagnostics: [] } : endpoint(scope, mate.carrier) } : {}),
        ...(mate.type === 'limit-directed-angle' ? { guide: endpoint(scope, mate.guide) } : {}) })
    }
    for (const occurrence of scope.node.occurrences) {
      const definition = definitions.get(assemblyDefinitionKey(occurrence.definition))!
      if (definition.kind === 'assembly') walk({ node: definition, path: [...scope.path, occurrence.id],
        pose: composeRigidPoses(scope.pose, occurrence.pose), chain: [...scope.chain, occurrence],
        suppressed: scope.suppressed || occurrence.suppressed, visible: scope.visible && occurrence.visible })
    }
  }
  walk({ node: document, path: [], pose: identityRigidPose(), chain: [], suppressed: false, visible: true })
  return result
}
