/** Original recipe input-envelope and Cartesian arithmetic regressions.
 * These assertions do not attest native state availability or reference-target parity.
 */
import { expect, it, vi } from 'vitest';
import type { BodyReference, Feature, PlaneFrame, Vec3 } from '../cad/kernel.types';
import {
  extractRecipeClosure, recipeTransform, RecipeClosureError, RECIPE_LIMITS,
  transformedExtrusionFrame, transformedLimitPlane, validatePendingOffsetSurfaceIntent,
  type PendingOffsetSurfaceIntent, type RecipeInstanceTransform, type RegenerationRequest,
} from './featureRecipes';

const owner: BodyReference = { bodyId: 'v2-owner', sourceFeatureId: 'v2-create' };
const target: BodyReference = { bodyId: 'v2-target', sourceFeatureId: 'v2-create-target' };
function declaration(): { features: Feature[]; request: RegenerationRequest } {
  const features: Feature[] = [
    { id: 'v2-base-sketch', type: 'sketch', name: 'Original source rectangle', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [5, 5], width: 10, height: 10 }, suppressed: false },
    { id: owner.sourceFeatureId, type: 'extrude', name: 'Original source', sketchId: 'v2-base-sketch',
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: owner.bodyId }, suppressed: false },
    { id: 'v2-cut-sketch', type: 'sketch', name: 'Original fixed circle', plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [5, 5], radius: 1 }, suppressed: false },
    { id: 'v2-cut', type: 'cut', name: 'Original owned cut', sketchId: 'v2-cut-sketch',
      depth: 1, symmetric: false, bodyScope: [owner], suppressed: false },
    { id: 'v2-target-sketch', type: 'sketch', name: 'Original target rectangle', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [25, 5], width: 10, height: 10 }, suppressed: false },
    { id: target.sourceFeatureId, type: 'extrude', name: 'Original target', sketchId: 'v2-target-sketch',
      depth: 4, symmetric: false, bodyOperation: { mode: 'new', bodyId: target.bodyId }, suppressed: false },
  ];
  return { features, request: {
    mode: 'regenerate', geometryPattern: false, patternId: 'v2-pattern', patternKind: 'linearPattern',
    beforeFeatureIndex: features.length, sourceFeatureIds: ['v2-cut'],
    plan: { transforms: [{ key: '1,0', translation: [20, 0, 0] }], structure: ['original-linear'] },
    scope: { mode: 'selected', targets: [target] }, targetSnapshot: [target],
    bindings: [{ source: { bodyId: owner.bodyId, sourceFeatureId: 'v2-cut' }, targets: [target.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' },
  } };
}
function codes(action: () => unknown): string[] {
  try { action(); } catch (error) {
    if (!(error instanceof RecipeClosureError)) throw error;
    return error.diagnostics.map(item => item.code);
  }
  return [];
}
const frame = (): PlaneFrame => ({ origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] });
const translation = (): RecipeInstanceTransform => ({ key: '1,0', translation: [20, 0, 0] });
function faceOffset(placement: 'world' | 'transform' | 'instance'): PendingOffsetSurfaceIntent {
  return { target: { kind: 'face', face: { sourceFeatureId: owner.sourceFeatureId, key: 'opaque-original-face-role' } },
    policy: { featureId: 'v2-cut', path: 'endCondition.target', placement, owner: { ...owner } },
    construction: 'normal', signedDistanceMm: 1 };
}

it('aggregates several individually bounded property names into one copy budget', () => {
  const { features, request } = declaration(), structure: Record<string, number> = {};
  for (let index = 0; index < 20; index++) structure[`${index}-${'k'.repeat(60_000)}`] = index;
  request.plan.structure = structure;
  expect(codes(() => extractRecipeClosure(features, request))).toContain('RECIPE_DATA_BUDGET');
});

it('charges both property names and string values to the same input envelope', () => {
  const { features, request } = declaration();
  request.plan.structure = { ['k'.repeat(600_000)]: 'v'.repeat(600_000) };
  expect(codes(() => extractRecipeClosure(features, request))).toContain('RECIPE_DATA_BUDGET');
});

it('bounds escaped canonical output even when copied string payload is within its input envelope', () => {
  const { features, request } = declaration();
  request.plan.structure = '\u0000'.repeat(RECIPE_LIMITS.jsonCharacters / 4);
  expect(codes(() => extractRecipeClosure(features, request))).toContain('RECIPE_DATA_BUDGET');
});

it('uses UTF-16 code units for surrogate-pair property names rather than counting glyphs', () => {
  const { features, request } = declaration();
  request.plan.structure = { ['\uD83D\uDE80'.repeat(RECIPE_LIMITS.jsonCharacters / 2 + 1)]: 0 };
  expect(codes(() => extractRecipeClosure(features, request))).toContain('RECIPE_DATA_BUDGET');
});

it('rejects an array-subclass axis at the raw transform boundary', () => {
  class CustomVector extends Array<number> {}
  const axis = CustomVector.from([0, 0, 1]) as unknown as Vec3;
  expect(() => recipeTransform({ key: '1', angle: 90, origin: [0, 0, 0], direction: axis })).toThrow(RecipeClosureError);
});

it('rejects a hidden extra property on a raw vector method input', () => {
  const value: Vec3 = [1, 2, 3];
  Object.defineProperty(value, 'hidden', { value: true, enumerable: false });
  expect(() => recipeTransform(translation()).vector(value)).toThrow(RecipeClosureError);
});

it('rejects a symbol property on a raw point method input', () => {
  const value: Vec3 = [1, 2, 3];
  Object.defineProperty(value, Symbol('original-symbol'), { value: true });
  expect(() => recipeTransform(translation()).point(value)).toThrow(RecipeClosureError);
});

it('rejects a numeric vector accessor without invoking it after transform construction', () => {
  const value: Vec3 = [1, 2, 3], getter = vi.fn(() => 2);
  Object.defineProperty(value, '1', { enumerable: true, get: getter });
  expect(() => recipeTransform(translation()).vector(value)).toThrow(RecipeClosureError);
  expect(getter).not.toHaveBeenCalled();
});

it('rejects a hidden raw transform operand instead of treating it as saved JSON data', () => {
  const raw = { key: '1,0' } as RecipeInstanceTransform;
  Object.defineProperty(raw, 'translation', { enumerable: false, value: [20, 0, 0] });
  expect(() => recipeTransform(raw)).toThrow(RecipeClosureError);
});

it('rejects an inherited source frame without repairing its prototype', () => {
  const raw = Object.assign(Object.create({ origin: [0, 0, 0] }), { xDirection: [1, 0, 0], normal: [0, 0, 1] }) as PlaneFrame;
  expect(() => transformedExtrusionFrame(raw, 4, translation())).toThrow(RecipeClosureError);
});

it('rejects a limiting-plane frame accessor without invoking it', () => {
  const raw = { xDirection: [1, 0, 0], normal: [0, 0, 1] } as PlaneFrame, getter = vi.fn(() => [0, 0, 6]);
  Object.defineProperty(raw, 'origin', { enumerable: true, get: getter });
  expect(() => transformedLimitPlane(raw, translation())).toThrow(RecipeClosureError);
  expect(getter).not.toHaveBeenCalled();
});

it('rejects an overflowing rotated vector instead of returning infinite coordinates', () => {
  const mapping = recipeTransform({ key: '1', angle: -45, origin: [0, 0, 0], direction: [0, 0, 1] });
  expect(codes(() => mapping.vector([Number.MAX_VALUE, Number.MAX_VALUE, 0]))).toContain('FRAME_ARITHMETIC');
});

it('rejects overflowing rotation-origin subtraction even when all raw coordinates are finite', () => {
  const mapping = recipeTransform({ key: '1', angle: 90, origin: [-Number.MAX_VALUE, 0, 0], direction: [0, 0, 1] });
  expect(codes(() => mapping.point([Number.MAX_VALUE, 0, 0]))).toContain('FRAME_ARITHMETIC');
});

it('rejects an overflowing mapped extrusion origin before producing builder input', () => {
  const source = frame(); source.origin = [Number.MAX_VALUE, 0, 0];
  expect(codes(() => transformedExtrusionFrame(source, 4, { key: '1,0', translation: [Number.MAX_VALUE, 0, 0] }))).toContain('FRAME_ARITHMETIC');
});

it('retains an explicit instance parent-route selector as pending intent without guessing a face', () => {
  const raw = faceOffset('instance'); raw.policy.parentTargetBodyId = target.bodyId;
  const validated = validatePendingOffsetSurfaceIntent(raw);
  expect(validated.policy).toEqual(raw.policy);
  expect(Object.isFrozen(validated.policy)).toBe(true);
  expect(validated.target).toEqual(raw.target);
});

it('rejects a stale instance-only route on a world face offset', () => {
  const raw = faceOffset('world'); raw.policy.parentTargetBodyId = target.bodyId;
  expect(codes(() => validatePendingOffsetSurfaceIntent(raw))).toContain('REFERENCE_POLICY');
});

it('rejects a stale instance-only route on a transformed face offset', () => {
  const raw = faceOffset('transform'); raw.policy.parentTargetBodyId = target.bodyId;
  expect(codes(() => validatePendingOffsetSurfaceIntent(raw))).toContain('REFERENCE_POLICY');
});

it('rejects an empty instance parent-route selector without substituting the source owner', () => {
  const raw = faceOffset('instance'); raw.policy.parentTargetBodyId = '   ';
  expect(codes(() => validatePendingOffsetSurfaceIntent(raw))).toContain('INVALID_ID');
});

it('rejects a stale instance-only route consistently on an extracted external face policy', () => {
  const { features, request } = declaration(), sketch = features.find(feature => feature.id === 'v2-cut-sketch');
  if (!sketch || sketch.type !== 'sketch') throw new Error('Original declaration missing.');
  sketch.support = { kind: 'face', face: { sourceFeatureId: owner.sourceFeatureId, key: 'opaque-original-face-role' } };
  request.referencePolicies = [{ featureId: sketch.id, path: 'support', placement: 'world', owner,
    parentTargetBodyId: target.bodyId }];
  expect(codes(() => extractRecipeClosure(features, request))).toContain('REFERENCE_POLICY');
});

it('preserves a Cartesian quarter turn beyond one revolution within canonical-plan bounds', () => {
  const mapping = recipeTransform({ key: '5', angle: 450, origin: [2, 3, 4], direction: [0, 0, 1] });
  const point = mapping.point([4, 3, 5]), vector = mapping.vector([2, 0, 1]);
  expect(point[0]).toBeCloseTo(2, 12); expect(point[1]).toBeCloseTo(5, 12); expect(point[2]).toBe(5);
  expect(vector[0]).toBeCloseTo(0, 12); expect(vector[1]).toBeCloseTo(2, 12); expect(vector[2]).toBe(1);
});
