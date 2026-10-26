import type { AssemblyNativeLimitedHingeMeasurement } from './kernel.assembly-hinge-limits-measure'
import type { AssemblyNativeHingeMeasurement } from './kernel.assembly-hinge'
export type AssemblyHingeSupportReport = Extract<AssemblyNativeHingeMeasurement, { status: 'ok' }> & { kind: 'hinge'; mateId: string; satisfied: true; stops?: Pick<Extract<AssemblyNativeLimitedHingeMeasurement, { status: 'ok' }>, 'coordinate' | 'arcDegrees' | 'angleRadians' | 'projectionLengths' | 'marginsRadians' | 'activity' | 'fullCircle' | 'directionErrorRad'> & { componentPaths: [string[], string[]] } }
import type { AssemblyAxisReference, AssemblyComponentReference, AssemblyDefinitionReference, AssemblyDocument, AssemblyFaceReference, AssemblyEdgeReference, AssemblyRackReference, AssemblyCylinderSurfaceReference, AssemblySphereSurfaceReference } from '../model/assemblyDocument'
import type { AssemblyTangentSide } from '../model/assemblyTangentMates'
import type { AssemblyCylinderTangentBranch } from '../model/assemblyCylinderTangentMates'
import type { AssemblySphereTangentBranch } from '../model/assemblySphereTangentMates'
import type { RigidPose } from '../model/rigidPose'
import type { BodyReference, FaceReference, FaceViewAxis, EdgeReference, VertexReference, Vec3 } from './kernel.types'
import type { AssemblyNativeFaceSupport, AssemblyNativeLineSupport } from './kernel.assembly-supports'
import type { AssemblyProjectionWitness, AssemblyMovementWitness, AssemblyMotionWitness, AssemblyTranslationWitness, AssemblyScopeSolveReport, AssemblySolveOptions, AssemblySolveRejection } from './kernel.assembly-solve'
import type { RigidMateEvaluation } from '../model/assemblySolveTypes'
import type { AssemblySymmetrySupportReport } from './kernel.assembly-symmetry'
import type { AssemblyProfileCenterReferenceRequest } from '../model/assemblyProfileCenterReferences'
import type { AssemblyLinePathMateRequest } from '../model/assemblyLinePathMate'
import type { evaluateAssemblyCircularPathReferences } from './kernel.assembly-circular-path-evaluation'

/** Fresh independent native measurement; a detached report grants no Apply authority. */
export type AssemblyCircularPathSupportReport = Extract<ReturnType<typeof evaluateAssemblyCircularPathReferences>, { status: 'ok' }> & {
  kind: 'circular-path'
  mateId: string
  scopePath: string[]
  satisfied: true
}

/** Fresh material-point/LINE checks; this DTO grants no Apply authority. */
export interface AssemblyLinePathSupportReport {
  kind: 'line-path'
  mateId: string
  scopePath: string[]
  componentPaths: { point: string[]; path: string[]; up?: string[] }
  position: AssemblyLinePathMateRequest['position']
  orientation: AssemblyLinePathMateRequest['orientation']
  curveLengthMm: number
  coordinateMm: number
  targetCoordinateMm: number | null
  transverseResidualMm: number
  coordinateResidualMm: number | null
  positionResidualMm: number
  orientationResidualRad: number | null
  rollResidualRad: number | null
  precision: {positionErrorMm:number;directionErrorRad:number;orientationErrorRad:number|null;rollErrorRad:number|null}
  angleTolerance: number
  lengthTolerance: number
  satisfied: true
  underlyingLine: true
  materialOrigin: true
  verificationOnly: true
}

/** Fresh bounded-profile physical checks; a detached report is not Apply authority. */
export interface AssemblyProfileCenterSupportReport {
  kind: 'profile-center'
  mateId: string
  scopePath: string[]
  componentPaths: { first: string[]; second: string[] }
  profileKinds: { first: 'circle' | 'rectangle'; second: 'circle' | 'rectangle' }
  alignment: 'aligned' | 'opposed'
  offsetMm: number
  orientation: AssemblyProfileCenterReferenceRequest['orientation']
  positionResidualMm: number
  normalAngleRadians: number
  rectangleAngleRadians: number | null
  lengthTolerance: number
  angleTolerance: number
  satisfied: true
  boundedProfiles: true
  verificationOnly: true
}

export interface AssemblySceneFace {
  /** Prototype-local saved identity plus complete occurrence scope; not proof. */
  selection: { component: AssemblyComponentReference; body: BodyReference | null; face: FaceReference }
  /** Actual native local support. Null means an unsupported analytic surface. */
  support: AssemblyNativeFaceSupport | null
  worldSupport: AssemblyNativeFaceSupport | null
  /** Presentation axes do not expand the solver's supported surface families. */
  viewAxis?: FaceViewAxis
  worldViewAxis?: FaceViewAxis
  /** Display intent only; deliberately separate from the older plane/axis union. */
  sphereSurface?: { kind: 'sphere-surface'; center: Vec3; radius: number; tolerance: number }
  worldSphereSurface?: { kind: 'sphere-surface'; center: Vec3; radius: number; tolerance: number }
  /** Rigidly transformed prototype face mesh, used only for triangle picking. */
  vertices: number[]
  triangles: number[]
}
export interface AssemblySceneEdge {
  selection: { component: AssemblyComponentReference; body: BodyReference | null; edge: EdgeReference }
  support: AssemblyNativeLineSupport | null
  worldSupport: AssemblyNativeLineSupport | null
  /** Detached exact native open-circle endpoint candidates, never an arc proof. */
  circularPathOrigins?: VertexReference[]
  /** WORLD coordinates; consecutive endpoint pairs from this exact edge's native mesh. */
  lines: number[]
}
/** Detached current material-vertex display metadata; no snapshot/Apply proof. */
export interface AssemblySceneVertex {
  selection: { component: AssemblyComponentReference; body: BodyReference | null; vertex: VertexReference }
  point: Vec3
  worldPoint: Vec3
  tolerance: number
}
export interface AssemblySceneBody {
  component: AssemblyComponentReference
  body: BodyReference | null
  name: string
  visible: boolean
  worldPose: RigidPose
  /** Mesh queried from the independently placed native BRep. */
  vertices: number[]
  normals: number[]
  triangles: number[]
  edgeLines: number[]
  faces: AssemblySceneFace[]
  /** Optional for older DTO stubs; actual native scene builds always populate this field. */
  edges?: AssemblySceneEdge[]
  vertexPoints?: AssemblySceneVertex[]
  volume: number
  area: number
  solidCount: number
  bounds: { min: Vec3; max: Vec3 }
}
export interface AssemblyScene {
  kind: 'assembly-scene'
  /** Display generation only. It is not native-reference or Apply authority. */
  sceneId: string
  bodies: AssemblySceneBody[]
  /** Sums over active occurrences without Fuse; hidden still contributes. */
  volume: number
  area: number
  solidCount: number
  prototypeCount: number
  bounds: { min: Vec3; max: Vec3 } | null
  visibleBounds: { min: Vec3; max: Vec3 } | null
  warnings: string[]
}
/** Fresh solved infinite-support evidence; never finite contact/interference proof. */
export interface AssemblyTangentSupportReport {
  scopePath: string[]
  mateId: string
  side: AssemblyTangentSide
  radialMaterialSense: 1 | -1
  normalRelation: 'same' | 'opposed'
  supportOnly: true
}
/** Fresh two-surface evidence; the parallel family adds an explicit axis restriction. */
export type AssemblyCylinderTangencySupportReport = {
  scopePath: string[]
  mateId: string
  branch: AssemblyCylinderTangentBranch
  radialMaterialSense: { first: 1 | -1; second: 1 | -1 }
  normalRelation: 'same' | 'opposed'
  supportOnly: true
} & ({ kind: 'skew-cylinder-tangent' } | { kind: 'parallel-cylinder-tangent' })
/** Complete analytic supports; no finite contact, containment or rolling is attested. */
export type AssemblySphericalTangencySupportReport = {
  scopePath: string[]
  mateId: string
  normalRelation: 'same' | 'opposed'
  supportOnly: true
} & (
  | { kind: 'plane-sphere-tangent'; side: AssemblyTangentSide; sphereRadialMaterialSense: 1 | -1 }
  | ({ branch: AssemblySphereTangentBranch; radialMaterialSense: { first: 1 | -1; second: 1 | -1 } }
      & ({ kind: 'sphere-sphere-tangent' } | { kind: 'cylinder-sphere-tangent' }))
)
/** Fresh signed plane coordinate; activity is not a bilateral constraint rank. */
export interface AssemblyLimitDistanceSupportReport {
  kind: 'limit-distance'
  scopePath: string[]
  mateId: string
  alignment: 'aligned' | 'opposed'
  limits: { minimum: number; maximum: number }
  coordinate: number
  activity: 'interior' | 'minimum' | 'maximum' | 'both'
  lengthTolerance: number
  supportOnly: true
}
/** Fresh principal directions only; activity is proximity, never bilateral rank. */
export interface AssemblyLimitAngleSupportReport {
  kind: 'limit-angle'
  coordinate: 'principal-direction'
  scopePath: string[]
  mateId: string
  angleDegrees: number
  limitsDegrees: { minimum: number; maximum: number }
  angleToleranceRadians: number
  activity: 'interior' | 'minimum' | 'maximum' | 'both'
  stratum: 'regular' | 'parallel' | 'antiparallel'
  domainBounds: { minimum: boolean; maximum: boolean }
  firstKind: 'plane' | 'cylinder' | 'line'
  secondKind: 'plane' | 'cylinder' | 'line'
  firstDirection: Vec3
  secondDirection: Vec3
  supportOnly: true
}
/** Three freshly resolved directions; circular bounds do not attest winding. */
export interface AssemblyLimitDirectedAngleSupportReport {
  kind: 'limit-directed-angle'
  coordinate: 'directed-about-axis'
  scopePath: string[]
  mateId: string
  angleDegrees: number
  arcDegrees: { start: number; sweep: number }
  marginsRadians: { minimum: number; maximum: number }
  angleToleranceRadians: number
  activity: 'interior' | 'minimum' | 'maximum' | 'both'
  fullCircle: boolean
  firstKind: 'plane' | 'cylinder' | 'line'
  secondKind: 'plane' | 'cylinder' | 'line'
  guideKind: 'plane' | 'cylinder' | 'line'
  firstDirection: Vec3
  secondDirection: Vec3
  guideDirection: Vec3
  projectionLengths: { first: number; second: number }
  supportOnly: true
}
export interface AssemblyWidthCenteredSupportReport {
  kind: 'width'
  mode: 'centered'
  scopePath: string[]
  mateId: string
  widthBranch: 'sum' | 'difference'
  tabBranch: 'sum' | 'difference'
  alignment: 'aligned' | 'opposed'
  angleRadians: number
  offsetMm: number
  lengthTolerance: number
  angleTolerance: number
  branchLengths: { width: number; tab: number }
  supportOnly: true
}
export type AssemblyPreviewReply =
  | { kind: 'assembly-preview'; status: 'ready'; token: string; document: AssemblyDocument;
      scene: AssemblyScene; scopes: AssemblyScopeSolveReport[]; checks: RigidMateEvaluation['checks']; tangencies?: AssemblyTangentSupportReport[]; cylinderTangencies?: AssemblyCylinderTangencySupportReport[]; sphericalTangencies?: AssemblySphericalTangencySupportReport[]; limitDistances?: AssemblyLimitDistanceSupportReport[]; limitAngles?: AssemblyLimitAngleSupportReport[]; limitDirectedAngles?: AssemblyLimitDirectedAngleSupportReport[]; widthCentered?: AssemblyWidthCenteredSupportReport[]; symmetries?: AssemblySymmetrySupportReport[]; profileCenters?: AssemblyProfileCenterSupportReport[]; linePaths?: AssemblyLinePathSupportReport[]; circularPaths?: AssemblyCircularPathSupportReport[]; hinges?: AssemblyHingeSupportReport[]; movement?: AssemblyMovementWitness; motion?: AssemblyMotionWitness; projection?: AssemblyProjectionWitness; translation?: AssemblyTranslationWitness }
  | ({ kind: 'assembly-preview' } & AssemblySolveRejection)
export interface AssemblyAppliedReply { kind: 'assembly-applied'; document: AssemblyDocument; scene: AssemblyScene }
/** Intent only; the worker captures neutral orientations and lifted state. */
export interface AssemblyGearCaptureRequest {
  first: AssemblyAxisReference
  second: AssemblyAxisReference
  carrier: AssemblyComponentReference | null
  ratio: { numerator: number; denominator: number }
  direction: 'same' | 'opposed'
  name: string
  /** Weighted angular equation target in radians; defaults to zero. */
  phase?: number
}
/** Intent only; relative zero, axial origin and winding are captured natively. */
export interface AssemblyScrewCaptureRequest {
  first: AssemblyAxisReference
  second: AssemblyAxisReference
  lead: number
  reverse: boolean
  alignment: 'aligned' | 'opposed'
  name: string
}
export interface AssemblyRackPinionCaptureRequest {
  first: AssemblyAxisReference
  second: AssemblyRackReference
  conversion: { mode: 'diameter' | 'travel'; override: number | null }
  reverse: boolean
  name: string
}
/** Independent read-only operation, outside the stateful solve-session union. */
export interface AssemblyDirectedAngleKernelRequest {
  id: number
  action: 'measure-assembly-directed-angle'
  current: AssemblyDocument
  request: import('../model/assemblyDirectedAngle').AssemblyDirectedAngleRequest
}
export type AssemblyKernelRequest =
  | { id: number; action: 'build-assembly'; document: AssemblyDocument }
  | { id: number; action: 'inspect-assembly-interferences'; current: AssemblyDocument;
      options?: Partial<import('../model/assemblyInterference').AssemblyInterferenceOptions> }
  | { id: number; action: 'review-assembly-part-update'; current: AssemblyDocument; source: AssemblyDefinitionReference;
      part: import('../model/document').Document; revision: string; sourceLink?: import('../model/assemblyDocument').AssemblySourceLink }
  | { id: number; action: 'preview-assembly-part-update'; current: AssemblyDocument; reviewId: string; proposed: AssemblyDocument }
  | { id: number; action: 'discard-assembly-part-update'; reviewId?: string }
  | { id: number; action: 'review-assembly-part-replacement'; current: AssemblyDocument;
      request: import('../model/assemblyReplacement').AssemblyPartReplacementRequest }
  | { id: number; action: 'preview-assembly-part-replacement'; current: AssemblyDocument; reviewId: string;
      decisions: import('./kernel.assembly-replacement').AssemblyReplacementDecisions }
  | { id: number; action: 'discard-assembly-part-replacement'; reviewId?: string }
  | { id: number; action: 'review-assembly-document-update'; current: AssemblyDocument; source: AssemblyDefinitionReference; incoming: AssemblyDocument; sourceLink?: import('../model/assemblyDocument').AssemblySourceLink }
  | { id: number; action: 'preview-assembly-document-update'; current: AssemblyDocument; reviewId: string;
      decisions: import('./kernel.assembly-document-update-types').AssemblyDocumentUpdateDecisions }
  | { id: number; action: 'discard-assembly-document-update'; reviewId?: string }
  | { id: number; action: 'preview-assembly'; current: AssemblyDocument; proposed: AssemblyDocument; options?: AssemblySolveOptions }
  | { id: number; action: 'preview-assembly-root-revision'; current: AssemblyDocument; revision: string }
  | { id: number; action: 'move-assembly-component'; current: AssemblyDocument;
      move: import('../model/assemblyMovement').AssemblyComponentMove; options?: AssemblySolveOptions }
  | { id: number; action: 'move-assembly-component-motion'; current: AssemblyDocument;
      motion: import('../model/assemblyMotion').AssemblyComponentMotion; options?: AssemblySolveOptions }
  | { id: number; action: 'move-assembly-world-component'; current: AssemblyDocument;
      move: import('../model/assemblyDrag').AssemblyWorldComponentMove; options?: AssemblySolveOptions }
  | { id: number; action: 'project-assembly-component'; current: AssemblyDocument;
      drag: import('../model/assemblyProjectionIntent').AssemblyComponentDrag; options?: AssemblySolveOptions }
  | { id: number; action: 'translate-assembly-until-contact'; current: AssemblyDocument;
      translation: import('../model/assemblyTranslation').AssemblyTranslationRequest;
      stopOptions?: Partial<import('../model/assemblyTranslation').AssemblyTranslationStopOptions>; options?: AssemblySolveOptions }
  | { id: number; action: 'apply-assembly'; current: AssemblyDocument; token: string }
  | { id: number; action: 'discard-assembly'; token?: string }
  | { id: number; action: 'lock-assembly-rotation'; current: AssemblyDocument; token: string; mateId: string; scope?: AssemblyDefinitionReference }
  | { id: number; action: 'lock-assembly-components'; current: AssemblyDocument; token: string;
      first: AssemblyComponentReference; second: AssemblyComponentReference; scope?: AssemblyDefinitionReference }
  | { id: number; action: 'capture-assembly-gear'; current: AssemblyDocument; token: string;
      request: AssemblyGearCaptureRequest; scope?: AssemblyDefinitionReference }
  | { id: number; action: 'capture-assembly-screw'; current: AssemblyDocument; token: string;
      request: AssemblyScrewCaptureRequest; scope?: AssemblyDefinitionReference }
  | { id: number; action: 'capture-assembly-rack-pinion'; current: AssemblyDocument; token: string;
      request: AssemblyRackPinionCaptureRequest; scope?: AssemblyDefinitionReference }

/** Construct a saved endpoint only for a supported current scene selection. */
export function assemblySceneFaceReference(face: AssemblySceneFace): AssemblyFaceReference | null {
  return face.support ? { kind: 'face', ...structuredClone(face.selection), support: face.support.kind === 'plane' ? 'plane' : 'axis' } : null
}
/** Explicit new surface intent from a picker face; no material sense or proof is copied. */
export function assemblySceneCylinderSurfaceReference(face: AssemblySceneFace): AssemblyCylinderSurfaceReference | null {
  return face.support?.kind === 'cylinder' ? { kind: 'face', ...structuredClone(face.selection), support: 'cylinder-surface' } : null
}
export function assemblySceneSphereSurfaceReference(face: AssemblySceneFace): AssemblySphereSurfaceReference | null {
  return face.sphereSurface?.kind === 'sphere-surface' ? { kind: 'face', ...structuredClone(face.selection), support: 'sphere-surface' } : null
}
export function assemblySceneEdgeReference(edge: AssemblySceneEdge): AssemblyEdgeReference | null {
  return edge.support?.kind === 'line' ? { kind: 'edge', ...structuredClone(edge.selection), support: 'line' } : null
}
