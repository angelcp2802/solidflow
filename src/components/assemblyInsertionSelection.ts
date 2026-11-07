import { assemblyDefinitionKey, serializeAssemblyDocument, type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'

export interface AssemblyInsertionNavigation {
  scopePath: readonly string[]
  epoch: number
}

export interface AssemblyInsertionSelection {
  component: AssemblyComponentReference
  scope: AssemblyDefinitionReference
  navigation: AssemblyInsertionNavigation
  signature: string
  document: AssemblyDocument
}

function scopeAt(document: AssemblyDocument, path: readonly string[]) {
  let scope: AssemblyDocument | EmbeddedAssemblyDefinition = document
  for (const id of path) {
    const occurrences = scope.occurrences.filter(value => value.id === id)
    if (occurrences.length !== 1 || occurrences[0].suppressed || !occurrences[0].visible) return null
    const definitions = document.definitions.filter(value => assemblyDefinitionKey(value) === assemblyDefinitionKey(occurrences[0].definition))
    if (definitions.length !== 1 || definitions[0].kind !== 'assembly') return null
    scope = definitions[0]
  }
  return scope
}

/** Presentation destination only: one added declaration in the captured scope,
 * not the last tree row, its name, or another instance of a reused definition. */
export function retainAssemblyInsertionSelection(before: AssemblyDocument, after: AssemblyDocument,
  navigation: AssemblyInsertionNavigation): AssemblyInsertionSelection | null {
  if (assemblyDefinitionKey(before) !== assemblyDefinitionKey(after)) return null
  const previous = scopeAt(before, navigation.scopePath), next = scopeAt(after, navigation.scopePath)
  if (!previous || !next || assemblyDefinitionKey(previous) !== assemblyDefinitionKey(next)) return null
  const oldIds = new Set(previous.occurrences.map(value => value.id))
  const added = next.occurrences.filter(value => !oldIds.has(value.id))
  if (added.length !== 1 || next.occurrences.length !== previous.occurrences.length + 1
    || previous.occurrences.some(value => next.occurrences.filter(row => row.id === value.id).length !== 1)) return null
  const occurrence = added[0]
  if (occurrence.suppressed || !occurrence.visible
    || after.definitions.filter(value => assemblyDefinitionKey(value) === assemblyDefinitionKey(occurrence.definition)).length !== 1) return null
  return { component: { occurrencePath: [...navigation.scopePath, occurrence.id], definition: { ...occurrence.definition } },
    scope: { id: next.id, revision: next.revision }, navigation: { scopePath: [...navigation.scopePath], epoch: navigation.epoch },
    signature: serializeAssemblyDocument(after), document: after }
}

/** Reopening/undoing to identical bytes is a different document session. */
export function resolveAssemblyInsertionSelection(ticket: AssemblyInsertionSelection | null, document: AssemblyDocument,
  navigation: AssemblyInsertionNavigation): AssemblyComponentReference | null {
  if (!ticket || ticket.document !== document || ticket.navigation.epoch !== navigation.epoch
    || JSON.stringify(ticket.navigation.scopePath) !== JSON.stringify(navigation.scopePath)
    || ticket.signature !== serializeAssemblyDocument(document)) return null
  const scope = scopeAt(document, navigation.scopePath)
  if (!scope || assemblyDefinitionKey(scope) !== assemblyDefinitionKey(ticket.scope)) return null
  const occurrence = scope.occurrences.find(value => value.id === ticket.component.occurrencePath.at(-1))
  if (!occurrence || occurrence.suppressed || !occurrence.visible
    || assemblyDefinitionKey(occurrence.definition) !== assemblyDefinitionKey(ticket.component.definition)) return null
  return { occurrencePath: [...ticket.component.occurrencePath], definition: { ...ticket.component.definition } }
}
