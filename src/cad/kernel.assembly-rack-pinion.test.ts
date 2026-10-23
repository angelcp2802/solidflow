import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, type AssemblyAxisReference, type AssemblyDocument,
  type AssemblyEdgeReference, type AssemblyMate } from '../model/assemblyDocument'
import { createEmptyAssembly } from '../examples/assembly'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { assemblySceneFaceReference, assemblySceneEdgeReference, type AssemblyPreviewReply, type AssemblyScene,
  type AssemblySceneFace, type AssemblySceneEdge, type AssemblyRackPinionCaptureRequest } from './kernel.assembly-types'
import { buildAssemblyScene } from './kernel.assembly-scene'
import * as scenes from './kernel.assembly-scene'
import * as solver from '../model/assemblySolver'
import { captureAssemblyRackPinionPreview, discardAssemblySolvePreview, prepareAssemblySolve } from './kernel.assembly-solve'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { NativeCleanupError } from './kernel.native-ownership'
import { CadEngine } from './kernel.engine'

// Original public synthetic motor/slider fixture and independent analytical
// geometry are tracked with its generator. No teeth/contact geometry is inferred.
let original: AssemblyDocument, screwOriginal: AssemblyDocument
beforeAll(async () => {
  const [oc, text, screw] = await Promise.all([initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }),
    readFile(new URL('./fixtures/assembly-rack-pinion-original.json', import.meta.url), 'utf8'),
    readFile(new URL('./fixtures/assembly-screw-original.json', import.meta.url), 'utf8')])
  setOC(oc); original = parseAssemblyDocument(text); screwOriginal = parseAssemblyDocument(screw)
}, 60_000)
const VOLUME = 10800 + 217 * Math.PI / 8, AREA = 5560 + 6115 * Math.PI / 8

it('authors a root revision while preserving native rack conversion and captured spin/travel',()=>{
  const {session,document}=captured(),before=serializeAssemblyDocument(document),declaration=structuredClone(rack(document))
  try {
    const p=ready(session.previewRootRevision(document,'original-rack-source-r2'))
    expect(p.document.revision).toBe('original-rack-source-r2');expect(p.document.mates).toEqual(document.mates)
    expect(p.checks.every(c=>c.satisfied)).toBe(true);physical(p.scene)
    rack(p.document).neutralTravel=999
    const applied=session.apply(document,p.token)
    expect(rack(applied.document)).toEqual(declaration);expect(applied.document.revision).toBe('original-rack-source-r2');physical(applied.scene)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally {session.discard()}
},60_000)
function close(actual: number, expected: number, tolerance = 1e-8) { expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance) }
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function rack(document: AssemblyDocument): Extract<AssemblyMate, { type: 'rack-pinion' }> {
  const result = document.mates.find(mate => mate.type === 'rack-pinion')
  if (!result || result.type !== 'rack-pinion') throw new Error('Original captured rack and pinion missing')
  return result
}
function component(document: AssemblyDocument, id: string) {
  return { occurrencePath: [id], definition: { ...document.occurrences.find(value => value.id === id)!.definition } }
}
function body(scene: AssemblyScene, id: string) { return scene.bodies.find(body => body.component.occurrencePath[0] === id)! }
function cylinder(scene: AssemblyScene, id: string, radius: number): AssemblySceneFace {
  const result = body(scene, id).faces.filter(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - radius) < 1e-9)
  expect(result).toHaveLength(1); return result[0]
}
function cap(scene: AssemblyScene, id: string, height: number): AssemblySceneFace {
  const result = body(scene, id).faces.find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - height) < 1e-9)
  if (!result) throw new Error('Original axial cap missing')
  return result
}
function axis(face: AssemblySceneFace): AssemblyAxisReference {
  const reference = assemblySceneFaceReference(face)
  if (!reference || reference.kind !== 'face' || reference.support !== 'axis') throw new Error('Original native axis missing')
  return reference as AssemblyAxisReference
}
function line(scene: AssemblyScene): AssemblySceneEdge {
  const result = body(scene, 'rack').edges?.find(edge => edge.support?.kind === 'line' && edge.support.axis[2] > .99
    && Math.abs(Math.abs(edge.support.point[0]) - 5) < 1e-9 && Math.abs(Math.abs(edge.support.point[1]) - 5) < 1e-9)
  if (!result) throw new Error('Original rectangular extrusion LINE missing')
  return result
}
function fixture(input = original): AssemblyDocument {
  const document = structuredClone(input), scene = buildAssemblyScene(document)
  for (const [id, radius] of [['pinion', 2], ['rack', 2.5], ['ground', 3], ['guide', 2]] as const) {
    const support = cylinder(scene, id, radius).support
    if (support?.kind !== 'cylinder') throw new Error('Original native cylinder missing')
    close(support.axis[0], 0, 1e-12); close(support.axis[1], 0, 1e-12); close(support.axis[2], -1, 1e-12)
  }
  document.mates = [
    { id: 'pinion-bearing', name: 'Original motor bearing', type: 'concentric', first: axis(cylinder(scene, 'pinion', 2)),
      second: axis(cylinder(scene, 'ground', 3)), alignment: 'aligned', rotationLock: null, suppressed: false },
    { id: 'pinion-axial', name: 'Original axial datum', type: 'distance', first: { ...assemblySceneFaceReference(cap(scene, 'pinion', 30))!, support: 'plane' },
      second: { ...assemblySceneFaceReference(cap(scene, 'ground', 4))!, support: 'plane' }, alignment: 'aligned', distance: 18, suppressed: false },
    { id: 'rack-guide', name: 'Original nonrotating rack guide', type: 'concentric', first: axis(cylinder(scene, 'rack', 2.5)),
      second: axis(cylinder(scene, 'guide', 2)), alignment: 'aligned', rotationLock: [0, 0, 0, 1], suppressed: false },
  ]
  return document
}
function intent(document: AssemblyDocument, kind: 'line' | 'cylinder' = 'line'): AssemblyRackPinionCaptureRequest {
  const scene = buildAssemblyScene(document)
  return { first: axis(cylinder(scene, 'pinion', 2)), second: kind === 'line' ? assemblySceneEdgeReference(line(scene))! : axis(cylinder(scene, 'rack', 2.5)),
    conversion: { mode: 'diameter', override: null }, reverse: false, name: 'Original captured rack and pinion' }
}
function captured(kind: 'line' | 'cylinder' = 'line', input = original) {
  const session = new AssemblyWorkerSession(), base = fixture(input), request = intent(base, kind), initial = ready(session.prepare(base))
  const preview = ready(session.captureRackPinion(base, initial.token, request))
  return { session, base, initial, preview, document: session.apply(base, preview.token).document }
}
function motion(document: AssemblyDocument, id: string, angle: number, translation?: [number, number, number]) {
  return { component: component(document, id), translation: translation ?? [...document.occurrences.find(value => value.id === id)!.pose.translation] as [number, number, number],
    rotation: { axis: 2 as const, angle } }
}
function physical(scene: AssemblyScene, multiplier = 1) {
  expect(scene.solidCount).toBe(4 * multiplier); close(scene.volume, VOLUME * multiplier, 1e-5); close(scene.area, AREA * multiplier, 1e-5)
}

it.each(['line', 'cylinder'] as const)('captures fresh native rack %s with no implied positioning or geometric guides', kind => {
  const session = new AssemblyWorkerSession(), base = fixture(), request = intent(base, kind), initial = ready(session.prepare(base)), before = serializeAssemblyDocument(base)
  const build = scenes.buildAssemblyScene; let publications = 0
  const spy = vi.spyOn(scenes, 'buildAssemblyScene').mockImplementation(document => { publications++; return build(document) })
  try {
    expect(initial.scopes.at(-1)!.result.localDOF).toBe(2)
    const preview = ready(session.captureRackPinion(base, initial.token, request))
    expect(publications).toBe(1); expect(preview.scopes.at(-1)!.result.localDOF).toBe(1)
    expect(preview.document.occurrences).toEqual(base.occurrences)
    expect(rack(preview.document)).toMatchObject({ angle: 0, conversion: { mode: 'diameter', override: null }, reverse: false })
    close(rack(preview.document).neutralTravel, -10, 1e-6)
    // Rack is Y90 relative to pinion; zero is their actual relative orientation.
    close(rack(preview.document).neutralRotation[1], -Math.SQRT1_2); close(rack(preview.document).neutralRotation[3], Math.SQRT1_2)
    expect(rack(preview.document).second.kind).toBe(kind === 'line' ? 'edge' : 'face')
    physical(preview.scene); expect(preview.scene.prototypeCount).toBe(4); expect(serializeAssemblyDocument(base)).toBe(before)
    expect(() => session.apply(base, initial.token)).toThrow('disponible')
    const applied = session.apply(base, preview.token); physical(applied.scene)
    expect(() => session.apply(base, preview.token)).toThrow('disponible')
  } finally { spy.mockRestore(); session.discard() }
}, 60_000)

it('publishes per-edge world meshes and native LINE supports for a rotated rack without aggregate inference', () => {
  const base = fixture(), scene = buildAssemblyScene(base), selected = line(scene), reference = assemblySceneEdgeReference(selected)!, snapshot = new AssemblyGeometrySnapshot(base)
  try {
    expect(selected.selection.component.occurrencePath).toEqual(['rack']); expect(selected.worldSupport?.kind).toBe('line')
    close(selected.worldSupport!.axis[0], 1); close(selected.worldSupport!.axis[1], 0); close(selected.worldSupport!.axis[2], 0)
    expect(selected.lines).toHaveLength(6)
    close(Math.abs(selected.lines[3] - selected.lines[0]), 60, 1e-6)
    close(selected.lines[1], 10 + selected.support!.point[1], 1e-6); close(selected.lines[4], selected.lines[1], 1e-6)
    close(selected.lines[2], 10 - selected.support!.point[0], 1e-6); close(selected.lines[5], selected.lines[2], 1e-6)
    const witness = snapshot.resolveReference(base, reference)
    expect(witness.origin).toBe('native-edge'); expect(witness.kind === 'support' && witness.localSupport.kind).toBe('line')
    expect(() => snapshot.assertWitness(structuredClone(witness), base)).toThrow('verificada')
    const stale = structuredClone(base); stale.name += ' stale'
    expect(() => snapshot.resolveReference(stale, reference)).toThrow('documento cambió')
    const circle = body(scene, 'rack').edges!.find(edge => edge.support === null)!
    expect(assemblySceneEdgeReference(circle)).toBeNull()
  } finally { snapshot.dispose() }
}, 60_000)

it.each(['line', 'cylinder'] as const)('continues full +720-degree native winding into rack travel for %s and reconstructs saved state', kind => {
  const value = captured(kind), before = serializeAssemblyDocument(value.document)
  try {
    const preview = ready(value.session.moveMotion(value.document, motion(value.document, 'pinion', 4 * Math.PI)))
    close(rack(preview.document).angle, -4 * Math.PI); close(preview.document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10 - 8 * Math.PI, 1e-6)
    expect(preview.motion).toMatchObject({ requestedAngle: 4 * Math.PI, stationCount: 12, verifiedStations: 12, windingTolerance: 1e-8 })
    close(preview.motion!.evaluatedAngle, 4 * Math.PI)
    const marker = cylinder(preview.scene, 'pinion', .25).worldSupport
    if (marker?.kind !== 'cylinder') throw new Error('Original pinion marker missing')
    close(marker.point[0], 1, 1e-6); close(marker.point[1], 0, 1e-6); physical(preview.scene)
    expect(serializeAssemblyDocument(value.document)).toBe(before)
    const applied = value.session.apply(value.document, preview.token).document, reopened = parseAssemblyDocument(serializeAssemblyDocument(applied))
    const fresh = ready(value.session.prepare(reopened)); close(rack(fresh.document).angle, -4 * Math.PI)
    expect(fresh.scopes.at(-1)!.result.localDOF).toBe(1); expect(fresh.checks.every(check => check.satisfied)).toBe(true)
    physical(value.session.apply(reopened, fresh.token).scene)
  } finally { value.session.discard() }
}, 60_000)

it.each([{ mode: 'diameter' as const, override: 6, reverse: false, advance: -Math.PI },
  { mode: 'travel' as const, override: 10, reverse: false, advance: -5 / 3 },
  { mode: 'diameter' as const, override: null, reverse: true, advance: 2 * Math.PI / 3 }])('uses explicit conversion and reverse intent %j without changing native zeros', parameters => {
  const value = captured(), proposal = structuredClone(value.document)
  Object.assign(rack(proposal), { conversion: { mode: parameters.mode, override: parameters.override }, reverse: parameters.reverse })
  try {
    const updated = value.session.apply(value.document, ready(value.session.prepare(value.document, proposal)).token).document
    expect(rack(updated).neutralRotation).toEqual(rack(value.document).neutralRotation)
    expect(rack(updated).neutralTravel).toBe(rack(value.document).neutralTravel); close(rack(updated).neutralTravel, -10, 1e-6)
    const preview = ready(value.session.moveMotion(updated, motion(updated, 'pinion', Math.PI / 3)))
    close(rack(preview.document).angle, -Math.PI / 3); close(preview.document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10 + parameters.advance, 1e-6)
  } finally { value.session.discard() }
}, 60_000)

it('converts a driven rack advance into native pinion rotation using the saved branch', () => {
  const value = captured()
  try {
    const preview = ready(value.session.moveMotion(value.document, motion(value.document, 'rack', 0, [-9, 10, 10])))
    close(rack(preview.document).angle, .5, 1e-5)
    const marker = cylinder(preview.scene, 'pinion', .25).worldSupport
    if (marker?.kind !== 'cylinder') throw new Error('Original driven pinion marker missing')
    close(marker.point[0], Math.cos(.5), 1e-5); close(marker.point[1], -Math.sin(.5), 1e-5)
    expect(preview.checks.every(check => check.satisfied && check.angleTolerance === 1e-8)).toBe(true)
  } finally { value.session.discard() }
}, 60_000)

it('measures eccentric pinion axis travel rather than introducing false component-origin motion', () => {
  const base = structuredClone(original), part = base.definitions.find(value => value.id === 'rack-pinion')!
  if (part.kind !== 'part') throw new Error('Original pinion part missing')
  for (const feature of part.document.features) if (feature.type === 'sketch' && feature.profile.kind === 'circle') feature.profile.center[0] += 3
  base.occurrences.find(value => value.id === 'pinion')!.pose.translation[0] = -3
  const value = captured('line', base)
  try {
    close(rack(value.document).neutralTravel, -10)
    const preview = ready(value.session.moveMotion(value.document, motion(value.document, 'pinion', Math.PI / 3, [-1.5, -1.5 * Math.sqrt(3), -8])))
    close(rack(preview.document).angle, -Math.PI / 3)
    close(preview.document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10 - 2 * Math.PI / 3, 1e-6)
    const center = cylinder(preview.scene, 'pinion', 2).worldSupport, marker = cylinder(preview.scene, 'pinion', .25).worldSupport
    if (center?.kind !== 'cylinder' || marker?.kind !== 'cylinder') throw new Error('Original eccentric native supports missing')
    close(center.point[0], 0, 1e-6); close(center.point[1], 0, 1e-6)
    close(marker.point[0], .5, 1e-6); close(marker.point[1], Math.sqrt(3) / 2, 1e-6); physical(preview.scene)
  } finally { value.session.discard() }
}, 60_000)

it('keeps a large irrelevant rack line parameter origin out of the travel conditioning', () => {
  const base = fixture(), request = intent(base), initial = prepareAssemblySolve(base)
  if (initial.status !== 'ready') throw new Error(initial.message)
  const query = CadEngine.prototype.inspectCurrentEdgeSupport
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentEdgeSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = query.apply(this, args); return { ...result, point: [result.point[0], result.point[1], 1e250] }
  })
  try { close(rack(captureAssemblyRackPinionPreview(initial, base, request)).neutralTravel, -10) }
  finally { spy.mockRestore(); discardAssemblySolvePreview(initial) }
}, 60_000)

it('detaches request and original Apply source before native edge queries', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), request = intent(base), initial = ready(session.prepare(base))
  const query = CadEngine.prototype.inspectCurrentEdgeSupport; let changed = false
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentEdgeSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = query.apply(this, args)
    if (!changed) { changed = true; base.name += ' changed live'; request.conversion.override = 100 }
    return result
  })
  try {
    const preview = ready(session.captureRackPinion(base, initial.token, request)); expect(rack(preview.document).conversion.override).toBeNull()
    expect(() => session.apply(base, preview.token)).toThrow('documento cambió')
  } finally { spy.mockRestore(); session.discard() }
}, 60_000)

it.each(['angle', 'neutral rotation', 'neutral travel', 'new relation', 'endpoint path'] as const)('rejects renderer-forged rack %s', field => {
  const value = captured(), proposal = structuredClone(value.document), previous = ready(value.session.prepare(value.document))
  if (field === 'angle') rack(proposal).angle += 2 * Math.PI
  else if (field === 'neutral rotation') rack(proposal).neutralRotation = [0, 0, 0, 1]
  else if (field === 'neutral travel') rack(proposal).neutralTravel += 1
  else if (field === 'new relation') proposal.mates.push({ ...structuredClone(rack(proposal)), id: 'renderer-rack' })
  else rack(proposal).second.component = component(proposal, 'guide')
  expect(() => value.session.prepare(value.document, proposal)).toThrow(/worker|captura nativa/)
  expect(() => value.session.apply(value.document, previous.token)).toThrow('disponible'); value.session.discard()
}, 60_000)

it.each(['edge', 'body', 'revision', 'same component', 'conversion', 'unknown zero'] as const)('rejects invalid native rack capture %s and revokes the prior capability', field => {
  const session = new AssemblyWorkerSession(), base = fixture(), request = intent(base), initial = ready(session.prepare(base))
  if (field === 'edge') (request.second as AssemblyEdgeReference).edge.key = 'invented-native-line'
  else if (field === 'body') request.second.body!.sourceFeatureId = 'invented-body-state'
  else if (field === 'revision') request.second.component.definition.revision = 'stale'
  else if (field === 'same component') request.second = structuredClone(request.first)
  else if (field === 'conversion') request.conversion.override = 0
  else Object.assign(request, { angle: 7 })
  expect(() => session.captureRackPinion(base, initial.token, request)).toThrow(/arista|referencia|cuerpo|revisión|ocurrencia|positive|field|campos|Repara/i)
  expect(() => session.apply(base, initial.token)).toThrow('disponible'); session.discard()
}, 60_000)

it('rejects stale and cloned rack capture authority without publishing a candidate', () => {
  const base = fixture(), initial = prepareAssemblySolve(base)
  if (initial.status !== 'ready') throw new Error(initial.message)
  try {
    expect(() => captureAssemblyRackPinionPreview(structuredClone(initial), base, intent(base))).toThrow('no fue verificada')
    const changed = structuredClone(base); changed.name += ' stale'
    expect(() => captureAssemblyRackPinionPreview(initial, changed, intent(base))).toThrow('documento cambió')
  } finally { discardAssemblySolvePreview(initial) }
}, 60_000)

it('tracks suppressed rack winding passively and reactivates with its authenticated neutral', () => {
  const value = captured(), proposal = structuredClone(value.document); rack(proposal).suppressed = true
  try {
    let document = value.session.apply(value.document, ready(value.session.prepare(value.document, proposal)).token).document
    document = value.session.apply(document, ready(value.session.moveMotion(document, motion(document, 'pinion', 2 * Math.PI))).token).document
    close(rack(document).angle, -2 * Math.PI); close(document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10)
    const active = structuredClone(document); rack(active).suppressed = false; active.occurrences.find(value => value.id === 'pinion')!.fixed = true
    const preview = ready(value.session.prepare(document, active)); close(rack(preview.document).angle, -2 * Math.PI)
    close(preview.document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10 - 4 * Math.PI, 1e-6)
  } finally { value.session.discard() }
}, 60_000)

it.each(['pose', 'source', 'reference'] as const)('freezes unavailable rack %s while preserving a stationary suppressed declaration', field => {
  const value = captured(), base = structuredClone(value.document); rack(base).suppressed = true; (rack(base).second as AssemblyEdgeReference).edge.key = 'missing-native-line'
  const stationary = ready(value.session.prepare(base)); expect(rack(stationary.document)).toEqual(rack(base)); value.session.discard()
  const proposal = structuredClone(base)
  if (field === 'pose') proposal.occurrences.find(value => value.id === 'rack')!.pose.translation[0] += 1
  else if (field === 'reference') rack(proposal).second = structuredClone(rack(value.document).second)
  else {
    const part = proposal.definitions.find(value => value.id === 'rack-slider')!
    if (part.kind !== 'part') throw new Error('Original rack source missing')
    part.document.name += ' changed'
  }
  expect(() => value.session.prepare(base, proposal)).toThrow('sin continuidad nativa'); value.session.discard()
}, 60_000)

it('freezes original chart coordinates when a proposal newly makes the rack unavailable', () => {
  const value = captured(), proposal = structuredClone(value.document); rack(proposal).suppressed = true
  proposal.occurrences.find(value => value.id === 'rack')!.suppressed = true; proposal.occurrences.find(value => value.id === 'rack')!.pose.translation[0] += 1
  expect(() => value.session.prepare(value.document, proposal)).toThrow('sin continuidad nativa'); value.session.discard()
}, 60_000)

it('permits unrelated motion outside unavailable rack endpoint chains', () => {
  const value = captured(), base = structuredClone(value.document); rack(base).suppressed = true; (rack(base).second as AssemblyEdgeReference).edge.key = 'missing-rack-line'
  base.occurrences.push({ ...structuredClone(base.occurrences.find(value => value.id === 'pinion')!), id: 'unrelated', pose: { ...identityRigidPose(), translation: [50, 0, -8] } })
  try {
    const preview = ready(value.session.moveMotion(base, motion(base, 'unrelated', 2 * Math.PI)))
    expect(rack(preview.document)).toEqual(rack(base)); close(preview.motion!.evaluatedAngle, 2 * Math.PI)
  } finally { value.session.discard() }
}, 60_000)

it('rejects a forged solver rack winding map against fresh native orientation', () => {
  const value = captured(), actual = solver.solveRigidMates
  const spy = vi.spyOn(solver, 'solveRigidMates').mockImplementation((problem, options) => {
    const result = actual(problem, options)
    if (result.poses) for (const [id, angle] of result.rackPinionAngles) result.rackPinionAngles.set(id, angle + .125)
    return result
  })
  try {
    const reply = value.session.moveMotion(value.document, motion(value.document, 'pinion', Math.PI / 3))
    expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
    if (reply.status === 'rejected') expect(reply.reason).toBe('verification')
    expect(rack(value.document).angle).toBe(0)
  } finally { spy.mockRestore(); value.session.discard() }
}, 60_000)

it('rejects loaded rack winding inconsistent with actual native quaternion', () => {
  const value = captured(), changed = structuredClone(value.document); rack(changed).angle = .125
  const reply = value.session.prepare(changed)
  expect(reply.status).toBe('rejected'); if (reply.status === 'rejected') expect(reply.message).toContain('ángulo guardado')
  value.session.discard()
}, 60_000)

it('retains edge declarations as repairable geometry rather than downgrading them to component references', () => {
  const value = captured(), source = component(value.document, 'rack').definition, definition = value.document.definitions.find(part => part.id === source.id)!
  if (definition.kind !== 'part') throw new Error('Original rack source missing')
  const part = structuredClone(definition.document); part.name += ' reviewed'
  try {
    const review = reviewAssemblyPartSourceUpdate(value.document, source, part, 'r2')
    const endpoint = review.endpoints.find(item => item.locator.mateId === rack(value.document).id)!
    expect(endpoint.status).toBe('needs-repair'); expect(endpoint.endpoint).toEqual(rack(value.document).second)
    let proposal = review.document
    for (const item of review.endpoints) {
      const reference = item.endpoint
      if (!('kind' in reference) || reference.kind !== 'edge' && reference.kind !== 'face') throw new Error('Original geometry reference missing')
      const replacement = structuredClone(reference); replacement.component.definition = { ...review.replacement }
      proposal = repairAssemblyEndpoint(proposal, item.locator, replacement)
    }
    const preview = ready(value.session.prepare(value.document, proposal)); expect(rack(preview.document).neutralRotation).toEqual(rack(value.document).neutralRotation)
    expect(rack(preview.document).neutralTravel).toBe(rack(value.document).neutralTravel)
    close(rack(preview.document).neutralTravel, -10, 1e-6); physical(preview.scene)
  } finally { value.session.discard() }
}, 60_000)

it('keeps fatal native edge cleanup distinct from unavailable passive geometry and invalidates witnesses', () => {
  const value = captured(), base = structuredClone(value.document); rack(base).suppressed = true
  const snapshot = new AssemblyGeometrySnapshot(base), witness = snapshot.resolveReference(base, rack(base).second), query = CadEngine.prototype.inspectCurrentEdgeSupport
  const failure = new NativeCleanupError(undefined, [new Error('Original LINE release fault')], 'Original LINE cleanup failed')
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentEdgeSupport').mockImplementation(function (this: CadEngine, ...args) { query.apply(this, args); throw failure })
  try {
    expect(() => snapshot.inspectRackPinionState(base, true)).toThrow(AggregateError)
    expect(() => snapshot.assertWitness(witness, base)).toThrow('ya no está vigente')
  } finally { spy.mockRestore(); snapshot.dispose(); value.session.discard() }
}, 60_000)

function changedPinion(document: AssemblyDocument, radius: number, offset = 0): AssemblyDocument {
  const source = component(document, 'pinion').definition, definition = document.definitions.find(value => value.id === source.id && value.revision === source.revision)!
  if (definition.kind !== 'part') throw new Error('Original pinion source missing')
  const part = structuredClone(definition.document)
  for (const feature of part.features) if (feature.type === 'sketch' && feature.profile.kind === 'circle') {
    if (feature.id === 'profile') feature.profile.radius = radius
    feature.profile.center[0] += offset
  }
  const review = reviewAssemblyPartSourceUpdate(document, source, part, 'r2'); let proposal = review.document
  for (const item of review.endpoints) {
    const replacement = item.locator.mateId === 'pinion-axial' ? assemblySceneFaceReference(cap(review.scene, 'pinion', 30))!
      : axis(cylinder(review.scene, 'pinion', radius))
    proposal = repairAssemblyEndpoint(proposal, item.locator, replacement)
  }
  return proposal
}

it.each([{ initial: null, clear: false, advance: -Math.PI }, { initial: 4, clear: false, advance: -2 * Math.PI / 3 },
  { initial: 6, clear: true, advance: -Math.PI }])('queries the current native radius after source repair and override intent %j', parameters => {
  const value = captured(), proposal = structuredClone(value.document); rack(proposal).conversion.override = parameters.initial
  try {
    let document = value.session.apply(value.document, ready(value.session.prepare(value.document, proposal)).token).document
    const replacement = changedPinion(document, 3)
    if (parameters.clear) rack(replacement).conversion.override = null
    document = value.session.apply(document, ready(value.session.prepare(document, replacement)).token).document
    expect(rack(document).neutralRotation).toEqual(rack(value.document).neutralRotation)
    expect(rack(document).neutralTravel).toBe(rack(value.document).neutralTravel); close(rack(document).neutralTravel, -10, 1e-6)
    const preview = ready(value.session.moveMotion(document, motion(document, 'pinion', Math.PI / 3)))
    close(rack(preview.document).angle, -Math.PI / 3)
    close(preview.document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10 + parameters.advance, 1e-6)
    const support = cylinder(preview.scene, 'pinion', 3).support
    expect(support?.kind === 'cylinder' && support.radius).toBe(3)
    close(preview.scene.volume, VOLUME + 150 * Math.PI, 1e-5); close(preview.scene.area, AREA + 70 * Math.PI, 1e-5)
  } finally { value.session.discard() }
}, 60_000)

it('requires recapture when a repaired pinion axis changes its local canonical center', () => {
  const value = captured()
  try { expect(() => value.session.prepare(value.document, changedPinion(value.document, 2, 1))).toThrow('centro del piñón') }
  finally { value.session.discard() }
}, 60_000)

it('checks rack coordinates independently in two rotated reused local assembly scopes', () => {
  const value = captured(), { version: _version, units: _units, definitions, ...sub } = value.document, root = createEmptyAssembly('Original reused rack')
  root.definitions = [...definitions, sub]
  root.occurrences = [
    { id: 'a', name: 'Z scope', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [50, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'b', name: 'X scope', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [-50, 0, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
  ]
  const request = motion(value.document, 'pinion', Math.PI / 3); request.component.occurrencePath = ['a', 'pinion']
  try {
    const preview = ready(value.session.moveMotion(root, request)), shared = preview.document.definitions.find(value => value.id === sub.id)!
    if (shared.kind !== 'assembly') throw new Error('Original shared rack scope missing')
    const mate = shared.mates.find(mate => mate.type === 'rack-pinion')!
    if (mate.type !== 'rack-pinion') throw new Error('Original shared rack missing')
    close(mate.angle, -Math.PI / 3); expect(preview.document.occurrences).toEqual(root.occurrences)
    expect(preview.checks.filter(check => JSON.parse(check.constraintId)[1] === mate.id)).toHaveLength(2)
    const secondRack = preview.scene.bodies.find(body => JSON.stringify(body.component.occurrencePath) === JSON.stringify(['b', 'rack']))!
    close(secondRack.worldPose.translation[0], -60 - 2 * Math.PI / 3, 1e-6)
    close(secondRack.worldPose.translation[1], -10, 1e-6); close(secondRack.worldPose.translation[2], 10, 1e-6); physical(preview.scene, 2)
  } finally { value.session.discard() }
}, 60_000)

it('continues native gear, screw and rack lifted state together through one +720-degree drive and fresh Apply', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), ground = base.occurrences.find(value => value.id === 'ground')!, pinion = base.occurrences.find(value => value.id === 'pinion')!
  const nut = screwOriginal.occurrences.find(value => value.id === 'nut')!, nutDefinition = screwOriginal.definitions.find(value => value.id === nut.definition.id)!
  base.definitions.push(structuredClone(nutDefinition))
  base.occurrences.push(structuredClone(nut),
    { ...structuredClone(ground), id: 'gear-ground', name: 'Original reused second bearing', pose: { ...identityRigidPose(), translation: [50, 0, 0] } },
    { ...structuredClone(pinion), id: 'gear-follower', name: 'Original reused geared follower', pose: { ...identityRigidPose(), translation: [50, 0, -8] } })
  const scene = buildAssemblyScene(base)
  base.mates.push(
    { id: 'follower-bearing', name: 'Original follower bearing', type: 'concentric', first: axis(cylinder(scene, 'gear-follower', 2)),
      second: axis(cylinder(scene, 'gear-ground', 3)), alignment: 'aligned', rotationLock: null, suppressed: false },
    { id: 'follower-axial', name: 'Original follower datum', type: 'distance', first: { ...assemblySceneFaceReference(cap(scene, 'gear-follower', 30))!, support: 'plane' },
      second: { ...assemblySceneFaceReference(cap(scene, 'gear-ground', 4))!, support: 'plane' }, alignment: 'aligned', distance: 18, suppressed: false },
    { id: 'nut-guide', name: 'Original nonrotating nut', type: 'concentric', first: axis(cylinder(scene, 'nut', 2.5)),
      second: axis(cylinder(scene, 'ground', 3)), alignment: 'aligned', rotationLock: [0, 0, 0, 1], suppressed: false },
  )
  const before = serializeAssemblyDocument(base)
  const gear = (document: AssemblyDocument) => {
    const mate = document.mates.find(mate => mate.type === 'gear')
    if (!mate || mate.type !== 'gear') throw new Error('Original mixed gear missing')
    return mate
  }
  const screw = (document: AssemblyDocument) => {
    const mate = document.mates.find(mate => mate.type === 'screw')
    if (!mate || mate.type !== 'screw') throw new Error('Original mixed screw missing')
    return mate
  }
  const retained = (document: AssemblyDocument) => ({ definitions: document.definitions,
    occurrences: document.occurrences.map(({ id, definition, suppressed, visible, fixed }) => ({ id, definition, suppressed, visible, fixed })),
    mates: document.mates.map(mate => mate.type === 'rack-pinion' || mate.type === 'screw' ? { ...mate, angle: 0 }
      : mate.type === 'gear' ? { ...mate, angles: { first: 0, second: 0 } } : mate) })
  const verifiedGeometry = (value: AssemblyScene) => {
    expect(value.solidCount).toBe(7); expect(value.prototypeCount).toBe(5)
    close(value.volume, 16200 + 287 * Math.PI / 4, 1e-5); close(value.area, 8960 + 3723 * Math.PI / 4, 1e-5)
    const marker = cylinder(value, 'gear-follower', .25).worldSupport
    if (marker?.kind !== 'cylinder') throw new Error('Original mixed follower marker missing')
    close(marker.point[0], 51, 1e-6); close(marker.point[1], 0, 1e-6)
  }
  try {
    const initial = ready(session.prepare(base)); expect(initial.scopes.at(-1)!.result.localDOF).toBe(4)
    const screwPreview = ready(session.captureScrew(base, initial.token, { first: axis(cylinder(initial.scene, 'pinion', 2)), second: axis(cylinder(initial.scene, 'nut', 2.5)),
      lead: 2, reverse: false, alignment: 'aligned', name: 'Original mixed screw' }))
    expect(screwPreview.scopes.at(-1)!.result.localDOF).toBe(3)
    let document = session.apply(base, screwPreview.token).document, fresh = ready(session.prepare(document))
    const gearPreview = ready(session.captureGear(document, fresh.token, { first: axis(cylinder(fresh.scene, 'pinion', 2)), second: axis(cylinder(fresh.scene, 'gear-follower', 2)),
      carrier: component(document, 'ground'), ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', name: 'Original mixed gear' }))
    expect(gearPreview.scopes.at(-1)!.result.localDOF).toBe(2)
    document = session.apply(document, gearPreview.token).document; fresh = ready(session.prepare(document))
    const rackPreview = ready(session.captureRackPinion(document, fresh.token, intent(document)))
    expect(rackPreview.scopes.at(-1)!.result.localDOF).toBe(1)
    document = session.apply(document, rackPreview.token).document
    const saved = serializeAssemblyDocument(document), state = structuredClone(retained(document))
    const preview = ready(session.moveMotion(document, motion(document, 'pinion', 4 * Math.PI)))
    expect(preview.scopes.at(-1)!.result.localDOF).toBe(0)
    expect(preview.motion).toMatchObject({ requestedAngle: 4 * Math.PI, stationCount: 12, verifiedStations: 12, windingTolerance: 1e-8 })
    close(preview.motion!.evaluatedAngle, 4 * Math.PI); close(rack(preview.document).angle, -4 * Math.PI)
    close(screw(preview.document).angle, -4 * Math.PI); close(gear(preview.document).angles.first, -4 * Math.PI); close(gear(preview.document).angles.second, 8 * Math.PI)
    close(preview.document.occurrences.find(value => value.id === 'nut')!.pose.translation[2], 14, 1e-6)
    close(preview.document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10 - 8 * Math.PI, 1e-6)
    expect(preview.checks).toHaveLength(9); expect(preview.checks.every(check => check.satisfied)).toBe(true)
    expect(retained(preview.document)).toEqual(state); expect(serializeAssemblyDocument(document)).toBe(saved)
    verifiedGeometry(preview.scene)
    const applied = session.apply(document, preview.token).document, reopened = parseAssemblyDocument(serializeAssemblyDocument(applied))
    const solved = ready(session.prepare(reopened)); expect(solved.scopes.at(-1)!.result.localDOF).toBe(1)
    close(rack(solved.document).angle, -4 * Math.PI); close(screw(solved.document).angle, -4 * Math.PI)
    close(gear(solved.document).angles.first, -4 * Math.PI); close(gear(solved.document).angles.second, 8 * Math.PI)
    expect(solved.checks.every(check => check.satisfied)).toBe(true); expect(retained(solved.document)).toEqual(state)
    verifiedGeometry(session.apply(reopened, solved.token).scene); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { session.discard() }
}, 60_000)
