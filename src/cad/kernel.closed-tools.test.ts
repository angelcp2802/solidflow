import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade, { type TopoDS_Compound, type TopoDS_Solid } from 'replicad-opencascadejs';
import { Compound, Solid, getOC, makeBox, makeCylinder, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type AnyShape, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { bodyBoolean, copyBodyShape, validateBodyShape } from './kernel.bodies';
import { validatePositiveClosedTool } from './kernel.closed-tools';
import { NativeCleanupError, withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership';
import * as ownership from './kernel.native-ownership';
import { resolveUntilNextAdd, resolveUntilNextCut, type UntilNextCutResolution } from './kernel.until-next-resolution';
import type { Vec3 } from './kernel.types';

// Original analytic geometry and isolated query/release faults. These cases do
// not activate entity profiles, saved UntilNext recipes, or selected/ALL policy.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const V = 1e-5, B = 1e-6;

/** Native Add does not consume the borrowed child wrappers, unlike makeCompound. */
function compound(owners: NativeOwners, children: readonly AnyShape[]): Shape3D {
  const oc = getOC(), builder = owners.own(new oc.TopoDS_Builder());
  let raw: TopoDS_Compound | undefined, adopted = false;
  owners.own({ delete: () => { if (!adopted) raw?.delete(); } });
  raw = new oc.TopoDS_Compound(); builder.MakeCompound(raw);
  for (const child of children) builder.Add(raw, child.wrapped);
  const wrapper = new Compound(raw); adopted = true;
  return owners.own(wrapper);
}
function metrics(shape: Shape3D): { volume: number; area: number; bounds: number[][]; solids: number } {
  return withNativeOwners(owners => ({ volume: owners.own(measureShapeVolumeProperties(shape)).volume,
    area: owners.own(measureShapeSurfaceProperties(shape)).area,
    bounds: owners.own(shape.boundingBox).bounds, solids: owners.ownAll(shape.solids).length }));
}
function expectGeometry(shape: Shape3D, solids: number, volume: number, area: number, min: Vec3, max: Vec3): void {
  const value = metrics(shape); expect(value.solids).toBe(solids);
  expect(Math.abs(value.volume - volume)).toBeLessThan(V); expect(Math.abs(value.area - area)).toBeLessThan(V);
  value.bounds.forEach((side, i) => side.forEach((x, axis) => expect(Math.abs(x - [min, max][i][axis])).toBeLessThan(B)));
}
function probe(shape: Shape3D, center: Vec3, material: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(x => x - .1) as Vec3, center.map(x => x + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (material ? .008 : 0))).toBeLessThan(1e-7);
  });
}
function annulus(owners: NativeOwners): Shape3D {
  const outer = owners.own(makeCylinder(2, 3)), inner = owners.own(makeCylinder(1, 3));
  return owners.own(bodyBoolean('subtract', outer, inner));
}
function occurrences(shape: Shape3D): number {
  return withNativeOwners(owners => {
    const oc = getOC(), explorer = owners.own(new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count = 0; while (explorer.More()) { count++; explorer.Next(); } return count;
  });
}
function nativeValid(shape: Shape3D): boolean {
  return withNativeOwners(owners => owners.own(new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false)).IsValid());
}
function captured(operation: () => unknown): unknown { try { operation(); } catch (error) { return error; } return undefined; }
function ownResolution(result: UntilNextCutResolution, owners: NativeOwners): UntilNextCutResolution {
  if (result.kind === 'complete') owners.own(result.tool);
  return result;
}
function twinFactory(centers: readonly Vec3[], radius: number, direction: Vec3 = [0, 0, 1]): (length: number, start?: number) => Shape3D {
  return (length, start = 0) => withNativeOwners(owners => {
    const cylinders = centers.map(center => owners.own(makeCylinder(radius, length,
      center.map((x, axis) => x + direction[axis] * start) as Vec3, direction)));
    return compound(owners, cylinders);
  }, result => [result], 'Original multi-region prism fixture or release failed.');
}

it('accepts an annular tool without filling its hole or consuming its borrowed wrapper', () => withNativeOwners(owners => {
  const tool = annulus(owners), result = validatePositiveClosedTool(tool);
  expect(result.solidCount).toBe(1); expect(Math.abs(result.volumeMm3 - 9 * Math.PI)).toBeLessThan(V);
  expectGeometry(tool, 1, 9 * Math.PI, 24 * Math.PI, [-2, -2, 0], [2, 2, 3]);
  probe(tool, [0, 0, 1], false); probe(tool, [1.5, 0, 1], true);
  expect(Math.abs(validateBodyShape(tool) - 9 * Math.PI)).toBeLessThan(V);
}), 60_000);

it('accepts separated annular and rectangular regions while final-owner validation still rejects two solids', () => withNativeOwners(owners => {
  const ring = annulus(owners), box = owners.own(makeBox([5, -1, 0], [7, 1, 2])), tool = compound(owners, [ring, box]);
  const result = validatePositiveClosedTool(tool);
  expect(result.solidCount).toBe(2); expect(Math.abs(result.volumeMm3 - (8 + 9 * Math.PI))).toBeLessThan(V);
  expectGeometry(tool, 2, 8 + 9 * Math.PI, 24 + 24 * Math.PI, [-2, -2, 0], [7, 2, 3]);
  expect(() => validateBodyShape(tool)).toThrow();
  expectGeometry(box, 1, 8, 24, [5, -1, 0], [7, 1, 2]); probe(tool, [0, 0, 1], false);
}), 60_000);

it('uses accumulated native orientation rather than rejecting reversed child flags after a reversed parent', () => withNativeOwners(owners => {
  const a = owners.own(makeBox([0, 0, 0], [2, 3, 4])), b = owners.own(makeBox([5, 0, 0], [8, 2, 5]));
  const ca = owners.own(copyBodyShape(a)), cb = owners.own(copyBodyShape(b)); ca.wrapped.Reverse(); cb.wrapped.Reverse();
  const tool = compound(owners, [ca, cb]); tool.wrapped.Reverse();
  expect(validatePositiveClosedTool(tool).solidCount).toBe(2);
  expectGeometry(tool, 2, 54, 114, [0, 0, 0], [8, 3, 5]);
  expectGeometry(a, 1, 24, 52, [0, 0, 0], [2, 3, 4]); expectGeometry(b, 1, 30, 62, [5, 0, 0], [8, 2, 5]);
}), 60_000);

it('rejects repeated native solid occurrences before SDK solid deduplication can hide them', () => withNativeOwners(owners => {
  const box = owners.own(makeBox([0, 0, 0], [2, 3, 4])), alias = owners.own(box.clone()), tool = compound(owners, [box, alias]);
  expect(occurrences(tool)).toBe(2); expect(owners.ownAll(tool.solids).length).toBe(1);
  expect(() => validatePositiveClosedTool(tool)).toThrow(/repeated native solid/);
  expectGeometry(box, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('rejects distinct overlapping interiors but accepts their actual native single-solid union', () => withNativeOwners(owners => {
  const a = owners.own(makeBox([0, 0, 0], [2, 3, 4])), b = owners.own(makeBox([1, 0, 0], [3, 3, 4])), tool = compound(owners, [a, b]);
  expect(occurrences(tool)).toBe(2); expectGeometry(tool, 2, 48, 104, [0, 0, 0], [3, 3, 4]);
  expect(() => validatePositiveClosedTool(tool)).toThrow(/overlapping solid interiors/);
  const union = owners.own(bodyBoolean('add', a, b));
  expect(validatePositiveClosedTool(union).solidCount).toBe(1); expectGeometry(union, 1, 36, 66, [0, 0, 0], [3, 3, 4]);
  expectGeometry(a, 1, 24, 52, [0, 0, 0], [2, 3, 4]); expectGeometry(b, 1, 24, 52, [1, 0, 0], [3, 3, 4]);
}), 60_000);

it('permits completed native face contact between positive closed components without confusing it with interior overlap', () => withNativeOwners(owners => {
  const a = owners.own(makeBox([0, 0, 0], [2, 2, 2])), b = owners.own(makeBox([2, 0, 0], [4, 2, 2])), tool = compound(owners, [a, b]);
  expect(validatePositiveClosedTool(tool).solidCount).toBe(2);
  expectGeometry(tool, 2, 16, 48, [0, 0, 0], [4, 2, 2]); expect(() => validateBodyShape(tool)).toThrow();
  const union = owners.own(bodyBoolean('add', a, b)); expectGeometry(union, 1, 16, 40, [0, 0, 0], [4, 2, 2]);
}), 60_000);

for (const kind of ['face', 'edge'] as const) it('rejects a valid solid plus a loose ' + kind + ' without treating it as closed material', () => withNativeOwners(owners => {
  const box = owners.own(makeBox([0, 0, 0], [2, 3, 4]));
  const children = kind === 'face' ? owners.ownAll(box.faces) : owners.ownAll(box.edges);
  const tool = compound(owners, [box, children[0]]);
  expect(nativeValid(tool)).toBe(true); expect(occurrences(tool)).toBe(1);
  expect(() => validatePositiveClosedTool(tool)).toThrow(/topology outside/);
  expectGeometry(box, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('rejects an actual non-null topology-free compound', () => withNativeOwners(owners => {
  const tool = compound(owners, []);
  expect(tool.isNull).toBe(false); expect(tool.wrapped.ShapeType()).toBe(getOC().TopAbs_ShapeEnum.TopAbs_COMPOUND);
  expect(occurrences(tool)).toBe(0); expect(() => validatePositiveClosedTool(tool)).toThrow();
}), 60_000);

it('rejects an inverted solid even when its unreversed borrowed source remains healthy', () => withNativeOwners(owners => {
  const source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), tool = owners.own(copyBodyShape(source)); tool.wrapped.Reverse();
  expect(Math.abs(metrics(tool).volume + 24)).toBeLessThan(V);
  expect(() => validatePositiveClosedTool(tool)).toThrow(/positive finite signed volume/);
  expectGeometry(source, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('rejects a native solid made from an open five-face box shell', () => withNativeOwners(owners => {
  const oc = getOC(), source = owners.own(makeBox([0, 0, 0], [2, 3, 4])), faces = owners.ownAll(source.faces);
  const builder = owners.own(new oc.TopoDS_Builder()), shell = owners.own(new oc.TopoDS_Shell());
  let raw: TopoDS_Solid | undefined, adopted = false;
  owners.own({ delete: () => { if (!adopted) raw?.delete(); } });
  builder.MakeShell(shell); for (const face of faces.slice(0, 5)) builder.Add(shell, face.wrapped);
  raw = new oc.TopoDS_Solid(); builder.MakeSolid(raw); builder.Add(raw, shell);
  const wrapper = new Solid(raw); adopted = true; const tool = owners.own(wrapper);
  expect(raw.ShapeType()).toBe(oc.TopAbs_ShapeEnum.TopAbs_SOLID);
  expect(oc.BRep_Tool.IsClosed(shell)).toBe(false); expect(() => validatePositiveClosedTool(tool)).toThrow();
  expectGeometry(source, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('returns the complete two-region cut tool and cuts both columns while preserving the final one-solid owner', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([-2, -2, 0], [10, 4, 8]));
  const result = ownResolution(resolveUntilNextCut({ workingTarget: target, origin: [0, 0, 0], direction: [0, 0, 1],
    makePrism: twinFactory([[0, 0, 0], [6, 0, 0]], 1) }), owners);
  expect(result.kind).toBe('complete'); if (result.kind !== 'complete') throw new Error('Expected both regions to reach one complete cap.');
  expectGeometry(result.tool, 2, 16 * Math.PI, 36 * Math.PI, [-1, -1, 0], [7, 1, 8]);
  const cut = owners.own(bodyBoolean('subtract', target, result.tool)); validateBodyShape(cut);
  expectGeometry(cut, 1, 576 - 16 * Math.PI, 432 + 28 * Math.PI, [-2, -2, 0], [10, 4, 8]);
  probe(cut, [0, 0, 4], false); probe(cut, [6, 0, 4], false); probe(cut, [3, 0, 4], true);
  expectGeometry(target, 1, 576, 432, [-2, -2, 0], [10, 4, 8]);
}), 60_000);

it('does not assemble separate cap heights into an invented complete multi-region exit', () => withNativeOwners(owners => {
  const left = owners.own(makeBox([-2, -2, 0], [2, 2, 4])), right = owners.own(makeBox([4, -2, 0], [8, 2, 6])),
    connector = owners.own(makeBox([2, -2, 0], [4, 2, 1]));
  const first = owners.own(bodyBoolean('add', left, connector)), target = owners.own(bodyBoolean('add', first, right));
  validateBodyShape(target); expectGeometry(target, 1, 168, 236, [-2, -2, 0], [8, 2, 6]);
  const result = ownResolution(resolveUntilNextCut({ workingTarget: target, origin: [0, 0, 0], direction: [0, 0, 1],
    makePrism: twinFactory([[0, 0, 0], [6, 0, 0]], .5) }), owners);
  expect(result.kind).toBe('incomplete-limit');
  if (result.kind !== 'incomplete-limit') throw new Error('A whole-profile cap must cover every region.');
  expect(Math.abs(result.forward.volumeMm3 - 2.5 * Math.PI)).toBeLessThan(V);
  expectGeometry(target, 1, 168, 236, [-2, -2, 0], [8, 2, 6]);
}), 60_000);

it('uses the first complete entry for two additive regions and measures the tool independently of the final union', () => withNativeOwners(owners => {
  const box = owners.own(makeBox([0, 0, 0], [10, 10, 8])), cavity = owners.own(makeBox([2, 2, 2], [8, 8, 6])),
    target = owners.own(bodyBoolean('subtract', box, cavity));
  const result = ownResolution(resolveUntilNextAdd({ workingTarget: target, origin: [5, 5, 2], direction: [0, 0, 1],
    makePrism: twinFactory([[3.5, 5, 2], [6.5, 5, 2]], 1) }), owners);
  expect(result.kind).toBe('complete'); if (result.kind !== 'complete') throw new Error('Expected the complete cavity-roof entry.');
  expectGeometry(result.tool, 2, 8 * Math.PI, 20 * Math.PI, [2.5, 4, 2], [7.5, 6, 6]);
  const merged = owners.own(bodyBoolean('add', target, result.tool)); validateBodyShape(merged);
  expectGeometry(merged, 1, 656 + 8 * Math.PI, 688 + 12 * Math.PI, [0, 0, 0], [10, 10, 8]);
  probe(merged, [3.5, 5, 5], true); probe(merged, [6.5, 5, 5], true); probe(merged, [5, 5, 5], false);
  expectGeometry(target, 1, 656, 688, [0, 0, 0], [10, 10, 8]);
}), 60_000);

/** Patch only received query instances inside the actual project-owned scope. */
function inspectFault<T>(patch: (value: NativeOwner) => void, operation: () => T,
  primary?: (error: unknown) => void): T {
  const real = ownership.withNativeOwners;
  const replacement: typeof ownership.withNativeOwners = <R>(action: (owners: NativeOwners) => R,
    retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => real(owners => {
      const own = owners.own.bind(owners);
      owners.own = <S extends NativeOwner>(value: S): S => { patch(value); return own(value); };
      try { return action(owners); } catch (error) { if (context?.startsWith('Temporary tool validation')) primary?.(error); throw error; }
    }, retained, context);
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(replacement);
  try { return operation(); } finally { spy.mockRestore(); }
}

for (const mass of [0, -1, NaN, Infinity]) it('rejects an injected non-positive/nonfinite native mass after the real query: ' + String(mass), () => withNativeOwners(owners => {
  const tool = owners.own(makeBox([0, 0, 0], [2, 3, 4])); let queried = 0, patched = false;
  expect(() => inspectFault(value => {
    if (patched || !('Mass' in value) || typeof value.Mass !== 'function') return;
    patched = true; const real = value.Mass.bind(value);
    Object.defineProperty(value, 'Mass', { configurable: true, value: () => { real(); queried++; return mass; } });
  }, () => validatePositiveClosedTool(tool))).toThrow(/positive finite signed volume/);
  expect(queried).toBe(1); expectGeometry(tool, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('preserves an actual query failure by identity without consuming the borrowed tool', () => withNativeOwners(owners => {
  const tool = owners.own(makeBox([0, 0, 0], [2, 3, 4])), primary = new Error('Original mass-query failure'); let patched = false, queried = 0;
  const error = captured(() => inspectFault(value => {
    if (patched || !('Mass' in value) || typeof value.Mass !== 'function') return;
    patched = true; const real = value.Mass.bind(value);
    Object.defineProperty(value, 'Mass', { configurable: true, value: () => { real(); queried++; throw primary; } });
  }, () => validatePositiveClosedTool(tool)));
  expect(error).toBe(primary); expect(queried).toBe(1); expectGeometry(tool, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('withholds an otherwise valid summary when actual analyzer release fails after native delete', () => withNativeOwners(owners => {
  const tool = owners.own(makeBox([0, 0, 0], [2, 3, 4])), cleanup = new Error('Original analyzer release failure'); let patched = false, released = 0;
  const error = captured(() => inspectFault(value => {
    if (patched || !('IsValid' in value)) return;
    patched = true; const real = value.delete.bind(value);
    Object.defineProperty(value, 'delete', { configurable: true, value: () => { real(); released++; throw cleanup; } });
  }, () => validatePositiveClosedTool(tool)));
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as Error).cause).toBe(cleanup);
  expect([...(error as AggregateError).errors]).toEqual([cleanup]); expect(released).toBe(1);
  expectGeometry(tool, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);

it('retains the real loose-topology primary before cleanup, with one physical analyzer deletion', () => withNativeOwners(owners => {
  const box = owners.own(makeBox([0, 0, 0], [2, 3, 4])), faces = owners.ownAll(box.faces), tool = compound(owners, [box, faces[0]]);
  const cleanup = new Error('Secondary analyzer release failure'); let patched = false, released = 0, primary: unknown;
  const error = captured(() => inspectFault(value => {
    if (patched || !('IsValid' in value)) return;
    patched = true; const real = value.delete.bind(value);
    Object.defineProperty(value, 'delete', { configurable: true, value: () => { real(); released++; throw cleanup; } });
  }, () => validatePositiveClosedTool(tool), value => { primary = value; }));
  expect(primary).toBeInstanceOf(Error); expect((primary as Error).message).toMatch(/topology outside/);
  expect(error).toBeInstanceOf(NativeCleanupError); expect((error as Error).cause).toBe(primary);
  expect([...(error as AggregateError).errors]).toEqual([primary, cleanup]); expect(released).toBe(1);
  expectGeometry(box, 1, 24, 52, [0, 0, 0], [2, 3, 4]);
}), 60_000);
