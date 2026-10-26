import { measureAssemblyLimitedHingeReferences } from './kernel.assembly-hinge-limits-measure'
import { measureAssemblyHingeReferences } from './kernel.assembly-hinge'
import { copyRigidHingeConstraint } from '../model/assemblyHingeNumeric'
import { coordinateAssemblyLinePathPosition, assemblyLinePathFollowAxis, assemblyLinePathRollAxis, validateAssemblyLinePathOrientation } from '../model/assemblyLinePathMate'
import { evaluateAssemblyCircularPathReferences } from './kernel.assembly-circular-path-evaluation'
import { savedAssemblyCircularPathConstraint } from './kernel.assembly-circular-path-adapter'
import { evaluateAssemblyLinePathReferences } from './kernel.assembly-line-path-evaluation'
import { AssemblyGeometrySnapshot, withAssemblyGeometryReuse, type AssemblySnapshotRunner, isResolvedAssemblyHingeMate, assemblyLinePathPlacementArithmetic, isResolvedAssemblyLinePathMate, isResolvedAssemblyCircularPathMate, type AssemblyLinePathWitness, assemblyEndpointPlacementArithmetic, assemblyPointPlacementArithmetic, assemblyProfilePlacementArithmetic, assemblyProfileAxisPlacementArithmetic, isResolvedAssemblyProfileCenterMate, isResolvedAssemblyWidthMate, isResolvedAssemblySymmetryMate, isResolvedAssemblyBinaryMate, resolvedAssemblyMateWitnesses, type AssemblyEndpointWitness, type AssemblyMateWitness, type AssemblyProfileMateWitness, type AssemblyResolvedMateWitness, type AssemblyReadonly,
  type ResolvedAssemblyMate, type ResolvedAssemblyBinaryMate, type ResolvedAssemblyWidthMate, type UnavailableAssemblyGear, type UnavailableAssemblyScrew, type UnavailableAssemblyRackPinion } from './kernel.assembly-snapshot'
import { evaluateRigidMates } from '../model/assemblyMateEquations'
import { solveRigidMates, type RigidMateSolveResult, type RigidMateSolverOptions } from '../model/assemblySolver'
import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyDefinitionReference,
  type AssemblyComponentReference, type AssemblyDocument, type AssemblyMate, type AssemblyBinaryMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { planAssemblyComponentMove, type AssemblyComponentMove, type AssemblyComponentMovePlan } from '../model/assemblyMovement'
import { planAssemblyWorldComponentMove, prepareAssemblyDragFrame, type AssemblyWorldComponentMove,
  type AssemblyWorldComponentMovePlan } from '../model/assemblyDrag'
import { validateAssemblyComponentDrag, type AssemblyComponentDrag } from '../model/assemblyProjectionIntent'
import { projectRigidMateTarget, type RigidMateProjectionOptions, type RigidMateProjectionEvidence,
  type RigidMateProjectionResult } from '../model/assemblyProjection'
import { composeRigidPoses, identityRigidPose, inverseRigidPose, transformRigidPoint, transformRigidDirection, validateRigidPose, type RigidPose } from '../model/rigidPose'
import type { RigidMateConstraint, RigidMateEndpoint, RigidProfileCenterEndpoint, RigidLinePathEndpoint, RigidMateEvaluation, RigidMateProblem, RigidMateSupport, RigidSymmetrySupportUncertainty } from '../model/assemblySolveTypes'
import type { Vec3 } from './kernel.types'
import { withNativeOwners } from './kernel.native-ownership'
import { prepareAssemblyTranslationPath, validateAssemblyTranslationRequest, validateAssemblyTranslationStopOptions,
  type AssemblyTranslationRequest, type AssemblyTranslationStopOptions } from '../model/assemblyTranslation'
import { traceAssemblyTranslation, type AssemblyTranslationTrace } from './kernel.assembly-translation'
import type { AssemblyGearCaptureRequest, AssemblyScrewCaptureRequest, AssemblyRackPinionCaptureRequest, AssemblyTangentSupportReport, AssemblyCylinderTangencySupportReport, AssemblySphericalTangencySupportReport, AssemblyLimitDistanceSupportReport, AssemblyLimitAngleSupportReport, AssemblyLimitDirectedAngleSupportReport, AssemblyWidthCenteredSupportReport, AssemblyProfileCenterSupportReport, AssemblyLinePathSupportReport, AssemblyCircularPathSupportReport, AssemblyHingeSupportReport } from './kernel.assembly-types'
import { measureAssemblyDirectedAngleWitnesses } from './kernel.assembly-angle-measurement'
import { evaluateAssemblyDirectedAngleArc } from '../model/assemblyLimitDirectedAngle'
import { admitRigidGearStep, deriveRigidGearAngles, rebaseRigidGearAngles } from '../model/assemblyGear'
import { admitRigidScrewStep, deriveRigidScrewAngles, rebaseRigidScrewAngles, rigidScrewCoordinates, rigidScrewTwist, validateAssemblyScrewData } from '../model/assemblyScrew'
import { admitRigidRackPinionStep, deriveRigidRackPinionAngles, rebaseRigidRackPinionAngles, rigidRackPinionTwist,
  rigidRackPinionCoordinates, validateAssemblyRackPinionData, canonicalAssemblyRackDirection, assemblyRackPinionAxisPoint } from '../model/assemblyRackPinion'
import { rotationExp, rotationLog } from '../model/assemblyKinematics'
import { measureAssemblyComponentMotionAngle, planAssemblyComponentMotion, type AssemblyComponentMotion } from '../model/assemblyMotion'
import { assemblyTangentAxisPoint, assemblyTangentPlanePoint, assemblyTangentSupportNormalRelation } from '../model/assemblyTangentMates'
import { assemblyCylinderTangentSupportNormalRelation } from '../model/assemblyCylinderTangentMates'
import { assemblySphereTangentSupportNormalRelation, assemblyPlaneSphereTangentSupportNormalRelation } from '../model/assemblySphereTangentMates'
import { measureAssemblyWidthWitnesses } from './kernel.assembly-width'
import { measureAssemblySymmetryReferences, type AssemblySymmetrySupportReport } from './kernel.assembly-symmetry'
import { evaluateAssemblyProfileCenterReferences } from './kernel.assembly-profile-center-evaluation'

export interface AssemblySolveOptions {
  /** Millimeters; native face tolerances can increase individual checks. */
  lengthTolerance?: number
  /** Radians, independent of the saved angle target in degrees. */
  angleTolerance?: number
  solver?: RigidMateSolverOptions
  projection?: Omit<RigidMateProjectionOptions, 'solver'>
}
type Node = AssemblyDocument | EmbeddedAssemblyDefinition
export interface AssemblyScopeSolveReport {
  definition: AssemblyDefinitionReference
  /** Top-level rigid occurrences only. Child internal mobility is separate. */
  result: Omit<RigidMateSolveResult, 'poses' | 'gearAngles' | 'screwAngles' | 'rackPinionAngles'>
  /** Rank and mobility in this report include this temporary driven anchor. */
  temporaryAnchor?: { occurrenceId: string }
}
export interface AssemblyMovementWitness {
  frame: 'local' | 'world'
  component: AssemblyComponentReference
  drivenComponent: AssemblyComponentReference
  scope: AssemblyDefinitionReference
  targetPose: RigidPose
  resolvedPose: RigidPose
  affectedPaths: string[][]
  lengthResidual: number
  angleResidual: number
  lengthTolerance: number
  angleTolerance: number
  temporaryAnchor: true
}
/** Actual driver winding measured at bounded, native-verified stations. */
export interface AssemblyMotionWitness extends AssemblyMovementWitness {
  frame: 'local'
  axis: 0 | 1 | 2
  requestedAngle: number
  evaluatedAngle: number
  windingResidual: number
  windingTolerance: number
  stationCount: number
  verifiedStations: number
  /** Nominal admission step, independent of numerical solver step budgets. */
  maxAngularStep: number
  sampledOnly: true
}
export interface AssemblyProjectionWitness {
  frame: 'world'
  component: AssemblyComponentReference
  drivenComponent: AssemblyComponentReference
  scope: AssemblyDefinitionReference
  mode: AssemblyComponentDrag['mode']
  requestedPose: RigidPose
  resolvedPose: RigidPose
  affectedPaths: string[][]
  positionResidual: number
  angleResidual: number
  lengthTolerance: number
  angleTolerance: number
  evidence: RigidMateProjectionEvidence
  temporaryAnchor: false
}
export interface AssemblyTranslationWitness {
  component: AssemblyComponentReference
  drivenComponent: AssemblyComponentReference
  requestedPose: RigidPose
  resolvedPose: RigidPose
  clearance: number
  lengthTolerance: number
  trace: AssemblyTranslationTrace
}
export interface AssemblySolvePreview {
  readonly status: 'ready'
  readonly document: AssemblyReadonly<AssemblyDocument>
  readonly scopes: AssemblyReadonly<AssemblyScopeSolveReport[]>
  readonly checks: AssemblyReadonly<RigidMateEvaluation['checks']>
  readonly tangencies?: AssemblyReadonly<AssemblyTangentSupportReport[]>
  readonly cylinderTangencies?: AssemblyReadonly<AssemblyCylinderTangencySupportReport[]>
  readonly sphericalTangencies?: AssemblyReadonly<AssemblySphericalTangencySupportReport[]>
  readonly limitDistances?: AssemblyReadonly<AssemblyLimitDistanceSupportReport[]>
  readonly limitAngles?: AssemblyReadonly<AssemblyLimitAngleSupportReport[]>
  readonly limitDirectedAngles?: AssemblyReadonly<AssemblyLimitDirectedAngleSupportReport[]>
  readonly widthCentered?: AssemblyReadonly<AssemblyWidthCenteredSupportReport[]>
  readonly symmetries?: AssemblyReadonly<AssemblySymmetrySupportReport[]>
  readonly profileCenters?: AssemblyReadonly<AssemblyProfileCenterSupportReport[]>
  readonly linePaths?: AssemblyReadonly<AssemblyLinePathSupportReport[]>
  readonly hinges?: AssemblyReadonly<AssemblyHingeSupportReport[]>
  readonly circularPaths?: AssemblyReadonly<AssemblyCircularPathSupportReport[]>
  readonly movement?: AssemblyReadonly<AssemblyMovementWitness>
  readonly motion?: AssemblyReadonly<AssemblyMotionWitness>
  readonly projection?: AssemblyReadonly<AssemblyProjectionWitness>
  readonly translation?: AssemblyReadonly<AssemblyTranslationWitness>
}
export interface AssemblySolveRejection {
  status: 'rejected'
  reason: 'reference' | 'numeric' | 'verification' | 'precisionLimit'
  message: string
  scopes: AssemblyScopeSolveReport[]
}
interface PreviewAuthority { source: string; candidate: AssemblyDocument; options: AssemblySolveOptions }
// Object identity is a local capability. JSON, a frozen clone or a revision
// label cannot authenticate Apply. Worker transport needs its own registry.
const previews = new WeakMap<AssemblySolvePreview, PreviewAuthority>()
function freeze<T>(value: T): AssemblyReadonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value)
  }
  return value as AssemblyReadonly<T>
}
const key = assemblyDefinitionKey
function withSnapshot<T>(document: AssemblyDocument, operation: (snapshot: AssemblyGeometrySnapshot) => T, snapshots?: AssemblySnapshotRunner): T {
  if (snapshots) return snapshots(document, operation)
  return withNativeOwners(owners => {
    const snapshot = new AssemblyGeometrySnapshot(document)
    owners.own({ delete: () => snapshot.dispose() })
    return operation(snapshot)
  }, undefined, 'Assembly solve reference or release failed.')
}
function node(document: AssemblyDocument, reference: AssemblyDefinitionReference): Node {
  const value = [document, ...document.definitions].find(item => key(item) === key(reference))
  if (!value || value.kind !== 'assembly') throw new Error('El ámbito de ensamblaje ya no existe.')
  return value
}
function scopedDocument(document: AssemblyDocument, scope: AssemblyDefinitionReference): AssemblyDocument {
  const target = node(document, scope)
  if (target === document) return validateAssemblyDocument(document)
  const { version: _version, units: _units, definitions: _definitions, ...root } = document
  // A scoped solve promotes the embedded node to a temporary root. Its saved
  // file-link descriptor remains on the original embedded cache, never a root.
  const { sourceLink: _sourceLink, ...scoped } = target as EmbeddedAssemblyDefinition
  return validateAssemblyDocument({ ...scoped, version: 2, units: 'mm',
    definitions: [...document.definitions.filter(item => key(item) !== key(target)), root] })
}
/** Active unique declarations, children before parents. Suppressed sources stay saved. */
function solveOrder(document: AssemblyDocument): AssemblyDefinitionReference[] {
  const table = new Map([document, ...document.definitions].map(item => [key(item), item]))
  const seen = new Set<string>(), order: AssemblyDefinitionReference[] = []
  function visit(value: Node): void {
    if (seen.has(key(value))) return
    seen.add(key(value))
    for (const occurrence of value.occurrences) if (!occurrence.suppressed) {
      const child = table.get(key(occurrence.definition))!
      if (child.kind === 'assembly') visit(child)
    }
    order.push({ id: value.id, revision: value.revision })
  }
  visit(document); return order
}
function poseCopy(value: AssemblyReadonly<RigidPose>): RigidPose { return validateRigidPose(value) }
function supportCopy(witness: AssemblyMateWitness): RigidMateSupport {
  if (witness.kind === 'point') return { kind: 'point', point: [...witness.localSupport.point], tolerance: witness.localSupport.tolerance }
  if (witness.kind === 'sphere-surface') return { kind: 'sphere', point: [...witness.localSupport.center],
    radius: witness.localSupport.radius, tolerance: witness.localSupport.tolerance }
  if (witness.kind !== 'support' && witness.kind !== 'cylinder-surface') throw new Error('La referencia no tiene soporte analítico.')
  const value = witness.localSupport, base = { point: [...value.point] as Vec3, tolerance: value.tolerance }
  if (value.kind === 'cylinder-surface') return { ...base, kind: 'cylinder', axis: [...value.axis], xDirection: [...value.xDirection], radius: value.radius }
  if (value.kind === 'line') return { ...base, kind: 'line', axis: [...value.axis] }
  const common = { ...base, xDirection: [...value.xDirection] as Vec3 }
  return value.kind === 'plane' ? { ...common, kind: 'plane', normal: [...value.normal] }
    : { ...common, kind: 'cylinder', axis: [...value.axis], radius: value.radius }
}
function endpointFrame(scope: AssemblyDocument, witness: Pick<AssemblyEndpointWitness, 'componentPath' | 'declaredWorldPose'>): Pick<RigidMateEndpoint, 'bodyId' | 'frame'> {
  const id = witness.componentPath[0] ?? null
  const owner = id === null ? null : scope.occurrences.find(item => item.id === id)
  if (id !== null && !owner) throw new Error('La referencia no pertenece a una ocurrencia rígida actual.')
  return { bodyId: id, frame: owner
    ? composeRigidPoses(inverseRigidPose(owner.pose), poseCopy(witness.declaredWorldPose))
    : poseCopy(witness.declaredWorldPose) }
}
function endpoint(scope: AssemblyDocument, witness: AssemblyMateWitness): RigidMateEndpoint {
  return { ...endpointFrame(scope, witness), ...(witness.kind !== 'component' ? { support: supportCopy(witness) } : {}) }
}
function nativeProfileInput(witness: AssemblyProfileMateWitness, document: AssemblyDocument): RigidProfileCenterEndpoint['profile'] {
  const local = witness.kind === 'profile-axis' ? witness.localSupport.profile : witness.localSupport
  const arithmetic = witness.kind === 'profile-axis' ? assemblyProfileAxisPlacementArithmetic(witness, document) : assemblyProfilePlacementArithmetic(witness, document)
  const round = 128 * Number.EPSILON * (arithmetic.depth + 1)
  const common = { center: [...local.center] as Vec3, normal: [...local.normal] as Vec3,
    positionErrorMm: local.uncertainty.positionErrorMm + round * (arithmetic.placementSum + Math.hypot(...local.center)),
    normalErrorRad: local.uncertainty.normalErrorRad + round }
  if (![common.positionErrorMm, common.normalErrorRad].every(Number.isFinite)) throw new RangeError('La cadena original del perfil excede la precisión finita.')
  if (witness.kind === 'profile-axis') {
    const xDirectionErrorRad = witness.localSupport.xDirectionErrorRad + round
    if (!Number.isFinite(xDirectionErrorRad)) throw new RangeError('El eje material excede la precisión finita.')
    return { ...common, kind: 'rectangle', xDirection: [...witness.localSupport.xDirection], xDirectionErrorRad }
  }
  if (local.kind !== 'circle') throw new Error('El rectángulo necesita un eje material nativo explícito.')
  return { ...common, kind: 'circle' }
}
function profileEndpoint(scope: AssemblyDocument, witness: AssemblyProfileMateWitness, fixed = false): RigidProfileCenterEndpoint {
  return { ...(fixed ? { bodyId: null, frame: poseCopy(witness.declaredWorldPose) } : endpointFrame(scope, witness)),
    profile: nativeProfileInput(witness, scope) }
}
function linePathEndpoint(scope: AssemblyDocument, witness: AssemblyLinePathWitness, fixed = false): RigidLinePathEndpoint {
  const local=witness.localCurve, budget=assemblyLinePathPlacementArithmetic(witness,scope), round=128*Number.EPSILON*(budget.depth+1)
  const positionErrorMm=local.precision.positionMm+round*(budget.placementSum+Math.hypot(...local.startPoint)), directionErrorRad=local.precision.tangentRad+round
  if(!Number.isFinite(positionErrorMm)||!Number.isFinite(directionErrorRad))throw new RangeError('La cadena material de LINE excede la precisión finita.')
  return {...(fixed?{bodyId:null,frame:poseCopy(witness.declaredWorldPose)}:endpointFrame(scope,witness)),line:{start:[...local.startPoint],direction:local.increasingDirection.map(v=>v*local.sense) as Vec3,lengthMm:local.lengthMm,positionErrorMm,directionErrorRad,lengthErrorMm:local.precision.lengthMm}}
}
function unsupportedMateConstraint(_mate: never): never {
  throw new Error('Unknown assembly mate constraint family.')
}
function constraint(mate: AssemblyReadonly<AssemblyBinaryMate>, id: string, first: RigidMateEndpoint, second: RigidMateEndpoint,
  carrier?: RigidMateEndpoint, guide?: RigidMateEndpoint): RigidMateConstraint {
  const common = { id, first, second }
  switch (mate.type) {
    case 'limit-directed-angle': {
      if (!guide || [first, second, guide].some(value => !value.support || value.support.kind === 'sphere')) {
        throw new Error('El tope circular necesita dos direcciones y un eje guía nativos verificados.')
      }
      return { ...common, type: 'limit-directed-angle', coordinate: mate.coordinate, guide, arc: { ...mate.arc } }
    }
    case 'limit-angle': {
      if (!first.support || first.support.kind === 'sphere' || !second.support || second.support.kind === 'sphere') {
        throw new Error('El límite angular necesita dos direcciones nativas verificadas.');
      }
      return { ...common, type: 'limit-angle', coordinate: mate.coordinate, limits: { ...mate.limits } }
    }
    case 'limit-distance': {
      if (first.support?.kind !== 'plane' || second.support?.kind !== 'plane') throw new Error('El límite de distancia necesita dos planos verificados.')
      return { ...common, type: 'limit-distance', alignment: mate.alignment, limits: { ...mate.limits } }
    }
    case 'plane-sphere-tangent': return { ...common, type: mate.type, side: mate.side }
    case 'sphere-sphere-tangent': case 'cylinder-sphere-tangent': return { ...common, type: mate.type, branch: { ...mate.branch } }
    case 'skew-cylinder-tangent': case 'parallel-cylinder-tangent': return { ...common, type: mate.type, branch: { ...mate.branch } }
    case 'tangent': return { ...common, type: 'tangent', side: mate.side }
    case 'rack-pinion': return { ...common, type: 'rack-pinion', conversion: { ...mate.conversion }, reverse: mate.reverse,
      neutralRotation: [...mate.neutralRotation], angle: mate.angle, neutralTravel: mate.neutralTravel }
    case 'screw': return { ...common, type: 'screw', lead: mate.lead, reverse: mate.reverse, alignment: mate.alignment,
      neutralRotation: [...mate.neutralRotation], angle: mate.angle, neutralTravel: mate.neutralTravel }
    case 'gear': return { ...common, type: 'gear', carrier: carrier ?? null,
      ratio: { ...mate.ratio }, direction: mate.direction,
      neutralRotations: { first: [...mate.neutralRotations.first], second: [...mate.neutralRotations.second] },
      angles: { ...mate.angles }, phase: mate.phase }
    case 'lock': return { ...common, type: 'lock', relativePose: poseCopy(mate.relativePose) }
    case 'angle': return { ...common, type: 'angle', angle: mate.angle }
    case 'parallel': case 'perpendicular': return { ...common, type: mate.type, alignment: mate.alignment }
    case 'concentric': return { ...common, type: 'concentric', alignment: mate.alignment,
      rotationLock: mate.rotationLock ? [...mate.rotationLock] : null }
    case 'distance': return { ...common, type: 'distance', alignment: mate.alignment, distance: mate.distance }
    case 'coincident': return { ...common, type: 'coincident', alignment: mate.alignment }
    default: return unsupportedMateConstraint(mate)
  }
}
function nativeSymmetryUncertainty(witness: AssemblyMateWitness, document: AssemblyDocument, purpose?: RigidMateSupport['kind']): RigidSymmetrySupportUncertainty {
  const support = supportCopy(witness), arithmetic = witness.kind === 'point'
    ? assemblyPointPlacementArithmetic(witness, document) : assemblyEndpointPlacementArithmetic(witness, document)
  const round = 128 * Number.EPSILON * (arithmetic.depth + 1)
  const positionErrorMm = support.tolerance + round * arithmetic.placementSum + round * Math.hypot(...support.point)
  if (!Number.isFinite(positionErrorMm)) throw new RangeError('La cadena original de simetría excede la precisión finita.')
  return { positionErrorMm, ...(support.kind === 'point' || support.kind === 'sphere' ? {} : { directionErrorRad: round }),
    ...((purpose === undefined || purpose === 'sphere' || purpose === 'cylinder') && (support.kind === 'sphere' || support.kind === 'cylinder') ? { radiusErrorMm: support.tolerance + round * support.radius } : {}) }
}
function resolvedConstraint(item: ResolvedAssemblyMate, id: string, project: (witness: AssemblyMateWitness) => RigidMateEndpoint, document: AssemblyDocument,
  projectProfile: (witness: AssemblyProfileMateWitness) => RigidProfileCenterEndpoint,
  projectPath: (witness: AssemblyLinePathWitness) => RigidLinePathEndpoint, fixedCircular = false): RigidMateConstraint {
  if (isResolvedAssemblyHingeMate(item)) return copyRigidHingeConstraint({ id, type: 'hinge', axis: item.axis.map(project), axial: item.axial.map(project), alignment: item.mate.alignment,
    uncertainty: [...item.axis, ...item.axial].map(w => { const e = nativeSymmetryUncertainty(w, document); return { positionErrorMm: e.positionErrorMm, directionErrorRad: e.directionErrorRad ?? 0 } }),
    ...(item.limited ? { stops: { coordinate: item.limited.stops.coordinate, angular: item.limited.stops.angular.map(project), arc: { ...item.limited.stops.arc }, uncertainty: item.limited.stops.angular.map(w => { const e = nativeSymmetryUncertainty(w, document); return { positionErrorMm: e.positionErrorMm, directionErrorRad: e.directionErrorRad ?? 0 } }) } } : {}) })
  if (isResolvedAssemblyCircularPathMate(item)) return savedAssemblyCircularPathConstraint(document, item, id, fixedCircular)
  if(isResolvedAssemblyLinePathMate(item)){
    const orientation=validateAssemblyLinePathOrientation(item.mate.orientation)
    const first=project(item.first),second=projectPath(item.second),error=nativeSymmetryUncertainty(item.first,document,'point');
    if(first.support?.kind!=='point')throw Error('LINE path requires native material point.');
    first.support={...first.support,tolerance:error.positionErrorMm};
    const coordinateMm=coordinateAssemblyLinePathPosition(item.mate.position,second.line.lengthMm);
    const position=item.mate.position;
    const lengthCoefficient=position.mode==='free'?0:position.mode==='distance'?(position.reverse?1:0):Math.abs(position.reverse?1-position.percent/100:position.percent/100);
    second.line.positionErrorMm+=lengthCoefficient*second.line.lengthErrorMm;
    const axis=assemblyLinePathFollowAxis(orientation)
    const pointBudget=axis===null?null:assemblyPointPlacementArithmetic(item.first,document)
    const follow=axis===null?undefined:{axis,reverse:typeof orientation.pitchYaw==='object'&&orientation.pitchYaw.reverse,directionErrorRad:128*Number.EPSILON*(pointBudget!.depth+1)}
    const rollAxis=assemblyLinePathRollAxis(orientation)
    let roll: Extract<RigidMateConstraint,{type:'line-path'}>['roll']
    if(rollAxis){
      if(!item.up||typeof orientation.roll!=='object')throw Error('Missing current UP native proof.')
      const guide=project(item.up),budget=assemblyEndpointPlacementArithmetic(item.up,document)
      if(guide.support?.kind!=='plane')throw Error('UP requires native plane direction.')
      roll={axis:rollAxis,reverse:orientation.roll.reverse,guide,directionErrorRad:128*Number.EPSILON*(pointBudget!.depth+1),guideDirectionErrorRad:128*Number.EPSILON*(budget.depth+1)}
    }
    return {id,type:'line-path',first,second,coordinateMm,...(follow?{follow}:{}),...(roll?{roll}:{})};
  }
  if (isResolvedAssemblyProfileCenterMate(item)) return { id, type: 'profile-center', first: projectProfile(item.first), second: projectProfile(item.second),
    alignment: item.mate.alignment, offsetMm: item.mate.offsetMm, orientation: structuredClone(item.mate.orientation) }
  if (isResolvedAssemblySymmetryMate(item)) {
    const entity = (witness: AssemblyMateWitness): RigidMateEndpoint => {
      const value = project(witness)
      if (item.mate.entityKind === 'line' && value.support?.kind === 'cylinder' && witness.kind === 'support') {
        return { ...value, support: { kind: 'line', point: [...value.support.point], axis: [...value.support.axis], tolerance: value.support.tolerance } }
      }
      if (value.support?.kind !== item.mate.entityKind) throw new Error('El propósito nativo no coincide con la entidad de simetría.')
      return value
    }
    const error = (witness: AssemblyMateWitness): RigidSymmetrySupportUncertainty => {
      const value = nativeSymmetryUncertainty(witness, document, item.mate.entityKind)
      return item.mate.entityKind === 'line' ? { positionErrorMm: value.positionErrorMm, directionErrorRad: value.directionErrorRad! } : value
    }
    return { id, type: 'symmetry', source: entity(item.source), target: entity(item.target), mirror: project(item.mirror), alignment: item.mate.alignment,
      uncertainty: [error(item.source), error(item.target), nativeSymmetryUncertainty(item.mirror, document)] }
  }
  if (isResolvedAssemblyWidthMate(item)) {
    const pair = (references: ResolvedAssemblyWidthMate['width']): [RigidMateEndpoint, RigidMateEndpoint] => {
      const values: [RigidMateEndpoint, RigidMateEndpoint] = [project(references[0]), project(references[1])]
      if (values.some(value => value.support?.kind !== 'plane')) throw new Error('La anchura centrada necesita cuatro planos nativos verificados.')
      return values
    }
    return { id, type: 'width', mode: item.mate.mode, width: pair(item.width), tab: pair(item.tab),
      widthBranch: item.mate.widthBranch, tabBranch: item.mate.tabBranch, alignment: item.mate.alignment }
  }
  return constraint(item.mate, id, project(item.first), project(item.second),
    item.carrier ? project(item.carrier) : undefined, item.guide ? project(item.guide) : undefined)
}
function positionalWitnesses(item: ResolvedAssemblyMate): AssemblyResolvedMateWitness[] {
  if (isResolvedAssemblyHingeMate(item)) return [...item.axis, ...item.axial]
  if(isResolvedAssemblyLinePathMate(item)||isResolvedAssemblyCircularPathMate(item))return [item.first,item.second]
  if (isResolvedAssemblyProfileCenterMate(item)) return [item.first, item.second]
  return isResolvedAssemblyWidthMate(item) ? [...item.width, ...item.tab] : isResolvedAssemblySymmetryMate(item) ? [item.source, item.target, item.mirror]
    : [item.first, item.second, ...(item.guide ? [item.guide] : [])]
}
function onlyIntervalDirections(resolved: readonly ResolvedAssemblyMate[]): boolean {
  return resolved.some(item => item.mate.type === 'limit-angle' || item.mate.type === 'limit-directed-angle')
    && resolved.every(item => ['limit-angle', 'limit-directed-angle', 'angle', 'parallel', 'perpendicular'].includes(item.mate.type))
}
function originRotationRoundoff(item: ResolvedAssemblyMate, document: AssemblyDocument): number {
  if (!isResolvedAssemblyBinaryMate(item) || item.mate.type !== 'concentric' || item.mate.rotationLock === null
    || item.mate.first.kind !== 'principal-axis' && item.mate.second.kind !== 'principal-axis') return 0
  return [item.first, item.second].reduce((error, witness) =>
    error + 128 * Number.EPSILON * (assemblyEndpointPlacementArithmetic(witness, document).depth + 2), 0)
}
function conditioning(document: AssemblyDocument, resolved: readonly ResolvedAssemblyMate[], tolerance: number, angleTolerance = 1e-8,
  angularIntervalContext = false): { origin: Vec3; lengthScale: number } {
  for (const item of resolved) {
    const roundoff = originRotationRoundoff(item, document)
    if (!Number.isFinite(roundoff) || roundoff > angleTolerance) throw new RangeError('El bloqueo de giro de origen excede la precisión angular de las cadenas originales.')
  }
  for (const item of resolved) if (isResolvedAssemblyBinaryMate(item) && item.mate.type === 'limit-directed-angle') {
    if (!item.guide) throw new Error('Falta el eje guía nativo del tope circular.')
    measureAssemblyDirectedAngleWitnesses(document, [item.first, item.second, item.guide], angleTolerance)
  }
  for (const item of resolved) if (isResolvedAssemblyBinaryMate(item) && item.mate.type === 'limit-angle') for (const witness of [item.first, item.second]) {
    if (witness.kind !== 'support') throw new Error('El límite angular requiere propósitos direccionales actuales.');
    const arithmetic = assemblyEndpointPlacementArithmetic(witness, document), error = 128 * Number.EPSILON * (arithmetic.depth + 1)
    if (!Number.isFinite(error) || error > angleTolerance) throw new RangeError('La composición de marcos excede la precisión angular solicitada.');
  }
  // Principal and directed interval families opt into this route. Directions
  // have no length origin/radius; distant unused translations are irrelevant.
  // Any actual positional or lifted mechanical relation retains the old guard.
  const angularOnly = onlyIntervalDirections(resolved) || angularIntervalContext
  if (angularOnly) return { origin: [0, 0, 0], lengthScale: 1 }
  // Only explicit UP-only owners may omit their irrelevant origin from length
  // conditioning. Any point/path or other mate incidence restores the old guard;
  // unreferenced bodies also retain the existing policy. Native proof and original
  // rotation-chain budgets are retained independently of this coordinate choice.
  const upOnlyOwners=new Set(resolved.flatMap(item=>(isResolvedAssemblyLinePathMate(item)||isResolvedAssemblyCircularPathMate(item))&&item.up?.componentPath[0]?[item.up.componentPath[0]]:[]))
  for(const item of resolved)for(const witness of (isResolvedAssemblyLinePathMate(item)||isResolvedAssemblyCircularPathMate(item))?[item.first,item.second]:resolvedAssemblyMateWitnesses(item)){
    const id=witness.componentPath[0];if(id)upOnlyOwners.delete(id)
  }
  const points: readonly number[][] = [
    ...document.occurrences.filter(item => !item.suppressed&&!upOnlyOwners.has(item.id)).map(item => item.pose.translation),
    ...resolved.flatMap(item => positionalWitnesses(item).map((witness, index) => {
      if(witness.kind==='line-path')return [...witness.worldCurve.startPoint]
      if (isResolvedAssemblyCircularPathMate(item)) {
        if (witness.kind === 'arc-path') return [...witness.worldCurve.center]
        if (witness.kind === 'point') return [...witness.worldSupport.point]
        throw Error('Circular positional role has a foreign purpose.')
      }
      if (witness.kind === 'arc-path') throw Error('Material arc has a foreign saved-mate purpose.')
      if (witness.kind === 'profile' || witness.kind === 'profile-axis') {
        if (!isResolvedAssemblyProfileCenterMate(item)) throw new Error('Propósito de perfil ajeno a la relación.')
        const profile = nativeProfileInput(witness, document)
        if (profile.positionErrorMm + Math.abs(item.mate.offsetMm) * profile.normalErrorRad > tolerance
          || profile.normalErrorRad > angleTolerance || profile.kind === 'rectangle' && profile.xDirectionErrorRad > angleTolerance) throw new RangeError('La composición del perfil excede las tolerancias solicitadas.')
        return witness.kind === 'profile-axis' ? [...witness.worldSupport.profile.center] : [...witness.worldSupport.center]
      }
      if (isResolvedAssemblySymmetryMate(item)) {
        const bound = nativeSymmetryUncertainty(witness, document, index === 2 ? 'plane' : item.mate.entityKind)
        if (bound.positionErrorMm > tolerance || (bound.directionErrorRad ?? 0) > angleTolerance || (bound.radiusErrorMm ?? 0) > tolerance) throw new RangeError('La composición de las tres referencias de simetría excede la precisión solicitada.')
        if (witness.kind === 'component') throw new Error('Falta el propósito analítico nativo de simetría.')
        return witness.kind === 'sphere-surface' ? [...witness.worldSupport.center] : [...witness.worldSupport.point]
      }
      if (isResolvedAssemblyWidthMate(item)) {
        if (witness.kind !== 'support' || witness.localSupport.kind !== 'plane') throw new Error('La anchura necesita cuatro propósitos planos nativos.')
        const arithmetic = assemblyEndpointPlacementArithmetic(witness, document),
          bound = 128 * Number.EPSILON * (arithmetic.depth + 1) * (arithmetic.placementSum + Math.hypot(...witness.localSupport.point))
        if (!Number.isFinite(bound) || bound > tolerance) throw new RangeError('La composición de los cuatro planos excede la precisión solicitada.')
        return [...witness.worldSupport.point]
      }
      if (item.mate.type === 'limit-distance') {
        if (witness.kind !== 'support' || witness.localSupport.kind !== 'plane') throw new Error('El límite de distancia necesita dos propósitos planos nativos.')
        const localPoint = assemblyTangentPlanePoint([...witness.localSupport.point], [...witness.localSupport.normal], tolerance),
          arithmetic = assemblyEndpointPlacementArithmetic(witness, document),
          bound = 128 * Number.EPSILON * (arithmetic.depth + 1) * (arithmetic.placementSum + Math.hypot(...localPoint)
            + Math.abs(item.mate.limits.minimum) + Math.abs(item.mate.limits.maximum))
        if (!Number.isFinite(bound) || bound > tolerance) throw new RangeError('La composición de planos y límites excede la precisión solicitada.')
        return transformRigidPoint(poseCopy(witness.declaredWorldPose), localPoint)
      }
      if (item.mate.type === 'plane-sphere-tangent' || item.mate.type === 'sphere-sphere-tangent' || item.mate.type === 'cylinder-sphere-tangent') {
        const localPoint: Vec3 = (() => {
          if (witness.kind === 'sphere-surface') return [...witness.localSupport.center]
          if (item.mate.type === 'plane-sphere-tangent' && witness.kind === 'support' && witness.localSupport.kind === 'plane') {
            return assemblyTangentPlanePoint([...witness.localSupport.point], [...witness.localSupport.normal], tolerance)
          }
          if (item.mate.type === 'cylinder-sphere-tangent' && witness.kind === 'cylinder-surface') {
            return assemblyTangentAxisPoint([...witness.localSupport.point], [...witness.localSupport.axis], tolerance)
          }
          throw new Error('La tangencia esférica necesita los propósitos nativos completos declarados.')
        })()
        const radius = witness.kind === 'sphere-surface' || witness.kind === 'cylinder-surface' ? witness.localSupport.radius : 0
        const arithmetic = assemblyEndpointPlacementArithmetic(witness, document), bound = 128 * Number.EPSILON * (arithmetic.depth + 1)
          * (arithmetic.placementSum + Math.hypot(...localPoint) + radius)
        // New complete-support families must not accept a centre after large
        // original chain terms were cancelled or rounded away before evaluation.
        if (!Number.isFinite(bound) || bound > tolerance) throw new RangeError('La composición de centros y marcos esféricos excede la precisión solicitada.')
        return transformRigidPoint(poseCopy(witness.declaredWorldPose), localPoint)
      }
      if (item.mate.type === 'skew-cylinder-tangent' || item.mate.type === 'parallel-cylinder-tangent') {
        if (witness.kind !== 'cylinder-surface') throw new Error('La tangencia entre cilindros necesita dos superficies cilíndricas verificadas.')
        return transformRigidPoint(poseCopy(witness.declaredWorldPose), assemblyTangentAxisPoint([...witness.localSupport.point], [...witness.localSupport.axis], tolerance))
      }
      if (item.mate.type === 'tangent') {
        if (witness.kind === 'cylinder-surface') return transformRigidPoint(poseCopy(witness.declaredWorldPose),
          assemblyTangentAxisPoint([...witness.localSupport.point], [...witness.localSupport.axis], tolerance))
        if (witness.kind === 'support' && witness.localSupport.kind === 'plane') return transformRigidPoint(poseCopy(witness.declaredWorldPose),
          assemblyTangentPlanePoint([...witness.localSupport.point], [...witness.localSupport.normal], tolerance))
        throw new Error('La tangencia necesita un plano y una superficie cilíndrica verificados.')
      }
      // Direction-only relations do not use the arbitrary parameter origin or
      // radius of a native plane/axis. Keep the actual component origins for
      // rigid-body conditioning without adding irrelevant support coordinates.
      if (item.mate.type === 'parallel' || item.mate.type === 'perpendicular' || item.mate.type === 'limit-angle' || item.mate.type === 'limit-directed-angle') return [...witness.declaredWorldPose.translation]
      if (item.mate.type === 'rack-pinion') {
        if (index === 1) return [...witness.declaredWorldPose.translation]
        if (witness.kind === 'support' && witness.localSupport.kind === 'cylinder') return transformRigidPoint(poseCopy(witness.declaredWorldPose),
          assemblyRackPinionAxisPoint([...witness.localSupport.point], [...witness.localSupport.axis], tolerance))
      }
      return witness.kind === 'support' ? [...witness.worldSupport.point] : [...witness.declaredWorldPose.translation]
    })),
  ]
  const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity]
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    minimum[axis] = Math.min(minimum[axis], point[axis]); maximum[axis] = Math.max(maximum[axis], point[axis])
  }
  const origin = points.length ? minimum.map((value, axis) => value / 2 + maximum[axis] / 2) as Vec3 : [0, 0, 0] as Vec3
  let lengthScale = 1, magnitude = 1
  for (const point of points) for (let axis = 0; axis < 3; axis++) {
    lengthScale = Math.max(lengthScale, Math.abs(point[axis] - origin[axis])); magnitude = Math.max(magnitude, Math.abs(point[axis]))
  }
  for (const item of resolved) for (const witness of positionalWitnesses(item)) {
    if (isResolvedAssemblyProfileCenterMate(item)) {
      lengthScale = Math.max(lengthScale, Math.abs(item.mate.offsetMm))
      magnitude = Math.max(magnitude, Math.abs(item.mate.offsetMm))
    }
    if (item.mate.type === 'limit-distance') {
      lengthScale = Math.max(lengthScale, Math.abs(item.mate.limits.minimum), Math.abs(item.mate.limits.maximum))
      magnitude = Math.max(magnitude, Math.abs(item.mate.limits.minimum), Math.abs(item.mate.limits.maximum))
    }
    if (witness.kind === 'arc-path') lengthScale = Math.max(lengthScale, witness.localCurve.radiusMm)
    if (witness.kind === 'cylinder-surface' || witness.kind === 'sphere-surface') lengthScale = Math.max(lengthScale, witness.localSupport.radius)
    if (item.mate.type !== 'parallel' && item.mate.type !== 'perpendicular' && item.mate.type !== 'limit-angle' && item.mate.type !== 'limit-directed-angle' && witness.kind === 'support'
      && witness.localSupport.kind === 'cylinder') lengthScale = Math.max(lengthScale, witness.localSupport.radius)
  }
  // An explicit conservative Float64 policy, not a certified error interval.
  // Refuse unresolved coordinate subtraction rather than silently relaxing mm.
  if (!Number.isFinite(lengthScale) || 128 * Number.EPSILON * Math.max(magnitude, lengthScale) > tolerance) {
    throw new RangeError('Las coordenadas exceden la precisión solicitada para resolver el ensamblaje.')
  }
  return { origin, lengthScale }
}
function projectionPolicy(options: AssemblySolveOptions): AssemblySolveOptions['projection'] {
  const field = Object.getOwnPropertyDescriptor(options, 'projection')
  if (!field) {
    if ('projection' in options) throw new Error('La política de proyección debe ser un campo de datos propio.')
    return undefined
  }
  if (!field.enumerable || !('value' in field)) throw new Error('La política de proyección no admite accesores.')
  const value: unknown = field.value
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('La política de proyección debe contener solo datos.')
  const result: Record<string, number | undefined> = Object.create(null)
  for (const name of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name)!
    if (typeof name !== 'string' || !['maxIterations', 'maxTrials', 'maxStepNorm', 'stationarityTolerance'].includes(name)
      || !descriptor.enumerable || !('value' in descriptor)
      || descriptor.value !== undefined && (typeof descriptor.value !== 'number' || !Number.isFinite(descriptor.value))) {
      throw new Error('La política de proyección solo admite límites numéricos declarados, sin accesores.')
    }
    result[name] = descriptor.value
  }
  return result
}
function policy(options: AssemblySolveOptions, projecting = false): AssemblySolveOptions & { lengthTolerance: number; angleTolerance: number } {
  const lengthTolerance = options.lengthTolerance ?? 1e-6, angleTolerance = options.angleTolerance ?? 1e-8
  if (!Number.isFinite(lengthTolerance) || lengthTolerance <= 0 || !Number.isFinite(angleTolerance)
    || angleTolerance <= 0 || angleTolerance >= Math.PI) throw new Error('Tolerancias de ensamblaje no válidas.')
  if (options.solver && 'angleRefinementTolerance' in options.solver) {
    const field = Object.getOwnPropertyDescriptor(options.solver, 'angleRefinementTolerance')
    if (!field?.enumerable || !('value' in field) || typeof field.value !== 'number'
      || !Number.isFinite(field.value) || field.value <= 0 || field.value > angleTolerance) {
      throw new Error('La meta de refinamiento angular debe ser un dato propio positivo y no superar la tolerancia pública.')
    }
  }
  return { lengthTolerance, angleTolerance, solver: options.solver ? structuredClone(options.solver) : undefined,
    projection: projecting ? projectionPolicy(options) : undefined }
}
function numericProblem(document: AssemblyDocument, resolved: readonly ResolvedAssemblyMate[], options: ReturnType<typeof policy>, anchor?: string,
  passive: readonly ResolvedAssemblyBinaryMate[] = [], passiveScrews: readonly ResolvedAssemblyBinaryMate[] = [], passiveRackPinions: readonly ResolvedAssemblyBinaryMate[] = []): RigidMateProblem {
  return { bodies: document.occurrences.filter(item => !item.suppressed).map(item => ({ id: item.id, pose: item.pose, fixed: item.fixed || item.id === anchor })),
    constraints: resolved.map(item => resolvedConstraint(item, item.mate.id, witness => endpoint(document, witness), document, witness => profileEndpoint(document, witness), witness=>linePathEndpoint(document,witness))),
    passiveGears: passive.map(item => {
      const value = constraint(item.mate, item.mate.id, endpoint(document, item.first), endpoint(document, item.second), item.carrier ? endpoint(document, item.carrier) : undefined)
      if (value.type !== 'gear') throw new Error('El seguimiento angular pasivo necesita un engranaje.')
      return value
    }),
    passiveScrews: passiveScrews.map(item => {
      const value = constraint(item.mate, item.mate.id, endpoint(document, item.first), endpoint(document, item.second))
      if (value.type !== 'screw') throw new Error('El seguimiento angular pasivo necesita un tornillo.')
      return value
    }),
    passiveRackPinions: passiveRackPinions.map(item => {
      const value = constraint(item.mate, item.mate.id, endpoint(document, item.first), endpoint(document, item.second))
      if (value.type !== 'rack-pinion') throw new Error('El seguimiento angular pasivo necesita una cremallera y piñón.')
      return value
    }),
    ...conditioning(document, [...resolved, ...passive, ...passiveScrews, ...passiveRackPinions], options.lengthTolerance, options.angleTolerance), lengthTolerance: options.lengthTolerance, angleTolerance: options.angleTolerance }
}
function summary(result: RigidMateSolveResult): AssemblyScopeSolveReport['result'] {
  const { poses: _poses, gearAngles: _gearAngles, screwAngles: _screwAngles, rackPinionAngles: _rackPinionAngles, ...data } = result
  return structuredClone(data)
}
/** Lift the explicit shortest pose intent through admitted charts, atomically. */
function continueGearIntent(problem: RigidMateProblem, before: Node): RigidMateProblem {
  if (!problem.constraints.some(value => value.type === 'gear' || value.type === 'screw' || value.type === 'rack-pinion')
    && !problem.passiveGears?.length && !problem.passiveScrews?.length && !problem.passiveRackPinions?.length) return problem
  const initial = new Map(problem.bodies.map(body => {
    const previous = before.occurrences.find(value => value.id === body.id)
    if (!previous) throw new Error('La continuidad angular necesita los mismos propietarios rígidos.')
    return [body.id, validateRigidPose(previous.pose)] as const
  }))
  let lifted = problem
  const measured = deriveRigidGearAngles(lifted, initial)
  const screws = deriveRigidScrewAngles(lifted, initial)
  const racks = deriveRigidRackPinionAngles(lifted, initial)
  for (const value of [...problem.constraints.filter(value => value.type === 'gear'), ...(problem.passiveGears ?? [])]) {
    if (value.type !== 'gear') continue
    const angles = measured.get(value.id)!
    if (Math.abs(angles.first - value.angles.first) > problem.angleTolerance || Math.abs(angles.second - value.angles.second) > problem.angleTolerance) {
      throw new Error('El marco interno del engranaje cambió sin una trayectoria angular verificada; resuelve o captura el origen primero.')
    }
  }
  for (const value of [...problem.constraints.filter(value => value.type === 'screw'), ...(problem.passiveScrews ?? [])]) {
    if (value.type !== 'screw') continue
    if (Math.abs(screws.get(value.id)! - value.angle) > problem.angleTolerance) throw new Error('El marco interno del tornillo cambió sin una trayectoria angular verificada.')
  }
  for (const value of [...problem.constraints.filter(value => value.type === 'rack-pinion'), ...(problem.passiveRackPinions ?? [])]) {
    if (value.type !== 'rack-pinion') continue
    if (Math.abs(racks.get(value.id)! - value.angle) > problem.angleTolerance) throw new Error('El marco interno de la cremallera cambió sin una trayectoria angular verificada.')
  }
  const changes = new Map(problem.bodies.map(body => {
    const old = initial.get(body.id)!, relative = composeRigidPoses({ translation: [0, 0, 0], rotation: body.pose.rotation },
      inverseRigidPose({ translation: [0, 0, 0], rotation: old.rotation })).rotation
    return [body.id, rotationLog(relative)] as const
  }))
  const count = Math.max(1, ...[...changes.values()].map(value => Math.ceil(Math.hypot(...value) / .2)))
  let accepted = initial
  for (let index = 1; index <= count; index++) {
    const steps = new Map([...changes].map(([id, value]) => [id, Math.hypot(...value) / count]))
    if (!admitRigidGearStep(lifted, accepted, steps) || !admitRigidScrewStep(lifted, accepted, steps) || !admitRigidRackPinionStep(lifted, accepted, steps)) throw new Error('El destino cruza una carta angular de acoplamiento no verificable.')
    const next = new Map(problem.bodies.map(body => {
      const old = initial.get(body.id)!, change = changes.get(body.id)!
      const increment = rotationExp(change.map(value => value * index / count) as Vec3)
      const pose = composeRigidPoses({ translation: [0, 0, 0], rotation: increment }, { translation: [0, 0, 0], rotation: old.rotation })
      pose.translation = [...body.pose.translation]
      return [body.id, pose] as const
    }))
    lifted = rebaseRigidRackPinionAngles(rebaseRigidScrewAngles(rebaseRigidGearAngles(lifted, deriveRigidGearAngles(lifted, next)),
      deriveRigidScrewAngles(lifted, next)), deriveRigidRackPinionAngles(lifted, next)); accepted = next
  }
  return lifted
}
/** Saved lifted values must agree with current native orientations, not phase. */
function verifyInitialGearState(document: AssemblyDocument, options: ReturnType<typeof policy>, snapshots?: AssemblySnapshotRunner): void {
  if (![document, ...document.definitions].some(value => value.kind === 'assembly' && value.mates.some(mate => mate.type === 'gear' || mate.type === 'screw' || mate.type === 'rack-pinion'))) return
  withSnapshot(document, snapshot => {
    const fixed = (value: AssemblyEndpointWitness): RigidMateEndpoint => ({ bodyId: null, frame: poseCopy(value.declaredWorldPose),
      ...(value.kind === 'support' ? { support: supportCopy(value) } : {}) })
    for (const item of [...snapshot.resolveActiveMates(document), ...snapshot.resolvePassiveGears(document), ...snapshot.resolvePassiveScrews(document), ...snapshot.resolvePassiveRackPinions(document)]) {
      if (!isResolvedAssemblyBinaryMate(item)) continue
      if (item.mate.type === 'rack-pinion') {
        snapshot.assertWitness(item.first, document); snapshot.assertWitness(item.second, document)
        const value = constraint(item.mate, item.mate.id, fixed(item.first), fixed(item.second))
        if (value.type !== 'rack-pinion') throw new Error('Falta la declaración angular de la cremallera.')
        if (Math.abs(rigidRackPinionTwist(value, new Map(), options.angleTolerance).angle - item.mate.angle) > options.angleTolerance) throw new Error('El ángulo guardado de la cremallera no coincide con su colocación nativa.')
        continue
      }
      if (item.mate.type === 'screw') {
        snapshot.assertWitness(item.first, document); snapshot.assertWitness(item.second, document)
        const value = constraint(item.mate, item.mate.id, fixed(item.first), fixed(item.second))
        if (value.type !== 'screw') throw new Error('Falta la declaración angular del tornillo.')
        const measured = rigidScrewTwist(value, new Map(), options.angleTolerance)
        if (Math.abs(measured.angle - item.mate.angle) > options.angleTolerance) throw new Error('El ángulo guardado del tornillo no coincide con su colocación nativa; vuelve a capturar el origen.')
        continue
      }
      if (item.mate.type !== 'gear') continue
      for (const witness of [item.first, item.second, item.carrier!]) snapshot.assertWitness(witness, document)
      const value = constraint(item.mate, item.mate.id, fixed(item.first), fixed(item.second), fixed(item.carrier!))
      if (value.type !== 'gear') throw new Error('Falta la declaración angular inicial.')
      const measured = deriveRigidGearAngles({ bodies: [], constraints: [], passiveGears: [value], origin: [0, 0, 0], lengthScale: 1,
        lengthTolerance: options.lengthTolerance, angleTolerance: options.angleTolerance }, new Map()).get(value.id)!
      if (Math.abs(measured.first - item.mate.angles.first) > options.angleTolerance || Math.abs(measured.second - item.mate.angles.second) > options.angleTolerance) {
        throw new Error('Los ángulos guardados del engranaje no coinciden con su colocación nativa; vuelve a capturar el origen.')
      }
    }
  }, snapshots)
}
function guardUnavailableGearCoordinates(base: AssemblyDocument, candidate: AssemblyDocument, unavailable: readonly (UnavailableAssemblyGear | UnavailableAssemblyScrew | UnavailableAssemblyRackPinion)[]): void {
  const table = (document: AssemblyDocument) => new Map([document, ...document.definitions].map(value => [key(value), value]))
  const original = table(base), next = table(candidate)
  function fail(): never { throw new Error('El engranaje suprimido tiene referencias sin continuidad nativa; conserva sus rutas, orígenes y posiciones o elimínalo y captura uno nuevo.') }
  const same = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second)
  const freezeSource = (reference: AssemblyReadonly<AssemblyDefinitionReference>) => {
    const before = original.get(key(reference)), after = next.get(key(reference))
    if (!same(before, after)) fail()
  }
  const freezePath = (path: readonly string[]) => {
    let before = original.get(key(base))!, after = next.get(key(candidate))!
    for (const id of path) {
      if (before.kind !== 'assembly') { if (!same(before, after)) fail(); break }
      if (after.kind !== 'assembly') fail()
      const first = before.occurrences.find(value => value.id === id), second = after.occurrences.find(value => value.id === id)
      if (!first) { if (second) fail(); break }
      if (!second || key(first.definition) !== key(second.definition) || !same(first.pose, second.pose)) fail()
      before = original.get(key(first.definition))!; after = next.get(key(second!.definition))!
      if (!after || before.kind === 'part' && !same(before, after)) fail()
    }
  }
  for (const record of unavailable) {
    const scope = next.get(key(record.scope))
    if (!scope || scope.kind !== 'assembly') fail()
    const mate = scope.mates.find(value => value.id === record.mate.id)
    // Removing the relation explicitly removes its angular-history obligation.
    if (!mate || mate.type !== record.mate.type) continue
    if (!same(record.mate.first, mate.first) || !same(record.mate.second, mate.second)) fail()
    if (record.mate.type === 'gear' && mate.type === 'gear' && (!same(record.mate.carrier, mate.carrier)
      || !same(record.mate.neutralRotations, mate.neutralRotations) || !same(record.mate.angles, mate.angles))) fail()
    if (record.mate.type === 'screw' && mate.type === 'screw' && (!same(record.mate.neutralRotation, mate.neutralRotation)
      || !same(record.mate.neutralTravel, mate.neutralTravel) || !same(record.mate.angle, mate.angle))) fail()
    if (record.mate.type === 'rack-pinion' && mate.type === 'rack-pinion' && (!same(record.mate.neutralRotation, mate.neutralRotation)
      || !same(record.mate.neutralTravel, mate.neutralTravel) || !same(record.mate.angle, mate.angle))) fail()
    freezePath(record.scopePath)
    for (const endpoint of [record.mate.first.component, record.mate.second.component, ...(record.mate.type === 'gear' ? [record.mate.carrier] : [])]) if (endpoint) {
      freezePath([...record.scopePath, ...endpoint.occurrencePath])
      // Stale reference tuples stay stale; replacing their source is no proof.
      freezeSource(endpoint.definition)
    }
  }
}
/** A missing native chart freezes only the coordinates and sources it depends on. */
export function assertUnavailableAssemblyGearCoordinates(base: AssemblyDocument, candidate: AssemblyDocument, snapshots?: AssemblySnapshotRunner): void {
  if (![base, ...base.definitions].some(value => value.kind === 'assembly' && value.mates.some(mate => mate.type === 'gear' || mate.type === 'screw' || mate.type === 'rack-pinion'))) return
  if (JSON.stringify(base) === JSON.stringify(candidate)) return
  withSnapshot(base, before => withSnapshot(candidate, after => {
    const unavailable = new Map<string, UnavailableAssemblyGear | UnavailableAssemblyScrew | UnavailableAssemblyRackPinion>([...before.inspectGearState(base).unavailable,
      ...before.inspectScrewState(base).unavailable, ...before.inspectRackPinionState(base).unavailable].map(value => [JSON.stringify([value.scopePath, key(value.scope), value.mate.id]), value]))
    const original = new Map([base, ...base.definitions].map(value => [key(value), value]))
    for (const record of [...after.inspectGearState(candidate).unavailable, ...after.inspectScrewState(candidate).unavailable, ...after.inspectRackPinionState(candidate).unavailable]) {
      const scope = original.get(key(record.scope))
      const mate = scope?.kind === 'assembly' ? scope.mates.find(value => value.id === record.mate.id) : undefined
      if (mate?.type !== 'gear' && mate?.type !== 'screw' && mate?.type !== 'rack-pinion') continue
      // A newly unavailable chart freezes the ORIGINAL coordinates and labels,
      // never a proposal that has already changed them before suppressing it.
      const originalRecord = mate.type === 'gear' ? { scopePath: record.scopePath, scope: { id: scope!.id, revision: scope!.revision }, mate }
        : mate.type === 'screw' ? { scopePath: record.scopePath, scope: { id: scope!.id, revision: scope!.revision }, mate }
          : { scopePath: record.scopePath, scope: { id: scope!.id, revision: scope!.revision }, mate }
      unavailable.set(JSON.stringify([record.scopePath, key(record.scope), mate.id]), originalRecord)
    }
    guardUnavailableGearCoordinates(base, candidate, [...unavailable.values()])
  }, snapshots), snapshots)
}
/** Same-path source repair may retain zero frames only with directed-axis proof. */
export function assertAssemblyGearSourceContinuity(base: AssemblyDocument, proposal: AssemblyDocument, options: AssemblySolveOptions = {}, snapshots?: AssemblySnapshotRunner): void {
  const originalNodes = new Map([base, ...base.definitions].filter(value => value.kind === 'assembly').map(value => [key(value), value]))
  const source = (document: AssemblyDocument, reference: AssemblyDefinitionReference) => document.definitions.find(value => key(value) === key(reference))
  const changed = new Set<string>()
  for (const scope of [proposal, ...proposal.definitions]) if (scope.kind === 'assembly') for (const mate of scope.mates) if (mate.type === 'gear' || mate.type === 'screw' || mate.type === 'rack-pinion') {
    const original = originalNodes.get(key(scope))
    const previous = original?.kind === 'assembly' ? original.mates.find(value => value.id === mate.id) : undefined
    if (!previous || previous.type !== 'gear' && previous.type !== 'screw' && previous.type !== 'rack-pinion' || previous.type !== mate.type) continue
    if (['first', 'second'].some(side => {
      const endpoint = side as 'first' | 'second'
      return JSON.stringify(previous[endpoint]) !== JSON.stringify(mate[endpoint])
        || JSON.stringify(source(base, previous[endpoint].component.definition)) !== JSON.stringify(source(proposal, mate[endpoint].component.definition))
    })) changed.add(JSON.stringify([key(scope), mate.id]))
  }
  if (!changed.size) return
  withSnapshot(base, before => withSnapshot(proposal, after => {
    const original = new Map([...before.resolveActiveMates(base), ...before.resolvePassiveGears(base), ...before.resolvePassiveScrews(base), ...before.resolvePassiveRackPinions(base)]
      .filter(isResolvedAssemblyBinaryMate)
      .filter(value => value.mate.type === 'gear' || value.mate.type === 'screw' || value.mate.type === 'rack-pinion').map(value => [JSON.stringify([value.scopePath, value.mate.id]), value]))
    for (const current of [...after.resolveActiveMates(proposal), ...after.resolvePassiveGears(proposal), ...after.resolvePassiveScrews(proposal), ...after.resolvePassiveRackPinions(proposal)]) if (isResolvedAssemblyBinaryMate(current) && (current.mate.type === 'gear' || current.mate.type === 'screw' || current.mate.type === 'rack-pinion')) {
      const scopeDefinition = after.resolveReference(proposal, { kind: 'principal-plane', component: null, plane: 'XY' }, current.scopePath)
      after.assertWitness(scopeDefinition, proposal)
      if (!changed.has(JSON.stringify([key(scopeDefinition.definition), current.mate.id]))) continue
      const previous = original.get(JSON.stringify([current.scopePath, current.mate.id]))
      if (!previous) throw new Error('No se demostró continuidad nativa del engranaje en esta ocurrencia.')
      for (const side of ['first', 'second'] as const) {
        const first = before.assertWitness(previous[side], base), second = after.assertWitness(current[side], proposal)
        if (current.mate.type === 'rack-pinion') {
          if (first.kind !== 'support' || second.kind !== 'support' || first.localSupport.kind === 'plane' || second.localSupport.kind === 'plane') throw new Error('La cremallera necesita soportes lineales o cilíndricos actuales.')
          if (side === 'second') {
            const oldAxis = canonicalAssemblyRackDirection([...first.localSupport.axis]), newAxis = canonicalAssemblyRackDirection([...second.localSupport.axis])
            if (Math.hypot(...oldAxis.map((value, i) => value - newAxis[i])) > (options.angleTolerance ?? 1e-8)) throw new Error('La reparación cambió la dirección canónica de la cremallera; vuelve a capturar el origen.')
          } else {
            if (first.localSupport.kind !== 'cylinder' || second.localSupport.kind !== 'cylinder') throw new Error('El piñón necesita un eje cilíndrico actual.')
            const oldAxis = first.localSupport.axis, newAxis = second.localSupport.axis
            const oldPoint = assemblyRackPinionAxisPoint([...first.localSupport.point], [...oldAxis], options.lengthTolerance ?? 1e-6), newPoint = assemblyRackPinionAxisPoint([...second.localSupport.point], [...newAxis], options.lengthTolerance ?? 1e-6)
            if (Math.hypot(...oldAxis.map((value, i) => value - newAxis[i])) > (options.angleTolerance ?? 1e-8)
              || Math.hypot(...oldPoint.map((value, i) => value - newPoint[i])) > (options.lengthTolerance ?? 1e-6)) throw new Error('La reparación cambió el eje dirigido o centro del piñón; vuelve a capturar el origen.')
          }
          continue
        }
        if (first.kind !== 'support' || second.kind !== 'support' || first.localSupport.kind !== 'cylinder' || second.localSupport.kind !== 'cylinder') throw new Error('El engranaje necesita ejes cilíndricos actuales.')
        const oldAxis = first.localSupport.axis, newAxis = second.localSupport.axis
        if (Math.hypot(...oldAxis.map((value, axis) => value - newAxis[axis])) > 1e-8) throw new Error('La reparación cambió el eje dirigido del engranaje; vuelve a capturar los ceros.')
      }
      if (previous.carrier) before.assertWitness(previous.carrier, base)
      if (current.carrier) after.assertWitness(current.carrier, proposal)
    }
  }, snapshots), snapshots)
}
function finalChecks(candidate: AssemblyDocument, options: ReturnType<typeof policy>, selectedComponent?: AssemblyComponentReference, snapshots?: AssemblySnapshotRunner): {
  checks: RigidMateEvaluation['checks']; tangencies: AssemblyTangentSupportReport[]; cylinderTangencies: AssemblyCylinderTangencySupportReport[]; sphericalTangencies: AssemblySphericalTangencySupportReport[]; limitDistances: AssemblyLimitDistanceSupportReport[]; limitAngles: AssemblyLimitAngleSupportReport[]; limitDirectedAngles: AssemblyLimitDirectedAngleSupportReport[]; widthCentered: AssemblyWidthCenteredSupportReport[]; symmetries: AssemblySymmetrySupportReport[]; profileCenters: AssemblyProfileCenterSupportReport[]; linePaths: AssemblyLinePathSupportReport[]; circularPaths: AssemblyCircularPathSupportReport[]; hinges: AssemblyHingeSupportReport[]; selectedWorldPose?: RigidPose
} {
  return withSnapshot(candidate, snapshot => {
    const checks: RigidMateEvaluation['checks'] = []
    const tangencies: AssemblyTangentSupportReport[] = []
    const cylinderTangencies: AssemblyCylinderTangencySupportReport[] = []
    const sphericalTangencies: AssemblySphericalTangencySupportReport[] = []
    const limitDistances: AssemblyLimitDistanceSupportReport[] = []
    const limitAngles: AssemblyLimitAngleSupportReport[] = []
    const limitDirectedAngles: AssemblyLimitDirectedAngleSupportReport[] = []
    const widthCentered: AssemblyWidthCenteredSupportReport[] = []
    const symmetries: AssemblySymmetrySupportReport[] = []
    const profileCenters: AssemblyProfileCenterSupportReport[] = []
    const linePaths: AssemblyLinePathSupportReport[] = []
    const hinges: AssemblyHingeSupportReport[] = []
    const circularPaths: AssemblyCircularPathSupportReport[] = []
    const resolved = [...snapshot.resolveActiveMates(candidate), ...snapshot.resolvePassiveGears(candidate), ...snapshot.resolvePassiveScrews(candidate), ...snapshot.resolvePassiveRackPinions(candidate)],
      angularIntervalContext = onlyIntervalDirections(resolved)
    for (const item of resolved) {
      for (const witness of resolvedAssemblyMateWitnesses(item)) snapshot.assertMateWitness(witness, candidate)
      // One physical relation at a time: no huge dense Jacobian or body budget
      // is allocated just to check rigidly transformed nested relations.
      const fixed = (witness: AssemblyMateWitness): RigidMateEndpoint => ({ bodyId: null,
        frame: poseCopy(witness.declaredWorldPose), ...(witness.kind !== 'component' ? { support: supportCopy(witness) } : {}) })
      const id = JSON.stringify([item.scopePath, item.mate.id]), value = resolvedConstraint(item, id, fixed, candidate, witness => profileEndpoint(candidate, witness, true), witness=>linePathEndpoint(candidate,witness,true), true)
      const passive = (value.type === 'gear' || value.type === 'screw' || value.type === 'rack-pinion') && item.mate.suppressed
      const evaluation = evaluateRigidMates({ bodies: [], constraints: passive ? [] : [value],
        ...(passive && value.type === 'gear' ? { passiveGears: [value] } : {}),
        ...(passive && value.type === 'screw' ? { passiveScrews: [value] } : {}),
        ...(passive && value.type === 'rack-pinion' ? { passiveRackPinions: [value] } : {}),
        ...conditioning(candidate, [item], options.lengthTolerance, options.angleTolerance, angularIntervalContext), lengthTolerance: options.lengthTolerance, angleTolerance: options.angleTolerance })
      if (evaluation.diagnostics.length || !passive && (evaluation.checks.length !== 1 || !evaluation.checks[0].satisfied)) {
        if (evaluation.diagnostics.some(value => value.code === 'precisionLimit')) throw new RangeError('La verificación final de las referencias excede la precisión solicitada.')
        throw new Error('La verificación nativa final no satisface la relación «' + item.mate.name + '».')
      }
      const rotationRoundoff = originRotationRoundoff(item, candidate)
      if (rotationRoundoff && evaluation.checks.some(check => check.angleResidual + rotationRoundoff > options.angleTolerance)) {
        throw new RangeError('La medida final del bloqueo de giro de origen no conserva su banda angular.')
      }
      if (isResolvedAssemblyHingeMate(item)) {
        const request = { axis: item.mate.axis, axial: item.mate.axial, alignment: item.mate.alignment }
        const bands = { lengthToleranceMm: options.lengthTolerance, angleToleranceRad: options.angleTolerance }
        if (item.mate.stops) {
          const actual = measureAssemblyLimitedHingeReferences(snapshot, candidate, { ...request, stops: item.mate.stops }, bands, item.scopePath)
          if (actual.status !== 'ok' || !actual.satisfied) throw new RangeError('Fresh native limited hinge verification cannot retain the requested bands.')
          hinges.push({ ...actual.hinge, kind: 'hinge', mateId: item.mate.id, satisfied: true, stops: {
            coordinate: actual.coordinate, componentPaths: actual.componentPaths.angular.map(path => [...path]) as [string[], string[]],
            arcDegrees: { ...actual.arcDegrees }, angleRadians: actual.angleRadians, projectionLengths: { ...actual.projectionLengths },
            marginsRadians: { ...actual.marginsRadians }, activity: actual.activity, fullCircle: actual.fullCircle, directionErrorRad: actual.directionErrorRad } })
        } else {
          const actual = measureAssemblyHingeReferences(snapshot, candidate, request, bands, item.scopePath)
          if (actual.status !== 'ok' || !actual.satisfied) throw new RangeError('Fresh native hinge verification cannot retain the requested bands.')
          hinges.push({ ...actual, kind: 'hinge', mateId: item.mate.id, satisfied: true })
        }
        checks.push(...evaluation.checks)
        continue
      }
      if (isResolvedAssemblyCircularPathMate(item)) {
        const { point, path, position, orientation } = item.mate
        const actual = evaluateAssemblyCircularPathReferences(snapshot, candidate, { point, path, position, orientation },
          { lengthToleranceMm: options.lengthTolerance, angleToleranceRad: options.angleTolerance }, item.scopePath)
        if (actual.status !== 'ok') throw new RangeError(actual.message)
        if (!actual.satisfied) throw Error('La comprobación física independiente del arco circular no satisface la relación.')
        circularPaths.push({ ...actual, kind: 'circular-path', mateId: item.mate.id, scopePath: [...item.scopePath], satisfied: true })
        checks.push(...evaluation.checks); continue
      }
      if(isResolvedAssemblyLinePathMate(item)){
        const {point,path,position,orientation}=item.mate
        const actual=evaluateAssemblyLinePathReferences(snapshot,candidate,{point,path,position,orientation},{lengthToleranceMm:options.lengthTolerance,angleToleranceRad:options.angleTolerance},item.scopePath)
        if(actual.status!=='ok')throw new RangeError(actual.message)
        if(!actual.satisfied)throw Error('La comprobación física independiente de LINE no satisface la relación.')
        linePaths.push({kind:'line-path',mateId:item.mate.id,scopePath:[...item.scopePath],componentPaths:actual.componentPaths,position:structuredClone(position),orientation:validateAssemblyLinePathOrientation(orientation),curveLengthMm:actual.curveLengthMm,coordinateMm:actual.coordinateMm,targetCoordinateMm:actual.targetCoordinateMm,transverseResidualMm:actual.transverseResidualMm,coordinateResidualMm:actual.coordinateResidualMm,positionResidualMm:actual.positionResidualMm,orientationResidualRad:actual.orientationResidualRad,rollResidualRad:actual.rollResidualRad,precision:structuredClone(actual.precision),angleTolerance:options.angleTolerance,lengthTolerance:options.lengthTolerance,satisfied:true,underlyingLine:true,materialOrigin:true,verificationOnly:true})
        checks.push(...evaluation.checks);continue
      }
      if (isResolvedAssemblyProfileCenterMate(item)) {
        const { first, second, alignment, offsetMm, orientation } = item.mate
        const actual = evaluateAssemblyProfileCenterReferences(snapshot, candidate, { first, second, alignment, offsetMm, orientation },
          { lengthToleranceMm: options.lengthTolerance, angleToleranceRad: options.angleTolerance }, item.scopePath)
        if (actual.status === 'precisionLimit') throw new RangeError(actual.message)
        if (!actual.satisfied || actual.positionResidualMm === null || actual.normalAngleRadians === null
          || (orientation.mode === 'rectangle' ? actual.rectangleAngleRadians === null || actual.profileKinds.first !== 'rectangle' || actual.profileKinds.second !== 'rectangle'
            : actual.profileKinds.first !== 'circle' || actual.profileKinds.second !== 'circle')) throw new Error('Los perfiles nativos no satisfacen la relación declarada.')
        const measurements = evaluation.profileCenter?.filter(measured => measured.constraintId === id)
        if (!measurements || measurements.length !== 1 || measurements[0].alignment !== alignment || measurements[0].offsetMm !== offsetMm
          || JSON.stringify(measurements[0].orientation) !== JSON.stringify(orientation)
          || Math.abs(measurements[0].positionErrorMm - actual.positionResidualMm) > options.lengthTolerance
          || Math.abs(measurements[0].normalAngleRadians - actual.normalAngleRadians) > options.angleTolerance
          || (measurements[0].rectangleAngleRadians === null ? actual.rectangleAngleRadians !== null
            : actual.rectangleAngleRadians === null || Math.abs(measurements[0].rectangleAngleRadians - actual.rectangleAngleRadians) > options.angleTolerance)) throw new Error('Falta la verificación física independiente del centrado de perfiles.')
        profileCenters.push({ kind: 'profile-center', mateId: item.mate.id, scopePath: [...item.scopePath], componentPaths: structuredClone(actual.componentPaths),
          profileKinds: { ...actual.profileKinds }, alignment, offsetMm, orientation: structuredClone(orientation), positionResidualMm: actual.positionResidualMm,
          normalAngleRadians: actual.normalAngleRadians, rectangleAngleRadians: actual.rectangleAngleRadians,
          lengthTolerance: options.lengthTolerance, angleTolerance: options.angleTolerance, satisfied: true, boundedProfiles: true, verificationOnly: true })
        checks.push(...evaluation.checks)
        continue
      }
      if (isResolvedAssemblySymmetryMate(item)) {
        const { entityKind, source, target, mirror, alignment } = item.mate
        const actual = measureAssemblySymmetryReferences(snapshot, candidate, { entityKind, source, target, mirror, alignment },
          { lengthToleranceMm: options.lengthTolerance, angleToleranceRad: options.angleTolerance }, item.scopePath)
        if (actual.status === 'precisionLimit') throw new RangeError(actual.message)
        if (!actual.satisfied || actual.entityKind !== entityKind || actual.alignment !== alignment) throw new Error('Las tres referencias nativas no satisfacen la simetría declarada.')
        const measurements = evaluation.symmetry?.filter(value => value.constraintId === id)
        if (!measurements || measurements.length !== 1 || measurements[0].entityKind !== entityKind || measurements[0].alignment !== alignment
          || Math.abs(measurements[0].positionErrorMm - actual.positionErrorMm) > options.lengthTolerance
          || (measurements[0].angleRadians === null ? actual.angleRadians !== null : actual.angleRadians === null || Math.abs(measurements[0].angleRadians - actual.angleRadians) > options.angleTolerance)
          || (measurements[0].radiusDifferenceMm === null ? actual.radiusDifferenceMm !== null : actual.radiusDifferenceMm === null || Math.abs(measurements[0].radiusDifferenceMm - actual.radiusDifferenceMm) > options.lengthTolerance)) throw new Error('Falta la medida física independiente de las tres referencias de simetría.')
        symmetries.push({ ...actual, kind: 'symmetry', mateId: item.mate.id, lengthTolerance: options.lengthTolerance, angleTolerance: options.angleTolerance })
        checks.push(...evaluation.checks)
        continue
      }
      if (isResolvedAssemblyWidthMate(item)) {
        const actual = measureAssemblyWidthWitnesses(snapshot, candidate, item, options.lengthTolerance, options.angleTolerance)
        const measurements = evaluation.widthCentered?.filter(measured => measured.constraintId === id)
        if (!measurements || measurements.length !== 1 || measurements[0].mode !== 'centered'
          || measurements[0].widthBranch !== item.mate.widthBranch || measurements[0].tabBranch !== item.mate.tabBranch
          || measurements[0].alignment !== item.mate.alignment
          || !Number.isFinite(measurements[0].angleRadians) || !Number.isFinite(measurements[0].offsetMm)
          || Math.abs(measurements[0].angleRadians - actual.angleRadians) > options.angleTolerance
          || Math.abs(measurements[0].offsetMm - actual.offsetMm) > actual.lengthTolerance) throw new Error('Falta la medida física fresca de las cuatro referencias de anchura.')
        widthCentered.push(actual); checks.push(...evaluation.checks)
        continue
      }
      if (item.mate.type === 'limit-directed-angle') {
        if (!item.guide) throw new Error('Falta la dirección guía fresca del tope circular.')
        const actual = measureAssemblyDirectedAngleWitnesses(candidate, [item.first, item.second, item.guide], options.angleTolerance),
          angle = actual.angleDegrees * Math.PI / 180,
          expected = evaluateAssemblyDirectedAngleArc(angle, item.mate.arc, options.angleTolerance),
          measurements = evaluation.limitDirectedAngles?.filter(value => value.constraintId === id)
        if (!measurements || measurements.length !== 1
          || expected.marginsRadians.minimum < -options.angleTolerance || expected.marginsRadians.maximum < -options.angleTolerance) {
          throw new Error('La medida circular nativa no satisface el arco declarado.')
        }
        const measured = measurements[0], circularDifference = Math.abs(Math.atan2(Math.sin(measured.angleRadians - angle), Math.cos(measured.angleRadians - angle)))
        if (!Number.isFinite(circularDifference) || circularDifference > options.angleTolerance
          || measured.arcDegrees.start !== item.mate.arc.start || measured.arcDegrees.sweep !== item.mate.arc.sweep
          || measured.angleToleranceRadians !== options.angleTolerance || measured.activity !== expected.activity
          || measured.fullCircle !== expected.fullCircle
          || !Number.isFinite(measured.marginsRadians.minimum) || !Number.isFinite(measured.marginsRadians.maximum)
          || Math.abs(measured.marginsRadians.minimum - expected.marginsRadians.minimum) > options.angleTolerance
          || Math.abs(measured.marginsRadians.maximum - expected.marginsRadians.maximum) > options.angleTolerance) {
          throw new Error('Falta la medida circular fresca y sus fronteras originales.')
        }
        limitDirectedAngles.push({ ...actual, kind: 'limit-directed-angle', scopePath: [...item.scopePath], mateId: item.mate.id,
          arcDegrees: { ...item.mate.arc }, marginsRadians: { ...expected.marginsRadians }, activity: expected.activity, fullCircle: expected.fullCircle })
      }
      if (item.mate.type === 'limit-angle') {
        const actual = (witness: AssemblyEndpointWitness): { kind: 'plane' | 'cylinder' | 'line'; direction: Vec3 } => {
          if (witness.kind !== 'support') throw new Error('Faltan las dos direcciones nativas del límite angular.');
          const support = witness.localSupport, direction = transformRigidDirection(poseCopy(witness.declaredWorldPose),
            [...(support.kind === 'plane' ? support.normal : support.axis)] as Vec3), length = Math.hypot(...direction)
          if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-8) throw new Error('La dirección angular nativa no es unitaria.');
          return { kind: support.kind, direction: direction.map(value => value / length) as Vec3 }
        }, first = actual(item.first), second = actual(item.second), a = first.direction, b = second.direction,
          cross: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
          angle = Math.atan2(Math.hypot(...cross), a.reduce((sum, value, index) => sum + value * b[index], 0)),
          minimumMargin = angle - item.mate.limits.minimum * Math.PI / 180,
          maximumMargin = item.mate.limits.maximum * Math.PI / 180 - angle,
          measurements = evaluation.limitAngles?.filter(value => value.constraintId === id)
        if (!Number.isFinite(angle) || minimumMargin < -options.angleTolerance || maximumMargin < -options.angleTolerance
          || !measurements || measurements.length !== 1) throw new Error('La medida nativa no satisface las dos fronteras angulares originales.');
        const measured = measurements[0]
        if (!Number.isFinite(measured.angleRadians) || Math.abs(measured.angleRadians - angle) > options.angleTolerance
          || measured.limitsDegrees.minimum !== item.mate.limits.minimum || measured.limitsDegrees.maximum !== item.mate.limits.maximum
          || measured.angleToleranceRadians !== options.angleTolerance
          || !Number.isFinite(measured.marginsRadians.minimum) || !Number.isFinite(measured.marginsRadians.maximum)
          || Math.abs(measured.marginsRadians.minimum - minimumMargin) > options.angleTolerance
          || Math.abs(measured.marginsRadians.maximum - maximumMargin) > options.angleTolerance
          || measured.domainBounds.minimum !== (item.mate.limits.minimum === 0)
          || measured.domainBounds.maximum !== (item.mate.limits.maximum === 180)
          || !['interior', 'minimum', 'maximum', 'both'].includes(measured.activity)
          || !['regular', 'parallel', 'antiparallel'].includes(measured.stratum)) throw new Error('Falta la medida principal angular fresca.');
        const atMinimum = Math.abs(minimumMargin) <= options.angleTolerance, atMaximum = Math.abs(maximumMargin) <= options.angleTolerance,
          activity = atMinimum && atMaximum ? 'both' : atMinimum ? 'minimum' : atMaximum ? 'maximum' : 'interior',
          stratum = angle === 0 ? 'parallel' : angle === Math.PI ? 'antiparallel' : 'regular'
        limitAngles.push({ kind: 'limit-angle', coordinate: 'principal-direction', scopePath: [...item.scopePath], mateId: item.mate.id,
          angleDegrees: angle * 180 / Math.PI, limitsDegrees: { ...item.mate.limits }, angleToleranceRadians: options.angleTolerance,
          activity, stratum, domainBounds: { ...measured.domainBounds },
          firstKind: first.kind, secondKind: second.kind, firstDirection: first.direction, secondDirection: second.direction, supportOnly: true })
      }
      if (item.mate.type === 'limit-distance') {
        if (item.first.kind !== 'support' || item.first.localSupport.kind !== 'plane'
          || item.second.kind !== 'support' || item.second.localSupport.kind !== 'plane') throw new Error('Faltan los dos planos actuales del límite de distancia.')
        const measurements = evaluation.limitDistances?.filter(value => value.constraintId === id),
          inequalities = evaluation.inequalities?.filter(value => value.constraintId === id)
        if (!measurements || measurements.length !== 1 || !inequalities || inequalities.length !== 2
          || !inequalities.some(value => value.bound === 'minimum') || !inequalities.some(value => value.bound === 'maximum')
          || inequalities.some(value => !Number.isFinite(value.margin) || !Number.isFinite(value.tolerance) || value.margin < -value.tolerance)) {
          throw new Error('La verificación final no conserva las dos fronteras del límite de distancia.')
        }
        const measured = measurements[0]
        if (!Number.isFinite(measured.coordinate) || measured.limits.minimum !== item.mate.limits.minimum
          || measured.limits.maximum !== item.mate.limits.maximum || !Number.isFinite(measured.lengthTolerance) || measured.lengthTolerance <= 0
          || !['interior', 'minimum', 'maximum', 'both'].includes(measured.activity)) throw new Error('Falta la medida física fresca del límite de distancia.')
        limitDistances.push({ kind: 'limit-distance', scopePath: [...item.scopePath], mateId: item.mate.id, alignment: item.mate.alignment,
          limits: { ...item.mate.limits }, coordinate: measured.coordinate, activity: measured.activity,
          lengthTolerance: measured.lengthTolerance, supportOnly: true })
      }
      if (item.mate.type === 'tangent') {
        const surface = item.first.kind === 'cylinder-surface' ? item.first : item.second.kind === 'cylinder-surface' ? item.second : undefined
        const plane = surface === item.first ? item.second : item.first
        if (!surface || plane.kind !== 'support' || plane.localSupport.kind !== 'plane') throw new Error('Falta el propósito nativo de superficie de la tangencia.')
        tangencies.push({ scopePath: [...item.scopePath], mateId: item.mate.id, side: item.mate.side,
          radialMaterialSense: surface.localSupport.radialMaterialSense,
          normalRelation: assemblyTangentSupportNormalRelation(item.mate.side, surface.localSupport.radialMaterialSense), supportOnly: true })
      }
      if (item.mate.type === 'skew-cylinder-tangent' || item.mate.type === 'parallel-cylinder-tangent') {
        if (item.first.kind !== 'cylinder-surface' || item.second.kind !== 'cylinder-surface') throw new Error('Falta el propósito nativo de las dos superficies cilíndricas.')
        const first = item.first.localSupport.radialMaterialSense, second = item.second.localSupport.radialMaterialSense
        cylinderTangencies.push({ kind: item.mate.type, scopePath: [...item.scopePath], mateId: item.mate.id,
          branch: { ...item.mate.branch }, radialMaterialSense: { first, second },
          normalRelation: assemblyCylinderTangentSupportNormalRelation(item.mate.branch, first, second), supportOnly: true })
      }
      if (item.mate.type === 'plane-sphere-tangent') {
        const sphere = item.first.kind === 'sphere-surface' ? item.first : item.second.kind === 'sphere-surface' ? item.second : undefined,
          plane = sphere === item.first ? item.second : item.first
        if (!sphere || plane.kind !== 'support' || plane.localSupport.kind !== 'plane') throw new Error('Falta el propósito nativo plano/esfera de la tangencia.')
        const sphereRadialMaterialSense = sphere.localSupport.radialMaterialSense
        sphericalTangencies.push({ kind: item.mate.type, scopePath: [...item.scopePath], mateId: item.mate.id, side: item.mate.side,
          sphereRadialMaterialSense, normalRelation: assemblyPlaneSphereTangentSupportNormalRelation(item.mate.side, sphereRadialMaterialSense), supportOnly: true })
      }
      if (item.mate.type === 'sphere-sphere-tangent' || item.mate.type === 'cylinder-sphere-tangent') {
        const first = item.first, second = item.second
        if (item.mate.type === 'sphere-sphere-tangent'
          ? first.kind !== 'sphere-surface' || second.kind !== 'sphere-surface'
          : !(first.kind === 'sphere-surface' && second.kind === 'cylinder-surface' || first.kind === 'cylinder-surface' && second.kind === 'sphere-surface')) {
          throw new Error('Faltan los dos propósitos nativos de superficie de la tangencia esférica.')
        }
        if ((first.kind !== 'sphere-surface' && first.kind !== 'cylinder-surface') || (second.kind !== 'sphere-surface' && second.kind !== 'cylinder-surface')) throw new Error('La tangencia no tiene dos normales de superficie nativas.')
        const senses = { first: first.localSupport.radialMaterialSense, second: second.localSupport.radialMaterialSense }
        sphericalTangencies.push({ kind: item.mate.type, scopePath: [...item.scopePath], mateId: item.mate.id, branch: { ...item.mate.branch },
          radialMaterialSense: senses, normalRelation: assemblySphereTangentSupportNormalRelation(item.mate.branch, senses.first, senses.second), supportOnly: true })
      }
      if (item.mate.type === 'gear') {
        const angles = evaluation.gearAngles.get(id)
        if (!angles || Math.abs(angles.first - item.mate.angles.first) > options.angleTolerance
          || Math.abs(angles.second - item.mate.angles.second) > options.angleTolerance) throw new Error('La verificación nativa no conserva los ángulos levantados del engranaje.')
      }
      if (item.mate.type === 'screw') {
        const angle = evaluation.screwAngles.get(id)
        if (angle === undefined || Math.abs(angle - item.mate.angle) > options.angleTolerance) throw new Error('La verificación nativa no conserva el ángulo levantado del tornillo.')
      }
      if (item.mate.type === 'rack-pinion') {
        const angle = evaluation.rackPinionAngles.get(id)
        if (angle === undefined || Math.abs(angle - item.mate.angle) > options.angleTolerance) throw new Error('La verificación nativa no conserva el ángulo levantado de la cremallera.')
      }
      checks.push(...evaluation.checks)
    }
    let selectedWorldPose: RigidPose | undefined
    if (selectedComponent) {
      // The complete native snapshot also verifies active source reconstruction
      // and the selected exact path. Only a detached frame escapes its lifetime.
      const witness = snapshot.resolveReference(candidate, { kind: 'principal-plane', component: selectedComponent, plane: 'XY' })
      snapshot.assertWitness(witness, candidate); selectedWorldPose = poseCopy(witness.declaredWorldPose)
    }
    return { checks, hinges, tangencies, cylinderTangencies, sphericalTangencies, limitDistances, limitAngles, limitDirectedAngles, widthCentered, symmetries, profileCenters, linePaths, circularPaths, ...(selectedWorldPose ? { selectedWorldPose } : {}) }
  }, snapshots)
}

/**
 * Real native references → detached simultaneous solve → fresh native check.
 * Subassembly definitions solve bottom-up and act as rigid units in the parent.
 * Flexible per-instance children are deliberately not represented by this API.
 * All native ownership is released before a successful preview is published.
 */
export function prepareAssemblySolve(input: AssemblyDocument, options: AssemblySolveOptions = {}, snapshots?: AssemblySnapshotRunner): AssemblySolvePreview | AssemblySolveRejection {
  return prepare(input, options, undefined, false, snapshots)
}

/** Native endpoint continuity for the centered-width affine path argument.
 * A tangentially different plane parameter point is not interchangeable with
 * the original moving anchor at a nonzero, accepted angular defect. */
function assertCenteredWidthTranslationSupports(base: AssemblyDocument, target: AssemblyDocument): void {
  withSnapshot(base, before => withSnapshot(target, after => {
    const widths = (snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument) =>
      snapshot.resolveActiveMates(document).filter(isResolvedAssemblyWidthMate)
    const previous = widths(before, base), current = widths(after, target)
    const identity = (item: ResolvedAssemblyWidthMate) => JSON.stringify([item.scopePath, item.mate.id])
    const next = new Map(current.map(item => [identity(item), item]))
    if (previous.length !== current.length || next.size !== current.length) throw new Error('La trayectoria cambió las referencias de anchura activas.')
    const equal = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, index) => value === b[index])
    for (const item of previous) {
      const other = next.get(identity(item))
      if (!other || JSON.stringify(item.mate) !== JSON.stringify(other.mate)) throw new Error('La trayectoria cambió la declaración de anchura.')
      const first = [...item.width, ...item.tab], second = [...other.width, ...other.tab]
      for (let index = 0; index < 4; index++) {
        const a = first[index], b = second[index]
        before.assertWitness(a, base); after.assertWitness(b, target)
        if (a.kind !== 'support' || b.kind !== 'support' || a.localSupport.kind !== 'plane' || b.localSupport.kind !== 'plane'
          || a.origin !== b.origin || JSON.stringify(a.componentPath) !== JSON.stringify(b.componentPath) || key(a.definition) !== key(b.definition)
          || !equal(a.declaredWorldPose.rotation, b.declaredWorldPose.rotation)
          || !equal(a.localSupport.point, b.localSupport.point) || !equal(a.localSupport.normal, b.localSupport.normal)
          || !equal(a.localSupport.xDirection, b.localSupport.xDirection) || a.localSupport.tolerance !== b.localSupport.tolerance) {
          throw new Error('La trayectoria no conserva los cuatro soportes locales, sus anclajes y tolerancias de anchura.')
        }
      }
    }
  }))
}

/**
 * Rectilinear motion is a separate operation, never an endpoint-only collision
 * claim on the pointer projector. Constant local rotations make every current
 * admitted mate's length residual affine and its angular residual constant. The signed
 * plane distances, line-offset vectors and lock translations therefore remain
 * within their convex tolerance bands between the freshly checked endpoints.
 * Parallel/perpendicular depend only on the two support directions, so their
 * complete residuals stay constant when all local rotations are preserved.
 * Centered width retains four constant local plane supports. Its selected
 * branch normals/lengths stay constant, each plane offset is affine, and so
 * is hTab-sign*hWidth-(bTab-sign*bWidth).anchor. The angle stays constant;
 * the anchored offset stays in the convex endpoint tolerance band. Authenticate
 * the same local support points (including the anchor), normals, tolerances
 * and world rotations before applying that argument. Other width modes and
 * future nonlinear families need separate path arguments.
 */
export function prepareAssemblyTranslationPreview(input: AssemblyDocument, request: AssemblyTranslationRequest,
  stopOptions?: Partial<AssemblyTranslationStopOptions>, options: AssemblySolveOptions = {}): AssemblySolvePreview | AssemblySolveRejection {
  const scopes: AssemblyScopeSolveReport[] = []
  let phase: AssemblySolveRejection['reason'] = 'reference'
  try {
    const source = validateAssemblyDocument(input), intent = validateAssemblyTranslationRequest(request), stop = validateAssemblyTranslationStopOptions(stopOptions)
    const selected = policy(options), frame = prepareAssemblyDragFrame(source, intent.component)
    const requestedPose = validateRigidPose({ translation: intent.translation, rotation: frame.worldPose.rotation })
    const endpointPreview = prepareAssemblyWorldMovePreview(source, { component: intent.component, pose: requestedPose }, selected)
    if (endpointPreview.status === 'rejected') return endpointPreview
    let endpointDocument: AssemblyDocument
    try { endpointDocument = validateAssemblyDocument(endpointPreview.document) }
    finally { discardAssemblySolvePreview(endpointPreview) }
    const path = prepareAssemblyTranslationPath(source, endpointDocument, selected.angleTolerance)
    let hasCenteredWidth = false
    for (const reference of solveOrder(source)) for (const mate of node(source, reference).mates) {
      const isPlane = (reference: AssemblyBinaryMate['first']) => 'kind' in reference && (reference.kind === 'principal-plane' || reference.kind === 'face' && reference.support === 'plane')
      const isSurface = (reference: AssemblyBinaryMate['first']) => 'kind' in reference && reference.kind === 'face' && reference.support === 'cylinder-surface'
      // This proof applies only to the current plane/cylinder infinite-support
      // subset; future tangent families must not inherit it by their type name.
      const affineTangent = mate.type === 'tangent' && (isPlane(mate.first) && isSurface(mate.second) || isSurface(mate.first) && isPlane(mate.second))
      const affineWidth = mate.type === 'width' && mate.mode === 'centered'
      if (!mate.suppressed && affineWidth) hasCenteredWidth = true
      if (!mate.suppressed && !affineTangent && !affineWidth && !['concentric', 'coincident', 'distance', 'angle', 'lock', 'parallel', 'perpendicular'].includes(mate.type)) {
        throw new Error('Esta familia de relaciones todavía no permite verificar una trayectoria rectilínea.')
      }
    }
    // Reconstruct identical source geometry at both ends after restoring exact
    // original rotations. An initially unsolved model must be solved first.
    phase = 'verification'
    if (hasCenteredWidth) assertCenteredWidthTranslationSupports(path.base, path.target)
    finalChecks(path.base, selected, intent.component)
    const restoredEnd = finalChecks(path.target, selected, intent.component)
    if (!restoredEnd.selectedWorldPose) throw new Error('Falta la colocación nativa del destino rectilíneo.')
    const restoredError = poseResiduals(restoredEnd.selectedWorldPose, requestedPose)
    if (restoredError.positionResidual > selected.lengthTolerance || restoredError.angleResidual > selected.angleTolerance) {
      throw new Error('Conservar las rotaciones originales desvía el destino solicitado más que su tolerancia.')
    }
    const trace = traceAssemblyTranslation(path, stop), checked = validateAssemblyDocument(path.at(trace.fraction))
    if (!activePoseChange(source, checked, selected)) {
      return { status: 'rejected', reason: 'numeric', message: 'La parada no permite un desplazamiento mayor que la tolerancia. No se cambió el ensamblaje.', scopes }
    }
    // Measure natural mobility without adding a driver and without moving the
    // inspected path endpoint. Zero iteration/seed budgets are intentional here:
    // these calls verify and factor a pose; they cannot repair the trajectory.
    phase = 'numeric'
    for (const reference of solveOrder(checked)) {
      const scope = scopedDocument(checked, reference)
      const result = withSnapshot(scope, snapshot => {
        const resolved = snapshot.resolveActiveMates(scope).filter(item => item.scopePath.length === 0)
        const passive = snapshot.resolvePassiveGears(scope).filter(item => item.scopePath.length === 0)
        const passiveScrews = snapshot.resolvePassiveScrews(scope).filter(item => item.scopePath.length === 0)
        const passiveRackPinions = snapshot.resolvePassiveRackPinions(scope).filter(item => item.scopePath.length === 0)
        for (const item of resolved) for (const witness of resolvedAssemblyMateWitnesses(item)) snapshot.assertMateWitness(witness, scope)
        for (const item of passive) for (const witness of [item.first, item.second, item.carrier!]) snapshot.assertWitness(witness, scope)
        for (const item of passiveScrews) { snapshot.assertWitness(item.first, scope); snapshot.assertWitness(item.second, scope) }
        for (const item of passiveRackPinions) { snapshot.assertWitness(item.first, scope); snapshot.assertWitness(item.second, scope) }
        return solveRigidMates(numericProblem(scope, resolved, selected, undefined, passive, passiveScrews, passiveRackPinions), { ...selected.solver, maxIterations: 0, maxSeedPasses: 0 })
      })
      scopes.push({ definition: reference, result: summary(result) })
      if (!result.poses || !['underdefined', 'fullyDefined'].includes(result.status)) {
        return { status: 'rejected', reason: 'numeric', message: 'La trayectoria no conserva una colocación verificada: ' + result.status + '.', scopes }
      }
    }
    phase = 'verification'
    const verified = finalChecks(checked, selected, intent.component)
    if (!verified.selectedWorldPose) throw new Error('Falta la colocación nativa final del componente trasladado.')
    const translation: AssemblyTranslationWitness = { component: intent.component, drivenComponent: frame.drivenComponent, requestedPose,
      resolvedPose: verified.selectedWorldPose, clearance: stop.clearance, lengthTolerance: stop.lengthTolerance, trace }
    const preview = freeze({ status: 'ready' as const, document: checked, scopes, checks: verified.checks,
      ...(verified.tangencies.length ? { tangencies: verified.tangencies } : {}),
      ...(verified.cylinderTangencies.length ? { cylinderTangencies: verified.cylinderTangencies } : {}),
      ...(verified.sphericalTangencies.length ? { sphericalTangencies: verified.sphericalTangencies } : {}),
      ...(verified.limitDistances.length ? { limitDistances: verified.limitDistances } : {}),
      ...(verified.limitAngles.length ? { limitAngles: verified.limitAngles } : {}),
      ...(verified.limitDirectedAngles.length ? { limitDirectedAngles: verified.limitDirectedAngles } : {}),
      ...(verified.widthCentered.length ? { widthCentered: verified.widthCentered } : {}), ...(verified.symmetries.length ? { symmetries: verified.symmetries } : {}),
      ...(verified.hinges.length ? { hinges: verified.hinges } : {}), ...(verified.linePaths.length ? { linePaths: verified.linePaths } : {}), ...(verified.circularPaths.length ? { circularPaths: verified.circularPaths } : {}), ...(verified.profileCenters.length ? { profileCenters: verified.profileCenters } : {}), translation }) as AssemblySolvePreview
    previews.set(preview, { source: JSON.stringify(source), candidate: validateAssemblyDocument(checked), options: selected })
    return preview
  } catch (error) {
    return { status: 'rejected', reason: error instanceof RangeError ? 'precisionLimit' : phase,
      message: error instanceof Error ? error.message : 'No se pudo verificar la traslación hasta contacto.', scopes }
  }
}

/** A discrete local target, checked against all saved active relations. */
export function prepareAssemblyMovePreview(input: AssemblyDocument, move: AssemblyComponentMove,
  options: AssemblySolveOptions = {}): AssemblySolvePreview | AssemblySolveRejection {
  return prepare(input, options, { frame: 'local', request: move })
}
/**
 * Explicit local rotation intent retains complete turns. Every target is based
 * on the original declaration, while accepted poses/lifts feed the next solve.
 * Only the final detached capability escapes; no intermediate history applies.
 * This verifies stations, not the continuous path or collision avoidance.
 */
export function prepareAssemblyMotionPreview(input: AssemblyDocument, request: AssemblyComponentMotion,
  options: AssemblySolveOptions = {}): AssemblySolvePreview | AssemblySolveRejection {
  let scopes: AssemblyScopeSolveReport[] = [], phase: AssemblySolveRejection['reason'] = 'reference'
  try {
    const source = validateAssemblyDocument(input), plan = planAssemblyComponentMotion(source, request), selected = policy(options)
    let previous = validateAssemblyDocument(source), evaluatedAngle = 0, verifiedStations = 0
    let movement: AssemblyMovementWitness | undefined, checks: RigidMateEvaluation['checks'] = [], tangencies: AssemblyTangentSupportReport[] = [], cylinderTangencies: AssemblyCylinderTangencySupportReport[] = [], sphericalTangencies: AssemblySphericalTangencySupportReport[] = [], limitDistances: AssemblyLimitDistanceSupportReport[] = [], limitAngles: AssemblyLimitAngleSupportReport[] = [], limitDirectedAngles: AssemblyLimitDirectedAngleSupportReport[] = [], widthCentered: AssemblyWidthCenteredSupportReport[] = []
    let symmetries: AssemblySymmetrySupportReport[] = []
    let profileCenters: AssemblyProfileCenterSupportReport[] = []
    let linePaths: AssemblyLinePathSupportReport[] = []
    let hinges: AssemblyHingeSupportReport[] = []
    let circularPaths: AssemblyCircularPathSupportReport[] = []
    // Part definitions remain local and immutable during this request. Each
    // station still gets new document-bound witnesses and native checks.
    const rejected = withAssemblyGeometryReuse(source, snapshots => {
      for (let index = 1; index <= plan.stationCount; index++) {
        const station = prepare(previous, selected, { frame: 'local', request: plan.atStation(index) }, true, snapshots)
        if (station.status === 'rejected') return { ...station, message: `Estación ${index}/${plan.stationCount}: ${station.message}` }
        try {
          // Use worker-owned candidate data; even a frozen DTO is not authority.
          const next = validateAssemblyDocument(authority(station, previous).candidate)
          scopes = structuredClone(station.scopes) as AssemblyScopeSolveReport[]
          phase = 'verification'
          const driver = node(next, plan.scope).occurrences.find(value => value.id === plan.occurrenceId)
          if (!driver || driver.fixed || driver.suppressed || key(driver.definition) !== key(plan.component.definition)
            || station.movement?.frame !== 'local') throw new Error('La estación no conserva el componente local dirigido.')
          const measured = measureAssemblyComponentMotionAngle(plan.startPose.rotation, plan.request.rotation.axis,
            driver.pose.rotation, evaluatedAngle, selected.angleTolerance)
          const expected = plan.request.rotation.angle * (index / plan.stationCount), residual = Math.abs(measured - expected)
          if (!Number.isFinite(residual) || residual > selected.angleTolerance) throw new Error('La estación no conserva el giro local firmado solicitado dentro de su tolerancia.')
          evaluatedAngle = measured; previous = next; verifiedStations++
          movement = structuredClone(station.movement) as AssemblyMovementWitness
          checks = structuredClone(station.checks) as RigidMateEvaluation['checks']
          tangencies = structuredClone(station.tangencies ?? []) as AssemblyTangentSupportReport[]
          cylinderTangencies = structuredClone(station.cylinderTangencies ?? []) as AssemblyCylinderTangencySupportReport[]
          sphericalTangencies = structuredClone(station.sphericalTangencies ?? []) as AssemblySphericalTangencySupportReport[]
          limitDistances = structuredClone(station.limitDistances ?? []) as AssemblyLimitDistanceSupportReport[]
          limitAngles = structuredClone(station.limitAngles ?? []) as AssemblyLimitAngleSupportReport[]
          limitDirectedAngles = structuredClone(station.limitDirectedAngles ?? []) as AssemblyLimitDirectedAngleSupportReport[]
          widthCentered = structuredClone(station.widthCentered ?? []) as AssemblyWidthCenteredSupportReport[]
          symmetries = structuredClone(station.symmetries ?? []) as AssemblySymmetrySupportReport[]
          profileCenters = structuredClone(station.profileCenters ?? []) as AssemblyProfileCenterSupportReport[]
          linePaths = structuredClone(station.linePaths ?? []) as AssemblyLinePathSupportReport[]
          hinges = structuredClone(station.hinges ?? []) as AssemblyHingeSupportReport[]
          circularPaths = structuredClone(station.circularPaths ?? []) as AssemblyCircularPathSupportReport[]
        } finally { discardAssemblySolvePreview(station) }
        phase = 'reference'
      }
    })
    if (rejected) return rejected
    phase = 'verification'
    if (!movement || verifiedStations !== plan.stationCount) throw new Error('El movimiento no verificó todas las estaciones solicitadas.')
    const windingResidual = Math.abs(evaluatedAngle - plan.request.rotation.angle)
    if (!Number.isFinite(windingResidual) || windingResidual > selected.angleTolerance) throw new Error('La verificación final no conserva las vueltas completas solicitadas.')
    const motion: AssemblyMotionWitness = { ...movement, frame: 'local', component: structuredClone(plan.component),
      drivenComponent: structuredClone(plan.component), scope: { ...plan.scope }, targetPose: validateRigidPose(plan.targetPose),
      affectedPaths: plan.affectedPaths.map(path => [...path]), axis: plan.request.rotation.axis, requestedAngle: plan.request.rotation.angle,
      evaluatedAngle, windingResidual, windingTolerance: selected.angleTolerance, stationCount: plan.stationCount,
      verifiedStations, maxAngularStep: plan.maxAngularStep, sampledOnly: true }
    const preview = freeze({ status: 'ready' as const, document: previous, scopes, checks,
      ...(tangencies.length ? { tangencies } : {}), ...(cylinderTangencies.length ? { cylinderTangencies } : {}),
      ...(sphericalTangencies.length ? { sphericalTangencies } : {}), ...(limitDistances.length ? { limitDistances } : {}),
      ...(limitAngles.length ? { limitAngles } : {}), ...(limitDirectedAngles.length ? { limitDirectedAngles } : {}), ...(widthCentered.length ? { widthCentered } : {}), ...(symmetries.length ? { symmetries } : {}),
      ...(hinges.length ? { hinges } : {}), ...(linePaths.length ? { linePaths } : {}), ...(circularPaths.length ? { circularPaths } : {}), ...(profileCenters.length ? { profileCenters } : {}), movement, motion }) as AssemblySolvePreview
    // A complete turn may keep every pose unchanged while advancing lifted
    // gear state. Authenticate the original source without a pose-change gate.
    previews.set(preview, { source: JSON.stringify(source), candidate: validateAssemblyDocument(previous), options: selected })
    return preview
  } catch (error) {
    return { status: 'rejected', reason: error instanceof RangeError ? 'precisionLimit' : phase,
      message: error instanceof Error ? error.message : 'No se pudo verificar el movimiento angular.', scopes }
  }
}
/** Move the root rigid owner so that the selected exact component reaches a world target. */
export function prepareAssemblyWorldMovePreview(input: AssemblyDocument, move: AssemblyWorldComponentMove,
  options: AssemblySolveOptions = {}): AssemblySolvePreview | AssemblySolveRejection {
  return prepare(input, options, { frame: 'world', request: move })
}
/** Project a discrete pointer objective while keeping every active saved mate hard. */
export function prepareAssemblyDragPreview(input: AssemblyDocument, drag: AssemblyComponentDrag,
  options: AssemblySolveOptions = {}): AssemblySolvePreview | AssemblySolveRejection {
  return prepare(input, options, { frame: 'projection', request: drag })
}
type MovementRequest = { frame: 'local'; request: AssemblyComponentMove } | { frame: 'world'; request: AssemblyWorldComponentMove }
  | { frame: 'projection'; request: AssemblyComponentDrag }
type StrictMovementPlan = { frame: 'local'; plan: AssemblyComponentMovePlan } | { frame: 'world'; plan: AssemblyWorldComponentMovePlan }
type MovementPlan = StrictMovementPlan | { frame: 'projection'; plan: AssemblyWorldComponentMovePlan; mode: AssemblyComponentDrag['mode'] }
type ProjectionReady = Extract<RigidMateProjectionResult, { status: 'ready' }>
function verifiedMovement(candidate: AssemblyDocument, movement: StrictMovementPlan, options: ReturnType<typeof policy>, selectedWorldPose?: RigidPose): AssemblyMovementWitness {
  const { plan } = movement, drivenComponent = movement.frame === 'local' ? plan.component : movement.plan.drivenComponent
  const occurrence = node(candidate, plan.scope).occurrences.find(item => item.id === plan.occurrenceId)
  if (!occurrence || occurrence.suppressed || occurrence.fixed || key(occurrence.definition) !== key(drivenComponent.definition)) {
    throw new Error('La ocurrencia dirigida ya no coincide con la declaración seleccionada.')
  }
  if (movement.frame === 'world' && !selectedWorldPose) throw new Error('No se verificó el marco global de la selección dirigida.')
  const resolvedPose = validateRigidPose(movement.frame === 'local' ? occurrence.pose : selectedWorldPose)
  const targetPose = validateRigidPose(movement.frame === 'local' ? movement.plan.pose : movement.plan.targetPose)
  const lengthResidual = Math.hypot(...resolvedPose.translation.map((value, axis) => value - targetPose.translation[axis]))
  // Normalize through the proper-pose operations and avoid translation arithmetic
  // in the angular check. atan2 is stable at zero/pi and invariant to q versus -q.
  const relative = composeRigidPoses(inverseRigidPose({ translation: [0, 0, 0], rotation: targetPose.rotation }),
    { translation: [0, 0, 0], rotation: resolvedPose.rotation }).rotation
  const angleResidual = 2 * Math.atan2(Math.hypot(relative[0], relative[1], relative[2]), Math.abs(relative[3]))
  if (!Number.isFinite(lengthResidual) || !Number.isFinite(angleResidual)
    || lengthResidual > options.lengthTolerance || angleResidual > options.angleTolerance) {
    throw new Error('La colocación resuelta no conserva el objetivo ' + (movement.frame === 'local' ? 'local' : 'global') + ' solicitado dentro de las tolerancias.')
  }
  return { frame: movement.frame, component: structuredClone(plan.component), drivenComponent: structuredClone(drivenComponent), scope: { ...plan.scope }, targetPose, resolvedPose,
    affectedPaths: plan.affectedPaths.map(path => [...path]), lengthResidual, angleResidual,
    lengthTolerance: options.lengthTolerance, angleTolerance: options.angleTolerance, temporaryAnchor: true }
}
function poseResiduals(actual: RigidPose, expected: RigidPose): { positionResidual: number; angleResidual: number } {
  const a = validateRigidPose(actual), b = validateRigidPose(expected)
  const positionResidual = Math.hypot(...a.translation.map((value, axis) => value - b.translation[axis]))
  const relative = composeRigidPoses(inverseRigidPose({ translation: [0, 0, 0], rotation: b.rotation }),
    { translation: [0, 0, 0], rotation: a.rotation }).rotation
  const angleResidual = 2 * Math.atan2(Math.hypot(relative[0], relative[1], relative[2]), Math.abs(relative[3]))
  if (!Number.isFinite(positionResidual) || !Number.isFinite(angleResidual)) throw new RangeError('La diferencia entre colocaciones excede la precisión finita.')
  return { positionResidual, angleResidual }
}
function activePoseChange(source: AssemblyDocument, candidate: AssemblyDocument, options: ReturnType<typeof policy>): boolean {
  for (const reference of solveOrder(candidate)) {
    const before = node(source, reference), after = node(candidate, reference)
    for (const occurrence of after.occurrences) if (!occurrence.suppressed) {
      const previous = before.occurrences.find(value => value.id === occurrence.id)
      if (!previous) throw new Error('Una declaración activa cambió de identidad durante la proyección.')
      const error = poseResiduals(occurrence.pose, previous.pose)
      if (error.positionResidual > options.lengthTolerance || error.angleResidual > options.angleTolerance) return true
    }
  }
  return false
}
function verifiedProjection(candidate: AssemblyDocument, movement: Extract<MovementPlan, { frame: 'projection' }>,
  numeric: ProjectionReady | undefined, options: ReturnType<typeof policy>, selectedWorldPose?: RigidPose): AssemblyProjectionWitness {
  if (!numeric || !selectedWorldPose) throw new Error('No se verificó el resultado global de la proyección.')
  const { plan } = movement, owner = node(candidate, plan.scope).occurrences.find(item => item.id === plan.occurrenceId)
  if (!owner || owner.suppressed || owner.fixed || key(owner.definition) !== key(plan.drivenComponent.definition)) {
    throw new Error('El propietario rígido proyectado ya no coincide con la selección.')
  }
  const resolvedPose = validateRigidPose(selectedWorldPose), requestedPose = validateRigidPose(plan.targetPose)
  const agreement = poseResiduals(resolvedPose, numeric.resolvedPose), requestAgreement = poseResiduals(numeric.requestedPose, requestedPose)
  if (agreement.positionResidual > options.lengthTolerance || agreement.angleResidual > options.angleTolerance
    || requestAgreement.positionResidual > options.lengthTolerance || requestAgreement.angleResidual > options.angleTolerance) {
    throw new Error('La verificación nativa no conserva el resultado o el objetivo global de la proyección.')
  }
  const evidence = structuredClone(numeric.evidence)
  if (evidence.localOnly !== true || !['target', 'stationary', 'immobile'].includes(evidence.convergence)
    || Object.values(evidence).some(value => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
    throw new Error('La proyección no devolvió evidencia numérica finita y local.')
  }
  return { frame: 'world', component: structuredClone(plan.component), drivenComponent: structuredClone(plan.drivenComponent),
    scope: { ...plan.scope }, mode: movement.mode, requestedPose, resolvedPose, affectedPaths: plan.affectedPaths.map(path => [...path]),
    ...poseResiduals(resolvedPose, requestedPose), lengthTolerance: options.lengthTolerance, angleTolerance: options.angleTolerance,
    evidence, temporaryAnchor: false }
}
function prepare(input: AssemblyDocument, options: AssemblySolveOptions, movement?: MovementRequest,
  refineAngularResiduals = false, snapshots?: AssemblySnapshotRunner): AssemblySolvePreview | AssemblySolveRejection {
  const scopes: AssemblyScopeSolveReport[] = []
  let phase: AssemblySolveRejection['reason'] = 'reference'
  try {
    const source = validateAssemblyDocument(input)
    const selected = policy(options, movement?.frame === 'projection')
    const numericalAngleTolerance = refineAngularResiduals ? selected.angleTolerance / 10 : selected.angleTolerance
    if (!Number.isFinite(numericalAngleTolerance) || numericalAngleTolerance <= 0) throw new RangeError('La precisión angular interna de la estación no es representable.')
    verifyInitialGearState(source, selected, snapshots)
    let movementPlan: MovementPlan | undefined
    if (movement?.frame === 'projection') {
      const drag = validateAssemblyComponentDrag(movement.request)
      movementPlan = { frame: 'projection', plan: planAssemblyWorldComponentMove(source, { component: drag.component, pose: drag.pose }), mode: drag.mode }
    } else movementPlan = movement === undefined ? undefined : movement.frame === 'local'
      ? { frame: 'local', plan: planAssemblyComponentMove(source, movement.request) }
      : { frame: 'world', plan: planAssemblyWorldComponentMove(source, movement.request) }
    const plan = movementPlan?.plan
    const candidate = plan ? plan.document : validateAssemblyDocument(source)
    let projected: ProjectionReady | undefined
    for (const reference of solveOrder(candidate)) {
      if (movementPlan?.frame === 'world' && key(reference) === key(movementPlan.plan.scope)) {
        // Child relations can change the selected-to-root relative frame. Read it
        // only after their solves, then drive the entire root rigid occurrence.
        const frame = prepareAssemblyDragFrame(candidate, movementPlan.plan.component)
        if (JSON.stringify(frame.drivenComponent.occurrencePath) !== JSON.stringify(movementPlan.plan.drivenComponent.occurrencePath)
          || key(frame.drivenComponent.definition) !== key(movementPlan.plan.drivenComponent.definition)) {
          throw new Error('El propietario rígido global de la selección cambió.')
        }
        const owner = candidate.occurrences.find(item => item.id === movementPlan.plan.occurrenceId)
        if (!owner) throw new Error('La ocurrencia rígida dirigida ya no existe.')
        owner.pose = composeRigidPoses(movementPlan.plan.targetPose, inverseRigidPose(frame.relativePose))
      }
      const scope = scopedDocument(candidate, reference), anchor = movementPlan?.frame !== 'projection' && plan && key(reference) === key(plan.scope) ? plan.occurrenceId : undefined
      const result = withSnapshot(scope, snapshot => {
        // Children were solved in their own definition frames. A parent solves
        // only its own declarations, never flattens fixed flags into world.
        const resolved = snapshot.resolveActiveMates(scope).filter(item => item.scopePath.length === 0)
        const passive = snapshot.resolvePassiveGears(scope).filter(item => item.scopePath.length === 0)
        const passiveScrews = snapshot.resolvePassiveScrews(scope).filter(item => item.scopePath.length === 0)
        const passiveRackPinions = snapshot.resolvePassiveRackPinions(scope).filter(item => item.scopePath.length === 0)
        for (const item of resolved) for (const witness of resolvedAssemblyMateWitnesses(item)) snapshot.assertMateWitness(witness, scope)
        for (const item of passive) for (const witness of [item.first, item.second, item.carrier!]) snapshot.assertWitness(witness, scope)
        for (const item of passiveScrews) { snapshot.assertWitness(item.first, scope); snapshot.assertWitness(item.second, scope) }
        for (const item of passiveRackPinions) { snapshot.assertWitness(item.first, scope); snapshot.assertWitness(item.second, scope) }
        phase = 'numeric'
        let result: RigidMateSolveResult
        if (movementPlan?.frame === 'projection' && key(reference) === key(movementPlan.plan.scope)) {
          const frame = prepareAssemblyDragFrame(scope, movementPlan.plan.component)
          if (JSON.stringify(frame.drivenComponent.occurrencePath) !== JSON.stringify(movementPlan.plan.drivenComponent.occurrencePath)
            || key(frame.drivenComponent.definition) !== key(movementPlan.plan.drivenComponent.definition)) {
            throw new Error('El propietario rígido global de la selección cambió antes de proyectar.')
          }
          const projection = projectRigidMateTarget(continueGearIntent(numericProblem(scope, resolved, selected, undefined, passive, passiveScrews, passiveRackPinions), node(source, reference)), { bodyId: movementPlan.plan.occurrenceId,
            frame: validateRigidPose(frame.relativePose), targetPose: validateRigidPose(movementPlan.plan.targetPose), mode: movementPlan.mode },
          { ...selected.projection, solver: selected.solver })
          if (projection.status !== 'ready') {
            if (projection.result) scopes.push({ definition: reference, result: summary(projection.result) })
            throw new Error(projection.message)
          }
          projected = projection; result = projection.result
        } else {
          const problem = continueGearIntent(numericProblem(scope, resolved, selected, anchor, passive, passiveScrews, passiveRackPinions), node(source, reference))
          // Fixed relations retain the public band; variable groups still
          // refine angular convergence without changing the iteration budgets.
          result = solveRigidMates(problem, refineAngularResiduals ? { ...selected.solver,
            angleRefinementTolerance: Math.min(numericalAngleTolerance, selected.solver?.angleRefinementTolerance ?? numericalAngleTolerance) } : selected.solver)
        }
        for (const item of resolved) for (const witness of resolvedAssemblyMateWitnesses(item)) snapshot.assertMateWitness(witness, scope)
        return result
      }, snapshots)
      scopes.push({ definition: reference, result: summary(result), ...(anchor === undefined ? {} : { temporaryAnchor: { occurrenceId: anchor } }) })
      if (!result.poses || !['underdefined', 'fullyDefined'].includes(result.status)) {
        return { status: 'rejected', reason: 'numeric', message: 'No se aplicaron posiciones: ' + result.status + '.', scopes }
      }
      const target = node(candidate, reference)
      for (const [id, angles] of result.gearAngles) {
        const mate = target.mates.find(value => value.id === id)
        if (!mate || mate.type !== 'gear') throw new Error('El estado angular derivado no pertenece a una relación de engranaje actual.')
        mate.angles = { ...angles }
      }
      for (const [id, angle] of result.screwAngles) {
        const mate = target.mates.find(value => value.id === id)
        if (!mate || mate.type !== 'screw') throw new Error('El estado angular derivado no pertenece a un tornillo actual.')
        mate.angle = angle
      }
      for (const [id, angle] of result.rackPinionAngles) {
        const mate = target.mates.find(value => value.id === id)
        if (!mate || mate.type !== 'rack-pinion') throw new Error('El estado angular derivado no pertenece a una cremallera actual.')
        mate.angle = angle
      }
      for (const occurrence of target.occurrences) if (!occurrence.suppressed) {
        const pose = result.poses.get(occurrence.id)
        if (!pose) throw new Error('El solver no devolvió la colocación de una ocurrencia activa.')
        occurrence.pose = validateRigidPose(pose)
      }
      phase = 'reference'
    }
    phase = 'verification'
    const checked = validateAssemblyDocument(candidate)
    assertUnavailableAssemblyGearCoordinates(source, checked, snapshots)
    if (movementPlan?.frame === 'projection' && !activePoseChange(source, checked, selected)) {
      return { status: 'rejected', reason: 'numeric', message: 'No hay movimiento compatible con las relaciones para este destino.', scopes }
    }
    const verified = finalChecks(checked, selected, movementPlan && movementPlan.frame !== 'local' ? movementPlan.plan.component : undefined, snapshots), checks = verified.checks
    const movementWitness = movementPlan && movementPlan.frame !== 'projection' ? verifiedMovement(checked, movementPlan, selected, verified.selectedWorldPose) : undefined
    const projectionWitness = movementPlan?.frame === 'projection' ? verifiedProjection(checked, movementPlan, projected, selected, verified.selectedWorldPose) : undefined
    const preview = freeze({ status: 'ready' as const, document: checked, scopes, checks,
      ...(verified.tangencies.length ? { tangencies: verified.tangencies } : {}),
      ...(verified.cylinderTangencies.length ? { cylinderTangencies: verified.cylinderTangencies } : {}),
      ...(verified.sphericalTangencies.length ? { sphericalTangencies: verified.sphericalTangencies } : {}),
      ...(verified.limitDistances.length ? { limitDistances: verified.limitDistances } : {}),
      ...(verified.limitAngles.length ? { limitAngles: verified.limitAngles } : {}),
      ...(verified.limitDirectedAngles.length ? { limitDirectedAngles: verified.limitDirectedAngles } : {}),
      ...(verified.widthCentered.length ? { widthCentered: verified.widthCentered } : {}),
      ...(verified.symmetries.length ? { symmetries: verified.symmetries } : {}),
      ...(verified.hinges.length ? { hinges: verified.hinges } : {}), ...(verified.linePaths.length ? { linePaths: verified.linePaths } : {}), ...(verified.circularPaths.length ? { circularPaths: verified.circularPaths } : {}), ...(verified.profileCenters.length ? { profileCenters: verified.profileCenters } : {}),
      ...(movementWitness ? { movement: movementWitness } : {}), ...(projectionWitness ? { projection: projectionWitness } : {}) }) as AssemblySolvePreview
    previews.set(preview, { source: JSON.stringify(source), candidate: validateAssemblyDocument(checked), options: selected })
    return preview
  } catch (error) {
    return { status: 'rejected', reason: error instanceof RangeError ? 'precisionLimit' : phase,
      message: error instanceof Error ? error.message : 'No se pudo resolver el ensamblaje.', scopes }
  }
}
function authority(preview: AssemblySolvePreview, current: AssemblyDocument): PreviewAuthority {
  const value = previews.get(preview)
  if (!value) throw new Error('La vista previa no fue verificada o ya se consumió.')
  if (JSON.stringify(validateAssemblyDocument(current)) !== value.source) throw new Error('El documento cambió; vuelve a resolver antes de aplicar.')
  return value
}
export function discardAssemblySolvePreview(preview: AssemblySolvePreview): void { previews.delete(preview) }
/** A successful local capability is single-use; history changes atomically. */
export function applyAssemblySolvePreview(history: AssemblyDocumentHistory, preview: AssemblySolvePreview): AssemblyDocument {
  const current = history.current, value = authority(preview, current), candidate = validateAssemblyDocument(value.candidate)
  if (JSON.stringify(candidate) !== JSON.stringify(current)) candidate.updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString()
  const result = history.commitDocument(candidate)
  previews.delete(preview)
  return result
}
/**
 * Capture component-relative orientation from an authenticated solved preview.
 * The new saved declaration still needs a fresh preview; no translation lock
 * is added and no caller-provided quaternion is accepted as native evidence.
 */
export function captureAssemblyConcentricRotationLock(preview: AssemblySolvePreview, current: AssemblyDocument,
  mateId: string, scope: AssemblyDefinitionReference = current): AssemblyDocument {
  const value = authority(preview, current), candidate = validateAssemblyDocument(value.candidate), target = node(candidate, scope)
  const mate = target.mates.find(item => item.id === mateId)
  if (!mate || mate.type !== 'concentric' || mate.suppressed) throw new Error('Selecciona una relación concéntrica activa.')
  const originCapture = mate.first.kind === 'principal-axis' || mate.second.kind === 'principal-axis'
  const scoped = scopedDocument(candidate, scope)
  withSnapshot(scoped, snapshot => {
    const resolved = snapshot.resolveActiveMates(scoped).find(item => item.scopePath.length === 0 && item.mate.id === mateId)
    if (!resolved || !isResolvedAssemblyBinaryMate(resolved)) throw new Error('La relación concéntrica ya no tiene soportes vigentes.')
    snapshot.assertWitness(resolved.first, scoped); snapshot.assertWitness(resolved.second, scoped)
    if (originCapture && (resolved.first.componentPath[0] ?? null) === (resolved.second.componentPath[0] ?? null)) {
      throw new Error('El bloqueo de giro de origen requiere dos propietarios rígidos distintos en el ámbito actual.')
    }
    let angularError = 0
    for (const witness of [resolved.first, resolved.second]) {
      if (witness.kind !== 'support' || !(witness.origin === 'principal-axis' && witness.localSupport.kind === 'line'
        || witness.origin === 'native-face' && witness.localSupport.kind === 'cylinder')) {
        throw new Error('El bloqueo concéntrico requiere ejes de origen o caras cilíndricas actuales.')
      }
      const arithmetic = assemblyEndpointPlacementArithmetic(witness, scoped)
      angularError += 128 * Number.EPSILON * (arithmetic.depth + 2)
    }
    if (originCapture && (!Number.isFinite(angularError) || angularError > policy(value.options).angleTolerance)) {
      throw new RangeError('La captura de giro no conserva la precisión angular de las cadenas originales.')
    }
    // The capture contains only orientation. Large common translations must
    // not introduce cancellation or overflow into this relative quaternion.
    const rotation = (pose: AssemblyReadonly<RigidPose>): RigidPose => ({ translation: [0, 0, 0], rotation: [...pose.rotation] })
    mate.rotationLock = composeRigidPoses(inverseRigidPose(rotation(resolved.first.declaredWorldPose)), rotation(resolved.second.declaredWorldPose)).rotation
  })
  candidate.updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString()
  return validateAssemblyDocument(candidate)
}

/** Capture a full relative placement from current solved component frames. */
export function captureAssemblyComponentLock(preview: AssemblySolvePreview, current: AssemblyDocument,
  first: AssemblyComponentReference, second: AssemblyComponentReference, scope?: AssemblyDefinitionReference): AssemblyDocument {
  const value = authority(preview, current), solved = validateAssemblyDocument(value.candidate)
  const selectedScope = scope ?? { id: current.id, revision: current.revision }
  const candidate = applyAssemblyEdit(solved, { type: 'add-mate', scope: selectedScope,
    mate: { type: 'lock', name: 'Bloqueo de componentes', suppressed: false, first, second, relativePose: identityRigidPose() } })
  const target = node(candidate, selectedScope), mate = target.mates.at(-1)!
  if (mate.type !== 'lock') throw new Error('No se pudo preparar el bloqueo de componentes.')
  const scoped = scopedDocument(candidate, selectedScope)
  withSnapshot(scoped, snapshot => {
    const resolved = snapshot.resolveActiveMates(scoped).find(item => item.scopePath.length === 0 && item.mate.id === mate.id)
    if (!resolved || !isResolvedAssemblyBinaryMate(resolved)) throw new Error('Los componentes ya no tienen una colocación vigente.')
    snapshot.assertWitness(resolved.first, scoped); snapshot.assertWitness(resolved.second, scoped)
    mate.relativePose = composeRigidPoses(inverseRigidPose(poseCopy(resolved.first.declaredWorldPose)), poseCopy(resolved.second.declaredWorldPose))
  })
  return validateAssemblyDocument(candidate)
}

/** Capture saved gear zero frames from fresh supports of an authenticated solve. */
export function captureAssemblyGearPreview(preview: AssemblySolvePreview, current: AssemblyDocument,
  request: AssemblyGearCaptureRequest, scope: AssemblyDefinitionReference = { id: current.id, revision: current.revision }): AssemblyDocument {
  const value = authority(preview, current), solved = validateAssemblyDocument(value.candidate)
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(request))) throw new Error('El engranaje necesita una solicitud de datos.')
  const fields: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(request)) {
    const field = Object.getOwnPropertyDescriptor(request, key)!
    if (typeof key !== 'string' || !['first', 'second', 'carrier', 'ratio', 'direction', 'name', 'phase'].includes(key)
      || !field.enumerable || !('value' in field)) throw new Error('La captura de engranaje no admite campos desconocidos ni accesores.')
    fields[key] = field.value
  }
  for (const key of ['first', 'second', 'carrier', 'ratio', 'direction', 'name']) if (!Object.hasOwn(fields, key)) throw new Error('Faltan campos de captura del engranaje.')
  const candidate = applyAssemblyEdit(solved, { type: 'add-mate', scope,
    mate: { type: 'gear', first: fields.first, second: fields.second, carrier: fields.carrier,
      ratio: fields.ratio, direction: fields.direction, name: fields.name, suppressed: false,
      neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: { first: 0, second: 0 },
      phase: Object.hasOwn(fields, 'phase') ? fields.phase : 0 } as Extract<AssemblyMate, { type: 'gear' }> })
  const target = node(candidate, scope), mate = target.mates.at(-1)!
  if (mate.type !== 'gear') throw new Error('No se pudo declarar el engranaje.')
  const scoped = scopedDocument(candidate, scope)
  withSnapshot(scoped, snapshot => {
    const resolved = snapshot.resolveActiveMates(scoped).find(item => item.scopePath.length === 0 && item.mate.id === mate.id)
    if (!resolved || !isResolvedAssemblyBinaryMate(resolved) || !resolved.carrier) throw new Error('El engranaje necesita dos ejes y un portador nativo vigente.')
    for (const witness of [resolved.first, resolved.second, resolved.carrier]) snapshot.assertWitness(witness, scoped)
    if (resolved.first.kind !== 'support' || resolved.second.kind !== 'support'
      || resolved.first.localSupport.kind !== 'cylinder' || resolved.second.localSupport.kind !== 'cylinder') throw new Error('Selecciona dos caras cilíndricas actuales.')
    if (JSON.stringify(resolved.first.componentPath) === JSON.stringify(resolved.second.componentPath)) throw new Error('Selecciona dos ocurrencias de pieza distintas para el engranaje.')
    const carrier = inverseRigidPose(poseCopy(resolved.carrier.declaredWorldPose))
    mate.neutralRotations = { first: composeRigidPoses(carrier, poseCopy(resolved.first.declaredWorldPose)).rotation,
      second: composeRigidPoses(carrier, poseCopy(resolved.second.declaredWorldPose)).rotation }
  })
  return validateAssemblyDocument(candidate)
}

/** Privately align native axes, then capture the actual relative zero before the final solve. */
export function captureAssemblyScrewPreview(preview: AssemblySolvePreview, current: AssemblyDocument,
  request: AssemblyScrewCaptureRequest, scope: AssemblyDefinitionReference = { id: current.id, revision: current.revision }): AssemblyDocument {
  const value = authority(preview, current), solved = validateAssemblyDocument(value.candidate)
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(request))) throw new Error('El tornillo necesita una solicitud de datos.')
  const fields: Record<string, unknown> = Object.create(null), names = ['first', 'second', 'lead', 'reverse', 'alignment', 'name']
  for (const name of Reflect.ownKeys(request)) {
    const field = Object.getOwnPropertyDescriptor(request, name)!
    if (typeof name !== 'string' || !names.includes(name) || !field.enumerable || !('value' in field)) throw new Error('La captura de tornillo no admite campos desconocidos ni accesores.')
    fields[name] = field.value
  }
  if (names.some(name => !Object.hasOwn(fields, name))) throw new Error('Faltan campos de captura del tornillo.')
  const data = validateAssemblyScrewData({ lead: fields.lead, reverse: fields.reverse, alignment: fields.alignment,
    neutralRotation: [0, 0, 0, 1], angle: 0, neutralTravel: 0 })
  const temporary = applyAssemblyEdit(solved, { type: 'add-mate', scope, mate: { type: 'concentric', first: fields.first,
    second: fields.second, alignment: data.alignment, rotationLock: null, name: fields.name, suppressed: false } as Extract<AssemblyMate, { type: 'concentric' }> })
  // The editing boundary has validated plain scope data; detach it before native callbacks.
  scope = { id: scope.id, revision: scope.revision }
  const temporaryMate = node(temporary, scope).mates.at(-1)!
  if (temporaryMate.type !== 'concentric' || temporaryMate.first.kind !== 'face' || temporaryMate.second.kind !== 'face'
    || temporaryMate.first.support !== 'axis' || temporaryMate.second.support !== 'axis') throw new Error('El tornillo requiere dos ejes de caras cilíndricas.')
  const references = { first: temporaryMate.first, second: temporaryMate.second }
  const beforeScope = scopedDocument(temporary, scope)
  withSnapshot(beforeScope, snapshot => {
    const first = snapshot.resolveReference(beforeScope, references.first), second = snapshot.resolveReference(beforeScope, references.second)
    snapshot.assertWitness(first, beforeScope); snapshot.assertWitness(second, beforeScope)
    if (first.kind !== 'support' || second.kind !== 'support' || first.localSupport.kind !== 'cylinder' || second.localSupport.kind !== 'cylinder') throw new Error('Selecciona dos caras cilíndricas actuales.')
    if (JSON.stringify(first.componentPath) === JSON.stringify(second.componentPath)) throw new Error('Selecciona dos ocurrencias de pieza distintas para el tornillo.')
  })
  const aligned = prepareAssemblySolve(temporary, value.options)
  if (aligned.status !== 'ready') throw new Error('No se pudieron alinear los ejes del tornillo: ' + aligned.message)
  try {
    const candidate = validateAssemblyDocument(authority(aligned, temporary).candidate), target = node(candidate, scope)
    const index = target.mates.findIndex(mate => mate.id === temporaryMate.id), scoped = scopedDocument(candidate, scope)
    const screw: Extract<AssemblyMate, { type: 'screw' }> = { id: temporaryMate.id, name: temporaryMate.name, suppressed: false,
      type: 'screw', first: structuredClone(references.first), second: structuredClone(references.second), ...data }
    withSnapshot(scoped, snapshot => {
      const first = snapshot.resolveReference(scoped, screw.first), second = snapshot.resolveReference(scoped, screw.second)
      snapshot.assertWitness(first, scoped); snapshot.assertWitness(second, scoped)
      screw.neutralRotation = composeRigidPoses(inverseRigidPose(poseCopy(second.declaredWorldPose)), poseCopy(first.declaredWorldPose)).rotation
      const fixed = (witness: AssemblyEndpointWitness): RigidMateEndpoint => ({ bodyId: null, frame: poseCopy(witness.declaredWorldPose), support: supportCopy(witness) })
      const numeric = constraint(screw, screw.id, fixed(first), fixed(second))
      if (numeric.type !== 'screw') throw new Error('Falta el origen del tornillo alineado.')
      screw.neutralTravel = rigidScrewCoordinates(numeric, new Map(), value.options.angleTolerance ?? 1e-8,
        conditioning(scoped, [{ scopePath: [], mate: screw, first, second }], value.options.lengthTolerance ?? 1e-6)).travel
    })
    if (index < 0) throw new Error('La relación de alineación del tornillo ya no existe.')
    target.mates[index] = screw
    return validateAssemblyDocument(candidate)
  } finally { discardAssemblySolvePreview(aligned) }
}

/** Capture relative rack/pinion coordinates; this operation adds no geometric guide or alignment. */
export function captureAssemblyRackPinionPreview(preview: AssemblySolvePreview, current: AssemblyDocument,
  request: AssemblyRackPinionCaptureRequest, scope: AssemblyDefinitionReference = { id: current.id, revision: current.revision }): AssemblyDocument {
  const value = authority(preview, current), solved = validateAssemblyDocument(value.candidate)
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(request))) throw new Error('La cremallera necesita una solicitud de datos.')
  const fields: Record<string, unknown> = Object.create(null), names = ['first', 'second', 'conversion', 'reverse', 'name']
  for (const name of Reflect.ownKeys(request)) {
    const field = Object.getOwnPropertyDescriptor(request, name)!
    if (typeof name !== 'string' || !names.includes(name) || !field.enumerable || !('value' in field)) throw new Error('La captura de cremallera no admite campos desconocidos ni accesores.')
    fields[name] = field.value
  }
  if (names.some(name => !Object.hasOwn(fields, name))) throw new Error('Faltan campos de captura de la cremallera.')
  const data = validateAssemblyRackPinionData({ conversion: fields.conversion, reverse: fields.reverse,
    neutralRotation: [0, 0, 0, 1], angle: 0, neutralTravel: 0 })
  const candidate = applyAssemblyEdit(solved, { type: 'add-mate', scope, mate: { type: 'rack-pinion', first: fields.first,
    second: fields.second, name: fields.name, suppressed: false, ...data } as Extract<AssemblyMate, { type: 'rack-pinion' }> })
  scope = { id: scope.id, revision: scope.revision }
  const target = node(candidate, scope), mate = target.mates.at(-1)!
  if (mate.type !== 'rack-pinion') throw new Error('No se pudo declarar la cremallera.')
  const scoped = scopedDocument(candidate, scope)
  withSnapshot(scoped, snapshot => {
    const first = snapshot.resolveReference(scoped, mate.first), second = snapshot.resolveReference(scoped, mate.second)
    snapshot.assertWitness(first, scoped); snapshot.assertWitness(second, scoped)
    if (first.kind !== 'support' || first.localSupport.kind !== 'cylinder' || second.kind !== 'support'
      || second.localSupport.kind !== 'line' && second.localSupport.kind !== 'cylinder') throw new Error('Selecciona un eje cilíndrico de piñón y una arista LINE o eje cilíndrico de cremallera.')
    if (JSON.stringify(first.componentPath) === JSON.stringify(second.componentPath)) throw new Error('Selecciona dos ocurrencias de pieza distintas para la cremallera y piñón.')
    mate.neutralRotation = composeRigidPoses(inverseRigidPose(poseCopy(second.declaredWorldPose)), poseCopy(first.declaredWorldPose)).rotation
    const fixed = (witness: AssemblyEndpointWitness): RigidMateEndpoint => ({ bodyId: null, frame: poseCopy(witness.declaredWorldPose), support: supportCopy(witness) })
    const numeric = constraint(mate, mate.id, fixed(first), fixed(second))
    if (numeric.type !== 'rack-pinion') throw new Error('Falta el origen de la cremallera.')
    mate.neutralTravel = rigidRackPinionCoordinates(numeric, new Map(), value.options.angleTolerance ?? 1e-8,
      conditioning(scoped, [{ scopePath: [], mate, first, second }], value.options.lengthTolerance ?? 1e-6)).travel
  })
  return validateAssemblyDocument(candidate)
}
