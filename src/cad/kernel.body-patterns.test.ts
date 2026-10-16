import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, isShape3D, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { reconcileBodyPatternDraft } from '../model/bodyPatterns';
import { CadEngine } from './kernel.engine';
import type { NativeBodyCatalog } from './kernel.bodies';
import type { BodyReference, CadResult, CircularPatternFeature, Feature, LinearPatternFeature, MirrorFeature, PickableBody, RepetitionFeature, Vec3 } from './kernel.types';

// Original Cartesian fixtures, in millimeters. Expectations use box formulas
// V=xyz, A=2(xy+xz+yz), plus explicit translations, quarter turns and reflection.
// No expected geometry is constructed by the CAD kernel or pattern planner.
// STEP checks are same-kernel round trips, not independent interoperability or
// a claim that opaque document IDs survive an exported exchange format.
const engine = new CadEngine(), tolerance = 5e-6, coordinateTolerance = 5e-7;
type Bounds = number[][];
type Metrics = { volume: number; area: number; bounds: Bounds; solids: number };
type Slot = { seedBodyId: string; address: string; bodyId: string; retired: boolean };
type BodySources = { mode: 'bodies'; scope: 'current' | 'historical'; bodies: BodyReference[] };
type BodyPattern = { mode: 'new'; instances: Slot[] } | { mode: 'merge'; target: BodyReference };
type ExplicitLinear = Omit<LinearPatternFeature, 'source' | 'bodyPattern'> & { source: BodySources; bodyPattern: BodyPattern };
type ExplicitCircular = Omit<CircularPatternFeature, 'source' | 'bodyPattern'> & { source: BodySources; bodyPattern: BodyPattern };
type ExplicitMirror = Omit<MirrorFeature, 'source' | 'bodyPattern'> & { source: BodySources; bodyPattern: BodyPattern };
const a: BodyReference = { bodyId: 'pattern-body-a', sourceFeatureId: 'create-a' };
const b: BodyReference = { bodyId: 'pattern-body-b', sourceFeatureId: 'create-b' };
const u: BodyReference = { bodyId: 'pattern-unselected', sourceFeatureId: 'create-u' };
const currentA: BodyReference = { ...a, sourceFeatureId: 'grow-a' };
const unrelated: Metrics = { volume: 30, area: 62, bounds: [[30, -6, 1], [35, -4, 4]], solids: 1 };
const gridAddresses = ['1,0', '2,0', '0,1', '1,1', '2,1'];

it.each(['linearPattern', 'circularPattern', 'mirror'] as const)('enforces the raw %s declaration boundary before geometry lookup', type => {
  const common = { id: 'raw-pattern', name: 'Original raw declaration boundary', suppressed: false, baseFeatureId: 'missing-base',
    source: { mode: 'bodies' as const, scope: 'current' as const, bodies: [a] }, bodyPattern: { mode: 'new' as const, instances: [] } };
  const draft: RepetitionFeature = type === 'linearPattern'
    ? { ...common, type, first: { direction: [1, 0, 0], count: 2, spacing: 10 }, second: null, secondSeedOnly: false, skipped: [] }
    : type === 'circularPattern' ? { ...common, type, count: 2, angle: 180, equalSpacing: true, reversed: false, skipped: [],
      axis: { origin: [0, 0, 0], direction: [0, 0, 1] } }
      : { ...common, type, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
  const valid = reconcileBodyPatternDraft(draft, () => 'raw-copy');
  const missing = { ...valid } as Record<string, unknown>; delete missing.bodyPattern;
  const missingSource = { ...valid } as Record<string, unknown>; delete missingSource.source;
  const sparse = new Array(1);
  const malformed: unknown[] = [
    { ...valid, source: null }, { ...valid, source: undefined }, missing,
    { ...valid, bodyPattern: undefined }, { ...valid, bodyPattern: null }, { ...valid, bodyPattern: [] },
    { ...valid, bodyPattern: { mode: 'unknown' } },
    { ...valid, bodyPattern: { mode: 'new', instances: sparse } },
    { ...valid, bodyPattern: { mode: 'new', instances: [], extra: true } },
    Object.assign(Object.create({ bodyPattern: valid.bodyPattern }), missing),
    Object.assign(Object.create({ source: valid.source }), missingSource),
    { ...valid, source: { mode: 'bodies', scope: 'unknown', bodies: [a] } },
    { ...valid, source: { mode: 'bodies', scope: 'current', bodies: [a, { ...a, sourceFeatureId: 'different-state' }] } },
  ];
  for (const raw of malformed) {
    const result = engine.build([raw as Feature]);
    expect(result.featureErrors).toHaveLength(1);
    expect(result.featureErrors[0].id).toBe(valid.id);
    expect(result.featureErrors[0].message).not.toMatch(/predecesor|catálogo|operación base/);
    expect(result.bodies ?? []).toEqual([]);
    expect(result.bodyCatalogActive).toBe(false);
    expect(() => engine.export('step')).toThrow();
  }
  if (valid.type === 'mirror') for (const face of [null, undefined]) {
    const result = engine.build([{ ...valid, support: { kind: 'face', face } } as unknown as Feature]);
    expect(result.featureErrors.map(error => error.id)).toEqual([valid.id]);
    expect(() => engine.export('step')).toThrow();
  }
}, 60_000);

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => engine.dispose());

function box(ref: BodyReference, min: Vec3, max: Vec3): Feature[] {
  const sketchId = `sketch-${ref.sourceFeatureId}`;
  return [
    { id: sketchId, type: 'sketch', name: `Original rectangle ${ref.bodyId}`, plane: 'XY', offset: min[2],
      profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
        width: max[0] - min[0], height: max[1] - min[1] }, suppressed: false },
    { id: ref.sourceFeatureId, type: 'extrude', name: `Original body ${ref.bodyId}`, sketchId,
      depth: max[2] - min[2], symmetric: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId }, suppressed: false },
  ];
}
function document(features: Feature[]): Document {
  return validateDocument({ ...createDocument('Original analytical explicit body patterns'), features });
}
function asymmetricBodies(grown = false): Document {
  const features = [
    ...box(a, [1, 2, 0], [3, 5, 4]),
    ...box(b, [5, -7, 1], [6, -5, 4]),
    ...box(u, [30, -6, 1], [35, -4, 4]),
  ];
  if (grown) features.push(
    { id: 'growth-sketch', type: 'sketch', name: 'Original A height extension', plane: 'XY', offset: 4,
      profile: { kind: 'rectangle', center: [2, 3.5], width: 2, height: 3 }, suppressed: false },
    { id: 'grow-a', type: 'extrude', name: 'Extend A from Z4 to Z6', sketchId: 'growth-sketch', depth: 2,
      symmetric: false, bodyOperation: { mode: 'merge', target: { ...a } }, suppressed: false },
  );
  return document(features);
}
function slots(prefix: string, seeds: readonly BodyReference[], addresses: readonly string[]): Slot[] {
  return seeds.flatMap((seed, seedIndex) => addresses.map((address, index) => ({
    seedBodyId: seed.bodyId, address, bodyId: `${prefix}-seed-${seedIndex}-slot-${index}`, retired: false,
  })));
}
function linear(id: string, baseFeatureId: string, seeds: BodyReference[], addresses = ['1,0', '2,0']): ExplicitLinear {
  return { id, type: 'linearPattern', name: 'Original explicit linear copies', suppressed: false, baseFeatureId,
    source: { mode: 'bodies', scope: 'current', bodies: structuredClone(seeds) },
    bodyPattern: { mode: 'new', instances: slots(id, seeds, addresses) },
    first: { direction: [2, 0, 0], spacing: 10, count: 3 }, second: null, secondSeedOnly: false, skipped: [] };
}
function slot(feature: { bodyPattern: BodyPattern }, seedBodyId: string, address: string): Slot {
  if (feature.bodyPattern.mode !== 'new') throw new Error('Expected a saved new-body instance.');
  const matches = feature.bodyPattern.instances.filter(item => !item.retired && item.seedBodyId === seedBodyId && item.address === address);
  expect(matches).toHaveLength(1); return matches[0];
}
function outputRef(feature: { id: string; bodyPattern: BodyPattern }, seedBodyId: string, address: string): BodyReference {
  return { bodyId: slot(feature, seedBodyId, address).bodyId, sourceFeatureId: feature.id };
}
function body(result: CadResult, id: string): PickableBody {
  const matches = result.bodies?.filter(item => item.ref.bodyId === id);
  expect(matches).toHaveLength(1); return matches![0];
}
function healthy(value: Document): CadResult {
  const before = serializeDocument(value), result = engine.build(value.features);
  expect(serializeDocument(value)).toBe(before);
  expect(result.featureErrors).toEqual([]); expect(result.bodyCatalogActive).toBe(true);
  expect(structuredClone(result)).toEqual(result);
  return result;
}
function expectBounds(actual: Bounds, wanted: Bounds) {
  actual.forEach((side, i) => side.forEach((coordinate, j) =>
    expect(Math.abs(coordinate - wanted[i][j])).toBeLessThan(coordinateTolerance)));
}
function measure(shape: Shape3D): Metrics {
  const owners: { delete(): void }[] = [];
  function own<T extends { delete(): void }>(value: T): T { owners.push(value); return value; }
  try {
    const oc = getOC(), analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const solids = shape.solids; solids.forEach(own);
    for (const solid of solids) {
      const explorer = own(new oc.TopExp_Explorer(solid.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      let shells = 0;
      while (explorer.More()) {
        const shell = own(explorer.Current()); expect(oc.BRep_Tool.IsClosed(shell)).toBe(true);
        shells++; explorer.Next();
      }
      expect(shells).toBeGreaterThan(0);
    }
    const mass = own(new oc.GProp_GProps()), surface = own(measureShapeSurfaceProperties(shape)), bounds = own(shape.boundingBox);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    return { volume: mass.Mass(), area: surface.area, bounds: bounds.bounds, solids: solids.length };
  } finally {
    const errors: unknown[] = [];
    for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Original body-pattern measurement release failed.');
  }
}
function expectMetrics(actual: Metrics, wanted: Metrics) {
  expect(actual.solids).toBe(wanted.solids);
  expect(Math.abs(actual.volume - wanted.volume)).toBeLessThan(tolerance);
  expect(Math.abs(actual.area - wanted.area)).toBeLessThan(tolerance);
  expectBounds(actual.bounds, wanted.bounds);
}
function expectBody(result: CadResult, ref: BodyReference, wanted: Metrics, creator = ref.sourceFeatureId) {
  const displayed = body(result, ref.bodyId);
  expect(displayed.ref).toEqual(ref); expect(displayed.createdByFeatureId).toBe(creator);
  expect(Math.abs(displayed.volume - wanted.volume)).toBeLessThan(tolerance);
  expectBounds([displayed.bounds.min, displayed.bounds.max], wanted.bounds);
  expect(displayed.triangles.length).toBeGreaterThan(0);
  expect(displayed.faces.length).toBeGreaterThan(0); expect(displayed.edges.length).toBeGreaterThan(0);
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  expect(catalog).not.toBeNull();
  expectMetrics(measure(catalog!.resolve(ref).shape), wanted);
}
function expectAggregate(result: CadResult, wanted: Metrics) {
  expect(result.bodies).toHaveLength(wanted.solids);
  expect(Math.abs(result.volume - wanted.volume)).toBeLessThan(tolerance);
  expectBounds([result.bounds.min, result.bounds.max], wanted.bounds);
  const shape = (engine as unknown as { shape: Shape3D | null }).shape;
  expect(shape).not.toBeNull(); expectMetrics(measure(shape!), wanted);
}
async function exported(value: Document, wanted: Metrics) {
  const imported = await importSTEP(engine.export('step', value.features));
  try {
    expect(isShape3D(imported)).toBe(true);
    if (!isShape3D(imported)) throw new Error('Expected closed native STEP geometry.');
    expectMetrics(measure(imported), wanted);
  } finally { imported.delete(); }
}

it.each(['current', 'historical'] as const)('copies two exact %s seeds into a skipped grid without adopting the scene aggregate', async scope => {
  const original = asymmetricBodies(true), initial = healthy(original);
  const selected = scope === 'current' ? [currentA, b] : [a, b];
  const feature = linear('linear-grid', 'grow-a', selected, gridAddresses);
  feature.source.scope = scope;
  feature.second = { direction: [0, 3, 0], spacing: 8, count: 2 }; feature.skipped = [[2, 1]];
  const saved = addFeature(original, feature), reopened = parseDocument(serializeDocument(saved));
  expect(reopened.features.at(-1)).toEqual(feature);
  const result = healthy(reopened), height = scope === 'current' ? 6 : 4;
  const seedVolume = scope === 'current' ? 36 : 24, seedArea = scope === 'current' ? 72 : 52;
  const positions = [
    { address: '1,0', a: [[11, 2, 0], [13, 5, height]], b: [[15, -7, 1], [16, -5, 4]] },
    { address: '2,0', a: [[21, 2, 0], [23, 5, height]], b: [[25, -7, 1], [26, -5, 4]] },
    { address: '0,1', a: [[1, 10, 0], [3, 13, height]], b: [[5, 1, 1], [6, 3, 4]] },
    { address: '1,1', a: [[11, 10, 0], [13, 13, height]], b: [[15, 1, 1], [16, 3, 4]] },
  ];
  for (const position of positions) {
    expectBody(result, outputRef(feature, a.bodyId, position.address), { volume: seedVolume, area: seedArea, bounds: position.a, solids: 1 });
    expectBody(result, outputRef(feature, b.bodyId, position.address), { volume: 6, area: 22, bounds: position.b, solids: 1 });
  }
  for (const seed of [a, b]) expect(result.bodies?.some(item => item.ref.bodyId === slot(feature, seed.bodyId, '2,1').bodyId)).toBe(false);
  for (const unchanged of [a, b, u]) expect(body(result, unchanged.bodyId)).toEqual(body(initial, unchanged.bodyId));
  const wanted = { volume: scope === 'current' ? 240 : 192, area: scope === 'current' ? 532 : 452,
    bounds: [[1, -7, 0], [35, 13, 6]], solids: 11 };
  expectAggregate(result, wanted); await exported(reopened, wanted);
}, 60_000);

it.each([false, true])('places asymmetric circular copies about an offset axis, reversed=%s, with saved omitted slots', async reversed => {
  const original = document([...box(a, [4, 1, 0], [6, 4, 2]), ...box(u, [30, -6, 1], [35, -4, 4])]);
  const initial = healthy(original);
  const feature: ExplicitCircular = { id: 'circular', type: 'circularPattern', name: 'Original offset-axis quarter turns',
    suppressed: false, baseFeatureId: u.sourceFeatureId, source: { mode: 'bodies', scope: 'current', bodies: [a] },
    bodyPattern: { mode: 'new', instances: slots('circular', [a], ['1', '2', '3']) },
    axis: { origin: [1, -2, 0], direction: [0, 0, 2] }, count: 4, angle: 360, equalSpacing: true,
    reversed, skipped: reversed ? [2] : [] };
  const saved = parseDocument(serializeDocument(addFeature(original, feature))), result = healthy(saved);
  // Rotation relative to (1,-2): (+90) maps (dx,dy) to (-dy,dx).
  const positive = [
    { address: '1', bounds: [[-5, 1, 0], [-2, 3, 2]] },
    { address: '2', bounds: [[-4, -8, 0], [-2, -5, 2]] },
    { address: '3', bounds: [[4, -7, 0], [7, -5, 2]] },
  ];
  const negative = [
    { address: '1', bounds: [[4, -7, 0], [7, -5, 2]] },
    { address: '3', bounds: [[-5, 1, 0], [-2, 3, 2]] },
  ];
  for (const item of reversed ? negative : positive) expectBody(result, outputRef(feature, a.bodyId, item.address),
    { volume: 12, area: 32, bounds: item.bounds, solids: 1 });
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId)); expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  if (reversed) expect(result.bodies?.some(item => item.ref.bodyId === slot(feature, a.bodyId, '2').bodyId)).toBe(false);
  const wanted = { volume: reversed ? 66 : 78, area: reversed ? 158 : 190,
    bounds: [[-5, reversed ? -7 : -8, 0], [35, 4, 4]], solids: reversed ? 4 : 5 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it('reflects two selected bodies about the displaced plane X5 without reflecting the unselected body', async () => {
  const original = asymmetricBodies(), initial = healthy(original);
  const supported = addFeature(original, { id: 'mirror-plane', type: 'plane', name: 'Original plane X5',
    support: { kind: 'principal', plane: 'YZ' }, offset: 5, reversed: true, suppressed: false });
  const feature: ExplicitMirror = { id: 'mirror', type: 'mirror', name: 'Original exact body reflection',
    suppressed: false, baseFeatureId: u.sourceFeatureId, source: { mode: 'bodies', scope: 'historical', bodies: [b, a] },
    bodyPattern: { mode: 'new', instances: slots('mirror', [b, a], ['mirror']) },
    support: { kind: 'plane', planeId: 'mirror-plane' }, mergeBodies: false };
  const saved = parseDocument(serializeDocument(addFeature(supported, feature))), result = healthy(saved);
  // Reflection across X5 is x'=10-x, independently of the plane's normal sign.
  expectBody(result, outputRef(feature, a.bodyId, 'mirror'), { volume: 24, area: 52, bounds: [[7, 2, 0], [9, 5, 4]], solids: 1 });
  expectBody(result, outputRef(feature, b.bodyId, 'mirror'), { volume: 6, area: 22, bounds: [[4, -7, 1], [5, -5, 4]], solids: 1 });
  for (const unchanged of [a, b, u]) expect(body(result, unchanged.bodyId)).toEqual(body(initial, unchanged.bodyId));
  const wanted = { volume: 90, area: 210, bounds: [[1, -7, 0], [35, 5, 4]], solids: 5 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

function mergeBodies(): Document {
  return document([
    ...box(a, [0, 0, 0], [2, 3, 4]),
    ...box(b, [3, 0, 0], [5, 3, 4]),
    ...box(u, [30, -6, 1], [35, -4, 4]),
  ]);
}

it.each(['current', 'historical'] as const)('keeps the same-seed %s merge boundary tied to the current target state', async scope => {
  const original = asymmetricBodies(true), initial = healthy(original);
  const feature = linear('same-seed-merge', 'grow-a', [scope === 'current' ? currentA : a], ['1,0']);
  feature.source.scope = scope;
  feature.first = { direction: [1, 0, 0], spacing: 2, count: 2 };
  feature.bodyPattern = { mode: 'merge', target: { ...currentA } };
  const saved = parseDocument(serializeDocument(addFeature(original, feature))), result = healthy(saved);
  // The target is X1..3/Y2..5/Z0..6. The copy occupies X3..5 and
  // touches its face: height 6 gives V72/A108; historical height 4 gives
  // V36+24=60, A72+52-2*(3*4)=100, with a stepped upper face.
  const volume = scope === 'current' ? 72 : 60, area = scope === 'current' ? 108 : 100;
  expectBody(result, { bodyId: a.bodyId, sourceFeatureId: feature.id },
    { volume, area, bounds: [[1, 2, 0], [5, 5, 6]], solids: 1 }, a.sourceFeatureId);
  expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  const wanted = { volume: volume + 36, area: area + 84, bounds: [[1, -7, 0], [35, 5, 6]], solids: 3 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it.each(['new', 'merge'] as const)('uses explicit %s ownership for an overlapping copy and preserves all unselected entries', async mode => {
  const original = mergeBodies(), initial = healthy(original);
  const feature = linear('overlap', u.sourceFeatureId, [a], ['1,0']);
  feature.first = { direction: [1, 0, 0], count: 2, spacing: 4 };
  if (mode === 'merge') feature.bodyPattern = { mode: 'merge', target: { ...b } };
  const saved = parseDocument(serializeDocument(addFeature(original, feature))), result = healthy(saved);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId));
  expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  if (mode === 'new') {
    expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
    expectBody(result, outputRef(feature, a.bodyId, '1,0'),
      { volume: 24, area: 52, bounds: [[4, 0, 0], [6, 3, 4]], solids: 1 });
  } else {
    // T=[3,5] and its overlapping tool [4,6] have union [3,6].
    expectBody(result, { bodyId: b.bodyId, sourceFeatureId: feature.id },
      { volume: 36, area: 66, bounds: [[3, 0, 0], [6, 3, 4]], solids: 1 }, b.sourceFeatureId);
  }
  // A new compound counts each modeled entry, including its overlap with T.
  const wanted = { volume: mode === 'new' ? 102 : 90, area: mode === 'new' ? 218 : 180,
    bounds: [[0, -6, 0], [35, 3, 4]], solids: mode === 'new' ? 4 : 3 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it('keeps coincident explicit new outputs as separately owned saved bodies', async () => {
  const original = document([
    ...box(a, [1, 2, 0], [3, 5, 4]), ...box(b, [11, 2, 0], [13, 5, 4]),
    ...box(u, [30, -6, 1], [35, -4, 4]),
  ]), initial = healthy(original);
  const feature = linear('coincident', u.sourceFeatureId, [a], ['1,0']); feature.first.count = 2;
  const saved = parseDocument(serializeDocument(addFeature(original, feature))), result = healthy(saved);
  const copy = outputRef(feature, a.bodyId, '1,0');
  expectBody(result, copy, { volume: 24, area: 52, bounds: [[11, 2, 0], [13, 5, 4]], solids: 1 });
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog }).bodyCatalog;
  expect(catalog.resolve(copy).shape.isSame(catalog.resolve(b).shape)).toBe(false);
  for (const unchanged of [a, b, u]) expect(body(result, unchanged.bodyId)).toEqual(body(initial, unchanged.bodyId));
  const wanted = { volume: 102, area: 218, bounds: [[1, -6, 0], [35, 5, 4]], solids: 4 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it('merges a face-tangent copy into only the saved target without consuming the seed', async () => {
  const original = mergeBodies(), initial = healthy(original);
  const feature = linear('face-tangent', u.sourceFeatureId, [a], ['1,0']);
  feature.first = { direction: [1, 0, 0], spacing: 5, count: 2 };
  feature.bodyPattern = { mode: 'merge', target: { ...b } };
  const saved = parseDocument(serializeDocument(addFeature(original, feature))), result = healthy(saved);
  // T=[3,5] and the face-tangent [5,7] produce one box [3,7].
  expectBody(result, { bodyId: b.bodyId, sourceFeatureId: feature.id },
    { volume: 48, area: 80, bounds: [[3, 0, 0], [7, 3, 4]], solids: 1 }, b.sourceFeatureId);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId)); expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  const wanted = { volume: 102, area: 194, bounds: [[0, -6, 0], [35, 3, 4]], solids: 3 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it.each(['circularPattern', 'mirror'] as const)('merges a %s copy into the exact target while retaining its source and the unrelated body', async kind => {
  const targetMin: Vec3 = kind === 'mirror' ? [-2, 2, 0] : [-2, -5, 0];
  const targetMax: Vec3 = kind === 'mirror' ? [0, 5, 4] : [0, -2, 4];
  const original = document([
    ...box(a, [1, 2, 0], [3, 5, 4]), ...box(b, targetMin, targetMax),
    ...box(u, [30, -6, 1], [35, -4, 4]),
  ]), initial = healthy(original);
  const common = { id: 'directed-copy', name: 'Original targeted transformed copy', suppressed: false,
    baseFeatureId: u.sourceFeatureId, source: { mode: 'bodies' as const, scope: 'current' as const, bodies: [a] },
    bodyPattern: { mode: 'merge' as const, target: { ...b } } };
  const feature: ExplicitCircular | ExplicitMirror = kind === 'mirror'
    ? { ...common, type: 'mirror', support: { kind: 'principal', plane: 'YZ' }, mergeBodies: true }
    : { ...common, type: 'circularPattern', axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
      count: 2, angle: 180, equalSpacing: true, reversed: false, skipped: [] };
  const saved = parseDocument(serializeDocument(addFeature(original, feature))), result = healthy(saved);
  // Both transforms give X[-3,-1], overlapping T at X[-2,-1].
  // Mirror keeps Y[2,5]; a 180-degree Z rotation gives Y[-5,-2].
  const bounds = kind === 'mirror' ? [[-3, 2, 0], [0, 5, 4]] : [[-3, -5, 0], [0, -2, 4]];
  expectBody(result, { bodyId: b.bodyId, sourceFeatureId: feature.id }, { volume: 36, area: 66, bounds, solids: 1 }, b.sourceFeatureId);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId)); expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  const wanted = { volume: 90, area: 180, bounds: [[-3, -6, 0], [35, 5, 4]], solids: 3 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it('accepts a final connected merge when the later copy bridges an initially disconnected copy to the target', async () => {
  const original = document([
    ...box(a, [0, 0, 0], [1, 1, 1]), ...box(b, [3, 0, 0], [4, 1, 1]),
    ...box(u, [30, -6, 1], [35, -4, 4]),
  ]), initial = healthy(original);
  const feature = linear('late-bridge', u.sourceFeatureId, [a]);
  feature.first = { direction: [1, 0, 0], spacing: 1, count: 3 };
  feature.bodyPattern = { mode: 'merge', target: { ...b } };
  const saved = parseDocument(serializeDocument(addFeature(original, feature))), result = healthy(saved);
  // The first tool [1,2] is disconnected from T=[3,4]; [2,3] bridges it.
  // The final target is [1,4]x[0,1]x[0,1], V3/A14, one closed solid.
  expectBody(result, { bodyId: b.bodyId, sourceFeatureId: feature.id },
    { volume: 3, area: 14, bounds: [[1, 0, 0], [4, 1, 1]], solids: 1 }, b.sourceFeatureId);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId)); expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  const wanted = { volume: 34, area: 82, bounds: [[0, -6, 0], [35, 1, 4]], solids: 3 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it('rejects a disconnected second copy atomically, blocks export, and then rebuilds a valid committed pattern', async () => {
  const original = mergeBodies(), initial = healthy(original);
  const feature = linear('atomic-merge', u.sourceFeatureId, [a]);
  feature.first = { direction: [1, 0, 0], spacing: 4, count: 3 };
  feature.bodyPattern = { mode: 'merge', target: { ...b } };
  const failed = addFeature(original, feature), serialized = serializeDocument(failed);
  const rejected = engine.build(failed.features);
  expect(serializeDocument(failed)).toBe(serialized);
  expect(rejected.featureErrors.map(error => error.id)).toEqual([feature.id]);
  expect(rejected.bodies).toEqual(initial.bodies);
  // A partial commit would change T from V24/A52 to V36/A66 after tool [4,6].
  // The later [8,10] cannot join that result, so no target state may publish.
  expectBody(rejected, b, { volume: 24, area: 52, bounds: [[3, 0, 0], [5, 3, 4]], solids: 1 });
  expectBody(rejected, u, unrelated);
  expectAggregate(rejected, { volume: 78, area: 166, bounds: [[0, -6, 0], [35, 3, 4]], solids: 3 });
  expect(() => engine.export('step')).toThrow();
  expect(() => engine.export('step', failed.features)).toThrow();
  const valid = updateFeature(failed, feature.id, { first: { ...feature.first, count: 2 } });
  const reopened = parseDocument(serializeDocument(valid)), result = healthy(reopened);
  expectBody(result, { bodyId: b.bodyId, sourceFeatureId: feature.id },
    { volume: 36, area: 66, bounds: [[3, 0, 0], [6, 3, 4]], solids: 1 }, b.sourceFeatureId);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId)); expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  const wanted = { volume: 90, area: 180, bounds: [[0, -6, 0], [35, 3, 4]], solids: 3 };
  expectAggregate(result, wanted); await exported(reopened, wanted);
}, 60_000);

it('rejects a stale current source without rebinding it to the surviving body with the same ID', () => {
  const original = asymmetricBodies(true), initial = healthy(original);
  const feature = linear('stale-current', 'grow-a', [a], ['1,0']); feature.first.count = 2;
  const failed = addFeature(original, feature), rejected = engine.build(failed.features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual([feature.id]);
  expect(rejected.bodies).toEqual(initial.bodies);
  expectBody(rejected, currentA, { volume: 36, area: 72, bounds: [[1, 2, 0], [3, 5, 6]], solids: 1 }, a.sourceFeatureId);
  expect(() => engine.export('step')).toThrow();
}, 60_000);

it.each(['current', 'historical'] as const)('resolves a consumed source only with exact historical scope, selected=%s', async scope => {
  const inputs = document([
    ...box(a, [0, 0, 0], [2, 3, 4]), ...box(b, [1, 0, 0], [3, 3, 4]),
    ...box(u, [30, -6, 1], [35, -4, 4]),
  ]);
  const original = addFeature(inputs, { id: 'consume-seeds', type: 'combine', name: 'Original overlapping union',
    operation: 'add', operands: [a, b], resultBodyId: 'pattern-combined', keepTools: false, suppressed: false });
  const initial = healthy(original), feature = linear('consumed-source', 'consume-seeds', [a], ['1,0']);
  feature.source.scope = scope; feature.first.count = 2;
  const saved = parseDocument(serializeDocument(addFeature(original, feature)));
  if (scope === 'current') {
    const rejected = engine.build(saved.features);
    expect(rejected.featureErrors.map(error => error.id)).toEqual([feature.id]);
    expect(rejected.bodies).toEqual(initial.bodies); expect(() => engine.export('step')).toThrow();
    return;
  }
  const result = healthy(saved);
  expect(result.bodies?.some(item => item.ref.bodyId === a.bodyId || item.ref.bodyId === b.bodyId)).toBe(false);
  expectBody(result, outputRef(feature, a.bodyId, '1,0'),
    { volume: 24, area: 52, bounds: [[10, 0, 0], [12, 3, 4]], solids: 1 });
  expect(body(result, 'pattern-combined')).toEqual(body(initial, 'pattern-combined'));
  expect(body(result, u.bodyId)).toEqual(body(initial, u.bodyId));
  const wanted = { volume: 90, area: 180, bounds: [[0, -6, 0], [35, 3, 4]], solids: 3 };
  expectAggregate(result, wanted); await exported(saved, wanted);
}, 60_000);

it('copies one exact historical output of a multi-output pattern without copying its other outputs or originals', async () => {
  const original = asymmetricBodies(), first = linear('first-copies', u.sourceFeatureId, [a, b], ['1,0']);
  first.first.count = 2;
  const firstDocument = addFeature(original, first), initial = healthy(firstDocument);
  const selected = outputRef(first, b.bodyId, '1,0');
  const second = linear('selected-output', first.id, [selected], ['1,0']);
  second.source.scope = 'historical'; second.first = { direction: [0, 2, 0], spacing: 20, count: 2 };
  const saved = parseDocument(serializeDocument(addFeature(firstDocument, second))), result = healthy(saved);
  expectBody(result, outputRef(second, selected.bodyId, '1,0'),
    { volume: 6, area: 22, bounds: [[15, 13, 1], [16, 15, 4]], solids: 1 });
  expectBody(result, outputRef(first, a.bodyId, '1,0'),
    { volume: 24, area: 52, bounds: [[11, 2, 0], [13, 5, 4]], solids: 1 });
  for (const unchanged of initial.bodies!) expect(body(result, unchanged.ref.bodyId)).toEqual(unchanged);
  const wanted = { volume: 96, area: 232, bounds: [[1, -7, 0], [35, 15, 4]], solids: 6 };
  expectAggregate(result, wanted); await exported(saved, wanted);

  const selectedOutput = outputRef(second, selected.bodyId, '1,0');
  const cut = addFeature(addFeature(saved, { id: 'selected-cut-sketch', type: 'sketch', name: 'Original R0.25 selective hole',
    plane: 'XY', offset: 1, profile: { kind: 'circle', center: [15.5, 14], radius: 0.25 }, suppressed: false }),
  { id: 'selected-cut', type: 'cut', name: 'Cut only the nested B output', sketchId: 'selected-cut-sketch',
    depth: 3, symmetric: false, bodyScope: [selectedOutput], suppressed: false });
  const reopenedCut = parseDocument(serializeDocument(cut)), cutResult = healthy(reopenedCut);
  // A radius-1/4 through-hole removes 3*pi/16 volume and two pi/16 disks,
  // while adding a cylinder wall of area 3*pi/2: net area +11*pi/8.
  expectBody(cutResult, { bodyId: selectedOutput.bodyId, sourceFeatureId: 'selected-cut' },
    { volume: 6 - 3 * Math.PI / 16, area: 22 + 11 * Math.PI / 8, bounds: [[15, 13, 1], [16, 15, 4]], solids: 1 }, second.id);
  for (const unchanged of initial.bodies!) expect(body(cutResult, unchanged.ref.bodyId)).toEqual(unchanged);
  const cutWanted = { ...wanted, volume: 96 - 3 * Math.PI / 16, area: 232 + 11 * Math.PI / 8 };
  expectAggregate(cutResult, cutWanted); await exported(reopenedCut, cutWanted);
}, 60_000);

it('preserves skipped IDs through history and reopening, and never resurrects a retired domain slot', async () => {
  const original = asymmetricBodies(), initial = healthy(original), history = new DocumentHistory(original);
  let allocated = 0;
  const allocate = () => `history-instance-${++allocated}`;
  const fresh = linear('history-pattern', u.sourceFeatureId, [a]); fresh.bodyPattern = { mode: 'new', instances: [] };
  const created = reconcileBodyPatternDraft(fresh, allocate) as ExplicitLinear;
  expect(allocated).toBe(2);
  const firstId = slot(created, a.bodyId, '1,0').bodyId, removedId = slot(created, a.bodyId, '2,0').bodyId;
  const createdDocument = addFeature(original, created); history.apply(createdDocument);
  const full = { volume: 108, area: 240, bounds: [[1, -7, 0], [35, 5, 4]], solids: 5 };
  const oneCopy = { volume: 84, area: 188, bounds: [[1, -7, 0], [35, 5, 4]], solids: 4 };
  expectAggregate(healthy(history.current), full);

  const skipped = reconcileBodyPatternDraft({ ...created, skipped: [[1, 0]] }, allocate) as ExplicitLinear;
  expect(allocated).toBe(2); expect(slot(skipped, a.bodyId, '1,0').bodyId).toBe(firstId);
  const skippedDocument = updateFeature(history.current, created.id, skipped); history.apply(skippedDocument);
  const skippedResult = healthy(history.current);
  expect(skippedResult.bodies?.some(item => item.ref.bodyId === firstId)).toBe(false);
  expectAggregate(skippedResult, oneCopy);
  expect(history.undo()).toEqual(createdDocument);
  expect(body(healthy(history.current), firstId).ref).toEqual({ bodyId: firstId, sourceFeatureId: created.id });
  expect(history.redo()).toEqual(skippedDocument);
  const reopenedSkipped = parseDocument(serializeDocument(history.current));
  expect(reopenedSkipped.features.at(-1)).toEqual(skipped); expectAggregate(healthy(reopenedSkipped), oneCopy);

  const unskipped = reconcileBodyPatternDraft({ ...skipped, skipped: [] }, allocate) as ExplicitLinear;
  expect(allocated).toBe(2); expect(slot(unskipped, a.bodyId, '1,0').bodyId).toBe(firstId);
  history.apply(updateFeature(history.current, created.id, unskipped));
  expectAggregate(healthy(history.current), full);
  const smaller = reconcileBodyPatternDraft({ ...unskipped, first: { ...unskipped.first, count: 2 } }, allocate) as ExplicitLinear;
  if (smaller.bodyPattern.mode !== 'new') throw new Error('Expected persistent new-body slots.');
  expect(smaller.bodyPattern.instances.find(item => item.bodyId === removedId)?.retired).toBe(true);
  expect(allocated).toBe(2);
  const smallerDocument = updateFeature(history.current, created.id, smaller); history.apply(smallerDocument);
  const shrunk = healthy(history.current); expectAggregate(shrunk, oneCopy);
  expect(shrunk.bodies?.some(item => item.ref.bodyId === removedId)).toBe(false);

  const larger = reconcileBodyPatternDraft({ ...smaller, first: { ...smaller.first, count: 3 } }, allocate) as ExplicitLinear;
  expect(allocated).toBe(3); expect(slot(larger, a.bodyId, '1,0').bodyId).toBe(firstId);
  const replacementId = slot(larger, a.bodyId, '2,0').bodyId;
  expect(replacementId).not.toBe(removedId);
  if (larger.bodyPattern.mode !== 'new') throw new Error('Expected persistent new-body slots.');
  expect(larger.bodyPattern.instances.find(item => item.bodyId === removedId)?.retired).toBe(true);
  const largerDocument = updateFeature(history.current, created.id, larger); history.apply(largerDocument);
  const reopened = parseDocument(serializeDocument(history.current)), result = healthy(reopened);
  expect(reopened.features.at(-1)).toEqual(larger);
  expect(result.bodies?.some(item => item.ref.bodyId === removedId)).toBe(false);
  expectBody(result, { bodyId: replacementId, sourceFeatureId: created.id },
    { volume: 24, area: 52, bounds: [[21, 2, 0], [23, 5, 4]], solids: 1 });
  for (const unchanged of [a, b, u]) expect(body(result, unchanged.bodyId)).toEqual(body(initial, unchanged.bodyId));
  expectAggregate(result, full); await exported(reopened, full);
  expect(history.undo()).toEqual(smallerDocument); expectAggregate(healthy(history.current), oneCopy);
  expect(history.redo()).toEqual(largerDocument); expectAggregate(healthy(history.current), full);
}, 60_000);
