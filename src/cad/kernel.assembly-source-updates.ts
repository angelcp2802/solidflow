import { assemblyDefinitionKey, validateAssemblyDocument,
  type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyFaceReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference,
  type EmbeddedPartDefinition, type AssemblySourceLink } from '../model/assemblyDocument'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint, assemblySourceScopePaths,
  type AssemblyMateEndpointLocator, type AssemblySourceUpdatePlan } from '../model/assemblySourceUpdates'
import { assemblyMateEndpoint, assemblyMateEndpointComponent, isAssemblyProfileCenterEndpoint, isAssemblyPathEndpoint, withAssemblyMateEndpointComponent, type AssemblyMateEndpointReference } from '../model/assemblyMateEndpoints'
import type { Document } from '../model/document'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { entityPrismContextFromFeatures } from './kernel.semantic-context'
import { isFaceReferenceKeyV2 } from './kernel.semantic-references'
import type { AssemblyScene, AssemblySceneFace } from './kernel.assembly-types'
import type { BodyReference } from './kernel.types'
import { assemblyRackPinionAxisPoint, canonicalAssemblyRackDirection } from '../model/assemblyRackPinion'

type SurfaceFace = AssemblyFaceReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference
type Endpoint = AssemblyMateEndpointReference
export interface AssemblySourceEndpointReview {
  locator: AssemblyMateEndpointLocator
  /** Original saved declaration, including stale geometry; never the replacement. */
  endpoint: Endpoint
  status: 'retained-component' | 'retained-semantic' | 'needs-repair'
  message: string
}
export interface AssemblySourceUpdateReview {
  kind: 'assembly-source-review'
  /** Present only when an exact detached plan is retained by a worker session. */
  reviewId?: string
  /** Detached proposal only. A fresh worker preview must authenticate Apply. */
  document: AssemblyDocument
  scene: AssemblyScene
  source: AssemblyDefinitionReference
  replacement: AssemblyDefinitionReference
  occurrences: AssemblySourceUpdatePlan['occurrences']
  endpoints: AssemblySourceEndpointReview[]
}

const sameDefinition = (a: AssemblyDefinitionReference, b: AssemblyDefinitionReference): boolean =>
  assemblyDefinitionKey(a) === assemblyDefinitionKey(b)
const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index])
const sameBody = (a: BodyReference | null, b: BodyReference | null): boolean =>
  a === null ? b === null : b !== null && a.bodyId === b.bodyId && a.sourceFeatureId === b.sourceFeatureId
const isFace = (endpoint: Endpoint): endpoint is SurfaceFace => 'kind' in endpoint && endpoint.kind === 'face'
const bodyKey = (path: readonly string[], definition: AssemblyDefinitionReference, body: BodyReference | null): string =>
  JSON.stringify([path, definition.id, definition.revision, body ? [body.bodyId, body.sourceFeatureId] : null])
const faceKey = (face: AssemblyFaceReference['face']): string => JSON.stringify([face.sourceFeatureId, face.key])
type SceneCatalog = Map<string, Map<string, AssemblySceneFace | null> | null>
function sceneCatalog(scene: AssemblyScene): SceneCatalog {
  const catalog: SceneCatalog = new Map()
  for (const body of scene.bodies) {
    const identity = bodyKey(body.component.occurrencePath, body.component.definition, body.body)
    if (catalog.has(identity)) { catalog.set(identity, null); continue }
    const faces = new Map<string, AssemblySceneFace | null>()
    for (const face of body.faces) {
      if (!samePath(face.selection.component.occurrencePath, body.component.occurrencePath)
        || !sameDefinition(face.selection.component.definition, body.component.definition) || !sameBody(face.selection.body, body.body)) continue
      const key = faceKey(face.selection.face)
      faces.set(key, faces.has(key) ? null : face)
    }
    catalog.set(identity, faces)
  }
  return catalog
}
function partDefinition(document: AssemblyDocument, reference: AssemblyDefinitionReference): EmbeddedPartDefinition {
  const definition = document.definitions.find(value => sameDefinition(value, reference))
  if (!definition || definition.kind !== 'part') throw new Error('El origen actualizado no identifica una pieza incorporada actual.')
  return definition
}

/**
 * This is an extra discrete-origin check, not a native correspondence factory.
 * Only primary v2 keys emitted by BOTH real native scene builds can pass below.
 * Those keys include the checked structural lineage digest and topological role;
 * neither a prefix nor this syntax/context comparison alone proves continuity.
 */
function sameSemanticOrigin(oldPart: EmbeddedPartDefinition, newPart: EmbeddedPartDefinition,
  endpoint: SurfaceFace): boolean {
  if (!isFaceReferenceKeyV2(endpoint.face.key)) return false
  const origin = (part: EmbeddedPartDefinition) => {
    const features = part.document.features, context = entityPrismContextFromFeatures(features, endpoint.face.sourceFeatureId)
    const sketch = context && features.find(feature => feature.id === context.sketchFeatureId)
    return context && sketch?.type === 'sketch' && !sketch.suppressed && sketch.profile.kind === 'entities' ? context : undefined
  }
  const before = origin(oldPart), after = origin(newPart)
  return before !== undefined && after !== undefined && JSON.stringify(before) === JSON.stringify(after)
}
function currentFace(catalog: SceneCatalog, path: readonly string[], definition: AssemblyDefinitionReference,
  endpoint: SurfaceFace): AssemblySceneFace | null {
  const face = catalog.get(bodyKey(path, definition, endpoint.body))?.get(faceKey(endpoint.face))
  if (!face || !isFaceReferenceKeyV2(face.selection.face.key)) return null
  if (endpoint.support === 'sphere-surface') return face.sphereSurface?.kind === 'sphere-surface' ? face : null
  return face.support?.kind === (endpoint.support === 'plane' ? 'plane' : 'cylinder') ? face : null
}
function retainedSemantic(document: AssemblyDocument, before: SceneCatalog, after: SceneCatalog,
  plan: AssemblySourceUpdatePlan, locator: AssemblyMateEndpointLocator, endpoint: SurfaceFace,
  scopes: Map<string, string[][]>): boolean {
  if (!sameSemanticOrigin(partDefinition(document, plan.source), partDefinition(plan.document, plan.replacement), endpoint)) return false
  const declaring = [document, ...document.definitions].find(value => sameDefinition(value, locator.scope))
  const angularType = declaring?.kind === 'assembly' ? declaring.mates.find(value => value.id === locator.mateId)?.type : undefined
  const angular = angularType === 'gear' || angularType === 'screw' || angularType === 'rack-pinion'
  const key = assemblyDefinitionKey(locator.scope)
  let prefixes = scopes.get(key)
  if (!prefixes) { prefixes = assemblySourceScopePaths(document, locator.scope); scopes.set(key, prefixes) }
  // An uninstantiated scope has no native catalog. Suppressed expansions must
  // agree too: their missing native geometry deliberately prevents automapping.
  return prefixes.length > 0 && prefixes.every(prefix => {
    const path = [...prefix, ...endpoint.component.occurrencePath]
    const oldFace = currentFace(before, path, plan.source, endpoint), newFace = currentFace(after, path, plan.replacement, endpoint)
    if (!oldFace || !newFace) return false
    // A saved gear/screw spin chart uses the native directed cylinder axis in its
    // component frame. Semantic role alone cannot attest axis continuity.
    if (angular) {
      if (oldFace.support?.kind !== 'cylinder' || newFace.support?.kind !== 'cylinder') return false
      const oldAxis = oldFace.support.axis, newAxis = newFace.support.axis
      const oldDirection = angularType === 'rack-pinion' && locator.side === 'second' ? canonicalAssemblyRackDirection(oldAxis) : oldAxis
      const newDirection = angularType === 'rack-pinion' && locator.side === 'second' ? canonicalAssemblyRackDirection(newAxis) : newAxis
      const difference = Math.hypot(...oldDirection.map((value, index) => value - newDirection[index]))
      if (!Number.isFinite(difference) || difference > 1e-8) return false
      if (angularType === 'rack-pinion' && locator.side === 'first') {
        const oldPoint = assemblyRackPinionAxisPoint(oldFace.support.point, oldAxis), newPoint = assemblyRackPinionAxisPoint(newFace.support.point, newAxis)
        if (Math.hypot(...oldPoint.map((value, index) => value - newPoint[index])) > 1e-6) return false
      }
    }
    return true
  })
}
function rebound(endpoint: Endpoint, replacement: AssemblyDefinitionReference): Endpoint {
  if (isAssemblyProfileCenterEndpoint(endpoint)) return withAssemblyMateEndpointComponent(endpoint, { ...endpoint.face.component, definition: { ...replacement } })
  const result = structuredClone(endpoint)
  if ('occurrencePath' in result) result.definition = { ...replacement }
  else if (result.component) result.component.definition = { ...replacement }
  else throw new Error('Un plano del ámbito no puede ser una referencia a la pieza actualizada.')
  return result
}

/**
 * Rebuild old and proposed BReps, then retain only demonstrated declarations.
 * The scene builder owns/releases every native engine and placement before it
 * returns; any query or cleanup failure aborts the whole review without a DTO.
 * No v1 alias, ordinal, geometry signature, name or nearest face is consulted.
 * Component/principal retention attests saved identity only (even when dormant
 * or suppressed), not a native witness, mate satisfaction or solved placement.
 */
export function reviewAssemblyPartSourceUpdate(current: AssemblyDocument, source: AssemblyDefinitionReference,
  part: Document, revision: string, sourceLink?: AssemblySourceLink): AssemblySourceUpdateReview {
  const original = validateAssemblyDocument(current), plan = prepareAssemblyPartUpdate(original, source, part, revision, sourceLink)
  const before = buildAssemblyScene(original), scene = buildAssemblyScene(plan.document)
  const oldCatalog = sceneCatalog(before), newCatalog = sceneCatalog(scene), scopes = new Map<string, string[][]>()
  let document = plan.document
  const endpoints = plan.endpoints.map(({ locator, endpoint }): AssemblySourceEndpointReview => {
    const face = isFace(endpoint), manualTopology = 'kind' in endpoint && (endpoint.kind === 'edge' || endpoint.kind === 'vertex')
    // Edge and vertex references need exact current manual repair until dual-native
    // continuity is established. Mesh points and stable-looking keys are not authority.
    const retained = !isAssemblyProfileCenterEndpoint(endpoint) && !isAssemblyPathEndpoint(endpoint) && locator.side!=='up' && locator.side!=='angle-0' && locator.side!=='angle-1' && !manualTopology && (!face || retainedSemantic(original, oldCatalog, newCatalog, plan, locator, endpoint, scopes))
    const status = retained ? face ? 'retained-semantic' : 'retained-component' : 'needs-repair'
    if (retained) document = repairAssemblyEndpoint(document, locator, rebound(endpoint, plan.replacement))
    return { locator: structuredClone(locator), endpoint: structuredClone(endpoint), status,
      message: status === 'retained-component' ? 'Identidad declarada conservada; aún requiere una vista previa verificada, sin afirmar geometría nativa.'
        : status === 'retained-semantic' ? 'Misma referencia semántica y soporte verificados en ambos catálogos nativos y en todas las ocurrencias.'
          : 'No se demostró continuidad semántica nativa en todas las ocurrencias. Selecciona una referencia actual; se conserva la declaración anterior.' }
  })
  // Mapping edits only mate endpoint metadata; the already built scene has the
  // same source content, occurrences, poses and geometry as this final proposal.
  return { kind: 'assembly-source-review', document: validateAssemblyDocument(document), scene,
    source: { ...plan.source }, replacement: { ...plan.replacement }, occurrences: structuredClone(plan.occurrences), endpoints }
}

/** Reconstruct only named repairs on the privately retained source proposal.
 * A returned DTO cannot change the source cache, accepted digest, occurrence
 * placement, other mate fields or retained endpoints before native verification. */
export function prepareAssemblyPartSourceProposal(review: AssemblySourceUpdateReview, input: AssemblyDocument): AssemblyDocument {
  const candidate = validateAssemblyDocument(input)
  let proposal = validateAssemblyDocument(review.document)
  const scope = (document: AssemblyDocument, reference: AssemblyDefinitionReference) => {
    const node = [document, ...document.definitions].find(value => sameDefinition(value, reference))
    if (!node || node.kind !== 'assembly') throw Error('El ámbito de la revisión de pieza ya no está disponible.')
    return node
  }
  for (const item of review.endpoints) {
    if (item.status !== 'needs-repair') continue
    const original = item.endpoint, node = scope(candidate, item.locator.scope)
    const mate = node.mates.find(value => value.id === item.locator.mateId)
    const reference = mate && assemblyMateEndpoint(mate, item.locator.side)?.reference
    const oldOwner = assemblyMateEndpointComponent(original), owner = reference && assemblyMateEndpointComponent(reference)
    if (!reference || !oldOwner || !owner || !sameDefinition(owner.definition, review.replacement)
      || !samePath(owner.occurrencePath, oldOwner.occurrencePath)) throw Error('Quedan referencias de la pieza pendientes de reparación.')
    proposal = repairAssemblyEndpoint(proposal, item.locator, reference)
  }
  // Editing timestamps carry no source or geometry authority. Keep the private
  // plan's timestamps in the actual proposal; normalize only this comparison.
  proposal.updatedAt = review.document.updatedAt
  const comparable = validateAssemblyDocument(proposal)
  comparable.updatedAt = candidate.updatedAt
  for (const definition of comparable.definitions) if (definition.kind === 'assembly') {
    const incoming = candidate.definitions.find(value => sameDefinition(value, definition))
    if (incoming?.kind === 'assembly') definition.updatedAt = incoming.updatedAt
  }
  if (JSON.stringify(comparable) !== JSON.stringify(candidate)) throw Error('La propuesta no corresponde a la revisión privada de la pieza.')
  return validateAssemblyDocument(proposal)
}
