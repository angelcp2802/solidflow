import { describe, expect, it } from 'vitest'
import { identityRigidPose } from '../model/rigidPose'
import { assemblyOriginReferenceKey, type AssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import { configuredMateUiDraft, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'
import { configuredOriginHighlights, configuredOriginPickChoice } from './configuredAssemblyOriginPicking'

const rootPlane: AssemblyOriginReference = { kind: 'principal-plane', component: null, plane: 'YZ' }
const childAxis: AssemblyOriginReference = { kind: 'principal-axis', component: { occurrencePath: ['slider'], definition: { id: 'original-slider', revision: 'r1' } }, axis: 'Z' }
const choice = (reference: AssemblyOriginReference): ConfiguredMateUiChoice => ({ key: JSON.stringify(reference), label: 'Current original reference', reference })
const display = (reference: AssemblyOriginReference): AssemblyOriginDisplay => ({ key: assemblyOriginReferenceKey(reference), label: 'Visible original origin', reference, worldPose: identityRigidPose() })

describe('configured origin nominations', () => {
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
