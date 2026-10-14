import { describe, expect, it } from 'vitest'
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { applyBodyCommand, prepareBodyCommand, type BodyCommandState } from './bodyCommands'
import { createdBodyIds, featureCurrentBodyReferences } from './bodyReferences'
import { parseDocument, serializeDocument, validateDocument, type Document } from './document'
import { withFeaturePatternMode } from './featurePatternCommands'
import { isAllFeaturePattern, type FeaturePatternOperation, type SelectedFeaturePatternOperation } from './featurePatterns'

// Original symbolic ownership records. No native geometry or healthy native
// preview is constructed; command receipts below exercise model attestation only.
const a: BodyReference = { bodyId: 'saved-mode-owner-a', sourceFeatureId: 'saved-mode-create-a' }
const b: BodyReference = { bodyId: 'saved-mode-owner-b', sourceFeatureId: 'saved-mode-create-b' }
const parent: BodyReference = { bodyId: a.bodyId, sourceFeatureId: 'saved-mode-parent' }
const child: BodyReference = { bodyId: a.bodyId, sourceFeatureId: 'saved-mode-child' }
const kinds = ['linearPattern', 'circularPattern', 'mirror'] as const
type Mode = FeaturePatternOperation['mode']
const modeCases = kinds.flatMap(kind => (['geometry', 'regenerate'] as const).map(mode => ({ kind, mode })))

function inputs(): Feature[] {
  return [
    ...[a, b].flatMap((ref, index) => [{
      id: `profile-${ref.bodyId}`, type: 'sketch', name: 'Original creation profile', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [index * 20 + 5, 3], width: 10, height: 6 },
    }, {
      id: ref.sourceFeatureId, type: 'extrude', name: 'Original created owner', suppressed: false,
      sketchId: `profile-${ref.bodyId}`, depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId },
    }] as Feature[]),
    { id: 'parent-profile', type: 'sketch', name: 'Original parent profile', suppressed: false, plane: 'XY', offset: 4,
      profile: { kind: 'rectangle', center: [5, 3], width: 2, height: 2 } },
    { id: parent.sourceFeatureId, type: 'extrude', name: 'Original historical parent', suppressed: false,
      sketchId: 'parent-profile', depth: 2, symmetric: false, bodyOperation: { mode: 'merge', target: { ...a } } },
    { id: 'child-profile', type: 'sketch', name: 'Original child profile', suppressed: false, plane: 'XY', offset: 6,
      profile: { kind: 'circle', center: [5, 3], radius: .5 } },
    { id: child.sourceFeatureId, type: 'cut', name: 'Original current child', suppressed: false,
      sketchId: 'child-profile', depth: -2, symmetric: false, bodyScope: [{ ...parent }] },
  ]
}

function pattern(kind: RepetitionFeature['type'], mode: Mode = 'geometry'): RepetitionFeature & { featurePattern?: SelectedFeaturePatternOperation } {
  const routes = { targets: [{ ...child }, { ...b }], bindings: [
    { source: { ...parent }, targetBodyIds: [a.bodyId, b.bodyId] },
    { source: { ...child }, targetBodyIds: [a.bodyId] },
  ] }
  const featurePattern: SelectedFeaturePatternOperation = mode === 'geometry' ? { mode, ...routes }
    : { mode, scope: 'selected', ...routes, referencePolicies: [], variation: { kind: 'none' } }
  const common = { id: `saved-${kind}`, name: 'Original saved method fixture', suppressed: false, baseFeatureId: child.sourceFeatureId,
    source: { mode: 'features' as const, geometryPattern: mode === 'geometry', featureIds: [parent.sourceFeatureId, child.sourceFeatureId] }, featurePattern }
  if (kind === 'linearPattern') return { ...common, type: kind, first: { direction: [1, 0, 0], spacing: 20, count: 3 },
    second: null, secondSeedOnly: false, skipped: [] }
  if (kind === 'circularPattern') return { ...common, type: kind, axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
    count: 3, angle: 360, equalSpacing: true, reversed: false, skipped: [] }
  return { ...common, type: kind, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
}

function document(feature?: RepetitionFeature): Document {
  return validateDocument({ version: 1, id: 'saved-mode-document', name: 'Original saved mode records', units: 'mm',
    createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z',
    features: [...inputs(), ...(feature ? [feature] : [])] })
}

function state(feature: RepetitionFeature): BodyCommandState {
  return { document: document(), feature, selection: featureCurrentBodyReferences(feature),
    catalog: { active: true, bodies: [child, b].map(ref => ({ ref: { ...ref } })) } }
}

describe('saved feature pattern calculation methods', () => {
  it.each(modeCases)('round trips explicit $mode for $kind with two exact states of one seed owner', ({ kind, mode }) => {
    const feature = pattern(kind, mode), before = structuredClone(feature), saved = document(feature)
    const reopened = parseDocument(serializeDocument(saved)), actual = reopened.features.at(-1) as RepetitionFeature
    expect(actual).toEqual(feature)
    expect(actual.source).toEqual({ mode: 'features', geometryPattern: mode === 'geometry', featureIds: [parent.sourceFeatureId, child.sourceFeatureId] })
    expect(actual.featurePattern!.bindings.map(binding => binding.source)).toEqual([parent, child])
    expect(actual.featurePattern!.bindings.map(binding => binding.targetBodyIds)).toEqual([[a.bodyId, b.bodyId], [a.bodyId]])
    expect(featureCurrentBodyReferences(actual)).toEqual([child, b])
    expect(createdBodyIds(actual)).toEqual([])
    expect(reopened.features.map(item => item.id)).toEqual([...inputs().map(item => item.id), feature.id])
    expect(feature).toEqual(before)
  })

  it.each(modeCases)('rejects the opposite geometryPattern flag on explicit $mode for $kind', ({ kind, mode }) => {
    const raw = document(pattern(kind, mode)), feature = raw.features.at(-1) as RepetitionFeature
    if (feature.source.mode !== 'features') throw new Error('Original feature-source fixture required')
    feature.source.geometryPattern = mode !== 'geometry'
    expect(() => parseDocument(JSON.stringify(raw))).toThrow(/featurePattern/)
    expect(() => validateDocument(raw)).toThrow(/featurePattern/)
  })

  it.each(kinds)('rejects saved false without an explicit %s declaration instead of adopting regeneration', kind => {
    const raw = document(pattern(kind, 'regenerate')), feature = raw.features.at(-1) as RepetitionFeature
    delete feature.featurePattern
    expect(() => parseDocument(JSON.stringify(raw))).toThrow(/declaración explícita/)
    expect(() => validateDocument(raw)).toThrow(/declaración explícita/)
  })

  const malformed: { name: string; mode: Mode; change: (operation: Record<string, unknown>) => void }[] = [
    { name: 'a derived instance plan in the saved declaration', mode: 'regenerate', change: operation => { operation.plan = { transforms: [] } } },
    { name: 'all scope disguised as selected targets', mode: 'regenerate', change: operation => { operation.scope = 'all' } },
    { name: 'an unimplemented external reference policy', mode: 'regenerate', change: operation => { operation.referencePolicies = [{ featureId: parent.sourceFeatureId, path: 'support', placement: 'world' }] } },
    { name: 'unimplemented sketch variation', mode: 'regenerate', change: operation => { operation.variation = { kind: 'varySketch', sketchIds: ['parent-profile'], drivingConstraintIds: ['constraint'] } } },
    { name: 'hidden extra variation data', mode: 'regenerate', change: operation => { operation.variation = { kind: 'none', amount: 2 } } },
    { name: 'regeneration fields retained on geometry mode', mode: 'geometry', change: operation => { operation.scope = 'selected' } },
  ]
  it.each(malformed)('rejects $name after establishing a valid baseline', ({ mode, change }) => {
    const raw = document(pattern('linearPattern', mode))
    expect(parseDocument(serializeDocument(raw))).toEqual(raw)
    change((raw.features.at(-1) as RepetitionFeature).featurePattern as unknown as Record<string, unknown>)
    expect(() => parseDocument(JSON.stringify(raw))).toThrow(/featurePattern/)
    expect(() => validateDocument(raw)).toThrow(/featurePattern/)
  })

  it('rejects inherited variation and decorated policy arrays before a clone can erase their raw structure', () => {
    const variation = document(pattern('mirror', 'regenerate'))
    const operation = (variation.features.at(-1) as RepetitionFeature).featurePattern as unknown as Record<string, unknown>
    operation.variation = Object.create({ kind: 'none' })
    expect(() => validateDocument(variation)).toThrow(/featurePattern/)
    const policies = document(pattern('mirror', 'regenerate'))
    const other = (policies.features.at(-1) as RepetitionFeature).featurePattern as unknown as Record<string, unknown>
    other.referencePolicies = Object.assign([], { hidden: true })
    expect(() => validateDocument(policies)).toThrow(/featurePattern/)
  })

  it.each(kinds)('toggles %s methods without changing identities, placements or historical routing', kind => {
    const original = pattern(kind), before = structuredClone(original)
    const regenerated = withFeaturePatternMode(original, 'regenerate'), copied = withFeaturePatternMode(regenerated, 'geometry')
    if (!regenerated.featurePattern || isAllFeaturePattern(regenerated.featurePattern)) throw new Error('Original selected fixture required')
    expect(copied).toEqual(original)
    expect(regenerated.id).toBe(original.id)
    expect(regenerated.featurePattern!.targets).toEqual([child, b])
    expect(regenerated.featurePattern!.bindings).toEqual(original.featurePattern!.bindings)
    expect(createdBodyIds(regenerated)).toEqual([])
    expect(parseDocument(serializeDocument(document(regenerated))).features.at(-1)).toEqual(regenerated)
    regenerated.featurePattern!.targets[0].sourceFeatureId = 'external-target-edit'
    regenerated.featurePattern!.bindings[0].source.sourceFeatureId = 'external-source-edit'
    regenerated.featurePattern!.bindings[0].targetBodyIds.push('external-route-edit')
    if (regenerated.source.mode === 'features') regenerated.source.featureIds.push('external-feature-edit')
    expect(original).toEqual(before)
    expect(copied).toEqual(before)
  })

  it.each(kinds)('requires a new %s command preview after the calculation method changes', kind => {
    const input = state(pattern(kind)), prepared = prepareBodyCommand(input)
    expect(prepared.accepted).toBe(true)
    if (!prepared.accepted) throw new Error(prepared.message)
    const changed = { ...input, feature: withFeaturePatternMode(input.feature as RepetitionFeature, 'regenerate') }
    expect(applyBodyCommand(prepared.plan, changed, { features: prepared.plan.previewFeatures, healthy: true }).accepted).toBe(false)
    const fresh = prepareBodyCommand(changed)
    expect(fresh.accepted).toBe(true)
    if (!fresh.accepted) throw new Error(fresh.message)
    expect(applyBodyCommand(fresh.plan, changed, { features: fresh.plan.previewFeatures, healthy: false }).accepted).toBe(false)
    const result = applyBodyCommand(fresh.plan, changed, { features: fresh.plan.previewFeatures, healthy: true })
    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error(result.message)
    expect(result.document.features.at(-1)).toEqual(changed.feature)
    expect(parseDocument(serializeDocument(result.document))).toEqual(result.document)
    expect(input.feature).toEqual(pattern(kind))
  })
})
