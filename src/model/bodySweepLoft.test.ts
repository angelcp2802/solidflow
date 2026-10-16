import { describe, expect, it } from 'vitest'
import type { BodyOperation, BodyReference, Feature, LoftFeature, SketchFeature, SweepFeature } from '../cad/kernel.types'
import { bodyReferenceCreationFeatureId, createdBodyIds, featureBodyOutputIds, featureBodyReferences } from './bodyReferences'
import { addFeature, createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument, type Document } from './document'
import { featureDependencyIds } from './featureInputs'

// Original structural fixtures only; the adjacent native suite proves geometry.
const inputs: SketchFeature[] = [0, 4].map((offset, index) => ({
  id: `curve-input-${index}`, name: 'Original circular section', type: 'sketch',
  plane: 'XY', offset, suppressed: false, profile: { kind: 'circle', radius: 2, center: [0, 0] },
}))
const a: BodyReference = { bodyId: 'curve-body-a', sourceFeatureId: 'create-a' }
const b: BodyReference = { bodyId: 'curve-body-b', sourceFeatureId: 'create-b' }
const base = (ref: BodyReference): Feature => ({ id: ref.sourceFeatureId, name: 'Original explicit source', type: 'extrude',
  sketchId: inputs[0].id, depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId } })
type Kind = 'sweep' | 'loft'
function producer(kind: Kind, operation?: BodyOperation, id = 'curve-producer'): SweepFeature | LoftFeature {
  const shared = { id, name: 'Original curve body source', suppressed: false, merge: operation?.mode === 'merge',
    ...(operation ? { bodyOperation: structuredClone(operation) } : {}) }
  return kind === 'sweep' ? { ...shared, type: 'sweep', profileSketchId: inputs[0].id, pathSketchId: inputs[1].id,
    path: [{ entityId: 'structural-path', reversed: false }], orientation: 'followPath' }
    : { ...shared, type: 'loft', ruled: true, sections: inputs.map(sketch => ({ sketchId: sketch.id, startEntityId: null, reversed: false })) }
}
function document(...features: unknown[]): Document {
  return validateDocument({ ...createDocument('Original curve body schema'), features: [...inputs, ...features] })
}

describe.each(['sweep', 'loft'] as const)('persistent %s body schema', kind => {
  it('round trips an independently owned first output without adding a target or native index', () => {
    const feature = producer(kind, { mode: 'new', bodyId: a.bodyId }), original = document(feature)
    const saved = serializeDocument(original), reopened = parseDocument(saved)
    expect(reopened).toEqual(original); expect(serializeDocument(reopened)).toBe(saved)
    expect(createdBodyIds(feature)).toEqual([a.bodyId]); expect(featureBodyOutputIds(feature)).toEqual([a.bodyId])
    expect(featureBodyReferences(feature)).toEqual([]); expect(featureDependencyIds(feature)).toEqual(inputs.map(sketch => sketch.id))
    expect(bodyReferenceCreationFeatureId(original.features, { ...a, sourceFeatureId: feature.id })).toBe(feature.id)
    const ids = createdBodyIds(feature); ids[0] = 'external-edit'
    expect(createdBodyIds(feature)).toEqual([a.bodyId])
  })

  it('tracks an exact merge target through creating and modifying states with detached references', () => {
    const feature = producer(kind, { mode: 'merge', target: a }), changed = { ...a, sourceFeatureId: feature.id }
    const original = document(base(a), base(b), feature, producer(kind, { mode: 'merge', target: changed }, 'later-merge'))
    expect(parseDocument(serializeDocument(original))).toEqual(original)
    expect(createdBodyIds(feature)).toEqual([]); expect(featureBodyOutputIds(feature)).toEqual([a.bodyId])
    expect(featureDependencyIds(feature)).toEqual([...inputs.map(sketch => sketch.id), a.sourceFeatureId])
    expect(bodyReferenceCreationFeatureId(original.features, { ...a, sourceFeatureId: 'later-merge' })).toBe(a.sourceFeatureId)
    const refs = featureBodyReferences(feature); refs[0].bodyId = b.bodyId
    expect(featureBodyReferences(feature)).toEqual([a])
    expect(removeFeature(original, a.sourceFeatureId).features.map(feature => feature.id)).toEqual([...inputs.map(sketch => sketch.id), b.sourceFeatureId])
  })

  it('preserves both legacy merge settings without inserting output metadata', () => {
    for (const merge of [true, false]) {
      const feature = { ...producer(kind), merge }, original = document(feature)
      expect(parseDocument(serializeDocument(original)).features.at(-1)).toEqual(feature)
      expect(Object.hasOwn(original.features.at(-1)!, 'bodyOperation')).toBe(false)
      expect(createdBodyIds(feature)).toEqual([]); expect(featureBodyReferences(feature)).toEqual([])
      expect(featureBodyOutputIds(feature)).toEqual([])
    }
  })

  it('rejects contradictory or malformed merge flags without rewriting either saved field', () => {
    for (const operation of [{ mode: 'new', bodyId: 'fresh' }, { mode: 'merge', target: a }] as BodyOperation[]) {
      const valid = producer(kind, operation)
      for (const merge of [!valid.merge, null, undefined, 1]) {
        const input = { ...valid, merge }, before = structuredClone(input)
        expect(() => document(base(a), input)).toThrow('.merge')
        expect(input).toEqual(before)
      }
    }
  })

  it('rejects invalid output slots, transient fields and malformed operation references', () => {
    for (const bodyOperation of [null, undefined, {}, { mode: 'unknown' }, { mode: 'new' },
      { mode: 'new', bodyId: '' }, { mode: 'new', bodyId: 'bad\nbody' },
      { mode: 'new', bodyId: 'fresh', nativeIndex: 0 }, { mode: 'new', bodyId: 'fresh', target: a },
      { mode: 'merge', target: { bodyId: a.bodyId } }, { mode: 'merge', target: { ...a, nativeIndex: 0 } }]) {
      expect(() => document(base(a), { ...producer(kind), bodyOperation })).toThrow('bodyOperation')
    }
    expect(() => document(base(a), { ...producer(kind), bodyScope: [a] })).toThrow('campo desconocido')
  })

  it('reserves new IDs across producer kinds, suppression and Combine outputs', () => {
    const same = producer(kind, { mode: 'new', bodyId: a.bodyId })
    expect(() => document({ ...base(a), suppressed: true }, same)).toThrow('creado duplicado')
    const other = producer(kind === 'sweep' ? 'loft' : 'sweep', { mode: 'new', bodyId: a.bodyId }, 'other-producer')
    expect(() => document(same, { ...other, suppressed: true })).toThrow('creado duplicado')
    expect(() => document(base(a), base(b), { id: 'combine', name: 'Original union', suppressed: false, type: 'combine',
      operation: 'add', operands: [a, b], keepTools: false, resultBodyId: 'combined' },
    producer(kind, { mode: 'new', bodyId: 'combined' }))).toThrow('creado duplicado')
  })

  it('rejects forged, forward, self and legacy-only merge ownership at the target field', () => {
    for (const target of [{ ...a, bodyId: b.bodyId }, { ...a, sourceFeatureId: b.sourceFeatureId },
      { ...a, sourceFeatureId: 'absent' }, { ...a, sourceFeatureId: 'curve-producer' }]) {
      expect(() => document(base(a), base(b), producer(kind, { mode: 'merge', target }))).toThrow('bodyOperation.target')
    }
    expect(() => document(producer(kind, { mode: 'merge', target: a }), base(a))).toThrow('bodyOperation.target.sourceFeatureId')
    const legacy = producer(kind, undefined, a.sourceFeatureId)
    expect(() => document(legacy, producer(kind, { mode: 'merge', target: a }))).toThrow('bodyOperation.target.bodyId')
  })

  it('keeps output IDs immutable and preserves undo/redo when a generic mode change rejects', () => {
    const feature = producer(kind, { mode: 'new', bodyId: 'new-curve-body' }), original = document(base(a), feature)
    const history = new DocumentHistory(original), edited = updateFeature(original, feature.id, { name: 'Edited presentation' })
    history.apply(edited); expect(history.undo()).toEqual(original)
    expect(() => updateFeature(history.current, feature.id, { bodyOperation: { mode: 'new', bodyId: 'replacement' } })).toThrow('identificadores')
    expect(() => updateFeature(history.current, feature.id, { merge: true, bodyOperation: { mode: 'merge', target: a } })).toThrow('identificadores')
    expect(history.current).toEqual(original); expect(history.canRedo).toBe(true); expect(history.redo()).toEqual(edited)
    expect(parseDocument(serializeDocument(history.current))).toEqual(edited)
  })

  it('retains structurally owned stale, suppressed and consumed targets for explicit repair', () => {
    const first = producer(kind, { mode: 'merge', target: a }), stale = producer(kind, { mode: 'merge', target: a }, 'stale')
    const sources: Document[] = [document(base(a), first, stale), document({ ...base(a), suppressed: true }, first),
      document(base(a), base(b), { id: 'combine', name: 'Original consume', type: 'combine', operation: 'add',
        operands: [a, b], resultBodyId: 'combined', keepTools: false, suppressed: false }, first)]
    for (const original of sources) {
      expect(parseDocument(serializeDocument(original))).toEqual(original)
      expect(featureBodyReferences(original.features.at(-1)!)).toEqual([a])
    }
    const original = document(base(a), base(b), first)
    const downstream = producer(kind, { mode: 'merge', target: { ...a, sourceFeatureId: first.id } }, 'downstream')
    const withDownstream = addFeature(original, downstream), saved = serializeDocument(withDownstream)
    expect(() => updateFeature(withDownstream, first.id, { bodyOperation: { mode: 'merge', target: b } })).toThrow('bodyOperation.target.bodyId')
    expect(serializeDocument(withDownstream)).toBe(saved)
  })
})
