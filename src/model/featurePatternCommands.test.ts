import { describe, expect, it } from 'vitest'
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { applyBodyCommand, isBodyCommandFeature, prepareBodyCommand, withBodySelection, type BodyCommandState } from './bodyCommands'
import { featurePatternHistoricalFingerprint, withFeaturePatternBindings, withFeaturePatternSeeds, withFeaturePatternTargets } from './featurePatternCommands'
import { parseDocument, serializeDocument, validateDocument, type Document } from './document'
import { featureCurrentBodyReferences } from './bodyReferences'
import type { SelectedFeaturePatternOperation } from './featurePatterns'

// Original symbolic command inputs. Healthy receipts exercise attestation only,
// never native validity or reference-target fidelity.
const a: BodyReference = { bodyId: 'command-feature-a', sourceFeatureId: 'command-feature-create-a' }
const b: BodyReference = { bodyId: 'command-feature-b', sourceFeatureId: 'command-feature-create-b' }
const inputs: Feature[] = [a, b].flatMap(reference => [{
  id: `profile-${reference.bodyId}`, name: 'Original command profile', type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 }, suppressed: false,
}, {
  id: reference.sourceFeatureId, name: 'Original command owner', type: 'extrude', sketchId: `profile-${reference.bodyId}`,
  depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: reference.bodyId }, suppressed: false,
}] as Feature[])
const modification: Feature = { id: 'command-feature-modify-a', name: 'Original command modification', type: 'extrude',
  sketchId: `profile-${a.bodyId}`, depth: 2, symmetric: false, suppressed: false, bodyOperation: { mode: 'merge', target: a } }
const modifiedA: BodyReference = { bodyId: a.bodyId, sourceFeatureId: modification.id }
const document = (...features: Feature[]): Document => validateDocument({ version: 1, id: 'feature-command-document', name: 'Original commands', units: 'mm',
  createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', features: [...inputs, modification, ...features] })
const types = ['linearPattern', 'circularPattern', 'mirror'] as const

function pattern(type: RepetitionFeature['type']): RepetitionFeature & { featurePattern?: SelectedFeaturePatternOperation } {
  const base = { id: `command-owned-${type}`, name: 'Original feature replay proposal', suppressed: false, baseFeatureId: modification.id,
    source: { mode: 'features' as const, geometryPattern: true as const, featureIds: [a.sourceFeatureId, modification.id] },
    featurePattern: { mode: 'geometry' as const, targets: [{ ...modifiedA }, { ...b }], bindings: [
      { source: { ...a }, targetBodyIds: [a.bodyId] }, { source: { ...modifiedA }, targetBodyIds: [a.bodyId, b.bodyId] },
    ] } }
  if (type === 'linearPattern') return { ...base, type, first: { direction: [1, 0, 0], count: 3, spacing: 20 }, second: null, secondSeedOnly: false, skipped: [] }
  if (type === 'circularPattern') return { ...base, type, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, count: 3,
    angle: 360, equalSpacing: true, reversed: false, skipped: [] }
  return { ...base, type, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
}
function state(feature: Feature, committed = document(), current = [modifiedA, b]): BodyCommandState {
  const selection = (feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.featurePattern
    ? featureCurrentBodyReferences(feature) : feature.type === 'extrude' && feature.bodyOperation?.mode === 'merge' ? [feature.bodyOperation.target] : []
  return { document: committed, feature, selection, catalog: { active: true, bodies: current.map(ref => ({ ref })) } }
}

describe('owned feature pattern commands', () => {
  it.each(types)('prepares and applies exact %s sources separately from native current targets', type => {
    const input = state(pattern(type)), preparation = prepareBodyCommand(input)
    expect(isBodyCommandFeature(input.feature)).toBe(true)
    expect(preparation.accepted).toBe(true)
    if (!preparation.accepted) throw new Error(preparation.message)
    expect(preparation.plan.document.features.at(-1)).toEqual(input.feature)
    expect(input.document.features).toHaveLength(inputs.length + 1)
    expect(applyBodyCommand(preparation.plan, input, { features: structuredClone(preparation.plan.previewFeatures), healthy: true }).accepted).toBe(false)
    expect(applyBodyCommand(preparation.plan, input, { features: preparation.plan.previewFeatures, healthy: false }).accepted).toBe(false)
    const result = applyBodyCommand(preparation.plan, input, { features: preparation.plan.previewFeatures, healthy: true })
    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error(result.message)
    expect(parseDocument(serializeDocument(result.document))).toEqual(result.document)
    expect(applyBodyCommand(preparation.plan, input, { features: preparation.plan.previewFeatures, healthy: true }).accepted).toBe(false)
  })

  it.each(types)('does not treat two %s historical states of one body as duplicate current picks', type => {
    const feature = pattern(type)
    expect(featurePatternHistoricalFingerprint(feature, document().features)).toBe(JSON.stringify([[a.bodyId, a.sourceFeatureId], [a.bodyId, modification.id]]))
    expect(prepareBodyCommand(state(feature)).accepted).toBe(true)
    const stale = { ...feature, featurePattern: { ...feature.featurePattern!, targets: [a, b] } }
    expect(prepareBodyCommand(state(stale)).accepted).toBe(false)
    expect(prepareBodyCommand({ ...state(feature), catalog: { active: false, bodies: [] } }).accepted).toBe(false)
  })

  it.each(types)('rejects unavailable %s direct seeds and wrong structural ownership without current-ref substitution', type => {
    const feature = pattern(type), saved = document()
    const suppressed = validateDocument({ ...saved, features: saved.features.map(item => item.id === a.sourceFeatureId ? { ...item, suppressed: true } : item) })
    expect(prepareBodyCommand(state(feature, suppressed)).accepted).toBe(false)
    const wrong: RepetitionFeature = { ...feature, source: { mode: 'features', geometryPattern: true, featureIds: [b.sourceFeatureId, modification.id] },
      featurePattern: { ...feature.featurePattern!, bindings: [{ source: { bodyId: a.bodyId, sourceFeatureId: b.sourceFeatureId }, targetBodyIds: [a.bodyId] }, feature.featurePattern!.bindings[1]] } }
    expect(prepareBodyCommand(state(wrong)).accepted).toBe(false)
    const future: RepetitionFeature = { ...feature, source: { mode: 'features', geometryPattern: true, featureIds: [feature.id] },
      featurePattern: { ...feature.featurePattern!, bindings: [{ source: { bodyId: a.bodyId, sourceFeatureId: feature.id }, targetBodyIds: [a.bodyId, b.bodyId] }] } }
    expect(prepareBodyCommand(state(future)).accepted).toBe(false)
  })

  it.each(types)('keeps consumed %s seed outputs historical and current targets independently owned', type => {
    const combine: Feature = { id: 'command-feature-combine', name: 'Original consumed ownership', type: 'combine', operation: 'add', operands: [modifiedA, b],
      resultBodyId: 'command-feature-combined', keepTools: false, suppressed: false }
    const target: BodyReference = { bodyId: combine.resultBodyId, sourceFeatureId: combine.id }
    const base = pattern(type), feature: RepetitionFeature = { ...base, baseFeatureId: combine.id, featurePattern: { ...base.featurePattern!, targets: [target],
      bindings: base.featurePattern!.bindings.map(binding => ({ ...binding, targetBodyIds: [target.bodyId] })) } }
    const input = state(feature, document(combine), [target]), preparation = prepareBodyCommand(input)
    expect(preparation.accepted).toBe(true)
    expect(feature.featurePattern!.bindings.map(binding => binding.source)).toEqual([a, modifiedA])
    if (!preparation.accepted) throw new Error(preparation.message)
    expect(applyBodyCommand(preparation.plan, input, { features: preparation.plan.previewFeatures, healthy: false }).accepted).toBe(false)
  })

  it.each(types)('retains unavailable historical %s output association for native-preview repair', type => {
    const copies: RepetitionFeature = { id: 'command-earlier-body-copies', name: 'Original body-slot history', type: 'mirror', suppressed: false,
      baseFeatureId: modification.id, source: { mode: 'bodies', scope: 'historical', bodies: [a] },
      support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false, bodyPattern: { mode: 'new', instances: [
        { seedBodyId: a.bodyId, address: 'mirror', bodyId: 'command-active-copy', retired: false },
        { seedBodyId: a.bodyId, address: 'mirror', bodyId: 'command-retired-copy', retired: true },
      ] } }
    const base = pattern(type), feature: RepetitionFeature = { ...base, baseFeatureId: copies.id,
      source: { mode: 'features', geometryPattern: true, featureIds: [copies.id] },
      featurePattern: { mode: 'geometry', targets: [modifiedA], bindings: [
        { source: { bodyId: 'command-retired-copy', sourceFeatureId: copies.id }, targetBodyIds: [a.bodyId] },
      ] } }
    const input = state(feature, document(copies), [modifiedA, b, { bodyId: 'command-active-copy', sourceFeatureId: copies.id }])
    const prepared = prepareBodyCommand(input)
    expect(prepared.accepted).toBe(true)
    if (!prepared.accepted) throw new Error(prepared.message)
    expect(prepared.plan.previewFeatures.at(-1)).toEqual(feature)
    // Structural eligibility does not grant this retired slot native material.
    expect(applyBodyCommand(prepared.plan, input, { features: prepared.plan.previewFeatures, healthy: false }).accepted).toBe(false)
  })

  it.each(types)('prunes removed %s routes and defaults explicitly new targets without changing historical states', type => {
    const feature = pattern(type), before = structuredClone(feature)
    const selected = withBodySelection(feature, [b]) as RepetitionFeature
    expect(selected.featurePattern!.targets).toEqual([b])
    expect(selected.source).toEqual(feature.source)
    expect(selected.featurePattern!.bindings).toEqual(feature.featurePattern!.bindings.map(binding => ({ ...binding, targetBodyIds: binding.targetBodyIds.filter(bodyId => bodyId === b.bodyId) })))
    expect(prepareBodyCommand(state(selected)).accepted).toBe(false)
    const routed = withFeaturePatternBindings(selected, selected.featurePattern!.bindings.map(binding => ({ ...binding, targetBodyIds: [b.bodyId] })))
    expect(prepareBodyCommand(state(routed)).accepted).toBe(true)
    const detached = withFeaturePatternTargets(feature, [b]); detached.featurePattern!.bindings[0].source.bodyId = 'external-edit'
    if (detached.source.mode === 'features') detached.source.featureIds[0] = 'external-source-edit'
    expect(feature).toEqual(before)
    const onlyA = withFeaturePatternTargets(feature, [modifiedA])
    const addedB = withFeaturePatternTargets(onlyA, [modifiedA, b])
    expect(addedB.featurePattern!.bindings.map(binding => binding.targetBodyIds)).toEqual([[a.bodyId, b.bodyId], [a.bodyId, b.bodyId]])
    expect(addedB.featurePattern!.bindings.map(binding => binding.source)).toEqual([a, modifiedA])
    expect(prepareBodyCommand(state(addedB)).accepted).toBe(true)
    const empty = withFeaturePatternTargets(feature, [])
    expect(empty.featurePattern!.targets).toEqual([])
    expect(empty.featurePattern!.bindings.every(binding => binding.targetBodyIds.length === 0)).toBe(true)
    expect(prepareBodyCommand(state(empty)).accepted).toBe(false)
    const legacy = { ...feature }; delete legacy.featurePattern
    expect(withFeaturePatternTargets(legacy, [b])).toBe(legacy)
    expect(withFeaturePatternBindings(legacy, [])).toBe(legacy)
    expect(withFeaturePatternSeeds(legacy, [])).toBe(legacy)
    expect(isBodyCommandFeature(legacy)).toBe(false)
  })

  it.each(types)('prunes only removed %s seed bindings and waits for explicit new output choices', type => {
    const feature = pattern(type), before = structuredClone(feature)
    const reduced = withFeaturePatternSeeds(feature, [modification.id])
    expect(reduced.source).toEqual({ mode: 'features', geometryPattern: true, featureIds: [modification.id] })
    expect(reduced.featurePattern!.bindings).toEqual([feature.featurePattern!.bindings[1]])
    expect(reduced.featurePattern!.targets).toEqual(feature.featurePattern!.targets)
    expect(prepareBodyCommand(state(reduced)).accepted).toBe(true)
    const expanded = withFeaturePatternSeeds(reduced, [modification.id, b.sourceFeatureId])
    expect(expanded.featurePattern!.bindings).toEqual(reduced.featurePattern!.bindings)
    expect(prepareBodyCommand(state(expanded)).accepted).toBe(false)
    expect(feature).toEqual(before)
  })

  it.each(types)('invalidates the %s preview when source, routing, selection or native catalog changes', type => {
    const input = state(pattern(type)), prepared = prepareBodyCommand(input)
    expect(prepared.accepted).toBe(true)
    if (!prepared.accepted) throw new Error(prepared.message)
    const preview = { features: prepared.plan.previewFeatures, healthy: true }
    const changedBinding = structuredClone(input.feature) as RepetitionFeature
    changedBinding.featurePattern!.bindings[0].targetBodyIds = [b.bodyId]
    expect(applyBodyCommand(prepared.plan, { ...input, feature: changedBinding }, preview).accepted).toBe(false)
    expect(applyBodyCommand(prepared.plan, { ...input, selection: [...input.selection].reverse() }, preview).accepted).toBe(false)
    expect(applyBodyCommand(prepared.plan, { ...input, catalog: { active: true, bodies: [{ ref: a }, { ref: b }] } }, preview).accepted).toBe(false)
    const changedSource = validateDocument({ ...input.document, features: input.document.features.map(item => item.id === a.sourceFeatureId ? { ...item, name: 'Changed historical feature' } : item) })
    expect(applyBodyCommand(prepared.plan, { ...input, document: changedSource }, preview).accepted).toBe(false)
    // Enumeration order is presentation, rather than body identity.
    expect(applyBodyCommand(prepared.plan, { ...input, catalog: { active: true, bodies: [...input.catalog.bodies].reverse() } }, preview).accepted).toBe(true)
  })

  it.each(types)('attests only the exact available old or pattern %s state reported by the catalog', type => {
    const feature = pattern(type), saved = document(feature)
    const patternA: BodyReference = { bodyId: a.bodyId, sourceFeatureId: feature.id }
    const patternB: BodyReference = { bodyId: b.bodyId, sourceFeatureId: feature.id }
    const downstream = (target: BodyReference): Feature => ({ id: 'command-feature-downstream', name: 'Original downstream exact target', type: 'extrude',
      sketchId: `profile-${b.bodyId}`, depth: 1, symmetric: false, bodyOperation: { mode: 'merge', target }, suppressed: false })
    expect(prepareBodyCommand(state(downstream(b), saved, [patternA, b])).accepted).toBe(true)
    expect(prepareBodyCommand(state(downstream(patternB), saved, [patternA, b])).accepted).toBe(false)
    expect(prepareBodyCommand(state(downstream(patternB), saved, [patternA, patternB])).accepted).toBe(true)
    expect(prepareBodyCommand(state(downstream(b), saved, [patternA, patternB])).accepted).toBe(false)
    // The supplied catalog is symbolic here; real availability is a CAD test.
  })
})
