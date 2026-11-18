import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyPlaneReference, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { validateAssemblySymmetryReferenceSet, type AssemblySymmetryReferenceSet } from '../model/assemblySymmetryReferences'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { UnsupportedAssemblyCylinderSurfaceError, UnsupportedAssemblySphereSurfaceError } from './kernel.assembly-supports'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { reviewAssemblyReplacement, prepareAssemblyReplacementDecisions, type AssemblyReplacementDecisions } from './kernel.assembly-replacement'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import type { AssemblyMateEndpointReference } from '../model/assemblyMateEndpoints'
type Kind = AssemblySymmetryReferenceSet['entityKind']
const kinds: Kind[] = ['point','line','plane','sphere','cylinder'], stamp='2026-10-21T00:00:00.000Z'
// Original public prism4x6x4, cylinderR2/H4 and existing original revolved sphere.
// Tests select actual topology/supports, never triangle mesh vertices or fabricated keys.
let sphere: EmbeddedPartDefinition, largerSphere: EmbeddedPartDefinition
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const original = validateAssemblyDocument(JSON.parse(await readFile(new URL('./fixtures/assembly-sphere-sphere-tangent-original.json', import.meta.url), 'utf8')))
  const selected = original.definitions.find(d => d.id === 'sphere-source-r2')
  if (selected?.kind !== 'part') throw Error('Original radius-two revolved sphere required')
  sphere = selected
  const larger = original.definitions.find(d => d.id === 'sphere-source-r3')
  if (larger?.kind !== 'part') throw Error('Original radius-three revolved sphere required')
  largerSphere = larger
}, 60_000)
function original(kind: Kind, explicit = true): AssemblyDocument {
  const box = { kind: 'part', id: 'box', revision: 'r1', document: { version: 1, id: 'box', name: 'Original 4 by 6 by 4 prism', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
    { id: 'solid', name: 'Prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, ...(explicit ? { bodyOperation: { mode: 'new', bodyId: 'body' } } : {}) }] } }
  const cylinder = { kind: 'part', id: 'cylinder', revision: 'r1', document: { version: 1, id: 'cylinder', name: 'Original radius-two cylinder', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
    { id: 'solid', name: 'Cylinder', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } }] } }
  const id = kind === 'sphere' ? sphere.id : kind === 'cylinder' ? 'cylinder' : 'box'
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original symmetry observation', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [box, ...(kind === 'sphere' ? [sphere] : kind === 'cylinder' ? [cylinder] : [])], mates: [], occurrences: ['a', 'b', 'm'].map((owner, i) => ({ id: owner, name: owner,
      definition: { id: i === 2 ? 'box' : id, revision: 'r1' }, pose: { ...identityRigidPose(), translation: [i === 0 ? -5 : i === 1 ? 5 : -2, 0, 0] }, fixed: false, suppressed: false, visible: true })) })
}
function plane(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, owner: string, sign: number): AssemblyPlaneReference {
  for (const selected of snapshot.listFaces(doc, [owner])) {
    const ref = { kind: 'face' as const, ...selected, support: 'plane' as const }, w = snapshot.resolveReference(doc, ref)
    if (w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[0] * sign > .999) return ref
  }
  throw Error('Original X plane required')
}
function entity(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, kind: Kind, owner: string, sign: number): unknown {
  if (kind === 'plane') return plane(snapshot, doc, owner, sign)
  if (kind === 'point') {
    for (const selected of snapshot.listVertices(doc, [owner])) {
      const ref = { kind: 'vertex' as const, ...selected, support: 'point' as const }, p = snapshot.resolveVertexReference(doc, ref).localSupport.point
      if (p[0] === sign * 2 && p[1] === -3 && p[2] === 0) return ref
    }
  } else if (kind === 'line') {
    const part = doc.definitions.find(d => d.id === 'box'); if (part?.kind !== 'part') throw Error('Original box required')
    const engine = new CadEngine()
    try {
      const inv = engine.rebuildForAssemblyReferences(part.document.features)
      const entries = inv.kind === 'explicit' ? inv.bodies.flatMap(b => b.edges.map(edge => ({ body: b.ref, edge }))) : inv.kind === 'legacy' ? inv.edges.map(edge => ({ body: null, edge })) : []
      for (const selected of entries) {
        const s = engine.inspectCurrentEdgeSupport(selected.edge, selected.body)
        if (Math.abs(s.point[0] - sign * 2) < 1e-10 && s.point[1] === -3 && s.axis[2] > .999) return { kind: 'edge', component: { occurrencePath: [owner], definition: { id: 'box', revision: 'r1' } }, ...selected, support: 'line' }
      }
    } finally { engine.dispose() }
  } else {
    for (const selected of snapshot.listFaces(doc, [owner])) {
      try {
        if (kind === 'sphere') { const ref = { kind: 'face' as const, ...selected, support: 'sphere-surface' as const }; snapshot.resolveSphereSurfaceReference(doc, ref); return ref }
        const ref = { kind: 'face' as const, ...selected, support: 'cylinder-surface' as const }; snapshot.resolveCylinderSurfaceReference(doc, ref); return ref
      } catch (error) { if (!(error instanceof UnsupportedAssemblyCylinderSurfaceError) && !(error instanceof UnsupportedAssemblySphereSurfaceError)) throw error }
    }
  }
  throw Error('Expected original native entity ' + kind)
}

function saved(kind: Kind): AssemblyDocument {
  const doc=original(kind), snapshot=new AssemblyGeometrySnapshot(doc)
  try { const refs=validateAssemblySymmetryReferenceSet({entityKind:kind,source:entity(snapshot,doc,kind,'a',-1),target:entity(snapshot,doc,kind,'b',1),mirror:plane(snapshot,doc,'m',1),alignment:kind==='point'||kind==='sphere'?null:'aligned'})
    doc.mates=[{id:'sym',name:'Original inactive symmetry',type:'symmetry',suppressed:true,...refs}]
    return validateAssemblyDocument(doc)
  } finally {snapshot.dispose()}
}
for(const kind of kinds) it.each([false,true])('requires current exact repair for every affected saved symmetry '+kind+' role on source update (suppressed=%s)',suppressed=>{
 const doc=saved(kind);doc.mates[0].suppressed=suppressed
 const source=doc.occurrences[0].definition, part=doc.definitions.find(x=>x.id===source.id)
 if(part?.kind!=='part')throw Error('Own source part required')
 const updated=structuredClone(part.document);for(const f of updated.features)if(f.type==='extrude')f.depth=6
 const review=reviewAssemblyPartSourceUpdate(doc,source,updated,'r2')
 expect(review.endpoints.map(x=>x.locator.side).sort()).toEqual((['point','line','plane'].includes(kind)?['source','target','mirror']:['source','target']).sort())
 expect(review.endpoints.every(x=>x.status==='needs-repair')).toBe(true)
 const snapshot=new AssemblyGeometrySnapshot(review.document)
 try {let repaired=review.document
  for(const item of review.endpoints){const owner=item.locator.side==='source'?'a':item.locator.side==='target'?'b':'m';const ref=item.locator.side==='mirror'?plane(snapshot,review.document,owner,1):entity(snapshot,review.document,kind,owner,item.locator.side==='source'?-1:1)
   repaired=repairAssemblyEndpoint(repaired,item.locator,ref as AssemblyMateEndpointReference)}
  expect(repaired.mates[0].suppressed).toBe(suppressed);expect(repaired.mates[0].type).toBe('symmetry')
 }finally{snapshot.dispose()}
})
for(const kind of kinds) it.each([false,true])('authenticates exact native replacement repairs for all '+kind+' symmetry roles (suppressed=%s)',suppressed=>{
 const doc=saved(kind);doc.mates[0].suppressed=suppressed
 const source=doc.occurrences[0].definition, part=doc.definitions.find(x=>x.id===source.id)
 if(part?.kind!=='part')throw Error('Own source part required')
 const replacement=structuredClone(part.document);replacement.id='replacement-'+part.id
 for(const f of replacement.features)if(f.type==='extrude')f.depth=6
 const {plan,review}=reviewAssemblyReplacement(doc,{component:{occurrencePath:['a'],definition:source},mode:'all',part:replacement,revision:'replacement-r1',ancestorRevisions:[]})
 const catalog=validateAssemblyDocument({...structuredClone(review.document),mates:[],occurrences:[{id:'catalog-part',name:'Own replacement catalog',definition:review.replacement,pose:identityRigidPose(),fixed:true,visible:true,suppressed:false}]})
 const snapshot=new AssemblyGeometrySnapshot(catalog)
 try {const decisions:AssemblyReplacementDecisions={repairs:[],removed:[],recapture:[]}
  for(const item of review.endpoints){const ref=item.locator.side==='mirror'?plane(snapshot,catalog,'catalog-part',1):entity(snapshot,catalog,kind,'catalog-part',item.locator.side==='source'?-1:1)
   decisions.repairs.push({locator:item.locator,reference:{...(ref as AssemblyMateEndpointReference),component:item.desiredComponent} as AssemblyMateEndpointReference})}
  const prepared=prepareAssemblyReplacementDecisions(plan,review,decisions)
  expect(prepared.proposal.mates[0].type).toBe('symmetry');expect(prepared.proposal.mates[0].suppressed).toBe(suppressed)
  if(kind==='point') {const forged=structuredClone(decisions), ref=forged.repairs[0].reference
   if(!('kind'in ref)||ref.kind!=='vertex')throw Error('Native vertex required')
   ref.body=null;expect(()=>prepareAssemblyReplacementDecisions(plan,review,forged)).toThrow()
  }
 }finally{snapshot.dispose()}
})

it('keeps all three roles of a repeated-owner point mate pending across a reused nested scope including a suppressed expansion',()=>{
 const doc=saved('point'), mate=doc.mates[0]
 if(mate.type!=='symmetry'||mate.entityKind!=='point')throw Error('Point symmetry required')
 mate.target=structuredClone(mate.source)
 const source=doc.occurrences[0].definition, part=doc.definitions.find(x=>x.id===source.id)
 if(part?.kind!=='part')throw Error('Own part required')
 const inner={kind:'assembly' as const,id:'inner',revision:'r1',name:'Original reused scope',createdAt:stamp,updatedAt:stamp,occurrences:doc.occurrences,mates:doc.mates}
 doc.definitions.push(inner);doc.mates=[];doc.occurrences=['left','right'].map((id,i)=>({id,name:id,definition:{id:'inner',revision:'r1'},pose:{...identityRigidPose(),translation:[20*i,0,0] as [number,number,number]},fixed:true,visible:true,suppressed:i===1}))
 const current=validateAssemblyDocument(doc), review=reviewAssemblyPartSourceUpdate(current,source,structuredClone(part.document),'r2')
 expect(review.endpoints.map(x=>x.locator.side).sort()).toEqual(['mirror','source','target'])
 expect(review.endpoints.every(x=>x.status==='needs-repair'&&x.locator.scope.id==='inner')).toBe(true)
 expect(current.definitions.find(x=>x.id==='inner')).toEqual(inner)
})
