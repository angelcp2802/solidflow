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
      {children}
      <label className="revolve-reverse" htmlFor="revolution-reversed">
        <input id="revolution-reversed" type="checkbox" aria-label="Invertir dirección"
          checked={feature.reversed ?? false} onChange={event => onChange({ reversed: event.target.checked })} />
        <RotateCcw size={16} aria-hidden="true" /> <span>Invertir dirección</span>
      </label>
      <p className="muted-small">Ángulo mayor que 0° y hasta 360°. Invertir cambia el sentido del giro y conserva el ángulo positivo.</p>
    </section>
  </>
}
