import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { configuredUiTicket } from './configuredAssemblyUi'
import { captureConfiguredComponentContext, configuredComponentContextRow, resolveConfiguredComponentContext } from './configuredAssemblyContextTarget'

function fixture() {
  const { document, catalog } = assemblyConfigurationCoreFixture()
  const configured = createAssemblyConfiguredDocument(document, catalog, 'mixed')
  const evaluation = evaluateAssemblyConfiguration(configured.source, configured.catalog, configured.rootConfiguration)
  const context = configuredUiTicket(configured, 7, '["right"]', 'original.solidflow', 'b', 0, 3)
  const component = { occurrencePath: ['right', 'b'], definition: { id: 'configuration-B', revision: 'r1' } }
  return { configured, evaluation, context, component }
}

describe('configured component context ownership', () => {
  it('captures the exact reused occurrence and its intrinsic owner state without geometry authority', () => {
    const { evaluation, context, component } = fixture(), before = structuredClone(evaluation)
    const target = captureConfiguredComponentContext(evaluation, context, component)!
    const row = resolveConfiguredComponentContext(target, evaluation, { ...context })!
    expect(row.scope.path).toEqual(['right']); expect(row.scope.configuration).toBe('compact'); expect(row.occurrence.id).toBe('b')
    expect(target.owner).toEqual({ definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact' })
    component.occurrencePath[0] = 'left'; component.definition.revision = 'changed'; context.generation = 8
    expect(target.component).toEqual({ occurrencePath: ['right', 'b'], definition: { id: 'configuration-B', revision: 'r1' } })
    expect(target.context.generation).toBe(7); expect(evaluation).toEqual(before)
  })
  it('distinguishes Base and named owners even when the reused definition is identical', () => {
    const { evaluation, context, component } = fixture()
    const right = captureConfiguredComponentContext(evaluation, context, component)!
    const leftContext = { ...context, scope: '["left"]' }, leftComponent = { ...component, occurrencePath: ['left', 'b'] }
    const left = captureConfiguredComponentContext(evaluation, leftContext, leftComponent)!
    expect(left.owner.configuration).toBeNull(); expect(right.owner.configuration).toBe('compact')
    expect(resolveConfiguredComponentContext(right, evaluation, leftContext)).toBeNull()
    expect(resolveConfiguredComponentContext(left, evaluation, context)).toBeNull()
  })
  it.each(['serialized', 'generation', 'scope', 'occurrence', 'path', 'draftRevision', 'navigationRevision'] as const)(
    'rejects a menu after its %s context changes', field => {
      const { evaluation, context, component } = fixture(), target = captureConfiguredComponentContext(evaluation, context, component)!
      const changed = { ...context, [field]: typeof context[field] === 'number' ? Number(context[field]) + 1 : 'changed' }
      expect(resolveConfiguredComponentContext(target, evaluation, changed)).toBeNull()
    })
  it('does not revive a menu after navigation returns to the same scope and occurrence', () => {
    const { evaluation, context, component } = fixture(), target = captureConfiguredComponentContext(evaluation, context, component)!
    expect(resolveConfiguredComponentContext(target, evaluation, { ...context, navigationRevision: 5 })).toBeNull()
    expect(resolveConfiguredComponentContext(target, structuredClone(evaluation), context)).toBeNull()
  })
  it('rejects missing, ambiguous or mismatched paths and definition revisions', () => {
    const { evaluation, context, component } = fixture()
    for (const candidate of [
      { ...component, occurrencePath: [] }, { ...component, occurrencePath: ['missing', 'b'] },
      { ...component, occurrencePath: ['right', 'missing'] }, { ...component, definition: { id: 'configuration-A', revision: 'r1' } },
      { ...component, definition: { ...component.definition, revision: 'r2' } },
    ]) expect(captureConfiguredComponentContext(evaluation, context, candidate)).toBeNull()
    const right = evaluation.scopes.find(scope => scope.path.join('/') === 'right')!
    const duplicate = { ...evaluation, scopes: evaluation.scopes.map(scope => scope === right
      ? { ...scope, occurrences: [...scope.occurrences, scope.occurrences.find(row => row.id === 'b')!] } : scope) }
    expect(configuredComponentContextRow(duplicate, component)).toBeNull()
    expect(configuredComponentContextRow({ ...evaluation, scopes: [...evaluation.scopes, right] }, component)).toBeNull()
  })
  it('requires a current UI selection and a safe navigation revision', () => {
    const { evaluation, context, component } = fixture()
    for (const invalid of [{ ...context, occurrence: 'a' }, { ...context, scope: '[]' }, { ...context, navigationRevision: undefined },
      { ...context, navigationRevision: -1 }, { ...context, navigationRevision: NaN }])
      expect(captureConfiguredComponentContext(evaluation, invalid, component)).toBeNull()
  })
})
