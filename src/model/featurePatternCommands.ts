import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { bodyReferenceCreationFeatureId, featureBodyOutputIds } from './bodyReferences'
import { featurePatternSourceReferences, type FeaturePatternBinding, type FeaturePatternOperation } from './featurePatterns'

/** Explicit target selection prunes removed routes and defaults new targets on each binding. */
export function withFeaturePatternTargets(feature: RepetitionFeature, targets: readonly BodyReference[]): RepetitionFeature {
  if (!feature.featurePattern) return feature
  const previous = new Set(feature.featurePattern.targets.map(target => target.bodyId))
  const selected = new Set(targets.map(target => target.bodyId))
  const additions = targets.filter(target => !previous.has(target.bodyId)).map(target => target.bodyId)
  const next = structuredClone(feature), operation = next.featurePattern!
  return { ...next, featurePattern: { ...operation, targets: targets.map(target => ({ ...target })),
    bindings: operation.bindings.map(binding => ({ ...binding,
      targetBodyIds: [...binding.targetBodyIds.filter(bodyId => selected.has(bodyId)), ...additions] })) } }
}

/** Newly selected seed features require an explicit output choice, never a guessed binding. */
export function withFeaturePatternSeeds(feature: RepetitionFeature, featureIds: readonly string[]): RepetitionFeature {
  if (!feature.featurePattern || feature.source.mode !== 'features') return feature
  const selected = new Set(featureIds), next = structuredClone(feature), operation = next.featurePattern!
  return { ...next, source: { ...feature.source, featureIds: [...featureIds] }, featurePattern: { ...operation,
    bindings: operation.bindings.filter(binding => selected.has(binding.source.sourceFeatureId)) } }
}

/** Source selection and routing are explicit edits; missing coverage stays invalid. */
export function withFeaturePatternBindings(feature: RepetitionFeature, bindings: readonly FeaturePatternBinding[]): RepetitionFeature {
  if (!feature.featurePattern) return feature
  const next = structuredClone(feature)
  return { ...next, featurePattern: { ...next.featurePattern!, bindings: structuredClone([...bindings]) } }
}

/**
 * Structural historical attestation only. Repeated body IDs at different exact
 * source features are valid; native preview decides whether each output exists.
 */
export function featurePatternHistoricalFingerprint(feature: RepetitionFeature, sources: readonly Feature[]): string {
  const references = featurePatternSourceReferences(feature)
  const earlier = new Map(sources.map(source => [source.id, source]))
  for (const reference of references) {
    const source = earlier.get(reference.sourceFeatureId)
    if (!source || source.suppressed || !featureBodyOutputIds(source).includes(reference.bodyId)
      || !bodyReferenceCreationFeatureId(sources, reference)) throw new Error('La aportación histórica no pertenece a una salida anterior disponible.')
  }
  return JSON.stringify(references.map(reference => [reference.bodyId, reference.sourceFeatureId]))
}

/** Switching calculation method preserves exact routes and requires a fresh preview. */
export function withFeaturePatternMode(feature: RepetitionFeature, mode: FeaturePatternOperation['mode']): RepetitionFeature {
  if (!feature.featurePattern || feature.source.mode !== 'features' || (mode !== 'geometry' && mode !== 'regenerate')) {
    throw new Error('El método de repetición requiere operaciones con destinos explícitos.')
  }
  const next = structuredClone(feature), routes = next.featurePattern!
  const operation: FeaturePatternOperation = mode === 'geometry'
    ? { mode, targets: routes.targets, bindings: routes.bindings }
    : { mode, scope: 'selected', targets: routes.targets, bindings: routes.bindings, referencePolicies: [], variation: { kind: 'none' } }
  return { ...next, source: { mode: 'features', geometryPattern: mode === 'geometry', featureIds: [...feature.source.featureIds] }, featurePattern: operation }
}
