import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { validateDocument } from '../model/document'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { AssemblyDirectedAngleRequest, AssemblyDirectedAngleReport } from '../model/assemblyDirectedAngle'
import { identityRigidPose, type Quaternion } from '../model/rigidPose'
import { measureAssemblyDirectedAngleNative } from './kernel.assembly-angle-measurement'
import { assemblySceneEdgeReference, assemblySceneFaceReference, type AssemblyPreviewReply } from './kernel.assembly-types'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'
import { KernelDispatcher } from './kernel.dispatcher'
import type { Feature, Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const S = Math.SQRT1_2, RY90: Quaternion = [0, S, 0, S], RZ90: Quaternion = [0, 0, S, S], RX90: Quaternion = [S, 0, 0, S]
const rz120ry90: Quaternion = [-Math.sqrt(3) * S / 2, S / 2, Math.sqrt(3) * S / 2, S / 2]
const near = (actual: number, expected: number, tolerance = 1e-8) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const vector = (actual: Vec3, expected: Vec3) => actual.forEach((value, axis) => near(value, expected[axis]))
function features(): Feature[] { return [
  { id: 'box-profile', name: 'Original 10 by 6 rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 } },
  { id: 'box', name: 'Original box', type: 'extrude', sketchId: 'box-profile', depth: 4, symmetric: false, suppressed: false,
    bodyOperation: { mode: 'new', bodyId: 'box-body' } },
  { id: 'cylinder-profile', name: 'Original separate circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [10, 0], radius: 2 } },
  { id: 'cylinder', name: 'Original cylinder', type: 'extrude', sketchId: 'cylinder-profile', depth: 4, symmetric: false, suppressed: false,
    bodyOperation: { mode: 'new', bodyId: 'cylinder-body' } },
] }
function occurrence(id: string, rotation: Quaternion = [0, 0, 0, 1]): AssemblyOccurrence {
  return { id, name: id, definition: { id: 'original-angular-solid', revision: 'r1' },
    pose: { translation: [0, 0, 0], rotation }, fixed: true, visible: true, suppressed: false }
}
function fixture(): AssemblyDocument {
  const document = createEmptyAssembly('Original native circular-angle measurement'), stamp = document.createdAt
  document.definitions = [{ kind: 'part', id: 'original-angular-solid', revision: 'r1', document: validateDocument({ version: 1,
    id: 'original-angular-solid', name: 'Original separate box and cylinder', units: 'mm', createdAt: stamp, updatedAt: stamp, features: features() }) }]
  document.occurrences = [occurrence('first', RY90), occurrence('second', rz120ry90), occurrence('guide')]
  return validateAssemblyDocument(document)
}
function request(document: AssemblyDocument): AssemblyDirectedAngleRequest {
  const scene = buildAssemblyScene(document), body = (id: string, bodyId: string) => scene.bodies.find(value => value.component.occurrencePath[0] === id && value.body?.bodyId === bodyId)!
  const first = body('first', 'box-body').faces.find(value => value.support?.kind === 'plane' && value.support.normal[2] > .99)!
  const second = body('second', 'box-body').edges!.find(value => value.support?.kind === 'line' && value.support.axis[2] > .99)!
  const guide = body('guide', 'cylinder-body').faces.find(value => value.support?.kind === 'cylinder')!
  if (guide.support?.kind !== 'cylinder') throw new Error('Original native cylinder missing')
  // This actual original extrusion exposes its native geometric axis as -Z;
  // the expectation is not chosen or flipped by the angle under test.
  vector(guide.support.axis, [0, 0, -1])
  return { scopePath: [], first: assemblySceneFaceReference(first)!, second: assemblySceneEdgeReference(second)!, guide: assemblySceneFaceReference(guide)! }
}
function ready(value: unknown): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  const preview = value as AssemblyPreviewReply
  expect(preview.kind).toBe('assembly-preview'); expect(preview.status).toBe('ready')
  if (preview.status !== 'ready') throw new Error(preview.message)
  return preview
}

it('measures native plane/LINE/cylinder directions as 240 degrees rather than the principal 120', () => {
  const document = fixture(), input = request(document), before = serializeAssemblyDocument(document), report = measureAssemblyDirectedAngleNative(document, input)
  near(report.angleDegrees, 240); expect(report.coordinate).toBe('directed-about-axis')
  expect([report.firstKind, report.secondKind, report.guideKind]).toEqual(['plane', 'line', 'cylinder'])
  vector(report.firstDirection, [1, 0, 0]); vector(report.secondDirection, [-.5, Math.sqrt(3) / 2, 0]); vector(report.guideDirection, [0, 0, -1])
  near(report.projectionLengths.first, 1); near(report.projectionLengths.second, 1); expect(report.angleToleranceRadians).toBe(1e-8)
  expect('token' in report).toBe(false); expect('document' in report).toBe(false); expect(report.supportOnly).toBe(true)
  report.scopePath.push('outside'); report.firstDirection[0] = 999
  if (!report.first.component) throw new Error('Original first component missing')
  report.first.component.occurrencePath[0] = 'outside'
  expect(input.scopePath).toEqual([]); expect(input.first.component?.occurrencePath).toEqual(['first'])
  expect(serializeAssemblyDocument(document)).toBe(before)
  const scene = buildAssemblyScene(document)
  near(scene.volume, 3 * (240 + 16 * Math.PI), 1e-6); near(scene.area, 3 * (248 + 24 * Math.PI), 1e-6); expect(scene.solidCount).toBe(6)
})

it('reverses endpoint order and the moving native guide independently', () => {
  const document = fixture(), original = request(document)
  near(measureAssemblyDirectedAngleNative(document, { ...original, first: original.second, second: original.first }).angleDegrees, 120)
  document.occurrences[2].pose.rotation = [1, 0, 0, 0]
  const report = measureAssemblyDirectedAngleNative(document, original)
  near(report.angleDegrees, 120); vector(report.guideDirection, [0, 0, 1])
})

it('reports projected oblique directions without inventing an axis guide or modifying the part', () => {
  const document = fixture(), input = request(document), half = Math.PI / 8
  document.occurrences[0].pose.rotation = [0, Math.sin(half), 0, Math.cos(half)]
  const before = serializeAssemblyDocument(document), report = measureAssemblyDirectedAngleNative(document, input)
  vector(report.firstDirection, [S, 0, S]); near(report.projectionLengths.first, S); near(report.projectionLengths.second, 1); near(report.angleDegrees, 240)
  expect(serializeAssemblyDocument(document)).toBe(before)
})

it('admits two small native projections when their composed directional precision remains adequate', () => {
  const document = fixture(), input = request(document), half = .001 / 2, sine = Math.sin(half), cosine = Math.cos(half)
  document.occurrences[0].pose.rotation = [0, sine, 0, cosine]
  document.occurrences[1].pose.rotation = [-Math.sqrt(3) * sine / 2, sine / 2, Math.sqrt(3) * cosine / 2, cosine / 2]
  const report = measureAssemblyDirectedAngleNative(document, input)
  near(report.projectionLengths.first, Math.sin(.001)); near(report.projectionLengths.second, Math.sin(.001)); near(report.angleDegrees, 240)
})

it.each(['first', 'second', 'guide'] as const)('rejects a stale %s tuple and never repairs it by its name', side => {
  const document = fixture(), input = request(document), reference = input[side]
  if (!reference.component) throw new Error('Original source component missing')
  reference.component.definition.revision = 'obsolete'
  expect(() => measureAssemblyDirectedAngleNative(document, input)).toThrow(/revisión/)
})

it('rejects a suppressed guide, a part used as scope and a degenerate projection without changing input', () => {
  const document = fixture(), input = request(document), before = serializeAssemblyDocument(document)
  const hidden = structuredClone(document); hidden.occurrences[2].suppressed = true
  expect(() => measureAssemblyDirectedAngleNative(hidden, input)).toThrow(/suprimida/)
  expect(() => measureAssemblyDirectedAngleNative(document, { ...input, scopePath: ['first'] })).toThrow(/ámbito/)
  const degenerate = structuredClone(document); degenerate.occurrences[0].pose = identityRigidPose()
  expect(() => measureAssemblyDirectedAngleNative(degenerate, input)).toThrow()
  expect(serializeAssemblyDocument(document)).toBe(before)
})

it('preserves a circular measurement under noncommuting nested scopes and keeps reused expansions distinct', () => {
  const source = fixture(), input = request(source), inner: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-angle-inner', revision: 'r1',
    name: 'Original inner', createdAt: source.createdAt, updatedAt: source.updatedAt, occurrences: source.occurrences, mates: [] },
    innerOccurrence: AssemblyOccurrence = { id: 'inner', name: 'Original inner occurrence', definition: { id: inner.id, revision: inner.revision },
      pose: { translation: [10, 0, 0], rotation: RZ90 }, fixed: true, suppressed: false, visible: true },
    outer: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-angle-outer', revision: 'r1', name: 'Original outer',
      createdAt: source.createdAt, updatedAt: source.updatedAt, occurrences: [innerOccurrence], mates: [] }
  source.definitions.push(inner, outer)
  source.occurrences = [['left', RY90], ['right', RX90]].map(([id, rotation]) => ({ id: id as string, name: id as string,
    definition: { id: outer.id, revision: outer.revision }, pose: { translation: [0, 20, 0], rotation: rotation as Quaternion }, fixed: true, suppressed: false, visible: true }))
  const document = validateAssemblyDocument(source), before = serializeAssemblyDocument(document)
  const left = measureAssemblyDirectedAngleNative(document, { ...input, scopePath: ['left', 'inner'] })
  near(left.angleDegrees, 240); vector(left.firstDirection, [0, 1, 0]); vector(left.secondDirection, [0, -.5, Math.sqrt(3) / 2]); vector(left.guideDirection, [-1, 0, 0])
  const right = measureAssemblyDirectedAngleNative(document, { ...input, scopePath: ['right', 'inner'] })
  near(right.angleDegrees, 240); vector(right.firstDirection, [0, 0, 1]); vector(right.secondDirection, [-Math.sqrt(3) / 2, 0, -.5]); vector(right.guideDirection, [0, 1, 0])
  expect(left.scopePath).toEqual(['left', 'inner']); expect(right.scopePath).toEqual(['right', 'inner'])
  expect(serializeAssemblyDocument(document)).toBe(before)
  const reopened = parseAssemblyDocument(before); near(measureAssemblyDirectedAngleNative(reopened, { ...input, scopePath: left.scopePath }).angleDegrees, 240)
  const scene = buildAssemblyScene(document); expect(scene.solidCount).toBe(12)
  near(scene.volume, 6 * (240 + 16 * Math.PI), 1e-6); near(scene.area, 6 * (248 + 24 * Math.PI), 1e-6)
})

it('preserves an authentic pending Apply through successful and rejected measurement requests', () => {
  const document = fixture(), input = request(document), dispatcher = new KernelDispatcher()
  try {
    const preview = ready(dispatcher.handle({ id: 1, action: 'preview-assembly', current: document, proposed: document }))
    const report = dispatcher.handle({ id: 2, action: 'measure-assembly-directed-angle', current: document, request: input }) as AssemblyDirectedAngleReport
    near(report.angleDegrees, 240)
    expect(() => dispatcher.handle({ id: 3, action: 'measure-assembly-directed-angle', current: document, request: { ...input, guide: input.first } })).toThrow()
    const applied = dispatcher.handle({ id: 4, action: 'apply-assembly', current: document, token: preview.token })
    expect(applied && 'kind' in applied && applied.kind).toBe('assembly-applied')
    expect(() => dispatcher.handle({ id: 5, action: 'apply-assembly', current: document, token: preview.token })).toThrow(/disponible/)
  } finally { dispatcher.dispose() }
})

it('does not dispose the current part engine while querying assembly directions', () => {
  const document = fixture(), input = request(document), dispatcher = new KernelDispatcher()
  try {
    dispatcher.handle({ id: 1, action: 'build', features: features() })
    dispatcher.handle({ id: 2, action: 'measure-assembly-directed-angle', current: document, request: input })
    expect(dispatcher.handle({ id: 3, action: 'export', format: 'stl' })).toBeInstanceOf(Blob)
  } finally { dispatcher.dispose() }
})

it.each([false, true])('withholds a report after real native disposal failure with primary projection rejection=%s', rejected => {
  const document = fixture(), input = request(document), before = serializeAssemblyDocument(document), cleanup = new Error('Original post-release fault'),
    original = AssemblyGeometrySnapshot.prototype.dispose
  const spy = vi.spyOn(AssemblyGeometrySnapshot.prototype, 'dispose').mockImplementation(function(this: AssemblyGeometrySnapshot) { original.call(this); throw cleanup })
  try {
    let result: unknown, failure: unknown
    try { result = measureAssemblyDirectedAngleNative(document, rejected ? { ...input, guide: input.first } : input) } catch (error) { failure = error }
    expect(result).toBeUndefined(); expect(failure).toBeInstanceOf(NativeCleanupError)
    const errors = (failure as AggregateError).errors
    expect(errors).toContain(cleanup); expect(errors).toHaveLength(rejected ? 2 : 1); expect(spy).toHaveBeenCalledTimes(1)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { spy.mockRestore() }
  near(measureAssemblyDirectedAngleNative(document, input).angleDegrees, 240)
})
