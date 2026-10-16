import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import type { AllFeaturePatternOperation } from '../model/featurePatterns';
import { bodyBoolean, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import * as recipeBridge from './kernel.recipe-instance';
import { withNativeOwners } from './kernel.native-ownership';
import type { BodyReference, Feature, RepetitionFeature, Vec3 } from './kernel.types';

// Original analytical mm fixtures. These exercise the saved ALL declaration
// through the real engine, separately from standalone recipe evaluation and SSR.
// They do not establish interactive preview/Apply or external product fidelity.
const source: BodyReference = { bodyId: 'S', sourceFeatureId: 'seed-cut' };
const a: BodyReference = { bodyId: 'A', sourceFeatureId: 'create-a' };
const b: BodyReference = { bodyId: 'B', sourceFeatureId: 'create-b' };
const c: BodyReference = { bodyId: 'C', sourceFeatureId: 'create-c' };
type Row = { kind: RepetitionFeature['type']; min: Vec3; max: Vec3; center: Vec3 };
const rows: Row[] = [
  { kind: 'linearPattern', min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
  { kind: 'circularPattern', min: [20, -10, 0], max: [30, 0, 8], center: [25, -5, 6] },
  { kind: 'mirror', min: [20, 0, 0], max: [30, 10, 8], center: [25, 5, 6] },
];
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
function fixture(check: (engine: CadEngine) => void): void {
  const engine = new CadEngine(); let failed = false, primary: unknown;
  try { check(engine); } catch (error) { failed = true; primary = error; }
  try { engine.dispose(); } catch (error) {
    throw new AggregateError(failed ? [primary, error] : [error], 'Original ALL engine fixture or cleanup failed.', { cause: failed ? primary : error });
  }
  if (failed) throw primary;
}
function box(id: string, bodyId: string, min: Vec3, max: Vec3): Feature[] {
  return [{ id: id + '-profile', type: 'sketch', name: 'Original rectangle ' + id, suppressed: false, plane: 'XY', offset: min[2],
    profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], width: max[0] - min[0], height: max[1] - min[1] } },
  { id, type: 'extrude', name: 'Original owned box ' + id, suppressed: false, sketchId: id + '-profile', depth: max[2] - min[2],
    symmetric: false, bodyOperation: { mode: 'new', bodyId } }];
}
function document(features: Feature[]): Document { return validateDocument({ ...createDocument('Original dynamic ALL engine acceptance'), features }); }
function prefix(row: Row = rows[0]): Document {
  const features: Feature[] = [...box('create-source', 'S', [0, 0, 0], [10, 10, 4]),
    { id: 'seed-profile', type: 'sketch', name: 'Original unit circle', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [5, 5], radius: 1 } },
    { id: source.sourceFeatureId, type: 'cut', name: 'Original through cut', suppressed: false, sketchId: 'seed-profile', depth: 1,
      symmetric: false, bodyScope: [{ bodyId: 'S', sourceFeatureId: 'create-source' }],
      endCondition: { kind: 'throughAll', baseFeatureId: 'create-source', bothDirections: false } },
    ...box(a.sourceFeatureId, 'A', row.min, row.max), ...box(b.sourceFeatureId, 'B', row.min, row.max),
    ...box(c.sourceFeatureId, 'C', [50, 0, 0], [60, 10, 8])];
  if (row.kind === 'mirror') features.push({ id: 'plane-x15', type: 'plane', name: 'Original X15 mirror plane', suppressed: false,
    support: { kind: 'principal', plane: 'YZ' }, offset: 15, reversed: false });
  return document(features);
}
type AllPattern = RepetitionFeature & { featurePattern: AllFeaturePatternOperation };
function pattern(row: Row, baseFeatureId = c.sourceFeatureId): AllPattern {
  const common = { id: 'saved-all', name: 'Original dynamic ALL cut', suppressed: false, baseFeatureId,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: [source.sourceFeatureId] },
    featurePattern: { mode: 'regenerate' as const, scope: 'all' as const, reevaluateAt: 'patternInput' as const,
      bindings: [{ source: { ...source }, targetBodyIds: 'scope' as const }], referencePolicies: [] as [], variation: { kind: 'none' as const } } };
  if (row.kind === 'linearPattern') return { ...common, type: row.kind, first: { direction: [1, 0, 0], spacing: 20, count: 2 }, second: null, secondSeedOnly: false, skipped: [] };
  if (row.kind === 'circularPattern') return { ...common, type: row.kind, axis: { origin: [15, 0, 0], direction: [0, 0, 1] }, count: 2,
    angle: 180, equalSpacing: false, reversed: false, skipped: [] };
  return { ...common, type: row.kind, support: { kind: 'plane', planeId: 'plane-x15' }, mergeBodies: false };
}
function catalog(engine: CadEngine): NativeBodyCatalog {
  const current = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!current) throw new Error('Expected the real native body catalog.'); return current;
}
function healthy(engine: CadEngine, value: Document) {
  const saved = serializeDocument(value), result = engine.build(value.features);
  expect(result.featureErrors).toEqual([]); expect(result.bodyCatalogActive).toBe(true);
  expect(serializeDocument(value)).toBe(saved); expect(structuredClone(result)).toEqual(result); return result;
}
function metrics(engine: CadEngine, ref: BodyReference, volume: number, area: number, min: Vec3, max: Vec3): void {
  const shape = catalog(engine).resolve(ref).shape; validateBodyShape(shape);
  withNativeOwners(owners => {
    const solids = shape.solids; solids.forEach(solid => owners.own(solid)); expect(solids).toHaveLength(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, index) => side.forEach((value, axis) => expect(Math.abs(bounds[index][axis] - value)).toBeLessThan(1e-6)));
  });
}
function probe(engine: CadEngine, ref: BodyReference, center: Vec3, present: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', catalog(engine).resolve(ref).shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
  });
}
const output = (bodyId: string): BodyReference => ({ bodyId, sourceFeatureId: 'saved-all' });
function unchanged(engine: CadEngine): void {
  metrics(engine, source, 400 - 4 * Math.PI, 360 + 6 * Math.PI, [0, 0, 0], [10, 10, 4]);
  metrics(engine, c, 800, 520, [50, 0, 0], [60, 10, 8]); probe(engine, c, [55, 5, 6], true);
  expect(() => catalog(engine).resolve(output('S'))).toThrow(); expect(() => catalog(engine).resolve(output('C'))).toThrow();
}
it.each(rows)('reopens saved ALL and regenerates independent coincident owners through CadEngine for $kind', row => fixture(engine => {
  const before = prefix(row), operation = pattern(row), declaration = structuredClone(operation.featurePattern);
  const reopened = parseDocument(serializeDocument(addFeature(before, operation))), result = healthy(engine, reopened);
  expect(result.bodies).toHaveLength(4); expect(reopened.features.at(-1)).toEqual(operation);
  expect(Object.hasOwn(operation.featurePattern, 'targets')).toBe(false); expect(operation.featurePattern).toEqual(declaration);
  for (const ref of [a, b]) {
    metrics(engine, output(ref.bodyId), 800 - 8 * Math.PI, 520 + 14 * Math.PI, row.min, row.max); probe(engine, output(ref.bodyId), row.center, false);
    const body = result.bodies!.find(item => item.ref.bodyId === ref.bodyId)!;
    expect(body.ref).toEqual(output(ref.bodyId)); expect(body.createdByFeatureId).toBe(ref.sourceFeatureId);
    expect(body.faces.length).toBeGreaterThan(0); expect(body.edges.length).toBeGreaterThan(0); expect(body.triangles.length).toBeGreaterThan(0);
  }
  unchanged(engine); expect(Math.abs(result.volume - (2800 - 20 * Math.PI))).toBeLessThan(1e-5);
}), 60_000);
it.each(rows)('rebuilds saved ALL against a newly added owner and advanced current A state for $kind', row => fixture(engine => {
  const before = prefix(row), operation = pattern(row), declaration = structuredClone(operation.featurePattern);
  healthy(engine, parseDocument(serializeDocument(addFeature(before, operation))));
  const features: Feature[] = [...before.features,
    { id: 'extend-profile', type: 'sketch', name: 'Original owner extension', suppressed: false, plane: 'XY', offset: 8,
      profile: { kind: 'rectangle', center: [(row.min[0] + row.max[0]) / 2, (row.min[1] + row.max[1]) / 2], width: 10, height: 10 } },
    { id: 'extend-a', type: 'extrude', name: 'Original A state advance', suppressed: false, sketchId: 'extend-profile', depth: 2,
      symmetric: false, bodyOperation: { mode: 'merge', target: a } },
    ...box('create-d', 'D', row.min, [row.max[0], row.max[1], 12])];
  const updated = parseDocument(serializeDocument(addFeature(document(features), { ...operation, baseFeatureId: 'create-d' }))), result = healthy(engine, updated);
  expect(result.bodies).toHaveLength(5); expect((updated.features.at(-1) as AllPattern).featurePattern).toEqual(declaration);
  for (const [id, height, baseArea] of [['A', 10, 600], ['B', 8, 520], ['D', 12, 680]] as const) {
    metrics(engine, output(id), 100 * height - height * Math.PI, baseArea + (2 * height - 2) * Math.PI, row.min, [row.max[0], row.max[1], height]);
    probe(engine, output(id), row.center, false);
  }
  expect(result.bodies!.find(item => item.ref.bodyId === 'A')!.createdByFeatureId).toBe('create-a');
  expect(() => catalog(engine).resolve({ bodyId: 'A', sourceFeatureId: 'extend-a' })).toThrow(); unchanged(engine);
  expect(Math.abs(result.volume - (4200 - 34 * Math.PI))).toBeLessThan(1e-5);
}), 60_000);
it('rebuilds a saved ALL source edit through save/reopen and undo/redo without captured targets', () => fixture(engine => {
  const saved = parseDocument(serializeDocument(addFeature(prefix(), pattern(rows[0])))), history = new DocumentHistory(saved);
  const profile = saved.features.find(feature => feature.id === 'seed-profile');
  if (!profile || profile.type !== 'sketch') throw new Error('Original source circle missing.');
  const edited = updateFeature(saved, profile.id, { ...profile, profile: { kind: 'circle', center: [5, 5], radius: 2 } });
  history.apply(edited); healthy(engine, parseDocument(serializeDocument(history.current)));
  for (const ref of [a, b]) metrics(engine, output(ref.bodyId), 800 - 32 * Math.PI, 520 + 24 * Math.PI, rows[0].min, rows[0].max);
  metrics(engine, source, 400 - 16 * Math.PI, 360 + 8 * Math.PI, [0, 0, 0], [10, 10, 4]);
  healthy(engine, history.undo()); for (const ref of [a, b]) metrics(engine, output(ref.bodyId), 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max);
  healthy(engine, parseDocument(serializeDocument(history.redo())));
  for (const ref of [a, b]) { metrics(engine, output(ref.bodyId), 800 - 32 * Math.PI, 520 + 24 * Math.PI, rows[0].min, rows[0].max); probe(engine, output(ref.bodyId), rows[0].center, false); }
  expect((history.current.features.at(-1) as AllPattern).featurePattern).toEqual((saved.features.at(-1) as AllPattern).featurePattern);
  metrics(engine, c, 800, 520, [50, 0, 0], [60, 10, 8]);
}), 60_000);
it('keeps a no-op ALL poststate repairable in the document but rejects its downstream native use', () => fixture(engine => {
  const before = parseDocument(serializeDocument(addFeature(prefix(), pattern(rows[0])))), initial = healthy(engine, before);
  const after = parseDocument(serializeDocument(document([...before.features,
    { id: 'remote-profile', type: 'sketch', name: 'Original remote cut discriminator', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [55, 5], radius: .5 } },
    { id: 'consume-noop', type: 'cut', name: 'Original unavailable exact poststate', suppressed: false, sketchId: 'remote-profile', depth: 1,
      symmetric: false, bodyScope: [output('C')] }])));
  const preserved = serializeDocument(after), result = engine.build(after.features);
  expect(result.featureErrors.map(error => error.id)).toEqual(['consume-noop']); expect(result.bodies).toEqual(initial.bodies);
  expect(serializeDocument(after)).toBe(preserved); expect(() => engine.export('step', after.features)).toThrow();
  unchanged(engine); for (const ref of [a, b]) metrics(engine, output(ref.bodyId), 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max);
}), 60_000);


it('regenerates saved ALL through the forward owner while retaining an owner behind the unilateral ray', () => fixture(engine => {
  const before = prefix(), sketch = before.features.find(feature => feature.id === 'create-b-profile');
  if (sketch?.type !== 'sketch') throw new Error('Original behind-owner sketch missing.');
  sketch.offset = -10;
  const operation = pattern(rows[0]), saved = parseDocument(serializeDocument(addFeature(before, operation))), result = healthy(engine, saved);
  expect(result.bodies).toHaveLength(4);
  metrics(engine, output('A'), 800 - 8 * Math.PI, 520 + 14 * Math.PI, rows[0].min, rows[0].max);
  probe(engine, output('A'), [25, 5, 6], false);
  metrics(engine, b, 800, 520, [20, 0, -10], [30, 10, -2]); probe(engine, b, [25, 5, -6], true);
  expect(result.bodies!.find(body => body.ref.bodyId === 'B')!.createdByFeatureId).toBe('create-b');
  expect(() => catalog(engine).resolve(output('B'))).toThrow();
  unchanged(engine);
}), 60_000);

it('keeps a later ALL tail split atomic after an earlier instance and a behind-plane no-op', () => fixture(engine => {
  const created = { bodyId: 'S', sourceFeatureId: 'create-source' }, target = { bodyId: 'A', sourceFeatureId: 'create-a' };
  const features: Feature[] = [...box(created.sourceFeatureId, created.bodyId, [0, 0, 0], [10, 4, 2]),
    { id: 'seed-profile', type: 'sketch', name: 'Original through slot', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [1.5, 2], width: 1, height: 2 } },
    { id: source.sourceFeatureId, type: 'cut', name: 'Original through slot', suppressed: false, sketchId: 'seed-profile', depth: 1,
      symmetric: false, bodyScope: [created], endCondition: { kind: 'throughAll', baseFeatureId: created.sourceFeatureId, bothDirections: false } },
    ...box(target.sourceFeatureId, target.bodyId, [0, 0, 0], [8, 4, 4]),
    { id: 'tail-profile', type: 'sketch', name: 'Original attached tail', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [11, 2], width: 6, height: 2 } },
    { id: 'tail', type: 'extrude', name: 'Original attached tail', suppressed: false, sketchId: 'tail-profile', depth: 2,
      symmetric: false, bodyOperation: { mode: 'merge', target } }, ...box(b.sourceFeatureId, b.bodyId, [20, 0, -10], [30, 10, -2])];
  const before = document(features), initial = healthy(engine, before), operation = pattern(rows[0], b.sourceFeatureId);
  if (operation.type !== 'linearPattern') throw new Error('Original linear fixture required.');
  operation.first = { count: 3, direction: [1, 0, 0], spacing: 4 };
  const saved = parseDocument(serializeDocument(addFeature(before, operation))), serialized = serializeDocument(saved);
  const delegate = recipeBridge.buildRecipeInstanceTool; let observedSecond = false;
  const spy = vi.spyOn(recipeBridge, 'buildRecipeInstanceTool').mockImplementation(input => {
    if (input.targetBodyId === 'A' && input.address === '2,0') {
      observedSecond = true;
      withNativeOwners(owners => {
        validateBodyShape(input.workingTarget);
        expect(Math.abs(owners.own(measureShapeVolumeProperties(input.workingTarget)).volume - 144)).toBeLessThan(1e-5);
        expect(Math.abs(owners.own(measureShapeSurfaceProperties(input.workingTarget)).area - 228)).toBeLessThan(1e-5);
      });
    }
    return delegate(input);
  });
  const result = (() => { try { return engine.build(saved.features); } finally { spy.mockRestore(); } })();
  expect(observedSecond).toBe(true);
  expect(result.featureErrors.map(error => error.id)).toEqual([operation.id]);
  expect(result.featureErrors[0].message).toMatch(/sólido|solid|divid/i);
  expect(result.bodies).toEqual(initial.bodies); expect(serializeDocument(saved)).toBe(serialized);
  metrics(engine, source, 76, 144, [0, 0, 0], [10, 4, 2]);
  metrics(engine, { bodyId: 'A', sourceFeatureId: 'tail' }, 152, 208, [0, 0, 0], [14, 4, 4]);
  metrics(engine, b, 800, 520, [20, 0, -10], [30, 10, -2]);
  for (const id of ['S', 'A', 'B']) expect(() => catalog(engine).resolve(output(id))).toThrow();
  expect(() => engine.export('step', saved.features)).toThrow();
}), 60_000);
