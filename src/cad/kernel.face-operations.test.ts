import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, measureShapeVolumeProperties, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import type { CadResult, DraftFeature, EdgeFinishFeature, Feature, PickableFace, ShellFeature, SketchFeature } from './kernel.types';
import { createFaceOperationExample } from '../examples/face-operations';
import { parseDocument, serializeDocument } from '../model/document';
import { castOwnedNativeShape, castOwnedNativeSolid } from './kernel.native';

const engine = new CadEngine();
beforeAll(async () => {
  const wasmBinary = await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'));
  setOC(await initOpenCascade({ wasmBinary, print: () => undefined }));
}, 60_000);
afterEach(() => engine.dispose());

const uiReports: unknown[] = [];
afterAll(async () => {

  if (process.env.SOLIDFLOW_CAD_REPORT === '1' && uiReports.length === 8) {
    await writeFile(new URL('../../artifacts/verify-ui-face-operations-export.json', import.meta.url), JSON.stringify(uiReports, null, 2) + '\n');
  }
});

function box(): Feature[] {
  return [{ id: 'sketch', name: 'Rectángulo', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'rectangle', width: 40, height: 30, center: [0, 0] } },
  { id: 'base', name: 'Base', type: 'extrude', sketchId: 'sketch', depth: 20, symmetric: false, suppressed: false }];
}
function cylinder(): Feature[] { const features = box(); (features[0] as SketchFeature).profile = { kind: 'circle', center: [0, 0], radius: 15 }; return features; }
function good(features: Feature[]): CadResult { const result = engine.build(features); expect(result.featureErrors).toEqual([]); expect(result.warnings).toEqual([]); return result; }
function shell(source: CadResult, selected: (face: PickableFace) => boolean = face => (face.frame?.normal[2] ?? 0) > .99): ShellFeature {
  return { id: 'shell', name: 'Vaciado', type: 'shell', baseFeatureId: 'base', suppressed: false,
    thickness: 2, direction: 'inward', removedFaces: source.faces!.filter(selected).map(face => face.ref) };
}
function draft(source: CadResult, selected: (face: PickableFace) => boolean = face => !face.frame || Math.abs(face.frame.normal[2]) < .01): DraftFeature {
  return { id: 'draft', name: 'Desmoldeo', type: 'draft', baseFeatureId: 'base', suppressed: false, angle: 5, reversed: false,
    propagation: 'tangent', support: { kind: 'principal', plane: 'XY' }, faces: source.faces!.filter(selected).map(face => face.ref) };
}
async function roundTrip(expectedVolume: number, expectedBounds?: CadResult['bounds'], expectedShells?: number) {
  const shape = (await importSTEP(engine.export('step'))).asShape3D(), oc = getOC();
  const analyzer = new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false), mass = measureShapeVolumeProperties(shape), solids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true); expect(solids).toHaveLength(1); expect(mass.volume).toBeCloseTo(expectedVolume, 5);
    if (expectedShells !== undefined) {
      const explorer = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      let shells = 0;
      try { for (; explorer.More(); explorer.Next()) shells++; } finally { explorer.delete(); }
      expect(shells).toBe(expectedShells);
    }
    if (expectedBounds) {
      const bounds = shape.boundingBox;
      try { bounds.bounds.flat().forEach((value, axis) => expect(Math.abs(value - [...expectedBounds.min, ...expectedBounds.max][axis])).toBeLessThan(1e-6)); }
      finally { bounds.delete(); }
    }
  } finally { analyzer.delete(); mass.delete(); solids.forEach(solid => solid.delete()); shape.delete(); }
}

function metrics(shape: Shape3D) {
  const mass = measureShapeVolumeProperties(shape), area = measureShapeSurfaceProperties(shape), box = shape.boundingBox;
  const check = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false), solids = shape.solids;
  try { return { volume: mass.volume, area: area.area, bounds: box.bounds.flat(), valid: check.IsValid(), solids: solids.length }; }
  finally { mass.delete(); area.delete(); box.delete(); check.delete(); solids.forEach(solid => solid.delete()); }
}

function symmetricDifference(first: Shape3D, second: Shape3D) {
  const extra = first.cut(second), missing = second.cut(first), a = measureShapeVolumeProperties(extra), b = measureShapeVolumeProperties(missing);
  try { return Math.abs(a.volume) + Math.abs(b.volume); }
  finally { extra.delete(); missing.delete(); a.delete(); b.delete(); }
}



const uiFixtures = [
  { name: 'Caja vaciada interior 4 mm', volume: 74656, bounds: [-50, -35, 0, 50, 35, 40], operation: { type: 'shell', direction: 'inward', thickness: 4 } },
  { name: 'Caja cerrada interior 4 mm', volume: 97472, bounds: [-50, -35, 0, 50, 35, 40], operation: { type: 'shell', direction: 'inward', thickness: 4, removedFaces: [] } },
  { name: 'Caja cerrada exterior 4 mm', volume: 124352, bounds: [-54, -39, -4, 54, 39, 44], operation: { type: 'shell', direction: 'outward', thickness: 4, removedFaces: [] } },
  { name: 'Caja exterior abierta por dos caras', volume: 76928, bounds: [-54, -39, -4, 50, 39, 40], operation: { type: 'shell', direction: 'outward', thickness: 4 }, uiStep: true },
  { name: 'Bloque con desmoldeo inverso 8 grados', volume: 160000 + 130 * 1600 * Math.tan(8 * Math.PI / 180) + 4 / 3 * 64000 * Math.tan(8 * Math.PI / 180) ** 2,
    bounds: [-40 - 40 * Math.tan(8 * Math.PI / 180), -25 - 40 * Math.tan(8 * Math.PI / 180), 0, 40 + 40 * Math.tan(8 * Math.PI / 180), 25 + 40 * Math.tan(8 * Math.PI / 180), 40],
    operation: { type: 'draft', angle: 8, reversed: true, propagation: 'tangent' } },
  { name: 'Desmoldeo asociado a cara superior', volume: 160000 + 50 * 40 ** 2 * Math.tan(5 * Math.PI / 180) / 2,
    bounds: [-40, -25, 0, 40 + 40 * Math.tan(5 * Math.PI / 180), 25, 40], operation: { type: 'draft', angle: 5, reversed: false, support: { kind: 'face' }, propagation: 'tangent' } },
  { name: 'Desmoldeo asociado a cara superior 50 mm', volume: 200000 + 50 * 50 ** 2 * Math.tan(5 * Math.PI / 180) / 2,
    bounds: [-40, -25, 0, 40 + 50 * Math.tan(5 * Math.PI / 180), 25, 50], operation: { type: 'draft', angle: 5, reversed: false, support: { kind: 'face' }, propagation: 'tangent' }, uiStep: true },
  { name: 'Caja con apertura curva', volume: 8782.69023027385, bounds: [-20, -15, 0, 20, 15, 20], operation: { type: 'shell', thickness: 2, direction: 'inward' }, uiStep: true },
] as const;

describe('native shell and neutral-plane draft', () => {
  it('consumes raw native handles without destroying the separately downcast shape or list contents', async () => {
    const isDeleted = (handle: unknown) => (handle as { isDeleted(): boolean }).isDeleted();
    good(box());
    const source = (await importSTEP(engine.export('step'))).asShape3D(), faces = source.faces, oc = getOC();
    const raw = source.wrapped.Reversed(), wrapped = castOwnedNativeShape(raw);
    try { expect(isDeleted(raw)).toBe(true); expect(wrapped.isNull).toBe(false); }
    finally { wrapped.delete(); }
    const list = new oc.NCollection_List_TopoDS_Shape(); list.Append(faces[0].wrapped);
    const first = list.First(), face = castOwnedNativeShape(first);
    try {
      expect(isDeleted(first)).toBe(true); expect(face.isNull).toBe(false);
      const next = list.First(); try { expect(next.IsNull()).toBe(false); } finally { next.delete(); }
      const wrongKind = list.First(); expect(() => castOwnedNativeSolid(wrongKind, 'Se requiere un sólido')).toThrow('sólido');
      expect(isDeleted(wrongKind)).toBe(true);
      const empty = new oc.TopoDS_Shape(); expect(() => castOwnedNativeSolid(empty, 'Sólido vacío')).toThrow('vacío'); expect(isDeleted(empty)).toBe(true);
    } finally { face.delete(); list.delete(); faces.forEach(item => item.delete()); source.delete(); }
  });
  it.each(uiFixtures)('reopens the real UI document $name and validates its exported STEP', async fixture => {
    const path = `examples/${fixture.name}.solidflow`, bytes = await readFile(new URL(`../../${path}`, import.meta.url));
    const document = parseDocument(bytes.toString('utf8')), reloaded = parseDocument(serializeDocument(document));
    expect(reloaded.features).toEqual(document.features); expect(reloaded.features.at(-1)).toMatchObject(fixture.operation);
    const unchanged = JSON.stringify(reloaded.features), result = good(reloaded.features);
    expect(JSON.stringify(reloaded.features)).toBe(unchanged); expect(result.volume).toBeCloseTo(fixture.volume, 5);
    const bounds = [...result.bounds.min, ...result.bounds.max];
    bounds.forEach((value, axis) => expect(Math.abs(value - fixture.bounds[axis])).toBeLessThan(1e-6));
    const exported = engine.export('step'), shape = (await importSTEP(exported)).asShape3D();
    try {
      const generated = metrics(shape); expect(generated.valid).toBe(true); expect(generated.solids).toBe(1);
      expect(Math.abs(generated.volume - result.volume)).toBeLessThan(1e-6);
      generated.bounds.forEach((value, axis) => expect(Math.abs(value - bounds[axis])).toBeLessThan(1e-6));
      const report: Record<string, unknown> = { document: path, documentSha256: createHash('sha256').update(bytes).digest('hex'),
        expectedVolume: fixture.volume, reconstructed: { volume: result.volume, bounds, featureErrors: result.featureErrors, warnings: result.warnings },
        generatedStep: generated, generatedStepBytes: exported.size };
      if ('uiStep' in fixture && fixture.uiStep) {
        const stepPath = `src/cad/fixtures/solidflow-ui/${fixture.name}.step`, stepBytes = await readFile(new URL(`../../${stepPath}`, import.meta.url));
        const actual = (await importSTEP(new Blob([stepBytes.toString('utf8')]))).asShape3D();
        try {
          const actualStep = metrics(actual), absoluteVolumeDifference = Math.abs(actualStep.volume - result.volume);
          const maxBoundsDifference = Math.max(...actualStep.bounds.map((value, axis) => Math.abs(value - bounds[axis])));
          const symmetricDifferenceMm3 = symmetricDifference(shape, actual);
          expect(actualStep.valid).toBe(true); expect(actualStep.solids).toBe(1);
          expect(absoluteVolumeDifference).toBeLessThan(1e-6); expect(maxBoundsDifference).toBeLessThan(1e-6); expect(symmetricDifferenceMm3).toBeLessThan(1e-6);
          report.actualUiStep = { path: stepPath, sha256: createHash('sha256').update(stepBytes).digest('hex'), bytes: stepBytes.byteLength,
            ...actualStep, absoluteVolumeDifference, maxBoundsDifference, symmetricDifferenceMm3 };
        } finally { actual.delete(); }
      }
      uiReports.push(report);
    } finally { shape.delete(); }
  });
  it.each(['shell', 'draft'] as const)('serializes the actual async %s example factory and exports the rebuilt geometry', async kind => {
    const original = await createFaceOperationExample(kind, features => Promise.resolve(engine.build(features)));
    const document = parseDocument(serializeDocument(original)); expect(document.features).toEqual(original.features);
    const result = good(document.features), tangent = Math.tan(5 * Math.PI / 180);
    const expected = kind === 'shell' ? 57408 : 160000 - 130 * 1600 * tangent + 4 / 3 * 64000 * tangent * tangent;
    expect(result.volume).toBeCloseTo(expected, 5); await roundTrip(result.volume, result.bounds);
  });

  it.each([false, true])('builds an open box shell with outward=%s and exact planar offsets', async outward => {
    const features = box(), feature = shell(good(features)); feature.direction = outward ? 'outward' : 'inward';
    const result = good([...features, feature]), expected = outward ? 44 * 34 * 22 - 40 * 30 * 20 : 40 * 30 * 20 - 36 * 26 * 18;
    expect(result.volume).toBeCloseTo(expected, 6); await roundTrip(expected, result.bounds);
    expect(result.bounds.min[2]).toBeCloseTo(outward ? -2 : 0, 6); expect(result.bounds.max[2]).toBeCloseTo(20, 6);
  });

  it.each([false, true])('creates a truly closed cavity with outward=%s, retaining both shells in one solid', async outward => {
    const features = box(), feature = shell(good(features), () => false); feature.direction = outward ? 'outward' : 'inward';
    const result = good([...features, feature]), expected = outward ? 44 * 34 * 24 - 24000 : 24000 - 36 * 26 * 16;
    expect(result.volume).toBeCloseTo(expected, 6); expect(result.faces).toHaveLength(12); await roundTrip(expected, result.bounds, 2);
  });

  it('removes two opposite faces to make a through shell', async () => {
    const features = box(), feature = shell(good(features), face => Math.abs(face.frame?.normal[2] ?? 0) > .99);
    const result = good([...features, feature]); expect(feature.removedFaces).toHaveLength(2);
    expect(result.volume).toBeCloseTo(24000 - 36 * 26 * 20, 6); await roundTrip(result.volume);
  });

  it.each([false, true])('offsets curved cylindrical walls with outward=%s', async outward => {
    const features = cylinder(), feature = shell(good(features)); feature.direction = outward ? 'outward' : 'inward';
    const result = good([...features, feature]);
    const expected = outward ? Math.PI * (17 * 17 * 22 - 15 * 15 * 20) : Math.PI * (15 * 15 * 20 - 13 * 13 * 18);
    expect(result.volume).toBeCloseTo(expected, 5); await roundTrip(result.volume, result.bounds);
  });

  it('rebuilds thickness and box depth edits while retaining the original selected face reference', () => {
    const features = box(), feature = shell(good(features)), refs = JSON.stringify(feature.removedFaces);
    feature.thickness = 3; const base = features[1]; if (base.type === 'extrude') base.depth = 30;
    const result = good([...features, feature]); expect(result.volume).toBeCloseTo(40 * 30 * 30 - 34 * 24 * 27, 5);
    expect(JSON.stringify(feature.removedFaces)).toBe(refs);
  });

  // Several native rebuilds and STEP round trips share this bounded case budget.
  it('opens a curved corner using exact offset-face history', async () => {
    const features = box(), source = good(features);
    const vertical = source.edges.filter(edge => {
      const xs = edge.lines.filter((_, i) => i % 3 === 0), ys = edge.lines.filter((_, i) => i % 3 === 1);
      return xs.every(x => Math.abs(x - xs[0]) < 1e-6) && ys.every(y => Math.abs(y - ys[0]) < 1e-6);
    });
    expect(vertical).toHaveLength(4);
    const fillet: EdgeFinishFeature = { id: 'round', name: 'Redondeos', type: 'fillet', baseFeatureId: 'base', suppressed: false,
      size: 3, selection: { mode: 'selected', edges: vertical.map(edge => edge.ref) } };
    const rounded = good([...features, fillet]), feature = shell(rounded, () => false); feature.baseFeatureId = fillet.id;
    feature.removedFaces = [rounded.faces!.find(face => !face.frame && face.vertices.every((value, index) => index % 3 === 2 || value > 0))!.ref];
    const result = good([...features, fillet, feature]); expect(result.volume).toBeCloseTo(8782.69023027385, 5); expect(result.faces).toHaveLength(22);
    await roundTrip(result.volume, result.bounds);

    feature.direction = 'outward';
    const exterior = good([...features, fillet, feature]);
    const exteriorExpected = (44 * 34 - (4 - Math.PI) * 25) * 24 - (40 * 30 - (4 - Math.PI) * 9) * 20 - Math.PI * (25 - 9) / 4 * 20;
    expect(exterior.volume).toBeCloseTo(exteriorExpected, 5); await roundTrip(exterior.volume);
    feature.direction = 'inward';
    const originalOpening = feature.removedFaces[0];
    feature.removedFaces.push(rounded.faces!.find(face => !face.frame && face.vertices.every((value, index) => index % 3 === 2 || value < 0))!.ref);
    const twoOpenings = good([...features, fillet, feature]);
    expect(twoOpenings.volume).toBeCloseTo(8883.221195188726 - 2 * Math.PI * (9 - 1) / 4 * 16, 5);
    feature.removedFaces = [originalOpening];
    feature.removedFaces.push(rounded.faces!.find(face => (face.frame?.normal[2] ?? 0) > .99)!.ref);
    expect(engine.build([...features, fillet, feature]).featureErrors[0]?.message).toContain('comparten una arista');
    feature.removedFaces = [];
    const closed = good([...features, fillet, feature]); expect(closed.volume).toBeCloseTo(8883.221195188726, 5);
    feature.removedFaces = rounded.faces!.filter(face => (face.frame?.normal[2] ?? 0) > .99).map(face => face.ref);
    expect(good([...features, fillet, feature]).volume).toBeLessThan(8000);
  }, 30_000);

  it.each([false, true])('drafts four planar faces with reversed=%s', async reversed => {
    const features = box(), feature = draft(good(features)); feature.reversed = reversed;
    const tangent = Math.tan(5 * Math.PI / 180) * (reversed ? -1 : 1);
    const expected = 24000 - 70 * 400 * tangent + 4 / 3 * 8000 * tangent * tangent;
    const result = good([...features, feature]); expect(result.volume).toBeCloseTo(expected, 5); await roundTrip(result.volume, result.bounds);
  });

  it.each([false, true])('drafts a cylindrical face into a cone with reversed=%s', async reversed => {
    const features = cylinder(), feature = draft(good(features)); feature.reversed = reversed;
    const radius = 15 - 20 * Math.tan(5 * Math.PI / 180) * (reversed ? -1 : 1);
    const expected = Math.PI * 20 / 3 * (225 + 15 * radius + radius * radius);
    const result = good([...features, feature]); expect(result.volume).toBeCloseTo(expected, 5); await roundTrip(result.volume, result.bounds);
  });

  it('sets an already conical face to the requested draft relative to the pull direction', async () => {
    const features = cylinder(), initial = draft(good(features));
    const cone = good([...features, initial]), further = draft(cone); further.id = 'additional'; further.baseFeatureId = initial.id; further.angle = 2;
    const result = good([...features, initial, further]);
    const radius = 15 - 20 * Math.tan(2 * Math.PI / 180);
    expect(result.volume).toBeCloseTo(Math.PI * 20 / 3 * (225 + 15 * radius + radius * radius), 5); await roundTrip(result.volume);
  });

  it('propagates from one planar face through tangent cylindrical corners around the rounded box', async () => {
    const features = box(); (features[0] as SketchFeature).profile = { kind: 'rectangle', width: 80, height: 50, center: [0, 0] };
    if (features[1].type === 'extrude') features[1].depth = 40;
    const source = good(features), vertical = source.edges.filter(edge => {
      const xs = edge.lines.filter((_, i) => i % 3 === 0), ys = edge.lines.filter((_, i) => i % 3 === 1);
      return xs.every(x => Math.abs(x - xs[0]) < 1e-6) && ys.every(y => Math.abs(y - ys[0]) < 1e-6);
    });
    const fillet: EdgeFinishFeature = { id: 'round', name: 'Redondeos R5', type: 'fillet', baseFeatureId: 'base', suppressed: false,
      size: 5, selection: { mode: 'selected', edges: vertical.map(edge => edge.ref) } };
    features.push(fillet);
    const rounded = good(features), feature = draft(rounded, face => (face.frame?.normal[1] ?? 0) > .99);
    feature.baseFeatureId = fillet.id; feature.reversed = true;
    feature.support = { kind: 'face', face: rounded.faces!.find(face => (face.frame?.normal[2] ?? 0) < -.99)!.ref };
    expect(feature.faces).toHaveLength(1);
    const result = good([...features, feature]); expect(result.faces).toHaveLength(10);
    expect(result.volume).toBeCloseTo(142057.75177977083, 5); await roundTrip(result.volume, result.bounds);

  });

  it('uses an offset reference plane and permits a one-face draft with balanced added and removed volume', async () => {
    const features = box(), source = good(features), feature = draft(source, face => (face.frame?.normal[0] ?? 0) > .99);
    const plane: Feature = { id: 'neutral', name: 'Plano medio', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 10, reversed: false };
    feature.support = { kind: 'plane', planeId: plane.id };
    const result = good([...features, plane, feature]); expect(result.volume).toBeCloseTo(24000, 5);
    expect(result.bounds.max[0]).toBeGreaterThan(20.8); await roundTrip(result.volume);
  });

  it('uses a historical planar face as neutral support and obeys its outward normal', () => {
    const features = box(), source = good(features), feature = draft(source);
    const bottom = source.faces!.find(face => (face.frame?.normal[2] ?? 0) < -.99)!;
    feature.support = { kind: 'face', face: bottom.ref }; feature.reversed = true;
    const result = good([...features, feature]);
    const tangent = Math.tan(5 * Math.PI / 180);
    expect(result.volume).toBeCloseTo(24000 - 70 * 400 * tangent + 4 / 3 * 8000 * tangent * tangent, 5);
  });

  it('works along an arbitrary resolved orientation, not only world Z', async () => {
    const features = box(); (features[0] as SketchFeature).plane = 'YZ';
    const source = good(features), feature = draft(source, face => Math.abs(face.frame?.normal[0] ?? 0) < .01);
    feature.support = { kind: 'principal', plane: 'YZ' };
    const result = good([...features, feature]);
    const tangent = Math.tan(5 * Math.PI / 180);
    expect(result.volume).toBeCloseTo(24000 - 70 * 400 * tangent + 4 / 3 * 8000 * tangent * tangent, 5); await roundTrip(result.volume);
  });

  it('rejects an apex crossing even when the native cone passes BRepCheck', () => {
    const features = cylinder(), feature = draft(good(features)); feature.angle = 45;
    const result = engine.build([...features, feature]); expect(result.featureErrors[0]?.message).toContain('vértice');
    expect(() => engine.export('step')).toThrow('errores');
  });

  it('rejects excessive thickness, all removed faces, invalid magnitudes and missing/duplicate selections', () => {
    const features = box(), source = good(features), feature = shell(source);
    feature.thickness = 100; expect(engine.build([...features, feature]).featureErrors[0]?.id).toBe(feature.id);
    feature.thickness = 2; feature.removedFaces = source.faces!.map(face => face.ref);
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('conservar');
    feature.removedFaces = [source.faces![0].ref, source.faces![0].ref];
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('duplicada');
    feature.removedFaces = [{ sourceFeatureId: 'base', key: 'face-v1|missing' }];
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('Recupera');
    feature.thickness = 0; expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('espesor');
    const taper = draft(source); taper.faces = [];
    expect(engine.build([...features, taper]).featureErrors[0]?.message).toContain('Selecciona');
    taper.angle = 90; expect(engine.build([...features, taper]).featureErrors[0]?.message).toContain('ángulo');
  });

  it('reports a collapsed closed offset in Spanish before casting a null native shape', () => {
    const features = box(); (features[0] as SketchFeature).profile = { kind: 'rectangle', width: 100, height: 70, center: [0, 0] };
    if (features[1].type === 'extrude') features[1].depth = 40;
    const feature = shell(good(features), () => false); feature.thickness = 40;
    const result = engine.build([...features, feature]); expect(result.featureErrors[0]?.message).toContain('Reduce');
    expect(result.featureErrors[0]?.message).not.toContain('null');
  });

  it.each(['shell', 'draft'] as const)('replays the actual %s contribution as a geometry-pattern seed', async type => {
    const features = box(), source = good(features), seed = type === 'shell' ? shell(source, () => false) : draft(source);
    const first = good([...features, seed]);
    features.push(seed,
      { id: 'bridge-sketch', name: 'Puente', type: 'sketch', plane: 'XY', offset: -5, suppressed: false,
        profile: { kind: 'rectangle', width: 100, height: 30, center: [30, 0] } },
      { id: 'bridge', name: 'Base común', type: 'extrude', sketchId: 'bridge-sketch', depth: 5, symmetric: false, suppressed: false },
      { id: 'target-sketch', name: 'Segundo bloque', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', width: 40, height: 30, center: [60, 0] } },
      { id: 'target', name: 'Bloque destino', type: 'extrude', sketchId: 'target-sketch', depth: 20, symmetric: false, suppressed: false },
      { id: 'pattern', name: 'Matriz de operación', type: 'linearPattern', baseFeatureId: 'target', suppressed: false,
        source: { mode: 'features', geometryPattern: true, featureIds: [seed.id] }, first: { direction: [1, 0, 0], count: 2, spacing: 60 },
        second: null, secondSeedOnly: false, skipped: [] });
    const result = good(features); expect(result.volume).toBeCloseTo(2 * first.volume + 15000, 5); await roundTrip(result.volume);
  });

  it('omits suppressed base and neutral-plane dependencies without applying to another body', () => {
    const features = box(), source = good(features), hollow = shell(source), taper = draft(source);
    features[1].suppressed = true;
    for (const feature of [hollow, taper]) {
      const result = engine.build([...features, feature]); expect(result.featureErrors).toEqual([]); expect(result.volume).toBe(0); expect(result.warnings).toHaveLength(1);
    }
    features[1].suppressed = false;
    const plane: Feature = { id: 'neutral', name: 'Plano neutro', type: 'plane', suppressed: true,
      support: { kind: 'principal', plane: 'XY' }, offset: 0, reversed: false };
    taper.support = { kind: 'plane', planeId: plane.id };
    const result = engine.build([...features, plane, taper]); expect(result.featureErrors).toEqual([]); expect(result.volume).toBeCloseTo(24000, 5); expect(result.warnings).toHaveLength(1);
  });


});
