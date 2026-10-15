import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, getOC, makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { addFeature, createDocument, DocumentHistory, parseDocument, serializeDocument, updateFeature,
  validateDocument, type Document } from '../model/document';
import type { EntityProfile } from '../sketch/types';
import { bodyBoolean, copyBodyShape, NativeBodyCatalog, validateBodyShape } from './kernel.bodies';
import { validatePositiveClosedTool } from './kernel.closed-tools';
import { CadEngine } from './kernel.engine';
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership';
import type { BodyReference, Feature, RepetitionFeature, SketchFeature, Vec3 } from './kernel.types';
import * as profiles from './kernel.profiles';
import * as recipeBridge from './kernel.recipe-instance';
import * as entityRecipes from './kernel.recipe-entities';
import * as nextResolution from './kernel.until-next-resolution';
import * as recipes from './kernel.feature-recipes';
import { exactStateKey, extractRecipeClosure, intrinsicProfileInstancePlacement,
  requireInitialRecipeDeclaration, type RegenerationRequest } from '../model/featureRecipes';
import { patternPlan } from './kernel.patterns';
import { createSourceSketchSolveRegistry, type SourceSketchSupportContext } from './kernel.sketch-solves';

// Original analytical fixtures in mm, authored from boxes and planar closed
// contours. No external model or output of a termination helper supplies an oracle.
// H=[0,12]x[0,10]x[0,10] minus [2,10]x[2,8]x[3,7]: V1008/A888.
// Cut circle R1.5 at z0 exits z3; an additive circle from z3 enters z7.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const S: BodyReference = { bodyId: 'S', sourceFeatureId: 'next-seed' };
const A: BodyReference = { bodyId: 'A', sourceFeatureId: 'hollow-A' };
const B: BodyReference = { bodyId: 'B', sourceFeatureId: 'hollow-B' };
const C: BodyReference = { bodyId: 'C', sourceFeatureId: 'create-C' };
const D: BodyReference = { bodyId: 'D', sourceFeatureId: 'create-D' };
const output = (bodyId = 'A'): BodyReference => ({ bodyId, sourceFeatureId: 'next-pattern' });
type Variant = 'primitive' | 'circle' | 'annulus' | 'disks' | 'd';
type Mode = 'cut' | 'add';
type Row = { name: string; kind: RepetitionFeature['type']; point: (p: Vec3) => Vec3 };
// Cartesian formulas are independent oracles, not calls to recipeTransform.
const rows: Row[] = [
  { name: 'linear +24X', kind: 'linearPattern', point: p => [p[0] + 24, p[1], p[2]] },
  { name: 'circular Z180', kind: 'circularPattern', point: p => [36 - p[0], -p[1], p[2]] },
  { name: 'mirror X18', kind: 'mirror', point: p => [36 - p[0], p[1], p[2]] },
  { name: 'mirror Z15', kind: 'mirror', point: p => [p[0], p[1], 30 - p[2]] },
  { name: 'circular Y90', kind: 'circularPattern', point: p => [18 + p[2], p[1], 18 - p[0]] },
];
function mappedBox(row: Row, min: Vec3, max: Vec3): [Vec3, Vec3] {
  const points: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) points.push(row.point([x, y, z]));
  return [([0, 1, 2].map(i => Math.min(...points.map(p => p[i]))) as Vec3),
    ([0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) as Vec3)];
}
function box(id: string, bodyId: string, min: Vec3, max: Vec3): Feature[] {
  return [{ id: id + '-profile', type: 'sketch', name: 'Original analytical box profile', suppressed: false,
    plane: 'XY', offset: min[2], profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
      width: max[0] - min[0], height: max[1] - min[1] } },
  { id, type: 'extrude', name: 'Original owned box', suppressed: false, sketchId: id + '-profile',
    depth: max[2] - min[2], symmetric: false, bodyOperation: { mode: 'new', bodyId } }];
}
function hollow(id: string, row: Row | undefined, floor = 3, ceiling = 7): Feature[] {
  const bounds: [Vec3, Vec3] = row ? mappedBox(row, [0, 0, 0], [12, 10, 10]) : [[0, 0, 0], [12, 10, 10]],
    cavity: [Vec3, Vec3] = row ? mappedBox(row, [2, 2, floor], [10, 8, ceiling]) : [[2, 2, floor], [10, 8, ceiling]];
  return [...box('create-' + id, id, ...bounds),
    { id: 'cavity-' + id, name: 'Original enclosed cavity profile', type: 'sketch', suppressed: false, plane: 'XY', offset: cavity[0][2],
      profile: { kind: 'rectangle', center: [(cavity[0][0] + cavity[1][0]) / 2, (cavity[0][1] + cavity[1][1]) / 2],
        width: cavity[1][0] - cavity[0][0], height: cavity[1][1] - cavity[0][1] } },
    { id: 'hollow-' + id, name: 'Original internal cavity', type: 'cut', suppressed: false, sketchId: 'cavity-' + id,
      depth: cavity[1][2] - cavity[0][2], symmetric: false, bodyScope: [{ bodyId: id, sourceFeatureId: 'create-' + id }] }];
}
function entity(variant: Exclude<Variant, 'primitive'>, radius = 1.5, underdefined = false): EntityProfile {
  if (variant === 'd') {
    const points = [{ id: 'a', x: 3, y: 4 }, { id: 'b', x: 7, y: 4 }, { id: 'c', x: 7, y: 5 }, { id: 'd', x: 7, y: 6 }, { id: 'e', x: 3, y: 6 }];
    return { kind: 'entities', points, entities: [
      { id: 'bottom', type: 'line', start: 'a', end: 'b', construction: false },
      { id: 'arc', type: 'arc', center: 'c', start: 'b', end: 'd', clockwise: false, construction: false },
      { id: 'top', type: 'line', start: 'd', end: 'e', construction: false },
      { id: 'left', type: 'line', start: 'e', end: 'a', construction: false }],
    constraints: [...points.map(p => ({ id: 'fix-' + p.id, type: 'fix' as const, pointId: p.id, x: p.x, y: p.y })),
      { id: 'measured', type: 'radius', entityId: 'arc', value: 999, driven: true }] };
  }
  const points = variant === 'disks' ? [{ id: 'c', x: 4, y: 5 }, { id: 'd', x: 8, y: 5 }] : [{ id: 'c', x: 6, y: 5 }];
  const circles = variant === 'annulus'
    ? [{ id: 'outer', type: 'circle' as const, center: 'c', radius: 2, construction: false },
      { id: 'inner', type: 'circle' as const, center: 'c', radius: 1, construction: false }]
    : points.map(p => ({ id: p.id + '-circle', type: 'circle' as const, center: p.id, radius: variant === 'circle' ? .75 : 1, construction: false }));
  return { kind: 'entities', points, entities: circles,
    constraints: [...(underdefined ? [] : points.map(p => ({ id: 'fix-' + p.id, type: 'fix' as const, pointId: p.id, x: p.x, y: p.y }))),
      ...circles.map(c => ({ id: 'drive-' + c.id, type: 'radius' as const, entityId: c.id, value: variant === 'circle' ? radius : c.radius })),
      { id: 'measured', type: 'radius', entityId: circles[0].id, value: 999, driven: true }] };
}
function document(features: Feature[]): Document { return validateDocument({ ...createDocument('Original saved UntilNext acceptance'), features }); }
function pattern(row: Row, all: boolean, baseFeatureId = 'hollow-A'): RepetitionFeature {
  const common = { id: 'next-pattern', name: 'Original UntilNext regeneration', suppressed: false, baseFeatureId,
    source: { mode: 'features' as const, geometryPattern: false, featureIds: ['next-seed'] },
    featurePattern: all ? { mode: 'regenerate' as const, scope: 'all' as const, reevaluateAt: 'patternInput' as const,
      bindings: [{ source: S, targetBodyIds: 'scope' as const }], referencePolicies: [], variation: { kind: 'none' as const } }
      : { mode: 'regenerate' as const, scope: 'selected' as const, targets: [A],
        bindings: [{ source: S, targetBodyIds: ['A'] }], referencePolicies: [], variation: { kind: 'none' as const } } };
  if (row.kind === 'linearPattern') return { ...common, type: row.kind, first: { direction: [1, 0, 0], spacing: 24, count: 2 }, second: null, secondSeedOnly: false, skipped: [] };
  if (row.kind === 'circularPattern') return { ...common, type: row.kind,
    axis: { origin: [18, 0, 0], direction: row.name === 'circular Y90' ? [0, 1, 0] : [0, 0, 1] },
    angle: row.name === 'circular Y90' ? 90 : 180, count: 2, equalSpacing: false, reversed: false, skipped: [] };
  return { ...common, type: row.kind, support: { kind: 'plane', planeId: 'next-mirror' }, mergeBodies: false };
}
function fixture(row = rows[0], variant: Variant = 'primitive', mode: Mode = 'cut', all = false) {
  const profile = variant === 'primitive' ? { kind: 'circle' as const, center: [6, 5] as [number, number], radius: 1.5 } : entity(variant);
  const start = mode === 'add' ? 3 : variant === 'annulus' ? 1 : 0;
  const seed: Feature = mode === 'cut'
    ? { id: S.sourceFeatureId, name: 'Original UntilNext cut seed', type: 'cut', suppressed: false, sketchId: 'next-profile', depth: 1,
      symmetric: false, bodyScope: [{ bodyId: 'S', sourceFeatureId: 'hollow-S' }], endCondition: { kind: 'untilNext', baseFeatureId: 'hollow-S' } }
    : { id: S.sourceFeatureId, name: 'Original UntilNext merge seed', type: 'extrude', suppressed: false, sketchId: 'next-profile', depth: 1,
      symmetric: false, bodyOperation: { mode: 'merge', target: { bodyId: 'S', sourceFeatureId: 'hollow-S' } },
      endCondition: { kind: 'untilNext', baseFeatureId: 'hollow-S' } };
  const features: Feature[] = [...hollow('S', undefined),
    { id: 'next-profile', name: 'Original whole solved contour', type: 'sketch', suppressed: false, plane: 'XY', offset: start, profile }, seed,
    ...hollow('A', row, 3, mode === 'add' ? 8 : 7)];
  if (all) features.push(...hollow('B', row, 5, 8), ...box('create-C', 'C', [60, 0, 0], [72, 10, 10]),
    ...box('create-D', 'D', ...mappedBox(row, [0, 0, -12], [12, 10, -2])));
  if (row.kind === 'mirror') features.push({ id: 'next-mirror', name: 'Original mirror datum', type: 'plane', suppressed: false,
    support: { kind: 'principal', plane: row.name === 'mirror Z15' ? 'XY' : 'YZ' },
    offset: row.name === 'mirror Z15' ? 15 : 18, reversed: false });
  return { value: document(features), operation: pattern(row, all, all ? 'create-D' : 'hollow-A') };
}
function usingEngine(run: (engine: CadEngine) => void): void {
  withNativeOwners(owners => { const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() }); run(engine); });
}
function catalog(engine: CadEngine): NativeBodyCatalog {
  const value = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  if (!value) throw new Error('Expected the actual native catalog.'); return value;
}
function healthy(engine: CadEngine, value: Document) {
  const saved = serializeDocument(value), result = engine.build(value.features);
  expect(result.featureErrors).toEqual([]); expect(result.bodyCatalogActive).toBe(true); expect(serializeDocument(value)).toBe(saved); return result;
}
function metrics(engine: CadEngine, ref: BodyReference, volume: number, area: number, bounds: [Vec3, Vec3]): void {
  withNativeOwners(owners => {
    const shape = catalog(engine).resolve(ref).shape; validateBodyShape(shape);
    const solids = shape.solids; owners.ownAll(solids); expect(solids).toHaveLength(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const actual = owners.own(shape.boundingBox).bounds;
    bounds.forEach((side, i) => side.forEach((x, j) => expect(Math.abs(actual[i][j] - x)).toBeLessThan(1e-6)));
  });
}
function probe(engine: CadEngine, ref: BodyReference, center: Vec3, present: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(x => x - .1) as Vec3, center.map(x => x + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', catalog(engine).resolve(ref).shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .008 : 0))).toBeLessThan(1e-7);
  });
}

for (const row of rows) for (const variant of ['primitive', 'circle'] as const) for (const mode of ['cut', 'add'] as const)
  it(`reopens selected ${mode} UntilNext with ${variant} and ${row.name}`, () => usingEngine(engine => {
    const { value, operation } = fixture(row, variant, mode), solve = vi.spyOn(profiles, 'solveEntityProfileResult');
    try {
      const saved = parseDocument(serializeDocument(addFeature(value, operation))), result = healthy(engine, saved);
      const bounds = mappedBox(row, [0, 0, 0], [12, 10, 10]);
      metrics(engine, output(), mode === 'cut' ? 1008 - 27 * Math.PI / 4 : 960 + 45 * Math.PI / 4,
        mode === 'cut' ? 888 + 9 * Math.PI / 2 : 916 + 21 * Math.PI / 2, bounds);
      probe(engine, output(), row.point([6, 5, mode === 'cut' ? 1.5 : 5]), mode === 'add');
      probe(engine, output(), row.point([6, 5, 9]), true);
      if (mode === 'add') probe(engine, output(), row.point([9, 5, 5]), false);
      expect(result.bodies!.find(b => b.ref.bodyId === 'A')!.createdByFeatureId).toBe('create-A');
      if (variant === 'circle') {
        expect(solve).toHaveBeenCalledTimes(1); const actual = solve.mock.results[0].value;
        expect(Math.abs(actual.drivenValues.measured - 1.5)).toBeLessThan(1e-7);
        const sketch = saved.features.find(f => f.id === 'next-profile') as SketchFeature;
        if (sketch.profile.kind !== 'entities' || sketch.profile.entities[0].type !== 'circle') throw new Error('Original entity circle missing.');
        expect(sketch.profile.entities[0].radius).toBe(.75); expect(sketch.profile.constraints.find(c => c.id === 'measured')).toMatchObject({ value: 999, driven: true });
      } else expect(solve).not.toHaveBeenCalled();
    } finally { solve.mockRestore(); }
  }), 60_000);

for (const row of rows) for (const variant of ['primitive', 'circle'] as const)
  it(`resolves complete cut ALL owner inventory independently with ${variant} and ${row.name}`, () => usingEngine(engine => {
    const { value, operation } = fixture(row, variant, 'cut', true), saved = parseDocument(serializeDocument(addFeature(value, operation)));
    const result = healthy(engine, saved), bounds = mappedBox(row, [0, 0, 0], [12, 10, 10]);
    metrics(engine, output(), 1008 - 27 * Math.PI / 4, 888 + 9 * Math.PI / 2, bounds);
    metrics(engine, output('B'), 1056 - 45 * Math.PI / 4, 860 + 21 * Math.PI / 2, bounds);
    probe(engine, output(), row.point([6, 5, 4]), false); probe(engine, output('B'), row.point([6, 5, 4]), false);
    probe(engine, output('B'), row.point([6, 5, 9]), true);
    metrics(engine, C, 1200, 680, [[60, 0, 0], [72, 10, 10]]);
    metrics(engine, D, 1200, 680, mappedBox(row, [0, 0, -12], [12, 10, -2]));
    expect(result.bodies).toHaveLength(5); expect(() => catalog(engine).resolve(output('C'))).toThrow(); expect(() => catalog(engine).resolve(output('D'))).toThrow();
    expect(Object.hasOwn((saved.features.at(-1) as RepetitionFeature).featurePattern, 'targets')).toBe(false);
    expect((saved.features.at(-1) as RepetitionFeature).featurePattern).toEqual(operation.featurePattern);
  }), 60_000);

for (const variant of ['annulus', 'disks', 'd'] as const) for (const mode of ['cut', 'add'] as const)
  it(`retains the whole ${variant} profile for a selected UntilNext ${mode}`, () => usingEngine(engine => {
    const { value, operation } = fixture(rows[0], variant, mode); healthy(engine, parseDocument(serializeDocument(addFeature(value, operation))));
    const area = variant === 'annulus' ? 3 * Math.PI : variant === 'disks' ? 2 * Math.PI : 8 + Math.PI / 2,
      perimeter = variant === 'annulus' ? 6 * Math.PI : variant === 'disks' ? 4 * Math.PI : 10 + Math.PI,
      length = mode === 'add' ? 5 : variant === 'annulus' ? 2 : 3;
    metrics(engine, output(), (mode === 'cut' ? 1008 : 960) + (mode === 'cut' ? -1 : 1) * area * length,
      (mode === 'cut' ? 888 : 916) + perimeter * length - (mode === 'cut' && variant === 'annulus' ? 0 : 2 * area), [[24, 0, 0], [36, 10, 10]]);
    if (variant === 'annulus') {
      probe(engine, output(), [31.5, 5, mode === 'cut' ? 2 : 5], mode === 'add');
      probe(engine, output(), [30, 5, mode === 'cut' ? 2 : 5], mode === 'cut');
    } else if (variant === 'disks') {
      for (const x of [28, 32]) probe(engine, output(), [x, 5, mode === 'cut' ? 1.5 : 5], mode === 'add');
      probe(engine, output(), [30, 5, mode === 'cut' ? 1.5 : 5], mode === 'cut');
    } else probe(engine, output(), [31.5, 5, mode === 'cut' ? 1.5 : 5], mode === 'add');
  }), 60_000);

it('uses a real underdefined entity solve without inventing fixed dimensions or driven values', () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], 'circle'), sketch = value.features.find(f => f.id === 'next-profile') as SketchFeature;
  sketch.profile = entity('circle', 1.5, true);
  const solve = vi.spyOn(profiles, 'solveEntityProfileResult');
  try {
    healthy(engine, parseDocument(serializeDocument(addFeature(value, operation)))); expect(solve).toHaveBeenCalledTimes(1);
    expect(solve.mock.results[0].value.status).toBe('underdefined'); expect(solve.mock.results[0].value.degreesOfFreedom).toBe(2);
    expect(Math.abs(solve.mock.results[0].value.drivenValues.measured - 1.5)).toBeLessThan(1e-7);
    metrics(engine, output(), 1008 - 27 * Math.PI / 4, 888 + 9 * Math.PI / 2, [[24, 0, 0], [36, 10, 10]]);
  } finally { solve.mockRestore(); }
}), 60_000);

it('rebuilds a driving-radius edit through saved UntilNext, undo and redo', () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], 'circle'), saved = parseDocument(serializeDocument(addFeature(value, operation))), history = new DocumentHistory(saved);
  healthy(engine, saved); const sketch = saved.features.find(f => f.id === 'next-profile') as SketchFeature;
  history.apply(updateFeature(saved, sketch.id, { ...sketch, profile: entity('circle', 2) }));
  healthy(engine, parseDocument(serializeDocument(history.current)));
  metrics(engine, output(), 1008 - 12 * Math.PI, 888 + 4 * Math.PI, [[24, 0, 0], [36, 10, 10]]);
  probe(engine, output(), [31.75, 5, 1.5], false); probe(engine, output(), [30, 5, 9], true);
  healthy(engine, history.undo()); metrics(engine, output(), 1008 - 27 * Math.PI / 4, 888 + 9 * Math.PI / 2, [[24, 0, 0], [36, 10, 10]]);
  healthy(engine, parseDocument(serializeDocument(history.redo())));
  metrics(engine, output(), 1008 - 12 * Math.PI, 888 + 4 * Math.PI, [[24, 0, 0], [36, 10, 10]]);
}), 60_000);

it('resolves the next wall from the current owner advanced before the pattern', () => usingEngine(engine => {
  const { value, operation } = fixture();
  const advanced = document([...value.features,
    { id: 'raise-floor-profile', name: 'Original cavity floor fill', type: 'sketch', suppressed: false, plane: 'XY', offset: 3,
      profile: { kind: 'rectangle', center: [30, 5], width: 8, height: 6 } },
    { id: 'raise-floor', name: 'Original A current owner advance', type: 'extrude', suppressed: false, sketchId: 'raise-floor-profile',
      depth: 2, symmetric: false, bodyOperation: { mode: 'merge', target: A } }]);
  if (operation.featurePattern?.scope !== 'selected') throw new Error('Original selected pattern missing.');
  operation.baseFeatureId = 'raise-floor'; operation.featurePattern.targets = [{ bodyId: 'A', sourceFeatureId: 'raise-floor' }];
  healthy(engine, parseDocument(serializeDocument(addFeature(advanced, operation))));
  metrics(engine, output(), 1104 - 45 * Math.PI / 4, 832 + 21 * Math.PI / 2, [[24, 0, 0], [36, 10, 10]]);
  probe(engine, output(), [30, 5, 4], false); probe(engine, output(), [30, 5, 9], true);
}), 60_000);

it('uses the exact historical UntilNext seed after another operation advances its source owner', () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], 'circle');
  const after = document([...value.features,
    { id: 'later-profile', name: 'Original independent source edit', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [1, 1], radius: .25 } },
    { id: 'later-S', name: 'Original later source owner state', type: 'cut', suppressed: false, sketchId: 'later-profile',
      depth: 1, symmetric: false, bodyScope: [S] }]);
  operation.baseFeatureId = 'later-S'; healthy(engine, parseDocument(serializeDocument(addFeature(after, operation))));
  metrics(engine, output(), 1008 - 27 * Math.PI / 4, 888 + 9 * Math.PI / 2, [[24, 0, 0], [36, 10, 10]]);
  metrics(engine, { bodyId: 'S', sourceFeatureId: 'later-S' }, 1008 - 109 * Math.PI / 16, 888 + 5 * Math.PI, [[0, 0, 0], [12, 10, 10]]);
  expect(() => catalog(engine).resolve(S)).toThrow();
}), 60_000);

for (const variant of ['primitive', 'circle'] as const) it(`uses an offset negative physical ray once for ${variant}`, () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], variant), sketch = value.features.find(f => f.id === 'next-profile') as SketchFeature,
    seed = value.features.find(f => f.id === 'next-seed');
  sketch.offset = 10; if (seed?.type !== 'cut') throw new Error('Original cut seed missing.'); seed.depth = -1;
  healthy(engine, parseDocument(serializeDocument(addFeature(value, operation))));
  metrics(engine, output(), 1008 - 27 * Math.PI / 4, 888 + 9 * Math.PI / 2, [[24, 0, 0], [36, 10, 10]]);
  probe(engine, output(), [30, 5, 8.5], false); probe(engine, output(), [30, 5, 1.5], true);
}), 60_000);

for (const variant of ['primitive', 'circle'] as const) for (const all of [false, true])
  it(`keeps an earlier UntilNext ${variant} address atomic when the later ${all ? 'ALL' : 'selected'} address misses`, () => usingEngine(engine => {
    const { value, operation } = fixture(rows[0], variant, 'cut', all);
    if (operation.type !== 'linearPattern') throw new Error('Original linear pattern missing.'); operation.first.count = 3;
    const result = engine.build(parseDocument(serializeDocument(addFeature(value, operation))).features);
    expect(result.featureErrors.map(e => e.id)).toEqual(['next-pattern']);
    expect(result.featureErrors[0].message).toContain(all ? 'changes no material' : 'No hay material por delante');
    metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]); expect(() => catalog(engine).resolve(output())).toThrow();
    if (all) metrics(engine, B, 1056, 860, [[24, 0, 0], [36, 10, 10]]);
    expect(() => engine.export('step', addFeature(value, operation).features)).toThrow();
  }), 60_000);

for (const variant of ['primitive', 'circle'] as const) for (const kind of ['miss', 'contact', 'partial'] as const)
  it(`rejects selected ${variant} ${kind} without a phantom tool or target poststate`, () => usingEngine(engine => {
    const { value, operation } = fixture(rows[0], variant), minX = kind === 'miss' ? 60 : kind === 'contact' ? 31.5 : 30;
    const target: BodyReference = { bodyId: 'E', sourceFeatureId: 'create-E' };
    const before = document([...value.features, ...box('create-E', 'E', [minX, 0, 0], [minX + 12, 10, 10])]);
    if (operation.featurePattern?.scope !== 'selected') throw new Error('Original selected declaration missing.');
    operation.baseFeatureId = 'create-E'; operation.featurePattern.targets = [target]; operation.featurePattern.bindings[0].targetBodyIds = ['E'];
    const saved = parseDocument(serializeDocument(addFeature(before, operation))), serialized = serializeDocument(saved), result = engine.build(saved.features);
    expect(result.featureErrors.map(e => e.id)).toEqual(['next-pattern']);
    expect(result.featureErrors[0].message).toContain(kind === 'miss' ? 'No hay material por delante' : kind === 'contact' ? 'toca el cuerpo' : 'intercepta todo el perfil');
    expect(serializeDocument(saved)).toBe(serialized); metrics(engine, target, 1200, 680, [[minX, 0, 0], [minX + 12, 10, 10]]);
    expect(() => catalog(engine).resolve(output('E'))).toThrow();
  }), 60_000);

for (const variant of ['primitive', 'circle'] as const) it(`rejects a later partial ALL owner atomically for ${variant}`, () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], variant, 'cut', true), partial: BodyReference = { bodyId: 'E', sourceFeatureId: 'create-E' };
  const before = document([...value.features, ...box('create-E', 'E', [30, 0, 0], [42, 10, 10])]); operation.baseFeatureId = 'create-E';
  const result = engine.build(addFeature(before, operation).features);
  expect(result.featureErrors.map(e => e.id)).toEqual(['next-pattern']); expect(result.featureErrors[0].message).toContain('intercepta todo el perfil');
  metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]); metrics(engine, B, 1056, 860, [[24, 0, 0], [36, 10, 10]]);
  metrics(engine, partial, 1200, 680, [[30, 0, 0], [42, 10, 10]]); expect(() => catalog(engine).resolve(output())).toThrow();
}), 60_000);

function directEvaluation(engine: CadEngine, value: Document, operation: RepetitionFeature) {
  healthy(engine, value);
  const context: SourceSketchSupportContext = { planeFeatureIds: new Set(), solidFeatureIds: new Set(), unavailableFeatureIds: new Set(), planes: new Map(), historicalFaces: new Map() },
    session = createSourceSketchSolveRegistry(value.features, context);
  value.features.forEach((f, i) => session.observeFeature(f, i));
  const sketch = value.features.find(f => f.id === 'next-profile') as SketchFeature;
  if (sketch.profile.kind === 'entities') session.solveAndStage(sketch, value.features.indexOf(sketch), () => {});
  const all = operation.featurePattern?.scope === 'all', targets = all ? catalog(engine).entries().map(e => ({ ...e.ref })) : [A], source = catalog(engine).resolve(S);
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: operation.id, patternKind: operation.type,
    beforeFeatureIndex: value.features.length, sourceFeatureIds: ['next-seed'], plan: patternPlan(operation),
    scope: all ? { mode: 'all', reevaluateAt: 'patternInput' } : { mode: 'selected', targets: [A] }, targetSnapshot: targets,
    bindings: [{ source: S, targets: all ? 'scope' : ['A'] }], referencePolicies: [], variation: { kind: 'none' } };
  return { session, input: { features: value.features, request, catalog: catalog(engine),
    historicalStates: new Map([[exactStateKey(S), { ref: S, lineage: source.lineage, shape: source.shape }]]), sourceSketchSolves: session.reader } };
}

for (const variant of ['primitive', 'circle'] as const) it(`attests unchanged ALL refs and virtual revisions for ${variant}`, () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], variant, 'cut', true), setup = directEvaluation(engine, value, operation);
  let evaluated: ReturnType<typeof recipes.evaluateFeatureRecipes> | undefined;
  try {
    evaluated = recipes.evaluateFeatureRecipes(setup.input); expect(evaluated.replacements.map(r => r.ref.bodyId)).toEqual(['A', 'B']);
    expect(evaluated.attestation.targets).toHaveLength(5);
    for (const id of ['C', 'D', 'S']) expect(evaluated.attestation.virtualOutputs.find(v => v.targetBodyId === id)).toMatchObject({
      role: 'body', address: '1,0', inputRevision: 0, outputRevision: 0, materialChanged: false });
    for (const id of ['A', 'B']) expect(evaluated.attestation.virtualOutputs.find(v => v.targetBodyId === id)).toMatchObject({ inputRevision: 0, outputRevision: 1, materialChanged: true });
    metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]); metrics(engine, C, 1200, 680, [[60, 0, 0], [72, 10, 10]]);
  } finally { evaluated?.dispose(); setup.session.revoke(); }
}), 60_000);

it('rejects a changed no-op owner identity at ALL staging', () => usingEngine(engine => withNativeOwners(owners => {
  const { value, operation } = fixture(rows[0], 'circle', 'cut', true), setup = directEvaluation(engine, value, operation),
    evaluated = recipes.evaluateFeatureRecipes(setup.input), original = setup.input.catalog.resolve.bind(setup.input.catalog), drift = owners.own(copyBodyShape(original(C).shape));
  const resolve = vi.spyOn(setup.input.catalog, 'resolve').mockImplementation(ref => ref.bodyId === 'C' ? { ...original(ref), shape: drift } : original(ref));
  try {
    expect(() => recipes.stageFeatureRecipeEvaluation(evaluated, setup.input.catalog, { sourceFeatureId: operation.id, lineage: 'original-stale-noop' }, setup.input)).toThrow(/changed/);
  } finally { resolve.mockRestore(); evaluated.dispose(); setup.session.revoke(); }
  metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]); expect(() => catalog(engine).resolve(output())).toThrow();
})), 60_000);

it('rejects an entity source/checkpoint edit after UntilNext evaluation before staging', () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], 'circle', 'cut', true), setup = directEvaluation(engine, value, operation), evaluated = recipes.evaluateFeatureRecipes(setup.input);
  try {
    (value.features.find(f => f.id === 'next-profile') as SketchFeature).profile = entity('circle', 2);
    expect(() => recipes.stageFeatureRecipeEvaluation(evaluated, setup.input.catalog, { sourceFeatureId: operation.id, lineage: 'original-stale-source' }, setup.input)).toThrow(/changed/);
    metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]); expect(() => catalog(engine).resolve(output())).toThrow();
  } finally { evaluated.dispose(); setup.session.revoke(); }
}), 60_000);

function captured(action: () => unknown): unknown { try { action(); } catch (error) { return error; } return undefined; }
function errorTree(error: unknown, seen = new Set<unknown>()): unknown[] {
  if (seen.has(error)) return []; seen.add(error);
  return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(item => errorTree(item, seen)) : []),
    ...(error instanceof Error && error.cause !== undefined ? errorTree(error.cause, seen) : [])];
}

for (const variant of ['primitive', 'circle'] as const) for (const cleanup of [false, true])
  it(`validates the final complete ${variant} tool and preserves its primary${cleanup ? ' plus cleanup' : ''} failure`, () => usingEngine(engine => {
    const { value, operation } = fixture(rows[0], variant), setup = directEvaluation(engine, value, operation),
      closure = requireInitialRecipeDeclaration(extractRecipeClosure(value.features, setup.input.request)),
      target = catalog(engine).resolve(A).shape, primary = new Error('Original final complete-tool validator failure'),
      releaseFailure = new Error('Original final complete-tool release failure'), original = nextResolution.resolveUntilNextCut;
    const checkpoint = variant === 'circle' ? setup.session.reader.checkpoint(value.features, ['next-profile']) : undefined;
    let finalTool: Shape3D | undefined, release: ReturnType<typeof vi.fn> | undefined, checked = 0;
    const resolver = vi.spyOn(nextResolution, 'resolveUntilNextCut').mockImplementation(input => {
      const result = original(input);
      if (result.kind === 'complete') {
        finalTool = result.tool; const handle = result.tool.wrapped, rawDelete = handle.delete.bind(handle);
        release = vi.fn(() => { rawDelete(); if (cleanup) throw releaseFailure; });
        Object.defineProperty(handle, 'delete', { configurable: true, value: release });
      }
      return result;
    });
    try {
      const error = captured(() => withNativeOwners(owners => {
        const result = recipeBridge.buildRecipeInstanceTool({ closure, featureId: 'next-seed', address: '1,0', targetBodyId: 'A', workingTarget: target,
          entitySource: checkpoint ? { registry: setup.session.reader, checkpoint, features: value.features } : undefined,
          assertWorkingCurrent: () => {
            expect(catalog(engine).resolve(A).shape).toBe(target);
            if (checkpoint) setup.session.reader.assertCheckpoint(checkpoint, value.features);
          }, validateTool: tool => {
            validatePositiveClosedTool(tool);
            if (tool === finalTool) { checked++; throw primary; }
          } });
        owners.own(result.tool); // Retire any unexpected successful result too.
      }));
      expect(checked).toBe(1); expect(finalTool).toBeDefined(); expect(release).toHaveBeenCalledTimes(1);
      if (cleanup) {
        expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(primary); expect(errorTree(error)).toContain(releaseFailure);
      } else expect(error).toBe(primary);
      metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]);
    } finally { resolver.mockRestore(); setup.session.revoke(); }
  }), 60_000);

for (const fault of ['release', 'source-after-release'] as const)
  it(`keeps earlier ALL UntilNext changes unpublished after a remote entity probe ${fault}`, () => usingEngine(engine => {
    const { value, operation } = fixture(rows[0], 'circle', 'cut', true), saved = addFeature(value, operation),
      originalResolve = recipeBridge.resolveRecipeInstanceUntilNext, originalProfile = profiles.entityProfileSolid,
      primary = new Error('Original UntilNext remote probe release failure');
    let insideRemote = false, received = 0, released = 0;
    const bridge = vi.spyOn(recipeBridge, 'resolveRecipeInstanceUntilNext').mockImplementation(input => {
      insideRemote = input.targetBodyId === 'C'; try { return originalResolve(input); } finally { insideRemote = false; }
    });
    const native = vi.spyOn(profiles, 'entityProfileSolid').mockImplementation((...args) => {
      const prism = originalProfile(...args);
      if (insideRemote) {
        received++; const handle = prism.wrapped, rawDelete = handle.delete.bind(handle);
        Object.defineProperty(handle, 'delete', { configurable: true, value: () => {
          released++; rawDelete();
          if (fault === 'release') throw primary;
          const sketch = saved.features.find(f => f.id === 'next-profile') as SketchFeature;
          if (sketch.profile.kind !== 'entities') throw new Error('Original entity source missing.');
          const driving = sketch.profile.constraints.find(c => c.id === 'drive-c-circle');
          if (driving?.type !== 'radius') throw new Error('Original driving constraint missing.'); driving.value = 2;
        } });
      }
      return prism;
    });
    try {
      if (fault === 'release') {
        const error = captured(() => engine.build(saved.features)); expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(primary);
      } else {
        const result = engine.build(saved.features); expect(result.featureErrors.map(e => e.id)).toEqual(['next-pattern']);
        expect(result.featureErrors[0].message).toContain('changed');
        metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]); metrics(engine, B, 1056, 860, [[24, 0, 0], [36, 10, 10]]);
        metrics(engine, C, 1200, 680, [[60, 0, 0], [72, 10, 10]]); expect(() => catalog(engine).resolve(output())).toThrow();
      }
      expect(received).toBe(1); expect(released).toBe(1);
    } finally { bridge.mockRestore(); native.mockRestore(); }
  }), 60_000);

it('rechecks the real working-owner revision after a successful UntilNext miss-probe release', () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], 'circle', 'cut', true), setup = directEvaluation(engine, value, operation),
    checkpoint = setup.session.reader.checkpoint(value.features, ['next-profile']), target = catalog(engine).resolve(C).shape,
    closure = requireInitialRecipeDeclaration(extractRecipeClosure(value.features, setup.input.request)), original = profiles.entityProfileSolid,
    current = new Map([['C', target]]), revisions = new Map([['C', 0]]);
  let released = 0;
  const native = vi.spyOn(profiles, 'entityProfileSolid').mockImplementation((...args) => {
    const prism = original(...args), handle = prism.wrapped, rawDelete = handle.delete.bind(handle);
    Object.defineProperty(handle, 'delete', { configurable: true, value: () => { rawDelete(); released++; revisions.set('C', 1); } });
    return prism;
  });
  try {
    expect(() => withNativeOwners(owners => {
      const result = recipeBridge.resolveRecipeInstanceUntilNext({ closure, featureId: 'next-seed', address: '1,0', targetBodyId: 'C', workingTarget: target,
        entitySource: { registry: setup.session.reader, checkpoint, features: value.features }, validateTool: validatePositiveClosedTool,
        assertWorkingCurrent: () => {
          setup.session.reader.assertCheckpoint(checkpoint, value.features);
          if (current.get('C') !== target || revisions.get('C') !== 0) throw new Error('Original working owner/revision changed after probe release.');
        } });
      if (result.kind === 'complete') owners.own(result.tool);
    })).toThrow('working owner/revision changed after probe release');
    expect(released).toBe(1); metrics(engine, C, 1200, 680, [[60, 0, 0], [72, 10, 10]]);
  } finally { native.mockRestore(); setup.session.revoke(); }
}), 60_000);

function openSourceSession() {
  // This component fixture obtains an authentic solve/checkpoint for an open
  // drawing; it does not claim that drawing produced a historical seed solid.
  const { value, operation } = fixture(rows[0], 'circle', 'cut', true), sketch = value.features.find(f => f.id === 'next-profile') as SketchFeature;
  sketch.profile = { kind: 'entities', points: [{ id: 'a', x: 2, y: 2 }, { id: 'b', x: 4, y: 2 }],
    entities: [{ id: 'open', type: 'line', start: 'a', end: 'b', construction: false }],
    constraints: [{ id: 'fix-a', type: 'fix', pointId: 'a', x: 2, y: 2 }, { id: 'fix-b', type: 'fix', pointId: 'b', x: 4, y: 2 }] };
  const session = createSourceSketchSolveRegistry(value.features, { planeFeatureIds: new Set(), solidFeatureIds: new Set(),
    unavailableFeatureIds: new Set(), planes: new Map(), historicalFaces: new Map() });
  value.features.forEach((f, i) => session.observeFeature(f, i)); session.solveAndStage(sketch, value.features.indexOf(sketch), () => {});
  const checkpoint = session.reader.checkpoint(value.features, [sketch.id]);
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: operation.id, patternKind: operation.type,
    beforeFeatureIndex: value.features.length, sourceFeatureIds: ['next-seed'], plan: patternPlan(operation),
    scope: { mode: 'all', reevaluateAt: 'patternInput' }, targetSnapshot: [A, B, C, D, S],
    bindings: [{ source: S, targets: 'scope' }], referencePolicies: [], variation: { kind: 'none' } };
  const placement = intrinsicProfileInstancePlacement(requireInitialRecipeDeclaration(extractRecipeClosure(value.features, request)), 'next-seed', '1,0');
  return { value, session, checkpoint, placement };
}
it('rejects a genuinely solved open profile before it can authorize an ALL UntilNext miss', () => withNativeOwners(owners => {
  const setup = openSourceSession(), target = owners.own(makeBox([60, 0, 0], [72, 10, 10]));
  try {
    expect(() => {
      const result = entityRecipes.resolveEntityRecipeUntilNext({ source: { registry: setup.session.reader, checkpoint: setup.checkpoint, features: setup.value.features },
        placement: setup.placement, termination: { kind: 'untilNext' }, operation: 'subtract', workingTarget: target,
        validateTool: validatePositiveClosedTool, assertWorkingCurrent: () => setup.session.reader.assertCheckpoint(setup.checkpoint, setup.value.features) });
      if (result.kind === 'complete') owners.own(result.tool);
    }).toThrow('El croquis contiene un contorno abierto o una ramificación.');
    validateBodyShape(target); expect(Math.abs(owners.own(measureShapeVolumeProperties(target)).volume - 1200)).toBeLessThan(1e-5);
  } finally { setup.session.revoke(); }
}), 60_000);

function elevatedOriginalVertexTolerance(shape: Shape3D): Shape3D {
  return withNativeOwners(owners => {
    const oc = getOC(), serialized = oc.BRepToolsWrapper.Write(shape.wrapped); expect(serialized).toContain('CASCADE Topology V3');
    const rows = serialized.split('\n'), edited = [...rows], fields = rows.flatMap((row, i) => row === 'Ve' ? [i + 1] : []);
    expect(fields.length).toBeGreaterThan(0);
    for (const index of fields) {
      expect(Number.isFinite(Number(rows[index])) && Number(rows[index]) >= 0 && Number(rows[index]) < .001).toBe(true); edited[index] = '0.001';
    }
    const restored = [...edited]; for (const index of fields) restored[index] = rows[index]; expect(restored.join('\n')).toBe(serialized);
    const raw = owners.own(oc.BRepToolsWrapper.Read(edited.join('\n'))), result = owners.own(cast(raw)).asShape3D();
    expect(Math.abs(oc.BRep_Tool.MaxTolerance(result.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX) - .001)).toBeLessThan(1e-15);
    validatePositiveClosedTool(result); return result;
  }, result => [result], 'Original UntilNext high-tolerance probe construction or release failed.');
}
it('rejects a genuinely elevated probe near an ALL owner without publishing earlier complete cuts', () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], 'circle', 'cut', true), sketch = value.features.find(f => f.id === 'create-C-profile') as SketchFeature;
  sketch.profile = { kind: 'rectangle', center: [37.5002, 5], width: 12, height: 10 };
  const saved = addFeature(value, operation), originalResolve = recipeBridge.resolveRecipeInstanceUntilNext, originalProfile = profiles.entityProfileSolid;
  let insideNear = false, adapted = 0;
  const bridge = vi.spyOn(recipeBridge, 'resolveRecipeInstanceUntilNext').mockImplementation(input => {
    insideNear = input.targetBodyId === 'C'; try { return originalResolve(input); } finally { insideNear = false; }
  });
  const native = vi.spyOn(profiles, 'entityProfileSolid').mockImplementation((...args) => {
    if (!insideNear) return originalProfile(...args);
    return withNativeOwners(owners => {
      const original = owners.own(originalProfile(...args)), elevated = owners.own(elevatedOriginalVertexTolerance(original)); adapted++;
      if (args[3].type !== 'extrude') throw new Error('Original UntilNext prism expected.'); const length = Math.abs(args[3].depth);
      expect(Math.abs(owners.own(measureShapeVolumeProperties(elevated)).volume - 2.25 * Math.PI * length)).toBeLessThan(1e-5);
      expect(Math.abs(owners.own(measureShapeSurfaceProperties(elevated)).area - (4.5 * Math.PI + 3 * Math.PI * length))).toBeLessThan(1e-5);
      return elevated;
    }, result => [result], 'Original UntilNext genuine probe tolerance adaptation or release failed.');
  });
  try {
    const result = engine.build(saved.features); expect(adapted).toBeGreaterThan(0);
    expect(result.featureErrors.map(e => e.id)).toEqual(['next-pattern']); expect(result.featureErrors[0].message).toMatch(/el perfil lo toca o está demasiado cerca|intercepta todo el perfil/);
    metrics(engine, A, 1008, 888, [[24, 0, 0], [36, 10, 10]]); metrics(engine, B, 1056, 860, [[24, 0, 0], [36, 10, 10]]);
    metrics(engine, C, 1200, 680, [[31.5002, 0, 0], [43.5002, 10, 10]]); expect(() => catalog(engine).resolve(output())).toThrow();
  } finally { bridge.mockRestore(); native.mockRestore(); }
}), 60_000);

it('keeps a native UntilNext no-op parent role available to a material-changing same-address child', () => usingEngine(engine => {
  const { value, operation } = fixture(rows[0], 'primitive', 'cut', true), sourceBox = value.features.find(f => f.id === 'create-S-profile') as SketchFeature;
  sourceBox.profile = { kind: 'rectangle', center: [24, 5], width: 48, height: 10 };
  const before = document([...value.features,
    { id: 'child-profile', name: 'Original distinct child circle', type: 'sketch', suppressed: false, plane: 'XY', offset: 0,
      profile: { kind: 'circle', center: [45, 5], radius: 1 } },
    { id: 'child', name: 'Original exact-state child cut', type: 'cut', suppressed: false, sketchId: 'child-profile', depth: 1, symmetric: false, bodyScope: [S] }]);
  const child: BodyReference = { bodyId: 'S', sourceFeatureId: 'child' };
  operation.baseFeatureId = 'child'; operation.source = { mode: 'features', geometryPattern: false, featureIds: ['next-seed', 'child'] };
  if (operation.featurePattern?.scope !== 'all') throw new Error('Original ALL declaration expected.');
  operation.featurePattern.bindings.push({ source: child, targetBodyIds: 'scope' });
  const original = recipes.evaluateFeatureRecipes; let virtual: recipes.RecipeEvaluationAttestation['virtualOutputs'] | undefined;
  const evaluator = vi.spyOn(recipes, 'evaluateFeatureRecipes').mockImplementation(input => {
    const result = original(input); virtual = result.attestation.virtualOutputs; return result;
  });
  try {
    healthy(engine, parseDocument(serializeDocument(addFeature(before, operation))));
    expect(virtual?.find(v => v.targetBodyId === 'C' && v.sourcePoststate.sourceFeatureId === 'next-seed')).toMatchObject({
      role: 'body', address: '1,0', inputRevision: 0, outputRevision: 0, materialChanged: false });
    expect(virtual?.find(v => v.targetBodyId === 'C' && v.sourcePoststate.sourceFeatureId === 'child')).toMatchObject({
      role: 'body', address: '1,0', inputRevision: 0, outputRevision: 1, materialChanged: true });
    metrics(engine, output('C'), 1200 - Math.PI, 680 + 2 * Math.PI, [[60, 0, 0], [72, 10, 10]]); probe(engine, output('C'), [69, 5, .5], false);
    expect(() => catalog(engine).resolve(C)).toThrow();
  } finally { evaluator.mockRestore(); }
}), 60_000);
