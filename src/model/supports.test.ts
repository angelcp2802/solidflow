import { describe, expect, it } from 'vitest'
import type { Feature, ReferencePlaneFeature, SketchFeature } from '../cad/kernel.types'
import { createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'

const sketch = (id: string): SketchFeature => ({ id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 20, height: 10 } })
const plane = (id: string): ReferencePlaneFeature => ({ id, name: id, type: 'plane', support: { kind: 'principal', plane: 'XZ' }, offset: -25, reversed: true, suppressed: false })
const face = (sourceFeatureId: string) => ({ sourceFeatureId, key: 'face-v1|opaque-geometric-reference' })
function chain() {
  const features: Feature[] = [
    sketch('base-sketch'),
    { id: 'base', name: 'Base', type: 'extrude', sketchId: 'base-sketch', depth: 10, symmetric: false, suppressed: false },
    { ...plane('face-plane'), support: { kind: 'face', face: face('base') } },
    { ...plane('offset-plane'), support: { kind: 'plane', planeId: 'face-plane' }, offset: 35 },
    { ...sketch('supported-sketch'), support: { kind: 'plane', planeId: 'offset-plane' } },
    { id: 'upper', name: 'Upper', type: 'extrude', sketchId: 'supported-sketch', depth: 10, symmetric: false, suppressed: false },
    { id: 'finish', name: 'Finish', type: 'fillet', baseFeatureId: 'upper', size: 1, selection: { mode: 'all' }, suppressed: false },
    { ...sketch('face-sketch'), support: { kind: 'face', face: face('finish') }, offset: -5 },
    plane('independent-plane'),
    { ...sketch('independent-sketch'), support: { kind: 'plane', planeId: 'independent-plane' } },
  ]
  return validateDocument({ ...createDocument(), features })
}

describe('associative sketch and reference plane persistence', () => {
  it('round trips principal, plane and face supports with signed offsets and reversed normals', () => {
    const document = chain()
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    expect(document.features[3]).toMatchObject({ offset: 35, reversed: true })
    expect(document.features[7]).toMatchObject({ offset: -5, support: { kind: 'face', face: face('finish') } })
    const normalized = validateDocument(document)
    const supported = normalized.features[7] as SketchFeature
    if (supported.support?.kind !== 'face') throw new Error('Expected face support')
    supported.support.face.key = 'face-v1|mutated-copy'
    expect(document.features[7]).toMatchObject({ support: { face: { key: face('finish').key } } })
  })

  it('retains legacy principal sketches and normalizes an explicitly removed optional support', () => {
    const document = validateDocument({ ...createDocument(), features: [{ ...sketch('legacy'), support: undefined }] })
    expect(document.features[0]).not.toHaveProperty('support')
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    const invalid = { ...sketch('legacy') } as Record<string, unknown>
    delete invalid.plane
    expect(() => validateDocument({ ...createDocument(), features: [invalid] })).toThrow('plane')
  })

  it('checks every required reference-plane field and rejects unknown fields', () => {
    for (const key of ['support', 'offset', 'reversed']) {
      const candidate = { ...plane('p') } as Record<string, unknown>
      delete candidate[key]
      expect(() => validateDocument({ ...createDocument(), features: [candidate] })).toThrow(key)
    }
    for (const candidate of [
      { ...plane('p'), reversed: 1 }, { ...plane('p'), unknown: 5 },
      { ...plane('p'), support: { kind: 'principal', plane: 'AB' } },
      { ...plane('p'), support: { kind: 'principal', plane: 'XY', planeId: 'p' } },
      { ...plane('p'), support: { kind: 'plane' } },
      { ...plane('p'), support: { kind: 'face', face: { sourceFeatureId: 'base', key: face('base').key, index: 0 } } },
      { ...sketch('s'), support: { kind: 'principal', plane: 'XY' } },
      { ...sketch('s'), support: null },
    ]) expect(() => validateDocument({ ...createDocument(), features: [candidate] })).toThrow()
  })

  it.each([NaN, Infinity, -Infinity, -1_000_001, 1_000_001])('rejects invalid reference plane offsets %s', offset => {
    expect(() => validateDocument({ ...createDocument(), features: [{ ...plane('p'), offset }] })).toThrow('offset')
  })

  it('accepts the signed offset limits including zero', () => {
    for (const offset of [-1_000_000, 0, 1_000_000]) expect(() => validateDocument({ ...createDocument(), features: [{ ...plane('p'), offset }] })).not.toThrow()
  })

  it.each(['edge-v1|wrong-kind', 'face-v1|', 'face-v2|future', 'face-v1|bad\nkey', 'face-v1|' + 'x'.repeat(4096)])('rejects an invalid opaque face key', key => {
    const document = chain()
    document.features[2] = { ...plane('face-plane'), support: { kind: 'face', face: { sourceFeatureId: 'base', key } } }
    expect(() => validateDocument(document)).toThrow('support.face.key')
  })

  it('requires support references to precede their dependents and use the correct feature type', () => {
    const document = chain()
    for (const support of [
      { kind: 'plane', planeId: 'base' }, { kind: 'plane', planeId: 'base-sketch' },
      { kind: 'plane', planeId: 'offset-plane' }, { kind: 'plane', planeId: 'missing' },
      { kind: 'face', face: face('base-sketch') }, { kind: 'face', face: face('independent-plane') },
      { kind: 'face', face: face('upper') }, { kind: 'face', face: face('missing') },
    ]) expect(() => validateDocument({ ...document, features: document.features.map(feature => feature.id === 'face-plane' ? { ...feature, support } : feature) })).toThrow('anterior')
    expect(() => validateDocument({ ...document, features: document.features.map(feature => feature.id === 'finish' ? { ...feature, baseFeatureId: 'offset-plane' } : feature) })).toThrow('operación sólida anterior')
  })

  it('keeps suppressed supports recoverable without overwriting descendant flags', () => {
    const document = chain()
    const suppressed = updateFeature(document, 'base', { suppressed: true })
    expect(suppressed.features.filter(feature => feature.suppressed).map(feature => feature.id)).toEqual(['base'])
    const restored = updateFeature(parseDocument(serializeDocument(suppressed)), 'base', { suppressed: false })
    expect(restored.features).toEqual(document.features)
  })

  it('reassigns a supported sketch to its principal plane and removes the old dependency', () => {
    const document = updateFeature(chain(), 'supported-sketch', { support: undefined, plane: 'YZ' })
    const restored = parseDocument(serializeDocument(document))
    expect(restored.features.find(feature => feature.id === 'supported-sketch')).not.toHaveProperty('support')
    expect(restored.features.find(feature => feature.id === 'supported-sketch')).toMatchObject({ plane: 'YZ' })
    const remaining = removeFeature(restored, 'face-plane').features.map(feature => feature.id)
    expect(remaining).not.toContain('offset-plane')
    expect(remaining).toEqual(['base-sketch', 'base', 'supported-sketch', 'upper', 'finish', 'face-sketch', 'independent-plane', 'independent-sketch'])
  })

  it('deletes face/plane support descendants, subsequent solids and dependent finishes transitively', () => {
    expect(removeFeature(chain(), 'base').features.map(feature => feature.id)).toEqual(['base-sketch', 'independent-plane', 'independent-sketch'])
    expect(removeFeature(chain(), 'face-plane').features.map(feature => feature.id)).toEqual(['base-sketch', 'base', 'independent-plane', 'independent-sketch'])
    expect(removeFeature(chain(), 'finish').features.map(feature => feature.id)).not.toContain('face-sketch')
  })

  it('undoes and redoes support cascades without losing the associative references', () => {
    const document = chain(), history = new DocumentHistory(document)
    history.apply(removeFeature(document, 'face-plane'))
    expect(history.undo()).toEqual(document)
    expect(history.redo().features.map(feature => feature.id)).toEqual(['base-sketch', 'base', 'independent-plane', 'independent-sketch'])
  })
})
