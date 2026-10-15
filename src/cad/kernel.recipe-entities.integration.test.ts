import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, getOC, makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature,
  validateDocument, type Document } from '../model/document';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import type { BodyReference, Feature, RepetitionFeature, SketchFeature, Vec3 } from './kernel.types';
import type { EntityProfile } from '../sketch/types';
import { NativeCleanupError, withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import { patternPlan } from './kernel.patterns';
import { exactStateKey, extractRecipeClosure, intrinsicProfileInstancePlacement, requireInitialRecipeDeclaration,
  transformedExtrusionFrame, type RegenerationRequest } from '../model/featureRecipes';
import { evaluateFeatureRecipes, stageFeatureRecipeEvaluation } from './kernel.feature-recipes';
import { createSourceSketchSolveRegistry, type SourceSketchSupportContext } from './kernel.sketch-solves';
import * as bodies from './kernel.bodies';
import * as profiles from './kernel.profiles';
import * as entities from './kernel.recipe-entities';
import * as recipeBridge from './kernel.recipe-instance';
import { validatePositiveClosedTool } from './kernel.closed-tools';

// Original analytical mm fixtures. These tests invoke the saved parser and real
// engine/generator/solve/BRep path. No reference application or private models.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const S: BodyReference = { bodyId: 'S', sourceFeatureId: 'seed' };
const A: BodyReference = { bodyId: 'A', sourceFeatureId: 'create-A' };
const B: BodyReference = { bodyId: 'B', sourceFeatureId: 'create-B' };
const output = (bodyId = 'A'): BodyReference => ({ bodyId, sourceFeatureId: 'pattern' });
const V = 1e-5, X = 1e-6;
function usingEngine(run: (engine: CadEngine, owners: NativeOwners) => void): void {
  withNativeOwners(owners => { const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() }); run(engine, owners); });
}
function catalog(engine: CadEngine): NativeBodyCatalog {
  const actual = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!actual) throw new Error('Original fixture requires its active native catalog.'); return actual;
}
function metrics(engine: CadEngine, ref: BodyReference, volume: number, area: number, min: Vec3, max: Vec3): void {
  withNativeOwners(owners => {
    const shape = catalog(engine).resolve(ref).shape; validateBodyShape(shape);
    const solids = shape.solids; owners.ownAll(solids); expect(solids).toHaveLength(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(V);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(V);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(X)));
  });
}
function probe(engine: CadEngine, ref: BodyReference, center: Vec3, present: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', catalog(engine).resolve(ref).shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
  });
}
function box(id: string, bodyId: string, min: Vec3, max: Vec3): Feature[] {
  return [{ id: id + '-sketch', name: 'Original analytical owner', type: 'sketch', suppressed: false,
    plane: 'XY', offset: min[2], profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
      width: max[0] - min[0], height: max[1] - min[1] } },
  { id, name: 'Original owner prism', type: 'extrude', suppressed: false, sketchId: id + '-sketch',
    depth: max[2] - min[2], symmetric: false, bodyOperation: { mode: 'new', bodyId } }];
}
function dProfile(radius = 2): EntityProfile {
  const points = [{ id: 'a', x: 2, y: 5 - radius }, { id: 'b', x: 6, y: 5 - radius },
    { id: 'c', x: 6, y: 5 }, { id: 'd', x: 6, y: 5 + radius }, { id: 'e', x: 2, y: 5 + radius }];
  return { kind: 'entities', points, entities: [
    { id: 'bottom', type: 'line', start: 'a', end: 'b', construction: false },
    { id: 'round', type: 'arc', center: 'c', start: 'b', end: 'd', clockwise: false, construction: false },
    { id: 'top', type: 'line', start: 'd', end: 'e', construction: false },
    { id: 'left', type: 'line', start: 'e', end: 'a', construction: false }],
  constraints: [...points.map(point => ({ id: 'fix-' + point.id, type: 'fix' as const, pointId: point.id, x: point.x, y: point.y })),
    { id: 'measured-arc', type: 'radius', entityId: 'round', value: 999, driven: true }] };
}
function solvedCircle(underdefined = false): EntityProfile {
  return { kind: 'entities', points: [{ id: 'c', x: 5, y: 5 }],
    entities: [{ id: 'circle', type: 'circle', center: 'c', radius: 1, construction: false }],
    constraints: [...(underdefined ? [] : [{ id: 'center', type: 'fix' as const, pointId: 'c', x: 5, y: 5 }]),
      { id: 'driving-radius', type: 'radius', entityId: 'circle', value: 2 },
      { id: 'measured-radius', type: 'radius', entityId: 'circle', value: 999, driven: true }] };
}
function circles(annulus: boolean): EntityProfile {
  const points = annulus ? [{ id: 'c', x: 5, y: 5 }] : [{ id: 'c', x: 3, y: 5 }, { id: 'd', x: 7, y: 5 }];
  return { kind: 'entities', points,
    entities: annulus ? [{ id: 'outer', type: 'circle', center: 'c', radius: 2, construction: false },
      { id: 'inner', type: 'circle', center: 'c', radius: 1, construction: false }]
      : points.map(point => ({ id: point.id + '-circle', type: 'circle' as const, center: point.id, radius: 1, construction: false })),
    constraints: points.map(point => ({ id: 'fix-' + point.id, type: 'fix' as const, pointId: point.id, x: point.x, y: point.y })) };
}
const rows = [
  { kind: 'linearPattern' as const, min: [20, 0, 0] as Vec3, max: [30, 10, 8] as Vec3, cut: [27.5, 5, 6] as Vec3 },
  { kind: 'circularPattern' as const, min: [20, -10, 0] as Vec3, max: [30, 0, 8] as Vec3, cut: [22.5, -5, 6] as Vec3 },
  { kind: 'mirror' as const, min: [20, 0, 0] as Vec3, max: [30, 10, 8] as Vec3, cut: [22.5, 5, 6] as Vec3 },
];
function pattern(kind: RepetitionFeature['type'], baseFeatureId = 'create-A', targets: BodyReference[] = [A]): RepetitionFeature {
  const common = { id: 'pattern', name: 'Original entity regeneration', suppressed: false, baseFeatureId,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: ['seed'] },
    featurePattern: { mode: 'regenerate' as const, scope: 'selected' as const, targets,
      bindings: [{ source: S, targetBodyIds: targets.map(ref => ref.bodyId) }], referencePolicies: [], variation: { kind: 'none' as const } } };
  if (kind === 'linearPattern') return { ...common, type: kind, first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [] };
  if (kind === 'circularPattern') return { ...common, type: kind, axis: { origin: [15, 0, 0], direction: [0, 0, 1] },
    count: 2, angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  return { ...common, type: 'mirror', support: { kind: 'plane', planeId: 'mirror-x15' }, mergeBodies: false };
}
function document(features: Feature[]): Document { return validateDocument({ ...createDocument('Original entity recipe'), features }); }
function prefix(row = rows[0], profile = dProfile(), coincident = false): Document {
  const features: Feature[] = [...box('create-S', 'S', [0, 0, 0], [10, 10, 4]),
    { id: 'entity-sketch', name: 'Original solved profile', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile },
    { id: 'seed', name: 'Original source ThroughAll', type: 'cut', suppressed: false, sketchId: 'entity-sketch',
      depth: 1, symmetric: false, bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-S' }],
      endCondition: { kind: 'throughAll', baseFeatureId: 'create-S', bothDirections: false } },
    ...box('create-A', 'A', row.min, row.max)];
  if (coincident) features.push(...box('create-B', 'B', row.min, row.max));
  if (row.kind === 'mirror') features.push({ id: 'mirror-x15', name: 'Original X15 mirror datum', type: 'plane', suppressed: false,
    support: { kind: 'principal', plane: 'YZ' }, offset: 15, reversed: false });
  return document(features);
}
function build(engine: CadEngine, value: Document): void {
  const saved = serializeDocument(value), result = engine.build(value.features);
  expect(result.featureErrors).toEqual([]); expect(result.bodyCatalogActive).toBe(true); expect(serializeDocument(value)).toBe(saved);
}
for (const row of rows) it('regenerates an asymmetric line/arc D with actual ' + row.kind + ' plan and current eight-mm target', () => usingEngine(engine => {
  const before = prefix(row), operation = pattern(row.kind), saved = parseDocument(serializeDocument(addFeature(before, operation)));
  const realSolve = vi.spyOn(profiles, 'solveEntityProfileResult');
  try {
    build(engine, saved); expect(realSolve).toHaveBeenCalledTimes(1);
    expect(Math.abs(realSolve.mock.results[0].value.drivenValues['measured-arc'] - 2)).toBeLessThanOrEqual(1e-7);
    metrics(engine, S, 336 - 8 * Math.PI, 376 + 4 * Math.PI, [0, 0, 0], [10, 10, 4]);
    metrics(engine, output(), 672 - 16 * Math.PI, 584 + 12 * Math.PI, row.min, row.max);
    probe(engine, output(), row.cut, false); probe(engine, output(), [21, row.min[1] + 1, 6], true);
    // Expected Cartesian axes are independent; transform is the real generator.
    const transform = patternPlan(operation, row.kind === 'mirror'
      ? { origin: [15, 0, 0], xDirection: [0, 1, 0], normal: [1, 0, 0] } : undefined).transforms[0];
    const mapped = transformedExtrusionFrame({ origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] }, 1, transform);
    if (row.kind === 'mirror') { expect(mapped.parity).toBe(-1); expect(mapped.signedDepth).toBe(-1); expect(mapped.frame.normal).toEqual([0, 0, -1]); expect(mapped.frame.xDirection).toEqual([-1, 0, 0]); expect(mapped.ray).toEqual([0, 0, 1]); }
  } finally { realSolve.mockRestore(); }
}), 60_000);

for (const underdefined of [false, true]) it('uses real driving r2 rather than saved r1 and retains ' + (underdefined ? 'underdefined DOF' : 'fully defined status'), () => usingEngine(engine => {
  const value = addFeature(prefix(rows[0], solvedCircle(underdefined)), pattern('linearPattern'));
  const realSolve = vi.spyOn(profiles, 'solveEntityProfileResult');
  try {
    build(engine, parseDocument(serializeDocument(value))); expect(realSolve).toHaveBeenCalledTimes(1);
    const result = realSolve.mock.results[0].value;
    expect(result.status).toBe(underdefined ? 'underdefined' : 'fullyDefined'); expect(result.degreesOfFreedom).toBe(underdefined ? 2 : 0);
    expect(Math.abs(result.drivenValues['measured-radius'] - 2)).toBeLessThanOrEqual(1e-7);
    const circle = result.profile.entities[0]; if (circle.type !== 'circle') throw new Error('Original circle is missing.');
    expect(Math.abs(circle.radius - 2)).toBeLessThanOrEqual(1e-7);
    metrics(engine, S, 400 - 16 * Math.PI, 360 + 8 * Math.PI, [0, 0, 0], [10, 10, 4]);
    metrics(engine, output(), 800 - 32 * Math.PI, 520 + 24 * Math.PI, [20, 0, 0], [30, 10, 8]);
    probe(engine, output(), [26.5, 5, 6], false); probe(engine, output(), [28, 5, 6], true);
  } finally { realSolve.mockRestore(); }
}), 60_000);

it('rebuilds edited arc geometry through save/reopen, undo and redo', () => usingEngine(engine => {
  const initial = parseDocument(serializeDocument(addFeature(prefix(), pattern('linearPattern')))), history = new DocumentHistory(initial);
  build(engine, initial); const sketch = initial.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
  history.apply(updateFeature(initial, sketch.id, { ...sketch, profile: dProfile(1) }));
  build(engine, parseDocument(serializeDocument(history.current)));
  metrics(engine, output(), 736 - 4 * Math.PI, 584 + 7 * Math.PI, [20, 0, 0], [30, 10, 8]);
  probe(engine, output(), [27.5, 5, 6], true); probe(engine, output(), [26.5, 5, 6], false);
  build(engine, history.undo()); metrics(engine, output(), 672 - 16 * Math.PI, 584 + 12 * Math.PI, [20, 0, 0], [30, 10, 8]);
  build(engine, parseDocument(serializeDocument(history.redo())));
  metrics(engine, output(), 736 - 4 * Math.PI, 584 + 7 * Math.PI, [20, 0, 0], [30, 10, 8]);
}), 60_000);

for (const annulus of [true, false]) it('merges a real ' + (annulus ? 'annular hole' : 'two-region compound') + ' tool into one selected solid', () => usingEngine(engine => {
  // A new fixture declares its seed as a boss from the start. Editing an
  // existing cut into an extrusion is forbidden by the saved document API.
  const value = document([...box('create-S', 'S', [0, 0, 0], [10, 10, 4]),
    { id: 'entity-sketch', name: 'Original selected boss profile', type: 'sketch', suppressed: false,
      plane: 'XY', offset: 4, profile: circles(annulus) },
    { id: 'seed', name: 'Original selected entity boss', type: 'extrude', suppressed: false,
      sketchId: 'entity-sketch', depth: 2, symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: 'S', sourceFeatureId: 'create-S' } } },
    ...box('create-A', 'A', [20, 0, 0], [30, 10, 8])]);
  const operation = pattern('linearPattern'); if (operation.type !== 'linearPattern') throw new Error('Original linear pattern missing.');
  operation.first = { direction: [20, 0, 4], spacing: Math.sqrt(416), count: 2 };
  build(engine, parseDocument(serializeDocument(addFeature(value, operation))));
  metrics(engine, output(), 800 + (annulus ? 6 : 4) * Math.PI, 520 + (annulus ? 12 : 8) * Math.PI, [20, 0, 0], [30, 10, 10]);
  probe(engine, output(), annulus ? [26.5, 5, 9] : [23, 5, 9], true);
  probe(engine, output(), [25, 5, 9], false); probe(engine, output(), [25, 5, 7], true);
}), 60_000);

it('keeps coincident target owners distinct', () => usingEngine(engine => {
  build(engine, addFeature(prefix(rows[0], dProfile(), true), pattern('linearPattern', 'create-B')));
  metrics(engine, output(), 672 - 16 * Math.PI, 584 + 12 * Math.PI, [20, 0, 0], [30, 10, 8]);
  metrics(engine, B, 800, 520, [20, 0, 0], [30, 10, 8]); expect(() => catalog(engine).resolve(output('B'))).toThrow();
}), 60_000);

it('publishes no earlier address when a later address changes no owner', () => usingEngine(engine => {
  const operation = pattern('linearPattern'); if (operation.type !== 'linearPattern') throw new Error('Original linear pattern missing.');
  operation.first.count = 3;
  const result = engine.build(addFeature(prefix(), operation).features);
  expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']); expect(result.featureErrors[0].message).toContain('changes no material');
  metrics(engine, A, 800, 520, [20, 0, 0], [30, 10, 8]); expect(() => catalog(engine).resolve(output())).toThrow();
}), 60_000);

it('rejects a source edit after capture before constructing the instance profile', () => usingEngine(engine => {
  const value = addFeature(prefix(rows[0], solvedCircle()), pattern('linearPattern'));
  const original = entities.buildEntityRecipeTool, native = vi.spyOn(profiles, 'entityProfileSolid');
  const intercept = vi.spyOn(entities, 'buildEntityRecipeTool').mockImplementation(input => {
    const sketch = input.source.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
    if (sketch.profile.kind !== 'entities') throw new Error('Original entity source missing.');
    const constraint = sketch.profile.constraints.find(item => item.id === 'driving-radius');
    if (!constraint || constraint.type !== 'radius') throw new Error('Original driving radius missing.');
    constraint.value = 3;
    return original(input);
  });
  try {
    const result = engine.build(value.features); expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']);
    expect(intercept).toHaveBeenCalledTimes(1); expect(native).toHaveBeenCalledTimes(1); // source only, no instance construction
    metrics(engine, A, 800, 520, [20, 0, 0], [30, 10, 8]); expect(() => catalog(engine).resolve(output())).toThrow();
  } finally { intercept.mockRestore(); native.mockRestore(); }
}), 60_000);

it('regenerates entity cuts through ALL without saving its current owner inventory', () => usingEngine(engine => {
  const operation = pattern('linearPattern', 'create-B');
  operation.featurePattern = { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput',
    bindings: [{ source: S, targetBodyIds: 'scope' }], referencePolicies: [], variation: { kind: 'none' } };
  const saved = parseDocument(serializeDocument(addFeature(prefix(rows[0], dProfile(), true), operation)));
  build(engine, saved);
  for (const id of ['A', 'B']) metrics(engine, output(id), 672 - 16 * Math.PI, 584 + 12 * Math.PI, [20, 0, 0], [30, 10, 8]);
  const reopenedPattern = saved.features.at(-1) as RepetitionFeature;
  expect(reopenedPattern.featurePattern).toEqual(operation.featurePattern);
}), 60_000);

function directEvaluation(engine: CadEngine, value: Document, operation: RepetitionFeature) {
  build(engine, value);
  const context: SourceSketchSupportContext = { planeFeatureIds: new Set(), solidFeatureIds: new Set(),
    unavailableFeatureIds: new Set(), planes: new Map(), historicalFaces: new Map() };
  const actual = createSourceSketchSolveRegistry(value.features, context);
  value.features.forEach((feature, index) => actual.observeFeature(feature, index));
  const sketch = value.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
  actual.solveAndStage(sketch, value.features.indexOf(sketch), () => {});
  const source = catalog(engine).resolve(S);
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: operation.id, patternKind: operation.type,
    beforeFeatureIndex: value.features.length, sourceFeatureIds: ['seed'], plan: patternPlan(operation),
    scope: { mode: 'selected', targets: [A] }, targetSnapshot: [A], bindings: [{ source: S, targets: ['A'] }], referencePolicies: [], variation: { kind: 'none' } };
  return { actual, input: { features: value.features, request, catalog: catalog(engine),
    historicalStates: new Map([[exactStateKey(S), { ref: S, lineage: source.lineage, shape: source.shape }]]), sourceSketchSolves: actual.reader } };
}
it('rejects missing or forged real-solve readers before the first native target clone', () => usingEngine(engine => {
  const setup = directEvaluation(engine, prefix(), pattern('linearPattern')), clone = vi.spyOn(bodies, 'copyBodyShape');
  try {
    expect(() => evaluateFeatureRecipes({ ...setup.input, sourceSketchSolves: undefined })).toThrow('real-solve registry');
    expect(() => evaluateFeatureRecipes({ ...setup.input, sourceSketchSolves: { ...setup.actual.reader } })).toThrow('not issued');
    expect(clone).not.toHaveBeenCalled(); metrics(engine, A, 800, 520, [20, 0, 0], [30, 10, 8]);
  } finally { clone.mockRestore(); setup.actual.revoke(); }
}), 60_000);

it('binds fresh tools to actual successive working revisions and rechecks source state at staging', () => usingEngine(engine => {
  const value = prefix(), target = value.features.find(feature => feature.id === 'create-A-sketch') as SketchFeature;
  const wide = updateFeature(value, target.id, { ...target, profile: { kind: 'rectangle', center: [35, 5], width: 30, height: 10 } });
  const operation = pattern('linearPattern'); if (operation.type !== 'linearPattern') throw new Error('Original pattern missing.'); operation.first.count = 3;
  const setup = directEvaluation(engine, wide, operation);
  let evaluated: ReturnType<typeof evaluateFeatureRecipes> | undefined;
  try {
    evaluated = evaluateFeatureRecipes(setup.input);
    expect(evaluated.attestation.virtualOutputs.map(item => [item.address, item.inputRevision, item.outputRevision])).toEqual([['1,0', 0, 1], ['2,0', 1, 2]]);
    withNativeOwners(owners => {
      const shape = evaluated!.replacements[0].shape; validateBodyShape(shape);
      expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - (2144 - 32 * Math.PI))).toBeLessThan(V);
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - (1368 + 24 * Math.PI))).toBeLessThan(V);
    });
    const sketch = setup.input.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
    if (sketch.profile.kind !== 'entities') throw new Error('Original profile missing.'); sketch.profile = dProfile(1);
    expect(() => stageFeatureRecipeEvaluation(evaluated!, setup.input.catalog, { sourceFeatureId: 'pattern', lineage: 'original-stage-stale' }, setup.input)).toThrow('changed');
    metrics(engine, A, 2400, 1240, [20, 0, 0], [50, 10, 8]); expect(() => catalog(engine).resolve(output())).toThrow();
  } finally { evaluated?.dispose(); setup.actual.revoke(); }
}), 60_000);

it('uses a fixed world principal plane for the actual entity instance extent', () => usingEngine(engine => {
  const before = prefix(), sketch = before.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
  const seed = before.features.find(feature => feature.id === 'seed'); if (seed?.type !== 'cut') throw new Error('Original cut missing.');
  let value = updateFeature(before, sketch.id, { ...sketch, offset: 4 });
  value = updateFeature(value, seed.id, { ...seed, depth: -1, endCondition: { kind: 'upToSurface', target: { kind: 'principal', plane: 'XY' } } });
  const operation = pattern('linearPattern'); if (operation.type !== 'linearPattern' || operation.featurePattern?.mode !== 'regenerate') throw new Error('Original pattern missing.');
  operation.first = { direction: [20, 0, 4], spacing: Math.sqrt(416), count: 2 };
  operation.featurePattern.referencePolicies = [{ featureId: 'seed', path: 'endCondition.target', placement: 'world' }];
  build(engine, parseDocument(serializeDocument(addFeature(value, operation))));
  metrics(engine, output(), 672 - 16 * Math.PI, 584 + 12 * Math.PI, [20, 0, 0], [30, 10, 8]);
  probe(engine, output(), [27.5, 5, 1], false); probe(engine, output(), [21, 1, 1], true);
}), 60_000);

it('keeps symmetric blind depth and resolved sketch offset separate', () => usingEngine(engine => {
  const before = prefix(), sketch = before.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
  const seed = before.features.find(feature => feature.id === 'seed'); if (seed?.type !== 'cut') throw new Error('Original cut missing.');
  let value = updateFeature(before, sketch.id, { ...sketch, offset: 2 });
  const { endCondition: _ending, ...blind } = seed;
  value = updateFeature(value, seed.id, { ...blind, endCondition: undefined, depth: 2, symmetric: true });
  const operation = pattern('linearPattern'); if (operation.type !== 'linearPattern') throw new Error('Original pattern missing.');
  operation.first = { direction: [20, 0, 2], spacing: Math.sqrt(404), count: 2 };
  const saved = parseDocument(serializeDocument(addFeature(value, operation)));
  const savedSeed = saved.features.find(feature => feature.id === 'seed');
  if (savedSeed?.type !== 'cut') throw new Error('Original mid-plane cut missing.');
  expect(Object.hasOwn(savedSeed, 'endCondition')).toBe(false); expect(savedSeed.symmetric).toBe(true); expect(savedSeed.depth).toBe(2);
  build(engine, saved);
  metrics(engine, output(), 768 - 4 * Math.PI, 576 + 8 * Math.PI, [20, 0, 0], [30, 10, 8]);
  probe(engine, output(), [27.5, 5, 4], false); probe(engine, output(), [27.5, 5, 2], true); probe(engine, output(), [27.5, 5, 6], true);
}), 60_000);

it('rebuilds both-direction ThroughAll from the current owner around the mapped interior plane', () => usingEngine(engine => {
  const before = prefix(), sketch = before.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
  const seed = before.features.find(feature => feature.id === 'seed'); if (seed?.type !== 'cut') throw new Error('Original cut missing.');
  let value = updateFeature(before, sketch.id, { ...sketch, offset: 2 });
  value = updateFeature(value, seed.id, { ...seed, endCondition: { kind: 'throughAll', baseFeatureId: 'create-S', bothDirections: true } });
  const operation = pattern('linearPattern'); if (operation.type !== 'linearPattern') throw new Error('Original pattern missing.');
  operation.first = { direction: [20, 0, 2], spacing: Math.sqrt(404), count: 2 };
  build(engine, parseDocument(serializeDocument(addFeature(value, operation))));
  metrics(engine, output(), 672 - 16 * Math.PI, 584 + 12 * Math.PI, [20, 0, 0], [30, 10, 8]);
  probe(engine, output(), [27.5, 5, 1], false); probe(engine, output(), [27.5, 5, 7], false);
}), 60_000);

it('evaluates selected additive ThroughAll at actual current cavity exits', () => usingEngine(engine => {
  const features: Feature[] = [];
  for (const [id, minX, height, start, depth] of [['S', 0, 4, 1, 2], ['A', 20, 8, 2, 4]] as const) {
    features.push(...box('create-' + id, id, [minX, 0, 0], [minX + 10, 10, height]),
      { id: 'cavity-sketch-' + id, type: 'sketch', name: 'Original enclosed cavity', suppressed: false, plane: 'XY', offset: start,
        profile: { kind: 'rectangle', center: [minX + 5, 5], width: 8, height: 8 } },
      { id: 'cavity-' + id, type: 'cut', name: 'Original cavity cut', suppressed: false, sketchId: 'cavity-sketch-' + id, depth,
        symmetric: false, bodyScope: [{ bodyId: id, sourceFeatureId: 'create-' + id }] });
  }
  const profile = solvedCircle(); profile.entities[0] = { id: 'circle', type: 'circle', center: 'c', radius: 1, construction: false };
  const radius = profile.constraints.find(item => item.id === 'driving-radius'); if (radius?.type !== 'radius') throw new Error('Original radius missing.'); radius.value = 1;
  // Source must precede the target producer in real history.
  const seed: Feature[] = [{ id: 'entity-sketch', type: 'sketch', name: 'Original cavity-fill circle', suppressed: false, plane: 'XY', offset: 0, profile },
    { id: 'seed', type: 'extrude', name: 'Original cavity-fill boss', suppressed: false, sketchId: 'entity-sketch', depth: 1, symmetric: false,
      bodyOperation: { mode: 'merge', target: { bodyId: 'S', sourceFeatureId: 'cavity-S' } },
      endCondition: { kind: 'throughAll', baseFeatureId: 'cavity-S', bothDirections: false } }];
  const value = document([...features.slice(0, 4), ...seed, ...features.slice(4)]);
  const operation = pattern('linearPattern', 'cavity-A', [{ bodyId: 'A', sourceFeatureId: 'cavity-A' }]);
  build(engine, parseDocument(serializeDocument(addFeature(value, operation))));
  metrics(engine, S, 272 + 2 * Math.PI, 552 + 2 * Math.PI, [0, 0, 0], [10, 10, 4]);
  metrics(engine, output(), 544 + 4 * Math.PI, 776 + 6 * Math.PI, [20, 0, 0], [30, 10, 8]);
  probe(engine, output(), [25, 5, 4], true); probe(engine, output(), [27, 5, 4], false);
}), 60_000);

// Original V5 composition fixtures. The current-owner box and authentic solved
// profile are independent evidence; a healthy solve alone never proves material.
type BehindRow = { name: string; kind: RepetitionFeature['type']; min: Vec3; max: Vec3;
  behindMin: Vec3; behindMax: Vec3; cut: Vec3; offset: number; depth: number };
const entityBehindRows: BehindRow[] = [
  { name: 'linear +Z', kind: 'linearPattern', min: [20, 0, 0], max: [30, 10, 8],
    behindMin: [20, 0, -10], behindMax: [30, 10, -2], cut: [25, 5, 6], offset: 0, depth: 1 },
  { name: 'Y90 +X', kind: 'circularPattern', min: [15, 0, 5], max: [23, 10, 15],
    behindMin: [5, 0, 5], behindMax: [13, 10, 15], cut: [19, 5, 10], offset: 0, depth: 1 },
  { name: 'mirror Z10 -Z', kind: 'mirror', min: [0, 0, 12], max: [10, 10, 20],
    behindMin: [0, 0, 22], behindMax: [10, 10, 30], cut: [5, 5, 16], offset: 0, depth: 1 },
  { name: 'offset4 translated4 -Z', kind: 'linearPattern', min: [20, 0, 0], max: [30, 10, 8],
    behindMin: [20, 0, 10], behindMax: [30, 10, 18], cut: [25, 5, 4], offset: 4, depth: -1 },
];
function entityBehind(row = entityBehindRows[0], profile = solvedCircle(), bothDirections = false) {
  const features: Feature[] = [...box('create-S', 'S', [0, 0, 0], [10, 10, 4]),
    { id: 'entity-sketch', name: 'Original behind-ray solved profile', type: 'sketch', suppressed: false,
      plane: 'XY', offset: row.offset, profile },
    { id: 'seed', name: 'Original directional cut', type: 'cut', suppressed: false, sketchId: 'entity-sketch',
      depth: row.depth, symmetric: false, bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-S' }],
      endCondition: { kind: 'throughAll', baseFeatureId: 'create-S', bothDirections } },
    ...box('create-A', 'A', row.min, row.max), ...box('create-B', 'B', row.behindMin, row.behindMax)];
  if (row.kind === 'mirror') features.push({ id: 'mirror-z10', name: 'Original Z10 datum', type: 'plane', suppressed: false,
    support: { kind: 'principal', plane: 'XY' }, offset: 10, reversed: false });
  const operation = pattern(row.kind, 'create-B');
  operation.featurePattern = { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput',
    bindings: [{ source: S, targetBodyIds: 'scope' }], referencePolicies: [], variation: { kind: 'none' } };
  if (operation.type === 'circularPattern') { operation.axis = { origin: [15, 0, 0], direction: [0, 1, 0] }; operation.angle = 90; }
  else if (operation.type === 'mirror') operation.support = { kind: 'plane', planeId: 'mirror-z10' };
  else if (row.offset) operation.first = { direction: [20, 0, 4], spacing: Math.sqrt(416), count: 2 };
  return { value: document(features), operation };
}
function directAll(engine: CadEngine, value: Document, operation: RepetitionFeature) {
  const setup = directEvaluation(engine, value, operation);
  setup.input.request.scope = { mode: 'all', reevaluateAt: 'patternInput' };
  setup.input.request.targetSnapshot = setup.input.catalog.entries().map(entry => ({ ...entry.ref }));
  setup.input.request.bindings[0].targets = 'scope';
  return setup;
}
for (const row of entityBehindRows) it('keeps genuine behind-ray entity owners with real r2 for ' + row.name, () => usingEngine(engine => {
  const { value, operation } = entityBehind(row), saved = parseDocument(serializeDocument(addFeature(value, operation)));
  const solve = vi.spyOn(profiles, 'solveEntityProfileResult'), witness = vi.spyOn(entities, 'validateEntityRecipeProfileForAbsence');
  const native = vi.spyOn(profiles, 'entityProfileSolid');
  try {
    build(engine, saved); expect(solve).toHaveBeenCalledTimes(1); expect(witness).toHaveBeenCalled();
    const actual = solve.mock.results[0].value;
    expect(Math.abs(actual.drivenValues['measured-radius'] - 2)).toBeLessThanOrEqual(1e-7);
    for (const [profile] of native.mock.calls) {
      const circle = profile.entities.find(entity => entity.id === 'circle');
      if (circle?.type !== 'circle') throw new Error('Original solved circle must reach every native construction.');
      expect(Math.abs(circle.radius - 2)).toBeLessThanOrEqual(1e-7);
    }
    metrics(engine, output(), 800 - 32 * Math.PI, 520 + 24 * Math.PI, row.min, row.max); probe(engine, output(), row.cut, false);
    metrics(engine, B, 800, 520, row.behindMin, row.behindMax);
    probe(engine, B, row.behindMin.map((value, axis) => (value + row.behindMax[axis]) / 2) as Vec3, true);
    expect(catalog(engine).resolve(B).createdByFeatureId).toBe('create-B'); expect(() => catalog(engine).resolve(output('B'))).toThrow();
    expect((saved.features.at(-1) as RepetitionFeature).featurePattern).toEqual(operation.featurePattern);
  } finally { solve.mockRestore(); witness.mockRestore(); native.mockRestore(); }
}), 60_000);

it('attests every ALL entity owner including the unchanged B body role and metadata', () => usingEngine((engine, owners) => {
  const { value, operation } = entityBehind(), setup = directAll(engine, value, operation), beforeB = setup.input.catalog.resolve(B);
  let evaluated: ReturnType<typeof evaluateFeatureRecipes> | undefined;
  try {
    evaluated = evaluateFeatureRecipes(setup.input);
    expect(evaluated.replacements.map(item => item.ref.bodyId)).toEqual(['A']);
    expect(evaluated.attestation.targets.map(item => item.ref.bodyId).sort()).toEqual(['A', 'B', 'S']);
    expect(evaluated.attestation.virtualOutputs.filter(item => item.targetBodyId === 'B')).toEqual([
      { sourcePoststate: S, targetBodyId: 'B', address: '1,0', role: 'body', inputRevision: 0, outputRevision: 0, materialChanged: false }]);
    expect(setup.input.catalog.resolve(B)).toBe(beforeB); expect(setup.input.catalog.resolve(B).shape).toBe(beforeB.shape);
    const transaction = stageFeatureRecipeEvaluation(evaluated, setup.input.catalog,
      { sourceFeatureId: operation.id, lineage: 'original-entity-all-stage' }, setup.input);
    owners.own({ delete: () => transaction.dispose() }); const next = transaction.commit(); owners.own(next.aggregate);
    owners.own({ delete: () => next.catalog.dispose() });
    const afterB = next.catalog.resolve(B);
    expect({ ref: afterB.ref, name: afterB.name, creator: afterB.createdByFeatureId, lineage: afterB.lineage })
      .toEqual({ ref: beforeB.ref, name: beforeB.name, creator: beforeB.createdByFeatureId, lineage: beforeB.lineage });
    expect(() => next.catalog.resolve(output('B'))).toThrow();
  } finally { evaluated?.dispose(); setup.actual.revoke(); }
}), 60_000);

for (const multiple of [false, true]) it('native-validates a behind witness for ' + (multiple ? 'two circle regions' : 'an asymmetric line/arc D'), () => usingEngine(engine => {
  const profile = multiple ? circles(false) : dProfile(), { value, operation } = entityBehind(entityBehindRows[0], profile);
  build(engine, parseDocument(serializeDocument(addFeature(value, operation))));
  metrics(engine, output(), multiple ? 800 - 16 * Math.PI : 672 - 16 * Math.PI,
    multiple ? 520 + 28 * Math.PI : 584 + 12 * Math.PI, [20, 0, 0], [30, 10, 8]);
  metrics(engine, B, 800, 520, [20, 0, -10], [30, 10, -2]);
}), 60_000);

it('keeps selected entity behind-owner rejection on the original ThroughAll route', () => usingEngine(engine => {
  const { value, operation } = entityBehind();
  operation.featurePattern = { mode: 'regenerate', scope: 'selected', targets: [B],
    bindings: [{ source: S, targetBodyIds: ['B'] }], referencePolicies: [], variation: { kind: 'none' } };
  const witness = vi.spyOn(entities, 'validateEntityRecipeProfileForAbsence');
  try {
    const result = engine.build(addFeature(value, operation).features);
    expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']);
    expect(result.featureErrors[0].message).toContain('No hay material en el sentido de extrusión elegido.');
    expect(witness).not.toHaveBeenCalled(); metrics(engine, B, 800, 520, [20, 0, -10], [30, 10, -2]);
  } finally { witness.mockRestore(); }
}), 60_000);
it('builds bilateral entity tools and actually cuts the owner behind the original unilateral ray', () => usingEngine(engine => {
  const { value, operation } = entityBehind(entityBehindRows[0], solvedCircle(), true), witness = vi.spyOn(entities, 'validateEntityRecipeProfileForAbsence');
  try {
    build(engine, addFeature(value, operation)); expect(witness).not.toHaveBeenCalled();
    metrics(engine, output('B'), 800 - 32 * Math.PI, 520 + 24 * Math.PI, [20, 0, -10], [30, 10, -2]);
    probe(engine, output('B'), [25, 5, -6], false);
  } finally { witness.mockRestore(); }
}), 60_000);

for (const maximum of [-.0000005, 0, .0000005]) it('keeps the entity native route for near-plane maximum ' + maximum, () => usingEngine(engine => {
  const row = { ...entityBehindRows[0], behindMin: [20, 0, maximum - 8] as Vec3, behindMax: [30, 10, maximum] as Vec3 };
  const { value, operation } = entityBehind(row), witness = vi.spyOn(entities, 'validateEntityRecipeProfileForAbsence');
  try {
    const result = engine.build(addFeature(value, operation).features);
    expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']);
    expect(result.featureErrors[0].message).toContain('No hay material en el sentido de extrusión elegido.'); expect(witness).not.toHaveBeenCalled();
    metrics(engine, A, 800, 520, row.min, row.max); metrics(engine, B, 800, 520, row.behindMin, row.behindMax);
  } finally { witness.mockRestore(); }
}), 60_000);
it('still rejects an ALL entity address with no forward owner changed', () => usingEngine(engine => {
  const { value, operation } = entityBehind(), aSketch = value.features.find(feature => feature.id === 'create-A-sketch') as SketchFeature;
  const withoutA = updateFeature(value, aSketch.id, { ...aSketch, offset: -10 });
  const result = engine.build(addFeature(withoutA, operation).features);
  expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']); expect(result.featureErrors[0].message).toContain('changes no material');
  metrics(engine, A, 800, 520, [20, 0, -10], [30, 10, -2]); metrics(engine, B, 800, 520, [20, 0, -10], [30, 10, -2]);
}), 60_000);

function witnessSession(profile: EntityProfile) {
  // A direct real-solve/profile fixture, not a claim that an open profile issued
  // a healthy historical seed BRep. Registry staging may publish open sketches.
  const value = prefix(rows[0], profile), operation = pattern('linearPattern');
  const actual = createSourceSketchSolveRegistry(value.features, { planeFeatureIds: new Set(), solidFeatureIds: new Set(),
    unavailableFeatureIds: new Set(), planes: new Map(), historicalFaces: new Map() });
  value.features.forEach((feature, index) => actual.observeFeature(feature, index));
  const sketch = value.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
  actual.solveAndStage(sketch, value.features.indexOf(sketch), () => {});
  const checkpoint = actual.reader.checkpoint(value.features, [sketch.id]);
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: operation.id, patternKind: operation.type,
    beforeFeatureIndex: value.features.length, sourceFeatureIds: ['seed'], plan: patternPlan(operation), scope: { mode: 'selected', targets: [A] },
    targetSnapshot: [A], bindings: [{ source: S, targets: ['A'] }], referencePolicies: [], variation: { kind: 'none' } };
  const placement = intrinsicProfileInstancePlacement(requireInitialRecipeDeclaration(extractRecipeClosure(value.features, request)), 'seed', '1,0');
  return { actual, input: { source: { registry: actual.reader, checkpoint, features: value.features }, placement,
    validateTool: validatePositiveClosedTool, assertWorkingCurrent: () => actual.reader.assertCheckpoint(checkpoint, value.features) } };
}
it('rejects a genuine checkpoint-issued solved open profile instead of certifying native absence', () => {
  const setup = witnessSession({ kind: 'entities', points: [{ id: 'a', x: 2, y: 2 }, { id: 'b', x: 4, y: 2 }],
    entities: [{ id: 'open', type: 'line', start: 'a', end: 'b', construction: false }],
    constraints: [{ id: 'a-fix', type: 'fix', pointId: 'a', x: 2, y: 2 }, { id: 'b-fix', type: 'fix', pointId: 'b', x: 4, y: 2 }] });
  try { expect(() => entities.validateEntityRecipeProfileForAbsence(setup.input)).toThrow(/cerrad|contorno/i); }
  finally { setup.actual.revoke(); }
}, 60_000);
it('validates a real annular witness without claiming it is a single persistent cut owner', () => {
  const setup = witnessSession(circles(true)); let observed = false, expectedTolerance = NaN;
  try {
    const detachedTolerance = entities.validateEntityRecipeProfileForAbsence({ ...setup.input, validateTool: tool => withNativeOwners(owners => {
      const checked = validatePositiveClosedTool(tool); expect(checked.solidCount).toBe(1); observed = true;
      const oc = getOC(); expectedTolerance = Math.max(...(['VERTEX', 'EDGE', 'FACE'] as const).map(kind =>
        oc.BRep_Tool.MaxTolerance(tool.wrapped, oc.TopAbs_ShapeEnum[`TopAbs_${kind}`])));
      expect(Math.abs(owners.own(measureShapeVolumeProperties(tool)).volume - 3 * Math.PI)).toBeLessThan(V);
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(tool)).area - 12 * Math.PI)).toBeLessThan(V);
      const bounds = owners.own(tool.boundingBox).bounds;
      [[23, 3, 0], [27, 7, 1]].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(X)));
      for (const [center, present] of [[[25, 5, .5], false], [[26.5, 5, .5], true]] as const) {
        const cube = owners.own(makeBox(center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3));
        const common = owners.own(bodyBoolean('common', tool, cube));
        expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
      }
    }) });
    expect(observed).toBe(true); expect(Number.isFinite(detachedTolerance) && detachedTolerance >= 0).toBe(true);
    expect(detachedTolerance).toBe(expectedTolerance);
  }
  finally { setup.actual.revoke(); }
}, 60_000);

it('rechecks the actual guarded working revision after successful witness release', () => withNativeOwners(owners => {
  const setup = witnessSession(solvedCircle()), working = owners.own(makeBox([20, 0, -10], [30, 10, -2]));
  const current = new Map([['B', working]]), revisions = new Map([['B', 0]]), original = profiles.entityProfileSolid;
  let releases = 0;
  const native = vi.spyOn(profiles, 'entityProfileSolid').mockImplementation((...args) => {
    const prism = original(...args), handle = prism.wrapped, rawDelete = handle.delete.bind(handle);
    Object.defineProperty(handle, 'delete', { configurable: true, value: () => { releases++; rawDelete(); revisions.set('B', 1); } });
    return prism;
  });
  try {
    expect(() => entities.validateEntityRecipeProfileForAbsence({ ...setup.input, assertWorkingCurrent: () => {
      setup.input.assertWorkingCurrent();
      if (current.get('B') !== working || revisions.get('B') !== 0) throw new Error('Original guarded working revision changed after release.');
    } })).toThrow('working revision changed after release');
    expect(releases).toBe(1); validateBodyShape(working);
  } finally { native.mockRestore(); setup.actual.revoke(); }
}), 60_000);

function elevatedOriginalVertexTolerance(shape: Shape3D): Shape3D {
  return withNativeOwners(owners => {
    const oc = getOC(), serialized = oc.BRepToolsWrapper.Write(shape.wrapped);
    expect(serialized).toContain('CASCADE Topology V3');
    const rows = serialized.split('\n'), edited = [...rows], fields = rows.flatMap((row, index) => row === 'Ve' ? [index + 1] : []);
    expect(fields.length).toBeGreaterThan(0);
    for (const index of fields) {
      expect(Number.isFinite(Number(rows[index])) && Number(rows[index]) >= 0 && Number(rows[index]) < .001).toBe(true);
      edited[index] = '0.001';
    }
    const restored = [...edited]; for (const index of fields) restored[index] = rows[index];
    expect(restored.join('\n')).toBe(serialized); // all non-tolerance bytes remain original
    const raw = owners.own(oc.BRepToolsWrapper.Read(edited.join('\n'))), result = owners.own(cast(raw)).asShape3D();
    expect(Math.abs(oc.BRep_Tool.MaxTolerance(result.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX) - .001)).toBeLessThan(1e-15);
    validatePositiveClosedTool(result);
    return result;
  }, result => [result], 'Original elevated vertex-tolerance fixture construction or release failed.');
}
it('retains the original route when the genuine entity witness tolerance exceeds owner separation', () => usingEngine(engine => {
  const row = { ...entityBehindRows[0], behindMin: [20, 0, -8.0002] as Vec3, behindMax: [30, 10, -.0002] as Vec3 };
  const { value, operation } = entityBehind(row), originalWitness = entities.validateEntityRecipeProfileForAbsence,
    originalProfile = profiles.entityProfileSolid;
  let insideWitness = false;
  const witness = vi.spyOn(entities, 'validateEntityRecipeProfileForAbsence').mockImplementation(input => {
    insideWitness = true; try { return originalWitness(input); } finally { insideWitness = false; }
  });
  const native = vi.spyOn(profiles, 'entityProfileSolid').mockImplementation((...args) => {
    if (!insideWitness) return originalProfile(...args);
    return withNativeOwners(owners => {
      const original = owners.own(originalProfile(...args)), elevated = owners.own(elevatedOriginalVertexTolerance(original));
      expect(Math.abs(owners.own(measureShapeVolumeProperties(elevated)).volume - 4 * Math.PI)).toBeLessThan(V);
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(elevated)).area - 12 * Math.PI)).toBeLessThan(V);
      return elevated;
    }, shape => [shape], 'Original native witness tolerance adaptation or release failed.');
  });
  const bridge = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool');
  try {
    const result = engine.build(addFeature(value, operation).features);
    expect(witness).toHaveBeenCalledTimes(1); expect(Math.abs(witness.mock.results[0].value - .001)).toBeLessThan(1e-15);
    expect(bridge.mock.calls.some(([input]) => input.targetBodyId === 'B')).toBe(true);
    expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']);
    expect(result.featureErrors[0].message).toContain('No hay material en el sentido de extrusión elegido.');
    metrics(engine, A, 800, 520, row.min, row.max); metrics(engine, B, 800, 520, row.behindMin, row.behindMax);
    expect(() => catalog(engine).resolve(output())).toThrow(); expect(() => catalog(engine).resolve(output('B'))).toThrow();
  } finally { witness.mockRestore(); native.mockRestore(); bridge.mockRestore(); }
}), 60_000);

for (const fault of ['construct', 'tolerance-query', 'release', 'source-after-release'] as const) it('rejects a behind entity witness ' + fault + ' fault atomically', () => usingEngine(engine => {
  const { value, operation } = entityBehind(), saved = addFeature(value, operation), originalWitness = entities.validateEntityRecipeProfileForAbsence;
  const originalProfile = profiles.entityProfileSolid, originalTolerance = bodies.maximumNativeShapeTolerance,
    primary = new Error('Original entity absence witness ' + fault);
  let insideWitness = false, received = 0, releases = 0;
  const witness = vi.spyOn(entities, 'validateEntityRecipeProfileForAbsence').mockImplementation(input => {
    insideWitness = true; try { return originalWitness(input); } finally { insideWitness = false; }
  });
  const native = vi.spyOn(profiles, 'entityProfileSolid').mockImplementation((...args) => {
    if (insideWitness && fault === 'construct') throw primary;
    const prism = originalProfile(...args);
    if (insideWitness) {
      received++; const handle = prism.wrapped, rawDelete = handle.delete.bind(handle);
      Object.defineProperty(handle, 'delete', { configurable: true, value: () => {
        releases++; rawDelete();
        if (fault === 'release') throw primary;
        if (fault !== 'source-after-release') return;
        const sketch = saved.features.find(feature => feature.id === 'entity-sketch') as SketchFeature;
        if (sketch.profile.kind !== 'entities') throw new Error('Original source missing.');
        const radius = sketch.profile.constraints.find(item => item.id === 'driving-radius');
        if (radius?.type !== 'radius') throw new Error('Original driving radius missing.'); radius.value = 3;
      } });
    }
    return prism;
  });
  const tolerance = vi.spyOn(bodies, 'maximumNativeShapeTolerance').mockImplementation(shape => {
    const value = originalTolerance(shape); if (insideWitness && fault === 'tolerance-query') throw primary; return value;
  });
  try {
    if (fault === 'release') {
      let caught: unknown; try { engine.build(saved.features); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(NativeCleanupError); expect((caught as NativeCleanupError).cause).toBe(primary);
    } else {
      const result = engine.build(saved.features); expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']);
      expect(result.featureErrors[0].message).toContain(fault === 'source-after-release' ? 'changed' : primary.message);
      metrics(engine, A, 800, 520, [20, 0, 0], [30, 10, 8]); metrics(engine, B, 800, 520, [20, 0, -10], [30, 10, -2]);
      expect(() => catalog(engine).resolve(output())).toThrow(); expect(() => catalog(engine).resolve(output('B'))).toThrow();
    }
    expect(witness).toHaveBeenCalledTimes(1); expect(received).toBe(fault === 'construct' ? 0 : 1); expect(releases).toBe(received);
  } finally { witness.mockRestore(); native.mockRestore(); tolerance.mockRestore(); }
}), 60_000);

it('rejects no-op B native shape drift at entity ALL staging and releases A candidate once', () => usingEngine((engine, owners) => {
  const { value, operation } = entityBehind(), setup = directAll(engine, value, operation);
  let evaluated: ReturnType<typeof evaluateFeatureRecipes> | undefined;
  try {
    evaluated = evaluateFeatureRecipes(setup.input);
    const changed = owners.own(bodies.copyBodyShape(setup.input.catalog.resolve(B).shape)), entries = setup.input.catalog.entries.bind(setup.input.catalog);
    const handle = evaluated.replacements[0].shape.wrapped, rawDelete = handle.delete.bind(handle), deleted = vi.fn(() => rawDelete());
    Object.defineProperty(handle, 'delete', { configurable: true, value: deleted });
    const listing = vi.spyOn(setup.input.catalog, 'entries').mockImplementation(() => entries().map(entry => entry.ref.bodyId === 'B' ? { ...entry, shape: changed } : entry));
    const staging = vi.spyOn(setup.input.catalog, 'stageReplaceMany');
    try {
      expect(() => stageFeatureRecipeEvaluation(evaluated!, setup.input.catalog,
        { sourceFeatureId: operation.id, lineage: 'original-stale-entity-all' }, setup.input)).toThrow('membership or owner state changed');
      expect(staging).not.toHaveBeenCalled(); expect(deleted).toHaveBeenCalledTimes(1);
    } finally { listing.mockRestore(); staging.mockRestore(); }
    metrics(engine, A, 800, 520, [20, 0, 0], [30, 10, 8]); metrics(engine, B, 800, 520, [20, 0, -10], [30, 10, -2]);
  } finally { evaluated?.dispose(); setup.actual.revoke(); }
}), 60_000);

it('keeps a later real entity tail split atomic after an earlier A change and B behind witness', () => usingEngine(engine => {
  const profile: EntityProfile = { kind: 'entities', points: [
    { id: 'a', x: 1, y: 1 }, { id: 'b', x: 2, y: 1 }, { id: 'c', x: 2, y: 3 }, { id: 'd', x: 1, y: 3 }],
    entities: [['bottom', 'a', 'b'], ['right', 'b', 'c'], ['top', 'c', 'd'], ['left', 'd', 'a']].map(([id, start, end]) =>
      ({ id, type: 'line' as const, start, end, construction: false })),
    constraints: [['a', 1, 1], ['b', 2, 1], ['c', 2, 3], ['d', 1, 3]].map(([id, x, y]) =>
      ({ id: 'fix-' + id, type: 'fix' as const, pointId: id as string, x: x as number, y: y as number })) };
  const value = document([...box('create-S', 'S', [0, 0, 0], [10, 4, 2]),
    { id: 'entity-sketch', name: 'Original entity through slot', type: 'sketch', suppressed: false, plane: 'XY', offset: 0, profile },
    { id: 'seed', name: 'Original entity slot', type: 'cut', suppressed: false, sketchId: 'entity-sketch', depth: 1, symmetric: false,
      bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-S' }], endCondition: { kind: 'throughAll', baseFeatureId: 'create-S', bothDirections: false } },
    ...box('create-A', 'A', [0, 0, 0], [8, 4, 4]),
    { id: 'tail-profile', name: 'Original attached tail', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [11, 2], width: 6, height: 2 } },
    { id: 'tail', name: 'Original tail merge', type: 'extrude', suppressed: false, sketchId: 'tail-profile', depth: 2, symmetric: false,
      bodyOperation: { mode: 'merge', target: A } }, ...box('create-B', 'B', [20, 0, -10], [30, 10, -2])]);
  const initial = engine.build(value.features); expect(initial.featureErrors).toEqual([]);
  const operation = pattern('linearPattern', 'create-B'); if (operation.type !== 'linearPattern') throw new Error('Original linear slot plan missing.');
  operation.first = { direction: [1, 0, 0], spacing: 4, count: 3 };
  operation.featurePattern = { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput', bindings: [{ source: S, targetBodyIds: 'scope' }], referencePolicies: [], variation: { kind: 'none' } };
  const saved = parseDocument(serializeDocument(addFeature(value, operation))), bytes = serializeDocument(saved), original = recipeBridge.buildRecipeInstanceTool;
  let observedSecond = false;
  const bridge = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    if (input.targetBodyId === 'A' && input.address === '2,0') {
      observedSecond = true; withNativeOwners(owners => {
        validateBodyShape(input.workingTarget);
        expect(Math.abs(owners.own(measureShapeVolumeProperties(input.workingTarget)).volume - 144)).toBeLessThan(V);
        expect(Math.abs(owners.own(measureShapeSurfaceProperties(input.workingTarget)).area - 228)).toBeLessThan(V);
      });
    }
    return original(input);
  });
  try {
    const result = engine.build(saved.features); expect(observedSecond).toBe(true);
    expect(result.featureErrors.map(error => error.id)).toEqual(['pattern']); expect(result.featureErrors[0].message).toMatch(/sólido|solid|divid/i);
    expect(result.bodies).toEqual(initial.bodies); expect(serializeDocument(saved)).toBe(bytes);
    metrics(engine, S, 76, 144, [0, 0, 0], [10, 4, 2]);
    metrics(engine, { bodyId: 'A', sourceFeatureId: 'tail' }, 152, 208, [0, 0, 0], [14, 4, 4]);
    metrics(engine, B, 800, 520, [20, 0, -10], [30, 10, -2]);
    for (const id of ['S', 'A', 'B']) expect(() => catalog(engine).resolve(output(id))).toThrow();
    expect(() => engine.export('step', saved.features)).toThrow();
  } finally { bridge.mockRestore(); }
}), 60_000);
