import { describe, expect, it } from 'vitest'
import type { ImportedSolidFeature, Feature, ReferencePlaneFeature, SketchFeature } from '../cad/kernel.types'
import { addFeature, createDemoDocument, createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'
import { featureDependencyIds, featureSketchIds, hasBaseFeature } from './featureInputs'
import { createStepSource, decodeStepSource } from './stepSource'

// Schema fixtures are opaque synthetic payloads, not evidence of STEP geometry.
function imported(id = 'import', text = 'synthetic source bytes'): ImportedSolidFeature {
  return { id, name: 'Sólido importado', type: 'importedSolid', suppressed: false, source: createStepSource(new TextEncoder().encode(text)) }
}

function sketch(id = 'independent-sketch'): SketchFeature {
  return { id, name: 'Croquis independiente', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 } }
}

const datum: ReferencePlaneFeature = {
  id: 'datum', name: 'Plano', type: 'plane', suppressed: false,
  support: { kind: 'principal', plane: 'XY' }, offset: 0, reversed: false,
}

function dependentFeatures(): Feature[] {
  return [
    imported(),
    { ...sketch('on-import'), support: { kind: 'face', face: { sourceFeatureId: 'import', key: 'face-v1|synthetic' } } },
    { id: 'boss', name: 'Saliente', type: 'extrude', suppressed: false, sketchId: 'on-import', depth: 2, symmetric: false },
    { id: 'fillet', name: 'Redondeo', type: 'fillet', suppressed: false, baseFeatureId: 'boss', size: 0.5, selection: { mode: 'all' } },
    { id: 'body-copy', name: 'Copia', type: 'linearPattern', suppressed: false, baseFeatureId: 'fillet',
      source: { mode: 'body', sourceFeatureId: 'import' }, first: { direction: [1, 0, 0], spacing: 30, count: 2 }, second: null, secondSeedOnly: false, skipped: [] },
    sketch(),
    { id: 'independent-solid', name: 'Saliente independiente', type: 'extrude', suppressed: false, sketchId: 'independent-sketch', depth: 4, symmetric: false },
  ]
}

describe('imported solid document contract', () => {
  it('round trips exact owned bytes and references in additive version 1, preserving old documents', () => {
    const document = validateDocument({ ...createDocument(), features: dependentFeatures() })
    const reopened = parseDocument(serializeDocument(document))
    expect(reopened).toEqual(document)
    expect(reopened.version).toBe(1)
    const source = reopened.features[0] as ImportedSolidFeature
    expect(decodeStepSource(source.source)).toEqual(new TextEncoder().encode('synthetic source bytes'))
    expect(source.source).not.toBe((document.features[0] as ImportedSolidFeature).source)
    const oldDocument = createDemoDocument()
    expect(parseDocument(serializeDocument(oldDocument))).toEqual(oldDocument)
  })

  it('allows sketches and principal planes before the first imported solid', () => {
    const document = validateDocument({ ...createDocument(), features: [datum, sketch(), imported()] })
    expect(document.features.map((feature) => feature.id)).toEqual(['datum', 'independent-sketch', 'import'])
    expect(featureSketchIds(document.features[2])).toEqual([])
    expect(featureDependencyIds(document.features[2])).toEqual([])
    expect(hasBaseFeature(document.features[2])).toBe(false)
  })

  it.each([false, true])('rejects an import after an earlier solid even if its suppressed flag is %s', (suppressed) => {
    const before = createDocument()
    const features: Feature[] = [sketch(), { id: 'earlier', name: 'Saliente', type: 'extrude', suppressed, sketchId: 'independent-sketch', depth: 4, symmetric: false }, imported()]
    const snapshot = structuredClone(features)
    expect(() => validateDocument({ ...before, features })).toThrow('primera operación sólida')
    expect(features).toEqual(snapshot)
    expect(before.features).toEqual([])
  })

  it.each([false, true])('rejects a second imported source including suppressed=%s', (suppressed) => {
    expect(() => validateDocument({ ...createDocument(), features: [imported(), { ...imported('second'), suppressed }] })).toThrow('solo se admite un sólido importado')
  })

  it('treats import source as content, while preserving historical repetition graph references', () => {
    const features = dependentFeatures()
    expect(featureDependencyIds(features[0])).toEqual([])
    expect(featureDependencyIds(features[4])).toEqual(['fillet', 'import'])
    const pattern: Feature = { id: 'feature-copy', name: 'Repetición', type: 'linearPattern', suppressed: false, baseFeatureId: 'import', source: { mode: 'features', geometryPattern: true, featureIds: ['import'] }, first: { direction: [1, 0, 0], spacing: 30, count: 2 }, second: null, secondSeedOnly: false, skipped: [] }
    expect(validateDocument({ ...createDocument(), features: [imported(), pattern] }).features).toHaveLength(2)
    const dependencies = featureDependencyIds(pattern)
    dependencies.push('outside mutation')
    expect(featureDependencyIds(pattern)).toEqual(['import'])
  })

  it('rejects extra source/feature fields and corrupted payloads even when suppressed', () => {
    const base = imported()
    for (const feature of [
      { ...base, filename: 'untrusted.step' },
      { ...base, source: { ...base.source, path: 'untrusted' } },
      { ...base, suppressed: true, source: { ...base.source, sha256: '0'.repeat(64) } },
      { ...base, source: { ...base.source, data: 'Zh==' } },
    ]) {
      expect(() => validateDocument({ ...createDocument(), features: [feature] })).toThrow()
    }
    expect(() => validateDocument({ ...createDocument(), features: [{ ...base, source: { ...base.source, sha256: '0'.repeat(64) } }] })).toThrow('Documento.features[0].source.sha256')
    expect(() => validateDocument({ ...createDocument(), features: [{ ...base, type: 'futureImportedSolid' }] })).toThrow('operación desconocida')
  })

  it('deletes source dependencies transitively while preserving independent features', () => {
    const document = validateDocument({ ...createDocument(), features: dependentFeatures() })
    const snapshot = structuredClone(document)
    expect(removeFeature(document, 'import').features.map((feature) => feature.id)).toEqual(['independent-sketch', 'independent-solid'])
    expect(document).toEqual(snapshot)
    // Deleting a downstream operation cannot remove the owned base source.
    expect(removeFeature(document, 'boss').features.map((feature) => feature.id)).toEqual(['import', 'on-import', 'independent-sketch', 'independent-solid'])
  })

  it('suppresses and restores the source without discarding bytes or rewriting downstream references', () => {
    const document = validateDocument({ ...createDocument(), features: dependentFeatures() })
    const suppressed = updateFeature(document, 'import', { suppressed: true })
    expect(suppressed.features[0]).toEqual({ ...document.features[0], suppressed: true })
    expect(suppressed.features.slice(1)).toEqual(document.features.slice(1))
    expect(updateFeature(suppressed, 'import', { suppressed: false }).features).toEqual(document.features)
    expect(document.features[0].suppressed).toBe(false)
  })

  it('restores original content and IDs through source replacement, undo/redo and reopen', () => {
    const initial = validateDocument({ ...createDocument(), features: dependentFeatures() })
    const history = new DocumentHistory(initial)
    const replacement = imported('unused', 'different source bytes').source
    history.apply(updateFeature(history.current, 'import', { source: replacement }))
    expect((history.current.features[0] as ImportedSolidFeature).source).toEqual(replacement)
    expect(history.current.features.slice(1)).toEqual(initial.features.slice(1))
    expect(history.undo()).toEqual(initial)
    const redo = history.redo()
    expect((parseDocument(serializeDocument(redo)).features[0] as ImportedSolidFeature).source).toEqual(replacement)
    const returned = history.current.features[0] as ImportedSolidFeature
    returned.source.data = 'outside mutation'
    expect((history.current.features[0] as ImportedSolidFeature).source).toEqual(replacement)
  })

  it('rejects invalid edits atomically and preserves a valid redo branch', () => {
    const initial = addFeature(createDocument(), imported())
    const history = new DocumentHistory(initial)
    history.apply(updateFeature(initial, 'import', { suppressed: true }))
    history.undo()
    const snapshot = history.current
    expect(() => history.apply({ ...snapshot, features: [{ ...imported(), source: { ...imported().source, sha256: '0'.repeat(64) } }] })).toThrow('SHA-256')
    expect(() => addFeature(snapshot, imported('second'))).toThrow('solo se admite')
    expect(history.current).toEqual(snapshot)
    expect(history.canRedo).toBe(true)
    expect(history.redo().features[0].suppressed).toBe(true)
  })
})
