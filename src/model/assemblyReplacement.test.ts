import { requireBinaryAssemblyMate as binaryMate } from './assemblyBinaryFixtures.test-utils'
import { expect, it, vi } from 'vitest'
import { prepareAssemblyPartReplacement, type AssemblyPartReplacementRequest } from './assemblyReplacement'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyComponentReference,
  type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyFaceReference, type AssemblyMate,
  type AssemblyOccurrence, type AssemblyPlaneReference, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { validateDocument, type Document } from './document'
import { identityRigidPose } from './rigidPose'
import { AssemblyDocumentHistory } from './assemblyEditing'

// Original declaration fixtures only: 2x3x4 and 5x3x4 mm part recipes.
// Matching feature/face labels across different part identities are deliberately
// unattested. No native geometry, correspondence or Apply authority is invented.
const stamp = '2026-10-20T00:00:00.000Z'
const source = { id: 'old-part', revision: 'p1' }, destination = { id: 'new-part', revision: 'p2' }
const rootScope = { id: 'root', revision: 'r1' }, aScope = { id: 'assembly-a', revision: 'a1' }, bScope = { id: 'assembly-b', revision: 'b1' }
const newA = { id: aScope.id, revision: 'a-selected' }, newB = { id: bScope.id, revision: 'b-selected' }
const selectedPath = ['a1', 'b1', 'leaf']
function part(id = source.id, width = 2): Document {
  return validateDocument({ version: 1, id, name: 'Original independent recipe', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width, height: 3 } },
    { id: 'solid', name: 'Box', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } },
  ] })
}
function component(path: string[], definition: AssemblyDefinitionReference = source): AssemblyComponentReference {
  return { occurrencePath: [...path], definition: { ...definition } }
}
function occurrence(id: string, definition: AssemblyDefinitionReference = source): AssemblyOccurrence {
  return { id, name: 'Same display name', definition: { ...definition }, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true }
}
function face(path: string[], support: 'plane' | 'axis' = 'plane'): AssemblyFaceReference {
  return { kind: 'face', component: component(path), body: { bodyId: 'body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'face-v1|same-unattested-label' }, support }
}
function frame(path: string[], definition: AssemblyDefinitionReference = source): AssemblyPlaneReference {
  return { kind: 'principal-plane', component: component(path, definition), plane: 'YZ' }
}
function planeMate(id: string, first: AssemblyPlaneReference): AssemblyMate {
  return { id, name: 'Same relation name', type: 'coincident', suppressed: false, alignment: 'aligned', first,
    second: { kind: 'principal-plane', component: null, plane: 'YZ' } }
}
function assembly(value: AssemblyDocument, reference: AssemblyDefinitionReference): EmbeddedAssemblyDefinition {
  const node = value.definitions.find(item => item.id === reference.id && item.revision === reference.revision)
  if (!node || node.kind !== 'assembly') throw new Error('Original assembly fixture missing')
  return node
}
function fixture(): AssemblyDocument {
  const leaf = occurrence('leaf'); leaf.fixed = true; leaf.suppressed = true; leaf.visible = false
  leaf.pose = { translation: [1, 2, 3], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  const b: EmbeddedAssemblyDefinition = { kind: 'assembly', ...bScope, name: 'Original reused B', createdAt: stamp, updatedAt: stamp,
    occurrences: [leaf, occurrence('spare'), occurrence('vintage', { ...source, revision: 'p0' })], mates: [
      planeMate('shared-id', frame(['leaf'])), planeMate('face', face(['leaf']) as AssemblyPlaneReference),
      { id: 'lock', name: 'Original saved lock', type: 'lock', suppressed: true, first: component(['leaf']), second: component(['spare']), relativePose: identityRigidPose() },
    ] }
  const a: EmbeddedAssemblyDefinition = { kind: 'assembly', ...aScope, name: 'Original reused A', createdAt: stamp, updatedAt: stamp,
    occurrences: [occurrence('b1', bScope), occurrence('b2', bScope)], mates: [
      planeMate('shared-id', frame(['b1'], bScope)), planeMate('leaf', frame(['b1', 'leaf'])), planeMate('sibling', frame(['b2'], bScope)),
    ] }
  const dormant: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'dormant', revision: 'd1', name: 'Original dormant declaration', createdAt: stamp, updatedAt: stamp,
    occurrences: [occurrence('leaf')], mates: [planeMate('shared-id', frame(['leaf']))] }
  const a1 = occurrence('a1', aScope); a1.pose.translation = [7, 8, 9]; a1.visible = false
  const a2 = occurrence('a2', aScope); a2.pose.translation = [-7, 0, 1]; a2.suppressed = true
  return validateAssemblyDocument({ version: 2, kind: 'assembly', ...rootScope, name: 'Original COW hierarchy', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...source, document: part() }, { kind: 'part', ...source, revision: 'p0', document: part(source.id, 1) }, a, b, dormant],
    occurrences: [a1, a2, occurrence('root-leaf')], mates: [
      planeMate('shared-id', frame(['a1'], aScope)), planeMate('nested-frame', frame(['a1', 'b1'], bScope)),
      planeMate('leaf', frame(selectedPath)), planeMate('face', face(selectedPath) as AssemblyPlaneReference),
      planeMate('untouched', frame(['a2', 'b1', 'leaf'])),
      { id: 'gear', name: 'Original carrier syntax', type: 'gear', suppressed: true, first: { ...face(['root-leaf']), support: 'axis' },
        second: { ...face(['a2', 'b2', 'spare']), support: 'axis' }, carrier: component(['a1'], aScope), ratio: { numerator: 1, denominator: 2 }, direction: 'same',
        neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: { first: 4 * Math.PI, second: 2 * Math.PI }, phase: 0 },
    ] })
}
function request(mode: 'selected' | 'all' = 'selected'): AssemblyPartReplacementRequest {
  return { component: component(selectedPath), mode, part: part(destination.id, 5), revision: destination.revision,
    ancestorRevisions: mode === 'selected' ? [newA.revision, newB.revision] : [] }
}
function firstComponent(document: AssemblyDocument, id: string, scope?: AssemblyDefinitionReference): AssemblyComponentReference | null {
  const first = binaryMate((scope ? assembly(document, scope) : document).mates.find(mate => mate.id === id)!).first
  return 'occurrencePath' in first ? first : first.component
}

it('forks each ancestor bottom-up and replaces exactly one full-path expansion with unchanged local identities/poses/flags', () => {
  const input = fixture(), original = structuredClone(input), intent = request(), originalIntent = structuredClone(intent)
  const plan = prepareAssemblyPartReplacement(input, intent)
  expect(plan.kind).toBe('assembly-replacement-plan'); expect(plan.source).toEqual(source); expect(plan.replacement).toEqual(destination)
  expect(plan.scopeMap).toEqual([{ beforeScope: aScope, afterScope: newA, scopePath: ['a1'] }, { beforeScope: bScope, afterScope: newB, scopePath: ['a1', 'b1'] }])
  expect(plan.occurrences).toEqual([{ originalScope: bScope, scope: newB, occurrenceId: 'leaf' }]); expect(plan.expandedPaths).toEqual([selectedPath])
  expect(plan.document.occurrences[0]).toEqual({ ...original.occurrences[0], definition: newA })
  expect(plan.document.occurrences.slice(1)).toEqual(original.occurrences.slice(1))
  expect(assembly(plan.document, newA).occurrences).toEqual([{ ...assembly(original, aScope).occurrences[0], definition: newB }, assembly(original, aScope).occurrences[1]])
  expect(assembly(plan.document, newB).occurrences).toEqual([{ ...assembly(original, bScope).occurrences[0], definition: destination }, ...assembly(original, bScope).occurrences.slice(1)])
  expect(plan.document.definitions.slice(0, original.definitions.length)).toEqual(original.definitions)
  expect(input).toEqual(original); expect(intent).toEqual(originalIntent)
})

it('makes a comparison baseline with the identical COW route but old leaf sources and references', () => {
  const input = fixture(), plan = prepareAssemblyPartReplacement(input, request())
  expect(plan.baseline.updatedAt).toBe(input.updatedAt)
  expect(plan.baseline.occurrences).toEqual(plan.document.occurrences)
  expect(assembly(plan.baseline, newB).occurrences[0].definition).toEqual(source)
  expect(firstComponent(plan.baseline, 'leaf', newA)?.definition).toEqual(source)
  expect(firstComponent(plan.document, 'leaf', newA)?.definition).toEqual(destination)
  expect(firstComponent(plan.baseline, 'shared-id')?.definition).toEqual(newA)
  expect(firstComponent(plan.baseline, 'nested-frame')?.definition).toEqual(newB)
  expect(firstComponent(plan.baseline, 'shared-id', newA)?.definition).toEqual(newB)
  expect(firstComponent(plan.baseline, 'shared-id', newB)?.definition).toEqual(source)
})

it('remaps ancestor frames/carriers and addresses leaf repairs in cloned scopes without touching sibling expansions', () => {
  const input = fixture(), plan = prepareAssemblyPartReplacement(input, request())
  const addresses = plan.endpoints.map(value => [value.locator.scope.id, value.locator.scope.revision, value.locator.mateId, value.locator.side])
  expect(addresses).toEqual([
    ['root', 'r1', 'shared-id', 'first'], ['root', 'r1', 'nested-frame', 'first'], ['root', 'r1', 'leaf', 'first'], ['root', 'r1', 'face', 'first'], ['root', 'r1', 'gear', 'carrier'],
    ['assembly-a', 'a-selected', 'shared-id', 'first'], ['assembly-a', 'a-selected', 'leaf', 'first'],
    ['assembly-b', 'b-selected', 'shared-id', 'first'], ['assembly-b', 'b-selected', 'face', 'first'], ['assembly-b', 'b-selected', 'lock', 'first'],
  ])
  expect(plan.endpoints.filter(value => !value.retainFrame).map(value => [value.locator.scope.id, value.locator.mateId])).toEqual([['root', 'face'], ['assembly-b', 'face']])
  const local = plan.endpoints.find(value => value.locator.scope.id === bScope.id && value.locator.mateId === 'face')!
  expect(local.originalLocator.scope).toEqual(bScope); expect(local.locator.scope).toEqual(newB)
  expect(local.desiredComponent).toEqual(component(['leaf'], destination)); expect(local.endpoint).toEqual(binaryMate(assembly(input, bScope).mates[1]).first)
  expect(firstComponent(plan.document, 'face', newB)).toEqual(component(['leaf']))
  expect(firstComponent(plan.document, 'untouched')).toEqual(firstComponent(input, 'untouched'))
  const gear = plan.document.mates.find(value => value.type === 'gear')!
  expect(gear.type === 'gear' && gear.carrier?.definition).toEqual(newA)
  expect(gear.type === 'gear' && gear.angles).toEqual({ first: 4 * Math.PI, second: 2 * Math.PI })
})

it('never promotes stale frame labels or matching face/edge labels across distinct part identities', () => {
  const input = fixture()
  const stale = binaryMate(input.mates.find(value => value.id === 'leaf')!)
  if (!('kind' in stale.first) || stale.first.kind !== 'principal-plane' || !stale.first.component) throw new Error('Expected datum fixture')
  stale.first.component.definition = { ...source, revision: 'p0' }
  const staleAncestor = binaryMate(input.mates.find(value => value.id === 'nested-frame')!)
  if (!('kind' in staleAncestor.first) || staleAncestor.first.kind !== 'principal-plane' || !staleAncestor.first.component) throw new Error('Expected datum fixture')
  staleAncestor.first.component.definition.revision = 'retired'
  input.mates.push({ id: 'edge', name: 'Original linear syntax', type: 'parallel', suppressed: false, alignment: null,
    first: { kind: 'edge', component: component(selectedPath), body: { bodyId: 'body', sourceFeatureId: 'solid' }, edge: { sourceFeatureId: 'solid', key: 'same-edge-key' }, support: 'line' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } })
  const plan = prepareAssemblyPartReplacement(input, request())
  expect(plan.endpoints.filter(value => ['leaf', 'nested-frame', 'edge'].includes(value.locator.mateId) && value.locator.scope.id === rootScope.id).every(value => !value.retainFrame)).toBe(true)
  expect(firstComponent(plan.document, 'leaf')).toEqual(stale.first.component)
  expect(firstComponent(plan.document, 'nested-frame')).toEqual(staleAncestor.first.component)
  expect(firstComponent(plan.document, 'edge')).toEqual(component(selectedPath))
})

it('records a path through the replaced part as pending rather than fabricating a descendant', () => {
  const input = fixture(); input.mates.push(planeMate('through-part', frame([...selectedPath, 'not-a-child'])))
  const plan = prepareAssemblyPartReplacement(input, request()), endpoint = plan.endpoints.find(value => value.locator.mateId === 'through-part')!
  expect(endpoint.retainFrame).toBe(false); expect(endpoint.desiredComponent).toEqual(component(selectedPath, destination))
  expect(firstComponent(plan.document, 'through-part')).toEqual(component([...selectedPath, 'not-a-child']))
})

it.each(['selected', 'all'] as const)('offers the actual affected leaf for manual repair of invalid descendant paths in %s mode', mode => {
  const input = fixture(), invalid = [...selectedPath, 'missing', 'descendant']
  input.mates.push(planeMate('root-through-part', frame(invalid)))
  assembly(input, bScope).mates.push(planeMate('local-through-part', frame(['leaf', 'missing'])))
  const saved = structuredClone(input), plan = prepareAssemblyPartReplacement(input, request(mode))
  const root = plan.endpoints.find(value => value.locator.mateId === 'root-through-part')!
  const local = plan.endpoints.find(value => value.locator.mateId === 'local-through-part')!
  expect(root.desiredComponent).toEqual(component(selectedPath, destination)); expect(root.retainFrame).toBe(false)
  expect(local.desiredComponent).toEqual(component(['leaf'], destination)); expect(local.retainFrame).toBe(false)
  expect(local.locator.scope).toEqual(mode === 'selected' ? newB : bScope)
  expect(root.endpoint).toEqual(binaryMate(saved.mates.at(-1)!).first)
  expect(local.endpoint).toEqual(binaryMate(assembly(saved, bScope).mates.at(-1)!).first)
  expect(firstComponent(plan.document, 'root-through-part')).toEqual(component(invalid))
  expect(firstComponent(plan.document, 'local-through-part', mode === 'selected' ? newB : bScope)).toEqual(component(['leaf', 'missing']))
  root.desiredComponent.occurrencePath[0] = 'outside'; local.desiredComponent.occurrencePath.push('outside')
  expect(input).toEqual(saved)
})

it('all-source changes each exact declaration including dormant/suppressed ones without COW and retains the original baseline', () => {
  const input = fixture(), before = structuredClone(input), plan = prepareAssemblyPartReplacement(input, request('all'))
  expect(plan.scopeMap).toEqual([]); expect(plan.baseline).toEqual(before)
  expect(plan.occurrences).toEqual([
    { originalScope: rootScope, scope: rootScope, occurrenceId: 'root-leaf' },
    { originalScope: bScope, scope: bScope, occurrenceId: 'leaf' }, { originalScope: bScope, scope: bScope, occurrenceId: 'spare' },
    { originalScope: { id: 'dormant', revision: 'd1' }, scope: { id: 'dormant', revision: 'd1' }, occurrenceId: 'leaf' },
  ])
  expect(plan.expandedPaths).toEqual([
    ['a1', 'b1', 'leaf'], ['a1', 'b1', 'spare'], ['a1', 'b2', 'leaf'], ['a1', 'b2', 'spare'],
    ['a2', 'b1', 'leaf'], ['a2', 'b1', 'spare'], ['a2', 'b2', 'leaf'], ['a2', 'b2', 'spare'], ['root-leaf'],
  ])
  expect(assembly(plan.document, bScope).occurrences.map(value => value.definition)).toEqual([destination, destination, { ...source, revision: 'p0' }])
  expect(assembly(plan.document, { id: 'dormant', revision: 'd1' }).occurrences[0].definition).toEqual(destination)
  expect(plan.endpoints.some(value => value.locator.scope.id === 'dormant')).toBe(true)
  expect(plan.endpoints.filter(value => value.locator.scope.id === rootScope.id && ['shared-id', 'nested-frame'].includes(value.locator.mateId))).toEqual([])
  expect(input).toEqual(before)
})

it('all-source inventories affected paths with stale expected tuples while leaving their stale declarations pending', () => {
  const input = fixture(), mate = binaryMate(input.mates.find(value => value.id === 'leaf')!)
  if (!('kind' in mate.first) || mate.first.kind !== 'principal-plane' || !mate.first.component) throw new Error('Expected original datum')
  mate.first.component.definition = { id: 'wrong-identity', revision: 'old-label' }
  const plan = prepareAssemblyPartReplacement(input, request('all')), endpoint = plan.endpoints.find(value => value.locator.scope.id === rootScope.id && value.locator.mateId === 'leaf')!
  expect(endpoint.retainFrame).toBe(false); expect(endpoint.desiredComponent).toEqual(component(selectedPath, destination))
  expect(firstComponent(plan.document, 'leaf')).toEqual(mate.first.component)
})

it('supports a root leaf with no ancestor revisions and preserves complete save/history identity', () => {
  const input = fixture(), intent = { ...request(), component: component(['root-leaf']), ancestorRevisions: [] }
  const plan = prepareAssemblyPartReplacement(input, intent)
  expect(plan.scopeMap).toEqual([]); expect(plan.expandedPaths).toEqual([['root-leaf']])
  expect(plan.document.occurrences[0]).toEqual(input.occurrences[0]); expect(plan.document.occurrences[2].definition).toEqual(destination)
  expect(parseAssemblyDocument(serializeAssemblyDocument(plan.document))).toEqual(plan.document)
  const history = new AssemblyDocumentHistory(input); history.commitDocument(plan.document)
  expect(history.undo()).toEqual(input); expect(history.redo()).toEqual(plan.document)
  // Syntax-only commit does not establish a native worker Apply capability.
})

it('reuses only an existing exact destination tuple with identical complete part content', () => {
  const input = fixture(), intent = request(); input.definitions.push({ kind: 'part', ...destination, document: structuredClone(intent.part) })
  const plan = prepareAssemblyPartReplacement(input, intent)
  expect(plan.document.definitions.filter(value => value.id === destination.id && value.revision === destination.revision)).toHaveLength(1)
  expect(plan.document.definitions).toHaveLength(input.definitions.length + 2)
  const collision = fixture(); collision.definitions.push({ kind: 'part', ...destination, document: part(destination.id, 6) })
  expect(() => prepareAssemblyPartReplacement(collision, intent)).toThrow('tuple')
  const another = fixture(); another.definitions.push({ kind: 'part', ...destination, revision: 'other', document: structuredClone(intent.part) })
  expect(prepareAssemblyPartReplacement(another, intent).document.definitions.filter(value => value.id === destination.id)).toHaveLength(2)
})

it('rejects an occupied ancestor revision, kind collision, same part ID and stale selected tuple atomically', () => {
  const input = fixture(), before = serializeAssemblyDocument(input)
  for (const intent of [
    { ...request(), ancestorRevisions: [aScope.revision, newB.revision] },
    { ...request(), ancestorRevisions: [newA.revision, bScope.revision] },
    { ...request(), part: part(source.id, 5) },
    { ...request(), part: part(aScope.id, 5) },
    { ...request(), component: component(selectedPath, { ...source, revision: 'p0' }) },
    { ...request(), component: component(['missing']), ancestorRevisions: [] },
    { ...request(), component: component(['a1'], aScope), ancestorRevisions: [] },
  ]) expect(() => prepareAssemblyPartReplacement(input, intent)).toThrow()
  expect(serializeAssemblyDocument(input)).toBe(before)
})

it('requires exact ancestor-revision cardinality and strict bounded input data without invoking callbacks', () => {
  let calls = 0
  const getter = Object.defineProperty(request(), 'part', { enumerable: true, get() { calls++; return part(destination.id) } })
  const listGetter = request(); Object.defineProperty(listGetter.ancestorRevisions, '0', { enumerable: true, get() { calls++; return 'unsafe' } })
  const sparse = request(); sparse.ancestorRevisions = Array(2)
  const hidden = Object.defineProperty(request(), 'revision', { value: 'hidden', enumerable: false })
  for (const intent of [getter, listGetter, sparse, hidden, { ...request(), extra: true }, { ...request(), ancestorRevisions: [] },
    { ...request('all'), ancestorRevisions: ['ignored'] }, { ...request(), ancestorRevisions: [newA.revision, ''] }, { ...request(), revision: '\u0000bad' },
    { ...request(), mode: 'guess' }, { ...request(), component: { ...component(selectedPath), name: 'not identity' } }]) {
    expect(() => prepareAssemblyPartReplacement(fixture(), intent as AssemblyPartReplacementRequest)).toThrow()
  }
  expect(calls).toBe(0)
})

it('keeps root/cloned timestamps monotonic and retains original source bytes despite future metadata', () => {
  const input = fixture(); assembly(input, bScope).updatedAt = '2040-01-01T00:00:00.000Z'
  const before = structuredClone(input), now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(stamp))
  try {
    const plan = prepareAssemblyPartReplacement(input, request())
    expect(plan.document.updatedAt).toBe('2040-01-01T00:00:00.001Z')
    expect(assembly(plan.document, newA).updatedAt).toBe(plan.document.updatedAt); expect(assembly(plan.document, newB).updatedAt).toBe(plan.document.updatedAt)
    expect(assembly(plan.baseline, newB).updatedAt).toBe(plan.document.updatedAt); expect(plan.baseline.updatedAt).toBe(input.updatedAt)
    expect(plan.document.definitions.slice(0, before.definitions.length)).toEqual(before.definitions)
  } finally { now.mockRestore() }
})

it('returns detached plans, endpoint originals and comparison layouts with no aliases into the inputs or each other', () => {
  const input = fixture(), intent = request(), saved = structuredClone(input), savedIntent = structuredClone(intent), plan = prepareAssemblyPartReplacement(input, intent)
  assembly(plan.document, newB).occurrences[0].pose.translation[0] = 999
  plan.endpoints[0].desiredComponent.occurrencePath[0] = 'outside'
  plan.scopeMap[0].afterScope.revision = 'outside'; plan.expandedPaths[0][0] = 'outside'
  expect(assembly(plan.baseline, newB).occurrences[0].pose.translation).toEqual([1, 2, 3])
  expect(input).toEqual(saved); expect(intent).toEqual(savedIntent)
})

it('rejects cloning past definition admission without clipping sources or publishing a partial candidate', () => {
  const input = fixture()
  while (input.definitions.length < 512) input.definitions.push({ kind: 'assembly', id: 'unused-' + input.definitions.length, revision: 'r1', name: 'Original empty declaration', createdAt: stamp, updatedAt: stamp, occurrences: [], mates: [] })
  const before = serializeAssemblyDocument(input)
  expect(() => prepareAssemblyPartReplacement(input, request())).toThrow()
  expect(serializeAssemblyDocument(input)).toBe(before)
})

it('rejects COW past the stored declaration budget even though the original selected hierarchy fits', () => {
  const input = fixture()
  input.definitions = input.definitions.filter(value => value.id !== 'dormant' && !(value.id === source.id && value.revision === 'p0'))
  input.occurrences = [input.occurrences[0]]; input.mates = []
  const a = assembly(input, aScope), b = assembly(input, bScope), leaf = structuredClone(b.occurrences[0])
  a.occurrences = [a.occurrences[0]]; a.mates = []; b.mates = []
  b.occurrences = Array.from({ length: 2047 }, (_, index) => ({ ...structuredClone(leaf), id: index ? 'other-' + index : 'leaf' }))
  // Original declarations: root1 + A1 + B2047 = 2049. COW adds
  // A1 + B2047, yielding 4097 stored declarations, above the existing4096 cap.
  const before = serializeAssemblyDocument(input)
  expect(() => prepareAssemblyPartReplacement(input, request())).toThrow('presupuesto de declaraciones')
  expect(serializeAssemblyDocument(input)).toBe(before)
})
