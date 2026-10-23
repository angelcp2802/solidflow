import { expect, it, vi } from 'vitest'
import { applyAssemblyEdit, AssemblyDocumentHistory, DEFAULT_ASSEMBLY_HISTORY_STATES, MAX_ASSEMBLY_HISTORY_STATES,
  type AssemblyEdit, type NewAssemblyMate, type NewAssemblyOccurrence } from './assemblyEditing'
import { expandAssemblyParts, parseAssemblyDocument, parseCadDocument, serializeAssemblyDocument, serializeCadDocument,
  validateAssemblyDocument, type AssemblyDocument, type EmbeddedAssemblyDefinition,
  type EmbeddedPartDefinition } from './assemblyDocument'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { DocumentHistory, parseDocument, serializeDocument, validateDocument } from './document'
import { identityRigidPose } from './rigidPose'

// Original in-memory declaration fixtures only. Unattested face IDs are not
// used as geometric evidence. These edits/history do not solve mates, confer
// native authority, exercise file dialogs or claim application integration.
const stamp = '2026-10-15T00:00:00.000Z'
const partRef = { id: 'original-part', revision: 'part-config-r1' }
function part(): EmbeddedPartDefinition {
  return { kind: 'part', ...partRef, document: validateDocument({ version: 1, id: partRef.id, name: 'Original small plate', units: 'mm',
    createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
        profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
      { id: 'solid', name: 'Original extrusion', type: 'extrude', suppressed: false, sketchId: 'profile', depth: 4, symmetric: false },
    ] }) }
}
function occurrence(): NewAssemblyOccurrence {
  return { name: 'Reusable occurrence', definition: { ...partRef }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true }
}
function component(id = 'left') { return { occurrencePath: [id], definition: { ...partRef } } }
function mate(): Extract<NewAssemblyMate, { type: 'coincident' }> {
  return { type: 'coincident', name: 'Original declared planes', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: component(), plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }
}
function document(): AssemblyDocument {
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'original-assembly', revision: 'assembly-config-r1',
    name: 'Original edit history', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part()],
    occurrences: [{ id: 'left', ...occurrence() }, { id: 'right', ...occurrence() }], mates: [{ id: 'original-mate', ...mate() }] })
}
function nested(): AssemblyDocument {
  const value = document(), sub: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'sub', revision: 'sub-config-r1',
    name: 'Original shared source', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ id: 'child', ...occurrence() }], mates: [{ id: 'child-mate', ...mate(),
      first: { kind: 'principal-plane', component: component('child'), plane: 'XY' } }] }
  value.definitions.push(sub)
  value.occurrences.forEach(item => { item.definition = { id: sub.id, revision: sub.revision } })
  value.mates = []
  return validateAssemblyDocument(value)
}
const scope = { id: 'sub', revision: 'sub-config-r1' }
function subassembly(value: AssemblyDocument): EmbeddedAssemblyDefinition {
  const result = value.definitions.find(item => item.id === scope.id && item.revision === scope.revision)
  if (!result || result.kind !== 'assembly') throw new Error('Original shared declaration missing')
  return result
}
function lastOccurrenceId(value: AssemblyDocument): string { return value.occurrences.at(-1)!.id }
function lastMateId(value: AssemblyDocument): string { return value.mates.at(-1)!.id }

// First creation deliberately forces one namespace, including a current ID
// collision. A monotonic process counter must still distinguish independent
// proposals, deletion and history retirement without an unbounded ID registry.
it('uses one UUID namespace and nonrecycled safe counter IDs even with a forced constant UUID and occupied candidate', () => {
  const namespace = '00000000-0000-4000-8000-000000000000', uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(namespace)
  try {
    const original = document(); original.occurrences.push({ id: namespace + '-1', ...occurrence() })
    const a = applyAssemblyEdit(original, { type: 'insert-occurrence', occurrence: occurrence() }), aId = lastOccurrenceId(a)
    const removed = applyAssemblyEdit(a, { type: 'delete-occurrence', occurrenceId: aId })
    const b = applyAssemblyEdit(removed, { type: 'insert-occurrence', occurrence: occurrence() })
    const c = applyAssemblyEdit(original, { type: 'insert-occurrence', occurrence: occurrence() })
    const withMate = applyAssemblyEdit(original, { type: 'add-mate', mate: mate() })
    const ids = [aId, lastOccurrenceId(b), lastOccurrenceId(c), lastMateId(withMate)]
    expect(new Set(ids).size).toBe(4); expect(ids.every(id => id.startsWith(namespace + '-') && id.length <= 128)).toBe(true)
    expect(ids).not.toContain(namespace + '-1'); expect(uuid).toHaveBeenCalledTimes(1)
    expect(a.definitions).toEqual(original.definitions); expect(a.revision).toBe(original.revision)
  } finally { uuid.mockRestore() }
})

it('inserts an independently owned occurrence that reuses the existing definition rather than copying or relabeling it', () => {
  const original = document(), before = structuredClone(original), payload = occurrence()
  const next = applyAssemblyEdit(original, { type: 'insert-occurrence', occurrence: payload })
  expect(next.definitions).toEqual(original.definitions); expect(next.definitions).toHaveLength(1)
  expect(next.occurrences).toHaveLength(3); expect(next.occurrences.slice(0, 2)).toEqual(original.occurrences)
  expect(next.occurrences[2].definition).toEqual(partRef); expect(next.occurrences[2].definition).not.toBe(payload.definition)
  payload.pose.translation[0] = 99; payload.definition.revision = 'changed caller'
  expect(next.occurrences[2].pose.translation).toEqual([0, 0, 0]); expect(next.occurrences[2].definition).toEqual(partRef)
  next.definitions[0].revision = 'changed result'; next.occurrences[0].name = 'changed result'
  expect(original).toEqual(before)
})

it('inserts another occurrence of the exact existing shared subassembly revision', () => {
  const original = nested(), next = applyAssemblyEdit(original, { type: 'insert-occurrence', occurrence: { ...occurrence(), definition: scope } })
  expect(next.definitions).toEqual(original.definitions); expect(next.occurrences[2].definition).toEqual(scope)
  expect(expandAssemblyParts(next).map(item => item.path)).toEqual([['left', 'child'], ['right', 'child'], [lastOccurrenceId(next), 'child']])
})

it('edits a shared source declaration by exact scope while retaining all occurrence and definition identities', () => {
  const original = nested(), before = structuredClone(original)
  const next = applyAssemblyEdit(original, { type: 'rename-occurrence', scope, occurrenceId: 'child', name: 'Renamed shared pin' })
  expect(expandAssemblyParts(next).map(item => item.occurrence.name)).toEqual(['Renamed shared pin', 'Renamed shared pin'])
  expect(next.occurrences).toEqual(original.occurrences)
  expect(subassembly(next).occurrences[0]).toMatchObject({ id: 'child', definition: partRef })
  expect(subassembly(next).updatedAt).toBe(stamp); expect(next.updatedAt).not.toBe(stamp)
  expect(next.revision).toBe(original.revision); expect(next.definitions.map(item => [item.id, item.revision])).toEqual(original.definitions.map(item => [item.id, item.revision]))
  expect(original).toEqual(before)
})

it('preserves accepted near-unit pose data, the existing ID and definition tuple on pose edits', () => {
  const original = document(), pose = { translation: [4, 5, 6] as [number, number, number], rotation: [0, 0, 0, 1 + 5e-11] as [number, number, number, number] }
  const next = applyAssemblyEdit(original, { type: 'set-occurrence-pose', occurrenceId: 'left', pose })
  expect(next.occurrences[0]).toMatchObject({ id: 'left', definition: partRef, pose })
  expect(next.occurrences[1]).toEqual(original.occurrences[1]); expect(next.mates).toEqual(original.mates)
  pose.translation[0] = 999; expect(next.occurrences[0].pose.translation[0]).toBe(4)
  expect(original.occurrences[0].pose).toEqual(identityRigidPose())
})

it('keeps endpoint identity through rename and visibility changes rather than resolving by display name', () => {
  const original = document(), renamed = applyAssemblyEdit(original, { type: 'rename-occurrence', occurrenceId: 'left', name: 'Same name as right' })
  const next = applyAssemblyEdit(renamed, { type: 'set-occurrence-visible', occurrenceId: 'left', visible: false })
  expect(next.mates).toEqual(original.mates); expect(next.occurrences[0]).toMatchObject({ id: 'left', definition: partRef, visible: false })
  const [inspection] = inspectAssemblyMateReferences(next)
  expect(inspection.first.diagnostics).toEqual([]); expect(inspection.first.candidate?.path).toEqual(['left'])
  expect(inspection.first.candidate?.visible).toBe(false); expect(inspection.nativeVerificationRequired).toBe(true)
})

it('suppresses a component without deleting its declarations and keeps the repair diagnostic visible', () => {
  const original = document(), next = applyAssemblyEdit(original, { type: 'set-occurrence-suppressed', occurrenceId: 'left', suppressed: true })
  expect(next.mates).toEqual(original.mates); expect(next.occurrences[0].id).toBe('left')
  expect(inspectAssemblyMateReferences(next)[0].first.diagnostics.map(item => item.code)).toEqual(['SUPPRESSED_COMPONENT'])
  expect(expandAssemblyParts(next).map(item => item.path)).toEqual([['right']])
  const restored = applyAssemblyEdit(next, { type: 'set-occurrence-suppressed', occurrenceId: 'left', suppressed: false })
  expect(restored.occurrences).toEqual(original.occurrences); expect(restored.mates).toEqual(original.mates)
})

it('sets a nested fixed declaration relative to its parent without inventing a world anchor', () => {
  const next = applyAssemblyEdit(nested(), { type: 'set-occurrence-fixed', scope, occurrenceId: 'child', fixed: true })
  const expanded = expandAssemblyParts(next)
  expect(expanded.map(item => item.chain.map(value => value.fixed))).toEqual([[false, true], [false, true]])
  expect(next.occurrences.every(item => item.fixed === false)).toBe(true)
})

it('preserves deleted-component endpoints for repair and never retargets them to a recreated same-name occurrence', () => {
  const original = document(), removed = applyAssemblyEdit(original, { type: 'delete-occurrence', occurrenceId: 'left' })
  expect(removed.mates).toEqual(original.mates); expect(removed.definitions).toEqual(original.definitions)
  const replacement = applyAssemblyEdit(removed, { type: 'insert-occurrence', occurrence: { ...occurrence(), name: original.occurrences[0].name } })
  const [inspection] = inspectAssemblyMateReferences(replacement)
  expect(lastOccurrenceId(replacement)).not.toBe('left'); expect(replacement.mates).toEqual(original.mates)
  expect(inspection.first.diagnostics).toEqual([{ code: 'MISSING_OCCURRENCE', path: ['left'] }]); expect(inspection.first.candidate).toBeNull()
  expect(parseAssemblyDocument(serializeAssemblyDocument(replacement))).toEqual(replacement)
})

it('retains repairable scoped mates in every reused occurrence after deleting their shared child', () => {
  const original = nested(), next = applyAssemblyEdit(original, { type: 'delete-occurrence', scope, occurrenceId: 'child' })
  expect(subassembly(next).mates).toEqual(subassembly(original).mates); expect(subassembly(next).occurrences).toEqual([])
  const inspections = inspectAssemblyMateReferences(next)
  expect(inspections.map(item => item.scopePath)).toEqual([['left'], ['right']])
  expect(inspections.map(item => item.first.diagnostics.map(value => value.code))).toEqual([['MISSING_OCCURRENCE'], ['MISSING_OCCURRENCE']])
})

it('creates a mate with a fresh ID, edits its explicit declaration under that same ID and deletes only the chosen relation', () => {
  const original = document(), added = applyAssemblyEdit(original, { type: 'add-mate', mate: mate() }), id = lastMateId(added)
  expect(id).not.toBe('original-mate'); expect(added.mates[0]).toEqual(original.mates[0])
  const changed: NewAssemblyMate = { ...mate(), type: 'distance', alignment: 'opposed', distance: -2.5 }
  const updated = applyAssemblyEdit(added, { type: 'update-mate', mateId: id, mate: changed })
  expect(updated.mates[1]).toEqual({ ...changed, id }); expect(updated.mates[0]).toEqual(original.mates[0])
  expect(applyAssemblyEdit(updated, { type: 'delete-mate', mateId: id }).mates).toEqual(original.mates)
})

it('updates references only when explicit mate repair data requests it, retaining the mate identity', () => {
  const original = document(), missing = applyAssemblyEdit(original, { type: 'delete-occurrence', occurrenceId: 'left' })
  const repaired: NewAssemblyMate = { ...mate(), first: { kind: 'principal-plane', component: component('right'), plane: 'XY' } }
  const next = applyAssemblyEdit(missing, { type: 'update-mate', mateId: 'original-mate', mate: repaired })
  expect(next.mates[0]).toMatchObject({ id: 'original-mate', first: repaired.first })
  expect(inspectAssemblyMateReferences(next)[0].first.diagnostics).toEqual([])
  expect(inspectAssemblyMateReferences(next)[0].nativeVerificationRequired).toBe(true)
})

const declaredAxis = (id: string) => ({ kind: 'face' as const, component: component(id), body: null,
  face: { sourceFeatureId: 'solid', key: 'face-v1|original-unattested-axis' }, support: 'axis' as const })
const otherMateFamilies: NewAssemblyMate[] = [
  { type: 'concentric', name: 'Original concentric declaration', suppressed: false, first: declaredAxis('left'), second: declaredAxis('right'),
    alignment: 'opposed', rotationLock: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
  { type: 'angle', name: 'Original angle declaration', suppressed: false, first: declaredAxis('left'),
    second: { kind: 'principal-plane', component: null, plane: 'YZ' }, angle: 37 },
  { type: 'lock', name: 'Original component-lock declaration', suppressed: false, first: component('left'), second: component('right'),
    relativePose: { translation: [2, 3, 4], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] } },
]
it.each(otherMateFamilies)('preserves the full $type declaration through creation and explicit update without native attestation', payload => {
  const original = document(), added = applyAssemblyEdit(original, { type: 'add-mate', mate: payload }), id = lastMateId(added)
  expect(added.mates.at(-1)).toEqual({ ...payload, id })
  const changed = { ...payload, name: 'Edited declaration', suppressed: true }
  const updated = applyAssemblyEdit(added, { type: 'update-mate', mateId: id, mate: changed })
  expect(updated.mates.at(-1)).toEqual({ ...changed, id }); expect(original.mates).toHaveLength(1)
  expect(parseAssemblyDocument(serializeAssemblyDocument(updated))).toEqual(updated)
  expect(inspectAssemblyMateReferences(added).every(item => item.nativeVerificationRequired)).toBe(true)
})

it('adds and deletes scoped mates in the shared declaration without touching root or sibling IDs', () => {
  const original = nested(), payload: NewAssemblyMate = { ...mate(), first: { kind: 'principal-plane', component: component('child'), plane: 'XY' } }
  const added = applyAssemblyEdit(original, { type: 'add-mate', scope, mate: payload }), id = subassembly(added).mates.at(-1)!.id
  expect(added.mates).toEqual([]); expect(added.occurrences).toEqual(original.occurrences)
  expect(inspectAssemblyMateReferences(added)).toHaveLength(4)
  const removed = applyAssemblyEdit(added, { type: 'delete-mate', scope, mateId: id })
  expect(subassembly(removed).mates).toEqual(subassembly(original).mates)
})

it('updates only the root modification stamp monotonically and does not relabel root or shared definitions', () => {
  const original = nested(), clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(stamp) - 1000)
  try {
    const next = applyAssemblyEdit(original, { type: 'rename-occurrence', scope, occurrenceId: 'child', name: 'Edited source' })
    expect(next.updatedAt).toBe('2026-10-15T00:00:00.001Z'); expect(next.createdAt).toBe(stamp)
    expect(subassembly(next).updatedAt).toBe(stamp); expect(next.revision).toBe(original.revision)
    expect(next.definitions.map(item => item.revision)).toEqual(original.definitions.map(item => item.revision))
  } finally { clock.mockRestore() }
})

const rejectedEdits: { name: string; edit: unknown }[] = [
  { name: 'missing occurrence', edit: { type: 'rename-occurrence', occurrenceId: 'missing', name: 'New name' } },
  { name: 'stale shared revision', edit: { type: 'rename-occurrence', scope: { id: 'sub', revision: 'stale' }, occurrenceId: 'child', name: 'New name' } },
  { name: 'part as edit scope', edit: { type: 'rename-occurrence', scope: partRef, occurrenceId: 'child', name: 'New name' } },
  { name: 'nonrigid pose', edit: { type: 'set-occurrence-pose', occurrenceId: 'left', pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 2] } } },
  { name: 'empty display name', edit: { type: 'rename-occurrence', occurrenceId: 'left', name: ' ' } },
  { name: 'nonboolean state', edit: { type: 'set-occurrence-suppressed', occurrenceId: 'left', suppressed: 1 } },
  { name: 'missing reused definition', edit: { type: 'insert-occurrence', occurrence: { ...occurrence(), definition: { id: 'missing', revision: 'r1' } } } },
  { name: 'cyclic root insertion', edit: { type: 'insert-occurrence', occurrence: { ...occurrence(), definition: { id: 'original-assembly', revision: 'assembly-config-r1' } } } },
  { name: 'missing mate update', edit: { type: 'update-mate', mateId: 'missing', mate: mate() } },
  { name: 'unknown operation', edit: { type: 'invented' } },
]
it.each(rejectedEdits)('rejects $name atomically after full document validation', ({ edit }) => {
  const original = nested(), before = structuredClone(original)
  expect(() => applyAssemblyEdit(original, edit as AssemblyEdit)).toThrow(); expect(original).toEqual(before)
})

it.each(['insert-occurrence', 'add-mate', 'update-mate'] as const)('rejects caller-supplied creation/replacement IDs for %s', type => {
  const original = document(), before = structuredClone(original)
  const edit = type === 'insert-occurrence' ? { type, occurrence: { ...occurrence(), id: 'left' } }
    : type === 'add-mate' ? { type, mate: { ...mate(), id: 'retargeted-mate' } }
      : { type, mateId: 'original-mate', mate: { ...mate(), id: 'retargeted-mate' } }
  expect(() => applyAssemblyEdit(original, edit as AssemblyEdit)).toThrow('identificador'); expect(original).toEqual(before)
})

it('rejects an attempted occurrence definition replacement as an unknown pose-edit field', () => {
  const original = document(), edit = { type: 'set-occurrence-pose', occurrenceId: 'left', pose: identityRigidPose(), definition: { id: 'other', revision: 'r1' } }
  expect(() => applyAssemblyEdit(original, edit as AssemblyEdit)).toThrow('campos')
  expect(original.occurrences[0].definition).toEqual(partRef)
})

it('rejects executable command fields and nested pose data without invoking getters or toJSON', () => {
  const original = document(), before = structuredClone(original); let calls = 0
  const top = Object.defineProperty({}, 'type', { enumerable: true, get() { calls++; return 'delete-occurrence' } })
  expect(() => applyAssemblyEdit(original, top as AssemblyEdit)).toThrow()
  const pose = identityRigidPose()
  Object.defineProperty(pose, 'translation', { enumerable: true, get() { calls++; return [1, 2, 3] } })
  expect(() => applyAssemblyEdit(original, { type: 'set-occurrence-pose', occurrenceId: 'left', pose })).toThrow()
  const executable = { ...identityRigidPose(), toJSON() { calls++; return identityRigidPose() } }
  expect(() => applyAssemblyEdit(original, { type: 'set-occurrence-pose', occurrenceId: 'left', pose: executable })).toThrow()
  expect(calls).toBe(0); expect(original).toEqual(before)
})

it('validates the source before command evaluation and leaves version-1 part APIs/history unchanged', () => {
  const source = part().document, serialized = serializeDocument(source), partHistory = new DocumentHistory(source)
  let reads = 0
  const edit = Object.defineProperty({}, 'type', { enumerable: true, get() { reads++; return 'delete-occurrence' } })
  expect(() => applyAssemblyEdit(source as unknown as AssemblyDocument, edit as AssemblyEdit)).toThrow()
  expect(() => new AssemblyDocumentHistory(source as unknown as AssemblyDocument)).toThrow(); expect(reads).toBe(0)
  expect(parseDocument(serialized)).toEqual(source); expect(serializeDocument(partHistory.current)).toBe(serialized)
  const edited = applyAssemblyEdit(document(), { type: 'rename-occurrence', occurrenceId: 'left', name: 'Saved edit' })
  expect(parseCadDocument(serializeCadDocument(edited))).toEqual(edited); expect(parseAssemblyDocument(serializeAssemblyDocument(edited))).toEqual(edited)
  expect(serializeDocument(source)).toBe(serialized)
})

it('clones constructor/current/commit read boundaries including embedded part data and reference arrays', () => {
  const original = document(), saved = structuredClone(original), history = new AssemblyDocumentHistory(original)
  original.occurrences[0].pose.translation[0] = 99; original.definitions[0].revision = 'outside mutation'
  const read = history.current; read.occurrences[0].definition.revision = 'outside mutation'
  const embedded = read.definitions[0]
  if (embedded.kind !== 'part') throw new Error('Original part missing')
  embedded.document.features[0].name = 'outside mutation'
  expect(history.current).toEqual(saved)
  const candidate = applyAssemblyEdit(history.current, { type: 'rename-occurrence', occurrenceId: 'left', name: 'Committed' })
  const returned = history.commitDocument(candidate)
  candidate.occurrences[0].name = 'mutated candidate'; returned.occurrences[0].pose.translation[0] = 200
  expect(history.current.occurrences[0]).toMatchObject({ name: 'Committed', pose: identityRigidPose() })
})

it('undoes/redoes complete saved identity and geometry declarations without allocating new creation IDs', () => {
  const initial = document(), history = new AssemblyDocumentHistory(initial), inserted = history.commit({ type: 'insert-occurrence', occurrence: occurrence() })
  const id = lastOccurrenceId(inserted), modified = history.commit({ type: 'set-occurrence-pose', occurrenceId: id,
    pose: { translation: [7, 8, 9], rotation: [0, 0, 0, 1] } })
  expect(history.undo()).toEqual(inserted); expect(history.undo()).toEqual(initial); expect(history.canUndo).toBe(false)
  const restored = history.redo(); expect(lastOccurrenceId(restored)).toBe(id); restored.occurrences[0].name = 'outside return'
  expect(history.redo()).toEqual(modified); expect(history.canRedo).toBe(false)
  expect(parseCadDocument(serializeCadDocument(history.current))).toEqual(modified)
})

it('discards the old redo branch on a new edit and never recycles the abandoned creation ID', () => {
  const history = new AssemblyDocumentHistory(document()), a = history.commit({ type: 'insert-occurrence', occurrence: occurrence() })
  history.undo(); expect(history.canRedo).toBe(true)
  const b = history.commit({ type: 'insert-occurrence', occurrence: occurrence() })
  expect(lastOccurrenceId(b)).not.toBe(lastOccurrenceId(a)); expect(history.canRedo).toBe(false)
  expect(history.redo()).toEqual(b); expect(history.undo().occurrences).toHaveLength(2)
})

it('preserves current and redo after failed commands, invalid snapshots and invalid resets', () => {
  const history = new AssemblyDocumentHistory(document()), committed = history.commit({ type: 'rename-occurrence', occurrenceId: 'left', name: 'Future' })
  const previous = history.undo(), invalid = structuredClone(previous); invalid.occurrences[0].definition.revision = 'missing revision'
  expect(() => history.commit({ type: 'set-occurrence-pose', occurrenceId: 'left', pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 2] } })).toThrow()
  expect(() => history.commitDocument(invalid)).toThrow(); expect(() => history.reset(invalid)).toThrow()
  expect(history.current).toEqual(previous); expect(history.canRedo).toBe(true); expect(history.canUndo).toBe(false)
  expect(history.redo()).toEqual(committed)
})

it('does not stamp or enqueue a structural no-op and preserves a redo branch for an identical snapshot', () => {
  const history = new AssemblyDocumentHistory(document()), initial = history.current
  expect(history.commit({ type: 'rename-occurrence', occurrenceId: 'left', name: initial.occurrences[0].name })).toEqual(initial)
  expect(history.canUndo).toBe(false)
  const changed = history.commit({ type: 'rename-occurrence', occurrenceId: 'left', name: 'Future' })
  history.undo(); history.commitDocument(history.current)
  expect(history.canRedo).toBe(true); expect(history.redo()).toEqual(changed)
})

it('caps all retained history states including present while moving repeatedly between past and future', () => {
  const history = new AssemblyDocumentHistory(document(), 3)
  for (let index = 1; index <= 5; index++) history.commit({ type: 'rename-occurrence', occurrenceId: 'left', name: 'Edit ' + index })
  expect(history.undo().occurrences[0].name).toBe('Edit 4'); expect(history.undo().occurrences[0].name).toBe('Edit 3')
  expect(history.canUndo).toBe(false); expect(history.undo().occurrences[0].name).toBe('Edit 3')
  expect(history.redo().occurrences[0].name).toBe('Edit 4'); expect(history.redo().occurrences[0].name).toBe('Edit 5'); expect(history.canRedo).toBe(false)
  expect(history.undo().occurrences[0].name).toBe('Edit 4'); expect(history.undo().occurrences[0].name).toBe('Edit 3'); expect(history.canUndo).toBe(false)
})

it('supports a one-state history and exposes explicit default/maximum state limits', () => {
  expect(DEFAULT_ASSEMBLY_HISTORY_STATES).toBe(100); expect(MAX_ASSEMBLY_HISTORY_STATES).toBe(256)
  const history = new AssemblyDocumentHistory(document(), 1), changed = history.commit({ type: 'rename-occurrence', occurrenceId: 'left', name: 'Only present' })
  expect(history.canUndo || history.canRedo).toBe(false); expect(history.undo()).toEqual(changed); expect(history.redo()).toEqual(changed)
  expect(new AssemblyDocumentHistory(document(), MAX_ASSEMBLY_HISTORY_STATES).current).toEqual(document())
})

it.each([0, -1, 1.5, 257, NaN, Infinity])('rejects an invalid history-state cap %s before retaining source', limit => {
  expect(() => new AssemblyDocumentHistory(document(), limit)).toThrow('entre 1 y 256')
})

it('resets to an independent validated document and clears both history branches without recycling creation IDs', () => {
  const history = new AssemblyDocumentHistory(document()), created = history.commit({ type: 'insert-occurrence', occurrence: occurrence() })
  history.undo(); const replacement = nested(), saved = structuredClone(replacement), returned = history.reset(replacement)
  replacement.name = 'outside reset input'; returned.occurrences[0].name = 'outside reset return'
  expect(history.current).toEqual(saved); expect(history.canUndo || history.canRedo).toBe(false)
  const newOccurrence = history.commit({ type: 'insert-occurrence', occurrence: occurrence() })
  expect(lastOccurrenceId(newOccurrence)).not.toBe(lastOccurrenceId(created))
})

it('stores syntax-valid shared definition and root-pose snapshots without claiming mate or native satisfaction', () => {
  const initial = nested(), history = new AssemblyDocumentHistory(initial), candidate = structuredClone(initial)
  const embedded = candidate.definitions[0]
  if (embedded.kind !== 'part' || embedded.document.features[0].type !== 'sketch' || embedded.document.features[0].profile.kind !== 'rectangle') throw new Error('Original part profile missing')
  embedded.document.features[0].profile.width = 4; candidate.occurrences[0].pose.translation = [10, 0, 0]
  subassembly(candidate).occurrences = [] // Mate remains deliberately repairable.
  history.commitDocument(candidate)
  expect(history.current.revision).toBe(initial.revision); expect(history.current.definitions.map(item => item.revision)).toEqual(initial.definitions.map(item => item.revision))
  expect(inspectAssemblyMateReferences(history.current).every(item => item.nativeVerificationRequired && item.first.diagnostics.length > 0)).toBe(true)
  expect(history.undo()).toEqual(initial); expect(history.redo()).toEqual(candidate)
})
