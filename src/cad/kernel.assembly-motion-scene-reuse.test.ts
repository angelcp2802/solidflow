import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyAxisReference, type AssemblyDocument, type AssemblyMate } from '../model/assemblyDocument'
import type { AssemblyComponentMotion } from '../model/assemblyMotion'
import { identityRigidPose } from '../model/rigidPose'
import { CadEngine } from './kernel.engine'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot, type AssemblyScenePartProvider, type AssemblyScenePartSource } from './kernel.assembly-snapshot'
import { assemblySceneFaceReference, type AssemblyPreviewReply, type AssemblyScene } from './kernel.assembly-types'
import * as sceneModule from './kernel.assembly-scene'
import * as solve from './kernel.assembly-solve'
import * as engineModule from './kernel.engine'

// Original public plate and two eccentric-bore pins from examples/assembly.
// Native cylinders and caps author the same four bearing mates used by the
// public gear tests; captureGear creates the mechanical declaration itself.
// No saved private model, derived camera result or manufactured capture enters.
let originalDocument: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const input = createAssemblyExample()
  for (const [id, x] of [['left', -10], ['right', 10]] as const)
    input.occurrences.find(value => value.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = sceneModule.buildAssemblyScene(input)
  const faces = (id: string) => scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces
  const cylinder = (id: string, radius: number, x: number) => faces(id).find(face => face.support?.kind === 'cylinder'
    && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9)!
  const cap = (id: string, z: number) => faces(id).find(face => face.support?.kind === 'plane'
    && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - z) < 1e-9)!
  const mates: AssemblyMate[] = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const pin = cylinder(id, 2, 0), hole = cylinder('plate', 3, x)
    if (pin.support?.kind !== 'cylinder' || hole.support?.kind !== 'cylinder') throw new Error('Original bearing cylinders missing')
    mates.push({ id: id + '-axis', name: id + ' bearing', type: 'concentric', suppressed: false, rotationLock: null,
      first: assemblySceneFaceReference(pin)! as AssemblyAxisReference, second: assemblySceneFaceReference(hole)! as AssemblyAxisReference,
      alignment: pin.support.axis[2] * hole.support.axis[2] > 0 ? 'aligned' : 'opposed' },
    { id: id + '-cap', name: id + ' cap', type: 'coincident', suppressed: false, alignment: 'aligned',
      first: { ...assemblySceneFaceReference(cap(id, 12))!, support: 'plane' },
      second: { ...assemblySceneFaceReference(cap('plate', 4))!, support: 'plane' } })
  }
  input.mates = mates
  const base = validateAssemblyDocument(input), first = base.mates[0], second = base.mates[2]
  if (first.type !== 'concentric' || second.type !== 'concentric' || first.first.kind !== 'face' || second.first.kind !== 'face')
    throw new Error('Original bearing references missing')
  const session = new AssemblyWorkerSession()
  try {
    const initial = ready(session.prepare(base))
    const captured = ready(session.captureGear(base, initial.token, {
      first: structuredClone(first.first), second: structuredClone(second.first),
      carrier: { occurrencePath: ['plate'], definition: { id: 'example-plate', revision: 'r1' } },
      ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original scene-reuse gear',
    }))
    originalDocument = session.apply(base, captured.token).document
  } finally { session.discard() }
}, 60_000)

const fresh = () => validateAssemblyDocument(structuredClone(originalDocument))
function request(document: AssemblyDocument): AssemblyComponentMotion {
  const left = document.occurrences.find(value => value.id === 'left')!
  return { component: { occurrencePath: ['left'], definition: { ...left.definition } },
    translation: [...left.pose.translation], rotation: { axis: 2, angle: 4 * Math.PI } }
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function nativeReady(value: ReturnType<typeof solve.prepareAssemblyMotionPreview>): solve.AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function near(actual: number, expected: number, tolerance = 1e-8) {
  expect(Number.isFinite(actual)).toBe(true); expect(Math.abs(actual - expected)).toBeLessThan(tolerance)
}
function vector(actual: readonly number[], expected: readonly number[], tolerance = 1e-6) {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, index) => near(value, expected[index], tolerance))
}
function geometry(scene: AssemblyScene) {
  expect(scene.solidCount).toBe(3); expect(scene.prototypeCount).toBe(2); expect(scene.bodies).toHaveLength(3)
  near(scene.volume, 4800 + 45 * Math.PI / 2, 1e-5); near(scene.area, 2960 + 543 * Math.PI / 4, 1e-5)
  vector(scene.bounds!.min, [-20, -15, -8]); vector(scene.bounds!.max, [20, 15, 4])
  for (const body of scene.bodies) {
    expect(body.solidCount).toBe(1)
    if (body.component.definition.id !== 'example-pin') continue
    const x = body.component.occurrencePath[0] === 'left' ? -10 : 10
    vector(body.bounds.min, [x - 2, -2, -8]); vector(body.bounds.max, [x + 2, 2, 4])
    near(body.volume, 189 * Math.PI / 4, 1e-5); near(body.area, 495 * Math.PI / 8, 1e-5)
    const bore = body.faces.find(face => face.worldSupport?.kind === 'cylinder' && Math.abs(face.worldSupport.radius - .25) < 1e-9)
    if (bore?.worldSupport?.kind !== 'cylinder') throw new Error('Original eccentric bore missing')
    vector(bore.worldSupport.point.slice(0, 2), [x + 1, 0], 1e-8)
  }
}
const sceneData = ({ sceneId: _sceneId, ...value }: AssemblyScene) => value
const errors = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(errors)] : [error]

it('shares two native definitions through twelve stations and final scene without a render rebuild', () => {
  const input = fresh(), before = serializeAssemblyDocument(input), session = new AssemblyWorkerSession()
  const referenceBuild = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), renderBuild = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const preview = ready(session.moveMotion(input, request(input)))
    expect(referenceBuild).toHaveBeenCalledTimes(2); expect(renderBuild).not.toHaveBeenCalled()
    expect(preview.motion).toMatchObject({ stationCount: 12, verifiedStations: 12, sampledOnly: true, requestedAngle: 4 * Math.PI })
    near(preview.motion!.evaluatedAngle, 4 * Math.PI); expect(preview.checks).toHaveLength(5)
    expect(preview.checks.every(check => check.satisfied)).toBe(true)
    const gear = preview.document.mates.find(value => value.type === 'gear')!
    if (gear.type !== 'gear') throw new Error('Original captured gear missing')
    near(gear.angles.first, -4 * Math.PI); near(gear.angles.second, 2 * Math.PI)
    geometry(preview.scene)
    const conventional = sceneModule.buildAssemblyScene(preview.document)
    expect(renderBuild).toHaveBeenCalledTimes(2)
    expect(sceneData(preview.scene)).toEqual(sceneData(conventional))
    expect(preview.scene.sceneId).not.toBe(conventional.sceneId)
    const applied = session.apply(input, preview.token)
    expect(renderBuild).toHaveBeenCalledTimes(4) // Apply retains its independent scene construction.
    geometry(applied.scene); expect(() => session.apply(input, preview.token)).toThrow(/disponible/)
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { session.discard(); renderBuild.mockRestore(); referenceBuild.mockRestore() }
}, 60_000)

it('passes a detached deeply frozen final document and revokes every retained scene lease on return', () => {
  const input = fresh(), before = serializeAssemblyDocument(input)
  let parts: AssemblyScenePartProvider | undefined, leased: AssemblyScenePartSource | undefined, callbacks = 0
  let preview: solve.AssemblySolvePreview | undefined, scene: AssemblyScene | undefined
  try {
    preview = nativeReady(solve.prepareAssemblyMotionPreview(input, request(input), {}, (document, provider) => {
      callbacks++; parts = provider
      expect(document).not.toBe(input); expect(Object.isFrozen(document)).toBe(true)
      expect(Object.isFrozen(document.occurrences[0].pose.translation)).toBe(true)
      expect(Reflect.set(document, 'name', 'forged callback name')).toBe(false)
      expect(Reflect.set(document.occurrences[0].pose.translation, '0', 999)).toBe(false)
      const final = validateAssemblyDocument(document), pin = final.definitions.find(value => value.kind === 'part' && value.id === 'example-pin')!
      if (pin.kind !== 'part') throw new Error('Original part missing')
      leased = provider(pin); expect(leased).toBeDefined()
      scene = sceneModule.buildAssemblyScene(final, provider)
      return undefined
    }))
    expect(callbacks).toBe(1); geometry(scene!)
    const pin = input.definitions.find(value => value.kind === 'part' && value.id === 'example-pin')!
    if (pin.kind !== 'part') throw new Error('Original part missing')
    expect(() => parts!(pin)).toThrow(/ya no está vigente/)
    expect(() => leased!.inspection.readCurrentAssemblyPresentation()).toThrow(/ya no está vigente/)
    expect(() => leased!.inspection.copyCurrentBodyShape(leased!.bodies[0].body)).toThrow(/ya no está vigente/)
    expect(() => leased!.inspection.placeCurrentAssemblyBody(leased!.bodies[0].body, { translation: [0, 0, 0], rotation: [0, 0, 0, 1] })).toThrow(/ya no está vigente/)
    const history = new AssemblyDocumentHistory(input), applied = solve.applyAssemblySolvePreview(history, preview)
    expect(applied.name).toBe(input.name); vector(applied.occurrences[0].pose.translation, input.occurrences[0].pose.translation)
    expect(() => solve.applyAssemblySolvePreview(history, preview!)).toThrow()
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { if (preview) solve.discardAssemblySolvePreview(preview) }
}, 60_000)

it('does not invoke the scene callback after a later native station rejects', () => {
  const input = fresh(), before = serializeAssemblyDocument(input), actual = AssemblyGeometrySnapshot.prototype.resolveActiveMates
  const callback = vi.fn(() => undefined), failure = new Error('Original later-station sentinel')
  const resolve = vi.spyOn(AssemblyGeometrySnapshot.prototype, 'resolveActiveMates').mockImplementation(function (this: AssemblyGeometrySnapshot, document) {
    const values = actual.call(this, document)
    if (values.some(value => value.mate.type === 'gear' && Math.abs(value.mate.angles.first) > 1.1)) throw failure
    return values
  })
  try {
    const result = solve.prepareAssemblyMotionPreview(input, request(input), {}, callback)
    expect(result.status).toBe('rejected'); expect(callback).not.toHaveBeenCalled()
    if (result.status === 'rejected') expect(result.message).toMatch(/^Estación 2\/12:/)
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { resolve.mockRestore() }
}, 60_000)

it('rejects an asynchronous callback without leaving a live provider or modifying the base', () => {
  const input = fresh(), before = serializeAssemblyDocument(input)
  let parts: AssemblyScenePartProvider | undefined
  const callback = vi.fn(async (_document: unknown, provider: AssemblyScenePartProvider) => { parts = provider; return undefined })
  // This fulfilled promise starts no deferred work; rejection does not claim cancellation.
  expect(() => solve.prepareAssemblyMotionPreview(input, request(input), {},
    callback as unknown as NonNullable<Parameters<typeof solve.prepareAssemblyMotionPreview>[3]>)).toThrow()
  expect(callback).toHaveBeenCalledTimes(1)
  const pin = input.definitions.find(value => value.kind === 'part')!
  if (pin.kind !== 'part') throw new Error('Original part missing')
  expect(() => parts!(pin)).toThrow(/ya no está vigente/)
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('rejects a native engine constructor failure before invoking the final scene callback', () => {
  const input = fresh(), before = serializeAssemblyDocument(input), callback = vi.fn(() => undefined)
  const failure = new Error('Original motion engine constructor sentinel')
  const construct = vi.spyOn(engineModule, 'CadEngine').mockImplementation(function () { throw failure })
  try {
    const reply = solve.prepareAssemblyMotionPreview(input, request(input), {}, callback)
    expect(reply.status).toBe('rejected'); expect(callback).not.toHaveBeenCalled()
    if (reply.status === 'rejected') expect(reply.message).toContain(failure.message)
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { construct.mockRestore() }
}, 60_000)

it.each(['scene', 'pool', 'both'] as const)('publishes no capability and releases owners once when %s fails after final scene work', mode => {
  const input = fresh(), before = serializeAssemblyDocument(input), session = new AssemblyWorkerSession()
  const older = ready(session.prepare(input)), owners = new Set<CadEngine>(), releases = new Map<CadEngine, number>()
  const actualBuild = CadEngine.prototype.rebuildForAssemblyReferences, actualDispose = CadEngine.prototype.dispose
  const actualScene = sceneModule.buildAssemblyScene, actualMotion = solve.prepareAssemblyMotionPreview
  const sceneFailure = new Error('Original final motion scene sentinel'), cleanupFailure = new Error('Original final motion release sentinel')
  let sceneCompleted = false, injectedCleanup = false, native: ReturnType<typeof solve.prepareAssemblyMotionPreview> | undefined
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, ...args) {
    const value = actualBuild.apply(this, args); owners.add(this); return value
  })
  const dispose = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    actualDispose.call(this)
    if (owners.has(this)) {
      releases.set(this, (releases.get(this) ?? 0) + 1)
      if (mode !== 'scene' && !injectedCleanup) { injectedCleanup = true; throw cleanupFailure }
    }
  })
  const scene = vi.spyOn(sceneModule, 'buildAssemblyScene').mockImplementation((...args) => {
    const value = actualScene(...args); sceneCompleted = true
    if (mode !== 'pool') throw sceneFailure
    return value
  })
  const motion = vi.spyOn(solve, 'prepareAssemblyMotionPreview').mockImplementation((...args) => {
    native = actualMotion(...args); return native
  })
  try {
    let thrown: unknown, reply: AssemblyPreviewReply | undefined
    try { reply = session.moveMotion(input, request(input)) } catch (error) { thrown = error }
    expect(sceneCompleted).toBe(true); expect(scene).toHaveBeenCalledTimes(1)
    expect(owners.size).toBe(2); expect(releases.size).toBe(2); expect([...releases.values()]).toEqual([1, 1])
    if (mode === 'pool') {
      expect(thrown).toBeUndefined(); expect(reply?.status).toBe('rejected'); expect(native?.status).toBe('rejected')
      if (reply?.status === 'rejected') expect(reply.reason).toBe('reference')
      expect(reply && 'token' in reply).toBe(false)
    } else {
      expect(errors(thrown)).toContain(sceneFailure); expect(reply).toBeUndefined(); expect(native).toBeUndefined()
      if (mode === 'both') expect(errors(thrown)).toContain(cleanupFailure)
    }
    expect(() => session.apply(input, older.token)).toThrow(/disponible/)
    expect(() => session.apply(input, 'unpublished')).toThrow(/disponible/)
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { motion.mockRestore(); scene.mockRestore(); dispose.mockRestore(); build.mockRestore(); session.discard() }
}, 60_000)

it.each(['uuid', 'reply clone'] as const)('revokes native authority when %s fails after the shared owner has closed', stage => {
  const input = fresh(), before = serializeAssemblyDocument(input), session = new AssemblyWorkerSession()
  const older = ready(session.prepare(input)), owners = new Set<CadEngine>(), released = new Set<CadEngine>()
  const actualBuild = CadEngine.prototype.rebuildForAssemblyReferences, actualDispose = CadEngine.prototype.dispose
  const actualMotion = solve.prepareAssemblyMotionPreview, actualClone = globalThis.structuredClone, actualUuid = crypto.randomUUID.bind(crypto)
  const failure = new Error('Original motion publication sentinel')
  let native: ReturnType<typeof solve.prepareAssemblyMotionPreview> | undefined, injected = false
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, ...args) {
    const value = actualBuild.apply(this, args); owners.add(this); return value
  })
  const dispose = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    actualDispose.call(this); if (owners.has(this)) released.add(this)
  })
  const motion = vi.spyOn(solve, 'prepareAssemblyMotionPreview').mockImplementation((...args) => {
    native = actualMotion(...args); return native
  })
  const failAfterClose = () => { expect(owners.size).toBe(2); expect(released.size).toBe(2); injected = true; throw failure }
  const uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    // The scene ID is created while the motion call is still running; only the
    // later session token is reached after the ready native result returns.
    if (stage === 'uuid' && native?.status === 'ready') failAfterClose()
    return actualUuid()
  })
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation((value, options) => {
    if (stage === 'reply clone' && native?.status === 'ready' && value === native.scopes) failAfterClose()
    return actualClone(value, options)
  })
  try {
    expect(() => session.moveMotion(input, request(input))).toThrow(failure); expect(injected).toBe(true)
    // Remove injected publication faults before checking actual authority, so a
    // second injected exception cannot make a wrongly live capability pass.
    clone.mockRestore(); uuid.mockRestore()
    expect(() => session.apply(input, older.token)).toThrow(/disponible/)
    if (native?.status !== 'ready') throw new Error('Original ready native candidate missing')
    expect(() => solve.applyAssemblySolvePreview(new AssemblyDocumentHistory(input), native as solve.AssemblySolvePreview)).toThrow()
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { clone.mockRestore(); uuid.mockRestore(); motion.mockRestore(); dispose.mockRestore(); build.mockRestore(); session.discard() }
}, 60_000)

it('reconstructs same-ID same-revision changed source content on the next motion request', () => {
  const input = fresh(); input.mates = []
  const session = new AssemblyWorkerSession(), referenceBuild = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  const renderBuild = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const first = ready(session.moveMotion(input, request(input)))
    expect(referenceBuild).toHaveBeenCalledTimes(2); geometry(first.scene)
    const changed = validateAssemblyDocument(input), pin = changed.definitions.find(value => value.id === 'example-pin')!
    if (pin.kind !== 'part') throw new Error('Original pin missing')
    const sketch = pin.document.features[0]
    if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw new Error('Original circular profile missing')
    sketch.profile.radius = 2.5
    const before = serializeAssemblyDocument(changed), second = ready(session.moveMotion(changed, request(changed)))
    expect(referenceBuild).toHaveBeenCalledTimes(4); expect(renderBuild).not.toHaveBeenCalled()
    near(second.scene.volume, 4800 + 153 * Math.PI / 2, 1e-5)
    expect(second.motion).toMatchObject({ stationCount: 12, verifiedStations: 12 })
    expect(() => session.apply(input, first.token)).toThrow(/disponible/)
    expect(serializeAssemblyDocument(changed)).toBe(before)
  } finally { session.discard(); renderBuild.mockRestore(); referenceBuild.mockRestore() }
}, 60_000)
