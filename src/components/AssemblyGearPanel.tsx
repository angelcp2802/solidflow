import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import type { AssemblyAxisReference, AssemblyComponentReference, AssemblyMate } from '../model/assemblyDocument'
import { assemblyGearFollowerAngle, assemblyGearFollowerPhase, type AssemblyGearDirection, type AssemblyGearRatio } from '../model/assemblyGear'
import type { AssemblyGearCaptureRequest } from '../cad/kernel.assembly-types'
import type { MechanicalAxisControls, MechanicalAxisSlot } from './assemblyMechanicalAxisPicking'

export type AssemblyUiGearMate = Extract<AssemblyMate, { type: 'gear' }>
export interface AssemblyGearUiFields { name: string; numerator: string; denominator: string; direction: AssemblyGearDirection; offsetDegrees: string }
export interface AssemblyGearUiParameters { name: string; ratio: AssemblyGearRatio; direction: AssemblyGearDirection; phase: number }
export interface AssemblyGearAxisChoice { key: string; label: string; reference: AssemblyAxisReference }
export interface AssemblyGearCarrierChoice { key: string; label: string; reference: AssemblyComponentReference }

function finiteField(value: string, label: string): number {
  const number = Number(value)
  if (!value.trim() || !Number.isFinite(number)) throw new Error(`${label} debe ser un número finito.`)
  return number
}
/** User parameters only. Native capture owns the neutral rotations and lifted angles. */
export function assemblyGearUiParameters(fields: AssemblyGearUiFields): AssemblyGearUiParameters {
  const name = fields.name.trim()
  if (!name || name.length > 200) throw new Error('El nombre del engranaje debe tener entre 1 y 200 caracteres.')
  const numerator = finiteField(fields.numerator, 'El numerador'), denominator = finiteField(fields.denominator, 'El denominador')
  if (numerator <= 0 || denominator <= 0) throw new Error('El numerador y el denominador deben ser positivos.')
  if (fields.direction !== 'same' && fields.direction !== 'opposed') throw new Error('Selecciona un sentido válido para el engranaje.')
  const offset = finiteField(fields.offsetDegrees, 'El desfase del seguidor') * (Math.PI / 180)
  const ratio = { numerator, denominator }, phase = assemblyGearFollowerPhase(ratio, fields.direction, offset)
  return { name, ratio, direction: fields.direction, phase }
}
export function assemblyGearUiOffset(mate: Pick<AssemblyUiGearMate, 'ratio' | 'direction' | 'phase'>): string {
  const degrees = assemblyGearFollowerAngle(mate.ratio, mate.direction, mate.phase) * (180 / Math.PI)
  if (!Number.isFinite(degrees)) throw new Error('El desfase guardado excede el intervalo de grados admitido por este editor.')
  return String(degrees)
}
/** Replaces editable parameters while retaining exact references and derived state. */
export function assemblyGearUiEdit(mate: AssemblyUiGearMate, fields: AssemblyGearUiFields): AssemblyUiGearMate {
  return { ...structuredClone(mate), ...assemblyGearUiParameters(fields) }
}
function initialFields(mate?: AssemblyUiGearMate): AssemblyGearUiFields {
  let offsetDegrees = '0'
  if (mate) { try { offsetDegrees = assemblyGearUiOffset(mate) } catch { offsetDegrees = '' } }
  return { name: mate?.name ?? 'Engranaje', numerator: String(mate?.ratio.numerator ?? 1), denominator: String(mate?.ratio.denominator ?? 1),
    direction: mate?.direction ?? 'opposed', offsetDegrees }
}
function angleLabel(radians: number): string {
  const degrees = radians * (180 / Math.PI)
  return Number.isFinite(degrees) ? `${Number(degrees.toPrecision(10))}°` : `${radians.toExponential(6)} rad`
}
export interface AssemblyGearPanelProps {
  mate?: AssemblyUiGearMate
  axes: readonly AssemblyGearAxisChoice[]
  carriers: readonly AssemblyGearCarrierChoice[]
  scopeName: string
  disabled: boolean
  canCapture: boolean
  axisPicker?: MechanicalAxisControls
  onCapture: (request: AssemblyGearCaptureRequest) => void
  onEdit: (fields: AssemblyGearUiFields) => void
  onCancelEdit: () => void
}
export default function AssemblyGearPanel(props: AssemblyGearPanelProps) {
  const [fields, setFields] = useState(() => initialFields(props.mate)), [localFirst, setFirst] = useState(''), [localSecond, setSecond] = useState('')
  const first = props.axisPicker?.keys[0] ?? localFirst, second = props.axisPicker?.keys[1] ?? localSecond
  const [carrier, setCarrier] = useState('scope'), [error, setError] = useState('')
  const signature = props.mate ? JSON.stringify([props.mate.id, props.mate.name, props.mate.ratio, props.mate.direction, props.mate.phase]) : ''
  useEffect(() => { setFields(initialFields(props.mate)); setError('') }, [signature])
  const firstAxis = props.axes.find(value => value.key === first), secondAxis = props.axes.find(value => value.key === second)
  const carrierChoice = props.carriers.find(value => value.key === carrier)
  const sameComponent = !!firstAxis && !!secondAxis && JSON.stringify(firstAxis.reference.component.occurrencePath) === JSON.stringify(secondAxis.reference.component.occurrencePath)
  const blocked = props.disabled || !props.mate && !props.canCapture
  const update = <Key extends keyof AssemblyGearUiFields,>(key: Key, value: AssemblyGearUiFields[Key]) => { props.axisPicker?.onCancel(); setFields(previous => ({ ...previous, [key]: value })); setError('') }
  const choose = (slot: MechanicalAxisSlot, key: string) => {
    if (blocked) return
    if (props.axisPicker) props.axisPicker.onChoice(slot, key)
    else if (slot === 0) setFirst(key)
    else setSecond(key)
    setError('')
  }
  return <section className="assembly-gear" role="region" aria-label="Engranaje">
    <h3><Settings2 size={16} />{props.mate ? `Editar ${props.mate.name}` : 'Acoplar dos giros'}</h3>
    <p>Relación de giro respecto del portador elegido. Selecciona dos caras cilíndricas de componentes distintos.</p>
    {!props.mate && <p>Selecciona los ejes en el modelo o resuelve para elegirlos en las listas. La captura requiere una vista previa nativa vigente.</p>}
    {props.mate ? <div className="assembly-gear-references"><p>Eje 1: {props.mate.first.component.occurrencePath.join(' / ')} · {props.mate.first.component.definition.id} · {props.mate.first.component.definition.revision}</p>
      <p>Eje 2: {props.mate.second.component.occurrencePath.join(' / ')} · {props.mate.second.component.definition.id} · {props.mate.second.component.definition.revision}</p>
      <p>Portador: {props.mate.carrier ? `${props.mate.carrier.occurrencePath.join(' / ')} · ${props.mate.carrier.definition.id} · ${props.mate.carrier.definition.revision}` : props.scopeName}</p>
      <div aria-label="Ángulos acumulados del engranaje"><p>Eje 1: {angleLabel(props.mate.angles.first)} · Eje 2: {angleLabel(props.mate.angles.second)}</p></div>
      <p>La edición conserva los ceros angulares capturados y los ángulos acumulados guardados.</p></div>
      : <>{([0, 1] as const).map(slot => <div key={slot} className="assembly-mechanical-axis-role"><label>Eje {slot + 1}<select aria-label={`Eje ${slot + 1} del engranaje`} value={(slot === 0 ? firstAxis : secondAxis) ? (slot === 0 ? first : second) : ''} disabled={blocked} onChange={event => choose(slot, event.target.value)}>
        <option value="">Selecciona {slot ? 'otra' : 'una'} cara cilíndrica</option>{props.axes.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}
      </select></label>{props.axisPicker && <button type="button" aria-label={`Seleccionar eje ${slot + 1} del engranaje en el modelo`} aria-pressed={props.axisPicker.slot === slot}
        disabled={props.disabled || !props.axisPicker.enabled} onClick={() => props.axisPicker?.onPick(slot)}>Seleccionar eje {slot + 1} en el modelo</button>}</div>)}
      {props.axisPicker?.slot !== null && props.axisPicker?.slot !== undefined && <div role="status" aria-label="Selección de ejes del engranaje">Selecciona una cara cilíndrica para el eje {props.axisPicker.slot + 1}.
        <button type="button" aria-label="Cancelar selección de ejes del engranaje" onClick={props.axisPicker.onCancel}>Cancelar selección</button></div>}
      <label>Portador<select aria-label="Portador del engranaje" value={carrier === 'scope' || carrierChoice ? carrier : ''} disabled={blocked} onChange={event => { props.axisPicker?.onCancel(); setCarrier(event.target.value); setError('') }}>
        <option value="scope">{props.scopeName} · marco del ámbito</option>{props.carriers.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}
      </select></label></>}
    <label>Nombre<input aria-label="Nombre del engranaje" value={fields.name} disabled={props.disabled} onChange={event => update('name', event.target.value)} /></label>
    <div className="assembly-gear-ratio"><label>Numerador<input aria-label="Numerador del engranaje" type="number" step="any" value={fields.numerator} disabled={props.disabled} onChange={event => update('numerator', event.target.value)} /></label>
      <span aria-hidden="true">:</span><label>Denominador<input aria-label="Denominador del engranaje" type="number" step="any" value={fields.denominator} disabled={props.disabled} onChange={event => update('denominator', event.target.value)} /></label></div>
    <p>Vueltas del eje 2 por vuelta del eje 1: numerador / denominador. La relación se introduce explícitamente.</p>
    <label>Sentido<select aria-label="Sentido del engranaje" value={fields.direction} disabled={props.disabled} onChange={event => update('direction', event.target.value as AssemblyGearDirection)}>
      <option value="opposed">Opuesto</option><option value="same">Mismo</option>
    </select></label>
    <label>Desfase del seguidor · grados<input aria-label="Desfase del seguidor en grados" type="number" step="any" value={fields.offsetDegrees} disabled={props.disabled} onChange={event => update('offsetDegrees', event.target.value)} /></label>
    <p>Desfase del eje 2 cuando el eje 1 está en su cero capturado. El signo sigue el eje de cada cara respecto del portador.</p>
    {sameComponent && <p role="alert">Selecciona ejes de dos componentes distintos.</p>}
    <button className="assembly-primary" aria-label={props.mate ? 'Vista previa del engranaje' : 'Capturar engranaje'} disabled={blocked || !props.mate && (!firstAxis || !secondAxis || sameComponent || carrier !== 'scope' && !carrierChoice)} onClick={() => {
      if (blocked) return
      try {
        const parameters = assemblyGearUiParameters(fields)
        if (props.mate) props.onEdit({ ...fields })
        else {
          if (!firstAxis || !secondAxis || sameComponent || carrier !== 'scope' && !carrierChoice) throw new Error('Selecciona dos ejes actuales y un portador válido.')
          props.onCapture({ ...parameters, first: structuredClone(firstAxis.reference), second: structuredClone(secondAxis.reference), carrier: carrier === 'scope' ? null : structuredClone(carrierChoice!.reference) })
        }
        setError('')
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron preparar los parámetros del engranaje.') }
    }}>{props.mate ? 'Vista previa del engranaje' : 'Capturar engranaje'}</button>
    {props.mate && <button aria-label="Cancelar edición del engranaje" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar editor</button>}
    {error && <p role="alert">{error}</p>}
    <p>Acoplamiento cinemático de giros. La geometría y el contacto entre dientes requieren comprobaciones independientes.</p>
  </section>
}
