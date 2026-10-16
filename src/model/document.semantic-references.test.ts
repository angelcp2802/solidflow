import { describe, expect, it } from 'vitest'
import type { DraftFeature, EdgeFinishFeature, EdgeReference, ExtrudeFeature, FaceReference, HoleFeature, ReferencePlaneFeature, ShellFeature, SketchFeature } from '../cad/kernel.types'
import { DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from './document'

// Original in-memory model fixtures in mm. The literal keys exercise persistence
// syntax only; these tests make no claim about native targets or CAD validity.
const FACE_V2 = `face-v2|${'a'.repeat(64)}`
const EDGE_V2 = `edge-v2|${'b'.repeat(64)}`
const FACE_V1 = 'face-v1|Original opaque cap payload|legacy'
const EDGE_V1 = 'edge-v1|Original opaque rim payload|legacy'
const SOURCE = 'source-solid'

function sketch(): SketchFeature {
  return {
    id: 'source-sketch', name: 'Original 10 by 6 sketch', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'entities', points: [
      { id: 'p0', x: 0, y: 0 }, { id: 'p1', x: 10, y: 0 },
      { id: 'p2', x: 10, y: 6 }, { id: 'p3', x: 0, y: 6 },
    ], entities: [
      { id: 'bottom', type: 'line', construction: false, start: 'p0', end: 'p1' },
      { id: 'right', type: 'line', construction: false, start: 'p1', end: 'p2' },
      { id: 'top', type: 'line', construction: false, start: 'p2', end: 'p3' },
      { id: 'left', type: 'line', construction: false, start: 'p3', end: 'p0' },
    ], constraints: [] },
  }
}
const solid = (id = SOURCE): ExtrudeFeature => ({ id, name: 'Original 4 mm extrusion', type: 'extrude', suppressed: false, sketchId: 'source-sketch', depth: 4, symmetric: false })
const edge = (key = EDGE_V2, sourceFeatureId = SOURCE): EdgeReference => ({ sourceFeatureId, key })
const face = (key = FACE_V2, sourceFeatureId = SOURCE): FaceReference => ({ sourceFeatureId, key })
const finish = (key = EDGE_V2, baseFeatureId = SOURCE): EdgeFinishFeature => ({
  id: 'finish', name: 'Stored rim selection', type: 'fillet', suppressed: false, baseFeatureId, size: 1,
  selection: { mode: 'selected', edges: [edge(key, baseFeatureId)] },
})
const facePlane = (key = FACE_V2, sourceFeatureId = SOURCE): ReferencePlaneFeature => ({
  id: 'face-plane', name: 'Stored cap support', type: 'plane', suppressed: false,
  support: { kind: 'face', face: face(key, sourceFeatureId) }, offset: 0, reversed: false,
})
const shell = (keys = [FACE_V2]): ShellFeature => ({
  id: 'shell', name: 'Stored removed faces', type: 'shell', suppressed: false, baseFeatureId: SOURCE,
  thickness: 1, direction: 'inward', removedFaces: keys.map(key => face(key)),
})
const draft = (keys = [FACE_V2]): DraftFeature => ({
  id: 'draft', name: 'Stored drafted faces', type: 'draft', suppressed: false, baseFeatureId: SOURCE,
  support: { kind: 'principal', plane: 'XY' }, angle: 5, reversed: false, propagation: 'tangent', faces: keys.map(key => face(key)),
})
const hole = (): HoleFeature => ({
  id: 'hole', name: 'Stored hole support', type: 'hole', suppressed: false, baseFeatureId: SOURCE,
  support: { kind: 'face', face: face() }, positions: [{ id: 'hole-position', x: 2, y: 2 }],
  reversed: false, diameter: 1, head: { kind: 'simple' },
  endCondition: { kind: 'blind', depth: 1, depthReference: 'tip', tip: { kind: 'flat' } },
})
function input(extra: unknown[], sourceId = SOURCE) {
  return { version: 1, id: 'original-reference-document', name: 'Original reference model', units: 'mm',
    features: [sketch(), solid(sourceId), ...extra], createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' }
}
const documentWith = (...extra: unknown[]): Document => validateDocument(input(extra))
function selectedEdges(document: Document): EdgeReference[] {
  const feature = document.features.find(feature => feature.id === 'finish')
  if (!feature || (feature.type !== 'fillet' && feature.type !== 'chamfer') || feature.selection.mode !== 'selected') throw new Error('Expected selected finish')
  return feature.selection.edges
}
function supportedFace(document: Document): FaceReference {
  const feature = document.features.find(feature => feature.id === 'face-plane')
  if (feature?.type !== 'plane' || feature.support.kind !== 'face') throw new Error('Expected face-supported plane')
  return feature.support.face
}

describe('versioned CAD references in version-1 documents', () => {
  it('round trips mixed v1/v2 references and source identities without migration or native resolution', () => {
    const original = documentWith(
      finish(), facePlane(), shell([FACE_V1, FACE_V2]), draft(), hole(),
      { ...finish(EDGE_V1), id: 'legacy-finish', type: 'chamfer' },
      { ...facePlane(FACE_V1), id: 'legacy-plane' },
      { ...sketch(), id: 'supported-sketch', support: { kind: 'face', face: face() } },
    )
    const serialized = serializeDocument(original), reopened = parseDocument(serialized)
    expect(reopened).toEqual(original)
    expect(reopened.version).toBe(1)
    expect(serializeDocument(reopened)).toBe(serialized)
    expect(reopened.features[0]).toEqual(sketch())
    expect(selectedEdges(reopened)).toEqual([edge()])
    expect(supportedFace(reopened)).toEqual(face())
    expect(serialized).toContain(EDGE_V1)
    expect(serialized).toContain(FACE_V1)
    expect(reopened.features.find(feature => feature.id === 'legacy-finish')).toMatchObject({ selection: { edges: [edge(EDGE_V1)] } })
    expect(reopened.features.find(feature => feature.id === 'legacy-plane')).toMatchObject({ support: { face: face(FACE_V1) } })
  })

  it('retains syntactically valid lost v2 references and suppressed sources for repair', () => {
    const original = documentWith(finish(`edge-v2|${'0'.repeat(64)}`), facePlane(`face-v2|${'0'.repeat(64)}`))
    const suppressed = updateFeature(original, SOURCE, { suppressed: true })
    expect(parseDocument(serializeDocument(suppressed))).toEqual(suppressed)
    expect(selectedEdges(suppressed)[0].key).toBe(`edge-v2|${'0'.repeat(64)}`)
    expect(supportedFace(suppressed).key).toBe(`face-v2|${'0'.repeat(64)}`)
  })

  it.each(['face', 'edge'] as const)('rejects malformed or wrong-kind %s v2 keys without trimming or case conversion', kind => {
    const prefix = `${kind}-v2|`, valid = kind === 'face' ? FACE_V2 : EDGE_V2
    const invalid = [prefix, prefix + 'a'.repeat(63), prefix + 'a'.repeat(65), prefix + 'A'.repeat(64), prefix + 'g'.repeat(64),
      valid + '\n', valid + '\r\n', valid + ' ', ' ' + valid, valid.replace('-v2|', '-v3|'), kind === 'face' ? EDGE_V2 : FACE_V2]
    for (const key of invalid) expect(() => documentWith(kind === 'face' ? facePlane(key) : finish(key))).toThrow('.key')
  })

  it.each(['face', 'edge'] as const)('requires only the stored fields and a bounded control-free v2 %s source ID', kind => {
    const reference = kind === 'face' ? face() : edge()
    const invalid: unknown[] = [null, { key: reference.key }, { sourceFeatureId: SOURCE }, { ...reference, transientIndex: 0 },
      { ...reference, aliases: [reference] }, ...[null, 123, '', 'x'.repeat(129), 'source\nsolid', 'source\0solid'].map(sourceFeatureId => ({ ...reference, sourceFeatureId }))]
    for (const value of invalid) {
      const feature = kind === 'face' ? { ...facePlane(), support: { kind: 'face', face: value } }
        : { ...finish(), selection: { mode: 'selected', edges: [value] } }
      expect(() => documentWith(feature)).toThrow()
    }
    const controlledId = 'source\nsolid'
    const controlledFeature = kind === 'face' ? facePlane(FACE_V2, controlledId) : finish(EDGE_V2, controlledId)
    expect(() => validateDocument(input([controlledFeature], controlledId))).toThrow('caracteres de control')
  })

  it('requires face supports to belong to an earlier solid and selected references to their exact base', () => {
    for (const sourceFeatureId of ['missing', 'source-sketch', 'face-plane', 'later-solid']) {
      expect(() => documentWith(facePlane(FACE_V2, sourceFeatureId), solid('later-solid'))).toThrow('operación sólida anterior')
    }
    const other = solid('other-solid')
    expect(() => documentWith(other, { ...finish(), selection: { mode: 'selected', edges: [edge(EDGE_V2, other.id)] } })).toThrow('operación base')
    expect(() => documentWith(other, { ...shell(), removedFaces: [face(FACE_V2, other.id)] })).toThrow('operación base')
    expect(() => documentWith({ ...finish(), baseFeatureId: 'replacement-solid' }, solid('replacement-solid'))).toThrow('operación base')
  })

  it('rejects exact duplicate selections in each version while preserving distinct stored keys', () => {
    for (const key of [EDGE_V1, EDGE_V2]) expect(() => documentWith({ ...finish(), selection: { mode: 'selected', edges: [edge(key), edge(key)] } })).toThrow('duplicada')
    for (const key of [FACE_V1, FACE_V2]) expect(() => documentWith(shell([key, key]))).toThrow('duplicada')
    const mixed = documentWith({ ...finish(), selection: { mode: 'selected', edges: [edge(EDGE_V1), edge()] } }, shell([FACE_V1, FACE_V2]))
    expect(selectedEdges(mixed)).toEqual([edge(EDGE_V1), edge()])
    // Native alias equivalence is deliberately checked by the CAD consumer, not this parser.
  })

  it('keeps the 4096-edge boundary and nonempty selected-edge policy for v2', () => {
    const edges = Array.from({ length: 4096 }, (_, index) => edge(`edge-v2|${index.toString(16).padStart(64, '0')}`))
    const original = documentWith({ ...finish(), selection: { mode: 'selected', edges } })
    expect(selectedEdges(parseDocument(serializeDocument(original)))).toEqual(edges)
    expect(() => documentWith({ ...finish(), selection: { mode: 'selected', edges: [...edges, edge()] } })).toThrow('4096')
    expect(() => documentWith({ ...finish(), selection: { mode: 'selected', edges: [] } })).toThrow('selecciona')
    expect(documentWith({ ...finish(), selection: { mode: 'all' } }).features.at(-1)).toMatchObject({ selection: { mode: 'all' } })
  })

  it('keeps the 256-face boundary and operation-specific empty selection meaning for v2', () => {
    const keys = Array.from({ length: 256 }, (_, index) => `face-v2|${index.toString(16).padStart(64, '0')}`)
    const original = documentWith(shell(keys), draft(keys))
    expect(parseDocument(serializeDocument(original))).toEqual(original)
    expect(() => documentWith(shell([...keys, FACE_V2]))).toThrow('256')
    expect(() => documentWith(draft([...keys, FACE_V2]))).toThrow('256')
    expect(documentWith(shell([])).features.at(-1)).toMatchObject({ removedFaces: [] })
    expect(() => documentWith(draft([]))).toThrow('faces')
  })

  it('rejects fully and partly sparse edge/face arrays before they can serialize as null', () => {
    for (const version of ['v1', 'v2'] as const) {
      const edgeRef = edge(version === 'v1' ? EDGE_V1 : EDGE_V2), faceRef = face(version === 'v1' ? FACE_V1 : FACE_V2)
      const partialEdges = [edgeRef, edgeRef]; delete partialEdges[1]
      const partialFaces = [faceRef, faceRef]; delete partialFaces[1]
      for (const edges of [new Array(1), partialEdges]) {
        const source = input([{ ...finish(), selection: { mode: 'selected', edges } }]), before = JSON.stringify(source)
        expect(() => validateDocument(source)).toThrow('.edges[')
        expect(JSON.stringify(source)).toBe(before)
      }
      for (const faces of [new Array(1), partialFaces]) expect(() => documentWith({ ...shell(), removedFaces: faces })).toThrow('removedFaces')
    }
  })

  it('preserves keys and all surviving IDs through parameter edits, detached undo/redo and reopening', () => {
    const initial = documentWith(finish(), facePlane()), saved = serializeDocument(initial)
    const history = new DocumentHistory(initial), edited = updateFeature(initial, SOURCE, { depth: 8 })
    history.apply(edited)
    expect(selectedEdges(history.current)).toEqual([edge()])
    expect(supportedFace(history.current)).toEqual(face())
    expect(history.current.features.map(feature => feature.id)).toEqual(initial.features.map(feature => feature.id))
    const restored = history.undo()
    expect(serializeDocument(restored)).toBe(saved)
    selectedEdges(restored)[0].key = EDGE_V1
    supportedFace(restored).key = FACE_V1
    expect(history.current).toEqual(initial)
    const redone = history.redo()
    expect(redone).toEqual(edited)
    expect(parseDocument(serializeDocument(redone))).toEqual(edited)
  })

  it('rejects a malformed v2 edit atomically without losing the valid redo branch', () => {
    const initial = documentWith(finish(), facePlane()), history = new DocumentHistory(initial)
    const edited = updateFeature(initial, SOURCE, { depth: 8 })
    history.apply(edited)
    history.undo()
    const invalid = history.current
    selectedEdges(invalid)[0].key = EDGE_V2.toUpperCase()
    expect(() => history.apply(invalid)).toThrow('.key')
    expect(history.current).toEqual(initial)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
    expect(history.redo()).toEqual(edited)
  })
})
