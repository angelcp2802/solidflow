import type { AssemblyComponentReference, AssemblyDefinitionReference } from '../model/assemblyDocument'
import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import { configuredUiTicketMatches, type ConfiguredUiTicket } from './configuredAssemblyUi'

type Scope = AssemblyConfigurationEvaluation['scopes'][number]
export interface ConfiguredComponentContextRow { scope: Scope; occurrence: Scope['occurrences'][number] }
export interface ConfiguredComponentContextTarget {
  readonly context: ConfiguredUiTicket
  readonly component: AssemblyComponentReference
  readonly evaluation: AssemblyConfigurationEvaluation
  readonly owner: { definition: AssemblyDefinitionReference; configuration: string | null }
}

/** Presentation only: evaluation is the workspace's current validated memo.
 * A menu ticket never grants native geometry, Apply or file authority. */
export function configuredComponentContextRow(evaluation: AssemblyConfigurationEvaluation,
  component: AssemblyComponentReference): ConfiguredComponentContextRow | null {
  try {
    if (!Array.isArray(component.occurrencePath) || !component.occurrencePath.length
      || !component.occurrencePath.every(id => typeof id === 'string' && id.length > 0)) return null
    const owner = component.occurrencePath.slice(0, -1), id = component.occurrencePath.at(-1)
    const scopes = evaluation.scopes.filter(scope => JSON.stringify(scope.path) === JSON.stringify(owner))
    if (scopes.length !== 1) return null
    const occurrences = scopes[0].occurrences.filter(occurrence => occurrence.id === id)
    if (occurrences.length !== 1 || occurrences[0].definition.id !== component.definition.id
      || occurrences[0].definition.revision !== component.definition.revision) return null
    return { scope: scopes[0], occurrence: occurrences[0] }
  } catch { return null }
}

function currentRow(evaluation: AssemblyConfigurationEvaluation, context: ConfiguredUiTicket,
  component: AssemblyComponentReference): ConfiguredComponentContextRow | null {
  if (!context.serialized || !Number.isSafeInteger(context.generation) || context.generation < 0
    || typeof context.navigationRevision !== 'number' || !Number.isSafeInteger(context.navigationRevision) || context.navigationRevision < 0) return null
  const row = configuredComponentContextRow(evaluation, component)
  return row && context.scope === JSON.stringify(row.scope.path) && context.occurrence === row.occurrence.id ? row : null
}

/** Called after the workspace synchronously selects the intended owner/row. */
export function captureConfiguredComponentContext(evaluation: AssemblyConfigurationEvaluation, context: ConfiguredUiTicket,
  component: AssemblyComponentReference): ConfiguredComponentContextTarget | null {
  try {
    const row = currentRow(evaluation, context, component)
    return row ? { context: { ...context }, evaluation,
      component: { occurrencePath: [...component.occurrencePath], definition: { ...component.definition } },
      owner: { definition: { ...row.scope.definition }, configuration: row.scope.configuration } } : null
  } catch { return null }
}

/** Exact evaluation identity also rejects equivalent-looking replacement rows. */
export function resolveConfiguredComponentContext(target: ConfiguredComponentContextTarget | null,
  evaluation: AssemblyConfigurationEvaluation, context: ConfiguredUiTicket): ConfiguredComponentContextRow | null {
  try {
    if (!target || target.evaluation !== evaluation || !configuredUiTicketMatches(target.context, context)) return null
    const row = currentRow(evaluation, context, target.component)
    return row && row.scope.definition.id === target.owner.definition.id && row.scope.definition.revision === target.owner.definition.revision
      && row.scope.configuration === target.owner.configuration ? row : null
  } catch { return null }
}
