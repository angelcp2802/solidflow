import { expect, it } from 'vitest'
import { MAX_ASSEMBLY_BOM_CSV_BYTES, serializeAssemblyBomCsv } from './assemblyBomCsv'
import { buildAssemblyBom } from './assemblyBom'
import { validateAssemblyDocument, type AssemblyDefinition, type AssemblyDefinitionReference,
  type AssemblyDocument, type AssemblyOccurrence, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument'
import { identityRigidPose } from './rigidPose'

// Original syntax-only fixtures, authored here from empty part documents and
// identity placements. No imported CAD, native geometry or file paths are used.
const date = '2026-10-15T00:00:00.000Z'
const header = '\ufeff"Item","Type","Name","Definition ID","Revision","Quantity per parent","Total quantity","Occurrence paths"\r\n'
function part(name = 'Original part', id = '0007', revision = '0002'): EmbeddedPartDefinition {
  return { kind: 'part', id, revision, document: { version: 1, id, name, units: 'mm', features: [], createdAt: date, updatedAt: date } }
}
function occurrence(id: string, definition: AssemblyDefinitionReference): AssemblyOccurrence {
  return { id, name: 'Instance ' + id, definition: { id: definition.id, revision: definition.revision },
    pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }
}
function node(id: string, occurrences: AssemblyOccurrence[]): EmbeddedAssemblyDefinition {
  return { kind: 'assembly', id, revision: 's1', name: 'Original subassembly', occurrences, mates: [], createdAt: date, updatedAt: date }
}
function assembly(definitions: AssemblyDefinition[] = [part()], occurrences = [occurrence('left', definitions[0]), occurrence('right', definitions[0])]): AssemblyDocument {
  return { ...node('original-root', occurrences), version: 2, units: 'mm', definitions }
}

// Independent small RFC 4180 reader: quoted fields only, no serializer helpers.
function records(csv: string): string[][] {
  expect(csv.startsWith('\ufeff')).toBe(true)
  const rows: string[][] = []
  let index = 1
  while (index < csv.length) {
    const row: string[] = []
    while (true) {
      expect(csv[index++]).toBe('"')
      let value = ''
      while (index < csv.length) {
        const character = csv[index++]
        if (character !== '"') value += character
        else if (csv[index] === '"') { value += '"'; index++ }
        else break
      }
      row.push(value)
      if (csv[index] === ',') { index++; continue }
      expect(csv.slice(index, index + 2)).toBe('\r\n'); index += 2
      break
    }
    rows.push(row)
  }
  return rows
}

it('emits a fixed eight-column BOM/CRLF golden with quoted text, numeric totals and empty per-parent quantity', () => {
  const input = assembly(), before = structuredClone(input)
  const expected = header + '"\'1","\'part","\'Original part","\'0007","\'0002","","2","\'[[""left""],[""right""]]"\r\n'
  expect(serializeAssemblyBomCsv(input)).toBe(expected)
  expect(serializeAssemblyBomCsv(input)).toBe(expected)
  expect(input).toEqual(before)
  expect([...new TextEncoder().encode(expected).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
})

it('exports an empty report as the exact fixed quoted header and final CRLF', () => {
  expect(serializeAssemblyBomCsv(assembly([], []))).toBe(header)
})

it.each([
  ['=SUM(1,2)', `"'=SUM(1,2)"`],
  ['+1', `"'+1"`],
  ['-1', `"'-1"`],
  ['@lookup', `"'@lookup"`],
  ['  =1', `"'  =1"`],
  ['\t=1', `"'\t=1"`],
  ['\r\n=1', `"'\r\n=1"`],
  ['one,two', `"'one,two"`],
  ['a"b', `"'a""b"`],
  ["'literal", `"''literal"`],
  ['Écrou 🛠', `"'Écrou 🛠"`],
  ['e\u0301', `"'e\u0301"`],
])('preserves and safely quotes the original name %j with one added apostrophe', (name, field) => {
  const definition = part(name), csv = serializeAssemblyBomCsv(assembly([definition], [occurrence('one', definition)]))
  expect(csv).toBe(header + `"'1","'part",${field},"'0007","'0002","","1","'[[""one""]]"\r\n`)
  expect(records(csv)[1][2]).toBe("'" + name)
})

it('adds the text marker to opaque formula-like identities and complete JSON paths without changing display IDs', () => {
  const definition = part('Original part', '=0007', '+0002'), input = assembly([definition], [occurrence('@slot,"a"', definition)])
  const values = records(serializeAssemblyBomCsv(input))[1]
  expect(values).toEqual(["'1", "'part", "'Original part", "'=0007", "'+0002", '', '1', `'[["@slot,\\"a\\""]]`])
  const report = buildAssemblyBom(input)
  expect(report.rows[0].definition).toEqual({ id: '=0007', revision: '+0002' })
  expect(report.rows[0].members[0].component.occurrencePath).toEqual(['@slot,"a"'])
})

it('exports indented parent and total quantities from reused subassemblies with full paths', () => {
  const pin = part(), sub = node('sub', [occurrence('a', pin), occurrence('b', pin)])
  const input = assembly([pin, sub], [occurrence('left', sub), occurrence('right', sub)])
  const values = records(serializeAssemblyBomCsv(input, { mode: 'indented' }))
  expect(values.slice(1)).toEqual([
    ["'1", "'assembly", "'Original subassembly", "'sub", "'s1", '2', '2', `'[["left"],["right"]]`],
    ["'1.1", "'part", "'Original part", "'0007", "'0002", '2', '4', `'[["left","a"],["left","b"],["right","a"],["right","b"]]`],
  ])
})

it('delegates mode and inherited hidden/suppressed filtering to the declaration report', () => {
  const pin = part(), sub = node('sub', [occurrence('a', pin)])
  const visible = occurrence('shown', sub), hidden = occurrence('hidden', sub), suppressed = occurrence('suppressed', sub)
  hidden.visible = false; suppressed.suppressed = true
  const input = assembly([pin, sub], [visible, hidden, suppressed])
  expect(records(serializeAssemblyBomCsv(input))[1].slice(5)).toEqual(['', '2', `'[["shown","a"],["hidden","a"]]`])
  expect(records(serializeAssemblyBomCsv(input, { mode: 'top-level', includeHidden: false })).slice(1)).toEqual([
    ["'1", "'assembly", "'Original subassembly", "'sub", "'s1", '1', '1', `'[["shown"]]`],
  ])
})

it.each(['nul\u0000name', 'high\ud800', 'low\udfff', 'pair\ud800x'])('rejects invalid exported Unicode text %j before publishing a CSV', name => {
  const definition = part(name)
  expect(() => serializeAssemblyBomCsv(assembly([definition], [occurrence('one', definition)]))).toThrow(/NUL|Unicode/)
})

it('rejects lone surrogates in identities and path elements before JSON escaping can hide them', () => {
  const definition = part('Original part', 'id\ud800'), input = assembly([definition], [occurrence('path\udfff', definition)])
  expect(() => serializeAssemblyBomCsv(input)).toThrow('Unicode')
  input.occurrences[0].id = 'valid-path'
  expect(() => serializeAssemblyBomCsv(input)).toThrow('Unicode')
})

it('rejects malformed assembly data and unknown BOM options through the shared model boundary', () => {
  expect(() => serializeAssemblyBomCsv({ ...assembly(), units: 'inch' } as unknown as AssemblyDocument)).toThrow()
  expect(() => serializeAssemblyBomCsv(assembly(), { mode: 'flat' } as never)).toThrow()
  expect(() => serializeAssemblyBomCsv(assembly(), { includeHidden: 'yes' } as never)).toThrow()
})

it('caps the encoded CSV at 20 MiB even when repeated Unicode paths expand a much smaller valid document', () => {
  const pin = part(), definitions: AssemblyDefinition[] = [pin]
  let child: AssemblyDefinition = node('sub-0', Array.from({ length: 2800 }, (_, index) => occurrence('leaf-' + index, pin)))
  definitions.push(child)
  for (let index = 1; index < 30; index++) {
    child = node('sub-' + index, [occurrence('é'.repeat(128), child)])
    definitions.push(child)
  }
  const input = assembly(definitions, [occurrence('é'.repeat(128), child)])
  expect(MAX_ASSEMBLY_BOM_CSV_BYTES).toBe(20 * 1024 * 1024)
  expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeLessThan(MAX_ASSEMBLY_BOM_CSV_BYTES)
  expect(validateAssemblyDocument(input).occurrences).toHaveLength(1)
  expect(() => serializeAssemblyBomCsv(input)).toThrow('20 MB')
})
