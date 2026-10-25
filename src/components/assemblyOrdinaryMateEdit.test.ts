import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { assemblyOrdinaryMateUiEdit, retainOrdinaryMateEdit, resolveOrdinaryMateEdit, type AssemblyOrdinaryMate, type OrdinaryMateEditContext } from './assemblyOrdinaryMateEdit'

// Reuse the original shared prism fixture; these are declaration, not geometry, checks.
function fixture(type: AssemblyOrdinaryMate['type'] = 'concentric') {
  const document = assemblyConfigurationCoreFixture().document
  const scope = document.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
  const component = { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } }
  const common = { id: 'saved-ordinary', name: 'Saved relation', suppressed: true, alignment: 'aligned' as const }
  const mate: AssemblyOrdinaryMate = type === 'concentric'
    ? { ...common, type, first: { kind: 'principal-axis', component: null, axis: 'Z' },
      second: { kind: 'principal-axis', component, axis: 'Z' }, rotationLock: [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)] }
    : { ...common, type, first: { kind: 'principal-plane', component: null, plane: 'XY' },
      second: { kind: 'principal-plane', component, plane: 'XY' } }
  scope.mates.push(mate)
  const context: OrdinaryMateEditContext = { documentSignature: serializeAssemblyDocument(document), scopePath: ['left'], scope, session: 7 }
  return { document, scope, mate, context }
}
const fields = { name: 'Revised relation', alignment: 'opposed' as const, releaseRotation: false }

describe('saved ordinary relation editing', () => {
  it.each(['coincident', 'concentric'] as const)('preserves %s identity, ordered references, suppression and shared parent through history', type => {
    const { document, scope, mate } = fixture(type), before = structuredClone(document)
    const update = assemblyOrdinaryMateUiEdit(mate, fields)!
    if (update.type !== 'coincident' && update.type !== 'concentric') throw Error('Expected ordinary edit')
    const { id: _id, ...declaration } = mate
    expect(update).toStrictEqual({ ...declaration, name: fields.name, alignment: fields.alignment })
    expect(update).not.toHaveProperty('id')
    expect(update.first).not.toBe(mate.first); expect(update.second).not.toBe(mate.second)
    const candidate = applyAssemblyEdit(document, { type: 'update-mate', scope: { id: scope.id, revision: scope.revision }, mateId: mate.id, mate: update })
    const changed = candidate.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
    expect(changed.mates).toEqual([{ ...update, id: mate.id }])
    expect(changed.occurrences).toEqual(scope.occurrences)
    expect(candidate.occurrences).toEqual(before.occurrences); expect(candidate.mates).toEqual([])
    expect(candidate.definitions.filter(value => value.kind === 'part')).toEqual(before.definitions.filter(value => value.kind === 'part'))
    expect(document).toEqual(before)
    const history = new AssemblyDocumentHistory(document); history.commitDocument(candidate)
    expect(history.undo()).toEqual(before); expect(history.redo()).toEqual(candidate)
  })
  it('clones the exact saved quaternion by default; only explicit release clears it', () => {
    const { mate } = fixture(), before = structuredClone(mate)
    if (mate.type !== 'concentric') throw Error('Expected concentric')
    const update = assemblyOrdinaryMateUiEdit(mate, fields)
    if (update?.type !== 'concentric') throw Error('Expected concentric edit')
    expect(update.rotationLock).toEqual(mate.rotationLock); expect(update.rotationLock).not.toBe(mate.rotationLock)
    expect(assemblyOrdinaryMateUiEdit(mate, { ...fields, releaseRotation: true })).toEqual({ ...update, rotationLock: null })
    expect(mate).toEqual(before)
    const free = { ...mate, rotationLock: null }
    expect(assemblyOrdinaryMateUiEdit(free, fields)).toHaveProperty('rotationLock', null)
    expect(assemblyOrdinaryMateUiEdit(free, { ...fields, releaseRotation: true })).toBeNull()
    expect(assemblyOrdinaryMateUiEdit(fixture('coincident').mate, { ...fields, releaseRotation: true })).toBeNull()
  })
  it.each(['', ' ', 'x'.repeat(201)])('rejects invalid name %j without mutation', name => {
    const { mate } = fixture(), before = structuredClone(mate)
    expect(assemblyOrdinaryMateUiEdit(mate, { ...fields, name })).toBeNull(); expect(mate).toEqual(before)
  })
  it('accepts the name boundary and rejects invalid orientation', () => {
    const { mate } = fixture()
    expect(assemblyOrdinaryMateUiEdit(mate, { ...fields, name: 'x'.repeat(200) })).not.toBeNull()
    expect(assemblyOrdinaryMateUiEdit(mate, { ...fields, alignment: 'invalid' as 'aligned' })).toBeNull()
  })
  it('keeps declaration authority across discarded proposals without worker generation identity', () => {
    const { context, mate } = fixture(), ticket = retainOrdinaryMateEdit(context, mate)!
    assemblyOrdinaryMateUiEdit(mate, { ...fields, releaseRotation: true })
    expect(resolveOrdinaryMateEdit(ticket, context)).toBe(mate)
    expect(resolveOrdinaryMateEdit(ticket, structuredClone(context))).toEqual(mate)
    expect(ticket.scopePath).not.toBe(context.scopePath); expect(ticket.scope).not.toBe(context.scope)
  })
  it('rejects document, scope, revision, session, missing/duplicate/retyped or changed declaration', () => {
    const { context, mate } = fixture(), ticket = retainOrdinaryMateEdit(context, mate)!
    for (const changed of [
      { ...context, documentSignature: context.documentSignature + ' ' },
      { ...context, scopePath: ['right'] }, { ...context, session: 8 },
      { ...context, scope: { ...context.scope, id: 'other' } },
      { ...context, scope: { ...context.scope, revision: 'r2' } },
      { ...context, scope: { ...context.scope, mates: [] } },
      { ...context, scope: { ...context.scope, mates: [mate, mate] } },
      { ...context, scope: { ...context.scope, mates: [{ ...mate, name: 'Changed' }] } },
      { ...context, scope: { ...context.scope, mates: [fixture('coincident').mate] } },
    ]) expect(resolveOrdinaryMateEdit(ticket, changed)).toBeNull()
    expect(resolveOrdinaryMateEdit(null, context)).toBeNull()
    expect(resolveOrdinaryMateEdit({ ...ticket, mateType: 'coincident' }, context)).toBeNull()
    expect(retainOrdinaryMateEdit(context, { ...mate, suppressed: false })).toBeNull()
    expect(retainOrdinaryMateEdit({ ...context, scope: { ...context.scope, mates: [mate, mate] } }, mate)).toBeNull()
  })
})
