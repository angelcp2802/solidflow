import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { insertAssemblyDocument } from '../model/assemblyImport'
import { validateAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { prepareAssemblySolve, discardAssemblySolvePreview } from './kernel.assembly-solve'
import type { AssemblyReadonly } from './kernel.assembly-snapshot'
import { validatePositiveClosedTool } from './kernel.closed-tools'
import * as placements from './kernel.assembly-placements'
import parentJson from './fixtures/assembly-import-parent-original.json'
import sourceJson from './fixtures/assembly-import-subassembly-original.json'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const near = (a: number, b: number, tolerance = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tolerance)
function geometry(document: AssemblyReadonly<AssemblyDocument>) {
  const scene = buildAssemblyScene(validateAssemblyDocument(document))
  expect(scene.prototypeCount).toBe(1); expect(scene.bodies).toHaveLength(4); expect(scene.solidCount).toBe(4)
  near(scene.volume, 96, 1e-5); near(scene.area, 208, 1e-5)
  for (const root of document.occurrences) for (const [id, low, high] of [
    ['analysis-body-a', [7, 20, 30], [10, 22, 34]], ['analysis-body-b', [7, 21, 30], [10, 23, 34]],
  ] as const) {
    const found = scene.bodies.filter(body => body.component.occurrencePath.join('/') === root.id + '/m' && body.body?.bodyId === id)
    expect(found).toHaveLength(1); const body = found[0]
    expect(body.component.definition).toEqual({ id: 'original-analysis-multibody', revision: 'r1' })
    expect(body.body?.sourceFeatureId).toBe(id === 'analysis-body-a' ? 'box-a-extrude' : 'box-b-extrude')
    expect(body.solidCount).toBe(1); near(body.volume, 24, 1e-5); near(body.area, 52, 1e-5)
    const moved = root === document.occurrences[0]
    const originalLow = id === 'analysis-body-a' ? [0, 0, 0] : [1, 0, 0]
    const originalHigh = id === 'analysis-body-a' ? [2, 3, 4] : [3, 3, 4]
    for (let i = 0; i < 3; i++) { near(body.bounds.min[i], moved ? low[i] : originalLow[i]); near(body.bounds.max[i], moved ? high[i] : originalHigh[i]) }
  }
  return scene
}
it('imports a reusable assembly graph with local fixed-plane mates and fresh native geometry in each root frame', () => {
  const parent = validateAssemblyDocument(parentJson), source = validateAssemblyDocument(sourceJson)
  const parentBefore = serializeAssemblyDocument(parent), sourceBefore = serializeAssemblyDocument(source)
  const once = insertAssemblyDocument(parent, source)
  expect(parent.occurrences).toHaveLength(0); expect(once.occurrences).toHaveLength(1)
  once.occurrences[0].pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  const twice = insertAssemblyDocument(once, source)
  expect(twice.occurrences).toHaveLength(2); expect(new Set(twice.occurrences.map(row => row.id)).size).toBe(2)
  expect(twice.occurrences[0].definition).toEqual(twice.occurrences[1].definition)
  expect(twice.definitions.filter(row => row.kind === 'part')).toEqual(source.definitions)
  const embedded = twice.definitions.find(row => row.kind === 'assembly')!
  expect(embedded.kind).toBe('assembly')
  if (embedded.kind !== 'assembly') throw Error('Imported assembly absent')
  expect(embedded.occurrences).toEqual(source.occurrences); expect(embedded.mates).toEqual(source.mates)
  expect(embedded.mates[0].type).toBe('coincident')
  const before = serializeAssemblyDocument(twice), original = placements.placeAssemblyShape
  const solids: number[] = []
  const spy = vi.spyOn(placements, 'placeAssemblyShape').mockImplementation((...args) => {
    const shape = original(...args); solids.push(validatePositiveClosedTool(shape).solidCount); return shape
  })
  try {
    geometry(twice); expect(solids).toEqual([1, 1, 1, 1])
    const preview = prepareAssemblySolve(twice)
    expect(preview.status).toBe('ready')
    if (preview.status !== 'ready') throw Error(preview.message)
    try {
      expect(preview.scopes).toHaveLength(2)
      const local = preview.scopes.find(scope => scope.definition.id === source.id)!
      expect(local.result.localDOF).toBe(0)
      expect(preview.checks).toHaveLength(2)
      for (const check of preview.checks) { expect(check.satisfied).toBe(true); near(check.lengthResidual, 0, 1e-9); near(check.angleResidual, 0, 1e-9) }
      expect(preview.document.occurrences.map(row => row.pose)).toEqual(twice.occurrences.map(row => row.pose))
      geometry(preview.document)
    } finally { discardAssemblySolvePreview(preview) }
    const reopened = validateAssemblyDocument(JSON.parse(serializeAssemblyDocument(twice)))
    geometry(reopened); expect(serializeAssemblyDocument(reopened)).toBe(before)
  } finally { spy.mockRestore() }
  expect(serializeAssemblyDocument(twice)).toBe(before)
  expect(serializeAssemblyDocument(parent)).toBe(parentBefore); expect(serializeAssemblyDocument(source)).toBe(sourceBefore)
}, 60_000)
