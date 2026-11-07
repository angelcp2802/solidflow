import {buildConfiguredAssemblyBom,type ConfiguredAssemblyBomOptions} from './assemblyConfiguredBom'
import type {AssemblyConfiguredDocument} from './assemblyConfiguredDocument'

export const MAX_CONFIGURED_ASSEMBLY_BOM_CSV_BYTES=20*1024*1024
function fail(message:string):never {throw Error('CSV de lista configurada: '+message)}
function requireText(value:string):string {
  for(let i=0;i<value.length;i++){
    const code=value.charCodeAt(i)
    if(code===0)fail('el texto no puede contener NUL.')
    if(code>=0xd800 && code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00 && next<=0xdfff))fail('sustituto Unicode aislado.')}
    else if(code>=0xdc00 && code<=0xdfff)fail('sustituto Unicode aislado.')
  }
  return value
}
const quote=(value:string)=>'"'+value.replace(/"/g,'""')+'"'
const text=(value:string)=>quote("'"+requireText(value))
function quantity(value:number|null):string {
  if(value===null)return quote('')
  if(!Number.isSafeInteger(value) || value<=0)fail('la cantidad debe ser un entero positivo seguro.')
  return quote(String(value))
}
/** Inspect generated identity strings before JSON escapes could hide invalid
 * Unicode or NUL. This is not a validator for caller-provided report DTOs. */
function jsonText(value:unknown):string {
  const visit=(item:unknown):void=>{if(typeof item==='string')requireText(item);else if(item && typeof item==='object')for(const child of Object.values(item))visit(child)}
  visit(value);return JSON.stringify(value)
}
/** Rebuild from the complete committed v3 context. No report or display scene
 * can stand in for the input; all returned CSV bytes are declaration data. */
export function serializeConfiguredAssemblyBomCsv(document:AssemblyConfiguredDocument,options?:Partial<ConfiguredAssemblyBomOptions>):string {
  const report=buildConfiguredAssemblyBom(document,options),encoder=new TextEncoder(),lines=['\ufeff']
  let bytes=3
  const append=(fields:string[])=>{
    const line=fields.join(',')+'\r\n';bytes+=encoder.encode(line).byteLength
    if(bytes>MAX_CONFIGURED_ASSEMBLY_BOM_CSV_BYTES)fail('el archivo supera20MiB; no se publica un CSV parcial.')
    lines.push(line)
  }
  append(['Item','Type','Name','Definition ID','Revision','Configuration','Quantity per parent','Total quantity','Occurrence paths','Configuration ancestry','Root configuration','Scope path','Source link name','Source link SHA-256'].map(quote))
  for(const row of report.rows){
    append([text(row.itemNumber),text(row.kind),text(row.name),text(row.definition.id),text(row.definition.revision),text(jsonText(row.configuration)),
      quantity(row.quantityPerParent),quantity(row.quantityTotal),text(jsonText(row.members.map(member=>member.component.occurrencePath))),
      text(jsonText(row.members.map(member=>member.configurationAncestry))),text(jsonText(report.source.rootConfiguration)),text(jsonText(report.scope.path)),
      text(row.sourceLink?.displayName??''),text(row.sourceLink?.contentSha256??'')])
  }
  return lines.join('')
}
export function encodeConfiguredAssemblyBomCsv(document:AssemblyConfiguredDocument,options?:Partial<ConfiguredAssemblyBomOptions>):Uint8Array {
  return new TextEncoder().encode(serializeConfiguredAssemblyBomCsv(document,options))
}
