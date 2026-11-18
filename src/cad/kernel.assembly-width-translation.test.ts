import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import fixture from './fixtures/assembly-width-original.json'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyPlaneReference } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyPreviewReply } from './kernel.assembly-types'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { withNativeOwners } from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import type { Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({wasmBinary:await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'))})),60_000)
const near = (a:number,b:number,tolerance=1e-6) => expect(Math.abs(a-b)).toBeLessThanOrEqual(tolerance)
const component = {occurrencePath:['d'],definition:{id:'original-width-box',revision:'r1'}}
const request = (z=2) => ({component,translation:[0,0,z] as Vec3})
const dot = (a:readonly number[],b:readonly number[]) => a.reduce((sum,v,i) => sum+v*b[i],0)
// Original unit quaternion (1,2,2,4)/5, expanded independently as a rational matrix.
const obliqueRotation = (p:readonly number[]):Vec3 => [(9*p[0]-12*p[1]+20*p[2])/25,(20*p[0]+15*p[1])/25,(-12*p[0]+16*p[1]+15*p[2])/25]
const obliquePoint = (p:readonly number[]):Vec3 => obliqueRotation(p).map((v,i) => v+[7,-11,13][i]) as Vec3
function ready(value:AssemblyPreviewReply) {
  expect(value.status,value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw Error(value.message)
  return value
}
function original():AssemblyDocument {
  const document = validateAssemblyDocument(fixture); document.occurrences[3].pose.translation = [0,0,8]
  const scene = buildAssemblyScene(document)
  const face = (id:string,sign:number):AssemblyPlaneReference => {
    const faces = scene.bodies.find(v => v.component.occurrencePath[0] === id)!.faces.filter(v => v.support?.kind === 'plane' && v.support.normal[0]*sign > .999)
    expect(faces).toHaveLength(1); return {...assemblySceneFaceReference(faces[0])!,support:'plane'}
  }
  document.mates = [{id:'width',name:'Original centered contact translation',type:'width',mode:'centered',suppressed:false,
    width:[face('a',-1),face('b',1)],tab:[face('c',-1),face('d',1)],widthBranch:'difference',tabBranch:'difference',alignment:'aligned'}]
  return validateAssemblyDocument(document)
}
function report(value:Extract<AssemblyPreviewReply,{status:'ready'}>):void {
  expect(value.widthCentered).toHaveLength(1)
  const actual = value.widthCentered![0]
  expect(actual).toMatchObject({kind:'width',mode:'centered',mateId:'width',scopePath:[],widthBranch:'difference',tabBranch:'difference',alignment:'aligned',supportOnly:true})
  near(actual.angleRadians,0,1e-8); near(actual.offsetMm,0)
  near(actual.branchLengths.width,2,1e-10); near(actual.branchLengths.tab,2,1e-10)
  expect(value.checks.every(v => v.satisfied)).toBe(true)
}
/** Actual rebuilt D1 planes and literal eight-corner bounds; no mate helper oracle. */
function native(document:AssemblyDocument,oblique=false):number {
  return withNativeOwners(owners => {
    const part = document.definitions[0]; if (part.kind !== 'part') throw Error('Original prism required')
    const engine = new CadEngine(); owners.own({delete:() => engine.dispose()})
    const inventory = engine.rebuildForAssemblyReferences(part.document.features); expect(inventory.featureErrors).toEqual([])
    if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw Error('One original explicit prism required')
    const oc = getOC(), faces = new Map<string,{x:number[];z:number[]}>(), nx = oblique ? obliqueRotation([1,0,0]) : [1,0,0], nz = oblique ? obliqueRotation([0,0,1]) : [0,0,1]
    for (const occurrence of document.occurrences) {
      const t = occurrence.pose.translation, q = occurrence.pose.rotation
      const wantedQ = oblique ? [.2,.4,.4,.8] : [0,0,0,1], sign = dot(q,wantedQ)<0 ? -1 : 1
      q.forEach((v,i) => near(v,sign*wantedQ[i],1e-12))
      const shape = owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)),occurrence.pose))
      expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false)).IsValid()).toBe(true)
      expect(owners.ownAll(ownedNativeTopology(shape,'solid'))).toHaveLength(1)
      const volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      oc.BRepGProp.VolumeProperties(shape.wrapped,volume,1e-10,false,false); oc.BRepGProp.SurfaceProperties(shape.wrapped,area,false,false)
      near(volume.Mass(),96,1e-5); near(area.Mass(),128,1e-5)
      const corners = [-2,2].flatMap(x => [-3,3].flatMap(y => [0,4].map(z => {
        const rotated = oblique ? obliqueRotation([x,y,z]) : [x,y,z]
        return rotated.map((v,i) => v+t[i])
      }))), bounds = owners.own(shape.boundingBox).bounds
      for (let axis=0;axis<3;axis++) { near(bounds[0][axis],Math.min(...corners.map(p => p[axis]))); near(bounds[1][axis],Math.max(...corners.map(p => p[axis]))) }
      const measured = {x:[] as number[],z:[] as number[]}, nativeFaces = owners.ownAll(ownedNativeTopology(shape,'face')); expect(nativeFaces).toHaveLength(6)
      for (const face of nativeFaces) {
        const surface = owners.own(new oc.BRepAdaptor_Surface(face.wrapped,false)); expect(surface.GetType()).toBe(oc.GeomAbs_SurfaceType.GeomAbs_Plane)
        const p = owners.own(new oc.gp_Pnt()), u = owners.own(new oc.gp_Vec()), v = owners.own(new oc.gp_Vec()); surface.D1(.37,.71,p,u,v)
        const raw = [u.Y()*v.Z()-u.Z()*v.Y(),u.Z()*v.X()-u.X()*v.Z(),u.X()*v.Y()-u.Y()*v.X()]
        const sense = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1, n = raw.map(value => sense*value/Math.hypot(...raw))
        const point = [p.X(),p.Y(),p.Z()]
        if (Math.abs(dot(n,nx))>.999) {const sense = dot(n,nx)<0 ? -1 : 1; n.forEach((v,i) => near(v,sense*nx[i],1e-8)); measured.x.push(dot(nx,point))}
        if (Math.abs(dot(n,nz))>.999) {const sense = dot(n,nz)<0 ? -1 : 1; n.forEach((v,i) => near(v,sense*nz[i],1e-8)); measured.z.push(dot(nz,point))}
      }
      measured.x.sort((a,b) => a-b); measured.z.sort((a,b) => a-b)
      expect(measured.x).toHaveLength(2); expect(measured.z).toHaveLength(2)
      near(measured.x[0],dot(nx,t)-2); near(measured.x[1],dot(nx,t)+2); near(measured.z[0],dot(nz,t)); near(measured.z[1],dot(nz,t)+4)
      faces.set(occurrence.id,measured)
    }
    const midpoint = oblique ? dot(nx,[7,-11,13]) : 0
    near((faces.get('a')!.x[0]+faces.get('b')!.x[1])/2,midpoint)
    near((faces.get('c')!.x[0]+faces.get('d')!.x[1])/2,midpoint)
    return faces.get('d')!.z[0]-faces.get('c')!.z[1]
  })
}

it.each([0,.25])('stops centered four-plane translation before its independent geometric contact with clearance %s',clearance => {
  const document = original(), before = serializeAssemblyDocument(document), session = new AssemblyWorkerSession()
  try {
    near(native(document),4)
    const endpoint = ready(session.moveWorld(document,{component,pose:{translation:[0,0,2],rotation:[0,0,0,1]}}))
    const overlaps = analyzeAssemblyInterference(endpoint.document,{clearance:0}).pairs
    const pair = overlaps.find(v => [v.first.component.occurrencePath[0],v.second.component.occurrencePath[0]].sort().join(',') === 'c,d')
    expect(pair).toBeDefined(); near(pair!.intersectionVolume,48,1e-5)
    const preview = ready(session.translateUntilContact(document,request(),{clearance})), trace = preview.translation!.trace
    expect(trace.status).toBe('stopped'); expect(trace.queryCount).toBeGreaterThan(2)
    const z = preview.document.occurrences[3].pose.translation[2], gap = native(preview.document), blocker = trace.blockingPair!
    // z(s)=8-6s; exact geometric contact is s=2/3, before numerical safety terms.
    near(z,8-6*trace.fraction); expect(trace.fraction).toBeLessThan(2/3)
    near(trace.fraction,(4-clearance)/6); near(z,4+clearance,5e-6)
    expect(gap).toBeGreaterThan(blocker.band); near(blocker.minimumDistance,gap)
    expect(blocker.minimumDistance-blocker.band).toBeLessThanOrEqual(blocker.lengthTolerance)
    expect([blocker.first.component.occurrencePath[0],blocker.second.component.occurrencePath[0]].sort()).toEqual(['c','d'])
    report(preview); expect(preview.document.mates).toEqual(document.mates); expect(preview.document.occurrences.slice(0,3)).toEqual(document.occurrences.slice(0,3))
    expect(analyzeAssemblyInterference(preview.document,{clearance:0}).pairs).toEqual([])
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally {session.discard()}
},60_000)

it('completes a clear destination while retaining fresh four-plane evidence',() => {
  const document = original(), session = new AssemblyWorkerSession()
  try {const result = ready(session.translateUntilContact(document,request(12))); expect(result.translation!.trace.status).toBe('complete'); expect(result.translation!.trace.fraction).toBe(1); near(native(result.document),8); report(result)}
  finally {session.discard()}
},60_000)

it('retains the same contact fraction under an original rational common rigid frame',() => {
  const document = original()
  document.occurrences.forEach(v => {v.pose = {translation:obliquePoint(v.pose.translation),rotation:[.2,.4,.4,.8]}})
  const before = serializeAssemblyDocument(document), session = new AssemblyWorkerSession()
  try {
    near(native(document,true),4)
    // Literal t+R*(0,0,2)=(8.6,-11,14.2); common R leaves normal gap unchanged.
    const preview = ready(session.translateUntilContact(document,{component,translation:[8.6,-11,14.2]})), trace = preview.translation!.trace
    expect(trace.status).toBe('stopped'); expect(trace.fraction).toBeLessThan(2/3); near(trace.fraction,2/3)
    const gap = native(preview.document,true), blocker = trace.blockingPair!
    near(gap,4-6*trace.fraction); near(blocker.minimumDistance,gap)
    expect(gap).toBeGreaterThan(blocker.band); expect(blocker.minimumDistance-blocker.band).toBeLessThanOrEqual(blocker.lengthTolerance)
    const expected = obliquePoint([0,0,8-6*trace.fraction]), actual = preview.document.occurrences[3].pose.translation
    actual.forEach((v,i) => near(v,expected[i]))
    expect([blocker.first.component.occurrencePath[0],blocker.second.component.occurrencePath[0]].sort()).toEqual(['c','d'])
    report(preview); expect(preview.document.occurrences.slice(0,3)).toEqual(document.occurrences.slice(0,3)); expect(serializeAssemblyDocument(document)).toBe(before)
  } finally {session.discard()}
},60_000)

it.each(['initial-contact','budget','incompatible'] as const)('rejects %s without publishing a partial candidate',fault => {
  const document = original(); if (fault === 'initial-contact') document.occurrences[3].pose.translation[2]=4
  const before = serializeAssemblyDocument(document), session = new AssemblyWorkerSession()
  try {
    const intent = fault === 'incompatible' ? {...request(),translation:[1,0,2] as Vec3} : request()
    const result = session.translateUntilContact(document,intent,fault === 'budget' ? {maxQueries:1} : {})
    expect(result.status).toBe('rejected'); expect('token' in result).toBe(false); expect('document' in result).toBe(false); expect('translation' in result).toBe(false)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally {session.discard()}
},60_000)

it('authenticates Cancel and Apply and reopens one stopped history transaction',() => {
  const document = original(), session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(document), before = serializeAssemblyDocument(document)
  try {
    const canceled = ready(session.translateUntilContact(document,request())); session.discard(canceled.token)
    expect(() => session.apply(document,canceled.token)).toThrow(); expect(history.canUndo).toBe(false); expect(serializeAssemblyDocument(document)).toBe(before)
    const preview = ready(session.translateUntilContact(document,request())), expectedZ = preview.document.occurrences[3].pose.translation[2]
    preview.document.occurrences[3].pose.translation[2]=1234; preview.translation!.trace.fraction=1
    const applied = session.apply(document,preview.token).document
    near(applied.occurrences[3].pose.translation[2],expectedZ); expect(native(applied)).toBeGreaterThan(0); expect(applied.mates).toEqual(document.mates)
    expect(() => session.apply(document,preview.token)).toThrow(); history.commitDocument(applied)
    expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(applied)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    report(fresh); near(native(fresh.document),expectedZ-4); expect('translation' in reopened).toBe(false)
  } finally {session.discard()}
},60_000)
