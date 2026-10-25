import type { ReactNode } from 'react'
import { Crosshair, RotateCcw, RotateCw } from 'lucide-react'
import type { RevolutionAxis, RevolveFeature, SketchFeature } from '../cad/kernel.types'
import './revolve-panel.css'

interface AxisOption { value: string; label: string; axis: RevolutionAxis }
export const revolutionAxisValue = (axis?: RevolutionAxis): string =>
  !axis || axis.kind === 'sketch-axis' ? `sketch-${axis?.axis ?? 'y'}` : JSON.stringify(['sketch-line', axis.entityId])

/** Declaration choices only. The native build resolves solved coordinates and validates the axis. */
export function revolutionAxisOptions(sketch?: SketchFeature): AxisOption[] {
  const options: AxisOption[] = [
    { value: 'sketch-y', label: 'Eje Y del croquis', axis: { kind: 'sketch-axis', axis: 'y' } },
    { value: 'sketch-x', label: 'Eje X del croquis', axis: { kind: 'sketch-axis', axis: 'x' } },
  ]
  if (sketch?.profile.kind !== 'entities') return options
  const entities = sketch.profile.entities
  const counts = new Map<string, number>()
  for (const entity of entities) counts.set(entity.id, (counts.get(entity.id) ?? 0) + 1)
  for (const entity of entities) {
    if (entity.type !== 'line' || counts.get(entity.id) !== 1) continue
    const axis: RevolutionAxis = { kind: 'sketch-line', entityId: entity.id }
    options.push({ value: revolutionAxisValue(axis), axis,
      label: `Línea ${entity.id}${entity.construction ? ' · Construcción' : ' · Perfil'}` })
  }
  return options
}

/** An explicit undefined patch removes the optional declaration rather than saving an own undefined property. */
export function mergeRevolutionDraft(feature: RevolveFeature, patch: Partial<RevolveFeature>): RevolveFeature {
  const next = { ...feature, ...patch }
  if ('extent' in patch && patch.extent === undefined) delete next.extent
  return next
}

export function revolutionAngleError(feature: RevolveFeature): string | null {
  const second = feature.extent?.kind === 'two-directions' ? feature.extent.secondAngle : 0
  const two = feature.extent?.kind === 'two-directions'
  if (!Number.isFinite(feature.angle) || !Number.isFinite(second)) return 'Introduce ángulos finitos.'
  if (two) {
    if (feature.angle < 0 || second < 0) return 'Los ángulos de las dos direcciones no pueden ser negativos.'
    if (feature.angle + second <= 0) return 'La suma de los dos ángulos debe ser mayor que 0°.'
    if (feature.angle + second > 360) return 'La suma de los dos ángulos no puede superar 360°.'
  } else if (feature.angle <= 0 || feature.angle > 360) return 'El ángulo debe ser mayor que 0° y no superar 360°.'
  return null
}

interface Props {
  feature: RevolveFeature
  sketch?: SketchFeature
  onChange: (patch: Partial<RevolveFeature>) => void
  children: ReactNode
}

export default function RevolvePanel({ feature, sketch, onChange, children }: Props) {
  const currentSketch = sketch?.id === feature.sketchId ? sketch : undefined
  const options = revolutionAxisOptions(currentSketch), value = revolutionAxisValue(feature.axis)
  const missing = !options.some(option => option.value === value)
  const midPlane = feature.extent?.kind === 'mid-plane', twoDirections = feature.extent?.kind === 'two-directions'
  const angleError = revolutionAngleError(feature)
  return <>
    <section className="property-section revolve-axis-section" aria-labelledby="revolution-axis-heading">
      <h3 id="revolution-axis-heading"><Crosshair size={14} /> Eje de revolución</h3>
      <label className="revolve-axis-label" htmlFor="revolution-axis">Referencia del croquis</label>
      <select id="revolution-axis" aria-label="Eje de revolución" value={value}
        disabled={!currentSketch} aria-invalid={missing || !currentSketch}
        aria-describedby={`revolution-axis-guidance${missing || !currentSketch ? ' revolution-axis-error' : ''}`}
        onChange={event => {
          const option = options.find(candidate => candidate.value === event.target.value)
          if (currentSketch && option) onChange({ axis: option.axis })
        }}>
        {missing && <option value={value} disabled>Línea no disponible: {feature.axis?.kind === 'sketch-line' ? feature.axis.entityId : value}</option>}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <p id="revolution-axis-guidance" className="muted-small">
        Elige X, Y o una línea del croquis{currentSketch ? ` «${currentSketch.name}»` : ''}.
        Las líneas de construcción también pueden definir el eje. El perfil debe quedar a un lado del eje.
      </p>
      {(missing || !currentSketch) && <p id="revolution-axis-error" role="alert" className="revolve-axis-error">
        {!currentSketch ? 'El croquis seleccionado no está disponible.' : 'La línea guardada no está disponible en este croquis. Elige un eje explícitamente.'}
      </p>}
    </section>
    <section className="property-section revolve-direction-section" aria-labelledby="revolution-direction-heading">
      <h3 id="revolution-direction-heading"><RotateCw size={14} /> Dirección 1</h3>
      <label className="revolve-axis-label" htmlFor="revolution-end-condition">Condición final</label>
      <select id="revolution-end-condition" aria-label="Condición final de revolución" value={midPlane ? 'mid-plane' : 'angle'}
        onChange={event => onChange({ extent: event.target.value === 'mid-plane' ? { kind: 'mid-plane' } : undefined })}>
        <option value="angle">Ángulo especificado</option>
        <option value="mid-plane">Plano medio</option>
      </select>
      {children}
      <label className="revolve-reverse" htmlFor="revolution-reversed">
        <input id="revolution-reversed" type="checkbox" aria-label="Invertir dirección"
          disabled={midPlane} checked={feature.reversed ?? false}
          onChange={event => { if (!midPlane) onChange({ reversed: event.target.checked }) }} />
        <RotateCcw size={16} aria-hidden="true" /> <span>Invertir dirección</span>
      </label>
      <p className="muted-small">{midPlane
        ? 'El ángulo es el total: la mitad a cada lado del plano del croquis. Invertir dirección no cambia este modo.'
        : twoDirections ? 'Cada dirección gira a un lado del croquis. La suma debe ser mayor que 0° y no superar 360°.'
          : 'Ángulo mayor que 0° y hasta 360°. Invertir cambia el sentido del giro y conserva el ángulo positivo.'}</p>
    </section>
    {!midPlane && <section className="property-section revolve-direction-section" aria-labelledby="revolution-direction-two-heading">
      <h3 id="revolution-direction-two-heading"><label className="revolve-direction-toggle" htmlFor="revolution-direction-two">
        <input id="revolution-direction-two" type="checkbox" aria-label="Dirección 2" checked={twoDirections}
          onChange={event => onChange({ extent: event.target.checked ? { kind: 'two-directions', secondAngle: 0 } : undefined })} />
        <RotateCcw size={14} aria-hidden="true" /> Dirección 2
      </label></h3>
      {feature.extent?.kind === 'two-directions' && <label className="number-field" htmlFor="revolution-second-angle">
        <span>Ángulo de dirección 2</span><div>
          <input id="revolution-second-angle" aria-label="Ángulo de dirección 2" type="number" step={1} min={0} max={360}
            value={Number.isFinite(feature.extent.secondAngle) ? feature.extent.secondAngle : ''}
            aria-invalid={!!angleError} aria-describedby={angleError ? 'revolution-angle-error' : undefined}
            onChange={event => onChange({ extent: { kind: 'two-directions', secondAngle: event.target.value === '' ? 0 : Number(event.target.value) } })} />
          <small>°</small>
        </div>
      </label>}
    </section>}
    {angleError && <p id="revolution-angle-error" role="alert" className="revolve-axis-error revolve-angle-error">{angleError}</p>}
  </>
}
