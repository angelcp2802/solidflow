import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDefinitionReference, type AssemblyDocument } from './assemblyDocument'
import { createStepSource, type StepSource } from './stepSource'
import type { StepFile } from './stepImport'

export interface AssemblyStepInsertionActions {
  current: AssemblyDocument
  scope?: AssemblyDefinitionReference
  fresh: () => boolean
  read: () => Promise<StepFile | null>
  prepare: (current: AssemblyDocument, source: StepSource, scope?: AssemblyDefinitionReference) => Promise<AssemblyDocument>
  commit: (document: AssemblyDocument) => void
}

/** One ordinary parent edit after independent native preparation. No file grant. */
export async function insertAssemblyStepFile(actions: AssemblyStepInsertionActions): Promise<'inserted' | 'cancelled' | 'stale'> {
  if (!actions.fresh()) return 'stale'
  const current = validateAssemblyDocument(actions.current)
  let scope: AssemblyDefinitionReference | undefined
  if (actions.scope !== undefined) {
    const value = actions.scope, fields = Object.getOwnPropertyDescriptors(value)
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(fields).length !== 2
      || !['id', 'revision'].every(key => fields[key]?.enumerable && 'value' in fields[key] && typeof fields[key].value === 'string')) {
      throw Error('El ámbito de inserción debe ser una referencia de datos actual.')
    }
    const id = fields.id?.value, revision = fields.revision?.value
    if (typeof id !== 'string' || typeof revision !== 'string') throw Error('El ámbito de inserción requiere identidad y revisión.')
    scope = { id, revision }
    if (![current, ...current.definitions].some(node => node.kind === 'assembly' && node.id === id && node.revision === revision)) {
      throw Error('El ámbito de inserción no pertenece al ensamblaje actual.')
    }
  }
  const file = await actions.read()
  if (!actions.fresh()) return 'stale'
  if (!file) return 'cancelled'
  if (!/\.(step|stp)$/i.test(file.name)) throw Error('Selecciona un archivo .step o .stp.')
  const source = createStepSource(file.data.slice())
  const prepared = await actions.prepare(current, source, scope)
  if (!actions.fresh()) return 'stale'
  const candidate = validateAssemblyDocument(prepared)
  if (candidate.id !== current.id || candidate.revision !== current.revision || candidate.name !== current.name || candidate.createdAt !== current.createdAt) {
    throw Error('La inserción debe conservar la identidad del ensamblaje padre.')
  }
  serializeAssemblyDocument(candidate)
  if (!actions.fresh()) return 'stale'
  actions.commit(candidate)
  return 'inserted'
}
