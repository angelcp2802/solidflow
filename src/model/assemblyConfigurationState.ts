import { createAssemblyConfigurationCaptureValidator, isAssemblyConfigurationMechanicalMate as mechanical, type AssemblyConfigurationCapture, type AssemblyConfigurationMechanicalMate } from './assemblyConfigurationCapture'
import {
  assemblyDefinitionKey, validateAssemblyMate, MAX_ASSEMBLY_BYTES,
  type AssemblyDocument, type AssemblyDefinitionReference,
} from './assemblyDocument'
import { evaluateAssemblyConfiguration, type AssemblyConfigurationCatalog } from './assemblyConfigurationCore'

/** Separate declarative state only; no saved field or native capture authority. */
export const MAX_ASSEMBLY_CONFIGURATION_STATES = 4096
export type { AssemblyConfigurationMechanicalMate } from './assemblyConfigurationCapture'
export type AssemblyConfigurationMateState = AssemblyConfigurationCapture
export interface AssemblyConfigurationStateEntry {
  definition: AssemblyDefinitionReference
  configuration: string|null
  mateId: string
  state: AssemblyConfigurationMateState
}
export type AssemblyConfigurationStateCatalog = AssemblyConfigurationStateEntry[]
type DeepReadonly<T> = T extends object ? {readonly [K in keyof T]:DeepReadonly<T[K]>}:T

function fail(message:string):never { throw Error('Estado de configuración: '+message) }
function record(value:unknown,keys:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('se requiere un registro de datos.')
  const fields=Object.getOwnPropertyDescriptors(value),result:Record<string,unknown>=Object.create(null)
  if(Reflect.ownKeys(fields).length!==keys.length)fail('campos incompletos o desconocidos.')
  for(const key of Reflect.ownKeys(fields)){
    if(typeof key!=='string'||!keys.includes(key)||!fields[key].enumerable||!('value'in fields[key])||fields[key].value===undefined)fail('campo desconocido o ejecutable.')
    result[key]=fields[key].value
  }
  return result
}
function identifier(value:unknown):string {
  if(typeof value!=='string'||!value.trim()||value.length>128||/[\x00-\x1f\x7f]/.test(value))fail('identificador no válido.')
  return value
}
function selector(value:unknown):string|null {return value===null?null:identifier(value)}
function definition(value:unknown):AssemblyDefinitionReference {
  const item=record(value,['id','revision']);return {id:identifier(item.id),revision:identifier(item.revision)}
}
function entries(value:unknown):unknown[] {
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>MAX_ASSEMBLY_CONFIGURATION_STATES
    ||Reflect.ownKeys(value).length!==value.length+1)fail('lista no densa o fuera de presupuesto.')
  const result:unknown[]=[]
  for(let i=0;i<value.length;i++){
    const field=Object.getOwnPropertyDescriptor(value,String(i))
    if(!field?.enumerable||!('value'in field)||field.value===undefined)fail('lista incompleta o ejecutable.')
    result.push(field.value)
  }
  return result
}
function frozen<T>(value:T,seen=new WeakSet<object>()):DeepReadonly<T> {
  if(value&&typeof value==='object'&&!seen.has(value)){
    seen.add(value);for(const child of Object.values(value))frozen(child,seen);Object.freeze(value)
  }
  return value as DeepReadonly<T>
}
function stateKey(entry:Pick<AssemblyConfigurationStateEntry,'definition'|'configuration'|'mateId'>):string {
  return JSON.stringify([entry.definition.id,entry.definition.revision,entry.configuration,entry.mateId])
}
function context(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog) {
  // The core validates all source nodes and dormant variants, not merely the
  // active root expansion. Its owned source remains the unmodified base graph.
  const evaluation=evaluateAssemblyConfiguration(document,catalog)
  const nodes=new Map([evaluation.source,...evaluation.source.definitions].map(node=>[assemblyDefinitionKey(node),node]))
  const cache=new Map<string,{mate:AssemblyConfigurationMechanicalMate;validator:ReturnType<typeof createAssemblyConfigurationCaptureValidator>}>()
  function find(owner:AssemblyDefinitionReference,configuration:string|null,mateId:string) {
    const node=nodes.get(assemblyDefinitionKey(owner))
    if(!node||node.kind!=='assembly')fail('propietario ausente, antiguo o no ensamblaje.')
    const variants=evaluation.catalog.find(row=>assemblyDefinitionKey(row.definition)===assemblyDefinitionKey(owner))
    if(configuration!==null&&!variants?.configurations.some(row=>row.id===configuration))fail('configuración inexistente.')
    // Validate selector existence before every cache hit. The cache is local to
    // this fully validated invocation and never identifies caller-owned input.
    const key=JSON.stringify([owner.id,owner.revision,mateId]),previous=cache.get(key)
    if(previous)return previous
    const source=node.mates.find(mate=>mate.id===mateId)
    if(!source)fail('relación mecánica ausente.')
    type Mutable<T> = T extends object ? {-readonly [K in keyof T]:Mutable<T[K]>}:T
    const mate=structuredClone(source) as Mutable<typeof source>
    if(!mechanical(mate))fail('familia mecánica no admitida.')
    const value={mate,validator:createAssemblyConfigurationCaptureValidator(mate)}
    cache.set(key,value)
    return value
  }
  return {evaluation,find}
}
function parsedEntry(value:unknown,find:ReturnType<typeof context>['find']):AssemblyConfigurationStateEntry {
  const raw=record(value,['definition','configuration','mateId','state'])
  const owner=definition(raw.definition),configuration=selector(raw.configuration),mateId=identifier(raw.mateId)
  const found=find(owner,configuration,mateId)
  return {definition:owner,configuration,mateId,state:found.validator.validateCapture(raw.state)}
}
function validateOwned(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,input:unknown) {
  const rawEntries=entries(input),current=context(document,catalog),seen=new Set<string>()
  const states=rawEntries.map(raw=>{
    const entry=parsedEntry(raw,current.find),key=stateKey(entry)
    if(seen.has(key))fail('estado duplicado para la misma relación y configuración.')
    seen.add(key);return entry
  })
  if(new TextEncoder().encode(JSON.stringify({source:current.evaluation.source,catalog:current.evaluation.catalog,states},null,2)).byteLength>MAX_ASSEMBLY_BYTES)fail('el origen, catálogo y estado superan 20 MiB.')
  return {...current,states}
}
/** Validate every state, including unused/suppressed/dormant entries. Absence
 * inherits existing source data; it never means that a variant was recaptured.
 * References changed under an unchanged tuple require external repair/capture
 * policy: this declarative catalog cannot certify historical capture validity. */
export function validateAssemblyConfigurationState(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,input:unknown):DeepReadonly<AssemblyConfigurationStateCatalog> {
  return frozen(validateOwned(document,catalog,input).states)
}
/** Complete effective mechanical declaration, with selected suppression and only
 * the exact state's capture/winding override. No base or other variant changes. */
export function effectiveAssemblyConfigurationMate(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,input:unknown,
  ownerInput:AssemblyDefinitionReference,configurationInput:string|null,mateIdInput:string):DeepReadonly<AssemblyConfigurationMechanicalMate> {
  const current=validateOwned(document,catalog,input),owner=definition(ownerInput),configuration=selector(configurationInput),mateId=identifier(mateIdInput)
  const found=current.find(owner,configuration,mateId),mate=found.mate,entry=current.states.find(row=>stateKey(row)===stateKey({definition:owner,configuration,mateId}))
  const variant=current.evaluation.catalog.find(row=>assemblyDefinitionKey(row.definition)===assemblyDefinitionKey(owner))?.configurations.find(row=>row.id===configuration)
  const overlay=entry?.state ?? variant?.mates.find(row=>row.mateId===mateId)?.capture
  const captured=overlay===undefined?mate:found.validator.apply(overlay)
  const checked=validateAssemblyMate({...captured,suppressed:variant?.mates.find(row=>row.mateId===mateId)?.suppressed??mate.suppressed})
  if(!mechanical(checked))fail('familia mecánica no admitida.')
  return frozen(checked)
}
/** Insert or replace one complete state record. The entire resulting envelope
 * is revalidated atomically; input ownership and all other state values remain. */
export function updateAssemblyConfigurationState(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,input:unknown,entryInput:unknown):DeepReadonly<AssemblyConfigurationStateCatalog> {
  const current=validateOwned(document,catalog,input),entry=parsedEntry(entryInput,current.find),key=stateKey(entry)
  const result=current.states.filter(row=>stateKey(row)!==key)
  const previous=current.states.findIndex(row=>stateKey(row)===key)
  if(previous<0)result.push(entry);else result.splice(previous,0,entry)
  return validateAssemblyConfigurationState(document,catalog,result)
}


/** Materialize only explicitly named state records into the standalone core
 * catalog. Base-state capture belongs to the source and requires a different
 * authored transaction. This bridge makes no native recapture claim. */
export function materializeAssemblyConfigurationNamedState(document:AssemblyDocument,catalog:AssemblyConfigurationCatalog,input:unknown):DeepReadonly<AssemblyConfigurationCatalog> {
  const current=validateOwned(document,catalog,input)
  if(current.states.some(entry=>entry.configuration===null))fail('los estados base no se materializan en variantes nombradas.')
  type Mutable<T> = T extends object ? {-readonly [K in keyof T]:Mutable<T[K]>}:T
  const result=structuredClone(current.evaluation.catalog) as Mutable<typeof current.evaluation.catalog>
  for(const entry of current.states){
    const owner=result.find(row=>assemblyDefinitionKey(row.definition)===assemblyDefinitionKey(entry.definition))!
    const variant=owner.configurations.find(row=>row.id===entry.configuration)!
    const existing=variant.mates.find(row=>row.mateId===entry.mateId)
    const found=current.find(entry.definition,entry.configuration,entry.mateId)
    const capture=found.validator.validateCapture(entry.state)
    if(existing)existing.capture=capture
    else variant.mates.push({mateId:entry.mateId,suppressed:found.mate.suppressed,capture})
  }
  // Revalidate all dormant state and the output envelope before returning any
  // candidate. The input catalog and source have never been modified.
  const checked=evaluateAssemblyConfiguration(document,result)
  return frozen(structuredClone(checked.catalog))
}
