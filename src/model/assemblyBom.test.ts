import { expect, it } from 'vitest'
import { buildAssemblyBom, MAX_ASSEMBLY_BOM_MEMBERS, MAX_ASSEMBLY_BOM_ROWS,
  validateAssemblyBomOptions, type AssemblyBomMode, type AssemblyBomOptions } from './assemblyBom'
import { MAX_ASSEMBLY_DEPTH, MAX_ASSEMBLY_OCCURRENCES, type AssemblyDefinition,
  type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyOccurrence,
  type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument'
import type { Feature } from '../cad/kernel.types'

// Original synthetic declaration graphs, authored for these tests. Quantities
// below count explicit occurrences; no geometry, solver, imported CAD model or
// native entity authority supplies either the fixtures or the expected values.
const stamp = '2026-10-16T00:00:00.000Z'
const modes: AssemblyBomMode[] = ['parts-only', 'top-level', 'indented']
function part(id = 'P', revision = 'r1', name = 'Canonical part', features: Feature[] = []): EmbeddedPartDefinition {
  return { kind: 'part', id, revision, document: { version: 1, id, name, units: 'mm', features,
    createdAt: stamp, updatedAt: stamp } }
}
function occurrence(id: string, definition: AssemblyDefinitionReference,
  flags: Partial<Pick<AssemblyOccurrence, 'name' | 'visible' | 'suppressed' | 'fixed'>> = {}): AssemblyOccurrence {
  return { id, name: 'Occurrence ' + id, definition: { id: definition.id, revision: definition.revision },
    pose: { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false, ...flags }
}
function group(id: string, occurrences: AssemblyOccurrence[] = [], revision = 'r1', name = 'Canonical group'): EmbeddedAssemblyDefinition {
  return { kind: 'assembly', id, revision, name, occurrences, mates: [], createdAt: stamp, updatedAt: stamp }
}
function assembly(definitions: AssemblyDefinition[] = [], occurrences: AssemblyOccurrence[] = []): AssemblyDocument {
  return { ...group('ROOT', occurrences, 'root-r1', 'Original bill of materials'), version: 2, units: 'mm', definitions }
}
function repeatedGraph(): AssemblyDocument {
  const p1 = part('P', 'r1', 'Canonical pin revision one'), p2 = part('P', 'r2', 'Canonical pin revision two')
  const q = part('Q', 'r1', 'Canonical washer')
  const g = group('G', [occurrence('pin-a', p1, { name: 'Left pin' }), occurrence('pin-b', p1, { name: 'Right pin' }),
    occurrence('washer', q, { name: 'Washer alias' })], 'r1', 'Canonical cartridge')
  return assembly([q, p2, g, p1], [occurrence('cartridge-a', g, { name: 'Front cartridge' }),
    occurrence('cartridge-b', g, { name: 'Back cartridge' }), occurrence('spare', p2, { name: 'Spare pin' })])
}

it('returns an empty detached declaration report with the default policy', () => {
  const input = assembly(), options = validateAssemblyBomOptions(), report = buildAssemblyBom(input)
  expect(options).toEqual({ mode: 'parts-only', includeHidden: true })
  expect(report).toEqual({ kind: 'assembly-bom', source: { id: 'ROOT', revision: 'root-r1', name: input.name }, options, rows: [] })
  expect(Object.keys(report)).toEqual(['kind', 'source', 'options', 'rows'])
  expect(Object.keys(report.source)).toEqual(['id', 'revision', 'name'])
})

it('globally groups flattened parts by exact definition revision and omits subassembly rows', () => {
  const rows = buildAssemblyBom(repeatedGraph()).rows
  expect(rows.map(row => [row.definition, row.kind, row.name, row.quantityPerParent, row.quantityTotal,
    row.parentKey, row.depth, row.itemNumber])).toEqual([
    [{ id: 'P', revision: 'r1' }, 'part', 'Canonical pin revision one', null, 4, null, 0, '1'],
    [{ id: 'Q', revision: 'r1' }, 'part', 'Canonical washer', null, 2, null, 0, '2'],
    [{ id: 'P', revision: 'r2' }, 'part', 'Canonical pin revision two', null, 1, null, 0, '3'],
  ])
  expect(rows[0].members).toEqual([
    { component: { occurrencePath: ['cartridge-a', 'pin-a'], definition: { id: 'P', revision: 'r1' } },
      name: 'Left pin', pathNames: ['Front cartridge', 'Left pin'] },
    { component: { occurrencePath: ['cartridge-a', 'pin-b'], definition: { id: 'P', revision: 'r1' } },
      name: 'Right pin', pathNames: ['Front cartridge', 'Right pin'] },
    { component: { occurrencePath: ['cartridge-b', 'pin-a'], definition: { id: 'P', revision: 'r1' } },
      name: 'Left pin', pathNames: ['Back cartridge', 'Left pin'] },
    { component: { occurrencePath: ['cartridge-b', 'pin-b'], definition: { id: 'P', revision: 'r1' } },
      name: 'Right pin', pathNames: ['Back cartridge', 'Right pin'] },
  ])
})

it('counts only direct root parts and subassemblies in top-level mode', () => {
  const rows = buildAssemblyBom(repeatedGraph(), { mode: 'top-level' }).rows
  expect(rows.map(row => [row.definition, row.kind, row.name, row.quantityPerParent, row.quantityTotal,
    row.depth, row.itemNumber, row.parentKey])).toEqual([
    [{ id: 'G', revision: 'r1' }, 'assembly', 'Canonical cartridge', 2, 2, 0, '1', null],
    [{ id: 'P', revision: 'r2' }, 'part', 'Canonical pin revision two', 1, 1, 0, '2', null],
  ])
  expect(rows[0].members.map(member => member.component.occurrencePath)).toEqual([['cartridge-a'], ['cartridge-b']])
  expect(rows[0].members.map(member => member.name)).toEqual(['Front cartridge', 'Back cartridge'])
})

it('groups indented children by the parent row and reports local and expanded quantities separately', () => {
  const rows = buildAssemblyBom(repeatedGraph(), { mode: 'indented' }).rows
  expect(rows.map(row => [row.definition, row.quantityPerParent, row.quantityTotal, row.depth, row.itemNumber])).toEqual([
    [{ id: 'G', revision: 'r1' }, 2, 2, 0, '1'],
    [{ id: 'P', revision: 'r1' }, 2, 4, 1, '1.1'],
    [{ id: 'Q', revision: 'r1' }, 1, 2, 1, '1.2'],
    [{ id: 'P', revision: 'r2' }, 1, 1, 0, '2'],
  ])
  expect(rows.map(row => row.parentKey)).toEqual([null, rows[0].key, rows[0].key, null])
  expect(rows[1].members.map(member => member.component.occurrencePath)).toEqual([
    ['cartridge-a', 'pin-a'], ['cartridge-a', 'pin-b'], ['cartridge-b', 'pin-a'], ['cartridge-b', 'pin-b'],
  ])
})

it('keeps the same part separate under distinct parent definition contexts in an indented report', () => {
  const p = part(), h = group('H', [occurrence('part', p)]), g = group('G', [occurrence('part', p)])
  const input = assembly([p, g, h], [occurrence('g', g), occurrence('h', h), occurrence('direct', p)])
  const indented = buildAssemblyBom(input, { mode: 'indented' }).rows, flat = buildAssemblyBom(input).rows
  expect(indented.map(row => [row.definition.id, row.quantityPerParent, row.quantityTotal, row.itemNumber])).toEqual([
    ['G', 1, 1, '1'], ['P', 1, 1, '1.1'], ['H', 1, 1, '2'], ['P', 1, 1, '2.1'], ['P', 1, 1, '3'],
  ])
  expect(new Set(indented.filter(row => row.definition.id === 'P').map(row => row.key)).size).toBe(3)
  expect(flat.map(row => [row.definition.id, row.quantityTotal])).toEqual([['P', 3]])
})

it('separates a reused nested group under distinct ancestors while sharing each parent row across copies', () => {
  const p = part(), h = group('H', [occurrence('pin', p), occurrence('pin-2', p)])
  const g = group('G', [occurrence('inner', h), occurrence('inner-2', h)])
  const input = assembly([p, h, g], [occurrence('g-a', g), occurrence('g-b', g), occurrence('h-direct', h)])
  const rows = buildAssemblyBom(input, { mode: 'indented' }).rows
  expect(rows.map(row => [row.definition.id, row.quantityPerParent, row.quantityTotal, row.itemNumber])).toEqual([
    ['G', 2, 2, '1'], ['H', 2, 4, '1.1'], ['P', 2, 8, '1.1.1'], ['H', 1, 1, '2'], ['P', 2, 2, '2.1'],
  ])
  expect(rows.map(row => row.parentKey)).toEqual([null, rows[0].key, rows[1].key, null, rows[3].key])
})

it.each(modes)('keeps exact subassembly revisions and their child contexts distinct in %s mode', mode => {
  const p = part(), old = group('G', [occurrence('pin', p)], 'r1', 'Same canonical assembly label')
  const current = group('G', [occurrence('pin', p), occurrence('pin-2', p)], 'r2', 'Same canonical assembly label')
  const input = assembly([current, p, old], [occurrence('old-a', old), occurrence('current', current), occurrence('old-b', old)])
  const rows = buildAssemblyBom(input, { mode }).rows
  expect(rows.map(row => [row.definition, row.quantityPerParent, row.quantityTotal, row.itemNumber])).toEqual(
    mode === 'parts-only' ? [[{ id: 'P', revision: 'r1' }, null, 4, '1']]
      : mode === 'top-level' ? [[{ id: 'G', revision: 'r1' }, 2, 2, '1'], [{ id: 'G', revision: 'r2' }, 1, 1, '2']]
        : [[{ id: 'G', revision: 'r1' }, 2, 2, '1'], [{ id: 'P', revision: 'r1' }, 1, 2, '1.1'],
          [{ id: 'G', revision: 'r2' }, 1, 1, '2'], [{ id: 'P', revision: 'r1' }, 2, 2, '2.1']])
  expect(new Set(rows.map(row => row.key)).size).toBe(rows.length)
})

it('uses full exact tuples instead of display names or ambiguous delimiters', () => {
  const first = part('a|b', 'c', 'Duplicate label'), second = part('a', 'b|c', 'Duplicate label')
  const third = part('a|b', 'd', 'Duplicate label')
  const input = assembly([third, second, first], [occurrence('third-first', third), occurrence('first', first), occurrence('second', second)])
  const rows = buildAssemblyBom(input).rows
  expect(rows.map(row => row.definition)).toEqual([{ id: 'a|b', revision: 'd' }, { id: 'a|b', revision: 'c' }, { id: 'a', revision: 'b|c' }])
  expect(new Set(rows.map(row => row.key)).size).toBe(3)
  expect(rows.map(row => row.name)).toEqual(['Duplicate label', 'Duplicate label', 'Duplicate label'])
})

it('preserves complete opaque occurrence paths and their display-name chains', () => {
  const p = part(), g = group('G', [occurrence('right', p, { name: 'Nested right' })])
  const input = assembly([p, g], [occurrence('left/right', p, { name: 'Flat slash' }), occurrence('left', g, { name: 'Nested left' })])
  expect(buildAssemblyBom(input).rows[0].members).toEqual([
    { component: { occurrencePath: ['left/right'], definition: { id: 'P', revision: 'r1' } }, name: 'Flat slash', pathNames: ['Flat slash'] },
    { component: { occurrencePath: ['left', 'right'], definition: { id: 'P', revision: 'r1' } }, name: 'Nested right', pathNames: ['Nested left', 'Nested right'] },
  ])
})

function filteredGraph(): AssemblyDocument {
  const a = part('A', 'r1', 'Hidden direct part'), p = part('P', 'r1', 'Shared pin'), q = part('Q', 'r1', 'Visible washer')
  const g = group('G', [occurrence('hidden-pin', p, { visible: false }), occurrence('pin', p),
    occurrence('suppressed-pin', p, { suppressed: true }), occurrence('washer', q)])
  return assembly([a, p, q, g], [occurrence('hidden-direct', a, { visible: false }),
    occurrence('hidden-group', g, { visible: false }), occurrence('visible-group', g),
    occurrence('suppressed-group', g, { suppressed: true }), occurrence('suppressed-direct', a, { suppressed: true })])
}

it.each(modes)('includes hidden occurrences by default but always prunes suppression in %s mode', mode => {
  const rows = buildAssemblyBom(filteredGraph(), { mode }).rows
  const quantities = rows.map(row => [row.definition.id, row.quantityPerParent, row.quantityTotal, row.itemNumber])
  expect(quantities).toEqual(mode === 'parts-only' ? [['A', null, 1, '1'], ['P', null, 4, '2'], ['Q', null, 2, '3']]
    : mode === 'top-level' ? [['A', 1, 1, '1'], ['G', 2, 2, '2']]
      : [['A', 1, 1, '1'], ['G', 2, 2, '2'], ['P', 2, 4, '2.1'], ['Q', 1, 2, '2.2']])
  expect(rows.flatMap(row => row.members).some(member => member.component.occurrencePath.some(id => id.startsWith('suppressed-')))).toBe(false)
})

it.each(modes)('inherits the hidden-exclusion policy and numbers first filtered encounters in %s mode', mode => {
  const rows = buildAssemblyBom(filteredGraph(), { mode, includeHidden: false }).rows
  expect(rows.map(row => [row.definition.id, row.quantityPerParent, row.quantityTotal, row.itemNumber])).toEqual(
    mode === 'parts-only' ? [['P', null, 1, '1'], ['Q', null, 1, '2']]
      : mode === 'top-level' ? [['G', 1, 1, '1']]
        : [['G', 1, 1, '1'], ['P', 1, 1, '1.1'], ['Q', 1, 1, '1.2']])
  expect(rows.flatMap(row => row.members).every(member => !member.component.occurrencePath.some(id => /hidden|suppressed/.test(id)))).toBe(true)
})

it.each(modes)('does not report a dormant part or expand a dormant assembly in %s mode', mode => {
  const p = part(), dormantPart = part('D', 'd1', 'Never instantiated'), dormant = group('Dormant', [occurrence('part', dormantPart)])
  const input = assembly([dormant, dormantPart, p], [occurrence('one', p)])
  expect(buildAssemblyBom(input, { mode }).rows.map(row => [row.definition, row.quantityTotal])).toEqual([[{ id: 'P', revision: 'r1' }, 1]])
})

it.each(modes)('reports no unit for the root itself or a fully pruned branch in %s mode', mode => {
  const p = part(), g = group('G', [occurrence('part', p)]), input = assembly([p, g], [occurrence('suppressed', g, { suppressed: true })])
  expect(buildAssemblyBom(input, { mode }).rows).toEqual([])
  input.occurrences[0].suppressed = false; input.occurrences[0].visible = false
  expect(buildAssemblyBom(input, { mode, includeHidden: false }).rows).toEqual([])
})

it.each(modes)('counts an instantiated empty subassembly as an assembly unit in %s mode', mode => {
  const empty = group('Empty'), input = assembly([empty], [occurrence('one', empty), occurrence('two', empty)])
  expect(buildAssemblyBom(input, { mode }).rows.map(row => [row.kind, row.definition, row.quantityPerParent, row.quantityTotal])).toEqual(
    mode === 'parts-only' ? [] : [['assembly', { id: 'Empty', revision: 'r1' }, 2, 2]])
})

it('counts each declared part once regardless of empty, sketch-only or multiple-body source intent', () => {
  const sketch: Feature = { id: 'sketch', type: 'sketch', name: 'Original sketch', suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'rectangle', center: [0, 0], width: 3, height: 2 } }
  const empty = part('empty'), sketchOnly = part('sketch-only', 'r1', 'Sketch-only source', [sketch])
  const multi = part('multiple-bodies', 'r1', 'Multiple declared bodies', [sketch,
    { id: 'first', type: 'extrude', name: 'First body', suppressed: false, sketchId: 'sketch', depth: 2, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: 'body-a' } },
    { id: 'second', type: 'extrude', name: 'Second body', suppressed: false, sketchId: 'sketch', depth: 4, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: 'body-b' } }])
  expect(buildAssemblyBom(assembly([empty, sketchOnly, multi], [occurrence('empty', empty), occurrence('sketch', sketchOnly),
    occurrence('multi-a', multi), occurrence('multi-b', multi)])).rows.map(row => [row.definition.id, row.quantityTotal])).toEqual([
    ['empty', 1], ['sketch-only', 1], ['multiple-bodies', 2],
  ])
})

it.each(modes)('does not compose poses or require native geometry in %s mode', mode => {
  const p = part(), child = occurrence('part', p), g = group('G', [child]), root = occurrence('group', g)
  // Both local translations are finite and schema-valid; their world sum
  // would overflow IEEE-754. World arithmetic is irrelevant to a declaration BOM.
  root.pose.translation = [1e308, 0, 0]; child.pose.translation = [1e308, 0, 0]
  const input = assembly([p, g], [root]), before = JSON.stringify(input), report = buildAssemblyBom(input, { mode })
  expect(report.rows.map(row => [row.definition.id, row.quantityTotal])).toEqual(mode === 'parts-only' ? [['P', 1]]
    : mode === 'top-level' ? [['G', 1]] : [['G', 1], ['P', 1]])
  expect(JSON.stringify(input)).toBe(before)
  expect(JSON.stringify(report)).not.toContain('pose')
})

it('returns independent records and arrays without history or native authority', () => {
  const input = repeatedGraph(), supplied: Partial<AssemblyBomOptions> = { mode: 'indented', includeHidden: true }
  const before = JSON.stringify(input), report = buildAssemblyBom(input, supplied), independent = buildAssemblyBom(input, supplied)
  const originalMember = structuredClone(report.rows[1].members[1])
  report.source.name = 'Changed report'; report.options.includeHidden = false; report.rows[0].definition.id = 'Changed row'
  report.rows[1].members[0].component.definition.id = 'Changed member'
  report.rows[1].members[0].component.occurrencePath[0] = 'Changed path'; report.rows[1].members[0].pathNames[0] = 'Changed name'
  expect(report.rows[1].definition).toEqual({ id: 'P', revision: 'r1' })
  expect(report.rows[1].members[1]).toEqual(originalMember)
  expect(JSON.stringify(input)).toBe(before)
  expect(independent).toEqual(buildAssemblyBom(input, supplied))
  expect(supplied).toEqual({ mode: 'indented', includeHidden: true })
  input.name = 'Edited source'; input.occurrences[0].name = 'Edited alias'
  expect(independent.source.name).toBe('Original bill of materials')
  expect(independent.rows[0].members[0].name).toBe('Front cartridge')
  expect(Object.keys(independent.rows[0])).toEqual(['key', 'parentKey', 'depth', 'itemNumber', 'kind', 'definition', 'name',
    'quantityPerParent', 'quantityTotal', 'members'])
  expect(Object.keys(independent.rows[0].members[0])).toEqual(['component', 'name', 'pathNames'])
})

it('keeps identity keys stable across label edits and definition-table order changes', () => {
  const input = repeatedGraph(), initial = buildAssemblyBom(input, { mode: 'indented' }).rows.map(row => row.key)
  input.name = 'New root label'; input.definitions.reverse()
  for (const definition of input.definitions) {
    if (definition.kind === 'part') definition.document.name = 'Renamed canonical part'
    else { definition.name = 'Renamed canonical assembly'; definition.occurrences[0].name = 'Renamed nested alias' }
  }
  input.occurrences[0].name = 'Renamed root alias'
  expect(buildAssemblyBom(input, { mode: 'indented' }).rows.map(row => row.key)).toEqual(initial)
})

it('accepts null-prototype options and applies each omitted default independently', () => {
  const options = Object.assign(Object.create(null), { includeHidden: false }) as Partial<AssemblyBomOptions>
  expect(validateAssemblyBomOptions(options)).toEqual({ mode: 'parts-only', includeHidden: false })
  expect(validateAssemblyBomOptions({ mode: 'indented' })).toEqual({ mode: 'indented', includeHidden: true })
  expect(validateAssemblyBomOptions({})).toEqual({ mode: 'parts-only', includeHidden: true })
})

const invalidBomOptions: Array<[string, () => unknown]> = [
  ['null', () => null], ['array', () => []], ['string', () => 'parts-only'],
  ['unknown key', () => ({ extra: true })], ['unknown mode', () => ({ mode: 'purchased' })],
  ['undefined mode', () => ({ mode: undefined })], ['nonboolean visibility', () => ({ includeHidden: 1 })],
  ['inherited visibility', () => Object.create({ includeHidden: false })],
  ['symbol key', () => ({ [Symbol('mode')]: 'indented' })],
  ['hidden key', () => Object.defineProperty({}, 'mode', { value: 'indented', enumerable: false })],
]
it.each(invalidBomOptions)('rejects %s options as data instead of coercing them', (_label, create) => {
  expect(() => validateAssemblyBomOptions(create() as unknown as Partial<AssemblyBomOptions>)).toThrow('Lista de materiales')
})

it('rejects option getters without executing them', () => {
  let reads = 0
  const options = Object.defineProperty({}, 'mode', { enumerable: true, get() { reads++; return 'indented' } })
  expect(() => buildAssemblyBom(assembly(), options)).toThrow('sin accesores')
  expect(reads).toBe(0)
})

it.each(['root name', 'dormant part features', 'filtered occurrence visibility'] as const)('rejects an accessor in %s without invoking it', field => {
  const p = part(), dormant = part('dormant'), input = assembly([p, dormant], [occurrence('hidden', p, { suppressed: true })])
  let reads = 0
  const target = field === 'root name' ? input : field === 'dormant part features' ? dormant.document : input.occurrences[0]
  const key = field === 'root name' ? 'name' : field === 'dormant part features' ? 'features' : 'visible'
  Object.defineProperty(target, key, { enumerable: true, get() { reads++; return field === 'dormant part features' ? [] : true } })
  expect(() => buildAssemblyBom(input, { mode: 'top-level', includeHidden: false })).toThrow('datos JSON')
  expect(reads).toBe(0)
})

it.each(modes)('validates missing dormant references even though %s would not traverse them', mode => {
  const dormant = group('dormant', [occurrence('missing', { id: 'missing', revision: 'r1' })])
  expect(() => buildAssemblyBom(assembly([dormant]), { mode })).toThrow('no encontrada')
})

it.each(['dormant', 'suppressed', 'hidden'] as const)('rejects a definition cycle in a %s branch before filtering', branch => {
  const g = group('G'), h = group('H', [occurrence('back', g)])
  g.occurrences = [occurrence('forward', h)]
  const roots = branch === 'dormant' ? [] : [occurrence('group', g, { suppressed: branch === 'suppressed', visible: branch !== 'hidden' })]
  expect(() => buildAssemblyBom(assembly([g, h], roots), { mode: 'top-level', includeHidden: false })).toThrow('ciclo')
})

it.each(['suppressed pose', 'dormant part', 'duplicate definition', 'duplicate occurrence', 'object cycle'] as const)(
  'validates the full schema before reporting: %s', kind => {
    const p = part(), input = assembly([p], [occurrence('part', p, { suppressed: true })])
    if (kind === 'suppressed pose') input.occurrences[0].pose.translation[0] = Infinity
    else if (kind === 'dormant part') { const dormant = part('dormant'); dormant.document.units = 'inch' as 'mm'; input.definitions.push(dormant) }
    else if (kind === 'duplicate definition') input.definitions.push(part())
    else if (kind === 'duplicate occurrence') input.occurrences.push(occurrence('part', p))
    else Object.assign(input, { loop: input })
    expect(() => buildAssemblyBom(input, { mode: 'top-level', includeHidden: false })).toThrow()
  })

function hierarchy(edges: number): AssemblyDocument {
  const p = part('Leaf', 'r"\\1'), definitions: AssemblyDefinition[] = [p]
  let reference: AssemblyDefinitionReference = p
  for (let index = edges - 2; index >= 0; index--) {
    const current = group('Level-"\\' + index, [occurrence('child', reference)], 'r"\\1')
    definitions.push(current); reference = current
  }
  return assembly(definitions, [occurrence('root', reference)])
}

it('admits the 32-edge graph boundary and encodes a tuple chain without recursive key escaping', () => {
  const input = hierarchy(MAX_ASSEMBLY_DEPTH), rows = buildAssemblyBom(input, { mode: 'indented' }).rows
  expect(rows).toHaveLength(32)
  expect(rows.map(row => row.depth)).toEqual(Array.from({ length: 32 }, (_, index) => index))
  const last = rows[31]
  expect(last.itemNumber).toBe(Array(32).fill('1').join('.'))
  expect(last.members[0].component.occurrencePath).toEqual(['root', ...Array(31).fill('child')])
  expect(JSON.parse(last.key)).toEqual(['indented', [['ROOT', 'root-r1'],
    ...Array.from({ length: 31 }, (_, index) => ['Level-"\\' + index, 'r"\\1'])], ['Leaf', 'r"\\1']])
  expect(last.key.length).toBeLessThan(2000)
})

it.each(modes)('rejects one edge past the graph depth budget before a %s report', mode => {
  const input = hierarchy(MAX_ASSEMBLY_DEPTH + 1); input.occurrences[0].suppressed = true
  expect(() => buildAssemblyBom(input, { mode })).toThrow('jerarquía')
})

it.each(modes)('admits 4096 direct members in %s mode', mode => {
  const p = part(), input = assembly([p], Array.from({ length: MAX_ASSEMBLY_OCCURRENCES }, (_, index) => occurrence('part-' + index, p)))
  const report = buildAssemblyBom(input, { mode })
  expect(report.rows).toHaveLength(1)
  expect(report.rows[0].quantityTotal).toBe(4096)
  expect(report.rows[0].quantityPerParent).toBe(mode === 'parts-only' ? null : 4096)
  expect(report.rows[0].members).toHaveLength(4096)
  expect(report.rows[0].members[4095].component.occurrencePath).toEqual(['part-4095'])
})

function maximumContextGraph(extra = 0): AssemblyDocument {
  // Eleven two-way levels contain 2 + 4 + ... + 2048 = 4094
  // expanded occurrences. Two additional root parts reach exactly 4096.
  const a = part('leaf-A'), b = part('leaf-B'), spareA = part('spare-A'), spareB = part('spare-B')
  const definitions: AssemblyDefinition[] = [a, b, spareA, spareB]
  let first: AssemblyDefinitionReference = a, second: AssemblyDefinitionReference = b
  for (let level = 9; level >= 0; level--) {
    const left = group('left-' + level, [occurrence('L', first), occurrence('R', second)])
    const right = group('right-' + level, [occurrence('L', first), occurrence('R', second)])
    definitions.push(left, right); first = left; second = right
  }
  return assembly(definitions, [occurrence('L', first), occurrence('R', second), occurrence('spare-A', spareA), occurrence('spare-B', spareB),
    ...Array.from({ length: extra }, (_, index) => occurrence('extra-' + index, spareA))])
}

it('admits exactly 4096 rows and members in an expanded graph with distinct parent contexts', () => {
  expect(MAX_ASSEMBLY_BOM_ROWS).toBe(4096); expect(MAX_ASSEMBLY_BOM_MEMBERS).toBe(4096)
  const rows = buildAssemblyBom(maximumContextGraph(), { mode: 'indented' }).rows
  expect(rows).toHaveLength(4096)
  expect(new Set(rows.map(row => row.key)).size).toBe(4096)
  expect(rows.reduce((total, row) => total + row.members.length, 0)).toBe(4096)
  expect(rows.every(row => row.quantityPerParent === 1 && row.quantityTotal === 1)).toBe(true)
  expect(rows.slice(-2).map(row => [row.definition.id, row.itemNumber])).toEqual([['spare-A', '3'], ['spare-B', '4']])
})

it.each(modes)('rejects 4097 expanded occurrences for %s before publishing any filtered report', mode => {
  const input = maximumContextGraph(1)
  for (const root of input.occurrences) { root.visible = false; root.suppressed = true }
  const before = JSON.stringify(input)
  expect(() => buildAssemblyBom(input, { mode, includeHidden: false })).toThrow('presupuesto de jerarquía expandida')
  expect(JSON.stringify(input)).toBe(before)
})
