import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { expandAssemblyParts, parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDocument, type AssemblyFaceReference, type AssemblyMate,
  type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { planAssemblyComponentMove, type AssemblyComponentMove } from '../model/assemblyMovement'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import * as numeric from '../model/assemblySolver'
import { bodyBoolean, validateBodyShape } from './kernel.bodies'
import { CadEngine } from './kernel.engine'
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyScene, type AssemblySceneFace } from './kernel.assembly-types'
import { applyAssemblySolvePreview, captureAssemblyComponentLock, captureAssemblyConcentricRotationLock,
  discardAssemblySolvePreview, prepareAssemblyMovePreview, prepareAssemblySolve, type AssemblySolvePreview } from './kernel.assembly-solve'
import type { Vec3 } from './kernel.types'

// Original public-feature fixture: 40×30×4 plate with two R3 holes at ±10X;
// two reused R2×12 pins, each with an R.25 bore centered locally at (1,0).
// The initial placement comes from a native face solve. An accepted identity
// movement establishes the before-spin probe frame, then the requested Z90
// swaps bore/material locations. Expected solved translations are assertions,
// not input poses for the initial solve. These are discrete movement checks,
// not a swept collision or continuous drag test.
const z90: RigidPose['rotation'] = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
const x90: RigidPose['rotation'] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
let baseline: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const input = mated(), initial = normal(input), solved = applyAssemblySolvePreview(new AssemblyDocumentHistory(input), initial)
  near(occurrence(solved, 'left').pose.translation, [-10, 0, -8]); near(occurrence(solved, 'right').pose.translation, [10, 0, -8])
  occurrence(solved, 'right').fixed = true
  const identity = movement(solved, request(solved, 'left', { ...occurrence(solved, 'left').pose, rotation: [0, 0, 0, 1] }))
  baseline = applyAssemblySolvePreview(new AssemblyDocumentHistory(solved), identity)
}, 60_000)
const near = (actual: readonly number[], expected: readonly number[], tolerance = 1e-6) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(tolerance))
}
function occurrence(input: AssemblyDocument, id: string): AssemblyOccurrence {
  const value = input.occurrences.find(item => item.id === id)
  if (!value) throw new Error('Original occurrence missing')
  return value
}
function component(input: AssemblyDocument, id: string): AssemblyComponentReference {
  return { occurrencePath: [id], definition: { ...occurrence(input, id).definition } }
}
function request(input: AssemblyDocument, id = 'left', pose?: RigidPose): AssemblyComponentMove {
  return { component: component(input, id), pose: pose ?? { translation: [...occurrence(input, id).pose.translation], rotation: [...z90] } }
}
function select(scene: AssemblyScene, id: string, predicate: (face: AssemblySceneFace) => boolean): AssemblySceneFace {
  const matches = scene.bodies.filter(body => body.component.occurrencePath.length === 1 && body.component.occurrencePath[0] === id)
    .flatMap(body => body.faces).filter(predicate)
  expect(matches).toHaveLength(1); return matches[0]
}
function reference(face: AssemblySceneFace): AssemblyFaceReference {
  const value = assemblySceneFaceReference(face)
  if (!value) throw new Error('Actual analytic native face expected')
  return value
}
const cylinder = (radius: number, x: number) => (face: AssemblySceneFace) => face.support?.kind === 'cylinder'
  && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9
const cap = (z: number) => (face: AssemblySceneFace) => face.support?.kind === 'plane'
  && Math.abs(face.support.point[2] - z) < 1e-9 && face.support.normal[2] > .99
function mated(): AssemblyDocument {
  const input = createAssemblyExample(), scene = buildAssemblyScene(input), mates: AssemblyMate[] = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const pin = select(scene, id, cylinder(2, 0)), hole = select(scene, 'plate', cylinder(3, x))
    const pinSupport = pin.support, holeSupport = hole.support
    if (pinSupport?.kind !== 'cylinder' || holeSupport?.kind !== 'cylinder') throw new Error('Native cylinder expected')
    const direction = pinSupport.axis.reduce((sum, value, axis) => sum + value * holeSupport.axis[axis], 0)
    const first = reference(pin), second = reference(hole)
    mates.push({ id: id + '-axis', name: id + ' native axis', type: 'concentric', suppressed: false,
      first: { ...first, support: 'axis' }, second: { ...second, support: 'axis' }, alignment: direction > 0 ? 'aligned' : 'opposed', rotationLock: null },
    { id: id + '-cap', name: id + ' native top', type: 'coincident', suppressed: false, alignment: 'aligned',
      first: { ...reference(select(scene, id, cap(12))), support: 'plane' }, second: { ...reference(select(scene, 'plate', cap(4))), support: 'plane' } })
  }
  input.mates = mates; return validateAssemblyDocument(input)
}
function normal(input: AssemblyDocument): AssemblySolvePreview {
  const result = prepareAssemblySolve(input)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  return result
}
function movement(input: AssemblyDocument, move = request(input)): AssemblySolvePreview {
  const result = prepareAssemblyMovePreview(input, move)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  return result
}
function nativeShape(owners: NativeOwners, input: AssemblyDocument, path: string[]): Shape3D {
  const expanded = expandAssemblyParts(input).find(item => JSON.stringify(item.path) === JSON.stringify(path))
  if (!expanded) throw new Error('Actual fixture expansion missing')
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
  expect(engine.build(expanded.definition.document.features).featureErrors).toEqual([])
  const body = expanded.definition.id === 'example-plate'
    ? { bodyId: 'plate-body', sourceFeatureId: 'hole-1' } : { bodyId: 'pin-body', sourceFeatureId: 'bore' }
  const copy = owners.own(engine.copyCurrentBodyShape(body))
  return owners.own(placeAssemblyShape(copy, expanded.worldPose))
}
function probe(shape: Shape3D, center: Vec3, volume: number): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(value => value - .05) as Vec3, center.map(value => value + .05) as Vec3))
    const common = owners.own(bodyBoolean('common', shape, cube))
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - volume)).toBeLessThan(1e-7)
  })
}
function pinMetrics(owners: NativeOwners, shape: Shape3D, x: number): void {
  validateBodyShape(shape); expect(owners.ownAll(shape.solids)).toHaveLength(1)
  expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - 189 * Math.PI / 4)).toBeLessThan(1e-5)
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - 495 * Math.PI / 8)).toBeLessThan(1e-5)
  const bounds = owners.own(shape.boundingBox).bounds
  near(bounds[0], [x - 2, -2, -8]); near(bounds[1], [x + 2, 2, 4])
}
function nested(): AssemblyDocument {
  const input = createAssemblyExample(), pin = occurrence(input, 'left')
  pin.id = 'child'; pin.pose = { translation: [1, 2, 0], rotation: [0, 0, 0, 1] }
  const sub: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'shared', revision: 'r1', name: 'Original shared pin',
    createdAt: input.createdAt, updatedAt: input.updatedAt, occurrences: [pin], mates: [
      { id: 'local-plane', name: 'Original local XY', type: 'coincident', suppressed: false, alignment: 'aligned',
        first: { kind: 'principal-plane', component: { occurrencePath: ['child'], definition: { ...pin.definition } }, plane: 'XY' },
        second: { kind: 'principal-plane', component: null, plane: 'XY' } },
    ] }
  const parent = (id: string, pose: RigidPose): AssemblyOccurrence => ({ id, name: id, definition: { id: 'shared', revision: 'r1' },
    pose, fixed: true, suppressed: false, visible: true })
  input.occurrences = [parent('A', { translation: [30, 0, 0], rotation: [0, 0, 0, 1] }),
    parent('B', { translation: [0, 40, 0], rotation: [...z90] }), parent('suppressed', identityRigidPose())]
  input.occurrences[2].suppressed = true; input.definitions.push(sub)
  return validateAssemblyDocument(input)
}
function nestedRequest(input: AssemblyDocument): AssemblyComponentMove {
  const sub = input.definitions.find(item => item.id === 'shared')
  if (!sub || sub.kind !== 'assembly') throw new Error('Original scope missing')
  return { component: { occurrencePath: ['A', 'child'], definition: { ...sub.occurrences[0].definition } },
    pose: { translation: [4, 5, 0], rotation: [...z90] } }
}

it('accepts Z90 with current native mates, preserves material and leaves other anchors unchanged', () => {
  const input = validateAssemblyDocument(baseline), before = serializeAssemblyDocument(input), move = request(input), preview = movement(input, move)
  expect(preview.movement).toMatchObject({ component: move.component, scope: { id: input.id, revision: input.revision },
    targetPose: move.pose, affectedPaths: [['left']], temporaryAnchor: true, lengthTolerance: 1e-6, angleTolerance: 1e-8 })
  expect(preview.movement!.lengthResidual).toBeLessThanOrEqual(1e-6); expect(preview.movement!.angleResidual).toBeLessThanOrEqual(1e-8)
  expect(preview.scopes).toHaveLength(1); expect(preview.scopes[0].temporaryAnchor).toEqual({ occurrenceId: 'left' })
  expect(preview.scopes[0].result.localDOF).toBe(0); expect(preview.checks).toHaveLength(4)
  expect(preview.checks.every(check => check.satisfied)).toBe(true)
  const solved = validateAssemblyDocument(preview.document)
  expect(occurrence(solved, 'left').fixed).toBe(false); expect(solved.mates).toEqual(input.mates)
  expect(occurrence(solved, 'right')).toEqual(occurrence(input, 'right')); expect(occurrence(solved, 'plate')).toEqual(occurrence(input, 'plate'))
  withNativeOwners(owners => {
    const original = nativeShape(owners, input, ['left']), moved = nativeShape(owners, solved, ['left'])
    pinMetrics(owners, original, -10); pinMetrics(owners, moved, -10)
    probe(original, [-9, 0, -2], 0); probe(original, [-10, 1, -2], .001)
    probe(moved, [-10, 1, -2], 0); probe(moved, [-9, 0, -2], .001)
    const plate = nativeShape(owners, solved, ['plate']), right = nativeShape(owners, solved, ['right'])
    validateBodyShape(plate); pinMetrics(owners, right, 10)
    const bounds = owners.own(plate.boundingBox).bounds
    near(bounds[0], [-20, -15, 0]); near(bounds[1], [20, 15, 4])
    expect(Math.abs(owners.own(measureShapeVolumeProperties(plate)).volume - (4800 - 72 * Math.PI))).toBeLessThan(1e-5)
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(plate)).area - (2960 + 12 * Math.PI))).toBeLessThan(1e-5)
    probe(plate, [-10, 0, 2], 0); probe(plate, [10, 0, 2], 0); probe(plate, [0, 0, 2], .001)
  })
  expect(serializeAssemblyDocument(input)).toBe(before); discardAssemblySolvePreview(preview)
}, 60_000)

it.each(['lateral', 'off-axis', 'cap-offset'] as const)('rejects %s targets without removing a relation or publishing a pose', kind => {
  const input = validateAssemblyDocument(baseline), history = new AssemblyDocumentHistory(input), before = serializeAssemblyDocument(input), move = request(input)
  if (kind === 'lateral') move.pose.translation[0] += 1
  if (kind === 'off-axis') move.pose.rotation = [...x90]
  if (kind === 'cap-offset') move.pose.translation[2] += 1
  const result = prepareAssemblyMovePreview(input, move)
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect('movement' in result).toBe(false)
  expect(serializeAssemblyDocument(input)).toBe(before); expect(serializeAssemblyDocument(history.current)).toBe(before); expect(history.canUndo).toBe(false)
}, 60_000)

it.each(['spin', 'full'] as const)('respects a previously captured %s lock when a new spin is requested', kind => {
  const input = validateAssemblyDocument(baseline), existing = normal(input)
  const locked = kind === 'spin' ? captureAssemblyConcentricRotationLock(existing, input, 'left-axis')
    : captureAssemblyComponentLock(existing, input, component(input, 'plate'), component(input, 'left'))
  discardAssemblySolvePreview(existing)
  const before = serializeAssemblyDocument(locked), result = prepareAssemblyMovePreview(locked, request(locked))
  expect(result.status).toBe('rejected'); expect(serializeAssemblyDocument(locked)).toBe(before)
}, 60_000)

it('rejects even a no-op target on a saved fixed occurrence before constructing native owners', () => {
  const input = validateAssemblyDocument(baseline), spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), render = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const result = prepareAssemblyMovePreview(input, request(input, 'right', structuredClone(occurrence(input, 'right').pose)))
    expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('reference')
    expect(spy).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled()
  } finally { render.mockRestore(); spy.mockRestore() }
})

it('applies against the original source once and restores the natural mobility after Undo/Redo and reopen', () => {
  const input = validateAssemblyDocument(baseline), before = serializeAssemblyDocument(input), move = request(input), preview = movement(input, move)
  const staged = planAssemblyComponentMove(input, move)
  expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(staged.document), preview)).toThrow('El documento cambió')
  const history = new AssemblyDocumentHistory(input), applied = applyAssemblySolvePreview(history, preview)
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('ya se consumió')
  expect(applied.mates).toEqual(input.mates); expect(occurrence(applied, 'left').fixed).toBe(false)
  expect(serializeAssemblyDocument(history.undo())).toBe(before)
  expect(serializeAssemblyDocument(history.redo())).toBe(serializeAssemblyDocument(applied))
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = normal(reopened)
  expect('movement' in fresh).toBe(false); expect(fresh.scopes.every(scope => !scope.temporaryAnchor)).toBe(true)
  expect(fresh.scopes[0].result.localDOF).toBe(1); discardAssemblySolvePreview(fresh)
}, 60_000)

it('rejects cloned, discarded and changed-source movement capabilities with unchanged revision labels', () => {
  const input = validateAssemblyDocument(baseline), history = new AssemblyDocumentHistory(input), preview = movement(input)
  expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow('no fue verificada')
  history.commit({ type: 'rename-occurrence', occurrenceId: 'left', name: 'Original changed label' })
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('El documento cambió')
  history.undo(); discardAssemblySolvePreview(preview)
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('no fue verificada')
}, 60_000)

it('freezes detached movement evidence and treats opposite quaternion signs as one target rotation', () => {
  const input = validateAssemblyDocument(baseline), move = request(input)
  move.pose.rotation = z90.map(value => -value) as RigidPose['rotation']
  const preview = movement(input, move)
  expect(preview.movement!.angleResidual).toBeLessThanOrEqual(1e-8)
  expect(Object.isFrozen(preview.movement)).toBe(true); expect(Object.isFrozen(preview.movement!.targetPose.rotation)).toBe(true)
  expect(Object.isFrozen(preview.movement!.affectedPaths[0])).toBe(true)
  move.pose.translation[0] = 99; move.component.occurrencePath[0] = 'caller-edited'
  near(preview.movement!.targetPose.translation, [-10, 0, -8]); expect(preview.movement!.component.occurrencePath).toEqual(['left'])
  discardAssemblySolvePreview(preview)
}, 60_000)

it('captures an explicit persistent lock from moved frames only when separately requested', () => {
  const input = validateAssemblyDocument(baseline), preview = movement(input), locked = captureAssemblyConcentricRotationLock(preview, input, 'left-axis')
  expect(input.mates[0].type === 'concentric' && input.mates[0].rotationLock).toBeNull()
  expect(locked.mates[0].type === 'concentric' && locked.mates[0].rotationLock).not.toBeNull()
  const fresh = normal(locked)
  expect(fresh.scopes[0].result.localDOF).toBe(0); expect('movement' in fresh).toBe(false)
  withNativeOwners(owners => { const pin = nativeShape(owners, validateAssemblyDocument(fresh.document), ['left']); probe(pin, [-10, 1, -2], 0); probe(pin, [-9, 0, -2], .001) })
  discardAssemblySolvePreview(preview); discardAssemblySolvePreview(fresh)
}, 60_000)

it('solves another free occurrence jointly instead of changing the saved fixed state or lock', () => {
  const input = createAssemblyExample(); input.occurrences = input.occurrences.filter(item => item.id !== 'plate')
  input.occurrences.forEach(item => { item.pose = identityRigidPose() }); occurrence(input, 'right').pose.translation = [5, 0, 0]
  input.mates = [{ id: 'coupled', name: 'Original relative component placement', type: 'lock', suppressed: false,
    first: component(input, 'left'), second: component(input, 'right'), relativePose: { translation: [5, 0, 0], rotation: [0, 0, 0, 1] } }]
  const target = { translation: [10, 20, 30] as Vec3, rotation: [...z90] as RigidPose['rotation'] }, preview = movement(input, request(input, 'left', target))
  near(preview.document.occurrences[1].pose.translation, [10, 25, 30])
  const [qx, qy, qz, qw] = preview.document.occurrences[1].pose.rotation
  // Cartesian R*x for Z90, independent of quaternion sign/canonicalization.
  near([1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy + qw * qz), 2 * (qx * qz - qw * qy)], [0, 1, 0])
  expect(preview.document.occurrences.every(item => !item.fixed)).toBe(true); expect(preview.document.mates).toEqual(input.mates)
  expect(preview.scopes[0].result.localDOF).toBe(0); expect(preview.checks[0].satisfied).toBe(true)
  const natural = normal(validateAssemblyDocument(preview.document)); expect(natural.scopes[0].result.localDOF).toBe(6)
  discardAssemblySolvePreview(preview); discardAssemblySolvePreview(natural)
}, 60_000)

it('drives only the exact shared local scope below fixed parents and verifies both actual native expansions', () => {
  const input = nested(), before = serializeAssemblyDocument(input), move = nestedRequest(input), preview = movement(input, move)
  expect(preview.scopes.map(scope => scope.definition.id)).toEqual(['shared', input.id])
  expect(preview.scopes[0].temporaryAnchor).toEqual({ occurrenceId: 'child' }); expect(preview.scopes[1].temporaryAnchor).toBeUndefined()
  expect(preview.movement!.scope).toEqual({ id: 'shared', revision: 'r1' })
  expect(preview.movement!.affectedPaths).toEqual([['A', 'child'], ['B', 'child'], ['suppressed', 'child']])
  expect(preview.movement!.resolvedPose).toEqual(move.pose); expect(preview.checks).toHaveLength(2)
  const solved = validateAssemblyDocument(preview.document), scene = buildAssemblyScene(solved)
  expect(solved.occurrences).toEqual(input.occurrences); expect(scene.bodies).toHaveLength(2)
  near(scene.bodies[0].worldPose.translation, [34, 5, 0]); near(scene.bodies[1].worldPose.translation, [-5, 44, 0])
  withNativeOwners(owners => {
    const a = nativeShape(owners, solved, ['A', 'child']), b = nativeShape(owners, solved, ['B', 'child'])
    validateBodyShape(a); validateBodyShape(b)
    probe(a, [34, 6, 6], 0); probe(a, [35, 5, 6], .001)
    probe(b, [-6, 44, 6], 0); probe(b, [-5, 43, 6], .001)
    const aBounds = owners.own(a.boundingBox).bounds, bBounds = owners.own(b.boundingBox).bounds
    near(aBounds[0], [32, 3, 0]); near(aBounds[1], [36, 7, 12])
    near(bBounds[0], [-7, 42, 0]); near(bBounds[1], [-3, 46, 12])
  })
  const natural = normal(solved)
  expect(natural.scopes[0].result.localDOF).toBe(3); expect(natural.scopes[0].temporaryAnchor).toBeUndefined()
  expect(serializeAssemblyDocument(input)).toBe(before); discardAssemblySolvePreview(preview); discardAssemblySolvePreview(natural)
}, 60_000)

it('solves a driven subassembly as a rigid parent occurrence after its local child solve', () => {
  const input = nested(); input.occurrences[0].fixed = false
  const target: RigidPose = { translation: [10, 20, 30], rotation: [...z90] }
  const preview = movement(input, { component: { occurrencePath: ['A'], definition: { id: 'shared', revision: 'r1' } }, pose: target })
  expect(preview.scopes[0].temporaryAnchor).toBeUndefined(); expect(preview.scopes[0].result.localDOF).toBe(3)
  expect(preview.scopes[1].temporaryAnchor).toEqual({ occurrenceId: 'A' }); expect(preview.movement!.resolvedPose).toEqual(target)
  const scene = buildAssemblyScene(validateAssemblyDocument(preview.document)), child = scene.bodies.find(body => body.component.occurrencePath[0] === 'A')!
  near(child.worldPose.translation, [8, 21, 30]); expect(preview.checks).toHaveLength(2)
  discardAssemblySolvePreview(preview)
}, 60_000)

it('keeps a same-ID different-revision shared declaration outside the temporary anchor scope', () => {
  const input = nested(), selected = input.definitions.find(item => item.id === 'shared')!
  if (selected.kind !== 'assembly') throw new Error('Original shared scope missing')
  const older = structuredClone(selected); older.revision = 'r0'; older.mates = []; older.occurrences[0].pose.translation = [7, 8, 0]
  input.definitions.push(older)
  input.occurrences.push({ ...structuredClone(input.occurrences[0]), id: 'older', definition: { id: 'shared', revision: 'r0' } })
  const preview = movement(input, nestedRequest(input))
  const currentScope = preview.scopes.find(scope => scope.definition.id === 'shared' && scope.definition.revision === 'r1')!,
    oldScope = preview.scopes.find(scope => scope.definition.id === 'shared' && scope.definition.revision === 'r0')!
  expect(currentScope.temporaryAnchor).toEqual({ occurrenceId: 'child' }); expect(oldScope.temporaryAnchor).toBeUndefined()
  expect(oldScope.result.localDOF).toBe(6); expect(preview.document.definitions.find(item => item.id === 'shared' && item.revision === 'r0')).toEqual(older)
  expect(preview.movement!.affectedPaths).not.toContainEqual(['older', 'child']); discardAssemblySolvePreview(preview)
}, 60_000)

it('accepts an unconstrained half-turn target without relying on a singular rotation-log chart', () => {
  const input = createAssemblyExample(), move = request(input, 'left', { translation: [-4, 3, -2], rotation: [0, 0, 1, 0] })
  const preview = movement(input, move), solved = validateAssemblyDocument(preview.document)
  expect(preview.movement!.angleResidual).toBeLessThanOrEqual(1e-8); near(preview.movement!.resolvedPose.translation, [-4, 3, -2])
  withNativeOwners(owners => {
    const pin = nativeShape(owners, solved, ['left']), bounds = owners.own(pin.boundingBox).bounds
    validateBodyShape(pin); near(bounds[0], [-6, 1, -2]); near(bounds[1], [-2, 5, 10])
    probe(pin, [-5, 3, 4], 0); probe(pin, [-4, 2, 4], .001)
  })
  discardAssemblySolvePreview(preview)
}, 60_000)

it.each(['stale', 'suppressed', 'undefined'] as const)('rejects %s movement intent rather than falling back to a normal solve', kind => {
  const input = nested(), move = nestedRequest(input)
  if (kind === 'stale') move.component.definition.revision = 'r0'
  if (kind === 'suppressed') move.component.occurrencePath[0] = 'suppressed'
  const result = prepareAssemblyMovePreview(input, kind === 'undefined' ? undefined as unknown as AssemblyComponentMove : move)
  expect(result.status).toBe('rejected'); expect('movement' in result).toBe(false)
})

it('withholds a preview when a real source reconstruction fails', () => {
  const input = validateAssemblyDocument(baseline), source = input.definitions.find(item => item.id === 'example-pin')!
  if (source.kind !== 'part') throw new Error('Original pin missing')
  source.document.features.push({ id: 'remote-profile', name: 'Original rejected remote circle', type: 'sketch', plane: 'XY', offset: 0,
    suppressed: false, profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'remote-cut', name: 'Original rejected remote cut', type: 'cut', sketchId: 'remote-profile', depth: 12, symmetric: false, suppressed: false })
  const before = serializeAssemblyDocument(input), result = prepareAssemblyMovePreview(input, request(input))
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('No se pudo reconstruir')
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('publishes no movement authority after native owner release fails', () => {
  const input = validateAssemblyDocument(baseline), real = CadEngine.prototype.dispose; let released = 0
  const spy = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { real.call(this); released++; throw new Error('Original movement release fault') })
  try {
    const result = prepareAssemblyMovePreview(input, request(input))
    expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
    if (result.status === 'rejected') expect(result.message).toContain('release failed')
    expect(released).toBeGreaterThan(0)
  } finally { spy.mockRestore() }
}, 60_000)

it.each(['translation', 'rotation'] as const)('independently rejects post-solve %s target drift despite a completed numerical solve', kind => {
  // Control-flow fault on the actual returned result: no fake native witness,
  // status or accepted residual is substituted. With no mates, final native
  // relation checks cannot mask a missing explicit target-retention check.
  const input = createAssemblyExample(), move = request(input), real = numeric.solveRigidMates
  const spy = vi.spyOn(numeric, 'solveRigidMates').mockImplementation((problem, options) => {
    const result = real(problem, options), pose = result.poses?.get('left')
    if (pose) {
      if (kind === 'translation') { pose.translation[0] += .8e-6; pose.translation[1] += .8e-6 }
      else pose.rotation = [0, 0, Math.sin(Math.PI / 4 + 1e-8), Math.cos(Math.PI / 4 + 1e-8)]
    }
    return result
  })
  try {
    const result = prepareAssemblyMovePreview(input, move)
    expect(result.status).toBe('rejected'); if (result.status === 'rejected') { expect(result.reason).toBe('verification'); expect(result.message).toContain('objetivo local') }
  } finally { spy.mockRestore() }
}, 60_000)

it('captures a detached request before native work and rejects Apply after the live original source changes', () => {
  const input = validateAssemblyDocument(baseline), move = request(input), real = CadEngine.prototype.rebuildForAssemblyReferences; let calls = 0
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function(this: CadEngine, features) {
    const result = real.call(this, features)
    if (++calls === 1) { occurrence(input, 'left').name = 'Caller changed during native work'; move.pose.translation[0] = 99 }
    return result
  })
  try {
    const preview = movement(input, move)
    near(preview.movement!.targetPose.translation, [-10, 0, -8]); expect(occurrence(validateAssemblyDocument(preview.document), 'left').name).not.toContain('Caller changed')
    expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(input), preview)).toThrow('El documento cambió')
    discardAssemblySolvePreview(preview)
  } finally { spy.mockRestore() }
}, 60_000)
