import type { AssemblyGeometryReference, AssemblyMate } from '../model/assemblyDocument'
import type { NewAssemblyMate } from '../model/assemblyEditing'
import { assemblyDirectionMateAngle, assemblyDirectionMateObjective, assemblyDirectionReferenceKind,
  type AssemblyDirectionAlignment, type AssemblyDirectionMateType } from '../model/assemblyDirectionMates'

export type AssemblyUiDirectionMate = Extract<AssemblyMate, { type: AssemblyDirectionMateType }>
export interface AssemblyDirectionUiFields { type: AssemblyDirectionMateType; name: string; alignment: AssemblyDirectionAlignment }
export function assemblyDirectionUiProposal(first: AssemblyGeometryReference | null, second: AssemblyGeometryReference | null,
  fields: AssemblyDirectionUiFields): NewAssemblyMate {
  if (!first || !second) throw new Error('Selecciona dos referencias del ámbito actual.')
  if (!fields.name.trim()) throw new Error('Escribe un nombre para la relación.')
  assemblyDirectionMateAngle(fields.type, assemblyDirectionReferenceKind(first), assemblyDirectionReferenceKind(second), fields.alignment)
  return { type: fields.type, name: fields.name, suppressed: false, first: structuredClone(first), second: structuredClone(second), alignment: fields.alignment }
}
/** Edit direction intent without relabeling the saved relation or its endpoints. */
export function assemblyDirectionUiEdit(mate: AssemblyUiDirectionMate, fields: AssemblyDirectionUiFields): NewAssemblyMate {
  return { ...assemblyDirectionUiProposal(mate.first, mate.second, fields), suppressed: mate.suppressed }
}
export function assemblyDirectionUiObjective(type: AssemblyDirectionMateType, first: AssemblyGeometryReference | null, second: AssemblyGeometryReference | null) {
  return first && second ? assemblyDirectionMateObjective(type, assemblyDirectionReferenceKind(first), assemblyDirectionReferenceKind(second)) : null
}
function description(type: AssemblyDirectionMateType, first: AssemblyGeometryReference, second: AssemblyGeometryReference): string {
  const a = assemblyDirectionReferenceKind(first), b = assemblyDirectionReferenceKind(second)
  if ((a === 'plane') !== (b === 'plane')) return `El eje o la arista quedará ${type === 'parallel' ? 'paralelo' : 'perpendicular'} al plano.`
  return a === 'plane' ? `Las normales de los planos quedarán ${type === 'parallel' ? 'paralelas' : 'perpendiculares'}.`
    : `Las direcciones de los ejes o aristas quedarán ${type === 'parallel' ? 'paralelas' : 'perpendiculares'}.`
}
export interface AssemblyDirectionMatePanelProps {
  type: AssemblyDirectionMateType
  first: AssemblyGeometryReference | null
  second: AssemblyGeometryReference | null
  name: string
  alignment: 'aligned' | 'opposed'
  editing: boolean
  disabled: boolean
  onName: (value: string) => void
  onAlignment: (value: 'aligned' | 'opposed') => void
  onPreview: () => void
  onCancelEdit: () => void
}
export default function AssemblyDirectionMatePanel(props: AssemblyDirectionMatePanelProps) {
  const objective = assemblyDirectionUiObjective(props.type, props.first, props.second)
  return <section className="assembly-gear" role="region" aria-label="Relación paralela o perpendicular">
    <h3>{props.editing ? 'Editar orientación' : 'Definir orientación'}</h3>
    <p>Selecciona planos, ejes de caras cilíndricas o aristas lineales. La relación controla la orientación; no une posiciones ni añade contacto.</p>
    {props.editing && <p>La edición conserva las referencias. Puedes cambiar entre paralela y perpendicular; cierra la edición para crear otra familia.</p>}
    {props.first && props.second ? <p>{description(props.type, props.first, props.second)}</p> : <p>Selecciona dos referencias actuales para definir la relación.</p>}
    <label>Nombre<input aria-label="Nombre de la relación" value={props.name} disabled={props.disabled} onChange={event => props.onName(event.target.value)} /></label>
    {objective === 'collinear' && <label>Orientación<select aria-label="Orientación de la relación" value={props.alignment} disabled={props.disabled} onChange={event => props.onAlignment(event.target.value as 'aligned' | 'opposed')}><option value="aligned">Alineada</option><option value="opposed">Opuesta</option></select></label>}
    {objective === 'orthogonal' && <p>Esta combinación no requiere un sentido alineado u opuesto.</p>}
    <button className="assembly-primary" aria-label={props.editing ? 'Vista previa de la relación direccional editada' : 'Vista previa de la nueva relación direccional'} disabled={props.disabled || !objective || !props.name.trim()} onClick={props.onPreview}>{props.editing ? 'Vista previa de los cambios' : 'Vista previa de la nueva relación'}</button>
    {props.editing && <button aria-label="Cerrar edición de relación direccional" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar edición</button>}
  </section>
}
