import { expect, it } from 'vitest';
import { solveRigidMates } from './assemblySolver';
import { composeRigidPoses, identityRigidPose, type RigidPose } from './rigidPose';
import type { RigidMateEndpoint, RigidMateProblem, RigidMateSupport } from './assemblySolveTypes';
import type { Vec3 } from '../cad/kernel.types';

// Original Cartesian plane/axis problem. The two valid branches differ by a
// half turn about the retained plane normal; no unique free translation is claimed.
const root = Math.sqrt(30);
const rigid: RigidPose = { translation: [80, -120, 50], rotation: [2 / root, -1 / root, 3 / root, 4 / root] };
function rotate(q: RigidPose['rotation'], p: Vec3): Vec3 {
  const [x, y, z, w] = q, [a, b, c] = p;
  return [(1 - 2 * (y * y + z * z)) * a + 2 * (x * y - z * w) * b + 2 * (x * z + y * w) * c,
    2 * (x * y + z * w) * a + (1 - 2 * (x * x + z * z)) * b + 2 * (y * z - x * w) * c,
    2 * (x * z - y * w) * a + 2 * (y * z + x * w) * b + (1 - 2 * (x * x + y * y)) * c];
}
const near = (actual: number[], wanted: number[], tolerance = 1e-8) => actual.forEach((value, axis) => expect(Math.abs(value - wanted[axis])).toBeLessThanOrEqual(tolerance));
type Case = { axis: 'X' | 'Y'; target: 0 | 180; transformed: boolean; swapped: boolean };
const cases: Case[] = (['X', 'Y'] as const).flatMap(axis => ([0, 180] as const).flatMap(target => [false, true].flatMap(transformed => [false, true].map(swapped => ({ axis, target, transformed, swapped })))));
function fixture(item: Case): RigidMateProblem {
  const common = item.transformed ? rigid : identityRigidPose(), normal: Vec3 = item.axis === 'X' ? [1, 0, 0] : [0, 1, 0];
  const plane: RigidMateSupport = { kind: 'plane', point: [0, 0, 0], normal, xDirection: item.axis === 'X' ? [0, 1, 0] : [1, 0, 0], tolerance: 0 };
  const line: RigidMateSupport = { kind: 'line', point: [0, 0, 0], axis: [0, 0, 1], tolerance: 0 };
  const endpoint = (bodyId: string | null, support: RigidMateSupport, frame = identityRigidPose()): RigidMateEndpoint => ({ bodyId, support, frame });
  const halfTurn: RigidPose['rotation'] = item.axis === 'X' ? [1, 0, 0, 0] : [0, 1, 0, 0];
  const moving = composeRigidPoses(common, { translation: normal.map(value => 12 * value) as Vec3, rotation: item.target === 180 ? [0, 0, 0, 1] : halfTurn });
  const first = endpoint(item.swapped ? 'base' : 'guide', line), second = endpoint(item.swapped ? 'guide' : 'base', line);
  return { bodies: [{ id: 'base', fixed: true, pose: common }, { id: 'guide', fixed: false, pose: moving }], constraints: [
    { id: 'distance', type: 'distance', first: endpoint(null, plane, common), second: endpoint('guide', plane), alignment: 'aligned', distance: -12 },
    { id: 'angle', type: 'angle', first, second, angle: item.target },
  ], origin: [...common.translation], lengthScale: 8, lengthTolerance: 1e-6, angleTolerance: 1e-8 };
}
it.each(cases)('solves coupled $axis plane and endpoint $target, rigid=$transformed, reciprocal refs=$swapped', item => {
  const input = fixture(item), before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.status, JSON.stringify(result.evidence)).toBe('underdefined'); expect(result.rank).toBe(4); expect(result.localDOF).toBe(2);
  expect(result.evidence.diagnostics).toEqual([]); expect(result.evidence.groups[0].checks).toHaveLength(2);
  expect(result.evidence.groups[0].checks.every(check => check.satisfied && check.angleTolerance === 1e-8 && check.lengthTolerance === 1e-6)).toBe(true);
  expect(result.poses!.get('base')).toEqual(input.bodies[0].pose); expect(JSON.stringify(input)).toBe(before);
  const pose = result.poses!.get('guide')!, common = item.transformed ? rigid : identityRigidPose(), normal: Vec3 = item.axis === 'X' ? [1, 0, 0] : [0, 1, 0];
  near(rotate(pose.rotation, normal), rotate(common.rotation, normal));
  near(rotate(pose.rotation, [0, 0, 1]), rotate(common.rotation, [0, 0, item.target === 0 ? 1 : -1]));
  const worldNormal = rotate(common.rotation, normal), separation = pose.translation.map((value, axis) => value - common.translation[axis]);
  expect(Math.abs(worldNormal.reduce((sum, value, axis) => sum + value * separation[axis], 0) - 12)).toBeLessThanOrEqual(1e-6);
});
it.each(cases.filter(item => !item.transformed && !item.swapped))('retains the explicit zero seed budget for $axis/$target', item => {
  const input = fixture(item), before = JSON.stringify(input), result = solveRigidMates(input, { maxSeedPasses: 0 });
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.rank).toBeNull(); expect(result.localDOF).toBeNull();
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(JSON.stringify(input)).toBe(before);
});
it.each(cases.filter(item => !item.transformed && !item.swapped))('uses one existing seed pass for $axis/$target without Newton iteration', item => {
  const result = solveRigidMates(fixture(item), { maxSeedPasses: 1 });
  expect(result.status).toBe('underdefined'); expect(result.rank).toBe(4); expect(result.localDOF).toBe(2);
  expect(result.evidence.groups[0]).toMatchObject({ iterations: 0, trials: 0, seededConstraintIds: ['angle'] });
});
it.each(['X', 'Y'] as const)('rejects contradictory endpoint targets on the same $0 supports atomically', axis => {
  const input = fixture({ axis, target: 180, transformed: false, swapped: false }), angle = input.constraints[1];
  if (angle.type !== 'angle') throw Error('Original angle required'); input.constraints.push({ ...structuredClone(angle), id: 'opposite', angle: 0 });
  const before = JSON.stringify(input), result = solveRigidMates(input);
  expect(['underdefined', 'fullyDefined']).not.toContain(result.status); expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull(); expect(JSON.stringify(input)).toBe(before);
});
it.each([false, true])('preserves active/passive gear no-reseed policy (passive=$0)', passive => {
  const input = fixture({ axis: 'X', target: 180, transformed: false, swapped: false });
  const cylinder: RigidMateSupport = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 0 };
  const endpoint = (bodyId: string): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(), support: cylinder });
  input.bodies.push({ id: 'rotor', fixed: false, pose: identityRigidPose() });
  const gear = { id: 'gear', type: 'gear' as const, first: endpoint('guide'), second: endpoint('rotor'), carrier: null,
    ratio: { numerator: 1, denominator: 1 }, direction: 'opposed' as const, neutralRotations: { first: [0, 0, 0, 1] as RigidPose['rotation'], second: [0, 0, 0, 1] as RigidPose['rotation'] },
    angles: { first: 0, second: 0 }, phase: 0 };
  if (passive) input.passiveGears = [gear]; else input.constraints.push(gear);
  const before = JSON.stringify(input), result = solveRigidMates(input);
  expect(result.poses).toBeNull(); expect(result.evidence.groups.every(group => !group.seededConstraintIds.length)).toBe(true); expect(JSON.stringify(input)).toBe(before);
});
