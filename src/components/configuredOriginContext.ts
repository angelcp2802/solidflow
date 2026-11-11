import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import { assemblyDefinitionKey } from '../model/assemblyDocument'
import { buildAssemblyOriginDisplay } from './assemblyOriginPicking'
import type { AssemblyOriginTreeEntry } from './assemblyOriginTree'
import { configuredOriginPickChoice } from './configuredAssemblyOriginPicking'
import { configuredMateUiDraft, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'

/** Owner names explain the target; internal occurrence IDs remain authority keys. */
export function configuredOriginContextLabel(entry: AssemblyOriginTreeEntry, evaluation: AssemblyConfigurationEvaluation): string {
  const scopes = new Map(evaluation.scopes.map(scope => [JSON.stringify(scope.path), scope])), names: string[] = []
  for (let index = 0; index < entry.ownerPath.length; index++) {
    const owner = scopes.get(JSON.stringify(entry.ownerPath.slice(0, index)))
    const rows = owner?.occurrences.filter(row => row.id === entry.ownerPath[index]) ?? []
    if (rows.length !== 1) return entry.display.label
    names.push(rows[0].name)
  }
  const reference = entry.display.reference
  return `${reference.kind === 'principal-plane' ? 'Plano ' + reference.plane : 'Eje ' + reference.axis} · ${names.join(' / ') || 'Raíz'}`
}

/** Nominate an existing form option in the current edit frame. The displayed
 * global-tree reference is never copied into a scoped native relation. */
export function configuredOriginContextRelation(entry: AssemblyOriginTreeEntry, entries: readonly AssemblyOriginTreeEntry[],
  evaluation: AssemblyConfigurationEvaluation, scopePath: readonly string[], choices: readonly ConfiguredMateUiChoice[]) {
  const matches = entries.filter(row => row.treeKey === entry.treeKey)
  if (matches.length !== 1 || matches[0].binding !== entry.binding) return null
  const current = matches[0], sameOwner = JSON.stringify(current.ownerPath) === JSON.stringify(scopePath)
  const display = buildAssemblyOriginDisplay(evaluation, scopePath, sameOwner ? null : current.ownerPath, { axes: true, planes: true })
  const reference = current.display.reference
  const candidates = display.filter(row => row.reference.kind === reference.kind
    && (row.reference.kind === 'principal-plane' && reference.kind === 'principal-plane' ? row.reference.plane === reference.plane
      : row.reference.kind === 'principal-axis' && reference.kind === 'principal-axis' && row.reference.axis === reference.axis))
  if (candidates.length !== 1) return null
  const owner = candidates[0].reference.component?.definition
    ?? evaluation.scopes.find(scope => JSON.stringify(scope.path) === JSON.stringify(scopePath))?.definition
  if (!owner || assemblyDefinitionKey(owner) !== assemblyDefinitionKey(current.definition)) return null
  const draft = configuredMateUiDraft('origin-context-nominee')
  draft.type = reference.kind === 'principal-plane' ? 'coincident' : 'concentric'
  const choice = configuredOriginPickChoice(display, draft, choices, 0, candidates[0].reference)
  return choice ? { type: draft.type, reference: choice.reference } : null
}
