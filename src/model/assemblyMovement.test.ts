import { expect, it, vi } from 'vitest'
import { planAssemblyComponentMove, type AssemblyComponentMove } from './assemblyMovement'
import { expandAssemblyParts, parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyOccurrence, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { serializeDocument, validateDocument } from './document'
import { identityRigidPose, type RigidPose } from './rigidPose'

// Original in-memory declaration graph: one 2×3×4 part, repeated definitions
// and principal-plane mates. These tests neither build BRep nor solve mates.
const date = '2026-10-15T00:00:00.000Z'
const partRef = { id: 'original-part', revision: 'p1' }, oldPartRef = { id: partRef.id, revision: 'p0' }
const otherPartRef = { id: 'other-part', revision: 'p1' }
const rootRef = { id: 'original-root', revision: 'a1' }, sharedRef = { id: 'shared', revision: 's1' }
const oldSharedRef = { id: sharedRef.id, revision: 's0' }, wrapperRef = { id: 'wrapper', revision: 'w1' }
const dormantRef = { id: 'dormant', revision: 'd1' }
function part(reference = partRef): EmbeddedPartDefinition {
  return { kind: 'part', ...reference, document: validateDocument({ version: 1, id: reference.id,
    name: 'Same display name', units: 'mm', createdAt: date, updatedAt: date, features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
      { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4,
        symmetric: false, suppressed: false },
    ] }) }
}
function occurrence(id: string, definition: AssemblyDefinitionReference = partRef): AssemblyOccurrence {
  return { id, name: 'Same display name', definition: { ...definition }, pose: identityRigidPose(),
    fixed: false, suppressed: false, visible: true }
}
function assembly(reference: AssemblyDefinitionReference, occurrences: AssemblyOccurrence[]): EmbeddedAssemblyDefinition {
  return { kind: 'assembly', ...reference, name: 'Same display name', createdAt: date, updatedAt: date, occurrences, mates: [] }
}
function document(): AssemblyDocument {
  const pin = occurrence('pin'); pin.pose.translation = [1, 2, 3]
  const shared = assembly(sharedRef, [pin, occurrence('vintage-pin', oldPartRef)])
  shared.mates = [{ id: 'pin-plane', name: 'Original declared mate', type: 'coincident', suppressed: false,
    alignment: 'aligned', first: { kind: 'principal-plane', component: component(['pin']), plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }]
  const oldShared = assembly(oldSharedRef, [occurrence('pin')])
  const wrapper = assembly(wrapperRef, [occurrence('nested', sharedRef)])
  const dormant = assembly(dormantRef, [occurrence('uninstantiated', sharedRef)])
  const fixedParent = occurrence('sub-A', sharedRef); fixedParent.fixed = true; fixedParent.pose.translation = [30, 0, 0]
  const suppressedParent = occurrence('sub-B', sharedRef); suppressedParent.suppressed = true
  const wrapped = occurrence('wrapped', wrapperRef)
  wrapped.pose = { translation: [0, 40, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  return validateAssemblyDocument({ version: 2, kind: 'assembly', ...rootRef, name: 'Original movement declarations', units: 'mm',
    createdAt: date, updatedAt: date, definitions: [part(), part(oldPartRef), part(otherPartRef), shared, oldShared, wrapper, dormant],
    occurrences: [occurrence('direct'), occurrence('same-name', otherPartRef), fixedParent, suppressedParent, wrapped,
      occurrence('vintage', oldSharedRef)], mates: [{ id: 'root-plane', name: 'Original root mate', type: 'coincident',
      suppressed: false, alignment: 'aligned', first: { kind: 'principal-plane', component: component(['direct']), plane: 'XY' },
      second: { kind: 'principal-plane', component: null, plane: 'XY' } }] })
}
function component(path: string[], definition: AssemblyDefinitionReference = partRef): AssemblyComponentReference {
  return { occurrencePath: [...path], definition: { ...definition } }
}
function move(path = ['direct'], definition = partRef): AssemblyComponentMove {
  return { component: component(path, definition), pose: { translation: [4, 5, 6], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }
}
function node(input: AssemblyDocument, reference = sharedRef): EmbeddedAssemblyDefinition {
  const result = input.definitions.find(value => value.id === reference.id && value.revision === reference.revision)
  if (!result || result.kind !== 'assembly') throw new Error('Original fixture assembly missing')
  return result
}
function unknownMove(value: unknown, input = document()) { return planAssemblyComponentMove(input, value as AssemblyComponentMove) }

it('stages exactly one root declaration pose and returns its exact root address', () => {
  const input = document(), request = move(), plan = planAssemblyComponentMove(input, request)
  expect(plan.component).toEqual(request.component); expect(plan.scope).toEqual(rootRef)
  expect(plan.occurrenceId).toBe('direct'); expect(plan.pose).toEqual(request.pose); expect(plan.affectedPaths).toEqual([['direct']])
  expect(plan.document.occurrences[0]).toEqual({ ...input.occurrences[0], pose: request.pose })
  expect(plan.document.occurrences.slice(1)).toEqual(input.occurrences.slice(1))
  expect(plan.document.definitions).toEqual(input.definitions); expect(plan.document.mates).toEqual(input.mates)
})

it('treats a nested request as absolute local pose rather than a delta or world pose', () => {
  const input = document(), request = move(['sub-A', 'pin']), plan = planAssemblyComponentMove(input, request)
  expect(plan.scope).toEqual(sharedRef); expect(plan.occurrenceId).toBe('pin')
  expect(node(plan.document).occurrences[0].pose).toEqual(request.pose)
  const expanded = expandAssemblyParts(plan.document).find(value => value.path.join('/') === 'sub-A/pin')
  // The parent translates +30 X. The requested local [4,5,6] becomes [34,5,6].
  expect(expanded?.worldPose.translation).toEqual([34, 5, 6])
  expect(input.occurrences[2].pose.translation).toEqual([30, 0, 0])
})

it('resolves the complete root path through multiple nested scopes', () => {
  const plan = planAssemblyComponentMove(document(), move(['wrapped', 'nested', 'pin']))
  expect(plan.scope).toEqual(sharedRef); expect(plan.component.occurrencePath).toEqual(['wrapped', 'nested', 'pin'])
  expect(node(plan.document).occurrences[0].pose.translation).toEqual([4, 5, 6])
  const expanded = expandAssemblyParts(plan.document).find(value => value.path.join('/') === 'wrapped/nested/pin')
  // Rz90*[4,5,6]+[0,40,0]=[-5,44,6], independently of the planner.
  expect(expanded?.worldPose.translation[0]).toBeCloseTo(-5, 12)
  expect(expanded?.worldPose.translation[1]).toBeCloseTo(44, 12)
  expect(expanded?.worldPose.translation[2]).toBeCloseTo(6, 12)
})

it('lists every actual shared expansion including suppression without inventing dormant paths', () => {
  const input = document(), plan = planAssemblyComponentMove(input, move(['wrapped', 'nested', 'pin']))
  expect(plan.affectedPaths).toEqual([['sub-A', 'pin'], ['sub-B', 'pin'], ['wrapped', 'nested', 'pin']])
  expect(plan.document.occurrences).toEqual(input.occurrences)
  expect(node(plan.document, dormantRef)).toEqual(node(input, dormantRef))
  expect(node(plan.document, oldSharedRef)).toEqual(node(input, oldSharedRef))
  expect(node(plan.document).occurrences[1]).toEqual(node(input).occurrences[1])
  const all = expandAssemblyParts(plan.document, true).filter(value => plan.affectedPaths.some(path => path.join('/') === value.path.join('/')))
  expect(all).toHaveLength(3); expect(all.every(value => value.occurrence.pose.translation.join(',') === '4,5,6')).toBe(true)
  expect(all.find(value => value.path[0] === 'sub-B')?.suppressed).toBe(true)
})

it('can move a subassembly occurrence without changing its descendant declarations', () => {
  const input = document(), plan = planAssemblyComponentMove(input, move(['wrapped'], wrapperRef))
  expect(plan.scope).toEqual(rootRef); expect(plan.affectedPaths).toEqual([['wrapped']])
  expect(plan.document.occurrences[4].pose.translation).toEqual([4, 5, 6])
  expect(plan.document.definitions).toEqual(input.definitions)
})

it('does not turn a fixed ancestor into a fixed child', () => {
  const input = document(); expect(input.occurrences[2].fixed).toBe(true)
  const plan = planAssemblyComponentMove(input, move(['sub-A', 'pin']))
  expect(plan.document.occurrences[2].fixed).toBe(true); expect(node(plan.document).occurrences[0].fixed).toBe(false)
  expect(node(plan.document).occurrences[0].pose.translation).toEqual([4, 5, 6])
})

it('rejects the selected fixed declaration at root or in a shared scope atomically', () => {
  for (const path of [['direct'], ['wrapped', 'nested', 'pin']]) {
    const input = document()
    if (path.length === 1) input.occurrences[0].fixed = true
    else node(input).occurrences[0].fixed = true
    const before = serializeAssemblyDocument(input)
    expect(() => planAssemblyComponentMove(input, move(path))).toThrow(/fijada/)
    expect(serializeAssemblyDocument(input)).toBe(before)
  }
})

it('rejects a suppressed selected occurrence', () => {
  const input = document(); input.occurrences[0].suppressed = true
  expect(() => planAssemblyComponentMove(input, move())).toThrow(/suprimida/)
  node(input).occurrences[0].suppressed = true
  expect(() => planAssemblyComponentMove(input, move(['wrapped', 'nested', 'pin']))).toThrow(/suprimida/)
})

it('rejects inherited suppression on either an outer or intermediate ancestor', () => {
  expect(() => planAssemblyComponentMove(document(), move(['sub-B', 'pin']))).toThrow(/suprimida/)
  const input = document(); node(input, wrapperRef).occurrences[0].suppressed = true
  expect(() => planAssemblyComponentMove(input, move(['wrapped', 'nested', 'pin']))).toThrow(/suprimida/)
})

it('allows a hidden component without changing visibility or suppression roles', () => {
  const input = document(); input.occurrences[0].visible = false
  const plan = planAssemblyComponentMove(input, move())
  expect(plan.document.occurrences[0]).toMatchObject({ visible: false, suppressed: false, fixed: false })
  expect(plan.document.occurrences[0].pose.translation).toEqual([4, 5, 6])
})

it('requires exact definition identity and revision even when an alternate tuple exists', () => {
  for (const definition of [oldPartRef, otherPartRef, { id: partRef.id, revision: 'missing' }]) {
    expect(() => planAssemblyComponentMove(document(), move(['direct'], definition))).toThrow(/revisión/)
  }
  expect(() => planAssemblyComponentMove(document(), move(['wrapped'], sharedRef))).toThrow(/revisión/)
})

it('does not substitute a duplicate name or a same-ID declaration from another scope', () => {
  const input = document(), plan = planAssemblyComponentMove(input, move(['vintage', 'pin']))
  expect(plan.scope).toEqual(oldSharedRef); expect(plan.affectedPaths).toEqual([['vintage', 'pin']])
  expect(node(plan.document, oldSharedRef).occurrences[0].pose.translation).toEqual([4, 5, 6])
  expect(node(plan.document)).toEqual(node(input)); expect(plan.document.occurrences).toEqual(input.occurrences)
})

it('rejects missing, empty, part-through and dormant-only paths without a name fallback', () => {
  for (const path of [[], ['Same display name'], ['missing'], ['direct', 'pin'], ['uninstantiated', 'pin'], ['wrapped', 'pin']]) {
    expect(() => planAssemblyComponentMove(document(), move(path))).toThrow()
  }
})

it('retains all IDs, mate declarations, source documents and opaque revision labels', () => {
  const input = document(), plan = planAssemblyComponentMove(input, move(['sub-A', 'pin']))
  expect(plan.document.mates).toEqual(input.mates); expect(node(plan.document).mates).toEqual(node(input).mates)
  expect(plan.document.revision).toBe(input.revision)
  expect(plan.document.definitions.map(value => [value.id, value.revision])).toEqual(input.definitions.map(value => [value.id, value.revision]))
  expect(plan.document.definitions.filter(value => value.kind === 'part')).toEqual(input.definitions.filter(value => value.kind === 'part'))
  const { pose: _before, ...before } = node(input).occurrences[0]
  const { pose: _after, ...after } = node(plan.document).occurrences[0]
  expect(after).toEqual(before)
})

it('detaches the result document, address, pose and affected paths from inputs and one another', () => {
  const input = document(), request = move(), before = structuredClone(input), beforeRequest = structuredClone(request)
  const plan = planAssemblyComponentMove(input, request)
  expect(input).toEqual(before); expect(request).toEqual(beforeRequest)
  request.pose.translation[0] = 91; request.component.occurrencePath[0] = 'caller'; request.component.definition.revision = 'caller'
  expect(plan.pose.translation).toEqual([4, 5, 6]); expect(plan.component).toEqual(beforeRequest.component)
  plan.pose.translation[0] = 92; plan.component.occurrencePath[0] = 'result'; plan.component.definition.revision = 'result'
  plan.scope.revision = 'result'; plan.affectedPaths[0][0] = 'result'; plan.document.mates[0].name = 'result'
  expect(plan.document.occurrences[0].pose.translation).toEqual([4, 5, 6])
  expect(plan.document.occurrences[0].definition).toEqual(partRef); expect(plan.document.revision).toBe(rootRef.revision)
  expect(input).toEqual(before)
})

it('preserves accepted near-unit declaration quaternions without normalizing saved data', () => {
  const request = move(); request.pose.rotation = [0, 0, 0, 1 + 5e-11]
  const plan = planAssemblyComponentMove(document(), request)
  expect(plan.pose.rotation).toEqual(request.pose.rotation); expect(plan.document.occurrences[0].pose.rotation).toEqual(request.pose.rotation)
})

it('rejects nonfinite coordinates and zero, scaled or malformed quaternion declarations', () => {
  const bad: unknown[] = [
    { translation: [NaN, 0, 0], rotation: [0, 0, 0, 1] },
    { translation: [0, Infinity, 0], rotation: [0, 0, 0, 1] },
    { translation: [0, 0], rotation: [0, 0, 0, 1] },
    { translation: [0, 0, 0], rotation: [0, 0, 0, 0] },
    { translation: [0, 0, 0], rotation: [0, 0, 0, 2] },
    { translation: [0, 0, 0], rotation: [0, 0, NaN, 1] },
  ]
  for (const pose of bad) expect(() => unknownMove({ component: component(['direct']), pose })).toThrow()
})

it('rejects missing, unknown, symbolic, hidden and callable record fields', () => {
  const values: unknown[] = [null, [], {}, { component: component(['direct']) }, { ...move(), extra: true },
    { ...move(), [Symbol('extra')]: true }, { component: { ...component(['direct']), extra: true }, pose: identityRigidPose() },
    { component: { occurrencePath: ['direct'], definition: { ...partRef, extra: true } }, pose: identityRigidPose() },
    { component: component(['direct']), pose: { ...identityRigidPose(), toJSON() { return {} } } }]
  const hidden = move(); Object.defineProperty(hidden, 'extra', { value: true, enumerable: false }); values.push(hidden)
  for (const value of values) expect(() => unknownMove(value)).toThrow()
})

it('rejects accessors at every request boundary without executing them', () => {
  for (const field of ['component', 'pose', 'occurrencePath', 'definition', 'id', 'revision', 'translation', 'rotation', 'coordinate']) {
    const request = move(), getter = vi.fn(() => { throw new Error('Getter must not execute') })
    const target: object = field === 'component' || field === 'pose' ? request
      : field === 'occurrencePath' || field === 'definition' ? request.component
        : field === 'id' || field === 'revision' ? request.component.definition
          : field === 'coordinate' ? request.pose.translation : request.pose
    Object.defineProperty(target, field === 'coordinate' ? '0' : field, { get: getter, enumerable: true, configurable: true })
    expect(() => planAssemblyComponentMove(document(), request)).toThrow(); expect(getter).not.toHaveBeenCalled()
  }
})

it('accepts null-prototype data records but rejects inherited record and tuple prototypes', () => {
  const request = move()
  for (const target of [request, request.component, request.component.definition, request.pose]) Object.setPrototypeOf(target, null)
  expect(planAssemblyComponentMove(document(), request).pose.translation).toEqual([4, 5, 6])
  for (const field of ['move', 'component', 'definition', 'pose', 'path', 'translation', 'rotation']) {
    const bad = move(), target = field === 'move' ? bad : field === 'component' ? bad.component
      : field === 'definition' ? bad.component.definition : field === 'pose' ? bad.pose
        : field === 'path' ? bad.component.occurrencePath : field === 'translation' ? bad.pose.translation : bad.pose.rotation
    Object.setPrototypeOf(target, { inherited: true })
    expect(() => planAssemblyComponentMove(document(), bad)).toThrow()
  }
})

it('rejects sparse, extended or accessor path/pose tuples without evaluating elements', () => {
  const sparse = move(); delete sparse.component.occurrencePath[0]
  const extra = move(); Object.defineProperty(extra.pose.rotation, 'extra', { value: 1, enumerable: true })
  const symbolic = move(); Object.defineProperty(symbolic.pose.translation, Symbol('extra'), { value: 1, enumerable: true })
  const getter = vi.fn(() => 'direct'), accessed = move()
  Object.defineProperty(accessed.component.occurrencePath, '0', { get: getter, enumerable: true })
  for (const request of [sparse, extra, symbolic, accessed]) expect(() => planAssemblyComponentMove(document(), request)).toThrow()
  expect(getter).not.toHaveBeenCalled()
})

it('enforces bounded dense path and identifier syntax rather than coercing values', () => {
  for (const path of [Array(33).fill('direct'), [''], [' '], ['a\u0000b'], ['a'.repeat(129)], [1]]) {
    expect(() => unknownMove({ component: { occurrencePath: path, definition: partRef }, pose: identityRigidPose() })).toThrow()
  }
  for (const revision of ['', ' ', 'x\u007fy', 'r'.repeat(129), 1]) {
    expect(() => unknownMove({ component: { occurrencePath: ['direct'], definition: { id: partRef.id, revision } }, pose: identityRigidPose() })).toThrow()
  }
  const input = document(), id = 'x'.repeat(128); input.occurrences[0].id = id
  expect(planAssemblyComponentMove(input, move([id])).occurrenceId).toBe(id)
})

it('validates the complete current graph before returning any edit and does not invoke document getters', () => {
  const input = document(), before = structuredClone(input); node(input).occurrences[0].definition.revision = 'missing'
  expect(() => planAssemblyComponentMove(input, move())).toThrow()
  expect(input.occurrences).toEqual(before.occurrences)
  const executable = document(), getter = vi.fn(() => executable.occurrences)
  Object.defineProperty(executable, 'occurrences', { get: getter, enumerable: true })
  expect(() => planAssemblyComponentMove(executable, move())).toThrow(); expect(getter).not.toHaveBeenCalled()
})

it('supports detached undo/redo and branching without making the staged pose native authority', () => {
  const original = document(), history = new AssemblyDocumentHistory(original), first = planAssemblyComponentMove(history.current, move())
  history.commitDocument(first.document); expect(history.current.occurrences[0].pose.translation).toEqual([4, 5, 6])
  expect(history.undo()).toEqual(original); expect(history.canRedo).toBe(true)
  expect(history.redo()).toEqual(first.document); history.undo()
  const request = move(); request.pose.translation = [-7, 8, 9]
  history.commitDocument(planAssemblyComponentMove(history.current, request).document)
  expect(history.canRedo).toBe(false); expect(history.current.occurrences[0].pose.translation).toEqual([-7, 8, 9])
  first.document.occurrences[0].pose.translation[0] = 100
  expect(history.current.occurrences[0].pose.translation[0]).toBe(-7)
})

it('round-trips version 2 while retaining embedded version 1 bytes and declaration references', () => {
  const input = document(), partBefore = input.definitions.filter((value): value is EmbeddedPartDefinition => value.kind === 'part')
    .map(value => serializeDocument(value.document))
  const plan = planAssemblyComponentMove(input, move(['sub-A', 'pin'])), reopened = parseAssemblyDocument(serializeAssemblyDocument(plan.document))
  expect(reopened).toEqual(plan.document)
  expect(reopened.definitions.filter((value): value is EmbeddedPartDefinition => value.kind === 'part')
    .map(value => serializeDocument(value.document))).toEqual(partBefore)
  expect(reopened.mates).toEqual(input.mates); expect(node(reopened).mates).toEqual(node(input).mates)
})

it('updates only the root modification timestamp monotonically and leaves exact no-op timestamps alone', () => {
  const input = document(); input.updatedAt = '2099-01-01T00:00:00.000Z'
  const plan = planAssemblyComponentMove(input, move(['sub-A', 'pin']))
  expect(Date.parse(plan.document.updatedAt)).toBe(Date.parse(input.updatedAt) + 1)
  expect(plan.document.createdAt).toBe(input.createdAt); expect(node(plan.document).updatedAt).toBe(date)
  const pose: RigidPose = structuredClone(input.occurrences[0].pose)
  expect(planAssemblyComponentMove(input, { component: component(['direct']), pose }).document).toEqual(input)
})

it('keeps relation inspection explicitly native-verification-required after moving declarations', () => {
  const plan = planAssemblyComponentMove(document(), move(['sub-A', 'pin'])), inspections = inspectAssemblyMateReferences(plan.document)
  expect(inspections).toHaveLength(4)
  expect(inspections.every(value => value.nativeVerificationRequired === true)).toBe(true)
  expect(inspections.find(value => value.scopePath.join('/') === 'sub-A')?.first.candidate?.path).toEqual(['sub-A', 'pin'])
  expect(plan).not.toHaveProperty('token'); expect(plan).not.toHaveProperty('solver'); expect(plan).not.toHaveProperty('analysisId')
})
