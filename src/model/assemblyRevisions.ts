import { assemblyDefinitionKey, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDefinition, type AssemblyOccurrence, type AssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { assemblyMateEndpoints, assemblyMateEndpointComponent, withAssemblyMateEndpoint, withAssemblyMateEndpointComponent } from './assemblyMateEndpoints'

/** Explicit declaration revision, not a geometric edit or native proof. */
export function createAssemblyRootRevision(input: AssemblyDocument, revision: string): AssemblyDocument {
  const before = validateAssemblyDocument(input)
  if (typeof revision !== 'string' || !revision.trim() || revision.length > 128 || /[\x00-\x1f\x7f]/.test(revision)) throw Error('La revisión debe ser una etiqueta de datos válida.')
  const oldKey = assemblyDefinitionKey(before), nextRef = { id: before.id, revision }, nextKey = assemblyDefinitionKey(nextRef)
  const registry = new Map<string, AssemblyDefinition>([before, ...before.definitions].map(value => [assemblyDefinitionKey(value), value]))
  if (registry.has(nextKey)) throw Error('La revisión nueva ya existe o coincide con la actual.')
  const after = validateAssemblyDocument(before)
  const nodes = (document: AssemblyDocument) => [document, ...document.definitions.filter((value): value is EmbeddedAssemblyDefinition => value.kind === 'assembly')]
  const previousNodes = nodes(before), nextNodes = nodes(after)
  for (let n = 0; n < previousNodes.length; n++) {
    const previous = previousNodes[n], target = nextNodes[n]
    for (const occurrence of target.occurrences) if (assemblyDefinitionKey(occurrence.definition) === oldKey) occurrence.definition = { ...nextRef }
    previous.mates.forEach((mate, index) => {
      for (const { side, reference } of assemblyMateEndpoints(mate)) {
        if (!reference) continue
        const owner = assemblyMateEndpointComponent(reference)
        if (!owner || assemblyDefinitionKey(owner.definition) !== oldKey) continue
        let terminal: AssemblyDefinition | undefined = previous
        for (const id of owner.occurrencePath) {
          const occurrence: AssemblyOccurrence | undefined = terminal?.kind === 'assembly' ? terminal.occurrences.find(value => value.id === id) : undefined
          terminal = occurrence ? registry.get(assemblyDefinitionKey(occurrence.definition)) : undefined
          if (!terminal) break
        }
        if (terminal && ('occurrencePath' in reference || 'kind' in reference && (reference.kind === 'principal-plane' || reference.kind === 'principal-axis')) && assemblyDefinitionKey(terminal) === oldKey) target.mates[index] = withAssemblyMateEndpoint(target.mates[index], side,
          withAssemblyMateEndpointComponent(reference, { ...owner, definition: { ...nextRef } }))
      }
    })
  }
  after.revision = revision
  const date = new Date(Math.max(Date.now(), Date.parse(before.updatedAt) + 1))
  if (!Number.isFinite(date.getTime())) throw Error('Fecha de modificación no válida.')
  after.updatedAt = date.toISOString()
  const result = validateAssemblyDocument(after)
  serializeAssemblyDocument(result)
  return result
}
