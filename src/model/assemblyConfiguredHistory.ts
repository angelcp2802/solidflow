import { validateAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from './assemblyConfiguredDocument'

export const DEFAULT_ASSEMBLY_CONFIGURED_HISTORY_STATES = 100
export const MAX_ASSEMBLY_CONFIGURED_HISTORY_STATES = 100

/** Bounded syntax-only history of complete persisted configuration contexts.
 * Every state includes source, catalog and root selector atomically. History
 * neither authenticates geometry nor stores runtime generation/Apply grants. */
export class AssemblyConfiguredDocumentHistory {
 #past: AssemblyConfiguredDocument[] = []
 #present: AssemblyConfiguredDocument
 #future: AssemblyConfiguredDocument[] = []
 readonly #limit: number
 constructor(document: AssemblyConfiguredDocument, limit = DEFAULT_ASSEMBLY_CONFIGURED_HISTORY_STATES) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ASSEMBLY_CONFIGURED_HISTORY_STATES) throw Error('Configured history supports between1 and100 complete states.')
  this.#present = validateAssemblyConfiguredDocument(document)
  this.#limit = limit
 }
 /** A detached mutable copy; callers cannot mutate retained history snapshots. */
 get current(): AssemblyConfiguredDocument { return structuredClone(this.#present) }
 get canUndo(): boolean { return this.#past.length > 0 }
 get canRedo(): boolean { return this.#future.length > 0 }
 /** Syntax only. The caller must separately authenticate any native Apply.
  * Validate and detach before changing either side of the history branch. */
 commitDocument(document: AssemblyConfiguredDocument): AssemblyConfiguredDocument {
  const next = validateAssemblyConfiguredDocument(document)
  const result = structuredClone(next)
  if (JSON.stringify(next) === JSON.stringify(this.#present)) return result
  const past = [...this.#past, this.#present]
  this.#past = this.#limit === 1 ? [] : past.slice(-(this.#limit - 1))
  this.#present = next
  this.#future = []
  return result
 }
 undo(): AssemblyConfiguredDocument {
  const previous = this.#past.at(-1)
  if (!previous) return this.current
  const result = structuredClone(previous)
  const past = this.#past.slice(0, -1), future = [...this.#future, this.#present]
  this.#present = previous
  this.#past = past
  this.#future = future
  return result
 }
 redo(): AssemblyConfiguredDocument {
  const following = this.#future.at(-1)
  if (!following) return this.current
  const result = structuredClone(following)
  const past = [...this.#past, this.#present], future = this.#future.slice(0, -1)
  this.#present = following
  this.#past = past
  this.#future = future
  return result
 }
 reset(document: AssemblyConfiguredDocument): AssemblyConfiguredDocument {
  const next = validateAssemblyConfiguredDocument(document), result = structuredClone(next)
  this.#present = next
  this.#past = []
  this.#future = []
  return result
 }
}
