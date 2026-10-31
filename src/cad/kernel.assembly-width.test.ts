import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyPlaneReference, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { composeRigidPoses, identityRigidPose, validateRigidPose, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, isResolvedAssemblyWidthMate } from './kernel.assembly-snapshot'
import { measureAssemblyWidthWitnesses } from './kernel.assembly-width'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference } from './kernel.assembly-types'
import { prepareAssemblySolve, discardAssemblySolvePreview } from './kernel.assembly-solve'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

type Width = Extract<AssemblyMate, { type: 'width' }>
const stamp = '2026-10-21T00:00:00.000Z', source = { id: 'original-width-box', revision: 'r1' }
const near = (a: number, b: number, tolerance = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
const dot = (a: Vec3, b: Vec3) => a.reduce((s, v, i) => s + v * b[i], 0)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const tuple = (v: { X(): number; Y(): number; Z(): number }): Vec3 => [v.X(), v.Y(), v.Z()]
function rotate(pose: RigidPose, p: Vec3): Vec3 {
  const [x, y, z, w] = pose.rotation, s = 2 / (x*x + y*y + z*z + w*w)
  return [(1-s*(y*y+z*z))*p[0]+s*(x*y-z*w)*p[1]+s*(x*z+y*w)*p[2], s*(x*y+z*w)*p[0]+(1-s*(x*x+z*z))*p[1]+s*(y*z-x*w)*p[2], s*(x*z-y*w)*p[0]+s*(y*z+x*w)*p[1]+(1-s*(x*x+y*y))*p[2]]
}
const transform = (pose: RigidPose, p: Vec3) => rotate(pose, p).map((v, i) => v + pose.translation[i]) as Vec3
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
function original(): AssemblyDocument {
  const document = validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'native-width-original', revision: 'a1', name: 'Original four native plane owners', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...source, document: { version: 1, id: source.id, name: 'Original 4 by 6 by 4 box', units: 'mm', createdAt: stamp, updatedAt: stamp,
      features: [{ id: 'profile', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
        { id: 'solid', name: 'Box', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'box' } }] } }],
    occurrences: ['a','b','c','d'].map((id, i) => ({ id, name: id, definition: { ...source }, pose: { ...identityRigidPose(), translation: [[-6,0,0],[6,0,0],[0,0,0],[3,0,0]][i] }, fixed: id !== 'd', visible: true, suppressed: false })), mates: [] })
  const scene = buildAssemblyScene(document)
  const face = (id: string, sign: number): AssemblyPlaneReference => {
    const body = scene.bodies.find(v => v.component.occurrencePath.at(-1) === id)!
    const faces = body.faces.filter(v => v.support?.kind === 'plane' && v.support.normal[0] * sign > .999)
    expect(faces).toHaveLength(1); return { ...assemblySceneFaceReference(faces[0])!, support:'plane' }
  }
  document.mates = [{ id: 'width', name: 'Original centered native planes', type: 'width', mode: 'centered', suppressed: false,
    width: [face('a', -1), face('b', 1)], tab: [face('c', -1), face('d', 1)], widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned' }]
  return validateAssemblyDocument(document)
}
const mate = (d: AssemblyDocument) => d.mates[0] as Width
function ready(value: ReturnType<typeof prepareAssemblySolve>) {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw Error(value.message)
  return value
}
function report(value: { readonly widthCentered?: readonly { readonly kind:string; readonly mode:string; readonly mateId:string; readonly supportOnly:boolean; readonly angleRadians:number; readonly offsetMm:number; readonly lengthTolerance:number; readonly angleTolerance:number; readonly widthBranch:string; readonly tabBranch:string; readonly alignment:string; readonly branchLengths:{readonly width:number; readonly tab:number} }[] }): void {
  expect(value.widthCentered).toHaveLength(1)
  const actual = value.widthCentered![0]
  expect(actual).toMatchObject({kind:'width',mode:'centered',mateId:'width',supportOnly:true,widthBranch:'difference',tabBranch:'difference',alignment:'aligned'})
  near(actual.angleRadians,0,1e-8); near(actual.offsetMm,0)
  near(actual.branchLengths.width,2,1e-10); near(actual.branchLengths.tab,2,1e-10)
  expect(actual.lengthTolerance).toBeGreaterThan(0); expect(actual.angleTolerance).toBeGreaterThan(0)
  expect(actual.angleRadians).toBeLessThanOrEqual(actual.angleTolerance); expect(Math.abs(actual.offsetMm)).toBeLessThanOrEqual(actual.lengthTolerance)
}

/** Rebuild actual solids and measure oriented D1 surface normals, not solver helpers. */
function physical(document: AssemblyDocument, occurrences = document.occurrences, widths: Readonly<Record<string,number>> = {}): void {
  withNativeOwners(owners => {
    const planes = new Map<string, { normal: Vec3; offset: number }[]>(), oc = getOC()
    for (const occurrence of occurrences) {
      const width = widths[occurrence.id] ?? 4
      const definition = document.definitions.find(v => v.id === occurrence.definition.id && v.revision === occurrence.definition.revision)!
      if (definition.kind !== 'part') throw Error('Original box required')
      const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(definition.document.features)
      expect(inventory.featureErrors).toEqual([])
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw Error('One explicit native box required')
      const raw = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(raw, occurrence.pose))
      expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)).IsValid()).toBe(true)
      expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      const volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      near(volume.Mass(), 24*width, 1e-5); near(area.Mass(), 20*width+48, 1e-5)
      const corners = [-width/2,width/2].flatMap(x => [-3,3].flatMap(y => [0,4].map(z => transform(occurrence.pose, [x,y,z])))), bounds = owners.own(shape.boundingBox).bounds
      for (let axis = 0; axis < 3; axis++) { near(bounds[0][axis], Math.min(...corners.map(p => p[axis]))); near(bounds[1][axis], Math.max(...corners.map(p => p[axis]))) }
      const wanted = rotate(occurrence.pose, [1,0,0]), measured: { normal: Vec3; offset: number }[] = []
      const faces = owners.ownAll(ownedNativeTopology(shape, 'face')); expect(faces).toHaveLength(6)
      for (const face of faces) {
        const adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false))
        expect(adaptor.GetType()).toBe(oc.GeomAbs_SurfaceType.GeomAbs_Plane)
        const p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
        adaptor.D1(.37,.71,p,du,dv)
        const v = cross(tuple(du),tuple(dv)), sense = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1
        const normal = v.map(x => sense*x/Math.hypot(...v)) as Vec3
        if (Math.abs(dot(normal,wanted)) > .999) measured.push({ normal, offset: dot(normal,tuple(p)) })
      }
      expect(measured).toHaveLength(2); planes.set(occurrence.id, measured)
    }
    const declaration = mate(document)
    const referencePlane = (reference: AssemblyGeometryReference, sign: number) => {
      const id = reference.component!.occurrencePath.at(-1)!, occurrence = occurrences.find(v => v.id === id)!, wanted = rotate(occurrence.pose,[sign,0,0])
      const matches = planes.get(id)!.filter(v => dot(v.normal,wanted) > .999); expect(matches).toHaveLength(1)
      return matches[0]
    }
    const bisector = (pair: typeof declaration.width) => {
      const a = referencePlane(pair[0],-1), b = referencePlane(pair[1],1), difference = a.normal.map((v,i) => v-b.normal[i]) as Vec3, length = Math.hypot(...difference)
      return { n: difference.map(v => v/length) as Vec3, h: (a.offset-b.offset)/length }
    }
    const w = bisector(declaration.width), t = bisector(declaration.tab)
    near(Math.atan2(Math.hypot(...cross(w.n,t.n)),dot(w.n,t.n)),0,1e-8); near(w.h,t.h)
  })
}

it('solves only the fourth native reference owner and independently rebuilds its final planes', () => {
  const document = original(), before = serializeAssemblyDocument(document), value = ready(prepareAssemblySolve(document))
  try {
    near(value.document.occurrences.find(v => v.id === 'd')!.pose.translation[0],0)
    expect(value.document.occurrences.slice(0,3)).toEqual(document.occurrences.slice(0,3)); expect(value.document.mates).toEqual(document.mates)
    const group = value.scopes.at(-1)!.result.evidence.groups.find(v => v.constraintIds.includes('width'))!
    expect(group.bodyIds).toHaveLength(1); expect(group.rank).toBe(3); expect(group.localDOF).toBe(3)
    physical(validateAssemblyDocument(value.document))
    report(value)
  } finally { discardAssemblySolvePreview(value) }
  expect(serializeAssemblyDocument(document)).toBe(before)
},60_000)

it('retains four distinct native owners in one incidence group', () => {
  const document = original(); document.occurrences.forEach(v => { v.fixed = false }); document.occurrences[3].pose.translation = [0,0,0]
  const value = ready(prepareAssemblySolve(document))
  try { const group = value.scopes.at(-1)!.result.evidence.groups.find(v => v.constraintIds.includes('width'))!; expect(group.bodyIds).toHaveLength(4); expect(group.variableCount).toBe(24); expect(group.rank).toBe(3); physical(validateAssemblyDocument(value.document)) }
  finally { discardAssemblySolvePreview(value) }
},60_000)

it.each(['same','two'] as const)('keeps repeated native owner incidence for %s ownership', mode => {
  const document = original(), declaration = mate(document)
  document.occurrences.forEach(v => { v.fixed = false; v.pose = identityRigidPose() })
  declaration.width[0].component!.occurrencePath = ['a']; declaration.width[1].component!.occurrencePath = ['a']
  declaration.tab[0].component!.occurrencePath = [mode === 'same' ? 'a' : 'b']; declaration.tab[1].component!.occurrencePath = [mode === 'same' ? 'a' : 'b']
  const value = ready(prepareAssemblySolve(document))
  try { const group = value.scopes.at(-1)!.result.evidence.groups.find(v => v.constraintIds.includes('width'))!; expect(group.bodyIds).toHaveLength(mode === 'same' ? 1 : 2); expect(group.rank).toBe(mode === 'same' ? 0 : 3); physical(validateAssemblyDocument(value.document)) }
  finally { discardAssemblySolvePreview(value) }
},60_000)

it('solves a nested declaring frame without changing its parent placement', () => {
  const document = original(), sub: EmbeddedAssemblyDefinition = { kind:'assembly', id:'nested-width', revision:'s1', name:'Original nested width', createdAt:stamp, updatedAt:stamp, occurrences:document.occurrences, mates:document.mates }
  document.definitions.push(sub); document.mates = []; document.occurrences = [{ id:'scope',name:'scope',definition:{id:sub.id,revision:sub.revision},pose:{translation:[30,-11,7],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2]},fixed:true,visible:true,suppressed:false }]
  const before = structuredClone(document.occurrences), value = ready(prepareAssemblySolve(document))
  try {
    expect(value.document.occurrences).toEqual(before)
    const solvedDocument = validateAssemblyDocument(value.document)
    const solvedSub = solvedDocument.definitions.find(v => v.id === sub.id)
    if (!solvedSub || solvedSub.kind !== 'assembly') throw Error('Solved original nested assembly required')
    near(solvedSub.occurrences.find(v => v.id === 'd')!.pose.translation[0],0)
    const placed = solvedSub.occurrences.map(v => ({ ...v, pose:composeRigidPoses(validateRigidPose(value.document.occurrences[0].pose),v.pose) }))
    physical({ ...solvedDocument, occurrences:placed, mates:solvedSub.mates })
    near(placed.find(v => v.id === 'd')!.pose.translation[1],-11)
  } finally { discardAssemblySolvePreview(value) }
},60_000)

it('authenticates each original face witness by snapshot identity and lifetime', () => {
  const document = original(), snapshot = new AssemblyGeometrySnapshot(document), other = new AssemblyGeometrySnapshot(document), declaration = mate(document)
  try {
    const witnesses = [...declaration.width,...declaration.tab].map(reference => snapshot.resolveReference(document,reference))
    expect(witnesses.map(v => [...v.componentPath])).toEqual([['a'],['b'],['c'],['d']])
    for (const witness of witnesses) { expect(snapshot.assertWitness(witness,document)).toBe(witness); expect(() => other.assertWitness(witness,document)).toThrow() }
    snapshot.dispose(); for (const witness of witnesses) expect(() => snapshot.assertWitness(witness,document)).toThrow()
  } finally { snapshot.dispose(); other.dispose() }
},60_000)

it('rejects invalid direct measurement tolerances before disturbing live four-face evidence', () => {
  const document = original(); document.occurrences[3].pose.translation = [0,0,0]
  const before = serializeAssemblyDocument(document), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const resolved = snapshot.resolveActiveMates(document)[0]
    if (!isResolvedAssemblyWidthMate(resolved)) throw Error('Four original width witnesses required')
    for (const invalid of [NaN,Infinity,0,-1]) {
      expect(() => measureAssemblyWidthWitnesses(snapshot,document,resolved,invalid,1e-8)).toThrow()
      expect(() => measureAssemblyWidthWitnesses(snapshot,document,resolved,1e-6,invalid)).toThrow()
    }
    expect(() => measureAssemblyWidthWitnesses(snapshot,document,resolved,1e-6,Math.PI)).toThrow()
    for (const witness of [...resolved.width,...resolved.tab]) expect(snapshot.assertWitness(witness,document)).toBe(witness)
    const actual = measureAssemblyWidthWitnesses(snapshot,document,resolved,1e-6,1e-8)
    near(actual.angleRadians,0,1e-8); near(actual.offsetMm,0)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { snapshot.dispose() }
},60_000)

it.each(['stale','suppressed','wrong-purpose'] as const)('rejects a %s fourth support atomically', fault => {
  const document = original()
  if (fault === 'stale') mate(document).tab[1].component!.definition.revision = 'stale'
  if (fault === 'suppressed') document.occurrences[3].suppressed = true
  if (fault === 'wrong-purpose') (mate(document).tab[1] as unknown as {support:string}).support = 'axis'
  const before = JSON.stringify(document), result = prepareAssemblySolve(document)
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect(JSON.stringify(document)).toBe(before)
},60_000)

it('cancels, applies, undoes and reopens a worker-owned four-reference proposal', () => {
  const document = original(), session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(document)
  try {
    const canceled = session.prepare(document); expect(canceled.status).toBe('ready'); if (canceled.status !== 'ready') throw Error(canceled.message)
    session.discard(canceled.token); expect(() => session.apply(document,canceled.token)).toThrow(); expect(history.canUndo).toBe(false)
    const preview = session.prepare(document); expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw Error(preview.message)
    const applied = session.apply(document,preview.token).document; physical(applied); history.commitDocument(applied)
    expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(applied)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = session.prepare(reopened)
    expect(fresh.status).toBe('ready'); if (fresh.status !== 'ready') throw Error(fresh.message)
    expect(fresh.document.mates).toEqual(document.mates); physical(fresh.document); report(fresh)
  } finally { session.discard() }
},60_000)

it('requires all four explicit native replacement decisions before publishing the replacement', () => {
  const document = original(), definition = document.definitions[0]; if (definition.kind !== 'part') throw Error('Original box required')
  // A real original geometric change: every box widens from 4 to 6 mm.
  const replacement = { ...structuredClone(definition.document), id:'replacement-width-box-original' }
  const profile = replacement.features[0]; if (profile.type !== 'sketch' || profile.profile.kind !== 'rectangle') throw Error('Original rectangle required')
  profile.profile.width = 6
  const session = new AssemblyWorkerSession(), before = serializeAssemblyDocument(document)
  try {
    const oldGeometry = validateAssemblyDocument(document); oldGeometry.occurrences[3].pose.translation = [0,0,0]; physical(oldGeometry)
    const review = session.reviewReplacement(document,{ mode:'all', component:{ occurrencePath:['d'],definition:source }, part:replacement, revision:'r-new', ancestorRevisions:[] })
    expect(review.expandedPaths).toEqual([['a'],['b'],['c'],['d']])
    expect(review.endpoints.map(v => [v.locator.side,v.status])).toEqual([['width-0','needs-repair'],['width-1','needs-repair'],['tab-0','needs-repair'],['tab-1','needs-repair']])
    const repairs = review.endpoints.map(item => {
      const sign = item.locator.side.endsWith('-0') ? -1 : 1
      const faces = review.replacementCatalog.bodies.flatMap(v => v.faces).filter(v => v.support?.kind === 'plane' && v.support.normal[0]*sign > .999)
      expect(faces).toHaveLength(1)
      const reference = { ...assemblySceneFaceReference(faces[0])!,support:'plane' as const,component:structuredClone(item.desiredComponent) }
      return { locator:item.locator, reference }
    })
    expect(() => session.previewReplacement(document,review.reviewId,{ repairs:repairs.slice(0,3),removed:[],recapture:[] })).toThrow(/pendientes/)
    expect(serializeAssemblyDocument(document)).toBe(before)
    const preview = session.previewReplacement(document,review.reviewId,{ repairs,removed:[],recapture:[] })
    expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw Error(preview.message)
    const applied = session.apply(document,preview.token).document
    expect(mate(applied).width).toEqual(repairs.slice(0,2).map(v => v.reference)); expect(mate(applied).tab).toEqual(repairs.slice(2).map(v => v.reference))
    physical(applied,applied.occurrences,{a:6,b:6,c:6,d:6}); expect(parseAssemblyDocument(serializeAssemblyDocument(applied))).toEqual(applied)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { session.discard() }
},60_000)

it('repairs four current native faces after a real source widening and then solves a wider selected replacement', () => {
  const document = original(); document.occurrences[3].pose.translation = [0,0,0]
  physical(document)
  const part = document.definitions[0]; if (part.kind !== 'part') throw Error('Original source required')
  const widened = structuredClone(part.document), sketch = widened.features[0]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'rectangle') throw Error('Original rectangle required')
  sketch.profile.width = 6
  const before = serializeAssemblyDocument(document), review = reviewAssemblyPartSourceUpdate(document,source,widened,'r2')
  expect(review.endpoints.map(v => [v.locator.side,v.status])).toEqual([['width-0','needs-repair'],['width-1','needs-repair'],['tab-0','needs-repair'],['tab-1','needs-repair']])
  expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  const snapshot = new AssemblyGeometrySnapshot(review.document)
  try { for (const old of [...mate(document).width,...mate(document).tab]) expect(() => snapshot.resolveReference(review.document,old)).toThrow() }
  finally { snapshot.dispose() }
  let repaired = review.document
  for (const item of review.endpoints) {
    const old = item.endpoint as AssemblyGeometryReference, id = old.component!.occurrencePath[0], sign = item.locator.side.endsWith('-0') ? -1 : 1
    const faces = review.scene.bodies.find(v => v.component.occurrencePath[0] === id)!.faces.filter(v => v.support?.kind === 'plane' && v.support.normal[0]*sign > .999)
    expect(faces).toHaveLength(1)
    repaired = repairAssemblyEndpoint(repaired,item.locator,{...assemblySceneFaceReference(faces[0])!,support:'plane'})
  }
  const session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(document)
  try {
    const preview = session.prepare(document,repaired); expect(preview.status).toBe('ready'); if (preview.status !== 'ready') throw Error(preview.message)
    const applied = session.apply(document,preview.token).document
    physical(applied,applied.occurrences,{a:6,b:6,c:6,d:6}); near(applied.occurrences[3].pose.translation[0],0)
    history.commitDocument(applied); expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(applied)
    expect(parseAssemblyDocument(serializeAssemblyDocument(applied))).toEqual(applied)
    const wider = structuredClone(widened); wider.id = 'selected-eight-mm-original'
    const profile = wider.features[0]; if (profile.type !== 'sketch' || profile.profile.kind !== 'rectangle') throw Error('Original rectangle required')
    profile.profile.width = 8
    const replacement = session.reviewReplacement(applied,{mode:'selected',component:{occurrencePath:['d'],definition:{...source,revision:'r2'}},part:wider,revision:'r1',ancestorRevisions:[]})
    expect(replacement.endpoints.map(v => v.locator.side)).toEqual(['tab-1'])
    const item = replacement.endpoints[0], faces = replacement.replacementCatalog.bodies.flatMap(v => v.faces).filter(v => v.support?.kind === 'plane' && v.support.normal[0] > .999)
    expect(faces).toHaveLength(1)
    const candidate = session.previewReplacement(applied,replacement.reviewId,{repairs:[{locator:item.locator,reference:{...assemblySceneFaceReference(faces[0])!,support:'plane',component:structuredClone(item.desiredComponent)}}],removed:[],recapture:[]})
    expect(candidate.status).toBe('ready'); if (candidate.status !== 'ready') throw Error(candidate.message)
    const final = session.apply(applied,candidate.token).document
    // Tab planes are -3 and d+4; their midpoint is zero only for d=-1 mm.
    near(final.occurrences[3].pose.translation[0],-1)
    expect(final.occurrences.slice(0,3)).toEqual(applied.occurrences.slice(0,3))
    physical(final,final.occurrences,{a:6,b:6,c:6,d:8})
    expect(parseAssemblyDocument(serializeAssemblyDocument(final))).toEqual(final)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { session.discard() }
},60_000)

it('solves original intersecting triangular-prism sides and checks the rebuilt D1 bisectors', () => {
  const document = original(); document.mates = []; document.occurrences = document.occurrences.slice(0,2)
  const base = document.definitions[0]; if (base.kind !== 'part') throw Error('Original source required')
  document.definitions = [4,3].map((halfWidth,i) => {
    const part = structuredClone(base), height = i === 0 ? 3 : 4
    part.id = 'triangle-original-' + i; part.document.id = part.id
    const sketch = part.document.features[0]; if (sketch.type !== 'sketch') throw Error('Original sketch required')
    sketch.profile = { kind:'entities',points:[{id:'a',x:-halfWidth,y:0},{id:'b',x:halfWidth,y:0},{id:'c',x:0,y:height}],
      entities:[['a','b'],['b','c'],['c','a']].map(([start,end],j) => ({id:'edge-'+j,type:'line' as const,start,end,construction:false})),constraints:[] }
    return part
  })
  document.occurrences.forEach((v,i) => { v.definition = {id:document.definitions[i].id,revision:'r1'}; v.fixed = i === 0; v.pose = identityRigidPose() })
  const scene = buildAssemblyScene(document)
  const select = (id:string,normal:Vec3): AssemblyPlaneReference => {
    const faces = scene.bodies.find(v => v.component.occurrencePath[0] === id)!.faces.filter(v => v.support?.kind === 'plane' && dot(v.support.normal,normal) > .999999)
    expect(faces).toHaveLength(1); return {...assemblySceneFaceReference(faces[0])!,support:'plane'}
  }
  document.mates = [{id:'width',name:'Original triangular centered planes',type:'width',mode:'centered',suppressed:false,
    width:[select('a',[-.6,.8,0]),select('a',[.6,.8,0])],tab:[select('b',[-.8,.6,0]),select('b',[.8,.6,0])],widthBranch:'difference',tabBranch:'difference',alignment:'aligned'}]
  document.occurrences[1].pose = {translation:[3,0,0],rotation:[0,0,Math.sin(.27/2),Math.cos(.27/2)]}
  const value = ready(prepareAssemblySolve(document))
  try {
    const actual = validateAssemblyDocument(value.document), measured = withNativeOwners(owners => actual.occurrences.map((occurrence,i) => {
      const part = actual.definitions.find(v => v.id === occurrence.definition.id)!; if (part.kind !== 'part') throw Error('Original triangle part required')
      const engine = new CadEngine(); owners.own({delete:() => engine.dispose()})
      const inventory = engine.rebuildForAssemblyReferences(part.document.features); expect(inventory.featureErrors).toEqual([])
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw Error('One triangular prism required')
      const sourceShape = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(sourceShape,occurrence.pose)), oc = getOC()
      expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped,true,false,false)).IsValid()).toBe(true)
      expect(owners.ownAll(ownedNativeTopology(shape,'solid'))).toHaveLength(1)
      const volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      oc.BRepGProp.VolumeProperties(shape.wrapped,volume,1e-10,false,false); oc.BRepGProp.SurfaceProperties(shape.wrapped,area,false,false)
      near(volume.Mass(),48,1e-5); near(area.Mass(),i === 0 ? 96 : 88,1e-5)
      const half = i === 0 ? 4 : 3, height = i === 0 ? 3 : 4
      const corners = [[-half,0],[half,0],[0,height]].flatMap(([x,y]) => [0,4].map(z => transform(occurrence.pose,[x,y,z]))), bounds = owners.own(shape.boundingBox).bounds
      for (let axis = 0; axis < 3; axis++) { near(bounds[0][axis],Math.min(...corners.map(p => p[axis]))); near(bounds[1][axis],Math.max(...corners.map(p => p[axis]))) }
      const expected = (i === 0 ? [[-.6,.8,0],[.6,.8,0]] : [[-.8,.6,0],[.8,.6,0]]) as Vec3[], planes: {n:Vec3;h:number}[] = []
      for (const wantedLocal of expected) {
        const wanted = rotate(occurrence.pose,wantedLocal), found: {n:Vec3;h:number}[] = []
        for (const face of owners.ownAll(ownedNativeTopology(shape,'face'))) {
          const adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped,false)); if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) continue
          const p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec()); adaptor.D1(.37,.71,p,du,dv)
          const raw = cross(tuple(du),tuple(dv)), sense = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1, n = raw.map(v => sense*v/Math.hypot(...raw)) as Vec3
          if (dot(n,wanted) > .999999) found.push({n,h:dot(n,tuple(p))})
        }
        expect(found).toHaveLength(1); planes.push(found[0])
      }
      near(dot(planes[0].n,planes[1].n),i === 0 ? .28 : -.28,1e-12)
      const difference = planes[0].n.map((v,j) => v-planes[1].n[j]) as Vec3, length = Math.hypot(...difference)
      return { n:difference.map(v => v/length) as Vec3,h:(planes[0].h-planes[1].h)/length }
    }))
    near(Math.atan2(Math.hypot(...cross(measured[0].n,measured[1].n)),dot(measured[0].n,measured[1].n)),0,1e-8)
    near(measured[0].h,0); near(measured[1].h,0)
    expect(value.widthCentered).toHaveLength(1); near(value.widthCentered![0].angleRadians,0,1e-8); near(value.widthCentered![0].offsetMm,0)
    near(value.widthCentered![0].branchLengths.width,1.2,1e-10); near(value.widthCentered![0].branchLengths.tab,1.6,1e-10)
  } finally { discardAssemblySolvePreview(value) }
},60_000)
