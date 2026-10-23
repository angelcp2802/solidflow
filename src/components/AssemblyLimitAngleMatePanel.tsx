import { validateAssemblyGeometryReference, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyLimitAngleMate } from '../model/assemblyDocument'
import { assemblyLimitAngleActivity, validateAssemblyLimitAngleLimits } from '../model/assemblyLimitAngle'
import type { AssemblyLimitAngleSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'

export interface AssemblyLimitAngleUiFields { name: string; minimum: string; maximum: string }
function degrees(value: string): number {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Escribe límites finitos en grados.')
  return Number(value)
}
export function assemblyLimitAngleUiProposal(first: AssemblyGeometryReference | null, second: AssemblyGeometryReference | null,
  fields: AssemblyLimitAngleUiFields): Omit<AssemblyLimitAngleMate, 'id'> {
  if (!first || !second) throw new Error('Selecciona dos direcciones actuales: normales de planos, ejes cilíndricos o aristas lineales.')
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  const limits = validateAssemblyLimitAngleLimits({ minimum: degrees(fields.minimum), maximum: degrees(fields.maximum) })
  return { type: 'limit-angle', coordinate: 'principal-direction', name: fields.name, suppressed: false,
    first: validateAssemblyGeometryReference(first), second: validateAssemblyGeometryReference(second), limits }
}
export function assemblyLimitAngleUiEdit(mate: AssemblyLimitAngleMate, fields: AssemblyLimitAngleUiFields): Omit<AssemblyLimitAngleMate, 'id'> {
  return { ...assemblyLimitAngleUiProposal(mate.first, mate.second, fields), suppressed: mate.suppressed }
}
export function assemblyLimitAngleUiReady(first: AssemblyGeometryReference | null, second: AssemblyGeometryReference | null, fields: AssemblyLimitAngleUiFields): boolean {
  try { assemblyLimitAngleUiProposal(first, second, fields); return true } catch { return false }
}
function referenceKind(reference: AssemblyGeometryReference): 'plane' | 'cylinder' | 'line' {
  return reference.kind === 'principal-plane' || reference.kind === 'face' && reference.support === 'plane' ? 'plane' : reference.kind === 'edge' ? 'line' : 'cylinder'
}
const vector = (value: readonly number[]) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) && Math.abs(Math.hypot(...value) - 1) <= 1e-10
function directionAngle(a: readonly number[], b: readonly number[]): number {
  return Math.atan2(Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), a.reduce((sum, value, i) => sum + value * b[i], 0))
}
/** Consistent display only; reports cannot authorize Apply or supply a saved pose. */
export function assemblyLimitAngleUiReports(document: AssemblyDocument, reports: readonly AssemblyLimitAngleSupportReport[]): AssemblyLimitAngleSupportReport[] {
  const result: AssemblyLimitAngleSupportReport[] = [], seen = new Set<string>()
  for (const report of reports) {
    const mate = assemblyTangentReportContext(document, report)?.mate, key = JSON.stringify([report.scopePath, report.mateId])
    if (!mate || mate.type !== 'limit-angle' || mate.coordinate !== 'principal-direction' || report.kind !== 'limit-angle' || report.coordinate !== 'principal-direction'
      || report.supportOnly !== true || seen.has(key) || !Number.isFinite(report.angleDegrees) || report.angleDegrees < 0 || report.angleDegrees > 180
      || !Number.isFinite(report.angleToleranceRadians) || report.angleToleranceRadians <= 0 || !['regular', 'parallel', 'antiparallel'].includes(report.stratum)
      || report.firstKind !== referenceKind(mate.first) || report.secondKind !== referenceKind(mate.second)
      || !vector(report.firstDirection) || !vector(report.secondDirection)) return []
    try {
      const limits = validateAssemblyLimitAngleLimits(report.limitsDegrees), angle = report.angleDegrees * Math.PI / 180, tolerance = report.angleToleranceRadians,
        measured = directionAngle(report.firstDirection, report.secondDirection), stratum = measured === 0 ? 'parallel' : measured === Math.PI ? 'antiparallel' : 'regular'
      if (limits.minimum !== mate.limits.minimum || limits.maximum !== mate.limits.maximum
        || Math.abs(measured - angle) > tolerance
        || angle < limits.minimum * Math.PI / 180 - tolerance || angle > limits.maximum * Math.PI / 180 + tolerance
        || assemblyLimitAngleActivity(angle, limits, tolerance) !== report.activity
        || report.domainBounds?.minimum !== (limits.minimum === 0) || report.domainBounds?.maximum !== (limits.maximum === 180)
        || report.stratum !== stratum) return []
    } catch { return [] }
    seen.add(key); result.push(structuredClone(report))
  }
  return result
}
const activityLabel = (activity: AssemblyLimitAngleSupportReport['activity']) => activity === 'interior' ? 'interior del intervalo' : activity === 'minimum' ? 'próximo al mínimo' : activity === 'maximum' ? 'próximo al máximo' : 'próximo a ambos límites'
export function AssemblyLimitAngleSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyLimitAngleSupportReport[] }) {
  const rows = assemblyLimitAngleUiReports(document, reports).flatMap(report => {
    const context = assemblyTangentReportContext(document, report)
    return context ? [{ report, ...context }] : []
  })
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Intervalos angulares verificados"><strong>Intervalos angulares verificados</strong>
    {rows.map(({ report, mate, scopeLabel }) => <p key={JSON.stringify([report.scopePath, report.mateId])}><strong>{mate.name}</strong> · {scopeLabel}{report.scopePath.length ? ` · ${report.scopePath.join(' / ')}` : ''} · ángulo principal {Number(report.angleDegrees.toPrecision(8))}° · [{report.limitsDegrees.minimum}, {report.limitsDegrees.maximum}]° · {activityLabel(report.activity)} · {report.stratum === 'parallel' ? 'direcciones paralelas' : report.stratum === 'antiparallel' ? 'direcciones opuestas' : 'direcciones no colineales'}.
      {report.domainBounds.minimum || report.domainBounds.maximum ? ` Los extremos ${report.domainBounds.minimum ? '0°' : ''}${report.domainBounds.minimum && report.domainBounds.maximum ? ' y ' : ''}${report.domainBounds.maximum ? '180°' : ''} pertenecen al dominio del ángulo; su proximidad no añade por sí sola un tope.` : ''}</p>)}
    <p>La actividad indica proximidad a un extremo; puedes volver al interior del intervalo. El recuento de grados de libertad no describe por sí solo los movimientos permitidos en ese extremo. Con ambos límites en 0° o 180°, se conserva la inclinación. Esta relación permite desplazamientos y el giro alrededor de la dirección alineada.</p>
  </section>
}
export interface AssemblyLimitAngleMatePanelProps extends AssemblyLimitAngleUiFields {
  first: AssemblyGeometryReference | null
  second: AssemblyGeometryReference | null
  editing: boolean
  disabled: boolean
  onName: (value: string) => void
  onMinimum: (value: string) => void
  onMaximum: (value: string) => void
  onPreview: () => void
  onCancelEdit: () => void
}
export default function AssemblyLimitAngleMatePanel(props: AssemblyLimitAngleMatePanelProps) {
  const ready = assemblyLimitAngleUiReady(props.first, props.second, props)
  return <section className="assembly-gear" role="region" aria-label="Ángulo principal con límites">
    <h3>{props.editing ? 'Editar intervalo angular' : 'Definir intervalo angular'}</h3>
    <p>Limita de 0° a 180° el ángulo entre las direcciones seleccionadas: normal de un plano, eje de una cara cilíndrica o dirección canónica de una arista lineal. No es un tope de giro firmado ni cuenta vueltas; no limita el giro alrededor de ejes alineados.</p>
    <p>Los límites son inclusivos y el mínimo puede ser igual al máximo. El intercambio de referencias conserva el mismo ángulo y los mismos límites. No se añade alineación ni se unen posiciones.</p>
    {props.editing && <p>La edición conserva la familia, la identidad y las referencias. Cierra la edición para crear otra relación.</p>}
    <label>Nombre<input aria-label="Nombre de la relación" value={props.name} disabled={props.disabled} onChange={event => props.onName(event.target.value)} /></label>
    <label>Ángulo mínimo · grados<input aria-label="Ángulo principal mínimo en grados" type="number" min="0" max="180" step="any" value={props.minimum} disabled={props.disabled} onChange={event => props.onMinimum(event.target.value)} /></label>
    <label>Ángulo máximo · grados<input aria-label="Ángulo principal máximo en grados" type="number" min="0" max="180" step="any" value={props.maximum} disabled={props.disabled} onChange={event => props.onMaximum(event.target.value)} /></label>
    <button className="assembly-primary" aria-label={props.editing ? 'Vista previa del intervalo angular editado' : 'Vista previa del nuevo intervalo angular'} disabled={props.disabled || !ready} onClick={props.onPreview}>{props.editing ? 'Vista previa de los cambios' : 'Vista previa del intervalo'}</button>
    {props.editing && <button aria-label="Cerrar edición del intervalo angular" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar edición</button>}
  </section>
}
