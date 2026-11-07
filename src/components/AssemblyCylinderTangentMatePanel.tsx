import { validateAssemblyCylinderSurfaceReference, type AssemblyCylinderSurfaceReference, type AssemblyCylinderTangentMate, type AssemblyDocument } from '../model/assemblyDocument'
import type { NewAssemblyMate } from '../model/assemblyEditing'
import { assemblyCylinderTangentSupportNormalRelation, validateAssemblyCylinderTangentBranch, type AssemblyCylinderTangentBranch, type AssemblyCylinderTangentMateType } from '../model/assemblyCylinderTangentMates'
import type { AssemblyCylinderTangencySupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'

export interface AssemblyCylinderTangentUiFields { type: AssemblyCylinderTangentMateType; name: string; branch: AssemblyCylinderTangentBranch | null }
export function assemblyCylinderTangentUiBranch(kind: 'external' | 'internal', larger: '' | 'first' | 'second'): AssemblyCylinderTangentBranch | null {
  return kind === 'external' ? { kind: 'external' } : larger ? { kind: 'internal', larger } : null
}
export function assemblyCylinderTangentUiProposal(first: AssemblyCylinderSurfaceReference | null, second: AssemblyCylinderSurfaceReference | null,
  fields: AssemblyCylinderTangentUiFields): Extract<NewAssemblyMate, { type: AssemblyCylinderTangentMateType }> {
  if (fields.type !== 'skew-cylinder-tangent' && fields.type !== 'parallel-cylinder-tangent') throw new Error('Selecciona una variante de tangencia entre cilindros.')
  if (!first || !second) throw new Error('Selecciona dos superficies cilíndricas actuales.')
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  if (!fields.branch) throw new Error('Selecciona qué referencia tiene el mayor radio para la rama interna.')
  const common = { name: fields.name, suppressed: false, first: validateAssemblyCylinderSurfaceReference(first),
    second: validateAssemblyCylinderSurfaceReference(second), branch: validateAssemblyCylinderTangentBranch(fields.branch) }
  return fields.type === 'skew-cylinder-tangent' ? { ...common, type: 'skew-cylinder-tangent' } : { ...common, type: 'parallel-cylinder-tangent' }
}
export function assemblyCylinderTangentUiEdit(mate: AssemblyCylinderTangentMate, fields: AssemblyCylinderTangentUiFields) {
  if (fields.type !== mate.type) throw new Error('Cierra la edición para crear otra variante de tangencia.')
  return { ...assemblyCylinderTangentUiProposal(mate.first, mate.second, fields), suppressed: mate.suppressed }
}
export function assemblyCylinderTangentUiReady(first: AssemblyCylinderSurfaceReference | null, second: AssemblyCylinderSurfaceReference | null, fields: AssemblyCylinderTangentUiFields): boolean {
  try { assemblyCylinderTangentUiProposal(first, second, fields); return true } catch { return false }
}
/** Checks renderer display consistency only, never native authority. */
export function assemblyCylinderTangentUiReports(document: AssemblyDocument, reports: readonly AssemblyCylinderTangencySupportReport[]): AssemblyCylinderTangencySupportReport[] {
  const result: AssemblyCylinderTangencySupportReport[] = [], seen = new Set<string>()
  for (const report of reports) {
    const mate = assemblyTangentReportContext(document, report)?.mate, key = JSON.stringify([report.scopePath, report.mateId])
    if (!mate || mate.type !== 'skew-cylinder-tangent' && mate.type !== 'parallel-cylinder-tangent' || report.kind !== mate.type || report.supportOnly !== true || seen.has(key)) return []
    try {
      if (JSON.stringify(validateAssemblyCylinderTangentBranch(report.branch)) !== JSON.stringify(validateAssemblyCylinderTangentBranch(mate.branch))
        || assemblyCylinderTangentSupportNormalRelation(report.branch, report.radialMaterialSense.first, report.radialMaterialSense.second) !== report.normalRelation) return []
    } catch { return [] }
    seen.add(key); result.push(structuredClone(report))
  }
  return result
}
function branchLabel(branch: AssemblyCylinderTangentBranch): string {
  return branch.kind === 'external' ? 'externa' : `interna · mayor: referencia ${branch.larger === 'first' ? '1' : '2'}`
}
export function AssemblyCylinderTangentSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyCylinderTangencySupportReport[] }) {
  const rows = assemblyCylinderTangentUiReports(document, reports).flatMap(report => {
    const context = assemblyTangentReportContext(document, report)
    return context ? [{ report, ...context }] : []
  })
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Tangencias entre cilindros verificadas">
    <strong>Tangencias entre cilindros verificadas</strong>
    {rows.map(({ report, mate, scopeLabel }) => <p key={JSON.stringify([report.scopePath, report.mateId])}><strong>{mate.name}</strong> · {scopeLabel} · {report.kind === 'skew-cylinder-tangent' ? 'ejes no paralelos' : 'con paralelismo'} · {branchLabel(report.branch)} · normales de soporte {report.normalRelation === 'opposed' ? 'opuestas' : 'del mismo sentido'}.</p>)}
    <p>Soportes infinitos; no comprueba contacto entre caras finitas, contención ni ausencia de interferencia.</p>
  </section>
}
export interface AssemblyCylinderTangentMatePanelProps {
  type: AssemblyCylinderTangentMateType
  first: AssemblyCylinderSurfaceReference | null
  second: AssemblyCylinderSurfaceReference | null
  firstLabel: string
  secondLabel: string
  name: string
  branchKind: 'external' | 'internal'
  larger: '' | 'first' | 'second'
  editing: boolean
  disabled: boolean
  onName: (value: string) => void
  onBranch: (value: 'external' | 'internal') => void
  onLarger: (value: '' | 'first' | 'second') => void
  onPreview: () => void
  onCancelEdit: () => void
}
export default function AssemblyCylinderTangentMatePanel(props: AssemblyCylinderTangentMatePanelProps) {
  const branch = assemblyCylinderTangentUiBranch(props.branchKind, props.larger)
  return <section className="assembly-gear" role="region" aria-label="Tangencia entre superficies cilíndricas">
    <h3>{props.editing ? 'Editar tangencia entre cilindros' : 'Definir tangencia entre cilindros'}</h3>
    <p>{props.type === 'skew-cylinder-tangent' ? 'Relaciona dos superficies cilíndricas cuyos ejes no son paralelos.' : 'Relaciona las superficies y añade paralelismo entre sus ejes.'}</p>
    <p>Son relaciones entre soportes infinitos. Interna no garantiza contención, contacto entre caras finitas ni ausencia de interferencia. No añade rodadura.</p>
    {props.editing && <p>La edición conserva la variante y las referencias. Cierra la edición para crear otra familia.</p>}
    <label>Nombre<input aria-label="Nombre de la relación" value={props.name} disabled={props.disabled} onChange={event => props.onName(event.target.value)} /></label>
    <label>Rama<select aria-label="Rama de tangencia entre cilindros" value={props.branchKind} disabled={props.disabled} onChange={event => props.onBranch(event.target.value as 'external' | 'internal')}><option value="external">Externa</option><option value="internal">Interna</option></select></label>
    {props.branchKind === 'internal' && <label>Superficie de mayor radio<select aria-label="Superficie de mayor radio" value={props.larger} disabled={props.disabled} onChange={event => props.onLarger(event.target.value as '' | 'first' | 'second')}><option value="">Selecciona la referencia de mayor radio</option><option value="first">Referencia 1 · {props.firstLabel}</option><option value="second">Referencia 2 · {props.secondLabel}</option></select></label>}
    <p>Los radios se comprueban al resolver. Cambiar el orden de las referencias requiere elegir de nuevo la mayor para la rama interna.</p>
    <button className="assembly-primary" aria-label={props.editing ? 'Vista previa de la tangencia entre cilindros editada' : 'Vista previa de la nueva tangencia entre cilindros'} disabled={props.disabled || !assemblyCylinderTangentUiReady(props.first, props.second, { type: props.type, name: props.name, branch })} onClick={props.onPreview}>{props.editing ? 'Vista previa de los cambios' : 'Vista previa de la nueva relación'}</button>
    {props.editing && <button aria-label="Cerrar edición de tangencia entre cilindros" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar edición</button>}
  </section>
}
