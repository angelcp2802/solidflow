import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC} from 'replicad'
import {beforeAll,it,expect} from 'vitest'
import {validateAssemblyDocument,type AssemblyDocument} from '../model/assemblyDocument'
import {identityRigidPose} from '../model/rigidPose'
import {AssemblyGeometrySnapshot,isResolvedAssemblyLinePathMate} from './kernel.assembly-snapshot'
import {buildAssemblyScene} from './kernel.assembly-scene'
import {reviewAssemblyPartSourceUpdate} from './kernel.assembly-source-updates'
import {reviewAssemblyReplacement,prepareAssemblyReplacementDecisions} from './kernel.assembly-replacement'
import {assemblyLinePathCatalogChoices} from './kernel.assembly-document-update-types'
beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60000)
const stamp='2026-10-22T00:00:00.000Z'
function original():AssemblyDocument{
 const part={kind:'part',id:'box',revision:'r1',document:{version:1,id:'box',name:'Original material line repair',units:'mm',createdAt:stamp,updatedAt:stamp,features:[{id:'profile',name:'Original rectangle',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[0,0],width:4,height:6}},{id:'solid',name:'Original prism',type:'extrude',sketchId:'profile',depth:4,symmetric:false,suppressed:false,bodyOperation:{mode:'new',bodyId:'body'}}]}}
 const doc=validateAssemblyDocument({version:2,kind:'assembly',id:'root',revision:'r1',name:'Material path repair',units:'mm',createdAt:stamp,updatedAt:stamp,definitions:[part],occurrences:['a','b'].map(id=>({id,name:id,definition:{id:'box',revision:'r1'},pose:identityRigidPose(),fixed:false,visible:true,suppressed:false})),mates:[]})
 const scene=buildAssemblyScene(doc),a=scene.bodies.find(b=>b.component.occurrencePath[0]==='a')!,b=scene.bodies.find(b=>b.component.occurrencePath[0]==='b')!,point=a.vertexPoints!.find(v=>v.point.every((x,i)=>x===[-2,-3,4][i]))!,edge=b.edges!.find(e=>e.support?.kind==='line'&&Math.abs(e.support.axis[0])>.99&&e.support.point[1]===-3&&e.support.point[2]===4)!,start=b.vertexPoints!.find(v=>v.point.every((x,i)=>x===[-2,-3,4][i]))!
 return validateAssemblyDocument({...doc,mates:[{id:'path',name:'Material path',type:'line-path',suppressed:false,point:{kind:'vertex',...point.selection,support:'point'},path:{...edge.selection,startVertex:start.selection.vertex},position:{mode:'free'},orientation:{pitchYaw:'free',roll:'free'}}]})
}
it('keeps source-update material roles explicit across repeated nested namespaces, including suppressed roles',()=>{
 const base=original(),part=base.definitions[0];if(part.kind!=='part')throw Error('Expected part');const {version:_v,units:_u,definitions,...nested}=base;nested.mates[0].suppressed=true
 const doc=validateAssemblyDocument({...base,id:'host',definitions:[...definitions,nested],mates:[],occurrences:['left','right'].map((id,i)=>({id,name:id,definition:{id:nested.id,revision:nested.revision},pose:{translation:[i*20,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}))}),before=JSON.stringify(doc)
 const review=reviewAssemblyPartSourceUpdate(doc,{id:part.id,revision:part.revision},part.document,'r2')
 expect(review.endpoints.map(e=>e.locator.side)).toEqual(['point','path']);expect(review.endpoints.every(e=>e.status==='needs-repair')).toBe(true);expect(review.occurrences).toHaveLength(2);expect(JSON.stringify(doc)).toBe(before)
})
it('rejects atomic path replacement with a same-body nonendpoint, then verifies current complete repaired native roles',()=>{
 const doc=original(),part=doc.definitions[0];if(part.kind!=='part')throw Error('Expected part');const before=JSON.stringify(doc),incoming={...structuredClone(part.document),id:'new-box',name:'Original replacement material line'}
 const prepared=reviewAssemblyReplacement(doc,{component:{occurrencePath:['b'],definition:{id:part.id,revision:part.revision}},mode:'selected',part:incoming,revision:'r2',ancestorRevisions:[]})
 expect(prepared.review.endpoints).toHaveLength(1);const endpoint=prepared.review.endpoints[0];expect(endpoint.locator.side).toBe('path');expect(endpoint.status).toBe('needs-repair')
 const body=prepared.review.replacementCatalog.bodies[0],edge=body.edges!.find(e=>e.support?.kind==='line'&&Math.abs(e.support.axis[0])>.99&&e.support.point[1]===-3&&e.support.point[2]===4)!,good=body.vertexPoints!.find(v=>v.point.every((x,i)=>x===[-2,-3,4][i]))!,wrong=body.vertexPoints!.find(v=>v.point[1]===3)!
 const reference={...structuredClone(edge.selection),component:structuredClone(endpoint.desiredComponent),startVertex:structuredClone(wrong.selection.vertex)}
 expect(()=>prepareAssemblyReplacementDecisions(prepared.plan,prepared.review,{repairs:[{locator:endpoint.locator,reference}],removed:[],recapture:[]})).toThrow(/exact endpoint/)
 const repaired=prepareAssemblyReplacementDecisions(prepared.plan,prepared.review,{repairs:[{locator:endpoint.locator,reference:{...reference,startVertex:good.selection.vertex}}],removed:[],recapture:[]}),snapshot=new AssemblyGeometrySnapshot(repaired.proposal)
 try{const resolved=snapshot.resolveActiveMates(repaired.proposal);expect(resolved).toHaveLength(1);if(!isResolvedAssemblyLinePathMate(resolved[0]))throw Error('Expected material line');expect(resolved[0].first.componentPath).toEqual(['a']);expect(resolved[0].second.componentPath).toEqual(['b']);expect(resolved[0].second.localCurve.startPoint).toEqual([-2,-3,4]);expect(resolved[0].second.localCurve.lengthMm).toBe(4)}finally{snapshot.dispose()}
 const scene=buildAssemblyScene(repaired.proposal);expect(scene.bodies).toHaveLength(2);expect(scene.bodies.reduce((s,b)=>s+b.volume,0)).toBeCloseTo(192,8);expect(scene.bodies.reduce((s,b)=>s+b.area,0)).toBeCloseTo(256,8);expect(JSON.stringify(doc)).toBe(before)
})
it('catalog candidates remain atomic declarations and do not turn same coordinates into endpoint proof',()=>{
 const doc=original(),scene=buildAssemblyScene(doc),choices=assemblyLinePathCatalogChoices(scene);expect(choices.length).toBeGreaterThan(0);expect(new Set(choices.map(c=>c.key)).size).toBe(choices.length)
 const invalid=choices.find(c=>{const body=scene.bodies.find(b=>JSON.stringify(b.component)===JSON.stringify(c.reference.component))!,v=body.vertexPoints!.find(v=>v.selection.vertex.key===c.reference.startVertex.key)!,e=body.edges!.find(e=>e.selection.edge.key===c.reference.edge.key)!;return e.support?.kind==='line'&&Math.abs(e.support.axis[0])>.99&&Math.abs(v.point[1]-e.support.point[1])>1})!
 expect(invalid).toBeDefined();const snapshot=new AssemblyGeometrySnapshot(doc);try{expect(()=>snapshot.resolveLinePathSelection(doc,invalid.reference)).toThrow(/exact endpoint/)}finally{snapshot.dispose()}
})
