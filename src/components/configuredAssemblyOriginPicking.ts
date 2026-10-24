import { assemblyOriginReferenceKey, type AssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import { configuredMateUiRoleChoices, configuredMateUiRoleLabels, type ConfiguredMateDraft, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'

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
