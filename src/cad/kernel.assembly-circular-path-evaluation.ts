import { validateAssemblyCircularPathReferenceRequest } from '../model/assemblyCircularPathReferences'
import { assemblyLinePathFollowAxis, assemblyLinePathRollAxis } from '../model/assemblyLinePathMate'
import { assemblyOccurrencePathKey, type AssemblyDocument } from '../model/assemblyDocument'
import { transformRigidDirection, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyArcPathPlacementArithmetic, assemblyPointPlacementArithmetic, assemblyEndpointPlacementArithmetic } from './kernel.assembly-snapshot'
import { validateAssemblyPathBands } from '../model/assemblyPathReferences'
import type { AssemblyPathCurveBands } from './kernel.assembly-path-curves'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'
const ROUND=128*Number.EPSILON,MIN=2**-1022
const add=(a:Vec3,b:Vec3)=>a.map((v,i)=>v+b[i]) as Vec3
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3
const mul=(a:Vec3,s:number)=>a.map(v=>v*s) as Vec3
const dot=(a:Vec3,b:Vec3)=>a.reduce((sum,v,i)=>sum+v*b[i],0)
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const norm=(a:readonly number[])=>Math.hypot(...a)
const chord=(angle:number)=>2*Math.sin(Math.min(angle,Math.PI)/2)
const angle=(a:Vec3,b:Vec3)=>Math.atan2(norm(cross(a,b)),dot(a,b))
/** Independent current-native physical measurement. No numerical residual,
 * solver, detached numeric resolver or copied proof participates in this check.
 * Error allowances concern the current analytic Float64 reference model, not
 * physical angular/radius calibration or a formal IEEE interval certificate. */
export function evaluateAssemblyCircularPathReferences(snapshot:AssemblyGeometrySnapshot,document:AssemblyDocument,input:unknown,
 options:AssemblyPathCurveBands={},scopePath:readonly string[]=[]){
 const request=validateAssemblyCircularPathReferenceRequest(input),scope=JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
 const checked=validateAssemblyPathBands(options),bands={lengthToleranceMm:checked.lengthToleranceMm??1e-6,angleToleranceRad:checked.angleToleranceRad??1e-8}
 try{
  const point=snapshot.resolveVertexReference(document,request.point,scope)
  snapshot.assertPointWitness(point,document)
  const path=snapshot.resolveArcPathSelection(document,request.path,scope,bands)
  snapshot.assertPointWitness(point,document);snapshot.assertArcPathWitness(path,document)
  const up=typeof request.orientation.roll==='object'?snapshot.resolveDirectionReference(document,request.orientation.roll.guide,scope):null
  if(up&&(up.kind!=='support'||up.origin!=='native-face'||up.localSupport.kind!=='plane'))throw Error('Circular UP requires an actual current plane face.')
  const assertAll=()=>{snapshot.assertPointWitness(point,document);snapshot.assertArcPathWitness(path,document);if(up)snapshot.assertMateWitness(up,document)}
  assertAll()
  const arc=path.localCurve,R=arc.radiusMm,beta=arc.parameterDomain.last-arc.parameterDomain.first,L=R*beta
  if(!Number.isFinite(L)||L<=0||beta<=0||beta>=2*Math.PI)throw new RangeError('Current material arc has no finite proper trim.')
  const targetCoordinateMm=request.position.mode==='coordinate'?request.position.distanceMm:null
  if(targetCoordinateMm!==null&&targetCoordinateMm>L)throw new RangeError('Fixed coordinate exceeds the current native material trim.')
  // A fixed coordinate is sent unchanged to the real finite native evaluator.
  // A reconstructed endpoint differing by an ULP is never clamped into range.
  const evaluated=targetCoordinateMm===null?null:snapshot.evaluateArcPathSelection(document,request.path,{kind:'arc-length',distanceMm:targetCoordinateMm},scope,bands)
  assertAll();if(evaluated)snapshot.assertArcPathWitness(evaluated,document)
  const pa=assemblyPointPlacementArithmetic(point,document),pb=assemblyArcPathPlacementArithmetic(path,document)
  const origin=point.declaredWorldPose.translation
  const pose=(value:typeof point.declaredWorldPose):RigidPose=>({translation:[...value.translation],rotation:[...value.rotation]})
  const direction=(value:typeof point.declaredWorldPose,v:readonly number[])=>transformRigidDirection(pose(value),[...v] as Vec3)
  const compose=(value:typeof point.declaredWorldPose,v:readonly number[])=>add(direction(value,v),value.translation.map((x,i)=>x-origin[i]) as Vec3)
  const P=compose(point.declaredWorldPose,point.localSupport.point),C=compose(path.declaredWorldPose,arc.center),D=sub(P,C)
  const u=direction(path.declaredWorldPose,arc.materialFrame.radial),v=direction(path.declaredWorldPose,arc.materialFrame.tangent),n=direction(path.declaredWorldPose,arc.materialFrame.normal)
  const ra=ROUND*(pa.depth+1),rb=ROUND*(pb.depth+1),magnitude=norm(D)
  // The actual GPPoint Float64 tuple is the declared numerical reference.
  // Native topology tolerance is disclosed below, not converted into physical
  // coordinate or phase metrology for this explicitly separate query family.
  const pointError=ra*(pa.placementSum+norm(point.localSupport.point)+norm(origin)+norm(P))
  const centerError=arc.arithmetic.positionMm+rb*(pb.placementSum+norm(arc.center)+norm(origin)+norm(C))
  const EF=arc.arithmetic.frameRad+rb+Math.abs(norm(u)-1)+Math.abs(norm(v)-1)+Math.abs(norm(n)-1)
  const ER=arc.arithmetic.radiusMm,EB=arc.arithmetic.sweepRad,E=pointError+centerError
  const arithmetic=ROUND*(magnitude+R+1),z=dot(n,D),planar=sub(D,mul(n,z)),rho=norm(planar)
  let coordinateMm:number|null=null,domainMarginsMm:{minimum:number;maximum:number}|null=null,domainMarginErrorMm:number|null=null
  let positionResidualMm:number,tangent:Vec3|null=null,tangentErrorRad:number,positionErrorMm:number
  if(evaluated){
   const value=evaluated.localEvaluation,target=compose(evaluated.declaredWorldPose,value.point)
   if(value.arithmetic.referenceModel!=='current-native-analytic-float64'||![value.arithmetic.positionMm,value.arithmetic.tangentRad].every(v=>Number.isFinite(v)&&v>0&&v>=MIN))throw new RangeError('Current native D1 arithmetic model is unavailable.')
   tangent=direction(evaluated.declaredWorldPose,value.tangent)
   coordinateMm=targetCoordinateMm
   positionResidualMm=norm(sub(P,target))
   const radiusMinimum=R-ER,phase=targetCoordinateMm!/R
   const phaseError=radiusMinimum>0?Math.abs(phase)*ER/radiusMinimum+ROUND*(1+Math.abs(phase)):Infinity
   positionErrorMm=pointError+value.arithmetic.positionMm+rb*(pb.placementSum+norm(value.point)+norm(origin)+norm(target))+ER+(R+ER)*chord(EF+phaseError)+arithmetic
   tangentErrorRad=value.arithmetic.tangentRad+EF+phaseError+Math.abs(norm(tangent)-1)
  }else{
   const half=beta/2,mid=add(mul(u,Math.cos(half)),mul(v,Math.sin(half))),side=add(mul(u,-Math.sin(half)),mul(v,Math.cos(half)))
   const alpha=Math.atan2(dot(side,planar),dot(mid,planar)),theta=alpha+half
   coordinateMm=rho>0?R*theta:null
   // Symbolic circle evaluation is explicit even outside a finite trim. No
   // finite D1 query, endpoint clamp or periodic native call is fabricated.
   if(rho>0)tangent=cross(n,mul(planar,1/rho))
   const coefficientError=Math.SQRT2*(E+magnitude*chord(EF)+arithmetic)
   const phaseError=coefficientError<rho?Math.asin(coefficientError/rho)+ROUND:Infinity
   if(!(coefficientError<rho)){coordinateMm=null;tangent=null}
   tangentErrorRad=EF+phaseError+ROUND
   if(request.position.mode!=='free')throw Error('Missing current fixed evaluation.')
   if(request.position.domain==='trim'){
    const first=add(C,mul(u,R)),last=add(C,mul(add(mul(u,Math.cos(beta)),mul(v,Math.sin(beta))),R))
    positionResidualMm=theta>=0&&theta<=beta?Math.hypot(z,rho-R):Math.min(norm(sub(P,first)),norm(sub(P,last)))
    domainMarginsMm={minimum:R*(half+alpha),maximum:R*(half-alpha)}
    domainMarginErrorMm=(R+ER)*(phaseError+EB)+ER*(Math.abs(alpha)+half)+arithmetic
    // Individual centered margins are not continuous across the complement
    // cut, even though nearest finite-arc distance itself remains continuous.
    if(Math.PI-Math.abs(alpha)<=phaseError+EB/2+ROUND){coordinateMm=null;domainMarginErrorMm=Infinity}
   }else positionResidualMm=Math.hypot(z,rho-R)
   positionErrorMm=E+ER+(R+ER)*chord(EF+(request.position.domain==='trim'?EB:0))+arithmetic
  }
  const followAxis=assemblyLinePathFollowAxis(request.orientation),rollAxis=assemblyLinePathRollAxis(request.orientation)
  let orientationResidualRad:number|null=null,orientationErrorRad:number|null=null,rollResidualRad:number|null=null,rollErrorRad:number|null=null
  if(followAxis){
   const axis=direction(point.declaredWorldPose,followAxis),reverse=typeof request.orientation.pitchYaw==='object'&&request.orientation.pitchYaw.reverse
   orientationResidualRad=tangent?angle(axis,mul(tangent,reverse?-1:1)):null
   orientationErrorRad=ra+Math.abs(norm(axis)-1)+tangentErrorRad
  }
  if(rollAxis){
   if(!up||up.kind!=='support'||up.localSupport.kind!=='plane'||typeof request.orientation.roll!=='object')throw Error('Missing actual UP plane.')
   const axis=direction(point.declaredWorldPose,rollAxis),normal=direction(up.declaredWorldPose,up.localSupport.normal),pg=assemblyEndpointPlacementArithmetic(up,document)
   if(tangent){
    const project=(a:Vec3)=>sub(a,mul(tangent!,dot(tangent!,a))),a=project(axis),g=project(normal),la=norm(a),lg=norm(g)
    const cone=(error:number,length:number)=>{const change=chord(error)+Math.sin(Math.min(tangentErrorRad,Math.PI/2))+ROUND;return change<length?Math.asin(change/length):Infinity}
    rollErrorRad=cone(ra+Math.abs(norm(axis)-1),la)+cone(ROUND*(pg.depth+1)+Math.abs(norm(normal)-1),lg)+ROUND
    if(la>0&&lg>0)rollResidualRad=angle(mul(a,1/la),mul(g,(request.orientation.roll.reverse?-1:1)/lg))
   }else rollErrorRad=Infinity
  }
  const finiteValues=[...P,...C,...u,...v,...n,R,beta,L,positionResidualMm,positionErrorMm,EF,ER,EB]
  if(!finiteValues.every(Number.isFinite))throw new RangeError('Circular native arithmetic exceeds finite precision.')
  const nominalPosition=positionResidualMm<=bands.lengthToleranceMm,nominalDomain=domainMarginsMm===null||Object.values(domainMarginsMm).every(x=>x>=-bands.lengthToleranceMm)
  const retainedPosition=positionResidualMm+positionErrorMm<=bands.lengthToleranceMm,retainedDomain=domainMarginsMm===null||Object.values(domainMarginsMm).every(x=>x-domainMarginErrorMm!>=-bands.lengthToleranceMm)
  const nominalAngles=(orientationResidualRad===null||orientationResidualRad<=bands.angleToleranceRad)&&(rollResidualRad===null||rollResidualRad<=bands.angleToleranceRad)
  const retainedAngles=(followAxis===null||orientationResidualRad!==null&&orientationResidualRad+orientationErrorRad!<=bands.angleToleranceRad)&&(rollAxis===null||rollResidualRad!==null&&rollResidualRad+rollErrorRad!<=bands.angleToleranceRad)
  const errorFits=positionErrorMm<=bands.lengthToleranceMm&&R>ER&&Number.isFinite(tangentErrorRad)&&tangentErrorRad<=bands.angleToleranceRad&&(domainMarginsMm===null||Number.isFinite(domainMarginErrorMm))&&(coordinateMm===null||Number.isFinite(coordinateMm))&&finiteValues.every(x=>x===0||Math.abs(x)>=MIN)
   &&(!followAxis||Number.isFinite(orientationErrorRad)&&orientationErrorRad!<=bands.angleToleranceRad)&&(!rollAxis||Number.isFinite(rollErrorRad)&&rollErrorRad!<=bands.angleToleranceRad)
  const precise=errorFits&&!(nominalPosition&&nominalDomain&&nominalAngles&&(!retainedPosition||!retainedDomain||!retainedAngles))
  assertAll();if(evaluated)snapshot.assertArcPathWitness(evaluated,document)
  const result={componentPaths:{point:[...point.componentPath],path:[...path.componentPath],...(up?{up:[...up.componentPath]}:{})},position:request.position,orientation:request.orientation,
   radiusMm:R,sweepRad:beta,curveLengthMm:arc.lengthMm,coordinateMm:coordinateMm!==null&&Number.isFinite(coordinateMm)?coordinateMm:null,targetCoordinateMm,positionResidualMm,orientationResidualRad,rollResidualRad,domainMarginsMm,
   lengthTolerance:bands.lengthToleranceMm,angleTolerance:bands.angleToleranceRad,precision:{positionErrorMm,tangentErrorRad:Number.isFinite(tangentErrorRad)?tangentErrorRad:null,orientationErrorRad:orientationErrorRad!==null&&Number.isFinite(orientationErrorRad)?orientationErrorRad:null,rollErrorRad:rollErrorRad!==null&&Number.isFinite(rollErrorRad)?rollErrorRad:null,domainMarginErrorMm:domainMarginErrorMm!==null&&Number.isFinite(domainMarginErrorMm)?domainMarginErrorMm:null},
   uncertaintyModel:'current-native-analytic-float64' as const,topologyTolerancesMm:{point:point.localSupport.tolerance,path:arc.nativeToleranceMm},materialOrigin:true as const,verificationOnly:true as const,compatibilityAuthority:false as const}
  return precise?{...result,status:'ok' as const,satisfied:retainedPosition&&retainedDomain&&retainedAngles}:{...result,status:'precisionLimit' as const,satisfied:false,message:'Current native circular measurement cannot retain the requested numerical bands.'}
 }catch(error){try{snapshot.dispose()}catch(cleanup){throw new NativeCleanupError({error},[cleanup],'Circular verification or native release failed.')}throw error}
}
