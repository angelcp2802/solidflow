import { expect, it } from 'vitest'
import { createVertexReference, isVertexReferenceKey, validateVertexReference, type VertexIncidenceDescriptor } from './kernel.vertex-references'
function descriptor(): VertexIncidenceDescriptor {
  return { sourceFeatureId: 'extrude-original', lineage: 'original-discrete-history',
    faces: [{ sourceFeatureId: 'extrude-original', key: 'face-v1|cap-original' }],
    edges: ['a', 'b'].map(id => ({ sourceFeatureId: 'extrude-original', key: 'edge-v1|rim-' + id })),
    counts: { vertices: 8, edges: 12, faces: 6 } }
}
it('hashes canonical incidence independently of traversal and object field order', () => {
  const d = descriptor(), before = structuredClone(d), ref = createVertexReference(d)
  expect(isVertexReferenceKey(ref.key)).toBe(true)
  expect(createVertexReference({ ...d, edges: [...d.edges].reverse(), counts: { faces: 6, vertices: 8, edges: 12 } })).toEqual(ref)
  expect(d).toEqual(before)
  expect(validateVertexReference(JSON.parse(JSON.stringify(ref)))).toEqual(ref)
  expect(validateVertexReference(ref)).not.toBe(ref)
})
it('retains source, lineage, exact incidence and body topology changes in identity', () => {
  const d = descriptor(), ref = createVertexReference(d)
  for (const changed of [{ ...d, lineage: 'other' }, { ...d, counts: { ...d.counts, vertices: 9 } },
    { ...d, edges: [d.edges[0]] }, { ...d, faces: [{ ...d.faces[0], key: 'face-v2|' + 'a'.repeat(64) }] },
    { ...d, sourceFeatureId: 'other', faces: d.faces.map(r => ({ ...r, sourceFeatureId: 'other' })), edges: d.edges.map(r => ({ ...r, sourceFeatureId: 'other' })) }]) expect(createVertexReference(changed)).not.toEqual(ref)
})
it('rejects duplicate/foreign/malformed incidence without coordinate or ordinal fallback', () => {
  const d = descriptor()
  const sparse = Array(2); sparse[1] = d.edges[0]
  for (const edges of [[d.edges[0], d.edges[0]], [{ ...d.edges[0], sourceFeatureId: 'other' }],
    [{ ...d.edges[0], key: 'face-v1|wrong-family' }], sparse]) expect(() => createVertexReference({ ...d, edges })).toThrow()
  for (const mutation of [{ ...d, point: [0, 0, 0] }, { ...d, ordinal: 0 }, { ...d, aliases: [] },
    { ...d, counts: { ...d.counts, edges: 1 } }, { ...d, lineage: 'bad\n' }]) expect(() => createVertexReference(mutation)).toThrow()
  // Identical incidence has identical identity: producer must reject ambiguous native matches.
  expect(createVertexReference(d)).toEqual(createVertexReference(structuredClone(d)))
})
it('rejects accessors before executing them and accepts only exact lowercase key syntax', () => {
  let calls = 0
  const d = descriptor(); Object.defineProperty(d, 'edges', { enumerable: true, get() { calls++; return [] } })
  expect(() => createVertexReference(d)).toThrow(); expect(calls).toBe(0)
  for (const key of ['vertex-v1|' + 'A'.repeat(64), 'vertex-v1|' + 'a'.repeat(63), 'face-v2|' + 'a'.repeat(64)]) expect(() => validateVertexReference({ sourceFeatureId: 'source', key })).toThrow()
})
