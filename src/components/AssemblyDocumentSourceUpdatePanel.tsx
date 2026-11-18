import { assemblyDocumentUpdateChoices, assemblyDocumentUpdateEndpointKey, assemblyDocumentUpdateMateKey,
  assemblyDocumentUpdateReferenceKey, assemblyDocumentUpdateEndpointPathKind, type AssemblyDocumentUpdateReview, type AssemblyDocumentUpdateDecisions } from '../cad/kernel.assembly-document-update-types'

export type DocumentUpdateMateDecision = 'keep' | 'removed' | 'recapture' | 'unlocked'
type Locator = AssemblyDocumentUpdateDecisions['removed'][number]
type Endpoint = AssemblyDocumentUpdateReview['endpoints'][number]
export function assemblyDocumentUpdatePending(review: AssemblyDocumentUpdateReview, decisions: AssemblyDocumentUpdateDecisions): number {
  const removed = new Set(decisions.removed.map(assemblyDocumentUpdateMateKey))
  let pending = 0
  for (const endpoint of review.endpoints) {
    if (removed.has(assemblyDocumentUpdateMateKey(endpoint.locator))) continue
    const repairs = decisions.repairs.filter(value => assemblyDocumentUpdateEndpointKey(value.locator) === assemblyDocumentUpdateEndpointKey(endpoint.locator))
    if (repairs.length !== 1 || assemblyDocumentUpdateChoices(review, endpoint).filter(choice => choice.key === assemblyDocumentUpdateReferenceKey(repairs[0].reference,assemblyDocumentUpdateEndpointPathKind(review.document,endpoint.locator))).length !== 1) pending++
  }
  for (const mate of review.capturedMates) {
    const key = assemblyDocumentUpdateMateKey(mate)
    if (removed.has(key)) continue
    const recapture = decisions.recapture.some(value => assemblyDocumentUpdateMateKey(value) === key)
    const unlocked = decisions.unlocked.some(value => assemblyDocumentUpdateMateKey(value) === key)
    if (recapture === unlocked || unlocked && mate.type !== 'concentric') pending++
  }
  return pending
}
export interface AssemblyDocumentSourceUpdatePanelProps {
  review: AssemblyDocumentUpdateReview
  decisions: AssemblyDocumentUpdateDecisions
  busy: boolean
  cancelable?: boolean
  onRepair: (endpoint: Endpoint, key: string) => void
  onMateDecision: (locator: Locator, decision: DocumentUpdateMateDecision) => void
  onSolve: () => void
  onCancel: () => void
}
export default function AssemblyDocumentSourceUpdatePanel({ review, decisions, busy, cancelable = false, onRepair, onMateDecision, onSolve, onCancel }: AssemblyDocumentSourceUpdatePanelProps) {
  const mates = new Map<string, Locator>()
  for (const endpoint of review.endpoints) mates.set(assemblyDocumentUpdateMateKey(endpoint.locator), { scope: endpoint.locator.scope, mateId: endpoint.locator.mateId })
  for (const mate of review.capturedMates) mates.set(assemblyDocumentUpdateMateKey(mate), { scope: mate.scope, mateId: mate.mateId })
  const pending = assemblyDocumentUpdatePending(review, decisions)
  return <section className="assembly-section assembly-source-update" role="region" aria-label="Actualizar origen de subensamblaje" aria-busy={busy}>
    <h2>Actualizar origen de subensamblaje</h2>
    <p>{review.source.id} · {review.source.revision} → {review.replacement.revision} · {review.occurrences.length} usos guardados</p>
    <p>Se actualizarán todos los usos de esta revisión, incluidos los compartidos, suprimidos y dormantes. El archivo, la recuperación y el historial conservan el documento confirmado hasta Resolver y Aplicar.</p>
    <p>Selecciona referencias explícitas de la nueva fuente. Los nombres y las opciones del catálogo no prueban continuidad nativa; el worker verificará las referencias y relaciones al resolver.</p>
    {[...mates].map(([key, locator]) => {
      const capture = review.capturedMates.find(value => assemblyDocumentUpdateMateKey(value) === key)
      const decision = decisions.removed.some(value => assemblyDocumentUpdateMateKey(value) === key) ? 'removed'
        : decisions.recapture.some(value => assemblyDocumentUpdateMateKey(value) === key) ? 'recapture'
          : decisions.unlocked.some(value => assemblyDocumentUpdateMateKey(value) === key) ? 'unlocked' : 'keep'
      return <label key={key}>{locator.scope.id} · {locator.mateId}{capture ? ` · ${capture.type}` : ''}
        <select aria-label={`Decisión de relación ${locator.scope.id} ${locator.scope.revision} ${locator.mateId}`} value={decision} disabled={busy}
          onChange={event => onMateDecision(locator, event.target.value as DocumentUpdateMateDecision)}>
          <option value="keep">{capture ? 'Selecciona una decisión de captura' : 'Conservar y reparar referencias'}</option>
          <option value="removed">Eliminar relación</option>
          {capture && <option value="recapture">Solicitar nueva captura nativa</option>}
          {capture?.type === 'concentric' && <option value="unlocked">Liberar bloqueo de giro</option>}
        </select>
        {capture && <span>La captura puede rechazarse en un ámbito inactivo; esta decisión no garantiza una solución.</span>}
      </label>
    })}
    {review.endpoints.map(endpoint => {
      const key = assemblyDocumentUpdateEndpointKey(endpoint.locator), label = `${endpoint.locator.scope.id} ${endpoint.locator.scope.revision} ${endpoint.locator.mateId} ${endpoint.locator.side}`
      const removed = decisions.removed.some(value => assemblyDocumentUpdateMateKey(value) === assemblyDocumentUpdateMateKey(endpoint.locator))
      const repair = decisions.repairs.find(value => assemblyDocumentUpdateEndpointKey(value.locator) === key)
      const choices = assemblyDocumentUpdateChoices(review, endpoint)
      return <fieldset key={key} className="assembly-source-endpoint" data-assembly-endpoint={key} data-endpoint-status={removed ? 'removed' : repair ? 'explicit-choice' : 'needs-repair'}>
        <legend>{label}{endpoint.locator.side==='angle-0'?' · Plano angular A de bisagra':endpoint.locator.side==='angle-1'?' · Plano angular B de bisagra':''}</legend><p>{removed ? 'Relación marcada para eliminar' : 'Referencia pendiente de verificación nativa'}</p>
        <label>Referencia actual del nuevo subensamblaje<select aria-label={`Referencia de reparación ${label}`} disabled={busy || removed}
          value={repair ? assemblyDocumentUpdateReferenceKey(repair.reference,assemblyDocumentUpdateEndpointPathKind(review.document,endpoint.locator)) : ''} onChange={event => onRepair(endpoint, event.target.value)}>
          <option value="">Selecciona una referencia actual</option>{choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}
        </select></label>
        {!choices.length && <p>No hay una referencia compatible. Puedes eliminar la relación; no se inventará un descendiente ni un soporte.</p>}
      </fieldset>
    })}
    {!!review.unresolvedEndpoints.length && <p>{review.unresolvedEndpoints.length} referencias anteriores no resueltas. Estos diagnósticos no atribuyen automáticamente el problema a esta actualización.</p>}
    <p>{pending} decisiones pendientes</p>
    <button className="assembly-primary" aria-label="Resolver actualización de subensamblaje" disabled={busy || pending > 0} onClick={onSolve}>Resolver actualización de subensamblaje</button>
    <button aria-label="Cancelar actualización de subensamblaje" disabled={busy && !cancelable} onClick={onCancel}>Cancelar actualización de subensamblaje</button>
  </section>
}
