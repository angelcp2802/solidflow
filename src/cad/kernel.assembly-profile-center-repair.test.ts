import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, type AssemblyFaceSelection } from './kernel.assembly-snapshot'
import { isResolvedAssemblyProfileCenterMate } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { reviewAssemblyDocumentSourceUpdate, prepareAssemblyDocumentUpdateDecisions } from './kernel.assembly-document-updates'
import { assemblyProfileCenterCatalogChoices } from './kernel.assembly-document-update-types'
import { reviewAssemblyReplacement, prepareAssemblyReplacementDecisions } from './kernel.assembly-replacement'
import { CadEngine } from './kernel.engine'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const stamp = '2026-10-22T00:00:00.000Z'
// Original tracked-source recipes: 4x6x4 prism, radius-2 depth-4 cylinder.
function original(circle = false, centerX = 2): AssemblyDocument {
  const part = (id: string, disk: boolean) => ({ kind: 'part', id, revision: 'r1', document: { version: 1, id, name: id, units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: disk ? { kind: 'circle', center: [5, 6], radius: 2 } : { kind: 'rectangle', center: [centerX, 3], width: 4, height: 6 } },
    { id: 'solid', name: 'Original solid', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } },
  ] } })
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original ordered profile measurements', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [part('box', false), ...(circle ? [part('disk', true)] : [])], occurrences: ['a', 'b'].map((id, i) => ({ id, name: id, definition: { id: i && circle ? 'disk' : 'box', revision: 'r1' }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })), mates: [] })
}
function top(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, path: string[]): AssemblyFaceSelection {
  for (const selection of snapshot.listFaces(doc, path)) {
    try {
      const w = snapshot.resolveReference(doc, { ...selection, kind: 'face', support: 'plane' })
      if (w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[2] > .99) return selection
    } catch (error) { if (!(error instanceof Error) || !error.message.includes('no coincide')) throw error }
  }
  throw Error('Original native +Z cap missing')
}
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-10)
const vector = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => near(v, b[i]))
function selected(doc: AssemblyDocument, rectangle: boolean) {
 const snapshot=new AssemblyGeometrySnapshot(doc)
 try{return ['a','b'].map(id=>{const face=top(snapshot,doc,[id]);if(!rectangle)return{face,axis:null};const row=buildAssemblyScene(doc).bodies.find(b=>b.component.occurrencePath[0]===id)!;for(const edge of row.edges??[]){const w=snapshot.resolveReference(doc,{...edge.selection,kind:'edge',support:'line'});if(w.kind==='support'&&w.localSupport.kind==='line'&&Math.abs(w.localSupport.point[2]-4)<1e-10&&Math.abs(w.localSupport.axis[0])>.99)return{face,axis:{edge:edge.selection.edge,sense:1 as const}}}throw Error('Boundary missing')})}finally{snapshot.dispose()}
}
function saved(rectangle: boolean) {
 const doc=original(!rectangle)
 if(!rectangle){const part=doc.definitions[0];if(part.kind!=='part')throw Error('Expected part');const sketch=part.document.features[0];if(sketch.type!=='sketch')throw Error('Expected sketch');sketch.profile={kind:'circle',center:[2,3],radius:2}}
 const [first,second]=selected(doc,rectangle)
 return validateAssemblyDocument({...doc,mates:[{id:'pc',name:'Original saved profile',suppressed:false,type:'profile-center',first,second,alignment:'aligned',offsetMm:0,orientation:rectangle?{mode:'rectangle',quarterTurns:0}:{mode:'free'}}]})
}
it.each([false,true])('resolves saved profiles through their dedicated fresh proof purpose, rectangle=%s',rectangle=>{
 const doc=saved(rectangle),snapshot=new AssemblyGeometrySnapshot(doc),before=JSON.stringify(doc)
 const query=vi.spyOn(snapshot,rectangle?'resolveProfileAxisSelection':'resolveProfileFaceSelection')
 try{const resolved=snapshot.resolveActiveMates(doc);expect(resolved).toHaveLength(1);expect(isResolvedAssemblyProfileCenterMate(resolved[0])).toBe(true);const mate=resolved[0];if(!isResolvedAssemblyProfileCenterMate(mate))throw Error('Expected dedicated resolved family');expect(query).toHaveBeenCalledTimes(2);expect(mate.first.kind).toBe(rectangle?'profile-axis':'profile');snapshot.assertMateWitness(mate.first,doc);expect(()=>snapshot.assertWitness(mate.first as never,doc)).toThrow();snapshot.resolveActiveMates(doc);expect(query).toHaveBeenCalledTimes(4);expect(JSON.stringify(doc)).toBe(before)}finally{query.mockRestore();snapshot.dispose()}
})
it('rejects a mathematically measurable mixed pair in the saved native free family',()=>{
 const doc=original(true),[first,second]=selected(doc,false);doc.mates=[{id:'mixed',name:'Explicit unsupported mixed',suppressed:false,type:'profile-center',first,second,alignment:'aligned',offsetMm:0,orientation:{mode:'free'}}]
 const snapshot=new AssemblyGeometrySnapshot(doc);try{expect(()=>snapshot.resolveActiveMates(doc)).toThrow(/discos/)}finally{snapshot.dispose()}
})
it('never retains a compound profile by an ordinary semantic plane shortcut during source update',()=>{
 const doc=saved(true),part=doc.definitions[0];if(part.kind!=='part')throw Error('Expected part');const replacement=structuredClone(part.document);replacement.name='Changed original recipe'
 const review=reviewAssemblyPartSourceUpdate(doc,{id:part.id,revision:part.revision},replacement,'r2')
 expect(review.endpoints).toHaveLength(2);expect(review.endpoints.every(e=>e.status==='needs-repair')).toBe(true)
 expect(review.endpoints.map(e=>e.locator.side)).toEqual(['first','second']);expect(doc.definitions[0].revision).toBe('r1')
})
it('requires a current joint material boundary when a selected replacement repairs a compound role',()=>{
 const doc=saved(true),part=doc.definitions[0];if(part.kind!=='part')throw Error('Expected part')
 const incoming={...structuredClone(part.document),id:'replacement-box',name:'Original replacement box'}
 const prepared=reviewAssemblyReplacement(doc,{component:{occurrencePath:['b'],definition:{id:part.id,revision:part.revision}},mode:'selected',part:incoming,revision:'r2',ancestorRevisions:[]})
 expect(prepared.review.endpoints).toHaveLength(1);const endpoint=prepared.review.endpoints[0]
 const copy=structuredClone(doc.mates[0]);if(copy.type!=='profile-center'||copy.second.axis===null)throw Error('Expected compound')
 // The actual replacement catalog supplies current keys; a bottom boundary is
 // not incident to the independently selected top face, even on the same body.
 const body=prepared.review.replacementCatalog.bodies[0],face=body.faces.find(f=>f.support?.kind==='plane'&&f.support.normal[2]>.99)!
 const wrong=body.edges!.find(e=>e.support?.kind==='line'&&Math.abs(e.support.point[2])<1e-10&&Math.abs(e.support.axis[0])>.99)!
 const reference={face:{...structuredClone(face.selection),component:structuredClone(endpoint.desiredComponent)},axis:{edge:structuredClone(wrong.selection.edge),sense:1 as const}}
 expect(()=>prepareAssemblyReplacementDecisions(prepared.plan,prepared.review,{repairs:[{locator:endpoint.locator,reference}],removed:[],recapture:[]})).toThrow()
 const good=body.edges!.find(e=>e.support?.kind==='line'&&Math.abs(e.support.point[2]-4)<1e-10&&Math.abs(e.support.axis[0])>.99)!
 const valid={...reference,axis:{edge:structuredClone(good.selection.edge),sense:1 as const}}
 const repaired=prepareAssemblyReplacementDecisions(prepared.plan,prepared.review,{repairs:[{locator:endpoint.locator,reference:valid}],removed:[],recapture:[]})
 const snapshot=new AssemblyGeometrySnapshot(repaired.proposal)
 try{const mates=snapshot.resolveActiveMates(repaired.proposal);expect(mates).toHaveLength(1);expect(isResolvedAssemblyProfileCenterMate(mates[0])).toBe(true)}finally{snapshot.dispose()}
 expect(doc.mates).toHaveLength(1)
})
it('keeps distinct repeated nested owner paths while sharing only prototype geometry',()=>{
 const inner=saved(true),{version:_version,units:_units,definitions,...nested}=inner
 const doc=validateAssemblyDocument({...inner,id:'outer-root',definitions:[...definitions,nested],mates:[],occurrences:['left','right'].map((id,i)=>({id,name:id,definition:{id:nested.id,revision:nested.revision},pose:{translation:[i*20,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}))})
 const snapshot=new AssemblyGeometrySnapshot(doc),query=vi.spyOn(snapshot,'resolveProfileAxisSelection')
 try{const mates=snapshot.resolveActiveMates(doc);expect(mates).toHaveLength(2);expect(query).toHaveBeenCalledTimes(4);expect(mates.map(m=>m.scopePath)).toEqual([['left'],['right']]);for(const m of mates){if(!isResolvedAssemblyProfileCenterMate(m))throw Error('Expected profile');expect(m.first.componentPath).toEqual([...m.scopePath,'a']);expect(m.second.componentPath).toEqual([...m.scopePath,'b'])}}
 finally{query.mockRestore();snapshot.dispose()}
 const part=definitions[0];if(part.kind!=='part')throw Error('Expected part');const review=reviewAssemblyPartSourceUpdate(doc,{id:part.id,revision:part.revision},part.document,'r2');expect(review.endpoints).toHaveLength(2);expect(review.endpoints.every(e=>e.status==='needs-repair')).toBe(true)
})

it('repairs renamed descendants atomically inside an updated assembly boundary with current joint proofs',()=>{
 const base=saved(true),parentMate=structuredClone(base.mates[0]);if(parentMate.type!=='profile-center')throw Error('Expected profile')
 const {version:_v,units:_u,definitions,...source}=base;source.mates=[]
 parentMate.first.face.component.occurrencePath=['nested','a'];parentMate.second.face.component.occurrencePath=['nested','b']
 const outer=validateAssemblyDocument({...base,id:'host',definitions:[...definitions,source],occurrences:[{id:'nested',name:'Original nested source',definition:{id:source.id,revision:source.revision},pose:identityRigidPose(),fixed:false,visible:true,suppressed:false}],mates:[parentMate]})
 const incoming=validateAssemblyDocument({...base,revision:'r2',mates:[],occurrences:base.occurrences.map(c=>({...c,id:'new-'+c.id}))})
 const review=reviewAssemblyDocumentSourceUpdate(outer,{id:source.id,revision:source.revision},incoming)
 expect(review.plan.endpoints).toHaveLength(2)
 const repairs=review.plan.endpoints.map(e=>{const id=e.locator.side==='first'?'new-a':'new-b',body=review.review.replacementCatalog.bodies.find(b=>b.component.occurrencePath[0]===id)!
 const face=body.faces.find(f=>f.support?.kind==='plane'&&f.support.normal[2]>.99)!,edge=body.edges!.find(e=>e.support?.kind==='line'&&Math.abs(e.support.point[2]-4)<1e-10&&Math.abs(e.support.axis[0])>.99)!
 return{locator:e.locator,reference:{face:{...structuredClone(face.selection),component:{...structuredClone(face.selection.component),occurrencePath:['nested',id]}},axis:{edge:structuredClone(edge.selection.edge),sense:1 as const}}}})
 const result=prepareAssemblyDocumentUpdateDecisions(review.plan,review.catalog,review.review,{repairs,removed:[],recapture:[],unlocked:[]})
 const snapshot=new AssemblyGeometrySnapshot(result.proposal)
 try{const resolved=snapshot.resolveActiveMates(result.proposal);expect(resolved).toHaveLength(1);if(!isResolvedAssemblyProfileCenterMate(resolved[0]))throw Error('Expected profile');expect(resolved[0].first.componentPath).toEqual(['nested','new-a']);expect(resolved[0].second.componentPath).toEqual(['nested','new-b'])}finally{snapshot.dispose()}
})
it('bounds unsuccessful compound catalog work as well as emitted candidates',()=>{
 const scene=buildAssemblyScene(original()),body=scene.bodies[0],edge=body.edges![0]
 // These detached display entries intentionally supply no successful native
 // proof; the test checks a renderer-safe enumeration denial-of-service cap.
 body.edges=Array.from({length:16384},()=>({...structuredClone(edge),support:null}))
 expect(()=>assemblyProfileCenterCatalogChoices(scene,true)).toThrow(/presupuesto/)
})
