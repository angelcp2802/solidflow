import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { serializeAssemblyDocument, type AssemblyDocument, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { retainAssemblyInsertionSelection, resolveAssemblyInsertionSelection } from './assemblyInsertionSelection'

// Reuses the original documented configuration prisms; no native geometry claim.
function insert(before: AssemblyDocument, nested = false) {
  const after = applyAssemblyEdit(before, { type: 'insert-occurrence', scope: nested ? { id: 'configuration-S', revision: 's-r1' } : undefined,
    occurrence: { name: 'a', definition: { id: 'configuration-A', revision: 'r1' },
      pose: identityRigidPose(), fixed: false, visible: true, suppressed: false } })
  const scope = nested ? after.definitions.find(value => value.id === 'configuration-S') as EmbeddedAssemblyDefinition : after
  scope.occurrences.at(-1)!.id = 'inserted'
  return after
}

describe('post-insertion presentation destination', () => {
  it('finds the new root ID even when it is not the last row and retains explicit free identity placement', () => {
    const before = assemblyConfigurationCoreFixture().document, after = insert(before)
    after.occurrences.unshift(after.occurrences.pop()!)
    const bytes = serializeAssemblyDocument(after), navigation = { scopePath: [], epoch: 3 }
    const ticket = retainAssemblyInsertionSelection(before, after, navigation)
    expect(resolveAssemblyInsertionSelection(ticket, after, navigation)).toEqual({ occurrencePath: ['inserted'], definition: { id: 'configuration-A', revision: 'r1' } })
    expect(after.occurrences[0]).toMatchObject({ name: 'a', fixed: false, pose: identityRigidPose() })
    expect(serializeAssemblyDocument(after)).toBe(bytes)
  })

  it('binds insertion into a reused nested definition to the captured right-hand path', () => {
    const before = assemblyConfigurationCoreFixture().document, after = insert(before, true)
    const navigation = { scopePath: ['right'], epoch: 4 }, ticket = retainAssemblyInsertionSelection(before, after, navigation)
    expect(ticket?.scope).toEqual({ id: 'configuration-S', revision: 's-r1' })
    expect(resolveAssemblyInsertionSelection(ticket, after, navigation)?.occurrencePath).toEqual(['right', 'inserted'])
    expect(resolveAssemblyInsertionSelection(ticket, after, { ...navigation, scopePath: ['left'] })).toBeNull()
  })

  it('retains an exact new revision rather than another definition with the same ID', () => {
    const before = assemblyConfigurationCoreFixture().document, after = insert(before)
    const revision = structuredClone(after.definitions.find(value => value.id === 'configuration-A')!)
    revision.revision = 'r2'; after.definitions.push(revision)
    after.occurrences.find(value => value.id === 'inserted')!.definition.revision = 'r2'
    const navigation = { scopePath: [], epoch: 0 }, ticket = retainAssemblyInsertionSelection(before, after, navigation)
    expect(resolveAssemblyInsertionSelection(ticket, after, navigation)?.definition).toEqual({ id: 'configuration-A', revision: 'r2' })
    after.occurrences.find(value => value.id === 'inserted')!.definition.revision = 'r1'
    expect(resolveAssemblyInsertionSelection(ticket, after, navigation)).toBeNull()
  })

  it('does not choose a last row when canceled, unchanged, ambiguous or replacing an existing occurrence', () => {
    const before = assemblyConfigurationCoreFixture().document, navigation = { scopePath: [], epoch: 0 }
    expect(retainAssemblyInsertionSelection(before, before, navigation)).toBeNull()
    expect(resolveAssemblyInsertionSelection(null, before, navigation)).toBeNull()
    const multiple = insert(before)
    multiple.occurrences.push({ ...structuredClone(multiple.occurrences.at(-1)!), id: 'another' })
    expect(retainAssemblyInsertionSelection(before, multiple, navigation)).toBeNull()
    const replacement = insert(before); replacement.occurrences.shift()
    expect(retainAssemblyInsertionSelection(before, replacement, navigation)).toBeNull()
  })

  it('rejects changed navigation even after returning to the same selection and scope', () => {
    const before = assemblyConfigurationCoreFixture().document, after = insert(before), navigation = { scopePath: [], epoch: 2 }
    const ticket = retainAssemblyInsertionSelection(before, after, navigation)
    expect(resolveAssemblyInsertionSelection(ticket, after, { ...navigation, epoch: 4 })).toBeNull()
  })

  it('rejects document replacement and undo/redo to identical bytes without adding history', () => {
    const before = assemblyConfigurationCoreFixture().document, history = new AssemblyDocumentHistory(before)
    const after = history.commitDocument(insert(before)), navigation = { scopePath: [], epoch: 0 }
    const ticket = retainAssemblyInsertionSelection(before, after, navigation)
    expect(resolveAssemblyInsertionSelection(ticket, structuredClone(after), navigation)).toBeNull()
    expect(resolveAssemblyInsertionSelection(ticket, history.undo(), navigation)).toBeNull()
    expect(history.canUndo).toBe(false)
    const redone = history.redo()
    expect(serializeAssemblyDocument(redone)).toBe(serializeAssemblyDocument(after))
    expect(resolveAssemblyInsertionSelection(ticket, redone, navigation)).toBeNull()
  })

  it('rejects a stale scope revision and hidden or suppressed insertion paths', () => {
    const before = assemblyConfigurationCoreFixture().document, after = insert(before, true), navigation = { scopePath: ['right'], epoch: 1 }
    const ticket = retainAssemblyInsertionSelection(before, after, navigation)
    const shared = after.definitions.find(value => value.id === 'configuration-S') as EmbeddedAssemblyDefinition
    shared.revision = 's-r2'; after.occurrences.forEach(value => { value.definition.revision = 's-r2' })
    expect(retainAssemblyInsertionSelection(before, after, navigation)).toBeNull()
    expect(resolveAssemblyInsertionSelection(ticket, after, navigation)).toBeNull()
    for (const field of ['visible', 'suppressed'] as const) {
      const changed = insert(before, true)
      changed.occurrences.find(value => value.id === 'right')![field] = field === 'suppressed'
      expect(retainAssemblyInsertionSelection(before, changed, navigation)).toBeNull()
    }
  })
})
