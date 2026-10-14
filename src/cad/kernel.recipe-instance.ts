import type { Shape3D } from 'replicad';
import { fixedProfileInstanceInput, requireInitialRecipeDeclaration, type RecipeClosure } from '../model/featureRecipes';
import { withNativeOwners } from './kernel.native-ownership';
import { buildExplicitFramePrimitive, type PrimitiveTermination } from './kernel.recipe-primitives';
import { principalPlaneFrame } from './kernel.frames';

export interface RecipeInstanceToolInput {
  /** Trusted extractor output; the evaluator extracts from the current parsed document. */
  readonly closure: RecipeClosure;
  readonly featureId: string;
  /** Exact active canonical address from this closure's plan. */
  readonly address: string;
  readonly targetBodyId: string;
  /** Borrowed current detached owner, already native-attested by the evaluator. */
  readonly workingTarget: Shape3D;
  readonly validateTool: (tool: Shape3D) => void;
}
export interface OwnedRecipeInstanceTool {
  readonly operation: 'add' | 'subtract';
  /** OWNED. Caller must Boolean against its current owner or release it. */
  readonly tool: Shape3D;
}

/**
 * Initial native bridge: one fixed intrinsic selected/ALL operation/event/address/
 * target. It never accepts an arbitrary caller transform or source frame and
 * never falls back to geometry-delta copying. Closure/native attestation and
 * atomic owner publication are evaluator responsibilities.
 */
export function buildRecipeInstanceTool(input: RecipeInstanceToolInput): OwnedRecipeInstanceTool {
  const closure = requireInitialRecipeDeclaration(input.closure);
  if (closure.request.mode !== 'regenerate' || closure.request.geometryPattern !== false ||
      closure.eligibility !== 'initial-declaration-subset' || closure.request.scope.mode === 'auto' ||
      closure.request.variation.kind !== 'none') {
    throw new Error('The native recipe bridge requires the extracted initial regeneration subset.');
  }
  const node = closure.operations.find(operation => operation.featureId === input.featureId),
    target = closure.request.targetSnapshot.find(ref => ref.bodyId === input.targetBodyId);
  const applications = node?.applications.filter(application => application.targetAtPatternInput.bodyId === input.targetBodyId) ?? [];
  if (!node || !target || !applications.length || closure.request.scope.mode === 'selected' && !closure.request.scope.targets.some(ref =>
      ref.bodyId === target.bodyId && ref.sourceFeatureId === target.sourceFeatureId) ||
      applications.some(application => application.sourcePoststate.sourceFeatureId !== node.featureId ||
        application.targetAtPatternInput.sourceFeatureId !== target.sourceFeatureId)) {
    throw new Error('The operation must route to this exact extracted target state.');
  }
  if (!input.workingTarget) throw new Error('The recipe instance needs its current native working owner.');
  const resolved = fixedProfileInstanceInput(closure, input.featureId, input.address);
  const profile = resolved.profile;
  if (profile.kind !== 'rectangle' && profile.kind !== 'circle') throw new Error('A solved recipe profile is not implemented by this bridge.');
  const end = resolved.termination;
  if (end.kind !== 'blind' && end.kind !== 'throughAll'
      && !(end.kind === 'upToSurface' && end.target.kind === 'principal' && end.policy.placement === 'world')) {
    throw new Error('This native recipe bridge does not enable pending end-condition declarations.');
  }
  const definition = closure.definitions.find(item => item.feature.id === input.featureId)?.feature;
  let operation: 'add' | 'subtract';
  if (definition?.type === 'cut' && node.type === 'cut') operation = 'subtract';
  else if (definition?.type === 'extrude' && node.type === 'extrude' && definition.bodyOperation?.mode === 'merge') operation = 'add';
  else throw new Error('Creation, consumption and other recipe lifecycle operations remain pending.');
  if (closure.request.scope.mode === 'all' && operation === 'add') throw new Error('ALL_POSITIVE_SCOPE_PENDING: additive ALL applicability remains required and is not enabled.');
  let termination: PrimitiveTermination;
  if (end.kind === 'blind') termination = { kind: 'blind', symmetric: end.symmetric };
  else if (end.kind === 'throughAll') termination = { kind: 'throughAll', bothDirections: end.bothDirections };
  else if (end.kind === 'upToSurface' && end.target.kind === 'principal' && end.policy.placement === 'world') {
    // The profile/ray follow the actual instance. The explicitly selected
    // principal plane remains in document coordinates, rather than following Q.
    termination = { kind: 'upToSurface', limit: { frame: principalPlaneFrame(end.target.plane) } };
  } else throw new Error('The exact principal-plane end reference is not resolved.');
  return withNativeOwners(owners => ({ operation, tool: owners.own(buildExplicitFramePrimitive({
    profile, frame: resolved.frame, signedDepth: resolved.signedDepth,
    termination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
  })) }), result => [result.tool], 'Recipe instance tool construction or release failed.');
}
