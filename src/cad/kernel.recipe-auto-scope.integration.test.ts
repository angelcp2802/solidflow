import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { addFeature, parseDocument, serializeDocument, validateDocument } from '../model/document';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import * as recipes from './kernel.feature-recipes';
import * as bodyHelpers from './kernel.bodies';
import * as applicability from './kernel.recipe-additive-applicability';
import { discoverFeatureRecipeAutoScope } from './kernel.recipe-auto-discovery';
import { withFeaturePatternAutoCapture } from '../model/featurePatternCommands';
import { readRecipeAutoScopeCapture } from '../model/featureRecipeAutoScope';
import type { BodyReference, Feature, LinearPatternFeature } from './kernel.types';

const require = createRequire(import.meta.url);
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(require.resolve('replicad-opencascadejs/wasm')) })), 60_000);
const original = () => validateDocument(require('../../scripts/desktop-part-auto-scope-original.cjs')());
const allPattern = (spacing = 10): LinearPatternFeature => ({ id: 'original-auto-pattern', name: 'Original captured scope', type: 'linearPattern',
  baseFeatureId: 'create-c', suppressed: false, first: { direction: [1, 0, 0], spacing, count: 2 }, second: null, secondSeedOnly: false, skipped: [],
  source: { mode: 'features', geometryPattern: false, featureIds: ['source-cut', 'source-fill'] },
  featurePattern: { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput', bindings: ['source-cut', 'source-fill']
    .map(sourceFeatureId => ({ source: { bodyId: 'S', sourceFeatureId }, targetBodyIds: 'scope' })), referencePolicies: [], variation: { kind: 'none' } } });

function fixture(check: (engine: CadEngine) => void) {
  const engine = new CadEngine(); let primary: { error: unknown } | undefined;
  try { check(engine); } catch (error) { primary = { error }; }
  vi.restoreAllMocks();
  try { engine.dispose(); } catch (cleanup) { throw new AggregateError(primary ? [primary.error, cleanup] : [cleanup], 'Original AUTO fixture cleanup failed.'); }
  if (primary) throw primary.error;
}
function catalog(engine: CadEngine) {
  const result = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!result) throw Error('Actual current native catalog required'); return result;
}
function metric(engine: CadEngine, ref: BodyReference, volume: number, area: number, centroid: readonly number[]) {
  const shape = catalog(engine).resolve(ref).shape; validateBodyShape(shape);
  withNativeOwners(owners => {
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const oc = getOC(), properties = owners.own(new oc.GProp_GProps()); oc.BRepGProp.VolumeProperties(shape.wrapped, properties, 1e-10, false, false);
    const point = owners.own(properties.CentreOfMass());
    [point.X(), point.Y(), point.Z()].forEach((value, axis) => expect(Math.abs(value - centroid[axis])).toBeLessThan(1e-6));
  });
}

it('uses the original cut/refill ledger to distinguish a restored A from final-only B replacements', () => fixture(engine => {
  const document = original(), initial = engine.build(document.features); expect(initial.featureErrors).toEqual([]); expect(initial.volume).toBeCloseTo(256, 7);
  const originalA = structuredClone(initial.bodies!.find(body => body.ref.bodyId === 'A'));
  const realEvaluate = recipes.evaluateFeatureRecipes; let affected: readonly string[] | undefined, replacementIds: readonly string[] | undefined;
  vi.spyOn(recipes, 'evaluateFeatureRecipes').mockImplementation(input => {
    const result = realEvaluate(input); affected = recipes.recipeEvaluationEventAffectedBodyIds(result); replacementIds = result.replacements.map(item => item.ref.bodyId); return result;
  });
  const saved = parseDocument(serializeDocument(addFeature(document, allPattern()))), result = engine.build(saved.features);
  expect(result.featureErrors).toEqual([]); expect(result.bodies).toHaveLength(5); expect(result.volume).toBeCloseTo(240, 7);
  expect(affected).toEqual(['A', 'B']); expect(replacementIds).toEqual(['B']);
  expect(result.bodies!.find(body => body.ref.bodyId === 'A')).toEqual(originalA);
  metric(engine, { bodyId: 'A', sourceFeatureId: 'create-a' }, 32, 64, [12, 2, 3]);
  metric(engine, { bodyId: 'B', sourceFeatureId: 'original-auto-pattern' }, 48, 88, [10 + 7 / 3, 7 / 3, -2]);
  expect(() => catalog(engine).resolve({ bodyId: 'A', sourceFeatureId: 'original-auto-pattern' })).toThrow();
}), 60_000);

it('issues native event capture including restored A and follows the saved identities after reopen', () => fixture(engine => {
  const document = original(), before = engine.build(document.features), candidate = addFeature(document, allPattern());
  const capture = discoverFeatureRecipeAutoScope(candidate.features, 'original-auto-pattern');
  expect(capture.scope.capturedBodyIds).toEqual(['A', 'B']); expect(capture.scope.follow).toBe('sameIdentityAtPatternInput');
  expect(capture.scope.captureFingerprint).toMatch(/^auto-scope-v1:[a-f0-9]{64}$/);
  expect(capture).toEqual(readRecipeAutoScopeCapture(structuredClone(capture)));
  expect(discoverFeatureRecipeAutoScope(candidate.features, 'original-auto-pattern')).toEqual(capture);
  // The independent temporary discovery did not mutate this displayed engine.
  metric(engine, { bodyId: 'B', sourceFeatureId: 'create-b' }, 64, 96, [12, 2, -2]);
  const auto = withFeaturePatternAutoCapture(allPattern(), capture), saved = parseDocument(serializeDocument(addFeature(document, auto)));
  expect(saved.features.at(-1)).toEqual(auto);
  const result = engine.build(saved.features); expect(result.featureErrors).toEqual([]); expect(result.volume).toBeCloseTo(240, 7);
  for (const id of ['S', 'A', 'C', 'D']) expect(result.bodies!.find(body => body.ref.bodyId === id)).toEqual(before.bodies!.find(body => body.ref.bodyId === id));
  metric(engine, { bodyId: 'B', sourceFeatureId: auto.id }, 48, 88, [10 + 7 / 3, 7 / 3, -2]);
  expect(() => catalog(engine).resolve({ bodyId: 'A', sourceFeatureId: auto.id })).toThrow();
}), 60_000);

it('keeps captured membership on a changed placement and only explicit discovery transfers intent to D', () => fixture(engine => {
  const document = original(), capture = discoverFeatureRecipeAutoScope(addFeature(document, allPattern()).features, 'original-auto-pattern');
  const auto = withFeaturePatternAutoCapture(allPattern(20), capture), moved = addFeature(document, auto), originalBytes = serializeDocument(moved);
  const rejected = engine.build(moved.features); expect(rejected.featureErrors).toHaveLength(1);
  expect(rejected.featureErrors[0].message).toMatch(/changes no material/); expect(serializeDocument(moved)).toBe(originalBytes);
  metric(engine, { bodyId: 'D', sourceFeatureId: 'create-d' }, 64, 96, [22, 2, -2]);
  const fresh = discoverFeatureRecipeAutoScope(addFeature(document, allPattern(20)).features, 'original-auto-pattern');
  expect(fresh.scope.capturedBodyIds).toEqual(['D']); expect(fresh.scope.captureFingerprint).not.toBe(capture.scope.captureFingerprint);
  const final = withFeaturePatternAutoCapture(allPattern(20), fresh), saved = parseDocument(serializeDocument(addFeature(document, final)));
  const result = engine.build(saved.features); expect(result.featureErrors).toEqual([]); expect(result.volume).toBeCloseTo(240, 7);
  metric(engine, { bodyId: 'B', sourceFeatureId: 'create-b' }, 64, 96, [12, 2, -2]);
  metric(engine, { bodyId: 'D', sourceFeatureId: final.id }, 48, 88, [20 + 7 / 3, 7 / 3, -2]);
}), 60_000);

function insertedOwner(id: string, x: number, y: number, z: number, width: number, height: number, depth: number): Feature[] {
  const profile = 'original-profile-' + id;
  return [{ id: profile, name: 'Original added profile', type: 'sketch', plane: 'XY', offset: z, suppressed: false,
    profile: { kind: 'rectangle', center: [x + width / 2, y + height / 2], width, height } },
  { id: 'create-' + id.toLowerCase(), name: 'Original added owner', type: 'extrude', sketchId: profile, depth, symmetric: false,
    bodyOperation: { mode: 'new', bodyId: id }, suppressed: false }];
}

it('follows A to a different native producer but only recapture can adopt the newly affected E', () => fixture(engine => {
  const document = original(), capture = discoverFeatureRecipeAutoScope(addFeature(document, allPattern()).features, 'original-auto-pattern');
  const afterA = document.features.findIndex(feature => feature.id === 'create-a') + 1;
  document.features.splice(afterA, 0,
    { id: 'extend-a-profile', name: 'Original A extension profile', type: 'sketch', plane: 'XY', offset: 4, suppressed: false,
      profile: { kind: 'rectangle', center: [12, 2], width: 4, height: 4 } },
    { id: 'extend-a', name: 'Original A extension', type: 'extrude', sketchId: 'extend-a-profile', depth: 1, symmetric: false,
      bodyOperation: { mode: 'merge', target: { bodyId: 'A', sourceFeatureId: 'create-a' } }, suppressed: false });
  document.features.splice(document.features.findIndex(feature => feature.id === 'create-c-profile'), 0, ...insertedOwner('E', 10, 0, -12, 4, 4, 4));
  const next = validateDocument(document), auto = withFeaturePatternAutoCapture(allPattern(), capture);
  const originalFollow = parseDocument(serializeDocument(addFeature(next, auto)));
  expect(originalFollow.features.at(-1)).toEqual(auto);
  let result = engine.build(originalFollow.features);
  expect(result.featureErrors).toEqual([]); expect(result.volume).toBeCloseTo(320, 7);
  // A is 4×4×3. E is still the original separate 4 mm cube below B.
  metric(engine, { bodyId: 'A', sourceFeatureId: 'extend-a' }, 48, 80, [12, 2, 3.5]);
  metric(engine, { bodyId: 'B', sourceFeatureId: auto.id }, 48, 88, [10 + 7 / 3, 7 / 3, -2]);
  metric(engine, { bodyId: 'E', sourceFeatureId: 'create-e' }, 64, 96, [12, 2, -10]);
  const fresh = discoverFeatureRecipeAutoScope(addFeature(next, allPattern()).features, auto.id);
  expect(fresh.scope.capturedBodyIds).toEqual(['A', 'B', 'E']);
  expect(fresh.scope.captureFingerprint).not.toBe(capture.scope.captureFingerprint);
  result = engine.build(addFeature(next, withFeaturePatternAutoCapture(allPattern(), fresh)).features);
  expect(result.featureErrors).toEqual([]); expect(result.volume).toBeCloseTo(304, 7);
  metric(engine, { bodyId: 'E', sourceFeatureId: auto.id }, 48, 88, [10 + 7 / 3, 7 / 3, -10]);
}), 60_000);

it('keeps an unavailable captured identity and rejects a coincident replacement with a different body ID', () => fixture(engine => {
  const document = original(), capture = discoverFeatureRecipeAutoScope(addFeature(document, allPattern()).features, 'original-auto-pattern');
  const owner = document.features.find(feature => feature.id === 'create-a')!;
  owner.suppressed = true;
  document.features.splice(document.features.findIndex(feature => feature.id === 'create-c-profile'), 0, ...insertedOwner('E', 10, 0, 2, 4, 4, 2));
  const saved = parseDocument(serializeDocument(addFeature(validateDocument(document), withFeaturePatternAutoCapture(allPattern(), capture))));
  const result = engine.build(saved.features);
  expect(result.featureErrors).toHaveLength(1); expect(result.featureErrors[0].message).toMatch(/captured AUTO identity is unavailable/);
  expect(saved.features.at(-1)).toMatchObject({ featurePattern: { capturedBodyIds: ['A', 'B'] } });
  metric(engine, { bodyId: 'E', sourceFeatureId: 'create-e' }, 32, 64, [12, 2, 3]);
  metric(engine, { bodyId: 'B', sourceFeatureId: 'create-b' }, 64, 96, [12, 2, -2]);
}), 60_000);

it('classifies an uncaptured contact before fusion and withholds the entire progressive AUTO result', () => fixture(engine => {
  const document = original(), capture = discoverFeatureRecipeAutoScope(addFeature(document, allPattern()).features, 'original-auto-pattern');
  // E touches the bottom of the copied refill at Z2, but lies outside the
  // captured set. The prior copied cut may not touch E or evade this check.
  document.features.splice(document.features.findIndex(feature => feature.id === 'create-c-profile'), 0, ...insertedOwner('E', 10, 0, 0, 2, 2, 2));
  const next = validateDocument(document), before = engine.build(next.features);
  expect(before.featureErrors).toEqual([]);
  const after = engine.build(addFeature(next, withFeaturePatternAutoCapture(allPattern(), capture)).features);
  expect(after.featureErrors).toHaveLength(1); expect(after.featureErrors[0].message).toMatch(/saliente toca varios cuerpos/);
  expect(after.bodies).toEqual(before.bodies);
  metric(engine, { bodyId: 'E', sourceFeatureId: 'create-e' }, 8, 24, [11, 1, 1]);
  metric(engine, { bodyId: 'A', sourceFeatureId: 'create-a' }, 32, 64, [12, 2, 3]);
  metric(engine, { bodyId: 'B', sourceFeatureId: 'create-b' }, 64, 96, [12, 2, -2]);
}), 60_000);

it('rejects an overbudget complete inventory before the AUTO evaluator allocates a private shape', () => fixture(engine => {
  const document = original(), capture = discoverFeatureRecipeAutoScope(addFeature(document, allPattern()).features, 'original-auto-pattern');
  const before = engine.build(document.features), pattern = withFeaturePatternAutoCapture(allPattern(), capture) as LinearPatternFeature;
  pattern.first.count = 75; // 74 placements × (2 captured cuts + 5 owner applicability queries) = 518.
  const evaluate = recipes.evaluateFeatureRecipes, copy = bodyHelpers.copyBodyShape;
  let evaluationCount = 0, privateCopies = 0, evaluating = false;
  vi.spyOn(bodyHelpers, 'copyBodyShape').mockImplementation(shape => { if (evaluating) privateCopies++; return copy(shape); });
  vi.spyOn(recipes, 'evaluateFeatureRecipes').mockImplementation(input => {
    evaluationCount++; evaluating = true;
    try { return evaluate(input); } finally { evaluating = false; }
  });
  const result = engine.build(addFeature(document, pattern).features);
  expect(evaluationCount).toBe(1); expect(privateCopies).toBe(0);
  expect(result.featureErrors[0].message).toMatch(/512 aplicaciones nativas cuerpo\/evento/);
  expect(result.bodies).toEqual(before.bodies);
}), 60_000);

it.each(['applicability', 'union', 'engine-release'] as const)('withholds capture after a real late %s failure', kind => fixture(engine => {
  const document = original(), candidate = addFeature(document, allPattern()), before = engine.build(document.features);
  const failure = Error('Original late AUTO ' + kind);
  const evaluate = recipes.evaluateFeatureRecipes, classify = applicability.classifyAdditiveRecipeOwner, boolean = bodyHelpers.bodyBoolean;
  const dispose = CadEngine.prototype.dispose;
  let evaluations = 0, attempts = 0, evaluating = false;
  vi.spyOn(recipes, 'evaluateFeatureRecipes').mockImplementation(input => {
    evaluations++; evaluating = true;
    try { return evaluate(input); } finally { evaluating = false; }
  });
  if (kind === 'applicability') vi.spyOn(applicability, 'classifyAdditiveRecipeOwner').mockImplementation((owner, tool) => {
    if (evaluating && ++attempts === 2) throw failure;
    return classify(owner, tool);
  });
  if (kind === 'union') vi.spyOn(bodyHelpers, 'bodyBoolean').mockImplementation((operation, owner, tool) => {
    if (evaluating && operation === 'add' && ++attempts === 1) throw failure;
    return boolean(operation, owner, tool);
  });
  if (kind === 'engine-release') vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) {
    dispose.call(this);
    if (this !== engine && ++attempts === 2) throw failure;
  });
  expect(() => discoverFeatureRecipeAutoScope(candidate.features, 'original-auto-pattern')).toThrow(
    kind === 'engine-release' ? NativeCleanupError : new RegExp(failure.message));
  expect(evaluations).toBe(1); expect(attempts).toBe(kind === 'union' ? 1 : 2);
  metric(engine, { bodyId: 'B', sourceFeatureId: 'create-b' }, 64, 96, [12, 2, -2]);
  expect(engine.build(document.features).bodies).toEqual(before.bodies);
}), 60_000);
