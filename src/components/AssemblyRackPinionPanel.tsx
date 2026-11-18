import { useEffect, useState } from 'react'
import type { AssemblyAxisReference, AssemblyEdgeReference, AssemblyMate } from '../model/assemblyDocument'
import { assemblyRackPinionConversion, type AssemblyRackPinionConversion } from '../model/assemblyRackPinion'
import type { AssemblyRackPinionCaptureRequest } from '../cad/kernel.assembly-types'

export type AssemblyUiRackPinionMate = Extract<AssemblyMate, { type: 'rack-pinion' }>
export interface AssemblyRackPinionUiFields { name: string; mode: 'diameter' | 'travel'; value: string; reverse: boolean }
export interface AssemblyRackPinionChoice { key: string; label: string; reference: AssemblyAxisReference | AssemblyEdgeReference; radius?: number }
export interface AssemblyRackPinionPanelProps {
  mate?: AssemblyUiRackPinionMate
  pinions: readonly (AssemblyRackPinionChoice & { reference: AssemblyAxisReference; radius: number })[]
  racks: readonly AssemblyRackPinionChoice[]
  firstKey: string; secondKey: string; nativeRadius?: number
  disabled: boolean; canCapture: boolean
  onChoice: (slot: 0 | 1, key: string) => void
  onPick: (kind: 'pinion' | 'rack-axis' | 'rack-edge') => void
  onCapture: (request: AssemblyRackPinionCaptureRequest) => void
  onEdit: (fields: AssemblyRackPinionUiFields) => void
  onCancelEdit: () => void
}
function conversion(fields: AssemblyRackPinionUiFields): AssemblyRackPinionConversion {
  if (fields.mode !== 'diameter' && fields.mode !== 'travel') throw new Error('Selecciona una conversión válida.')
  const override = fields.value.trim() ? Number(fields.value) : null
  if (override !== null && (!Number.isFinite(override) || override <= 0)) throw new Error('La sustitución debe ser positiva y finita; borra el valor para usar el diámetro nativo.')
  return { mode: fields.mode, override }
}
export function assemblyRackPinionUiParameters(fields: AssemblyRackPinionUiFields, nativeRadius: number) {
  const name = fields.name.trim()
  if (!name || name.length > 200) throw new Error('El nombre debe tener entre 1 y 200 caracteres.')
  if (typeof fields.reverse !== 'boolean') throw new Error('Selecciona un sentido válido.')
  const value = conversion(fields)
  assemblyRackPinionConversion(value, nativeRadius)
  return { name, conversion: value, reverse: fields.reverse }
}
export function assemblyRackPinionUiChangeMode(fields: AssemblyRackPinionUiFields, mode: 'diameter' | 'travel', nativeRadius: number): AssemblyRackPinionUiFields {
  if (mode !== 'diameter' && mode !== 'travel') throw new Error('Selecciona una conversión válida.')
  const current = conversion(fields)
  if (current.override === null) return { ...fields, mode, value: '' }
  const resolved = assemblyRackPinionConversion(current, nativeRadius), value = mode === 'diameter' ? resolved.diameter : resolved.distancePerTurn
  if (!Number.isFinite(value) || value <= 0) throw new Error('La conversión no es representable.')
  return { ...fields, mode, value: String(value) }
}
export function assemblyRackPinionUiEdit(mate: AssemblyUiRackPinionMate, fields: AssemblyRackPinionUiFields, nativeRadius: number): AssemblyUiRackPinionMate {
  return { ...structuredClone(mate), ...assemblyRackPinionUiParameters(fields, nativeRadius) }
}
function initial(mate?: AssemblyUiRackPinionMate): AssemblyRackPinionUiFields {
  return { name: mate?.name ?? 'Cremallera y piñón', mode: mate?.conversion.mode ?? 'diameter', value: mate?.conversion.override === null || !mate ? '' : String(mate.conversion.override), reverse: mate?.reverse ?? false }
}
export default function AssemblyRackPinionPanel(props: AssemblyRackPinionPanelProps) {
  const [fields, setFields] = useState(() => initial(props.mate)), [error, setError] = useState('')
  const signature = props.mate ? JSON.stringify([props.mate.id, props.mate.name, props.mate.conversion, props.mate.reverse]) : ''
  useEffect(() => { setFields(initial(props.mate)); setError('') }, [signature])
  const first = props.pinions.find(value => value.key === props.firstKey), second = props.racks.find(value => value.key === props.secondKey)
  const radius = props.mate ? props.nativeRadius : first?.radius
  const blocked = props.disabled || !props.mate && !props.canCapture
  const same = !!first && !!second && JSON.stringify(first.reference.component.occurrencePath) === JSON.stringify(second.reference.component.occurrencePath)
  const update = (value: Partial<AssemblyRackPinionUiFields>) => { setFields(previous => ({ ...previous, ...value })); setError('') }
  let placeholder = '', effective: ReturnType<typeof assemblyRackPinionConversion> | null = null
  if (radius !== undefined) {
    try { const defaults = assemblyRackPinionConversion({ mode: fields.mode, override: null }, radius); placeholder = String(fields.mode === 'diameter' ? defaults.diameter : defaults.distancePerTurn); effective = assemblyRackPinionConversion(conversion(fields), radius) } catch { /* Invalid input remains editable. */ }
  }
  return <section className="assembly-gear assembly-rack-pinion" role="region" aria-label="Cremallera y piñón">
    <h3>{props.mate ? `Editar ${props.mate.name}` : 'Acoplar cremallera y piñón'}</h3>
    <p>Vincula el giro del piñón respecto de la cremallera con su recorrido lineal. Las guías y apoyos se definen mediante otras relaciones.</p>
    {props.mate ? <div className="assembly-gear-references"><p>Piñón: {props.mate.first.component.occurrencePath.join(' / ')} · {props.mate.first.component.definition.id} · {props.mate.first.component.definition.revision}</p>
      <p>Cremallera: {props.mate.second.component.occurrencePath.join(' / ')} · {props.mate.second.component.definition.id} · {props.mate.second.component.definition.revision} · {props.mate.second.kind === 'edge' ? 'Arista lineal' : 'Eje cilíndrico'}</p>
      <p aria-label="Giro acumulado del piñón">Giro acumulado: {props.mate.angle} rad · {props.mate.angle / (2 * Math.PI)} vueltas</p>
      <p>Referencia lineal capturada: {props.mate.neutralTravel} mm. La edición conserva los ceros capturados y continúa desde la rama angular guardada.</p></div>
      : <><p>Selecciona Resolver para obtener una vista previa nativa vigente; después elige las referencias y captura el acoplamiento.</p>
        <label>Eje del piñón<select aria-label="Eje del piñón" value={first ? props.firstKey : ''} disabled={blocked} onChange={event => props.onChoice(0, event.target.value)}><option value="">Selecciona un cilindro actual</option>{props.pinions.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}</select></label>
        <button aria-label="Seleccionar cilindro del piñón" disabled={blocked} onClick={() => props.onPick('pinion')}>Seleccionar cilindro del piñón</button>
        <label>Referencia lineal de la cremallera<select aria-label="Referencia lineal de la cremallera" value={second ? props.secondKey : ''} disabled={blocked} onChange={event => props.onChoice(1, event.target.value)}><option value="">Selecciona una arista lineal o un eje cilíndrico</option>{props.racks.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}</select></label>
        <button aria-label="Seleccionar arista lineal" disabled={blocked} onClick={() => props.onPick('rack-edge')}>Seleccionar arista lineal</button>
        <button aria-label="Seleccionar eje cilíndrico de la cremallera" disabled={blocked} onClick={() => props.onPick('rack-axis')}>Seleccionar eje cilíndrico de la cremallera</button></>}
    <label>Nombre<input aria-label="Nombre de cremallera y piñón" value={fields.name} disabled={props.disabled} onChange={event => update({ name: event.target.value })} /></label>
    <label>Definir conversión por<select aria-label="Definir conversión del piñón" value={fields.mode} disabled={props.disabled} onChange={event => {
      try { setFields(assemblyRackPinionUiChangeMode(fields, event.target.value as typeof fields.mode, radius ?? NaN)); setError('') }
      catch (reason) { setError((reason as Error).message) }
    }}><option value="diameter">Diámetro de paso · mm</option><option value="travel">Distancia por vuelta · mm/vuelta</option></select></label>
    <label>{fields.mode === 'diameter' ? 'Diámetro de paso · mm' : 'Distancia por vuelta · mm/vuelta'}<input aria-label="Valor de conversión del piñón" aria-describedby="rack-pinion-default" className={fields.value.trim() ? 'assembly-conversion-override' : 'assembly-conversion-default'} type="number" step="any" value={fields.value} placeholder={placeholder} disabled={props.disabled} onChange={event => update({ value: event.target.value })} /></label>
    <p id="rack-pinion-default">Vacío usa el diámetro nativo actual del piñón{radius === undefined ? '; selecciona un cilindro' : `: ${2 * radius} mm`}. Borra la sustitución para restaurarlo. El valor amarillo es una sustitución explícita.</p>
    {effective && <p aria-label="Conversión efectiva del piñón">Diámetro de paso: {effective.diameter} mm · distancia por vuelta: {effective.distancePerTurn} mm/vuelta. El worker vuelve a verificar el valor nativo.</p>}
    <label className="assembly-check"><input aria-label="Invertir avance de la cremallera" type="checkbox" checked={fields.reverse} disabled={props.disabled} onChange={event => update({ reverse: event.target.checked })} />Invertir avance</label>
    <p>El giro sigue el eje nativo del piñón; el recorrido sigue la dirección canónica de la referencia de cremallera. Invertir avance cambia el signo del acoplamiento.</p>
    {same && <p role="alert">Selecciona referencias de dos componentes distintos.</p>}
    <button className="assembly-primary" aria-label={props.mate ? 'Vista previa de cremallera y piñón' : 'Capturar cremallera y piñón'} disabled={blocked || radius === undefined || !props.mate && (!first || !second || same)} onClick={() => {
      if (blocked || radius === undefined) return
      try {
        const parameters = assemblyRackPinionUiParameters(fields, radius)
        if (props.mate) props.onEdit({ ...fields })
        else { if (!first || !second || same) throw new Error('Selecciona dos referencias actuales.'); props.onCapture({ ...parameters, first: structuredClone(first.reference), second: structuredClone(second.reference) }) }
        setError('')
      } catch (reason) { setError((reason as Error).message) }
    }}>{props.mate ? 'Vista previa de cremallera y piñón' : 'Capturar cremallera y piñón'}</button>
    {props.mate && <button aria-label="Cancelar edición de cremallera y piñón" disabled={props.disabled} onClick={props.onCancelEdit}>Cerrar editor</button>}
    {error && <p role="alert">{error}</p>}
    <p>Acoplamiento cinemático sin contacto de dientes ni prevención de colisiones. El movimiento numérico fija el destino completo del componente dirigido.</p>
  </section>
}
