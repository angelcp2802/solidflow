import { assemblyDefinitionKey, validateAssemblyMate, type AssemblyMate } from './assemblyDocument'
import { assemblyMateEndpoints } from './assemblyMateEndpoints'
import { validateAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration } from './assemblyConfigurationCore'
import { validateAssemblyConfiguredMateEdit, type AssemblyConfiguredMateEdit } from './assemblyConfiguredMateEditing'
import { isAssemblyConfigurationMechanicalMate, type AssemblyConfigurationMechanicalMate, type AssemblyConfigurationCapture } from './assemblyConfigurationCapture'
import { captureOwnDataRecord } from './ownDataRecord'

type Mate<T extends AssemblyConfigurationMechanicalMate['type']> = Extract<AssemblyConfigurationMechanicalMate,{type:T}>
/** Authored intent only. A concentric spec explicitly requests the locked route.
 * Gear phase is an authored weighted-radian parameter, not captured winding. */
export type AssemblyConfiguredMechanicalSpec =
  | Omit<Mate<'lock'>,'relativePose'>
  | Omit<Mate<'concentric'>,'rotationLock'>
  | Omit<Mate<'gear'>,'neutralRotations'|'angles'>
  | Omit<Mate<'screw'>,'neutralRotation'|'neutralTravel'|'angle'>
  | Omit<Mate<'rack-pinion'>,'neutralRotation'|'neutralTravel'|'angle'>
/** Complete syntax data for the private producer/existing declaration. Passing
 * these values does not attest that a capture actually happened. */
export type AssemblyConfiguredMechanicalCapture =
  | Exclude<AssemblyConfigurationCapture,{type:'gear'}>
  | Omit<Extract<AssemblyConfigurationCapture,{type:'gear'}>,'phase'>
export type AssemblyConfiguredMechanicalEdit = Pick<AssemblyConfiguredMateEdit,'scopePath'|'definition'|'configuration'> & {
  change: {kind:'add';spec:AssemblyConfiguredMechanicalSpec}
    | {kind:'replace';mateId:string;capture:'retain'|'recapture';spec:AssemblyConfiguredMechanicalSpec}
}
function fail(message:string):never { throw Error('Configured mechanical edit: '+message) }
const baseFields=['id','name','suppressed','type','first','second']
function mechanical(value:unknown):AssemblyConfigurationMechanicalMate {
  const mate=validateAssemblyMate(value)
  if(!isAssemblyConfigurationMechanicalMate(mate))fail('a mechanical family is required.')
  return mate
}
/** Normalize one complete saved declaration before dropping every capture field. */
export function configuredMechanicalMateSpec(input:AssemblyMate):AssemblyConfiguredMechanicalSpec {
  const mate=mechanical(input),base={id:mate.id,name:mate.name,suppressed:mate.suppressed}
  switch(mate.type){
    case 'lock': return {...base,type:mate.type,first:mate.first,second:mate.second}
    case 'concentric': return {...base,type:mate.type,first:mate.first,second:mate.second,alignment:mate.alignment}
    case 'gear': return {...base,type:mate.type,first:mate.first,second:mate.second,carrier:mate.carrier,
      ratio:mate.ratio,direction:mate.direction,phase:mate.phase}
    case 'screw': return {...base,type:mate.type,first:mate.first,second:mate.second,lead:mate.lead,reverse:mate.reverse,alignment:mate.alignment}
    case 'rack-pinion': return {...base,type:mate.type,first:mate.first,second:mate.second,conversion:mate.conversion,reverse:mate.reverse}
  }
}
function parsedSpec(input:unknown):{spec:AssemblyConfiguredMechanicalSpec;placeholder:AssemblyConfigurationMechanicalMate} {
  const preliminary=captureOwnDataRecord(input,[...baseFields,'alignment','carrier','ratio','direction','phase','lead','reverse','conversion'],['type'])
  const type=preliminary.get('type')
  const extras=type==='lock'?[]:type==='concentric'?['alignment']:type==='gear'?['carrier','ratio','direction','phase']
    :type==='screw'?['lead','reverse','alignment']:type==='rack-pinion'?['conversion','reverse']:fail('unsupported mechanical family.')
  const raw=captureOwnDataRecord(input,[...baseFields,...extras])
  const base={id:raw.get('id'),name:raw.get('name'),suppressed:raw.get('suppressed'),first:raw.get('first'),second:raw.get('second')}
  // Private placeholders exist only to reuse the complete strict syntax parser.
  // They never become an authored output, a capture or a native witness.
  let placeholder:AssemblyConfigurationMechanicalMate
  switch(type){
    case 'lock': placeholder=mechanical({...base,type,relativePose:{translation:[0,0,0],rotation:[0,0,0,1]}});break
    case 'concentric': placeholder=mechanical({...base,type,alignment:raw.get('alignment'),rotationLock:[0,0,0,1]});break
    case 'gear': placeholder=mechanical({...base,type,carrier:raw.get('carrier'),ratio:raw.get('ratio'),direction:raw.get('direction'),phase:raw.get('phase'),
      neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:0,second:0}});break
    case 'screw': placeholder=mechanical({...base,type,lead:raw.get('lead'),reverse:raw.get('reverse'),alignment:raw.get('alignment'),
      neutralRotation:[0,0,0,1],neutralTravel:0,angle:0});break
    case 'rack-pinion': placeholder=mechanical({...base,type,conversion:raw.get('conversion'),reverse:raw.get('reverse'),
      neutralRotation:[0,0,0,1],neutralTravel:0,angle:0});break
    default:return fail('unsupported mechanical family.')
  }
  return {spec:configuredMechanicalMateSpec(placeholder),placeholder}
}
export function validateAssemblyConfiguredMechanicalSpec(input:unknown):AssemblyConfiguredMechanicalSpec {
  return parsedSpec(input).spec
}
/** Descriptor-first detached transport data; no caller-supplied captures. */
export function validateAssemblyConfiguredMechanicalEdit(input:unknown):AssemblyConfiguredMechanicalEdit {
  const raw=captureOwnDataRecord(input,['scopePath','definition','configuration','change'])
  const preliminary=captureOwnDataRecord(raw.get('change'),['kind','mateId','capture','spec'],['kind'])
  const kind=preliminary.get('kind')
  if(kind!=='add'&&kind!=='replace')fail('unknown operation.')
  const change=captureOwnDataRecord(raw.get('change'),kind==='add'?['kind','spec']:['kind','mateId','capture','spec'])
  const {spec,placeholder}=parsedSpec(change.get('spec'))
  if(kind==='replace'&&change.get('capture')!=='retain'&&change.get('capture')!=='recapture')fail('explicit capture policy is required.')
  const normalized=validateAssemblyConfiguredMateEdit({scopePath:raw.get('scopePath'),definition:raw.get('definition'),configuration:raw.get('configuration'),
    change:kind==='add'?{kind,mate:placeholder}:{kind,mateId:change.get('mateId'),mate:placeholder}})
  const target={scopePath:normalized.scopePath,definition:normalized.definition,configuration:normalized.configuration}
  if(kind==='add')return {...target,change:{kind,spec}}
  if(normalized.change.kind!=='replace')return fail('invalid normalized replacement.')
  return {...target,change:{kind,mateId:normalized.change.mateId,capture:change.get('capture')==='retain'?'retain':'recapture',spec}}
}
/** Complete-context target checks only. Existing capture data is read from this
 * owned effective declaration, never from a renderer's proposed capture. */
export function inspectAssemblyConfiguredMechanicalEdit(document:AssemblyConfiguredDocument,input:unknown):{
  edit:AssemblyConfiguredMechanicalEdit;existing:AssemblyMate|null
} {
  const edit=validateAssemblyConfiguredMechanicalEdit(input),owned=validateAssemblyConfiguredDocument(document)
  const evaluation=evaluateAssemblyConfiguration(owned.source,owned.catalog,owned.rootConfiguration)
  const scope=evaluation.scopes.find(row=>JSON.stringify(row.path)===JSON.stringify(edit.scopePath))
  if(!scope||assemblyDefinitionKey(scope.definition)!==assemblyDefinitionKey(edit.definition)||scope.configuration!==edit.configuration)fail('scope/state no longer matches the selected context.')
  const id=edit.change.kind==='add'?edit.change.spec.id:edit.change.mateId
  const existing=scope.mates.find(mate=>mate.id===id)
  if(edit.change.kind==='add'){
    if(existing)fail('relation ID already exists in this state.')
    return {edit,existing:null}
  }
  if(!existing)fail('relation is absent from this state.')
  const checked=validateAssemblyMate(existing)
  if(edit.change.capture==='retain'){
    if(!isAssemblyConfigurationMechanicalMate(checked)||checked.type!==edit.change.spec.type)fail('retaining capture requires the same mechanical family.')
    if(checked.type==='concentric'&&checked.rotationLock===null)fail('an unlocked declaration has no rotation lock to retain.')
    const expected=parsedSpec(edit.change.spec).placeholder
    if(JSON.stringify(assemblyMateEndpoints(checked))!==JSON.stringify(assemblyMateEndpoints(expected)))fail('retaining capture requires the exact ordered endpoint roles.')
  }
  return {edit,existing:checked}
}
/** Assemble detached declared data only. The caller must separately establish
 * native capture provenance/currentness and final physical verification. */
export function configuredMechanicalMateDeclaration(input:AssemblyConfiguredMechanicalSpec,capture:unknown):AssemblyConfigurationMechanicalMate {
  const spec=validateAssemblyConfiguredMechanicalSpec(input)
  const keys=spec.type==='lock'?['type','relativePose']:spec.type==='concentric'?['type','rotationLock']
    :spec.type==='gear'?['type','neutralRotations','angles']:['type','neutralRotation','neutralTravel','angle']
  const raw=captureOwnDataRecord(capture,keys)
  if(raw.get('type')!==spec.type)fail('capture family differs from the authored spec.')
  switch(spec.type){
    case 'lock':return mechanical({...spec,relativePose:raw.get('relativePose')})
    case 'concentric':{
      if(raw.get('rotationLock')===null)fail('the locked route requires a declared rotation lock.')
      return mechanical({...spec,rotationLock:raw.get('rotationLock')})
    }
    case 'gear':return mechanical({...spec,neutralRotations:raw.get('neutralRotations'),angles:raw.get('angles')})
    case 'screw':case 'rack-pinion':return mechanical({...spec,neutralRotation:raw.get('neutralRotation'),neutralTravel:raw.get('neutralTravel'),angle:raw.get('angle')})
  }
}
