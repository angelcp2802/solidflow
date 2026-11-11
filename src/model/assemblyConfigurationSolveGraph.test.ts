import { expect, it } from 'vitest'
import { planAssemblyConfigurationSolve as plan } from './assemblyConfigurationSolveGraph'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { identityRigidPose, transformRigidPoint, validateRigidPose } from './rigidPose'

// Original project A/B rectangular-prism declaration graph; no native shapes,
// imported source or geometric/proof observations are fabricated by these tests.
const fixture=assemblyConfigurationCoreFixture
const key=(id:string,revision:string,configuration:string|null)=>JSON.stringify([id,revision,configuration])
const sKey=(configuration:string|null)=>key('configuration-S','s-r1',configuration)
const rootKey=(configuration:string|null)=>key('configuration-root','root-r1',configuration)
const node=(document:ReturnType<typeof fixture>['document'])=>document.definitions.find(value=>value.id==='configuration-S') as EmbeddedAssemblyDefinition
const plane=(path:string[]|null)=>({kind:'principal-plane' as const,component:path===null?null:{occurrencePath:path,definition:{id:'configuration-B',revision:'r1'}},plane:'XY' as const})
const near=(actual:readonly number[],expected:readonly number[])=>actual.forEach((value,i)=>expect(value).toBeCloseTo(expected[i],12))

it('groups one base state reused twice and puts dependencies before their parent',()=>{
 const {document,catalog}=fixture(),p=plan(document,catalog)
 expect(p.states.map(state=>state.key)).toEqual([sKey(null),rootKey(null)])
 const s=p.states[0],root=p.states[1]
 expect(s.representativePath).toEqual(['left']);expect(s.scopePaths).toEqual([['left'],['right']])
 expect(s.dependencies).toEqual([]);expect(root.dependencies).toEqual([sKey(null)])
 expect(s.bodies.map(body=>body.id)).toEqual(['a','b'])
 expect(s.bodies[1].pose.translation).toEqual([10,0,0])
 expect(root.bodies.map(body=>body.id)).toEqual(['left','right'])
 expect(p.status).toBe('ready');expect(p.diagnostics).toEqual([])
})
it('separates base from named state and retains every placed ancestry and literal world frame',()=>{
 const {document,catalog}=fixture(),p=plan(document,catalog,'mixed')
 expect(p.states.map(state=>state.key)).toEqual([sKey(null),sKey('compact'),rootKey('mixed')])
 const compact=p.states[1]
 expect(compact.scopePaths).toEqual([['right']]);expect(compact.bodies[1].pose.translation).toEqual([4,0,0])
 expect(compact.instances[0].configurationAncestry.map(item=>[item.path,item.configuration])).toEqual([[[],'mixed'],[['right'],'compact']])
 expect(compact.instances[0].scopePose.translation).toEqual([30,0,0])
 near(transformRigidPoint(validateRigidPose(compact.instances[0].scopePose),[1,2,3]),[28,1,3])
 expect(p.states[2].childConfigurations.map(child=>[child.occurrenceId,child.configuration])).toEqual([['left',null],['right','compact']])
})
it('solves one intrinsic named state for both uses without collapsing their placements',()=>{
 const {document,catalog}=fixture(),p=plan(document,catalog,'both-compact')
 expect(p.states.map(state=>state.key)).toEqual([sKey('compact'),rootKey('both-compact')])
 expect(p.states[0].scopePaths).toEqual([['left'],['right']])
 expect(p.states[0].instances.map(instance=>instance.scopePose.translation)).toEqual([[0,0,0],[30,0,0]])
 expect(p.states[0].instances.map(instance=>instance.configurationAncestry.at(-1)?.configuration)).toEqual(['compact','compact'])
})
it('retains hidden states but excludes suppressed namespaces and suppressed numerical bodies',()=>{
 const {document,catalog}=fixture();document.occurrences[0].visible=false
 let p=plan(document,catalog,'single-right')
 expect(p.states.map(state=>state.key)).toEqual([sKey(null),sKey('single'),rootKey('single-right')])
 expect(p.states[0].instances[0].visible).toBe(false)
 expect(p.states[1].occurrences).toHaveLength(2);expect(p.states[1].bodies.map(body=>body.id)).toEqual(['a'])
 document.occurrences[1].suppressed=true;p=plan(document,catalog,'single-right')
 expect(p.states.map(state=>state.key)).toEqual([sKey(null),rootKey('single-right')])
 expect(p.states[1].occurrences).toHaveLength(2);expect(p.states[1].bodies.map(body=>body.id)).toEqual(['left'])
 // The suppressed child selector is retained even though it is not a dependency.
 expect(p.states[1].childConfigurations[1].configuration).toBe('single')
 expect(p.states[1].dependencies).toEqual([sKey(null)])
})
it('preserves original fixed flags and all passive declarations including effective captures',()=>{
 const {document,catalog}=fixture(),s=node(document)
 document.occurrences[0].fixed=true;s.occurrences[1].fixed=true
 s.mates.push({id:'lock',name:'Original passive lock',type:'lock',suppressed:true,
  first:{occurrencePath:['a'],definition:{id:'configuration-A',revision:'r1'}},
  second:{occurrencePath:['b'],definition:{id:'configuration-B',revision:'r1'}},relativePose:identityRigidPose()})
 const captured={translation:[7,-2,5] as [number,number,number],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2] as [number,number,number,number]}
 catalog[1].configurations[0].mates.push({mateId:'lock',suppressed:true,capture:{type:'lock',relativePose:captured}})
 const p=plan(document,catalog,'mixed'),base=p.states[0],compact=p.states[1],root=p.states[2]
 expect(root.bodies.map(body=>body.fixed)).toEqual([true,false]);expect(base.bodies.map(body=>body.fixed)).toEqual([false,true])
 expect(compact.mates).toHaveLength(1);expect(compact.mates[0]).toMatchObject({suppressed:true,type:'lock',relativePose:captured})
 expect(base.mates[0]).toMatchObject({relativePose:identityRigidPose(),suppressed:true})
 expect(s.mates[0]).toMatchObject({relativePose:identityRigidPose()})
})
it('retains unavailable active diagnostics instead of silently planning a ready solve',()=>{
 const {document,catalog}=fixture(),s=node(document)
 s.mates.push({id:'distance',name:'Original reference availability',type:'distance',suppressed:false,first:plane(null),second:plane(['b']),distance:2,alignment:'aligned'})
 const p=plan(document,catalog,'single-right')
 expect(p.status).toBe('references-unavailable')
 expect(p.diagnostics).toEqual([{scopePath:['right'],mateId:'distance',side:'second',path:['right','b'],problem:'suppressed-component'}])
 expect(p.states.find(state=>state.configuration==='single')!.mates[0].suppressed).toBe(false)
 expect(p.states).toHaveLength(3)
})
it('keeps two nested 3D placements distinct while ordering G and S once each',()=>{
 const {document}=fixture(),s=node(document)
 const g:EmbeddedAssemblyDefinition={kind:'assembly',id:'original-G',revision:'g1',name:'Original G',createdAt:document.createdAt,updatedAt:document.updatedAt,
  occurrences:[{id:'inner',name:'Inner',definition:{id:s.id,revision:s.revision},pose:{translation:[2,0,3],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:false,suppressed:false,visible:true}],mates:[]}
 document.definitions.push(g);document.occurrences.forEach(occurrence=>occurrence.definition={id:g.id,revision:g.revision})
 const p=plan(document,[])
 expect(p.states.map(state=>state.key)).toEqual([sKey(null),key(g.id,g.revision,null),rootKey(null)])
 expect(p.states[0].scopePaths).toEqual([['left','inner'],['right','inner']])
 near(transformRigidPoint(validateRigidPose(p.states[0].instances[0].scopePose),[1,2,3]),[3,-3,5])
 near(transformRigidPoint(validateRigidPose(p.states[0].instances[1].scopePose),[1,2,3]),[33,3,5])
 expect(p.states[1].dependencies).toEqual([sKey(null)])
 expect(p.states[0].bodies[1].pose.translation).toEqual([10,0,0])
})
it('owns and deeply freezes output while preserving original source/catalog bytes',()=>{
 const {document,catalog}=fixture(),before=serializeAssemblyDocument(document),catalogBefore=JSON.stringify(catalog)
 const p=plan(document,catalog,'mixed')
 expect(serializeAssemblyDocument(document)).toBe(before);expect(JSON.stringify(catalog)).toBe(catalogBefore)
 document.occurrences[0].name='Changed';node(document).occurrences[1].pose.translation[0]=600;catalog[1].configurations[0].name='Changed'
 expect(p.source.occurrences[0].name).toBe('left');expect(p.states[0].occurrences[1].pose.translation[0]).toBe(10)
 expect(p.catalog[1].configurations[0].name).toBe('Compact')
 expect(Object.isFrozen(p.states[0].instances[0].configurationAncestry[0].path)).toBe(true)
 expect(Reflect.set(p.states[0].bodies[1].pose.translation,'0',900)).toBe(false)
})
it('validates dormant selector and executable data before emitting any plan',()=>{
 const {document,catalog}=fixture();let reads=0
 catalog[0].configurations[2].occurrences[0].configuration='missing'
 expect(()=>plan(document,catalog)).toThrow()
 catalog[0].configurations[2].occurrences[0].configuration='compact'
 Object.defineProperty(catalog[1].configurations[1],'mates',{enumerable:true,get(){reads++;throw Error('Executable dormant data')}})
 expect(()=>plan(document,catalog)).toThrow();expect(reads).toBe(0)
})
it('rejects unknown saved selectors rather than accepting a field unused by planning',()=>{
 const {document,catalog}=fixture()
 Object.assign(document.occurrences[0],{configuration:'compact'})
 expect(()=>plan(document,catalog)).toThrow()
})
