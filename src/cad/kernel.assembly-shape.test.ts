import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade, { type TopoDS_Shape, type TopoDS_Solid } from 'replicad-opencascadejs';
import { cast, getOC, makeBox, makeVertex, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, Solid, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { placeAssemblyBody, placeAssemblyShape, validateAssemblyShape } from './kernel.assembly-placements';
import { bodyBoolean } from './kernel.bodies';
import * as bodies from './kernel.bodies';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import type { Vec3 } from './kernel.types';

// Original disjoint 2x3x4 boxes, at x=0..2 and x=5..7, in millimeters.
// A quarter-turn maps (x,y,z) to (10-y,20+x,30+z), independently of the helper.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const IDENTITY = { translation: [0, 0, 0] as Vec3, rotation: [0, 0, 0, 1] as [number, number, number, number] };
function compound(owners: NativeOwners, shapes: readonly { wrapped: TopoDS_Shape }[]): Shape3D {
  const oc = getOC(), builder = owners.own(new oc.TopoDS_Builder()), raw = owners.own(new oc.TopoDS_Compound());
  builder.MakeCompound(raw); shapes.forEach(shape => builder.Add(raw, shape.wrapped)); return owners.own(cast(raw)).asShape3D();
}
function boxes(owners: NativeOwners): { first: Shape3D; second: Shape3D; shape: Shape3D } {
  const first = owners.own(makeBox([0, 0, 0], [2, 3, 4])), second = owners.own(makeBox([5, 0, 0], [7, 3, 4]));
  return { first, second, shape: compound(owners, [first, second]) };
}
function metrics(shape: Shape3D, count: number, volume: number, area: number, min: Vec3, max: Vec3): void {
  withNativeOwners(owners => {
    expect(validateAssemblyShape(shape)).toBe(count);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    const bounds = owners.own(shape.boundingBox).bounds;
    [min, max].forEach((side, i) => side.forEach((value, j) => expect(Math.abs(bounds[i][j] - value)).toBeLessThan(1e-6)));
  });
}
function original(shape: Shape3D): void { metrics(shape, 2, 48, 104, [0, 0, 0], [7, 3, 4]); }
function probe(shape: Shape3D, center: Vec3, present: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(x => x - .05) as Vec3, center.map(x => x + .05) as Vec3)), common = owners.own(bodyBoolean('common', shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (present ? .001 : 0))).toBeLessThan(1e-8);
  });
}
function independent(a: Shape3D, b: Shape3D): void {
  expect(a).not.toBe(b); expect(a.wrapped.IsPartner(b.wrapped)).toBe(false);
  withNativeOwners(owners => {
    const left = owners.ownAll(a.faces), right = owners.ownAll(b.faces);
    expect(left.every(face => right.every(other => !face.wrapped.IsPartner(other.wrapped)))).toBe(true);
  });
}

it('validates every closed child without assigning individual identities to the aggregate', () => withNativeOwners(owners => {
  const source = boxes(owners); original(source.shape);
  expect(() => placeAssemblyBody(source.shape, IDENTITY)).toThrow('exactamente un sólido'); original(source.shape);
}), 60_000);
it('places both solids through an independently known Z quarter-turn with unchanged material between them', () => withNativeOwners(owners => {
  const source = boxes(owners), placed = owners.own(placeAssemblyShape(source.shape,
    { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }));
  metrics(placed, 2, 48, 104, [7, 20, 30], [10, 27, 34]); independent(placed, source.shape);
  probe(placed, [9, 21, 31], true); probe(placed, [9, 26, 31], true); probe(placed, [9, 23.5, 31], false);
  original(source.shape); probe(source.shape, [1, 1, 1], true); probe(source.shape, [6, 1, 1], true); probe(source.shape, [3.5, 1, 1], false);
}), 60_000);
it('places every child through a different physical axis rotation', () => withNativeOwners(owners => {
  const source = boxes(owners), placed = owners.own(placeAssemblyShape(source.shape,
    { translation: [7, 8, 9], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }));
  metrics(placed, 2, 48, 104, [7, 4, 9], [14, 8, 12]);
  probe(placed, [8, 7, 10], true); probe(placed, [13, 7, 10], true); probe(placed, [10.5, 7, 10], false); original(source.shape);
}), 60_000);
it('creates independent identity placements and preserves coincident occurrence multiplicity', () => withNativeOwners(owners => {
  const source = boxes(owners), first = owners.own(placeAssemblyShape(source.shape, IDENTITY)), second = owners.own(placeAssemblyShape(source.shape, IDENTITY));
  independent(first, second); independent(first, source.shape); original(first); original(second);
  const scene = compound(owners, [first, second]); metrics(scene, 4, 96, 208, [0, 0, 0], [7, 3, 4]);
  owners.release(first); original(second); original(source.shape);
}), 60_000);
it('keeps the entire placed aggregate alive after all prototype wrappers retire', () => withNativeOwners(owners => {
  const placed = owners.own(withNativeOwners(local => {
    const source = boxes(local); return local.own(placeAssemblyShape(source.shape, IDENTITY));
  }, result => [result]));
  original(placed); probe(placed, [1, 1, 1], true); probe(placed, [6, 1, 1], true);
}), 60_000);
it('rejects an empty native compound rather than silently returning an empty placement', () => withNativeOwners(owners => {
  const empty = compound(owners, []); expect(() => placeAssemblyShape(empty, IDENTITY)).toThrow();
}), 60_000);
it.each(['face', 'edge', 'vertex'] as const)('rejects a loose native %s outside the closed solids', kind => withNativeOwners(owners => {
  const source = boxes(owners), outside = owners.own(makeBox([20, 0, 0], [22, 3, 4]));
  const loose = kind === 'face' ? owners.ownAll(outside.faces)[0] : kind === 'edge' ? owners.ownAll(outside.edges)[0]
    : owners.own(makeVertex([20, 1, 1]));
  const invalid = compound(owners, [source.shape, loose]); expect(() => placeAssemblyShape(invalid, IDENTITY)).toThrow('geometría suelta'); original(source.shape);
}), 60_000);
it('rejects an inverted closed child even when another child has positive volume', () => withNativeOwners(owners => {
  const source = boxes(owners); source.second.wrapped.Reverse();
  const invalid = compound(owners, [source.first, source.second]); expect(() => placeAssemblyShape(invalid, IDENTITY)).toThrow();
  metrics(source.first, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
  expect(Math.abs(owners.own(measureShapeVolumeProperties(source.second)).volume + 24)).toBeLessThan(1e-5);
}), 60_000);
it('rejects an actually open five-face native solid while retaining its original closed box', () => withNativeOwners(owners => {
  const oc = getOC(), source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), faces = owners.ownAll(source.faces),
    builder = owners.own(new oc.TopoDS_Builder()), shell = owners.own(new oc.TopoDS_Shell());
  let raw: TopoDS_Solid | undefined, adopted = false; owners.own({ delete: () => { if (!adopted) raw?.delete(); } });
  builder.MakeShell(shell); faces.slice(0, 5).forEach(face => builder.Add(shell, face.wrapped));
  raw = new oc.TopoDS_Solid(); builder.MakeSolid(raw); builder.Add(raw, shell); const wrapper = new Solid(raw); adopted = true; const open = owners.own(wrapper);
  expect(oc.BRep_Tool.IsClosed(shell)).toBe(false); const aggregate = compound(owners, [open]);
  expect(() => placeAssemblyShape(aggregate, IDENTITY)).toThrow(); metrics(source, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);
it('rejects an invalid pose before any native copying of the aggregate', () => withNativeOwners(owners => {
  const source = boxes(owners), copy = vi.spyOn(bodies, 'copyBodyShape');
  try { expect(() => placeAssemblyShape(source.shape, { translation: [0, 0, 0], rotation: [0, 0, 0, 2] })).toThrow(); expect(copy).not.toHaveBeenCalled(); }
  finally { copy.mockRestore(); } original(source.shape);
}), 60_000);

function captured(action: () => unknown): unknown { try { action(); } catch (error) { return error; } return undefined; }
function errorTree(error: unknown): unknown[] { return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(errorTree) : [])]; }
function placementFault<T>(patch: (owner: NativeOwner) => void, operation: () => T): T {
  const real = ownership.withNativeOwners;
  const replacement: typeof ownership.withNativeOwners = <R>(action: (owners: NativeOwners) => R,
    kept: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      if (context === 'Assembly shape placement or release failed.') {
        const own = owners.own.bind(owners); owners.own = <S extends NativeOwner>(owner: S): S => { patch(owner); return own(owner); };
      }
      return action(owners);
    }, kept, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return operation(); } finally { spy.mockRestore(); }
}
it.each(['matrix query', 'matrix cleanup'] as const)('preserves %s failure and releases all completed aggregate candidates exactly once', fault => withNativeOwners(owners => {
  const source = boxes(owners), primary = new Error('Original aggregate matrix query'), cleanup = new Error('Original aggregate matrix cleanup');
  let copies = 0, results = 0, seenShapes = 0, seenMatrix = false;
  const error = captured(() => placementFault(owner => {
    if ('asShape3D' in owner && 'wrapped' in owner) {
      const shape = owner as Shape3D, first = ++seenShapes === 1, handle = shape.wrapped, release = handle.delete.bind(handle);
      Object.defineProperty(handle, 'delete', { configurable: true, value: () => { if (first) copies++; else results++; release(); } });
    } else if ('SetValues' in owner && typeof owner.SetValues === 'function') {
      seenMatrix = true; const set = owner.SetValues.bind(owner), release = owner.delete.bind(owner);
      Object.defineProperty(owner, 'SetValues', { configurable: true, value: (...args: number[]) => { set(...args); if (fault === 'matrix query') throw primary; } });
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { release(); if (fault === 'matrix cleanup') throw cleanup; } });
    }
  }, () => placeAssemblyShape(source.shape, IDENTITY)));
  expect(seenMatrix).toBe(true); expect(copies).toBe(1); expect(results).toBe(fault === 'matrix query' ? 0 : 1);
  if (fault === 'matrix query') expect(error).toBe(primary);
  else { expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); }
  original(source.shape);
}), 60_000);
