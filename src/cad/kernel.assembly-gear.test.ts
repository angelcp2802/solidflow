import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample, createEmptyAssembly } from '../examples/assembly'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyAxisReference,
  type AssemblyDocument, type AssemblyMate } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyGearCaptureRequest, type AssemblyPreviewReply, type AssemblySceneFace } from './kernel.assembly-types'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import * as numericSolver from '../model/assemblySolver'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import type { AssemblyComponentMotion } from '../model/assemblyMotion'
import { MAX_ASSEMBLY_MOTION_ANGULAR_STEP, MAX_ASSEMBLY_MOTION_STATIONS } from '../model/assemblyMotion'
import { applyAssemblySolvePreview, discardAssemblySolvePreview, prepareAssemblyMotionPreview } from './kernel.assembly-solve'
import * as sceneModule from './kernel.assembly-scene'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)

it('authors a root revision without recreating a native captured gear or accepting altered capture DTOs',()=>{
  const {session,document}=captured(),before=serializeAssemblyDocument(document),declaration=structuredClone(gear(document))
  try {
    const p=ready(session.previewRootRevision(document,'original-gear-source-r2'))
    expect(p.document.revision).toBe('original-gear-source-r2');expect(p.document.mates).toEqual(document.mates)
    expect(p.checks.every(c=>c.satisfied)).toBe(true);expect(p.scene.solidCount).toBe(3)
    close(p.scene.volume,4800+45*Math.PI/2,1e-5);close(p.scene.area,2960+543*Math.PI/4,1e-5)
    gear(p.document).angles.first=999
    const applied=session.apply(document,p.token)
    expect(gear(applied.document)).toEqual(declaration);expect(applied.document.revision).toBe('original-gear-source-r2')
    close(applied.scene.volume,4800+45*Math.PI/2,1e-5);close(applied.scene.area,2960+543*Math.PI/4,1e-5)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally {session.discard()}
},60_000)

// Original public plate/pins, deliberately placed at the Cartesian bearing
// coordinates. The native eccentric R.25 bore at local (1,0) independently
// exposes spin through its placed axis point; no tooth/contact claim is made.
// This extrusion/cut fixture's directed native cylinder axes are -Z. Positive
// component rotations about +Z therefore have negative saved shaft angles.
function fixture(): AssemblyDocument {
  const input = createAssemblyExample()
  for (const [id, x] of [['left', -10], ['right', 10]] as const) input.occurrences.find(value => value.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = buildAssemblyScene(input), faces = (id: string) => scene.bodies.find(value => value.component.occurrencePath[0] === id)!.faces
  const cylinder = (id: string, radius: number, x: number) => faces(id).find(face => face.support?.kind === 'cylinder'
    && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9)!
  const cap = (id: string, z: number) => faces(id).find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - z) < 1e-9)!
  const mates: AssemblyMate[] = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const pin = cylinder(id, 2, 0), hole = cylinder('plate', 3, x)
    if (pin.support?.kind !== 'cylinder' || hole.support?.kind !== 'cylinder') throw new Error('Original actual cylinders missing')
    for (const face of [pin, cylinder(id, .25, 1)]) {
      if (face.support?.kind !== 'cylinder') throw new Error('Original native shaft/bore axis missing')
      close(face.support.axis[0], 0, 1e-12); close(face.support.axis[1], 0, 1e-12); close(face.support.axis[2], -1, 1e-12)
    }
    mates.push({ id: id + '-axis', name: id + ' bearing', type: 'concentric', suppressed: false, rotationLock: null,
      first: assemblySceneFaceReference(pin)! as AssemblyAxisReference, second: assemblySceneFaceReference(hole)! as AssemblyAxisReference,
      alignment: pin.support.axis[2] * hole.support.axis[2] > 0 ? 'aligned' : 'opposed' },
    { id: id + '-cap', name: id + ' cap', type: 'coincident', suppressed: false, alignment: 'aligned',
      first: { ...assemblySceneFaceReference(cap(id, 12))!, support: 'plane' }, second: { ...assemblySceneFaceReference(cap('plate', 4))!, support: 'plane' } })
  }
  input.mates = mates
  return validateAssemblyDocument(input)
}
function ready(reply: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(reply.status, reply.status === 'rejected' ? reply.message : '').toBe('ready')
  if (reply.status !== 'ready') throw new Error(reply.message)
  return reply
}
function gear(document: AssemblyDocument): Extract<AssemblyMate, { type: 'gear' }> {
  const value = document.mates.find(value => value.type === 'gear')
  if (!value || value.type !== 'gear') throw new Error('Original captured gear missing')
  return value
}
function request(document: AssemblyDocument, ratio = { numerator: 1, denominator: 2 }): AssemblyGearCaptureRequest {
  const first = document.mates.find(value => value.id === 'left-axis'), second = document.mates.find(value => value.id === 'right-axis')
  if (first?.type !== 'concentric' || second?.type !== 'concentric' || first.first.kind !== 'face' || second.first.kind !== 'face') throw new Error('Original bearing references missing')
  return { first: structuredClone(first.first), second: structuredClone(second.first), carrier: { occurrencePath: ['plate'], definition: { id: 'example-plate', revision: 'r1' } },
    ratio, direction: 'opposed', name: 'Original captured gear' }
}
function captured(ratio = { numerator: 1, denominator: 2 }) {
  const session = new AssemblyWorkerSession(), base = fixture(), initial = ready(session.prepare(base))
  const preview = ready(session.captureGear(base, initial.token, request(base, ratio)))
  return { session, base, preview, document: session.apply(base, preview.token).document }
}
function pose(document: AssemblyDocument, id: string, radians: number) {
  const occurrence = document.occurrences.find(value => value.id === id)!
  return { translation: [...occurrence.pose.translation] as [number, number, number], rotation: [0, 0, Math.sin(radians / 2), Math.cos(radians / 2)] as [number, number, number, number] }
}
function bore(scene: ReturnType<typeof buildAssemblyScene>, id: string): AssemblySceneFace {
  const matches = scene.bodies.find(value => value.component.occurrencePath[0] === id)!.faces
    .filter(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - .25) < 1e-10)
  expect(matches).toHaveLength(1); return matches[0]
}
function close(actual: number, expected: number, tolerance = 1e-8) { expect(Math.abs(actual - expected)).toBeLessThan(tolerance) }

it('captures actual cylinders in the default root scope, removes one spin and authenticates one Apply', () => {
  const session = new AssemblyWorkerSession(), base = fixture(), before = serializeAssemblyDocument(base), initial = ready(session.prepare(base))
  expect(initial.scopes.at(-1)!.result.localDOF).toBe(2)
  const preview = ready(session.captureGear(base, initial.token, request(base)))
  expect(preview.document.id).toBe(base.id); expect(preview.document.revision).toBe(base.revision)
  expect(preview.document.mates.filter(mate => mate.type === 'gear')).toHaveLength(1)
  expect(preview.scopes.at(-1)!.result.localDOF).toBe(1)
  expect(gear(preview.document)).toMatchObject({ ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', angles: { first: 0, second: 0 }, phase: 0 })
  expect(serializeAssemblyDocument(base)).toBe(before)
  expect(() => session.apply(base, initial.token)).toThrow('disponible')
  const applied = session.apply(base, preview.token)
  expect(applied.document.mates).toHaveLength(5); expect(applied.scene.solidCount).toBe(3)
  expect(() => session.apply(base, preview.token)).toThrow('disponible')
}, 60_000)

it('continues the native directed follower beyond pi within one solve and independently measures its eccentric bore', () => {
  const { session, document } = captured({ numerator: 2, denominator: 1 }), left = document.occurrences.find(value => value.id === 'left')!
  const preview = ready(session.move(document, { component: { occurrencePath: ['left'], definition: left.definition }, pose: pose(document, 'left', 2 * Math.PI / 3) }))
  close(gear(preview.document).angles.first, -2 * Math.PI / 3); close(gear(preview.document).angles.second, 4 * Math.PI / 3)
  const support = bore(preview.scene, 'right').worldSupport
  if (support?.kind !== 'cylinder') throw new Error('Original native bore unavailable')
  close(support.point[0], 9.5, 1e-6); close(support.point[1], Math.sqrt(3) / 2, 1e-6)
  close(preview.scene.volume, 4800 + 45 * Math.PI / 2, 1e-5); close(preview.scene.area, 2960 + 543 * Math.PI / 4, 1e-5)
  expect(gear(document).angles).toEqual({ first: 0, second: 0 }); session.discard()
}, 60_000)

it('preserves successive lifted turns through save/reopen and continues from the stored native branch', () => {
  const value = captured({ numerator: 2, denominator: 1 }); let document = value.document
  for (let step = 1; step <= 4; step++) {
    const left = document.occurrences.find(value => value.id === 'left')!
    const preview = ready(value.session.move(document, { component: { occurrencePath: ['left'], definition: left.definition }, pose: pose(document, 'left', step * 2 * Math.PI / 3) }))
    document = value.session.apply(document, preview.token).document
    close(gear(document).angles.first, -step * 2 * Math.PI / 3); close(gear(document).angles.second, step * 4 * Math.PI / 3)
  }
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(document)), fresh = ready(value.session.prepare(reopened))
  close(gear(fresh.document).angles.first, gear(document).angles.first); close(gear(fresh.document).angles.second, gear(document).angles.second)
  expect(fresh.scopes.at(-1)!.result.localDOF).toBe(1)
  value.session.discard()
}, 60_000)

it('tracks a suppressed gear without its equation and preserves derived angles when reactivating', () => {
  const value = captured(), proposed = structuredClone(value.document); gear(proposed).suppressed = true
  let document = value.session.apply(value.document, ready(value.session.prepare(value.document, proposed)).token).document
  const right = document.occurrences.find(value => value.id === 'right')!
  const moved = ready(value.session.move(document, { component: { occurrencePath: ['right'], definition: right.definition }, pose: pose(document, 'right', Math.PI / 2) }))
  document = value.session.apply(document, moved.token).document
  close(gear(document).angles.first, 0); close(gear(document).angles.second, -Math.PI / 2)
  expect(moved.scopes.at(-1)!.result.localDOF).toBe(1)
  const active = structuredClone(document); gear(active).suppressed = false
  const solved = ready(value.session.prepare(document, active)); expect(solved.checks.every(check => check.satisfied)).toBe(true)
  close(.5 * gear(solved.document).angles.first + gear(solved.document).angles.second, 0)
  value.session.discard()
}, 60_000)

it.each(['angles', 'neutral', 'new gear', 'carrier path', 'endpoint path'] as const)('rejects renderer-derived %s and revokes an older capability', field => {
  const value = captured(), earlier = ready(value.session.prepare(value.document)), proposed = structuredClone(value.document)
  if (field === 'angles') gear(proposed).angles.first += 2 * Math.PI
  else if (field === 'neutral') gear(proposed).neutralRotations.first = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  else if (field === 'carrier path') gear(proposed).carrier = null
  else if (field === 'endpoint path') gear(proposed).first.component.occurrencePath = ['right']
  else proposed.mates.push({ ...structuredClone(gear(proposed)), id: 'renderer-created-gear' })
  expect(() => value.session.prepare(value.document, proposed)).toThrow(/worker|captura nativa/)
  expect(() => value.session.apply(value.document, earlier.token)).toThrow('disponible')
}, 60_000)

it('rejects loaded lifted state inconsistent with its actual current native orientation', () => {
  const value = captured(), changed = structuredClone(value.document); gear(changed).angles.first = .125
  const reply = value.session.prepare(changed)
  expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
  if (reply.status === 'rejected') expect(reply.message).toContain('ángulos guardados')
}, 60_000)

it('independently rejects corrupted numeric lifted state after a real solve and fresh native checks', () => {
  const value = captured(), original = numericSolver.solveRigidMates
  const spy = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => {
    const result = original(problem, options)
    if (result.poses) for (const angles of result.gearAngles.values()) angles.second += .125
    return result
  })
  try {
    const left = value.document.occurrences.find(value => value.id === 'left')!
    const reply = value.session.move(value.document, { component: { occurrencePath: ['left'], definition: left.definition }, pose: pose(value.document, 'left', Math.PI / 3) })
    expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
    if (reply.status === 'rejected') expect(reply.reason).toBe('verification')
    expect(gear(value.document).angles).toEqual({ first: 0, second: 0 })
  } finally { spy.mockRestore(); value.session.discard() }
}, 60_000)

it('permits declared ratio, phase, name and suppression edits while keeping zero frames and lifted state worker-owned', () => {
  const value = captured(), proposed = structuredClone(value.document), original = structuredClone(gear(proposed))
  Object.assign(gear(proposed), { ratio: { numerator: 2, denominator: 1 }, phase: .2, name: 'Edited original gear', suppressed: true })
  const preview = ready(value.session.prepare(value.document, proposed)), updated = gear(preview.document)
  expect(updated.neutralRotations).toEqual(original.neutralRotations); expect(updated.angles).toEqual(original.angles)
  expect(updated).toMatchObject({ ratio: { numerator: 2, denominator: 1 }, phase: .2, name: 'Edited original gear', suppressed: true })
  value.session.discard()
}, 60_000)

it.each(['revision', 'face', 'body', 'carrier', 'plane', 'same occurrence'] as const)('rejects a %s capture endpoint using actual native reconstruction', field => {
  const session = new AssemblyWorkerSession(), base = fixture(), initial = ready(session.prepare(base)), intent = request(base), before = serializeAssemblyDocument(base)
  if (field === 'revision') intent.first.component.definition.revision = 'stale'
  else if (field === 'face') intent.first.face.key = 'invented-current-face'
  else if (field === 'body') intent.first.body!.sourceFeatureId = 'base'
  else if (field === 'carrier') intent.carrier!.occurrencePath = ['missing-carrier']
  else if (field === 'same occurrence') intent.second = structuredClone(intent.first)
  else Object.assign(intent.first, { support: 'plane' })
  const message = field === 'face' ? /(?:cara|referencia).*?(?:otro sólido|identificar|ambigua)/i
    : field === 'plane' ? /requiere un eje de cara/ : field === 'same occurrence' ? /dos ocurrencias de pieza distintas/ : /Repara las referencias/
  expect(() => session.captureGear(base, initial.token, intent)).toThrow(message)
  expect(serializeAssemblyDocument(base)).toBe(before); expect(() => session.apply(base, initial.token)).toThrow('disponible')
}, 60_000)

it.each([false, true])('verifies lifted gear state in every rotated reused subassembly with scope carrier=%s', scopeCarrier => {
  const session = new AssemblyWorkerSession(), base = fixture(), initial = ready(session.prepare(base)), intent = request(base, { numerator: 2, denominator: 1 })
  if (scopeCarrier) intent.carrier = null
  let inner = session.apply(base, ready(session.captureGear(base, initial.token, intent)).token).document
  const left = inner.occurrences.find(value => value.id === 'left')!
  inner = session.apply(inner, ready(session.move(inner, { component: { occurrencePath: ['left'], definition: left.definition }, pose: pose(inner, 'left', 2 * Math.PI / 3) })).token).document
  const { version: _version, units: _units, definitions, ...sub } = inner
  const root = createEmptyAssembly('Original two carrier scopes')
  root.definitions = [...definitions, sub]
  root.occurrences = [
    { id: 'a', name: 'Rotated carrier A', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [70, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'b', name: 'Rotated carrier B', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [-70, 0, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
  ]
  const preview = ready(session.prepare(root)), gearId = gear(inner).id
  const checks = preview.checks.filter(value => JSON.parse(value.constraintId)[1] === gearId)
  expect(checks).toHaveLength(2); expect(checks.every(value => value.satisfied)).toBe(true)
  expect(checks.map(value => JSON.parse(value.constraintId)[0])).toEqual([['a'], ['b']])
  const snapshot = new AssemblyGeometrySnapshot(preview.document)
  try {
    const expanded = snapshot.resolveActiveMates(preview.document).filter(value => value.mate.type === 'gear').map(requireResolvedBinaryMate)
    expect(expanded.map(value => value.carrier!.componentPath)).toEqual(scopeCarrier ? [['a'], ['b']] : [['a', 'plate'], ['b', 'plate']])
    expect(expanded.every(value => value.carrier!.origin === (scopeCarrier ? 'principal-plane' : 'component'))).toBe(true)
    for (const value of expanded) {
      if (value.mate.type !== 'gear') throw new Error('Original expanded gear missing')
      close(value.mate.angles.first, -2 * Math.PI / 3); close(value.mate.angles.second, 4 * Math.PI / 3)
    }
  } finally { snapshot.dispose(); session.discard() }
}, 60_000)

it('projects a pointer rotation onto the native gear equation without persisting a driver anchor', () => {
  const value = captured(), left = value.document.occurrences.find(value => value.id === 'left')!
  const preview = ready(value.session.project(value.document, { component: { occurrencePath: ['left'], definition: left.definition }, pose: pose(value.document, 'left', Math.PI / 3), mode: 'rotate' }))
  expect(preview.projection?.temporaryAnchor).toBe(false)
  close(gear(preview.document).angles.first, -Math.PI / 3); close(gear(preview.document).angles.second, Math.PI / 6)
  expect(preview.checks.every(value => value.satisfied)).toBe(true); value.session.discard()
}, 60_000)

it('binds the gear carrier witness to its complete current native snapshot and rejects a frozen clone', () => {
  const { document } = captured(), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const resolved = requireResolvedBinaryMate(snapshot.resolveActiveMates(document).find(value => value.mate.type === 'gear')!)
    expect(resolved.carrier?.componentPath).toEqual(['plate']); expect(Object.isFrozen(resolved.carrier)).toBe(true)
    expect(snapshot.assertWitness(resolved.carrier!, document)).toBe(resolved.carrier)
    expect(() => snapshot.assertWitness(structuredClone(resolved.carrier!), document)).toThrow('no fue verificada')
    const changed = structuredClone(document); changed.name += ' edited'
    expect(() => snapshot.assertWitness(resolved.carrier!, changed)).toThrow('documento cambió')
  } finally { snapshot.dispose() }
}, 60_000)

it('rejects stale source content despite unchanged revision labels and retains gear endpoints for explicit source repair', () => {
  const value = captured(), preview = ready(value.session.prepare(value.document)), changed = structuredClone(value.document)
  const definition = changed.definitions.find(value => value.id === 'example-pin')!
  if (definition.kind !== 'part') throw new Error('Original source missing')
  const first = definition.document.features[0]; if (first.type !== 'sketch' || first.profile.kind !== 'circle') throw new Error('Original source circle missing')
  first.profile.radius = 2.1
  expect(() => value.session.apply(changed, preview.token)).toThrow('documento cambió')
  const reviewed = reviewAssemblyPartSourceUpdate(value.document, { id: 'example-pin', revision: 'r1' }, definition.document, 'r2')
  expect(reviewed.endpoints.filter(endpoint => endpoint.locator.mateId === gear(value.document).id)).toHaveLength(2)
  expect(reviewed.endpoints.filter(endpoint => endpoint.locator.mateId === gear(value.document).id).every(endpoint => endpoint.status === 'needs-repair')).toBe(true)
  expect(gear(reviewed.document).neutralRotations).toEqual(gear(value.document).neutralRotations)
  expect(gear(reviewed.document).angles).toEqual(gear(value.document).angles)
}, 60_000)

it('keeps rectilinear stopping outside the new nonlinear gear family without publishing a token', () => {
  const value = captured(), left = value.document.occurrences.find(value => value.id === 'left')!
  const reply = value.session.translateUntilContact(value.document, { component: { occurrencePath: ['left'], definition: left.definition }, translation: [-10, 0, -7] })
  expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
}, 60_000)

function unavailableGear(document: AssemblyDocument): AssemblyDocument {
  const value = structuredClone(document); gear(value).suppressed = true; gear(value).first.face.key = 'original-unavailable-gear-axis'
  return validateAssemblyDocument(value)
}
it('allows a stationary solve of an unavailable suppressed gear while preserving its complete angular declaration', () => {
  const value = captured(), base = unavailableGear(value.document), declaration = structuredClone(gear(base)), preview = ready(value.session.prepare(base))
  expect(gear(preview.document)).toEqual(declaration); expect(preview.scopes.at(-1)!.result.localDOF).toBe(2)
  expect(preview.checks.some(check => JSON.parse(check.constraintId)[1] === declaration.id)).toBe(false)
  value.session.discard()
}, 60_000)

it('allows suppressing an active broken gear without manufacturing a repaired axis or changing angular state', () => {
  const value = captured(), base = unavailableGear(value.document); gear(base).suppressed = false
  const proposed = structuredClone(base); gear(proposed).suppressed = true
  const preview = ready(value.session.prepare(base, proposed))
  expect(gear(preview.document)).toEqual(gear(proposed)); expect(gear(base).suppressed).toBe(false)
  value.session.discard()
}, 60_000)

it('rejects a native movement of an unavailable gear endpoint instead of publishing untracked winding', () => {
  const value = captured(), base = unavailableGear(value.document), before = serializeAssemblyDocument(base), left = base.occurrences.find(value => value.id === 'left')!
  const reply = value.session.move(base, { component: { occurrencePath: ['left'], definition: left.definition }, pose: pose(base, 'left', Math.PI / 6) })
  expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
  if (reply.status === 'rejected') expect(reply.message).toContain('sin continuidad nativa')
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each(['endpoint pose', 'carrier pose', 'source content', 'source revision', 'repair reference'] as const)(
  'rejects a renderer %s change while a suppressed gear has no native angular continuity', field => {
    const value = captured(), base = unavailableGear(value.document), proposed = structuredClone(base)
    if (field === 'endpoint pose') proposed.occurrences.find(value => value.id === 'left')!.pose = pose(proposed, 'left', .25)
    else if (field === 'carrier pose') proposed.occurrences.find(value => value.id === 'plate')!.pose.rotation = [0, 0, Math.sin(.125), Math.cos(.125)]
    else if (field === 'repair reference') gear(proposed).first = structuredClone(gear(value.document).first)
    else {
      const definition = proposed.definitions.find(value => value.id === 'example-pin')!
      if (field === 'source revision') {
        definition.revision = 'r2'
        for (const occurrence of proposed.occurrences) if (occurrence.definition.id === definition.id) occurrence.definition.revision = 'r2'
      } else {
        if (definition.kind !== 'part') throw new Error('Original pin source missing')
        definition.document.name += ' changed source'
      }
    }
    expect(() => value.session.prepare(base, proposed)).toThrow('sin continuidad nativa')
  }, 60_000)

it('permits movement outside every unavailable gear endpoint and carrier chain', () => {
  const value = captured(), base = unavailableGear(value.document), right = base.occurrences.find(value => value.id === 'right')!
  base.occurrences.push({ ...structuredClone(right), id: 'unrelated', name: 'Original unrelated pin', pose: { ...identityRigidPose(), translation: [50, 0, -8] } })
  const before = structuredClone(gear(base)), preview = ready(value.session.move(base,
    { component: { occurrencePath: ['unrelated'], definition: right.definition }, pose: { ...identityRigidPose(), translation: [52, 1, -8] } }))
  expect(gear(preview.document)).toEqual(before)
  expect(preview.document.occurrences.find(value => value.id === 'unrelated')!.pose.translation).toEqual([52, 1, -8])
  expect(preview.scene.solidCount).toBe(4); value.session.discard()
}, 60_000)

it('does not demote a native cleanup failure to an unavailable passive declaration', () => {
  const value = captured(), base = structuredClone(value.document); gear(base).suppressed = true
  const snapshot = new AssemblyGeometrySnapshot(base), witness = snapshot.resolveReference(base, gear(base).first)
  const original = CadEngine.prototype.inspectCurrentFaceSupport, failure = new NativeCleanupError(undefined, [new Error('Original passive cleanup fault')], 'Original passive cleanup failed')
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    original.apply(this, args); throw failure
  })
  try {
    expect(() => snapshot.inspectGearState(base, true)).toThrow(AggregateError)
    expect(() => snapshot.assertWitness(witness, base)).toThrow('ya no está vigente')
  } finally { spy.mockRestore(); snapshot.dispose() }
}, 60_000)

it.each(['pose', 'source', 'reference'] as const)('freezes original %s when a proposal first makes a valid gear unavailable', field => {
  const value = captured(), proposed = structuredClone(value.document)
  gear(proposed).suppressed = true
  proposed.occurrences.find(value => value.id === 'left')!.suppressed = true
  if (field === 'pose') proposed.occurrences.find(value => value.id === 'left')!.pose = pose(proposed, 'left', .25)
  else if (field === 'reference') gear(proposed).first.face.key = 'original-new-unavailable-axis'
  else {
    const source = proposed.definitions.find(value => value.id === 'example-pin')!
    if (source.kind !== 'part') throw new Error('Original source missing')
    source.document.name += ' proposal source change'
  }
  const before = serializeAssemblyDocument(value.document)
  expect(() => value.session.prepare(value.document, proposed)).toThrow('sin continuidad nativa')
  expect(serializeAssemblyDocument(value.document)).toBe(before)
}, 60_000)

function motionRequest(document: AssemblyDocument, angle = 4 * Math.PI, axis: 0 | 1 | 2 = 2, id = 'left'): AssemblyComponentMotion {
  const driver = document.occurrences.find(value => value.id === id)!
  return { component: { occurrencePath: [id], definition: { ...driver.definition } }, translation: [...driver.pose.translation], rotation: { axis, angle } }
}

it.each([1, -1])('measures an explicit %s×720 degree driver and persists complete native gear turns with one scene publication', sign => {
  const value = captured(), before = serializeAssemblyDocument(value.document), original = sceneModule.buildAssemblyScene
  let publications = 0
  const spy = vi.spyOn(sceneModule, 'buildAssemblyScene').mockImplementation(document => { publications++; return original(document) })
  try {
    const preview = ready(value.session.moveMotion(value.document, motionRequest(value.document, sign * 4 * Math.PI)))
    expect(publications).toBe(1); expect(serializeAssemblyDocument(value.document)).toBe(before)
    expect(preview.motion).toMatchObject({ frame: 'local', axis: 2, requestedAngle: sign * 4 * Math.PI,
      stationCount: 12, verifiedStations: 12, maxAngularStep: Math.PI / 3, sampledOnly: true, temporaryAnchor: true })
    close(preview.motion!.evaluatedAngle, sign * 4 * Math.PI); expect(preview.motion!.windingResidual).toBeLessThanOrEqual(preview.motion!.windingTolerance)
    close(gear(preview.document).angles.first, -sign * 4 * Math.PI); close(gear(preview.document).angles.second, sign * 2 * Math.PI)
    const first = preview.document.occurrences.find(value => value.id === 'left')!
    expect(first.pose).toEqual(value.document.occurrences.find(value => value.id === 'left')!.pose)
    const support = bore(preview.scene, 'right').worldSupport
    if (support?.kind !== 'cylinder') throw new Error('Original native follower bore missing')
    close(support.point[0], 11, 1e-6); close(support.point[1], 0, 1e-6)
    close(preview.scene.volume, 4800 + 45 * Math.PI / 2, 1e-5); close(preview.scene.area, 2960 + 543 * Math.PI / 4, 1e-5)
    const applied = value.session.apply(value.document, preview.token)
    expect(publications).toBe(2); close(gear(applied.document).angles.first, -sign * 4 * Math.PI)
    expect(() => value.session.apply(value.document, preview.token)).toThrow('disponible')
  } finally { spy.mockRestore(); value.session.discard() }
}, 60_000)

it('refines a two-to-one explicit 120 degree motion from nonzero native neutral spins without changing public tolerances', () => {
  const session = new AssemblyWorkerSession(), base = fixture()
  base.occurrences.find(value => value.id === 'left')!.pose = pose(base, 'left', .5)
  base.occurrences.find(value => value.id === 'right')!.pose = pose(base, 'right', .24)
  const initial = ready(session.prepare(base)), captured = ready(session.captureGear(base, initial.token, request(base, { numerator: 2, denominator: 1 })))
  const publicAngularRows = captured.scopes.flatMap(scope => scope.result.evidence.groups.flatMap(group => group.rowResiduals)).filter(row => row.kind === 'angle')
  expect(publicAngularRows.length).toBeGreaterThan(0); expect(publicAngularRows.every(row => row.tolerance === 1e-8)).toBe(true)
  const document = session.apply(base, captured.token).document, before = serializeAssemblyDocument(document)
  try {
    for (const [side, spin] of [['first', .5], ['second', .24]] as const) {
      const neutral = gear(document).neutralRotations[side]
      close(neutral[0], 0, 1e-12); close(neutral[1], 0, 1e-12)
      close(neutral[2], Math.sin(spin / 2), 1e-12); close(neutral[3], Math.cos(spin / 2), 1e-12)
    }
    const preview = ready(session.moveMotion(document, motionRequest(document, 2 * Math.PI / 3)))
    expect(serializeAssemblyDocument(document)).toBe(before)
    close(gear(preview.document).angles.first, -2 * Math.PI / 3)
    close(gear(preview.document).angles.second, 4 * Math.PI / 3)
    const numericalRows = preview.scopes.flatMap(scope => scope.result.evidence.groups.flatMap(group => group.rowResiduals)).filter(row => row.kind === 'angle')
    expect(numericalRows.length).toBeGreaterThan(0); expect(numericalRows.every(row => row.tolerance === 1e-9)).toBe(true)
    expect(preview.checks.every(check => check.satisfied && check.angleTolerance === 1e-8)).toBe(true)
    expect(preview.motion).toMatchObject({ stationCount: 2, verifiedStations: 2, angleTolerance: 1e-8, windingTolerance: 1e-8 })
    close(preview.motion!.evaluatedAngle, 2 * Math.PI / 3)
    for (const [id, x, angle] of [['left', -10, .5 + 2 * Math.PI / 3], ['right', 10, .24 - 4 * Math.PI / 3]] as const) {
      const support = bore(preview.scene, id).worldSupport
      if (support?.kind !== 'cylinder') throw new Error('Original nonzero-neutral native bore missing')
      close(support.point[0], x + Math.cos(angle), 1e-6); close(support.point[1], Math.sin(angle), 1e-6)
    }
    const applied = session.apply(document, preview.token)
    close(gear(applied.document).angles.second, 4 * Math.PI / 3)
  } finally { session.discard() }
}, 60_000)

it('rejects an unrepresentable private angular refinement before native reconstruction', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), before = serializeAssemblyDocument(base)
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), render = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const reply = session.moveMotion(base, motionRequest(base, Math.PI / 3), { angleTolerance: Number.MIN_VALUE })
    expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false); expect(spy).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled()
    if (reply.status === 'rejected') { expect(reply.reason).toBe('precisionLimit'); expect(reply.message).toContain('no es representable') }
    expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { render.mockRestore(); spy.mockRestore(); session.discard() }
}, 60_000)

it('authenticates a full-turn candidate against the original source and creates exactly one undo transaction', () => {
  const value = captured(), history = new AssemblyDocumentHistory(value.document), before = serializeAssemblyDocument(history.current)
  const preview = prepareAssemblyMotionPreview(value.document, motionRequest(value.document))
  if (preview.status !== 'ready') throw new Error(preview.message)
  expect(history.canUndo).toBe(false); expect(serializeAssemblyDocument(history.current)).toBe(before)
  expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow('no fue verificada')
  const applied = applyAssemblySolvePreview(history, preview), after = serializeAssemblyDocument(applied)
  close(gear(applied).angles.first, -4 * Math.PI)
  expect(history.canUndo).toBe(true); expect(serializeAssemblyDocument(history.undo())).toBe(before); expect(history.canUndo).toBe(false)
  expect(serializeAssemblyDocument(history.redo())).toBe(after)
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('ya se consumió')
}, 60_000)

it('rejects an intermediate X-axis station of a 360 degree request despite an identical final orientation', () => {
  const value = captured(), before = serializeAssemblyDocument(value.document), older = ready(value.session.prepare(value.document))
  const original = sceneModule.buildAssemblyScene; let publications = 0
  const spy = vi.spyOn(sceneModule, 'buildAssemblyScene').mockImplementation(document => { publications++; return original(document) })
  try {
    const reply = value.session.moveMotion(value.document, motionRequest(value.document, 2 * Math.PI, 0))
    expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false); expect(publications).toBe(0)
    if (reply.status === 'rejected') expect(reply.message).toMatch(/^Estación 1\/6:/)
    expect(serializeAssemblyDocument(value.document)).toBe(before)
    expect(() => value.session.apply(value.document, older.token)).toThrow('disponible')
  } finally { spy.mockRestore(); value.session.discard() }
}, 60_000)

it('supports a general translation with zero angular increment through the same explicit-motion route', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), request = motionRequest(base, 0)
  request.translation = [7, 8, 9]
  const preview = ready(session.moveMotion(base, request)), driver = preview.document.occurrences.find(value => value.id === 'left')!
  expect(driver.pose.translation).toEqual([7, 8, 9])
  for (const [index, expected] of base.occurrences.find(value => value.id === 'left')!.pose.rotation.entries()) close(driver.pose.rotation[index], expected)
  expect(preview.motion).toMatchObject({ requestedAngle: 0, evaluatedAngle: 0, stationCount: 1, verifiedStations: 1, sampledOnly: true })
  session.discard()
}, 60_000)

it('uses an intrinsic component axis from the original pose rather than a container-axis increment', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), left = base.occurrences.find(value => value.id === 'left')!
  left.pose.rotation = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
  const preview = ready(session.moveMotion(base, motionRequest(base, Math.PI / 2))), actual = preview.document.occurrences.find(value => value.id === 'left')!.pose.rotation
  for (const [index, expected] of [.5, -.5, .5, .5].entries()) close(actual[index], expected)
  close(preview.motion!.evaluatedAngle, Math.PI / 2)
  const support = bore(preview.scene, 'left').worldSupport
  if (support?.kind !== 'cylinder') throw new Error('Original native driver bore missing')
  close(support.point[0], -4, 1e-6); close(support.point[1], 3, 1e-6); close(support.point[2], -1, 1e-6)
  session.discard()
}, 60_000)

it.each(['fixed', 'suppressed', 'stale', 'missing'] as const)('rejects %s explicit motion identity before publishing any station', kind => {
  const value = captured(), base = structuredClone(value.document), request = motionRequest(base)
  if (kind === 'fixed') base.occurrences.find(value => value.id === 'left')!.fixed = true
  else if (kind === 'suppressed') base.occurrences.find(value => value.id === 'left')!.suppressed = true
  else if (kind === 'stale') request.component.definition.revision = 'stale'
  else request.component.occurrencePath = ['missing']
  const before = serializeAssemblyDocument(base), reply = value.session.moveMotion(base, request)
  expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('rejects an excessive station request before any native reconstruction and revokes an older capability', () => {
  const session = new AssemblyWorkerSession(), base = createAssemblyExample(), older = ready(session.prepare(base))
  const request = motionRequest(base, MAX_ASSEMBLY_MOTION_STATIONS * MAX_ASSEMBLY_MOTION_ANGULAR_STEP + 1e-6)
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), render = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const reply = session.moveMotion(base, request)
    expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false); expect(spy).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled()
    expect(() => session.apply(base, older.token)).toThrow('disponible')
  } finally { render.mockRestore(); spy.mockRestore(); session.discard() }
}, 60_000)

it('rejects a whole-turn request on an unavailable gear endpoint instead of skipping its intermediate winding', () => {
  const value = captured(), base = unavailableGear(value.document), before = serializeAssemblyDocument(base)
  const reply = value.session.moveMotion(base, motionRequest(base))
  expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
  if (reply.status === 'rejected') expect(reply.message).toMatch(/^Estación 1\/12:.*sin continuidad nativa/)
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('keeps unrelated explicit turns available while an unavailable gear declaration remains exactly frozen', () => {
  const value = captured(), base = unavailableGear(value.document), right = base.occurrences.find(value => value.id === 'right')!
  base.occurrences.push({ ...structuredClone(right), id: 'unrelated-motion', name: 'Original independent rotor', pose: { ...identityRigidPose(), translation: [50, 0, -8] } })
  const declaration = structuredClone(gear(base)), preview = ready(value.session.moveMotion(base, motionRequest(base, 2 * Math.PI, 2, 'unrelated-motion')))
  expect(gear(preview.document)).toEqual(declaration); close(preview.motion!.evaluatedAngle, 2 * Math.PI)
  expect(preview.motion!.verifiedStations).toBe(6); value.session.discard()
}, 60_000)

it('captures detached motion intent before native queries and binds final authority to the original source', () => {
  const value = captured(), originalDocument = structuredClone(value.document), request = motionRequest(value.document), original = CadEngine.prototype.inspectCurrentFaceSupport
  let altered = false
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = original.apply(this, args)
    if (!altered) { altered = true; value.document.name += ' changed live source'; request.rotation.angle = -4 * Math.PI }
    return result
  })
  let preview: ReturnType<typeof prepareAssemblyMotionPreview> | undefined
  try {
    preview = prepareAssemblyMotionPreview(value.document, request)
    expect(preview.status, preview.status === 'rejected' ? preview.message : '').toBe('ready')
    if (preview.status !== 'ready') throw new Error(preview.message)
    close(preview.motion!.requestedAngle, 4 * Math.PI); close(preview.motion!.evaluatedAngle, 4 * Math.PI)
    expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(value.document), preview as Extract<typeof preview, { status: 'ready' }>)).toThrow('documento cambió')
    expect(serializeAssemblyDocument(originalDocument)).not.toBe(serializeAssemblyDocument(value.document))
  } finally { spy.mockRestore(); if (preview?.status === 'ready') discardAssemblySolvePreview(preview) }
}, 60_000)

it('abandons earlier verified stations atomically after a later real native query reports fatal cleanup', () => {
  const value = captured(), before = serializeAssemblyDocument(value.document), original = AssemblyGeometrySnapshot.prototype.resolveActiveMates
  const failure = new NativeCleanupError(undefined, [new Error('Original motion station cleanup fault')], 'Original station cleanup failed')
  let failedSnapshot: AssemblyGeometrySnapshot | undefined, failedWitness: ReturnType<AssemblyGeometrySnapshot['resolveReference']> | undefined
  const spy = vi.spyOn(AssemblyGeometrySnapshot.prototype, 'resolveActiveMates').mockImplementation(function (this: AssemblyGeometrySnapshot, document) {
    const resolved = original.call(this, document), advanced = resolved.find(value => value.mate.type === 'gear' && Math.abs(value.mate.angles.first) > 1.1)
    if (advanced) { failedSnapshot = this; failedWitness = requireResolvedBinaryMate(advanced).first; throw failure }
    return resolved
  })
  try {
    const reply = value.session.moveMotion(value.document, motionRequest(value.document))
    expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
    if (reply.status === 'rejected') expect(reply.message).toMatch(/^Estación 2\/12:/)
    expect(serializeAssemblyDocument(value.document)).toBe(before)
    expect(failedSnapshot).toBeDefined(); expect(() => failedSnapshot!.assertWitness(failedWitness!, value.document)).toThrow('ya no está vigente')
  } finally { spy.mockRestore(); value.session.discard() }
}, 60_000)

it('publishes full-turn state for every reuse of a nested local declaration without moving its fixed parents', () => {
  const value = captured(), { version: _version, units: _units, definitions, ...sub } = value.document, root = createEmptyAssembly('Original shared angular drive')
  root.definitions = [...definitions, sub]
  root.occurrences = [
    { id: 'a', name: 'Original motion reuse A', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [70, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'b', name: 'Original motion reuse B', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [-70, 0, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
  ]
  const request = motionRequest(value.document); request.component.occurrencePath = ['a', 'left']
  const nativeBuild = CadEngine.prototype.build, referenceBuild = CadEngine.prototype.rebuildForAssemblyReferences,
    nativeQuery = CadEngine.prototype.inspectCurrentFaceSupport
  const oc = getOC() as unknown as { HEAPU8?: Uint8Array; wasmMemory?: WebAssembly.Memory }
  const heapBytes = () => oc.HEAPU8?.byteLength ?? oc.wasmMemory?.buffer.byteLength ?? null
  const initialHeapBytes = heapBytes()
  let builds = 0, referenceBuilds = 0, queries = 0, firstFailure: unknown
  const describeError = (error: unknown, depth = 0): unknown => error instanceof Error
    ? { name: error.name, message: error.message.slice(0, 1000), stack: error.stack?.slice(0, 6000),
      ...(depth < 2 && error.cause !== undefined ? { cause: describeError(error.cause, depth + 1) } : {}) }
    : String(error).slice(0, 1000)
  const recordFailure = (operation: 'build' | 'referenceBuild' | 'support', error: unknown) => {
    firstFailure ??= { operation, builds, referenceBuilds, queries, heapBytes: heapBytes(), error: describeError(error) }
  }
  const buildSpy = vi.spyOn(CadEngine.prototype, 'build').mockImplementation(function (this: CadEngine, ...args) {
    builds++
    try { return nativeBuild.apply(this, args) } catch (error) { recordFailure('build', error); throw error }
  })
  const referenceBuildSpy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, ...args) {
    referenceBuilds++
    try { return referenceBuild.apply(this, args) } catch (error) { recordFailure('referenceBuild', error); throw error }
  })
  const querySpy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    queries++
    try { return nativeQuery.apply(this, args) } catch (error) { recordFailure('support', error); throw error }
  })
  try {
    const reply = value.session.moveMotion(root, request)
    if (reply.status === 'rejected') console.error('Original shared angular drive native diagnostic', JSON.stringify({
      builds, referenceBuilds, queries, initialHeapBytes, finalHeapBytes: heapBytes(), firstFailure }))
    const preview = ready(reply), shared = preview.document.definitions.find(value => value.id === sub.id)!
    if (shared.kind !== 'assembly') throw new Error('Original shared gear assembly missing')
    const declaration = shared.mates.find(value => value.type === 'gear')!
    if (declaration.type !== 'gear') throw new Error('Original shared gear missing')
    close(declaration.angles.first, -4 * Math.PI); close(declaration.angles.second, 2 * Math.PI)
    expect(preview.motion!.affectedPaths).toEqual([['a', 'left'], ['b', 'left']]); expect(preview.document.occurrences).toEqual(root.occurrences)
    expect(preview.checks.filter(check => JSON.parse(check.constraintId)[1] === declaration.id)).toHaveLength(2)
  } finally { querySpy.mockRestore(); referenceBuildSpy.mockRestore(); buildSpy.mockRestore(); value.session.discard() }
}, 60_000)
import { requireResolvedBinaryMate } from './kernel.assembly-binary-fixtures.test-utils'
