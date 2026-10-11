import { describe, expect, it } from 'vitest'
import type { CircularPatternFeature, ExtrudeFeature, Feature, LinearPatternFeature, MirrorFeature, PatternSource, ReferencePlaneFeature, SketchFeature } from '../cad/kernel.types'
import { createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'
import { featureDependencyIds, featureSketchIds } from './featureInputs'

const featureSource = (...featureIds: string[]): PatternSource => ({ mode: 'features', geometryPattern: true, featureIds })
const bodySource = (sourceFeatureId: string): PatternSource => ({ mode: 'body', sourceFeatureId })
const sketch = (id: string): SketchFeature => ({
  id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
  profile: { kind: 'circle', center: [0, 0], radius: 5 },
})
const solid = (id: string, sketchId = 'profile'): ExtrudeFeature => ({ id, name: id, type: 'extrude', suppressed: false, sketchId, depth: 10, symmetric: false })
const plane: ReferencePlaneFeature = { id: 'plane', name: 'Plano', type: 'plane', suppressed: false, support: { kind: 'principal', plane: 'YZ' }, offset: 20, reversed: false }
const seedFeatures: Feature[] = [sketch('profile'), solid('base'), sketch('cut-profile'), { ...solid('seed', 'cut-profile'), type: 'cut' }, plane]
const linear = (): LinearPatternFeature => ({
  id: 'linear', name: 'Matriz lineal', type: 'linearPattern', suppressed: false,
  baseFeatureId: 'seed', source: featureSource('seed'),
  first: { direction: [-2, 0, 0], count: 3, spacing: 15 },
  second: { direction: [0, 3, 0], count: 2, spacing: 20 }, secondSeedOnly: false, skipped: [[2, 1], [1, 0]],
})
const circular = (): CircularPatternFeature => ({
  id: 'circular', name: 'Matriz circular', type: 'circularPattern', suppressed: false,
  baseFeatureId: 'seed', source: bodySource('base'),
  axis: { origin: [-10, 20, 5], direction: [0, 0, -2] }, count: 6, angle: 240, equalSpacing: false, reversed: true, skipped: [4, 1],
})
const mirror = (): MirrorFeature => ({
  id: 'mirror', name: 'Simetría', type: 'mirror', suppressed: false,
  baseFeatureId: 'seed', source: featureSource('seed', 'base'), support: { kind: 'plane', planeId: 'plane' }, mergeBodies: false,
})
const documentWith = (...features: unknown[]) => validateDocument({ ...createDocument(), features: [...seedFeatures, ...features] })

describe('pattern and mirror persistence', () => {
  it('round trips feature geometry mode, body mode, directions and stable skip addresses without normalizing them', () => {
    const document = documentWith(linear(), circular(), mirror())
    expect(document.version).toBe(1)
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    expect(document.features[5]).toEqual(linear())
    expect(document.features[6]).toEqual(circular())
    const copied = validateDocument(document)
    const item = copied.features[5] as LinearPatternFeature
    item.first.direction[0] = 999
    item.skipped[0][0] = 1
    if (item.source.mode === 'features') item.source.featureIds[0] = 'changed'
    const circle = copied.features[6] as CircularPatternFeature
    circle.axis.origin[0] = 99
    circle.skipped.reverse()
    expect(document.features[5]).toEqual(linear())
    expect(document.features[6]).toEqual(circular())
  })

  it('keeps older documents without injecting new fields or changing existing sketch consumption', () => {
    const original = validateDocument({ ...createDocument(), features: seedFeatures })
    expect(parseDocument(serializeDocument(original))).toEqual(original)
    expect(featureSketchIds(linear())).toEqual([])
    expect(featureSketchIds(circular())).toEqual([])
    expect(featureSketchIds(mirror())).toEqual([])
    expect(featureSketchIds(seedFeatures[1])).toEqual(['profile'])
  })

  it('requires every contract field and rejects unknown fields at each nested boundary', () => {
    for (const fixture of [linear(), circular(), mirror()]) {
      for (const field of Object.keys(fixture)) {
        const changed = { ...fixture } as Record<string, unknown>
        delete changed[field]
        expect(() => documentWith(changed), field).toThrow()
      }
      expect(() => documentWith({ ...fixture, unrecognized: true })).toThrow('desconocido')
    }
    for (const changed of [
      { ...linear(), first: { ...linear().first, reverse: true } },
      { ...linear(), second: { ...linear().second, reverse: true } },
      { ...circular(), axis: { ...circular().axis, reference: 'unused' } },
      { ...mirror(), support: { kind: 'plane', planeId: 'plane', offset: 10 } },
      { ...linear(), source: { mode: 'features', geometryPattern: true, featureIds: ['seed'], sourceFeatureId: 'base' } },
      { ...circular(), source: { mode: 'body', sourceFeatureId: 'base', geometryPattern: true } },
    ]) expect(() => documentWith(changed)).toThrow('desconocido')
  })

  it('requires explicit exact geometry mode and does not conflate feature and body copying', () => {
    for (const source of [
      { mode: 'features', featureIds: ['seed'] },
      { mode: 'features', geometryPattern: false, featureIds: ['seed'] },
      { mode: 'features', geometryPattern: 1, featureIds: ['seed'] },
      { mode: 'body' }, { mode: 'faces', featureIds: ['seed'] },
    ]) expect(() => documentWith({ ...linear(), source })).toThrow()
    expect(() => documentWith({ ...mirror(), mergeBodies: true })).toThrow('solo se aplica al modo cuerpo')
    expect(documentWith({ ...mirror(), source: bodySource('base'), mergeBodies: true }).features[5]).toMatchObject({ mergeBodies: true })
  })

  it('accepts principal, reference-plane and historical-face mirror supports', () => {
    for (const support of [
      { kind: 'principal', plane: 'XY' },
      { kind: 'plane', planeId: 'plane' },
      { kind: 'face', face: { sourceFeatureId: 'base', key: 'face-v1|lost-but-repairable' } },
    ]) expect(documentWith({ ...mirror(), support }).features[5]).toMatchObject({ support })
  })

  it('rejects nonboolean switches and malformed vectors instead of coercing values', () => {
    for (const fixture of [
      { ...linear(), secondSeedOnly: 1 }, { ...circular(), equalSpacing: 'false' },
      { ...circular(), reversed: 0 }, { ...mirror(), mergeBodies: null },
    ]) expect(() => documentWith(fixture)).toThrow()
    for (const direction of [[0, 0, 0], [1, 2], [1, 2, 3, 4], [Infinity, 0, 0], [1_000_001, 0, 0], ['1', 0, 0], new Array(3)]) {
      expect(() => documentWith({ ...linear(), first: { ...linear().first, direction } })).toThrow('direction')
      expect(() => documentWith({ ...circular(), axis: { ...circular().axis, direction } })).toThrow('direction')
    }
    expect(() => documentWith({ ...circular(), axis: { origin: [0, NaN, 0], direction: [1, 0, 0] } })).toThrow('origin')
    expect(() => documentWith({ ...circular(), axis: { origin: [0, -1_000_000, 1_000_000], direction: [1_000_000, 0, 0] } })).not.toThrow()
  })
})

describe('pattern bounds and omissions', () => {
  it('bounds counts, spacing and angle while accepting signed non-unit directions', () => {
    for (const count of [0, 1.5, 257, NaN, Infinity]) {
      expect(() => documentWith({ ...linear(), first: { ...linear().first, count } })).toThrow('count')
      expect(() => documentWith({ ...circular(), count })).toThrow('count')
    }
    expect(() => documentWith({ ...circular(), count: 1 })).toThrow('count')
    for (const spacing of [0, 0.001, -10, 100_001, NaN]) expect(() => documentWith({ ...linear(), first: { ...linear().first, spacing } })).toThrow('spacing')
    for (const angle of [0, -10, 360.1, Infinity, '90']) expect(() => documentWith({ ...circular(), angle })).toThrow('angle')
    for (const spacing of [0.01, 100_000]) expect(() => documentWith({ ...linear(), first: { ...linear().first, spacing } })).not.toThrow()
    expect(() => documentWith({ ...circular(), count: 256, angle: 360, skipped: [] })).not.toThrow()
  })

  it('counts a grid or seed-only cross including its original seed', () => {
    const first = { direction: [1, 0, 0], spacing: 10, count: 16 }
    const second = { direction: [0, 1, 0], spacing: 10, count: 16 }
    expect(() => documentWith({ ...linear(), first, second, skipped: [] })).not.toThrow()
    expect(() => documentWith({ ...linear(), first: { ...first, count: 17 }, second, skipped: [] })).toThrow('256 instancias')
    expect(() => documentWith({ ...linear(), first: { ...first, count: 128 }, second: { ...second, count: 129 }, secondSeedOnly: true, skipped: [] })).not.toThrow()
    expect(() => documentWith({ ...linear(), first: { ...first, count: 129 }, second: { ...second, count: 129 }, secondSeedOnly: true, skipped: [] })).toThrow('256 instancias')
    expect(() => documentWith({ ...linear(), first: { ...first, count: 1 }, second: null, skipped: [] })).toThrow('2 y 256')
    expect(() => documentWith({ ...linear(), first: { ...first, count: 1 }, second: { ...second, count: 2 }, skipped: [] })).not.toThrow()
    expect(() => documentWith({ ...linear(), first: { ...first, count: 2 }, second: null, secondSeedOnly: true, skipped: [] })).not.toThrow()
  })

  it('rejects omitted seeds, duplicates, holes, fractions and out-of-range linear addresses', () => {
    for (const skipped of [[[0, 0]], [[3, 0]], [[1, 2]], [[1.5, 0]], [[1, 0], [1, 0]], [[1]], [[1, 0, 0]], new Array(1)]) {
      expect(() => documentWith({ ...linear(), skipped })).toThrow('skipped')
    }
    expect(() => documentWith({ ...linear(), second: null, skipped: [[0, 1]] })).toThrow('skipped')
    expect(() => documentWith({ ...linear(), secondSeedOnly: true, skipped: [[1, 1]] })).toThrow('no existe')
    expect(() => documentWith({ ...linear(), secondSeedOnly: true, skipped: [[2, 0], [0, 1]] })).not.toThrow()
    expect(() => documentWith({ ...linear(), first: { ...linear().first, count: 2 }, second: null, skipped: [[1, 0]] })).toThrow('todas las copias')
  })

  it('rejects invalid circular omissions and refuses to erase exclusions when reducing count', () => {
    for (const skipped of [[0], [-1], [6], [1.5], [2, 2], new Array(1)]) {
      expect(() => documentWith({ ...circular(), skipped })).toThrow('skipped')
    }
    expect(() => documentWith({ ...circular(), count: 3, skipped: [1, 2] })).toThrow('todas las copias')
    const initial = documentWith(linear(), circular())
    expect(() => updateFeature(initial, 'linear', { first: { ...linear().first, count: 2 } })).toThrow('skipped')
    expect(() => updateFeature(initial, 'circular', { count: 4 })).toThrow('skipped')
    expect(initial.features[5]).toEqual(linear())
    expect(initial.features[6]).toEqual(circular())
  })

  it('bounds unique seeds and the total effective applications after omissions', () => {
    const seeds = Array.from({ length: 33 }, (_, index) => solid(`seed-${index}`))
    const source = featureSource(...seeds.slice(0, 32).map((seed) => seed.id))
    expect(() => documentWith(...seeds, { ...linear(), source, first: { ...linear().first, count: 17 }, second: null, skipped: [] })).not.toThrow() // 16 × 32 = 512.
    expect(() => documentWith(...seeds, { ...linear(), source, first: { ...linear().first, count: 18 }, second: null, skipped: [] })).toThrow('512 aplicaciones')
    expect(() => documentWith(...seeds, { ...linear(), source, first: { ...linear().first, count: 18 }, second: null, skipped: [[2, 0]] })).not.toThrow()
    expect(() => documentWith(...seeds, { ...circular(), source, count: 18, skipped: [] })).toThrow('512 aplicaciones')
    expect(() => documentWith(...seeds, { ...circular(), source, count: 18, skipped: [2] })).not.toThrow()
    for (const featureIds of [[], ['seed', 'seed'], ['bad\nID'], [''], new Array(1), seeds.map((seed) => seed.id)]) {
      expect(() => documentWith(...seeds, { ...linear(), source: { mode: 'features', geometryPattern: true, featureIds } })).toThrow('source.featureIds')
    }
  })
})

describe('pattern references and graph history', () => {
  it('requires every base and seed to be an earlier solid, even when the repetition is suppressed', () => {
    for (const id of ['missing', 'profile', 'plane', 'linear', 'later']) {
      expect(() => documentWith({ ...linear(), baseFeatureId: id, suppressed: true }, solid('later'))).toThrow('baseFeatureId')
      expect(() => documentWith({ ...linear(), source: featureSource(id), suppressed: true }, solid('later'))).toThrow('source.featureIds[0]')
      expect(() => documentWith({ ...linear(), source: bodySource(id), suppressed: true }, solid('later'))).toThrow('source.sourceFeatureId')
    }
    // Immediacy and geometric support are kernel checks, not schema rules.
    expect(() => documentWith({ ...linear(), baseFeatureId: 'base' })).not.toThrow()
    expect(() => documentWith(linear(), { ...circular(), baseFeatureId: 'linear', source: featureSource('linear') })).not.toThrow()
  })

  it('requires typed, earlier mirror supports and preserves stale face keys for correction', () => {
    for (const planeId of ['missing', 'base', 'profile', 'mirror', 'later']) {
      expect(() => documentWith({ ...mirror(), support: { kind: 'plane', planeId } }, { ...plane, id: 'later' })).toThrow('support.planeId')
    }
    for (const sourceFeatureId of ['missing', 'profile', 'plane', 'mirror', 'later']) {
      expect(() => documentWith({ ...mirror(), support: { kind: 'face', face: { sourceFeatureId, key: 'face-v1|stored' } } }, solid('later'))).toThrow('support.face.sourceFeatureId')
    }
  })

  it('reports direct dependencies once and distinguishes seeds from consumed sketches', () => {
    expect(featureDependencyIds(linear())).toEqual(['seed'])
    expect(featureDependencyIds(circular())).toEqual(['seed', 'base'])
    expect(featureDependencyIds(mirror())).toEqual(['seed', 'base', 'plane'])
    expect(featureDependencyIds({ ...mirror(), support: { kind: 'face', face: { sourceFeatureId: 'base', key: 'face-v1|stored' } } })).toEqual(['seed', 'base'])
  })

  function graph() {
    return documentWith(
      linear(),
      { ...circular(), baseFeatureId: 'linear', source: featureSource('linear') },
      { ...mirror(), baseFeatureId: 'circular', source: bodySource('circular'), support: { kind: 'face', face: { sourceFeatureId: 'linear', key: 'face-v1|stored' } }, mergeBodies: true },
      { ...plane, id: 'pattern-plane', support: { kind: 'face', face: { sourceFeatureId: 'mirror', key: 'face-v1|stored' } } },
      { ...sketch('face-sketch'), support: { kind: 'plane', planeId: 'pattern-plane' } }, solid('child', 'face-sketch'),
      { ...sketch('independent'), plane: 'YZ' },
    )
  }

  it('cascades from seed/base through patterns, mirrored faces, planes, sketches and later solids', () => {
    const original = graph()
    expect(removeFeature(original, 'seed').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'cut-profile', 'plane', 'independent'])
    expect(removeFeature(original, 'linear').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'cut-profile', 'seed', 'plane', 'independent'])
    expect(removeFeature(original, 'pattern-plane').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'cut-profile', 'seed', 'plane', 'linear', 'circular', 'mirror', 'independent'])
    expect(original.features).toHaveLength(12)
  })

  it('cascades when only a historical seed or mirror plane was removed, not its body base', () => {
    const original = documentWith(
      { ...linear(), source: featureSource('base') },
      { ...mirror(), baseFeatureId: 'linear', source: bodySource('seed') },
    )
    expect(removeFeature(original, 'base').features.map((feature) => feature.id)).toEqual(['profile', 'cut-profile', 'seed', 'plane'])
    expect(removeFeature(original, 'plane').features.map((feature) => feature.id)).toEqual(['profile', 'base', 'cut-profile', 'seed', 'linear'])
  })

  it('preserves suppression flags and restores sources, skips and support references through undo/redo', () => {
    const original = graph()
    const history = new DocumentHistory(original)
    history.apply(updateFeature(original, 'seed', { suppressed: true }))
    expect(history.current.features.filter((feature) => feature.suppressed).map((feature) => feature.id)).toEqual(['seed'])
    history.apply(removeFeature(history.current, 'linear'))
    const removed = history.current
    expect(history.undo().features.map((feature) => feature.id)).toEqual(original.features.map((feature) => feature.id))
    expect(history.undo()).toEqual(original)
    expect(history.redo().features[3].suppressed).toBe(true)
    expect(history.redo()).toEqual(removed)
    history.undo()
    expect(parseDocument(serializeDocument(history.current)).features[5]).toEqual(linear())
  })
})
