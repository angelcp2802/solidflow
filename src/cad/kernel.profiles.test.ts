import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, measureShapeVolumeProperties, setOC } from 'replicad';
import { CadEngine } from './kernel.engine';
import type { EdgeFinishFeature, ExtrudeFeature, Feature, Plane, SketchFeature } from './kernel.types';
import type { EntityProfile, SketchConstraint } from '../sketch/types';
import { createConstrainedPlateDocument } from '../model/sketch-examples';
import { parseDocument, serializeDocument } from '../model/document';

const engine = new CadEngine();
beforeAll(async () => {
  const wasmBinary = await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'));
  setOC(await initOpenCascade({ wasmBinary, print: () => undefined }));
}, 60_000);
afterEach(() => engine.dispose());

function polygon(points: [number, number][], prefix = 'a'): EntityProfile {
  return { kind: 'entities', points: points.map(([x, y], i) => ({ id: `${prefix}${i}`, x, y })),
    entities: points.map((_, i) => ({ id: `${prefix}-line${i}`, type: 'line', construction: false,
      start: `${prefix}${i}`, end: `${prefix}${(i + 1) % points.length}` })), constraints: [] };
}
const rectangle = (width = 100, height = 70) => polygon([[-width / 2, -height / 2], [width / 2, -height / 2], [width / 2, height / 2], [-width / 2, height / 2]]);
function circles(radii: number[]): EntityProfile {
  return { kind: 'entities', points: [{ id: 'c', x: 0, y: 0 }], constraints: [],
    entities: radii.map((radius, i) => ({ id: `circle${i}`, type: 'circle', construction: false, center: 'c', radius })) };
}
function sketch(profile: EntityProfile, plane: Plane = 'XY'): SketchFeature {
  return { id: 'sketch', name: 'Croquis', type: 'sketch', plane, offset: 0, profile, suppressed: false };
}
const extrusion = (depth = 12): ExtrudeFeature => ({ id: 'extrude', name: 'Saliente', type: 'extrude', sketchId: 'sketch', depth, symmetric: false, suppressed: false });
const solid = (profile: EntityProfile, depth = 12, plane: Plane = 'XY') => engine.build([sketch(profile, plane), extrusion(depth)]);
const combine = (...profiles: EntityProfile[]): EntityProfile => ({ kind: 'entities',
  points: profiles.flatMap((profile) => profile.points), entities: profiles.flatMap((profile) => profile.entities),
  constraints: profiles.flatMap((profile) => profile.constraints) });

describe('multi-entity sketch solids', () => {
  it('reopens the UI-saved 120 mm plate with its dimensions, hole locations and solid intact', async () => {
    const source = await readFile(new URL('../../examples/Placa acotada 120.solidflow', import.meta.url), 'utf8');
    const document = parseDocument(source);
    const feature = document.features[0];
    if (feature.type !== 'sketch' || feature.profile.kind !== 'entities') throw new Error('Expected entity sketch');
    expect(feature.profile.entities).toHaveLength(8);
    expect(feature.profile.constraints).toHaveLength(19);
    expect(feature.profile.constraints.find((constraint) => constraint.id === 'width')).toMatchObject({ type: 'length', value: 120 });
    for (const [id, x, y] of [['h0', -35, -20], ['h1', 55, -20], ['h2', 55, 20], ['h3', -35, 20]] as const) {
      const point = feature.profile.points.find((candidate) => candidate.id === id)!;
      expect(point.x).toBeCloseTo(x, 7);
      expect(point.y).toBeCloseTo(y, 7);
    }
    const originalFeatures = JSON.stringify(document.features);
    const result = engine.build(document.features);
    expect(result.featureErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(Math.abs(result.volume - (120 * 70 - 4 * Math.PI * 25) * 12)).toBeLessThan(1e-5);
    expect(result.bounds.min[0]).toBeCloseTo(-50, 6);
    expect(result.bounds.max[0]).toBeCloseTo(70, 6);
    expect(JSON.stringify(document.features)).toBe(originalFeatures);
  });

  it.each([100, 120])('rebuilds the delivered constrained plate at width %s through the real solver and kernel', (width) => {
    const document = parseDocument(serializeDocument(createConstrainedPlateDocument()));
    const feature = document.features[0];
    if (feature.type !== 'sketch' || feature.profile.kind !== 'entities') throw new Error('Expected entity sketch');
    const dimension = feature.profile.constraints.find((constraint) => constraint.id === 'width')!;
    if (!('value' in dimension)) throw new Error('Expected driving dimension');
    dimension.value = width;
    const result = engine.build(document.features);
    expect(result.featureErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.volume).toBeCloseTo((width * 70 - 4 * Math.PI * 25) * 12, 4);
    expect(result.bounds.min[0]).toBeCloseTo(-50, 5);
    expect(result.bounds.max[0]).toBeCloseTo(width - 50, 5);
  });

  it('extrudes an exact plate with a circular hole in the same sketch', () => {
    const profile = combine(rectangle(), circles([5]));
    const result = solid(profile);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(84000 - Math.PI * 25 * 12, 5);
    expect(result.warnings).toEqual([]);
  });

  it('uses even/odd nested contours for holes and material islands', () => {
    const result = solid(circles([20, 10, 3]), 2);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(Math.PI * (400 - 100 + 9) * 2, 5);
    expect(result.warnings).toContain('La pieza contiene 2 sólidos separados.');
  });

  it('builds separate closed regions and ignores construction entities', () => {
    const profile = combine(polygon([[0, 0], [10, 0], [10, 10], [0, 10]]), polygon([[20, 0], [25, 0], [25, 5], [20, 5]], 'b'));
    profile.entities.push({ id: 'diagonal', type: 'line', construction: true, start: 'a0', end: 'a2' });
    const result = solid(profile, 2);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(250, 6);
    expect(result.warnings).toContain('La pieza contiene 2 sólidos separados.');
  });

  it('orders shuffled edges and accepts a reversed contour with signed extrusion', () => {
    const profile = polygon([[0, 0], [0, 10], [20, 10], [20, 0]]);
    profile.entities = [profile.entities[2], profile.entities[0], profile.entities[3], profile.entities[1]];
    const result = solid(profile, -3);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(600, 6);
    expect(result.bounds.min[2]).toBeCloseTo(-3, 6);
  });

  it('merges endpoint coordinates within the documented joining tolerance', () => {
    const profile = rectangle(20, 10);
    profile.points.push({ id: 'closing', x: -10 + 2e-6, y: -5 });
    profile.entities[3] = { id: 'last', type: 'line', start: 'a3', end: 'closing', construction: false };
    const result = solid(profile, 3);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(600, 5);
  });

  it.each([false, true])('preserves circular arcs, including clockwise=%s', (clockwise) => {
    const profile = polygon([[0, 0], [20, 0], [20, 20], [0, 20]]);
    profile.points.push({ id: 'center', x: 20, y: 10 });
    profile.entities[1] = { id: 'arc', type: 'arc', construction: false, start: 'a1', end: 'a2', center: 'center', clockwise };
    const result = solid(profile, 3);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo((400 + (clockwise ? -1 : 1) * 50 * Math.PI) * 3, 5);
  });

  it('constructs a major circular arc instead of its complementary minor arc', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'c', x: 0, y: 0 }, { id: 'a', x: 10, y: 0 }, { id: 'b', x: 0, y: -10 }], constraints: [], entities: [
      { id: 'arc', type: 'arc', center: 'c', start: 'a', end: 'b', clockwise: false, construction: false },
      { id: 'chord', type: 'line', start: 'b', end: 'a', construction: false },
    ] };
    const result = solid(profile, 2);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo((75 * Math.PI + 50) * 2, 5);
  });

  it('joins two complementary arcs without treating their common circle as overlap', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'c', x: 0, y: 0 }, { id: 'a', x: 10, y: 0 }, { id: 'b', x: -10, y: 0 }], constraints: [], entities: [
      { id: 'first', type: 'arc', center: 'c', start: 'a', end: 'b', clockwise: false, construction: false },
      { id: 'second', type: 'arc', center: 'c', start: 'b', end: 'a', clockwise: false, construction: false },
    ] };
    const result = solid(profile, 2);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(Math.PI * 100 * 2, 5);
  });

  it.each<Plane>(['XY', 'XZ', 'YZ'])('uses the correct plane normal and symmetric span for %s', (plane) => {
    const feature = sketch(rectangle(10, 6), plane);
    feature.offset = 20;
    const result = engine.build([feature, { ...extrusion(4), symmetric: true }]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(240, 5);
    const axis = plane === 'XY' ? 2 : plane === 'XZ' ? 1 : 0;
    expect(result.bounds.min[axis]).toBeCloseTo(plane === 'XZ' ? -22 : 18, 5);
    expect(result.bounds.max[axis]).toBeCloseTo(plane === 'XZ' ? -18 : 22, 5);
  });

  it('keeps empty and open sketches editable but refuses an open solid profile', () => {
    const empty: EntityProfile = { kind: 'entities', points: [], entities: [], constraints: [] };
    expect(engine.build([sketch(empty)]).featureErrors).toEqual([]);
    expect(solid(empty).featureErrors[0]?.id).toBe('extrude');
    const open = rectangle();
    open.entities.pop();
    expect(engine.build([sketch(open)]).featureErrors).toEqual([]);
    const result = solid(open);
    expect(result.featureErrors[0]?.message).toContain('abierto');
    expect(() => engine.export('step')).toThrow('Corrige las operaciones');
  });

  it('returns a solved open sketch wire without requiring or creating a solid', () => {
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }], constraints: [
        { id: 'fixed', type: 'fix', pointId: 'a', x: 0, y: 0 },
        { id: 'horizontal', type: 'horizontal', entityId: 'line' },
        { id: 'length', type: 'length', entityId: 'line', value: 20 },
      ] };
    const source = { ...sketch(profile, 'XZ'), offset: 7 };
    const result = engine.build([source]);
    expect(result.featureErrors).toEqual([]);
    expect(result.vertices).toEqual([]);
    expect(result.volume).toBe(0);
    expect(result.sketches).toHaveLength(1);
    expect(result.sketches![0].lines).toHaveLength(6);
    [0, -7, 0, 20, -7, 0].forEach((coordinate, index) => expect(result.sketches![0].lines[index]).toBeCloseTo(coordinate, 6));
    expect(profile.points[1].x).toBe(10);
    expect(engine.build([{ ...source, suppressed: true }]).sketches).toEqual([]);
  });

  it('rejects crossed, touching, duplicated and branched contours explicitly', () => {
    const crossed = polygon([[0, 0], [10, 10], [0, 10], [10, 0]]);
    expect(solid(crossed).featureErrors[0]?.message).toContain('cruzan');
    const touching = combine(circles([5]), { kind: 'entities', points: [{ id: 'd', x: 10, y: 0 }], constraints: [],
      entities: [{ id: 'other-circle', type: 'circle', center: 'd', radius: 5, construction: false }] });
    expect(solid(touching).featureErrors[0]?.message).toContain('tocan');
    expect(solid(circles([5, 5])).featureErrors[0]?.message).toContain('superpuestos');
    const branched = rectangle();
    branched.entities.push({ id: 'branch', type: 'line', start: 'a0', end: 'a2', construction: false });
    expect(solid(branched).featureErrors[0]?.message).toContain('ramificación');
  });

  it('cuts with an entity profile without filling its inner contour', () => {
    const base: SketchFeature = { ...sketch(rectangle()), id: 'base' };
    const profile = circles([10, 5]);
    const features: Feature[] = [base, { ...extrusion(12), id: 'base-extrude', sketchId: 'base' }, sketch(profile), { ...extrusion(12), type: 'cut' }];
    const result = engine.build(features);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(84000 - Math.PI * (100 - 25) * 12, 5);
  });

  it('revolves an entity rectangle into an exact cylinder and rejects an axis-crossing profile', () => {
    const features: Feature[] = [sketch(polygon([[0, 0], [10, 0], [10, 20], [0, 20]])),
      { id: 'revolve', name: 'Revolución', type: 'revolve', sketchId: 'sketch', angle: 360, suppressed: false }];
    const result = engine.build(features);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(Math.PI * 100 * 20, 5);
    const crossing = engine.build([sketch(rectangle(20, 20)), features[1]]);
    expect(crossing.featureErrors[0]?.message).toContain('cruza el eje');
  });

  it('revolves a separated circle into a torus and rejects a circle tangent to the axis', () => {
    const profile = circles([2]);
    profile.points[0].x = 10;
    const operation: Feature = { id: 'revolve', name: 'Revolución', type: 'revolve', sketchId: 'sketch', angle: 360, suppressed: false };
    const result = engine.build([sketch(profile), operation]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(2 * Math.PI ** 2 * 10 * 4, 5);
    profile.points[0].x = 2;
    expect(engine.build([sketch(profile), operation]).featureErrors[0]?.message).toContain('punto singular');
  });

  it('uses solved dimensional constraints and preserves references for dimension edits', () => {
    const profile = rectangle(100, 70);
    const constraints: SketchConstraint[] = [
      { id: 'anchor', type: 'fix', pointId: 'a0', x: -50, y: -35 },
      { id: 'bottom-horizontal', type: 'horizontal', entityId: 'a-line0' },
      { id: 'right-vertical', type: 'vertical', entityId: 'a-line1' },
      { id: 'top-horizontal', type: 'horizontal', entityId: 'a-line2' },
      { id: 'left-vertical', type: 'vertical', entityId: 'a-line3' },
      { id: 'width', type: 'length', entityId: 'a-line0', value: 120 },
      { id: 'height', type: 'length', entityId: 'a-line1', value: 70 },
    ];
    profile.constraints = constraints;
    const before = JSON.stringify(profile);
    const enlarged = solid(profile);
    expect(enlarged.featureErrors).toEqual([]);
    expect(enlarged.volume).toBeCloseTo(120 * 70 * 12, 3);
    expect(JSON.stringify(profile)).toBe(before);
    const reference = enlarged.edges.find(({ lines }) => lines.every((coordinate, i) => i % 3 === 0 ? Math.abs(coordinate - 70) < 1e-5 : i % 3 === 1 ? Math.abs(coordinate - 35) < 1e-5 : true))!.ref;
    profile.constraints = constraints.map((constraint) => constraint.id === 'width' ? { ...constraint, value: 140 } : constraint) as SketchConstraint[];
    const finish: EdgeFinishFeature = { id: 'fillet', name: 'Redondeo', type: 'fillet', baseFeatureId: 'extrude', size: 2,
      selection: { mode: 'selected', edges: [reference] }, suppressed: false };
    const resized = engine.build([sketch(profile), extrusion(20), finish]);
    expect(resized.featureErrors).toEqual([]);
    expect(resized.volume).toBeCloseTo(140 * 70 * 20 - (4 - Math.PI) * 20, 3);
  });

  it('rejects contradictory solver results before building a solid', () => {
    const profile = rectangle();
    profile.constraints = [{ id: 'one', type: 'length', entityId: 'a-line0', value: 100 },
      { id: 'two', type: 'length', entityId: 'a-line0', value: 120 }];
    const result = solid(profile);
    expect(result.featureErrors[0]?.id).toBe('sketch');
    expect(result.featureErrors[0]?.message).toContain('resolver');
    expect(result.volume).toBe(0);
  });

  it('requires reselection when entity roles rotate within an otherwise identical square', () => {
    const profile = rectangle(10, 10);
    const reference = solid(profile, 10).edges[0].ref;
    profile.points = profile.points.map((point) => ({ ...point, x: -point.y, y: point.x }));
    const finish: EdgeFinishFeature = { id: 'fillet', name: 'Redondeo', type: 'fillet', baseFeatureId: 'extrude', size: 1,
      selection: { mode: 'selected', edges: [reference] }, suppressed: false };
    const rotatedRoles = engine.build([sketch(profile), extrusion(10), finish]);
    expect(rotatedRoles.featureErrors[0]?.message).toContain('Recupera la selección');
    expect(rotatedRoles.volume).toBeCloseTo(1000, 5);
  });

  it('roundtrips a multi-contour sketch as a valid STEP solid', async () => {
    const result = solid(combine(rectangle(), circles([5])));
    expect(result.featureErrors).toEqual([]);
    const imported = (await importSTEP(engine.export('step'))).asShape3D();
    const properties = measureShapeVolumeProperties(imported);
    const analyzer = new (getOC().BRepCheck_Analyzer)(imported.wrapped, true, false, false);
    try {
      expect(analyzer.IsValid()).toBe(true);
      expect(properties.volume).toBeCloseTo(result.volume, 5);
    } finally { analyzer.delete(); properties.delete(); imported.delete(); }
  });
});
