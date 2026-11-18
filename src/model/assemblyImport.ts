import { assemblyDefinitionKey, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDefinition,
  type AssemblyDefinitionReference, type AssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { applyAssemblyEdit } from './assemblyEditing'
import { identityRigidPose } from './rigidPose'

function fail(message: string): never { throw new Error('Importación de ensamblaje: ' + message) }

/** Both values are already detached, normalized JSON data from the validator.
 * Object field order is irrelevant; array order and every declared value remain
 * significant. No callback, hash label or native identity supplies equality. */
function sameData(first: unknown, second: unknown): boolean {
  if (first === second) return true
  if (!first || !second || typeof first !== 'object' || typeof second !== 'object') return false
  if (Array.isArray(first)) return Array.isArray(second) && first.length === second.length && first.every((value, index) => sameData(value, second[index]))
  if (Array.isArray(second)) return false
  const a = first as Record<string, unknown>, b = second as Record<string, unknown>, keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameData(a[key], b[key]))
}

/** Resolve before merging: an imported dormant definition cannot become the
 * requested destination merely because the import added its identity. */
function existingScope(document: AssemblyDocument, scope: AssemblyDefinitionReference | undefined): AssemblyDefinitionReference | undefined {
  if (scope === undefined) return undefined
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || ![Object.prototype, null].includes(Object.getPrototypeOf(scope))) fail('el ámbito debe ser una referencia de datos actual.')
  const fields = Object.getOwnPropertyDescriptors(scope), keys = Reflect.ownKeys(fields)
  if (keys.length !== 2 || keys.some(key => typeof key !== 'string' || !['id', 'revision'].includes(key)
    || !fields[key].enumerable || !('value' in fields[key]))) fail('el ámbito requiere exactamente identidad y revisión de datos.')
  const id: unknown = fields.id.value, revision: unknown = fields.revision.value
  const node = [document, ...document.definitions].find(value => value.kind === 'assembly' && value.id === id && value.revision === revision)
  if (!node) fail('el ámbito no identifica un ensamblaje existente del destino.')
  return { id: node.id, revision: node.revision }
}

/** Detached syntax/graph composition only. No geometry, solve, source-link,
 * current native reference, preview token or Apply authority is produced. */
export function insertAssemblyDocument(input: AssemblyDocument, source: AssemblyDocument, scope?: AssemblyDefinitionReference): AssemblyDocument {
  const document = validateAssemblyDocument(input), imported = validateAssemblyDocument(source), target = existingScope(document, scope)
  const rootKey = assemblyDefinitionKey(document)
  const root: EmbeddedAssemblyDefinition = { kind: 'assembly', id: imported.id, revision: imported.revision, name: imported.name,
    createdAt: imported.createdAt, updatedAt: imported.updatedAt, occurrences: imported.occurrences, mates: imported.mates }
  const definitions = new Map<string, AssemblyDefinition>([document, ...document.definitions].map(value => [assemblyDefinitionKey(value), value]))
  const kinds = new Map([document, ...document.definitions].map(value => [value.id, value.kind]))
  // Preserve the complete validated source registry, including dormant entries.
  for (const candidate of [root, ...imported.definitions]) {
    const key = assemblyDefinitionKey(candidate)
    if (key === rootKey) fail('una fuente no puede aportar la identidad de la raíz del destino.')
    if (kinds.has(candidate.id) && kinds.get(candidate.id) !== candidate.kind) fail('una identidad no puede ser pieza y ensamblaje.')
    const existing = definitions.get(key)
    if (existing) {
      if (!sameData(existing, candidate)) fail('la revisión de definición ya existe con contenido distinto: ' + key)
    } else {
      document.definitions.push(candidate); definitions.set(key, candidate); kinds.set(candidate.id, candidate.kind)
    }
  }
  // The editor's existing allocator/graph validation also checks a cycle caused
  // by insertion into a shared or dormant scope. No identities are relabeled.
  const result = applyAssemblyEdit(document, { type: 'insert-occurrence', ...(target === undefined ? {} : { scope: target }),
    occurrence: { name: imported.name, definition: { id: imported.id, revision: imported.revision }, pose: identityRigidPose(),
      fixed: false, suppressed: false, visible: true } })
  // Object validation bounds compact JSON; pretty persisted bytes have their
  // own existing 20 MiB boundary and must also be admitted before publication.
  serializeAssemblyDocument(result)
  return result
}
