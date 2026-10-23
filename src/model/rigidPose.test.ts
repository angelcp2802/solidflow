import { expect, it } from 'vitest';
import type { Vec3 } from '../cad/kernel.types';
import { composeRigidPoses, identityRigidPose, inverseRigidPose, rigidRotationMatrix,
  transformRigidDirection, transformRigidPoint, validateRigidPose, type Quaternion, type RigidPose } from './rigidPose';

// Original Cartesian/rational oracles. No native geometry, solver output or
// implementation-produced matrix is used to calculate an expected coordinate.
function close(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(Number.isFinite(value)).toBe(true);
    expect(Math.abs(value - expected[index])).toBeLessThan(1e-12);
  });
}
const s = Math.SQRT1_2;
const point: Vec3 = [2, 3, 5];
const axisCases: { name: string; q: Quaternion; expected: Vec3; matrix: number[] }[] = [
  { name: 'X90', q: [s, 0, 0, s], expected: [2, -5, 3], matrix: [1, 0, 0, 0, 0, -1, 0, 1, 0] },
  { name: 'Y90', q: [0, s, 0, s], expected: [5, 3, -2], matrix: [0, 0, 1, 0, 1, 0, -1, 0, 0] },
  { name: 'Z90', q: [0, 0, s, s], expected: [-3, 2, 5], matrix: [0, -1, 0, 1, 0, 0, 0, 0, 1] },
  { name: 'X180', q: [1, 0, 0, 0], expected: [2, -3, -5], matrix: [1, 0, 0, 0, -1, 0, 0, 0, -1] },
  { name: 'Y180', q: [0, 1, 0, 0], expected: [-2, 3, -5], matrix: [-1, 0, 0, 0, 1, 0, 0, 0, -1] },
  { name: 'Z180', q: [0, 0, 1, 0], expected: [-2, -3, 5], matrix: [-1, 0, 0, 0, -1, 0, 0, 0, 1] },
  { name: 'X−90', q: [-s, 0, 0, s], expected: [2, 5, -3], matrix: [1, 0, 0, 0, 0, 1, 0, -1, 0] },
];

it('returns independent identities and detached validated declaration arrays', () => {
  const input = identityRigidPose(), other = identityRigidPose(), validated = validateRigidPose(input);
  expect(input).toEqual({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] });
  expect(validated).toEqual(input); expect(validated).not.toBe(input);
  expect(validated.translation).not.toBe(input.translation); expect(validated.rotation).not.toBe(input.rotation);
  validated.translation[0] = 12; validated.rotation[0] = 1;
  other.translation[1] = 9; other.rotation[3] = -1;
  expect(input).toEqual({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] });
  close(transformRigidPoint(input, point), point);
  close(transformRigidDirection(input, point), point);
});

it.each(axisCases)('uses Hamilton $name with a flat row-major matrix', ({ q, expected, matrix }) => {
  const pose: RigidPose = { translation: [0, 0, 0], rotation: q };
  close(rigidRotationMatrix(q), matrix);
  close(transformRigidPoint(pose, point), expected);
});

it('rotates 180 degrees around the rational unit axis (1,2,2)/3', () => {
  // 2*n*(n dot p) − p, for n=(1,2,2)/3 and p=(3,−6,9), is (−1,10,−5).
  close(transformRigidDirection({ translation: [0, 0, 0], rotation: [1 / 3, 2 / 3, 2 / 3, 0] }, [3, -6, 9]), [-1, 10, -5]);
});

it('composes parent Z90 and local X90 in parent-first frame order', () => {
  const parent: RigidPose = { translation: [10, 20, 30], rotation: [0, 0, s, s] };
  const local: RigidPose = { translation: [1, 2, 3], rotation: [s, 0, 0, s] };
  const before = JSON.stringify({ parent, local }), world = composeRigidPoses(parent, local);
  close(world.translation, [8, 21, 33]);
  close(rigidRotationMatrix(world.rotation), [0, 0, 1, 1, 0, 0, 0, 1, 0]);
  close(transformRigidPoint(world, [4, 5, 6]), [14, 25, 38]);
  expect(JSON.stringify({ parent, local })).toBe(before);
});

it('distinguishes noncommuting rotations without deriving the oracle by composition', () => {
  const z: RigidPose = { translation: [0, 0, 0], rotation: [0, 0, s, s] };
  const x: RigidPose = { translation: [0, 0, 0], rotation: [s, 0, 0, s] };
  close(transformRigidPoint(composeRigidPoses(z, x), [1, 2, 3]), [3, 1, 2]);
  close(transformRigidPoint(composeRigidPoses(x, z), [1, 2, 3]), [-2, -3, 1]);
});

it('inverts a cyclic Cartesian placement and both composition orders', () => {
  const pose: RigidPose = { translation: [8, 21, 33], rotation: [.5, .5, .5, .5] };
  const before = JSON.stringify(pose), inverse = inverseRigidPose(pose);
  close(inverse.translation, [-21, -33, -8]);
  close(rigidRotationMatrix(inverse.rotation), [0, 1, 0, 0, 0, 1, 1, 0, 0]);
  close(transformRigidPoint(inverse, [14, 25, 38]), [4, 5, 6]);
  close(transformRigidPoint(composeRigidPoses(pose, inverse), [4, 5, 6]), [4, 5, 6]);
  close(transformRigidPoint(composeRigidPoses(inverse, pose), [4, 5, 6]), [4, 5, 6]);
  expect(JSON.stringify(pose)).toBe(before);
});

it('treats opposite quaternion signs as the same rotation without rewriting either declaration', () => {
  const a: RigidPose = { translation: [7, -9, 11], rotation: [1 / 3, 2 / 3, 2 / 3, 0] };
  const b: RigidPose = { translation: [7, -9, 11], rotation: [-1 / 3, -2 / 3, -2 / 3, 0] };
  const before = JSON.stringify({ a, b });
  close(transformRigidPoint(a, [3, -6, 9]), [6, 1, 6]);
  close(transformRigidPoint(b, [3, -6, 9]), [6, 1, 6]);
  close(rigidRotationMatrix(a.rotation), rigidRotationMatrix(b.rotation));
  expect(JSON.stringify({ a, b })).toBe(before);
});

it('preserves the independently known distance between two original points', () => {
  const pose: RigidPose = { translation: [7, -9, 11], rotation: [1 / 3, 2 / 3, 2 / 3, 0] };
  const a = transformRigidPoint(pose, [3, -6, 9]), b = transformRigidPoint(pose, [-2, 4, 1]);
  // Original difference (5,−10,8) has squared length 189.
  expect(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - Math.sqrt(189))).toBeLessThan(1e-12);
});

it('translates points but preserves direction magnitude without translation', () => {
  const pose: RigidPose = { translation: [10, 20, 30], rotation: [0, 0, s, s] };
  close(transformRigidPoint(pose, [3, 4, 5]), [6, 23, 35]);
  close(transformRigidDirection(pose, [3, 4, 5]), [-4, 3, 5]);
  expect(Math.abs(Math.hypot(...transformRigidDirection(pose, [3, 4, 5])) - Math.sqrt(50))).toBeLessThan(1e-12);
});

it.each([1 - 5e-11, 1 + 5e-11])('preserves accepted norm %s and normalizes only a computation copy', scale => {
  const input: RigidPose = { translation: [1, 2, 3], rotation: [0, 0, s * scale, s * scale] };
  const before = JSON.stringify(input), copy = validateRigidPose(input);
  expect(copy.rotation).toEqual(input.rotation);
  close(transformRigidPoint(copy, [3, 4, 5]), [-3, 5, 8]);
  expect(JSON.stringify(input)).toBe(before);
  expect(copy.rotation).toEqual(input.rotation);
});

it('accepts finite coordinates without an artificial modeling-size limit', () => {
  const huge: Vec3 = [1e300, -1e300, 1e300], pose = identityRigidPose();
  expect(transformRigidPoint(pose, huge)).toEqual(huge);
  expect(transformRigidDirection(pose, huge)).toEqual(huge);
  const high: RigidPose = { translation: [Number.MAX_VALUE, 0, 0], rotation: [0, 0, 0, 1] };
  expect(transformRigidPoint(high, [0, 0, 0])).toEqual([Number.MAX_VALUE, 0, 0]);
  expect(transformRigidDirection(high, [0, 2, 0])).toEqual([0, 2, 0]);
  close(composeRigidPoses(high, { ...identityRigidPose(), translation: [-Number.MAX_VALUE, 0, 0] }).translation, [0, 0, 0]);
});

const badDeclarations: { name: string; value: unknown }[] = [
  { name: 'null', value: null },
  { name: 'array record', value: [] },
  { name: 'missing fields', value: {} },
  { name: 'missing rotation', value: { translation: [0, 0, 0] } },
  { name: 'extra scale', value: { ...identityRigidPose(), scale: 1 } },
  { name: 'matrix instead of quaternion', value: { translation: [0, 0, 0], rotation: [1, 0, 0, 0, -1, 0, 0, 0, 1] } },
  { name: 'short translation', value: { ...identityRigidPose(), translation: [0, 0] } },
  { name: 'long translation', value: { ...identityRigidPose(), translation: [0, 0, 0, 0] } },
  { name: 'sparse translation', value: { ...identityRigidPose(), translation: new Array(3) } },
  { name: 'translation string coercion', value: { ...identityRigidPose(), translation: ['0', 0, 0] } },
  { name: 'NaN translation', value: { ...identityRigidPose(), translation: [NaN, 0, 0] } },
  { name: 'infinite translation', value: { ...identityRigidPose(), translation: [0, Infinity, 0] } },
  { name: 'short quaternion', value: { ...identityRigidPose(), rotation: [0, 0, 1] } },
  { name: 'NaN quaternion', value: { ...identityRigidPose(), rotation: [NaN, 0, 0, 1] } },
  { name: 'infinite quaternion', value: { ...identityRigidPose(), rotation: [0, 0, Infinity, 1] } },
  { name: 'zero quaternion', value: { ...identityRigidPose(), rotation: [0, 0, 0, 0] } },
  { name: 'scaled quaternion', value: { ...identityRigidPose(), rotation: [0, 0, 0, 2] } },
  { name: 'outside unit tolerance', value: { ...identityRigidPose(), rotation: [0, 0, 0, 1 + 2e-10] } },
  { name: 'norm overflow', value: { ...identityRigidPose(), rotation: [Number.MAX_VALUE, Number.MAX_VALUE, 0, 0] } },
  { name: 'extra tuple property', value: { ...identityRigidPose(), translation: Object.assign([0, 0, 0], { units: 'mm' }) } },
  { name: 'extra symbol property', value: { ...identityRigidPose(), [Symbol('hidden-scale')]: 1 } },
  { name: 'custom record prototype', value: Object.create(identityRigidPose()) },
];
it.each(badDeclarations)('rejects $name instead of repairing a declaration', ({ value }) => {
  expect(() => validateRigidPose(value, 'assembly.instances[1].pose')).toThrow('assembly.instances[1].pose');
});

it('rejects record and tuple accessors without evaluating them', () => {
  let reads = 0;
  const pose = Object.defineProperty({ rotation: [0, 0, 0, 1] }, 'translation', {
    enumerable: true, get() { reads++; return [0, 0, 0]; },
  });
  expect(() => validateRigidPose(pose)).toThrow('accessors');
  const coordinates = [0, 0, 0];
  Object.defineProperty(coordinates, '1', { enumerable: true, get() { reads++; return 0; } });
  expect(() => validateRigidPose({ ...identityRigidPose(), translation: coordinates })).toThrow('accessors');
  expect(reads).toBe(0);
});

it('rejects invalid runtime vectors and quaternions at the math boundary', () => {
  expect(() => transformRigidPoint(identityRigidPose(), [1, 2] as unknown as Vec3)).toThrow('point');
  expect(() => transformRigidDirection(identityRigidPose(), [0, NaN, 0])).toThrow('direction');
  expect(() => rigidRotationMatrix([0, 0, 0, 0])).toThrow('unit Hamilton quaternion');
  expect(() => composeRigidPoses(identityRigidPose(), { translation: [0, 0, 0], rotation: [0, 0, 0, 2] })).toThrow('local.rotation');
  expect(() => inverseRigidPose({ translation: [0, 0, 0], rotation: [0, 0, 0, 2] })).toThrow('pose.rotation');
});

it('rejects finite-input arithmetic overflow for points, directions, composition and inverse', () => {
  const max = Number.MAX_VALUE, identity = identityRigidPose();
  const shifted: RigidPose = { translation: [max, 0, 0], rotation: [0, 0, 0, 1] };
  const z45: Quaternion = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)];
  expect(() => transformRigidPoint(shifted, [max, 0, 0])).toThrow('non-finite');
  expect(() => transformRigidDirection({ ...identity, rotation: z45 }, [max, -max, 0])).toThrow('non-finite');
  expect(() => composeRigidPoses(shifted, shifted)).toThrow('non-finite');
  expect(() => inverseRigidPose({ translation: [max, max, 0], rotation: z45 })).toThrow('non-finite');
});
