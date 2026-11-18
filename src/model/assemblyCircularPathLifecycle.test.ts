import {expect,it} from 'vitest'
import fixture from '../cad/fixtures/assembly-material-arc-original.json'
import {validateAssemblyDocument,validateAssemblyMate,serializeAssemblyDocument,parseAssemblyDocument,type AssemblyDocument,type AssemblyCircularPathMate,type AssemblyLinePathMate,type EmbeddedAssemblyDefinition} from './assemblyDocument'
import {assemblyMateEndpoints,assemblyMateEndpointComponent,assemblyMatePathKind,isAssemblyPathEndpoint,isAssemblyLinePathEndpoint,withAssemblyMateEndpoint,withAssemblyMateEndpointComponent} from './assemblyMateEndpoints'
import {inspectAssemblyMateReferences,isAssemblyCircularPathMateInspection,isAssemblyBinaryMateInspection} from './assemblyReferences'
import {AssemblyDocumentHistory,applyAssemblyEdit} from './assemblyEditing'
import {prepareAssemblyPartUpdate,repairAssemblyEndpoint} from './assemblySourceUpdates'
import {prepareAssemblyPartReplacement} from './assemblyReplacement'
import {prepareAssemblyDocumentUpdate} from './assemblySubassemblyUpdates'
import {identityRigidPose} from './rigidPose'
// Original sector recipe reused for source/registry declarations. The opaque
// keys below are syntax fixtures only, never native identity or curve evidence.
function original():AssemblyDocument{
 const d=validateAssemblyDocument(fixture),part=d.definitions[0],source={id:part.id,revision:part.revision},body={bodyId:'sector',sourceFeatureId:'solid'},vertex={sourceFeatureId:'solid',key:'vertex-v1|'+'a'.repeat(64)}
 d.occurrences.push({...structuredClone(d.occurrences[1]),id:'g',name:'Original guide'})
 d.mates.push({id:'arc',name:'Original saved circular intent',suppressed:false,type:'circular-path',point:{kind:'vertex',component:{occurrencePath:['a'],definition:source},body,vertex,support:'point'},path:{component:{occurrencePath:['b'],definition:source},body,edge:{sourceFeatureId:'solid',key:'edge-v1|original-circular-boundary'},startVertex:vertex},position:{mode:'free',domain:'trim'},orientation:{pitchYaw:{mode:'follow',axis:'x',reverse:true},roll:{mode:'up',axis:'z',reverse:false,guide:{kind:'face',component:{occurrencePath:['g'],definition:source},body,face:{sourceFeatureId:'solid',key:'face-v1|original-top'},support:'plane'}}}})
 return validateAssemblyDocument(d)
}
function arc(d:AssemblyDocument):AssemblyCircularPathMate{const m=d.mates[0];if(m.type!=='circular-path')throw Error('Expected original circular intent');return m}
for(const position of [{mode:'free',domain:'trim'},{mode:'free',domain:'support-circle'},{mode:'coordinate',distanceMm:0},{mode:'coordinate',distanceMm:999}] as const)it('roundtrips exact circular saved intent without measured geometry '+JSON.stringify(position),()=>{
 const d=original(),m=arc(d);m.position=position;const parsed=parseAssemblyDocument(serializeAssemblyDocument(d));expect(parsed).toEqual(d);const checked=validateAssemblyMate(m);expect(checked).toEqual(m);expect(checked).not.toBe(m);expect(checked.type==='circular-path'&&checked.path).not.toBe(m.path);expect('first'in checked).toBe(false);expect('radiusMm'in checked).toBe(false)
})
it('rejects missing domain, executable compound fields and stored numeric authority',()=>{
 const m=arc(original());for(const value of [{...m,position:{mode:'free'}},{...m,position:{mode:'coordinate',distanceMm:-1}},{...m,position:{mode:'free',domain:'bounded'}},{...m,radiusMm:2},{...m,path:{...m.path,arithmetic:{positionMm:0}}},{...m,path:{...m.path,startVertex:{...m.path.startVertex,sourceFeatureId:'other'}}},{...m,orientation:{pitchYaw:'free',roll:m.orientation.roll}}])expect(()=>validateAssemblyMate(value)).toThrow()
 let calls=0;for(const target of ['position','path','orientation'] as const){const copy=structuredClone(m);Object.defineProperty(copy,target,{enumerable:true,get(){calls++;throw Error('Executable field')}});expect(()=>validateAssemblyMate(copy)).toThrow()}
 const nested=structuredClone(m);Object.defineProperty(nested.path.startVertex,'key',{enumerable:true,get(){calls++;return 'bad'}});expect(()=>validateAssemblyMate(nested)).toThrow();expect(calls).toBe(0)
})
it('distinguishes saved analytic purpose despite identical LINE/arc compound syntax',()=>{
 const m=arc(original()),line:AssemblyLinePathMate={...structuredClone(m),type:'line-path',position:{mode:'free'}}
 expect(isAssemblyPathEndpoint(m.path)).toBe(true);expect(isAssemblyLinePathEndpoint(m.path)).toBe(true) // legacy shape alias, no LINE authority
 expect(assemblyMatePathKind(m,'path')).toBe('circular-path');expect(assemblyMatePathKind(line,'path')).toBe('line-path');for(const side of ['point','up','first'] as const)expect(assemblyMatePathKind(m,side)).toBeNull()
 expect(validateAssemblyMate(line)).toEqual(line);expect(()=>validateAssemblyMate({...line,position:m.position})).toThrow()
})
it('rewrites an entire path atomically and preserves independent point and UP roles',()=>{
 const m=arc(original()),before=structuredClone(m),component={occurrencePath:['nested','renamed'],definition:{id:m.path.component.definition.id,revision:'r2'}},path=withAssemblyMateEndpointComponent(m.path,component)
 if(!isAssemblyPathEndpoint(path))throw Error('Compound required');path.edge.key='edge-v1|new-circular-boundary';path.startVertex.key='vertex-v1|'+'b'.repeat(64)
 const changed=withAssemblyMateEndpoint(m,'path',path);expect(changed.type).toBe('circular-path');if(changed.type!=='circular-path')throw Error('Circular required');expect(changed.path).toEqual(path);expect(changed.point).toEqual(m.point);expect(changed.orientation).toEqual(m.orientation);expect(m).toEqual(before)
 expect(()=>withAssemblyMateEndpoint(m,'path',{...path,startVertex:null} as never)).toThrow();expect(()=>withAssemblyMateEndpoint(m,'point',path)).toThrow();expect(()=>withAssemblyMateEndpoint(m,'first',m.point)).toThrow()
})
it('keeps binary guards positive and inspects every nested role without fake LINE support',()=>{
 const d=original(),group:EmbeddedAssemblyDefinition={kind:'assembly',id:'original-group',revision:'r1',name:'Original group',createdAt:d.createdAt,updatedAt:d.updatedAt,occurrences:structuredClone(d.occurrences),mates:structuredClone(d.mates)};d.definitions.push(group);d.mates=[];d.occurrences=['left','right'].map(id=>({id,name:id,definition:{id:group.id,revision:group.revision},pose:identityRigidPose(),fixed:false,visible:id!=='left',suppressed:id==='right'}))
 const inspected=inspectAssemblyMateReferences(d);expect(inspected.map(v=>v.scopePath)).toEqual([['left'],['right']]);for(const item of inspected){expect(isAssemblyBinaryMateInspection(item)).toBe(false);if(!isAssemblyCircularPathMateInspection(item))throw Error('Circular inspection required');expect('first'in item).toBe(false);expect(item.path.candidate?.path).toEqual([...item.scopePath,'b']);expect(item.up?.candidate?.path).toEqual([...item.scopePath,'g'])}
 if(!isAssemblyCircularPathMateInspection(inspected[1]))throw Error('Circular required');expect(inspected[1].path.diagnostics.map(v=>v.code)).toEqual(['SUPPRESSED_COMPONENT','SUPPRESSED_COMPONENT'])
})
it('retains intent through Edit, suppression, history, deletion and saved reopen',()=>{
 const d=original(),history=new AssemblyDocumentHistory(d),{id,...mate}=arc(d);history.commit({type:'update-mate',mateId:id,mate:{...mate,suppressed:true,position:{mode:'coordinate',distanceMm:1}}});const updated=history.current;expect(arc(updated).path).toEqual(arc(d).path);expect(arc(updated).suppressed).toBe(true);expect(history.undo()).toEqual(d);expect(history.redo()).toEqual(updated);expect(parseAssemblyDocument(serializeAssemblyDocument(updated))).toEqual(updated)
 const deleted=applyAssemblyEdit(d,{type:'delete-occurrence',occurrenceId:'b'}),item=inspectAssemblyMateReferences(deleted)[0];if(!isAssemblyCircularPathMateInspection(item))throw Error('Circular required');expect(item.path.diagnostics.map(v=>v.code)).toEqual(['MISSING_OCCURRENCE','MISSING_OCCURRENCE']);expect(deleted.mates).toEqual(d.mates)
})
for(const suppressed of [false,true])it('inventories and explicitly repairs all active/dormant source roles, suppressed='+suppressed,()=>{
 const d=original();arc(d).suppressed=suppressed;const dormant:EmbeddedAssemblyDefinition={kind:'assembly',id:'dormant',revision:'r1',name:'Dormant declarations',createdAt:d.createdAt,updatedAt:d.updatedAt,occurrences:structuredClone(d.occurrences),mates:structuredClone(d.mates)};d.definitions.push(dormant);const part=d.definitions[0];if(part.kind!=='part')throw Error('Part required');const before=structuredClone(d),plan=prepareAssemblyPartUpdate(d,{id:part.id,revision:part.revision},part.document,'r2')
 expect(plan.endpoints.map(e=>e.locator.side)).toEqual(['point','path','up','point','path','up']);expect(plan.occurrences).toHaveLength(6)
 let repaired=plan.document;for(const endpoint of plan.endpoints){const owner=assemblyMateEndpointComponent(endpoint.endpoint);if(!owner)throw Error('Original material role requires owner');const component={...owner,occurrencePath:[...owner.occurrencePath],definition:{id:part.id,revision:'r2'}};const reference=withAssemblyMateEndpointComponent(endpoint.endpoint,component);repaired=repairAssemblyEndpoint(repaired,endpoint.locator,reference)}
 expect(arc(repaired).path.component.definition.revision).toBe('r2');expect(arc(repaired).suppressed).toBe(suppressed);expect(parseAssemblyDocument(serializeAssemblyDocument(repaired))).toEqual(repaired);expect(d).toEqual(before)
})
it('keeps selected and all-use replacement roles explicit without retaining compound topology',()=>{
 const d=original(),part=d.definitions[0];if(part.kind!=='part')throw Error('Part required');const request={component:arc(d).path.component,part:{...part.document,id:'original-replacement-sector'},revision:'r2',ancestorRevisions:[]}
 const selected=prepareAssemblyPartReplacement(d,{...request,mode:'selected'}),all=prepareAssemblyPartReplacement(d,{...request,mode:'all'});expect(selected.endpoints.map(e=>e.locator.side)).toEqual(['path']);expect(selected.endpoints[0].retainFrame).toBe(false);expect(all.endpoints.map(e=>e.locator.side)).toEqual(['point','path','up']);expect(all.endpoints.every(e=>!e.retainFrame)).toBe(true);expect(arc(all.document).path).toEqual(arc(d).path)
})
it('captures all renamed descendant path/point/UP boundaries in a v2 update without invented matches',()=>{
 const d=original(),part=d.definitions[0],nested:EmbeddedAssemblyDefinition={kind:'assembly',id:'nested-source',revision:'r1',name:'Original nested sector group',createdAt:d.createdAt,updatedAt:d.updatedAt,occurrences:structuredClone(d.occurrences),mates:[]};d.definitions.push(nested);d.occurrences=[{id:'outer',name:'Outer',definition:{id:nested.id,revision:nested.revision},pose:identityRigidPose(),fixed:false,visible:true,suppressed:false}]
 const m=arc(d);m.point.component.occurrencePath.unshift('outer');m.path.component.occurrencePath.unshift('outer');if(m.orientation.roll==='free')throw Error('UP required');m.orientation.roll.guide.component.occurrencePath.unshift('outer')
 const incoming=validateAssemblyDocument({version:2,kind:'assembly',id:nested.id,revision:'r2',name:'Original renamed update',units:'mm',createdAt:d.createdAt,updatedAt:d.updatedAt,definitions:[part],occurrences:nested.occurrences.map(v=>({...v,id:v.id+'-new'})),mates:[]}),plan=prepareAssemblyDocumentUpdate(d,{id:nested.id,revision:'r1'},incoming)
 expect(plan.endpoints.map(e=>e.locator.side)).toEqual(['point','path','up']);expect(plan.endpoints.map(e=>e.suffix)).toEqual([['a'],['b'],['g']]);expect(plan.endpoints.every(e=>e.status==='needs-repair'&&e.afterResolution==='missing-path'&&e.desiredComponent===undefined)).toBe(true);expect(plan.capturedMates).toEqual([])
})

for(const repeated of [true,false])it('permits actual shared owner declarations without assuming distinct rigid variables '+repeated,()=>{
 const d=original(),m=arc(d);m.path.component.occurrencePath=['a'];if(m.orientation.roll==='free')throw Error('UP required');m.orientation.roll.guide.component.occurrencePath=[repeated?'a':'g'];const copied=validateAssemblyDocument(d),inspection=inspectAssemblyMateReferences(copied)[0]
 expect(assemblyMateEndpoints(arc(copied)).map(e=>e.side)).toEqual(['point','path','up']);if(!isAssemblyCircularPathMateInspection(inspection))throw Error('Circular required');expect(inspection.path.candidate?.path).toEqual(['a']);expect(inspection.point.candidate?.path).toEqual(['a']);expect(inspection.up?.candidate?.path).toEqual([repeated?'a':'g']);expect(inspection.path.diagnostics).toEqual([])
})
it('clones only the selected reused ancestor while leaving sibling circular intent unchanged',()=>{
 const d=original(),part=d.definitions[0];if(part.kind!=='part')throw Error('Part required');const group:EmbeddedAssemblyDefinition={kind:'assembly',id:'reused-circular',revision:'r1',name:'Original reused circular declaration',createdAt:d.createdAt,updatedAt:d.updatedAt,occurrences:structuredClone(d.occurrences),mates:structuredClone(d.mates)};d.definitions.push(group);d.mates=[];d.occurrences=['left','right'].map(id=>({id,name:id,definition:{id:group.id,revision:group.revision},pose:identityRigidPose(),fixed:false,suppressed:false,visible:true}))
 const before=structuredClone(d),plan=prepareAssemblyPartReplacement(d,{component:{occurrencePath:['left','b'],definition:{id:part.id,revision:part.revision}},mode:'selected',part:{...part.document,id:'new-selected-sector'},revision:'r2',ancestorRevisions:['left-r2']})
 expect(plan.scopeMap).toHaveLength(1);expect(plan.endpoints.map(e=>e.locator.side)).toEqual(['path']);expect(plan.endpoints[0].locator.scope).toEqual({id:group.id,revision:'left-r2'});expect(plan.endpoints[0].retainFrame).toBe(false);expect(plan.document.occurrences[1]).toEqual(d.occurrences[1]);const sibling=plan.document.definitions.find(v=>v.id===group.id&&v.revision==='r1');expect(sibling).toEqual(group);expect(d).toEqual(before)
})
it('rejects sparse nested component paths and keeps material body/source declarations exact',()=>{
 const m=arc(original()),sparse=structuredClone(m);delete sparse.path.component.occurrencePath[0];expect(()=>validateAssemblyMate(sparse)).toThrow();expect(()=>validateAssemblyMate({...m,path:{...m.path,body:{bodyId:'sector',sourceFeatureId:'other'}}})).toThrow();const legacy=validateAssemblyMate({...m,path:{...m.path,body:null}});expect(legacy.type==='circular-path'&&legacy.path.body).toBeNull()
})
