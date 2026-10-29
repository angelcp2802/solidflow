import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, setOC } from 'replicad';
import { CadEngine } from './kernel.engine';
import { withNativeOwners } from './kernel.native-ownership';
import { createDocument, parseDocument, serializeDocument, updateFeature } from '../model/document';
import type { BodyReference, CadResult, ExtrudeFeature, Feature, RevolutionFeature, SketchFeature, ThinWallDefinition, Vec3 } from './kernel.types';

const engine = new CadEngine();
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined,
})), 60_000);
afterEach(() => { vi.restoreAllMocks(); engine.dispose(); });

// Original dimensioned fixtures, distinct from the section-builder inventory.
// A directed 12 mm LINE thickens to its right. The enclosure is 20 x 12 x 8.
function line(id = 'profile', offset = 0): SketchFeature {
  return { id, name: id, type: 'sketch', plane: 'XY', offset, suppressed: false,
    profile: { kind: 'entities', points: [{ id: 'a', x: -6, y: 0 }, { id: 'b', x: 6, y: 0 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }], constraints: [] } };
}
const one: ThinWallDefinition = { kind: 'one-side', thickness: 1.5, reversed: false };
function extrusion(patch: Partial<ExtrudeFeature> = {}): ExtrudeFeature {
  return { id: 'operation', name: 'Original thin operation', type: 'extrude', sketchId: 'profile',
    depth: 4, symmetric: false, suppressed: false, thinWall: one, ...patch } as ExtrudeFeature;
}
function rectangle(id: string, width: number, height: number, offset = 0): SketchFeature {
  return { id, name: id, type: 'sketch', plane: 'XY', offset, suppressed: false,
    profile: { kind: 'rectangle', center: [0, 0], width, height } };
}
function box(): Feature[] {
  return [rectangle('box', 20, 12), { id: 'base', name: 'Original enclosure', type: 'extrude',
    sketchId: 'box', depth: 8, symmetric: false, suppressed: false }];
}
function good(features: Feature[]): CadResult {
  const result = engine.build(features);
  expect(result.featureErrors).toEqual([]);
  return result;
}
function close(actual: number, expected: number) { expect(Math.abs(actual - expected)).toBeLessThan(1e-5); }
function vector(actual: readonly number[], expected: Vec3) {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-6));
}
async function verify(features: Feature[], volume: number, area: number, min: Vec3, max: Vec3, solidCount = 1) {
  const source = structuredClone(features), result = good(features);
  close(result.volume, volume); vector(result.bounds.min, min); vector(result.bounds.max, max);
  const shape = (await importSTEP(engine.export('step'))).asShape3D();
  withNativeOwners(owners => {
    owners.own(shape);
    const oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0; while (explorer.More()) { count++; explorer.Next(); }
    expect(count).toBe(solidCount);
    const mass = owners.own(new oc.GProp_GProps()), surface = owners.own(new oc.GProp_GProps()), bounds = owners.own(new oc.Bnd_Box());
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    oc.BRepGProp.SurfaceProperties(shape.wrapped, surface, false, false);
    oc.BRepBndLib.AddOptimal(shape.wrapped, bounds, false, false);
    close(mass.Mass(), volume); close(surface.Mass(), area);
    vector([bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], min);
    vector([bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()], max);
  });
  expect(features).toEqual(source);
  return result;
}

describe('thin-wall material in the complete feature engine', () => {
  it.each([
    { wall: one, volume: 72, area: 144, y: [-1.5, 0] },
    { wall: { ...one, reversed: true }, volume: 72, area: 144, y: [0, 1.5] },
    { wall: { kind: 'mid-plane', thickness: 2 }, volume: 96, area: 160, y: [-1, 1] },
    { wall: { kind: 'two-sides', firstThickness: 2, secondThickness: 1 }, volume: 144, area: 192, y: [-2, 1] },
  ] as { wall: ThinWallDefinition; volume: number; area: number; y: number[] }[])('builds $wall.kind from an open solved LINE', async ({ wall, volume, area, y }) => {
    await verify([line(), extrusion({ thinWall: wall })], volume, area, [-6, y[0], 0], [6, y[1], 4]);
  });

  it('keeps signed depth, axial mid-plane and wall mid-plane independent', async () => {
    await verify([line('profile', 5), extrusion({ depth: -4, symmetric: true, thinWall: { kind: 'mid-plane', thickness: 2 } })],
      96, 160, [-6, -1, 3], [6, 1, 7]);
  });

  it.each([false, true])('builds a closed rectangle wall rather than the filled source, inward=%s', async reversed => {
    await verify([rectangle('profile', 10, 6), extrusion({ thinWall: { kind: 'one-side', thickness: 1, reversed } })],
      reversed ? 112 : 144, reversed ? 280 : 360,
      reversed ? [-5, -3, 0] : [-6, -4, 0], reversed ? [5, 3, 4] : [6, 4, 4]);
  });

  it('derives a circle ring without changing the saved primitive', async () => {
    const sketch: SketchFeature = { ...rectangle('profile', 1, 1), profile: { kind: 'circle', center: [0, 0], radius: 3.5 } };
    await verify([sketch, extrusion({ thinWall: { kind: 'one-side', thickness: .5, reversed: false } })],
      15 * Math.PI, 67.5 * Math.PI, [-4, -4, 0], [4, 4, 4]);
  });

  it('uses solved source coordinates and does not re-solve a derived section', async () => {
    const sketch = line();
    if (sketch.profile.kind !== 'entities') throw new Error('Fixture');
    sketch.profile.points[0].y = 4; sketch.profile.points[1].y = 4;
    sketch.profile.constraints.push({ id: 'fix-a', type: 'fix', pointId: 'a', x: -6, y: 0 },
      { id: 'fix-b', type: 'fix', pointId: 'b', x: 6, y: 0 });
    const result = await verify([sketch, extrusion()], 72, 144, [-6, -1.5, 0], [6, 0, 4]);
    vector(result.sketches!.find(value => value.id === 'profile')!.lineEntities![0].start, [-6, 0, 0]);
  });

  it('preserves an explicit support and translated start for an automatic end plane', async () => {
    const support: Feature = { id: 'support', name: 'Original support', type: 'plane', support: { kind: 'principal', plane: 'XY' },
      offset: 3, reversed: false, suppressed: false };
    const limit: Feature = { ...support, id: 'limit', offset: 9 };
    const sketch: SketchFeature = { ...line(), support: { kind: 'plane', planeId: 'support' } };
    await verify([support, limit, sketch, extrusion({ depth: 1, endCondition: { kind: 'upToSurface', target: { kind: 'plane', planeId: 'limit' } } })],
      108, 198, [-6, -1.5, 3], [6, 0, 9]);
  });

  it('constructs a real bounded thin cut inside the existing body', async () => {
    await verify([...box(), line('profile', 2), extrusion({ type: 'cut' })],
      1848, 1136, [-10, -6, 0], [10, 6, 8]);
  });

  it.each(['throughAll', 'untilNext', 'upToSurface'] as const)('uses the thin section throughout %s cut termination', async kind => {
    const endCondition: ExtrudeFeature['endCondition'] = kind === 'upToSurface'
      ? { kind, target: { kind: 'plane', planeId: 'limit' } }
      : kind === 'throughAll' ? { kind, baseFeatureId: 'base', bothDirections: true } : { kind, baseFeatureId: 'base' };
    const limit: Feature = { id: 'limit', name: 'Original cut limit', type: 'plane', support: { kind: 'principal', plane: 'XY' },
      offset: 2, reversed: false, suppressed: false };
    await verify([...box(), limit, line('profile', kind === 'throughAll' ? 4 : kind === 'untilNext' ? 10 : 8),
      extrusion({ type: 'cut', depth: -1, endCondition })], kind === 'upToSurface' ? 1812 : 1776,
    kind === 'upToSurface' ? 1154 : 1172, [-10, -6, 0], [10, 6, 8]);
  });

  it('resolves a construction-line axis from the original sketch before thickening', async () => {
    const sketch: SketchFeature = { ...line(), profile: { kind: 'entities', constraints: [],
      points: [{ id: 'a', x: 6, y: -2 }, { id: 'b', x: 6, y: 5 }, { id: 'c', x: 1, y: -2 }, { id: 'd', x: 1, y: 5 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false },
        { id: 'axis', type: 'line', start: 'c', end: 'd', construction: true }] } };
    const revolve: RevolutionFeature = { id: 'revolution', name: 'Original wall revolution', type: 'revolve', sketchId: 'profile',
      angle: 360, axis: { kind: 'sketch-line', entityId: 'axis' }, thinWall: one, suppressed: false };
    await verify([sketch, revolve], 120.75 * Math.PI, 195.5 * Math.PI, [-5.5, -2, -6.5], [7.5, 5, 6.5]);
  });

  it('cuts a revolved open profile without filling its enclosed source region', async () => {
    const base: Feature[] = [{ ...rectangle('disk', 1, 1), profile: { kind: 'circle', center: [0, 0], radius: 8 } },
      { id: 'base', name: 'Original cylinder', type: 'extrude', sketchId: 'disk', depth: 10, symmetric: false, suppressed: false }];
    const sketch: SketchFeature = { ...line(), plane: 'XZ', profile: { kind: 'entities', constraints: [],
      points: [{ id: 'a', x: 6, y: 3 }, { id: 'b', x: 6, y: 7 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }] } };
    const cut: RevolutionFeature = { id: 'revolved-cut', name: 'Original annular cavity', type: 'revolvedCut', sketchId: 'profile',
      angle: 360, thinWall: one, suppressed: false };
    // Closed cavity r6..7.5, z3..7: 81pi removed; cavity area = 148.5pi.
    await verify([...base, sketch, cut], 559 * Math.PI, 436.5 * Math.PI, [-8, -8, 0], [8, 8, 10]);
  });

  it.each(['principal-axis', 'external-sketch-line', 'linear-edge'] as const)('combines a thin open profile with an exact %s axis', async kind => {
    const sketch: SketchFeature = { ...line(), profile: { kind: 'entities', constraints: [],
      points: [{ id: 'a', x: 6, y: -2 }, { id: 'b', x: 6, y: 5 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }] } };
    const operation: RevolutionFeature = { id: 'thin-revolution', name: 'Original external-axis thin wall', type: 'revolve',
      sketchId: sketch.id, angle: 360, thinWall: one, suppressed: false };
    if (kind === 'principal-axis') {
      operation.axis = { kind, axis: 'Y' };
      await verify([sketch, operation], 141.75 * Math.PI, 229.5 * Math.PI, [-7.5, -2, -7.5], [7.5, 5, 7.5]);
      return;
    }
    if (kind === 'external-sketch-line') {
      const axisSketch: SketchFeature = { ...line('axis-sketch'), profile: { kind: 'entities', constraints: [],
        points: [{ id: 'c', x: 2, y: -3 }, { id: 'd', x: 2, y: 6 }],
        entities: [{ id: 'axis-line', type: 'line', start: 'c', end: 'd', construction: true }] } };
      operation.axis = { kind, sketchId: axisSketch.id, entityId: 'axis-line' };
      await verify([axisSketch, sketch, operation], 99.75 * Math.PI, 161.5 * Math.PI, [-3.5, -2, -5.5], [7.5, 5, 5.5]);
      return;
    }
    // The original disjoint 1 x 2 x 2 prism supplies x=2,z=0,+Y.
    const axisBody: BodyReference = { bodyId: 'axis-body', sourceFeatureId: 'axis-prism' };
    const prefix: Feature[] = [{ ...rectangle('axis-profile', 1, 2), profile: { kind: 'rectangle', center: [1.5, 11], width: 1, height: 2 } },
      { id: 'axis-prism', name: 'Original axis prism', type: 'extrude', sketchId: 'axis-profile', depth: 2,
        symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: axisBody.bodyId } }];
    const before = good(prefix), edges = before.bodies![0].edges.filter(edge => {
      const support = engine.inspectCurrentEdgeSupport(edge.ref, axisBody);
      return Math.abs(support.point[0] - 2) < 1e-8 && Math.abs(support.point[2]) < 1e-8
        && Math.abs(support.axis[1] - 1) < 1e-8;
    });
    expect(edges).toHaveLength(1);
    operation.axis = { kind, edge: edges[0].ref, body: axisBody };
    operation.bodyOperation = { mode: 'new', bodyId: 'thin-body' };
    const result = await verify([...prefix, sketch, operation], 4 + 99.75 * Math.PI, 16 + 161.5 * Math.PI,
      [-3.5, -2, -5.5], [7.5, 12, 5.5], 2);
    expect(result.bodies![0].ref).toEqual(axisBody);
    expect(result.bodies![0].edges.map(edge => edge.ref)).toEqual(before.bodies![0].edges.map(edge => edge.ref));
    close(result.bodies![0].volume, 4);
  });

  it('keeps angular mid-plane and asymmetric wall thickness independent', async () => {
    const sketch: SketchFeature = { ...line(), profile: { kind: 'entities', constraints: [],
      points: [{ id: 'a', x: 6, y: -2 }, { id: 'b', x: 6, y: 5 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }] } };
    const operation: RevolutionFeature = { id: 'quarter', name: 'Original quarter wall', type: 'revolve', sketchId: sketch.id,
      angle: 90, extent: { kind: 'mid-plane' }, thinWall: { kind: 'two-sides', firstThickness: 1, secondThickness: 2 }, suppressed: false };
    // r4..7, height7, total angle pi/2 centred on the XY sketch.
    await verify([sketch, operation], 57.75 * Math.PI, 55 * Math.PI + 42,
      [4 / Math.sqrt(2), -2, -7 / Math.sqrt(2)], [7, 5, 7 / Math.sqrt(2)]);
  });

  it('updates every selected exact body when a through-all thin cut crosses a gap', async () => {
    const a: BodyReference = { bodyId: 'a', sourceFeatureId: 'base-a' }, b: BodyReference = { bodyId: 'b', sourceFeatureId: 'base-b' };
    const features: Feature[] = [rectangle('sketch-a', 20, 12), { id: 'base-a', name: 'First body', type: 'extrude', sketchId: 'sketch-a',
      depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: a.bodyId } },
    rectangle('sketch-b', 20, 12, 8), { id: 'base-b', name: 'Second body', type: 'extrude', sketchId: 'sketch-b',
      depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: b.bodyId } }, line('profile', 6),
    extrusion({ type: 'cut', bodyScope: [a, b], endCondition: { kind: 'throughAll', baseFeatureId: a.sourceFeatureId, bothDirections: true } })];
    const result = await verify(features, 1776, 1616, [-10, -6, 0], [10, 6, 12], 2);
    expect(result.bodies!.map(value => value.ref)).toEqual([{ bodyId: 'a', sourceFeatureId: 'operation' }, { bodyId: 'b', sourceFeatureId: 'operation' }]);
  });

  it('replays wall edits and clearing through independent saved-document rebuilds', async () => {
    const features: Feature[] = [rectangle('profile', 10, 6), extrusion({ thinWall: { kind: 'one-side', thickness: 1, reversed: false } })];
    const doc = { ...createDocument('Original wall history'), features }, first = good(features);
    const edited = updateFeature(doc, 'operation', { thinWall: { kind: 'mid-plane', thickness: 2 } });
    close(good(parseDocument(serializeDocument(edited)).features).volume, 256);
    const restored = good(parseDocument(serializeDocument(doc)).features);
    close(restored.volume, 144); expect(restored.edges.map(edge => edge.ref)).toEqual(first.edges.map(edge => edge.ref));
    const filled = updateFeature(doc, 'operation', { thinWall: undefined });
    expect(Object.hasOwn(filled.features[1], 'thinWall')).toBe(false);
    close(good(parseDocument(serializeDocument(filled)).features).volume, 240);
    await verify(parseDocument(serializeDocument(doc)).features, 144, 360, [-6, -4, 0], [6, 4, 4]);
  });

  it('rejects a wall that crosses a revolution axis after thickening', () => {
    const sketch: SketchFeature = { ...line(), profile: { kind: 'entities', constraints: [],
      points: [{ id: 'a', x: 1, y: 0 }, { id: 'b', x: 1, y: 5 }],
      entities: [{ id: 'line', type: 'line', start: 'a', end: 'b', construction: false }] } };
    const cut: RevolutionFeature = { id: 'invalid', name: 'Invalid wall', type: 'revolve', sketchId: 'profile', angle: 360,
      thinWall: { kind: 'one-side', thickness: 2, reversed: true }, suppressed: false };
    const result = engine.build([sketch, cut]);
    expect(result.featureErrors).toHaveLength(1); expect(result.featureErrors[0].message).toMatch(/cruza.*eje/);
    expect(() => engine.export('step')).toThrow(/errores/);
  });

  it('rejects malformed raw declarations without reading a thickness getter', () => {
    const getter = vi.fn(() => 1), operation = extrusion();
    Object.defineProperty(operation, 'thinWall', { enumerable: true, get: getter });
    const result = engine.build([line(), operation]);
    expect(result.featureErrors).toHaveLength(1); expect(getter).not.toHaveBeenCalled();
    expect(() => engine.export('step')).toThrow(/errores/);
  });

  it.each([null, undefined])('rejects own %s from a raw worker caller while retaining the preceding body', value => {
    const operation = extrusion({ type: 'cut' });
    Object.defineProperty(operation, 'thinWall', { enumerable: true, value });
    const result = engine.build([...box(), line('profile', 2), operation]);
    expect(result.featureErrors).toHaveLength(1); expect(result.featureErrors[0].id).toBe(operation.id);
    close(result.volume, 1920);
    expect(() => engine.export('step')).toThrow(/errores/);
  });

  it('rejects a nested raw thickness getter before constructing or changing material', () => {
    const getter = vi.fn(() => 1), wall = { kind: 'one-side', reversed: false };
    Object.defineProperty(wall, 'thickness', { enumerable: true, get: getter });
    const operation = extrusion({ type: 'cut' });
    Object.defineProperty(operation, 'thinWall', { enumerable: true, value: wall });
    const result = engine.build([...box(), line('profile', 2), operation]);
    expect(result.featureErrors).toHaveLength(1); expect(getter).not.toHaveBeenCalled(); close(result.volume, 1920);
    expect(() => engine.export('step')).toThrow(/errores/);
  });
});
