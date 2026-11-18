import { assemblyDefinitionKey, validateAssemblyMate, MAX_ASSEMBLY_DEPTH,
  type AssemblyDefinitionReference, type AssemblyMate } from './assemblyDocument'
import { validateAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration, type AssemblyConfigurationDefinition } from './assemblyConfigurationCore'
import { applyAssemblyConfigurationCapture } from './assemblyConfigurationCapture'
import { captureOwnDataRecord } from './ownDataRecord'

export type AssemblyConfiguredMateEdit = {
  scopePath: string[]
  definition: AssemblyDefinitionReference
  configuration: string|null
  change:
    | {kind:'add';mate:AssemblyMate}
    | {kind:'replace';mateId:string;mate:AssemblyMate}
    | {kind:'remove';mateId:string}
    | {kind:'suppression';mateId:string;suppressed:boolean}
}
function fail(message:string):never { throw Error('Configured relation edit: '+message) }
function text(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||value.length>128||/[\x00-\x1f\x7f]/.test(value))fail('invalid identifier.')
  return value
}
/** Strict detached intent only. No reference, capture, solve or Apply authority. */
export function validateAssemblyConfiguredMateEdit(input:unknown):AssemblyConfiguredMateEdit {
  const raw=captureOwnDataRecord(input,['scopePath','definition','configuration','change'])
  const path=raw.get('scopePath')
  if(!Array.isArray(path)||Object.getPrototypeOf(path)!==Array.prototype||path.length>MAX_ASSEMBLY_DEPTH
    ||Reflect.ownKeys(path).length!==path.length+1)fail('invalid scope path.')
  const scopePath:string[]=[]
  for(let i=0;i<path.length;i++){
    const field=Object.getOwnPropertyDescriptor(path,String(i))
    if(!field?.enumerable||!('value'in field))fail('executable or sparse scope path.')
    scopePath.push(text(field.value))
  }
  const owner=captureOwnDataRecord(raw.get('definition'),['id','revision'])
  const definition={id:text(owner.get('id')),revision:text(owner.get('revision'))}
  const configuration=raw.get('configuration')===null?null:text(raw.get('configuration'))
  // Read the discriminant only after inspecting its own data descriptor.
  const preliminary=captureOwnDataRecord(raw.get('change'),['kind','mate','mateId','suppressed'],['kind'])
  const kind=preliminary.get('kind')
  const keys=kind==='add'?['kind','mate']:kind==='replace'?['kind','mateId','mate']
    :kind==='remove'?['kind','mateId']:kind==='suppression'?['kind','mateId','suppressed']:fail('unknown operation.')
  const change=captureOwnDataRecord(raw.get('change'),keys)
  if(kind==='add')return {scopePath,definition,configuration,change:{kind,mate:validateAssemblyMate(change.get('mate'))}}
  const mateId=text(change.get('mateId'))
  if(kind==='replace'){
    const mate=validateAssemblyMate(change.get('mate'))
    if(mate.id!==mateId)fail('replacement must preserve the relation ID.')
    return {scopePath,definition,configuration,change:{kind,mateId,mate}}
  }
  if(kind==='suppression'){
    const suppressed=change.get('suppressed')
    if(typeof suppressed!=='boolean')fail('suppression must be boolean.')
    return {scopePath,definition,configuration,change:{kind,mateId,suppressed}}
  }
  return {scopePath,definition,configuration,change:{kind:'remove',mateId}}
}
function effectiveMates(base:AssemblyMate[],variant:AssemblyConfigurationDefinition):AssemblyMate[] {
  return (variant.mateDeclarations??base).map(mate=>{
    const override=variant.mates.find(row=>row.mateId===mate.id)
    return validateAssemblyMate({... (override?.capture?applyAssemblyConfigurationCapture(mate,override.capture):mate),
      suppressed:override?.suppressed??mate.suppressed})
  })
}
/** Atomic whole-context declaration edit. Shared occurrences selecting the same
 * intrinsic state observe the same edit. Mechanical data is authored, not a
 * native recapture; the worker must independently gate any publication. */
export function applyAssemblyConfiguredMateEdit(document:AssemblyConfiguredDocument,input:AssemblyConfiguredMateEdit):AssemblyConfiguredDocument {
  const edit=validateAssemblyConfiguredMateEdit(input),next=validateAssemblyConfiguredDocument(document)
  const evaluation=evaluateAssemblyConfiguration(next.source,next.catalog,next.rootConfiguration)
  const scope=evaluation.scopes.find(row=>JSON.stringify(row.path)===JSON.stringify(edit.scopePath))
  if(!scope||assemblyDefinitionKey(scope.definition)!==assemblyDefinitionKey(edit.definition)||scope.configuration!==edit.configuration)fail('scope/state no longer matches the selected context.')
  const node=[next.source,...next.source.definitions].find(row=>assemblyDefinitionKey(row)===assemblyDefinitionKey(edit.definition))
  if(!node||node.kind!=='assembly')fail('owner is not a current assembly.')
  const mates=scope.mates.map(mate=>validateAssemblyMate(mate)),change=edit.change
  if(change.kind==='add'){
    if(mates.some(mate=>mate.id===change.mate.id))fail('relation ID already exists in this state.')
    mates.push(change.mate)
  }else{
    const index=mates.findIndex(mate=>mate.id===change.mateId)
    if(index<0)fail('relation is absent from this state.')
    if(change.kind==='remove')mates.splice(index,1)
    else if(change.kind==='replace')mates[index]=change.mate
    else mates[index]={...mates[index],suppressed:change.suppressed}
  }
  if(JSON.stringify(mates)===JSON.stringify(scope.mates))return next
  const variants=next.catalog.find(owner=>assemblyDefinitionKey(owner.definition)===assemblyDefinitionKey(edit.definition))?.configurations??[]
  if(edit.configuration===null){
    // Isolate inherited named declarations, including dormant states, BEFORE
    // changing Base. Existing explicit lists and their overlays stay exact.
    for(const variant of variants)if(variant.mateDeclarations===undefined){
      variant.mateDeclarations=effectiveMates(node.mates,variant);variant.mates=[]
    }
    node.mates=mates
    const time=Math.max(Date.now(),Date.parse(next.source.updatedAt)+1)
    if(!Number.isFinite(time))fail('invalid editing timestamp.')
    next.source.updatedAt=new Date(time).toISOString()
  }else{
    const variant=variants.find(row=>row.id===edit.configuration)
    if(!variant)fail('named state is absent.')
    variant.mateDeclarations=mates;variant.mates=[]
  }
  return validateAssemblyConfiguredDocument(next)
}
