import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC} from 'replicad'
import {beforeAll,expect,it,vi} from 'vitest'
import {assemblyConfigurationCoreFixture} from '../model/assemblyConfigurationCore.test-utils'
import {createAssemblyConfiguredDocument,parseAssemblyConfiguredDocument,serializeAssemblyConfiguredDocument} from '../model/assemblyConfiguredDocument'
import {evaluateAssemblyConfiguration} from '../model/assemblyConfigurationCore'
import type {EmbeddedAssemblyDefinition} from '../model/assemblyDocument'
import {identityRigidPose} from '../model/rigidPose'
import {ConfiguredAssemblyWorkerSession} from './kernel.assembly-configuration-session'
import {captureConfiguredAssemblyWorkerContext,captureConfiguredAssemblySolveOptions,type ConfiguredAssemblyWorkerContext} from './kernel.assembly-configuration-context'
import * as scenes from './kernel.assembly-configuration-scene'
import {CadEngine} from './kernel.engine'
import {KernelDispatcher} from './kernel.dispatcher'
import {createAssemblyExample} from '../examples/assembly'
import type {AssemblyPreviewReply} from './kernel.assembly-types'
import type {CadResult,KernelRequest} from './kernel.types'

// Original tracked A2x3x4 and B1x2x5 recipes, reused S left/right.
// No material topology keys or fabricated replies: component locks constrain
// actual native assemblies; all scenes below come from the real native pipeline.
const clone=<T>(value:T):T=>structuredClone(value)
const options={solver:{lengthRefinementTolerance:5e-7,angleRefinementTolerance:1e-9}}
const near=(a:readonly number[],b:readonly number[],band=1e-6)=>{
 expect(a).toHaveLength(b.length);a.forEach((v,i)=>{expect(Number.isFinite(v)).toBe(true);expect(Math.abs(v-b[i])).toBeLessThanOrEqual(band)})
}
const errors=(value:unknown):unknown[]=>[value,...(value instanceof AggregateError?value.errors.flatMap(errors):[])]
beforeAll(async()=>{setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),print:()=>undefined,printErr:()=>undefined}))},60_000)
function fixture():ConfiguredAssemblyWorkerContext {
 const {document,catalog}=assemblyConfigurationCoreFixture(),s=document.definitions.find(d=>d.id==='configuration-S') as EmbeddedAssemblyDefinition
 const part=(id:'a'|'b')=>({occurrencePath:[id],definition:{id:id==='a'?'configuration-A':'configuration-B',revision:'r1'}})
 s.occurrences[0].fixed=true
 s.mates=[{id:'child-lock',name:'Original child pose',type:'lock',suppressed:false,first:part('a'),second:part('b'),relativePose:{translation:[3,0,0],rotation:[0,0,0,1]}}]
 document.occurrences[0].fixed=true
 document.mates=[{id:'parent-lock',name:'Original parent quarter turn',type:'lock',suppressed:false,
  first:{occurrencePath:['left'],definition:{id:s.id,revision:s.revision}},second:{occurrencePath:['right'],definition:{id:s.id,revision:s.revision}},
  relativePose:{translation:[20,0,0],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]}}]
 return {document:createAssemblyConfiguredDocument(document,catalog,'both-compact'),generation:19}
}
function physical(scene:scenes.ConfiguredAssemblyScene){
 expect(scene.kind).toBe('configured-assembly-scene');expect(scene.scene.warnings).toEqual([])
 expect(scene.scene.solidCount).toBe(4);expect(scene.scene.prototypeCount).toBe(2);near([scene.scene.volume,scene.scene.area],[68,172],1e-5)
 const expected=new Map([
  ['left/a',[[0,0,0],[2,3,4],24,52]],['left/b',[[3,0,0],[4,2,5],10,34]],
  ['right/a',[[17,0,0],[20,2,4],24,52]],['right/b',[[18,3,0],[20,4,5],10,34]],
 ] as const)
 expect(scene.scene.bodies).toHaveLength(4)
 for(const body of scene.scene.bodies){
  const key=body.component.occurrencePath.join('/'),wanted=expected.get(key as 'left/a');expect(wanted).toBeDefined()
  near(body.bounds.min,wanted![0]);near(body.bounds.max,wanted![1]);near([body.volume,body.area],[wanted![2],wanted![3]],1e-5)
  expect(body.solidCount).toBe(1);expect(body.vertices.length).toBeGreaterThan(0)
 }
}
it('previews a nontrivial shared named child and parent, then applies the private candidate and reopens its complete file',()=>{
 const current=fixture(),before=clone(current),session=new ConfiguredAssemblyWorkerSession(),reply=session.preview(current,options)
 expect(reply.changed).toBe(true);expect(reply.verification.accepted).toBe(true)
 expect(reply.states.map(s=>[s.definition.id,s.configuration])).toEqual([['configuration-S','compact'],['configuration-root','both-compact']])
 expect(reply.states[0].scopePaths).toEqual([['left'],['right']]);physical(reply.scene)
 const privateDocument=clone(reply.document),privateGeneration=reply.candidateGeneration
 // Mutating a detached report cannot redirect the privately retained candidate.
 reply.document.source.name='Attempted DTO redirection';reply.document.catalog[1].configurations[0].occurrences[0].pose!.translation[0]=999
 const applied=session.apply(current,reply.token)
 expect(applied.document).toEqual(privateDocument);expect(applied.generation).toBe(privateGeneration);physical(applied.scene)
 expect(current).toEqual(before);expect(()=>session.apply(current,reply.token)).toThrow(/consumed|unknown/)
 const reopened=parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(applied.document))
 expect(reopened).toEqual(privateDocument)
 const fresh=new ConfiguredAssemblyWorkerSession().build({document:reopened,generation:0});physical(fresh)
 expect(evaluateAssemblyConfiguration(reopened.source,reopened.catalog,reopened.rootConfiguration).scopes.find(s=>s.path[0]==='left')!.occurrences[1].pose.translation).toEqual(privateDocument.catalog[1].configurations[0].occurrences[0].pose!.translation)
},60_000)
it('keeps readonly builds and unrelated cancellation from consuming the current genuine preview',()=>{
 const current=fixture(),session=new ConfiguredAssemblyWorkerSession(),first=session.preview(current,options),second=session.preview(current,options)
 expect(second.token).not.toBe(first.token);session.discard(first.token)
 expect(()=>session.apply(current,clone(second) as never)).toThrow(/unknown|consumed/)
 expect(()=>new ConfiguredAssemblyWorkerSession().apply(current,second.token)).toThrow(/unknown|consumed/)
 expect(()=>session.apply(current,first.token)).toThrow(/unknown|consumed/)
 const scene=session.build(current);expect(scene.context.generation).toBe(current.generation)
 expect(scene.context.catalogSignature).toBe(JSON.stringify(current.document.catalog))
 expect(()=>session.apply(current,String(clone({token:'not-issued'})))).toThrow(/unknown/)
 physical(session.apply(current,second.token).scene)
},60_000)
it('targeted cancellation consumes only the exact pending preview',()=>{
 const current=fixture(),session=new ConfiguredAssemblyWorkerSession(),reply=session.preview(current,options)
 session.discard(reply.token);expect(()=>session.apply(current,reply.token)).toThrow(/unknown|consumed/)
 const next=session.preview(current,options);session.discard();expect(()=>session.apply(current,next.token)).toThrow(/unknown|consumed/)
},60_000)
it('rejects malformed dispatcher cancellation without consuming a genuine configured preview or invoking token getters',()=>{
 const dispatcher=new KernelDispatcher(),current=fixture();let reads=0
 try{
  const ready=dispatcher.handle({id:1,action:'preview-configured-assembly',current,options}) as ReturnType<ConfiguredAssemblyWorkerSession['preview']>
  const malformed=[{},...([undefined,null,'',1,'x'.repeat(129)]).map(token=>({token})),{get token(){reads++;return ready.token}}]
  for(const fields of malformed){
   const request=Object.defineProperties({id:2,action:'discard-configured-assembly'},Object.getOwnPropertyDescriptors(fields))
   expect(()=>dispatcher.handle(request as KernelRequest)).toThrow(/token is invalid/)
  }
  expect(reads).toBe(0)
  expect(dispatcher.handle({id:3,action:'discard-configured-assembly',token:'older-unrelated-token'})).toBeNull()
  const applied=dispatcher.handle({id:4,action:'apply-configured-assembly',current,token:ready.token}) as ReturnType<ConfiguredAssemblyWorkerSession['apply']>
  physical(applied.scene)
 }finally{dispatcher.dispose()}
},60_000)
it.each(['source','catalog','selector','generation'] as const)('consumes a matching token on stale %s baseline and refuses reuse after restoring it',field=>{
 const current=fixture(),before=clone(current),session=new ConfiguredAssemblyWorkerSession(),reply=session.preview(current,options)
 if(field==='source')current.document.source.name='Different authored source'
 if(field==='catalog')current.document.catalog[1].configurations[0].name='Different variant name'
 if(field==='selector')current.document.rootConfiguration='mixed'
 if(field==='generation')current.generation++
 expect(()=>session.apply(current,reply.token)).toThrow(/baseline/)
 Object.assign(current,clone(before));expect(()=>session.apply(current,reply.token)).toThrow(/consumed|unknown/)
},60_000)
it('rejects malformed matching Apply data without invoking getters and still consumes its token',()=>{
 const current=fixture(),session=new ConfiguredAssemblyWorkerSession(),reply=session.preview(current,options);let reads=0
 const malformed={get document(){reads++;return current.document},generation:current.generation}
 expect(()=>session.apply(malformed,reply.token)).toThrow();expect(reads).toBe(0)
 expect(()=>session.apply(current,reply.token)).toThrow(/consumed|unknown/)
},60_000)
it('a purely rejected replacement policy preserves the older stage without any native query',()=>{
 const current=fixture(),before=clone(current),session=new ConfiguredAssemblyWorkerSession(),reply=session.preview(current,options);let reads=0
 const query=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences'),bad={get maxTrials(){reads++;return 1}}
 try{expect(()=>session.preview(current,{solver:bad})).toThrow();expect(reads).toBe(0);expect(query).not.toHaveBeenCalled()}finally{query.mockRestore()}
 physical(session.apply(current,reply.token).scene);expect(current).toEqual(before)
},60_000)
it.each(['preview','apply'] as const)('withholds publication after a real native scene completes but %s scene delivery fails',phase=>{
 const current=fixture(),before=clone(current),session=new ConfiguredAssemblyWorkerSession()
 const staged=phase==='apply'?session.preview(current,options):null,actual=scenes.buildConfiguredAssemblyScene,problem=Error('Original scene delivery failure')
 let published:unknown
 const scene=vi.spyOn(scenes,'buildConfiguredAssemblyScene').mockImplementation((...args)=>{const result=actual(...args);expect(result.scene.solidCount).toBe(4);throw problem})
 try{expect(()=>{published=phase==='apply'?session.apply(current,staged!.token):session.preview(current,options)}).toThrow(problem);expect(scene).toHaveBeenCalledTimes(1);expect(published).toBeUndefined()}finally{scene.mockRestore()}
 if(staged)expect(()=>session.apply(current,staged.token)).toThrow(/unknown|consumed/)
 expect(current).toEqual(before)
},60_000)
it.each(['preview','apply','build'] as const)('rejects caller raw generation reentry after the real %s scene, never publishing stale data',phase=>{
 const current=fixture(),session=new ConfiguredAssemblyWorkerSession(),staged=phase==='apply'?session.preview(current,options):null
 const actual=scenes.buildConfiguredAssemblyScene;let published:unknown
 const scene=vi.spyOn(scenes,'buildConfiguredAssemblyScene').mockImplementation((...args)=>{const result=actual(...args);current.generation++;return result})
 try{expect(()=>{published=phase==='preview'?session.preview(current,options):phase==='apply'?session.apply(current,staged!.token):session.build(current)}).toThrow(/changed/);expect(scene).toHaveBeenCalledTimes(1);expect(published).toBeUndefined()}finally{scene.mockRestore()}
 if(staged)expect(()=>session.apply(current,staged.token)).toThrow(/unknown|consumed/)
},60_000)
it('withholds a preview on actual native cleanup failure and drains each built scene prototype once',()=>{
 const current=fixture(),before=clone(current),session=new ConfiguredAssemblyWorkerSession(),actualBuild=CadEngine.prototype.build,actualDispose=CadEngine.prototype.dispose
 const built=new Set<CadEngine>(),released=new Map<CadEngine,number>(),problem=Error('Original native scene release failure')
 const build=vi.spyOn(CadEngine.prototype,'build').mockImplementation(function(this:CadEngine,...args){const result=actualBuild.apply(this,args);built.add(this);return result})
 const dispose=vi.spyOn(CadEngine.prototype,'dispose').mockImplementation(function(this:CadEngine){actualDispose.call(this);if(built.has(this)){built.delete(this);released.set(this,(released.get(this)??0)+1);throw problem}})
 let published:unknown,caught:unknown
 try{try{published=session.preview(current,options)}catch(error){caught=error}expect(errors(caught)).toContain(problem);expect(published).toBeUndefined();expect(released.size).toBeGreaterThan(0);expect([...released.values()].every(count=>count===1)).toBe(true)}finally{build.mockRestore();dispose.mockRestore()}
 expect(current).toEqual(before)
},60_000)
it('captures strict own worker contexts and options independently without any native authority',()=>{
 const current=fixture(),owned=captureConfiguredAssemblyWorkerContext(current),before=clone(current);let reads=0
 owned.document.source.name='Owned copy';expect(current).toEqual(before)
 for(const input of [{get document(){reads++;return current.document},generation:0},{document:current.document,generation:undefined},{...current,extra:true}])expect(()=>captureConfiguredAssemblyWorkerContext(input)).toThrow()
 expect(()=>captureConfiguredAssemblySolveOptions({solver:{get maxTrials(){reads++;return 1}}})).toThrow();expect(reads).toBe(0)
 const optionsCopy=captureConfiguredAssemblySolveOptions(options);optionsCopy.solver!.maxIterations=1;expect(options.solver).not.toHaveProperty('maxIterations')
})


it('dispatcher rejects malformed configured context or policy before releasing the actual cached part or legacy preview',()=>{
 const part=new KernelDispatcher(),assembly=new KernelDispatcher(),current=fixture(),legacy=createAssemblyExample()
 try{
  const source=current.document.source.definitions.find(d=>d.id==='configuration-A')
  if(source?.kind!=='part')throw Error('Original A fixture required')
  const built=part.handle({id:1,action:'build',features:source.document.features}) as CadResult
  near([built.volume],[24],1e-5)
  const preview=assembly.handle({id:1,action:'preview-assembly',current:legacy,proposed:legacy}) as AssemblyPreviewReply
  expect(preview.status).toBe('ready');if(preview.status!=='ready')throw Error('Original legacy preview refused')
  let reads=0
  const badContext={get document(){reads++;return current.document},generation:current.generation}
  const badOptions={solver:{get maxTrials(){reads++;return 1}}}
  const dispose=vi.spyOn(CadEngine.prototype,'dispose'),query=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences')
  try{
   for(const dispatcher of [part,assembly]){
    expect(()=>dispatcher.handle({id:2,action:'preview-configured-assembly',current:badContext})).toThrow()
    expect(()=>dispatcher.handle({id:3,action:'preview-configured-assembly',current,options:badOptions})).toThrow()
    expect(()=>dispatcher.handle({id:4,action:'preview-configured-assembly',current:{...current,unexpected:true}} as unknown as KernelRequest)).toThrow()
   }
   expect(reads).toBe(0);expect(dispose).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled()
  }finally{dispose.mockRestore();query.mockRestore()}
  const exported=part.handle({id:5,action:'export',format:'stl'})
  expect(exported).toBeInstanceOf(Blob);expect((exported as Blob).size).toBeGreaterThan(84)
  const applied=assembly.handle({id:5,action:'apply-assembly',current:legacy,token:preview.token})
  expect(applied && typeof applied==='object' && 'kind'in applied && applied.kind).toBe('assembly-applied')
 }finally{part.dispose();assembly.dispose()}
},60_000)
