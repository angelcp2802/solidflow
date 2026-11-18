import type {AssemblyBinaryMate} from '../model/assemblyDocument'
import type {RigidMateConstraint,RigidMateEndpoint,RigidSymmetrySupportUncertainty} from '../model/assemblySolveTypes'
import {validateRigidPose} from '../model/rigidPose'
import {assemblyConfigurationPlacementArithmetic,type AssemblyConfigurationGeometryInput,type AssemblyConfigurationGeometrySnapshot,type AssemblyConfigurationWitness} from './kernel.assembly-configuration-snapshot'
import {configuredAssemblyEndpoint} from './kernel.assembly-configuration-endpoints'
import {assertConfiguredAssemblyScopedRelation,type ConfiguredAssemblyNumericalScope} from './kernel.assembly-configuration-scope'
import {buildConfiguredAssemblyAdvancedConstraint} from './kernel.assembly-configuration-advanced'
import {buildConfiguredAssemblyHingeConstraint} from './kernel.assembly-configuration-hinge'
import {configuredResolvedMateWitnesses,isConfiguredResolvedBinaryMate,isConfiguredResolvedWidthMate,isConfiguredResolvedSymmetryMate,isConfiguredResolvedHingeMate,isConfiguredResolvedProfileCenterMate,isConfiguredResolvedLinePathMate,isConfiguredResolvedCircularPathMate,type ConfiguredResolvedMate} from './kernel.assembly-configuration-relations'

export interface ConfiguredAssemblyNumericOptions {lengthToleranceMm?:number;angleToleranceRad?:number}
type ReadonlyData<T>=T extends object?{readonly[K in keyof T]:ReadonlyData<T[K]>}:T
const ROUND=128*Number.EPSILON
function policy(input:ConfiguredAssemblyNumericOptions){
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input)))throw Error('Configured numerical bands require plain data.')
 const result={lengthToleranceMm:1e-6,angleToleranceRad:1e-8}
 for(const key of Reflect.ownKeys(input)){
  const field=Object.getOwnPropertyDescriptor(input,key)!
  if(typeof key!=='string'||!Object.hasOwn(result,key)||!field.enumerable||!('value'in field)||typeof field.value!=='number'||!Number.isFinite(field.value)||field.value<=0)throw Error('Invalid configured numerical band.')
  result[key as keyof typeof result]=field.value
 }
 if(result.angleToleranceRad>=Math.PI)throw Error('Configured angular band must be below pi.')
 return result
}
function binary(mate:ReadonlyData<AssemblyBinaryMate>,id:string,first:RigidMateEndpoint,second:RigidMateEndpoint,carrier?:RigidMateEndpoint,guide?:RigidMateEndpoint):RigidMateConstraint{
 const common={id,first,second}
 switch(mate.type){
  case 'limit-directed-angle':{
   if(!guide||[first,second,guide].some(e=>!e.support||e.support.kind==='sphere'||e.support.kind==='point'))throw Error('Configured directed stops require three native directions.')
   return {...common,type:mate.type,coordinate:mate.coordinate,guide,arc:{...mate.arc}}
  }
  case 'limit-angle':return {...common,type:mate.type,coordinate:mate.coordinate,limits:{...mate.limits}}
  case 'limit-distance':return {...common,type:mate.type,alignment:mate.alignment,limits:{...mate.limits}}
  case 'plane-sphere-tangent':case 'tangent':return {...common,type:mate.type,side:mate.side}
  case 'sphere-sphere-tangent':case 'cylinder-sphere-tangent':case 'skew-cylinder-tangent':case 'parallel-cylinder-tangent':return {...common,type:mate.type,branch:{...mate.branch}}
  case 'rack-pinion':return {...common,type:mate.type,conversion:{...mate.conversion},reverse:mate.reverse,neutralRotation:[...mate.neutralRotation],angle:mate.angle,neutralTravel:mate.neutralTravel}
  case 'screw':return {...common,type:mate.type,lead:mate.lead,reverse:mate.reverse,alignment:mate.alignment,neutralRotation:[...mate.neutralRotation],angle:mate.angle,neutralTravel:mate.neutralTravel}
  case 'gear':{
   if(!carrier)throw Error('Configured gear requires its authenticated declaring or explicit carrier frame.')
   return {...common,type:mate.type,carrier,ratio:{...mate.ratio},direction:mate.direction,neutralRotations:{first:[...mate.neutralRotations.first],second:[...mate.neutralRotations.second]},angles:{...mate.angles},phase:mate.phase}
  }
  case 'lock':return {...common,type:mate.type,relativePose:validateRigidPose(mate.relativePose)}
  case 'angle':return {...common,type:mate.type,angle:mate.angle}
  case 'parallel':case 'perpendicular':return {...common,type:mate.type,alignment:mate.alignment}
  case 'concentric':return {...common,type:mate.type,alignment:mate.alignment,rotationLock:mate.rotationLock?[...mate.rotationLock]:null}
  case 'distance':return {...common,type:mate.type,alignment:mate.alignment,distance:mate.distance}
  case 'coincident':return {...common,type:mate.type,alignment:mate.alignment}
  default:{const unknown:never=mate;throw Error('Unknown configured numerical family '+String(unknown))}
 }
}
function uncertainty(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,witness:AssemblyConfigurationWitness,scope?:ConfiguredAssemblyNumericalScope):RigidSymmetrySupportUncertainty{
 const endpoint=configuredAssemblyEndpoint(snapshot,input,witness,scope),support=endpoint.support,budget=assemblyConfigurationPlacementArithmetic(witness,input),round=ROUND*(budget.depth+1)
 const positionErrorMm=(support?.tolerance??0)+round*(budget.placementSum+(support?Math.hypot(...support.point):0))
 const error={positionErrorMm,...(support?.kind==='point'||support?.kind==='sphere'?{}:{directionErrorRad:round}),
  ...(support?.kind==='sphere'||support?.kind==='cylinder'?{radiusErrorMm:support.tolerance+round*support.radius}:{})}
 if(Object.values(error).some(v=>!Number.isFinite(v)))throw new RangeError('The original configured placement chain exceeds finite precision.')
 return error
}
/** Current privately authenticated references to detached numerical intent.
 * Root rigid owners remain root owners. No source override, capture, saved
 * configuration, solve, final native acceptance or Apply authority is issued. */
export function buildConfiguredAssemblyConstraint(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,value:ConfiguredResolvedMate,id:string,options:ConfiguredAssemblyNumericOptions={}):RigidMateConstraint{
 return buildConfiguredConstraint(snapshot,input,value,id,options)
}
/** Exact selected-scope numerical problem. This does not promote its children
 * to physical root owners or authorize a configured solve/writeback. */
export function buildConfiguredAssemblyScopedConstraint(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,scope:ConfiguredAssemblyNumericalScope,value:ConfiguredResolvedMate,id:string,options:ConfiguredAssemblyNumericOptions={}):RigidMateConstraint{
 assertConfiguredAssemblyScopedRelation(snapshot,input,scope,value)
 const result=buildConfiguredConstraint(snapshot,input,value,id,options,scope)
 assertConfiguredAssemblyScopedRelation(snapshot,input,scope,value)
 return result
}
function buildConfiguredConstraint(snapshot:AssemblyConfigurationGeometrySnapshot,input:AssemblyConfigurationGeometryInput,value:ConfiguredResolvedMate,id:string,options:ConfiguredAssemblyNumericOptions,scope?:ConfiguredAssemblyNumericalScope):RigidMateConstraint{
 snapshot.assertResolvedMate(value,input)
 if(typeof id!=='string'||!id.trim())throw Error('Configured numerical constraint needs an ID.')
 const bands=policy(options)
 if(isConfiguredResolvedHingeMate(value))return buildConfiguredAssemblyHingeConstraint(snapshot,input,value,id,bands,scope)
 if(isConfiguredResolvedProfileCenterMate(value)||isConfiguredResolvedLinePathMate(value)||isConfiguredResolvedCircularPathMate(value))return buildConfiguredAssemblyAdvancedConstraint(snapshot,input,value,id,bands,scope)
 const project=(w:AssemblyConfigurationWitness)=>configuredAssemblyEndpoint(snapshot,input,w,scope)
 // Pure directions do not acquire position or radius authority. Translation
 // magnitudes cannot turn an angular-only reference into a positional query.
 // Suppressed mechanisms retain their native rotation chart, not a positional
 // coupling equation. Irrelevant translations cannot revoke angular winding.
 // Active gear phase also has no positional coordinate or radius parameter.
 const passiveMechanical=value.suppressed&&['gear','screw','rack-pinion'].includes(value.mate.type)
 const directionOnly=passiveMechanical||value.mate.type==='gear'||['angle','parallel','perpendicular','limit-angle','limit-directed-angle'].includes(value.mate.type)
 for(const witness of configuredResolvedMateWitnesses(value)){
  const budget=assemblyConfigurationPlacementArithmetic(witness,input),round=ROUND*(budget.depth+1)
  if(round>bands.angleToleranceRad)throw new RangeError('Configured direction composition exceeds the requested angular precision.')
  if(directionOnly)continue
  const error=uncertainty(snapshot,input,witness,scope)
  let targetMagnitude=0
  if(value.mate.type==='distance')targetMagnitude=Math.abs(value.mate.distance)
  if(value.mate.type==='limit-distance')targetMagnitude=Math.abs(value.mate.limits.minimum)+Math.abs(value.mate.limits.maximum)
  // An axis selected on a cylinder does not measure its radius. Surface
  // families and the rack's actual pitch-radius conversion do use that value.
  const radiusUsed=witness.kind==='configured-cylinder-surface'||witness.kind==='configured-sphere-surface'||isConfiguredResolvedBinaryMate(value)&&value.mate.type==='rack-pinion'&&value.first===witness
  if(error.positionErrorMm+round*targetMagnitude>bands.lengthToleranceMm||radiusUsed&&(error.radiusErrorMm??0)>bands.lengthToleranceMm)throw new RangeError('The original configured placements exceed the requested length precision.')
 }
 let result:RigidMateConstraint
 if(isConfiguredResolvedBinaryMate(value)){
  result=binary(value.mate,id,project(value.first),project(value.second),value.carrier?project(value.carrier):undefined,value.guide?project(value.guide):undefined)
 }else if(isConfiguredResolvedWidthMate(value)){
  const pair=(p:typeof value.width):[RigidMateEndpoint,RigidMateEndpoint]=>[project(p[0]),project(p[1])]
  result={id,type:'width',mode:value.mate.mode,width:pair(value.width),tab:pair(value.tab),widthBranch:value.mate.widthBranch,tabBranch:value.mate.tabBranch,alignment:value.mate.alignment}
 }else if(isConfiguredResolvedSymmetryMate(value)){
  const entity=(w:typeof value.source)=>{
   const endpoint=project(w),support=endpoint.support
   if(value.mate.entityKind==='line'&&support?.kind==='cylinder'&&w.kind==='configured-support')return {...endpoint,support:{kind:'line' as const,point:[...support.point] as [number,number,number],axis:[...support.axis] as [number,number,number],tolerance:support.tolerance}}
   if(support?.kind!==value.mate.entityKind)throw Error('Configured symmetry has a foreign native entity purpose.')
   return endpoint
  }
  const error=(w:typeof value.source)=>{
   const e=uncertainty(snapshot,input,w,scope)
   return value.mate.entityKind==='line'?{positionErrorMm:e.positionErrorMm,directionErrorRad:e.directionErrorRad!}:e
  }
  result={id,type:'symmetry',source:entity(value.source),target:entity(value.target),mirror:project(value.mirror),alignment:value.mate.alignment,uncertainty:[error(value.source),error(value.target),uncertainty(snapshot,input,value.mirror,scope)]}
 }else{const unknown:never=value;throw Error('Unknown configured aggregate '+String(unknown))}
 snapshot.assertResolvedMate(value,input)
 return result
}
