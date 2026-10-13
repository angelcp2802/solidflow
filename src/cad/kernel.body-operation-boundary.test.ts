import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { getOC, measureShapeSurfaceProperties, setOC } from 'replicad';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { CadEngine } from './kernel.engine';
import { NativeBodyCatalog } from './kernel.bodies';
import type { BodyReference, CadResult, Feature, PickableBody, SketchFeature } from './kernel.types';

// Original inline fixtures in millimeters: A=[-5,5]^3 (V1000, A600),
// contained extrusion [-1,1]^3, and contained revolution R2, Y=[-2,2].
// Raw objects deliberately bypass the document parser to exercise the engine boundary.
const engine = new CadEngine(), tolerance = 5e-6;
const a: BodyReference = { bodyId: 'boundary-body-a', sourceFeatureId: 'create-a' };
const cubeBounds = [[-5, -5, -5], [5, 5, 5]];
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
afterEach(() => { vi.restoreAllMocks(); engine.dispose(); });

function baseline(): Feature[] {
  return [
    { id: 'sketch-a', type: 'sketch', name: 'Original centered square', plane: 'XY', offset: -5,
      profile: { kind: 'rectangle', center: [0, 0], width: 10, height: 10 }, suppressed: false },
    { id: a.sourceFeatureId, type: 'extrude', name: 'Original cube A', sketchId: 'sketch-a', depth: 10,
      symmetric: false, bodyOperation: { mode: 'new', bodyId: a.bodyId }, suppressed: false },
  ];
}
function operation(kind: 'extrude' | 'revolve', id: string) {
  return { id, type: kind, name: 'Original contained operation', sketchId: `sketch-${id}`, suppressed: false,
    ...(kind === 'extrude' ? { depth: 2, symmetric: false } : { angle: 360 }) };
}
function toolSketch(kind: 'extrude' | 'revolve', id: string): SketchFeature {
  return { id: `sketch-${id}`, type: 'sketch', name: 'Original contained rectangle', plane: 'XY',
    offset: kind === 'extrude' ? -1 : 0,
    profile: { kind: 'rectangle', center: kind === 'extrude' ? [0, 0] : [1, 0], width: 2,
      height: kind === 'extrude' ? 2 : 4 }, suppressed: false };
}
function expectBounds(actual: number[][], wanted: number[][]) {
  actual.forEach((side, i) => side.forEach((coordinate, j) =>
    expect(Math.abs(coordinate - wanted[i][j])).toBeLessThan(tolerance)));
}
function expectCube(result: CadResult, ref: BodyReference): PickableBody {
  expect(result.bodyCatalogActive).toBe(true); expect(result.bodies).toHaveLength(1);
  const body = result.bodies![0];
  expect(body.ref).toEqual(ref); expect(body.createdByFeatureId).toBe(a.sourceFeatureId);
  expect(Math.abs(body.volume - 1000)).toBeLessThan(tolerance);
  expectBounds([body.bounds.min, body.bounds.max], cubeBounds);
  const catalog = (engine as unknown as { bodyCatalog: NativeBodyCatalog | null }).bodyCatalog;
  expect(catalog).not.toBeNull();
  const shape = catalog!.resolve(ref).shape, oc = getOC();
  const owners: { delete(): void }[] = [];
  function own<T extends { delete(): void }>(value: T): T { owners.push(value); return value; }
  try {
    const analyzer = own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false));
    expect(analyzer.IsValid()).toBe(true);
    const solids = shape.solids; solids.forEach(own); expect(solids).toHaveLength(1);
    const mass = own(new oc.GProp_GProps()), surface = own(measureShapeSurfaceProperties(shape));
    oc.BRepGProp.VolumeProperties(shape.wrapped, mass, 1e-10, false, false);
    expect(Math.abs(mass.Mass() - 1000)).toBeLessThan(tolerance);
    expect(Math.abs(surface.area - 600)).toBeLessThan(tolerance);
    const box = own(shape.boundingBox); expectBounds(box.bounds, cubeBounds);
  } finally {
    const errors: unknown[] = [];
    for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, 'Body boundary measurement release failed.');
  }
  return body;
}

it.each(['extrude', 'revolve'] as const)('rejects raw unknown %s body mode before merging and retains the exact valid A state', kind => {
  const features = baseline(), initial = engine.build(features);
  expect(initial.featureErrors).toEqual([]); const initialBody = expectCube(initial, a);
  const id = `unknown-${kind}`, merge = vi.spyOn(NativeBodyCatalog.prototype, 'stageMerge');
  const rawFeatures = [...features, toolSketch(kind, id), { ...operation(kind, id),
    bodyOperation: { mode: 'unknown', target: { ...a } } }] as unknown as Feature[];
  const before = structuredClone(rawFeatures), result = engine.build(rawFeatures);
  expect(rawFeatures).toEqual(before);
  function expectRejected(actual: CadResult, featureId: string) {
    expect(actual.featureErrors).toHaveLength(1);
    expect(actual.featureErrors[0].id).toBe(featureId);
    expect(actual.featureErrors[0].message).toMatch(/operación explícita de cuerpo/);
    expect(merge).not.toHaveBeenCalled();
    const retained = expectCube(actual, a);
    expect(retained.ref).toEqual(initialBody.ref); expect(retained.name).toBe(initialBody.name);
    expect(initialBody.faces.length).toBeGreaterThan(0); expect(initialBody.edges.length).toBeGreaterThan(0);
    expect(retained.faces).toEqual(initialBody.faces); expect(retained.edges).toEqual(initialBody.edges);
    for (const format of ['step', 'stl'] as const) expect(() => engine.export(format)).toThrow(/errores/);
  }
  expectRejected(result, id);
  const inheritedId = `${id}-inherited`, inheritedOperation = { mode: 'unknown', target: { ...a } };
  const prototype = { bodyOperation: inheritedOperation };
  const inherited: Record<string, unknown> = Object.assign(Object.create(prototype), operation(kind, inheritedId));
  const ownDescriptors = Object.getOwnPropertyDescriptors(inherited);
  expect(Object.hasOwn(inherited, 'bodyOperation')).toBe(false);
  expect(inherited.bodyOperation).toBe(inheritedOperation);
  const inheritedResult = engine.build([...features, toolSketch(kind, inheritedId), inherited] as unknown as Feature[]);
  // structuredClone drops this prototype; inspect own properties and the inherited value separately.
  expect(Object.getOwnPropertyDescriptors(inherited)).toEqual(ownDescriptors);
  expect(Object.getPrototypeOf(inherited)).toBe(prototype);
  expect(Object.hasOwn(inherited, 'bodyOperation')).toBe(false);
  expect(inherited.bodyOperation).toBe(inheritedOperation);
  expect(inheritedOperation).toEqual({ mode: 'unknown', target: a });
  expectRejected(inheritedResult, inheritedId);
}, 60_000);

it.each(['extrude', 'revolve'] as const)('accepts a valid raw %s merge control with unchanged contained-tool geometry and an advanced state', kind => {
  const features = baseline(), initial = engine.build(features);
  expect(initial.featureErrors).toEqual([]); expectCube(initial, a);
  const id = `merge-${kind}`;
  const rawFeatures = [...features, toolSketch(kind, id), { ...operation(kind, id),
    bodyOperation: { mode: 'merge', target: { ...a } } }] as unknown as Feature[];
  const before = structuredClone(rawFeatures), result = engine.build(rawFeatures);
  expect(rawFeatures).toEqual(before); expect(result.featureErrors).toEqual([]);
  expectCube(result, { ...a, sourceFeatureId: id });
}, 60_000);

it.each(['extrude', 'revolve'] as const)('rejects malformed declared %s body operations before looking up a sketch or constructing geometry', kind => {
  const malformed: unknown[] = [
    undefined, null, [], 'merge', {}, { mode: 'unknown', target: { ...a } },
    { mode: 'new' }, { mode: 'new', bodyId: '' }, { mode: 'new', bodyId: ' ' },
    { mode: 'new', bodyId: 1 }, { mode: 'new', bodyId: 'x'.repeat(129) },
    { mode: 'new', bodyId: 'bad\u0000id' }, { mode: 'new', bodyId: 'new-body', target: { ...a } },
    { mode: 'merge' }, { mode: 'merge', target: undefined }, { mode: 'merge', target: null },
    { mode: 'merge', target: [] }, { mode: 'merge', target: { bodyId: a.bodyId } },
    { mode: 'merge', target: { sourceFeatureId: a.sourceFeatureId } },
    { mode: 'merge', target: { ...a, sourceFeatureId: 'bad\u007fid' } },
    { mode: 'merge', target: { ...a, extra: true } }, { mode: 'merge', target: { ...a }, bodyId: 'contradiction' },
  ];
  malformed.forEach((bodyOperation, index) => {
    const raw = { ...operation(kind, `${kind}-${index}`), bodyOperation } as unknown as Feature;
    const before = structuredClone(raw), result = engine.build([raw]);
    expect(raw).toEqual(before); expect(Object.hasOwn(raw, 'bodyOperation')).toBe(true);
    expect(result.featureErrors).toHaveLength(1);
    expect(result.featureErrors[0].message).toMatch(/operación explícita de cuerpo/);
    expect(result.bodyCatalogActive).not.toBe(true); expect(result.triangles).toHaveLength(0);
  });
}, 60_000);

it.each(['extrude', 'revolve'] as const)('preserves legacy %s geometry when bodyOperation is absent', kind => {
  const id = `legacy-${kind}`;
  const features = [toolSketch(kind, id), operation(kind, id)] as unknown as Feature[];
  expect(Object.hasOwn(features[1], 'bodyOperation')).toBe(false);
  const before = structuredClone(features), result = engine.build(features);
  expect(features).toEqual(before); expect(result.featureErrors).toEqual([]);
  expect(result.bodyCatalogActive).not.toBe(true);
  expect(Math.abs(result.volume - (kind === 'extrude' ? 8 : 16 * Math.PI))).toBeLessThan(tolerance);
  const radius = kind === 'extrude' ? 1 : 2;
  expectBounds([result.bounds.min, result.bounds.max], [[-radius, -radius, -radius], [radius, radius, radius]]);
}, 60_000);
