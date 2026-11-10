import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { validateDocument } from './document';
import { extractRecipeClosure, fixedProfileInstanceInput, RecipeClosureError, requireInitialRecipeDeclaration, type RegenerationRequest } from './featureRecipes';
import type { Feature } from '../cad/kernel.types';

// Declaration/input tests only; no native applicability or publication claim.
const require = createRequire(import.meta.url);
function fixture() {
  const features = validateDocument(require('../../scripts/desktop-part-additive-all-original.cjs')()).features;
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: 'positive-all', patternKind: 'linearPattern',
    beforeFeatureIndex: features.length, sourceFeatureIds: ['seed-cap'], plan: { transforms: [{ key: '1,0', translation: [10, 0, 0] }], structure: ['original-additive-declaration'] },
    scope: { mode: 'all', reevaluateAt: 'patternInput' }, targetSnapshot: [
      { bodyId: 'A', sourceFeatureId: 'seed-cap' }, { bodyId: 'B', sourceFeatureId: 'create-b' }, { bodyId: 'C', sourceFeatureId: 'create-c' }],
    bindings: [{ source: { bodyId: 'A', sourceFeatureId: 'seed-cap' }, targets: 'scope' }], referencePolicies: [], variation: { kind: 'none' } };
  return { features, request };
}
it.each(['rectangle', 'circle'] as const)('admits only the explicit intrinsic Blind merge declaration for %s', kind => {
  const { features, request } = fixture(), sketch = features[2];
  if (sketch.type !== 'sketch') throw Error('Original cap sketch required');
  sketch.profile = kind === 'circle' ? { kind, center: [1, 1], radius: 1 } : { kind, center: [1, 1], width: 2, height: 2 };
  const before = JSON.stringify({ features, request }), closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  expect(closure.diagnostics).toEqual([]); expect(closure.eligibility).toBe('initial-declaration-subset');
  const placed = fixedProfileInstanceInput(closure, 'seed-cap', '1,0');
  expect(placed.frame.origin).toEqual([10, 0, 4]); expect(placed.signedDepth).toBe(2); expect(placed.profile.kind).toBe(kind);
  expect(JSON.stringify({ features, request })).toBe(before); expect(Object.isFrozen(features[3])).toBe(false);
});
it.each(['support', 'entities', 'thin', 'direction-off', 'through-all', 'until-next'] as const)('keeps %s positive ALL explicitly pending', variant => {
  const { features, request } = fixture(), source = features[3], sketch = features[2];
  if (source.type !== 'extrude' || sketch.type !== 'sketch') throw Error('Original positive cap required');
  if (variant === 'support') {
    features.splice(2, 0, { id: 'source-plane', name: 'Original declared source plane', type: 'plane',
      support: { kind: 'principal', plane: 'XY' }, offset: 0, reversed: false, suppressed: false });
    sketch.support = { kind: 'plane', planeId: 'source-plane' }; request.beforeFeatureIndex = features.length;
    request.referencePolicies = [{ featureId: sketch.id, path: 'support', placement: 'world' },
      { featureId: 'source-plane', path: 'support', placement: 'world' }];
  }
  if (variant === 'entities') sketch.profile = { kind: 'entities', points: [
    { id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }, { id: 'c', x: 2, y: 2 }, { id: 'd', x: 0, y: 2 }],
  entities: ['a', 'b', 'c', 'd'].map((id, i, ids) => ({ id: 'edge-' + id, type: 'line' as const, start: id, end: ids[(i + 1) % 4], construction: false })), constraints: [] };
  if (variant === 'thin') source.thinWall = { kind: 'one-side', thickness: 1, reversed: false };
  if (variant === 'direction-off') source.secondDirection = { enabled: false, depth: 2 };
  if (variant === 'through-all') source.endCondition = { kind: 'throughAll', baseFeatureId: 'create-a', bothDirections: false };
  if (variant === 'until-next') source.endCondition = { kind: 'untilNext', baseFeatureId: 'create-a' };
  const before = JSON.stringify({ features, request }), closure = extractRecipeClosure(features, request);
  expect(closure.diagnostics.map(d => d.code)).toContain('ALL_POSITIVE_SCOPE_PENDING'); expect(closure.eligibility).toBe('pending-capability');
  expect(() => requireInitialRecipeDeclaration(closure)).toThrow(RecipeClosureError); expect(JSON.stringify({ features, request })).toBe(before);
});
it('rejects executable positive inputs before inspecting applicability eligibility', () => {
  const { features, request } = fixture(), read = vi.fn(() => 2);
  Object.defineProperty(features[3], 'depth', { enumerable: true, get: read });
  expect(() => extractRecipeClosure(features, request)).toThrow(); expect(read).not.toHaveBeenCalled();
});
it('retains an exact symbolic target requirement without certifying that native owner exists', () => {
  const { features, request } = fixture(), wrong = { bodyId: 'B', sourceFeatureId: 'seed-cap' };
  request.targetSnapshot[1] = wrong;
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  expect(closure.nativeRequirements.some(r => r.kind === 'current-target' && JSON.stringify(r.ref) === JSON.stringify(wrong))).toBe(true);
  expect(closure.request.targetSnapshot).toContainEqual(wrong); // Native scope attestation must reject it; extraction never substitutes another state.
});
it('rejects a source binding to a different body instead of inventing source ownership', () => {
  const { features, request } = fixture(); request.bindings[0].source = { bodyId: 'B', sourceFeatureId: 'seed-cap' };
  expect(() => requireInitialRecipeDeclaration(extractRecipeClosure(features as Feature[], request))).toThrow();
});
