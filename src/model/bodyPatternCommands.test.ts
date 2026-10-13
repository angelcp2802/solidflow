import { describe, expect, it } from 'vitest'
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { applyBodyCommand, isBodyCommandFeature, prepareBodyCommand, withBodySelection, type BodyCommandState } from './bodyCommands'
import { reconcileBodyPatternDraft } from './bodyPatterns'
import { bodyReferenceCreationFeatureId } from './bodyReferences'
import { createDocument, parseDocument, serializeDocument, validateDocument } from './document'

// Original saved command records; these pure tests construct no BReps.
// Healthy preview receipts below are symbolic application inputs, not geometry evidence.
const a: BodyReference = { bodyId: 'command-seed-a', sourceFeatureId: 'command-create-a' }
const b: BodyReference = { bodyId: 'command-seed-b', sourceFeatureId: 'command-create-b' }
const inputs: Feature[] = [a, b].flatMap(reference => [{
  id: `profile-${reference.bodyId}`, name: 'Original synthetic profile', type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 }, suppressed: false,
}, {
  id: reference.sourceFeatureId, name: 'Original synthetic body', type: 'extrude', sketchId: `profile-${reference.bodyId}`,
  depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: reference.bodyId }, suppressed: false,
}] as Feature[])
const document = (...features: Feature[]) => validateDocument({ ...createDocument(), features: [...inputs, ...features] })
function pattern(type: RepetitionFeature['type'], scope: 'current' | 'historical' = 'current'): RepetitionFeature {
  const base = { id: `command-${type}`, name: 'Body repetition proposal', suppressed: false, baseFeatureId: b.sourceFeatureId,
    source: { mode: 'bodies' as const, scope, bodies: [{ ...a }, { ...b }] }, bodyPattern: { mode: 'new' as const, instances: [] } }
  const draft: RepetitionFeature = type === 'linearPattern' ? { ...base, type, first: { direction: [1, 0, 0], count: 3, spacing: 20 },
    second: null, secondSeedOnly: false, skipped: [] }
    : type === 'circularPattern' ? { ...base, type, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, count: 3,
      angle: 360, equalSpacing: true, reversed: false, skipped: [] }
      : { ...base, type, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
  let counter = 0
  return reconcileBodyPatternDraft(draft, () => `${type}-command-output-${++counter}`)
}
function state(feature: RepetitionFeature, committed = document(), current: BodyReference[] = [a, b]): BodyCommandState {
  return { document: committed, feature, selection: feature.source.mode === 'bodies' ? feature.source.bodies : [],
    catalog: { active: true, bodies: current.map(ref => ({ ref })) } }
}
const types = ['linearPattern', 'circularPattern', 'mirror'] as const
const modification: Feature = { id: 'command-modify-a', name: 'Modify original target', type: 'extrude',
  sketchId: `profile-${a.bodyId}`, depth: 5, symmetric: false, suppressed: false, bodyOperation: { mode: 'merge', target: a } }
const modifiedA: BodyReference = { bodyId: a.bodyId, sourceFeatureId: modification.id }

describe('explicit repetition command proposals', () => {
  it.each(types)('prepares and applies one detached %s proposal with the allocated output IDs', type => {
    const input = state(pattern(type)), preparation = prepareBodyCommand(input)
    expect(isBodyCommandFeature(input.feature)).toBe(true)
    expect(preparation.accepted).toBe(true)
    if (!preparation.accepted) throw new Error(preparation.message)
    const plan = preparation.plan
    expect(plan.document.features.at(-1)).toEqual(input.feature)
    expect(plan.previewFeatures.at(-1)).toEqual(input.feature)
    expect(plan.document.features.at(-1)).not.toBe(input.feature)
    expect(applyBodyCommand(plan, input, { features: structuredClone(plan.previewFeatures), healthy: true }).accepted).toBe(false)
    expect(applyBodyCommand(plan, input, { features: plan.previewFeatures, healthy: false }).accepted).toBe(false)
    const result = applyBodyCommand(plan, input, { features: plan.previewFeatures, healthy: true })
    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error(result.message)
    expect(parseDocument(serializeDocument(result.document))).toEqual(result.document)
    expect(result.document.features.at(-1)).toEqual(input.feature)
    expect(input.document.features).toHaveLength(inputs.length)
    expect(applyBodyCommand(plan, input, { features: plan.previewFeatures, healthy: true }).accepted).toBe(false)
  })

  it.each(types)('resolves historical %s selections separately from stale current selections', type => {
    const committed = document(modification), historical = pattern(type, 'historical')
    historical.baseFeatureId = modification.id
    const input = state(historical, committed, [modifiedA, b])
    expect(prepareBodyCommand(input).accepted).toBe(true)
    const current = { ...historical, source: { mode: 'bodies' as const, scope: 'current' as const, bodies: [a, b] } }
    expect(prepareBodyCommand(state(current, committed, [modifiedA, b])).accepted).toBe(false)
    expect(prepareBodyCommand({ ...input, selection: [{ ...a, sourceFeatureId: 'foreign-state' }] }).accepted).toBe(false)
    const unavailable = validateDocument({ ...committed, features: committed.features.map(feature => feature.id === a.sourceFeatureId ? { ...feature, suppressed: true } : feature) })
    expect(prepareBodyCommand(state(historical, unavailable, [modifiedA, b])).accepted).toBe(false)
    expect(prepareBodyCommand({ ...input, catalog: { active: false, bodies: [] } }).accepted).toBe(false)
  })

  it.each(types)('allows historical %s sources consumed from the current catalog without rewriting them', type => {
    const combined: Feature = { id: 'command-combine', name: 'Consumed inputs', type: 'combine', operation: 'add',
      operands: [a, b], resultBodyId: 'command-combined-output', keepTools: false, suppressed: false }
    const current: BodyReference = { bodyId: 'command-combined-output', sourceFeatureId: combined.id }
    const feature = pattern(type, 'historical'); feature.baseFeatureId = combined.id
    const input = state(feature, document(combined), [current])
    const preparation = prepareBodyCommand(input)
    expect(preparation.accepted).toBe(true)
    expect(input.selection).toEqual([a, b])
    if (!preparation.accepted) throw new Error(preparation.message)
    // A healthy native preview is still required before this structural proposal can apply.
    expect(applyBodyCommand(preparation.plan, input, { features: preparation.plan.previewFeatures, healthy: false }).accepted).toBe(false)
  })

  it.each(types)('keeps the %s merge target distinct from seed selection and follows only its creation chain', type => {
    const base = pattern(type, 'historical')
    const feature: RepetitionFeature = { ...base, baseFeatureId: modification.id,
      bodyPattern: { mode: 'merge', target: modifiedA }, ...(type === 'mirror' ? { mergeBodies: true } : {}) }
    const selected = withBodySelection(feature, [a]) as RepetitionFeature
    expect(selected.bodyPattern).toEqual({ mode: 'merge', target: modifiedA })
    expect(selected.source).toEqual({ mode: 'bodies', scope: 'historical', bodies: [a] })
    const input = state(selected, document(modification), [modifiedA, b])
    const preparation = prepareBodyCommand(input)
    expect(preparation.accepted).toBe(true)
    if (!preparation.accepted) throw new Error(preparation.message)
    expect(bodyReferenceCreationFeatureId(preparation.plan.document.features, { bodyId: a.bodyId, sourceFeatureId: feature.id })).toBe(a.sourceFeatureId)
    expect(prepareBodyCommand(state({ ...selected, bodyPattern: { mode: 'merge', target: a } }, input.document, [modifiedA, b])).accepted).toBe(false)
  })

  it.each(types)('invalidates %s Apply when scope, order, settings, target, document or preview changes', type => {
    const input = state(pattern(type)), preparation = prepareBodyCommand(input)
    if (!preparation.accepted) throw new Error(preparation.message)
    const plan = preparation.plan, feature = input.feature as RepetitionFeature
    const changedFeatures: Feature[] = [
      { ...feature, source: { mode: 'bodies', scope: 'historical', bodies: [a, b] } },
      { ...feature, source: { mode: 'bodies', scope: 'current', bodies: [b, a] } },
      { ...feature, name: 'Changed displayed configuration' },
    ]
    for (const changed of changedFeatures) {
      expect(applyBodyCommand(plan, { ...input, feature: changed }, { features: plan.previewFeatures, healthy: true }).accepted).toBe(false)
    }
    expect(applyBodyCommand(plan, { ...input, selection: [b, a] }, { features: plan.previewFeatures, healthy: true }).accepted).toBe(false)
    expect(applyBodyCommand(plan, { ...input, document: { ...input.document, name: 'Changed committed document' } }, { features: plan.previewFeatures, healthy: true }).accepted).toBe(false)
    plan.previewFeatures.at(-1)!.name = 'Tampered preview'
    expect(applyBodyCommand(plan, input, { features: plan.previewFeatures, healthy: true }).accepted).toBe(false)
  })

  it.each(types)('accepts reconciled %s edits without allocating or losing later consumers', type => {
    const original = pattern(type), initial = document(original)
    const dependent: Feature = { id: 'command-consumer', name: 'Targeted material addition', type: 'extrude',
      sketchId: `profile-${a.bodyId}`, depth: 1, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'merge', target: { bodyId: original.bodyPattern!.mode === 'new' ? original.bodyPattern!.instances[0].bodyId : '', sourceFeatureId: original.id } } }
    const committed = validateDocument({ ...initial, features: [...initial.features, dependent] })
    const feature = reconcileBodyPatternDraft({ ...original, source: { mode: 'bodies', scope: 'current', bodies: [b, a] } }, () => { throw new Error('Reorder allocates nothing') })
    const preparation = prepareBodyCommand(state(feature, committed))
    expect(preparation.accepted).toBe(true)
    if (!preparation.accepted) throw new Error(preparation.message)
    expect(preparation.plan.document.features.at(-1)).toEqual(dependent)
    expect(preparation.plan.previewFeatures.at(-1)?.id).toBe(original.id)
    expect(preparation.plan.previewFeatures).toHaveLength(inputs.length + 1)
    expect(preparation.plan.document.features.at(-2)).toEqual(feature)
  })

  it('does not convert legacy feature or whole-body repetitions into body commands', () => {
    const raw = pattern('mirror')
    delete raw.bodyPattern
    const legacy: RepetitionFeature = { ...raw, source: { mode: 'body', sourceFeatureId: a.sourceFeatureId } }
    expect(isBodyCommandFeature(legacy)).toBe(false)
    expect(prepareBodyCommand(state(legacy)).accepted).toBe(false)
  })
})
