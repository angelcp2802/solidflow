import type { Vec3 } from '../cad/kernel.types'
import type { Quaternion, RigidPose } from './rigidPose'
import type { AssemblyGearAngles, AssemblyGearData } from './assemblyGear'
import type { AssemblyScrewData } from './assemblyScrew'
import type { AssemblyRackPinionData } from './assemblyRackPinion'
import type { AssemblyDirectionAlignment } from './assemblyDirectionMates'
import type { AssemblyTangentSide } from './assemblyTangentMates'
import type { AssemblyCylinderTangentBranch } from './assemblyCylinderTangentMates'
import type { AssemblySphereTangentBranch } from './assemblySphereTangentMates'
import type { AssemblyLimitDistanceActivity, AssemblyLimitDistanceLimits } from './assemblyLimitDistance'
import type { AssemblyLimitAngleActivity, AssemblyLimitAngleLimits, AssemblyLimitAngleStratum } from './assemblyLimitAngle'
import type { AssemblyDirectedAngleArc, AssemblyDirectedAngleArcEvaluation } from './assemblyLimitDirectedAngle'
import type { PlaneBisectorBranch } from './assemblyPlaneBisectors'

export interface NumericSphereSupport { kind: 'sphere'; point: Vec3; radius: number; tolerance: number }
export interface NumericPointSupport { kind: 'point'; point: Vec3; tolerance: number }

/** Numerical input only. Native reference authority belongs to the CAD adapter. */
export type RigidMateSupport =
  | NumericSphereSupport
  | NumericPointSupport
  | { kind: 'plane'; point: Vec3; normal: Vec3; xDirection: Vec3; tolerance: number }
  | { kind: 'line'; point: Vec3; axis: Vec3; tolerance: number }
  | { kind: 'cylinder'; point: Vec3; axis: Vec3; xDirection: Vec3; radius: number; tolerance: number }
export interface RigidSolverBody { id: string; pose: RigidPose; fixed: boolean }
export interface RigidMateEndpoint {
  /** Null is the solve scope's fixed frame. IDs name rigid top-level occurrences. */
  bodyId: string | null
  /** Component frame relative to the rigid owner; nested placements stay local. */
  frame: RigidPose
  support?: RigidMateSupport
}
interface ConstraintBase { id: string; first: RigidMateEndpoint; second: RigidMateEndpoint }
export type RigidBinaryMateConstraint = ConstraintBase & (
  | { type: 'concentric'; alignment: 'aligned' | 'opposed'; rotationLock: Quaternion | null }
  | { type: 'coincident'; alignment: 'aligned' | 'opposed' }
  | { type: 'distance'; alignment: 'aligned' | 'opposed'; distance: number }
  | { type: 'limit-distance'; alignment: 'aligned' | 'opposed'; limits: AssemblyLimitDistanceLimits }
  | { type: 'limit-angle'; coordinate: 'principal-direction'; limits: AssemblyLimitAngleLimits }
  | { type: 'limit-directed-angle'; coordinate: 'directed-about-axis'; guide: RigidMateEndpoint; arc: AssemblyDirectedAngleArc }
  | { type: 'angle'; /** Saved target in degrees, 0..180. */ angle: number }
  | { type: 'parallel'; alignment: AssemblyDirectionAlignment }
  | { type: 'perpendicular'; alignment: AssemblyDirectionAlignment }
  | { type: 'tangent'; side: AssemblyTangentSide }
  | { type: 'skew-cylinder-tangent'; branch: AssemblyCylinderTangentBranch }
  | { type: 'parallel-cylinder-tangent'; branch: AssemblyCylinderTangentBranch }
  | { type: 'plane-sphere-tangent'; side: AssemblyTangentSide }
  | { type: 'sphere-sphere-tangent'; branch: AssemblySphereTangentBranch }
  | { type: 'cylinder-sphere-tangent'; branch: AssemblySphereTangentBranch }
  | { type: 'lock'; relativePose: RigidPose }
  | ({ type: 'gear'; carrier: RigidMateEndpoint | null } & AssemblyGearData)
  | ({ type: 'screw' } & AssemblyScrewData)
  | ({ type: 'rack-pinion' } & AssemblyRackPinionData)
)
/** Numerical plane-group intent only; no saved mate or native admission is implied. */
export interface RigidWidthCenteredConstraint {
  id: string
  type: 'width'
  mode: 'centered'
  width: [RigidMateEndpoint, RigidMateEndpoint]
  tab: [RigidMateEndpoint, RigidMateEndpoint]
  widthBranch: PlaneBisectorBranch
  tabBranch: PlaneBisectorBranch
  alignment: 'aligned' | 'opposed'
}
/** Numerical three-role reflection only; no saved/native authority. */
export interface RigidSymmetrySupportUncertainty {
  /** Includes the original placement-chain error, before any cancellation. */
  positionErrorMm: number
  directionErrorRad?: number
  radiusErrorMm?: number
}
export interface RigidSymmetryConstraint {
  id: string
  type: 'symmetry'
  source: RigidMateEndpoint
  target: RigidMateEndpoint
  mirror: RigidMateEndpoint
  alignment: 'aligned' | 'opposed' | null
  /** Ordered source/target/mirror. Explicit uncertainty never enlarges bands. */
  uncertainty?: [RigidSymmetrySupportUncertainty, RigidSymmetrySupportUncertainty, RigidSymmetrySupportUncertainty]
}
/** Explicit numerical profiles. Bounded native shape/reference proof belongs to
 * the CAD adapter; these declarations confer no saved-mate authority. */
export type NumericProfileCenterSupport = {
  kind: 'circle'; center: Vec3; normal: Vec3; positionErrorMm: number; normalErrorRad: number
} | {
  kind: 'rectangle'; center: Vec3; normal: Vec3; xDirection: Vec3;
  positionErrorMm: number; normalErrorRad: number; xDirectionErrorRad: number
}
export interface RigidProfileCenterEndpoint {
  bodyId: string | null
  frame: RigidPose
  profile: NumericProfileCenterSupport
}
export type ProfileCenterOrientation = { mode: 'free' } | { mode: 'rectangle'; quarterTurns: 0 | 1 | 2 | 3 }
export interface RigidProfileCenterConstraint {
  id: string
  type: 'profile-center'
  first: RigidProfileCenterEndpoint
  second: RigidProfileCenterEndpoint
  alignment: 'aligned' | 'opposed'
  /** cSecond - cFirst = offsetMm * nFirst. */
  offsetMm: number
  orientation: ProfileCenterOrientation
}
export interface RigidLinePathEndpoint { bodyId:string|null; frame:RigidPose; line:{start:Vec3;direction:Vec3;lengthMm:number;positionErrorMm:number;directionErrorRad:number;lengthErrorMm:number} }
export interface RigidLinePathConstraint { id:string;type:'line-path';first:RigidMateEndpoint;second:RigidLinePathEndpoint;coordinateMm:number|null; follow?:{axis:Vec3;reverse:boolean;directionErrorRad:number}; roll?:{axis:Vec3;reverse:boolean;guide:RigidMateEndpoint;directionErrorRad:number;guideDirectionErrorRad:number} }
/** Numerical material-origin circle data. The radial/tangent frame, radius and
 * sweep have separate explicit error bounds; no native topology tolerance is
 * implicitly converted to metrology or saved reference authority. */
export interface RigidCircularPathEndpoint {
  bodyId: string | null
  frame: RigidPose
  arc: { center: Vec3; radial: Vec3; tangent: Vec3; radiusMm: number; sweepRad: number;
    positionErrorMm: number; radiusErrorMm: number; frameErrorRad: number; sweepErrorRad: number }
}
export type RigidCircularPathPosition = { mode: 'free'; domain: 'trim' | 'support-circle' }
  | { mode: 'coordinate'; distanceMm: number }
export interface RigidCircularPathConstraint {
  id: string
  type: 'circular-path'
  first: RigidMateEndpoint
  second: RigidCircularPathEndpoint
  position: RigidCircularPathPosition
  follow?: RigidLinePathConstraint['follow']
  roll?: RigidLinePathConstraint['roll']
}
export interface RigidHingeUncertainty  {
  positionErrorMm: number;
  directionErrorRad: number
}
export interface RigidHingeStops {
  coordinate: 'directed-about-axis'
  angular: [RigidMateEndpoint, RigidMateEndpoint]
  arc: AssemblyDirectedAngleArc
  uncertainty?: [RigidHingeUncertainty, RigidHingeUncertainty]
}
export type RigidHingeStopMeasurement = AssemblyDirectedAngleArcEvaluation & {
  constraintId: string
  directionErrorRad: number
  projectionLengths: { first: number; second: number }
}
export interface RigidHingeConstraint  {
  id: string;
  type: 'hinge';
  axis: [RigidMateEndpoint, RigidMateEndpoint];
  axial: [RigidMateEndpoint, RigidMateEndpoint];
  uncertainty?: [RigidHingeUncertainty,RigidHingeUncertainty,RigidHingeUncertainty,RigidHingeUncertainty];
  alignment: 'aligned' | 'opposed'
  stops?: RigidHingeStops
}
export type RigidMateConstraint = RigidHingeConstraint | RigidCircularPathConstraint | RigidLinePathConstraint | RigidBinaryMateConstraint | RigidWidthCenteredConstraint | RigidSymmetryConstraint | RigidProfileCenterConstraint
export type RigidGearConstraint = Extract<RigidMateConstraint, { type: 'gear' }>
export type RigidScrewConstraint = Extract<RigidMateConstraint, { type: 'screw' }>
export type RigidRackPinionConstraint = Extract<RigidMateConstraint, { type: 'rack-pinion' }>
export interface RigidMateProblem {
  bodies: RigidSolverBody[]
  constraints: RigidMateConstraint[]
  /** Fixed conditioning frame throughout the solve. Lengths remain mm. */
  origin: Vec3
  lengthScale: number
  lengthTolerance: number
  angleTolerance: number
  /** Suppressed but resolved gears: track lifts without rows or hard incidence. */
  passiveGears?: RigidGearConstraint[]
  passiveScrews?: RigidScrewConstraint[]
  /** Suppressed rack/pinion charts track accepted relative spin without hard rows. */
  passiveRackPinions?: RigidRackPinionConstraint[]
}
export interface RigidMateRow {
  constraintId: string
  kind: 'length' | 'angle'
  /** Length residuals and tolerances are divided by lengthScale; angles are rad. */
  residual: number
  tolerance: number
  /** Columns: free bodies in input order, each [vX,vY,vZ,wX,wY,wZ]. */
  jacobian: number[]
}
export interface RigidMateDiagnostic {
  constraintId: string
  code: 'orientationChart' | 'invalidGeometry' | 'precisionLimit'
  message: string
}
export interface RigidMateInequality {
  constraintId: string
  bound: 'minimum' | 'maximum'
  /** Omitted for legacy distance rows; angular margins/precision use radians. */
  kind?: 'length' | 'angle'
  /** Length margins and precision are divided by lengthScale. */
  margin: number
  tolerance: number
  jacobian: number[]
}
export interface RigidLimitDistanceMeasurement {
  constraintId: string
  coordinate: number
  limits: AssemblyLimitDistanceLimits
  activity: AssemblyLimitDistanceActivity
  lengthTolerance: number
}
/** Current numerical measurements only; no native reference authority is conferred. */
export interface RigidWidthCenteredMeasurement {
  constraintId: string
  mode: 'centered'
  widthBranch: PlaneBisectorBranch
  tabBranch: PlaneBisectorBranch
  alignment: 'aligned' | 'opposed'
  /** Actual angle from atan2(cross magnitude, dot), in radians, not a chord defect. */
  angleRadians: number
  /** Signed anchored offset in physical millimeters. */
  offsetMm: number
  lengthTolerance: number
  angleTolerance: number
  branchLengths: { width: number; tab: number }
}
export interface RigidSymmetryMeasurement {
  constraintId: string
  entityKind: 'point' | 'line' | 'plane' | 'sphere' | 'cylinder'
  alignment: 'aligned' | 'opposed' | null
  positionErrorMm: number
  angleRadians: number | null
  radiusDifferenceMm: number | null
  lengthTolerance: number
  angleTolerance: number
}
export interface RigidProfileCenterMeasurement {
  constraintId: string
  alignment: 'aligned' | 'opposed'
  orientation: ProfileCenterOrientation
  offsetMm: number
  /** Full physical center defect, not input uncertainty. */
  positionErrorMm: number
  normalAngleRadians: number
  rectangleAngleRadians: number | null
  lengthTolerance: number
  angleTolerance: number
}
export interface RigidLimitAngleMeasurement {
  constraintId: string
  angleRadians: number
  limitsDegrees: AssemblyLimitAngleLimits
  marginsRadians: { minimum: number; maximum: number }
  angleToleranceRadians: number
  activity: AssemblyLimitAngleActivity
  stratum: AssemblyLimitAngleStratum
  domainBounds: { minimum: boolean; maximum: boolean }
}
/** Separate endpoint geometry; these are never fake scalar affine rows. */
export interface RigidAngularLimitChart {
  constraintId: string
  stratum: AssemblyLimitAngleStratum
  /** CURRENT endpoint/hemisphere defect used for bounded admitted opening. */
  openingRows?: RigidMateRow[]
  /** The saved interval is equal0 or equal180; target defect is its true kernel. */
  equalityRows?: RigidMateRow[]
}
export interface RigidMateEvaluation {
  rows: RigidMateRow[]
  diagnostics: RigidMateDiagnostic[]
  /** Norm/angle checks, not componentwise rows that could admit sqrt(3) error. */
  checks: { constraintId: string; lengthResidual: number; lengthTolerance: number;
    angleResidual: number; angleTolerance: number; satisfied: boolean }[]
  /** Physical mm and radians respectively. */
  maxLengthResidual: number
  maxAngleResidual: number
  /** Derived lifted state, valid only for this evaluation's chart. */
  gearAngles: Map<string, AssemblyGearAngles>
  screwAngles: Map<string, number>
  rackPinionAngles: Map<string, number>
  /** Separate from bilateral rows and their rank. Never a persisted active set. */
  inequalities?: RigidMateInequality[]
  limitDistances?: RigidLimitDistanceMeasurement[]
  limitAngles?: RigidLimitAngleMeasurement[]
  hingeStops?: RigidHingeStopMeasurement[]
  limitDirectedAngles?: (AssemblyDirectedAngleArcEvaluation & { constraintId: string })[]
  widthCentered?: RigidWidthCenteredMeasurement[]
  symmetry?: RigidSymmetryMeasurement[]
  profileCenter?: RigidProfileCenterMeasurement[]
  angularLimitCharts?: RigidAngularLimitChart[]
}
