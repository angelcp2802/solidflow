import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { assemblyDistanceUiEdit, retainAssemblyDistanceEdit, resolveAssemblyDistanceEdit, type AssemblyDistanceEditContext, type AssemblyDistanceMate } from './assemblyDistanceEdit'

// Existing original prism declarations; this checks intent/identity, not geometry.
function fixture() {
  const document = assemblyConfigurationCoreFixture().document
  const scope = document.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
  const mate: AssemblyDistanceMate = { id: 'saved-distance', type: 'distance', name: 'Saved distance', distance: -10,
    suppressed: true, alignment: 'aligned', first: { kind: 'principal-plane', component: null, plane: 'YZ' },
    second: { kind: 'principal-plane', component: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } }, plane: 'YZ' } }
  scope.mates.push(mate)
  const context: AssemblyDistanceEditContext = { documentSignature: serializeAssemblyDocument(document), scopePath: ['left'], scope, session: 7 }
  return { document, scope, mate, context }
}

describe('saved distance editing', () => {
  it('updates only fields, keeps ordered endpoints/suppression and reuses the saved ID in its shared parent', () => {
    const { document, scope, mate } = fixture(), before = structuredClone(document)
    const update = assemblyDistanceUiEdit(mate, { name: 'Revised distance', distance: '-12.5', alignment: 'opposed' })
    expect(update).toEqual({ type: 'distance', name: 'Revised distance', distance: -12.5, alignment: 'opposed', suppressed: true,
      first: mate.first, second: mate.second })
    expect(update.first).not.toBe(mate.first); expect(update.second).not.toBe(mate.second)
    const candidate = applyAssemblyEdit(document, { type: 'update-mate', scope: { id: scope.id, revision: scope.revision }, mateId: mate.id, mate: update })
    const changedScope = candidate.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
    expect(changedScope.mates).toEqual([{ ...update, id: mate.id }])
    expect(candidate.mates).toEqual([])
    expect(candidate.occurrences).toEqual(before.occurrences)
    expect(document).toEqual(before)
    const history = new AssemblyDocumentHistory(document)
    history.commitDocument(candidate)
    expect(history.undo()).toEqual(before); expect(history.redo()).toEqual(candidate)
  })

  it.each(['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999'])('rejects invalid signed distance %j before proposing an edit', distance => {
    const { mate } = fixture()
    expect(() => assemblyDistanceUiEdit(mate, { name: 'Distance', distance, alignment: 'aligned' })).toThrow('distancia firmada finita')
  })
  it.each(['0', '-0', '-12', '3.25'])('preserves finite signed distance %s', distance => {
    expect(assemblyDistanceUiEdit(fixture().mate, { name: 'Distance', distance, alignment: 'aligned' })).toHaveProperty('distance', Number(distance))
  })
  it('rejects a blank name without changing the saved relation', () => {
    const { mate } = fixture(), before = structuredClone(mate)
    expect(() => assemblyDistanceUiEdit(mate, { name: ' ', distance: '-12', alignment: 'aligned' })).toThrow('nombre')
    expect(mate).toEqual(before)
  })
  it('keeps the editor valid across discarded proposals without using a worker generation as identity', () => {
    const { document, context, mate } = fixture(), before = serializeAssemblyDocument(document)
    const ticket = retainAssemblyDistanceEdit(context, mate)!
    assemblyDistanceUiEdit(mate, { name: 'Unapplied', distance: '-12', alignment: 'opposed' })
    expect(resolveAssemblyDistanceEdit(ticket, context)).toBe(mate)
    expect(resolveAssemblyDistanceEdit(ticket, structuredClone(context))).toEqual(mate)
    expect(serializeAssemblyDocument(document)).toBe(before)
  })
  it('invalidates document edits, scope changes, revisions and byte-identical replacement sessions', () => {
    const { context, mate } = fixture(), ticket = retainAssemblyDistanceEdit(context, mate)!
    for (const changed of [
      { ...context, documentSignature: context.documentSignature + ' ' },
      { ...context, scopePath: ['right'] },
      { ...context, scope: { ...context.scope, revision: 'r2' } },
      { ...context, session: context.session + 1 },
      { ...context, scope: { ...context.scope, mates: [{ ...mate, distance: -11 }] } },
      { ...context, scope: { ...context.scope, mates: [] } },
      { ...context, scope: { ...context.scope, mates: [mate, mate] } },
    ]) expect(resolveAssemblyDistanceEdit(ticket, changed)).toBeNull()
    expect(resolveAssemblyDistanceEdit(null, context)).toBeNull()
    expect(retainAssemblyDistanceEdit(context, { ...mate, distance: -11 })).toBeNull()
  })
})
