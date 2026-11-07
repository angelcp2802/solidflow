import { isAssemblyPathEndpoint, isAssemblyProfileCenterEndpoint } from '../model/assemblyMateEndpoints'
import { assemblyCircularPathCatalogChoices, assemblyDocumentUpdateEndpointPathKind, assemblyLinePathCatalogChoices, assemblyProfileCenterCatalogChoices, assemblyDocumentUpdateReferenceKey } from '../cad/kernel.assembly-document-update-types'
import type { AssemblyLinePathSelection } from '../model/assemblyLinePathReferences'
import type { AssemblyProfileCenterSelection } from '../model/assemblyProfileCenterReferences'
import { useState } from 'react'
import type { AssemblySourceUpdateReview } from '../cad/kernel.assembly-source-updates'
import { assemblySceneFaceReference, assemblySceneCylinderSurfaceReference, assemblySceneSphereSurfaceReference, assemblySceneEdgeReference, type AssemblySceneFace } from '../cad/kernel.assembly-types'
import { assemblyDefinitionKey, validateAssemblyVertexReference, type AssemblyVertexReference, type AssemblyDocument, type AssemblyFaceReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference, type AssemblyEdgeReference } from '../model/assemblyDocument'
import { assemblySourceScopePaths } from '../model/assemblySourceUpdates'

export type AssemblySourceEndpointReview = AssemblySourceUpdateReview['endpoints'][number]
export interface AssemblySourceRepairChoice { key: string; label: string; reference: AssemblyLinePathSelection | AssemblyProfileCenterSelection | AssemblyFaceReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference | AssemblyEdgeReference | AssemblyVertexReference }
export function assemblySourceEndpointKey(endpoint: AssemblySourceEndpointReview): string {
  return JSON.stringify([endpoint.locator.scope.id, endpoint.locator.scope.revision, endpoint.locator.mateId, endpoint.locator.side])
}
function samePath(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((value, index) => value === second[index])
}
/** Selection syntax only. A fresh worker solve must authenticate support and coordinate continuity. */
export function assemblySourceRepairChoices(review: AssemblySourceUpdateReview, document: AssemblyDocument,
  endpoint: AssemblySourceEndpointReview): AssemblySourceRepairChoice[] {
  if (isAssemblyPathEndpoint(endpoint.endpoint)) {
    const pathKind=assemblyDocumentUpdateEndpointPathKind(review.document,endpoint.locator)
    if(!pathKind)return []
    const original = endpoint.endpoint, prefixes = assemblySourceScopePaths(document, endpoint.locator.scope), choices = new Map<string, AssemblySourceRepairChoice>()
    for (const choice of pathKind==='circular-path'?assemblyCircularPathCatalogChoices(review.scene):assemblyLinePathCatalogChoices(review.scene)) {
      const component = choice.reference.component
      if (assemblyDefinitionKey(component.definition) !== assemblyDefinitionKey(review.replacement)) continue
      const prefix = prefixes.find(value => samePath(component.occurrencePath, [...value, ...original.component.occurrencePath]))
      if (!prefix) continue
      const reference = structuredClone(choice.reference); reference.component.occurrencePath = reference.component.occurrencePath.slice(prefix.length)
      const key = assemblyDocumentUpdateReferenceKey(reference,pathKind)
      choices.set(key, { key, label: choice.label + ' · arista y origen completos', reference })
    }
    return [...choices.values()]
  }
  if (isAssemblyProfileCenterEndpoint(endpoint.endpoint)) {
    const original = endpoint.endpoint, prefixes = assemblySourceScopePaths(document, endpoint.locator.scope), choices = new Map<string, AssemblySourceRepairChoice>()
    for (const choice of assemblyProfileCenterCatalogChoices(review.scene, original.axis !== null)) {
      const component = choice.reference.face.component
      if (assemblyDefinitionKey(component.definition) !== assemblyDefinitionKey(review.replacement)) continue
      const prefix = prefixes.find(value => samePath(component.occurrencePath, [...value, ...original.face.component.occurrencePath]))
      if (!prefix) continue
      const reference = structuredClone(choice.reference); reference.face.component.occurrencePath = reference.face.component.occurrencePath.slice(prefix.length)
      const key = assemblyDocumentUpdateReferenceKey(reference)
      choices.set(key, { key, label: choice.label + ' · cara y eje completos', reference })
    }
    return [...choices.values()]
  }
  if (!('kind' in endpoint.endpoint) || endpoint.endpoint.kind !== 'face' && endpoint.endpoint.kind !== 'edge' && endpoint.endpoint.kind !== 'vertex') return []
  const original = endpoint.endpoint, prefixes = assemblySourceScopePaths(document, endpoint.locator.scope)
  const choices = new Map<string, AssemblySourceRepairChoice>()
  if(original.kind==='vertex'){
    for(const body of review.scene.bodies)for(const vertex of body.vertexPoints??[]){
      if(assemblyDefinitionKey(vertex.selection.component.definition)!==assemblyDefinitionKey(body.component.definition)||JSON.stringify(vertex.selection.component.occurrencePath)!==JSON.stringify(body.component.occurrencePath)||(body.body===null?vertex.selection.body!==null:vertex.selection.body===null||vertex.selection.body.bodyId!==body.body.bodyId||vertex.selection.body.sourceFeatureId!==body.body.sourceFeatureId)
        ||assemblyDefinitionKey(vertex.selection.component.definition)!==assemblyDefinitionKey(review.replacement))continue
      let reference:AssemblyVertexReference
      try{reference=validateAssemblyVertexReference({kind:'vertex',...vertex.selection,support:'point'})}catch{continue}
      const prefix=prefixes.find(value=>samePath(reference.component.occurrencePath,[...value,...original.component.occurrencePath]))
      if(!prefix)continue
      reference.component.occurrencePath=reference.component.occurrencePath.slice(prefix.length)
      const key=JSON.stringify(reference)
      if(!choices.has(key))choices.set(key,{key,reference,label:`${vertex.selection.component.occurrencePath.join(' / ')} · Vértice (${vertex.point.map(v=>Number(v.toPrecision(6))).join(', ')}) mm`})
    }
    return [...choices.values()]
  }
  if (original.kind === 'edge') {
    for (const body of review.scene.bodies) for (const edge of body.edges ?? []) {
      const reference = assemblySceneEdgeReference(edge)
      if (!reference || assemblyDefinitionKey(reference.component.definition) !== assemblyDefinitionKey(review.replacement)) continue
      const prefix = prefixes.find(value => samePath(reference.component.occurrencePath, [...value, ...original.component.occurrencePath]))
      if (!prefix) continue
      reference.component.occurrencePath = reference.component.occurrencePath.slice(prefix.length)
      const key = JSON.stringify(reference)
      if (!choices.has(key)) choices.set(key, { key, reference, label: `${edge.selection.component.occurrencePath.join(' / ')} · Arista lineal · punto (${edge.support!.point.join(', ')}) · dirección (${edge.support!.axis.join(', ')}) · ${reference.body?.bodyId ?? 'agregado'} · ${edge.selection.edge.sourceFeatureId}` })
    }
    return [...choices.values()]
  }
  for (const body of review.scene.bodies) for (const face of body.faces) {
    const reference: AssemblyFaceReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference | null = original.support === 'sphere-surface' ? assemblySceneSphereSurfaceReference(face)
      : original.support === 'cylinder-surface' ? assemblySceneCylinderSurfaceReference(face)
        : original.support === 'plane' || original.support === 'axis' ? assemblySceneFaceReference(face) : null
    if (!reference || reference.support !== original.support || assemblyDefinitionKey(reference.component.definition) !== assemblyDefinitionKey(review.replacement)) continue
    const prefix = prefixes.find(value => samePath(reference.component.occurrencePath, [...value, ...original.component.occurrencePath]))
    if (!prefix) continue
    reference.component.occurrencePath = reference.component.occurrencePath.slice(prefix.length)
    // Reused scopes have one saved declaration. Collapse its equivalent actual
    // expansions, retaining the first concrete expansion as a visible label.
    const key = JSON.stringify(reference)
    if (!choices.has(key)) choices.set(key, { key, reference, label: sourceFaceLabel(face) + (original.support === 'cylinder-surface' ? ' · Superficie cilíndrica' : '') })
  }
  return [...choices.values()]
}
function sourceFaceLabel(face: AssemblySceneFace): string {
  if (face.sphereSurface) return `${face.selection.component.occurrencePath.join(' / ')} · Superficie esférica R${face.sphereSurface.radius} · centro (${face.sphereSurface.center.map(value => Number(value.toPrecision(5))).join(', ')}) · ${face.selection.face.sourceFeatureId}`
  const support = face.support
  return `${face.selection.component.occurrencePath.join(' / ')} · ${support?.kind === 'cylinder' ? `Cilindro R${support.radius}` : 'Plano'} · (${support?.point.map(value => Number(value.toPrecision(5))).join(', ')}) · ${face.selection.face.sourceFeatureId}`
}
export function assemblySourceActiveOccurrenceCount(review: AssemblySourceUpdateReview): number {
  return new Set(review.scene.bodies.filter(body => assemblyDefinitionKey(body.component.definition) === assemblyDefinitionKey(review.replacement))
    .map(body => JSON.stringify(body.component.occurrencePath))).size
}
interface EndpointProps {
  review: AssemblySourceUpdateReview; document: AssemblyDocument; endpoint: AssemblySourceEndpointReview
  repaired: boolean; disabled: boolean; onRepair: (endpoint: AssemblySourceEndpointReview, choice: AssemblySourceRepairChoice) => void
}
function SourceEndpoint({ review, document, endpoint, repaired, disabled, onRepair }: EndpointProps) {
  const [selected, setSelected] = useState(''), choices = assemblySourceRepairChoices(review, document, endpoint)
  const isEdge = 'kind' in endpoint.endpoint && endpoint.endpoint.kind === 'edge'
  const isVertex='kind' in endpoint.endpoint&&endpoint.endpoint.kind==='vertex'
  const choice = choices.find(value => value.key === selected), label = `${endpoint.locator.mateId} ${endpoint.locator.side}`
  const scope = assemblyDefinitionKey(document) === assemblyDefinitionKey(endpoint.locator.scope) ? document
    : document.definitions.find(value => value.kind === 'assembly' && assemblyDefinitionKey(value) === assemblyDefinitionKey(endpoint.locator.scope))
  const mate = scope?.kind === 'assembly' ? scope.mates.find(value => value.id === endpoint.locator.mateId) : undefined
  return <fieldset className="assembly-source-endpoint" data-assembly-endpoint={assemblySourceEndpointKey(endpoint)} data-endpoint-status={repaired ? 'manual-repair' : endpoint.status}>
    <legend>{scope?.kind === 'assembly' ? scope.name : 'Ámbito no disponible'} · {mate?.name ?? 'Relación afectada'} · {endpoint.locator.side === 'axis-0' ? 'Eje A de bisagra' : endpoint.locator.side === 'axis-1' ? 'Eje B de bisagra' : endpoint.locator.side === 'axial-0' ? 'Plano axial A de bisagra' : endpoint.locator.side === 'axial-1' ? 'Plano axial B de bisagra' : endpoint.locator.side === 'angle-0' ? 'Plano angular A de bisagra' : endpoint.locator.side === 'angle-1' ? 'Plano angular B de bisagra' : endpoint.locator.side === 'up' ? 'Guía UP · cara plana material' : endpoint.locator.side === 'point' ? 'Punto material' : endpoint.locator.side === 'path' ? 'Trayecto y origen material' : endpoint.locator.side === 'source' ? 'Origen' : endpoint.locator.side === 'target' ? 'Destino' : endpoint.locator.side === 'mirror' ? 'Plano de simetría' : endpoint.locator.side === 'width-0' ? 'Anchura · plano 1' : endpoint.locator.side === 'width-1' ? 'Anchura · plano 2' : endpoint.locator.side === 'tab-0' ? 'Pestaña · plano 1' : endpoint.locator.side === 'tab-1' ? 'Pestaña · plano 2' : endpoint.locator.side === 'first' ? 'Referencia 1' : endpoint.locator.side === 'second' ? 'Referencia 2' : endpoint.locator.side === 'guide' ? 'Eje guía' : 'Componente portador'}</legend>
    <p>{repaired ? 'Reparada manualmente · pendiente de resolver' : endpoint.status === 'needs-repair' ? 'Necesita reparación' : endpoint.status === 'retained-semantic' ? 'Referencia semántica conservada' : 'Componente conservado'}</p>
    <p>{endpoint.message}</p>
    {endpoint.status === 'needs-repair' && <>
      <label>{isVertex ? 'Vértice actual del mismo componente' : isEdge ? 'Arista lineal actual del mismo componente' : 'Cara actual del mismo componente'}<select aria-label={`${isVertex ? 'Vértice' : isEdge ? 'Arista' : 'Cara'} de reparación ${label}`} value={selected} disabled={disabled} onChange={event => setSelected(event.target.value)}>
        <option value="">{isVertex ? 'Selecciona un vértice actual' : isEdge ? 'Selecciona una arista lineal actual' : 'Selecciona una cara actual'}</option>{choices.map(value => <option key={value.key} value={value.key}>{value.label}</option>)}
      </select></label>
      <button aria-label={`Reparar referencia ${label}`} disabled={disabled || !choice} onClick={() => { if (choice) onRepair(endpoint, choice) }}>Reparar referencia</button>
      {isEdge && (mate?.type === 'limit-directed-angle'
        ? <p>Al resolver se comprobarán de nuevo las tres direcciones y el arco permitido.</p>
        : <p>El worker verificará la continuidad nativa de la dirección y del soporte. Si cambian los ceros del acoplamiento, se requiere una nueva captura.</p>)}
      {!choices.length && <p>{isVertex ? 'No hay un vértice compatible' : isEdge ? 'No hay una arista lineal compatible' : 'No hay una cara compatible'} en una ocurrencia activa de este ámbito. Se conserva la referencia pendiente.</p>}
    </>}
  </fieldset>
}
export interface AssemblySourceUpdatePanelProps {
  review: AssemblySourceUpdateReview; document: AssemblyDocument; repaired: readonly string[]; busy: boolean
  onRepair: EndpointProps['onRepair']; onSolve: () => void; onCancel: () => void; cancelable?: boolean
}
export default function AssemblySourceUpdatePanel({ review, document, repaired, busy, onRepair, onSolve, onCancel, cancelable = false }: AssemblySourceUpdatePanelProps) {
  const part = document.definitions.find(value => value.kind === 'part' && assemblyDefinitionKey(value) === assemblyDefinitionKey(review.replacement))
  return <section className="assembly-section assembly-source-update" role="region" aria-label="Actualizar origen compartido" aria-busy={busy}>
    <h2>Actualizar origen compartido</h2><p><strong>{part?.kind === 'part' ? part.document.name : 'Pieza incorporada'}</strong> · Nueva revisión de la pieza</p>
    <p>{review.occurrences.length} usos guardados · {assemblySourceActiveOccurrenceCount(review)} ocurrencias activas</p>
    <p>Se actualizarán todos los usos de esta revisión, incluidos los de definiciones compartidas. Las reparaciones del mismo ámbito se guardan una vez para todos sus usos.</p>
    <p>El archivo, la recuperación y el historial conservan el documento confirmado hasta Resolver y Aplicar.</p>
    {review.endpoints.map(endpoint => <SourceEndpoint key={assemblySourceEndpointKey(endpoint)} review={review} document={document} endpoint={endpoint}
      repaired={repaired.includes(assemblySourceEndpointKey(endpoint))} disabled={busy} onRepair={onRepair} />)}
    {!review.endpoints.length && <p>No hay referencias de relaciones afectadas.</p>}
    <button className="assembly-primary" aria-label="Resolver actualización de pieza" disabled={busy} onClick={onSolve}>Resolver actualización de pieza</button>
    <button aria-label="Cancelar actualización de pieza" disabled={busy && !cancelable} onClick={onCancel}>Cancelar actualización de pieza</button>
  </section>
}
