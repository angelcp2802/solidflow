import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import type { AssemblyDefinitionReference } from '../model/assemblyDocument'
import { assemblyOriginDisplayBinding, buildAssemblyOriginDisplay, type AssemblyOriginDisplay } from './assemblyOriginPicking'

export interface AssemblyOriginTreeEntry {
  readonly treeKey: string
  /** Absolute document path, including for the root of a non-root catalog scope. */
  readonly ownerPath: readonly string[]
  /** Reference frame used to produce display.reference, not the editable UI scope. */
  readonly scopePath: readonly string[]
  readonly definition: AssemblyDefinitionReference
  readonly configuration: string | null
  readonly display: AssemblyOriginDisplay
  readonly binding: string
}

const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((value, index) => value === b[index])
const prefix = (parent: readonly string[], child: readonly string[]) => parent.length <= child.length && parent.every((value, index) => value === child[index])

/** Full declaration catalog for browsing, not an overlay list or relation-role producer.
 * Callers draw only the resolved selected entry. The existing overlay budget is unchanged. */
export function buildAssemblyOriginTree(evaluation: AssemblyConfigurationEvaluation, scopePath: readonly string[]): AssemblyOriginTreeEntry[] {
  const scopes = new Map(evaluation.scopes.map(scope => [JSON.stringify(scope.path), scope]))
  if (scopes.size !== evaluation.scopes.length) return []
  const scope = scopes.get(JSON.stringify(scopePath))
  if (!scope || scope.suppressed || !scope.visible) return []
  const entries: AssemblyOriginTreeEntry[] = []
  function append(ownerPath: readonly string[], definition: AssemblyDefinitionReference, configuration: string | null) {
    const root = samePath(ownerPath, scopePath)
    const lineage = evaluation.scopes.filter(value => prefix(value.path, ownerPath)).sort((a, b) => a.path.length - b.path.length)
      .map(value => [value.path, value.definition.id, value.definition.revision, value.configuration, value.worldPose])
    const displays = buildAssemblyOriginDisplay(evaluation, scopePath, root ? null : ownerPath, { axes: true, planes: true })
      .sort((a, b) => Number(a.reference.kind === 'principal-axis') - Number(b.reference.kind === 'principal-axis'))
    for (const display of displays) {
      const reference = display.reference
      const treeKey = JSON.stringify(['origin-tree', scopePath, ownerPath, definition.id, definition.revision, reference.kind,
        reference.kind === 'principal-axis' ? reference.axis : reference.plane])
      entries.push({ treeKey, ownerPath: [...ownerPath], scopePath: [...scopePath], definition: { ...definition }, configuration, display,
        binding: JSON.stringify([treeKey, evaluation.source.id, evaluation.source.revision, evaluation.rootConfiguration, configuration,
          lineage, assemblyOriginDisplayBinding(display)]) })
    }
  }
  append(scopePath, scope.definition, scope.configuration)
  function visit(path: readonly string[]) {
    const owner = scopes.get(JSON.stringify(path))
    if (!owner || owner.suppressed || !owner.visible) return
    for (const occurrence of owner.occurrences) {
      if (occurrence.suppressed || !occurrence.visible) continue
      const ownerPath = [...path, occurrence.id], child = scopes.get(JSON.stringify(ownerPath))
      if (child && (child.suppressed || !child.visible)) continue
      append(ownerPath, occurrence.definition, child?.configuration ?? null)
      if (child) visit(ownerPath)
    }
  }
  visit(scopePath)
  return entries
}

export interface AssemblyOriginTreeContext {
  /** Complete current document/catalog/selectors signature supplied by the workspace. */
  readonly documentSignature: string
  /** Current editable scope; deliberately independent of the catalog's scopePath. */
  readonly scopePath: readonly string[]
  /** Caller-owned current session/scene identity, compared with Object.is. */
  readonly sessionIdentity: unknown
}
export interface AssemblyOriginTreeSelection extends AssemblyOriginTreeContext {
  readonly treeKey: string
  readonly binding: string
}

/** Capture the context belonging to the rendered row, including in a delayed callback. */
export function retainAssemblyOriginTreeSelection(entry: AssemblyOriginTreeEntry, renderedContext: AssemblyOriginTreeContext): AssemblyOriginTreeSelection {
  return { treeKey: entry.treeKey, binding: entry.binding, documentSignature: renderedContext.documentSignature,
    scopePath: [...renderedContext.scopePath], sessionIdentity: renderedContext.sessionIdentity }
}

/** Resolve against the current catalog; never return a display retained by a callback.
 * No component selection, scope change, role assignment or CAD operation occurs here. */
export function resolveAssemblyOriginTreeSelection(selection: AssemblyOriginTreeSelection | null | undefined,
  entries: readonly AssemblyOriginTreeEntry[], currentContext: AssemblyOriginTreeContext): AssemblyOriginTreeEntry | null {
  if (!selection || !currentContext.documentSignature || currentContext.sessionIdentity === null || currentContext.sessionIdentity === undefined
    || selection.documentSignature !== currentContext.documentSignature || !samePath(selection.scopePath, currentContext.scopePath)
    || !Object.is(selection.sessionIdentity, currentContext.sessionIdentity)) return null
  const matches = entries.filter(entry => entry.treeKey === selection.treeKey)
  return matches.length === 1 && matches[0].binding === selection.binding ? matches[0] : null
}
