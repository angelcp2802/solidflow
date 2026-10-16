import { describe, expect, it } from 'vitest'
import type { BodyReference, CombineFeature, ExtrudeFeature, Feature, SketchFeature } from '../cad/kernel.types'
import { bodyReferenceCreationFeatureId, createdBodyIds, featureBodyOutputIds, featureBodyReferences } from './bodyReferences'
import { addFeature, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument, type Document } from './document'
import { featureDependencyIds } from './featureInputs'

// Original in-memory schema fixtures. No native geometry or body correspondence
// is established by these tests; persisted ownership is explicit in the inputs.
const sketch: SketchFeature = {
  id: 'profile', name: 'Original 10 by 6 profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [5, 3], width: 10, height: 6 },
}
const a: BodyReference = { bodyId: 'opaque-body-a', sourceFeatureId: 'producer-a' }
const b: BodyReference = { bodyId: 'opaque-body-b', sourceFeatureId: 'producer-b' }
const producer = (reference: BodyReference): Extract<ExtrudeFeature, { type: 'extrude' }> => ({
  id: reference.sourceFeatureId, name: 'Explicit body', type: 'extrude', suppressed: false,
  sketchId: sketch.id, depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: reference.bodyId },
})
const combine = (operation: 'add' | 'common' = 'add'): CombineFeature => ({
  id: 'combine', name: 'Original body combination', type: 'combine', suppressed: false,
  operation, operands: [a, b], resultBodyId: 'opaque-combined-body', keepTools: false,
})
const subtract = (): Extract<CombineFeature, { operation: 'subtract' }> => ({
  id: 'subtract', name: 'Ordered subtraction', type: 'combine', suppressed: false,
  operation: 'subtract', target: a, tools: [b], keepTools: false,
})
const merge = (id = 'merge', target = a): Extract<ExtrudeFeature, { type: 'extrude' }> => ({
  id, name: 'Targeted material addition', type: 'extrude', suppressed: false,
  sketchId: sketch.id, depth: 2, symmetric: false, bodyOperation: { mode: 'merge', target },
})
const scoped = (): Feature[] => [
  { id: 'cut', name: 'Scoped cut', type: 'cut', suppressed: false, sketchId: sketch.id, depth: 1, symmetric: false, bodyScope: [a, b] },
  { id: 'hole', name: 'Scoped hole', type: 'hole', suppressed: false, baseFeatureId: a.sourceFeatureId,
    support: { kind: 'principal', plane: 'XY' }, positions: [{ id: 'position', x: 5, y: 3 }],
    reversed: false, diameter: 1, head: { kind: 'simple' }, endCondition: { kind: 'throughAll' }, bodyScope: [a, b] },
  ...(['fillet', 'chamfer'] as const).map(type => ({
    id: type, name: 'Scoped finish', type, suppressed: false, baseFeatureId: a.sourceFeatureId,
    size: 0.25, selection: { mode: 'all' as const }, bodyScope: a,
  })),
  { id: 'shell', name: 'Scoped shell', type: 'shell', suppressed: false, baseFeatureId: a.sourceFeatureId,
    thickness: 0.5, direction: 'inward', removedFaces: [], bodyScope: a },
  { id: 'draft', name: 'Scoped draft', type: 'draft', suppressed: false, baseFeatureId: a.sourceFeatureId,
    angle: 5, reversed: false, support: { kind: 'principal', plane: 'XY' }, propagation: 'tangent',
    faces: [{ sourceFeatureId: a.sourceFeatureId, key: 'face-v1|original-schema-only-face' }], bodyScope: a },
]
function input(features: unknown[]) {
  return { version: 1, id: 'original-body-document', name: 'Original body schema', units: 'mm', features,
    createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' }
}
const documentWith = (...extra: unknown[]): Document => validateDocument(input([sketch, producer(a), producer(b), ...extra]))

describe('explicit body references in version-1 documents', () => {
  it('round trips new/merge creation, ordered Combine variants and every scoped operation without migration', () => {
    const original = documentWith(merge(),
      { id: 'revolve', name: 'New revolved body', type: 'revolve', suppressed: false, sketchId: sketch.id, angle: 360,
        bodyOperation: { mode: 'new', bodyId: 'opaque-revolved-body' } },
      ...scoped(), combine(), { ...combine('common'), id: 'common', resultBodyId: 'opaque-common-body', keepTools: true }, subtract())
    const saved = serializeDocument(original), reopened = parseDocument(saved)
    expect(reopened).toEqual(original)
    expect(serializeDocument(reopened)).toBe(saved)
    expect(reopened.version).toBe(1)
    expect(reopened.features.find(feature => feature.id === 'combine')).toEqual(combine())
    expect(reopened.features.find(feature => feature.id === 'common')).toMatchObject({ operands: [a, b], keepTools: true })
  })

  it('leaves legacy aggregate features untouched and does not invent IDs on loading or saving', () => {
    const legacy = { ...producer(a) }; delete legacy.bodyOperation
    const features: Feature[] = [sketch, { ...sketch, id: 'second-profile', offset: 2 }, legacy,
      { id: 'sweep', name: 'Legacy separate sweep', type: 'sweep', suppressed: false,
        profileSketchId: sketch.id, pathSketchId: sketch.id, path: [{ entityId: 'legacy-path', reversed: false }], orientation: 'followPath', merge: false },
      { id: 'loft', name: 'Legacy separate loft', type: 'loft', suppressed: false, ruled: false, merge: false,
        sections: [{ sketchId: sketch.id, startEntityId: null, reversed: false }, { sketchId: 'second-profile', startEntityId: null, reversed: false }] },
      { id: 'pattern', name: 'Legacy body pattern', type: 'linearPattern', suppressed: false, baseFeatureId: legacy.id,
        source: { mode: 'body', sourceFeatureId: legacy.id }, first: { direction: [1, 0, 0], spacing: 20, count: 2 },
        second: null, secondSeedOnly: false, skipped: [] }]
    const original = validateDocument(input(features))
    expect(parseDocument(serializeDocument(original))).toEqual(original)
    expect(original.features).toEqual(features)
    for (const feature of original.features) {
      expect(createdBodyIds(feature)).toEqual([])
      expect(featureBodyOutputIds(feature)).toEqual([])
    }
  })

  it('retains stale, consumed and suppressed structurally owned states for repair', () => {
    const original = documentWith(merge(), combine(), merge('stale-reference', a),
      { ...producer({ bodyId: 'suppressed-body', sourceFeatureId: 'suppressed-source' }), suppressed: true },
      merge('suppressed-reference', { bodyId: 'suppressed-body', sourceFeatureId: 'suppressed-source' }))
    expect(parseDocument(serializeDocument(original))).toEqual(original)
    expect(featureBodyReferences(original.features.find(feature => feature.id === 'stale-reference')!)).toEqual([a])
    // This is loadability for repair, not successful execution of unavailable states.
  })

  it.each(['missing', 'later', 'profile', 'producer-b', 'legacy'])('rejects a body reference with an unproved source %s', sourceFeatureId => {
    const legacy = { ...producer({ bodyId: 'legacy-body', sourceFeatureId: 'legacy' }) }; delete legacy.bodyOperation
    expect(() => documentWith(legacy, merge('invalid', { ...a, sourceFeatureId }),
      producer({ bodyId: 'later-body', sourceFeatureId: 'later' }))).toThrow()
  })

  it('rejects malformed IDs, transient fields and incomplete body references without mutating input', () => {
    const invalid: unknown[] = [null, {}, { bodyId: a.bodyId }, { sourceFeatureId: a.sourceFeatureId },
      { ...a, nativeIndex: 0 }, { ...a, createdByFeatureId: a.sourceFeatureId },
      ...['', 'x'.repeat(129), 'bad\nbody', 'bad\0body', 12].flatMap(value => [
        { ...a, bodyId: value }, { ...a, sourceFeatureId: value },
      ])]
    for (const target of invalid) {
      const source = input([sketch, producer(a), producer(b), { ...merge(), bodyOperation: { mode: 'merge', target } }])
      const before = structuredClone(source)
      expect(() => validateDocument(source)).toThrow()
      expect(source).toEqual(before)
    }
  })

  it('accepts bounded opaque IDs without trimming or replacing their values', () => {
    const reference = { bodyId: 'b'.repeat(128), sourceFeatureId: 's'.repeat(128) }
    const original = documentWith(producer(reference), merge('bounded-id-consumer', reference))
    expect(featureBodyReferences(parseDocument(serializeDocument(original)).features.at(-1)!)).toEqual([reference])
  })

  it('requires control-free body state producer/modifier IDs while retaining the legacy feature ID grammar', () => {
    for (const control of ['\n', '\0', '\x7f']) {
      const reference = { bodyId: 'controlled-owner-body', sourceFeatureId: `producer${control}a` }
      const legacy = { ...producer(reference) }; delete legacy.bodyOperation
      const original = validateDocument(input([sketch, legacy]))
      expect(parseDocument(serializeDocument(original))).toEqual(original)
      expect(original.features[1].id).toBe(reference.sourceFeatureId)
      expect(() => validateDocument(input([sketch, producer(reference)]))).toThrow('caracteres de control')
      expect(() => documentWith({ ...merge(), id: `modifier${control}a` })).toThrow('caracteres de control')
    }
  })

  it('rejects unsupported body fields and unknown or malformed creation modes', () => {
    for (const bodyOperation of [null, undefined, {}, { mode: 'new' }, { mode: 'unknown', bodyId: 'fresh' },
      { mode: 'new', bodyId: 'fresh', target: a }, { mode: 'merge', target: a, bodyId: 'fresh' }]) {
      expect(() => documentWith({ ...merge(), bodyOperation })).toThrow()
    }
    expect(() => documentWith({ ...producer(a), id: 'invalid-extrude', bodyScope: [a] })).toThrow('campo desconocido')
    expect(() => documentWith({ ...scoped()[0], bodyOperation: { mode: 'new', bodyId: 'fresh' } })).toThrow('campo desconocido')
    expect(() => documentWith({ ...sketch, id: 'invalid-sketch', bodyScope: [a] })).toThrow('campo desconocido')
  })

  it('keeps created IDs unique across all creation kinds, including suppressed features and Combine results', () => {
    const suppressed = { ...producer(a), suppressed: true }
    expect(() => validateDocument(input([sketch, suppressed, producer({ ...a, sourceFeatureId: 'duplicate-source' })]))).toThrow('creado duplicado')
    expect(() => documentWith({ id: 'revolve', name: 'Duplicate ID', type: 'revolve', suppressed: true,
      sketchId: sketch.id, angle: 360, bodyOperation: { mode: 'new', bodyId: a.bodyId } })).toThrow('creado duplicado')
    expect(() => documentWith({ ...combine(), resultBodyId: a.bodyId })).toThrow('creado duplicado')
    expect(() => documentWith(combine(), { ...combine('common'), id: 'duplicate-result' })).toThrow('creado duplicado')
  })

  it('enforces operation-specific fields, nonempty distinct operands and strict keepTools', () => {
    for (const value of [
      { ...combine(), target: a }, { ...combine(), tools: [b] }, { ...subtract(), resultBodyId: 'forbidden' },
      { ...subtract(), operands: [a, b] }, { ...combine(), operation: 'unknown' }, { ...combine(), keepTools: undefined },
      { ...combine(), keepTools: 1 }, { ...combine(), operands: [a] }, { ...subtract(), tools: [] },
      { ...combine(), operands: [a, a] }, { ...subtract(), tools: [a] }, { ...subtract(), tools: [b, b] },
      { ...combine(), operands: [a, { ...a, sourceFeatureId: 'merge' }] },
    ]) expect(() => documentWith(merge(), value)).toThrow()
  })

  it('rejects sparse scopes/operands/tools and distinguishes array scopes from single references', () => {
    const partial = [a, b]; delete partial[1]
    for (const operands of [new Array(2), partial]) expect(() => documentWith({ ...combine(), operands })).toThrow('operands[')
    for (const tools of [new Array(1), partial]) expect(() => documentWith({ ...subtract(), tools })).toThrow('tools[')
    for (const bodyScope of [new Array(1), partial, [], a, undefined]) {
      expect(() => documentWith({ ...scoped()[0], bodyScope })).toThrow('bodyScope')
    }
    expect(() => documentWith({ ...scoped()[2], bodyScope: [a] })).toThrow('bodyScope')
    expect(() => documentWith({ ...scoped()[0], bodyScope: [a, a] })).toThrow('duplicado')
  })

  it('rejects sparse feature arrays instead of hiding a missing producer or creation ID', () => {
    const partial: unknown[] = [sketch, producer(a), producer(b), combine()]
    delete partial[1]
    for (const features of [new Array(1), partial]) {
      const source = input(features), before = structuredClone(source)
      expect(() => validateDocument(source)).toThrow('Documento.features[')
      expect(source).toEqual(before)
    }
  })

  it('accepts 256 operands/scope members and 255 subtraction tools but rejects the next member', () => {
    const references = Array.from({ length: 257 }, (_, index) => ({ bodyId: `body-${index}`, sourceFeatureId: `source-${index}` }))
    const features = [sketch, ...references.map(producer)]
    const combined = { ...combine(), operands: references.slice(0, 256) }
    const subtracted = { ...subtract(), target: references[0], tools: references.slice(1, 256) }
    const cut = { ...scoped()[0], bodyScope: references.slice(0, 256) }
    expect(validateDocument(input([...features, combined, subtracted, cut])).features).toHaveLength(261)
    expect(() => validateDocument(input([...features, { ...combined, operands: references }]))).toThrow('256')
    expect(() => validateDocument(input([...features, { ...subtracted, tools: references.slice(1) }]))).toThrow('255')
    expect(() => validateDocument(input([...features, { ...cut, bodyScope: references }]))).toThrow('256')
    // Catalog capacity is enforced by the kernel, not by legacy document loading.
  })

  it('preserves operand order and IDs through parameter edits, detached history and reopening', () => {
    const original = documentWith({ ...combine(), operands: [b, a], keepTools: true }), history = new DocumentHistory(original)
    const edited = updateFeature(original, a.sourceFeatureId, { depth: 8 })
    history.apply(edited)
    expect(createdBodyIds(history.current.features[1])).toEqual([a.bodyId])
    expect(featureBodyReferences(history.current.features.at(-1)!)).toEqual([b, a])
    const restored = history.undo()
    expect(restored).toEqual(original)
    const restoredCombine = restored.features.at(-1)
    if (restoredCombine?.type !== 'combine' || restoredCombine.operation === 'subtract') throw new Error('Expected collection Combine')
    restoredCombine.operands[0].bodyId = 'outside-history-edit'
    expect(history.current).toEqual(original)
    expect(history.redo()).toEqual(edited)
    expect(parseDocument(serializeDocument(history.current))).toEqual(edited)
  })

  it('rejects an invalid body edit atomically while preserving the redo branch', () => {
    const original = documentWith(combine()), history = new DocumentHistory(original)
    history.apply(updateFeature(original, a.sourceFeatureId, { depth: 8 }))
    history.undo()
    const invalid = history.current, last = invalid.features.at(-1)
    if (last?.type !== 'combine' || last.operation === 'subtract') throw new Error('Expected collection Combine')
    last.operands[0].bodyId = 'foreign-body'
    expect(() => history.apply(invalid)).toThrow('bodyId')
    expect(history.current).toEqual(original)
    expect(history.canRedo).toBe(true)
    expect(history.redo().features[1]).toMatchObject({ depth: 8 })
  })

  it('keeps created IDs immutable in generic edits while allowing add/common and operand changes', () => {
    const original = documentWith(combine())
    expect(() => updateFeature(original, a.sourceFeatureId, { bodyOperation: { mode: 'new', bodyId: 'replacement-id' } })).toThrow('identificadores')
    expect(() => updateFeature(original, a.sourceFeatureId, { bodyOperation: { mode: 'merge', target: b } })).toThrow('identificadores')
    expect(() => updateFeature(original, 'combine', { resultBodyId: 'replacement-result' })).toThrow('identificadores')
    expect(() => updateFeature(original, 'combine', { operation: 'subtract' })).toThrow('identificadores')
    const common = updateFeature(original, 'combine', { operation: 'common', operands: [b, a], keepTools: true })
    expect(common.features.at(-1)).toMatchObject({ operation: 'common', resultBodyId: 'opaque-combined-body', operands: [b, a], keepTools: true })
    expect(original.features.at(-1)).toEqual(combine())
  })

  it('cascades deletion through modifying body states and does not alias a separately recreated ID', () => {
    const modified = { bodyId: a.bodyId, sourceFeatureId: 'merge' }
    const original = documentWith(merge(), { ...subtract(), target: modified })
    expect(featureDependencyIds(original.features.at(-1)!)).toEqual(['merge', b.sourceFeatureId])
    const removed = removeFeature(original, a.sourceFeatureId)
    expect(removed.features.map(feature => feature.id)).toEqual([sketch.id, b.sourceFeatureId])
    const replacement = { bodyId: 'fresh-recreated-body', sourceFeatureId: 'fresh-producer' }
    const recreated = addFeature(removed, producer(replacement))
    expect(() => addFeature(recreated, merge('stale-consumer', a))).toThrow('sourceFeatureId')
    expect(featureBodyReferences(addFeature(recreated, merge('fresh-consumer', replacement)).features.at(-1)!)).toEqual([replacement])
    const history = new DocumentHistory(original)
    history.apply(recreated)
    expect(history.undo()).toEqual(original)
    expect(history.redo()).toEqual(recreated)
    // The fixture supplies a new ID; allocation and native face naming are separate checks.
  })

  it('cascades through a new Combine result and its later modifying states to the input creators', () => {
    const result = { bodyId: 'opaque-combined-body', sourceFeatureId: 'combine' }
    const original = documentWith(combine(), merge('result-boss', result),
      merge('result-boss-again', { ...result, sourceFeatureId: 'result-boss' }))
    expect(bodyReferenceCreationFeatureId(original.features, { ...result, sourceFeatureId: 'result-boss-again' })).toBe('combine')
    expect(featureDependencyIds(original.features.at(-1)!)).toEqual([sketch.id, 'result-boss'])
    expect(removeFeature(original, b.sourceFeatureId).features.map(feature => feature.id)).toEqual([sketch.id, a.sourceFeatureId])
    expect(parseDocument(serializeDocument(original))).toEqual(original)
  })
})

describe('pure structural body provenance', () => {
  it('returns detached refs/IDs and distinguishes new results from modified targets', () => {
    const addition = combine(), removal = subtract()
    expect(createdBodyIds(addition)).toEqual(['opaque-combined-body'])
    expect(featureBodyOutputIds(addition)).toEqual(['opaque-combined-body'])
    expect(createdBodyIds(removal)).toEqual([])
    expect(featureBodyOutputIds(removal)).toEqual([a.bodyId])
    const refs = featureBodyReferences(removal)
    expect(refs).toEqual([a, b])
    refs[0].bodyId = 'changed-copy'; refs.reverse()
    expect(featureBodyReferences(removal)).toEqual([a, b])
    const ids = createdBodyIds(addition); ids[0] = 'changed-copy'
    expect(createdBodyIds(addition)).toEqual(['opaque-combined-body'])
  })

  it('finds the creation owner through exact modifying states without using suppression or body order', () => {
    const features: Feature[] = [sketch, producer(b), { ...producer(a), suppressed: true }, merge(),
      { ...subtract(), target: { bodyId: a.bodyId, sourceFeatureId: 'merge' } }, combine()]
    const before = structuredClone(features)
    expect(bodyReferenceCreationFeatureId(features, { bodyId: a.bodyId, sourceFeatureId: 'subtract' })).toBe(a.sourceFeatureId)
    expect(bodyReferenceCreationFeatureId(features, { bodyId: 'opaque-combined-body', sourceFeatureId: 'combine' })).toBe('combine')
    expect(bodyReferenceCreationFeatureId(features, a)).toBe(a.sourceFeatureId)
    expect(features).toEqual(before)
  })

  it('rejects forged, cyclic, forward and legacy-only provenance rather than choosing a nearby owner', () => {
    const cycle = merge('cycle', { bodyId: a.bodyId, sourceFeatureId: 'cycle' })
    const forward = merge('early', { bodyId: a.bodyId, sourceFeatureId: 'later' })
    const later = { ...producer(a), id: 'later' }
    const legacy = { ...producer(a) }; delete legacy.bodyOperation
    expect(bodyReferenceCreationFeatureId([sketch, producer(a)], { ...a, bodyId: b.bodyId })).toBeNull()
    expect(bodyReferenceCreationFeatureId([cycle], { bodyId: a.bodyId, sourceFeatureId: 'cycle' })).toBeNull()
    expect(bodyReferenceCreationFeatureId([forward, later], { bodyId: a.bodyId, sourceFeatureId: 'early' })).toBeNull()
    expect(bodyReferenceCreationFeatureId([legacy], a)).toBeNull()
    expect(bodyReferenceCreationFeatureId([producer(a), producer(a)], a)).toBeNull()
    expect(bodyReferenceCreationFeatureId([], a)).toBeNull()
  })
})

describe('persistent base body of a new geometric extrusion', () => {
  function limited(kind: 'throughAll' | 'untilNext', baseBody: BodyReference = a): Extract<ExtrudeFeature, { type: 'extrude' }> {
    return { ...producer({ bodyId: 'limited-output-body', sourceFeatureId: 'limited-output' }),
      endCondition: kind === 'throughAll'
        ? { kind, baseFeatureId: baseBody.sourceFeatureId, bothDirections: false, baseBody: { ...baseBody } }
        : { kind, baseFeatureId: baseBody.sourceFeatureId, baseBody: { ...baseBody } } }
  }

  it.each(['throughAll', 'untilNext'] as const)('round trips %s exact base ownership, dependencies and detached history', kind => {
    const original = documentWith(limited(kind)), last = original.features.at(-1)!
    expect(featureBodyReferences(last)).toEqual([a])
    expect(featureDependencyIds(last)).toEqual([sketch.id, a.sourceFeatureId])
    expect(parseDocument(serializeDocument(original))).toEqual(original)
    const copied = featureBodyReferences(last); copied[0].bodyId = 'external-edit'
    expect(featureBodyReferences(last)).toEqual([a])
    const history = new DocumentHistory(original), changed = updateFeature(original, a.sourceFeatureId, { depth: 8 })
    history.apply(changed)
    expect(history.undo()).toEqual(original); expect(history.redo()).toEqual(changed)
    expect(history.current.features.at(-1)).toEqual(last)
    expect(removeFeature(original, a.sourceFeatureId).features.map(feature => feature.id)).toEqual([sketch.id, b.sourceFeatureId])
  })

  it.each(['throughAll', 'untilNext'] as const)('requires %s a matching, complete and earlier explicit base reference', kind => {
    const missing = structuredClone(limited(kind))
    if (!missing.endCondition || missing.endCondition.kind === 'upToSurface') throw new Error('Expected automatic body limit')
    delete missing.endCondition.baseBody
    expect(() => documentWith(missing)).toThrow('endCondition.baseBody')
    expect(() => documentWith({ ...limited(kind), endCondition: { ...limited(kind).endCondition, baseBody: null } })).toThrow('endCondition.baseBody')
    expect(() => documentWith({ ...limited(kind), endCondition: { ...limited(kind).endCondition, baseBody: { ...a, sourceFeatureId: b.sourceFeatureId } } })).toThrow('debe coincidir')
    expect(() => documentWith(limited(kind, { ...a, bodyId: 'foreign-body' }))).toThrow('endCondition.baseBody.bodyId')
    expect(() => documentWith(limited(kind, { ...a, sourceFeatureId: 'absent' }))).toThrow('endCondition.baseBody.sourceFeatureId')
    const later = { bodyId: 'later-body', sourceFeatureId: 'later-producer' }
    expect(() => documentWith(limited(kind, later), producer(later))).toThrow('endCondition.baseBody.sourceFeatureId')
    expect(() => documentWith(limited(kind, { ...a, sourceFeatureId: b.sourceFeatureId }))).toThrow('endCondition.baseBody.bodyId')
  })

  it('forbids redundant baseBody fields on merge, cut, legacy and up-to-surface limits', () => {
    const source = limited('throughAll'), endCondition = source.endCondition!
    const legacy = { ...source }; delete legacy.bodyOperation
    for (const operation of [legacy, { ...merge(), endCondition }, { ...scoped()[0], endCondition }]) {
      expect(() => documentWith(operation)).toThrow('solo se admite al crear un cuerpo nuevo')
    }
    expect(() => documentWith({ ...source, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' }, baseBody: a } })).toThrow('campo desconocido')
    // Old automatic limits retain their exact field grammar and gain no body IDs.
    const oldLimit = { ...legacy, endCondition: { kind: 'untilNext', baseFeatureId: a.sourceFeatureId } }
    const reopened = parseDocument(serializeDocument(documentWith(oldLimit))).features.at(-1)!
    expect(reopened).toEqual(oldLimit); expect(featureBodyReferences(reopened)).toEqual([])
  })

  it('preserves structurally owned stale, consumed and suppressed bases for repair', () => {
    const stale = documentWith(merge(), limited('untilNext'))
    const consumed = documentWith(combine(), limited('throughAll'))
    const suppressed = validateDocument(input([sketch, { ...producer(a), suppressed: true }, producer(b), limited('untilNext')]))
    for (const original of [stale, consumed, suppressed]) {
      const reopened = parseDocument(serializeDocument(original))
      expect(reopened).toEqual(original)
      expect(featureBodyReferences(reopened.features.at(-1)!)).toEqual([a])
    }
    // These are reparable saved inputs, not acceptance of a current native body.
  })

  it('rejects an upstream scope substitution without retargeting the saved new-body base', () => {
    const cut: Feature = { id: 'cut-one', type: 'cut', name: 'Original one-body cut', suppressed: false,
      sketchId: sketch.id, depth: 1, symmetric: false, bodyScope: [a] }
    const fixedBase = { bodyId: a.bodyId, sourceFeatureId: cut.id }
    const original = documentWith(cut, limited('throughAll', fixedBase)), saved = serializeDocument(original)
    expect(() => updateFeature(original, cut.id, { bodyScope: [b] })).toThrow('endCondition.baseBody.bodyId')
    expect(serializeDocument(original)).toBe(saved)
    expect(featureBodyReferences(original.features.at(-1)!)).toEqual([fixedBase])
  })

  it('does not advertise the limiting input body as a new output or a new creation owner', () => {
    const source = limited('untilNext'), original = documentWith(source)
    expect(createdBodyIds(source)).toEqual(['limited-output-body'])
    expect(featureBodyOutputIds(source)).toEqual(['limited-output-body'])
    expect(bodyReferenceCreationFeatureId(original.features, { bodyId: a.bodyId, sourceFeatureId: source.id })).toBeNull()
    expect(bodyReferenceCreationFeatureId(original.features, { bodyId: 'limited-output-body', sourceFeatureId: source.id })).toBe(source.id)
    expect(() => documentWith(source, merge('forged-output-consumer', { bodyId: a.bodyId, sourceFeatureId: source.id }))).toThrow('bodyOperation.target.bodyId')
  })
})
