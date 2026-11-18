import { expect, it } from 'vitest';
import type { Vec3 } from '../cad/kernel.types';
import { retractRigidBodyPose, rotationExp, rotationLog, RotationChartError, so3LeftJacobianInverse } from './assemblyKinematics';
import { composeRigidPoses, identityRigidPose, rigidRotationMatrix, transformRigidDirection, transformRigidPoint, type Quaternion, type RigidPose } from './rigidPose';

// Original Cartesian/rational rotations and the analytic SE(3) exponential.
// These tests have no native geometry or assembly-satisfaction authority.
function close(actual: readonly number[], expected: readonly number[], tolerance = 1e-11): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => { expect(Number.isFinite(value)).toBe(true); expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(tolerance); });
}
const zero: Vec3 = [0, 0, 0];

it.each([
  { w: [0, 0, 0], p: [1, 2, 3], result: [1, 2, 3] },
  { w: [Math.PI / 2, 0, 0], p: [1, 2, 3], result: [1, -3, 2] },
  { w: [0, Math.PI / 2, 0], p: [1, 2, 3], result: [3, 2, -1] },
  { w: [0, 0, -Math.PI / 2], p: [1, 2, 3], result: [2, -1, 3] },
  { w: [Math.PI, 0, 0], p: [1, 2, 3], result: [1, -2, -3] },
  { w: [0, Math.PI, 0], p: [1, 2, 3], result: [-1, 2, -3] },
  { w: [0, 0, Math.PI], p: [1, 2, 3], result: [-1, -2, 3] },
])('exponentiates original Cartesian rotation %#', ({ w, p, result }) => {
  close(transformRigidDirection({ translation: zero, rotation: rotationExp(w as Vec3) }, p as Vec3), result);
});
it.each([{ w: [0, 0, 0] }, { w: [.2, -.3, .4] }, { w: [1e-12, -2e-12, 3e-12] }, { w: [1.2, .8, -.6] }])(
  'logarithm inverts a regular exponential and ignores quaternion sign %#', ({ w }) => {
    const q = rotationExp(w as Vec3); close(rotationLog(q), w); close(rotationLog(q.map(value => -value) as Quaternion), w);
  });
it.each([{ angle: Math.PI }, { angle: Math.PI - 5e-8 }, { angle: -Math.PI }])('diagnoses the logarithm cut at %s', ({ angle }) => {
  expect(() => rotationLog(rotationExp([angle, 0, 0]))).toThrow(RotationChartError);
  expect(() => so3LeftJacobianInverse([angle, 0, 0])).toThrow(RotationChartError);
});
it('retains the regular branch just outside the documented pi margin', () => {
  const w: Vec3 = [Math.PI - 2e-7, 0, 0]; close(rotationLog(rotationExp(w)), w);
});
it('uses the actual V*v translation for a finite quarter-turn screw increment', () => {
  const pose: RigidPose = { translation: [12, 20, 30], rotation: [0, 0, 0, 1] };
  const result = retractRigidBodyPose(pose, [1, 0, 0, 0, 0, Math.PI / 2], [10, 20, 30], 2);
  // R*(1,0,0)=(0,1,0), and V*(1,0,0)=(2/pi,2/pi,0).
  close(result.translation, [10 + 4 / Math.PI, 22 + 4 / Math.PI, 30]);
  close(transformRigidDirection(result, [1, 0, 0]), [0, 1, 0]);
});
it('integrates an axial and transverse half-turn translation without an additive shortcut', () => {
  const result = retractRigidBodyPose(identityRigidPose(), [1, 2, 3, 0, 0, Math.PI], zero, 1);
  close(result.translation, [-4 / Math.PI, 2 / Math.PI, 3]);
});
it('uses stable small-angle translation terms', () => {
  const angle = 1e-6, result = retractRigidBodyPose(identityRigidPose(), [1, 0, 0, 0, 0, angle], zero, 1);
  close(result.translation, [1 - angle * angle / 6 + angle ** 4 / 120, angle / 2 - angle ** 3 / 24, 0], 2e-16);
});
it('makes pure translation proportional to conditioning length and leaves rotation intact', () => {
  const pose: RigidPose = { translation: [7, 8, 9], rotation: rotationExp([.2, .3, -.1]) };
  const result = retractRigidBodyPose(pose, [2, -3, 4, 0, 0, 0], [100, -200, 300], 5);
  close(result.translation, [17, -7, 29]); close(rigidRotationMatrix(result.rotation), rigidRotationMatrix(pose.rotation));
});
it('left-multiplies noncommuting rotations', () => {
  const pose: RigidPose = { translation: zero, rotation: rotationExp([Math.PI / 2, 0, 0]) };
  const result = retractRigidBodyPose(pose, [0, 0, 0, 0, 0, Math.PI / 2], zero, 1);
  close(transformRigidDirection(result, [0, 1, 0]), [0, 0, 1]);
  close(transformRigidDirection(result, [0, 0, 1]), [1, 0, 0]);
});
it.each([0, 1, 2, 3, 4, 5])('has the independent spatial tangent derivative in column %s', column => {
  const origin: Vec3 = [10, 20, 30], scale = 4, pose: RigidPose = { translation: [14, 28, 42], rotation: [0, 0, 0, 1] };
  const local: Vec3 = [4, 8, 12], h = 1e-6, delta = Array(6).fill(0) as number[]; delta[column] = h;
  const plus = transformRigidPoint(retractRigidBodyPose(pose, delta, origin, scale), local);
  delta[column] = -h; const minus = transformRigidPoint(retractRigidBodyPose(pose, delta, origin, scale), local);
  // pHat=(2,4,6); spatial omega cross pHat, or a unit normalized translation.
  const expected = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, -6, 4], [6, 0, -2], [-4, 2, 0]][column];
  close(plus.map((value, i) => (value - minus[i]) / (2 * h * scale)), expected, 3e-9);
});
it.each([{ w: [.3, -.2, .5] }, { w: [1e-8, 2e-8, -3e-8] }, { w: [0, 0, 0] }])(
  'matches the left inverse Jacobian against centered logarithm differences %#', ({ w }) => {
    const omega = w as Vec3, q = rotationExp(omega), j = so3LeftJacobianInverse(omega), h = 1e-6;
    for (let column = 0; column < 3; column++) {
      const d: Vec3 = [0, 0, 0]; d[column] = h;
      const plus = rotationLog(composeRigidPoses({ translation: zero, rotation: rotationExp(d) }, { translation: zero, rotation: q }).rotation);
      d[column] = -h;
      const minus = rotationLog(composeRigidPoses({ translation: zero, rotation: rotationExp(d) }, { translation: zero, rotation: q }).rotation);
      close(plus.map((value, row) => (value - minus[row]) / (2 * h)), [j[column], j[3 + column], j[6 + column]], 2e-9);
    }
  });
it('gives the Cartesian left inverse-Jacobian signs at a quarter turn', () => {
  // I - [w]/2 + c[w]^2, c=(1-pi/4)/(pi/2)^2.
  close(so3LeftJacobianInverse([0, 0, Math.PI / 2]), [Math.PI / 4, Math.PI / 4, 0, -Math.PI / 4, Math.PI / 4, 0, 0, 0, 1]);
});
it('preserves frozen input and handles q/-q as the same placement', () => {
  const pose: RigidPose = { translation: [1, 2, 3], rotation: rotationExp([.1, .2, .3]) }, delta = [.2, -.1, .3, .04, -.03, .02];
  Object.freeze(pose.translation); Object.freeze(pose.rotation); Object.freeze(pose); Object.freeze(delta);
  const before = JSON.stringify({ pose, delta }), a = retractRigidBodyPose(pose, delta, zero, 2);
  const b = retractRigidBodyPose({ translation: [...pose.translation], rotation: pose.rotation.map(value => -value) as Quaternion }, delta, zero, 2);
  expect(JSON.stringify({ pose, delta })).toBe(before); close(a.translation, b.translation); close(rigidRotationMatrix(a.rotation), rigidRotationMatrix(b.rotation));
});
it('absorbs a distant shared origin without an artificial coordinate cap', () => {
  const origin: Vec3 = [1e12, -2e12, 3e12], pose: RigidPose = { translation: [1e12 + 2, -2e12 + 4, 3e12 + 6], rotation: [0, 0, 0, 1] };
  const result = retractRigidBodyPose(pose, [1, 2, 3, 0, 0, 0], origin, 2);
  close(result.translation, [1e12 + 4, -2e12 + 8, 3e12 + 12], 0);
});
it.each([0, -1, NaN, Infinity])('rejects invalid conditioning length %s', scale => {
  expect(() => retractRigidBodyPose(identityRigidPose(), Array(6).fill(0), zero, scale)).toThrow();
});
it.each([{ delta: [0, 0, 0] }, { delta: [0, 0, 0, 0, 0, NaN] }, { delta: new Array(6) }])('rejects malformed tangents %#', ({ delta }) => {
  expect(() => retractRigidBodyPose(identityRigidPose(), delta, zero, 1)).toThrow();
});
it('rejects nonfinite arithmetic and invalid rotation declarations', () => {
  expect(() => retractRigidBodyPose({ translation: [Number.MAX_VALUE, 0, 0], rotation: [0, 0, 0, 1] }, [1, 0, 0, 0, 0, 0], zero, Number.MAX_VALUE)).toThrow();
  expect(() => rotationExp([Infinity, 0, 0])).toThrow(); expect(() => rotationLog([0, 0, 0, 2])).toThrow();
});
