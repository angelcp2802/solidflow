import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, measureShapeVolumeProperties, measureShapeSurfaceProperties, setOC, type Shape3D } from 'replicad';
import { CadEngine } from './kernel.engine';
import { patternPlan } from './kernel.patterns';
import type { CircularPatternFeature, EdgeFinishFeature, Feature, LinearPatternFeature, MirrorFeature, SketchFeature } from './kernel.types';
import { createCircularPatternExample, createLinearPatternExample, createMirrorExample } from '../examples/patterns';
import { parseDocument, serializeDocument } from '../model/document';

const engine = new CadEngine();
beforeAll(async () => {
  const wasmBinary = await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'));
  setOC(await initOpenCascade({ wasmBinary, print: () => undefined }));
}, 60_000);
afterEach(() => engine.dispose());
function plate(width = 120, height = 80, depth = 10): Feature[] {
  return [{ id: 'plate-sketch', name: 'Placa', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'rectangle', center: [0, 0], width, height } },
  { id: 'plate', name: 'Base', type: 'extrude', sketchId: 'plate-sketch', depth, symmetric: false, suppressed: false }];
}
function hole(x = -40, y = -20, radius = 3, depth = 10): Feature[] {
  return [{ id: 'hole-sketch', name: 'Taladro', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [x, y], radius } },
  { id: 'hole', name: 'Corte', type: 'cut', sketchId: 'hole-sketch', depth, symmetric: false, suppressed: false }];
}
function linear(): LinearPatternFeature {
  return { id: 'linear', name: 'Matriz lineal', type: 'linearPattern', suppressed: false, baseFeatureId: 'hole',
    source: { mode: 'features', geometryPattern: true, featureIds: ['hole'] }, first: { direction: [1, 0, 0], count: 3, spacing: 20 },
    second: null, secondSeedOnly: false, skipped: [] };
}
function circular(): CircularPatternFeature {
  return { id: 'circular', name: 'Matriz circular', type: 'circularPattern', suppressed: false, baseFeatureId: 'hole',
    source: { mode: 'features', geometryPattern: true, featureIds: ['hole'] }, axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
    count: 4, angle: 360, equalSpacing: true, reversed: false, skipped: [] };
}
function mirror(): MirrorFeature {
  return { id: 'mirror', name: 'Simetría', type: 'mirror', suppressed: false, baseFeatureId: 'hole',
    source: { mode: 'features', geometryPattern: true, featureIds: ['hole'] }, support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false };
}
function success(features: Feature[]) {
  const result = engine.build(features); expect(result.featureErrors).toEqual([]); return result;
}
const properties = (shape: Shape3D) => {
  const mass = measureShapeVolumeProperties(shape), surface = measureShapeSurfaceProperties(shape), box = shape.boundingBox;
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false), solids = shape.solids;
  try { return { volume: mass.volume, area: surface.area, bounds: box.bounds.flat(), valid: analyzer.IsValid(), solids: solids.length }; }
  finally { mass.delete(); surface.delete(); box.delete(); analyzer.delete(); solids.forEach((solid) => solid.delete()); }
};
async function step(volume: number, solidCount = 1) {
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  try { const p = properties(shape); expect(p.valid).toBe(true); expect(p.solids).toBe(solidCount); expect(p.volume).toBeCloseTo(volume, 5); }
  finally { shape.delete(); }
}
function boss(id: string, x: number): Feature[] {
  return [{ id: `${id}-sketch`, name: id, type: 'sketch', plane: 'XY', offset: 10, suppressed: false,
    profile: { kind: 'rectangle', center: [x, 0], width: 10, height: 10 } },
  { id, name: id, type: 'extrude', sketchId: `${id}-sketch`, depth: 10, symmetric: false, suppressed: false }];
}

const savedUiExamples = [
  { name: 'Placa con matriz de cinco taladros', radius: 3, volume: 84000 - 5 * Math.PI * 9 * 12,
    bounds: [-50, -35, 0, 50, 35, 12], operation: { type: 'linearPattern', skipped: [[2, 1]], secondSeedOnly: false,
      source: { mode: 'features', geometryPattern: true, featureIds: ['hole'] } } },
  { name: 'Brida circular de tres taladros inversa', radius: 4, volume: Math.PI * (1600 - 3 * 16) * 8,
    bounds: [-40, -40, 0, 40, 40, 8], operation: { type: 'circularPattern', count: 3, angle: 180, equalSpacing: true, reversed: true, skipped: [],
      source: { mode: 'features', geometryPattern: true, featureIds: ['hole'] } } },
  { name: 'Placa con salientes simétricos', radius: 6, volume: 84000 + 2 * Math.PI * 36 * 15,
    bounds: [-50, -35, 0, 50, 35, 27], operation: { type: 'mirror', support: { kind: 'principal', plane: 'YZ' }, mergeBodies: false,
      source: { mode: 'features', geometryPattern: true, featureIds: ['boss'] } } },
  { name: 'Simetría de cuerpo fusionada', radius: 6, volume: 2 * (84000 + Math.PI * 36 * 15),
    bounds: [-50, -35, -27, 50, 35, 27], operation: { type: 'mirror', support: { kind: 'principal', plane: 'XY' }, mergeBodies: true,
      source: { mode: 'body', sourceFeatureId: 'boss' } } },
  { name: 'Simetría de cuerpo sobre cara', radius: 6, volume: 168000 + 2 * Math.PI * 36 * 3,
    bounds: [-50, -35, -3, 50, 35, 27], operation: { type: 'mirror', support: { kind: 'face', face: { sourceFeatureId: 'boss' } }, mergeBodies: true,
      source: { mode: 'body', sourceFeatureId: 'boss' } } },
  { name: 'Matriz de cinco taladros R4', radius: 4, volume: 84000 - 5 * Math.PI * 16 * 12,
    bounds: [-50, -35, 0, 50, 35, 12], operation: { type: 'linearPattern', skipped: [[2, 1]], secondSeedOnly: false,
      source: { mode: 'features', geometryPattern: true, featureIds: ['hole'] } } },
] as const;
const savedUiReports: Record<string, unknown>[] = [];
afterAll(async () => {
  // Explicit report mode only: ordinary regression runs never rewrite delivered artifacts.
  if (process.env.SOLIDFLOW_CAD_REPORT === '1' && savedUiReports.length === savedUiExamples.length) {
    await writeFile(new URL('../../artifacts/verify-ui-patterns-export.json', import.meta.url),
      JSON.stringify({ units: 'mm', volumeUnits: 'mm3', documents: savedUiReports }, null, 2) + '\n');
  }
});

describe('geometric feature patterns and explicit body copies', () => {
  it.each(savedUiExamples)('reopens the actual UI-saved $name document and round-trips its STEP', async (fixture) => {
    const documentPath = `examples/${fixture.name}.solidflow`;
    const documentBytes = await readFile(new URL(`../../${documentPath}`, import.meta.url));
    const document = parseDocument(documentBytes.toString('utf8')), reloaded = parseDocument(serializeDocument(document));
    expect(reloaded.features).toEqual(document.features);
    expect(document.features.at(-1)).toMatchObject(fixture.operation);
    const seedSketch = document.features.find((feature) => feature.type === 'sketch' && ['hole-sketch', 'boss-sketch'].includes(feature.id)) as SketchFeature;
    expect(seedSketch.profile.kind).toBe('entities');
    if (seedSketch.profile.kind !== 'entities') throw new Error('The saved sketch must retain its radius constraint.');
    const radiusConstraint = seedSketch.profile.constraints.find((constraint) => constraint.type === 'radius');
    expect(radiusConstraint?.type === 'radius' ? radiusConstraint.value : null).toBe(fixture.radius);
    const before = JSON.stringify(reloaded.features), result = success(reloaded.features);
    expect(result.warnings).toEqual([]); expect(JSON.stringify(reloaded.features)).toBe(before);
    expect(result.volume).toBeCloseTo(fixture.volume, 5);
    const bounds = [...result.bounds.min, ...result.bounds.max];
    bounds.forEach((value, axis) => expect(Math.abs(value - fixture.bounds[axis])).toBeLessThan(1e-6));
    const exported = engine.export('step'), generated = (await importSTEP(exported)).asShape3D();
    try {
      const generatedStep = properties(generated);
      expect(generatedStep.valid).toBe(true); expect(generatedStep.solids).toBe(1);
      expect(Math.abs(generatedStep.volume - result.volume)).toBeLessThan(1e-6);
      generatedStep.bounds.forEach((value, axis) => expect(Math.abs(value - bounds[axis])).toBeLessThan(1e-6));
      const report: Record<string, unknown> = { document: documentPath,
        documentSha256: createHash('sha256').update(documentBytes).digest('hex'),
        expectedVolume: fixture.volume, reconstructed: { volume: result.volume, bounds, featureErrors: result.featureErrors, warnings: result.warnings },
        generatedStep, generatedStepBytes: exported.size };
      if (fixture.name === 'Brida circular de tres taladros inversa') {
        const stepPath = `src/cad/fixtures/solidflow-ui/${fixture.name}.step`, stepBytes = await readFile(new URL(`../../${stepPath}`, import.meta.url));
        const imported = (await importSTEP(new Blob([stepBytes.toString('utf8')]))).asShape3D();
        try {
          const actualStep = properties(imported), absoluteVolumeDifference = Math.abs(actualStep.volume - result.volume);
          const maxBoundsDifference = Math.max(...actualStep.bounds.map((value, axis) => Math.abs(value - bounds[axis])));
          expect(actualStep.valid).toBe(true); expect(actualStep.solids).toBe(1);
          expect(absoluteVolumeDifference).toBeLessThan(1e-6); expect(maxBoundsDifference).toBeLessThan(1e-6);
          const excess = generated.cut(imported), missing = imported.cut(generated);
          const a = measureShapeVolumeProperties(excess), b = measureShapeVolumeProperties(missing);
          try {
            const symmetricDifferenceMm3 = Math.abs(a.volume) + Math.abs(b.volume);
            expect(symmetricDifferenceMm3).toBeLessThan(1e-6);
            Object.assign(report, { actualUiStep: { path: stepPath, sha256: createHash('sha256').update(stepBytes).digest('hex'),
              bytes: stepBytes.byteLength, ...actualStep, absoluteVolumeDifference, maxBoundsDifference, symmetricDifferenceMm3 } });
          } finally { a.delete(); b.delete(); excess.delete(); missing.delete(); }
        } finally { imported.delete(); }
      }
      savedUiReports.push(report);
    } finally { generated.delete(); }
  });

  it('retains the UI-selected mirror face under proportional depth edits and rejects a changed geometric signature', () => {
    // The saved face key is reused verbatim; there is no nearest-face fallback or recaptured reference.
    return readFile(new URL('../../examples/Simetría de cuerpo sobre cara.solidflow', import.meta.url), 'utf8').then((text) => {
      const document = parseDocument(text), selected = document.features.at(-1) as MirrorFeature;
      expect(selected.support.kind).toBe('face');
      const reference = JSON.stringify(selected.support);
      for (const feature of document.features) {
        if (feature.type === 'extrude') feature.depth *= 4 / 3;
        if (feature.type === 'sketch') feature.offset *= 4 / 3;
      }
      const scaled = success(document.features);
      expect(scaled.volume).toBeCloseTo((168000 + 2 * Math.PI * 36 * 3) * 4 / 3, 5);
      expect(scaled.bounds.min[2]).toBeCloseTo(-4, 6); expect(scaled.bounds.max[2]).toBeCloseTo(36, 6);
      expect(JSON.stringify(selected.support)).toBe(reference);
      const base = document.features.find((feature) => feature.id === 'base');
      if (base?.type !== 'extrude') throw new Error('Missing saved base extrusion.');
      base.depth = 17;
      const changed = engine.build(document.features);
      expect(changed.featureErrors).toEqual([{ id: 'mirror', message: expect.stringContaining('Recupera la selección') }]);
      expect(() => engine.export('step')).toThrow();
    });
  });

  it.each([['linear', createLinearPatternExample], ['circular', createCircularPatternExample], ['mirror', createMirrorExample]] as const)(
    'rebuilds and exports the serialized UI %s example', async (kind, factory) => {
      const document = parseDocument(serializeDocument(factory())), before = JSON.stringify(document.features);
      const result = success(document.features);
      expect(result.warnings).toEqual([]); expect(JSON.stringify(document.features)).toBe(before);
      const expected = { linear: 84000 - 6 * Math.PI * 9 * 12, circular: Math.PI * (1600 - 6 * 16) * 8, mirror: 84000 + 2 * Math.PI * 36 * 15 };
      expect(result.volume).toBeCloseTo(expected[kind], 5);
      await step(result.volume);
      if (process.env.SOLIDFLOW_CAD_REPORT === '1') console.info(JSON.stringify({ example: kind, volume: result.volume, bounds: result.bounds }));
    });

  it.each([['grid', 6], ['seedOnly', 4], ['skip', 5]] as const)('patterns a clipped cut into a two-direction %s', async (mode, count) => {
    const feature = linear(); feature.second = { direction: [0, 2, 0], count: 2, spacing: 20 };
    feature.secondSeedOnly = mode === 'seedOnly'; if (mode === 'skip') feature.skipped = [[1, 1]];
    const result = success([...plate(), ...hole(), feature]);
    expect(result.volume).toBeCloseTo(96000 - count * Math.PI * 9 * 10, 5);
    await step(result.volume);
  });

  it('copies the actual removed material rather than extending an uncropped cut into a taller target', () => {
    const tall = boss('tall', 20);
    (tall[0] as SketchFeature).profile = { kind: 'rectangle', center: [20, 0], width: 20, height: 20 };
    if (tall[1].type === 'extrude') tall[1].depth = 20;
    const pattern = linear(); pattern.first = { direction: [1, 0, 0], spacing: 60, count: 2 };
    const result = success([...plate(), ...tall, ...hole(-40, 0, 3, 30), pattern]);
    expect(result.volume).toBeCloseTo(104000 - 2 * Math.PI * 9 * 10, 5);
    expect(result.bounds.max[2]).toBeCloseTo(30, 6);
  });

  it.each([['full', 4], ['partial', 3], ['increment', 3], ['skip', 3]] as const)('builds a %s circular cut pattern', async (mode, count) => {
    const feature = circular();
    if (mode === 'partial') { feature.count = 3; feature.angle = 180; }
    if (mode === 'increment') { feature.count = 3; feature.angle = 45; feature.equalSpacing = false; }
    if (mode === 'skip') feature.skipped = [1];
    const result = success([...plate(), ...hole(30, 0), feature]);
    expect(result.volume).toBeCloseTo(96000 - count * Math.PI * 9 * 10, 5); await step(result.volume);
  });

  it('respects reversed circular rotation and rejects a copy outside the available material', () => {
    const features = plate(); (features[0] as SketchFeature).profile = { kind: 'rectangle', center: [0, -20], width: 120, height: 80 };
    const feature = circular(); feature.count = 2; feature.angle = 90; feature.reversed = true;
    expect(success([...features, ...hole(30, 0), feature]).volume).toBeCloseTo(96000 - 2 * Math.PI * 90, 5);
    feature.reversed = false;
    expect(engine.build([...features, ...hole(30, 0), feature]).featureErrors[0]?.message).toContain('no modifica');
  });

  it('patterns nested contributions without including their original seed again', () => {
    const first = linear(), second = linear();
    second.id = 'nested'; second.baseFeatureId = first.id;
    second.source = { mode: 'features', geometryPattern: true, featureIds: [first.id] };
    second.first = { direction: [0, 1, 0], count: 2, spacing: 40 };
    const result = success([...plate(), ...hole(), first, second]);
    expect(result.volume).toBeCloseTo(96000 - 5 * Math.PI * 90, 5);
    second.source.featureIds = [first.id, 'hole']; // Reverse selection order must not reverse history.
    expect(success([...plate(), ...hole(), first, second]).volume).toBeCloseTo(96000 - 6 * Math.PI * 90, 5);
  });

  it('rebuilds a seed radius edit through all pattern instances', () => {
    const features = [...plate(), ...hole(), linear()];
    const initial = success(features);
    const sketch = features.find((feature) => feature.id === 'hole-sketch') as SketchFeature;
    if (sketch.profile.kind === 'circle') sketch.profile.radius = 4;
    const result = success(features);
    expect(result.volume).toBeCloseTo(96000 - 3 * Math.PI * 16 * 10, 5);
    expect(result.edges.every((edge) => edge.ref.sourceFeatureId === 'linear')).toBe(true);
    expect(result.volume).toBeLessThan(initial.volume);
  });

  it.each([['fillet', 20], ['chamfer', 20], ['fillet', 10]] as const)(
    'copies the genuine %s contribution on boss edges at Z%s', async (type, z) => {
      const features = [...plate(), ...boss('first-boss', -30), ...boss('second-boss', 30)];
      const original = success(features);
      const topEdges = original.edges.filter((edge) => {
        const xs = edge.lines.filter((_, index) => index % 3 === 0), ys = edge.lines.filter((_, index) => index % 3 === 1);
        return xs.every((x) => Math.abs(x) >= 24.999 && Math.abs(x) <= 35.001) && ys.every((y) => Math.abs(y) <= 5.001)
          && edge.lines.filter((_, index) => index % 3 === 2).every((value) => Math.abs(value - z) < 1e-6);
      });
      expect(topEdges).toHaveLength(8);
      const finish: EdgeFinishFeature = { id: 'finish', name: 'Acabado', type, suppressed: false, baseFeatureId: 'second-boss', size: 1,
        selection: { mode: 'selected', edges: topEdges.filter((edge) => edge.lines[0] < 0).map((edge) => edge.ref) } };
      const pattern = linear(); pattern.baseFeatureId = finish.id; pattern.source = { mode: 'features', geometryPattern: true, featureIds: [finish.id] };
      pattern.first = { direction: [1, 0, 0], spacing: 60, count: 2 };
      const patterned = success([...features, finish, pattern]);
      const shape = (await importSTEP(engine.export('step'))).asShape3D();
      finish.selection = { mode: 'selected', edges: topEdges.map((edge) => edge.ref) };
      const direct = success([...features, finish]);
      expect(patterned.volume).toBeCloseTo(direct.volume, 5);
      const reference = (await importSTEP(engine.export('step'))).asShape3D();
      const extra = shape.cut(reference), missing = reference.cut(shape);
      const extraVolume = measureShapeVolumeProperties(extra), missingVolume = measureShapeVolumeProperties(missing);
      try { expect(Math.abs(extraVolume.volume) + Math.abs(missingVolume.volume)).toBeLessThan(1e-6); }
      finally { extraVolume.delete(); missingVolume.delete(); extra.delete(); missing.delete(); shape.delete(); reference.delete(); }
    });

  it('copies a complete historical body instead of the currently cut body', async () => {
    const features = plate(10, 10, 10);
    const pattern = linear(); pattern.source = { mode: 'body', sourceFeatureId: 'plate' };
    pattern.first.spacing = 20;
    const result = success([...features, ...hole(0, 0, 1), pattern]);
    expect(result.volume).toBeCloseTo(3000 - Math.PI * 10, 5);
    expect(result.warnings[0]).toContain('3 sólidos'); await step(result.volume, 3);
  });

  it('mirrors a hole across an associative reference plane', async () => {
    const plane: Feature = { id: 'plane', name: 'Plano', type: 'plane', suppressed: false, support: { kind: 'principal', plane: 'YZ' }, offset: 5, reversed: true };
    const feature = mirror(); feature.support = { kind: 'plane', planeId: plane.id };
    const result = success([...plate(), ...hole(-30, 0), plane, feature]);
    expect(result.volume).toBeCloseTo(96000 - 2 * Math.PI * 90, 5); await step(result.volume);
  });

  it.each([false, true])('mirrors a touching historical body with mergeBodies=%s', async (mergeBodies) => {
    const features = plate(20, 10, 10); (features[0] as SketchFeature).profile = { kind: 'rectangle', center: [10, 0], width: 20, height: 10 };
    const feature = mirror(); feature.baseFeatureId = 'plate'; feature.source = { mode: 'body', sourceFeatureId: 'plate' }; feature.mergeBodies = mergeBodies;
    const result = success([...features, feature]); expect(result.volume).toBeCloseTo(4000, 5); await step(result.volume, mergeBodies ? 1 : 2);
  });

  it('uses a historical selected planar face as the body mirror plane', () => {
    const features = plate(10, 10, 10), source = success(features);
    const face = source.faces!.find((face) => face.frame?.normal[0] === 1)!;
    const feature = mirror(); feature.baseFeatureId = 'plate'; feature.source = { mode: 'body', sourceFeatureId: 'plate' };
    feature.support = { kind: 'face', face: face.ref }; feature.mergeBodies = true;
    const result = success([...features, feature]); expect(result.volume).toBeCloseTo(2000, 5); expect(result.bounds.max[0]).toBeCloseTo(15, 6);
  });

  it('rejects geometrically duplicate mirrored bodies and disconnected mirror fusion', () => {
    const features = plate(10, 10, 10), feature = mirror(); feature.baseFeatureId = 'plate'; feature.source = { mode: 'body', sourceFeatureId: 'plate' };
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('coincide');
    (features[0] as SketchFeature).profile = { kind: 'rectangle', center: [20, 0], width: 10, height: 10 }; feature.mergeBodies = true;
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('fusionar');
  });

  it.each(['seed', 'base', 'plane'])('propagates a suppressed %s to repetitions and descendants', (kind) => {
    const features = [...plate(), ...hole()];
    const plane: Feature = { id: 'plane', name: 'Plano', type: 'plane', suppressed: kind === 'plane', support: { kind: 'principal', plane: 'YZ' }, offset: 0, reversed: false };
    if (kind === 'seed') features[3].suppressed = true;
    const feature = mirror(); feature.support = { kind: 'plane', planeId: 'plane' };
    if (kind === 'base') {
      const extra = boss('later', 20); extra[1].suppressed = true; features.push(...extra); feature.baseFeatureId = 'later';
    }
    const child: EdgeFinishFeature = { id: 'child', name: 'Acabado', type: 'fillet', baseFeatureId: feature.id, size: 1, suppressed: false, selection: { mode: 'all' } };
    const result = engine.build([...features, plane, feature, child]);
    expect(result.featureErrors).toEqual([]); expect(result.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('requires a single body for feature replay and for a historical body seed', () => {
    const features = plate(10, 10, 10), first = linear(); first.baseFeatureId = 'plate'; first.source = { mode: 'body', sourceFeatureId: 'plate' };
    const next = linear(); next.id = 'next'; next.baseFeatureId = first.id; next.source = { mode: 'body', sourceFeatureId: first.id };
    expect(engine.build([...features, first, next]).featureErrors[0]?.message).toContain('exactamente un sólido');
    next.source = { mode: 'features', geometryPattern: true, featureIds: ['plate'] };
    expect(engine.build([...features, first, next]).featureErrors[0]?.message).toContain('único cuerpo de partida');
  });

  it('rejects an application budget above 512 before replaying the first copy', () => {
    const features = [...plate(), ...hole(), ...boss('boss', 20)], feature = linear();
    feature.baseFeatureId = 'boss'; feature.first.count = 200;
    feature.source = { mode: 'features', geometryPattern: true, featureIds: ['plate', 'hole', 'boss'] };
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('512');
  });

  it.each(['revolve', 'sweep', 'loft'] as const)('copies only the positive geometry produced by a %s seed', async (type) => {
    const features = plate(), sketch: SketchFeature = { id: 'section', name: 'Sección', type: 'sketch', plane: 'XY', offset: 10,
      suppressed: false, profile: { kind: 'circle', center: [-30, 0], radius: 2 } };
    if (type === 'revolve') {
      // Local Y is world +Z on XZ; offset shifts the cylinder axis to world Y=-20.
      sketch.plane = 'XZ'; sketch.offset = 20; sketch.profile = { kind: 'rectangle', center: [1, 15], width: 2, height: 10 };
      features.push(sketch, { id: 'seed', name: 'Revolución', type, sketchId: sketch.id, angle: 360, suppressed: false });
    } else if (type === 'sweep') {
      const path: SketchFeature = { id: 'path', name: 'Trayectoria', type: 'sketch', plane: 'XZ', offset: 0, suppressed: false,
        profile: { kind: 'entities', points: [{ id: 'a', x: -30, y: 10 }, { id: 'b', x: -30, y: 20 }], constraints: [],
          entities: [{ id: 'line', type: 'line', construction: false, start: 'a', end: 'b' }] } };
      features.push(sketch, path, { id: 'seed', name: 'Barrido', type, suppressed: false, profileSketchId: sketch.id,
        pathSketchId: path.id, path: [{ entityId: 'line', reversed: false }], orientation: 'followPath', merge: true });
    } else {
      const end = { ...sketch, id: 'end', offset: 20 };
      features.push(sketch, end, { id: 'seed', name: 'Recubrir', type, suppressed: false, ruled: true, merge: true,
        sections: [sketch, end].map((section) => ({ sketchId: section.id, startEntityId: null, reversed: false })) });
    }
    const feature = linear(); feature.baseFeatureId = 'seed'; feature.source = { mode: 'features', geometryPattern: true, featureIds: ['seed'] };
    feature.first = { direction: [1, 0, 0], spacing: 20, count: 2 };
    const result = success([...features, feature]);
    expect(result.volume).toBeCloseTo(96000 + 2 * Math.PI * 4 * 10, 5); await step(result.volume);
  });

  it('rejects missing/forward/duplicate seeds, stale base anchors and unsupported regeneration', () => {
    const features = [...plate(), ...hole()];
    for (const featureIds of [['missing'], ['linear'], ['hole', 'hole']]) {
      const feature = linear(); feature.source = { mode: 'features', geometryPattern: true, featureIds };
      expect(engine.build([...features, feature]).featureErrors[0]?.id).toBe(feature.id);
    }
    const feature = linear(); feature.baseFeatureId = 'plate';
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('sólido anterior');
    feature.baseFeatureId = 'hole'; (feature.source as { geometryPattern: boolean }).geometryPattern = false;
    expect(engine.build([...features, feature]).featureErrors[0]?.message).toContain('condiciones finales');
  });

  it('rejects invalid, empty, duplicate or oversized instance plans', () => {
    const zero = linear(); zero.first.direction = [0, 0, 0]; expect(() => patternPlan(zero)).toThrow('nula');
    const excessive = linear(); excessive.first.count = 17; excessive.second = { count: 16, spacing: 20, direction: [0, 1, 0] };
    expect(() => patternPlan(excessive)).toThrow('256');
    const duplicates = linear(); duplicates.second = { count: 2, spacing: 20, direction: [1, 0, 0] }; expect(() => patternPlan(duplicates)).toThrow('coincidentes');
    const empty = linear(); empty.skipped = [[1, 0], [2, 0]]; expect(() => patternPlan(empty)).toThrow('ninguna');
    empty.skipped = [[0, 0]]; expect(() => patternPlan(empty)).toThrow('semilla');
    const loop = circular(); loop.count = 3; loop.equalSpacing = false; loop.angle = 180; expect(() => patternPlan(loop)).toThrow('repite');
    loop.skipped = [2]; expect(patternPlan(loop).transforms).toHaveLength(1);
  });

});
