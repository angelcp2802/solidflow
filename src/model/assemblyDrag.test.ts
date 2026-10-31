import { expect, it, vi } from 'vitest'
import { assemblyComponentWorldPose, planAssemblyWorldComponentMove, prepareAssemblyDragFrame,
  type AssemblyWorldComponentMove } from './assemblyDrag'
import { planAssemblyComponentMove, validateAssemblyMoveIntent } from './assemblyMovement'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyOccurrence, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { serializeDocument, validateDocument } from './document'
import { identityRigidPose, type RigidPose } from './rigidPose'

// Original syntax-only 2×3×4 part and reused rigid hierarchy. Independently:
// leaf local [1,2,3],Rz90; inner local [4,5,6],Rx90 => relative [5,2,8].
// A [10,20,30],Rz90 => selected [8,25,38]; B [-10,0,4],Rz180 => [-15,-2,12].
// These are declared placements, never native or solved geometry evidence.
const date = '2026-10-15T00:00:00.000Z', s = Math.SQRT1_2
const rootRef = { id: 'drag-root', revision: 'a1' }, partRef = { id: 'drag-part', revision: 'p1' }
const otherRef = { id: partRef.id, revision: 'p0' }, outerRef = { id: 'shared-outer', revision: 'o1' }
const innerRef = { id: 'shared-inner', revision: 'i1' }, dormantRef = { id: 'dormant', revision: 'd1' }
function part(reference = partRef): EmbeddedPartDefinition {
  return { kind: 'part', ...reference, document: validateDocument({ version: 1, id: reference.id, name: 'Original shared part',
    units: 'mm', createdAt: date, updatedAt: date, features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
      { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false },
    ] }) }
}
function occurrence(id: string, definition: AssemblyDefinitionReference = partRef, pose = identityRigidPose()): AssemblyOccurrence {
  return { id, definition: { ...definition }, name: 'Same display name', pose, fixed: false, visible: true, suppressed: false }
}
function assembly(reference: AssemblyDefinitionReference, occurrences: AssemblyOccurrence[]): EmbeddedAssemblyDefinition {
  return { kind: 'assembly', ...reference, name: 'Same display name', createdAt: date, updatedAt: date, occurrences, mates: [] }
}
function document(): AssemblyDocument {
  const inner = assembly(innerRef, [occurrence('leaf', partRef, { translation: [1, 2, 3], rotation: [0, 0, s, s] })])
  inner.mates = [{ id: 'declared-plane', name: 'Original plane declaration', type: 'coincident', suppressed: false,
    alignment: 'aligned', first: { kind: 'principal-plane', component: component(['leaf']), plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }]
  const outer = assembly(outerRef, [occurrence('inner', innerRef, { translation: [4, 5, 6], rotation: [s, 0, 0, s] })])
  const dormant = assembly(dormantRef, [occurrence('unused', outerRef)])
  const a = occurrence('A', outerRef, { translation: [10, 20, 30], rotation: [0, 0, s, s] })
  const b = occurrence('B', outerRef, { translation: [-10, 0, 4], rotation: [0, 0, 1, 0] })
  const suppressed = occurrence('suppressed', outerRef); suppressed.suppressed = true
  return validateAssemblyDocument({ version: 2, kind: 'assembly', ...rootRef, name: 'Original world drag graph', units: 'mm',
    createdAt: date, updatedAt: date, definitions: [part(), part(otherRef), inner, outer, dormant],
    occurrences: [a, b, suppressed, occurrence('direct')], mates: [] })
}
function component(path = ['A', 'inner', 'leaf'], definition = partRef): AssemblyComponentReference {
  return { occurrencePath: [...path], definition: { ...definition } }
}
function move(): AssemblyWorldComponentMove {
  return { component: component(), pose: { translation: [18, 25, 38], rotation: [s, 0, s, 0] } }
}
function node(input: AssemblyDocument, reference = innerRef): EmbeddedAssemblyDefinition {
  const result = input.definitions.find(value => value.id === reference.id && value.revision === reference.revision)
  if (!result || result.kind !== 'assembly') throw new Error('Original fixture scope missing')
  return result
}
const near = (actual: readonly number[], expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, axis) => expect(Math.abs(value - expected[axis])).toBeLessThan(1e-12))
}
function basis(pose: RigidPose): number[][] {
  // Independent Hamilton-to-Cartesian columns, rather than the production matrix helper.
  const [x, y, z, w] = pose.rotation
  return [[1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)]]
}
function unknownMove(value: unknown, input = document()) {
  return planAssemblyWorldComponentMove(input, value as AssemblyWorldComponentMove)
}

it('exports the existing strict detached intent validation without changing local numeric planning', () => {
  const input = document(), request = move(), checked = validateAssemblyMoveIntent(request)
  expect(checked).toEqual(request); expect(checked).not.toBe(request); expect(checked.pose.rotation).not.toBe(request.pose.rotation)
  const local = planAssemblyComponentMove(input, request)
  expect(local.scope).toEqual(innerRef); expect(local.occurrenceId).toBe('leaf')
  expect(node(local.document).occurrences[0].pose).toEqual(request.pose)
  expect(local.affectedPaths).toEqual([['A', 'inner', 'leaf'], ['B', 'inner', 'leaf'], ['suppressed', 'inner', 'leaf']])
})

it('computes nested world and owner-relative frames from independent Cartesian transforms', () => {
  const frame = prepareAssemblyDragFrame(document(), component())
  near(frame.worldPose.translation, [8, 25, 38]); near(frame.relativePose.translation, [5, 2, 8])
  const world = basis(frame.worldPose), relative = basis(frame.relativePose)
  near(world[0], [0, 0, 1]); near(world[1], [0, -1, 0]); near(world[2], [1, 0, 0])
  near(relative[0], [0, 0, 1]); near(relative[1], [-1, 0, 0]); near(relative[2], [0, -1, 0])
  near(frame.ownerPose.translation, [10, 20, 30])
})

it('resolves a selected nested assembly frame rather than requiring a part leaf', () => {
  const selected = component(['A', 'inner'], innerRef), frame = prepareAssemblyDragFrame(document(), selected)
  near(frame.worldPose.translation, [5, 24, 36]); near(frame.relativePose.translation, [4, 5, 6])
  const axes = basis(frame.worldPose)
  near(axes[0], [0, 1, 0]); near(axes[1], [0, 0, 1]); near(axes[2], [1, 0, 0])
  expect(frame.component).toEqual(selected); expect(frame.drivenComponent).toEqual(component(['A'], outerRef))
})

it('gives reused selections their distinct actual world poses and root owners', () => {
  const input = document(), a = prepareAssemblyDragFrame(input, component()), b = prepareAssemblyDragFrame(input, component(['B', 'inner', 'leaf']))
  near(a.worldPose.translation, [8, 25, 38]); near(b.worldPose.translation, [-15, -2, 12])
  expect(a.drivenComponent).toEqual(component(['A'], outerRef)); expect(b.drivenComponent).toEqual(component(['B'], outerRef))
  expect(a.affectedPaths).toEqual([['A']]); expect(b.affectedPaths).toEqual([['B']])
})

it('plans only the selected root owner without staging a pose or editing a shared definition', () => {
  const input = document(), before = serializeAssemblyDocument(input), request = move(), plan = planAssemblyWorldComponentMove(input, request)
  expect(plan.component).toEqual(request.component); expect(plan.drivenComponent).toEqual(component(['A'], outerRef))
  expect(plan.scope).toEqual(rootRef); expect(plan.occurrenceId).toBe('A'); expect(plan.targetPose).toEqual(request.pose)
  expect(plan.affectedPaths).toEqual([['A']]); expect(serializeAssemblyDocument(plan.document)).toBe(before)
  expect(plan.document).not.toBe(input); expect(plan.document.occurrences[0].pose.translation).toEqual([10, 20, 30])
  expect(plan.document.definitions).toEqual(input.definitions); expect(plan.document.updatedAt).toBe(date)
})

it('keeps world-root targeting distinct from local edits that affect every reused declaration', () => {
  const input = document(), request = move(), world = planAssemblyWorldComponentMove(input, request), local = planAssemblyComponentMove(input, request)
  expect(world.affectedPaths).toEqual([['A']]); expect(world.document).toEqual(input)
  expect(local.scope).toEqual(innerRef); expect(local.affectedPaths).toHaveLength(3)
  expect(node(local.document).occurrences[0].pose.translation).toEqual([18, 25, 38])
  expect(node(world.document).occurrences[0].pose.translation).toEqual([1, 2, 3])
  expect(world.affectedPaths.flat()).not.toContain('unused')
})

it('allows a fixed selected child to follow a floating root rigid owner', () => {
  const input = document(); node(input).occurrences[0].fixed = true
  expect(prepareAssemblyDragFrame(input, component()).drivenComponent).toEqual(component(['A'], outerRef))
  expect(planAssemblyWorldComponentMove(input, move()).document).toEqual(input)
  expect(() => planAssemblyComponentMove(input, move())).toThrow(/fijada/)
})

it('allows a fixed intermediate child scope under a floating root owner', () => {
  const input = document(); node(input, outerRef).occurrences[0].fixed = true
  near(prepareAssemblyDragFrame(input, component()).worldPose.translation, [8, 25, 38])
  expect(planAssemblyWorldComponentMove(input, move()).occurrenceId).toBe('A')
})

it('rejects a fixed root owner even when the selected nested child is free', () => {
  const input = document(); input.occurrences[0].fixed = true
  expect(node(input).occurrences[0].fixed).toBe(false)
  expect(() => prepareAssemblyDragFrame(input, component())).toThrow(/raíz.*fijada/)
  expect(() => planAssemblyWorldComponentMove(input, move())).toThrow(/raíz.*fijada/)
  // A pure position query is not permission to move, so fixed remains queryable.
  near(assemblyComponentWorldPose(input, component()).translation, [8, 25, 38])
  expect(planAssemblyComponentMove(input, move()).scope).toEqual(innerRef)
})

it('rejects inherited suppression at root, intermediate and selected levels for every world helper', () => {
  for (const level of ['root', 'intermediate', 'selected']) {
    const input = document()
    if (level === 'root') input.occurrences[0].suppressed = true
    else node(input, level === 'intermediate' ? outerRef : innerRef).occurrences[0].suppressed = true
    expect(() => assemblyComponentWorldPose(input, component())).toThrow(/suprimida/)
    expect(() => prepareAssemblyDragFrame(input, component())).toThrow(/suprimida/)
    expect(() => planAssemblyWorldComponentMove(input, move())).toThrow(/suprimida/)
  }
})

it('reports inherited visibility without treating hidden data as a native or UI movement permission', () => {
  for (const level of ['root', 'intermediate', 'selected']) {
    const input = document()
    if (level === 'root') input.occurrences[0].visible = false
    else node(input, level === 'intermediate' ? outerRef : innerRef).occurrences[0].visible = false
    expect(prepareAssemblyDragFrame(input, component()).visible).toBe(false)
    expect(planAssemblyWorldComponentMove(input, move()).document).toEqual(input)
  }
  expect(prepareAssemblyDragFrame(document(), component()).visible).toBe(true)
})

it('handles a direct root part with independent selected and driven identity copies', () => {
  const input = document(), selected = component(['direct']), frame = prepareAssemblyDragFrame(input, selected)
  expect(frame.drivenComponent).toEqual(selected); expect(frame.drivenComponent).not.toBe(frame.component)
  expect(frame.drivenComponent.definition).not.toBe(frame.component.definition)
  expect(frame.relativePose).toEqual(identityRigidPose()); expect(frame.worldPose).toEqual(identityRigidPose())
  const plan = planAssemblyWorldComponentMove(input, { component: selected, pose: move().pose })
  expect(plan.affectedPaths).toEqual([['direct']]); expect(plan.occurrenceId).toBe('direct')
})

it('requires the complete actual root path and exact definition tuple', () => {
  for (const selected of [component([], partRef), component(['leaf']), component(['A', 'leaf']), component(['missing', 'inner', 'leaf']),
    component(['direct', 'leaf']), component(['A', 'inner', 'leaf'], otherRef), component(['A', 'inner'], outerRef)]) {
    expect(() => prepareAssemblyDragFrame(document(), selected)).toThrow()
    expect(() => assemblyComponentWorldPose(document(), selected)).toThrow()
    expect(() => planAssemblyWorldComponentMove(document(), { component: selected, pose: identityRigidPose() })).toThrow()
  }
})

it('never resolves by duplicate display names, dormant scope names or revision labels alone', () => {
  const input = document()
  for (const path of [['Same display name'], ['dormant', 'unused', 'inner', 'leaf'], ['shared-outer', 'inner', 'leaf']]) {
    expect(() => prepareAssemblyDragFrame(input, component(path))).toThrow()
  }
  expect(planAssemblyWorldComponentMove(input, move()).component.occurrencePath).toEqual(['A', 'inner', 'leaf'])
})

it('rejects malformed intent fields, executable serializers and symbolic or hidden extras', () => {
  const serializer = vi.fn(() => ({})), hidden = move()
  Object.defineProperty(hidden, 'extra', { value: 1, enumerable: false })
  for (const value of [undefined, null, [], {}, { component: component() }, { ...move(), extra: true },
    { ...move(), [Symbol('extra')]: 1 }, hidden, { ...move(), toJSON: serializer },
    { component: { ...component(), extra: true }, pose: identityRigidPose() }]) {
    expect(() => unknownMove(value)).toThrow()
  }
  expect(serializer).not.toHaveBeenCalled()
})

it('rejects intent and component getters without executing them', () => {
  for (const field of ['component', 'pose', 'occurrencePath', 'definition', 'revision', 'translation', 'coordinate']) {
    const request = move(), getter = vi.fn(() => { throw new Error('Accessor must not execute') })
    const target = field === 'component' || field === 'pose' ? request
      : field === 'occurrencePath' || field === 'definition' ? request.component
        : field === 'revision' ? request.component.definition : field === 'coordinate' ? request.pose.translation : request.pose
    Object.defineProperty(target, field === 'coordinate' ? '0' : field, { get: getter, enumerable: true })
    expect(() => planAssemblyWorldComponentMove(document(), request)).toThrow(); expect(getter).not.toHaveBeenCalled()
  }
  const selected = component(), getter = vi.fn(() => partRef)
  Object.defineProperty(selected, 'definition', { get: getter, enumerable: true })
  expect(() => prepareAssemblyDragFrame(document(), selected)).toThrow()
  expect(() => assemblyComponentWorldPose(document(), selected)).toThrow(); expect(getter).not.toHaveBeenCalled()
})

it('rejects nonplain prototypes and sparse or extended path/pose arrays', () => {
  for (const targetName of ['intent', 'component', 'definition', 'pose', 'path', 'translation', 'rotation']) {
    const request = move(), target = targetName === 'intent' ? request : targetName === 'component' ? request.component
      : targetName === 'definition' ? request.component.definition : targetName === 'pose' ? request.pose
        : targetName === 'path' ? request.component.occurrencePath : targetName === 'translation' ? request.pose.translation : request.pose.rotation
    Object.setPrototypeOf(target, { inherited: true }); expect(() => planAssemblyWorldComponentMove(document(), request)).toThrow()
  }
  const sparse = move(); delete sparse.component.occurrencePath[1]
  const extended = move(); Object.defineProperty(extended.pose.rotation, 'extra', { value: 1, enumerable: true })
  expect(() => planAssemblyWorldComponentMove(document(), sparse)).toThrow()
  expect(() => planAssemblyWorldComponentMove(document(), extended)).toThrow()
})

it('accepts null-prototype data records while preserving accepted near-unit target values', () => {
  const request = move(); request.pose.rotation = [0, 0, 0, 1 + 5e-11]
  for (const value of [request, request.component, request.component.definition, request.pose]) Object.setPrototypeOf(value, null)
  const plan = planAssemblyWorldComponentMove(document(), request)
  expect(plan.targetPose.rotation).toEqual([0, 0, 0, 1 + 5e-11])
})

it('rejects nonfinite targets and nonrigid quaternion declarations before planning', () => {
  for (const pose of [{ translation: [0, NaN, 0], rotation: [0, 0, 0, 1] },
    { translation: [Infinity, 0, 0], rotation: [0, 0, 0, 1] }, { translation: [0, 0, 0], rotation: [0, 0, 0, 0] },
    { translation: [0, 0, 0], rotation: [0, 0, 0, 2] }]) {
    expect(() => unknownMove({ component: component(), pose })).toThrow()
  }
})

it('freezes every returned frame record and tuple without retaining input aliases', () => {
  const input = document(), selected = component(), before = structuredClone(input), frame = prepareAssemblyDragFrame(input, selected)
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    expect(Object.isFrozen(value)).toBe(true); Object.values(value).forEach(visit)
  }
  visit(frame); expect(() => { frame.worldPose.translation[0] = 999 }).toThrow(TypeError)
  selected.occurrencePath[0] = 'caller'; input.occurrences[0].pose.translation[0] = 999
  expect(frame.component.occurrencePath).toEqual(['A', 'inner', 'leaf']); near(frame.worldPose.translation, [8, 25, 38])
  expect(before.occurrences[0].pose.translation[0]).toBe(10)
  expect(frame.worldPose.translation).not.toBe(frame.ownerPose.translation)
  expect(frame.worldPose.translation).not.toBe(frame.relativePose.translation)
})

it('detaches original-source plans, target and address fields from inputs and one another', () => {
  const input = document(), request = move(), before = structuredClone(input), plan = planAssemblyWorldComponentMove(input, request)
  request.pose.translation[0] = 99; request.component.occurrencePath[0] = 'caller'; request.component.definition.revision = 'caller'
  expect(plan.targetPose.translation).toEqual([18, 25, 38]); expect(plan.component.definition).toEqual(partRef)
  plan.targetPose.translation[0] = 98; plan.component.occurrencePath[0] = 'result'; plan.drivenComponent.occurrencePath[0] = 'owner-result'
  plan.scope.revision = 'result'; plan.affectedPaths[0][0] = 'affected-result'; plan.document.definitions[0].revision = 'result'
  expect(plan.document.occurrences[0].id).toBe('A'); expect(plan.document.occurrences[0].pose.translation).toEqual([10, 20, 30])
  expect(input).toEqual(before)
})

it('returns a detached mutable position query without changing source or frozen frames', () => {
  const input = document(), frame = prepareAssemblyDragFrame(input, component()), pose = assemblyComponentWorldPose(input, component())
  pose.translation[0] = 99; pose.rotation[0] = 99
  near(frame.worldPose.translation, [8, 25, 38]); near(assemblyComponentWorldPose(input, component()).translation, [8, 25, 38])
})

it('validates the full source graph, including executable or missing dormant definitions', () => {
  const getter = vi.fn(() => []), executable = document()
  Object.defineProperty(executable, 'definitions', { get: getter, enumerable: true })
  expect(() => prepareAssemblyDragFrame(executable, component())).toThrow(); expect(getter).not.toHaveBeenCalled()
  const missing = document(); node(missing, dormantRef).occurrences[0].definition.revision = 'missing'
  expect(() => planAssemblyWorldComponentMove(missing, move())).toThrow()
  const cyclic = document(); node(cyclic, dormantRef).occurrences[0].definition = dormantRef
  expect(() => assemblyComponentWorldPose(cyclic, component())).toThrow()
})

it('rejects nonfinite composed world arithmetic even when every saved local coordinate is finite', () => {
  const input = document(); input.occurrences[0].pose = { translation: [1e308, 0, 0], rotation: [0, 0, 0, 1] }
  node(input, outerRef).occurrences[0].pose.translation = [1e308, 0, 0]
  expect(() => assemblyComponentWorldPose(input, component())).toThrow(/non-finite/)
  expect(() => prepareAssemblyDragFrame(input, component())).toThrow(/non-finite/)
  expect(() => planAssemblyWorldComponentMove(input, move())).toThrow(/non-finite/)
})

it('does not invent a coordinate cap or native acceptance for a finite world target', () => {
  const request = move(); request.pose.translation = [Number.MAX_VALUE, 0, 0]
  const plan = planAssemblyWorldComponentMove(document(), request)
  expect(plan.targetPose.translation[0]).toBe(Number.MAX_VALUE)
  expect(plan).not.toHaveProperty('token'); expect(plan).not.toHaveProperty('native'); expect(plan).not.toHaveProperty('solver')
})

it('preserves the original timestamp, history and all saved bytes until a separately authenticated transaction', () => {
  const input = document(), history = new AssemblyDocumentHistory(input), before = serializeAssemblyDocument(input)
  const plan = planAssemblyWorldComponentMove(history.current, move())
  expect(serializeAssemblyDocument(plan.document)).toBe(before); expect(serializeAssemblyDocument(history.current)).toBe(before)
  expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(false); expect(plan.document.updatedAt).toBe(date)
  expect(plan.document.definitions.map(value => [value.id, value.revision])).toEqual(input.definitions.map(value => [value.id, value.revision]))
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(plan.document)); expect(reopened).toEqual(input)
  expect(reopened.definitions.filter((value): value is EmbeddedPartDefinition => value.kind === 'part').map(value => serializeDocument(value.document)))
    .toEqual(input.definitions.filter((value): value is EmbeddedPartDefinition => value.kind === 'part').map(value => serializeDocument(value.document)))
})

it('normalizes computed world rotations while retaining the accepted root declaration data', () => {
  const input = document(); input.occurrences[3].pose.rotation = [0, 0, 0, 1 + 5e-11]
  const selected = component(['direct']), frame = prepareAssemblyDragFrame(input, selected)
  expect(frame.ownerPose.rotation).toEqual([0, 0, 0, 1 + 5e-11])
  near(frame.worldPose.rotation, [0, 0, 0, 1]); near(frame.relativePose.rotation, [0, 0, 0, 1])
  expect(input.occurrences[3].pose.rotation).toEqual([0, 0, 0, 1 + 5e-11])
})
