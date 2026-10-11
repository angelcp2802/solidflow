import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, makeCompound, measureShapeVolumeProperties, setOC, sketchRectangle } from 'replicad';
import { CadEngine } from './kernel.engine';
import { createEdgeCatalog, resolveEdgeReferences } from './kernel.edges';
import { parseDocument } from '../model/document';
import type { CadResult, EdgeFinishFeature, EdgeReference, ExtrudeFeature, Feature, Plane, SketchFeature } from './kernel.types';

const engine = new CadEngine();
const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasmBinary = await readFile(require.resolve('replicad-opencascadejs/wasm'));
  const oc = await initOpenCascade({ wasmBinary, print: () => undefined });
  setOC(oc);
}, 60_000);

afterEach(() => engine.dispose());

const rectangle = (id = 's1', plane: Plane = 'XY'): SketchFeature => ({
  id, name: 'Croquis', type: 'sketch', plane, offset: 0, suppressed: false,
  profile: { kind: 'rectangle', center: [0, 0], width: 100, height: 70 },
});

const extrusion = (sketchId = 's1', depth = 12): ExtrudeFeature => ({
  id: `e-${sketchId}`, name: 'Extrusión', type: 'extrude', sketchId, depth,
  symmetric: false, suppressed: false,
});

const finish = (type: 'fillet' | 'chamfer' = 'fillet', size = 1): EdgeFinishFeature => ({
  id: 'finish1', name: type === 'fillet' ? 'Redondeo1' : 'Chaflán1', type, size,
  suppressed: false, baseFeatureId: 'e-s1', selection: { mode: 'all' },
});

function topRightVerticalEdge(result: CadResult): EdgeReference {
  const edge = result.edges.find(({ lines }) => lines.length >= 6 && lines.every((coordinate, index) =>
    index % 3 === 0 ? Math.abs(coordinate - 50) < 1e-5 : index % 3 === 1 ? Math.abs(coordinate - 35) < 1e-5 : true));
  expect(edge, 'B-rep edge at X=50, Y=35').toBeDefined();
  return edge!.ref;
}

describe('OpenCascade B-rep engine', () => {
  it.each([
    ['Bloque redondeado R5.solidflow', 79731.74770424682],
    ['Bloque R5 y chaflan D3.solidflow', 79506.74770424682],
  ] as const)('reopens the UI-saved example %s with its original serialized edge references', async (filename, expectedVolume) => {
    const document = parseDocument(await readFile(new URL(`../../examples/${filename}`, import.meta.url), 'utf8'));
    // Exercise the real engine behind buildModel, without regenerating any saved reference.
    const result = engine.build(document.features);
    expect(result.featureErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(Math.abs(result.volume - expectedVolume)).toBeLessThan(1e-6);
    expect(result.edges.every((edge) => edge.ref.sourceFeatureId === document.features.at(-1)!.id)).toBe(true);
    expect(result.vertices.length).toBeGreaterThan(0);
  });

  it('builds an exact box and exports a complete render mesh', () => {
    const result = engine.build([rectangle(), extrusion()]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(84_000, 6);
    expect(result.bounds.min[0]).toBeCloseTo(-50, 5);
    expect(result.bounds.max[2]).toBeCloseTo(12, 5);
    expect(result.vertices.length).toBeGreaterThan(0);
    expect(result.normals).toHaveLength(result.vertices.length);
    expect(result.triangles).toHaveLength(36);
    expect(result.edgeLines.length).toBeGreaterThan(0);
    expect(result.edgeLines.length % 6).toBe(0);
    expect(result.triangles.every((i) => i >= 0 && i < result.vertices.length / 3)).toBe(true);
    expect(result.edges).toHaveLength(12);
    expect(new Set(result.edges.map((edge) => edge.ref.key)).size).toBe(12);
    expect(result.edges.every((edge) => edge.ref.sourceFeatureId === 'e-s1' && edge.lines.length % 6 === 0)).toBe(true);
  });

  it('cuts four through holes with analytic cylindrical volume', () => {
    const features: Feature[] = [rectangle(), extrusion()];
    for (const [i, center] of [[-35, -20], [-35, 20], [35, -20], [35, 20]].entries()) {
      features.push({
        id: `hole-${i}`, name: 'Taladro', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'circle', center: center as [number, number], radius: 5 },
      });
      features.push({ ...extrusion(`hole-${i}`), type: 'cut' });
    }
    const result = engine.build(features);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(84_000 - 4 * Math.PI * 25 * 12, 5);
    expect(result.triangles.length).toBeGreaterThan(36);
  });

  it('fuses overlapping volumes instead of stacking triangle meshes', () => {
    const second = rectangle('s2');
    second.profile = { kind: 'rectangle', center: [50, 0], width: 100, height: 70 };
    const result = engine.build([rectangle(), extrusion(), second, extrusion('s2')]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(126_000, 5);
    expect(result.warnings).toEqual([]);
  });

  it.each<Plane>(['XY', 'XZ', 'YZ'])('places symmetric extrusions in the %s plane', (plane) => {
    const sketch = rectangle('s1', plane);
    sketch.offset = 20;
    const result = engine.build([sketch, { ...extrusion(), type: 'extrude', symmetric: true }]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(84_000, 6);
    const normalAxis = plane === 'XY' ? 2 : plane === 'XZ' ? 1 : 0;
    expect(result.bounds.min[normalAxis]).toBeCloseTo(plane === 'XZ' ? -26 : 14, 5);
    expect(result.bounds.max[normalAxis]).toBeCloseTo(plane === 'XZ' ? -14 : 26, 5);
  });

  it('rebuilds edits and suppression without retaining the previous solid', () => {
    engine.build([rectangle(), extrusion()]);
    const edited = engine.build([rectangle(), extrusion('s1', -20)]);
    expect(edited.volume).toBeCloseTo(140_000, 5);
    expect(edited.bounds.min[2]).toBeCloseTo(-20, 5);
    const suppressed = engine.build([rectangle(), { ...extrusion(), suppressed: true }]);
    expect(suppressed.vertices).toEqual([]);
    expect(suppressed.volume).toBe(0);
    expect(() => engine.export('step')).toThrow('No hay ningún sólido');
  });

  it('revolves a rectangle touching the local Y axis into an exact cylinder', () => {
    const sketch = rectangle();
    sketch.profile = { kind: 'rectangle', center: [5, 0], width: 10, height: 30 };
    const result = engine.build([
      sketch,
      { id: 'r1', name: 'Revolución', type: 'revolve', sketchId: 's1', angle: 360, suppressed: false },
    ]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(Math.PI * 100 * 30, 5);
    expect(result.bounds.min[1]).toBeCloseTo(-15, 5);
    expect(result.bounds.max[1]).toBeCloseTo(15, 5);
  });

  it('reports failed operations and refuses to export a partial rebuild', () => {
    const outside = rectangle('s2');
    outside.profile = { kind: 'rectangle', center: [1000, 0], width: 100, height: 70 };
    const result = engine.build([rectangle(), extrusion(), outside, { ...extrusion('s2'), type: 'cut' }]);
    expect(result.featureErrors[0].id).toBe('e-s2');
    expect(result.featureErrors[0].message).toContain('no intersecta');
    expect(result.volume).toBeCloseTo(84_000, 6);
    expect(() => engine.export('step')).toThrow('Corrige las operaciones');
  });

  it('round-trips STEP as a solid with preserved volume and exports binary STL', async () => {
    engine.build([rectangle(), extrusion()]);
    const step = engine.export('step');
    expect(await step.text()).toContain('ISO-10303-21;');
    const restored = (await importSTEP(step)).asShape3D();
    const properties = measureShapeVolumeProperties(restored);
    expect(properties.volume).toBeCloseTo(84_000, 5);
    properties.delete();
    restored.delete();
    const stl = await engine.export('stl').arrayBuffer();
    const triangles = new DataView(stl).getUint32(80, true);
    expect(triangles).toBe(12);
    expect(stl.byteLength).toBe(84 + triangles * 50);
  });

  it('exports the committed snapshot even if a newer preview has not been accepted', async () => {
    const committed = [rectangle(), extrusion()];
    engine.build(committed);
    engine.build([rectangle(), extrusion('s1', 20)]);
    const volumeOf = async (blob: Blob) => {
      const solid = (await importSTEP(blob)).asShape3D();
      const properties = measureShapeVolumeProperties(solid);
      try { return properties.volume; } finally { properties.delete(); solid.delete(); }
    };
    // Equivalent to cancelling a preview and exporting before its debounced rebuild runs.
    expect(await volumeOf(engine.export('step', committed))).toBeCloseTo(84_000, 5);
    // The snapshot export must not change the independently displayed preview.
    expect(await volumeOf(engine.export('step'))).toBeCloseTo(140_000, 5);
  });

  it('fillets all prism edges with the exact rounded-box volume', () => {
    const result = engine.build([rectangle(), extrusion(), finish()]);
    const a = 98, b = 68, c = 10, radius = 1;
    const expected = a * b * c + 2 * radius * (a * b + a * c + b * c)
      + Math.PI * radius ** 2 * (a + b + c) + 4 * Math.PI * radius ** 3 / 3;
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(expected, 5);
    expect(result.edges.every((edge) => edge.ref.sourceFeatureId === 'finish1' && edge.ref.key.length <= 4096)).toBe(true);
  });

  it.each(['fillet', 'chamfer'] as const)('applies a %s only to the selected B-rep edge', (type) => {
    const base = [rectangle(), extrusion()];
    const reference = topRightVerticalEdge(engine.build(base));
    const operation: EdgeFinishFeature = { ...finish(type, 2), selection: { mode: 'selected', edges: [reference] } };
    const selected = engine.build([...base, operation]);
    const removed = type === 'fillet' ? (4 - Math.PI) * 12 : 2 * 12;
    expect(selected.featureErrors).toEqual([]);
    expect(selected.volume).toBeCloseTo(84_000 - removed, 5);
    const all = engine.build([...base, { ...operation, selection: { mode: 'all' } }]);
    expect(all.featureErrors).toEqual([]);
    expect(all.volume).toBeLessThan(selected.volume);
  });

  it.each(['fillet', 'chamfer'] as const)('retains a selected %s edge after width 100→120 and depth 12→20', (type) => {
    const reference = topRightVerticalEdge(engine.build([rectangle(), extrusion()]));
    const wider = rectangle();
    wider.profile = { kind: 'rectangle', center: [0, 0], width: 120, height: 70 };
    const resizedBase = [wider, extrusion('s1', 20)];
    const resized = engine.build(resizedBase);
    expect(resized.edges.filter((edge) => edge.ref.key === reference.key)).toHaveLength(1);
    const result = engine.build([...resizedBase, { ...finish(type, 2), selection: { mode: 'selected', edges: [reference] } }]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(120 * 70 * 20 - (type === 'fillet' ? (4 - Math.PI) * 20 : 2 * 20), 5);
  });

  it.each([0, -1, Number.NaN, 1000])('rejects an invalid fillet radius %s and keeps the previous solid', (size) => {
    const result = engine.build([rectangle(), extrusion(), finish('fillet', size)]);
    expect(result.featureErrors[0]?.id).toBe('finish1');
    expect(result.volume).toBeCloseTo(84_000, 5);
    expect(() => engine.export('step')).toThrow('Corrige las operaciones');
  });

  it('rejects empty, duplicated and missing individual edge references', () => {
    const base = [rectangle(), extrusion()];
    const reference = topRightVerticalEdge(engine.build(base));
    for (const references of [[], [reference, reference], [{ ...reference, key: reference.key + ':missing' }]]) {
      const result = engine.build([...base, { ...finish(), selection: { mode: 'selected', edges: references } }]);
      expect(result.featureErrors[0]?.id).toBe('finish1');
      expect(result.volume).toBeCloseTo(84_000, 5);
    }
  });

  it('does not rebind an edge to a different source or changed topology', () => {
    const reference = topRightVerticalEdge(engine.build([rectangle(), extrusion()]));
    const wrongSource = engine.build([rectangle(), extrusion(), {
      ...finish(), selection: { mode: 'selected', edges: [{ ...reference, sourceFeatureId: 'another-feature' }] },
    }]);
    expect(wrongSource.featureErrors[0]?.message).toContain('otro sólido');
    const cylinder = rectangle();
    cylinder.profile = { kind: 'circle', center: [0, 0], radius: 10 };
    const wrongTopology = engine.build([cylinder, extrusion(), {
      ...finish(), selection: { mode: 'selected', edges: [reference] },
    }]);
    expect(wrongTopology.featureErrors[0]?.message).toContain('topología');
    expect(wrongTopology.volume).toBeCloseTo(Math.PI * 100 * 12, 5);
  });

  it('requires reselection after changing the generating plane of a symmetric cube', () => {
    const cube = rectangle();
    cube.profile = { kind: 'rectangle', center: [0, 0], width: 10, height: 10 };
    const symmetric: ExtrudeFeature = { ...extrusion('s1', 10), symmetric: true };
    const reference = engine.build([cube, symmetric]).edges[0].ref;
    const changedPlane = engine.build([{ ...cube, plane: 'YZ' }, symmetric, {
      ...finish(), selection: { mode: 'selected', edges: [reference] },
    }]);
    expect(changedPlane.featureErrors[0]?.message).toContain('Recupera la selección');
    expect(changedPlane.volume).toBeCloseTo(1000, 6);
  });

  it('rejects ambiguous coincident edges rather than choosing one by enumeration', () => {
    const first = sketchRectangle(100, 70).extrude(12);
    const second = sketchRectangle(100, 70).extrude(12);
    const compound = makeCompound([first, second]).asShape3D();
    const catalog = createEdgeCatalog(compound, 'base');
    try {
      const reference = catalog.entries[0].ref;
      expect(catalog.entries.filter((entry) => entry.ref.key === reference.key)).toHaveLength(2);
      expect(() => resolveEdgeReferences(catalog, [reference], 'base')).toThrow('ambigua');
    } finally {
      catalog.dispose(); compound.delete(); first.delete(); second.delete();
    }
  });

  it('rejects a finish whose saved base is not the preceding active solid', () => {
    const result = engine.build([rectangle(), extrusion(), rectangle('s2'), extrusion('s2'), finish()]);
    expect(result.featureErrors[0]?.message).toContain('sólido anterior');
    expect(result.edges.every((edge) => edge.ref.sourceFeatureId === 'e-s2')).toBe(true);
  });

  it('restores the original body when suppressing a fillet and skips its dependent finish', () => {
    engine.build([rectangle(), extrusion(), finish()]);
    const result = engine.build([
      rectangle(), extrusion(), { ...finish(), suppressed: true },
      { ...finish('chamfer'), id: 'finish2', baseFeatureId: 'finish1' },
    ]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(84_000, 5);
    expect(result.warnings.some((warning) => warning.includes('omitida'))).toBe(true);
    expect(result.edges.every((edge) => edge.ref.sourceFeatureId === 'e-s1')).toBe(true);
  });

  it('cascades suppression from a sketch through extrusion and finishing', () => {
    const result = engine.build([{ ...rectangle(), suppressed: true }, extrusion(), finish()]);
    expect(result.featureErrors).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.volume).toBe(0);
    expect(result.warnings).toHaveLength(2);
  });

  it('round-trips selected-edge chamfer STEP and checks its native validity', async () => {
    const base = [rectangle(), extrusion()];
    const reference = topRightVerticalEdge(engine.build(base));
    const result = engine.build([...base, {
      ...finish('chamfer', 2), selection: { mode: 'selected', edges: [reference] },
    }]);
    expect(result.featureErrors).toEqual([]);
    const restored = (await importSTEP(engine.export('step'))).asShape3D();
    const properties = measureShapeVolumeProperties(restored);
    const analyzer = new (getOC().BRepCheck_Analyzer)(restored.wrapped, true, false, false);
    try {
      expect(analyzer.IsValid()).toBe(true);
      expect(properties.volume).toBeCloseTo(result.volume, 5);
    } finally {
      analyzer.delete(); properties.delete(); restored.delete();
    }
  });


});
