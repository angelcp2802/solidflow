import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { cast, getOC, makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { bodyBoolean, validateBodyShape } from './kernel.bodies';
import * as bodyHelpers from './kernel.bodies';
import { NextBoundaryUnavailableError } from './kernel.extrusion-limits';
import * as nextLimits from './kernel.extrusion-limits';
import { NativeCleanupError, withNativeOwners, type NativeOwners } from './kernel.native-ownership';
import { buildExplicitFramePrimitive } from './kernel.recipe-primitives';
import { resolveUntilNextCut, type UntilNextCutInput, type UntilNextCutResolution } from './kernel.until-next-resolution';
import type { PlaneFrame, Vec3 } from './kernel.types';

// Original analytic boxes/circles/cavities. These authored component cases do
// not activate saved recipes or establish external-target scope/remap policy.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(
  createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000);
const V = 1e-5, B = 1e-6;
function validator(shape: Shape3D): void {
  withNativeOwners(owners => {
    validateBodyShape(shape);
    expect(owners.own(shape.boundingBox).bounds.flat().every(Number.isFinite)).toBe(true);
  });
}
function metrics(shape: Shape3D): { volume: number; area: number; bounds: number[][]; solids: number } {
  return withNativeOwners(owners => {
    validator(shape);
    return { volume: owners.own(measureShapeVolumeProperties(shape)).volume,
      area: owners.own(measureShapeSurfaceProperties(shape)).area,
      bounds: owners.own(shape.boundingBox).bounds, solids: owners.ownAll(shape.solids).length };
  });
}
function expectMetrics(shape: Shape3D, volume: number, area: number, min: Vec3, max: Vec3): void {
  const value = metrics(shape); expect(value.solids).toBe(1);
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
function hollow(owners: NativeOwners, min: Vec3, max: Vec3, innerMin: Vec3, innerMax: Vec3): Shape3D {
  const box = owners.own(makeBox(min, max)), cavity = owners.own(makeBox(innerMin, innerMax));
  return owners.own(bodyBoolean('subtract', box, cavity));
}
function factory(frame: PlaneFrame, sign = 1): (length: number, start?: number) => Shape3D {
  const ray = frame.normal.map(x => sign * x) as Vec3;
  return (length, start = 0) => buildExplicitFramePrimitive({
    profile: { kind: 'circle', center: [0, 0], radius: 1 },
    frame: { ...frame, origin: frame.origin.map((x, i) => x + ray[i] * start) as Vec3 },
    signedDepth: sign * length, termination: { kind: 'blind', symmetric: false }, operation: 'subtract', validateTool: validator,
  });
}
const xy: PlaneFrame = { origin: [5, 5, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] };
function ownComplete(result: UntilNextCutResolution, owners: NativeOwners): Shape3D {
  if (result.kind !== 'complete') throw new Error('Expected an actual complete native next-boundary tool.');
  return owners.own(result.tool);
}
function resolveOwned(input: UntilNextCutInput, owners: NativeOwners): UntilNextCutResolution {
  const result = resolveUntilNextCut(input);
  // Adopt every received tool before any assertion, including an unexpected
  // result from a regression in a negative boundary case.
  if (result.kind === 'complete') owners.own(result.tool);
  return result;
}
function captured(operation: () => unknown): unknown { try { operation(); } catch (error) { return error; } return undefined; }
function errorTree(error: unknown, seen = new Set<unknown>()): unknown[] {
  if (seen.has(error)) return []; seen.add(error);
  return [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(item => errorTree(item, seen)) : []),
    ...(error instanceof Error && error.cause !== undefined ? errorTree(error.cause, seen) : [])];
}

it('proves a remote forward miss by a native empty compound plus positive separation, preserving the borrowed owner', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([20, 0, 0], [30, 10, 8]));
  const result = resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners);
  expect(result.kind).toBe('empty-forward');
  if (result.kind !== 'empty-forward') throw new Error('Remote owner was not independently separated.');
  expect(result.topologyFreeCompound).toBe(true); expect(Math.abs(result.distanceMm - 14)).toBeLessThan(B);
  expectMetrics(target, 800, 520, [20, 0, 0], [30, 10, 8]);
}), 60_000);

for (const row of [
  { gap: 0, kind: 'contact-or-near' },
  { gap: 1e-9, kind: 'contact-or-near' },
  { gap: 1e-5, kind: 'empty-forward' },
] as const) it('distinguishes tangent/near geometry from a genuine separated miss, gap=' + row.gap, () => withNativeOwners(owners => {
  // The circle reaches x6. Its distance to the box at x6+gap is exactly gap.
  const target = owners.own(makeBox([6 + row.gap, 0, 0], [16 + row.gap, 10, 8]));
  const result = resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners);
  expect(result.kind).toBe(row.kind);
  if (result.kind === 'empty-forward') expect(Math.abs(result.distanceMm - row.gap)).toBeLessThan(1e-8);
  expectMetrics(target, 800, 520, [6 + row.gap, 0, 0], [16 + row.gap, 10, 8]);
}), 60_000);

function elevatedOriginalVertexTolerance(shape: Shape3D, tolerance: number): Shape3D {
  return withNativeOwners(owners => {
    const oc = getOC(), serialized = oc.BRepToolsWrapper.Write(shape.wrapped);
    expect(serialized).toContain('CASCADE Topology V3');
    const rows = serialized.split('\n'), edited = [...rows], fields = rows.flatMap((row, index) => row === 'Ve' ? [index + 1] : []);
    expect(fields.length).toBeGreaterThan(0);
    for (const index of fields) {
      expect(Number.isFinite(Number(rows[index])) && Number(rows[index]) >= 0 && Number(rows[index]) < tolerance).toBe(true);
      edited[index] = String(tolerance);
    }
    const restored = [...edited]; for (const index of fields) restored[index] = rows[index];
    expect(restored.join('\n')).toBe(serialized); // every non-tolerance byte remains original
    const raw = owners.own(oc.BRepToolsWrapper.Read(edited.join('\n'))), result = owners.own(cast(raw)).asShape3D();
    expect(Math.abs(oc.BRep_Tool.MaxTolerance(result.wrapped, oc.TopAbs_ShapeEnum.TopAbs_VERTEX) - tolerance)).toBeLessThan(1e-15);
    validator(result);
    return result;
  }, result => [result], 'Original UntilNext elevated vertex-tolerance construction or release failed.');
}

for (const row of [
  { name: 'owner tolerance', ownerTolerance: .001, prismTolerance: 0, gap: .0002, separated: false },
  { name: 'prism tolerance', ownerTolerance: 0, prismTolerance: .001, gap: .0002, separated: false },
  { name: 'sum of both tolerances', ownerTolerance: .0006, prismTolerance: .0006, gap: .0009, separated: false },
  { name: 'separated elevated-tolerance control', ownerTolerance: .001, prismTolerance: .001, gap: .01, separated: true },
] as const) it('requires native clearance beyond ' + row.name + ', gap=' + row.gap, () => withNativeOwners(owners => {
  const min: Vec3 = [6 + row.gap, 0, 0], max: Vec3 = [16 + row.gap, 10, 8];
  const original = owners.own(makeBox(min, max));
  const target = row.ownerTolerance ? owners.own(elevatedOriginalVertexTolerance(original, row.ownerTolerance)) : original;
  const realFactory = factory(xy), actualPrismTolerances: number[] = [];
  const makePrism = (length: number, start = 0): Shape3D => withNativeOwners(local => {
    const ordinary = local.own(realFactory(length, start));
    const prism = row.prismTolerance ? local.own(elevatedOriginalVertexTolerance(ordinary, row.prismTolerance)) : ordinary;
    const actual = getOC().BRep_Tool.MaxTolerance(prism.wrapped, getOC().TopAbs_ShapeEnum.TopAbs_VERTEX);
    actualPrismTolerances.push(actual);
    if (row.prismTolerance) expect(Math.abs(actual - row.prismTolerance)).toBeLessThan(1e-15);
    expectMetrics(prism, Math.PI * length, 2 * Math.PI * (length + 1), [4, 4, start], [6, 6, start + length]);
    return prism;
  }, prism => [prism]);
  const result = resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism }, owners);
  expect(actualPrismTolerances.length).toBeGreaterThan(0);
  if (row.separated) {
    expect(result.kind).toBe('empty-forward');
    if (result.kind !== 'empty-forward') throw new Error('The independently separated control did not produce an empty-forward observation.');
    expect(Math.abs(result.distanceMm - row.gap)).toBeLessThan(1e-8);
  } else {
    // A tolerance-aware native Common may itself produce contact or material.
    // Do not fabricate an empty Common to make this a guard discriminator.
    expect(result.kind).not.toBe('empty-forward');
    if (result.kind === 'contact-or-near' && result.evidence === 'empty-common-within-resolution') {
      expect(result.distanceMm).toBeDefined();
      expect(Math.abs(result.distanceMm! - row.gap)).toBeLessThan(1e-8);
      expect(result.distanceMm!).toBeGreaterThan(1e-7);
      expect(result.distanceMm!).toBeLessThan(row.ownerTolerance + row.prismTolerance);
    }
  }
  expectMetrics(target, 800, 520, min, max); expectMetrics(original, 800, 520, min, max);
}), 60_000);

for (const atPrism of [false, true]) it('preserves a real ' + (atPrism ? 'prism' : 'owner') + ' tolerance-query failure without returning an absence', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([20, 0, 0], [30, 10, 8])), primary = new Error('Original UntilNext tolerance-query fault');
  const realTolerance = bodyHelpers.maximumNativeShapeTolerance, realFactory = factory(xy);
  let received: Shape3D | undefined, release: ReturnType<typeof vi.fn> | undefined;
  const makePrism = (length: number, start = 0): Shape3D => withNativeOwners(local => {
    const prism = local.own(realFactory(length, start)), handle = prism.wrapped, rawDelete = handle.delete.bind(handle);
    release = vi.fn(() => rawDelete()); Object.defineProperty(handle, 'delete', { configurable: true, value: release });
    received = prism; return prism;
  }, prism => [prism]);
  const query = vi.spyOn(bodyHelpers, 'maximumNativeShapeTolerance').mockImplementation(shape => {
    const value = realTolerance(shape);
    if (!atPrism || shape === received) throw primary;
    return value;
  });
  let error: unknown;
  try { error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism }, owners)); }
  finally { query.mockRestore(); }
  expect(error).toBe(primary);
  if (atPrism) expect(release).toHaveBeenCalledTimes(1); else expect(received).toBeUndefined();
  expectMetrics(target, 800, 520, [20, 0, 0], [30, 10, 8]);
}), 60_000);

it('rejects an invalid native tolerance observation after a real query instead of classifying an absence', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([20, 0, 0], [30, 10, 8])), oc = getOC();
  const realTolerance = oc.BRep_Tool.MaxTolerance.bind(oc.BRep_Tool);
  let observed = 0;
  const query = vi.spyOn(oc.BRep_Tool, 'MaxTolerance').mockImplementation((shape, kind) => {
    const value = realTolerance(shape, kind); observed++;
    return kind === oc.TopAbs_ShapeEnum.TopAbs_VERTEX ? NaN : value;
  });
  let error: unknown;
  try { error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners)); }
  finally { query.mockRestore(); }
  expect(observed).toBeGreaterThan(0); expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('Native shape tolerances must be finite and non-negative');
  expectMetrics(target, 800, 520, [20, 0, 0], [30, 10, 8]);
}), 60_000);

it('preserves conservative query-bounds release failure before any miss can be delivered', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([20, 0, 0], [30, 10, 8])), cleanup = new Error('Original UntilNext conservative-bounds release fault');
  const realBounds = bodyHelpers.createConservativeBodyBounds;
  let release: ReturnType<typeof vi.fn> | undefined;
  const bounds = vi.spyOn(bodyHelpers, 'createConservativeBodyBounds').mockImplementation(shape => withNativeOwners(local => {
    const box = local.own(realBounds(shape)), rawDelete = box.delete.bind(box);
    release = vi.fn(() => { rawDelete(); throw cleanup; });
    Object.defineProperty(box, 'delete', { configurable: true, value: release }); return box;
  }, box => [box]));
  let error: unknown;
  try { error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners)); }
  finally { bounds.mockRestore(); }
  expect(error).toBeInstanceOf(NativeCleanupError); expect(errorTree(error)).toContain(cleanup); expect(release).toHaveBeenCalledTimes(1);
  expectMetrics(target, 800, 520, [20, 0, 0], [30, 10, 8]);
}), 60_000);

const placements: { name: string; frame: PlaneFrame; sign: number; min: Vec3; max: Vec3; innerMin: Vec3; innerMax: Vec3; ray: Vec3; end: number }[] = [
  { name: 'linear +20X', frame: { ...xy, origin: [25, 5, 0] }, sign: 1,
    min: [20, 0, 0], max: [30, 10, 8], innerMin: [22, 2, 2], innerMax: [28, 8, 6], ray: [0, 0, 1], end: 2 },
  { name: 'circular half-turn', frame: { origin: [25, -5, 0], xDirection: [-1, 0, 0], normal: [0, 0, 1] }, sign: 1,
    min: [20, -10, 0], max: [30, 0, 8], innerMin: [22, -8, 2], innerMax: [28, -2, 6], ray: [0, 0, 1], end: 2 },
  { name: 'mirror X15 signed parity', frame: { origin: [25, 5, 0], xDirection: [-1, 0, 0], normal: [0, 0, -1] }, sign: -1,
    min: [20, 0, 0], max: [30, 10, 8], innerMin: [22, 2, 2], innerMax: [28, 8, 6], ray: [0, 0, 1], end: 2 },
  { name: 'mirror XY physical -Z', frame: xy, sign: -1,
    min: [0, 0, -8], max: [10, 10, 0], innerMin: [2, 2, -6], innerMax: [8, 8, -2], ray: [0, 0, -1], end: -2 },
];
for (const row of placements) it('uses the first complete wall of the supplied progressive owner: ' + row.name, () => withNativeOwners(owners => {
  const target = hollow(owners, row.min, row.max, row.innerMin, row.innerMax);
  const unrelated = owners.own(makeBox([100, 0, 0], [110, 10, 40]));
  const result = resolveOwned({ workingTarget: target, origin: row.frame.origin, direction: row.ray, makePrism: factory(row.frame, row.sign) }, owners);
  const tool = ownComplete(result, owners), [x, y] = row.frame.origin;
  expectMetrics(tool, 2 * Math.PI, 6 * Math.PI, [x - 1, y - 1, Math.min(0, row.end)], [x + 1, y + 1, Math.max(0, row.end)]);
  if (result.kind !== 'complete') throw new Error('Missing material classification.');
  expect(Math.abs(result.forward.volumeMm3 - 4 * Math.PI)).toBeLessThan(V); // Both walls intersect the enclosing query.
  const cut = owners.own(bodyBoolean('subtract', target, tool));
  expectMetrics(cut, 656 - 2 * Math.PI, 688 + 2 * Math.PI, row.min, row.max);
  probe(cut, [x, y, row.end / 2], false); probe(cut, [x, y, Math.sign(row.end) * 7], true);
  expectMetrics(target, 656, 688, row.min, row.max); expectMetrics(unrelated, 4000, 1800, [100, 0, 0], [110, 10, 40]);
}), 60_000);

it('skips a nearer partial cavity face and finds a later complete exit using original circular-segment oracles', () => withNativeOwners(owners => {
  const target = hollow(owners, [0, 0, 0], [10, 10, 8], [2, 2, 2], [8, 8, 6]);
  const frame: PlaneFrame = { ...xy, origin: [7.5, 5, 0] };
  const result = resolveOwned({ workingTarget: target, origin: frame.origin, direction: [0, 0, 1], makePrism: factory(frame) }, owners);
  const tool = ownComplete(result, owners);
  expectMetrics(tool, 8 * Math.PI, 18 * Math.PI, [6.5, 4, 0], [8.5, 6, 8]);
  if (result.kind !== 'complete') throw new Error('Missing forward material evidence.');
  // Circle area inside x<=8 is 2π/3+√3/4; four cavity-height units are void.
  const removed = 16 * Math.PI / 3 - Math.sqrt(3);
  expect(Math.abs(result.forward.volumeMm3 - removed)).toBeLessThan(V);
  const cut = owners.own(bodyBoolean('subtract', target, tool));
  expectMetrics(cut, 656 - removed, 688 + 22 * Math.PI / 3 - 9 * Math.sqrt(3) / 2, [0, 0, 0], [10, 10, 8]);
  probe(cut, [8.25, 5, 4], false); probe(cut, [7.5, 5, 7], false); probe(cut, [9, 5, 7], true);
  expectMetrics(target, 656, 688, [0, 0, 0], [10, 10, 8]);
}), 60_000);

it('returns a typed incomplete limit for actual forward material with no complete profile-closing face', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([0, 0, 0], [5.5, 10, 8]));
  const result = resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: factory(xy) }, owners);
  expect(result.kind).toBe('incomplete-limit');
  if (result.kind !== 'incomplete-limit') throw new Error('An overhanging profile was incorrectly considered a miss/complete limit.');
  expect(result.reason).toBe('NO_COMPLETE_FACE'); expect(result.error).toBeInstanceOf(NextBoundaryUnavailableError);
  expect(Math.abs(result.forward.volumeMm3 - (16 * Math.PI / 3 + 2 * Math.sqrt(3)))).toBeLessThan(V);
  expectMetrics(target, 440, 358, [0, 0, 0], [5.5, 10, 8]);
}), 60_000);

it('accepts closed temporary islands of one progressive owner without inventing new body identities', () => withNativeOwners(owners => {
  const outer = owners.own(makeBox([0, 0, 0], [10, 10, 8]));
  const gap = owners.own(makeBox([4, 0, -1], [6, 10, 9]));
  const target = owners.own(bodyBoolean('subtract', outer, gap));
  const frame: PlaneFrame = { ...xy, origin: [2, 5, 0] };
  const result = resolveOwned({ workingTarget: target, origin: frame.origin, direction: [0, 0, 1], makePrism: factory(frame) }, owners);
  const tool = ownComplete(result, owners);
  expectMetrics(tool, 8 * Math.PI, 18 * Math.PI, [1, 4, 0], [3, 6, 8]);
  expect(owners.ownAll(target.solids).length).toBe(2);
  expect(Math.abs(owners.own(measureShapeVolumeProperties(target)).volume - 640)).toBeLessThan(V);
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(target)).area - 608)).toBeLessThan(V);
  if (result.kind !== 'complete') throw new Error('No native next-boundary tool was retained.');
  expect(result.forward.solidCount).toBe(1); expect(Math.abs(result.forward.volumeMm3 - 8 * Math.PI)).toBeLessThan(V);
  const cut = owners.own(bodyBoolean('subtract', target, tool));
  expect(owners.ownAll(cut.solids).length).toBe(2);
  expect(Math.abs(owners.own(measureShapeVolumeProperties(cut)).volume - (640 - 8 * Math.PI))).toBeLessThan(V);
  expect(Math.abs(owners.own(measureShapeSurfaceProperties(cut)).area - (608 + 14 * Math.PI))).toBeLessThan(V);
  for (const shape of [target, cut]) owners.own(shape.boundingBox).bounds.forEach((side, i) => side.forEach((x, axis) =>
    expect(Math.abs(x - [[0, 0, 0], [10, 10, 8]][i][axis])).toBeLessThan(B)));
  probe(cut, [2, 5, 4], false); probe(cut, [8, 5, 4], true);
}), 60_000);

for (const partial of [false, true]) it('propagates query-prism cleanup failure instead of returning ' + (partial ? 'an incomplete limit' : 'a remote miss'), () => withNativeOwners(owners => {
  const min: Vec3 = partial ? [0, 0, 0] : [20, 0, 0], max: Vec3 = partial ? [5.5, 10, 8] : [30, 10, 8];
  const target = owners.own(makeBox(min, max)), cleanup = new Error('original owned-query release sentinel'), realFactory = factory(xy);
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
  expectMetrics(target, partial ? 440 : 800, partial ? 358 : 520, min, max);
}), 60_000);

it('releases an already completed next-boundary tool once when outer query cleanup fails before delivery', () => withNativeOwners(owners => {
  const target = hollow(owners, [0, 0, 0], [10, 10, 8], [2, 2, 2], [8, 8, 6]);
  const cleanup = new Error('original successful-query release sentinel'), realFactory = factory(xy);
  const realUntilNext = nextLimits.untilNextTool;
  let calls = 0, queryRelease: ReturnType<typeof vi.fn> | undefined, toolRelease: ReturnType<typeof vi.fn> | undefined;
  const delegated = vi.spyOn(nextLimits, 'untilNextTool').mockImplementation((...args) => withNativeOwners(local => {
    const tool = local.own(realUntilNext(...args)), handle = tool.wrapped, rawDelete = handle.delete.bind(handle);
    toolRelease = vi.fn(() => rawDelete());
    Object.defineProperty(handle, 'delete', { configurable: true, value: toolRelease });
    return tool;
  }, tool => [tool]));
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

it('preserves an ordinary real-factory primary instead of reclassifying it as a geometric miss', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([20, 0, 0], [30, 10, 8])), primary = new Error('original prism-factory failure');
  const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: () => { throw primary; } }, owners));
  expect(error).toBe(primary); expectMetrics(target, 800, 520, [20, 0, 0], [30, 10, 8]);
}), 60_000);

it('refuses a factory returning the borrowed owner without consuming that owner', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, 8]));
  const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: () => target }, owners));
  expect(error).toBeInstanceOf(Error); expectMetrics(target, 800, 520, [0, 0, 0], [10, 10, 8]);
}), 60_000);

it('refuses a repeated real prism wrapper and releases the first received wrapper once', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, 8])), realFactory = factory(xy);
  let cached: Shape3D | undefined, release: ReturnType<typeof vi.fn> | undefined;
  const makePrism = (length: number, start = 0): Shape3D => {
    if (!cached) {
      cached = withNativeOwners(local => {
        const value = local.own(realFactory(length, start)), handle = value.wrapped, rawDelete = handle.delete.bind(handle);
        release = vi.fn(() => rawDelete()); Object.defineProperty(handle, 'delete', { configurable: true, value: release });
        return value;
      }, value => [value]);
    }
    return cached;
  };
  const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism }, owners));
  expect(error).toBeInstanceOf(Error); expect(release).toHaveBeenCalledTimes(1);
  expectMetrics(target, 800, 520, [0, 0, 0], [10, 10, 8]);
}), 60_000);

it('refuses a distinct proxy sharing the borrowed native handle without consuming the owner', () => {
  let release: ReturnType<typeof vi.fn> | undefined;
  withNativeOwners(owners => {
    const target = owners.own(makeBox([0, 0, 0], [10, 10, 8]));
    const handle = target.wrapped, rawDelete = handle.delete.bind(handle);
    release = vi.fn(() => rawDelete());
    Object.defineProperty(handle, 'delete', { configurable: true, value: release });
    // Proxy creates no additional SDK wrapper or FinalizationRegistry record.
    const alias = new Proxy(target, {});
    const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism: () => alias }, owners));
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: expect.stringContaining('fresh owned native prism handle') });
    expect(release).toHaveBeenCalledTimes(0);
    expectMetrics(target, 800, 520, [0, 0, 0], [10, 10, 8]);
  });
  expect(release).toHaveBeenCalledTimes(1);
}, 60_000);

it('refuses fresh proxies of one previously supplied prism handle and releases it once', () => withNativeOwners(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, 8])), realFactory = factory(xy);
  let cached: Shape3D | undefined, calls = 0, release: ReturnType<typeof vi.fn> | undefined;
  const makePrism = (length: number, start = 0): Shape3D => {
    if (!cached) cached = withNativeOwners(local => {
      const value = local.own(realFactory(length, start)), handle = value.wrapped, rawDelete = handle.delete.bind(handle);
      release = vi.fn(() => rawDelete());
      Object.defineProperty(handle, 'delete', { configurable: true, value: release });
      return value;
    }, value => [value]);
    calls++;
    return new Proxy(cached, {});
  };
  const error = captured(() => resolveOwned({ workingTarget: target, origin: xy.origin, direction: [0, 0, 1], makePrism }, owners));
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({ message: expect.stringContaining('fresh owned native prism handle') });
  expect(calls).toBe(2); expect(release).toHaveBeenCalledTimes(1);
  expectMetrics(target, 800, 520, [0, 0, 0], [10, 10, 8]);
}), 60_000);
