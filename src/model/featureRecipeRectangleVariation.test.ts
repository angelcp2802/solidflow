import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type { CutFeature, LinearPatternFeature, SketchFeature } from '../cad/kernel.types';
import { patternPlan } from '../cad/kernel.patterns';
import type { EntityProfile } from '../sketch/types';
import { addFeature, parseDocument, serializeDocument, validateDocument } from './document';
import { withFeaturePatternSketchDimension } from './featurePatternCommands';
import { recipeSketchDrivingDimensions } from './featureRecipeSketchVariation';
import { extractRecipeClosure, intrinsicProfileInstancePlacement, requireInitialRecipeDeclaration, type RegenerationRequest } from './featureRecipes';

const require = createRequire(import.meta.url);
const original = () => validateDocument(require('../../scripts/desktop-part-instance-rectangle-original.cjs')());
const owner = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
const width = 'driving-width', height = 'driving-height';
const drivers = [
  { parameter: 'width', constraintId: width, value: 2 },
  { parameter: 'height', constraintId: height, value: 2 },
];
function pattern(): LinearPatternFeature {
  return { id: 'rectangular-pattern', name: 'Original rectangular pocket pattern', type: 'linearPattern', suppressed: false, baseFeatureId: 'pocket',
    source: { mode: 'features', geometryPattern: false, featureIds: ['pocket'] },
    first: { direction: [1, 0, 0], count: 3, spacing: 5 }, second: null, secondSeedOnly: false, skipped: [],
    featurePattern: { mode: 'regenerate', scope: 'selected', targets: [owner], bindings: [{ source: owner, targetBodyIds: [owner.bodyId] }],
      referencePolicies: [], variation: { kind: 'none' } } };
}
function request(feature: LinearPatternFeature): RegenerationRequest {
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.scope !== 'selected') throw Error('Original selected pattern required');
  return { mode: 'regenerate', geometryPattern: false, patternId: feature.id, patternKind: feature.type, beforeFeatureIndex: 4,
    sourceFeatureIds: ['pocket'], plan: patternPlan(feature), scope: { mode: 'selected', targets: [owner] }, targetSnapshot: [owner],
    bindings: [{ source: owner, targets: [owner.bodyId] }], referencePolicies: [], variation: operation.variation };
}
function rows(feature: LinearPatternFeature) {
  const operation = feature.featurePattern;
  if (operation?.mode !== 'regenerate' || operation.variation.kind !== 'sketchDimensions') throw Error('Original rectangle table required');
  return operation.variation.values;
}
const varied = (before = original()) => withFeaturePatternSketchDimension(
  withFeaturePatternSketchDimension(pattern(), before.features, '1,0', width, 1), before.features, '1,0', height, 3) as LinearPatternFeature;

it('keeps width and height on the same copy, canonicalizes order and restores only the chosen row', () => {
  const before = original(), bytes = serializeDocument(before), feature = varied(before);
  const saved = addFeature(before, feature);
  expect(parseDocument(serializeDocument(saved)).features).toEqual(saved.features);
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(before.features, request(feature)));
  const placement = intrinsicProfileInstancePlacement(closure, 'pocket', '1,0');
  expect(placement.sketchDimensions).toEqual([
    { address: '1,0', sketchId: 'pocket-profile', constraintId: height, value: 3 },
    { address: '1,0', sketchId: 'pocket-profile', constraintId: width, value: 1 },
  ]);
  expect(intrinsicProfileInstancePlacement(closure, 'pocket', '2,0').sketchDimensions).toBeUndefined();
  rows(feature).reverse();
  expect(extractRecipeClosure(before.features, request(feature)).fingerprintInput).toBe(closure.fingerprintInput);
  const remaining = withFeaturePatternSketchDimension(feature, [], '1,0', height, null) as LinearPatternFeature;
  expect(rows(remaining)).toEqual([{ address: '1,0', sketchId: 'pocket-profile', constraintId: width, value: 1 }]);
  expect(withFeaturePatternSketchDimension(remaining, [], '1,0', width, null).featurePattern)
    .toMatchObject({ variation: { kind: 'none' } });
  expect(serializeDocument(before)).toBe(bytes);
});

it('recognizes distinct shared edges independent of order, direction and fixed or snapped corner', () => {
  const before = original(), sketch = before.features[2] as SketchFeature;
  expect(recipeSketchDrivingDimensions(before.features[3], sketch)).toEqual(drivers);
  const profile = sketch.profile as EntityProfile;
  profile.entities.reverse();
  for (const entity of profile.entities) {
    if (entity.type === 'line') [entity.start, entity.end] = [entity.end, entity.start];
  }
  profile.points.reverse();
  profile.constraints.reverse();
  expect(recipeSketchDrivingDimensions(before.features[3], sketch)).toEqual(drivers);
  profile.points = profile.points.filter(point => point.id !== 'p0');
  profile.constraints = profile.constraints.filter(constraint => constraint.type !== 'fix');
  for (const entity of profile.entities) {
    if (entity.type !== 'line') continue;
    if (entity.start === 'p0') entity.start = 'origin';
    if (entity.end === 'p0') entity.end = 'origin';
  }
  expect(recipeSketchDrivingDimensions(before.features[3], sketch)).toEqual(drivers);
});

it.each(['free', 'duplicate-edge', 'construction', 'wrong-axis', 'annotation', 'driven', 'through-all'] as const)(
  'rejects a rectangular source with %s before instance construction', fault => {
    const before = original(), sketch = before.features[2] as SketchFeature, seed = before.features[3] as CutFeature;
    const feature = varied(before), profile = sketch.profile as EntityProfile;
    const bottom = profile.entities[0];
    const length = profile.constraints.find(constraint => constraint.id === width);
    const axis = profile.constraints.find(constraint => constraint.id === 'horizontal-bottom');
    if (bottom.type !== 'line' || length?.type !== 'length' || axis?.type !== 'horizontal') throw Error('Original rectangle required');
    if (fault === 'free') profile.constraints.shift();
    if (fault === 'duplicate-edge') Object.assign(bottom, { start: 'p2', end: 'p3' });
    if (fault === 'construction') bottom.construction = true;
    if (fault === 'wrong-axis') axis.type = 'vertical';
    if (fault === 'annotation') length.referenceRole = 'annotation';
    if (fault === 'driven') length.driven = true;
    if (fault === 'through-all') seed.endCondition = { kind: 'throughAll', baseFeatureId: 'plate', bothDirections: false };
    expect(recipeSketchDrivingDimensions(seed, sketch)).toEqual([]);
    expect(() => extractRecipeClosure(before.features, request(feature))).toThrow(/cotas conductoras exactas/);
  });

it('requires an explicit merge into an existing owner for a rectangular boss', () => {
  const before = validateDocument(require('../../scripts/desktop-part-instance-rectangle-original.cjs')('extrude'));
  const seed = before.features[3], sketch = before.features[2], feature = varied(before);
  if (seed.type !== 'extrude') throw Error('Original merged boss required');
  expect(recipeSketchDrivingDimensions(seed, sketch)).toEqual(drivers);
  expect(requireInitialRecipeDeclaration(extractRecipeClosure(before.features, request(feature))).eligibility)
    .toBe('initial-declaration-subset');
  seed.bodyOperation = { mode: 'new', bodyId: 'other-body' };
  expect(recipeSketchDrivingDimensions(seed, sketch)).toEqual([]);
  expect(() => extractRecipeClosure(before.features, request(feature))).toThrow(/cotas conductoras exactas/);
  delete seed.bodyOperation;
  expect(recipeSketchDrivingDimensions(seed, sketch)).toEqual([]);
});

it('rejects duplicate pairs and preserves a foreign driver for explicit repair', () => {
  const before = original(), feature = varied(before);
  const values = rows(feature);
  values.push({ ...values[0] });
  expect(() => addFeature(before, feature)).toThrow();
  values.pop();
  values[0].constraintId = 'missing-driver';
  expect(parseDocument(serializeDocument(addFeature(before, feature))).features.at(-1)).toEqual(feature);
  expect(() => extractRecipeClosure(before.features, request(feature))).toThrow(/cotas conductoras exactas/);
  expect(() => withFeaturePatternSketchDimension(feature, before.features, '1,0', 'missing-driver', 1)).toThrow();
  expect(rows(withFeaturePatternSketchDimension(feature, [], '1,0', 'missing-driver', null) as LinearPatternFeature))
    .toEqual([{ address: '1,0', sketchId: 'pocket-profile', constraintId: height, value: 3 }]);
});

it('caps every copy at two rows and permits exact repair of a full stale pair', () => {
  const before = original(), feature = varied(before), values = rows(feature);
  values.push({ ...values[0], constraintId: 'third-constraint' });
  expect(() => addFeature(before, feature)).toThrow();
  expect(() => extractRecipeClosure(before.features, request(feature))).toThrow(/distinct driving constraints/);
  values.pop();
  values[0].constraintId = 'stale-width';
  expect(() => withFeaturePatternSketchDimension(feature, before.features, '1,0', width, 1)).toThrow(/Quita una cota/);
  const repaired = withFeaturePatternSketchDimension(feature, [], '1,0', 'stale-width', null);
  const updated = withFeaturePatternSketchDimension(repaired, before.features, '1,0', width, 1) as LinearPatternFeature;
  expect(requireInitialRecipeDeclaration(extractRecipeClosure(before.features, request(updated))).eligibility)
    .toBe('initial-declaration-subset');
});

it('requires removing an unavailable sketch identity even when the new sketch reuses its driver ID', () => {
  const before = original(), feature = varied(before);
  const sketch = before.features[2], seed = before.features[3];
  if (seed.type !== 'cut') throw Error('Original cut required');
  sketch.id = 'replacement-profile';
  seed.sketchId = sketch.id;
  expect(() => withFeaturePatternSketchDimension(feature, before.features, '1,0', width, 1)).toThrow(/cota no disponible/);
  expect(rows(feature)[0].sketchId).toBe('pocket-profile');
  const cleared = withFeaturePatternSketchDimension(feature, before.features, '1,0', width, null);
  const replacement = withFeaturePatternSketchDimension(cleared, before.features, '1,0', width, 1) as LinearPatternFeature;
  expect(rows(replacement)).toContainEqual({ address: '1,0', sketchId: 'replacement-profile', constraintId: width, value: 1 });
  expect(rows(replacement)).toContainEqual(rows(feature)[1]);
});
