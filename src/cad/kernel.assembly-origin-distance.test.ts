import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { validateDocument } from '../model/document'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyDocument, type AssemblyPrincipalPlaneReference } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, type AssemblyReadonly } from './kernel.assembly-snapshot'
import { applyAssemblySolvePreview, discardAssemblySolvePreview, prepareAssemblySolve, type AssemblySolvePreview } from './kernel.assembly-solve'
import { CadEngine } from './kernel.engine'
import { type NativeBodyCatalog, validateBodyShape } from './kernel.bodies'
import { withNativeOwners } from './kernel.native-ownership'
import { placeAssemblyBody } from './kernel.assembly-placements'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

const stamp = '2026-11-11T00:00:00.000Z'
const definition = { id: 'original-distance-prism', revision: 'r1' }
const rootPlane: AssemblyPrincipalPlaneReference = { kind: 'principal-plane', component: null, plane: 'YZ' }
const movingPlane: AssemblyPrincipalPlaneReference = { kind: 'principal-plane',
  component: { occurrencePath: ['moving'], definition }, plane: 'YZ' }

// Original 2×3×4 mm prism, reused twice at identity. Reference/occurrence origins
// coincide; the requested signed distance is the only nonzero length scale.
function fixture(distance: number): AssemblyDocument {
  const part = validateDocument({ version: 1, id: definition.id, name: 'Original distance prism', units: 'mm',
    createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Original 2 by 3 rectangle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
        profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
      { id: 'solid', name: 'Original four-mm prism', type: 'extrude', suppressed: false, sketchId: 'profile', depth: 4,
        symmetric: false, bodyOperation: { mode: 'new', bodyId: 'prism-body' } },
    ] })
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'original-distance-root', revision: 'r1',
    name: 'Original coincident-origin signed distance', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...definition, document: part }],
    occurrences: ['fixed', 'moving'].map(id => ({ id, name: id, definition, pose: identityRigidPose(),
      fixed: id === 'fixed', suppressed: false, visible: true })),
    mates: [{ id: 'signed-distance', name: 'Original root to moving YZ', type: 'distance', suppressed: false,
      first: rootPlane, second: movingPlane, alignment: 'aligned', distance }] })
}

function ready(document: AssemblyDocument): AssemblySolvePreview {
  const preview = prepareAssemblySolve(document)
  expect(preview.status, JSON.stringify(preview.status === 'rejected' ? preview : preview.scopes)).toBe('ready')
  if (preview.status !== 'ready') throw Error(preview.message)
  return preview
}
function near(actual: number, expected: number, tolerance = 1e-6) {
  expect(Number.isFinite(actual)).toBe(true)
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}
function physical(input: AssemblyReadonly<AssemblyDocument>, distance: number) {
  const document = validateAssemblyDocument(input)
  const snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const a = snapshot.resolveReference(document, rootPlane), b = snapshot.resolveReference(document, movingPlane)
    if (a.kind !== 'support' || b.kind !== 'support' || a.worldSupport.kind !== 'plane' || b.worldSupport.kind !== 'plane') {
      throw Error('Actual root and component native plane witnesses required')
    }
    const normal = b.worldSupport.normal, delta = a.worldSupport.point.map((value, i) => value - b.worldSupport.point[i])
    near(normal.reduce((sum, value, i) => sum + value * delta[i], 0), distance)
    near(a.worldSupport.normal.reduce((sum, value, i) => sum + value * normal[i], 0), 1, 1e-8)
  } finally { snapshot.dispose() }
  withNativeOwners(owners => {
    const engine = new CadEngine()
    owners.own({ delete: () => engine.dispose() })
    const source = document.definitions[0]
    if (source.kind !== 'part') throw Error('Original prism definition required')
    expect(engine.build(source.document.features).featureErrors).toEqual([])
    const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog
    const prototype = catalog.resolve({ bodyId: 'prism-body', sourceFeatureId: 'solid' }).shape
    const material = owners.own(placeAssemblyBody(prototype, document.occurrences[1].pose))
    validateBodyShape(material)
    expect(owners.ownAll(material.solids)).toHaveLength(1)
    near(owners.own(measureShapeVolumeProperties(material)).volume, 24, 1e-5)
    near(owners.own(measureShapeSurfaceProperties(material)).area, 52, 1e-5)
    const bounds = owners.own(material.boundingBox).bounds
    const expected = [[-distance, 0, 0], [2 - distance, 3, 4]]
    expected.forEach((side, i) => side.forEach((value, j) => near(bounds[i][j], value)))
  })
}

it.each([30, 150, -150, 1000, -1_000_000])('solves original identity origins at signed distance %s with unchanged default budgets', distance => {
  const input = fixture(distance), bytes = serializeAssemblyDocument(input), reopened = parseAssemblyDocument(bytes)
  expect(reopened.mates[0]).toMatchObject({ type: 'distance', distance })
  const preview = ready(reopened)
  try {
    expect(serializeAssemblyDocument(input)).toBe(bytes)
    expect(preview.document.occurrences[0]).toEqual(input.occurrences[0])
    expect(preview.document.definitions).toEqual(input.definitions)
    expect(preview.document.mates).toEqual(input.mates)
    const report = preview.scopes.find(scope => scope.definition.id === input.id)!.result
    expect(report.localDOF).toBe(3)
    expect(report.rank).toBe(3)
    expect(report.iterations).toBeLessThan(80)
    expect(preview.checks).toHaveLength(1)
    expect(preview.checks.every(check => check.satisfied && check.angleTolerance === 1e-8)).toBe(true)
    physical(preview.document, distance)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('preserves Cancel, exact source history and the saved 150-mm declaration after Apply and reopen', () => {
  const input = fixture(150), bytes = serializeAssemblyDocument(input), history = new AssemblyDocumentHistory(input)
  const cancelled = ready(input)
  discardAssemblySolvePreview(cancelled)
  expect(serializeAssemblyDocument(input)).toBe(bytes)
  expect(() => applyAssemblySolvePreview(history, cancelled)).toThrow()
  const applied = applyAssemblySolvePreview(history, ready(input)), saved = serializeAssemblyDocument(applied)
  physical(applied, 150)
  expect(serializeAssemblyDocument(history.undo())).toBe(bytes)
  expect(serializeAssemblyDocument(history.redo())).toBe(saved)
  const reopened = parseAssemblyDocument(saved), preview = ready(reopened)
  try { physical(preview.document, 150); expect(preview.document.mates).toEqual(input.mates) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('retains explicit exhausted budgets and precision refusal without publishing a pose', () => {
  const input = fixture(150), before = serializeAssemblyDocument(input)
  const stopped = prepareAssemblySolve(input, { solver: { maxIterations: 0 } })
  expect(stopped.status).toBe('rejected')
  if (stopped.status !== 'rejected') throw Error('Explicit exhausted budget must reject')
  expect(stopped.reason).toBe('numeric')
  expect(stopped.scopes.at(-1)!.result.status).toBe('nonConverged')
  expect(stopped.scopes.at(-1)!.result.iterations).toBe(0)
  expect(serializeAssemblyDocument(input)).toBe(before)
  const distant = fixture(1e12), distantBytes = serializeAssemblyDocument(distant)
  expect(parseAssemblyDocument(distantBytes).mates[0]).toMatchObject({ distance: 1e12 })
  const precision = prepareAssemblySolve(distant)
  expect(precision.status).toBe('rejected')
  if (precision.status !== 'rejected') throw Error('Unresolved physical precision must reject')
  expect(precision.reason).toBe('precisionLimit')
  expect(serializeAssemblyDocument(distant)).toBe(distantBytes)
}, 60_000)
