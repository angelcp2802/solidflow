import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, makeBox, makeCompound, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NativeBodyCatalog, type NativeBodyMetadata, type NativeBodyTransaction,
  bodyBoolean, copyBodyShape, validateBodyShape,
} from './kernel.bodies';
import type { BodyReference, CombineFeature } from './kernel.types';

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

const tolerance = 5e-6;
const catalogs = new Set<NativeBodyCatalog>(), shapes = new Set<Shape3D>(), proposals = new Set<NativeBodyTransaction>();
function catalog() { const value = new NativeBodyCatalog(); catalogs.add(value); return value; }
function shape<T extends Shape3D>(value: T): T { shapes.add(value); return value; }
function proposed(value: NativeBodyTransaction) { proposals.add(value); return value; }
function committed(value: NativeBodyTransaction) {
  proposed(value);
  const result = value.commit(); catalogs.add(result.catalog); shape(result.aggregate); return result;
}
afterEach(() => {
  vi.restoreAllMocks();
  const errors: unknown[] = [];
  for (const proposal of proposals) try { proposal.dispose(); } catch (error) { errors.push(error); }
  for (const owner of catalogs) try { owner.dispose(); } catch (error) { errors.push(error); }
  for (const owner of shapes) try { owner.delete(); } catch (error) { errors.push(error); }
  proposals.clear(); catalogs.clear(); shapes.clear();
  if (errors.length) throw new AggregateError(errors, 'Original body fixture cleanup failed.');
});

// Original Cartesian millimeter inputs, not imported models. A=[0,10]x[0,6]x[0,4]
// and B=[5,15]x[0,6]x[0,4]. Every geometric oracle below is an independent box formula.
const a: BodyReference = { bodyId: 'body-a', sourceFeatureId: 'create-a' };
const b: BodyReference = { bodyId: 'body-b', sourceFeatureId: 'create-b' };
function metadata(ref: BodyReference): NativeBodyMetadata {
  return { ref: { ...ref }, createdByFeatureId: ref.sourceFeatureId, name: ref.bodyId, lineage: ref.sourceFeatureId };
}
function fixture(secondX = 5) {
  const boxA = shape(makeBox([0, 0, 0], [10, 6, 4])), boxB = shape(makeBox([secondX, 0, 0], [secondX + 10, 6, 4]));
  const first = committed(catalog().stageNew(metadata(a), boxA));
  const state = committed(first.catalog.stageNew(metadata(b), boxB));
  return { ...state, boxA, boxB };
}
type Metrics = { volume: number; area: number; bounds: number[][]; solids: number };
function measure(value: Shape3D): Metrics {
  const oc = getOC(), mass = new oc.GProp_GProps();
  let surface: ReturnType<typeof measureShapeSurfaceProperties> | null = null;
  let box: Shape3D['boundingBox'] | null = null;
  const solids: Shape3D[] = [];
  let analyzer: InstanceType<typeof oc.BRepCheck_Analyzer> | null = null;
  try {
    analyzer = new oc.BRepCheck_Analyzer(value.wrapped, true, false, false);
    surface = measureShapeSurfaceProperties(value); box = value.boundingBox; solids.push(...value.solids);
    oc.BRepGProp.VolumeProperties(value.wrapped, mass, 1e-10, false, false);
    expect(analyzer.IsValid()).toBe(true);
    return { volume: mass.Mass(), area: surface.area, bounds: box.bounds, solids: solids.length };
  } finally { analyzer?.delete(); solids.forEach(solid => solid.delete()); box?.delete(); surface?.delete(); mass.delete(); }
}
function expectMetrics(value: Shape3D, wanted: Metrics) {
  const measured = measure(value);
  expect(measured.solids).toBe(wanted.solids);
  expect(Math.abs(measured.volume - wanted.volume)).toBeLessThan(tolerance);
  expect(Math.abs(measured.area - wanted.area)).toBeLessThan(tolerance);
  measured.bounds.forEach((side, i) => side.forEach((coordinate, j) => expect(Math.abs(coordinate - wanted.bounds[i][j])).toBeLessThan(tolerance)));
}
function boxMetrics(x0: number, x1: number, solids = 1): Metrics {
  const width = x1 - x0;
  return { volume: width * 24, area: 2 * (width * 6 + width * 4 + 24), bounds: [[x0, 0, 0], [x1, 6, 4]], solids };
}
function combine(operation: 'add' | 'common' | 'subtract', keepTools = false, reverse = false): CombineFeature {
  const common = { id: 'combine-result', name: 'Original two-box operation', type: 'combine' as const, operation, keepTools, suppressed: false };
  return operation === 'subtract'
    ? { ...common, operation, target: reverse ? b : a, tools: [reverse ? a : b] }
    : { ...common, operation, operands: reverse ? [b, a] : [a, b], resultBodyId: 'body-result' };
}
function resultRef(feature: CombineFeature): BodyReference {
  return { bodyId: feature.operation === 'subtract' ? feature.target.bodyId : feature.resultBodyId, sourceFeatureId: feature.id };
}
function unchanged(current: NativeBodyCatalog, secondX = 5) {
  expect(current.entries().map(item => item.ref)).toEqual([a, b]);
  expectMetrics(current.resolve(a).shape, boxMetrics(0, 10));
  expectMetrics(current.resolve(b).shape, boxMetrics(secondX, secondX + 10));
}

describe('original two-box body transactions', () => {
  it('allows an empty catalog, clones new entries, and builds a non-unioned independent aggregate', () => {
    const empty = catalog(); expect(empty.entries()).toEqual([]); expect(() => empty.resolve(a)).toThrow(/ausente/);
    const current = fixture();
    unchanged(current.catalog);
    expect(current.catalog.resolve(a).shape).not.toBe(current.boxA);
    expect(current.catalog.resolve(b).shape).not.toBe(current.boxB);
    expectMetrics(current.aggregate, { volume: 480, area: 496, bounds: [[0, 0, 0], [15, 6, 4]], solids: 2 });
    expect(Object.isFrozen(current.catalog.entries())).toBe(true);
    expect(Object.isFrozen(current.catalog.resolve(a).ref)).toBe(true);
  }, 60_000);

  it('creates two independently owned coincident bodies from the same borrowed shape', () => {
    const borrowed = shape(makeBox([0, 0, 0], [10, 6, 4]));
    const first = committed(catalog().stageNew(metadata(a), borrowed));
    const next = committed(first.catalog.stageNew(metadata(b), borrowed));
    expect(next.catalog.entries().map(item => item.ref)).toEqual([a, b]);
    expect(next.catalog.resolve(a).shape.isSame(next.catalog.resolve(b).shape)).toBe(false);
    expect(next.catalog.resolve(b).shape.isSame(borrowed)).toBe(false);
    expectMetrics(next.aggregate, { volume: 480, area: 496, bounds: [[0, 0, 0], [10, 6, 4]], solids: 2 });
    expectMetrics(borrowed, boxMetrics(0, 10)); expectMetrics(first.catalog.resolve(a).shape, boxMetrics(0, 10));
  }, 60_000);

  it.each([
    ['add', false, 0, 15], ['common', false, 5, 10],
    ['subtract', false, 0, 5], ['subtract', true, 10, 15],
  ] as const)('computes %s with reversed=%s and consumes only after a detached commit', (operation, reverse, x0, x1) => {
    const current = fixture(), feature = combine(operation, false, reverse), transaction = proposed(current.catalog.stageCombine(feature, 'operation-seed'));
    unchanged(current.catalog);
    expectMetrics(transaction.aggregate, boxMetrics(x0, x1));
    const next = committed(transaction), output = next.catalog.resolve(resultRef(feature));
    expect(next.catalog.entries()).toHaveLength(1);
    expectMetrics(output.shape, boxMetrics(x0, x1));
    expect(output.createdByFeatureId).toBe(operation === 'subtract' ? (reverse ? b : a).sourceFeatureId : feature.id);
    expect(() => next.catalog.resolve(a)).toThrow(/estado/); expect(() => next.catalog.resolve(b)).toThrow(/estado/);
    unchanged(current.catalog);
    expect(() => transaction.commit()).toThrow(/confirmó/);
  }, 60_000);

  it.each(['add', 'common', 'subtract'] as const)('keeps the correct operands for %s without an implicit union', operation => {
    const current = fixture(), feature = combine(operation, true), next = committed(current.catalog.stageCombine(feature, 'keep-seed'));
    const result = operation === 'add' ? boxMetrics(0, 15) : operation === 'common' ? boxMetrics(5, 10) : boxMetrics(0, 5);
    expectMetrics(next.catalog.resolve(resultRef(feature)).shape, result);
    expectMetrics(next.catalog.resolve(b).shape, boxMetrics(5, 15));
    if (operation !== 'subtract') expectMetrics(next.catalog.resolve(a).shape, boxMetrics(0, 10));
    else expect(() => next.catalog.resolve(a)).toThrow(/estado/);
    expect(next.catalog.entries()).toHaveLength(operation === 'subtract' ? 2 : 3);
    expectMetrics(next.aggregate, { volume: result.volume + (operation === 'subtract' ? 240 : 480),
      area: result.area + (operation === 'subtract' ? 248 : 496), bounds: [[0, 0, 0], [15, 6, 4]], solids: operation === 'subtract' ? 2 : 3 });
    unchanged(current.catalog);
  }, 60_000);

  it.each([['add', 0, 16], ['common', 6, 10], ['subtract', 0, 6]] as const)(
    'uses explicit surviving IDs after a translated B for %s', (operation, x0, x1) => {
      const current = fixture(), moved = shape(makeBox([6, 0, 0], [16, 6, 4]));
      const edited = committed(current.catalog.stageReplace(b, moved, { sourceFeatureId: 'edit-b', lineage: 'translate-one' }));
      expect(() => edited.catalog.resolve(b)).toThrow(/estado/);
      const selectedB = { bodyId: b.bodyId, sourceFeatureId: 'edit-b' }, feature = combine(operation);
      if (feature.operation === 'subtract') feature.tools = [selectedB]; else feature.operands = [a, selectedB];
      const next = committed(edited.catalog.stageCombine(feature, 'edited-operation'));
      expectMetrics(next.aggregate, boxMetrics(x0, x1));
      expect(edited.catalog.resolve(selectedB).createdByFeatureId).toBe('create-b');
      unchanged(current.catalog);
    }, 60_000);

  it('cancels candidates without modifying the source and transfers aggregate ownership separately', () => {
    const current = fixture(), transaction = proposed(current.catalog.stageCombine(combine('add'), 'cancel'));
    transaction.dispose(); transaction.dispose(); expect(() => transaction.commit()).toThrow(/descartó/);
    unchanged(current.catalog);
    const next = committed(current.catalog.stageCombine(combine('add'), 'commit'));
    next.catalog.dispose(); expect(() => next.catalog.entries()).toThrow(/liberó/);
    expectMetrics(next.aggregate, boxMetrics(0, 15));
    unchanged(current.catalog);
  }, 60_000);

  it('rejects stale, absent, duplicate, sparse and oversized selections before a Boolean', () => {
    const current = fixture(), nativeCall = vi.spyOn(current.catalog.resolve(a).shape, 'clone');
    expect(() => current.catalog.stageMerge({ ...a, sourceFeatureId: 'foreign' }, current.boxB, { sourceFeatureId: 'merge', lineage: 'x' })).toThrow(/estado/);
    expect(() => current.catalog.stageScopedCut([{ ...a, bodyId: 'suppressed' }], current.boxB, { sourceFeatureId: 'cut', lineage: 'x' })).toThrow(/ausente/);
    expect(() => current.catalog.stageScopedCut([a, a], current.boxB, { sourceFeatureId: 'cut', lineage: 'x' })).toThrow(/dos veces/);
    const sparse = new Array<BodyReference>(2); sparse[0] = a;
    expect(() => current.catalog.stageScopedCut(sparse, current.boxB, { sourceFeatureId: 'cut', lineage: 'x' })).toThrow(/vacías/);
    expect(() => current.catalog.stageScopedCut(Array.from({ length: 257 }, () => a), current.boxB, { sourceFeatureId: 'cut', lineage: 'x' })).toThrow(/256/);
    const reusedId = combine('add'); if (reusedId.operation !== 'subtract') reusedId.resultBodyId = a.bodyId;
    expect(() => current.catalog.stageCombine(reusedId, 'x')).toThrow(/nueva identidad/);
    expect(nativeCall).not.toHaveBeenCalled();
    unchanged(current.catalog);
  }, 60_000);
});

describe('scoped modifications and failure preservation', () => {
  it('keeps a contained intersection as a distinct modeled result and retains both operands', () => {
    const current = fixture(), contained = shape(makeBox([2, 1, 1], [8, 5, 3]));
    const edited = committed(current.catalog.stageReplace(b, contained, { sourceFeatureId: 'contained-b', lineage: 'contained' }));
    const feature = combine('common', true);
    if (feature.operation === 'subtract') throw new Error('Common fixture required');
    const currentB = { ...b, sourceFeatureId: 'contained-b' }; feature.operands = [a, currentB];
    const next = committed(edited.catalog.stageCombine(feature, 'contained-common'));
    const result = next.catalog.resolve(resultRef(feature)), tool = next.catalog.resolve(currentB);
    expect(result.shape.isSame(tool.shape)).toBe(false);
    // Inner box dimensions 6x4x2: V48/A88, retained twice with outer A V240/A248.
    const expected: Metrics = { volume: 48, area: 88, bounds: [[2, 1, 1], [8, 5, 3]], solids: 1 };
    expectMetrics(result.shape, expected); expectMetrics(tool.shape, expected);
    expectMetrics(next.aggregate, { volume: 336, area: 424, bounds: [[0, 0, 0], [10, 6, 4]], solids: 3 });
    expectMetrics(edited.catalog.resolve(a).shape, boxMetrics(0, 10)); expectMetrics(edited.catalog.resolve(currentB).shape, expected);
  }, 60_000);

  it('duplicates geometry for external modifiers without shared face or edge topology', () => {
    const current = fixture(), copied = shape(copyBodyShape(current.catalog.resolve(a).shape));
    expect(copied.isSame(current.catalog.resolve(a).shape)).toBe(false);
    const sourceFaces = current.catalog.resolve(a).shape.faces, copiedFaces = copied.faces;
    const sourceEdges = current.catalog.resolve(a).shape.edges, copiedEdges = copied.edges;
    try {
      expect(copiedFaces).toHaveLength(6); expect(copiedEdges).toHaveLength(12);
      expect(copiedFaces.every(target => sourceFaces.every(source => !target.isSame(source)))).toBe(true);
      expect(copiedEdges.every(target => sourceEdges.every(source => !target.isSame(source)))).toBe(true);
    } finally { [...sourceFaces, ...copiedFaces, ...sourceEdges, ...copiedEdges].forEach(owner => owner.delete()); }
    expectMetrics(copied, boxMetrics(0, 10)); unchanged(current.catalog);
  }, 60_000);

  it('sets safe-processing mode before an actual Boolean build and keeps borrowed operands unchanged', () => {
    const current = fixture(), tool = shape(makeBox([0, 0, 0], [2, 6, 4])), oc = getOC();
    const nativeBuild = oc.BRepAlgoAPI_Cut.prototype.Build;
    const observed = vi.spyOn(oc.BRepAlgoAPI_Cut.prototype, 'Build').mockImplementation(function (
      this: InstanceType<typeof oc.BRepAlgoAPI_Cut>, ...args: Parameters<typeof nativeBuild>
    ) {
      expect(this.NonDestructive()).toBe(true);
      return nativeBuild.apply(this, args);
    });
    const result = shape(bodyBoolean('subtract', current.catalog.resolve(a).shape, tool));
    expect(observed).toHaveBeenCalledTimes(1);
    expectMetrics(result, boxMetrics(2, 10)); expectMetrics(tool, boxMetrics(0, 2)); unchanged(current.catalog);
  }, 60_000);

  it('preserves source and tool geometry when a native exception follows a completed Boolean build', () => {
    const current = fixture(), tool = shape(makeBox([0, 0, 0], [2, 6, 4])), oc = getOC();
    const nativeBuild = oc.BRepAlgoAPI_Cut.prototype.Build;
    const observed = vi.spyOn(oc.BRepAlgoAPI_Cut.prototype, 'Build').mockImplementation(function (
      this: InstanceType<typeof oc.BRepAlgoAPI_Cut>, ...args: Parameters<typeof nativeBuild>
    ) {
      expect(this.NonDestructive()).toBe(true);
      nativeBuild.apply(this, args);
      throw new Error('Injected failure after native Boolean build');
    });
    expect(() => current.catalog.stageScopedCut([a], tool, { sourceFeatureId: 'failed-native', lineage: 'failure' })).toThrow(/after native Boolean/);
    expect(observed).toHaveBeenCalledTimes(1); expectMetrics(tool, boxMetrics(0, 2)); unchanged(current.catalog);
  }, 60_000);

  it('merges only the exact target and advances its own lineage without changing the creator', () => {
    const current = fixture(20), tool = shape(makeBox([10, 0, 0], [12, 6, 4]));
    const next = committed(current.catalog.stageMerge(a, tool, { sourceFeatureId: 'merge-a', lineage: 'addition', name: 'A length 12' }));
    const selected = next.catalog.resolve({ bodyId: a.bodyId, sourceFeatureId: 'merge-a' });
    expectMetrics(selected.shape, boxMetrics(0, 12));
    expect(selected.createdByFeatureId).toBe('create-a'); expect(selected.name).toBe('A length 12');
    expect(selected.lineage).not.toBe(current.catalog.resolve(a).lineage);
    expect(next.catalog.resolve(b).lineage).toBe(current.catalog.resolve(b).lineage);
    expectMetrics(next.catalog.resolve(b).shape, boxMetrics(20, 30)); unchanged(current.catalog, 20);
  }, 60_000);

  it('cuts only the selected body and rejects selecting an unaffected body or a partly invalid scope', () => {
    const current = fixture(20), tool = shape(makeBox([0, 0, 0], [2, 6, 4]));
    const update = { sourceFeatureId: 'cut-a', lineage: 'cut' }, next = committed(current.catalog.stageScopedCut([a], tool, update));
    expectMetrics(next.catalog.resolve({ bodyId: a.bodyId, sourceFeatureId: 'cut-a' }).shape, boxMetrics(2, 10));
    expectMetrics(next.catalog.resolve(b).shape, boxMetrics(20, 30));
    expect(() => current.catalog.stageScopedCut([b], tool, update)).toThrow(/cada cuerpo/);
    expect(() => current.catalog.stageScopedCut([a, b], tool, update)).toThrow(/cada cuerpo/);
    unchanged(current.catalog, 20);
  }, 60_000);

  it('validates every replacement before committing and leaves borrowed candidates owned by the caller', () => {
    const current = fixture(20), candidateA = shape(makeBox([0, 0, 0], [9, 6, 4])), candidateB = shape(makeBox([20, 0, 0], [29, 6, 4]));
    const next = committed(current.catalog.stageReplaceMany([{ ref: a, shape: candidateA }, { ref: b, shape: candidateB }],
      { sourceFeatureId: 'replace-both', lineage: 'two-replacements' }));
    expectMetrics(next.catalog.resolve({ ...a, sourceFeatureId: 'replace-both' }).shape, boxMetrics(0, 9));
    expectMetrics(next.catalog.resolve({ ...b, sourceFeatureId: 'replace-both' }).shape, boxMetrics(20, 29));
    expectMetrics(candidateA, boxMetrics(0, 9)); expectMetrics(candidateB, boxMetrics(20, 29));
    // makeCompound consumes its input wrappers; transfer clones, preserving the borrowed candidates.
    const invalid = shape(makeCompound([candidateA.clone(), candidateB.clone()]).asShape3D());
    expect(() => current.catalog.stageReplaceMany([{ ref: a, shape: candidateA }, { ref: b, shape: invalid }],
      { sourceFeatureId: 'failed-replace', lineage: 'invalid-second' })).toThrow(/exactamente un sólido/);
    expectMetrics(candidateA, boxMetrics(0, 9)); expectMetrics(candidateB, boxMetrics(20, 29));
    expect(() => current.catalog.stageReplaceMany([{ ref: a, shape: candidateA }, { ref: a, shape: candidateB }],
      { sourceFeatureId: 'duplicate', lineage: 'duplicate' })).toThrow(/dos veces/);
    unchanged(current.catalog, 20);
  }, 60_000);

  it.each(['disjoint-add', 'empty-common', 'erased-subtract', 'split-subtract'] as const)(
    'rejects %s atomically under the explicit initial single-output policy', scenario => {
      const current = fixture(scenario === 'disjoint-add' || scenario === 'empty-common' ? 20 : 5);
      if (scenario === 'disjoint-add' || scenario === 'empty-common') {
        expect(() => current.catalog.stageCombine(combine(scenario === 'disjoint-add' ? 'add' : 'common'), 'invalid')).toThrow();
        unchanged(current.catalog, 20); return;
      }
      const tool = shape(scenario === 'erased-subtract' ? makeBox([-1, -1, -1], [11, 7, 5]) : makeBox([4, 0, 0], [6, 6, 4]));
      const updated = committed(current.catalog.stageReplace(b, tool, { sourceFeatureId: 'tool-edit', lineage: scenario }));
      const feature = combine('subtract'); if (feature.operation !== 'subtract') throw new Error('Subtract fixture required');
      feature.tools = [{ bodyId: b.bodyId, sourceFeatureId: 'tool-edit' }];
      expect(() => updated.catalog.stageCombine(feature, 'invalid')).toThrow();
      expectMetrics(updated.catalog.resolve(a).shape, boxMetrics(0, 10));
      expect(updated.catalog.entries()).toHaveLength(2); unchanged(current.catalog);
    }, 60_000);

  it('releases already-created candidates once if cloning a later unchanged entry fails', () => {
    const current = fixture(20), tool = shape(makeBox([0, 0, 0], [2, 6, 4]));
    const copied = current.catalog.resolve(a).shape.clone(), deleted = vi.spyOn(copied, 'delete');
    vi.spyOn(current.catalog.resolve(a).shape, 'clone').mockReturnValueOnce(copied);
    vi.spyOn(current.catalog.resolve(b).shape, 'clone').mockImplementationOnce(() => { throw new Error('Injected later clone failure'); });
    expect(() => current.catalog.stageScopedCut([a], tool, { sourceFeatureId: 'cut', lineage: 'failed' })).toThrow(/later clone/);
    expect(deleted).toHaveBeenCalledTimes(1); unchanged(current.catalog, 20);
  }, 60_000);

  it('preserves both operation and cleanup errors without retrying a wrapper release', () => {
    const current = fixture(20), tool = shape(makeBox([0, 0, 0], [2, 6, 4]));
    const copied = current.catalog.resolve(a).shape.clone(), release = copied.delete.bind(copied);
    const deleted = vi.spyOn(copied, 'delete').mockImplementation(() => { release(); throw new Error('Injected cleanup failure'); });
    vi.spyOn(current.catalog.resolve(a).shape, 'clone').mockReturnValueOnce(copied);
    vi.spyOn(current.catalog.resolve(b).shape, 'clone').mockImplementationOnce(() => { throw new Error('Injected later clone failure'); });
    let failure: unknown;
    try { current.catalog.stageScopedCut([a], tool, { sourceFeatureId: 'cut', lineage: 'failed' }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map(error => (error as Error).message)).toEqual(['Injected later clone failure', 'Injected cleanup failure']);
    expect(deleted).toHaveBeenCalledTimes(1); unchanged(current.catalog, 20);
  }, 60_000);

  it('attempts every transaction release once even when an entry release fails', () => {
    const current = fixture(), transaction = proposed(current.catalog.stageCombine(combine('add', true), 'dispose'));
    const [first, second] = transaction.nextEntries, actual = first.shape.delete.bind(first.shape);
    const bad = vi.spyOn(first.shape, 'delete').mockImplementation(() => { actual(); throw new Error('Injected disposal failure'); });
    const other = vi.spyOn(second.shape, 'delete'), aggregate = vi.spyOn(transaction.aggregate, 'delete');
    expect(() => transaction.dispose()).toThrow(AggregateError);
    transaction.dispose(); expect(bad).toHaveBeenCalledTimes(1); expect(other).toHaveBeenCalledTimes(1); expect(aggregate).toHaveBeenCalledTimes(1);
    expect(() => transaction.commit()).toThrow(/descartó/); unchanged(current.catalog);
  }, 60_000);

  it('rejects a multi-solid entry rather than identifying a solid by its measured size', () => {
    const current = fixture(), duplicate = shape(makeCompound([current.boxA, current.boxB]).asShape3D());
    expect(() => validateBodyShape(duplicate)).toThrow(/exactamente un sólido/);
    expect(() => current.catalog.stageNew(metadata({ bodyId: 'body-invalid', sourceFeatureId: 'invalid' }), duplicate)).toThrow(/exactamente un sólido/);
    unchanged(current.catalog);
  }, 60_000);
});
