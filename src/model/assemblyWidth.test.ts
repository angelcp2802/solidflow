import { expect, it } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyMate, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { assemblyMateEndpoints } from './assemblyMateEndpoints'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { identityRigidPose } from './rigidPose'

type Width = Extract<AssemblyMate, { type: 'width' }>
const stamp = '2026-10-21T00:00:00.000Z', source = { id: 'width-box-original', revision: 'r1' }
function plane(id: string): AssemblyGeometryReference {
  return { kind: 'principal-plane', plane: 'YZ', component: { occurrencePath: [id], definition: { ...source } } }
}
function original(): AssemblyDocument {
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'width-original', revision: 'a1', name: 'Original four-role planes', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...source, document: { version: 1, id: source.id, name: 'Original 4 by 6 by 4 prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
      features: [{ id: 'profile', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
        { id: 'solid', name: 'Prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'box' } }] } }],
    occurrences: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, definition: { ...source }, pose: identityRigidPose(), fixed: id !== 'd', visible: true, suppressed: false })),
    mates: [{ id: 'width', name: 'Original centered planes', type: 'width', mode: 'centered', suppressed: false,
      width: [plane('a'), plane('b')], tab: [plane('c'), plane('d')], widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned' }] })
}
const mate = (document: AssemblyDocument) => document.mates[0] as Width

it('round-trips four ordered saved roles without binary aliases or derived solver state', () => {
  const document = original(), value = mate(document)
  expect(parseAssemblyDocument(serializeAssemblyDocument(document))).toEqual(document)
  expect(value).not.toHaveProperty('first'); expect(value).not.toHaveProperty('second')
  expect(assemblyMateEndpoints(value).map(v => [v.side, v.reference])).toEqual([
    ['width-0', value.width[0]], ['width-1', value.width[1]], ['tab-0', value.tab[0]], ['tab-1', value.tab[1]],
  ])
  expect(Object.keys(value).sort()).toEqual(['alignment', 'id', 'mode', 'name', 'suppressed', 'tab', 'tabBranch', 'type', 'width', 'widthBranch'])
})

it('retains ordered roles, options and suppression through undo, redo and reopening', () => {
  const document = original(), history = new AssemblyDocumentHistory(document), { id, ...value } = mate(document)
  history.commit({ type: 'update-mate', mateId: id, mate: { ...value, suppressed: true, alignment: 'opposed', tab: [value.tab[1], value.tab[0]] } })
  expect(mate(history.current)).toMatchObject({ id, suppressed: true, alignment: 'opposed', tab: [value.tab[1], value.tab[0]] })
  expect(history.undo()).toEqual(document)
  const redone = history.redo(); expect(parseAssemblyDocument(serializeAssemblyDocument(redone))).toEqual(redone)
})

it.each(['mode', 'widthBranch', 'tabBranch', 'alignment', 'width', 'tab', 'first', 'solverOffset'])('rejects malformed or unsupported saved %s', field => {
  const document = original(), value: Record<string, unknown> = { ...mate(document) }
  const invalid: Record<string, unknown> = { mode: 'free', widthBranch: 'automatic', tabBranch: null, alignment: undefined, width: [mate(document).width[0]], tab: [...mate(document).tab, plane('a')], first: plane('a'), solverOffset: 0 }
  value[field] = invalid[field]
  expect(() => validateAssemblyDocument({ ...document, mates: [value] })).toThrow()
})

it('rejects executable, hidden and inherited tuple or option data without evaluating getters', () => {
  let reads = 0
  for (const field of ['width', 'mode', 'alignment']) {
    const document = original(), value = { ...mate(document) }
    Object.defineProperty(value, field, { enumerable: true, get() { reads++; return 'centered' } })
    expect(() => validateAssemblyDocument({ ...document, mates: [value] })).toThrow()
  }
  expect(reads).toBe(0)
  const document = original(), hidden = { ...mate(document) }
  Object.defineProperty(hidden, 'mode', { value: 'centered', enumerable: false })
  expect(() => validateAssemblyDocument({ ...document, mates: [hidden] })).toThrow()
  expect(() => validateAssemblyDocument({ ...document, mates: [Object.create(mate(document))] })).toThrow()
  const tuple = [...mate(document).tab]; Object.defineProperty(tuple, '0', { enumerable: true, get() { reads++; return plane('c') } })
  expect(() => validateAssemblyDocument({ ...document, mates: [{ ...mate(document), tab: tuple }] })).toThrow(); expect(reads).toBe(0)
})

it('inventories and explicitly repairs all four source-update roles without rewriting their siblings', () => {
  const document = original(), part = document.definitions[0]; if (part.kind !== 'part') throw Error('Original part required')
  const plan = prepareAssemblyPartUpdate(document, source, part.document, 'r2')
  expect(plan.endpoints.map(v => v.locator.side)).toEqual(['width-0', 'width-1', 'tab-0', 'tab-1'])
  let repaired = plan.document
  for (const item of plan.endpoints) {
    const before = assemblyMateEndpoints(mate(repaired)).map(v => structuredClone(v.reference))
    const reference = item.endpoint as AssemblyGeometryReference
    if (!reference.component) throw Error('Original owner required')
    repaired = repairAssemblyEndpoint(repaired, item.locator, { ...reference, component: { ...reference.component, definition: { ...source, revision: 'r2' } } })
    assemblyMateEndpoints(mate(repaired)).forEach((entry, index) => {
      if (entry.side !== item.locator.side) expect(entry.reference).toEqual(before[index])
    })
  }
  expect(assemblyMateEndpoints(mate(repaired)).map(v => (v.reference as AssemblyGeometryReference).component!.definition.revision)).toEqual(['r2', 'r2', 'r2', 'r2'])
  expect(parseAssemblyDocument(serializeAssemblyDocument(repaired))).toEqual(repaired)
  expect(mate(repaired)).toMatchObject({ id: 'width', mode: 'centered', widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned' })
})

it('inventories declarations once in shared, suppressed and dormant scopes', () => {
  const document = original(), part = document.definitions[0]; if (part.kind !== 'part') throw Error('Original part required')
  const shared: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'shared-width', revision: 's1', name: 'Shared original planes', createdAt: stamp, updatedAt: stamp, occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) }
  const dormant = { ...structuredClone(shared), id: 'dormant-width' }; dormant.mates[0].suppressed = true
  document.definitions.push(shared, dormant)
  document.occurrences.push(...['use-a', 'use-b'].map(id => ({ id, name: id, definition: { id: shared.id, revision: shared.revision }, pose: identityRigidPose(), fixed: true, visible: true, suppressed: id === 'use-b' })))
  const plan = prepareAssemblyPartUpdate(document, source, part.document, 'r2')
  expect(plan.endpoints).toHaveLength(12)
  for (const scope of [document.id, shared.id, dormant.id]) expect(plan.endpoints.filter(v => v.locator.scope.id === scope).map(v => v.locator.side)).toEqual(['width-0', 'width-1', 'tab-0', 'tab-1'])
})

it('plans selected and all-instance replacement using the actual four roles', () => {
  const document = original(), part = document.definitions[0]; if (part.kind !== 'part') throw Error('Original part required')
  const replacement = { ...structuredClone(part.document), id: 'replacement-original-box' }
  const request = { component: { occurrencePath: ['d'], definition: source }, part: replacement, revision: 'r-new', ancestorRevisions: [] }
  const selected = prepareAssemblyPartReplacement(document, { ...request, mode: 'selected' })
  expect(selected.endpoints.map(v => v.locator.side)).toEqual(['tab-1'])
  expect(mate(selected.document).width).toEqual(mate(document).width); expect(mate(selected.document).tab[0]).toEqual(mate(document).tab[0])
  const all = prepareAssemblyPartReplacement(document, { ...request, mode: 'all' })
  expect(all.endpoints.map(v => v.locator.side)).toEqual(['width-0', 'width-1', 'tab-0', 'tab-1'])
  expect(document).toEqual(original())
})
