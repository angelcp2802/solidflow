import { assemblyDefinitionKey, MAX_ASSEMBLY_DEPTH, type AssemblyDocument } from '../model/assemblyDocument'

/** Presentation identity only. A local relation ID needs its complete occurrence path. */
export function assemblyMateReportContext(document: AssemblyDocument, report: { scopePath: readonly string[]; mateId: string }) {
  if (!Array.isArray(report.scopePath) || report.scopePath.length > MAX_ASSEMBLY_DEPTH || !report.scopePath.every(value => typeof value === 'string') || typeof report.mateId !== 'string') return null
  let node: AssemblyDocument | Extract<AssemblyDocument['definitions'][number], { kind: 'assembly' }> = document
  const names: string[] = []
  for (const id of report.scopePath) {
    const occurrences = node.occurrences.filter(value => value.id === id)
    if (occurrences.length !== 1 || occurrences[0].suppressed) return null
    const occurrence = occurrences[0]
    const definitions = document.definitions.filter(value => assemblyDefinitionKey(value) === assemblyDefinitionKey(occurrence.definition))
    if (definitions.length !== 1 || definitions[0].kind !== 'assembly') return null
    names.push(occurrence.name); node = definitions[0]
  }
  const mates = node.mates.filter(value => value.id === report.mateId)
  return mates.length === 1 && !mates[0].suppressed
    ? { mate: mates[0], scopePath: [...report.scopePath], scopeLabel: names.length ? names.join(' / ') : document.name } : null
}

/** Decode only the canonical scoped key issued by the solver; never guess a local ID. */
export function assemblyPhysicalCheckContext(document: AssemblyDocument, constraintId: string) {
  // Saved IDs have at most 128 UTF-16 units. JSON escaping has at most six units per input unit.
  if (typeof constraintId !== 'string' || constraintId.length > (MAX_ASSEMBLY_DEPTH + 1) * (128 * 6 + 4) + 3) return null
  let locator: unknown
  try { locator = JSON.parse(constraintId) } catch { return null }
  const id = (value: unknown): value is string => typeof value === 'string' && value.length <= 128 && !!value.trim() && !/[\x00-\x1f\x7f]/.test(value)
  if (!Array.isArray(locator) || locator.length !== 2 || !Array.isArray(locator[0]) || locator[0].length > MAX_ASSEMBLY_DEPTH
    || !locator[0].every(id) || !id(locator[1]) || JSON.stringify(locator) !== constraintId) return null
  return assemblyMateReportContext(document, { scopePath: locator[0], mateId: locator[1] })
}
