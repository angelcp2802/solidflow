import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import type { FeaturePatternOperation } from '../model/featurePatterns';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import type { BodyReference, CadResult, Feature, RepetitionFeature, Vec3 } from './kernel.types';

// Original mm fixtures. This acceptance file targets the explicitly proposed
// saved regenerate declaration; it must not be represented as an executed test
// of the earlier geometry-only schema or standalone evaluator component.
const metricTolerance = 1e-5, coordinateTolerance = 1e-6;
type Kind = 'linearPattern' | 'circularPattern' | 'mirror';
type Mode = 'geometry' | 'regenerate';
type ScopedPattern = RepetitionFeature & { featurePattern: FeaturePatternOperation };
const source: BodyReference = { bodyId: 'recipe-source', sourceFeatureId: 'seed-cut' };
const target: BodyReference = { bodyId: 'recipe-target', sourceFeatureId: 'create-target' };
const untouched: BodyReference = { bodyId: 'recipe-untouched', sourceFeatureId: 'create-untouched' };
const rows: { kind: Kind; min: Vec3; max: Vec3; center: Vec3 }[] = [
  { kind: 'linearPattern', min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
  { kind: 'circularPattern', min: [20, -10, 0], max: [30, 0, 8], center: [25, -5, 6] },
  { kind: 'mirror', min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
];

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

function fixture(check: (engine: CadEngine, own: <T extends { delete(): void }>(value: T) => T) => void): void {
  const engine = new CadEngine(), owners: { delete(): void }[] = [];
  const own = <T extends { delete(): void }>(value: T): T => { owners.push(value); return value; };
  let failed = false, primary: unknown;
  try { check(engine, own); } catch (error) { failed = true; primary = error; }
  const errors: unknown[] = [];
  for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { errors.push(error); }
  try { engine.dispose(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError(failed ? [primary, ...errors] : errors,
    'Original saved recipe fixture or release failed.', { cause: failed ? primary : errors[0] });
  if (failed) throw primary;
}
function box(id: string, bodyId: string, min: Vec3, max: Vec3): Feature[] {
  return [{ id: id + '-profile', type: 'sketch', name: 'Original rectangle ' + id, suppressed: false, plane: 'XY', offset: min[2],
    profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], width: max[0] - min[0], height: max[1] - min[1] } },
  { id, type: 'extrude', name: 'Original box ' + id, suppressed: false, sketchId: id + '-profile', depth: max[2] - min[2],
    symmetric: false, bodyOperation: { mode: 'new', bodyId } }];
}
function circularCut(id: string, owner: BodyReference, center: [number, number], radius: number, throughAll: boolean): Feature[] {
  return [{ id: id + '-profile', type: 'sketch', name: 'Original circle ' + id, suppressed: false, plane: 'XY', offset: 0,
    profile: { kind: 'circle', center, radius } },
  { id, type: 'cut', name: 'Original scoped cut ' + id, suppressed: false, sketchId: id + '-profile', depth: throughAll ? 1 : 4,
    symmetric: false, bodyScope: [{ ...owner }], ...(throughAll ? { endCondition: {
      kind: 'throughAll' as const, baseFeatureId: owner.sourceFeatureId, bothDirections: false,
    } } : {}) }];
}
function document(features: Feature[]): Document { return validateDocument({ ...createDocument('Original saved recipe acceptance'), features }); }
function prefix(row = rows[0], withUntouched = true): Document {
  const features: Feature[] = [...box('create-source', source.bodyId, [0, 0, 0], [10, 10, 4]),
    ...circularCut('seed-cut', { bodyId: source.bodyId, sourceFeatureId: 'create-source' }, [5, 5], 1, true),
    ...box('create-target', target.bodyId, row.min, row.max)];
  if (withUntouched) features.push(...box('create-untouched', untouched.bodyId, row.min, row.max));
  if (row.kind === 'mirror') features.push({ id: 'mirror-x15', type: 'plane', name: 'Original X15 datum', suppressed: false,
    support: { kind: 'principal', plane: 'YZ' }, offset: 15, reversed: false });
  return document(features);
}
function pattern(kind: Kind, mode: Mode, baseFeatureId: string, targets: BodyReference[] = [target],
  sources: BodyReference[] = [source], id = 'saved-recipe-pattern'): ScopedPattern {
  const routes = sources.map(ref => ({ source: { ...ref }, targetBodyIds: targets.map(value => value.bodyId) }));
  const featurePattern: FeaturePatternOperation = mode === 'geometry'
    ? { mode, targets: structuredClone(targets), bindings: routes }
    : { mode, scope: 'selected', targets: structuredClone(targets), bindings: routes, referencePolicies: [], variation: { kind: 'none' } };
  const common = { id, name: 'Original saved ' + mode, suppressed: false, baseFeatureId,
    source: { mode: 'features' as const, geometryPattern: mode === 'geometry', featureIds: [...new Set(sources.map(value => value.sourceFeatureId))] }, featurePattern };
  if (kind === 'linearPattern') return { ...common, type: kind, first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [] };
  if (kind === 'circularPattern') return { ...common, type: kind, axis: { origin: [15, 0, 0], direction: [0, 0, 1] }, count: 2,
    angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  return { ...common, type: kind, support: { kind: 'plane', planeId: 'mirror-x15' }, mergeBodies: false };
}
function lastSolid(value: Document): string {
  const feature = [...value.features].reverse().find(item => !['sketch', 'plane'].includes(item.type));
  if (!feature) throw new Error('Original fixture has no solid producer.'); return feature.id;
}
function active(engine: CadEngine): NativeBodyCatalog {
  const value = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!value) throw new Error('Expected the explicit native body catalog.'); return value;
}
function healthy(engine: CadEngine, value: Document): CadResult {
  const saved = serializeDocument(value), result = engine.build(value.features);
  expect(result.featureErrors).toEqual([]); expect(result.bodyCatalogActive).toBe(true);
  expect(serializeDocument(value)).toBe(saved); expect(structuredClone(result)).toEqual(result); return result;
}
function metrics(engine: CadEngine, ref: BodyReference, volume: number, area: number, min: Vec3, max: Vec3,
  own: <T extends { delete(): void }>(value: T) => T): void {
  const shape = active(engine).resolve(ref).shape;
  validateBodyShape(shape); const solids = shape.solids; solids.forEach(own); expect(solids).toHaveLength(1);
  expect(Math.abs(own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(metricTolerance);
  expect(Math.abs(own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(metricTolerance);
  const bounds = own(shape.boundingBox).bounds;
  [min, max].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(coordinateTolerance)));
}
function probe(engine: CadEngine, ref: BodyReference, center: Vec3, present: boolean,
  own: <T extends { delete(): void }>(value: T) => T): void {
  const cube = own(makeBox(center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3));
  const common = own(bodyBoolean('common', active(engine).resolve(ref).shape, cube));
  expect(Math.abs(own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
}
function expectIdentity(result: CadResult, ref: BodyReference, creator: string): void {
  const body = result.bodies?.find(value => value.ref.bodyId === ref.bodyId);
  expect(body?.ref).toEqual(ref); expect(body?.createdByFeatureId).toBe(creator);
  expect(body?.triangles.length).toBeGreaterThan(0); expect(body?.faces.length).toBeGreaterThan(0); expect(body?.edges.length).toBeGreaterThan(0);
}
function rejected(engine: CadEngine, before: Document, feature: ScopedPattern): CadResult {
  const initial = healthy(engine, before), value = parseDocument(serializeDocument(addFeature(before, feature)));
  const saved = serializeDocument(value), result = engine.build(value.features);
  expect(result.featureErrors.map(error => error.id)).toEqual([feature.id]); expect(result.bodies).toEqual(initial.bodies);
  expect(serializeDocument(value)).toBe(saved); expect(() => engine.export('step', value.features)).toThrow(); return result;
}

for (const mode of ['geometry', 'regenerate'] as const) it.each(rows)('distinguishes saved ' + mode + ' on a taller target for $kind', row => fixture((engine, own) => {
  const before = prefix(row), initial = healthy(engine, before), operation = pattern(row.kind, mode, lastSolid(before));
  const saved = parseDocument(serializeDocument(addFeature(before, operation))), result = healthy(engine, saved);
  expect(saved.features.at(-1)).toEqual(operation); expect(result.bodies).toHaveLength(3);
  const after = { bodyId: target.bodyId, sourceFeatureId: operation.id }, regenerated = mode === 'regenerate';
  metrics(engine, after, 800 - (regenerated ? 8 : 4) * Math.PI, 520 + (regenerated ? 14 : 8) * Math.PI, row.min, row.max, own);
  expectIdentity(result, after, target.sourceFeatureId);
  metrics(engine, source, 400 - 4 * Math.PI, 360 + 6 * Math.PI, [0, 0, 0], [10, 10, 4], own);
  metrics(engine, untouched, 800, 520, row.min, row.max, own);
  expect(result.bodies?.find(body => body.ref.bodyId === untouched.bodyId)).toEqual(initial.bodies?.find(body => body.ref.bodyId === untouched.bodyId));
  probe(engine, after, row.center, !regenerated, own); probe(engine, after, [row.center[0], row.center[1], 2], false, own);
  expect(Math.abs(result.volume - (2000 - (regenerated ? 12 : 8) * Math.PI))).toBeLessThan(metricTolerance);
}), 60_000);

it('regenerates from an exact historical source after that owner receives another operation', () => fixture((engine, own) => {
  const before = prefix(), later = circularCut('later-cut', source, [2, 2], .5, false);
  const changed = document([...before.features, ...later]), operation = pattern('linearPattern', 'regenerate', 'later-cut');
  const result = healthy(engine, parseDocument(serializeDocument(addFeature(changed, operation))));
  metrics(engine, { bodyId: target.bodyId, sourceFeatureId: operation.id }, 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max, own);
  const actualSource = { bodyId: source.bodyId, sourceFeatureId: 'later-cut' };
  metrics(engine, actualSource, 400 - 5 * Math.PI, 360 + 9.5 * Math.PI, [0, 0, 0], [10, 10, 4], own);
  expectIdentity(result, actualSource, 'create-source');
  probe(engine, { bodyId: target.bodyId, sourceFeatureId: operation.id }, [22, 2, 2], true, own);
  expect(() => active(engine).resolve(source)).toThrow();
}), 60_000);

it('retains an exact source for regeneration after Combine consumes that owner', () => fixture((engine, own) => {
  const before = prefix(), tool = { bodyId: 'join-owner', sourceFeatureId: 'create-join' };
  const consumed = document([...before.features, ...box(tool.sourceFeatureId, tool.bodyId, [9, 0, 0], [12, 10, 4]),
    { id: 'consume-source', type: 'combine', name: 'Original source consumption', suppressed: false,
      operation: 'add', operands: [source, tool], resultBodyId: 'combined-owner', keepTools: false }]);
  const operation = pattern('linearPattern', 'regenerate', 'consume-source'), result = healthy(engine, addFeature(consumed, operation));
  expect(result.bodies?.map(body => body.ref.bodyId).sort()).toEqual(['combined-owner', target.bodyId, untouched.bodyId].sort());
  expect(() => active(engine).resolve(source)).toThrow(); expect(() => active(engine).resolve(tool)).toThrow();
  metrics(engine, { bodyId: target.bodyId, sourceFeatureId: operation.id }, 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max, own);
  metrics(engine, { bodyId: 'combined-owner', sourceFeatureId: 'consume-source' }, 480 - 4 * Math.PI, 416 + 6 * Math.PI, [0, 0, 0], [12, 10, 4], own);
}), 60_000);

it('rejects an old target state while retaining a valid historical source', () => fixture((engine, own) => {
  const before = prefix(), features: Feature[] = [...before.features,
    { id: 'target-boss-profile', type: 'sketch', name: 'Original target state change', suppressed: false, plane: 'XY', offset: 8,
      profile: { kind: 'rectangle', center: [22, 2], width: 2, height: 2 } },
    { id: 'target-boss', type: 'extrude', name: 'Original target boss', suppressed: false, sketchId: 'target-boss-profile', depth: 1,
      symmetric: false, bodyOperation: { mode: 'merge', target } }];
  const result = rejected(engine, document(features), pattern('linearPattern', 'regenerate', 'target-boss'));
  expect(result.featureErrors[0].message).toMatch(/estado|state|changed|exact|current/i);
  metrics(engine, { bodyId: target.bodyId, sourceFeatureId: 'target-boss' }, 804, 528, [20, 0, 0], [30, 10, 9], own);
}), 60_000);

function remotePrefix(): Document {
  return document([...prefix(rows[0], false).features, ...box('create-untouched', untouched.bodyId, [50, 0, 0], [60, 10, 8])]);
}
it('advances only the target changed by regeneration and preserves the routed no-op owner', () => fixture((engine, own) => {
  const before = remotePrefix(), operation = pattern('linearPattern', 'regenerate', lastSolid(before), [target, untouched]);
  const result = healthy(engine, addFeature(before, operation));
  metrics(engine, { bodyId: target.bodyId, sourceFeatureId: operation.id }, 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max, own);
  metrics(engine, untouched, 800, 520, [50, 0, 0], [60, 10, 8], own); expectIdentity(result, untouched, untouched.sourceFeatureId);
  expect(() => active(engine).resolve({ bodyId: untouched.bodyId, sourceFeatureId: operation.id })).toThrow();
}), 60_000);

it('rejects a complete no-op recipe instance without a false target state', () => fixture((engine, own) => {
  const before = remotePrefix(), operation = pattern('linearPattern', 'regenerate', lastSolid(before), [untouched]);
  const result = rejected(engine, before, operation);
  expect(result.featureErrors[0].message).toContain('changes no material');
  metrics(engine, untouched, 800, 520, [50, 0, 0], [60, 10, 8], own);
  expect(() => active(engine).resolve({ bodyId: untouched.bodyId, sourceFeatureId: operation.id })).toThrow();
}), 60_000);

it('does not materialize an unchanged potential pattern output for a later geometry consumer', () => fixture((engine, own) => {
  const before = remotePrefix(), first = pattern('linearPattern', 'regenerate', lastSolid(before), [target, untouched]);
  const afterFirst = addFeature(before, first), ghost = { bodyId: untouched.bodyId, sourceFeatureId: first.id };
  const second = pattern('linearPattern', 'geometry', first.id, [untouched], [ghost], 'consume-potential-noop');
  const result = rejected(engine, afterFirst, second);
  expect(result.featureErrors[0].message).toMatch(/aportaci|histor|material|exact/i);
  metrics(engine, { bodyId: target.bodyId, sourceFeatureId: first.id }, 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max, own);
  metrics(engine, untouched, 800, 520, [50, 0, 0], [60, 10, 8], own);
}), 60_000);

it('rebuilds a saved recipe after source edit, undo and redo without mutating the document', () => fixture((engine, own) => {
  const before = prefix(), operation = pattern('linearPattern', 'regenerate', lastSolid(before));
  const saved = parseDocument(serializeDocument(addFeature(before, operation))), history = new DocumentHistory(saved);
  const original = saved.features.find(feature => feature.id === 'seed-cut-profile');
  if (!original || original.type !== 'sketch') throw new Error('Original circular source profile missing.');
  const edited = updateFeature(saved, original.id, { ...original, profile: { kind: 'circle', center: [5, 5], radius: 2 } });
  history.apply(edited); healthy(engine, parseDocument(serializeDocument(history.current)));
  const resultRef = { bodyId: target.bodyId, sourceFeatureId: operation.id };
  metrics(engine, resultRef, 800 - 32 * Math.PI, 520 + 24 * Math.PI, rows[0].min, rows[0].max, own);
  healthy(engine, history.undo()); metrics(engine, resultRef, 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max, own);
  healthy(engine, parseDocument(serializeDocument(history.redo())));
  metrics(engine, resultRef, 800 - 32 * Math.PI, 520 + 24 * Math.PI, rows[0].min, rows[0].max, own);
}), 60_000);

it('rejects a late regenerated tail split without publishing the earlier address result', () => fixture((engine, own) => {
  const owner = { bodyId: 'tail-owner', sourceFeatureId: 'create-tail-owner' };
  const features: Feature[] = [...box(owner.sourceFeatureId, owner.bodyId, [0, 0, 0], [8, 4, 4]),
    { id: 'tail-profile', type: 'sketch', name: 'Original tail', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [11, 2], width: 6, height: 4 } },
    { id: 'tail', type: 'extrude', name: 'Original attached tail', suppressed: false, sketchId: 'tail-profile', depth: 2, symmetric: false,
      bodyOperation: { mode: 'merge', target: owner } },
    { id: 'slot-profile', type: 'sketch', name: 'Original slot', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [1.5, 2], width: 1, height: 4 } },
    { id: 'slot', type: 'cut', name: 'Original slot seed', suppressed: false, sketchId: 'slot-profile', depth: 2, symmetric: false,
      bodyScope: [{ bodyId: owner.bodyId, sourceFeatureId: 'tail' }] }];
  const exact = { bodyId: owner.bodyId, sourceFeatureId: 'slot' }, operation = pattern('linearPattern', 'regenerate', 'slot', [exact], [exact]);
  if (operation.type !== 'linearPattern') throw new Error('Original linear recipe required.');
  operation.first = { direction: [1, 0, 0], spacing: 4, count: 3 };
  const result = rejected(engine, document(features), operation);
  expect(result.featureErrors[0].message).toMatch(/sólido|solid|divid/i);
  metrics(engine, exact, 168, 244, [0, 0, 0], [14, 4, 4], own);
}), 60_000);

it('rejects geometryPattern false without the explicit saved regeneration declaration', () => fixture(engine => {
  const before = prefix(), legacy: RepetitionFeature = structuredClone(pattern('linearPattern', 'regenerate', lastSolid(before)));
  delete legacy.featurePattern;
  const raw = { ...createDocument('Original undeclared regeneration rejection'), features: [...before.features, legacy] };
  expect(() => parseDocument(JSON.stringify(raw))).toThrow();
  const initial = healthy(engine, before), result = engine.build(raw.features);
  expect(result.featureErrors.map(error => error.id)).toEqual([legacy.id]);
  expect(result.bodies).toEqual(initial.bodies);
  expect(() => engine.export('step', raw.features)).toThrow();
}), 60_000);

it('diagnoses pending creation-output identities rather than reinterpreting a creation recipe as merge', () => fixture(engine => {
  const before = prefix(), creationSource = { bodyId: source.bodyId, sourceFeatureId: 'create-source' };
  const result = rejected(engine, before, pattern('linearPattern', 'regenerate', lastSolid(before), [target], [creationSource]));
  expect(result.featureErrors[0].message).toContain('saved role-address identities');
  expect(active(engine).entries()).toHaveLength(3);
  expect(() => active(engine).resolve({ bodyId: target.bodyId, sourceFeatureId: 'saved-recipe-pattern' })).toThrow();
}), 60_000);

function dependentPrefix(noOpParent: boolean): Document {
  const width = noOpParent ? 12 : 10, height = noOpParent ? 8 : 10, bossHeight = noOpParent ? 2 : 4;
  const center: [number, number] = noOpParent ? [-17, 4] : [-15, 5];
  const parent = { bodyId: source.bodyId, sourceFeatureId: 'recipe-parent' };
  const features: Feature[] = [...box('create-source', source.bodyId, [-20, 0, 0], [-20 + width, height, 4]),
    { id: 'parent-profile', type: 'sketch', name: 'Original selected boss', suppressed: false, plane: 'XY', offset: 4,
      profile: { kind: 'rectangle', center, width: 2, height: 2 } },
    { id: parent.sourceFeatureId, type: 'extrude', name: 'Original selected parent', suppressed: false, sketchId: 'parent-profile',
      depth: bossHeight, symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: source.bodyId, sourceFeatureId: 'create-source' } } },
    { id: 'child-profile', type: 'sketch', name: 'Original selected child', suppressed: false, plane: 'XY', offset: noOpParent ? 6 : 0,
      profile: { kind: 'circle', center, radius: .5 } },
    { id: 'recipe-child', type: 'cut', name: 'Original selected dependent cut', suppressed: false, sketchId: 'child-profile',
      depth: noOpParent ? -2 : 1, symmetric: false, bodyScope: [parent],
      ...(noOpParent ? {} : { endCondition: { kind: 'throughAll' as const, baseFeatureId: parent.sourceFeatureId, bothDirections: false } }) },
    ...box('create-target', target.bodyId, [0, 0, 0], [width, height, 4])];
  if (noOpParent) features.push({ id: 'target-boss-profile', type: 'sketch', name: 'Original existing target boss', suppressed: false, plane: 'XY', offset: 4,
    profile: { kind: 'rectangle', center: [3, 4], width: 2, height: 2 } },
  { id: 'target-boss', type: 'extrude', name: 'Original target parent no-op material', suppressed: false, sketchId: 'target-boss-profile', depth: 2,
    symmetric: false, bodyOperation: { mode: 'merge', target } });
  return document(features);
}

it('replays selected operations in history order and terminates the child against its updated owner', () => fixture((engine, own) => {
  const before = dependentPrefix(false), parent = { bodyId: source.bodyId, sourceFeatureId: 'recipe-parent' },
    child = { bodyId: source.bodyId, sourceFeatureId: 'recipe-child' };
  const operation = pattern('linearPattern', 'regenerate', lastSolid(before), [target], [child, parent]);
  const result = healthy(engine, parseDocument(serializeDocument(addFeature(before, operation))));
  const output = { bodyId: target.bodyId, sourceFeatureId: operation.id };
  metrics(engine, output, 416 - 2 * Math.PI, 392 + 7.5 * Math.PI, [0, 0, 0], [10, 10, 8], own);
  metrics(engine, child, 416 - 2 * Math.PI, 392 + 7.5 * Math.PI, [-20, 0, 0], [-10, 10, 8], own);
  probe(engine, output, [5, 5, 6], false, own); probe(engine, output, [4.25, 5, 6], true, own);
  expectIdentity(result, output, 'create-target'); expect(result.bodies).toHaveLength(2);
}), 60_000);

it('retains a selected parent no-op semantic role for its real dependent child', () => fixture((engine, own) => {
  const before = dependentPrefix(true), parent = { bodyId: source.bodyId, sourceFeatureId: 'recipe-parent' },
    child = { bodyId: source.bodyId, sourceFeatureId: 'recipe-child' }, currentTarget = { bodyId: target.bodyId, sourceFeatureId: 'target-boss' };
  const operation = pattern('linearPattern', 'regenerate', lastSolid(before), [currentTarget], [child, parent]);
  const result = healthy(engine, addFeature(before, operation)), output = { bodyId: target.bodyId, sourceFeatureId: operation.id };
  // r=.5, h=2 removes π/2. The removed top and added pocket bottom cancel.
  metrics(engine, output, 392 - Math.PI / 2, 368 + 2 * Math.PI, [0, 0, 0], [12, 8, 6], own);
  probe(engine, output, [3, 4, 5], false, own); probe(engine, output, [3, 4, 3], true, own);
  expectIdentity(result, output, 'create-target');
  expect(() => active(engine).resolve({ bodyId: target.bodyId, sourceFeatureId: parent.sourceFeatureId })).toThrow();
}), 60_000);
