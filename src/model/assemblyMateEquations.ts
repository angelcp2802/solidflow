import { copyRigidHingeConstraint } from './assemblyHingeNumeric';
import { evaluateHingeStopsGeometry } from './assemblyHingeStopsGeometry';
import { copyRigidCircularPathConstraint } from './assemblyCircularPathNumeric';
import { evaluateCircularPathGeometry } from './assemblyCircularPathGeometry';
import { evaluateLinePathRoll } from './assemblyLinePathRollGeometry';
import { copyRigidLinePathConstraint } from './assemblyLinePathNumeric';
import type { Vec3 } from '../cad/kernel.types';
import { RotationChartError, rotationLog, so3LeftJacobianInverse, type Matrix3 } from './assemblyKinematics';
import type { RigidMateEndpoint, RigidMateEvaluation, RigidMateProblem, RigidMateRow, RigidMateSupport, RigidSymmetryConstraint, RigidSymmetrySupportUncertainty, RigidHingeStopMeasurement, RigidMateInequality } from './assemblySolveTypes';
import { composeRigidPoses, identityRigidPose, rigidRotationMatrix, validateRigidPose, type Quaternion, type RigidPose } from './rigidPose';
import { assemblyGearWeights, rigidGearTwists } from './assemblyGear';
import { assemblyScrewAdvance, rigidScrewTwist } from './assemblyScrew';
import { assemblyRackPinionAdvance, assemblyRackPinionAxisPoint, canonicalAssemblyRackDirection, rigidRackPinionTwist } from './assemblyRackPinion';
import { assemblyDirectionMateAngle } from './assemblyDirectionMates';
import { assemblyTangentAxisPoint, assemblyTangentPlanePoint, assemblyTangentSideSign } from './assemblyTangentMates';
import { assemblyCylinderTangentTarget } from './assemblyCylinderTangentMates';
import { assemblySphereTangentTarget } from './assemblySphereTangentMates';
import { assemblyLimitDistanceActivity, validateAssemblyLimitDistanceLimits } from './assemblyLimitDistance';
import { assemblyLimitAngleActivity, assemblyLimitAngleRadians, classifyAssemblyLimitAngleStratum, validateAssemblyLimitAngleLimits } from './assemblyLimitAngle';
import { measureDirectedAngle } from './assemblyDirectedAngle';
import { evaluateAssemblyDirectedAngleArc } from './assemblyLimitDirectedAngle';
import { compareConditionedPlaneBisectors, type ConditionedPlaneBisectorSupport } from './assemblyPlaneBisectors';
import { copyRigidProfileCenterConstraint } from './assemblyProfileCenterNumeric';
import { compareConditionedProfileCenters, type ConditionedProfileCenterSupport } from './assemblyProfileCenterGeometry';
import { compareConditionedSymmetrySupports, type ConditionedSymmetrySupport } from './assemblySymmetryGeometry';

/** Shared by direct evaluation and detached solver copying. No accessors or
 * family-inapplicable uncertainty fields are admitted. */
export function copySymmetryUncertainty(constraint: RigidSymmetryConstraint): RigidSymmetryConstraint['uncertainty'] {
  const descriptor=Object.getOwnPropertyDescriptor(constraint,'uncertainty');
  if(!descriptor){if('uncertainty' in constraint)throw Error('Uncertainty must be own data.');return undefined}
  if(!descriptor.enumerable||!('value' in descriptor))throw Error('Uncertainty must be own data.');
  const list=descriptor.value;
  if(!Array.isArray(list)||Object.getPrototypeOf(list)!==Array.prototype||list.length!==3||Reflect.ownKeys(list).length!==4)throw Error('Uncertainty requires three dense roles.');
  const copy=(endpoint:RigidMateEndpoint,i:number):RigidSymmetrySupportUncertainty=>{
    const entry=Object.getOwnPropertyDescriptor(list,String(i));
    if(!entry?.enumerable||!('value' in entry))throw Error('Uncertainty requires dense data roles.');
    const value=entry.value,kind=endpoint.support?.kind;
    const names=['positionErrorMm',...(kind==='plane'||kind==='line'||kind==='cylinder'?['directionErrorRad']:[]),...(kind==='sphere'||kind==='cylinder'?['radiusErrorMm']:[])];
    if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==names.length)throw Error('Invalid uncertainty data.');
    const result:Record<string,number>={};
    for(const name of Reflect.ownKeys(value)){
      const field=Object.getOwnPropertyDescriptor(value,name)!;
      if(typeof name!=='string'||!names.includes(name)||!field.enumerable||!('value' in field)||typeof field.value!=='number'||!Number.isFinite(field.value)||field.value<0)throw Error('Invalid uncertainty field.');
      result[name]=field.value;
    }
    return {positionErrorMm:result.positionErrorMm,
      ...(names.includes('directionErrorRad')?{directionErrorRad:result.directionErrorRad}:{}),
      ...(names.includes('radiusErrorMm')?{radiusErrorMm:result.radiusErrorMm}:{})};
  };
  return [copy(constraint.source,0),copy(constraint.target,1),copy(constraint.mirror,2)];
}

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Mate arithmetic exceeds finite precision.');
  return value;
}
const MIN_NORMALIZED_LENGTH = 2 ** -1022;
/** The spherical charts reject subnormal/zeroed nonzero length inputs rather
 * than treating a relative Float64 error bound as an absolute zero quantum. */
function certifiedSphericalNormalization(source: number, normalized: number): number {
  finite(normalized);
  if (source !== 0 && Math.abs(normalized) < MIN_NORMALIZED_LENGTH) throw new RangeError('Spherical length normalization cannot certify a nonzero subnormal or underflowed input.');
  return normalized;
}
function vector(value: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Expected a three-coordinate vector.');
  return Array.from({ length: 3 }, (_, i) => {
    const field = Object.getOwnPropertyDescriptor(value, String(i));
    if (!field || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) throw new Error('Expected finite vector data.');
    return field.value as number;
  }) as Vec3;
}
function add(a: Vec3, b: Vec3): Vec3 { return a.map((v, i) => finite(v + b[i])) as Vec3; }
function subtract(a: Vec3, b: Vec3): Vec3 { return a.map((v, i) => finite(v - b[i])) as Vec3; }
function multiply(a: Vec3, scalar: number): Vec3 { return a.map(v => finite(v * scalar)) as Vec3; }
function dot(a: Vec3, b: Vec3): number { return finite(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]); }
function cross(a: Vec3, b: Vec3): Vec3 {
  return [finite(a[1] * b[2] - a[2] * b[1]), finite(a[2] * b[0] - a[0] * b[2]), finite(a[0] * b[1] - a[1] * b[0])];
}
function rotate(matrix: Matrix3, point: Vec3): Vec3 {
  return [dot([matrix[0], matrix[1], matrix[2]], point), dot([matrix[3], matrix[4], matrix[5]], point), dot([matrix[6], matrix[7], matrix[8]], point)];
}
function transpose(matrix: Matrix3): Matrix3 { return [matrix[0], matrix[3], matrix[6], matrix[1], matrix[4], matrix[7], matrix[2], matrix[5], matrix[8]]; }
function unit(value: Vec3): Vec3 {
  const copy = vector(value), norm = Math.hypot(...copy);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-8) throw new Error('Analytic support direction must be a nondegenerate unit vector.');
  return multiply(copy, 1 / norm);
}
function checkedSupport(support: RigidMateSupport): RigidMateSupport {
  if (!support || !['point', 'plane', 'cylinder', 'line', 'sphere'].includes(support.kind)) throw new Error('Unsupported analytic support.');
  const point = vector(support.point);
  if (!Number.isFinite(support.tolerance) || support.tolerance < 0) throw new Error('Native support tolerance must be finite and nonnegative.');
  if (support.kind === 'point') return { kind: 'point', point, tolerance: support.tolerance };
  if (support.kind === 'sphere') {
    if (!Number.isFinite(support.radius) || support.radius <= 0) throw new Error('Sphere radius must be finite and positive.');
    return { kind: 'sphere', point, radius: support.radius, tolerance: support.tolerance };
  }
  const direction = unit(support.kind === 'plane' ? support.normal : support.axis);
  if (support.kind === 'line') return { kind: 'line', point, axis: direction, tolerance: support.tolerance };
  const xDirection = unit(support.xDirection);
  if (Math.abs(dot(direction, xDirection)) > 1e-8) throw new Error('Analytic support frame directions must be perpendicular.');
  if (support.kind === 'plane') return { kind: 'plane', point, normal: direction, xDirection, tolerance: support.tolerance };
  if (!Number.isFinite(support.radius) || support.radius <= 0) throw new Error('Cylinder radius must be finite and positive.');
  return { kind: 'cylinder', point, axis: direction, xDirection, radius: support.radius, tolerance: support.tolerance };
}
function quaternionProduct(a: Quaternion, b: Quaternion): Quaternion {
  return composeRigidPoses({ translation: [0, 0, 0], rotation: a }, { translation: [0, 0, 0], rotation: b }).rotation;
}
function inverseQuaternion(q: Quaternion): Quaternion { return [-q[0], -q[1], -q[2], q[3]]; }
interface Endpoint {
  bodyId: string | null;
  origin: Vec3;
  point: Vec3;
  direction: Vec3 | null;
  rotation: Quaternion;
  support?: RigidMateSupport;
  /** Normalized Float64 composition bound for spherical and limit-distance charts. */
  pointError: number;
}
interface Variation { point: Vec3; origin: Vec3; direction: Vec3; omega: Vec3 }
const ZERO: Vec3 = [0, 0, 0];
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** Pure simultaneous residual/Jacobian evaluation; numeric supports confer no native authority. */
export function evaluateRigidMates(problem: RigidMateProblem, poses?: ReadonlyMap<string, RigidPose>): RigidMateEvaluation {
  const center = vector(problem.origin), scale = problem.lengthScale;
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(problem.lengthTolerance) || problem.lengthTolerance <= 0
    || !Number.isFinite(problem.angleTolerance) || problem.angleTolerance <= 0) throw new Error('Mate conditioning and tolerances must be finite and positive.');
  const bodies = new Map<string, RigidPose>(), free: string[] = [];
  for (const body of problem.bodies) {
    if (typeof body.id !== 'string' || body.id.length === 0 || bodies.has(body.id) || typeof body.fixed !== 'boolean') throw new Error('Rigid bodies need distinct IDs and explicit fixed state.');
    bodies.set(body.id, validateRigidPose(poses?.get(body.id) ?? body.pose));
    if (!body.fixed) free.push(body.id);
  }
  const columns = free.length * 6;
  const endpoint = (input: RigidMateEndpoint, directionOnly = false, trackPointPrecision = false): Endpoint => {
    if (input.bodyId !== null && !bodies.has(input.bodyId)) throw new Error('Mate endpoint names a missing rigid body.');
    const body = input.bodyId === null ? identityRigidPose() : bodies.get(input.bodyId)!;
    const frame = validateRigidPose(input.frame), bodyRotation = rigidRotationMatrix(body.rotation);
    const rotation = quaternionProduct(body.rotation, frame.rotation), matrix = rigidRotationMatrix(rotation);
    // New direction-only families never normalize irrelevant origins or points.
    // Subtract the fixed origin before adding local placements, preserving a distant common frame.
    const origin = directionOnly ? ZERO : input.bodyId === null ? frame.translation.map((coordinate, i) => finite((coordinate - center[i]) / scale)) as Vec3
      : add(body.translation.map((coordinate, i) => finite((coordinate - center[i]) / scale)) as Vec3,
        rotate(bodyRotation, multiply(frame.translation, 1 / scale)));
    const support = input.support === undefined ? undefined : checkedSupport(input.support);
    const point = support && !directionOnly ? add(origin, rotate(matrix, multiply(support.point, 1 / scale))) : origin;
    const direction = support && support.kind !== 'sphere' && support.kind !== 'point' ? rotate(matrix, support.kind === 'plane' ? support.normal : support.axis) : null;
    // Bound the terms BEFORE cancellable sums and matrix products. The solve
    // origin is subtracted first: a distant common frame does not itself lose
    // a small declared relative displacement. Local frame/support offsets can
    // still cancel it, even when the resulting point has a tiny magnitude.
    // Norms of the unrotated vectors also bound cancellation inside R*v.
    const base = input.bodyId === null ? frame.translation : body.translation;
    let pointError = 0;
    if (trackPointPrecision) {
      const baseOffset = base.map((coordinate, i) => finite(coordinate - center[i])) as Vec3;
      const normalizedBase = baseOffset.map(value => certifiedSphericalNormalization(value, value / scale));
      const frameOffset = input.bodyId === null ? ZERO : frame.translation, localPoint = support?.point ?? ZERO;
      const normalizedFrame = multiply(frameOffset, 1 / scale).map((value, i) => certifiedSphericalNormalization(frameOffset[i], value));
      const normalizedPoint = multiply(localPoint, 1 / scale).map((value, i) => certifiedSphericalNormalization(localPoint[i], value));
      pointError = finite(32 * Number.EPSILON * finite(Math.hypot(...normalizedBase) + Math.hypot(...normalizedFrame) + Math.hypot(...normalizedPoint)));
    }
    return { bodyId: input.bodyId, origin, point, direction, rotation, support, pointError };
  };
  const variation = (end: Endpoint, column: number): Variation => {
    if (end.bodyId !== free[Math.floor(column / 6)]) return { point: ZERO, origin: ZERO, direction: ZERO, omega: ZERO };
    const coordinate = column % 6;
    if (coordinate < 3) return { point: AXES[coordinate], origin: AXES[coordinate], direction: ZERO, omega: ZERO };
    const omega = AXES[coordinate - 3];
    return { point: cross(omega, end.point), origin: cross(omega, end.origin), direction: end.direction ? cross(omega, end.direction) : ZERO, omega };
  };
  const result: RigidMateEvaluation = { rows: [], diagnostics: [], checks: [], maxLengthResidual: 0, maxAngleResidual: 0, gearAngles: new Map(), screwAngles: new Map(), rackPinionAngles: new Map() };
  for (const constraint of problem.constraints) {
    // Dispatch and identity are executable too unless checked through their
    // descriptors before the generic loop reads them. Keep the existing
    // top-level malformed-declaration throw contract for every family.
    for (const name of ['id', 'type'] as const) {
      const field = constraint && typeof constraint === 'object' ? Object.getOwnPropertyDescriptor(constraint, name) : undefined;
      if (!field?.enumerable || !('value' in field) || typeof field.value !== 'string') throw new Error('Mate identity and family must be own enumerable string data.');
    }
  }
  const angularOnlyIntervalContext=problem.constraints.some(constraint=>constraint.type==='limit-angle'||constraint.type==='limit-directed-angle')
    &&problem.constraints.every(constraint=>['limit-angle','limit-directed-angle','angle','parallel','perpendicular'].includes(constraint.type))
    &&!problem.passiveGears?.length&&!problem.passiveScrews?.length&&!problem.passiveRackPinions?.length;
  const ids = new Set<string>();
  for (const constraint of problem.constraints) {
    if (typeof constraint.id !== 'string' || constraint.id.length === 0 || ids.has(constraint.id)) throw new Error('Mate IDs must be distinct and nonempty.');
    ids.add(constraint.id);
    try {
      if(constraint.type==='hinge')  {
        const c = copyRigidHingeConstraint(constraint);
        const ends = [...c.axis, ...c.axial].map(e => endpoint(e, false, true));
        const [a, b, p, q] = ends;
        const R = rigidRotationMatrix(a.rotation), Rt = transpose(R);
        const n = a.direction!, m = b.direction!, sign = c.alignment === 'aligned' ? 1 : -1;
        const localAxis = rotate(Rt, n);
        const seed = Math.abs(localAxis[0]) < .8 ? AXES[0] : AXES[1];
        // This constructed perpendicular is not an input unit vector. Its
        // length is bounded away from zero by the seed choice, then normalized.
        const perpendicular = cross(localAxis, seed), perpendicularLength = Math.hypot(...perpendicular);
        if (!Number.isFinite(perpendicularLength) || perpendicularLength < .5) throw new RangeError('Hinge transverse frame is degenerate.');
        const u = multiply(perpendicular, 1 / perpendicularLength), v = cross(localAxis, u);
        const d=subtract(b.point,a.point),h=subtract(q.point,p.point),chord=rotate(Rt,subtract(m,multiply(n,sign))),theta=Math.atan2(Math.hypot(...cross(n,multiply(m,sign))),dot(n,multiply(m,sign)));
        if(theta>=Math.PI-1e-7)throw new RotationChartError('Hinge signed axes require another angular chart.');
        const chordLength=Math.hypot(...chord),square=chordLength*chordLength,factor=chordLength<1e-4?1+square/24+3*square*square/640:theta/chordLength,radial=chordLength<1e-4?1/12+3*square/160:(1/Math.cos(theta/2)-factor)/square;
        const localD=rotate(Rt,d),offset=dot(n,h),transverse=[dot(u,localD),dot(v,localD)],lengthResidual=finite(Math.max(Math.hypot(...transverse),Math.abs(offset))*scale);
        const physicalTolerance = problem.lengthTolerance;
        const topologySum = finite(ends.reduce((sum, e) => sum + (e.support?.tolerance ?? 0), 0));
        if (topologySum > physicalTolerance) throw new RangeError('Hinge support envelopes exceed the requested length band.');
        const tolerance = certifiedSphericalNormalization(physicalTolerance, physicalTolerance / scale);
        const uncertainty=c.uncertainty,pe=ends.map((e,i)=>finite(e.pointError+(uncertainty?certifiedSphericalNormalization(uncertainty[i].positionErrorMm,uncertainty[i].positionErrorMm/scale):certifiedSphericalNormalization(e.support?.tolerance??0,(e.support?.tolerance??0)/scale)))),de=ends.map((e,i)=> {
          const raw=[...c.axis,...c.axial][i].support!,direction=raw.kind==='plane'?raw.normal:raw.kind==='line'||raw.kind==='cylinder'?raw.axis:ZERO;
          return finite((uncertainty?.[i].directionErrorRad??0)+Math.abs(Math.hypot(...direction)-1)+128*Number.EPSILON)
        }
        );
        const angularError=finite(de[0]+de[1]),axialQualification=Math.max(Math.atan2(Math.hypot(...cross(n,p.direction!)),Math.abs(dot(n,p.direction!)))+de[0]+de[2],Math.atan2(Math.hypot(...cross(m,q.direction!)),Math.abs(dot(m,q.direction!)))+de[1]+de[3]);
        if(axialQualification>problem.angleTolerance)throw new RangeError('Hinge axial qualification cannot retain its angular band.');
        const lengthError=finite(Math.max(pe[0]+pe[1]+Math.hypot(...d)*2*Math.sin(Math.min(Math.PI,de[0])/2),pe[2]+pe[3]+Math.hypot(...h)*2*Math.sin(Math.min(Math.PI,de[0])/2))*scale);
        const nominal=lengthResidual<=physicalTolerance&&theta<=problem.angleTolerance,retained=lengthResidual+lengthError<=physicalTolerance&&theta+angularError<=problem.angleTolerance;
        if(lengthError>physicalTolerance||angularError>problem.angleTolerance||nominal&&!retained)throw new RangeError('Hinge arithmetic cannot retain requested bands.');
        const derivs=Array.from( {
          length:columns
        }
        ,(_,column)=> {
          const [da,db,dp,dq]=ends.map(e=>variation(e,column));
          const dc=rotate(Rt,subtract(subtract(db.direction,multiply(da.direction,sign)),cross(da.omega,subtract(m,multiply(n,sign))))),dd=rotate(Rt,subtract(subtract(db.point,da.point),cross(da.omega,d)));
          return  {
            angular:add(multiply(dc,factor),multiply(chord,radial*dot(chord,dc))),transverse:[dot(u,dd),dot(v,dd)],axial:dot(da.direction,h)+dot(n,subtract(dq.point,dp.point))
          }
          ;
        }
        );
        const rows:RigidMateRow[]=[];
        for(let i=0;
        i<3;
        i++)rows.push( {
          constraintId:c.id,kind:'angle',residual:finite(factor*chord[i]),tolerance:problem.angleTolerance,jacobian:derivs.map(d=>finite(d.angular[i]))
        }
        );
        for(let i=0;
        i<2;
        i++)rows.push( {
          constraintId:c.id,kind:'length',residual:finite(transverse[i]),tolerance,jacobian:derivs.map(d=>finite(d.transverse[i]))
        }
        );
        rows.push( {
          constraintId:c.id,kind:'length',residual:finite(offset),tolerance,jacobian:derivs.map(d=>finite(d.axial))
        }
        );
        let stopViolation = 0, stopsRetained = true;
        let stopMeasurement: RigidHingeStopMeasurement | undefined;
        const stopInequalities: RigidMateInequality[] = [];
        if (c.stops) {
          const angular = c.stops.angular.map(e => endpoint(e, true));
          const errors = c.stops.angular.map((e, i) => {
            const support = e.support!;
            if (support.kind !== 'plane') throw Error('Hinge angular roles require planar normals.');
            return finite((c.stops!.uncertainty?.[i].directionErrorRad ?? 0)
              + Math.abs(Math.hypot(...support.normal) - 1) + 128 * Number.EPSILON);
          });
          const geometry = evaluateHingeStopsGeometry({ first: angular[0].direction!, second: angular[1].direction!, guide: n,
            directionErrorsRad: [errors[0], errors[1], de[0]], arc: c.stops.arc, angleTolerance: problem.angleTolerance });
          const value = geometry.value;
          if (!value.fullCircle) {
            stopViolation = finite(Math.max(0, -value.marginsRadians.minimum, -value.marginsRadians.maximum));
            stopsRetained = stopViolation + geometry.directionErrorRad <= problem.angleTolerance;
            if (stopViolation <= problem.angleTolerance && !stopsRetained) throw new RangeError('Hinge stop uncertainty cannot retain its requested angular band.');
            const jacobian = Array.from({ length: columns }, (_, column) => finite(
              dot(geometry.gradients.first, variation(angular[0], column).direction)
              + dot(geometry.gradients.second, variation(angular[1], column).direction)
              + dot(geometry.gradients.guide, variation(a, column).direction)));
            stopInequalities.push(
              { constraintId: c.id, bound: 'minimum', kind: 'angle', margin: value.marginsRadians.minimum, tolerance: problem.angleTolerance, jacobian },
              { constraintId: c.id, bound: 'maximum', kind: 'angle', margin: value.marginsRadians.maximum, tolerance: problem.angleTolerance, jacobian: jacobian.map(x => -x) });
          }
          stopMeasurement = { constraintId: c.id, ...value, directionErrorRad: geometry.directionErrorRad,
            projectionLengths: { ...geometry.projectionLengths } };
        }
        result.rows.push(...rows);
        if (stopMeasurement) (result.hingeStops ??= []).push(stopMeasurement);
        if (stopInequalities.length) (result.inequalities ??= []).push(...stopInequalities);
        result.checks.push( {
          constraintId:c.id,lengthResidual,lengthTolerance:physicalTolerance,angleResidual:Math.max(theta, stopViolation),angleTolerance:problem.angleTolerance,satisfied:retained && stopsRetained
        }
        );
        result.maxLengthResidual=Math.max(result.maxLengthResidual,lengthResidual);
        result.maxAngleResidual=Math.max(result.maxAngleResidual,theta,stopViolation);
        continue;
      }
      if(constraint.type==='circular-path') {
        const c=copyRigidCircularPathConstraint(constraint),arc=c.second.arc;
        const a=endpoint(c.first,false,true),b=endpoint({bodyId:c.second.bodyId,frame:c.second.frame,support:{kind:'point',point:arc.center,tolerance:0}},false,true);
        const R=rigidRotationMatrix(b.rotation),local=(v:Vec3)=>rotate(transpose(R),v),world=(v:Vec3)=>rotate(R,v),delta=subtract(a.point,b.point),p=local(delta);
        const norm=(v:number)=>certifiedSphericalNormalization(v,v/scale),tolerance=norm(problem.lengthTolerance),radius=norm(arc.radiusMm);
        // Validate the physical coordinate before conditioning. A separately
        // divided endpoint can round beyond normalized R*sweep; a fraction of
        // the already validated physical trim preserves its exact endpoint.
        let position: {mode:'free';domain:'trim'|'support-circle'}|{mode:'coordinate';distance:number}=c.position.mode==='free'?c.position:{mode:'coordinate',distance:0},coordinatePhaseError=0;
        if(c.position.mode==='coordinate'){
          const direct=norm(c.position.distanceMm),fraction=c.position.distanceMm/(arc.radiusMm*arc.sweepRad);
          const distance=certifiedSphericalNormalization(c.position.distanceMm,finite(fraction*finite(radius*arc.sweepRad)));
          coordinatePhaseError=finite(Math.abs(distance-direct)/radius);
          position={mode:'coordinate',distance};
        }
        const geometry=evaluateCircularPathGeometry({point:p,radial:arc.radial,tangent:arc.tangent,radius,sweep:arc.sweepRad,
          position,
          positionError:finite(a.pointError+b.pointError+norm(c.first.support!.tolerance)+norm(arc.positionErrorMm)),radiusError:norm(arc.radiusErrorMm),
          frameErrorRad:finite(arc.frameErrorRad+coordinatePhaseError+128*Number.EPSILON),sweepErrorRad:arc.sweepErrorRad,lengthTolerance:tolerance});
        const dp=(col:number):Vec3=>{const da=variation(a,col),db=variation(b,col);return local(subtract(subtract(da.point,db.point),cross(db.omega,delta)))};
        const phase=(col:number)=>dot(geometry.phaseGradient,dp(col));
        for(const row of geometry.rows)result.rows.push({constraintId:c.id,kind:'length',residual:row.residual,tolerance,jacobian:Array.from({length:columns},(_,col)=>finite(dot(row.gradient,dp(col))))});
        for(const bound of geometry.inequalities)(result.inequalities??=[]).push({constraintId:c.id,bound:bound.bound,margin:bound.margin,tolerance,jacobian:Array.from({length:columns},(_,col)=>finite(dot(bound.gradient,dp(col))))});
        let angular=0,angularAcceptance=0;
        const tangent=world(geometry.tangent),normal=world(geometry.normal);
        if(c.follow){
          const axisWorld=rotate(rigidRotationMatrix(a.rotation),unit(c.follow.axis)),axisLocal=local(axisWorld),sign=c.follow.reverse?-1:1;
          // The phase-following orthonormal chart keeps the target tangent
          // constant, including off solution. Its derivative retains dphase.
          const frame=(v:Vec3):Vec3=>[dot(geometry.radial,v),dot(geometry.tangent,v),dot(geometry.normal,v)];
          const axis=frame(axisLocal),target:Vec3=[0,sign,0],q=subtract(axis,target);
          angular=Math.atan2(Math.hypot(...cross(axis,target)),dot(axis,target));
          const error=finite(c.follow.directionErrorRad+Math.abs(Math.hypot(...c.follow.axis)-1)+geometry.tangentErrorRad+128*Number.EPSILON);
          if(error>problem.angleTolerance)throw new RangeError('Circular Follow precisionLimit: angular band cannot be retained.');
          angularAcceptance=angular+error;
          if(angular+error>=Math.PI-1e-7)throw new RotationChartError('Circular Follow is too close to its antipodal chart.');
          const chord=Math.hypot(...q),square=chord*chord;
          const factor=chord<1e-4?1+square/24+3*square*square/640+5*square*square*square/7168:angular/chord;
          const radial=chord<1e-4?1/12+3*square/160+15*square*square/3584:(1/Math.cos(angular/2)-factor)/square;
          for(let k=0;k<3;k++)result.rows.push({constraintId:c.id,kind:'angle',residual:finite(q[k]*factor),tolerance:problem.angleTolerance,jacobian:Array.from({length:columns},(_,col)=>{
            const da=variation(a,col),db=variation(b,col),du=local(cross(subtract(da.omega,db.omega),axisWorld)),dphase=phase(col);
            const dq=add(frame(du),[dot(geometry.tangent,axisLocal)*dphase,-dot(geometry.radial,axisLocal)*dphase,0]);
            return finite(factor*dq[k]+radial*q[k]*dot(q,dq));
          })});
        }
        if(c.roll){
          const guide=endpoint(c.roll.guide,true),sourceAxis=rotate(rigidRotationMatrix(a.rotation),unit(c.roll.axis));
          if(!guide.direction||c.roll.guide.support?.kind!=='plane')throw Error('Circular UP requires an actual plane guide.');
          const guideError=c.roll.guideDirectionErrorRad+Math.abs(Math.hypot(...c.roll.guide.support.normal)-1)+128*Number.EPSILON,sourceError=c.roll.directionErrorRad+Math.abs(Math.hypot(...c.roll.axis)-1)+128*Number.EPSILON;
          const cone=(axis:Vec3,error:number)=>{const length=Math.hypot(...subtract(axis,multiply(tangent,dot(axis,tangent)))),change=2*Math.sin(Math.min(error,Math.PI)/2)+Math.sin(Math.min(geometry.tangentErrorRad,Math.PI/2))+256*Number.EPSILON;return change<length?Math.asin(change/length):Infinity};
          if(cone(guide.direction,guideError)>problem.angleTolerance)throw new RangeError('Circular UP guide projection cannot retain its requested band.');
          const canRestore=a.bodyId!==b.bodyId&&(a.bodyId!==null&&free.includes(a.bodyId)||b.bodyId!==null&&free.includes(b.bodyId));
          if(angular>problem.angleTolerance&&canRestore&&cone(sourceAxis,sourceError)>problem.angleTolerance)throw new RotationChartError('Circular Follow needs bounded initialization before UP.');
          const roll=evaluateLinePathRoll(sourceAxis,tangent,guide.direction,c.roll.reverse,[sourceError,geometry.tangentErrorRad,guideError],problem.angleTolerance);
          if(Math.abs(roll.theta)+roll.angularError>=Math.PI-1e-7)throw new RotationChartError('Circular UP is too close to its signed antipodal chart.');
          result.rows.push({constraintId:c.id,kind:'angle',residual:roll.theta,tolerance:problem.angleTolerance,jacobian:Array.from({length:columns},(_,col)=>{
            const effective=add(variation(b,col).omega,multiply(normal,phase(col)));
            return finite(dot(roll.derivatives[0],variation(a,col).omega)+dot(roll.derivatives[1],effective)+dot(roll.derivatives[2],variation(guide,col).omega));
          })});
          angular=Math.max(angular,Math.abs(roll.theta));angularAcceptance=Math.max(angularAcceptance,Math.abs(roll.theta)+roll.angularError);
        }
        const physical=finite(geometry.positionResidual*scale),retained=geometry.positionResidual+geometry.positionError<=tolerance&&geometry.inequalities.every(v=>v.margin-v.error>=-tolerance);
        result.maxLengthResidual=Math.max(result.maxLengthResidual,physical);result.maxAngleResidual=Math.max(result.maxAngleResidual,angular);
        result.checks.push({constraintId:c.id,lengthResidual:physical,lengthTolerance:problem.lengthTolerance,angleResidual:angular,angleTolerance:problem.angleTolerance,satisfied:retained&&angularAcceptance<=problem.angleTolerance});
        if(geometry.positionResidual<=tolerance&&geometry.inequalities.every(v=>v.margin>=-tolerance)&&angular<=problem.angleTolerance&&(!retained||angularAcceptance>problem.angleTolerance))throw new RangeError('Circular path precisionLimit: nominal residual plus uncertainty cannot retain its requested band.');
        continue;
      }
      if(constraint.type==='line-path') {
        const c=copyRigidLinePathConstraint(constraint), l=c.second.line;
        const a=endpoint(c.first,false,true),b=endpoint({bodyId:c.second.bodyId,frame:c.second.frame,support:{kind:'line',point:l.start,axis:l.direction,tolerance:0}},false,true);
        certifiedSphericalNormalization(l.lengthMm,l.lengthMm/scale);
        const R=rigidRotationMatrix(b.rotation), t=unit(l.direction), delta=subtract(a.point,b.point);
        const local=(v:Vec3):Vec3=>[dot([R[0],R[3],R[6]],v),dot([R[1],R[4],R[7]],v),dot([R[2],R[5],R[8]],v)];
        const d=local(delta),coordinate=c.coordinateMm===null?null:certifiedSphericalNormalization(c.coordinateMm,c.coordinateMm/scale);
        const axis=AXES.reduce((best,v)=>Math.abs(dot(v,t))<Math.abs(dot(best,t))?v:best,AXES[0]);
        const u=unit(cross(t,axis)),v=cross(t,u),basis=coordinate===null?[u,v]:AXES;
        const defect=coordinate===null?d:subtract(d,multiply(t,coordinate));
        const lever=coordinate===null?Math.hypot(...delta):Math.abs(coordinate);
        const error=finite(a.pointError+b.pointError+certifiedSphericalNormalization(c.first.support!.tolerance,c.first.support!.tolerance/scale)+certifiedSphericalNormalization(l.positionErrorMm,l.positionErrorMm/scale)+lever*(l.directionErrorRad+64*Number.EPSILON)+128*Number.EPSILON*Math.hypot(...delta));
        const tolerance=certifiedSphericalNormalization(problem.lengthTolerance,problem.lengthTolerance/scale);
        if(!Number.isFinite(error)||error>tolerance)throw new RangeError('Line path precisionLimit: requested length band cannot be retained.');
        for(const axis of basis) result.rows.push({constraintId:c.id,kind:'length',residual:finite(dot(axis,defect)),tolerance,jacobian:Array.from({length:columns},(_,col)=>{
          const da=variation(a,col),db=variation(b,col);return finite(dot(axis,local(subtract(subtract(da.point,db.point),cross(db.omega,delta)))));
        })});
        let angular=0,rollAcceptance=0;
        if(c.follow){
          const axisWorld=rotate(rigidRotationMatrix(a.rotation),unit(c.follow.axis)),signedT=multiply(t,c.follow.reverse?-1:1),axisLocal=local(axisWorld),q=subtract(axisLocal,signedT);
          angular=Math.atan2(Math.hypot(...cross(axisLocal,signedT)),dot(axisLocal,signedT));
          const angularError=finite(c.follow.directionErrorRad+l.directionErrorRad+Math.abs(Math.hypot(...c.follow.axis)-1)+Math.abs(Math.hypot(...l.direction)-1)+128*Number.EPSILON);
          if(angularError>problem.angleTolerance)throw new RangeError('LINE follow precisionLimit: angular band cannot be retained.');
          if(angular>=Math.PI-1e-7)throw new RotationChartError('LINE follow is too close to the antipodal chart.');
          const chord=Math.hypot(...q),square=chord*chord;
          const factor=chord<1e-4?1+square/24+3*square*square/640+5*square*square*square/7168:angular/chord;
          const radial=chord<1e-4?1/12+3*square/160+15*square*square/3584:(1/Math.cos(angular/2)-factor)/square;
          for(let k=0;k<3;k++)result.rows.push({constraintId:c.id,kind:'angle',residual:finite(q[k]*factor),tolerance:problem.angleTolerance,jacobian:Array.from({length:columns},(_,col)=>{
            const da=variation(a,col),db=variation(b,col),dq=local(cross(subtract(da.omega,db.omega),axisWorld));
            return finite(factor*dq[k]+radial*q[k]*dot(q,dq));
          })});
        }
        if(c.roll){
          const guide=endpoint(c.roll.guide,true),sourceAxis=rotate(rigidRotationMatrix(a.rotation),unit(c.roll.axis));
          if(!guide.direction||c.roll.guide.support?.kind!=='plane')throw Error('LINE roll requires a current plane normal.');
          const tangent=unit(b.direction!),normal=unit(guide.direction);
          const sourceError=c.roll.directionErrorRad+Math.abs(Math.hypot(...c.roll.axis)-1)+128*Number.EPSILON;
          const tangentError=l.directionErrorRad+Math.abs(Math.hypot(...l.direction)-1)+128*Number.EPSILON;
          const guideError=c.roll.guideDirectionErrorRad+Math.abs(Math.hypot(...c.roll.guide.support.normal)-1)+128*Number.EPSILON;
          // A legal Follow initialization may be needed before its distinct UP
          // axis has a usable projection. This restores the actual moving owner,
          // never a substitute UP frame or an uncertain/singular guide normal.
          const guideProjection=Math.hypot(...subtract(normal,multiply(tangent,dot(normal,tangent))));
          const guideDelta=2*Math.sin(Math.min(guideError,Math.PI)/2)+Math.sin(Math.min(tangentError,Math.PI/2))+256*Number.EPSILON;
          const guideCone=guideDelta<guideProjection?Math.asin(guideDelta/guideProjection):Infinity;
          // This increment deliberately does not reconstruct an initially
          // unretained guide chart through a change of the path tangent.
          if(guideCone>problem.angleTolerance)throw new RangeError('LINE roll guide projection cannot retain the requested band before Follow initialization.');
          const sourceProjection=Math.hypot(...subtract(sourceAxis,multiply(tangent,dot(sourceAxis,tangent))));
          const sourceDelta=2*Math.sin(Math.min(sourceError,Math.PI)/2)+Math.sin(Math.min(tangentError,Math.PI/2))+256*Number.EPSILON;
          const sourceCone=sourceDelta<sourceProjection?Math.asin(sourceDelta/sourceProjection):Infinity;
          const canRestoreFollow=a.bodyId!==b.bodyId&&(a.bodyId!==null&&free.includes(a.bodyId)||b.bodyId!==null&&free.includes(b.bodyId));
          if(angular>problem.angleTolerance&&canRestoreFollow&&sourceCone>problem.angleTolerance)throw new RotationChartError('LINE Follow needs bounded initialization before its material UP projection.');
          const geometry=evaluateLinePathRoll(sourceAxis,tangent,normal,c.roll.reverse,[sourceError,tangentError,guideError],problem.angleTolerance);
          if(Math.abs(geometry.theta)+geometry.angularError>=Math.PI-1e-7)throw new RotationChartError('LINE roll is too close to its antipodal signed chart.');
          result.rows.push({constraintId:c.id,kind:'angle',residual:geometry.theta,tolerance:problem.angleTolerance,jacobian:Array.from({length:columns},(_,col)=>{
            const ws=[variation(a,col).omega,variation(b,col).omega,variation(guide,col).omega];return finite(ws.reduce((sum,w,role)=>sum+dot(geometry.derivatives[role],w),0));
          })});
          angular=Math.max(angular,Math.abs(geometry.theta));
          rollAcceptance=finite(Math.abs(geometry.theta)+geometry.angularError);
        }
        const physical=finite((coordinate===null?Math.hypot(dot(u,d),dot(v,d)):Math.hypot(...defect))*scale);
        result.maxLengthResidual=Math.max(result.maxLengthResidual,physical);result.maxAngleResidual=Math.max(result.maxAngleResidual,angular);
        result.checks.push({constraintId:c.id,lengthResidual:physical,lengthTolerance:problem.lengthTolerance,angleResidual:angular,angleTolerance:problem.angleTolerance,satisfied:physical<=problem.lengthTolerance&&angular<=problem.angleTolerance&&rollAcceptance<=problem.angleTolerance});
        // Rows and reported residuals remain nominal geometric quantities. UP
        // acceptance additionally retains its finite input-error cone. If the
        // nominal angle fits but its envelope does not, this pose lacks the
        // requested precision; do not issue a fixed-geometry inconsistency.
        if(c.roll&&angular<=problem.angleTolerance&&rollAcceptance>problem.angleTolerance)throw new RangeError('LINE roll precisionLimit: nominal angle plus uncertainty exceeds the requested band.');
        continue;
      }
      if (constraint.type === 'profile-center') {
        const profileConstraint = copyRigidProfileCenterConstraint(constraint);
        // Dedicated profile geometry never impersonates an old plane/cylinder
        // support. All declared uncertainty is mandatory and remains physical
        // mm until this one normalized bridge.
        const input = [profileConstraint.first, profileConstraint.second];
        const ends = input.map(value => {
          const p = value.profile, local = vector(p.center), n = vector(p.normal), normal = unit(n);
          const common = endpoint({ bodyId: value.bodyId, frame: value.frame, support: { kind: 'point', point: local, tolerance: 0 } }, false, true);
          const matrix = rigidRotationMatrix(common.rotation), error = finite(p.normalErrorRad + Math.abs(Math.hypot(...n) - 1) + 64 * Number.EPSILON);
          const base = { ownerId: common.bodyId, center: common.point, normal: rotate(matrix, normal),
            pointError: finite(common.pointError + certifiedSphericalNormalization(p.positionErrorMm, p.positionErrorMm / scale)), normalErrorRad: error };
          const support: ConditionedProfileCenterSupport = p.kind === 'circle' ? { ...base, kind: 'circle' }
            : { ...base, kind: 'rectangle', xDirection: rotate(matrix, unit(p.xDirection)),
              xDirectionErrorRad: finite(p.xDirectionErrorRad + Math.abs(Math.hypot(...p.xDirection) - 1) + 64 * Number.EPSILON) };
          return { endpoint: common, support };
        });
        const lengthTolerance = certifiedSphericalNormalization(problem.lengthTolerance, problem.lengthTolerance / scale);
        if (!Number.isFinite(profileConstraint.offsetMm)) throw Error('Profile offset must be finite.');
        const geometry = compareConditionedProfileCenters(ends[0].support, ends[1].support,
          { alignment: profileConstraint.alignment, offset: certifiedSphericalNormalization(profileConstraint.offsetMm, profileConstraint.offsetMm / scale), orientation: profileConstraint.orientation },
          ends[0].endpoint.rotation, { lengthTolerance, angleToleranceRad: problem.angleTolerance });
        if (geometry.status !== 'ok') throw new RangeError(geometry.message);
        const owners = new Map(geometry.owners.map(value => [value.ownerId, value]));
        const rows: RigidMateRow[] = [];
        for (let coordinate = 0; coordinate < 3; coordinate++) rows.push({ constraintId: profileConstraint.id, kind: 'length', residual: finite(geometry.position[coordinate]), tolerance: lengthTolerance,
          jacobian: Array.from({ length: columns }, (_, col) => finite(owners.get(free[Math.floor(col / 6)])?.position[col % 6][coordinate] ?? 0)) });
        const angularRows = (d: Vec3, angle: number, field: 'normal' | 'rectangle') => {
          if (angle >= Math.PI - 1e-7) throw new RotationChartError('The selected profile direction is too close to the antipodal angular chart.');
          const chord = Math.hypot(...d), square = chord * chord;
          const factor = chord < 1e-4 ? 1 + square / 24 + 3 * square * square / 640 + 5 * square * square * square / 7168 : angle / chord;
          const radial = chord < 1e-4 ? 1 / 12 + 3 * square / 160 + 15 * square * square / 3584 : (1 / Math.cos(angle / 2) - factor) / square;
          for (let coordinate = 0; coordinate < 3; coordinate++) rows.push({ constraintId: profileConstraint.id, kind: 'angle', residual: finite(d[coordinate] * factor), tolerance: problem.angleTolerance,
            jacobian: Array.from({ length: columns }, (_, col) => {
              const derivative = owners.get(free[Math.floor(col / 6)])?.[field]?.[col % 6];
              return derivative ? finite(factor * derivative[coordinate] + radial * d[coordinate] * dot(d, derivative)) : 0;
            }) });
        };
        angularRows(geometry.normal, geometry.normalAngleRadians, 'normal');
        if (geometry.rectangle) angularRows(geometry.rectangle, geometry.rectangleAngleRadians!, 'rectangle');
        const physicalLength = finite(geometry.positionError * scale), angle = Math.max(geometry.normalAngleRadians, geometry.rectangleAngleRadians ?? 0);
        result.rows.push(...rows);
        result.checks.push({ constraintId: profileConstraint.id, lengthResidual: physicalLength, lengthTolerance: problem.lengthTolerance, angleResidual: angle, angleTolerance: problem.angleTolerance,
          satisfied: physicalLength <= problem.lengthTolerance && angle <= problem.angleTolerance });
        (result.profileCenter ??= []).push({ constraintId: profileConstraint.id, alignment: profileConstraint.alignment, orientation: structuredClone(profileConstraint.orientation), offsetMm: profileConstraint.offsetMm,
          positionErrorMm: physicalLength, normalAngleRadians: geometry.normalAngleRadians, rectangleAngleRadians: geometry.rectangleAngleRadians,
          lengthTolerance: problem.lengthTolerance, angleTolerance: problem.angleTolerance });
        result.maxLengthResidual = Math.max(result.maxLengthResidual, physicalLength); result.maxAngleResidual = Math.max(result.maxAngleResidual, angle);
        continue;
      }
      if (constraint.type === 'symmetry') {
        const uncertainty=copySymmetryUncertainty(constraint);
        const input = [constraint.source, constraint.target, constraint.mirror];
        if (!input.every(value => value?.support) || input[0].support!.kind !== input[1].support!.kind || input[2].support!.kind !== 'plane') throw new Error('Symmetry requires matching source/target supports and a third plane.');
        const ends = input.map(value => endpoint(value, false, true));
        const physicalLengthTolerance = uncertainty ? problem.lengthTolerance : Math.max(problem.lengthTolerance, finite(ends.reduce((sum, value) => sum + value.support!.tolerance, 0)));
        const lengthTolerance = certifiedSphericalNormalization(physicalLengthTolerance, physicalLengthTolerance / scale);
        const supports = ends.map((value,index): ConditionedSymmetrySupport => {
          const supplied=uncertainty?.[index];
          const normalizedError=supplied?certifiedSphericalNormalization(supplied.positionErrorMm,supplied.positionErrorMm/scale):0;
          const directionError=finite(64*Number.EPSILON+(supplied?.directionErrorRad??0));
          const support = value.support!, common = { ownerId: value.bodyId, point: value.point, pointError: finite(value.pointError+normalizedError) };
          if (support.kind === 'point') return { ...common, kind: 'point' };
          if (support.kind === 'plane') return { ...common, kind: 'plane', normal: value.direction!, normalErrorRad: directionError };
          if (support.kind === 'line') return { ...common, kind: 'line', direction: value.direction!, directionErrorRad: directionError };
          const radius = certifiedSphericalNormalization(support.radius, support.radius / scale), radiusError = finite(64 * Number.EPSILON * radius+(supplied?certifiedSphericalNormalization(supplied.radiusErrorMm!,supplied.radiusErrorMm!/scale):0));
          return support.kind === 'sphere' ? { ...common, kind: 'sphere', radius, radiusError }
            : { ...common, kind: 'cylinder', direction: value.direction!, directionErrorRad: directionError, radius, radiusError };
        });
        const geometry = compareConditionedSymmetrySupports(supports[0], supports[1], supports[2] as ConditionedSymmetrySupport & { kind: 'plane' },
          constraint.alignment, ends[0].rotation, { originMm: center, lengthScaleMm: scale, lengthToleranceMm: physicalLengthTolerance, angleToleranceRad: problem.angleTolerance });
        if (geometry.status !== 'ok') {
          if (geometry.status === 'precisionLimit') throw new RangeError(geometry.message);
          throw new Error(geometry.message);
        }
        // Use constant local support directions for the numerical row charts.
        // In B's frame its transverse/normal projector is fixed. In the
        // reflected A frame, the source normal is fixed too:
        // RA^T H(nb-e H na) = RA^T H nb-e*nA_local.
        // Merely rotating the residual without these frame derivatives would
        // change the Jacobian; retaining rotating 3D images creates spurious
        // off-solution singular modes near the physical acceptance band.
        const RA = rigidRotationMatrix(ends[0].rotation), RBt = transpose(rigidRotationMatrix(ends[1].rotation)), RAt = transpose(RA), mirrorNormal = unit(ends[2].direction!);
        const reflect = (v: Vec3): Vec3 => subtract(v, multiply(mirrorNormal, 2 * dot(mirrorNormal, v)));
        const positionWorld = rotate(RA, geometry.position), position = rotate(RBt, positionWorld);
        const normalWorld = geometry.normal ? rotate(RA, geometry.normal) : null;
        const reflectedNormal = normalWorld ? reflect(normalWorld) : null, normal = reflectedNormal ? rotate(RAt, reflectedNormal) : null;
        const owners = new Map(geometry.owners.map(value => {
          const omega = (role: number, col: number): Vec3 => col >= 3 && ends[role].bodyId === value.ownerId ? AXES[col - 3] : ZERO;
          const position = value.position.map((derivative, col) => rotate(RBt,
            subtract(add(rotate(RA, derivative), cross(omega(0, col), positionWorld)), cross(omega(1, col), positionWorld))));
          const normal = value.normal?.map((derivative, col) => {
            const da = omega(0, col), dm = cross(omega(2, col), mirrorNormal), dq = add(rotate(RA, derivative), cross(da, normalWorld!));
            const reflected = subtract(dq, multiply(add(multiply(dm, dot(mirrorNormal, normalWorld!)),
              multiply(mirrorNormal, dot(dm, normalWorld!) + dot(mirrorNormal, dq))), 2));
            return rotate(RAt, subtract(reflected, cross(da, reflectedNormal!)));
          }) ?? null;
          return [value.ownerId, { position, normal }] as const;
        })), rows: RigidMateRow[] = [];
        for (let coordinate = 0; coordinate < 3; coordinate++) rows.push({ constraintId: constraint.id, kind: 'length',
          residual: finite(position[coordinate]), tolerance: lengthTolerance,
          jacobian: Array.from({ length: columns }, (_, column) => finite(owners.get(free[Math.floor(column / 6)])?.position[column % 6][coordinate] ?? 0)) });
        const angle = geometry.angleRadians ?? 0;
        if (normal) {
          if (angle >= Math.PI - 1e-7) throw new RotationChartError('The selected reflected directions are too close to the antipodal angular chart.');
          // Three moving roles retain their analytic chord derivatives. Convert
          // the chord to radians, including the derivative of theta/chord.
          const d = normal, chord = Math.hypot(...d), square = chord * chord;
          const factor = chord < 1e-4 ? 1 + square / 24 + 3 * square * square / 640 + 5 * square * square * square / 7168 : angle / chord;
          const radial = chord < 1e-4 ? 1 / 12 + 3 * square / 160 + 15 * square * square / 3584
            : (1 / Math.cos(angle / 2) - factor) / square;
          const angular = multiply(d, factor);
          for (let coordinate = 0; coordinate < 3; coordinate++) rows.push({ constraintId: constraint.id, kind: 'angle', residual: finite(angular[coordinate]), tolerance: problem.angleTolerance,
            jacobian: Array.from({ length: columns }, (_, column) => {
              const derivative = owners.get(free[Math.floor(column / 6)])?.normal?.[column % 6];
              return derivative ? finite(factor * derivative[coordinate] + radial * d[coordinate] * dot(d, derivative)) : 0;
            }) });
        }
        const maxLength = Math.max(geometry.positionErrorMm, Math.abs(geometry.radiusDifferenceMm ?? 0));
        result.rows.push(...rows);
        result.checks.push({ constraintId: constraint.id, lengthResidual: maxLength, lengthTolerance: physicalLengthTolerance,
          angleResidual: angle, angleTolerance: problem.angleTolerance, satisfied: maxLength <= physicalLengthTolerance && angle <= problem.angleTolerance });
        (result.symmetry ??= []).push({ constraintId: constraint.id, entityKind: input[0].support!.kind, alignment: constraint.alignment,
          positionErrorMm: geometry.positionErrorMm, angleRadians: geometry.angleRadians, radiusDifferenceMm: geometry.radiusDifferenceMm,
          lengthTolerance: physicalLengthTolerance, angleTolerance: problem.angleTolerance });
        result.maxLengthResidual = Math.max(result.maxLengthResidual, maxLength); result.maxAngleResidual = Math.max(result.maxAngleResidual, angle);
        continue;
      }
      if (constraint.type === 'width') {
        if (constraint.mode !== 'centered') throw new Error('The numerical width family requires an explicit centered mode.');
        if (constraint.alignment !== 'aligned' && constraint.alignment !== 'opposed') throw new Error('Width bisector alignment must be explicit.');
        const pair = (value: readonly RigidMateEndpoint[]): [RigidMateEndpoint, RigidMateEndpoint] => {
          if (!Array.isArray(value) || value.length !== 2) throw new Error('Width needs two ordered plane references in each group.');
          return [0, 1].map(index => {
            const field = Object.getOwnPropertyDescriptor(value, String(index));
            if (!field || !('value' in field) || field.value?.support?.kind !== 'plane') throw new Error('Width needs four actual plane supports.');
            return field.value as RigidMateEndpoint;
          }) as [RigidMateEndpoint, RigidMateEndpoint];
        };
        // Compose directly in the fixed normalized solve frame. Reconstituting
        // world points here would lose small offsets at distant common origins.
        const input = [...pair(constraint.width), ...pair(constraint.tab)], ends = input.map(value => endpoint(value, false, true));
        const physicalLengthTolerance = Math.max(problem.lengthTolerance,
          finite(ends.reduce((sum, value) => sum + value.support!.tolerance, 0)));
        const lengthTolerance = certifiedSphericalNormalization(physicalLengthTolerance, physicalLengthTolerance / scale);
        const supports = ends.map((value): ConditionedPlaneBisectorSupport => ({ ownerId: value.bodyId,
          point: value.point, normal: value.direction!,
          pointError: finite(value.pointError + certifiedSphericalNormalization(value.support!.tolerance, value.support!.tolerance / scale)),
          normalErrorRad: 64 * Number.EPSILON }));
        const sign = constraint.alignment === 'aligned' ? 1 : -1;
        const geometry = compareConditionedPlaneBisectors([supports[0], supports[1]], constraint.widthBranch,
          [supports[2], supports[3]], constraint.tabBranch, sign, ends[0].rotation, lengthTolerance, problem.angleTolerance);
        if (geometry.status !== 'ok') {
          if (geometry.status === 'precisionLimit') throw new RangeError(geometry.message);
          throw new Error(geometry.message);
        }
        const a = multiply(geometry.width.normal, sign), b = geometry.tab.normal;
        const angle = finite(Math.atan2(Math.hypot(...cross(a, b)), dot(a, b)));
        if (angle >= Math.PI - 1e-7) throw new RotationChartError('The selected width bisectors are too close to the antipodal angular chart.');
        // Convert the dimensionless normal chord into a vector whose norm is
        // the actual angle in radians. Include the derivative of that scale.
        const d = geometry.normal, chord = Math.hypot(...d), square = chord * chord;
        const factor = chord < 1e-4 ? 1 + square / 24 + 3 * square * square / 640 + 5 * square * square * square / 7168 : angle / chord;
        const radial = chord < 1e-4 ? 1 / 12 + 3 * square / 160 + 15 * square * square / 3584
          : (1 / Math.cos(angle / 2) - factor) / square;
        const owners = new Map(geometry.owners.map(value => [value.ownerId, value]));
        const angular = multiply(d, factor), rows: RigidMateRow[] = [];
        for (let coordinate = 0; coordinate < 3; coordinate++) rows.push({ constraintId: constraint.id,
          kind: 'angle', residual: finite(angular[coordinate]), tolerance: problem.angleTolerance,
          jacobian: Array.from({ length: columns }, (_, column) => {
            const owner = owners.get(free[Math.floor(column / 6)]);
            if (!owner) return 0;
            const derivative = owner.normal[column % 6];
            return finite(factor * derivative[coordinate] + radial * d[coordinate] * dot(d, derivative));
          }) });
        rows.push({ constraintId: constraint.id, kind: 'length', residual: finite(geometry.offset), tolerance: lengthTolerance,
          jacobian: Array.from({ length: columns }, (_, column) => finite(owners.get(free[Math.floor(column / 6)])?.offset[column % 6] ?? 0)) });
        const offsetMm = finite(geometry.offset * scale), maxLength = Math.abs(offsetMm);
        result.rows.push(...rows);
        result.checks.push({ constraintId: constraint.id, lengthResidual: maxLength, lengthTolerance: physicalLengthTolerance,
          angleResidual: angle, angleTolerance: problem.angleTolerance,
          satisfied: maxLength <= physicalLengthTolerance && angle <= problem.angleTolerance });
        (result.widthCentered ??= []).push({ constraintId: constraint.id, mode: 'centered', widthBranch: constraint.widthBranch,
          tabBranch: constraint.tabBranch, alignment: constraint.alignment, angleRadians: angle, offsetMm,
          lengthTolerance: physicalLengthTolerance, angleTolerance: problem.angleTolerance,
          branchLengths: { width: geometry.width.branchLength, tab: geometry.tab.branchLength } });
        result.maxLengthResidual = Math.max(result.maxLengthResidual, maxLength);
        result.maxAngleResidual = Math.max(result.maxAngleResidual, angle);
        continue;
      }
      if (!['concentric', 'coincident', 'distance', 'limit-distance', 'limit-angle', 'limit-directed-angle', 'angle', 'parallel', 'perpendicular', 'tangent', 'skew-cylinder-tangent', 'parallel-cylinder-tangent', 'plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent', 'lock', 'gear', 'screw', 'rack-pinion'].includes(constraint.type)) throw new Error('Unsupported mate family.');
      const sphereFamily = constraint.type === 'plane-sphere-tangent' || constraint.type === 'sphere-sphere-tangent' || constraint.type === 'cylinder-sphere-tangent';
      const limitFamily = constraint.type === 'limit-distance', pointPrecision = sphereFamily || limitFamily;
      if (constraint.first.support?.kind === 'point' || constraint.second.support?.kind === 'point'
        || constraint.type === 'gear' && constraint.carrier?.support?.kind === 'point'
        || constraint.type === 'limit-directed-angle' && constraint.guide?.support?.kind === 'point') throw new Error('Point supports require an explicit point-capable mate family.');
      if (!sphereFamily && (constraint.first.support?.kind === 'sphere' || constraint.second.support?.kind === 'sphere'
        || constraint.type === 'gear' && constraint.carrier?.support?.kind === 'sphere'
        || constraint.type === 'limit-directed-angle' && constraint.guide?.support?.kind === 'sphere')) throw new Error('Sphere supports require an explicit spherical tangency family.');
      const directionOnly = constraint.type === 'parallel' || constraint.type === 'perpendicular' || constraint.type === 'limit-angle' || constraint.type === 'limit-directed-angle'
        ||angularOnlyIntervalContext&&constraint.type==='angle';
      // The rack coordinate uses a geometric axis point, not the orbiting
      // component origin or an arbitrary cylinder parameter origin.
      const rackPrecision = constraint.type === 'rack-pinion' ? Math.max(problem.lengthTolerance,
        finite((constraint.first.support?.tolerance ?? 0) + (constraint.second.support?.tolerance ?? 0))) : undefined;
      const firstInput = constraint.type === 'rack-pinion' && constraint.first.support?.kind === 'cylinder'
        ? { ...constraint.first, support: { ...constraint.first.support, point: assemblyRackPinionAxisPoint(constraint.first.support.point, constraint.first.support.axis, rackPrecision) } } : constraint.first;
      const secondInput = constraint.type === 'rack-pinion' && constraint.second.support && (constraint.second.support.kind === 'line' || constraint.second.support.kind === 'cylinder')
        ? { ...constraint.second, support: { ...constraint.second.support, point: vector(constraint.second.support.point).map(() => 0) as Vec3,
          axis: canonicalAssemblyRackDirection(constraint.second.support.axis) } } : constraint.second;
      const tangentInput = (input: RigidMateEndpoint): RigidMateEndpoint => {
        if (limitFamily) {
          if (input.support?.kind !== 'plane') throw new Error('Distance limits require two plane supports.');
          return { ...input, support: { ...input.support, point: assemblyTangentPlanePoint(input.support.point, input.support.normal,
            Math.max(problem.lengthTolerance, finite((constraint.first.support?.tolerance ?? 0) + (constraint.second.support?.tolerance ?? 0)))) } };
        }
        if (!sphereFamily && !['tangent', 'skew-cylinder-tangent', 'parallel-cylinder-tangent'].includes(constraint.type) || !input.support) return input;
        const support = input.support, precision = Math.max(problem.lengthTolerance,
          finite((constraint.first.support?.tolerance ?? 0) + (constraint.second.support?.tolerance ?? 0)));
        if (sphereFamily && support.kind === 'sphere') return input; // A sphere has one unique center, never an axis projection.
        if (support.kind === 'point' || support.kind === 'line' || support.kind === 'sphere' || !sphereFamily && constraint.type !== 'tangent' && support.kind !== 'cylinder') throw new Error('Tangency requires the declared analytic surface pair.');
        return { ...input, support: { ...support, point: support.kind === 'plane'
          ? assemblyTangentPlanePoint(support.point, support.normal, precision)
          : assemblyTangentAxisPoint(support.point, support.axis, precision) } };
      };
      const a = endpoint(tangentInput(firstInput), directionOnly, pointPrecision), b = endpoint(tangentInput(secondInput), directionOnly, pointPrecision), rows: RigidMateRow[] = [];
      const nativeTolerance = directionOnly ? 0 : finite((a.support?.tolerance ?? 0) + (b.support?.tolerance ?? 0));
      const physicalLengthTolerance = Math.max(problem.lengthTolerance, nativeTolerance);
      // Direction-only families emit no length row, so no length normalization
      // or native length uncertainty can change their angular acceptance.
      const lengthTolerance = directionOnly ? 1 : finite(physicalLengthTolerance / scale);
      if (lengthTolerance === 0) throw new RangeError('Normalized length tolerance underflows.');
      if (pointPrecision) certifiedSphericalNormalization(physicalLengthTolerance, lengthTolerance);
      const compositionError = pointPrecision ? finite(a.pointError + b.pointError) : 0;
      if (compositionError > lengthTolerance) throw new RangeError(limitFamily ? 'Distance-limit support placement exceeds the requested length precision before cancellation.'
        : 'Spherical support placement exceeds the requested length precision before cancellation.');
      let maxLength = 0, maxAngle = 0;
      const row = (kind: 'length' | 'angle', residual: number, derivative: (da: Variation, db: Variation) => number): void => {
        rows.push({ constraintId: constraint.id, kind, residual: finite(residual), tolerance: kind === 'length' ? lengthTolerance : problem.angleTolerance,
          jacobian: Array.from({ length: columns }, (_, column) => finite(derivative(variation(a, column), variation(b, column)))) });
      };
      const vectorRows = (kind: 'length' | 'angle', values: Vec3, derivative: (da: Variation, db: Variation) => Vec3): void => {
        values.forEach((value, coordinate) => row(kind, value, (da, db) => derivative(da, db)[coordinate]));
      };
      // Express geometric vectors in the second endpoint's moving frame. World
      // components would rotate a nonzero residual under a common rigid gauge,
      // spuriously adding Jacobian rank even inside the physical tolerance.
      const secondFrame = transpose(rigidRotationMatrix(b.rotation));
      const targetVectorRows = (kind: 'length' | 'angle', values: Vec3, derivative: (da: Variation, db: Variation) => Vec3): void => {
        vectorRows(kind, rotate(secondFrame, values), (da, db) =>
          rotate(secondFrame, subtract(derivative(da, db), cross(db.omega, values))));
      };
      const rotationRows = (locked: Quaternion): void => {
        const lock = validateRigidPose({ translation: [0, 0, 0], rotation: locked }).rotation;
        const left = quaternionProduct(inverseQuaternion(lock), inverseQuaternion(a.rotation));
        const error = rotationLog(quaternionProduct(left, b.rotation)), inverseJ = so3LeftJacobianInverse(error), leftMatrix = rigidRotationMatrix(left);
        vectorRows('angle', error, (da, db) => rotate(inverseJ, rotate(leftMatrix, subtract(db.omega, da.omega))));
        maxAngle = Math.max(maxAngle, Math.hypot(...error));
      };
      if (constraint.type === 'limit-directed-angle') {
        const c = endpoint(constraint.guide, true);
        if (constraint.coordinate !== 'directed-about-axis' || !a.direction || !b.direction || !c.direction) throw new Error('Circular stops require three explicit directional supports.');
        const first = unit(a.direction), second = unit(b.direction), guide = unit(c.direction),
          measured = measureDirectedAngle(first, second, guide, problem.angleTolerance),
          value = evaluateAssemblyDirectedAngleArc(measured.angleRadians, constraint.arc, problem.angleTolerance);
        // Direction composition contributes independently of translation/length scale.
        const firstLength = measured.projectionLengths.first, secondLength = measured.projectionLengths.second;
        if (8 * 512 * Number.EPSILON * (1 / firstLength + 1 / secondLength) > problem.angleTolerance) throw new RangeError('Circular stop direction composition exceeds angular precision.');
        (result.limitDirectedAngles ??= []).push({ constraintId: constraint.id, ...value });
        if (!value.fullCircle) {
          // Differentiate normalized projected directions. The guide's own
          // variation is essential when it belongs to a third moving body.
          const firstAlong = dot(guide, first), secondAlong = dot(guide, second),
            u = multiply(cross(cross(guide, first), guide), 1 / firstLength),
            v = multiply(cross(cross(guide, second), guide), 1 / secondLength),
            x = dot(u, v), uv = cross(u, v), y = dot(guide, uv), denominator = x * x + y * y;
          const jacobian = Array.from({ length: columns }, (_, column) => {
            const da = variation(a, column).direction, db = variation(b, column).direction, dg = variation(c, column).direction,
              projectedA = subtract(subtract(da, multiply(dg, firstAlong)), multiply(guide, dot(dg, first) + dot(guide, da))),
              projectedB = subtract(subtract(db, multiply(dg, secondAlong)), multiply(guide, dot(dg, second) + dot(guide, db))),
              du = multiply(subtract(projectedA, multiply(u, dot(u, projectedA))), 1 / firstLength),
              dv = multiply(subtract(projectedB, multiply(v, dot(v, projectedB))), 1 / secondLength),
              dx = dot(du, v) + dot(u, dv), dy = dot(dg, uv) + dot(guide, add(cross(du, v), cross(u, dv)));
            return finite((x * dy - y * dx) / denominator);
          });
          (result.inequalities ??= []).push(
            { constraintId: constraint.id, bound: 'minimum', kind: 'angle', margin: value.marginsRadians.minimum, tolerance: problem.angleTolerance, jacobian },
            { constraintId: constraint.id, bound: 'maximum', kind: 'angle', margin: value.marginsRadians.maximum, tolerance: problem.angleTolerance, jacobian: jacobian.map(entry => -entry) });
          maxAngle = Math.max(0, -value.marginsRadians.minimum, -value.marginsRadians.maximum);
        }
      } else if (constraint.type === 'limit-angle') {
        if (constraint.coordinate !== 'principal-direction' || !a.direction || !b.direction) throw new Error('Angular limits need an explicit principal-direction coordinate and two directional supports.');
        const first = a.direction, second = b.direction, perpendicular = cross(first,second), sine = Math.hypot(...perpendicular),
          cosine = Math.max(-1,Math.min(1,dot(first,second))), angleRadians = Math.atan2(sine,cosine),
          limitsDegrees = validateAssemblyLimitAngleLimits(constraint.limits), limitsRadians = assemblyLimitAngleRadians(limitsDegrees),
          stratum = classifyAssemblyLimitAngleStratum(angleRadians), domainBounds = {minimum:limitsDegrees.minimum===0,maximum:limitsDegrees.maximum===180},
          marginsRadians = {minimum:finite(angleRadians-limitsRadians.minimum),maximum:finite(limitsRadians.maximum-angleRadians)},
          endpointEquality = limitsDegrees.minimum===limitsDegrees.maximum && (domainBounds.minimum || domainBounds.maximum);
        const defectRows = (sign:number):RigidMateRow[] => {
          const defect = subtract(first,multiply(second,sign)), values = rotate(secondFrame,defect);
          return values.map((residual,axis)=>({constraintId:constraint.id,kind:'angle',residual,tolerance:problem.angleTolerance,
            jacobian:Array.from({length:columns},(_,column)=>{
              const da=variation(a,column),db=variation(b,column);
              return rotate(secondFrame,subtract(subtract(da.direction,multiply(db.direction,sign)),cross(db.omega,defect)))[axis];
            })}));
        };
        (result.limitAngles??=[]).push({constraintId:constraint.id,angleRadians,limitsDegrees,marginsRadians,
          angleToleranceRadians:problem.angleTolerance,activity:assemblyLimitAngleActivity(angleRadians,limitsDegrees,problem.angleTolerance),stratum,domainBounds});
        // A computed regular angle can be arbitrarily close to the opposite
        // endpoint of an equality. Its target-defect gradient then approaches
        // zero without making the physical target feasible. The CURRENT
        // hemisphere chart supplies bounded admitted directions, not a rounded
        // measurement or a replacement for the original nonlinear checks.
        const oppositeEqualityHemisphere=endpointEquality&&(domainBounds.minimum?cosine<=0:cosine>=0);
        (result.angularLimitCharts??=[]).push({constraintId:constraint.id,stratum,
          ...(stratum!=='regular'||oppositeEqualityHemisphere?{openingRows:defectRows(cosine>=0?1:-1)}:{}),
          ...(endpointEquality?{equalityRows:defectRows(domainBounds.minimum?1:-1)}:{})});
        if (stratum==='regular'&&!endpointEquality) {
          const normal = perpendicular.map(value=>value/sine) as Vec3,
            jacobian = Array.from({length:columns},(_,column)=>{
              const da=variation(a,column),db=variation(b,column);
              return finite(-dot(normal,subtract(da.omega,db.omega)));
            });
          if(!domainBounds.minimum)(result.inequalities??=[]).push({constraintId:constraint.id,bound:'minimum',kind:'angle',margin:marginsRadians.minimum,tolerance:problem.angleTolerance,jacobian:[...jacobian]});
          if(!domainBounds.maximum)(result.inequalities??=[]).push({constraintId:constraint.id,bound:'maximum',kind:'angle',margin:marginsRadians.maximum,tolerance:problem.angleTolerance,jacobian:jacobian.map(value=>-value)});
        }
        maxAngle = Math.max(0,-marginsRadians.minimum,-marginsRadians.maximum);
      } else if (constraint.type === 'plane-sphere-tangent') {
        const planeFirst = a.support?.kind === 'plane', p = planeFirst ? a : b, s = planeFirst ? b : a;
        if (p.support?.kind !== 'plane' || s.support?.kind !== 'sphere' || !p.direction) throw new Error('Plane/sphere tangency requires one actual plane and one sphere.');
        const radius = certifiedSphericalNormalization(s.support.radius, s.support.radius / scale), sign = assemblyTangentSideSign(constraint.side), separation = subtract(s.point, p.point);
        if (radius === 0) throw new RangeError('Normalized sphere radius underflows.');
        const magnitude = finite(Math.hypot(...p.point) + Math.hypot(...s.point) + radius);
        if (finite(compositionError + 32 * Number.EPSILON * magnitude) > lengthTolerance) throw new RangeError('Sphere/plane offset exceeds the requested length precision.');
        const error = finite(dot(p.direction, separation) - sign * radius), normal = p.direction;
        row('length', error, (da, db) => {
          const dp = planeFirst ? da : db, ds = planeFirst ? db : da;
          return dot(dp.direction, separation) + dot(normal, subtract(ds.point, dp.point));
        });
        maxLength = finite(Math.abs(error) * scale);
      } else if (constraint.type === 'sphere-sphere-tangent' || constraint.type === 'cylinder-sphere-tangent') {
        const ss = constraint.type === 'sphere-sphere-tangent', cylinderFirst = a.support?.kind === 'cylinder';
        if (ss ? a.support?.kind !== 'sphere' || b.support?.kind !== 'sphere'
          : !((a.support?.kind === 'cylinder' && b.support?.kind === 'sphere') || (a.support?.kind === 'sphere' && b.support?.kind === 'cylinder'))) throw new Error('Spherical tangency requires the declared analytic surface pair.');
        if (!a.support || !b.support || a.support.kind === 'plane' || a.support.kind === 'line' || a.support.kind === 'point'
          || b.support.kind === 'plane' || b.support.kind === 'line' || b.support.kind === 'point') throw new Error('Spherical tangency requires current radii.');
        certifiedSphericalNormalization(a.support.radius, a.support.radius / scale); certifiedSphericalNormalization(b.support.radius, b.support.radius / scale);
        const physicalTarget = assemblySphereTangentTarget(constraint.branch, a.support.radius, b.support.radius, physicalLengthTolerance);
        const target = certifiedSphericalNormalization(physicalTarget, physicalTarget / scale);
        if (target === 0) throw new RangeError('Normalized spherical tangency target underflows.');
        const c = cylinderFirst ? a : b, s = cylinderFirst ? b : a;
        const separation = ss ? subtract(b.point, a.point) : subtract(s.point, c.point), axis = ss ? null : c.direction;
        if (!ss && !axis) throw new Error('Cylinder/sphere tangency needs a resolved cylinder axis.');
        const along = axis ? dot(axis, separation) : 0, transverse = axis ? subtract(separation, multiply(axis, along)) : separation;
        const distance = finite(Math.hypot(...transverse));
        if (distance === 0) throw new RotationChartError('Spherical tangency has no unique radial direction at zero separation.');
        const radiusMagnitude = finite((a.support.radius + b.support.radius) / scale);
        const uncertainty = finite(compositionError + 32 * Number.EPSILON * finite(Math.hypot(...a.point) + Math.hypot(...b.point) + radiusMagnitude));
        if (uncertainty > lengthTolerance || distance <= uncertainty) throw new RangeError('Spherical separation is not resolvable at the requested length precision.');
        const radial = multiply(transverse, 1 / distance), error = finite(distance - target);
        row('length', error, (da, db) => {
          if (ss) return dot(radial, subtract(db.point, da.point));
          const dc = cylinderFirst ? da : db, ds = cylinderFirst ? db : da, delta = subtract(ds.point, dc.point);
          return dot(radial, subtract(subtract(delta, multiply(dc.direction, along)),
            multiply(axis!, dot(dc.direction, separation) + dot(axis!, delta))));
        });
        maxLength = finite(Math.abs(error) * scale);
      } else if (constraint.type === 'skew-cylinder-tangent' || constraint.type === 'parallel-cylinder-tangent') {
        if (a.support?.kind !== 'cylinder' || b.support?.kind !== 'cylinder' || !a.direction || !b.direction) throw new Error('Cylinder tangency requires two cylinder surfaces.');
        const first = a.direction, second = b.direction, separation = subtract(b.point, a.point);
        const target = finite(assemblyCylinderTangentTarget(constraint.branch, a.support.radius, b.support.radius, physicalLengthTolerance) / scale);
        if (target === 0) throw new RangeError('Normalized cylinder tangency radius target underflows.');
        const axesCross = cross(first, second), sine = Math.hypot(...axesCross), cosine = dot(first, second);
        const magnitude = finite(Math.hypot(...a.point) + Math.hypot(...b.point) + target);
        if (constraint.type === 'skew-cylinder-tangent') {
          if (sine <= 1e-7) throw new RotationChartError('The nonparallel cylinder tangency chart cannot resolve parallel axes.');
          const normal = multiply(axesCross, 1 / sine), signedDistance = dot(normal, separation), distance = Math.abs(signedDistance);
          if (distance === 0) throw new RotationChartError('Cylinder tangency has no unique separation direction at intersecting axes.');
          const uncertainty = finite(32 * Number.EPSILON * magnitude / sine);
          if (uncertainty > lengthTolerance || distance <= uncertainty) throw new RangeError('Cylinder separation is not resolvable at the requested length precision.');
          const sign = Math.sign(signedDistance), transverse = subtract(separation, multiply(normal, signedDistance)), error = finite(distance - target);
          row('length', error, (da, db) => sign * (dot(normal, subtract(db.point, da.point))
            + dot(transverse, add(cross(da.direction, second), cross(first, db.direction))) / sine));
          maxLength = finite(Math.abs(error) * scale);
        } else {
          // Undirected axes: either collinear orientation is admitted. The
          // orthogonal stationary chart is rejected, never silently reseeded.
          if (Math.abs(cosine) <= 1e-7) throw new RotationChartError('The parallel cylinder tangency chart is stationary at orthogonal axes.');
          const axial = dot(first, separation), transverse = subtract(separation, multiply(first, axial)), distance = Math.hypot(...transverse);
          if (distance === 0) throw new RotationChartError('Parallel cylinder tangency has no radial direction at coincident axes.');
          const uncertainty = finite(32 * Number.EPSILON * magnitude);
          if (uncertainty > lengthTolerance || distance <= uncertainty) throw new RangeError('Parallel cylinder separation is not resolvable at the requested length precision.');
          const radial = multiply(transverse, 1 / distance), error = finite(distance - target);
          targetVectorRows('angle', axesCross, (da, db) => add(cross(da.direction, second), cross(first, db.direction)));
          row('length', error, (da, db) => {
            const delta = subtract(db.point, da.point);
            return dot(radial, subtract(subtract(delta, multiply(da.direction, axial)),
              multiply(first, dot(da.direction, separation) + dot(first, delta))));
          });
          maxAngle = Math.atan2(sine, Math.abs(cosine)); maxLength = finite(Math.abs(error) * scale);
        }
      } else if (constraint.type === 'tangent') {
        const planeFirst = a.support?.kind === 'plane';
        const p = planeFirst ? a : b, c = planeFirst ? b : a;
        if (p.support?.kind !== 'plane' || c.support?.kind !== 'cylinder' || !p.direction || !c.direction) throw new Error('Tangent requires one plane and one cylinder surface.');
        const sign = assemblyTangentSideSign(constraint.side), normal = p.direction, axis = c.direction;
        const sine = Math.hypot(...cross(normal, axis)), cosine = Math.max(-1, Math.min(1, dot(normal, axis)));
        if (sine <= 1e-7) throw new RotationChartError('The tangent cylinder axis is at a singular parallel or antiparallel plane-normal chart.');
        const angle = Math.atan2(cosine, sine), radius = finite(c.support.radius / scale), separation = subtract(c.point, p.point);
        if (radius === 0) throw new RangeError('Normalized tangent radius underflows.');
        const distance = dot(normal, separation), error = finite(distance - sign * radius);
        const magnitude = finite(normal.reduce((sum, value, i) => sum + Math.abs(value * c.point[i]) + Math.abs(value * p.point[i]), 0) + radius);
        if (32 * Number.EPSILON * magnitude > lengthTolerance) throw new RangeError('Tangent offset exceeds the requested length precision.');
        row('angle', angle, (da, db) => {
          const dp = planeFirst ? da : db, dc = planeFirst ? db : da;
          return (dot(dp.direction, axis) + dot(normal, dc.direction)) / sine;
        });
        row('length', error, (da, db) => {
          const dp = planeFirst ? da : db, dc = planeFirst ? db : da;
          return dot(dp.direction, separation) + dot(normal, subtract(dc.point, dp.point));
        });
        maxAngle = Math.abs(angle); maxLength = finite(Math.abs(error) * scale);
      } else if (constraint.type === 'rack-pinion') {
        if (a.support?.kind !== 'cylinder' || !b.support || (b.support.kind !== 'cylinder' && b.support.kind !== 'line') || !b.direction) throw new Error('Rack and pinion requires a pinion cylinder and a rack line or cylinder.');
        const twist = rigidRackPinionTwist(constraint, bodies, problem.angleTolerance), direction = b.direction;
        const advance = assemblyRackPinionAdvance(constraint.conversion, constraint.reverse, a.support.radius) / scale;
        const neutral = finite(constraint.neutralTravel / scale), separation = subtract(b.origin, a.point);
        if (!Number.isFinite(advance) || advance === 0 || constraint.neutralTravel !== 0 && neutral === 0) throw new RangeError('Normalized rack travel is not representable.');
        const travel = dot(direction, separation), angularTravel = finite(advance * twist.angle);
        if (twist.angle !== 0 && angularTravel === 0) throw new RangeError('Rack angular travel underflows.');
        const magnitude = finite(Math.abs(travel) + Math.abs(neutral) + Math.abs(angularTravel));
        if (32 * Number.EPSILON * magnitude > lengthTolerance) throw new RangeError('Rack travel exceeds the requested length precision.');
        const error = finite(travel - neutral - angularTravel);
        row('length', error, (da, db) => dot(db.direction, separation) + dot(direction, subtract(db.origin, da.point))
          - advance * dot(twist.gradient, subtract(da.omega, db.omega)));
        maxLength = finite(Math.abs(error) * scale);
        result.rackPinionAngles.set(constraint.id, twist.angle);
      } else if (constraint.type === 'gear') {
        const carrier = constraint.carrier === null ? endpoint({ bodyId: null, frame: identityRigidPose() }) : endpoint(constraint.carrier);
        const twists = rigidGearTwists(constraint, bodies, problem.angleTolerance), weights = assemblyGearWeights(constraint.ratio);
        if (constraint.direction !== 'same' && constraint.direction !== 'opposed') throw new Error('Unknown gear direction.');
        const firstWeight = weights.first, secondWeight = (constraint.direction === 'opposed' ? 1 : -1) * weights.second;
        const residual = finite(firstWeight * twists.first.angle + secondWeight * twists.second.angle - constraint.phase);
        const magnitude = Math.abs(firstWeight * twists.first.angle) + Math.abs(secondWeight * twists.second.angle) + Math.abs(constraint.phase);
        if (!Number.isFinite(magnitude) || 32 * Number.EPSILON * Math.max(1, magnitude) > problem.angleTolerance) throw new RangeError('Gear phase exceeds the requested angular precision.');
        rows.push({ constraintId: constraint.id, kind: 'angle', residual, tolerance: problem.angleTolerance,
          jacobian: Array.from({ length: columns }, (_, column) => {
            const da = variation(a, column), db = variation(b, column), dc = variation(carrier, column);
            return finite(firstWeight * dot(twists.first.gradient, subtract(da.omega, dc.omega))
              + secondWeight * dot(twists.second.gradient, subtract(db.omega, dc.omega)));
          }) });
        maxAngle = Math.abs(residual);
        result.gearAngles.set(constraint.id, { first: twists.first.angle, second: twists.second.angle });
      } else if (constraint.type === 'lock') {
        const locked = validateRigidPose(constraint.relativePose), leftMatrix = rigidRotationMatrix(quaternionProduct(inverseQuaternion(locked.rotation), inverseQuaternion(a.rotation)));
        const d = subtract(b.origin, a.origin), relativeTranslation = rotate(transpose(rigidRotationMatrix(a.rotation)), d);
        const error = rotate(transpose(rigidRotationMatrix(locked.rotation)), subtract(relativeTranslation, multiply(locked.translation, 1 / scale)));
        vectorRows('length', error, (da, db) => rotate(leftMatrix, subtract(subtract(db.origin, da.origin), cross(da.omega, d))));
        maxLength = finite(Math.hypot(...error) * scale); rotationRows(locked.rotation);
      } else {
        if (!a.direction || !b.direction) throw new Error('This mate requires analytic supports at both endpoints.');
        const first = a.direction, second = b.direction, d = subtract(a.point, b.point);
        if (constraint.type === 'angle' || constraint.type === 'parallel' || constraint.type === 'perpendicular') {
          if (a.support?.kind === 'sphere' || b.support?.kind === 'sphere' || a.support?.kind === 'point' || b.support?.kind === 'point') throw new Error('Point and sphere supports have no directional coordinate.');
          const target = constraint.type === 'angle' ? constraint.angle
            : assemblyDirectionMateAngle(constraint.type, a.support!.kind, b.support!.kind, constraint.alignment);
          if (!Number.isFinite(target) || target < 0 || target > 180) throw new Error('Mate angle must be degrees in [0,180].');
          if (target === 0 || target === 180) {
            const sign = target === 0 ? 1 : -1;
            if (sign * dot(first, second) <= -1 + 1e-10) throw new RotationChartError('The signed angle alignment starts near its antipodal stationary chart.');
            const error = subtract(first, multiply(second, sign));
            targetVectorRows('angle', error, (da, db) => subtract(da.direction, multiply(db.direction, sign)));
            maxAngle = 2 * Math.asin(Math.min(1, Math.hypot(...error) / 2));
          } else {
            const cosine = Math.max(-1, Math.min(1, dot(first, second))), sine = Math.hypot(...cross(first, second));
            if (sine <= 1e-7) throw new RotationChartError('The interior angle mate is at a singular parallel or antiparallel chart.');
            const angle = Math.atan2(sine, cosine), error = angle - target * Math.PI / 180;
            row('angle', error, (da, db) => -(dot(da.direction, second) + dot(first, db.direction)) / sine);
            maxAngle = Math.abs(error);
          }
        } else {
          if (constraint.alignment !== 'aligned' && constraint.alignment !== 'opposed') throw new Error('Mate alignment must be explicit.');
          const sign = constraint.alignment === 'aligned' ? 1 : -1;
          if (sign * dot(first, second) <= -1 + 1e-10) throw new RotationChartError('The signed alignment starts near its antipodal stationary chart.');
          const alignmentError = subtract(first, multiply(second, sign));
          maxAngle = 2 * Math.asin(Math.min(1, Math.hypot(...alignmentError) / 2));
          if (constraint.type === 'concentric' || constraint.type === 'screw') {
            if (a.support?.kind !== 'cylinder' || b.support?.kind !== 'cylinder') throw new Error('Concentric mates require two cylinder supports.');
            const along = dot(second, d), line = subtract(d, multiply(second, along));
            targetVectorRows('length', line, (da, db) => {
              const dd = subtract(da.point, db.point);
              return subtract(subtract(dd, multiply(db.direction, along)), multiply(second, dot(db.direction, d) + dot(second, dd)));
            });
            targetVectorRows('angle', alignmentError, (da, db) => subtract(da.direction, multiply(db.direction, sign)));
            maxLength = finite(Math.hypot(...line) * scale);
            if (constraint.type === 'concentric' && constraint.rotationLock !== null) rotationRows(constraint.rotationLock);
            if (constraint.type === 'screw') {
              const twist = rigidScrewTwist(constraint, bodies, problem.angleTolerance);
              const advance = assemblyScrewAdvance(constraint.lead, constraint.reverse) / scale;
              const neutral = finite(constraint.neutralTravel / scale), relativeOrigin = subtract(b.origin, a.origin);
              if (!Number.isFinite(advance) || advance === 0 || constraint.neutralTravel !== 0 && neutral === 0) throw new RangeError('Normalized screw travel is not representable.');
              const travel = dot(first, relativeOrigin), angularTravel = finite(advance * twist.angle);
              if (twist.angle !== 0 && angularTravel === 0) throw new RangeError('Screw angular advance underflows.');
              const magnitude = finite(Math.abs(travel) + Math.abs(neutral) + Math.abs(angularTravel));
              if (32 * Number.EPSILON * magnitude > lengthTolerance) throw new RangeError('Screw travel exceeds the requested length precision.');
              const error = finite(travel - neutral - angularTravel);
              row('length', error, (da, db) => dot(da.direction, relativeOrigin) + dot(first, subtract(db.origin, da.origin))
                - advance * dot(twist.gradient, subtract(da.omega, db.omega)));
              maxLength = Math.max(maxLength, finite(Math.abs(error) * scale));
              result.screwAngles.set(constraint.id, twist.angle);
            }
          } else {
            if (a.support?.kind !== 'plane' || b.support?.kind !== 'plane') throw new Error('Plane mates require two plane supports.');
            if (constraint.type === 'limit-distance') {
              const limits = validateAssemblyLimitDistanceLimits(constraint.limits), coordinate = dot(second,d),
                minimum = certifiedSphericalNormalization(limits.minimum, limits.minimum / scale), maximum = certifiedSphericalNormalization(limits.maximum, limits.maximum / scale),
                physicalCoordinate = finite(coordinate * scale),
                magnitude = finite(Math.hypot(...a.point) + Math.hypot(...b.point) + Math.abs(minimum) + Math.abs(maximum));
              if (limits.maximum !== limits.minimum && (maximum === minimum || !Number.isFinite(maximum - minimum))) throw new RangeError('Distance interval normalization loses its declared gap.');
              if (finite(compositionError + 32 * Number.EPSILON * magnitude) > lengthTolerance) throw new RangeError('Distance interval coordinate exceeds the requested precision before cancellation.');
              const jacobian = Array.from({ length: columns }, (_,column) => {
                const da = variation(a,column), db = variation(b,column);
                return finite(dot(db.direction,d) + dot(second,subtract(da.point,db.point)));
              });
              (result.inequalities ??= []).push(
                {constraintId:constraint.id,bound:'minimum',margin:finite(coordinate-minimum),tolerance:lengthTolerance,jacobian:[...jacobian]},
                {constraintId:constraint.id,bound:'maximum',margin:finite(maximum-coordinate),tolerance:lengthTolerance,jacobian:jacobian.map(value=>-value)});
              (result.limitDistances ??= []).push({constraintId:constraint.id,coordinate:physicalCoordinate,limits:{...limits},
                activity:assemblyLimitDistanceActivity(physicalCoordinate,limits,physicalLengthTolerance),lengthTolerance:physicalLengthTolerance});
              targetVectorRows('angle',alignmentError,(da,db)=>subtract(da.direction,multiply(db.direction,sign)));
              maxLength = finite(Math.max(0,minimum-coordinate,coordinate-maximum)*scale);
            } else {
            const distance = constraint.type === 'distance' ? constraint.distance : 0;
            if (!Number.isFinite(distance)) throw new Error('Signed plane distance must be finite.');
            const error = finite(dot(second, d) - distance / scale);
            row('length', error, (da, db) => dot(db.direction, d) + dot(second, subtract(da.point, db.point)));
            targetVectorRows('angle', alignmentError, (da, db) => subtract(da.direction, multiply(db.direction, sign)));
            maxLength = finite(Math.abs(error) * scale);
            }
          }
        }
      }
      result.rows.push(...rows);
      result.checks.push({ constraintId: constraint.id, lengthResidual: maxLength, lengthTolerance: physicalLengthTolerance,
        angleResidual: maxAngle, angleTolerance: problem.angleTolerance, satisfied: maxLength <= physicalLengthTolerance && maxAngle <= problem.angleTolerance });
      result.maxLengthResidual = Math.max(result.maxLengthResidual, maxLength); result.maxAngleResidual = Math.max(result.maxAngleResidual, maxAngle);
    } catch (error) {
      result.diagnostics.push({ constraintId: constraint.id, code: error instanceof RotationChartError ? 'orientationChart'
        : error instanceof RangeError ? 'precisionLimit' : 'invalidGeometry', message: error instanceof Error ? error.message : 'Invalid mate geometry.' });
    }
  }
  for (const constraint of problem.passiveGears ?? []) {
    try {
      if (ids.has(constraint.id)) throw new Error('Passive gear IDs must be distinct from hard constraint IDs.');
      ids.add(constraint.id);
      if (constraint.carrier?.support?.kind === 'sphere' || constraint.carrier?.support?.kind === 'point') throw new Error('A passive gear carrier needs a directional frame support.');
      const twists = rigidGearTwists(constraint, bodies, problem.angleTolerance);
      result.gearAngles.set(constraint.id, { first: twists.first.angle, second: twists.second.angle });
    } catch (error) {
      result.diagnostics.push({ constraintId: constraint.id, code: error instanceof RotationChartError ? 'orientationChart'
        : error instanceof RangeError ? 'precisionLimit' : 'invalidGeometry', message: error instanceof Error ? error.message : 'Invalid passive gear chart.' });
    }
  }
  for (const constraint of problem.passiveScrews ?? []) {
    try {
      if (ids.has(constraint.id)) throw new Error('Passive screw IDs must be distinct from all constraint IDs.');
      ids.add(constraint.id);
      result.screwAngles.set(constraint.id, rigidScrewTwist(constraint, bodies, problem.angleTolerance).angle);
    } catch (error) {
      result.diagnostics.push({ constraintId: constraint.id, code: error instanceof RotationChartError ? 'orientationChart'
        : error instanceof RangeError ? 'precisionLimit' : 'invalidGeometry', message: error instanceof Error ? error.message : 'Invalid passive screw chart.' });
    }
  }
  for (const constraint of problem.passiveRackPinions ?? []) {
    try {
      if (ids.has(constraint.id)) throw new Error('Passive rack and pinion IDs must be distinct from all constraint IDs.');
      ids.add(constraint.id);
      result.rackPinionAngles.set(constraint.id, rigidRackPinionTwist(constraint, bodies, problem.angleTolerance).angle);
    } catch (error) {
      result.diagnostics.push({ constraintId: constraint.id, code: error instanceof RotationChartError ? 'orientationChart'
        : error instanceof RangeError ? 'precisionLimit' : 'invalidGeometry', message: error instanceof Error ? error.message : 'Invalid passive rack and pinion chart.' });
    }
  }
  return result;
}
