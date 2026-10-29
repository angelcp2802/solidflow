import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, Solid, type Shape3D } from 'replicad';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { parseDocument, serializeDocument, validateDocument } from '../model/document';
import { exactStateKey, extractRecipeClosure, type RecipeInstanceTransform, type RegenerationRequest } from '../model/featureRecipes';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { evaluateFeatureRecipes, stageFeatureRecipeEvaluation } from './kernel.feature-recipes';
import { withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import { buildRecipeInstanceTool } from './kernel.recipe-instance';
import { buildExplicitFramePrimitive, validatePrimitiveRecipeProfileForAbsence } from './kernel.recipe-primitives';
import { checkpointSourceSketchSolves, createSourceSketchSolveRegistry } from './kernel.sketch-solves';
import type { BodyReference, Feature, SketchFeature, ThinWallDefinition, Vec3 } from './kernel.types';

// Original synthetic component fixtures, in mm. Expected solids use Cartesian
// dimensions and circular-sector formulas, never the wall-preparation helper.
// Direct evaluator setup is not a complete saved-app or renderer acceptance.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => vi.restoreAllMocks());
const frame = { origin: [0, 0, 0] as Vec3, xDirection: [1, 0, 0] as Vec3, normal: [0, 0, 1] as Vec3 };
const source: BodyReference = { bodyId: 'S', sourceFeatureId: 'create-S' };
const target: BodyReference = { bodyId: 'T', sourceFeatureId: 'create-T' };
const postSource: BodyReference = { bodyId: 'S', sourceFeatureId: 'effect' };

function metrics(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3): void {
  withNativeOwners(owners => {
    validateBodyShape(shape);
    const solids = shape.solids; owners.ownAll(solids); expect(solids).toHaveLength(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(1e-6)));
  });
}
function probe(shape: Shape3D, center: Vec3, present: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
  });
}
function boxFeatures(ref: BodyReference, min: Vec3, max: Vec3): Feature[] {
  return [{ id: ref.sourceFeatureId + '-profile', name: 'Original owner profile', type: 'sketch', suppressed: false,
    plane: 'XY', offset: min[2], profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
      width: max[0] - min[0], height: max[1] - min[1] } },
  { id: ref.sourceFeatureId, name: 'Original owner prism', type: 'extrude', suppressed: false,
    sketchId: ref.sourceFeatureId + '-profile', depth: max[2] - min[2], symmetric: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId } }];
}
function declarations(profile: SketchFeature['profile'], thinWall: ThinWallDefinition,
  transform: RecipeInstanceTransform = { key: '1,0', translation: [20, 0, 0] },
  patternKind: RegenerationRequest['patternKind'] = 'linearPattern',
  min: Vec3 = [20, -10, 0], max: Vec3 = [40, 10, 8]) {
  const features: Feature[] = [...boxFeatures(source, [0, -10, 0], [20, 10, 4]),
    { id: 'effect-profile', name: 'Original wall source', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile },
    { id: 'effect', name: 'Original wall cut', type: 'cut', suppressed: false, sketchId: 'effect-profile',
      depth: 4, symmetric: false, thinWall, bodyScope: [source] }, ...boxFeatures(target, min, max)];
  const saved = parseDocument(serializeDocument(validateDocument({ version: 1, id: 'original-thin-recipe', name: 'Thin recipe', units: 'mm',
    features, createdAt: '2026-10-28T00:00:00.000Z', updatedAt: '2026-10-28T00:00:00.000Z' })));
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: 'pattern', patternKind,
    beforeFeatureIndex: saved.features.length, sourceFeatureIds: ['effect'], plan: { transforms: [transform], structure: [patternKind, transform] },
    scope: { mode: 'selected', targets: [target] }, targetSnapshot: [target], bindings: [{ source: postSource, targets: [target.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' } };
  return { features: saved.features, request };
}
function entitySource(features: Feature[], owners: NativeOwners) {
  const registry = createSourceSketchSolveRegistry(features, { planeFeatureIds: new Set(), solidFeatureIds: new Set(),
    unavailableFeatureIds: new Set(), planes: new Map(), historicalFaces: new Map() });
  owners.own({ delete: () => registry.revoke() });
  features.forEach((feature, index) => registry.observeFeature(feature, index));
  const sketch = features[2];
  if (sketch.type !== 'sketch') throw new Error('Original source sketch missing.');
  registry.solveAndStage(sketch, 2, () => {});
  return { registry: registry.reader, checkpoint: checkpointSourceSketchSolves(registry.reader, features, [sketch.id]), features };
}
function line(): SketchFeature['profile'] {
  return { kind: 'entities', points: [{ id: 'a', x: 5, y: 0 }, { id: 'b', x: 12, y: 0 }],
    entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }], constraints: [
      { id: 'fix-a', type: 'fix', pointId: 'a', x: 5, y: 0 }, { id: 'fix-b', type: 'fix', pointId: 'b', x: 15, y: 0 },
    ] };
}
function ownCatalog(value: NativeBodyCatalog, owners: NativeOwners): NativeBodyCatalog {
  owners.own({ delete: () => value.dispose() }); return value;
}
function catalog(inputs: { ref: BodyReference; shape: Shape3D; createdBy?: string }[], owners: NativeOwners): NativeBodyCatalog {
  let current = ownCatalog(new NativeBodyCatalog(), owners);
  for (const input of inputs) {
    const transaction = current.stageNew({ ref: input.ref, name: 'Original thin-wall owner', createdByFeatureId: input.createdBy ?? input.ref.sourceFeatureId,
      lineage: 'original-' + input.ref.bodyId }, input.shape);
    owners.own({ delete: () => transaction.dispose() });
    const next = transaction.commit(); owners.own(next.aggregate); current = ownCatalog(next.catalog, owners);
  }
  return current;
}

it.each([
  { thinWall: { kind: 'one-side', thickness: 1, reversed: false }, volume: 144, area: 360, min: [-6, -4, 0], max: [6, 4, 4] },
  { thinWall: { kind: 'one-side', thickness: 1, reversed: true }, volume: 112, area: 280, min: [-5, -3, 0], max: [5, 3, 4] },
  { thinWall: { kind: 'mid-plane', thickness: 2 }, volume: 256, area: 384, min: [-6, -4, 0], max: [6, 4, 4] },
  { thinWall: { kind: 'two-sides', firstThickness: 2, secondThickness: 1 }, volume: 432, area: 504, min: [-7, -5, 0], max: [7, 5, 4] },
] as const)('constructs a real rectangular band for $thinWall', row => withNativeOwners(owners => {
  const tool = owners.own(buildExplicitFramePrimitive({ profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 },
    thinWall: row.thinWall, frame, signedDepth: 4, termination: { kind: 'blind', symmetric: false }, operation: 'add', validateTool: validateBodyShape }));
  metrics(tool, row.volume, row.area, [...row.min], [...row.max]);
  probe(tool, [0, 0, 2], false);
}), 60_000);

const transforms = [
  { kind: 'linearPattern', transform: { key: '1,0', translation: [20, 0, 0] }, min: [20, 0, 0], max: [30, 10, 8], center: [25, 5] },
  { kind: 'circularPattern', transform: { key: '1', angle: 180, origin: [15, 0, 0], direction: [0, 0, 1] }, min: [20, -10, 0], max: [30, 0, 8], center: [25, -5] },
  { kind: 'mirror', transform: { key: 'mirror', mirror: { origin: [15, 0, 0], xDirection: [0, 1, 0], normal: [1, 0, 0] } }, min: [20, 0, 0], max: [30, 10, 8], center: [25, 5] },
] as const;
it.each(transforms)('regenerates an annular blind pocket on the current owner for $kind', row => withNativeOwners(owners => {
  const setup = declarations({ kind: 'circle', center: [5, 5], radius: 1 }, { kind: 'one-side', thickness: 1, reversed: false },
    structuredClone(row.transform) as RecipeInstanceTransform, row.kind, [...row.min], [...row.max]);
  const before = JSON.stringify(setup), owner = owners.own(makeBox([...row.min], [...row.max]));
  const result = buildRecipeInstanceTool({ closure: extractRecipeClosure(setup.features, setup.request), featureId: 'effect',
    address: row.transform.key, targetBodyId: target.bodyId, workingTarget: owner, validateTool: validateBodyShape });
  owners.own(result.tool);
  metrics(result.tool, 12 * Math.PI, 30 * Math.PI, [row.center[0] - 2, row.center[1] - 2, 0], [row.center[0] + 2, row.center[1] + 2, 4]);
  const cut = owners.own(bodyBoolean(result.operation, owner, result.tool));
  metrics(cut, 800 - 12 * Math.PI, 520 + 24 * Math.PI, [...row.min], [...row.max]);
  probe(cut, [row.center[0], row.center[1], 2], true);
  probe(cut, [row.center[0] + 1.5, row.center[1], 2], false);
  metrics(owner, 800, 520, [...row.min], [...row.max]); expect(JSON.stringify(setup)).toBe(before);
}), 60_000);

it('keeps the split-body rejection for an annular ThroughAll cut', () => withNativeOwners(owners => {
  const setup = declarations({ kind: 'circle', center: [5, 5], radius: 1 }, { kind: 'one-side', thickness: 1, reversed: false },
    { key: '1,0', translation: [20, 0, 0] }, 'linearPattern', [20, 0, 0], [30, 10, 8]);
  const effect = setup.features[3]; if (effect.type !== 'cut') throw new Error('Original cut missing.');
  effect.endCondition = { kind: 'throughAll', baseFeatureId: source.sourceFeatureId, bothDirections: false }; effect.depth = 1;
  const owner = owners.own(makeBox([20, 0, 0], [30, 10, 8]));
  const built = buildRecipeInstanceTool({ closure: extractRecipeClosure(setup.features, setup.request), featureId: 'effect', address: '1,0',
    targetBodyId: target.bodyId, workingTarget: owner, validateTool: validateBodyShape });
  owners.own(built.tool);
  metrics(built.tool, 27 * Math.PI, 60 * Math.PI, [23, 3, 0], [27, 7, 9]);
  const split = owners.own(bodyBoolean('subtract', owner, built.tool)), solids = split.solids; owners.ownAll(solids);
  expect(solids).toHaveLength(2);
  expect(() => validateBodyShape(split)).toThrow('exactamente un sólido');
  metrics(owner, 800, 520, [20, 0, 0], [30, 10, 8]);
}), 60_000);

it.each([
  { thinWall: { kind: 'one-side', thickness: 1, reversed: false }, low: -1, high: 0, width: 1 },
  { thinWall: { kind: 'mid-plane', thickness: 2 }, low: -1, high: 1, width: 2 },
  { thinWall: { kind: 'two-sides', firstThickness: 2, secondThickness: 1 }, low: -2, high: 1, width: 3 },
] as const)('uses the authentic solved open LINE with $thinWall', row => withNativeOwners(owners => {
  const setup = declarations(line(), row.thinWall), sourceSolve = entitySource(setup.features, owners);
  const owner = owners.own(makeBox([20, -10, 0], [40, 10, 8]));
  const built = buildRecipeInstanceTool({ closure: extractRecipeClosure(setup.features, setup.request), featureId: 'effect', address: '1,0',
    targetBodyId: target.bodyId, workingTarget: owner, entitySource: sourceSolve,
    assertWorkingCurrent: () => sourceSolve.registry.assertCheckpoint(sourceSolve.checkpoint, setup.features), validateTool: validateBodyShape });
  owners.own(built.tool);
  // Saved endpoint x12 solves to x15. A nominal-coordinate replay would have L7.
  metrics(built.tool, 40 * row.width, 80 + 28 * row.width, [25, row.low, 0], [35, row.high, 4]);
  const cut = owners.own(bodyBoolean('subtract', owner, built.tool));
  metrics(cut, 3200 - 40 * row.width, 1440 + (20 + 2 * row.width) * 4, [20, -10, 0], [40, 10, 8]);
}), 60_000);

it('regenerates a solved open ARC as a semicircular band without a filled-sector fallback', () => withNativeOwners(owners => {
  const profile: SketchFeature['profile'] = { kind: 'entities', points: [
    { id: 'c', x: 10, y: 0 }, { id: 'a', x: 12, y: 0 }, { id: 'b', x: 8, y: 0 },
  ], entities: [{ id: 'arc', type: 'arc', center: 'c', start: 'a', end: 'b', clockwise: false, construction: false }], constraints: [
    { id: 'fix-c', type: 'fix', pointId: 'c', x: 10, y: 0 }, { id: 'fix-a', type: 'fix', pointId: 'a', x: 15, y: 0 },
    { id: 'fix-b', type: 'fix', pointId: 'b', x: 5, y: 0 },
  ] };
  const setup = declarations(profile, { kind: 'mid-plane', thickness: 2 }), owner = owners.own(makeBox([20, -10, 0], [40, 10, 8]));
  const solve = entitySource(setup.features, owners);
  const built = buildRecipeInstanceTool({ closure: extractRecipeClosure(setup.features, setup.request), featureId: 'effect', address: '1,0',
    targetBodyId: target.bodyId, workingTarget: owner, entitySource: solve,
    assertWorkingCurrent: () => solve.registry.assertCheckpoint(solve.checkpoint, setup.features), validateTool: validateBodyShape });
  owners.own(built.tool);
  metrics(built.tool, 40 * Math.PI, 60 * Math.PI + 16, [24, 0, 0], [36, 6, 4]);
  const cut = owners.own(bodyBoolean('subtract', owner, built.tool));
  metrics(cut, 3200 - 40 * Math.PI, 1456 + 40 * Math.PI, [20, -10, 0], [40, 10, 8]);
  probe(cut, [30, 5, 2], false); probe(cut, [30, 3, 2], true);
}), 60_000);

it.each(['untilNext', 'upToSurface'] as const)('uses the same prepared open wall with %s termination', kind => withNativeOwners(owners => {
  const setup = declarations(line(), { kind: 'mid-plane', thickness: 2 });
  const effect = setup.features[3], profile = setup.features[2];
  if (effect.type !== 'cut' || profile.type !== 'sketch') throw new Error('Original wall source missing.');
  effect.depth = kind === 'untilNext' ? 1 : -1;
  if (kind === 'untilNext') effect.endCondition = { kind, baseFeatureId: source.sourceFeatureId };
  else {
    profile.offset = 3;
    effect.endCondition = { kind, target: { kind: 'principal', plane: 'XY' } };
    setup.request.referencePolicies = [{ featureId: 'effect', path: 'endCondition.target', placement: 'world' }];
  }
  const owner = owners.own(makeBox([20, -10, 0], [40, 10, 8])), solve = entitySource(setup.features, owners);
  const built = buildRecipeInstanceTool({ closure: extractRecipeClosure(setup.features, setup.request), featureId: 'effect', address: '1,0',
    targetBodyId: target.bodyId, workingTarget: owner, entitySource: solve,
    assertWorkingCurrent: () => solve.registry.assertCheckpoint(solve.checkpoint, setup.features), validateTool: validateBodyShape });
  owners.own(built.tool);
  const cut = owners.own(bodyBoolean('subtract', owner, built.tool));
  if (kind === 'untilNext') metrics(cut, 3040, 1592, [20, -10, 0], [40, 10, 8]);
  else {
    metrics(built.tool, 60, 112, [25, -1, 0], [35, 1, 3]);
    metrics(cut, 3140, 1512, [20, -10, 0], [40, 10, 8]);
  }
}), 60_000);

it('stages only the exact selected owner and rejects stale wall dimensions before publication', () => withNativeOwners(owners => {
  const setup = declarations(line(), { kind: 'mid-plane', thickness: 2 }), effect = setup.features[3];
  if (effect.type !== 'cut') throw new Error('Original cut missing.');
  effect.depth = 1; effect.endCondition = { kind: 'throughAll', baseFeatureId: source.sourceFeatureId, bothDirections: false };
  const sourceOwner = owners.own(makeBox([0, -10, 0], [20, 10, 4])), slot = owners.own(makeBox([5, -1, 0], [15, 1, 4]));
  const sourceShape = owners.own(bodyBoolean('subtract', sourceOwner, slot)), owner = owners.own(makeBox([20, -10, 0], [40, 10, 8]));
  const untouched = { bodyId: 'U', sourceFeatureId: 'create-U' };
  setup.features.push(...boxFeatures(untouched, [20, -10, 0], [40, 10, 8])); setup.request.beforeFeatureIndex = setup.features.length;
  const active = catalog([{ ref: postSource, shape: sourceShape, createdBy: source.sourceFeatureId },
    { ref: target, shape: owner }, { ref: untouched, shape: owner }], owners);
  const solve = entitySource(setup.features, owners);
  const input = { ...setup, catalog: active, sourceSketchSolves: solve.registry,
    historicalStates: new Map([[exactStateKey(postSource), { ref: postSource, shape: sourceShape, lineage: 'original-open-line-wall' }]]) };
  const evaluated = evaluateFeatureRecipes(input); owners.own({ delete: () => evaluated.dispose() });
  expect(evaluated.replacements.map(value => value.ref)).toEqual([target]);
  metrics(evaluated.replacements[0].shape, 3040, 1592, [20, -10, 0], [40, 10, 8]);
  const transaction = stageFeatureRecipeEvaluation(evaluated, active, { sourceFeatureId: 'pattern', lineage: 'original-thin-pattern' }, input);
  owners.own({ delete: () => transaction.dispose() }); const next = transaction.commit(); owners.own(next.aggregate); ownCatalog(next.catalog, owners);
  metrics(next.catalog.resolve({ bodyId: 'T', sourceFeatureId: 'pattern' }).shape, 3040, 1592, [20, -10, 0], [40, 10, 8]);
  metrics(next.catalog.resolve(untouched).shape, 3200, 1440, [20, -10, 0], [40, 10, 8]);
  metrics(active.resolve(target).shape, 3200, 1440, [20, -10, 0], [40, 10, 8]);
  const stale = evaluateFeatureRecipes(input); owners.own({ delete: () => stale.dispose() });
  effect.thinWall = { kind: 'mid-plane', thickness: 3 };
  expect(() => stageFeatureRecipeEvaluation(stale, active, { sourceFeatureId: 'pattern', lineage: 'stale' }, input)).toThrow('changed after native evaluation');
  metrics(active.resolve(target).shape, 3200, 1440, [20, -10, 0], [40, 10, 8]);
}), 60_000);

it('does not hide a collapsed inward primitive wall behind the ALL forward-ray shortcut', () => withNativeOwners(owners => {
  // Adversarial evaluator-component fixture: no claim that this invalid wall
  // could issue a healthy seed BRep through the application reconstruction.
  const setup = declarations({ kind: 'circle', center: [5, 5], radius: 1 }, { kind: 'one-side', thickness: 2, reversed: true },
    { key: '1,0', translation: [20, 0, 0] }, 'linearPattern', [20, 0, -10], [30, 10, -2]);
  const effect = setup.features[3]; if (effect.type !== 'cut') throw new Error('Original cut missing.');
  effect.endCondition = { kind: 'throughAll', baseFeatureId: source.sourceFeatureId, bothDirections: false };
  setup.request.scope = { mode: 'all', reevaluateAt: 'patternInput' }; setup.request.bindings[0].targets = 'scope';
  const sourceShape = owners.own(makeBox([0, -10, 0], [20, 10, 4])), owner = owners.own(makeBox([20, 0, -10], [30, 10, -2]));
  const active = catalog([{ ref: target, shape: owner }], owners);
  expect(() => evaluateFeatureRecipes({ ...setup, catalog: active,
    historicalStates: new Map([[exactStateKey(postSource), { ref: postSource, shape: sourceShape, lineage: 'adversarial-component-state' }]]) })).toThrow(/colapsa o invierte un radio/);
  metrics(active.resolve(target).shape, 800, 520, [20, 0, -10], [30, 10, -2]);
}), 60_000);

it.each(['entity', 'primitive'] as const)('keeps a valid ALL wall cut with an unchanged behind-ray owner for %s', kind => withNativeOwners(owners => {
  const profile: SketchFeature['profile'] = kind === 'entity' ? line()
    : { kind: 'rectangle', center: [-6, 0], width: 10, height: 6 };
  const thinWall: ThinWallDefinition = kind === 'entity' ? { kind: 'mid-plane', thickness: 2 }
    : { kind: 'one-side', thickness: 2, reversed: false };
  const setup = declarations(profile, thinWall), effect = setup.features[3];
  if (effect.type !== 'cut') throw new Error('Original wall operation missing.');
  effect.depth = 1; effect.endCondition = { kind: 'throughAll', baseFeatureId: source.sourceFeatureId, bothDirections: false };
  const behind: BodyReference = { bodyId: 'U', sourceFeatureId: 'create-U' };
  setup.features.push(...boxFeatures(behind, [20, -10, -10], [40, 10, -2]));
  setup.request.beforeFeatureIndex = setup.features.length;
  setup.request.scope = { mode: 'all', reevaluateAt: 'patternInput' };
  setup.request.targetSnapshot = [target, behind]; setup.request.bindings[0].targets = 'scope';
  const seed = owners.own(makeBox([0, -10, 0], [20, 10, 4]));
  // Independent seed notches: solved LINE x5..15,y−1..1; primitive wall
  // intersects only x0..1,y−5..5 of the owner and leaves no isolated island.
  const slot = owners.own(kind === 'entity' ? makeBox([5, -1, 0], [15, 1, 4]) : makeBox([0, -5, 0], [1, 5, 4]));
  const seedState = owners.own(bodyBoolean('subtract', seed, slot));
  const aheadOwner = owners.own(makeBox([20, -10, 0], [40, 10, 8]));
  const behindOwner = owners.own(makeBox([20, -10, -10], [40, 10, -2]));
  const active = catalog([{ ref: target, shape: aheadOwner }, { ref: behind, shape: behindOwner }], owners);
  const sourceSolve = kind === 'entity' ? entitySource(setup.features, owners) : undefined;
  const input = { ...setup, catalog: active, ...(sourceSolve ? { sourceSketchSolves: sourceSolve.registry } : {}),
    historicalStates: new Map([[exactStateKey(postSource), { ref: postSource, shape: seedState, lineage: `original-${kind}-thin-seed` }]]) };
  const evaluated = evaluateFeatureRecipes(input); owners.own({ delete: () => evaluated.dispose() });
  expect(evaluated.replacements.map(value => value.ref)).toEqual([target]);
  metrics(evaluated.replacements[0].shape, kind === 'entity' ? 3040 : 3120, kind === 'entity' ? 1592 : 1436,
    [20, -10, 0], [40, 10, 8]);
  expect(evaluated.attestation.virtualOutputs.find(output => output.targetBodyId === behind.bodyId)).toMatchObject({
    materialChanged: false, inputRevision: 0, outputRevision: 0,
  });
  const transaction = stageFeatureRecipeEvaluation(evaluated, active, { sourceFeatureId: 'pattern', lineage: 'original-ALL-thin' }, input);
  owners.own({ delete: () => transaction.dispose() });
  const committed = transaction.commit(); owners.own(committed.aggregate); ownCatalog(committed.catalog, owners);
  metrics(committed.catalog.resolve(behind).shape, 3200, 1440, [20, -10, -10], [40, 10, -2]);
  metrics(active.resolve(target).shape, 3200, 1440, [20, -10, 0], [40, 10, 8]);
  metrics(active.resolve(behind).shape, 3200, 1440, [20, -10, -10], [40, 10, -2]);
}), 60_000);

it('withholds primitive absence evidence when releasing its real wall witness fails', () => {
  let witness: Shape3D | undefined, releases = 0;
  const originalDelete = Solid.prototype.delete;
  vi.spyOn(Solid.prototype, 'delete').mockImplementation(function (this: Solid) {
    originalDelete.call(this);
    if (this === witness) { releases++; throw new Error('original-wall-witness-release'); }
  });
  expect(() => validatePrimitiveRecipeProfileForAbsence({
    profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 }, frame, signedDepth: 4,
    thinWall: { kind: 'one-side', thickness: 1, reversed: false }, assertWorkingCurrent: () => {},
    validateTool: (shape) => { witness = shape; validateBodyShape(shape); },
  })).toThrow(AggregateError);
  expect(releases).toBe(1);
});

it('rechecks working-owner currentness after the primitive wall witness has been released', () => {
  let witness: Shape3D | undefined, current = true, releases = 0;
  const originalDelete = Solid.prototype.delete;
  vi.spyOn(Solid.prototype, 'delete').mockImplementation(function (this: Solid) {
    originalDelete.call(this);
    if (this === witness) { releases++; current = false; }
  });
  expect(() => validatePrimitiveRecipeProfileForAbsence({
    profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 6 }, frame, signedDepth: 4,
    thinWall: { kind: 'one-side', thickness: 1, reversed: false },
    assertWorkingCurrent: () => { if (!current) throw new Error('original-owner-replaced-on-release'); },
    validateTool: (shape) => { witness = shape; validateBodyShape(shape); },
  })).toThrow('original-owner-replaced-on-release');
  expect(releases).toBe(1);
});
