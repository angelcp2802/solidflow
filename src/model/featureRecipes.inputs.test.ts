/** Original input-envelope regressions for recipe declarations.
 * Finite numeric/plain-record inputs; no native fixture or external sample.
 */
import { expect, it } from 'vitest';
import type { BodyReference, Feature } from '../cad/kernel.types';
import {
  extractRecipeClosure, recipeTransform, RecipeClosureError, RECIPE_LIMITS,
  validatePendingOffsetSurfaceIntent, type RegenerationRequest,
} from './featureRecipes';

function originalDeclaration(): { features: Feature[]; request: RegenerationRequest } {
  const source: BodyReference = { bodyId: 'budget-owner', sourceFeatureId: 'budget-create' };
  const target: BodyReference = { bodyId: 'budget-target', sourceFeatureId: 'budget-create-target' };
  const features: Feature[] = [
    { id: 'budget-base-profile', type: 'sketch', name: 'Original box profile', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [5, 5], width: 10, height: 10 }, suppressed: false },
    { id: source.sourceFeatureId, type: 'extrude', name: 'Original source owner', sketchId: 'budget-base-profile',
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: source.bodyId }, suppressed: false },
    { id: 'budget-cut-profile', type: 'sketch', name: 'Original circle', plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [5, 5], radius: 1 }, suppressed: false },
    { id: 'budget-cut', type: 'cut', name: 'Original fixed cut', sketchId: 'budget-cut-profile',
      depth: 1, symmetric: false, bodyScope: [source], suppressed: false },
    { id: 'budget-target-profile', type: 'sketch', name: 'Original target profile', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [25, 5], width: 10, height: 10 }, suppressed: false },
    { id: target.sourceFeatureId, type: 'extrude', name: 'Original target owner', sketchId: 'budget-target-profile',
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: target.bodyId }, suppressed: false },
  ];
  const request: RegenerationRequest = {
    mode: 'regenerate', geometryPattern: false, patternId: 'budget-pattern', patternKind: 'linearPattern',
    beforeFeatureIndex: features.length, sourceFeatureIds: ['budget-cut'],
    plan: { transforms: [{ key: '1,0', translation: [20, 0, 0] }], structure: ['linearPattern'] },
    scope: { mode: 'selected', targets: [target] }, targetSnapshot: [target],
    bindings: [{ source: { bodyId: source.bodyId, sourceFeatureId: 'budget-cut' }, targets: [target.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' },
  };
  return { features, request };
}
function failureCodes(action: () => unknown): string[] {
  try { action(); } catch (error) {
    if (!(error instanceof RecipeClosureError)) throw error;
    return error.diagnostics.map(item => item.code);
  }
  return [];
}

it('charges oversized own property names to the detached recipe character envelope', () => {
  const { features, request } = originalDeclaration();
  request.plan.structure = { ['k'.repeat(RECIPE_LIMITS.jsonCharacters + 1)]: 0 };
  expect(failureCodes(() => extractRecipeClosure(features, request))).toContain('RECIPE_DATA_BUDGET');
});

it('rejects finite axis components whose normalization length overflows', () => {
  expect(() => recipeTransform({
    key: '1', angle: 90, origin: [0, 0, 0], direction: [Number.MAX_VALUE, Number.MAX_VALUE, 0],
  })).toThrow(RecipeClosureError);
});

it('rejects a finite angle that would overflow the current radians conversion', () => {
  expect(() => recipeTransform({
    key: '1', angle: Number.MAX_VALUE, origin: [0, 0, 0], direction: [0, 0, 1],
  })).toThrow(RecipeClosureError);
});

it('requires a parent target-owner selector for a pending instance-face offset intent', () => {
  expect(() => validatePendingOffsetSurfaceIntent({
    target: { kind: 'face', face: { sourceFeatureId: 'original-parent', key: 'opaque-top-role' } },
    policy: { featureId: 'original-child', path: 'endCondition.target', placement: 'instance',
      owner: { bodyId: 'original-owner', sourceFeatureId: 'original-parent' } },
    construction: 'normal', signedDistanceMm: 1,
  })).toThrow(RecipeClosureError);
});
