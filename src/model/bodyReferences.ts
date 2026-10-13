import type { BodyReference, Feature } from '../cad/kernel.types'

/** Detached references in saved operand/scope order, without native resolution. */
export function featureBodyReferences(feature: Feature): BodyReference[] {
  let references: readonly BodyReference[] = []
  if (feature.type === 'combine') {
    references = feature.operation === 'subtract' ? [feature.target, ...feature.tools] : feature.operands
  } else if ((feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') && feature.bodyOperation?.mode === 'merge') {
    references = [feature.bodyOperation.target]
  } else if (feature.type === 'extrude' && feature.bodyOperation?.mode === 'new'
    && feature.endCondition && feature.endCondition.kind !== 'upToSurface' && feature.endCondition.baseBody) {
    references = [feature.endCondition.baseBody]
  } else if ((feature.type === 'cut' || feature.type === 'hole') && feature.bodyScope) {
    references = feature.bodyScope
  } else if ((feature.type === 'fillet' || feature.type === 'chamfer' || feature.type === 'shell' || feature.type === 'draft') && feature.bodyScope) {
    references = [feature.bodyScope]
  }
  return references.map(reference => ({ ...reference }))
}

/** IDs allocated by this command, including when the feature is suppressed. */
export function createdBodyIds(feature: Feature): string[] {
  if (feature.type === 'combine' && feature.operation !== 'subtract') return [feature.resultBodyId]
  if ((feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') && feature.bodyOperation?.mode === 'new') {
    return [feature.bodyOperation.bodyId]
  }
  return []
}

/** Bodies explicitly created or modified, not every body visible at this step. */
export function featureBodyOutputIds(feature: Feature): string[] {
  if (feature.type === 'combine') {
    return feature.operation === 'subtract' ? [feature.target.bodyId] : [feature.resultBodyId]
  }
  const created = createdBodyIds(feature)
  // A geometric limit is an input, never an additional output of the new body.
  return created.length ? created : featureBodyReferences(feature).map(reference => reference.bodyId)
}

/**
 * Finds a creator through exact, earlier modifying states. Suppression, consumed
 * state and staleness are execution concerns; none changes creation ownership.
 * Malformed, forward or cyclic chains return null instead of guessing an owner.
 */
export function bodyReferenceCreationFeatureId(features: readonly Feature[], reference: BodyReference): string | null {
  const indices = new Map<string, number>()
  for (let index = 0; index < features.length; index++) {
    if (indices.has(features[index].id)) return null
    indices.set(features[index].id, index)
  }
  let current = { ...reference }
  let before = features.length
  while (true) {
    const index = indices.get(current.sourceFeatureId)
    if (index === undefined || index >= before) return null
    const feature = features[index]
    if (createdBodyIds(feature).includes(current.bodyId)) return feature.id
    if (!featureBodyOutputIds(feature).includes(current.bodyId)) return null
    const source = featureBodyReferences(feature).filter(candidate => candidate.bodyId === current.bodyId)
    if (source.length !== 1) return null
    current = source[0]
    before = index
  }
}
