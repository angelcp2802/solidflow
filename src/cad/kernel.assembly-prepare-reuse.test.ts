import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyFaceReference, type AssemblyMate } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { CadEngine } from './kernel.engine'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyPreviewReply, type AssemblyScene, type AssemblySceneFace } from './kernel.assembly-types'
import * as solve from './kernel.assembly-solve'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

// Original public plate/two-pin fixture. Four native cylindrical/planar mates
// leave one free rotation on each pin. Literal placements need no solver oracle.
function fixture(): AssemblyDocument {
  const input = createAssemblyExample()
  input.occurrences[1].pose = { translation: [-10, 0, -8], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  input.occurrences[2].pose = { ...identityRigidPose(), translation: [10, 0, -8] }
  const scene = buildAssemblyScene(input)
  const faces = (id: string) => scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces
  const cylinder = (id: string, radius: number, x: number) => faces(id).find(face => face.support?.kind === 'cylinder'
    && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9)!
  const cap = (id: string, z: number) => faces(id).find(face => face.support?.kind === 'plane'
    && Math.abs(face.support.point[2] - z) < 1e-9 && face.support.normal[2] > .99)!
  const reference = (face: AssemblySceneFace) => assemblySceneFaceReference(face)! as AssemblyFaceReference
  const mates: AssemblyMate[] = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const pin = cylinder(id, 2, 0), hole = cylinder('plate', 3, x)
    if (pin.support?.kind !== 'cylinder' || hole.support?.kind !== 'cylinder') throw new Error('Original native cylinders missing')
    mates.push({ id: id + '-axis', name: id + ' axis', type: 'concentric', suppressed: false, rotationLock: null,
      alignment: pin.support.axis[2] * hole.support.axis[2] > 0 ? 'aligned' : 'opposed',
      first: reference(pin) as AssemblyFaceReference & { support: 'axis' }, second: reference(hole) as AssemblyFaceReference & { support: 'axis' } },
    { id: id + '-cap', name: id + ' cap', type: 'coincident', suppressed: false, alignment: 'aligned',
      first: reference(cap(id, 12)) as AssemblyFaceReference & { support: 'plane' }, second: reference(cap('plate', 4)) as AssemblyFaceReference & { support: 'plane' } })
  }
  input.mates = mates
  return validateAssemblyDocument(input)
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-6) {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThan(tolerance))
}
function geometricOracle(scene: AssemblyScene) {
  expect(scene.solidCount).toBe(3); expect(scene.prototypeCount).toBe(2); expect(scene.bodies).toHaveLength(3)
  expect(Math.abs(scene.volume - (4800 + 45 * Math.PI / 2))).toBeLessThan(1e-5)
  expect(Math.abs(scene.area - (2960 + 543 * Math.PI / 4))).toBeLessThan(1e-5)
  near(scene.bounds!.min, [-20, -15, -8]); near(scene.bounds!.max, [20, 15, 4])
  for (const body of scene.bodies) {
    expect(body.solidCount).toBe(1)
    if (body.component.definition.id === 'example-pin') {
      const x = body.component.occurrencePath[0] === 'left' ? -10 : 10
      near(body.bounds.min, [x - 2, -2, -8]); near(body.bounds.max, [x + 2, 2, 4])
      expect(Math.abs(body.volume - 189 * Math.PI / 4)).toBeLessThan(1e-5)
      expect(Math.abs(body.area - 495 * Math.PI / 8)).toBeLessThan(1e-5)
      const bore = body.faces.find(face => face.worldSupport?.kind === 'cylinder' && Math.abs(face.worldSupport.radius - .25) < 1e-9)!
      near(bore.worldSupport!.point.slice(0, 2), x < 0 ? [-10, 1] : [11, 0], 1e-8)
    }
  }
}
const sceneData = ({ sceneId: _sceneId, ...scene }: AssemblyScene) => scene
const errors = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(errors)] : [error]

it('constructs each local part once for ordinary Solve plus scene, preserving exact meshes and independent geometry', () => {
  const input = fixture(), before = serializeAssemblyDocument(input), conventional = buildAssemblyScene(input)
  const nativeBuild = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), renderBuild = vi.spyOn(CadEngine.prototype, 'build')
  const session = new AssemblyWorkerSession()
  try {
    const first = ready(session.prepare(input))
    expect(nativeBuild).toHaveBeenCalledTimes(2); expect(renderBuild).not.toHaveBeenCalled()
    expect(first.checks).toHaveLength(4)
    const result = first.scopes.at(-1)!.result
    expect(result.localDOF).toBe(2); expect(result.rank).toBe(10); expect(result.iterations).toBe(0)
    geometricOracle(first.scene)
    expect(sceneData(first.scene)).toEqual(sceneData(conventional))
    expect(serializeAssemblyDocument(first.document)).toBe(before); expect(serializeAssemblyDocument(input)).toBe(before)
    const second = ready(session.prepare(input))
    expect(nativeBuild).toHaveBeenCalledTimes(4); expect(renderBuild).not.toHaveBeenCalled()
    expect(sceneData(second.scene)).toEqual(sceneData(first.scene)); expect(second.scene.sceneId).not.toBe(first.scene.sceneId)
    expect(() => session.apply(input, first.token)).toThrow(/disponible/)
    const applied = session.apply(input, second.token)
    expect(renderBuild).toHaveBeenCalledTimes(2) // Apply deliberately retains its independent scene path.
    geometricOracle(applied.scene); expect(serializeAssemblyDocument(applied.document)).toBe(before)
    expect(() => session.apply(input, second.token)).toThrow(/disponible/)
  } finally { session.discard(); nativeBuild.mockRestore(); renderBuild.mockRestore() }
}, 60_000)

it('never reuses the previous request geometry after same-ID/same-revision feature changes', () => {
  const input = fixture(); input.mates = []
  const session = new AssemblyWorkerSession(), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences')
  try {
    geometricOracle(ready(session.prepare(input)).scene)
    const changed = structuredClone(input), pin = changed.definitions.find(value => value.id === 'example-pin')!
    if (pin.kind !== 'part') throw new Error('Original part missing')
    const sketch = pin.document.features[0]
    if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw new Error('Original circle missing')
    sketch.profile.radius = 2.5
    const before = serializeAssemblyDocument(changed), value = ready(session.prepare(changed))
    expect(build).toHaveBeenCalledTimes(4)
    expect(Math.abs(value.scene.volume - (4800 + 153 * Math.PI / 2))).toBeLessThan(1e-5)
    expect(serializeAssemblyDocument(changed)).toBe(before)
  } finally { session.discard(); build.mockRestore() }
}, 60_000)

it('revokes a ready native solve when final shared-owner release fails after scene construction', () => {
  const input = fixture(), session = new AssemblyWorkerSession(), owners = new Set<CadEngine>(), releases = new Map<CadEngine, number>()
  const actualBuild = CadEngine.prototype.rebuildForAssemblyReferences, actualDispose = CadEngine.prototype.dispose, actualSolve = solve.prepareAssemblySolve
  const failure = new Error('Original final shared-owner release sentinel')
  let native: ReturnType<typeof solve.prepareAssemblySolve> | undefined, injected = false
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, ...args) {
    const result = actualBuild.apply(this, args); owners.add(this); return result
  })
  const prepared = vi.spyOn(solve, 'prepareAssemblySolve').mockImplementation((...args) => { native = actualSolve(...args); return native })
  const presentation = vi.spyOn(CadEngine.prototype, 'readCurrentAssemblyPresentation')
  const dispose = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    actualDispose.call(this)
    if (owners.has(this)) {
      releases.set(this, (releases.get(this) ?? 0) + 1)
      if (!injected) { injected = true; throw failure }
    }
  })
  try {
    let thrown: unknown
    try { session.prepare(input) } catch (error) { thrown = error }
    expect(errors(thrown)).toContain(failure); expect(native?.status).toBe('ready'); expect(presentation).toHaveBeenCalledTimes(2)
    expect(owners.size).toBe(2); expect([...releases.values()]).toEqual([1, 1])
    expect(() => session.apply(input, 'unpublished')).toThrow(/disponible/)
    if (native?.status !== 'ready') throw new Error('Original ready native candidate missing')
    expect(() => solve.applyAssemblySolvePreview(new AssemblyDocumentHistory(input), native! as solve.AssemblySolvePreview)).toThrow()
  } finally { session.discard(); dispose.mockRestore(); presentation.mockRestore(); prepared.mockRestore(); build.mockRestore() }
}, 60_000)

it('does not store a session token when reply cloning fails after all shared owners close', () => {
  const input = fixture(), session = new AssemblyWorkerSession(), actualSolve = solve.prepareAssemblySolve, originalClone = globalThis.structuredClone
  const failure = new Error('Original reply clone sentinel'), owners = new Set<CadEngine>(), released = new Set<CadEngine>()
  const actualBuild = CadEngine.prototype.rebuildForAssemblyReferences, actualDispose = CadEngine.prototype.dispose
  let native: ReturnType<typeof solve.prepareAssemblySolve> | undefined, unpublishedToken: string | undefined
  const build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function (this: CadEngine, ...args) {
    const result = actualBuild.apply(this, args); owners.add(this); return result
  })
  const dispose = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    actualDispose.call(this); if (owners.has(this)) released.add(this)
  })
  const prepared = vi.spyOn(solve, 'prepareAssemblySolve').mockImplementation((...args) => { native = actualSolve(...args); return native })
  const originalUuid = crypto.randomUUID.bind(crypto), uuid = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    const value = originalUuid(); if (owners.size === 2 && released.size === 2) unpublishedToken = value; return value
  })
  const clone = vi.spyOn(globalThis, 'structuredClone').mockImplementation((value, options) => {
    if (native?.status === 'ready' && value === native.scopes) {
      expect(released.size).toBe(2); throw failure
    }
    return originalClone(value, options)
  })
  try {
    expect(() => session.prepare(input)).toThrow(failure); expect(unpublishedToken).toBeDefined()
    expect(() => session.apply(input, unpublishedToken!)).toThrow(/disponible/)
    if (native?.status !== 'ready') throw new Error('Original ready native candidate missing')
    expect(() => solve.applyAssemblySolvePreview(new AssemblyDocumentHistory(input), native! as solve.AssemblySolvePreview)).toThrow()
  } finally { clone.mockRestore(); uuid.mockRestore(); prepared.mockRestore(); dispose.mockRestore(); build.mockRestore(); session.discard() }
}, 60_000)
