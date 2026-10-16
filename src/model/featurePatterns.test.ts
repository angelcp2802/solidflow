import { describe, expect, it, vi } from 'vitest'
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { bodyReferenceCreationFeatureId, createdBodyIds, featureBodyOutputIds, featureBodyReferences, featureCurrentBodyReferences } from './bodyReferences'
import { DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument, type Document } from './document'
import { featureDependencyIds } from './featureInputs'
import { featurePatternApplications, featurePatternSourceReferences, validateFeaturePatternDeclaration, type SelectedFeaturePatternOperation } from './featurePatterns'

// Original symbolic ownership/history records. No native geometry is constructed.
const a: BodyReference = { bodyId: 'feature-owner-a', sourceFeatureId: 'feature-create-a' }
const b: BodyReference = { bodyId: 'feature-owner-b', sourceFeatureId: 'feature-create-b' }
const inputs: Feature[] = [a, b].flatMap(reference => [{
  id: `profile-${reference.bodyId}`, name: 'Original synthetic profile', type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 }, suppressed: false,
}, {
  id: reference.sourceFeatureId, name: 'Original owned body', type: 'extrude', sketchId: `profile-${reference.bodyId}`,
  depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: reference.bodyId }, suppressed: false,
}] as Feature[])
const modification: Feature = { id: 'feature-modify-a', name: 'Original owned modification', type: 'extrude',
  sketchId: `profile-${a.bodyId}`, depth: 2, symmetric: false, bodyOperation: { mode: 'merge', target: a }, suppressed: false }
const modifiedA: BodyReference = { bodyId: a.bodyId, sourceFeatureId: modification.id }
const types = ['linearPattern', 'circularPattern', 'mirror'] as const
const document = (...features: Feature[]): Document => validateDocument({ version: 1, id: 'feature-pattern-document', name: 'Original symbolic feature patterns',
  units: 'mm', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', features: [...inputs, modification, ...features] })

function pattern(type: RepetitionFeature['type']): RepetitionFeature & { featurePattern?: SelectedFeaturePatternOperation } {
  const base = { id: `owned-${type}`, name: 'Original selected feature contributions', suppressed: false, baseFeatureId: modification.id,
    source: { mode: 'features' as const, geometryPattern: true as const, featureIds: [a.sourceFeatureId, modification.id] },
    featurePattern: { mode: 'geometry' as const, targets: [{ ...modifiedA }, { ...b }], bindings: [
      { source: { ...a }, targetBodyIds: [a.bodyId] }, { source: { ...modifiedA }, targetBodyIds: [a.bodyId, b.bodyId] },
    ] } }
  if (type === 'linearPattern') return { ...base, type, first: { direction: [1, 0, 0], count: 3, spacing: 20 }, second: null, secondSeedOnly: false, skipped: [] }
  if (type === 'circularPattern') return { ...base, type, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, count: 3,
    angle: 360, equalSpacing: true, reversed: false, skipped: [] }
  return { ...base, type, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
}

describe('owned feature pattern model', () => {
  it.each(types)('round trips exact %s source states and target routing without creating IDs', type => {
    const feature = pattern(type), before = JSON.stringify(feature)
    const allocate = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => { throw new Error('No identity allocation in model validation') })
    try {
      const saved = document(feature)
      expect(parseDocument(serializeDocument(saved))).toEqual(saved)
      expect(saved.features.at(-1)).toEqual(feature)
      expect(createdBodyIds(feature)).toEqual([])
      expect(featureBodyOutputIds(feature)).toEqual([a.bodyId, b.bodyId])
      expect(featurePatternApplications(feature)).toBe(type === 'mirror' ? 3 : 6)
      expect(JSON.stringify(feature)).toBe(before)
      expect(allocate).not.toHaveBeenCalled()
    } finally { allocate.mockRestore() }
  })

  it.each(types)('separates %s ALL dependencies from exact current inputs and follows target ownership only', type => {
    const feature = pattern(type)
    expect(featurePatternSourceReferences(feature)).toEqual([a, modifiedA])
    expect(featureBodyReferences(feature)).toEqual([a, modifiedA, modifiedA, b])
    expect(featureCurrentBodyReferences(feature)).toEqual([modifiedA, b])
    expect(featureDependencyIds(feature)).toEqual([a.sourceFeatureId, modification.id, b.sourceFeatureId])
    const saved = document(feature)
    expect(bodyReferenceCreationFeatureId(saved.features, { bodyId: a.bodyId, sourceFeatureId: feature.id })).toBe(a.sourceFeatureId)
    expect(bodyReferenceCreationFeatureId(saved.features, { bodyId: b.bodyId, sourceFeatureId: feature.id })).toBe(b.sourceFeatureId)
    const detached = featurePatternSourceReferences(feature); detached[0].bodyId = 'external-edit'
    const current = featureCurrentBodyReferences(feature); current[0].sourceFeatureId = 'external-edit'
    expect(featurePatternSourceReferences(feature)).toEqual([a, modifiedA])
    expect(featureCurrentBodyReferences(feature)).toEqual([modifiedA, b])
  })

  it.each(types)('retains both old and potential %s target states for structural repair', type => {
    const feature = pattern(type)
    for (const target of [b, { bodyId: b.bodyId, sourceFeatureId: feature.id }]) {
      const later: Feature = { id: 'later-owned-merge', name: 'Exact downstream state', type: 'extrude', sketchId: `profile-${b.bodyId}`,
        depth: 1, symmetric: false, suppressed: false, bodyOperation: { mode: 'merge', target } }
      const saved = document(feature, later), reloaded = parseDocument(serializeDocument(saved))
      expect(reloaded.features.at(-1)).toEqual(later)
      expect(bodyReferenceCreationFeatureId(reloaded.features, { bodyId: b.bodyId, sourceFeatureId: later.id })).toBe(b.sourceFeatureId)
    }
    // Structural possibilities do not say that both refs are natively current.
    expect(featureBodyOutputIds(feature)).toEqual([a.bodyId, b.bodyId])
  })

  it.each(types)('keeps %s selection order and nested contributions explicit across edits and history', type => {
    const original = pattern(type)
    const nested: RepetitionFeature = { ...pattern('mirror'), id: 'nested-owned-pattern', baseFeatureId: original.id,
      source: { mode: 'features', geometryPattern: true, featureIds: [original.id] },
      featurePattern: { mode: 'geometry', targets: [{ bodyId: a.bodyId, sourceFeatureId: original.id }],
        bindings: [{ source: { bodyId: a.bodyId, sourceFeatureId: original.id }, targetBodyIds: [a.bodyId] }] } }
    const saved = document(original, nested), history = new DocumentHistory(saved)
    const reordered = { ...original, source: { mode: 'features' as const, geometryPattern: true as const, featureIds: [modification.id, a.sourceFeatureId] },
      featurePattern: { ...original.featurePattern!, bindings: [...original.featurePattern!.bindings].reverse() } }
    history.apply(updateFeature(saved, original.id, reordered))
    expect(history.current.features.find(item => item.id === original.id)).toEqual(reordered)
    expect(history.undo()).toEqual(saved)
    expect(history.redo().features.find(item => item.id === original.id)).toEqual(reordered)
    expect(parseDocument(serializeDocument(history.current))).toEqual(history.current)
    expect(removeFeature(saved, modification.id).features.some(item => item.id === nested.id)).toBe(false)
    expect(removeFeature(saved, b.sourceFeatureId).features.some(item => item.id === original.id)).toBe(false)
    const suppressed = updateFeature(saved, original.id, { suppressed: true })
    expect(suppressed.features.find(item => item.id === original.id)).toMatchObject({ suppressed: true, featurePattern: original.featurePattern })
  })

  it.each(types)('preserves legacy %s grammar and rejects unsupported semantic modes and body-output conversion', type => {
    const legacy = { ...pattern(type) }; delete legacy.featurePattern
    expect(parseDocument(serializeDocument(document(legacy))).features.at(-1)).toEqual(legacy)
    expect(featurePatternApplications(legacy)).toBe(0)
    expect(featurePatternSourceReferences(legacy)).toEqual([])
    expect(() => document({ ...legacy, source: { ...legacy.source, geometryPattern: false } } as unknown as RepetitionFeature)).toThrow()
    expect(() => document({ ...pattern(type), featurePattern: { ...pattern(type).featurePattern, mode: 'regenerate', varySketch: true } } as unknown as RepetitionFeature)).toThrow()
    const owned: RepetitionFeature = { ...pattern('mirror'), id: 'saved-body-pattern', source: { mode: 'bodies', scope: 'historical', bodies: [a] },
      bodyPattern: { mode: 'new', instances: [{ seedBodyId: a.bodyId, address: 'mirror', bodyId: 'saved-body-output', retired: false }] } }
    delete owned.featurePattern
    const saved = document(owned)
    expect(() => updateFeature(saved, owned.id, { source: pattern(type).source, bodyPattern: undefined, featurePattern: pattern(type).featurePattern })).toThrow()
    expect(createdBodyIds(saved.features.at(-1)!)).toEqual(['saved-body-output'])
  })
})

describe('owned feature pattern raw grammar and budgets', () => {
  it.each(types)('rejects malformed raw %s declarations before normalization', type => {
    const feature = pattern(type), operation = feature.featurePattern!, binding = operation.bindings[0]
    const inherited = Object.assign(Object.create({ featurePattern: operation }), feature); delete inherited.featurePattern
    const inheritedUndefined = Object.assign(Object.create({ featurePattern: undefined }), feature); delete inheritedUndefined.featurePattern
    const sparse = new Array(2); sparse[0] = binding
    const prototypeBindings = new Array(2); Object.setPrototypeOf(prototypeBindings, Object.assign(Object.create(Array.prototype), operation.bindings))
    const prototypeTargets = new Array(2); Object.setPrototypeOf(prototypeTargets, Object.assign(Object.create(Array.prototype), operation.targets))
    const extraTargets = [...operation.targets] as BodyReference[] & { foreign?: boolean }; extraTargets.foreign = true
    const invalid = [
      { ...feature, featurePattern: undefined }, inherited, inheritedUndefined,
      { ...feature, bodyPattern: undefined },
      { ...feature, source: { mode: 'body', sourceFeatureId: a.sourceFeatureId } },
      { ...feature, source: { mode: 'bodies', scope: 'historical', bodies: [a] } },
      { ...feature, source: { ...feature.source, geometryPattern: false } },
      { ...feature, source: { ...feature.source, featureIds: [a.sourceFeatureId, a.sourceFeatureId] } },
      { ...feature, source: { ...feature.source, featureIds: new Array(1) } },
      { ...feature, featurePattern: { ...operation, mode: 'regenerate' } },
      { ...feature, featurePattern: { ...operation, instances: [] } },
      { ...feature, featurePattern: { ...operation, targets: [] } },
      { ...feature, featurePattern: { ...operation, targets: [modifiedA, { ...modifiedA, sourceFeatureId: a.sourceFeatureId }] } },
      { ...feature, featurePattern: { ...operation, targets: [{ ...modifiedA, foreign: true }, b] } },
      { ...feature, featurePattern: { ...operation, targets: prototypeTargets } },
      { ...feature, featurePattern: { ...operation, targets: extraTargets } },
      { ...feature, featurePattern: { ...operation, bindings: sparse } },
      { ...feature, featurePattern: { ...operation, bindings: prototypeBindings } },
      { ...feature, featurePattern: { ...operation, bindings: [...operation.bindings, binding] } },
      { ...feature, featurePattern: { ...operation, bindings: [{ ...binding, source: { ...a, sourceFeatureId: 'not-selected' } }, operation.bindings[1]] } },
      { ...feature, featurePattern: { ...operation, bindings: [{ ...binding, source: { ...a, foreign: true } }, operation.bindings[1]] } },
      { ...feature, featurePattern: { ...operation, bindings: [{ ...binding, targetBodyIds: [a.bodyId, a.bodyId] }, operation.bindings[1]] } },
      { ...feature, featurePattern: { ...operation, bindings: [{ ...binding, targetBodyIds: ['undeclared-target'] }, operation.bindings[1]] } },
      { ...feature, featurePattern: { ...operation, bindings: [{ ...binding, targetBodyIds: new Array(1) }, operation.bindings[1]] } },
      { ...feature, featurePattern: { ...operation, bindings: [binding] } },
      { ...feature, featurePattern: { ...operation, bindings: operation.bindings.map(value => ({ ...value, targetBodyIds: [a.bodyId] })) } },
    ]
    for (const raw of invalid) {
      expect(() => validateFeaturePatternDeclaration(raw as RepetitionFeature)).toThrow()
      expect(() => document(raw as RepetitionFeature)).toThrow()
    }
    expect(() => validateFeaturePatternDeclaration(feature)).not.toThrow()
  })

  it.each(types)('checks %s reference association and history independently of shape', type => {
    const feature = pattern(type), operation = feature.featurePattern!
    for (const sourceFeatureId of ['missing', feature.id, `profile-${a.bodyId}`, b.sourceFeatureId]) {
      const raw: RepetitionFeature = { ...feature,
        source: { mode: 'features', geometryPattern: true, featureIds: [sourceFeatureId, modification.id] },
        featurePattern: { ...operation, bindings: [{ source: { ...a, sourceFeatureId }, targetBodyIds: [a.bodyId] }, operation.bindings[1]] } }
      expect(() => document(raw)).toThrow()
    }
    expect(() => document({ ...feature, featurePattern: { ...operation, targets: [{ ...modifiedA, sourceFeatureId: feature.id }, b] } })).toThrow()
    expect(() => document({ ...feature, featurePattern: { ...operation, targets: [{ bodyId: 'unowned', sourceFeatureId: modification.id }, b],
      bindings: operation.bindings.map(value => ({ ...value, targetBodyIds: ['unowned', b.bodyId] })) } })).toThrow()
  })

  it('counts routes rather than selected feature IDs at the exact 512-application boundary', () => {
    const references = Array.from({ length: 32 }, (_, index) => ({ bodyId: `budget-owner-${index}`, sourceFeatureId: `budget-create-${index}` }))
    const producers: Feature[] = references.flatMap(reference => [{ ...inputs[0], id: `profile-${reference.bodyId}` }, {
      id: reference.sourceFeatureId, name: 'Original budget body', type: 'extrude', sketchId: `profile-${reference.bodyId}`,
      depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: reference.bodyId },
    }] as Feature[])
    const cut: Feature = { id: 'budget-cut', name: 'Original multi-owner cut declaration', type: 'cut', sketchId: producers[0].id,
      depth: 1, symmetric: false, bodyScope: references, suppressed: false }
    const states = references.map(reference => ({ bodyId: reference.bodyId, sourceFeatureId: cut.id }))
    const feature: RepetitionFeature & { featurePattern?: SelectedFeaturePatternOperation } = { ...pattern('mirror'), baseFeatureId: cut.id,
      source: { mode: 'features', geometryPattern: true, featureIds: [cut.id] },
      featurePattern: { mode: 'geometry', targets: states, bindings: states.slice(0, 16).map(source => ({ source, targetBodyIds: states.map(target => target.bodyId) })) } }
    const raw = { ...document(), features: [...producers, cut, feature] }
    expect(featurePatternApplications(feature)).toBe(512)
    expect(() => validateDocument(raw)).not.toThrow()
    const overflowing = { ...feature, featurePattern: { ...feature.featurePattern!,
      bindings: [...feature.featurePattern!.bindings, { source: states[16], targetBodyIds: [states[0].bodyId] }] } }
    expect(() => validateFeaturePatternDeclaration(overflowing)).toThrow('512')
    expect(() => validateDocument({ ...raw, features: [...producers, cut, overflowing] })).toThrow('512')
    expect(() => validateFeaturePatternDeclaration({ ...feature, featurePattern: { ...feature.featurePattern!, targets: [...states, { bodyId: 'too-many-targets', sourceFeatureId: cut.id }] } })).toThrow()
  })

  it.each(['linearPattern', 'circularPattern'] as const)('counts only active %s transforms while validating canonical skips', type => {
    const feature = pattern(type)
    const operation = feature.featurePattern!
    const targets = Array.from({ length: 32 }, (_, index) => ({ bodyId: `active-target-${index}`, sourceFeatureId: b.sourceFeatureId }))
    const bindings = Array.from({ length: 8 }, (_, index) => ({ source: { bodyId: `active-source-${index}`, sourceFeatureId: a.sourceFeatureId }, targetBodyIds: targets.map(target => target.bodyId) }))
    const allowed: RepetitionFeature = { ...feature, source: { mode: 'features', geometryPattern: true, featureIds: [a.sourceFeatureId] }, featurePattern: { ...operation, targets, bindings } }
    expect(featurePatternApplications(allowed)).toBe(512)
    const expanded: RepetitionFeature = allowed.type === 'linearPattern' ? { ...allowed, first: { ...allowed.first, count: 4 } }
      : allowed.type === 'circularPattern' ? { ...allowed, count: 4 } : allowed
    expect(() => validateFeaturePatternDeclaration(expanded)).toThrow('512')
    const skipped: RepetitionFeature = expanded.type === 'linearPattern' ? { ...expanded, skipped: [[3, 0]] }
      : expanded.type === 'circularPattern' ? { ...expanded, skipped: [3] } : expanded
    expect(featurePatternApplications(skipped)).toBe(512)
    const bad: RepetitionFeature = feature.type === 'linearPattern' ? { ...feature, skipped: [[0, 0]] }
      : feature.type === 'circularPattern' ? { ...feature, skipped: [0] } : feature
    expect(() => validateFeaturePatternDeclaration(bad)).toThrow()
    const allSkipped: RepetitionFeature = feature.type === 'linearPattern' ? { ...feature, skipped: [[1, 0], [2, 0]] }
      : feature.type === 'circularPattern' ? { ...feature, skipped: [1, 2] } : feature
    expect(() => validateFeaturePatternDeclaration(allSkipped)).toThrow()
  })
})
