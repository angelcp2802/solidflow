import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import type { AssemblyTranslationRequest } from '../model/assemblyTranslation'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference } from './kernel.assembly-types'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import { applyAssemblySolvePreview, discardAssemblySolvePreview, prepareAssemblySolve, prepareAssemblyTranslationPreview,
  prepareAssemblyWorldMovePreview, type AssemblySolvePreview } from './kernel.assembly-solve'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import * as tracing from './kernel.assembly-translation'
import * as translationModel from '../model/assemblyTranslation'

let original: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  original = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-translation-original.json', import.meta.url), 'utf8'))
}, 60_000)
const near = (a: number, b: number, tolerance = 1e-5) => expect(Math.abs(a - b)).toBeLessThan(tolerance)
const request = (base: AssemblyDocument, x = 20): AssemblyTranslationRequest => ({
  component: { occurrencePath: ['slider'], definition: { ...base.occurrences[0].definition } }, translation: [x, 0, 0] })
function ready(value: ReturnType<typeof prepareAssemblyTranslationPreview>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function nativeBase(): AssemblyDocument {
  const base = validateAssemblyDocument(original), scene = buildAssemblyScene(base)
  const bottoms = scene.bodies.find(body => body.component.occurrencePath[0] === 'slider')!.faces.filter(face =>
    face.support?.kind === 'plane' && face.support.normal[2] < -.99 && Math.abs(face.support.point[2]) < 1e-10)
  expect(bottoms).toHaveLength(1)
  const bottom = assemblySceneFaceReference(bottoms[0])
  if (!bottom || bottom.support !== 'plane' || base.mates[0].type !== 'coincident') throw new Error('Actual native bottom required')
  // Real exact BRep bottom, selected from the current scene. The perpendicular
  // component principal plane is a separate native-snapshot reference.
  base.mates[0] = { ...base.mates[0], first: { ...bottom, support: 'plane' }, alignment: 'opposed' }
  return validateAssemblyDocument(base)
}

it('stops a genuinely mated slider before a thin obstacle even though both endpoint solids are clear', () => {
  const base = nativeBase(), before = serializeAssemblyDocument(base), target = request(base)
  const unrestricted = ready(prepareAssemblyWorldMovePreview(base, { component: target.component,
    pose: { translation: target.translation, rotation: [0, 0, 0, 1] } }))
  expect(analyzeAssemblyInterference(base, { clearance: 0 }).pairs).toEqual([])
  expect(analyzeAssemblyInterference(validateAssemblyDocument(unrestricted.document), { clearance: 0 }).pairs).toEqual([])
  discardAssemblySolvePreview(unrestricted)
  const preview = ready(prepareAssemblyTranslationPreview(base, target)), witness = preview.translation!
  expect(witness.trace.status).toBe('stopped'); expect(witness.trace.queryCount).toBeGreaterThan(2)
  // Cube right edge starts at2; obstacle left edge10-.25=9.75. Exact
  // geometric first contact is x7.75; the numerical stop retains a small gap.
  const x = preview.document.occurrences[0].pose.translation[0]
  expect(x).toBeLessThan(7.75); near(x, 7.75); near(witness.trace.fraction, 7.75 / 20)
  expect(witness.trace.blockingPair?.minimumDistance).toBeGreaterThan(witness.trace.blockingPair!.band)
  expect(witness.trace.blockingPair!.minimumDistance - witness.trace.blockingPair!.band).toBeLessThanOrEqual(1e-6)
  expect(witness.requestedPose.translation).toEqual([20, 0, 0]); near(witness.resolvedPose.translation[0], x)
  expect(preview.checks).toHaveLength(2); expect(preview.checks.every(check => check.satisfied)).toBe(true)
  expect(preview.scopes.at(-1)!.result.localDOF).toBe(1); expect(preview.scopes.every(scope => !scope.temporaryAnchor)).toBe(true)
  expect(preview.movement).toBeUndefined(); expect(preview.projection).toBeUndefined()
  expect(preview.document.mates).toEqual(base.mates); expect(preview.document.definitions).toEqual(base.definitions)
  expect(serializeAssemblyDocument(base)).toBe(before)
  const scene = buildAssemblyScene(validateAssemblyDocument(preview.document))
  near(scene.volume, 96, 1e-7); near(scene.area, 240, 1e-7); expect(scene.solidCount).toBe(2)
  expect(analyzeAssemblyInterference(validateAssemblyDocument(preview.document), { clearance: 0 }).pairs).toEqual([])
  discardAssemblySolvePreview(preview)
}, 60_000)

it('completes a clear target and honors a requested quarter-millimeter clearance before the obstacle', () => {
  const base = nativeBase(), clear = ready(prepareAssemblyTranslationPreview(base, request(base, -5)))
  expect(clear.translation!.trace.status).toBe('complete'); near(clear.document.occurrences[0].pose.translation[0], -5, 1e-7)
  discardAssemblySolvePreview(clear)
  const gap = ready(prepareAssemblyTranslationPreview(base, request(base), { clearance: .25 }))
  expect(gap.translation!.clearance).toBe(.25); near(gap.document.occurrences[0].pose.translation[0], 7.5)
  expect(gap.translation!.trace.blockingPair!.minimumDistance).toBeGreaterThan(.25)
  discardAssemblySolvePreview(gap)
}, 60_000)

it('authenticates one stopped history transaction, rejects copies and round-trips the real placement without persisting diagnostics', () => {
  const base = nativeBase(), history = new AssemblyDocumentHistory(base), preview = ready(prepareAssemblyTranslationPreview(base, request(base)))
  expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow(/verificada|consumi/)
  const applied = applyAssemblySolvePreview(history, preview), bytes = serializeAssemblyDocument(applied)
  near(applied.occurrences[0].pose.translation[0], 7.75)
  expect(parseAssemblyDocument(bytes)).toEqual(applied); expect('translation' in applied).toBe(false)
  expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied)
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow(/verificada|consumi/)
}, 60_000)

it('publishes a genuine worker capability bound to the original base and not mutable response poses', () => {
  const base = nativeBase(), session = new AssemblyWorkerSession(), old = session.prepare(base)
  if (old.status !== 'ready') throw new Error(old.message)
  const reply = session.handle({ id: 91, action: 'translate-assembly-until-contact', current: base, translation: request(base) })
  if (!reply || reply.kind !== 'assembly-preview' || reply.status !== 'ready') throw new Error('Actual stopped worker preview required')
  expect(reply.translation?.trace.status).toBe('stopped'); expect(() => session.apply(base, old.token)).toThrow(/disponible/)
  reply.document.occurrences[0].pose.translation[0] = 1234
  reply.translation!.trace.fraction = 1
  const applied = session.apply(base, reply.token)
  near(applied.document.occurrences[0].pose.translation[0], 7.75); near(applied.scene.volume, 96, 1e-7)
  expect(() => session.apply(base, reply.token)).toThrow(/disponible/)
}, 60_000)

it('rejects initial relative contact, an exhausted query budget and an incompatible endpoint without publishing partial motion', () => {
  const base = nativeBase(), touching = validateAssemblyDocument(base); touching.occurrences[0].pose.translation[0] = 7.75
  for (const [input, intent, options] of [
    [touching, request(touching), {}], [base, request(base), { maxQueries: 1 }],
    [base, { ...request(base), translation: [20, 1, 0] }, {}],
  ] as const) {
    const before = serializeAssemblyDocument(input), result = prepareAssemblyTranslationPreview(input, intent as AssemblyTranslationRequest, options)
    expect(result.status).toBe('rejected'); expect('translation' in result).toBe(false); expect('document' in result).toBe(false)
    expect(serializeAssemblyDocument(input)).toBe(before)
  }
}, 60_000)

it('requires a solved initial model and keeps a failed worker request from reviving its old token', () => {
  const base = nativeBase(), unsolved = validateAssemblyDocument(base); unsolved.occurrences[0].pose.translation[1] = 1
  const result = prepareAssemblyTranslationPreview(unsolved, request(unsolved))
  expect(result.status).toBe('rejected')
  if (result.status === 'rejected') expect(result.reason).toBe('verification')
  const session = new AssemblyWorkerSession(), old = session.prepare(base)
  if (old.status !== 'ready') throw new Error(old.message)
  expect(session.translateUntilContact(base, request(base), { maxQueries: 1 }).status).toBe('rejected')
  expect(() => session.apply(base, old.token)).toThrow(/disponible/)
}, 60_000)

it('withholds authority on a causal native tracing failure and preserves the source', () => {
  const base = nativeBase(), before = serializeAssemblyDocument(base)
  const fault = vi.spyOn(tracing, 'traceAssemblyTranslation').mockImplementationOnce(() => { throw new Error('Original native trace/release fault') })
  try {
    const result = prepareAssemblyTranslationPreview(base, request(base))
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.message).toMatch(/native trace\/release fault/)
    expect('document' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { fault.mockRestore() }
})

it('rejects Apply after the source changes and Cancel revokes the native stop capability', () => {
  const base = nativeBase(), preview = ready(prepareAssemblyTranslationPreview(base, request(base))), changed = validateAssemblyDocument(base)
  changed.name += ' changed'
  expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(changed), preview)).toThrow(/documento cambió/)
  discardAssemblySolvePreview(preview)
  expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(base), preview)).toThrow(/verificada|consumi/)
}, 60_000)

it('rechecks the requested endpoint after rotation restoration instead of trusting the previous target witness', () => {
  const base = nativeBase(), originalPlan = translationModel.prepareAssemblyTranslationPath
  // Controlled corrupted-plan fault: actual BRep/mate checks still run. This
  // tests endpoint binding, not successful motion or geometry from the fault.
  const fault = vi.spyOn(translationModel, 'prepareAssemblyTranslationPath').mockImplementationOnce((...args) => {
    const path = originalPlan(...args); path.target.occurrences[0].pose.translation[0] += .01; return path
  })
  try {
    const result = prepareAssemblyTranslationPreview(base, request(base))
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.message).toMatch(/rotaciones originales desvía/)
    expect('document' in result).toBe(false)
  } finally { fault.mockRestore() }
})
