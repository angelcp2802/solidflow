import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import type { EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { ConfiguredAssemblyWorkerSession } from './kernel.assembly-configuration-session'
import * as scenes from './kernel.assembly-configuration-scene'

// Original tracked A2×3×4 and B1×2×5 prisms; no imported/private geometry.
beforeAll(async () => { setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })) }, 60_000)
function fixture() {
  const { document, catalog } = assemblyConfigurationCoreFixture()
  return { document: createAssemblyConfiguredDocument(document, catalog, 'both-compact'), generation: 12 }
}
function edit(): AssemblyConfiguredMateEdit {
  return { scopePath: ['left'], definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact', change: { kind: 'add', mate: {
    id: 'original-coplanar', name: 'Original coplanar caps', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: null, plane: 'XY' },
    second: { kind: 'principal-plane', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }, plane: 'XY' },
  } } }
}
it('authors a shared named relation, applies only against original complete baseline and ignores mutated DTO', () => {
  const current = fixture(), original = structuredClone(current), session = new ConfiguredAssemblyWorkerSession()
  const preview = session.previewEdit(current, edit()), expected = structuredClone(preview.document)
  expect(preview.verification.accepted).toBe(true); expect(preview.scene.scene.solidCount).toBe(4)
  expect(Math.abs(preview.scene.scene.volume - 68)).toBeLessThanOrEqual(1e-5)
  expect(Math.abs(preview.scene.scene.area - 172)).toBeLessThanOrEqual(1e-5)
  const scopes = evaluateAssemblyConfiguration(expected.source, expected.catalog, expected.rootConfiguration).scopes.filter(s => s.path.length === 1)
  expect(scopes.map(s => s.mates.map(m => m.id))).toEqual([['original-coplanar'], ['original-coplanar']])
  expect(expected.source).toEqual(original.document.source)
  preview.document.source.name = 'Forged result'; preview.document.catalog.length = 0
  const applied = session.apply(current, preview.token)
  expect(applied.document).toEqual(expected); expect(current).toEqual(original)
  expect(() => session.apply(current, preview.token)).toThrow(/unknown|consumed/)
}, 60_000)
it('matching Apply against proposal instead of baseline consumes the token; unrelated cancellation does not', () => {
  const current = fixture(), session = new ConfiguredAssemblyWorkerSession(), first = session.previewEdit(current, edit())
  session.discard('unrelated-token')
  expect(() => session.apply({ document: first.document, generation: current.generation }, first.token)).toThrow(/baseline/)
  expect(() => session.apply(current, first.token)).toThrow(/unknown|consumed/)
  const second = session.previewEdit(current, edit()); session.discard(second.token)
  expect(() => session.apply(current, second.token)).toThrow(/unknown|consumed/)
}, 60_000)
it.each(['failure', 'reentry'] as const)('withholds %s after actual scene preparation without publishing an edit capability', phase => {
  const current = fixture(), original = structuredClone(current), session = new ConfiguredAssemblyWorkerSession(), actual = scenes.buildConfiguredAssemblyScene
  const spy = vi.spyOn(scenes, 'buildConfiguredAssemblyScene').mockImplementation((...args) => {
    const result = actual(...args)
    if (phase === 'failure') throw Error('Original edit scene failure')
    current.generation++; return result
  })
  try { expect(() => session.previewEdit(current, edit())).toThrow(phase === 'failure' ? 'Original edit scene failure' : /context changed/) } finally { spy.mockRestore() }
  expect(current.document).toEqual(original.document)
  expect(() => session.apply(current, 'not-published')).toThrow(/unknown|consumed/)
}, 60_000)
it('rejects copied capture declarations before replacing an older valid stage', () => {
  const current = fixture(), session = new ConfiguredAssemblyWorkerSession(), preview = session.previewEdit(current, edit())
  const bad = edit()
  if (bad.change.kind !== 'add') throw Error('Original test add intent')
  bad.change.mate = { id: 'copied-lock', name: 'Copied declaration', type: 'lock', suppressed: true,
    first: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } },
    second: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } },
    relativePose: { translation: [4, 0, 0], rotation: [0, 0, 0, 1] } }
  expect(() => session.previewEdit(current, bad)).toThrow(/capture producer/)
  expect(session.apply(current, preview.token).document.source).toEqual(current.document.source)
}, 60_000)
it.each(['suppression', 'remove'] as const)('permits %s of an existing captured declaration without minting a new capture', kind => {
  const current = fixture(), child = current.document.source.definitions.find(d => d.id === 'configuration-S') as EmbeddedAssemblyDefinition
  child.mates = [{ id: 'existing-lock', name: 'Original existing lock', type: 'lock', suppressed: false,
    first: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } },
    second: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } },
    relativePose: { translation: [4, 0, 0], rotation: [0, 0, 0, 1] } }]
  const original = structuredClone(current), intent = edit()
  intent.change = kind === 'remove' ? { kind, mateId: 'existing-lock' } : { kind, mateId: 'existing-lock', suppressed: true }
  const session = new ConfiguredAssemblyWorkerSession(), preview = session.previewEdit(current, intent)
  expect(preview.verification.accepted).toBe(true)
  const applied = session.apply(current, preview.token)
  expect(applied.document.source).toEqual(original.document.source)
  const scopes = evaluateAssemblyConfiguration(applied.document.source, applied.document.catalog, applied.document.rootConfiguration).scopes.filter(s => s.path.length === 1)
  expect(scopes).toHaveLength(2)
  for (const scope of scopes) {
    if (kind === 'remove') expect(scope.mates).toEqual([])
    else { expect(scope.mates).toHaveLength(1); expect(scope.mates[0].suppressed).toBe(true) }
  }
  expect(current).toEqual(original)
}, 60_000)
