import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, type AssemblyAxisReference, type AssemblyDocument, type AssemblyMate } from '../model/assemblyDocument'
import { createEmptyAssembly } from '../examples/assembly'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { assemblySceneFaceReference, type AssemblyPreviewReply, type AssemblyScene, type AssemblySceneFace, type AssemblyScrewCaptureRequest } from './kernel.assembly-types'
import { buildAssemblyScene } from './kernel.assembly-scene'
import * as scenes from './kernel.assembly-scene'
import * as solver from '../model/assemblySolver'
import { captureAssemblyScrewPreview, discardAssemblySolvePreview, prepareAssemblySolve } from './kernel.assembly-solve'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { NativeCleanupError } from './kernel.native-ownership'
import { CadEngine } from './kernel.engine'

// Original public ground/shaft/nut fixture; formulas and generator are tracked
// with assembly-screw-original.json. No thread/contact geometry is supplied.
let original: AssemblyDocument
beforeAll(async () => {
  const [oc, text] = await Promise.all([initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }),
    readFile(new URL('./fixtures/assembly-screw-original.json', import.meta.url), 'utf8')])
  setOC(oc); original = parseAssemblyDocument(text)
}, 60_000)
const VOLUME = 5400 + 357 * Math.PI / 8, AREA = 3400 + 1331 * Math.PI / 8

it('authors a new root revision without replacing the native captured screw or concentric rotation lock',()=>{
  const {session,document}=captured(),before=serializeAssemblyDocument(document),declaration=structuredClone(screw(document))
  try {
    const p=ready(session.previewRootRevision(document,'original-screw-source-r2'))
    expect(p.document.revision).toBe('original-screw-source-r2');expect(p.document.mates).toEqual(document.mates)
    expect(p.checks.every(c=>c.satisfied)).toBe(true);physical(p.scene)
    screw(p.document).lead=999
    const applied=session.apply(document,p.token)
    expect(screw(applied.document)).toEqual(declaration);expect(applied.document.revision).toBe('original-screw-source-r2');physical(applied.scene)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally {session.discard()}
},60_000)
function close(actual: number, expected: number, tolerance = 1e-8) { expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance) }
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function screw(document: AssemblyDocument): Extract<AssemblyMate, { type: 'screw' }> {
  const result = document.mates.find(mate => mate.type === 'screw')
  if (!result || result.type !== 'screw') throw new Error('Original captured screw missing')
  return result
}
function component(document: AssemblyDocument, id: string) {
  return { occurrencePath: [id], definition: { ...document.occurrences.find(value => value.id === id)!.definition } }
}
function faces(scene: AssemblyScene, id: string) { return scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces }
function cylinder(scene: AssemblyScene, id: string, radius: number): AssemblySceneFace {
  const result = faces(scene, id).filter(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - radius) < 1e-9)
  expect(result).toHaveLength(1); return result[0]
}
function cap(scene: AssemblyScene, id: string, height: number): AssemblySceneFace {
  const result = faces(scene, id).find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - height) < 1e-9)
  if (!result) throw new Error('Original axial cap missing')
  return result
}
function axis(face: AssemblySceneFace): AssemblyAxisReference {
  const reference = assemblySceneFaceReference(face)
  if (!reference || reference.support !== 'axis') throw new Error('Original cylindrical selection missing')
  return reference as AssemblyAxisReference
}
function fixture(): AssemblyDocument {
  const document = structuredClone(original), scene = buildAssemblyScene(document)
  for (const [id, radius] of [['shaft', 2], ['nut', 2.5], ['ground', 3]] as const) {
    const support = cylinder(scene, id, radius).support
    if (support?.kind !== 'cylinder') throw new Error('Original native cylinder missing')
    close(support.axis[0], 0, 1e-12); close(support.axis[1], 0, 1e-12); close(support.axis[2], -1, 1e-12)
  }
  document.mates = [
    { id: 'shaft-bearing', name: 'Original shaft bearing', type: 'concentric', first: axis(cylinder(scene, 'shaft', 2)),
      second: axis(cylinder(scene, 'ground', 3)), alignment: 'aligned', rotationLock: null, suppressed: false },
    { id: 'shaft-axial', name: 'Original shaft axial datum', type: 'distance', first: { ...assemblySceneFaceReference(cap(scene, 'shaft', 30))!, support: 'plane' },
      second: { ...assemblySceneFaceReference(cap(scene, 'ground', 4))!, support: 'plane' }, alignment: 'aligned', distance: 18, suppressed: false },
    { id: 'nut-guide', name: 'Original nonrotating nut guide', type: 'concentric', first: axis(cylinder(scene, 'nut', 2.5)),
      second: axis(cylinder(scene, 'ground', 3)), alignment: 'aligned', rotationLock: [0, 0, 0, 1], suppressed: false },
  ]
  return document
}
function intent(document: AssemblyDocument, reverse = false): AssemblyScrewCaptureRequest {
  const shaft = document.mates.find(mate => mate.id === 'shaft-bearing'), nut = document.mates.find(mate => mate.id === 'nut-guide')
  if (shaft?.type !== 'concentric' || nut?.type !== 'concentric') throw new Error('Original native guides missing')
  return { first: structuredClone(shaft.first) as AssemblyAxisReference, second: structuredClone(nut.first) as AssemblyAxisReference,
    lead: 2, reverse, alignment: 'aligned', name: 'Original captured screw' }
}
function captured(reverse = false) {
  const session = new AssemblyWorkerSession(), base = fixture(), initial = ready(session.prepare(base))
  const preview = ready(session.captureScrew(base, initial.token, intent(base, reverse)))
  return { session, base, initial, preview, document: session.apply(base, preview.token).document }
}
function motion(document: AssemblyDocument, id: string, angle: number, z?: number) {
  const occurrence = document.occurrences.find(value => value.id === id)!
  return { component: component(document, id), translation: [occurrence.pose.translation[0], occurrence.pose.translation[1], z ?? occurrence.pose.translation[2]] as [number, number, number],
    rotation: { axis: 2 as const, angle } }
}
function physical(scene: AssemblyScene, multiplier = 1) {
  expect(scene.solidCount).toBe(3 * multiplier); close(scene.volume, VOLUME * multiplier, 1e-5); close(scene.area, AREA * multiplier, 1e-5)
}

it('captures the native screw from current coaxial supports and publishes one final preview with one remaining mobility', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), initial = ready(session.prepare(base)), before = serializeAssemblyDocument(base)
  expect(initial.scopes.at(-1)!.result.localDOF).toBe(2)
  const originalBuild = scenes.buildAssemblyScene; let publications = 0
  const spy = vi.spyOn(scenes, 'buildAssemblyScene').mockImplementation(document => { publications++; return originalBuild(document) })
  try {
    const preview = ready(session.captureScrew(base, initial.token, intent(base)))
    expect(publications).toBe(1); expect(preview.document.mates).toHaveLength(4); expect(preview.scopes.at(-1)!.result.localDOF).toBe(1)
    expect(screw(preview.document)).toMatchObject({ lead: 2, reverse: false, alignment: 'aligned', angle: 0, neutralTravel: -18, neutralRotation: [0, 0, 0, 1] })
    physical(preview.scene); expect(serializeAssemblyDocument(base)).toBe(before)
    expect(() => session.apply(base, initial.token)).toThrow('disponible')
    const applied = session.apply(base, preview.token); expect(publications).toBe(2); physical(applied.scene)
    expect(() => session.apply(base, preview.token)).toThrow('disponible')
  } finally { spy.mockRestore(); session.discard() }
}, 60_000)

it.each([false, true])('converts actual shaft +720 degrees into signed nut travel with reverse=%s', reverse => {
  const value = captured(reverse), before = serializeAssemblyDocument(value.document)
  try {
    const preview = ready(value.session.moveMotion(value.document, motion(value.document, 'shaft', 4 * Math.PI)))
    close(screw(preview.document).angle, -4 * Math.PI); close(preview.document.occurrences.find(value => value.id === 'nut')!.pose.translation[2], reverse ? 6 : 14, 1e-6)
    expect(preview.motion).toMatchObject({ requestedAngle: 4 * Math.PI, stationCount: 12, verifiedStations: 12, windingTolerance: 1e-8 })
    const marker = cylinder(preview.scene, 'shaft', .25).worldSupport
    if (marker?.kind !== 'cylinder') throw new Error('Original shaft marker missing')
    close(marker.point[0], 1, 1e-6); close(marker.point[1], 0, 1e-6)
    physical(preview.scene); expect(serializeAssemblyDocument(value.document)).toBe(before)
    const committed = value.session.apply(value.document, preview.token).document, reopened = parseAssemblyDocument(serializeAssemblyDocument(committed))
    const fresh = ready(value.session.prepare(reopened)); close(screw(fresh.document).angle, -4 * Math.PI); expect(fresh.scopes.at(-1)!.result.localDOF).toBe(1)
  } finally { value.session.discard() }
}, 60_000)

it('converts a driven full-pose nut advance into shaft rotation on the saved multi-turn branch', () => {
  const value = captured()
  try {
    let document = value.session.apply(value.document, ready(value.session.moveMotion(value.document, motion(value.document, 'shaft', 4 * Math.PI))).token).document
    const preview = ready(value.session.moveMotion(document, motion(document, 'nut', 0, 15)))
    close(screw(preview.document).angle, -5 * Math.PI, 1e-5)
    expect(preview.document.occurrences.find(value => value.id === 'nut')!.pose.translation[2]).toBe(15)
    const marker = cylinder(preview.scene, 'shaft', .25).worldSupport
    if (marker?.kind !== 'cylinder') throw new Error('Original shaft marker missing')
    close(marker.point[0], -1, 1e-5); close(marker.point[1], 0, 1e-5)
    expect(preview.checks.every(check => check.satisfied && check.angleTolerance === 1e-8)).toBe(true)
    document = value.session.apply(document, preview.token).document; close(screw(document).angle, -5 * Math.PI, 1e-5)
  } finally { value.session.discard() }
}, 60_000)

it('aligns initially separated and tilted native axes before capturing the actual zero', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), request = intent(base)
  base.mates = []; base.occurrences.find(value => value.id === 'shaft')!.fixed = true
  base.occurrences.find(value => value.id === 'nut')!.pose = { translation: [5, 4, 10], rotation: [Math.sin(.15), 0, 0, Math.cos(.15)] }
  const before = serializeAssemblyDocument(base), initial = ready(session.prepare(base)), preview = ready(session.captureScrew(base, initial.token, request))
  try {
    const nut = preview.document.occurrences.find(value => value.id === 'nut')!
    close(nut.pose.translation[0], 0, 1e-6); close(nut.pose.translation[1], 0, 1e-6)
    const first = cylinder(preview.scene, 'shaft', 2).worldSupport, second = cylinder(preview.scene, 'nut', 2.5).worldSupport
    if (first?.kind !== 'cylinder' || second?.kind !== 'cylinder') throw new Error('Original aligned native axes missing')
    for (let i = 0; i < 3; i++) close(first.axis[i], second.axis[i])
    close(screw(preview.document).angle, 0); close(screw(preview.document).neutralTravel, -(nut.pose.translation[2] + 8), 1e-6)
    expect(preview.document.mates).toHaveLength(1); expect(serializeAssemblyDocument(base)).toBe(before); physical(preview.scene)
  } finally { session.discard() }
}, 60_000)

it('rejects a coaxial alignment that would move two fixed native endpoints', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), request = intent(base)
  base.mates = []; base.occurrences.find(value => value.id === 'shaft')!.fixed = true
  const nut = base.occurrences.find(value => value.id === 'nut')!; nut.fixed = true; nut.pose.translation[0] = 5
  const initial = ready(session.prepare(base)), before = serializeAssemblyDocument(base)
  expect(() => session.captureScrew(base, initial.token, request)).toThrow('No se pudieron alinear')
  expect(serializeAssemblyDocument(base)).toBe(before); expect(() => session.apply(base, initial.token)).toThrow('disponible'); session.discard()
}, 60_000)

it('captures a fresh opposed native alignment after the private concentric solve', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), request = intent(base); request.alignment = 'opposed'
  base.mates = []; base.occurrences.find(value => value.id === 'shaft')!.fixed = true
  const initial = ready(session.prepare(base)), preview = ready(session.captureScrew(base, initial.token, request))
  try {
    const first = cylinder(preview.scene, 'shaft', 2).worldSupport, second = cylinder(preview.scene, 'nut', 2.5).worldSupport
    if (first?.kind !== 'cylinder' || second?.kind !== 'cylinder') throw new Error('Original opposed native cylinders missing')
    for (let i = 0; i < 3; i++) close(first.axis[i], -second.axis[i])
    expect(screw(preview.document).alignment).toBe('opposed'); close(screw(preview.document).angle, 0)
  } finally { session.discard() }
}, 60_000)

it('captures component-origin travel under a common million-millimeter translation', () => {
  const base = fixture(), request = intent(base)
  for (const occurrence of base.occurrences) occurrence.pose.translation = occurrence.pose.translation.map((value, i) => value + [1e6, -2e6, 3e6][i]) as [number, number, number]
  const initial = prepareAssemblySolve(base)
  if (initial.status !== 'ready') throw new Error(initial.message)
  try {
    const candidate = captureAssemblyScrewPreview(initial, base, request)
    close(screw(candidate).neutralTravel, -18); close(screw(candidate).angle, 0)
    const verified = prepareAssemblySolve(candidate)
    if (verified.status !== 'ready') throw new Error(verified.message)
    try { expect(verified.checks.every(check => check.satisfied)).toBe(true) } finally { discardAssemblySolvePreview(verified) }
  } finally { discardAssemblySolvePreview(initial) }
}, 60_000)

it('detaches screw capture intent and preserves the original Apply source during native queries', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), initial = ready(session.prepare(base)), request = intent(base)
  const query = CadEngine.prototype.inspectCurrentFaceSupport; let changed = false
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = query.apply(this, args)
    if (!changed) { changed = true; base.name += ' changed live source'; request.lead = 100 }
    return result
  })
  try {
    const preview = ready(session.captureScrew(base, initial.token, request))
    expect(screw(preview.document).lead).toBe(2); expect(preview.document.name).not.toBe(base.name)
    expect(() => session.apply(base, preview.token)).toThrow('documento cambió')
  } finally { spy.mockRestore(); session.discard() }
}, 60_000)

it('permits lead, handedness, name and suppression intent without replacing captured coordinates', () => {
  const value = captured(), proposal = structuredClone(value.document)
  Object.assign(screw(proposal), { lead: 4, reverse: true, name: 'Edited original screw', suppressed: true })
  const preview = ready(value.session.prepare(value.document, proposal))
  expect(screw(preview.document)).toMatchObject({ lead: 4, reverse: true, name: 'Edited original screw', suppressed: true })
  expect(screw(preview.document).neutralRotation).toEqual(screw(value.document).neutralRotation)
  expect(screw(preview.document).neutralTravel).toBe(-18); expect(screw(preview.document).angle).toBe(0); value.session.discard()
}, 60_000)

it.each(['angle', 'neutral rotation', 'neutral travel', 'new relation', 'endpoint path', 'alignment'] as const)('rejects renderer-forged screw %s before native Apply', field => {
  const value = captured(), proposal = structuredClone(value.document), older = ready(value.session.prepare(value.document))
  if (field === 'angle') screw(proposal).angle += 2 * Math.PI
  else if (field === 'neutral rotation') screw(proposal).neutralRotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  else if (field === 'neutral travel') screw(proposal).neutralTravel += 1
  else if (field === 'new relation') proposal.mates.push({ ...structuredClone(screw(proposal)), id: 'renderer-screw' })
  else if (field === 'alignment') screw(proposal).alignment = 'opposed'
  else screw(proposal).first.component = component(proposal, 'nut')
  expect(() => value.session.prepare(value.document, proposal)).toThrow(/worker|captura nativa/)
  expect(() => value.session.apply(value.document, older.token)).toThrow('disponible'); value.session.discard()
}, 60_000)

it.each(['face', 'body', 'revision', 'same component', 'lead', 'unknown zero'] as const)('rejects invalid native screw capture %s without retaining its prior token', field => {
  const session = new AssemblyWorkerSession(), base = fixture(), initial = ready(session.prepare(base)), request = intent(base)
  if (field === 'face') request.first.face.key = 'invented-screw-axis'
  else if (field === 'body') request.first.body!.sourceFeatureId = 'invented-body-state'
  else if (field === 'revision') request.first.component.definition.revision = 'stale'
  else if (field === 'same component') request.second = structuredClone(request.first)
  else if (field === 'lead') request.lead = 0
  else Object.assign(request, { angle: 7 })
  expect(() => session.captureScrew(base, initial.token, request)).toThrow(/cara|referencia|cuerpo|revisión|ocurrencia|lead|positive|campos|Repara/i)
  expect(() => session.apply(base, initial.token)).toThrow('disponible'); session.discard()
}, 60_000)

it('rejects stale and cloned capture authority and retains exactly one history transaction', () => {
  const base = fixture(), history = new AssemblyDocumentHistory(base), initial = prepareAssemblySolve(base)
  if (initial.status !== 'ready') throw new Error(initial.message)
  try {
    expect(() => captureAssemblyScrewPreview(structuredClone(initial), base, intent(base))).toThrow('no fue verificada')
    const changed = structuredClone(base); changed.name += ' stale'
    expect(() => captureAssemblyScrewPreview(initial, changed, intent(base))).toThrow('documento cambió')
    const candidate = captureAssemblyScrewPreview(initial, base, intent(base)), solved = prepareAssemblySolve(candidate)
    if (solved.status !== 'ready') throw new Error(solved.message)
    discardAssemblySolvePreview(solved)
    expect(history.canUndo).toBe(false)
    // Worker Apply authenticates the original base while its private history consumes the captured proposal.
    const session = new AssemblyWorkerSession(), pending = ready(session.prepare(base)), preview = ready(session.captureScrew(base, pending.token, intent(base)))
    const applied = session.apply(base, preview.token).document; history.commitDocument(applied)
    expect(serializeAssemblyDocument(history.undo())).toBe(serializeAssemblyDocument(base)); expect(history.canUndo).toBe(false)
    expect(screw(history.redo()).angle).toBe(0); session.discard()
  } finally { discardAssemblySolvePreview(initial) }
}, 60_000)

it('tracks suppressed screw winding passively and reactivates from the verified branch', () => {
  const value = captured(), proposal = structuredClone(value.document); screw(proposal).suppressed = true
  try {
    let document = value.session.apply(value.document, ready(value.session.prepare(value.document, proposal)).token).document
    document = value.session.apply(document, ready(value.session.moveMotion(document, motion(document, 'shaft', 4 * Math.PI))).token).document
    close(screw(document).angle, -4 * Math.PI); close(document.occurrences.find(value => value.id === 'nut')!.pose.translation[2], 10)
    const active = structuredClone(document); screw(active).suppressed = false; active.occurrences.find(value => value.id === 'shaft')!.fixed = true
    const preview = ready(value.session.prepare(document, active)); close(screw(preview.document).angle, -4 * Math.PI)
    close(preview.document.occurrences.find(value => value.id === 'nut')!.pose.translation[2], 14, 1e-6)
  } finally { value.session.discard() }
}, 60_000)

it.each(['pose', 'source', 'reference'] as const)('freezes unavailable screw %s while allowing a stationary suppressed declaration', field => {
  const value = captured(), base = structuredClone(value.document); screw(base).suppressed = true; screw(base).first.face.key = 'missing-native-screw-axis'
  const stationary = ready(value.session.prepare(base)); expect(screw(stationary.document)).toEqual(screw(base)); value.session.discard()
  const proposal = structuredClone(base)
  if (field === 'pose') proposal.occurrences.find(value => value.id === 'shaft')!.pose.translation[2] += 1
  else if (field === 'reference') screw(proposal).first.face.key = screw(value.document).first.face.key
  else {
    const part = proposal.definitions.find(value => value.id === component(proposal, 'shaft').definition.id)!
    if (part.kind !== 'part') throw new Error('Original shaft source missing')
    part.document.name += ' changed'
  }
  expect(() => value.session.prepare(base, proposal)).toThrow('sin continuidad nativa'); value.session.discard()
}, 60_000)

it('freezes the original chart when a proposal newly makes the screw unavailable', () => {
  const value = captured(), proposal = structuredClone(value.document)
  screw(proposal).suppressed = true; proposal.occurrences.find(value => value.id === 'shaft')!.suppressed = true
  proposal.occurrences.find(value => value.id === 'shaft')!.pose.translation[2] += 1
  expect(() => value.session.prepare(value.document, proposal)).toThrow('sin continuidad nativa'); value.session.discard()
}, 60_000)

it('allows unrelated movement outside unavailable screw endpoint chains', () => {
  const value = captured(), base = structuredClone(value.document); screw(base).suppressed = true; screw(base).first.face.key = 'missing-screw-axis'
  const shaft = base.occurrences.find(value => value.id === 'shaft')!
  base.occurrences.push({ ...structuredClone(shaft), id: 'unrelated', pose: { ...identityRigidPose(), translation: [50, 0, -8] } })
  const preview = ready(value.session.moveMotion(base, motion(base, 'unrelated', 2 * Math.PI)))
  expect(screw(preview.document)).toEqual(screw(base)); close(preview.motion!.evaluatedAngle, 2 * Math.PI); value.session.discard()
}, 60_000)

it('rejects a corrupt solver winding map against fresh native orientations', () => {
  const value = captured(), originalSolve = solver.solveRigidMates
  const spy = vi.spyOn(solver, 'solveRigidMates').mockImplementation((problem, options) => {
    const result = originalSolve(problem, options)
    if (result.poses) for (const [id, angle] of result.screwAngles) result.screwAngles.set(id, angle + .125)
    return result
  })
  try {
    const reply = value.session.moveMotion(value.document, motion(value.document, 'shaft', Math.PI / 3))
    expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
    if (reply.status === 'rejected') expect(reply.reason).toBe('verification')
    expect(screw(value.document).angle).toBe(0)
  } finally { spy.mockRestore(); value.session.discard() }
}, 60_000)

it('rejects loaded winding inconsistent with its actual native quaternion', () => {
  const value = captured(), changed = structuredClone(value.document); screw(changed).angle = .125
  const reply = value.session.prepare(changed)
  expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
  if (reply.status === 'rejected') expect(reply.message).toContain('ángulo guardado'); value.session.discard()
}, 60_000)

it('preserves source repair only after a fresh native directed-axis continuity check', () => {
  const value = captured(), source = component(value.document, 'shaft').definition, definition = value.document.definitions.find(part => part.id === source.id)!
  if (definition.kind !== 'part') throw new Error('Original shaft source missing')
  const part = structuredClone(definition.document); part.name += ' reviewed'
  const review = reviewAssemblyPartSourceUpdate(value.document, source, part, 'r2'); let proposal = review.document
  for (const item of review.endpoints) {
    if (!('kind' in item.endpoint) || item.endpoint.kind !== 'face') throw new Error('Original exact face endpoint missing')
    const endpoint = structuredClone(item.endpoint); endpoint.component.definition = { ...review.replacement }
    proposal = repairAssemblyEndpoint(proposal, item.locator, endpoint)
  }
  const preview = ready(value.session.prepare(value.document, proposal)); expect(screw(preview.document).neutralRotation).toEqual(screw(value.document).neutralRotation)
  expect(screw(preview.document).neutralTravel).toBe(screw(value.document).neutralTravel); expect(screw(preview.document).angle).toBe(0)
  physical(preview.scene); value.session.discard()
}, 60_000)

it('keeps fatal native cleanup distinct from a missing passive screw and invalidates its witnesses', () => {
  const value = captured(), base = structuredClone(value.document); screw(base).suppressed = true
  const snapshot = new AssemblyGeometrySnapshot(base), witness = snapshot.resolveReference(base, screw(base).first)
  const query = CadEngine.prototype.inspectCurrentFaceSupport, failure = new NativeCleanupError(undefined, [new Error('Original screw release fault')], 'Original screw cleanup failed')
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) { query.apply(this, args); throw failure })
  try {
    expect(() => snapshot.inspectScrewState(base, true)).toThrow(AggregateError)
    expect(() => snapshot.assertWitness(witness, base)).toThrow('ya no está vigente')
  } finally { spy.mockRestore(); snapshot.dispose(); value.session.discard() }
}, 60_000)

it('verifies a shared screw declaration inside both rotated reused local scopes', () => {
  const value = captured(), { version: _version, units: _units, definitions, ...sub } = value.document, root = createEmptyAssembly('Original reused screw drive')
  root.definitions = [...definitions, sub]
  root.occurrences = [
    { id: 'a', name: 'Original Z scope', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [50, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'b', name: 'Original X scope', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [-50, 0, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
  ]
  const request = motion(value.document, 'shaft', 2 * Math.PI); request.component.occurrencePath = ['a', 'shaft']
  try {
    const preview = ready(value.session.moveMotion(root, request)), shared = preview.document.definitions.find(value => value.id === sub.id)!
    if (shared.kind !== 'assembly') throw new Error('Original shared screw scope missing')
    const mate = shared.mates.find(mate => mate.type === 'screw')!
    if (mate.type !== 'screw') throw new Error('Original shared screw missing')
    close(mate.angle, -2 * Math.PI); expect(preview.document.occurrences).toEqual(root.occurrences)
    expect(preview.motion!.affectedPaths).toEqual([['a', 'shaft'], ['b', 'shaft']])
    expect(preview.checks.filter(check => JSON.parse(check.constraintId)[1] === mate.id)).toHaveLength(2)
    const nut = preview.scene.bodies.find(body => JSON.stringify(body.component.occurrencePath) === JSON.stringify(['b', 'nut']))!
    close(nut.worldPose.translation[0], -50, 1e-6); close(nut.worldPose.translation[1], -12, 1e-6); close(nut.worldPose.translation[2], 0, 1e-6)
    physical(preview.scene, 2)
  } finally { value.session.discard() }
}, 60_000)

it('continues and applies native gear and screw winding together in one original reused mechanism', () => {
  const session = new AssemblyWorkerSession(), base = fixture()
  const ground = base.occurrences.find(value => value.id === 'ground')!, shaft = base.occurrences.find(value => value.id === 'shaft')!
  base.occurrences.push(
    { ...structuredClone(ground), id: 'gear-ground', name: 'Original second fixed bearing', pose: { ...identityRigidPose(), translation: [50, 0, 0] } },
    { ...structuredClone(shaft), id: 'gear-follower', name: 'Original geared follower', pose: { ...identityRigidPose(), translation: [50, 0, -8] } },
  )
  const scene = buildAssemblyScene(base)
  base.mates.push(
    { id: 'follower-bearing', name: 'Original follower bearing', type: 'concentric', first: axis(cylinder(scene, 'gear-follower', 2)),
      second: axis(cylinder(scene, 'gear-ground', 3)), alignment: 'aligned', rotationLock: null, suppressed: false },
    { id: 'follower-axial', name: 'Original follower axial datum', type: 'distance', first: { ...assemblySceneFaceReference(cap(scene, 'gear-follower', 30))!, support: 'plane' },
      second: { ...assemblySceneFaceReference(cap(scene, 'gear-ground', 4))!, support: 'plane' }, alignment: 'aligned', distance: 18, suppressed: false },
  )
  const originalBase = serializeAssemblyDocument(base)
  const gear = (document: AssemblyDocument): Extract<AssemblyMate, { type: 'gear' }> => {
    const found = document.mates.find(mate => mate.type === 'gear')
    if (!found || found.type !== 'gear') throw new Error('Original mixed native gear missing')
    return found
  }
  const state = (document: AssemblyDocument) => ({
    definitions: document.definitions,
    occurrences: document.occurrences.map(({ id, definition, fixed, suppressed, visible }) => ({ id, definition, fixed, suppressed, visible })),
    bearings: document.mates.filter(mate => mate.type !== 'gear' && mate.type !== 'screw'),
    screw: { first: screw(document).first, second: screw(document).second, lead: screw(document).lead, reverse: screw(document).reverse,
      alignment: screw(document).alignment, neutralRotation: screw(document).neutralRotation, neutralTravel: screw(document).neutralTravel, suppressed: screw(document).suppressed },
    gear: { first: gear(document).first, second: gear(document).second, carrier: gear(document).carrier, ratio: gear(document).ratio,
      direction: gear(document).direction, neutralRotations: gear(document).neutralRotations, phase: gear(document).phase, suppressed: gear(document).suppressed },
  })
  const nativeGeometry = (value: AssemblyScene) => {
    expect(value.solidCount).toBe(5); expect(value.prototypeCount).toBe(3)
    close(value.volume, 10200 + 507 * Math.PI / 4, 1e-5); close(value.area, 6360 + 1261 * Math.PI / 4, 1e-5)
    const follower = cylinder(value, 'gear-follower', .25).worldSupport
    if (follower?.kind !== 'cylinder') throw new Error('Original mixed native follower marker missing')
    close(follower.point[0], 51, 1e-6); close(follower.point[1], 0, 1e-6)
  }
  try {
    const initial = ready(session.prepare(base))
    expect(initial.scopes.at(-1)!.result.localDOF).toBe(3)
    const screwPreview = ready(session.captureScrew(base, initial.token, intent(base)))
    expect(screwPreview.scopes.at(-1)!.result.localDOF).toBe(2)
    const withScrew = session.apply(base, screwPreview.token).document, fresh = ready(session.prepare(withScrew))
    const gearPreview = ready(session.captureGear(withScrew, fresh.token, {
      first: axis(cylinder(fresh.scene, 'shaft', 2)), second: axis(cylinder(fresh.scene, 'gear-follower', 2)),
      carrier: component(withScrew, 'ground'), ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', name: 'Original mixed two-to-one gear',
    }))
    expect(gearPreview.scopes.at(-1)!.result.localDOF).toBe(1)
    const coupled = session.apply(withScrew, gearPreview.token).document, originalCoupled = serializeAssemblyDocument(coupled), retained = structuredClone(state(coupled))
    const preview = ready(session.moveMotion(coupled, motion(coupled, 'shaft', 4 * Math.PI)))
    expect(preview.scopes.at(-1)!.result.localDOF).toBe(0)
    expect(preview.motion).toMatchObject({ requestedAngle: 4 * Math.PI, stationCount: 12, verifiedStations: 12, windingTolerance: 1e-8 })
    close(preview.motion!.evaluatedAngle, 4 * Math.PI)
    close(screw(preview.document).angle, -4 * Math.PI)
    close(gear(preview.document).angles.first, -4 * Math.PI); close(gear(preview.document).angles.second, 8 * Math.PI)
    close(preview.document.occurrences.find(value => value.id === 'nut')!.pose.translation[2], 14, 1e-6)
    expect(preview.checks).toHaveLength(7); expect(preview.checks.every(check => check.satisfied)).toBe(true)
    for (const mate of [screw(preview.document), gear(preview.document)]) expect(preview.checks.filter(check => JSON.parse(check.constraintId)[1] === mate.id)).toHaveLength(1)
    expect(state(preview.document)).toEqual(retained)
    expect(serializeAssemblyDocument(coupled)).toBe(originalCoupled); expect(serializeAssemblyDocument(base)).toBe(originalBase)
    nativeGeometry(preview.scene)
    const applied = session.apply(coupled, preview.token).document
    expect(() => session.apply(coupled, preview.token)).toThrow('disponible')
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), verified = ready(session.prepare(reopened))
    expect(verified.scopes.at(-1)!.result.localDOF).toBe(1); expect(verified.checks.every(check => check.satisfied)).toBe(true)
    close(screw(verified.document).angle, -4 * Math.PI)
    close(gear(verified.document).angles.first, -4 * Math.PI); close(gear(verified.document).angles.second, 8 * Math.PI)
    close(verified.document.occurrences.find(value => value.id === 'nut')!.pose.translation[2], 14, 1e-6)
    expect(state(verified.document)).toEqual(retained); nativeGeometry(verified.scene)
    const reapplied = session.apply(reopened, verified.token)
    close(screw(reapplied.document).angle, -4 * Math.PI); close(gear(reapplied.document).angles.second, 8 * Math.PI)
    expect(state(reapplied.document)).toEqual(retained); nativeGeometry(reapplied.scene)
    expect(serializeAssemblyDocument(base)).toBe(originalBase)
  } finally { session.discard() }
}, 60_000)
