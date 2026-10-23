import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { expandAssemblyParts, parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDocument, type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import type { AssemblyComponentDrag } from '../model/assemblyProjectionIntent'
import * as numeric from '../model/assemblyProjection'
import { CadEngine } from './kernel.engine'
import { bodyBoolean, validateBodyShape } from './kernel.bodies'
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyScene, type AssemblySceneFace } from './kernel.assembly-types'
import { applyAssemblySolvePreview, captureAssemblyConcentricRotationLock, discardAssemblySolvePreview,
  prepareAssemblyDragPreview, prepareAssemblyMovePreview, prepareAssemblySolve, prepareAssemblyWorldMovePreview,
  type AssemblySolveOptions, type AssemblySolvePreview } from './kernel.assembly-solve'
import type { Vec3 } from './kernel.types'

// Original public-feature R2×12 pins with an eccentric R.25 bore at (1,0).
// Slider: actual native concentric supports plus an authenticated spin lock;
// [13,4,z+5] projects to [10,0,z+5], positional residual sqrt(3²+4²)=5.
// Hinge: ground/axle native cylinders and top caps keep the root origin at zero;
// a fixed payload at local [1,0,0] follows its root's free Z spin. [0,2,0]
// projects to [0,1,0], Rz90. Fixtures and expectations are original; this file
// checks discrete native candidates, not swept collision or global optimality.
const z90: RigidPose['rotation'] = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
let slider: AssemblyDocument, hinge: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const input = sliderInput(), initial = ready(prepareAssemblySolve(input))
  const locked = captureAssemblyConcentricRotationLock(initial, input, 'slider-axis'); discardAssemblySolvePreview(initial)
  slider = applyAssemblySolvePreview(new AssemblyDocumentHistory(locked), ready(prepareAssemblySolve(locked)))
  near(occurrence(slider, 'right').pose.translation.slice(0, 2), [10, 0])
  const hingeSource = hingeInput()
  hinge = applyAssemblySolvePreview(new AssemblyDocumentHistory(hingeSource), ready(prepareAssemblySolve(hingeSource)))
}, 60_000)
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-6): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, axis) => expect(Math.abs(value - expected[axis])).toBeLessThan(tolerance))
}
function occurrence(input: AssemblyDocument, id: string): AssemblyOccurrence {
  const value = input.occurrences.find(item => item.id === id)
  if (!value) throw new Error('Original occurrence missing')
  return value
}
function component(input: AssemblyDocument, id: string): AssemblyComponentReference {
  return { occurrencePath: [id], definition: { ...occurrence(input, id).definition } }
}
function ready(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function select(scene: AssemblyScene, path: string[], predicate: (face: AssemblySceneFace) => boolean): AssemblySceneFace {
  const found = scene.bodies.filter(body => JSON.stringify(body.component.occurrencePath) === JSON.stringify(path))
    .flatMap(body => body.faces).filter(predicate)
  expect(found).toHaveLength(1); return found[0]
}
const cylinder = (radius: number, x = 0) => (face: AssemblySceneFace) => face.support?.kind === 'cylinder'
  && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9
const cap = (z: number) => (face: AssemblySceneFace) => face.support?.kind === 'plane'
  && Math.abs(face.support.point[2] - z) < 1e-9 && face.support.normal[2] > .99
function sliderInput(): AssemblyDocument {
  const input = createAssemblyExample(); occurrence(input, 'left').fixed = true
  const scene = buildAssemblyScene(input), pin = select(scene, ['right'], cylinder(2)), hole = select(scene, ['plate'], cylinder(3, 10))
  const first = assemblySceneFaceReference(pin), second = assemblySceneFaceReference(hole), a = pin.support, b = hole.support
  if (!first || !second || a?.kind !== 'cylinder' || b?.kind !== 'cylinder') throw new Error('Actual native cylinders expected')
  input.mates = [{ id: 'slider-axis', name: 'Original native slider', type: 'concentric', suppressed: false,
    first: { ...first, support: 'axis' }, second: { ...second, support: 'axis' }, rotationLock: null,
    alignment: a.axis.reduce((sum, value, axis) => sum + value * b.axis[axis], 0) > 0 ? 'aligned' : 'opposed' }]
  return validateAssemblyDocument(input)
}
function hingeInput(): AssemblyDocument {
  const input = createAssemblyExample(), axle = structuredClone(occurrence(input, 'left')), payload = structuredClone(occurrence(input, 'right'))
  axle.id = 'axle'; axle.fixed = true; axle.pose = identityRigidPose()
  payload.id = 'payload'; payload.fixed = true; payload.pose = { translation: [1, 0, 0], rotation: [0, 0, 0, 1] }
  const group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'projection-group', revision: 'r1', name: 'Original offset hinge payload',
    createdAt: input.createdAt, updatedAt: input.updatedAt, occurrences: [axle, payload], mates: [] }
  const ground = structuredClone(axle); ground.id = 'ground'
  const owner: AssemblyOccurrence = { id: 'A', name: 'Original floating hinge owner', definition: { id: group.id, revision: group.revision },
    pose: identityRigidPose(), fixed: false, suppressed: false, visible: true }
  input.definitions.push(group); input.occurrences = [ground, owner]
  const scene = buildAssemblyScene(input), a = assemblySceneFaceReference(select(scene, ['A', 'axle'], cylinder(2))),
    b = assemblySceneFaceReference(select(scene, ['ground'], cylinder(2))),
    topA = assemblySceneFaceReference(select(scene, ['A', 'axle'], cap(12))), topB = assemblySceneFaceReference(select(scene, ['ground'], cap(12)))
  if (!a || !b || !topA || !topB) throw new Error('Actual hinge references expected')
  input.mates = [{ id: 'hinge-axis', name: 'Original real hinge cylinders', type: 'concentric', suppressed: false,
    first: { ...a, support: 'axis' }, second: { ...b, support: 'axis' }, alignment: 'aligned', rotationLock: null },
  { id: 'hinge-cap', name: 'Original real hinge caps', type: 'coincident', suppressed: false,
    first: { ...topA, support: 'plane' }, second: { ...topB, support: 'plane' }, alignment: 'aligned' }]
  return validateAssemblyDocument(input)
}
function sliderDrag(input: AssemblyDocument): AssemblyComponentDrag {
  const pose = structuredClone(occurrence(input, 'right').pose); pose.translation = [13, 4, pose.translation[2] + 5]
  return { component: component(input, 'right'), pose, mode: 'translate' }
}
function hingeDrag(input: AssemblyDocument = hinge): AssemblyComponentDrag {
  const group = input.definitions.find(value => value.id === 'projection-group')
  if (!group || group.kind !== 'assembly') throw new Error('Original group missing')
  return { component: { occurrencePath: ['A', 'payload'], definition: { ...group.occurrences[1].definition } },
    pose: { translation: [0, 2, 0], rotation: [0, 0, 0, 1] }, mode: 'translate' }
}
function nativeShape(owners: NativeOwners, input: AssemblyDocument, path: string[]): Shape3D {
  const item = expandAssemblyParts(input).find(value => JSON.stringify(value.path) === JSON.stringify(path))
  if (!item) throw new Error('Original native part missing')
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
  expect(engine.build(item.definition.document.features).featureErrors).toEqual([])
  return owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape({ bodyId: 'pin-body', sourceFeatureId: 'bore' })), item.worldPose))
}
function probe(shape: Shape3D, center: Vec3, expected: number): void {
  withNativeOwners(owners => {
    const box = owners.own(makeBox(center.map(value => value - .05) as Vec3, center.map(value => value + .05) as Vec3)),
      common = owners.own(bodyBoolean('common', shape, box))
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - expected)).toBeLessThan(1e-7)
  })
}
function pinMetrics(owners: NativeOwners, shape: Shape3D, minimum: Vec3, maximum: Vec3): void {
  validateBodyShape(shape); expect(owners.ownAll(shape.solids)).toHaveLength(1)
  expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - 189 * Math.PI / 4)).toBeLessThan(1e-5)
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - 495 * Math.PI / 8)).toBeLessThan(1e-5)
  const bounds = owners.own(shape.boundingBox).bounds; near(bounds[0], minimum); near(bounds[1], maximum)
}
function coupled(): AssemblyDocument {
  const input = createAssemblyExample(); input.occurrences = input.occurrences.filter(value => value.id !== 'plate')
  input.occurrences.forEach(value => { value.pose = identityRigidPose(); value.fixed = false })
  occurrence(input, 'right').pose.translation = [5, 0, 0]
  input.mates = [{ id: 'coupled', name: 'Original rigid relative lock', type: 'lock', suppressed: false,
    first: component(input, 'left'), second: component(input, 'right'), relativePose: { translation: [5, 0, 0], rotation: [0, 0, 0, 1] } }]
  return validateAssemblyDocument(input)
}

it('projects an unreachable lateral slider request onto its free native axial motion', () => {
  const input = validateAssemblyDocument(slider), before = serializeAssemblyDocument(input), z = occurrence(input, 'right').pose.translation[2]
  const drag = sliderDrag(input), preview = ready(prepareAssemblyDragPreview(input, drag)), solved = validateAssemblyDocument(preview.document)
  expect(preview.movement).toBeUndefined(); expect(preview.projection).toMatchObject({ frame: 'world', mode: 'translate', temporaryAnchor: false,
    component: drag.component, drivenComponent: drag.component, requestedPose: drag.pose, affectedPaths: [['right']], lengthTolerance: 1e-6, angleTolerance: 1e-8 })
  near(preview.projection!.resolvedPose.translation, [10, 0, z + 5]); expect(Math.abs(preview.projection!.positionResidual - 5)).toBeLessThan(1e-6)
  expect(preview.projection!.positionResidual).toBeGreaterThan(preview.projection!.lengthTolerance)
  expect(preview.projection!.evidence.localOnly).toBe(true); expect(preview.projection!.evidence.convergence).toBe('stationary')
  expect(preview.scopes[0].result.localDOF).toBe(1); expect(preview.scopes[0].temporaryAnchor).toBeUndefined()
  expect(preview.checks.every(value => value.satisfied)).toBe(true); expect(solved.mates).toEqual(input.mates)
  expect(occurrence(solved, 'right').fixed).toBe(false); expect(occurrence(solved, 'left')).toEqual(occurrence(input, 'left'))
  withNativeOwners(owners => {
    const original = nativeShape(owners, input, ['right']), projected = nativeShape(owners, solved, ['right'])
    pinMetrics(owners, projected, [8, -2, z + 5], [12, 2, z + 17])
    probe(original, [10, 0, z + 2], .001); probe(projected, [10, 0, z + 2], 0)
    probe(original, [10, 0, z + 14], 0); probe(projected, [10, 0, z + 14], .001)
  })
  expect(serializeAssemblyDocument(input)).toBe(before); discardAssemblySolvePreview(preview)
}, 60_000)

it('projects a nested fixed payload point onto the native hinge circle through its root owner', () => {
  const input = validateAssemblyDocument(hinge), drag = hingeDrag(input), preview = ready(prepareAssemblyDragPreview(input, drag))
  near(preview.projection!.resolvedPose.translation, [0, 1, 0]); expect(Math.abs(preview.projection!.positionResidual - 1)).toBeLessThan(1e-6)
  expect(preview.projection!.drivenComponent).toEqual(component(input, 'A')); expect(preview.projection!.affectedPaths).toEqual([['A']])
  expect(preview.scopes.at(-1)!.result.localDOF).toBe(1); expect(preview.scopes.every(value => !value.temporaryAnchor)).toBe(true)
  const [x, y, z, w] = preview.projection!.resolvedPose.rotation
  near([1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)], [0, 1, 0])
  const solved = validateAssemblyDocument(preview.document)
  expect(solved.definitions).toEqual(input.definitions); expect(solved.mates).toEqual(input.mates)
  expect(occurrence(solved, 'ground')).toEqual(occurrence(input, 'ground'))
  expect(preview.checks).toHaveLength(2); expect(preview.checks.every(value => value.satisfied)).toBe(true)
  withNativeOwners(owners => {
    const payload = nativeShape(owners, solved, ['A', 'payload'])
    pinMetrics(owners, payload, [-2, -1, 0], [2, 3, 12]); probe(payload, [0, 2, 6], 0); probe(payload, [1, 1, 6], .001)
  })
  discardAssemblySolvePreview(preview)
}, 60_000)

it('preserves a free slider spin for the secondary orientation objective despite nonzero lateral target error', () => {
  const input = validateAssemblyDocument(slider), mate = input.mates[0], z = occurrence(input, 'right').pose.translation[2]
  if (mate.type !== 'concentric') throw new Error('Actual native concentric mate expected')
  mate.rotationLock = null
  const drag = sliderDrag(input); drag.pose.rotation = [...z90]
  const preview = ready(prepareAssemblyDragPreview(input, drag)), solved = validateAssemblyDocument(preview.document)
  near(preview.projection!.resolvedPose.translation, [10, 0, z + 5])
  expect(Math.abs(preview.projection!.positionResidual - 5)).toBeLessThan(1e-6); expect(preview.projection!.angleResidual).toBeLessThan(1e-8)
  expect(preview.scopes[0].result.localDOF).toBe(2); expect(preview.checks[0].satisfied).toBe(true)
  withNativeOwners(owners => {
    const pin = nativeShape(owners, solved, ['right'])
    pinMetrics(owners, pin, [8, -2, z + 5], [12, 2, z + 17])
    probe(pin, [10, 1, z + 11], 0); probe(pin, [11, 0, z + 11], .001)
  })
  expect(solved.mates).toEqual(input.mates); discardAssemblySolvePreview(preview)
}, 60_000)

it('allows rotation projection to move an offset selected origin while preserving all hard native mates', () => {
  const input = validateAssemblyDocument(hinge), drag = hingeDrag(input)
  drag.mode = 'rotate'; drag.pose = { translation: [1, 0, 0], rotation: [...z90] }
  const preview = ready(prepareAssemblyDragPreview(input, drag))
  near(preview.projection!.resolvedPose.translation, [0, 1, 0]); expect(preview.projection!.angleResidual).toBeLessThan(1e-8)
  expect(Math.abs(preview.projection!.positionResidual - Math.SQRT2)).toBeLessThan(1e-6)
  expect(preview.checks.every(value => value.satisfied)).toBe(true)
  expect(prepareAssemblyWorldMovePreview(input, { component: drag.component, pose: drag.pose }).status).toBe('rejected')
  discardAssemblySolvePreview(preview)
}, 60_000)

it('moves a coupled free group together while retaining its natural six DOF and saved lock', () => {
  const input = coupled(), drag: AssemblyComponentDrag = { component: component(input, 'left'), mode: 'translate',
    pose: { translation: [7, 8, 9], rotation: [0, 0, 0, 1] } }, preview = ready(prepareAssemblyDragPreview(input, drag))
  near(preview.document.occurrences[0].pose.translation, [7, 8, 9]); near(preview.document.occurrences[1].pose.translation, [12, 8, 9])
  expect(preview.scopes[0].result.localDOF).toBe(6); expect(preview.scopes[0].temporaryAnchor).toBeUndefined()
  expect(preview.document.mates).toEqual(input.mates); expect(preview.document.occurrences.every(value => !value.fixed)).toBe(true)
  expect(preview.checks[0].satisfied).toBe(true); discardAssemblySolvePreview(preview)
}, 60_000)

it('keeps both existing strict native movement APIs strict for the same unreachable target', () => {
  const input = validateAssemblyDocument(slider), drag = sliderDrag(input), strict = { component: drag.component, pose: drag.pose }
  expect(prepareAssemblyWorldMovePreview(input, strict).status).toBe('rejected')
  expect(prepareAssemblyMovePreview(input, strict).status).toBe('rejected')
  const projected = ready(prepareAssemblyDragPreview(input, drag)); expect(projected.projection!.positionResidual).toBeGreaterThan(4.99)
  discardAssemblySolvePreview(projected)
}, 60_000)

it('publishes no capability for a no-op, blocked lateral target or equivalent opposite quaternion', () => {
  const input = validateAssemblyDocument(slider), original = occurrence(input, 'right').pose, history = new AssemblyDocumentHistory(input)
  const poses = [structuredClone(original), { ...structuredClone(original), translation: [13, 4, original.translation[2]] as Vec3 },
    { ...structuredClone(original), rotation: original.rotation.map(value => -value) as RigidPose['rotation'] }]
  for (const pose of poses) {
    const result = prepareAssemblyDragPreview(input, { component: component(input, 'right'), pose, mode: 'translate' })
    expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect('projection' in result).toBe(false)
    if (result.status === 'rejected') { expect(result.reason).toBe('numeric'); expect(result.message).toContain('No hay movimiento') }
  }
  expect(history.current).toEqual(input); expect(history.canUndo).toBe(false)
}, 60_000)

it('rejects a fixed root before native work although fixed descendants of a floating root are allowed', () => {
  const input = validateAssemblyDocument(hinge); occurrence(input, 'A').fixed = true
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), render = vi.spyOn(CadEngine.prototype, 'build')
  try { const result = prepareAssemblyDragPreview(input, hingeDrag(input)); expect(result.status).toBe('rejected'); expect(spy).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled() }
  finally { render.mockRestore(); spy.mockRestore() }
})

it.each(['stale', 'suppressed', 'missing', 'undefined', 'mode'] as const)('rejects %s pointer intent without falling back to an ordinary solve', kind => {
  const input = validateAssemblyDocument(hinge), drag = hingeDrag(input)
  if (kind === 'stale') drag.component.definition.revision = 'missing'
  if (kind === 'suppressed') occurrence(input, 'A').suppressed = true
  if (kind === 'missing') drag.component.occurrencePath[1] = 'missing'
  const value = kind === 'undefined' ? undefined : kind === 'mode' ? { ...drag, mode: 'scale' } : drag
  const result = prepareAssemblyDragPreview(input, value as AssemblyComponentDrag)
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect('projection' in result).toBe(false)
})

it('rejects projection-policy accessors without executing them or constructing native owners', () => {
  for (const location of ['projection', 'budget']) {
    const getter = vi.fn(() => 4), options: AssemblySolveOptions = {}, build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), render = vi.spyOn(CadEngine.prototype, 'build')
    if (location === 'projection') Object.defineProperty(options, 'projection', { get: getter, enumerable: true })
    else { options.projection = {}; Object.defineProperty(options.projection, 'maxIterations', { get: getter, enumerable: true }) }
    try {
      const result = prepareAssemblyDragPreview(slider, sliderDrag(slider), options)
      expect(result.status).toBe('rejected'); expect(getter).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled()
    } finally { render.mockRestore(); build.mockRestore() }
  }
})

it('rejects unknown, symbolic, executable and nested solver projection-policy fields', () => {
  const callback = vi.fn(), variants: unknown[] = [{ extra: 1 }, { [Symbol('extra')]: 1 }, { solver: {} },
    { maxIterations: callback }, { stationarityTolerance: Infinity }]
  for (const projection of variants) {
    const result = prepareAssemblyDragPreview(slider, sliderDrag(slider), { projection } as AssemblySolveOptions)
    expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
  }
  expect(callback).not.toHaveBeenCalled()
})

it('binds projected Apply to the original source and rejects cloned, changed or discarded authority', () => {
  const input = validateAssemblyDocument(slider), preview = ready(prepareAssemblyDragPreview(input, sliderDrag(input))), history = new AssemblyDocumentHistory(input)
  expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow('no fue verificada')
  history.commit({ type: 'rename-occurrence', occurrenceId: 'right', name: 'Changed under same revision' })
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('El documento cambió')
  history.undo(); discardAssemblySolvePreview(preview)
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('no fue verificada')
}, 60_000)

it('commits a coupled projection once and restores the whole transaction through history and persistence', () => {
  const input = coupled(), history = new AssemblyDocumentHistory(input), before = serializeAssemblyDocument(input)
  const preview = ready(prepareAssemblyDragPreview(input, { component: component(input, 'left'), mode: 'translate',
    pose: { translation: [7, 8, 9], rotation: [0, 0, 0, 1] } }))
  const applied = applyAssemblySolvePreview(history, preview)
  expect(() => applyAssemblySolvePreview(history, preview)).toThrow('ya se consumió')
  expect(serializeAssemblyDocument(history.undo())).toBe(before); expect(history.redo()).toEqual(applied)
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), natural = ready(prepareAssemblySolve(reopened))
  expect(reopened.mates).toEqual(input.mates); expect(reopened.definitions).toEqual(input.definitions)
  expect('projection' in reopened).toBe(false); expect(natural.projection).toBeUndefined(); expect(natural.scopes[0].result.localDOF).toBe(6)
  discardAssemblySolvePreview(natural)
}, 60_000)

it('freezes detached requested/resolved evidence without saving temporary roles or a projected target', () => {
  const input = validateAssemblyDocument(slider), drag = sliderDrag(input), preview = ready(prepareAssemblyDragPreview(input, drag))
  expect(Object.isFrozen(preview.projection)).toBe(true); expect(Object.isFrozen(preview.projection!.evidence)).toBe(true)
  expect(Object.isFrozen(preview.projection!.requestedPose.translation)).toBe(true); expect(Object.isFrozen(preview.projection!.affectedPaths[0])).toBe(true)
  drag.pose.translation[0] = 99; drag.component.occurrencePath[0] = 'caller'
  near(preview.projection!.requestedPose.translation.slice(0, 2), [13, 4]); expect(preview.projection!.component.occurrencePath).toEqual(['right'])
  expect(preview.document.occurrences.map(value => value.fixed)).toEqual(input.occurrences.map(value => value.fixed))
  expect('projection' in preview.document).toBe(false); expect('temporaryAnchor' in preview.document).toBe(false)
  discardAssemblySolvePreview(preview)
}, 60_000)

it('recomputes the selected relative frame after an initially unsolved child scope', () => {
  const input = validateAssemblyDocument(hinge), group = input.definitions.find(value => value.id === 'projection-group')
  if (!group || group.kind !== 'assembly') throw new Error('Original group missing')
  const payload = group.occurrences[1]; payload.fixed = false; payload.pose.translation[2] = 3
  group.mates = [{ id: 'local-plane', name: 'Original fresh child plane', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: { occurrencePath: ['payload'], definition: { ...payload.definition } }, plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }]
  const preview = ready(prepareAssemblyDragPreview(input, hingeDrag(input))), solved = validateAssemblyDocument(preview.document)
  expect(preview.checks).toHaveLength(3)
  expect(preview.checks.every(value => value.satisfied)).toBe(true)
  const child = solved.definitions.find(value => value.id === group.id)
  if (!child || child.kind !== 'assembly') throw new Error('Actual child result missing')
  const [localX, localY, localZ] = child.occurrences[1].pose.translation, radius = Math.hypot(localX, localY)
  // A plane leaves local X/Y/spin free. Use the genuine child result's radius,
  // then the independent closest point on its Z-axis circle, not nominal X=1.
  expect(radius).toBeGreaterThan(0); near(preview.projection!.resolvedPose.translation, [0, radius, 0])
  expect(Math.abs(localZ)).toBeLessThan(1e-6); expect(payload.pose.translation[2]).toBe(3)
  discardAssemblySolvePreview(preview)
}, 60_000)

it('withholds projection authority when a real active source reconstruction fails', () => {
  const input = validateAssemblyDocument(slider), source = input.definitions.find(value => value.id === 'example-pin')
  if (!source || source.kind !== 'part') throw new Error('Original part missing')
  source.document.features.push({ id: 'remote-profile', name: 'Original failed remote cut profile', type: 'sketch', plane: 'XY', offset: 0,
    suppressed: false, profile: { kind: 'circle', center: [100, 0], radius: 1 } },
  { id: 'remote-cut', name: 'Original failed remote cut', type: 'cut', sketchId: 'remote-profile', depth: 12, symmetric: false, suppressed: false })
  const before = serializeAssemblyDocument(input), result = prepareAssemblyDragPreview(input, sliderDrag(input))
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('No se pudo reconstruir')
  expect(serializeAssemblyDocument(input)).toBe(before)
}, 60_000)

it('preserves real native release failure as fatal before projection publication', () => {
  const input = validateAssemblyDocument(slider), real = CadEngine.prototype.dispose; let calls = 0
  const spy = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { real.call(this); calls++; throw new Error('Original projection release fault') })
  try {
    const result = prepareAssemblyDragPreview(input, sliderDrag(input))
    expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
    if (result.status === 'rejected') expect(result.message).toContain('release failed')
    expect(calls).toBeGreaterThan(0)
  } finally { spy.mockRestore() }
}, 60_000)

it.each(['poses', 'resolved', 'requested', 'evidence'] as const)('independently withholds authority after actual numerical %s output is corrupted', field => {
  // Narrow control-flow faults on genuinely computed numeric outputs. Native
  // references, source shapes, status, hard solve and cleanup are never faked.
  const input = validateAssemblyDocument(slider), real = numeric.projectRigidMateTarget
  const spy = vi.spyOn(numeric, 'projectRigidMateTarget').mockImplementation((problem, target, options) => {
    const value = real(problem, target, options); expect(value.status).toBe('ready')
    if (value.status === 'ready') {
      if (field === 'poses') value.result.poses!.get('right')!.translation[0] += 1
      else if (field === 'resolved') value.resolvedPose.translation[0] += 1
      else if (field === 'requested') value.requestedPose.translation[0] += 1
      else value.evidence.stationarityNorm = NaN
    }
    return value
  })
  try {
    const result = prepareAssemblyDragPreview(input, sliderDrag(input))
    expect(result.status).toBe('rejected'); expect('projection' in result).toBe(false)
    if (result.status === 'rejected') {
      expect(result.reason).toBe('verification')
      expect(result.message).toContain(field === 'poses' ? 'verificación nativa final' : field === 'evidence' ? 'evidencia numérica finita' : 'resultado o el objetivo global')
    }
  } finally { spy.mockRestore() }
}, 60_000)

it('propagates a numerical projection rejection instead of accepting its otherwise valid hard result', () => {
  const input = validateAssemblyDocument(slider), real = numeric.projectRigidMateTarget
  const spy = vi.spyOn(numeric, 'projectRigidMateTarget').mockImplementation((problem, target, options) => {
    const value = real(problem, target, options); expect(value.status).toBe('ready')
    return value.status === 'ready' ? { status: 'rejected' as const, message: 'Original projection control-flow rejection', result: value.result } : value
  })
  try {
    const result = prepareAssemblyDragPreview(input, sliderDrag(input))
    expect(result.status).toBe('rejected'); if (result.status === 'rejected') { expect(result.reason).toBe('numeric'); expect(result.message).toContain('control-flow rejection') }
  } finally { spy.mockRestore() }
}, 60_000)

it('detaches intent before native work and rejects Apply after the live original source changes', () => {
  const input = validateAssemblyDocument(slider), drag = sliderDrag(input), real = CadEngine.prototype.rebuildForAssemblyReferences; let calls = 0
  const spy = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences').mockImplementation(function(this: CadEngine, features) {
    const value = real.call(this, features)
    if (++calls === 1) { occurrence(input, 'right').name = 'Caller changed same source revision'; drag.pose.translation[0] = 99 }
    return value
  })
  try {
    const preview = ready(prepareAssemblyDragPreview(input, drag))
    near(preview.projection!.requestedPose.translation.slice(0, 2), [13, 4])
    expect(occurrence(validateAssemblyDocument(preview.document), 'right').name).not.toContain('Caller changed')
    expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(input), preview)).toThrow('El documento cambió')
    discardAssemblySolvePreview(preview)
  } finally { spy.mockRestore() }
}, 60_000)
