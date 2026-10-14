import type { BodyReference, RepetitionFeature } from '../cad/kernel.types'
import { bodyPatternAddresses } from './bodyPatterns'

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
  path: 'endCondition.target'
  placement: 'world'
}

/** Saved geometry copying and regeneration have distinct, explicit contracts. */
export type SelectedFeaturePatternOperation = FeaturePatternRoutes & (
  | { mode: 'geometry' }
  | { mode: 'regenerate'; scope: 'selected'; referencePolicies: FeaturePatternReferencePolicy[]; variation: { kind: 'none' } }
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
export type FeaturePatternOperation = SelectedFeaturePatternOperation | AllFeaturePatternOperation
export type AnyFeaturePatternBinding = FeaturePatternBinding | AllFeaturePatternBinding
export const isAllFeaturePattern = (operation: FeaturePatternOperation): operation is AllFeaturePatternOperation =>
  operation.mode === 'regenerate' && operation.scope === 'all'

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
  && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean)
const reference = (value: unknown): value is BodyReference => object(value) && exact(value, ['bodyId', 'sourceFeatureId'])
  && identifier(value.bodyId) && identifier(value.sourceFeatureId)

function activeCopies(feature: RepetitionFeature): number {
  const addresses = bodyPatternAddresses(feature)
  if (feature.type === 'mirror') return 1
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
  return addresses.length - omitted.size
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
  const geometry = operation.mode === 'geometry', regenerate = operation.mode === 'regenerate'
  const all = regenerate && operation.scope === 'all'
  const fields = regenerate ? all ? ['mode', 'scope', 'reevaluateAt', 'bindings', 'referencePolicies', 'variation']
    : ['mode', 'scope', 'targets', 'bindings', 'referencePolicies', 'variation'] : ['mode', 'targets', 'bindings']
  if ((!geometry && !regenerate) || !exact(operation, fields) || source.geometryPattern !== geometry
    || !all && !dense(operation.targets, 1, MAX_FEATURE_PATTERN_TARGETS)
    || !dense(operation.bindings, 1, MAX_FEATURE_PATTERN_CONTRIBUTIONS)) throw new Error('El método debe coincidir con la geometría o el recálculo y declarar destinos y estados exactos.')
  const policyTable = Object.getOwnPropertyDescriptor(operation, 'referencePolicies')
  if (regenerate && ((!all && operation.scope !== 'selected') || all && operation.reevaluateAt !== 'patternInput'
    || !policyTable || !Object.hasOwn(policyTable, 'value') || !policyTable.enumerable || !dense(policyTable.value, 0, 32)
    || !object(operation.variation) || !exact(operation.variation, ['kind']) || operation.variation.kind !== 'none')) {
    throw new Error('El recálculo requiere un alcance explícito seleccionado o ALL, políticas de límites válidas y ninguna variación de cotas.')
  }
  if (regenerate) {
    const policies = policyTable!.value as unknown[], used = new Set<string>()
    for (let index = 0; index < policies.length; index++) {
      const entry = Object.getOwnPropertyDescriptor(policies, String(index))
      if (!entry || !Object.hasOwn(entry, 'value') || !entry.enumerable) throw new Error('Las políticas de límites deben contener datos propios enumerables.')
      const policy: unknown = entry.value
      if (!object(policy) || !exact(policy, ['featureId', 'path', 'placement'])
        || Object.values(Object.getOwnPropertyDescriptors(policy)).some(field => !Object.hasOwn(field, 'value') || !field.enumerable)
        || !identifier(policy.featureId) || !seeds.has(policy.featureId) || used.has(policy.featureId)
        || policy.path !== 'endCondition.target' || policy.placement !== 'world') {
        throw new Error('Cada plano límite fijo requiere una política explícita y única de una operación semilla.')
      }
      used.add(policy.featureId)
    }
  }
  const targets = new Set<string>()
  for (const target of all ? [] : operation.targets as unknown[]) {
    if (!reference(target) || targets.has(target.bodyId)) throw new Error('Los destinos deben ser referencias exactas de cuerpos distintos.')
    targets.add(target.bodyId)
  }
  const contributions = new Set<string>(), representedSeeds = new Set<string>(), routedTargets = new Set<string>()
  let routes = 0
  for (const binding of operation.bindings) {
    if (!object(binding) || !exact(binding, ['source', 'targetBodyIds']) || !reference(binding.source)
      || !seeds.has(binding.source.sourceFeatureId) || (all ? binding.targetBodyIds !== 'scope' : !dense(binding.targetBodyIds, 1, MAX_FEATURE_PATTERN_TARGETS))) {
      throw new Error('Cada aportación debe pertenecer a una operación seleccionada y declarar destinos exactos.')
    }
    const key = JSON.stringify([binding.source.bodyId, binding.source.sourceFeatureId])
    if (contributions.has(key)) throw new Error('Una aportación histórica exacta no puede repetirse.')
    contributions.add(key); representedSeeds.add(binding.source.sourceFeatureId)
    if (all) { routes++; continue }
    const local = new Set<string>()
    for (const bodyId of binding.targetBodyIds as unknown[]) {
      if (!identifier(bodyId) || !targets.has(bodyId) || local.has(bodyId)) throw new Error('Una ruta contiene un destino desconocido o duplicado.')
      local.add(bodyId); routedTargets.add(bodyId); routes++
    }
  }
  if (representedSeeds.size !== seeds.size || !all && routedTargets.size !== targets.size) throw new Error('Todas las semillas y destinos seleccionados deben tener una ruta explícita.')
  if (activeCopies(feature) * routes > MAX_FEATURE_PATTERN_APPLICATIONS) throw new Error('La repetición supera el límite de 512 aplicaciones de aportaciones a destinos.')
  return operation as unknown as FeaturePatternOperation
}

/** Raw and saved validation; absence preserves the legacy grammar. Allocates no IDs. */
export function validateFeaturePatternDeclaration(feature: RepetitionFeature): void {
  declaration(feature)
}

/** Counts every active transform/source/target route, including a possible no-op route. */
export function featurePatternApplications(feature: RepetitionFeature, currentTargetCount?: number): number {
  const operation = declaration(feature)
  if (operation && isAllFeaturePattern(operation)) {
    if (!Number.isInteger(currentTargetCount) || currentTargetCount! < 1 || currentTargetCount! > 256) throw new Error('ALL requiere resolver entre 1 y 256 cuerpos actuales.')
    const applications = activeCopies(feature) * operation.bindings.length * currentTargetCount!
    if (applications > MAX_FEATURE_PATTERN_APPLICATIONS) throw new Error('La repetición supera el límite de 512 aplicaciones de aportaciones a destinos.')
    return applications
  }
  return operation ? activeCopies(feature) * operation.bindings.reduce((sum, binding) => sum + binding.targetBodyIds.length, 0) : 0
}

/** Detached historical inputs; two states of the same body remain distinct. */
export function featurePatternSourceReferences(feature: RepetitionFeature): BodyReference[] {
  return declaration(feature)?.bindings.map(binding => ({ ...binding.source })) ?? []
}
