import { describe, expect, it } from 'vitest'
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { applyBodyCommand, prepareBodyCommand, withBodySelection, type BodyCommandState } from './bodyCommands'
import { bodyReferenceCreationFeatureId, createdBodyIds, featureBodyOutputIncludes, featureBodyOutputIds, featureBodyReferences, featureCurrentBodyReferences } from './bodyReferences'
import { parseDocument, serializeDocument, validateDocument, type Document } from './document'
import { featureDependencyIds } from './featureInputs'
import { withFeaturePatternBindings, withFeaturePatternMode, withFeaturePatternScope, withFeaturePatternSeeds, withFeaturePatternTargets } from './featurePatternCommands'
import { featurePatternApplications, isAllFeaturePattern, validateFeaturePatternDeclaration, type AllFeaturePatternOperation } from './featurePatterns'

// Original symbolic records. They exercise persistence and preview attestation,
// not native availability, Boolean geometry or external application fidelity.
const a = { bodyId: 'all-a', sourceFeatureId: 'create-all-a' }
const b = { bodyId: 'all-b', sourceFeatureId: 'create-all-b' }
const cut = { bodyId: a.bodyId, sourceFeatureId: 'all-source-cut' }
const kinds = ['linearPattern', 'circularPattern', 'mirror'] as const
function creation(ref: BodyReference): Feature[] {
  return [{ id: `profile-${ref.bodyId}`, type: 'sketch', name: 'Original owner profile', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [5, 5], width: 10, height: 10 } },
  { id: ref.sourceFeatureId, type: 'extrude', name: 'Original owner', suppressed: false, sketchId: `profile-${ref.bodyId}`,
    depth: 8, symmetric: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId } }]
}
function prefix(): Feature[] {
  return [...creation(a), { id: 'all-cut-profile', type: 'sketch', name: 'Original cut profile', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'circle', center: [5, 5], radius: 1 } },
  { id: cut.sourceFeatureId, type: 'cut', name: 'Exact historical cut', suppressed: false, sketchId: 'all-cut-profile',
    depth: 4, symmetric: false, bodyScope: [a] }, ...creation(b)]
}
function pattern(kind: RepetitionFeature['type'] = 'linearPattern'): RepetitionFeature & { featurePattern: AllFeaturePatternOperation } {
  const common = { id: 'all-pattern', name: 'Original ALL declaration', suppressed: false, baseFeatureId: b.sourceFeatureId,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: [cut.sourceFeatureId] },
    featurePattern: { mode: 'regenerate' as const, scope: 'all' as const, reevaluateAt: 'patternInput' as const,
      bindings: [{ source: { ...cut }, targetBodyIds: 'scope' as const }], referencePolicies: [] as [], variation: { kind: 'none' as const } } }
  return kind === 'linearPattern' ? { ...common, type: kind, first: { count: 2, direction: [1, 0, 0], spacing: 20 }, second: null, secondSeedOnly: false, skipped: [] }
    : kind === 'circularPattern' ? { ...common, type: kind, axis: { origin: [15, 0, 0], direction: [0, 0, 1] }, count: 2, angle: 180, equalSpacing: false, reversed: false, skipped: [] }
      : { ...common, type: kind, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
}
function document(features: Feature[] = prefix()): Document {
  return validateDocument({ version: 1, id: 'all-document', name: 'Original ALL scope', units: 'mm',
    createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', features })
}
function state(feature: RepetitionFeature = pattern(), committed = document(), current: BodyReference[] = [cut, b]): BodyCommandState & { feature: RepetitionFeature } {
  return { document: committed, feature, selection: [], catalog: { active: true, bodies: current.map(ref => ({ ref: { ...ref } })) } }
}

describe('saved dynamic ALL scope', () => {
  it.each(kinds)('round trips %s dynamic intent without persisting a current catalog snapshot', kind => {
    const feature = pattern(kind), original = structuredClone(feature), saved = document([...prefix(), feature])
    const reopened = parseDocument(serializeDocument(saved)), actual = reopened.features.at(-1) as RepetitionFeature
    expect(actual).toEqual(feature)
    expect(Object.hasOwn(actual.featurePattern!, 'targets')).toBe(false)
    expect(featureBodyReferences(actual)).toEqual([cut])
    expect(featureCurrentBodyReferences(actual)).toEqual([])
    expect(createdBodyIds(actual)).toEqual([])
    expect(featureDependencyIds(actual)).toContain(cut.sourceFeatureId)
    expect(featureDependencyIds(actual)).toContain(b.sourceFeatureId)
    expect(feature).toEqual(original)
  })

  it.each([
    { targets: [] }, { targets: undefined }, { reevaluateAt: 'savedSnapshot' }, { scope: 'auto' }, { extra: true },
    { bindings: [{ source: cut, targetBodyIds: [a.bodyId, b.bodyId] }] },
    { bindings: [{ source: cut, targetBodyIds: 'scope', targetSnapshot: [cut, b] }] },
  ])('rejects a static snapshot, unsupported scope or extra raw declaration %j', patch => {
    const feature = pattern(), raw = document([...prefix(), feature])
    Object.assign((raw.features.at(-1) as RepetitionFeature).featurePattern!, patch)
    expect(() => validateDocument(raw)).toThrow(/featurePattern/)
    if (!Object.hasOwn(patch, 'targets') || patch.targets !== undefined) expect(() => parseDocument(JSON.stringify(raw))).toThrow(/featurePattern/)
  })

  it('rejects inherited or sparse ALL fields and wrong calculation parity', () => {
    const feature = pattern(), operation = feature.featurePattern!
    for (const replacement of [Object.create(operation), { ...operation, bindings: new Array(1) },
      { ...operation, bindings: Object.assign([], { hidden: true }) }]) {
      expect(() => validateFeaturePatternDeclaration({ ...feature, featurePattern: replacement })).toThrow()
    }
    if (feature.source.mode !== 'features') throw new Error('Feature-source fixture required')
    feature.source.geometryPattern = true
    expect(() => validateFeaturePatternDeclaration(feature)).toThrow()
  })

  it('changes scope explicitly without inventing target states or mutating exact historical sources', () => {
    const all = pattern(), original = structuredClone(all), selected = withFeaturePatternScope(all, 'selected')
    expect(selected.featurePattern).toMatchObject({ scope: 'selected', targets: [], bindings: [{ source: cut, targetBodyIds: [] }] })
    expect(prepareBodyCommand(state(selected)).accepted).toBe(false)
    const routed = withFeaturePatternTargets(selected, [cut, b]), restored = withFeaturePatternScope(routed, 'all')
    expect(restored).toEqual(all)
    expect(withFeaturePatternMode(restored, 'regenerate')).toEqual(all)
    expect(() => withFeaturePatternMode(all, 'geometry')).toThrow(/Selecciona destinos/)
    expect(() => withFeaturePatternTargets(all, [b])).toThrow(/ALL/)
    expect(() => withBodySelection(all, [b])).toThrow(/ALL/)
    expect(withBodySelection(all, [])).toEqual(all)
    expect(all).toEqual(original)
  })

  it('prunes only explicitly removed seed bindings and never creates an inferred output binding', () => {
    const original = pattern(), before = structuredClone(original), changed = withFeaturePatternSeeds(original, [cut.sourceFeatureId, 'new-seed'])
    expect(changed.featurePattern!.bindings).toEqual(original.featurePattern!.bindings)
    expect(prepareBodyCommand(state(changed)).accepted).toBe(false)
    expect(withFeaturePatternSeeds(original, []).featurePattern!.bindings).toEqual([])
    expect(() => withFeaturePatternBindings(original, [{ source: cut, targetBodyIds: [b.bodyId] }])).toThrow(/ALL/)
    expect(withFeaturePatternBindings(original, [{ source: cut, targetBodyIds: 'scope' }])).toEqual(original)
    expect(original).toEqual(before)
  })

  it('counts the resolved catalog and preserves selected32, dynamic256 and application512 boundaries', () => {
    const feature = pattern()
    expect(featurePatternApplications(feature, 256)).toBe(256)
    const two = { ...feature, featurePattern: { ...feature.featurePattern!, bindings: [
      { source: cut, targetBodyIds: 'scope' as const }, { source: { bodyId: b.bodyId, sourceFeatureId: cut.sourceFeatureId }, targetBodyIds: 'scope' as const }] } }
    expect(featurePatternApplications(two, 256)).toBe(512)
    expect(() => featurePatternApplications(two, 257)).toThrow(/256/)
    const overflow = feature.type === 'linearPattern' ? { ...feature, first: { ...feature.first, count: 4 } } : feature
    expect(() => featurePatternApplications(overflow, 171)).toThrow(/512/)
    expect(() => featurePatternApplications(feature)).toThrow(/resolver/)
    const selected = withFeaturePatternScope(feature, 'selected'), references = Array.from({ length: 33 }, (_, index) => ({ bodyId: `selected-${index}`, sourceFeatureId: b.sourceFeatureId }))
    expect(() => validateFeaturePatternDeclaration(withFeaturePatternTargets(selected, references))).toThrow()
  })

  it('invalidates an ALL preview when a new current owner appears even though no targets are saved', () => {
    const initial = state(), prepared = prepareBodyCommand(initial)
    expect(prepared.accepted).toBe(true)
    if (!prepared.accepted) throw new Error(prepared.message)
    const d = { bodyId: 'all-new-d', sourceFeatureId: 'create-all-d' }, nextFeature = { ...pattern(), baseFeatureId: d.sourceFeatureId }
    const next = state(nextFeature, document([...prefix(), ...creation(d)]), [cut, b, d])
    expect(applyBodyCommand(prepared.plan, next, { features: prepared.plan.previewFeatures, healthy: true }).accepted).toBe(false)
    const fresh = prepareBodyCommand(next)
    expect(fresh.accepted).toBe(true)
    if (!fresh.accepted) throw new Error(fresh.message)
    expect(Object.hasOwn((fresh.plan.document.features.at(-1) as RepetitionFeature).featurePattern!, 'targets')).toBe(false)
    expect(next.feature.featurePattern).toEqual(initial.feature.featurePattern)
  })

  it('requires a fresh preview after current state drift, catalog removal or manual selection', () => {
    const initial = state(), prepared = prepareBodyCommand(initial)
    if (!prepared.accepted) throw new Error(prepared.message)
    const preview = { features: prepared.plan.previewFeatures, healthy: true }
    expect(applyBodyCommand(prepared.plan, { ...initial, catalog: { active: true, bodies: [{ ref: a }, { ref: b }] } }, preview).accepted).toBe(false)
    expect(applyBodyCommand(prepared.plan, { ...initial, catalog: { active: true, bodies: [{ ref: cut }] } }, preview).accepted).toBe(false)
    expect(prepareBodyCommand({ ...initial, selection: [b] }).accepted).toBe(false)
    expect(prepareBodyCommand({ ...initial, catalog: { active: false, bodies: [] } }).accepted).toBe(false)
    expect(prepareBodyCommand({ ...initial, catalog: { active: true, bodies: [] } }).accepted).toBe(false)
    expect(initial.feature.featurePattern && isAllFeaturePattern(initial.feature.featurePattern)).toBe(true)
  })

  it('keeps old and potential ALL poststates structurally repairable without creating a phantom current reference', () => {
    const feature = pattern(), features = [...prefix(), feature], potential = { bodyId: b.bodyId, sourceFeatureId: feature.id }
    expect(featureBodyOutputIds(feature, features)).toEqual([a.bodyId, b.bodyId])
    expect(featureBodyOutputIncludes(feature, b.bodyId, features)).toBe(true)
    expect(bodyReferenceCreationFeatureId(features, potential)).toBe(b.sourceFeatureId)
    expect(() => featureBodyOutputIds(feature)).toThrow(/historial/)
    for (const target of [b, potential]) {
      const consumer: Feature = { id: 'all-downstream', type: 'cut', name: 'Original downstream exact state', suppressed: false,
        sketchId: 'all-cut-profile', depth: 1, symmetric: false, bodyScope: [target] }
      const reopened = parseDocument(serializeDocument(document([...features, consumer])))
      expect((reopened.features.at(-1) as Extract<Feature, { type: 'cut' }>).bodyScope).toEqual([target])
    }
    expect(featureCurrentBodyReferences(feature)).toEqual([])
    expect(createdBodyIds(feature)).toEqual([])
  })
})
