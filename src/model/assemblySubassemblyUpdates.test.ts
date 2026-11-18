import { expect, it } from 'vitest'
import { prepareAssemblyDocumentUpdate } from './assemblySubassemblyUpdates'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, MAX_ASSEMBLY_BYTES,
  MAX_ASSEMBLY_DEFINITIONS, MAX_ASSEMBLY_OCCURRENCES, MAX_ASSEMBLY_MATES, MAX_ASSEMBLY_DEPTH,
  type AssemblyDocument, type AssemblyDefinitionReference, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition,
  type AssemblyMate, type AssemblyPlaneReference, type AssemblyAxisReference, type AssemblyVertexReference } from './assemblyDocument'
import { identityRigidPose } from './rigidPose'

// Original declaration fixtures only: keys do not attest native topology.
const stamp = '2026-10-22T00:00:00.000Z', old = { id: 'source', revision: 'r0' }, fresh = { id: 'source', revision: 'r1' }
function document(id = 'parent', revision = 'r0'): AssemblyDocument {
  return { version: 2, kind: 'assembly', id, revision, name: 'Original ' + id, units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [], occurrences: [], mates: [] }
}
function node(id: string, revision = 'r0'): EmbeddedAssemblyDefinition {
  return { kind: 'assembly', id, revision, name: 'Original ' + id, createdAt: stamp, updatedAt: stamp, occurrences: [], mates: [] }
}
function part(id = 'material', revision = 'r0', width = 2): EmbeddedPartDefinition {
  return { kind: 'part', id, revision, document: { version: 1, id, name: 'Original rectangular prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [{ id: 'profile', name: 'Original rectangle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [width / 2, 1.5], width, height: 3 } },
    { id: 'solid', name: 'Original 4 mm extrusion', type: 'extrude', suppressed: false, sketchId: 'profile', depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'body' } }] } }
}
const occurrence = (id: string, definition: AssemblyDefinitionReference) => ({ id, name: 'Same display label', definition: { id: definition.id, revision: definition.revision },
  pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })
const component = (path = ['left', 'child'], definition = { id: 'material', revision: 'r0' }) => ({ occurrencePath: path, definition: { ...definition } })
const plane = (path = ['left', 'child']): AssemblyPlaneReference => ({ kind: 'principal-plane', component: component(path), plane: 'YZ' })
const axis = (path = ['left', 'child']): AssemblyAxisReference => ({ kind: 'face', component: component(path), support: 'axis', body: { bodyId: 'body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'face-v1|original-unattested' } })
const vertex = (path = ['left', 'child']): AssemblyVertexReference => ({ kind: 'vertex', support: 'point', component: component(path), body: { bodyId: 'body', sourceFeatureId: 'solid' }, vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) } })
const mate = (id = 'external', reference = plane()): AssemblyMate => ({ id, name: 'Original local plane', type: 'coincident', suppressed: false, alignment: 'aligned', first: reference, second: { kind: 'principal-plane', component: null, plane: 'YZ' } })
function setup() {
  const input = document(), source = node(old.id), carrier = node('carrier'), dormant = node('dormant')
  source.occurrences = [occurrence('child', part())]; source.mates = [mate('source-local', plane(['child']))]
  carrier.occurrences = [occurrence('use', old)]; carrier.mates = [mate('shared-mate', plane(['use', 'child']))]
  dormant.occurrences = [{ ...occurrence('hidden-use', old), suppressed: true, visible: false }]
  dormant.mates = [{ ...mate('dormant-mate', plane(['hidden-use', 'child'])), suppressed: true }]
  input.definitions = [part(), source, carrier, dormant]
  input.occurrences = [occurrence('left', old), occurrence('right', old), occurrence('carrier-a', carrier), occurrence('carrier-b', carrier), occurrence('outside', part())]
  input.mates = [mate()]
  const incoming = document(fresh.id, fresh.revision)
  incoming.definitions = [part('material', 'r1', 3), node('new-dormant')]
  incoming.occurrences = [occurrence('child', { id: 'material', revision: 'r1' })]
  incoming.mates = [mate('new-local', { kind: 'principal-plane', component: null, plane: 'XY' })]
  return { input: validateAssemblyDocument(input), incoming: validateAssemblyDocument(incoming) }
}
function assembly(input: AssemblyDocument, id: string, revision = 'r0'): EmbeddedAssemblyDefinition {
  const result = input.definitions.find(value => value.id === id && value.revision === revision)
  if (!result || result.kind !== 'assembly') throw new Error('Original assembly missing')
  return result
}

it('updates only BEFORE declaration addresses, preserving old history, outside parts, reused scopes and incoming null frames', () => {
  const { input, incoming } = setup(), before = structuredClone(input), sourceBefore = structuredClone(incoming)
  const plan = prepareAssemblyDocumentUpdate(input, old, incoming)
  expect(plan.occurrences).toEqual([
    { scope: { id: 'parent', revision: 'r0' }, occurrenceId: 'left' }, { scope: { id: 'parent', revision: 'r0' }, occurrenceId: 'right' },
    { scope: { id: 'carrier', revision: 'r0' }, occurrenceId: 'use' }, { scope: { id: 'dormant', revision: 'r0' }, occurrenceId: 'hidden-use' },
  ])
  expect(plan.document.occurrences.slice(0, 2).map(value => value.definition)).toEqual([fresh, fresh])
  expect(plan.document.occurrences[4]).toEqual(input.occurrences[4])
  expect(assembly(plan.document, 'source')).toEqual(assembly(input, 'source'))
  expect(assembly(plan.document, 'source', 'r1').occurrences).toEqual(incoming.occurrences)
  expect(assembly(plan.document, 'source', 'r1').mates).toEqual(incoming.mates)
  expect(plan.document.definitions).toContainEqual(assembly(incoming, 'new-dormant'))
  expect(plan.endpoints.map(value => [value.locator.scope.id, value.locator.mateId])).toEqual([['parent', 'external'], ['carrier', 'shared-mate'], ['dormant', 'dormant-mate']])
  expect(plan.endpoints[0]).toMatchObject({ boundary: { occurrencePath: ['left'], source: old }, suffix: ['child'], status: 'needs-repair', beforeResolution: 'current', afterResolution: 'current', desiredComponent: component(['left', 'child'], { id: 'material', revision: 'r1' }) })
  expect(plan.document.mates).toEqual(input.mates) // Explicit old references remain for later repair.
  expect(input).toEqual(before); expect(incoming).toEqual(sourceBefore)
  plan.endpoints[0].endpoint = plane(['mutated']); plan.document.occurrences[0].name = 'Changed result'
  expect(input).toEqual(before); expect(incoming).toEqual(sourceBefore)
})

it('does not retarget newly imported historical references or unrelated same-ID revisions', () => {
  const { input } = setup(), incoming = document('source', 'r1')
  incoming.definitions = [structuredClone(assembly(input, 'source')), part()]
  incoming.occurrences = [occurrence('historical', old)]
  const plan = prepareAssemblyDocumentUpdate(input, old, incoming)
  expect(assembly(plan.document, 'source', 'r1').occurrences[0].definition).toEqual(old)
  expect(assembly(plan.document, 'source').occurrences[0].definition).toEqual({ id: 'material', revision: 'r0' })
})

it('traces stale suffixes and terminal labels without inventing source impact from stale labels before a boundary', () => {
  const { input, incoming } = setup()
  input.mates = [mate('missing-after', plane(['left', 'deleted'])), mate('wrong-label', { kind: 'principal-plane', component: component(['left', 'child'], { id: 'wrong', revision: 'r0' }), plane: 'XY' }),
    mate('missing-before', { kind: 'principal-plane', component: component(['deleted'], old), plane: 'XY' }), mate('through-part', plane(['outside', 'child']))]
  incoming.occurrences[0].id = 'renamed'
  const plan = prepareAssemblyDocumentUpdate(input, old, incoming)
  expect(plan.endpoints.filter(value => value.locator.scope.id === 'parent').map(value => [value.locator.mateId, value.beforeResolution, value.afterResolution, value.desiredComponent])).toEqual([
    ['missing-after', 'stale-path', 'missing-path', undefined], ['wrong-label', 'stale-terminal', 'missing-path', undefined],
  ])
  expect(plan.unresolvedEndpoints.map(value => [value.locator.mateId, value.boundaryCrossed])).toEqual([
    ['missing-after', true], ['wrong-label', true], ['missing-before', false], ['through-part', false],
  ])
})

it('permits assembly component/principal purposes but never claims an assembly is a vertex or face body', () => {
  const { input, incoming } = setup(), group = node('group')
  incoming.definitions.push(group); incoming.occurrences = [occurrence('child', group)]
  input.mates = [mate('frame', { kind: 'principal-plane', component: component(['left'], old), plane: 'XY' }),
    { id: 'points', name: 'Original point roles', type: 'symmetry', entityKind: 'point', suppressed: true, alignment: null,
      source: vertex(), target: vertex(), mirror: { kind: 'principal-plane', component: null, plane: 'YZ' } }]
  const plan = prepareAssemblyDocumentUpdate(input, old, incoming)
  expect(plan.endpoints[0]).toMatchObject({ afterResolution: 'current', suffix: [], desiredComponent: component(['left'], fresh) })
  expect(plan.endpoints.filter(value => value.locator.mateId === 'points').every(value => value.afterResolution === 'non-component' && !value.desiredComponent)).toBe(true)
})

it('preserves all four plane roles, all three symmetry roles and fixed null carriers in exhaustive inventories', () => {
  const { input, incoming } = setup(), p = plane()
  input.mates = [
    { id: 'width', name: 'Original ordered roles', type: 'width', mode: 'centered', suppressed: true, width: [p, p], tab: [p, p], widthBranch: 'sum', tabBranch: 'difference', alignment: 'aligned' },
    { id: 'symmetry', name: 'Original point group', type: 'symmetry', entityKind: 'point', suppressed: false, source: vertex(), target: vertex(), mirror: p, alignment: null },
    { id: 'guide', name: 'Original directed guide', type: 'limit-directed-angle', coordinate: 'directed-about-axis', suppressed: false, first: p, second: p, guide: p, arc: { start: 330, sweep: 60 } },
    { id: 'gear', name: 'Original fixed-scope carrier', type: 'gear', suppressed: true, first: axis(), second: axis(), carrier: null, ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', neutralRotations: { first: [0,0,0,1], second: [0,0,0,1] }, angles: { first: 0, second: 0 }, phase: 0 },
  ]
  const plan = prepareAssemblyDocumentUpdate(input, old, incoming)
  const sides = (id: string) => plan.endpoints.filter(value => value.locator.mateId === id).map(value => value.locator.side)
  expect(sides('width')).toEqual(['width-0','width-1','tab-0','tab-1']); expect(sides('symmetry')).toEqual(['source','target','mirror'])
  expect(sides('guide')).toEqual(['first','second','guide']); expect(sides('gear')).toEqual(['first','second'])
  expect(plan.capturedMates).toEqual([{ scope: { id: 'parent', revision: 'r0' }, mateId: 'gear', type: 'gear', suppressed: true, affectedRoles: ['first','second'] }])
  expect(plan.document.mates).toEqual(input.mates)
})

it('inventories actual capture-bearing families without fabricating captures or dropping a moving carrier role', () => {
  const { input, incoming } = setup(), a = axis(), c = component()
  input.mates = [
    { id: 'concentric', name: 'Original rotation lock', type: 'concentric', suppressed: false, first: a, second: a, alignment: 'aligned', rotationLock: [0,0,0,1] },
    { id: 'free-concentric', name: 'Original unlocked axis', type: 'concentric', suppressed: false, first: a, second: a, alignment: 'aligned', rotationLock: null },
    { id: 'lock', name: 'Original component lock', type: 'lock', suppressed: true, first: c, second: c, relativePose: identityRigidPose() },
    { id: 'screw', name: 'Original screw zero', type: 'screw', suppressed: false, first: a, second: a, lead: 2, reverse: false, alignment: 'aligned', neutralRotation: [0,0,0,1], angle: 0, neutralTravel: 0 },
    { id: 'rack', name: 'Original rack zero', type: 'rack-pinion', suppressed: false, first: a, second: a, conversion: { mode: 'diameter', override: 4 }, reverse: false, neutralRotation: [0,0,0,1], angle: 0, neutralTravel: 0 },
    { id: 'gear', name: 'Original moving carrier', type: 'gear', suppressed: false, first: a, second: a, carrier: c, ratio: { numerator: 1, denominator: 1 }, direction: 'same', neutralRotations: { first: [0,0,0,1], second: [0,0,0,1] }, angles: { first: 0, second: 0 }, phase: 0 },
  ]
  const plan = prepareAssemblyDocumentUpdate(input, old, incoming)
  expect(plan.capturedMates.map(value => value.type)).toEqual(['concentric','lock','screw','rack-pinion','gear'])
  expect(plan.capturedMates.at(-1)?.affectedRoles).toEqual(['first','second','carrier'])
})

it('reuses exact normalized tuples independent of object key order and rejects root/content/kind conflicts atomically', () => {
  const { input, incoming } = setup()
  incoming.occurrences.push(occurrence('second-child', { id: 'material', revision: 'r1' }))
  const current = prepareAssemblyDocumentUpdate(input, old, incoming).document
  const reordered = JSON.parse(JSON.stringify(incoming, (_name, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value)) as AssemblyDocument
  expect(prepareAssemblyDocumentUpdate(current, old, reordered).document.definitions).toEqual(current.definitions)
  const changed = structuredClone(incoming); changed.name = 'Changed root'; const before = structuredClone(current)
  expect(() => prepareAssemblyDocumentUpdate(current, old, changed)).toThrow('contenido distinto'); expect(current).toEqual(before)
  const reorderedChildren = structuredClone(incoming); reorderedChildren.occurrences.reverse()
  expect(() => prepareAssemblyDocumentUpdate(current, old, reorderedChildren)).toThrow('contenido distinto')
  const changedPart = structuredClone(incoming), p = changedPart.definitions[0]
  if (p.kind !== 'part' || p.document.features[1].type !== 'extrude') throw new Error('Expected original extrusion')
  p.document.features[1].depth = 5
  expect(() => prepareAssemblyDocumentUpdate(current, old, changedPart)).toThrow('contenido distinto'); expect(current).toEqual(before)
  const rootClaim = structuredClone(incoming); rootClaim.definitions.push(node(input.id, input.revision))
  expect(() => prepareAssemblyDocumentUpdate(input, old, rootClaim)).toThrow('raíz del destino')
  const kind = structuredClone(incoming); kind.definitions.push(part('carrier', 'different'))
  expect(() => prepareAssemblyDocumentUpdate(input, old, kind)).toThrow('pieza y ensamblaje')
  expect(() => prepareAssemblyDocumentUpdate(input, { id: input.id, revision: input.revision }, incoming)).toThrow('no la raíz')
  expect(() => prepareAssemblyDocumentUpdate(input, old, { ...incoming, revision: old.revision })).toThrow('revisión diferente')
})

it('rejects incoming dependencies that alias a host write scope and rejects newly formed dormant cycles', () => {
  const { input, incoming } = setup()
  incoming.definitions.push(structuredClone(assembly(input, 'carrier')), structuredClone(assembly(input, 'source')), part())
  expect(() => prepareAssemblyDocumentUpdate(input, old, incoming)).toThrow('ámbito del destino que debe cambiar')
  const parent = document(), s = node('source'), d = node('dormant')
  d.occurrences = [occurrence('use', old)]; parent.definitions = [s, d]
  const revised = document('source', 'r1'); revised.definitions = [d, s]; revised.occurrences = [occurrence('loop', d)]
  // The earlier overlap gate conservatively rejects this cycle-producing merge.
  expect(() => prepareAssemblyDocumentUpdate(parent, old, revised)).toThrow('ámbito del destino que debe cambiar')
})

it('rejects executable input/source fields without invoking accessors', () => {
  const { input, incoming } = setup(); let calls = 0
  const get = () => { calls++; return 'source' }
  const source = Object.defineProperty({ revision: 'r0' }, 'id', { enumerable: true, get })
  const executable = Object.defineProperty(structuredClone(incoming), 'id', { enumerable: true, get })
  const hidden = Object.defineProperty({ revision: 'r0' }, 'id', { value: 'source', enumerable: false })
  for (const value of [source, hidden, { ...old, extra: true }, Object.create(old), null, []]) expect(() => prepareAssemblyDocumentUpdate(input, value as AssemblyDefinitionReference, incoming)).toThrow()
  expect(() => prepareAssemblyDocumentUpdate(input, old, executable)).toThrow()
  expect(() => prepareAssemblyDocumentUpdate(executable, old, incoming)).toThrow(); expect(calls).toBe(0)
})

it('round trips the complete plan document as one syntax history change without publishing authority', () => {
  const { input, incoming } = setup(), history = new AssemblyDocumentHistory(input), plan = prepareAssemblyDocumentUpdate(input, old, incoming)
  expect(history.current).toEqual(input); history.commitDocument(plan.document)
  expect(parseAssemblyDocument(serializeAssemblyDocument(history.current))).toEqual(plan.document)
  expect(history.undo()).toEqual(input); expect(history.redo()).toEqual(plan.document)
  expect('token' in plan).toBe(false); expect('scene' in plan).toBe(false); expect(plan.endpoints.every(value => value.status === 'needs-repair')).toBe(true)
})

it('enforces complete registry and expanded occurrence budgets instead of pruning dormant history', () => {
  const input = document(), s = node('source'); input.definitions = [s, ...Array.from({ length: MAX_ASSEMBLY_DEFINITIONS - 1 }, (_, i) => node('unused-' + i))]
  expect(() => prepareAssemblyDocumentUpdate(input, old, document('source', 'r1'))).toThrow('longitud')
  input.definitions.pop(); expect(prepareAssemblyDocumentUpdate(input, old, document('source', 'r1')).document.definitions).toHaveLength(MAX_ASSEMBLY_DEFINITIONS)
  const parent = document(); parent.definitions = [s]; parent.occurrences = Array.from({ length: MAX_ASSEMBLY_OCCURRENCES / 2 + 1 }, (_, i) => occurrence('use-' + i, old))
  const incoming = document('source', 'r1'), child = node('child'); incoming.definitions = [child]; incoming.occurrences = [occurrence('child', child)]
  expect(() => prepareAssemblyDocumentUpdate(parent, old, incoming)).toThrow('jerarquía expandida')
}, 60_000)

it('enforces expanded mate and depth budgets after retargeting, including dormant declarations', () => {
  const parent = document(), s = node('source'); parent.definitions = [s]; parent.occurrences = [occurrence('use-a', old), occurrence('use-b', old)]
  const incoming = document('source', 'r1'); incoming.mates = Array.from({ length: MAX_ASSEMBLY_MATES / 2 + 1 }, (_, i) => mate('mate-' + i, { kind: 'principal-plane', component: null, plane: 'XY' }))
  expect(() => prepareAssemblyDocumentUpdate(parent, old, incoming)).toThrow('jerarquía expandida')
  const chain = Array.from({ length: MAX_ASSEMBLY_DEPTH - 1 }, (_, i) => node('level-' + i))
  chain.slice(0, -1).forEach((n, i) => { n.occurrences = [occurrence('next', chain[i + 1])] }); chain.at(-1)!.occurrences = [occurrence('use', old)]
  const deep = document(); deep.definitions = [s, ...chain]; deep.occurrences = [occurrence('top', chain[0])]
  const revised = document('source', 'r1'), leaf = node('leaf'); revised.definitions = [leaf]; revised.occurrences = [occurrence('leaf', leaf)]
  expect(() => prepareAssemblyDocumentUpdate(deep, old, revised)).toThrow(/profunda|jerarquía expandida/)
}, 60_000)

it('enforces the combined part-feature budget without discarding incoming dormant parts', () => {
  const parent = document(); parent.definitions = [node('source')]
  for (let i = 0; i < 10; i++) {
    const p = part('part-' + i)
    p.document.features = Array.from({ length: 2000 }, (_, j) => ({ id: 'sketch-' + j, name: 'Original budget circle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile: { kind: 'circle', center: [0,0], radius: 1 } }))
    parent.definitions.push(p)
  }
  const incoming = document('source', 'r1'); incoming.definitions = [part('one-more')]
  expect(() => prepareAssemblyDocumentUpdate(parent, old, incoming)).toThrow('operaciones de pieza')
}, 60_000)

it('admits compact input but rejects a result exceeding the existing pretty UTF8 byte boundary', () => {
  const input = document(); input.definitions = [node('source')]
  const p: AssemblyPlaneReference = { kind: 'principal-plane', plane: 'XY', component: component(Array.from({ length: 32 }, () => 'component-123456')) }
  input.mates = Array.from({ length: 4000 }, (_, i) => ({ id: 'bytes-' + i, name: 'Original byte boundary', type: 'width', mode: 'centered', suppressed: true,
    width: [structuredClone(p), structuredClone(p)], tab: [structuredClone(p), structuredClone(p)], widthBranch: 'sum', tabBranch: 'sum', alignment: 'aligned' }))
  expect(new TextEncoder().encode(JSON.stringify(input)).length).toBeLessThan(MAX_ASSEMBLY_BYTES)
  expect(new TextEncoder().encode(JSON.stringify(input, null, 2)).length).toBeGreaterThan(MAX_ASSEMBLY_BYTES)
  expect(() => prepareAssemblyDocumentUpdate(input, old, document('source', 'r1'))).toThrow('serializado supera los 20 MB')
}, 60_000)
