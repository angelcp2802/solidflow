import { assemblyDefinitionKey, serializeAssemblyDocument, validateAssemblyDocument, MAX_ASSEMBLY_MATES,
  type AssemblyDefinitionReference, type AssemblyDocument, type AssemblyMate, type AssemblySourceLink } from '../model/assemblyDocument'
import { prepareAssemblyDocumentUpdate, type AssemblyDocumentUpdatePlan } from '../model/assemblySubassemblyUpdates'
import { assemblyMateEndpoint, assemblyMatePathKind, isAssemblyMateEndpointSide, isAssemblyProfileCenterEndpoint, isAssemblyPathEndpoint, type AssemblyMateEndpointReference } from '../model/assemblyMateEndpoints'
import { repairAssemblyEndpoint, type AssemblyMateEndpointLocator } from '../model/assemblySourceUpdates'
import { replacementScope, type AssemblyReplacementMateLocator } from './kernel.assembly-replacement'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { NativeCleanupError } from './kernel.native-ownership'
import { assemblyDocumentUpdateChoices, assemblyDocumentUpdateMateKey, assemblyDocumentUpdateEndpointKey, assemblyDocumentUpdateReferenceKey,
  type AssemblyDocumentUpdateReview, type AssemblyDocumentUpdateDecisions } from './kernel.assembly-document-update-types'
export type { AssemblyDocumentUpdateReview, AssemblyDocumentUpdateDecisions } from './kernel.assembly-document-update-types'

export interface PreparedAssemblyDocumentUpdate {
  baseline: AssemblyDocument
  proposal: AssemblyDocument
  recapture: { locator: AssemblyReplacementMateLocator;
    mate: Extract<AssemblyMate, { type: 'concentric' | 'lock' | 'gear' | 'screw' | 'rack-pinion' }> }[]
}
const key = assemblyDefinitionKey
/** Authored paths are enumerated separately from geometry, including assembly frames. */
function catalogComponents(document: AssemblyDocument): AssemblyDocumentUpdateReview['components'] {
  const definitions = new Map([document, ...document.definitions].map(value => [key(value), value]))
  const result: AssemblyDocumentUpdateReview['components'] = []
  function walk(definition: (typeof document.definitions)[number] | AssemblyDocument, path: string[]): void {
    result.push({ path, definition: { id: definition.id, revision: definition.revision }, kind: definition.kind,
      name: definition.kind === 'part' ? definition.document.name : definition.name })
    if (definition.kind === 'assembly') for (const occurrence of definition.occurrences) {
      const child = definitions.get(key(occurrence.definition))
      if (!child) throw new Error('Una dependencia del catálogo ya no existe.')
      walk(child, [...path, occurrence.id])
    }
  }
  walk(document, [])
  return result
}
function catalogDocument(incoming: AssemblyDocument): AssemblyDocument {
  const document = validateAssemblyDocument(incoming)
  for (const node of [document, ...document.definitions]) if (node.kind === 'assembly') for (const occurrence of node.occurrences) {
    occurrence.suppressed = false
    occurrence.visible = true
  }
  return validateAssemblyDocument(document)
}
/** No automatic correspondence: every crossed-boundary role is reviewed explicitly. */
export function reviewAssemblyDocumentSourceUpdate(current: AssemblyDocument, source: AssemblyDefinitionReference,
  incoming: AssemblyDocument, sourceLink?: AssemblySourceLink): { plan: AssemblyDocumentUpdatePlan; catalog: AssemblyDocument; review: AssemblyDocumentUpdateReview } {
  const plan = prepareAssemblyDocumentUpdate(current, source, incoming, sourceLink), catalog = catalogDocument(incoming)
  const replacementCatalog = buildAssemblyScene(catalog), scene = buildAssemblyScene(plan.document)
  return { plan, catalog, review: { kind: 'assembly-document-source-review', reviewId: crypto.randomUUID(),
    document: structuredClone(plan.document), scene, source: structuredClone(plan.source), replacement: structuredClone(plan.replacement),
    occurrences: structuredClone(plan.occurrences), endpoints: structuredClone(plan.endpoints),
    unresolvedEndpoints: structuredClone(plan.unresolvedEndpoints), capturedMates: structuredClone(plan.capturedMates),
    replacementCatalog, components: catalogComponents(catalog) } }
}

function data(input: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('La actualización necesita decisiones de datos.')
  const result: Record<string, unknown> = Object.create(null)
  for (const field of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field)!
    if (typeof field !== 'string' || !fields.includes(field) || !descriptor.enumerable || !('value' in descriptor)) throw new Error('La actualización no admite campos desconocidos ni accesores.')
    result[field] = descriptor.value
  }
  if (fields.some(field => !Object.hasOwn(result, field))) throw new Error('Faltan decisiones de actualización.')
  return result
}
function list(input: unknown, limit: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > limit
    || Reflect.ownKeys(input).length !== input.length + 1) throw new Error('La lista de decisiones debe ser densa, acotada y sin campos adicionales.')
  return Array.from({ length: input.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('La lista de decisiones no admite accesores ni huecos.')
    return descriptor.value
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
  const source = data(input, ['scope', 'mateId', 'side']), mate = mateLocator({ scope: source.scope, mateId: source.mateId })
  if (!isAssemblyMateEndpointSide(source.side)) throw new Error('Extremo de actualización no válido.')
  return { ...mate, side: source.side }
}
function authenticateVertex(catalog: AssemblyDocument, endpoint: AssemblyDocumentUpdateReview['endpoints'][number], reference: AssemblyMateEndpointReference, pathKind:'line-path'|'circular-path'|null): void {
  if((endpoint.locator.side==='up'||endpoint.locator.side==='angle-0'||endpoint.locator.side==='angle-1')){
    if(!('kind' in reference)||reference.kind!=='face'||reference.support!=='plane')throw Error('UP repair needs an actual plane face.')
    const selected=structuredClone(reference);selected.component.occurrencePath=selected.component.occurrencePath.slice(endpoint.boundary.occurrencePath.length)
    const snapshot=new AssemblyGeometrySnapshot(catalog)
    try{const witness=snapshot.resolveDirectionReference(catalog,selected);if(witness.kind!=='support'||witness.origin!=='native-face'||witness.localSupport.kind!=='plane')throw Error('UP repair needs current plane support.');snapshot.assertMateWitness(witness,catalog)}
    catch(error){try{snapshot.dispose()}catch(cleanup){throw new NativeCleanupError({error},[cleanup],'Updated assembly UP verification or release failed.')}throw error}
    snapshot.dispose();return
  }
  if (isAssemblyPathEndpoint(reference)) {
    if(!pathKind)throw Error('Updated material path requires its saved family purpose.')
    const selected = structuredClone(reference)
    selected.component.occurrencePath = selected.component.occurrencePath.slice(endpoint.boundary.occurrencePath.length)
    const snapshot = new AssemblyGeometrySnapshot(catalog)
    try { if(pathKind==='circular-path')snapshot.assertArcPathWitness(snapshot.resolveArcPathSelection(catalog,selected),catalog)
      else snapshot.assertLinePathWitness(snapshot.resolveLinePathSelection(catalog, selected), catalog) }
    catch (error) {
      try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Updated assembly material-path verification or release failed.') }
      throw error
    }
    snapshot.dispose()
    return
  }
  if (isAssemblyProfileCenterEndpoint(reference)) {
    const selected = structuredClone(reference)
    selected.face.component.occurrencePath = selected.face.component.occurrencePath.slice(endpoint.boundary.occurrencePath.length)
    const snapshot = new AssemblyGeometrySnapshot(catalog)
    try {
      if (selected.axis === null) {
        const w = snapshot.resolveProfileFaceSelection(catalog, selected.face)
        snapshot.assertProfileWitness(w, catalog)
        if (w.localSupport.kind !== 'circle') throw Error('La reparación libre requiere un disco circular completo actual.')
      } else {
        const w = snapshot.resolveProfileAxisSelection(catalog, { ...selected.face, ...selected.axis })
        snapshot.assertProfileAxisWitness(w, catalog)
      }
    } catch (error) {
      try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Updated assembly profile verification or release failed.') }
      throw error
    }
    snapshot.dispose()
    return
  }
  if (!('kind' in reference) || reference.kind !== 'vertex') return
  const local = structuredClone(reference)
  local.component.occurrencePath = local.component.occurrencePath.slice(endpoint.boundary.occurrencePath.length)
  const snapshot = new AssemblyGeometrySnapshot(catalog)
  try { snapshot.assertPointWitness(snapshot.resolveVertexReference(catalog, local), catalog) }
  catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Updated assembly vertex verification or release failed.') }
    throw error
  }
  snapshot.dispose()
}
/** Only bounded explicit decisions can modify the worker's original detached plan. */
export function prepareAssemblyDocumentUpdateDecisions(plan: AssemblyDocumentUpdatePlan, catalog: AssemblyDocument,
  review: AssemblyDocumentUpdateReview, input: AssemblyDocumentUpdateDecisions): PreparedAssemblyDocumentUpdate {
  const fields = data(input, ['repairs', 'removed', 'recapture', 'unlocked'])
  const removed = list(fields.removed, MAX_ASSEMBLY_MATES).map(mateLocator), recapture = list(fields.recapture, MAX_ASSEMBLY_MATES).map(mateLocator),
    unlocked = list(fields.unlocked, MAX_ASSEMBLY_MATES).map(mateLocator)
  const affected = new Set(plan.endpoints.map(value => assemblyDocumentUpdateMateKey(value.locator)))
  const mechanics = new Map(plan.capturedMates.map(value => [assemblyDocumentUpdateMateKey(value), value]))
  const all = [...removed, ...recapture, ...unlocked].map(assemblyDocumentUpdateMateKey)
  if (new Set(all).size !== all.length || all.some(value => !affected.has(value))) throw new Error('Las decisiones de relación deben ser únicas e identificar una relación afectada.')
  const removedKeys = new Set(removed.map(assemblyDocumentUpdateMateKey)), recaptureKeys = new Set(recapture.map(assemblyDocumentUpdateMateKey)),
    unlockedKeys = new Set(unlocked.map(assemblyDocumentUpdateMateKey))
  if (recapture.some(value => !mechanics.has(assemblyDocumentUpdateMateKey(value)))
    || unlocked.some(value => mechanics.get(assemblyDocumentUpdateMateKey(value))?.type !== 'concentric')) throw new Error('La captura o liberación no identifica un estado capturado afectado.')
  for (const address of mechanics.keys()) if (!removedKeys.has(address) && !recaptureKeys.has(address) && !unlockedKeys.has(address)) {
    throw new Error('Decide expresamente si recapturar, liberar el giro o eliminar cada relación con estado capturado.')
  }
  let proposal = validateAssemblyDocument(plan.document)
  const repaired = new Set<string>()
  for (const raw of list(fields.repairs, review.endpoints.length)) {
    const item = data(raw, ['locator', 'reference']), locator = endpointLocator(item.locator), address = assemblyDocumentUpdateEndpointKey(locator)
    const endpoint = plan.endpoints.find(value => assemblyDocumentUpdateEndpointKey(value.locator) === address)
    if (!endpoint || removedKeys.has(assemblyDocumentUpdateMateKey(locator)) || repaired.has(address)) throw new Error('La reparación no identifica un extremo pendiente único.')
    // Detach and validate every nested field before reading or comparing references.
    const validated = repairAssemblyEndpoint(proposal, locator, item.reference as AssemblyMateEndpointReference)
    const mate = replacementScope(validated, locator.scope).mates.find(value => value.id === locator.mateId)!
    const reference = assemblyMateEndpoint(mate, locator.side)?.reference
    const pathKind=assemblyMatePathKind(mate,locator.side)
    if (!reference || !assemblyDocumentUpdateChoices(review, endpoint).some(value => value.key === assemblyDocumentUpdateReferenceKey(reference,pathKind))) {
      throw new Error('La reparación debe pertenecer al catálogo actual dentro del subensamblaje actualizado.')
    }
    authenticateVertex(catalog, endpoint, reference,pathKind)
    proposal = validated; repaired.add(address)
  }
  for (const endpoint of plan.endpoints) if (!removedKeys.has(assemblyDocumentUpdateMateKey(endpoint.locator))
    && !repaired.has(assemblyDocumentUpdateEndpointKey(endpoint.locator))) throw new Error('Hay referencias pendientes de reparación o eliminación explícita.')
  const captured: PreparedAssemblyDocumentUpdate['recapture'] = recapture.map(locator => {
    const mate = replacementScope(proposal, locator.scope).mates.find(value => value.id === locator.mateId)!
    if (mate.type !== 'concentric' && mate.type !== 'lock' && mate.type !== 'gear' && mate.type !== 'screw' && mate.type !== 'rack-pinion') throw new Error('La relación ya no admite recaptura.')
    return { locator, mate: structuredClone(mate) }
  })
  const baseline = validateAssemblyDocument(plan.document)
  for (const document of [baseline, proposal]) {
    for (const locator of [...removed, ...recapture]) {
      const node = replacementScope(document, locator.scope)
      const mate = node.mates.find(value => value.id === locator.mateId)!
      if (recaptureKeys.has(assemblyDocumentUpdateMateKey(locator)) && mate.type === 'concentric') {
        // Capture explicitly checks an active solved concentric relation. Its
        // original suppression is restored immediately after fresh capture.
        mate.rotationLock = null; mate.suppressed = false
      }
      else node.mates = node.mates.filter(value => value.id !== locator.mateId)
    }
    for (const locator of unlocked) {
      const mate = replacementScope(document, locator.scope).mates.find(value => value.id === locator.mateId)!
      if (mate.type !== 'concentric') throw new Error('Sólo se libera el giro de una relación concéntrica.')
      mate.rotationLock = null
    }
    serializeAssemblyDocument(document)
  }
  return { baseline: validateAssemblyDocument(baseline), proposal: validateAssemblyDocument(proposal), recapture: captured }
}
