/** Original synthetic recipe declarations and Cartesian frame expectations; no native CAD evaluation. */
import { expect, it, vi } from 'vitest';
import type { BodyReference, Feature, PlaneFrame } from '../cad/kernel.types';
import {
  extractRecipeClosure, fixedProfileInstanceInput, RecipeClosureError, recipeTransform,
  requireInitialRecipeDeclaration, transformedExtrusionFrame, transformedLimitPlane,
  validatePendingOffsetSurfaceIntent, type RegenerationRequest,
} from './featureRecipes';

const a: BodyReference = { bodyId: 'recipe-a', sourceFeatureId: 'create-a' };
const target: BodyReference = { bodyId: 'recipe-target', sourceFeatureId: 'create-target' };
function creation(id: string, bodyId: string, centerX: number): Feature[] {
  return [
    { id: `${id}-sketch`, type: 'sketch', name: 'Original rectangle', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [centerX, 5], width: 10, height: 10 }, suppressed: false },
    { id, type: 'extrude', name: 'Original owner', sketchId: `${id}-sketch`, depth: 4,
      symmetric: false, bodyOperation: { mode: 'new', bodyId }, suppressed: false },
  ];
}
function fixture(): { features: Feature[]; request: RegenerationRequest } {
  const features: Feature[] = [
    ...creation('create-a', a.bodyId, 5),
    { id: 'cut-sketch', type: 'sketch', name: 'Original R1 source', plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [5, 5], radius: 1 }, suppressed: false },
    { id: 'cut', type: 'cut', name: 'Original source through-all', sketchId: 'cut-sketch', depth: 1,
      symmetric: false, bodyScope: [a], endCondition: { kind: 'throughAll', baseFeatureId: a.sourceFeatureId, bothDirections: false }, suppressed: false },
    ...creation(target.sourceFeatureId, target.bodyId, 25),
  ];
  const request: RegenerationRequest = {
    mode: 'regenerate', geometryPattern: false, patternId: 'recipe-pattern', patternKind: 'linearPattern',
    beforeFeatureIndex: features.length, sourceFeatureIds: ['cut'],
    plan: { transforms: [{ key: '1,0', translation: [20, 0, 0] }], structure: ['linearPattern', [1, 0, 0], null, 2, 1, false, []] },
    scope: { mode: 'selected', targets: [target] }, targetSnapshot: [target],
    bindings: [{ source: { bodyId: a.bodyId, sourceFeatureId: 'cut' }, targets: [target.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' },
  };
  return { features, request };
}
function orderedFixture(): ReturnType<typeof fixture> {
  const { features, request } = fixture();
  features.splice(2, 0,
    { id: 'boss-sketch', type: 'sketch', name: 'Original 2x2 boss', plane: 'XY', offset: 4,
      profile: { kind: 'rectangle', center: [5, 5], width: 2, height: 2 }, suppressed: false },
    { id: 'boss', type: 'extrude', name: 'Original selected parent', sketchId: 'boss-sketch', depth: 2,
      symmetric: false, bodyOperation: { mode: 'merge', target: a }, suppressed: false });
  const cut = features.find(feature => feature.id === 'cut');
  if (!cut || cut.type !== 'cut') throw new Error('Original fixture declaration missing.');
  cut.bodyScope = [{ bodyId: a.bodyId, sourceFeatureId: 'boss' }];
  cut.endCondition = { kind: 'throughAll', baseFeatureId: 'boss', bothDirections: false };
  request.beforeFeatureIndex = features.length;
  request.sourceFeatureIds = ['cut', 'boss']; // Deliberately reversed UI order.
  request.bindings.push({ source: { bodyId: a.bodyId, sourceFeatureId: 'boss' }, targets: [target.bodyId] });
  return { features, request };
}
function codes(action: () => unknown): string[] {
  try { action(); } catch (error) {
    if (!(error instanceof RecipeClosureError)) throw error;
    return error.diagnostics.map(item => item.code);
  }
  return []; // An unexpectedly successful action cannot satisfy a rejection assertion.
}

it('extracts definitions without replaying the owner-creation prefix or claiming native availability', () => {
  const { features, request } = fixture(), closure = extractRecipeClosure(features, request);
  expect(closure.operations.map(operation => operation.featureId)).toEqual(['cut']);
  expect(closure.definitions.map(definition => definition.feature.id)).toEqual([
    'create-a-sketch', 'create-a', 'cut-sketch', 'cut', 'create-target-sketch', 'create-target',
  ]);
  expect(closure.operations[0].applications).toEqual([{ sourcePoststate: { bodyId: a.bodyId, sourceFeatureId: 'cut' },
    sourceInput: a, targetAtPatternInput: target }]);
  expect(closure.nativeRequirements.map(requirement => requirement.kind).sort()).toEqual(['current-target', 'materialized-source']);
  expect(closure.eligibility).toBe('initial-declaration-subset'); // Declaration classification, no native PASS.
});

it('orders selected operations by history and binds a selected parent to the same owner route', () => {
  const { features, request } = orderedFixture(), closure = extractRecipeClosure(features, request);
  expect(closure.operations.map(operation => operation.featureId)).toEqual(['boss', 'cut']);
  expect(closure.operations[1].applications[0].selectedParent).toEqual({
    sourcePoststate: { bodyId: a.bodyId, sourceFeatureId: 'boss' }, targetBodyId: target.bodyId, outputRole: 'body',
  });
});

it('keeps distinct exact owner inputs for one multi-output cut even with coincident source boxes', () => {
  const { features, request } = fixture(), b = { bodyId: 'recipe-b', sourceFeatureId: 'create-b' };
  features.splice(2, 0, ...creation(b.sourceFeatureId, b.bodyId, 5));
  const cut = features.find(feature => feature.id === 'cut');
  if (!cut || cut.type !== 'cut') throw new Error('Original source cut missing.');
  cut.bodyScope = [a, b]; request.beforeFeatureIndex = features.length;
  request.bindings.push({ source: { bodyId: b.bodyId, sourceFeatureId: 'cut' }, targets: [target.bodyId] });
  const closure = extractRecipeClosure(features, request);
  expect(closure.operations).toHaveLength(1);
  expect(closure.operations[0].applications.map(application => application.sourceInput)).toEqual([a, b]);
  expect(closure.nativeRequirements.filter(requirement => requirement.kind === 'materialized-source')).toEqual([
    { kind: 'materialized-source', ref: { bodyId: a.bodyId, sourceFeatureId: 'cut' } },
    { kind: 'materialized-source', ref: { bodyId: b.bodyId, sourceFeatureId: 'cut' } },
  ]);
});

it('rejects an internal parent routed only to another target', () => {
  const { features, request } = orderedFixture(), other = { bodyId: 'recipe-other', sourceFeatureId: 'create-other' };
  features.push(...creation(other.sourceFeatureId, other.bodyId, 45)); request.beforeFeatureIndex = features.length;
  request.targetSnapshot.push(other); request.scope = { mode: 'selected', targets: [target, other] };
  request.bindings.find(binding => binding.source.sourceFeatureId === 'cut')!.targets = [other.bodyId];
  expect(codes(() => extractRecipeClosure(features, request))).toContain('SELECTED_PARENT_OWNER_ROUTE');
});

it('detaches and freezes extracted data while preserving editable inputs', () => {
  const { features, request } = fixture(), before = JSON.stringify({ features, request });
  const closure = extractRecipeClosure(features, request);
  expect(JSON.stringify({ features, request })).toBe(before);
  expect(Object.isFrozen(features)).toBe(false); expect(Object.isFrozen(request.bindings)).toBe(false);
  expect(Object.isFrozen(closure.definitions[0].feature)).toBe(true);
  expect(Object.isFrozen(closure.operations[0].applications[0].targetAtPatternInput)).toBe(true);
  request.plan.transforms[0] = { key: '1,0', translation: [40, 0, 0] };
  expect(closure.request.plan.transforms[0]).toEqual({ key: '1,0', translation: [20, 0, 0] });
});

it('stales the fingerprint when target parameters change while exact reference IDs remain equal', () => {
  const { features, request } = fixture(), before = extractRecipeClosure(features, request).fingerprintInput;
  const index = features.findIndex(feature => feature.id === target.sourceFeatureId), feature = features[index];
  if (feature.type !== 'extrude') throw new Error('Original target declaration missing.');
  features[index] = { ...feature, depth: 8 };
  expect(extractRecipeClosure(features, request).fingerprintInput).not.toBe(before);
  expect(request.targetSnapshot).toEqual([target]);
});

it('stales the fingerprint when spacing changes at the same active address', () => {
  const { features, request } = fixture(), before = extractRecipeClosure(features, request).fingerprintInput;
  request.plan.transforms[0] = { key: '1,0', translation: [25, 0, 0] };
  expect(extractRecipeClosure(features, request).fingerprintInput).not.toBe(before);
});

it('excludes unrelated prefix declarations from recipe evaluation and parameter identity', () => {
  const { features, request } = fixture();
  features.unshift({ id: 'unrelated', name: 'Original unrelated sketch', type: 'sketch', plane: 'XY', offset: 99,
    profile: { kind: 'circle', center: [100, 100], radius: 2 }, suppressed: false });
  request.beforeFeatureIndex = features.length;
  const before = extractRecipeClosure(features, request);
  const unrelated = features[0];
  if (unrelated.type !== 'sketch') throw new Error('Original unrelated declaration missing.');
  unrelated.offset = 200;
  const after = extractRecipeClosure(features, request);
  expect(after.fingerprintInput).toBe(before.fingerprintInput);
  expect(after.definitions.some(definition => definition.feature.id === 'unrelated')).toBe(false);
});

it('rejects request accessors without invoking them', () => {
  const { features, request } = fixture(), getter = vi.fn(() => 'not-a-saved-value');
  Object.defineProperty(request, 'patternId', { enumerable: true, get: getter });
  expect(codes(() => extractRecipeClosure(features, request))).toContain('NON_JSON_RECIPE');
  expect(getter).not.toHaveBeenCalled();
});

it('rejects a forward support reference at its consumer rather than guessing another plane', () => {
  const { features, request } = fixture(), sketch = features.find(feature => feature.id === 'cut-sketch');
  if (!sketch || sketch.type !== 'sketch') throw new Error('Original source sketch missing.');
  sketch.support = { kind: 'plane', planeId: 'later-plane' };
  features.push({ id: 'later-plane', name: 'Original late plane', type: 'plane', support: { kind: 'principal', plane: 'XY' }, offset: 6, reversed: false, suppressed: false });
  request.beforeFeatureIndex = features.length;
  expect(codes(() => extractRecipeClosure(features, request))).toContain('MISSING_OR_FORWARD_DEPENDENCY');
});

it('does not associate an undeclared body with a selected feature by geometry', () => {
  const { features, request } = fixture(); request.bindings[0].source.bodyId = 'coincident-but-unowned';
  expect(codes(() => extractRecipeClosure(features, request))).toContain('SOURCE_OWNER_OUTPUT');
});

it('rejects a suppressed closure input even when the selected output tuple is unchanged', () => {
  const { features, request } = fixture(); features[0].suppressed = true;
  expect(codes(() => extractRecipeClosure(features, request))).toContain('SUPPRESSED_DEPENDENCY');
});

it('extracts an exact world up-to plane but keeps the unresolved end-condition capability visible', () => {
  const { features, request } = fixture();
  features.splice(2, 0, { id: 'limit', type: 'plane', name: 'Original world z6', support: { kind: 'principal', plane: 'XY' }, offset: 6, reversed: false, suppressed: false });
  const cut = features.find(feature => feature.id === 'cut');
  if (!cut || cut.type !== 'cut') throw new Error('Original source cut missing.');
  cut.endCondition = { kind: 'upToSurface', target: { kind: 'plane', planeId: 'limit' } };
  request.beforeFeatureIndex = features.length;
  expect(codes(() => extractRecipeClosure(features, request))).toContain('MISSING_REFERENCE_POLICY');
  request.referencePolicies.push({ featureId: 'cut', path: 'endCondition.target', placement: 'world' });
  const closure = extractRecipeClosure(features, request);
  expect(closure.nativeRequirements).toContainEqual({ kind: 'exact-plane', planeId: 'limit' });
  expect(codes(() => requireInitialRecipeDeclaration(closure))).toContain('UP_TO_SURFACE_PENDING');
});

it('requires face-owner association and preserves the opaque key as a pending exact requirement', () => {
  const { features, request } = fixture(), sketch = features.find(feature => feature.id === 'cut-sketch');
  if (!sketch || sketch.type !== 'sketch') throw new Error('Original source sketch missing.');
  const face = { sourceFeatureId: a.sourceFeatureId, key: 'opaque-original-top-role' };
  sketch.support = { kind: 'face', face };
  request.referencePolicies = [{ featureId: sketch.id, path: 'support', placement: 'world' }];
  expect(codes(() => extractRecipeClosure(features, request))).toContain('FACE_OWNER_REQUIRED');
  request.referencePolicies[0].owner = a;
  const closure = extractRecipeClosure(features, request);
  expect(closure.nativeRequirements).toContainEqual({ kind: 'exact-face', ref: a, face });
  expect(codes(() => requireInitialRecipeDeclaration(closure))).toContain('FACE_CORRESPONDENCE_PENDING');
});

it('preserves all scope intent and refuses to declare it implemented from a static snapshot', () => {
  const { features, request } = fixture(); request.scope = { mode: 'all', reevaluateAt: 'patternInput' }; request.bindings[0].targets = 'scope';
  const closure = extractRecipeClosure(features, request);
  expect(closure.request.scope).toEqual({ mode: 'all', reevaluateAt: 'patternInput' });
  expect(codes(() => requireInitialRecipeDeclaration(closure))).toContain('DYNAMIC_SCOPE_PENDING');
});

it('does not expand captured auto membership with an unlisted current body', () => {
  const { features, request } = fixture(), other = { bodyId: 'recipe-other', sourceFeatureId: 'create-other' };
  features.push(...creation(other.sourceFeatureId, other.bodyId, 45)); request.beforeFeatureIndex = features.length;
  request.scope = { mode: 'auto', capturedBodyIds: [target.bodyId], captureFingerprint: 'original-capture', follow: 'sameIdentityAtPatternInput' };
  request.targetSnapshot.push(other); request.bindings[0].targets = 'scope';
  expect(codes(() => extractRecipeClosure(features, request))).toContain('AUTO_MEMBER_UNAVAILABLE');
});

it('rejects 32x17 owner applications before cloning any feature definition', () => {
  const { features, request } = fixture();
  for (let index = 1; index < 32; index++) {
    const id = `create-target-${index}`, bodyId = `recipe-target-${index}`;
    features.push(...creation(id, bodyId, 25 + 20 * index)); request.targetSnapshot.push({ bodyId, sourceFeatureId: id });
  }
  request.beforeFeatureIndex = features.length; request.scope = { mode: 'selected', targets: [...request.targetSnapshot] };
  request.bindings[0].targets = request.targetSnapshot.map(item => item.bodyId);
  request.plan.transforms = Array.from({ length: 17 }, (_, index) => ({ key: `${index + 1},0`, translation: [20 * (index + 1), 0, 0] }));
  const getter = vi.fn(() => 1); Object.defineProperty(features[3], 'depth', { enumerable: true, get: getter });
  expect(codes(() => extractRecipeClosure(features, request))).toContain('APPLICATION_BUDGET');
  expect(getter).not.toHaveBeenCalled();
});

it('does not route geometry-copy declarations into a regeneration extractor', () => {
  const { features, request } = fixture();
  (request as unknown as { mode: string }).mode = 'geometry';
  expect(codes(() => extractRecipeClosure(features, request))).toContain('MODE_MISMATCH');
});

it('reflects fixed profile placement with a right-handed basis and the physical source ray', () => {
  const source: PlaneFrame = { origin: [3, 2, 1], xDirection: [1, 0, 0], normal: [0, 0, 1] };
  const mirrored = transformedExtrusionFrame(source, 4, { key: 'mirror', mirror: { origin: [0, 0, 0], xDirection: [0, 1, 0], normal: [1, 0, 0] } });
  expect(mirrored.frame).toEqual({ origin: [-3, 2, 1], xDirection: [-1, 0, 0], normal: [0, 0, -1] });
  expect(mirrored.signedDepth).toBe(-4); expect(mirrored.ray).toEqual([0, 0, 1]);
  // The local point(2,4) was world(5,6,1), hence its reflection must be(-5,6,1).
  const { origin, xDirection: x, normal: n } = mirrored.frame;
  const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
  expect(origin.map((value, axis) => value + 2 * x[axis] + 4 * y[axis])).toEqual([-5, 6, 1]);
});

it('uses positive quarter-turn placement about the saved origin without translating directions', () => {
  const mapping = recipeTransform({ key: '1', angle: 90, origin: [2, 3, 0], direction: [0, 0, 1] });
  const actual = mapping.point([5, 3, 0]);
  expect(actual[0]).toBeCloseTo(2, 12); expect(actual[1]).toBeCloseTo(6, 12); expect(actual[2]).toBe(0);
  expect(mapping.vector([0, 0, 1])).toEqual([0, 0, 1]);
});

it('separates reflected sketch parity from the physical orientation of a limiting plane', () => {
  const plane: PlaneFrame = { origin: [0, 0, 6], xDirection: [1, 0, 0], normal: [0, 0, 1] };
  const transform: Parameters<typeof recipeTransform>[0] = { key: 'mirror', mirror: { origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] } };
  expect(transformedExtrusionFrame(plane, -4, transform).ray).toEqual([0, 0, 1]);
  expect(transformedLimitPlane(plane, transform)).toEqual({ origin: [0, 0, -6], xDirection: [1, 0, 0], normal: [0, 0, -1] });
});

it('keeps normal offset and an explicit translated-surface vector as distinct future intents', () => {
  const target = { kind: 'principal' as const, plane: 'XY' as const };
  const policy = { featureId: 'cut', path: 'endCondition.target', placement: 'world' as const };
  expect(validatePendingOffsetSurfaceIntent({ target, policy, construction: 'normal', signedDistanceMm: 1 }).construction).toBe('normal');
  expect(validatePendingOffsetSurfaceIntent({ target, policy, construction: 'translation', translationWorldMm: [0, 0, -1] }).construction).toBe('translation');
  expect(codes(() => validatePendingOffsetSurfaceIntent({ target, policy, construction: 'translation', translationWorldMm: [0, 0, NaN] }))).toContain('NON_JSON_RECIPE');
});

it('builds explicit intrinsic-frame inputs only for an active extracted transform', () => {
  const { features, request } = fixture(), closure = extractRecipeClosure(features, request);
  const input = fixedProfileInstanceInput(closure, 'cut', '1,0');
  expect(input.frame.origin).toEqual([20, 0, 0]); expect(input.ray).toEqual([0, 0, 1]);
  expect(input.profile).toEqual({ kind: 'circle', center: [5, 5], radius: 1 });
  expect(codes(() => fixedProfileInstanceInput(closure, 'cut', '2,0'))).toContain('INACTIVE_INSTANCE');
});

it('canonicalizes UI source/binding permutations without changing chronological recipe meaning', () => {
  const { features, request } = orderedFixture(), before = extractRecipeClosure(features, request);
  request.sourceFeatureIds.reverse(); request.bindings.reverse();
  const after = extractRecipeClosure(features, request);
  expect(after.fingerprintInput).toBe(before.fingerprintInput);
  expect(after.operations.map(operation => operation.featureId)).toEqual(['boss', 'cut']);
});
