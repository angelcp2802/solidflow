import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, measureShapeVolumeProperties, setOC } from 'replicad';
import { CadEngine } from './kernel.engine';
import type { EntityProfile } from '../sketch/types';
import type { Feature, LoftFeature, SketchFeature, SweepFeature } from './kernel.types';
import { loftSolid } from './kernel.sweep-loft';
import { createLoftExample, createSweepExample } from '../examples/advanced-shapes';
import { parseDocument, serializeDocument } from '../model/document';

const engine = new CadEngine();
beforeAll(async () => {
  const wasmBinary = await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'));
  setOC(await initOpenCascade({ wasmBinary, print: () => undefined }));
}, 60_000);
afterEach(() => engine.dispose());

function circle(id = 'profile', radius = 2, offset = 0, center: [number, number] = [0, 0]): SketchFeature {
  return { id, name: id, type: 'sketch', suppressed: false, plane: 'XY', offset, profile: { kind: 'circle', center, radius } };
}
function pathSketch(points: [number, number][], arcIndices: number[] = []): SketchFeature {
  return { ...circle('path'), plane: 'XZ', profile: { kind: 'entities', constraints: [],
    points: points.map(([x, y], index) => ({ id: `p${index}`, x, y })),
    entities: points.slice(0, -1).map((_, index) => arcIndices.includes(index)
      ? { id: `e${index}`, construction: false, type: 'arc', start: `p${index}`, end: `p${index + 1}`, center: 'center', clockwise: true }
      : { id: `e${index}`, construction: false, type: 'line', start: `p${index}`, end: `p${index + 1}` }) } };
}
function sweep(path: SketchFeature, merge = true): SweepFeature {
  const profile = path.profile as EntityProfile;
  return { id: 'sweep', name: 'Barrido', type: 'sweep', suppressed: false, profileSketchId: 'profile', pathSketchId: path.id,
    orientation: 'followPath', merge, path: profile.entities.filter((entity) => !entity.construction).map((entity) => ({ entityId: entity.id, reversed: false })) };
}
function loft(sketches: SketchFeature[], ruled = true, merge = true): LoftFeature {
  return { id: 'loft', name: 'Recubrir', type: 'loft', suppressed: false, ruled, merge,
    sections: sketches.map((sketch) => ({ sketchId: sketch.id, startEntityId: null, reversed: false })) };
}
function rectangle(id: string, size = 10, offset = 0): SketchFeature {
  return { ...circle(id, 2, offset), profile: { kind: 'entities', constraints: [],
    points: [{ id: 'a', x: -size / 2, y: -size / 2 }, { id: 'b', x: size / 2, y: -size / 2 },
      { id: 'c', x: size / 2, y: size / 2 }, { id: 'd', x: -size / 2, y: size / 2 }],
    entities: ['a', 'b', 'c', 'd'].map((start, index, ids) => ({ id: `edge-${start}`, type: 'line', construction: false, start, end: ids[(index + 1) % 4] })) } };
}
async function expectStep(volume: number, solids = 1) {
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  const properties = measureShapeVolumeProperties(shape);
  const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
  const nativeSolids = shape.solids;
  try {
    expect(analyzer.IsValid()).toBe(true);
    expect(properties.volume).toBeCloseTo(volume, 4);
    expect(nativeSolids).toHaveLength(solids);
  } finally { nativeSolids.forEach((solid) => solid.delete()); analyzer.delete(); properties.delete(); shape.delete(); }
}
function success(features: Feature[]) {
  const result = engine.build(features);
  expect(result.featureErrors).toEqual([]);
  return result;
}

describe('native sweep and loft', () => {
  it('reopens the UI-saved R5 sweep with its solved radius, explicit path and STEP geometry intact', async () => {
    const source = await readFile(new URL('../../examples/Conducto barrido R5.solidflow', import.meta.url), 'utf8');
    const document = parseDocument(source), restored = parseDocument(serializeDocument(document));
    expect(restored.features).toEqual(document.features);
    const feature = restored.features.find((item) => item.type === 'sweep');
    if (!feature || feature.type !== 'sweep') throw new Error('Expected saved sweep');
    expect(feature.path).toEqual(['line-1', 'bend', 'line-2'].map((entityId) => ({ entityId, reversed: false })));
    const section = restored.features.find((item) => item.id === feature.profileSketchId);
    if (!section || section.type !== 'sketch' || section.profile.kind !== 'entities') throw new Error('Expected entity profile');
    expect(section.profile.constraints.find((constraint) => constraint.type === 'radius')).toMatchObject({ value: 5 });
    const before = JSON.stringify(restored.features), result = success(restored.features);
    expect(result.warnings).toEqual([]);
    expect(result.volume).toBeCloseTo(25 * Math.PI * (40 + 10 * Math.PI), 6);
    expect(result.bounds.max.map((maximum, axis) => maximum - result.bounds.min[axis])).toEqual([
      expect.closeTo(45, 5), expect.closeTo(10, 5), expect.closeTo(45, 5),
    ]);
    expect(JSON.stringify(restored.features)).toBe(before);
    await expectStep(result.volume);
    if (process.env.SOLIDFLOW_CAD_REPORT === '1') console.info(JSON.stringify({ fixture: 'Conducto barrido R5', volume: result.volume, bounds: result.bounds }));
  });

  it.each([['sweep', createSweepExample], ['loft', createLoftExample]] as const)(
    'rebuilds and exports the serialized %s example used by the UI', async (kind, factory) => {
      const doc = parseDocument(serializeDocument(factory())), before = JSON.stringify(doc.features);
      const result = success(doc.features);
      expect(result.warnings).toEqual([]);
      expect(JSON.stringify(doc.features)).toBe(before);
      if (kind === 'sweep') expect(result.volume).toBeCloseTo(16 * Math.PI * (40 + 10 * Math.PI), 5);
      else expect(result.volume).toBeGreaterThan(10000);
      await expectStep(result.volume);
      if (process.env.SOLIDFLOW_CAD_REPORT === '1') console.info(JSON.stringify({ kind, volume: result.volume, bounds: result.bounds }));
    });

  it.each([true, false])('rejects the UI example reordered through parallel planes 0,55,25 with ruled=%s', (ruled) => {
    const document = createLoftExample();
    const feature = document.features.find((item) => item.type === 'loft') as LoftFeature;
    feature.ruled = ruled;
    feature.sections = [feature.sections[0], feature.sections[2], feature.sections[1]];
    const result = engine.build(document.features);
    expect(result.featureErrors[0]?.id).toBe(feature.id);
    expect(result.featureErrors[0]?.message).toContain('orden de las secciones paralelas');
    expect(() => engine.export('step')).toThrow('Corrige');
  });

  it('allows monotonically descending parallel loft sections', () => {
    const sections = [circle('a', 6, 50, [-5, 16]), circle('b', 10, 20, [12, 7]), circle('c', 5)];
    const result = success([...sections, loft(sections)]);
    expect(Math.abs(result.volume - Math.PI * (20 * 175 + 30 * 196) / 3)).toBeLessThan(1e-4);
  });

  it('reopens the UI-saved ruled three-section transition and roundtrips its STEP geometry', async () => {
    const source = await readFile(new URL('../../examples/Transición reglada de tres secciones.solidflow', import.meta.url), 'utf8');
    const document = parseDocument(source), restored = parseDocument(serializeDocument(document));
    expect(restored.features).toEqual(document.features);
    const feature = restored.features.find((item) => item.type === 'loft') as LoftFeature;
    expect(feature.ruled).toBe(true);
    expect(feature.sections.map(({ sketchId }) => sketchId)).toEqual(['section-1', 'section-2', 'section-3']);
    const result = success(restored.features);
    expect(result.warnings).toEqual([]);
    expect(result.volume).toBeCloseTo(Math.PI * (25 * 516 + 30 * 436) / 3, 5);
    expect(result.bounds.max[2]).toBeCloseTo(55, 5);
    await expectStep(result.volume);
    if (process.env.SOLIDFLOW_CAD_REPORT === '1') console.info(JSON.stringify({ fixture: 'Transición reglada de tres secciones', volume: result.volume, bounds: result.bounds }));
  });

  it('sweeps a circular section along a line and exports a valid analytic cylinder', async () => {
    const path = pathSketch([[0, 0], [0, 20]]);
    const result = success([circle(), path, sweep(path)]);
    expect(result.volume).toBeCloseTo(80 * Math.PI, 6);
    expect(result.bounds.max[2]).toBeCloseTo(20, 6);
    await expectStep(result.volume);
  });

  it('sweeps a circle around a circular arc as a quarter torus', async () => {
    const path = pathSketch([[0, 0], [20, 20]], [0]);
    (path.profile as EntityProfile).points.push({ id: 'center', x: 20, y: 0 });
    const result = success([circle(), path, sweep(path)]);
    expect(result.volume).toBeCloseTo(40 * Math.PI ** 2, 6);
    await expectStep(result.volume);
  });

  it('sweeps an explicit line/arc/line chain independently of entity storage order', () => {
    const path = pathSketch([[0, 0], [0, 10], [20, 30], [30, 30]], [1]);
    (path.profile as EntityProfile).points.push({ id: 'center', x: 20, y: 10 });
    const feature = sweep(path);
    (path.profile as EntityProfile).entities.reverse();
    const result = success([circle(), path, feature]);
    expect(result.volume).toBeCloseTo(4 * Math.PI * (20 + 10 * Math.PI), 5);
  });

  it('constructs a sharp line corner with a miter transition', async () => {
    const path = pathSketch([[0, 0], [0, 20], [20, 20]]);
    const result = success([circle(), path, sweep(path)]);
    expect(result.volume).toBeCloseTo(160 * Math.PI, 5);
    await expectStep(result.volume);
  });

  it('respects a reversed path and a profile on its opposite endpoint', () => {
    const path = pathSketch([[0, 20], [0, 0]]), feature = sweep(path);
    feature.path[0].reversed = true;
    expect(success([circle(), path, feature]).volume).toBeCloseTo(80 * Math.PI, 6);
  });

  it('rebuilds a solver dimension and preserves generated edge references on a straight sweep', () => {
    const section = circle();
    section.profile = { kind: 'entities', points: [], entities: [{ id: 'circle', type: 'circle', construction: false, center: 'origin', radius: 2 }],
      constraints: [{ id: 'radius', type: 'radius', entityId: 'circle', value: 2 }] };
    const path = pathSketch([[0, 0], [0, 20]]), feature = sweep(path);
    const before = success([section, path, feature]);
    (section.profile.constraints[0] as { value: number }).value = 3;
    const after = success([section, path, feature]);
    expect(after.volume).toBeCloseTo(180 * Math.PI, 4);
    expect(after.edges.map((edge) => edge.ref.key).sort()).toEqual(before.edges.map((edge) => edge.ref.key).sort());
  });

  it('rejects a section wider than the circular path curvature can support', () => {
    const path = pathSketch([[0, 0], [20, 20]], [0]);
    (path.profile as EntityProfile).points.push({ id: 'center', x: 20, y: 0 });
    expect(engine.build([circle('profile', 25), path, sweep(path)]).featureErrors[0]?.id).toBe('sweep');
  });

  it.each(['empty', 'duplicate', 'disconnected', 'crossed', 'closed', 'construction', 'normal', 'detached'])(
    'rejects a %s sweep without exporting a partial result', (problem) => {
      let path = pathSketch([[0, 0], [0, 20]]), section = circle();
      if (problem === 'disconnected') path = pathSketch([[0, 0], [0, 20], [20, 20]]);
      if (problem === 'crossed') path = pathSketch([[0, 0], [0, 20], [10, 0], [-10, 10]]);
      if (problem === 'closed') path = pathSketch([[0, 0], [0, 20], [20, 0], [0, 0]]);
      const feature = sweep(path);
      if (problem === 'empty') feature.path = [];
      if (problem === 'duplicate') feature.path.push({ ...feature.path[0] });
      if (problem === 'disconnected') feature.path[1].reversed = true;
      if (problem === 'construction') (path.profile as EntityProfile).entities[0].construction = true;
      if (problem === 'normal') section.plane = 'YZ';
      if (problem === 'detached') section.offset = 5;
      expect(engine.build([section, path, feature]).featureErrors[0]?.id).toBe('sweep');
      expect(() => engine.export('step')).toThrow('Corrige');
    });

  it('lofts two circles as an analytic conical frustum', async () => {
    const sections = [circle('a', 5), circle('b', 10, 20)];
    const result = success([...sections, loft(sections)]);
    expect(result.volume).toBeCloseTo(Math.PI * 20 * 175 / 3, 6);
    await expectStep(result.volume);
  });

  it('lofts three laterally shifted sections with an explicit ruled correspondence', async () => {
    const sections = [circle('a', 5), circle('b', 10, 20, [12, 7]), circle('c', 6, 50, [-5, 16])];
    const result = success([...sections, loft(sections)]);
    // OpenCascade integrates the oblique ruled surfaces numerically (native tolerance 1e-6 mm).
    expect(Math.abs(result.volume - Math.PI * (20 * 175 + 30 * 196) / 3)).toBeLessThan(1e-4);
    await expectStep(result.volume);
  });

  it('lofts smooth multiple sections and exports the resulting spline surfaces', async () => {
    const sections = [circle('a', 5), circle('b', 10, 20, [5, 3]), circle('c', 6, 50, [8, 1])];
    const result = success([...sections, loft(sections, false)]);
    expect(result.volume).toBeGreaterThan(1000);
    await expectStep(result.volume);
  });

  it('lofts matched line contours and respects their selected seam instead of native reordering', () => {
    const sections = [rectangle('a'), rectangle('b', 20, 20)], feature = loft(sections);
    feature.sections.forEach((section) => section.startEntityId = 'edge-a');
    const before = success([...sections, feature]);
    expect(before.volume).toBeCloseTo(20 * (100 + 400 + 200) / 3, 5);
    feature.sections[1].startEntityId = 'edge-b';
    const twisted = success([...sections, feature]);
    expect(Math.abs(twisted.volume - before.volume)).toBeGreaterThan(100);
    expect(twisted.edges.some((edge) => before.edges.some((old) => old.ref.key === edge.ref.key))).toBe(false);
  });

  it.each([[10, true], [20, true], [10, false]] as const)(
    'rejects a 180-degree section correspondence with size %s and ruled=%s before it creates a point waist', (size, ruled) => {
      const sections = [rectangle('a'), rectangle('b', size, 20)], feature = loft(sections, ruled);
      feature.sections[0].startEntityId = 'edge-a';
      feature.sections[1].startEntityId = 'edge-c';
      const result = engine.build([...sections, feature]);
      expect(result.featureErrors[0]?.id).toBe('loft');
      expect(result.featureErrors[0]?.message).toContain('colapsa');
      expect(() => engine.export('step')).toThrow('Corrige');
    });

  it('supports genuinely inclined section frames without requiring coaxial or parallel planes', () => {
    const sections = [circle('a', 5), circle('b', 6, 20)];
    const shape = loftSolid(loft(sections), [
      { profile: sections[0].profile, frame: { origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] } },
      { profile: sections[1].profile, frame: { origin: [8, 3, 20], xDirection: [1, 0, 0], normal: [0, -.5, Math.sqrt(.75)] } },
    ]);
    const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
    const volume = measureShapeVolumeProperties(shape);
    try { expect(analyzer.IsValid()).toBe(true); expect(volume.volume).toBeGreaterThan(1000); }
    finally { analyzer.delete(); volume.delete(); shape.delete(); }
  });

  it('does not impose world-Z monotonicity on three differently inclined sections', () => {
    const sections = [circle('a', 2), circle('b', 2), circle('c', 2)];
    const shape = loftSolid(loft(sections), [
      { profile: sections[0].profile, frame: { origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] } },
      { profile: sections[1].profile, frame: { origin: [0, 0, 20], xDirection: [1, 0, 0], normal: [0, .5, Math.sqrt(.75)] } },
      { profile: sections[2].profile, frame: { origin: [0, 20, 15], xDirection: [1, 0, 0], normal: [0, 1, 0] } },
    ]);
    const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false), volume = measureShapeVolumeProperties(shape);
    try { expect(analyzer.IsValid()).toBe(true); expect(volume.volume).toBeGreaterThan(100); }
    finally { analyzer.delete(); volume.delete(); shape.delete(); }
  });

  it('lofts compatible mixed line-and-arc contours without discretizing their boundaries', () => {
    const sections = [1, 2].map((scale, index): SketchFeature => ({ ...circle(`s${index}`, 2, index * 20),
      profile: { kind: 'entities', constraints: [], points: [{ id: 'a', x: -5 * scale, y: 0 }, { id: 'b', x: 5 * scale, y: 0 }],
        entities: [{ id: 'line', type: 'line', construction: false, start: 'a', end: 'b' },
          { id: 'arc', type: 'arc', construction: false, start: 'b', end: 'a', center: 'origin', clockwise: false }] } }));
    const feature = loft(sections);
    feature.sections.forEach((section) => section.startEntityId = 'line');
    const result = success([...sections, feature]);
    expect(result.volume).toBeCloseTo(Math.PI * 20 * 175 / 6, 5);
  });

  it('handles 32 explicitly ordered sections and rejects a 33rd section', () => {
    const sections = Array.from({ length: 32 }, (_, index) => circle(`s${index}`, 2, index * 2));
    expect(success([...sections, loft(sections)]).volume).toBeCloseTo(4 * Math.PI * 62, 5);
    sections.push(circle('s32', 2, 64));
    expect(engine.build([...sections, loft(sections)]).featureErrors[0]?.message).toContain('32');
  }, 20_000);

  it('moves loft sections with reference planes and keeps a later face support associative', async () => {
    const plane: Feature = { id: 'plane', name: 'Plano', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 20, reversed: false };
    const sections = [circle('a', 5), { ...circle('b', 5), support: { kind: 'plane' as const, planeId: 'plane' } }];
    const feature = loft(sections), initial = success([plane, ...sections, feature]);
    const top = initial.faces!.find((face) => face.frame?.normal[2] === 1)!;
    const attached = { ...circle('boss', 2), support: { kind: 'face' as const, face: top.ref } };
    const extrude: Feature = { id: 'boss-solid', name: 'Saliente', type: 'extrude', sketchId: 'boss', depth: 3, symmetric: false, suppressed: false };
    plane.offset = 30;
    const result = success([plane, ...sections, feature, attached, extrude]);
    expect(result.volume).toBeCloseTo(Math.PI * (25 * 30 + 4 * 3), 5);
    expect(result.bounds.max[2]).toBeCloseTo(33, 6);
    await expectStep(result.volume);
  });

  it('uses explicit reversal to match sections on oppositely oriented planes', () => {
    const plane: Feature = { id: 'plane', name: 'Plano', type: 'plane', suppressed: false,
      support: { kind: 'principal', plane: 'XY' }, offset: 20, reversed: true };
    const sections = [circle('a', 5), { ...circle('b', 5), support: { kind: 'plane' as const, planeId: 'plane' } }];
    const feature = loft(sections);
    feature.sections[1].reversed = true;
    expect(success([plane, ...sections, feature]).volume).toBeCloseTo(500 * Math.PI, 5);
  });

  it('rejects holes, mixed section structures, absent seams and intersecting sections', () => {
    const first = rectangle('a'), second = rectangle('b', 10, 20);
    const missing = loft([first, second]);
    expect(engine.build([first, second, missing]).featureErrors[0]?.message).toContain('entidad inicial');
    const mixed = [circle('a', 5), { ...circle('b', 5, 20), profile: { kind: 'rectangle' as const, center: [0, 0] as [number, number], width: 10, height: 10 } }];
    expect(engine.build([...mixed, loft(mixed)]).featureErrors[0]?.message).toContain('mismo número');
    const touching = [circle('a', 5), circle('b', 10)];
    expect(engine.build([...touching, loft(touching)]).featureErrors[0]?.message).toContain('se tocan');
    (first.profile as EntityProfile).entities.push({ id: 'hole', construction: false, type: 'circle', center: 'origin', radius: 1 });
    expect(engine.build([first, second, missing]).featureErrors[0]?.message).toContain('sin agujeros');
  });

  it('honors merge false as separate bodies and requires a real connection when merging', async () => {
    const base = circle('base', 5), extrude: Feature = { id: 'base-solid', name: 'Base', type: 'extrude', sketchId: base.id, depth: 10, symmetric: false, suppressed: false };
    const sections = [circle('a', 2, 20), circle('b', 3, 30)];
    const feature = loft(sections, true, false);
    const result = success([base, extrude, ...sections, feature]);
    expect(result.warnings[0]).toContain('2 sólidos');
    await expectStep(result.volume, 2);
    feature.merge = true;
    expect(engine.build([base, extrude, ...sections, feature]).featureErrors[0]?.message).toContain('fusionar');
    sections[0].offset = 5;
    expect(success([base, extrude, ...sections, feature]).warnings).toEqual([]);
  });

  it('suppresses either dependency and propagates omission to finishes and face-supported sketches', () => {
    const sections = [circle('a', 5), circle('b', 10, 20)], feature = loft(sections);
    const built = success([...sections, feature]);
    const face = built.faces!.find((item) => item.frame)!;
    const attached: SketchFeature = { ...circle('attached'), support: { kind: 'face', face: face.ref } };
    sections[1].suppressed = true;
    const result = success([...sections, feature, attached, { id: 'finish', name: 'Acabado', type: 'fillet', baseFeatureId: feature.id,
      size: 1, selection: { mode: 'all' }, suppressed: false }]);
    expect(result.volume).toBe(0);
    expect(result.warnings).toHaveLength(3);
  });


});
