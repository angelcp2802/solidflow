import { assemblyDefinitionKey, MAX_ASSEMBLY_DEPTH, validateCadDocument, type AssemblyDefinition,
  type AssemblyDefinitionReference, type AssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { evaluateAssemblyConfiguration, type AssemblyConfigurationCatalog } from './assemblyConfigurationCore'
import { validateAssemblyConfiguredDocument, validateConfiguredDocumentJsonData, type AssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { applyAssemblyEdit } from './assemblyEditing'
import { captureOwnDataRecord } from './ownDataRecord'
import { validateRigidPose, type RigidPose } from './rigidPose'
import type { Document } from './document'

type Placement = { name:string; pose:RigidPose; fixed:boolean }
export type AssemblyConfiguredOccurrenceEdit = {
  scopePath:string[]
  definition:AssemblyDefinitionReference
  configuration:string|null
  change:
    | {kind:'set-fixed';occurrenceId:string;fixed:boolean}
    | (Placement & {kind:'reuse';definition:AssemblyDefinitionReference;configuration:string|null})
    | (Placement & {kind:'insert';source:Document|AssemblyDocument|AssemblyConfiguredDocument;partRevision:string|null})
}
function fail(message:string):never { throw Error('Componente configurado: '+message) }
function text(value:unknown,maximum=128):string {
  if(typeof value!=='string'||!value.trim()||value.length>maximum||/[\x00-\x1f\x7f]/.test(value))fail('texto o identidad no válidos.')
  return value
}
function boolean(value:unknown):boolean { if(typeof value!=='boolean')fail('se esperaba un booleano.');return value }
function reference(value:unknown):AssemblyDefinitionReference {
  const fields=captureOwnDataRecord(value,['id','revision'])
  return {id:text(fields.get('id')),revision:text(fields.get('revision'))}
}
/** Strict detached intent. No native capture, geometry or publication authority. */
export function validateAssemblyConfiguredOccurrenceEdit(input:unknown):AssemblyConfiguredOccurrenceEdit {
  validateConfiguredDocumentJsonData(input)
  const raw=captureOwnDataRecord(input,['scopePath','definition','configuration','change'])
  const path=raw.get('scopePath')
  if(!Array.isArray(path)||path.length>MAX_ASSEMBLY_DEPTH)fail('ruta de ámbito no válida.')
  const scopePath=path.map(value=>text(value)),definition=reference(raw.get('definition'))
  const configuration=raw.get('configuration')===null?null:text(raw.get('configuration'))
  const preliminary=captureOwnDataRecord(raw.get('change'),['kind','occurrenceId','fixed','definition','configuration','name','pose','source','partRevision'],['kind'])
  const kind=preliminary.get('kind')
  const keys=kind==='set-fixed'?['kind','occurrenceId','fixed']:kind==='reuse'?['kind','definition','configuration','name','pose','fixed']
    :kind==='insert'?['kind','source','partRevision','name','pose','fixed']:fail('operación desconocida.')
  const change=captureOwnDataRecord(raw.get('change'),keys)
  const fixed=boolean(change.get('fixed'))
  if(kind==='set-fixed')return {scopePath,definition,configuration,change:{kind,occurrenceId:text(change.get('occurrenceId')),fixed}}
  const placement={name:text(change.get('name'),200),pose:validateRigidPose(change.get('pose')),fixed}
  if(kind==='reuse')return {scopePath,definition,configuration,change:{kind,...placement,definition:reference(change.get('definition')),
    configuration:change.get('configuration')===null?null:text(change.get('configuration'))}}
  const supplied=change.get('source')
  const version=supplied&&typeof supplied==='object'&&!Array.isArray(supplied)?Object.getOwnPropertyDescriptor(supplied,'version')?.value:undefined
  const source=version===3?validateAssemblyConfiguredDocument(supplied):validateCadDocument(supplied)
  const partRevision=source.version===1?text(change.get('partRevision')):null
  if(source.version!==1&&change.get('partRevision')!==null)fail('una fuente de ensamblaje conserva su revisión; partRevision debe ser null.')
  return {scopePath,definition,configuration,change:{kind:'insert',...placement,source,partRevision}}
}
function sameData(a:unknown,b:unknown):boolean {
  if(a===b)return true
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
  if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>sameData(value,b[i]))
  if(Array.isArray(b))return false
  const first=a as Record<string,unknown>,second=b as Record<string,unknown>,keys=Object.keys(first)
  return keys.length===Object.keys(second).length&&keys.every(key=>Object.hasOwn(second,key)&&sameData(first[key],second[key]))
}
const key=assemblyDefinitionKey
function node(document:AssemblyConfiguredDocument,definition:AssemblyDefinitionReference):AssemblyDocument|EmbeddedAssemblyDefinition {
  const owner=[document.source,...document.source.definitions].find(row=>key(row)===key(definition))
  if(!owner||owner.kind!=='assembly')fail('el ámbito ya no identifica un ensamblaje.')
  return owner
}
function merge(document:AssemblyConfiguredDocument,definitions:AssemblyDefinition[],catalog:AssemblyConfigurationCatalog) {
  const registered=new Map([document.source,...document.source.definitions].map(value=>[key(value),value]))
  const kinds=new Map([document.source,...document.source.definitions].map(value=>[value.id,value.kind]))
  for(const definition of definitions) {
    const identity=key(definition)
    if(identity===key(document.source))fail('una fuente no puede aportar la raíz del destino.')
    if(kinds.has(definition.id)&&kinds.get(definition.id)!==definition.kind)fail('identidad compartida por pieza y ensamblaje.')
    const existing=registered.get(identity)
    if(existing&&!sameData(existing,definition))fail('la revisión de definición ya existe con contenido distinto.')
    if(!existing){document.source.definitions.push(structuredClone(definition));registered.set(identity,definition);kinds.set(definition.id,definition.kind)}
  }
  for(const imported of catalog) {
    const owner=document.catalog.find(row=>key(row.definition)===key(imported.definition))
    if(!owner){document.catalog.push(structuredClone(imported));continue}
    for(const variant of imported.configurations) {
      const existing=owner.configurations.find(row=>row.id===variant.id)
      if(existing&&!sameData(existing,variant))fail('la configuración de esa revisión ya existe con contenido distinto.')
      if(!existing)owner.configurations.push(structuredClone(variant))
    }
  }
}
/** Complete v3 proposal. Base edits are inherited; named edits affect every use
 * selecting that intrinsic state. A named insertion is suppressed in Base.
 * Allocate once per proposal; retain this result through native preview/Apply. */
export function applyAssemblyConfiguredOccurrenceEdit(document:AssemblyConfiguredDocument,input:AssemblyConfiguredOccurrenceEdit):AssemblyConfiguredDocument {
  const edit=validateAssemblyConfiguredOccurrenceEdit(input),next=validateAssemblyConfiguredDocument(document)
  const evaluation=evaluateAssemblyConfiguration(next.source,next.catalog,next.rootConfiguration)
  const scope=evaluation.scopes.find(row=>JSON.stringify(row.path)===JSON.stringify(edit.scopePath))
  if(!scope||key(scope.definition)!==key(edit.definition)||scope.configuration!==edit.configuration)fail('el ámbito o estado seleccionado ha cambiado.')
  if(scope.suppressed)fail('el ámbito seleccionado está suprimido.')
  const owner=node(next,edit.definition),change=edit.change
  const variant=edit.configuration===null?null:next.catalog.find(row=>key(row.definition)===key(edit.definition))?.configurations.find(row=>row.id===edit.configuration)
  if(edit.configuration!==null&&!variant)fail('la configuración seleccionada ya no existe.')
  if(change.kind==='set-fixed') {
    if(!scope.occurrences.some(row=>row.id===change.occurrenceId))fail('la ocurrencia no pertenece al ámbito seleccionado.')
    if(variant){
      let override=variant.occurrences.find(row=>row.occurrenceId===change.occurrenceId)
      if(!override){override={occurrenceId:change.occurrenceId};variant.occurrences.push(override)}
      override.fixed=change.fixed
    } else next.source=applyAssemblyEdit(next.source,{type:'set-occurrence-fixed',scope:edit.definition,occurrenceId:change.occurrenceId,fixed:change.fixed})
    return validateAssemblyConfiguredDocument(next)
  }
  let definition:AssemblyDefinitionReference,configuration:string|null
  if(change.kind==='reuse'){definition=change.definition;configuration=change.configuration}
  else if(change.source.version===1){
    definition={id:change.source.id,revision:change.partRevision!};configuration=null
    merge(next,[{kind:'part',...definition,document:change.source}],[])
  } else {
    const source=change.source.version===3?change.source.source:change.source
    configuration=change.source.version===3?change.source.rootConfiguration:null
    definition={id:source.id,revision:source.revision}
    const embedded:EmbeddedAssemblyDefinition={kind:'assembly',...definition,name:source.name,createdAt:source.createdAt,
      updatedAt:source.updatedAt,occurrences:source.occurrences,mates:source.mates}
    merge(next,[embedded,...source.definitions],change.source.version===3?change.source.catalog:[])
  }
  const child=[next.source,...next.source.definitions].find(row=>key(row)===key(definition))
  if(!child)fail('la definición reutilizada no existe.')
  if(configuration!==null){
    if(child.kind!=='assembly'||!next.catalog.find(row=>key(row.definition)===key(definition))?.configurations.some(row=>row.id===configuration))fail('la configuración hija no existe.')
    if(edit.configuration===null)fail('Selecciona o crea una configuración nombrada del padre para conservar la configuración hija importada.')
  }
  const beforeIds=new Set(owner.occurrences.map(row=>row.id))
  next.source=applyAssemblyEdit(next.source,{type:'insert-occurrence',scope:edit.definition,occurrence:{name:change.name,definition,
    pose:change.pose,fixed:change.fixed,suppressed:edit.configuration!==null,visible:true}})
  const inserted=node(next,edit.definition).occurrences.filter(row=>!beforeIds.has(row.id))
  if(inserted.length!==1)fail('la propuesta debe crear una única identidad de ocurrencia.')
  if(variant)variant.occurrences.push({occurrenceId:inserted[0].id,suppressed:false,...(child.kind==='assembly'?{configuration}:{})})
  return validateAssemblyConfiguredDocument(next)
}
