import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { withFeaturePatternMode, withFeaturePatternWorldLimit } from '../model/featurePatternCommands';
import type { FeaturePatternOperation } from '../model/featurePatterns';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import * as recipeInstance from './kernel.recipe-instance';
import type { BodyReference, CadResult, Feature, RepetitionFeature, Vec3 } from './kernel.types';

// Original analytical mm fixtures for explicitly fixed external XY=0 limits.
// Expected geometry is derived from boxes/cylinders below, not the recipe helper.
// This local placement policy is not evidence of another application's semantics.
const source: BodyReference = { bodyId: 'world-S', sourceFeatureId: 'seed-limit' };
const a: BodyReference = { bodyId: 'world-A', sourceFeatureId: 'create-A' };
const b: BodyReference = { bodyId: 'world-B', sourceFeatureId: 'create-B' };
const c: BodyReference = { bodyId: 'world-C', sourceFeatureId: 'create-C' };
const sourceMin: Vec3 = [-1, -1, -8], sourceMax: Vec3 = [1, 1, 8];
const metricTolerance = 1e-5, coordinateTolerance = 1e-6;
type Kind = RepetitionFeature['type'];
type Placement = { kind: Kind; min: Vec3; max: Vec3; holeProbe: Vec3; retainedProbe: Vec3; depth: number; baseVolume: number; baseArea: number; copiedHoleProbePresent: boolean; copiedRetainedProbePresent: boolean };
const placements: Placement[] = [
  { kind: 'linearPattern', min: [2, -1, -8], max: [4, 1, 8], holeProbe: [3, 0, -1], retainedProbe: [3, 0, 3], depth: 2, baseVolume: 64, baseArea: 136, copiedHoleProbePresent: false, copiedRetainedProbePresent: false },
  { kind: 'circularPattern', min: [-1, -1, -8], max: [1, 1, 8], holeProbe: [0, 0, 1], retainedProbe: [0, 0, -1], depth: 2, baseVolume: 64, baseArea: 136, copiedHoleProbePresent: false, copiedRetainedProbePresent: false },
  { kind: 'mirror', min: [-1, -1, -12], max: [1, 1, 12], holeProbe: [0, 0, 2], retainedProbe: [0, 0, -5], depth: 10, baseVolume: 96, baseArea: 200, copiedHoleProbePresent: true, copiedRetainedProbePresent: true },
];

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

function fixture(check: (engine: CadEngine) => void): void {
  const engine = new CadEngine(); let failed = false, primary: unknown;
  try { check(engine); } catch (error) { failed = true; primary = error; }
  try { engine.dispose(); } catch (error) {
    throw new AggregateError(failed ? [primary, error] : [error], 'Original world-limit fixture or cleanup failed.', { cause: failed ? primary : error });
  }
  if (failed) throw primary;
}
function box(id: string, bodyId: string, min: Vec3, max: Vec3): Feature[] {
  return [{ id: id + '-profile', type: 'sketch', name: 'Original rectangle ' + id, suppressed: false, plane: 'XY', offset: min[2],
    profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], width: max[0] - min[0], height: max[1] - min[1] } },
  { id, type: 'extrude', name: 'Original owned box ' + id, suppressed: false, sketchId: id + '-profile', depth: max[2] - min[2],
    symmetric: false, bodyOperation: { mode: 'new', bodyId } }];
}
function limitedSeed(operation: 'cut' | 'merge' = 'cut', negative = false): Feature[] {
  const sketch: Feature = { id: 'limit-profile', type: 'sketch', name: 'Original radius-half profile', suppressed: false, plane: 'XY',
    offset: negative ? 6 : -6, profile: { kind: 'circle', center: [0, 0], radius: .5 } };
  const common = { id: source.sourceFeatureId, name: 'Original fixed-plane seed', suppressed: false, sketchId: sketch.id,
    depth: negative ? -6 : 6, symmetric: false,
    endCondition: { kind: 'upToSurface' as const, target: { kind: 'principal' as const, plane: 'XY' as const } } };
  return [sketch, operation === 'cut' ? { ...common, type: 'cut', bodyScope: [{ bodyId: source.bodyId, sourceFeatureId: 'create-S' }] }
    : { ...common, type: 'extrude', bodyOperation: { mode: 'merge', target: { bodyId: source.bodyId, sourceFeatureId: 'create-S' } } }];
}
function document(features: Feature[]): Document { return validateDocument({ ...createDocument('Original fixed world-plane recipes'), features }); }
function prefix(row = placements[0], negative = false): Document {
  const features: Feature[] = [...box('create-S', source.bodyId, sourceMin, sourceMax), ...limitedSeed('cut', negative),
    ...box(a.sourceFeatureId, a.bodyId, row.min, row.max)];
  if (row.kind === 'mirror') features.push({ id: 'world-mirror-XY2', type: 'plane', name: 'Original XY2 mirror datum', suppressed: false,
    support: { kind: 'principal', plane: 'XY' }, offset: 2, reversed: false });
  return document(features);
}
function pattern(kind: Kind, baseFeatureId: string, targets: BodyReference[] = [a], scope: 'selected' | 'all' = 'selected', negative = false): RepetitionFeature {
  const operation: FeaturePatternOperation = scope === 'all'
    ? { mode: 'regenerate', scope, reevaluateAt: 'patternInput', bindings: [{ source: { ...source }, targetBodyIds: 'scope' }], referencePolicies: [], variation: { kind: 'none' } }
    : { mode: 'regenerate', scope, targets: structuredClone(targets), bindings: [{ source: { ...source }, targetBodyIds: targets.map(target => target.bodyId) }], referencePolicies: [], variation: { kind: 'none' } };
  const common = { id: 'world-pattern', name: 'Original world-limit repetition', suppressed: false, baseFeatureId,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: [source.sourceFeatureId] }, featurePattern: operation };
  let feature: RepetitionFeature;
  if (kind === 'linearPattern') feature = { ...common, type: kind, first: { direction: [.6, 0, negative ? -.8 : .8], spacing: 5, count: 2 }, second: null, secondSeedOnly: false, skipped: [] };
  else if (kind === 'circularPattern') feature = { ...common, type: kind, axis: { origin: [0, 0, -2], direction: [0, 1, 0] }, count: 2, angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  else feature = { ...common, type: kind, support: { kind: 'plane', planeId: 'world-mirror-XY2' }, mergeBodies: false };
  return withFeaturePatternWorldLimit(feature, source.sourceFeatureId, true);
}
function catalog(engine: CadEngine): NativeBodyCatalog {
  const value = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!value) throw new Error('Expected the actual owned native catalog.'); return value;
}
function healthy(engine: CadEngine, value: Document): CadResult {
  const saved = serializeDocument(value), result = engine.build(value.features);
  expect(result.featureErrors).toEqual([]); expect(result.bodyCatalogActive).toBe(true);
  expect(serializeDocument(value)).toBe(saved); expect(structuredClone(result)).toEqual(result); return result;
}
function metrics(engine: CadEngine, ref: BodyReference, volume: number, area: number, min: Vec3, max: Vec3): void {
  const shape = catalog(engine).resolve(ref).shape; validateBodyShape(shape);
  withNativeOwners(owners => {
    const solids = owners.ownAll(shape.solids); expect(solids).toHaveLength(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(metricTolerance);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(metricTolerance);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, index) => side.forEach((value, axis) => expect(Math.abs(bounds[index][axis] - value)).toBeLessThan(coordinateTolerance)));
  });
}
function probe(engine: CadEngine, ref: BodyReference, center: Vec3, present: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', catalog(engine).resolve(ref).shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
  });
}
const output = (bodyId = a.bodyId): BodyReference => ({ bodyId, sourceFeatureId: 'world-pattern' });
function identity(result: CadResult, ref: BodyReference, creator: string): void {
  const body = result.bodies?.find(value => value.ref.bodyId === ref.bodyId);
  expect(body?.ref).toEqual(ref); expect(body?.createdByFeatureId).toBe(creator);
  expect(body?.triangles.length).toBeGreaterThan(0); expect(body?.faces.length).toBeGreaterThan(0); expect(body?.edges.length).toBeGreaterThan(0);
}

it.each(placements)('keeps XY=0 fixed while the actual $kind profile/ray moves, separately from geometry copying', row => fixture(engine => {
  const before = prefix(row), operation = pattern(row.kind, a.sourceFeatureId), original = structuredClone(operation);
  const saved = parseDocument(serializeDocument(addFeature(before, operation))), result = healthy(engine, saved);
  // For r=.5, a wholly internal cylinder has V=pi*h/4 and A=pi*h+pi/2.
  metrics(engine, output(), row.baseVolume - row.depth * Math.PI / 4, row.baseArea + (row.depth + .5) * Math.PI, row.min, row.max);
  metrics(engine, source, 64 - 3 * Math.PI / 2, 136 + 13 * Math.PI / 2, sourceMin, sourceMax);
  probe(engine, output(), row.holeProbe, false); probe(engine, output(), row.retainedProbe, true);
  identity(result, output(), a.sourceFeatureId); identity(result, source, 'create-S'); expect(result.bodies).toHaveLength(2);
  expect(saved.features.at(-1)).toEqual(original); expect(operation).toEqual(original);
  const copied = withFeaturePatternMode(operation, 'geometry');
  expect(copied.featurePattern?.mode).toBe('geometry'); expect(Object.hasOwn(copied.featurePattern!, 'referencePolicies')).toBe(false);
  healthy(engine, parseDocument(serializeDocument(addFeature(before, copied))));
  metrics(engine, output(), row.baseVolume - 3 * Math.PI / 2, row.baseArea + 13 * Math.PI / 2, row.min, row.max);
  probe(engine, output(), row.holeProbe, row.copiedHoleProbePresent);
  probe(engine, output(), row.retainedProbe, row.copiedRetainedProbePresent);
  expect(operation).toEqual(original);
}), 60_000);

it('uses a negative source ray and translated start +2 to reach the fixed plane in -Z', () => fixture(engine => {
  const row = placements[0], before = prefix(row, true), operation = pattern('linearPattern', a.sourceFeatureId, [a], 'selected', true);
  const result = healthy(engine, parseDocument(serializeDocument(addFeature(before, operation))));
  metrics(engine, output(), 64 - Math.PI / 2, 136 + 5 * Math.PI / 2, row.min, row.max);
  metrics(engine, source, 64 - 3 * Math.PI / 2, 136 + 13 * Math.PI / 2, sourceMin, sourceMax);
  probe(engine, output(), [3, 0, 1], false); probe(engine, output(), [3, 0, -1], true);
  identity(result, output(), a.sourceFeatureId);
}), 60_000);

it('regenerates a selected merge to the world plane instead of copying the six-millimetre source boss', () => fixture(engine => {
  const before = document([...box('create-S', source.bodyId, [-1, -1, -8], [1, 1, -6]), ...limitedSeed('merge'),
    ...box(a.sourceFeatureId, a.bodyId, [2, -1, -4], [4, 1, -2])]);
  const operation = pattern('linearPattern', a.sourceFeatureId), result = healthy(engine, parseDocument(serializeDocument(addFeature(before, operation))));
  // A box top loses the base disk and gains an equal tip disk: only 2*pi*r*h is added to its area.
  metrics(engine, output(), 8 + Math.PI / 2, 24 + 2 * Math.PI, [2, -1, -4], [4, 1, 0]);
  metrics(engine, source, 8 + 3 * Math.PI / 2, 24 + 6 * Math.PI, [-1, -1, -8], [1, 1, 0]);
  probe(engine, output(), [3, 0, -1], true); probe(engine, output(), [3, 0, 1], false);
  identity(result, output(), a.sourceFeatureId); identity(result, source, 'create-S');
}), 60_000);

it('resolves saved ALL dynamically for distinct coincident owners and keeps the remote owner at its exact old state', () => fixture(engine => {
  const row = placements[0], before = document([...prefix(row).features,
    ...box(b.sourceFeatureId, b.bodyId, row.min, row.max), ...box(c.sourceFeatureId, c.bodyId, [20, -1, -8], [22, 1, 8])]);
  const operation = pattern('linearPattern', c.sourceFeatureId, [], 'all'), declaration = structuredClone(operation.featurePattern);
  const initial = healthy(engine, before), saved = parseDocument(serializeDocument(addFeature(before, operation))), result = healthy(engine, saved);
  const savedPattern = saved.features.at(-1);
  if (!savedPattern || !['linearPattern', 'circularPattern', 'mirror'].includes(savedPattern.type) || !('featurePattern' in savedPattern)) {
    throw new Error('Original saved ALL pattern missing.');
  }
  expect(Object.hasOwn(savedPattern.featurePattern!, 'targets')).toBe(false);
  expect(savedPattern.featurePattern).toEqual(declaration); expect(result.bodies).toHaveLength(4);
  for (const target of [a, b]) {
    metrics(engine, output(target.bodyId), 64 - Math.PI / 2, 136 + 5 * Math.PI / 2, row.min, row.max);
    probe(engine, output(target.bodyId), [3, 0, -1], false); probe(engine, output(target.bodyId), [3, 0, 3], true);
    identity(result, output(target.bodyId), target.sourceFeatureId);
  }
  metrics(engine, source, 64 - 3 * Math.PI / 2, 136 + 13 * Math.PI / 2, sourceMin, sourceMax);
  metrics(engine, c, 64, 136, [20, -1, -8], [22, 1, 8]); probe(engine, c, [21, 0, -1], true);
  identity(result, c, c.sourceFeatureId);
  expect(result.bodies?.find(body => body.ref.bodyId === c.bodyId)).toEqual(initial.bodies?.find(body => body.ref.bodyId === c.bodyId));
  expect(() => catalog(engine).resolve(output(c.bodyId))).toThrow(); expect(() => catalog(engine).resolve(output(source.bodyId))).toThrow();
  expect(Math.abs(result.volume - (256 - 5 * Math.PI / 2))).toBeLessThan(metricTolerance);
}), 60_000);

it('rejects a later address whose fixed plane lies behind its ray without publishing the earlier real tool effect', () => fixture(engine => {
  const row = placements[0], before = document([...prefix(row).features,
    ...box(b.sourceFeatureId, b.bodyId, [5, -1, -8], [7, 1, 8])]);
  const firstOnly = pattern('linearPattern', b.sourceFeatureId, [a, b]), initial = healthy(engine, before);
  healthy(engine, addFeature(before, firstOnly)); metrics(engine, output(), 64 - Math.PI / 2, 136 + 5 * Math.PI / 2, row.min, row.max);
  metrics(engine, b, 64, 136, [5, -1, -8], [7, 1, 8]);
  const operation = structuredClone(firstOnly);
  if (operation.type !== 'linearPattern') throw new Error('Original late-address fixture needs a linear pattern.');
  operation.first.count = 3;
  const saved = parseDocument(serializeDocument(addFeature(before, operation))), bytes = serializeDocument(saved), build = vi.spyOn(recipeInstance, 'buildRecipeInstanceTool');
  let result!: CadResult, trace: { address: string; target: string; result: string }[] = [];
  try {
    result = engine.build(saved.features);
    trace = build.mock.calls.map(([input], index) => ({ address: input.address, target: input.targetBodyId, result: build.mock.results[index].type }));
  } finally { build.mockRestore(); }
  expect(trace).toContainEqual({ address: '1,0', target: a.bodyId, result: 'return' });
  expect(trace).toContainEqual({ address: '2,0', target: a.bodyId, result: 'throw' });
  expect(result.featureErrors.map(error => error.id)).toEqual([operation.id]); expect(result.bodies).toEqual(initial.bodies);
  expect(serializeDocument(saved)).toBe(bytes);
  for (const target of [a, b]) expect(() => catalog(engine).resolve(output(target.bodyId))).toThrow();
  metrics(engine, a, 64, 136, row.min, row.max); metrics(engine, b, 64, 136, [5, -1, -8], [7, 1, 8]);
  metrics(engine, source, 64 - 3 * Math.PI / 2, 136 + 13 * Math.PI / 2, sourceMin, sourceMax);
}), 60_000);

it('preserves the explicit world policy and body identities through source edit, save/reopen, undo and redo', () => fixture(engine => {
  const before = prefix(), operation = pattern('linearPattern', a.sourceFeatureId), original = parseDocument(serializeDocument(addFeature(before, operation))), history = new DocumentHistory(original);
  const profile = original.features.find(feature => feature.id === 'limit-profile');
  if (!profile || profile.type !== 'sketch') throw new Error('Original circle profile missing.');
  const edited = updateFeature(original, profile.id, { ...profile, profile: { kind: 'circle', center: [0, 0], radius: .25 } });
  history.apply(edited); const reopened = parseDocument(serializeDocument(history.current));
  const editedResult = healthy(engine, reopened);
  metrics(engine, output(), 64 - Math.PI / 8, 136 + 9 * Math.PI / 8, placements[0].min, placements[0].max);
  metrics(engine, source, 64 - 3 * Math.PI / 8, 136 + 25 * Math.PI / 8, sourceMin, sourceMax);
  identity(editedResult, output(), a.sourceFeatureId);
  expect(reopened.features.at(-1)).toEqual(operation); expect(original.features.find(feature => feature.id === profile.id)).toEqual(profile);
  healthy(engine, parseDocument(serializeDocument(history.undo())));
  metrics(engine, output(), 64 - Math.PI / 2, 136 + 5 * Math.PI / 2, placements[0].min, placements[0].max);
  const redone = parseDocument(serializeDocument(history.redo())), redoResult = healthy(engine, redone);
  metrics(engine, output(), 64 - Math.PI / 8, 136 + 9 * Math.PI / 8, placements[0].min, placements[0].max);
  identity(redoResult, output(), a.sourceFeatureId); expect(redone.features.at(-1)).toEqual(operation);
}), 60_000);

it('rejects a missing world-limit policy rather than inferring one or silently copying source geometry', () => fixture(engine => {
  const before = prefix(), initial = healthy(engine, before), operation = withFeaturePatternWorldLimit(pattern('linearPattern', a.sourceFeatureId), source.sourceFeatureId, false);
  const value = parseDocument(serializeDocument(addFeature(before, operation))), result = engine.build(value.features);
  expect(result.featureErrors.map(error => error.id)).toEqual([operation.id]);
  expect(result.featureErrors[0].message).toContain('saved remap policy'); expect(result.bodies).toEqual(initial.bodies);
  expect(() => catalog(engine).resolve(output())).toThrow(); metrics(engine, a, 64, 136, placements[0].min, placements[0].max);
}), 60_000);

it('uses the exact historical limited recipe after its source owner changes, without copying the later cut', () => fixture(engine => {
  const row = placements[0], initialFeatures = [...box('create-S', source.bodyId, sourceMin, sourceMax), ...limitedSeed()];
  const later: Feature[] = [{ id: 'later-profile', type: 'sketch', name: 'Original later tiny hole', suppressed: false, plane: 'XY', offset: -8,
    profile: { kind: 'circle', center: [.75, .75], radius: .1 } },
  { id: 'later-cut', type: 'cut', name: 'Original later source state', suppressed: false, sketchId: 'later-profile', depth: 1, symmetric: false, bodyScope: [{ ...source }] }];
  const before = document([...initialFeatures, ...later, ...box(a.sourceFeatureId, a.bodyId, row.min, row.max)]), operation = pattern('linearPattern', a.sourceFeatureId);
  const result = healthy(engine, parseDocument(serializeDocument(addFeature(before, operation))));
  metrics(engine, output(), 64 - Math.PI / 2, 136 + 5 * Math.PI / 2, row.min, row.max);
  metrics(engine, { bodyId: source.bodyId, sourceFeatureId: 'later-cut' }, 64 - 151 * Math.PI / 100, 136 + 67 * Math.PI / 10, sourceMin, sourceMax);
  expect(() => catalog(engine).resolve(source)).toThrow(); probe(engine, output(), [3.75, .75, -3.5], true);
  identity(result, output(), a.sourceFeatureId); identity(result, { bodyId: source.bodyId, sourceFeatureId: 'later-cut' }, 'create-S');
  expect(operation.featurePattern?.bindings[0].source).toEqual(source);
}), 60_000);

it('rejects a real 90-degree circular instance whose ray is parallel to the fixed world plane, atomically', () => fixture(engine => {
  const row = placements[1], before = prefix(row), initial = healthy(engine, before), operation = pattern('circularPattern', a.sourceFeatureId);
  if (operation.type !== 'circularPattern') throw new Error('Original parallel-ray fixture needs a circular pattern.');
  operation.angle = 90;
  const value = parseDocument(serializeDocument(addFeature(before, operation))), saved = serializeDocument(value), build = vi.spyOn(recipeInstance, 'buildRecipeInstanceTool');
  let result!: CadResult, trace: { address: string; target: string; result: string }[] = [];
  try {
    result = engine.build(value.features);
    trace = build.mock.calls.map(([input], index) => ({ address: input.address, target: input.targetBodyId, result: build.mock.results[index].type }));
  } finally { build.mockRestore(); }
  // Rotation about Y through z=-2 maps start (0,0,-6) to (-4,0,-2)
  // and the +Z ray to +X. It cannot meet the untransformed XY=0 plane.
  expect(trace).toEqual([{ address: '1', target: a.bodyId, result: 'throw' }]);
  expect(result.featureErrors.map(error => error.id)).toEqual([operation.id]);
  expect(result.featureErrors[0].message).toMatch(/parallel|paralel/i); expect(result.bodies).toEqual(initial.bodies);
  expect(serializeDocument(value)).toBe(saved); expect(() => catalog(engine).resolve(output())).toThrow();
  metrics(engine, a, 64, 136, row.min, row.max);
  metrics(engine, source, 64 - 3 * Math.PI / 2, 136 + 13 * Math.PI / 2, sourceMin, sourceMax);
  identity(result, a, a.sourceFeatureId); identity(result, source, 'create-S');
}), 60_000);
