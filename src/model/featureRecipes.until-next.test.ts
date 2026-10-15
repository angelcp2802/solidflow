import { expect, it } from 'vitest';
import type { BodyReference, Feature, SketchFeature } from '../cad/kernel.types';
import { extractRecipeClosure, RecipeClosureError, requireInitialRecipeDeclaration,
  type RegenerationRequest } from './featureRecipes';

// Original declaration-only fixtures. No solve, native boundary or material
// applicability is certified by extraction or by these tests.
function fixture(operation: 'cut' | 'merge' = 'cut') {
  const source: BodyReference = { bodyId: 'source-owner', sourceFeatureId: 'source-base' };
  const a: BodyReference = { bodyId: 'owner-a', sourceFeatureId: 'base-a' };
  const b: BodyReference = { bodyId: 'owner-b', sourceFeatureId: 'base-b' };
  const creation = (ref: BodyReference, x: number, depth: number): Feature[] => [
    { id: ref.sourceFeatureId + '-sketch', name: 'Original box profile', type: 'sketch', suppressed: false,
      plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [x, 4], width: 8, height: 8 } },
    { id: ref.sourceFeatureId, name: 'Original owned box', type: 'extrude', suppressed: false,
      sketchId: ref.sourceFeatureId + '-sketch', depth, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: ref.bodyId } },
  ];
  const sketch: SketchFeature = { id: 'seed-profile', name: 'Original next-boundary profile', type: 'sketch',
    suppressed: false, plane: 'XY', offset: 0, profile: { kind: 'circle', center: [4, 4], radius: 1 } };
  const seed: Feature = operation === 'cut'
    ? { id: 'seed', name: 'Original next cut', type: 'cut', suppressed: false, sketchId: sketch.id,
      depth: 1, symmetric: false, bodyScope: [source], endCondition: { kind: 'untilNext', baseFeatureId: source.sourceFeatureId } }
    : { id: 'seed', name: 'Original next merge', type: 'extrude', suppressed: false, sketchId: sketch.id,
      depth: 1, symmetric: false, bodyOperation: { mode: 'merge', target: source },
      endCondition: { kind: 'untilNext', baseFeatureId: source.sourceFeatureId } };
  const features: Feature[] = [...creation(source, 4, 5), sketch, seed, ...creation(a, 24, 9), ...creation(b, 44, 13)];
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: 'next-pattern',
    patternKind: 'linearPattern', beforeFeatureIndex: features.length, sourceFeatureIds: ['seed'],
    plan: { transforms: [{ key: '1,0', translation: [20, 0, 0] }],
      structure: ['linearPattern', [1, 0, 0], null, 2, 1, false, []] },
    scope: { mode: 'selected', targets: [a] }, targetSnapshot: [a],
    bindings: [{ source: { bodyId: source.bodyId, sourceFeatureId: seed.id }, targets: [a.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' } };
  return { features, request, source, a, b, sketch, seed };
}

it('retains the historical UntilNext source base and separately declares its current selected owner route', () => {
  const { features, request, source, a } = fixture(), before = JSON.stringify({ features, request });
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  expect(closure.operations[0].termination).toEqual({ kind: 'untilNext', baseFeatureId: source.sourceFeatureId });
  expect(closure.operations[0].applications).toEqual([{ sourcePoststate: { bodyId: source.bodyId, sourceFeatureId: 'seed' },
    sourceInput: source, targetAtPatternInput: a }]);
  expect(closure.nativeRequirements).toEqual(expect.arrayContaining([
    { kind: 'materialized-source', ref: { bodyId: source.bodyId, sourceFeatureId: 'seed' } },
    { kind: 'current-target', ref: a },
  ]));
  expect(JSON.stringify({ features, request })).toBe(before);
});

it('keeps cut ALL as complete current-owner intent without saving a derived target list', () => {
  const { features, request, a, b } = fixture();
  request.scope = { mode: 'all', reevaluateAt: 'patternInput' };
  request.targetSnapshot = [b, a]; request.bindings[0].targets = 'scope';
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  expect(closure.request.scope).toEqual({ mode: 'all', reevaluateAt: 'patternInput' });
  expect(closure.operations[0].applications.map(item => item.targetAtPatternInput)).toEqual([a, b]);
  expect(closure.nativeRequirements.filter(item => item.kind === 'current-target')).toEqual([
    { kind: 'current-target', ref: a }, { kind: 'current-target', ref: b },
  ]);
});

it('admits selected additive next-boundary intent with an exact merge owner', () => {
  const { features, request, source, a } = fixture('merge');
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  expect(closure.operations[0].type).toBe('extrude');
  expect(closure.operations[0].termination).toEqual({ kind: 'untilNext', baseFeatureId: source.sourceFeatureId });
  expect(closure.operations[0].applications[0].sourceInput).toEqual(source);
  expect(closure.operations[0].applications[0].targetAtPatternInput).toEqual(a);
});

it('admits the whole intrinsic annular entity declaration without replacing it with a nominal primitive', () => {
  const { features, request, sketch } = fixture();
  sketch.offset = 1;
  sketch.profile = { kind: 'entities', points: [{ id: 'center', x: 4, y: 4 }], entities: [
    { id: 'outer', type: 'circle', center: 'center', radius: 2, construction: false },
    { id: 'hole', type: 'circle', center: 'center', radius: 1, construction: false },
  ], constraints: [] };
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, request));
  const extracted = closure.definitions.find(item => item.feature.id === sketch.id)?.feature;
  if (extracted?.type !== 'sketch') throw new Error('Original annular declaration missing.');
  expect(extracted.profile).toEqual(sketch.profile);
  expect(extracted.offset).toBe(1);
  expect(closure.operations[0].termination?.kind).toBe('untilNext');
});

it('rejects a next-boundary base that substitutes the current target for the historical source input', () => {
  const { features, request, seed, a } = fixture();
  if (seed.type !== 'cut') throw new Error('Original cut missing.');
  seed.endCondition = { kind: 'untilNext', baseFeatureId: a.sourceFeatureId };
  try { extractRecipeClosure(features, request); throw new Error('Expected source-base rejection.'); } catch (error) {
    if (!(error instanceof RecipeClosureError)) throw error;
    expect(error.diagnostics.map(item => item.code)).toContain('SOURCE_LIMIT_BASE');
  }
});

it('rejects legacy symmetric depth instead of applying it to a unilateral next-boundary declaration', () => {
  const { features, request, seed } = fixture();
  if (seed.type !== 'cut') throw new Error('Original cut missing.');
  seed.symmetric = true;
  try { extractRecipeClosure(features, request); throw new Error('Expected symmetric declaration rejection.'); } catch (error) {
    if (!(error instanceof RecipeClosureError)) throw error;
    expect(error.diagnostics.map(item => item.code)).toContain('GEOMETRIC_SYMMETRY');
  }
});

it('retains the separate additive ALL capability gate for next-boundary merge recipes', () => {
  const { features, request } = fixture('merge');
  request.scope = { mode: 'all', reevaluateAt: 'patternInput' }; request.bindings[0].targets = 'scope';
  const closure = extractRecipeClosure(features, request);
  expect(closure.diagnostics.map(item => item.code)).toContain('ALL_POSITIVE_SCOPE_PENDING');
  expect(() => requireInitialRecipeDeclaration(closure)).toThrowError(RecipeClosureError);
});

it('changes preview intent when UntilNext is replaced by ThroughAll without rewriting the saved source', () => {
  const { features, request, seed, source } = fixture(), until = extractRecipeClosure(features, request);
  if (seed.type !== 'cut') throw new Error('Original cut missing.');
  seed.endCondition = { kind: 'throughAll', baseFeatureId: source.sourceFeatureId, bothDirections: false };
  const through = extractRecipeClosure(features, request);
  expect(through.fingerprintInput).not.toBe(until.fingerprintInput);
  expect(until.operations[0].termination?.kind).toBe('untilNext');
  expect(through.operations[0].termination?.kind).toBe('throughAll');
});
