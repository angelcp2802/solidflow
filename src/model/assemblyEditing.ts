import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyMate, type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import type { RigidPose } from './rigidPose'

type WithoutId<T> = T extends { id: string } ? Omit<T, 'id'> : never
export type NewAssemblyOccurrence = WithoutId<AssemblyOccurrence>
export type NewAssemblyMate = WithoutId<AssemblyMate>
/** scope selects a shared declaration by exact identity; omitted means root. */
export type AssemblyEdit = { scope?: AssemblyDefinitionReference } & (
  | { type: 'insert-occurrence'; occurrence: NewAssemblyOccurrence }
  | { type: 'set-occurrence-pose'; occurrenceId: string; pose: RigidPose }
  | { type: 'rename-occurrence'; occurrenceId: string; name: string }
  | { type: 'set-occurrence-suppressed'; occurrenceId: string; suppressed: boolean }
  | { type: 'set-occurrence-visible'; occurrenceId: string; visible: boolean }
  | { type: 'set-occurrence-fixed'; occurrenceId: string; fixed: boolean }
  | { type: 'delete-occurrence'; occurrenceId: string }
  | { type: 'add-mate'; mate: NewAssemblyMate }
  | { type: 'update-mate'; mateId: string; mate: NewAssemblyMate }
  | { type: 'delete-mate'; mateId: string }
)
const EDIT_FIELDS = {
  'insert-occurrence': ['occurrence'], 'set-occurrence-pose': ['occurrenceId', 'pose'],
  'rename-occurrence': ['occurrenceId', 'name'], 'set-occurrence-suppressed': ['occurrenceId', 'suppressed'],
  'set-occurrence-visible': ['occurrenceId', 'visible'], 'set-occurrence-fixed': ['occurrenceId', 'fixed'],
  'delete-occurrence': ['occurrenceId'], 'add-mate': ['mate'], 'update-mate': ['mateId', 'mate'], 'delete-mate': ['mateId'],
} as const
function fail(message: string): never { throw new Error('Edición de ensamblaje: ' + message) }
/** Copy data fields without invoking accessors, spreading executable inputs or dropping hidden fields. */
function dataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('se esperaba un objeto de datos.')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail('prototipo no válido.')
  const result: Record<string, unknown> = Object.create(null)
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !field.enumerable || !('value' in field)) fail('solo se admiten campos de datos enumerables.')
    result[key] = field.value
  }
  return result
}
function fields(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))
    || required.some(key => !Object.hasOwn(value, key))) fail('campos obligatorios o desconocidos.')
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) fail('identificador no válido.')
  return value
}
function scopeNode(document: AssemblyDocument, scope: unknown): AssemblyDocument | EmbeddedAssemblyDefinition {
  if (scope === undefined) return document
  const value = dataRecord(scope); fields(value, ['id', 'revision'])
  const key = assemblyDefinitionKey({ id: identifier(value.id), revision: identifier(value.revision) })
  const node = [document, ...document.definitions].find(item => assemblyDefinitionKey(item) === key)
  if (!node || node.kind !== 'assembly') fail('el ámbito no identifica una declaración de ensamblaje actual.')
  return node
}
function newData(value: unknown): Record<string, unknown> {
  const result = dataRecord(value)
  if (Object.hasOwn(result, 'id')) fail('una creación o actualización no puede proporcionar otro identificador.')
  return result
}

// The sketch allocator is scoped to EntityProfile proposals and cannot own
// assembly declaration identities. Use the same UUID-namespace/counter idea,
// but retain the safe counter across edits, deletion and discarded history.
let creationNamespace: string | undefined, creationCounter = 0
function freshId(document: AssemblyDocument): string {
  creationNamespace ??= crypto.randomUUID()
  const nodes = [document, ...document.definitions], occupied = new Set(nodes.map(node => node.id))
  for (const node of nodes) if (node.kind === 'assembly') {
    node.occurrences.forEach(item => occupied.add(item.id)); node.mates.forEach(item => occupied.add(item.id))
  }
  // N occupied IDs cannot exhaust N+1 different counter candidates. No
  // tombstone registry grows with edit history. Across processes, namespace
  // collision resistance is supplied by randomUUID, not a persistent registry.
  for (let attempt = 0; attempt <= occupied.size; attempt++) {
    if (creationCounter >= Number.MAX_SAFE_INTEGER) fail('se agotó el contador seguro de nuevas identidades.')
    const id = identifier(`${creationNamespace}-${++creationCounter}`)
    if (!occupied.has(id)) return id
  }
  return fail('no se pudo asignar una identidad nueva.')
}

/**
 * Detached syntax/graph edit only. No solve, native witness or freshness is
 * implied. Prepare a creation once; history/Apply must consume that snapshot.
 * Occurrence edits preserve its definition tuple; scope edits a shared source
 * declaration, so all occurrences of that definition observe the same edit.
 */
export function applyAssemblyEdit(document: AssemblyDocument, operation: AssemblyEdit): AssemblyDocument {
  const next = validateAssemblyDocument(document), before = JSON.stringify(next), edit = dataRecord(operation)
  if (typeof edit.type !== 'string' || !Object.hasOwn(EDIT_FIELDS, edit.type)) fail('operación desconocida.')
  const type = edit.type as keyof typeof EDIT_FIELDS
  fields(edit, ['type', ...EDIT_FIELDS[type]], ['scope'])
  const node = scopeNode(next, edit.scope)
  if (type === 'insert-occurrence') {
    const data = newData(edit.occurrence)
    fields(data, ['name', 'definition', 'pose', 'fixed', 'suppressed', 'visible'])
    // The full validator below checks the new declaration and all nested data
    // before this private candidate can escape. No input object is modified.
    node.occurrences.push({ ...data, id: freshId(next) } as unknown as AssemblyOccurrence)
  } else if (type === 'add-mate' || type === 'update-mate') {
    const data = newData(edit.mate)
    if (type === 'add-mate') node.mates.push({ ...data, id: freshId(next) } as unknown as AssemblyMate)
    else {
      const id = identifier(edit.mateId), index = node.mates.findIndex(item => item.id === id)
      if (index < 0) fail('la relación seleccionada ya no existe en ese ámbito.')
      node.mates[index] = { ...data, id: node.mates[index].id } as unknown as AssemblyMate
    }
  } else if (type === 'delete-mate') {
    const id = identifier(edit.mateId), index = node.mates.findIndex(item => item.id === id)
    if (index < 0) fail('la relación seleccionada ya no existe en ese ámbito.')
    node.mates.splice(index, 1)
  } else {
    const id = identifier(edit.occurrenceId), index = node.occurrences.findIndex(item => item.id === id)
    if (index < 0) fail('la ocurrencia seleccionada ya no existe en ese ámbito.')
    const occurrence = node.occurrences[index]
    if (type === 'set-occurrence-pose') occurrence.pose = edit.pose as RigidPose
    else if (type === 'rename-occurrence') occurrence.name = edit.name as string
    else if (type === 'set-occurrence-suppressed') occurrence.suppressed = edit.suppressed as boolean
    else if (type === 'set-occurrence-visible') occurrence.visible = edit.visible as boolean
    else if (type === 'set-occurrence-fixed') occurrence.fixed = edit.fixed as boolean
    else node.occurrences.splice(index, 1)
    // Deleting a component never deletes or retargets its mate endpoints.
    // The parser preserves those declarations for visible reference repair.
  }
  // Validate nested edit data before JSON comparison can encounter accessors
  // or toJSON. The full parser, rather than an unvalidated spread, clones it.
  const checked = validateAssemblyDocument(next)
  if (JSON.stringify(checked) !== before) {
    const time = Math.max(Date.now(), Date.parse(checked.updatedAt) + 1)
    if (!Number.isFinite(time)) fail('fecha de modificación no válida.')
    checked.updatedAt = new Date(time).toISOString()
  }
  // Revisions remain opaque labels; neither root nor shared definitions are
  // relabeled, and this timestamp grants no native or preview authority.
  return validateAssemblyDocument(checked)
}

export const DEFAULT_ASSEMBLY_HISTORY_STATES = 100
export const MAX_ASSEMBLY_HISTORY_STATES = 256
/** Bounded syntax-only snapshots, including present/past/future in the state cap. */
export class AssemblyDocumentHistory {
  #past: AssemblyDocument[] = []
  #present: AssemblyDocument
  #future: AssemblyDocument[] = []
  readonly #limit: number
  constructor(document: AssemblyDocument, limit = DEFAULT_ASSEMBLY_HISTORY_STATES) {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ASSEMBLY_HISTORY_STATES) fail('el historial admite entre 1 y 256 estados.')
    this.#present = validateAssemblyDocument(document); this.#limit = limit
  }
  /** Read-only property; every read returns a detached, mutable data copy. */
  get current(): AssemblyDocument { return validateAssemblyDocument(this.#present) }
  get canUndo(): boolean { return this.#past.length > 0 }
  get canRedo(): boolean { return this.#future.length > 0 }
  commit(operation: AssemblyEdit): AssemblyDocument { return this.commitDocument(applyAssemblyEdit(this.#present, operation)) }
  /** Syntax only: the caller must separately authenticate a native preview/Apply. */
  commitDocument(document: AssemblyDocument): AssemblyDocument {
    const previous = validateAssemblyDocument(this.#present), next = validateAssemblyDocument(document)
    const result = validateAssemblyDocument(next)
    if (JSON.stringify(next) === JSON.stringify(previous)) return result
    const past = [...this.#past, previous]
    this.#past = this.#limit === 1 ? [] : past.slice(-(this.#limit - 1))
    this.#present = next; this.#future = []
    return result
  }
  undo(): AssemblyDocument {
    const present = validateAssemblyDocument(this.#present), previous = this.#past.at(-1)
    if (!previous) return present
    const next = validateAssemblyDocument(previous), result = validateAssemblyDocument(next)
    const past = this.#past.slice(0, -1), future = [...this.#future, present]
    this.#past = past; this.#future = future; this.#present = next
    return result
  }
  redo(): AssemblyDocument {
    const present = validateAssemblyDocument(this.#present), following = this.#future.at(-1)
    if (!following) return present
    const next = validateAssemblyDocument(following), result = validateAssemblyDocument(next)
    const past = [...this.#past, present], future = this.#future.slice(0, -1)
    this.#past = past; this.#future = future; this.#present = next
    return result
  }
  reset(document: AssemblyDocument): AssemblyDocument {
    validateAssemblyDocument(this.#present)
    const next = validateAssemblyDocument(document), result = validateAssemblyDocument(next)
    this.#present = next; this.#past = []; this.#future = []
    return result
  }
}
