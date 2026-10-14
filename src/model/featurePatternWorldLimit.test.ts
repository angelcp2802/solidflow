import { describe, expect, it } from 'vitest'
import type { Feature, RepetitionFeature } from '../cad/kernel.types'
import { applyBodyCommand, prepareBodyCommand, type BodyCommandState } from './bodyCommands'
import { parseDocument, serializeDocument, validateDocument } from './document'
import { withFeaturePatternMode, withFeaturePatternScope, withFeaturePatternSeeds, withFeaturePatternWorldLimit } from './featurePatternCommands'
import { validateFeaturePatternDeclaration } from './featurePatterns'
import { extractRecipeClosure, requireInitialRecipeDeclaration, type RegenerationRequest } from './featureRecipes'

// Original symbolic fixtures: no native or reference-application evidence.
const baseRef = { bodyId: 'world-owner', sourceFeatureId: 'world-base' }
const current = { bodyId: 'world-owner', sourceFeatureId: 'world-cut' }
const prefix: Feature[] = [
  { id: 'world-base-profile', name: 'Original base', type: 'sketch', suppressed: false, plane: 'XY', offset: -8,
    profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 2 } },
  { id: baseRef.sourceFeatureId, name: 'Original owner', type: 'extrude', suppressed: false, sketchId: 'world-base-profile',
    depth: 16, symmetric: false, bodyOperation: { mode: 'new', bodyId: baseRef.bodyId } },
  { id: 'world-cut-profile', name: 'Original circle', type: 'sketch', suppressed: false, plane: 'XY', offset: -6,
    profile: { kind: 'circle', center: [0, 0], radius: .5 } },
  { id: current.sourceFeatureId, name: 'Original fixed limit', type: 'cut', suppressed: false, sketchId: 'world-cut-profile',
    depth: 6, symmetric: false, bodyScope: [baseRef], endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' } } },
]
function pattern(): RepetitionFeature {
  return { id: 'world-pattern', name: 'Original world limit', type: 'linearPattern', suppressed: false,
    baseFeatureId: current.sourceFeatureId, source: { mode: 'features', geometryPattern: false, featureIds: [current.sourceFeatureId] },
    first: { direction: [.6, 0, .8], spacing: 5, count: 2 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'selected', targets: [current],
      bindings: [{ source: current, targetBodyIds: [current.bodyId] }], referencePolicies: [], variation: { kind: 'none' } } }
}
function document(features: Feature[]) {
  return validateDocument({ version: 1, id: 'original-world-limit-document', name: 'Original policy fixture', units: 'mm',
    createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', features })
}
function request(feature: RepetitionFeature): RegenerationRequest {
  const operation = feature.featurePattern
  if (!operation || operation.mode !== 'regenerate') throw new Error('Fixture must regenerate.')
  return { mode: 'regenerate', geometryPattern: false, patternId: feature.id, patternKind: feature.type,
    beforeFeatureIndex: prefix.length, sourceFeatureIds: [current.sourceFeatureId],
    plan: { transforms: [{ key: '1,0', translation: [3, 0, 4] }], structure: { originalFixture: 'policy-only' } },
    scope: operation.scope === 'all' ? { mode: 'all', reevaluateAt: 'patternInput' } : { mode: 'selected', targets: operation.targets },
    targetSnapshot: [current], bindings: operation.bindings.map(binding => ({ source: binding.source, targets: binding.targetBodyIds })),
    referencePolicies: operation.referencePolicies, variation: operation.variation }
}

describe('saved external principal-plane recipe intent', () => {
  it.each(['selected', 'all'] as const)('round-trips explicit %s policy without a derived target snapshot', scope => {
    const selected = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true)
    const feature = scope === 'all' ? withFeaturePatternScope(selected, 'all') : selected
    const saved = document([...prefix, feature]), reopened = parseDocument(serializeDocument(saved))
    expect(reopened).toEqual(saved)
    expect(requireInitialRecipeDeclaration(extractRecipeClosure(reopened.features, request(feature))).eligibility).toBe('initial-declaration-subset')
    if (scope === 'all') expect(Object.hasOwn(feature.featurePattern!, 'targets')).toBe(false)
  })

  it('keeps absent intent absent and rejects extraction instead of choosing a world default', () => {
    const feature = pattern()
    expect(() => validateFeaturePatternDeclaration(feature)).not.toThrow()
    expect(() => extractRecipeClosure(prefix, request(feature))).toThrow(/saved remap policy/)
    expect(feature.featurePattern).toHaveProperty('referencePolicies', [])
  })

  it.each([
    { kind: 'unsupported path', policies: [{ featureId: current.sourceFeatureId, path: 'support', placement: 'world' }] },
    { kind: 'unsupported placement', policies: [{ featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'transform' }] },
    { kind: 'unselected source', policies: [{ featureId: 'not-a-selected-seed', path: 'endCondition.target', placement: 'world' }] },
    { kind: 'unknown field', policies: [{ featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world', owner: baseRef }] },
    { kind: 'duplicate source', policies: Array.from({ length: 2 }, () => ({ featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world' })) },
  ])('rejects $kind raw policies', ({ policies }) => {
    const feature = pattern()
    Object.assign(feature.featurePattern!, { referencePolicies: policies })
    expect(() => validateFeaturePatternDeclaration(feature)).toThrow()
  })

  it.each(['record', 'array', 'table'] as const)('rejects a %s policy accessor before evaluating it', kind => {
    let reads = 0
    const policy = { featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world' }
    const policies = [policy]
    if (kind === 'record') Object.defineProperty(policy, 'placement', { enumerable: true, get: () => { reads++; return 'world' } })
    else if (kind === 'array') Object.defineProperty(policies, '0', { enumerable: true, get: () => { reads++; return policy } })
    const feature = pattern()
    Object.assign(feature.featurePattern!, { referencePolicies: policies })
    if (kind === 'table') Object.defineProperty(feature.featurePattern!, 'referencePolicies', {
      enumerable: true, get: () => { reads++; return policies },
    })
    expect(() => validateFeaturePatternDeclaration(feature)).toThrow()
    expect(reads).toBe(0)
  })

  it.each(['record', 'array', 'table'] as const)('rejects non-enumerable %s intent outside the saved-data contract', kind => {
    const policy = { featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world' }, policies = [policy]
    const feature = pattern()
    Object.assign(feature.featurePattern!, { referencePolicies: policies })
    if (kind === 'record') Object.defineProperty(policy, 'placement', { value: 'world', enumerable: false })
    else if (kind === 'array') Object.defineProperty(policies, '0', { value: policy, enumerable: false })
    else Object.defineProperty(feature.featurePattern!, 'referencePolicies', { value: policies, enumerable: false })
    expect(() => validateFeaturePatternDeclaration(feature)).toThrow()
  })

  it('preserves explicit intent across scope and same-method edits, without aliasing saved data', () => {
    const original = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true), before = structuredClone(original)
    const same = withFeaturePatternMode(original, 'regenerate'), all = withFeaturePatternScope(same, 'all')
    const selected = withFeaturePatternScope(all, 'selected')
    expect(selected.featurePattern).toHaveProperty('referencePolicies', [{ featureId: current.sourceFeatureId, path: 'endCondition.target', placement: 'world' }])
    if (same.featurePattern?.mode === 'regenerate') same.featurePattern.referencePolicies[0].featureId = 'external-edit'
    expect(original).toEqual(before)
    const geometry = withFeaturePatternMode(original, 'geometry')
    expect(Object.hasOwn(geometry.featurePattern!, 'referencePolicies')).toBe(false)
    expect(withFeaturePatternMode(geometry, 'regenerate').featurePattern).toHaveProperty('referencePolicies', [])
    expect(withFeaturePatternSeeds(original, []).featurePattern).toHaveProperty('referencePolicies', [])
  })

  it('includes the exact source limit in closure identity and rejects unused hidden policies', () => {
    const feature = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true)
    const closure = extractRecipeClosure(prefix, request(feature)), changed = structuredClone(prefix)
    const source = changed.at(-1)
    if (source?.type !== 'cut') throw new Error('Expected original cut.')
    source.endCondition = { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } }
    expect(extractRecipeClosure(changed, request(feature)).fingerprintInput).not.toBe(closure.fingerprintInput)
    delete source.endCondition
    expect(() => extractRecipeClosure(changed, request(feature))).toThrow(/stale hidden policies/)
  })

  it('keeps transformed principal-plane resolution pending in the internal declaration API', () => {
    const feature = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true), input = request(feature)
    input.referencePolicies[0].placement = 'transform'
    const closure = extractRecipeClosure(prefix, input)
    expect(closure.diagnostics.some(item => item.code === 'UP_TO_SURFACE_PENDING')).toBe(true)
    expect(() => requireInitialRecipeDeclaration(closure)).toThrow()
  })

  it('rejects a stale healthy command receipt after changing the saved limit choice', () => {
    const feature = withFeaturePatternWorldLimit(pattern(), current.sourceFeatureId, true)
    const input: BodyCommandState = { document: document(prefix), feature, selection: [current],
      catalog: { active: true, bodies: [{ ref: current }] } }
    const prepared = prepareBodyCommand(input)
    expect(prepared.accepted).toBe(true)
    if (!prepared.accepted) throw new Error(prepared.message)
    const edited = withFeaturePatternWorldLimit(feature, current.sourceFeatureId, false)
    expect(applyBodyCommand(prepared.plan, { ...input, feature: edited }, { features: prepared.plan.previewFeatures, healthy: true }).accepted).toBe(false)
  })
})
