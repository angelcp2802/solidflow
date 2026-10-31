import type { Vec3 } from './kernel.types'
import type { Quaternion, RigidPose } from '../model/rigidPose'
import { composeRigidPoses, inverseRigidPose, transformRigidDirection, validateRigidPose } from '../model/rigidPose'
import { assemblyDirectionMateAngle } from '../model/assemblyDirectionMates'
import { assemblyCylinderTangentSupportNormalRelation, type AssemblyCylinderTangentBranch, assemblyCylinderTangentTarget } from '../model/assemblyCylinderTangentMates'
import { assemblyTangentSupportNormalRelation } from '../model/assemblyTangentMates'
import { assemblyPlaneSphereTangentSupportNormalRelation } from '../model/assemblySphereTangentMates'
import { assemblyGearWeights, measureAssemblyGearTwist } from '../model/assemblyGear'
import { assemblyScrewAdvance } from '../model/assemblyScrew'
import { assemblyRackPinionAdvance, assemblyRackPinionAxisPoint, canonicalAssemblyRackDirection } from '../model/assemblyRackPinion'
import { evaluateAssemblyDirectedAngleArc } from '../model/assemblyLimitDirectedAngle'
import { RotationChartError } from '../model/assemblyKinematics'
import { assemblyConfigurationPlacementArithmetic, type AssemblyConfigurationGeometryInput, type AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import { isConfiguredResolvedBinaryMate, type ConfiguredResolvedBinaryMate } from './kernel.assembly-configuration-relations'
import { authenticateConfiguredMeasurement, configuredMeasurementBands, measureConfiguredSupport, measureConfiguredDirection, metadataConfiguredMeasurement, ConfiguredMeasurementPrecisionError, type ConfiguredMeasurementOptions } from './kernel.assembly-configuration-measurement'

const ROUND = 128 * Number.EPSILON
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const mul = (a: Vec3, s: number): Vec3 => [a[0]*s,a[1]*s,a[2]*s]
const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross = (a: Vec3,b: Vec3):Vec3 => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const norm = (a:Vec3) => Math.hypot(...a)
const angle = (a:Vec3,b:Vec3) => Math.atan2(norm(cross(a,b)),dot(a,b))
const chord = (e:number) => 2*Math.sin(Math.min(Math.PI,e)/2)
const pose = (w:AssemblyConfigurationWitness):RigidPose => validateRigidPose(w.declaredWorldPose)
function mathematical<T>(operation:()=>T):T{
 try{return operation()}catch(error){
  if(error instanceof RangeError||error instanceof RotationChartError)precision(error.message)
  throw error
 }
}
function precision(message:string):never {throw new ConfiguredMeasurementPrecisionError(message)}
function finite(value:number):number {if(!Number.isFinite(value))precision('Physical measurement exceeds finite arithmetic.');return value}
function unit(value:Vec3):Vec3 {const n=norm(value);if(!(n>0)||!Number.isFinite(n))precision('Physical direction is unobservable.');return mul(value,1/n)}
type Pair = {minimum:number;maximum:number}
type Metadata = ReturnType<typeof metadataConfiguredMeasurement>
export interface ConfiguredBinaryPhysicalValues {
 positionResidualMm:number|null
 angleResidualRad:number|null
 coordinate:number|null
 marginsMm:Pair|null
 marginsRad:Pair|null
 precision:{positionMm:number|null;angleRad:number|null}
 liftedAngles:{first:number;second:number}|null
 liftedAngle:number|null
 travelMm:number|null
 phaseResidualRad:number|null
 activity:'interior'|'minimum'|'maximum'|'both'|null
 stratum:'regular'|'parallel'|'antiparallel'|null
 limitsDegrees:Pair|null
 arcDegrees:{start:number;sweep:number}|null
 fullCircle:boolean|null
 projectionLengths:{first:number;second:number}|null
 branch:AssemblyCylinderTangentBranch|null
 side:'positive'|'negative'|null
 radialMaterialSense:1|-1|{first:1|-1;second:1|-1}|null
 normalRelation:'same'|'opposed'|null
}
export type ConfiguredAssemblyBinaryMeasurement = Metadata & {
 family:ConfiguredResolvedBinaryMate['mate']['type']; passive:boolean
 bands:Required<ConfiguredMeasurementOptions>
 componentPaths:{first:string[];second:string[];carrier?:string[];guide?:string[]}
} & ({status:'ok';satisfied:boolean}&ConfiguredBinaryPhysicalValues|{status:'precisionLimit';message:string})
type Support = ReturnType<typeof measureConfiguredSupport>
type Direction = ReturnType<typeof measureConfiguredDirection>
function directionKind(w:AssemblyConfigurationWitness):'plane'|'line'|'cylinder'{
 if(w.kind!=='configured-plane'&&w.kind!=='configured-support'&&w.kind!=='configured-direction')throw Error('A current direction purpose is required.')
 const k=w.localSupport.kind
 if(k!=='plane'&&k!=='line'&&k!=='cylinder')throw Error('The configured direction has a foreign support.')
 return k
}
function requirePlane(w:AssemblyConfigurationWitness):void{
 if((w.kind!=='configured-plane'&&w.kind!=='configured-support')||w.localSupport.kind!=='plane')throw Error('A full current planar support is required.')
}
function requireAxis(w:AssemblyConfigurationWitness):void{
 if(w.kind!=='configured-support'||!['line','cylinder'].includes(w.localSupport.kind))throw Error('A current full axis support is required.')
}
function requireSurface(w:AssemblyConfigurationWitness,kind:'cylinder'|'sphere'):void{
 if(w.kind!==(kind==='cylinder'?'configured-cylinder-surface':'configured-sphere-surface'))throw Error('A full material surface purpose is required.')
}
function localAxis(w:AssemblyConfigurationWitness):Vec3{
 if(!('localSupport'in w)||!('axis'in w.localSupport))throw Error('The mechanical endpoint lacks a native local axis.')
 return [...w.localSupport.axis] as Vec3
}
function rotationError(input:AssemblyConfigurationGeometryInput,w:AssemblyConfigurationWitness):number{
 const b=assemblyConfigurationPlacementArithmetic(w,input)
 return finite(ROUND*(b.depth+1))
}
function originError(input:AssemblyConfigurationGeometryInput,w:AssemblyConfigurationWitness):number{
 const b=assemblyConfigurationPlacementArithmetic(w,input)
 return finite(ROUND*(b.depth+1)*(b.placementSum+norm([...w.declaredWorldPose.translation] as Vec3)))
}
function rotationDistance(first:Quaternion,second:Quaternion):number{
 const delta=composeRigidPoses(inverseRigidPose({translation:[0,0,0],rotation:first}),{translation:[0,0,0],rotation:second}).rotation
 return 2*Math.atan2(Math.hypot(delta[0],delta[1],delta[2]),Math.abs(delta[3]))
}
/** A twist chart is a mathematical coordinate, not a native proof. Its finite
 * angular cone is propagated separately from its nominal lifted value. */
function twist(neutral:Quaternion,carrier:Quaternion,endpoint:Quaternion,axis:Vec3,anchor:number,rotationErrorRad:number,axisErrorRad:number,band:number){
 const axisDefect=Math.abs(norm(axis)-1);axis=unit(axis)
 const measured=mathematical(()=>measureAssemblyGearTwist(neutral,carrier,endpoint,axis,anchor,band))
 const delta=finite(Math.SQRT2*2*Math.sin(Math.min(Math.PI,rotationErrorRad)/4)+chord(axisErrorRad+axisDefect)+ROUND*(1+Math.abs(anchor)))
 if(!(delta<measured.rho))precision('The mechanical twist cone includes an unobservable chart.')
 const error=finite(2*Math.asin(delta/measured.rho)+ROUND*(1+Math.abs(measured.angle)))
 if(Math.abs(Math.abs(measured.angle-anchor)-Math.PI)<=error)precision('The lifted mechanical branch cannot be retained.')
 return {angle:measured.angle,error}
}
function projectedAngle(a:Direction,b:Direction,g:Direction):{coordinate:number;error:number;lengths:{first:number;second:number}}{
 const ga=dot(g.unit,a.unit),gb=dot(g.unit,b.unit),x=dot(a.unit,b.unit)-ga*gb,y=dot(g.unit,cross(a.unit,b.unit))
 const ea=chord(a.errorRad),eb=chord(b.errorRad),eg=chord(g.errorRad)
 const dga=eg+ea,dgb=eg+eb
 const dx=ea+eb+Math.abs(ga)*dgb+Math.abs(gb)*dga+dga*dgb+ROUND*32
 const dy=eg+ea+eb+ROUND*32,rho=Math.hypot(x,y),disk=Math.hypot(dx,dy)
 if(!(rho>disk))precision('The directed-angle raw coordinate disk includes zero.')
 const signed=Math.atan2(y,x),coordinate=signed<0?signed+2*Math.PI:signed
 return {coordinate:coordinate===2*Math.PI?0:coordinate,error:finite(Math.asin(disk/rho)+ROUND*32),lengths:{first:norm(cross(g.unit,a.unit)),second:norm(cross(g.unit,b.unit))}}
}
function activity(margins:Pair,band:number):'interior'|'minimum'|'maximum'|'both'{
 const minimum=Math.abs(margins.minimum)<=band,maximum=Math.abs(margins.maximum)<=band
 return minimum&&maximum?'both':minimum?'minimum':maximum?'maximum':'interior'
}
/** Independent physical measurements over authentic configured native roles.
 * No residual/Jacobian evaluator, numerical solve or snapshot disposal occurs. */
export function measureConfiguredAssemblyBinary(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,
 value:ConfiguredResolvedBinaryMate,options:ConfiguredMeasurementOptions={}):ConfiguredAssemblyBinaryMeasurement{
 authenticateConfiguredMeasurement(snapshot,input,value)
 if(!isConfiguredResolvedBinaryMate(value))throw Error('A configured binary aggregate is required.')
 const bands=configuredMeasurementBands(options),m=value.mate
 const passive=value.suppressed&&(m.type==='gear'||m.type==='screw'||m.type==='rack-pinion')
 if(value.suppressed&&!passive)throw Error('A suppressed nonmechanical relation is not an active physical check.')
 const base={...metadataConfiguredMeasurement(value),family:m.type,passive,bands,componentPaths:{first:[...value.first.componentPath],second:[...value.second.componentPath],...(value.carrier?{carrier:[...value.carrier.componentPath]}:{}),...(value.guide?{guide:[...value.guide.componentPath]}:{})}}
 try{
  const out:ConfiguredBinaryPhysicalValues={positionResidualMm:null,angleResidualRad:null,coordinate:null,marginsMm:null,marginsRad:null,
   precision:{positionMm:null,angleRad:null},liftedAngles:null,liftedAngle:null,travelMm:null,phaseResidualRad:null,
   activity:null,stratum:null,limitsDegrees:null,arcDegrees:null,fullCircle:null,projectionLengths:null,branch:null,side:null,radialMaterialSense:null,normalRelation:null}
  const origin=[...value.first.declaredWorldPose.translation] as Vec3
  const support=(w:AssemblyConfigurationWitness)=>measureConfiguredSupport(snapshot,input,w,origin)
  const direction=(w:AssemblyConfigurationWitness)=>measureConfiguredDirection(snapshot,input,w)
  const setLength=(r:number,e:number)=>{out.positionResidualMm=Math.max(out.positionResidualMm??0,Math.abs(finite(r)));out.precision.positionMm=Math.max(out.precision.positionMm??0,finite(e))}
  const setAngle=(r:number,e:number)=>{out.angleResidualRad=Math.max(out.angleResidualRad??0,Math.abs(finite(r)));out.precision.angleRad=Math.max(out.precision.angleRad??0,finite(e))}
  const dError=(a:Support,b:Support)=>finite(a.positionErrorMm+b.positionErrorMm+ROUND*(norm(a.pointMm)+norm(b.pointMm)))
  const collinear=(a:Support,b:Support,u:Direction,v:Direction,sign:number)=>{
   const delta=sub(a.pointMm,b.pointMm),along=dot(v.unit,delta)
   setAngle(angle(u.unit,mul(v.unit,sign)),u.errorRad+v.errorRad)
   setLength(norm(sub(delta,mul(v.unit,along))),dError(a,b)+chord(v.errorRad)*norm(delta)+ROUND*Math.abs(along))
  }
  const planes=()=>{requirePlane(value.first);requirePlane(value.second);return {a:support(value.first),b:support(value.second),u:direction(value.first),v:direction(value.second)}}
  switch(m.type){
   case 'angle':case 'parallel':case 'perpendicular':case 'limit-angle':case 'limit-directed-angle':{
    const a=direction(value.first),b=direction(value.second),theta=angle(a.unit,b.unit),error=a.errorRad+b.errorRad+ROUND*8
    if(m.type==='limit-directed-angle'){
     if(!value.guide)throw Error('The directed angular check requires its genuine guide.')
     const measured=projectedAngle(a,b,direction(value.guide)),arc=mathematical(()=>evaluateAssemblyDirectedAngleArc(measured.coordinate,m.arc,bands.angleToleranceRad))
     const convertedCenter=(m.arc.start+m.arc.sweep/2)*Math.PI/180,offset=Math.atan2(Math.sin(measured.coordinate-convertedCenter),Math.cos(measured.coordinate-convertedCenter))
     if(!arc.fullCircle&&Math.PI-Math.abs(offset)<=measured.error+ROUND*(1+Math.abs(convertedCenter)))precision('The directed angular uncertainty reaches its complementary chart cut.')
     out.coordinate=measured.coordinate;out.marginsRad=arc.fullCircle?null:{...arc.marginsRadians}
     out.arcDegrees={...m.arc};out.fullCircle=arc.fullCircle;out.activity=arc.activity;out.projectionLengths=measured.lengths
     setAngle(arc.fullCircle?0:Math.max(0,-arc.marginsRadians.minimum,-arc.marginsRadians.maximum),arc.fullCircle?0:measured.error)
    }else if(m.type==='limit-angle'){
     const lower=m.limits.minimum*Math.PI/180,upper=m.limits.maximum*Math.PI/180
     if(!Number.isFinite(lower)||!Number.isFinite(upper)||(m.limits.minimum!==0&&lower===0)||(m.limits.maximum!==0&&upper===0)||(m.limits.maximum>m.limits.minimum&&!(upper>lower)))precision('The principal angular endpoints are not distinguishable in radians.')
     out.coordinate=theta;out.marginsRad={minimum:theta-lower,maximum:upper-theta}
     out.limitsDegrees={...m.limits};out.activity=activity(out.marginsRad,bands.angleToleranceRad);out.stratum=theta===0?'parallel':theta===Math.PI?'antiparallel':'regular'
     setAngle(Math.max(0,lower-theta,theta-upper),error+ROUND*(Math.abs(lower)+Math.abs(upper)))
    }else{
     const target=(m.type==='angle'?m.angle:assemblyDirectionMateAngle(m.type,directionKind(value.first),directionKind(value.second),m.alignment))*Math.PI/180
     out.coordinate=theta;setAngle(theta-target,error+ROUND*Math.abs(target))
    }
    break
   }
   case 'coincident':case 'distance':case 'limit-distance':{
    const {a,b,u,v}=planes(),delta=sub(a.pointMm,b.pointMm),coordinate=dot(v.unit,delta),error=dError(a,b)+chord(v.errorRad)*norm(delta)
    setAngle(angle(u.unit,mul(v.unit,m.alignment==='aligned'?1:-1)),u.errorRad+v.errorRad)
    out.coordinate=coordinate
    if(m.type==='limit-distance'){
     out.marginsMm={minimum:coordinate-m.limits.minimum,maximum:m.limits.maximum-coordinate}
     out.activity=activity(out.marginsMm,bands.lengthToleranceMm)
     setLength(Math.max(0,-out.marginsMm.minimum,-out.marginsMm.maximum),error+ROUND*(Math.abs(m.limits.minimum)+Math.abs(m.limits.maximum)))
    }else{const target=m.type==='distance'?m.distance:0;setLength(coordinate-target,error+ROUND*Math.abs(target))}
    break
   }
   case 'concentric':case 'screw':{
    requireAxis(value.first);requireAxis(value.second)
    const u=direction(value.first)
    if(!passive)collinear(support(value.first),support(value.second),u,direction(value.second),m.alignment==='aligned'?1:-1)
    if(m.type==='concentric'){
     if(m.rotationLock!==null){
      const actual=composeRigidPoses(inverseRigidPose({translation:[0,0,0],rotation:pose(value.first).rotation}),{translation:[0,0,0],rotation:pose(value.second).rotation}).rotation
      setAngle(rotationDistance([...m.rotationLock],actual),rotationError(input,value.first)+rotationError(input,value.second)+ROUND*16)
     }
    }else{
     const t=twist([...m.neutralRotation],pose(value.second).rotation,pose(value.first).rotation,localAxis(value.first),m.angle,
      rotationError(input,value.first)+rotationError(input,value.second)+ROUND*16,ROUND*8,bands.angleToleranceRad)
     out.liftedAngle=t.angle;out.phaseResidualRad=t.angle-m.angle;setAngle(t.angle-m.angle,t.error)
     if(passive)break
     const delta=sub([...value.second.declaredWorldPose.translation] as Vec3,[...value.first.declaredWorldPose.translation] as Vec3),travel=dot(u.unit,delta),advance=assemblyScrewAdvance(m.lead,m.reverse)
     out.travelMm=travel;out.coordinate=travel
     const travelError=originError(input,value.first)+originError(input,value.second)+chord(u.errorRad)*norm(delta)+ROUND*(Math.abs(travel)+Math.abs(m.neutralTravel)+Math.abs(advance*t.angle))
     setLength(travel-m.neutralTravel-advance*t.angle,travelError+Math.abs(advance)*t.error)
    }
    break
   }
   case 'lock':{
    if(value.first.kind!=='configured-component'||value.second.kind!=='configured-component')throw Error('Lock requires two genuine configured component frames.')
    const a=pose(value.first),b=pose(value.second),delta=sub(b.translation,a.translation)
    const expected=transformRigidDirection(a,[...m.relativePose.translation] as Vec3)
    setLength(norm(sub(delta,expected)),originError(input,value.first)+originError(input,value.second)+chord(rotationError(input,value.first))*norm(expected)+ROUND*(norm(delta)+norm(expected)))
    const expectedRotation=composeRigidPoses({translation:[0,0,0],rotation:a.rotation},validateRigidPose(m.relativePose)).rotation
    setAngle(rotationDistance(expectedRotation,b.rotation),rotationError(input,value.first)+rotationError(input,value.second)+ROUND*16)
    break
   }
   case 'tangent':case 'plane-sphere-tangent':{
    const surfaceKind=m.type==='tangent'?'cylinder':'sphere',firstIsSurface=value.first.kind===(surfaceKind==='cylinder'?'configured-cylinder-surface':'configured-sphere-surface')
    const sw=firstIsSurface?value.first:value.second,pw=firstIsSurface?value.second:value.first
    requireSurface(sw,surfaceKind);requirePlane(pw)
    const s=support(sw),p=support(pw),n=direction(pw),delta=sub(s.pointMm,p.pointMm),r=s.radiusMm
    if(r===null||s.radiusErrorMm===null)throw Error('The surface purpose did not measure a radius.')
    if(m.type==='tangent'){
     const axis=direction(sw),theta=angle(n.unit,axis.unit)
     setAngle(theta-Math.PI/2,n.errorRad+axis.errorRad)
    }
    if(s.radialMaterialSense!==1&&s.radialMaterialSense!==-1)throw Error('The material surface sense is unavailable.')
    out.side=m.side;out.radialMaterialSense=s.radialMaterialSense
    out.normalRelation=m.type==='tangent'?assemblyTangentSupportNormalRelation(m.side,s.radialMaterialSense):assemblyPlaneSphereTangentSupportNormalRelation(m.side,s.radialMaterialSense)
    const coordinate=dot(n.unit,delta),target=(m.side==='positive'?1:-1)*r
    out.coordinate=coordinate;setLength(coordinate-target,dError(s,p)+chord(n.errorRad)*norm(delta)+s.radiusErrorMm+ROUND*r)
    break
   }
   case 'skew-cylinder-tangent':case 'parallel-cylinder-tangent':case 'sphere-sphere-tangent':case 'cylinder-sphere-tangent':{
    const ss=m.type==='sphere-sphere-tangent',cs=m.type==='cylinder-sphere-tangent'
    if(ss){requireSurface(value.first,'sphere');requireSurface(value.second,'sphere')}
    else if(cs){if(value.first.kind==='configured-cylinder-surface'){requireSurface(value.first,'cylinder');requireSurface(value.second,'sphere')}else{requireSurface(value.first,'sphere');requireSurface(value.second,'cylinder')}}
    else{requireSurface(value.first,'cylinder');requireSurface(value.second,'cylinder')}
    const a=support(value.first),b=support(value.second),delta=sub(b.pointMm,a.pointMm)
    if(a.radiusMm===null||b.radiusMm===null||a.radiusErrorMm===null||b.radiusErrorMm===null)throw Error('Tangency requires current surface radii.')
    if((a.radialMaterialSense!==1&&a.radialMaterialSense!==-1)||(b.radialMaterialSense!==1&&b.radialMaterialSense!==-1))throw Error('Both material surface senses are required.')
    out.branch={...m.branch};out.radialMaterialSense={first:a.radialMaterialSense,second:b.radialMaterialSense}
    out.normalRelation=assemblyCylinderTangentSupportNormalRelation(m.branch,a.radialMaterialSense,b.radialMaterialSense)
    const target=mathematical(()=>assemblyCylinderTangentTarget(m.branch,a.radiusMm!,b.radiusMm!,bands.lengthToleranceMm))
    const radiusError=a.radiusErrorMm+b.radiusErrorMm+ROUND*(a.radiusMm+b.radiusMm)
    if(!(target>radiusError))precision('The selected material radius branch cannot retain a positive gap.')
    let distance:number,error=dError(a,b)+radiusError
    if(ss){distance=norm(delta)}
    else if(cs){const cw=value.first.kind==='configured-cylinder-surface'?value.first:value.second,c=direction(cw),along=dot(c.unit,delta);distance=norm(sub(delta,mul(c.unit,along)));error+=chord(c.errorRad)*norm(delta)}
    else{
     const u=direction(value.first),v=direction(value.second),c=cross(u.unit,v.unit),sine=norm(c),angular=u.errorRad+v.errorRad
     if(m.type==='skew-cylinder-tangent'){
      const ball=chord(u.errorRad)+chord(v.errorRad)+ROUND*8
      if(!(sine>ball)||sine<=1e-7)precision('The nonparallel cylinder separation chart is unobservable.')
      const normal=mul(c,1/sine);distance=Math.abs(dot(normal,delta));error+=2*ball/(sine-ball)*norm(delta)
     }else{
      setAngle(Math.atan2(sine,Math.abs(dot(u.unit,v.unit))),angular)
      distance=norm(sub(delta,mul(u.unit,dot(u.unit,delta))));error+=chord(u.errorRad)*norm(delta)
     }
    }
    if(!(distance>error))precision('Tangency lacks a retained radial separation direction.')
    out.coordinate=distance;setLength(distance-target,error);break
   }
   case 'gear':{
    requireAxis(value.first);requireAxis(value.second)
    if(!value.carrier||value.carrier.kind!=='configured-component')throw Error('Gear requires its explicit genuine carrier frame, including the scope carrier.')
    const carrier=pose(value.carrier),ce=rotationError(input,value.carrier)
    const a=twist([...m.neutralRotations.first],carrier.rotation,pose(value.first).rotation,localAxis(value.first),m.angles.first,rotationError(input,value.first)+ce+ROUND*16,ROUND*8,bands.angleToleranceRad)
    const b=twist([...m.neutralRotations.second],carrier.rotation,pose(value.second).rotation,localAxis(value.second),m.angles.second,rotationError(input,value.second)+ce+ROUND*16,ROUND*8,bands.angleToleranceRad)
    const w=assemblyGearWeights(m.ratio),sign=m.direction==='opposed'?1:-1
    const phase=w.first*a.angle+sign*w.second*b.angle-m.phase
    out.liftedAngles={first:a.angle,second:b.angle};out.phaseResidualRad=phase
    setAngle(a.angle-m.angles.first,a.error);setAngle(b.angle-m.angles.second,b.error)
    if(!passive)setAngle(phase,w.first*a.error+w.second*b.error+ROUND*(Math.abs(w.first*a.angle)+Math.abs(w.second*b.angle)+Math.abs(m.phase)))
    break
   }
   case 'rack-pinion':{
    requireAxis(value.first);requireAxis(value.second)
    if(value.first.kind!=='configured-support'||value.first.localSupport.kind!=='cylinder')throw Error('Rack requires its genuine pinion cylinder axis.')
    // The declared rack conversion may consume this native cylinder radius;
    // this does not turn its axis grant into general surface authority.
    const local=value.first.localSupport,firstPose=pose(value.first),secondPose=pose(value.second)
    const t=twist([...m.neutralRotation],secondPose.rotation,firstPose.rotation,localAxis(value.first),m.angle,rotationError(input,value.first)+rotationError(input,value.second)+ROUND*16,ROUND*8,bands.angleToleranceRad)
    out.liftedAngle=t.angle;out.phaseResidualRad=t.angle-m.angle;setAngle(t.angle-m.angle,t.error)
    if(passive)break
    const a=support(value.first),b=support(value.second)
    const e=transformRigidDirection(secondPose,canonicalAssemblyRackDirection(localAxis(value.second)))
    const offset=transformRigidDirection(firstPose,mathematical(()=>assemblyRackPinionAxisPoint([...local.point] as Vec3,[...local.axis] as Vec3,bands.lengthToleranceMm)))
    const separation=sub(sub(secondPose.translation,firstPose.translation),offset),travel=dot(e,separation),advance=assemblyRackPinionAdvance(m.conversion,m.reverse,local.radius)
    const re=local.tolerance+ROUND*local.radius,advanceError=m.conversion.override===null?re:ROUND*Math.abs(advance)
    const error=originError(input,value.first)+originError(input,value.second)+a.positionErrorMm+b.positionErrorMm+chord(rotationError(input,value.second))*norm(separation)+ROUND*(norm(offset)+Math.abs(travel)+Math.abs(m.neutralTravel)+Math.abs(advance*t.angle))+Math.abs(advance)*t.error+Math.abs(t.angle)*advanceError
    out.travelMm=travel;out.coordinate=travel
    setLength(travel-m.neutralTravel-advance*t.angle,error);break
   }
   default:{const never:never=m;throw Error('Unknown configured binary family '+String(never))}
  }
  // A nominal value inside its band is insufficient when its retained cone
  // crosses that band. A clearly outside envelope remains a precise failure.
  const checks=[{r:out.positionResidualMm,e:out.precision.positionMm,band:bands.lengthToleranceMm},
   {r:out.angleResidualRad,e:out.precision.angleRad,band:bands.angleToleranceRad}].filter(check=>check.r!==null)
  for(const check of checks){
   if(check.e===null||!Number.isFinite(check.e)||check.e<0||check.e>check.band)precision('The physical uncertainty budget exceeds its requested band.')
  }
  const outside=checks.some(check=>check.r!-check.e!>check.band)
  const inside=checks.every(check=>check.r!+check.e!<=check.band)
  if(!outside&&!inside)precision('The physical uncertainty envelope crosses the requested acceptance band.')
  authenticateConfiguredMeasurement(snapshot,input,value)
  return {...base,status:'ok',...out,satisfied:!outside&&inside}
 }catch(error){
  authenticateConfiguredMeasurement(snapshot,input,value)
  if(error instanceof ConfiguredMeasurementPrecisionError){
   return {...base,status:'precisionLimit',message:error.message}
  }
  throw error
 }
}
