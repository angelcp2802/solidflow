import type { BodyReference, RepetitionFeature } from '../cad/kernel.types'
import { bodyPatternAddresses } from './bodyPatterns'
import { validRecipeAutoCaptureFingerprint, type RecipeAutoScopeIntent } from './featureRecipeAutoScope'
import type { RecipeScopeIntent } from './featureRecipes'
import { isRecipeInstanceDepth, MAX_RECIPE_DEPTH_VALUES, type RecipeInstanceDepthVariation } from './featureRecipeDepthVariation'
import { isRecipeSketchDimensionValue, MAX_RECIPE_SKETCH_DIMENSIONS, MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE, type RecipeSketchDimensionVariation } from './featureRecipeSketchVariation'

/** One exact historical feature output, routed to current owned targets. */
export interface FeaturePatternBinding {
  source: BodyReference
  targetBodyIds: string[]
}

interface FeaturePatternRoutes {
  targets: BodyReference[]
  bindings: FeaturePatternBinding[]
}

/** Explicit intent for an external principal-plane end reference. */
export interface FeaturePatternReferencePolicy {
  featureId: string
  path: 'endCondition.target' | 'secondDirection.endCondition.target'
  placement: 'world'
}

/** Saved geometry copying and regeneration have distinct, explicit contracts. */
export type SelectedFeaturePatternOperation = FeaturePatternRoutes & (
  | { mode: 'geometry' }
  | { mode: 'regenerate'; scope: 'selected'; referencePolicies: FeaturePatternReferencePolicy[]; variation: { kind: 'none' } | RecipeInstanceDepthVariation | RecipeSketchDimensionVariation }
)
export interface AllFeaturePatternBinding { source: BodyReference; targetBodyIds: 'scope' }
export interface AllFeaturePatternOperation {
  mode: 'regenerate'
  scope: 'all'
  reevaluateAt: 'patternInput'
  bindings: AllFeaturePatternBinding[]
  referencePolicies: FeaturePatternReferencePolicy[]
  variation: { kind: 'none' }
  /** Type-level absence only; raw validation rejects an own targets field. */
  targets?: never
}
export interface AutoFeaturePatternOperation extends Omit<AllFeaturePatternOperation, 'scope' | 'reevaluateAt'>, Omit<RecipeAutoScopeIntent, 'mode'> {
  scope: 'auto'
}
export type FeaturePatternOperation = SelectedFeaturePatternOperation | AllFeaturePatternOperation | AutoFeaturePatternOperation
export type AnyFeaturePatternBinding = FeaturePatternBinding | AllFeaturePatternBinding
export const isAllFeaturePattern = (operation: FeaturePatternOperation): operation is AllFeaturePatternOperation =>
  operation.mode === 'regenerate' && operation.scope === 'all'
export const isAutoFeaturePattern = (operation: FeaturePatternOperation): operation is AutoFeaturePatternOperation =>
  operation.mode === 'regenerate' && operation.scope === 'auto'
export const isDynamicFeaturePattern = (operation: FeaturePatternOperation): operation is AllFeaturePatternOperation | AutoFeaturePatternOperation =>
  isAllFeaturePattern(operation) || isAutoFeaturePattern(operation)

/** Saved intent only; exact current refs still come from the native catalog. */
export function sourceRecipeScopeIntent(operation: FeaturePatternOperation): RecipeScopeIntent {
  if (isAllFeaturePattern(operation)) return { mode: 'all', reevaluateAt: 'patternInput' }
  if (isAutoFeaturePattern(operation)) return { mode: 'auto', capturedBodyIds: [...operation.capturedBodyIds],
    captureFingerprint: operation.captureFingerprint, follow: operation.follow }
  if (operation.mode !== 'regenerate') throw Error('El ámbito de receta requiere recalcular operaciones.')
  return { mode: 'selected', targets: operation.targets.map(reference => ({ ...reference })) }
}

export const MAX_FEATURE_PATTERN_TARGETS = 32
export const MAX_FEATURE_PATTERN_CONTRIBUTIONS = 512
export const MAX_FEATURE_PATTERN_APPLICATIONS = 512

const identifier = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value)
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const exact = (value: Record<string, unknown>, fields: readonly string[]) => Reflect.ownKeys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field))
const dense = (value: unknown, minimum: number, maximum: number): value is unknown[] => Array.isArray(value)
  && Object.getPrototypeOf(value) === Array.prototype && value.length >= minimum && value.length <= maximum
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    return !!descriptor?.enumerable && Object.hasOwn(descriptor, 'value')
  }).every(Boolean)
const reference = (value: unknown): value is BodyReference => object(value) && exact(value, ['bodyId', 'sourceFeatureId'])
  && identifier(value.bodyId) && identifier(value.sourceFeatureId)

export function activeFeaturePatternAddresses(feature: RepetitionFeature): string[] {
  const addresses = bodyPatternAddresses(feature)
  if (feature.type === 'mirror') return addresses
  if (!Object.hasOwn(feature, 'skipped') || !dense(feature.skipped, 0, addresses.length)) throw new Error('La lista de instancias omitidas no es válida.')
  const domain = new Set(addresses), omitted = new Set<string>()
  for (const skip of feature.skipped) {
    const address = feature.type === 'linearPattern'
      ? dense(skip, 2, 2) && skip.every(value => Number.isInteger(value)) ? `${skip[0]},${skip[1]}` : ''
      : typeof skip === 'number' && Number.isInteger(skip) ? String(skip) : ''
    if (!domain.has(address) || omitted.has(address)) throw new Error('La lista de omisiones contiene una instancia inexistente o duplicada.')
    omitted.add(address)
  }
  if (omitted.size === addresses.length) throw new Error('Debe quedar al menos una copia activa.')
  return addresses.filter(address => !omitted.has(address))
}

const ownData = (record: object, field: PropertyKey): PropertyDescriptor | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(record, field)
  return descriptor?.enumerable && Object.hasOwn(descriptor, 'value') ? descriptor : undefined
}

function validVariation(value: unknown, all: boolean, seedIds: ReadonlySet<string>, addresses: readonly string[]): boolean {
  if (!object(value)) return false
  const kind = ownData(value, 'kind')?.value
  if (kind === 'none') return exact(value, ['kind'])
  if (kind === 'sketchDimensions') {
    if (all || seedIds.size !== 1 || !exact(value, ['kind', 'values'])) return false
    const rows: unknown = ownData(value, 'values')?.value
    if (!dense(rows, 1, Math.min(MAX_RECIPE_SKETCH_DIMENSIONS, MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE * addresses.length))) return false
    const seen = new Map<string, Set<string>>(), active = new Set(addresses)
    for (let index = 0; index < rows.length; index++) {
      const row: unknown = ownData(rows, index)?.value
      if (!object(row) || !exact(row, ['address', 'sketchId', 'constraintId', 'value'])) return false
      const address = ownData(row, 'address')?.value, constraintId = ownData(row, 'constraintId')?.value
      if (typeof address !== 'string' || !active.has(address)
        || !identifier(ownData(row, 'sketchId')?.value) || !identifier(constraintId)
        || !isRecipeSketchDimensionValue(ownData(row, 'value')?.value)) return false
      const ids = seen.get(address) ?? new Set<string>()
      if (ids.has(constraintId) || ids.size >= MAX_RECIPE_SKETCH_DIMENSIONS_PER_INSTANCE) return false
      ids.add(constraintId)
      seen.set(address, ids)
    }
    return true
  }
  if (all || kind !== 'dimensions' || seedIds.size !== 1 || !exact(value, ['kind', 'values'])) return false
  const rows: unknown = ownData(value, 'values')?.value
  if (!dense(rows, 1, Math.min(MAX_RECIPE_DEPTH_VALUES, addresses.length))) return false
  const active = new Set(addresses), seen = new Set<string>()
  for (let index = 0; index < rows.length; index++) {
    const row: unknown = ownData(rows, index)?.value
    if (!object(row) || !exact(row, ['address', 'featureId', 'parameter', 'value'])) return false
    const address: unknown = ownData(row, 'address')?.value, featureId: unknown = ownData(row, 'featureId')?.value
    if (typeof address !== 'string' || !active.has(address) || seen.has(address)
      || typeof featureId !== 'string' || !seedIds.has(featureId) || ownData(row, 'parameter')?.value !== 'depth'
      || !isRecipeInstanceDepth(ownData(row, 'value')?.value)) return false
    seen.add(address)
  }
  return true
}

function declaration(feature: RepetitionFeature): FeaturePatternOperation | undefined {
  if (!('featurePattern' in feature)) return undefined
  if (!Object.hasOwn(feature, 'featurePattern') || !object(feature.featurePattern)) throw new Error('La repetición de operaciones requiere una declaración explícita propia.')
  if ('bodyPattern' in feature) throw new Error('Las operaciones de cuerpos y de aportaciones geométricas son mutuamente excluyentes.')
  const source = feature.source
  if (!Object.hasOwn(feature, 'source') || !object(source) || !exact(source, ['mode', 'geometryPattern', 'featureIds'])
    || source.mode !== 'features' || typeof source.geometryPattern !== 'boolean' || !dense(source.featureIds, 1, 32)) {
    throw new Error('La repetición explícita requiere entre 1 y 32 operaciones y un método de repetición válido.')
  }
  const seeds = new Set<string>()
  for (const id of source.featureIds) {
    if (!identifier(id) || seeds.has(id)) throw new Error('Las operaciones semilla deben tener identificadores únicos y válidos.')
    seeds.add(id)
  }
  const operation = feature.featurePattern
  if (Object.values(Object.getOwnPropertyDescriptors(operation)).some(field => !Object.hasOwn(field, 'value') || !field.enumerable)) {
    throw Error('La declaración de repetición debe contener sólo datos propios enumerables.')
  }
  const geometry = operation.mode === 'geometry', regenerate = operation.mode === 'regenerate'
  const all = regenerate && operation.scope === 'all', auto = regenerate && operation.scope === 'auto', dynamic = all || auto
  const fields = regenerate ? auto ? ['mode', 'scope', 'capturedBodyIds', 'captureFingerprint', 'follow', 'bindings', 'referencePolicies', 'variation']
    : all ? ['mode', 'scope', 'reevaluateAt', 'bindings', 'referencePolicies', 'variation']
    : ['mode', 'scope', 'targets', 'bindings', 'referencePolicies', 'variation'] : ['mode', 'targets', 'bindings']
  if ((!geometry && !regenerate) || !exact(operation, fields) || source.geometryPattern !== geometry
    || !dynamic && !dense(operation.targets, 1, MAX_FEATURE_PATTERN_TARGETS)
    || !dense(operation.bindings, 1, MAX_FEATURE_PATTERN_CONTRIBUTIONS)) throw new Error('El método debe coincidir con la geometría o el recálculo y declarar destinos y estados exactos.')
  const addresses = activeFeaturePatternAddresses(feature)
  const policyTable = Object.getOwnPropertyDescriptor(operation, 'referencePolicies')
  if (regenerate && ((!dynamic && operation.scope !== 'selected') || all && operation.reevaluateAt !== 'patternInput'
    || !policyTable || !Object.hasOwn(policyTable, 'value') || !policyTable.enumerable || !dense(policyTable.value, 0, 32)
    || !validVariation(ownData(operation, 'variation')?.value, dynamic, seeds, addresses))) {
    throw new Error('El recálculo requiere un alcance explícito y políticas de límites válidas. La variación requiere una semilla, cuerpos seleccionados e instancias activas distintas.')
  }
  if (auto && (!dense(operation.capturedBodyIds, 1, 256) || operation.capturedBodyIds.some(id => !identifier(id))
    || new Set(operation.capturedBodyIds).size !== operation.capturedBodyIds.length
    || !validRecipeAutoCaptureFingerprint(operation.captureFingerprint) || operation.follow !== 'sameIdentityAtPatternInput')) {
    throw new Error('AUTO requiere identidades capturadas únicas, procedencia explícita y seguimiento de la misma identidad.')
  }
  if (regenerate) {
    const policies = policyTable!.value as unknown[], used = new Set<string>()
    for (let index = 0; index < policies.length; index++) {
      const entry = Object.getOwnPropertyDescriptor(policies, String(index))
      if (!entry || !Object.hasOwn(entry, 'value') || !entry.enumerable) throw new Error('Las políticas de límites deben contener datos propios enumerables.')
      const policy: unknown = entry.value
      if (!object(policy) || !exact(policy, ['featureId', 'path', 'placement'])
        || Object.values(Object.getOwnPropertyDescriptors(policy)).some(field => !Object.hasOwn(field, 'value') || !field.enumerable)
        || !identifier(policy.featureId) || !seeds.has(policy.featureId) || used.has(JSON.stringify([policy.featureId, policy.path]))
        || !['endCondition.target', 'secondDirection.endCondition.target'].includes(policy.path as string) || policy.placement !== 'world') {
        throw new Error('Cada plano límite fijo requiere una política explícita y única de una operación semilla.')
      }
      used.add(JSON.stringify([policy.featureId, policy.path]))
    }
  }
  const targets = new Set<string>()
  for (const target of dynamic ? [] : operation.targets as unknown[]) {
    if (!reference(target) || targets.has(target.bodyId)) throw new Error('Los destinos deben ser referencias exactas de cuerpos distintos.')
    targets.add(target.bodyId)
  }
  const contributions = new Set<string>(), representedSeeds = new Set<string>(), routedTargets = new Set<string>()
  let routes = 0
  for (const binding of operation.bindings) {
    if (!object(binding) || !exact(binding, ['source', 'targetBodyIds']) || !reference(binding.source)
      || !seeds.has(binding.source.sourceFeatureId) || (dynamic ? binding.targetBodyIds !== 'scope' : !dense(binding.targetBodyIds, 1, MAX_FEATURE_PATTERN_TARGETS))) {
      throw new Error('Cada aportación debe pertenecer a una operación seleccionada y declarar destinos exactos.')
    }
    const key = JSON.stringify([binding.source.bodyId, binding.source.sourceFeatureId])
    if (contributions.has(key)) throw new Error('Una aportación histórica exacta no puede repetirse.')
    contributions.add(key); representedSeeds.add(binding.source.sourceFeatureId)
    if (dynamic) { routes++; continue }
    const local = new Set<string>()
    for (const bodyId of binding.targetBodyIds as unknown[]) {
      if (!identifier(bodyId) || !targets.has(bodyId) || local.has(bodyId)) throw new Error('Una ruta contiene un destino desconocido o duplicado.')
      local.add(bodyId); routedTargets.add(bodyId); routes++
    }
  }
  if (representedSeeds.size !== seeds.size || !dynamic && routedTargets.size !== targets.size) throw new Error('Todas las semillas y destinos seleccionados deben tener una ruta explícita.')
  if (addresses.length * routes > MAX_FEATURE_PATTERN_APPLICATIONS) throw new Error('La repetición supera el límite de 512 aplicaciones de aportaciones a destinos.')
  return operation as unknown as FeaturePatternOperation
}

/** Raw and saved validation; absence preserves the legacy grammar. Allocates no IDs. */
export function validateFeaturePatternDeclaration(feature: RepetitionFeature): void {
  declaration(feature)
}

/** Counts every active transform/source/target route, including a possible no-op route. */
export function featurePatternApplications(feature: RepetitionFeature, currentTargetCount?: number): number {
  const operation = declaration(feature)
  if (operation && isDynamicFeaturePattern(operation)) {
    if (!Number.isInteger(currentTargetCount) || currentTargetCount! < 1 || currentTargetCount! > 256) throw new Error('ALL requiere resolver entre 1 y 256 cuerpos actuales.')
    const applications = activeFeaturePatternAddresses(feature).length * operation.bindings.length * currentTargetCount!
    if (isAutoFeaturePattern(operation) && currentTargetCount !== operation.capturedBodyIds.length) throw Error('AUTO requiere resolver todas sus identidades capturadas.')
    if (applications > MAX_FEATURE_PATTERN_APPLICATIONS) throw new Error('La repetición supera el límite de 512 aplicaciones de aportaciones a destinos.')
    return applications
  }
  return operation ? activeFeaturePatternAddresses(feature).length * operation.bindings.reduce((sum, binding) => sum + binding.targetBodyIds.length, 0) : 0
}

/** Detached historical inputs; two states of the same body remain distinct. */
export function featurePatternSourceReferences(feature: RepetitionFeature): BodyReference[] {
  return declaration(feature)?.bindings.map(binding => ({ ...binding.source })) ?? []
}
