import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import { addFeature, DocumentHistory, parseDocument, removeFeature, serializeDocument, updateFeature, validateDocument } from './document';
import { withFeaturePatternScope } from './featurePatternCommands';
import { sourceRecipeScopeIntent } from './featurePatterns';
import { extractRecipeClosure, recipeAutoNativeApplicationCount, requireInitialRecipeDeclaration, type RegenerationRequest } from './featureRecipes';
import { readRecipeAutoScopeCapture, RECIPE_EVALUATOR_REVISION } from './featureRecipeAutoScope';
import type { LinearPatternFeature } from '../cad/kernel.types';

// Pure original declarations. This syntactically valid digest is intentionally
// not a native receipt: editable saved provenance cannot authenticate history.
const fingerprint = 'auto-scope-v1:' + '0'.repeat(64), require = createRequire(import.meta.url);
const original = () => validateDocument(require('../../scripts/desktop-part-auto-scope-original.cjs')());
function operation(): LinearPatternFeature {
  return { id: 'model-auto', name: 'Original AUTO declaration', type: 'linearPattern', suppressed: false, baseFeatureId: 'create-c',
    source: { mode: 'features', geometryPattern: false, featureIds: ['source-cut', 'source-fill'] },
    first: { direction: [1, 0, 0], spacing: 10, count: 2 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'auto', capturedBodyIds: ['A', 'B'], captureFingerprint: fingerprint, follow: 'sameIdentityAtPatternInput',
      bindings: ['source-cut', 'source-fill'].map(sourceFeatureId => ({ source: { bodyId: 'S', sourceFeatureId }, targetBodyIds: 'scope' })),
      referencePolicies: [], variation: { kind: 'none' } } };
}
const data = () => ({ ...original(), features: [...original().features, operation()] });

it('round-trips explicit AUTO intent without certifying its editable provenance or persisting current refs', () => {
  const document = validateDocument(data()), feature = document.features.at(-1) as LinearPatternFeature;
  expect(parseDocument(serializeDocument(document))).toEqual(document);
  expect(sourceRecipeScopeIntent(feature.featurePattern!)).toEqual({ mode: 'auto', capturedBodyIds: ['A', 'B'],
    captureFingerprint: fingerprint, follow: 'sameIdentityAtPatternInput' });
  expect(Object.hasOwn(feature.featurePattern!, 'targets')).toBe(false); expect(Object.hasOwn(feature.featurePattern!, 'reevaluateAt')).toBe(false);
});

it.each(['missing-fingerprint', 'wrong-fingerprint', 'wrong-follow', 'targets', 'reevaluate', 'unknown', 'empty', 'duplicate', 'future', 'hole'] as const)(
  'rejects malformed saved AUTO %s without converting it to selected/ALL', variant => {
    const document = data(), feature = document.features.at(-1) as LinearPatternFeature;
    const scope = feature.featurePattern as unknown as Record<string, unknown>;
    if (variant === 'missing-fingerprint') delete scope.captureFingerprint;
    if (variant === 'wrong-fingerprint') scope.captureFingerprint = 'not-a-native-format';
    if (variant === 'wrong-follow') scope.follow = 'nearest';
    if (variant === 'targets') scope.targets = undefined;
    if (variant === 'reevaluate') scope.reevaluateAt = 'patternInput';
    if (variant === 'unknown') scope.token = 'cannot-grant-authority';
    if (variant === 'empty') scope.capturedBodyIds = [];
    if (variant === 'duplicate') scope.capturedBodyIds = ['A', 'A'];
    if (variant === 'future') scope.capturedBodyIds = ['unknown-owner'];
    if (variant === 'hole') scope.capturedBodyIds = new Array(2);
    expect(() => validateDocument(document)).toThrow();
  });

it('rejects AUTO field/array getters before invoking them', () => {
  for (const array of [false, true]) {
    const document = data(), feature = document.features.at(-1) as LinearPatternFeature, scope = feature.featurePattern!;
    const read = vi.fn(() => array ? 'A' : fingerprint);
    if (array) Object.defineProperty((scope as { capturedBodyIds: string[] }).capturedBodyIds, '0', { enumerable: true, get: read });
    else Object.defineProperty(scope, 'captureFingerprint', { enumerable: true, get: read });
    expect(() => validateDocument(document)).toThrow(); expect(read).not.toHaveBeenCalled();
  }
});

it('switches scope explicitly without silently adopting saved captured IDs as manual targets', () => {
  const feature = operation(), all = withFeaturePatternScope(feature, 'all'), selected = withFeaturePatternScope(feature, 'selected');
  expect(all.featurePattern).toMatchObject({ scope: 'all', reevaluateAt: 'patternInput' });
  expect(Object.hasOwn(all.featurePattern!, 'capturedBodyIds')).toBe(false); expect(Object.hasOwn(all.featurePattern!, 'captureFingerprint')).toBe(false);
  expect(selected.featurePattern).toMatchObject({ scope: 'selected', targets: [], bindings: [
    { source: { bodyId: 'S', sourceFeatureId: 'source-cut' }, targetBodyIds: [] },
    { source: { bodyId: 'S', sourceFeatureId: 'source-fill' }, targetBodyIds: [] },
  ] });
});

it('records scope recapture in history and cascades a captured creator without changing ALL policy', () => {
  const document = validateDocument(data()), history = new DocumentHistory(document), feature = operation();
  const scope = feature.featurePattern!;
  if (scope.mode !== 'regenerate' || scope.scope !== 'auto') throw Error('Original AUTO fixture');
  const changed = updateFeature(document, feature.id, { featurePattern: { ...scope, capturedBodyIds: ['D'], captureFingerprint: 'auto-scope-v1:' + '1'.repeat(64) } });
  history.apply(changed); expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(changed);
  const deleted = removeFeature(document, 'create-a'); expect(deleted.features.some(f => f.id === feature.id)).toBe(false);
  const unrelated = removeFeature(document, 'create-d'); expect(unrelated.features.find(f => f.id === feature.id)).toEqual(feature);
  const all = addFeature(original(), withFeaturePatternScope(feature, 'all'));
  expect(removeFeature(all, 'create-a').features.some(f => f.id === feature.id)).toBe(true);
});

it('checks transport data shape without turning a correctly formatted forged label into native authority', () => {
  const reply = { kind: 'feature-recipe-auto-scope', patternId: 'model-auto', evaluatorRevision: RECIPE_EVALUATOR_REVISION,
    sourceFeaturesSignature: '1'.repeat(64), scope: { mode: 'auto', capturedBodyIds: ['A', 'B'], captureFingerprint: fingerprint, follow: 'sameIdentityAtPatternInput' } };
  expect(readRecipeAutoScopeCapture(reply)).toEqual(reply);
  expect(() => readRecipeAutoScopeCapture({ ...reply, token: 'forged' })).toThrow();
  expect(() => readRecipeAutoScopeCapture({ ...reply, evaluatorRevision: 'old-evaluator' })).toThrow();
  const read = vi.fn(); Object.defineProperty(reply.scope.capturedBodyIds, '0', { enumerable: true, get: read });
  expect(() => readRecipeAutoScopeCapture(reply)).toThrow(); expect(read).not.toHaveBeenCalled();
});

function request(copies: number): { features: ReturnType<typeof original>['features']; request: RegenerationRequest } {
  const features = original().features;
  return { features, request: { mode: 'regenerate', geometryPattern: false, patternId: 'model-auto', patternKind: 'linearPattern',
    beforeFeatureIndex: features.length, sourceFeatureIds: ['source-cut', 'source-fill'],
    scope: { mode: 'auto', capturedBodyIds: ['A', 'B'], captureFingerprint: fingerprint, follow: 'sameIdentityAtPatternInput' },
    targetSnapshot: [{ bodyId: 'A', sourceFeatureId: 'create-a' }, { bodyId: 'B', sourceFeatureId: 'create-b' }],
    bindings: ['source-cut', 'source-fill'].map(sourceFeatureId => ({ source: { bodyId: 'S', sourceFeatureId }, targets: 'scope' })),
    referencePolicies: [], variation: { kind: 'none' }, plan: { transforms: Array.from({ length: copies }, (_, index) => ({ key: (index + 1) + ',0', translation: [10 * (index + 1), 0, 0] as [number, number, number] })), structure: ['original-owner-event-budget'] } } };
}
it.each([{ copies: 73, inventory: 5, work: 511 }, { copies: 64, inventory: 6, work: 512 }])(
  'counts $work owner/events without charging Common/Distance/Fuse as three applications', row => {
    const value = request(row.copies), closure = requireInitialRecipeDeclaration(extractRecipeClosure(value.features, value.request));
    expect(recipeAutoNativeApplicationCount(closure, row.inventory)).toBe(row.work);
  });
it('rejects more than 512 owner/events and newly added inventory before any native operation', () => {
  const value = request(73), closure = requireInitialRecipeDeclaration(extractRecipeClosure(value.features, value.request));
  expect(recipeAutoNativeApplicationCount(closure, 5)).toBe(511);
  expect(() => recipeAutoNativeApplicationCount(closure, 6)).toThrow(/512/);
  const more = request(74); expect(() => recipeAutoNativeApplicationCount(requireInitialRecipeDeclaration(extractRecipeClosure(more.features, more.request)), 5)).toThrow(/512/);
});
