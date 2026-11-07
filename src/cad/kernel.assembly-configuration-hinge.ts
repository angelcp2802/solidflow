import {copyRigidHingeConstraint} from '../model/assemblyHingeNumeric'
import type {RigidHingeConstraint} from '../model/assemblySolveTypes'
import type {AssemblyDirectedAngleArc} from '../model/assemblyLimitDirectedAngle'
import {transformRigidDirection,validateRigidPose} from '../model/rigidPose'
import {configuredAssemblyEndpoint,configuredAssemblyEndpointFrame} from './kernel.assembly-configuration-endpoints'
import {assertConfiguredAssemblyScopedRelation,type ConfiguredAssemblyNumericalScope} from './kernel.assembly-configuration-scope'
import {assemblyConfigurationPlacementArithmetic,type AssemblyConfigurationGeometryInput,AssemblyConfigurationGeometrySnapshot,type ConfiguredGeometryWitness,type ConfiguredPlaneWitness} from './kernel.assembly-configuration-snapshot'
import type {ConfiguredResolvedHingeMate} from './kernel.assembly-configuration-relations'
import type {Vec3} from './kernel.types'

export interface ConfiguredAssemblyHingeOptions {lengthToleranceMm?:number;angleToleranceRad?:number}
type Role=ConfiguredGeometryWitness|ConfiguredPlaneWitness
type ScopeMetadata=Pick<ConfiguredResolvedHingeMate,'scopePath'|'scope'|'configuration'|'configurationAncestry'|'scopePose'>
interface ReportBase extends ScopeMetadata {
 alignment:'aligned'|'opposed'
 componentPaths:{axis:[string[],string[]];axial:[string[],string[]]}
 supportOnly:true
 verificationOnly:true
}
interface PhysicalHinge {
 qualifiedRotation:true
 satisfied:boolean
 axisAngleRad:number
 transverseResidualMm:number
 axialOffsetMm:number
 axialityRad:[number,number]
 precision:{positionMm:number;directionRad:number}
 lengthToleranceMm:number
 angleToleranceRad:number
}
export type ConfiguredAssemblyUnlimitedHingeMeasurement=ReportBase&{limited:false}&(
 {status:'precisionLimit';message:string}|({status:'ok'}&PhysicalHinge)
)
interface LimitedMetadata extends Omit<ReportBase,'componentPaths'> {
 limited:true
 componentPaths:ReportBase['componentPaths']&{angular:[string[],string[]]}
 coordinate:'directed-about-axis'
 arcDegrees:AssemblyDirectedAngleArc
}
export type ConfiguredAssemblyLimitedHingeMeasurement=LimitedMetadata&(
 {status:'precisionLimit';message:string}|{
  status:'ok';satisfied:boolean;hinge:PhysicalHinge&{status:'ok'}
  angleRadians:number;projectionLengths:{first:number;second:number}
  marginsRadians:{minimum:number;maximum:number};activity:'interior'|'minimum'|'maximum'|'both'
  fullCircle:boolean;directionErrorRad:number;lengthToleranceMm:number;angleToleranceRad:number
 }
)
export type ConfiguredAssemblyHingeMeasurement=ConfiguredAssemblyUnlimitedHingeMeasurement|ConfiguredAssemblyLimitedHingeMeasurement
const ROUND=128*Number.EPSILON,TURN=2*Math.PI
const intrinsicRelation=AssemblyConfigurationGeometrySnapshot.prototype.assertResolvedMate
const intrinsicWitness=AssemblyConfigurationGeometrySnapshot.prototype.assertWitness
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const norm=(a:readonly number[])=>Math.hypot(...a)
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]]
function policy(input:ConfiguredAssemblyHingeOptions):Required<ConfiguredAssemblyHingeOptions>{
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Configured hinge tolerances require plain data.')
 const result={lengthToleranceMm:1e-6,angleToleranceRad:1e-8}
 for(const key of Reflect.ownKeys(input)){
  const field=Object.getOwnPropertyDescriptor(input,key)!
  if(typeof key!=='string'||!Object.hasOwn(result,key)||!field.enumerable||!('value'in field)||typeof field.value!=='number'||!Number.isFinite(field.value)||field.value<=0)throw Error('Configured hinge tolerances require positive finite own values.')
  result[key as keyof typeof result]=field.value
 }
 if(result.angleToleranceRad>=Math.PI/2)throw Error('Configured hinge angular tolerance must distinguish axial and radial planes.')
 return result
}
function assertComplete(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,value:ConfiguredResolvedHingeMate,scope?:ConfiguredAssemblyNumericalScope):void{
 intrinsicRelation.call(snapshot,value,input)
 if(value.mate.type!=='hinge'||Boolean(value.mate.stops)!==Boolean(value.angular))throw Error('A configured hinge requires its complete four or six role aggregate.')
 for(let i=0;i<2;i++){
  if(value.axis[i].topLevelOwner!==value.axial[i].topLevelOwner||value.angular&&value.axis[i].topLevelOwner!==value.angular[i].topLevelOwner)throw Error('Configured hinge roles must retain their corresponding full-root rigid owners.')
 }
 if(scope!==undefined){
  assertConfiguredAssemblyScopedRelation(snapshot,input,scope,value)
  for(let i=0;i<2;i++){
   const owner=configuredAssemblyEndpointFrame(snapshot,input,value.axis[i],scope).bodyId
   if(owner!==configuredAssemblyEndpointFrame(snapshot,input,value.axial[i],scope).bodyId
    ||value.angular&&owner!==configuredAssemblyEndpointFrame(snapshot,input,value.angular[i],scope).bodyId)throw Error('Each scoped hinge axis, axial and angular role must retain its corresponding numerical owner.')
  }
 }
}
function local(w:Role){
 if(w.kind!=='configured-support'&&w.kind!=='configured-plane')throw Error('Configured hinge needs complete analytic support, not a directional or legacy grant.')
 return w.localSupport
}
function axis(w:Role):Vec3{
 const support=local(w)
 if(support.kind!=='line'&&support.kind!=='cylinder')throw Error('Configured hinge axis requires native LINE or cylinder.')
 return [...support.axis]
}
function normal(w:Role):Vec3{
 const support=local(w)
 if(support.kind!=='plane')throw Error('Configured hinge plane requires native planar support.')
 return [...support.normal]
}
function uncertainty(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,w:Role){
 const arithmetic=assemblyConfigurationPlacementArithmetic(w,input),support=local(w),round=ROUND*(arithmetic.depth+1)
 // Original effective-chain translations are retained before cancellation.
 // Native topology tolerance is positional only, never angular metrology.
 const positionErrorMm=support.tolerance+round*(arithmetic.placementSum+norm(support.point))
 if(!Number.isFinite(positionErrorMm))throw new RangeError('Configured hinge placement uncertainty is not finite.')
 intrinsicWitness.call(snapshot,w,input)
 return {positionErrorMm,directionErrorRad:round}
}
function angle(a:Vec3,b:Vec3,unoriented=false){return Math.atan2(norm(cross(a,b)),unoriented?Math.abs(dot(a,b)):dot(a,b))}
function structuralAxiality(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,value:ConfiguredResolvedHingeMate,scope?:ConfiguredAssemblyNumericalScope):[number,number]{
 return [0,1].map(i=>{
  const a=value.axis[i],p=value.axial[i],af=configuredAssemblyEndpointFrame(snapshot,input,a,scope).frame,pf=configuredAssemblyEndpointFrame(snapshot,input,p,scope).frame
  const residual=angle(transformRigidDirection(af,axis(a)),transformRigidDirection(pf,normal(p)),true)
  if(!Number.isFinite(residual)||residual>1e-12)throw Error('Configured hinge axial planes must be perpendicular to their corresponding axes; radial planes do not qualify free rotation.')
  return residual
 }) as [number,number]
}
/** Detached numerical intent only; no solver, saved edit or private Apply grant.
 * Limited angular observability/cut and satisfaction remain evaluation duties. */
export function buildConfiguredAssemblyHingeConstraint(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,value:ConfiguredResolvedHingeMate,id:string,options:ConfiguredAssemblyHingeOptions={},scope?:ConfiguredAssemblyNumericalScope):RigidHingeConstraint{
 assertComplete(snapshot,input,value,scope)
 const config=policy(options)
 if(typeof id!=='string'||!id.trim())throw Error('Configured hinge constraint requires an ID.')
 structuralAxiality(snapshot,input,value,scope)
 const errors=[...value.axis,...value.axial].map(w=>uncertainty(snapshot,input,w)) as NonNullable<RigidHingeConstraint['uncertainty']>
 if(errors.some(error=>error.positionErrorMm>config.lengthToleranceMm||error.directionErrorRad>config.angleToleranceRad))throw new RangeError('Configured hinge original placements exceed the requested precision.')
 const result=copyRigidHingeConstraint({id,type:'hinge',alignment:value.mate.alignment,
  axis:value.axis.map(w=>configuredAssemblyEndpoint(snapshot,input,w,scope)) as RigidHingeConstraint['axis'],
  axial:value.axial.map(w=>configuredAssemblyEndpoint(snapshot,input,w,scope)) as RigidHingeConstraint['axial'],uncertainty:errors,
  ...(value.mate.stops&&value.angular?{stops:{coordinate:value.mate.stops.coordinate,
   angular:value.angular.map(w=>configuredAssemblyEndpoint(snapshot,input,w,scope)) as NonNullable<RigidHingeConstraint['stops']>['angular'],
   arc:{...value.mate.stops.arc},uncertainty:value.angular.map(w=>uncertainty(snapshot,input,w)) as NonNullable<NonNullable<RigidHingeConstraint['stops']>['uncertainty']>}}:{}),
 })
 assertComplete(snapshot,input,value,scope)
 return result
}
interface Measured {p:Vec3;n:Vec3;pe:number;ne:number}
function measured(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,w:Role,origin:Vec3,isAxis:boolean):Measured{
 const pose=validateRigidPose(w.declaredWorldPose),support=local(w),error=uncertainty(snapshot,input,w)
 const rotated=transformRigidDirection(pose,[...support.point]),p=rotated.map((v,i)=>v+(pose.translation[i]-origin[i])) as Vec3
 const pe=error.positionErrorMm+ROUND*(norm(origin)+norm(pose.translation)+norm(p))
 return {p,n:transformRigidDirection(pose,isAxis?axis(w):normal(w)),pe,ne:error.directionErrorRad}
}
function physicalBase(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,value:ConfiguredResolvedHingeMate,config:Required<ConfiguredAssemblyHingeOptions>):{status:'precisionLimit';message:string}|({status:'ok'}&PhysicalHinge){
 const axialityRad=structuralAxiality(snapshot,input,value),origin:Vec3=[...value.axis[0].declaredWorldPose.translation]
 const [a,b]=value.axis.map(w=>measured(snapshot,input,w,origin,true)),[p,q]=value.axial.map(w=>measured(snapshot,input,w,origin,false))
 const delta=sub(b.p,a.p),planeDelta=sub(q.p,p.p),directionRad=a.ne+b.ne+p.ne+q.ne+16*ROUND
 const positionMm=a.pe+b.pe+p.pe+q.pe+4*(norm(delta)+norm(planeDelta))*directionRad+16*ROUND*(norm(a.p)+norm(b.p)+norm(p.p)+norm(q.p))
 const signedAxis=a.n.map(v=>v*(value.mate.alignment==='aligned'?1:-1)) as Vec3
 const axisAngleRad=angle(signedAxis,b.n),transverseResidualMm=Math.max(norm(cross(delta,a.n)),norm(cross(delta,b.n))),axialOffsetMm=dot(planeDelta,p.n)
 const lengthResidual=Math.max(transverseResidualMm,Math.abs(axialOffsetMm)),nominal=axisAngleRad<=config.angleToleranceRad&&lengthResidual<=config.lengthToleranceMm
 const retained=axisAngleRad+directionRad<=config.angleToleranceRad&&lengthResidual+positionMm<=config.lengthToleranceMm
 if(![positionMm,directionRad,axisAngleRad,transverseResidualMm,axialOffsetMm,...axialityRad].every(Number.isFinite)
  ||positionMm>config.lengthToleranceMm||directionRad>config.angleToleranceRad||nominal&&!retained)return {status:'precisionLimit',message:'Configured hinge original placements and supports exceed the requested measurement precision.'}
 return {status:'ok',qualifiedRotation:true,satisfied:retained,axisAngleRad,transverseResidualMm,axialOffsetMm,axialityRad,precision:{positionMm,directionRad},...config}
}
function measuredDirection(input:AssemblyConfigurationGeometryInput,w:Role,isAxis:boolean):{unit:Vec3;ball:number}{
 const direction=isAxis?axis(w):normal(w),rotated=transformRigidDirection(validateRigidPose(w.declaredWorldPose),direction),magnitude=norm(rotated)
 if(!Number.isFinite(magnitude)||magnitude<.5||magnitude>1.5)throw new RangeError('Configured hinge direction is not resolvable as a unit vector.')
 const arithmetic=assemblyConfigurationPlacementArithmetic(w,input),cone=ROUND*(arithmetic.depth+2)+Math.abs(norm(direction)-1)+Math.abs(magnitude-1)
 return {unit:rotated.map(v=>v/magnitude) as Vec3,ball:2*Math.sin(Math.min(Math.PI,cone)/2)}
}
/** Independent physical support and raw projected-phase measurement. It does
 * not call the numerical hinge/stop evaluator, residual rows or solver state.
 * Borrows the authenticated aggregate/snapshot; it performs no new native query
 * and never assumes ownership of the caller's session. */
export function measureConfiguredAssemblyHinge(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,value:ConfiguredResolvedHingeMate,options:ConfiguredAssemblyHingeOptions={}):ConfiguredAssemblyHingeMeasurement{
 assertComplete(snapshot,input,value)
 const config=policy(options),paths=(pair:readonly Role[])=>pair.map(w=>[...w.componentPath]) as [string[],string[]]
 const base:ReportBase={scopePath:[...value.scopePath],scope:{...value.scope},configuration:value.configuration,
  configurationAncestry:structuredClone(value.configurationAncestry),scopePose:structuredClone(value.scopePose),alignment:value.mate.alignment,
  componentPaths:{axis:paths(value.axis),axial:paths(value.axial)},supportOnly:true,verificationOnly:true}
 const hinge=physicalBase(snapshot,input,value,config)
 if(!value.mate.stops){
  assertComplete(snapshot,input,value)
  return {...base,limited:false,...hinge}
 }
 if(!value.angular)throw Error('Configured limited hinge angular proofs are absent.')
 const limited:LimitedMetadata={...base,limited:true,componentPaths:{...base.componentPaths,angular:paths(value.angular)},coordinate:value.mate.stops.coordinate,arcDegrees:{...value.mate.stops.arc}}
 const precision=(message:string):ConfiguredAssemblyLimitedHingeMeasurement=>{
  assertComplete(snapshot,input,value);return {...limited,status:'precisionLimit',message}
 }
 if(hinge.status!=='ok')return precision(hinge.message)
 const first=measuredDirection(input,value.angular[0],false),second=measuredDirection(input,value.angular[1],false),guide=measuredDirection(input,value.axis[0],true)
 const a=first.unit,b=second.unit,g=guide.unit,ga=dot(g,a),gb=dot(g,b),la=norm(cross(g,a)),lb=norm(cross(g,b))
 if(la<=first.ball+2*guide.ball||lb<=second.ball+2*guide.ball)return precision('A configured angular normal cannot be distinguished from its hinge axis within retained direction error.')
 const x=dot(a,b)-ga*gb,y=dot(g,cross(a,b)),radius=Math.hypot(x,y),gaError=guide.ball+first.ball,gbError=guide.ball+second.ball
 const productError=Math.min(1,Math.abs(ga)+gaError)*gbError+Math.abs(gb)*gaError,xError=first.ball+second.ball+productError,yError=guide.ball+first.ball+second.ball
 const phaseBall=Math.hypot(xError,yError),arithmetic=512*Number.EPSILON*(1+1/radius)
 if(!Number.isFinite(radius)||radius<=phaseBall)return precision('Configured projected angular phase has an unresolved error disk.')
 const directionErrorRad=Math.asin(phaseBall/radius)+arithmetic
 if(!Number.isFinite(directionErrorRad)||directionErrorRad>config.angleToleranceRad)return precision('Configured angular direction errors exceed the requested band.')
 const signed=Math.atan2(y,x)
 let angleRadians=signed<0?signed+TURN:signed
 if(angleRadians===TURN||Object.is(angleRadians,-0))angleRadians=0
 const arc=value.mate.stops.arc,start=arc.start*Math.PI/180,sweep=arc.sweep*Math.PI/180,end=start+sweep,center=start+sweep/2,fullCircle=arc.sweep===360
 if(arc.start!==0&&start===0||arc.sweep!==0&&sweep===0||start===TURN||!fullCircle&&sweep===TURN||sweep!==0&&(end===start||center-sweep/2===center+sweep/2))return precision('The configured angular interval loses an endpoint during radian conversion.')
 let marginsRadians:{minimum:number;maximum:number},activity:'interior'|'minimum'|'maximum'|'both'='interior'
 if(fullCircle){
  let relative=angleRadians-start;if(relative<0)relative+=TURN
  marginsRadians={minimum:relative,maximum:TURN-relative}
 }else{
  let offset=angleRadians-center;offset-=TURN*Math.floor((offset+Math.PI)/TURN)
  const branchError=64*Number.EPSILON*(1+Math.abs(center)+Math.abs(angleRadians))
  if(Math.PI-sweep/2<=branchError||Math.PI-Math.abs(offset)<=directionErrorRad+branchError)return precision('Configured angular uncertainty intersects the interval chart cut.')
  marginsRadians={minimum:offset+sweep/2,maximum:sweep/2-offset}
  const minimum=Math.abs(marginsRadians.minimum)<=config.angleToleranceRad,maximum=Math.abs(marginsRadians.maximum)<=config.angleToleranceRad
  activity=minimum&&maximum?'both':minimum?'minimum':maximum?'maximum':'interior'
 }
 const violation=fullCircle?0:Math.max(0,-marginsRadians.minimum,-marginsRadians.maximum),retained=violation+directionErrorRad<=config.angleToleranceRad
 if(violation<=config.angleToleranceRad&&!retained)return precision('Configured stop fits nominally but retained uncertainty consumes its remaining angular band.')
 assertComplete(snapshot,input,value)
 return {...limited,status:'ok',satisfied:hinge.satisfied&&retained,hinge,angleRadians,projectionLengths:{first:la,second:lb},marginsRadians,activity,fullCircle,directionErrorRad,...config}
}
