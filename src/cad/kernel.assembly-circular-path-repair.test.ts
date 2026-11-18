import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import fixture from './fixtures/assembly-material-arc-original.json'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyCircularPathMate } from '../model/assemblyDocument'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { assemblyMateEndpointComponent, type AssemblyMateEndpointReference } from '../model/assemblyMateEndpoints'
import { identityRigidPose } from '../model/rigidPose'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyScene, type AssemblySceneBody } from './kernel.assembly-types'
import { AssemblyGeometrySnapshot, isResolvedAssemblyCircularPathMate } from './kernel.assembly-snapshot'
import { assemblyCircularPathCatalogChoices, assemblyLinePathCatalogChoices, assemblyDocumentUpdateReferenceKey, assemblyDocumentUpdateChoices } from './kernel.assembly-document-update-types'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { reviewAssemblyReplacement, prepareAssemblyReplacementDecisions } from './kernel.assembly-replacement'
import { reviewAssemblyDocumentSourceUpdate, prepareAssemblyDocumentUpdateDecisions } from './kernel.assembly-document-updates'
import { assemblyReplacementChoices } from '../components/AssemblyReplacementPanel'
import { assemblySourceRepairChoices } from '../components/AssemblySourceUpdatePanel'
import { CadEngine } from './kernel.engine'

beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60_000)
const same=(a:readonly number[],b:readonly number[])=>a.every((v,i)=>Math.abs(v-b[i])<1e-10)
const point=(body:AssemblySceneBody,p:number[])=>body.vertexPoints!.find(v=>same(v.point,p))!
function arc(scene:AssemblyScene,body:AssemblySceneBody){
 const start=point(body,[5,-2,4])
 return assemblyCircularPathCatalogChoices(scene).find(c=>JSON.stringify(c.reference.component)===JSON.stringify(body.component)&&c.reference.startVertex.key===start.selection.vertex.key)!.reference
}
function role(scene:AssemblyScene,body:AssemblySceneBody,side:string):AssemblyMateEndpointReference{
 if(side==='path')return arc(scene,body)
 if(side==='point')return {kind:'vertex',...structuredClone(point(body,[3,-2,4]).selection),support:'point'}
 const guide=body.faces.find(f=>f.support?.kind==='plane'&&f.support.normal[2]>.999&&Math.abs(f.support.point[2]-4)<1e-10)!
 const reference=assemblySceneFaceReference(guide);if(!reference||reference.support!=='plane')throw Error('Original upper plane required');return reference
}
function original(){
 const d=validateAssemblyDocument(fixture),scene=buildAssemblyScene(d),a=scene.bodies.find(b=>b.component.occurrencePath[0]==='a')!,b=scene.bodies.find(b=>b.component.occurrencePath[0]==='b')!
 d.mates=[{id:'arc',name:'Original circular repair',type:'circular-path',suppressed:false,point:role(scene,b,'point'),path:arc(scene,a),position:{mode:'free',domain:'trim'},orientation:{pitchYaw:{mode:'follow',axis:'x',reverse:false},roll:{mode:'up',axis:'z',reverse:false,guide:role(scene,a,'up')}}} as AssemblyCircularPathMate]
 return validateAssemblyDocument(d)
}
function geometry(d:AssemblyDocument,solids=2){const scene=buildAssemblyScene(d);expect(scene.solidCount).toBe(solids);expect(Math.abs(scene.volume-solids*4*Math.PI)).toBeLessThan(1e-5);expect(Math.abs(scene.area-solids*(6*Math.PI+16))).toBeLessThan(1e-5);return scene}
function resolved(d:AssemblyDocument){const snapshot=new AssemblyGeometrySnapshot(d);try{const r=snapshot.resolveActiveMates(d);expect(r).toHaveLength(1);expect(isResolvedAssemblyCircularPathMate(r[0])).toBe(true);if(!isResolvedAssemblyCircularPathMate(r[0]))throw Error('Current circular purpose required');expect(r[0].second.kind).toBe('arc-path');expect(same(r[0].second.localCurve.startPoint,[5,-2,4])).toBe(true);expect(r[0].up?.kind).toBe('support');snapshot.assertMateWitness(r[0].second,d);const second=r[0].second;expect(()=>snapshot.assertLinePathWitness(second as never,d)).toThrow()}finally{snapshot.dispose()}}

it('publishes exact native circular material endpoints, distinct purpose keys and no LINE substitution',()=>{
 const d=original(),scene=geometry(d),choices=assemblyCircularPathCatalogChoices(scene)
 expect(choices).toHaveLength(8);expect(new Set(choices.map(c=>c.key)).size).toBe(8)
 const snapshot=new AssemblyGeometrySnapshot(d)
 try{for(const choice of choices){const w=snapshot.resolveArcPathSelection(d,choice.reference);expect(w.localCurve.kind).toBe('circle');expect(w.localCurve.closed).toBe(false);expect(same(w.localCurve.materialFrame.normal,[0,0,1])||same(w.localCurve.materialFrame.normal,[0,0,-1])).toBe(true);expect(assemblyDocumentUpdateReferenceKey(choice.reference,'line-path')).not.toBe(choice.key)}}finally{snapshot.dispose()}
 const line=assemblyLinePathCatalogChoices(scene)[0],wrong=new AssemblyGeometrySnapshot(d)
 try{expect(()=>wrong.resolveArcPathSelection(d,line.reference)).toThrow()}finally{wrong.dispose()}
 resolved(d)
})
it('requires positive current circle/endpoint metadata rather than absence of a LINE hint or matching mesh coordinates',()=>{
 const scene=geometry(original()),without=structuredClone(scene)
 for(const b of without.bodies)for(const e of b.edges??[])delete e.circularPathOrigins
 expect(assemblyCircularPathCatalogChoices(without)).toEqual([])
 const foreign=structuredClone(scene);for(const b of foreign.bodies)for(const e of b.edges??[])if(e.circularPathOrigins)e.selection.component.occurrencePath=['foreign']
 expect(assemblyCircularPathCatalogChoices(foreign)).toEqual([])
 const repeated=structuredClone(scene),edge=repeated.bodies[0].edges!.find(e=>e.circularPathOrigins)!
 edge.circularPathOrigins![1]=structuredClone(edge.circularPathOrigins![0]);expect(()=>assemblyCircularPathCatalogChoices(repeated)).toThrow(/ambigua/)
})
it('does not repair a saved LINE family using a current native circular compound with the same syntactic shape',()=>{
 const d=original(),m=d.mates[0] as AssemblyCircularPathMate,part=d.definitions[0];if(part.kind!=='part')throw Error('Original part required')
 d.mates=[{...m,type:'line-path',position:{mode:'free'}}]
 const prepared=reviewAssemblyReplacement(d,{component:m.path.component,mode:'selected',part:{...structuredClone(part.document),id:'original-line-purpose-control'},revision:'r2',ancestorRevisions:[]}),review=prepared.review,body=review.replacementCatalog.bodies[0]
 const repairs=review.endpoints.map(endpoint=>{const reference=role(review.replacementCatalog,body,endpoint.locator.side),owner=assemblyMateEndpointComponent(reference)!;owner.occurrencePath=[...endpoint.desiredComponent.occurrencePath];owner.definition={...endpoint.desiredComponent.definition};return {locator:endpoint.locator,reference}})
 expect(()=>prepareAssemblyReplacementDecisions(prepared.plan,review,{repairs,removed:[],recapture:[]})).toThrow(/LINE/)
})
it('propagates a real circular origin catalog query failure without returning a partial scene',()=>{
 const d=original(),query=CadEngine.prototype.inspectCurrentArcPathOrigins
 const spy=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPathOrigins').mockImplementation(function(this:CadEngine,...args){query.apply(this,args);throw Error('Original catalog fault after real query')})
 try{expect(()=>buildAssemblyScene(d)).toThrow(/catalog fault/)}finally{spy.mockRestore()}
 geometry(d)
})
it('requires explicit point/path/UP source repairs, including suppressed declarations, with current circular choices',()=>{
 const d=original();d.mates[0].suppressed=true
 const part=d.definitions[0];if(part.kind!=='part')throw Error('Original part required');const before=structuredClone(d)
 const review=reviewAssemblyPartSourceUpdate(d,{id:part.id,revision:part.revision},part.document,'r2')
 expect(review.endpoints.map(e=>e.locator.side)).toEqual(['point','path','up']);expect(review.endpoints.every(e=>e.status==='needs-repair')).toBe(true)
 let proposal=review.document
 for(const endpoint of review.endpoints){const owner=assemblyMateEndpointComponent(endpoint.endpoint)!,body=review.scene.bodies.find(b=>JSON.stringify(b.component.occurrencePath)===JSON.stringify(owner.occurrencePath))!,reference=role(review.scene,body,endpoint.locator.side),key=assemblyDocumentUpdateReferenceKey(reference,endpoint.locator.side==='path'?'circular-path':null);expect(assemblySourceRepairChoices(review,proposal,endpoint).map(c=>assemblyDocumentUpdateReferenceKey(c.reference,endpoint.locator.side==='path'?'circular-path':null)),endpoint.locator.side).toContain(key);proposal=repairAssemblyEndpoint(proposal,endpoint.locator,reference)}
 proposal.mates[0].suppressed=false;resolved(proposal);geometry(proposal);expect(d).toEqual(before)
})
for(const mode of ['selected','all'] as const)it('jointly authenticates '+mode+' replacement roles, rejecting same-shape LINE and nonendpoint substitutions',()=>{
 const d=original(),part=d.definitions[0];if(part.kind!=='part')throw Error('Original part required');const before=structuredClone(d)
 const prepared=reviewAssemblyReplacement(d,{component:(d.mates[0] as AssemblyCircularPathMate).path.component,mode,part:{...structuredClone(part.document),id:'original-circular-replacement'},revision:'r2',ancestorRevisions:[]}),review=prepared.review
 expect(review.endpoints.map(e=>e.locator.side)).toEqual(mode==='selected'?['path','up']:['point','path','up'])
 const body=review.replacementCatalog.bodies[0],repairs=review.endpoints.map(endpoint=>{const reference=role(review.replacementCatalog,body,endpoint.locator.side),owner=assemblyMateEndpointComponent(reference)!;owner.occurrencePath=[...endpoint.desiredComponent.occurrencePath];owner.definition={...endpoint.desiredComponent.definition};const key=assemblyDocumentUpdateReferenceKey(reference,endpoint.locator.side==='path'?'circular-path':null);expect(assemblyReplacementChoices(review,endpoint).map(c=>assemblyDocumentUpdateReferenceKey(c.reference,endpoint.locator.side==='path'?'circular-path':null)),endpoint.locator.side).toContain(key);return {locator:endpoint.locator,reference}})
 expect(()=>prepareAssemblyReplacementDecisions(prepared.plan,review,{repairs:repairs.slice(0,-1),removed:[],recapture:[]})).toThrow(/pendientes/)
 const index=repairs.findIndex(r=>r.locator.side==='path'),line=assemblyLinePathCatalogChoices(review.replacementCatalog)[0].reference,wrongLine=structuredClone(repairs);wrongLine[index].reference={...line,component:structuredClone(review.endpoints.find(e=>e.locator.side==='path')!.desiredComponent)}
 expect(()=>prepareAssemblyReplacementDecisions(prepared.plan,review,{repairs:wrongLine,removed:[],recapture:[]})).toThrow()
 const nonendpoint=structuredClone(repairs);nonendpoint[index].reference={...nonendpoint[index].reference,startVertex:point(body,[3,-2,4]).selection.vertex} as AssemblyMateEndpointReference
 expect(()=>prepareAssemblyReplacementDecisions(prepared.plan,review,{repairs:nonendpoint,removed:[],recapture:[]})).toThrow()
 const repaired=prepareAssemblyReplacementDecisions(prepared.plan,review,{repairs,removed:[],recapture:[]});resolved(repaired.proposal);geometry(repaired.proposal);expect(d).toEqual(before)
})
it('repairs all renamed nested v2 point/path/UP boundaries with circular-purpose keys and actual native verification',()=>{
 const d=original(),part=d.definitions[0],group={kind:'assembly' as const,id:'original-sector-group',revision:'r1',name:'Original group',createdAt:d.createdAt,updatedAt:d.updatedAt,occurrences:structuredClone(d.occurrences),mates:[]}
 d.definitions.push(group);d.occurrences=[{id:'outer',name:'Outer',definition:{id:group.id,revision:group.revision},pose:identityRigidPose(),fixed:false,visible:true,suppressed:false}]
 const m=d.mates[0] as AssemblyCircularPathMate;m.point.component.occurrencePath.unshift('outer');m.path.component.occurrencePath.unshift('outer');if(m.orientation.roll==='free')throw Error('UP required');m.orientation.roll.guide.component.occurrencePath.unshift('outer')
 const incoming=validateAssemblyDocument({version:2,kind:'assembly',id:group.id,revision:'r2',name:'Original renamed group',units:'mm',createdAt:d.createdAt,updatedAt:d.updatedAt,definitions:[part],mates:[],occurrences:group.occurrences.map(o=>({...o,id:'new-'+o.id}))})
 const prepared=reviewAssemblyDocumentSourceUpdate(d,{id:group.id,revision:'r1'},incoming),review=prepared.review
 expect(review.endpoints.map(e=>e.locator.side)).toEqual(['point','path','up'])
 const repairs=review.endpoints.map(endpoint=>{const name=endpoint.locator.side==='point'?'new-b':'new-a',body=review.replacementCatalog.bodies.find(b=>b.component.occurrencePath[0]===name)!,reference=role(review.replacementCatalog,body,endpoint.locator.side),owner=assemblyMateEndpointComponent(reference)!;owner.occurrencePath=['outer',...owner.occurrencePath];const key=assemblyDocumentUpdateReferenceKey(reference,endpoint.locator.side==='path'?'circular-path':null);expect(assemblyDocumentUpdateChoices(review,endpoint).some(c=>c.key===key)).toBe(true);return {locator:endpoint.locator,reference}})
 expect(()=>prepareAssemblyDocumentUpdateDecisions(prepared.plan,prepared.catalog,review,{repairs:repairs.slice(0,2),removed:[],recapture:[],unlocked:[]})).toThrow(/pendientes/)
 const repaired=prepareAssemblyDocumentUpdateDecisions(prepared.plan,prepared.catalog,review,{repairs,removed:[],recapture:[],unlocked:[]});resolved(repaired.proposal);geometry(repaired.proposal)
})
