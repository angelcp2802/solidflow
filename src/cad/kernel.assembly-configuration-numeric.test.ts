import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import lineOriginal from './fixtures/assembly-line-path-original.json'
import profileOriginal from './fixtures/assembly-profile-center-original.json'
import arcOriginal from './fixtures/assembly-material-arc-original.json'
import sphereOriginal from './fixtures/assembly-plane-sphere-tangent-original.json'
import hingeOriginal from './fixtures/assembly-hinge-original.json'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyMate, type AssemblyComponentReference, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { identityRigidPose, validateRigidPose } from '../model/rigidPose'
import * as inventories from '../model/assemblyConfigurationReferences'
import { AssemblyConfigurationGeometrySnapshot, type AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import * as observations from './kernel.assembly-configuration-relations'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import type { AssemblySceneBody } from './kernel.assembly-types'

import { buildConfiguredAssemblyConstraint } from './kernel.assembly-configuration-numeric'
import { configuredAssemblyEndpointFrame } from './kernel.assembly-configuration-endpoints'
import { measureConfiguredAssemblyHinge } from './kernel.assembly-configuration-hinge'
import { measureConfiguredAssemblyAdvanced } from './kernel.assembly-configuration-advanced'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { transformRigidPoint } from '../model/rigidPose'
import { solveRigidMates } from '../model/assemblySolver'
import { rigidMateConstraintEndpoints } from '../model/assemblyNumericMateEndpoints'
import type { RigidMateConstraint, RigidMateProblem } from '../model/assemblySolveTypes'
import {materializeAssemblyConfigurationNamedState} from '../model/assemblyConfigurationState'
import {createConfiguredAssemblyNumericalScope,assertConfiguredAssemblyNumericalScope,configuredAssemblyScopedEndpointFrame} from './kernel.assembly-configuration-scope'
import {buildConfiguredAssemblyScopedConstraint} from './kernel.assembly-configuration-numeric'
import {validateAssemblyConfigurationDeclarations} from '../model/assemblyConfigurationCore'
import {measureConfiguredAssemblyBinary} from './kernel.assembly-configuration-binary-measurement'
import {measureConfiguredAssemblyWidth} from './kernel.assembly-configuration-width'
import {measureConfiguredAssemblySymmetry} from './kernel.assembly-configuration-symmetry'
import {verifyConfiguredAssemblyGeometry} from './kernel.assembly-configuration-verification'
// Unchanged tracked original recipes, shared declaration recipes with the
// preceding reference inventory. Literal endpoint and physical oracles below
// are independent of the adapters, solver rows and world inverse composition.
const stamp = '2026-10-23T00:00:00.000Z'
const innerId = 'configured-relation-S'
const near = (actual: readonly number[], wanted: readonly number[], band = 1e-10) => {
  expect(actual).toHaveLength(wanted.length)
  actual.forEach((x, i) => { expect(Number.isFinite(x)).toBe(true); expect(Math.abs(x - wanted[i])).toBeLessThanOrEqual(band) })
}
const errors = (e: unknown): unknown[] => [e, ...(e instanceof AggregateError ? e.errors.flatMap(errors) : [])]
let probe: AssemblyDocument
let parts: EmbeddedPartDefinition[]
let bodies: Map<string, AssemblySceneBody>
let declarations: AssemblyMate[]

function part(raw: unknown, id: string): EmbeddedPartDefinition {
  const selected = validateAssemblyDocument(raw).definitions.find(value => value.id === id)
  if (selected?.kind !== 'part') throw Error('Tracked original part missing: ' + id)
  return selected
}
function component(owner: string): AssemblyComponentReference {
  const current = bodies.get(owner)!
  if (!current) throw Error('Original current source body missing')
  return structuredClone(current.component)
}
function plane(owner: string, axis: number, coordinate: number, sign = 1) {
  const rows = bodies.get(owner)!.faces.filter(row => row.support?.kind === 'plane'
    && row.support.normal[axis] * sign > .99 && Math.abs(row.support.point[axis] - coordinate) < 1e-10)
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), support: 'plane' as const }
}
function cylinder(owner: string) {
  const rows = bodies.get(owner)!.faces.filter(row => row.support?.kind === 'cylinder')
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), support: 'cylinder-surface' as const }
}
function axis(owner: string) { return { ...cylinder(owner), support: 'axis' as const } }
function sphere(owner: string) {
  const rows = bodies.get(owner)!.faces.filter(row => row.sphereSurface?.kind === 'sphere-surface')
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), support: 'sphere-surface' as const }
}
function edge(owner: string, bottom = false) {
  const rows = bodies.get(owner)!.edges!.filter(row => row.support?.kind === 'line'
    && Math.abs(row.support.axis[0]) > .99 && Math.abs(row.support.point[1] + 3) < 1e-10 && Math.abs(row.support.point[2] - (bottom ? 0 : 4)) < 1e-10)
  expect(rows).toHaveLength(1)
  return { kind: 'edge' as const, ...structuredClone(rows[0].selection), support: 'line' as const }
}
function vertex(owner: string, wanted = [-2, -3, 4]) {
  const rows = bodies.get(owner)!.vertexPoints!.filter(row => row.point.every((x, i) => Math.abs(x - wanted[i]) < 1e-10))
  expect(rows).toHaveLength(1)
  return { kind: 'vertex' as const, ...structuredClone(rows[0].selection), support: 'point' as const }
}
function line(owner: string) {
  const e = edge(owner)
  return { component: e.component, body: e.body, edge: e.edge, startVertex: vertex(owner).vertex }
}
function arc(owner: string) {
  const rows = bodies.get(owner)!.edges!.filter(row => row.circularPathOrigins?.length === 2 && row.lines.length > 0
    && row.lines.filter((_, i) => i % 3 === 2).every(z => Math.abs(z - 4) < 1e-10))
  expect(rows).toHaveLength(1)
  return { ...structuredClone(rows[0].selection), startVertex: vertex(owner, [5, -2, 4]).vertex }
}
function profile(owner: string, rectangle: boolean) {
  const face = plane(owner, 2, rectangle ? 4 : 3)
  return { face: { component: face.component, body: face.body, face: face.face }, axis: rectangle ? { edge: edge(owner).edge, sense: 1 as const } : null }
}
function makeDeclarations(): AssemblyMate[] {
  const base = (id: string, type: string) => ({ id, name: 'Original ' + id, type, suppressed: false })
  const pA = plane('box-a', 2, 4), pB = plane('box-b', 2, 4), cA = axis('circle-a'), cB = axis('circle-b')
  const q = [0, 0, 0, 1]
  const raw: unknown[] = [
    { ...base('concentric', 'concentric'), first: cA, second: cB, alignment: 'aligned', rotationLock: null },
    { ...base('coincident', 'coincident'), first: pA, second: pB, alignment: 'aligned' },
    { ...base('distance', 'distance'), first: pA, second: pB, alignment: 'aligned', distance: 2 },
    { ...base('limit-distance', 'limit-distance'), first: pA, second: pB, alignment: 'aligned', limits: { minimum: -2, maximum: 5 } },
    { ...base('limit-angle', 'limit-angle'), first: pA, second: edge('box-b'), coordinate: 'principal-direction', limits: { minimum: 10, maximum: 170 } },
    { ...base('limit-directed-angle', 'limit-directed-angle'), first: plane('box-a', 0, 2), second: plane('box-b', 0, 2), guide: cA, coordinate: 'directed-about-axis', arc: { start: 330, sweep: 60 } },
    { ...base('angle', 'angle'), first: pA, second: pB, angle: 40 },
    { ...base('parallel', 'parallel'), first: edge('box-a'), second: edge('box-b'), alignment: 'aligned' },
    { ...base('perpendicular', 'perpendicular'), first: pA, second: cB, alignment: 'aligned' },
    { ...base('tangent', 'tangent'), first: pA, second: cylinder('circle-b'), side: 'positive' },
    { ...base('skew-cylinder-tangent', 'skew-cylinder-tangent'), first: cylinder('circle-a'), second: cylinder('circle-b'), branch: { kind: 'external' } },
    { ...base('parallel-cylinder-tangent', 'parallel-cylinder-tangent'), first: cylinder('circle-a'), second: cylinder('circle-b'), branch: { kind: 'external' } },
    { ...base('plane-sphere-tangent', 'plane-sphere-tangent'), first: pA, second: sphere('sphere-b'), side: 'positive' },
    { ...base('sphere-sphere-tangent', 'sphere-sphere-tangent'), first: sphere('sphere-a'), second: sphere('sphere-b'), branch: { kind: 'external' } },
    { ...base('cylinder-sphere-tangent', 'cylinder-sphere-tangent'), first: cylinder('circle-a'), second: sphere('sphere-b'), branch: { kind: 'external' } },
    { ...base('lock', 'lock'), first: component('box-a'), second: component('box-b'), relativePose: identityRigidPose() },
    { ...base('gear', 'gear'), first: cA, second: cB, carrier: null, ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', neutralRotations: { first: q, second: q }, angles: { first: 0, second: 0 }, phase: 0 },
    { ...base('screw', 'screw'), first: cA, second: cB, lead: 5, reverse: false, alignment: 'aligned', neutralRotation: q, angle: 0, neutralTravel: 0 },
    { ...base('rack-pinion', 'rack-pinion'), first: cA, second: edge('box-b'), conversion: { mode: 'diameter', override: null }, reverse: false, neutralRotation: q, angle: 0, neutralTravel: 0 },
    { ...base('width', 'width'), mode: 'centered', width: [plane('box-a', 0, -2, -1), plane('box-a', 0, 2)], tab: [plane('box-b', 0, -2, -1), plane('box-b', 0, 2)], widthBranch: 'sum', tabBranch: 'sum', alignment: 'aligned' },
    { ...base('symmetry-point', 'symmetry'), entityKind: 'point', source: vertex('box-a'), target: vertex('box-b'), mirror: plane('box-a', 0, 2), alignment: null },
    { ...base('symmetry-line', 'symmetry'), entityKind: 'line', source: edge('box-a'), target: edge('box-b'), mirror: plane('box-a', 0, 2), alignment: 'aligned' },
    { ...base('symmetry-plane', 'symmetry'), entityKind: 'plane', source: pA, target: pB, mirror: plane('box-a', 0, 2), alignment: 'aligned' },
    { ...base('symmetry-sphere', 'symmetry'), entityKind: 'sphere', source: sphere('sphere-a'), target: sphere('sphere-b'), mirror: plane('box-a', 0, 2), alignment: null },
    { ...base('symmetry-cylinder', 'symmetry'), entityKind: 'cylinder', source: cylinder('circle-a'), target: cylinder('circle-b'), mirror: plane('box-a', 0, 2), alignment: 'aligned' },
    { ...base('profile-circle', 'profile-center'), first: profile('circle-a', false), second: profile('circle-b', false), alignment: 'aligned', offsetMm: 2, orientation: { mode: 'free' } },
    { ...base('profile-rectangle', 'profile-center'), first: profile('box-a', true), second: profile('box-b', true), alignment: 'opposed', offsetMm: 0, orientation: { mode: 'rectangle', quarterTurns: 3 } },
    { ...base('line-up', 'line-path'), point: vertex('box-b'), path: line('box-a'), position: { mode: 'distance', distanceMm: 1, reverse: false }, orientation: { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: { mode: 'up', axis: 'y', reverse: true, guide: pA } } },
    { ...base('circular-up', 'circular-path'), point: vertex('sector-b', [3, -2, 4]), path: arc('sector-a'), position: { mode: 'free', domain: 'trim' }, orientation: { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: { mode: 'up', axis: 'z', reverse: false, guide: pA } } },
    { ...base('hinge', 'hinge'), axis: [axis('hinge-a'), axis('hinge-b')], axial: [plane('hinge-a', 2, 4), plane('hinge-b', 2, 0, -1)], alignment: 'aligned' },
    { ...base('limited-hinge', 'hinge'), axis: [axis('hinge-a'), axis('hinge-b')], axial: [plane('hinge-a', 2, 4), plane('hinge-b', 2, 0, -1)], alignment: 'aligned', stops: { coordinate: 'directed-about-axis', angular: [plane('hinge-a', 0, 10), plane('hinge-b', 0, 10)], arc: { start: 330, sweep: 60 } } },
  ]
  return validateAssemblyDocument({ ...probe, mates: raw }).mates
}
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined }))
  parts = [part(lineOriginal, 'original-line-prism'), part(profileOriginal, 'original-profile-circle'), part(sphereOriginal, 'sphere-source-r3'), part(arcOriginal, 'original-quarter-sector'), part(hingeOriginal, 'original-hinge-leaf')]
  const occurrences = parts.flatMap((definition, i) => ['a', 'b'].map(suffix => ({ id: ['box', 'circle', 'sphere', 'sector', 'hinge'][i] + '-' + suffix, name: 'Original ' + suffix,
    definition: { id: definition.id, revision: definition.revision }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true })))
  probe = validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'configured-relation-root', revision: 'r1', name: 'Original configured relation metadata', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: parts, occurrences, mates: [] })
  const scene = buildAssemblyScene(probe)
  expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(10); expect(scene.prototypeCount).toBe(5)
  bodies = new Map(scene.bodies.map(body => [body.component.occurrencePath[0], body]))
  declarations = makeDeclarations()
}, 60_000)

function selected(ids: readonly string[]) { return declarations.filter(mate => ids.includes(mate.id)) }
function fixture(mates: readonly AssemblyMate[] = declarations): AssemblyConfigurationGeometryInput {
  const inner: EmbeddedAssemblyDefinition = { kind: 'assembly', id: innerId, revision: 'r1', name: 'Original relation namespace', createdAt: stamp, updatedAt: stamp, occurrences: structuredClone(probe.occurrences), mates: structuredClone(mates) as AssemblyMate[] }
  const occurrence = (id: string) => ({ id, name: id, definition: { id: inner.id, revision: inner.revision }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true })
  const left = occurrence('left'), right = occurrence('right')
  right.pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  const document = validateAssemblyDocument({ ...probe, definitions: [...parts, inner], occurrences: [left, right], mates: [] })
  const placed = { occurrenceId: 'box-b', pose: { translation: [2, 0, 0] as [number, number, number], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] as [number, number, number, number] } }
  return { document, rootConfiguration: 'posed', generation: 23, catalog: [
    { definition: { id: document.id, revision: document.revision }, configurations: [
      { id: 'posed', name: 'Right selected variant', occurrences: [{ occurrenceId: 'right', configuration: 'tilt' }], mates: [] },
      { id: 'paused', name: 'Right passive equations', occurrences: [{ occurrenceId: 'right', configuration: 'paused' }], mates: [] },
      { id: 'hidden', name: 'Right hidden', occurrences: [{ occurrenceId: 'right', configuration: 'tilt', visible: false }], mates: [] },
      { id: 'scope-off', name: 'Right namespace suppressed', occurrences: [{ occurrenceId: 'right', configuration: 'paused', suppressed: true }], mates: [] },
    ] },
    { definition: { id: inner.id, revision: inner.revision }, configurations: [
      { id: 'tilt', name: 'Effective material pose', occurrences: [placed], mates: [] },
      { id: 'paused', name: 'Suppressed equations, active scope', occurrences: [placed], mates: mates.filter(m => m.type === 'gear' || m.type === 'screw' || m.type === 'rack-pinion').map(m => ({ mateId: m.id, suppressed: true })) },
    ] },
  ] }
}
function inner(input: AssemblyConfigurationGeometryInput) {
  const current = input.document.definitions.find(d => d.id === innerId)
  if (current?.kind !== 'assembly') throw Error('Original current relation scope missing')
  return current
}

let current:AssemblyConfigurationGeometryInput
let snapshot:AssemblyConfigurationGeometrySnapshot
let rows:readonly observations.ConfiguredResolvedMate[]
beforeAll(()=>{
 current=fixture();snapshot=new AssemblyConfigurationGeometrySnapshot(current)
 rows=snapshot.resolveActiveMates(current)
},60_000)
afterAll(()=>snapshot?.dispose())
function row(id:string,side='right'){
 const value=rows.find(r=>r.mate.id===id&&r.scopePath[0]===side)
 if(!value)throw Error('Original configured relation missing '+id)
 return value
}
const families=['concentric','coincident','distance','limit-distance','limit-angle','limit-directed-angle','angle','parallel','perpendicular','tangent','skew-cylinder-tangent','parallel-cylinder-tangent','plane-sphere-tangent','sphere-sphere-tangent','cylinder-sphere-tangent','lock','gear','screw','rack-pinion','width','symmetry-point','symmetry-line','symmetry-plane','symmetry-sphere','symmetry-cylinder','profile-circle','profile-rectangle','line-up','circular-up','hinge','limited-hinge']
it.each(families)('builds numerical intent for %s from both independently selected rigid states',id=>{
 const before=JSON.stringify(current)
 for(const side of ['left','right']){
  const value=row(id,side),constraint=buildConfiguredAssemblyConstraint(snapshot,current,value,side+'-'+id)
  expect(constraint.type).toBe(value.mate.type);expect(constraint.id).toBe(side+'-'+id)
  for(const e of rigidMateConstraintEndpoints(constraint)){
   if(!e)continue
   expect(e.bodyId).toBe(side)
   expect(e.frame.translation.every(Number.isFinite)).toBe(true)
  }
  expect('token'in constraint).toBe(false);snapshot.assertResolvedMate(value,current)
 }
 expect(JSON.stringify(current)).toBe(before)
})
it('recomposes the effective descendant frame and preserves literal material coordinates',()=>{
 const value=row('coincident');if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
 const first=configuredAssemblyEndpointFrame(snapshot,current,value.first),second=configuredAssemblyEndpointFrame(snapshot,current,value.second)
 near(first.frame.translation,[0,0,0]);near(first.frame.rotation,[0,0,0,1]);near(second.frame.translation,[2,0,0])
 near(transformRigidPoint(second.frame,[-2,-3,4]),[0,-4,-3])
 const c=buildConfiguredAssemblyConstraint(snapshot,current,value,'literal')
 if(c.type!=='coincident'||c.second.support?.kind!=='plane')throw Error('plane')
 near(transformRigidPoint(c.second.frame,[0,0,4]),[2,-4,0])
 expect(c.first.bodyId).toBe('right');expect(c.second.bodyId).toBe('right')
})
it('keeps a null saved gear carrier as the actual declaring rigid frame',()=>{
 const c=buildConfiguredAssemblyConstraint(snapshot,current,row('gear'),'carrier')
 if(c.type!=='gear'||!c.carrier)throw Error('carrier')
 expect(c.carrier.bodyId).toBe('right');near(c.carrier.frame.translation,[0,0,0]);near(c.carrier.frame.rotation,[0,0,0,1])
})
it('numerical copies cannot mutate issued material proofs or their original context',()=>{
 const value=row('symmetry-cylinder'),before=JSON.stringify(value),c=buildConfiguredAssemblyConstraint(snapshot,current,value,'detached')
 if(c.type!=='symmetry'||c.source.support?.kind!=='cylinder')throw Error('cylinder')
 c.source.support.point[0]=999;c.source.frame.translation[0]=999;c.uncertainty![0].positionErrorMm=999
 expect(JSON.stringify(value)).toBe(before);snapshot.assertResolvedMate(value,current)
})
it('rejects copied aggregates, copied witnesses, foreign sessions, legacy proofs and disposed snapshots',()=>{
 const value=row('coincident'),another=new AssemblyConfigurationGeometrySnapshot(current)
 try{
  expect(()=>buildConfiguredAssemblyConstraint(snapshot,current,structuredClone(value),'clone')).toThrow()
  expect(()=>buildConfiguredAssemblyConstraint(another,current,value,'foreign')).toThrow()
  if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
  expect(()=>configuredAssemblyEndpointFrame(snapshot,current,structuredClone(value.first))).toThrow()
  const legacy=new AssemblyGeometrySnapshot(current.document)
  try{const old=legacy.resolveActiveMates(current.document)[0];expect(()=>buildConfiguredAssemblyConstraint(snapshot,current,old as never,'legacy')).toThrow()}finally{legacy.dispose()}
 }finally{another.dispose()}
 expect(()=>buildConfiguredAssemblyConstraint(another,current,value,'closed')).toThrow()
})
it.each(['generation','rootConfiguration','catalog','document'] as const)('rejects changed complete context field %s',field=>{
 const input=fixture(selected(['coincident'])),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input)[0],changed=structuredClone(input)
  if(field==='generation')changed.generation++
  if(field==='rootConfiguration')changed.rootConfiguration='hidden'
  if(field==='catalog')changed.catalog[0].configurations[0].name+=' changed'
  if(field==='document')changed.document.name+=' changed'
  expect(()=>buildConfiguredAssemblyConstraint(s,changed,r,'changed')).toThrow()
  expect(()=>s.assertResolvedMate(r,input)).toThrow()
 }finally{s.dispose()}
})
it('rejects executable or invalid numerical bands before reading accessors',()=>{
 let reads=0;const band={get lengthToleranceMm(){reads++;return 1e-6}}
 expect(()=>buildConfiguredAssemblyConstraint(snapshot,current,row('distance'),'bad',band)).toThrow();expect(reads).toBe(0)
 for(const value of [0,-1,NaN,Infinity])expect(()=>buildConfiguredAssemblyConstraint(snapshot,current,row('distance'),'bad',{lengthToleranceMm:value})).toThrow()
 expect(()=>buildConfiguredAssemblyConstraint(snapshot,current,row('distance'),'')).toThrow()
 snapshot.assertResolvedMate(row('distance'),current)
})

function rootHinge(limited=false):AssemblyConfigurationGeometryInput{
 const input=fixture([]),mate=structuredClone(selected([limited?'limited-hinge':'hinge'])[0])
 if(mate.type!=='hinge')throw Error('hinge')
 for(let i=0;i<2;i++)for(const ref of [mate.axis[i],mate.axial[i],...(mate.stops?[mate.stops.angular[i]]:[])]){if(!ref.component)throw Error('Original material reference');ref.component.occurrencePath.unshift(i?'right':'left')}
 input.document.mates=[mate];input.document.occurrences[0].fixed=true
 // The active root state deliberately owns this pose override. The base
 // occurrence must remain unchanged when the numerical experiment is written.
 input.catalog[0].configurations[0].occurrences[0].pose=structuredClone(input.document.occurrences[1].pose)
 return input
}
function experiment(input:AssemblyConfigurationGeometryInput){
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input)[0],constraint=buildConfiguredAssemblyConstraint(s,input,r,'experiment')
  const evaluation=evaluateAssemblyConfiguration(input.document,input.catalog,input.rootConfiguration),root=evaluation.scopes.find(s=>s.path.length===0)!
  const problem:RigidMateProblem={bodies:root.occurrences.filter(o=>!o.suppressed).map(o=>({id:o.id,pose:validateRigidPose(o.pose),fixed:o.fixed})),constraints:[constraint],origin:[0,0,0],lengthScale:40,lengthTolerance:1e-6,angleTolerance:1e-8}
  const result=solveRigidMates(problem)
  expect(['underdefined','fullyDefined']).toContain(result.status);expect(result.poses).not.toBeNull()
  const candidate=structuredClone(input);candidate.generation++
  candidate.catalog[0].configurations[0].occurrences[0].pose=structuredClone(result.poses!.get('right')!)
  expect(candidate.document).toEqual(input.document)
  return {candidate,result,constraint}
 }finally{s.dispose()}
}
it.each([false,true])('solves a displaced configured root hinge (limited=%s) and independently remeasures fresh native geometry',limited=>{
 const input=rootHinge(limited),before=JSON.stringify(input),{candidate,result,constraint}=experiment(input)
 if(constraint.type!=='hinge')throw Error('hinge')
 expect(constraint.axis.map(e=>e.bodyId)).toEqual(['left','right']);expect(constraint.axial.map(e=>e.bodyId)).toEqual(['left','right'])
 near(candidate.catalog[0].configurations[0].occurrences[0].pose!.translation,[0,0,4],1e-6)
 const fresh=new AssemblyConfigurationGeometrySnapshot(candidate)
 try{
  const r=fresh.resolveActiveMates(candidate)[0];if(!observations.isConfiguredResolvedHingeMate(r))throw Error('hinge')
  const report=measureConfiguredAssemblyHinge(fresh,candidate,r)
  expect(report.status).toBe('ok');if(report.status!=='ok')throw Error('Hinge precision')
  expect(report.satisfied).toBe(true);expect(report.verificationOnly).toBe(true)
  if(limited){expect('angleRadians'in report).toBe(true)}else{expect(result.rank).toBe(5);expect(result.localDOF).toBe(1)}
 }finally{fresh.dispose()}
 expect(JSON.stringify(input)).toBe(before)
},60_000)
it('rejects a radial plane for hinge axial qualification although its native inventory is valid',()=>{
 const input=rootHinge();const mate=input.document.mates[0];if(mate.type!=='hinge')throw Error('hinge')
 mate.axial[1]={...plane('hinge-b',0,10),component:{...component('hinge-b'),occurrencePath:['right','hinge-b']}}
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{const r=s.resolveActiveMates(input)[0];expect(()=>buildConfiguredAssemblyConstraint(s,input,r,'radial')).toThrow(/axial|perpendicular|radial/)}finally{s.dispose()}
})
it('retains huge original placement-chain terms even when the effective local result cancels',()=>{
 const input=fixture(selected(['coincident']));input.document.occurrences[1].pose.translation=[1e14,0,0]
 const variant=input.catalog[1].configurations[0].occurrences[0];variant.pose!.translation=[-1e14,0,0]
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{const r=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!;expect(()=>buildConfiguredAssemblyConstraint(s,input,r,'cancelled')).toThrow(/precision/)}finally{s.dispose()}
})
it('keeps angular-only intervals independent of unused distant translations',()=>{
 const input=fixture(selected(['limit-angle']));input.document.occurrences[1].pose.translation=[1e14,0,0]
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{const r=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!,c=buildConfiguredAssemblyConstraint(s,input,r,'direction');expect(c.type).toBe('limit-angle')}finally{s.dispose()}
})
it.each(['profile-circle','profile-rectangle'])('measures %s centers independently of numerical constraints',id=>{
 const r=row(id);if(!observations.isConfiguredResolvedProfileCenterMate(r))throw Error('profile')
 const report=measureConfiguredAssemblyAdvanced(snapshot,current,r)
 expect(report.family).toBe('profile-center');expect(report.status).toBe('ok');expect(report.verificationOnly).toBe(true)
 if(report.family!=='profile-center'||report.status!=='ok')throw Error('profile report')
 expect(report.satisfied).toBe(false)
 expect(report.positionResidualMm).toBeCloseTo(id==='profile-circle'?2:6,10)
 expect(report.normalAngleRadians).toBeCloseTo(id==='profile-circle'?0:Math.PI/2,10)
})
it('independently measures the effective LINE material point, coordinate and Follow/UP',()=>{
 const r=row('line-up');if(!observations.isConfiguredResolvedLinePathMate(r))throw Error('LINE')
 const report=measureConfiguredAssemblyAdvanced(snapshot,current,r)
 expect(report.family).toBe('line-path');expect(report.status).toBe('ok');expect(report.verificationOnly).toBe(true)
 if(report.family!=='line-path'||report.status!=='ok')throw Error('LINE report')
 expect(report.coordinateMm).toBeCloseTo(2,10);expect(report.targetCoordinateMm).toBe(1)
 expect(report.transverseResidualMm).toBeCloseTo(Math.sqrt(50),10);expect(report.positionResidualMm).toBeCloseTo(Math.sqrt(51),10)
 expect(report.orientationResidualRad).toBeCloseTo(0,10);expect(report.rollResidualRad).toBeCloseTo(Math.PI,10);expect(report.satisfied).toBe(false)
})
function fixedArc(){
 const mate=structuredClone(selected(['circular-up'])[0]);if(mate.type!=='circular-path')throw Error('arc')
 mate.point=vertex('sector-b',[5,-2,4]);mate.position={mode:'coordinate',distanceMm:0};mate.orientation={pitchYaw:'free',roll:'free'}
 return fixture([mate])
}
it('queries actual material circular D1 at a fixed distance and checks the literal R2 quarter arc',()=>{
 const input=fixedArc(),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  for(const r of s.resolveActiveMates(input)){
   if(!observations.isConfiguredResolvedCircularPathMate(r))throw Error('arc')
   const c=buildConfiguredAssemblyConstraint(s,input,r,'fixed-arc');if(c.type!=='circular-path')throw Error('arc')
   expect(c.second.arc.radiusMm).toBeCloseTo(2,10);expect(c.second.arc.sweepRad).toBeCloseTo(Math.PI/2,10)
   const report=measureConfiguredAssemblyAdvanced(s,input,r)
   expect(report.family).toBe('circular-path');expect(report.status).toBe('ok')
   if(report.family!=='circular-path'||report.status!=='ok')throw Error('arc report')
   expect(report.satisfied).toBe(true);expect(report.targetCoordinateMm).toBe(0);expect(report.positionResidualMm).toBeLessThanOrEqual(1e-10)
   expect(report.radiusMm).toBeCloseTo(2,10);expect(report.curveLengthMm).toBeCloseTo(Math.PI,10)
  }
 }finally{s.dispose()}
})
it('rejects copied advanced and six-role physical-measurement aggregates',()=>{
 const advanced=row('profile-circle'),hinge=row('limited-hinge')
 if(!observations.isConfiguredResolvedProfileCenterMate(advanced)||!observations.isConfiguredResolvedHingeMate(hinge))throw Error('families')
 expect(()=>measureConfiguredAssemblyAdvanced(snapshot,current,structuredClone(advanced))).toThrow()
 expect(()=>measureConfiguredAssemblyHinge(snapshot,current,structuredClone(hinge))).toThrow()
})
function seatedLimited(){
 const input=rootHinge(true)
 input.catalog[0].configurations[0].occurrences[0].pose={translation:[0,0,4],rotation:[0,0,0,1]}
 return input
}
it('independently measures all six seated roles and the wrapped angular stop margins',()=>{
 const input=seatedLimited(),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input)[0];if(!observations.isConfiguredResolvedHingeMate(r))throw Error('hinge')
  const report=measureConfiguredAssemblyHinge(s,input,r)
  expect(report.status).toBe('ok');if(report.status!=='ok'||!report.limited)throw Error('limited hinge')
  expect(report.satisfied).toBe(true);expect(report.hinge.qualifiedRotation).toBe(true)
  expect(report.angleRadians).toBeCloseTo(0,10);expect(report.marginsRadians.minimum).toBeCloseTo(Math.PI/6,10);expect(report.marginsRadians.maximum).toBeCloseTo(Math.PI/6,10)
  expect(report.directionErrorRad).toBeLessThanOrEqual(1e-8)
  expect(report.componentPaths.angular).toEqual([['left','hinge-a'],['right','hinge-b']]);expect(report.scopePath).toEqual([]);expect(report.configuration).toBe('posed')
 }finally{s.dispose()}
})
it('withholds six-role angular measurement when a real angular normal projects onto its hinge axis',()=>{
 const input=seatedLimited(),mate=input.document.mates[0];if(mate.type!=='hinge'||!mate.stops)throw Error('hinge')
 if(mate.axial[0].kind!=='face')throw Error('Original axial face');mate.stops.angular[0]=structuredClone(mate.axial[0])
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input)[0];if(!observations.isConfiguredResolvedHingeMate(r))throw Error('hinge')
  const c=buildConfiguredAssemblyConstraint(s,input,r,'unobservable');expect(c.type).toBe('hinge')
  expect(measureConfiguredAssemblyHinge(s,input,r).status).toBe('precisionLimit')
 }finally{s.dispose()}
})
it('does not accept a nominally seated hinge when native support errors consume the remaining band',()=>{
 const input=seatedLimited();input.catalog[0].configurations[0].occurrences[0].pose!.translation[2]+=0.8e-6
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{const r=s.resolveActiveMates(input)[0];if(!observations.isConfiguredResolvedHingeMate(r))throw Error('hinge');expect(measureConfiguredAssemblyHinge(s,input,r).status).toBe('precisionLimit')}finally{s.dispose()}
})
it('revokes a fixed circular measurement when its real D1 query reenters and changes the context',()=>{
 const input=fixedArc(),s=new AssemblyConfigurationGeometrySnapshot(input)
 const r=s.resolveActiveMates(input)[0];if(!observations.isConfiguredResolvedCircularPathMate(r))throw Error('arc')
 const real=CadEngine.prototype.inspectCurrentArcPathEvaluation
 const spy=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPathEvaluation').mockImplementation(function(this:CadEngine,...args){const observed=real.apply(this,args);input.generation++;return observed})
 try{expect(()=>measureConfiguredAssemblyAdvanced(s,input,r)).toThrow();expect(spy).toHaveBeenCalledTimes(1);expect(()=>s.assertResolvedMate(r,input)).toThrow()}finally{spy.mockRestore();s.dispose()}
})
function rootAdvanced(id:string){
 const input=fixture([]),mate=structuredClone(selected([id])[0])
 const prefix=(reference:AssemblyComponentReference,owner:string)=>reference.occurrencePath.unshift(owner)
 if(mate.type==='profile-center'){
  prefix(mate.first.face.component,'left');prefix(mate.second.face.component,'right')
 }else if(mate.type==='line-path'||mate.type==='circular-path'){
  prefix(mate.point.component,'right');prefix(mate.path.component,'left')
  mate.orientation={pitchYaw:'free',roll:'free'}
  if(mate.type==='circular-path')mate.position={mode:'coordinate',distanceMm:0}
 }else throw Error('Advanced original mate')
 input.document.mates=[mate];input.document.occurrences[0].fixed=true
 input.catalog[0].configurations[0].occurrences[0].pose=structuredClone(input.document.occurrences[1].pose)
 return input
}
it.each(['profile-circle','profile-rectangle','line-up','circular-up'])('solves configured %s between root owners and rechecks fresh material geometry',id=>{
 const input=rootAdvanced(id),before=JSON.stringify(input),{candidate}=experiment(input)
 const fresh=new AssemblyConfigurationGeometrySnapshot(candidate)
 try{
  const r=fresh.resolveActiveMates(candidate)[0]
  if(!observations.isConfiguredResolvedProfileCenterMate(r)&&!observations.isConfiguredResolvedLinePathMate(r)&&!observations.isConfiguredResolvedCircularPathMate(r))throw Error('Advanced mate')
  const report=measureConfiguredAssemblyAdvanced(fresh,candidate,r)
  expect(report.status).toBe('ok');if(report.status!=='ok')throw Error('Advanced precision '+id)
  expect(report.satisfied).toBe(true);expect(report.positionResidualMm).toBeLessThanOrEqual(1e-6)
  expect(report.verificationOnly).toBe(true);expect(report.compatibilityAuthority).toBe(false)
 }finally{fresh.dispose()}
 expect(JSON.stringify(input)).toBe(before)
},60_000)
it('preserves a small effective child offset beneath a rounded distant root owner',()=>{
 const input=fixture([]);input.document.occurrences[1].pose={translation:[1e16,0,0],rotation:[0,0,0,1]}
 input.catalog[1].configurations[0].occurrences[0].pose={translation:[0.25,0,0],rotation:[0,0,0,1]}
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const reference={...component('box-b'),occurrencePath:['right','box-b']}
  const w=s.resolveComponentReference(input,reference),e=configuredAssemblyEndpointFrame(s,input,w)
  expect(w.declaredWorldPose.translation[0]).toBe(1e16);near(e.frame.translation,[0.25,0,0]);expect(e.bodyId).toBe('right')
 }finally{s.dispose()}
})
it.each([false,true])('distinguishes a precise excluded hinge phase from an explicit full circle (full=%s)',full=>{
 const input=seatedLimited(),mate=input.document.mates[0];if(mate.type!=='hinge'||!mate.stops)throw Error('hinge')
 mate.stops.arc={start:30,sweep:full?360:60}
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input)[0];if(!observations.isConfiguredResolvedHingeMate(r))throw Error('hinge')
  const report=measureConfiguredAssemblyHinge(s,input,r)
  expect(report.status).toBe('ok');if(report.status!=='ok'||!report.limited)throw Error('limited report')
  expect(report.fullCircle).toBe(full);expect(report.satisfied).toBe(full);expect(report.hinge.satisfied).toBe(true)
  expect(report.angleRadians).toBeCloseTo(0,10)
 }finally{s.dispose()}
})
function freeArc(domain:'trim'|'support-circle',pose=identityRigidPose(),follow=false){
 const mate=structuredClone(selected(['circular-up'])[0]);if(mate.type!=='circular-path')throw Error('arc')
 mate.position={mode:'free',domain}
 if(!follow)mate.orientation={pitchYaw:'free',roll:'free'}
 const input=fixture([mate]);input.catalog[1].configurations[0].occurrences.push({occurrenceId:'sector-b',pose})
 return input
}
it('independently measures a configured Free arc interior with changing tangent Follow and material UP',()=>{
 // θ=π/4, R=2: P=(3+√2,-2+√2,4), tangent=(-1,1,0)/√2.
 // Rz135 maps component X to that tangent; the literal translation below
 // maps the original material point (3,-2,4) to P. No solver supplies either.
 const q=3*Math.PI/8,input=freeArc('trim',{translation:[3+3*Math.SQRT1_2,-2-3*Math.SQRT1_2,0],rotation:[0,0,Math.sin(q),Math.cos(q)]},true)
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!;if(!observations.isConfiguredResolvedCircularPathMate(r))throw Error('arc')
  const report=measureConfiguredAssemblyAdvanced(s,input,r)
  expect(report.family).toBe('circular-path');expect(report.status).toBe('ok')
  if(report.family!=='circular-path'||report.status!=='ok')throw Error('Free interior')
  expect(report.satisfied).toBe(true);expect(report.targetCoordinateMm).toBeNull();expect(report.coordinateMm).toBeCloseTo(Math.PI/2,10)
  expect(report.positionResidualMm).toBeLessThanOrEqual(1e-10);expect(report.orientationResidualRad).toBeLessThanOrEqual(1e-10);expect(report.rollResidualRad).toBeLessThanOrEqual(1e-10)
  expect(report.domainMarginsMm!.minimum).toBeCloseTo(Math.PI/2,10);expect(report.domainMarginsMm!.maximum).toBeCloseTo(Math.PI/2,10)
 }finally{s.dispose()}
})
it.each(['trim','support-circle'] as const)('checks an actual circular point outside the native quarter trim under Free %s semantics',domain=>{
 // θ=-π/2 gives P=(3,-4,4), on the supporting circle, outside [0,π/2].
 // Its nearest finite endpoint is (5,-2,4), at distance √8.
 const input=freeArc(domain,{translation:[0,-2,0],rotation:[0,0,0,1]}),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!;if(!observations.isConfiguredResolvedCircularPathMate(r))throw Error('arc')
  const report=measureConfiguredAssemblyAdvanced(s,input,r)
  expect(report.family).toBe('circular-path');expect(report.status).toBe('ok')
  if(report.family!=='circular-path'||report.status!=='ok')throw Error('Free domain')
  expect(report.satisfied).toBe(domain==='support-circle');expect(report.coordinateMm).toBeCloseTo(-Math.PI,10)
  expect(report.positionResidualMm).toBeCloseTo(domain==='trim'?Math.sqrt(8):0,10)
  if(domain==='trim'){expect(report.domainMarginsMm!.minimum).toBeCloseTo(-Math.PI,10);expect(report.domainMarginsMm!.maximum).toBeCloseTo(2*Math.PI,10)}else expect(report.domainMarginsMm).toBeNull()
 }finally{s.dispose()}
})
it('withholds Free circular phase at the material circle center and returns finite or explicit-null data',()=>{
 const r=row('circular-up');if(!observations.isConfiguredResolvedCircularPathMate(r))throw Error('arc')
 const report=measureConfiguredAssemblyAdvanced(snapshot,current,r)
 expect(report.family).toBe('circular-path');expect(report.status).toBe('precisionLimit')
 if(report.family!=='circular-path')throw Error('arc')
 expect(report.satisfied).toBe(false);expect(report.coordinateMm).toBeNull();expect(report.precision.tangentErrorRad).toBeNull()
 const finite=(v:unknown):void=>{if(typeof v==='number')expect(Number.isFinite(v)).toBe(true);else if(v&&typeof v==='object')for(const child of Object.values(v))finite(child)}
 finite(report)
})
function configuredCaptures(){
 const input=fixture(selected(['concentric','lock','gear','screw','rack-pinion']))
 const captureData=[
  {mateId:'concentric',state:{type:'concentric',rotationLock:[0,0,Math.SQRT1_2,Math.SQRT1_2]}},
  {mateId:'lock',state:{type:'lock',relativePose:{translation:[7,-3,2],rotation:[0,0,0,1]}}},
  {mateId:'gear',state:{type:'gear',neutralRotations:{first:[0,0,0,1],second:[0,0,Math.SQRT1_2,Math.SQRT1_2]},angles:{first:4*Math.PI,second:-2*Math.PI},phase:3}},
  {mateId:'screw',state:{type:'screw',neutralRotation:[0,0,0,1],neutralTravel:17,angle:2*Math.PI}},
  {mateId:'rack-pinion',state:{type:'rack-pinion',neutralRotation:[0,0,0,1],neutralTravel:-7,angle:-Math.PI/2}},
 ]
 const states=captureData.map(row=>({definition:{id:innerId,revision:'r1'},configuration:'tilt',...row}))
 const sourceBefore=JSON.stringify(input.document),catalogBefore=JSON.stringify(input.catalog)
 const materialized=materializeAssemblyConfigurationNamedState(input.document,input.catalog,states)
 expect(JSON.stringify(input.document)).toBe(sourceBefore);expect(JSON.stringify(input.catalog)).toBe(catalogBefore)
 // This is declarative serialized input, never a reconstructed native proof.
 input.catalog=JSON.parse(JSON.stringify(materialized));return input
}
it('carries five independent selected capture states through actual native aggregates and numerical adapters',()=>{
 const input=configuredCaptures(),before=JSON.stringify(input),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const rows=s.resolveActiveMates(input);expect(rows).toHaveLength(10)
  for(const r of rows){
   const c=buildConfiguredAssemblyConstraint(s,input,r,r.scopePath[0]+'-'+r.mate.id),changed=r.scopePath[0]==='right'
   switch(c.type){
    case 'concentric':expect(c.rotationLock).toEqual(changed?[0,0,Math.SQRT1_2,Math.SQRT1_2]:null);break
    case 'lock':near(c.relativePose.translation,changed?[7,-3,2]:[0,0,0]);break
    case 'gear':expect(c.angles).toEqual(changed?{first:4*Math.PI,second:-2*Math.PI}:{first:0,second:0});expect(c.phase).toBe(changed?3:0);expect(c.ratio).toEqual({numerator:1,denominator:2});break
    case 'screw':expect(c.angle).toBe(changed?2*Math.PI:0);expect(c.neutralTravel).toBe(changed?17:0);expect(c.lead).toBe(5);break
    case 'rack-pinion':expect(c.angle).toBe(changed?-Math.PI/2:0);expect(c.neutralTravel).toBe(changed?-7:0);expect(c.conversion).toEqual({mode:'diameter',override:null});break
    default:throw Error('Original mechanical family changed')
   }
   s.assertResolvedMate(r,input)
  }
  expect(JSON.stringify(input)).toBe(before)
 }finally{s.dispose()}
})
it('invalidates every native proof when a selected capture changes even if geometry and selector stay equal',()=>{
 const input=configuredCaptures(),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const r=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right'&&r.mate.id==='gear')!
  const override=input.catalog[1].configurations[0].mates.find(m=>m.mateId==='gear')!
  if(override.capture?.type!=='gear')throw Error('Gear capture')
  override.capture.angles.first+=2*Math.PI
  expect(()=>s.assertResolvedMate(r,input)).toThrow();expect(()=>s.resolveActiveMates(input)).toThrow()
 }finally{s.dispose()}
})
it('validates malformed dormant native capture data before allocating any native prototype',()=>{
 const input=configuredCaptures(),variant=input.catalog[1].configurations[1]
 variant.mates.push({mateId:'gear',suppressed:true,capture:{type:'gear',neutralRotations:{first:[0,0,0,1],second:[0,0,0,1]},angles:{first:Infinity,second:0},phase:0}})
 const rebuild=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences')
 try{expect(()=>new AssemblyConfigurationGeometrySnapshot(input)).toThrow();expect(rebuild).not.toHaveBeenCalled()}finally{rebuild.mockRestore()}
})

// Scoped numerical projection is a new consumer of the same privately issued
// current material proofs. It cannot change their physical full-root owner.
// All preceding cases and original recipes remain unchanged.
it.each(families)('projects every %s role into both exact declaring scopes without changing material intent',id=>{
 const before=JSON.stringify(current)
 for(const side of ['left','right']){
  const value=row(id,side),proofBefore=JSON.stringify(value),scope=createConfiguredAssemblyNumericalScope(snapshot,current,[side])
  expect(assertConfiguredAssemblyNumericalScope(snapshot,current,scope)).toBe(scope)
  expect(scope.kind).toBe('configured-numerical-scope');expect(scope.scopePath).toEqual([side])
  expect(scope.definition).toEqual({id:innerId,revision:'r1'});expect(scope.configuration).toBe(side==='right'?'tilt':null)
  expect(scope.bodies).toHaveLength(10);expect(scope.bodies.map(b=>b.id)).toEqual(probe.occurrences.map(o=>o.id))
  const box=scope.bodies.find(b=>b.id==='box-b')!
  near(box.pose.translation,side==='right'?[2,0,0]:[0,0,0]);near(box.pose.rotation,side==='right'?[Math.SQRT1_2,0,0,Math.SQRT1_2]:[0,0,0,1])
  expect(scope.bodies.every(b=>b.fixed===false)).toBe(true)
  const result=buildConfiguredAssemblyScopedConstraint(snapshot,current,scope,value,'scoped-'+id)
  const endpoints=rigidMateConstraintEndpoints(result),witnesses=observations.configuredResolvedMateWitnesses(value)
  expect(endpoints).toHaveLength(witnesses.length)
  endpoints.forEach((endpoint,i)=>{
   if(!endpoint)throw Error('Every configured scoped role has an explicit endpoint, including its static carrier')
   expect(endpoint.bodyId).toBe(witnesses[i].componentPath[1]??null)
   near(endpoint.frame.translation,[0,0,0]);near(endpoint.frame.rotation,[0,0,0,1])
   expect(witnesses[i].topLevelOwner).toBe(side)
  })
  // Only numerical incidence changes. Retained uncertainty, material supports,
  // ordered roles, parameters, captures and optional Follow/UP remain exact.
  const old=buildConfiguredAssemblyConstraint(snapshot,current,value,'scoped-'+id),copy=structuredClone(result)
  for(const c of [old,copy])for(const endpoint of rigidMateConstraintEndpoints(c))if(endpoint){endpoint.bodyId=null;endpoint.frame=identityRigidPose()}
  expect(copy).toEqual(old)
  expect(JSON.stringify(value)).toBe(proofBefore);snapshot.assertResolvedMate(value,current)
  expect(Object.isFrozen(scope)).toBe(true);expect(Object.isFrozen(scope.bodies[0].pose.translation)).toBe(true)
  expect('nativeAuthority'in scope).toBe(false);expect('applyToken'in result).toBe(false)
 }
 expect(JSON.stringify(current)).toBe(before)
})

it('keeps the existing root adapter equivalent for an actual root-declared constraint',()=>{
 const input=rootHinge(true),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const value=s.resolveActiveMates(input)[0],scope=createConfiguredAssemblyNumericalScope(s,input,[])
  expect(scope.bodies.map(b=>b.id)).toEqual(['left','right']);expect(scope.bodies[0].fixed).toBe(true)
  expect(buildConfiguredAssemblyScopedConstraint(s,input,scope,value,'root')).toEqual(buildConfiguredAssemblyConstraint(s,input,value,'root'))
 }finally{s.dispose()}
})

it('keeps null principal geometry and a null gear carrier fixed at the selected declaring origin',()=>{
 const input=fixture([]),mate={...selected(['distance'])[0]}
 if(mate.type!=='distance')throw Error('distance')
 mate.first={kind:'principal-plane',component:null,plane:'XY'};inner(input).mates=[mate,structuredClone(selected(['gear'])[0])]
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const values=s.resolveActiveMates(input).filter(r=>r.scopePath[0]==='right'),scope=createConfiguredAssemblyNumericalScope(s,input,['right'])
  for(const value of values){
   const c=buildConfiguredAssemblyScopedConstraint(s,input,scope,value,'static-'+value.mate.id)
   if(c.type==='distance'){
    expect(c.first.bodyId).toBeNull();near(c.first.frame.translation,[0,0,0]);near(c.first.frame.rotation,[0,0,0,1]);expect(c.second.bodyId).toBe('box-b')
   }else if(c.type==='gear'&&c.carrier){
    expect(c.carrier.bodyId).toBeNull();near(c.carrier.frame.translation,[0,0,0]);near(c.carrier.frame.rotation,[0,0,0,1])
   }else throw Error('Expected both independent static-role cases')
  }
  expect(values).toHaveLength(2)
 }finally{s.dispose()}
})

it('projects a scope component itself to a static numerical frame without minting a material proof',()=>{
 const scope=createConfiguredAssemblyNumericalScope(snapshot,current,['right']),witness=snapshot.resolveComponentReference(current,null,['right'])
 const before=JSON.stringify(witness),frame=configuredAssemblyScopedEndpointFrame(snapshot,current,scope,witness)
 expect(frame.bodyId).toBeNull();near(frame.frame.translation,[0,0,0]);near(frame.frame.rotation,[0,0,0,1])
 expect(witness.topLevelOwner).toBe('right');expect(JSON.stringify(witness)).toBe(before)
 expect(()=>snapshot.assertWitness(scope as never,current)).toThrow();snapshot.assertWitness(witness,current)
})

it('requires the exact declaration instance rather than an equal source tuple or descendant namespace',()=>{
 const right=createConfiguredAssemblyNumericalScope(snapshot,current,['right']),root=createConfiguredAssemblyNumericalScope(snapshot,current,[]),value=row('coincident')
 expect(()=>buildConfiguredAssemblyScopedConstraint(snapshot,current,right,row('coincident','left'),'sibling')).toThrow()
 expect(()=>buildConfiguredAssemblyScopedConstraint(snapshot,current,root,value,'descendant')).toThrow()
 if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
 const left=row('coincident','left');if(!observations.isConfiguredResolvedBinaryMate(left))throw Error('binary')
 expect(()=>configuredAssemblyScopedEndpointFrame(snapshot,current,right,left.first)).toThrow()
 expect(()=>configuredAssemblyScopedEndpointFrame(snapshot,current,right,structuredClone(value.first))).toThrow()
 snapshot.assertResolvedMate(value,current);expect(assertConfiguredAssemblyNumericalScope(snapshot,current,right)).toBe(right)
})

it('rejects cloned and foreign numerical scopes, aggregate clones and legacy grants without revoking valid input',()=>{
 const scope=createConfiguredAssemblyNumericalScope(snapshot,current,['right']),value=row('coincident'),foreign=new AssemblyConfigurationGeometrySnapshot(current)
 try{
  expect(()=>assertConfiguredAssemblyNumericalScope(snapshot,current,structuredClone(scope))).toThrow()
  expect(()=>assertConfiguredAssemblyNumericalScope(foreign,current,scope)).toThrow()
  expect(()=>buildConfiguredAssemblyScopedConstraint(snapshot,current,structuredClone(scope),value,'scope-clone')).toThrow()
  expect(()=>buildConfiguredAssemblyScopedConstraint(snapshot,current,scope,structuredClone(value),'relation-clone')).toThrow()
  const legacy=new AssemblyGeometrySnapshot(current.document)
  try{
   const old=legacy.resolveActiveMates(current.document)[0]
   expect(()=>buildConfiguredAssemblyScopedConstraint(snapshot,current,scope,old as never,'legacy')).toThrow()
  }finally{legacy.dispose()}
  snapshot.assertResolvedMate(value,current);expect(assertConfiguredAssemblyNumericalScope(snapshot,current,scope)).toBe(scope)
 }finally{foreign.dispose()}
})

it('rejects nonexistent, part and suppressed numerical scopes while keeping hidden active scopes usable',()=>{
 const input=fixture([]),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  for(const path of [['missing'],['right','box-a']])expect(()=>createConfiguredAssemblyNumericalScope(s,input,path)).toThrow()
  expect(createConfiguredAssemblyNumericalScope(s,input,['right']).bodies).toHaveLength(10)
 }finally{s.dispose()}
 for(const configuration of ['scope-off','hidden']){
  const input=fixture([]);input.rootConfiguration=configuration;const s=new AssemblyConfigurationGeometrySnapshot(input)
  try{
   if(configuration==='scope-off')expect(()=>createConfiguredAssemblyNumericalScope(s,input,['right'])).toThrow()
   else{const scope=createConfiguredAssemblyNumericalScope(s,input,['right']);expect(scope.bodies).toHaveLength(10);expect(scope.configuration).toBe('tilt')}
  }finally{s.dispose()}
 }
})

it('uses effective fixed/suppressed occurrences and detaches every owned numerical body placement',()=>{
 const input=fixture([]),variant=input.catalog[1].configurations[0]
 inner(input).occurrences.find(o=>o.id==='box-a')!.fixed=true
 variant.occurrences.push({occurrenceId:'circle-b',suppressed:true},{occurrenceId:'sphere-b',visible:false})
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const scope=createConfiguredAssemblyNumericalScope(s,input,['right'])
  expect(scope.bodies).toHaveLength(9);expect(scope.bodies.some(b=>b.id==='circle-b')).toBe(false);expect(scope.bodies.some(b=>b.id==='sphere-b')).toBe(true)
  expect(scope.bodies.find(b=>b.id==='box-a')!.fixed).toBe(true)
  expect(Reflect.set(scope.bodies[0].pose.translation,'0',999)).toBe(false)
  variant.occurrences[0].pose!.translation[0]=99
  near(scope.bodies.find(b=>b.id==='box-b')!.pose.translation,[2,0,0])
  expect(()=>assertConfiguredAssemblyNumericalScope(s,input,scope)).toThrow()
 }finally{s.dispose()}
})

it.each(['generation','rootConfiguration','catalog','document'] as const)('revokes a scoped context after %s changes even without resolving any mate',field=>{
 const input=fixture([]),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const scope=createConfiguredAssemblyNumericalScope(s,input,['right']),changed=structuredClone(input)
  if(field==='generation')changed.generation++
  if(field==='rootConfiguration')changed.rootConfiguration='hidden'
  if(field==='catalog')changed.catalog[1].configurations[0].name+=' changed'
  if(field==='document')changed.document.name+=' changed'
  expect(()=>assertConfiguredAssemblyNumericalScope(s,changed,scope)).toThrow()
  expect(()=>assertConfiguredAssemblyNumericalScope(s,input,scope)).toThrow()
 }finally{s.dispose()}
})

it('rejects scoped contexts after disposal and rejects executable scope paths without invoking getters',()=>{
 const input=fixture([]),s=new AssemblyConfigurationGeometrySnapshot(input);let reads=0
 const path=['right'];Object.defineProperty(path,'0',{enumerable:true,get(){reads++;return 'right'}})
 try{
  expect(()=>createConfiguredAssemblyNumericalScope(s,input,path)).toThrow();expect(reads).toBe(0)
  const scope=createConfiguredAssemblyNumericalScope(s,input,['right']);s.dispose()
  expect(()=>assertConfiguredAssemblyNumericalScope(s,input,scope)).toThrow()
 }finally{s.dispose()}
})

it.each(['axial','angular'] as const)('rejects a hinge %s role on a different immediate child despite a shared physical owner',role=>{
 const input=fixture(selected(['limited-hinge'])),mate=inner(input).mates[0];if(mate.type!=='hinge'||!mate.stops)throw Error('hinge')
 if(role==='axial')mate.axial[1]=structuredClone(mate.axial[0]);else mate.stops.angular[1]=structuredClone(mate.stops.angular[0])
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const value=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!,scope=createConfiguredAssemblyNumericalScope(s,input,['right'])
  expect(observations.configuredResolvedMateWitnesses(value).every(w=>w.topLevelOwner==='right')).toBe(true)
  // Root physical incidence remains one owner; the new local mechanical
  // problem must not borrow a cap/stop from another independently moving body.
  expect(()=>buildConfiguredAssemblyScopedConstraint(s,input,scope,value,'cross-child')).toThrow(/owner|inciden|child|propiet|cuerpo/i)
  s.assertResolvedMate(value,input)
 }finally{s.dispose()}
})

it('composes nested noncommuting child frames directly while retaining the original physical root proof',()=>{
 const input=fixture([]),sNode=inner(input),original=sNode.occurrences.find(o=>o.id==='box-b')!
 const nested:EmbeddedAssemblyDefinition={kind:'assembly',id:'original-scoped-nested',revision:'r1',name:'Original nested frame',createdAt:stamp,updatedAt:stamp,
  occurrences:[{...structuredClone(original),id:'leaf',pose:{translation:[1,2,3],rotation:[Math.SQRT1_2,0,0,Math.SQRT1_2]}}],mates:[]}
 input.document.definitions.push(nested)
 sNode.occurrences.push({id:'group',name:'Original group',definition:{id:nested.id,revision:nested.revision},pose:{translation:[7,8,9],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},fixed:false,visible:true,suppressed:false})
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const w=s.resolveComponentReference(input,{...component('box-b'),occurrencePath:['right','group','leaf']}),scope=createConfiguredAssemblyNumericalScope(s,input,['right'])
  const e=configuredAssemblyScopedEndpointFrame(s,input,scope,w)
  expect(e.bodyId).toBe('group');expect(w.topLevelOwner).toBe('right');near(e.frame.translation,[1,2,3]);near(e.frame.rotation,[Math.SQRT1_2,0,0,Math.SQRT1_2])
  near(transformRigidPoint(e.frame,[-2,-3,4]),[-1,-2,0])
  const group=scope.bodies.find(b=>b.id==='group')!;near(group.pose.translation,[7,8,9]);near(group.pose.rotation,[0,0,Math.SQRT1_2,Math.SQRT1_2])
  // Rz90 then Rx90: local(-2,-3,4) -> (-1,-2,0) -> (9,7,9).
  near(transformRigidPoint(validateRigidPose(group.pose),transformRigidPoint(e.frame,[-2,-3,4])),[9,7,9])
  expect(w.componentPath).toEqual(['right','group','leaf']);s.assertWitness(w,input)
 }finally{s.dispose()}
})

it('preserves a small scope-local pose beneath distant roots but retains the original precision budget',()=>{
 const input=fixture(selected(['coincident']));input.document.occurrences[1].pose={translation:[1e16,0,0],rotation:[0,0,0,1]}
 input.catalog[1].configurations[0].occurrences[0].pose={translation:[.25,0,0],rotation:[0,0,0,1]}
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const scope=createConfiguredAssemblyNumericalScope(s,input,['right']),value=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!
  near(scope.bodies.find(b=>b.id==='box-b')!.pose.translation,[.25,0,0])
  expect(()=>buildConfiguredAssemblyScopedConstraint(s,input,scope,value,'distant')).toThrow(/precision|precisi|placement/i)
 }finally{s.dispose()}
})

it('does not erase cancelled ancestor and child translations when creating a local numerical problem',()=>{
 const input=fixture(selected(['coincident']));input.document.occurrences[1].pose={translation:[1e14,0,0],rotation:[0,0,0,1]}
 input.catalog[1].configurations[0].occurrences[0].pose={translation:[-1e14,0,0],rotation:[0,0,0,1]}
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const value=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!,scope=createConfiguredAssemblyNumericalScope(s,input,['right'])
  if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
  near(value.second.declaredWorldPose.translation,[0,0,0]);expect(value.second.topLevelOwner).toBe('right')
  const endpoint=configuredAssemblyScopedEndpointFrame(s,input,scope,value.second)
  expect(endpoint.bodyId).toBe('box-b');near(endpoint.frame.translation,[0,0,0])
  expect(scope.bodies.find(b=>b.id==='box-b')!.pose.translation[0]).toBe(-1e14)
  expect(()=>buildConfiguredAssemblyScopedConstraint(s,input,scope,value,'cancelled-chain')).toThrow(/precision|precisi|placement/i)
 }finally{s.dispose()}
})

it('requires a real live native-session brand and rejects overridden authentication at scoped publication',()=>{
 const input=fixture(selected(['coincident']));let fakeCalls=0
 const fake={assertCurrent(){fakeCalls++},assertWitness(value:unknown){fakeCalls++;return value},assertResolvedMate(value:unknown){fakeCalls++;return value}}
 expect(()=>createConfiguredAssemblyNumericalScope(fake as never,input,['right'])).toThrow();expect(fakeCalls).toBe(0)
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const value=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!
  if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
  const currentOverride=vi.spyOn(s,'assertCurrent').mockImplementation(()=>undefined)
  const witnessOverride=vi.spyOn(s,'assertWitness').mockImplementation(value=>value as never)
  const relationOverride=vi.spyOn(s,'assertResolvedMate').mockImplementation(value=>value as never)
  try{
   const scope=createConfiguredAssemblyNumericalScope(s,input,['right'])
   expect(assertConfiguredAssemblyNumericalScope(s,input,scope)).toBe(scope)
   expect(()=>configuredAssemblyScopedEndpointFrame(s,input,scope,structuredClone(value.first))).toThrow()
   expect(()=>buildConfiguredAssemblyScopedConstraint(s,input,scope,structuredClone(value),'overridden-clone')).toThrow()
   expect(currentOverride).not.toHaveBeenCalled();expect(witnessOverride).not.toHaveBeenCalled();expect(relationOverride).not.toHaveBeenCalled()
   // Reenter at the generic builder's final legacy-compatible instance hook,
   // after its first check and endpoint copies. The new scoped publication
   // boundary must still perform its own non-overridable final authentication.
   let callbacks=0
   relationOverride.mockImplementation(value=>{if(++callbacks===2)input.generation++;return value as never})
   expect(()=>buildConfiguredAssemblyScopedConstraint(s,input,scope,value,'late-context-change')).toThrow()
   expect(callbacks).toBe(2)
   expect(()=>assertConfiguredAssemblyNumericalScope(s,input,scope)).toThrow()
  }finally{currentOverride.mockRestore();witnessOverride.mockRestore();relationOverride.mockRestore()}
 }finally{s.dispose()}
})

it.each(['hinge','limited-hinge','profile-circle','profile-rectangle','line-up','circular-up'])('solves a standalone scoped %s experiment and independently measures fresh current native geometry',id=>{
 const mate=structuredClone(selected([id])[0]),input=fixture([mate])
 const moving=id.includes('hinge')?'hinge-b':id==='profile-circle'?'circle-b':id==='circular-up'?'sector-b':'box-b'
 if(mate.type==='line-path'||mate.type==='circular-path'){
  mate.orientation={pitchYaw:'free',roll:'free'}
  if(mate.type==='circular-path')mate.position={mode:'coordinate',distanceMm:0}
  inner(input).mates=[mate]
 }
 for(const occurrence of inner(input).occurrences)occurrence.fixed=occurrence.id!==moving
 const before=JSON.stringify(input),s=new AssemblyConfigurationGeometrySnapshot(input)
 let candidate:AssemblyConfigurationGeometryInput,numericalChecks:unknown
 try{
  const value=s.resolveActiveMates(input).find(r=>r.scopePath[0]==='right')!,scope=createConfiguredAssemblyNumericalScope(s,input,['right'])
  const constraint=buildConfiguredAssemblyScopedConstraint(s,input,scope,value,'scoped-experiment-'+id)
  const problem:RigidMateProblem={bodies:scope.bodies.map(b=>({id:b.id,pose:validateRigidPose(b.pose),fixed:b.fixed})),constraints:[constraint],
   origin:[0,0,0],lengthScale:40,lengthTolerance:1e-6,angleTolerance:1e-8}
  expect(problem.bodies.filter(b=>!b.fixed).map(b=>b.id)).toEqual([moving])
  // Reserve room for the independently measured native error envelope with
  // one stricter variable-group convergence target. Public/native acceptance
  // and the solver's iteration/trial budgets remain unchanged.
  const workingLengthTolerance=problem.lengthTolerance/2
  const result=solveRigidMates(problem,{lengthRefinementTolerance:workingLengthTolerance})
  expect(['underdefined','fullyDefined']).toContain(result.status);expect(result.poses).not.toBeNull()
  const checks=result.evidence.groups.flatMap(group=>group.checks)
  numericalChecks=checks
  expect(checks).toHaveLength(1);expect(checks[0].constraintId).toBe('scoped-experiment-'+id);expect(checks[0].satisfied).toBe(true)
  expect(checks[0].lengthTolerance).toBe(workingLengthTolerance);expect(problem.lengthTolerance).toBe(1e-6)
  for(const body of problem.bodies)if(body.fixed)expect(result.poses!.get(body.id)).toEqual(body.pose)
  const solved=validateRigidPose(result.poses!.get(moving))
  if(id.includes('hinge'))expect(solved.translation[2]).toBeCloseTo(4,5)
  if(id==='profile-circle')expect(solved.translation[2]).toBeCloseTo(2,5)
  // Test-owned numerical experiment only. This is not an implementation of
  // atomic configured writeback: exactly one named occurrence pose is copied.
  candidate=structuredClone(input);candidate.generation++
  const variant=candidate.catalog[1].configurations[0],hasOverride=variant.occurrences.some(o=>o.occurrenceId===moving)
  // The original fixture deliberately aliases its tilt/paused base row.
  // Replace only the selected array/row, never mutate that shared raw object.
  variant.occurrences=hasOverride?variant.occurrences.map(o=>o.occurrenceId===moving?{...o,pose:solved}:o):[...variant.occurrences,{occurrenceId:moving,pose:solved}]
  expect(candidate.document).toEqual(input.document);expect(candidate.catalog[0]).toEqual(input.catalog[0])
  expect(candidate.catalog[1].configurations.slice(1)).toEqual(input.catalog[1].configurations.slice(1))
  const expected=structuredClone(input.catalog[1].configurations[0])
  expected.occurrences=hasOverride?expected.occurrences.map(o=>o.occurrenceId===moving?{...o,pose:solved}:o):[...expected.occurrences,{occurrenceId:moving,pose:solved}]
  expect(variant).toEqual(expected);expect(candidate.generation).toBe(input.generation+1)
 }finally{s.dispose()}
 const fresh=new AssemblyConfigurationGeometrySnapshot(candidate!)
 try{
  const value=fresh.resolveActiveMates(candidate!).find(r=>r.scopePath[0]==='right')!
  expect(value.configuration).toBe('tilt');expect(value.scopePath).toEqual(['right'])
  expect(observations.configuredResolvedMateWitnesses(value).every(w=>w.topLevelOwner==='right')).toBe(true)
  if(observations.isConfiguredResolvedHingeMate(value)){
   const report=measureConfiguredAssemblyHinge(fresh,candidate!,value)
   expect(report.status,JSON.stringify({report,numericalChecks,roles:[...value.axis,...value.axial].map(w=>({pose:w.declaredWorldPose,local:w.localSupport,world:w.worldSupport}))})).toBe('ok');if(report.status!=='ok')throw Error('Fresh scoped hinge precision')
   expect(report.satisfied).toBe(true);expect(report.verificationOnly).toBe(true)
   const support=report.limited?report.hinge:report
   expect(support.lengthToleranceMm).toBe(1e-6);expect(support.angleToleranceRad).toBe(1e-8)
   expect(support.axisAngleRad+support.precision.directionRad).toBeLessThanOrEqual(1e-8)
   expect(Math.max(support.transverseResidualMm,Math.abs(support.axialOffsetMm))+support.precision.positionMm).toBeLessThanOrEqual(1e-6)
   if(report.limited){expect(report.directionErrorRad).toBeLessThanOrEqual(1e-8);expect(report.fullCircle).toBe(false)}
  }else if(observations.isConfiguredResolvedProfileCenterMate(value)||observations.isConfiguredResolvedLinePathMate(value)||observations.isConfiguredResolvedCircularPathMate(value)){
   const report=measureConfiguredAssemblyAdvanced(fresh,candidate!,value)
   expect(report.status,JSON.stringify(report)).toBe('ok');expect(report.satisfied).toBe(true);expect(report.verificationOnly).toBe(true);expect(report.compatibilityAuthority).toBe(false)
   expect(report.bands).toEqual({lengthToleranceMm:1e-6,angleToleranceRad:1e-8})
   if(report.status!=='ok')throw Error('Fresh scoped advanced precision')
   expect(report.positionResidualMm??Infinity).toBeLessThanOrEqual(1e-6)
   if(report.family==='profile-center'){
    expect((report.positionResidualMm??Infinity)+(report.precision.positionMm??Infinity)).toBeLessThanOrEqual(1e-6)
    expect((report.normalAngleRadians??Infinity)+(report.precision.normalRad??Infinity)).toBeLessThanOrEqual(1e-8)
    if(id==='profile-rectangle')expect((report.rectangleAngleRadians??Infinity)+(report.precision.rectangleRad??Infinity)).toBeLessThanOrEqual(1e-8)
   }else{
    expect(report.targetCoordinateMm).toBe(id==='line-up'?1:0);expect(report.orientationResidualRad).toBeNull();expect(report.rollResidualRad).toBeNull()
    if(report.family==='circular-path'){expect(report.radiusMm).toBeCloseTo(2,10);expect(report.curveLengthMm).toBeCloseTo(Math.PI,10)}
   }
   if(observations.isConfiguredResolvedLinePathMate(value)||observations.isConfiguredResolvedCircularPathMate(value)){
    // Rz90+[10,20,30] maps the literal selected target into world coordinates.
    // No unique component rotation or globally nearest free pose is assumed.
    near(value.first.worldSupport.point,id==='line-up'?[13,19,34]:[12,25,34],1e-6)
   }
  }else throw Error('Unexpected scoped experimental family')
  fresh.assertResolvedMate(value,candidate!)
 }finally{fresh.dispose()}
 expect(JSON.stringify(input)).toBe(before)
},60_000)

it('keeps declaration-only validity separate from full native construction and revokes changed overflowing contexts before querying',()=>{
 const overflow=(input:AssemblyConfigurationGeometryInput)=>{
  input.document.occurrences[1].pose={translation:[1e308,0,0],rotation:[0,0,0,1]}
  const variant=input.catalog[1].configurations[0]
  variant.occurrences=variant.occurrences.map(row=>row.occurrenceId==='box-b'?{...row,pose:{translation:[1e308,0,0],rotation:[0,0,0,1]}}:row)
 }
 const invalid=fixture(selected(['coincident']));overflow(invalid)
 expect(()=>validateAssemblyConfigurationDeclarations(invalid.document,invalid.catalog,invalid.rootConfiguration)).not.toThrow()
 expect(()=>evaluateAssemblyConfiguration(invalid.document,invalid.catalog,invalid.rootConfiguration)).toThrow()
 const rebuild=vi.spyOn(CadEngine.prototype,'rebuildForAssemblyReferences')
 try{
  expect(()=>new AssemblyConfigurationGeometrySnapshot(invalid)).toThrow();expect(rebuild).not.toHaveBeenCalled()
 }finally{rebuild.mockRestore()}
 const input=fixture(selected(['coincident'])),before=JSON.stringify(input),s=new AssemblyConfigurationGeometrySnapshot(input)
 const scope=createConfiguredAssemblyNumericalScope(s,input,['right']),inspect=vi.spyOn(CadEngine.prototype,'inspectCurrentFaceSupport')
 const reference={...plane('box-b',2,4),component:{...component('box-b'),occurrencePath:['right','box-b']}}
 try{
  overflow(input)
  expect(()=>validateAssemblyConfigurationDeclarations(input.document,input.catalog,input.rootConfiguration)).not.toThrow()
  expect(()=>s.resolveReference(input,reference)).toThrow();expect(inspect).not.toHaveBeenCalled()
  expect(()=>assertConfiguredAssemblyNumericalScope(s,input,scope)).toThrow()
  Object.assign(input,JSON.parse(before))
  expect(JSON.stringify(input)).toBe(before)
  expect(()=>s.resolveReference(input,reference)).toThrow();expect(inspect).not.toHaveBeenCalled()
  expect(()=>assertConfiguredAssemblyNumericalScope(s,input,scope)).toThrow()
 }finally{inspect.mockRestore();s.dispose()}
})

// Independent final physical verification. Source features remain the five
// tracked original recipes; only authored occurrence placements and intent
// change below. Local literal metrics must survive the placed Rz90 root gauge.
const binaryVerificationIds=families.slice(0,19)
function verificationFixture(id:string){
 const input=fixture(selected([id]));input.catalog[1].configurations[0].occurrences=[]
 return input
}
function verificationPose(input:AssemblyConfigurationGeometryInput,id:string,translation:[number,number,number],rotation:[number,number,number,number]=[0,0,0,1]){
 const occurrence=inner(input).occurrences.find(o=>o.id===id);if(!occurrence)throw Error('Original verification occurrence missing')
 occurrence.pose={translation,rotation}
}
function physicalMetadata(value:unknown,id:string,side:string){
 expect(value).toMatchObject({mateId:id,scopePath:[side],scope:{id:innerId,revision:'r1'},configuration:side==='right'?'tilt':null,
  configurationAncestry:[{path:[],definition:{id:'configured-relation-root',revision:'r1'},configuration:'posed'},
   {path:[side],definition:{id:innerId,revision:'r1'},configuration:side==='right'?'tilt':null}],
  scopePose:{translation:side==='right'?[10,20,30]:[0,0,0]},
  suppressed:false,scopeSuppressed:false,supportOnly:true,verificationOnly:true,bands:{lengthToleranceMm:1e-6,angleToleranceRad:1e-8}})
 near((value as {scopePose:{rotation:number[]}}).scopePose.rotation,side==='right'?[0,0,Math.SQRT1_2,Math.SQRT1_2]:[0,0,0,1],1e-15)
}
function qualifiedBinaryFixture(id:string){
 const input=verificationFixture(id),mate=inner(input).mates[0]
 if(mate.type==='tangent'){mate.first=plane('box-a',0,2);mate.side='negative'}
 if(mate.type==='skew-cylinder-tangent')verificationPose(input,'circle-b',[4,0,0],[Math.SQRT1_2,0,0,Math.SQRT1_2])
 if(mate.type==='parallel-cylinder-tangent')verificationPose(input,'circle-b',[4,0,0])
 if(mate.type==='plane-sphere-tangent')verificationPose(input,'sphere-b',[0,0,7])
 if(mate.type==='sphere-sphere-tangent')verificationPose(input,'sphere-b',[6,0,0])
 if(mate.type==='cylinder-sphere-tangent')verificationPose(input,'sphere-b',[5,0,0])
 return input
}
const binaryLiteral:{[id:string]:{position:number|null;angle:number|null;coordinate:number|null;satisfied:boolean}}={
 concentric:{position:0,angle:0,coordinate:null,satisfied:true},coincident:{position:0,angle:0,coordinate:0,satisfied:true},
 distance:{position:2,angle:0,coordinate:0,satisfied:false},'limit-distance':{position:0,angle:0,coordinate:0,satisfied:true},
 'limit-angle':{position:null,angle:0,coordinate:Math.PI/2,satisfied:true},'limit-directed-angle':{position:null,angle:0,coordinate:0,satisfied:true},
 angle:{position:null,angle:40*Math.PI/180,coordinate:0,satisfied:false},parallel:{position:null,angle:0,coordinate:0,satisfied:true},
 perpendicular:{position:null,angle:Math.PI,coordinate:Math.PI,satisfied:false},tangent:{position:0,angle:0,coordinate:-2,satisfied:true},
 'skew-cylinder-tangent':{position:0,angle:null,coordinate:4,satisfied:true},'parallel-cylinder-tangent':{position:0,angle:0,coordinate:4,satisfied:true},
 'plane-sphere-tangent':{position:0,angle:null,coordinate:3,satisfied:true},'sphere-sphere-tangent':{position:0,angle:null,coordinate:6,satisfied:true},
 'cylinder-sphere-tangent':{position:0,angle:null,coordinate:5,satisfied:true},lock:{position:0,angle:0,coordinate:null,satisfied:true},
 gear:{position:null,angle:0,coordinate:null,satisfied:true},screw:{position:0,angle:0,coordinate:0,satisfied:true},'rack-pinion':{position:0,angle:0,coordinate:0,satisfied:true},
}
it.each(binaryVerificationIds)('independently measures configured binary %s in both real placed scopes',id=>{
 const input=qualifiedBinaryFixture(id),before=JSON.stringify(input),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  if(id==='perpendicular'){
   const original=bodies.get('circle-b')!.faces.filter(face=>face.support?.kind==='cylinder')
   expect(original).toHaveLength(1);const support=original[0].support
   if(support?.kind!=='cylinder')throw Error('Actual original cylinder metadata required')
   near(support.axis,[0,0,-1],1e-10)
  }
  const values=s.resolveActiveMates(input);expect(values).toHaveLength(2)
  for(const value of values){
   if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('Binary verification fixture')
   const side=value.scopePath[0],report=measureConfiguredAssemblyBinary(s,input,value),wanted=binaryLiteral[id]
   physicalMetadata(report,id,side);expect(report.family).toBe(value.mate.type);expect(report.passive).toBe(false)
   expect(report.status,JSON.stringify(report)).toBe('ok');if(report.status!=='ok')throw Error('Binary precision '+id)
   expect(report.satisfied,JSON.stringify(report)).toBe(wanted.satisfied)
   if(id==='perpendicular'){
    if(value.first.kind!=='configured-support'||value.first.localSupport.kind!=='plane'||value.second.kind!=='configured-support'||value.second.localSupport.kind!=='cylinder')throw Error('Actual mixed plane/cylinder supports required')
    near(value.first.localSupport.normal,[0,0,1],1e-10);near(value.second.localSupport.axis,[0,0,-1],1e-10)
   }
   for(const [field,target] of [['positionResidualMm',wanted.position],['angleResidualRad',wanted.angle],['coordinate',wanted.coordinate]] as const){
    if(target===null)expect(report[field]).toBeNull();else near([report[field]??Infinity],[target],1e-9)
   }
   if(id==='limit-distance')expect(report.marginsMm).toEqual({minimum:2,maximum:5})
   if(id==='limit-angle'){near([report.marginsRad!.minimum,report.marginsRad!.maximum],[4*Math.PI/9,4*Math.PI/9],1e-9)}
   if(id==='limit-directed-angle'){near([report.marginsRad!.minimum,report.marginsRad!.maximum],[Math.PI/6,Math.PI/6],1e-9)}
   if(id==='gear')near([report.liftedAngles?.first??Infinity,report.liftedAngles?.second??Infinity],[0,0],1e-10)
   if(id==='screw'||id==='rack-pinion')near([report.liftedAngle??Infinity,report.travelMm??Infinity],[0,0],1e-10)
   expect(report.componentPaths.first).toEqual(value.first.componentPath);expect(report.componentPaths.second).toEqual(value.second.componentPath)
   s.assertResolvedMate(value,input)
  }
  expect(JSON.stringify(input)).toBe(before)
 }finally{s.dispose()}
 if(id==='perpendicular'){
  // The same independently observed +Z normal and -Z cylinder axis retain
  // their geometry. Only the explicit normal/axis collinearity branch changes.
  const opposed=qualifiedBinaryFixture(id),mate=inner(opposed).mates[0]
  if(mate.type!=='perpendicular')throw Error('perpendicular')
  mate.alignment='opposed';const fresh=new AssemblyConfigurationGeometrySnapshot(opposed)
  try{for(const value of fresh.resolveActiveMates(opposed)){
   if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
   const report=measureConfiguredAssemblyBinary(fresh,opposed,value);physicalMetadata(report,id,value.scopePath[0])
   expect(report.status,JSON.stringify(report)).toBe('ok');if(report.status!=='ok')throw Error('Opposed mixed-direction precision')
   expect(report.satisfied,JSON.stringify(report)).toBe(true);near([report.coordinate??Infinity,report.angleResidualRad??Infinity],[Math.PI,0],1e-10)
   expect(report.positionResidualMm).toBeNull();fresh.assertResolvedMate(value,opposed)
  }}finally{fresh.dispose()}
 }
})

function widthVerificationFixture(widthBranch:'sum'|'difference',tabBranch:'sum'|'difference'){
 const input=verificationFixture('width'),mate=inner(input).mates[0];if(mate.type!=='width')throw Error('width')
 // +X at2 and +X at10: SUM bisector X=6. +X at2 and -X
 // at-2: DIFFERENCE bisector X=0. All four combined normals have length2.
 mate.width=[plane('box-a',0,2),widthBranch==='sum'?plane('hinge-a',0,10):plane('hinge-a',0,-2,-1)]
 mate.tab=[plane('box-b',0,2),tabBranch==='sum'?plane('hinge-b',0,10):plane('hinge-b',0,-2,-1)]
 mate.widthBranch=widthBranch;mate.tabBranch=tabBranch
 return input
}
it.each([['sum','sum'],['sum','difference'],['difference','sum'],['difference','difference']] as const)('measures literal configured Width %s/%s bisectors in both placed scopes',(a,b)=>{
 const input=widthVerificationFixture(a,b),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{for(const value of s.resolveActiveMates(input)){
  if(!observations.isConfiguredResolvedWidthMate(value))throw Error('width')
  const report=measureConfiguredAssemblyWidth(s,input,value);physicalMetadata(report,'width',value.scopePath[0])
  expect(report.status,JSON.stringify(report)).toBe('ok');expect(report.satisfied).toBe(a===b)
  near([report.angleRadians??Infinity,report.offsetMm??Infinity],[0,(b==='sum'?6:0)-(a==='sum'?6:0)],1e-9)
  near([report.branchLengths.width??Infinity,report.branchLengths.tab??Infinity],[2,2],1e-10)
  expect(report.componentPaths).toEqual({width:[[value.scopePath[0],'box-a'],[value.scopePath[0],'hinge-a']],tab:[[value.scopePath[0],'box-b'],[value.scopePath[0],'hinge-b']]})
 }}finally{s.dispose()}
})
it('withholds a singular configured Width branch instead of inventing its bisector',()=>{
 const input=verificationFixture('width'),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{for(const value of s.resolveActiveMates(input)){
  if(!observations.isConfiguredResolvedWidthMate(value))throw Error('width')
  const report=measureConfiguredAssemblyWidth(s,input,value)
  expect(report.status).toBe('precisionLimit');expect(report.satisfied).toBe(false);expect(report.branchLengths).toEqual({width:null,tab:null})
  s.assertResolvedMate(value,input)
 }}finally{s.dispose()}
})

const symmetryVerificationKinds=['point','line','plane','sphere','cylinder'] as const
it.each(symmetryVerificationKinds)('measures configured %s reflection with independent literal position, angle and radius',kind=>{
 const id='symmetry-'+kind,input=verificationFixture(id),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{for(const value of s.resolveActiveMates(input)){
  if(!observations.isConfiguredResolvedSymmetryMate(value))throw Error('symmetry')
  const report=measureConfiguredAssemblySymmetry(s,input,value);physicalMetadata(report,id,value.scopePath[0])
  expect(report.status,JSON.stringify(report)).toBe('ok');expect(report.entityKind).toBe(kind)
  near([report.positionResidualMm??Infinity],[kind==='point'?8:kind==='sphere'||kind==='cylinder'?4:0],1e-9)
  if(kind==='point'||kind==='sphere')expect(report.angleRadians).toBeNull();else near([report.angleRadians??Infinity],[kind==='line'?Math.PI:0],1e-9)
  if(kind==='sphere'||kind==='cylinder')expect(report.radiusDifferenceMm).toBe(0);else expect(report.radiusDifferenceMm).toBeNull()
  expect(report.satisfied).toBe(kind==='plane')
  expect(report.componentPaths.mirror).toEqual([value.scopePath[0],'box-a']);s.assertResolvedMate(value,input)
 }}finally{s.dispose()}
})
it.each(symmetryVerificationKinds)('accepts an independently placed exact configured %s reflection',kind=>{
 const id='symmetry-'+kind,input=verificationFixture(id)
 if(kind==='point')verificationPose(input,'box-b',[8,0,0])
 if(kind==='line')verificationPose(input,'box-b',[0,-6,0],[0,0,1,0])
 if(kind==='sphere')verificationPose(input,'sphere-b',[4,0,0])
 if(kind==='cylinder')verificationPose(input,'circle-b',[4,0,0])
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{for(const value of s.resolveActiveMates(input)){
  if(!observations.isConfiguredResolvedSymmetryMate(value))throw Error('symmetry')
  const report=measureConfiguredAssemblySymmetry(s,input,value)
  expect(report.status,JSON.stringify(report)).toBe('ok');expect(report.satisfied).toBe(true)
  expect((report.positionResidualMm??Infinity)+(report.uncertainty.positionMm??Infinity)).toBeLessThanOrEqual(1e-6)
  if(report.angleRadians!==null)expect(report.angleRadians+(report.uncertainty.angleRad??Infinity)).toBeLessThanOrEqual(1e-8)
 }}finally{s.dispose()}
})

it.each([.9e-6,1.1e-6])('withholds both-sided physical band overlap at nominal residual %s',gap=>{
 const inputs=[qualifiedBinaryFixture('coincident'),widthVerificationFixture('sum','sum'),verificationFixture('symmetry-point')]
 verificationPose(inputs[0],'box-b',[0,0,gap]);verificationPose(inputs[1],'box-b',[gap,0,0]);verificationPose(inputs[1],'hinge-b',[gap,0,0]);verificationPose(inputs[2],'box-b',[8+gap,0,0])
 for(const input of inputs){const s=new AssemblyConfigurationGeometrySnapshot(input)
  try{for(const value of s.resolveActiveMates(input)){
   const report=observations.isConfiguredResolvedBinaryMate(value)?measureConfiguredAssemblyBinary(s,input,value):observations.isConfiguredResolvedWidthMate(value)?measureConfiguredAssemblyWidth(s,input,value):observations.isConfiguredResolvedSymmetryMate(value)?measureConfiguredAssemblySymmetry(s,input,value):null
   if(!report)throw Error('Boundary fixture family')
   expect(report.status,JSON.stringify(report)).toBe('precisionLimit');expect(report.bands).toEqual({lengthToleranceMm:1e-6,angleToleranceRad:1e-8});s.assertResolvedMate(value,input)
  }}finally{s.dispose()}
 }
})

it('measures the selected native pose rather than substituting the equal source tuple from another instance',()=>{
 const input=fixture(selected(['coincident'])),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{for(const value of s.resolveActiveMates(input)){
  if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
  const report=measureConfiguredAssemblyBinary(s,input,value)
  expect(report.status).toBe('ok');if(report.status!=='ok')throw Error('pose measurement')
  near([report.angleResidualRad??Infinity],[value.scopePath[0]==='right'?Math.PI/2:0],1e-10)
  expect(report.satisfied).toBe(value.scopePath[0]==='left')
 }}finally{s.dispose()}
})

it('keeps direction-only verification independent of cancelled distant translations while positional purposes refuse the budget',()=>{
 const input=fixture(selected(['parallel','coincident','width','symmetry-point']))
 input.document.occurrences[1].pose={translation:[1e14,0,0],rotation:[0,0,0,1]}
 input.catalog[1].configurations[0].occurrences[0].pose={translation:[-1e14,0,0],rotation:[0,0,0,1]}
 const s=new AssemblyConfigurationGeometrySnapshot(input)
 try{for(const value of s.resolveActiveMates(input).filter(r=>r.scopePath[0]==='right')){
  const report=observations.isConfiguredResolvedBinaryMate(value)?measureConfiguredAssemblyBinary(s,input,value):observations.isConfiguredResolvedWidthMate(value)?measureConfiguredAssemblyWidth(s,input,value):observations.isConfiguredResolvedSymmetryMate(value)?measureConfiguredAssemblySymmetry(s,input,value):null
  if(!report)throw Error('purpose fixture')
  expect(report.status,JSON.stringify(report)).toBe(value.mate.type==='parallel'?'ok':'precisionLimit')
  if(report.family==='parallel'&&report.status==='ok'){expect(report.satisfied).toBe(true);expect(report.precision.positionMm).toBeNull();near([report.angleResidualRad??Infinity],[0],1e-10)}
  s.assertResolvedMate(value,input)
 }}finally{s.dispose()}
})

it('does not widen a strict requested positional band to native topology tolerances',()=>{
 const input=qualifiedBinaryFixture('coincident'),s=new AssemblyConfigurationGeometrySnapshot(input)
 try{for(const value of s.resolveActiveMates(input)){
  if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
  const report=measureConfiguredAssemblyBinary(s,input,value,{lengthToleranceMm:1e-9,angleToleranceRad:1e-8})
  expect(report.status).toBe('precisionLimit');expect(report.bands).toEqual({lengthToleranceMm:1e-9,angleToleranceRad:1e-8})
  expect('satisfied'in report).toBe(false);expect('coordinate'in report).toBe(false);s.assertResolvedMate(value,input)
 }}finally{s.dispose()}
})

it('rejects cloned, foreign, legacy and fake-session measurement authority despite instance overrides',()=>{
 const input=qualifiedBinaryFixture('coincident'),s=new AssemblyConfigurationGeometrySnapshot(input),foreign=new AssemblyConfigurationGeometrySnapshot(input)
 try{
  const value=s.resolveActiveMates(input)[0];if(!observations.isConfiguredResolvedBinaryMate(value))throw Error('binary')
  const context=vi.spyOn(s,'assertCurrent').mockImplementation(()=>undefined),relation=vi.spyOn(s,'assertResolvedMate').mockImplementation(v=>v as never),witness=vi.spyOn(s,'assertWitness').mockImplementation(v=>v as never)
  try{
   expect(()=>measureConfiguredAssemblyBinary(s,input,structuredClone(value))).toThrow()
   expect(()=>measureConfiguredAssemblyBinary(foreign,input,value)).toThrow()
   expect(()=>measureConfiguredAssemblyBinary({assertCurrent(){},assertResolvedMate(v:unknown){return v},assertWitness(v:unknown){return v}} as never,input,value)).toThrow()
   const legacy=new AssemblyGeometrySnapshot(input.document)
   try{expect(()=>measureConfiguredAssemblyBinary(s,input,legacy.resolveActiveMates(input.document)[0] as never)).toThrow()}finally{legacy.dispose()}
   expect(measureConfiguredAssemblyBinary(s,input,value).status).toBe('ok')
   input.generation++;expect(()=>measureConfiguredAssemblyBinary(s,input,value)).toThrow()
   input.generation--;expect(()=>measureConfiguredAssemblyBinary(s,input,value)).toThrow()
  }finally{context.mockRestore();relation.mockRestore();witness.mockRestore()}
 }finally{foreign.dispose();s.dispose()}
})

it('applies strict own-data policy equally to all three new physical family entry points',()=>{
 let reads=0;const bad={get lengthToleranceMm(){reads++;return 1e-6}}
 const binary=row('coincident'),width=row('width'),symmetry=row('symmetry-point')
 if(!observations.isConfiguredResolvedBinaryMate(binary)||!observations.isConfiguredResolvedWidthMate(width)||!observations.isConfiguredResolvedSymmetryMate(symmetry))throw Error('families')
 const calls=[(options:unknown)=>measureConfiguredAssemblyBinary(snapshot,current,binary,options as never),(options:unknown)=>measureConfiguredAssemblyWidth(snapshot,current,width,options as never),(options:unknown)=>measureConfiguredAssemblySymmetry(snapshot,current,symmetry,options as never)]
 for(const call of calls){for(const options of [bad,{lengthToleranceMm:0},{angleToleranceRad:Math.PI/2},{angleToleranceRad:NaN},{unknown:1}])expect(()=>call(options)).toThrow()}
 expect(reads).toBe(0);for(const value of [binary,width,symmetry])snapshot.assertResolvedMate(value,current)
})

function passiveVerificationFixture(){
 const input=fixture(selected(['gear','screw','rack-pinion']))
 input.catalog[1].configurations.forEach(c=>{c.occurrences=[];c.mates=[]})
 for(const mate of inner(input).mates){
  mate.suppressed=true
  if(mate.type==='gear'){mate.angles={first:4*Math.PI,second:-2*Math.PI};mate.phase=123}
  else if(mate.type==='screw'){mate.angle=4*Math.PI;mate.neutralTravel=999}
  else if(mate.type==='rack-pinion'){mate.angle=-2*Math.PI;mate.neutralTravel=-999}
 }
 return input
}
it('freshly verifies all passive mechanical winding without enforcing their suppressed coupling equations',()=>{
 const input=passiveVerificationFixture(),before=JSON.stringify(input),result=verifyConfiguredAssemblyGeometry(input)
 expect(result.status,JSON.stringify(result)).toBe('verified');expect(result.accepted).toBe(true);expect(result.reports).toHaveLength(6);expect(result.passiveUnavailable).toEqual([])
 for(const entry of result.reports){
  const report=entry.measurement
  expect(entry.passive).toBe(true);expect(report.status).toBe('ok')
  if(report.status!=='ok'||!['gear','screw','rack-pinion'].includes(report.family))throw Error('passive family')
  if(report.family==='gear'){near([report.liftedAngles?.first??Infinity,report.liftedAngles?.second??Infinity],[4*Math.PI,-2*Math.PI],1e-9);near([report.phaseResidualRad??Infinity],[-123],1e-9)}
  else if(report.family==='screw'){near([report.liftedAngle??Infinity],[4*Math.PI],1e-9);expect(report.travelMm).toBeNull();expect(report.coordinate).toBeNull()}
  else if(report.family==='rack-pinion'){near([report.liftedAngle??Infinity],[-2*Math.PI],1e-9);expect(report.travelMm).toBeNull();expect(report.coordinate).toBeNull()}
  expect(report.satisfied).toBe(true)
 }
 expect(JSON.stringify(input)).toBe(before);expect(Object.isFrozen(result.reports)).toBe(true)
})
it('refuses unavailable passive winding instead of treating absence as verified',()=>{
 const input=passiveVerificationFixture();inner(input).occurrences.find(o=>o.id==='circle-b')!.suppressed=true
 const result=verifyConfiguredAssemblyGeometry(input)
 expect(result.status).toBe('references-unavailable');expect(result.accepted).toBe(false)
 expect(result.passiveUnavailable.some(row=>row.family==='gear')).toBe(true)
 for(const row of result.passiveUnavailable){expect(row.suppressed).toBe(true);expect(row.roles.some(role=>role.diagnostics.length>0)).toBe(true)}
})

it('fresh verification keeps every placed family, exact state key and finite report without claiming all geometry is satisfied',()=>{
 const input=fixture(),before=JSON.stringify(input),result=verifyConfiguredAssemblyGeometry(input)
 expect(result.status).toBe('precisionLimit');expect(result.accepted).toBe(false);expect(result.reports).toHaveLength(62);expect(result.passiveUnavailable).toEqual([])
 const wanted=['left','right'].flatMap(side=>families.map(id=>JSON.stringify([[side],innerId,'r1',side==='right'?'tilt':null,id])))
 expect(result.reports.map(r=>r.key).sort()).toEqual(wanted.sort());expect(new Set(result.reports.map(r=>r.key)).size).toBe(62)
 for(const entry of result.reports){
  const declaration=JSON.parse(entry.key) as [string[],string,string,string|null,string]
  expect(entry.passive).toBe(false);expect(entry.measurement.family).toBe(selected([declaration[4]])[0].type)
 }
 const finite=(value:unknown):void=>{if(typeof value==='number')expect(Number.isFinite(value)).toBe(true);else if(value&&typeof value==='object')Object.values(value).forEach(finite)}
 finite(result);expect(result.root).toEqual({id:input.document.id,revision:'r1',configuration:'posed'});expect(result.generation).toBe(23)
 expect(result.verificationOnly).toBe(true);expect('applyToken'in result).toBe(false);expect(Object.isFrozen(result.reports[0].measurement)).toBe(true)
 expect(JSON.stringify(input)).toBe(before)
},60_000)

it('fresh verification cannot accept empty prototype inventories or replaced public context checks',()=>{
 const input=qualifiedBinaryFixture('distance')
 const active=vi.spyOn(AssemblyConfigurationGeometrySnapshot.prototype,'resolveActiveMates').mockReturnValue([])
 const gears=vi.spyOn(AssemblyConfigurationGeometrySnapshot.prototype,'inspectGearState').mockReturnValue({resolved:[],unavailable:[]})
 const screws=vi.spyOn(AssemblyConfigurationGeometrySnapshot.prototype,'inspectScrewState').mockReturnValue({resolved:[],unavailable:[]})
 const racks=vi.spyOn(AssemblyConfigurationGeometrySnapshot.prototype,'inspectRackPinionState').mockReturnValue({resolved:[],unavailable:[]})
 const context=vi.spyOn(AssemblyConfigurationGeometrySnapshot.prototype,'assertCurrent').mockImplementation(()=>undefined)
 const disposal=vi.spyOn(AssemblyConfigurationGeometrySnapshot.prototype,'dispose').mockImplementation(()=>undefined)
 try{
  const result=verifyConfiguredAssemblyGeometry(input)
  expect(result.status).toBe('unsatisfied');expect(result.accepted).toBe(false);expect(result.reports).toHaveLength(2)
  for(const entry of result.reports){expect(entry.measurement.family).toBe('distance');expect(entry.measurement.status).toBe('ok');if(entry.measurement.status==='ok')expect(entry.measurement.satisfied).toBe(false)}
  for(const mock of [active,gears,screws,racks,context,disposal])expect(mock).not.toHaveBeenCalled()
 }finally{active.mockRestore();gears.mockRestore();screws.mockRestore();racks.mockRestore();context.mockRestore();disposal.mockRestore()}
})

it('withholds every earlier provisional report when a later actual circular D1 query changes context',()=>{
 const input=fixedArc();inner(input).mates.unshift(structuredClone(selected(['coincident'])[0]))
 const original=CadEngine.prototype.inspectCurrentArcPathEvaluation
 const query=vi.spyOn(CadEngine.prototype,'inspectCurrentArcPathEvaluation').mockImplementation(function(this:CadEngine,...args){const actual=original.apply(this,args);input.generation++;return actual})
 let published:unknown
 try{expect(()=>{published=verifyConfiguredAssemblyGeometry(input)}).toThrow();expect(query).toHaveBeenCalledTimes(1);expect(published).toBeUndefined()}finally{query.mockRestore()}
})

it('withholds a completed verification if final native cleanup fails, while attempting each prototype once',()=>{
 const input=qualifiedBinaryFixture('coincident'),primary=Error('Original final native release failure'),releaseCounts=new Map<CadEngine,number>()
 const actualInspect=CadEngine.prototype.inspectCurrentFaceSupport,actualDispose=CadEngine.prototype.dispose;let queried=false,published:unknown,caught:unknown
 const inspect=vi.spyOn(CadEngine.prototype,'inspectCurrentFaceSupport').mockImplementation(function(this:CadEngine,...args){const result=actualInspect.apply(this,args);queried=true;return result})
 const release=vi.spyOn(CadEngine.prototype,'dispose').mockImplementation(function(this:CadEngine){actualDispose.call(this);if(queried){releaseCounts.set(this,(releaseCounts.get(this)??0)+1);throw primary}})
 try{
  try{published=verifyConfiguredAssemblyGeometry(input)}catch(error){caught=error}
  expect(caught).toBeInstanceOf(AggregateError);expect(errors(caught)).toContain(primary);expect(published).toBeUndefined()
  expect(releaseCounts.size).toBe(5);expect([...releaseCounts.values()]).toEqual([1,1,1,1,1])
 }finally{inspect.mockRestore();release.mockRestore()}
})

it('authenticates Width and Symmetry aggregates before any shared-analytic or foreign-purpose reuse',()=>{
 const width=row('width'),symmetry=row('symmetry-point'),binary=row('coincident'),foreign=new AssemblyConfigurationGeometrySnapshot(current)
 if(!observations.isConfiguredResolvedWidthMate(width)||!observations.isConfiguredResolvedSymmetryMate(symmetry))throw Error('families')
 const disposal=vi.spyOn(snapshot,'dispose')
 try{
  expect(()=>measureConfiguredAssemblyWidth(snapshot,current,structuredClone(width))).toThrow()
  expect(()=>measureConfiguredAssemblySymmetry(snapshot,current,structuredClone(symmetry))).toThrow()
  expect(()=>measureConfiguredAssemblyWidth(foreign,current,width)).toThrow()
  expect(()=>measureConfiguredAssemblySymmetry(foreign,current,symmetry)).toThrow()
  expect(()=>measureConfiguredAssemblyWidth(snapshot,current,binary as never)).toThrow()
  expect(()=>measureConfiguredAssemblySymmetry(snapshot,current,binary as never)).toThrow()
  snapshot.assertResolvedMate(width,current);snapshot.assertResolvedMate(symmetry,current);expect(disposal).not.toHaveBeenCalled()
 }finally{disposal.mockRestore();foreign.dispose()}
})
