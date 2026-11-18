import type { Feature } from './kernel.types';
import { readRecipeDatum, type RecipeDatumCheckpoint, type SourceSketchSolveRegistry } from './kernel.sketch-solves';
import type { Shape3D } from 'replicad';
import { transformedLimitPlane, exactStateKey, fixedProfileInstanceInput, intrinsicProfileInstancePlacement, isInitialAdditiveAllRecipe, requireInitialRecipeDeclaration, type RecipeClosure, type RecipeTermination } from '../model/featureRecipes';
import type { NativeRecipeSourceState } from './kernel.feature-recipes';
import { readHistoricalRecipeFace } from './kernel.recipe-face-history';
import { withNativeOwners } from './kernel.native-ownership';
import { buildExplicitFramePrimitive, resolveExplicitFrameDirections, resolveExplicitFrameUntilNext, type PrimitiveTermination } from './kernel.recipe-primitives';
import { offsetLimitFrame, principalPlaneFrame } from './kernel.frames';
import { buildEntityRecipeTool, resolveEntityRecipeDirections, resolveEntityRecipeUntilNext, type EntityRecipeSolveInput } from './kernel.recipe-entities';
import type { DirectionToolResolution } from './kernel.direction-tools';
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
  readonly datumHistory?: { datums: ReadonlyMap<string, RecipeDatumCheckpoint>; registry: SourceSketchSolveRegistry; features: readonly Feature[] };
  readonly faceHistory?: { epoch: object; states: ReadonlyMap<string, NativeRecipeSourceState> };
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
export type RecipeInstanceDirectionsResolution = DirectionToolResolution & { readonly operation: 'add' | 'subtract' };

function nativeTermination(end: RecipeTermination, input: RecipeInstanceToolInput): PrimitiveTermination {
  if (end.kind === 'blind') return { kind: 'blind', symmetric: end.symmetric };
  if (end.kind === 'throughAll') return { kind: 'throughAll', bothDirections: end.bothDirections };
  if (end.kind === 'untilNext') return { kind: 'untilNext' };
  if (end.target.kind !== 'face' && end.policy.placement !== 'instance') {
    let frame;
    if (end.target.kind === 'principal') frame = principalPlaneFrame(end.target.plane);
    else {
      const history = input.datumHistory, proof = history?.datums.get(end.target.planeId);
      if (!history || !proof) throw Error('El plano límite no pertenece al historial de la receta.');
      frame = readRecipeDatum(history.registry, proof, history.features, end.target.planeId);
    }
    if (end.policy.placement === 'transform') {
      const transform = input.closure.request.plan.transforms.find(item => item.key === input.address);
      if (!transform) throw Error('La instancia del plano límite no está activa.');
      frame = transformedLimitPlane(frame, transform);
    }
    return { kind: 'upToSurface', limit: { frame: end.offset ? offsetLimitFrame(frame, end.offset) : frame } };
  }
  const history = input.faceHistory;
  if (end.target.kind === 'face' && end.policy.placement === 'world' && end.policy.owner && history) {
    const owner = end.policy.owner, state = history.states.get(exactStateKey(owner));
    if (!state?.shape) throw Error('El cuerpo histórico de la cara límite no está disponible.');
    const face = readHistoricalRecipeFace(state.faceLease, history.epoch, owner, state.lineage, state.shape, end.target.face);
    return { kind: 'upToSurface', limit: { face }, ...(end.offset ? { offset: end.offset } : {}) };
  }
  throw Error('La referencia exacta de un límite de instancia sigue pendiente de resolución nativa.');
}

/**
 * Initial native bridge: one intrinsic selected/ALL operation/event/address/
 * target. Selected Blind depth or admitted sketch dimensions may vary.
 * The entity bridge solves the driving constraints internally. This never accepts an arbitrary caller transform or source frame and
 * never falls back to geometry-delta copying. Closure/native attestation and
 * atomic owner publication are evaluator responsibilities.
 */
function recipeInstanceContext(input: RecipeInstanceToolInput) {
  const closure = requireInitialRecipeDeclaration(input.closure);
  if (closure.request.mode !== 'regenerate' || closure.request.geometryPattern !== false ||
      closure.eligibility !== 'initial-declaration-subset') {
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
  const definition = closure.definitions.find(item => item.feature.id === input.featureId)?.feature;
  let operation: 'add' | 'subtract';
  if (definition?.type === 'cut' && node.type === 'cut') operation = 'subtract';
  else if (definition?.type === 'extrude' && node.type === 'extrude' && definition.bodyOperation?.mode === 'merge') operation = 'add';
  else throw new Error('Creation, consumption and other recipe lifecycle operations remain pending.');
  const sketch = closure.definitions.find(item => item.feature.id === resolved.sketchId)?.feature;
  if (closure.request.scope.mode !== 'selected' && operation === 'add' && (!definition || !sketch || !isInitialAdditiveAllRecipe(definition, sketch))) {
    throw new Error('ALL_POSITIVE_SCOPE_PENDING: only the intrinsic Blind additive ALL subset is enabled.');
  }
  if (closure.request.scope.mode !== 'selected' && operation === 'add') {
    if (!input.assertWorkingCurrent) throw Error('Additive ALL requires its evaluator current working-owner guard.');
    input.assertWorkingCurrent();
  }
  const termination = nativeTermination(end, input);
  const secondTermination = resolved.secondTermination ? nativeTermination(resolved.secondTermination, input) : undefined;
  return { closure, resolved, operation, termination, secondTermination, sketch };
}

/** ALL may retain an owner only when both authenticated dynamic rays prove absence. */
export function resolveRecipeInstanceDirections(input: RecipeInstanceToolInput): RecipeInstanceDirectionsResolution {
  const { closure, resolved, operation, termination, secondTermination, sketch } = recipeInstanceContext(input);
  if (closure.request.scope.mode !== 'selected' && !input.assertWorkingCurrent) throw Error('Dynamic independent directions require their current working-owner/revision guard.');
  input.assertWorkingCurrent?.();
  const allowMiss = operation === 'subtract';
  return withNativeOwners<RecipeInstanceDirectionsResolution>(owners => {
    let resolution: DirectionToolResolution;
    if (sketch?.type === 'sketch' && sketch.profile.kind === 'entities') {
      if (!input.entitySource || !input.assertWorkingCurrent) throw Error('Entity recipes require a current real-solve checkpoint and owner guard.');
      resolution = resolveEntityRecipeDirections({ source: input.entitySource, placement: resolved, termination, secondTermination,
        operation, workingTarget: input.workingTarget, validateTool: input.validateTool, assertWorkingCurrent: input.assertWorkingCurrent }, allowMiss);
    } else {
      const profile = fixedProfileInstanceInput(closure, input.featureId, input.address).profile;
      if (profile.kind !== 'rectangle' && profile.kind !== 'circle') throw Error('Unknown intrinsic recipe profile.');
      resolution = resolveExplicitFrameDirections({ profile, frame: resolved.frame, signedDepth: resolved.signedDepth,
        termination, secondTermination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
        ...(resolved.thinWall ? { thinWall: resolved.thinWall } : {}), ...(resolved.secondDirection ? { secondDirection: resolved.secondDirection } : {}) }, allowMiss);
    }
    if (resolution.kind === 'complete') owners.own(resolution.tool);
    input.assertWorkingCurrent?.(); return { ...resolution, operation };
  }, result => result.kind === 'complete' ? [result.tool] : [], 'Independent recipe directions or release failed.');
}

function resolveInstanceUntilNext(input: RecipeInstanceToolInput,
  context: ReturnType<typeof recipeInstanceContext>): RecipeInstanceUntilNextResolution {
  const { closure, resolved, operation, termination, sketch } = context;
  if (termination.kind !== 'untilNext') throw new Error('The resolution bridge requires an extracted UntilNext operation.');
  if (closure.request.scope.mode !== 'selected' && !input.assertWorkingCurrent) {
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
        ...(resolved.thinWall ? { thinWall: resolved.thinWall } : {}),
        ...(resolved.secondDirection ? { secondDirection: resolved.secondDirection } : {}) });
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
  const context = recipeInstanceContext(input), { closure, resolved, operation, termination, secondTermination, sketch } = context;
  if (resolved.secondDirection?.enabled && (termination.kind !== 'blind' || resolved.secondDirection.endCondition)) {
    const result = resolveRecipeInstanceDirections(input);
    if (result.kind === 'complete') return { operation, tool: result.tool };
    throw Error('La operación no cambia material en ninguna dirección del propietario seleccionado.');
  }
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
      termination, secondTermination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
      assertWorkingCurrent: input.assertWorkingCurrent }) };
  }
  const profile = fixedProfileInstanceInput(closure, input.featureId, input.address).profile;
  if (profile.kind !== 'rectangle' && profile.kind !== 'circle') throw new Error('Unknown intrinsic recipe profile.');
  return withNativeOwners(owners => ({ operation, tool: owners.own(buildExplicitFramePrimitive({
    profile, frame: resolved.frame, signedDepth: resolved.signedDepth,
    termination, secondTermination, operation, workingTarget: input.workingTarget, validateTool: input.validateTool,
    ...(resolved.thinWall ? { thinWall: resolved.thinWall } : {}),
    ...(resolved.secondDirection ? { secondDirection: resolved.secondDirection } : {}),
  })) }), result => [result.tool], 'Recipe instance tool construction or release failed.');
}
