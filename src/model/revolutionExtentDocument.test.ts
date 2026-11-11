import { describe, expect, it } from 'vitest'
import type { RevolutionExtent, RevolveFeature, SketchFeature } from '../cad/kernel.types'
import { DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument, type Document } from './document'
import { featureDependencyIds, featureSketchIds } from './featureInputs'
import { featureBodyReferences } from './bodyReferences'

// Original synthetic persistence fixture; no external geometry or native results.
const sketch: SketchFeature = {
  id: 'profile', name: 'Profile', suppressed: false, type: 'sketch', plane: 'XY', offset: 0,
  profile: { kind: 'rectangle', center: [3, 0], width: 2, height: 4 },
}
const legacy: RevolveFeature = {
  id: 'revolution', name: 'Revolution', suppressed: false, type: 'revolve', sketchId: 'profile', angle: 360,
}
function fixture(patch: Record<string, unknown> = {}): Document {
  return { version: 1, id: 'original-revolution-extent', name: 'Extent persistence', units: 'mm',
    features: [structuredClone(sketch), { ...legacy, ...patch }],
    createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z' }
}
function revolution(document: Document): RevolveFeature {
  const feature = document.features[1]
  if (feature?.type !== 'revolve') throw Error('Expected original revolution')
  return feature
}

describe('revolution extent document compatibility', () => {
  it('preserves legacy canonical bytes without materializing extent, axis or direction', () => {
    const original = fixture(), bytes = JSON.stringify(original, null, 2)
    for (const restored of [validateDocument(original), parseDocument(bytes)]) {
      expect(serializeDocument(restored)).toBe(bytes)
      for (const field of ['extent', 'axis', 'reversed']) expect(Object.hasOwn(revolution(restored), field)).toBe(false)
    }
  })

  it.each<{ angle: number; extent: RevolutionExtent }>([
    { angle: 90, extent: { kind: 'two-directions', secondAngle: 45 } },
    { angle: 0, extent: { kind: 'two-directions', secondAngle: 360 } },
    { angle: 360, extent: { kind: 'two-directions', secondAngle: 0 } },
    { angle: 180, extent: { kind: 'two-directions', secondAngle: 180 } },
    { angle: 0, extent: { kind: 'two-directions', secondAngle: Number.MIN_VALUE } },
    { angle: 0.125, extent: { kind: 'mid-plane' } },
    { angle: 180, extent: { kind: 'mid-plane' } },
    { angle: 360, extent: { kind: 'mid-plane' } },
  ])('round trips exact extents and ordered direction without clamping: %j', ({ angle, extent }) => {
    for (const reversed of [false, true]) {
      const original = fixture({ angle, extent, reversed, axis: { kind: 'sketch-line', entityId: 'retained-axis' },
        bodyOperation: { mode: 'new', bodyId: 'turned-body' } })
      const restored = parseDocument(serializeDocument(original))
      expect(restored).toEqual(original)
      expect(restored.version).toBe(1)
      expect(revolution(restored).angle).toBe(angle)
      expect(revolution(restored).extent).toEqual(extent)
    }
    const implicitAxis = parseDocument(serializeDocument(fixture({ angle, extent })))
    expect(Object.hasOwn(revolution(implicitAxis), 'axis')).toBe(false)
    expect(Object.hasOwn(revolution(implicitAxis), 'reversed')).toBe(false)
  })

  it('detaches extent data while retaining the existing sketch and body dependency identities', () => {
    const original = fixture({ angle: 90, extent: { kind: 'two-directions', secondAngle: 30 }, bodyOperation: { mode: 'new', bodyId: 'turned-body' } })
    const consumer: RevolveFeature = { ...legacy, id: 'merged-revolution', angle: 120, extent: { kind: 'mid-plane' },
      bodyOperation: { mode: 'merge', target: { bodyId: 'turned-body', sourceFeatureId: 'revolution' } } }
    original.features.push(consumer)
    const restored = validateDocument(original), extent = revolution(restored).extent!
    if (extent.kind !== 'two-directions') throw Error('Expected two directions')
    extent.secondAngle = 50
    expect(revolution(original).extent).toEqual({ kind: 'two-directions', secondAngle: 30 })
    expect(featureSketchIds(consumer)).toEqual(['profile'])
    expect(featureDependencyIds(consumer)).toEqual(['profile', 'revolution'])
    expect(featureBodyReferences(consumer)).toEqual([{ bodyId: 'turned-body', sourceFeatureId: 'revolution' }])
    expect(removeFeature(original, 'revolution').features.map(f => f.id)).toEqual(['profile'])
    expect(removeFeature(original, 'profile').features).toEqual([])
    expect(() => validateDocument({ ...original, features: original.features.slice(1) })).toThrow('croquis anterior')
  })

  it('undoes extent changes to the exact absent legacy declaration and redoes the saved variant', () => {
    const original = fixture(), bytes = serializeDocument(original), history = new DocumentHistory(original)
    const edited = updateFeature(original, 'revolution', { angle: 0, extent: { kind: 'two-directions', secondAngle: 120 }, reversed: true })
    history.apply(edited)
    expect(serializeDocument(history.undo())).toBe(bytes)
    expect(serializeDocument(history.redo())).toBe(serializeDocument(edited))
    expect(revolution(parseDocument(serializeDocument(edited)))).toMatchObject({ angle: 0, extent: { kind: 'two-directions', secondAngle: 120 }, reversed: true })
    expect(() => updateFeature(edited, 'revolution', { extent: { kind: 'mid-plane' } })).toThrow('angle')
    expect(serializeDocument(original)).toBe(bytes)
  })
})

describe('strict revolution extent declarations', () => {
  it.each([
    undefined, null, [], '', 0, false, {}, { kind: undefined }, { kind: null }, { kind: 'blind' },
    { kind: 'mid-plane', secondAngle: 0 }, { kind: 'mid-plane', extra: undefined },
    { kind: 'two-directions' }, { kind: 'two-directions', secondAngle: 20, extra: false },
    ...[undefined, null, '20', true, NaN, Infinity, -Infinity, -0.001, 360.001].map(secondAngle => ({ kind: 'two-directions', secondAngle })),
  ])('rejects malformed explicit extent %j rather than selecting a default', extent => {
    expect(() => validateDocument(fixture({ angle: 90, extent }))).toThrow('extent')
  })

  it.each([
    [0, 0], [180, 180.000001], [360, 0.001], [0.001, 360], [-1, 20], [361, 0],
    [NaN, 20], [Infinity, 20], [-Infinity, 20], [undefined, 20], [null, 20], ['90', 20],
  ])('rejects invalid first/second angles %j/%j', (angle, secondAngle) => {
    expect(() => validateDocument(fixture({ angle, extent: { kind: 'two-directions', secondAngle } }))).toThrow()
  })

  it.each([undefined, { kind: 'mid-plane' }])('requires a positive total angle for single/mid-plane mode %j', extent => {
    for (const angle of [0, -1, 360.001, NaN, Infinity, -Infinity, undefined, null]) {
      const patch = extent ? { angle, extent } : { angle }
      expect(() => validateDocument(fixture(patch))).toThrow('angle')
    }
  })

  it('rejects malformed serialized variants without a normalization fallback', () => {
    for (const extent of [null, { kind: 'mid-plane', secondAngle: 90 }, { kind: 'two-directions', secondAngle: null }]) {
      expect(() => parseDocument(JSON.stringify(fixture({ extent })))).toThrow('extent')
    }
    expect(() => parseDocument(JSON.stringify(fixture({ angle: 200, extent: { kind: 'two-directions', secondAngle: 200 } })))).toThrow('extent.secondAngle')
  })
})
