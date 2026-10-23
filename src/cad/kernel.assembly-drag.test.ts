import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { expandAssemblyParts, parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDocument, type AssemblyMate, type AssemblyOccurrence,
  type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { planAssemblyWorldComponentMove, type AssemblyWorldComponentMove } from '../model/assemblyDrag'
import type { RigidPose } from '../model/rigidPose'
import * as numeric from '../model/assemblySolver'
import { bodyBoolean, validateBodyShape } from './kernel.bodies'
import { CadEngine } from './kernel.engine'
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyScene, type AssemblySceneFace } from './kernel.assembly-types'
import { applyAssemblySolvePreview, captureAssemblyConcentricRotationLock, discardAssemblySolvePreview,
  prepareAssemblyMovePreview, prepareAssemblySolve, prepareAssemblyWorldMovePreview,
  type AssemblySolveOptions, type AssemblySolvePreview } from './kernel.assembly-solve'
import type { Vec3 } from './kernel.types'

// Original public-feature plate/pins, reused from the library: a 40×30×4 plate
// with two R3 holes and R2×12 pins with an eccentric R.25 bore at (1,0).
// Native mates establish the first placement; no expected solved coordinates
// seed that solve. The second fixture reuses two pins per rigid subassembly.
// Its selected child is locally Rx90 at [2,3,4], sibling I at [-2,1,0].
// Requested selected WORLD Rz90 at [10,20,30] therefore requires root owner
// Rz90*Rx(-90): (x,y,z)→(-z,x,-y), t=[14,18,33]. Those independent Cartesian
// oracles distinguish world/owner/local frames and multiplication order.
// These native frames are discrete proposals, not pointer scheduling, continuous
// collision detection, swept-path validation or flexible per-instance children.
const z90: RigidPose['rotation'] = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
const x90: RigidPose['rotation'] = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
let baseline: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const input = mated(), initial = normal(input), solved = applyAssemblySolvePreview(new AssemblyDocumentHistory(input), initial)
  near(occurrence(solved, 'left').pose.translation, [-10, 0, -8]); occurrence(solved, 'right').fixed = true
  const normalized = prepareAssemblyMovePreview(solved, { component: rootComponent(solved, 'left'),
    pose: { translation: [...occurrence(solved, 'left').pose.translation], rotation: [0, 0, 0, 1] } })
  if (normalized.status !== 'ready') throw new Error(normalized.message)
  baseline = applyAssemblySolvePreview(new AssemblyDocumentHistory(solved), normalized)
}, 60_000)
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-6): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(tolerance))
}
function occurrence(input: AssemblyDocument, id: string): AssemblyOccurrence {
  const value = input.occurrences.find(item => item.id === id)
  if (!value) throw new Error('Original occurrence missing')
  return value
}
function rootComponent(input: AssemblyDocument, id: string): AssemblyComponentReference {
  return { occurrencePath: [id], definition: { ...occurrence(input, id).definition } }
}
function select(scene: AssemblyScene, id: string, predicate: (face: AssemblySceneFace) => boolean): AssemblySceneFace {
  const values = scene.bodies.filter(body => body.component.occurrencePath.length === 1 && body.component.occurrencePath[0] === id)
    .flatMap(body => body.faces).filter(predicate)
  expect(values).toHaveLength(1); return values[0]
}
const cylinder = (radius: number, x: number) => (face: AssemblySceneFace) => face.support?.kind === 'cylinder'
  && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9
const cap = (z: number) => (face: AssemblySceneFace) => face.support?.kind === 'plane'
  && Math.abs(face.support.point[2] - z) < 1e-9 && face.support.normal[2] > .99
function mated(): AssemblyDocument {
  const input = createAssemblyExample(), scene = buildAssemblyScene(input), mates: AssemblyMate[] = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) {
    const pin = select(scene, id, cylinder(2, 0)), hole = select(scene, 'plate', cylinder(3, x)), a = pin.support, b = hole.support
    if (a?.kind !== 'cylinder' || b?.kind !== 'cylinder') throw new Error('Actual cylinders expected')
    const first = assemblySceneFaceReference(pin), second = assemblySceneFaceReference(hole),
      pinTop = assemblySceneFaceReference(select(scene, id, cap(12))), plateTop = assemblySceneFaceReference(select(scene, 'plate', cap(4)))
    if (!first || !second || !pinTop || !plateTop) throw new Error('Actual analytical faces expected')
    mates.push({ id: id + '-axis', name: id + ' actual cylinders', type: 'concentric', suppressed: false,
      first: { ...first, support: 'axis' }, second: { ...second, support: 'axis' },
      alignment: a.axis.reduce((sum, value, axis) => sum + value * b.axis[axis], 0) > 0 ? 'aligned' : 'opposed', rotationLock: null },
    { id: id + '-cap', name: id + ' actual caps', type: 'coincident', suppressed: false, alignment: 'aligned',
      first: { ...pinTop, support: 'plane' }, second: { ...plateTop, support: 'plane' } })
  }
  input.mates = mates; return validateAssemblyDocument(input)
}
function normal(input: AssemblyDocument): AssemblySolvePreview {
  const result = prepareAssemblySolve(input)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  return result
}
function world(input: AssemblyDocument, move: AssemblyWorldComponentMove, options?: AssemblySolveOptions): AssemblySolvePreview {
  const result = prepareAssemblyWorldMovePreview(input, move, options)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  return result
}
function nativeShape(owners: NativeOwners, input: AssemblyDocument, path: string[]): Shape3D {
  const item = expandAssemblyParts(input).find(value => JSON.stringify(value.path) === JSON.stringify(path))
  if (!item) throw new Error('Original expanded part missing')
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
  expect(engine.build(item.definition.document.features).featureErrors).toEqual([])
  const ref = item.definition.id === 'example-plate' ? { bodyId: 'plate-body', sourceFeatureId: 'hole-1' }
    : { bodyId: 'pin-body', sourceFeatureId: 'bore' }
  return owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape(ref)), item.worldPose))
}
function probe(shape: Shape3D, point: Vec3, expected: number): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(point.map(value => value - .05) as Vec3, point.map(value => value + .05) as Vec3)),
      common = owners.own(bodyBoolean('common', shape, cube))
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - expected)).toBeLessThan(1e-7)
  })
}
function pinMetrics(owners: NativeOwners, shape: Shape3D, minimum: Vec3, maximum: Vec3): void {
  validateBodyShape(shape); expect(owners.ownAll(shape.solids)).toHaveLength(1)
  expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - 189 * Math.PI / 4)).toBeLessThan(1e-5)
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - 495 * Math.PI / 8)).toBeLessThan(1e-5)
  const bounds = owners.own(shape.boundingBox).bounds; near(bounds[0], minimum); near(bounds[1], maximum)
}
function group(): AssemblyDocument {
  const input = createAssemblyExample(), child = occurrence(input, 'left'), sibling = occurrence(input, 'right')
  child.id = 'child'; child.fixed = true; child.pose = { translation: [2, 3, 4], rotation: [...x90] }
  sibling.id = 'sibling'; sibling.fixed = true; sibling.pose = { translation: [-2, 1, 0], rotation: [0, 0, 0, 1] }
  const sub: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'group', revision: 'r1', name: 'Original rigid two-pin configuration',
    createdAt: input.createdAt, updatedAt: input.updatedAt, occurrences: [child, sibling], mates: [
      { id: 'internal', name: 'Original configured relative placement', type: 'lock', suppressed: false,
        first: { occurrencePath: ['child'], definition: { ...child.definition } }, second: { occurrencePath: ['sibling'], definition: { ...sibling.definition } },
        relativePose: { translation: [-4, -4, 2], rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] } },
    ] }
  const parent = (id: string, pose: RigidPose, fixed: boolean): AssemblyOccurrence => ({ id, name: id, definition: { id: 'group', revision: 'r1' },
    pose, fixed, suppressed: false, visible: true })
  input.occurrences = [parent('A', { translation: [30, 0, 0], rotation: [...z90] }, false),
    parent('B', { translation: [-30, 10, 0], rotation: [0, 0, 0, 1] }, true)]
  input.definitions.push(sub); return validateAssemblyDocument(input)
}
function groupMove(): AssemblyWorldComponentMove {
  return { component: { occurrencePath: ['A', 'child'], definition: { id: 'example-pin', revision: 'r1' } },
    pose: { translation: [10, 20, 30], rotation: [...z90] } }
}
function subassembly(input: AssemblyDocument): EmbeddedAssemblyDefinition {
  const value = input.definitions.find(item => item.id === 'group' && item.revision === 'r1')
  if (!value || value.kind !== 'assembly') throw new Error('Original group missing')
  return value
}
function unsolvedGroup(): AssemblyDocument {
  const input = group(), sub = subassembly(input), child = sub.occurrences[0]
  child.fixed = false; child.pose = { translation: [2, 3, 6], rotation: [0, 0, 0, 1] }
  sub.mates = [{ id: 'child-plane', name: 'Original unsolved local XY', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: { occurrencePath: ['child'], definition: { ...child.definition } }, plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }]
  return validateAssemblyDocument(input)
}

it('moves a top-level real pin in WORLD while retaining native mates, body metrics and independent material probes', () => {
  const input = validateAssemblyDocument(baseline), before = serializeAssemblyDocument(input), move = { component: rootComponent(input, 'left'),
    pose: { translation: [...occurrence(input, 'left').pose.translation] as Vec3, rotation: [...z90] as RigidPose['rotation'] } }, preview = world(input, move)
  expect(preview.movement).toMatchObject({ frame: 'world', component: move.component, drivenComponent: move.component,
    targetPose: move.pose, temporaryAnchor: true, affectedPaths: [['left']] })
  expect(preview.movement!.lengthResidual).toBeLessThanOrEqual(1e-6); expect(preview.movement!.angleResidual).toBeLessThanOrEqual(1e-8)
  expect(preview.scopes[0].temporaryAnchor).toEqual({ occurrenceId: 'left' }); expect(preview.scopes[0].result.localDOF).toBe(0)
  expect(preview.checks).toHaveLength(4); expect(preview.checks.every(check => check.satisfied)).toBe(true)
  const solved = validateAssemblyDocument(preview.document)
  expect(solved.mates).toEqual(input.mates); expect(occurrence(solved, 'left').fixed).toBe(false)
  expect(occurrence(solved, 'plate')).toEqual(occurrence(input, 'plate')); expect(occurrence(solved, 'right')).toEqual(occurrence(input, 'right'))
  withNativeOwners(owners => {
    const original = nativeShape(owners, input, ['left']), moved = nativeShape(owners, solved, ['left'])
    pinMetrics(owners, original, [-12, -2, -8], [-8, 2, 4]); pinMetrics(owners, moved, [-12, -2, -8], [-8, 2, 4])
    probe(original, [-9, 0, -2], 0); probe(original, [-10, 1, -2], .001)
    probe(moved, [-10, 1, -2], 0); probe(moved, [-9, 0, -2], .001)
  })
  expect(serializeAssemblyDocument(input)).toBe(before); discardAssemblySolvePreview(preview)
}, 60_000)

it('moves the root rigid unit when the selected nested child is fixed, without editing the shared declaration or other reuse', () => {
  const input = group(), before = serializeAssemblyDocument(input), move = groupMove(), preview = world(input, move), solved = validateAssemblyDocument(preview.document)
  expect(preview.movement).toMatchObject({ frame: 'world', component: move.component,
    drivenComponent: { occurrencePath: ['A'], definition: { id: 'group', revision: 'r1' } }, scope: { id: input.id, revision: input.revision }, affectedPaths: [['A']] })
  expect(preview.scopes[0].temporaryAnchor).toBeUndefined(); expect(preview.scopes[1].temporaryAnchor).toEqual({ occurrenceId: 'A' })
  expect(preview.scopes[0].result.localDOF).toBe(0); expect(preview.scopes[1].result.localDOF).toBe(0)
  expect(subassembly(solved)).toEqual(subassembly(input)); expect(occurrence(solved, 'B')).toEqual(occurrence(input, 'B'))
  near(occurrence(solved, 'A').pose.translation, [14, 18, 33]); expect(occurrence(solved, 'A').fixed).toBe(false)
  const scene = buildAssemblyScene(solved)
  near(scene.bodies.find(body => body.component.occurrencePath.join('/') === 'A/child')!.worldPose.translation, [10, 20, 30])
  near(scene.bodies.find(body => body.component.occurrencePath.join('/') === 'A/sibling')!.worldPose.translation, [14, 16, 32])
  expect(scene.solidCount).toBe(4); expect(Math.abs(scene.volume - 189 * Math.PI)).toBeLessThan(1e-5)
  expect(Math.abs(scene.area - 495 * Math.PI / 2)).toBeLessThan(1e-5)
  withNativeOwners(owners => {
    const beforeChild = nativeShape(owners, input, ['A', 'child']), child = nativeShape(owners, solved, ['A', 'child']),
      sibling = nativeShape(owners, solved, ['A', 'sibling']), other = nativeShape(owners, solved, ['B', 'child'])
    pinMetrics(owners, beforeChild, [27, 0, 2], [39, 4, 6]); probe(beforeChild, [33, 3, 4], 0); probe(beforeChild, [33, 2, 5], .001)
    pinMetrics(owners, child, [8, 18, 30], [12, 22, 42]); probe(child, [10, 21, 36], 0); probe(child, [11, 20, 36], .001)
    pinMetrics(owners, sibling, [2, 14, 30], [14, 18, 34]); probe(sibling, [8, 17, 32], 0); probe(sibling, [8, 16, 31], .001)
    pinMetrics(owners, other, [-30, 1, 2], [-26, 13, 6])
  })
  expect(serializeAssemblyDocument(input)).toBe(before); discardAssemblySolvePreview(preview)
}, 60_000)

it('recomputes the selected relative frame AFTER a real unsolved child-plane solve', () => {
  const input = unsolvedGroup(), preview = world(input, groupMove()), solved = validateAssemblyDocument(preview.document), child = subassembly(solved).occurrences[0]
  expect(Math.abs(child.pose.translation[2])).toBeLessThan(1e-6)
  expect(Math.abs(occurrence(solved, 'A').pose.translation[2] - 30)).toBeLessThan(1e-6)
  expect(preview.scopes[0].result.localDOF).toBe(3); expect(preview.scopes[0].temporaryAnchor).toBeUndefined()
  expect(preview.movement!.frame).toBe('world'); near(preview.movement!.resolvedPose.translation, [10, 20, 30])
  expect(preview.checks).toHaveLength(2); expect(preview.checks.every(check => check.satisfied)).toBe(true)
  withNativeOwners(owners => {
    const selected = nativeShape(owners, solved, ['A', 'child'])
    pinMetrics(owners, selected, [8, 18, 30], [12, 22, 42]); probe(selected, [10, 21, 36], 0); probe(selected, [11, 20, 36], .001)
  })
  // The plane leaves child X/Y/spin free; no unique local X/Y position is claimed.
  expect(subassembly(input).occurrences[0].pose.translation[2]).toBe(6); discardAssemblySolvePreview(preview)
}, 60_000)

it('distinguishes local declaration movement from world rigid-owner movement in both witness and scope', () => {
  const input = unsolvedGroup(), selected = groupMove().component,
    local = prepareAssemblyMovePreview(input, { component: selected, pose: { translation: [4, 5, 0], rotation: [...z90] } })
  expect(local.status).toBe('ready'); if (local.status !== 'ready') throw new Error(local.message)
  expect(local.movement).toMatchObject({ frame: 'local', component: selected, drivenComponent: selected, scope: { id: 'group', revision: 'r1' },
    affectedPaths: [['A', 'child'], ['B', 'child']] })
  expect(local.scopes[0].temporaryAnchor).toEqual({ occurrenceId: 'child' }); expect(local.scopes[1].temporaryAnchor).toBeUndefined()
  const global = world(input, groupMove())
  expect(global.movement!.frame).toBe('world'); expect(global.movement!.drivenComponent.occurrencePath).toEqual(['A'])
  expect(global.movement!.affectedPaths).toEqual([['A']]); discardAssemblySolvePreview(local); discardAssemblySolvePreview(global)
}, 60_000)

it('rejects a fixed root owner even when the selected nested child is free and the target is a no-op', () => {
  const input = unsolvedGroup(); occurrence(input, 'A').fixed = true
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), render = vi.spyOn(CadEngine.prototype, 'build')
  try {
    const result = prepareAssemblyWorldMovePreview(input, { component: groupMove().component, pose: { translation: [27, 2, 6], rotation: [...z90] } })
    expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('reference')
    expect(spy).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled()
  } finally { render.mockRestore(); spy.mockRestore() }
})

it.each(['lateral', 'tilted', 'locked-spin'] as const)('rejects a WORLD %s target without suppressing current native relations', kind => {
  let input = validateAssemblyDocument(baseline)
  if (kind === 'locked-spin') { const existing = normal(input); input = captureAssemblyConcentricRotationLock(existing, input, 'left-axis'); discardAssemblySolvePreview(existing) }
  const before = serializeAssemblyDocument(input), move: AssemblyWorldComponentMove = { component: rootComponent(input, 'left'),
    pose: { translation: [...occurrence(input, 'left').pose.translation], rotation: [...z90] } }
  if (kind === 'lateral') move.pose.translation[0] += 1
  if (kind === 'tilted') move.pose.rotation = [...x90]
  const result = prepareAssemblyWorldMovePreview(input, move)
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it.each(['stale', 'suppressed-owner', 'suppressed-child', 'missing-path', 'undefined'] as const)('rejects %s WORLD intent instead of emitting normal-solve authority', kind => {
  const input = group(), move = groupMove()
  if (kind === 'stale') move.component.definition.revision = 'r0'
  if (kind === 'suppressed-owner') occurrence(input, 'A').suppressed = true
  if (kind === 'suppressed-child') subassembly(input).occurrences[0].suppressed = true
  if (kind === 'missing-path') move.component.occurrencePath[1] = 'missing'
  const result = prepareAssemblyWorldMovePreview(input, kind === 'undefined' ? undefined as unknown as AssemblyWorldComponentMove : move)
  expect(result.status).toBe('rejected'); expect('movement' in result).toBe(false)
})

it('keeps original-source single-use authority and one history transaction through Undo/Redo and reopen', () => {
  const input = group(), before = serializeAssemblyDocument(input), move = groupMove(), preview = world(input, move), history = new AssemblyDocumentHistory(input)
  expect(serializeAssemblyDocument(planAssemblyWorldComponentMove(input, move).document)).toBe(before)
  expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow('no fue verificada')
  const applied = applyAssemblySolvePreview(history, preview)
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('ya se consumió')
  expect(serializeAssemblyDocument(history.undo())).toBe(before); expect(serializeAssemblyDocument(history.redo())).toBe(serializeAssemblyDocument(applied))
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = normal(reopened)
  expect(fresh.scopes[1].result.localDOF).toBe(6); expect(fresh.scopes.every(scope => !scope.temporaryAnchor)).toBe(true)
  expect('movement' in fresh).toBe(false); expect(reopened.mates).toEqual(input.mates); expect(subassembly(reopened).mates).toEqual(subassembly(input).mates)
  discardAssemblySolvePreview(fresh)
}, 60_000)

it('allows independent native frames from one source but only the applied frame can advance that source history', () => {
  const input = group(), history = new AssemblyDocumentHistory(input), firstMove = groupMove(), secondMove = groupMove()
  secondMove.pose.translation[0] = 15
  const first = world(input, firstMove), latest = world(input, secondMove), applied = applyAssemblySolvePreview(history, latest)
  near(latest.movement!.resolvedPose.translation, [15, 20, 30]); expect(occurrence(applied, 'A').fixed).toBe(false)
  expect(() => applyAssemblySolvePreview(history, first)).toThrow('El documento cambió'); discardAssemblySolvePreview(first)
  const canceled = world(applied, firstMove); discardAssemblySolvePreview(canceled)
  expect(() => applyAssemblySolvePreview(history, canceled)).toThrow('no fue verificada')
}, 60_000)

it('keeps a frozen detached WORLD witness, including q/−q equivalence, without storing drag state', () => {
  const input = group(), move = groupMove(); move.pose.rotation = move.pose.rotation.map(value => -value) as RigidPose['rotation']
  const preview = world(input, move)
  expect(Object.isFrozen(preview.movement)).toBe(true); expect(Object.isFrozen(preview.movement!.drivenComponent.occurrencePath)).toBe(true)
  expect(preview.movement!.angleResidual).toBeLessThanOrEqual(1e-8)
  move.pose.translation[0] = 99; move.component.occurrencePath[0] = 'caller-edited'
  near(preview.movement!.targetPose.translation, [10, 20, 30]); expect(preview.movement!.component.occurrencePath).toEqual(['A', 'child'])
  expect('movement' in preview.document).toBe(false); expect('temporaryAnchor' in preview.document.occurrences[0]).toBe(false)
  discardAssemblySolvePreview(preview)
}, 60_000)

it('reports the original requested target policy rather than substituting defaults or native mate tolerances', () => {
  const input = group(), preview = world(input, groupMove(), { lengthTolerance: 2e-8, angleTolerance: 3e-9 })
  expect(preview.movement!.lengthTolerance).toBe(2e-8); expect(preview.movement!.angleTolerance).toBe(3e-9)
  expect(preview.movement!.lengthResidual).toBeLessThanOrEqual(2e-8); expect(preview.movement!.angleResidual).toBeLessThanOrEqual(3e-9)
  discardAssemblySolvePreview(preview)
}, 60_000)

it.each(['translation', 'rotation'] as const)('rejects WORLD selected %s drift independently of successful final internal mate checks', kind => {
  // Fault only the actual returned root solve poses. Internal rigid relations
  // remain satisfied, so only the selected WORLD target guard can reject it.
  const input = group(), real = numeric.solveRigidMates
  const spy = vi.spyOn(numeric, 'solveRigidMates').mockImplementation((problem, options) => {
    const result = real(problem, options), pose = result.poses?.get('A')
    if (pose) {
      if (kind === 'translation') { pose.translation[0] += .8e-6; pose.translation[1] += .8e-6 }
      else {
        const [x, y, z, w] = pose.rotation, s = Math.sin(1e-8), c = Math.cos(1e-8)
        pose.rotation = [c * x - s * y, c * y + s * x, c * z + s * w, c * w - s * z]
      }
    }
    return result
  })
  try {
    const result = prepareAssemblyWorldMovePreview(input, groupMove())
    expect(result.status).toBe('rejected'); if (result.status === 'rejected') { expect(result.reason).toBe('verification'); expect(result.message).toContain('objetivo global') }
  } finally { spy.mockRestore() }
}, 60_000)

it('withholds WORLD authority if an actual prototype reconstruction fails under unchanged source revision labels', () => {
  const input = group(), part = input.definitions.find(item => item.id === 'example-pin')!
  if (part.kind !== 'part') throw new Error('Original pin missing')
  part.document.features.push({ id: 'remote-profile', name: 'Original rejected remote profile', type: 'sketch', plane: 'XY', offset: 0,
    suppressed: false, profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'remote-cut', name: 'Original rejected remote cut', type: 'cut', sketchId: 'remote-profile', depth: 12, symmetric: false, suppressed: false })
  const before = serializeAssemblyDocument(input), result = prepareAssemblyWorldMovePreview(input, groupMove())
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('No se pudo reconstruir')
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('publishes no WORLD capability when real received native owners fail to release', () => {
  const input = group(), real = CadEngine.prototype.dispose; let released = 0
  const spy = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { real.call(this); released++; throw new Error('Original world-frame release fault') })
  try {
    const result = prepareAssemblyWorldMovePreview(input, groupMove())
    expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect(released).toBeGreaterThan(0)
    if (result.status === 'rejected') expect(result.message).toContain('release failed')
  } finally { spy.mockRestore() }
}, 60_000)

it('captures source/target before native work and rejects Apply if the original live source subsequently changes', () => {
  const input = group(), move = groupMove(), real = CadEngine.prototype.rebuildForAssemblyReferences; let calls = 0
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function(this: CadEngine, features) {
    const result = real.call(this, features)
    if (++calls === 1) { occurrence(input, 'A').name = 'Caller changed during native solve'; move.pose.translation[0] = 99 }
    return result
  })
  try {
    const preview = world(input, move); near(preview.movement!.targetPose.translation, [10, 20, 30])
    expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(input), preview)).toThrow('El documento cambió')
    discardAssemblySolvePreview(preview)
  } finally { spy.mockRestore() }
}, 60_000)
