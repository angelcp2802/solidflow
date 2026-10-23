import { assemblyDefinitionKey, validateAssemblyDocument, MAX_ASSEMBLY_MATES, type AssemblyDocument, type AssemblyComponentReference,
  type AssemblyDefinitionReference, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { prepareAssemblyPartReplacement, type AssemblyPartReplacementRequest, type AssemblyPartReplacementPlan } from '../model/assemblyReplacement'
import { repairAssemblyEndpoint, type AssemblyMateEndpointLocator } from '../model/assemblySourceUpdates'
import { assemblyMateEndpoint, isAssemblyMateEndpointSide, isAssemblyProfileCenterEndpoint, isAssemblyPathEndpoint, assemblyMateEndpointComponent, type AssemblyMateEndpointReference } from '../model/assemblyMateEndpoints'
import { assemblyDocumentUpdateReferenceKey, assemblyDocumentUpdateEndpointPathKind } from './kernel.assembly-document-update-types'
import { identityRigidPose } from '../model/rigidPose'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'
import { assemblySceneFaceReference, assemblySceneCylinderSurfaceReference, assemblySceneSphereSurfaceReference,
  assemblySceneEdgeReference, type AssemblyScene } from './kernel.assembly-types'

export type AssemblyReplacementReference = AssemblyMateEndpointReference
export interface AssemblyReplacementMateLocator { scope: AssemblyDefinitionReference; mateId: string }
export interface AssemblyReplacementDecisions {
  repairs: { locator: AssemblyMateEndpointLocator; reference: AssemblyReplacementReference }[]
  removed: AssemblyReplacementMateLocator[]
  recapture: AssemblyReplacementMateLocator[]
}
export interface AssemblyReplacementMechanicalMate extends AssemblyReplacementMateLocator {
  type: 'gear' | 'screw' | 'rack-pinion'
  requiresRecapture: boolean
}
export interface AssemblyReplacementReview {
  kind: 'assembly-replacement-review'
  reviewId: string
  document: AssemblyDocument
  scene: AssemblyScene
  source: AssemblyDefinitionReference
  replacement: AssemblyDefinitionReference
  occurrences: AssemblyPartReplacementPlan['occurrences']
  expandedPaths: string[][]
  scopeMap: AssemblyPartReplacementPlan['scopeMap']
  endpoints: (AssemblyPartReplacementPlan['endpoints'][number] & { status: 'retained-frame' | 'needs-repair'; message: string })[]
  /** Real native source-local catalog; not an invented placed assembly scene. */
  replacementCatalog: AssemblyScene
  mechanicalMates: AssemblyReplacementMechanicalMate[]
}
export interface PreparedAssemblyReplacement {
  baseline: AssemblyDocument
  proposal: AssemblyDocument
  recapture: { locator: AssemblyReplacementMateLocator; mate: Extract<AssemblyMate, { type: 'gear' | 'screw' | 'rack-pinion' }> }[]
}
const key = assemblyDefinitionKey
const locatorKey = (value: AssemblyReplacementMateLocator) => JSON.stringify([key(value.scope), value.mateId])
const endpointKey = (value: AssemblyMateEndpointLocator) => JSON.stringify([key(value.scope), value.mateId, value.side])
export function replacementScope(document: AssemblyDocument, scope: AssemblyDefinitionReference): AssemblyDocument | EmbeddedAssemblyDefinition {
  const result = [document, ...document.definitions].find(value => key(value) === key(scope))
  if (!result || result.kind !== 'assembly') throw new Error('El ámbito de sustitución ya no existe.')
  return result
}
function component(reference: AssemblyReplacementReference): AssemblyComponentReference | null {
  return assemblyMateEndpointComponent(reference)
}
function family(reference: AssemblyReplacementReference, pathKind: 'line-path'|'circular-path'|null): string {
  if (isAssemblyProfileCenterEndpoint(reference)) return reference.axis === null ? 'profile-circle' : 'profile-rectangle'
  if (isAssemblyPathEndpoint(reference)) {if(!pathKind)throw Error('Compound repair requires its saved path purpose.');return pathKind}
  return 'occurrencePath' in reference ? 'component' : reference.kind === 'principal-plane' ? 'plane' : reference.support
}
function referenceKey(reference: AssemblyReplacementReference): string {
  if (isAssemblyProfileCenterEndpoint(reference) || isAssemblyPathEndpoint(reference)) return assemblyDocumentUpdateReferenceKey(reference)
  const owner = component(reference), identity = owner && [owner.occurrencePath, owner.definition.id, owner.definition.revision]
  if (!('kind' in reference)) return JSON.stringify(['component', identity])
  if (reference.kind === 'principal-plane') return JSON.stringify([reference.kind, identity, reference.plane])
  const native = reference.kind === 'vertex' ? reference.vertex : reference.kind === 'face' ? reference.face : reference.edge
  return JSON.stringify([reference.kind, identity, reference.body && [reference.body.bodyId, reference.body.sourceFeatureId], native.sourceFeatureId, native.key, reference.support])
}
function data(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('La sustitución necesita datos declarados.')
  const result: Record<string, unknown> = Object.create(null)
  for (const field of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field)!
    if (typeof field !== 'string' || !fields.includes(field) || !descriptor.enumerable || !('value' in descriptor)) throw new Error('La sustitución no admite campos desconocidos ni accesores.')
    result[field] = descriptor.value
  }
  if (fields.some(field => !Object.hasOwn(result, field))) throw new Error('Faltan decisiones de sustitución.')
  return result
}
function list(input: unknown, limit = MAX_ASSEMBLY_MATES): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > limit) throw new Error('La lista de decisiones excede el límite o no es una lista de datos.')
  const keys = Reflect.ownKeys(input)
  if (keys.length !== input.length + 1) throw new Error('La lista de decisiones debe ser densa y sin campos adicionales.')
  return Array.from({ length: input.length }, (_, index) => {
    const item = Object.getOwnPropertyDescriptor(input, String(index))
    if (!item?.enumerable || !('value' in item)) throw new Error('La lista de decisiones no admite accesores ni huecos.')
    return item.value
  })
}
function identifier(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 128 || /[\x00-\x1f\x7f]/.test(input)) throw new Error('Identificador de decisión no válido.')
  return input
}
function mateLocator(input: unknown): AssemblyReplacementMateLocator {
  const source = data(input, ['scope', 'mateId']), scope = data(source.scope, ['id', 'revision'])
  return { scope: { id: identifier(scope.id), revision: identifier(scope.revision) }, mateId: identifier(source.mateId) }
}
function endpointLocator(input: unknown): AssemblyMateEndpointLocator {
  const source = data(input, ['scope', 'mateId', 'side'])
  const result = mateLocator({ scope: source.scope, mateId: source.mateId })
  if (!isAssemblyMateEndpointSide(source.side)) throw new Error('Extremo de sustitución no válido.')
  return { ...result, side: source.side }
}

function replacementCatalogDocument(document: AssemblyDocument, reference: AssemblyDefinitionReference): AssemblyDocument {
  const replacement = document.definitions.find(value => key(value) === key(reference))
  if (!replacement || replacement.kind !== 'part') throw new Error('La pieza sustituta actual ya no existe.')
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: crypto.randomUUID(), revision: 'r1', name: 'Catálogo local de sustitución', units: 'mm',
    createdAt: document.updatedAt, updatedAt: document.updatedAt, definitions: [replacement], mates: [], occurrences: [{ id: 'catalog-part', name: 'Pieza sustituta',
      definition: reference, pose: identityRigidPose(), fixed: true, visible: true, suppressed: false }] })
}

/** Complete source and occurrence plan, rebuilt privately before any report is returned. */
export function reviewAssemblyReplacement(current: AssemblyDocument, request: AssemblyPartReplacementRequest): { plan: AssemblyPartReplacementPlan; review: AssemblyReplacementReview } {
  const plan = prepareAssemblyPartReplacement(current, request), scene = buildAssemblyScene(plan.document)
  const catalog = replacementCatalogDocument(plan.document, plan.replacement)
  const replacementCatalog = buildAssemblyScene(catalog)
  const endpoints = plan.endpoints.map(endpoint => ({ ...structuredClone(endpoint),
    status: endpoint.retainFrame ? 'retained-frame' as const : 'needs-repair' as const,
    message: endpoint.retainFrame ? 'Se conserva la intención del marco local; requiere una resolución nueva.'
      : 'Selecciona una referencia actual de la pieza sustituta; no se deduce correspondencia geométrica.' }))
  const mechanical = new Map<string, AssemblyReplacementMechanicalMate>()
  for (const endpoint of endpoints) {
    const mate = replacementScope(plan.document, endpoint.locator.scope).mates.find(value => value.id === endpoint.locator.mateId)!
    if (mate.type !== 'gear' && mate.type !== 'screw' && mate.type !== 'rack-pinion') continue
    const address = { scope: endpoint.locator.scope, mateId: mate.id }, previous = mechanical.get(locatorKey(address))
    mechanical.set(locatorKey(address), { ...structuredClone(address), type: mate.type,
      // A stale frame has no current zero witness even when its saved ID is
      // unchanged. Repairing that label needs the same explicit fresh capture
      // as replacing the component; current COW frame clones retain theirs.
      requiresRecapture: !!previous?.requiresRecapture || !endpoint.retainFrame
        || component(endpoint.endpoint)?.definition.id !== endpoint.desiredComponent.definition.id })
  }
  return { plan, review: { kind: 'assembly-replacement-review', reviewId: crypto.randomUUID(), document: structuredClone(plan.document), scene,
    source: structuredClone(plan.source), replacement: structuredClone(plan.replacement), occurrences: structuredClone(plan.occurrences),
    expandedPaths: structuredClone(plan.expandedPaths), scopeMap: structuredClone(plan.scopeMap), endpoints, replacementCatalog, mechanicalMates: [...mechanical.values()] } }
}

function compatibleCatalogReference(review: AssemblyReplacementReview, endpoint: AssemblyReplacementReview['endpoints'][number], reference: AssemblyReplacementReference): boolean {
  const pathKind=assemblyDocumentUpdateEndpointPathKind(review.document,endpoint.locator)
  if (JSON.stringify(component(reference)) !== JSON.stringify(endpoint.desiredComponent) || family(reference,pathKind) !== family(endpoint.endpoint,pathKind)) return false
  if ((endpoint.locator.side==='up'||endpoint.locator.side==='angle-0'||endpoint.locator.side==='angle-1')) {
    if (!('kind' in reference)||reference.kind!=='face'||reference.support!=='plane') return false
    const catalog=replacementCatalogDocument(review.document,review.replacement),snapshot=new AssemblyGeometrySnapshot(catalog)
    try {
      const selected={...structuredClone(reference),component:{occurrencePath:['catalog-part'],definition:{...review.replacement}}}
      const witness=snapshot.resolveDirectionReference(catalog,selected)
      if(witness.kind!=='support'||witness.origin!=='native-face'||witness.localSupport.kind!=='plane')throw Error('UP replacement requires current plane face.')
      snapshot.assertMateWitness(witness,catalog)
    }catch(error){try{snapshot.dispose()}catch(cleanup){throw new NativeCleanupError({error},[cleanup],'Replacement UP verification or release failed.')}throw error}
    snapshot.dispose();return true
  }
  if (isAssemblyPathEndpoint(reference)) {
    if (!isAssemblyPathEndpoint(endpoint.endpoint)||!pathKind) return false
    const catalog = replacementCatalogDocument(review.document, review.replacement), snapshot = new AssemblyGeometrySnapshot(catalog)
    try {
      const selected = structuredClone(reference)
      selected.component = { occurrencePath: ['catalog-part'], definition: { ...review.replacement } }
      if(pathKind==='circular-path')snapshot.assertArcPathWitness(snapshot.resolveArcPathSelection(catalog,selected),catalog)
      else snapshot.assertLinePathWitness(snapshot.resolveLinePathSelection(catalog, selected), catalog)
    } catch (error) {
      try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Replacement material-path verification or release failed.') }
      throw error
    }
    snapshot.dispose()
    return true
  }
  if (isAssemblyProfileCenterEndpoint(reference)) {
    if (!isAssemblyProfileCenterEndpoint(endpoint.endpoint)) return false
    const catalog = replacementCatalogDocument(review.document, review.replacement), snapshot = new AssemblyGeometrySnapshot(catalog)
    try {
      const selected = structuredClone(reference)
      selected.face.component = { occurrencePath: ['catalog-part'], definition: { ...review.replacement } }
      if (selected.axis === null) {
        const w = snapshot.resolveProfileFaceSelection(catalog, selected.face)
        snapshot.assertProfileWitness(w, catalog)
        if (w.localSupport.kind !== 'circle') throw Error('La reparación libre requiere un disco circular completo actual.')
      } else {
        const w = snapshot.resolveProfileAxisSelection(catalog, { ...selected.face, ...selected.axis })
        snapshot.assertProfileAxisWitness(w, catalog)
      }
    } catch (error) {
      try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Replacement profile verification or release failed.') }
      throw error
    }
    snapshot.dispose()
    return true
  }
  const originalKind = 'kind' in endpoint.endpoint ? endpoint.endpoint.kind : 'component'
  if (originalKind !== ('kind' in reference ? reference.kind : 'component')) return false
  if (!('kind' in reference) || reference.kind === 'principal-plane') return true
  if (reference.kind === 'vertex') {
    // Scene triangle vertices confer no topology/point authority. Rebuild the
    // exact replacement privately and query the current native vertex instead.
    const catalog = replacementCatalogDocument(review.document, review.replacement)
    const snapshot = new AssemblyGeometrySnapshot(catalog)
    try {
      const current = { ...structuredClone(reference), component: { occurrencePath: ['catalog-part'], definition: { ...review.replacement } } }
      const witness = snapshot.resolveVertexReference(catalog, current)
      snapshot.assertPointWitness(witness, catalog)
    } catch (error) {
      try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Replacement vertex verification or release failed.') }
      throw error
    }
    snapshot.dispose()
    return true
  }
  const candidates: AssemblyReplacementReference[] = []
  for (const body of review.replacementCatalog.bodies) {
    if (reference.kind === 'edge') {
      for (const edge of body.edges ?? []) { const value = assemblySceneEdgeReference(edge); if (value) candidates.push(value) }
    } else for (const face of body.faces) {
      const value = reference.support === 'sphere-surface' ? assemblySceneSphereSurfaceReference(face)
        : reference.support === 'cylinder-surface' ? assemblySceneCylinderSurfaceReference(face) : assemblySceneFaceReference(face)
      if (value) candidates.push(value)
    }
  }
  return candidates.some(value => {
    if (isAssemblyProfileCenterEndpoint(value) || isAssemblyPathEndpoint(value) || 'occurrencePath' in value) return false
    value.component = structuredClone(endpoint.desiredComponent)
    return referenceKey(value) === referenceKey(reference)
  })
}

/** Decisions address only the worker-owned inventory; arbitrary candidates never cross this boundary. */
export function prepareAssemblyReplacementDecisions(plan: AssemblyPartReplacementPlan, review: AssemblyReplacementReview, input: AssemblyReplacementDecisions): PreparedAssemblyReplacement {
  const fields = data(input, ['repairs', 'removed', 'recapture'])
  const removed = list(fields.removed).map(mateLocator), recapture = list(fields.recapture).map(mateLocator)
  const affected = new Set(plan.endpoints.map(value => locatorKey(value.locator)))
  const removedKeys = new Set(removed.map(locatorKey)), recaptureKeys = new Set(recapture.map(locatorKey))
  if (removedKeys.size !== removed.length || recaptureKeys.size !== recapture.length || [...removedKeys].some(value => recaptureKeys.has(value))) throw new Error('Una relación no puede repetirse ni eliminarse y recapturarse a la vez.')
  if ([...removedKeys, ...recaptureKeys].some(value => !affected.has(value))) throw new Error('La decisión no identifica una relación afectada.')
  const mechanics = new Map(review.mechanicalMates.map(value => [locatorKey(value), value]))
  if ([...recaptureKeys].some(value => !mechanics.has(value))) throw new Error('Solo se recapturan relaciones mecánicas afectadas.')
  for (const [address, mate] of mechanics) if (mate.requiresRecapture && !removedKeys.has(address) && !recaptureKeys.has(address)) throw new Error('El cambio de componente mecánico necesita recaptura explícita o eliminación.')
  let proposal = validateAssemblyDocument(plan.document)
  const repaired = new Set<string>()
  // The review is worker-owned and built from the validated declaration graph.
  // Each pending endpoint admits at most one repair, regardless of mate arity.
  const repairLimit = review.endpoints.filter(value => value.status === 'needs-repair').length
  for (const raw of list(fields.repairs, repairLimit)) {
    const item = data(raw, ['locator', 'reference']), locator = endpointLocator(item.locator), address = endpointKey(locator)
    const endpoint = review.endpoints.find(value => endpointKey(value.locator) === address)
    if (!endpoint || endpoint.status !== 'needs-repair' || removedKeys.has(locatorKey(locator)) || repaired.has(address)) throw new Error('La reparación no identifica un extremo pendiente único.')
    // The model boundary rejects getters/prototypes/unknown nested fields before
    // comparisons below can observe caller data or invoke serialization hooks.
    const validated = repairAssemblyEndpoint(proposal, locator, item.reference as AssemblyReplacementReference)
    const mate = replacementScope(validated, locator.scope).mates.find(value => value.id === locator.mateId)!
    const reference = assemblyMateEndpoint(mate, locator.side)?.reference
    if (!reference || !compatibleCatalogReference(review, endpoint, reference)) throw new Error('La reparación no pertenece al catálogo actual y componente exacto de la sustitución.')
    proposal = validated; repaired.add(address)
  }
  for (const endpoint of review.endpoints) if (endpoint.status === 'needs-repair' && !removedKeys.has(locatorKey(endpoint.locator)) && !repaired.has(endpointKey(endpoint.locator))) throw new Error('Hay referencias pendientes; repáralas o elimina expresamente su relación.')
  const captured: PreparedAssemblyReplacement['recapture'] = []
  for (const locator of recapture) {
    const mate = replacementScope(proposal, locator.scope).mates.find(value => value.id === locator.mateId)!
    if (mate.type !== 'gear' && mate.type !== 'screw' && mate.type !== 'rack-pinion') throw new Error('La relación ya no admite recaptura mecánica.')
    captured.push({ locator, mate: structuredClone(mate) })
  }
  const baseline = validateAssemblyDocument(plan.baseline)
  // Filter explicit recaptures in BOTH private comparison documents. All other
  // copied declarations still pass the unchanged public proposal/chart guards.
  for (const locator of [...removed, ...recapture]) {
    const target = replacementScope(proposal, locator.scope); target.mates = target.mates.filter(value => value.id !== locator.mateId)
    const before = replacementScope(baseline, locator.scope); before.mates = before.mates.filter(value => value.id !== locator.mateId)
  }
  return { baseline: validateAssemblyDocument(baseline), proposal: validateAssemblyDocument(proposal), recapture: captured }
}
