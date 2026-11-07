import type { Vec3 } from '../cad/kernel.types';
import { composeRigidPoses, rigidRotationMatrix, validateRigidPose, type Quaternion, type RigidPose } from './rigidPose';

export type Matrix3 = [number, number, number, number, number, number, number, number, number];
const PI_CHART_MARGIN = 1e-7;

/** A logarithm-chart failure is not evidence of an inconsistent assembly. */
export class RotationChartError extends Error {
  constructor(message = 'The rotation is too close to the SO(3) logarithm cut at pi.') {
    super(message); this.name = 'RotationChartError';
  }
}

function tuple(value: readonly number[], size: number, name: string): number[] {
  if (!Array.isArray(value) || value.length !== size) throw new RangeError(name + ' requires ' + size + ' finite coordinates.');
  return Array.from({ length: size }, (_, i) => {
    const field = Object.getOwnPropertyDescriptor(value, String(i));
    if (!field || !('value' in field) || typeof field.value !== 'number' || !Number.isFinite(field.value)) {
      throw new RangeError(name + ' requires dense finite numeric data.');
    }
    return field.value as number;
  });
}
function finite(values: number[]): Vec3 {
  if (values.length !== 3 || !values.every(Number.isFinite)) throw new RangeError('SE(3) arithmetic exceeds finite precision.');
  return values as Vec3;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return finite([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
}
function rotate(matrix: Matrix3, point: Vec3): Vec3 {
  return finite([matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2],
    matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] * point[2],
    matrix[6] * point[0] + matrix[7] * point[1] + matrix[8] * point[2]]);
}
function checkedRotation(rotation: Quaternion): Quaternion {
  const checked = validateRigidPose({ translation: [0, 0, 0], rotation }).rotation;
  const norm = Math.hypot(...checked);
  return checked.map(value => value / norm) as Quaternion;
}

/** SO(3) exponential, Hamilton [x,y,z,w], omega in radians. */
export function rotationExp(value: Vec3): Quaternion {
  const omega = tuple(value, 3, 'rotation tangent') as Vec3, theta = Math.hypot(...omega);
  if (!Number.isFinite(theta)) throw new RangeError('Rotation tangent magnitude is not finite.');
  let factor: number, scalar: number;
  if (theta < 1e-4) {
    const t2 = theta * theta, t4 = t2 * t2, t6 = t4 * t2;
    factor = .5 - t2 / 48 + t4 / 3840 - t6 / 645120;
    scalar = 1 - t2 / 8 + t4 / 384 - t6 / 46080;
  } else { factor = Math.sin(theta / 2) / theta; scalar = Math.cos(theta / 2); }
  return checkedRotation([omega[0] * factor, omega[1] * factor, omega[2] * factor, scalar]);
}

/** Principal SO(3) logarithm. q and -q agree; the pi cut is diagnosed. */
export function rotationLog(value: Quaternion): Vec3 {
  let q = checkedRotation(value);
  if (q[3] < 0) q = q.map(component => -component) as Quaternion;
  const sine = Math.hypot(q[0], q[1], q[2]), angle = 2 * Math.atan2(sine, q[3]);
  if (angle >= Math.PI - PI_CHART_MARGIN) throw new RotationChartError();
  if (sine === 0) return [0, 0, 0];
  return finite([q[0] * (angle / sine), q[1] * (angle / sine), q[2] * (angle / sine)]);
}

/** d Log(Exp(eta) Exp(omega))/d eta at eta=0; flat row-major matrix. */
export function so3LeftJacobianInverse(value: Vec3): Matrix3 {
  const [x, y, z] = tuple(value, 3, 'rotation logarithm'), theta = Math.hypot(x, y, z);
  if (!Number.isFinite(theta)) throw new RangeError('Rotation logarithm magnitude is not finite.');
  if (theta >= Math.PI - PI_CHART_MARGIN) throw new RotationChartError();
  const t2 = theta * theta;
  const coefficient = theta < 1e-4 ? 1 / 12 + t2 / 720 + t2 * t2 / 30240
    : (1 - (theta / 2) / Math.tan(theta / 2)) / t2;
  const result: Matrix3 = [1 - coefficient * (y * y + z * z), z / 2 + coefficient * x * y, -y / 2 + coefficient * x * z,
    -z / 2 + coefficient * x * y, 1 - coefficient * (x * x + z * z), x / 2 + coefficient * y * z,
    y / 2 + coefficient * x * z, -x / 2 + coefficient * y * z, 1 - coefficient * (x * x + y * y)];
  if (!result.every(Number.isFinite)) throw new RangeError('SO(3) Jacobian exceeds finite precision.');
  return result;
}

/**
 * Left retraction in the fixed normalized frame: T_hat' = Exp([v,w]) T_hat.
 * Translation uses V(w)*v, including its small-angle terms. No pose is mutated.
 */
export function retractRigidBodyPose(pose: RigidPose, delta6: readonly number[], origin: Vec3, scale: number): RigidPose {
  const checked = validateRigidPose(pose), center = tuple(origin, 3, 'conditioning origin') as Vec3;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Conditioning length scale must be finite and positive.');
  const delta = tuple(delta6, 6, 'rigid tangent'), v: Vec3 = [delta[0], delta[1], delta[2]], w: Vec3 = [delta[3], delta[4], delta[5]];
  const theta = Math.hypot(...w), increment = rotationExp(w);
  const tHat = finite(checked.translation.map((coordinate, i) => (coordinate - center[i]) / scale));
  let translated: Vec3;
  if (theta < 1e-4) {
    const t2 = theta * theta, a = .5 - t2 / 24 + t2 * t2 / 720, b = 1 / 6 - t2 / 120 + t2 * t2 / 5040;
    const first = cross(w, v), second = cross(w, first);
    translated = finite(v.map((coordinate, i) => coordinate + a * first[i] + b * second[i]));
  } else {
    const axis = finite(w.map(coordinate => coordinate / theta)), first = cross(axis, v), second = cross(axis, first);
    const a = (1 - Math.cos(theta)) / theta, b = 1 - Math.sin(theta) / theta;
    translated = finite(v.map((coordinate, i) => coordinate + a * first[i] + b * second[i]));
  }
  const rotated = rotate(rigidRotationMatrix(increment), tHat);
  const translation = finite(rotated.map((coordinate, i) => center[i] + scale * (coordinate + translated[i])));
  const rotation = composeRigidPoses({ translation: [0, 0, 0], rotation: increment },
    { translation: [0, 0, 0], rotation: checked.rotation }).rotation;
  return { translation, rotation };
}
