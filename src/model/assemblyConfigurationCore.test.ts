import { expect, it } from 'vitest'
import { evaluateAssemblyConfiguration, validateAssemblyConfigurationDeclarations, type AssemblyConfigurationCatalog } from './assemblyConfigurationCore'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyMate, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { identityRigidPose, transformRigidPoint, validateRigidPose } from './rigidPose'
import { createEmptyAssembly } from '../examples/assembly'
import { createDocument } from './document'
import { createStepSource } from './stepSource'

const fixture = assemblyConfigurationCoreFixture
const plane = (path: string[] | null, id = 'configuration-B', revision = 'r1') => ({ kind: 'principal-plane' as const,
  component: path === null ? null : { occurrencePath: path, definition: { id, revision } }, plane: 'XY' as const })
const sNode = (document: ReturnType<typeof fixture>['document']) => document.definitions.find(d => d.id === 'configuration-S') as EmbeddedAssemblyDefinition
const near = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThan(1e-12))

it('evaluates base and per-occurrence variants without rewriting legacy bytes or sharing effective state', () => {
  const { document, catalog } = fixture(), before = serializeAssemblyDocument(document), input = JSON.stringify(catalog)
  const base = evaluateAssemblyConfiguration(document, catalog), mixed = evaluateAssemblyConfiguration(document, catalog, 'mixed')
  expect(base.status).toBe('ready'); expect(mixed.status).toBe('ready')
  near(base.parts.find(p => p.path.join('/') === 'right/b')!.worldPose.translation, [30, 10, 0])
  near(mixed.parts.find(p => p.path.join('/') === 'right/b')!.worldPose.translation, [30, 4, 0])
  near(mixed.parts.find(p => p.path.join('/') === 'left/b')!.worldPose.translation, [10, 0, 0])
  expect(mixed.scopes.map(s => [s.path, s.configuration])).toEqual([[[], 'mixed'], [['left'], null], [['right'], 'compact']])
  expect(mixed.parts.find(p => p.path.join('/') === 'right/b')!.configurationAncestry.map(s => [s.path, s.configuration])).toEqual([[[], 'mixed'], [['right'], 'compact']])
  expect(serializeAssemblyDocument(document)).toBe(before); expect(JSON.stringify(catalog)).toBe(input)
  expect(mixed.scopes[1].occurrences).not.toBe(mixed.scopes[2].occurrences)
  expect(mixed.scopes[0].occurrences).not.toBe(mixed.source.occurrences)
  const originalPart=document.definitions.find(d=>d.kind==='part')!
  if(originalPart.kind!=='part')throw Error('Original part expected')
  originalPart.document.features[0].name='Changed after evaluation'
  expect(mixed.parts[0].definition.document.features[0].name).not.toBe('Changed after evaluation')
  catalog[0].configurations[0].name='Changed catalog after evaluation'
  expect(mixed.catalog[0].configurations[0].name).toBe('Right compact')
  expect(Object.isFrozen(mixed)).toBe(true); expect(Object.isFrozen(mixed.parts[0].chain[0].pose.translation)).toBe(true)
  expect(Reflect.set(mixed.parts[0].worldPose.translation, '0', 999)).toBe(false)
})

it('retains suppressed declarations and treats hidden as independent inherited display state', () => {
  const { document, catalog } = fixture()
  catalog[0].configurations[1].occurrences.push({ occurrenceId: 'left', visible: false })
  const result = evaluateAssemblyConfiguration(document, catalog, 'single-right')
  expect(result.parts).toHaveLength(4); expect(result.parts.filter(p => !p.suppressed)).toHaveLength(3)
  expect(result.parts.filter(p => !p.visible).map(p => p.path.join('/'))).toEqual(['left/a', 'left/b'])
  expect(result.parts.find(p => p.path.join('/') === 'right/b')!.suppressed).toBe(true)
  const both = evaluateAssemblyConfiguration(document, catalog, 'both-compact')
  expect(both.scopes.filter(s => s.configuration === 'compact')).toHaveLength(2)
  expect(both.parts.filter(p => p.path.at(-1) === 'b').map(p => p.occurrence.pose.translation)).toEqual([[4, 0, 0], [4, 0, 0]])
})

it('composes a proper common gauge and nested local overrides without freezing world frames', () => {
  const { document, catalog } = fixture()
  document.occurrences.forEach(o => { const p = o.pose.translation; o.pose.translation = [7 + p[2], -3 + p[1], 11 - p[0]] })
  // Common Ry90 gauge applied by literal quaternion multiplication to the two
  // original root rotations: I -> Ry90, Rz90 -> Ry90*Rz90.
  document.occurrences[0].pose.rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2]
  document.occurrences[1].pose.rotation = [.5, .5, .5, .5]
  const result = evaluateAssemblyConfiguration(document, catalog, 'mixed')
  near(result.parts.find(p => p.path.join('/') === 'right/b')!.worldPose.translation, [7, 1, -19])
  near(result.parts.find(p => p.path.join('/') === 'left/b')!.worldPose.translation, [7, -3, 1])
  near(transformRigidPoint(validateRigidPose(result.parts.find(p => p.path.join('/') === 'right/b')!.worldPose), [1, 2, 5]), [12, 2, -17])
})

it('reports each repeated role of active mates to excluded children and preserves null scope roles', () => {
  const { document, catalog } = fixture(), node = sNode(document)
  node.mates.push({ id:'w',name:'Four repeated logical roles',type:'width',suppressed:false,mode:'centered',
    width:[plane(['b']),plane(null)],tab:[plane(['b']),plane(['b'])],widthBranch:'sum',tabBranch:'sum',alignment:'aligned' })
  const result = evaluateAssemblyConfiguration(document, catalog, 'single-right')
  expect(result.status).toBe('references-unavailable')
  expect(result.diagnostics.map(d => [d.scopePath,d.mateId,d.side,d.path,d.problem])).toEqual([
    [['right'],'w','width-0',['right','b'],'suppressed-component'],
    [['right'],'w','tab-0',['right','b'],'suppressed-component'],
    [['right'],'w','tab-1',['right','b'],'suppressed-component'],
  ])
  catalog[1].configurations.find(c => c.id === 'single')!.mates.push({mateId:'w',suppressed:true})
  expect(evaluateAssemblyConfiguration(document, catalog, 'single-right').status).toBe('ready')
  expect(evaluateAssemblyConfiguration(document, catalog, 'mixed').scopes.find(s => s.path.join('/') === 'right')!.mates[0].suppressed).toBe(false)
})

it('keeps hidden endpoints available and retains null scope roles in the transformed declaring scope', () => {
  const {document,catalog}=fixture(),node=sNode(document)
  node.mates=[{id:'m',name:'Actual local frame role',type:'distance',suppressed:false,first:plane(null),second:plane(['b']),distance:0,alignment:'aligned'}]
  catalog[1].configurations[0].occurrences[0].visible=false
  const result=evaluateAssemblyConfiguration(document,catalog,'mixed'),right=result.scopes.find(s=>s.path.join('/')==='right')!
  expect(result.status).toBe('ready');expect(result.diagnostics).toEqual([])
  expect(result.parts.find(p=>p.path.join('/')==='right/b')!.visible).toBe(false)
  expect(right.mates[0].type).toBe('distance')
  if(right.mates[0].type!=='distance')throw Error('Expected retained distance declaration')
  expect(right.mates[0].first).toEqual(plane(null))
  near(right.worldPose.translation,[30,0,0])
  // The preserved null role denotes this rotated right frame, not world/root.
  near(transformRigidPoint({translation:[...right.worldPose.translation],rotation:[...right.worldPose.rotation]},[1,0,0]),[30,1,0])
})

it('distinguishes missing paths, paths through parts, stale tuples and suppressed ancestors', () => {
  const {document,catalog}=fixture()
  const targets=[plane(['missing']),plane(['left','a','child']),plane(['left','b'],'configuration-B','stale')]
  document.mates=targets.map((second,i)=>({id:'m'+i,name:'Original availability '+i,type:'distance',suppressed:false,first:plane(null),second,distance:0,alignment:'aligned'})) as AssemblyMate[]
  const result=evaluateAssemblyConfiguration(document,catalog)
  expect(result.diagnostics.map(d=>d.problem)).toEqual(['missing-occurrence','path-through-part','stale-definition'])
  document.mates=[{id:'m',name:'Suppressed ancestor',type:'distance',suppressed:false,first:plane(null),second:plane(['left','a'],'configuration-A'),distance:0,alignment:'aligned'}]
  document.occurrences[0].suppressed=true
  expect(evaluateAssemblyConfiguration(document,catalog).diagnostics[0].problem).toBe('suppressed-component')
})

it('keeps suppressed scope mates inactive but permits explicit named reactivation of a base mate', () => {
  const {document,catalog}=fixture(),node=sNode(document)
  node.mates=[{id:'m',name:'Missing base mate',type:'distance',suppressed:true,first:plane(null),second:plane(['missing']),distance:0,alignment:'aligned'}]
  catalog[1].configurations[0].mates=[{mateId:'m',suppressed:false}]
  expect(evaluateAssemblyConfiguration(document,catalog).diagnostics).toEqual([])
  expect(evaluateAssemblyConfiguration(document,catalog,'mixed').diagnostics).toHaveLength(1)
  document.occurrences[1].suppressed=true
  expect(evaluateAssemblyConfiguration(document,catalog,'mixed').diagnostics).toEqual([])
})

it('validates unused and dormant owners/selectors without allowing a part selector even null', () => {
  const {document,catalog}=fixture(),stamp=document.createdAt
  document.definitions.push({kind:'assembly',id:'dormant',revision:'r1',name:'Dormant',createdAt:stamp,updatedAt:stamp,occurrences:[{id:'p',name:'p',definition:{id:'configuration-A',revision:'r1'},pose:identityRigidPose(),fixed:false,suppressed:true,visible:false}],mates:[]})
  catalog.push({definition:{id:'dormant',revision:'r1'},configurations:[{id:'unused',name:'Unused',occurrences:[{occurrenceId:'p',configuration:null}],mates:[]}]})
  expect(()=>evaluateAssemblyConfiguration(document,catalog)).toThrow(/pieza/)
  catalog.pop();catalog[0].configurations[0].occurrences[0].configuration='missing'
  expect(()=>evaluateAssemblyConfiguration(document,catalog)).toThrow(/inexistente/)
})

it.each(['owner','configuration','occurrence','mate'] as const)('rejects duplicated %s declarations', kind => {
  const {document,catalog}=fixture()
  if(kind==='owner')catalog.push(catalog[0])
  if(kind==='configuration')catalog[0].configurations.push(catalog[0].configurations[0])
  if(kind==='occurrence')catalog[0].configurations[0].occurrences.push(catalog[0].configurations[0].occurrences[0])
  if(kind==='mate'){document.mates=[{id:'m',name:'Scope relation',type:'distance',suppressed:true,first:plane(null),second:plane(null),distance:0,alignment:'aligned'}];catalog[0].configurations[0].mates=[{mateId:'m',suppressed:true},{mateId:'m',suppressed:false}]}
  expect(()=>evaluateAssemblyConfiguration(document,catalog)).toThrow()
})

it('rejects unknown/executable/undefined/sparse/custom-prototype catalog and raw pose data without invoking hooks', () => {
  let calls=0
  const getter=()=>{calls++;return []}
  const {document,catalog}=fixture()
  const executable={...catalog[0]};Object.defineProperty(executable,'configurations',{enumerable:true,get:getter})
  const pose={translation:[0,0,0],rotation:[0,0,0,1]};Object.defineProperty(pose.translation,'0',{enumerable:true,get:getter})
  const holes=Array(1),symbol={...catalog[0],[Symbol('extra')]:true}
  const invalid:unknown[]=[[executable],[{...catalog[0],extra:true}],[{...catalog[0],configurations:undefined}],holes,[symbol],Object.assign([],{'extra':true}),[Object.assign(Object.create({inherited:true}),catalog[0])],
    [{...catalog[0],configurations:[{id:'bad',name:'Bad',occurrences:[{occurrenceId:'right',pose}],mates:[]}]}]]
  for(const value of invalid)expect(()=>evaluateAssemblyConfiguration(document,value)).toThrow()
  expect(calls).toBe(0)
})

it('rejects wrong owners, missing direct IDs, invalid names/booleans/poses and unknown root selectors', () => {
  const {document,catalog}=fixture()
  for(const definition of [{id:'configuration-A',revision:'r1'},{id:'configuration-S',revision:'old'}])expect(()=>evaluateAssemblyConfiguration(document,[{...catalog[0],definition}])).toThrow()
  for(const override of [{occurrenceId:'absent'},{occurrenceId:'right',fixed:0},{occurrenceId:'right',locked:true},{occurrenceId:'right',visible:0},{occurrenceId:'right',configuration:undefined},{occurrenceId:'right',pose:{translation:[0,0,0],rotation:[0,0,0,0]}}])expect(()=>evaluateAssemblyConfiguration(document,[{...catalog[0],configurations:[{id:'v',name:'V',occurrences:[override],mates:[]}]}])).toThrow()
  expect(()=>evaluateAssemblyConfiguration(document,catalog,'unknown')).toThrow()
  expect(()=>evaluateAssemblyConfiguration(document,[{...catalog[0],configurations:[{id:'bad\nname',name:'Bad',occurrences:[],mates:[]}]}])).toThrow()
})

it('accepts exactly 64 variants per owner and 512 total, then rejects the next variant', () => {
  const document=createEmptyAssembly(),stamp=document.createdAt
  const catalog:AssemblyConfigurationCatalog=[]
  for(let i=0;i<8;i++){
    const node={kind:'assembly' as const,id:'owner-'+i,revision:'r1',name:'Owner '+i,createdAt:stamp,updatedAt:stamp,occurrences:[],mates:[]};document.definitions.push(node)
    catalog.push({definition:{id:node.id,revision:node.revision},configurations:Array.from({length:64},(_,j)=>({id:'v'+j,name:'Variant '+j,occurrences:[],mates:[]}))})
  }
  expect(evaluateAssemblyConfiguration(document,catalog).status).toBe('ready')
  catalog[0].configurations.push({id:'v65',name:'Over cap',occurrences:[],mates:[]});expect(()=>evaluateAssemblyConfiguration(document,catalog)).toThrow()
  catalog[0].configurations.pop();catalog.push({definition:{id:document.id,revision:document.revision},configurations:[{id:'extra',name:'Over total',occurrences:[],mates:[]}]})
  expect(()=>evaluateAssemblyConfiguration(document,catalog)).toThrow(/512/)
})

it('accepts 4096 unique declared overrides and rejects 4097, including dormant variants', () => {
  const {document,catalog}=fixture(),first=document.occurrences[0]
  document.occurrences=Array.from({length:64},(_,i)=>({...structuredClone(first),id:'use'+i}))
  catalog[0].configurations=Array.from({length:64},(_,i)=>({id:'v'+i,name:'V'+i,occurrences:document.occurrences.map(o=>({occurrenceId:o.id,visible:false})),mates:[]}))
  catalog[1].configurations=[]
  expect(evaluateAssemblyConfiguration(document,catalog).status).toBe('ready')
  catalog[1].configurations=[{id:'over',name:'Over',occurrences:[{occurrenceId:'a',visible:false}],mates:[]}]
  expect(()=>evaluateAssemblyConfiguration(document,catalog)).toThrow(/4096/)
})

it('allows catalogs for root plus all 512 dormant assembly definitions without confusing owner and variant caps', () => {
  const document=createEmptyAssembly(),stamp=document.createdAt
  document.definitions=Array.from({length:512},(_,i)=>({kind:'assembly',id:'d'+i,revision:'r1',name:'D'+i,createdAt:stamp,updatedAt:stamp,occurrences:[],mates:[]}))
  const catalog=[document,...document.definitions].map(node=>({definition:{id:node.id,revision:node.revision},configurations:[]}))
  expect(evaluateAssemblyConfiguration(validateAssemblyDocument(document),catalog).scopes).toHaveLength(1)
})

it('rejects a combined source/catalog exceeding 20 MiB even when each owned input fits separately', () => {
  // Opaque original zero bytes test storage admission only, not STEP geometry.
  // Two canonical sources occupy 20,000,000 base64 characters, below 20 MiB;
  // the bounded 4096 long-ID pose overrides cross the combined byte boundary.
  const document=createEmptyAssembly(),step=createStepSource(new Uint8Array(7_500_000))
  document.definitions=['A','B'].map(id=>({kind:'part',id,revision:'r1',document:{...createDocument(id),id,
    features:[{id:'base',name:'Original opaque storage fixture',type:'importedSolid',suppressed:false,source:step}]}}))
  document.occurrences=Array.from({length:64},(_,i)=>({id:('occurrence-'+i+'-').padEnd(128,'x'),name:'o'+i,definition:{id:'A',revision:'r1'},pose:identityRigidPose(),fixed:false,suppressed:false,visible:true}))
  const catalog:AssemblyConfigurationCatalog=[{definition:{id:document.id,revision:document.revision},configurations:Array.from({length:64},(_,i)=>({id:'v'+i,name:'V'+i,
    occurrences:document.occurrences.map(o=>({occurrenceId:o.id,pose:{translation:[123456789.1234567,234567891.2345678,345678912.3456789],rotation:[0,0,0,1]}})),mates:[]}))}]
  expect(new TextEncoder().encode(serializeAssemblyDocument(document)).byteLength).toBeLessThan(20*1024*1024)
  expect(new TextEncoder().encode(JSON.stringify(catalog,null,2)).byteLength).toBeLessThan(20*1024*1024)
  expect(step.data.length*2).toBe(20_000_000)
  expect(new TextEncoder().encode(JSON.stringify({source:document,catalog,rootConfiguration:null},null,2)).byteLength).toBeGreaterThan(20*1024*1024)
  expect(evaluateAssemblyConfiguration(document,[]).status).toBe('ready')
  expect(()=>evaluateAssemblyConfiguration(document,catalog)).toThrow(/20 MiB/)
})

it('normalizes owned declaration fields identically to evaluation, including selected capture data', () => {
  const {document,catalog}=fixture(),s=sNode(document)
  s.mates.push({id:'lock',name:'Original captured declaration',type:'lock',suppressed:false,
    first:{occurrencePath:['a'],definition:{id:'configuration-A',revision:'r1'}},
    second:{occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}},relativePose:identityRigidPose()})
  catalog[1].configurations[0].mates.push({mateId:'lock',suppressed:true,capture:{type:'lock',relativePose:{translation:[7,-2,5],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]}}})
  const before=JSON.stringify({document,catalog}),declarations=validateAssemblyConfigurationDeclarations(document,catalog,'mixed'),evaluation=evaluateAssemblyConfiguration(document,catalog,'mixed')
  expect(declarations).toEqual({source:evaluation.source,catalog:evaluation.catalog,rootConfiguration:evaluation.rootConfiguration})
  expect(Object.keys(declarations)).toEqual(['source','catalog','rootConfiguration'])
  expect(JSON.stringify({document,catalog})).toBe(before)
  document.occurrences[0].name='Changed';catalog[1].configurations[0].mates[0].suppressed=false
  expect(declarations.source.occurrences[0].name).toBe('left')
  expect(declarations.catalog[1].configurations[0].mates[0].suppressed).toBe(true)
  expect(Object.isFrozen(declarations.catalog[1].configurations[0].mates[0].capture)).toBe(true)
  expect(Reflect.set(declarations.source.occurrences[0].pose.translation,'0',999)).toBe(false)
})
it('declaration-only normalization still rejects dormant selectors, malformed captures and executable data', () => {
  const {document,catalog}=fixture();let reads=0
  catalog[0].configurations[2].occurrences[0].configuration='missing'
  expect(()=>validateAssemblyConfigurationDeclarations(document,catalog)).toThrow()
  catalog[0].configurations[2].occurrences[0].configuration='compact'
  const s=sNode(document)
  s.mates.push({id:'lock',name:'Original lock',type:'lock',suppressed:true,
    first:{occurrencePath:['a'],definition:{id:'configuration-A',revision:'r1'}},
    second:{occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}},relativePose:identityRigidPose()})
  const capture={type:'lock',relativePose:{translation:[0,0,0],rotation:[0,0,0,0]}}
  const override={mateId:'lock',suppressed:true,capture}
  catalog[1].configurations[1].mates.push(override as typeof catalog[1]['configurations'][number]['mates'][number])
  expect(()=>validateAssemblyConfigurationDeclarations(document,catalog)).toThrow()
  Object.defineProperty(capture,'relativePose',{enumerable:true,get(){reads++;throw Error('Executable dormant capture')}})
  expect(()=>validateAssemblyConfigurationDeclarations(document,catalog)).toThrow();expect(reads).toBe(0)
  catalog[1].configurations[1].mates=[]
  Object.defineProperty(catalog[1].configurations[1],'occurrences',{enumerable:true,get(){reads++;throw Error('Executable dormant override')}})
  expect(()=>validateAssemblyConfigurationDeclarations(document,catalog)).toThrow();expect(reads).toBe(0)
})
it('does not pretend declaration validation has expanded world-placement or reference status', () => {
  const {document,catalog}=fixture()
  document.occurrences[0].pose.translation=[1e308,0,0]
  catalog[1].configurations[0].occurrences[0].pose={translation:[1e308,0,0],rotation:[0,0,0,1]}
  catalog[0].configurations[0].occurrences=[{occurrenceId:'left',configuration:'compact'}]
  const declarations=validateAssemblyConfigurationDeclarations(document,catalog,'mixed')
  expect(declarations.rootConfiguration).toBe('mixed');expect('status'in declarations).toBe(false)
  expect('scopes'in declarations).toBe(false);expect('parts'in declarations).toBe(false)
  expect(()=>evaluateAssemblyConfiguration(document,catalog,'mixed')).toThrow()
})
