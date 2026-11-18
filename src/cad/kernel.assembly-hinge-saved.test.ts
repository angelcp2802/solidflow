import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { validateAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type AssemblyHingeMate, type AssemblyFaceReference, type AssemblyPlaneReference } from '../model/assemblyDocument'
import { originalHingeDocument } from './kernel.assembly-hinge-fixture.test-utils'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { AssemblyGeometrySnapshot, isResolvedAssemblyHingeMate, resolvedAssemblyMateWitnesses } from './kernel.assembly-snapshot'
import { prepareAssemblySolve, discardAssemblySolvePreview, prepareAssemblyMotionPreview, applyAssemblySolvePreview } from './kernel.assembly-solve'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { reviewAssemblyReplacement, prepareAssemblyReplacementDecisions } from './kernel.assembly-replacement'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
function select(document: AssemblyDocument): Pick<AssemblyHingeMate, 'axis'|'axial'|'alignment'> {
  const scene = buildAssemblyScene(document)
  const axis = (id: string): AssemblyFaceReference & {support:'axis'} => {
    const faces = scene.bodies.find(b => b.component.occurrencePath[0] === id)!.faces.filter(f => f.support?.kind === 'cylinder' && Math.abs(f.support.radius-1)<1e-10)
    expect(faces).toHaveLength(1); return {kind:'face',...structuredClone(faces[0].selection),support:'axis'}
  }
  const cap = (id: string,z:number): AssemblyPlaneReference => {
    const faces=scene.bodies.find(b=>b.component.occurrencePath[0]===id)!.faces.filter(f=>f.support?.kind==='plane'&&Math.abs(f.support.point[2]-z)<1e-10&&Math.abs(f.support.normal[2])>.99)
    expect(faces).toHaveLength(1);return {kind:'face',...structuredClone(faces[0].selection),support:'plane'}
  }
  return {axis:[axis('ground'),axis('moving')],axial:[cap('ground',4),cap('moving',0)],alignment:'aligned'}
}
function saved(): AssemblyDocument {const d=originalHingeDocument();d.mates=[{id:'hinge',name:'Original unlimited hinge',type:'hinge',suppressed:false,...select(d)}];return validateAssemblyDocument(d)}
function ready(value: ReturnType<typeof prepareAssemblySolve>) {expect(value.status,value.status==='rejected'?value.message:'').toBe('ready');if(value.status!=='ready')throw Error(value.message);return value}
function physical(d: AssemblyDocument) {const s=buildAssemblyScene(d);expect(s.solidCount).toBe(2);expect(s.prototypeCount).toBe(1);expect(Math.abs(s.volume-(384-8*Math.PI))).toBeLessThan(1e-5);expect(Math.abs(s.area-(448+12*Math.PI))).toBeLessThan(1e-5)}
it('publishes a scoped generic check for an active hinge without inventing one for a suppressed declaration', () => {
  const document = saved(), session = new AssemblyWorkerSession()
  try {
    const result = session.prepare(document, document)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw Error(result.message)
    expect(result.hinges).toHaveLength(1)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({ constraintId: JSON.stringify([[], 'hinge']), satisfied: true, lengthTolerance: 1e-6, angleTolerance: 1e-8 })
    expect(Number.isFinite(result.checks[0].lengthResidual)).toBe(true)
    expect(Number.isFinite(result.checks[0].angleResidual)).toBe(true)
    session.discard(result.token)
    const suppressed = structuredClone(document)
    suppressed.mates[0].suppressed = true
    const dormant = session.prepare(suppressed, suppressed)
    expect(dormant.status).toBe('ready')
    if (dormant.status !== 'ready') throw Error(dormant.message)
    expect(dormant.checks).toHaveLength(0)
    expect(dormant.hinges ?? []).toHaveLength(0)
  } finally { session.discard() }
})
for (const spare of [false, true]) it('drives an accepted small axial defect without imposing an unattainable finer band (unrelated free body=' + spare + ')', () => {
  const document = saved(), tilt = 4e-9, angle = Math.PI / 2 + .125
  document.occurrences[1].pose = { translation: [2e-8, -4e-9, 4], rotation: [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)] }
  if (spare) document.occurrences.push({ ...structuredClone(document.occurrences[1]), id: 'spare', name: 'Unrelated free original leaf',
    pose: { translation: [30, 0, 0], rotation: [0, 0, 0, 1] } })
  const before = serializeAssemblyDocument(document), initial = ready(prepareAssemblySolve(document))
  try {
    expect(initial.hinges![0].axisAngleRad).toBeGreaterThan(1e-9)
    expect(initial.hinges![0].axisAngleRad + initial.hinges![0].precision.directionRad).toBeLessThanOrEqual(1e-8)
    const current = validateAssemblyDocument(initial.document)
    const moved = ready(prepareAssemblyMotionPreview(current, { component: { occurrencePath: ['moving'], definition: { ...current.occurrences[1].definition } },
      translation: [0, 0, 4], rotation: { axis: 2, angle } }))
    try {
      expect(moved.motion).toMatchObject({ requestedAngle: angle, stationCount: 2, verifiedStations: 2, windingTolerance: 1e-8, sampledOnly: true })
      expect(moved.motion!.windingResidual).toBeLessThanOrEqual(1e-8)
      expect(moved.hinges![0].axisAngleRad).toBeGreaterThan(1e-9)
      expect(moved.hinges![0].axisAngleRad + moved.hinges![0].precision.directionRad).toBeLessThanOrEqual(1e-8)
      expect(moved.hinges![0].angleToleranceRad).toBe(1e-8)
      expect(moved.checks).toHaveLength(1)
      expect(moved.checks[0]).toMatchObject({ satisfied: true, angleTolerance: 1e-8, lengthTolerance: 1e-6 })
      expect(moved.scopes.find(s => s.definition.id === document.id)?.result.localDOF).toBe(spare ? 6 : 0)
      const accepted = validateAssemblyDocument(moved.document), scene = buildAssemblyScene(accepted)
      expect(scene.solidCount).toBe(spare ? 3 : 2)
      expect(Math.abs(scene.volume - (spare ? 3 : 2) * (192 - 4 * Math.PI))).toBeLessThan(1e-5)
      const points = scene.bodies.find(b => b.component.occurrencePath[0] === 'moving')!.vertexPoints!
      const corner = points.find(v => v.point.every((x, i) => Math.abs(x - [10, 2, 4][i]) < 1e-8))!
      // Independent literal Rx(tilt) Rz(angle) material transform, no engine pose helper.
      const x = 10 * Math.cos(angle) - 2 * Math.sin(angle), y = 10 * Math.sin(angle) + 2 * Math.cos(angle)
      const expected = [x, y * Math.cos(tilt) - 4 * Math.sin(tilt), 4 + y * Math.sin(tilt) + 4 * Math.cos(tilt)]
      expect(Math.hypot(...corner.worldPoint.map((value, i) => value - expected[i]))).toBeLessThan(1e-6)
      if (spare) expect(accepted.occurrences[2]).toEqual(document.occurrences[2])
    } finally { discardAssemblySolvePreview(moved) }
  } finally { discardAssemblySolvePreview(initial) }
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('still rejects a driven fixed hinge whose angular defect exceeds the public band', () => {
  const document = saved(), tilt = 2e-8
  document.occurrences[1].pose.rotation = [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)]
  const before = serializeAssemblyDocument(document)
  const result = prepareAssemblyMotionPreview(document, { component: { occurrencePath: ['moving'], definition: { ...document.occurrences[1].definition } },
    translation: [0, 0, 4], rotation: { axis: 2, angle: Math.PI / 2 + .125 } })
  expect(result.status).toBe('rejected')
  if (result.status === 'ready') { discardAssemblySolvePreview(result); throw Error('An incompatible driven hinge must not publish a candidate.') }
  expect(result.reason).toBe('numeric')
  const certificate = result.scopes[0].result.certificates[0]
  expect(certificate).toMatchObject({ kind: 'fixedConstraint' })
  if (certificate.kind !== 'fixedConstraint') throw Error('Expected the immutable relation certificate.')
  expect(certificate.checks[0].angleResidual).toBeGreaterThan(1e-8)
  expect(certificate.checks[0].angleTolerance).toBe(1e-8)
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('does not hide an invalid caller refinement target when adding the private station target', () => {
  const document = saved(), before = serializeAssemblyDocument(document)
  const request = { component: { occurrencePath: ['moving'], definition: { ...document.occurrences[1].definition } },
    translation: [0, 0, 4] as [number, number, number], rotation: { axis: 2 as const, angle: Math.PI / 2 } }
  for (const target of [undefined, 0, -1, NaN, Infinity, 2e-8, '1e-9']) {
    const result = prepareAssemblyMotionPreview(document, request, { solver: { angleRefinementTolerance: target as number } })
    expect(result.status).toBe('rejected')
    if (result.status === 'ready') { discardAssemblySolvePreview(result); throw Error('An invalid target must not publish a candidate.') }
    expect(result.scopes).toEqual([])
  }
  let reads = 0
  const solver = Object.defineProperty({}, 'angleRefinementTolerance', { enumerable: true, get() { reads++; return 1e-9 } })
  expect(prepareAssemblyMotionPreview(document, request, { solver }).status).toBe('rejected')
  expect(reads).toBe(0)
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it('resolves four genuine current saved roles and rejects copied or stale witnesses',()=>{const d=saved(),s=new AssemblyGeometrySnapshot(d);try{const r=s.resolveActiveMates(d);expect(r).toHaveLength(1);expect(isResolvedAssemblyHingeMate(r[0])).toBe(true);expect(resolvedAssemblyMateWitnesses(r[0])).toHaveLength(4);for(const w of resolvedAssemblyMateWitnesses(r[0])){s.assertMateWitness(w,d);expect(()=>s.assertMateWitness(structuredClone(w),d)).toThrow()}const stale=structuredClone(d);stale.occurrences[1].pose.translation[2]+=1;expect(()=>s.resolveActiveMates(stale)).toThrow()}finally{s.dispose()}})
it('solves rank-five saved hinge, publishes independent physical report and preserves material spin through history',()=>{const d=saved(),before=serializeAssemblyDocument(d),h=new AssemblyDocumentHistory(d),p=ready(prepareAssemblySolve(d));try{expect(p.checks).toHaveLength(1);expect(p.scopes.find(s=>s.definition.id===d.id)?.result.localDOF).toBe(1);expect(p.hinges).toHaveLength(1);expect(p.hinges![0].qualifiedRotation).toBe(true);expect(p.hinges![0].satisfied).toBe(true);const accepted=applyAssemblySolvePreview(h,p);physical(accepted);const m=ready(prepareAssemblyMotionPreview(accepted,{component:{occurrencePath:['moving'],definition:{...accepted.occurrences[1].definition}},translation:[0,0,4],rotation:{axis:2,angle:Math.PI/2}}));try{expect(m.checks).toHaveLength(1);expect(m.hinges).toHaveLength(1);const changed=applyAssemblySolvePreview(h,m);physical(changed);const b=buildAssemblyScene(changed).bodies.find(b=>b.component.occurrencePath[0]==='moving')!;expect(Math.abs(b.bounds.max[1]-10)).toBeLessThan(1e-6);expect(Math.abs(b.bounds.max[0]-2)).toBeLessThan(1e-6);const reopened=ready(prepareAssemblySolve(validateAssemblyDocument(JSON.parse(serializeAssemblyDocument(changed)))));try{expect(reopened.checks).toHaveLength(1);expect(reopened.hinges).toHaveLength(1)}finally{discardAssemblySolvePreview(reopened)}}finally{discardAssemblySolvePreview(m)}}finally{discardAssemblySolvePreview(p)}expect(serializeAssemblyDocument(d)).toBe(before)})
it('keeps worker report detached from single-use private Apply authority and revokes cancelled preview',()=>{const d=saved(),session=new AssemblyWorkerSession();try{const first=session.prepare(d,d);expect(first.status).toBe('ready');if(first.status!=='ready')throw Error(first.message);expect(first.hinges).toHaveLength(1);first.hinges![0].axialOffsetMm=123;session.discard(first.token);expect(()=>session.apply(d,first.token)).toThrow();const retry=session.prepare(d,d);if(retry.status!=='ready')throw Error(retry.message);retry.document.occurrences[1].pose.translation[2]=999;const applied=session.apply(d,retry.token);expect(applied.document.occurrences[1].pose.translation[2]).toBe(4);expect(()=>session.apply(d,retry.token)).toThrow();physical(applied.document)}finally{session.discard()}})
for(const suppressed of [false,true])it('reviews and repairs all four source roles without plane or axis auto-association (suppressed='+suppressed+')',()=>{const d=saved();d.mates[0].suppressed=suppressed;const part=d.definitions[0];if(part.kind!=='part')throw Error('part');const updated=structuredClone(part.document);updated.name+=' updated';const review=reviewAssemblyPartSourceUpdate(d,d.occurrences[0].definition,updated,'r2');expect(review.endpoints.map(e=>e.locator.side).sort()).toEqual(['axis-0','axis-1','axial-0','axial-1'].sort());expect(review.endpoints.every(e=>e.status==='needs-repair')).toBe(true);const refs=select(review.document);let repaired=review.document;for(const row of review.endpoints){const side=row.locator.side;const reference=side==='axis-0'?refs.axis[0]:side==='axis-1'?refs.axis[1]:side==='axial-0'?refs.axial[0]:refs.axial[1];repaired=repairAssemblyEndpoint(repaired,row.locator,reference)}expect(repaired.mates[0].suppressed).toBe(suppressed);const p=ready(prepareAssemblySolve(repaired));try{expect(p.hinges?.length??0).toBe(suppressed?0:1)}finally{discardAssemblySolvePreview(p)}})
it('requires explicit native replacement of all four roles for an all-occurrence replacement',()=>{const d=saved(),part=d.definitions[0];if(part.kind!=='part')throw Error('part');const replacement=structuredClone(part.document);replacement.id='new-original-leaf';const {plan,review}=reviewAssemblyReplacement(d,{component:{occurrencePath:['moving'],definition:{...d.occurrences[1].definition}},mode:'all',part:replacement,revision:'new-r1',ancestorRevisions:[]});expect(review.endpoints).toHaveLength(4);expect(()=>prepareAssemblyReplacementDecisions(plan,review,{repairs:[],removed:[],recapture:[]})).toThrow();const refs=select(review.document);const repairs=review.endpoints.map(row=>({locator:row.locator,reference:row.locator.side==='axis-0'?refs.axis[0]:row.locator.side==='axis-1'?refs.axis[1]:row.locator.side==='axial-0'?refs.axial[0]:refs.axial[1]}));const fixed=prepareAssemblyReplacementDecisions(plan,review,{repairs,removed:[],recapture:[]});const p=ready(prepareAssemblySolve(fixed.proposal));try{expect(p.hinges).toHaveLength(1);physical(validateAssemblyDocument(p.document))}finally{discardAssemblySolvePreview(p)}})
it('resolves repeated nested namespaces in their declared frames without promoting descendants to root movable owners',()=>{
  const d=saved(),root=originalHingeDocument();root.id='original-hinge-container';root.occurrences=[];root.mates=[]
  const module={kind:'assembly' as const,id:'hinge-module',revision:'m0',name:'Original hinge module',createdAt:d.createdAt,updatedAt:d.updatedAt,occurrences:structuredClone(d.occurrences),mates:structuredClone(d.mates)}
  root.definitions=[...d.definitions,module]
  root.occurrences=['left-module','right-module'].map((id,i)=>({id,name:id,definition:{id:module.id,revision:module.revision},pose:{translation:[i*30,7,11] as [number,number,number],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2] as [number,number,number,number]},fixed:true,suppressed:false,visible:true}))
  const checked=validateAssemblyDocument(root),s=new AssemblyGeometrySnapshot(checked)
  try{const r=s.resolveActiveMates(checked);expect(r).toHaveLength(2);expect(r.every(isResolvedAssemblyHingeMate)).toBe(true);expect(r.map(x=>x.scopePath)).toEqual([['left-module'],['right-module']]);for(const item of r){for(const w of resolvedAssemblyMateWitnesses(item)){s.assertMateWitness(w,checked);expect(w.componentPath[0]).toBe(item.scopePath[0])}}}finally{s.dispose()}
  const p=ready(prepareAssemblySolve(checked));try{expect(p.hinges).toHaveLength(2);expect(p.hinges!.map(x=>x.scopePath)).toEqual([['left-module'],['right-module']]);expect(p.hinges!.every(x=>x.satisfied&&x.axisAngleRad<1e-8&&Math.abs(x.axialOffsetMm)<1e-6)).toBe(true);expect(p.document.occurrences).toEqual(checked.occurrences);const scene=buildAssemblyScene(validateAssemblyDocument(p.document));expect(scene.solidCount).toBe(4);expect(Math.abs(scene.volume-(768-16*Math.PI))).toBeLessThan(1e-5)}finally{discardAssemblySolvePreview(p)}
})
it('solves an actual axial and transverse displacement while rejecting a current but nonaxial saved cap',()=>{
  const d=saved();d.occurrences[1].pose.translation=[.3,-.2,4.5]
  const p=ready(prepareAssemblySolve(d));try{expect(p.hinges).toHaveLength(1);expect(p.hinges![0].transverseResidualMm+p.hinges![0].precision.positionMm).toBeLessThanOrEqual(1e-6);expect(Math.abs(p.hinges![0].axialOffsetMm)+p.hinges![0].precision.positionMm).toBeLessThanOrEqual(1e-6);physical(validateAssemblyDocument(p.document))}finally{discardAssemblySolvePreview(p)}
  const bad=saved(),scene=buildAssemblyScene(bad),face=scene.bodies.find(b=>b.component.occurrencePath[0]==='moving')!.faces.find(f=>f.support?.kind==='plane'&&Math.abs(f.support.normal[0])>.99)!
  const mate=bad.mates[0];if(mate.type!=='hinge')throw Error('hinge');mate.axial[1]={kind:'face',...structuredClone(face.selection),support:'plane'}
  const rejected=prepareAssemblySolve(bad);expect(rejected.status).toBe('rejected');if(rejected.status==='ready')discardAssemblySolvePreview(rejected)
})
it('selected replacement repairs only its two hinge roles and rejects a wrong native owner',()=>{
 const d=saved(),part=d.definitions[0];if(part.kind!=='part')throw Error('part');const replacement=structuredClone(part.document);replacement.id='selected-new-leaf'
 const {plan,review}=reviewAssemblyReplacement(d,{component:{occurrencePath:['moving'],definition:{...d.occurrences[1].definition}},mode:'selected',part:replacement,revision:'new-r1',ancestorRevisions:[]})
 expect(review.endpoints.map(x=>x.locator.side).sort()).toEqual(['axis-1','axial-1'].sort());const refs=select(review.document)
 const repairs=review.endpoints.map(row=>({locator:row.locator,reference:row.locator.side==='axis-1'?refs.axis[1]:refs.axial[1]}))
 expect(()=>prepareAssemblyReplacementDecisions(plan,review,{repairs:[{...repairs[0],reference:refs.axis[0]},repairs[1]],removed:[],recapture:[]})).toThrow()
 const fixed=prepareAssemblyReplacementDecisions(plan,review,{repairs,removed:[],recapture:[]}),mate=fixed.proposal.mates[0],old=d.mates[0];if(mate.type!=='hinge'||old.type!=='hinge')throw Error('hinge');expect(mate.axis[0]).toEqual(old.axis[0]);expect(mate.axial[0]).toEqual(old.axial[0]);const p=ready(prepareAssemblySolve(fixed.proposal));try{expect(p.hinges).toHaveLength(1)}finally{discardAssemblySolvePreview(p)}
})
