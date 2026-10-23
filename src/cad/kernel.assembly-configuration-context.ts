import { validateAssemblyConfiguredDocument, validateConfiguredDocumentJsonData, type AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import type { ConfiguredAssemblySolveOptions } from './kernel.assembly-configuration-solve'

export interface ConfiguredAssemblyWorkerContext { document: AssemblyConfiguredDocument; generation: number }
/** Pure capture shared by renderer and worker. No native implementation is
 * imported into the renderer by this transport/declaration boundary. */
export function captureConfiguredAssemblyWorkerContext(value: unknown): ConfiguredAssemblyWorkerContext {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Configured worker requires a complete data context.')
  const fields = Object.getOwnPropertyDescriptors(value), keys = ['document', 'generation'] as const
  if (Reflect.ownKeys(fields).length !== keys.length || keys.some(key => !fields[key]?.enumerable || !('value' in fields[key]))) throw Error('Configured worker context fields must be exact own data.')
  const generation = fields.generation.value
  if (typeof generation !== 'number' || !Number.isSafeInteger(generation) || generation < 0) throw Error('Configured worker generation must be a nonnegative safe integer.')
  return { document: validateAssemblyConfiguredDocument(fields.document.value), generation }
}
export function captureConfiguredAssemblySolveOptions(value: ConfiguredAssemblySolveOptions): ConfiguredAssemblySolveOptions {
  validateConfiguredDocumentJsonData(value)
  return structuredClone(value)
}
