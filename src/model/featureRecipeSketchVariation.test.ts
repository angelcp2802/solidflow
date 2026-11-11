import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import type { LinearPatternFeature, SketchFeature } from '../cad/kernel.types';
import { patternPlan } from '../cad/kernel.patterns';
import { addFeature, parseDocument, serializeDocument, validateDocument } from './document';
import { withFeaturePatternInstanceDepth, withFeaturePatternMode, withFeaturePatternScope, withFeaturePatternSeeds, withFeaturePatternSketchRadius } from './featurePatternCommands';
import { extractRecipeClosure, intrinsicProfileInstancePlacement, requireInitialRecipeDeclaration, type RegenerationRequest } from './featureRecipes';
import { recipeCircleDrivingRadius } from './featureRecipeSketchVariation';

const require = createRequire(import.meta.url);
const original = () => validateDocument(require('../../scripts/desktop-part-instance-radius-original.cjs')());
const owner = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
function pattern(): LinearPatternFeature {
  return { id: 'radius-pattern', name: 'Original circle-radius pattern', type: 'linearPattern', suppressed: false, baseFeatureId: 'pocket',
    source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] },
    first: { direction: [1, 0, 0], count: 3, spacing: 5 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner], bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }], referencePolicies: [], variation: { kind: 'none' } } };
}
function request(feature = pattern()): RegenerationRequest {
  const operation = feature.featurePattern!;
  if (operation.mode !== 'regenerate' || operation.scope !== 'selected') throw Error('Original selected pattern required');
  return { mode: 'regenerate', geometryPattern: false, patternId: feature.id, patternKind: feature.type, beforeFeatureIndex: 4,
    sourceFeatureIds: ['pocket'], plan: patternPlan(feature), scope: { mode: 'selected', targets: [owner] }, targetSnapshot: [owner],
    bindings: [{ source: owner, targets: [owner.bodyId] }], referencePolicies: [], variation: operation.variation };
}
function varied() { return withFeaturePatternSketchRadius(pattern(), original().features, '1,0', .5) as LinearPatternFeature; }
function rows(feature: LinearPatternFeature) {
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.variation.kind !== 'sketchDimensions') throw Error('Original radius table required');
  return operation.variation.values;
}

it('round trips exact driving-constraint intent and preserves source IDs, nominal geometry and bytes', () => {
  const before = original(), bytes = serializeDocument(before), feature = varied();
  expect(rows(feature)).toEqual([{ address: '1,0', sketchId: 'pocket-profile', constraintId: 'driving-radius', value: .5 }]);
  expect(parseDocument(serializeDocument(addFeature(before, feature))).features).toEqual([...before.features, feature]);
  expect(serializeDocument(before)).toBe(bytes);
  const placement = intrinsicProfileInstancePlacement(requireInitialRecipeDeclaration(extractRecipeClosure(before.features, request(feature))), 'pocket', '1,0');
  expect(placement.sketchDimensions).toEqual(rows(feature));
  expect(placement.signedDepth).toBe(-1);
});

it.each([0, -.5, NaN, Infinity, 100_000.01])('rejects an invalid radius %s without changing the source or table', value => {
  const before = original(), feature = varied(), snapshot = structuredClone(feature);
  expect(() => withFeaturePatternSketchRadius(feature, before.features, '1,0', value)).toThrow();
  expect(feature).toEqual(snapshot);
});

it('requires explicit clearing before source, method, scope or variation-family changes', () => {
  const feature = varied();
  expect(() => withFeaturePatternSeeds(feature, ['plate'])).toThrow(/variaciones/);
  expect(() => withFeaturePatternMode(feature, 'geometry')).toThrow(/variaciones/);
  expect(() => withFeaturePatternScope(feature, 'all')).toThrow(/variaciones/);
  expect(() => withFeaturePatternInstanceDepth(feature, '1,0', -2)).toThrow(/cotas de croquis/);
  const cleared = withFeaturePatternSketchRadius(feature, original().features, '1,0', null);
  expect(cleared.featurePattern).toMatchObject({ variation: { kind: 'none' } });
});

it.each(['inactive', 'duplicate', 'extra', 'zero', 'bad-id', 'sparse', 'accessor', 'inherited', 'symbol', 'value-type'])('rejects malformed saved radius rows: %s', fault => {
  const feature = varied(), table = rows(feature), access = vi.fn(() => 'pocket-profile');
  if (fault === 'inactive') table[0].address = '0,0';
  if (fault === 'duplicate') table.push({ ...table[0] });
  if (fault === 'extra') Object.assign(table[0], { result: {} });
  if (fault === 'zero') table[0].value = 0;
  if (fault === 'bad-id') table[0].constraintId = '\u0000';
  if (fault === 'sparse') { table.length = 2; }
  if (fault === 'accessor') Object.defineProperty(table[0], 'sketchId', { enumerable: true, get: access });
  if (fault === 'inherited') Object.setPrototypeOf(table[0], { result: {} });
  if (fault === 'symbol') Object.defineProperty(table[0], Symbol('unexpected'), { value: 1 });
  if (fault === 'value-type') Object.assign(table[0], { value: '.5' });
  expect(() => addFeature(original(), feature)).toThrow();
  expect(access).not.toHaveBeenCalled();
});

it.each(['foreign-sketch', 'foreign-constraint', 'driven', 'annotation', 'free-center', 'thin', 'through-all', 'wrong-operation'])('rejects unsupported or foreign semantic references: %s', fault => {
  const before = original(), feature = varied(), sketch = before.features[2] as SketchFeature, seed = before.features[3];
  if (fault === 'foreign-sketch') rows(feature)[0].sketchId = 'plate-profile';
  if (fault === 'foreign-constraint') rows(feature)[0].constraintId = 'fixed-center';
  if (sketch.profile.kind !== 'entities' || seed.type !== 'cut') throw Error('Original source required');
  const radius = sketch.profile.constraints[1];
  if (radius.type !== 'radius') throw Error('Original radius required');
  if (fault === 'driven') radius.driven = true;
  if (fault === 'annotation') radius.referenceRole = 'annotation';
  if (fault === 'free-center') sketch.profile.constraints.shift();
  if (fault === 'thin') Object.assign(seed, { thinWall: {} });
  if (fault === 'through-all') seed.endCondition = { kind: 'throughAll', baseFeatureId: 'plate', bothDirections: false };
  if (fault === 'wrong-operation') (seed as unknown as { type: string }).type = 'revolution';
  expect(() => requireInitialRecipeDeclaration(extractRecipeClosure(before.features, request(feature)))).toThrow();
});

it('canonicalizes table order and fingerprints constraint values and source identities', () => {
  const features = original().features, feature = withFeaturePatternSketchRadius(varied(), features, '2,0', 1.5) as LinearPatternFeature;
  const first = extractRecipeClosure(features, request(feature)).fingerprintInput;
  rows(feature).reverse();
  expect(extractRecipeClosure(features, request(feature)).fingerprintInput).toBe(first);
  rows(feature)[0].value = .75;
  expect(extractRecipeClosure(features, request(feature)).fingerprintInput).not.toBe(first);
  expect(recipeCircleDrivingRadius(features[3], features[2])).toEqual({ constraintId: 'driving-radius', value: 1 });
});

it('keeps unavailable assignments removable without silently redirecting them', () => {
  const feature = varied(); feature.skipped = [[1, 0]];
  expect(() => addFeature(original(), feature)).toThrow();
  expect(() => withFeaturePatternSketchRadius(feature, original().features, '1,0', .75)).toThrow(/activa/);
  expect(withFeaturePatternSketchRadius(feature, [], '1,0', null).featurePattern).toMatchObject({ variation: { kind: 'none' } });
});

it('retains the existing 255-copy table envelope without admitting an extra inactive row', () => {
  const before = original(), feature = pattern(); feature.first.count = 256;
  const values = Array.from({ length: 255 }, (_, i) => ({ address: `${i + 1},0`, sketchId: 'pocket-profile', constraintId: 'driving-radius', value: .5 }));
  if (feature.featurePattern?.mode !== 'regenerate') throw Error('Original regeneration required');
  feature.featurePattern.variation = { kind: 'sketchDimensions', values };
  expect(parseDocument(serializeDocument(addFeature(before, feature))).features.at(-1)).toEqual(feature);
  values.push({ ...values[0], address: '256,0' });
  expect(() => addFeature(before, feature)).toThrow();
});

it.each([[74, 7, true], [129, 4, true], [130, 4, false]] as const)('keeps application budget count%s/targets%s accepted=%s', (count, targets, accepted) => {
  const before = original(), feature = varied(); feature.first.count = count;
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.scope !== 'selected') throw Error('Original selected pattern required');
  operation.targets = [owner];
  for (let i = 1; i < targets; i++) {
    const id = `target-${i}`, creator = `owner-${i}`, sketch = `target-profile-${i}`;
    before.features.push({ id: sketch, name: 'Original budget-only rectangle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [50 * i, 4], width: 20, height: 8 } },
    { id: creator, name: 'Original budget-only owner', type: 'extrude', suppressed: false, sketchId: sketch, depth: 5, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: id } });
    operation.targets.push({ bodyId: id, sourceFeatureId: creator });
  }
  operation.bindings[0].targetBodyIds = operation.targets.map(target => target.bodyId);
  // 511 and 512 route applications remain legal; 516 cannot allocate native work.
  if (accepted) expect(() => addFeature(before, feature)).not.toThrow();
  else expect(() => addFeature(before, feature)).toThrow(/512/);
});
