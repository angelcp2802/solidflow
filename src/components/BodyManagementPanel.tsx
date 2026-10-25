import { Box, ChevronDown, Eye, MousePointer2, X } from 'lucide-react'
import type { BodyReference, Feature, PickableBody } from '../cad/kernel.types'
import { sameBodyReference, setBodyOperationDraft } from '../model/bodyCommands'

const referenceKey = (reference: BodyReference) => JSON.stringify([reference.bodyId, reference.sourceFeatureId])

interface BodyListProps {
  bodies: readonly PickableBody[]
  selection: readonly BodyReference[]
  onSelection: (selection: BodyReference[]) => void
  disabled?: boolean
  single?: boolean
}

export function BodyList({ bodies, selection, onSelection, disabled = false, single = false }: BodyListProps) {
  const unavailable = selection.filter(reference => !bodies.some(body => sameBodyReference(body.ref, reference)))
  return <div className="body-list" aria-label="Cuerpos sólidos">
    {!bodies.length && <p className="muted-small">No hay cuerpos disponibles en este estado.</p>}
    {bodies.map(body => {
      const checked = selection.some(reference => sameBodyReference(reference, body.ref))
      return <label className={`body-row ${checked ? 'selected' : ''}`} key={referenceKey(body.ref)}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onSelection(checked
          ? selection.filter(reference => !sameBodyReference(reference, body.ref))
          : single ? [{ ...body.ref }] : [...selection.map(reference => ({ ...reference })), { ...body.ref }])} />
        <Box size={15} /><span>{body.name}<small>{body.volume.toLocaleString(undefined, { maximumFractionDigits: 3 })} mm³</small></span>
      </label>
    })}
    {unavailable.map(reference => <div className="body-row unavailable" key={referenceKey(reference)}>
      <span>Cuerpo no disponible<small>Vuelve a seleccionar su estado actual.</small></span>
      <button type="button" aria-label="Quitar cuerpo no disponible" disabled={disabled} onClick={() => onSelection(selection.filter(item => !sameBodyReference(item, reference)))}><X size={13} /></button>
    </div>)}
  </div>
}

interface BodyFeaturePanelProps extends BodyListProps {
  feature: Feature
  outputBodyId: string
  existing: boolean
  onFeature: (feature: Feature) => void
  picking: boolean
  onPicking: (picking: boolean) => void
  message?: string
}

export function BodyFeaturePanel({ feature, outputBodyId, existing, onFeature, picking, onPicking, message, ...list }: BodyFeaturePanelProps) {
  const boss = feature.type === 'extrude' || feature.type === 'revolve' ? feature : null
  const combine = feature.type === 'combine' ? feature : null
  const single = !!boss || feature.type === 'fillet' || feature.type === 'chamfer' || feature.type === 'shell' || feature.type === 'draft'
  const newBody = boss?.bodyOperation?.mode === 'new'
  const limit = boss?.type === 'extrude' && newBody && boss.endCondition && 'baseFeatureId' in boss.endCondition ? boss.endCondition : null
  // Translate only these exact incomplete-draft rejections; retain all other diagnostics.
  const displayMessage = feature.type === 'cut' && Array.isArray(feature.bodyScope) && feature.bodyScope.length === 0 && list.selection.length === 0
    && /^Documento\.features\[\d+\]\.bodyScope: se esperaba una lista de entre 1 y 256 elementos$/.test(message ?? '')
    ? 'Selecciona al menos un cuerpo que quieras cortar.'
    : limit && (limit.kind === 'throughAll' || limit.kind === 'untilNext') && limit.baseBody === undefined && limit.baseFeatureId === ''
      && /^Documento\.features\[\d+\]\.endCondition\.baseFeatureId: se esperaba texto de entre 1 y 128 caracteres$/.test(message ?? '')
      ? 'Selecciona un cuerpo límite para calcular hasta dónde llega la extrusión.'
      : message
  return <div className="property-section body-operation-panel">
    <h3><ChevronDown size={12} /> {combine ? 'Combinar cuerpos' : 'Cuerpos de la operación'}</h3>
    {boss && <label>Resultado del saliente
      <select aria-label="Resultado del saliente" value={newBody ? 'new' : 'merge'} disabled={existing || list.disabled} onChange={event => onFeature(setBodyOperationDraft(boss, event.target.value === 'new'
        ? { mode: 'new', bodyId: outputBodyId }
        : { mode: 'merge', target: list.selection[0] ?? { bodyId: '', sourceFeatureId: '' } }))}>
        <option value="new">Crear cuerpo separado</option><option value="merge">Añadir material a un cuerpo</option>
      </select>
    </label>}
    {boss?.type === 'extrude' && limit && <label>Cuerpo límite
      <select aria-label="Cuerpo límite de la extrusión" value={limit.baseBody ? referenceKey(limit.baseBody) : ''} disabled={list.disabled} onChange={event => {
        const body = list.bodies.find(item => referenceKey(item.ref) === event.target.value)
        if (body) onFeature({ ...boss, endCondition: { ...limit, baseBody: { ...body.ref }, baseFeatureId: body.ref.sourceFeatureId } })
      }}>
        <option value="" disabled>Selecciona un cuerpo límite</option>
        {list.bodies.map(body => <option key={referenceKey(body.ref)} value={referenceKey(body.ref)}>{body.name}</option>)}
        {limit.baseBody && !list.bodies.some(body => sameBodyReference(body.ref, limit.baseBody!)) && <option value={referenceKey(limit.baseBody)}>Cuerpo límite no disponible · vuelve a seleccionar</option>}
      </select>
      <small>La longitud seguirá este cuerpo al reconstruir.</small>
    </label>}
    {combine && <>
      <label>Operación
        <select aria-label="Operación Combine" value={combine.operation} disabled={list.disabled} onChange={event => {
          const operation = event.target.value as 'add' | 'subtract' | 'common'
          const base = { id: combine.id, name: combine.name, suppressed: combine.suppressed, type: 'combine' as const, keepTools: combine.keepTools }
          onFeature(operation === 'subtract'
            ? { ...base, operation, target: list.selection[0] ?? { bodyId: '', sourceFeatureId: '' }, tools: list.selection.slice(1).map(ref => ({ ...ref })) }
            : { ...base, operation, operands: list.selection.map(ref => ({ ...ref })), resultBodyId: outputBodyId })
        }}>
          <option value="add" disabled={existing && combine.operation === 'subtract'}>Unión</option>
          <option value="subtract" disabled={existing && combine.operation !== 'subtract'}>Sustraer</option>
          <option value="common" disabled={existing && combine.operation === 'subtract'}>Intersección</option>
        </select>
      </label>
      {combine.operation === 'subtract' && <label>Objetivo
        <select aria-label="Cuerpo objetivo de sustracción" value={referenceKey(combine.target)} disabled={list.disabled} onChange={event => {
          const target = list.selection.find(ref => referenceKey(ref) === event.target.value)
          if (target) list.onSelection([{ ...target }, ...list.selection.filter(ref => !sameBodyReference(ref, target)).map(ref => ({ ...ref }))])
        }}>
          {list.selection.map(ref => <option key={referenceKey(ref)} value={referenceKey(ref)}>{list.bodies.find(body => sameBodyReference(body.ref, ref))?.name ?? 'Cuerpo no disponible'}</option>)}
        </select>
      </label>}
      <label className="check-option"><input type="checkbox" checked={combine.keepTools} disabled={list.disabled} onChange={event => onFeature({ ...combine, keepTools: event.target.checked })} /> Conservar {combine.operation === 'subtract' ? 'herramientas' : 'cuerpos de entrada'}</label>
      <p className="muted-small">{combine.operation === 'subtract' ? 'El primer cuerpo es el objetivo; los demás son herramientas, en el orden seleccionado.' : 'Selecciona al menos dos cuerpos para crear el resultado de la operación.'}</p>
    </>}
    {!newBody && <>
      <BodyList {...list} single={single} />
      {combine && <ol className="body-operand-order" aria-label="Orden de cuerpos de Combine">{list.selection.map((ref, index) => <li key={referenceKey(ref)}>{combine.operation === 'subtract' && index === 0 ? 'Objetivo: ' : ''}{list.bodies.find(body => sameBodyReference(body.ref, ref))?.name ?? 'No disponible'}</li>)}</ol>}
      <button type="button" className={`outline-button ${picking ? 'active' : ''}`} disabled={list.disabled} onClick={() => onPicking(!picking)}><MousePointer2 size={14} /> Seleccionar cuerpos en el visor</button>
    </>}
    <button type="button" className="outline-button" disabled={list.disabled} onClick={() => onPicking(false)}><Eye size={14} /> Ver vista previa</button>
    {displayMessage && <p role="status" className="muted-small">{displayMessage}</p>}
  </div>
}
