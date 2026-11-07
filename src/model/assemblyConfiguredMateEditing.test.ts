import {expect,it} from 'vitest'
import {assemblyConfigurationCoreFixture} from './assemblyConfigurationCore.test-utils'
import {createAssemblyConfiguredDocument,parseAssemblyConfiguredDocument,serializeAssemblyConfiguredDocument} from './assemblyConfiguredDocument'
import {applyAssemblyConfiguredMateEdit as apply,validateAssemblyConfiguredMateEdit as parse,type AssemblyConfiguredMateEdit} from './assemblyConfiguredMateEditing'
import {evaluateAssemblyConfiguration as evaluate} from './assemblyConfigurationCore'
import {validateAssemblyMate,MAX_ASSEMBLY_BYTES,type EmbeddedAssemblyDefinition} from './assemblyDocument'
import {inspectAssemblyConfigurationMateReferences} from './assemblyConfigurationReferences'
import {planAssemblyConfigurationSolve} from './assemblyConfigurationSolveGraph'
import {effectiveAssemblyConfigurationMate} from './assemblyConfigurationState'
import {stageAssemblyConfigurationSolveState} from './assemblyConfigurationWriteback'

// Original declaration-only A/B recipes. Opaque keys are UNATTESTED: no native
// geometry, capture, or Apply authority is asserted by these pure tests.
const owner={id:'configuration-S',revision:'s-r1'}
const component={occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}}
const plane=(nullOwner=false)=>({kind:'principal-plane' as const,component:nullOwner?null:component,plane:'XY' as const})
const face={kind:'face' as const,component,body:null,face:{sourceFeatureId:'solid',key:'face-v1|UNATTESTED-edit'},support:'plane' as const}
const axis={...face,support:'axis' as const}
const edge={sourceFeatureId:'solid',key:'edge-v1|UNATTESTED-edit'}
const vertex={sourceFeatureId:'solid',key:'vertex-v1|'+'a'.repeat(64)}
const point={kind:'vertex' as const,component,body:null,vertex,support:'point' as const}
const path={component,body:null,edge,startVertex:vertex}
const common={id:'relation',name:'Original relation',suppressed:false}
const distance=(value=2)=>validateAssemblyMate({...common,type:'distance',first:plane(true),second:plane(),distance:value,alignment:'aligned'})
function fixture(){
  const f=assemblyConfigurationCoreFixture(),node=f.document.definitions.find(n=>n.id===owner.id) as EmbeddedAssemblyDefinition
  node.mates=[distance()]
  return createAssemblyConfiguredDocument(f.document,f.catalog,'mixed')
}
const edit=(configuration:string|null,change:AssemblyConfiguredMateEdit['change']):AssemblyConfiguredMateEdit=>({scopePath:configuration===null?['left']:['right'],definition:owner,configuration,change})
const scopes=(d:ReturnType<typeof fixture>)=>evaluate(d.source,d.catalog,d.rootConfiguration).scopes
const named=(d:ReturnType<typeof fixture>,id='compact')=>d.catalog[1].configurations.find(v=>v.id===id)!

it('isolates named add/replace/remove and preserves full source and other named state declarations',()=>{
  const original=fixture(),before=serializeAssemblyConfiguredDocument(original)
  let result=apply(original,edit('compact',{kind:'add',mate:{...distance(4),id:'new'}}))
  expect(result.source).toEqual(original.source)
  expect(named(result,'single')).toEqual(named(original,'single'))
  expect(scopes(result).find(s=>s.path[0]==='left')!.mates.map(m=>m.id)).toEqual(['relation'])
  expect(scopes(result).find(s=>s.path[0]==='right')!.mates.map(m=>m.id)).toEqual(['relation','new'])
  result=apply(result,edit('compact',{kind:'replace',mateId:'relation',mate:distance(-3)}))
  expect(named(result).mateDeclarations![0]).toMatchObject({distance:-3})
  result=apply(result,edit('compact',{kind:'remove',mateId:'relation'}))
  result=apply(result,edit('compact',{kind:'remove',mateId:'new'}))
  expect(named(result).mateDeclarations).toEqual([])
  expect(scopes(result).find(s=>s.path[0]==='right')!.mates).toEqual([])
  expect(serializeAssemblyConfiguredDocument(original)).toBe(before)
  expect(parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(result))).toEqual(result)
})
it('preserves dormant named suppression/captures before Base replacement and deletion',()=>{
  const original=fixture();named(original,'single').mates=[{mateId:'relation',suppressed:true}]
  const before=named(original).occurrences
  let result=apply(original,edit(null,{kind:'replace',mateId:'relation',mate:distance(9)}))
  expect(scopes(result).find(s=>s.path[0]==='left')!.mates[0]).toMatchObject({distance:9})
  expect(named(result).mateDeclarations![0]).toMatchObject({distance:2,suppressed:false})
  expect(named(result,'single').mateDeclarations![0]).toMatchObject({distance:2,suppressed:true})
  expect(named(result).occurrences).toEqual(before)
  const compactBefore=structuredClone(named(result))
  result=apply(result,edit(null,{kind:'remove',mateId:'relation'}))
  expect(named(result)).toEqual(compactBefore)
  expect(scopes(result).find(s=>s.path[0]==='left')!.mates).toEqual([])
})
it('edits all reused instances of the same intrinsic state and feeds actual effective planner/reference inventory',()=>{
  const f=fixture();f.rootConfiguration='both-compact'
  const result=apply(f,edit('compact',{kind:'suppression',mateId:'relation',suppressed:true}))
  expect(scopes(result).filter(s=>s.definition.id===owner.id).map(s=>s.mates[0].suppressed)).toEqual([true,true])
  const plan=planAssemblyConfigurationSolve(result.source,result.catalog,result.rootConfiguration)
  expect(plan.states.find(s=>s.definition.id===owner.id)!.scopePaths).toEqual([['left'],['right']])
  expect(inspectAssemblyConfigurationMateReferences(result.source,result.catalog,result.rootConfiguration).map(v=>v.suppressed)).toEqual([true,true])
})
it('applies old suppression/capture overlays AFTER explicit declarations and parses sidecar state against named families',()=>{
  const f=fixture(),gear=validateAssemblyMate({...common,type:'gear',first:axis,second:axis,carrier:null,
    ratio:{numerator:2,denominator:3},direction:'opposed',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:12,second:-8},phase:4})
  named(f).mateDeclarations=[gear]
  named(f).mates=[{mateId:'relation',suppressed:true,capture:{type:'gear',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:24,second:-16},phase:4}}]
  const value=effectiveAssemblyConfigurationMate(f.source,f.catalog,[],owner,'compact','relation')
  expect(value).toMatchObject({type:'gear',suppressed:true,angles:{first:24,second:-16}})
  const result=apply(f,edit('compact',{kind:'suppression',mateId:'relation',suppressed:false}))
  expect(named(result).mates).toEqual([])
  expect(named(result).mateDeclarations![0]).toMatchObject({type:'gear',suppressed:false,angles:{first:24,second:-16}})
})
it('writes named mechanical winding against its own declaration, preserving an unrelated Base family',()=>{
  const f=fixture(),gear=validateAssemblyMate({...common,type:'gear',first:axis,second:axis,carrier:null,
    ratio:{numerator:2,denominator:3},direction:'opposed',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:0,second:0},phase:4})
  named(f).mateDeclarations=[gear]
  const result=stageAssemblyConfigurationSolveState(f.source,f.catalog,f.rootConfiguration,{definition:owner,configuration:'compact',
    poses:[{id:'a',pose:{translation:[0,0,0],rotation:[0,0,0,1]}},{id:'b',pose:{translation:[4,0,0],rotation:[0,0,0,1]}}],
    gearAngles:[{mateId:'relation',first:4*Math.PI,second:-6*Math.PI}],screwAngles:[],rackPinionAngles:[]})
  expect(result.document).toEqual(f.source)
  expect(result.catalog[1].configurations[0].mates[0].capture).toMatchObject({type:'gear',angles:{first:4*Math.PI,second:-6*Math.PI},phase:4})
})
it('does not leak Base mechanical writeback into a same-ID named declaration of a different family',()=>{
 const f=fixture(),node=f.source.definitions.find(n=>n.id===owner.id) as EmbeddedAssemblyDefinition
 node.mates=[validateAssemblyMate({...common,type:'gear',first:axis,second:axis,carrier:null,
   ratio:{numerator:2,denominator:3},direction:'opposed',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:0,second:0},phase:4})]
 named(f).mateDeclarations=[distance(-4)]
 const before=structuredClone(named(f))
 const result=stageAssemblyConfigurationSolveState(f.source,f.catalog,f.rootConfiguration,{definition:owner,configuration:null,
   poses:[{id:'a',pose:{translation:[0,0,0],rotation:[0,0,0,1]}},{id:'b',pose:{translation:[10,0,0],rotation:[0,0,0,1]}}],
   gearAngles:[{mateId:'relation',first:4*Math.PI,second:-6*Math.PI}],screwAngles:[],rackPinionAngles:[]})
 expect(result.catalog[1].configurations[0]).toEqual(before)
 expect((result.document.definitions.find(n=>n.id===owner.id) as EmbeddedAssemblyDefinition).mates[0]).toMatchObject({type:'gear',angles:{first:4*Math.PI,second:-6*Math.PI}})
})
const compound:unknown[]=[
 {...common,type:'width',mode:'centered',width:[plane(),plane(true)],tab:[plane(),plane()],widthBranch:'sum',tabBranch:'sum',alignment:'aligned'},
 {...common,type:'hinge',axis:[axis,axis],axial:[face,face],alignment:'aligned',stops:{coordinate:'directed-about-axis',angular:[face,face],arc:{start:330,sweep:60}}},
 {...common,type:'profile-center',first:{face:{component,body:null,face:face.face},axis:{edge,sense:1}},second:{face:{component,body:null,face:face.face},axis:{edge,sense:-1}},alignment:'opposed',offsetMm:-2,orientation:{mode:'rectangle',quarterTurns:3}},
 {...common,type:'line-path',point,path,position:{mode:'percent',percent:25,reverse:true},orientation:{pitchYaw:{mode:'follow',axis:'x',reverse:true},roll:{mode:'up',axis:'y',reverse:false,guide:face}}},
 {...common,type:'circular-path',point,path,position:{mode:'free',domain:'trim'},orientation:{pitchYaw:'free',roll:'free'}},
 ...(['point','plane','line','cylinder','sphere'] as const).map(entityKind=>({...common,type:'symmetry',entityKind,
   source:entityKind==='point'?point:entityKind==='line'?{kind:'edge',component,body:null,edge,support:'line'}:entityKind==='cylinder'?{...face,support:'cylinder-surface'}:entityKind==='sphere'?{...face,support:'sphere-surface'}:face,
   target:entityKind==='point'?point:entityKind==='line'?{kind:'edge',component,body:null,edge,support:'line'}:entityKind==='cylinder'?{...face,support:'cylinder-surface'}:entityKind==='sphere'?{...face,support:'sphere-surface'}:face,mirror:plane(true),alignment:entityKind==='point'||entityKind==='sphere'?null:'aligned'})),
]
const binaries:[string,object][]=[
 ['coincident',{first:face,second:plane(true),alignment:'aligned'}],
 ['distance',{first:face,second:plane(true),alignment:'opposed',distance:-3}],
 ['limit-distance',{first:face,second:face,alignment:'aligned',limits:{minimum:-2,maximum:4}}],
 ['angle',{first:face,second:face,angle:35}],
 ['limit-angle',{first:face,second:face,coordinate:'principal-direction',limits:{minimum:10,maximum:170}}],
 ['limit-directed-angle',{first:face,second:face,guide:face,coordinate:'directed-about-axis',arc:{start:330,sweep:60}}],
 ['parallel',{first:face,second:face,alignment:'aligned'}],
 ['perpendicular',{first:face,second:face,alignment:null}],
 ['concentric',{first:axis,second:axis,alignment:'opposed',rotationLock:null}],
 ['tangent',{first:face,second:{...face,support:'cylinder-surface'},side:'positive'}],
 ['skew-cylinder-tangent',{first:{...face,support:'cylinder-surface'},second:{...face,support:'cylinder-surface'},branch:{kind:'external'}}],
 ['parallel-cylinder-tangent',{first:{...face,support:'cylinder-surface'},second:{...face,support:'cylinder-surface'},branch:{kind:'internal',larger:'first'}}],
 ['plane-sphere-tangent',{first:face,second:{...face,support:'sphere-surface'},side:'negative'}],
 ['sphere-sphere-tangent',{first:{...face,support:'sphere-surface'},second:{...face,support:'sphere-surface'},branch:{kind:'external'}}],
 ['cylinder-sphere-tangent',{first:{...face,support:'cylinder-surface'},second:{...face,support:'sphere-surface'},branch:{kind:'external'}}],
 ['lock',{first:component,second:component,relativePose:{translation:[1,2,3],rotation:[0,0,0,1]}}],
 ['gear',{first:axis,second:axis,carrier:null,ratio:{numerator:2,denominator:3},direction:'opposed',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:8*Math.PI,second:-12*Math.PI},phase:0}],
 ['screw',{first:axis,second:axis,lead:2,reverse:true,alignment:'aligned',neutralRotation:[0,0,0,1],angle:4*Math.PI,neutralTravel:3}],
 ['rack-pinion',{first:axis,second:{kind:'edge',component,body:null,edge,support:'line'},conversion:{mode:'diameter',override:4},reverse:true,neutralRotation:[0,0,0,1],angle:-6*Math.PI,neutralTravel:-3}],
]
it.each(binaries)('authors complete %s declarations and preserves passive/null roles', (type,fields)=>{
 const mate=validateAssemblyMate({...common,type,...fields,suppressed:true})
 const result=apply(fixture(),edit('compact',{kind:'replace',mateId:'relation',mate}))
 const inspected=inspectAssemblyConfigurationMateReferences(result.source,result.catalog,'mixed')[1]
 expect(inspected.mate).toEqual(mate);expect(inspected.suppressed).toBe(true)
 if(type==='gear')expect(inspected.roles.find(r=>r.side==='carrier')).toMatchObject({reference:null,candidate:null})
})
it.each(compound)('retains complete compound/n-ary declaration %j',raw=>{
 const mate=validateAssemblyMate(raw),result=apply(fixture(),edit('compact',{kind:'replace',mateId:'relation',mate}))
 expect(named(result).mateDeclarations).toEqual([mate])
 expect(inspectAssemblyConfigurationMateReferences(result.source,result.catalog,'mixed')[1].mate).toEqual(mate)
})
it('rejects wrong context, absent/duplicate identity and mismatched replacement without mutating source',()=>{
 const f=fixture(),before=JSON.stringify(f),operation=edit('compact',{kind:'remove',mateId:'relation'})
 for(const bad of [{...operation,configuration:null},{...operation,definition:{...owner,revision:'old'}},{...operation,scopePath:['gone']},
   edit('compact',{kind:'remove',mateId:'gone'}),edit('compact',{kind:'add',mate:distance()}),edit('compact',{kind:'replace',mateId:'relation',mate:{...distance(),id:'other'}})])expect(()=>apply(f,bad)).toThrow()
 expect(JSON.stringify(f)).toBe(before)
})
it('rejects dormant malformed declarations, duplicate IDs, invalid captures and expanded effective overflow',()=>{
 const f=fixture(),variant=named(f,'single')
 variant.mateDeclarations=[distance(),distance()];expect(()=>createAssemblyConfiguredDocument(f.source,f.catalog)).toThrow()
 variant.mateDeclarations=[];variant.mates=[{mateId:'relation',suppressed:false}];expect(()=>createAssemblyConfiguredDocument(f.source,f.catalog)).toThrow()
 variant.mateDeclarations=[distance()];variant.mates=[{mateId:'relation',suppressed:false,capture:{type:'concentric',rotationLock:null}}];expect(()=>createAssemblyConfiguredDocument(f.source,f.catalog)).toThrow()
 variant.mates=[];named(f).mateDeclarations=Array.from({length:2049},(_,i)=>({...distance(),id:'r'+i}));
 expect(()=>createAssemblyConfiguredDocument(f.source,f.catalog,'both-compact')).toThrow(/relaciones expandidas/)
})
it('admits exactly 4096 effective relations across two repeated named states and rejects one more even dormant',()=>{
 const f=fixture();named(f).mateDeclarations=Array.from({length:2048},(_,i)=>({...distance(),id:'r'+i}))
 const result=createAssemblyConfiguredDocument(f.source,f.catalog,'both-compact')
 expect(evaluate(result.source,result.catalog,result.rootConfiguration).scopes.reduce((n,s)=>n+s.mates.length,0)).toBe(4096)
 named(f).mateDeclarations!.push({...distance(),id:'overflow'})
 // Both-compact is now dormant, but its declared expansion must still fit.
 expect(()=>createAssemblyConfiguredDocument(f.source,f.catalog,null)).toThrow(/relaciones expandidas/)
 named(f).mateDeclarations=Array.from({length:4097},(_,i)=>({...distance(),id:'r'+i}))
 expect(()=>createAssemblyConfiguredDocument(f.source,f.catalog)).toThrow()
})
it('retains the combined byte bound for complete declarations before publishing any edited context',()=>{
 const f=fixture(),largeFace={...face,face:{sourceFeatureId:'solid',key:'face-v1|'+'x'.repeat(4088)}}
 const width=validateAssemblyMate({...common,type:'width',mode:'centered',width:[largeFace,largeFace],tab:[largeFace,largeFace],widthBranch:'sum',tabBranch:'sum',alignment:'aligned'})
 named(f).mateDeclarations=Array.from({length:1200},(_,i)=>({...width,id:'width-'+i}))
 const bytes=new TextEncoder().encode(JSON.stringify({source:f.source,catalog:f.catalog,rootConfiguration:f.rootConfiguration},null,2)).byteLength
 expect(bytes).toBeGreaterThan(MAX_ASSEMBLY_BYTES)
 expect(()=>evaluate(f.source,f.catalog,f.rootConfiguration)).toThrow(/20 MiB/)
})
it('rejects unknown/undefined/inherited edit fields and sparse path data without reading executable values',()=>{
 const valid=edit('compact',{kind:'remove',mateId:'relation'})
 for(const value of [{...valid,unknown:true},{...valid,configuration:undefined},
   {...valid,change:{kind:'remove',mateId:'relation',mate:undefined}},Object.assign(Object.create({configuration:'compact'}),valid),
   {...valid,scopePath:new Array(1)},{...valid,scopePath:Object.assign(['right'],{extra:true})},
   {...valid,change:{kind:'suppression',mateId:'relation',suppressed:undefined}}])expect(()=>parse(value)).toThrow()
 let reads=0;const path=['right'];Object.defineProperty(path,'0',{enumerable:true,get(){reads++;return 'right'}})
 expect(()=>parse({...valid,scopePath:path})).toThrow();expect(reads).toBe(0)
})
it('captures all input data without invoking getters and detaches accepted declarations',()=>{
 const valid=edit('compact',{kind:'replace',mateId:'relation',mate:distance()}),original=fixture();let reads=0
 for(const key of ['scopePath','definition','configuration','change']){
   const bad={...valid};Object.defineProperty(bad,key,{enumerable:true,get(){reads++;return valid[key as keyof typeof valid]}})
   expect(()=>parse(bad)).toThrow()
 }
 const bad=structuredClone(valid);Object.defineProperty(bad.change,'mate',{enumerable:true,get(){reads++;return distance()}});expect(()=>parse(bad)).toThrow()
 const catalog=structuredClone(original.catalog);Object.defineProperty(catalog[1].configurations[1],'mateDeclarations',{enumerable:true,get(){reads++;return []}})
 expect(()=>createAssemblyConfiguredDocument(original.source,catalog)).toThrow();expect(reads).toBe(0)
 const parsed=parse(valid),result=apply(original,parsed)
 if(parsed.change.kind!=='replace')throw Error('Expected replace')
 parsed.change.mate.name='Mutated caller';expect(named(result).mateDeclarations).toBeUndefined() // exact no-op
 const altered=apply(original,edit('compact',{kind:'replace',mateId:'relation',mate:distance(3)}))
 expect(named(altered).mateDeclarations![0].name).toBe('Original relation')
})
