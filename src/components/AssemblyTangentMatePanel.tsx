import type { AssemblyDocument, AssemblyMate, AssemblyTangentReference } from '../model/assemblyDocument'
import { assemblyDefinitionKey, validateAssemblyTangentReference } from '../model/assemblyDocument'
import { assemblyTangentSideSign, assemblyTangentSupportNormalRelation, type AssemblyTangentSide } from '../model/assemblyTangentMates'
import type { AssemblyTangentSupportReport } from '../cad/kernel.assembly-types'

export type AssemblyUiTangentMate = Extract<AssemblyMate, { type: 'tangent' }>
export type NewAssemblyUiTangentMate = Omit<AssemblyUiTangentMate, 'id'>
export interface AssemblyTangentUiFields { name: string; side: AssemblyTangentSide }
export function assemblyTangentUiProposal(first: AssemblyTangentReference | null, second: AssemblyTangentReference | null,
  fields: AssemblyTangentUiFields): NewAssemblyUiTangentMate {
  if (!first || !second) throw new Error('Selecciona un plano y una superficie cilíndrica actuales.')
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  const a = validateAssemblyTangentReference(first), b = validateAssemblyTangentReference(second)
  const isPlane = (value: AssemblyTangentReference) => value.kind === 'principal-plane' || value.support === 'plane'
  if (isPlane(a) === isPlane(b)) throw new Error('La tangencia requiere exactamente un plano y una superficie cilíndrica.')
  assemblyTangentSideSign(fields.side)
  return { type: 'tangent', name: fields.name, suppressed: false, first: a, second: b, side: fields.side }
}
/** The editing command retains the saved identity; references retain their explicit surface purpose. */
export function assemblyTangentUiEdit(mate: AssemblyUiTangentMate, fields: AssemblyTangentUiFields): NewAssemblyUiTangentMate {
  return { ...assemblyTangentUiProposal(mate.first, mate.second, fields), suppressed: mate.suppressed }
}
export function assemblyTangentUiReady(first: AssemblyTangentReference | null, second: AssemblyTangentReference | null): boolean {
  try { assemblyTangentUiProposal(first, second, { name: 'Tangencia', side: 'positive' }); return true } catch { return false }
}
/** A local mate ID needs its complete expansion path to resolve a visible name. */
export function assemblyTangentReportContext(document: AssemblyDocument, report: { scopePath: readonly string[]; mateId: string }) {
  if (!Array.isArray(report.scopePath) || !report.scopePath.every(value => typeof value === 'string') || typeof report.mateId !== 'string') return null
  let node: AssemblyDocument | Extract<AssemblyDocument['definitions'][number], { kind: 'assembly' }> = document
  const names: string[] = []
  for (const id of report.scopePath) {
    const occurrence: AssemblyDocument['occurrences'][number] | undefined = node.occurrences.find(value => value.id === id && !value.suppressed)
    const definition: AssemblyDocument['definitions'][number] | undefined = occurrence && document.definitions.find(value => value.kind === 'assembly' && assemblyDefinitionKey(value) === assemblyDefinitionKey(occurrence.definition))
    if (!occurrence || !definition || definition.kind !== 'assembly') return null
    names.push(occurrence.name); node = definition
  }
  const mate = node.mates.find(value => value.id === report.mateId && !value.suppressed)
  return mate ? { mate, scopeLabel: names.length ? names.join(' / ') : document.name } : null
}
/** Display consistency only; native capability remains private to the worker. */
export function assemblyTangentUiReports(document: AssemblyDocument, reports: readonly AssemblyTangentSupportReport[]): AssemblyTangentSupportReport[] {
  const result: AssemblyTangentSupportReport[] = [], seen = new Set<string>()
  for (const report of reports) {
    if (report.supportOnly !== true) return []
    const mate = assemblyTangentReportContext(document, report)?.mate
    const key = JSON.stringify([report.scopePath, report.mateId])
    if (!mate || mate.type !== 'tangent' || report.side !== mate.side || seen.has(key)) return []
    try { if (assemblyTangentSupportNormalRelation(report.side, report.radialMaterialSense) !== report.normalRelation) return [] } catch { return [] }
    seen.add(key); result.push(structuredClone(report))
  }
  return result
}
export function AssemblyTangentSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyTangentSupportReport[] }) {
  const rows = assemblyTangentUiReports(document, reports).flatMap(report => {
    const context = assemblyTangentReportContext(document, report)
    return context ? [{ report, ...context }] : []
  })
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Tangencias de soportes verificadas">
    <strong>Tangencias de soportes verificadas</strong>
    {rows.map(({ report, mate, scopeLabel }) => <p key={JSON.stringify([report.scopePath, report.mateId])}><strong>{mate.name}</strong> · {scopeLabel} · lado {report.side === 'positive' ? 'positivo' : 'negativo'} · normales de soporte {report.normalRelation === 'opposed' ? 'opuestas' : 'del mismo sentido'}.</p>)}
    <p>Comprobación de soportes infinitos; no comprueba recortes finitos, interferencia ni contacto entre las piezas.</p>
  </section>
}
export interface AssemblyTangentMatePanelProps {
  first: AssemblyTangentReference | null
  second: AssemblyTangentReference | null
  name: string
  side: AssemblyTangentSide
  editing: boolean
  disabled: boolean
  onName: (value: string) => void
  onSide: (value: AssemblyTangentSide) => void
  onPreview: () => void
  onCancelEdit: () => void
}
export default function AssemblyTangentMatePanel(props: AssemblyTangentMatePanelProps) {
  return <section className="assembly-gear" role="region" aria-label="Tangencia entre plano y cilindro">
    <h3>{props.editing ? 'Editar tangencia' : 'Definir tangencia'}</h3>
    <p>Selecciona un plano y una cara cilíndrica como superficie, en cualquier orden. El lado se mide siempre respecto a la normal del plano.</p>
    <p>Relaciona los soportes infinitos; no garantiza contacto entre caras finitas ni ausencia de interferencia. No añade guía axial ni rodadura.</p>
    {props.editing && <p>La edición conserva las referencias. Cierra la edición para seleccionar otras superficies o crear otra familia.</p>}
    <label>Nombre<input aria-label="Nombre de la relación" value={props.name} disabled={props.disabled} onChange={event => props.onName(event.target.value)} /></label>
    <label>Lado respecto al plano<select aria-label="Lado del cilindro respecto al plano" value={props.side} disabled={props.disabled} onChange={event => props.onSide(event.target.value as AssemblyTangentSide)}><option value="positive">Positivo · a favor de la normal del plano</option><option value="negative">Negativo · en contra de la normal del plano</option></select></label>
    <button className="assembly-primary" aria-label={props.editing ? 'Vista previa de la tangencia editada' : 'Vista previa de la nueva tangencia'} disabled={props.disabled || !props.name.trim() || !assemblyTangentUiReady(props.first, props.second)} onClick={props.onPreview}>{props.editing ? 'Vista previa de los cambios' : 'Vista previa de la nueva relación'}</button>
    {props.editing && <button aria-label="Cerrar edición de tangencia" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar edición</button>}
  </section>
}
