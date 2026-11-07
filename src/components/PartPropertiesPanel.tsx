import { useId, useState } from 'react'
import type { Document } from '../model/document'
import type { CadResult } from '../cad/kernel.types'
import { MAX_PART_DENSITY_KG_PER_M3, MAX_PART_MATERIAL_NAME_LENGTH, validatePartProperties, type PartProperties } from '../model/partProperties'
import './part-properties.css'

interface Draft {
  document: Document
  assigned: boolean
  name: string
  density: string
  customColor: boolean
  color: string
  error: string
}
function initialDraft(document: Document): Draft {
  return { document, assigned: !!document.material, name: document.material?.name ?? '',
    density: document.material ? String(document.material.densityKgPerM3) : '', customColor: !!document.appearance,
    color: document.appearance?.color ?? '#8cabc3', error: '' }
}

/** Draft fields never mutate the document; its owner commits one normal history entry. */
export default function PartPropertiesPanel({ document, geometry, massKg, disabled, onApply }: {
  document: Document
  geometry: CadResult | null
  massKg: number | null
  disabled: boolean
  onApply: (properties: PartProperties) => void
}) {
  const [draft, setDraft] = useState<Draft | null>(null), prefix = useId()
  const fields = draft?.document === document ? draft : initialDraft(document)
  const change = (values: Partial<Draft>) => setDraft({ ...fields, ...values, error: '' })
  return <>
    <p className="panel-intro">{document.name}</p>
    <dl aria-label="Medidas de la pieza">
      <dt>Volumen</dt><dd>{geometry ? `${(geometry.volume / 1000).toLocaleString('es-ES', { maximumFractionDigits: 6 })} cm³` : 'Pendiente'}</dd>
      <dt>Masa</dt><dd aria-label="Masa de la pieza">{massKg !== null ? `${massKg.toLocaleString('es-ES', { maximumSignificantDigits: 8 })} kg` : document.material ? 'Pendiente' : 'Sin asignar'}</dd>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => <div key={axis} style={{ display: 'contents' }}><dt>Envolvente {axis}</dt><dd>{geometry ? `${(geometry.bounds.max[i] - geometry.bounds.min[i]).toFixed(2)} mm` : 'Pendiente'}</dd></div>)}
      <dt>Operaciones</dt><dd>{document.features.filter(feature => feature.type !== 'sketch' && feature.type !== 'plane').length}</dd>
      <dt>Croquis</dt><dd>{document.features.filter(feature => feature.type === 'sketch').length}</dd>
    </dl>
    <form className="part-properties-form" aria-label="Material y apariencia de la pieza" onSubmit={event => {
      event.preventDefault()
      if (disabled) return
      try {
        const properties = validatePartProperties({
          ...(fields.assigned ? { material: { name: fields.name.trim().normalize('NFC'), densityKgPerM3: Number(fields.density) } } : {}),
          ...(fields.customColor ? { appearance: { color: fields.color } } : {}),
        })
        onApply(properties)
        setDraft(null)
      } catch (caught) { setDraft({ ...fields, error: caught instanceof Error ? caught.message : 'No se pudieron aplicar las propiedades.' }) }
    }}>
      <label className="part-property-check"><input type="checkbox" checked={fields.assigned} disabled={disabled} onChange={event => change({ assigned: event.target.checked })} /> Asignar material</label>
      <label htmlFor={`${prefix}-material`}>Material<input id={`${prefix}-material`} aria-label="Nombre del material" value={fields.name} maxLength={MAX_PART_MATERIAL_NAME_LENGTH} required={fields.assigned} disabled={disabled || !fields.assigned} onChange={event => change({ name: event.target.value })} /></label>
      <label htmlFor={`${prefix}-density`}>Densidad (kg/m³)<input id={`${prefix}-density`} aria-label="Densidad del material" type="number" min="0" max={MAX_PART_DENSITY_KG_PER_M3} step="any" value={fields.density} required={fields.assigned} disabled={disabled || !fields.assigned} onChange={event => change({ density: event.target.value })} /></label>
      <label className="part-property-check"><input type="checkbox" checked={fields.customColor} disabled={disabled} onChange={event => change({ customColor: event.target.checked })} /> Color de pieza personalizado</label>
      <label htmlFor={`${prefix}-color`}>Color de la pieza<input id={`${prefix}-color`} aria-label="Color de la pieza" type="color" value={fields.color} disabled={disabled || !fields.customColor} onChange={event => change({ color: event.target.value })} /></label>
      {fields.error && <p role="alert">{fields.error}</p>}
      <div className="part-properties-actions"><button type="button" disabled={disabled} onClick={() => setDraft(null)}>Cancelar cambios</button><button type="submit" disabled={disabled}>Aplicar propiedades</button></div>
      <p>El material y el color se guardan con la pieza y se comparten en sus usos del ensamblaje. La densidad permite calcular la masa del sólido reconstruido.</p>
    </form>
  </>
}
