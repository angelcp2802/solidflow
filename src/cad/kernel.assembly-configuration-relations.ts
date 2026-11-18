import {validateAssemblyMate} from '../model/assemblyDocument'
import type {AssemblyBinaryMate,AssemblyMate,AssemblyWidthCenteredMate,AssemblySymmetryMate,AssemblyProfileCenterMate,AssemblyLinePathMate,AssemblyCircularPathMate,AssemblyHingeMate} from '../model/assemblyDocument'
import {assemblyMateEndpoints,type AssemblyMateEndpointSide} from '../model/assemblyMateEndpoints'
import type {AssemblyConfigurationMateInspection} from '../model/assemblyConfigurationReferences'
import type {
 AssemblyConfigurationWitness,ConfiguredComponentWitness,ConfiguredGeometryWitness,ConfiguredDirectionWitness,
 ConfiguredPlaneWitness,ConfiguredPointWitness,ConfiguredCylinderSurfaceWitness,ConfiguredSphereSurfaceWitness,
 ConfiguredProfileWitness,ConfiguredProfileAxisWitness,ConfiguredLinePathWitness,ConfiguredArcPathWitness,
} from './kernel.assembly-configuration-snapshot'

type ReadonlyData<T>=T extends object?{readonly[K in keyof T]:ReadonlyData<T[K]>}:T
export interface ConfiguredRelationRole {readonly side:AssemblyMateEndpointSide;readonly witness:AssemblyConfigurationWitness}
type ScopeData=Pick<AssemblyConfigurationMateInspection,'scopePath'|'scope'|'configuration'|'configurationAncestry'|'scopePose'|'scopeSuppressed'|'suppressed'>
type Base<M extends AssemblyMate>=ScopeData & {readonly kind:'configured-relation';readonly mate:ReadonlyData<M>}
export type ConfiguredBinaryWitness=ConfiguredComponentWitness|ConfiguredGeometryWitness|ConfiguredDirectionWitness|ConfiguredCylinderSurfaceWitness|ConfiguredSphereSurfaceWitness
export type ConfiguredResolvedBinaryMate=Base<AssemblyBinaryMate>&{readonly first:ConfiguredBinaryWitness;readonly second:ConfiguredBinaryWitness;readonly carrier?:ConfiguredComponentWitness;readonly guide?:ConfiguredDirectionWitness}
export type ConfiguredResolvedWidthMate=Base<AssemblyWidthCenteredMate>&{readonly width:readonly[ConfiguredPlaneWitness,ConfiguredPlaneWitness];readonly tab:readonly[ConfiguredPlaneWitness,ConfiguredPlaneWitness]}
type SymmetryWitness=ConfiguredPointWitness|ConfiguredGeometryWitness|ConfiguredCylinderSurfaceWitness|ConfiguredSphereSurfaceWitness
export type ConfiguredResolvedSymmetryMate=Base<AssemblySymmetryMate>&{readonly source:SymmetryWitness;readonly target:SymmetryWitness;readonly mirror:ConfiguredPlaneWitness}
export type ConfiguredResolvedProfileCenterMate=Base<AssemblyProfileCenterMate>&{readonly first:ConfiguredProfileWitness|ConfiguredProfileAxisWitness;readonly second:ConfiguredProfileWitness|ConfiguredProfileAxisWitness}
export type ConfiguredResolvedLinePathMate=Base<AssemblyLinePathMate>&{readonly first:ConfiguredPointWitness;readonly second:ConfiguredLinePathWitness;readonly up?:ConfiguredDirectionWitness}
export type ConfiguredResolvedCircularPathMate=Base<AssemblyCircularPathMate>&{readonly first:ConfiguredPointWitness;readonly second:ConfiguredArcPathWitness;readonly up?:ConfiguredDirectionWitness}
export type ConfiguredResolvedHingeMate=Base<AssemblyHingeMate>&{readonly axis:readonly[ConfiguredGeometryWitness,ConfiguredGeometryWitness];readonly axial:readonly[ConfiguredPlaneWitness,ConfiguredPlaneWitness];readonly angular?:readonly[ConfiguredPlaneWitness,ConfiguredPlaneWitness]}
export type ConfiguredResolvedMate=ConfiguredResolvedBinaryMate|ConfiguredResolvedWidthMate|ConfiguredResolvedSymmetryMate|ConfiguredResolvedProfileCenterMate|ConfiguredResolvedLinePathMate|ConfiguredResolvedCircularPathMate|ConfiguredResolvedHingeMate
export type ConfiguredUnavailableMate=AssemblyConfigurationMateInspection

/** Structural family guards only; call the owning snapshot assertion first. */
export function isConfiguredResolvedBinaryMate(value:ConfiguredResolvedMate):value is ConfiguredResolvedBinaryMate{
 switch(value.mate.type){
  case 'concentric':case 'coincident':case 'distance':case 'limit-distance':case 'limit-angle':case 'limit-directed-angle':case 'angle':case 'parallel':case 'perpendicular':case 'tangent':
  case 'skew-cylinder-tangent':case 'parallel-cylinder-tangent':case 'plane-sphere-tangent':case 'sphere-sphere-tangent':case 'cylinder-sphere-tangent':case 'lock':case 'gear':case 'screw':case 'rack-pinion':return true
  default:return false
 }
}
export function isConfiguredResolvedWidthMate(value:ConfiguredResolvedMate):value is ConfiguredResolvedWidthMate{return value.mate.type==='width'}
export function isConfiguredResolvedSymmetryMate(value:ConfiguredResolvedMate):value is ConfiguredResolvedSymmetryMate{return value.mate.type==='symmetry'}
export function isConfiguredResolvedProfileCenterMate(value:ConfiguredResolvedMate):value is ConfiguredResolvedProfileCenterMate{return value.mate.type==='profile-center'}
export function isConfiguredResolvedLinePathMate(value:ConfiguredResolvedMate):value is ConfiguredResolvedLinePathMate{return value.mate.type==='line-path'}
export function isConfiguredResolvedCircularPathMate(value:ConfiguredResolvedMate):value is ConfiguredResolvedCircularPathMate{return value.mate.type==='circular-path'}
export function isConfiguredResolvedHingeMate(value:ConfiguredResolvedMate):value is ConfiguredResolvedHingeMate{return value.mate.type==='hinge'}

/** Original role incidence, including repeated and null-scope roles. A returned
 * list or observational aggregate confers no private configured authority. */
export function configuredResolvedMateWitnesses(value:ConfiguredResolvedMate):AssemblyConfigurationWitness[]{
 if('axis'in value)return [...value.axis,...value.axial,...(value.angular??[])]
 if('width'in value)return [...value.width,...value.tab]
 if('source'in value)return [value.source,value.target,value.mirror]
 return [value.first,value.second,...('up'in value&&value.up?[value.up]:[]),...('carrier'in value&&value.carrier?[value.carrier]:[]),...('guide'in value&&value.guide?[value.guide]:[])]
}
/** Closed family validation and detached observation only. The snapshot must
 * authenticate every child and privately issue its own aggregate afterwards. */
export function buildConfiguredRelationObservation(inspection:AssemblyConfigurationMateInspection,roles:readonly ConfiguredRelationRole[]):ConfiguredResolvedMate{
 const declarations=assemblyMateEndpoints(validateAssemblyMate(inspection.mate))
 if(roles.length!==declarations.length||roles.some((role,i)=>role.side!==declarations[i].side))throw Error('Configured relation roles must retain their complete declared order.')
 const get=(side:AssemblyMateEndpointSide):AssemblyConfigurationWitness=>{
  const matches=roles.filter(role=>role.side===side)
  if(matches.length!==1)throw Error('Missing or duplicate configured relation role: '+side)
  return matches[0].witness
 }
 const take=<K extends AssemblyConfigurationWitness['kind']>(side:AssemblyMateEndpointSide,kind:K):Extract<AssemblyConfigurationWitness,{kind:K}>=>{
  const witness=get(side);if(witness.kind!==kind)throw Error('Wrong configured native purpose for '+side)
  return witness as Extract<AssemblyConfigurationWitness,{kind:K}>
 }
 const binary=(side:AssemblyMateEndpointSide):ConfiguredBinaryWitness=>{
  const witness=get(side)
  if(witness.kind!=='configured-component'&&witness.kind!=='configured-support'&&witness.kind!=='configured-direction'&&witness.kind!=='configured-cylinder-surface'&&witness.kind!=='configured-sphere-surface')throw Error('Wrong configured binary native purpose.')
  return witness
 }
 const symmetry=(side:'source'|'target'):SymmetryWitness=>{
  const witness=get(side),family=inspection.mate.type==='symmetry'?inspection.mate.entityKind:null
  if(family==='point'&&witness.kind==='configured-point')return witness
  if(family==='sphere'&&witness.kind==='configured-sphere-surface')return witness
  if(family==='cylinder'&&witness.kind==='configured-cylinder-surface')return witness
  if((family==='line'||family==='plane')&&witness.kind==='configured-support'
   &&(family==='plane'?witness.localSupport.kind==='plane':witness.localSupport.kind==='line'||witness.localSupport.kind==='cylinder'))return witness
  throw Error('Wrong native geometry for the configured symmetry family.')
 }
 const meta={kind:'configured-relation' as const,scopePath:inspection.scopePath,scope:inspection.scope,configuration:inspection.configuration,
  configurationAncestry:inspection.configurationAncestry,scopePose:inspection.scopePose,scopeSuppressed:inspection.scopeSuppressed,suppressed:inspection.suppressed}
 const mate=inspection.mate
 switch(mate.type){
  case 'hinge':{
   const axis=[take('axis-0','configured-support'),take('axis-1','configured-support')] as const
   const axial=[take('axial-0','configured-plane'),take('axial-1','configured-plane')] as const
   for(let i=0;i<2;i++){
    if(axis[i].localSupport.kind!=='line'&&axis[i].localSupport.kind!=='cylinder')throw Error('Configured hinge axes require current native LINE or cylinder axes.')
    if(axis[i].topLevelOwner!==axial[i].topLevelOwner)throw Error('Configured hinge axis and axial plane must have the same full-root owner.')
   }
   const angular=mate.stops?[take('angle-0','configured-plane'),take('angle-1','configured-plane')] as const:undefined
   if(angular)for(let i=0;i<2;i++)if(axis[i].topLevelOwner!==angular[i].topLevelOwner)throw Error('Configured hinge angular plane has a foreign full-root owner.')
   return {...meta,mate,axis,axial,...(angular?{angular}:{})}
  }
  case 'width':return {...meta,mate,width:[take('width-0','configured-plane'),take('width-1','configured-plane')],tab:[take('tab-0','configured-plane'),take('tab-1','configured-plane')]}
  case 'symmetry':return {...meta,mate,source:symmetry('source'),target:symmetry('target'),mirror:take('mirror','configured-plane')}
  case 'profile-center':{
   const first=get('first'),second=get('second')
   if(mate.orientation.mode==='free'){
    if(first.kind!=='configured-profile'||second.kind!=='configured-profile'||first.localSupport.kind!=='circle'||second.localSupport.kind!=='circle')throw Error('Configured saved free profile centers require two full circular profiles.')
   }else if(first.kind!=='configured-profile-axis'||second.kind!=='configured-profile-axis')throw Error('Configured rectangular profiles require current material boundary axes.')
   return {...meta,mate,first:first as ConfiguredProfileWitness|ConfiguredProfileAxisWitness,second:second as ConfiguredProfileWitness|ConfiguredProfileAxisWitness}
  }
  case 'line-path':case 'circular-path':{
   const first=take('point','configured-point'),up=mate.orientation.roll==='free'?undefined:take('up','configured-direction')
   if(up&&(up.origin!=='native-face'||up.localSupport.kind!=='plane'))throw Error('Configured UP requires current material planar face direction.')
   return mate.type==='line-path'?{...meta,mate,first,second:take('path','configured-line-path'),...(up?{up}:{})}
    :{...meta,mate,first,second:take('path','configured-arc-path'),...(up?{up}:{})}
  }
  case 'limit-angle':return {...meta,mate,first:take('first','configured-direction'),second:take('second','configured-direction')}
  case 'limit-directed-angle':return {...meta,mate,first:take('first','configured-direction'),second:take('second','configured-direction'),guide:take('guide','configured-direction')}
  case 'gear':return {...meta,mate,first:binary('first'),second:binary('second'),carrier:take('carrier','configured-component')}
  case 'concentric':case 'coincident':case 'distance':case 'limit-distance':case 'angle':case 'parallel':case 'perpendicular':case 'tangent':
  case 'skew-cylinder-tangent':case 'parallel-cylinder-tangent':case 'plane-sphere-tangent':case 'sphere-sphere-tangent':case 'cylinder-sphere-tangent':case 'lock':case 'screw':case 'rack-pinion':
   return {...meta,mate,first:binary('first'),second:binary('second')}
  default:{const unsupported:never=mate;throw Error('Unsupported configured relation '+String(unsupported))}
 }
}
