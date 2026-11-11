import type { BodyReference, Feature, RepetitionFeature } from '../cad/kernel.types'
import { bodyReferenceCreationFeatureId, featureBodyOutputIncludes } from './bodyReferences'
import { activeFeaturePatternAddresses, featurePatternSourceReferences, isDynamicFeaturePattern, isAllFeaturePattern, type AnyFeaturePatternBinding, type FeaturePatternOperation } from './featurePatterns'
import { readRecipeAutoScopeCapture, type RecipeAutoScopeCapture } from './featureRecipeAutoScope'
import { isRecipeInstanceDepth, type RecipeInstanceDepthValue } from './featureRecipeDepthVariation'
import { isRecipeSketchDimensionValue, MAX_RECIPE_SKETCH_DIMENSIONS, MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE, recipeSketchDrivingDimensions, type RecipeSketchDimensionValue } from './featureRecipeSketchVariation'

/** Explicit target selection prunes removed routes and defaults new targets on each binding. */
export function withFeaturePatternTargets(feature: RepetitionFeature, targets: readonly BodyReference[]): RepetitionFeature {
  if (!feature.featurePattern) return feature
  if (isDynamicFeaturePattern(feature.featurePattern)) throw new Error('El alcance ALL se resuelve desde el catálogo actual; no admite destinos guardados.')
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
  const current = feature.featurePattern
  if (current.mode === 'regenerate' && current.scope === 'selected' && current.variation.kind !== 'none'
    && (featureIds.length !== 1 || featureIds[0] !== feature.source.featureIds[0])) {
    throw new Error('Quita las variaciones por instancia antes de cambiar la semilla.')
  }
  const selected = new Set(featureIds), next = structuredClone(feature), operation = next.featurePattern!
  const source = { ...feature.source, featureIds: [...featureIds] }
  return isDynamicFeaturePattern(operation)
    ? { ...next, source, featurePattern: { ...operation, bindings: operation.bindings.filter(binding => selected.has(binding.source.sourceFeatureId)),
      referencePolicies: operation.referencePolicies.filter(policy => selected.has(policy.featureId)) } }
    : { ...next, source, featurePattern: { ...operation, bindings: operation.bindings.filter(binding => selected.has(binding.source.sourceFeatureId)),
      ...(operation.mode === 'regenerate' ? { referencePolicies: operation.referencePolicies.filter(policy => selected.has(policy.featureId)) } : {}) } }
}

/** Source selection and routing are explicit edits; missing coverage stays invalid. */
export function withFeaturePatternBindings(feature: RepetitionFeature, bindings: readonly AnyFeaturePatternBinding[]): RepetitionFeature {
  if (!feature.featurePattern) return feature
  const next = structuredClone(feature)
  const operation = next.featurePattern!
  if (isDynamicFeaturePattern(operation)) {
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
  if (isDynamicFeaturePattern(routes)) {
    if (mode === 'geometry') throw new Error('Selecciona destinos explícitos antes de copiar geometría.')
    return next
  }
  if (routes.mode === mode) return next
  if (routes.mode === 'regenerate' && routes.variation.kind !== 'none') throw new Error('Quita las variaciones por instancia antes de copiar geometría.')
  const operation: FeaturePatternOperation = mode === 'geometry'
    ? { mode, targets: routes.targets, bindings: routes.bindings }
    : { mode, scope: 'selected', targets: routes.targets, bindings: routes.bindings, referencePolicies: [], variation: { kind: 'none' } }
  return { ...next, source: { mode: 'features', geometryPattern: mode === 'geometry', featureIds: [...feature.source.featureIds] }, featurePattern: operation }
}

/** Explicit scope edit. Derived current or captured IDs never become manual targets. */
export function withFeaturePatternScope(feature: RepetitionFeature, scope: 'selected' | 'all'): RepetitionFeature {
  if (scope !== 'selected' && scope !== 'all') throw new Error('El alcance debe ser seleccionado o ALL.')
  if (!feature.featurePattern || feature.featurePattern.mode !== 'regenerate') throw new Error('El alcance dinámico requiere recalcular operaciones.')
  const next = structuredClone(feature), operation = next.featurePattern!
  if (operation.mode !== 'regenerate') throw new Error('El alcance dinámico requiere recalcular operaciones.')
  if (scope === 'selected') {
    if (!isDynamicFeaturePattern(operation)) return next
    return { ...next, featurePattern: { mode: 'regenerate', scope: 'selected', targets: [],
      bindings: operation.bindings.map(binding => ({ source: { ...binding.source }, targetBodyIds: [] })),
      referencePolicies: operation.referencePolicies, variation: { kind: 'none' } } }
  }
  if (isAllFeaturePattern(operation)) return next
  if (operation.variation.kind !== 'none') throw new Error('Quita las variaciones por instancia antes de usar todos los cuerpos.')
  return { ...next, featurePattern: { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput',
    bindings: operation.bindings.map(binding => ({ source: { ...binding.source }, targetBodyIds: 'scope' })),
    referencePolicies: operation.referencePolicies, variation: { kind: 'none' } } }
}

/** Materialize declared capture intent only; the caller still needs a fresh native preview. */
export function withFeaturePatternAutoCapture(feature: RepetitionFeature, capture: RecipeAutoScopeCapture): RepetitionFeature {
  capture = readRecipeAutoScopeCapture(capture)
  if (feature.source.mode !== 'features' || feature.featurePattern?.mode !== 'regenerate' || capture.patternId !== feature.id) {
    throw Error('La detección automática no corresponde a esta operación. Vuelve a detectar sus cuerpos.')
  }
  if (feature.featurePattern.variation.kind !== 'none') throw Error('Quita las variaciones por instancia antes de detectar cuerpos automáticamente.')
  return { ...structuredClone(feature), featurePattern: { mode: 'regenerate', scope: 'auto',
    capturedBodyIds: [...capture.scope.capturedBodyIds], captureFingerprint: capture.scope.captureFingerprint, follow: capture.scope.follow,
    bindings: feature.featurePattern.bindings.map(binding => ({ source: { ...binding.source }, targetBodyIds: 'scope' })),
    referencePolicies: structuredClone(feature.featurePattern.referencePolicies), variation: { kind: 'none' } } }
}

/** One explicit address edit; clearing the last row restores the original none intent. */
export function withFeaturePatternInstanceDepth(feature: RepetitionFeature, address: string, value: number | null): RepetitionFeature {
  const operation = feature.featurePattern
  if (operation?.mode !== 'regenerate' || operation.scope !== 'selected' || feature.source.mode !== 'features' || feature.source.featureIds.length !== 1) {
    throw new Error('La profundidad por instancia requiere recalcular una semilla sobre cuerpos seleccionados.')
  }
  if (operation.variation.kind === 'sketchDimensions') throw Error('Quita las cotas de croquis por instancia antes de variar la profundidad.')
  const rows = operation.variation.kind === 'dimensions' ? operation.variation.values : []
  if (value !== null && (!activeFeaturePatternAddresses(feature).includes(address) || !isRecipeInstanceDepth(value))) {
    throw new Error('Selecciona una instancia activa e indica una profundidad entre 0,01 y 100.000 mm.')
  }
  const values: RecipeInstanceDepthValue[] = rows.filter(row => row.address !== address)
  if (value !== null) values.push({ address, featureId: feature.source.featureIds[0], parameter: 'depth', value })
  return { ...structuredClone(feature), featurePattern: { ...structuredClone(operation),
    variation: values.length ? { kind: 'dimensions', values: structuredClone(values) } : { kind: 'none' } } }
}

function sketchVariationSeed(feature: RepetitionFeature, features: readonly Feature[]) {
  const seedId = feature.source.mode === 'features' && feature.source.featureIds.length === 1 ? feature.source.featureIds[0] : undefined;
  const seed = features.find(item => item.id === seedId);
  const sketch = seed?.type === 'cut' || seed?.type === 'extrude' ? features.find(item => item.id === seed.sketchId) : undefined;
  return { sketch, drivers: recipeSketchDrivingDimensions(seed, sketch) };
}

/** Edit one exact address/constraint pair; saved rows contain declarations only. */
export function withFeaturePatternSketchDimension(feature: RepetitionFeature, features: readonly Feature[], address: string,
  constraintId: string, value: number | null): RepetitionFeature {
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.scope !== 'selected' || feature.source.mode !== 'features') {
    throw Error('La cota por instancia requiere recalcular operaciones sobre cuerpos seleccionados.');
  }
  if (operation.variation.kind === 'dimensions') throw Error('Quita las profundidades por instancia antes de variar el croquis.');
  const rows = operation.variation.kind === 'sketchDimensions' ? operation.variation.values : [];
  const values: RecipeSketchDimensionValue[] = rows.filter(row => row.address !== address || row.constraintId !== constraintId);
  if (value !== null) {
    const { sketch, drivers } = sketchVariationSeed(feature, features);
    if (!sketch || !drivers.some(driver => driver.constraintId === constraintId)
      || !activeFeaturePatternAddresses(feature).includes(address) || !isRecipeSketchDimensionValue(value)) {
      throw Error('Selecciona una instancia activa y una cota conductora entre 0,01 y 100.000 mm.');
    }
    if (rows.some(row => row.address === address && row.constraintId === constraintId && row.sketchId !== sketch.id)) {
      throw Error('Quita la cota no disponible antes de asignarla al croquis actual.');
    }
    if (values.length >= MAX_RECIPE_SKETCH_DIMENSIONS
      || values.filter(row => row.address === address).length >= MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE) {
      throw Error('Quita una cota asignada antes de añadir otra.');
    }
    values.push({ address, sketchId: sketch.id, constraintId, value });
  }
  return { ...structuredClone(feature), featurePattern: { ...structuredClone(operation),
    variation: values.length ? { kind: 'sketchDimensions', values: structuredClone(values) } : { kind: 'none' } } };
}

/** Existing circle-only command retains its removal behavior for an unavailable saved radius. */
export function withFeaturePatternSketchRadius(feature: RepetitionFeature, features: readonly Feature[], address: string,
  value: number | null): RepetitionFeature {
  const { drivers } = sketchVariationSeed(feature, features);
  const radius = drivers.find(driver => driver.parameter === 'radius');
  if (value !== null) {
    if (!radius) throw Error('Selecciona una instancia activa y un croquis circular de centro fijo y radio conductor entre 0,01 y 100.000 mm.');
    return withFeaturePatternSketchDimension(feature, features, address, radius.constraintId, value);
  }
  const operation = feature.featurePattern;
  const rows = operation?.mode === 'regenerate' && operation.variation.kind === 'sketchDimensions'
    ? operation.variation.values.filter(row => row.address === address) : [];
  if (!radius && (rows.length > 1 || drivers.length > 0)) throw Error('Selecciona la cota exacta que quieres quitar.');
  return withFeaturePatternSketchDimension(feature, features, address, rows.length === 1 ? rows[0].constraintId : radius?.constraintId ?? '', null);
}

/** Explicit choice; never infer a missing reference policy from seed geometry. */
export function withFeaturePatternWorldLimit(feature: RepetitionFeature, featureId: string, enabled: boolean,
  path: 'endCondition.target' | 'secondDirection.endCondition.target' = 'endCondition.target'): RepetitionFeature {
  if (!feature.featurePattern || feature.featurePattern.mode !== 'regenerate' || feature.source.mode !== 'features'
    || !feature.source.featureIds.includes(featureId) || typeof enabled !== 'boolean') {
    throw new Error('El plano límite fijo requiere una operación semilla y recálculo explícitos.')
  }
  const next = structuredClone(feature), operation = next.featurePattern!
  if (operation.mode !== 'regenerate') throw new Error('El método debe recalcular operaciones.')
  operation.referencePolicies = operation.referencePolicies.filter(policy => policy.featureId !== featureId || policy.path !== path)
  if (enabled) operation.referencePolicies.push({ featureId, path, placement: 'world' })
  return next
}
