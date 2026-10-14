import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import initOpenCascade from 'replicad-opencascadejs';
import { makeBox, measureShapeSurfaceProperties, measureShapeVolumeProperties, setOC, type Shape3D } from 'replicad';
import { beforeAll, expect, it, vi } from 'vitest';
import { extractRecipeClosure, type RecipeInstanceTransform, type RegenerationRequest } from '../model/featureRecipes';
import { bodyBoolean, validateBodyShape } from './kernel.bodies';
import { isNativeCleanupFailure, withNativeOwners } from './kernel.native-ownership';
import { buildRecipeInstanceTool } from './kernel.recipe-instance';
import type { BodyReference, Feature, Vec3 } from './kernel.types';

// Original native bridge fixtures; analytical geometry never uses recipe math
// or the primitive builder to construct its expected BRep. No external models.
beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000);
const a: BodyReference = { bodyId: 'bridge-a', sourceFeatureId: 'create-a' },
  target: BodyReference = { bodyId: 'bridge-target', sourceFeatureId: 'create-target' };
function creation(ref: BodyReference, min: Vec3, max: Vec3): Feature[] {
  return [{ id: ref.sourceFeatureId + '-sketch', type: 'sketch', name: 'Original Cartesian bridge owner', suppressed: false,
    plane: 'XY', offset: min[2], profile: { kind: 'rectangle', center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2],
      width: max[0] - min[0], height: max[1] - min[1] } },
  { id: ref.sourceFeatureId, type: 'extrude', name: 'Original bridge owner prism', suppressed: false,
    sketchId: ref.sourceFeatureId + '-sketch', depth: max[2] - min[2], symmetric: false, bodyOperation: { mode: 'new', bodyId: ref.bodyId } }];
}
function declarations(patternKind: RegenerationRequest['patternKind'], transform: RecipeInstanceTransform, min: Vec3, max: Vec3) {
  const features: Feature[] = [...creation(a, [0, 0, 0], [10, 10, 4]),
    { id: 'effect-sketch', type: 'sketch', name: 'Original radius-one bridge recipe', suppressed: false,
      plane: 'XY', offset: 0, profile: { kind: 'circle', center: [5, 5], radius: 1 } },
    { id: 'effect', type: 'cut', name: 'Original ThroughAll bridge effect', suppressed: false,
      sketchId: 'effect-sketch', depth: 1, symmetric: false, bodyScope: [a],
      endCondition: { kind: 'throughAll', baseFeatureId: a.sourceFeatureId, bothDirections: false } },
    ...creation(target, min, max)];
  const request: RegenerationRequest = { mode: 'regenerate', geometryPattern: false, patternId: 'bridge-pattern', patternKind,
    beforeFeatureIndex: features.length, sourceFeatureIds: ['effect'], plan: { transforms: [transform], structure: { patternKind } },
    scope: { mode: 'selected', targets: [target] }, targetSnapshot: [target],
    bindings: [{ source: { bodyId: a.bodyId, sourceFeatureId: 'effect' }, targets: [target.bodyId] }],
    referencePolicies: [], variation: { kind: 'none' } };
  return { features, request };
}
function mass(shape: Shape3D): number { return withNativeOwners(owners => owners.own(measureShapeVolumeProperties(shape)).volume); }
function validate(shape: Shape3D): void {
  validateBodyShape(shape);
  withNativeOwners(owners => expect(owners.own(shape.boundingBox).bounds.flat().every(Number.isFinite)).toBe(true));
}
function metrics(shape: Shape3D, volume: number, area: number, bounds: number[][]): void {
  validate(shape);
  withNativeOwners(owners => {
    expect(Math.abs(owners.own(measureShapeVolumeProperties(shape)).volume - volume)).toBeLessThan(1e-5);
    expect(Math.abs(owners.own(measureShapeSurfaceProperties(shape)).area - area)).toBeLessThan(1e-5);
    owners.own(shape.boundingBox).bounds.forEach((side, i) => side.forEach((value, j) =>
      expect(Math.abs(value - bounds[i][j])).toBeLessThan(1e-6)));
  });
}
function probe(shape: Shape3D, point: Vec3, expected: number): void {
  withNativeOwners(owners => {
    const cube = owners.own(makeBox(point.map(value => value - .1) as Vec3, point.map(value => value + .1) as Vec3)),
      common = owners.own(bodyBoolean('common', shape, cube));
    expect(Math.abs(mass(common) - expected)).toBeLessThan(1e-7);
  });
}
const transforms: { kind: RegenerationRequest['patternKind']; transform: RecipeInstanceTransform; min: Vec3; max: Vec3; probe: Vec3 }[] = [
  { kind: 'linearPattern', transform: { key: '1,0', translation: [20, 0, 0] }, min: [20, 0, 0], max: [30, 10, 8], probe: [25, 5, 6] },
  { kind: 'circularPattern', transform: { key: '1', angle: 180, origin: [15, 0, 0], direction: [0, 0, 1] },
    min: [20, -10, 0], max: [30, 0, 8], probe: [25, -5, 6] },
  { kind: 'mirror', transform: { key: 'mirror', mirror: { origin: [15, 0, 0], xDirection: [0, 1, 0], normal: [1, 0, 0] } },
    min: [20, 0, 0], max: [30, 10, 8], probe: [25, 5, 6] },
];
for (const row of transforms) it('constructs a real height-eight regenerated recipe via extracted ' + row.kind + ' frame', () => withNativeOwners(owners => {
  const input = declarations(row.kind, row.transform, row.min, row.max), before = JSON.stringify(input),
    closure = extractRecipeClosure(input.features, input.request), current = owners.own(makeBox(row.min, row.max));
  const instance = buildRecipeInstanceTool({ closure, featureId: 'effect', address: row.transform.key,
    targetBodyId: target.bodyId, workingTarget: current, validateTool: validate });
  owners.own(instance.tool); expect(instance.operation).toBe('subtract');
  // Current-owner extent 8 plus margin 1: an aggregate envelope or the saved
  // source depth 1/height 4 cannot substitute for this native tool.
  metrics(instance.tool, 9 * Math.PI, 20 * Math.PI, [[24, row.min[1] + 4, 0], [26, row.min[1] + 6, 9]]);
  const result = owners.own(bodyBoolean(instance.operation, current, instance.tool));
  metrics(result, 800 - 8 * Math.PI, 520 + 14 * Math.PI, [row.min, row.max]); probe(result, row.probe, 0);
  metrics(current, 800, 520, [row.min, row.max]); expect(JSON.stringify(input)).toBe(before);
}), 60_000);

it('constructs a blind merge recipe as addition without fabricating intrinsic sketch support', () => withNativeOwners(owners => {
  const input = declarations('linearPattern', { key: '1,0', translation: [20, 0, 0] }, [20, 0, 0], [30, 10, 4]);
  input.features[2] = { id: 'effect-sketch', type: 'sketch', name: 'Original fixed merge recipe', suppressed: false,
    plane: 'XY', offset: 4, profile: { kind: 'rectangle', center: [5, 5], width: 2, height: 2 } };
  input.features[3] = { id: 'effect', type: 'extrude', name: 'Original owned merge recipe', suppressed: false,
    sketchId: 'effect-sketch', depth: 2, symmetric: false, bodyOperation: { mode: 'merge', target: a } };
  const closure = extractRecipeClosure(input.features, input.request), current = owners.own(makeBox([20, 0, 0], [30, 10, 4])),
    instance = buildRecipeInstanceTool({ closure, featureId: 'effect', address: '1,0', targetBodyId: target.bodyId,
      workingTarget: current, validateTool: validate });
  owners.own(instance.tool); expect(instance.operation).toBe('add');
  metrics(instance.tool, 8, 24, [[24, 4, 4], [26, 6, 6]]);
  const result = owners.own(bodyBoolean(instance.operation, current, instance.tool));
  metrics(result, 408, 376, [[20, 0, 0], [30, 10, 6]]); metrics(current, 400, 360, [[20, 0, 0], [30, 10, 4]]);
}), 60_000);
it('rejects an inactive address before native construction', () => withNativeOwners(owners => {
  const input = declarations('linearPattern', { key: '1,0', translation: [20, 0, 0] }, [20, 0, 0], [30, 10, 8]),
    closure = extractRecipeClosure(input.features, input.request), current = owners.own(makeBox([20, 0, 0], [30, 10, 8])), validator = vi.fn(validate);
  expect(() => buildRecipeInstanceTool({ closure, featureId: 'effect', address: 'missing', targetBodyId: target.bodyId,
    workingTarget: current, validateTool: validator })).toThrow();
  expect(validator).not.toHaveBeenCalled(); metrics(current, 800, 520, [[20, 0, 0], [30, 10, 8]]);
}), 60_000);
it('rejects an unbound target instead of using arbitrary current geometry', () => withNativeOwners(owners => {
  const input = declarations('linearPattern', { key: '1,0', translation: [20, 0, 0] }, [20, 0, 0], [30, 10, 8]),
    closure = extractRecipeClosure(input.features, input.request), current = owners.own(makeBox([20, 0, 0], [30, 10, 8])), validator = vi.fn(validate);
  expect(() => buildRecipeInstanceTool({ closure, featureId: 'effect', address: '1,0', targetBodyId: 'unbound-owner',
    workingTarget: current, validateTool: validator })).toThrow('exact extracted target');
  expect(validator).not.toHaveBeenCalled(); metrics(current, 800, 520, [[20, 0, 0], [30, 10, 8]]);
}), 60_000);
it('retains pending end-condition gates rather than silently copying or treating them as blind', () => withNativeOwners(owners => {
  const input = declarations('linearPattern', { key: '1,0', translation: [20, 0, 0] }, [20, 0, 0], [30, 10, 8]), effect = input.features[3];
  if (effect.type !== 'cut') throw new Error('Original cut fixture missing.');
  effect.endCondition = { kind: 'untilNext', baseFeatureId: a.sourceFeatureId };
  const closure = extractRecipeClosure(input.features, input.request), current = owners.own(makeBox([20, 0, 0], [30, 10, 8])), validator = vi.fn(validate);
  expect(closure.diagnostics.some(item => item.code === 'UNTIL_NEXT_PENDING')).toBe(true);
  expect(() => buildRecipeInstanceTool({ closure, featureId: 'effect', address: '1,0', targetBodyId: target.bodyId,
    workingTarget: current, validateTool: validator })).toThrow();
  expect(validator).not.toHaveBeenCalled();
}), 60_000);
it('propagates received native tool release failure as fatal with the original validator cause', () => withNativeOwners(owners => {
  const input = declarations('linearPattern', { key: '1,0', translation: [20, 0, 0] }, [20, 0, 0], [30, 10, 8]),
    closure = extractRecipeClosure(input.features, input.request), current = owners.own(makeBox([20, 0, 0], [30, 10, 8])),
    primary = new Error('Original bridge validator'), cleanup = new Error('Original bridge native release');
  let release: ReturnType<typeof vi.fn> | undefined, caught: unknown;
  try { buildRecipeInstanceTool({ closure, featureId: 'effect', address: '1,0', targetBodyId: target.bodyId,
    workingTarget: current, validateTool: shape => {
      validate(shape);
      const handle = shape.wrapped, rawDelete = handle.delete.bind(handle);
      release = vi.fn(() => { rawDelete(); throw cleanup; });
      Object.defineProperty(handle, 'delete', { configurable: true, value: release }); throw primary;
    } }); } catch (error) { caught = error; }
  expect(isNativeCleanupFailure(caught)).toBe(true); expect((caught as AggregateError).cause).toBe(primary);
  expect((caught as AggregateError).errors).toEqual([primary, cleanup]); expect(release).toHaveBeenCalledTimes(1);
  metrics(current, 800, 520, [[20, 0, 0], [30, 10, 8]]);
}), 60_000);
