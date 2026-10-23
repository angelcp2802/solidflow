import { buildAssemblyBom, type AssemblyBomOptions } from './assemblyBom'
import type { AssemblyDocument } from './assemblyDocument'

/** Includes the UTF-8 BOM, quoted fields, separators and final CRLF. */
export const MAX_ASSEMBLY_BOM_CSV_BYTES = 20 * 1024 * 1024

function fail(message: string): never { throw new Error('CSV de lista de materiales: ' + message) }

function requireText(value: string): string {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code === 0) fail('el texto no puede contener NUL.')
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index)
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('el texto contiene un sustituto Unicode aislado.')
    } else if (code >= 0xdc00 && code <= 0xdfff) fail('el texto contiene un sustituto Unicode aislado.')
  }
  return value
}

function quote(value: string): string { return '"' + value.replace(/"/g, '""') + '"' }
// Add exactly one data marker, even when the original text starts with one.
// Formula-like strings, leading whitespace and opaque numeric IDs all retain
// their original spelling after that marker; the in-app report is unchanged.
function text(value: string): string { return quote("'" + requireText(value)) }
function quantity(value: number | null): string {
  if (value === null) return quote('')
  if (!Number.isSafeInteger(value) || value <= 0) fail('la cantidad debe ser un entero positivo seguro.')
  return quote(String(value))
}

/** Declaration-only CSV; it does not export solids or assert native freshness. */
export function serializeAssemblyBomCsv(input: AssemblyDocument, options?: Partial<AssemblyBomOptions>): string {
  const report = buildAssemblyBom(input, options), encoder = new TextEncoder()
  const lines: string[] = ['\ufeff']
  let bytes = 3
  const append = (fields: string[]) => {
    const line = fields.join(',') + '\r\n'
    bytes += encoder.encode(line).byteLength
    if (bytes > MAX_ASSEMBLY_BOM_CSV_BYTES) fail('el archivo supera los 20 MB admitidos; no se publica un CSV parcial.')
    lines.push(line)
  }
  append(['Item', 'Type', 'Name', 'Definition ID', 'Revision', 'Quantity per parent', 'Total quantity', 'Occurrence paths'].map(quote))
  for (const row of report.rows) {
    // Check path elements before JSON escaping could hide invalid Unicode/NUL.
    const paths = row.members.map(member => member.component.occurrencePath.map(requireText))
    append([text(row.itemNumber), text(row.kind), text(row.name), text(row.definition.id), text(row.definition.revision),
      quantity(row.quantityPerParent), quantity(row.quantityTotal), text(JSON.stringify(paths))])
  }
  return lines.join('')
}
