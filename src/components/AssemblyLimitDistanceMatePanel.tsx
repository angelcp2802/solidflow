import { validateAssemblyPlaneReference, type AssemblyDocument, type AssemblyLimitDistanceMate, type AssemblyPlaneReference } from '../model/assemblyDocument'
import { assemblyLimitDistanceActivity, validateAssemblyLimitDistanceLimits } from '../model/assemblyLimitDistance'
import type { AssemblyLimitDistanceSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'

export interface AssemblyLimitDistanceUiFields { name: string; alignment: 'aligned' | 'opposed'; minimum: string; maximum: string }
function signedMillimeters(value: string): number {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Escribe límites finitos en milímetros.')
  return Number(value)
}
export function assemblyLimitDistanceUiProposal(first: AssemblyPlaneReference | null, second: AssemblyPlaneReference | null,
  fields: AssemblyLimitDistanceUiFields): Omit<AssemblyLimitDistanceMate, 'id'> {
  if (!first || !second) throw new Error('Selecciona dos planos actuales.')
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  if (fields.alignment !== 'aligned' && fields.alignment !== 'opposed') throw new Error('Selecciona la orientación de los planos.')
  const minimum = signedMillimeters(fields.minimum), maximum = signedMillimeters(fields.maximum)
  if (minimum > maximum) throw new Error('El mínimo no puede superar el máximo.')
  const limits = validateAssemblyLimitDistanceLimits({ minimum, maximum })
  return { type: 'limit-distance', name: fields.name, suppressed: false, first: validateAssemblyPlaneReference(first), second: validateAssemblyPlaneReference(second), alignment: fields.alignment, limits }
}
export function assemblyLimitDistanceUiEdit(mate: AssemblyLimitDistanceMate, fields: AssemblyLimitDistanceUiFields): Omit<AssemblyLimitDistanceMate, 'id'> {
  return { ...assemblyLimitDistanceUiProposal(mate.first, mate.second, fields), suppressed: mate.suppressed }
}
export function assemblyLimitDistanceUiReady(first: AssemblyPlaneReference | null, second: AssemblyPlaneReference | null, fields: AssemblyLimitDistanceUiFields): boolean {
  try { assemblyLimitDistanceUiProposal(first, second, fields); return true } catch { return false }
}
/** Display consistency only. A report never authorizes Apply or supplies native geometry. */
export function assemblyLimitDistanceUiReports(document: AssemblyDocument, reports: readonly AssemblyLimitDistanceSupportReport[]): AssemblyLimitDistanceSupportReport[] {
  const result: AssemblyLimitDistanceSupportReport[] = [], seen = new Set<string>()
  for (const report of reports) {
    const mate = assemblyTangentReportContext(document, report)?.mate, key = JSON.stringify([report.scopePath, report.mateId])
    if (!mate || mate.type !== 'limit-distance' || report.kind !== 'limit-distance' || report.supportOnly !== true || seen.has(key)
      || report.alignment !== mate.alignment || !Number.isFinite(report.coordinate) || !Number.isFinite(report.lengthTolerance) || report.lengthTolerance <= 0) return []
    try {
      const limits = validateAssemblyLimitDistanceLimits(report.limits)
      if (limits.minimum !== mate.limits.minimum || limits.maximum !== mate.limits.maximum
        || report.coordinate < limits.minimum - report.lengthTolerance || report.coordinate > limits.maximum + report.lengthTolerance
        || assemblyLimitDistanceActivity(report.coordinate, limits, report.lengthTolerance) !== report.activity) return []
    } catch { return [] }
    seen.add(key); result.push(structuredClone(report))
  }
  return result
}
const activityLabel = (activity: AssemblyLimitDistanceSupportReport['activity']) => activity === 'interior' ? 'interior del intervalo' : activity === 'minimum' ? 'próximo al límite mínimo' : activity === 'maximum' ? 'próximo al límite máximo' : 'próximo a ambos límites'
export function AssemblyLimitDistanceSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyLimitDistanceSupportReport[] }) {
  const rows = assemblyLimitDistanceUiReports(document, reports).flatMap(report => {
    const context = assemblyTangentReportContext(document, report)
    return context ? [{ report, ...context }] : []
  })
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Intervalos entre planos verificados"><strong>Intervalos entre planos verificados</strong>
    {rows.map(({ report, mate, scopeLabel }) => <p key={JSON.stringify([report.scopePath, report.mateId])}><strong>{mate.name}</strong> · {scopeLabel}{report.scopePath.length ? ` · ${report.scopePath.join(' / ')}` : ''} · distancia firmada {Number(report.coordinate.toPrecision(8))} mm · [{report.limits.minimum}, {report.limits.maximum}] mm · {activityLabel(report.activity)}.</p>)}
    <p>La distancia se mide a lo largo de la normal del segundo plano. Un límite aislado permite volver hacia el interior; no fija el componente. Si mínimo y máximo coinciden, no hay recorrido normal al plano. Los grados de libertad mostrados describen las relaciones bilaterales. Soportes infinitos; no comprueba contacto ni recortes finitos.</p>
  </section>
}
export interface AssemblyLimitDistanceMatePanelProps extends AssemblyLimitDistanceUiFields {
  first: AssemblyPlaneReference | null; second: AssemblyPlaneReference | null; editing: boolean; disabled: boolean
  onName: (value: string) => void; onAlignment: (value: 'aligned' | 'opposed') => void
  onMinimum: (value: string) => void; onMaximum: (value: string) => void; onPreview: () => void; onCancelEdit: () => void
}
export default function AssemblyLimitDistanceMatePanel(props: AssemblyLimitDistanceMatePanelProps) {
  return <section className="assembly-gear" role="region" aria-label="Distancia con límites entre planos"><h3>{props.editing ? 'Editar intervalo entre planos' : 'Definir intervalo entre planos'}</h3>
    <p>Selecciona dos caras planas o planos principales. La distancia firmada va del segundo plano al primero, a lo largo de la normal del segundo plano.</p>
    <p>El mínimo puede ser igual al máximo. Invertir las referencias no cambia automáticamente los límites: introduce el intervalo con el signo correspondiente. No comprueba contacto entre caras finitas.</p>
    {props.editing && <p>La edición conserva la familia y las referencias. Cierra la edición para seleccionar otros planos o crear otra familia.</p>}
    <label>Nombre<input aria-label="Nombre de la relación" value={props.name} disabled={props.disabled} onChange={event => props.onName(event.target.value)} /></label>
    <label>Orientación<select aria-label="Orientación de los planos del intervalo" value={props.alignment} disabled={props.disabled} onChange={event => props.onAlignment(event.target.value as 'aligned' | 'opposed')}><option value="aligned">Normales del mismo sentido</option><option value="opposed">Normales opuestas</option></select></label>
    <label>Mínimo (mm)<input aria-label="Distancia mínima entre planos en mm" inputMode="decimal" value={props.minimum} disabled={props.disabled} onChange={event => props.onMinimum(event.target.value)} /></label>
    <label>Máximo (mm)<input aria-label="Distancia máxima entre planos en mm" inputMode="decimal" value={props.maximum} disabled={props.disabled} onChange={event => props.onMaximum(event.target.value)} /></label>
    <button className="assembly-primary" aria-label={props.editing ? 'Vista previa del intervalo entre planos editado' : 'Vista previa del nuevo intervalo entre planos'} disabled={props.disabled || !assemblyLimitDistanceUiReady(props.first, props.second, props)} onClick={props.onPreview}>{props.editing ? 'Vista previa de los cambios' : 'Vista previa de la nueva relación'}</button>
    {props.editing && <button aria-label="Cerrar edición del intervalo entre planos" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar edición</button>}
  </section>
}
