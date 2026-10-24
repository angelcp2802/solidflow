import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, isShape3D, measureShapeSurfaceProperties, setOC } from 'replicad';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { createCompletedPartSequenceDocument, createPartSequenceDocument } from '../examples/part-sequence';
import { DocumentHistory, parseDocument, serializeDocument, updateFeature, type Document } from '../model/document';
import { CadEngine } from './kernel.engine';

const engine = new CadEngine();
const volumeTolerance = 1e-5, areaTolerance = 1e-5, coordinateTolerance = 1e-6;
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => engine.dispose());

function checkBuild(document: Document, volume: number, height: number, width = 20) {
  const result = engine.build(document.features);
  expect(result.featureErrors).toEqual([]);
  expect(result.bodyCatalogActive).toBe(true);
  expect(result.bodies).toHaveLength(1);
  expect(Math.abs(result.bodies![0].volume - volume)).toBeLessThan(volumeTolerance);
  const expected = [[-width / 2, -6, 0], [width / 2, 6, height]];
  [result.bodies![0].bounds.min, result.bodies![0].bounds.max].forEach((side, i) =>
    side.forEach((value, j) => expect(Math.abs(value - expected[i][j])).toBeLessThan(coordinateTolerance)));
  return result;
}

async function checkNativeExport(document: Document, volume: number, area: number) {
  const shape = await importSTEP(engine.export('step', document.features));
  try {
    expect(isShape3D(shape)).toBe(true);
    if (!isShape3D(shape)) throw new Error('Expected a closed original part.');
    const oc = getOC(), analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false);
    const mass = new oc.GProp_GProps(), surface = measureShapeSurfaceProperties(shape);
    const solids = shape.solids;
    try {
      expect(analyzer.IsValid()).toBe(true);
      expect(solids).toHaveLength(1);
      oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
      expect(Math.abs(mass.Mass() - volume)).toBeLessThan(volumeTolerance);
      expect(Math.abs(surface.area - area)).toBeLessThan(areaTolerance);
    } finally {
      solids.forEach(solid => solid.delete()); surface.delete(); mass.delete(); analyzer.delete();
    }
  } finally { shape.delete(); }
}

it('chains separate sketches, two remote cuts and two merged bosses with saved references and history', async () => {
  const document = createCompletedPartSequenceDocument();
  const volumes = [960, 944, 928, 976, 984], heights = [4, 4, 4, 7, 9];
  for (let operation = 0; operation < 5; operation++) {
    const prefix = { ...document, features: document.features.slice(0, 2 * (operation + 1)) };
    const result = checkBuild(prefix, volumes[operation], heights[operation]);
    expect(result.bodies![0].ref).toEqual({ bodyId: 'seq-body', sourceFeatureId: prefix.features.at(-1)!.id });
  }
  const reopened = parseDocument(serializeDocument(document));
  expect(reopened.features).toEqual(document.features);
  checkBuild(reopened, 984, 9);
  // Base area 736; two holes +48; boss +48; cap +16 = 848 mm².
  await checkNativeExport(reopened, 984, 848);
  const history = new DocumentHistory(document);
  const changed = { ...document, features: createCompletedPartSequenceDocument(5).features };
  history.apply(changed);
  // Added base layer contributes (20*12 - 2*2*2)*1 = 232 mm³.
  checkBuild(parseDocument(serializeDocument(changed)), 1216, 10);
  await checkNativeExport(changed, 1216, 928);
  checkBuild(history.undo(), 984, 9);
  checkBuild(history.redo(), 1216, 10);
}, 60_000);

it('provides a valid starting body with four unused independent sketches for renderer authoring', () => {
  const document = createPartSequenceDocument();
  expect(document.features.filter(feature => feature.type === 'sketch')).toHaveLength(5);
  checkBuild(parseDocument(serializeDocument(document)), 960, 4);
});

it('rebuilds all downstream cuts and bosses after widening the consumed base sketch', async () => {
  const original = createCompletedPartSequenceDocument();
  const sketch = original.features[0];
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'rectangle') throw Error('Expected original rectangular base sketch.');
  const changed = updateFeature(original, sketch.id, { profile: { ...sketch.profile, width: 22 } });
  expect(changed.features.slice(1)).toEqual(original.features.slice(1));
  const history = new DocumentHistory(original);
  history.apply(changed);
  // Added base strip: 2*12*4=96 mm³. New exterior area: 2*2*(12+4)=64 mm².
  checkBuild(parseDocument(serializeDocument(changed)), 1080, 9, 22);
  await checkNativeExport(changed, 1080, 912);
  checkBuild(history.undo(), 984, 9);
  checkBuild(history.redo(), 1080, 9, 22);
}, 60_000);
