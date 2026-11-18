import { expect, it } from 'vitest'
import { insertAssemblyDocument } from './assemblyImport'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { expandAssemblyParts, parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  MAX_ASSEMBLY_BYTES, MAX_ASSEMBLY_DEFINITIONS, MAX_ASSEMBLY_DEPTH, MAX_ASSEMBLY_OCCURRENCES,
  type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyOccurrence, type AssemblyMate,
  type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument'
import { identityRigidPose } from './rigidPose'

// Original declaration-only fixtures. Vertex keys below are syntax examples,
// never current native entities, geometric evidence or an Apply capability.
const stamp = '2026-10-22T00:00:00.000Z'
function empty(id = 'destination', revision = 'r1'): AssemblyDocument {
  return { version: 2, kind: 'assembly', id, revision, name: 'Original ' + id, units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [], occurrences: [], mates: [] }
}
function node(id: string, revision = 'r1'): EmbeddedAssemblyDefinition {
  return { kind: 'assembly', id, revision, name: 'Original ' + id, createdAt: stamp, updatedAt: stamp, occurrences: [], mates: [] }
}
function part(id = 'original-part', revision = 'r1'): EmbeddedPartDefinition {
  return { kind: 'part', id, revision, document: { version: 1, id, name: 'Original 2 by 3 by 4 part', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
      { id: 'solid', name: 'Original separate body', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
        bodyOperation: { mode: 'new', bodyId: 'original-body' } },
    ] } }
}
function occurrence(id: string, definition: AssemblyDefinitionReference): AssemblyOccurrence {
  return { id, name: 'Original ' + id, definition: { id: definition.id, revision: definition.revision },
    pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }
}
function source(): AssemblyDocument {
  const result = empty('source'), solid = part(), inner = node('inner')
  inner.occurrences = [{ ...occurrence('child', solid), fixed: true }]
  inner.mates = [{ id: 'local-plane', name: 'Original local frame', type: 'coincident', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: { occurrencePath: ['child'], definition: { id: solid.id, revision: solid.revision } }, plane: 'XY' },
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }]
  result.definitions = [solid, inner, part('dormant-part'), node('dormant-assembly')]
  result.occurrences = [occurrence('sub', inner), { ...occurrence('right', solid), fixed: true, visible: false, suppressed: true,
    pose: { translation: [7, -11, 13], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }]
  const vertex = (path: string[]) => ({ kind: 'vertex' as const, support: 'point' as const,
    component: { occurrencePath: path, definition: { id: solid.id, revision: solid.revision } }, body: { bodyId: 'original-body', sourceFeatureId: 'solid' },
    vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) } })
  result.mates = [{ id: 'points', name: 'Original point roles', type: 'symmetry', entityKind: 'point', suppressed: false,
    source: vertex(['sub', 'child']), target: vertex(['right']), mirror: { kind: 'principal-plane', component: null, plane: 'YZ' }, alignment: null },
  { id: 'four-planes', name: 'Original ordered plane roles', type: 'width', mode: 'centered', suppressed: true,
    width: [{ kind: 'principal-plane', component: null, plane: 'YZ' }, { kind: 'principal-plane', component: null, plane: 'XY' }],
    tab: [{ kind: 'principal-plane', component: { occurrencePath: ['right'], definition: { id: solid.id, revision: solid.revision } }, plane: 'XZ' },
      { kind: 'principal-plane', component: null, plane: 'YZ' }], widthBranch: 'difference', tabBranch: 'sum', alignment: 'opposed' }]
  return validateAssemblyDocument(result)
}
function embedded(document: AssemblyDocument, id = 'source', revision = 'r1'): EmbeddedAssemblyDefinition {
  const result = document.definitions.find(value => value.id === id && value.revision === revision)
  if (!result || result.kind !== 'assembly') throw new Error('Expected original embedded assembly')
  return result
}
function reversedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversedKeys)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reversedKeys(child)]))
}

it('embeds the exact source root and every dormant dependency, with one independently identified default occurrence', () => {
  const input = empty(), incoming = source(), before = structuredClone(input), sourceBefore = structuredClone(incoming)
  const result = insertAssemblyDocument(input, incoming), root = embedded(result)
  expect(root).toEqual({ kind: 'assembly', id: 'source', revision: 'r1', name: 'Original source', createdAt: stamp, updatedAt: stamp,
    occurrences: incoming.occurrences, mates: incoming.mates })
  expect(result.definitions.slice(1)).toEqual(incoming.definitions); expect(result.definitions).toHaveLength(5)
  expect(result.occurrences).toHaveLength(1)
  expect(result.occurrences[0]).toEqual({ id: expect.any(String), name: 'Original source', definition: { id: 'source', revision: 'r1' },
    pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }, fixed: false, suppressed: false, visible: true })
  expect(result.occurrences[0].id).not.toBe('sub'); expect(result.occurrences[0].id).not.toBe('right')
  expect(result.id).toBe(input.id); expect(result.revision).toBe(input.revision); expect(result.createdAt).toBe(stamp)
  expect(Date.parse(result.updatedAt)).toBeGreaterThan(Date.parse(stamp))
  expect(input).toEqual(before); expect(incoming).toEqual(sourceBefore)
  expect('token' in result).toBe(false); expect('scene' in result).toBe(false)
})

it('reuses exact normalized root/dependency tuples despite input object key order and creates a new occurrence each time', () => {
  const incoming = source(), first = insertAssemblyDocument(empty(), incoming)
  const second = insertAssemblyDocument(first, reversedKeys(incoming) as AssemblyDocument)
  expect(second.definitions).toEqual(first.definitions); expect(second.occurrences).toHaveLength(2)
  expect(second.occurrences[0]).toEqual(first.occurrences[0]); expect(second.occurrences[1].definition).toEqual(second.occurrences[0].definition)
  expect(second.occurrences[1].id).not.toBe(second.occurrences[0].id)
})

it('preserves all point/width role paths, null local frames, producer/body keys and suppressed local declarations without prefix rewriting', () => {
  const incoming = source(), result = insertAssemblyDocument(empty(), incoming), root = embedded(result)
  expect(root.mates).toEqual(incoming.mates); expect(embedded(result, 'inner').mates).toEqual(embedded(incoming, 'inner').mates)
  const points = root.mates[0]
  if (points.type !== 'symmetry' || points.entityKind !== 'point') throw new Error('Original point roles missing')
  expect(points.source.component.occurrencePath).toEqual(['sub', 'child']); expect(points.target.component.occurrencePath).toEqual(['right'])
  expect(points.source.body).toEqual({ bodyId: 'original-body', sourceFeatureId: 'solid' }); expect(points.mirror.component).toBeNull()
  const width = root.mates[1]
  if (width.type !== 'width') throw new Error('Original four-plane roles missing')
  expect(width.suppressed).toBe(true); expect(width.width[0].component).toBeNull(); expect(width.tab[0].component?.occurrencePath).toEqual(['right'])
  expect(root.occurrences[1]).toEqual(incoming.occurrences[1])
  expect(expandAssemblyParts(result, true).map(value => value.path)).toEqual([[result.occurrences[0].id, 'sub', 'child'], [result.occurrences[0].id, 'right']])
})

it('detaches both inputs and every result so later source/result mutations cannot cross the import boundary', () => {
  const input = empty(), incoming = source(), before = structuredClone(incoming), result = insertAssemblyDocument(input, incoming)
  embedded(result).occurrences[0].pose.translation[0] = 99; embedded(result).mates[0].name = 'Changed result'
  expect(incoming).toEqual(before)
  incoming.occurrences[0].name = 'Changed input'; incoming.definitions[0].revision = 'changed'
  expect(embedded(result).occurrences[0].name).toBe('Original sub'); expect(result.definitions[1].revision).toBe('r1'); expect(input.definitions).toEqual([])
})

it.each(['root metadata', 'dependency content', 'array order'] as const)('rejects same-tuple different %s without overwriting the prior import', kind => {
  const incoming = source(), input = insertAssemblyDocument(empty(), incoming), before = structuredClone(input)
  if (kind === 'root metadata') incoming.name = 'Different root contents'
  else if (kind === 'array order') incoming.occurrences.reverse()
  else {
    const definition = incoming.definitions[0]
    if (definition.kind !== 'part' || definition.document.features[1].type !== 'extrude') throw new Error('Original part missing')
    definition.document.features[1].depth = 5
  }
  const sourceBefore = structuredClone(incoming)
  expect(() => insertAssemblyDocument(input, incoming)).toThrow('contenido distinto')
  expect(input).toEqual(before); expect(incoming).toEqual(sourceBefore)
})

it.each(['source', 'original-part'] as const)('rejects same ID with different kinds across revisions: %s', id => {
  const input = empty(), incoming = source()
  input.definitions = [id === 'source' ? part(id, 'other-revision') : node(id, 'other-revision')]
  const before = structuredClone(input)
  expect(() => insertAssemblyDocument(input, incoming)).toThrow('pieza y ensamblaje'); expect(input).toEqual(before)
})

it('admits different part and assembly revisions, including another revision of the destination root ID', () => {
  const input = empty('source', 'older'), incoming = source()
  input.definitions = [part('original-part', 'older')]
  const result = insertAssemblyDocument(input, incoming)
  expect(result.id).toBe('source'); expect(result.revision).toBe('older'); expect(embedded(result).revision).toBe('r1')
  expect(result.definitions.filter(value => value.id === 'original-part').map(value => value.revision)).toEqual(['older', 'r1'])
  expect(result.occurrences[0].definition).toEqual({ id: 'source', revision: 'r1' })
})

it('rejects exact self-import and any source dependency claiming the destination root tuple', () => {
  const input = empty(), incoming = source()
  expect(() => insertAssemblyDocument(input, input)).toThrow('raíz del destino')
  incoming.definitions.push(node(input.id, input.revision))
  expect(() => insertAssemblyDocument(input, incoming)).toThrow('raíz del destino'); expect(input).toEqual(empty())
})

it('inserts into an existing shared scope without changing or relabeling the enclosing occurrences', () => {
  const input = empty(), shared = node('shared'), incoming = source()
  input.definitions = [shared]; input.occurrences = [occurrence('left-use', shared), occurrence('right-use', shared)]
  const result = insertAssemblyDocument(input, incoming, { id: 'shared', revision: 'r1' })
  expect(result.occurrences).toEqual(input.occurrences); expect(embedded(result, 'shared').occurrences).toHaveLength(1)
  expect(embedded(result, 'shared').occurrences[0].definition).toEqual({ id: 'source', revision: 'r1' })
  expect(shared.occurrences).toEqual([]); expect(expandAssemblyParts(result, true)).toHaveLength(4)
})

it('rejects a scope supplied only by the new source rather than resolving it after merge', () => {
  expect(() => insertAssemblyDocument(empty(), source(), { id: 'dormant-assembly', revision: 'r1' })).toThrow('existente del destino')
})

it('rejects a newly introduced definition cycle even inside a dormant destination scope', () => {
  const input = empty(), incoming = empty('source'), dormant = node('dormant')
  input.definitions = [dormant]; incoming.definitions = [structuredClone(dormant)]; incoming.occurrences = [occurrence('back', dormant)]
  const before = structuredClone(input), sourceBefore = structuredClone(incoming)
  expect(() => insertAssemblyDocument(input, incoming, { id: 'dormant', revision: 'r1' })).toThrow('ciclo')
  expect(input).toEqual(before); expect(incoming).toEqual(sourceBefore)
})

it('preserves suppressed and dormant graph validation rather than using them to hide missing definitions', () => {
  const incoming = source(); incoming.occurrences[0].suppressed = true
  embedded(incoming, 'dormant-assembly').occurrences = [occurrence('missing', { id: 'not-present', revision: 'r1' })]
  expect(() => insertAssemblyDocument(empty(), incoming)).toThrow('no encontrada')
})

it('keeps import as one syntax-history state and round trips complete definitions and declarations through save/parse', () => {
  const input = empty(), incoming = source(), history = new AssemblyDocumentHistory(input)
  const result = insertAssemblyDocument(history.current, incoming), saved = serializeAssemblyDocument(result)
  history.commitDocument(result)
  expect(history.canUndo).toBe(true); expect(parseAssemblyDocument(saved)).toEqual(result)
  expect(history.undo()).toEqual(input); expect(history.canRedo).toBe(true); expect(history.redo()).toEqual(result)
  expect(serializeAssemblyDocument(history.current)).toBe(saved)
})

it('does not evaluate executable, hidden or malformed data in either input or the exact destination scope', () => {
  let calls = 0
  const invoke = () => { calls++; return 'executed' }
  const getter = Object.defineProperty(source(), 'name', { enumerable: true, get: invoke })
  const nested = source(); Object.defineProperty(nested.definitions[0], 'id', { enumerable: true, get: invoke })
  for (const value of [getter, nested, Object.assign(source(), { toJSON: invoke }), Object.create(source()), null, []]) {
    expect(() => insertAssemblyDocument(empty(), value as AssemblyDocument)).toThrow()
  }
  expect(() => insertAssemblyDocument(getter, source())).toThrow()
  const input = empty(); input.definitions = [node('shared'), part()]
  const scopeGetter = Object.defineProperty({ revision: 'r1' }, 'id', { enumerable: true, get: invoke })
  const hidden = Object.defineProperty({ revision: 'r1' }, 'id', { value: 'shared', enumerable: false })
  for (const value of [scopeGetter, hidden, { id: 'shared', revision: 'stale' }, { id: 'missing', revision: 'r1' },
    { id: 'original-part', revision: 'r1' }, { id: 'shared', revision: 'r1', extra: true }, null, []]) {
    expect(() => insertAssemblyDocument(input, source(), value as AssemblyDefinitionReference)).toThrow()
  }
  expect(calls).toBe(0)
})

it('counts imported dormant definitions against the existing registry budget and still reuses exact entries at the boundary', () => {
  const input = empty(); input.definitions = Array.from({ length: MAX_ASSEMBLY_DEFINITIONS }, (_, index) => node('unused-' + index))
  const incoming = empty('source'), before = structuredClone(input)
  expect(() => insertAssemblyDocument(input, incoming)).toThrow('longitud'); expect(input).toEqual(before)
  input.definitions.pop()
  const first = insertAssemblyDocument(input, incoming), second = insertAssemblyDocument(first, incoming)
  expect(first.definitions).toHaveLength(512); expect(second.definitions).toEqual(first.definitions); expect(second.occurrences).toHaveLength(2)
})

it('rejects stored and expanded occurrence overflow atomically instead of clipping imported declarations', () => {
  const input = empty(), shared = node('shared'); input.definitions = [shared]
  input.occurrences = Array.from({ length: MAX_ASSEMBLY_OCCURRENCES }, (_, index) => occurrence('use-' + index, shared))
  const before = structuredClone(input)
  expect(() => insertAssemblyDocument(input, empty('source'))).toThrow('longitud de lista'); expect(input).toEqual(before)
  input.occurrences.length = 2049
  const expandedBefore = structuredClone(input)
  expect(() => insertAssemblyDocument(input, empty('source'), { id: shared.id, revision: shared.revision })).toThrow('jerarquía expandida'); expect(input).toEqual(expandedBefore)
})

it('rejects an import that exceeds the existing full hierarchy depth through an otherwise valid scope', () => {
  const input = empty(), chain = Array.from({ length: MAX_ASSEMBLY_DEPTH }, (_, index) => node('level-' + index))
  chain.slice(0, -1).forEach((entry, index) => { entry.occurrences = [occurrence('next', chain[index + 1])] })
  input.definitions = chain; input.occurrences = [occurrence('top', chain[0])]
  expect(validateAssemblyDocument(input)).toEqual(input)
  const last = chain.at(-1)!
  expect(() => insertAssemblyDocument(input, empty('source'), { id: last.id, revision: last.revision })).toThrow(/profunda|jerarquía expandida/)
})

it('checks actual pretty UTF-8 saved bytes after composition, beyond the compact object-input boundary', () => {
  // Original unattested plane declarations deliberately fill the byte boundary;
  // their unresolved component paths grant no geometric/currentness authority.
  const input = empty(), reference = { kind: 'principal-plane' as const, plane: 'XY' as const,
    component: { occurrencePath: Array.from({ length: 32 }, () => 'component-123456'), definition: { id: 'unresolved-part', revision: 'r1' } } }
  input.mates = Array.from({ length: 4000 }, (_, index): AssemblyMate => ({ id: 'byte-case-' + index, name: 'Original byte-boundary declaration',
    type: 'width', mode: 'centered', suppressed: true, width: [structuredClone(reference), structuredClone(reference)],
    tab: [structuredClone(reference), structuredClone(reference)], widthBranch: 'sum', tabBranch: 'difference', alignment: 'aligned' }))
  expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeLessThan(MAX_ASSEMBLY_BYTES)
  expect(new TextEncoder().encode(JSON.stringify(input, null, 2)).byteLength).toBeGreaterThan(MAX_ASSEMBLY_BYTES)
  expect(() => insertAssemblyDocument(input, empty('source'))).toThrow('serializado supera los 20 MB')
}, 60_000)
