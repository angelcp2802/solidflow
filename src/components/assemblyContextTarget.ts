import { assemblyDefinitionKey, validateAssemblyDocument, type AssemblyComponentReference, type AssemblyDefinition, type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { AssemblyOriginTreeEntry } from './assemblyOriginTree'
import type { AssemblyOriginReference } from './assemblyOriginPicking'

export interface AssemblyTreeRow {
  path: string[]; occurrence: AssemblyOccurrence; parent: AssemblyDefinitionReference; definition: AssemblyDefinition
  visible: boolean; suppressed: boolean
}

/** Saved occurrence paths, including reused nested declarations; never sibling indexes. */
export function assemblyTreeRows(document: AssemblyDocument): AssemblyTreeRow[] {
  const table = new Map(document.definitions.map(value => [assemblyDefinitionKey(value), value])), rows: AssemblyTreeRow[] = []
  const visit = (node: AssemblyDocument | EmbeddedAssemblyDefinition, prefix: string[], visible: boolean, suppressed: boolean) => {
    for (const occurrence of node.occurrences) {
      const definition = table.get(assemblyDefinitionKey(occurrence.definition))
      if (!definition) throw new Error('Falta la definición de una ocurrencia.')
      const path = [...prefix, occurrence.id], inheritedVisible = visible && occurrence.visible, inheritedSuppressed = suppressed || occurrence.suppressed
      rows.push({ path, occurrence, parent: { id: node.id, revision: node.revision }, definition, visible: inheritedVisible, suppressed: inheritedSuppressed })
      if (definition.kind === 'assembly') visit(definition, path, inheritedVisible, inheritedSuppressed)
    }
  }
  visit(document, [], true, false); return rows
}

export interface AssemblyComponentContextTarget {
  readonly documentSignature: string
  readonly scopePath: readonly string[]
  /** Absolute document path; this is a presentation ticket, not a mate endpoint. */
  readonly component: AssemblyComponentReference
}

const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, index) => id === b[index])

function currentRow(document: AssemblyDocument, scopePath: readonly string[], componentPath: readonly string[]): AssemblyTreeRow | null {
  // Validate before traversal: duplicate IDs/definitions and recursive graphs must not
  // become an apparently unique menu destination through a Map or first-match lookup.
  validateAssemblyDocument(document)
  // The component tree is global. Edit scope belongs to relation authoring;
  // component commands act on row.parent, including outside that scope.
  if (componentPath.length === 0) return null
  const rows = assemblyTreeRows(document)
  if (scopePath.length) {
    const scopes = rows.filter(row => samePath(row.path, scopePath))
    if (scopes.length !== 1 || scopes[0].definition.kind !== 'assembly') return null
  }
  const matches = rows.filter(row => samePath(row.path, componentPath))
  return matches.length === 1 ? matches[0] : null
}

/** Capture only exact current declaration identity. No native authority or mutation. */
export function createAssemblyComponentContextTarget(document: AssemblyDocument, scopePath: readonly string[], componentPath: readonly string[]): AssemblyComponentContextTarget | null {
  try {
    const row = currentRow(document, scopePath, componentPath)
    return row ? { documentSignature: JSON.stringify(document), scopePath: [...scopePath],
      component: { occurrencePath: [...row.path], definition: { ...row.occurrence.definition } } } : null
  } catch { return null }
}

/** Return the current row, never a declaration retained by an old menu callback.
 * Byte-identical document replacement is allowed by this signature contract;
 * the workspace separately closes menus when its document session changes. */
export function resolveAssemblyComponentContextTarget(ticket: AssemblyComponentContextTarget | null | undefined,
  document: AssemblyDocument, scopePath: readonly string[], selectedPath: readonly string[]): AssemblyTreeRow | null {
  if (!ticket) return null
  try {
    if (ticket.documentSignature !== JSON.stringify(document) || !samePath(ticket.scopePath, scopePath)
      || !samePath(ticket.component.occurrencePath, selectedPath)) return null
    const row = currentRow(document, scopePath, ticket.component.occurrencePath)
    return row && assemblyDefinitionKey(row.occurrence.definition) === assemblyDefinitionKey(ticket.component.definition) ? row : null
  } catch { return null }
}

/** Resolve a displayed reference into the global tree catalog. A selected tree
 * overlay already uses the document root frame; other overlays use edit scope.
 * This only chooses presentation identity, never a relation endpoint or proof. */
export function resolveAssemblyOriginContextEntry(reference: AssemblyOriginReference, scopePath: readonly string[],
  entries: readonly AssemblyOriginTreeEntry[], selectedTreeOrigin: AssemblyOriginTreeEntry | null): AssemblyOriginTreeEntry | null {
  if (selectedTreeOrigin) {
    if (JSON.stringify(selectedTreeOrigin.display.reference) !== JSON.stringify(reference)) return null
    const matches = entries.filter(entry => entry.treeKey === selectedTreeOrigin.treeKey)
    return matches.length === 1 && matches[0].binding === selectedTreeOrigin.binding
      && JSON.stringify(matches[0].display.reference) === JSON.stringify(reference) ? matches[0] : null
  }
  const ownerPath = reference.component ? [...scopePath, ...reference.component.occurrencePath] : scopePath
  const matches = entries.filter(entry => samePath(entry.ownerPath, ownerPath)
    && entry.display.reference.kind === reference.kind
    && (entry.display.reference.kind === 'principal-plane' && reference.kind === 'principal-plane'
      ? entry.display.reference.plane === reference.plane
      : entry.display.reference.kind === 'principal-axis' && reference.kind === 'principal-axis'
        && entry.display.reference.axis === reference.axis)
    && (!reference.component || assemblyDefinitionKey(entry.definition) === assemblyDefinitionKey(reference.component.definition)))
  return matches.length === 1 ? matches[0] : null
}
