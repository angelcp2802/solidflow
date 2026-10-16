import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, makeBox, makeCompound, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import type { FeaturePatternOperation } from '../model/featurePatterns';
import { bodyBoolean, NativeBodyCatalog, NativeBodyTransaction, validateBodyShape } from './kernel.bodies';
import { CadEngine } from './kernel.engine';
import { featureContributionKey, featurePatternReplacements, ownedGeometryDelta, validateFeatureReplayIntermediate, type OwnedFeatureGeometry } from './kernel.feature-patterns';
import { patternPlan, type GeometryDelta } from './kernel.patterns';
import type { BodyReference, CadResult, Feature, HoleFeature, PickableBody, RepetitionFeature, Vec3 } from './kernel.types';

// Original millimeter fixtures: Cartesian boxes, cylindrical holes and explicit
// quarter turns/reflections. Oracles use V=xyz, A=2(xy+xz+yz), cylinder wall and
// disk areas, and stated cell coordinates. Expected geometry is never rebuilt
// with the planner, delta capture or replay helper under test. These numerical
// checks do not establish interactive picking or independent interoperability.
const engine = new CadEngine(), tolerance = 1e-5, coordinateTolerance = 1e-6;
const kinds = ['linearPattern', 'circularPattern', 'mirror'] as const;
type Kind = typeof kinds[number];
type Metrics = { volume: number; area: number; bounds: number[][]; solids: number };
type ScopedPattern = RepetitionFeature & { featurePattern: FeaturePatternOperation };
const a: BodyReference = { bodyId: 'feature-owner-a', sourceFeatureId: 'create-a' };
const b: BodyReference = { bodyId: 'feature-owner-b', sourceFeatureId: 'create-b' };
const c: BodyReference = { bodyId: 'feature-owner-c', sourceFeatureId: 'create-c' };
const extraOwners = new Set<{ delete(): void }>();
const deltas = new Set<GeometryDelta>(), proposals = new Set<NativeBodyTransaction>(), catalogs = new Set<NativeBodyCatalog>();
function own<T extends { delete(): void }>(shape: T): T { extraOwners.add(shape); return shape; }

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => {
  vi.restoreAllMocks();
  const errors: unknown[] = [];
  for (const proposal of proposals) try { proposal.dispose(); } catch (error) { errors.push(error); }
  for (const catalog of catalogs) try { catalog.dispose(); } catch (error) { errors.push(error); }
  try { engine.dispose(); } catch (error) { errors.push(error); }
  for (const delta of deltas) try { delta.dispose(); } catch (error) { errors.push(error); }
  for (const owner of [...extraOwners].reverse()) try { owner.delete(); } catch (error) { errors.push(error); }
  proposals.clear(); catalogs.clear(); deltas.clear(); extraOwners.clear();
  if (errors.length) throw new AggregateError(errors, 'Original feature-pattern fixture release failed.');
});

function box(ref: BodyReference, min: Vec3, max: Vec3): Feature[] {
  const sketchId = 'sketch-' + ref.sourceFeatureId;
  return [{ id: sketchId, type: 'sketch', name: 'Original Cartesian body rectangle', plane: 'XY', offset: min[2],
    profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], width: max[0] - min[0], height: max[1] - min[1] }, suppressed: false },
  { id: ref.sourceFeatureId, type: 'extrude', name: 'Original owned Cartesian prism', sketchId,
    depth: max[2] - min[2], symmetric: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId }, suppressed: false }];
}
function rectangleEffect(id: string, type: 'extrude' | 'cut', target: BodyReference, min: Vec3, max: Vec3): Feature[] {
  const sketchId = 'sketch-' + id;
  const common = { id, name: 'Original signed rectangular feature', sketchId, depth: max[2] - min[2], symmetric: false, suppressed: false };
  return [{ id: sketchId, type: 'sketch', name: 'Original signed rectangle', plane: 'XY', offset: min[2],
    profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], width: max[0] - min[0], height: max[1] - min[1] }, suppressed: false },
  type === 'cut' ? { ...common, type, bodyScope: [{ ...target }] }
    : { ...common, type, bodyOperation: { mode: 'merge', target: { ...target } } }];
}
function circleCut(id: string, target: BodyReference, center: [number, number], radius: number, depth: number): Feature[] {
  return [{ id: 'sketch-' + id, type: 'sketch', name: 'Original circular cut profile', plane: 'XY', offset: 0,
    profile: { kind: 'circle', center, radius }, suppressed: false },
  { id, type: 'cut', name: 'Original scoped cylindrical removal', sketchId: 'sketch-' + id, depth, symmetric: false,
    bodyScope: [{ ...target }], suppressed: false }];
}
function doc(features: Feature[]): Document {
  return validateDocument({ ...createDocument('Original analytical scoped feature geometry'), features });
}
function ref(body: BodyReference, sourceFeatureId: string): BodyReference { return { bodyId: body.bodyId, sourceFeatureId }; }
function repetition(kind: Kind, id: string, baseFeatureId: string, sources: BodyReference[], targets: BodyReference[]): ScopedPattern {
  const common = { id, name: 'Original selected-scope geometry replay', suppressed: false, baseFeatureId,
    source: { mode: 'features' as const, geometryPattern: true as const, featureIds: [...new Set(sources.map(source => source.sourceFeatureId))] },
    featurePattern: { mode: 'geometry' as const, targets: structuredClone(targets),
      bindings: sources.map(source => ({ source: { ...source }, targetBodyIds: targets.map(target => target.bodyId) })) } };
  if (kind === 'linearPattern') return { ...common, type: kind, first: { direction: [-1, 0, 0], spacing: 40, count: 2 },
    second: null, secondSeedOnly: false, skipped: [] };
  if (kind === 'circularPattern') return { ...common, type: kind, axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
    count: 2, angle: 90, equalSpacing: false, reversed: false, skipped: [] };
  return { ...common, type: kind, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
}
function catalog(): NativeBodyCatalog {
  const value = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  expect(value).not.toBeNull(); return value!;
}
function body(result: CadResult, id: string): PickableBody {
  const matches = result.bodies?.filter(value => value.ref.bodyId === id) ?? [];
  expect(matches).toHaveLength(1); return matches[0];
}
function healthy(value: Document): CadResult {
  const saved = serializeDocument(value), result = engine.build(value.features);
  expect(serializeDocument(value)).toBe(saved); expect(result.featureErrors).toEqual([]);
  expect(result.bodyCatalogActive).toBe(true); expect(structuredClone(result)).toEqual(result);
  return result;
}
function volume(shape: Shape3D): number {
  const properties = measureShapeVolumeProperties(shape);
  try { return properties.volume; } finally { properties.delete(); }
}
function measure(shape: Shape3D): Metrics {
  const owners: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(value: T): T => { owners.push(value); return value; };
  try {
    const oc = getOC(), analyzer = keep(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const solids = shape.solids; solids.forEach(keep);
    for (const solid of solids) {
      const explorer = keep(new oc.TopExp_Explorer(solid.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      let shells = 0;
      while (explorer.More()) { const shell = keep(explorer.Current()); expect(oc.BRep_Tool.IsClosed(shell)).toBe(true); shells++; explorer.Next(); }
      expect(shells).toBeGreaterThan(0);
    }
    const surface = keep(measureShapeSurfaceProperties(shape)), bounds = keep(shape.boundingBox);
    return { volume: volume(shape), area: surface.area, bounds: bounds.bounds, solids: solids.length };
  } finally {
    const errors: unknown[] = [];
    for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Analytical measurement release failed.');
  }
}
function expectBounds(actual: number[][], wanted: number[][]) {
  actual.forEach((side, i) => side.forEach((coordinate, j) => expect(Math.abs(coordinate - wanted[i][j])).toBeLessThan(coordinateTolerance)));
}
function expectMetrics(shape: Shape3D, wanted: Metrics) {
  const actual = measure(shape); expect(actual.solids).toBe(wanted.solids);
  expect(Math.abs(actual.volume - wanted.volume)).toBeLessThan(tolerance);
  expect(Math.abs(actual.area - wanted.area)).toBeLessThan(tolerance); expectBounds(actual.bounds, wanted.bounds);
}
function expectBody(result: CadResult, exact: BodyReference, wanted: Metrics, creator = a.sourceFeatureId) {
  const displayed = body(result, exact.bodyId);
  expect(displayed.ref).toEqual(exact); expect(displayed.createdByFeatureId).toBe(creator);
  expect(displayed.triangles.length).toBeGreaterThan(0); expect(displayed.faces.length).toBeGreaterThan(0); expect(displayed.edges.length).toBeGreaterThan(0);
  expect(Math.abs(displayed.volume - wanted.volume)).toBeLessThan(tolerance);
  expectBounds([displayed.bounds.min, displayed.bounds.max], wanted.bounds);
  expectMetrics(catalog().resolve(exact).shape, wanted);
}
function probe(exact: BodyReference, center: Vec3, material: boolean) {
  const min = center.map(value => value - .1) as Vec3, max = center.map(value => value + .1) as Vec3;
  const cube = makeBox(min, max); let common: Shape3D | undefined;
  let failed = false, primary: unknown;
  try {
    common = bodyBoolean('common', catalog().resolve(exact).shape, cube);
    expect(Math.abs(volume(common) - (material ? .008 : 0))).toBeLessThan(1e-7);
  } catch (error) { failed = true; primary = error; throw error; }
  finally {
    const errors: unknown[] = [];
    for (const owner of [common, cube]) try { owner?.delete(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(failed ? [primary, ...errors] : errors,
      'Original analytical probe or release failed.', { cause: failed ? primary : errors[0] });
  }
}
function rejected(prefix: Document, feature: ScopedPattern): CadResult {
  const initial = healthy(prefix), value = addFeature(prefix, feature), saved = serializeDocument(value);
  const result = engine.build(value.features);
  expect(result.featureErrors.map(error => error.id)).toEqual([feature.id]);
  expect(result.bodies).toEqual(initial.bodies); expect(serializeDocument(value)).toBe(saved);
  expect(() => engine.export('step', value.features)).toThrow(); return result;
}

it.each(kinds)('captures a %s cut per owner despite a coincident unselected body, with saved identities', kind => {
  const prefix = doc([...box(a, [-50, -35, 0], [50, 35, 12]), ...box(b, [-50, -35, 0], [50, 35, 12]),
    ...circleCut('hole', a, [20, 20], 3, 12)]);
  const initial = healthy(prefix), source = ref(a, 'hole'), feature = repetition(kind, 'copy-hole', 'hole', [source], [source]);
  const saved = parseDocument(serializeDocument(addFeature(prefix, feature))), result = healthy(saved);
  const wanted = { volume: 84000 - 216 * Math.PI, area: 18080 + 108 * Math.PI, bounds: [[-50, -35, 0], [50, 35, 12]], solids: 1 };
  expectBody(result, ref(a, feature.id), wanted); expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  expectBody(result, b, { volume: 84000, area: 18080, bounds: wanted.bounds, solids: 1 }, b.sourceFeatureId);
  expect(result.bodies).toHaveLength(2); expect(Math.abs(result.volume - (168000 - 216 * Math.PI))).toBeLessThan(tolerance);
  probe(ref(a, feature.id), [-20, 20, 6], false); probe(b, [-20, 20, 6], true);
  expect(saved.features.at(-1)).toEqual(feature);
  if (kind === 'linearPattern') {
    const history = new DocumentHistory(saved), sourceSketch = saved.features.find(value => value.id === 'sketch-hole');
    if (!sourceSketch || sourceSketch.type !== 'sketch') throw new Error('Original circle sketch is required.');
    const edited = updateFeature(saved, sourceSketch.id, { ...sourceSketch, profile: { kind: 'circle', center: [20, 20], radius: 4 } });
    history.apply(edited);
    expectBody(healthy(parseDocument(serializeDocument(history.current))), ref(a, feature.id),
      { ...wanted, volume: 84000 - 384 * Math.PI, area: 18080 + 128 * Math.PI });
    expect(history.undo()).toEqual(saved); expectBody(healthy(history.current), ref(a, feature.id), wanted);
    expect(history.redo()).toEqual(edited); expect(history.current.features.at(-1)).toEqual(feature);
  }
}, 60_000);

it.each(kinds)('copies only the actual low-region cylindrical contribution for %s, without through-all regeneration', kind => {
  const circular = kind === 'circularPattern';
  const base = circular ? box(a, [-20, -20, 0], [20, 20, 4]) : box(a, [0, 0, 0], [30, 10, 4]);
  const upper = rectangleEffect('upper', 'extrude', a, circular ? [0, 0, 4] : [15, 0, 4], circular ? [20, 20, 8] : [30, 10, 8]);
  const source: HoleFeature = { id: 'through-hole', type: 'hole', name: 'Original through-all hole in low terrace', suppressed: false,
    baseFeatureId: 'upper', support: { kind: 'principal', plane: 'XY' }, positions: [{ id: 'original-center', x: circular ? 10 : 5, y: circular ? -10 : 5 }],
    diameter: 2, reversed: true, head: { kind: 'simple' }, endCondition: { kind: 'throughAll' }, bodyScope: [ref(a, 'upper')] };
  const features: Feature[] = [...base, ...upper, source];
  if (kind === 'mirror') features.push({ id: 'mirror-x15', type: 'plane', name: 'Original exact X15 datum', suppressed: false,
    support: { kind: 'principal', plane: 'YZ' }, offset: 15, reversed: false });
  const exact = ref(a, source.id), feature = repetition(kind, 'copy-low-hole', source.id, [exact], [exact]);
  if (feature.type === 'linearPattern') feature.first = { direction: [1, 0, 0], count: 2, spacing: 20 };
  if (feature.type === 'mirror') feature.support = { kind: 'plane', planeId: 'mirror-x15' };
  const value = parseDocument(serializeDocument(addFeature(doc(features), feature))), result = healthy(value);
  const wanted = { volume: (circular ? 8000 : 1800) - 8 * Math.PI, area: (circular ? 4160 : 1120) + 14 * Math.PI,
    bounds: circular ? [[-20, -20, 0], [20, 20, 8]] : [[0, 0, 0], [30, 10, 8]], solids: 1 };
  expectBody(result, ref(a, feature.id), wanted);
  // A regenerated hole would remove another 4π and add another 6π of area.
  expect(Math.abs(result.volume - ((circular ? 8000 : 1800) - 12 * Math.PI))).toBeGreaterThan(1);
  const copied: Vec3 = circular ? [10, 10, 2] : [25, 5, 2];
  probe(ref(a, feature.id), copied, false); probe(ref(a, feature.id), [copied[0], copied[1], 6], true);
}, 60_000);

function orderedPrefix(): Document {
  return doc([...box(a, [-16, -16, 0], [16, 16, 4]),
    ...rectangleEffect('remove', 'cut', a, [7, 3, 2], [9, 5, 4]),
    ...rectangleEffect('fill', 'extrude', ref(a, 'remove'), [7, 3, 3], [9, 5, 6])]);
}
it.each(kinds)('replays history-ordered removal then fill for %s regardless of seed selection order', kind => {
  const prefix = orderedPrefix(), expected = kind === 'linearPattern' ? [4108, 2656] : kind === 'circularPattern' ? [4112, 2688] : [4104, 2624];
  let first: PickableBody | undefined;
  for (const sources of [[ref(a, 'remove'), ref(a, 'fill')], [ref(a, 'fill'), ref(a, 'remove')]]) {
    const feature = repetition(kind, 'ordered-copy', 'fill', sources, [ref(a, 'fill')]);
    if (feature.type === 'linearPattern') feature.first = { direction: [-1, 0, 0], spacing: 8, count: 3 };
    if (feature.type === 'circularPattern') { feature.count = 4; feature.angle = 360; feature.equalSpacing = true; }
    const value = parseDocument(serializeDocument(addFeature(prefix, feature))), result = healthy(value), exact = ref(a, feature.id);
    expectBody(result, exact, { volume: expected[0], area: expected[1], bounds: [[-16, -16, 0], [16, 16, 6]], solids: 1 });
    const center: Vec3 = kind === 'linearPattern' ? [0, 4, 5] : kind === 'circularPattern' ? [-4, 8, 5] : [-8, 4, 5];
    probe(exact, center, true); probe(exact, [center[0], center[1], 2.5], false); probe(exact, [center[0], center[1], 3.5], true);
    if (first) expect(body(result, a.bodyId)).toEqual(first); else first = structuredClone(body(result, a.bodyId));
  }
}, 60_000);

it.each(kinds)('retains an equal-volume nonempty material change for %s', kind => {
  const linear = kind === 'linearPattern';
  const prefix = doc([...box(a, linear ? [0, 0, 0] : [-20, -20, 0], linear ? [40, 12, 4] : [20, 20, 4]),
    ...rectangleEffect('boss', 'extrude', a, linear ? [4, 5, 4] : [7, 3, 4], linear ? [6, 7, 8] : [9, 5, 8]),
    ...rectangleEffect('notch', 'cut', ref(a, 'boss'), linear ? [8, 5, 0] : [7, 7, 0], linear ? [10, 7, 4] : [9, 9, 4])]);
  const initial = healthy(prefix), feature = repetition(kind, 'zero-net-copy', 'notch', [ref(a, 'boss'), ref(a, 'notch')], [ref(a, 'notch')]);
  if (feature.type === 'linearPattern') feature.first = { direction: [1, 0, 0], spacing: 20, count: 2 };
  if (feature.type === 'circularPattern') { feature.count = 4; feature.angle = 360; feature.equalSpacing = true; }
  const result = healthy(parseDocument(serializeDocument(addFeature(prefix, feature)))), exact = ref(a, feature.id);
  const wanted = { volume: linear ? 1920 : 6400, area: linear ? 1488 : kind === 'circularPattern' ? 4064 : 3952,
    bounds: linear ? [[0, 0, 0], [40, 12, 8]] : [[-20, -20, 0], [20, 20, 8]], solids: 1 };
  expectBody(result, exact, wanted); expect(Math.abs(result.volume - initial.volume)).toBeLessThan(tolerance);
  const boss: Vec3 = linear ? [25, 6, 6] : kind === 'circularPattern' ? [-4, 8, 6] : [-8, 4, 6];
  const notch: Vec3 = linear ? [29, 6, 2] : [-8, 8, 2];
  probe(exact, boss, true); probe(exact, notch, false);
}, 60_000);

it('captures only an inner pattern new cell when that pattern is the outer historical source', () => {
  const prefix = orderedPrefix(), inner = repetition('linearPattern', 'inner-copy', 'fill', [ref(a, 'remove'), ref(a, 'fill')], [ref(a, 'fill')]);
  if (inner.type !== 'linearPattern') throw new Error('Linear fixture required.');
  inner.first = { direction: [0, 1, 0], spacing: 6, count: 2 };
  const withInner = addFeature(prefix, inner), outer = repetition('mirror', 'outer-copy', inner.id, [ref(a, inner.id)], [ref(a, inner.id)]);
  const saved = parseDocument(serializeDocument(addFeature(withInner, outer))), result = healthy(saved), exact = ref(a, outer.id);
  // Three cells at (8,4), (8,10), (-8,10), each +4 volume/+32 area.
  expectBody(result, exact, { volume: 4108, area: 2656, bounds: [[-16, -16, 0], [16, 16, 6]], solids: 1 });
  for (const center of [[8, 4, 5], [8, 10, 5], [-8, 10, 5]] as Vec3[]) probe(exact, center, true);
  probe(exact, [-8, 4, 5], false); probe(exact, [-8, 10, 2.5], false);
  expect((saved.features.at(-1) as ScopedPattern).source).toEqual({ mode: 'features', geometryPattern: true, featureIds: [inner.id] });
}, 60_000);

it('retains no-op owner refs and picking data without fabricating a potential historical pattern state', () => {
  const d: BodyReference = { bodyId: 'unrelated-last-owner', sourceFeatureId: 'create-d' };
  const prefix = doc([...box(a, [0, 0, 0], [20, 10, 4]), ...box(b, [40, 0, 0], [42, 2, 2]),
    ...circleCut('hole', a, [5, 5], 1, 4), ...box(d, [50, 0, 0], [51, 1, 1])]);
  const initial = healthy(prefix), source = ref(a, 'hole'), feature = repetition('linearPattern', 'scoped-copy', d.sourceFeatureId, [source], [source, b]);
  if (feature.type !== 'linearPattern') throw new Error('Linear fixture required.');
  feature.first = { direction: [1, 0, 0], spacing: 10, count: 2 };
  const saved = parseDocument(serializeDocument(addFeature(prefix, feature))), result = healthy(saved);
  expectBody(result, ref(a, feature.id), { volume: 800 - 8 * Math.PI, area: 640 + 12 * Math.PI, bounds: [[0, 0, 0], [20, 10, 4]], solids: 1 });
  for (const untouched of [b, d]) expect(body(result, untouched.bodyId)).toEqual(body(initial, untouched.bodyId));
  expect(() => catalog().resolve(ref(b, feature.id))).toThrow();
  // The parser can retain this potential state for repair. Native capture must
  // still reject a source that never materialized; it must not pick b's latest.
  const ghost = repetition('linearPattern', 'ghost-source', feature.id, [ref(b, feature.id)], [ref(a, feature.id)]);
  if (ghost.type !== 'linearPattern') throw new Error('Linear fixture required.');
  ghost.first = { direction: [1, 0, 0], spacing: 1, count: 2 };
  const value = addFeature(saved, ghost), bytes = serializeDocument(value), failed = engine.build(value.features);
  expect(failed.featureErrors.map(error => error.id)).toEqual([ghost.id]);
  expect(failed.bodies).toEqual(result.bodies); expect(serializeDocument(value)).toBe(bytes);
  expect(() => engine.export('step', value.features)).toThrow();
}, 60_000);

function horizontalStep(owner: BodyReference, thickLength: number): { features: Feature[]; current: BodyReference } {
  const upperId = 'upper-' + owner.bodyId;
  return { features: [...box(owner, [0, 0, 0], [14, 4, 2]), ...rectangleEffect(upperId, 'extrude', owner, [0, 0, 2], [thickLength, 4, 4])],
    current: ref(owner, upperId) };
}
function verticalStep(owner: BodyReference, thickLength: number): { features: Feature[]; current: BodyReference } {
  const upperId = 'upper-' + owner.bodyId;
  return { features: [...box(owner, [-4, 0, 0], [0, 14, 2]), ...rectangleEffect(upperId, 'extrude', owner, [-4, 0, 2], [0, thickLength, 4])],
    current: ref(owner, upperId) };
}
const seedGrooveMetrics: Metrics = { volume: 168, area: 244, bounds: [[0, 0, 0], [14, 4, 4]], solids: 1 };

it('rolls back an earlier valid linear instance when the later instance splits the same target', () => {
  const stepped = horizontalStep(a, 8), prefix = doc([...stepped.features,
    ...rectangleEffect('seed-groove', 'cut', stepped.current, [1, 0, 0], [2, 4, 2])]);
  const source = ref(a, 'seed-groove'), feature = repetition('linearPattern', 'late-split', source.sourceFeatureId, [source], [source]);
  if (feature.type !== 'linearPattern') throw new Error('Linear fixture required.');
  feature.first = { direction: [1, 0, 0], spacing: 4, count: 3 };
  const result = rejected(prefix, feature);
  // X5..6 has an upper bridge; X9..10 cuts the complete thin tail. The
  // intermediate valid V160/A256 must never replace the seed V168/A244.
  expectBody(result, source, seedGrooveMetrics);
}, 60_000);

it('rolls back all mirror targets when a later owner splits after an earlier valid replacement', () => {
  const first = horizontalStep(a, 8), second = horizontalStep(c, 4);
  const prefix = doc([...first.features, ...second.features,
    ...rectangleEffect('seed-groove', 'cut', first.current, [1, 0, 0], [2, 4, 2]),
    { id: 'mirror-x4', type: 'plane', name: 'Original X4 rollback plane', suppressed: false,
      support: { kind: 'principal', plane: 'YZ' }, offset: 4, reversed: false }]);
  const source = ref(a, 'seed-groove'), feature = repetition('mirror', 'mirror-late-split', source.sourceFeatureId, [source], [source, second.current]);
  if (feature.type !== 'mirror') throw new Error('Mirror fixture required.');
  feature.support = { kind: 'plane', planeId: 'mirror-x4' };
  const result = rejected(prefix, feature);
  // Mirrored X6..7 is under A's upper bridge and through C's thin tail.
  expectBody(result, source, seedGrooveMetrics);
  expectBody(result, second.current, { volume: 144, area: 216, bounds: [[0, 0, 0], [14, 4, 4]], solids: 1 }, c.sourceFeatureId);
}, 60_000);

it('rolls back both circular targets while retaining an independent historical source owner', () => {
  const s: BodyReference = { bodyId: 'independent-source', sourceFeatureId: 'create-s' };
  const sourceBase = horizontalStep(s, 8), first = verticalStep(a, 8), second = verticalStep(c, .5);
  const prefix = doc([...sourceBase.features, ...first.features, ...second.features,
    ...rectangleEffect('seed-groove', 'cut', sourceBase.current, [1, 0, 0], [2, 4, 2])]);
  const source = ref(s, 'seed-groove'), feature = repetition('circularPattern', 'circular-late-split', source.sourceFeatureId, [source], [first.current, second.current]);
  const result = rejected(prefix, feature);
  // +90° maps X1..2/Y0..4 to X-4..0/Y1..2. A retains a bridge;
  // C's thick prefix ends at Y0.5, so its later candidate splits.
  expectBody(result, first.current, { volume: 176, area: 232, bounds: [[-4, 0, 0], [0, 14, 4]], solids: 1 });
  expectBody(result, second.current, { volume: 116, area: 202, bounds: [[-4, 0, 0], [0, 14, 4]], solids: 1 }, c.sourceFeatureId);
  expectBody(result, source, seedGrooveMetrics, s.sourceFeatureId);
}, 60_000);

it('captures subtractive Combine target material without turning consumed tools into extra negative regions', () => {
  const prefix = doc([...box(a, [0, 0, 0], [20, 4, 4]), ...box(c, [8, 4.25, 0], [9, 4.75, 2]),
    ...box(b, [2, -1, 0], [3, 5, 2]),
    { id: 'subtract-tool', type: 'combine', name: 'Original consumed overshooting groove tool', suppressed: false,
      operation: 'subtract', target: a, tools: [b], keepTools: false }]);
  const initial = healthy(prefix), source = ref(a, 'subtract-tool'), feature = repetition('linearPattern', 'copy-combine', source.sourceFeatureId, [source], [source, c]);
  if (feature.type !== 'linearPattern') throw new Error('Linear fixture required.');
  feature.first = { direction: [1, 0, 0], spacing: 6, count: 2 };
  const result = healthy(parseDocument(serializeDocument(addFeature(prefix, feature))));
  expectBody(result, ref(a, feature.id), { volume: 304, area: 376, bounds: [[0, 0, 0], [20, 4, 4]], solids: 1 });
  expectBody(result, c, { volume: 1, area: 7, bounds: [[8, 4.25, 0], [9, 4.75, 2]], solids: 1 }, c.sourceFeatureId);
  expect(body(result, c.bodyId)).toEqual(body(initial, c.bodyId));
  expect(result.bodies?.some(value => value.ref.bodyId === b.bodyId)).toBe(false);
  expect(() => catalog().resolve(ref(b, 'subtract-tool'))).toThrow();
  // The consumed tool reaches Y5; the actual removed target region ends Y4.
  // C lies only in that overshoot and must remain material with its old ref.
  probe(c, [8.5, 4.5, 1], true);
}, 60_000);

it('groups all owner removals before owner additions within one native feature event, for either binding order', () => {
  const target: BodyReference = { bodyId: 'event-target', sourceFeatureId: 'create-event-target' };
  healthy(doc(box(target, [11, 0, 0], [12, 2, 2])));
  const addRef: BodyReference = { bodyId: 'a-add-owner', sourceFeatureId: 'mixed-event' };
  const removeRef: BodyReference = { bodyId: 'z-remove-owner', sourceFeatureId: 'mixed-event' };
  const addBefore = own(makeBox([0, 0, 0], [1, 2, 2])), addAfter = own(makeBox([0, 0, 0], [3, 2, 2]));
  const removeBefore = own(makeBox([0, 0, 0], [2, 2, 2])), removeAfter = own(makeBox([0, 0, 0], [1, 2, 2]));
  const addDelta = ownedGeometryDelta(addBefore, addAfter, validateBodyShape, volume);
  deltas.add(addDelta);
  const removeDelta = ownedGeometryDelta(removeBefore, removeAfter, validateBodyShape, volume);
  deltas.add(removeDelta);
  const records = new Map<string, OwnedFeatureGeometry>([
    [featureContributionKey(addRef), { ref: addRef, order: 1, lineage: 'original-add-event', delta: addDelta }],
    [featureContributionKey(removeRef), { ref: removeRef, order: 1, lineage: 'original-remove-event', delta: removeDelta }],
  ]);
  const refs: BodyReference[] = [];
  for (const sources of [[addRef, removeRef], [removeRef, addRef]]) {
    const feature = repetition('linearPattern', 'event-copy', target.sourceFeatureId, sources, [target]);
    if (feature.type !== 'linearPattern') throw new Error('Linear fixture required.');
    feature.first = { direction: [1, 0, 0], spacing: 10, count: 2 };
    const replacements = featurePatternReplacements(feature, patternPlan(feature), catalog(), records, validateBodyShape, volume);
    replacements.forEach(value => own(value.shape)); expect(replacements).toHaveLength(1);
    const transaction = catalog().stageReplaceMany(replacements, { sourceFeatureId: feature.id, lineage: 'original-canonical-event' });
    proposals.add(transaction); const next = transaction.commit(); catalogs.add(next.catalog); own(next.aggregate);
    const exact = { bodyId: target.bodyId, sourceFeatureId: feature.id }, entry = next.catalog.resolve(exact);
    refs.push(entry.ref); expect(entry.createdByFeatureId).toBe(target.sourceFeatureId);
    // Removed region [11,12] empties T, then addition [11,13] makes a 2×2×2 box.
    // Replaying lexicographic owner additions first would leave only [12,13].
    expectMetrics(entry.shape, { volume: 8, area: 24, bounds: [[11, 0, 0], [13, 2, 2]], solids: 1 });
  }
  expect(refs[0]).toEqual(refs[1]);
  expectMetrics(catalog().resolve(target).shape, { volume: 4, area: 16, bounds: [[11, 0, 0], [12, 2, 2]], solids: 1 });
  expectMetrics(addBefore, { volume: 4, area: 16, bounds: [[0, 0, 0], [1, 2, 2]], solids: 1 });
  expectMetrics(removeBefore, { volume: 8, area: 24, bounds: [[0, 0, 0], [2, 2, 2]], solids: 1 });
}, 60_000);

it('allows a genuine empty intermediate when an outward closed shell removes then replaces a complete target', () => {
  const prefix = doc([...box(a, [0, 0, 0], [10, 6, 4]), ...box(b, [20, 0, 0], [30, 6, 4]),
    { id: 'closed-shell', type: 'shell', name: 'Original closed outward unit shell', suppressed: false,
      baseFeatureId: a.sourceFeatureId, bodyScope: a, direction: 'outward', thickness: 1, removedFaces: [] }]);
  const initial = healthy(prefix), source = ref(a, 'closed-shell'), feature = repetition('linearPattern', 'copy-shell', source.sourceFeatureId, [source], [b]);
  if (feature.type !== 'linearPattern') throw new Error('Linear fixture required.');
  feature.first = { direction: [1, 0, 0], spacing: 20, count: 2 };
  const value = parseDocument(serializeDocument(addFeature(prefix, feature))), result = healthy(value);
  // Outer 12×8×6 minus inner 10×6×4: V336; both closed boundary areas sum680.
  expectBody(result, ref(b, feature.id), { volume: 336, area: 680, bounds: [[19, -1, -1], [31, 7, 5]], solids: 1 }, b.sourceFeatureId);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId));
  expectBody(result, source, { volume: 336, area: 680, bounds: [[-1, -1, -1], [11, 7, 5]], solids: 1 });
  probe(ref(b, feature.id), [25, 3, 2], false); probe(ref(b, feature.id), [19.5, 3, 2], true);
}, 60_000);

it('accepts only a topology-empty native compound, rejecting a zero-volume compound containing a face', () => {
  const boxShape = own(makeBox([0, 0, 0], [2, 2, 2]));
  const empty = own(bodyBoolean('subtract', boxShape, boxShape));
  let finalValidationCalls = 0;
  const final = (shape: Shape3D) => { finalValidationCalls++; return validateBodyShape(shape); };
  expect(Math.abs(volume(empty))).toBeLessThan(1e-10);
  expect(validateFeatureReplayIntermediate(empty, final, volume)).toBeCloseTo(0, 10); expect(finalValidationCalls).toBe(0);
  const faces = boxShape.faces; faces.forEach(own);
  const bottom = faces.find(face => {
    const bounds = face.boundingBox;
    try { return bounds.bounds.every(side => Math.abs(side[2]) < coordinateTolerance); }
    finally { bounds.delete(); }
  });
  expect(bottom).toBeDefined();
  const sheetCompound = own(makeCompound([bottom!]).asShape3D());
  expect(Math.abs(volume(sheetCompound))).toBeLessThan(1e-10);
  expect(() => validateFeatureReplayIntermediate(sheetCompound, final, volume)).toThrow(/topología|compuesto|intermedio/);
  expect(finalValidationCalls).toBe(0);
}, 60_000);

it('publishes all captured owner deltas before transfer, disposing a partially staged native cache on failure', () => {
  const sourceId = 'multiowner-cut', parts = circleCut(sourceId, a, [20, 20], 3, 12);
  const cut = parts.at(-1);
  if (!cut || cut.type !== 'cut') throw new Error('Scoped cut fixture required.');
  cut.bodyScope = [a, b];
  const prefix = doc([...box(a, [-50, -35, 0], [50, 35, 12]), ...box(b, [-50, -35, 0], [50, 35, 12]), ...parts]);
  const initial = healthy(prefix), sources = [ref(a, sourceId), ref(b, sourceId)];
  const feature = repetition('linearPattern', 'copy-multiowner-cut', sourceId, sources, [sources[0]]);
  const saved = parseDocument(serializeDocument(addFeature(prefix, feature))), result = healthy(saved);
  // Both exact captured owners are requested. Their coincident negatives route
  // only to A: the second subtraction may be a no-op, not a second source hole.
  expectBody(result, ref(a, feature.id), { volume: 84000 - 216 * Math.PI, area: 18080 + 108 * Math.PI,
    bounds: [[-50, -35, 0], [50, 35, 12]], solids: 1 });
  expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));

  const sentinel = new Error('Original injected second historical-cache publication failure');
  const originalSet = Map.prototype.set, originalStage = NativeBodyCatalog.prototype.stageScopedCut;
  const originalCommit = NativeBodyTransaction.prototype.commit;
  const counts: { category: string; count(): number }[] = [];
  const watched = new Set<{ delete(): void }>();
  let staged = 0, targetCommits = 0, operationError: unknown;
  let snapshots: { category: string; calls: number }[] = [];
  function watch(owner: { delete(): void }, category: string) {
    if (watched.has(owner)) return;
    watched.add(owner); const deleted = vi.spyOn(owner, 'delete');
    counts.push({ category, count: () => deleted.mock.calls.length });
  }
  const bytes = serializeDocument(saved);
  try {
    vi.spyOn(NativeBodyCatalog.prototype, 'stageScopedCut').mockImplementation(function (this: NativeBodyCatalog, ...args: Parameters<NativeBodyCatalog['stageScopedCut']>) {
      const transaction = originalStage.apply(this, args);
      if (args[2].sourceFeatureId === sourceId) {
        this.entries().forEach(entry => watch(entry.shape, 'prior-owner'));
        transaction.nextEntries.forEach(entry => watch(entry.shape, 'candidate-owner'));
        watch(transaction.aggregate, 'candidate-aggregate');
      }
      return transaction;
    });
    vi.spyOn(NativeBodyTransaction.prototype, 'commit').mockImplementation(function (this: NativeBodyTransaction) {
      if (this.nextEntries.some(entry => entry.ref.sourceFeatureId === sourceId)) targetCommits++;
      return originalCommit.call(this);
    });
    vi.spyOn(Map.prototype, 'set').mockImplementation(function (this: Map<unknown, unknown>, key: unknown, value: unknown) {
      const output = originalSet.call(this, key, value);
      const record = value as Partial<OwnedFeatureGeometry> | null;
      if (record && typeof record === 'object' && record.ref?.sourceFeatureId === sourceId && record.delta) {
        staged++;
        for (const shape of [record.delta.added, record.delta.removed]) if (shape) watch(shape, 'captured-delta');
        // Initial captured.set occurs without delta. These are the later
        // staged-cache insertions; throw after the second real insertion.
        if (staged === 2) throw sentinel;
      }
      return output;
    });
    try { engine.build(saved.features); } catch (error) { operationError = error; }
  } finally {
    snapshots = counts.map(value => ({ category: value.category, calls: value.count() }));
    vi.restoreAllMocks();
  }
  expect(staged).toBe(2); expect(targetCommits).toBe(0);
  expect(operationError).toBeInstanceOf(Error);
  expect((operationError as Error).message).toMatch(/publication failed before state transfer/);
  expect((operationError as Error & { cause: unknown }).cause).toBe(sentinel);
  expect(snapshots.filter(value => value.category === 'prior-owner')).toHaveLength(2);
  expect(snapshots.filter(value => value.category === 'candidate-owner')).toHaveLength(2);
  expect(snapshots.filter(value => value.category === 'candidate-aggregate')).toHaveLength(1);
  expect(snapshots.filter(value => value.category === 'captured-delta')).toHaveLength(2);
  for (const value of snapshots) expect(value.calls, value.category).toBe(1);
  expect(serializeDocument(saved)).toBe(bytes);
  expect(() => engine.export('step')).toThrow();
}, 60_000);
