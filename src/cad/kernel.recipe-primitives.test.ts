import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { bodyBoolean, validateBodyShape } from './kernel.bodies';
import type { PlaneFrame, Vec3 } from './kernel.types';
import { buildExplicitFramePrimitive, type ExplicitFramePrimitiveInput } from './kernel.recipe-primitives';

// Original Cartesian fixtures authored for this component, in millimeters.
// Expectations use boxes, cylindrical volume/wall/disk areas and stated points;
// no expected shape is reconstructed through the builder or termination helper.
// Numerical and interaction validation results belong in docs/VALIDATION.md.
const metricTolerance = 1e-5, coordinateTolerance = 1e-6;
type Owner = { delete(): void };
type Metrics = { volume: number; area: number; bounds: number[][]; solids: number };
class FixtureOwners {
  private readonly values = new Set<Owner>();
  own<T extends Owner>(value: T): T { this.values.add(value); return value; }
  releaseAll(): unknown[] {
    const errors: unknown[] = [];
    for (const value of [...this.values].reverse()) {
      this.values.delete(value);
      try { value.delete(); } catch (error) { errors.push(error); }
    }
    return errors;
  }
}
function fixture(check: (owners: FixtureOwners) => void): void {
  const owners = new FixtureOwners(); let failed = false, primary: unknown;
  try { check(owners); } catch (error) { failed = true; primary = error; }
  const errors = owners.releaseAll();
  if (errors.length) throw new AggregateError(failed ? [primary, ...errors] : errors,
    'Original native primitive fixture or release failed.', { cause: failed ? primary : errors[0] });
  if (failed) throw primary;
}
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);

function volume(shape: Shape3D, owners: FixtureOwners): number {
  return owners.own(measureShapeVolumeProperties(shape)).volume;
}
function validator(owners: FixtureOwners): (shape: Shape3D) => void {
  return shape => {
    const value = validateBodyShape(shape); // Real BRep validity, one closed solid, positive finite volume.
    expect(Number.isFinite(value)).toBe(true);
    const bounds = owners.own(shape.boundingBox).bounds;
    expect(bounds.flat().every(Number.isFinite)).toBe(true);
  };
}
function metrics(shape: Shape3D, owners: FixtureOwners): Metrics {
  validator(owners)(shape);
  const solids = shape.solids; solids.forEach(solid => owners.own(solid));
  return { volume: volume(shape, owners), area: owners.own(measureShapeSurfaceProperties(shape)).area,
    bounds: owners.own(shape.boundingBox).bounds, solids: solids.length };
}
function expectMetrics(shape: Shape3D, expected: Metrics, owners: FixtureOwners): void {
  const actual = metrics(shape, owners);
  expect(actual.solids).toBe(expected.solids);
  expect(Math.abs(actual.volume - expected.volume)).toBeLessThan(metricTolerance);
  expect(Math.abs(actual.area - expected.area)).toBeLessThan(metricTolerance);
  actual.bounds.forEach((side, i) => side.forEach((value, j) =>
    expect(Math.abs(value - expected.bounds[i][j])).toBeLessThan(coordinateTolerance)));
}
function expectProbe(shape: Shape3D, center: Vec3, material: boolean, owners: FixtureOwners): void {
  const cube = owners.own(makeBox(center.map(value => value - .1) as Vec3, center.map(value => value + .1) as Vec3));
  const common = owners.own(bodyBoolean('common', shape, cube));
  expect(Math.abs(volume(common, owners) - (material ? .008 : 0))).toBeLessThan(1e-7);
}
const xy: PlaneFrame = { origin: [0, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] };
const circle = { kind: 'circle' as const, center: [5, 5] as const, radius: 1 };
function tool(input: Omit<ExplicitFramePrimitiveInput, 'validateTool'>, owners: FixtureOwners): Shape3D {
  return owners.own(buildExplicitFramePrimitive({ ...input, validateTool: validator(owners) }));
}
const transformedTargets: { name: string; frame: PlaneFrame; depth: number; min: Vec3; max: Vec3; probe: Vec3 }[] = [
  { name: 'linear +20 X', frame: { origin: [20, 0, 0], xDirection: [1, 0, 0], normal: [0, 0, 1] },
    depth: 1, min: [20, 0, 0], max: [30, 10, 8], probe: [25, 5, 6] },
  // Reflection Q=diag(-1,1,1) at X=15: X'=QX, N'=det(Q)QN=-Z,
  // signedDepth'=-1. Therefore physical extrusion ray remains +Z and Y'=+Y.
  { name: 'mirror across X=15 with signed parity', frame: { origin: [30, 0, 0], xDirection: [-1, 0, 0], normal: [0, 0, -1] },
    depth: -1, min: [20, 0, 0], max: [30, 10, 8], probe: [25, 5, 6] },
  { name: 'Z half-turn around (15,0,0)', frame: { origin: [30, 0, 0], xDirection: [-1, 0, 0], normal: [0, 0, 1] },
    depth: 1, min: [20, -10, 0], max: [30, 0, 8], probe: [25, -5, 6] },
];
for (const row of transformedTargets) it('regenerates ThroughAll against height 8 rather than copying source height 4: ' + row.name, () => fixture(owners => {
  const source = owners.own(makeBox([0, 0, 0], [10, 10, 4]));
  const sourceTool = tool({ profile: circle, frame: xy, signedDepth: 1, operation: 'subtract', workingTarget: source,
    termination: { kind: 'throughAll', bothDirections: false } }, owners);
  const sourceResult = owners.own(bodyBoolean('subtract', source, sourceTool));
  expectMetrics(sourceResult, { volume: 400 - 4 * Math.PI, area: 360 + 6 * Math.PI,
    bounds: [[0, 0, 0], [10, 10, 4]], solids: 1 }, owners);
  const target = owners.own(makeBox(row.min, row.max)), savedFrame = JSON.stringify(row.frame);
  const regeneratedTool = tool({ profile: circle, frame: row.frame, signedDepth: row.depth, operation: 'subtract', workingTarget: target,
    termination: { kind: 'throughAll', bothDirections: false } }, owners);
  const regenerated = owners.own(bodyBoolean('subtract', target, regeneratedTool));
  expectMetrics(regenerated, { volume: 800 - 8 * Math.PI, area: 520 + 14 * Math.PI,
    bounds: [row.min, row.max], solids: 1 }, owners);
  expectProbe(regenerated, row.probe, false, owners);
  // Independent shallow-cylinder control, not an implementation of geometry-delta replay.
  // A copied four-unit removal would leave material at z=6; its blind pocket has
  // one removed outer disk and one new inner disk, which cancel in the area.
  const shallow = tool({ profile: circle, frame: row.frame, signedDepth: Math.sign(row.depth) * 4, operation: 'subtract',
    termination: { kind: 'blind', symmetric: false } }, owners);
  const shallowResult = owners.own(bodyBoolean('subtract', target, shallow));
  expectMetrics(shallowResult, { volume: 800 - 4 * Math.PI, area: 520 + 8 * Math.PI,
    bounds: [row.min, row.max], solids: 1 }, owners);
  expectProbe(shallowResult, row.probe, true, owners);
  expectMetrics(target, { volume: 800, area: 520, bounds: [row.min, row.max], solids: 1 }, owners);
  expectMetrics(source, { volume: 400, area: 360, bounds: [[0, 0, 0], [10, 10, 4]], solids: 1 }, owners);
  expect(JSON.stringify(row.frame)).toBe(savedFrame);
}), 60_000);

for (const signedDepth of [5, -5]) for (const symmetric of [false, true]) {
  it('uses explicit non-XY center/offset once, signed depth ' + signedDepth + ', symmetric=' + symmetric, () => fixture(owners => {
    // Xlocal=worldY, Ylocal=worldZ, N=worldX; center=(7,13,16).
    const frame: PlaneFrame = { origin: [7, 11, 13], xDirection: [0, 1, 0], normal: [1, 0, 0] };
    const result = tool({ profile: { kind: 'rectangle', center: [2, 3], width: 4, height: 6 }, frame, signedDepth,
      termination: { kind: 'blind', symmetric }, operation: 'add' }, owners);
    const minX = symmetric ? 4.5 : signedDepth > 0 ? 7 : 2, maxX = symmetric ? 9.5 : signedDepth > 0 ? 12 : 7;
    expectMetrics(result, { volume: 120, area: 148, bounds: [[minX, 11, 13], [maxX, 15, 19]], solids: 1 }, owners);
  }), 60_000);
}
for (const height of [4, 8]) it('resolves per-owner ThroughAll on the supplied height ' + height + ', independent of another height-40 owner', () => fixture(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, height]));
  const unrelated = owners.own(makeBox([20, 0, 0], [30, 10, 40]));
  const resultTool = tool({ profile: circle, frame: xy, signedDepth: 1, operation: 'subtract', workingTarget: target,
    termination: { kind: 'throughAll', bothDirections: false } }, owners);
  // Independent tool oracle: the supplied heights 4/8 both have a one-unit
  // cutting envelope margin. A height-40 aggregate would wrongly end at 41.
  // This tests the component's supplied owner, not future DAG callsite attestation.
  const end = height + 1;
  expectMetrics(resultTool, { volume: end * Math.PI, area: 2 * (end + 1) * Math.PI,
    bounds: [[4, 4, 0], [6, 6, end]], solids: 1 }, owners);
  const result = owners.own(bodyBoolean('subtract', target, resultTool));
  expectMetrics(result, { volume: 100 * height - height * Math.PI, area: 200 + 40 * height + (2 * height - 2) * Math.PI,
    bounds: [[0, 0, 0], [10, 10, height]], solids: 1 }, owners);
  expectMetrics(target, { volume: 100 * height, area: 200 + 40 * height,
    bounds: [[0, 0, 0], [10, 10, height]], solids: 1 }, owners);
  expectMetrics(unrelated, { volume: 4000, area: 1800, bounds: [[20, 0, 0], [30, 10, 40]], solids: 1 }, owners);
}), 60_000);
for (const bothDirections of [false, true]) it('resolves ThroughAll bothDirections=' + bothDirections + ' relative to the signed physical ray', () => fixture(owners => {
  const target = owners.own(makeBox([0, 0, -3], [10, 10, 5]));
  const resultTool = tool({ profile: circle, frame: xy, signedDepth: 1, operation: 'subtract', workingTarget: target,
    termination: { kind: 'throughAll', bothDirections } }, owners);
  const result = owners.own(bodyBoolean('subtract', target, resultTool));
  expectMetrics(result, { volume: 800 - (bothDirections ? 8 : 5) * Math.PI,
    area: 520 + (bothDirections ? 14 : 10) * Math.PI, bounds: [[0, 0, -3], [10, 10, 5]], solids: 1 }, owners);
  expectProbe(result, [5, 5, -2], !bothDirections, owners); expectProbe(result, [5, 5, 4], false, owners);
}), 60_000);

it('resolves UntilNext cut to the actual first complete exit', () => fixture(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, 8]));
  const resultTool = tool({ profile: circle, frame: xy, signedDepth: 1, operation: 'subtract', workingTarget: target,
    termination: { kind: 'untilNext' } }, owners);
  expectMetrics(resultTool, { volume: 8 * Math.PI, area: 18 * Math.PI, bounds: [[4, 4, 0], [6, 6, 8]], solids: 1 }, owners);
  const result = owners.own(bodyBoolean('subtract', target, resultTool));
  expectMetrics(result, { volume: 800 - 8 * Math.PI, area: 520 + 14 * Math.PI, bounds: [[0, 0, 0], [10, 10, 8]], solids: 1 }, owners);
}), 60_000);
it('resolves UntilNext boss to actual entry, distinct from cutting through material', () => fixture(owners => {
  const target = owners.own(makeBox([0, 0, 4], [10, 10, 8]));
  const resultTool = tool({ profile: circle, frame: xy, signedDepth: 1, operation: 'add', workingTarget: target,
    termination: { kind: 'untilNext' } }, owners);
  expectMetrics(resultTool, { volume: 4 * Math.PI, area: 10 * Math.PI, bounds: [[4, 4, 0], [6, 6, 4]], solids: 1 }, owners);
  const result = owners.own(bodyBoolean('add', target, resultTool));
  expectMetrics(result, { volume: 400 + 4 * Math.PI, area: 360 + 8 * Math.PI, bounds: [[0, 0, 0], [10, 10, 8]], solids: 1 }, owners);
}), 60_000);
it('uses an explicit borrowed UpToSurface limit without applying a hidden sketch offset', () => fixture(owners => {
  const target = owners.own(makeBox([0, 0, 2], [4, 4, 10]));
  const frame: PlaneFrame = { ...xy, origin: [0, 0, 2] }, limit: PlaneFrame = { ...xy, origin: [0, 0, 6] };
  const before = JSON.stringify({ frame, limit });
  const resultTool = tool({ profile: { kind: 'circle', center: [2, 2], radius: .5 }, frame, signedDepth: 1, operation: 'subtract', workingTarget: target,
    termination: { kind: 'upToSurface', limit: { frame: limit } } }, owners);
  expectMetrics(resultTool, { volume: Math.PI, area: 4.5 * Math.PI, bounds: [[1.5, 1.5, 2], [2.5, 2.5, 6]], solids: 1 }, owners);
  const result = owners.own(bodyBoolean('subtract', target, resultTool));
  expectMetrics(result, { volume: 128 - Math.PI, area: 160 + 4 * Math.PI, bounds: [[0, 0, 2], [4, 4, 10]], solids: 1 }, owners);
  expect(JSON.stringify({ frame, limit })).toBe(before);
}), 60_000);
it('finishes additive ThroughAll at the actual hollow-body exit, without cutting-tool margins', () => fixture(owners => {
  const outer = owners.own(makeBox([0, 0, 0], [10, 10, 8])), inner = owners.own(makeBox([2, 2, 2], [8, 8, 6]));
  const target = owners.own(bodyBoolean('subtract', outer, inner));
  expectMetrics(target, { volume: 656, area: 688, bounds: [[0, 0, 0], [10, 10, 8]], solids: 1 }, owners);
  const resultTool = tool({ profile: circle, frame: xy, signedDepth: 1, operation: 'add', workingTarget: target,
    termination: { kind: 'throughAll', bothDirections: false } }, owners);
  expectMetrics(resultTool, { volume: 8 * Math.PI, area: 18 * Math.PI, bounds: [[4, 4, 0], [6, 6, 8]], solids: 1 }, owners);
  const result = owners.own(bodyBoolean('add', target, resultTool));
  expectMetrics(result, { volume: 656 + 4 * Math.PI, area: 688 + 6 * Math.PI, bounds: [[0, 0, 0], [10, 10, 8]], solids: 1 }, owners);
  expectProbe(result, [5, 5, 4], true, owners); expectProbe(target, [5, 5, 4], false, owners);
}), 60_000);
it('preserves a validator primary failure and releases its received result once even when delete also fails', () => fixture(owners => {
  const primary = new Error('Original validator failure'), cleanup = new Error('Original wrapper cleanup failure');
  let release: ReturnType<typeof vi.fn> | undefined, caught: unknown;
  try {
    buildExplicitFramePrimitive({ profile: circle, frame: xy, signedDepth: 4, operation: 'subtract',
      termination: { kind: 'blind', symmetric: false }, validateTool: shape => {
        // OwnedWrappers already captured shape.delete. Replicad WrappingObj.delete
        // calls its received native handle's delete dynamically; intercept only
        // that owned handle, without changing the wrapper or any prototype.
        const nativeHandle = shape.wrapped, rawDelete = nativeHandle.delete.bind(nativeHandle);
        release = vi.fn(() => { rawDelete(); throw cleanup; });
        Object.defineProperty(nativeHandle, 'delete', { configurable: true, value: release });
        throw primary;
      } });
  } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(AggregateError);
  expect((caught as AggregateError).cause).toBe(primary);
  expect((caught as AggregateError).errors).toContain(primary);
  expect((caught as AggregateError).errors).toContain(cleanup);
  expect(release).toHaveBeenCalledTimes(1);
  // No result escaped and no borrowed target was needed for this blind primitive.
  void owners;
}), 60_000);
it('preserves a final-validator primary after a returned ThroughAll tool and releases that tool once', () => fixture(owners => {
  const target = owners.own(makeBox([0, 0, 0], [10, 10, 8]));
  const primary = new Error('Original final validator failure'), cleanup = new Error('Original final tool release failure');
  const validate = validator(owners), seen: Shape3D[] = [];
  let release: ReturnType<typeof vi.fn> | undefined, caught: unknown, escaped: Shape3D | undefined;
  try {
    escaped = owners.own(buildExplicitFramePrimitive({ profile: circle, frame: xy, signedDepth: 1, operation: 'subtract', workingTarget: target,
      termination: { kind: 'throughAll', bothDirections: false }, validateTool: shape => {
        validate(shape); // Both calls must first pass actual native BRep/bounds validation.
        seen.push(shape);
        if (seen.length !== 2) return; // First call validates the constructed prism inside makePrism.
        // ThroughAll has now returned that actual tool to the outer owner ledger.
        // Adapt only its received native handle: perform the real delete before
        // throwing the secondary error, so this injection does not retain it.
        const nativeHandle = shape.wrapped, rawDelete = nativeHandle.delete.bind(nativeHandle);
        release = vi.fn(() => { rawDelete(); throw cleanup; });
        Object.defineProperty(nativeHandle, 'delete', { configurable: true, value: release });
        throw primary;
      } }));
  } catch (error) { caught = error; }
  expect(seen).toHaveLength(2);
  expect(seen[1]).toBe(seen[0]); // The helper-returned tool, not a fabricated replacement.
  expect(escaped).toBeUndefined();
  expect(caught).toBeInstanceOf(AggregateError);
  const aggregate = caught as AggregateError;
  expect(aggregate.cause).toBe(primary);
  expect(aggregate.errors).toHaveLength(2);
  expect(aggregate.errors[0]).toBe(primary);
  expect(aggregate.errors[1]).toBe(cleanup);
  expect(release).toHaveBeenCalledTimes(1);
  expect(() => seen[1].wrapped).toThrow('This object has been deleted');
  // The borrowed native owner survives the late failure without geometry changes.
  expectMetrics(target, { volume: 800, area: 520, bounds: [[0, 0, 0], [10, 10, 8]], solids: 1 }, owners);
}), 60_000);
