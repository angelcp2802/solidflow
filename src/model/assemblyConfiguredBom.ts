import {MAX_ASSEMBLY_OCCURRENCES,assemblyDefinitionKey,assemblyOccurrencePathKey,type AssemblyComponentReference,type AssemblyDefinition,type AssemblyDefinitionReference} from './assemblyDocument'
import {evaluateAssemblyConfiguration,type AssemblyConfigurationAncestry,type AssemblyConfigurationDiagnostic} from './assemblyConfigurationCore'
import {validateAssemblyConfiguredDocument,type AssemblyConfiguredDocument} from './assemblyConfiguredDocument'
import {captureOwnDataRecord} from './ownDataRecord'
import type {AssemblySourceLink} from './assemblySourceLink'

export interface ConfiguredAssemblyBomOptions {mode:'parts-only'|'top-level'|'indented';includeHidden:boolean;scopePath?:string[]}
export interface ConfiguredAssemblyBomMember {
  component:AssemblyComponentReference
  name:string
  pathNames:string[]
  configuration:string|null
  configurationAncestry:AssemblyConfigurationAncestry[]
}
export interface ConfiguredAssemblyBomRow {
  key:string;parentKey:string|null;depth:number;itemNumber:string
  kind:'part'|'assembly';definition:AssemblyDefinitionReference;name:string
  configuration:string|null;configurationName:string|null
  /** Historical accepted-byte metadata, never a file permission or cache proof. */
  sourceLink:AssemblySourceLink|null
  quantityPerParent:number|null;quantityTotal:number;members:ConfiguredAssemblyBomMember[]
}
export interface ConfiguredAssemblyBomReport {
  kind:'configured-assembly-bom'
  source:{id:string;revision:string;name:string;rootConfiguration:string|null}
  scope:{path:string[];definition:AssemblyDefinitionReference;configuration:string|null;configurationName:string|null;name:string;configurationAncestry:AssemblyConfigurationAncestry[];suppressed:boolean;visible:boolean}
  context:{sourceSignature:string;catalogSignature:string;rootConfiguration:string|null}
  options:Required<ConfiguredAssemblyBomOptions>
  rows:ConfiguredAssemblyBomRow[]
  referenceDiagnostics:AssemblyConfigurationDiagnostic[]
  declarationOnly:true
}
export const MAX_CONFIGURED_ASSEMBLY_BOM_ROWS=MAX_ASSEMBLY_OCCURRENCES
export const MAX_CONFIGURED_ASSEMBLY_BOM_MEMBERS=MAX_ASSEMBLY_OCCURRENCES
function fail(message:string):never {throw Error('Lista configurada de materiales: '+message)}
export function validateConfiguredAssemblyBomOptions(input?:Partial<ConfiguredAssemblyBomOptions>):Required<ConfiguredAssemblyBomOptions> {
  const fields=input===undefined?new Map<string,unknown>():captureOwnDataRecord(input,['mode','includeHidden','scopePath'],[],'Lista configurada de materiales')
  const mode=fields.has('mode')?fields.get('mode'):'parts-only',includeHidden=fields.has('includeHidden')?fields.get('includeHidden'):true
  if(mode!=='parts-only' && mode!=='top-level' && mode!=='indented')fail('modo no válido.')
  if(typeof includeHidden!=='boolean')fail('includeHidden debe ser booleano.')
  const scopePath=fields.has('scopePath')?JSON.parse(assemblyOccurrencePathKey(fields.get('scopePath') as readonly string[])) as string[]:[]
  return {mode,includeHidden,scopePath}
}
type EffectiveScope=ReturnType<typeof evaluateAssemblyConfiguration>['scopes'][number]
type State=[string,string,string|null]
const state=(scope:Pick<EffectiveScope,'definition'|'configuration'>):State=>[scope.definition.id,scope.definition.revision,scope.configuration]
const prefix=(a:readonly string[],b:readonly string[])=>a.length<=b.length && a.every((id,i)=>id===b[i])
/** Counts effective occurrence declarations, never solids, mass or native proof.
 * The selected scope changes traversal only: member paths/ancestry remain ROOT
 * relative. Equal part tuples group globally; assembly variants never alias. */
export function buildConfiguredAssemblyBom(input:AssemblyConfiguredDocument,supplied?:Partial<ConfiguredAssemblyBomOptions>):ConfiguredAssemblyBomReport {
  const options=validateConfiguredAssemblyBomOptions(supplied),document=validateAssemblyConfiguredDocument(input)
  const evaluation=evaluateAssemblyConfiguration(document.source,document.catalog,document.rootConfiguration)
  const scopes=new Map(evaluation.scopes.map(scope=>[JSON.stringify(scope.path),scope]))
  const definitions=new Map<string,AssemblyDefinition>([document.source,...document.source.definitions].map(def=>[assemblyDefinitionKey(def),def]))
  const selected=scopes.get(JSON.stringify(options.scopePath))
  if(!selected)fail('el ámbito debe identificar un ensamblaje existente, no una pieza.')
  function configurationName(definition:AssemblyDefinitionReference,configuration:string|null):string|null {
    return configuration===null?null:document.catalog.find(owner=>assemblyDefinitionKey(owner.definition)===assemblyDefinitionKey(definition))!.configurations.find(v=>v.id===configuration)!.name
  }
  function ancestry(path:readonly string[]):AssemblyConfigurationAncestry[] {
    return evaluation.scopes.filter(scope=>prefix(scope.path,path)).map(scope=>({path:[...scope.path],definition:{...scope.definition},configuration:scope.configuration}))
  }
  function names(path:readonly string[]):string[] {
    return path.map((id,i)=>scopes.get(JSON.stringify(path.slice(0,i)))!.occurrences.find(o=>o.id===id)!.name)
  }
  const rows:ConfiguredAssemblyBomRow[]=[],grouped=new Map<string,ConfiguredAssemblyBomRow>(),numbers=new Map<string|null,number>(),counts=new Map<string,Map<string,number>>()
  let traversed=0,members=0
  const eligible=(scope:EffectiveScope,o:EffectiveScope['occurrences'][number])=>!scope.suppressed && !o.suppressed && (options.includeHidden || scope.visible && o.visible)
  function childState(scope:EffectiveScope,id:string):State {
    const occurrence=scope.occurrences.find(o=>o.id===id)!,child=scopes.get(JSON.stringify([...scope.path,id]))
    return [occurrence.definition.id,occurrence.definition.revision,child?.configuration??null]
  }
  function quantity(scope:EffectiveScope,identity:State):number {
    const key=JSON.stringify(state(scope));let local=counts.get(key)
    if(!local){local=new Map();for(const o of scope.occurrences)if(eligible(scope,o)){const child=JSON.stringify(childState(scope,o.id));local.set(child,(local.get(child)??0)+1)}counts.set(key,local)}
    return local.get(JSON.stringify(identity))??0
  }
  function walk(scope:EffectiveScope,context:State[],parent?:ConfiguredAssemblyBomRow,depth=0):void {
    if(scope.suppressed || !options.includeHidden && !scope.visible)return
    for(const occurrence of scope.occurrences){
      if(++traversed>MAX_ASSEMBLY_OCCURRENCES)fail('se supera el presupuesto de ocurrencias; no se publica una lista parcial.')
      if(!eligible(scope,occurrence))continue
      const definition=definitions.get(assemblyDefinitionKey(occurrence.definition))!,path=[...scope.path,occurrence.id]
      const child=scopes.get(JSON.stringify(path)),identity=childState(scope,occurrence.id)
      let row:ConfiguredAssemblyBomRow|undefined
      if(options.mode!=='parts-only' || definition.kind==='part'){
        const key=JSON.stringify([options.mode,options.mode==='parts-only'?[]:context,identity])
        row=grouped.get(key)
        if(!row){
          if(rows.length>=MAX_CONFIGURED_ASSEMBLY_BOM_ROWS)fail('se supera el presupuesto de filas.')
          const parentKey=options.mode==='indented'?parent?.key??null:null,ordinal=(numbers.get(parentKey)??0)+1;numbers.set(parentKey,ordinal)
          row={key,parentKey,depth:options.mode==='indented'?depth:0,itemNumber:parentKey===null?String(ordinal):parent!.itemNumber+'.'+ordinal,
            kind:definition.kind,definition:{id:definition.id,revision:definition.revision},name:definition.kind==='part'?definition.document.name:definition.name,
            configuration:identity[2],configurationName:configurationName(definition,identity[2]),sourceLink:'sourceLink'in definition?structuredClone(definition.sourceLink!):null,
            quantityPerParent:options.mode==='parts-only'?null:quantity(scope,identity),quantityTotal:0,members:[]}
          grouped.set(key,row);rows.push(row)
        }
        if(members>=MAX_CONFIGURED_ASSEMBLY_BOM_MEMBERS)fail('se supera el presupuesto de miembros.')
        row.members.push({component:{occurrencePath:path,definition:{id:definition.id,revision:definition.revision}},name:occurrence.name,pathNames:names(path),configuration:identity[2],configurationAncestry:ancestry(path)})
        row.quantityTotal=row.members.length;members++
      }
      if(options.mode!=='top-level' && child)walk(child,[...context,state(child)],row,depth+1)
    }
  }
  const scopeDefinition=definitions.get(assemblyDefinitionKey(selected.definition))!
  if(scopeDefinition.kind!=='assembly')fail('el ámbito no es un ensamblaje.')
  walk(selected,ancestry(selected.path).map(state))
  return {kind:'configured-assembly-bom',source:{id:document.source.id,revision:document.source.revision,name:document.source.name,rootConfiguration:document.rootConfiguration},
    scope:{path:[...selected.path],definition:{...selected.definition},configuration:selected.configuration,configurationName:configurationName(selected.definition,selected.configuration),name:scopeDefinition.name,configurationAncestry:ancestry(selected.path),suppressed:selected.suppressed,visible:selected.visible},
    context:{sourceSignature:JSON.stringify(document.source),catalogSignature:JSON.stringify(document.catalog),rootConfiguration:document.rootConfiguration},options,rows,referenceDiagnostics:structuredClone(evaluation.diagnostics) as AssemblyConfigurationDiagnostic[],declarationOnly:true}
}
