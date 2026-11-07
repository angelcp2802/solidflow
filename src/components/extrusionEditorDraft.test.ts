import { describe, expect, it, vi } from 'vitest'
import type { ExtrudeFeature, SketchFeature } from '../cad/kernel.types'
import { createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature } from '../model/document'
import { extrusionDirectionInputError, mergeExtrusionDraft } from './extrusionEditorDraft'

// Original declaration-only records. This file checks drafts and persistence, not native solids.
const feature: ExtrudeFeature = { id: 'boss', name: 'Original boss', type: 'extrude', suppressed: false, sketchId: 'profile',
  depth: -20, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'body' },
  thinWall: { kind: 'one-side', thickness: 2, reversed: false, endCaps: { enabled: true, thickness: 1 } } }

describe('extrusion extent draft isolation and shared admission', () => {
  it('detaches both target trees, clears only an explicit nested end and preserves invalid OFF numbers', () => {
    const first = { kind: 'upToSurface' as const, target: { kind: 'face' as const, face: { sourceFeatureId: 'source-a', key: 'face-a' } } }
    const second = { enabled: false, depth: 0, endCondition: { kind: 'untilNext' as const, baseFeatureId: 'source-b', baseBody: { bodyId: 'body-b', sourceFeatureId: 'source-b' } } }
    const next = mergeExtrusionDraft(feature, { endCondition: first, secondDirection: second })
    expect(next.endCondition).toEqual(first); expect(next.endCondition).not.toBe(first)
    expect(next.secondDirection).toEqual(second); expect(next.secondDirection?.endCondition).not.toBe(second.endCondition)
    first.target.face.key = 'changed'; second.endCondition.baseBody.sourceFeatureId = 'changed'
    expect(next.endCondition).toMatchObject({ target: { face: { key: 'face-a' } } })
    expect(next.secondDirection?.endCondition).toMatchObject({ baseBody: { sourceFeatureId: 'source-b' } })
    const cleared = mergeExtrusionDraft(next, { secondDirection: { ...next.secondDirection!, endCondition: undefined } })
    expect(cleared.secondDirection).toEqual({ enabled: false, depth: 0 })
    expect(cleared.endCondition).toEqual(next.endCondition); expect(cleared.thinWall).toEqual(feature.thinWall)
  })

  it('rejects nested end/target/reference accessors before invoking or spreading them', () => {
    const getter = vi.fn(() => 'source')
    const face = { sourceFeatureId: 'source', key: 'face' }
    Object.defineProperty(face, 'key', { enumerable: true, get: getter })
    const end = { kind: 'upToSurface' as const, target: { kind: 'face' as const, face } }
    for (const patch of [{ endCondition: end }, { secondDirection: { enabled: false, depth: 0, endCondition: end } }]) {
      expect(() => mergeExtrusionDraft(feature, patch)).toThrow()
    }
    const direction = { enabled: false, depth: 0 }
    Object.defineProperty(direction, 'endCondition', { enumerable: true, get: getter })
    expect(() => mergeExtrusionDraft(feature, { secondDirection: direction })).toThrow()
    const executableText = { toJSON: getter }
    expect(() => mergeExtrusionDraft(feature, { endCondition: { kind: 'upToSurface', target: { kind: 'face', face: { sourceFeatureId: 'source', key: executableText } } } } as unknown as Partial<ExtrudeFeature>)).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it.each([7, -7])('keeps absent legacy normal and mid-plane declarations unchanged at D1=%s', depth => {
    for (const symmetric of [false, true]) {
      const input: ExtrudeFeature = { ...feature, depth, symmetric }
      const before = structuredClone(input), next = mergeExtrusionDraft(input, { name: 'Renamed' })
      expect(next).not.toHaveProperty('secondDirection')
      expect(next).toEqual({ ...input, name: 'Renamed' })
      expect(extrusionDirectionInputError(next)).toBeNull()
      expect(input).toEqual(before)
    }
  })

  it('captures an edited direction as detached data without changing signed depth, caps or owner', () => {
    const direction = { enabled: true, depth: 10 }, before = structuredClone(feature)
    const edited = mergeExtrusionDraft(feature, { secondDirection: direction }, feature)
    expect(edited).toEqual({ ...feature, secondDirection: direction })
    expect(edited.secondDirection).not.toBe(direction)
    direction.depth = 100
    expect(edited.secondDirection?.depth).toBe(10)
    expect(extrusionDirectionInputError(edited)).toBeNull()
    expect(feature).toEqual(before)
  })

  it.each([0, -.01, NaN, Infinity, 100_001])('retains numeric invalid depth %s while OFF for explicit correction', depth => {
    const input = { ...feature, secondDirection: { enabled: true, depth: 10 } }
    const before = structuredClone(input), invalid = mergeExtrusionDraft(input, { secondDirection: { enabled: false, depth } }, input)
    expect(invalid.secondDirection).toEqual({ enabled: false, depth })
    expect(extrusionDirectionInputError(invalid)).not.toBeNull()
    const corrected = mergeExtrusionDraft(invalid, { secondDirection: { enabled: false, depth: 1.5 } }, input)
    expect(extrusionDirectionInputError(corrected)).toBeNull()
    expect(corrected).toMatchObject({ depth: -20, bodyOperation: feature.type === 'extrude' ? feature.bodyOperation : undefined, thinWall: feature.thinWall })
    expect(input).toEqual(before)
  })

  it('clears own optional fields as real absence before later admission or persistence', () => {
    const input: ExtrudeFeature = { ...feature, secondDirection: { enabled: false, depth: 10 },
      endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } } }
    const before = structuredClone(input), cleared = mergeExtrusionDraft(input, { endCondition: undefined, secondDirection: undefined }, input)
    expect(cleared).not.toHaveProperty('endCondition')
    expect(cleared).not.toHaveProperty('secondDirection')
    expect(cleared).toEqual(feature)
    expect(input).toEqual(before)
  })

  it.each(['endCondition', 'secondDirection'] as const)('rejects a patch %s accessor before spreading it', key => {
    const hook = vi.fn(() => undefined), patch: Partial<ExtrudeFeature> = {}
    Object.defineProperty(patch, key, { enumerable: true, get: hook })
    expect(() => mergeExtrusionDraft(feature, patch)).toThrow('sin funciones de acceso')
    expect(hook).not.toHaveBeenCalled()
  })

  it('does not invoke nested accessors or accept unexpected direction records as editable numeric drafts', () => {
    const hook = vi.fn(() => 10), direction = { enabled: true, depth: 10 }
    Object.defineProperty(direction, 'depth', { enumerable: true, get: hook })
    for (const value of [direction, null, {}, { enabled: 1, depth: 10 }, { enabled: true, depth: '10' },
      { enabled: true, depth: 10, extra: 1 }, Object.assign(Object.create({}), { enabled: true, depth: 10 })]) {
      expect(() => mergeExtrusionDraft(feature, { secondDirection: value } as Partial<ExtrudeFeature>)).toThrow()
    }
    expect(hook).not.toHaveBeenCalled()
  })

  it('retains regular/thin edit-time immutability and exact cut scope', () => {
    const regular: ExtrudeFeature = { id: 'cut', name: 'Original cut', type: 'cut', suppressed: false, sketchId: 'profile',
      depth: 7, symmetric: false, bodyScope: [{ bodyId: 'owner', sourceFeatureId: 'state' }] }
    expect(() => mergeExtrusionDraft(regular, { thinWall: feature.thinWall }, regular)).toThrow('se conserva al editar')
    const edited = mergeExtrusionDraft(regular, { secondDirection: { enabled: true, depth: 3 } }, regular)
    expect(edited).toEqual({ ...regular, secondDirection: { enabled: true, depth: 3 } })
    expect(edited).not.toHaveProperty('bodyOperation')
    expect(regular).not.toHaveProperty('secondDirection')
  })

  it('keeps an invalid draft outside committed history, then retains OFF intent through history and reopening', () => {
    const sketch: SketchFeature = { id: 'profile', name: 'Original rectangle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [6, 4], width: 12, height: 8 } }
    const original = { ...feature, secondDirection: { enabled: true, depth: 10 } }
    const history = new DocumentHistory({ ...createDocument('Original second direction history'), features: [sketch, original] })
    const saved = serializeDocument(history.current)
    const invalid = mergeExtrusionDraft(original, { secondDirection: { enabled: false, depth: 0 } }, original)
    expect(extrusionDirectionInputError(invalid)).not.toBeNull()
    expect(serializeDocument(history.current)).toBe(saved)
    const corrected = mergeExtrusionDraft(invalid, { secondDirection: { enabled: false, depth: 12.5 } }, original)
    history.apply(updateFeature(history.current, original.id, corrected))
    const reopened = parseDocument(serializeDocument(history.current))
    expect(reopened.features[0]).toEqual(sketch)
    expect(reopened.features[1]).toMatchObject({ depth: -20, secondDirection: { enabled: false, depth: 12.5 }, thinWall: feature.thinWall })
    expect(history.undo().features[1]).toMatchObject({ secondDirection: { enabled: true, depth: 10 } })
    expect(history.redo().features[1]).toEqual(reopened.features[1])
  })
})
