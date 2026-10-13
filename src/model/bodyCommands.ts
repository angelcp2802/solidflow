import type { BodyOperation, BodyReference, Feature } from '../cad/kernel.types'
import { addFeature, updateFeature, validateDocument, type Document } from './document'
import { bodyReferenceCreationFeatureId, featureBodyOutputIds, featureCurrentBodyReferences } from './bodyReferences'

export interface BodyCommandCatalog {
  active: boolean
  bodies: readonly { ref: BodyReference }[]
}

export interface BodyCommandState {
  document: Document
  feature: Feature
  selection: readonly BodyReference[]
  catalog: BodyCommandCatalog
}

export interface BodyCommandPlan {
  /** Full detached committed proposal, including unchanged later features. */
  readonly document: Document
  /** Exact rolled-back proposal sent to the preview builder. */
  readonly previewFeatures: Feature[]
  readonly featureId: string
}

type Rejection = { accepted: false; message: string }
export type BodyCommandPreparation = Rejection | { accepted: true; plan: BodyCommandPlan }
export type BodyCommandApplication = Rejection | { accepted: true; document: Document; featureId: string }

interface Attestation {
  source: string
  feature: string
  selection: string
  catalog: string
  proposal: string
  preview: string
}

const attestations = new WeakMap<BodyCommandPlan, Attestation>()
const fingerprint = (value: unknown) => JSON.stringify(value)
const key = (reference: BodyReference) => JSON.stringify([reference.bodyId, reference.sourceFeatureId])
const identifier = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value)

export function sameBodyReference(a: BodyReference, b: BodyReference): boolean {
  return a.bodyId === b.bodyId && a.sourceFeatureId === b.sourceFeatureId
}

export function isBodyCommandFeature(feature: Feature): boolean {
  return feature.type === 'combine'
    || ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.source.mode === 'bodies' && feature.bodyPattern !== undefined)
    || ((feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') && feature.bodyOperation !== undefined)
    || ((feature.type === 'cut' || feature.type === 'hole' || feature.type === 'fillet' || feature.type === 'chamfer' || feature.type === 'shell' || feature.type === 'draft') && feature.bodyScope !== undefined)
}

/** Changing draft creation mode never adopts a merge target as a new-body limit. */
export function setBodyOperationDraft(feature: Extract<Feature, { type: 'extrude' | 'revolve' | 'sweep' | 'loft' }>, operation: BodyOperation): Feature {
  const next = { ...feature, bodyOperation: structuredClone(operation) }
  if (next.type === 'sweep' || next.type === 'loft') return { ...next, merge: operation.mode === 'merge' }
  if (next.type !== 'extrude' || !next.endCondition || !('baseFeatureId' in next.endCondition)) return next
  const endCondition = { ...next.endCondition }
  if (operation.mode === 'merge') {
    delete endCondition.baseBody
    return { ...next, endCondition: { ...endCondition, baseFeatureId: operation.target.sourceFeatureId } }
  }
  if (feature.bodyOperation?.mode !== 'new') {
    delete endCondition.baseBody
    return { ...next, endCondition: { ...endCondition, baseFeatureId: '' } }
  }
  return next
}

/** Explicit editor selection, including its termination/base scope. */
export function withBodySelection(feature: Feature, selection: readonly BodyReference[]): Feature {
  const references = selection.map(reference => ({ ...reference }))
  const first = references[0] ?? { bodyId: '', sourceFeatureId: '' }
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.source.mode === 'bodies') {
    return { ...feature, source: { ...feature.source, bodies: references } }
  }
  if (feature.type === 'combine') return feature.operation === 'subtract'
    ? { ...feature, target: first, tools: references.slice(1) }
    : { ...feature, operands: references }
  if (feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') {
    if (feature.bodyOperation?.mode !== 'merge') return feature
    return setBodyOperationDraft(feature, { mode: 'merge', target: first })
  }
  if (feature.type === 'cut') return {
    ...feature, bodyScope: references,
    ...(feature.endCondition && 'baseFeatureId' in feature.endCondition
      ? { endCondition: { ...feature.endCondition, baseFeatureId: first.sourceFeatureId } } : {}),
  }
  if (feature.type === 'hole') return { ...feature, bodyScope: references, baseFeatureId: first.sourceFeatureId }
  if (feature.type === 'fillet' || feature.type === 'chamfer' || feature.type === 'shell' || feature.type === 'draft') {
    return { ...feature, bodyScope: first, baseFeatureId: first.sourceFeatureId }
  }
  return feature
}

function catalogFingerprint(catalog: BodyCommandCatalog, features: readonly Feature[]): string {
  if (typeof catalog.active !== 'boolean' || !Array.isArray(catalog.bodies) || catalog.bodies.length > 256) throw new Error('El catálogo de cuerpos no es válido.')
  const ids = new Set<string>()
  const references: string[] = []
  for (let index = 0; index < catalog.bodies.length; index++) {
    if (!Object.hasOwn(catalog.bodies, index)) throw new Error('El catálogo contiene un cuerpo ausente.')
    const reference = catalog.bodies[index]?.ref
    if (!reference || !identifier(reference.bodyId) || !identifier(reference.sourceFeatureId) || ids.has(reference.bodyId)) throw new Error('El catálogo contiene una identidad duplicada o no válida.')
    if (!bodyReferenceCreationFeatureId(features, reference)) throw new Error('El cuerpo no pertenece al historial mostrado.')
    const source = features.find(feature => feature.id === reference.sourceFeatureId)
    if (!source || source.suppressed) throw new Error('El estado seleccionado del cuerpo no está disponible.')
    ids.add(reference.bodyId)
    references.push(key(reference))
  }
  if (!catalog.active && catalog.bodies.length) throw new Error('El catálogo de cuerpos no está activo.')
  // Enumeration and presentation order do not become identity.
  return fingerprint([catalog.active, references.sort()])
}

function selectionFingerprint(selection: readonly BodyReference[], catalog: BodyCommandCatalog, historicalSources?: readonly Feature[]): string {
  if (!Array.isArray(selection) || selection.length > 256) throw new Error('La selección de cuerpos no es válida.')
  const ids = new Set<string>()
  const references: string[] = []
  for (let index = 0; index < selection.length; index++) {
    if (!Object.hasOwn(selection, index)) throw new Error('La selección contiene un cuerpo ausente.')
    const reference = selection[index]
    if (!reference || !identifier(reference.bodyId) || !identifier(reference.sourceFeatureId) || ids.has(reference.bodyId)) throw new Error('La selección contiene una identidad duplicada o no válida.')
    if (historicalSources) {
      const source = historicalSources.find(feature => feature.id === reference.sourceFeatureId)
      if (!source || source.suppressed || !featureBodyOutputIds(source).includes(reference.bodyId)
        || !bodyReferenceCreationFeatureId(historicalSources, reference)) throw new Error('La selección histórica no pertenece a una salida anterior disponible.')
    } else if (catalog.bodies.filter(body => sameBodyReference(body.ref, reference)).length !== 1) throw new Error('La selección de cuerpos ha quedado obsoleta.')
    ids.add(reference.bodyId)
    references.push(key(reference))
  }
  return fingerprint(references)
}

function sourceFeatures(state: BodyCommandState): Feature[] {
  const index = state.document.features.findIndex(feature => feature.id === state.feature.id)
  return state.document.features.slice(0, index < 0 ? state.document.features.length : index)
}

function historicalSelectionSources(feature: Feature, sources: readonly Feature[]): readonly Feature[] | undefined {
  return (feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror')
    && feature.source.mode === 'bodies' && feature.source.scope === 'historical' ? sources : undefined
}

/**
 * Pure preparation only: IDs must already be allocated on the feature draft.
 * Native validity is supplied later by the exact preview, never inferred here.
 */
export function prepareBodyCommand(state: BodyCommandState): BodyCommandPreparation {
  try {
    const document = validateDocument(state.document)
    if (!isBodyCommandFeature(state.feature)) throw new Error('La operación conserva el modo agregado anterior; no se convierte automáticamente.')
    const sources = sourceFeatures({ ...state, document })
    const catalog = catalogFingerprint(state.catalog, sources)
    const historicalSources = historicalSelectionSources(state.feature, sources)
    const selection = selectionFingerprint(state.selection, state.catalog, historicalSources)
    const references = featureCurrentBodyReferences(state.feature)
    if (references.length && !state.catalog.active) throw new Error('Selecciona cuerpos de un catálogo activo.')
    for (const reference of references) {
      if (state.catalog.bodies.filter(body => sameBodyReference(body.ref, reference)).length !== 1) throw new Error('Un cuerpo de la operación no está disponible en el estado mostrado.')
    }
    if (historicalSources && (state.feature.type === 'linearPattern' || state.feature.type === 'circularPattern' || state.feature.type === 'mirror') && state.feature.source.mode === 'bodies') {
      // Structural availability is checked here; native materialization belongs
      // to the exact preview, including skipped/retired historical outputs.
      selectionFingerprint(state.feature.source.bodies, state.catalog, historicalSources)
      if (!state.catalog.active) throw new Error('La repetición explícita requiere un catálogo activo.')
    }
    if ((state.feature.type === 'extrude' || state.feature.type === 'revolve' || state.feature.type === 'sweep' || state.feature.type === 'loft') && state.feature.bodyOperation?.mode === 'new' && !state.catalog.active
      && sources.some(feature => feature.type !== 'sketch' && feature.type !== 'plane' && !isBodyCommandFeature(feature))) {
      throw new Error('Empieza la gestión explícita de cuerpos en una pieza nueva; la geometría anterior no se adopta automáticamente.')
    }
    const proposal = document.features.some(feature => feature.id === state.feature.id)
      ? updateFeature(document, state.feature.id, state.feature)
      : addFeature(document, state.feature)
    const index = proposal.features.findIndex(feature => feature.id === state.feature.id)
    const plan: BodyCommandPlan = {
      document: proposal,
      previewFeatures: structuredClone(proposal.features.slice(0, index + 1)),
      featureId: state.feature.id,
    }
    attestations.set(plan, {
      source: fingerprint(state.document), feature: fingerprint(state.feature), selection, catalog,
      proposal: fingerprint(proposal), preview: fingerprint(plan.previewFeatures),
    })
    return { accepted: true, plan }
  } catch (error) {
    return { accepted: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/** A healthy result must have been built from this exact preview array. */
export function applyBodyCommand(plan: BodyCommandPlan, state: BodyCommandState, preview: { features: readonly Feature[] | null; healthy: boolean }): BodyCommandApplication {
  try {
    const proof = attestations.get(plan)
    if (!proof) throw new Error('La propuesta no está disponible o ya se aplicó.')
    if (!preview.healthy || preview.features !== plan.previewFeatures) throw new Error('Espera una vista previa válida de esta propuesta.')
    if (fingerprint(state.document) !== proof.source || fingerprint(state.feature) !== proof.feature
      || selectionFingerprint(state.selection, state.catalog, historicalSelectionSources(state.feature, sourceFeatures(state))) !== proof.selection
      || catalogFingerprint(state.catalog, sourceFeatures(state)) !== proof.catalog) {
      throw new Error('La pieza, selección o configuración ha cambiado. Revisa la nueva vista previa.')
    }
    if (fingerprint(plan.document) !== proof.proposal || fingerprint(plan.previewFeatures) !== proof.preview || plan.featureId !== state.feature.id) throw new Error('La propuesta ha cambiado después de su vista previa.')
    const document = validateDocument(plan.document)
    attestations.delete(plan)
    return { accepted: true, document, featureId: plan.featureId }
  } catch (error) {
    return { accepted: false, message: error instanceof Error ? error.message : String(error) }
  }
}
