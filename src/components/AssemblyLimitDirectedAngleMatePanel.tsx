import { validateAssemblyGeometryReference, type AssemblyDocument, type AssemblyGeometryReference, type AssemblyLimitDirectedAngleMate } from '../model/assemblyDocument'
import { evaluateAssemblyDirectedAngleArc, validateAssemblyDirectedAngleArc } from '../model/assemblyLimitDirectedAngle'
import { measureDirectedAngle } from '../model/assemblyDirectedAngle'
import type { AssemblyLimitDirectedAngleSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'
import { assemblyDirectedAngleUiRequest, type AssemblyDirectedAngleChoice, type AssemblyDirectedAngleSelection } from './AssemblyDirectedAnglePanel'

export interface AssemblyLimitDirectedAngleUiFields { name: string; start: string; sweep: string }
function degrees(value: string): number {
  if (!value.trim() || !Number.isFinite(Number(value))) throw new Error('Escribe un inicio y un recorrido finitos en grados.')
  return Number(value)
}
export function assemblyLimitDirectedAngleUiProposal(first: AssemblyGeometryReference | null, second: AssemblyGeometryReference | null,
  guide: AssemblyGeometryReference | null, fields: AssemblyLimitDirectedAngleUiFields): Omit<AssemblyLimitDirectedAngleMate, 'id'> {
  if (!first || !second || !guide) throw new Error('Selecciona las dos direcciones y el eje guía actuales.')
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  const arc = validateAssemblyDirectedAngleArc({ start: degrees(fields.start), sweep: degrees(fields.sweep) })
  return { type: 'limit-directed-angle', coordinate: 'directed-about-axis', name: fields.name, suppressed: false,
    first: validateAssemblyGeometryReference(first), second: validateAssemblyGeometryReference(second), guide: validateAssemblyGeometryReference(guide), arc }
}
export function assemblyLimitDirectedAngleUiEdit(mate: AssemblyLimitDirectedAngleMate, first: AssemblyGeometryReference | null,
  second: AssemblyGeometryReference | null, guide: AssemblyGeometryReference | null, fields: AssemblyLimitDirectedAngleUiFields): Omit<AssemblyLimitDirectedAngleMate, 'id'> {
  return { ...assemblyLimitDirectedAngleUiProposal(first, second, guide, fields), suppressed: mate.suppressed }
}
function referenceKind(reference: AssemblyGeometryReference): 'plane' | 'cylinder' | 'line' {
  return reference.kind === 'principal-plane' || reference.kind === 'face' && reference.support === 'plane' ? 'plane' : reference.kind === 'edge' ? 'line' : 'cylinder'
}
const modulo = (value: number, period: number) => ((value % period) + period) % period
/** Consistent display only. Reports never authorize Apply or supply saved poses. */
export function assemblyLimitDirectedAngleUiReports(document: AssemblyDocument, reports: readonly AssemblyLimitDirectedAngleSupportReport[]): AssemblyLimitDirectedAngleSupportReport[] {
  const result: AssemblyLimitDirectedAngleSupportReport[] = [], seen = new Set<string>()
  for (const report of reports) {
    const mate = assemblyTangentReportContext(document, report)?.mate, key = JSON.stringify([report.scopePath, report.mateId])
    if (!mate || mate.type !== 'limit-directed-angle' || mate.coordinate !== 'directed-about-axis' || report.kind !== 'limit-directed-angle' || report.coordinate !== 'directed-about-axis'
      || report.supportOnly !== true || seen.has(key) || !Number.isFinite(report.angleDegrees) || report.angleDegrees < 0 || report.angleDegrees >= 360
      || !Number.isFinite(report.angleToleranceRadians) || report.angleToleranceRadians <= 0
      || report.firstKind !== referenceKind(mate.first) || report.secondKind !== referenceKind(mate.second) || report.guideKind !== referenceKind(mate.guide)) return []
    try {
      const arc = validateAssemblyDirectedAngleArc(report.arcDegrees), tolerance = report.angleToleranceRadians,
        measured = measureDirectedAngle(report.firstDirection, report.secondDirection, report.guideDirection, tolerance), angle = report.angleDegrees * Math.PI / 180,
        circularError = Math.abs(modulo(angle - measured.angleRadians + Math.PI, 2 * Math.PI) - Math.PI)
      if (arc.start !== mate.arc.start || arc.sweep !== mate.arc.sweep || report.fullCircle !== (arc.sweep === 360) || circularError > tolerance
        || !report.projectionLengths || !Number.isFinite(report.projectionLengths.first) || !Number.isFinite(report.projectionLengths.second)
        || Math.abs(report.projectionLengths.first - measured.projectionLengths.first) > 1e-12 || Math.abs(report.projectionLengths.second - measured.projectionLengths.second) > 1e-12) return []
      const checked = evaluateAssemblyDirectedAngleArc(measured.angleRadians, arc, tolerance), { minimum, maximum } = checked.marginsRadians
      if (minimum < -tolerance || maximum < -tolerance || checked.activity !== report.activity
        || !report.marginsRadians || !Number.isFinite(report.marginsRadians.minimum) || !Number.isFinite(report.marginsRadians.maximum)
        || Math.abs(report.marginsRadians.minimum - minimum) > tolerance || Math.abs(report.marginsRadians.maximum - maximum) > tolerance) return []
    } catch { return [] }
    seen.add(key); result.push(structuredClone(report))
  }
  return result
}
const activityLabel = (activity: AssemblyLimitDirectedAngleSupportReport['activity']) => activity === 'interior' ? 'interior del arco' : activity === 'minimum' ? 'en el inicio del arco' : activity === 'maximum' ? 'en el final del arco' : 'ángulo fijado por recorrido cero'
export function AssemblyLimitDirectedAngleSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyLimitDirectedAngleSupportReport[] }) {
  const rows = assemblyLimitDirectedAngleUiReports(document, reports).flatMap(report => {
    const context = assemblyTangentReportContext(document, report)
    return context ? [{ report, ...context }] : []
  })
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Límites dirigidos verificados"><strong>Límites dirigidos verificados</strong>
    {rows.map(({ report, mate, scopeLabel }) => <p key={JSON.stringify([report.scopePath, report.mateId])}><strong>{mate.name}</strong> · {scopeLabel}{report.scopePath.length ? ` · ${report.scopePath.join(' / ')}` : ''} · ángulo circular <output aria-label={`Ángulo dirigido verificado ${mate.name}`}>{Number(report.angleDegrees.toPrecision(8)) >= 360 ? report.angleDegrees : Number(report.angleDegrees.toPrecision(8))}</output>° · inicio {report.arcDegrees.start}° · recorrido {report.arcDegrees.sweep}° · {report.fullCircle ? 'círculo completo, sin tope angular' : activityLabel(report.activity)}.</p>)}
    <p>El sentido positivo sigue la mano derecha alrededor de la guía elegida. Un extremo permite regresar al interior. El límite restringe el ángulo de las direcciones proyectadas; no une posiciones ni cuenta vueltas acumuladas.</p>
  </section>
}
export interface AssemblyLimitDirectedAngleMatePanelProps extends AssemblyLimitDirectedAngleUiFields {
  choices: readonly AssemblyDirectedAngleChoice[]
  selection: AssemblyDirectedAngleSelection
  scopePath: readonly string[]
  editing: boolean
  disabled: boolean
  onSelect: (slot: 0 | 1 | 2, key: string) => void
  onName: (value: string) => void
  onStart: (value: string) => void
  onSweep: (value: string) => void
  onPreview: () => void
  onCancelEdit: () => void
}
export default function AssemblyLimitDirectedAngleMatePanel(props: AssemblyLimitDirectedAngleMatePanelProps) {
  const request = assemblyDirectedAngleUiRequest(props.scopePath, props.selection, props.choices)
  let ready = false
  try { if (request) { assemblyLimitDirectedAngleUiProposal(request.first, request.second, request.guide, props); ready = true } } catch { /* Incomplete input cannot start a preview. */ }
  return <section className="assembly-gear" role="region" aria-label="Ángulo dirigido con límites">
    <h3>{props.editing ? 'Editar límite dirigido' : 'Definir límite dirigido'}</h3>
    <p>Selecciona dos direcciones y el eje guía. Su ángulo se mide en el plano perpendicular a la guía, según la regla de la mano derecha.</p>
    {(['Primera dirección', 'Segunda dirección', 'Eje guía'] as const).map((label, slot) => <label key={label}>{label}<select aria-label={`${label} del límite`}
      value={props.selection[slot]} title={props.choices.find(choice => choice.key === props.selection[slot])?.label} disabled={props.disabled} onChange={event => props.onSelect(slot as 0 | 1 | 2, event.target.value)}>
      <option value="">Selecciona una dirección actual</option>
      {props.selection[slot] && !props.choices.some(choice => choice.key === props.selection[slot]) && <option value={props.selection[slot]}>Referencia no actual · vuelve a seleccionar</option>}
      {props.choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
    </select></label>)}
    <label>Nombre<input aria-label="Nombre de la relación" value={props.name} disabled={props.disabled} onChange={event => props.onName(event.target.value)} /></label>
    <label>Inicio · grados<input aria-label="Inicio del arco en grados" type="number" min="0" max="360" step="any" value={props.start} disabled={props.disabled} onChange={event => props.onStart(event.target.value)} /></label>
    <label>Recorrido permitido · grados<input aria-label="Recorrido permitido en grados" type="number" min="0" max="360" step="any" value={props.sweep} disabled={props.disabled} onChange={event => props.onSweep(event.target.value)} /></label>
    <p>El inicio va de 0° a menos de 360°; el recorrido, de 0° a 360°. Ambos extremos son inclusivos. Por ejemplo, inicio 330° y recorrido 60° permiten pasar por 0° hasta 30°. Recorrido 0° fija un ángulo; 360° permite el círculo completo. No cuenta vueltas acumuladas.</p>
    <p>Cambiar el orden de las direcciones o invertir la guía cambia el sentido medido. El inicio y el recorrido se conservan hasta que los edites.</p>
    {props.editing && <p>La edición conserva la identidad y la supresión. Puedes elegir de nuevo las tres referencias antes de resolver.</p>}
    <button className="assembly-primary" aria-label={props.editing ? 'Vista previa del límite dirigido editado' : 'Vista previa del nuevo límite dirigido'} disabled={props.disabled || !ready} onClick={props.onPreview}>{props.editing ? 'Vista previa de los cambios' : 'Vista previa del límite'}</button>
    {props.editing && <button aria-label="Cerrar edición del límite dirigido" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar edición</button>}
  </section>
}
