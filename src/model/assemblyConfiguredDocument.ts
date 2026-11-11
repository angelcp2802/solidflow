import {MAX_ASSEMBLY_BYTES,type AssemblyDocument} from './assemblyDocument'
import {evaluateAssemblyConfiguration,type AssemblyConfigurationCatalog} from './assemblyConfigurationCore'
import type {AssemblyConfigurationGeometryInput} from '../cad/kernel.assembly-configuration-snapshot'
import {validateNamedViews,type NamedView} from './namedViews'
import {jsonStringByteLength} from '../shared/jsonStringByteLength'

export interface AssemblyConfiguredDocument {
  version:3
  kind:'configured-assembly'
  source:AssemblyDocument
  catalog:AssemblyConfigurationCatalog
  rootConfiguration:string|null
  namedViews?:NamedView[]
}
/** Strict bounded JSON preflight shared by the new persisted-document dispatcher.
 * Descriptor inspection precedes every value read; this grants no CAD authority. */
export function validateConfiguredDocumentJsonData(value:unknown):void {
  const stack:{value:unknown;depth:number;exit?:boolean}[]=[{value,depth:0}]
  const ancestors=new Set<object>(),encoder=new TextEncoder()
  let bytes=0,nodes=0
  function add(amount:number){bytes+=amount;if(bytes>MAX_ASSEMBLY_BYTES)throw Error('Configured document exceeds20MiB.')}
  function stringBytes(text:string){if(text.length>MAX_ASSEMBLY_BYTES)throw Error('Configured document exceeds20MiB.');return jsonStringByteLength(text,encoder)}
  while(stack.length){
    const frame=stack.pop()!,current=frame.value
    if(frame.exit){ancestors.delete(current as object);continue}
    if(++nodes>1_000_000 || frame.depth>128)throw Error('Configured JSON complexity exceeds its existing bounds.')
    if(current===null){add(4);continue}
    if(typeof current==='string'){add(stringBytes(current));continue}
    if(typeof current==='boolean'){add(current?4:5);continue}
    if(typeof current==='number' && Number.isFinite(current)){add(JSON.stringify(current).length);continue}
    if(!current || typeof current!=='object')throw Error('Configured document requires finite JSON data.')
    const array=Array.isArray(current),prototype=Object.getPrototypeOf(current)
    if(array?prototype!==Array.prototype:prototype!==Object.prototype && prototype!==null)throw Error('Configured document has an unsupported prototype.')
    if(ancestors.has(current))throw Error('Configured document contains a JSON cycle.')
    ancestors.add(current);stack.push({value:current,depth:frame.depth,exit:true})
    const fields=Object.getOwnPropertyDescriptors(current),keys=Reflect.ownKeys(fields).filter(key=>!array || key!=='length')
    if(array){
      if(current.length>1_000_000 || keys.length!==current.length)throw Error('Configured JSON arrays must be dense and bounded.')
      for(const key of keys)if(typeof key!=='string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key)>=current.length)throw Error('Configured JSON array has an extra field.')
    }
    add(2+Math.max(0,keys.length-1))
    for(let i=keys.length-1;i>=0;i--){
      const key=keys[i]
      if(typeof key!=='string')throw Error('Configured JSON keys must be strings.')
      const field=fields[key]
      if(!field.enumerable || !('value'in field))throw Error('Configured document contains executable or hidden data.')
      if(!array)add(stringBytes(key)+1)
      stack.push({value:field.value,depth:frame.depth+1})
    }
  }
}
function bounded(value:object):string {
  const json=JSON.stringify(value,null,2)
  if(new TextEncoder().encode(json).byteLength>MAX_ASSEMBLY_BYTES)throw Error('Serialized configured document exceeds20MiB.')
  return json
}
/** Syntax, declaration graph and effective placement validation only. Repairable
 * reference diagnostics do not become proof of native geometry or solvability. */
export function validateAssemblyConfiguredDocument(value:unknown):AssemblyConfiguredDocument {
  validateConfiguredDocumentJsonData(value)
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('Configured document must be a record.')
  const fields=Object.getOwnPropertyDescriptors(value),keys=['version','kind','source','catalog','rootConfiguration']
  if(Reflect.ownKeys(fields).some(key=>typeof key!=='string' || !keys.includes(key) && key!=='namedViews') || keys.some(key=>!Object.hasOwn(fields,key)))throw Error('Configured document envelope fields must be exact and complete.')
  if(fields.version.value!==3 || fields.kind.value!=='configured-assembly')throw Error('Unsupported configured document format.')
  const evaluation=evaluateAssemblyConfiguration(fields.source.value,fields.catalog.value,fields.rootConfiguration.value)
  const result:AssemblyConfiguredDocument={version:3,kind:'configured-assembly',source:structuredClone(evaluation.source) as AssemblyDocument,
    catalog:structuredClone(evaluation.catalog) as AssemblyConfigurationCatalog,rootConfiguration:evaluation.rootConfiguration}
  if(Object.hasOwn(fields,'namedViews'))result.namedViews=validateNamedViews(fields.namedViews.value)
  bounded(result)
  return result
}
export function parseAssemblyConfiguredDocument(json:string):AssemblyConfiguredDocument {
  if(typeof json!=='string' || new TextEncoder().encode(json).byteLength>MAX_ASSEMBLY_BYTES)throw Error('Configured input exceeds20MiB.')
  let value:unknown
  try{value=JSON.parse(json)}catch{throw Error('Configured input is not valid JSON.')}
  return validateAssemblyConfiguredDocument(value)
}
export function serializeAssemblyConfiguredDocument(document:AssemblyConfiguredDocument):string {
  return bounded(validateAssemblyConfiguredDocument(document))
}
export function createAssemblyConfiguredDocument(source:AssemblyDocument,catalog:AssemblyConfigurationCatalog=[],rootConfiguration:string|null=null):AssemblyConfiguredDocument {
  return validateAssemblyConfiguredDocument({version:3,kind:'configured-assembly',source,catalog,rootConfiguration})
}
/** New runtime context, detached from persisted declarations. Generation and all
 * native capabilities are deliberately absent from the saved envelope. */
export function assemblyConfiguredGeometryInput(document:AssemblyConfiguredDocument,generation:number):AssemblyConfigurationGeometryInput {
  if(!Number.isSafeInteger(generation) || generation<0)throw Error('Configured runtime generation must be a nonnegative safe integer.')
  const checked=validateAssemblyConfiguredDocument(document)
  return {document:checked.source,catalog:checked.catalog,rootConfiguration:checked.rootConfiguration,generation}
}
