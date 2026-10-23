import type { EdgeReference, FaceReference, VertexReference } from './kernel.types'
import { namingDigest } from './kernel.naming'
import { isEdgeReferenceKeyV2, isFaceReferenceKeyV2 } from './kernel.semantic-references'

/** Discrete incidence only. Native membership and one-to-one topology must be
 * verified by the producer; syntax and hashing confer no native authority. */
export interface VertexIncidenceDescriptor {
  sourceFeatureId: string
  lineage: string
  faces: readonly FaceReference[]
  edges: readonly EdgeReference[]
  counts: { vertices: number; edges: number; faces: number }
}
export const isVertexReferenceKey = (value: unknown): value is string => typeof value === 'string' && value.length === 74 && /^vertex-v1\|[0-9a-f]{64}$/.test(value)
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Vertex reference requires plain data records.')
  const fields = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(fields)
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) throw new Error('Unknown or missing vertex reference fields.')
  for (const key of keys) if (!fields[key] || !fields[key].enumerable || !('value' in fields[key])) throw new Error('Vertex reference fields must be own data.')
  return Object.fromEntries(keys.map(key => [key, fields[key].value]))
}
function text(value: unknown, maximum: number, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > maximum || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Invalid vertex reference text.')
  return value
}
export function validateVertexReference(value: unknown): VertexReference {
  const data = record(value, ['sourceFeatureId', 'key']), sourceFeatureId = text(data.sourceFeatureId, 128)
  if (!isVertexReferenceKey(data.key)) throw new Error('Invalid vertex reference key.')
  return { sourceFeatureId, key: data.key }
}
function references(value: unknown, family: 'face' | 'edge', source: string, maximum: number): string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Vertex incidence requires a bounded dense reference list.')
  const seen = new Set<string>(), result: string[] = []
  for (let i = 0; i < value.length; i++) {
    const field = Object.getOwnPropertyDescriptor(value, String(i))
    if (!field || !field.enumerable || !('value' in field)) throw new Error('Vertex incidence requires own reference data.')
    const ref = record(field.value, ['sourceFeatureId', 'key']), id = text(ref.sourceFeatureId, 128), key = text(ref.key, 4096)
    const semantic = family === 'face' ? isFaceReferenceKeyV2(key) : isEdgeReferenceKeyV2(key)
    if (id !== source || (!semantic && !(key.startsWith(family + '-v1|') && key.length > family.length + 4))) throw new Error('Vertex incidence needs exact same-source face/edge references.')
    if (seen.has(key)) throw new Error('Duplicate vertex incidence reference.')
    seen.add(key); result.push(key)
  }
  return result.sort()
}
export function createVertexReference(value: VertexIncidenceDescriptor): VertexReference {
  const data = record(value, ['sourceFeatureId', 'lineage', 'faces', 'edges', 'counts'])
  const sourceFeatureId = text(data.sourceFeatureId, 128), lineage = text(data.lineage, 4096, true)
  const rawCounts = record(data.counts, ['vertices', 'edges', 'faces'])
  const count = (key: string, maximum: number): number => { const n = rawCounts[key]; if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1 || n > maximum) throw new Error('Invalid native topology counts.'); return n }
  const counts = [count('vertices', 8192), count('edges', 4096), count('faces', 256)]
  const faces = references(data.faces, 'face', sourceFeatureId, 256), edges = references(data.edges, 'edge', sourceFeatureId, 4096)
  if (!faces.length || !edges.length || faces.length > counts[2] || edges.length > counts[1]) throw new Error('Vertex incidence lacks consistent face/edge support.')
  return { sourceFeatureId, key: 'vertex-v1|' + namingDigest(JSON.stringify(['vertex-v1', sourceFeatureId, lineage, counts, faces, edges])) }
}
