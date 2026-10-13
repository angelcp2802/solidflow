import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, isShape3D, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature, validateDocument, type Document } from '../model/document';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog } from './kernel.bodies';
import * as faceCatalogs from './kernel.faces';
import * as patternGeometry from './kernel.patterns';
import type { BodyReference, CadResult, CombineFeature, Feature, HoleFeature, PickableBody, PickableFace } from './kernel.types';

// Original Cartesian fixtures in millimeters: A=[0,10]x[0,6]x[0,4],
// B=[5,15]x[0,6]x[0,4], or B=[20,30] for selective cutting.
// Expected mass/area/bounds are analytical. STEP uses the same kernel and
// does not establish independent interoperability or preserve document IDs.
const engine = new CadEngine(), tolerance = 5e-6, coordinateTolerance = 5e-7;
const a: BodyReference = { bodyId: 'workflow-body-a', sourceFeatureId: 'create-a' };
const b: BodyReference = { bodyId: 'workflow-body-b', sourceFeatureId: 'create-b' };
type Metrics = { volume: number; area: number; bounds: number[][]; count: number };
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => { vi.restoreAllMocks(); engine.dispose(); });

function boxes(secondX = 5): Document {
  return validateDocument({ ...createDocument('Original explicit body workflow'), features: [
    { id: 'sketch-a', type: 'sketch', name: 'Original A rectangle', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [5, 3], width: 10, height: 6 }, suppressed: false },
    { id: 'create-a', type: 'extrude', name: 'Body A', sketchId: 'sketch-a', depth: 4, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: a.bodyId }, suppressed: false },
    { id: 'sketch-b', type: 'sketch', name: 'Original B rectangle', plane: 'XY', offset: 0,
      profile: { kind: 'rectangle', center: [secondX + 5, 3], width: 10, height: 6 }, suppressed: false },
    { id: 'create-b', type: 'extrude', name: 'Body B', sketchId: 'sketch-b', depth: 4, symmetric: false,
      bodyOperation: { mode: 'new', bodyId: b.bodyId }, suppressed: false },
  ] });
}
function combination(operation: 'add' | 'common' | 'subtract', reverse = false, keepTools = false): CombineFeature {
  const common = { id: 'combine', type: 'combine' as const, name: 'Original two-box combination', suppressed: false, keepTools };
  return operation === 'subtract'
    ? { ...common, operation, target: reverse ? b : a, tools: [reverse ? a : b] }
    : { ...common, operation, operands: reverse ? [b, a] : [a, b], resultBodyId: 'workflow-combined-body' };
}
function healthy(document: Document): CadResult {
  const saved = serializeDocument(document), result = engine.build(document.features);
  expect(serializeDocument(document)).toBe(saved);
  expect(result.featureErrors).toEqual([]);
  expect(result.bodyCatalogActive).toBe(true);
  expect(structuredClone(result)).toEqual(result);
  return result;
}
function body(result: CadResult, id: string): PickableBody {
  const matches = result.bodies?.filter(item => item.ref.bodyId === id);
  expect(matches).toHaveLength(1);
  return matches![0];
}
function expectBody(value: PickableBody, ref: BodyReference, volume: number, bounds: number[][]) {
  expect(value.ref).toEqual(ref);
  expect(Math.abs(value.volume - volume)).toBeLessThan(tolerance);
  [value.bounds.min, value.bounds.max].forEach((side, i) => side.forEach((coordinate, j) =>
    expect(Math.abs(coordinate - bounds[i][j])).toBeLessThan(tolerance)));
  expect(value.triangles.length).toBeGreaterThan(0);
  expect(value.faces.length).toBeGreaterThan(0); expect(value.edges.length).toBeGreaterThan(0);
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
      while (explorer.More()) {
        const shell = own(explorer.Current()); expect(oc.BRep_Tool.IsClosed(shell)).toBe(true);
        shells++; explorer.Next();
      }
      expect(shells).toBeGreaterThan(0);
    }
    const mass = own(new oc.GProp_GProps()), surface = own(measureShapeSurfaceProperties(shape)), box = own(shape.boundingBox);
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    return { volume: mass.Mass(), area: surface.area, bounds: box.bounds, count: solids.length };
  } finally {
    const errors: unknown[] = [];
    for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Original body workflow measurement release failed.');
  }
}
async function exported(document: Document, wanted: Metrics) {
  const imported = await importSTEP(engine.export('step', document.features));
  try {
    expect(isShape3D(imported)).toBe(true);
    if (!isShape3D(imported)) throw new Error('Expected a native closed-shape STEP round trip.');
    const actual = measure(imported, wanted.count);
    expect(Math.abs(actual.volume - wanted.volume)).toBeLessThan(tolerance);
    expect(Math.abs(actual.area - wanted.area)).toBeLessThan(tolerance);
    actual.bounds.forEach((side, i) => side.forEach((coordinate, j) =>
      expect(Math.abs(coordinate - wanted.bounds[i][j])).toBeLessThan(tolerance)));
  } finally { imported.delete(); }
}
function topFace(value: PickableBody): PickableFace {
  const top = value.faces.filter(face => face.frame && Math.abs(face.frame.normal[2] - 1) < coordinateTolerance);
  expect(top).toHaveLength(1); return top[0];
}
function verticalCorner(value: PickableBody): PickableBody['edges'][number] {
  const selected = value.edges.filter(edge => {
    const points = Array.from({ length: edge.lines.length / 3 }, (_, i) => edge.lines.slice(i * 3, i * 3 + 3));
    return points.length >= 2 && points.every(point => Math.abs(point[0] - 10) < coordinateTolerance
      && Math.abs(point[1] - 6) < coordinateTolerance)
      && Math.abs(Math.min(...points.map(point => point[2]))) < coordinateTolerance
      && Math.abs(Math.max(...points.map(point => point[2])) - 4) < coordinateTolerance;
  });
  expect(selected).toHaveLength(1); return selected[0];
}
function localPoint(face: PickableFace, world: number[]): [number, number] {
  const frame = face.frame!;
  const x = frame.xDirection, n = frame.normal;
  const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
  const delta = world.map((coordinate, i) => coordinate - frame.origin[i]);
  return [delta.reduce((sum, coordinate, i) => sum + coordinate * x[i], 0),
    delta.reduce((sum, coordinate, i) => sum + coordinate * y[i], 0)];
}
function scopedHole(face: PickableFace, target: BodyReference): HoleFeature {
  const [x, y] = localPoint(face, [5, 3, 4]);
  return { id: 'hole', type: 'hole', name: 'Original scoped R1 hole', baseFeatureId: target.sourceFeatureId,
    bodyScope: [{ ...target }], support: { kind: 'face', face: { ...face.ref } }, positions: [{ id: 'center', x, y }],
    reversed: false, diameter: 2, head: { kind: 'simple' }, endCondition: { kind: 'throughAll' }, suppressed: false };
}

it.each([
  { operation: 'add' as const, reverse: false, volume: 360, area: 348, bounds: [[0, 0, 0], [15, 6, 4]], bodyId: 'workflow-combined-body' },
  { operation: 'common' as const, reverse: false, volume: 120, area: 148, bounds: [[5, 0, 0], [10, 6, 4]], bodyId: 'workflow-combined-body' },
  { operation: 'subtract' as const, reverse: false, volume: 120, area: 148, bounds: [[0, 0, 0], [5, 6, 4]], bodyId: a.bodyId },
  { operation: 'subtract' as const, reverse: true, volume: 120, area: 148, bounds: [[10, 0, 0], [15, 6, 4]], bodyId: b.bodyId },
])('reopens and exports $operation reverse=$reverse with exact operands, identity and independent box metrics', async wanted => {
  const original = boxes(), initial = healthy(original);
  expect(initial.bodies).toHaveLength(2);
  const document = addFeature(original, combination(wanted.operation, wanted.reverse));
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expect(result.bodies).toHaveLength(1);
  expectBody(body(result, wanted.bodyId), { bodyId: wanted.bodyId, sourceFeatureId: 'combine' }, wanted.volume, wanted.bounds);
  expect(reopened.features.at(-1)).toEqual(document.features.at(-1));
  await exported(reopened, { ...wanted, count: 1 });
}, 60_000);

it.each([
  { operation: 'add' as const, volume: 384, area: 368, bounds: [[0, 0, 0], [16, 6, 4]] },
  { operation: 'common' as const, volume: 96, area: 128, bounds: [[6, 0, 0], [10, 6, 4]] },
  { operation: 'subtract' as const, volume: 144, area: 168, bounds: [[0, 0, 0], [6, 6, 4]] },
])('edits B by +1 before $operation without replacing its saved identity or operands', async wanted => {
  const original = addFeature(boxes(), combination(wanted.operation));
  const changed = updateFeature(parseDocument(serializeDocument(original)), 'sketch-b',
    { profile: { kind: 'rectangle', center: [11, 3], width: 10, height: 6 } });
  expect(changed.features[3]).toEqual(original.features[3]); expect(changed.features[4]).toEqual(original.features[4]);
  const result = healthy(changed), id = wanted.operation === 'subtract' ? a.bodyId : 'workflow-combined-body';
  expectBody(body(result, id), { bodyId: id, sourceFeatureId: 'combine' }, wanted.volume, wanted.bounds);
  await exported(changed, { ...wanted, count: 1 });
}, 60_000);

it.each([
  { operation: 'add' as const, volume: 840, area: 844, count: 3 },
  { operation: 'common' as const, volume: 600, area: 644, count: 3 },
  { operation: 'subtract' as const, volume: 360, area: 396, count: 2 },
])('exports retained operands for $operation without an implicit union or tool consumption', async wanted => {
  const original = boxes(), initial = healthy(original), oldB = structuredClone(body(initial, b.bodyId));
  const document = addFeature(original, combination(wanted.operation, false, true)), result = healthy(document);
  expect(result.bodies).toHaveLength(wanted.count); expect(body(result, b.bodyId)).toEqual(oldB);
  if (wanted.operation !== 'subtract') expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId));
  await exported(document, { ...wanted, bounds: [[0, 0, 0], [15, 6, 4]] });
}, 60_000);

it('cuts only A, preserves B, and restores exact current states with undo/redo and reopened committed STEP', async () => {
  const original = boxes(20), initial = healthy(original), oldB = structuredClone(body(initial, b.bodyId));
  const history = new DocumentHistory(original);
  const sketch: Feature = { id: 'cut-sketch', type: 'sketch', name: 'Original R1 removal', plane: 'XY', offset: 0,
    profile: { kind: 'circle', center: [5, 3], radius: 1 }, suppressed: false };
  const document = addFeature(addFeature(original, sketch), { id: 'cut', type: 'cut', name: 'Only A',
    sketchId: sketch.id, depth: 4, symmetric: false, bodyScope: [a], suppressed: false });
  history.apply(document); const result = healthy(history.current);
  expectBody(body(result, a.bodyId), { bodyId: a.bodyId, sourceFeatureId: 'cut' }, 240 - 4 * Math.PI, [[0, 0, 0], [10, 6, 4]]);
  expect(body(result, b.bodyId)).toEqual(oldB);
  expect(healthy(history.undo()).bodies?.map(value => value.ref)).toEqual([a, b]);
  const reopened = parseDocument(serializeDocument(history.redo())); healthy(reopened);
  await exported(reopened, { volume: 480 - 4 * Math.PI, area: 496 + 6 * Math.PI,
    bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it('rejects selecting B when the hole tool intersects only A and keeps both last-valid bodies', () => {
  const original = boxes(20), initial = healthy(original);
  const document = addFeature(original, scopedHole(topFace(body(initial, a.bodyId)), b));
  const rejected = engine.build(document.features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual(['hole']);
  expect(rejected.bodies).toEqual(initial.bodies);
  expect(() => engine.export('step')).toThrow(/errores/);
}, 60_000);

it('merges an explicit boss into A while preserving distant B and the saved target identity', async () => {
  const original = boxes(20), initial = healthy(original), oldB = structuredClone(body(initial, b.bodyId));
  const document = addFeature(addFeature(original, { id: 'merge-sketch', type: 'sketch', name: 'Original extending rectangle',
    plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [11, 3], width: 6, height: 6 }, suppressed: false }),
  { id: 'merge-a', type: 'extrude', name: 'Extend only A', sketchId: 'merge-sketch', depth: 4, symmetric: false,
    bodyOperation: { mode: 'merge', target: { ...a } }, suppressed: false });
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expect(result.bodies).toHaveLength(2);
  expectBody(body(result, a.bodyId), { bodyId: a.bodyId, sourceFeatureId: 'merge-a' },
    336, [[0, 0, 0], [14, 6, 4]]);
  expect(body(result, b.bodyId)).toEqual(oldB);
  await exported(reopened, { volume: 576, area: 576, bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it('chamfers one selected A edge through its body-owned key and leaves B unchanged', async () => {
  const original = boxes(20), initial = healthy(original), source = body(initial, a.bodyId);
  const selected = verticalCorner(source);
  const document = addFeature(original, { id: 'chamfer-a', type: 'chamfer', name: 'Original unit corner bevel',
    size: 1, baseFeatureId: a.sourceFeatureId, bodyScope: { ...a },
    selection: { mode: 'selected', edges: [{ ...selected.ref }] }, suppressed: false });
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expectBody(body(result, a.bodyId), { bodyId: a.bodyId, sourceFeatureId: 'chamfer-a' },
    238, [[0, 0, 0], [10, 6, 4]]);
  expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  await exported(reopened, { volume: 478, area: 487 + 4 * Math.SQRT2,
    bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it('scoped finish fillet uses the A edge key and exports its analytical quarter-round geometry', async () => {
  const original = boxes(20), initial = healthy(original), selected = verticalCorner(body(initial, a.bodyId));
  const document = addFeature(original, { id: 'fillet-a', type: 'fillet', name: 'Original unit corner round', size: 1,
    baseFeatureId: a.sourceFeatureId, bodyScope: { ...a },
    selection: { mode: 'selected', edges: [{ ...selected.ref }] }, suppressed: false });
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expectBody(body(result, a.bodyId), { bodyId: a.bodyId, sourceFeatureId: 'fillet-a' },
    236 + Math.PI, [[0, 0, 0], [10, 6, 4]]);
  expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  await exported(reopened, { volume: 476 + Math.PI, area: 486 + 2.5 * Math.PI,
    bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it('scoped finish shell opens only A top face and preserves B through reopening and STEP', async () => {
  const original = boxes(20), initial = healthy(original), selected = topFace(body(initial, a.bodyId));
  const document = addFeature(original, { id: 'shell-a', type: 'shell', name: 'Original inward open box', thickness: 1,
    direction: 'inward', baseFeatureId: a.sourceFeatureId, bodyScope: { ...a },
    removedFaces: [{ ...selected.ref }], suppressed: false });
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expectBody(body(result, a.bodyId), { bodyId: a.bodyId, sourceFeatureId: 'shell-a' },
    144, [[0, 0, 0], [10, 6, 4]]);
  expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  await exported(reopened, { volume: 384, area: 568, bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it('scoped finish draft narrows all four A walls from the neutral plane and preserves B', async () => {
  const original = boxes(20), initial = healthy(original);
  const selected = body(initial, a.bodyId).faces.filter(face => face.frame
    && Math.abs(face.frame.normal[2]) < coordinateTolerance);
  expect(selected).toHaveLength(4);
  const document = addFeature(original, { id: 'draft-a', type: 'draft', name: 'Original five-degree wall draft',
    angle: 5, reversed: false, baseFeatureId: a.sourceFeatureId, bodyScope: { ...a },
    support: { kind: 'principal', plane: 'XY' }, faces: selected.map(face => ({ ...face.ref })),
    propagation: 'tangent', suppressed: false });
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  const radians = 5 * Math.PI / 180, slope = Math.tan(radians);
  const volume = 240 - 256 * slope + 256 / 3 * slope * slope;
  const area = 120 - 128 * slope + 64 * slope * slope + (128 - 64 * slope) / Math.cos(radians);
  expectBody(body(result, a.bodyId), { bodyId: a.bodyId, sourceFeatureId: 'draft-a' },
    volume, [[0, 0, 0], [10, 6, 4]]);
  expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  await exported(reopened, { volume: 240 + volume, area: 248 + area,
    bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it.each(['throughAll', 'untilNext'] as const)('uses the saved B limit for a new body with $0 despite overlapping taller A', async kind => {
  let original = updateFeature(boxes(), 'sketch-a', { offset: -4 });
  original = updateFeature(original, 'create-a', { depth: 14 });
  const initial = healthy(original), height = kind === 'throughAll' ? 6 : 2;
  const document = addFeature(addFeature(original, { id: 'limited-new-sketch', type: 'sketch', name: 'Original limited R1 profile',
    plane: 'XY', offset: -2, profile: { kind: 'circle', center: [7, 3], radius: 1 }, suppressed: false }),
  { id: 'limited-new', type: 'extrude', name: 'New body limited only by B', sketchId: 'limited-new-sketch',
    depth: 1, symmetric: false, bodyOperation: { mode: 'new', bodyId: 'workflow-limit-body' }, suppressed: false,
    endCondition: kind === 'throughAll' ? { kind, baseFeatureId: b.sourceFeatureId, baseBody: { ...b }, bothDirections: false }
      : { kind, baseFeatureId: b.sourceFeatureId, baseBody: { ...b } } });
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expect(result.bodies).toHaveLength(3);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId)); expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  expectBody(body(result, 'workflow-limit-body'), { bodyId: 'workflow-limit-body', sourceFeatureId: 'limited-new' },
    height * Math.PI, [[6, 2, -2], [8, 4, height - 2]]);
  await exported(reopened, { volume: 1080 + height * Math.PI, area: 816 + (2 * height + 2) * Math.PI,
    bounds: [[0, 0, -4], [15, 6, 10]], count: 3 });
}, 60_000);

it('does not retarget a saved new-body limit when the same earlier cut is redirected from A to B', () => {
  const cutRef = { bodyId: a.bodyId, sourceFeatureId: 'limit-cut' };
  const cutDocument = addFeature(addFeature(boxes(20), { id: 'limit-cut-sketch', type: 'sketch', name: 'Original shared channel',
    plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [15, 3], width: 40, height: 2 }, suppressed: false }),
  { id: 'limit-cut', type: 'cut', name: 'Editable target channel', sketchId: 'limit-cut-sketch', depth: 1,
    symmetric: false, bodyScope: [{ ...a }], suppressed: false });
  const document = addFeature(addFeature(cutDocument, { id: 'saved-limit-sketch', type: 'sketch', name: 'Original saved limit profile',
    plane: 'XY', offset: -2, profile: { kind: 'circle', center: [5, 1], radius: 0.25 }, suppressed: false }),
  { id: 'saved-limit-new', type: 'extrude', name: 'Saved A limit', sketchId: 'saved-limit-sketch', depth: 1,
    symmetric: false, bodyOperation: { mode: 'new', bodyId: 'saved-limit-body' }, suppressed: false,
    endCondition: { kind: 'throughAll', baseFeatureId: cutRef.sourceFeatureId, baseBody: cutRef, bothDirections: false } });
  healthy(document);
  const saved = serializeDocument(document);
  const changed = document.features.map(feature => feature.id === 'limit-cut' && feature.type === 'cut'
    ? { ...feature, bodyScope: [{ ...b }] } : feature);
  const baseline = healthy(validateDocument({ ...document, features: changed.slice(0, -1) }));
  const rejected = engine.build(changed);
  expect(rejected.featureErrors.map(error => error.id)).toEqual(['saved-limit-new']);
  expect(rejected.bodies).toEqual(baseline.bodies); expect(serializeDocument(document)).toBe(saved);
  expect(() => engine.export('step')).toThrow(/errores/);
}, 60_000);

it('rejects a disconnected merge instead of creating an unnamed extra body or consuming B', () => {
  const original = boxes(20), initial = healthy(original);
  const document = addFeature(addFeature(original, { id: 'remote-merge-sketch', type: 'sketch', name: 'Original remote rectangle',
    plane: 'XY', offset: 0, profile: { kind: 'rectangle', center: [45, 3], width: 10, height: 6 }, suppressed: false }),
  { id: 'remote-merge', type: 'extrude', name: 'Disconnected tool', sketchId: 'remote-merge-sketch', depth: 4, symmetric: false,
    bodyOperation: { mode: 'merge', target: { ...a } }, suppressed: false });
  const rejected = engine.build(document.features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual(['remote-merge']);
  expect(rejected.bodies).toEqual(initial.bodies);
  expect(() => engine.export('step')).toThrow(/errores/);
}, 60_000);

it('rolls back the whole multi-body geometric cut when its second target has no material at the tool', () => {
  const original = boxes(20), initial = healthy(original);
  const document = addFeature(addFeature(original, { id: 'late-invalid-sketch', type: 'sketch', name: 'Original A-only circle',
    plane: 'XY', offset: 4, profile: { kind: 'circle', center: [5, 3], radius: 1 }, suppressed: false }),
  { id: 'late-invalid-cut', type: 'cut', name: 'Invalid second selected target', sketchId: 'late-invalid-sketch',
    depth: -1, symmetric: false, bodyScope: [{ ...a }, { ...b }], suppressed: false,
    endCondition: { kind: 'throughAll', baseFeatureId: a.sourceFeatureId, bothDirections: false } });
  const rejected = engine.build(parseDocument(serializeDocument(document)).features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual(['late-invalid-cut']);
  expect(rejected.bodies).toEqual(initial.bodies);
  expect(() => engine.export('step')).toThrow(/errores/);
}, 60_000);

it('uses A historical body-face support after creating B and performs a real scoped through hole', async () => {
  const original = boxes(20), initial = healthy(original), face = topFace(body(initial, a.bodyId));
  const document = addFeature(original, scopedHole(face, a));
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expect((reopened.features.at(-1) as HoleFeature).support).toEqual({ kind: 'face', face: face.ref });
  expect(body(result, b.bodyId)).toEqual(body(initial, b.bodyId));
  await exported(reopened, { volume: 480 - 4 * Math.PI, area: 496 + 6 * Math.PI,
    bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it('retains B own face keys for a supported sketch and cut after unrelated A creation', async () => {
  const original = boxes(20), initial = healthy(original), face = topFace(body(initial, b.bodyId));
  const center = localPoint(face, [25, 3, 4]);
  const document = addFeature(addFeature(original, { id: 'supported-b-sketch', type: 'sketch', name: 'B face sketch',
    plane: 'XY', offset: 0, support: { kind: 'face', face: face.ref },
    profile: { kind: 'circle', center, radius: 1 }, suppressed: false }),
  { id: 'supported-b-cut', type: 'cut', name: 'B face removal', sketchId: 'supported-b-sketch',
    depth: -4, symmetric: false, bodyScope: [b], suppressed: false });
  const reopened = parseDocument(serializeDocument(document)), result = healthy(reopened);
  expect(body(result, a.bodyId)).toEqual(body(initial, a.bodyId));
  expectBody(body(result, b.bodyId), { bodyId: b.bodyId, sourceFeatureId: 'supported-b-cut' },
    240 - 4 * Math.PI, [[20, 0, 0], [30, 6, 4]]);
  await exported(reopened, { volume: 480 - 4 * Math.PI, area: 496 + 6 * Math.PI,
    bounds: [[0, 0, 0], [30, 6, 4]], count: 2 });
}, 60_000);

it('rejects a body-aware hole with a suppressed plane instead of exporting an omitted operation', () => {
  let original = boxes(20);
  original = addFeature(original, { id: 'suppressed-plane', type: 'plane', name: 'Suppressed support',
    support: { kind: 'principal', plane: 'XY' }, offset: 4, reversed: false, suppressed: true });
  const initial = healthy(original), operation = scopedHole(topFace(body(initial, a.bodyId)), a);
  operation.support = { kind: 'plane', planeId: 'suppressed-plane' };
  const rejected = engine.build(addFeature(original, operation).features);
  expect(rejected.featureErrors).toHaveLength(1);
  expect(rejected.featureErrors[0].message).toMatch(/soporte.*suprimido/);
  expect(rejected.bodies).toEqual(initial.bodies); expect(() => engine.export('step')).toThrow(/errores/);
}, 60_000);

it('blocks a consumed current body reference while keeping the completed combination available for repair', () => {
  const combined = addFeature(boxes(), combination('add')), initial = healthy(combined);
  const rejected = engine.build(addFeature(combined, { id: 'stale-combine', name: 'Consumed A',
    type: 'combine', operation: 'subtract', target: a,
    tools: [{ bodyId: 'workflow-combined-body', sourceFeatureId: 'combine' }], keepTools: false, suppressed: false }).features);
  expect(rejected.featureErrors.map(error => error.id)).toEqual(['stale-combine']);
  expect(rejected.bodies).toEqual(initial.bodies); expect(() => engine.export('step')).toThrow(/errores/);
}, 60_000);

it('fails closed if retiring the old catalog fails after a state transfer', () => {
  const original = boxes();
  const dispose = NativeBodyCatalog.prototype.dispose;
  let injected = false;
  vi.spyOn(NativeBodyCatalog.prototype, 'dispose').mockImplementation(function(this: NativeBodyCatalog) {
    const retiringA = !injected && this.entries().length === 1 && this.entries()[0].ref.sourceFeatureId === a.sourceFeatureId;
    dispose.call(this);
    if (retiringA) { injected = true; throw new Error('Injected previous catalog release failure.'); }
  });
  expect(() => engine.build(original.features)).toThrow(/Previous body catalog release failed/);
  expect(injected).toBe(true);
  expect(() => engine.export('step')).toThrow(/ningún sólido/);
}, 60_000);

it('fails closed when historical face metadata cannot be finalized after committing a new body', () => {
  const original = boxes(20), initial = healthy(original), face = topFace(body(initial, b.bodyId));
  const document = addFeature(original, { id: 'future-b-sketch', type: 'sketch', name: 'Future body-face support',
    plane: 'XY', offset: 0, support: { kind: 'face', face: { ...face.ref } },
    profile: { kind: 'circle', center: [0, 0], radius: 1 }, suppressed: false });
  const createFaceCatalog = faceCatalogs.createFaceCatalog;
  let injected = false;
  vi.spyOn(faceCatalogs, 'createFaceCatalog').mockImplementation((...args) => {
    if (args[1] === b.sourceFeatureId) {
      injected = true;
      throw new Error('Injected historical metadata construction failure.');
    }
    return createFaceCatalog(...args);
  });
  expect(() => engine.build(document.features)).toThrow(/Injected historical metadata construction failure/);
  expect(injected).toBe(true);
  expect(() => engine.export('step')).toThrow(/ningún sólido/);
}, 60_000);

it.each([false, true])('releases registered history deltas and preserves errors when isolated-copy cleanup fails, deltaFailure=%s', failDelta => {
  const document = addFeature(boxes(20), { id: 'future-pattern', type: 'linearPattern', name: 'Future feature-history consumer',
    baseFeatureId: b.sourceFeatureId, source: { mode: 'features', geometryPattern: true, featureIds: [b.sourceFeatureId] },
    first: { direction: [1, 0, 0], spacing: 40, count: 2 }, second: null, secondSeedOnly: false, skipped: [], suppressed: false });
  const geometryDelta = patternGeometry.geometryDelta;
  const deltaError = new Error('Injected isolated history geometry failure');
  const releaseError = new Error('Injected isolated history copy release failure');
  let disposeCount = 0, invoked = false;
  vi.spyOn(patternGeometry, 'geometryDelta').mockImplementation((...args) => {
    invoked = true;
    const deleteCopy = args[1].delete.bind(args[1]);
    vi.spyOn(args[1], 'delete').mockImplementationOnce(() => { deleteCopy(); throw releaseError; });
    if (failDelta) throw deltaError;
    const delta = geometryDelta(...args), disposeDelta = delta.dispose.bind(delta);
    vi.spyOn(delta, 'dispose').mockImplementation(() => { disposeCount++; disposeDelta(); });
    return delta;
  });
  let failure: unknown;
  try { engine.build(document.features); } catch (error) { failure = error; }
  expect(invoked).toBe(true); expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toContain(releaseError);
  if (failDelta) expect((failure as AggregateError).errors).toContain(deltaError);
  else expect(disposeCount).toBe(1);
  expect(() => engine.export('step')).toThrow(/ningún sólido/);
}, 60_000);

it.each(['throughAll', 'untilNext'] as const)('computes $0 on each selected body before one atomic multi-body cut', async kind => {
  const original = boxes(), initial = healthy(original);
  const document = addFeature(addFeature(original, { id: 'two-target-sketch', type: 'sketch', name: 'Original shared hole',
    plane: 'XY', offset: 4, profile: { kind: 'circle', center: [7, 3], radius: 1 }, suppressed: false }),
  { id: 'two-target-cut', type: 'cut', name: 'Explicit A and B removal', sketchId: 'two-target-sketch',
    depth: -1, symmetric: false, bodyScope: [a, b], suppressed: false,
    endCondition: kind === 'throughAll' ? { kind, baseFeatureId: a.sourceFeatureId, bothDirections: false }
      : { kind, baseFeatureId: a.sourceFeatureId } });
  const result = healthy(parseDocument(serializeDocument(document)));
  expect(result.bodies).toHaveLength(2);
  expectBody(body(result, a.bodyId), { bodyId: a.bodyId, sourceFeatureId: 'two-target-cut' },
    240 - 4 * Math.PI, [[0, 0, 0], [10, 6, 4]]);
  expectBody(body(result, b.bodyId), { bodyId: b.bodyId, sourceFeatureId: 'two-target-cut' },
    240 - 4 * Math.PI, [[5, 0, 0], [15, 6, 4]]);
  expect(body(initial, a.bodyId).ref).toEqual(a); expect(body(initial, b.bodyId).ref).toEqual(b);
  await exported(document, { volume: 480 - 8 * Math.PI, area: 496 + 12 * Math.PI,
    bounds: [[0, 0, 0], [15, 6, 4]], count: 2 });
}, 60_000);
