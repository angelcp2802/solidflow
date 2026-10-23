import type { BodyReference, Feature } from '../cad/kernel.types'
import { isAllFeaturePattern } from './featurePatterns'

/** Detached references in saved operand/scope order, without native resolution. */
export function featureBodyReferences(feature: Feature): BodyReference[] {
  let references: readonly BodyReference[] = []
  if (feature.type === 'combine') {
    references = feature.operation === 'subtract' ? [feature.target, ...feature.tools] : feature.operands
  } else if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.featurePattern) {
    references = [...feature.featurePattern.bindings.map(binding => binding.source),
      ...(isAllFeaturePattern(feature.featurePattern) ? [] : feature.featurePattern.targets)]
  } else if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.source.mode === 'bodies') {
    references = [...feature.source.bodies, ...(feature.bodyPattern?.mode === 'merge' ? [feature.bodyPattern.target] : [])]
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

/** Inputs that must resolve in the current catalog; historical seeds are separate. */
export function featureCurrentBodyReferences(feature: Feature): BodyReference[] {
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.featurePattern) {
    return isAllFeaturePattern(feature.featurePattern) ? [] : feature.featurePattern.targets.map(reference => ({ ...reference }))
  }
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.source.mode === 'bodies') {
    return [...(feature.source.scope === 'current' ? feature.source.bodies : []),
      ...(feature.bodyPattern?.mode === 'merge' ? [feature.bodyPattern.target] : [])].map(reference => ({ ...reference }))
  }
  return featureBodyReferences(feature)
}

/** IDs allocated by this command, including when the feature is suppressed. */
export function createdBodyIds(feature: Feature): string[] {
  if (feature.type === 'importedBodies') return feature.bodies.map(body => body.bodyId)
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.bodyPattern?.mode === 'new') {
    return feature.bodyPattern.instances.map(instance => instance.bodyId)
  }
  if (feature.type === 'combine' && feature.operation !== 'subtract') return [feature.resultBodyId]
  if ((feature.type === 'extrude' || feature.type === 'revolve' || feature.type === 'sweep' || feature.type === 'loft') && feature.bodyOperation?.mode === 'new') {
    return [feature.bodyOperation.bodyId]
  }
  return []
}

/** Structural output association; native materialization/current state is separate. */
export function featureBodyOutputIds(feature: Feature, earlierFeatures?: readonly Feature[]): string[] {
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.featurePattern) {
    // A scoped no-op keeps its old exact state. This is a potential repair
    // association, never a declaration that every target advances to this ID.
    if (isAllFeaturePattern(feature.featurePattern)) {
      if (!earlierFeatures) throw new Error('La asociación potencial de ALL requiere el historial anterior.')
      const boundary = earlierFeatures.findIndex(item => item.id === feature.id)
      const prefix = boundary < 0 ? earlierFeatures : earlierFeatures.slice(0, boundary)
      return [...new Set(prefix.flatMap(createdBodyIds))]
    }
    return feature.featurePattern.targets.map(reference => reference.bodyId)
  }
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror') && feature.bodyPattern?.mode === 'merge') {
    return [feature.bodyPattern.target.bodyId]
  }
  if (feature.type === 'combine') {
    return feature.operation === 'subtract' ? [feature.target.bodyId] : [feature.resultBodyId]
  }
  const created = createdBodyIds(feature)
  // A geometric limit is an input, never an additional output of the new body.
  return created.length ? created : featureBodyReferences(feature).map(reference => reference.bodyId)
}

/** Exact structural repair query; it does not assert native currentness. */
export function featureBodyOutputIncludes(feature: Feature, bodyId: string, earlierFeatures: readonly Feature[]): boolean {
  if ((feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror')
    && feature.featurePattern && isAllFeaturePattern(feature.featurePattern)) {
    const boundary = earlierFeatures.findIndex(item => item.id === feature.id)
    return earlierFeatures.some((item, index) => (boundary < 0 || index < boundary) && createdBodyIds(item).includes(bodyId))
  }
  return featureBodyOutputIds(feature).includes(bodyId)
}

/**
 * Finds a creator through exact, earlier modifying states. Suppression, consumed
 * state and staleness are execution concerns; none changes creation ownership.
 * Malformed, forward or cyclic chains return null instead of guessing an owner.
 */
export function bodyReferenceCreationFeatureId(features: readonly Feature[], reference: BodyReference): string | null {
  const indices = new Map<string, number>()
  const creators = new Map<string, { id: string; index: number }>()
  for (let index = 0; index < features.length; index++) {
    if (indices.has(features[index].id)) return null
    indices.set(features[index].id, index)
    for (const bodyId of createdBodyIds(features[index])) {
      if (creators.has(bodyId)) return null
      creators.set(bodyId, { id: features[index].id, index })
    }
  }
  let current = { ...reference }
  let before = features.length
  while (true) {
    const index = indices.get(current.sourceFeatureId)
    if (index === undefined || index >= before) return null
    const feature = features[index]
    if (createdBodyIds(feature).includes(current.bodyId)) return feature.id
    if (!featureBodyOutputIncludes(feature, current.bodyId, features)) return null
    // Historical seeds may share the target identity. Only the modifying target
    // continues that identity's creation chain; copied inputs never do.
    const repetition = feature.type === 'linearPattern' || feature.type === 'circularPattern' || feature.type === 'mirror'
    if (repetition && feature.featurePattern && isAllFeaturePattern(feature.featurePattern)) {
      // ALL preserves a target identity already created before this boundary.
      // A historical seed never supplies the target's creator association.
      const creator = creators.get(current.bodyId)
      return creator && creator.index < index ? creator.id : null
    }
    const source = repetition && feature.featurePattern && !isAllFeaturePattern(feature.featurePattern)
      ? feature.featurePattern.targets.filter(candidate => candidate.bodyId === current.bodyId)
      : repetition && feature.bodyPattern?.mode === 'merge'
        ? [feature.bodyPattern.target] : featureBodyReferences(feature).filter(candidate => candidate.bodyId === current.bodyId)
    if (source.length !== 1) return null
    current = source[0]
    before = index
  }
}
