import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, isShape3D, measureShapeSurfaceProperties, setOC } from 'replicad';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { DocumentHistory, parseDocument, serializeDocument, validateDocument, type Document } from '../model/document';
import { CadEngine } from './kernel.engine';
import type { CadResult, FaceReference, Feature, SketchFeature } from './kernel.types';

// Original Cartesian recipes in mm, authored here without external models.
// Each new support is selected from the immediately preceding native build.
const engine = new CadEngine();
const lengthTolerance = 1e-6, propertyTolerance = 1e-5;
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => engine.dispose());
const body = (sourceFeatureId: string) => ({ bodyId: 'fresh-body', sourceFeatureId });
function rectangle(id: string, size: number, face: FaceReference): SketchFeature {
  return { id, name: id, type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    support: { kind: 'face', face: structuredClone(face) },
    profile: { kind: 'rectangle', center: [0, 0], width: size, height: size } };
}
function base(): Document {
  return validateDocument({ version: 1, id: 'fresh-original', name: 'Original fresh support sequence', units: 'mm',
    createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', features: [
      { id: 'fresh-base-profile', name: 'Base profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width: 20, height: 12 } },
      { id: 'fresh-base', name: 'Base', type: 'extrude', sketchId: 'fresh-base-profile', depth: 4,
        symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'fresh-body' } },
    ] });
}
function build(document: Document, volume: number, height: number, producer: string) {
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.bodyCatalogActive).toBe(true);
  expect(result.bodies).toHaveLength(1);
  expect(result.bodies![0].ref).toEqual(body(producer));
  expect(Math.abs(result.bodies![0].volume - volume)).toBeLessThan(propertyTolerance);
  const expected = [[-10, -6, 0], [10, 6, height]];
  [result.bodies![0].bounds.min, result.bodies![0].bounds.max].forEach((side, i) =>
    side.forEach((value, j) => expect(Math.abs(value - expected[i][j])).toBeLessThan(lengthTolerance)));
  return result;
}
function top(result: CadResult, z: number, producer: string) {
  const current = result.bodies![0];
  const faces = current.faces.filter(face => face.frame && face.frame.normal[2] > 1 - 1e-10
    && Math.abs(face.frame.origin[2] - z) < 1e-10);
  expect(faces).toHaveLength(1);
  const face = faces[0];
  expect(face.ref.sourceFeatureId).toBe(producer);
  const support = engine.inspectCurrentFaceSupport(face.ref, current.ref);
  expect(support.kind).toBe('plane');
  if (support.kind !== 'plane') throw Error('Expected native planar support.');
  expect(Math.abs(support.point[2] - z)).toBeLessThan(1e-10);
  expect(support.normal[2]).toBeGreaterThan(1 - 1e-10);
  return structuredClone(face.ref);
}
async function native(document: Document, volume: number, area: number) {
  const shape = await importSTEP(engine.export('step', document.features));
  try {
    expect(isShape3D(shape)).toBe(true);
    if (!isShape3D(shape)) throw Error('Expected closed original solid.');
    const oc = getOC(), analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
    const mass = new oc.GProp_GProps(), surface = measureShapeSurfaceProperties(shape), solids = shape.solids;
    try {
      expect(analyzer.IsValid()).toBe(true);
      expect(solids).toHaveLength(1);
      oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
      expect(Math.abs(mass.Mass() - volume)).toBeLessThan(propertyTolerance);
      expect(Math.abs(surface.area - area)).toBeLessThan(propertyTolerance);
    } finally { solids.forEach(solid => solid.delete()); surface.delete(); mass.delete(); analyzer.delete(); }
  } finally { shape.delete(); }
}
function append(document: Document, ...features: Feature[]) {
  return validateDocument({ ...document, features: [...document.features, ...features] });
}
function sequence() {
  const initial = base(), first = top(build(initial, 960, 4, 'fresh-base'), 4, 'fresh-base');
  const raised = append(initial, rectangle('fresh-boss-profile', 4, first), {
    id: 'fresh-boss', name: 'Boss', type: 'extrude', sketchId: 'fresh-boss-profile', depth: 3,
    symmetric: false, suppressed: false, bodyOperation: { mode: 'merge', target: body('fresh-base') },
  });
  const second = top(build(raised, 1008, 7, 'fresh-boss'), 7, 'fresh-boss');
  const cut = append(raised, rectangle('fresh-cut-profile', 2, second), {
    id: 'fresh-cut', name: 'Cut', type: 'cut', sketchId: 'fresh-cut-profile', depth: -3,
    symmetric: false, suppressed: false, bodyScope: [body('fresh-boss')],
  });
  return { initial, raised, cut, first, second };
}
function frames(result: CadResult, baseZ: number, bossZ: number) {
  for (const [id, z] of [['fresh-boss-profile', baseZ], ['fresh-cut-profile', bossZ]] as const) {
    const frame = result.sketches?.find(sketch => sketch.id === id)?.frame;
    expect(frame).toBeDefined();
    expect(Math.abs(frame!.origin[2] - z)).toBeLessThan(lengthTolerance);
    expect(frame!.normal[2]).toBeGreaterThan(1 - 1e-10);
  }
}

it('creates two fresh face-supported sketches through boss/cut, reconstruction and history', async () => {
  const { initial, raised, cut, first, second } = sequence();
  // Box: V960/A736. Boss adds V48/A48. Pocket removes V12 and adds A24.
  await native(initial, 960, 736);
  await native(raised, 1008, 784);
  const reopened = parseDocument(serializeDocument(cut));
  expect(reopened.features).toEqual(cut.features);
  for (const [id, ref] of [['fresh-boss-profile', first], ['fresh-cut-profile', second]] as const) {
    const sketch = reopened.features.find(feature => feature.id === id);
    if (!sketch || sketch.type !== 'sketch') throw Error('Expected saved supported sketch.');
    expect(sketch.support).toEqual({ kind: 'face', face: ref });
  }
  engine.dispose(); // Reconstruct from saved declarations with no prior native face cache.
  frames(build(reopened, 996, 7, 'fresh-cut'), 4, 7);
  await native(reopened, 996, 808);
  const history = new DocumentHistory(initial);
  history.apply(raised); history.apply(reopened);
  build(history.undo(), 1008, 7, 'fresh-boss');
  build(history.undo(), 960, 4, 'fresh-base');
  build(history.redo(), 1008, 7, 'fresh-boss');
  frames(build(history.redo(), 996, 7, 'fresh-cut'), 4, 7);
  engine.dispose();
  const repeated = sequence();
  expect(repeated.first).toEqual(first); expect(repeated.second).toEqual(second);
  frames(build(repeated.cut, 996, 7, 'fresh-cut'), 4, 7);
  await native(repeated.cut, 996, 808);
}, 60_000);

it('retains both native support references after editing the upstream base depth', async () => {
  const { cut } = sequence(), edited = parseDocument(serializeDocument(cut));
  const extrusion = edited.features.find(feature => feature.id === 'fresh-base');
  if (!extrusion || extrusion.type !== 'extrude') throw Error('Expected base extrusion.');
  extrusion.depth = 5;
  engine.dispose();
  // An additional 20x12x1 layer adds V240 and perimeter64 to the area.
  frames(build(edited, 1236, 8, 'fresh-cut'), 5, 8);
  await native(edited, 1236, 872);
  expect(edited.features.filter(feature => feature.type === 'sketch')).toEqual(cut.features.filter(feature => feature.type === 'sketch'));
  const history = new DocumentHistory(cut); history.apply(edited);
  frames(build(history.undo(), 996, 7, 'fresh-cut'), 4, 7);
  frames(build(history.redo(), 1236, 8, 'fresh-cut'), 5, 8);
}, 60_000);
