import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, importSTEP, makeCompound, measureShapeVolumeProperties, setOC, sketchRectangle } from 'replicad';
import { CadEngine } from './kernel.engine';
import { createFaceCatalog, resolveFaceReference } from './kernel.faces';
import { frameDot, framePoint, frameYDirection } from './kernel.frames';
import type { CadResult, FaceReference, Feature, PlaneFrame, ReferencePlaneFeature, SketchFeature, Vec3 } from './kernel.types';
import type { EntityProfile } from '../sketch/types';
import { parseDocument, serializeDocument } from '../model/document';

const engine = new CadEngine();
beforeAll(async () => {
  const wasmBinary = await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm'));
  setOC(await initOpenCascade({ wasmBinary, print: () => undefined }));
}, 60_000);
afterEach(() => engine.dispose());

function base(depth = 12): Feature[] {
  return [{ id: 'base-sketch', name: 'Base', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'rectangle', center: [0, 0], width: 100, height: 70 } },
  { id: 'base-extrude', name: 'Saliente base', type: 'extrude', sketchId: 'base-sketch', depth, symmetric: false, suppressed: false }];
}
function planarFace(result: CadResult, normal: Vec3) {
  const found = result.faces?.find((face) => face.frame && frameDot(face.frame.normal, normal) > 1 - 1e-7);
  expect(found, `Face with normal ${normal.join(',')}`).toBeDefined();
  return found!;
}
function supportedSketch(face: FaceReference): SketchFeature {
  return { id: 'attached', name: 'Croquis sobre cara', type: 'sketch', plane: 'XY', support: { kind: 'face', face },
    offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } };
}
const extrusion = (depth = 5): Feature => ({ id: 'attached-extrude', name: 'Saliente sobre cara', type: 'extrude',
  sketchId: 'attached', depth, symmetric: false, suppressed: false });
const referencePlane = (id = 'plane1'): ReferencePlaneFeature => ({ id, name: id, type: 'plane',
  support: { kind: 'principal', plane: 'XY' }, offset: 10, reversed: false, suppressed: false });
function expectVector(actual: Vec3, expected: Vec3) {
  actual.forEach((value, axis) => expect(value).toBeCloseTo(expected[axis], 6));
}

describe('associative planar face and reference plane supports', () => {
  it.each([8, 12])('reopens the UI-saved face-supported boss with base depth %s and roundtrips STEP', async (depth) => {
    const source = await readFile(new URL('../../examples/Placa con saliente en cara.solidflow', import.meta.url), 'utf8');
    const document = parseDocument(source);
    const baseExtrusion = document.features.find((feature) => feature.type === 'extrude');
    if (!baseExtrusion || baseExtrusion.type !== 'extrude') throw new Error('Expected base extrusion');
    expect(baseExtrusion.depth).toBe(8);
    const attached = document.features.find((feature) => feature.type === 'sketch' && feature.support?.kind === 'face');
    if (!attached || attached.type !== 'sketch' || attached.support?.kind !== 'face') throw new Error('Expected face-supported sketch');
    const savedReference = structuredClone(attached.support.face);
    baseExtrusion.depth = depth;
    const reopened = parseDocument(serializeDocument(document));
    const restoredSketch = reopened.features.find((feature) => feature.id === attached.id) as SketchFeature;
    expect(restoredSketch.support).toEqual({ kind: 'face', face: savedReference });
    const before = JSON.stringify(reopened.features);
    const result = engine.build(reopened.features);
    expect(result.featureErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    const expectedVolume = (100 * 70 - 4 * Math.PI * 25) * depth + Math.PI * 100 * 20;
    // The saved solved radius differs from R10 by 1.93e-8 mm, within solver tolerance.
    expect(Math.abs(result.volume - expectedVolume)).toBeLessThan(2e-4);
    expect(result.bounds.max[2]).toBeCloseTo(depth + 20, 6);
    expectVector(result.sketches!.find((sketch) => sketch.id === attached.id)!.frame!.origin, [0, 0, depth]);
    expect(JSON.stringify(reopened.features)).toBe(before);
    const imported = (await importSTEP(engine.export('step'))).asShape3D();
    const volume = measureShapeVolumeProperties(imported);
    const analyzer = new (getOC().BRepCheck_Analyzer)(imported.wrapped, true, false, false);
    try {
      expect(analyzer.IsValid()).toBe(true);
      expect(volume.volume).toBeCloseTo(result.volume, 5);
      if (process.env.SOLIDFLOW_CAD_REPORT === '1') console.info(JSON.stringify({ fixture: 'Placa con saliente en cara', depth, volume: result.volume, stepVolume: volume.volume, zMax: result.bounds.max[2] }));
    } finally { analyzer.delete(); volume.delete(); imported.delete(); }
  });

  it('reopens the UI-saved inverted face plane, fuses its inward extrusion and roundtrips STEP', async () => {
    const source = await readFile(new URL('../../examples/Placa con plano invertido.solidflow', import.meta.url), 'utf8');
    const document = parseDocument(source);
    const plane = document.features.find((feature) => feature.type === 'plane');
    if (!plane || plane.type !== 'plane' || plane.support.kind !== 'face') throw new Error('Expected face-supported reference plane');
    expect(plane.offset).toBe(10);
    expect(plane.reversed).toBe(true);
    const attached = document.features.find((feature) => feature.type === 'sketch' && feature.support?.kind === 'plane');
    if (!attached || attached.type !== 'sketch') throw new Error('Expected plane-supported sketch');
    expect(attached.support).toEqual({ kind: 'plane', planeId: plane.id });
    const reopened = parseDocument(serializeDocument(document));
    expect(reopened.features).toEqual(document.features);
    const before = JSON.stringify(reopened.features);
    const result = engine.build(reopened.features);
    expect(result.featureErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    const planeFrame = result.planes!.find((visual) => visual.id === plane.id)!.frame;
    const sketchFrame = result.sketches!.find((visual) => visual.id === attached.id)!.frame!;
    expectVector(planeFrame.origin, [0, 0, 38]);
    expectVector(planeFrame.normal, [0, 0, -1]);
    expect(sketchFrame).toEqual(planeFrame);
    expectVector(result.bounds.min, [-50, -35, 0]);
    expectVector(result.bounds.max, [50, 35, 38]);
    // Only the upper 10 mm of the R5 extrusion adds volume; the other half fuses into the R10 boss.
    // The UI saved both solved radii within 2.3e-8 mm of their nominal constraints.
    const expectedVolume = (100 * 70 - 4 * Math.PI * 25) * 8 + Math.PI * 100 * 20 + Math.PI * 25 * 10;
    expect(Math.abs(result.volume - expectedVolume)).toBeLessThan(2e-4);
    expect(JSON.stringify(reopened.features)).toBe(before);
    const imported = (await importSTEP(engine.export('step'))).asShape3D();
    const volume = measureShapeVolumeProperties(imported);
    const analyzer = new (getOC().BRepCheck_Analyzer)(imported.wrapped, true, false, false);
    try {
      expect(analyzer.IsValid()).toBe(true);
      expect(volume.volume).toBeCloseTo(result.volume, 5);
      if (process.env.SOLIDFLOW_CAD_REPORT === '1') console.info(JSON.stringify({ fixture: 'Placa con plano invertido', volume: result.volume, stepVolume: volume.volume, zMax: result.bounds.max[2] }));
    } finally { analyzer.delete(); volume.delete(); imported.delete(); }
  });

  it('returns six unique box faces with outward normals, projected origins and independent triangle meshes', () => {
    const result = engine.build(base());
    expect(result.featureErrors).toEqual([]);
    expect(result.faces).toHaveLength(6);
    expect(new Set(result.faces!.map((face) => face.ref.key)).size).toBe(6);
    for (const face of result.faces!) {
      expect(face.ref.sourceFeatureId).toBe('base-extrude');
      expect(face.ref.key).toMatch(/^face-v1\|[0-9a-f]{64}$/);
      expect(face.frame).not.toBeNull();
      const frame = face.frame!;
      expect(Math.hypot(...frame.normal)).toBeCloseTo(1, 10);
      expect(Math.hypot(...frame.xDirection)).toBeCloseTo(1, 10);
      expect(frameDot(frame.normal, frame.xDirection)).toBeCloseTo(0, 10);
      expect(frameDot(frame.normal, [frame.origin[0], frame.origin[1], frame.origin[2] - 6])).toBeGreaterThan(0);
      expect(face.triangles).toHaveLength(6);
      expect(face.vertices.length).toBeGreaterThan(0);
      expect(face.triangles.every((index) => index >= 0 && index < face.vertices.length / 3)).toBe(true);
    }
    expectVector(planarFace(result, [0, 0, 1]).frame!.origin, [0, 0, 12]);
    expectVector(planarFace(result, [1, 0, 0]).frame!.xDirection, [0, 1, 0]);
  });

  it('extrudes outward from a selected planar face and cuts inward with signed depth', () => {
    const top = planarFace(engine.build(base()), [0, 0, 1]).ref;
    const attached = supportedSketch(top);
    const raised = engine.build([...base(), attached, extrusion(5)]);
    expect(raised.featureErrors).toEqual([]);
    expect(raised.volume).toBeCloseTo(84000 + Math.PI * 4 * 5, 5);
    expect(raised.bounds.max[2]).toBeCloseTo(17, 6);
    expectVector(raised.sketches!.find((sketch) => sketch.id === 'attached')!.frame!.origin, [0, 0, 12]);
    const cut = engine.build([...base(), attached, { ...extrusion(-12), type: 'cut' } as Feature]);
    expect(cut.featureErrors).toEqual([]);
    expect(cut.volume).toBeCloseTo(84000 - Math.PI * 4 * 12, 5);
  });

  it('moves the support with edited source depth while retaining the face reference', () => {
    const top = planarFace(engine.build(base()), [0, 0, 1]).ref;
    const result = engine.build([...base(20), supportedSketch(top), extrusion(5)]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(140000 + Math.PI * 4 * 5, 5);
    expect(result.bounds.max[2]).toBeCloseTo(25, 6);
    expectVector(result.sketches!.find((sketch) => sketch.id === 'attached')!.frame!.origin, [0, 0, 20]);
  });

  it('resolves a historical source face before later operations change its topology', () => {
    const top = planarFace(engine.build(base()), [0, 0, 1]).ref;
    const hole: SketchFeature = { id: 'hole', name: 'Taladro', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [0, 0], radius: 5 } };
    const attached = supportedSketch(top);
    attached.profile = { kind: 'circle', center: [20, 0], radius: 2 };
    const result = engine.build([...base(), hole, { id: 'hole-cut', name: 'Corte', type: 'cut', sketchId: 'hole', depth: 12, symmetric: false, suppressed: false },
      attached, extrusion(5)]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(84000 - Math.PI * 25 * 12 + Math.PI * 4 * 5, 5);
    expect(result.faces!.every((face) => face.ref.sourceFeatureId === 'attached-extrude')).toBe(true);
  });

  it('rejects curved faces, stale references and changed topology and blocks partial exports', () => {
    const cylinder = base();
    (cylinder[0] as SketchFeature).profile = { kind: 'circle', center: [0, 0], radius: 10 };
    const curved = engine.build(cylinder).faces!.find((face) => face.frame === null)!;
    expect(curved).toBeDefined();
    expect(engine.build([...cylinder, supportedSketch(curved.ref)]).featureErrors[0]?.message).toContain('curva');
    expect(() => engine.export('step')).toThrow('Corrige las operaciones');
    const top = planarFace(engine.build(base()), [0, 0, 1]).ref;
    expect(engine.build([...base(), supportedSketch({ ...top, key: top.key + 'stale' })]).featureErrors[0]?.message).toContain('Recupera');
    expect(engine.build([...cylinder, supportedSketch(top)]).featureErrors[0]?.message).toContain('topología');
  });

  it('rejects ambiguous coincident native faces rather than selecting an enumeration index', () => {
    const first = sketchRectangle(100, 70).extrude(12), second = sketchRectangle(100, 70).extrude(12);
    const compound = makeCompound([first, second]).asShape3D();
    const catalog = createFaceCatalog(compound, 'source');
    try {
      const ref = catalog.entries[0].ref;
      expect(catalog.entries.filter((entry) => entry.ref.key === ref.key)).toHaveLength(2);
      expect(() => resolveFaceReference(catalog, ref, 'source')).toThrow('ambigua');
      expect(() => resolveFaceReference(catalog, { ...ref, sourceFeatureId: 'other' }, 'source')).toThrow('otro sólido');
    } finally { catalog.dispose(); compound.delete(); first.delete(); second.delete(); }
  });

  it('requires a new face reference if a near-axis normal changes the deterministic sketch basis', () => {
    const first = sketchRectangle(10, 10).extrude(10).rotate(Math.asin(.999e-6) * 180 / Math.PI, [0, 0, 0], [0, 0, 1]);
    const second = sketchRectangle(10, 10).extrude(10).rotate(Math.asin(1.001e-6) * 180 / Math.PI, [0, 0, 0], [0, 0, 1]);
    const a = createFaceCatalog(first, 'source'), b = createFaceCatalog(second, 'source');
    try {
      const before = a.entries.find((entry) => entry.frame && entry.frame.normal[0] > .99)!;
      const after = b.entries.find((entry) => entry.frame && entry.frame.normal[0] > .99)!;
      expect(frameDot(before.frame!.xDirection, after.frame!.xDirection)).toBeLessThan(-.99);
      expect(before.ref.key).not.toBe(after.ref.key);
    } finally { a.dispose(); b.dispose(); first.delete(); second.delete(); }
  });

  it('offsets a chain along each current normal and reverses only after applying its own offset', () => {
    const first = { ...referencePlane(), reversed: true };
    const second: ReferencePlaneFeature = { ...referencePlane('plane2'), support: { kind: 'plane', planeId: first.id }, offset: 3 };
    const attached: SketchFeature = { ...supportedSketch({ sourceFeatureId: '', key: '' }), support: { kind: 'plane', planeId: second.id }, offset: 2,
      profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 } };
    const result = engine.build([first, second, attached, extrusion(4)]);
    expect(result.featureErrors).toEqual([]);
    expect(result.planes).toHaveLength(2);
    expectVector(result.planes![0].frame.origin, [0, 0, 10]);
    expectVector(result.planes![0].frame.normal, [0, 0, -1]);
    expectVector(result.planes![1].frame.origin, [0, 0, 7]);
    expectVector(result.sketches![0].frame!.origin, [0, 0, 5]);
    expectVector(frameYDirection(result.sketches![0].frame!), [0, -1, 0]);
    expect(result.volume).toBeCloseTo(400, 6);
    expect(result.bounds.min[2]).toBeCloseTo(1, 6);
    expect(result.bounds.max[2]).toBeCloseTo(5, 6);
  });

  it('places an entity sketch on an offset reversed face plane', () => {
    const top = planarFace(engine.build(base()), [0, 0, 1]).ref;
    const plane: ReferencePlaneFeature = { ...referencePlane(), support: { kind: 'face', face: top }, offset: 3, reversed: true };
    const profile: EntityProfile = { kind: 'entities', points: [{ id: 'c', x: 0, y: 0 }], constraints: [],
      entities: [{ id: 'circle', type: 'circle', center: 'c', radius: 2, construction: false }] };
    const attached: SketchFeature = { ...supportedSketch(top), support: { kind: 'plane', planeId: plane.id }, profile };
    const result = engine.build([...base(), plane, attached, extrusion(5)]);
    expect(result.featureErrors).toEqual([]);
    expectVector(result.planes![0].frame.origin, [0, 0, 15]);
    expectVector(result.planes![0].frame.normal, [0, 0, -1]);
    expect(result.volume).toBeCloseTo(84000 + Math.PI * 4 * 3, 5);
    expect(result.bounds.max[2]).toBeCloseTo(15, 6);
  });

  it('propagates suppressed supports through plane chains, sketches and solids without rewriting feature flags', () => {
    const top = planarFace(engine.build(base()), [0, 0, 1]).ref;
    const first: ReferencePlaneFeature = { ...referencePlane(), support: { kind: 'face', face: top } };
    const second: ReferencePlaneFeature = { ...referencePlane('plane2'), support: { kind: 'plane', planeId: first.id } };
    const attached: SketchFeature = { ...supportedSketch(top), support: { kind: 'plane', planeId: second.id } };
    const features = base();
    features[1].suppressed = true;
    features.push(first, second, attached, extrusion());
    const before = JSON.stringify(features);
    const result = engine.build(features);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBe(0);
    expect(result.planes).toEqual([]);
    expect(result.warnings).toHaveLength(4);
    expect(JSON.stringify(features)).toBe(before);
  });

  it('rejects missing, forward and incorrectly typed support dependencies', () => {
    const plane: ReferencePlaneFeature = { ...referencePlane(), support: { kind: 'plane', planeId: 'missing' } };
    expect(engine.build([plane]).featureErrors[0]?.id).toBe(plane.id);
    const attached: SketchFeature = { ...supportedSketch({ sourceFeatureId: '', key: '' }), support: { kind: 'plane', planeId: plane.id } };
    expect(engine.build([attached, referencePlane()]).featureErrors[0]?.id).toBe(attached.id);
    expect(engine.build([...base(), { ...attached, support: { kind: 'plane', planeId: 'base-extrude' } }]).featureErrors[0]?.id).toBe(attached.id);
  });

  it.each(['legacy', 'entities'] as const)('places a %s profile on an arbitrary inclined face', (kind) => {
    const wedge: EntityProfile = { kind: 'entities', points: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 20, y: 0 }, { id: 'c', x: 0, y: 20 }], constraints: [],
      entities: [{ id: 'ab', type: 'line', start: 'a', end: 'b', construction: false }, { id: 'bc', type: 'line', start: 'b', end: 'c', construction: false },
        { id: 'ca', type: 'line', start: 'c', end: 'a', construction: false }] };
    const features = base(10);
    (features[0] as SketchFeature).profile = wedge;
    const face = planarFace(engine.build(features), [Math.SQRT1_2, Math.SQRT1_2, 0]);
    expectVector(face.frame!.origin, [10, 10, 0]);
    const attached = supportedSketch(face.ref);
    attached.profile = kind === 'legacy' ? { kind: 'circle', center: [0, -5], radius: 1 }
      : { kind: 'entities', points: [{ id: 'center', x: 0, y: -5 }], constraints: [],
        entities: [{ id: 'circle', type: 'circle', center: 'center', radius: 1, construction: false }] };
    const result = engine.build([...features, attached, extrusion(2)]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(2000 + Math.PI * 2, 5);
    const frame = result.sketches!.find((visual) => visual.id === 'attached')!.frame!;
    expectVector(framePoint(frame, 0, -5), [10, 10, 5]);
  });

  it('uses the local Y revolution axis of a reversed reference frame', () => {
    const plane = { ...referencePlane(), reversed: true };
    const attached: SketchFeature = { ...supportedSketch({ sourceFeatureId: '', key: '' }), support: { kind: 'plane', planeId: plane.id },
      profile: { kind: 'rectangle', center: [5, 10], width: 10, height: 20 } };
    const result = engine.build([plane, attached, { id: 'revolve', name: 'Revolución', type: 'revolve', sketchId: attached.id, angle: 360, suppressed: false }]);
    expect(result.featureErrors).toEqual([]);
    expect(result.volume).toBeCloseTo(Math.PI * 100 * 20, 5);
    expectVector(result.bounds.min, [-10, -20, 0]);
    expectVector(result.bounds.max, [10, 0, 20]);
  });

  it('roundtrips a supported feature through STEP as a valid solid', async () => {
    const top = planarFace(engine.build(base()), [0, 0, 1]).ref;
    const result = engine.build([...base(), supportedSketch(top), extrusion()]);
    const shape = (await importSTEP(engine.export('step'))).asShape3D();
    const properties = measureShapeVolumeProperties(shape);
    const analyzer = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false);
    try { expect(analyzer.IsValid()).toBe(true); expect(properties.volume).toBeCloseTo(result.volume, 5); }
    finally { analyzer.delete(); properties.delete(); shape.delete(); }
  });
});
