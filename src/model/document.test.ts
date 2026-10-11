import { describe, expect, it } from 'vitest'
import type { EdgeFinishFeature, Feature, SketchFeature } from '../cad/kernel.types'
import { addFeature, createDemoDocument, createDocument, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document'

function sketch(id = 'sketch-1'): SketchFeature {
  return { id, name: 'Croquis', type: 'sketch', plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [0, 0], width: 100, height: 70 }, suppressed: false }
}

function extrusion(sketchId = 'sketch-1'): Feature {
  return { id: 'extrude-1', name: 'Saliente', type: 'extrude', sketchId, depth: 12, symmetric: false, suppressed: false }
}

function finish(id = 'fillet-1', baseFeatureId = 'extrude-1'): EdgeFinishFeature {
  return {
    id, name: 'Redondeo', type: 'fillet', suppressed: false, size: 2, baseFeatureId,
    selection: { mode: 'selected', edges: [{ sourceFeatureId: baseFeatureId, key: 'edge-v1|fixture-stable-geometric-key' }] },
  }
}

function finishedDocument() {
  return addFeature(addFeature(addFeature(createDocument(), sketch()), extrusion()), finish())
}

describe('native document persistence', () => {
  it('round trips the editable demonstration including all four holes', () => {
    const document = createDemoDocument()
    expect(parseDocument(serializeDocument(document))).toEqual(document)
    expect(document.features.filter((item) => item.type === 'cut')).toHaveLength(4)
    expect(new Set(document.features.map((item) => item.id)).size).toBe(document.features.length)
  })

  it('rejects corrupted JSON, unsupported versions and unexpected fields', () => {
    expect(() => parseDocument('{broken')).toThrow('JSON')
    expect(() => validateDocument({ ...createDocument(), version: 2 })).toThrow('versión')
    expect(() => validateDocument({ ...createDocument(), units: 'in' })).toThrow('milímetros')
    expect(() => validateDocument({ ...createDocument(), script: 'untrusted' })).toThrow('campo desconocido')
  })

  it.each([NaN, Infinity, -Infinity, -1, 0, 1_000_000])('rejects invalid dimensions: %s', (width) => {
    const invalid = { ...sketch(), profile: { kind: 'rectangle', center: [0, 0], width, height: 70 } }
    expect(() => validateDocument({ ...createDocument(), features: [invalid] })).toThrow('width')
  })

  it('rejects non-finite centers, invalid planes and invalid feature depth', () => {
    expect(() => validateDocument({ ...createDocument(), features: [{ ...sketch(), profile: { kind: 'circle', center: [Infinity, 0], radius: 5 } }] })).toThrow('center')
    expect(() => validateDocument({ ...createDocument(), features: [{ ...sketch(), plane: 'AB' }] })).toThrow('plane')
    expect(() => validateDocument({ ...createDocument(), features: [sketch(), { ...extrusion(), depth: 0 }] })).toThrow('depth')
    expect(() => validateDocument({ ...createDocument(), features: [sketch(), { ...extrusion(), depth: 0.001 }] })).toThrow('depth')
    expect(() => validateDocument({ ...createDocument(), features: [sketch(), { ...extrusion(), depth: -10 }] })).not.toThrow()
  })

  it('rejects dangling references, later sketches and duplicate feature ids', () => {
    expect(() => validateDocument({ ...createDocument(), features: [extrusion()] })).toThrow('croquis anterior')
    expect(() => validateDocument({ ...createDocument(), features: [extrusion(), sketch()] })).toThrow('croquis anterior')
    expect(() => validateDocument({ ...createDocument(), features: [sketch(), sketch()] })).toThrow('duplicado')
  })

  it('returns detached objects without trusting input reference ownership', () => {
    const original = addFeature(createDocument(), sketch())
    const copy = validateDocument(original)
    const first = copy.features[0] as SketchFeature
    if (first.profile.kind === 'entities') throw new Error('Expected the legacy fixture')
    first.profile.center[0] = 999
    expect(original.features[0]).toMatchObject({ profile: { center: [0, 0] } })
  })

  it('rejects impossible dates and timestamps preceding creation', () => {
    expect(() => validateDocument({ ...createDocument(), createdAt: '2026-02-30T00:00:00.000Z' })).toThrow('fecha')
    expect(() => validateDocument({ ...createDocument(), updatedAt: '2000-01-01T00:00:00.000Z' })).toThrow('anterior')
  })
})

describe('feature editing', () => {
  it('updates a dimension without mutating the previous document', () => {
    const original = addFeature(addFeature(createDocument(), sketch()), extrusion())
    const updated = updateFeature(original, 'extrude-1', { depth: 24 })
    expect(updated.features[1]).toMatchObject({ depth: 24 })
    expect(original.features[1]).toMatchObject({ depth: 12 })
    expect(() => updateFeature(original, 'extrude-1', { id: 'new-id' })).toThrow('identificador')
    expect(() => updateFeature(original, 'extrude-1', { type: 'cut' })).toThrow('tipo')
  })

  it('removes all operations depending on a deleted sketch, retaining unrelated features', () => {
    let document = addFeature(createDocument(), sketch())
    document = addFeature(document, extrusion())
    document = addFeature(document, { id: 'revolve-1', name: 'Revolución', type: 'revolve', sketchId: 'sketch-1', angle: 360, suppressed: false })
    document = addFeature(document, sketch('sketch-2'))
    const removed = removeFeature(document, 'sketch-1')
    expect(removed.features.map((item) => item.id)).toEqual(['sketch-2'])
    expect(document.features).toHaveLength(4)
  })

  it('retains the source sketch when deleting an extrusion', () => {
    const document = addFeature(addFeature(createDocument(), sketch()), extrusion())
    expect(removeFeature(document, 'extrude-1').features.map((item) => item.id)).toEqual(['sketch-1'])
  })
})

describe('document history', () => {
  it('undoes and redoes geometry edits, then discards the old redo branch', () => {
    const initial = addFeature(addFeature(createDocument(), sketch()), extrusion())
    const history = new DocumentHistory(initial)
    expect(history.canUndo).toBe(false)
    history.apply(updateFeature(initial, 'extrude-1', { depth: 24 }))
    expect(history.undo()).toEqual(initial)
    expect(history.canRedo).toBe(true)
    expect(history.redo().features[1]).toMatchObject({ depth: 24 })
    history.undo()
    history.apply(updateFeature(history.current, 'extrude-1', { depth: 36 }))
    expect(history.canRedo).toBe(false)
    expect(history.redo().features[1]).toMatchObject({ depth: 36 })
    expect(history.undo()).toEqual(initial)
  })

  it('isolates snapshots, bounds history and resets cleanly', () => {
    const initial = createDocument()
    const history = new DocumentHistory(initial, 1)
    initial.name = 'Mutated outside'
    const first = history.apply(addFeature(history.current, sketch()))
    first.name = 'Mutated return value'
    history.apply(addFeature(history.current, extrusion()))
    expect(history.undo().features).toHaveLength(1)
    expect(history.canUndo).toBe(false)
    expect(history.current.name).toBe('Pieza sin título')
    const reset = createDocument('Nueva')
    history.reset(reset)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
    expect(history.current).toEqual(reset)
  })

  it('leaves history intact when an invalid next document is rejected', () => {
    const history = new DocumentHistory(createDocument())
    history.apply(addFeature(history.current, sketch()))
    history.undo()
    expect(() => history.apply({ ...history.current, features: [extrusion()] })).toThrow('croquis anterior')
    expect(history.canRedo).toBe(true)
    expect(history.redo().features).toHaveLength(1)
  })
})

describe('edge finish persistence and dependencies', () => {
  it('preserves 0.1 documents and round trips selected and all-edge finishes in version 1', () => {
    const oldDocument = createDemoDocument()
    expect(parseDocument(serializeDocument(oldDocument))).toEqual(oldDocument)
    const document = addFeature(finishedDocument(), {
      ...finish('chamfer-1', 'fillet-1'), type: 'chamfer', selection: { mode: 'all' },
    })
    expect(document.version).toBe(1)
    expect(parseDocument(serializeDocument(document))).toEqual(document)
  })

  it('rejects missing, sketch, forward and self base references', () => {
    for (const baseFeatureId of ['missing', 'sketch-1', 'fillet-1', 'later']) {
      expect(() => validateDocument({ ...createDocument(), features: [sketch(), extrusion(), finish('fillet-1', baseFeatureId), { ...extrusion(), id: 'later' }] })).toThrow('operación sólida anterior')
    }
  })

  it('rejects references to another source and duplicate or empty edge selections', () => {
    const document = finishedDocument()
    expect(() => updateFeature(document, 'fillet-1', {
      selection: { mode: 'selected', edges: [{ sourceFeatureId: 'other', key: 'edge-v1|fixture' }] },
    })).toThrow('operación base')
    const edge = { sourceFeatureId: 'extrude-1', key: 'edge-v1|fixture' }
    expect(() => updateFeature(document, 'fillet-1', { selection: { mode: 'selected', edges: [edge, edge] } })).toThrow('duplicada')
    expect(() => updateFeature(document, 'fillet-1', { selection: { mode: 'selected', edges: [] } })).toThrow('selecciona')
  })

  it.each(['', 'edge-v0|obsolete', 'edge-v1|', 'edge-v1|line\ninvalid', `edge-v1|${'x'.repeat(4096)}`])('rejects malformed edge reference %s', (key) => {
    expect(() => updateFeature(finishedDocument(), 'fillet-1', {
      selection: { mode: 'selected', edges: [{ sourceFeatureId: 'extrude-1', key }] },
    })).toThrow()
  })

  it.each([NaN, Infinity, -2, 0, 0.001, 100_001])('rejects invalid finishing size %s', (size) => {
    expect(() => updateFeature(finishedDocument(), 'fillet-1', { size })).toThrow('size')
  })

  it('retains suppressed dependencies so the feature tree can be saved and reactivated', () => {
    const document = updateFeature(finishedDocument(), 'extrude-1', { suppressed: true })
    expect(parseDocument(serializeDocument(document)).features).toHaveLength(3)
  })

  it('removes dependent finishes transitively after deleting a solid or its sketch', () => {
    let document = addFeature(finishedDocument(), finish('fillet-2', 'fillet-1'))
    document = addFeature(document, sketch('unrelated-sketch'))
    expect(removeFeature(document, 'extrude-1').features.map((item) => item.id)).toEqual(['sketch-1', 'unrelated-sketch'])
    expect(removeFeature(document, 'sketch-1').features.map((item) => item.id)).toEqual(['unrelated-sketch'])
    expect(removeFeature(document, 'fillet-1').features.map((item) => item.id)).toEqual(['sketch-1', 'extrude-1', 'unrelated-sketch'])
  })

  it('isolates nested selections and restores their references through undo and redo', () => {
    const document = finishedDocument()
    const history = new DocumentHistory(document)
    const edited = updateFeature(document, 'fillet-1', { selection: { mode: 'all' } })
    history.apply(edited)
    const restored = history.undo()
    expect(restored).toEqual(document)
    const item = restored.features[2] as EdgeFinishFeature
    if (item.selection.mode === 'selected') item.selection.edges[0].key = 'edge-v1|mutated-copy'
    expect(history.current).toEqual(document)
    expect(history.redo()).toEqual(edited)
  })
})
