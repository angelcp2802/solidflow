import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { bodyReferenceCreationFeatureId, featureBodyOutputIncludes } from './bodyReferences'
import { featurePatternSourceReferences, isAllFeaturePattern, type AnyFeaturePatternBinding, type FeaturePatternOperation } from './featurePatterns'

/** Explicit target selection prunes removed routes and defaults new targets on each binding. */
export function withFeaturePatternTargets(feature: RepetitionFeature, targets: readonly BodyReference[]): RepetitionFeature {
  if (!feature.featurePattern) return feature
  if (isAllFeaturePattern(feature.featurePattern)) throw new Error('El alcance ALL se resuelve desde el catálogo actual; no admite destinos guardados.')
  const previous = new Set(feature.featurePattern.targets.map(target => target.bodyId))
  const selected = new Set(targets.map(target => target.bodyId))
  const additions = targets.filter(target => !previous.has(target.bodyId)).map(target => target.bodyId)
  const next = structuredClone(feature), operation = structuredClone(feature.featurePattern)
  return { ...next, featurePattern: { ...operation, targets: targets.map(target => ({ ...target })),
    bindings: operation.bindings.map(binding => ({ ...binding,
      targetBodyIds: [...binding.targetBodyIds.filter(bodyId => selected.has(bodyId)), ...additions] })) } }
}

/** Newly selected seed features require an explicit output choice, never a guessed binding. */
export function withFeaturePatternSeeds(feature: RepetitionFeature, featureIds: readonly string[]): RepetitionFeature {
  if (!feature.featurePattern || feature.source.mode !== 'features') return feature
  const selected = new Set(featureIds), next = structuredClone(feature), operation = next.featurePattern!
  const source = { ...feature.source, featureIds: [...featureIds] }
  return isAllFeaturePattern(operation)
    ? { ...next, source, featurePattern: { ...operation, bindings: operation.bindings.filter(binding => selected.has(binding.source.sourceFeatureId)) } }
    : { ...next, source, featurePattern: { ...operation, bindings: operation.bindings.filter(binding => selected.has(binding.source.sourceFeatureId)) } }
}

/** Source selection and routing are explicit edits; missing coverage stays invalid. */
export function withFeaturePatternBindings(feature: RepetitionFeature, bindings: readonly AnyFeaturePatternBinding[]): RepetitionFeature {
  if (!feature.featurePattern) return feature
  const next = structuredClone(feature)
  const operation = next.featurePattern!
  if (isAllFeaturePattern(operation)) {
    if (bindings.some(binding => binding.targetBodyIds !== 'scope')) throw new Error('Las rutas ALL deben seguir el alcance dinámico.')
    return { ...next, featurePattern: { ...operation, bindings: bindings.map(binding => ({ source: { ...binding.source }, targetBodyIds: 'scope' })) } }
  }
  if (bindings.some(binding => !Array.isArray(binding.targetBodyIds))) throw new Error('Los destinos seleccionados necesitan rutas explícitas.')
  return { ...next, featurePattern: { ...operation, bindings: bindings.map(binding => ({ source: { ...binding.source }, targetBodyIds: [...binding.targetBodyIds] })) } }
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
    if (!source || source.suppressed || !featureBodyOutputIncludes(source, reference.bodyId, sources)
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
  if (isAllFeaturePattern(routes)) {
    if (mode === 'geometry') throw new Error('Selecciona destinos explícitos antes de copiar geometría.')
    return next
  }
  const operation: FeaturePatternOperation = mode === 'geometry'
    ? { mode, targets: routes.targets, bindings: routes.bindings }
    : { mode, scope: 'selected', targets: routes.targets, bindings: routes.bindings, referencePolicies: [], variation: { kind: 'none' } }
  return { ...next, source: { mode: 'features', geometryPattern: mode === 'geometry', featureIds: [...feature.source.featureIds] }, featurePattern: operation }
}

/** Explicit scope edit. Derived ALL targets are never persisted or guessed. */
export function withFeaturePatternScope(feature: RepetitionFeature, scope: 'selected' | 'all'): RepetitionFeature {
  if (scope !== 'selected' && scope !== 'all') throw new Error('El alcance debe ser seleccionado o ALL.')
  if (!feature.featurePattern || feature.featurePattern.mode !== 'regenerate') throw new Error('El alcance dinámico requiere recalcular operaciones.')
  const next = structuredClone(feature), operation = next.featurePattern!
  if (isAllFeaturePattern(operation)) {
    if (scope === 'all') return next
    return { ...next, featurePattern: { mode: 'regenerate', scope: 'selected', targets: [],
      bindings: operation.bindings.map(binding => ({ source: { ...binding.source }, targetBodyIds: [] })), referencePolicies: [], variation: { kind: 'none' } } }
  }
  if (scope === 'selected') return next
  return { ...next, featurePattern: { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput',
    bindings: operation.bindings.map(binding => ({ source: { ...binding.source }, targetBodyIds: 'scope' })), referencePolicies: [], variation: { kind: 'none' } } }
}
