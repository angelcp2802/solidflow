import { expect, it } from 'vitest'
import { applyAssemblyConfiguredOccurrenceEdit as apply, validateAssemblyConfiguredOccurrenceEdit as validate,
  type AssemblyConfiguredOccurrenceEdit as Edit } from './assemblyConfiguredOccurrenceEditing'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, parseAssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration } from './assemblyConfigurationCore'
import { planAssemblyConfigurationSolve } from './assemblyConfigurationSolveGraph'
import { AssemblyConfiguredDocumentHistory } from './assemblyConfiguredHistory'
import { identityRigidPose } from './rigidPose'
import type { AssemblyDocument, EmbeddedPartDefinition } from './assemblyDocument'

// Original public Cartesian box recipes from the core fixture. Declaration-only
// tests do not establish native geometry, solver acceptance or publication.
function setup(root:string|null='mixed') {
  const {document,catalog}=assemblyConfigurationCoreFixture()
  return createAssemblyConfiguredDocument(document,catalog,root)
}
function target(document:ReturnType<typeof setup>,path:string[]=[]):Pick<Edit,'scopePath'|'definition'|'configuration'> {
  const scope=evaluateAssemblyConfiguration(document.source,document.catalog,document.rootConfiguration).scopes.find(row=>JSON.stringify(row.path)===JSON.stringify(path))!
  return {scopePath:path,definition:{...scope.definition},configuration:scope.configuration}
}
const placement={name:'Original additional occurrence',pose:identityRigidPose(),fixed:false}
const partRef={id:'configuration-A',revision:'r1'}
function reuse(document:ReturnType<typeof setup>,path:string[]=[]):Edit {
  return {...target(document,path),change:{kind:'reuse',...placement,definition:partRef,configuration:null}}
}
function occurrences(document:ReturnType<typeof setup>,path:string[]=[]) {
  return evaluateAssemblyConfiguration(document.source,document.catalog,document.rootConfiguration).scopes.find(row=>JSON.stringify(row.path)===JSON.stringify(path))!.occurrences
}
function imported():ReturnType<typeof setup> {
  const parent=setup(),part=parent.source.definitions.find(row=>row.id===partRef.id) as EmbeddedPartDefinition
  const source:AssemblyDocument={version:2,kind:'assembly',id:'imported-original',revision:'i1',name:'Original imported pair',units:'mm',
    createdAt:parent.source.createdAt,updatedAt:parent.source.updatedAt,definitions:[part],occurrences:['one','two'].map((id,i)=>({
      id,name:id,definition:partRef,pose:{...identityRigidPose(),translation:[i*10,0,0]},fixed:i===0,suppressed:false,visible:true})),
    mates:[{id:'retained-lock',name:'Original saved lock',suppressed:true,type:'lock',first:{occurrencePath:['one'],definition:partRef},
      second:{occurrencePath:['two'],definition:partRef},relativePose:{...identityRigidPose(),translation:[10,0,0]}}]}
  return createAssemblyConfiguredDocument(source,[{definition:{id:source.id,revision:source.revision},configurations:[{
    id:'offset',name:'Offset second occurrence',occurrences:[{occurrenceId:'two',pose:{...identityRigidPose(),translation:[12,0,0]}}],
    mates:[{mateId:'retained-lock',suppressed:true,capture:{type:'lock',relativePose:{...identityRigidPose(),translation:[12,0,0]}}}]}]}],'offset')
}
it('inserts a reused definition only in the selected named state with one fresh identity',()=>{
  const document=setup(),before=structuredClone(document),next=apply(document,reuse(document))
  const added=next.source.occurrences.at(-1)!
  expect(next.version).toBe(3);expect(added.suppressed).toBe(true)
  expect(occurrences(next).at(-1)).toMatchObject({...placement,suppressed:false,definition:partRef})
  expect(occurrences({...next,rootConfiguration:null}).at(-1)!.suppressed).toBe(true)
  expect(occurrences({...next,rootConfiguration:'both-compact'}).at(-1)!.suppressed).toBe(true)
  expect(next.source.definitions).toEqual(document.source.definitions)
  expect(document).toEqual(before)
  expect(apply(document,reuse(document)).source.occurrences.at(-1)!.id).not.toBe(added.id)
})
it('inserts into Base with inherited membership and preserves pre-existing named overrides',()=>{
  const document=setup(null),next=apply(document,reuse(document))
  expect(next.catalog).toEqual(document.catalog)
  expect(next.source.occurrences.at(-1)!.suppressed).toBe(false)
  expect(occurrences({...next,rootConfiguration:'mixed'}).at(-1)!.suppressed).toBe(false)
})
it('shares a named insertion across both uses selecting the same intrinsic child state',()=>{
  const document=setup('both-compact'),next=apply(document,reuse(document,['left']))
  const left=occurrences(next,['left']).at(-1)!,right=occurrences(next,['right']).at(-1)!
  expect(left.id).toBe(right.id);expect(left.suppressed).toBe(false);expect(right.suppressed).toBe(false)
  expect(occurrences({...next,rootConfiguration:null},['left']).at(-1)!.suppressed).toBe(true)
})
it('applies fixed overrides only to the named state, while Base fixed values remain inherited',()=>{
  const document=setup(),intent:Edit={...target(document),change:{kind:'set-fixed',occurrenceId:'left',fixed:true}}
  const next=apply(document,intent)
  expect(occurrences(next)[0].fixed).toBe(true);expect(next.source.occurrences[0].fixed).toBe(false)
  const base={...next,rootConfiguration:null},changed=apply(base,{...target(base),change:{kind:'set-fixed',occurrenceId:'right',fixed:true}})
  expect(occurrences({...changed,rootConfiguration:'mixed'}).map(row=>row.fixed)).toEqual([true,true])
  const plan=planAssemblyConfigurationSolve(changed.source,changed.catalog,'mixed')
  expect(plan.states.find(row=>row.definition.id===changed.source.id)!.bodies.map(row=>[row.id,row.fixed])).toEqual([['left',true],['right',true]])
  const floated=apply(next,{...target(next),change:{kind:'set-fixed',occurrenceId:'left',fixed:false}})
  expect(occurrences(floated)[0].fixed).toBe(false)
  const history=new AssemblyConfiguredDocumentHistory(document);history.commitDocument(next)
  expect(history.undo()).toEqual(document);expect(history.redo()).toEqual(next)
  expect(parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(next))).toEqual(next)
})
it('imports a complete v3 catalog, selected child state and saved capture without flattening',()=>{
  const document=setup(),source=imported(),before=structuredClone(source)
  const next=apply(document,{...target(document),change:{kind:'insert',...placement,source,partRevision:null}})
  expect(source).toEqual(before)
  expect(next.catalog.find(row=>row.definition.id===source.source.id)).toEqual(source.catalog[0])
  const added=next.source.occurrences.at(-1)!
  const evaluation=evaluateAssemblyConfiguration(next.source,next.catalog,next.rootConfiguration)
  const child=evaluation.scopes.find(row=>row.path.length===1&&row.path[0]===added.id)!
  expect(child.configuration).toBe('offset');expect(child.occurrences[1].pose.translation).toEqual([12,0,0])
  expect(child.mates[0]).toMatchObject({type:'lock',relativePose:{translation:[12,0,0]}})
  expect(parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(next))).toEqual(next)
})
it('requires a named parent for a selected imported variant instead of dropping the selector',()=>{
  const document=setup(null),before=structuredClone(document)
  expect(()=>apply(document,{...target(document),change:{kind:'insert',...placement,source:imported(),partRevision:null}})).toThrow(/nombrada/)
  expect(document).toEqual(before)
})
it('imports v1 and v2 sources into Base, reuses exact definitions and rejects content collisions atomically',()=>{
  const document=setup(null),part=(document.source.definitions[0] as EmbeddedPartDefinition).document
  const source={...part,id:'new-original-part'}
  const first=apply(document,{...target(document),change:{kind:'insert',...placement,source,partRevision:'p1'}})
  const second=apply(first,{...target(first),change:{kind:'insert',...placement,source,partRevision:'p1'}})
  expect(second.source.definitions.filter(row=>row.id===source.id)).toHaveLength(1)
  expect(second.source.occurrences.at(-1)!.id).not.toBe(first.source.occurrences.at(-1)!.id)
  const changed={...source,name:'Conflicting source content'}
  expect(()=>apply(first,{...target(first),change:{kind:'insert',...placement,source:changed,partRevision:'p1'}})).toThrow(/contenido distinto/)
  const v2=apply(document,{...target(document),change:{kind:'insert',...placement,source:imported().source,partRevision:null}})
  expect(occurrences(v2).at(-1)!.suppressed).toBe(false)
})
it('rejects a colliding named catalog without overwriting existing source or captures',()=>{
  const document=setup(),source=imported(),first=apply(document,{...target(document),change:{kind:'insert',...placement,source,partRevision:null}})
  const changed=structuredClone(source);changed.catalog[0].configurations[0].name='Conflicting catalog'
  const before=structuredClone(first)
  expect(()=>apply(first,{...target(first),change:{kind:'insert',...placement,source:changed,partRevision:null}})).toThrow(/configuración.*contenido distinto/)
  expect(first).toEqual(before)
})
it('rejects stale scopes, absent definitions, suppressed scopes, invalid selectors and cycles',()=>{
  const document=setup(),intent=reuse(document)
  expect(()=>apply(document,{...intent,configuration:null})).toThrow(/estado/)
  expect(()=>apply(document,{...intent,definition:{...intent.definition,revision:'old'}})).toThrow(/estado/)
  expect(()=>apply(document,{...intent,scopePath:['missing']})).toThrow(/estado/)
  expect(()=>apply(document,{...intent,change:{kind:'reuse',...placement,definition:{id:'absent',revision:'r1'},configuration:null}})).toThrow(/no existe/)
  expect(()=>apply(document,{...intent,change:{kind:'reuse',...placement,definition:partRef,configuration:'not-a-part-state'}})).toThrow(/hija/)
  expect(()=>apply(document,{...intent,change:{kind:'reuse',...placement,definition:intent.definition,configuration:null}})).toThrow()
  const suppressed=setup();suppressed.source.occurrences[0].suppressed=true
  expect(()=>apply(suppressed,reuse(suppressed,['left']))).toThrow(/suprimido/)
})
it('rejects unknown, hidden, sparse, executable and malformed fixed/insert declarations before executing them',()=>{
  const document=setup(),intent=reuse(document)
  expect(()=>validate({...intent,extra:true})).toThrow()
  expect(()=>validate({...intent,change:{...intent.change,fixed:'true'}})).toThrow()
  expect(()=>validate({...intent,scopePath:Array(1)})).toThrow()
  expect(()=>validate({...intent,change:{kind:'insert',...placement,source:imported(),partRevision:'not-null'}})).toThrow()
  let calls=0;const evil=structuredClone(intent)
  Object.defineProperty(evil.change,'fixed',{enumerable:true,get(){calls++;return true}})
  expect(()=>validate(evil)).toThrow();expect(calls).toBe(0)
  const hidden=structuredClone(intent);Object.defineProperty(hidden.change,'fixed',{enumerable:false,value:false})
  expect(()=>validate(hidden)).toThrow()
  const maliciousSource=imported();Object.defineProperty(maliciousSource.source,'name',{enumerable:true,get(){calls++;return 'unsafe'}})
  expect(()=>validate({...intent,change:{kind:'insert',...placement,source:maliciousSource,partRevision:null}})).toThrow();expect(calls).toBe(0)
  const configured=setup();configured.catalog[0].configurations[0].occurrences.push({occurrenceId:'left',fixed:'yes' as unknown as boolean})
  expect(()=>createAssemblyConfiguredDocument(configured.source,configured.catalog,configured.rootConfiguration)).toThrow()
})
