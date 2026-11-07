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
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { assemblyOrdinaryMateUiEdit } from '../components/assemblyOrdinaryMateEdit'

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

// Original non-axisymmetric 2 x 3 x 4 prisms. Each V24/A52; pair V48/A104.
function prisms(component = false, reversedRoles = false): AssemblyDocument {
  const input = cylinder(), part = input.definitions[0]
  if (part.kind !== 'part') throw Error('Original part')
  part.document.features[0] = { id: 'profile', name: 'Original 2 by 3', type: 'sketch', plane: 'XY', offset: 0,
    suppressed: false, profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } }
  const solid = part.document.features[1]; if (solid.type !== 'extrude') throw Error('Original extrusion'); solid.depth = 4
  input.occurrences[0].pose = { translation: [0, 0, 7], rotation: [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] }
  input.occurrences.push({ ...structuredClone(input.occurrences[0]), id: 'fixed', name: 'Original fixed prism', fixed: true,
    pose: { translation: [0, 0, -10], rotation: [0, 0, 0, 1] } })
  const moving = axis('Z', { occurrencePath: ['pin'], definition: { id: part.id, revision: part.revision } }),
    other = component ? axis('Z', { occurrencePath: ['fixed'], definition: { id: part.id, revision: part.revision } }) : axis('Z')
  input.mates = [{ id: 'axis', name: 'Original prism bearing', type: 'concentric', suppressed: false,
    first: reversedRoles ? other : moving, second: reversedRoles ? moving : other, alignment: 'aligned', rotationLock: null }]
  return validateAssemblyDocument(input)
}
function readyOrigin(input: AssemblyDocument, options = {}) {
  const result = prepareAssemblySolve(input, options)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw Error(result.message)
  return result
}

it.each([false, true].flatMap(component => [false, true].map(reversedRoles => ({ component, reversedRoles }))))(
  'captures prism Rz30 for component=$component reverse roles=$reversedRoles and leaves axial travel free', ({ component, reversedRoles }) => {
    const input = prisms(component, reversedRoles), before = serializeAssemblyDocument(input), preview = readyOrigin(input)
    try {
      expect(preview.scopes[0].result.localDOF).toBe(2)
      const locked = captureAssemblyConcentricRotationLock(preview, input, 'axis'), mate = locked.mates[0]
      if (mate.type !== 'concentric' || !mate.rotationLock) throw Error('Expected captured origin rotation')
      near(mate.rotationLock, [0, 0, (reversedRoles ? 1 : -1) * Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
      const moved = structuredClone(locked)
      moved.occurrences[0].pose = { translation: [0, 0, 19], rotation: [0, 0, .5, Math.sqrt(3) / 2] }
      const restored = readyOrigin(moved)
      try {
        expect(restored.scopes[0].result.localDOF).toBe(1); expect(restored.checks.every(check => check.satisfied)).toBe(true)
        const document = validateAssemblyDocument(restored.document)
        near(document.occurrences[0].pose.translation, [0, 0, 19], 1e-6)
        const bounds = nativeBounds(document)
        near(bounds.min, [-1.5, 0, 19], 1e-6); near(bounds.max, [Math.sqrt(3), 1 + 1.5 * Math.sqrt(3), 23], 1e-6)
        const scene = buildAssemblyScene(document)
        expect(scene.solidCount).toBe(2); expect(scene.volume).toBeCloseTo(48, 6); expect(scene.area).toBeCloseTo(104, 6)
        expect(parseAssemblyDocument(serializeAssemblyDocument(document)).mates).toEqual(document.mates)
      } finally { discardAssemblySolvePreview(restored) }
      expect(serializeAssemblyDocument(input)).toBe(before)
    } finally { discardAssemblySolvePreview(preview) }
  }, 60_000)

it('requires fresh session authority for origin capture, Apply, history and saved recovery', () => {
  const input = prisms(), before = serializeAssemblyDocument(input), session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(input)
  try {
    const initial = session.prepare(input); if (initial.status !== 'ready') throw Error('Expected ready')
    const captured = session.captureRotation(input, initial.token, 'axis'); if (captured.status !== 'ready') throw Error('Expected locked preview')
    expect(captured.token).not.toBe(initial.token)
    expect(() => session.apply(input, initial.token)).toThrow()
    expect(serializeAssemblyDocument(history.current)).toBe(before)
    const applied = session.apply(input, captured.token)
    history.commitDocument(applied.document)
    expect(() => session.apply(input, captured.token)).toThrow()
    const saved = serializeAssemblyDocument(history.current)
    expect(serializeAssemblyDocument(history.undo())).toBe(before)
    expect(serializeAssemblyDocument(history.redo())).toBe(saved)
    const reopened = parseAssemblyDocument(saved), fresh = readyOrigin(reopened)
    try { expect(fresh.scopes[0].result.localDOF).toBe(1) } finally { discardAssemblySolvePreview(fresh) }
    const cancel = session.prepare(input); if (cancel.status !== 'ready') throw Error('Expected ready')
    const discard = session.captureRotation(input, cancel.token, 'axis'); if (discard.status !== 'ready') throw Error('Expected ready')
    session.discard(discard.token)
    expect(() => session.apply(input, discard.token)).toThrow()
    expect(serializeAssemblyDocument(input)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it('edits a saved origin lock without recapture, rejects conflicting orientation, then explicitly releases spin through fresh Apply', () => {
  const input = prisms(), session = new AssemblyWorkerSession()
  try {
    const initial = session.prepare(input); if (initial.status !== 'ready') throw Error('Expected free preview')
    const captured = session.captureRotation(input, initial.token, 'axis'); if (captured.status !== 'ready') throw Error('Expected captured preview')
    const locked = session.apply(input, captured.token).document, mate = locked.mates[0]
    if (mate.type !== 'concentric' || !mate.rotationLock) throw Error('Expected saved lock')
    near(mate.rotationLock, [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
    const before = serializeAssemblyDocument(locked), history = new AssemblyDocumentHistory(locked)
    const candidate = (alignment: 'aligned' | 'opposed', releaseRotation: boolean) => {
      const update = assemblyOrdinaryMateUiEdit(mate, { name: 'Edited original bearing', alignment, releaseRotation })
      if (!update) throw Error('Expected ordinary edit')
      return applyAssemblyEdit(locked, { type: 'update-mate', mateId: mate.id, mate: update })
    }
    const renamed = session.prepare(locked, candidate('aligned', false))
    if (renamed.status !== 'ready') throw Error('Expected rename preview')
    expect(renamed.scopes[0].result.localDOF).toBe(1)
    expect(renamed.document.mates[0]).toEqual({ ...mate, name: 'Edited original bearing' })
    const conflict = session.prepare(locked, candidate('opposed', false))
    expect(conflict.status).toBe('rejected')
    expect(() => session.apply(locked, renamed.token)).toThrow()
    expect(serializeAssemblyDocument(locked)).toBe(before)
    expect(serializeAssemblyDocument(history.current)).toBe(before)
    const proposed = candidate('aligned', true), preview = session.prepare(locked, proposed)
    if (preview.status !== 'ready') throw Error('Expected unlock preview')
    expect(preview.scopes[0].result.localDOF).toBe(2)
    expect(preview.document.mates[0]).toEqual({ ...mate, name: 'Edited original bearing', rotationLock: null })
    expect(preview.checks.every(check => check.satisfied)).toBe(true)
    session.discard(preview.token)
    expect(() => session.apply(locked, preview.token)).toThrow()
    expect(serializeAssemblyDocument(history.current)).toBe(before)
    const retry = session.prepare(locked, proposed); if (retry.status !== 'ready') throw Error('Expected retry')
    const stale = structuredClone(locked); stale.updatedAt = '2026-10-24T00:00:00.000Z'
    expect(() => session.apply(stale, retry.token)).toThrow()
    const fresh = session.prepare(locked, proposed); if (fresh.status !== 'ready') throw Error('Expected fresh retry')
    const applied = session.apply(locked, fresh.token).document
    history.commitDocument(applied)
    expect(history.undo()).toEqual(locked); expect(history.redo()).toEqual(applied)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied))
    // Independent finite roll/slide satisfying the unlocked Z axis: Rz90 and Z19.
    reopened.occurrences[0].pose = { translation: [0, 0, 19], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
    const moved = readyOrigin(reopened)
    try {
      expect(moved.scopes[0].result.localDOF).toBe(2)
      expect(moved.checks.every(check => check.satisfied)).toBe(true)
      near(moved.document.occurrences[0].pose.translation, [0, 0, 19], 1e-6)
      near(moved.document.occurrences[0].pose.rotation, [0, 0, Math.SQRT1_2, Math.SQRT1_2], 1e-8)
      const document = validateAssemblyDocument(moved.document), bounds = nativeBounds(document), scene = buildAssemblyScene(document)
      near(bounds.min, [-3, 0, 19], 1e-6); near(bounds.max, [0, 2, 23], 1e-6)
      expect(scene.solidCount).toBe(2); expect(scene.volume).toBeCloseTo(48, 6); expect(scene.area).toBeCloseTo(104, 6)
      expect(document.occurrences[1]).toEqual(locked.occurrences[1])
    } finally { discardAssemblySolvePreview(moved) }
    expect(serializeAssemblyDocument(locked)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it('rejects forged, consumed and changed pose/revision/scope origin capture authority', () => {
  const input = prisms(), preview = readyOrigin(input)
  try {
    expect(() => captureAssemblyConcentricRotationLock(structuredClone(preview), input, 'axis')).toThrow(/no fue verificada/)
    const pose = structuredClone(input); pose.occurrences[0].pose.translation[2]++
    expect(() => captureAssemblyConcentricRotationLock(preview, pose, 'axis')).toThrow(/documento cambió/)
    const revision = structuredClone(input); revision.revision = 'r2'
    expect(() => captureAssemblyConcentricRotationLock(preview, revision, 'axis')).toThrow(/documento cambió/)
    expect(() => captureAssemblyConcentricRotationLock(preview, input, 'axis', { id: input.id, revision: 'old' })).toThrow()
    discardAssemblySolvePreview(preview)
    expect(() => captureAssemblyConcentricRotationLock(preview, input, 'axis')).toThrow(/no fue verificada/)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('edits isolated root/component XY coincidence from aligned to opposed with independent plane and prism evidence', () => {
  const input = prisms(), session = new AssemblyWorkerSession()
  input.mates = [{ id: 'plane', name: 'Original XY coincidence', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: null, plane: 'XY' },
    second: { kind: 'principal-plane', component: { occurrencePath: ['pin'], definition: { ...input.occurrences[0].definition } }, plane: 'XY' } }]
  const assertGeometry = (document: AssemblyDocument, sign: number) => {
    const { translation: t, rotation: [x, y, z, w] } = document.occurrences[0].pose
    // Literal local XY normal transformed by the saved quaternion. Root normal is +Z.
    const normal = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]
    near(normal, [0, 0, sign], 1e-6)
    expect(Math.abs(t[2])).toBeLessThanOrEqual(1e-6) // root-normal plane separation
    // Independently transform all eight original 2x3x4 corners; no unique free XY/roll pose.
    const corners = [0, 2].flatMap(a => [0, 3].flatMap(b => [0, 4].map(c => [
      t[0] + (1 - 2 * (y * y + z * z)) * a + 2 * (x * y - w * z) * b + 2 * (x * z + w * y) * c,
      t[1] + 2 * (x * y + w * z) * a + (1 - 2 * (x * x + z * z)) * b + 2 * (y * z - w * x) * c,
      t[2] + 2 * (x * z - w * y) * a + 2 * (y * z + w * x) * b + (1 - 2 * (x * x + y * y)) * c,
    ])))
    const bounds = nativeBounds(document)
    near(bounds.min, [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]))), 1e-6)
    near(bounds.max, [0, 1, 2].map(i => Math.max(...corners.map(p => p[i]))), 1e-6)
    const scene = buildAssemblyScene(document)
    expect(scene.solidCount).toBe(2); expect(scene.volume).toBeCloseTo(48, 6); expect(scene.area).toBeCloseTo(104, 6)
    expect(document.occurrences[1]).toEqual(input.occurrences[1])
  }
  try {
    const initial = session.prepare(input); if (initial.status !== 'ready') throw Error('Expected aligned coincidence')
    expect(initial.scopes[0].result.localDOF).toBe(3)
    const committed = session.apply(input, initial.token).document, before = serializeAssemblyDocument(committed)
    assertGeometry(committed, 1)
    const mate = committed.mates[0]; if (mate.type !== 'coincident') throw Error('Expected coincidence')
    const update = assemblyOrdinaryMateUiEdit(mate, { name: 'Opposed XY coincidence', alignment: 'opposed', releaseRotation: false })
    if (!update) throw Error('Expected ordinary plane edit')
    const proposed = applyAssemblyEdit(committed, { type: 'update-mate', scope: { id: committed.id, revision: committed.revision }, mateId: mate.id, mate: update })
    const preview = session.prepare(committed, proposed); if (preview.status !== 'ready') throw Error('Expected opposed coincidence')
    expect(preview.scopes[0].result.localDOF).toBe(3)
    expect(preview.checks.every(check => check.satisfied)).toBe(true)
    assertGeometry(preview.document, -1)
    expect(serializeAssemblyDocument(committed)).toBe(before)
    const applied = session.apply(committed, preview.token).document
    expect(applied.mates[0]).toEqual({ ...mate, name: 'Opposed XY coincidence', alignment: 'opposed' })
    assertGeometry(parseAssemblyDocument(serializeAssemblyDocument(applied)), -1)
  } finally { session.discard() }
}, 60_000)

it('captures distinct local children in a reused rigid subassembly, independent of its parent gauge', () => {
  const input = prisms(true), children = structuredClone(input.occurrences), mates = structuredClone(input.mates)
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original nested bearing', createdAt: stamp, updatedAt: stamp,
    occurrences: children, mates })
  input.occurrences = [
    { ...children[1], id: 'use-a', definition: { id: 'sub', revision: 'r1' }, pose: { translation: [100, 200, 300], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } },
    { ...children[1], id: 'use-b', definition: { id: 'sub', revision: 'r1' }, pose: { translation: [-50, 0, 0], rotation: [0, 0, 0, 1] } },
  ]; input.mates = []
  const preview = readyOrigin(input)
  try {
    const captured = captureAssemblyConcentricRotationLock(preview, input, 'axis', { id: 'sub', revision: 'r1' })
    const sub = captured.definitions.find(value => value.id === 'sub'); if (sub?.kind !== 'assembly' || sub.mates[0].type !== 'concentric') throw Error('Original subassembly')
    near(sub.mates[0].rotationLock!, [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
    expect(captured.occurrences).toEqual(input.occurrences)
    const fresh = readyOrigin(captured)
    try {
      expect(fresh.scopes.find(scope => scope.definition.id === 'sub')!.result.localDOF).toBe(1)
      const scene = buildAssemblyScene(validateAssemblyDocument(fresh.document)); expect(scene.solidCount).toBe(4)
      expect(scene.volume).toBeCloseTo(96, 6); expect(scene.area).toBeCloseTo(208, 6)
    } finally { discardAssemblySolvePreview(fresh) }
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('rejects new origin capture for different descendants of the same local rigid owner', () => {
  const input = prisms(true), children = structuredClone(input.occurrences)
  children.forEach(child => { child.fixed = true })
  input.definitions.push({ kind: 'assembly', id: 'rigid', revision: 'r1', name: 'Original one-owner descendants', createdAt: stamp, updatedAt: stamp,
    occurrences: children, mates: [] })
  input.occurrences = [{ ...children[1], id: 'owner', definition: { id: 'rigid', revision: 'r1' }, pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } }]
  const mate = input.mates[0]; if (mate.type !== 'concentric') throw Error('Original concentric')
  for (const reference of [mate.first, mate.second]) { if (!reference.component) throw Error('Original child'); reference.component.occurrencePath.unshift('owner') }
  const preview = readyOrigin(input)
  try { expect(() => captureAssemblyConcentricRotationLock(preview, input, 'axis')).toThrow(/propietarios rígidos distintos/) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('retains original deep-chain angular budgets for capture and saved locked declarations', () => {
  const input = prisms(), leaf = structuredClone(input.occurrences[0]), path = ['pin']
  let child = leaf
  for (let depth = 0; depth < 12; depth++) {
    child.fixed = true
    const id = `level-${depth}`
    input.definitions.push({ kind: 'assembly', id, revision: 'r1', name: 'Original depth ' + depth, createdAt: stamp, updatedAt: stamp,
      occurrences: [child], mates: [] })
    child = { ...structuredClone(leaf), id: `owner-${depth}`, definition: { id, revision: 'r1' }, fixed: false,
      pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] } }
    path.unshift(child.id)
  }
  input.occurrences = [child]
  const mate = input.mates[0]; if (mate.type !== 'concentric' || !mate.first.component) throw Error('Original datum')
  mate.first.component.occurrencePath = path
  const preview = readyOrigin(input), narrow = readyOrigin(input, { angleTolerance: 1e-13 })
  try {
    const captured = captureAssemblyConcentricRotationLock(preview, input, 'axis')
    expect(() => captureAssemblyConcentricRotationLock(narrow, input, 'axis')).toThrow(/precisión angular/)
    const failure = prepareAssemblySolve(captured, { angleTolerance: 1e-13 })
    expect(failure.status).toBe('rejected'); if (failure.status === 'rejected') expect(failure.reason).toBe('precisionLimit')
    const fresh = readyOrigin(captured); discardAssemblySolvePreview(fresh)
  } finally { discardAssemblySolvePreview(preview); discardAssemblySolvePreview(narrow) }
}, 60_000)

it('captures relative orientation under a large common translation while retaining positional precision guards', () => {
  const input = prisms(true)
  for (const occurrence of input.occurrences) { occurrence.pose.translation[0] += 1e6; occurrence.pose.translation[1] -= 1e6 }
  const preview = readyOrigin(input)
  try {
    const captured = captureAssemblyConcentricRotationLock(preview, input, 'axis'), mate = captured.mates[0]
    if (mate.type !== 'concentric') throw Error('Original concentric')
    near(mate.rotationLock!, [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)])
    const fresh = readyOrigin(captured); discardAssemblySolvePreview(fresh)
  } finally { discardAssemblySolvePreview(preview) }
  for (const occurrence of input.occurrences) occurrence.pose.translation[0] = 1e12
  const rejected = prepareAssemblySolve(input)
  expect(rejected.status).toBe('rejected'); if (rejected.status === 'rejected') expect(rejected.reason).toBe('precisionLimit')
}, 60_000)

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
    const captured = captureAssemblyConcentricRotationLock(result, input, 'axis')
    expect(captured.mates[0].type === 'concentric' && captured.mates[0].rotationLock !== null).toBe(true)
    const locked = prepareAssemblySolve(captured)
    expect(locked.status, locked.status === 'rejected' ? locked.message : '').toBe('ready')
    if (locked.status !== 'ready') throw Error(locked.message)
    try { expect(locked.scopes[0].result.localDOF).toBe(1); expect(locked.checks.every(row => row.satisfied)).toBe(true) }
    finally { discardAssemblySolvePreview(locked) }
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
