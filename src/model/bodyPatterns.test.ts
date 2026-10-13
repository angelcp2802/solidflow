import { describe, expect, it } from 'vitest'
import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { bodyPatternAddresses, MAX_BODY_PATTERN_SLOTS, MAX_CREATED_BODY_IDS, reconcileBodyPatternDraft, validateBodyPatternDeclaration } from './bodyPatterns'
import { bodyReferenceCreationFeatureId, createdBodyIds, featureBodyOutputIds, featureBodyReferences, featureCurrentBodyReferences } from './bodyReferences'
import { createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'
import { featureDependencyIds } from './featureInputs'

const a: BodyReference = { bodyId: 'seed-a', sourceFeatureId: 'create-a' }
const b: BodyReference = { bodyId: 'seed-b', sourceFeatureId: 'create-b' }
const inputs: Feature[] = [a, b].flatMap(reference => [{
  id: `profile-${reference.bodyId}`, name: 'Original synthetic profile', type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 }, suppressed: false,
}, {
  id: reference.sourceFeatureId, name: 'Original synthetic body', type: 'extrude', sketchId: `profile-${reference.bodyId}`,
  depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: reference.bodyId }, suppressed: false,
}] as Feature[])
const allocator = (prefix = 'copy') => { let index = 0; return () => `${prefix}-${++index}` }
function draft(type: RepetitionFeature['type']): RepetitionFeature {
  const base = { id: `pattern-${type}`, name: 'Explicit body copies', suppressed: false, baseFeatureId: b.sourceFeatureId,
    source: { mode: 'bodies' as const, scope: 'current' as const, bodies: [{ ...a }, { ...b }] },
    bodyPattern: { mode: 'new' as const, instances: [] } }
  if (type === 'linearPattern') return { ...base, type, first: { direction: [1, 0, 0], spacing: 20, count: 3 },
    second: { direction: [0, 1, 0], spacing: 20, count: 2 }, secondSeedOnly: false, skipped: [] }
  if (type === 'circularPattern') return { ...base, type, axis: { origin: [0, 0, 0], direction: [0, 0, 1] }, count: 4,
    angle: 360, equalSpacing: true, reversed: false, skipped: [] }
  return { ...base, type, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false }
}
const feature = (type: RepetitionFeature['type']) => reconcileBodyPatternDraft(draft(type), allocator(type))
function slots(value: RepetitionFeature) {
  if (value.bodyPattern?.mode !== 'new') throw new Error('Expected new outputs')
  return value.bodyPattern.instances
}
const withFeatures = (...features: Feature[]) => validateDocument({ ...createDocument(), features: [...inputs, ...features] })
const types = ['linearPattern', 'circularPattern', 'mirror'] as const

describe('explicit repetition identity and persistence', () => {
  it.each(types)('round trips %s output slots, source order and scope without allocating identities', type => {
    const value = feature(type), document = withFeatures(value)
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    expect(document.features.at(-1)).toEqual(value)
    expect(createdBodyIds(value)).toEqual(slots(value).map(slot => slot.bodyId))
    expect(featureBodyOutputIds(value)).toEqual(createdBodyIds(value))
    expect(featureBodyReferences(value)).toEqual([a, b])
    expect(featureCurrentBodyReferences(value)).toEqual([a, b])
    expect(featureDependencyIds(value)).toEqual([a.sourceFeatureId, b.sourceFeatureId])
    const historical = { ...value, source: { mode: 'bodies' as const, scope: 'historical' as const, bodies: [b, a] } }
    const reordered = reconcileBodyPatternDraft(historical, () => { throw new Error('No new outputs expected') })
    expect(slots(reordered)).toEqual(slots(value))
    expect(featureCurrentBodyReferences(reordered)).toEqual([])
    expect(parseDocument(serializeDocument(withFeatures(reordered))).features.at(-1)).toEqual(reordered)
    const detached = featureBodyReferences(value); detached[0].bodyId = 'outside-edit'
    expect(featureBodyReferences(value)).toEqual([a, b])
  })

  it.each(['linearPattern', 'circularPattern'] as const)('reserves omitted %s slots and restores their existing IDs', type => {
    const original = feature(type)
    const omitted = original.type === 'linearPattern' ? { ...original, skipped: [[1, 0]] as [number, number][] }
      : original.type === 'circularPattern' ? { ...original, skipped: [1] } : original
    const changed = reconcileBodyPatternDraft(omitted, () => { throw new Error('Skip allocates no IDs') })
    expect(slots(changed)).toEqual(slots(original))
    const restored = reconcileBodyPatternDraft({ ...changed, skipped: [] } as RepetitionFeature, () => { throw new Error('Unskip allocates no IDs') })
    expect(slots(restored)).toEqual(slots(original))
    expect(withFeatures(changed).features.at(-1)).toEqual(changed)
  })

  it.each(['linearPattern', 'circularPattern'] as const)('retires removed %s positions and allocates fresh IDs when they return', type => {
    const original = feature(type), allocate = allocator(`replacement-${type}`)
    const smaller = original.type === 'linearPattern' ? { ...original, first: { ...original.first, count: 2 }, second: null }
      : original.type === 'circularPattern' ? { ...original, count: 2 } : original
    const reduced = reconcileBodyPatternDraft(smaller, allocate)
    expect(slots(reduced).filter(slot => !slot.retired)).toHaveLength(2)
    expect(slots(reduced).filter(slot => slot.retired).length).toBeGreaterThan(0)
    const expanded = reconcileBodyPatternDraft({ ...original, bodyPattern: reduced.bodyPattern }, allocate)
    expect(slots(expanded).slice(0, slots(original).length)).toEqual(slots(reduced))
    const retiredIds = slots(reduced).filter(slot => slot.retired).map(slot => slot.bodyId)
    expect(slots(expanded).filter(slot => !slot.retired).every(slot => !retiredIds.includes(slot.bodyId))).toBe(true)
    const initial = withFeatures(original), history = new DocumentHistory(initial)
    history.apply(updateFeature(initial, original.id, reduced))
    history.apply(updateFeature(history.current, original.id, expanded))
    expect(history.undo().features.at(-1)).toEqual(reduced)
    expect(history.undo()).toEqual(initial)
    expect(history.redo().features.at(-1)).toEqual(reduced)
    expect(history.redo().features.at(-1)).toEqual(expanded)
    expect(parseDocument(serializeDocument(history.current))).toEqual(history.current)
  })

  it.each(types)('retires removed %s seeds without reassigning outputs or using selection order', type => {
    const original = feature(type)
    const removed = reconcileBodyPatternDraft({ ...original, source: { mode: 'bodies', scope: 'current', bodies: [b] } }, allocator('unused'))
    expect(slots(removed).filter(slot => slot.seedBodyId === a.bodyId).every(slot => slot.retired)).toBe(true)
    expect(slots(removed).filter(slot => slot.seedBodyId === b.bodyId)).toEqual(slots(original).filter(slot => slot.seedBodyId === b.bodyId))
    const restored = reconcileBodyPatternDraft({ ...removed, source: { mode: 'bodies', scope: 'current', bodies: [a, b] } }, allocator('restored'))
    expect(slots(restored).slice(0, slots(original).length)).toEqual(slots(removed))
    expect(slots(restored).filter(slot => !slot.retired && slot.seedBodyId === a.bodyId).every(slot => slot.bodyId.startsWith('restored-'))).toBe(true)
    const removedDocument = updateFeature(withFeatures(original), original.id, removed)
    expect(() => updateFeature(removedDocument, original.id, restored)).not.toThrow()
  })

  it('keeps retired and omitted associations loadable for repair while output ownership excludes copied inputs', () => {
    const original = feature('linearPattern')
    if (original.type !== 'linearPattern') throw new Error('Expected linear')
    const reduced = reconcileBodyPatternDraft({ ...original, first: { ...original.first, count: 2 }, second: null }, allocator('retired'))
    const retired = slots(reduced).find(slot => slot.retired)!
    const dependent = feature('mirror')
    const reference = { bodyId: retired.bodyId, sourceFeatureId: original.id }
    const downstream = reconcileBodyPatternDraft({ ...dependent, baseFeatureId: original.id,
      source: { mode: 'bodies', scope: 'historical', bodies: [reference] }, bodyPattern: { mode: 'new', instances: [] } }, allocator('downstream'))
    const document = withFeatures(reduced, downstream)
    expect(bodyReferenceCreationFeatureId(document.features, reference)).toBe(original.id)
    expect(removeFeature(document, a.sourceFeatureId).features.some(item => item.id === downstream.id)).toBe(false)
    const merged: RepetitionFeature = { ...dependent, source: { mode: 'bodies', scope: 'historical', bodies: [a] },
      bodyPattern: { mode: 'merge', target: a }, mergeBodies: true } as RepetitionFeature
    expect(featureBodyReferences(merged)).toEqual([a, a])
    expect(featureCurrentBodyReferences(merged)).toEqual([a])
    expect(featureBodyOutputIds(merged)).toEqual([a.bodyId])
    expect(createdBodyIds(merged)).toEqual([])
    expect(bodyReferenceCreationFeatureId(withFeatures(merged).features, { bodyId: a.bodyId, sourceFeatureId: merged.id })).toBe(a.sourceFeatureId)
    expect(featureBodyOutputIds(reduced)).not.toContain(a.bodyId)
  })

  it.each(types)('rejects removing, reassigning or unretiring saved %s slots and mode changes atomically', type => {
    const original = feature(type), initial = withFeatures(original), ledger = slots(original)
    for (const instances of [ledger.slice(1), [...ledger].reverse(), [{ ...ledger[0], bodyId: 'reassigned' }, ...ledger.slice(1)],
      [{ ...ledger[0], address: type === 'mirror' ? 'other' : '255' }, ...ledger.slice(1)]]) {
      expect(() => updateFeature(initial, original.id, { bodyPattern: { mode: 'new', instances } })).toThrow()
    }
    expect(() => updateFeature(initial, original.id, { bodyPattern: { mode: 'merge', target: a }, ...(type === 'mirror' ? { mergeBodies: true } : {}) })).toThrow('modo')
    const reduced = reconcileBodyPatternDraft({ ...original, source: { mode: 'bodies', scope: 'current', bodies: [b] } }, allocator())
    const changed = updateFeature(initial, original.id, reduced)
    expect(() => updateFeature(changed, original.id, original)).toThrow()
    expect(initial.features.at(-1)).toEqual(original)
  })

  it.each(types)('rejects retiring a surviving %s position and replacing its identity in one edit', type => {
    const original = feature(type), initial = withFeatures(original), ledger = slots(original)
    const replaced = [{ ...ledger[0], retired: true }, ...ledger.slice(1), { ...ledger[0], bodyId: 'unauthorized-replacement' }]
    expect(() => updateFeature(initial, original.id, { bodyPattern: { mode: 'new', instances: replaced } })).toThrow('superviviente')
    expect(initial.features.at(-1)).toEqual(original)
  })

  it.each(types)('corrects temporary %s seed removals against its committed baseline without changing saved IDs', type => {
    const original = feature(type)
    const reduced = reconcileBodyPatternDraft({ ...original, source: { mode: 'bodies', scope: 'current', bodies: [b] } }, allocator('draft'), original)
    const restored = reconcileBodyPatternDraft({ ...reduced, source: { mode: 'bodies', scope: 'current', bodies: [a, b] } },
      () => { throw new Error('A draft correction must restore surviving saved slots') }, original)
    expect(slots(restored)).toEqual(slots(original))
    expect(() => updateFeature(withFeatures(original), original.id, restored)).not.toThrow()
    // A baseline also discards duplicate additions left by an earlier tentative
    // reconciliation; none of those additional IDs has entered saved history.
    const tentative = reconcileBodyPatternDraft({ ...reduced, source: { mode: 'bodies', scope: 'current', bodies: [a, b] } }, allocator('tentative'))
    expect(slots(tentative).length).toBeGreaterThan(slots(original).length)
    const corrected = reconcileBodyPatternDraft(tentative, () => { throw new Error('No allocation expected') }, original)
    expect(slots(corrected)).toEqual(slots(original))
    const reducedDocument = updateFeature(withFeatures(original), original.id, reduced)
    const laterEdit = reconcileBodyPatternDraft({ ...reduced, source: { mode: 'bodies', scope: 'current', bodies: [a, b] } }, allocator('after-commit'), reduced)
    expect(slots(laterEdit).slice(0, slots(reduced).length)).toEqual(slots(reduced))
    expect(slots(laterEdit).filter(slot => !slot.retired && slot.seedBodyId === a.bodyId).every(slot => slot.bodyId.startsWith('after-commit-'))).toBe(true)
    expect(() => updateFeature(reducedDocument, original.id, laterEdit)).not.toThrow()
  })

  it.each(['linearPattern', 'circularPattern'] as const)('keeps %s saved IDs when a domain shrink is corrected before Apply', type => {
    const original = feature(type)
    const smaller = original.type === 'linearPattern' ? { ...original, first: { ...original.first, count: 2 }, second: null }
      : original.type === 'circularPattern' ? { ...original, count: 2 } : original
    const reduced = reconcileBodyPatternDraft(smaller, allocator('draft'), original)
    const restored = reconcileBodyPatternDraft({ ...original, bodyPattern: reduced.bodyPattern },
      () => { throw new Error('A surviving saved position already owns its ID') }, original)
    expect(slots(restored)).toEqual(slots(original))
    expect(() => updateFeature(withFeatures(original), original.id, restored)).not.toThrow()
    const savedReduced = updateFeature(withFeatures(original), original.id, reduced)
    const laterExpansion = reconcileBodyPatternDraft({ ...original, bodyPattern: reduced.bodyPattern }, allocator('later-expansion'), reduced)
    expect(() => updateFeature(savedReduced, original.id, laterExpansion)).not.toThrow()
    expect(slots(laterExpansion).filter(slot => !slot.retired).some(slot => slot.bodyId.startsWith('later-expansion-'))).toBe(true)
  })

  it('keeps legacy repetition documents unchanged and rejects implicit adoption', () => {
    const original = draft('mirror')
    const withoutOutputs = structuredClone(original)
    delete withoutOutputs.bodyPattern
    const legacy = { ...withoutOutputs, source: { mode: 'body' as const, sourceFeatureId: a.sourceFeatureId } }
    const document = withFeatures(legacy)
    expect(parseDocument(serializeDocument(document)).features.at(-1)).toEqual(legacy)
    expect(document.features.at(-1)).not.toHaveProperty('bodyPattern')
    expect(() => updateFeature(document, legacy.id, { source: { mode: 'bodies', scope: 'current', bodies: [a] }, bodyPattern: { mode: 'merge', target: a }, mergeBodies: true })).toThrow()
  })
})

describe('explicit repetition grammar and limits', () => {
  it.each(types)('rejects malformed raw %s declarations, inherited fields and sparse ledgers', type => {
    const valid = feature(type), operation = valid.bodyPattern!, first = slots(valid)[0]
    const inherited = Object.assign(Object.create({ bodyPattern: operation }), valid)
    delete inherited.bodyPattern
    const inheritedLegacy = Object.assign(Object.create({ bodyPattern: operation }), valid, { source: { mode: 'body', sourceFeatureId: a.sourceFeatureId } })
    delete inheritedLegacy.bodyPattern
    const sparse = new Array(slots(valid).length); sparse[0] = first
    const prototypeSlots = new Array(slots(valid).length)
    Object.setPrototypeOf(prototypeSlots, Object.assign(Object.create(Array.prototype), slots(valid)))
    const prototypeBodies = new Array(2)
    Object.setPrototypeOf(prototypeBodies, Object.assign(Object.create(Array.prototype), [a, b]))
    for (const raw of [
      { ...valid, bodyPattern: undefined }, inherited, inheritedLegacy,
      { ...valid, source: { mode: 'bodies', scope: 'automatic', bodies: [a] } },
      { ...valid, source: { mode: 'bodies', scope: 'current', bodies: [a, { ...a, sourceFeatureId: b.sourceFeatureId }] } },
      { ...valid, source: { mode: 'bodies', scope: 'current', bodies: new Array(1) } },
      { ...valid, source: { mode: 'bodies', scope: 'current', bodies: prototypeBodies } },
      { ...valid, source: { mode: 'bodies', scope: 'current', bodies: [{ ...a, foreign: true }] } },
      { ...valid, source: { mode: 'bodies', scope: 'current', bodies: [a], foreign: true } },
      { ...valid, bodyPattern: { ...operation, foreign: true } },
      { ...valid, bodyPattern: { mode: 'new', instances: sparse } },
      { ...valid, bodyPattern: { mode: 'new', instances: prototypeSlots } },
      { ...valid, bodyPattern: { mode: 'new', instances: [{ ...first, retired: 'false' }] } },
      { ...valid, bodyPattern: { mode: 'new', instances: [{ ...first, foreign: true }] } },
      { ...valid, bodyPattern: { mode: 'merge', target: { ...a, foreign: true } } },
    ]) expect(() => validateBodyPatternDeclaration(raw as RepetitionFeature)).toThrow()
    expect(() => validateBodyPatternDeclaration(valid)).not.toThrow()
  })

  it.each(types)('rejects %s missing, duplicate and foreign output slots, even in suppressed features', type => {
    const valid = feature(type), ledger = slots(valid), original = ledger[0]
    for (const instances of [ledger.slice(1), [...ledger, { ...original, bodyId: 'duplicate-position' }], [...ledger, { ...original }],
      [{ ...original, seedBodyId: 'foreign-seed' }, ...ledger.slice(1)], [{ ...original, address: '01' }, ...ledger.slice(1)],
      [{ ...original, bodyId: a.bodyId }, ...ledger.slice(1)]]) {
      expect(() => withFeatures({ ...valid, suppressed: true, bodyPattern: { mode: 'new', instances } })).toThrow()
    }
    for (const sourceFeatureId of ['missing', valid.id, 'profile-seed-a', b.sourceFeatureId]) {
      expect(() => withFeatures({ ...valid, source: { mode: 'bodies', scope: 'historical', bodies: [{ ...a, sourceFeatureId }] } })).toThrow()
    }
  })

  it('reserves skipped slots, bounds active applications and never truncates the retired ledger', () => {
    const base = draft('circularPattern')
    if (base.type !== 'circularPattern') throw new Error('Expected circular')
    const bodies = Array.from({ length: 32 }, (_, index) => ({ bodyId: `seed-${index}`, sourceFeatureId: `producer-${index}` }))
    const allowed = reconcileBodyPatternDraft({ ...base, count: 18, skipped: [17], source: { mode: 'bodies', scope: 'historical', bodies } }, allocator('bounded'))
    expect(slots(allowed)).toHaveLength(17 * 32)
    expect(() => validateBodyPatternDeclaration(allowed)).not.toThrow()
    expect(() => validateBodyPatternDeclaration({ ...allowed, skipped: [] } as RepetitionFeature)).toThrow('512')
    const full = feature('mirror'), ledger = slots(full)
    const tombstones = Array.from({ length: MAX_BODY_PATTERN_SLOTS - ledger.length }, (_, index) => ({ ...ledger[0], bodyId: `retired-${index}`, retired: true }))
    const exhausted = { ...full, bodyPattern: { mode: 'new' as const, instances: [...ledger, ...tombstones] } }
    expect(() => validateBodyPatternDeclaration(exhausted)).not.toThrow()
    expect(() => reconcileBodyPatternDraft({ ...exhausted, source: { mode: 'bodies', scope: 'current', bodies: [a, b, { bodyId: 'third-seed', sourceFeatureId: 'third-producer' }] } }, allocator('overflow'))).toThrow('8192')
    expect(slots(exhausted)).toHaveLength(MAX_BODY_PATTERN_SLOTS)
    expect(bodyPatternAddresses(feature('linearPattern'))).toEqual(['1,0', '2,0', '0,1', '1,1', '2,1'])
    expect(bodyPatternAddresses(feature('circularPattern'))).toEqual(['1', '2', '3'])
    expect(bodyPatternAddresses(feature('mirror'))).toEqual(['mirror'])
    expect(() => reconcileBodyPatternDraft(draft('mirror'), () => '')).toThrow('asignador')
    expect(() => reconcileBodyPatternDraft(draft('mirror'), () => 'duplicate')).toThrow('asignador')
  })

  it('bounds created IDs across the saved document including suppressed features and retired slots', () => {
    const base = feature('mirror'), active = slots(base)
    const features = Array.from({ length: 8 }, (_, index): RepetitionFeature => {
      const length = index === 7 ? MAX_BODY_PATTERN_SLOTS - inputs.length / 2 : MAX_BODY_PATTERN_SLOTS
      const instances = Array.from({ length }, (_, position) => ({
        ...(position < active.length ? active[position] : { ...active[0], retired: true }),
        bodyId: `bounded-feature-${index}-output-${position}`,
      }))
      return { ...base, id: `bounded-feature-${index}`, suppressed: index % 2 === 1, bodyPattern: { mode: 'new', instances } }
    })
    expect(features.reduce((sum, item) => sum + createdBodyIds(item).length, 2)).toBe(MAX_CREATED_BODY_IDS)
    expect(() => withFeatures(...features)).not.toThrow()
    const last = features.at(-1)!
    if (last.bodyPattern?.mode !== 'new') throw new Error('Expected new outputs')
    const overflowing = { ...last, bodyPattern: { mode: 'new' as const,
      instances: [...last.bodyPattern.instances, { ...active[0], bodyId: 'one-ID-too-many', retired: true }] } }
    expect(() => withFeatures(...features.slice(0, -1), overflowing)).toThrow('65536')
    expect(createdBodyIds(last)).toHaveLength(MAX_BODY_PATTERN_SLOTS - 2)
  }, 60_000)
})
