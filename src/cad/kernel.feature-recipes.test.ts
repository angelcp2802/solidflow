import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, makeCylinder, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import type { BodyReference, Feature, Vec3 } from './kernel.types';
import type { RegenerationRequest, RecipeInstanceTransform } from '../model/featureRecipes';
import { exactStateKey } from '../model/featureRecipes';
import { bodyBoolean, copyBodyShape, NativeBodyCatalog, NativeBodyTransaction, validateBodyShape } from './kernel.bodies';
import * as bodyHelpers from './kernel.bodies';
import * as recipeBridge from './kernel.recipe-instance';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import { evaluateFeatureRecipes, stageFeatureRecipeEvaluation, type NativeRecipeSourceState, type OwnedRecipeEvaluation } from './kernel.feature-recipes';

// Original Cartesian sources/targets. Expected metrics use box/cylinder formulas,
// not regenerated expected geometry. These tests exercise the evaluator component,
// not a saved-document parser, editor or complete native reference-remapping path.
const metricTolerance = 1e-5, coordinateTolerance = 1e-6;
class Fixtures {
  private readonly actions = new Map<object, () => void>();
  track<T extends object>(value: T, dispose: () => void): T { this.actions.set(value, dispose); return value; }
  own<T extends { delete(): void }>(value: T): T { return this.track(value, () => value.delete()); }
  evaluation(value: OwnedRecipeEvaluation): OwnedRecipeEvaluation { return this.track(value, () => value.dispose()); }
  catalog(value: NativeBodyCatalog): NativeBodyCatalog { return this.track(value, () => value.dispose()); }
  transaction(value: NativeBodyTransaction): NativeBodyTransaction { return this.track(value, () => value.dispose()); }
  dispose(): unknown[] {
    const errors: unknown[] = [];
    for (const [key, dispose] of [...this.actions].reverse()) {
      this.actions.delete(key);
      try { dispose(); } catch (error) { errors.push(error); }
    }
    return errors;
  }
}
function fixture(check: (owners: Fixtures) => void): void {
  const owners = new Fixtures(); let failed = false, primary: unknown;
  try { check(owners); } catch (error) { failed = true; primary = error; }
  vi.restoreAllMocks();
  const errors = owners.dispose();
  if (errors.length) throw new AggregateError(failed ? [primary, ...errors] : errors,
    'Original recipe evaluator fixture or release failed.', { cause: failed ? primary : errors[0] });
  if (failed) throw primary;
}
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

function box(owners: Fixtures, min: Vec3, max: Vec3): Shape3D { return owners.own(makeBox(min, max)); }
function boolean(owners: Fixtures, operation: 'add' | 'subtract', a: Shape3D, b: Shape3D): Shape3D {
  return owners.own(bodyBoolean(operation, a, b));
}
function metrics(shape: Shape3D, owners: Fixtures): { volume: number; area: number; bounds: Vec3[]; solids: number } {
  validateBodyShape(shape);
  const solids = shape.solids; solids.forEach(solid => owners.own(solid));
  return { volume: owners.own(measureShapeVolumeProperties(shape)).volume,
    area: owners.own(measureShapeSurfaceProperties(shape)).area,
    bounds: owners.own(shape.boundingBox).bounds, solids: solids.length };
}
function expectMetrics(shape: Shape3D, expectedVolume: number, expectedArea: number, min: Vec3, max: Vec3, owners: Fixtures): void {
  const actual = metrics(shape, owners);
  expect(actual.solids).toBe(1);
  expect(Math.abs(actual.volume - expectedVolume)).toBeLessThan(metricTolerance);
  expect(Math.abs(actual.area - expectedArea)).toBeLessThan(metricTolerance);
  [min, max].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(actual.bounds[i][j] - value)).toBeLessThan(coordinateTolerance)));
}
function probe(shape: Shape3D, center: Vec3, material: boolean, owners: Fixtures): void {
  const cube = box(owners, center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3);
  const common = owners.own(bodyBoolean('common', shape, cube));
  expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (material ? .008 : 0))).toBeLessThan(1e-7);
}
function rectangle(id: string, center: [number, number], width: number, height: number, offset = 0): Feature {
  return { id, type: 'sketch', name: id, suppressed: false, plane: 'XY', offset,
    profile: { kind: 'rectangle', center, width, height } };
}
function circle(id: string, center: [number, number], radius: number, offset = 0): Feature {
  return { id, type: 'sketch', name: id, suppressed: false, plane: 'XY', offset,
    profile: { kind: 'circle', center, radius } };
}
function creation(id: string, bodyId: string, min: Vec3, max: Vec3): Feature[] {
  return [rectangle(id + '-profile', [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], max[0] - min[0], max[1] - min[1], min[2]),
    { id, type: 'extrude', name: id, suppressed: false, sketchId: id + '-profile', depth: max[2] - min[2],
      symmetric: false, bodyOperation: { mode: 'new', bodyId } }];
}
function cut(id: string, sketchId: string, scope: BodyReference[], depth: number, throughAll = false): Feature {
  return { id, type: 'cut', name: id, suppressed: false, sketchId, depth, symmetric: false, bodyScope: scope,
    ...(throughAll ? { endCondition: { kind: 'throughAll' as const, baseFeatureId: scope[0].sourceFeatureId, bothDirections: false } } : {}) };
}
function merge(id: string, sketchId: string, target: BodyReference, depth: number): Feature {
  return { id, type: 'extrude', name: id, suppressed: false, sketchId, depth, symmetric: false,
    bodyOperation: { mode: 'merge', target } };
}
function catalog(owners: Fixtures, inputs: { ref: BodyReference; createdBy: string; shape: Shape3D }[]): NativeBodyCatalog {
  let current = owners.catalog(new NativeBodyCatalog());
  for (const input of inputs) {
    const transaction = owners.transaction(current.stageNew({ ref: input.ref, createdByFeatureId: input.createdBy,
      name: input.ref.bodyId, lineage: 'original-' + input.ref.sourceFeatureId }, input.shape));
    const next = transaction.commit(); owners.own(next.aggregate); current = owners.catalog(next.catalog);
  }
  return current;
}
function state(ref: BodyReference, shape: Shape3D): NativeRecipeSourceState { return { ref, shape, lineage: 'original-source-' + ref.sourceFeatureId + '-' + ref.bodyId }; }
function request(features: Feature[], sourceRefs: BodyReference[], targets: BodyReference[], transforms: RecipeInstanceTransform[],
  kind: RegenerationRequest['patternKind'] = 'linearPattern'): RegenerationRequest {
  return { mode: 'regenerate', geometryPattern: false, patternId: 'recipe-pattern', patternKind: kind,
    beforeFeatureIndex: features.length, sourceFeatureIds: [...new Set(sourceRefs.map(ref => ref.sourceFeatureId))],
    plan: { transforms, structure: ['original-' + kind, transforms] }, scope: { mode: 'selected', targets }, targetSnapshot: targets,
    bindings: sourceRefs.map(source => ({ source, targets: targets.map(target => target.bodyId) })), referencePolicies: [], variation: { kind: 'none' } };
}
type Setup = { features: Feature[]; request: RegenerationRequest; catalog: NativeBodyCatalog; historicalStates: Map<string, NativeRecipeSourceState> };
function commit(evaluation: OwnedRecipeEvaluation, setup: Setup, owners: Fixtures): NativeBodyCatalog {
  const transaction = owners.transaction(stageFeatureRecipeEvaluation(evaluation, setup.catalog,
    { sourceFeatureId: setup.request.patternId, lineage: 'original-evaluator-test' }, setup));
  const next = transaction.commit(); owners.own(next.aggregate); return owners.catalog(next.catalog);
}

const throughAllRows: { kind: RegenerationRequest['patternKind']; transform: RecipeInstanceTransform; min: Vec3; max: Vec3; center: Vec3 }[] = [
  { kind: 'linearPattern', transform: { key: '1,0', translation: [20, 0, 0] }, min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
  { kind: 'circularPattern', transform: { key: '1', angle: 180, origin: [15, 0, 0], direction: [0, 0, 1] }, min: [20, -10, 0], max: [30, 0, 8], center: [25, -5, 6] },
  { kind: 'mirror', transform: { key: 'mirror', mirror: { origin: [15, 0, 0], xDirection: [0, 1, 0], normal: [1, 0, 0] } },
    min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
];
for (const row of throughAllRows) it('evaluates an actual taller-owner ThroughAll recipe for ' + row.kind, () => fixture(owners => {
  const sourceRef = { bodyId: 'S', sourceFeatureId: 'source-cut' }, targetRef = { bodyId: 'T', sourceFeatureId: 'create-target' };
  const source = box(owners, [0, 0, 0], [10, 10, 4]);
  const sourceCut = boolean(owners, 'subtract', source, owners.own(makeCylinder(1, 4, [5, 5, 0], [0, 0, 1])));
  const target = box(owners, row.min, row.max);
  const features = [...creation('create-source', 'S', [0, 0, 0], [10, 10, 4]), circle('source-cut-profile', [5, 5], 1),
    cut('source-cut', 'source-cut-profile', [{ bodyId: 'S', sourceFeatureId: 'create-source' }], 1, true),
    ...creation('create-target', 'T', row.min, row.max)];
  const setup: Setup = { features, request: request(features, [sourceRef], [targetRef], [row.transform], row.kind),
    catalog: catalog(owners, [{ ref: sourceRef, createdBy: 'create-source', shape: sourceCut }, { ref: targetRef, createdBy: 'create-target', shape: target }]),
    historicalStates: new Map([[exactStateKey(sourceRef), state(sourceRef, sourceCut)]]) };
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(evaluated.replacements.map(item => item.ref)).toEqual([targetRef]);
  expectMetrics(evaluated.replacements[0].shape, 800 - 8 * Math.PI, 520 + 14 * Math.PI, row.min, row.max, owners);
  probe(evaluated.replacements[0].shape, row.center, false, owners);
  const next = commit(evaluated, setup, owners);
  expect(next.resolve({ bodyId: 'T', sourceFeatureId: 'recipe-pattern' }).ref.bodyId).toBe('T');
  expectMetrics(next.resolve(sourceRef).shape, 400 - 4 * Math.PI, 360 + 6 * Math.PI, [0, 0, 0], [10, 10, 4], owners);
  expectMetrics(setup.catalog.resolve(targetRef).shape, 800, 520, row.min, row.max, owners);
}), 60_000);

function parentFixture(owners: Fixtures, secondAddress = false, updatedTarget = false): Setup {
  const x0 = updatedTarget ? -20 : -6, width = updatedTarget ? 10 : 12, height = updatedTarget ? 10 : 8;
  const center: [number, number] = updatedTarget ? [-15, 5] : [-3, 4], bossHeight = updatedTarget ? 4 : 2;
  const sourceBase = box(owners, [x0, 0, 0], [x0 + width, height, 4]);
  const sourceBoss = box(owners, [center[0] - 1, center[1] - 1, 4], [center[0] + 1, center[1] + 1, 4 + bossHeight]);
  const sourceParent = boolean(owners, 'add', sourceBase, sourceBoss);
  const sourceChild = boolean(owners, 'subtract', sourceParent, owners.own(makeCylinder(.5, updatedTarget ? 8 : 2,
    [center[0], center[1], updatedTarget ? 0 : 6], [0, 0, updatedTarget ? 1 : -1])));
  const parent = { bodyId: 'S', sourceFeatureId: 'parent' }, child = { bodyId: 'S', sourceFeatureId: 'child' };
  const features: Feature[] = [...creation('create-source', 'S', [x0, 0, 0], [x0 + width, height, 4]),
    rectangle('parent-profile', center, 2, 2, 4), merge('parent', 'parent-profile', { bodyId: 'S', sourceFeatureId: 'create-source' }, bossHeight),
    circle('child-profile', center, .5, updatedTarget ? 0 : 6), cut('child', 'child-profile', [parent], updatedTarget ? 1 : -2, updatedTarget),
    ...creation('create-target', 'T', [0, 0, 0], [width, height, 4])];
  let target = box(owners, [0, 0, 0], [width, height, 4]), targetRef = { bodyId: 'T', sourceFeatureId: 'create-target' };
  if (!updatedTarget) {
    target = boolean(owners, 'add', target, box(owners, [2, 3, 4], [4, 5, 6]));
    features.push(rectangle('initial-target-boss-profile', [3, 4], 2, 2, 4),
      merge('initial-target-boss', 'initial-target-boss-profile', targetRef, 2));
    targetRef = { bodyId: 'T', sourceFeatureId: 'initial-target-boss' };
  }
  const transforms: RecipeInstanceTransform[] = updatedTarget ? [{ key: '1,0', translation: [20, 0, 0] }]
    : [{ key: '1,0', translation: [6, 0, 0] }, ...(secondAddress ? [{ key: '2,0', translation: [12, 0, 0] as Vec3 }] : [])];
  return { features, request: request(features, [child, parent], [targetRef], transforms),
    catalog: catalog(owners, [{ ref: child, createdBy: 'create-source', shape: sourceChild }, { ref: targetRef, createdBy: 'create-target', shape: target }]),
    historicalStates: new Map([[exactStateKey(parent), state(parent, sourceParent)], [exactStateKey(child), state(child, sourceChild)]]) };
}

for (const second of [false, true]) it('keeps a no-op selected parent virtual role and uses each own address, second=' + second, () => fixture(owners => {
  const setup = parentFixture(owners, second), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  // Each radius-.5, depth-2 pocket removes pi * .5^2 * 2 = pi/2.
  expectMetrics(evaluated.replacements[0].shape, (second ? 400 : 392) - (second ? 1 : .5) * Math.PI,
    (second ? 384 : 368) + (second ? 4 : 2) * Math.PI, [0, 0, 0], [12, 8, 6], owners);
  const parents = evaluated.attestation.virtualOutputs.filter(output => output.sourcePoststate.sourceFeatureId === 'parent');
  expect(parents.map(output => [output.address, output.materialChanged])).toEqual(second ? [['1,0', false], ['2,0', true]] : [['1,0', false]]);
  probe(evaluated.replacements[0].shape, [3, 4, 5], false, owners);
  probe(evaluated.replacements[0].shape, [3, 4, 3], true, owners);
  const old = setup.request.targetSnapshot[0], next = commit(evaluated, setup, owners);
  expect(() => next.resolve({ bodyId: 'T', sourceFeatureId: 'parent' })).toThrow();
  expect(next.resolve({ bodyId: 'T', sourceFeatureId: 'recipe-pattern' }).createdByFeatureId).toBe('create-target');
  expectMetrics(setup.catalog.resolve(old).shape, 392, 368, [0, 0, 0], [12, 8, 6], owners);
}), 60_000);

it('uses the parent-updated detached owner for the following ThroughAll tool', () => fixture(owners => {
  const setup = parentFixture(owners, false, true), delegated = recipeBridge.buildRecipeInstanceTool;
  let observed = false;
  vi.spyOn(recipeBridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    if (input.featureId === 'child') {
      observed = true;
      expectMetrics(input.workingTarget, 416, 392, [0, 0, 0], [10, 10, 8], owners);
    }
    const result = delegated(input);
    try {
      if (input.featureId === 'child') expectMetrics(result.tool, 9 * Math.PI / 4, 9.5 * Math.PI, [4.5, 4.5, 0], [5.5, 5.5, 9], owners);
    } catch (error) {
      try { result.tool.delete(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Observed recipe tool or release failed.', { cause: error }); }
      throw error;
    }
    return result;
  });
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(observed).toBe(true);
  expectMetrics(evaluated.replacements[0].shape, 416 - 2 * Math.PI, 392 + 7.5 * Math.PI, [0, 0, 0], [10, 10, 8], owners);
  probe(evaluated.replacements[0].shape, [5, 5, 6], false, owners);
}), 60_000);

it('rejects a missing second-address virtual parent rather than borrowing an equal first-address role', () => fixture(owners => {
  const setup = parentFixture(owners, true), original = Map.prototype.get;
  const missingKey = JSON.stringify(['S', 'parent', 'T', '2,0', 'body']);
  let requested = 0;
  vi.spyOn(Map.prototype, 'get').mockImplementation(function(this: Map<unknown, unknown>, key: unknown) {
    if (key === missingKey) { requested++; return undefined; }
    return original.call(this, key);
  });
  let caught: unknown;
  try { owners.evaluation(evaluateFeatureRecipes(setup)); } catch (error) { caught = error; }
  vi.restoreAllMocks();
  expect(requested).toBe(1); expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toContain('same-instance parent');
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 392, 368, [0, 0, 0], [12, 8, 6], owners);
}), 60_000);

it('keeps a routed untouched owner at its exact old state while changing another owner', () => fixture(owners => {
  const setup = parentFixture(owners), child = { bodyId: 'S', sourceFeatureId: 'child' }, u = { bodyId: 'U', sourceFeatureId: 'create-u' };
  setup.features.push(...creation('create-u', 'U', [20, 0, 0], [32, 8, 4]));
  const priorT = setup.request.targetSnapshot[0];
  setup.catalog = catalog(owners, [{ ref: child, createdBy: 'create-source', shape: setup.historicalStates.get(exactStateKey(child))!.shape! },
    { ref: priorT, createdBy: 'create-target', shape: setup.catalog.resolve(priorT).shape },
    { ref: u, createdBy: 'create-u', shape: box(owners, [20, 0, 0], [32, 8, 4]) }]);
  setup.request = request(setup.features, [child], [priorT, u], [{ key: '1,0', translation: [6, 0, 0] }]);
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['T']);
  const next = commit(evaluated, setup, owners);
  expect(next.resolve(u).ref).toEqual(u);
  expect(() => next.resolve({ bodyId: 'U', sourceFeatureId: 'recipe-pattern' })).toThrow();
  expectMetrics(next.resolve(u).shape, 384, 352, [20, 0, 0], [32, 8, 4], owners);
}), 60_000);

function tailFixture(owners: Fixtures): Setup {
  const base = boolean(owners, 'add', box(owners, [0, 0, 0], [8, 4, 4]), box(owners, [8, 0, 0], [14, 4, 2]));
  const seeded = boolean(owners, 'subtract', base, box(owners, [1, 0, 0], [2, 4, 2]));
  const source = { bodyId: 'T', sourceFeatureId: 'seed-cut' };
  const features = [...creation('create-tail-owner', 'T', [0, 0, 0], [8, 4, 4]), rectangle('tail-profile', [11, 2], 6, 4),
    merge('tail', 'tail-profile', { bodyId: 'T', sourceFeatureId: 'create-tail-owner' }, 2),
    rectangle('seed-cut-profile', [1.5, 2], 1, 4), cut('seed-cut', 'seed-cut-profile', [{ bodyId: 'T', sourceFeatureId: 'tail' }], 2)];
  return { features, request: request(features, [source], [source], [{ key: '1,0', translation: [4, 0, 0] }, { key: '2,0', translation: [8, 0, 0] }]),
    catalog: catalog(owners, [{ ref: source, createdBy: 'create-tail-owner', shape: seeded }]),
    historicalStates: new Map([[exactStateKey(source), state(source, owners.own(copyBodyShape(seeded)))]]) };
}
it('rejects a late tail split atomically after observing the earlier address working result', () => fixture(owners => {
  const setup = tailFixture(owners), delegated = recipeBridge.buildRecipeInstanceTool; let observedSecond = false;
  vi.spyOn(recipeBridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    if (input.address === '2,0') { observedSecond = true; expectMetrics(input.workingTarget, 160, 256, [0, 0, 0], [14, 4, 4], owners); }
    return delegated(input);
  });
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow(); expect(observedSecond).toBe(true);
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 168, 244, [0, 0, 0], [14, 4, 4], owners);
  expect(() => setup.catalog.resolve({ bodyId: 'T', sourceFeatureId: 'recipe-pattern' })).toThrow();
}), 60_000);

it('attests every same-event owner before grouping equivalent full tools', () => fixture(owners => {
  const setup = tailFixture(owners), original = setup.features.find(feature => feature.id === 'seed-cut');
  if (!original || original.type !== 'cut') throw new Error('Original cut fixture missing.');
  setup.features.unshift(...creation('create-other-owner', 'Q', [0, 0, 0], [8, 4, 4]));
  original.bodyScope!.push({ bodyId: 'Q', sourceFeatureId: 'create-other-owner' });
  const q = { bodyId: 'Q', sourceFeatureId: 'seed-cut' }, t = setup.request.targetSnapshot[0];
  setup.request = request(setup.features, [t, q], [t], [{ key: '1,0', translation: [4, 0, 0] }]);
  const build = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool');
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow('historical recipe source');
  expect(build).not.toHaveBeenCalled();
  expectMetrics(setup.catalog.resolve(t).shape, 168, 244, [0, 0, 0], [14, 4, 4], owners);
}), 60_000);

it('rejects a stale current target even with materialized exact historical sources', () => fixture(owners => {
  const setup = parentFixture(owners), sourceCount = setup.historicalStates.size, stale = { bodyId: 'T', sourceFeatureId: 'create-target' };
  setup.request.scope = { mode: 'selected', targets: [stale] }; setup.request.targetSnapshot = [stale];
  const build = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool');
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow(); expect(build).not.toHaveBeenCalled();
  expect(setup.historicalStates.size).toBe(sourceCount);
}), 60_000);

it('releases staged candidates before commit and retains cleanup failure without adopting a proposal', () => fixture(owners => {
  const setup = parentFixture(owners), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  const cleanup = new Error('Original evaluated-candidate release failure');
  const handle = evaluated.replacements[0].shape.wrapped, rawDelete = handle.delete.bind(handle);
  const deleted = vi.fn(() => { rawDelete(); throw cleanup; });
  Object.defineProperty(handle, 'delete', { configurable: true, value: deleted });
  const committed = vi.spyOn(NativeBodyTransaction.prototype, 'commit');
  let caught: unknown;
  try { owners.transaction(stageFeatureRecipeEvaluation(evaluated, setup.catalog, { sourceFeatureId: 'recipe-pattern', lineage: 'original-stage-fault' }, setup)); }
  catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(NativeCleanupError); expect(deleted).toHaveBeenCalledTimes(1);
  expect(committed).not.toHaveBeenCalled();
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 392, 368, [0, 0, 0], [12, 8, 6], owners);
  expect(() => setup.catalog.resolve({ bodyId: 'T', sourceFeatureId: 'recipe-pattern' })).toThrow();
}), 60_000);

function orderedPairFixture(owners: Fixtures, kind: 'islands' | 'empty' | 'move' | 'cancel'): Setup {
  const height = kind === 'islands' ? 6 : 4, width = kind === 'empty' ? 20 : 10, breadth = kind === 'empty' ? 10 : 6;
  const sourceBase = box(owners, [0, 0, 0], [width, breadth, height]);
  const targetMin: Vec3 = [30, 0, 0], targetMax: Vec3 = [40, breadth, 4], target = box(owners, targetMin, targetMax);
  const first = { bodyId: 'S', sourceFeatureId: 'first' }, second = { bodyId: 'S', sourceFeatureId: 'second' };
  const source = { bodyId: 'S', sourceFeatureId: 'create-source' }, destination = { bodyId: 'T', sourceFeatureId: 'create-target' };
  let firstShape: Shape3D, secondShape: Shape3D;
  const features = creation('create-source', 'S', [0, 0, 0], [width, breadth, height]);
  if (kind === 'islands') {
    firstShape = boolean(owners, 'subtract', sourceBase, box(owners, [4, 0, 0], [6, 6, 4]));
    secondShape = boolean(owners, 'add', firstShape, box(owners, [3, 0, 3], [7, 6, 5]));
    features.push(rectangle('first-profile', [5, 3], 2, 6), cut('first', 'first-profile', [source], 4),
      rectangle('second-profile', [5, 3], 4, 6, 3), merge('second', 'second-profile', first, 2));
  } else if (kind === 'empty') {
    firstShape = boolean(owners, 'subtract', sourceBase, box(owners, [0, 0, 0], [10, 10, 4]));
    secondShape = boolean(owners, 'add', firstShape, box(owners, [0, 0, 0], [10, 10, 6]));
    features.push(rectangle('first-profile', [5, 5], 10, 10), cut('first', 'first-profile', [source], 4),
      rectangle('second-profile', [5, 5], 10, 10), merge('second', 'second-profile', first, 6));
  } else if (kind === 'move') {
    firstShape = boolean(owners, 'subtract', sourceBase, box(owners, [2, 2, 3], [4, 4, 4]));
    secondShape = boolean(owners, 'add', firstShape, box(owners, [6, 2, 4], [8, 4, 5]));
    features.push(rectangle('first-profile', [3, 3], 2, 2, 3), cut('first', 'first-profile', [source], 1),
      rectangle('second-profile', [7, 3], 2, 2, 4), merge('second', 'second-profile', first, 1));
  } else {
    firstShape = boolean(owners, 'add', sourceBase, box(owners, [2, 2, 4], [4, 4, 5]));
    secondShape = boolean(owners, 'subtract', firstShape, box(owners, [2, 2, 4], [4, 4, 5]));
    features.push(rectangle('first-profile', [3, 3], 2, 2, 4), merge('first', 'first-profile', source, 1),
      rectangle('second-profile', [3, 3], 2, 2, 4), cut('second', 'second-profile', [first], 1));
  }
  features.push(...creation('create-target', 'T', targetMin, targetMax));
  return { features, request: request(features, [second, first], [destination], [{ key: '1,0', translation: [30, 0, 0] }]),
    catalog: catalog(owners, [{ ref: second, createdBy: 'create-source', shape: secondShape }, { ref: destination, createdBy: 'create-target', shape: target }]),
    historicalStates: new Map([[exactStateKey(first), state(first, firstShape)], [exactStateKey(second), state(second, secondShape)]]) };
}

it('allows closed temporary islands until a later selected recipe reconnects the same final owner', () => fixture(owners => {
  const setup = orderedPairFixture(owners, 'islands'), delegated = recipeBridge.buildRecipeInstanceTool; let observedIslands = false;
  vi.spyOn(recipeBridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    if (input.featureId === 'second') {
      observedIslands = true; const solids = input.workingTarget.solids; solids.forEach(solid => owners.own(solid));
      expect(solids).toHaveLength(2);
      expect(Math.abs(owners.own(measureShapeVolumeProperties(input.workingTarget)).volume - 192)).toBeLessThan(metricTolerance);
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(input.workingTarget)).area - 256)).toBeLessThan(metricTolerance);
    }
    return delegated(input);
  });
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup)); expect(observedIslands).toBe(true);
  // XZ cross-section area38, perimeter36, extruded6 along Y: V228, A=76+216.
  expectMetrics(evaluated.replacements[0].shape, 228, 292, [30, 0, 0], [40, 6, 5], owners);
  const next = commit(evaluated, setup, owners);
  expect(next.resolve({ bodyId: 'T', sourceFeatureId: 'recipe-pattern' }).ref.bodyId).toBe('T');
}), 60_000);

it('allows a genuine empty intermediate followed by a blind recipe restoring changed closed material', () => fixture(owners => {
  const setup = orderedPairFixture(owners, 'empty'), delegated = recipeBridge.buildRecipeInstanceTool; let observedEmpty = false;
  vi.spyOn(recipeBridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    if (input.featureId === 'second') {
      observedEmpty = true;
      expect(owners.own(measureShapeVolumeProperties(input.workingTarget)).volume).toBe(0);
      const solids = input.workingTarget.solids; solids.forEach(solid => owners.own(solid)); expect(solids).toHaveLength(0);
    }
    return delegated(input);
  });
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup)); expect(observedEmpty).toBe(true);
  expectMetrics(evaluated.replacements[0].shape, 600, 440, [30, 0, 0], [40, 10, 6], owners);
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 400, 360, [30, 0, 0], [40, 10, 4], owners);
}), 60_000);

it('publishes changed material at equal final volume using the full ordered recipe result', () => fixture(owners => {
  const setup = orderedPairFixture(owners, 'move'), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expectMetrics(evaluated.replacements[0].shape, 240, 264, [30, 0, 0], [40, 6, 5], owners);
  probe(evaluated.replacements[0].shape, [33, 3, 3.5], false, owners);
  probe(evaluated.replacements[0].shape, [37, 3, 4.5], true, owners);
  expect(commit(evaluated, setup, owners).resolve({ bodyId: 'T', sourceFeatureId: 'recipe-pattern' }).ref.bodyId).toBe('T');
}), 60_000);

it('rejects an add-then-remove cancellation instead of advancing an ever-changed owner', () => fixture(owners => {
  const setup = orderedPairFixture(owners, 'cancel');
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow('changes no material');
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 240, 248, [30, 0, 0], [40, 6, 4], owners);
}), 60_000);

it('rechecks current recipe parameters before staging even with unchanged native identities', () => fixture(owners => {
  const setup = parentFixture(owners), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  const feature = setup.features.find(item => item.id === 'parent');
  if (!feature || feature.type !== 'extrude') throw new Error('Original parent missing.');
  feature.depth = 3;
  expect(() => owners.transaction(stageFeatureRecipeEvaluation(evaluated, setup.catalog,
    { sourceFeatureId: 'recipe-pattern', lineage: 'original-stale-preview' }, setup))).toThrow('changed after native evaluation');
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 392, 368, [0, 0, 0], [12, 8, 6], owners);
}), 60_000);

it('releases every retained candidate when the first disposal registration fails before insertion', () => fixture(owners => {
  const setup = parentFixture(owners, false, true), child = { bodyId: 'S', sourceFeatureId: 'child' };
  const t = setup.request.targetSnapshot[0], u = { bodyId: 'U', sourceFeatureId: 'create-u' };
  setup.features.push(...creation('create-u', 'U', [0, 0, 0], [10, 10, 4]));
  setup.catalog = catalog(owners, [{ ref: child, createdBy: 'create-source', shape: setup.historicalStates.get(exactStateKey(child))!.shape! },
    { ref: t, createdBy: 'create-target', shape: setup.catalog.resolve(t).shape },
    { ref: u, createdBy: 'create-u', shape: box(owners, [0, 0, 0], [10, 10, 4]) }]);
  setup.request = request(setup.features, [{ bodyId: 'S', sourceFeatureId: 'parent' }, child], [t, u], [{ key: '1,0', translation: [20, 0, 0] }]);
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup)); expect(evaluated.replacements).toHaveLength(2);
  const counts = [0, 0], first = evaluated.replacements[0].shape;
  evaluated.replacements.forEach((item, index) => {
    const handle = item.shape.wrapped, rawDelete = handle.delete.bind(handle);
    Object.defineProperty(handle, 'delete', { configurable: true, value: () => { counts[index]++; rawDelete(); } });
  });
  const failure = new Error('Original first disposal registration failure'), original = Map.prototype.set;
  let injected = false;
  vi.spyOn(Map.prototype, 'set').mockImplementation(function(this: Map<unknown, unknown>, key: unknown, value: unknown) {
    const record = value as { attempted?: unknown; release?: unknown } | null;
    if (!injected && key === first && record && typeof record.attempted === 'boolean' && typeof record.release === 'function') {
      injected = true; throw failure;
    }
    return original.call(this, key, value);
  });
  let caught: unknown; try { evaluated.dispose(); } catch (error) { caught = error; }
  vi.restoreAllMocks();
  expect(injected).toBe(true); expect(caught).toBe(failure); expect(counts).toEqual([1, 1]);
  expectMetrics(setup.catalog.resolve(t).shape, 400, 360, [0, 0, 0], [10, 10, 4], owners);
  expectMetrics(setup.catalog.resolve(u).shape, 400, 360, [0, 0, 0], [10, 10, 4], owners);
}), 60_000);

it('preserves a native source cleanup error that appears between evaluation and staging', () => fixture(owners => {
  const setup = parentFixture(owners), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  const cleanup = new Error('Original source capture release failure'); let sourceFailure: unknown;
  try {
    withNativeOwners(scope => {
      const shape = scope.own(makeBox([0, 0, 0], [1, 1, 1])), handle = shape.wrapped, rawDelete = handle.delete.bind(handle);
      Object.defineProperty(handle, 'delete', { configurable: true, value: () => { rawDelete(); throw cleanup; } });
    });
  } catch (error) { sourceFailure = error; }
  expect(sourceFailure).toBeInstanceOf(NativeCleanupError);
  const key = exactStateKey({ bodyId: 'S', sourceFeatureId: 'parent' }), source = setup.historicalStates.get(key)!;
  setup.historicalStates.set(key, { ...source, error: sourceFailure });
  let caught: unknown;
  try { owners.transaction(stageFeatureRecipeEvaluation(evaluated, setup.catalog,
    { sourceFeatureId: 'recipe-pattern', lineage: 'original-source-error' }, setup)); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(NativeCleanupError);
  expect((caught as NativeCleanupError).cause).toBe(sourceFailure);
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 392, 368, [0, 0, 0], [12, 8, 6], owners);
}), 60_000);

it('groups equivalent same-event historical owners only after attesting both exact outputs', () => fixture(owners => {
  const setup = tailFixture(owners), feature = setup.features.find(item => item.id === 'seed-cut');
  if (!feature || feature.type !== 'cut') throw new Error('Original cut fixture missing.');
  setup.features.unshift(...creation('create-other-owner', 'Q', [0, 0, 0], [8, 4, 4]));
  feature.bodyScope!.push({ bodyId: 'Q', sourceFeatureId: 'create-other-owner' });
  const q = { bodyId: 'Q', sourceFeatureId: 'seed-cut' }, t = setup.request.targetSnapshot[0];
  const qPoststate = boolean(owners, 'subtract', box(owners, [0, 0, 0], [8, 4, 4]), box(owners, [1, 0, 0], [2, 4, 2]));
  setup.historicalStates.set(exactStateKey(q), state(q, qPoststate));
  setup.request = request(setup.features, [q, t], [t], [{ key: '1,0', translation: [4, 0, 0] }]);
  const build = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool');
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(build).toHaveBeenCalledTimes(1);
  expect(evaluated.attestation.sources.map(item => item.ref.bodyId).sort()).toEqual(['Q', 'T']);
  expect(evaluated.attestation.virtualOutputs.map(item => item.sourcePoststate.bodyId).sort()).toEqual(['Q', 'T']);
  expectMetrics(evaluated.replacements[0].shape, 160, 256, [0, 0, 0], [14, 4, 4], owners);
  expectMetrics(setup.catalog.resolve(t).shape, 168, 244, [0, 0, 0], [14, 4, 4], owners);
}), 60_000);

it('retains the actual late split error together with candidate release failure and the old owner', () => fixture(owners => {
  const setup = tailFixture(owners), copy = bodyHelpers.copyBodyShape, validate = bodyHelpers.validateBodyShape;
  const cleanup = new Error('Original late split candidate release failure');
  let geometryFailure: unknown, deleteAttempts = 0, injected = false;
  vi.spyOn(bodyHelpers, 'copyBodyShape').mockImplementation(shape => {
    const candidate = copy(shape);
    try {
      const solids = candidate.solids; solids.forEach(solid => owners.own(solid));
      if (solids.length > 1) {
        injected = true;
        const handle = candidate.wrapped, rawDelete = handle.delete.bind(handle);
        Object.defineProperty(handle, 'delete', { configurable: true, value: () => { deleteAttempts++; rawDelete(); throw cleanup; } });
      }
      return candidate;
    } catch (error) {
      try { candidate.delete(); } catch (releaseError) { throw new AggregateError([error, releaseError], 'Observed candidate or release failed.', { cause: error }); }
      throw error;
    }
  });
  vi.spyOn(bodyHelpers, 'validateBodyShape').mockImplementation(shape => {
    try { return validate(shape); } catch (error) { geometryFailure = error; throw error; }
  });
  let caught: unknown;
  try { owners.evaluation(evaluateFeatureRecipes(setup)); } catch (error) { caught = error; }
  vi.restoreAllMocks();
  const includes = (error: unknown, expected: unknown, seen = new Set<unknown>()): boolean => {
    if (error === expected) return true;
    if (!error || typeof error !== 'object' || seen.has(error)) return false;
    seen.add(error);
    return (error instanceof AggregateError && error.errors.some(child => includes(child, expected, seen)))
      || (error instanceof Error && includes(error.cause, expected, seen));
  };
  expect(injected).toBe(true); expect(geometryFailure).toBeInstanceOf(Error);
  expect(caught).toBeInstanceOf(NativeCleanupError);
  expect((caught as NativeCleanupError).cause).toBe(geometryFailure);
  expect(includes(caught, cleanup)).toBe(true); expect(deleteAttempts).toBe(1);
  expectMetrics(setup.catalog.resolve(setup.request.targetSnapshot[0]).shape, 168, 244, [0, 0, 0], [14, 4, 4], owners);
  expect(() => setup.catalog.resolve({ bodyId: 'T', sourceFeatureId: 'recipe-pattern' })).toThrow();
}), 60_000);
