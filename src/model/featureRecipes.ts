/**
 * Declaration extraction for per-instance feature recipes; no native evaluator.
 * Original project code. Features must come from the document parser; this is
 * not a replacement for complete schema/constraint validation. Closure failures
 * remain attributable to a feature/path, and bounded copying rejects getters.
 */
import type {
  BodyReference, FaceReference, Feature, PlaneFrame, PlaneSupport, Profile, Vec3,
} from '../cad/kernel.types';
import { featureDependencyIds } from './featureInputs';
import { principalPlaneFrame } from '../cad/kernel.frames';

export const RECIPE_LIMITS = Object.freeze({
  sourceFeatures: 32, targets: 32, dynamicTargets: 256, bindings: 512, applications: 512,
  closureDefinitions: 256, dependencyEdges: 2048, jsonNodes: 50_000, jsonDepth: 64,
  /** UTF-16 code units, aggregated across copied record field names and string values.
   * The final canonical fingerprint is independently bounded by the same cap. */
  documentPrefix: 100_000, jsonCharacters: 1_000_000,
});

export interface RecipeDiagnostic {
  code: string;
  featureId: string;
  path: string;
  message: string;
  kind: 'invalid' | 'pending';
}
export class RecipeClosureError extends Error {
  constructor(readonly diagnostics: readonly RecipeDiagnostic[]) {
    super(diagnostics.map(item => `${item.featureId}:${item.path}: ${item.message}`).join('\n'));
    this.name = 'RecipeClosureError';
  }
}
function invalid(code: string, featureId: string, path: string, message: string): never {
  throw new RecipeClosureError([{ code, featureId, path, message, kind: 'invalid' }]);
}
const textOrder = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const exactStateKey = (ref: BodyReference): string => JSON.stringify([ref.bodyId, ref.sourceFeatureId]);
const locatorKey = (featureId: string, path: string): string => JSON.stringify([featureId, path]);
function recordKeys(value: unknown, featureId: string, path: string, required: string[], optional: string[] = []): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
    invalid('RECIPE_RECORD', featureId, path, 'Expected an exact plain recipe record with all required own fields.');
  }
}
const stringId = (value: unknown, featureId: string, path: string): string => {
  if (typeof value !== 'string' || !value.trim().length || value.length > 1024) {
    invalid('INVALID_ID', featureId, path, 'Expected a nonempty bounded saved identity; preserve its exact opaque value.');
  }
  return value;
};
const ref = (value: BodyReference, featureId: string, path: string): BodyReference => {
  recordKeys(value, featureId, path, ['bodyId', 'sourceFeatureId']);
  return { bodyId: stringId(value.bodyId, featureId, `${path}.bodyId`),
    sourceFeatureId: stringId(value.sourceFeatureId, featureId, `${path}.sourceFeatureId`) };
};

/** Recipe extraction request; it is NOT accepted by the current document parser. */
export type RecipeScopeIntent =
  | { mode: 'selected'; targets: BodyReference[] }
  | { mode: 'all'; reevaluateAt: 'patternInput' }
  | { mode: 'auto'; capturedBodyIds: string[]; captureFingerprint: string; follow: 'sameIdentityAtPatternInput' };
export interface RecipeBinding {
  source: BodyReference;
  /** 'scope' preserves dynamic intent; an expanded list must not impersonate all/auto. */
  targets: string[] | 'scope';
}
export interface RecipeReferencePolicy {
  featureId: string;
  /** Stable schema locator: 'support' or 'endCondition.target'. */
  path: string;
  placement: 'world' | 'transform' | 'instance';
  /** FaceReference has no body ID: this association must be explicit, then native-attested. */
  owner?: BodyReference;
  /** Required for an instance face: select a parent owner route, never nearest/latest. */
  parentTargetBodyId?: string;
}
export type RecipeVariation =
  | { kind: 'none' }
  | { kind: 'varySketch'; sketchIds: string[]; drivingConstraintIds: string[] }
  | { kind: 'dimensions'; values: { address: string; featureId: string; parameter: string; value: number }[] };
export interface RegenerationRequest {
  mode: 'regenerate';
  geometryPattern: false;
  patternId: string;
  patternKind: 'linearPattern' | 'circularPattern' | 'mirror';
  /** Trusted engine/draft boundary, not a persisted ordinal or source predecessor substitute. */
  beforeFeatureIndex: number;
  sourceFeatureIds: string[];
  /** Existing canonical plan: full placements and structure both affect preview identity. */
  plan: { transforms: RecipeInstanceTransform[]; structure: unknown };
  scope: RecipeScopeIntent;
  /** Preview-only exact current snapshot; dynamic intent is never replaced by it. */
  targetSnapshot: BodyReference[];
  bindings: RecipeBinding[];
  referencePolicies: RecipeReferencePolicy[];
  variation: RecipeVariation;
}
export interface RecipeDefinition {
  feature: Feature;
  historyOrder: number;
  role: 'selected-operation' | 'definition-only';
}
export interface RecipeDependency { consumerId: string; producerId: string }
export interface RecipeOwnerApplication {
  sourcePoststate: BodyReference;
  sourceInput: BodyReference | null;
  targetAtPatternInput: BodyReference;
  /** A semantic edge; native evaluation must attest the actual virtual output. */
  selectedParent?: { sourcePoststate: BodyReference; targetBodyId: string; outputRole: 'body' };
}
export type RecipeTermination =
  | { kind: 'blind'; signedDepth: number; symmetric: boolean }
  | { kind: 'throughAll'; bothDirections: boolean; baseFeatureId: string }
  | { kind: 'untilNext'; baseFeatureId: string }
  | { kind: 'upToSurface'; target: PlaneSupport; policy: RecipeReferencePolicy };
export interface RecipeOperation {
  featureId: string;
  type: Feature['type'];
  sketchId: string | null;
  termination: RecipeTermination | null;
  applications: RecipeOwnerApplication[];
}
export type RecipeNativeRequirement =
  | { kind: 'materialized-source' | 'current-target'; ref: BodyReference }
  /** Opaque exact reference, not a coordinate/face search. */
  | { kind: 'exact-face'; ref: BodyReference; face: FaceReference }
  | { kind: 'exact-plane'; planeId: string };
export interface RecipeClosure {
  request: RegenerationRequest;
  definitions: RecipeDefinition[];
  dependencies: RecipeDependency[];
  operations: RecipeOperation[];
  nativeRequirements: RecipeNativeRequirement[];
  diagnostics: RecipeDiagnostic[];
  eligibility: 'initial-declaration-subset' | 'pending-capability';
  /** Canonical data, not a hash or native availability proof. Hash at the trusted preview boundary. */
  fingerprintInput: string;
}

function boundedClone<T>(value: T, context: string, budget: { remaining: number; characters?: number }): T {
  budget.characters ??= RECIPE_LIMITS.jsonCharacters;
  const active = new WeakSet<object>();
  const chargeCharacters = (length: number, path: string): void => {
    budget.characters = (budget.characters ?? RECIPE_LIMITS.jsonCharacters) - length;
    if (budget.characters < 0) invalid('RECIPE_DATA_BUDGET', context, path, 'Recipe record field names and string values exceed the UTF-16 extraction envelope.');
  };
  const visit = (item: unknown, path: string, depth: number): unknown => {
    if (--budget.remaining < 0 || depth > RECIPE_LIMITS.jsonDepth) {
      invalid('RECIPE_DATA_BUDGET', context, path, 'Recipe data exceeds its bounded extraction envelope.');
    }
    if (typeof item === 'string') {
      chargeCharacters(item.length, path);
      return item;
    }
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object') invalid('NON_JSON_RECIPE', context, path, 'Only finite, plain saved data is accepted.');
    const object = item as object;
    if (active.has(object)) invalid('CYCLIC_RECIPE_DATA', context, path, 'Saved data cannot contain object cycles.');
    active.add(object);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(object);
      if (Object.getOwnPropertySymbols(object).length) invalid('NON_JSON_RECIPE', context, path, 'Symbol keys are not saved inputs.');
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype) invalid('NON_JSON_RECIPE', context, path, 'Recipe arrays must use the plain array prototype.');
        const keys = Object.keys(descriptors).filter(key => key !== 'length');
        if (keys.length !== item.length) invalid('SPARSE_RECIPE_ARRAY', context, path, 'Arrays must be dense and have no extra properties.');
        const result: unknown[] = [];
        for (let index = 0; index < item.length; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) invalid('NON_JSON_RECIPE', context, path, 'Array accessors or hidden operands are not saved data.');
          result.push(visit(descriptor.value, `${path}[${index}]`, depth + 1));
        }
        return result;
      }
      const prototype = Object.getPrototypeOf(object);
      if (prototype !== Object.prototype && prototype !== null) invalid('NON_JSON_RECIPE', context, path, 'Recipe records must be plain objects.');
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(descriptors).sort(textOrder)) {
        const descriptor = descriptors[key];
        if (!('value' in descriptor) || !descriptor.enumerable || key === '__proto__') invalid('NON_JSON_RECIPE', context, path, 'Accessors, hidden fields and prototype mutation are not recipe data.');
        // Charge before constructing a path containing the potentially large key.
        chargeCharacters(key.length, path);
        result[key] = visit(descriptor.value, `${path}.${key}`, depth + 1);
      }
      return result;
    } finally { active.delete(object); }
  };
  return visit(value, '$', 0) as T;
}
function freezeTree<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
function canonical(value: unknown): string {
  // Detached plain data only. Bound serialized punctuation/escaping/duplication
  // as well as the earlier copied-input character budget; no oversized join.
  const chunks: string[] = [];
  let remaining: number = RECIPE_LIMITS.jsonCharacters;
  const append = (chunk: string): void => {
    remaining -= chunk.length;
    if (remaining < 0) invalid('RECIPE_DATA_BUDGET', '(fingerprint)', '$', 'Canonical recipe data exceeds the UTF-16 fingerprint envelope.');
    chunks.push(chunk);
  };
  const visit = (item: unknown): void => {
    if (item === null || typeof item !== 'object') {
      const encoded = JSON.stringify(item);
      if (encoded === undefined) invalid('NON_JSON_RECIPE', '(fingerprint)', '$', 'Fingerprint data must be plain saved data.');
      append(encoded);
    } else if (Array.isArray(item)) {
      append('[');
      item.forEach((child, index) => { if (index) append(','); visit(child); });
      append(']');
    } else {
      append('{');
      Object.keys(item).sort(textOrder).forEach((key, index) => {
        if (index) append(',');
        append(JSON.stringify(key)); append(':'); visit((item as Record<string, unknown>)[key]);
      });
      append('}');
    }
  };
  visit(value);
  return chunks.join('');
}
function uniqueStrings(values: string[], minimum: number, maximum: number, featureId: string, path: string): string[] {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) invalid('OPERAND_COUNT', featureId, path, `Expected ${minimum}..${maximum} operands.`);
  const result = values.map((value, index) => stringId(value, featureId, `${path}[${index}]`));
  if (new Set(result).size !== result.length) invalid('DUPLICATE_OPERAND', featureId, path, 'Saved identities/addresses cannot repeat.');
  return result;
}
function supportShape(support: PlaneSupport, featureId: string, path: string): void {
  if (!support || typeof support !== 'object' || Array.isArray(support)) invalid('SUPPORT_DECLARATION', featureId, path, 'Support must be an explicit saved reference.');
  if (support.kind === 'principal') {
    recordKeys(support, featureId, path, ['kind', 'plane']);
    if (!['XY', 'XZ', 'YZ'].includes(support.plane)) invalid('SUPPORT_DECLARATION', featureId, path, 'Unknown principal plane.');
  } else if (support.kind === 'plane') {
    recordKeys(support, featureId, path, ['kind', 'planeId']); stringId(support.planeId, featureId, `${path}.planeId`);
  } else if (support.kind === 'face') {
    recordKeys(support, featureId, path, ['kind', 'face']); recordKeys(support.face, featureId, `${path}.face`, ['sourceFeatureId', 'key']);
    stringId(support.face.sourceFeatureId, featureId, `${path}.face.sourceFeatureId`);
    if (typeof support.face.key !== 'string' || !support.face.key.length) invalid('SUPPORT_DECLARATION', featureId, `${path}.face.key`, 'Expected an unchanged opaque face key.');
  } else invalid('SUPPORT_DECLARATION', featureId, path, 'Unknown support kind.');
}

/** Extraction attests declarations only; the native requirement list remains unresolved. */
export function extractRecipeClosure(features: readonly Feature[], rawRequest: RegenerationRequest): RecipeClosure {
  const budget = { remaining: RECIPE_LIMITS.jsonNodes };
  const request = boundedClone(rawRequest, '(pattern)', budget);
  recordKeys(request, '(pattern)', '$', ['mode', 'geometryPattern', 'patternId', 'patternKind', 'beforeFeatureIndex',
    'sourceFeatureIds', 'plan', 'scope', 'targetSnapshot', 'bindings', 'referencePolicies', 'variation']);
  const patternId = stringId(request.patternId, '(pattern)', 'patternId');
  if (request.mode !== 'regenerate' || request.geometryPattern !== false) invalid('MODE_MISMATCH', patternId, 'mode', 'Regeneration requires its own explicit mode and geometryPattern:false.');
  if (!['linearPattern', 'circularPattern', 'mirror'].includes(request.patternKind)) invalid('PATTERN_KIND', patternId, 'patternKind', 'Unknown transform family.');
  if (!Array.isArray(features) || !Number.isInteger(request.beforeFeatureIndex) || request.beforeFeatureIndex < 0
    || request.beforeFeatureIndex > features.length || request.beforeFeatureIndex > RECIPE_LIMITS.documentPrefix) {
    invalid('RECIPE_BOUNDARY', patternId, 'beforeFeatureIndex', 'Recipe inputs must precede a bounded pattern-input boundary.');
  }
  const selected = uniqueStrings(request.sourceFeatureIds, 1, RECIPE_LIMITS.sourceFeatures, patternId, 'sourceFeatureIds');
  const selectedSet = new Set(selected);
  recordKeys(request.plan, patternId, 'plan', ['transforms', 'structure']);
  if (!Array.isArray(request.plan.transforms)) invalid('TRANSFORM_PLAN', patternId, 'plan.transforms', 'Supply the canonical active transform plan.');
  for (const [transformIndex, transform] of request.plan.transforms.entries()) {
    if (transform === null || typeof transform !== 'object') invalid('TRANSFORM_PLAN', patternId, 'plan.transforms', 'Transform operands must be saved records.');
    if ('translation' in transform) recordKeys(transform, patternId, 'plan.transforms', ['key', 'translation']);
    else if ('angle' in transform) recordKeys(transform, patternId, 'plan.transforms', ['key', 'angle', 'origin', 'direction']);
    else recordKeys(transform, patternId, 'plan.transforms', ['key', 'mirror']);
    try { recipeTransform(transform); }
    catch (error) {
      if (error instanceof RecipeClosureError) throw new RecipeClosureError(error.diagnostics.map(item => ({
        ...item, featureId: patternId, path: `plan.transforms[${transformIndex}].${item.path}`,
      })));
      invalid('TRANSFORM_PLAN', patternId, `plan.transforms[${transformIndex}]`, 'Transform declaration is malformed.');
    }
  }
  const addresses = uniqueStrings(request.plan.transforms.map(transform => transform.key), 1, 255, patternId, 'plan.transforms');
  for (const address of addresses) {
    const valid = request.patternKind === 'mirror' ? address === 'mirror'
      : request.patternKind === 'circularPattern' ? /^[1-9]\d*$/.test(address)
        : /^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(address) && address !== '0,0';
    if (!valid) invalid('INSTANCE_ADDRESS', patternId, 'plan.transforms', 'Expected an active canonical address from the existing transform plan.');
  }
  if (request.patternKind === 'mirror' && addresses.length !== 1) invalid('INSTANCE_ADDRESS', patternId, 'plan.transforms', 'Mirror has one extra address.');
  const index = new Map<string, { feature: Feature; order: number }>();
  for (let order = 0; order < request.beforeFeatureIndex; order++) {
    const feature = features[order];
    const id = stringId(feature?.id, patternId, `features[${order}].id`);
    if (id === patternId || index.has(id)) invalid('DUPLICATE_FEATURE', id, 'id', 'Feature IDs before the pattern must be distinct.');
    index.set(id, { feature, order });
  }
  const requireEarlier = (id: string, before: number, consumer: string, path: string) => {
    const record = index.get(id);
    if (!record || record.order >= before) invalid('MISSING_OR_FORWARD_DEPENDENCY', consumer, path, `Dependency ${id} is absent or not earlier.`);
    if (record.feature.suppressed !== false) invalid('SUPPRESSED_DEPENDENCY', consumer, path, `Dependency ${id} is suppressed or malformed.`);
    return record;
  };
  for (const id of selected) requireEarlier(id, request.beforeFeatureIndex, patternId, 'sourceFeatureIds');
  const diagnostics: RecipeDiagnostic[] = [], pendingKeys = new Set<string>();
  const pending = (code: string, featureId: string, path: string, message: string) => {
    const key = locatorKey(featureId, `${code}:${path}`);
    if (!pendingKeys.has(key)) { pendingKeys.add(key); diagnostics.push({ code, featureId, path, message, kind: 'pending' }); }
  };
  if (!request.scope || typeof request.scope !== 'object' || Array.isArray(request.scope)) invalid('SCOPE_MODE', patternId, 'scope', 'Scope must be an explicit record.');
  if (request.scope.mode === 'selected') recordKeys(request.scope, patternId, 'scope', ['mode', 'targets']);
  else if (request.scope.mode === 'all') recordKeys(request.scope, patternId, 'scope', ['mode', 'reevaluateAt']);
  else if (request.scope.mode === 'auto') recordKeys(request.scope, patternId, 'scope', ['mode', 'capturedBodyIds', 'captureFingerprint', 'follow']);
  else invalid('SCOPE_MODE', patternId, 'scope', 'Unknown scope intent.');
  if (!request.variation || typeof request.variation !== 'object' || Array.isArray(request.variation)) invalid('VARIATION_MODE', patternId, 'variation', 'Variation must be an explicit record.');
  if (request.variation.kind === 'none') recordKeys(request.variation, patternId, 'variation', ['kind']);
  else if (request.variation.kind === 'varySketch') {
    recordKeys(request.variation, patternId, 'variation', ['kind', 'sketchIds', 'drivingConstraintIds']);
    uniqueStrings(request.variation.sketchIds, 1, 32, patternId, 'variation.sketchIds');
    uniqueStrings(request.variation.drivingConstraintIds, 1, 256, patternId, 'variation.drivingConstraintIds');
  } else if (request.variation.kind === 'dimensions') {
    recordKeys(request.variation, patternId, 'variation', ['kind', 'values']);
    if (!Array.isArray(request.variation.values) || !request.variation.values.length || request.variation.values.length > 512) invalid('VARIATION_VALUES', patternId, 'variation.values', 'Provide a bounded nonempty dimension table.');
    const varied = new Set<string>();
    for (const row of request.variation.values) {
      recordKeys(row, patternId, 'variation.values', ['address', 'featureId', 'parameter', 'value']);
      const key = JSON.stringify([row.address, row.featureId, row.parameter]);
      if (!addresses.includes(row.address) || !selectedSet.has(row.featureId) || !Number.isFinite(row.value) || varied.has(key)) invalid('VARIATION_VALUES', patternId, 'variation.values', 'Dimension entries require an active address, selected feature and unique finite value.');
      stringId(row.parameter, patternId, 'variation.values.parameter'); varied.add(key);
    }
  } else invalid('VARIATION_MODE', patternId, 'variation', 'Unknown variation intent.');
  if (request.scope.mode === 'auto') pending('AUTO_DISCOVERY_PENDING', patternId, 'scope', 'Native AUTO capture/discovery and positive-operation applicability remain required; captured IDs alone do not activate this mode.');
  if (request.variation.kind !== 'none') pending('VARIATION_PENDING', patternId, 'variation', 'Constraint/dimension variation requires an instance solve and complete dependency fingerprint.');
  if (!['selected', 'all', 'auto'].includes(request.scope.mode)) invalid('SCOPE_MODE', patternId, 'scope', 'Unknown scope intent.');
  if (request.scope.mode === 'all' && request.scope.reevaluateAt !== 'patternInput') invalid('SCOPE_POLICY', patternId, 'scope', 'All requires an explicit re-evaluation moment.');
  if (request.scope.mode === 'auto') {
    uniqueStrings(request.scope.capturedBodyIds, 1, RECIPE_LIMITS.dynamicTargets, patternId, 'scope.capturedBodyIds');
    stringId(request.scope.captureFingerprint, patternId, 'scope.captureFingerprint');
    if (request.scope.follow !== 'sameIdentityAtPatternInput') invalid('SCOPE_POLICY', patternId, 'scope.follow', 'Auto must name its identity-following policy.');
  }
  const targetLimit = request.scope.mode === 'selected' ? RECIPE_LIMITS.targets : RECIPE_LIMITS.dynamicTargets;
  if (!Array.isArray(request.targetSnapshot) || !request.targetSnapshot.length || request.targetSnapshot.length > targetLimit) invalid('TARGET_COUNT', patternId, 'targetSnapshot', `Provide 1..${targetLimit} exact current preview targets.`);
  const targets = new Map<string, BodyReference>();
  for (const target of request.targetSnapshot) {
    const exact = ref(target, patternId, 'targetSnapshot');
    requireEarlier(exact.sourceFeatureId, request.beforeFeatureIndex, patternId, 'targetSnapshot');
    if (targets.has(exact.bodyId)) invalid('DUPLICATE_TARGET', patternId, 'targetSnapshot', 'Only one exact current state per target body is permitted.');
    targets.set(exact.bodyId, exact);
  }
  if (request.scope.mode === 'selected') {
    if (!Array.isArray(request.scope.targets) || request.scope.targets.length !== targets.size) invalid('TARGET_SCOPE_MISMATCH', patternId, 'scope.targets', 'Selected scope and current snapshot must match exactly.');
    const selectedKeys = request.scope.targets.map(target => exactStateKey(ref(target, patternId, 'scope.targets')));
    if (new Set(selectedKeys).size !== targets.size || [...targets.values()].some(target => !selectedKeys.includes(exactStateKey(target)))) invalid('TARGET_SCOPE_MISMATCH', patternId, 'scope.targets', 'Selected references cannot silently follow another state.');
  } else if (request.scope.mode === 'auto') {
    const autoScope = request.scope;
    if (autoScope.capturedBodyIds.some(id => !targets.has(id)) || [...targets.keys()].some(id => !autoScope.capturedBodyIds.includes(id))) {
      invalid('AUTO_MEMBER_UNAVAILABLE', patternId, 'scope.capturedBodyIds', 'A captured identity is unavailable or the snapshot silently added a new identity.');
    }
  }
  if (!Array.isArray(request.bindings) || !request.bindings.length || request.bindings.length > RECIPE_LIMITS.bindings) invalid('BINDING_COUNT', patternId, 'bindings', 'Provide a bounded nonempty exact source routing table.');
  const routes = new Map<string, string[]>(), bindingSources = new Map<string, BodyReference>();
  let applications = 0;
  for (const binding of request.bindings) {
    recordKeys(binding, patternId, 'bindings', ['source', 'targets']);
    const source = ref(binding.source, patternId, 'bindings.source'), key = exactStateKey(source);
    if (!selectedSet.has(source.sourceFeatureId) || routes.has(key)) invalid('SOURCE_BINDING', patternId, 'bindings.source', 'Each exact binding must identify one distinct selected poststate.');
    let targetIds: string[];
    if (binding.targets === 'scope') {
      if (request.scope.mode === 'selected') invalid('SCOPE_ROUTE_MISMATCH', patternId, 'bindings.targets', 'A selected binding must store its explicit routes.');
      targetIds = [...targets.keys()].sort(textOrder);
    } else {
      if (request.scope.mode !== 'selected') invalid('SCOPE_ROUTE_MISMATCH', patternId, 'bindings.targets', 'Dynamic intent cannot be replaced by a static selected route list.');
      targetIds = uniqueStrings(binding.targets, 1, RECIPE_LIMITS.targets, patternId, 'bindings.targets').sort(textOrder);
    }
    if (targetIds.some(id => !targets.has(id))) invalid('UNKNOWN_TARGET_ROUTE', patternId, 'bindings.targets', 'Every route must resolve in the exact current target snapshot.');
    applications += targetIds.length * addresses.length;
    if (applications > RECIPE_LIMITS.applications) invalid('APPLICATION_BUDGET', patternId, 'bindings', 'Active owner applications exceed512 before definition cloning.');
    routes.set(key, targetIds); bindingSources.set(key, source);
  }
  if (selected.some(id => ![...bindingSources.values()].some(source => source.sourceFeatureId === id))) invalid('UNBOUND_SELECTED_FEATURE', patternId, 'bindings', 'Every selected operation needs at least one exact source owner.');
  if ([...targets.keys()].some(id => ![...routes.values()].some(ids => ids.includes(id)))) invalid('UNROUTED_TARGET', patternId, 'bindings', 'Every declared target must be routed.');
  const policies = new Map<string, RecipeReferencePolicy>(), usedPolicies = new Set<string>();
  if (!Array.isArray(request.referencePolicies) || request.referencePolicies.length > RECIPE_LIMITS.dependencyEdges) invalid('REFERENCE_POLICY', patternId, 'referencePolicies', 'Reference policies need a bounded dense table.');
  for (const policy of request.referencePolicies) {
    recordKeys(policy, patternId, 'referencePolicies', ['featureId', 'path', 'placement'], ['owner', 'parentTargetBodyId']);
    stringId(policy.featureId, patternId, 'referencePolicies.featureId');
    if (!['support', 'endCondition.target'].includes(policy.path)) invalid('REFERENCE_POLICY', patternId, 'referencePolicies.path', 'Unknown reference schema locator.');
    const key = locatorKey(policy.featureId, policy.path);
    if (policies.has(key) || !['world', 'transform', 'instance'].includes(policy.placement)) invalid('REFERENCE_POLICY', patternId, 'referencePolicies', 'Reference locators must be unique and have an explicit placement policy.');
    policies.set(key, policy);
  }
  const definitions = new Map<string, RecipeDefinition>(), dependencies: RecipeDependency[] = [];
  const visit = (id: string, before: number, consumer: string): void => {
    const record = requireEarlier(id, before, consumer, 'dependency');
    if (definitions.has(id)) return;
    if (definitions.size >= RECIPE_LIMITS.closureDefinitions) invalid('CLOSURE_BUDGET', patternId, 'definitions', 'Dependency closure exceeds256 definitions.');
    const feature = boundedClone(record.feature, id, budget);
    definitions.set(id, { feature, historyOrder: record.order, role: selectedSet.has(id) ? 'selected-operation' : 'definition-only' });
    const ids = (() => {
      try { return featureDependencyIds(feature); }
      catch { return invalid('INVALID_DEPENDENCY_DECLARATION', id, 'dependency', 'A dependency declaration is malformed.'); }
    })();
    for (const dependency of ids) {
      if (dependencies.length >= RECIPE_LIMITS.dependencyEdges) invalid('DEPENDENCY_BUDGET', id, 'dependency', 'Recipe dependency graph exceeds2048 edges.');
      dependencies.push({ consumerId: id, producerId: dependency });
      visit(dependency, record.order, id);
    }
  };
  for (const id of selected) visit(id, request.beforeFeatureIndex, patternId);
  // Target parameter/history changes also stale the preview, even if its saved
  // BodyReference IDs are unchanged. These definitions are never replayed.
  for (const target of targets.values()) visit(target.sourceFeatureId, request.beforeFeatureIndex, patternId);
  const nativeRequirements: RecipeNativeRequirement[] = [
    ...[...bindingSources.values()].map(source => ({ kind: 'materialized-source' as const, ref: source })),
    ...[...targets.values()].map(target => ({ kind: 'current-target' as const, ref: target })),
  ];
  const policyFor = (featureId: string, path: string, support: PlaneSupport): RecipeReferencePolicy => {
    supportShape(support, featureId, path);
    const key = locatorKey(featureId, path), policy = policies.get(key);
    if (!policy) invalid('MISSING_REFERENCE_POLICY', featureId, path, 'An external/internal support needs a saved remap policy; no world/latest/nearest default.');
    usedPolicies.add(key);
    if (support.kind === 'face') {
      const producer = definitions.get(support.face.sourceFeatureId)?.feature;
      if (!producer || producer.type === 'sketch' || producer.type === 'plane') invalid('FACE_PRODUCER_KIND', featureId, path, 'Face producer must be an earlier solid operation.');
      if (!policy.owner) invalid('FACE_OWNER_REQUIRED', featureId, path, 'An opaque face key does not establish its owner.');
      const owner = ref(policy.owner, featureId, `${path}.owner`);
      if (owner.sourceFeatureId !== support.face.sourceFeatureId) invalid('FACE_STATE_MISMATCH', featureId, path, 'The face and explicit owner must name the same exact historical state.');
      if (policy.placement === 'instance') stringId(policy.parentTargetBodyId, featureId, `${path}.parentTargetBodyId`);
      else if (Object.hasOwn(policy, 'parentTargetBodyId')) invalid('REFERENCE_POLICY', featureId, path, 'Only an instance face declares a parent target-owner route.');
      nativeRequirements.push({ kind: 'exact-face', ref: owner, face: { ...support.face } });
      if (selectedSet.has(owner.sourceFeatureId)) {
        if (policy.placement !== 'instance' || !policy.parentTargetBodyId || !routes.get(exactStateKey(owner))?.includes(policy.parentTargetBodyId)) invalid('INTERNAL_FACE_ROUTE', featureId, path, 'A selected parent face needs an exact same-instance parent owner route.');
      } else if (policy.placement === 'instance') invalid('UNSELECTED_INSTANCE_PARENT', featureId, path, 'An unselected producer has no virtual instance output.');
      pending('FACE_CORRESPONDENCE_PENDING', featureId, path, 'Exact role/face correspondence must be implemented and attested; proximity is not an identity fallback.');
    } else {
      if (support.kind === 'plane') {
        if (definitions.get(support.planeId)?.feature.type !== 'plane') invalid('PLANE_PRODUCER_KIND', featureId, path, 'Plane reference must identify an exact datum declaration.');
        nativeRequirements.push({ kind: 'exact-plane', planeId: support.planeId });
      }
      if (policy.owner !== undefined || policy.parentTargetBodyId !== undefined) invalid('REFERENCE_POLICY', featureId, path, 'Plane supports do not accept hidden face-owner routing.');
      if (policy.placement === 'instance') invalid('INSTANCE_PLANE_POLICY', featureId, path, 'Current plane/principal supports have no declared instance output role.');
    }
    return policy;
  };
  // Resolve only replayed sketch/plane support policies. Definition-only source
  // ancestry contributes to the fingerprint, not extra geometry operations.
  const recipeSupports = new Set<string>();
  const inspectSupport = (id: string): void => {
    if (recipeSupports.has(id)) return;
    recipeSupports.add(id);
    const feature = definitions.get(id)!.feature;
    if (feature.type === 'sketch' && feature.support) {
      policyFor(id, 'support', feature.support);
      pending('ASSOCIATIVE_SKETCH_PENDING', id, 'support', 'Instance support/constraint placement is separate from rigid profile placement.');
      if (feature.support.kind === 'plane') inspectSupport(feature.support.planeId);
    } else if (feature.type === 'plane') {
      policyFor(id, 'support', feature.support);
      pending('ASSOCIATIVE_PLANE_PENDING', id, 'support', 'Dependent datum evaluation requires its instance reference policy.');
      if (feature.support.kind === 'plane') inspectSupport(feature.support.planeId);
    }
  };
  const operations: RecipeOperation[] = [];
  const ordered = selected.map(id => definitions.get(id)!).sort((a, b) => a.historyOrder - b.historyOrder || textOrder(a.feature.id, b.feature.id));
  for (const definition of ordered) {
    const feature = definition.feature;
    const node: RecipeOperation = { featureId: feature.id, type: feature.type, sketchId: null, termination: null, applications: [] };
    operations.push(node);
    const selectedBindings = [...bindingSources].filter(([, source]) => source.sourceFeatureId === feature.id).sort(([a], [b]) => textOrder(a, b));
    if (feature.type !== 'extrude' && feature.type !== 'cut') {
      pending('OPERATION_RECIPE_PENDING', feature.id, 'type', `Regeneration for ${feature.type} remains required; no aggregate/delta substitute is used.`);
      continue;
    }
    if (request.scope.mode === 'all' && feature.type === 'extrude' && feature.bodyOperation?.mode === 'merge') {
      pending('ALL_POSITIVE_SCOPE_PENDING', feature.id, 'bodyOperation', 'Additive ALL applicability to remote owners is not established; positive dynamic scope remains required and is not activated by this subset.');
    }
    node.sketchId = feature.sketchId;
    const sketch = definitions.get(feature.sketchId)!.feature;
    if (sketch.type !== 'sketch') invalid('WRONG_SKETCH_INPUT', feature.id, 'sketchId', 'Operation input must be an exact sketch declaration.');
    inspectSupport(sketch.id);
    if (!sketch.profile || typeof sketch.profile !== 'object') invalid('PROFILE_DECLARATION', sketch.id, 'profile', 'Expected a parsed profile declaration.');
    if (sketch.profile.kind === 'entities') pending('SOLVED_PROFILE_PENDING', sketch.id, 'profile', 'Fixed solved-entity profiles need a source-solve attestation; varying constraints need an instance solve.');
    else if (sketch.profile.kind !== 'rectangle' && sketch.profile.kind !== 'circle') invalid('PROFILE_DECLARATION', sketch.id, 'profile', 'Unknown profile declaration.');
    if (!Number.isFinite(feature.depth) || Math.abs(feature.depth) < .01 || Math.abs(feature.depth) > 100_000 || typeof feature.symmetric !== 'boolean') invalid('EXTRUSION_PARAMETERS', feature.id, 'depth', 'Expected finite signed depth and an explicit symmetric flag.');
    const end = feature.endCondition;
    if (Object.hasOwn(feature, 'endCondition') && (!end || typeof end !== 'object' || Array.isArray(end))) invalid('UNSUPPORTED_END_SCHEMA', feature.id, 'endCondition', 'A declared end condition cannot be null, undefined or a primitive.');
    if (!end) node.termination = { kind: 'blind', signedDepth: feature.depth, symmetric: feature.symmetric };
    else {
      if (feature.symmetric) invalid('GEOMETRIC_SYMMETRY', feature.id, 'symmetric', 'Geometric end conditions do not reuse legacy mid-plane depth.');
      if (end.kind === 'upToSurface') {
        const policy = policyFor(feature.id, 'endCondition.target', end.target);
        node.termination = { kind: 'upToSurface', target: end.target, policy };
        if (end.target.kind !== 'principal' || policy.placement !== 'world') {
          pending('UP_TO_SURFACE_PENDING', feature.id, 'endCondition', 'Only an explicitly fixed external principal-plane limit is currently resolved; datum/face and transformed/instance correspondence remain required.');
        }
      } else if (end.kind === 'throughAll' || end.kind === 'untilNext') {
        if (end.kind === 'throughAll' && typeof end.bothDirections !== 'boolean') invalid('THROUGH_ALL_SENSE', feature.id, 'endCondition.bothDirections', 'Through-all must name one/both directions.');
        const sourceBase = feature.type === 'cut' ? feature.bodyScope?.[0]
          : feature.bodyOperation?.mode === 'merge' ? feature.bodyOperation.target
            : feature.bodyOperation?.mode === 'new' ? end.baseBody : undefined;
        if (!sourceBase || sourceBase.sourceFeatureId !== end.baseFeatureId) invalid('SOURCE_LIMIT_BASE', feature.id, 'endCondition.baseFeatureId', 'The saved source limit must agree with its declared owner input, never an aggregate predecessor.');
        if (feature.type === 'cut' && end.baseBody !== undefined) invalid('SOURCE_LIMIT_BASE', feature.id, 'endCondition.baseBody', 'Cut limits use their explicit owner scope, not a creation-only baseBody.');
        node.termination = end.kind === 'throughAll' ? { kind: 'throughAll', bothDirections: end.bothDirections, baseFeatureId: end.baseFeatureId }
          : { kind: 'untilNext', baseFeatureId: end.baseFeatureId };
        if (end.kind === 'untilNext') pending('UNTIL_NEXT_PENDING', feature.id, 'endCondition', 'Per-owner next-boundary regeneration requires separate geometry evidence.');
      } else invalid('UNSUPPORTED_END_SCHEMA', feature.id, 'endCondition', 'Unknown end-condition schema; do not reinterpret it as blind or copied geometry.');
    }
    for (const [key, source] of selectedBindings) {
      let sourceInput: BodyReference | null = null;
      if (feature.type === 'cut') {
        sourceInput = feature.bodyScope?.find(owner => owner.bodyId === source.bodyId) ?? null;
        if (!sourceInput) invalid('SOURCE_OWNER_OUTPUT', feature.id, 'bodyScope', 'This bound poststate is not a declared cut owner.');
      } else if (feature.bodyOperation?.mode === 'merge') {
        sourceInput = feature.bodyOperation.target;
        if (sourceInput.bodyId !== source.bodyId) invalid('SOURCE_OWNER_OUTPUT', feature.id, 'bodyOperation.target', 'Merge preserves its exact owner identity.');
      } else if (feature.bodyOperation?.mode === 'new') {
        if (feature.bodyOperation.bodyId !== source.bodyId) invalid('SOURCE_OWNER_OUTPUT', feature.id, 'bodyOperation.bodyId', 'Creation output must use its declared body identity.');
        pending('LIFECYCLE_LEDGER_PENDING', feature.id, 'bodyOperation', 'New/consumed/split outputs need saved role-address identities; do not turn creation into target merge.');
      } else invalid('EXPLICIT_OWNER_REQUIRED', feature.id, 'bodyOperation', 'Legacy aggregate recipes do not acquire owners implicitly.');
      if (sourceInput) requireEarlier(sourceInput.sourceFeatureId, definition.historyOrder, feature.id, 'ownerInput');
      for (const targetId of routes.get(key)!) {
        const application: RecipeOwnerApplication = { sourcePoststate: source, sourceInput, targetAtPatternInput: targets.get(targetId)! };
        if (sourceInput && selectedSet.has(sourceInput.sourceFeatureId)) {
          if (!routes.get(exactStateKey(sourceInput))?.includes(targetId)) invalid('SELECTED_PARENT_OWNER_ROUTE', feature.id, 'ownerInput', 'A selected parent must produce this exact source owner on the same target route and instance.');
          application.selectedParent = { sourcePoststate: sourceInput, targetBodyId: targetId, outputRole: 'body' };
        }
        node.applications.push(application);
      }
    }
  }
  for (const key of policies.keys()) if (!usedPolicies.has(key)) invalid('UNUSED_REFERENCE_POLICY', patternId, 'referencePolicies', 'A policy must match an extracted schema locator; stale hidden policies are not silently ignored.');
  const orderedDefinitions = [...definitions.values()].sort((a, b) => a.historyOrder - b.historyOrder || textOrder(a.feature.id, b.feature.id));
  dependencies.sort((a, b) => textOrder(a.consumerId, b.consumerId) || textOrder(a.producerId, b.producerId));
  const uniqueRequirements = [...new Map(nativeRequirements.map(item => [canonical(item), item])).values()].sort((a, b) => textOrder(canonical(a), canonical(b)));
  // Canonicalize unordered UI binding/target/policy lists before preview fingerprinting.
  request.sourceFeatureIds = ordered.map(item => item.feature.id);
  request.bindings.sort((a, b) => textOrder(exactStateKey(a.source), exactStateKey(b.source)));
  for (const binding of request.bindings) if (Array.isArray(binding.targets)) binding.targets.sort(textOrder);
  request.targetSnapshot.sort((a, b) => textOrder(a.bodyId, b.bodyId));
  if (request.scope.mode === 'selected') request.scope.targets.sort((a, b) => textOrder(a.bodyId, b.bodyId));
  request.referencePolicies.sort((a, b) => textOrder(locatorKey(a.featureId, a.path), locatorKey(b.featureId, b.path)));
  const fingerprintInput = canonical({ request, definitions: orderedDefinitions, dependencies, operations, nativeRequirements: uniqueRequirements });
  return freezeTree({ request, definitions: orderedDefinitions, dependencies, operations, nativeRequirements: uniqueRequirements,
    diagnostics, eligibility: diagnostics.length ? 'pending-capability' : 'initial-declaration-subset', fingerprintInput });
}

/** This gate says nothing about successful native evaluation or reference-target fidelity. */
export function requireInitialRecipeDeclaration(closure: RecipeClosure): RecipeClosure {
  if (closure.diagnostics.length) throw new RecipeClosureError(closure.diagnostics);
  return closure;
}

export type RecipeInstanceTransform =
  | { key: string; translation: Vec3 }
  | { key: string; angle: number; origin: Vec3; direction: Vec3 }
  | { key: string; mirror: PlaneFrame };
const finiteArithmetic = (value: number, path: string): number => {
  if (!Number.isFinite(value)) invalid('FRAME_ARITHMETIC', '(instance)', path, 'Instance arithmetic must remain finite; finite operands alone are insufficient.');
  return value === 0 ? 0 : value;
};
const product = (a: number, b: number, path: string) => finiteArithmetic(a * b, path);
const dot = (a: Vec3, b: Vec3): number => finiteArithmetic(
  finiteArithmetic(product(a[0], b[0], 'dot') + product(a[1], b[1], 'dot'), 'dot') + product(a[2], b[2], 'dot'), 'dot');
const cross = (a: Vec3, b: Vec3): Vec3 => [
  finiteArithmetic(product(a[1], b[2], 'cross') - product(a[2], b[1], 'cross'), 'cross'),
  finiteArithmetic(product(a[2], b[0], 'cross') - product(a[0], b[2], 'cross'), 'cross'),
  finiteArithmetic(product(a[0], b[1], 'cross') - product(a[1], b[0], 'cross'), 'cross'),
];
const scale = (vector: Vec3, factor: number): Vec3 => vector.map(value => product(value, factor, 'scale')) as Vec3;
const plus = (a: Vec3, b: Vec3): Vec3 => a.map((value, axis) => finiteArithmetic(value + b[axis], 'sum')) as Vec3;
function finiteVector(vector: Vec3, path: string): Vec3 {
  if (!Array.isArray(vector) || Object.getPrototypeOf(vector) !== Array.prototype
    || vector.length !== 3 || Object.getOwnPropertySymbols(vector).length) invalid('FRAME_VECTOR', '(instance)', path, 'Expected a plain dense vector with three finite own components.');
  const descriptors = Object.getOwnPropertyDescriptors(vector);
  if (Object.keys(descriptors).length !== 4) invalid('FRAME_VECTOR', '(instance)', path, 'Vector fields must be exactly indices 0..2 and length, without hidden extras.');
  const values = [0, 1, 2].map(index => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable || !Number.isFinite(descriptor.value)) invalid('FRAME_VECTOR', '(instance)', path, 'Sparse/hidden vectors and accessors are not resolved coordinates.');
    return descriptor.value as number;
  });
  return values as Vec3;
}
function unit(vector: Vec3, path: string): Vec3 {
  const copy = finiteVector(vector, path), length = Math.hypot(...copy);
  if (!Number.isFinite(length) || length < 1e-12) invalid('FRAME_DIRECTION', '(instance)', path, 'Direction must have a nonzero finite normalization length.');
  return scale(copy, 1 / length);
}
function checkedFrame(frame: PlaneFrame): PlaneFrame {
  recordKeys(frame, '(instance)', 'frame', ['origin', 'xDirection', 'normal']);
  const origin = finiteVector(frame.origin, 'origin'), xDirection = finiteVector(frame.xDirection, 'xDirection'), normal = finiteVector(frame.normal, 'normal');
  if (Math.abs(Math.hypot(...xDirection) - 1) > 1e-8 || Math.abs(Math.hypot(...normal) - 1) > 1e-8 || Math.abs(dot(xDirection, normal)) > 1e-8) invalid('FRAME_ORTHONORMALITY', '(instance)', 'frame', 'Resolved source frame must be orthonormal; do not repair a different frame implicitly.');
  return { origin, xDirection, normal };
}
/** Raw plain-data boundary: reject getters/prototypes before reading transform fields.
 * Returned point/vector methods apply the same strict boundary to their inputs. */
export function recipeTransform(rawTransform: RecipeInstanceTransform): {
  parity: 1 | -1; point(value: Vec3): Vec3; vector(value: Vec3): Vec3;
} {
  const transform = boundedClone(rawTransform, '(instance)', { remaining: RECIPE_LIMITS.jsonNodes });
  if (transform === null || typeof transform !== 'object') invalid('TRANSFORM_PLAN', '(instance)', 'transform', 'A transform must be a saved record.');
  stringId(transform.key, '(instance)', 'transform.key');
  if ('translation' in transform) {
    recordKeys(transform, '(instance)', 'transform', ['key', 'translation']);
    const translation = finiteVector(transform.translation, 'translation');
    return { parity: 1, point: value => plus(finiteVector(value, 'point'), translation), vector: value => finiteVector(value, 'vector') };
  }
  if ('angle' in transform) {
    recordKeys(transform, '(instance)', 'transform', ['key', 'angle', 'origin', 'direction']);
    // Existing canonical plans have at most255 extra positions and a step<=360.
    // Reject an independently supplied unbounded angle rather than changing its
    // stored semantics by silently reducing/repairing it.
    if (!Number.isFinite(transform.angle) || Math.abs(transform.angle) > 360 * 255) invalid('ROTATION_ANGLE', '(instance)', 'angle', 'Angle must be finite degrees within the existing canonical-plan envelope.');
    const axis = unit(transform.direction, 'axis'), origin = finiteVector(transform.origin, 'axisOrigin');
    const radians = finiteArithmetic(transform.angle * (Math.PI / 180), 'radians');
    const cosine = finiteArithmetic(Math.cos(radians), 'cosine'), sine = finiteArithmetic(Math.sin(radians), 'sine');
    const vector = (value: Vec3): Vec3 => {
      const v = finiteVector(value, 'vector');
      return plus(plus(scale(v, cosine), scale(cross(axis, v), sine)), scale(axis, dot(axis, v) * (1 - cosine)));
    };
    return { parity: 1, vector, point: value => plus(origin, vector(plus(finiteVector(value, 'point'), scale(origin, -1)))) };
  }
  recordKeys(transform, '(instance)', 'transform', ['key', 'mirror']);
  const mirror = checkedFrame(transform.mirror);
  const vector = (value: Vec3): Vec3 => {
    const v = finiteVector(value, 'vector');
    return plus(v, scale(mirror.normal, -2 * dot(v, mirror.normal)));
  };
  return { parity: -1, vector, point: value => plus(mirror.origin, vector(plus(finiteVector(value, 'point'), scale(mirror.origin, -1)))) };
}
/**
 * Fixed solved profile placement only. With Q orthogonal and d=det(Q), choose
 * X'=QX,N'=dQN so N'×X'=QY. Keep local profile coordinates/winding unchanged,
 * and multiply signed depth by d so the actual ray remains Q(source ray).
 * Associative/varying sketches require their pending resolver before this step.
 */
export function transformedExtrusionFrame(rawSource: PlaneFrame, signedDepth: number, transform: RecipeInstanceTransform): {
  frame: PlaneFrame; signedDepth: number; ray: Vec3; parity: 1 | -1;
} {
  const frame = checkedFrame(boundedClone(rawSource, '(instance)', { remaining: RECIPE_LIMITS.jsonNodes })), mapping = recipeTransform(transform);
  if (!Number.isFinite(signedDepth) || signedDepth === 0) invalid('EXTRUSION_PARAMETERS', '(instance)', 'depth', 'Signed depth selects a nonzero source ray.');
  const mapped = checkedFrame({ origin: mapping.point(frame.origin), xDirection: mapping.vector(frame.xDirection), normal: scale(mapping.vector(frame.normal), mapping.parity) });
  return { frame: mapped, signedDepth: product(signedDepth, mapping.parity, 'depth'),
    ray: scale(mapping.vector(frame.normal), Math.sign(signedDepth)), parity: mapping.parity };
}
/** Infinite limiting-plane orientation follows QN, not the sketch parity convention. */
export function transformedLimitPlane(rawSource: PlaneFrame, transform: RecipeInstanceTransform): PlaneFrame {
  const frame = checkedFrame(boundedClone(rawSource, '(instance)', { remaining: RECIPE_LIMITS.jsonNodes })), mapping = recipeTransform(transform);
  return checkedFrame({ origin: mapping.point(frame.origin), xDirection: mapping.vector(frame.xDirection), normal: mapping.vector(frame.normal) });
}

/** Proposed future input, deliberately not installed into today's ExtrudeEndCondition union. */
export type PendingOffsetSurfaceIntent = {
  target: PlaneSupport; policy: RecipeReferencePolicy;
} & ({ construction: 'normal'; signedDistanceMm: number }
  | { construction: 'translation'; translationWorldMm: Vec3 });
export function validatePendingOffsetSurfaceIntent(intent: PendingOffsetSurfaceIntent): Readonly<PendingOffsetSurfaceIntent> {
  const copy = boundedClone(intent, '(offset)', { remaining: RECIPE_LIMITS.jsonNodes });
  recordKeys(copy, '(offset)', '$', ['target', 'policy', 'construction'], ['signedDistanceMm', 'translationWorldMm']);
  recordKeys(copy.policy, '(offset)', 'policy', ['featureId', 'path', 'placement'], ['owner', 'parentTargetBodyId']);
  supportShape(copy.target, '(offset)', 'target');
  stringId(copy.policy.featureId, '(offset)', 'policy.featureId');
  if (copy.policy.path !== 'endCondition.target') invalid('REFERENCE_POLICY', '(offset)', 'policy.path', 'Offset policy must identify its end-reference locator.');
  if (!['world', 'transform', 'instance'].includes(copy.policy.placement)) invalid('REFERENCE_POLICY', '(offset)', 'policy', 'Offset surface needs an explicit reference policy.');
  if (copy.target.kind === 'face') {
    const owner = ref(copy.policy.owner!, '(offset)', 'policy.owner');
    if (owner.sourceFeatureId !== copy.target.face.sourceFeatureId) invalid('FACE_STATE_MISMATCH', '(offset)', 'policy.owner', 'Offset face and owner must name the same exact state.');
    if (copy.policy.placement === 'instance') stringId(copy.policy.parentTargetBodyId, '(offset)', 'policy.parentTargetBodyId');
    else if (Object.hasOwn(copy.policy, 'parentTargetBodyId')) invalid('REFERENCE_POLICY', '(offset)', 'policy.parentTargetBodyId', 'Only an instance face declares a parent target-owner route.');
  } else if (copy.policy.owner !== undefined || copy.policy.parentTargetBodyId !== undefined || copy.policy.placement === 'instance') {
    invalid('REFERENCE_POLICY', '(offset)', 'policy', 'Plane offset does not declare an instance face role.');
  }
  if (copy.construction === 'normal') {
    recordKeys(copy, '(offset)', '$', ['target', 'policy', 'construction', 'signedDistanceMm']);
    if (!Number.isFinite(copy.signedDistanceMm) || Math.abs(copy.signedDistanceMm) > 1_000_000) invalid('OFFSET_DISTANCE', '(offset)', 'signedDistanceMm', 'Normal distance must be finite and bounded.');
  } else if (copy.construction === 'translation') {
    recordKeys(copy, '(offset)', '$', ['target', 'policy', 'construction', 'translationWorldMm']);
    finiteVector(copy.translationWorldMm, 'translationWorldMm');
  }
  else invalid('OFFSET_CONSTRUCTION', '(offset)', 'construction', 'Normal offset and explicit translation are different saved intents.');
  return freezeTree(copy);
}

/** Future builder input: explicit frame cannot depend on a truthy sketch.support flag. */
export interface ResolvedRecipeExtrusionInput {
  sourceFeatureId: string;
  profile: Profile;
  frame: PlaneFrame;
  ray: Vec3;
  signedDepth: number;
  termination: RecipeTermination;
}
export function fixedProfileInstanceInput(closure: RecipeClosure, featureId: string, address: string): Readonly<ResolvedRecipeExtrusionInput> {
  requireInitialRecipeDeclaration(closure);
  const transform = closure.request.plan.transforms.find(item => item.key === address);
  if (!transform) invalid('INACTIVE_INSTANCE', closure.request.patternId, 'address', 'Instance must be active in the exact extracted transform plan.');
  const node = closure.operations.find(operation => operation.featureId === featureId);
  const feature = closure.definitions.find(definition => definition.feature.id === featureId)?.feature;
  if (!node?.termination || !feature || (feature.type !== 'extrude' && feature.type !== 'cut')) invalid('OPERATION_RECIPE_PENDING', featureId, 'type', 'Expected an eligible extracted extrusion operation.');
  const sketch = closure.definitions.find(definition => definition.feature.id === feature.sketchId)?.feature;
  if (!sketch || sketch.type !== 'sketch' || sketch.support || sketch.profile.kind === 'entities') invalid('FIXED_PROFILE_INPUT', featureId, 'sketchId', 'This adapter is limited to intrinsic fixed rectangle/circle placement; associative/entity solves remain pending.');
  if (!Number.isFinite(sketch.offset) || !['XY', 'XZ', 'YZ'].includes(sketch.plane)) invalid('FIXED_PROFILE_INPUT', sketch.id, 'plane', 'Intrinsic source plane and offset must be valid.');
  const mapped = transformedExtrusionFrame(principalPlaneFrame(sketch.plane, sketch.offset), feature.depth, transform);
  const termination = node.termination.kind === 'blind' ? { ...node.termination, signedDepth: mapped.signedDepth } : node.termination;
  return freezeTree({ sourceFeatureId: featureId, profile: boundedClone(sketch.profile, sketch.id, { remaining: RECIPE_LIMITS.jsonNodes }),
    frame: mapped.frame, ray: mapped.ray, signedDepth: mapped.signedDepth, termination });
}
