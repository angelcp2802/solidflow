import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type { LinearPatternFeature } from '../cad/kernel.types';
import { patternPlan } from '../cad/kernel.patterns';
import { applyBodyCommand, prepareBodyCommand } from './bodyCommands';
import { addFeature, parseDocument, serializeDocument, validateDocument } from './document';
import { withFeaturePatternAutoCapture, withFeaturePatternInstanceDepth, withFeaturePatternMode, withFeaturePatternScope, withFeaturePatternSeeds } from './featurePatternCommands';
import { RECIPE_EVALUATOR_REVISION, type RecipeAutoScopeCapture } from './featureRecipeAutoScope';
import { featurePatternApplications, validateFeaturePatternDeclaration, type SelectedFeaturePatternOperation } from './featurePatterns';
import { extractRecipeClosure, intrinsicProfileInstancePlacement, type RegenerationRequest } from './featureRecipes';

const require = createRequire(import.meta.url);
const original = () => validateDocument(require('../../scripts/desktop-part-instance-depth-original.cjs')());
const owner = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
const pattern = (): LinearPatternFeature & { featurePattern: Extract<SelectedFeaturePatternOperation, { mode: 'regenerate' }> } => ({
  id: 'depth-pattern', type: 'linearPattern', name: 'Original addressed depths', suppressed: false, baseFeatureId: 'pocket',
  source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] },
  first: { direction: [1, 0, 0], spacing: 5, count: 4 }, second: null, secondSeedOnly: false, skipped: [],
  featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner], bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }],
    referencePolicies: [], variation: { kind: 'dimensions', values: [
      { address: '1,0', featureId: 'pocket', parameter: 'depth', value: -2 },
      { address: '2,0', featureId: 'pocket', parameter: 'depth', value: -3 },
    ] } },
});

it('round trips addresses and depth without changing saved seed/body IDs or the inherited placement', () => {
  const doc = original(), feature = pattern(), reopened = parseDocument(serializeDocument(addFeature(doc, feature)));
  expect(reopened.features).toEqual([...doc.features, feature]);
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: feature.id, patternKind: feature.type,
    beforeFeatureIndex: doc.features.length, sourceFeatureIds: ['pocket'], plan: patternPlan(feature), scope: { mode: 'selected', targets: [owner] },
    targetSnapshot: [owner], bindings: [{ source: owner, targets: [owner.bodyId] }], referencePolicies: [], variation: feature.featurePattern.variation };
  const closure = extractRecipeClosure(doc.features, request);
  expect(closure.diagnostics).toEqual([]);
  expect(['1,0', '2,0', '3,0'].map(address => intrinsicProfileInstancePlacement(closure, 'pocket', address).signedDepth)).toEqual([-2, -3, -1]);
  if (request.variation.kind !== 'dimensions') throw Error('Expected original table');
  request.variation.values.reverse();
  expect(extractRecipeClosure(doc.features, request).fingerprintInput).toBe(closure.fingerprintInput);
  request.variation.values[0].value = -4;
  expect(extractRecipeClosure(doc.features, request).fingerprintInput).not.toBe(closure.fingerprintInput);
  request.variation.values[0].value = 2;
  expect(() => extractRecipeClosure(doc.features, request)).toThrow(/mantener el sentido/);
});

it.each(['seed', 'skipped', 'duplicate', 'unsupported-parameter', 'outside-range', 'extra-key', 'getter', 'ALL', 'AUTO'])(
  'rejects a %s depth-table declaration before cloning', invalidCase => {
    const feature = pattern(), declaration = feature.featurePattern;
    if (declaration.variation.kind !== 'dimensions') throw Error('Expected original table');
    const [row] = declaration.variation.values;
    let getterRead = false;
    if (invalidCase === 'seed') row.featureId = 'plate';
    if (invalidCase === 'skipped') feature.skipped = [[1, 0]];
    if (invalidCase === 'duplicate') declaration.variation.values[1].address = row.address;
    if (invalidCase === 'unsupported-parameter') Object.assign(row, { parameter: 'profile.radius' });
    if (invalidCase === 'outside-range') row.value = -.009;
    if (invalidCase === 'extra-key') Object.defineProperty(row, 'hidden', { value: true });
    if (invalidCase === 'getter') Object.defineProperty(row, 'value', { enumerable: true, get() { getterRead = true; return -2; } });
    if (invalidCase === 'ALL') {
      Object.assign(declaration, { scope: 'all', reevaluateAt: 'patternInput', bindings: [{ source: owner, targetBodyIds: 'scope' }] });
      Reflect.deleteProperty(declaration, 'targets');
    }
    if (invalidCase === 'AUTO') {
      Object.assign(declaration, { scope: 'auto', capturedBodyIds: [owner.bodyId], captureFingerprint: 'auto-scope-v1:' + '0'.repeat(64),
        follow: 'sameIdentityAtPatternInput', bindings: [{ source: owner, targetBodyIds: 'scope' }] });
      Reflect.deleteProperty(declaration, 'targets');
    }
    expect(() => validateDocument({ ...original(), features: [...original().features, feature] })).toThrow(/featurePattern/);
    expect(getterRead).toBe(false);
  },
);

it('preserves explicit rows until the user removes them and invalidates a preview after a depth change', () => {
  const feature = pattern(), state = { document: original(), feature, selection: [owner], catalog: { active: true, bodies: [{ ref: owner }] } };
  expect(() => withFeaturePatternMode(feature, 'geometry')).toThrow(/Quita/);
  expect(() => withFeaturePatternScope(feature, 'all')).toThrow(/Quita/);
  expect(() => withFeaturePatternSeeds(feature, ['plate'])).toThrow(/Quita/);
  const capture: RecipeAutoScopeCapture = { kind: 'feature-recipe-auto-scope', patternId: feature.id, sourceFeaturesSignature: '0'.repeat(64),
    evaluatorRevision: RECIPE_EVALUATOR_REVISION, scope: { mode: 'auto' as const, capturedBodyIds: [owner.bodyId],
      captureFingerprint: 'auto-scope-v1:' + '0'.repeat(64), follow: 'sameIdentityAtPatternInput' as const } };
  expect(() => withFeaturePatternAutoCapture(feature, capture)).toThrow(/Quita/);
  const prepared = prepareBodyCommand(state);
  if (!prepared.accepted) throw Error(prepared.message);
  const changed = withFeaturePatternInstanceDepth(feature, '1,0', -4);
  const stale = applyBodyCommand(prepared.plan, { ...state, feature: changed }, { features: prepared.plan.previewFeatures, healthy: true });
  expect(stale.accepted).toBe(false);
  const cleared = withFeaturePatternInstanceDepth(withFeaturePatternInstanceDepth(feature, '1,0', null), '2,0', null);
  expect(cleared.featurePattern).toMatchObject({ variation: { kind: 'none' } });
  expect(feature.featurePattern.variation).toMatchObject({ values: [{ value: -2 }, { value: -3 }] });
  expect(withFeaturePatternMode(cleared, 'geometry').featurePattern?.mode).toBe('geometry');
  const automatic = withFeaturePatternAutoCapture(cleared, capture);
  expect(automatic.featurePattern).toMatchObject({ scope: 'auto', capturedBodyIds: [owner.bodyId], variation: { kind: 'none' } });
  expect(() => withFeaturePatternInstanceDepth(automatic, '1,0', -2)).toThrow(/cuerpos seleccionados/);
  expect(withFeaturePatternScope(automatic, 'selected').featurePattern).toMatchObject({ scope: 'selected', targets: [], variation: { kind: 'none' } });
});

it('counts every owner route and inherited copy at the existing 511/512 application boundaries', () => {
  const targets = Array.from({ length: 8 }, (_, i) => ({ bodyId: `target-${i}`, sourceFeatureId: 'target-source' }));
  const feature = pattern();
  feature.first.count = 8;
  feature.featurePattern.targets = targets;
  feature.featurePattern.bindings = Array.from({ length: 10 }, (_, index) => ({
    source: { bodyId: `source-${index}`, sourceFeatureId: 'pocket' },
    targetBodyIds: targets.slice(0, index === 9 ? 1 : 8).map(target => target.bodyId),
  }));
  expect(featurePatternApplications(feature)).toBe(511);
  feature.first.count = 9;
  feature.featurePattern.bindings = feature.featurePattern.bindings.slice(0, 8);
  expect(featurePatternApplications(feature)).toBe(512);
  feature.first.count = 10;
  expect(() => validateFeaturePatternDeclaration(feature)).toThrow(/512/);
});
