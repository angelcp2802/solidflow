import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import type { AssemblyAxisReference, AssemblyMate } from '../model/assemblyDocument'
import type { AssemblyScrewCaptureRequest } from '../cad/kernel.assembly-types'

export type AssemblyUiScrewMate = Extract<AssemblyMate, { type: 'screw' }>
export type AssemblyScrewUiUnit = 'mm-per-turn' | 'turns-per-mm'
export interface AssemblyScrewUiFields { name: string; advance: string; unit: AssemblyScrewUiUnit; reverse: boolean; alignment: 'aligned' | 'opposed' }
export interface AssemblyScrewUiParameters { name: string; lead: number; reverse: boolean; alignment: 'aligned' | 'opposed' }
export interface AssemblyScrewAxisChoice { key: string; label: string; reference: AssemblyAxisReference }

function positive(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('El avance debe ser positivo y finito.')
  return value
}
function unit(value: AssemblyScrewUiUnit): void {
  if (value !== 'mm-per-turn' && value !== 'turns-per-mm') throw new Error('Selecciona una unidad válida para el avance.')
}
function leadValue(advance: string, displayUnit: AssemblyScrewUiUnit): number {
  if (!advance.trim()) throw new Error('Introduce el avance del tornillo.')
  unit(displayUnit)
  const entered = positive(Number(advance))
  return positive(displayUnit === 'mm-per-turn' ? entered : 1 / entered)
}
/** User intent only. Native capture owns the aligned zero and lifted state. */
export function assemblyScrewUiParameters(fields: AssemblyScrewUiFields): AssemblyScrewUiParameters {
  const name = fields.name.trim()
  if (!name || name.length > 200) throw new Error('El nombre del tornillo debe tener entre 1 y 200 caracteres.')
  const lead = leadValue(fields.advance, fields.unit)
  if (typeof fields.reverse !== 'boolean') throw new Error('Selecciona un sentido válido para el avance.')
  if (fields.alignment !== 'aligned' && fields.alignment !== 'opposed') throw new Error('Selecciona una orientación válida para los ejes.')
  return { name, lead, reverse: fields.reverse, alignment: fields.alignment }
}
export function assemblyScrewUiAdvance(lead: number, displayUnit: AssemblyScrewUiUnit): string {
  unit(displayUnit)
  positive(lead)
  return String(positive(displayUnit === 'mm-per-turn' ? lead : 1 / lead))
}
/** Editing must not recapture or relabel worker-owned reference state. */
export function assemblyScrewUiEdit(mate: AssemblyUiScrewMate, fields: AssemblyScrewUiFields): AssemblyUiScrewMate {
  const parameters = assemblyScrewUiParameters(fields)
  if (parameters.alignment !== mate.alignment) throw new Error('Otra orientación de los ejes requiere una nueva captura del tornillo.')
  return { ...structuredClone(mate), ...parameters }
}
function initialFields(mate?: AssemblyUiScrewMate): AssemblyScrewUiFields {
  return { name: mate?.name ?? 'Tornillo', advance: String(mate?.lead ?? 1), unit: 'mm-per-turn', reverse: mate?.reverse ?? false, alignment: mate?.alignment ?? 'aligned' }
}
function angleLabel(radians: number): string {
  const degrees = radians * (180 / Math.PI)
  return Number.isFinite(degrees) ? `${Number(degrees.toPrecision(10))}° · ${Number((radians / (2 * Math.PI)).toPrecision(10))} vueltas` : `${radians.toExponential(6)} rad`
}
export interface AssemblyScrewPanelProps {
  mate?: AssemblyUiScrewMate
  axes: readonly AssemblyScrewAxisChoice[]
  disabled: boolean
  canCapture: boolean
  onCapture: (request: AssemblyScrewCaptureRequest) => void
  onEdit: (fields: AssemblyScrewUiFields) => void
  onCancelEdit: () => void
}
export default function AssemblyScrewPanel(props: AssemblyScrewPanelProps) {
  const [fields, setFields] = useState(() => initialFields(props.mate)), [first, setFirst] = useState(''), [second, setSecond] = useState(''), [error, setError] = useState('')
  const signature = props.mate ? JSON.stringify([props.mate.id, props.mate.name, props.mate.lead, props.mate.reverse, props.mate.alignment]) : ''
  useEffect(() => { setFields(initialFields(props.mate)); setError('') }, [signature])
  const firstAxis = props.axes.find(value => value.key === first), secondAxis = props.axes.find(value => value.key === second)
  const sameComponent = !!firstAxis && !!secondAxis && JSON.stringify(firstAxis.reference.component.occurrencePath) === JSON.stringify(secondAxis.reference.component.occurrencePath)
  const blocked = props.disabled || !props.mate && !props.canCapture
  const update = <Key extends keyof AssemblyScrewUiFields,>(key: Key, value: AssemblyScrewUiFields[Key]) => { setFields(previous => ({ ...previous, [key]: value })); setError('') }
  let parameters: AssemblyScrewUiParameters | null = null
  try { parameters = assemblyScrewUiParameters(fields) } catch { /* Keep incomplete numeric input editable. */ }
  return <section className="assembly-gear assembly-screw" role="region" aria-label="Tornillo">
    <h3><Settings2 size={16} />{props.mate ? `Editar ${props.mate.name}` : 'Acoplar giro y avance'}</h3>
    <p>La relación alinea dos cilindros y vincula el giro del componente 1 respecto del 2 con su separación axial. Selecciona caras de componentes distintos.</p>
    {!props.mate && <p>Selecciona Resolver para obtener una vista previa nativa vigente; después elige los ejes y captura el tornillo.</p>}
    {props.mate ? <div className="assembly-gear-references"><p>Eje 1: {props.mate.first.component.occurrencePath.join(' / ')} · {props.mate.first.component.definition.id} · {props.mate.first.component.definition.revision}</p>
      <p>Eje 2: {props.mate.second.component.occurrencePath.join(' / ')} · {props.mate.second.component.definition.id} · {props.mate.second.component.definition.revision}</p>
      <p aria-label="Giro relativo acumulado del tornillo">Giro relativo acumulado: {angleLabel(props.mate.angle)}</p>
      <p aria-label="Separación axial de referencia del tornillo">Separación axial de referencia: {props.mate.neutralTravel} mm</p>
      <p>La edición conserva los ceros capturados y continúa desde la rama angular guardada.</p></div>
      : <>{[0, 1].map(index => <label key={index}>Eje {index + 1}<select aria-label={`Eje ${index + 1} del tornillo`} value={index === 0 ? firstAxis ? first : '' : secondAxis ? second : ''} disabled={blocked} onChange={event => { if (index === 0) setFirst(event.target.value); else setSecond(event.target.value); setError('') }}>
        <option value="">Selecciona una cara cilíndrica</option>{props.axes.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}
      </select></label>)}</>}
    <label>Nombre<input aria-label="Nombre del tornillo" value={fields.name} disabled={props.disabled} onChange={event => update('name', event.target.value)} /></label>
    <label>Orientación de los ejes<select aria-label="Orientación de los ejes del tornillo" value={fields.alignment} disabled={props.disabled || !!props.mate} onChange={event => update('alignment', event.target.value as AssemblyScrewUiFields['alignment'])}>
      <option value="aligned">Alineada</option><option value="opposed">Opuesta</option>
    </select></label>
    {props.mate && <p>Otra orientación de los ejes requiere una nueva captura del tornillo.</p>}
    <label>Unidad del avance<select aria-label="Unidad del avance del tornillo" value={fields.unit} disabled={props.disabled} onChange={event => {
      const nextUnit = event.target.value as AssemblyScrewUiUnit
      try { const next = assemblyScrewUiAdvance(leadValue(fields.advance, fields.unit), nextUnit); setFields(previous => ({ ...previous, unit: nextUnit, advance: next })); setError('') }
      catch { setFields(previous => ({ ...previous, unit: nextUnit, advance: '' })); setError('Introduce un avance positivo representable en la unidad elegida.') }
    }}><option value="mm-per-turn">Distancia por vuelta · mm/vuelta</option><option value="turns-per-mm">Vueltas por distancia · vueltas/mm</option></select></label>
    <label>{fields.unit === 'mm-per-turn' ? 'Avance · mm/vuelta' : 'Avance · vueltas/mm'}<input aria-label="Avance del tornillo" type="number" step="any" value={fields.advance} disabled={props.disabled} onChange={event => update('advance', event.target.value)} /></label>
    <label className="assembly-check"><input aria-label="Invertir avance del tornillo" type="checkbox" checked={fields.reverse} disabled={props.disabled} onChange={event => update('reverse', event.target.checked)} />Invertir avance</label>
    {parameters && <p aria-label="Relación de avance del tornillo">Por cada vuelta positiva del componente 1 respecto del 2, la separación axial del origen 2 respecto del 1 {parameters.reverse ? 'disminuye' : 'aumenta'} {parameters.lead} mm, medida sobre el eje 1.</p>}
    <p>El signo de giro sigue el eje nativo de la primera cara. Invertir avance cambia el signo del acoplamiento; la orientación alinea u opone los ejes.</p>
    <p>El movimiento numérico fija el destino completo del componente seleccionado: introduce una posición y un giro compatibles. El avance del otro componente se resuelve según las relaciones vigentes.</p>
    {sameComponent && <p role="alert">Selecciona ejes de dos componentes distintos.</p>}
    <button className="assembly-primary" aria-label={props.mate ? 'Vista previa del tornillo' : 'Capturar tornillo'} disabled={blocked || !props.mate && (!firstAxis || !secondAxis || sameComponent)} onClick={() => {
      if (blocked) return
      try {
        const request = assemblyScrewUiParameters(fields)
        if (props.mate) props.onEdit({ ...fields })
        else {
          if (!firstAxis || !secondAxis || sameComponent) throw new Error('Selecciona dos ejes actuales de componentes distintos.')
          props.onCapture({ ...request, first: structuredClone(firstAxis.reference), second: structuredClone(secondAxis.reference) })
        }
        setError('')
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron preparar los parámetros del tornillo.') }
    }}>{props.mate ? 'Vista previa del tornillo' : 'Capturar tornillo'}</button>
    {props.mate && <button aria-label="Cancelar edición del tornillo" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar editor</button>}
    {error && <p role="alert">{error}</p>}
    <p>Acoplamiento cinemático. El avance se introduce explícitamente; la geometría de rosca y su contacto requieren comprobaciones independientes.</p>
  </section>
}
