import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import { buildAssemblyOriginTree } from './assemblyOriginTree'
import { configuredOriginContextLabel, configuredOriginContextRelation } from './configuredOriginContext'
import type { AssemblyOriginReference } from './assemblyOriginPicking'
import type { ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'

function fixture() {
  const { document, catalog } = assemblyConfigurationCoreFixture()
  const evaluation = evaluateAssemblyConfiguration(document, catalog, 'mixed')
  const entries = buildAssemblyOriginTree(evaluation, [])
  const entry = (owner: string[], kind: 'principal-axis' | 'principal-plane') => entries.find(row =>
    JSON.stringify(row.ownerPath) === JSON.stringify(owner) && row.display.reference.kind === kind
      && (row.display.reference.kind === 'principal-plane' ? row.display.reference.plane === 'XY' : row.display.reference.axis === 'Z'))!
  return { evaluation, entries, entry }
}
const choices = (reference: AssemblyOriginReference): ConfiguredMateUiChoice[] => [{ key: 'literal-form-option', label: 'Original datum', reference }]
const part = { id: 'configuration-B', revision: 'r1' }

describe('configured origin context form nomination', () => {
  it('names the owning hierarchy without showing its internal occurrence IDs', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    document.occurrences.find(row => row.id === 'left')!.name = 'Frame'
    const shared = document.definitions.find(row => row.id === 'configuration-S')!
    if (shared.kind !== 'assembly') throw Error('Original shared assembly required')
    shared.occurrences.find(row => row.id === 'b')!.name = 'Pin'
    const evaluation = evaluateAssemblyConfiguration(document, catalog, 'mixed'), entries = buildAssemblyOriginTree(evaluation, [])
    const entry = entries.find(row => row.ownerPath.join('/') === 'left/b' && row.display.reference.kind === 'principal-plane' && row.display.reference.plane === 'XY')!
    expect(configuredOriginContextLabel(entry, evaluation)).toBe('Plano XY · Frame / Pin')
  })
  it('prepares a root plane as coincidence without a component or saved edit', () => {
    const { evaluation, entries, entry } = fixture(), before = structuredClone(evaluation)
    const reference = { kind: 'principal-plane', component: null, plane: 'XY' } as const
    expect(configuredOriginContextRelation(entry([], 'principal-plane'), entries, evaluation, [], choices(reference)))
      .toEqual({ type: 'coincident', reference })
    expect(evaluation).toEqual(before)
  })
  it('rebases a global child plane into its actual current edit scope', () => {
    const { evaluation, entries, entry } = fixture()
    const reference: AssemblyOriginReference = { kind: 'principal-plane', component: { occurrencePath: ['b'], definition: part }, plane: 'XY' }
    const result = configuredOriginContextRelation(entry(['right', 'b'], 'principal-plane'), entries, evaluation, ['right'], choices(reference))!
    expect(result).toEqual({ type: 'coincident', reference })
    expect(entry(['right', 'b'], 'principal-plane').display.reference.component?.occurrencePath).toEqual(['right', 'b'])
  })
  it('uses a nested scope axis as its root frame and prepares unlocked concentricity', () => {
    const { evaluation, entries, entry } = fixture()
    const reference = { kind: 'principal-axis', component: null, axis: 'Z' } as const
    expect(configuredOriginContextRelation(entry(['right'], 'principal-axis'), entries, evaluation, ['right'], choices(reference)))
      .toEqual({ type: 'concentric', reference })
  })
  it('does not turn an outside owner or an ancestor into a local endpoint', () => {
    const { evaluation, entries, entry } = fixture()
    const reference: AssemblyOriginReference = { kind: 'principal-plane', component: { occurrencePath: ['b'], definition: part }, plane: 'XY' }
    for (const outside of [entry(['right', 'b'], 'principal-plane'), entry([], 'principal-plane')])
      expect(configuredOriginContextRelation(outside, entries, evaluation, ['left'], choices(reference))).toBeNull()
  })
  it('requires a unique current catalog binding and a unique purpose-compatible form option', () => {
    const { evaluation, entries, entry } = fixture(), target = entry([], 'principal-plane')
    const reference = { kind: 'principal-plane', component: null, plane: 'XY' } as const, options = choices(reference)
    expect(configuredOriginContextRelation(target, [...entries, target], evaluation, [], options)).toBeNull()
    expect(configuredOriginContextRelation({ ...target, binding: 'old' }, entries, evaluation, [], options)).toBeNull()
    expect(configuredOriginContextRelation(target, entries, evaluation, [], [])).toBeNull()
    expect(configuredOriginContextRelation(target, entries, evaluation, [], [...options, ...options])).toBeNull()
    expect(configuredOriginContextRelation(target, entries, evaluation, [], choices({ kind: 'principal-axis', component: null, axis: 'Z' }))).toBeNull()
  })
  it('uses the resolved current catalog entry instead of retained display/path data', () => {
    const { evaluation, entries, entry } = fixture(), target = entry(['right', 'b'], 'principal-plane')
    const reference: AssemblyOriginReference = { kind: 'principal-plane', component: { occurrencePath: ['b'], definition: part }, plane: 'XY' }
    const retained = { ...target, ownerPath: ['left', 'b'], display: entry([], 'principal-axis').display }
    expect(configuredOriginContextRelation(retained, entries, evaluation, ['right'], choices(reference))).toEqual({ type: 'coincident', reference })
  })
  it('detaches the nominated option so draft edits cannot change its current catalog', () => {
    const { evaluation, entries, entry } = fixture()
    const reference: AssemblyOriginReference = { kind: 'principal-plane', component: { occurrencePath: ['b'], definition: part }, plane: 'XY' }
    const options = choices(reference), result = configuredOriginContextRelation(entry(['right', 'b'], 'principal-plane'), entries, evaluation, ['right'], options)!
    expect(result.reference).not.toBe(options[0].reference)
    expect(result.reference).toEqual(reference)
  })
})
