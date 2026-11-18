import { captureRecipeAutoInput } from '../model/featureRecipeAutoInput';
import { RECIPE_EVALUATOR_REVISION, type RecipeAutoScopeCapture } from '../model/featureRecipeAutoScope';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';

/** Independent native discovery; no displayed/committed engine or file is mutated. */
export function discoverFeatureRecipeAutoScope(features: unknown, patternId: unknown): RecipeAutoScopeCapture {
  const input = captureRecipeAutoInput(features, patternId);
  return withNativeOwners(owners => {
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() });
    const scope = engine.buildForAutoScopeDiscovery(input.features.slice(0, input.index + 1), input.patternId);
    return { kind: 'feature-recipe-auto-scope', patternId: input.patternId,
      sourceFeaturesSignature: input.sourceFeaturesSignature, evaluatorRevision: RECIPE_EVALUATOR_REVISION, scope };
  }, undefined, 'AUTO scope discovery or temporary native engine cleanup failed.');
}
