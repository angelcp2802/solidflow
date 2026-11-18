import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { assemblyOriginDisplayPoints, createAssemblyOriginOverlay } from './assemblyOriginPicking'
import { buildAssemblyOriginTree, retainAssemblyOriginTreeSelection, resolveAssemblyOriginTreeSelection,
  type AssemblyOriginTreeContext, type AssemblyOriginTreeEntry } from './assemblyOriginTree'

// Reuses the original documented configuration prisms; all display coordinates
// below are literal placement witnesses, not native geometry/solver evidence.
const fixture = () => {
  const source = assemblyConfigurationCoreFixture()
  return { ...source, evaluation: evaluateAssemblyConfiguration(source.document, source.catalog, 'mixed') }
}
const context = (): AssemblyOriginTreeContext => ({ documentSignature: 'complete-document-catalog-signature', scopePath: [], sessionIdentity: {} })
function entry(rows: readonly AssemblyOriginTreeEntry[], owner: string[], datum: string) {
  const matches = rows.filter(value => JSON.stringify(value.ownerPath) === JSON.stringify(owner)
    && (value.display.reference.kind === 'principal-axis' ? value.display.reference.axis : value.display.reference.plane) === datum)
  expect(matches).toHaveLength(1)
  return matches[0]
}
function coordinates(actual: number[][], wanted: number[][]) {
  expect(actual).toHaveLength(wanted.length)
  actual.forEach((point, i) => point.forEach((value, j) => expect(value).toBeCloseTo(wanted[i][j], 12)))
}

describe('assembly origin tree declaration catalog', () => {
  it('lists six actual datums for the root and every visible occurrence without mutating declarations', () => {
    const { evaluation } = fixture(), before = JSON.stringify(evaluation), rows = buildAssemblyOriginTree(evaluation, [])
    expect(rows).toHaveLength(42)
    expect(new Set(rows.map(row => row.treeKey)).size).toBe(42)
    expect(new Set(rows.map(row => row.display.reference.kind))).toEqual(new Set(['principal-axis', 'principal-plane']))
    expect(rows.filter(row => !row.ownerPath.length)).toHaveLength(6)
    expect(rows.slice(0, 6).map(row => row.display.reference.kind === 'principal-plane' ? row.display.reference.plane : row.display.reference.axis))
      .toEqual(['XY', 'XZ', 'YZ', 'X', 'Y', 'Z'])
    expect(entry(rows, [], 'XY').display.reference.component).toBeNull()
    expect(entry(rows, ['left'], 'X').configuration).toBeNull()
    expect(entry(rows, ['right'], 'X').configuration).toBe('compact')
    expect(JSON.stringify(evaluation)).toBe(before)
  })
  it('distinguishes reused leaves and keeps rotated axis/plane world witnesses literal', () => {
    const rows = buildAssemblyOriginTree(fixture().evaluation, [])
    const left = entry(rows, ['left', 'b'], 'X'), right = entry(rows, ['right', 'b'], 'X'), plane = entry(rows, ['right', 'b'], 'XZ')
    expect(left.definition).toEqual(right.definition)
    expect(left.treeKey).not.toBe(right.treeKey)
    expect(right.display.reference.component).toEqual({ occurrencePath: ['right', 'b'], definition: { id: 'configuration-B', revision: 'r1' } })
    coordinates([left.display.worldPose.translation, right.display.worldPose.translation], [[10, 0, 0], [30, 4, 0]])
    coordinates(assemblyOriginDisplayPoints(left.display, 2).map(point => point.toArray()), [[8, 0, 0], [12, 0, 0]])
    coordinates(assemblyOriginDisplayPoints(right.display, 2).map(point => point.toArray()), [[30, 2, 0], [30, 6, 0]])
    coordinates(assemblyOriginDisplayPoints(plane.display, 2).map(point => point.toArray()), [[30, 2, -2], [30, 6, -2], [30, 6, 2], [30, 2, 2]])
  })
  it('binds a nested scope root to its absolute owner while producing relative child references', () => {
    const rows = buildAssemblyOriginTree(fixture().evaluation, ['right']), root = entry(rows, ['right'], 'XY'), child = entry(rows, ['right', 'b'], 'X')
    expect(rows).toHaveLength(18)
    expect(root.scopePath).toEqual(['right'])
    expect(root.definition).toEqual({ id: 'configuration-S', revision: 's-r1' })
    expect(root.display.reference.component).toBeNull()
    expect(child.display.reference.component).toEqual({ occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } })
    expect(rows.every(row => row.ownerPath[0] === 'right')).toBe(true)
    expect(root.treeKey).not.toBe(entry(buildAssemblyOriginTree(fixture().evaluation, []), ['right'], 'XY').treeKey)
    expect(buildAssemblyOriginTree(fixture().evaluation, ['missing'])).toEqual([])
  })
  it('excludes hidden ancestors and suppressed children, including retained selections', () => {
    const { document, catalog, evaluation } = fixture(), ticket = context()
    const prior = buildAssemblyOriginTree(evaluation, []), left = retainAssemblyOriginTreeSelection(entry(prior, ['left', 'a'], 'XY'), ticket)
    const rightB = retainAssemblyOriginTreeSelection(entry(prior, ['right', 'b'], 'X'), ticket)
    document.occurrences[0].visible = false
    const changed = evaluateAssemblyConfiguration(document, catalog, 'single-right'), rows = buildAssemblyOriginTree(changed, [])
    expect(rows).toHaveLength(18)
    expect(rows.some(row => row.ownerPath[0] === 'left')).toBe(false)
    expect(rows.some(row => JSON.stringify(row.ownerPath) === '["right","b"]')).toBe(false)
    expect(buildAssemblyOriginTree(changed, ['left'])).toEqual([])
    expect(resolveAssemblyOriginTreeSelection(left, rows, ticket)).toBeNull()
    expect(resolveAssemblyOriginTreeSelection(rightB, rows, ticket)).toBeNull()
  })
  it('keeps the full tree catalog separate from the unchanged 96-display overlay budget', () => {
    const { document } = fixture()
    for (let index = 0; index < 15; index++) document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'reused-' + index, name: 'Reused original ' + index })
    const rows = buildAssemblyOriginTree(evaluateAssemblyConfiguration(document, []), [])
    expect(rows).toHaveLength(312)
    expect(createAssemblyOriginOverlay(rows.map(row => row.display), 2).children).toHaveLength(0)
    const ticket = context(), selected = retainAssemblyOriginTreeSelection(entry(rows, ['reused-14', 'a'], 'XY'), ticket)
    const resolved = resolveAssemblyOriginTreeSelection(selected, rows, ticket)!
    const overlay = createAssemblyOriginOverlay([resolved.display], 2, [resolved.display.reference])
    expect(overlay.children.length).toBeGreaterThan(0)
    overlay.traverse(object => {
      if ('geometry' in object) (object.geometry as { dispose: () => void }).dispose()
      if ('material' in object) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) (material as { dispose: () => void }).dispose()
      }
    })
  })
})

describe('retained origin selection', () => {
  it('resolves only the unique current entry and keeps editable scope independent of catalog scope', () => {
    const { evaluation } = fixture(), rows = buildAssemblyOriginTree(evaluation, []), ticket = { ...context(), scopePath: ['right'] }
    const retained = retainAssemblyOriginTreeSelection(entry(rows, ['left', 'a'], 'XY'), ticket)
    const current = buildAssemblyOriginTree(evaluation, [])
    const resolved = resolveAssemblyOriginTreeSelection(retained, current, { ...ticket })
    expect(resolved).toBe(entry(current, ['left', 'a'], 'XY'))
    expect(resolved).not.toBe(entry(rows, ['left', 'a'], 'XY'))
    expect(resolveAssemblyOriginTreeSelection(retained, [...current, resolved!], ticket)).toBeNull()
    expect(resolveAssemblyOriginTreeSelection(retained, [], ticket)).toBeNull()
  })
  it.each(['document', 'scope', 'session'] as const)('rejects a callback retained across a %s change', change => {
    const rows = buildAssemblyOriginTree(fixture().evaluation, []), ticket = context(), retained = retainAssemblyOriginTreeSelection(rows[0], ticket)
    const changed = change === 'document' ? { ...ticket, documentSignature: 'changed-document-or-catalog' }
      : change === 'scope' ? { ...ticket, scopePath: ['right'] } : { ...ticket, sessionIdentity: {} }
    expect(resolveAssemblyOriginTreeSelection(retained, rows, changed)).toBeNull()
  })
  it('copies the captured editable scope and fails closed without a current session or selection', () => {
    const rows = buildAssemblyOriginTree(fixture().evaluation, []), scopePath = ['right'], ticket = { ...context(), scopePath }
    const retained = retainAssemblyOriginTreeSelection(rows[0], ticket)
    scopePath.push('a')
    expect(retained.scopePath).toEqual(['right'])
    expect(resolveAssemblyOriginTreeSelection(retained, rows, ticket)).toBeNull()
    expect(resolveAssemblyOriginTreeSelection(null, rows, ticket)).toBeNull()
    expect(resolveAssemblyOriginTreeSelection(retained, rows, { ...ticket, sessionIdentity: null })).toBeNull()
  })
  it.each(['pose', 'definition-revision', 'root-revision', 'configuration'] as const)('rejects changed %s even when a caller retains the old context signature', change => {
    const { document, catalog, evaluation } = fixture(), ticket = context()
    const oldRows = buildAssemblyOriginTree(evaluation, []), retained = retainAssemblyOriginTreeSelection(entry(oldRows, ['right', 'b'], 'X'), ticket)
    let selectedConfiguration = 'mixed'
    if (change === 'pose') document.occurrences[1].pose.translation = [31, 0, 0]
    if (change === 'definition-revision') {
      document.definitions.find(value => value.id === 'configuration-B')!.revision = 'r2'
      const assembly = document.definitions.find(value => value.id === 'configuration-S')!
      if (assembly.kind !== 'assembly') throw Error('Original subassembly required')
      assembly.occurrences[1].definition.revision = 'r2'
    }
    if (change === 'root-revision') { document.revision = 'root-r2'; catalog[0].definition.revision = 'root-r2' }
    if (change === 'configuration') selectedConfiguration = 'both-compact'
    const rows = buildAssemblyOriginTree(evaluateAssemblyConfiguration(document, catalog, selectedConfiguration), [])
    expect(resolveAssemblyOriginTreeSelection(retained, rows, ticket)).toBeNull()
  })
})
