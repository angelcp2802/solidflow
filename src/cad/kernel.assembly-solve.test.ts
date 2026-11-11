import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateDocument } from '../model/document'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyFaceReference, type AssemblyMate, type AssemblyOccurrence, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose } from '../model/rigidPose'
import { rotationExp } from '../model/assemblyKinematics'
import { AssemblyGeometrySnapshot, type AssemblyEndpointWitness } from './kernel.assembly-snapshot'
import { applyAssemblySolvePreview, captureAssemblyConcentricRotationLock, discardAssemblySolvePreview,
  prepareAssemblySolve, type AssemblySolvePreview } from './kernel.assembly-solve'
import { placeAssemblyBody } from './kernel.assembly-placements'
import { bodyBoolean, validateBodyShape, type NativeBodyCatalog } from './kernel.bodies'
import { CadEngine } from './kernel.engine'
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import type { Feature, Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)
const stamp = '2026-10-15T00:00:00.000Z'
// Original analytical issue45 parts, generated only by public part features.
// Expected placements below are assertions, never a solver input or seed.
function part(id: string, features: Feature[]): EmbeddedPartDefinition {
  return { kind: 'part', id, revision: 'r1', document: validateDocument({ version: 1, id, name: id,
    units: 'mm', createdAt: stamp, updatedAt: stamp, features }) }
}
function parts(): EmbeddedPartDefinition[] {
  return [part('plate', [
    { id: 'profile', name: 'Original plate', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [0, 0], width: 40, height: 30 } },
    { id: 'base', name: 'Plate solid', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'plate-body' } },
    { id: 'left-profile', name: 'Left hole', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [-10, 0], radius: 3 } },
    { id: 'left-cut', name: 'Left through hole', type: 'cut', sketchId: 'left-profile', depth: 4, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId: 'plate-body', sourceFeatureId: 'base' }] },
    { id: 'right-profile', name: 'Right hole', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [10, 0], radius: 3 } },
    { id: 'right-cut', name: 'Right through hole', type: 'cut', sketchId: 'right-profile', depth: 4, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId: 'plate-body', sourceFeatureId: 'left-cut' }] },
  ]), part('pin', [
    { id: 'profile', name: 'Outer pin circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [0, 0], radius: 2 } },
    { id: 'base', name: 'Pin solid', type: 'extrude', sketchId: 'profile', depth: 12, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'pin-body' } },
    { id: 'bore-profile', name: 'Eccentric bore', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [1, 0], radius: .25 } },
    { id: 'bore', name: 'Eccentric through bore', type: 'cut', sketchId: 'bore-profile', depth: 12, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId: 'pin-body', sourceFeatureId: 'base' }] },
  ])]
}
function occurrence(id: string, definition = 'pin', fixed = false): AssemblyOccurrence {
  return { id, name: id, definition: { id: definition, revision: 'r1' }, pose: identityRigidPose(), fixed, suppressed: false, visible: true }
}
function document(): AssemblyDocument {
  const left = occurrence('left'), right = occurrence('right')
  left.pose = { translation: [-4, 3, -2], rotation: rotationExp([.23, -.17, .31]) }
  right.pose.translation = [14, -7, -1]
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original rigid assembly',
    units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: parts(), occurrences: [occurrence('plate', 'plate', true), left, right], mates: [] })
}
function select(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument, path: string[], kind: 'axis' | 'plane',
  predicate: (witness: AssemblyEndpointWitness) => boolean): { reference: AssemblyFaceReference; witness: AssemblyEndpointWitness } {
  for (const item of snapshot.listFaces(input, path)) {
    const reference: AssemblyFaceReference = { kind: 'face', ...item, support: kind }
    try { const witness = snapshot.resolveReference(input, reference); if (predicate(witness)) return { reference, witness } }
    catch (error) { if (!(error instanceof Error) || !error.message.includes('no coincide con el plano o eje declarado')) throw error }
  }
  throw new Error('Original analytical native face not found')
}
function axis(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument, path: string[], radius: number, x: number) {
  return select(snapshot, input, path, 'axis', w => w.kind === 'support' && w.localSupport.kind === 'cylinder'
    && Math.abs(w.localSupport.radius - radius) < 1e-10 && Math.abs(w.localSupport.point[0] - x) < 1e-9)
}
function top(snapshot: AssemblyGeometrySnapshot, input: AssemblyDocument, path: string[], z: number) {
  return select(snapshot, input, path, 'plane', w => w.kind === 'support' && w.localSupport.kind === 'plane'
    && Math.abs(w.localSupport.point[2] - z) < 1e-9 && w.localSupport.normal[2] > .99)
}
function alignment(a: AssemblyEndpointWitness, b: AssemblyEndpointWitness): 'aligned' | 'opposed' {
  if (a.kind !== 'support' || b.kind !== 'support' || a.localSupport.kind !== 'cylinder' || b.localSupport.kind !== 'cylinder') throw new Error('Expected native cylinders')
  return a.localSupport.axis[2] * b.localSupport.axis[2] > 0 ? 'aligned' : 'opposed'
}
function mated(input = document(), radius = 2): AssemblyDocument {
  const picker = new AssemblyGeometrySnapshot(input), mates: AssemblyMate[] = []
  try {
    const cap = top(picker, input, ['plate'], 4)
    for (const [id, x] of [['left', -10], ['right', 10]] as const) {
      const pin = axis(picker, input, [id], radius, 0), hole = axis(picker, input, ['plate'], 3, x), pinTop = top(picker, input, [id], 12)
      mates.push({ id: id + '-axis', name: id + ' cylinders', type: 'concentric', suppressed: false,
        alignment: alignment(pin.witness, hole.witness), rotationLock: null,
        first: pin.reference as AssemblyFaceReference & { support: 'axis' }, second: hole.reference as AssemblyFaceReference & { support: 'axis' } },
      { id: id + '-cap', name: id + ' top planes', type: 'coincident', suppressed: false, alignment: 'aligned',
        first: pinTop.reference as AssemblyFaceReference & { support: 'plane' }, second: cap.reference as AssemblyFaceReference & { support: 'plane' } })
      // Picker sessions attest the complete document. Keep declarations separate
      // until every selection was made, then release this unchanged source.
    }
  } finally { picker.dispose() }
  input.mates = mates
  return validateAssemblyDocument(input)
}
function ready(input: AssemblyDocument): AssemblySolvePreview {
  const result = prepareAssemblySolve(input)
  expect(result.status, JSON.stringify(result.status === 'rejected' ? result : result.scopes)).toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  return result
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-6) {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(tolerance))
}
function rootDOF(preview: AssemblySolvePreview) { return preview.scopes.find(item => item.definition.id === 'root')!.result.localDOF }
function nativeOccurrence(owners: NativeOwners, input: AssemblyDocument, id: string): Shape3D {
  const occurrence = input.occurrences.find(item => item.id === id)!, definition = input.definitions.find(item => item.id === occurrence.definition.id) as EmbeddedPartDefinition, engine = new CadEngine()
  owners.own({ delete: () => engine.dispose() }); expect(engine.build(definition.document.features).featureErrors).toEqual([])
  // Test-only access to the native prototype; production adapters issue numeric
  // witnesses and never expose a borrowed shape. The owned occurrence survives.
  const source = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog.resolve({ bodyId: definition.id + '-body', sourceFeatureId: definition.id === 'pin' ? 'bore' : 'right-cut' }).shape
  return owners.own(placeAssemblyBody(source, occurrence.pose))
}
function metrics(shape: Shape3D, x: number) {
  withNativeOwners(owners => {
    validateBodyShape(shape); expect(owners.ownAll(shape.solids)).toHaveLength(1)
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - 189 * Math.PI / 4)).toBeLessThan(1e-5)
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - 495 * Math.PI / 8)).toBeLessThan(1e-5)
    const bounds = owners.own(shape.boundingBox).bounds
    near(bounds[0], [x - 2, -2, -8]); near(bounds[1], [x + 2, 2, 4])
  })
}
function probe(shape: Shape3D, center: Vec3, expected: number) {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(x => x - .05) as Vec3, center.map(x => x + .05) as Vec3)), common = owners.own(bodyBoolean('common', shape, cube))
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - expected)).toBeLessThan(1e-7)
  })
}

it('starts with twelve free component DOF, preserving both occurrences of one source', () => {
  const input = document(), before = serializeAssemblyDocument(input), preview = ready(input)
  expect(rootDOF(preview)).toBe(12); expect(preview.document.occurrences.slice(1).map(item => item.definition)).toEqual([{ id: 'pin', revision: 'r1' }, { id: 'pin', revision: 'r1' }])
  expect(serializeAssemblyDocument(input)).toBe(before); discardAssemblySolvePreview(preview)
}, 60_000)

it('solves actual plate and reused pin faces jointly and checks independent native volume, area and bounds', () => {
  const input = mated(), before = serializeAssemblyDocument(input), history = new AssemblyDocumentHistory(input), preview = ready(input)
  expect(rootDOF(preview)).toBe(2); expect(preview.scopes[0].result.rank).toBe(10); expect(preview.checks).toHaveLength(4)
  expect(preview.checks.every(item => item.satisfied && item.lengthTolerance >= 1e-6 && item.angleTolerance === 1e-8)).toBe(true)
  expect(serializeAssemblyDocument(input)).toBe(before)
  const solved = applyAssemblySolvePreview(history, preview)
  near(solved.occurrences[1].pose.translation, [-10, 0, -8]); near(solved.occurrences[2].pose.translation, [10, 0, -8])
  expect(solved.occurrences[0].pose).toEqual(input.occurrences[0].pose)
  withNativeOwners(owners => {
    const plate = nativeOccurrence(owners, solved, 'plate'), left = nativeOccurrence(owners, solved, 'left'), right = nativeOccurrence(owners, solved, 'right')
    metrics(left, -10); metrics(right, 10); validateBodyShape(plate); expect(owners.ownAll(plate.solids)).toHaveLength(1)
    expect(left.wrapped.IsPartner(right.wrapped)).toBe(false)
    near(owners.own(plate.boundingBox).bounds[0], [-20, -15, 0]); near(owners.own(plate.boundingBox).bounds[1], [20, 15, 4])
    const volumes = [plate, left, right].map(shape => owners.own(measureShapeVolumeProperties(shape)).volume)
    const areas = [plate, left, right].map(shape => owners.own(measureShapeSurfaceProperties(shape)).area)
    expect(Math.abs(volumes[0] - (4800 - 72 * Math.PI))).toBeLessThan(1e-5)
    expect(Math.abs(areas[0] - (2960 + 12 * Math.PI))).toBeLessThan(1e-5)
    expect(Math.abs(volumes.reduce((a, b) => a + b, 0) - (4800 + 45 * Math.PI / 2))).toBeLessThan(1e-5)
    expect(Math.abs(areas.reduce((a, b) => a + b, 0) - (2960 + 543 * Math.PI / 4))).toBeLessThan(1e-5)
  })
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('ya se consumió')
  expect(serializeAssemblyDocument(history.undo())).toBe(before)
  expect(serializeAssemblyDocument(history.redo())).toBe(serializeAssemblyDocument(solved))
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(solved)), fresh = ready(reopened)
  expect(rootDOF(fresh)).toBe(2); discardAssemblySolvePreview(fresh)
}, 60_000)

it('captures only fresh concentric rotation, removes exactly one local spin and probes the real eccentric bore', () => {
  const input = mated(), first = ready(input), solved = applyAssemblySolvePreview(new AssemblyDocumentHistory(input), first)
  solved.occurrences[1].pose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  const preview = ready(solved), other = structuredClone(preview.document.occurrences[2].pose)
  withNativeOwners(owners => { const pin = nativeOccurrence(owners, validateAssemblyDocument(preview.document), 'left'); probe(pin, [-10, 1, -2], 0); probe(pin, [-9, 0, -2], .001) })
  const locked = captureAssemblyConcentricRotationLock(preview, solved, 'left-axis'), lock = locked.mates[0]
  expect(lock.type).toBe('concentric'); if (lock.type !== 'concentric') throw new Error('Expected concentric')
  expect(lock.rotationLock).not.toBeNull(); expect(rootDOF(preview)).toBe(2)
  const constrained = ready(locked); expect(rootDOF(constrained)).toBe(1); expect(constrained.document.occurrences[2].pose).toEqual(other)
  const unlocked = validateAssemblyDocument(constrained.document); if (unlocked.mates[0].type !== 'concentric') throw new Error('Expected concentric')
  unlocked.mates[0].rotationLock = null
  const free = ready(unlocked); expect(rootDOF(free)).toBe(2)
  discardAssemblySolvePreview(preview); discardAssemblySolvePreview(constrained); discardAssemblySolvePreview(free)
}, 60_000)

it('certifies incompatible identical plane offsets and keeps the complete document and history atomic', () => {
  const input = mated(), cap = input.mates.find(item => item.id === 'left-cap')!
  if (cap.type !== 'coincident') throw new Error('Expected plane mate')
  input.mates.push({ ...structuredClone(cap), id: 'contradiction', name: 'Original incompatible offset', type: 'distance', distance: 1 })
  const history = new AssemblyDocumentHistory(input), before = serializeAssemblyDocument(input), result = prepareAssemblySolve(input)
  expect(result.status).toBe('rejected'); if (result.status !== 'rejected') throw new Error('Expected rejection')
  expect(result.scopes.at(-1)!.result.status).toBe('inconsistent')
  expect(result.scopes.at(-1)!.result.certificates.some(item => item.kind === 'duplicateOffset')).toBe(true)
  expect(serializeAssemblyDocument(input)).toBe(before); expect(serializeAssemblyDocument(history.current)).toBe(before); expect(history.canUndo).toBe(false)
}, 60_000)

it('rejects forged, discarded and stale preview capabilities, including unchanged revision labels', () => {
  const input = mated(), history = new AssemblyDocumentHistory(input), preview = ready(input)
  expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow('no fue verificada')
  history.commit({ type: 'rename-occurrence', occurrenceId: 'right', name: 'Changed without revision relabel' })
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('El documento cambió')
  history.undo(); discardAssemblySolvePreview(preview)
  expect(() => captureAssemblyConcentricRotationLock(preview, input, 'left-axis')).toThrow('no fue verificada')
}, 60_000)

it('retains repairable references without substituting another reused occurrence', () => {
  const input = mated(), mate = input.mates[0]
  if (mate.type !== 'concentric') throw new Error('Expected concentric')
  mate.first.component = { occurrencePath: ['deleted'], definition: { id: 'pin', revision: 'r1' } }
  const before = serializeAssemblyDocument(input), result = prepareAssemblySolve(input)
  expect(result.status).toBe('rejected'); expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('solves a reused rigid subassembly once in its own frame, never promotes child fixed state into a world anchor', () => {
  const input = document(), child = occurrence('pin-child', 'pin', true)
  const internal: AssemblyMate = { id: 'child-plane', name: 'Fixed local datum', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', plane: 'XY', component: { occurrencePath: ['pin-child'], definition: child.definition } },
    second: { kind: 'principal-plane', plane: 'XY', component: null } }
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original rigid subassembly',
    createdAt: stamp, updatedAt: stamp, occurrences: [child], mates: [internal] })
  const a = occurrence('sub-a', 'sub'), b = occurrence('sub-b', 'sub')
  a.pose.translation = [4, 5, 6]; b.pose.translation = [-7, 8, 9]; input.occurrences = [a, b]
  const preview = ready(input)
  expect(preview.scopes.map(item => item.definition.id)).toEqual(['sub', 'root'])
  expect(preview.scopes[0].result.localDOF).toBe(0); expect(rootDOF(preview)).toBe(12)
  expect(preview.document.occurrences[0].pose).toEqual(a.pose); expect(preview.document.occurrences[1].pose).toEqual(b.pose)
  expect(preview.checks).toHaveLength(2); discardAssemblySolvePreview(preview)
}, 60_000)

it('publishes no preview authority after native release failure', () => {
  const input = document(), real = CadEngine.prototype.dispose
  const spy = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { real.call(this); throw new Error('Original release failure') })
  try { const result = prepareAssemblySolve(input); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('release failed') }
  finally { spy.mockRestore() }
}, 60_000)

it('updates both reused source revisions only after explicit current-face repair and a fresh native solve', () => {
  const input = mated(), old = ready(input), changed = validateAssemblyDocument(old.document), definition = changed.definitions.find(item => item.id === 'pin')!
  if (definition.kind !== 'part' || definition.document.features[0].type !== 'sketch' || definition.document.features[0].profile.kind !== 'circle') throw new Error('Expected original pin circle')
  definition.document.features[0].profile.radius = 2.5; definition.revision = 'r2'
  changed.occurrences.filter(item => item.definition.id === 'pin').forEach(item => item.definition.revision = 'r2')
  expect(prepareAssemblySolve(changed).status).toBe('rejected') // Saved endpoints still explicitly expect r1.
  const repaired = mated(changed, 2.5), preview = ready(repaired)
  expect(rootDOF(preview)).toBe(2); expect(preview.document.definitions.filter(item => item.id === 'pin')).toHaveLength(1)
  withNativeOwners(owners => {
    for (const id of ['left', 'right']) {
      const shape = nativeOccurrence(owners, validateAssemblyDocument(preview.document), id)
      expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - 297 * Math.PI / 4)).toBeLessThan(1e-5)
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - 627 * Math.PI / 8)).toBeLessThan(1e-5)
    }
  })
  expect(() => captureAssemblyConcentricRotationLock(old, repaired, 'left-axis')).toThrow('El documento cambió')
  discardAssemblySolvePreview(old); discardAssemblySolvePreview(preview)
}, 60_000)

it('rejects requested sub-resolution precision before publishing any candidate', () => {
  const input = document(); input.occurrences[1].pose.translation[0] = 1e12
  const result = prepareAssemblySolve(input, { lengthTolerance: 1e-6 })
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('precisionLimit')
}, 60_000)

it('solves internal free child placements before parent mates to nested components of a reused rigid source', () => {
  const input = document(), child = occurrence('child')
  child.pose = { translation: [2, 3, 4], rotation: rotationExp([.2, -.1, .3]) }
  const localPlane: AssemblyMate = { id: 'internal', name: 'Original local plane', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: { occurrencePath: ['child'], definition: child.definition }, plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original internally solved source',
    occurrences: [child], mates: [localPlane], createdAt: stamp, updatedAt: stamp })
  const first = occurrence('sub-a', 'sub', true), second = occurrence('sub-b', 'sub')
  first.pose = { translation: [4, 5, 6], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  second.pose.translation = [-7, 8, 9]; input.occurrences = [first, second]
  input.mates = [{ ...structuredClone(localPlane), id: 'parent', name: 'Original nested parent plane',
    first: { kind: 'principal-plane', component: { occurrencePath: ['sub-b', 'child'], definition: child.definition }, plane: 'XY' } }]
  const before = serializeAssemblyDocument(input), preview = ready(input), sub = preview.document.definitions.find(item => item.id === 'sub')!
  if (sub.kind !== 'assembly') throw new Error('Expected subassembly')
  expect(preview.scopes.map(item => item.result.localDOF)).toEqual([3, 3]); expect(preview.checks).toHaveLength(3)
  expect(Math.abs(sub.occurrences[0].pose.translation[2])).toBeLessThan(1e-6)
  expect(Math.abs(preview.document.occurrences[1].pose.translation[2])).toBeLessThan(1e-6)
  expect(preview.document.occurrences[0].pose).toEqual(first.pose); expect(serializeAssemblyDocument(input)).toBe(before)
  discardAssemblySolvePreview(preview)
}, 60_000)

it('rejects an inconsistent fixed child in its local scope before changing either reused parent placement', () => {
  const input = document(), child = occurrence('child', 'pin', true); child.pose.translation[2] = 2
  input.definitions.push({ kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original inconsistent child', createdAt: stamp, updatedAt: stamp,
    occurrences: [child], mates: [{ id: 'fixed-plane', name: 'Original fixed local contradiction', type: 'coincident', suppressed: false, alignment: 'aligned',
      first: { kind: 'principal-plane', component: { occurrencePath: ['child'], definition: child.definition }, plane: 'XY' },
      second: { kind: 'principal-plane', component: null, plane: 'XY' } }] })
  input.occurrences = [occurrence('sub-a', 'sub'), occurrence('sub-b', 'sub')]
  const before = serializeAssemblyDocument(input), result = prepareAssemblySolve(input)
  expect(result.status).toBe('rejected'); if (result.status !== 'rejected') throw new Error('Expected rejection')
  expect(result.scopes).toHaveLength(1); expect(result.scopes[0].definition.id).toBe('sub')
  expect(result.scopes[0].result.status).toBe('inconsistent'); expect(result.scopes[0].result.certificates[0].kind).toBe('fixedConstraint')
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)
