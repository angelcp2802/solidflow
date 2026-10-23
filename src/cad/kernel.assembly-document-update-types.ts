import { assemblyDefinitionKey, type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyDocumentUpdatePlan } from '../model/assemblySubassemblyUpdates'
import { isAssemblyProfileCenterEndpoint, isAssemblyPathEndpoint, assemblyMatePathKind, assemblyMateEndpointComponent, type AssemblyMateEndpointReference } from '../model/assemblyMateEndpoints'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import type { AssemblyProfileCenterSelection } from '../model/assemblyProfileCenterReferences'
import { validateAssemblyLinePathSelection, type AssemblyLinePathSelection } from '../model/assemblyLinePathReferences'
import type { AssemblyMateEndpointLocator } from '../model/assemblySourceUpdates'
import type { AssemblyReplacementMateLocator } from './kernel.assembly-replacement'
import { assemblySceneFaceReference, assemblySceneCylinderSurfaceReference, assemblySceneSphereSurfaceReference,
  assemblySceneEdgeReference, type AssemblyScene } from './kernel.assembly-types'
export interface AssemblyDocumentUpdateDecisions {
  repairs: { locator: AssemblyMateEndpointLocator; reference: AssemblyMateEndpointReference }[]
  removed: AssemblyReplacementMateLocator[]
  recapture: AssemblyReplacementMateLocator[]
  /** Explicitly release an affected concentric spin lock instead of recapturing it. */
  unlocked: AssemblyReplacementMateLocator[]
}
export interface AssemblyDocumentUpdateReview {
  kind: 'assembly-document-source-review'
  reviewId: string
  document: AssemblyDocument
  scene: AssemblyScene
  source: AssemblyDefinitionReference
  replacement: AssemblyDefinitionReference
  occurrences: AssemblyDocumentUpdatePlan['occurrences']
  endpoints: AssemblyDocumentUpdatePlan['endpoints']
  unresolvedEndpoints: AssemblyDocumentUpdatePlan['unresolvedEndpoints']
  capturedMates: AssemblyDocumentUpdatePlan['capturedMates']
  /** Separate source-local inspection, with suppressed children included.
   * It does not attest their placement or relations in the committed assembly. */
  replacementCatalog: AssemblyScene
  components: { path: string[]; definition: AssemblyDefinitionReference; kind: 'part' | 'assembly'; name: string }[]
}
const key = assemblyDefinitionKey
export const assemblyDocumentUpdateMateKey = (value: AssemblyReplacementMateLocator): string => JSON.stringify([key(value.scope), value.mateId])
export const assemblyDocumentUpdateEndpointKey = (value: AssemblyMateEndpointLocator): string => JSON.stringify([key(value.scope), value.mateId, value.side])
function owner(reference: AssemblyMateEndpointReference): AssemblyComponentReference | null {
  return assemblyMateEndpointComponent(reference)
}
type PathKind = 'line-path' | 'circular-path'
/** Compound selection shape carries no LINE/circle purpose. Read its saved role. */
export function assemblyDocumentUpdateEndpointPathKind(document: AssemblyDocument, locator: AssemblyMateEndpointLocator): PathKind | null {
  const scope=[document,...document.definitions].find(value=>key(value)===key(locator.scope))
  const mate=scope?.kind==='assembly'?scope.mates.find(value=>value.id===locator.mateId):undefined
  return mate?assemblyMatePathKind(mate,locator.side):null
}
function purpose(reference: AssemblyMateEndpointReference, pathKind: PathKind | null): string {
  if (isAssemblyProfileCenterEndpoint(reference)) return reference.axis === null ? 'profile-circle' : 'profile-rectangle'
  if (isAssemblyPathEndpoint(reference)) { if(!pathKind)throw Error('Compound path purpose requires its saved family and role.');return pathKind }
  return 'occurrencePath' in reference ? 'component' : reference.kind === 'principal-plane' ? 'principal-plane' : reference.kind + ':' + reference.support
}
export function assemblyDocumentUpdateReferenceKey(reference: AssemblyMateEndpointReference, pathKind: PathKind | null = 'line-path'): string {
  const component = owner(reference), identity = component && [component.occurrencePath, key(component.definition)]
  if (isAssemblyProfileCenterEndpoint(reference)) return JSON.stringify(['profile-center', identity, reference.face.body && [reference.face.body.bodyId, reference.face.body.sourceFeatureId], reference.face.face.sourceFeatureId, reference.face.face.key, reference.axis && [reference.axis.edge.sourceFeatureId, reference.axis.edge.key, reference.axis.sense]])
  if (isAssemblyPathEndpoint(reference)) { if(!pathKind)throw Error('Compound path key requires an explicit family.');return JSON.stringify([pathKind, identity, reference.body && [reference.body.bodyId, reference.body.sourceFeatureId], reference.edge.sourceFeatureId, reference.edge.key, reference.startVertex.sourceFeatureId, reference.startVertex.key]) }
  if ('occurrencePath' in reference) return JSON.stringify(['component', identity])
  if (reference.kind === 'principal-plane') return JSON.stringify([reference.kind, identity, reference.plane])
  const native = reference.kind === 'face' ? reference.face : reference.kind === 'edge' ? reference.edge : reference.vertex
  return JSON.stringify([reference.kind, reference.support, identity, reference.body && [reference.body.bodyId, reference.body.sourceFeatureId], native.sourceFeatureId, native.key])
}

/** Bounded syntactic candidates only. Joint face/edge membership and shape
 * kind must be re-queried natively before a repair can be accepted. */
export function assemblyProfileCenterCatalogChoices(scene: AssemblyScene, rectangle: boolean): { key: string; label: string; reference: AssemblyProfileCenterSelection }[] {
  const result: { key: string; label: string; reference: AssemblyProfileCenterSelection }[] = []
  let inspected = 0
  const add = (reference: AssemblyProfileCenterSelection, label: string) => {
    if (result.length >= 4096) throw Error('El catálogo compuesto de perfiles excede su límite; reduce el catálogo antes de reparar.')
    result.push({ key: assemblyDocumentUpdateReferenceKey(reference), label, reference })
  }
  for (const body of scene.bodies) for (const face of body.faces) {
    if (++inspected > 16384) throw Error('El catálogo de perfiles excede su presupuesto de inspección.')
    if (face.support?.kind !== 'plane') continue
    const selection = structuredClone(face.selection), label = body.component.occurrencePath.join(' / ') + ' · Cara ' + selection.face.key
    if (!rectangle) add({ face: selection, axis: null }, label)
    else for (const edge of body.edges ?? []) {
      if (++inspected > 16384) throw Error('El catálogo compuesto de perfiles excede su presupuesto de inspección.')
      if (edge.support?.kind !== 'line' || edge.selection.edge.sourceFeatureId !== selection.face.sourceFeatureId) continue
      for (const sense of [1, -1] as const) add({ face: structuredClone(selection), axis: { edge: structuredClone(edge.selection.edge), sense } }, label + ' · Arista ' + edge.selection.edge.key + ' · ' + (sense === 1 ? '+' : '−'))
    }
  }
  return result
}

/** Current syntax candidates only. The exact edge and material start must be
 * jointly re-queried by the worker; matching coordinates confer no incidence. */
export function assemblyLinePathCatalogChoices(scene: AssemblyScene): { key: string; label: string; reference: AssemblyLinePathSelection }[] {
  const result: { key: string; label: string; reference: AssemblyLinePathSelection }[] = []
  let inspected = 0
  for (const body of scene.bodies) for (const edge of body.edges ?? []) {
    if (++inspected > 16384) throw Error('El catálogo de trayectos excede su presupuesto de inspección.')
    if (edge.support?.kind !== 'line') continue
    for (const vertex of body.vertexPoints ?? []) {
      if (++inspected > 16384) throw Error('El catálogo compuesto de trayectos excede su presupuesto de inspección.')
      if (vertex.selection.vertex.sourceFeatureId !== edge.selection.edge.sourceFeatureId
        || JSON.stringify(vertex.selection.component) !== JSON.stringify(edge.selection.component)
        || JSON.stringify(vertex.selection.body) !== JSON.stringify(edge.selection.body)) continue
      if (result.length >= 4096) throw Error('El catálogo compuesto de trayectos excede su límite; reduce el catálogo antes de reparar.')
      const reference = validateAssemblyLinePathSelection({ ...structuredClone(edge.selection), startVertex: structuredClone(vertex.selection.vertex) })
      result.push({ key: assemblyDocumentUpdateReferenceKey(reference), reference,
        label: body.component.occurrencePath.join(' / ') + ' · Arista ' + reference.edge.key + ' · Inicio (' + vertex.point.join(', ') + ')' })
    }
  }
  return result
}

/** Detached current native circle/endpoint candidates only, no proof authority.
 * Do not infer circular kind from an absent LINE support or mesh coordinates. */
export function assemblyCircularPathCatalogChoices(scene: AssemblyScene): { key: string; label: string; reference: AssemblyArcPathSelection }[] {
  const result: {key:string;label:string;reference:AssemblyArcPathSelection}[]=[], keys=new Set<string>()
  let inspected=0
  for(const body of scene.bodies)for(const edge of body.edges??[]) {
    if(++inspected>16384)throw Error('El catálogo de trayectos circulares excede su presupuesto.')
    if(edge.support || !edge.circularPathOrigins || edge.circularPathOrigins.length!==2)continue
    for(const startVertex of edge.circularPathOrigins) {
      if(++inspected>16384 || result.length>=4096)throw Error('El catálogo compuesto de arcos excede su presupuesto.')
      if(JSON.stringify(edge.selection.component)!==JSON.stringify(body.component)||JSON.stringify(edge.selection.body)!==JSON.stringify(body.body))continue
      const vertex=(body.vertexPoints??[]).filter(v=>JSON.stringify(v.selection.component)===JSON.stringify(body.component)&&JSON.stringify(v.selection.body)===JSON.stringify(body.body)&&v.selection.vertex.key===startVertex.key&&v.selection.vertex.sourceFeatureId===startVertex.sourceFeatureId)
      if(vertex.length!==1)continue
      const reference=validateAssemblyArcPathSelection({...structuredClone(edge.selection),startVertex:structuredClone(startVertex)}), identity=assemblyDocumentUpdateReferenceKey(reference,'circular-path')
      if(keys.has(identity))throw Error('El catálogo circular repite una selección ambigua.')
      // The ordinal and rounded coordinates are display labels only. The
      // opaque value retains exact edge/body/producer/endpoint identity.
      keys.add(identity);result.push({key:identity,reference,label:body.component.occurrencePath.join(' / ')+' · Arco '+((body.edges??[]).indexOf(edge)+1)+' · Origen ('+vertex[0].point.map(v=>Number(v.toPrecision(6))).join(', ')+') mm'})
    }
  }
  return result
}

/** Selection syntax only; the worker independently rechecks this exact catalog. */
export function assemblyDocumentUpdateChoices(review: AssemblyDocumentUpdateReview,
  endpoint: AssemblyDocumentUpdateReview['endpoints'][number]): { key: string; label: string; reference: AssemblyMateEndpointReference }[] {
  const prefix = endpoint.boundary.occurrencePath, original = endpoint.endpoint
  const pathKind=assemblyDocumentUpdateEndpointPathKind(review.document,endpoint.locator)
  const result: { key: string; label: string; reference: AssemblyMateEndpointReference }[] = []
  const add = (reference: AssemblyMateEndpointReference, label: string): void => {
    if ((endpoint.locator.side === 'angle-0' || endpoint.locator.side === 'angle-1')
      && (!('kind' in reference) || reference.kind !== 'face' || reference.support !== 'plane')) return
    if (purpose(reference,pathKind) !== purpose(original,pathKind)) return
    reference = structuredClone(reference)
    const component = owner(reference)
    if (!component) return
    component.occurrencePath = [...prefix, ...component.occurrencePath]
    result.push({ key: assemblyDocumentUpdateReferenceKey(reference,pathKind), label, reference })
  }
  if (isAssemblyPathEndpoint(original)) {
    for (const choice of pathKind==='circular-path'?assemblyCircularPathCatalogChoices(review.replacementCatalog):assemblyLinePathCatalogChoices(review.replacementCatalog)) add(choice.reference, choice.label)
  } else if (isAssemblyProfileCenterEndpoint(original)) {
    for (const choice of assemblyProfileCenterCatalogChoices(review.replacementCatalog, original.axis !== null)) add(choice.reference, choice.label)
  } else if ('occurrencePath' in original || original.kind === 'principal-plane') {
    for (const component of review.components) {
      const reference = { occurrencePath: [...component.path], definition: { ...component.definition } }
      const label = (component.path.join(' / ') || 'Marco del subensamblaje') + ' · ' + component.name
      if ('occurrencePath' in original) add(reference, label)
      else for (const plane of ['XY', 'XZ', 'YZ'] as const) add({ kind: 'principal-plane', component: reference, plane }, label + ' · ' + plane)
    }
  } else for (const body of review.replacementCatalog.bodies) {
    const label = (body.component.occurrencePath.join(' / ') || body.name) + ' · ' + (body.body?.bodyId ?? 'agregado')
    if (original.kind === 'vertex') for (const vertex of body.vertexPoints ?? []) {
      add({ kind: 'vertex', ...structuredClone(vertex.selection), support: 'point' }, label + ' · Vértice (' + vertex.point.join(', ') + ')')
    }
    else if (original.kind === 'edge') for (const edge of body.edges ?? []) {
      const reference = assemblySceneEdgeReference(edge)
      if (reference) add(reference, label + ' · Arista ' + reference.edge.key)
    }
    else for (const face of body.faces) {
      const reference = original.support === 'sphere-surface' ? assemblySceneSphereSurfaceReference(face)
        : original.support === 'cylinder-surface' ? assemblySceneCylinderSurfaceReference(face) : assemblySceneFaceReference(face)
      if (reference) add(reference, label + ' · Cara ' + reference.face.key)
    }
  }
  return result
}
