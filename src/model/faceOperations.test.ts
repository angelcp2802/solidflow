import { describe, expect, it } from 'vitest'
import type { DraftFeature, ExtrudeFeature, FaceReference, Feature, ReferencePlaneFeature, ShellFeature, SketchFeature } from '../cad/kernel.types'
import { createDemoDocument, createDocument, DocumentHistory, MAX_SELECTED_FACES, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'
import { featureDependencyIds, featureSketchIds, hasBaseFeature } from './featureInputs'

const sketch = (id: string): SketchFeature => ({
  id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [0, 0], width: 40, height: 30 },
})
const solid = (id = 'base', sketchId = 'profile'): ExtrudeFeature => ({ id, name: id, type: 'extrude', suppressed: false, sketchId, depth: 20, symmetric: false })
const face = (sourceFeatureId = 'base', key = 'face-v1|stored-face'): FaceReference => ({ sourceFeatureId, key })
const plane: ReferencePlaneFeature = { id: 'plane', name: 'Plano neutro', type: 'plane', suppressed: false, support: { kind: 'principal', plane: 'XY' }, offset: 0, reversed: false }
const shell = (): ShellFeature => ({
  id: 'shell', name: 'Vaciado', type: 'shell', suppressed: false, baseFeatureId: 'base',
  thickness: 2, direction: 'inward', removedFaces: [face('base', 'face-v1|top'), face('base', 'face-v1|front')],
})
const draft = (): DraftFeature => ({
  id: 'draft', name: 'Ángulo de desmoldeo', type: 'draft', suppressed: false, baseFeatureId: 'base',
  support: { kind: 'plane', planeId: 'plane' }, angle: 5, reversed: true, propagation: 'tangent',
  faces: [face('base', 'face-v1|right'), face('base', 'face-v1|left')],
})
const documentWith = (...features: unknown[]) => validateDocument({ ...createDocument(), features: [sketch('profile'), solid(), plane, ...features] })

describe('shell and draft document persistence', () => {
  it('round trips inward/outward walls, closed shells and both draft directions', () => {
    for (const direction of ['inward', 'outward'] as const) {
      for (const removedFaces of [[], shell().removedFaces]) {
        for (const reversed of [false, true]) {
          const document = documentWith({ ...shell(), direction, removedFaces }, { ...draft(), reversed })
          expect(document.version).toBe(1)
          expect(parseDocument(serializeDocument(document))).toEqual(document)
        }
      }
    }
    const legacy = createDemoDocument()
    expect(parseDocument(serializeDocument(legacy))).toEqual(legacy)
  })

  it('keeps selected face order, opaque lost keys and detached nested inputs', () => {
    const initial = documentWith(shell(), draft())
    const copy = validateDocument(initial)
    ;(copy.features[3] as ShellFeature).removedFaces[0].key = 'face-v1|different'
    const copiedDraft = copy.features[4] as DraftFeature
    copiedDraft.faces.reverse()
    if (copiedDraft.support.kind === 'plane') copiedDraft.support.planeId = 'different'
    expect(initial.features[3]).toEqual(shell())
    expect(initial.features[4]).toEqual(draft())
    const stale = documentWith({ ...draft(), faces: [face('base', 'face-v1|no-longer-resolvable')] })
    expect(parseDocument(serializeDocument(stale))).toEqual(stale)
  })

  it('requires all feature fields and rejects unknown contracts without coercion', () => {
    for (const fixture of [shell(), draft()]) {
      for (const field of Object.keys(fixture)) {
        const changed = { ...fixture } as Record<string, unknown>
        delete changed[field]
        expect(() => documentWith(changed), field).toThrow()
      }
      expect(() => documentWith({ ...fixture, oldFaces: [] })).toThrow('desconocido')
    }
    for (const changed of [
      { ...shell(), direction: 'outside' }, { ...shell(), direction: false },
      { ...draft(), reversed: 1 }, { ...draft(), propagation: 'none' },
      { ...draft(), propagation: true }, { ...draft(), support: null },
    ]) expect(() => documentWith(changed)).toThrow()
  })

  it('bounds physical thickness and draft magnitude, preserving direction in its explicit field', () => {
    for (const thickness of [NaN, Infinity, -Infinity, -2, 0, 0.001, 100_001, '2']) {
      expect(() => documentWith({ ...shell(), thickness })).toThrow('thickness')
    }
    for (const angle of [NaN, Infinity, -5, 0, 0.001, 90, 360, '5']) {
      expect(() => documentWith({ ...draft(), angle })).toThrow('angle')
    }
    for (const thickness of [0.01, 100_000]) expect(() => documentWith({ ...shell(), thickness })).not.toThrow()
    for (const angle of [0.01, 89.9]) expect(() => documentWith({ ...draft(), angle })).not.toThrow()
  })

  it('allows an empty removed-face list but requires at least one drafted face and enforces selection limits', () => {
    expect(() => documentWith({ ...shell(), removedFaces: [] })).not.toThrow()
    expect(() => documentWith({ ...draft(), faces: [] })).toThrow('faces')
    const faces = Array.from({ length: MAX_SELECTED_FACES }, (_, index) => face('base', `face-v1|${index}`))
    expect(() => documentWith({ ...shell(), removedFaces: faces }, { ...draft(), faces })).not.toThrow()
    const tooMany = [...faces, face('base', 'face-v1|overflow')]
    expect(() => documentWith({ ...shell(), removedFaces: tooMany })).toThrow('256')
    expect(() => documentWith({ ...draft(), faces: tooMany })).toThrow('256')
  })

  it('rejects sparse, duplicate and malformed face references for either operation', () => {
    for (const faces of [
      new Array(1), [null], [face(), face()],
      [{ ...face(), key: 'edge-v1|wrong-kind' }], [{ ...face(), key: 'face-v1|' }],
      [{ ...face(), key: 'face-v1|bad\nkey' }], [{ ...face(), key: `face-v1|${'x'.repeat(4096)}` }],
      [{ ...face(), transientIndex: 0 }], [{ key: 'face-v1|no-owner' }], [{ sourceFeatureId: 'base' }],
    ]) {
      expect(() => documentWith({ ...shell(), removedFaces: faces })).toThrow('removedFaces')
      expect(() => documentWith({ ...draft(), faces })).toThrow('faces')
    }
  })
})

describe('face operation dependencies', () => {
  it('requires every selected face to belong to the selected historical base', () => {
    for (const owner of ['profile', 'plane', 'missing', 'shell', 'later', 'other']) {
      expect(() => documentWith(solid('other'), { ...shell(), removedFaces: [face(owner)] }, solid('later'))).toThrow('la cara debe pertenecer a la operación base')
      expect(() => documentWith(solid('other'), { ...draft(), faces: [face(owner)] }, solid('later'))).toThrow('la cara debe pertenecer a la operación base')
    }
    const initial = documentWith(solid('other'), shell(), draft())
    expect(() => updateFeature(initial, 'shell', { baseFeatureId: 'other' })).toThrow('removedFaces')
    expect(() => updateFeature(initial, 'draft', { baseFeatureId: 'other' })).toThrow('faces')
  })

  it('requires earlier solid bases even for suppressed operations and closed shells', () => {
    for (const baseFeatureId of ['missing', 'profile', 'plane', 'shell', 'draft', 'later']) {
      expect(() => documentWith({ ...shell(), baseFeatureId, removedFaces: [], suppressed: true }, solid('later'))).toThrow('baseFeatureId')
      expect(() => documentWith({ ...draft(), baseFeatureId, faces: [face(baseFeatureId)], suppressed: true }, solid('later'))).toThrow('baseFeatureId')
    }
    // The parser checks graph structure, while the kernel checks the current body.
    expect(() => documentWith(solid('newer'), shell(), draft())).not.toThrow()
  })

  it('accepts all neutral-plane support kinds and validates each reference type and position', () => {
    for (const support of [
      { kind: 'principal', plane: 'XZ' }, { kind: 'plane', planeId: 'plane' },
      { kind: 'face', face: face('base', 'face-v1|neutral-plane') },
    ]) expect(documentWith({ ...draft(), support }).features[3]).toMatchObject({ support })
    for (const planeId of ['missing', 'profile', 'base', 'draft', 'later']) {
      expect(() => documentWith({ ...draft(), support: { kind: 'plane', planeId } }, { ...plane, id: 'later' })).toThrow('support.planeId')
    }
    for (const sourceFeatureId of ['missing', 'profile', 'plane', 'draft', 'later']) {
      expect(() => documentWith({ ...draft(), support: { kind: 'face', face: face(sourceFeatureId) } }, solid('later'))).toThrow('support.face.sourceFeatureId')
    }
    expect(() => documentWith({ ...draft(), support: { kind: 'principal', plane: 'AB' } })).toThrow('support.plane')
  })

  it('reports the base and neutral support once without treating the operations as sketch consumers', () => {
    expect(featureDependencyIds(shell())).toEqual(['base'])
    expect(featureDependencyIds(draft())).toEqual(['base', 'plane'])
    expect(featureDependencyIds({ ...draft(), support: { kind: 'face', face: face('base') } })).toEqual(['base'])
    expect(featureDependencyIds({ ...draft(), support: { kind: 'face', face: face('neutral-owner') } })).toEqual(['base', 'neutral-owner'])
    expect(featureSketchIds(shell())).toEqual([])
    expect(featureSketchIds(draft())).toEqual([])
  })

  it('identifies all base-dependent operations with a general guard, including null selections', () => {
    expect(hasBaseFeature(shell())).toBe(true)
    expect(hasBaseFeature(draft())).toBe(true)
    expect(hasBaseFeature({ id: 'finish', name: 'Acabado', type: 'fillet', suppressed: false, size: 1, baseFeatureId: 'base', selection: { mode: 'all' } })).toBe(true)
    expect(hasBaseFeature({ id: 'mirror', name: 'Espejo', type: 'mirror', suppressed: false, baseFeatureId: 'base', source: { mode: 'body', sourceFeatureId: 'base' }, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false })).toBe(true)
    for (const feature of [null, undefined, sketch('s'), solid(), plane]) expect(hasBaseFeature(feature)).toBe(false)
  })

  function chain() {
    const features: Feature[] = [
      sketch('profile'), solid(), shell(),
      { ...plane, support: { kind: 'face', face: face('shell', 'face-v1|neutral') } },
      { ...draft(), baseFeatureId: 'shell', faces: [face('shell', 'face-v1|wall')] },
      { id: 'mirror', name: 'Simetría', type: 'mirror', suppressed: false, baseFeatureId: 'draft', source: { mode: 'body', sourceFeatureId: 'draft' }, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false },
      { ...sketch('supported'), support: { kind: 'face', face: face('mirror', 'face-v1|support') } },
      solid('child', 'supported'), sketch('independent'),
    ]
    return validateDocument({ ...createDocument(), features })
  }

  it('cascades deletion through shell, neutral plane, draft, mirrored body and supported sketches', () => {
    const original = chain()
    expect(removeFeature(original, 'shell').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'independent'])
    expect(removeFeature(original, 'plane').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'shell', 'independent'])
    expect(removeFeature(original, 'draft').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'shell', 'plane', 'independent'])
    expect(original.features).toHaveLength(9)
  })

  it('cascades a neutral-face dependency independent of the body being drafted', () => {
    const original = documentWith(solid('neutral-owner'), { ...draft(), support: { kind: 'face', face: face('neutral-owner') } })
    expect(removeFeature(original, 'neutral-owner').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'plane'])
  })

  it('preserves local suppression and restores selected faces and dependencies through history', () => {
    const initial = chain()
    const history = new DocumentHistory(initial)
    history.apply(updateFeature(initial, 'shell', { thickness: 4, direction: 'outward', removedFaces: [] }))
    history.apply(updateFeature(history.current, 'plane', { suppressed: true }))
    const suppressed = history.current
    expect(suppressed.features.filter((feature) => feature.suppressed).map((feature) => feature.id)).toEqual(['plane'])
    expect(parseDocument(serializeDocument(suppressed))).toEqual(suppressed)
    history.apply(removeFeature(suppressed, 'shell'))
    expect(history.undo()).toEqual(suppressed)
    history.undo()
    expect(history.undo()).toEqual(initial)
    expect(history.redo().features[2]).toMatchObject({ thickness: 4, direction: 'outward', removedFaces: [] })
    expect(history.redo()).toEqual(suppressed)
    const copy = history.undo()
    ;(copy.features[4] as DraftFeature).faces[0].key = 'face-v1|mutated-return'
    expect(history.current.features[4]).toMatchObject({ faces: [face('shell', 'face-v1|wall')] })
  })
})
