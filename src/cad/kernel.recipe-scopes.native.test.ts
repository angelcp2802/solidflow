import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, getOC, makeBox, makeCylinder, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import type { BodyReference, Feature, Vec3 } from './kernel.types';
import { exactStateKey, extractRecipeClosure, RecipeClosureError, requireInitialRecipeDeclaration,
  type RegenerationRequest, type RecipeInstanceTransform } from '../model/featureRecipes';
import { bodyBoolean, copyBodyShape, NativeBodyCatalog, NativeBodyTransaction, validateBodyShape } from './kernel.bodies';
import * as bodyHelpers from './kernel.bodies';
import * as recipeBridge from './kernel.recipe-instance';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import { attestNativeRecipeScope, assertNativeRecipeScopeCurrent, resolveNativeRecipeScope } from './kernel.recipe-scopes';
import { evaluateFeatureRecipes, recipeEvaluationEventAffectedBodyIds, stageFeatureRecipeEvaluation,
  type NativeRecipeSourceState, type OwnedRecipeEvaluation } from './kernel.feature-recipes';

// Original analytical mm fixtures for a native ALL component. No saved ALL/AUTO
// grammar, UI interaction or external-application fidelity is asserted here.
// ALL positive applicability remains explicitly gated; selected additions stay real.
const metricTolerance = 1e-5, coordinateTolerance = 1e-6;
type Row = { kind: RegenerationRequest['patternKind']; transform: RecipeInstanceTransform; min: Vec3; max: Vec3; center: Vec3 };
const rows: Row[] = [
  { kind: 'linearPattern', transform: { key: '1,0', translation: [20, 0, 0] }, min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
  { kind: 'circularPattern', transform: { key: '1', angle: 180, origin: [15, 0, 0], direction: [0, 0, 1] }, min: [20, -10, 0], max: [30, 0, 8], center: [25, -5, 6] },
  { kind: 'mirror', transform: { key: 'mirror', mirror: { origin: [15, 0, 0], xDirection: [0, 1, 0], normal: [1, 0, 0] } },
    min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
];
class Fixtures {
  private readonly actions = new Map<object, () => void>();
  track<T extends object>(value: T, dispose: () => void): T { this.actions.set(value, dispose); return value; }
  own<T extends { delete(): void }>(value: T): T { return this.track(value, () => value.delete()); }
  catalog(value: NativeBodyCatalog): NativeBodyCatalog { return this.track(value, () => value.dispose()); }
  evaluation(value: OwnedRecipeEvaluation): OwnedRecipeEvaluation { return this.track(value, () => value.dispose()); }
  transaction(value: NativeBodyTransaction): NativeBodyTransaction { return this.track(value, () => value.dispose()); }
  dispose(): unknown[] {
    const errors: unknown[] = [];
    for (const [key, dispose] of [...this.actions].reverse()) {
      this.actions.delete(key); try { dispose(); } catch (error) { errors.push(error); }
    }
    return errors;
  }
}
function fixture(check: (owners: Fixtures) => void): void {
  const owners = new Fixtures(); let failed = false, primary: unknown;
  try { check(owners); } catch (error) { failed = true; primary = error; }
  vi.restoreAllMocks(); const errors = owners.dispose();
  if (errors.length) throw new AggregateError(failed ? [primary, ...errors] : errors,
    'Original native recipe-scope fixture or cleanup failed.', { cause: failed ? primary : errors[0] });
  if (failed) throw primary;
}
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

function box(owners: Fixtures, min: Vec3, max: Vec3): Shape3D { return owners.own(makeBox(min, max)); }
function boolean(owners: Fixtures, operation: 'add' | 'subtract', a: Shape3D, b: Shape3D): Shape3D {
  return owners.own(bodyBoolean(operation, a, b));
}
function rectangle(id: string, center: [number, number], width: number, height: number, offset = 0): Feature {
  return { id, type: 'sketch', name: id, suppressed: false, plane: 'XY', offset, profile: { kind: 'rectangle', center, width, height } };
}
function creation(id: string, bodyId: string, min: Vec3, max: Vec3): Feature[] {
  return [rectangle(id + '-profile', [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], max[0] - min[0], max[1] - min[1], min[2]),
    { id, type: 'extrude', name: id, suppressed: false, sketchId: id + '-profile', depth: max[2] - min[2], symmetric: false,
      bodyOperation: { mode: 'new', bodyId } }];
}
function state(ref: BodyReference, shape: Shape3D): NativeRecipeSourceState { return { ref, shape, lineage: 'original-history-' + ref.bodyId + '-' + ref.sourceFeatureId }; }
type Input = { ref: BodyReference; shape: Shape3D; creator?: string };
function catalog(owners: Fixtures, inputs: Input[]): NativeBodyCatalog {
  const empty = owners.catalog(new NativeBodyCatalog()), transaction = owners.transaction(empty.stageNewMany(inputs.map(input => ({
    metadata: { ref: input.ref, createdByFeatureId: input.creator ?? input.ref.sourceFeatureId, name: input.ref.bodyId,
      lineage: 'original-current-' + input.ref.bodyId + '-' + input.ref.sourceFeatureId }, shape: input.shape,
  }))));
  const next = transaction.commit(); owners.own(next.aggregate); return owners.catalog(next.catalog);
}
type Setup = { features: Feature[]; request: RegenerationRequest; catalog: NativeBodyCatalog; historicalStates: Map<string, NativeRecipeSourceState> };
function request(features: Feature[], sources: BodyReference[], targets: BodyReference[], row = rows[0]): RegenerationRequest {
  return { mode: 'regenerate', geometryPattern: false, patternId: 'all-recipe', patternKind: row.kind, beforeFeatureIndex: features.length,
    sourceFeatureIds: [...new Set(sources.map(ref => ref.sourceFeatureId))], plan: { transforms: [row.transform], structure: ['original-native-scope', row.kind, row.transform] },
    scope: { mode: 'all', reevaluateAt: 'patternInput' }, targetSnapshot: targets,
    bindings: sources.map(source => ({ source, targets: 'scope' })), referencePolicies: [], variation: { kind: 'none' } };
}
function snapshot(value: NativeBodyCatalog): BodyReference[] { return value.entries().map(entry => ({ ...entry.ref })); }
function commit(evaluated: OwnedRecipeEvaluation, setup: Setup, owners: Fixtures): NativeBodyCatalog {
  const transaction = owners.transaction(stageFeatureRecipeEvaluation(evaluated, setup.catalog,
    { sourceFeatureId: setup.request.patternId, lineage: 'original-native-scope-result' }, setup));
  const next = transaction.commit(); owners.own(next.aggregate); return owners.catalog(next.catalog);
}
function metrics(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3, owners: Fixtures): void {
  validateBodyShape(shape); const solids = shape.solids; solids.forEach(solid => owners.own(solid)); expect(solids).toHaveLength(1);
  expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(metricTolerance);
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(metricTolerance);
  const bounds = owners.own(shape.boundingBox).bounds;
  [min, max].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(coordinateTolerance)));
}
function probe(shape: Shape3D, center: Vec3, present: boolean, owners: Fixtures): void {
  const cube = box(owners, center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3);
  const common = owners.own(bodyBoolean('common', shape, cube));
  expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
}
const s: BodyReference = { bodyId: 'S', sourceFeatureId: 'seed-cut' };
const a: BodyReference = { bodyId: 'A', sourceFeatureId: 'create-a' }, b: BodyReference = { bodyId: 'B', sourceFeatureId: 'create-b' };
const c: BodyReference = { bodyId: 'C', sourceFeatureId: 'create-c' };
function cutFixture(owners: Fixtures, row = rows[0], updated = false): Setup {
  const source = boolean(owners, 'subtract', box(owners, [0, 0, 0], [10, 10, 4]), owners.own(makeCylinder(1, 4, [5, 5, 0], [0, 0, 1])));
  const features: Feature[] = [...creation('create-source', 'S', [0, 0, 0], [10, 10, 4]),
    { id: 'cut-profile', type: 'sketch', name: 'Original circle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [5, 5], radius: 1 } },
    { id: s.sourceFeatureId, type: 'cut', name: 'Original ThroughAll seed', suppressed: false, sketchId: 'cut-profile', depth: 1,
      symmetric: false, bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-source' }],
      endCondition: { kind: 'throughAll', baseFeatureId: 'create-source', bothDirections: false } },
    ...creation(a.sourceFeatureId, 'A', row.min, row.max), ...creation(b.sourceFeatureId, 'B', row.min, row.max),
    ...creation(c.sourceFeatureId, 'C', [50, 0, 0], [60, 10, 8])];
  const aRef = updated ? { bodyId: 'A', sourceFeatureId: 'extend-a' } : a;
  const inputs: Input[] = [{ ref: s, shape: source, creator: 'create-source' },
    { ref: aRef, creator: 'create-a', shape: box(owners, row.min, [row.max[0], row.max[1], updated ? 10 : 8]) },
    { ref: b, shape: box(owners, row.min, row.max) }, { ref: c, shape: box(owners, [50, 0, 0], [60, 10, 8]) }];
  if (updated) {
    features.push(rectangle('extend-a-profile', [(row.min[0] + row.max[0]) / 2, (row.min[1] + row.max[1]) / 2], 10, 10, 8),
      { id: 'extend-a', type: 'extrude', name: 'Original current-state extension', suppressed: false, sketchId: 'extend-a-profile',
        depth: 2, symmetric: false, bodyOperation: { mode: 'merge', target: a } },
      ...creation('create-d', 'D', row.min, [row.max[0], row.max[1], 12]));
    inputs.push({ ref: { bodyId: 'D', sourceFeatureId: 'create-d' }, shape: box(owners, row.min, [row.max[0], row.max[1], 12]) });
  }
  const current = catalog(owners, inputs);
  return { features, catalog: current, request: request(features, [s], snapshot(current), row), historicalStates: new Map([[exactStateKey(s), state(s, source)]]) };
}
function expectPreflightReject(setup: Setup, owners: Fixtures, pattern: RegExp): unknown {
  const copied = vi.spyOn(bodyHelpers, 'copyBodyShape'), built = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool');
  let caught: unknown;
  try { owners.evaluation(evaluateFeatureRecipes(setup)); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(Error); expect((caught as Error).message).toMatch(pattern);
  expect(copied).not.toHaveBeenCalled(); expect(built).not.toHaveBeenCalled(); vi.restoreAllMocks(); return caught;
}

it.each(rows)('regenerates a real ALL cut for every coincident owner using $kind', row => fixture(owners => {
  const setup = cutFixture(owners, row), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['A', 'B']);
  expect(recipeEvaluationEventAffectedBodyIds(evaluated)).toEqual(['A', 'B']);
  for (const replacement of evaluated.replacements) {
    metrics(replacement.shape, 800 - 8 * Math.PI, 520 + 14 * Math.PI, row.min, row.max, owners);
    probe(replacement.shape, row.center, false, owners);
  }
  const next = commit(evaluated, setup, owners);
  expect(next.entries()).toHaveLength(4);
  for (const original of [a, b]) {
    const entry = next.resolve({ bodyId: original.bodyId, sourceFeatureId: setup.request.patternId });
    expect(entry.createdByFeatureId).toBe(original.sourceFeatureId);
  }
  metrics(next.resolve(s).shape, 400 - 4 * Math.PI, 360 + 6 * Math.PI, [0, 0, 0], [10, 10, 4], owners);
  metrics(next.resolve(c).shape, 800, 520, [50, 0, 0], [60, 10, 8], owners); probe(next.resolve(c).shape, [55, 5, 6], true, owners);
  expect(() => next.resolve({ bodyId: 'C', sourceFeatureId: setup.request.patternId })).toThrow();
  expect(() => recipeEvaluationEventAffectedBodyIds(evaluated)).toThrow('genuine active ALL');
}), 60_000);

it.each(rows)('re-resolves complete ALL membership and the updated current state for $kind', row => fixture(owners => {
  const old = cutFixture(owners, row), oldProof = attestNativeRecipeScope(old.request.scope, old.request.targetSnapshot, old.catalog);
  const setup = cutFixture(owners, row, true);
  expect(() => assertNativeRecipeScopeCurrent(oldProof, setup.request.scope, setup.request.targetSnapshot, setup.catalog)).toThrow('another native catalog');
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['A', 'B', 'D']);
  for (const [id, height, area] of [['A', 10, 600], ['B', 8, 520], ['D', 12, 680]] as const) {
    const item = evaluated.replacements.find(value => value.ref.bodyId === id)!;
    metrics(item.shape, 100 * height - height * Math.PI, area + (2 * height - 2) * Math.PI,
      row.min, [row.max[0], row.max[1], height], owners); probe(item.shape, row.center, false, owners);
  }
  expect(evaluated.replacements.find(item => item.ref.bodyId === 'A')!.ref.sourceFeatureId).toBe('extend-a');
  const next = commit(evaluated, setup, owners); expect(next.entries()).toHaveLength(5);
  expect(next.resolve({ bodyId: 'A', sourceFeatureId: setup.request.patternId }).createdByFeatureId).toBe('create-a');
  expect(next.resolve(s).ref).toEqual(s); expect(next.resolve(c).ref).toEqual(c);
}), 60_000);

it('rejects a cropped ALL snapshot before any target copy or actual tool', () => fixture(owners => {
  const setup = cutFixture(owners); setup.request.targetSnapshot = setup.request.targetSnapshot.filter(ref => ref.bodyId !== 'B');
  expectPreflightReject(setup, owners, /complete current native membership/);
  metrics(setup.catalog.resolve(b).shape, 800, 520, rows[0].min, rows[0].max, owners);
}), 60_000);

it('rejects an extra structural owner absent from the actual ALL catalog before allocation', () => fixture(owners => {
  const setup = cutFixture(owners), q = { bodyId: 'Q', sourceFeatureId: 'create-q' };
  setup.features.push(...creation(q.sourceFeatureId, q.bodyId, [70, 0, 0], [80, 10, 8]));
  setup.request.beforeFeatureIndex = setup.features.length; setup.request.targetSnapshot.push(q);
  expectPreflightReject(setup, owners, /complete current native membership/);
  expect(setup.catalog.entries()).toHaveLength(4);
}), 60_000);

it('rejects stale exact snapshot refs rather than freezing an earlier ALL owner state', () => fixture(owners => {
  const setup = cutFixture(owners, rows[0], true);
  setup.request.targetSnapshot = setup.request.targetSnapshot.map(ref => ref.bodyId === 'A' ? a : ref);
  expectPreflightReject(setup, owners, /complete current native membership/);
  metrics(setup.catalog.resolve({ bodyId: 'A', sourceFeatureId: 'extend-a' }).shape, 1000, 600, [20, 0, 0], [30, 10, 10], owners);
}), 60_000);

it('rejects copied scope proofs and copied evaluation receipts without consuming the genuine proposal', () => fixture(owners => {
  const setup = cutFixture(owners), proof = attestNativeRecipeScope(setup.request.scope, setup.request.targetSnapshot, setup.catalog);
  expect(() => assertNativeRecipeScopeCurrent({ ...proof }, setup.request.scope, setup.request.targetSnapshot, setup.catalog)).toThrow('forged');
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  const forged: OwnedRecipeEvaluation = { ...evaluated };
  expect(() => stageFeatureRecipeEvaluation(forged, setup.catalog, { sourceFeatureId: setup.request.patternId, lineage: 'forged' }, setup)).toThrow('forged');
  expect(recipeEvaluationEventAffectedBodyIds(evaluated)).toEqual(['A', 'B']);
  expect(() => recipeEvaluationEventAffectedBodyIds(forged)).toThrow('genuine active ALL');
  expect(commit(evaluated, setup, owners).entries()).toHaveLength(4);
}), 60_000);

it('rejects native shape-identity drift and disposes both retained candidates once before staging', () => fixture(owners => {
  const setup = cutFixture(owners), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  const changed = owners.own(copyBodyShape(setup.catalog.resolve(c).shape)), originalEntries = setup.catalog.entries.bind(setup.catalog);
  const counts = [0, 0];
  evaluated.replacements.forEach((item, index) => {
    const handle = item.shape.wrapped, rawDelete = handle.delete.bind(handle);
    Object.defineProperty(handle, 'delete', { configurable: true, value: () => { counts[index]++; rawDelete(); } });
  });
  // Real native copy, same saved ref and lineage: only identity of the ALL no-op
  // owner's shape changes. No SDK/global prototype or private catalog field is patched.
  vi.spyOn(setup.catalog, 'entries').mockImplementation(() => originalEntries().map(entry => entry.ref.bodyId === 'C' ? { ...entry, shape: changed } : entry));
  const staged = vi.spyOn(setup.catalog, 'stageReplaceMany'); let caught: unknown;
  try { owners.transaction(stageFeatureRecipeEvaluation(evaluated, setup.catalog,
    { sourceFeatureId: setup.request.patternId, lineage: 'original-native-identity-drift' }, setup)); } catch (error) { caught = error; }
  const stagedCalls = staged.mock.calls.length;
  vi.restoreAllMocks();
  expect((caught as Error).message).toContain('membership or owner state changed'); expect(counts).toEqual([1, 1]);
  expect(stagedCalls).toBe(0);
  for (const ref of [a, b]) metrics(setup.catalog.resolve(ref).shape, 800, 520, rows[0].min, rows[0].max, owners);
}), 60_000);

it('evaluates more than 32 actual ALL owners without widening selected scope or dropping members', () => fixture(owners => {
  const original = cutFixture(owners), sourceShape = original.historicalStates.get(exactStateKey(s))!.shape!;
  const features: Feature[] = original.features.filter(feature => !['create-a', 'create-a-profile', 'create-b', 'create-b-profile'].includes(feature.id));
  const inputs: Input[] = [{ ref: s, shape: sourceShape, creator: 'create-source' }, { ref: c, shape: original.catalog.resolve(c).shape }];
  const ids = Array.from({ length: 33 }, (_, index) => 'many-' + index);
  for (const id of ids) {
    const ref = { bodyId: id, sourceFeatureId: 'create-' + id }; features.push(...creation(ref.sourceFeatureId, id, rows[0].min, rows[0].max));
    inputs.push({ ref, shape: box(owners, rows[0].min, rows[0].max) });
  }
  const current = catalog(owners, inputs), setup: Setup = { features, catalog: current,
    request: request(features, [s], snapshot(current)), historicalStates: original.historicalStates };
  expect(resolveNativeRecipeScope(setup.request.scope, current)).toHaveLength(35);
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup)); expect(evaluated.replacements.map(item => item.ref.bodyId).sort()).toEqual([...ids].sort());
  for (const item of evaluated.replacements) metrics(item.shape, 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max, owners);
  const next = commit(evaluated, setup, owners); expect(next.entries()).toHaveLength(35);
  for (const id of ids) expect(next.resolve({ bodyId: id, sourceFeatureId: setup.request.patternId }).ref.bodyId).toBe(id);
  expect(next.resolve(s).ref).toEqual(s); expect(next.resolve(c).ref).toEqual(c);
  const selected = structuredClone(setup.request); selected.scope = { mode: 'selected', targets: selected.targetSnapshot };
  selected.bindings[0].targets = selected.targetSnapshot.map(ref => ref.bodyId);
  let failure: unknown; try { extractRecipeClosure(features, selected); } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(RecipeClosureError);
  expect((failure as RecipeClosureError).diagnostics.map(item => item.code)).toContain('TARGET_COUNT');
}), 60_000);

it('accepts a 512-route declaration and rejects 513 applications before native copies or tools', () => fixture(owners => {
  const original = cutFixture(owners), features: Feature[] = original.features.filter(feature => !['create-a', 'create-a-profile', 'create-b', 'create-b-profile', 'create-c', 'create-c-profile'].includes(feature.id));
  const sourceShape = original.historicalStates.get(exactStateKey(s))!.shape!, inputs: Input[] = [{ ref: s, shape: sourceShape, creator: 'create-source' }];
  for (let index = 0; index < 31; index++) {
    const id = 'budget-' + index, ref = { bodyId: id, sourceFeatureId: 'create-' + id };
    features.push(...creation(ref.sourceFeatureId, id, rows[0].min, rows[0].max)); inputs.push({ ref, shape: box(owners, rows[0].min, rows[0].max) });
  }
  const current = catalog(owners, inputs), within = request(features, [s], snapshot(current));
  within.plan.transforms = Array.from({ length: 16 }, (_, index) => ({ key: `${index + 1},0`, translation: [20 * (index + 1), 0, 0] as Vec3 }));
  within.plan.structure = ['original-budget512', within.plan.transforms];
  const closure = requireInitialRecipeDeclaration(extractRecipeClosure(features, within));
  expect(closure.operations[0].applications.length * closure.request.plan.transforms.length).toBe(512);
  expect(attestNativeRecipeScope(within.scope, within.targetSnapshot, current).targets).toHaveLength(32);
  // This positive boundary checks declaration/native membership, not 512 Booleans.
  const three = cutFixture(owners); three.catalog = catalog(owners, [
    { ref: s, shape: three.historicalStates.get(exactStateKey(s))!.shape!, creator: 'create-source' },
    { ref: a, shape: three.catalog.resolve(a).shape }, { ref: b, shape: three.catalog.resolve(b).shape }]);
  three.features = three.features.filter(feature => !['create-c', 'create-c-profile'].includes(feature.id));
  three.request.beforeFeatureIndex = three.features.length;
  three.request.targetSnapshot = snapshot(three.catalog);
  three.request.plan.transforms = Array.from({ length: 171 }, (_, index) => ({ key: `${index + 1},0`, translation: [20 * (index + 1), 0, 0] as Vec3 }));
  three.request.plan.structure = ['original-budget513', three.request.plan.transforms];
  const failure = expectPreflightReject(three, owners, /exceed512/);
  expect(failure).toBeInstanceOf(RecipeClosureError);
  expect((failure as RecipeClosureError).diagnostics.map(item => item.code)).toContain('APPLICATION_BUDGET');
}), 60_000);

for (const fatal of [false, true]) it('rejects an exact historical capture error before target copies or tools, fatal=' + fatal, () => fixture(owners => {
  const setup = cutFixture(owners), primary = new Error('Original historical source capture failure'); let sourceFailure: unknown = primary;
  if (fatal) {
    try { withNativeOwners(scope => {
      const shape = scope.own(makeBox([0, 0, 0], [1, 1, 1])), handle = shape.wrapped, rawDelete = handle.delete.bind(handle);
      Object.defineProperty(handle, 'delete', { configurable: true, value: () => { rawDelete(); throw primary; } });
    }); } catch (error) { sourceFailure = error; }
    expect(sourceFailure).toBeInstanceOf(NativeCleanupError);
  }
  setup.historicalStates.set(exactStateKey(s), { ref: s, lineage: 'failed-exact-history', error: sourceFailure });
  const copied = vi.spyOn(bodyHelpers, 'copyBodyShape'), built = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool'); let caught: unknown;
  try { owners.evaluation(evaluateFeatureRecipes(setup)); } catch (error) { caught = error; }
  expect(copied).not.toHaveBeenCalled(); expect(built).not.toHaveBeenCalled(); vi.restoreAllMocks();
  if (fatal) expect(caught).toBe(sourceFailure);
  else { expect(caught).toBeInstanceOf(Error); expect((caught as Error).cause).toBe(primary); }
  for (const ref of [a, b]) metrics(setup.catalog.resolve(ref).shape, 800, 520, rows[0].min, rows[0].max, owners);
}), 60_000);

it('preserves a real selected cut while an independent coincident owner stays outside scope', () => fixture(owners => {
  const setup = cutFixture(owners); setup.request.scope = { mode: 'selected', targets: [a] }; setup.request.targetSnapshot = [a]; setup.request.bindings[0].targets = ['A'];
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup)); expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['A']);
  expect(() => recipeEvaluationEventAffectedBodyIds(evaluated)).toThrow('genuine active ALL');
  const next = commit(evaluated, setup, owners);
  metrics(next.resolve({ bodyId: 'A', sourceFeatureId: setup.request.patternId }).shape, 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max, owners);
  metrics(next.resolve(b).shape, 800, 520, rows[0].min, rows[0].max, owners); probe(next.resolve(b).shape, rows[0].center, true, owners);
}), 60_000);

function positiveFixture(owners: Fixtures): Setup {
  const ref = { bodyId: 'S', sourceFeatureId: 'boss' }, source = boolean(owners, 'add', box(owners, [0, 0, 0], [10, 10, 4]), box(owners, [4, 4, 4], [6, 6, 6]));
  const features: Feature[] = [...creation('create-source', 'S', [0, 0, 0], [10, 10, 4]), rectangle('boss-profile', [5, 5], 2, 2, 4),
    { id: ref.sourceFeatureId, type: 'extrude', name: 'Original merge boss', suppressed: false, sketchId: 'boss-profile', depth: 2, symmetric: false,
      bodyOperation: { mode: 'merge', target: { bodyId: 'S', sourceFeatureId: 'create-source' } } },
    ...creation('create-a', 'A', [20, 0, 0], [30, 10, 4]), ...creation('create-c', 'C', [50, 0, 0], [60, 10, 4])];
  const current = catalog(owners, [{ ref, shape: source, creator: 'create-source' }, { ref: a, shape: box(owners, [20, 0, 0], [30, 10, 4]) },
    { ref: c, shape: box(owners, [50, 0, 0], [60, 10, 4]) }]);
  return { features, catalog: current, request: request(features, [ref], snapshot(current)), historicalStates: new Map([[exactStateKey(ref), state(ref, source)]]) };
}
it('diagnoses pending ALL positive applicability before tools while retaining selected positive construction', () => fixture(owners => {
  const setup = positiveFixture(owners), failure = expectPreflightReject(setup, owners, /positive|applicab|ALL/i);
  expect(failure).toBeInstanceOf(RecipeClosureError);
  expect((failure as RecipeClosureError).diagnostics.map(item => item.code)).toContain('ALL_POSITIVE_SCOPE_PENDING');
  setup.request.scope = { mode: 'selected', targets: [a] }; setup.request.targetSnapshot = [a]; setup.request.bindings[0].targets = ['A'];
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  metrics(evaluated.replacements[0].shape, 408, 376, [20, 0, 0], [30, 10, 6], owners);
  const next = commit(evaluated, setup, owners); metrics(next.resolve(c).shape, 400, 360, [50, 0, 0], [60, 10, 4], owners);
}), 60_000);

function cancellationFixture(owners: Fixtures): Setup {
  const r = { bodyId: 'S', sourceFeatureId: 'remove' }, f = { bodyId: 'S', sourceFeatureId: 'fill' };
  const sourceBase = box(owners, [-20, 0, 0], [-10, 10, 4]), removed = box(owners, [-19, 1, 0], [-17, 3, 4]);
  const sourceR = boolean(owners, 'subtract', sourceBase, removed), sourceF = boolean(owners, 'add', sourceR, removed);
  const features: Feature[] = [...creation('create-source', 'S', [-20, 0, 0], [-10, 10, 4]), rectangle('remove-profile', [-18, 2], 2, 2),
    { id: r.sourceFeatureId, type: 'cut', name: 'Original removal', suppressed: false, sketchId: 'remove-profile', depth: 4, symmetric: false,
      bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-source' }] }, rectangle('fill-profile', [-18, 2], 2, 2),
    { id: f.sourceFeatureId, type: 'extrude', name: 'Original fill', suppressed: false, sketchId: 'fill-profile', depth: 4, symmetric: false,
      bodyOperation: { mode: 'merge', target: r } },
    ...creation('create-link', 'link', [-10, 0, 0], [0, 10, 4]), ...creation('create-input', 'input', [0, 0, 0], [10, 10, 4]),
    { id: 'combine-a', type: 'combine', name: 'Original consumed historical source', suppressed: false, operation: 'add',
      operands: [f, { bodyId: 'link', sourceFeatureId: 'create-link' }, { bodyId: 'input', sourceFeatureId: 'create-input' }], resultBodyId: 'A', keepTools: false },
    ...creation('create-b', 'B', [0, 0, 0], [10, 10, 4]), rectangle('pocket-profile', [2, 2], 2, 2),
    { id: 'pocket-b', type: 'cut', name: 'Original bottom pocket', suppressed: false, sketchId: 'pocket-profile', depth: 2, symmetric: false, bodyScope: [b] }];
  const aRef = { bodyId: 'A', sourceFeatureId: 'combine-a' }, bRef = { bodyId: 'B', sourceFeatureId: 'pocket-b' };
  const aShape = box(owners, [-20, 0, 0], [10, 10, 4]), bShape = boolean(owners, 'subtract', box(owners, [0, 0, 0], [10, 10, 4]), box(owners, [1, 1, 0], [3, 3, 2]));
  const current = catalog(owners, [{ ref: aRef, shape: aShape }, { ref: bRef, shape: bShape, creator: 'create-b' }]);
  const value = request(features, [f, r], snapshot(current)); value.scope = { mode: 'selected', targets: snapshot(current) };
  value.bindings = value.bindings.map(binding => ({ ...binding, targets: ['A', 'B'] }));
  return { features, request: value, catalog: current, historicalStates: new Map([[exactStateKey(r), state(r, sourceR)], [exactStateKey(f), state(f, sourceF)]]) };
}
it('retains real selected R-to-F event effects separately from finally changed owners', () => fixture(owners => {
  const setup = cancellationFixture(owners), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['B']);
  expect(evaluated.attestation.virtualOutputs.map(output => [output.sourcePoststate.sourceFeatureId, output.targetBodyId, output.materialChanged]))
    .toEqual([['remove', 'A', true], ['remove', 'B', true], ['fill', 'A', true], ['fill', 'B', true]]);
  metrics(evaluated.replacements[0].shape, 400, 360, [0, 0, 0], [10, 10, 4], owners);
  expect(() => recipeEvaluationEventAffectedBodyIds(evaluated)).toThrow('genuine active ALL');
  const next = commit(evaluated, setup, owners);
  metrics(next.resolve({ bodyId: 'A', sourceFeatureId: 'combine-a' }).shape, 1200, 920, [-20, 0, 0], [10, 10, 4], owners);
  metrics(next.resolve({ bodyId: 'B', sourceFeatureId: setup.request.patternId }).shape, 400, 360, [0, 0, 0], [10, 10, 4], owners);
  probe(next.resolve({ bodyId: 'B', sourceFeatureId: setup.request.patternId }).shape, [2, 2, 1], true, owners);
  expect(() => next.resolve({ bodyId: 'A', sourceFeatureId: setup.request.patternId })).toThrow();
}), 60_000);


// Original ALL forward-material regressions. Bounds prove absence only after
// the complete native inventory and current owners have been validated.
const behindRows: (Row & { behindMin: Vec3; behindMax: Vec3; name: string })[] = [
  { ...rows[0], name: 'translated +Z ray', behindMin: [20, 0, -10], behindMax: [30, 10, -2] },
  { kind: 'circularPattern', name: 'quarter-turn +X ray',
    transform: { key: '1', angle: 90, origin: [15, 0, 0], direction: [0, 1, 0] },
    min: [15, 0, 5], max: [23, 10, 15], center: [19, 5, 10], behindMin: [5, 0, 5], behindMax: [13, 10, 15] },
  { kind: 'mirror', name: 'offset reflected -Z ray',
    transform: { key: 'mirror', mirror: { origin: [0, 0, 10], xDirection: [1, 0, 0], normal: [0, 0, 1] } },
    min: [0, 0, 12], max: [10, 10, 20], center: [5, 5, 16], behindMin: [0, 0, 22], behindMax: [10, 10, 30] },
];
function behindFixture(owners: Fixtures, row = behindRows[0]): Setup {
  const setup = cutFixture(owners), replacements = new Map([
    ...creation('create-a', 'A', row.min, row.max), ...creation('create-b', 'B', row.behindMin, row.behindMax),
  ].map(feature => [feature.id, feature]));
  setup.features = setup.features.map(feature => replacements.get(feature.id) ?? feature);
  setup.catalog = catalog(owners, setup.catalog.entries().map(entry => ({ ref: { ...entry.ref }, creator: entry.createdByFeatureId,
    shape: entry.ref.bodyId === 'A' ? box(owners, row.min, row.max)
      : entry.ref.bodyId === 'B' ? box(owners, row.behindMin, row.behindMax) : entry.shape })));
  setup.request = request(setup.features, [s], snapshot(setup.catalog), row);
  return setup;
}
it.each(behindRows)('retains a genuine behind-plane ALL owner and same-address no-op role for $name', row => fixture(owners => {
  const setup = behindFixture(owners, row), beforeB = setup.catalog.resolve(b), built = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool');
  const evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['A']);
  expect(evaluated.attestation.targets.map(item => item.ref.bodyId).sort()).toEqual(['A', 'B', 'C', 'S']);
  expect(evaluated.attestation.virtualOutputs.filter(output => output.targetBodyId === 'B')).toEqual([
    { sourcePoststate: s, targetBodyId: 'B', address: row.transform.key, role: 'body', inputRevision: 0, outputRevision: 0, materialChanged: false }]);
  expect(built.mock.calls.some(([input]) => input.targetBodyId === 'B')).toBe(false);
  expect(recipeEvaluationEventAffectedBodyIds(evaluated)).toEqual(['A']);
  metrics(evaluated.replacements[0].shape, 800 - 8 * Math.PI, 520 + 14 * Math.PI, row.min, row.max, owners);
  probe(evaluated.replacements[0].shape, row.center, false, owners);
  const next = commit(evaluated, setup, owners), afterB = next.resolve(b);
  expect(afterB.ref).toEqual(beforeB.ref); expect(afterB.createdByFeatureId).toBe(beforeB.createdByFeatureId);
  expect(afterB.name).toBe(beforeB.name); expect(afterB.lineage).toBe(beforeB.lineage);
  metrics(afterB.shape, 800, 520, row.behindMin, row.behindMax, owners);
  expect(() => next.resolve({ bodyId: 'B', sourceFeatureId: setup.request.patternId })).toThrow();
  metrics(setup.catalog.resolve(b).shape, 800, 520, row.behindMin, row.behindMax, owners);
}), 60_000);

it('keeps bilateral ThroughAll on the original native route and cuts the behind-plane owner', () => fixture(owners => {
  const setup = behindFixture(owners), seed = setup.features.find(feature => feature.id === s.sourceFeatureId);
  if (seed?.type !== 'cut' || seed.endCondition?.kind !== 'throughAll') throw new Error('Original ThroughAll seed missing.');
  seed.endCondition.bothDirections = true;
  const built = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool'), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['A', 'B']);
  expect(built.mock.calls.some(([input]) => input.targetBodyId === 'B')).toBe(true);
  metrics(evaluated.replacements.find(item => item.ref.bodyId === 'B')!.shape, 800 - 8 * Math.PI, 520 + 14 * Math.PI,
    behindRows[0].behindMin, behindRows[0].behindMax, owners);
  probe(evaluated.replacements.find(item => item.ref.bodyId === 'B')!.shape, [25, 5, -6], false, owners);
}), 60_000);

it('preserves selected-scope unilateral rejection for the same behind-plane owner', () => fixture(owners => {
  const setup = behindFixture(owners); setup.request.scope = { mode: 'selected', targets: [b] };
  setup.request.targetSnapshot = [b]; setup.request.bindings[0].targets = ['B'];
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow('No hay material en el sentido de extrusión elegido.');
  metrics(setup.catalog.resolve(b).shape, 800, 520, behindRows[0].behindMin, behindRows[0].behindMax, owners);
}), 60_000);

it('still rejects shape-identity drift of the classified no-op owner before staging', () => fixture(owners => {
  const setup = behindFixture(owners), evaluated = owners.evaluation(evaluateFeatureRecipes(setup));
  const changed = owners.own(copyBodyShape(setup.catalog.resolve(b).shape)), originalEntries = setup.catalog.entries.bind(setup.catalog);
  const candidate = evaluated.replacements[0].shape, handle = candidate.wrapped, rawDelete = handle.delete.bind(handle), deleted = vi.fn(() => rawDelete());
  Object.defineProperty(handle, 'delete', { configurable: true, value: deleted });
  vi.spyOn(setup.catalog, 'entries').mockImplementation(() => originalEntries().map(entry => entry.ref.bodyId === 'B' ? { ...entry, shape: changed } : entry));
  const staged = vi.spyOn(setup.catalog, 'stageReplaceMany');
  expect(() => owners.transaction(stageFeatureRecipeEvaluation(evaluated, setup.catalog,
    { sourceFeatureId: setup.request.patternId, lineage: 'original-behind-owner-stale' }, setup))).toThrow('membership or owner state changed');
  expect(staged).not.toHaveBeenCalled(); expect(deleted).toHaveBeenCalledTimes(1); vi.restoreAllMocks();
  metrics(setup.catalog.resolve(a).shape, 800, 520, rows[0].min, rows[0].max, owners);
  metrics(setup.catalog.resolve(b).shape, 800, 520, behindRows[0].behindMin, behindRows[0].behindMax, owners);
}), 60_000);

it('keeps complete no-op ALL rejection when the only in-profile owner is behind the ray', () => fixture(owners => {
  const setup = behindFixture(owners);
  setup.features = setup.features.filter(feature => !['create-a', 'create-a-profile'].includes(feature.id));
  setup.catalog = catalog(owners, setup.catalog.entries().filter(entry => entry.ref.bodyId !== 'A').map(entry => ({
    ref: { ...entry.ref }, creator: entry.createdByFeatureId, shape: entry.shape })));
  setup.request = request(setup.features, [s], snapshot(setup.catalog));
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow('changes no material');
  metrics(setup.catalog.resolve(b).shape, 800, 520, behindRows[0].behindMin, behindRows[0].behindMax, owners);
}), 60_000);

it.each([
  { profile: { kind: 'circle' as const, center: [5, 5] as [number, number], radius: 0 }, message: /Circle radius/ },
  { profile: { kind: 'rectangle' as const, center: [5, 5] as [number, number], width: 0, height: 2 }, message: /Rectangle width/ },
  { profile: { kind: 'circle' as const, center: [1_000_001, 5] as [number, number], radius: 1 }, message: /Primitive profile center/ },
])('does not hide invalid intrinsic parameters behind an ALL no-op: $message', ({ profile, message }) => fixture(owners => {
  const setup = behindFixture(owners), sketch = setup.features.find(feature => feature.id === 'cut-profile');
  if (sketch?.type !== 'sketch') throw new Error('Original cut profile missing.');
  // Deliberately invalid evaluator input. Native historical geometry remains real
  // and borrowed; these records do not claim a successful malformed source build.
  sketch.profile = profile;
  setup.catalog = catalog(owners, [{ ref: b, shape: setup.catalog.resolve(b).shape, creator: 'create-b' }]);
  setup.request = request(setup.features, [s], snapshot(setup.catalog));
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow(message);
  metrics(setup.catalog.resolve(b).shape, 800, 520, behindRows[0].behindMin, behindRows[0].behindMax, owners);
}), 60_000);

it('keeps the original native rejection for a bounding box in the unilateral tolerance band', () => fixture(owners => {
  const setup = behindFixture(owners), near = { ref: b, shape: box(owners, [20, 0, -8], [30, 10, .0000005]), creator: 'create-b' };
  const replacements = new Map(creation('create-b', 'B', [20, 0, -8], [30, 10, .0000005]).map(feature => [feature.id, feature]));
  setup.features = setup.features.map(feature => replacements.get(feature.id) ?? feature);
  setup.catalog = catalog(owners, [near]); setup.request = request(setup.features, [s], snapshot(setup.catalog));
  expect(() => owners.evaluation(evaluateFeatureRecipes(setup))).toThrow('No hay material en el sentido de extrusión elegido.');
  expect(setup.catalog.resolve(b).ref).toEqual(b);
}), 60_000);

it('includes the real native subshape tolerance in a conservative original box envelope', () => fixture(owners => {
  const shape = box(owners, [0, 0, 0], [2, 3, 4]), oc = getOC();
  const tolerance = Math.max(...(['VERTEX', 'EDGE', 'FACE'] as const).map(kind =>
    oc.BRep_Tool.MaxTolerance(shape.wrapped, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`])));
  expect(Number.isFinite(tolerance) && tolerance > 0).toBe(true);
  const bounds = owners.own(bodyHelpers.createConservativeBodyBounds(shape));
  const low = owners.own(bounds.CornerMin()), high = owners.own(bounds.CornerMax());
  expect(low.Z()).toBeLessThan(-tolerance * .5); expect(high.Z()).toBeGreaterThan(4 + tolerance * .5);
  // These inequalities distinguish tolerance inclusion from an exact-only
  // envelope; no artificially elevated tolerance or general setter is assumed.
}), 60_000);

it('globally encloses a real high-tolerance nested vertex even when exact geometry is behind', () => fixture(owners => {
  const original = box(owners, [20, 0, -8.0002], [30, 10, -.0002]), oc = getOC();
  const serialized = oc.BRepToolsWrapper.Write(original.wrapped); expect(serialized).toContain('CASCADE Topology V3');
  const rows = serialized.split('\n'), edited = [...rows], fields = rows.flatMap((row, index) => row === 'Ve' ? [index + 1] : []);
  expect(fields).toHaveLength(8);
  for (const index of fields) { expect(Number(rows[index])).toBe(1e-7); edited[index] = '0.001'; }
  const restored = [...edited]; for (const index of fields) restored[index] = rows[index];
  expect(restored.join('\n')).toBe(serialized); // only original vertex-tolerance fields changed
  const raw = owners.own(oc.BRepToolsWrapper.Read(edited.join('\n'))), elevated = owners.own(cast(raw)).asShape3D();
  metrics(elevated, 800, 520, [20, 0, -8.0002], [30, 10, -.0002], owners);
  expect(Math.abs(oc.BRep_Tool.MaxTolerance(elevated.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX) - .001)).toBeLessThan(1e-15);
  const geometry = owners.own(new oc.Bnd_Box()); oc.BRepBndLib.AddOptimal(elevated.wrapped, geometry, false, false);
  const gLow = owners.own(geometry.CornerMin()), gHigh = owners.own(geometry.CornerMax()); expect(gHigh.Z()).toBeLessThan(0);
  const conservative = owners.own(bodyHelpers.createConservativeBodyBounds(elevated));
  const low = owners.own(conservative.CornerMin()), high = owners.own(conservative.CornerMax()); expect(high.Z()).toBeGreaterThan(0);
  const lowerExpansion = [gLow.X() - low.X(), gLow.Y() - low.Y(), gLow.Z() - low.Z()],
    upperExpansion = [high.X() - gHigh.X(), high.Y() - gHigh.Y(), high.Z() - gHigh.Z()];
  for (const expansion of [...lowerExpansion, ...upperExpansion]) expect(expansion).toBeGreaterThanOrEqual(.001 - 1e-9);
}), 60_000);

it.each(['query', 'release'] as const)('propagates the behind-owner absence-proof bounds %s failure before publication', fault => fixture(owners => {
  const setup = behindFixture(owners), originalCopy = bodyHelpers.copyBodyShape,
    originalBounds = bodyHelpers.createConservativeBodyBounds, primary = new Error('Original absence-proof bounds ' + fault);
  const borrowedB = setup.catalog.resolve(b).shape;
  let behindCopies = 0, currentB: Shape3D | undefined, injected = false, releases = 0;
  vi.spyOn(bodyHelpers, 'copyBodyShape').mockImplementation(shape => {
    const candidate = originalCopy(shape);
    // Capture the actual second detached B copy, not a caller-created box or
    // a global SDK prototype. The first is the initial comparison snapshot.
    if (shape === borrowedB && ++behindCopies === 2) currentB = candidate;
    return candidate;
  });
  vi.spyOn(bodyHelpers, 'createConservativeBodyBounds').mockImplementation(shape => {
    const box = originalBounds(shape), rawDelete = box.delete.bind(box);
    try {
      if (shape === currentB) {
        injected = true;
        if (fault === 'query') Object.defineProperty(box, 'CornerMin', { configurable: true, value: () => { throw primary; } });
        Object.defineProperty(box, 'delete', { configurable: true, value: () => {
          releases++; rawDelete(); if (fault === 'release') throw primary;
        } });
      }
      return box;
    } catch (error) {
      try { rawDelete(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Observed native bounds release failed.', { cause: error }); }
      throw error;
    }
  });
  let caught: unknown; try { owners.evaluation(evaluateFeatureRecipes(setup)); } catch (error) { caught = error; }
  vi.restoreAllMocks(); expect(injected).toBe(true); expect(releases).toBe(1);
  if (fault === 'query') expect(caught).toBe(primary);
  else { expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as NativeCleanupError).cause).toBe(primary); }
  metrics(setup.catalog.resolve(a).shape, 800, 520, rows[0].min, rows[0].max, owners);
  metrics(setup.catalog.resolve(b).shape, 800, 520, behindRows[0].behindMin, behindRows[0].behindMax, owners);
  expect(() => setup.catalog.resolve({ bodyId: 'A', sourceFeatureId: setup.request.patternId })).toThrow();
}), 60_000);
