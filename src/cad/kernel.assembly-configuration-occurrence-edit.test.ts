import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { createAssemblyConfiguredDocument, parseAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import type { AssemblyConfiguredOccurrenceEdit } from '../model/assemblyConfiguredOccurrenceEditing'
import { createEmptyAssembly } from '../examples/assembly'
import { ConfiguredAssemblyWorkerSession, type ConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-session'
import * as scenes from './kernel.assembly-configuration-scene'
import { KernelDispatcher } from './kernel.dispatcher'

// Reuse the tracked original A2x3x4 (V24/A52), B1x2x5 (V10/A34)
// and two S placements. All native expectations below are literal mm values.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000)
const near = (actual: readonly number[], wanted: readonly number[], tolerance = 1e-6) => {
  expect(actual).toHaveLength(wanted.length)
  actual.forEach((value, i) => expect(Math.abs(value - wanted[i])).toBeLessThanOrEqual(tolerance))
}
function fixture(): ConfiguredAssemblyWorkerContext {
  const { document, catalog } = assemblyConfigurationCoreFixture()
  return { document: createAssemblyConfiguredDocument(document, catalog, 'both-compact'), generation: 20 }
}
function target(current: ConfiguredAssemblyWorkerContext): Pick<AssemblyConfiguredOccurrenceEdit, 'scopePath' | 'definition' | 'configuration'> {
  return { scopePath: [], definition: { id: current.document.source.id, revision: current.document.source.revision }, configuration: current.document.rootConfiguration }
}
function reuse(current: ConfiguredAssemblyWorkerContext): AssemblyConfiguredOccurrenceEdit {
  return { ...target(current), change: { kind: 'reuse', definition: { id: 'configuration-A', revision: 'r1' }, configuration: null, name: 'Original extra A', pose: { translation: [50, 0, 0], rotation: [0, 0, 0, 1] }, fixed: true } }
}
function totals(scene: scenes.ConfiguredAssemblyScene, solids: number, volume: number, area: number) {
  expect(scene.scene.solidCount).toBe(solids); expect(scene.scene.bodies).toHaveLength(solids)
  near([scene.scene.volume, scene.scene.area], [volume, area], 1e-5)
  expect(scene.scene.warnings).toEqual([])
}

it('previews reusable insertion, retains one private occurrence identity, applies against baseline and round-trips history/file', () => {
  const current = fixture(), before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession(), reply = session.previewOccurrenceEdit(current, reuse(current))
  expect(reply.verification.accepted).toBe(true); expect(reply.candidateGeneration).toBeGreaterThan(current.generation)
  totals(reply.scene, 5, 92, 224)
  const added = reply.document.source.occurrences.find(row => row.name === 'Original extra A')!
  expect(added).toBeDefined(); expect(added.suppressed).toBe(true)
  const body = reply.scene.scene.bodies.find(row => row.component.occurrencePath.length === 1 && row.component.occurrencePath[0] === added.id)!
  near(body.bounds.min, [50, 0, 0]); near(body.bounds.max, [52, 3, 4]); near([body.volume, body.area], [24, 52], 1e-5)
  const expected = structuredClone(reply.document), identity = added.id
  reply.document.source.occurrences.length = 0; reply.document.catalog.length = 0
  const applied = session.apply(current, reply.token)
  expect(applied.document).toEqual(expected); expect(applied.document.source.occurrences.filter(row => row.id === identity)).toHaveLength(1)
  expect(current).toEqual(before); expect(() => session.apply(current, reply.token)).toThrow(/consumed|unknown/)
  const history = new AssemblyConfiguredDocumentHistory(current.document)
  history.commitDocument(applied.document); expect(history.undo()).toEqual(current.document); expect(history.redo()).toEqual(expected)
  const reopened = parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(applied.document))
  expect(reopened).toEqual(expected); totals(new ConfiguredAssemblyWorkerSession().build({ document: reopened, generation: 0 }), 5, 92, 224)
  const base = { ...reopened, rootConfiguration: null }
  totals(new ConfiguredAssemblyWorkerSession().build({ document: base, generation: 0 }), 4, 68, 172)
}, 60_000)

it('inserts into the selected shared intrinsic child state and preserves literal rotated placements in both uses', () => {
  const current = fixture(), edit = reuse(current)
  edit.scopePath = ['right']; edit.definition = { id: 'configuration-S', revision: 's-r1' }; edit.configuration = 'compact'
  if (edit.change.kind !== 'reuse') throw Error('Expected original reuse')
  edit.change.pose.translation = [8, 0, 0]
  const session = new ConfiguredAssemblyWorkerSession(), reply = session.previewOccurrenceEdit(current, edit)
  totals(reply.scene, 6, 116, 276)
  const added = reply.document.source.definitions.find(row => row.id === 'configuration-S')
  if (added?.kind !== 'assembly') throw Error('Original S missing')
  const id = added.occurrences.find(row => row.name === 'Original extra A')!.id
  const left = reply.scene.scene.bodies.find(row => row.component.occurrencePath.join('/') === 'left/' + id)!
  const right = reply.scene.scene.bodies.find(row => row.component.occurrencePath.join('/') === 'right/' + id)!
  near(left.bounds.min, [8, 0, 0]); near(left.bounds.max, [10, 3, 4]); near(right.bounds.min, [27, 8, 0]); near(right.bounds.max, [30, 10, 4])
  session.discard(reply.token); expect(() => session.apply(current, reply.token)).toThrow(/consumed|unknown/)
  totals(session.build(current), 4, 68, 172)
}, 60_000)

it('fixes and frees the selected named occurrence without changing Base or unrelated named state declarations', () => {
  const current = fixture(), before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession()
  const edit: AssemblyConfiguredOccurrenceEdit = { scopePath: ['right'], definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact', change: { kind: 'set-fixed', occurrenceId: 'b', fixed: true } }
  const reply = session.previewOccurrenceEdit(current, edit), applied = session.apply(current, reply.token)
  totals(applied.scene, 4, 68, 172); expect(applied.document.source).toEqual(before.document.source)
  const effective = evaluateAssemblyConfiguration(applied.document.source, applied.document.catalog, applied.document.rootConfiguration)
  expect(effective.scopes.filter(row => row.path.length === 1).map(row => row.occurrences.find(o => o.id === 'b')!.fixed)).toEqual([true, true])
  expect(applied.document.catalog[1].configurations.find(row => row.id === 'single')).toEqual(before.document.catalog[1].configurations.find(row => row.id === 'single'))
  const next = { document: applied.document, generation: applied.generation }
  const freed = session.previewOccurrenceEdit(next, { ...edit, change: { kind: 'set-fixed', occurrenceId: 'b', fixed: false } })
  const free = evaluateAssemblyConfiguration(freed.document.source, freed.document.catalog, freed.document.rootConfiguration)
  expect(free.scopes.filter(row => row.path.length === 1).every(row => !row.occurrences.find(o => o.id === 'b')!.fixed)).toBe(true)
  session.discard(freed.token); expect(current).toEqual(before)
}, 60_000)

it('rejects fixation that makes an existing native distance impossible without publishing source or state changes', () => {
  const current = fixture(), child = current.document.source.definitions.find(row => row.id === 'configuration-S')
  if (child?.kind !== 'assembly') throw Error('Original S missing')
  child.mates = [{ id: 'required-distance', name: 'Original required X10', type: 'distance', suppressed: false, alignment: 'aligned', distance: 10,
    first: { kind: 'principal-plane', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }, plane: 'YZ' },
    second: { kind: 'principal-plane', component: null, plane: 'YZ' } }]
  const before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession()
  const floating = session.preview(current)
  expect(floating.verification.accepted).toBe(true)
  const left = floating.scene.scene.bodies.find(row => row.component.occurrencePath.join('/') === 'left/b')!
  const right = floating.scene.scene.bodies.find(row => row.component.occurrencePath.join('/') === 'right/b')!
  near(left.bounds.min, [10, 0, 0]); near(left.bounds.max, [11, 2, 5])
  near(right.bounds.min, [28, 10, 0]); near(right.bounds.max, [30, 11, 5])
  session.discard(floating.token)
  // compact places B at X4. Fixing it cannot satisfy its declared distance X10.
  expect(() => session.previewOccurrenceEdit(current, { scopePath: ['right'], definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact', change: { kind: 'set-fixed', occurrenceId: 'b', fixed: true } })).toThrow(/solve refused|geometry rejected/)
  expect(current).toEqual(before); expect(() => session.apply(current, 'unissued')).toThrow(/unknown|consumed/)
}, 60_000)

it.each([1, 2, 3] as const)('imports saved v%s into a named parent with exact native geometry and retained source catalog', version => {
  const f = assemblyConfigurationCoreFixture(), parent = createEmptyAssembly(), current = { document: createAssemblyConfiguredDocument(parent, [{ definition: { id: parent.id, revision: parent.revision }, configurations: [{ id: 'work', name: 'Original work', occurrences: [], mates: [] }] }], 'work'), generation: 1 }
  const part = f.document.definitions.find(row => row.kind === 'part')!
  if (part.kind !== 'part') throw Error('Original A missing')
  const source = version === 1 ? part.document : version === 2 ? f.document : createAssemblyConfiguredDocument(f.document, f.catalog, 'mixed'), sourceBefore = structuredClone(source)
  const edit: AssemblyConfiguredOccurrenceEdit = { ...target(current), change: { kind: 'insert', source, partRevision: version === 1 ? 'r1' : null, name: 'Original imported source', pose: { translation: [50, 0, 0], rotation: [0, 0, 0, 1] }, fixed: true } }
  const session = new ConfiguredAssemblyWorkerSession(), reply = session.previewOccurrenceEdit(current, edit)
  totals(reply.scene, version === 1 ? 1 : 4, version === 1 ? 24 : 68, version === 1 ? 52 : 172)
  const id = reply.document.source.occurrences[0].id
  const first = reply.scene.scene.bodies.find(row => row.component.occurrencePath.join('/') === (version === 1 ? id : id + '/left/a'))!
  near(first.bounds.min, [50, 0, 0]); near(first.bounds.max, [52, 3, 4])
  if (version !== 1) {
    const right = reply.scene.scene.bodies.find(row => row.component.occurrencePath.join('/') === id + '/right/b')!
    near(right.bounds.min, [78, version === 3 ? 4 : 10, 0]); near(right.bounds.max, [80, version === 3 ? 5 : 11, 5])
  }
  if (version === 3) for (const row of f.catalog) expect(reply.document.catalog.find(candidate => candidate.definition.id === row.definition.id)).toEqual(row)
  const applied = session.apply(current, reply.token); expect(applied.document.source.occurrences[0].id).toBe(id); expect(source).toEqual(sourceBefore)
  expect(parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(applied.document))).toEqual(applied.document)
}, 60_000)

it('retains an existing capability on semantic rejection but consumes a matching stale Apply and targeted Cancel', () => {
  const current = fixture(), before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession(), reply = session.previewOccurrenceEdit(current, reuse(current))
  const bad = reuse(current); bad.configuration = 'missing'
  expect(() => session.previewOccurrenceEdit(current, bad)).toThrow(/ámbito|estado/)
  session.discard('unrelated'); expect(() => session.apply({ ...current, generation: current.generation + 1 }, reply.token)).toThrow(/baseline/)
  expect(() => session.apply(current, reply.token)).toThrow(/consumed|unknown/)
  const next = session.previewOccurrenceEdit(current, reuse(current)); session.discard(next.token)
  expect(() => session.apply(current, next.token)).toThrow(/consumed|unknown/); expect(current).toEqual(before)
}, 60_000)

it.each(['failure', 'reentry'] as const)('withholds occurrence publication after native scene %s', phase => {
  const current = fixture(), before = structuredClone(current), session = new ConfiguredAssemblyWorkerSession(), actual = scenes.buildConfiguredAssemblyScene
  const spy = vi.spyOn(scenes, 'buildConfiguredAssemblyScene').mockImplementation((...args) => {
    const scene = actual(...args)
    if (phase === 'failure') throw Error('Original occurrence scene failure')
    current.generation++; return scene
  })
  try { expect(() => session.previewOccurrenceEdit(current, reuse(current))).toThrow(phase === 'failure' ? /Original occurrence/ : /context changed/) } finally { spy.mockRestore() }
  expect(current.document).toEqual(before.document); expect(() => session.apply(current, 'unissued')).toThrow(/consumed|unknown/)
}, 60_000)

it('dispatches the new action through native preview and preserves its exact capability after an invalid occurrence target', () => {
  const current = fixture(), dispatcher = new KernelDispatcher()
  try {
    const reply = dispatcher.handle({ id: 1, action: 'preview-configured-assembly-occurrence-edit', current, edit: reuse(current) })
    if (!reply || reply instanceof Blob || !('kind' in reply) || reply.kind !== 'configured-assembly-preview') throw Error('Expected native configured preview')
    totals(reply.scene, 5, 92, 224)
    const bad = reuse(current); bad.scopePath = ['missing']
    expect(() => dispatcher.handle({ id: 2, action: 'preview-configured-assembly-occurrence-edit', current, edit: bad })).toThrow()
    const applied = dispatcher.handle({ id: 3, action: 'apply-configured-assembly', current, token: reply.token })
    if (!applied || applied instanceof Blob || !('kind' in applied) || applied.kind !== 'configured-assembly-applied') throw Error('Expected private Apply')
    expect(applied.document).toEqual(reply.document)
  } finally { dispatcher.dispose() }
}, 60_000)
