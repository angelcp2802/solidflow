import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { validateAssemblyConfiguredDocument, assemblyConfiguredGeometryInput, parseAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { validateAssemblyMate, type AssemblyMate } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import { applyAssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { ConfiguredAssemblyWorkerSession, type ConfiguredAssemblyWorkerContext } from './kernel.assembly-configuration-session'
import { buildConfiguredAssemblyScene, type ConfiguredAssemblyScene } from './kernel.assembly-configuration-scene'
import { verifyConfiguredAssemblyGeometry } from './kernel.assembly-configuration-verification'

// Original tracked Cartesian recipe: two 4x4x4
// blocks at A=(-8,0,0), B=(8,0,6), only A fixed. No imported model or guessed
// topology key. Native catalogs nominate every material face and LINE.
// Explicit B-to-root YZ/XZ distances restrain X/Y and orientation, leaving Z
// free until the picked B-top to A-top signed distance +2 is authored.
const require = createRequire(import.meta.url)
const original = require('../../scripts/desktop-assembly-configured-picking-original.cjs') as () => unknown
const near = (a: number, b: number, tolerance = 1e-6) => {
  expect(Number.isFinite(a)).toBe(true); expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
}
const vector = (a: readonly number[], b: readonly number[], tolerance = 1e-6) => {
  expect(a).toHaveLength(b.length); a.forEach((value, i) => near(value, b[i], tolerance))
}
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined, printErr: () => undefined,
})), 60_000)
function fixture(): ConfiguredAssemblyWorkerContext {
  const document = validateAssemblyConfiguredDocument(original())
  document.catalog[0].configurations.push({ id: 'dormant', name: 'Dormant original state', occurrences: [], mates: [] })
  return { document: validateAssemblyConfiguredDocument(document), generation: 17 }
}
const scene = (document: AssemblyConfiguredDocument, generation = 0) => buildConfiguredAssemblyScene(assemblyConfiguredGeometryInput(document, generation))
function body(value: ConfiguredAssemblyScene, id: string) {
  const rows = value.scene.bodies.filter(row => row.component.occurrencePath.length === 1 && row.component.occurrencePath[0] === id)
  expect(rows).toHaveLength(1); return rows[0]
}
function nominees(value: ConfiguredAssemblyScene) {
  const plane = (id: string) => {
    const rows = body(value, id).faces.filter(face => face.support?.kind === 'plane'
      && face.support.normal[2] > 1 - 1e-10 && Math.abs(face.support.point[2] - 4) < 1e-10)
    expect(rows).toHaveLength(1)
    expect(rows[0].selection.body).toEqual({ bodyId: 'cube-body', sourceFeatureId: 'solid' })
    return { kind: 'face' as const, ...structuredClone(rows[0].selection), support: 'plane' as const }
  }
  const edge = (id: string) => {
    const rows = body(value, id).edges!.filter(edge => edge.support?.kind === 'line'
      && Math.abs(edge.support.axis[0]) > 1 - 1e-10 && Math.abs(edge.support.point[1] + 2) < 1e-10
      && Math.abs(edge.support.point[2] - 4) < 1e-10)
    expect(rows).toHaveLength(1)
    const support = rows[0].support
    if (support?.kind !== 'line') throw Error('Expected native LINE')
    return { reference: { kind: 'edge' as const, ...structuredClone(rows[0].selection), support: 'line' as const }, axis: support.axis }
  }
  const first = edge('A'), second = edge('B')
  vector(first.axis, second.axis, 1e-10) // Same native signed direction, not absolute parallelism.
  return {
    distance: validateAssemblyMate({ id: 'picked-distance', name: 'Picked top plane distance', type: 'distance', suppressed: false,
      first: plane('B'), second: plane('A'), distance: 2, alignment: 'aligned' }),
    parallel: validateAssemblyMate({ id: 'picked-parallel', name: 'Picked LINE parallel', type: 'parallel', suppressed: false,
      first: first.reference, second: second.reference, alignment: 'aligned' }),
  }
}
function physical(value: ConfiguredAssemblyScene, z: number) {
  expect(value.referenceDiagnostics).toEqual([]); expect(value.scene.warnings).toEqual([])
  expect(value.scene.solidCount).toBe(2); expect(value.scene.bodies).toHaveLength(2)
  near(value.scene.volume, 128, 1e-5); near(value.scene.area, 192, 1e-5)
  for (const [id, min, max] of [['A', [-10, -2, 0], [-6, 2, 4]], ['B', [6, -2, z], [10, 2, z + 4]]] as const) {
    const item = body(value, id)
    expect(item.solidCount).toBe(1); near(item.volume, 64, 1e-5); near(item.area, 96, 1e-5)
    vector(item.bounds.min, min); vector(item.bounds.max, max)
    vector(item.worldPose.rotation, [0, 0, 0, 1])
  }
  // Independently compare native placed plane points and signed LINE directions.
  const tops = ['A', 'B'].map(id => body(value, id).faces.find(face => face.support?.kind === 'plane'
    && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - 4) < 1e-10)!.worldSupport)
  if (tops[0]?.kind !== 'plane' || tops[1]?.kind !== 'plane') throw Error('Expected placed top planes')
  vector(tops[0].normal, [0, 0, 1]); vector(tops[1].normal, [0, 0, 1])
  near(tops[0].point[2], 4); near(tops[1].point[2], z + 4)
  near(tops[1].point[2] - tops[0].point[2], z)
  const edges = ['A', 'B'].map(id => body(value, id).edges!.find(edge => edge.support?.kind === 'line'
    && Math.abs(edge.support.axis[0]) > .99 && Math.abs(edge.support.point[1] + 2) < 1e-10
    && Math.abs(edge.support.point[2] - 4) < 1e-10)!.worldSupport)
  if (edges[0]?.kind !== 'line' || edges[1]?.kind !== 'line') throw Error('Expected placed LINEs')
  vector(edges[0].axis, edges[1].axis)
}
function effective(document: AssemblyConfiguredDocument) {
  return evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration).scopes.find(row => row.path.length === 0)!.mates
}
function intent(current: ConfiguredAssemblyWorkerContext, mate: AssemblyMate) {
  return { scopePath: [], definition: { id: current.document.source.id, revision: current.document.source.revision },
    configuration: 'demo', change: { kind: 'add' as const, mate } }
}
it('authors material plane distance then matching LINE parallel in one named state, preserving references and history', () => {
  const initial = fixture(), baseline = structuredClone(initial), restraints = structuredClone(effective(initial.document)), selection = nominees(scene(initial.document)), session = new ConfiguredAssemblyWorkerSession()
  physical(scene(initial.document), 6)
  const unsolved = applyAssemblyConfiguredMateEdit(initial.document, intent(initial, selection.distance))
  const beforeMeasurement = verifyConfiguredAssemblyGeometry(assemblyConfiguredGeometryInput(unsolved, initial.generation))
  expect(beforeMeasurement.accepted).toBe(false); expect(beforeMeasurement.status).toBe('unsatisfied')
  expect(beforeMeasurement.reports).toHaveLength(3)
  const cancelled = session.previewEdit(initial, intent(initial, selection.distance))
  expect(cancelled.verification.accepted).toBe(true); physical(cancelled.scene, 2)
  session.discard(cancelled.token); expect(() => session.apply(initial, cancelled.token)).toThrow(/unknown|consumed/)
  expect(initial).toEqual(baseline)
  const preview = session.previewEdit(initial, intent(initial, selection.distance))
  expect(preview.verification.reports).toHaveLength(3)
  const applied = session.apply(initial, preview.token), current = { document: applied.document, generation: applied.generation }
  physical(applied.scene, 2); expect(effective(current.document)).toEqual([...restraints, selection.distance])
  // Select fresh current catalog LINEs after actual displacement.
  const fresh = nominees(applied.scene), next = session.previewEdit(current, intent(current, fresh.parallel))
  expect(next.verification.accepted).toBe(true); expect(next.verification.reports).toHaveLength(4)
  physical(next.scene, 2)
  const final = session.apply(current, next.token)
  expect(effective(final.document)).toEqual([...restraints, selection.distance, fresh.parallel]); expect(initial).toEqual(baseline)
  expect(final.document.source).toEqual(initial.document.source)
  expect(final.document.catalog[0].configurations.find(row => row.id === 'dormant')).toEqual(initial.document.catalog[0].configurations[1])
  const history = new AssemblyConfiguredDocumentHistory(initial.document)
  history.commitDocument(current.document); history.commitDocument(final.document)
  expect(effective(history.undo())).toEqual([...restraints, selection.distance]); physical(scene(history.current), 2)
  expect(history.undo()).toEqual(initial.document); physical(scene(history.current), 6)
  history.redo(); expect(history.redo()).toEqual(final.document)
  const reopened = parseAssemblyConfiguredDocument(serializeAssemblyConfiguredDocument(history.current))
  expect(reopened).toEqual(final.document); physical(scene(reopened), 2)
  const verification = verifyConfiguredAssemblyGeometry(assemblyConfiguredGeometryInput(reopened, 0))
  expect(verification.accepted).toBe(true); expect(verification.reports).toHaveLength(4)
  for (const configuration of [null, 'dormant']) {
    const inactive = { ...reopened, rootConfiguration: configuration }
    expect(effective(inactive)).toEqual(restraints); physical(scene(inactive), 6)
  }
  expect(() => session.apply(current, next.token)).toThrow(/unknown|consumed/)
}, 60_000)
