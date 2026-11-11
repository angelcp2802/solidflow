import { afterEach, expect, it, vi } from 'vitest'
import original from '../cad/fixtures/part-sequence-original.json'
import { validateDocument, type Document } from './document'
import { createAssemblyFromPart } from './assemblyFromPart'
import { MAX_ASSEMBLY_BYTES, parseAssemblyDocument, serializeAssemblyDocument } from './assemblyDocument'

afterEach(() => vi.restoreAllMocks())
const piece = () => validateDocument(structuredClone(original))

it('embeds the original sequential part unchanged with one fixed identity occurrence and no links or mates', () => {
  const source = piece(), before = structuredClone(source), result = createAssemblyFromPart(source)
  expect(source).toEqual(before)
  expect(result.definitions).toHaveLength(1)
  const definition = result.definitions[0]
  expect(definition.kind).toBe('part')
  if (definition.kind !== 'part') throw Error('Expected embedded part')
  expect(definition.document).toEqual(source)
  expect(definition.id).toBe(source.id)
  expect(result.occurrences).toEqual([{ id: expect.any(String), name: source.name,
    definition: { id: source.id, revision: definition.revision },
    pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }, fixed: true, visible: true, suppressed: false }])
  expect(result.mates).toEqual([])
  expect(Object.keys(definition).sort()).toEqual(['document', 'id', 'kind', 'revision'])
  expect(parseAssemblyDocument(serializeAssemblyDocument(result))).toEqual(result)
  expect(definition.document).not.toBe(source)
  expect(definition.document.features[0]).not.toBe(source.features[0])
  source.features[0].name = 'Changed source after capture'
  expect(definition.document.features[0].name).toBe(before.features[0].name)
  definition.document.features[1].name = 'Independent assembly snapshot'
  expect(source.features[1].name).toBe(before.features[1].name)
})

it('preserves the ordered explicit body-reference chain of accepted sequential operations', () => {
  const source = piece()
  source.features.push(
    { id: 'review-left-cut', name: 'Left cut', type: 'cut', sketchId: 'seq-cut-left-sketch', depth: 4, symmetric: false, suppressed: false,
      bodyScope: [{ bodyId: 'seq-body', sourceFeatureId: 'seq-base' }] },
    { id: 'review-boss', name: 'Boss', type: 'extrude', sketchId: 'seq-boss-sketch', depth: 3, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'merge', target: { bodyId: 'seq-body', sourceFeatureId: 'review-left-cut' } } },
  )
  const result = createAssemblyFromPart(source), definition = result.definitions[0]
  if (definition.kind !== 'part') throw Error('Expected embedded part')
  expect(definition.document).toEqual(validateDocument(source))
  expect(definition.document.features.map(feature => feature.id)).toEqual(source.features.map(feature => feature.id))
})

it('creates independent root, revision and occurrence identities on each invocation and bounds the assembly name', () => {
  const source = piece(); source.name = 'P'.repeat(200)
  const a = createAssemblyFromPart(source), b = createAssemblyFromPart(source)
  const ids = [a.id, a.revision, a.definitions[0].revision, a.occurrences[0].id, b.id, b.revision, b.definitions[0].revision, b.occurrences[0].id]
  expect(new Set(ids).size).toBe(8)
  expect(ids).not.toContain(source.id)
  expect(a.name).toHaveLength(200)
  expect(a.name.startsWith('Ensamblaje de ')).toBe(true)
  expect(a.occurrences[0].name).toBe(source.name)
})

it('rejects generated collisions with source identities and other newly allocated identities', () => {
  const values = ['seq-base', 'new-root', 'new-root', 'root-revision', 'part-revision', 'seq-body', 'new-occurrence']
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => values.shift()! as ReturnType<typeof crypto.randomUUID>)
  const result = createAssemblyFromPart(piece())
  expect(result.id).toBe('new-root')
  expect(result.revision).toBe('root-revision')
  expect(result.definitions[0].revision).toBe('part-revision')
  expect(result.occurrences[0].id).toBe('new-occurrence')
})

it('fails boundedly if a fresh identity cannot be allocated', () => {
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue('seq-base' as ReturnType<typeof crypto.randomUUID>)
  expect(() => createAssemblyFromPart(piece())).toThrow('identidad nueva')
  expect(uuid).toHaveBeenCalledTimes(32)
})

it('rejects invalid documents, stale body references and non-part input without repairing them', () => {
  expect(() => createAssemblyFromPart({ ...piece(), units: 'inch' } as unknown as Document)).toThrow()
  const source = piece()
  source.features.push({ id: 'bad-cut', name: 'Bad cut', type: 'cut', sketchId: 'seq-cut-left-sketch', depth: 4, symmetric: false, suppressed: false,
    bodyScope: [{ bodyId: 'missing', sourceFeatureId: 'seq-base' }] })
  expect(() => createAssemblyFromPart(source)).toThrow()
  expect(() => createAssemblyFromPart(createAssemblyFromPart(piece()) as unknown as Document)).toThrow('documento de pieza')
})

it('rejects executable fields without invoking them and retains the existing input byte limit', () => {
  const source = piece(), getter = vi.fn(() => 'name')
  Object.defineProperty(source, 'name', { enumerable: true, get: getter })
  expect(() => createAssemblyFromPart(source)).toThrow()
  expect(getter).not.toHaveBeenCalled()
  expect(() => createAssemblyFromPart({ ...piece(), name: 'x'.repeat(MAX_ASSEMBLY_BYTES + 1) })).toThrow('20 MB')
})
