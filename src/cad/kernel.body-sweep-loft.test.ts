import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, isShape3D, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { CadEngine } from './kernel.engine';
import type { BodyOperation, BodyReference, CadResult, Feature, LoftFeature, PickableBody, PickableFace, SketchFeature, SweepFeature } from './kernel.types';

// Original millimeter inputs. Sweep is a circle translated along a straight
// world-Z path; loft uses two explicitly aligned ruled circular sections.
// Expected cylinder/frustum metrics are independent analytical formulas.
const engine = new CadEngine(), tolerance = 5e-6, coordinateTolerance = 5e-7;
const a: BodyReference = { bodyId: 'curve-body-a', sourceFeatureId: 'create-a' };
const b: BodyReference = { bodyId: 'curve-body-b', sourceFeatureId: 'create-b' };
const cId = 'curve-body-c';
type Kind = 'sweep' | 'loft';
type Metrics = { volume: number; area: number; bounds: number[][]; count: number };
type ExpectedBody = { ref: BodyReference; creator: string; metrics: Metrics };
interface Producer {
  inputs: [SketchFeature, SketchFeature];
  feature: SweepFeature | LoftFeature;
}

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => engine.dispose());

function circle(id: string, radius: number, z: number): SketchFeature {
  return { id, name: id, type: 'sketch', plane: 'XY', offset: z,
    profile: { kind: 'circle', center: [0, 0], radius }, suppressed: false };
}
function producer(kind: Kind, tag: string, operation: BodyOperation, start = 0): Producer {
  const first = circle(`${tag}-profile`, 2, start), end = start + 4;
  const common = { id: `${tag}-producer`, name: `Original ${kind} ${tag}`, suppressed: false,
    merge: operation.mode === 'merge', bodyOperation: structuredClone(operation) };
  if (kind === 'loft') {
    const second = circle(`${tag}-top`, 2, end);
    return { inputs: [first, second], feature: { ...common, type: 'loft', ruled: true,
      sections: [first, second].map(section => ({ sketchId: section.id, startEntityId: null, reversed: false })) } };
  }
  const path: SketchFeature = { id: `${tag}-path`, name: `${tag} straight Z path`, type: 'sketch',
    plane: 'XZ', offset: 0, suppressed: false, profile: { kind: 'entities', constraints: [],
      points: [{ id: 'start', x: 0, y: start }, { id: 'end', x: 0, y: end }],
      entities: [{ id: 'segment', type: 'line', start: 'start', end: 'end', construction: false }] } };
  return { inputs: [first, path], feature: { ...common, type: 'sweep', profileSketchId: first.id,
    pathSketchId: path.id, path: [{ entityId: 'segment', reversed: false }], orientation: 'followPath' } };
}
function append(document: Document, value: Producer): Document {
  return [...value.inputs, value.feature].reduce((current, feature) => addFeature(current, feature), document);
}
function cylinder(radius: number, height: number, start = 0): Metrics {
  return { volume: Math.PI * radius ** 2 * height, area: 2 * Math.PI * radius * (radius + height),
    bounds: [[-radius, -radius, start], [radius, radius, start + height]], count: 1 };
}
function editedFirst(kind: Kind): Metrics {
  return kind === 'sweep' ? cylinder(3, 4)
    : { volume: 76 * Math.PI / 3, area: (13 + 5 * Math.sqrt(17)) * Math.PI,
      bounds: [[-3, -3, 0], [3, 3, 4]], count: 1 };
}
function editedMerge(kind: Kind, cut = false): Metrics {
  // Sweep: R2 lower cylinder + R3 upper cylinder, including its exposed step.
  // Loft: R2 lower cylinder + an R2-to-R3, height-4 conical frustum.
  return { volume: (kind === 'sweep' ? 52 : 124 / 3) * Math.PI - (cut ? 8 * Math.PI : 0),
    area: (kind === 'sweep' ? 58 : 29 + 5 * Math.sqrt(17)) * Math.PI + (cut ? 14 * Math.PI : 0),
    bounds: [[-3, -3, 0], [3, 3, 8]], count: 1 };
}
const boxB: Metrics = { volume: 240, area: 248, bounds: [[20, 0, 0], [30, 6, 4]], count: 1 };
function aggregate(values: Metrics[]): Metrics {
  return { volume: values.reduce((sum, value) => sum + value.volume, 0),
    area: values.reduce((sum, value) => sum + value.area, 0), count: values.reduce((sum, value) => sum + value.count, 0),
    bounds: [0, 1].map(side => [0, 1, 2].map(axis =>
      (side === 0 ? Math.min : Math.max)(...values.map(value => value.bounds[side][axis])))) };
}
function baseline(coaxialB = false): Document {
  const second: SketchFeature = coaxialB ? circle('sketch-b', 2, 4)
    : { id: 'sketch-b', name: 'Distant B rectangle', type: 'sketch', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [25, 3], width: 10, height: 6 }, suppressed: false };
  return validateDocument({ ...createDocument('Original body sweep/loft fixture'), features: [
    circle('sketch-a', 2, 0),
    { id: a.sourceFeatureId, name: 'Original A cylinder', type: 'extrude', sketchId: 'sketch-a', depth: 4,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: a.bodyId }, suppressed: false }, second,
    { id: b.sourceFeatureId, name: 'Original B', type: 'extrude', sketchId: second.id, depth: 4,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: b.bodyId }, suppressed: false },
  ] });
}
function editGeometry(document: Document, value: Producer, kind: Kind): Document {
  const id = value.inputs[kind === 'sweep' ? 0 : 1].id;
  const source = document.features.find(feature => feature.id === id);
  if (!source || source.type !== 'sketch' || source.profile.kind !== 'circle') throw new Error('Expected original circular input.');
  return updateFeature(document, id, { ...source, profile: { ...source.profile, radius: 3 } });
}
function selected(result: CadResult, id: string): PickableBody {
  const matches = result.bodies?.filter(value => value.ref.bodyId === id);
  expect(matches).toHaveLength(1); return matches![0];
}
function near(actual: number, wanted: number) { expect(Math.abs(actual - wanted)).toBeLessThan(tolerance); }
function bounds(actual: number[][], wanted: number[][]) {
  actual.forEach((side, i) => side.forEach((coordinate, j) => near(coordinate, wanted[i][j])));
}
function expectBody(result: CadResult, wanted: ExpectedBody) {
  const value = selected(result, wanted.ref.bodyId);
  expect(value.ref).toEqual(wanted.ref); expect(value.createdByFeatureId).toBe(wanted.creator);
  near(value.volume, wanted.metrics.volume); bounds([value.bounds.min, value.bounds.max], wanted.metrics.bounds);
  expect(value.triangles.length).toBeGreaterThan(0); expect(value.faces.length).toBeGreaterThan(0); expect(value.edges.length).toBeGreaterThan(0);
  for (const item of [...value.faces, ...value.edges]) expect(item.ref.sourceFeatureId).toBe(wanted.ref.sourceFeatureId);
}
function healthy(document: Document, wanted: ExpectedBody[]): CadResult {
  const before = serializeDocument(document), result = engine.build(document.features), total = aggregate(wanted.map(value => value.metrics));
  expect(serializeDocument(document)).toBe(before); expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual(total.count > 1 ? [`La pieza contiene ${total.count} sólidos separados.`] : []);
  expect(result.bodyCatalogActive).toBe(true); expect(result.bodies).toHaveLength(wanted.length);
  expect(structuredClone(result)).toEqual(result);
  near(result.volume, total.volume); bounds([result.bounds.min, result.bounds.max], total.bounds);
  wanted.forEach(value => expectBody(result, value)); return result;
}
function expectSamePicking(before: CadResult, after: CadResult, id: string) {
  const previous = selected(before, id), current = selected(after, id);
  expect(current.ref).toEqual(previous.ref); expect(current.createdByFeatureId).toBe(previous.createdByFeatureId);
  const refs = (items: PickableBody['faces'] | PickableBody['edges']) => items.map(item => item.ref)
    .sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
  expect(refs(current.faces)).toEqual(refs(previous.faces)); expect(refs(current.edges)).toEqual(refs(previous.edges));
}
function measure(shape: Shape3D, count: number): Metrics {
  const owners: { delete(): void }[] = [];
  function own<T extends { delete(): void }>(value: T): T { owners.push(value); return value; }
  try {
    const oc = getOC(), analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const solids = shape.solids; solids.forEach(own); expect(solids).toHaveLength(count);
    for (const solid of solids) {
      const explorer = own(new oc.TopExp_Explorer(solid.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      let shells = 0;
      while (explorer.More()) { const shell = own(explorer.Current()); expect(oc.BRep_Tool.IsClosed(shell)).toBe(true); shells++; explorer.Next(); }
      expect(shells).toBeGreaterThan(0);
    }
    const mass = own(new oc.GProp_GProps()), surface = own(measureShapeSurfaceProperties(shape)), box = own(shape.boundingBox);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    return { volume: mass.Mass(), area: surface.area, bounds: box.bounds, count: solids.length };
  } finally {
    const errors: unknown[] = [];
    for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Original sweep/loft measurement release failed.');
  }
}
function matches(actual: Metrics, wanted: Metrics): boolean {
  return actual.count === wanted.count && Math.abs(actual.volume - wanted.volume) < tolerance
    && Math.abs(actual.area - wanted.area) < tolerance
    && actual.bounds.every((side, i) => side.every((coordinate, j) => Math.abs(coordinate - wanted.bounds[i][j]) < tolerance));
}
async function exported(document: Document, wanted: Metrics[]) {
  const imported = await importSTEP(engine.export('step', document.features));
  try {
    expect(isShape3D(imported)).toBe(true); if (!isShape3D(imported)) throw new Error('Expected closed native STEP geometry.');
    const total = aggregate(wanted); expect(matches(measure(imported, total.count), total)).toBe(true);
    const solids = imported.solids;
    try {
      const remaining = solids.map(solid => measure(solid, 1));
      // STEP has no document IDs: compare an unordered geometric multiset only.
      for (const value of wanted) {
        const indices = remaining.flatMap((actual, index) => matches(actual, value) ? [index] : []);
        expect(indices).toHaveLength(1); remaining.splice(indices[0], 1);
      }
      expect(remaining).toEqual([]);
    } finally { solids.forEach(solid => solid.delete()); }
  } finally { imported.delete(); }
}
function topFace(value: PickableBody, height: number): PickableFace {
  const matches = value.faces.filter(face => face.frame && Math.abs(face.frame.normal[2] - 1) < coordinateTolerance
    && Math.abs(face.frame.origin[2] - height) < coordinateTolerance);
  expect(matches).toHaveLength(1); return matches[0];
}
function cutOnTop(document: Document, value: PickableBody): Document {
  const face = topFace(value, 8), frame = face.frame!, delta = frame.origin.map(coordinate => -coordinate);
  delta[2] += 8;
  const x = frame.xDirection, n = frame.normal, y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
  const center: [number, number] = [delta.reduce((sum, coordinate, i) => sum + coordinate * x[i], 0),
    delta.reduce((sum, coordinate, i) => sum + coordinate * y[i], 0)];
  const sketch: SketchFeature = { id: 'scoped-cut-profile', name: 'Original axial R1 cut', type: 'sketch', plane: 'XY', offset: 0,
    support: { kind: 'face', face: { ...face.ref } }, profile: { kind: 'circle', radius: 1, center }, suppressed: false };
  return addFeature(addFeature(document, sketch), { id: 'selective-cut', name: 'Cut only A', type: 'cut', sketchId: sketch.id,
    depth: -8, symmetric: false, bodyScope: [{ ...value.ref }],
    endCondition: { kind: 'throughAll', baseFeatureId: value.ref.sourceFeatureId, bothDirections: false }, suppressed: false });
}
function rejectedFeatures(original: Document, features: Feature[], id: string, wanted: ExpectedBody[], message?: RegExp) {
  // Intentionally do not parse/serialize the proposal: this also checks raw
  // worker/kernel inputs that a document parser would normally reject.
  const initial = healthy(original, wanted), saved = structuredClone(features), result = engine.build(features);
  expect(features).toStrictEqual(saved); expect(result.featureErrors.map(error => error.id)).toEqual([id]);
  if (message) expect(result.featureErrors[0].message).toMatch(message);
  expect(result.bodies).toHaveLength(wanted.length); wanted.forEach(value => expectBody(result, value));
  wanted.forEach(value => expectSamePicking(initial, result, value.ref.bodyId));
  near(result.volume, aggregate(wanted.map(value => value.metrics)).volume);
  expect(() => engine.export('step', features)).toThrow(/errores/);
}
function rejected(original: Document, proposal: Document, id: string, wanted: ExpectedBody[]) {
  const saved = serializeDocument(proposal);
  rejectedFeatures(original, proposal.features, id, wanted);
  expect(serializeDocument(proposal)).toBe(saved);
}
const baseBodies = (): ExpectedBody[] => [
  { ref: a, creator: a.sourceFeatureId, metrics: cylinder(2, 4) },
  { ref: b, creator: b.sourceFeatureId, metrics: boxB },
];

describe.each(['sweep', 'loft'] as const)('explicit %s body workflow', kind => {
  it('creates the first solid with persistent identity, edits its geometry, and reopens undo/redo STEP states', async () => {
    const value = producer(kind, 'first', { mode: 'new', bodyId: a.bodyId });
    const original = append(createDocument(`Original first ${kind}`), value), ref = { bodyId: a.bodyId, sourceFeatureId: value.feature.id };
    const wanted = (metrics: Metrics): ExpectedBody[] => [{ ref, creator: value.feature.id, metrics }];
    healthy(original, wanted(cylinder(2, 4))); await exported(original, [cylinder(2, 4)]);
    const history = new DocumentHistory(original), edited = editGeometry(original, value, kind);
    history.apply(edited);
    const reopened = parseDocument(serializeDocument(history.current)); expect(reopened.features).toEqual(edited.features);
    healthy(reopened, wanted(editedFirst(kind)));
    expect(history.undo().features).toEqual(original.features); healthy(history.current, wanted(cylinder(2, 4)));
    expect(history.redo().features).toEqual(edited.features); healthy(history.current, wanted(editedFirst(kind)));
    expect(history.current.features.find(feature => feature.id === value.feature.id)).toEqual(value.feature);
    await exported(history.current, [editedFirst(kind)]);
  }, 60_000);

  it('creates an additional touching body without merging A or replacing distant B and its picking references', async () => {
    const original = baseline(), initial = healthy(original, baseBodies());
    const value = producer(kind, 'additional', { mode: 'new', bodyId: cId }, 4), document = append(original, value);
    const reopened = parseDocument(serializeDocument(document)); expect(reopened.features).toEqual(document.features);
    const wanted = [...baseBodies(), { ref: { bodyId: cId, sourceFeatureId: value.feature.id }, creator: value.feature.id, metrics: cylinder(2, 4, 4) }];
    const result = healthy(reopened, wanted);
    expectSamePicking(initial, result, a.bodyId); expectSamePicking(initial, result, b.bodyId);
    // New and merge have identical aggregate volume/bounds here; area and solid
    // count distinguish the two independent touching solids from a fusion.
    await exported(reopened, wanted.map(item => item.metrics));
  }, 60_000);

  it('merges only A, edits the producer, and preserves B through a saved face-supported selective cut and history', async () => {
    const original = baseline(), initial = healthy(original, baseBodies()), value = producer(kind, 'merge', { mode: 'merge', target: a }, 4);
    const document = append(original, value), ref = { bodyId: a.bodyId, sourceFeatureId: value.feature.id };
    const wanted = (metrics: Metrics, current = ref): ExpectedBody[] => [
      { ref: current, creator: a.sourceFeatureId, metrics }, { ref: b, creator: b.sourceFeatureId, metrics: boxB },
    ];
    const merged = healthy(document, wanted(cylinder(2, 8))); expectSamePicking(initial, merged, b.bodyId);
    await exported(document, [cylinder(2, 8), boxB]);
    const history = new DocumentHistory(document), edited = editGeometry(document, value, kind); history.apply(edited);
    let result = healthy(history.current, wanted(editedMerge(kind))); expectSamePicking(initial, result, b.bodyId);
    await exported(history.current, [editedMerge(kind), boxB]);
    expect(history.undo().features).toEqual(document.features); healthy(history.current, wanted(cylinder(2, 8)));
    expect(history.redo().features).toEqual(edited.features); result = healthy(history.current, wanted(editedMerge(kind)));
    const top = topFace(selected(result, a.bodyId), 8), cut = cutOnTop(history.current, selected(result, a.bodyId)); history.apply(cut);
    const reopened = parseDocument(serializeDocument(history.current)); expect(reopened.features).toEqual(cut.features);
    expect(reopened.features.find(feature => feature.id === 'scoped-cut-profile')).toMatchObject({ support: { kind: 'face', face: top.ref } });
    expect(reopened.features.find(feature => feature.id === 'selective-cut')).toMatchObject({ bodyScope: [ref] });
    const cutRef = { bodyId: a.bodyId, sourceFeatureId: 'selective-cut' };
    result = healthy(reopened, wanted(editedMerge(kind, true), cutRef)); expectSamePicking(initial, result, b.bodyId);
    expect(history.undo().features).toEqual(edited.features); healthy(history.current, wanted(editedMerge(kind)));
    expect(history.redo().features).toEqual(cut.features); result = healthy(history.current, wanted(editedMerge(kind, true), cutRef));
    expectSamePicking(initial, result, b.bodyId); await exported(history.current, [editedMerge(kind, true), boxB]);
  }, 60_000);

  it('rejects a disconnected selected B even though the tool connects to unselected A, without partial replacement or export', () => {
    const original = baseline(), value = producer(kind, 'wrong-target', { mode: 'merge', target: b }, 4);
    rejected(original, append(original, value), value.feature.id, baseBodies());
  }, 60_000);

  it('rejects raw-engine malformed modes and contradictory merge flags without implicit creation or fusion', () => {
    const original = baseline();
    for (const operation of [{ mode: 'new', bodyId: cId }, { mode: 'merge', target: a }] as BodyOperation[]) {
      const value = producer(kind, 'contradictory', operation, 4);
      const invalid = { ...value.feature, merge: !value.feature.merge };
      rejectedFeatures(original, [...original.features, ...value.inputs, invalid], value.feature.id, baseBodies(), /cuerpo|operación/);
    }
    for (const bodyOperation of [{ mode: 'unknown', target: a }, null, undefined, []]) {
      const value = producer(kind, 'malformed', { mode: 'merge', target: a }, 4);
      // This is an intentionally invalid runtime payload, not a normal model.
      const invalid = { ...value.feature, bodyOperation, merge: false } as unknown as Feature;
      expect(Object.hasOwn(invalid, 'bodyOperation')).toBe(true);
      rejectedFeatures(original, [...original.features, ...value.inputs, invalid], value.feature.id, baseBodies(), /cuerpo|operación/);
      expect(Object.hasOwn(invalid, 'bodyOperation')).toBe(true);
    }
  }, 60_000);

  it('rejects either legacy merge setting in an active catalog instead of assigning implicit body ownership', () => {
    const original = baseline();
    for (const merge of [false, true]) {
      const value = producer(kind, 'legacy-in-catalog', { mode: 'new', bodyId: cId }, 4);
      delete value.feature.bodyOperation; value.feature.merge = merge;
      const proposal = append(original, value);
      expect(Object.hasOwn(proposal.features.at(-1)!, 'bodyOperation')).toBe(false);
      rejected(original, proposal, value.feature.id, baseBodies());
    }
  }, 60_000);

  it('rejects a stale A state instead of rebinding it to the later modifying feature', () => {
    const original = baseline();
    const extended = addFeature(addFeature(original, circle('advance-profile', 2, 4)), {
      id: 'advance-a', name: 'Advance A current state', type: 'extrude', sketchId: 'advance-profile', depth: 2,
      symmetric: false, bodyOperation: { mode: 'merge', target: a }, suppressed: false,
    });
    const value = producer(kind, 'stale', { mode: 'merge', target: a }, 4);
    rejected(extended, append(extended, value), value.feature.id, [
      { ref: { ...a, sourceFeatureId: 'advance-a' }, creator: a.sourceFeatureId, metrics: cylinder(2, 6) },
      { ref: b, creator: b.sourceFeatureId, metrics: boxB },
    ]);
  }, 60_000);

  it('rejects a consumed A instead of resolving the new Combine result as its replacement', () => {
    const original = baseline(true), combined = addFeature(original, { id: 'consume-a-b', name: 'Original coaxial union', type: 'combine',
      operation: 'add', operands: [a, b], resultBodyId: 'combined-curve-body', keepTools: false, suppressed: false });
    const value = producer(kind, 'consumed', { mode: 'merge', target: a }, 4);
    rejected(combined, append(combined, value), value.feature.id, [{
      ref: { bodyId: 'combined-curve-body', sourceFeatureId: 'consume-a-b' }, creator: 'consume-a-b', metrics: cylinder(2, 8),
    }]);
  }, 60_000);

  it.each([0, 1] as const)('rejects suppressed input %s for an explicit output and retains both prior bodies', index => {
    const original = baseline(), value = producer(kind, 'suppressed', { mode: 'new', bodyId: cId }, 4);
    const input = value.inputs[index], proposal = updateFeature(append(original, value), input.id, { ...input, suppressed: true });
    rejected(original, proposal, value.feature.id, baseBodies());
  }, 60_000);
});
