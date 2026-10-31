import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyConfiguredDocument, assemblyConfiguredGeometryInput, serializeAssemblyConfiguredDocument, parseAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import type { EmbeddedAssemblyDefinition, AssemblyMate } from '../model/assemblyDocument'
import { configuredMechanicalMateSpec, type AssemblyConfiguredMechanicalEdit, type AssemblyConfiguredMechanicalSpec } from '../model/assemblyConfiguredMechanicalEditing'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { buildConfiguredAssemblyScene, type ConfiguredAssemblyScene } from './kernel.assembly-configuration-scene'
import { ConfiguredAssemblyWorkerSession } from './kernel.assembly-configuration-session'
import * as scenes from './kernel.assembly-configuration-scene'
import { CadEngine } from './kernel.engine'

const require = createRequire(import.meta.url)
// Original public R2/H4, R1/H3 cylinders and 2×3×4 prism, reused under a
// quarter turn. The source recipe has no captured fields or imported geometry.
const original = require('../../scripts/desktop-assembly-configured-mechanical-original.cjs') as (family: string) => unknown
beforeAll(async () => { setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })) }, 60_000)
const families = ['lock', 'concentric', 'gear', 'screw', 'rack-pinion'] as const
type Family = typeof families[number]
const clone = <T>(v: T): T => structuredClone(v)
function fixture(family: Family) { return { document: validateAssemblyConfiguredDocument(original(family)), generation: 20 } }
function target() { return { scopePath: ['left'], definition: { id: 'mechanical-S', revision: 's-r1' }, configuration: 'compact' } }
function declaration(document: ReturnType<typeof fixture>['document']): AssemblyMate {
  const scope = evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration).scopes.find(s => s.path.join('/') === 'left')!
  expect(scope.mates).toHaveLength(1); return clone(scope.mates[0]) as AssemblyMate
}
function specFor(current: ReturnType<typeof fixture>, family: Family, prefix = ['left']): AssemblyConfiguredMechanicalSpec {
  const scene = buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(current.document, current.generation))
  const body = (id: string) => { const rows = scene.scene.bodies.filter(b => b.component.occurrencePath.join('/') === [...prefix,id].join('/')); expect(rows).toHaveLength(1); return rows[0] }
  const component = (id: string) => ({ occurrencePath: [id], definition: { ...body(id).component.definition } })
  const axis = (id: string) => { const rows = body(id).faces.filter(f => f.support?.kind === 'cylinder'); expect(rows).toHaveLength(1); return { kind: 'face' as const, ...clone(rows[0].selection), component: component(id), support: 'axis' as const } }
  const common = { id: 'original-mechanical', name: 'Original ' + family, suppressed: false }
  if (family === 'lock') return { ...common, type: family, first: component('a'), second: component('b') }
  const first = axis('a')
  if (family === 'rack-pinion') {
    const rows = body('rack').edges!.filter(e => e.support?.kind === 'line' && Math.abs(e.support.axis[1]) > .99 && Math.abs(e.support.point[0]) < 1e-10 && Math.abs(e.support.point[2]) < 1e-10)
    expect(rows).toHaveLength(1)
    return { ...common, type: family, first, second: { kind: 'edge', ...clone(rows[0].selection), component: component('rack'), support: 'line' }, conversion: { mode: 'diameter', override: 4 }, reverse: false }
  }
  const second = axis('b')
  if (family === 'concentric') return { ...common, type: family, first, second, alignment: 'aligned' }
  if (family === 'screw') return { ...common, type: family, first, second, lead: 4, reverse: false, alignment: 'aligned' }
  return { ...common, type: family, first, second, carrier: component('rack'), ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', phase: 0 }
}
function reports(scene: ConfiguredAssemblyScene, aligned: boolean) {
  expect(scene.scene.solidCount).toBe(6); expect(scene.scene.prototypeCount).toBe(3)
  expect(Math.abs(scene.scene.volume - (38 * Math.PI + 48))).toBeLessThanOrEqual(1e-5)
  expect(Math.abs(scene.scene.area - (64 * Math.PI + 104))).toBeLessThanOrEqual(1e-5)
  const leftB = scene.scene.bodies.find(b => b.component.occurrencePath.join('/') === 'left/b')!, rightB = scene.scene.bodies.find(b => b.component.occurrencePath.join('/') === 'right/b')!
  const x = aligned ? 0 : 6
  for (const [actual, expected] of [[leftB.bounds.min[0],x-1],[leftB.bounds.max[0],x+1],[rightB.bounds.min[1],x-1],[rightB.bounds.max[1],x+1]]) expect(Math.abs(actual-expected)).toBeLessThanOrEqual(1e-6)
}
// Independent component quaternion multiplication; no configured endpoint,
// capture helper, rigid-pose helper or solver row is an expected-value oracle.
function relativeQuaternion(a: readonly number[], b: readonly number[]) {
  const [x,y,z,w]=a,[u,v,t,s]=b
  return [w*u-x*s-y*t+z*v,w*v+x*t-y*s-z*u,w*t-x*v+y*u-z*s,w*s+x*u+y*v+z*t]
}
function sameQuaternion(actual: readonly number[], expected: readonly number[]) {
  const sign=actual.reduce((sum,v,i)=>sum+v*expected[i],0)<0?-1:1
  expect(Math.abs(Math.hypot(...actual)-1)).toBeLessThanOrEqual(1e-10)
  expect(Math.abs(Math.hypot(...expected)-1)).toBeLessThanOrEqual(1e-10)
  for(let i=0;i<4;i++)expect(Math.abs(actual[i]-sign*expected[i])).toBeLessThanOrEqual(1e-8)
}
function alignedCapture(mate: AssemblyMate, scene: ConfiguredAssemblyScene) {
  if(mate.type!=='concentric'&&mate.type!=='screw')throw Error('Original aligned capture expected')
  const rotate=(q:readonly number[],v:readonly number[])=>{
    const [x,y,z,w]=q,[a,b,c]=v
    return [(1-2*y*y-2*z*z)*a+(2*x*y-2*z*w)*b+(2*x*z+2*y*w)*c,
      (2*x*y+2*z*w)*a+(1-2*x*x-2*z*z)*b+(2*y*z-2*x*w)*c,
      (2*x*z-2*y*w)*a+(2*y*z+2*x*w)*b+(1-2*x*x-2*y*y)*c]
  }
  for(const owner of ['left','right']){
    const a=scene.scene.bodies.find(b=>b.component.occurrencePath.join('/')===owner+'/a')!,b=scene.scene.bodies.find(b=>b.component.occurrencePath.join('/')===owner+'/b')!
    const qa=a.worldPose.rotation,qb=b.worldPose.rotation
    if(mate.type==='concentric'){expect(mate.rotationLock).not.toBeNull();sameQuaternion(mate.rotationLock!,relativeQuaternion(qa,qb))}
    else sameQuaternion(mate.neutralRotation,relativeQuaternion(qb,qa))
    const ax=a.faces.find(f=>f.support?.kind==='cylinder')!.support!,bx=b.faces.find(f=>f.support?.kind==='cylinder')!.support!
    if(ax.kind!=='cylinder'||bx.kind!=='cylinder')throw Error('Original native axes absent')
    const na=rotate(qa,ax.axis),nb=rotate(qb,bx.axis),cross=[na[1]*nb[2]-na[2]*nb[1],na[2]*nb[0]-na[0]*nb[2],na[0]*nb[1]-na[1]*nb[0]]
    expect(Math.atan2(Math.hypot(...cross),na.reduce((s,v,i)=>s+v*nb[i],0))).toBeLessThanOrEqual(1e-8)
    for(let i=0;i<2;i++)expect(Math.abs((a.bounds.min[i]+a.bounds.max[i])-(b.bounds.min[i]+b.bounds.max[i]))).toBeLessThanOrEqual(2e-6)
    expect(Math.abs(b.bounds.min[2])).toBeLessThanOrEqual(1e-6);expect(Math.abs(b.bounds.max[2]-3)).toBeLessThanOrEqual(1e-6)
  }
}
function literalCapture(mate: AssemblyMate, scene: ConfiguredAssemblyScene) {
  const quaternion = (q: readonly number[]) => { expect(q).toHaveLength(4); for (let i=0;i<4;i++)expect(Math.abs(q[i]-(i===3?1:0))).toBeLessThanOrEqual(1e-9) }
  switch(mate.type){
    case 'lock': expect(mate.relativePose.translation).toEqual([6,0,0]);quaternion(mate.relativePose.rotation);break
    case 'concentric': alignedCapture(mate,scene);break
    case 'gear': quaternion(mate.neutralRotations.first);quaternion(mate.neutralRotations.second);expect(mate.angles).toEqual({first:0,second:0});expect(mate.phase).toBe(0);break
    case 'screw': alignedCapture(mate,scene);expect(Math.abs(mate.neutralTravel)).toBeLessThanOrEqual(1e-9);expect(mate.angle).toBe(0);break
    case 'rack-pinion':
      // Canonical +Y material line, rack origin (0,8,0), pinion origin and
      // closest axis point (0,0,0): their signed projection is +8 mm.
      quaternion(mate.neutralRotation);expect(Math.abs(mate.neutralTravel-8)).toBeLessThanOrEqual(1e-9);expect(mate.angle).toBe(0);break
    default:throw Error('Original mechanical capture expected')
  }
}
it.each(families)('produces, retains and recaptures genuine shared %s state, then reopens and verifies', family => {
  let current = fixture(family), before = clone(current)
  const spec = specFor(current, family), intent: AssemblyConfiguredMechanicalEdit = { ...target(), change: { kind: 'add', spec } }, session = new ConfiguredAssemblyWorkerSession()
  let preview = session.previewMechanicalEdit(current, intent)
  expect(preview.verification.accepted).toBe(true); expect(preview.verification.reports).toHaveLength(2)
  reports(preview.scene, family === 'concentric' || family === 'screw')
  const expected = clone(preview.document), generation = preview.candidateGeneration
  literalCapture(declaration(expected),preview.scene)
  preview.document.catalog.length = 0
  const applied = session.apply(current, preview.token); expect(applied.document).toEqual(expected); expect(current).toEqual(before)
  expect(applied.document.source).toEqual(before.document.source)
  expect(applied.document.catalog[1].configurations.find(v=>v.id==='dormant')).toEqual(before.document.catalog[1].configurations.find(v=>v.id==='dormant'))
  current = { document: applied.document, generation }
  const captured = declaration(current.document), retained = configuredMechanicalMateSpec(captured); retained.name = 'Retained original ' + family
  preview = session.previewMechanicalEdit(current, { ...target(), change: { kind: 'replace', mateId: retained.id, capture: 'retain', spec: retained } })
  const retaining = session.apply(current, preview.token); expect({ ...declaration(retaining.document), name: captured.name }).toEqual(captured)
  current = { document: retaining.document, generation: retaining.generation }
  preview = session.previewMechanicalEdit(current, { ...target(), change: { kind: 'replace', mateId: retained.id, capture: 'recapture', spec: retained } })
  const recaptured = session.apply(current, preview.token); expect(recaptured.document.source).toEqual(before.document.source)
  const reopened = parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(recaptured.document))
  expect(new ConfiguredAssemblyWorkerSession().preview({document:reopened,generation:0}).verification.accepted).toBe(true)
}, 60_000)
it.each(['concentric','screw'] as const)('captures identity for an already aligned zero-offset %s without assuming a roll for the X6 alignment case',family=>{
  const current=fixture(family),compact=current.document.catalog[1].configurations.find(v=>v.id==='compact')!
  compact.occurrences.find(o=>o.occurrenceId==='b')!.pose!.translation=[0,0,0]
  const spec=specFor(current,family),session=new ConfiguredAssemblyWorkerSession(),preview=session.previewMechanicalEdit(current,{...target(),change:{kind:'add',spec}}),mate=declaration(preview.document)
  reports(preview.scene,true);alignedCapture(mate,preview.scene)
  if(mate.type==='concentric')sameQuaternion(mate.rotationLock!,[0,0,0,1])
  else if(mate.type==='screw')sameQuaternion(mate.neutralRotation,[0,0,0,1])
  else throw Error('Original aligned family expected')
},60_000)
it('captures zero frames then solves an explicit nonzero weighted gear phase and retains them through a phase edit', () => {
  const current=fixture('gear'),session=new ConfiguredAssemblyWorkerSession(),spec=specFor(current,'gear')
  if(spec.type!=='gear')throw Error('Original gear spec missing')
  spec.phase=.25
  const preview=session.previewMechanicalEdit(current,{...target(),change:{kind:'add',spec}})
  const mate=declaration(preview.document)
  if(mate.type!=='gear')throw Error('Original captured gear missing')
  // Ratio 2:1 normalizes to weights 1 and .5, opposed uses +.  A is fixed:
  // 0 + .5*thetaB = .25, hence thetaB=.5 rad, without a modulo operation.
  expect(Math.abs(mate.angles.first)).toBeLessThanOrEqual(1e-8)
  expect(Math.abs(mate.angles.second-.5)).toBeLessThanOrEqual(1e-8)
  expect(mate.phase).toBe(.25)
  for(const q of [mate.neutralRotations.first,mate.neutralRotations.second])for(let i=0;i<4;i++)expect(Math.abs(q[i]-(i===3?1:0))).toBeLessThanOrEqual(1e-9)
  const scope=evaluateAssemblyConfiguration(preview.document.source,preview.document.catalog,preview.document.rootConfiguration).scopes.find(s=>s.path.join('/')==='left')!
  const qb=scope.occurrences.find(o=>o.id==='b')!.pose.rotation
  const originalScene=buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(current.document,current.generation)),body=originalScene.scene.bodies.find(b=>b.component.occurrencePath.join('/')==='left/b')!
  const cylinder=body.faces.find(f=>f.support?.kind==='cylinder')!.support!
  if(cylinder.kind!=='cylinder')throw Error('Original native cylinder missing')
  expect(Math.abs(cylinder.axis[0])+Math.abs(cylinder.axis[1])).toBeLessThanOrEqual(1e-10)
  expect(Math.abs(Math.abs(cylinder.axis[2])-1)).toBeLessThanOrEqual(1e-10)
  const expected=[0,0,Math.sign(cylinder.axis[2])*Math.sin(.25),Math.cos(.25)]
  for(let i=0;i<4;i++)expect(Math.abs(qb[i]-expected[i])).toBeLessThanOrEqual(1e-8)
  const applied=session.apply(current,preview.token),next={document:applied.document,generation:applied.generation},retained=configuredMechanicalMateSpec(mate)
  if(retained.type!=='gear')throw Error('Original retained spec missing')
  retained.phase=.5
  const again=session.previewMechanicalEdit(next,{...target(),change:{kind:'replace',mateId:retained.id,capture:'retain',spec:retained}}),updated=declaration(again.document)
  if(updated.type!=='gear')throw Error('Original retained gear missing')
  expect(updated.neutralRotations).toEqual(mate.neutralRotations);expect(updated.phase).toBe(.5)
  expect(Math.abs(updated.angles.first)).toBeLessThanOrEqual(1e-8);expect(Math.abs(updated.angles.second-1)).toBeLessThanOrEqual(1e-8)
  expect(again.verification.accepted).toBe(true)
},60_000)
it('removes an incompatible old lock before explicit recapture, whereas retaining it cannot satisfy fixed placements', () => {
  const initial = fixture('lock'), session = new ConfiguredAssemblyWorkerSession(), spec = specFor(initial, 'lock')
  const first = session.previewMechanicalEdit(initial, { ...target(), change: {kind:'add',spec} }), applied = session.apply(initial, first.token)
  const current = {document:applied.document,generation:applied.generation}
  const node = current.document.source.definitions.find(d=>d.id==='mechanical-S') as EmbeddedAssemblyDefinition
  node.occurrences.find(o=>o.id==='b')!.fixed = true
  current.document.catalog[1].configurations.find(v=>v.id==='compact')!.occurrences.find(o=>o.occurrenceId==='b')!.pose!.translation[0] = 7
  const intent = { ...target(), change: { kind:'replace' as const,mateId:spec.id,capture:'retain' as const,spec } }
  expect(()=>session.previewMechanicalEdit(current,intent)).toThrow()
  const preview = session.previewMechanicalEdit(current,{...intent,change:{...intent.change,capture:'recapture'}})
  const result = session.apply(current,preview.token); const mate = declaration(result.document)
  expect(mate.type).toBe('lock'); if(mate.type==='lock')expect(mate.relativePose.translation).toEqual([7,0,0])
},60_000)
it('captures Base while preserving every named effective state, including dormant inherited empty lists', () => {
  const current=fixture('lock');current.document.rootConfiguration='mixed'
  const original=clone(current),spec=specFor(current,'lock'),session=new ConfiguredAssemblyWorkerSession()
  const preview=session.previewMechanicalEdit(current,{...target(),configuration:null,change:{kind:'add',spec}})
  const result=session.apply(current,preview.token),base=result.document.source.definitions.find(d=>d.id==='mechanical-S') as EmbeddedAssemblyDefinition
  expect(base.mates).toHaveLength(1);if(base.mates[0].type==='lock')expect(base.mates[0].relativePose.translation).toEqual([8,0,0]);else throw Error('Original Base lock missing')
  for(const variant of result.document.catalog[1].configurations){expect(variant.mateDeclarations).toEqual([]);expect(variant.occurrences).toEqual(original.document.catalog[1].configurations.find(v=>v.id===variant.id)!.occurrences)}
  expect(result.document.source.definitions.filter(d=>d.kind==='part')).toEqual(original.document.source.definitions.filter(d=>d.kind==='part'))
  expect(current).toEqual(original)
},60_000)
it('captures null carrier in the actual nested selected scope under independent proper parent gauges', () => {
  const current=fixture('gear'),source=current.document.source,s=source.definitions.find(d=>d.id==='mechanical-S') as EmbeddedAssemblyDefinition
  const stamp=source.createdAt,u:EmbeddedAssemblyDefinition={kind:'assembly',id:'mechanical-U',revision:'u-r1',name:'Original nested U',createdAt:stamp,updatedAt:stamp,
    occurrences:[{id:'nested',name:'Nested original S',definition:{id:s.id,revision:s.revision},pose:{translation:[1,2,3],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]},fixed:false,suppressed:false,visible:true}],mates:[]}
  source.definitions.push(u);for(const occurrence of source.occurrences)occurrence.definition={id:u.id,revision:u.revision}
  for(const variant of current.document.catalog[0].configurations)for(const occurrence of variant.occurrences)occurrence.configuration='u-compact'
  current.document.catalog.push({definition:{id:u.id,revision:u.revision},configurations:[{id:'u-compact',name:'Original nested compact',occurrences:[{occurrenceId:'nested',configuration:'compact'}],mates:[]}]})
  const before=clone(current),spec=specFor(current,'gear',['left','nested']);if(spec.type!=='gear')throw Error('Original gear spec missing');spec.carrier=null
  const session=new ConfiguredAssemblyWorkerSession(),preview=session.previewMechanicalEdit(current,{...target(),scopePath:['left','nested'],change:{kind:'add',spec}})
  expect(preview.verification.accepted).toBe(true);expect(preview.verification.reports).toHaveLength(2)
  expect(preview.verification.reports.map(r=>JSON.parse(r.key)[0])).toEqual([['left','nested'],['right','nested']])
  const result=session.apply(current,preview.token),state=evaluateAssemblyConfiguration(result.document.source,result.document.catalog,result.document.rootConfiguration).scopes.find(s=>s.path.join('/')==='left/nested')!,gear=state.mates[0]
  expect(gear.type).toBe('gear');if(gear.type==='gear'){expect(gear.neutralRotations).toEqual({first:[0,0,0,1],second:[0,0,0,1]});expect(gear.carrier).toBeNull()}
  expect(current).toEqual(before)
},60_000)
it.each(['concentric','screw'] as const)('rejects impossible fixed %s alignment without changing Base, named or dormant declarations', family => {
  const current=fixture(family), before=clone(current), spec=specFor(current,family)
  const node=current.document.source.definitions.find(d=>d.id==='mechanical-S') as EmbeddedAssemblyDefinition;node.occurrences.find(o=>o.id==='b')!.fixed=true
  const fixed=clone(current), session=new ConfiguredAssemblyWorkerSession()
  expect(()=>session.previewMechanicalEdit(current,{...target(),change:{kind:'add',spec}})).toThrow()
  expect(current).toEqual(fixed);expect(before.document.catalog).toEqual(current.document.catalog)
  expect(()=>session.apply(current,'unpublished')).toThrow(/unknown|consumed/)
},60_000)
it('preserves gear multi-turn active and passive winding when retaining an existing capture', () => {
  let current=fixture('gear');const session=new ConfiguredAssemblyWorkerSession(),spec=specFor(current,'gear')
  const first=session.previewMechanicalEdit(current,{...target(),change:{kind:'add',spec}}),applied=session.apply(current,first.token)
  current={document:applied.document,generation:applied.generation}
  const compact=current.document.catalog[1].configurations.find(v=>v.id==='compact')!,gear=compact.mateDeclarations![0]
  if(gear.type!=='gear')throw Error('Original gear missing')
  gear.angles={first:4*Math.PI,second:-8*Math.PI}
  for(const suppressed of [false,true]){
    const authored=configuredMechanicalMateSpec(declaration(current.document));authored.suppressed=suppressed
    const preview=session.previewMechanicalEdit(current,{...target(),change:{kind:'replace',mateId:authored.id,capture:'retain',spec:authored}})
    const result=session.apply(current,preview.token),actual=declaration(result.document)
    expect(actual.type).toBe('gear');if(actual.type==='gear'){expect(actual.angles.first).toBeCloseTo(4*Math.PI,10);expect(actual.angles.second).toBeCloseTo(-8*Math.PI,10)}
    current={document:result.document,generation:result.generation}
  }
},60_000)
it('consumes matching stale or proposal-baseline attempts, keeps unrelated cancellation and ignores candidate DTO edits', () => {
  const current=fixture('lock'),session=new ConfiguredAssemblyWorkerSession(),intent={...target(),change:{kind:'add' as const,spec:specFor(current,'lock')}}
  const first=session.previewMechanicalEdit(current,intent);session.discard('unrelated')
  expect(()=>session.apply({document:first.document,generation:current.generation},first.token)).toThrow(/baseline/)
  expect(()=>session.apply(current,first.token)).toThrow(/unknown|consumed/)
  const next=session.previewMechanicalEdit(current,intent),expected=clone(next.document);next.document.source.name='Untrusted DTO'
  expect(session.apply(current,next.token).document).toEqual(expected)
},60_000)
it.each(['reentry','failure'] as const)('withholds a mechanical stage on real final scene %s', phase => {
  const current=fixture('lock'),before=clone(current),intent={...target(),change:{kind:'add' as const,spec:specFor(current,'lock')}},session=new ConfiguredAssemblyWorkerSession(),actual=scenes.buildConfiguredAssemblyScene
  const spy=vi.spyOn(scenes,'buildConfiguredAssemblyScene').mockImplementation((...args)=>{const value=actual(...args);if(phase==='failure')throw Error('Original mechanical scene delivery failure');current.generation++;return value})
  try{expect(()=>session.previewMechanicalEdit(current,intent)).toThrow(phase==='failure'?'Original mechanical scene delivery failure':/context changed/)}finally{spy.mockRestore()}
  expect(current.document).toEqual(before.document);expect(()=>session.apply(current,'not-published')).toThrow(/unknown|consumed/)
},60_000)
it('withholds native capture cleanup failure while keeping the caller complete context unchanged', () => {
  const current=fixture('lock'),before=clone(current),intent={...target(),change:{kind:'add' as const,spec:specFor(current,'lock')}},session=new ConfiguredAssemblyWorkerSession(),actual=CadEngine.prototype.dispose
  let calls=0;const spy=vi.spyOn(CadEngine.prototype,'dispose').mockImplementation(function(this:CadEngine){actual.call(this);calls++;throw Error('Original mechanical native release failure')})
  try{expect(()=>session.previewMechanicalEdit(current,intent)).toThrow();expect(calls).toBeGreaterThan(0)}finally{spy.mockRestore()}
  expect(current).toEqual(before);expect(()=>session.apply(current,'unpublished')).toThrow(/unknown|consumed/)
},60_000)
