import { assemblyDefinitionKey, MAX_ASSEMBLY_DEPTH, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyDefinitionReference, type AssemblyDocument, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { serializeCadDocument, validateCadDocument } from '../model/cadDocument'
import type { Document } from '../model/document'
import { captureOwnDataRecord } from '../model/ownDataRecord'

export interface AssemblyEmbeddedPartEditContext {
  document: AssemblyDocument
  ownerEpoch: number
  scopePath: readonly string[]
}

/** Ephemeral declaration context only; never saved, a file grant or Apply proof. */
export interface AssemblyEmbeddedPartEditTicket {
  readonly document: AssemblyDocument
  readonly signature: string
  readonly ownerEpoch: number
  readonly scopePath: readonly string[]
  readonly occurrencePath: readonly string[]
  readonly source: Readonly<AssemblyDefinitionReference>
  readonly partDocumentId: string
  readonly baselineSerialized: string
  readonly initialDocument: Document
  readonly nonce: string
}

export interface AssemblyEmbeddedPartEditResolved {
  source: AssemblyDefinitionReference
  document: Document
  nonce: string
}

export interface AssemblyEmbeddedPartReturn {
  document: Document
  changed: boolean
  source: AssemblyDefinitionReference
}

const ticketFields = ['document', 'signature', 'ownerEpoch', 'scopePath', 'occurrencePath', 'source',
  'partDocumentId', 'baselineSerialized', 'initialDocument', 'nonce'] as const

function identifier(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value)
}

function path(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_ASSEMBLY_DEPTH) throw Error('Ruta de edición no válida.')
  if (Reflect.ownKeys(value).length !== value.length + 1) throw Error('La ruta debe contener sólo sus elementos.')
  const result: string[] = []
  for (let index = 0; index < value.length; index++) {
    const field = Object.getOwnPropertyDescriptor(value, String(index))
    if (!field || !field.enumerable || !('value' in field) || !identifier(field.value)) throw Error('La ruta requiere identificadores de datos.')
    result.push(field.value)
  }
  return result
}

function contextData(context: AssemblyEmbeddedPartEditContext) {
  const data = captureOwnDataRecord(context, ['document', 'ownerEpoch', 'scopePath'], undefined, 'Edición de pieza')
  const ownerEpoch = data.get('ownerEpoch')
  if (typeof ownerEpoch !== 'number' || !Number.isSafeInteger(ownerEpoch) || ownerEpoch < 0) throw Error('Sesión de edición no válida.')
  return { document: data.get('document'), ownerEpoch, scopePath: path(data.get('scopePath')) }
}

const samePath = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, index) => id === b[index])

/** Resolve saved ownership, including exact hidden/suppressed declarations.
 * Visibility and native geometry remain separate UI/worker decisions. */
function partAt(document: AssemblyDocument, scopePath: readonly string[], occurrencePath: readonly string[]): EmbeddedPartDefinition | null {
  if (!occurrencePath.length) return null
  const definitions = new Map([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  const at = (selectedPath: readonly string[]) => {
    let node = definitions.get(assemblyDefinitionKey(document))!
    for (const id of selectedPath) {
      if (node.kind !== 'assembly') return null
      const matches = node.occurrences.filter(value => value.id === id)
      if (matches.length !== 1) return null
      const next = definitions.get(assemblyDefinitionKey(matches[0].definition))
      if (!next) return null
      node = next
    }
    return node
  }
  // Component commands use global tree ownership, not a relation-scope prefix.
  // Still validate and bind the independent current scope as stale UI context.
  if (at(scopePath)?.kind !== 'assembly') return null
  const selected = at(occurrencePath)
  return selected?.kind === 'part' ? selected : null
}

/** Capture only after complete JSON/graph validation, before reading a part. */
export function retainAssemblyEmbeddedPartEdit(context: AssemblyEmbeddedPartEditContext,
  occurrencePath: readonly string[], nonce: string): AssemblyEmbeddedPartEditTicket | null {
  try {
    const current = contextData(context), selectedPath = path(occurrencePath)
    if (!identifier(nonce)) return null
    const document = validateAssemblyDocument(current.document), part = partAt(document, current.scopePath, selectedPath)
    if (!part) return null
    const initialDocument = validateCadDocument(part.document)
    if (initialDocument.version !== 1) return null
    return Object.freeze({ document: current.document as AssemblyDocument, signature: serializeAssemblyDocument(document),
      ownerEpoch: current.ownerEpoch, scopePath: Object.freeze(current.scopePath), occurrencePath: Object.freeze(selectedPath),
      source: Object.freeze({ id: part.id, revision: part.revision }), partDocumentId: initialDocument.id,
      baselineSerialized: serializeCadDocument(initialDocument), initialDocument, nonce })
  } catch { return null }
}

/** Equal reopened bytes or an equal-bytes ABA cannot replace the captured owner. */
export function resolveAssemblyEmbeddedPartEdit(ticket: AssemblyEmbeddedPartEditTicket | null,
  context: AssemblyEmbeddedPartEditContext): AssemblyEmbeddedPartEditResolved | null {
  if (!ticket) return null
  try {
    const data = captureOwnDataRecord(ticket, ticketFields, undefined, 'Sesión de edición de pieza'), current = contextData(context)
    if (data.get('document') !== current.document || data.get('ownerEpoch') !== current.ownerEpoch
      || !samePath(path(data.get('scopePath')), current.scopePath) || !identifier(data.get('nonce'))) return null
    const document = validateAssemblyDocument(current.document)
    if (data.get('signature') !== serializeAssemblyDocument(document)) return null
    const selected = partAt(document, current.scopePath, path(data.get('occurrencePath')))
    if (!selected) return null
    const source = captureOwnDataRecord(data.get('source'), ['id', 'revision'], undefined, 'Origen de pieza')
    if (source.get('id') !== selected.id || source.get('revision') !== selected.revision
      || data.get('partDocumentId') !== selected.document.id || data.get('baselineSerialized') !== serializeCadDocument(selected.document)) return null
    return { source: { id: selected.id, revision: selected.revision }, document: selected.document, nonce: data.get('nonce') as string }
  } catch { return null }
}

/** Detached return intent only. The existing source review must update all uses,
 * repair topology and obtain a fresh native preview before authenticated Apply. */
export function prepareAssemblyEmbeddedPartReturn(ticket: AssemblyEmbeddedPartEditTicket | null,
  context: AssemblyEmbeddedPartEditContext, candidate: unknown): AssemblyEmbeddedPartReturn {
  const current = resolveAssemblyEmbeddedPartEdit(ticket, context)
  if (!current || !ticket) throw Error('El ensamblaje o el origen cambió. Vuelve a abrir la edición de la pieza.')
  const document = validateCadDocument(candidate)
  if (document.version !== 1 || document.id !== current.document.id) throw Error('La pieza editada debe conservar la identidad del origen.')
  const serialized = serializeCadDocument(document)
  return { document, changed: serialized !== ticket.baselineSerialized, source: { ...current.source } }
}
