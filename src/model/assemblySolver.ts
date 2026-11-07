import { copyRigidHingeConstraint } from './assemblyHingeNumeric';
import { copyRigidLinePathConstraint } from './assemblyLinePathNumeric';
import { copyRigidCircularPathConstraint } from './assemblyCircularPathNumeric';
import type { Vec3 } from '../cad/kernel.types';
import { evaluateRigidMates, copySymmetryUncertainty } from './assemblyMateEquations';
import { retractRigidBodyPose, rotationExp, RotationChartError } from './assemblyKinematics';
import { MAX_LEAST_SQUARES_COLUMNS, MAX_LEAST_SQUARES_ROWS, oneSidedJacobiSvd, solveSvdLeastSquares,
  type JacobiSvdOptions, type JacobiSvdResult } from './assemblyLeastSquares';
import { composeRigidPoses, identityRigidPose, inverseRigidPose, transformRigidDirection, validateRigidPose,
  type Quaternion, type RigidPose } from './rigidPose';
import type { RigidMateConstraint, RigidMateEndpoint, RigidMateEvaluation, RigidMateProblem,
  RigidMateSupport, RigidSolverBody, RigidGearConstraint, RigidScrewConstraint, RigidRackPinionConstraint } from './assemblySolveTypes';
import { admitRigidGearStep, deriveRigidGearAngles, rebaseRigidGearAngles, validateAssemblyGearData, type AssemblyGearAngles } from './assemblyGear';
import { admitRigidScrewStep, deriveRigidScrewAngles, rebaseRigidScrewAngles, validateAssemblyScrewData } from './assemblyScrew';
import { admitRigidRackPinionStep, deriveRigidRackPinionAngles, rebaseRigidRackPinionAngles, validateAssemblyRackPinionData } from './assemblyRackPinion';
import { assemblyDirectionMateAngle, assemblyDirectionMateObjective } from './assemblyDirectionMates';
import { assemblyTangentSideSign } from './assemblyTangentMates';
import { validateAssemblyCylinderTangentBranch } from './assemblyCylinderTangentMates';
import { validateAssemblySphereTangentBranch } from './assemblySphereTangentMates';
import { validateAssemblyLimitDistanceLimits } from './assemblyLimitDistance';
import { validateAssemblyLimitAngleLimits } from './assemblyLimitAngle';
import { validateAssemblyDirectedAngleArc } from './assemblyLimitDirectedAngle';
import { rigidMateConstraintEndpoints } from './assemblyNumericMateEndpoints';
import { copyRigidProfileCenterConstraint } from './assemblyProfileCenterNumeric';
import { AngularLimitRankError, angularEndpointKernelRows, angularRestorationNorm, angularRestorationRows, evaluateAngularManifoldCandidate, searchAngularLimitOpening,
  type AngularOpeningEvidence } from './assemblyAngularLimitSearch';

export const MAX_RIGID_SOLVER_BODIES = 4096;
export const MAX_RIGID_SOLVER_CONSTRAINTS = 4096;
export interface RigidMateSolverOptions {
  /** Optional tighter angular convergence for variable groups only. Fixed
   * relations retain the problem's public physical acceptance tolerance. */
  angleRefinementTolerance?: number;
  /** Optional tighter length convergence for variable groups only, in the
   * problem's physical length units. It cannot widen public acceptance. */
  lengthRefinementTolerance?: number;
  maxIterations?: number;
  maxTrials?: number;
  maxSeedPasses?: number;
  initialDamping?: number;
  maxStepNorm?: number;
  svd?: JacobiSvdOptions;
}
export type RigidMateSolveStatus = 'underdefined' | 'fullyDefined' | 'inconsistent' | 'nonConverged'
  | 'rankUncertain' | 'capacityLimit' | 'invalidInput' | 'precisionLimit';
export type RigidInconsistencyCertificate =
  | { kind: 'duplicateOffset'; constraintIds: [string, string]; offsets: [number, number]; gap: number; toleranceSum: number }
  | { kind: 'fixedConstraint'; constraintIds: [string]; rows: { kind: 'length' | 'angle'; residual: number; tolerance: number }[];
    checks: RigidMateEvaluation['checks'] };
export interface RigidGroupEvidence {
  bodyIds: string[];
  constraintIds: string[];
  variableCount: number;
  rowCount: number;
  /** A group lacking any fixed-frame endpoint retains common rigid gauge. */
  unanchored: boolean;
  rank: number | null;
  rankRange: [number, number];
  localDOF: number | null;
  singularValues: number[];
  /** Numerical variable order is bodyIds, each [vX,vY,vZ,wX,wY,wZ]. */
  nullspace: { vector: number[]; residualNorm: number }[];
  factorEvidence: JacobiSvdResult['evidence'] | null;
  iterations: number;
  trials: number;
  seededConstraintIds: string[];
  maxLengthResidual: number;
  maxAngleResidual: number;
  rowResiduals: { constraintId: string; kind: 'length' | 'angle'; residual: number; tolerance: number }[];
  checks: RigidMateEvaluation['checks'];
  limitDistances?: NonNullable<RigidMateEvaluation['limitDistances']>;
  limitAngles?: NonNullable<RigidMateEvaluation['limitAngles']>;
  limitDirectedAngles?: NonNullable<RigidMateEvaluation['limitDirectedAngles']>;
  hingeStops?: NonNullable<RigidMateEvaluation['hingeStops']>;
  widthCentered?: NonNullable<RigidMateEvaluation['widthCentered']>;
  symmetry?: NonNullable<RigidMateEvaluation['symmetry']>;
  profileCenter?: NonNullable<RigidMateEvaluation['profileCenter']>;
  angularLimitSearch?: AngularOpeningEvidence;
  /** Bilateral nullspace remains authoritative for rank. This is only lineality. */
  limitCone?: { activeBounds: {constraintId:string;bound:'minimum'|'maximum'}[]; linealityDimension:number | null; rankRange:[number,number] };
}
export interface RigidMateSolveResult {
  status: RigidMateSolveStatus;
  /** Atomic publication: null on every failure. Includes independent fixed copies. */
  poses: Map<string, RigidPose> | null;
  /** Accepted active and passive lifted angles; empty on failure. */
  gearAngles: Map<string, AssemblyGearAngles>;
  screwAngles: Map<string, number>;
  rackPinionAngles: Map<string, number>;
  localDOF: number | null;
  rank: number | null;
  rankRange: [number, number];
  localDOFRange: [number, number];
  iterations: number;
  certificates: RigidInconsistencyCertificate[];
  evidence: { groups: RigidGroupEvidence[]; diagnostics: string[]; maxLengthResidual: number; maxAngleResidual: number };
}
type Policy = { angleRefinementTolerance?: number; lengthRefinementTolerance?: number; maxIterations: number; maxTrials: number; maxSeedPasses: number; initialDamping: number; maxStepNorm: number; svd: JacobiSvdOptions };
class CapacityError extends Error {}
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(name + ' must be finite.');
  return value;
}
function vector(value: readonly number[], name: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || ![0, 1, 2].every(i => Object.hasOwn(value, i))) throw new Error(name + ' needs three coordinates.');
  return value.map(x => finite(x, name)) as Vec3;
}
function supportCopy(value: RigidMateSupport | undefined): RigidMateSupport | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || !['point', 'plane', 'cylinder', 'line', 'sphere'].includes(value.kind)) throw new Error('Invalid support kind.');
  const common = { point: vector(value.point, 'support point'), tolerance: finite(value.tolerance, 'native tolerance') };
  if (common.tolerance < 0) throw new Error('Native tolerance must be nonnegative.');
  if (value.kind === 'point') return { ...common, kind: 'point' };
  if (value.kind === 'sphere') {
    const radius = finite(value.radius, 'sphere radius');
    if (radius <= 0) throw new Error('Sphere radius must be positive.');
    return { ...common, kind: 'sphere', radius };
  }
  const axis = vector(value.kind === 'plane' ? value.normal : value.axis, 'support axis');
  if (Math.abs(Math.hypot(...axis) - 1) > 1e-8) throw new Error('Support axis must be unit.');
  if (value.kind === 'line') return { ...common, kind: 'line', axis };
  const xDirection = vector(value.xDirection, 'support X');
  if (Math.abs(Math.hypot(...xDirection) - 1) > 1e-8 || Math.abs(dot(axis, xDirection)) > 1e-8) throw new Error('Support axes must be unit and perpendicular.');
  if (value.kind === 'plane') return { ...common, xDirection, kind: 'plane', normal: axis };
  const radius = finite(value.radius, 'cylinder radius');
  if (radius <= 0) throw new Error('Cylinder radius must be positive.');
  return { ...common, xDirection, kind: 'cylinder', axis, radius };
}
function cloneProblem(input: RigidMateProblem): RigidMateProblem {
  if (!input || !Array.isArray(input.bodies) || !Array.isArray(input.constraints)) throw new Error('Invalid rigid mate problem.');
  if (input.passiveGears !== undefined && !Array.isArray(input.passiveGears)) throw new Error('Passive gears must be a list.');
  if (input.passiveScrews !== undefined && !Array.isArray(input.passiveScrews)) throw new Error('Passive screws must be a list.');
  if (input.passiveRackPinions !== undefined && !Array.isArray(input.passiveRackPinions)) throw new Error('Passive racks and pinions must be a list.');
  if (input.bodies.length > MAX_RIGID_SOLVER_BODIES || input.constraints.length + (input.passiveGears?.length ?? 0) + (input.passiveScrews?.length ?? 0) + (input.passiveRackPinions?.length ?? 0) > MAX_RIGID_SOLVER_CONSTRAINTS) throw new CapacityError('Total numerical input capacity exceeded.');
  const ids = new Set<string>();
  const bodies = Array.from(input.bodies, body => {
    if (!body || typeof body.id !== 'string' || !body.id || ids.has(body.id) || typeof body.fixed !== 'boolean') throw new Error('Body IDs must be unique and fixed state explicit.');
    ids.add(body.id); return { id: body.id, fixed: body.fixed, pose: validateRigidPose(body.pose) };
  });
  const endpoint = (value: RigidMateEndpoint): RigidMateEndpoint => {
    if (!value || value.bodyId !== null && (typeof value.bodyId !== 'string' || !ids.has(value.bodyId))) throw new Error('Endpoint body is missing.');
    return { bodyId: value.bodyId, frame: validateRigidPose(value.frame), ...(value.support ? { support: supportCopy(value.support) } : {}) };
  };
  const constraintIds = new Set<string>();
  const copyConstraint = (c: RigidMateConstraint): RigidMateConstraint => {
    for (const name of ['id', 'type']) {
      const field = c && typeof c === 'object' ? Object.getOwnPropertyDescriptor(c, name) : undefined;
      if (!field?.enumerable || !('value' in field) || typeof field.value !== 'string') throw new Error('Constraint identity and family must be own string data.');
    }
    if (!c || typeof c.id !== 'string' || !c.id || constraintIds.has(c.id)) throw new Error('Constraint IDs must be unique.');
    constraintIds.add(c.id);
    if(c.type==='hinge') {
      const copy=copyRigidHingeConstraint(c);
      if(rigidMateConstraintEndpoints(copy).some(e=>e?.bodyId!==null&&e?.bodyId!==undefined&&!ids.has(e.bodyId)))throw Error('Hinge owner missing.');
      return copy;
    }
    if (c.type === 'circular-path') {
      const copy = copyRigidCircularPathConstraint(c);
      if (rigidMateConstraintEndpoints(copy).some(e => e?.bodyId !== null && e?.bodyId !== undefined && !ids.has(e.bodyId))) throw Error('Circular path owner missing.');
      return copy;
    }
    if(c.type==='line-path'){const copy=copyRigidLinePathConstraint(c);if([copy.first,copy.second,...(copy.roll?[copy.roll.guide]:[])].some(e=>e.bodyId!==null&&!ids.has(e.bodyId)))throw Error('Line path owner missing.');return copy;}
    if (c.type === 'profile-center') {
      const copy = copyRigidProfileCenterConstraint(c);
      if ([copy.first, copy.second].some(value => value.bodyId !== null && !ids.has(value.bodyId))) throw new Error('Profile endpoint body is missing.');
      return copy;
    }
    if (c.type === 'symmetry') {
      const source = endpoint(c.source), target = endpoint(c.target), mirror = endpoint(c.mirror);
      if (!source.support || !target.support || source.support.kind !== target.support.kind || mirror.support?.kind !== 'plane') throw new Error('Symmetry requires matching actual supports and an actual mirror plane.');
      const undirected = source.support.kind === 'point' || source.support.kind === 'sphere';
      if (undirected ? c.alignment !== null : c.alignment !== 'aligned' && c.alignment !== 'opposed') throw new Error('Symmetry alignment must be null for point/sphere and explicit for directional supports.');
      const uncertainty=copySymmetryUncertainty(c);
      return { id: c.id, type: 'symmetry', source, target, mirror, alignment: c.alignment, ...(uncertainty?{uncertainty}:{}) };
    }
    if (c.type === 'width') {
      if (c.mode !== 'centered') throw new Error('Only explicit centered numerical width mode is admitted.');
      if ((c.widthBranch !== 'sum' && c.widthBranch !== 'difference') || (c.tabBranch !== 'sum' && c.tabBranch !== 'difference')) throw new Error('Width needs explicit sum or difference branches.');
      if (c.alignment !== 'aligned' && c.alignment !== 'opposed') throw new Error('Width needs an explicit alignment.');
      const pair = (value: [RigidMateEndpoint, RigidMateEndpoint]): [RigidMateEndpoint, RigidMateEndpoint] => {
        if (!Array.isArray(value) || value.length !== 2) throw new Error('Width needs two dense ordered plane pairs.');
        const result = [0, 1].map(index => {
          const field = Object.getOwnPropertyDescriptor(value, String(index));
          if (!field || !('value' in field)) throw new Error('Width pairs must contain own endpoint data.');
          const copy = endpoint(field.value as RigidMateEndpoint);
          if (copy.support?.kind !== 'plane') throw new Error('Centered width requires four actual plane supports.');
          return copy;
        });
        return result as [RigidMateEndpoint, RigidMateEndpoint];
      };
      return { id: c.id, type: 'width', mode: c.mode, width: pair(c.width), tab: pair(c.tab),
        widthBranch: c.widthBranch, tabBranch: c.tabBranch, alignment: c.alignment };
    }
    const common = { id: c.id, first: endpoint(c.first), second: endpoint(c.second) };
    if ([common.first, common.second, ...(c.type === 'gear' && c.carrier !== null ? [c.carrier] : []), ...(c.type === 'limit-directed-angle' ? [c.guide] : [])].some(value => value.support?.kind === 'point')) throw new Error('Point supports require an explicit numerical symmetry family.');
    const sphereFamily = c.type === 'plane-sphere-tangent' || c.type === 'sphere-sphere-tangent' || c.type === 'cylinder-sphere-tangent';
    if (!sphereFamily && (common.first.support?.kind === 'sphere' || common.second.support?.kind === 'sphere'
      || c.type === 'gear' && c.carrier?.support?.kind === 'sphere'
      || c.type === 'limit-directed-angle' && c.guide?.support?.kind === 'sphere')) throw new Error('Sphere supports require an explicit spherical tangency family.');
    if (c.type === 'rack-pinion') return { ...common, type: c.type, ...validateAssemblyRackPinionData({ conversion: c.conversion, reverse: c.reverse,
      neutralRotation: c.neutralRotation, angle: c.angle, neutralTravel: c.neutralTravel }) };
    if (c.type === 'screw') return { ...common, type: c.type, ...validateAssemblyScrewData({ lead: c.lead, reverse: c.reverse,
      alignment: c.alignment, neutralRotation: c.neutralRotation, angle: c.angle, neutralTravel: c.neutralTravel }) };
    if (c.type === 'gear') return { ...common, type: c.type, carrier: c.carrier === null ? null : endpoint(c.carrier),
      ...validateAssemblyGearData({ ratio: c.ratio, direction: c.direction, neutralRotations: c.neutralRotations, angles: c.angles, phase: c.phase }) };
    if (c.type === 'lock') return { ...common, type: c.type, relativePose: validateRigidPose(c.relativePose) };
    if (c.type === 'tangent') { assemblyTangentSideSign(c.side); return { ...common, type: c.type, side: c.side }; }
    if (c.type === 'plane-sphere-tangent') { assemblyTangentSideSign(c.side); return { ...common, type: c.type, side: c.side }; }
    if (c.type === 'sphere-sphere-tangent' || c.type === 'cylinder-sphere-tangent') return { ...common, type: c.type, branch: validateAssemblySphereTangentBranch(c.branch) };
    if (c.type === 'skew-cylinder-tangent' || c.type === 'parallel-cylinder-tangent') return { ...common, type: c.type, branch: validateAssemblyCylinderTangentBranch(c.branch) };
    if (c.type === 'parallel' || c.type === 'perpendicular') {
      if (!common.first.support || !common.second.support) throw new Error('Direction constraints need two resolved supports.');
      if (common.first.support.kind === 'sphere' || common.second.support.kind === 'sphere' || common.first.support.kind === 'point' || common.second.support.kind === 'point') throw new Error('Point and sphere supports have no directional coordinate.');
      assemblyDirectionMateAngle(c.type, common.first.support.kind, common.second.support.kind, c.alignment);
      return { ...common, type: c.type, alignment: c.alignment };
    }
    if (c.type === 'angle') {
      const angle = finite(c.angle, 'angle in degrees');
      if (angle < 0 || angle > 180) throw new Error('Angle must be in 0..180 degrees.');
      return { ...common, type: c.type, angle };
    }
    if (c.type === 'limit-directed-angle') {
      if (c.coordinate !== 'directed-about-axis') throw new Error('Circular stop needs an explicit directed-about-axis coordinate.');
      return { ...common, type: c.type, coordinate: c.coordinate, guide: endpoint(c.guide), arc: validateAssemblyDirectedAngleArc(c.arc) };
    }
    if (c.type === 'limit-angle') {
      if(c.coordinate!=='principal-direction'||!common.first.support||!common.second.support)throw new Error('Angular limits require principal-direction and two resolved supports.');
      return {...common,type:c.type,coordinate:c.coordinate,limits:validateAssemblyLimitAngleLimits(c.limits)};
    }
    if (c.type !== 'coincident' && c.type !== 'distance' && c.type !== 'limit-distance' && c.type !== 'concentric') throw new Error('Unknown constraint family.');
    if (c.alignment !== 'aligned' && c.alignment !== 'opposed') throw new Error('Unknown alignment branch.');
    if (c.type === 'concentric') return { ...common, type: c.type, alignment: c.alignment,
      rotationLock: c.rotationLock === null ? null : validateRigidPose({ translation: [0, 0, 0], rotation: c.rotationLock }).rotation };
    if (c.type === 'limit-distance') return {...common,type:c.type,alignment:c.alignment,limits:validateAssemblyLimitDistanceLimits(c.limits)};
    return c.type === 'distance' ? { ...common, type: c.type, alignment: c.alignment, distance: finite(c.distance, 'distance') }
      : { ...common, type: c.type, alignment: c.alignment };
  };
  const constraints = Array.from(input.constraints, copyConstraint);
  const passiveGears = Array.from(input.passiveGears ?? [], c => {
    if (c.type !== 'gear') throw new Error('Only gears can have passive angular tracking.');
    return copyConstraint(c) as RigidGearConstraint;
  });
  const passiveScrews = Array.from(input.passiveScrews ?? [], c => {
    if (c.type !== 'screw') throw new Error('Only screws can have passive screw tracking.');
    return copyConstraint(c) as RigidScrewConstraint;
  });
  const passiveRackPinions = Array.from(input.passiveRackPinions ?? [], c => {
    if (c.type !== 'rack-pinion') throw new Error('Only racks and pinions can have passive rack and pinion tracking.');
    return copyConstraint(c) as RigidRackPinionConstraint;
  });
  for (const c of [...constraints, ...passiveGears, ...passiveScrews, ...passiveRackPinions]) {
    if (c.type === 'hinge' || c.type === 'width' || c.type === 'symmetry' || c.type === 'profile-center' || c.type === 'line-path' || c.type === 'circular-path') continue; // Dedicated numerical supports were validated during copying.
    if (c.type === 'lock') continue;
    if (!c.first.support || !c.second.support) throw new Error('Geometric constraints need two resolved supports.');
    if (c.type === 'plane-sphere-tangent' && !((c.first.support.kind === 'plane' && c.second.support.kind === 'sphere')
      || (c.first.support.kind === 'sphere' && c.second.support.kind === 'plane'))) throw new Error('Plane/sphere tangency requires one actual plane and one sphere.');
    if (c.type === 'sphere-sphere-tangent' && (c.first.support.kind !== 'sphere' || c.second.support.kind !== 'sphere')) throw new Error('Sphere/sphere tangency requires two actual spheres.');
    if (c.type === 'cylinder-sphere-tangent' && !((c.first.support.kind === 'cylinder' && c.second.support.kind === 'sphere')
      || (c.first.support.kind === 'sphere' && c.second.support.kind === 'cylinder'))) throw new Error('Cylinder/sphere tangency requires one actual cylinder and one sphere.');
    if (c.type === 'tangent' && !((c.first.support.kind === 'plane' && c.second.support.kind === 'cylinder')
      || (c.first.support.kind === 'cylinder' && c.second.support.kind === 'plane'))) throw new Error('Tangent requires one plane and one cylinder surface.');
    if ((c.type === 'skew-cylinder-tangent' || c.type === 'parallel-cylinder-tangent')
      && (c.first.support.kind !== 'cylinder' || c.second.support.kind !== 'cylinder')) throw new Error('Cylinder tangency requires two actual cylinder supports.');
    if ((c.type === 'coincident' || c.type === 'distance' || c.type === 'limit-distance') && (c.first.support.kind !== 'plane' || c.second.support.kind !== 'plane')) throw new Error('Plane constraints require actual plane supports.');
    if (c.type === 'concentric' && ![c.first.support.kind, c.second.support.kind].every(kind => kind === 'line' || kind === 'cylinder')) throw new Error('Concentric requires axis lines or cylinders.');
    if ((c.type === 'gear' || c.type === 'screw') && (c.first.support.kind !== 'cylinder' || c.second.support.kind !== 'cylinder')) throw new Error('Axis constraints require actual cylinder supports.');
    if (c.type === 'rack-pinion' && (c.first.support.kind !== 'cylinder' || c.second.support.kind !== 'line' && c.second.support.kind !== 'cylinder')) throw new Error('Rack and pinion needs a pinion cylinder and a rack line or cylinder.');
  }
  const lengthScale = finite(input.lengthScale, 'lengthScale'), lengthTolerance = finite(input.lengthTolerance, 'lengthTolerance'), angleTolerance = finite(input.angleTolerance, 'angleTolerance');
  if (lengthScale <= 0 || lengthTolerance <= 0 || angleTolerance <= 0 || angleTolerance >= Math.PI) throw new Error('Conditioning and tolerances must be positive.');
  return { bodies, constraints, ...(passiveGears.length ? { passiveGears } : {}), ...(passiveScrews.length ? { passiveScrews } : {}),
    ...(passiveRackPinions.length ? { passiveRackPinions } : {}), origin: vector(input.origin, 'origin'), lengthScale, lengthTolerance, angleTolerance };
}
function policyCopy(input: RigidMateSolverOptions): Policy {
  if (!input || typeof input !== 'object') throw new Error('Invalid solver options.');
  const descriptor = Object.getOwnPropertyDescriptor(input, 'angleRefinementTolerance');
  let angleRefinementTolerance: number | undefined;
  if ('angleRefinementTolerance' in input) {
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('Angular refinement tolerance must be own data.');
    angleRefinementTolerance = finite(descriptor.value, 'Angular refinement tolerance');
    if (angleRefinementTolerance <= 0) throw new Error('Angular refinement tolerance must be positive.');
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(input, 'lengthRefinementTolerance');
  let lengthRefinementTolerance: number | undefined;
  if ('lengthRefinementTolerance' in input) {
    if (!lengthDescriptor?.enumerable || !('value' in lengthDescriptor)) throw new Error('Length refinement tolerance must be own data.');
    lengthRefinementTolerance = finite(lengthDescriptor.value, 'Length refinement tolerance');
    if (lengthRefinementTolerance <= 0) throw new Error('Length refinement tolerance must be positive.');
  }
  const result = { ...(angleRefinementTolerance === undefined ? {} : { angleRefinementTolerance }),
    ...(lengthRefinementTolerance === undefined ? {} : { lengthRefinementTolerance }), maxIterations: input.maxIterations ?? 80, maxTrials: input.maxTrials ?? 16, maxSeedPasses: input.maxSeedPasses ?? 4,
    initialDamping: input.initialDamping ?? 1e-3, maxStepNorm: input.maxStepNorm ?? 1, svd: { ...input.svd } };
  for (const [name, maximum] of [['maxIterations', 200], ['maxTrials', 32], ['maxSeedPasses', 16]] as const) {
    if (!Number.isInteger(result[name]) || result[name] < (name === 'maxTrials' ? 1 : 0) || result[name] > maximum) throw new Error('Invalid ' + name + ' budget.');
  }
  if (!Number.isFinite(result.initialDamping) || result.initialDamping <= 0 || result.initialDamping > 1e12
    || !Number.isFinite(result.maxStepNorm) || result.maxStepNorm <= 0 || result.maxStepNorm > 2) throw new Error('Invalid damping/step policy.');
  return result;
}
function rowBudget(c: RigidMateConstraint): number {
  if (c.type === 'hinge') return c.stops ? 8 : 6; // Six chart rows; regular physical rank is measured, never prescribed.
  if (c.type === 'circular-path') return (c.position.mode === 'coordinate' ? 3 : c.position.domain === 'trim' ? 4 : 2) + (c.follow ? 3 : 0) + (c.roll ? 1 : 0); // Both trim inequalities consume capacity, independently of bilateral rank.
 if(c.type==='line-path')return (c.coordinateMm===null?2:3)+(c.follow?3:0)+(c.roll?1:0);
  if (c.type === 'profile-center') return c.orientation.mode === 'rectangle' ? 9 : 6; // Vector rows, not rank.
  if (c.type === 'symmetry') return c.source.support?.kind === 'point' || c.source.support?.kind === 'sphere' ? 3 : 6;
  if (c.type === 'width') return 4; // Three vector-defect components plus one anchored offset; this is not a rank claim.
  if (c.type === 'limit-directed-angle') return 2;
  if (c.type === 'limit-angle') return 5; // Both physical bounds plus the possible three-component endpoint kernel.
  if (c.type === 'limit-distance') return 5; // Three bilateral rows plus BOTH inequalities, even inactive.
  if (c.type === 'plane-sphere-tangent' || c.type === 'sphere-sphere-tangent' || c.type === 'cylinder-sphere-tangent') return 1;
  if (c.type === 'skew-cylinder-tangent') return 1;
  if (c.type === 'parallel-cylinder-tangent') return 4;
  if (c.type === 'tangent') return 2;
  if (c.type === 'parallel' || c.type === 'perpendicular') {
    const first = c.first.support!, second = c.second.support!;
    if (first.kind === 'sphere' || second.kind === 'sphere' || first.kind === 'point' || second.kind === 'point') throw new Error('Point and sphere supports have no directional coordinate.');
    return assemblyDirectionMateObjective(c.type, first.kind, second.kind) === 'collinear' ? 3 : 1;
  }
  return c.type === 'gear' || c.type === 'rack-pinion' ? 1 : c.type === 'screw' ? 7 : c.type === 'concentric' ? 6 + (c.rotationLock ? 3 : 0) : c.type === 'lock' ? 6 : c.type === 'angle' ? (c.angle === 0 || c.angle === 180 ? 3 : 1) : 4;
}
function endpointIds(c: RigidMateConstraint): (string | null)[] {
  return rigidMateConstraintEndpoints(c).map(endpoint => endpoint?.bodyId ?? null);
}
interface Group { bodyIds: string[]; constraints: RigidMateConstraint[] }
function partition(problem: RigidMateProblem): { groups: Group[]; fixedConstraints: RigidMateConstraint[] } {
  const free = problem.bodies.filter(body => !body.fixed).map(body => body.id).sort(compare), parent = new Map(free.map(id => [id, id]));
  const root = (id: string): string => { let cursor = id; while (parent.get(cursor) !== cursor) cursor = parent.get(cursor)!; return cursor; };
  const incidence = (c: RigidMateConstraint): string[] => [...new Set(endpointIds(c).filter((id): id is string => id !== null && parent.has(id)))];
  for (const c of problem.constraints) {
    const ids = incidence(c);
    for (const id of ids.slice(1)) { const a = root(ids[0]), b = root(id); if (a !== b) parent.set(compare(a, b) < 0 ? b : a, compare(a, b) < 0 ? a : b); }
  }
  const groups = new Map<string, Group>();
  for (const id of free) { const key = root(id); if (!groups.has(key)) groups.set(key, { bodyIds: [], constraints: [] }); groups.get(key)!.bodyIds.push(id); }
  const fixedConstraints: RigidMateConstraint[] = [];
  for (const c of [...problem.constraints].sort((a, b) => compare(a.id, b.id))) {
    const ids = incidence(c); if (!ids.length) fixedConstraints.push(c); else groups.get(root(ids[0]))!.constraints.push(c);
  }
  for (const group of groups.values()) {
    if (group.bodyIds.length * 6 > MAX_LEAST_SQUARES_COLUMNS || group.constraints.reduce((count, c) => count + rowBudget(c), 0) > MAX_LEAST_SQUARES_ROWS) {
      throw new CapacityError('A connected free-owner group exceeds 128 columns or 256 rows.');
    }
  }
  return { groups: [...groups.values()], fixedConstraints };
}
function endpointKey(value: RigidMateEndpoint): string {
  const s = value.support;
  return JSON.stringify([value.bodyId, value.frame.translation, value.frame.rotation, !s ? null :
    s.kind === 'point' ? [s.kind, s.point, s.tolerance] : s.kind === 'plane' ? [s.kind, s.point, s.normal, s.xDirection, s.tolerance]
      : s.kind === 'line' ? [s.kind, s.point, s.axis, s.tolerance] : s.kind === 'sphere' ? [s.kind, s.point, s.radius, s.tolerance] : [s.kind, s.point, s.axis, s.xDirection, s.radius, s.tolerance]]);
}
function lengthTolerance(problem: RigidMateProblem, c: Extract<RigidMateConstraint, { type: 'coincident' | 'distance' }>): number {
  return Math.max(problem.lengthTolerance, (c.first.support?.tolerance ?? 0) + (c.second.support?.tolerance ?? 0));
}
function offsetCertificates(problem: RigidMateProblem): RigidInconsistencyCertificate[] {
  const seen = new Map<string, Extract<RigidMateConstraint, { type: 'coincident' | 'distance' }>>();
  const result: RigidInconsistencyCertificate[] = [];
  for (const c of [...problem.constraints].sort((a, b) => compare(a.id, b.id))) {
    if (c.type !== 'coincident' && c.type !== 'distance') continue;
    // Exact ordered declarations only. No proximity, nearest support or aliasing.
    const key = JSON.stringify([endpointKey(c.first), endpointKey(c.second), c.alignment]), previous = seen.get(key);
    if (previous) {
      const a = previous.type === 'distance' ? previous.distance : 0, b = c.type === 'distance' ? c.distance : 0;
      const gap = Math.abs(a - b), toleranceSum = lengthTolerance(problem, previous) + lengthTolerance(problem, c);
      if (!Number.isFinite(gap) || !Number.isFinite(toleranceSum)) throw new Error('Offset certificate arithmetic exceeds finite range.');
      if (gap > toleranceSum) result.push({ kind: 'duplicateOffset', constraintIds: [previous.id, c.id], offsets: [a, b], gap, toleranceSum });
    } else seen.set(key, c);
  }
  return result;
}
function endpointPose(endpoint: RigidMateEndpoint, poses: ReadonlyMap<string, RigidPose>): RigidPose {
  return endpoint.bodyId === null ? endpoint.frame : composeRigidPoses(poses.get(endpoint.bodyId)!, endpoint.frame);
}
function multiplyRotation(a: Quaternion, b: Quaternion): Quaternion {
  return composeRigidPoses({ translation: [0, 0, 0], rotation: a }, { translation: [0, 0, 0], rotation: b }).rotation;
}
function inverseRotation(q: Quaternion): Quaternion { return inverseRigidPose({ translation: [0, 0, 0], rotation: q }).rotation; }
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: Vec3, b: Vec3): Vec3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function unit(value: Vec3): Vec3 { const norm = Math.hypot(...value); if (!Number.isFinite(norm) || norm < 1e-12) throw new Error('Degenerate seed direction.'); return value.map(x => x / norm) as Vec3; }
function directions(endpoint: RigidMateEndpoint, poses: ReadonlyMap<string, RigidPose>, directionOnly = false): { axis: Vec3; x: Vec3 } {
  const support = endpoint.support;
  if (!support || support.kind === 'sphere' || support.kind === 'point') throw new Error('An oriented seed needs an actual directional support.');
  const pose = directionOnly ? { translation: [0, 0, 0] as Vec3,
    rotation: multiplyRotation(endpoint.bodyId === null ? [0, 0, 0, 1] : poses.get(endpoint.bodyId)!.rotation, endpoint.frame.rotation) } : endpointPose(endpoint, poses);
  const axis = unit(transformRigidDirection(pose, support.kind === 'plane' ? support.normal : support.axis));
  // A line has no authenticated transverse direction. This deterministic
  // perpendicular is a numerical seed only, never a native frame or saved ref.
  const x = support.kind === 'line' ? unit(cross(axis, Math.abs(axis[0]) < .9 ? [1, 0, 0] : [0, 1, 0]))
    : unit(transformRigidDirection(pose, support.xDirection));
  return { axis, x };
}
function alignRotation(from: Vec3, to: Vec3, transverse: Vec3): Quaternion {
  const cosine = Math.max(-1, Math.min(1, dot(from, to))), perpendicular = cross(from, to), sine = Math.hypot(...perpendicular);
  if (sine > 1e-10) return rotationExp(unit(perpendicular).map(x => x * Math.atan2(sine, cosine)) as Vec3);
  if (cosine > 0) return [0, 0, 0, 1];
  const projection = dot(transverse, from), axis = unit(transverse.map((x, i) => x - projection * from[i]) as Vec3);
  return rotationExp(axis.map(x => x * Math.PI) as Vec3);
}
/** A three-role orientation proposal. Shared supports rotate together; translations
 * and every other constraint are subsequently checked by the combined evaluator. */
function seedSymmetry(c: Extract<RigidMateConstraint, { type: 'symmetry' }>, free: ReadonlySet<string>, poses: Map<string, RigidPose>): boolean {
  if (!c.source.support || c.source.support.kind === 'point' || c.source.support.kind === 'sphere') return false;
  const A = c.source.bodyId, B = c.target.bodyId, M = c.mirror.bodyId;
  if (A === B && B === M) return false;
  const movable = (id: string | null): id is string => id !== null && free.has(id);
  const a = directions(c.source, poses, true).axis, b = directions(c.target, poses, true).axis, m = directions(c.mirror, poses, true).axis;
  const signedB = b.map(value => (c.alignment === 'opposed' ? -1 : 1) * value) as Vec3;
  const reflect = (v: Vec3): Vec3 => v.map((value, i) => value - 2 * m[i] * dot(m, v)) as Vec3;
  const perpendicular = (v: Vec3): Vec3 => unit(cross(v, Math.abs(v[0]) < .9 ? [1, 0, 0] : [0, 1, 0]));
  let id: string, from: Vec3, to: Vec3;
  if (movable(B) && B !== A && B !== M) { id = B; from = b; to = reflect(a).map(value => (c.alignment === 'opposed' ? -1 : 1) * value) as Vec3; }
  else if (movable(A) && A !== B && A !== M) { id = A; from = a; to = reflect(signedB); }
  else if (movable(M) && M !== A && M !== B) {
    id = M; from = m;
    const difference = a.map((value, i) => value - signedB[i]) as Vec3;
    to = Math.hypot(...difference) > 1e-12 ? unit(difference) : perpendicular(a);
  } else if (A === B && movable(A) && A !== M) {
    id = A;
    const difference = a.map((value, i) => value - signedB[i]) as Vec3;
    if (Math.hypot(...difference) > 1e-12) { from = unit(difference); to = m; }
    else { from = a; to = perpendicular(m); }
  } else if (A === M && movable(A) && A !== B) { id = A; from = reflect(a); to = signedB; }
  else if (B === M && movable(B) && B !== A) { id = B; from = reflect(signedB); to = a; }
  else return false;
  const rotation = multiplyRotation(alignRotation(from, to, perpendicular(from)), poses.get(id)!.rotation);
  poses.set(id, validateRigidPose({ translation: [...poses.get(id)!.translation], rotation }));
  return true;
}
/** Only initializes the normal/roll chart; the combined evaluator checks every
 * physical equation before a pose can be published. A circle's transverse
 * direction below is deterministic seed data, never material roll authority. */
function seedProfileCenter(c: Extract<RigidMateConstraint, { type: 'profile-center' }>, free: ReadonlySet<string>, poses: Map<string, RigidPose>): boolean {
  if (c.first.bodyId === c.second.bodyId) return false;
  const second = c.second.bodyId !== null && free.has(c.second.bodyId);
  if (!second && (c.first.bodyId === null || !free.has(c.first.bodyId))) return false;
  const direction = (e: typeof c.first): { n: Vec3; x: Vec3 | null } => {
    // Rotation-only composition avoids loss of distant, cancellable placements.
    const pose = { translation: [0, 0, 0] as Vec3, rotation: multiplyRotation(e.bodyId === null ? [0, 0, 0, 1] : poses.get(e.bodyId)!.rotation, e.frame.rotation) };
    return { n: unit(transformRigidDirection(pose, e.profile.normal)), x: e.profile.kind === 'rectangle' ? unit(transformRigidDirection(pose, e.profile.xDirection)) : null };
  };
  const a = direction(c.first), b = direction(c.second), moving = second ? c.second : c.first, current = second ? b : a;
  const sign = c.alignment === 'aligned' ? 1 : -1;
  const targetNormal = (second ? a.n : b.n).map(v => sign * v) as Vec3;
  const transverse = current.x ?? unit(cross(current.n, Math.abs(current.n[0]) < .9 ? [1, 0, 0] : [0, 1, 0]));
  let change = alignRotation(current.n, targetNormal, transverse);
  if (c.orientation.mode === 'rectangle') {
    const q = c.orientation.quarterTurns, cosine = [1, 0, -1, 0][q], sine = [0, 1, 0, -1][q];
    // Inverse quarter turn when FIRST moves; the axis is always nFirst,
    // including opposed normal alignment.
    const basis = second ? a.x! : b.x!, axis = second ? a.n : targetNormal;
    const perpendicular = cross(axis, basis);
    const targetX = basis.map((v, i) => cosine * v + (second ? sine : -sine) * perpendicular[i]) as Vec3;
    const alignedX = transformRigidDirection({ translation: [0, 0, 0], rotation: change }, current.x!);
    const roll = Math.atan2(dot(targetNormal, cross(alignedX, targetX)), dot(alignedX, targetX));
    change = multiplyRotation(rotationExp(targetNormal.map(v => v * roll) as Vec3), change);
  }
  const id = moving.bodyId!, old = poses.get(id)!;
  poses.set(id, validateRigidPose({ translation: [...old.translation], rotation: multiplyRotation(change, old.rotation) }));
  return true;
}
/** Proposals restore a regular circle/attitude chart on real owners only. They
 * never confer reference authority, choose a saved phase, or bypass the complete
 * combined evaluation. Rotations keep the selected material point stationary. */
function seedCircularPath(c: Extract<RigidMateConstraint, { type: 'circular-path' }>, free: ReadonlySet<string>,
  poses: Map<string, RigidPose>, problem: RigidMateProblem): boolean {
  const movable = (id: string | null): id is string => id !== null && free.has(id), A = c.first.bodyId, B = c.second.bodyId;
  const scale = problem.lengthScale, origin = problem.origin, arc = c.second.arc;
  const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]) as Vec3;
  const sub = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v - b[i]) as Vec3;
  const mul = (a: Vec3, k: number): Vec3 => a.map(v => v * k) as Vec3;
  const nearbyPose = (e: RigidMateEndpoint): RigidPose => {
    const frame = { translation: mul(e.frame.translation, 1 / scale), rotation: e.frame.rotation };
    if (e.bodyId === null) return { ...frame, translation: e.frame.translation.map((v, i) => (v - origin[i]) / scale) as Vec3 };
    const body = poses.get(e.bodyId)!;
    return composeRigidPoses({ translation: body.translation.map((v, i) => (v - origin[i]) / scale) as Vec3, rotation: body.rotation }, frame);
  };
  const relativePoint = (e: RigidMateEndpoint, point: Vec3): Vec3 => {
    const pose = nearbyPose(e);
    return add(pose.translation, transformRigidDirection(pose, mul(point, 1 / scale)));
  };
  const u = unit(arc.radial), v = unit(sub(arc.tangent, mul(u, dot(u, arc.tangent)))), n = unit(cross(u, v));
  const radius = arc.radiusMm / scale;
  const point = () => relativePoint(c.first, c.first.support!.point);
  const geometry = () => {
    const pose = nearbyPose(c.second), center = relativePoint(c.second, arc.center), delta = sub(point(), center), q = inverseRotation(pose.rotation),
      p = transformRigidDirection({ translation: [0, 0, 0], rotation: q }, delta), x = dot(p, u), y = dot(p, v), rho = Math.hypot(x, y);
    const half = arc.sweepRad / 2, alpha = Math.atan2(y * Math.cos(half) - x * Math.sin(half), x * Math.cos(half) + y * Math.sin(half));
    const phase = c.position.mode === 'coordinate' ? c.position.distanceMm / arc.radiusMm : alpha + half;
    return { pose, p, rho, alpha, phase };
  };
  let changed = false, g = geometry();
  if (c.position.mode === 'free' && (g.rho <= 1e-12 * Math.max(radius, Math.hypot(...g.p))
    || c.position.domain === 'trim' && Math.PI - Math.abs(g.alpha) <= 1e-7)) {
    if (A === B || !movable(A) && !movable(B)) return false;
    // A material-start proposal preserves the out-of-plane coordinate. Its
    // displacement is bounded by the circle diameter; distant proposals refuse.
    const desired = add(mul(u, radius), mul(n, dot(g.p, n))), delta = sub(desired, g.p);
    if (!Number.isFinite(radius) || radius <= 0 || Math.hypot(...delta) > 2 * radius * (1 + 1e-12)) return false;
    const displacement = mul(transformRigidDirection(g.pose, delta), scale), id = movable(A) ? A : B!, old = poses.get(id)!;
    poses.set(id, validateRigidPose({ rotation: [...old.rotation], translation: old.translation.map((value, i) => value + (id === A ? 1 : -1) * displacement[i]) as Vec3 }));
    changed = true; g = geometry();
  }
  if (!c.follow) return changed;
  const rotateAboutPoint = (id: string, change: Quaternion): void => {
    const old = poses.get(id)!, pivot = point(), offset = old.translation.map((value, i) => (value - origin[i]) / scale - pivot[i]) as Vec3,
      rotated = transformRigidDirection({ translation: [0, 0, 0], rotation: change }, offset);
    poses.set(id, validateRigidPose({ rotation: multiplyRotation(change, old.rotation), translation: add(pivot, rotated).map((value, i) => origin[i] + scale * value) as Vec3 }));
  };
  const tangent = (): Vec3 => {
    const now = geometry();
    return unit(transformRigidDirection(now.pose, add(mul(u, -Math.sin(now.phase)), mul(v, Math.cos(now.phase)))));
  };
  if (A !== B && (movable(A) || movable(B))) {
    const x = unit(transformRigidDirection(nearbyPose(c.first), c.follow.axis)), t = tangent(), sign = c.follow.reverse ? -1 : 1,
      id = movable(A) ? A : B!, from = movable(A) ? x : t, to = mul(movable(A) ? t : x, sign),
      transverse = unit(cross(from, Math.abs(from[0]) < .9 ? [1, 0, 0] : [0, 1, 0]));
    rotateAboutPoint(id, alignRotation(from, to, transverse)); changed = true;
  }
  if (c.roll) {
    const G = c.roll.guide.bodyId, t = tangent(), x = transformRigidDirection(nearbyPose(c.first), c.roll.axis),
      normal = directions(c.roll.guide, poses, true).axis,
      project = (value: Vec3): Vec3 => sub(value, mul(t, dot(value, t))), source = project(x), guide = project(normal);
    if (Math.hypot(...source) < 1e-12 || Math.hypot(...guide) < 1e-12) return changed;
    const s = unit(source), target = mul(unit(guide), c.roll.reverse ? -1 : 1), theta = Math.atan2(dot(t, cross(target, s)), dot(target, s));
    let id: string | null = null, angle = 0;
    if (movable(G) && G !== A && G !== B) { id = G; angle = theta; }
    else if (movable(A) && A !== G && A !== B) { id = A; angle = -theta; }
    else if (G === B && movable(B) && B !== A) { id = B; angle = theta; }
    else if (A === B && movable(A) && A !== G) { id = A; angle = -theta; }
    if (id !== null) { rotateAboutPoint(id, rotationExp(mul(t, angle))); changed = true; }
  }
  return changed;
}
/** A bounded chart initialization from actual frames; never a solved publication. */
function seedConstraint(c: RigidMateConstraint, free: ReadonlySet<string>, poses: Map<string, RigidPose>, problem: RigidMateProblem): boolean {
  if (c.type === 'hinge') return seedConstraint({
    id: c.id, type: 'concentric', first: c.axis[0], second: c.axis[1],
    alignment: c.alignment, rotationLock: null,
  }, free, poses, problem);
 if (c.type === 'circular-path') return seedCircularPath(c, free, poses, problem);
 if(c.type==='line-path'){
   if(!c.follow)return false;
   const movable=(id:string|null):id is string=>id!==null&&free.has(id),A=c.first.bodyId,B=c.second.bodyId;
   let changed=false;
   if(A!==B&&(movable(A)||movable(B))){
     const x=transformRigidDirection(endpointPose(c.first,poses),c.follow.axis),t=transformRigidDirection(endpointPose(c.second,poses),c.second.line.direction),sign=c.follow.reverse?-1:1;
     const id=movable(A)?A:B!,from=movable(A)?x:t,to=(movable(A)?t:x).map(v=>v*sign) as Vec3;
     const transverse=unit(cross(from,Math.abs(from[0])<.9?[1,0,0]:[0,1,0]));
     poses.set(id,validateRigidPose({translation:[...poses.get(id)!.translation],rotation:multiplyRotation(alignRotation(from,to,transverse),poses.get(id)!.rotation)}));changed=true;
   }
   if(c.roll){
     const G=c.roll.guide.bodyId,t=unit(transformRigidDirection(endpointPose(c.second,poses),c.second.line.direction)),x=transformRigidDirection(endpointPose(c.first,poses),c.roll.axis),normal=transformRigidDirection(endpointPose(c.roll.guide,poses),c.roll.guide.support!.kind==='plane'?c.roll.guide.support!.normal:[0,0,0]);
     const project=(v:Vec3)=>v.map((value,i)=>value-dot(v,t)*t[i]) as Vec3,u=project(x),v=project(normal);
     if(Math.hypot(...u)<1e-12||Math.hypot(...v)<1e-12)return changed;
     const source=unit(u),target=unit(v).map(z=>c.roll!.reverse?-z:z) as Vec3,theta=Math.atan2(dot(t,cross(target,source)),dot(target,source));
     let id:string|null=null,angle=0;
     if(movable(G)&&G!==A&&G!==B){id=G;angle=theta;}
     else if(movable(A)&&A!==G&&A!==B){id=A;angle=-theta;}
     else if(G===B&&movable(B)&&B!==A){id=B;angle=theta;}
     else if(A===B&&movable(A)&&A!==G){id=A;angle=-theta;}
     if(id!==null){poses.set(id,validateRigidPose({translation:[...poses.get(id)!.translation],rotation:multiplyRotation(rotationExp(t.map(value=>value*angle) as Vec3),poses.get(id)!.rotation)}));changed=true;}
   }
   return changed;
 }

  if (c.type === 'profile-center') return seedProfileCenter(c, free, poses);
  if (c.type === 'symmetry') return seedSymmetry(c, free, poses);
  if (c.type === 'width') return false; // A binary orientation seed cannot represent four original support owners.
  if (c.type === 'gear' || c.type === 'screw' || c.type === 'rack-pinion' || c.type === 'skew-cylinder-tangent' || c.type === 'parallel-cylinder-tangent'
    || c.type === 'plane-sphere-tangent' || c.type === 'sphere-sphere-tangent' || c.type === 'cylinder-sphere-tangent' || c.type === 'limit-angle' || c.type === 'limit-directed-angle') return false;
  const second = c.second.bodyId !== null && free.has(c.second.bodyId), first = c.first.bodyId !== null && free.has(c.first.bodyId);
  if (!second && !first || c.first.bodyId === c.second.bodyId) return false;
  const moving = second ? c.second : c.first, other = second ? c.first : c.second, id = moving.bodyId!;
  const relative = c.type === 'lock' ? c.relativePose.rotation : c.type === 'concentric' ? c.rotationLock : null;
  let rotation: Quaternion;
  if (relative) {
    const targetEndpoint = multiplyRotation(endpointPose(other, poses).rotation, second ? relative : inverseRotation(relative));
    rotation = multiplyRotation(targetEndpoint, inverseRotation(moving.frame.rotation));
  } else {
    const directionOnly = c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'tangent';
    const a = directions(other, poses, directionOnly), b = directions(moving, poses, directionOnly);
    let target: Vec3;
    if (c.type === 'angle' || c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'tangent') {
      if (c.first.support?.kind === 'sphere' || c.second.support?.kind === 'sphere' || c.first.support?.kind === 'point' || c.second.support?.kind === 'point') return false;
      const targetAngle = c.type === 'tangent' ? 90 : c.type === 'angle' ? c.angle : assemblyDirectionMateAngle(c.type, c.first.support!.kind, c.second.support!.kind, c.alignment);
      const angle = targetAngle * Math.PI / 180, axial = dot(a.x, a.axis), x = unit(a.x.map((value, i) => value - axial * a.axis[i]) as Vec3);
      target = unit(a.axis.map((value, i) => Math.cos(angle) * value + Math.sin(angle) * x[i]) as Vec3);
    } else {
      if (c.type === 'lock') return false;
      const sign = c.alignment === 'aligned' ? 1 : -1;
      target = a.axis.map(value => sign * value) as Vec3;
    }
    rotation = multiplyRotation(alignRotation(b.axis, target, b.x), poses.get(id)!.rotation);
  }
  poses.set(id, validateRigidPose({ translation: [...poses.get(id)!.translation], rotation })); return true;
}
function groupProblem(problem: RigidMateProblem, group: Group, poses: ReadonlyMap<string, RigidPose>): RigidMateProblem {
  const free = new Set(group.bodyIds), used = new Set([...group.constraints, ...(problem.passiveGears ?? []), ...(problem.passiveScrews ?? []), ...(problem.passiveRackPinions ?? [])].flatMap(endpointIds));
  return { ...problem, bodies: [...problem.bodies.filter(body => free.has(body.id)).sort((a, b) => compare(a.id, b.id)),
    ...problem.bodies.filter(body => !free.has(body.id) && used.has(body.id)).sort((a, b) => compare(a.id, b.id)).map(body => ({ ...body, fixed: true, pose: poses.get(body.id)! }))], constraints: group.constraints };
}
function satisfied(evaluation: RigidMateEvaluation, problem: RigidMateProblem): boolean {
  if (evaluation.diagnostics.length || evaluation.rows.some(row => Math.abs(row.residual) > row.tolerance)) return false;
  return evaluation.checks.length === problem.constraints.length && evaluation.checks.every(check => check.satisfied);
}
function diagnosticStatus(evaluation: RigidMateEvaluation): RigidMateSolveStatus {
  return evaluation.diagnostics.some(value => value.code === 'precisionLimit') ? 'precisionLimit'
    : evaluation.diagnostics.some(value => value.code === 'invalidGeometry') ? 'invalidInput' : 'nonConverged';
}
function blankEvidence(group: Group, problem: RigidMateProblem): RigidGroupEvidence {
  const free = new Set(group.bodyIds), fixed = new Set(problem.bodies.filter(body => body.fixed).map(body => body.id));
  return { bodyIds: [...group.bodyIds], constraintIds: group.constraints.map(c => c.id), variableCount: group.bodyIds.length * 6, rowCount: 0,
    unanchored: !group.constraints.some(c => endpointIds(c).some(id => id === null || fixed.has(id))) && free.size > 0,
    rank: null, rankRange: [0, group.bodyIds.length * 6], localDOF: null, singularValues: [], nullspace: [], factorEvidence: null,
    iterations: 0, trials: 0, seededConstraintIds: [], maxLengthResidual: 0, maxAngleResidual: 0, rowResiduals: [], checks: [] };
}
function recordEvaluation(evidence: RigidGroupEvidence, evaluation: RigidMateEvaluation): void {
  evidence.rowCount = evaluation.rows.length; evidence.maxLengthResidual = evaluation.maxLengthResidual; evidence.maxAngleResidual = evaluation.maxAngleResidual;
  evidence.rowResiduals = evaluation.rows.map(({ constraintId, kind, residual, tolerance }) => ({ constraintId, kind, residual, tolerance }));
  evidence.checks = evaluation.checks.map(check => ({ ...check }));
  if (evaluation.limitDistances) evidence.limitDistances = evaluation.limitDistances.map(value=>({...value,limits:{...value.limits}}));
  if (evaluation.limitAngles) evidence.limitAngles = evaluation.limitAngles.map(value=>({...value,limitsDegrees:{...value.limitsDegrees},marginsRadians:{...value.marginsRadians},domainBounds:{...value.domainBounds}}));
  if (evaluation.hingeStops) evidence.hingeStops = evaluation.hingeStops.map(value => ({ ...value,
    arcDegrees: { ...value.arcDegrees }, marginsRadians: { ...value.marginsRadians }, projectionLengths: { ...value.projectionLengths } }));
  if (evaluation.limitDirectedAngles) evidence.limitDirectedAngles = evaluation.limitDirectedAngles.map(value => ({ ...value, arcDegrees: { ...value.arcDegrees }, marginsRadians: { ...value.marginsRadians } }));
  if (evaluation.widthCentered) evidence.widthCentered = evaluation.widthCentered.map(value => ({ ...value, branchLengths: { ...value.branchLengths } }));
  if (evaluation.symmetry) evidence.symmetry = evaluation.symmetry.map(value => ({ ...value }));
  if (evaluation.profileCenter) evidence.profileCenter = evaluation.profileCenter.map(value => ({ ...value, orientation: { ...value.orientation } }));
}
function finalFactor(evaluation: RigidMateEvaluation, evidence: RigidGroupEvidence, policy: Policy): JacobiSvdResult | null {
  recordEvaluation(evidence, evaluation);
  const jacobian = evaluation.rows.map(row=>row.jacobian);
  let factor:JacobiSvdResult|null=null;
  if (!evaluation.rows.length) {
    evidence.rank = 0; evidence.rankRange = [0, 0]; evidence.localDOF = evidence.variableCount;
    evidence.nullspace = Array.from({ length: evidence.variableCount }, (_, i) => ({ vector: Array.from({ length: evidence.variableCount }, (_, j) => i === j ? 1 : 0), residualNorm: 0 }));
    if(!evaluation.angularLimitCharts&&!evaluation.inequalities)return null;
  } else {
  const computed = oneSidedJacobiSvd(jacobian, policy.svd);factor=computed;
  evidence.singularValues = [...computed.singularValues]; evidence.rank = computed.rank; evidence.rankRange = [...computed.rankRange]; evidence.factorEvidence = { ...computed.evidence };
  if (computed.rank !== null) {
    evidence.localDOF = evidence.variableCount - computed.rank;
    evidence.nullspace = computed.v[0].flatMap((_, column) => column < computed.rank! ? [] : [{ vector: computed.v.map(row => row[column]),
      residualNorm: Math.hypot(...jacobian.map(row => row.reduce((sum, value, j) => sum + value * computed.v[j][column], 0))) }]);
  }
  }
  if (evaluation.inequalities || evaluation.angularLimitCharts) {
    const active = (evaluation.inequalities??[]).filter(value=>Math.abs(value.margin)<=value.tolerance),
      kernels=angularEndpointKernelRows(evaluation), combined = [...jacobian,...active.map(value=>value.jacobian),...kernels.map(value=>value.jacobian)],
      cone = combined.length?oneSidedJacobiSvd(combined,policy.svd):null,
      endpointBounds=(evaluation.limitAngles??[]).filter(value=>kernels.some(row=>row.constraintId===value.constraintId)).map(value=>({constraintId:value.constraintId,
        bound:value.domainBounds.minimum?'maximum' as const:'minimum' as const}));
    evidence.limitCone = {activeBounds:[...active.map(({constraintId,bound})=>({constraintId,bound})),...endpointBounds],
      linealityDimension:cone===null?evidence.variableCount:cone.rank===null||evaluation.angularLimitCharts&&!cone.evidence.certified ? null : evidence.variableCount-cone.rank,rankRange:cone?[...cone.rankRange]:[0,0]};
  }
  return factor;
}
/** A provisional residual step, never a rank/DOF claim. Invert only the
 * factor's certified nonzero modes (rankRange[0]); ambiguous modes remain unused.
 * The existing diagonal least-squares path keeps its scaling/damping checks.
 */
function certifiedResidualRefinement(factor: JacobiSvdResult, rhs: number[], policy: Policy, damping: number): number[] | null {
  const count = factor.rankRange[0];
  if (!factor.evidence.certified || factor.rank !== null || count === 0) return null;
  const rhsScale = Math.max(...rhs.map(Math.abs));
  if (rhsScale === 0) return null;
  const scaled = rhs.map(value => {
    const result = value / rhsScale;
    if (value !== 0 && result === 0) throw new RangeError('Residual refinement scaling loses a nonzero input.');
    return result;
  });
  const projected = Array.from({ length: count }, (_, k) => {
    const value = scaled.reduce((sum, entry, i) => sum + factor.u[i][k] * entry, 0), result = rhsScale * value;
    if (!Number.isFinite(result) || value !== 0 && result === 0) throw new RangeError('Residual refinement projection exceeds finite precision.');
    return result;
  });
  const diagonal = Array.from({ length: count }, (_, i) => Array.from({ length: count }, (_, j) => i === j ? factor.singularValues[i] : 0));
  const step = solveSvdLeastSquares(diagonal, projected, { ...policy.svd, damping });
  if (step.status !== 'solved') return null;
  const coefficientScale = Math.max(...step.solution!.map(Math.abs));
  if (coefficientScale === 0) return null;
  const coefficients = step.solution!.map(value => {
    const result = value / coefficientScale;
    if (value !== 0 && result === 0) throw new RangeError('Residual refinement coefficients lose a nonzero input.');
    return result;
  });
  return factor.v.map(row => {
    const value = coefficients.reduce((sum, coefficient, k) => sum + row[k] * coefficient, 0), result = coefficientScale * value;
    if (!Number.isFinite(result) || value !== 0 && result === 0) throw new RangeError('Residual refinement step exceeds finite precision.');
    return result;
  });
}
function solveGroup(problem: RigidMateProblem, group: Group, poses: Map<string, RigidPose>, policy: Policy,
  evidence: RigidGroupEvidence, diagnostics: string[], acceptedAngles: Map<string, AssemblyGearAngles>, acceptedScrewAngles: Map<string, number>, acceptedRackPinionAngles: Map<string, number>, trialBudget?:{remaining:number}): RigidMateSolveStatus | null {
  let local = rebaseRigidRackPinionAngles(rebaseRigidScrewAngles(rebaseRigidGearAngles(groupProblem(problem, group, poses), acceptedAngles), acceptedScrewAngles), acceptedRackPinionAngles);
  const free = new Set(group.bodyIds);
  const acceptAngles = (value: RigidMateEvaluation) => {
    for (const [id, angles] of value.gearAngles) acceptedAngles.set(id, { ...angles });
    local = rebaseRigidGearAngles(local, value.gearAngles);
    for (const [id, angle] of value.screwAngles) acceptedScrewAngles.set(id, angle);
    local = rebaseRigidScrewAngles(local, value.screwAngles);
    for (const [id, angle] of value.rackPinionAngles) acceptedRackPinionAngles.set(id, angle);
    local = rebaseRigidRackPinionAngles(local, value.rackPinionAngles);
  };
  let evaluation = evaluateRigidMates(local, poses);
  // Legacy orientation seeds can jump over angular branches. A group tracking
  // any mechanical tracker must restore its chart by continuous trials. The
  // new unilateral family also has no seed or antipodal fallback.
  const tracksGears = local.constraints.some(c => c.type === 'hinge' && !!c.stops || c.type === 'gear' || c.type === 'screw' || c.type === 'rack-pinion' || c.type === 'limit-distance' || c.type === 'limit-angle' || c.type === 'limit-directed-angle') || !!local.passiveGears?.length || !!local.passiveScrews?.length || !!local.passiveRackPinions?.length;
  for (let pass = 0; !tracksGears && pass < policy.maxSeedPasses && evaluation.diagnostics.some(value => value.code === 'orientationChart'); pass++) {
    let changed = false;
    for (const diagnostic of evaluation.diagnostics) if (diagnostic.code === 'orientationChart') {
      const constraint = group.constraints.find(c => c.id === diagnostic.constraintId)!;
      if (seedConstraint(constraint, free, poses, problem)) { changed = true; evidence.seededConstraintIds.push(constraint.id); }
    }
    if (!changed) break;
    evaluation = evaluateRigidMates(local, poses);
  }
  if (!evaluation.diagnostics.length) acceptAngles(evaluation);
  let damping = policy.initialDamping;
  const restorationRows = (value:RigidMateEvaluation) => value.angularLimitCharts ? angularRestorationRows(value) : value.inequalities ? [...value.rows,...value.inequalities.filter(item=>item.margin<0).map(item=>({
    constraintId:item.constraintId,kind:item.kind??'length' as const,residual:item.margin,tolerance:item.tolerance,jacobian:item.jacobian}))] : value.rows;
  for (;;) {
    recordEvaluation(evidence, evaluation);
    if (evaluation.diagnostics.length) { diagnostics.push(...evaluation.diagnostics.map(value => value.constraintId + ': ' + value.message)); return diagnosticStatus(evaluation); }
    let refinement: JacobiSvdResult | null = null;
    if (satisfied(evaluation, local)) {
      const factor = finalFactor(evaluation, evidence, policy);
      if (factor && !factor.evidence.certified) return 'nonConverged';
      if (evidence.rank !== null) return null;
      // Equivalent relations can have different off-manifold moving frames.
      // A small accepted residual can therefore leave an ambiguous singular
      // mode. Refine only certified modes, then refactor the COMPLETE Jacobian.
      // Neither the lower rank bound nor the reduced solve is published as rank.
      refinement = factor;
      if (!refinement || refinement.rankRange[0] === 0 || evaluation.rows.every(row => row.residual === 0)) return 'rankUncertain';
    }
    if (evidence.iterations >= policy.maxIterations) return refinement ? 'rankUncertain' : 'nonConverged';
    let openingTrials=0;
    if(evaluation.angularLimitCharts?.some(chart=>chart.openingRows&&!evaluation.checks.find(check=>check.constraintId===chart.constraintId)?.satisfied)){
      const currentNorm=angularRestorationNorm(evaluation),opening=searchAngularLimitOpening(evaluation,evidence.variableCount,
        {maxTrials:Math.min(policy.maxTrials,trialBudget?.remaining??policy.maxTrials),maxStepNorm:policy.maxStepNorm,angleTolerance:problem.angleTolerance,svd:policy.svd},
        (delta,remainingTrials)=>{
          const candidate=new Map(poses),rotationSteps=new Map(group.bodyIds.map((id,index)=>[id,Math.hypot(...delta.slice(index*6+3,index*6+6))]));
          if(!admitRigidGearStep(local,poses,rotationSteps)||!admitRigidScrewStep(local,poses,rotationSteps)||!admitRigidRackPinionStep(local,poses,rotationSteps))return{value:null,trials:0};
          group.bodyIds.forEach((id,index)=>candidate.set(id,retractRigidBodyPose(poses.get(id)!,delta.slice(index*6,index*6+6),problem.origin,problem.lengthScale)));
          // Restore the true bilateral manifold, not the violated interval. A
          // distance interval retains its alignment; a feasible endpoint stop
          // retains its alignment kernel. These are temporary numeric charts.
          const endpointIds=new Set(angularEndpointKernelRows(evaluation).map(row=>row.constraintId)),hardConstraints=local.constraints.flatMap<RigidMateConstraint>(constraint=>{
            if(constraint.type==='limit-angle')return endpointIds.has(constraint.id)?[{id:constraint.id,type:'angle' as const,first:constraint.first,second:constraint.second,angle:constraint.limits.minimum}]:[];
            return constraint.type==='limit-distance'?[{id:constraint.id,type:'parallel' as const,first:constraint.first,second:constraint.second,alignment:constraint.alignment}]:[constraint];
          }),hardProblem={...local,constraints:hardConstraints},hardGroup={bodyIds:[...group.bodyIds],constraints:hardConstraints},
            hardEvidence=blankEvidence(hardGroup,hardProblem),hardGears=new Map([...acceptedAngles].map(([id,value])=>[id,{...value}])),hardScrews=new Map(acceptedScrewAngles),hardRacks=new Map(acceptedRackPinionAngles),budget={remaining:remainingTrials};
          const status=solveGroup(hardProblem,hardGroup,candidate,{...policy,maxSeedPasses:0,maxIterations:Math.max(0,policy.maxIterations-evidence.iterations-1)},hardEvidence,[],hardGears,hardScrews,hardRacks,budget);
          evidence.iterations+=hardEvidence.iterations;
          const spent=remainingTrials-budget.remaining;
          if(status)return{value:null,trials:spent};
          const next=evaluateAngularManifoldCandidate(local,candidate,hardGears,hardScrews,hardRacks);
          if(next.diagnostics.length||next.checks.some(check=>!check.satisfied&&evaluation.checks.find(previous=>previous.constraintId===check.constraintId)?.satisfied)
            ||angularRestorationNorm(next)>=currentNorm)return{value:null,trials:spent};
          return{value:{poses:candidate,evaluation:next},trials:spent};
        });
      openingTrials=opening.evidence.trials;evidence.trials+=openingTrials;if(trialBudget)trialBudget.remaining-=openingTrials;
      const previous=evidence.angularLimitSearch;
      evidence.angularLimitSearch={trials:(previous?.trials??0)+openingTrials,pivots:(previous?.pivots??0)+opening.evidence.pivots,
        finiteProbes:(previous?.finiteProbes??0)+opening.evidence.finiteProbes,accepted:(previous?.accepted??false)||opening.evidence.accepted,
        ...(opening.evidence.method?{method:opening.evidence.method}:previous?.method?{method:previous.method}:{})};
      if(opening.value){group.bodyIds.forEach(id=>poses.set(id,opening.value!.poses.get(id)!));evaluation=opening.value.evaluation;acceptAngles(evaluation);evidence.iterations++;continue;}
      if(evidence.iterations>=policy.maxIterations||openingTrials>=policy.maxTrials)return'nonConverged';
    }
    // New unilateral groups keep bilateral GN restoration soft away from the
    // manifold. Its redundant angular rows are never exact affine constraints.
    const restoring = restorationRows(evaluation), jacobian = restoring.map(row => row.jacobian), rhs = restoring.map(row => -row.residual);
    if (!jacobian.length) return 'nonConverged';
    const currentNorm = evaluation.angularLimitCharts?angularRestorationNorm(evaluation):Math.hypot(...rhs);
    if (!Number.isFinite(currentNorm)) return 'precisionLimit';
    let accepted = false;
    for (let trial = 0; trial < policy.maxTrials-openingTrials && (!trialBudget||trialBudget.remaining>0); trial++) {
      evidence.trials++;
      if(trialBudget)trialBudget.remaining--;
      let delta: number[];
      if (refinement) {
        const step = certifiedResidualRefinement(refinement, rhs, policy, damping);
        if (!step) return 'rankUncertain';
        delta = step;
      } else {
        const step = solveSvdLeastSquares(jacobian, rhs, { ...policy.svd, damping });
        if (step.status !== 'solved') {
          finalFactor(evaluation, evidence, policy); return step.status === 'rankUncertain' ? 'rankUncertain' : 'nonConverged';
        }
        delta = step.solution!;
      }
      let norm = Math.hypot(...delta);
      if (!Number.isFinite(norm)) return 'precisionLimit';
      if (norm > policy.maxStepNorm) { delta = delta.map(value => value * policy.maxStepNorm / norm); norm = policy.maxStepNorm; }
      if (norm === 0) break;
      const candidate = new Map(poses);
      let candidateEvaluation: RigidMateEvaluation | undefined;
      try {
        const rotationSteps = new Map(group.bodyIds.map((id, index) => [id, Math.hypot(...delta.slice(index * 6 + 3, index * 6 + 6))]));
        if (!admitRigidGearStep(local, poses, rotationSteps) || !admitRigidScrewStep(local, poses, rotationSteps) || !admitRigidRackPinionStep(local, poses, rotationSteps)) throw new Error('Angular trial exceeds its continuous chart.');
        group.bodyIds.forEach((id, index) => candidate.set(id, retractRigidBodyPose(poses.get(id)!, delta.slice(index * 6, index * 6 + 6), problem.origin, problem.lengthScale)));
        candidateEvaluation = evaluateRigidMates(local, candidate);
      } catch { /* A failed finite/chart proposal is never published. */ }
      if (candidateEvaluation && !candidateEvaluation.diagnostics.length && (!refinement || satisfied(candidateEvaluation, local))
        && (candidateEvaluation.angularLimitCharts?angularRestorationNorm(candidateEvaluation):Math.hypot(...restorationRows(candidateEvaluation).map(row => row.residual))) < currentNorm) {
        group.bodyIds.forEach(id => poses.set(id, candidate.get(id)!)); evaluation = candidateEvaluation; acceptAngles(evaluation);
        evidence.iterations++; damping = Math.max(1e-12, damping * .2); accepted = true; break;
      }
      damping *= 10; if (!Number.isFinite(damping)) return 'precisionLimit';
    }
    if (!accepted) return refinement ? 'rankUncertain' : 'nonConverged';
  }
}

/** Pure simultaneous solve. Native authority and transaction freshness stay external. */
export function solveRigidMates(input: RigidMateProblem, requested: RigidMateSolverOptions = {}): RigidMateSolveResult {
  const evidence: RigidMateSolveResult['evidence'] = { groups: [], diagnostics: [], maxLengthResidual: 0, maxAngleResidual: 0 };
  let variables = 0;
  const fail = (status: RigidMateSolveStatus, certificates: RigidInconsistencyCertificate[] = []): RigidMateSolveResult => {
    let lower = 0, upper = variables;
    for (const group of evidence.groups) {
      const physicallySatisfied = group.checks.length === group.constraintIds.length && group.checks.every(check => check.satisfied);
      if (physicallySatisfied && (group.rank !== null || group.factorEvidence?.certified)) {
        lower += group.rankRange[0]; upper -= group.variableCount - group.rankRange[1];
      }
    }
    return { status, poses: null, gearAngles: new Map(), screwAngles: new Map(), rackPinionAngles: new Map(), localDOF: null, rank: null, rankRange: [lower, upper], localDOFRange: [variables - upper, variables - lower],
      iterations: evidence.groups.reduce((n, value) => n + value.iterations, 0), certificates, evidence };
  };
  let problem: RigidMateProblem, policy: Policy;
  try {
    problem = cloneProblem(input); policy = policyCopy(requested);
    if (policy.angleRefinementTolerance !== undefined && policy.angleRefinementTolerance > problem.angleTolerance) throw new Error('Angular refinement tolerance cannot exceed the public problem tolerance.');
    if (policy.lengthRefinementTolerance !== undefined && policy.lengthRefinementTolerance > problem.lengthTolerance) throw new Error('Length refinement tolerance cannot exceed the public problem tolerance.');
    variables = problem.bodies.filter(body => !body.fixed).length * 6;
  }
  catch (error) { evidence.diagnostics.push(error instanceof Error ? error.message : 'Invalid numerical input.'); return fail(error instanceof CapacityError ? 'capacityLimit' : 'invalidInput'); }
  try {
    const { groups, fixedConstraints } = partition(problem), poses = new Map(problem.bodies.map(body => [body.id, validateRigidPose(body.pose)]));
    const variableProblem = policy.angleRefinementTolerance === undefined && policy.lengthRefinementTolerance === undefined ? problem
      : { ...problem, angleTolerance: policy.angleRefinementTolerance ?? problem.angleTolerance,
        lengthTolerance: policy.lengthRefinementTolerance ?? problem.lengthTolerance };
    // Initial/passive angle state includes immutable relations and therefore
    // retains public admission. Each variable group rebases with its own tighter problem.
    const gearAngles = deriveRigidGearAngles(problem, poses);
    const screwAngles = deriveRigidScrewAngles(problem, poses);
    const rackPinionAngles = deriveRigidRackPinionAngles(problem, poses);
    const certificates = offsetCertificates(problem);
    if (certificates.length) return fail('inconsistent', certificates);
    for (const constraint of fixedConstraints) {
      const used = new Set(endpointIds(constraint)), local = { ...problem, passiveGears: undefined, passiveScrews: undefined, passiveRackPinions: undefined, bodies: problem.bodies.filter(body => used.has(body.id)), constraints: [constraint] };
      const evaluated = evaluateRigidMates(local, poses);
      evidence.maxLengthResidual = Math.max(evidence.maxLengthResidual, evaluated.maxLengthResidual); evidence.maxAngleResidual = Math.max(evidence.maxAngleResidual, evaluated.maxAngleResidual);
      if (evaluated.diagnostics.length) { evidence.diagnostics.push(...evaluated.diagnostics.map(value => value.message)); return fail(diagnosticStatus(evaluated)); }
      if (!satisfied(evaluated, local)) return fail('inconsistent', [{ kind: 'fixedConstraint', constraintIds: [constraint.id],
        rows: evaluated.rows.map(({ kind, residual, tolerance }) => ({ kind, residual, tolerance })), checks: evaluated.checks.map(check => ({ ...check })) }]);
    }
    for (const group of groups) {
      const item = blankEvidence(group, variableProblem); evidence.groups.push(item);
      const status = solveGroup(variableProblem, group, poses, policy, item, evidence.diagnostics, gearAngles, screwAngles, rackPinionAngles);
      evidence.maxLengthResidual = Math.max(evidence.maxLengthResidual, item.maxLengthResidual); evidence.maxAngleResidual = Math.max(evidence.maxAngleResidual, item.maxAngleResidual);
      if (status) return fail(status);
    }
    const rank = evidence.groups.reduce((total, group) => total + group.rank!, 0), localDOF = variables - rank;
    return { status: localDOF === 0 ? 'fullyDefined' : 'underdefined', poses: new Map([...poses].map(([id, pose]) => [id, validateRigidPose(pose)])), gearAngles: new Map([...gearAngles].map(([id, value]) => [id, { ...value }])), screwAngles: new Map(screwAngles), rackPinionAngles: new Map(rackPinionAngles),
      localDOF, rank, rankRange: [rank, rank], localDOFRange: [localDOF, localDOF], iterations: evidence.groups.reduce((n, group) => n + group.iterations, 0), certificates: [], evidence };
  } catch (error) { evidence.diagnostics.push(error instanceof Error ? error.message : 'Numerical solve failed.'); return fail(error instanceof CapacityError ? 'capacityLimit' : error instanceof AngularLimitRankError ? error.status : error instanceof RotationChartError ? 'nonConverged' : 'precisionLimit'); }
}
