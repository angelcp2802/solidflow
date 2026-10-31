import { isAssemblyPathEndpoint, isAssemblyProfileCenterEndpoint, withAssemblyMateEndpointComponent } from '../model/assemblyMateEndpoints'
import { assemblyCircularPathCatalogChoices, assemblyDocumentUpdateEndpointPathKind, assemblyLinePathCatalogChoices, assemblyProfileCenterCatalogChoices, assemblyDocumentUpdateReferenceKey } from '../cad/kernel.assembly-document-update-types'
import { useState } from 'react'
import { assemblyDefinitionKey, validateAssemblyVertexReference, type AssemblyFaceReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference } from '../model/assemblyDocument'
import type { AssemblyMateEndpointLocator } from '../model/assemblySourceUpdates'
import type { AssemblyReplacementDecisions, AssemblyReplacementReference, AssemblyReplacementReview } from '../cad/kernel.assembly-replacement'
import { assemblySceneFaceReference, assemblySceneCylinderSurfaceReference, assemblySceneSphereSurfaceReference, assemblySceneEdgeReference } from '../cad/kernel.assembly-types'

export type AssemblyReplacementEndpoint = AssemblyReplacementReview['endpoints'][number]
export interface AssemblyReplacementChoice { key: string; label: string; reference: AssemblyReplacementReference }
export const replacementMateKey = (value: { scope: AssemblyMateEndpointLocator['scope']; mateId: string }): string =>
  JSON.stringify([value.scope.id, value.scope.revision, value.mateId])
export const replacementEndpointKey = (value: AssemblyMateEndpointLocator): string => JSON.stringify([replacementMateKey(value), value.side])
const display = (values: readonly number[]) => values.map(value => Number(value.toPrecision(6))).join(', ')
const mechanicalName = { gear: 'engranaje', screw: 'tornillo', 'rack-pinion': 'cremallera y piñón' }
function mateName(review: AssemblyReplacementReview, locator: { scope: AssemblyMateEndpointLocator['scope']; mateId: string }): string {
  const scope = [review.document, ...review.document.definitions].find(value => assemblyDefinitionKey(value) === assemblyDefinitionKey(locator.scope))
  return scope?.kind === 'assembly' ? scope.mates.find(value => value.id === locator.mateId)?.name ?? locator.mateId : locator.mateId
}

/** Prototype reference choices only; a fresh placed native solve grants Apply. */
export function assemblyReplacementChoices(review: AssemblyReplacementReview, endpoint: AssemblyReplacementEndpoint): AssemblyReplacementChoice[] {
  const original = endpoint.endpoint, component = structuredClone(endpoint.desiredComponent)
  if (isAssemblyPathEndpoint(original)) {
    const pathKind=assemblyDocumentUpdateEndpointPathKind(review.document,endpoint.locator)
    if(!pathKind)return []
    if (assemblyDefinitionKey(component.definition) !== assemblyDefinitionKey(review.replacement)) return []
    return (pathKind==='circular-path'?assemblyCircularPathCatalogChoices(review.replacementCatalog):assemblyLinePathCatalogChoices(review.replacementCatalog)).flatMap(choice => {
      if (assemblyDefinitionKey(choice.reference.component.definition) !== assemblyDefinitionKey(review.replacement)) return []
      const reference = withAssemblyMateEndpointComponent(choice.reference, component)
      return [{ key: assemblyDocumentUpdateReferenceKey(reference,pathKind), label: choice.label + ' · arista y origen completos', reference }]
    })
  }
  if (isAssemblyProfileCenterEndpoint(original)) {
    if (assemblyDefinitionKey(component.definition) !== assemblyDefinitionKey(review.replacement)) return []
    return assemblyProfileCenterCatalogChoices(review.replacementCatalog, original.axis !== null).flatMap(choice => {
      if (assemblyDefinitionKey(choice.reference.face.component.definition) !== assemblyDefinitionKey(review.replacement)) return []
      const reference = withAssemblyMateEndpointComponent(choice.reference, component)
      return [{ key: assemblyDocumentUpdateReferenceKey(reference), label: choice.label + ' · cara y eje completos', reference }]
    })
  }
  if ('occurrencePath' in original) return [{ key: JSON.stringify(component), label: `Marco del componente · ${JSON.stringify(component.occurrencePath)}`, reference: component }]
  if (original.kind === 'principal-axis') {
    const reference = { ...structuredClone(original), component }
    return [{ key: JSON.stringify(reference), label: `Eje de origen ${reference.axis} del componente · ${JSON.stringify(component.occurrencePath)}`, reference }]
  }
  if (original.kind === 'principal-plane') {
    const reference = { ...structuredClone(original), component }
    return [{ key: JSON.stringify(reference), label: `Plano ${reference.plane} del componente · ${JSON.stringify(component.occurrencePath)}`, reference }]
  }
  if (assemblyDefinitionKey(component.definition) !== assemblyDefinitionKey(review.replacement)) return []
  const choices: AssemblyReplacementChoice[] = []
  for (const body of review.replacementCatalog.bodies) {
    if (assemblyDefinitionKey(body.component.definition) !== assemblyDefinitionKey(review.replacement)) continue
    if(original.kind==='vertex'){
      for(const vertex of body.vertexPoints??[]){
        if(assemblyDefinitionKey(vertex.selection.component.definition)!==assemblyDefinitionKey(body.component.definition)||JSON.stringify(vertex.selection.component.occurrencePath)!==JSON.stringify(body.component.occurrencePath)||(body.body===null?vertex.selection.body!==null:vertex.selection.body===null||vertex.selection.body.bodyId!==body.body.bodyId||vertex.selection.body.sourceFeatureId!==body.body.sourceFeatureId))continue
        let reference
        try{reference=validateAssemblyVertexReference({kind:'vertex',...vertex.selection,support:'point'})}catch{continue}
        reference.component=structuredClone(component)
        choices.push({key:JSON.stringify(reference),reference,label:`${body.name} · Vértice (${display(vertex.point)}) mm`})
      }
      continue
    }
    if (original.kind === 'edge') {
      for (const edge of body.edges ?? []) {
        const reference = assemblySceneEdgeReference(edge)
        if (!reference || !edge.support) continue
        reference.component = structuredClone(component)
        choices.push({ key: JSON.stringify(reference), reference,
          label: `${body.name} · Arista lineal · (${display(edge.support.point)}) · dirección (${display(edge.support.axis)}) · ${reference.edge.sourceFeatureId}` })
      }
      continue
    }
    for (const face of body.faces) {
      const reference: AssemblyFaceReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference | null = original.support === 'sphere-surface' ? assemblySceneSphereSurfaceReference(face)
        : original.support === 'cylinder-surface' ? assemblySceneCylinderSurfaceReference(face) : assemblySceneFaceReference(face)
      if (!reference || reference.support !== original.support) continue
      reference.component = structuredClone(component)
      const label = face.sphereSurface ? `Superficie esférica R${face.sphereSurface.radius} · centro (${display(face.sphereSurface.center)})`
        : face.support?.kind === 'cylinder' ? `${reference.support === 'axis' ? 'Eje cilíndrico' : 'Superficie cilíndrica'} R${face.support.radius} · (${display(face.support.point)}) · dirección (${display(face.support.axis)})`
          : face.support ? `Plano · (${display(face.support.point)}) · normal (${display(face.support.normal)})` : 'Referencia'
      choices.push({ key: JSON.stringify(reference), reference, label: `${body.name} · ${label} · ${reference.face.sourceFeatureId}` })
    }
  }
  return [...new Map(choices.map(choice => [choice.key, choice])).values()]
}

export function assemblyReplacementPending(review: AssemblyReplacementReview, decisions: AssemblyReplacementDecisions): number {
  const removed = new Set(decisions.removed.map(replacementMateKey)), repaired = new Set(decisions.repairs.map(value => replacementEndpointKey(value.locator)))
  const captured = new Set(decisions.recapture.map(replacementMateKey))
  return review.endpoints.filter(endpoint => !endpoint.retainFrame && !removed.has(replacementMateKey(endpoint.locator)) && !repaired.has(replacementEndpointKey(endpoint.locator))).length
    + review.mechanicalMates.filter(mate => mate.requiresRecapture && !removed.has(replacementMateKey(mate)) && !captured.has(replacementMateKey(mate))).length
}
function ReplacementEndpoint({ review, endpoint, decisions, disabled, onRepair }: {
  review: AssemblyReplacementReview; endpoint: AssemblyReplacementEndpoint; decisions: AssemblyReplacementDecisions; disabled: boolean
  onRepair: (endpoint: AssemblyReplacementEndpoint, choice: AssemblyReplacementChoice) => void
}) {
  const [selected, setSelected] = useState(''), choices = assemblyReplacementChoices(review, endpoint)
  const removed = decisions.removed.some(value => replacementMateKey(value) === replacementMateKey(endpoint.locator))
  const repaired = decisions.repairs.some(value => replacementEndpointKey(value.locator) === replacementEndpointKey(endpoint.locator))
  const choice = choices.find(value => value.key === selected), label = `${endpoint.locator.mateId} ${endpoint.locator.side}`
  return <fieldset className="assembly-source-endpoint" data-replacement-endpoint={replacementEndpointKey(endpoint.locator)}
    data-endpoint-status={removed ? 'removed' : repaired ? 'manual-repair' : endpoint.status}>
    <legend>{mateName(review, endpoint.locator)} · {endpoint.locator.side === 'axis-0' ? 'Eje A de bisagra' : endpoint.locator.side === 'axis-1' ? 'Eje B de bisagra' : endpoint.locator.side === 'axial-0' ? 'Plano axial A de bisagra' : endpoint.locator.side === 'axial-1' ? 'Plano axial B de bisagra' : endpoint.locator.side === 'angle-0' ? 'Plano angular A de bisagra' : endpoint.locator.side === 'angle-1' ? 'Plano angular B de bisagra' : endpoint.locator.side === 'up' ? 'Guía UP · cara plana material' : endpoint.locator.side === 'point' ? 'Punto material' : endpoint.locator.side === 'path' ? 'Trayecto y origen material' : endpoint.locator.side === 'source' ? 'Origen' : endpoint.locator.side === 'target' ? 'Destino' : endpoint.locator.side === 'mirror' ? 'Plano de simetría' : endpoint.locator.side === 'width-0' ? 'Anchura · plano 1' : endpoint.locator.side === 'width-1' ? 'Anchura · plano 2' : endpoint.locator.side === 'tab-0' ? 'Pestaña · plano 1' : endpoint.locator.side === 'tab-1' ? 'Pestaña · plano 2' : endpoint.locator.side === 'first' ? 'Referencia 1' : endpoint.locator.side === 'second' ? 'Referencia 2' : endpoint.locator.side === 'guide' ? 'Eje guía' : 'Componente portador'} · {JSON.stringify(endpoint.desiredComponent.occurrencePath)}</legend>
    <p>{removed ? 'Relación marcada para eliminar al Aplicar.' : repaired ? 'Referencia elegida · pendiente de resolver.' : endpoint.message}</p>
    {!endpoint.retainFrame && !removed && <>
      <label>Referencia de la pieza sustituta<select aria-label={`Referencia de sustitución ${label}`} value={selected} disabled={disabled}
        onChange={event => setSelected(event.currentTarget.value)}>
        <option value="">Selecciona una referencia actual</option>{choices.map(value => <option key={value.key} value={value.key} title={value.label}>{value.label}</option>)}
      </select></label>
      <button aria-label={`Reparar sustitución ${label}`} disabled={disabled || !choice} onClick={() => { if (choice) onRepair(endpoint, choice) }}>Usar referencia</button>
      {!choices.length && <p>No hay un soporte compatible. Cancela o elimina expresamente esta relación.</p>}
    </>}
  </fieldset>
}
export interface AssemblyReplacementPanelProps {
  review: AssemblyReplacementReview
  decisions: AssemblyReplacementDecisions
  busy: boolean
  cancelable: boolean
  onRepair: (endpoint: AssemblyReplacementEndpoint, choice: AssemblyReplacementChoice) => void
  onDecisionsChange: (decisions: AssemblyReplacementDecisions) => void
  onSolve: () => void
  onCancel: () => void
}
export default function AssemblyReplacementPanel(props: AssemblyReplacementPanelProps) {
  const { review, decisions, busy } = props, pending = assemblyReplacementPending(review, decisions)
  const affected = new Map(review.endpoints.map(endpoint => [replacementMateKey(endpoint.locator), { scope: endpoint.locator.scope, mateId: endpoint.locator.mateId }]))
  for (const mate of review.mechanicalMates) affected.set(replacementMateKey(mate), { scope: mate.scope, mateId: mate.mateId })
  return <section className="assembly-section assembly-replacement" role="region" aria-label="Sustituir componente" aria-busy={busy}>
    <h2>Revisar sustitución de pieza</h2>
    <p>{review.expandedPaths.length} instancias · {review.occurrences.length} declaraciones afectadas</p>
    {review.scopeMap.length > 0 && <p>Esta instancia tendrá definiciones independientes de sus subensamblajes. Las otras copias conservan sus definiciones originales.</p>}
    <details><summary>Instancias que cambiarán</summary>{review.expandedPaths.map(value => <p key={JSON.stringify(value)}>{JSON.stringify(value)}</p>)}</details>
    <p>Las caras, aristas y vértices necesitan una elección explícita aunque tengan el mismo nombre. Las referencias de la lista usan coordenadas locales de la pieza sustituta.</p>
    <p>El archivo, la recuperación y el historial conservan el documento confirmado hasta Resolver y Aplicar.</p>
    <p>Resolver puede recolocar componentes para cumplir las relaciones.</p>
    {review.endpoints.map(endpoint => <ReplacementEndpoint key={replacementEndpointKey(endpoint.locator)} review={review} endpoint={endpoint}
      decisions={decisions} disabled={busy} onRepair={props.onRepair} />)}
    {!review.endpoints.length && <p>No hay referencias de relaciones afectadas.</p>}
    {review.mechanicalMates.filter(mate => mate.requiresRecapture).map(mate => {
      const key = replacementMateKey(mate), removed = decisions.removed.some(value => replacementMateKey(value) === key)
      return <label className="assembly-check" key={'capture-' + key}><input type="checkbox" aria-label={`Recapturar sustitución ${mate.mateId}`} disabled={busy || removed}
        checked={decisions.recapture.some(value => replacementMateKey(value) === key)} onChange={event => props.onDecisionsChange({ ...decisions,
          recapture: event.currentTarget.checked ? [...decisions.recapture, { scope: { ...mate.scope }, mateId: mate.mateId }] : decisions.recapture.filter(value => replacementMateKey(value) !== key) })} />
        Solicitar nueva captura de {mechanicalName[mate.type]} · {mateName(review, mate)}</label>
    })}
    {review.mechanicalMates.some(mate => mate.requiresRecapture) && <p>La nueva captura establece ceros mecánicos desde una solución nativa nueva dentro de esta sustitución. Si el acoplamiento no está disponible, debes repararlo o eliminarlo expresamente.</p>}
    {!!affected.size && <details><summary>Eliminar relaciones afectadas</summary>{[...affected].map(([key, mate]) => <label className="assembly-check" key={key}>
      <input type="checkbox" aria-label={`Eliminar en sustitución ${mate.scope.id} ${mate.scope.revision} ${mate.mateId}`} disabled={busy}
        checked={decisions.removed.some(value => replacementMateKey(value) === key)} onChange={event => {
          const removed = event.currentTarget.checked
          props.onDecisionsChange({ ...decisions, removed: removed ? [...decisions.removed, structuredClone(mate)] : decisions.removed.filter(value => replacementMateKey(value) !== key),
            repairs: removed ? decisions.repairs.filter(value => replacementMateKey(value.locator) !== key) : decisions.repairs,
            recapture: removed ? decisions.recapture.filter(value => replacementMateKey(value) !== key) : decisions.recapture })
        }} />Eliminar {mateName(review, mate)} · {mate.scope.id} · {mate.scope.revision}
    </label>)}</details>}
    {pending > 0 && <p>{pending} decisiones pendientes antes de resolver la sustitución.</p>}
    <button className="assembly-primary" aria-label="Resolver sustitución de pieza" disabled={busy || pending > 0} onClick={props.onSolve}>Resolver sustitución de pieza</button>
    <button aria-label="Cancelar sustitución de pieza" disabled={busy && !props.cancelable} onClick={props.onCancel}>Cancelar sustitución</button>
  </section>
}
