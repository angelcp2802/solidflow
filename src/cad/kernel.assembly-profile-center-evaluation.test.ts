import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, type AssemblyFaceSelection } from './kernel.assembly-snapshot'
import { evaluateAssemblyProfileCenterReferences } from './kernel.assembly-profile-center-evaluation'
import { buildAssemblyScene } from './kernel.assembly-scene'

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
function free(first: AssemblyFaceSelection, second: AssemblyFaceSelection, offsetMm = 0) { return { first: { face: first, axis: null }, second: { face: second, axis: null }, alignment: 'aligned', offsetMm, orientation: { mode: 'free' } } }
function boundary(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, path: string[], selected: AssemblyFaceSelection) {
  for (const e of buildAssemblyScene(doc).bodies.filter(b => JSON.stringify(b.component.occurrencePath) === JSON.stringify(path)).flatMap(b => (b.edges ?? []).map(e => e.selection))) {
    if (JSON.stringify(e.body) !== JSON.stringify(selected.body)) continue
    const w = snapshot.resolveReference(doc, { ...e, kind: 'edge', support: 'line' })
    if (w.kind === 'support' && w.localSupport.kind === 'line' && Math.abs(w.localSupport.point[2] - 4) < 1e-10 && Math.abs(w.localSupport.axis[0]) > .99) return { edge: e.edge, sense: (w.localSupport.axis[0] > 0 ? 1 : -1) as 1 | -1 }
  }
  throw Error('Original native material boundary missing')
}
it('verifies physical full-center defect and offset independently with fresh circular/mixed profiles', () => {
 const doc = original(true), snapshot = new AssemblyGeometrySnapshot(doc), before = JSON.stringify(doc)
 const query = vi.spyOn(snapshot, 'resolveProfileFaceSelection')
 try {
  const first = top(snapshot, doc, ['a']), second = top(snapshot, doc, ['b'])
  const r = evaluateAssemblyProfileCenterReferences(snapshot, doc, free(first, second))
  expect(query).toHaveBeenCalledTimes(2); expect(r.status).toBe('ok')
  if (r.status !== 'ok') throw Error('Expected precise verification')
  near(r.positionResidualMm!, Math.sqrt(18)); near(r.normalAngleRadians!, 0); expect(r.rectangleAngleRadians).toBeNull(); expect(r.satisfied).toBe(false)
  expect(r.compatibilityAuthority).toBe(false); expect(r.verificationOnly).toBe(true); expect(r).not.toHaveProperty('poses')
  const same = evaluateAssemblyProfileCenterReferences(snapshot, doc, free(second, second))
  expect(same.status).toBe('ok'); if (same.status !== 'ok') throw Error('Expected circle verification')
  expect(same.satisfied).toBe(true); expect(query).toHaveBeenCalledTimes(4); expect(JSON.stringify(doc)).toBe(before)
 } finally { query.mockRestore(); snapshot.dispose() }
})
it('checks full physical norm rather than accepting every component within its band', () => {
 const doc = original();doc.occurrences[1].pose.translation = [8e-7,8e-7,8e-7];const snapshot = new AssemblyGeometrySnapshot(doc)
 try { const r=evaluateAssemblyProfileCenterReferences(snapshot,doc,free(top(snapshot,doc,['a']),top(snapshot,doc,['b'])));expect(r.status).toBe('ok');if(r.status!=='ok')throw Error('Expected verification');near(r.positionResidualMm!,Math.sqrt(3)*8e-7);expect(r.satisfied).toBe(false) } finally {snapshot.dispose()}
})
it('retains explicit material sense and all quarter-turn choices without a traversal-axis default', () => {
 const doc=original(),snapshot=new AssemblyGeometrySnapshot(doc),query=vi.spyOn(snapshot,'resolveProfileAxisSelection')
 try {
  const face=top(snapshot,doc,['a']),axis=boundary(snapshot,doc,['a'],face)
  for(const q of [0,1,2,3] as const){const r=evaluateAssemblyProfileCenterReferences(snapshot,doc,{first:{face,axis},second:{face,axis},alignment:'aligned',offsetMm:0,orientation:{mode:'rectangle',quarterTurns:q}},{angleToleranceRad:1e-6});expect(r.status).toBe('ok');if(r.status!=='ok')throw Error('Expected verification');near(r.rectangleAngleRadians!,[0,Math.PI/2,Math.PI,Math.PI/2][q]);expect(r.satisfied).toBe(q===0)}
  const r=evaluateAssemblyProfileCenterReferences(snapshot,doc,{first:{face,axis},second:{face,axis:{...axis,sense:-axis.sense}},alignment:'aligned',offsetMm:0,orientation:{mode:'rectangle',quarterTurns:2}},{angleToleranceRad:1e-6});expect(r.status).toBe('ok');if(r.status!=='ok')throw Error('Expected verification');expect(r.satisfied).toBe(true);expect(query).toHaveBeenCalledTimes(10)
 }finally{query.mockRestore();snapshot.dispose()}
})
it('retains the borrowed snapshot for malformed preflight but closes it on a native query failure', () => {
 const doc=original(),snapshot=new AssemblyGeometrySnapshot(doc)
 try{const face=top(snapshot,doc,['a']);expect(()=>evaluateAssemblyProfileCenterReferences(snapshot,doc,{...free(face,face),offsetMm:NaN})).toThrow();expect(snapshot.listFaces(doc,['a']).length).toBe(6);const query=vi.spyOn(snapshot,'resolveProfileFaceSelection').mockImplementation(()=>{throw Error('Original native query failed')});try{expect(()=>evaluateAssemblyProfileCenterReferences(snapshot,doc,free(face,face))).toThrow(/Original native/);expect(()=>snapshot.listFaces(doc,['a'])).toThrow()}finally{query.mockRestore()}}finally{snapshot.dispose()}
})
it('checks both proofs again after reentrant final validation and refuses publication', () => {
 const doc=original(),snapshot=new AssemblyGeometrySnapshot(doc)
 try{const face=top(snapshot,doc,['a']),original=snapshot.assertProfileWitness.bind(snapshot);let calls=0;const counter=vi.spyOn(snapshot,'assertProfileWitness').mockImplementation((...args)=>{calls++;return original(...args)});evaluateAssemblyProfileCenterReferences(snapshot,doc,free(face,face));const finalCheckCount=calls;counter.mockRestore();calls=0;const spy=vi.spyOn(snapshot,'assertProfileWitness').mockImplementation((...args)=>{calls++;if(calls===finalCheckCount)snapshot.dispose();return original(...args)});try{expect(()=>evaluateAssemblyProfileCenterReferences(snapshot,doc,free(face,face))).toThrow();expect(calls).toBe(finalCheckCount);expect(()=>snapshot.listFaces(doc,['a'])).toThrow()}finally{spy.mockRestore()}}finally{snapshot.dispose()}
})
it('uses selected material edges for a square without inventing a long side', () => {
 const doc=original(),part=doc.definitions[0]
 if(part.kind!=='part')throw Error('Expected part')
 const sketch=part.document.features[0]
 if(sketch.type!=='sketch'||sketch.profile.kind!=='rectangle')throw Error('Expected rectangle recipe')
 sketch.profile.height=4
 const snapshot=new AssemblyGeometrySnapshot(doc)
 try{const face=top(snapshot,doc,['a']),axis=boundary(snapshot,doc,['a'],face);const r=evaluateAssemblyProfileCenterReferences(snapshot,doc,{first:{face,axis},second:{face,axis},alignment:'aligned',offsetMm:0,orientation:{mode:'rectangle',quarterTurns:0}},{angleToleranceRad:1e-6});expect(r.status).toBe('ok');if(r.status!=='ok')throw Error('Expected square verification');expect(r.satisfied).toBe(true)}finally{snapshot.dispose()}
})
it('retains cancelled-chain error on a numerical precisionLimit without closing the borrowed snapshot', () => {
 const doc=original(),children=doc.occurrences;children.forEach(c=>{c.pose.translation=[-1e12,0,0]})
 doc.definitions.push({kind:'assembly',id:'nested',revision:'r1',name:'Original cancellation',createdAt:stamp,updatedAt:stamp,occurrences:children,mates:[]})
 doc.occurrences=[{id:'outer',name:'Outer',definition:{id:'nested',revision:'r1'},pose:{translation:[1e12,0,0],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}]
 const snapshot=new AssemblyGeometrySnapshot(doc)
 try{const a=top(snapshot,doc,['outer','a']),b=top(snapshot,doc,['outer','b']);const r=evaluateAssemblyProfileCenterReferences(snapshot,doc,free(a,b));expect(r.status).toBe('precisionLimit');expect(r).not.toHaveProperty('satisfied');expect(snapshot.listFaces(doc,['outer','a']).length).toBe(6)}finally{snapshot.dispose()}
})

it('verifies literal three-dimensional centers in a nested scope without a production transform oracle', () => {
 const doc=original(true),children=doc.occurrences
 children[0].pose={translation:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]}
 children[1].pose={translation:[-2,3,11],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]}
 doc.definitions.push({kind:'assembly',id:'nested',revision:'r1',name:'Original3D',createdAt:stamp,updatedAt:stamp,occurrences:children,mates:[]})
 doc.occurrences=[{id:'outer',name:'Outer',definition:{id:'nested',revision:'r1'},pose:{translation:[100,-50,7],rotation:[0,0,0,1]},fixed:false,visible:true,suppressed:false}]
 const snapshot=new AssemblyGeometrySnapshot(doc)
 try{const a=top(snapshot,doc,['outer','a']),b=top(snapshot,doc,['outer','b']);a.component.occurrencePath=['a'];b.component.occurrencePath=['b']
 // First center=(7,22,34), second=(3,-1,17), common outer translation cancels.
 // delta-offset2*firstNormal=(-4,-23,-19), squared norm906.
 const r=evaluateAssemblyProfileCenterReferences(snapshot,doc,free(a,b,2),{},['outer']);expect(r.status).toBe('ok');if(r.status!=='ok')throw Error('Expected3D verification');near(r.positionResidualMm!,Math.sqrt(906));near(r.normalAngleRadians!,Math.PI/2);expect(r.satisfied).toBe(false);expect(r.componentPaths).toEqual({first:['outer','a'],second:['outer','b']})
 }finally{snapshot.dispose()}
})
