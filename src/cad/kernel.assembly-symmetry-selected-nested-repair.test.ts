// Original analytic prisms and current native material references. No mesh vertices or fabricated native witnesses.
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { validateAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type AssemblyVertexReference, type AssemblyPlaneReference, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { validateDocument } from '../model/document'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { type AssemblyReplacementDecisions, replacementScope } from './kernel.assembly-replacement'
import type { AssemblyPreviewReply } from './kernel.assembly-types'
// Each case builds and verifies several native scenes. Keep a bounded CAD
// transaction budget; these correctness checks are not performance benchmarks.
const NATIVE_TRANSACTION_TIMEOUT = 15_000
beforeAll(async()=>{
 setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))}))
},60_000)
const empty=():AssemblyReplacementDecisions=>({repairs:[],removed:[],recapture:[]})
function ready(v:AssemblyPreviewReply){expect(v.status).toBe('ready');if(v.status!=='ready')throw Error('Ready required');return v}
function vertex(s:AssemblyGeometrySnapshot,d:AssemblyDocument,path:string[],local:number[]):AssemblyVertexReference{
 const matches=s.listVertices(d,path).map(selection=>({kind:'vertex' as const,...selection,support:'point' as const})).filter(ref=>{
  const p=s.resolveVertexReference(d,ref).localSupport.point;return p.every((x,i)=>Math.abs(x-local[i])<=1e-12)
 });expect(matches).toHaveLength(1);return matches[0]
}
function mirror(s:AssemblyGeometrySnapshot,d:AssemblyDocument):AssemblyPlaneReference{
 const matches=s.listFaces(d,['left','inner','mirror']).map(selection=>({kind:'face' as const,...selection,support:'plane' as const})).filter(ref=>{
  // Other planar prism faces are supported, so this inspects current native geometry.
  const w=s.resolveReference(d,ref);return w.kind==='support'&&w.localSupport.kind==='plane'&&Math.abs(w.localSupport.point[0])<=1e-12&&w.localSupport.normal[0]<-.999
 });expect(matches).toHaveLength(1);return matches[0]
}
function relative<T extends AssemblyVertexReference|AssemblyPlaneReference>(ref:T):T{
 const result=structuredClone(ref);if(!result.component)throw Error('Native owner required');result.component.occurrencePath=result.component.occurrencePath.slice(2);return result
}
function pointOracles(d:AssemblyDocument,expectedByRoot:Record<string,number[]>){
 const snapshot=new AssemblyGeometrySnapshot(d)
 try { for(const [rootId,expected] of Object.entries(expectedByRoot)) {
  const root=d.occurrences.find(o=>o.id===rootId);if(!root)throw Error('Root occurrence required')
  const outer=replacementScope(d,root.definition),nested=outer.occurrences.find(o=>o.id==='inner');if(!nested)throw Error('Inner occurrence required')
  const inner=replacementScope(d,nested.definition),m=inner.mates.find(m=>m.id==='nested-point')
  if(m?.type!=='symmetry'||m.entityKind!=='point'||m.target.kind!=='vertex')throw Error('Current point declaration required')
  const w=snapshot.resolveVertexReference(d,m.target,[rootId,'inner'])
  w.worldSupport.point.forEach((x,i)=>expect(Math.abs(x-expected[i])).toBeLessThanOrEqual(1e-6))
 } } finally {snapshot.dispose()}
}
async function createReplacementFixture(){
 const input=validateAssemblyDocument(JSON.parse(await readFile(new URL('./fixtures/assembly-symmetry-nested-repair-original.json',import.meta.url),'utf8')))
 const snapshot=new AssemblyGeometrySnapshot(input)
 try{
  const refs={source:relative(vertex(snapshot,input,['left','inner','source'],[4,6,4])),target:relative(vertex(snapshot,input,['left','inner','target'],[0,6,4])),mirror:relative(mirror(snapshot,input))}
  const inner=input.definitions.find(x=>x.kind==='assembly'&&x.id==='symmetry-nested-inner'&&x.revision==='r1') as EmbeddedAssemblyDefinition
  inner.mates=[{id:'nested-point',name:'Original material point reflection',type:'symmetry',entityKind:'point',alignment:null,suppressed:false,...refs}]
 }finally{snapshot.dispose()}
 const session=new AssemblyWorkerSession()
 try {
 const current=session.apply(input,ready(session.prepare(input)).token).document
 const before=serializeAssemblyDocument(current), oldInner=structuredClone(replacementScope(current,{id:'symmetry-nested-inner',revision:'r1'})),oldOuter=structuredClone(replacementScope(current,{id:'symmetry-nested-outer',revision:'r1'}))
 const replacement=validateDocument(JSON.parse(await readFile(new URL('./fixtures/assembly-symmetry-nested-repair-replacement-part-original.json',import.meta.url),'utf8')))
 const source=current.definitions.find(x=>x.kind==='part')!
 const review=session.reviewReplacement(current,{component:{occurrencePath:['left','inner','source'],definition:{id:source.id,revision:source.revision}},mode:'selected',part:replacement,revision:'replacement-r1',ancestorRevisions:['selected-outer','selected-inner']})
 const pending=review.endpoints.filter(x=>x.status==='needs-repair');expect(pending).toHaveLength(1)
 expect(pending[0].locator).toEqual({scope:{id:'symmetry-nested-inner',revision:'selected-inner'},mateId:'nested-point',side:'source'})
 const row=review.replacementCatalog.bodies.flatMap(b=>b.vertexPoints??[]).filter(v=>v.point.every((x,i)=>Math.abs(x-[8,6,8][i])<=1e-12))
 expect(row).toHaveLength(1)
 const correct:AssemblyReplacementDecisions={...empty(),repairs:[{locator:pending[0].locator,reference:{kind:'vertex',...structuredClone(row[0].selection),component:pending[0].desiredComponent,support:'point'}}]}
 return {session,current,before,oldInner,oldOuter,source,review,correct}
 } catch(error) {session.discard();throw error}
}
async function withReplacementFixture(run:(fixture:Awaited<ReturnType<typeof createReplacementFixture>>)=>void){
 const fixture=await createReplacementFixture()
 try {run(fixture)} finally {fixture.session.discard()}
}
it('isolates a source-only material-point replacement through two ancestor clones with fresh native geometry',async()=>{
 await withReplacementFixture(({session,current,oldInner,oldOuter,review,correct})=>{
 pointOracles(current,{left:[-43,11,6],right:[37,11,6]})
 expect('token'in review).toBe(false)
 expect(review.scopeMap).toEqual([
  {beforeScope:{id:'symmetry-nested-outer',revision:'r1'},afterScope:{id:'symmetry-nested-outer',revision:'selected-outer'},scopePath:['left']},
  {beforeScope:{id:'symmetry-nested-inner',revision:'r1'},afterScope:{id:'symmetry-nested-inner',revision:'selected-inner'},scopePath:['left','inner']},
 ])
 expect(review.expandedPaths).toEqual([['left','inner','source']]);expect(review.occurrences).toHaveLength(1)
 const valid=ready(session.previewReplacement(current,review.reviewId,correct))
 for(const body of valid.scene.bodies) expect(Math.abs(Math.hypot(...body.worldPose.rotation)-1)).toBeLessThanOrEqual(1e-10)
 expect(valid.scene.solidCount).toBe(6);expect(Math.abs(valid.scene.volume-864)).toBeLessThanOrEqual(1e-5);expect(Math.abs(valid.scene.area-960)).toBeLessThanOrEqual(1e-5)
 const applied=session.apply(current,valid.token).document
 expect(replacementScope(applied,{id:'symmetry-nested-inner',revision:'r1'})).toEqual(oldInner)
 expect(replacementScope(applied,{id:'symmetry-nested-outer',revision:'r1'})).toEqual(oldOuter)
 expect(applied.occurrences.filter(o=>o.id!=='left')).toEqual(current.occurrences.filter(o=>o.id!=='left'))
 const cloned=replacementScope(applied,{id:'symmetry-nested-inner',revision:'selected-inner'}),m=cloned.mates[0],old=oldInner.mates[0]
 if(m.type!=='symmetry'||old.type!=='symmetry')throw Error('Symmetry declarations required')
 expect(m.target).toEqual(old.target);expect(m.mirror).toEqual(old.mirror);expect(m.source.component!.definition).toEqual(review.replacement)
 pointOracles(applied,{left:[-43,7,10],right:[37,11,6]})
 })
}, NATIVE_TRANSACTION_TIMEOUT)
it('rejects wrong-scope and stale point repairs without publishing authority and revokes the previous ready token',async()=>{
 await withReplacementFixture(({session,current,before,source,review,correct})=>{
 expect('token'in review).toBe(false)
 expect(()=>session.previewReplacement(current,review.reviewId,empty())).toThrow()
 expect(serializeAssemblyDocument(current)).toBe(before)
 const candidate=ready(session.previewReplacement(current,review.reviewId,correct))
 for(const variant of ['original-scope','wrong-owner','original-part'] as const){
  const bad=structuredClone(correct)
  if(variant==='original-scope')bad.repairs[0].locator.scope={id:'symmetry-nested-inner',revision:'r1'}
  else {const ref=bad.repairs[0].reference;if(!('kind'in ref)||ref.kind!=='vertex')throw Error('Point repair required')
   if(variant==='wrong-owner')ref.component.occurrencePath=['right','inner','source']
   else ref.component.definition={id:source.id,revision:source.revision}
  }
  expect(()=>session.previewReplacement(current,review.reviewId,bad)).toThrow()
  expect(serializeAssemblyDocument(current)).toBe(before)
 }
 expect(()=>session.apply(current,candidate.token)).toThrow(/disponible/)
 const retried=ready(session.previewReplacement(current,review.reviewId,correct))
 expect(serializeAssemblyDocument(current)).toBe(before)
 const applied=session.apply(current,retried.token)
 // Apply owns the document timestamp; geometry, declarations and references remain the authenticated proposal.
 expect({...applied.document,updatedAt:retried.document.updatedAt}).toEqual(retried.document)
 expect(typeof applied.document.updatedAt).toBe('string')
 expect(Number.isFinite(Date.parse(applied.document.updatedAt))).toBe(true)
 expect(serializeAssemblyDocument(current)).toBe(before)
 expect(()=>session.apply(current,retried.token)).toThrow(/disponible/)
 })
}, NATIVE_TRANSACTION_TIMEOUT)
