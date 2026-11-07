import { expect, it } from 'vitest'
import { createAssemblyRootRevision } from './assemblyRevisions'
import { createEmptyAssembly } from '../examples/assembly'
import { validateAssemblyDocument, serializeAssemblyDocument, parseAssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { identityRigidPose } from './rigidPose'
import { AssemblyDocumentHistory } from './assemblyEditing'
import original from '../cad/fixtures/assembly-material-arc-original.json'
// Original declaration-only graph examples; opaque topology is not native proof.
function fixture() {
 const d=validateAssemblyDocument(original);d.id='revision-root';d.revision='r0'
 const root={id:d.id,revision:d.revision}, owner={occurrencePath:['root-use'],definition:root}
 const plane={kind:'principal-plane' as const,component:owner,plane:'XY' as const}
 const dormant:EmbeddedAssemblyDefinition={kind:'assembly',id:'dormant-holder',revision:'h0',name:'Original dormant holder',createdAt:d.createdAt,updatedAt:d.updatedAt,
 sourceLink:{kind:'local-file',displayName:'Original.solidflow',contentSha256:'a'.repeat(64)},
 occurrences:[{id:'root-use',name:'Root use',definition:root,pose:identityRigidPose(),fixed:false,visible:false,suppressed:true}],mates:[
 {id:'width',name:'Ordered planes',type:'width',mode:'centered',suppressed:true,width:[plane,plane],tab:[plane,plane],widthBranch:'sum',tabBranch:'difference',alignment:'aligned'},
 {id:'symmetry',name:'Original planes',type:'symmetry',entityKind:'plane',suppressed:false,source:plane,target:plane,mirror:plane,alignment:'opposed'},
 {id:'capture',name:'Original capture',type:'lock',suppressed:true,first:owner,second:owner,relativePose:identityRigidPose()}]}
 d.definitions.push(dormant);return validateAssemblyDocument(d)
}
it('rekeys all dormant/suppressed occurrence and grouped endpoint roles while preserving captures, null frames and metadata',()=>{
 const d=fixture(),before=structuredClone(d),next=createAssemblyRootRevision(d,'r1'),holder=next.definitions.at(-1) as EmbeddedAssemblyDefinition
 expect(next.revision).toBe('r1');expect(Date.parse(next.updatedAt)).toBeGreaterThan(Date.parse(d.updatedAt));expect(holder.occurrences[0].definition).toEqual({id:d.id,revision:'r1'})
 const expected=JSON.parse(JSON.stringify(before.definitions.at(-1)).replaceAll('"revision":"r0"','"revision":"r1"'))
 expect(holder).toEqual(expected);expect(next.occurrences).toEqual(d.occurrences);expect(d).toEqual(before)
 expect(parseAssemblyDocument(serializeAssemblyDocument(next))).toEqual(next)
 const h=new AssemblyDocumentHistory(d);h.commitDocument(next);expect(h.undo()).toEqual(d);expect(h.redo()).toEqual(next)
})
it('preserves stale root labels and all non-root historical tuples rather than repairing by name',()=>{
 const d=fixture(),holder=d.definitions.at(-1) as EmbeddedAssemblyDefinition
 holder.mates.push({id:'stale',name:'Stale label',type:'parallel',suppressed:false,alignment:'aligned',first:{kind:'principal-plane',component:{occurrencePath:['missing'],definition:{id:d.id,revision:d.revision}},plane:'XY'},second:{kind:'principal-plane',component:null,plane:'XY'}})
 const historical={...structuredClone(holder),id:d.id,revision:'historical',occurrences:[],mates:[]};d.definitions.push(historical)
 const next=createAssemblyRootRevision(d,'r1'),after=next.definitions.find(v=>v.id===holder.id) as EmbeddedAssemblyDefinition
 expect(after.mates.at(-1)).toEqual(holder.mates.at(-1));expect(next.definitions.at(-1)).toEqual(historical)
 expect(()=>createAssemblyRootRevision(d,'historical')).toThrow(/existe/)
})
it('rejects old or malformed labels and executable documents without invoking getters or mutating input',()=>{
 const d=fixture(),before=structuredClone(d)
 for(const revision of ['', ' ', 'x\n', 'x'.repeat(129),d.revision,undefined,null,{}])expect(()=>createAssemblyRootRevision(d,revision as string)).toThrow()
 let calls=0;const evil=structuredClone(d);Object.defineProperty(evil,'revision',{enumerable:true,get(){calls++;return 'r0'}})
 expect(()=>createAssemblyRootRevision(evil,'r1')).toThrow();expect(calls).toBe(0);expect(d).toEqual(before)
})
it('changes an empty root without adding a historical cache or implicit source link',()=>{
 const d=createEmptyAssembly('Original empty revision graph'),next=createAssemblyRootRevision(d,'explicit-original-revision')
 expect(next.definitions).toEqual([]);expect(Object.hasOwn(next,'sourceLink')).toBe(false);expect(next.id).toBe(d.id)
})
it('preserves compound topology and stale root claims without promoting point/path/profile roles to assembly geometry',()=>{
 const d=fixture(),holder=d.definitions.at(-1) as EmbeddedAssemblyDefinition,component={occurrencePath:['root-use'],definition:{id:d.id,revision:d.revision}},body={bodyId:'original',sourceFeatureId:'solid'},vertex={sourceFeatureId:'solid',key:'vertex-v1|'+'b'.repeat(64)},face={component,body,face:{sourceFeatureId:'solid',key:'original-face'}},edge={sourceFeatureId:'solid',key:'edge-v1|original-edge'}
 holder.mates.push({id:'profile',name:'Original stale profile',type:'profile-center',suppressed:true,first:{face,axis:{edge,sense:1}},second:{face,axis:{edge,sense:-1}},alignment:'opposed',offsetMm:3,orientation:{mode:'rectangle',quarterTurns:1}},
 {id:'path',name:'Original stale path',type:'line-path',suppressed:true,point:{kind:'vertex',component,body,vertex,support:'point'},path:{component,body,edge,startVertex:vertex},position:{mode:'free'},orientation:{pitchYaw:{mode:'follow',axis:'x',reverse:false},roll:{mode:'up',axis:'y',reverse:true,guide:{kind:'face',...face,support:'plane'}}}})
 const next=createAssemblyRootRevision(d,'r1'),h=next.definitions.at(-1) as EmbeddedAssemblyDefinition
 // Root resolves, but material geometry requires a part: do not rekey
 // these stale terminal labels or mint native evidence.
 for(const mate of h.mates.slice(-2))expect(JSON.stringify(mate)).toContain('"revision":"r0"')
 expect(h.mates.slice(-2)).toEqual(holder.mates.slice(-2))
})

it('withholds a detached revision exceeding the existing pretty saved-byte budget',()=>{
 const d=createEmptyAssembly('Original revision byte-boundary declarations'),p={kind:'principal-plane' as const,plane:'XY' as const,component:{occurrencePath:Array.from({length:32},()=> 'original-component'),definition:{id:'unresolved-original',revision:'r0'}}}
 d.mates=Array.from({length:4000},(_,i)=>({id:'original-'+i,name:'Original unresolved byte-boundary planes',type:'width',mode:'centered',suppressed:true,width:[p,p],tab:[p,p],widthBranch:'sum',tabBranch:'difference',alignment:'aligned'}))
 const revision=d.revision
 expect(()=>validateAssemblyDocument(d)).not.toThrow()
 expect(()=>createAssemblyRootRevision(d,'new-original')).toThrow('serializado supera los 20 MB');expect(d.revision).toBe(revision)
},60_000)
