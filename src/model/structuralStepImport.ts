import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument } from './assemblyDocument'
import { createStepSource, type StepSource } from './stepSource'
import type { StepFile } from './stepImport'

export interface StructuralStepImportActions {
  fresh: () => boolean
  read: () => Promise<StepFile | null>
  prepare: (source: StepSource) => Promise<AssemblyDocument>
  confirm: () => Promise<boolean>
  commit: (document: AssemblyDocument) => void
}

/** New unsaved document replacement; no neutral path, scene or Apply grant. */
export async function importStructuralStep(actions: StructuralStepImportActions): Promise<'imported' | 'cancelled' | 'stale'> {
  if (!actions.fresh()) return 'stale'
  const file = await actions.read()
  if (!actions.fresh()) return 'stale'
  if (!file) return 'cancelled'
  if (!/\.(step|stp)$/i.test(file.name)) throw Error('Selecciona un archivo .step o .stp.')
  const source = createStepSource(file.data.slice())
  const prepared = await actions.prepare(source)
  if (!actions.fresh()) return 'stale'
  const document = validateAssemblyDocument(prepared)
  serializeAssemblyDocument(document) // Final autonomous v2 UTF-8 budget before confirmation.
  if (!await actions.confirm()) return 'cancelled'
  if (!actions.fresh()) return 'stale'
  actions.commit(document)
  return 'imported'
}
