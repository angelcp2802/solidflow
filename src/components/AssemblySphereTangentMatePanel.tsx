import { validateAssemblySphereTangentReference, type AssemblyCylinderSurfaceReference, type AssemblyDocument, type AssemblyPlaneReference, type AssemblySphereSurfaceReference, type AssemblySphereTangentMate, type AssemblySphereTangentReference } from '../model/assemblyDocument'
import type { NewAssemblyMate } from '../model/assemblyEditing'
import { assemblyPlaneSphereTangentSupportNormalRelation, assemblySphereTangentSupportNormalRelation, validateAssemblySphereTangentBranch, type AssemblySphereTangentBranch, type AssemblySphereTangentMateType } from '../model/assemblySphereTangentMates'
import { assemblyTangentSideSign, type AssemblyTangentSide } from '../model/assemblyTangentMates'
import type { AssemblySphericalTangencySupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'

export type AssemblySphereTangentUiFields = { type: 'plane-sphere-tangent'; name: string; side: AssemblyTangentSide }
  | { type: 'sphere-sphere-tangent' | 'cylinder-sphere-tangent'; name: string; branch: AssemblySphereTangentBranch | null }
export function assemblySphereTangentUiBranch(kind: 'external' | 'internal', larger: '' | 'first' | 'second'): AssemblySphereTangentBranch | null {
  return kind === 'external' ? { kind } : larger ? { kind, larger } : null
}
const plane = (ref: AssemblySphereTangentReference): ref is AssemblyPlaneReference => ref.kind === 'principal-plane' || ref.support === 'plane'
const sphere = (ref: AssemblySphereTangentReference): ref is AssemblySphereSurfaceReference => ref.kind === 'face' && ref.support === 'sphere-surface'
const cylinder = (ref: AssemblySphereTangentReference): ref is AssemblyCylinderSurfaceReference => ref.kind === 'face' && ref.support === 'cylinder-surface'
export function assemblySphereTangentUiProposal(first: AssemblySphereTangentReference | null, second: AssemblySphereTangentReference | null,
  fields: AssemblySphereTangentUiFields): Extract<NewAssemblyMate, { type: AssemblySphereTangentMateType }> {
  if (!first || !second) throw new Error('Selecciona dos referencias actuales compatibles con la tangencia.')
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  const a = validateAssemblySphereTangentReference(first), b = validateAssemblySphereTangentReference(second), common = { name: fields.name, suppressed: false }
  if (fields.type === 'plane-sphere-tangent') {
    assemblyTangentSideSign(fields.side)
    if (plane(a) && sphere(b)) return { ...common, type: fields.type, first: a, second: b, side: fields.side }
    if (sphere(a) && plane(b)) return { ...common, type: fields.type, first: a, second: b, side: fields.side }
    throw new Error('Selecciona exactamente un plano y una superficie esférica.')
  }
  if (!fields.branch) throw new Error('Selecciona qué referencia tiene mayor radio para la rama interna.')
  const branch = validateAssemblySphereTangentBranch(fields.branch)
  if (fields.type === 'sphere-sphere-tangent' && sphere(a) && sphere(b)) return { ...common, type: fields.type, first: a, second: b, branch }
  if (fields.type === 'cylinder-sphere-tangent') {
    if (cylinder(a) && sphere(b)) return { ...common, type: fields.type, first: a, second: b, branch }
    if (sphere(a) && cylinder(b)) return { ...common, type: fields.type, first: a, second: b, branch }
  }
  throw new Error('Las superficies no corresponden a la familia de tangencia seleccionada.')
}
export function assemblySphereTangentUiEdit(mate: AssemblySphereTangentMate, fields: AssemblySphereTangentUiFields) {
  if (fields.type !== mate.type) throw new Error('Cierra la edición para crear otra familia de tangencia.')
  return { ...assemblySphereTangentUiProposal(mate.first, mate.second, fields), suppressed: mate.suppressed }
}
export function assemblySphereTangentUiReady(first: AssemblySphereTangentReference | null, second: AssemblySphereTangentReference | null, fields: AssemblySphereTangentUiFields): boolean {
  try { assemblySphereTangentUiProposal(first, second, fields); return true } catch { return false }
}
/** Display consistency only; all native authority remains private to the worker. */
export function assemblySphereTangentUiReports(document: AssemblyDocument, reports: readonly AssemblySphericalTangencySupportReport[]): AssemblySphericalTangencySupportReport[] {
  const result: AssemblySphericalTangencySupportReport[] = [], seen = new Set<string>()
  for (const report of reports) {
    const mate = assemblyTangentReportContext(document, report)?.mate, key = JSON.stringify([report.scopePath, report.mateId])
    if (!mate || mate.type !== report.kind || report.supportOnly !== true || seen.has(key)) return []
    try {
      if (report.kind === 'plane-sphere-tangent' && mate.type === 'plane-sphere-tangent') {
        if (report.side !== mate.side || assemblyPlaneSphereTangentSupportNormalRelation(report.side, report.sphereRadialMaterialSense) !== report.normalRelation) return []
      } else if ((report.kind === 'sphere-sphere-tangent' || report.kind === 'cylinder-sphere-tangent') && (mate.type === 'sphere-sphere-tangent' || mate.type === 'cylinder-sphere-tangent')) {
        if (JSON.stringify(validateAssemblySphereTangentBranch(report.branch)) !== JSON.stringify(validateAssemblySphereTangentBranch(mate.branch))
          || assemblySphereTangentSupportNormalRelation(report.branch, report.radialMaterialSense.first, report.radialMaterialSense.second) !== report.normalRelation) return []
      } else return []
    } catch { return [] }
    seen.add(key); result.push(structuredClone(report))
  }
  return result
}
export function assemblySphereTangentFamilyLabel(type: AssemblySphereTangentMateType): string {
  return type === 'plane-sphere-tangent' ? 'Tangente plano–esfera' : type === 'sphere-sphere-tangent' ? 'Tangente esfera–esfera' : 'Tangente cilindro–esfera'
}
export function AssemblySphereTangentSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblySphericalTangencySupportReport[] }) {
  const rows = assemblySphereTangentUiReports(document, reports).flatMap(report => {
    const context = assemblyTangentReportContext(document, report)
    return context ? [{ report, ...context }] : []
  })
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Tangencias con esferas verificadas"><strong>Tangencias con esferas verificadas</strong>
    {rows.map(({ report, mate, scopeLabel }) => <p key={JSON.stringify([report.scopePath, report.mateId])}><strong>{mate.name}</strong> · {scopeLabel} · {assemblySphereTangentFamilyLabel(report.kind)} · {report.kind === 'plane-sphere-tangent' ? `lado ${report.side === 'positive' ? 'positivo' : 'negativo'} respecto al plano` : report.branch.kind === 'external' ? 'externa' : `interna · mayor: referencia ${report.branch.larger === 'first' ? '1' : '2'}`} · normales de soporte {report.normalRelation === 'opposed' ? 'opuestas' : 'del mismo sentido'}.</p>)}
    <p>Soportes analíticos; no comprueba contacto entre caras finitas, contención, ausencia de interferencia ni rodadura.</p>
  </section>
}
export interface AssemblySphereTangentMatePanelProps {
  type: AssemblySphereTangentMateType; first: AssemblySphereTangentReference | null; second: AssemblySphereTangentReference | null
  firstLabel: string; secondLabel: string; name: string; side: AssemblyTangentSide; branchKind: 'external' | 'internal'; larger: '' | 'first' | 'second'
  editing: boolean; disabled: boolean; onName: (value: string) => void; onSide: (value: AssemblyTangentSide) => void
  onBranch: (value: 'external' | 'internal') => void; onLarger: (value: '' | 'first' | 'second') => void; onPreview: () => void; onCancelEdit: () => void
}
export default function AssemblySphereTangentMatePanel(props: AssemblySphereTangentMatePanelProps) {
  const fields: AssemblySphereTangentUiFields = props.type === 'plane-sphere-tangent' ? { type: props.type, name: props.name, side: props.side }
    : { type: props.type, name: props.name, branch: assemblySphereTangentUiBranch(props.branchKind, props.larger) }
  return <section className="assembly-gear" role="region" aria-label="Tangencia con superficies esféricas"><h3>{props.editing ? 'Editar tangencia con esfera' : 'Definir tangencia con esfera'}</h3>
    <p>{props.type === 'plane-sphere-tangent' ? 'Relaciona un plano y una superficie esférica. El lado se mide respecto a la normal del plano.' : props.type === 'sphere-sphere-tangent' ? 'Relaciona dos superficies esféricas.' : 'Relaciona una superficie cilíndrica y una esférica. No añade guía ni un eje a la esfera.'}</p>
    <p>Son relaciones entre soportes analíticos. Interna no garantiza contención, contacto entre caras finitas ni ausencia de interferencia. No añade rodadura.</p>
    {props.editing && <p>La edición conserva la familia y las referencias. Cierra la edición para elegir otra familia o cambiar las referencias.</p>}
    <label>Nombre<input aria-label="Nombre de la relación" value={props.name} disabled={props.disabled} onChange={event => props.onName(event.target.value)} /></label>
    {props.type === 'plane-sphere-tangent' ? <label>Lado respecto al plano<select aria-label="Lado de la esfera respecto al plano" value={props.side} disabled={props.disabled} onChange={event => props.onSide(event.target.value as AssemblyTangentSide)}><option value="positive">Positivo · a favor de la normal del plano</option><option value="negative">Negativo · en contra de la normal del plano</option></select></label>
      : <><label>Rama<select aria-label="Rama de tangencia con superficies esféricas" value={props.branchKind} disabled={props.disabled} onChange={event => props.onBranch(event.target.value as 'external' | 'internal')}><option value="external">Externa</option><option value="internal">Interna</option></select></label>
        {props.branchKind === 'internal' && <label>Superficie de mayor radio<select aria-label="Superficie de mayor radio" value={props.larger} disabled={props.disabled} onChange={event => props.onLarger(event.target.value as '' | 'first' | 'second')}><option value="">Selecciona la referencia de mayor radio</option><option value="first">Referencia 1 · {props.firstLabel}</option><option value="second">Referencia 2 · {props.secondLabel}</option></select></label>}
        <p>Los radios se comprueban al resolver. Cambiar el orden de las referencias requiere elegir de nuevo la mayor para la rama interna.</p></>}
    <button className="assembly-primary" aria-label={props.editing ? 'Vista previa de la tangencia con esfera editada' : 'Vista previa de la nueva tangencia con esfera'} disabled={props.disabled || !assemblySphereTangentUiReady(props.first, props.second, fields)} onClick={props.onPreview}>{props.editing ? 'Vista previa de los cambios' : 'Vista previa de la nueva relación'}</button>
    {props.editing && <button aria-label="Cerrar edición de tangencia con esfera" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar edición</button>}
  </section>
}
