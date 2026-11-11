import { assemblyDefinitionKey, validateAssemblyDocument, validateCadDocument,
  type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument, type AssemblySourceLink } from '../model/assemblyDocument'
import { validateAssemblySourceLink } from '../model/assemblySourceLinks'

export interface LinkedSourceRead { grantId: string; name: string; content: string; sha256: string }
export interface LinkedSourceTicket {
  epoch: number; generation: number; signature: string; scopePath: string; selectionPath: string
  definition: string; descriptor: string
}
const linkKey = (link: AssemblySourceLink | undefined) => link ? JSON.stringify(validateAssemblySourceLink(link)) : ''
export function linkedSourceBindingKey(epoch: number, definition: AssemblyDefinition): string {
  return JSON.stringify([epoch, definition.kind, assemblyDefinitionKey(definition), linkKey(definition.sourceLink)])
}
export function linkedSourceTicketIsCurrent(ticket: LinkedSourceTicket, current: LinkedSourceTicket & { mounted: boolean }): boolean {
  return current.mounted && (Object.keys(ticket) as (keyof LinkedSourceTicket)[]).every(k => ticket[k] === current[k])
}
export function linkedSourceDescriptor(read: LinkedSourceRead): AssemblySourceLink {
  if (typeof read.grantId !== 'string' || !read.grantId || typeof read.content !== 'string') throw Error('La lectura del origen no está disponible.')
  return validateAssemblySourceLink({ kind: 'local-file', displayName: read.name, contentSha256: read.sha256 })
}
/** Rejected solves do not consume an editable worker-owned source review.
 * Metadata-only previews have no retained review and must release their lease. */
export function linkedSourceFailureDisposition<T extends { grantId?: string }>(pending: T | null, stagedReview: boolean,
  discard: (pending: T) => void): void {
  if (pending && !stagedReview) discard(pending)
}
/** A chooser returns a new owned capability. Reload borrows a binding which a
 * newer operation may still use until this operation has taken a pending lease. */
export function releaseUnstagedLinkedRead(grantId: string | undefined, reload: boolean, current: boolean, release: (id: string) => void): void {
  if (grantId && (!reload || current)) release(grantId)
}
export function requireLinkedSourceUpdateRevision(selected: AssemblyDefinitionReference, incoming: ReturnType<typeof validateCadDocument>): void {
  if (incoming.version === 2 && incoming.revision === selected.revision) throw Error('El subensamblaje ha cambiado pero conserva la misma revisión. El archivo de origen debe declarar una revisión distinta antes de recargarlo.')
}
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameData(v, b[i]))
  if (Array.isArray(b)) return false
  const x = a as Record<string, unknown>, y = b as Record<string, unknown>, keys = Object.keys(x)
  return keys.length === Object.keys(y).length && keys.every(k => Object.hasOwn(y, k) && sameData(x[k], y[k]))
}
/** Compare validated cached data, not a digest label or a native authority.
 * The host may contain unrelated definitions. Every supplied source dependency,
 * including dormant data, must already match before metadata-only attachment. */
export function linkedSourceContentsEqual(input: AssemblyDocument, selected: AssemblyDefinitionReference, incoming: unknown): boolean {
  const document = validateAssemblyDocument(input), source = validateCadDocument(incoming),
    target = document.definitions.find(d => assemblyDefinitionKey(d) === assemblyDefinitionKey(selected))
  if (!target || target.id !== source.id || (target.kind === 'part') !== (source.version === 1)) throw Error('El archivo debe conservar la identidad y el tipo del origen seleccionado.')
  if (target.kind === 'part') return sameData(target.document, source)
  if (source.version !== 2) throw Error('Selecciona el documento de subensamblaje correspondiente.')
  const { sourceLink: _link, ...cached } = target
  const root = { kind: 'assembly', id: source.id, revision: source.revision, name: source.name,
    createdAt: source.createdAt, updatedAt: source.updatedAt, occurrences: source.occurrences, mates: source.mates }
  return sameData(cached, root) && source.definitions.every(d => {
    const existing = document.definitions.find(v => assemblyDefinitionKey(v) === assemblyDefinitionKey(d))
    return !!existing && sameData(existing, d)
  })
}

/** Runtime permissions never live in saved descriptors. Pruning history or a
 * source revision cannot restore an earlier permission by matching a label. */
export class AssemblyLinkedSourceBindings {
  #bindings = new Map<string, string>()
  constructor(private readonly release: (grantId: string) => void) {}
  get(epoch: number, definition: AssemblyDefinition): string | undefined {
    return definition.sourceLink ? this.#bindings.get(linkedSourceBindingKey(epoch, definition)) : undefined
  }
  bind(epoch: number, definition: AssemblyDefinition, grantId: string): void {
    if (!definition.sourceLink || !grantId) throw Error('El origen no tiene un vínculo actual.')
    const key = linkedSourceBindingKey(epoch, definition), old = this.#bindings.get(key)
    this.#bindings.set(key, grantId)
    if (old && old !== grantId && ![...this.#bindings.values()].includes(old)) this.release(old)
  }
  releaseGrant(grantId: string): void {
    for (const [key, value] of this.#bindings) if (value === grantId) this.#bindings.delete(key)
    this.release(grantId)
  }
  retain(epoch: number, document: AssemblyDocument): void {
    const keys = new Set(document.definitions.filter(d => d.sourceLink).map(d => linkedSourceBindingKey(epoch, d))), removed = new Set<string>()
    for (const [key, value] of this.#bindings) if (!keys.has(key)) { this.#bindings.delete(key); removed.add(value) }
    for (const grant of removed) if (![...this.#bindings.values()].includes(grant)) this.release(grant)
  }
  clear(): void {
    const grants = new Set(this.#bindings.values()); this.#bindings.clear()
    for (const grant of grants) this.release(grant)
  }
}
