import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { applyAssemblyEdit } from '../model/assemblyEditing'
import { retainAssemblyDirectionEdit, resolveAssemblyDirectionEdit, type AssemblyDirectionEditContext, type AssemblyDirectionMate } from './assemblyDirectionEdit'

// Existing original prism declarations. These cases check retained editor intent,
// not native geometry, a worker preview token or an executed desktop workflow.
function fixture(type: AssemblyDirectionMate['type'] = 'parallel') {
  const document = assemblyConfigurationCoreFixture().document
  const scope = document.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
  const mate: AssemblyDirectionMate = { id: 'saved-direction', type, name: 'Saved direction',
    alignment: type === 'parallel' ? 'aligned' : null, suppressed: true,
    first: { kind: 'principal-plane', component: null, plane: 'XY' },
    second: { kind: 'principal-plane', component: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } }, plane: 'XY' } }
  scope.mates.push(mate)
  const path = ['left']
  const context: AssemblyDirectionEditContext = { documentSignature: serializeAssemblyDocument(document), scopePath: path, scope, session: 7 }
  return { document, scope, mate, context, path }
}

describe('saved directional editor identity', () => {
  it.each(['parallel', 'perpendicular'] as const)('retains the unique exact saved %s declaration independently of context object identity', type => {
    const { context, mate } = fixture(type), before = structuredClone(context)
    const ticket = retainAssemblyDirectionEdit(context, mate)!
    expect(ticket).toMatchObject({ documentSignature: context.documentSignature, scopePath: ['left'],
      scope: { id: 'configuration-S', revision: 's-r1' }, session: 7, mateId: 'saved-direction', mateType: type,
      mateSignature: JSON.stringify(mate) })
    expect(resolveAssemblyDirectionEdit(ticket, context)).toBe(mate)
    expect(resolveAssemblyDirectionEdit(ticket, structuredClone(context))).toEqual(mate)
    expect(context).toEqual(before)
    expect(ticket).not.toHaveProperty('token')
    expect(ticket).not.toHaveProperty('generation')
  })

  it('detaches the retained scope and path from later caller mutation', () => {
    const { context, mate, scope, path } = fixture(), ticket = retainAssemblyDirectionEdit(context, mate)!
    path[0] = 'right'; scope.revision = 'changed'
    expect(ticket.scopePath).toEqual(['left'])
    expect(ticket.scope).toEqual({ id: 'configuration-S', revision: 's-r1' })
    expect(resolveAssemblyDirectionEdit(ticket, context)).toBeNull()
  })

  it.each(['parallel', 'perpendicular'] as const)('keeps original %s intent across a discarded conversion candidate without granting the new document authority', type => {
    const { document, scope, mate, context } = fixture(type), before = serializeAssemblyDocument(document)
    const ticket = retainAssemblyDirectionEdit(context, mate)!, nextType = type === 'parallel' ? 'perpendicular' : 'parallel'
    const candidate = applyAssemblyEdit(document, { type: 'update-mate', scope: { id: scope.id, revision: scope.revision }, mateId: mate.id,
      mate: { type: nextType, name: 'Unapplied references', suppressed: mate.suppressed, alignment: nextType === 'parallel' ? null : 'opposed',
        first: { kind: 'principal-axis', component: null, axis: 'X' }, second: mate.second } })
    const changedScope = candidate.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
    expect(changedScope.mates).toHaveLength(1)
    expect(changedScope.mates[0]).toMatchObject({ id: 'saved-direction', type: nextType, suppressed: true,
      first: { kind: 'principal-axis', component: null, axis: 'X' } })
    expect(ticket.mateType).toBe(type)
    expect(resolveAssemblyDirectionEdit(ticket, { ...context, documentSignature: serializeAssemblyDocument(candidate), scope: changedScope })).toBeNull()
    expect(resolveAssemblyDirectionEdit(ticket, context)).toBe(mate)
    expect(serializeAssemblyDocument(document)).toBe(before)
  })

  it('revokes document, scope, session and exact declaration changes, including a committed family conversion', () => {
    const { context, mate } = fixture(), ticket = retainAssemblyDirectionEdit(context, mate)!
    const changedMates: AssemblyDirectionMate[][] = [
      [{ ...mate, id: 'another-relation' }],
      [{ ...mate, name: 'Changed name' }],
      [{ ...mate, suppressed: false }],
      [{ ...mate, alignment: 'opposed' }],
      [{ ...mate, type: 'perpendicular', alignment: null }],
      [{ ...mate, first: { kind: 'principal-plane', component: null, plane: 'XZ' } }],
      [{ ...mate, second: { kind: 'principal-plane', component: null, plane: 'YZ' } }],
      [], [mate, structuredClone(mate)],
    ]
    for (const changed of [
      { ...context, documentSignature: context.documentSignature + ' ' },
      { ...context, scopePath: ['right'] },
      { ...context, scope: { ...context.scope, id: 'another-definition' } },
      { ...context, scope: { ...context.scope, revision: 's-r2' } },
      { ...context, session: context.session + 1 },
      ...changedMates.map(mates => ({ ...context, scope: { ...context.scope, mates } })),
    ]) expect(resolveAssemblyDirectionEdit(ticket, changed)).toBeNull()
    expect(resolveAssemblyDirectionEdit(null, context)).toBeNull()
  })

  it('rejects absent, ambiguous, changed or nondirectional declarations before retaining an editor', () => {
    const { context, mate } = fixture()
    expect(retainAssemblyDirectionEdit(context, { ...mate, name: 'Not the saved declaration' })).toBeNull()
    expect(retainAssemblyDirectionEdit({ ...context, scope: { ...context.scope, mates: [] } }, mate)).toBeNull()
    expect(retainAssemblyDirectionEdit({ ...context, scope: { ...context.scope, mates: [mate, structuredClone(mate)] } }, mate)).toBeNull()
    const angle = { id: mate.id, type: 'angle' as const, name: mate.name, suppressed: false, angle: 90, first: mate.first, second: mate.second }
    expect(retainAssemblyDirectionEdit({ ...context, scope: { ...context.scope, mates: [angle] } }, angle as unknown as AssemblyDirectionMate)).toBeNull()
    const ticket = retainAssemblyDirectionEdit(context, mate)!
    expect(resolveAssemblyDirectionEdit(ticket, { ...context, scope: { ...context.scope, mates: [angle] } })).toBeNull()
  })
})
