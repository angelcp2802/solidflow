import { describe, expect, it } from 'vitest'
import type { ExtrudeEndCondition, ExtrudeFeature, FaceReference, PlaneSupport, ReferencePlaneFeature, SketchFeature } from '../cad/kernel.types'
import { createDemoDocument, createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'
import { featureDependencyIds, featureSketchIds, hasBaseFeature } from './featureInputs'

const sketch = (id: string): SketchFeature => ({
  id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [0, 0], width: 40, height: 30 },
})
const solid = (id = 'base', sketchId = 'profile'): ExtrudeFeature => ({
  id, name: id, type: 'extrude', sketchId, depth: 20, symmetric: false, suppressed: false,
})
const plane: ReferencePlaneFeature = {
  id: 'limit-plane', name: 'Plano límite', type: 'plane', suppressed: false,
  support: { kind: 'principal', plane: 'XY' }, offset: 30, reversed: false,
}
const face = (sourceFeatureId = 'base', key = 'face-v1|stored-curved-face'): FaceReference => ({ sourceFeatureId, key })
const limited = (endCondition: ExtrudeEndCondition): ExtrudeFeature => ({
  ...solid('limited', 'cut-profile'), type: 'cut', depth: -15, endCondition,
})
const modes: ExtrudeEndCondition[] = [
  { kind: 'throughAll', baseFeatureId: 'base', bothDirections: false },
  { kind: 'throughAll', baseFeatureId: 'base', bothDirections: true },
  { kind: 'untilNext', baseFeatureId: 'base' },
  { kind: 'upToSurface', target: { kind: 'principal', plane: 'XZ' } },
  { kind: 'upToSurface', target: { kind: 'plane', planeId: plane.id } },
  { kind: 'upToSurface', target: { kind: 'face', face: face() } },
]
const documentWith = (...features: unknown[]) => validateDocument({
  ...createDocument(), features: [sketch('profile'), solid(), plane, sketch('cut-profile'), ...features],
})

describe('extrusion end-condition persistence', () => {
  it('preserves legacy signed blind and mid-plane definitions without adding fields', () => {
    for (const type of ['extrude', 'cut'] as const) {
      for (const depth of [-20, 20]) {
        for (const symmetric of [false, true]) {
          const feature = { ...solid('legacy', 'cut-profile'), type, depth, symmetric }
          const document = documentWith(feature)
          expect(document.features.at(-1)).toEqual(feature)
          expect(document.features.at(-1)).not.toHaveProperty('endCondition')
          expect(parseDocument(serializeDocument(document))).toEqual(document)
        }
      }
    }
    const legacy = createDemoDocument()
    expect(parseDocument(serializeDocument(legacy))).toEqual(legacy)
  })

  it('round trips every end condition and direction for extrusions and cuts in version one', () => {
    for (const type of ['extrude', 'cut'] as const) {
      for (const depth of [-123, 456]) {
        for (const endCondition of modes) {
          const feature = { ...limited(endCondition), type, depth }
          const document = documentWith(feature)
          expect(document.version).toBe(1)
          expect(document.features.at(-1)).toEqual(feature)
          expect(parseDocument(serializeDocument(document))).toEqual(document)
        }
      }
    }
  })

  it('supports a first extrusion terminated by a principal or reference plane without a base solid', () => {
    for (const target of [{ kind: 'principal', plane: 'XZ' }, { kind: 'plane', planeId: plane.id }] as PlaneSupport[]) {
      const feature = { ...solid('first'), endCondition: { kind: 'upToSurface' as const, target } }
      const document = validateDocument({ ...createDocument(), features: [sketch('profile'), plane, feature] })
      expect(parseDocument(serializeDocument(document))).toEqual(document)
    }
  })

  it('keeps opaque planar, curved and lost face keys without replacing their owner', () => {
    for (const key of ['face-v1|plane-top', 'face-v1|cylinder-trimmed', 'face-v1|no-longer-resolvable']) {
      const endCondition: ExtrudeEndCondition = { kind: 'upToSurface', target: { kind: 'face', face: face('base', key) } }
      const document = documentWith(limited(endCondition))
      expect(parseDocument(serializeDocument(document)).features.at(-1)).toMatchObject({ endCondition })
    }
  })

  it('detaches nested end conditions and face targets from input objects', () => {
    const feature = limited({ kind: 'upToSurface', target: { kind: 'face', face: face() } })
    const document = documentWith(feature)
    const copy = validateDocument(document)
    const copied = copy.features.at(-1) as ExtrudeFeature
    if (copied.endCondition?.kind !== 'upToSurface' || copied.endCondition.target.kind !== 'face') throw new Error('Expected a face target')
    copied.endCondition.target.face.key = 'face-v1|changed-copy'
    copied.endCondition.target.face.sourceFeatureId = 'changed-owner'
    expect(document.features.at(-1)).toEqual(feature)
    if (feature.endCondition?.kind !== 'upToSurface' || feature.endCondition.target.kind !== 'face') throw new Error('Expected a face target')
    feature.endCondition.target.face.key = 'face-v1|changed-input'
    expect(document.features.at(-1)).toMatchObject({ endCondition: { target: { face: face() } } })
  })

  it('normalizes explicitly removed end conditions back to legacy without changing the stored depth', () => {
    const original = documentWith(limited({ kind: 'upToSurface', target: { kind: 'plane', planeId: plane.id } }))
    const changed = updateFeature(original, 'limited', { endCondition: undefined, symmetric: true })
    expect(changed.features.at(-1)).not.toHaveProperty('endCondition')
    expect(changed.features.at(-1)).toMatchObject({ depth: -15, symmetric: true })
    expect(featureDependencyIds(changed.features.at(-1)!)).toEqual(['cut-profile'])
    expect(removeFeature(changed, plane.id).features.some(feature => feature.id === 'limited')).toBe(true)
    expect(parseDocument(serializeDocument(changed))).toEqual(changed)
  })

  it('requires every end-condition field and rejects unknown modes or extra fields', () => {
    for (const endCondition of modes) {
      for (const key of Object.keys(endCondition)) {
        const incomplete = { ...endCondition } as Record<string, unknown>
        delete incomplete[key]
        expect(() => documentWith({ ...limited(endCondition), endCondition: incomplete }), key).toThrow('endCondition')
      }
      expect(() => documentWith({ ...limited(endCondition), endCondition: { ...endCondition, index: 0 } })).toThrow('desconocido')
    }
    for (const endCondition of [null, true, 1, 'throughAll', [], {}, { kind: 'blind' }, { kind: 'upToVertex' }]) {
      expect(() => documentWith({ ...solid('invalid', 'cut-profile'), endCondition })).toThrow('endCondition')
    }
  })

  it('does not coerce booleans, identifiers or referenced geometry', () => {
    for (const endCondition of [
      { kind: 'throughAll', baseFeatureId: 'base', bothDirections: 1 },
      { kind: 'throughAll', baseFeatureId: 'base', bothDirections: 'false' },
      { kind: 'throughAll', baseFeatureId: '', bothDirections: false },
      { kind: 'untilNext', baseFeatureId: 'bad\nidentifier' },
      { kind: 'untilNext', baseFeatureId: 5 },
      { kind: 'untilNext', baseFeatureId: 'x'.repeat(129) },
      { kind: 'upToSurface', target: null },
      { kind: 'upToSurface', target: { kind: 'principal', plane: 'AB' } },
      { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY', planeId: plane.id } },
      { kind: 'upToSurface', target: { kind: 'plane' } },
      { kind: 'upToSurface', target: { kind: 'face', face: { ...face(), index: 0 } } },
      { kind: 'upToSurface', target: { kind: 'face', face: { key: face().key } } },
    ]) expect(() => documentWith({ ...solid('invalid', 'cut-profile'), endCondition })).toThrow('endCondition')
  })

  it('rejects malformed target face keys but does not resolve geometry while parsing', () => {
    for (const key of ['', 'face-v1|', 'face-v2|future', 'edge-v1|edge', 'face-v1|bad\nkey', `face-v1|${'x'.repeat(4096)}`]) {
      expect(() => documentWith(limited({ kind: 'upToSurface', target: { kind: 'face', face: face('base', key) } }))).toThrow('endCondition.target.face.key')
    }
  })

  it('requires signed depth to remain finite, nonzero and within the legacy limits in every mode', () => {
    for (const endCondition of modes) {
      for (const depth of [NaN, Infinity, -Infinity, 0, 0.001, -0.001, 100_001, -100_001, '12']) {
        expect(() => documentWith({ ...limited(endCondition), depth })).toThrow('depth')
      }
      for (const depth of [-100_000, -0.01, 0.01, 100_000]) {
        expect(documentWith({ ...limited(endCondition), depth }).features.at(-1)).toMatchObject({ depth })
      }
      for (const missing of ['depth', 'symmetric', 'sketchId']) {
        const feature = { ...limited(endCondition) } as Record<string, unknown>
        delete feature[missing]
        expect(() => documentWith(feature)).toThrow(missing)
      }
    }
  })

  it('rejects mid-plane with geometric termination instead of silently choosing one definition', () => {
    for (const endCondition of modes) {
      expect(() => documentWith({ ...limited(endCondition), symmetric: true })).toThrow('symmetric')
      expect(() => documentWith({ ...limited(endCondition), symmetric: 'false' })).toThrow('symmetric')
    }
  })
})

describe('extrusion end-condition dependencies and history', () => {
  it('requires an earlier solid base for through-all and next, including suppressed features', () => {
    for (const kind of ['throughAll', 'untilNext'] as const) {
      for (const baseFeatureId of ['missing', 'profile', plane.id, 'limited', 'later']) {
        const endCondition: ExtrudeEndCondition = kind === 'throughAll'
          ? { kind, baseFeatureId, bothDirections: true } : { kind, baseFeatureId }
        expect(() => documentWith({ ...limited(endCondition), suppressed: true }, solid('later'))).toThrow('endCondition.baseFeatureId')
      }
      const endCondition: ExtrudeEndCondition = kind === 'throughAll'
        ? { kind, baseFeatureId: 'base', bothDirections: false } : { kind, baseFeatureId: 'base' }
      // Structural validity permits a historical owner; the kernel checks the active body.
      expect(() => documentWith(solid('newer'), limited(endCondition))).not.toThrow()
    }
  })

  it('requires the correct earlier reference type for a surface target', () => {
    for (const planeId of ['missing', 'profile', 'base', 'limited', 'later']) {
      expect(() => documentWith(limited({ kind: 'upToSurface', target: { kind: 'plane', planeId } }), { ...plane, id: 'later' })).toThrow('endCondition.target.planeId')
    }
    for (const sourceFeatureId of ['missing', 'profile', plane.id, 'limited', 'later']) {
      expect(() => documentWith(limited({ kind: 'upToSurface', target: { kind: 'face', face: face(sourceFeatureId) } }), solid('later'))).toThrow('endCondition.target.face.sourceFeatureId')
    }
    // A face can belong to an older body snapshot, not only the current one.
    expect(() => documentWith(solid('newer'), limited({ kind: 'upToSurface', target: { kind: 'face', face: face() } }))).not.toThrow()
  })

  it('reports the sketch and explicit termination dependencies without changing the top-level base guard', () => {
    expect(featureDependencyIds(limited(modes[0]))).toEqual(['cut-profile', 'base'])
    expect(featureDependencyIds(limited(modes[2]))).toEqual(['cut-profile', 'base'])
    expect(featureDependencyIds(limited(modes[3]))).toEqual(['cut-profile'])
    expect(featureDependencyIds(limited(modes[4]))).toEqual(['cut-profile', plane.id])
    expect(featureDependencyIds(limited(modes[5]))).toEqual(['cut-profile', 'base'])
    for (const endCondition of modes) {
      expect(featureSketchIds(limited(endCondition))).toEqual(['cut-profile'])
      expect(hasBaseFeature(limited(endCondition))).toBe(false)
    }
    const ids = featureDependencyIds(limited(modes[0]))
    ids.push('external-mutation')
    expect(featureDependencyIds(limited(modes[0]))).toEqual(['cut-profile', 'base'])
  })

  const chain = (endCondition: ExtrudeEndCondition) => documentWith(
    limited(endCondition),
    { id: 'finish', name: 'Acabado', type: 'fillet', suppressed: false, baseFeatureId: 'limited', size: 1, selection: { mode: 'all' } },
    { ...sketch('child-profile'), support: { kind: 'face', face: face('finish') } },
    solid('child', 'child-profile'),
    sketch('independent'),
  )

  it('cascades removal of the explicit body, target plane or target face through dependent features', () => {
    for (const endCondition of modes.filter(mode => mode.kind !== 'upToSurface' || mode.target.kind !== 'principal')) {
      const owner = endCondition.kind !== 'upToSurface' ? 'base'
        : endCondition.target.kind === 'plane' ? plane.id : 'base'
      const initial = chain(endCondition)
      const remaining = removeFeature(initial, owner).features.map(feature => feature.id)
      expect(remaining).toEqual(owner === 'base'
        ? ['profile', plane.id, 'cut-profile', 'independent']
        : ['profile', 'base', 'cut-profile', 'independent'])
      expect(initial.features).toHaveLength(9)
    }
  })

  it('keeps suppressed bases and targets repairable without changing descendant flags or references', () => {
    for (const endCondition of modes.filter(mode => mode.kind !== 'upToSurface' || mode.target.kind !== 'principal')) {
      const owner = endCondition.kind !== 'upToSurface' ? 'base'
        : endCondition.target.kind === 'plane' ? plane.id : 'base'
      const initial = chain(endCondition)
      const suppressed = updateFeature(initial, owner, { suppressed: true })
      expect(suppressed.features.filter(feature => feature.suppressed).map(feature => feature.id)).toEqual([owner])
      const reopened = parseDocument(serializeDocument(suppressed))
      expect(reopened.features.find(feature => feature.id === 'limited')).toMatchObject({ endCondition })
      expect(updateFeature(reopened, owner, { suppressed: false }).features).toEqual(initial.features)
    }
  })

  it('removes an old termination dependency only after explicit reassignment', () => {
    const initial = chain({ kind: 'upToSurface', target: { kind: 'plane', planeId: plane.id } })
    const changed = updateFeature(initial, 'limited', { endCondition: { kind: 'upToSurface', target: { kind: 'face', face: face() } } })
    expect(removeFeature(changed, plane.id).features.some(feature => feature.id === 'child')).toBe(true)
    expect(removeFeature(changed, 'base').features.some(feature => feature.id === 'limited')).toBe(false)
    expect(initial.features.find(feature => feature.id === 'limited')).toMatchObject({ endCondition: { target: { kind: 'plane', planeId: plane.id } } })
  })

  it('undoes edits and deletion cascades while isolating nested termination references in snapshots', () => {
    const initial = chain({ kind: 'upToSurface', target: { kind: 'face', face: face() } })
    const history = new DocumentHistory(initial)
    const changed = history.apply(updateFeature(initial, 'limited', { depth: 25, endCondition: { kind: 'throughAll', baseFeatureId: 'base', bothDirections: true } }))
    history.apply(removeFeature(changed, 'base'))
    expect(history.undo()).toEqual(changed)
    const restored = history.undo()
    expect(restored).toEqual(initial)
    const operation = restored.features.find(feature => feature.id === 'limited') as ExtrudeFeature
    if (operation.endCondition?.kind !== 'upToSurface' || operation.endCondition.target.kind !== 'face') throw new Error('Expected a face target')
    operation.endCondition.target.face.key = 'face-v1|mutated-return'
    expect(history.current).toEqual(initial)
    expect(history.redo()).toEqual(changed)
    expect(history.redo().features.map(feature => feature.id)).toEqual(['profile', plane.id, 'cut-profile', 'independent'])
  })
})
