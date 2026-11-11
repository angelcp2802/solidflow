import { describe, expect, it } from 'vitest'
import { identityRigidPose } from '../model/rigidPose'
import { assemblyOriginReferenceKey, type AssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import { configuredMateUiDraft, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'
import { configuredOriginCatalog, configuredOriginHighlights, configuredOriginOwners, configuredOriginPickAssignment, configuredOriginPickChoice } from './configuredAssemblyOriginPicking'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'

const rootPlane: AssemblyOriginReference = { kind: 'principal-plane', component: null, plane: 'YZ' }
const childAxis: AssemblyOriginReference = { kind: 'principal-axis', component: { occurrencePath: ['slider'], definition: { id: 'original-slider', revision: 'r1' } }, axis: 'Z' }
const choice = (reference: AssemblyOriginReference): ConfiguredMateUiChoice => ({ key: JSON.stringify(reference), label: 'Current original reference', reference })
const display = (reference: AssemblyOriginReference): AssemblyOriginDisplay => ({ key: assemblyOriginReferenceKey(reference), label: 'Visible original origin', reference, worldPose: identityRigidPose() })

describe('configured origin nominations', () => {
  it('offers explicit current descendants with scope-relative references and independently known world placement', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture(), evaluation = evaluateAssemblyConfiguration(document, catalog, 'mixed')
    const before = JSON.stringify(evaluation), root = configuredOriginOwners(evaluation, []), nested = configuredOriginOwners(evaluation, ['right'])
    expect(root.map(row => row.path)).toEqual([['left'], ['right'], ['left', 'a'], ['left', 'b'], ['right', 'a'], ['right', 'b']])
    expect(nested.map(row => row.path)).toEqual([['right', 'a'], ['right', 'b']])
    const b = nested[1]
    expect(b.origins[0].reference.component).toEqual({ occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } })
    expect(b.origins[0].worldPose.translation[0]).toBeCloseTo(30, 12)
    expect(b.origins[0].worldPose.translation[1]).toBeCloseTo(4, 12)
    expect(b.origins[0].worldPose.translation[2]).toBe(0)
    expect(b.key).not.toBe(root.find(row => row.path.join('/') === 'right/b')!.key)
    b.origins[0].worldPose.translation[0] = 999
    expect(JSON.stringify(evaluation)).toBe(before)
  })

  it('removes hidden, suppressed and out-of-scope owners and never reuses a stale definition key', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    const old = configuredOriginOwners(evaluateAssemblyConfiguration(document, catalog, 'mixed'), ['right'])[1]
    document.occurrences[0].visible = false
    const current = evaluateAssemblyConfiguration(document, catalog, 'single-right')
    expect(configuredOriginOwners(current, []).map(row => row.path)).toEqual([['right'], ['right', 'a']])
    expect(configuredOriginOwners(current, ['left'])).toEqual([])
    expect(configuredOriginOwners(current, ['missing'])).toEqual([])
    expect(configuredOriginOwners(current, ['right']).some(row => row.key === old.key)).toBe(false)
    const original = evaluateAssemblyConfiguration(document, catalog, 'mixed')
    const replaced = { ...original, scopes: original.scopes.map(row => row.path.join('/') === 'right'
      ? { ...row, occurrences: row.occurrences.map(occurrence => occurrence.id === 'b' ? { ...occurrence, definition: { id: 'configuration-B', revision: 'r2' } } : occurrence) } : row) }
    expect(configuredOriginOwners(replaced, ['right']).some(row => row.key === old.key)).toBe(false)
  })

  it('assigns A then B without replacing A and rejects disarmed, replaced or stale display picks', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    const [a, b] = configuredOriginOwners(evaluateAssemblyConfiguration(document, catalog, 'mixed'), ['right'])
    const choices = [...a.origins, ...b.origins].map(row => choice(row.reference))
    const draft = { ...configuredMateUiDraft('successive-owners'), type: 'concentric' as const }
    const pickA = { slot: 0, catalog: configuredOriginCatalog(a.origins) }
    const first = configuredOriginPickAssignment(pickA, pickA, a.origins, draft, choices, a.origins[2].reference)!
    const withA = { ...draft, references: [first.reference, null] }, before = JSON.stringify(withA)
    expect(configuredOriginPickAssignment(pickA, null, a.origins, withA, choices, a.origins[2].reference)).toBeNull()
    const pickB = { slot: 1, catalog: configuredOriginCatalog(b.origins) }
    expect(configuredOriginPickAssignment(pickA, pickB, a.origins, withA, choices, a.origins[2].reference)).toBeNull()
    expect(configuredOriginPickAssignment(pickA, pickA, b.origins, withA, choices, a.origins[2].reference)).toBeNull()
    expect(configuredOriginPickAssignment(pickA, { ...pickA }, a.origins, withA, choices, a.origins[2].reference)).toBeNull()
    expect(configuredOriginPickAssignment(pickB, pickB, [], withA, choices, b.origins[2].reference)).toBeNull()
    const moved = structuredClone(b.origins); moved[0].worldPose.translation[0] += 1
    expect(configuredOriginPickAssignment(pickB, pickB, moved, withA, choices, b.origins[2].reference)).toBeNull()
    const second = configuredOriginPickAssignment(pickB, pickB, b.origins, withA, choices, b.origins[2].reference)!
    expect([first.reference, second.reference]).toEqual([
      { kind: 'principal-axis', component: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } }, axis: 'Z' },
      { kind: 'principal-axis', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }, axis: 'Z' },
    ])
    expect(JSON.stringify(withA)).toBe(before)
  })

  it('returns an owned copy of the exact current role option, ignoring overlay display metadata', () => {
    const draft = { ...configuredMateUiDraft('original-direction'), type: 'parallel' as const }
    const current = choice(childAxis), overlay = { ...display(childAxis), key: 'display-only', label: 'arbitrary display label', worldPose: { ...identityRigidPose(), translation: [90, 80, 70] as [number, number, number] } }
    const selected = configuredOriginPickChoice([overlay], draft, [current], 0, structuredClone(childAxis))
    expect(selected).toEqual(current)
    expect(selected).not.toBe(current)
    expect(selected?.reference).not.toBe(current.reference)
    expect(selected?.reference).not.toHaveProperty('worldPose')
  })

  it('keeps root planes separate from scoped component axes and enforces each role purpose', () => {
    const draft = configuredMateUiDraft('original-distance'), choices = [choice(rootPlane), choice(childAxis)], visible = [display(rootPlane), display(childAxis)]
    expect(configuredOriginPickChoice(visible, draft, choices, 1, rootPlane)?.reference).toEqual(rootPlane)
    expect(configuredOriginPickChoice(visible, draft, choices, 1, childAxis)).toBeNull()
    const hinge = { ...draft, type: 'hinge' as const }
    expect(configuredOriginPickChoice(visible, hinge, choices, 0, childAxis)).toBeNull()
    expect(configuredOriginPickChoice(visible, hinge, choices, 2, rootPlane)?.reference).toEqual(rootPlane)
    const concentric = { ...draft, type: 'concentric' as const }
    expect(configuredOriginPickChoice(visible, concentric, choices, 0, childAxis)?.reference).toEqual(childAxis)
    expect(configuredOriginPickChoice(visible, concentric, choices, 0, rootPlane)).toBeNull()
  })

  it('rejects hidden, stale-revision, wrong-scope, unavailable and ambiguous nominations', () => {
    const draft = { ...configuredMateUiDraft('original-direction'), type: 'parallel' as const }, current = choice(childAxis), visible = display(childAxis)
    expect(configuredOriginPickChoice([], draft, [current], 0, childAxis)).toBeNull()
    for (const component of [
      { occurrencePath: ['slider'], definition: { id: 'original-slider', revision: 'r0' } },
      { occurrencePath: ['parent', 'slider'], definition: { id: 'original-slider', revision: 'r1' } },
      { occurrencePath: ['slider'], definition: { id: 'different-part', revision: 'r1' } },
    ]) expect(configuredOriginPickChoice([visible], draft, [current], 0, { ...childAxis, component })).toBeNull()
    expect(configuredOriginPickChoice([visible], draft, [], 0, childAxis)).toBeNull()
    expect(configuredOriginPickChoice([visible, visible], draft, [current], 0, childAxis)).toBeNull()
    expect(configuredOriginPickChoice([visible], draft, [current, current], 0, childAxis)).toBeNull()
    for (const slot of [-1, 2, 0.5, Number.NaN]) expect(configuredOriginPickChoice([visible], draft, [current], slot, childAxis)).toBeNull()
    expect(configuredOriginPickChoice([visible], draft, [current], 0, null)).toBeNull()
  })

  it('highlights only visible current purpose-compatible selected origins, without duplicate marks', () => {
    const draft = { ...configuredMateUiDraft('original-distance'), references: [rootPlane, rootPlane] }
    expect(configuredOriginHighlights([display(rootPlane)], draft, [choice(rootPlane)])).toEqual([rootPlane])
    expect(configuredOriginHighlights([], draft, [choice(rootPlane)])).toEqual([])
    expect(configuredOriginHighlights([display(rootPlane)], draft, [])).toEqual([])
    expect(configuredOriginHighlights([display(childAxis)], { ...draft, references: [childAxis, null] }, [choice(childAxis)])).toEqual([])
  })
})
