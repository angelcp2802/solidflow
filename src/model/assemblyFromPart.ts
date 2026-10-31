import type { Document } from './document'
import { parseAssemblyDocument, serializeAssemblyDocument, validateCadDocument, type AssemblyDocument } from './assemblyDocument'
import { identityRigidPose } from './rigidPose'

/** An embedded snapshot, not a linked file or evidence of rebuilt geometry. */
export function createAssemblyFromPart(input: Document): AssemblyDocument {
  const part = validateCadDocument(input)
  if (part.version !== 1) throw new Error('Selecciona un documento de pieza para crear el ensamblaje.')

  // Reserve source identities without rewriting any feature or body reference.
  // The validated snapshot contains only detached JSON data.
  const reserved = new Set<string>(), pending: unknown[] = [part]
  while (pending.length) {
    const value = pending.pop()
    if (typeof value === 'string') reserved.add(value)
    else if (value && typeof value === 'object') for (const child of Object.values(value)) pending.push(child)
  }
  const fresh = () => {
    for (let attempt = 0; attempt < 32; attempt++) {
      const id = crypto.randomUUID()
      if (!reserved.has(id)) { reserved.add(id); return id }
    }
    throw new Error('No se pudo crear una identidad nueva para el ensamblaje.')
  }
  const id = fresh(), revision = fresh(), partRevision = fresh(), occurrenceId = fresh()
  const now = new Date().toISOString()
  const assembly: AssemblyDocument = {
    version: 2, kind: 'assembly', units: 'mm', id, revision,
    name: `Ensamblaje de ${part.name}`.slice(0, 200), createdAt: now, updatedAt: now,
    definitions: [{ kind: 'part', id: part.id, revision: partRevision, document: part }],
    occurrences: [{ id: occurrenceId, name: part.name,
      definition: { id: part.id, revision: partRevision }, pose: identityRigidPose(),
      fixed: true, visible: true, suppressed: false }],
    mates: [],
  }
  // Include pretty-printed serialization overhead in the existing file budget.
  return parseAssemblyDocument(serializeAssemblyDocument(assembly))
}
