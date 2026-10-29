import type { Shape3D } from 'replicad';
import { fixedProfileInstanceInput, intrinsicProfileInstancePlacement, requireInitialRecipeDeclaration, type RecipeClosure } from '../model/featureRecipes';
import { withNativeOwners } from './kernel.native-ownership';
import { buildExplicitFramePrimitive, resolveExplicitFrameUntilNext, type PrimitiveTermination } from './kernel.recipe-primitives';
import { principalPlaneFrame } from './kernel.frames';
import { buildEntityRecipeTool, resolveEntityRecipeUntilNext, type EntityRecipeSolveInput } from './kernel.recipe-entities';
import type { UntilNextCutResolution } from './kernel.until-next-resolution';

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
  readonly entitySource?: EntityRecipeSolveInput;
  /** Evaluator closure over the actual working owner/revision and source epoch. */
  readonly assertWorkingCurrent?: () => void;
}
export interface OwnedRecipeInstanceTool {
  readonly operation: 'add' | 'subtract';
  /** OWNED. Caller must Boolean against its current owner or release it. */
  readonly tool: Shape3D;
}
/** A completed tool is owned; other outcomes contain detached native observations only. */
export type RecipeInstanceUntilNextResolution = UntilNextCutResolution & { readonly operation: 'add' | 'subtract' };

/**
 * Initial native bridge: one fixed intrinsic selected/ALL operation/event/address/
 * target. It never accepts an arbitrary caller transform or source frame and
 * never falls back to geometry-delta copying. Closure/native attestation and
 * atomic owner publication are evaluator responsibilities.
 */
function recipeInstanceContext(input: RecipeInstanceToolInput) {
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
  const resolved = intrinsicProfileInstancePlacement(closure, input.featureId, input.address);
  const end = resolved.termination;
  if (end.kind !== 'blind' && end.kind !== 'throughAll' && end.kind !== 'untilNext'
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
  else if (end.kind === 'untilNext') termination = { kind: 'untilNext' };
  else if (end.kind === 'upToSurface' && end.target.kind === 'principal' && end.policy.placement === 'world') {
    // The profile/ray follow the actual instance. The explicitly selected
    // principal plane remains in document coordinates, rather than following Q.
    termination = { kind: 'upToSurface', limit: { frame: principalPlaneFrame(end.target.plane) } };
  } else throw new Error('The exact principal-plane end reference is not resolved.');
  const sketch = closure.definitions.find(item => item.feature.id === resolved.sketchId)?.feature;
  return { closure, resolved, operation, termination, sketch };
}

function resolveInstanceUntilNext(input: RecipeInstanceToolInput,
  context: ReturnType<typeof recipeInstanceContext>): RecipeInstanceUntilNextResolution {
  const { closure, resolved, operation, termination, sketch } = context;
  if (termination.kind !== 'untilNext') throw new Error('The resolution bridge requires an extracted UntilNext operation.');
  if (closure.request.scope.mode === 'all' && !input.assertWorkingCurrent) {
    throw new Error('ALL UntilNext resolution requires its evaluator working-owner/revision guard.');
  }
  input.assertWorkingCurrent?.();
  return withNativeOwners<RecipeInstanceUntilNextResolution>(owners => {
    let result: UntilNextCutResolution;
    if (sketch?.type === 'sketch' && sketch.profile.kind === 'entities') {
      if (!input.entitySource || !input.assertWorkingCurrent) throw new Error('Entity recipes require a current real-solve checkpoint and working-owner guard.');
      result = resolveEntityRecipeUntilNext({ source: input.entitySource, placement: resolved,
        termination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
        assertWorkingCurrent: input.assertWorkingCurrent });
    } else {
      const profile = fixedProfileInstanceInput(closure, input.featureId, input.address).profile;
      if (profile.kind !== 'rectangle' && profile.kind !== 'circle') throw new Error('Unknown intrinsic recipe profile.');
      result = resolveExplicitFrameUntilNext({ profile, frame: resolved.frame, signedDepth: resolved.signedDepth,
        termination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
        ...(resolved.thinWall ? { thinWall: resolved.thinWall } : {}) });
    }
    if (result.kind === 'complete') owners.own(result.tool);
    // Native inspection cleanup completes before either kind can leave this bridge.
    input.assertWorkingCurrent?.();
    return { ...result, operation };
  }, result => result.kind === 'complete' ? [result.tool] : [], 'Recipe UntilNext resolution or release failed.');
}

/** Explicit native outcome API; only the evaluator can choose a saved scope's miss policy. */
export function resolveRecipeInstanceUntilNext(input: RecipeInstanceToolInput): RecipeInstanceUntilNextResolution {
  return resolveInstanceUntilNext(input, recipeInstanceContext(input));
}

export function buildRecipeInstanceTool(input: RecipeInstanceToolInput): OwnedRecipeInstanceTool {
  const context = recipeInstanceContext(input), { closure, resolved, operation, termination, sketch } = context;
  if (termination.kind === 'untilNext') {
    const result = resolveInstanceUntilNext(input, context);
    if (result.kind === 'complete') return { operation, tool: result.tool };
    if (result.kind === 'incomplete-limit') throw result.error;
    if (result.kind === 'contact-or-near') throw new Error('El perfil toca el cuerpo o está demasiado cerca para resolver Hasta el siguiente.');
    throw new Error('No hay material por delante para resolver Hasta el siguiente en el cuerpo seleccionado.');
  }
  if (sketch?.type === 'sketch' && sketch.profile.kind === 'entities') {
    if (!input.entitySource || !input.assertWorkingCurrent) throw new Error('Entity recipes require a current real-solve checkpoint and working-owner guard.');
    return { operation, tool: buildEntityRecipeTool({ source: input.entitySource, placement: resolved,
      termination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
      assertWorkingCurrent: input.assertWorkingCurrent }) };
  }
  const profile = fixedProfileInstanceInput(closure, input.featureId, input.address).profile;
  if (profile.kind !== 'rectangle' && profile.kind !== 'circle') throw new Error('Unknown intrinsic recipe profile.');
  return withNativeOwners(owners => ({ operation, tool: owners.own(buildExplicitFramePrimitive({
    profile, frame: resolved.frame, signedDepth: resolved.signedDepth,
    termination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
    ...(resolved.thinWall ? { thinWall: resolved.thinWall } : {}),
  })) }), result => [result.tool], 'Recipe instance tool construction or release failed.');
}
