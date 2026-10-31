import { useEffect, useState } from 'react'
import type { AssemblyPreviewReply } from '../cad/kernel.assembly-types'
import type { AssemblyComponentReference } from '../model/assemblyDocument'
import type { AssemblyDragFrame } from '../model/assemblyDrag'
import { validateAssemblyTranslationRequest, validateAssemblyTranslationStopOptions,
  type AssemblyTranslationRequest, type AssemblyTranslationStopOptions } from '../model/assemblyTranslation'

type ReadyReply = Extract<AssemblyPreviewReply, { status: 'ready' }>
export type AssemblyUiTranslation = NonNullable<ReadyReply['translation']>
function sameComponent(a: AssemblyComponentReference, b: AssemblyComponentReference): boolean {
  return a.definition.id === b.definition.id && a.definition.revision === b.definition.revision
    && a.occurrencePath.length === b.occurrencePath.length && a.occurrencePath.every((id, index) => id === b.occurrencePath[index])
}
function field(value: string, name: string): number {
  const number = Number(value)
  if (!value.trim() || !Number.isFinite(number)) throw new Error(`${name} debe ser un número finito.`)
  return number
}
/** Detached numeric intent, without changing the query budget or granting authority. */
export function assemblyTranslationTarget(component: AssemblyComponentReference, translation: readonly [string, string, string], clearance: string): {
  request: AssemblyTranslationRequest; stopOptions: Pick<AssemblyTranslationStopOptions, 'clearance' | 'lengthTolerance'>
} {
  const request = validateAssemblyTranslationRequest({ component, translation: [field(translation[0], 'X'), field(translation[1], 'Y'), field(translation[2], 'Z')] })
  const options = validateAssemblyTranslationStopOptions({ clearance: field(clearance, 'La holgura'), lengthTolerance: 1e-6 })
  return { request, stopOptions: { clearance: options.clearance, lengthTolerance: options.lengthTolerance } }
}
/** Display/source binding only. A matching witness never supplies an Apply token. */
export function assemblyTranslationMatches(witness: AssemblyUiTranslation | undefined, frame: AssemblyDragFrame,
  request: AssemblyTranslationRequest, options: Pick<AssemblyTranslationStopOptions, 'clearance' | 'lengthTolerance'>): boolean {
  return !!witness && sameComponent(request.component, frame.component) && sameComponent(witness.component, frame.component)
    && sameComponent(witness.drivenComponent, frame.drivenComponent)
    && witness.requestedPose.translation.every((value, axis) => value === request.translation[axis])
    && witness.clearance === options.clearance && witness.lengthTolerance === options.lengthTolerance
}
export interface AssemblyTranslationPanelProps {
  frame: AssemblyDragFrame | null
  name: string
  drivenName?: string
  blockedReason?: string
  disabled: boolean
  witness?: AssemblyUiTranslation
  checks?: ReadyReply['checks']
  onPreview: (request: AssemblyTranslationRequest, options: Pick<AssemblyTranslationStopOptions, 'clearance' | 'lengthTolerance'>) => void
}
const scalar = (value: number) => Number(value.toPrecision(10)).toString()
const position = (values: readonly number[]) => values.map(scalar).join(', ')
export default function AssemblyTranslationPanel({ frame, name, drivenName, blockedReason, disabled, witness, checks = [], onPreview }: AssemblyTranslationPanelProps) {
  const [translation, setTranslation] = useState<[string, string, string]>(() => frame ? frame.worldPose.translation.map(String) as [string, string, string] : ['', '', ''])
  const [clearance, setClearance] = useState('0'), [error, setError] = useState('')
  const frameSignature = JSON.stringify(frame && [frame.component, frame.worldPose])
  useEffect(() => { setTranslation(frame ? frame.worldPose.translation.map(String) as [string, string, string] : ['', '', '']); setError('') }, [frameSignature])
  const blocked = disabled || !frame
  return <section className="assembly-section assembly-movement" role="region" aria-label="Trasladar hasta contacto">
    <h3>Trasladar hasta contacto</h3><p>Destino absoluto global de {name}, en milímetros. Se traslada el grupo rígido {drivenName ?? name} en línea recta, sin cambiar su orientación.</p>
    <p>Se incluyen las piezas activas ocultas. Las relaciones pueden trasladar otros componentes. Si el destino requiere un giro o ya hay contacto entre piezas con movimiento relativo, la operación se rechaza.</p>
    {!frame && <p>{blockedReason ?? 'Selecciona un componente activo dentro de un grupo raíz libre.'}</p>}
    <div className="assembly-coordinate-grid">{(['X', 'Y', 'Z'] as const).map((label, index) => <label key={label}>{label} global · mm<input aria-label={`Destino global ${label} hasta contacto`} type="number" step="any" value={translation[index]} disabled={blocked} onChange={event => {
      const next: [string, string, string] = [...translation]; next[index] = event.target.value; setTranslation(next); setError('')
    }} /></label>)}</div>
    <label>Holgura · mm<input aria-label="Holgura hasta contacto" type="number" min="0" step="any" value={clearance} disabled={blocked} onChange={event => { setClearance(event.target.value); setError('') }} /></label>
    <button aria-label="Vista previa con parada" className="assembly-primary" disabled={blocked} onClick={() => {
      if (blocked || !frame) return
      try { const intent = assemblyTranslationTarget(frame.component, translation, clearance); setError(''); onPreview(intent.request, intent.stopOptions) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo preparar la traslación.') }
    }}>Vista previa con parada</button>
    {error && <p role="alert">{error}</p>}
    {witness && <div className="assembly-movement-witness" aria-label="Resultado de traslación hasta contacto">
      <p>{witness.trace.status === 'stopped' ? 'Parada en la banda numérica de contacto' : 'Destino completado'} · recorrido {scalar(witness.trace.fraction * 100)} %.</p>
      <p aria-label="Destino solicitado hasta contacto">Destino solicitado global: {position(witness.requestedPose.translation)} mm.</p>
      <p aria-label="Posición resuelta hasta contacto">Posición resuelta global: {position(witness.resolvedPose.translation)} mm.</p>
      <p>Holgura solicitada: {scalar(witness.clearance)} mm. Tolerancia de distancia: {scalar(witness.lengthTolerance)} mm. La parada usa una banda numérica adicional; no afirma contacto exacto.</p>
      {witness.trace.blockingPair && <p>{witness.trace.blockingPair.first.componentName} · {witness.trace.blockingPair.first.bodyName} / {witness.trace.blockingPair.second.componentName} · {witness.trace.blockingPair.second.bodyName}: distancia {scalar(witness.trace.blockingPair.minimumDistance)} mm; banda de parada {scalar(witness.trace.blockingPair.band)} mm.</p>}
      <p>{witness.trace.bodyCount} cuerpos activos; {witness.trace.pairCount} pares con movimiento relativo, {witness.trace.queryCount} consultas de distancia. Pares de desplazamiento igual: {witness.trace.invariantPairCount}. Conservan su separación; no se certifica que estén libres de interferencias.</p>
      <div aria-label="Relaciones de la traslación"><strong>Comprobación de relaciones</strong><p>{checks.length ? `${checks.filter(check => check.satisfied).length} de ${checks.length} dentro de sus tolerancias.` : 'No hay relaciones activas que comprobar.'}</p>
        {checks.some(check => !check.satisfied) && <p>Hay relaciones fuera de tolerancia.</p>}</div>
      <p>Los grados de libertad corresponden a las relaciones guardadas, sin ancla temporal. Revisa la posición antes de Aplicar; el documento confirmado todavía no ha cambiado.</p>
    </div>}
  </section>
}
