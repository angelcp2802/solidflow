import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import {setOC} from 'replicad'
import {beforeAll,expect,it,vi} from 'vitest'
import {createEmptyAssembly} from '../examples/assembly'
import {validateDocument} from '../model/document'
import {AssemblyDocumentHistory} from '../model/assemblyEditing'
import {parseAssemblyDocument,serializeAssemblyDocument,validateAssemblyDocument,type AssemblyDocument} from '../model/assemblyDocument'
import {identityRigidPose} from '../model/rigidPose'
import {AssemblyWorkerSession} from './kernel.assembly-session'
import {KernelDispatcher} from './kernel.dispatcher'
import type {AssemblyKernelRequest,AssemblyPreviewReply,AssemblyScene} from './kernel.assembly-types'
import * as scenes from './kernel.assembly-scene'

beforeAll(async()=>setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60_000)

// Original GPL-3.0-only prism [0,2]x[0,3]x[0,4]: V24/A52.
// Two authored translations -10/+20 give V48/A104 and literal bounds below.
const stamp='2026-10-23T00:00:00.000Z'
function original():AssemblyDocument {
  const d=createEmptyAssembly('Original source revision parent'),id='original-revision-material'
  d.definitions=[{kind:'part',id,revision:'r0',document:validateDocument({version:1,id,name:'Original revision prism',units:'mm',createdAt:stamp,updatedAt:stamp,features:[
    {id:'profile',name:'Original rectangle',type:'sketch',plane:'XY',offset:0,suppressed:false,profile:{kind:'rectangle',center:[1,1.5],width:2,height:3}},
    {id:'solid',name:'Original 4 mm extrusion',type:'extrude',sketchId:'profile',depth:4,symmetric:false,suppressed:false,bodyOperation:{mode:'new',bodyId:'material'}}]})}]
  d.occurrences=[-10,20].map((x,i)=>({id:i?'right':'left',name:i?'Right':'Left',definition:{id,revision:'r0'},pose:{...identityRigidPose(),translation:[x,0,0] as [number,number,number]},fixed:true,visible:true,suppressed:false}))
  return validateAssemblyDocument(d)
}
function ready(v:AssemblyPreviewReply) {expect(v.status,v.status==='rejected'?v.message:'').toBe('ready');if(v.status!=='ready')throw Error(v.message);return v}
function geometry(scene:AssemblyScene) {
  expect(scene.solidCount).toBe(2);expect(scene.volume).toBeCloseTo(48,6);expect(scene.area).toBeCloseTo(104,6)
  for(const [field,expected]of[['min',[-10,0,0]],['max',[22,3,4]]]as const)scene.bounds![field].forEach((v,i)=>expect(v).toBeCloseTo(expected[i],6))
}
it('privately constructs a fresh native root revision and commits only its exact candidate with history/reopening',()=>{
  const d=original(),s=new AssemblyWorkerSession(),before=serializeAssemblyDocument(d),p=ready(s.previewRootRevision(d,'source-r1'))
  geometry(p.scene);expect(p.document.revision).toBe('source-r1');expect(p.document.id).toBe(d.id);expect(p.document.definitions).toEqual(d.definitions)
  expect(p.document.occurrences).toEqual(d.occurrences);p.document.revision='forged';p.document.definitions=[];p.scene.volume=999
  const applied=s.apply(d,p.token);geometry(applied.scene);expect(applied.document.revision).toBe('source-r1');expect(applied.document.definitions).toEqual(d.definitions)
  expect(serializeAssemblyDocument(d)).toBe(before);const h=new AssemblyDocumentHistory(d);h.commitDocument(applied.document)
  expect(serializeAssemblyDocument(h.undo())).toBe(before);const reopened=parseAssemblyDocument(serializeAssemblyDocument(h.redo()));geometry(scenes.buildAssemblyScene(reopened))
  expect(()=>s.apply(d,p.token)).toThrow(/disponible/)
},60_000)
it('ignores a forged candidate payload because the actual worker action accepts only a revision label',()=>{
  const d=original(),dispatcher=new KernelDispatcher()
  try{
    const request={id:1,action:'preview-assembly-root-revision',current:d,revision:'source-r1',proposed:{...d,name:'Forged candidate',definitions:[]}} as AssemblyKernelRequest
    const p=dispatcher.handle(request);if(!p||typeof p!=='object'||!('kind'in p)||p.kind!=='assembly-preview')throw Error('Expected preview');const checked=ready(p)
    expect(checked.document.name).toBe(d.name);geometry(checked.scene)
    const applied=dispatcher.handle({id:2,action:'apply-assembly',current:d,token:checked.token});if(!applied||typeof applied!=='object'||!('kind'in applied)||applied.kind!=='assembly-applied')throw Error('Expected applied');geometry(applied.scene)
  }finally{dispatcher.dispose()}
},60_000)
it.each(['cancel','changed-base','duplicate-revision']as const)('withholds Apply on %s without changing the committed graph',reason=>{
  const d=original(),s=new AssemblyWorkerSession(),before=serializeAssemblyDocument(d),p=ready(s.previewRootRevision(d,'source-r1'))
  try{
    if(reason==='cancel')s.discard(p.token)
    else if(reason==='changed-base'){const changed=structuredClone(d);changed.name='Other base';expect(()=>s.apply(changed,p.token)).toThrow(/cambió/)}
    else expect(()=>s.previewRootRevision(d,d.revision)).toThrow(/actual/)
    expect(()=>s.apply(d,p.token)).toThrow(/disponible/);expect(serializeAssemblyDocument(d)).toBe(before);geometry(scenes.buildAssemblyScene(d))
  }finally{s.discard()}
},60_000)
it('revokes an older token if native publication fails and permits a fresh retry without committing',()=>{
  const d=original(),s=new AssemblyWorkerSession(),before=serializeAssemblyDocument(d),old=ready(s.prepare(d))
  const fault=vi.spyOn(scenes,'buildAssemblyScene').mockImplementationOnce(()=>{throw Error('Original revision native publication fault')})
  try{expect(()=>s.previewRootRevision(d,'source-r1')).toThrow(/publication fault/)}finally{fault.mockRestore()}
  expect(()=>s.apply(d,old.token)).toThrow(/disponible/);expect(serializeAssemblyDocument(d)).toBe(before)
  const retry=ready(s.previewRootRevision(d,'source-r1'));geometry(retry.scene);s.discard()
},60_000)
it('requires ordinary Solve and Apply before a revision can retain an initially unsatisfied placement exactly',()=>{
  const d=original(),s=new AssemblyWorkerSession();d.occurrences[1].fixed=false;d.occurrences[1].pose.translation[2]=2
  d.mates.push({id:'original-datum',name:'Original coincident datum',type:'coincident',suppressed:false,alignment:'aligned',
    first:{kind:'principal-plane',component:null,plane:'XY'},second:{kind:'principal-plane',component:{occurrencePath:['right'],definition:{...d.occurrences[1].definition}},plane:'XY'}})
  const before=serializeAssemblyDocument(d),revision=s.previewRootRevision(d,'source-r1')
  expect(revision.status).toBe('rejected');if(revision.status!=='rejected')throw Error('Expected revision rejection')
  expect(revision.message).toContain('Resuelve y aplica primero');expect('token'in revision).toBe(false);expect(serializeAssemblyDocument(d)).toBe(before)
  const solved=s.apply(d,ready(s.prepare(d)).token).document
  const p=ready(s.previewRootRevision(solved,'source-r1'));expect(p.document.occurrences).toEqual(solved.occurrences)
  // The datum leaves tangential position/roll free. Only its constrained bottom
  // plane and invariant material properties have an independent numeric oracle.
  expect(p.scene.volume).toBeCloseTo(48,6);expect(p.scene.area).toBeCloseTo(104,6);expect(p.checks.every(c=>c.satisfied)).toBe(true)
  const bottom=p.scene.bodies.filter(b=>b.component.occurrencePath[0]==='right').flatMap(b=>b.faces).filter(f=>f.worldSupport?.kind==='plane'&&Math.abs(f.worldSupport.normal[2])>.99&&Math.abs(f.worldSupport.point[2])<1e-6)
  expect(bottom).toHaveLength(1);s.discard()
},60_000)
