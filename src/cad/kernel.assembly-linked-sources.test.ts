import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { validateDocument } from '../model/document'
import { parseCadDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblySourceLink, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { setAssemblySourceLink } from '../model/assemblySourceLinks'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyPreviewReply, type AssemblyScene } from './kernel.assembly-types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)

// Original GPL-3.0-only prisms, authored here. Two translated copies of
// [0,w]x[0,3]x[0,4]: w2 gives V48/A104; w3 gives V72/A132.
// Bounds are literal analytic coordinates, independent of the CAD solver.
const stamp = '2026-10-22T00:00:00.000Z', old = {id:'linked-prism',revision:'r0'}
const link: AssemblySourceLink = {kind:'local-file',displayName:'original-prism.solidflow',contentSha256:'a'.repeat(64)}
function part(width = 2) {
  return validateDocument({version:1,id:old.id,name:'Original linked prism',units:'mm',createdAt:stamp,updatedAt:stamp,features:[
    {id:'profile',name:'Original rectangle',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[width/2,1.5],width,height:3}},
    {id:'solid',name:'Original 4 mm extrusion',type:'extrude',sketchId:'profile',depth:4,symmetric:false,suppressed:false,bodyOperation:{mode:'new',bodyId:'prism'}}]})
}
function fixture() {
  const d=createEmptyAssembly('Original linked-source parent')
  d.definitions=[{kind:'part',...old,document:part()}]
  d.occurrences=[-10,20].map((x,i)=>({id:i?'right':'left',name:i?'Right':'Left',definition:{...old},pose:{...identityRigidPose(),translation:[x,0,0] as [number,number,number]},fixed:true,visible:true,suppressed:false}))
  return validateAssemblyDocument(d)
}
function ready(value:AssemblyPreviewReply) {
  expect(value.status,value.status==='rejected'?value.message:'').toBe('ready')
  if(value.status!=='ready')throw Error(value.message)
  return value
}
function geometry(scene:AssemblyScene,width=3) {
  expect(scene.solidCount).toBe(2);expect(scene.bodies).toHaveLength(2)
  expect(scene.volume).toBeCloseTo(width===3?72:48,6);expect(scene.area).toBeCloseTo(width===3?132:104,6)
  scene.bounds!.min.forEach((v,i)=>expect(v).toBeCloseTo([-10,0,0][i],6))
  scene.bounds!.max.forEach((v,i)=>expect(v).toBeCloseTo([20+width,3,4][i],6))
}
function top(scene:AssemblyScene) {
  const faces=scene.bodies.filter(b=>b.component.occurrencePath[0]==='left').flatMap(b=>b.faces).filter(f=>f.worldSupport?.kind==='plane'&&f.worldSupport.normal[2]>.99)
  expect(faces).toHaveLength(1)
  const reference=assemblySceneFaceReference(faces[0]);if(reference?.support!=='plane')throw Error('Expected current native plane')
  return {...reference,support:'plane' as const}
}

it('applies the privately reviewed part cache and digest together, with history and an offline saved round trip',()=>{
  const d=fixture(),before=serializeAssemblyDocument(d),s=new AssemblyWorkerSession(),r=s.reviewPartUpdate(d,old,part(3),'r1',link)
  expect(r.reviewId).toBeTruthy();geometry(r.scene);expect(r.occurrences).toHaveLength(2)
  const p=ready(s.previewPartUpdate(d,r.reviewId!,r.document));geometry(p.scene)
  r.document.name='Changed report';p.document.definitions[1].sourceLink!.contentSha256='b'.repeat(64)
  const result=s.apply(d,p.token);geometry(result.scene)
  expect(result.document.definitions.find(x=>x.revision==='r1')?.sourceLink).toEqual(link)
  expect(serializeAssemblyDocument(d)).toBe(before)
  const h=new AssemblyDocumentHistory(d);h.commitDocument(result.document);expect(serializeAssemblyDocument(h.undo())).toBe(before)
  const reopened=parseCadDocument(serializeAssemblyDocument(h.redo()));if(reopened.version!==2)throw Error('Expected assembly')
  geometry(buildAssemblyScene(reopened));expect(JSON.stringify(reopened)).not.toMatch(/grantId|[A-Z]:\\/)
  expect(()=>s.apply(d,p.token)).toThrow(/disponible/)
},60_000)

it.each(['cache','digest','pose','name','definitions'] as const)('rejects a forged %s in a part review DTO and retains the original private plan',field=>{
  const d=fixture(),s=new AssemblyWorkerSession(),r=s.reviewPartUpdate(d,old,part(3),'r1',link),forged=structuredClone(r.document)
  if(field==='cache'){const p=forged.definitions[1];if(p.kind!=='part')throw Error('Expected part');p.document.name='Unreviewed cache'}
  else if(field==='digest')forged.definitions[1].sourceLink!.contentSha256='c'.repeat(64)
  else if(field==='pose')forged.occurrences[0].pose.translation[0]=999
  else if(field==='name')forged.name='Unreviewed parent'
  else forged.definitions.reverse()
  expect(()=>s.previewPartUpdate(d,r.reviewId!,forged)).toThrow(/privada/)
  const p=ready(s.previewPartUpdate(d,r.reviewId!,r.document));geometry(s.apply(d,p.token).scene)
},60_000)

it('permits only actual current repairs to the named endpoint and still runs native final verification',()=>{
  const d=fixture();d.mates.push({id:'top',name:'Original top parallel',type:'parallel',suppressed:false,alignment:'aligned',first:{kind:'principal-plane',component:null,plane:'XY'},second:top(buildAssemblyScene(d))})
  const s=new AssemblyWorkerSession(),r=s.reviewPartUpdate(d,old,part(3),'r1',link)
  expect(r.endpoints).toHaveLength(1);expect(r.endpoints[0].status).toBe('needs-repair')
  expect(()=>s.previewPartUpdate(d,r.reviewId!,r.document)).toThrow(/pendientes/)
  const proposal=repairAssemblyEndpoint(r.document,r.endpoints[0].locator,top(r.scene))
  const forged=structuredClone(proposal);const mate=forged.mates[0];if(mate.type!=='parallel')throw Error('Expected parallel');mate.alignment='opposed'
  expect(()=>s.previewPartUpdate(d,r.reviewId!,forged)).toThrow(/privada/)
  const p=ready(s.previewPartUpdate(d,r.reviewId!,proposal));expect(p.checks.every(c=>c.satisfied)).toBe(true);geometry(s.apply(d,p.token).scene)
},60_000)

it('targets cancellation without revoking a newer review and rejects base changes',()=>{
  const d=fixture(),s=new AssemblyWorkerSession(),first=s.reviewPartUpdate(d,old,part(3),'r1',link),r=s.reviewPartUpdate(d,old,part(3),'r2',link)
  expect(()=>s.previewPartUpdate(d,first.reviewId!,first.document)).toThrow(/disponible/)
  s.discardPartUpdate(first.reviewId);const p=ready(s.previewPartUpdate(d,r.reviewId!,r.document));s.discard(p.token)
  const changed=structuredClone(d);changed.name='Another base'
  expect(()=>s.previewPartUpdate(changed,r.reviewId!,r.document)).toThrow(/cambió/)
  expect(()=>s.previewPartUpdate(d,r.reviewId!,r.document)).toThrow(/disponible/)
  const latest=s.reviewPartUpdate(d,old,part(3),'r3',link);const preview=ready(s.previewPartUpdate(d,latest.reviewId!,latest.document));s.discardPartUpdate(latest.reviewId)
  expect(()=>s.apply(d,preview.token)).toThrow(/disponible/);geometry(buildAssemblyScene(d),2)
},60_000)

it('changes link metadata on an unchanged embedded cache through native preview and authenticated Apply',()=>{
  const d=fixture(),s=new AssemblyWorkerSession(),proposed=setAssemblySourceLink(d,old,link),p=ready(s.prepare(d,proposed));geometry(p.scene,2)
  const linked=s.apply(d,p.token).document;expect(linked.definitions[0].sourceLink).toEqual(link)
  const detached=s.apply(linked,ready(s.prepare(linked,setAssemblySourceLink(linked,old,null))).token).document
  expect(detached.definitions[0].sourceLink).toBeUndefined();geometry(buildAssemblyScene(detached),2)
},60_000)

it('retains subassembly cache and link together privately across two reused occurrences',()=>{
  const d=fixture(),source=createEmptyAssembly('Original reusable linked assembly');source.id='original-group';source.revision='g0';source.definitions=d.definitions;source.occurrences=[{...d.occurrences[0],pose:identityRigidPose()}]
  const {version:_v,units:_u,definitions:_defs,...node}=source
  const group:EmbeddedAssemblyDefinition=node,parent=createEmptyAssembly('Original group parent');parent.definitions=[...d.definitions,group];parent.occurrences=d.occurrences.map(o=>({...o,definition:{id:group.id,revision:group.revision}}))
  const incoming=structuredClone(source);incoming.revision='g1';incoming.definitions=[{kind:'part',id:old.id,revision:'r1',document:part(3)}];incoming.occurrences[0].definition={id:old.id,revision:'r1'}
  const s=new AssemblyWorkerSession(),r=s.reviewDocumentUpdate(parent,{id:group.id,revision:group.revision},incoming,link)
  const p=ready(s.previewDocumentUpdate(parent,r.reviewId,{repairs:[],removed:[],recapture:[],unlocked:[]}));geometry(p.scene)
  r.document.definitions.find(x=>x.id===group.id&&x.revision==='g1')!.sourceLink!.contentSha256='f'.repeat(64)
  p.document.name='Forged reply';const applied=s.apply(parent,p.token);geometry(applied.scene)
  expect(applied.document.definitions.find(x=>x.id===group.id&&x.revision==='g1')?.sourceLink).toEqual(link)
  expect(parent.definitions.find(x=>x.id===group.id)?.sourceLink).toBeUndefined()
},60_000)
