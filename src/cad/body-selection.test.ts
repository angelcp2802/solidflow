import { describe, expect, it } from 'vitest'
import type { BodyReference, CadResult, PickableBody, PickableEdge, PickableFace } from './kernel.types'
import { bodySelectionDtos } from './body-selection'
import { createEdgeSelectionIndex, createFaceSelectionIndex } from './selection.references'

// Symbolic display DTOs only. Empty meshes do not assert native geometry,
// body validity, rendering or a successful pointer interaction.
const a: BodyReference = { bodyId: 'body-a', sourceFeatureId: 'source-a' }
const b: BodyReference = { bodyId: 'body-b', sourceFeatureId: 'source-b' }
const face = (sourceFeatureId: string, letter: string): PickableFace => ({
  ref: { sourceFeatureId, key: `face-v2|${letter.repeat(64)}` },
  aliases: [{ sourceFeatureId, key: `face-v1|${letter.repeat(64)}` }],
  frame: null, vertices: [], triangles: [],
})
const edge = (sourceFeatureId: string, letter: string): PickableEdge => ({
  ref: { sourceFeatureId, key: `edge-v2|${letter.repeat(64)}` },
  aliases: [{ sourceFeatureId, key: `edge-v1|${letter.repeat(64)}` }], lines: [],
})
const body = (ref: BodyReference, letter: string): PickableBody => ({
  ref, createdByFeatureId: ref.sourceFeatureId, name: ref.bodyId,
  vertices: [], normals: [], triangles: [], edgeLines: [],
  faces: [face(ref.sourceFeatureId, letter)], edges: [edge(ref.sourceFeatureId, letter)],
  volume: 240, bounds: { min: [0, 0, 0], max: [10, 6, 4] },
})
type SelectionModel = Pick<CadResult, 'faces' | 'edges' | 'bodies' | 'bodyCatalogActive'>
const model = (): SelectionModel => ({
  bodyCatalogActive: true, bodies: [body(a, 'a'), body(b, 'b')],
  faces: [face('aggregate-source', 'c')], edges: [edge('aggregate-source', 'c')],
})

describe('body-aware display reference catalogs', () => {
  it('preserves the legacy aggregate catalogs only when no explicit scope is requested', () => {
    const input = model(); input.bodyCatalogActive = false
    const result = bodySelectionDtos(input)
    expect(result.faces).toBe(input.faces)
    expect(result.edges).toBe(input.edges)
    expect(bodySelectionDtos(input, [a])).toEqual({ faces: [], edges: [] })
  })

  it('uses each body DTO source and aliases while ignoring the independent aggregate catalog', () => {
    const input = model(), result = bodySelectionDtos(input)
    expect(result.faces).toEqual(input.bodies!.flatMap(item => item.faces))
    expect(result.edges).toEqual(input.bodies!.flatMap(item => item.edges))
    expect(result.faces.map(item => item.ref.sourceFeatureId)).toEqual(['source-a', 'source-b'])
    expect(result.edges.every(item => item.ref.sourceFeatureId !== 'aggregate-source')).toBe(true)
    expect(result.faces[0]).toBe(input.bodies![0].faces[0])
  })

  it('restricts operation targets to the exact selected body without using enumeration order', () => {
    const input = model(), before = structuredClone(input)
    const scoped = bodySelectionDtos(input, [b])
    expect(scoped).toEqual({ faces: input.bodies![1].faces, edges: input.bodies![1].edges })
    expect(bodySelectionDtos({ ...input, bodies: [...input.bodies!].reverse() }, [b])).toEqual(scoped)
    expect(input).toEqual(before)
  })

  it('fails closed for missing, replaced, empty or ambiguous body scopes rather than using aggregate refs', () => {
    const input = model()
    for (const scope of [[], [{ ...a, sourceFeatureId: 'replacement-state' }], [{ bodyId: 'missing', sourceFeatureId: a.sourceFeatureId }], [a, a]]) {
      expect(bodySelectionDtos(input, scope)).toEqual({ faces: [], edges: [] })
    }
    expect(bodySelectionDtos({ ...input, bodies: [...input.bodies!, body(a, 'd')] })).toEqual({ faces: [], edges: [] })
    expect(bodySelectionDtos({ ...input, bodies: undefined }, [a])).toEqual({ faces: [], edges: [] })
  })

  it('resolves saved aliases only inside the scoped source and removes them on an equivalent primary click', () => {
    const input = model(), scoped = bodySelectionDtos(input, [a])
    const faces = createFaceSelectionIndex(scoped.faces), edges = createEdgeSelectionIndex(scoped.edges)
    const savedFace = scoped.faces[0].aliases![0], savedEdge = scoped.edges[0].aliases![0]
    expect(faces.find(savedFace)).toBe(scoped.faces[0])
    expect(edges.find(savedEdge)).toBe(scoped.edges[0])
    expect(faces.toggle([savedFace], scoped.faces[0].ref)).toEqual([])
    expect(edges.toggle([savedEdge], scoped.edges[0].ref)).toEqual([])
    expect(faces.find(input.bodies![1].faces[0].ref)).toBeUndefined()
    expect(edges.find(input.bodies![1].edges[0].ref)).toBeUndefined()
    expect(faces.find(input.faces![0].ref)).toBeUndefined()
  })
})
