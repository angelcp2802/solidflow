import { expect, it } from 'vitest';
import type { Feature, RepetitionFeature, SketchFeature } from '../cad/kernel.types';
import { patternPlan } from '../cad/kernel.patterns';
import { extractRecipeClosure, fixedProfileInstanceInput, intrinsicProfileInstancePlacement,
  requireInitialRecipeDeclaration, type RegenerationRequest } from './featureRecipes';

// Original declaration fixtures. A structurally eligible entity declaration
// does not assert a successful solve, native tool or materialized owner.
function fixture() {
  const features: Feature[] = [
    { id: 'base-sketch', type: 'sketch', name: 'Original source owner', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [5, 5], width: 10, height: 10 } },
    { id: 'create-S', type: 'extrude', name: 'Original source prism', suppressed: false, sketchId: 'base-sketch', depth: 4,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: 'S' } },
    { id: 'entity', type: 'sketch', name: 'Original nominal circle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'entities', points: [{ id: 'c', x: 5, y: 5 }],
        entities: [{ id: 'circle', type: 'circle', center: 'c', radius: 1, construction: false }], constraints: [] } },
    { id: 'seed', type: 'cut', name: 'Original source cut', suppressed: false, sketchId: 'entity', depth: 1, symmetric: false,
      bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-S' }], endCondition: { kind: 'throughAll', baseFeatureId: 'create-S', bothDirections: false } },
    { id: 'target-sketch', type: 'sketch', name: 'Original target owner', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [25, 5], width: 10, height: 10 } },
    { id: 'create-A', type: 'extrude', name: 'Original target prism', suppressed: false, sketchId: 'target-sketch', depth: 8,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: 'A' } },
  ];
  const pattern: RepetitionFeature = { id: 'pattern', name: 'Original plan', type: 'linearPattern', suppressed: false,
    baseFeatureId: 'create-A', source: { mode: 'features', geometryPattern: false, featureIds: ['seed'] },
    first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [] };
  const target = { bodyId: 'A', sourceFeatureId: 'create-A' };
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: pattern.id, patternKind: pattern.type,
    beforeFeatureIndex: features.length, sourceFeatureIds: ['seed'], plan: patternPlan(pattern), scope: { mode: 'selected', targets: [target] },
    targetSnapshot: [target], bindings: [{ source: { bodyId: 'S', sourceFeatureId: 'seed' }, targets: ['A'] }], referencePolicies: [], variation: { kind: 'none' } };
  return { features, request, sketch: features[2] as SketchFeature };
}
it('extracts intrinsic entity placement without issuing solved geometry or weakening the primitive adapter', () => {
  const { features, request } = fixture(), closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  const placement = intrinsicProfileInstancePlacement(closure, 'seed', '1,0');
  expect(placement.sketchId).toBe('entity'); expect(placement.sourceFrame.origin).toEqual([0, 0, 0]);
  expect(placement.frame.origin).toEqual([20, 0, 0]); expect(Object.hasOwn(placement, 'profile')).toBe(false);
  expect(() => fixedProfileInstanceInput(closure, 'seed', '1,0')).toThrow('unsolved entity');
  expect(() => intrinsicProfileInstancePlacement(closure, 'seed', '2,0')).toThrow('active');
});
it('retains associative sketch/plane diagnostics for a saved datum support', () => {
  const { features, request, sketch } = fixture();
  features.splice(2, 0, { id: 'source-datum', name: 'Original earlier XY datum', type: 'plane', suppressed: false,
    support: { kind: 'principal', plane: 'XY' }, offset: 0, reversed: false });
  sketch.support = { kind: 'plane', planeId: 'source-datum' };
  request.beforeFeatureIndex = features.length;
  request.referencePolicies = [{ featureId: sketch.id, path: 'support', placement: 'transform' },
    { featureId: 'source-datum', path: 'support', placement: 'world' }];
  const closure = extractRecipeClosure(features, request);
  expect(closure.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['ASSOCIATIVE_SKETCH_PENDING', 'ASSOCIATIVE_PLANE_PENDING', 'SOLVED_PROFILE_PENDING']));
  expect(() => requireInitialRecipeDeclaration(closure)).toThrow();
});
it('retains variation diagnostics rather than treating varied entities as fixed replay', () => {
  const { features, request } = fixture();
  request.variation = { kind: 'dimensions', values: [{ address: '1,0', featureId: 'seed', parameter: 'depth', value: 2 }] };
  expect(extractRecipeClosure(features, request).diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['VARIATION_PENDING', 'SOLVED_PROFILE_PENDING']));
});
it('extracts fixed UntilNext entity intent without issuing native solve or boundary authority', () => {
  const { features, request } = fixture();
  const seed = features[3]; if (seed.type !== 'cut') throw new Error('Original cut missing.');
  seed.endCondition = { kind: 'untilNext', baseFeatureId: 'create-S' };
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  expect(closure.operations[0].termination).toEqual({ kind: 'untilNext', baseFeatureId: 'create-S' });
  const placement = intrinsicProfileInstancePlacement(closure, 'seed', '1,0');
  expect(placement.frame.origin).toEqual([20, 0, 0]);
  expect(Object.hasOwn(placement, 'profile')).toBe(false);
  expect(() => fixedProfileInstanceInput(closure, 'seed', '1,0')).toThrow('unsolved entity');
});
it('retains additive ALL, AUTO and nested-operation gates', () => {
  const { features, request } = fixture();
  features[3] = { id: 'seed', type: 'extrude', name: 'Original merge', suppressed: false, sketchId: 'entity', depth: 2,
    symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: 'S', sourceFeatureId: 'create-S' } } };
  request.scope = { mode: 'all', reevaluateAt: 'patternInput' }; request.bindings[0].targets = 'scope';
  expect(extractRecipeClosure(features, request).diagnostics.map(item => item.code)).toContain('ALL_POSITIVE_SCOPE_PENDING');
  request.scope = { mode: 'auto', capturedBodyIds: ['A'], captureFingerprint: 'original-unissued-capture', follow: 'sameIdentityAtPatternInput' };
  expect(extractRecipeClosure(features, request).diagnostics.map(item => item.code)).toContain('AUTO_DISCOVERY_PENDING');
  const nested: RepetitionFeature = { id: 'seed', name: 'Original nested declaration', type: 'linearPattern', suppressed: false,
    baseFeatureId: 'create-S', source: { mode: 'features', geometryPattern: true, featureIds: ['create-S'] },
    first: { direction: [1, 0, 0], spacing: 2, count: 2 }, second: null, secondSeedOnly: false, skipped: [] };
  features[3] = nested; request.scope = { mode: 'selected', targets: request.targetSnapshot }; request.bindings[0].targets = ['A'];
  expect(extractRecipeClosure(features, request).diagnostics.map(item => item.code)).toContain('OPERATION_RECIPE_PENDING');
});
