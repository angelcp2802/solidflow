import type { ReactNode } from 'react'
import { Crosshair, MousePointer2, RotateCcw, RotateCw } from 'lucide-react'
import type { RevolutionAxis, RevolutionFeature, SketchFeature } from '../cad/kernel.types'
import ThinWallPanel from './ThinWallPanel'
import { mergeThinWallEditorDraft } from './thinWallEditorDraft'
import './revolve-panel.css'

interface AxisOption { value: string; label: string; axis: RevolutionAxis }
export function revolutionAxisValue(axis?: RevolutionAxis): string {
  if (!axis || axis.kind === 'sketch-axis') return `sketch-${axis?.axis ?? 'y'}`
  if (axis.kind === 'sketch-line') return JSON.stringify(['sketch-line', axis.entityId])
  if (axis.kind === 'principal-axis') return `principal-${axis.axis}`
  if (axis.kind === 'external-sketch-line') return JSON.stringify(['external-sketch-line', axis.sketchId, axis.entityId])
  return JSON.stringify(['linear-edge', axis.body?.bodyId ?? null, axis.body?.sourceFeatureId ?? null,
    axis.edge.sourceFeatureId, axis.edge.key])
}

function uniqueLines(sketch: SketchFeature) {
  if (sketch.suppressed || sketch.profile.kind !== 'entities') return []
  const counts = new Map<string, number>()
  for (const entity of sketch.profile.entities) counts.set(entity.id, (counts.get(entity.id) ?? 0) + 1)
  return sketch.profile.entities.filter(entity => entity.type === 'line' && counts.get(entity.id) === 1)
}

/** Declaration choices only. The native build resolves solved coordinates and validates the axis. */
export function revolutionAxisOptions(sketch?: SketchFeature, sourceSketches: readonly SketchFeature[] = []): AxisOption[] {
  const options: AxisOption[] = [
    { value: 'sketch-y', label: 'Eje Y del croquis', axis: { kind: 'sketch-axis', axis: 'y' } },
    { value: 'sketch-x', label: 'Eje X del croquis', axis: { kind: 'sketch-axis', axis: 'x' } },
  ]
  for (const entity of sketch ? uniqueLines(sketch) : []) {
    const axis: RevolutionAxis = { kind: 'sketch-line', entityId: entity.id }
    options.push({ value: revolutionAxisValue(axis), axis,
      label: `Línea ${entity.id}${entity.construction ? ' · Construcción' : ' · Perfil'}` })
  }
  for (const axis of ['X', 'Y', 'Z'] as const) {
    const declaration: RevolutionAxis = { kind: 'principal-axis', axis }
    options.push({ value: revolutionAxisValue(declaration), label: `Eje ${axis} del origen`, axis: declaration })
  }
  const sourceCounts = new Map<string, number>()
  for (const source of sourceSketches) sourceCounts.set(source.id, (sourceCounts.get(source.id) ?? 0) + 1)
  for (const source of sourceSketches) {
    if (source.id === sketch?.id || sourceCounts.get(source.id) !== 1) continue
    for (const entity of uniqueLines(source)) {
      const axis: RevolutionAxis = { kind: 'external-sketch-line', sketchId: source.id, entityId: entity.id }
      options.push({ value: revolutionAxisValue(axis), axis,
        label: `${source.name} · Línea ${entity.id}${entity.construction ? ' · Construcción' : ' · Perfil'}` })
    }
  }
  return options
}

/** An explicit undefined patch removes the optional declaration rather than saving an own undefined property. */
export function mergeRevolutionDraft<T extends RevolutionFeature>(feature: T, patch: Partial<T>, original?: RevolutionFeature): T {
  const next = mergeThinWallEditorDraft(feature, patch, original)
  if ('extent' in patch && patch.extent === undefined) delete next.extent
  if ('axis' in patch && patch.axis === undefined) delete next.axis
  return next
}

export function revolutionAngleError(feature: RevolutionFeature): string | null {
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
  feature: RevolutionFeature
  sketch?: SketchFeature
  sourceSketches?: SketchFeature[]
  axisPicking?: boolean
  onAxisPickingChange?: (active: boolean) => void
  existing?: boolean
  thinWallRequired?: boolean
  thinWallDisabled?: boolean
  onChange: (patch: Partial<RevolutionFeature>) => void
  children: ReactNode
}

export default function RevolvePanel({ feature, sketch, sourceSketches, axisPicking = false,
  onAxisPickingChange, existing = false, thinWallRequired = false, thinWallDisabled = false, onChange, children }: Props) {
  const currentSketch = sketch?.id === feature.sketchId ? sketch : undefined
  const options = revolutionAxisOptions(currentSketch, sourceSketches), value = revolutionAxisValue(feature.axis)
  const materialAxis = feature.axis?.kind === 'linear-edge' ? feature.axis : undefined
  const missing = !materialAxis && !options.some(option => option.value === value)
  const missingLabel = feature.axis?.kind === 'sketch-line' ? feature.axis.entityId
    : feature.axis?.kind === 'external-sketch-line' ? `${feature.axis.sketchId} · ${feature.axis.entityId}` : value
  const midPlane = feature.extent?.kind === 'mid-plane', twoDirections = feature.extent?.kind === 'two-directions'
  const angleError = revolutionAngleError(feature)
  return <>
    <section className="property-section revolve-axis-section" aria-labelledby="revolution-axis-heading">
      <h3 id="revolution-axis-heading"><Crosshair size={14} /> <label htmlFor="revolution-axis">Eje de revolución</label></h3>
      <select id="revolution-axis" aria-label="Eje de revolución" value={value}
        disabled={!currentSketch} aria-invalid={missing || !currentSketch}
        aria-describedby={`revolution-axis-guidance${missing || !currentSketch ? ' revolution-axis-error' : ''}`}
        onChange={event => {
          const option = options.find(candidate => candidate.value === event.target.value)
          if (currentSketch && option) {
            onChange({ axis: option.axis })
            onAxisPickingChange?.(false)
          }
        }}>
        {missing && <option value={value} disabled>Línea no disponible: {missingLabel}</option>}
        {materialAxis && <option value={value} disabled>Arista recta de {materialAxis.body?.bodyId ?? materialAxis.edge.sourceFeatureId}</option>}
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <div className="revolve-axis-actions">
        {onAxisPickingChange && <button type="button" className={`revolve-axis-pick${axisPicking ? ' active' : ''}`}
          aria-label={axisPicking ? 'Terminar selección de eje' : 'Seleccionar eje en pantalla'} aria-pressed={axisPicking}
          aria-describedby="revolution-axis-guidance" disabled={!currentSketch}
          onClick={() => { if (currentSketch) onAxisPickingChange(!axisPicking) }}>
          <MousePointer2 size={14} aria-hidden="true" />
          {axisPicking ? 'Terminar' : 'En pantalla'}
        </button>}
        <button type="button" className="revolve-axis-reset" aria-label="Restablecer eje"
          title="Usar el eje Y del croquis" disabled={!currentSketch || !feature.axis}
          onClick={() => {
            if (!currentSketch || !feature.axis) return
            onChange({ axis: undefined })
            onAxisPickingChange?.(false)
          }}><RotateCcw size={14} aria-hidden="true" /> Restablecer</button>
      </div>
      <p id="revolution-axis-guidance" className="muted-small"
        title="Elige un eje del croquis o del origen, una línea de otro croquis o una arista recta. El eje debe estar en el plano del perfil y el perfil a un lado del eje.">
        {axisPicking ? 'Elige un eje o línea recta. Escape termina la selección.'
          : 'Eje en el plano del perfil; perfil a un lado.'}
      </p>
      {(missing || !currentSketch) && <p id="revolution-axis-error" role="alert" className="revolve-axis-error">
        {!currentSketch ? 'El croquis seleccionado no está disponible.' : 'La línea guardada no está disponible. Elige un eje explícitamente.'}
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
        ? 'El ángulo es el total: la mitad a cada lado del plano del croquis.'
        : twoDirections ? 'Ángulos no negativos. Suma mayor que 0° y hasta 360°.'
          : 'Ángulo mayor que 0° y hasta 360°. Invertir cambia el sentido.'}</p>
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
    <ThinWallPanel thinWall={feature.thinWall} existing={existing} required={thinWallRequired} disabled={!currentSketch || thinWallDisabled}
      autoCornersAvailable={false}
      onChange={thinWall => onChange({ thinWall })} />
  </>
}
