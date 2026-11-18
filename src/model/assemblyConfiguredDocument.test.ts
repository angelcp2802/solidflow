import {expect,it} from 'vitest'
import {createStepSource} from './stepSource'
import {assemblyConfigurationCoreFixture} from './assemblyConfigurationCore.test-utils'
import {evaluateAssemblyConfiguration} from './assemblyConfigurationCore'
import {MAX_ASSEMBLY_BYTES,validateAssemblyDocument,type EmbeddedAssemblyDefinition,type AssemblyAxisReference} from './assemblyDocument'
import {createAssemblyConfiguredDocument,validateAssemblyConfiguredDocument,parseAssemblyConfiguredDocument,serializeAssemblyConfiguredDocument,assemblyConfiguredGeometryInput} from './assemblyConfiguredDocument'

// Original A/B box declaration recipes. UNATTESTED locators below exercise
// persistence syntax only; no native topology or historical capture is claimed.
function fixture(){
 const value=assemblyConfigurationCoreFixture(),node=value.document.definitions.find(d=>d.id==='configuration-S') as EmbeddedAssemblyDefinition
 const axis=(id:'a'|'b'):AssemblyAxisReference=>({kind:'face',component:{occurrencePath:[id],definition:{id:id==='a'?'configuration-A':'configuration-B',revision:'r1'}},body:null,face:{sourceFeatureId:'solid',key:'face-v1|UNATTESTED-configured-persistence'},support:'axis'})
 const common={name:'Original authored mechanical declaration',suppressed:false,first:axis('a'),second:axis('b')}
 node.mates=[
  {...common,id:'gear',type:'gear',carrier:null,ratio:{numerator:3,denominator:2},direction:'opposed',neutralRotations:{first:[0,0,0,1],second:[0,0,1,0]},angles:{first:8*Math.PI+.25,second:-12*Math.PI-.5},phase:.75},
  {...common,id:'screw',type:'screw',lead:5,reverse:true,alignment:'opposed',neutralRotation:[1,0,0,0],neutralTravel:7.5,angle:16*Math.PI+.125},
  {...common,id:'rack',type:'rack-pinion',second:{kind:'edge',component:{occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}},body:null,edge:{sourceFeatureId:'solid',key:'edge-v1|UNATTESTED-configured-persistence'},support:'line'},conversion:{mode:'diameter',override:8},reverse:true,neutralRotation:[0,1,0,0],neutralTravel:-3,angle:-20*Math.PI+.75},
 ]
 value.catalog[1].configurations[0].mates=[
  {mateId:'gear',suppressed:true,capture:{type:'gear',neutralRotations:{first:[1,0,0,0],second:[0,1,0,0]},angles:{first:24*Math.PI,second:-34*Math.PI},phase:10}},
  {mateId:'screw',suppressed:false,capture:{type:'screw',neutralRotation:[0,0,1,0],neutralTravel:30,angle:40*Math.PI}},
  {mateId:'rack',suppressed:false,capture:{type:'rack-pinion',neutralRotation:[0,0,0,-1],neutralTravel:-40,angle:-50*Math.PI}},
 ]
 return value
}
it('round trips complete authored captures, nested selectors and the selected root without migrating v2',()=>{
 const {document,catalog}=fixture(),before=JSON.stringify({document,catalog})
 const saved=createAssemblyConfiguredDocument(document,catalog,'mixed'),json=serializeAssemblyConfiguredDocument(saved),again=parseAssemblyConfiguredDocument(json)
 expect(again).toEqual(saved);expect(again.source).toEqual(validateAssemblyDocument(document));expect(again.catalog[1].configurations[0].mates).toEqual(catalog[1].configurations[0].mates)
 expect(evaluateAssemblyConfiguration(again.source,again.catalog,again.rootConfiguration).scopes.find(s=>s.path[0]==='right')!.mates[0]).toMatchObject({id:'gear',suppressed:true,phase:10,angles:{first:24*Math.PI,second:-34*Math.PI}})
 expect(Object.keys(again)).toEqual(['version','kind','source','catalog','rootConfiguration']);expect(JSON.stringify({document,catalog})).toBe(before)
 expect(()=>validateAssemblyDocument(again)).toThrow()
})
it('detaches owned declarations and adds generation only to an explicit new runtime context',()=>{
 const {document,catalog}=fixture(),saved=createAssemblyConfiguredDocument(document,catalog,'mixed'),runtime=assemblyConfiguredGeometryInput(saved,7)
 saved.catalog[1].configurations[0].mates[0].suppressed=false;saved.source.name='Changed after context creation'
 expect(runtime.generation).toBe(7);expect(runtime.document.name).toBe(document.name);expect(runtime.catalog[1].configurations[0].mates[0].suppressed).toBe(true)
 expect(Object.keys(runtime)).toEqual(['document','catalog','rootConfiguration','generation'])
 for(const generation of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])expect(()=>assemblyConfiguredGeometryInput(saved,generation)).toThrow()
 expect(serializeAssemblyConfiguredDocument(saved)).not.toContain('generation')
})
it('retains repairable stale references but rejects invalid dormant selectors and graph cycles',()=>{
 const {document,catalog}=fixture(),node=document.definitions.find(d=>d.id==='configuration-S') as EmbeddedAssemblyDefinition
 if(node.mates[0].type!=='gear')throw Error('Original gear required')
 node.mates[0].first.component!.definition.revision='stale-r0'
 const saved=createAssemblyConfiguredDocument(document,catalog,'mixed')
 expect(evaluateAssemblyConfiguration(saved.source,saved.catalog,saved.rootConfiguration).status).toBe('references-unavailable')
 catalog[1].configurations[1].occurrences.push({occurrenceId:'a',configuration:'missing'})
 expect(()=>createAssemblyConfiguredDocument(document,catalog,'mixed')).toThrow()
 const other=assemblyConfigurationCoreFixture();other.document.occurrences[0].definition={id:other.document.id,revision:other.document.revision}
 expect(()=>createAssemblyConfiguredDocument(other.document,other.catalog)).toThrow()
})
it.each(['version','kind','extra','missing','undefined','nested-envelope'] as const)('rejects malformed envelope %s',kind=>{
 const {document,catalog}=fixture(),saved:Record<string,unknown>={version:3,kind:'configured-assembly',source:document,catalog,rootConfiguration:'mixed'}
 if(kind==='version')saved.version=4
 if(kind==='kind')saved.kind='assembly'
 if(kind==='extra')saved.generation=0
 if(kind==='missing')delete saved.rootConfiguration
 if(kind==='undefined')saved.rootConfiguration=undefined
 if(kind==='nested-envelope')saved.source=createAssemblyConfiguredDocument(document,catalog,'mixed')
 expect(()=>validateAssemblyConfiguredDocument(saved)).toThrow()
})
it.each(['getter','nested-getter','symbol','hidden','prototype','cycle','sparse','hook'] as const)('rejects non JSON %s without executing accessors',kind=>{
 const {document,catalog}=fixture();const saved:Record<string,unknown>={version:3,kind:'configured-assembly',source:document,catalog,rootConfiguration:'mixed'};let reads=0
 if(kind==='getter')Object.defineProperty(saved,'version',{enumerable:true,get(){reads++;return 3}})
 if(kind==='nested-getter')Object.defineProperty(catalog[1].configurations[0],'name',{enumerable:true,get(){reads++;return 'executed'}})
 if(kind==='symbol')Object.defineProperty(saved,Symbol('extra'),{value:1,enumerable:true})
 if(kind==='hidden')Object.defineProperty(saved,'hidden',{value:1})
 if(kind==='prototype')Object.setPrototypeOf(saved,{inherited:true})
 if(kind==='cycle')saved.source=saved
 if(kind==='sparse')delete catalog[0]
 if(kind==='hook')saved.toJSON=()=>{reads++;return {}}
 expect(()=>validateAssemblyConfiguredDocument(saved)).toThrow();expect(reads).toBe(0)
})
it('rejects oversized UTF8 input before parsing and bounds canonical envelope serialization',()=>{
 expect(()=>parseAssemblyConfiguredDocument(' '.repeat(MAX_ASSEMBLY_BYTES+1))).toThrow(/20MiB/)
 const {document,catalog}=assemblyConfigurationCoreFixture(),saved=createAssemblyConfiguredDocument(document,catalog,'mixed')
 const json=serializeAssemblyConfiguredDocument(saved)
 expect(new TextEncoder().encode(json).byteLength).toBeLessThanOrEqual(MAX_ASSEMBLY_BYTES)
 expect(()=>parseAssemblyConfiguredDocument(json.slice(0,-1))).toThrow(/JSON/)
})

it('counts the v3 envelope overhead even when its complete Core input fits20MiB',()=>{
 // Original opaque zero bytes test storage admission, not STEP geometry.
 // Two importedSolid data strings grow in multiples of eight base64 bytes.
 const {document}=assemblyConfigurationCoreFixture(),small=createStepSource(new Uint8Array(3))
 for(const definition of document.definitions)if(definition.kind==='part')definition.document.features=[{id:'opaque',name:'Original opaque integrity payload',type:'importedSolid',suppressed:false,source:small}]
 const normalized=evaluateAssemblyConfiguration(document,[],null)
 const initial=JSON.stringify({source:normalized.source,catalog:[],rootConfiguration:null},null,2)
 const overhead=new TextEncoder().encode(initial).byteLength-2*small.data.length
 const bytesPerSource=Math.floor((MAX_ASSEMBLY_BYTES-16-overhead)/8)*3
 const large=createStepSource(new Uint8Array(bytesPerSource))
 for(const definition of document.definitions)if(definition.kind==='part')definition.document.features=[{id:'opaque',name:'Original opaque integrity payload',type:'importedSolid',suppressed:false,source:large}]
 const coreBytes=new TextEncoder().encode(JSON.stringify({source:document,catalog:[],rootConfiguration:null},null,2)).byteLength
 const envelope={version:3,kind:'configured-assembly',source:document,catalog:[],rootConfiguration:null}
 expect(coreBytes).toBeLessThanOrEqual(MAX_ASSEMBLY_BYTES)
 expect(new TextEncoder().encode(JSON.stringify(envelope,null,2)).byteLength).toBeGreaterThan(MAX_ASSEMBLY_BYTES)
 expect(evaluateAssemblyConfiguration(document,[],null).source.definitions).toHaveLength(3)
 expect(()=>validateAssemblyConfiguredDocument(envelope)).toThrow(/Serialized configured document exceeds20MiB/)
})
