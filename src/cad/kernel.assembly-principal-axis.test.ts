import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it } from 'vitest'
import { validateAssemblyDocument, parseAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type AssemblyPrincipalAxisReference, type AssemblyAxisReference } from '../model/assemblyDocument'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { AssemblyConfigurationGeometrySnapshot, assemblyConfigurationPlacementArithmetic, type AssemblyConfigurationGeometryInput } from './kernel.assembly-configuration-snapshot'
import { prepareAssemblySolve, discardAssemblySolvePreview, captureAssemblyConcentricRotationLock } from './kernel.assembly-solve'
import { prepareConfiguredAssemblySolve, applyPreparedConfiguredAssemblySolve } from './kernel.assembly-configuration-solve'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { withNativeOwners } from './kernel.native-ownership'
import { placeAssemblyShape, validateAssemblyShape } from './kernel.assembly-placements'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')), print: () => undefined, printErr: () => undefined })), 60_000)
const stamp = '2026-10-23T00:00:00.000Z'
const axis = (name: 'X' | 'Y' | 'Z', component: AssemblyPrincipalAxisReference['component'] = null): AssemblyPrincipalAxisReference => ({ kind: 'principal-axis', component, axis: name })
const near = (actual: readonly number[], expected: readonly number[], band = 1e-8) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(band))
}
// Original public feature recipe: radius 2 mm, height 8 mm solid cylinder.
// V = 32 pi mm3, A = 40 pi mm2. No external model or tessellation oracle.
function cylinder(): AssemblyDocument {
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'origin-axis-root', revision: 'r1', name: 'Original origin axis cylinder', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', id: 'origin-axis-pin', revision: 'r1', document: { version: 1, id: 'origin-axis-pin', name: 'Original cylinder', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Original radius 2', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
      { id: 'solid', name: 'Original height 8', type: 'extrude', sketchId: 'profile', depth: 8, symmetric: false, suppressed: false },
    ] } }], occurrences: [{ id: 'pin', name: 'Pin', definition: { id: 'origin-axis-pin', revision: 'r1' }, pose: { translation: [3, 4, 7], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }], mates: [] })
}
function materialAxis(document: AssemblyDocument): AssemblyAxisReference {
  const scene = buildAssemblyScene(document), face = scene.bodies[0].faces.find(value => value.support?.kind === 'cylinder')
  if (!face || face.support?.kind !== 'cylinder') throw Error('Original native cylinder face missing')
  // This original extrusion's native parameter axis is -Z, although its
  // material occupies local Z=[0,8]. Aligned means this signed axis, not +Z.
  near(face.support.axis, [0, 0, -1], 1e-10)
  return { kind: 'face', ...structuredClone(face.selection), support: 'axis' }
}
// Exact geometric BRep box, deliberately excluding display triangulation.
function nativeBounds(document: AssemblyDocument) {
  return withNativeOwners(owners => {
    const definition = document.definitions[0]
    if (definition.kind !== 'part') throw Error('Original cylinder part missing')
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
    expect(engine.build(definition.document.features).featureErrors).toEqual([])
    const source = owners.own(engine.copyCurrentBodyShape(null)), shape = owners.own(placeAssemblyShape(source, document.occurrences[0].pose))
    expect(validateAssemblyShape(shape)).toBe(1)
    const oc = getOC(), box = owners.own(new oc.Bnd_Box())
    oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false)
    const low = owners.own(box.CornerMin()), high = owners.own(box.CornerMax())
    return { min: [low.X(), low.Y(), low.Z()], max: [high.X(), high.Y(), high.Z()] }
  })
}
function concentric(document: AssemblyDocument, material: boolean) {
  document.mates = [{ id: 'axis', name: 'Original concentric origin Z', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null,
    first: material ? materialAxis(document) : axis('Z', { occurrencePath: ['pin'], definition: { ...document.occurrences[0].definition } }), second: axis('Z') }]
  return validateAssemblyDocument(document)
}

it('resolves literal XYZ lines without cylinder radii in root, rotated assembly and nested part frames', () => {
  const input = cylinder(), leaf = structuredClone(input.occurrences[0])
  leaf.pose = { translation: [2, 0, 3], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  input.definitions.push({ kind: 'assembly', id: 'nested-axis', revision: 'r1', name: 'Original rotated datum owner', createdAt: stamp, updatedAt: stamp, occurrences: [leaf], mates: [] })
  input.occurrences = [{ ...leaf, id: 'scope', definition: { id: 'nested-axis', revision: 'r1' }, pose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }]
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    for (const [name, literal] of [['X', [1, 0, 0]], ['Y', [0, 1, 0]], ['Z', [0, 0, 1]]] as const) {
      const witness = snapshot.resolveReference(input, axis(name))
      if (witness.kind !== 'support' || witness.worldSupport.kind !== 'line') throw Error('Expected origin line')
      expect(witness.origin).toBe('principal-axis'); expect(witness.localSupport).toEqual({ kind: 'line', point: [0, 0, 0], axis: literal, tolerance: 0 })
      near(witness.worldSupport.point, [0, 0, 0]); near(witness.worldSupport.axis, literal)
      expect(witness.localSupport).not.toHaveProperty('radius'); expect(witness.localSupport).not.toHaveProperty('xDirection')
    }
    const scope = snapshot.resolveReference(input, axis('X'), ['scope'])
    const explicit = snapshot.resolveReference(input, axis('X', { occurrencePath: ['scope'], definition: { id: 'nested-axis', revision: 'r1' } }))
    const part = snapshot.resolveReference(input, axis('Z', { occurrencePath: ['pin'], definition: { id: 'origin-axis-pin', revision: 'r1' } }), ['scope'])
    for (const w of [scope, explicit, part]) if (w.kind !== 'support' || w.worldSupport.kind !== 'line') throw Error('Expected line')
    if (scope.kind !== 'support' || explicit.kind !== 'support' || part.kind !== 'support' || scope.worldSupport.kind !== 'line' || part.worldSupport.kind !== 'line') throw Error('Expected lines')
    expect(explicit.worldSupport).toEqual(scope.worldSupport)
    near(scope.worldSupport.point, [10, 20, 30]); near(scope.worldSupport.axis, [0, 1, 0])
    // Rx90 maps local Z to -Y; parent Rz90 then maps -Y to +X.
    near(part.worldSupport.point, [10, 22, 33]); near(part.worldSupport.axis, [1, 0, 0])
    expect(part.componentPath).toEqual(['scope', 'pin'])
  } finally { snapshot.dispose() }
}, 60_000)

it('retains exact revision, document, suppression and private witness lifetime checks for datum axes', () => {
  const input = cylinder(), component = { occurrencePath: ['pin'], definition: { ...input.occurrences[0].definition } }, snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const witness = snapshot.resolveReference(input, axis('Z', component))
    expect(() => snapshot.resolveReference(input, axis('Z', { ...component, definition: { ...component.definition, revision: 'stale' } }))).toThrow(/revisión/)
    expect(() => snapshot.assertWitness(structuredClone(witness), input)).toThrow()
    const changed = structuredClone(input); changed.occurrences[0].pose.translation[0]++
    expect(() => snapshot.assertWitness(witness, changed)).toThrow(/documento cambió/)
    snapshot.dispose(); expect(() => snapshot.assertWitness(witness, input)).toThrow()
  } finally { snapshot.dispose() }
  input.occurrences[0].suppressed = true
  const suppressed = new AssemblyGeometrySnapshot(input)
  try { expect(() => suppressed.resolveReference(input, axis('X', component))).toThrow(/suprimida/) } finally { suppressed.dispose() }
}, 60_000)

it.each(['parallel', 'perpendicular', 'angle'] as const)('authenticates origin-axis %s directions against literal orthogonal coordinates', type => {
  const input = cylinder(), first = axis('X', { occurrencePath: ['pin'], definition: { ...input.occurrences[0].definition } })
  const second = axis(type === 'parallel' ? 'X' : 'Y')
  input.mates = [type === 'angle'
    ? { id: 'direction', name: 'Original right angle', type, suppressed: false, first, second, angle: 90 }
    : { id: 'direction', name: 'Original coordinate direction', type, suppressed: false, first, second, alignment: type === 'parallel' ? 'aligned' : null }]
  const result = prepareAssemblySolve(input)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw Error(result.message)
  try {
    expect(result.checks).toHaveLength(1); expect(result.checks[0].satisfied).toBe(true)
    near(result.document.occurrences[0].pose.translation, [3, 4, 7]); near(result.document.occurrences[0].pose.rotation, [0, 0, 0, 1])
    expect(result.scopes[0].result.localDOF).toBe(type === 'parallel' ? 4 : 5)
  } finally { discardAssemblySolvePreview(result) }
}, 60_000)

it.each([false, true])('solves origin-line/%s concentricity with independent native bounds, free slide/spin and persistence', material => {
  const input = concentric(cylinder(), material), saved = serializeAssemblyDocument(input), result = prepareAssemblySolve(input)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw Error(result.message)
  try {
    expect(result.scopes[0].result.localDOF).toBe(2); expect(result.checks.every(row => row.satisfied)).toBe(true)
    // Axial translation is free: restoration may choose any finite Z. Only radial coordinates are constrained.
    near(result.document.occurrences[0].pose.translation.slice(0, 2), [0, 0], 1e-6)
    expect(() => captureAssemblyConcentricRotationLock(result, input, 'axis')).toThrow(/ejes de origen/)
    const persisted = parseAssemblyDocument(serializeAssemblyDocument(validateAssemblyDocument(result.document)))
    expect(persisted.mates).toEqual(result.document.mates)
    const scene = buildAssemblyScene(persisted)
    expect(scene.solidCount).toBe(1); expect(Math.abs(scene.volume - 32 * Math.PI)).toBeLessThan(1e-5); expect(Math.abs(scene.area - 40 * Math.PI)).toBeLessThan(1e-5)
    const restoredBounds = nativeBounds(persisted)
    near(restoredBounds.min.slice(0, 2), [-2, -2], 1e-6); near(restoredBounds.max.slice(0, 2), [2, 2], 1e-6)
    near([restoredBounds.max[2] - restoredBounds.min[2]], [8], 1e-6)
    // Material -Z needs Rx180 to align with root +Z; then add world Z90 spin.
    // Rz90*Rx180 has quaternion [sqrt(1/2),sqrt(1/2),0,0], mapping material
    // local Z=[0,8] to world Z=[12,4]. The principal +Z case uses only Rz90.
    const rotation: [number, number, number, number] = material ? [Math.SQRT1_2, Math.SQRT1_2, 0, 0] : [0, 0, Math.SQRT1_2, Math.SQRT1_2]
    persisted.occurrences[0].pose = { translation: [0, 0, 12], rotation }
    const moved = prepareAssemblySolve(persisted)
    expect(moved.status, moved.status === 'rejected' ? moved.message : '').toBe('ready')
    if (moved.status !== 'ready') throw Error(moved.message)
    try {
      near(moved.document.occurrences[0].pose.translation, [0, 0, 12]); near(moved.document.occurrences[0].pose.rotation, rotation)
      const movedBounds = nativeBounds(validateAssemblyDocument(moved.document))
      near(movedBounds.min, material ? [-2, -2, 4] : [-2, -2, 12], 1e-6); near(movedBounds.max, material ? [2, 2, 12] : [2, 2, 20], 1e-6)
      expect(moved.scopes[0].result.localDOF).toBe(2); expect(moved.checks.every(row => row.satisfied)).toBe(true)
    } finally { discardAssemblySolvePreview(moved) }
    expect(serializeAssemblyDocument(input)).toBe(saved)
  } finally { discardAssemblySolvePreview(result) }
}, 60_000)

it('resolves configured root/component axes through effective named nested placements with original arithmetic budgets', () => {
  const input: AssemblyConfigurationGeometryInput = { ...assemblyConfigurationCoreFixture(), rootConfiguration: 'mixed', generation: 7 }, snapshot = new AssemblyConfigurationGeometrySnapshot(input)
  try {
    const root = snapshot.resolveDirectionReference(input, axis('Y'))
    const scope = snapshot.resolveReference(input, axis('X'), ['right'])
    const part = snapshot.resolveReference(input, axis('X', { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }), ['right'])
    for (const w of [root, scope, part]) { expect(w.origin).toBe('principal-axis'); expect(w.localSupport.kind).toBe('line'); expect(w.localSupport).not.toHaveProperty('radius') }
    if (root.worldSupport.kind !== 'line' || scope.worldSupport.kind !== 'line' || part.worldSupport.kind !== 'line') throw Error('Expected lines')
    near(root.worldSupport.axis, [0, 1, 0]); near(scope.worldSupport.point, [30, 0, 0]); near(scope.worldSupport.axis, [0, 1, 0])
    near(part.worldSupport.point, [30, 4, 0]); near(part.worldSupport.axis, [0, 1, 0]); expect(part.topLevelOwner).toBe('right')
    expect(part.configurationAncestry.map(row => row.configuration)).toEqual(['mixed', 'compact'])
    expect(assemblyConfigurationPlacementArithmetic(part, input)).toEqual({ placementSum: 34, depth: 2 })
    expect(() => snapshot.assertWitness(structuredClone(part), input)).toThrow()
    expect(() => snapshot.assertWitness(part, { ...input, generation: 8 })).toThrow()
  } finally { snapshot.dispose() }
}, 60_000)

it('solves configured material/origin concentricity and independently verifies the fresh candidate before one-use publication', () => {
  const input: AssemblyConfigurationGeometryInput = { document: concentric(cylinder(), true), catalog: [], rootConfiguration: null, generation: 1 }, before = structuredClone(input)
  const prepared = prepareConfiguredAssemblySolve(input)
  expect(prepared.verification.accepted).toBe(true); expect(prepared.verification.reports).toHaveLength(1)
  near(prepared.candidate.document.occurrences[0].pose.translation.slice(0, 2), [0, 0], 1e-6)
  expect(input).toEqual(before)
  const applied = applyPreparedConfiguredAssemblySolve(input, prepared)
  expect(applied).toEqual(prepared.candidate); expect(() => applyPreparedConfiguredAssemblySolve(input, prepared)).toThrow(/consumed|missing/)
}, 60_000)
