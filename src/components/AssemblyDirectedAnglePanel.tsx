import { assemblySceneEdgeReference, assemblySceneFaceReference, type AssemblyScene } from '../cad/kernel.assembly-types'
import type { Plane } from '../cad/kernel.types'
import { validateAssemblyGeometryReference, type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyGeometryReference } from '../model/assemblyDocument'
import { ASSEMBLY_DIRECTED_ANGLE_TOLERANCE_RADIANS, measureDirectedAngle, type AssemblyDirectedAngleReport, type AssemblyDirectedAngleRequest } from '../model/assemblyDirectedAngle'

export interface AssemblyDirectedAngleChoice { key: string; label: string; reference: AssemblyGeometryReference }
export type AssemblyDirectedAngleSelection = [string, string, string]
interface ComponentChoice {
  path: string[]
  occurrence: { name: string; definition: AssemblyDefinitionReference }
  suppressed: boolean
  visible: boolean
}
const inside = (path: readonly string[], scope: readonly string[]) => path.length > scope.length && scope.every((id, i) => path[i] === id)
export function assemblyDirectedAngleReferenceKey(reference: AssemblyGeometryReference): string {
  return JSON.stringify(validateAssemblyGeometryReference(reference))
}
/** Current display choices only. Native resolution remains a separate worker operation. */
export function assemblyDirectedAngleChoices(scene: AssemblyScene | null, scopePath: readonly string[], components: readonly ComponentChoice[]): AssemblyDirectedAngleChoice[] {
  const result = new Map<string, AssemblyDirectedAngleChoice>()
  const add = (reference: AssemblyGeometryReference, label: string) => {
    const checked = validateAssemblyGeometryReference(reference), key = assemblyDirectedAngleReferenceKey(checked)
    if (!result.has(key)) result.set(key, { key, reference: checked, label })
  }
  const datums = (component: AssemblyComponentReference | null, label: string) => {
    for (const plane of ['XY', 'XZ', 'YZ'] as Plane[]) add({ kind: 'principal-plane', component, plane }, `Normal ${plane} · ${label}`)
  }
  datums(null, 'Ámbito actual')
  for (const row of components) if (row.visible && !row.suppressed && inside(row.path, scopePath)) {
    datums({ occurrencePath: row.path.slice(scopePath.length), definition: { ...row.occurrence.definition } }, `${row.occurrence.name} · ${row.path.join(' / ')}`)
  }
  const bodyNumbers = new Map<string, number>()
  for (const body of scene?.bodies ?? []) if (body.visible && inside(body.component.occurrencePath, scopePath)) {
    const componentKey = JSON.stringify(body.component.occurrencePath), bodyNumber = (bodyNumbers.get(componentKey) ?? 0) + 1
    bodyNumbers.set(componentKey, bodyNumber)
    const label = `${body.component.occurrencePath.join(' / ')} · cuerpo ${bodyNumber} · ${body.name}`
    body.faces.forEach((face, index) => {
      const reference = assemblySceneFaceReference(face)
      if (!reference || !inside(reference.component.occurrencePath, scopePath)) return
      reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
      add(reference, `Cara ${index + 1} · ${reference.support === 'axis' ? 'eje cilíndrico' : 'normal del plano'} · ${label}`)
    })
    body.edges?.forEach((edge, index) => {
      const reference = assemblySceneEdgeReference(edge)
      if (!reference || !inside(reference.component.occurrencePath, scopePath)) return
      reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
      add(reference, `Arista ${index + 1} · línea · ${label}`)
    })
  }
  return [...result.values()]
}
export function assemblyDirectedAngleUiRequest(scopePath: readonly string[], selection: AssemblyDirectedAngleSelection,
  choices: readonly AssemblyDirectedAngleChoice[]): AssemblyDirectedAngleRequest | null {
  const endpoints = selection.map(key => choices.find(choice => choice.key === key)?.reference)
  if (endpoints.some(value => !value)) return null
  return { scopePath: [...scopePath], first: validateAssemblyGeometryReference(endpoints[0]), second: validateAssemblyGeometryReference(endpoints[1]), guide: validateAssemblyGeometryReference(endpoints[2]) }
}
function kind(reference: AssemblyGeometryReference): AssemblyDirectedAngleReport['firstKind'] {
  return reference.kind === 'principal-plane' || reference.kind === 'face' && reference.support === 'plane' ? 'plane' : reference.kind === 'edge' ? 'line' : 'cylinder'
}
/** Display consistency only. A serialized report is never native or Apply authority. */
export function assemblyDirectedAngleUiReport(request: AssemblyDirectedAngleRequest, report: AssemblyDirectedAngleReport): AssemblyDirectedAngleReport | null {
  try {
    if (report.coordinate !== 'directed-about-axis' || report.supportOnly !== true || report.angleToleranceRadians !== ASSEMBLY_DIRECTED_ANGLE_TOLERANCE_RADIANS
      || !Number.isFinite(report.angleDegrees) || report.angleDegrees < 0 || report.angleDegrees >= 360
      || JSON.stringify(report.scopePath) !== JSON.stringify(request.scopePath)) return null
    for (const side of ['first', 'second', 'guide'] as const) {
      if (assemblyDirectedAngleReferenceKey(report[side]) !== assemblyDirectedAngleReferenceKey(request[side])
        || report[`${side}Kind`] !== kind(request[side])) return null
    }
    const measured = measureDirectedAngle(report.firstDirection, report.secondDirection, report.guideDirection, report.angleToleranceRadians)
    if (Math.abs(report.angleDegrees * Math.PI / 180 - measured.angleRadians) > report.angleToleranceRadians
      || !Number.isFinite(report.projectionLengths.first) || !Number.isFinite(report.projectionLengths.second)
      || Math.abs(report.projectionLengths.first - measured.projectionLengths.first) > 1e-12
      || Math.abs(report.projectionLengths.second - measured.projectionLengths.second) > 1e-12) return null
    return structuredClone(report)
  } catch { return null }
}
export interface AssemblyDirectedAngleTicket { generation: number; documentSignature: string; requestSignature: string }
/** Shared response gate: a late completion cannot repopulate a cancelled or changed selection. */
export function assemblyDirectedAngleReplyIsCurrent(ticket: AssemblyDirectedAngleTicket, current: AssemblyDirectedAngleTicket & { mounted: boolean }): boolean {
  return current.mounted && ticket.generation === current.generation && ticket.documentSignature === current.documentSignature && ticket.requestSignature === current.requestSignature
}
export interface AssemblyDirectedAnglePanelProps {
  choices: readonly AssemblyDirectedAngleChoice[]
  selection: AssemblyDirectedAngleSelection
  scopePath: readonly string[]
  scopeName: string
  report: AssemblyDirectedAngleReport | null
  disabled: boolean
  pending: boolean
  onSelect: (slot: 0 | 1 | 2, key: string) => void
  onMeasure: () => void
  onClear: () => void
}
export default function AssemblyDirectedAnglePanel(props: AssemblyDirectedAnglePanelProps) {
  const request = assemblyDirectedAngleUiRequest(props.scopePath, props.selection, props.choices)
  const report = !props.disabled && !props.pending && request && props.report ? assemblyDirectedAngleUiReport(request, props.report) : null
  const roundedDegrees = report ? Number(report.angleDegrees.toPrecision(10)) : 0
  const displayDegrees = report && roundedDegrees >= 360 ? report.angleDegrees : roundedDegrees
  return <section className="assembly-section" role="region" aria-label="Medir ángulo dirigido">
    <h2>Medir ángulo dirigido</h2>
    <p>Ámbito: {props.scopeName}. Selecciona dos direcciones y el eje guía. Se proyectan sobre el plano perpendicular a la guía.</p>
    {(['Primera dirección', 'Segunda dirección', 'Eje guía'] as const).map((label, slot) => <label key={label}>{label}<select aria-label={`${label} del ángulo`}
      value={props.selection[slot]} title={props.choices.find(choice => choice.key === props.selection[slot])?.label} disabled={props.disabled || props.pending} onChange={event => props.onSelect(slot as 0 | 1 | 2, event.target.value)}>
      <option value="">Selecciona una dirección actual</option>
      {props.selection[slot] && !props.choices.some(choice => choice.key === props.selection[slot]) && <option value={props.selection[slot]}>Referencia no actual · vuelve a seleccionar</option>}
      {props.choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
    </select></label>)}
    <button aria-label="Medir ángulo dirigido" disabled={props.disabled || props.pending || !request} onClick={props.onMeasure}>{props.pending ? 'Midiendo…' : 'Medir'}</button>
    <button aria-label={props.pending ? 'Cancelar medición angular' : 'Limpiar medición angular'} disabled={!props.pending && props.disabled} onClick={props.onClear}>{props.pending ? 'Cancelar' : 'Limpiar'}</button>
    {report && <p role="status" aria-label="Ángulo dirigido medido"><strong><output aria-label="Ángulo dirigido en grados">{displayDegrees}</output>°</strong> · de la primera dirección hacia la segunda, según la regla de la mano derecha alrededor de la guía.</p>}
    <p>Medición circular entre 0° y 360° (sin incluir 360°). No cuenta vueltas ni crea una relación.</p>
  </section>
}
