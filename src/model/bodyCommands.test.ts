import { describe, expect, it } from 'vitest'
import type { BodyReference, CombineFeature, ExtrudeFeature, Feature, LoftFeature, SketchFeature, SweepFeature } from '../cad/kernel.types'
import { DocumentHistory, parseDocument, serializeDocument, validateDocument, type Document } from './document'
import { applyBodyCommand, prepareBodyCommand, setBodyOperationDraft, withBodySelection, type BodyCommandPlan, type BodyCommandState } from './bodyCommands'

// Original Cartesian command records. These pure tests do not construct BReps
// or prove geometry; healthy preview receipts are symbolic application inputs.
const a: BodyReference = { bodyId: 'body-a', sourceFeatureId: 'extrude-a' }
const b: BodyReference = { bodyId: 'body-b', sourceFeatureId: 'extrude-b' }
const sketch = (id: string, x: number): SketchFeature => ({
  id, name: id, type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [x, 3], width: 10, height: 6 },
})
const producer = (ref: BodyReference, sketchId: string): Extract<ExtrudeFeature, { type: 'extrude' }> => ({
  id: ref.sourceFeatureId, name: ref.bodyId, type: 'extrude', suppressed: false,
  sketchId, depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId },
})
const document = (): Document => validateDocument({
  version: 1, id: 'body-command-original', name: 'Original command fixture', units: 'mm',
  createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
  features: [sketch('sketch-a', 5), producer(a, 'sketch-a'), sketch('sketch-b', 10), producer(b, 'sketch-b')],
})
const combination = (operation: 'add' | 'common' = 'add'): Extract<CombineFeature, { operation: 'add' | 'common' }> => ({
  id: 'combine-command', name: 'Combine', suppressed: false, type: 'combine',
  operation, operands: [a, b], resultBodyId: 'body-result-allocated-once', keepTools: false,
})
const state = (feature: Feature = combination()): BodyCommandState => ({
  document: document(), feature, selection: [a, b], catalog: { active: true, bodies: [{ ref: a }, { ref: b }] },
})
function prepared(input: BodyCommandState): BodyCommandPlan {
  const result = prepareBodyCommand(input)
  if (!result.accepted) throw new Error(result.message)
  return result.plan
}
const receipt = (plan: BodyCommandPlan) => ({ features: plan.previewFeatures, healthy: true })

// Original radius-1/radius-2 sections at Z0/Z6 and an axial six-mm path.
// Command tests validate saved records and receipts, without constructing BReps.
const advancedSketches = (): SketchFeature[] => [
  { id: 'advanced-section-0', name: 'Section zero', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'circle', center: [0, 0], radius: 1 } },
  { id: 'advanced-section-1', name: 'Section six', type: 'sketch', suppressed: false, plane: 'XY', offset: 6,
    profile: { kind: 'circle', center: [0, 0], radius: 2 } },
  { id: 'advanced-path', name: 'Axial path', type: 'sketch', suppressed: false, plane: 'XZ', offset: 0,
    profile: { kind: 'entities', points: [{ id: 'path-end', x: 0, y: 6 }],
      entities: [{ id: 'path-line', type: 'line', start: 'origin', end: 'path-end', construction: false }], constraints: [] } },
]
function advancedFeature(kind: 'sweep' | 'loft'): SweepFeature | LoftFeature {
  const base = { id: `${kind}-command`, name: 'Original advanced output', suppressed: false,
    merge: false, bodyOperation: { mode: 'new' as const, bodyId: 'advanced-output-allocated-once' } }
  return kind === 'sweep' ? { ...base, type: kind, profileSketchId: 'advanced-section-0', pathSketchId: 'advanced-path',
    path: [{ entityId: 'path-line', reversed: false }], orientation: 'followPath' }
    : { ...base, type: kind, sections: [0, 1].map(index => ({ sketchId: `advanced-section-${index}`, startEntityId: null, reversed: false })), ruled: false }
}
function advancedState(kind: 'sweep' | 'loft'): BodyCommandState {
  const input = state(advancedFeature(kind))
  input.document.features.push(...advancedSketches())
  input.document = validateDocument(input.document)
  input.selection = []
  return input
}

describe('detached body command preparation and application', () => {
  it('keeps a new-body termination independent of merge targets and clears it when changing creation mode', () => {
    const feature = { ...producer({ bodyId: 'new-body', sourceFeatureId: 'new-feature' }, 'sketch-a'),
      endCondition: { kind: 'untilNext' as const, baseFeatureId: a.sourceFeatureId, baseBody: a } }
    const before = structuredClone(feature)
    expect(withBodySelection(feature, [b])).toEqual(feature)
    const merged = setBodyOperationDraft(feature, { mode: 'merge', target: b })
    expect(merged).toMatchObject({ bodyOperation: { mode: 'merge', target: b }, endCondition: { baseFeatureId: b.sourceFeatureId } })
    expect('endCondition' in merged && merged.endCondition).not.toHaveProperty('baseBody')
    if (merged.type !== 'extrude') throw new Error('Expected an extrude draft')
    const separate = setBodyOperationDraft(merged, { mode: 'new', bodyId: 'new-body' })
    expect(separate).toMatchObject({ bodyOperation: { mode: 'new' }, endCondition: { baseFeatureId: '' } })
    expect('endCondition' in separate && separate.endCondition).not.toHaveProperty('baseBody')
    expect(feature).toEqual(before)
  })

  it('attests the exact limit body even when two body states share one modifying feature', () => {
    const input = state()
    input.document.features.push({ id: 'cut-both', name: 'Scoped cut', type: 'cut', suppressed: false,
      sketchId: 'sketch-a', depth: 1, symmetric: false, bodyScope: [a, b] })
    input.document = validateDocument(input.document)
    const cutA = { ...a, sourceFeatureId: 'cut-both' }, cutB = { ...b, sourceFeatureId: 'cut-both' }
    input.catalog = { active: true, bodies: [{ ref: cutA }, { ref: cutB }] }
    input.selection = []
    input.feature = { ...producer({ bodyId: 'new-body', sourceFeatureId: 'new-feature' }, 'sketch-a'),
      endCondition: { kind: 'untilNext', baseFeatureId: 'cut-both', baseBody: cutA } }
    const plan = prepared(input)
    if (input.feature.type !== 'extrude') throw new Error('Expected an extrude draft')
    input.feature = { ...input.feature, endCondition: { kind: 'untilNext', baseFeatureId: 'cut-both', baseBody: cutB } }
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(false)
    expect(prepareBodyCommand(input).accepted).toBe(true)
    input.catalog = { active: true, bodies: [{ ref: cutA }] }
    expect(prepareBodyCommand(input).accepted).toBe(false)
    input.feature = { ...input.feature, endCondition: { kind: 'untilNext', baseFeatureId: 'cut-both' } }
    expect(prepareBodyCommand(input).accepted).toBe(false)
  })

  it('uses the first explicitly selected body state for scoped hole and geometric cut termination', () => {
    const hole: Feature = { id: 'hole', name: 'Hole', type: 'hole', suppressed: false, baseFeatureId: b.sourceFeatureId,
      support: { kind: 'principal', plane: 'XY' }, positions: [{ id: 'position', x: 5, y: 3 }], reversed: false,
      diameter: 2, endCondition: { kind: 'throughAll' }, head: { kind: 'simple' }, bodyScope: [b] }
    expect(withBodySelection(hole, [a, b])).toMatchObject({ baseFeatureId: a.sourceFeatureId, bodyScope: [a, b] })
    const cut: Feature = { id: 'cut', name: 'Cut', type: 'cut', suppressed: false, sketchId: 'sketch-a', depth: 4, symmetric: false,
      endCondition: { kind: 'throughAll', baseFeatureId: b.sourceFeatureId, bothDirections: false }, bodyScope: [b] }
    expect(withBodySelection(cut, [a, b])).toMatchObject({ bodyScope: [a, b], endCondition: { baseFeatureId: a.sourceFeatureId } })
    const merged = { ...producer(a, 'sketch-a'), bodyOperation: { mode: 'merge' as const, target: b }, endCondition: { kind: 'untilNext' as const, baseFeatureId: b.sourceFeatureId } }
    expect(withBodySelection(merged, [a])).toMatchObject({ bodyOperation: { target: a }, endCondition: { baseFeatureId: a.sourceFeatureId } })
  })
  it.each(['add', 'common'] as const)('preserves one allocated result ID and ordered operands for %s', operation => {
    const input = state({ ...combination(operation), keepTools: true }), before = structuredClone(input)
    const plan = prepared(input)
    expect(plan.document.features.at(-1)).toEqual(input.feature)
    expect(plan.previewFeatures.at(-1)).toEqual(input.feature)
    expect(plan.document.features.at(-1)).not.toBe(input.feature)
    expect(plan.previewFeatures).not.toBe(plan.document.features)
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(true)
    expect(input).toEqual(before)
  })

  it('keeps subtraction target distinct from its ordered tools without allocating a new output', () => {
    const input = state({ id: 'subtract-command', name: 'Subtract', type: 'combine', suppressed: false,
      operation: 'subtract', target: b, tools: [a], keepTools: true })
    input.selection = [b, a]
    const result = applyBodyCommand(prepared(input), input, { features: null, healthy: true })
    expect(result.accepted).toBe(false)
    const plan = prepared(input)
    const applied = applyBodyCommand(plan, input, receipt(plan))
    expect(applied.accepted && applied.document.features.at(-1)).toEqual(input.feature)
    expect(input.feature).not.toHaveProperty('resultBodyId')
  })

  it('allows the first explicit body in an empty piece without adopting legacy solids', () => {
    const input = state(producer(a, 'sketch-a'))
    input.document.features = [sketch('sketch-a', 5)]
    input.catalog = { active: false, bodies: [] }
    input.selection = []
    const plan = prepared(input)
    expect(plan.document.features.at(-1)).toEqual(input.feature)
    const legacy = { ...producer(b, 'sketch-a') }; delete legacy.bodyOperation
    input.document.features.push(legacy)
    expect(prepareBodyCommand(input).accepted).toBe(false)
    legacy.suppressed = true
    expect(prepareBodyCommand(input).accepted).toBe(false)
  })

  it('does not migrate a legacy feature into explicit body mode', () => {
    const legacy = { ...producer(a, 'sketch-a') }; delete legacy.bodyOperation
    const input = state(legacy)
    expect(prepareBodyCommand(input)).toMatchObject({ accepted: false })
    expect(input.feature).not.toHaveProperty('bodyOperation')
  })

  it.each(['name', 'later-feature'] as const)('rejects a complete-source change: %s', change => {
    const input = state(), plan = prepared(input)
    if (change === 'name') input.document.name = 'Renamed while previewing'
    else input.document.features.push(sketch('later-sketch', 30))
    const before = structuredClone(input)
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(false)
    expect(input).toEqual(before)
  })

  it('rejects changed settings and ordered selection independently', () => {
    const input = state(), settingsPlan = prepared(input)
    input.feature = { ...combination(), keepTools: true }
    expect(applyBodyCommand(settingsPlan, input, receipt(settingsPlan)).accepted).toBe(false)
    const selectionPlan = prepared(input)
    input.selection = [b, a]
    expect(applyBodyCommand(selectionPlan, input, receipt(selectionPlan)).accepted).toBe(false)
  })

  it('rejects a missing current body or a changed modifying state rather than rebinding by body ID', () => {
    const input = state(), missingPlan = prepared(input)
    input.catalog = { active: true, bodies: [{ ref: a }] }
    expect(applyBodyCommand(missingPlan, input, receipt(missingPlan)).accepted).toBe(false)
    input.catalog = { active: true, bodies: [{ ref: a }, { ref: { ...b, sourceFeatureId: 'missing-replacement' } }] }
    expect(prepareBodyCommand(input).accepted).toBe(false)
  })

  it('does not use catalog enumeration order as body identity', () => {
    const input = state(), plan = prepared(input)
    input.catalog = { active: true, bodies: [{ ref: b }, { ref: a }] }
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(true)
  })

  it('requires a healthy preview of the same detached feature array', () => {
    const input = state(), plan = prepared(input)
    expect(applyBodyCommand(plan, input, { features: structuredClone(plan.previewFeatures), healthy: true }).accepted).toBe(false)
    expect(applyBodyCommand(plan, input, { features: plan.previewFeatures, healthy: false }).accepted).toBe(false)
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(true)
  })

  it('rejects forged or modified proposal payloads', () => {
    const input = state(), plan = prepared(input)
    expect(applyBodyCommand({ ...plan }, input, receipt(plan)).accepted).toBe(false)
    plan.document.name = 'Changed after preview'
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(false)
    const previewPlan = prepared(input)
    previewPlan.previewFeatures.at(-1)!.name = 'Changed preview'
    expect(applyBodyCommand(previewPlan, input, receipt(previewPlan)).accepted).toBe(false)
  })

  it('applies once and supports one history entry with exact undo and redo identities', () => {
    const input = state(), history = new DocumentHistory(input.document), plan = prepared(input)
    const result = applyBodyCommand(plan, input, receipt(plan))
    if (!result.accepted) throw new Error(result.message)
    history.apply(result.document)
    expect(history.undo()).toEqual(input.document)
    expect(history.canUndo).toBe(false)
    expect(history.redo()).toEqual(result.document)
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(false)
  })

  it('preparing and cancelling a proposal does not add history or mutate the source', () => {
    const input = state(), before = structuredClone(input), history = new DocumentHistory(input.document)
    prepared(input)
    expect(history.canUndo).toBe(false)
    expect(history.current).toEqual(before.document)
    expect(input).toEqual(before)
  })

  it('rejects duplicate selection, ambiguous catalog identities and foreign operands', () => {
    const input = state()
    input.selection = [a, a]
    expect(prepareBodyCommand(input).accepted).toBe(false)
    input.selection = [a, b]
    input.catalog = { active: true, bodies: [{ ref: a }, { ref: b }, { ref: b }] }
    expect(prepareBodyCommand(input).accepted).toBe(false)
    input.catalog = { active: true, bodies: [{ ref: a }, { ref: b }] }
    input.feature = { ...combination(), operands: [a, { bodyId: 'foreign-body', sourceFeatureId: b.sourceFeatureId }] }
    expect(prepareBodyCommand(input).accepted).toBe(false)
  })

  it('rolls preview back to an edited feature while preserving later records in the committed proposal', () => {
    const input = state(), existing = combination()
    input.document.features.push(existing, sketch('later-sketch', 30))
    input.document = validateDocument(input.document)
    input.feature = { ...existing, keepTools: true }
    const plan = prepared(input)
    expect(plan.previewFeatures.at(-1)?.id).toBe(existing.id)
    expect(plan.document.features.at(-1)?.id).toBe('later-sketch')
    expect(plan.document.features.find(feature => feature.id === existing.id)).toEqual(input.feature)
  })
})

describe('explicit sweep and loft body commands', () => {
  it.each(['sweep', 'loft'] as const)('synchronizes the saved merge flag and exact target for %s drafts', kind => {
    const original = advancedFeature(kind), before = structuredClone(original)
    const merged = setBodyOperationDraft(original, { mode: 'merge', target: a })
    expect(merged).toMatchObject({ merge: true, bodyOperation: { mode: 'merge', target: a } })
    expect(withBodySelection(merged, [b])).toMatchObject({ merge: true, bodyOperation: { target: b } })
    expect(withBodySelection(merged, [])).toMatchObject({ bodyOperation: { target: { bodyId: '', sourceFeatureId: '' } } })
    if (merged.type !== 'sweep' && merged.type !== 'loft') throw new Error('Expected an advanced draft')
    expect(setBodyOperationDraft(merged, { mode: 'new', bodyId: 'advanced-output-allocated-once' }))
      .toMatchObject({ merge: false, bodyOperation: { mode: 'new', bodyId: 'advanced-output-allocated-once' } })
    const inconsistent = advancedState(kind)
    inconsistent.feature = { ...original, merge: true }
    expect(prepareBodyCommand(inconsistent).accepted).toBe(false)
    expect(original).toEqual(before)
  })

  it.each(['sweep', 'loft'] as const)('rejects stale %s targets and previews without rebinding or history changes', kind => {
    const input = advancedState(kind)
    if (input.feature.type !== 'sweep' && input.feature.type !== 'loft') throw new Error('Expected an advanced draft')
    input.feature = setBodyOperationDraft(input.feature, { mode: 'merge', target: a })
    input.selection = [a]
    const plan = prepared(input), history = new DocumentHistory(input.document)
    expect(applyBodyCommand(plan, input, { features: structuredClone(plan.previewFeatures), healthy: true }).accepted).toBe(false)
    input.feature = withBodySelection(input.feature, [b]); input.selection = [b]
    expect(applyBodyCommand(plan, input, receipt(plan)).accepted).toBe(false)
    input.feature = withBodySelection(input.feature, [{ ...a, sourceFeatureId: 'unavailable-state' }])
    input.selection = []
    expect(prepareBodyCommand(input).accepted).toBe(false)
    expect(history.canUndo).toBe(false)
    expect(history.current).toEqual(input.document)
  })

  it.each(['sweep', 'loft'] as const)('preserves a single %s output ID through save, editing and one undo/redo entry', kind => {
    const input = advancedState(kind), history = new DocumentHistory(input.document), plan = prepared(input)
    const result = applyBodyCommand(plan, input, receipt(plan))
    if (!result.accepted) throw new Error(result.message)
    const reopened = parseDocument(serializeDocument(result.document))
    expect(reopened.features.at(-1)).toEqual(input.feature)
    history.apply(reopened)
    expect(history.undo()).toEqual(input.document)
    expect(history.canUndo).toBe(false)
    expect(history.redo()).toEqual(reopened)
    const saved = reopened.features.at(-1)!
    if (saved.type !== 'sweep' && saved.type !== 'loft') throw new Error('Expected an advanced saved feature')
    const edited = saved.type === 'sweep' ? { ...saved, name: 'Edited sweep' } : { ...saved, ruled: !saved.ruled }
    const editing: BodyCommandState = { ...input, document: reopened, feature: edited }
    expect(prepared(editing).previewFeatures.at(-1)).toMatchObject({ bodyOperation: { mode: 'new', bodyId: 'advanced-output-allocated-once' } })
    editing.feature = setBodyOperationDraft(edited, { mode: 'new', bodyId: 'replacement-output' })
    expect(prepareBodyCommand(editing).accepted).toBe(false)
  })

  it.each(['sweep', 'loft'] as const)('allows first explicit %s creation but does not adopt a suppressed legacy solid', kind => {
    const input = advancedState(kind)
    input.document.features = advancedSketches()
    input.catalog = { active: false, bodies: [] }
    expect(prepareBodyCommand(input).accepted).toBe(true)
    const legacy = producer(a, 'advanced-section-0'); delete legacy.bodyOperation; legacy.suppressed = true
    input.document.features.push(legacy)
    expect(prepareBodyCommand(input).accepted).toBe(false)
    const legacyFeature = advancedFeature(kind); delete legacyFeature.bodyOperation; legacyFeature.merge = false
    input.feature = legacyFeature
    expect(prepareBodyCommand(input).accepted).toBe(false)
  })

  it.each(['sweep', 'loft'] as const)('preserves the exact %s merge target through serialization, editing and history', kind => {
    const input = advancedState(kind)
    if (input.feature.type !== 'sweep' && input.feature.type !== 'loft') throw new Error('Expected an advanced draft')
    input.feature = setBodyOperationDraft(input.feature, { mode: 'merge', target: a }); input.selection = [a]
    const plan = prepared(input), result = applyBodyCommand(plan, input, receipt(plan))
    if (!result.accepted) throw new Error(result.message)
    const reopened = parseDocument(serializeDocument(result.document)), history = new DocumentHistory(input.document)
    expect(reopened.features.at(-1)).toMatchObject({ merge: true, bodyOperation: { mode: 'merge', target: a } })
    history.apply(reopened)
    expect(history.undo()).toEqual(input.document)
    expect(history.canUndo).toBe(false)
    expect(history.redo()).toEqual(reopened)
    const saved = reopened.features.at(-1)!
    expect(prepared({ ...input, document: reopened, feature: { ...saved, name: 'Edited scoped operation' } }).previewFeatures.at(-1))
      .toMatchObject({ merge: true, bodyOperation: { target: a } })
  })
})
