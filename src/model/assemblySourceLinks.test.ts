import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import fixture from '../cad/fixtures/assembly-material-arc-original.json'
import {validateAssemblyDocument,parseAssemblyDocument,serializeAssemblyDocument,type AssemblyDocument,type AssemblySourceLink,type EmbeddedAssemblyDefinition} from './assemblyDocument'
import {setAssemblySourceLink,validateAssemblySourceLink} from './assemblySourceLinks'
import {insertAssemblyDocument} from './assemblyImport'
import {prepareAssemblyPartUpdate} from './assemblySourceUpdates'
import {prepareAssemblyDocumentUpdate} from './assemblySubassemblyUpdates'
import {prepareAssemblyPartReplacement} from './assemblyReplacement'
import {identityRigidPose} from './rigidPose'
// Original sector source recipe is tracked separately. Digests here identify
// original test-owned byte strings, never filesystem grants or geometry proof.
const link=(displayName='Original sector.solidflow',bytes='original source bytes\n'):AssemblySourceLink=>({kind:'local-file',displayName,contentSha256:createHash('sha256').update(bytes).digest('hex')})
function original(){
 const d=validateAssemblyDocument(fixture),part=d.definitions[0],group:EmbeddedAssemblyDefinition={kind:'assembly',id:'original-group',revision:'r1',name:'Original reused group',createdAt:d.createdAt,updatedAt:d.updatedAt,occurrences:structuredClone(d.occurrences),mates:[]}
 d.definitions.push(group);d.occurrences=['left','right'].map(id=>({id,name:id,definition:{id:group.id,revision:group.revision},pose:identityRigidPose(),fixed:false,visible:true,suppressed:id==='right'}));return validateAssemblyDocument(d)
}
const ref=(d:AssemblyDocument,index=0)=>({id:d.definitions[index].id,revision:d.definitions[index].revision})
function empty(){const d=original();d.id='original-destination';d.revision='r0';d.definitions=[];d.occurrences=[];return validateAssemblyDocument(d)}
for(const index of [0,1])it('roundtrips detached optional provenance on embedded kind '+index,()=>{
 const d=original(),before=structuredClone(d),value=link(index?'Original group.SOLIDFLOW':undefined),attached=setAssemblySourceLink(d,ref(d,index),value)
 expect(attached.definitions[index].sourceLink).toEqual(value);expect(attached.definitions[index].sourceLink).not.toBe(value);expect(parseAssemblyDocument(serializeAssemblyDocument(attached))).toEqual(attached);const removed=setAssemblySourceLink(attached,ref(attached,index),null);expect(removed).toEqual(before);expect(d).toEqual(before);expect(attached.occurrences).toEqual(before.occurrences);expect(attached.mates).toEqual(before.mates)
})
it('retains exact opaque file bytes provenance rather than treating its hash as cache geometry authority',()=>{
 const a=link('Original.solidflow','{"a":1}'),b=link('Original.solidflow','{ "a": 1 }');expect(a.contentSha256).not.toBe(b.contentSha256);const d=original(),first=setAssemblySourceLink(d,ref(d),a),second=setAssemblySourceLink(d,ref(d),b);if(first.definitions[0].kind!=='part'||second.definitions[0].kind!=='part')throw Error('Part required');expect(first.definitions[0].document).toEqual(second.definitions[0].document);expect(first.definitions[0].sourceLink).not.toEqual(second.definitions[0].sourceLink)
})
it('rejects sourceLink on the root and forbids wrong/stale/extra definition addresses',()=>{
 const d=original();expect(()=>validateAssemblyDocument({...d,sourceLink:link()})).toThrow();for(const r of [{id:d.id,revision:d.revision},{...ref(d),revision:'stale'},{...ref(d),path:'forbidden'}])expect(()=>setAssemblySourceLink(d,r,link())).toThrow()
 let calls=0;const r={...ref(d)};Object.defineProperty(r,'id',{enumerable:true,get(){calls++;return 'bad'}});expect(()=>setAssemblySourceLink(d,r,link())).toThrow();expect(calls).toBe(0)
})
it('rejects paths, control characters, invalid digests and metadata authority fields',()=>{
 for(const displayName of ['.solidflow','../original.solidflow','folder/original.solidflow','folder\\original.solidflow','C:original.solidflow','/original.solidflow','Original.solidflow\n','Original\u0000.solidflow','Original\u202e.solidflow','Original.solidflow ',' original.solidflow','Original.step','x'.repeat(246)+'.solidflow'])expect(()=>validateAssemblySourceLink({...link(),displayName})).toThrow()
 for(const contentSha256 of ['A'.repeat(64),'a'.repeat(63),'a'.repeat(64)+'\n','z'.repeat(64)])expect(()=>validateAssemblySourceLink({...link(),contentSha256})).toThrow()
 for(const extra of [{path:'/forbidden'},{grant:'forbidden'},{kind:'remote-file'},{url:'https://invalid.example'}])expect(()=>validateAssemblySourceLink({...link(),...extra})).toThrow()
})
it('rejects missing/undefined/accessor/prototype descriptors without executing them',()=>{
 let calls=0;for(const key of ['kind','displayName','contentSha256'] as const){const value=link();Object.defineProperty(value,key,{enumerable:true,get(){calls++;throw Error('Accessor')}});expect(()=>validateAssemblySourceLink(value)).toThrow();const d=original();Object.assign(d.definitions[0],{sourceLink:value});expect(()=>validateAssemblyDocument(d)).toThrow()}
 expect(()=>validateAssemblySourceLink({...link(),displayName:undefined})).toThrow();expect(()=>validateAssemblySourceLink(Object.assign(Object.create({inherited:true}),link()))).toThrow();expect(calls).toBe(0)
 const d=original();Object.defineProperty(d.definitions[1],'sourceLink',{enumerable:true,get(){calls++;throw Error('Descriptor')}});expect(()=>validateAssemblyDocument(d)).toThrow();expect(calls).toBe(0)
})
it('preserves imported nested/dormant/reused cache provenance and rejects conflicting exact tuples',()=>{
 let source=original();source=setAssemblySourceLink(source,ref(source),link());source=setAssemblySourceLink(source,ref(source,1),link('Original group.solidflow'));const imported=insertAssemblyDocument(empty(),source)
 expect(imported.definitions.find(v=>v.id===source.definitions[0].id)?.sourceLink).toEqual(link());expect(imported.definitions.find(v=>v.id===source.definitions[1].id)?.sourceLink).toEqual(link('Original group.solidflow'));const again=insertAssemblyDocument(imported,source);expect(again.definitions).toEqual(imported.definitions);expect(again.occurrences).toHaveLength(2)
 const conflicting=setAssemblySourceLink(source,ref(source),link('Different original.solidflow'));expect(()=>insertAssemblyDocument(imported,conflicting)).toThrow(/contenido distinto/)
})
for(const explicit of [false,true])it('updates a part cache atomically and clears the stale link unless supplied '+explicit,()=>{
 const d=original(),old=setAssemblySourceLink(d,ref(d),link()),part=old.definitions[0];if(part.kind!=='part')throw Error('Part required');const nextLink=link('Updated original.solidflow','new original bytes')
 const plan=prepareAssemblyPartUpdate(old,ref(old),part.document,'r2',explicit?nextLink:undefined),replacement=plan.document.definitions.find(v=>v.id===part.id&&v.revision==='r2')!
 expect(replacement.sourceLink).toEqual(explicit?nextLink:undefined);expect(plan.document.definitions.find(v=>v.id===part.id&&v.revision==='r1')?.sourceLink).toEqual(link());expect(plan.occurrences).toHaveLength(2);expect(old.definitions[0].sourceLink).toEqual(link());expect(parseAssemblyDocument(serializeAssemblyDocument(plan.document))).toEqual(plan.document)
})
for(const explicit of [false,true])it('updates complete v2 source with explicit outer provenance while preserving dependency links '+explicit,()=>{
 let d=original();d=setAssemblySourceLink(d,ref(d),link());d=setAssemblySourceLink(d,ref(d,1),link('Historical group.solidflow'));const part=d.definitions[0],group=d.definitions[1];if(group.kind!=='assembly')throw Error('Group required')
 const incoming=validateAssemblyDocument({version:2,kind:'assembly',id:group.id,revision:'r2',name:'Original updated group',units:'mm',createdAt:d.createdAt,updatedAt:d.updatedAt,definitions:[part],occurrences:structuredClone(group.occurrences),mates:[]}),nextLink=link('Updated group.solidflow','updated group bytes')
 const plan=prepareAssemblyDocumentUpdate(d,ref(d,1),incoming,explicit?nextLink:undefined),next=plan.document.definitions.find(v=>v.id===group.id&&v.revision==='r2')!
 expect(next.sourceLink).toEqual(explicit?nextLink:undefined);expect(plan.document.definitions.find(v=>v.id===group.id&&v.revision==='r1')?.sourceLink).toEqual(link('Historical group.solidflow'));expect(plan.document.definitions.find(v=>v.id===part.id)?.sourceLink).toEqual(link());expect(plan.occurrences).toHaveLength(2);expect(parseAssemblyDocument(serializeAssemblyDocument(plan.document))).toEqual(plan.document)
})
for(const mode of ['selected','all'] as const)it('preserves unaffected provenance and COW ancestor metadata through '+mode+' replacement',()=>{
 let d=original();d=setAssemblySourceLink(d,ref(d),link());d=setAssemblySourceLink(d,ref(d,1),link('Original group.solidflow'));const part=d.definitions[0];if(part.kind!=='part')throw Error('Part required');const plan=prepareAssemblyPartReplacement(d,{component:{occurrencePath:['left','a'],definition:ref(d)},mode,part:{...part.document,id:'replacement-original-part'},revision:'r2',ancestorRevisions:mode==='selected'?['selected-r2']:[]})
 expect(plan.document.definitions.find(v=>v.id===part.id)?.sourceLink).toEqual(link());const originalGroup=plan.document.definitions.find(v=>v.id==='original-group'&&v.revision==='r1');expect(originalGroup?.sourceLink).toEqual(link('Original group.solidflow'));if(mode==='selected')expect(plan.document.definitions.find(v=>v.id==='original-group'&&v.revision==='selected-r2')?.sourceLink).toEqual(link('Original group.solidflow'));expect(plan.document.definitions.find(v=>v.id==='replacement-original-part')?.sourceLink).toBeUndefined()
})
it('rejects executable new update provenance before a proposal can escape',()=>{
 const d=original(),part=d.definitions[0];if(part.kind!=='part')throw Error('Part required');let calls=0;const value=link();Object.defineProperty(value,'contentSha256',{enumerable:true,get(){calls++;throw Error('Getter')}});expect(()=>prepareAssemblyPartUpdate(d,ref(d),part.document,'r2',value)).toThrow();expect(calls).toBe(0);expect(d.definitions).toHaveLength(2)
})
