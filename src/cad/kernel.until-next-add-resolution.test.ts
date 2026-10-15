import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { bodyBoolean, validateBodyShape } from './kernel.bodies';
import { NextBoundaryUnavailableError } from './kernel.extrusion-limits';
import * as nextLimits from './kernel.extrusion-limits';
import { NativeCleanupError, withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import { buildExplicitFramePrimitive } from './kernel.recipe-primitives';
import { resolveUntilNextAdd, resolveUntilNextCut, type UntilNextAddInput, type UntilNextAddResolution } from './kernel.until-next-resolution';
import type { PlaneFrame, Vec3 } from './kernel.types';

// Original analytic native fixtures. These component cases do not activate
// saved regeneration, infer a body route, or establish an additive ALL policy.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const V = 1e-5, B = 1e-6;
function validator(shape: Shape3D): void {
  withNativeOwners(owners => {
    validateBodyShape(shape);
    expect(owners.own(shape.boundingBox).bounds.flat().every(Number.isFinite)).toBe(true);
  });
}
function expectMetrics(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3): void {
  withNativeOwners(owners => {
    validator(shape);
    expect(owners.ownAll(shape.solids).length).toBe(1);
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(V);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(V);
    owners.own(shape.boundingBox).bounds.forEach((side, index) => side.forEach((x, axis) =>
      expect(Math.abs(x - [min, max][index][axis])).toBeLessThan(B)));
  });
}
function probe(shape: Shape3D, center: Vec3, material: boolean): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(center.map(x => x - .1) as Vec3, center.map(x => x + .1) as Vec3));
    const common = owners.own(bodyBoolean('common', shape, cube));
    expect(Math.abs(owners.own(measureShapeVolumeProperties(common)).volume - (material ? .008 : 0))).toBeLessThan(1e-7);
  });
}
function hollow(owners: NativeOwners, min: Vec3, max: Vec3, innerMin: Vec3, innerMax: Vec3): Shape3D {
  const outer = owners.own(makeBox(min, max)), cavity = owners.own(makeBox(innerMin, innerMax));
  return owners.own(bodyBoolean('subtract', outer, cavity));
}
function factory(frame: PlaneFrame, sign = 1, operation: 'add' | 'subtract' = 'add') {
  const ray = frame.normal.map(x => sign * x) as Vec3;
  return (length: number, start = 0): Shape3D => buildExplicitFramePrimitive({
    profile: { kind: 'circle', center: [0, 0], radius: 1 },
    frame: { ...frame, origin: frame.origin.map((x, axis) => x + ray[axis] * start) as Vec3 },
    signedDepth: sign * length, termination: { kind: 'blind', symmetric: false }, operation, validateTool: validator,
  });
}
function resolveOwned(input: UntilNextAddInput, owners: NativeOwners,
  resolve: typeof resolveUntilNextAdd = resolveUntilNextAdd): UntilNextAddResolution {
  const result = resolve(input);
  // Adopt every received tool before any assertion, even an unexpected success.
  if (result.kind === 'complete') owners.own(result.tool);
  return result;
}
function complete(result: UntilNextAddResolution): Shape3D {
  if (result.kind !== 'complete') throw new Error('Expected a real native first-material-entry tool.');
  return result.tool;
}
function captured(operation: () => unknown): unknown { try { operation(); } catch (error) { return error; } return undefined; }
function errorTree(error: unknown, seen = new Set<unknown>()): unknown[] {
  if (seen.has(error)) return []; seen.add(error);
  return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(item => errorTree(item, seen)) : []),
    ...(error instanceof Error && error.cause !== undefined ? errorTree(error.cause, seen) : [])];
}
const xy: PlaneFrame = { origin: [5, 5, 2], xDirection: [1, 0, 0], normal: [0, 0, 1] };
const placements: { name: string; frame: PlaneFrame; sign: number; ray: Vec3;
  min: Vec3; max: Vec3; innerMin: Vec3; innerMax: Vec3; entry: number; exit: number }[] = [
  { name: 'translated +20X', frame: { ...xy, origin: [25, 5, 2] }, sign: 1, ray: [0, 0, 1],
    min: [20, 0, 0], max: [30, 10, 8], innerMin: [22, 2, 2], innerMax: [28, 8, 6], entry: 6, exit: 8 },
  { name: 'supplied circular half-turn frame', frame: { origin: [25, -5, 2], xDirection: [-1, 0, 0], normal: [0, 0, 1] },
    sign: 1, ray: [0, 0, 1], min: [20, -10, 0], max: [30, 0, 8], innerMin: [22, -8, 2], innerMax: [28, -2, 6], entry: 6, exit: 8 },
  { name: 'supplied reflected frame with signed parity', frame: { origin: [25, 5, 2], xDirection: [-1, 0, 0], normal: [0, 0, -1] },
    sign: -1, ray: [0, 0, 1], min: [20, 0, 0], max: [30, 10, 8], innerMin: [22, 2, 2], innerMax: [28, 8, 6], entry: 6, exit: 8 },
  { name: 'physical negative Z ray', frame: { ...xy, origin: [5, 5, -2] }, sign: -1, ray: [0, 0, -1],
    min: [0, 0, -8], max: [10, 10, 0], innerMin: [2, 2, -6], innerMax: [8, 8, -2], entry: -6, exit: -8 },
];
for (const row of placements) it('distinguishes first Add entry, Cut exit and copied depth: ' + row.name, () => withNativeOwners(owners => {
  const target = hollow(owners, row.min, row.max, row.innerMin, row.innerMax), [x, y, z] = row.frame.origin;
  const foreignMin: Vec3 = [x - 1, y - 1, Math.min(z + row.ray[2], z + 2 * row.ray[2])];
  const foreignMax: Vec3 = [x + 1, y + 1, Math.max(z + row.ray[2], z + 2 * row.ray[2])];
  // This separate borrowed body lies earlier on the same ray, inside the cavity.
  // It is never passed as the selected working owner or used to find the cap.
  const foreign = owners.own(makeBox(foreignMin, foreignMax));
  const addResult = resolveOwned({ workingTarget: target, origin: row.frame.origin, direction: row.ray,
    makePrism: factory(row.frame, row.sign) }, owners);
  const addTool = complete(addResult);
  expectMetrics(addTool, 4 * Math.PI, 10 * Math.PI,
    [x - 1, y - 1, Math.min(z, row.entry)], [x + 1, y + 1, Math.max(z, row.entry)]);
  if (addResult.kind !== 'complete') throw new Error('Missing Add forward material observation.');
  // Forward Common sees only the two-mm roof: it is neither tool volume nor
  // added volume. The four-mm Add tool occupies the original cavity.
  expect(Math.abs(addResult.forward.volumeMm3 - 2 * Math.PI)).toBeLessThan(V);
  expect(addResult.forward.solidCount).toBe(1);
  const added = owners.own(bodyBoolean('add', target, addTool));
  expectMetrics(added, 656 + 4 * Math.PI, 688 + 6 * Math.PI, row.min, row.max);

  const copiedTool = owners.own(factory(row.frame, row.sign)(2));
  const copied = owners.own(bodyBoolean('add', target, copiedTool));
  expectMetrics(copied, 656 + 2 * Math.PI, 688 + 4 * Math.PI, row.min, row.max);
  const cutResult = resolveOwned({ workingTarget: target, origin: row.frame.origin, direction: row.ray,
    makePrism: factory(row.frame, row.sign, 'subtract') }, owners, resolveUntilNextCut);
  const cutTool = complete(cutResult);
  expectMetrics(cutTool, 6 * Math.PI, 14 * Math.PI,
    [x - 1, y - 1, Math.min(z, row.exit)], [x + 1, y + 1, Math.max(z, row.exit)]);
  if (cutResult.kind !== 'complete') throw new Error('Missing Cut forward material observation.');
  expect(Math.abs(cutResult.forward.volumeMm3 - 2 * Math.PI)).toBeLessThan(V);
  const cut = owners.own(bodyBoolean('subtract', target, cutTool));
  expectMetrics(cut, 656 - 2 * Math.PI, 688 + 2 * Math.PI, row.min, row.max);

  const nearGap: Vec3 = [x, y, z + row.ray[2]], deepGap: Vec3 = [x, y, z + 3 * row.ray[2]], roof: Vec3 = [x, y, z + 5 * row.ray[2]];
  probe(added, nearGap, true); probe(copied, nearGap, true); probe(cut, nearGap, false);
  probe(added, deepGap, true); probe(copied, deepGap, false); probe(cut, deepGap, false);
  probe(added, roof, true); probe(copied, roof, true); probe(cut, roof, false);
  probe(added, [x + 2, y, deepGap[2]], false);
  expectMetrics(target, 656, 688, row.min, row.max); probe(target, deepGap, false); probe(target, roof, true);
  expectMetrics(foreign, 4, 16, foreignMin, foreignMax);
}), 60_000);

it('proves a separated Add miss without substituting another body or consuming its borrowed owner', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([20, 0, 0], [30, 10, 8]));
  const result = resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners);
  expect(result.kind).toBe('empty-forward');
  if (result.kind !== 'empty-forward') throw new Error('Expected completed native separation, not an Add tool.');
  expect(result.topologyFreeCompound).toBe(true); expect(Math.abs(result.distanceMm - 14)).toBeLessThan(B);
  expectMetrics(target, 800, 520, [20, 0, 0], [30, 10, 8]);
}), 60_000);
for (const row of [{ gap: 0, kind: 'contact-or-near' }, { gap: 1e-9, kind: 'contact-or-near' },
  { gap: 1e-5, kind: 'empty-forward' }] as const) it('keeps Add tangent/near evidence distinct from a miss, gap=' + row.gap, () => withNativeOwners(owners => {
  const min: Vec3 = [6 + row.gap, 0, 0], max: Vec3 = [16 + row.gap, 10, 8];
  const target = owners.own(makeBox(min, max));
  const result = resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners);
  expect(result.kind).toBe(row.kind);
  if (result.kind === 'empty-forward') expect(Math.abs(result.distanceMm - row.gap)).toBeLessThan(1e-8);
  expectMetrics(target, 800, 520, min, max);
}), 60_000);

it('reports actual forward material with no complete Add-entry face as incomplete, never as a miss', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([0, 0, 6], [5.5, 10, 8]));
  const result = resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners);
  expect(result.kind).toBe('incomplete-limit');
  if (result.kind !== 'incomplete-limit') throw new Error('A partial entry cap cannot close the complete circle.');
  expect(result.error).toBeInstanceOf(NextBoundaryUnavailableError); expect(result.reason).toBe('NO_COMPLETE_FACE');
  // Segment x<=centre+0.5 has area 2π/3+√3/4; the roof is two mm thick.
  expect(Math.abs(result.forward.volumeMm3 - (4 * Math.PI / 3 + Math.sqrt(3) / 2))).toBeLessThan(V);
  expectMetrics(target, 110, 172, [0, 0, 6], [5.5, 10, 8]);
}), 60_000);

it('rejects a borrowed owner returned as an Add prism without adopting or deleting it', () => withNativeOwners(owners => {
  const target = hollow(owners, [0, 0, 0], [10, 10, 8], [2, 2, 2], [8, 8, 6]);
  const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: () => target }, owners));
  expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain('fresh owned prism');
  expectMetrics(target, 656, 688, [0, 0, 0], [10, 10, 8]);
}), 60_000);

it('preserves the original Add prism construction error instead of classifying it as a miss', () => withNativeOwners(owners => {
  const target = hollow(owners, [0, 0, 0], [10, 10, 8], [2, 2, 2], [8, 8, 6]), primary = new Error('Original Add prism construction fault');
  const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1],
    makePrism: () => { throw primary; } }, owners));
  expect(error).toBe(primary); expectMetrics(target, 656, 688, [0, 0, 0], [10, 10, 8]);
}), 60_000);

for (const partial of [false, true]) it('preserves Add query cleanup failure ahead of ' + (partial ? 'a typed incomplete cap' : 'a separated miss'), () => withNativeOwners(owners => {
  const min: Vec3 = partial ? [0, 0, 6] : [20, 0, 0], max: Vec3 = partial ? [5.5, 10, 8] : [30, 10, 8];
  const target = owners.own(makeBox(min, max)), cleanup = new Error('Original Add query release fault'), realFactory = factory(xy);
  let calls = 0, release: ReturnType<typeof vi.fn> | undefined;
  const makePrism = (length: number, start = 0): Shape3D => withNativeOwners(local => {
    const value = local.own(realFactory(length, start));
    if (++calls === 1) {
      const handle = value.wrapped, rawDelete = handle.delete.bind(handle);
      release = vi.fn(() => { rawDelete(); throw cleanup; });
      Object.defineProperty(handle, 'delete', { configurable: true, value: release });
    }
    return value;
  }, value => [value]);
  const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism }, owners));
  expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); expect(release).toHaveBeenCalledTimes(1);
  if (partial) expect(errorTree(error).some(item => item instanceof NextBoundaryUnavailableError && item.reason === 'NO_COMPLETE_FACE')).toBe(true);
  expectMetrics(target, partial ? 110 : 800, partial ? 172 : 520, min, max);
}), 60_000);

it('releases a completed Add tool once if outer query cleanup prevents delivery', () => withNativeOwners(owners => {
  const target = hollow(owners, [0, 0, 0], [10, 10, 8], [2, 2, 2], [8, 8, 6]);
  const cleanup = new Error('Original completed Add query release fault'), realFactory = factory(xy), realUntilNext = nextLimits.untilNextTool;
  let calls = 0, queryRelease: ReturnType<typeof vi.fn> | undefined, toolRelease: ReturnType<typeof vi.fn> | undefined;
  const delegated = vi.spyOn(nextLimits, 'untilNextTool').mockImplementation((...args) => withNativeOwners(local => {
    const tool = local.own(realUntilNext(...args)), handle = tool.wrapped, rawDelete = handle.delete.bind(handle);
    toolRelease = vi.fn(() => rawDelete());
    Object.defineProperty(handle, 'delete', { configurable: true, value: toolRelease });
    return tool;
  }, value => [value]));
  const makePrism = (length: number, start = 0): Shape3D => withNativeOwners(local => {
    const value = local.own(realFactory(length, start));
    if (++calls === 1) {
      const handle = value.wrapped, rawDelete = handle.delete.bind(handle);
      queryRelease = vi.fn(() => { rawDelete(); throw cleanup; });
      Object.defineProperty(handle, 'delete', { configurable: true, value: queryRelease });
    }
    return value;
  }, value => [value]);
  let error: unknown;
  try { error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism }, owners)); }
  finally { delegated.mockRestore(); }
  expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup);
  expect(queryRelease).toHaveBeenCalledTimes(1); expect(toolRelease).toHaveBeenCalledTimes(1);
  expectMetrics(target, 656, 688, [0, 0, 0], [10, 10, 8]);
}), 60_000);
