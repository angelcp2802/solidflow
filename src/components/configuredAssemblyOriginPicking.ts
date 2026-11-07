import { assemblyOriginDisplayBinding, assemblyOriginReferenceKey, buildAssemblyOriginDisplay, type AssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import type { AssemblyConfigurationEvaluation } from '../model/assemblyConfigurationCore'
import { configuredMateUiRoleChoices, configuredMateUiRoleLabels, type ConfiguredMateDraft, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'

export interface ConfiguredOriginOwner { key: string; path: string[]; label: string; origins: AssemblyOriginDisplay[] }
/** Owner keys bind the current scope and definition; labels never identify a component. */
export function configuredOriginOwners(evaluation: AssemblyConfigurationEvaluation, scopePath: readonly string[]): ConfiguredOriginOwner[] {
  return evaluation.scopes.flatMap(scope => scope.occurrences.flatMap(occurrence => {
    const path = [...scope.path, occurrence.id]
    const origins = buildAssemblyOriginDisplay(evaluation, scopePath, path, { axes: true, planes: true })
    if (!origins.length) return []
    return [{ key: JSON.stringify([scopePath, origins[0].reference.component]), path,
      label: `${occurrence.name} · ${path.slice(scopePath.length).join(' / ')}`, origins }]
  }))
}

export interface ConfiguredOriginPick { slot: number; catalog: string }
export const configuredOriginCatalog = (display: readonly AssemblyOriginDisplay[]): string => JSON.stringify(display.map(assemblyOriginDisplayBinding))

/** A disarmed/replaced pick cannot nominate even if the same owner is chosen again. */
export function configuredOriginPickAssignment(pick: ConfiguredOriginPick | null, current: ConfiguredOriginPick | null,
  display: readonly AssemblyOriginDisplay[], draft: ConfiguredMateDraft, choices: readonly ConfiguredMateUiChoice[], reference: AssemblyOriginReference | null): ConfiguredMateUiChoice | null {
  if (!pick || pick !== current || pick.catalog !== configuredOriginCatalog(display)) return null
  return configuredOriginPickChoice(display, draft, choices, pick.slot, reference)
}

/** A displayed origin nominates an existing, purpose-compatible form option.
 * Neither its placement nor its overlay grants native reference authority. */
export function configuredOriginPickChoice(display: readonly AssemblyOriginDisplay[], draft: ConfiguredMateDraft,
  choices: readonly ConfiguredMateUiChoice[], slot: number, reference: AssemblyOriginReference | null): ConfiguredMateUiChoice | null {
  if (!reference || !Number.isInteger(slot) || slot < 0 || slot >= configuredMateUiRoleLabels(draft).length) return null
  const key = assemblyOriginReferenceKey(reference)
  if (display.filter(row => assemblyOriginReferenceKey(row.reference) === key).length !== 1) return null
  const candidates = configuredMateUiRoleChoices(draft, slot, choices).filter(row =>
    (row.reference.kind === 'principal-axis' || row.reference.kind === 'principal-plane') && assemblyOriginReferenceKey(row.reference) === key)
  return candidates.length === 1 ? structuredClone(candidates[0]) : null
}

export function configuredOriginHighlights(display: readonly AssemblyOriginDisplay[], draft: ConfiguredMateDraft | null,
  choices: readonly ConfiguredMateUiChoice[]): AssemblyOriginReference[] {
  if (!draft) return []
  const selected = new Map<string, AssemblyOriginReference>()
  draft.references.forEach((reference, slot) => {
    if (!reference || reference.kind !== 'principal-axis' && reference.kind !== 'principal-plane') return
    const choice = configuredOriginPickChoice(display, draft, choices, slot, reference)
    if (choice && (choice.reference.kind === 'principal-axis' || choice.reference.kind === 'principal-plane')) selected.set(assemblyOriginReferenceKey(choice.reference), choice.reference)
  })
  return [...selected.values()]
}
