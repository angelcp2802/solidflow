import type { Vec3 } from '../cad/kernel.types';

/** Hamilton quaternion, with vector components first and scalar component last. */
export type Quaternion = [number, number, number, number];

/** Proper rigid placement: a local point becomes R * point + translation. */
export interface RigidPose {
  translation: Vec3;
  rotation: Quaternion;
}

type RotationMatrix = [number, number, number, number, number, number, number, number, number];
const UNIT_TOLERANCE = 1e-10;

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function tuple(value: unknown, size: number, path: string): number[] {
  if (!Array.isArray(value) || value.length !== size) fail(path, `Expected an array of exactly ${size} finite numbers.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== size + 1 || keys.some(key => key !== 'length'
    && (typeof key !== 'string' || !Array.from({ length: size }, (_, index) => String(index)).includes(key)))) {
    fail(path, 'Expected a dense tuple without extra properties.');
  }
  return Array.from({ length: size }, (_, index) => {
    const field = Object.getOwnPropertyDescriptor(value, String(index));
    if (!field || !('value' in field) || !field.enumerable || typeof field.value !== 'number' || !Number.isFinite(field.value)) {
      fail(`${path}[${index}]`, 'Expected an own finite number, without coercion or accessors.');
    }
    return field.value as number;
  });
}

function vector(value: unknown, path: string): Vec3 {
  return tuple(value, 3, path) as Vec3;
}

function quaternion(value: unknown, path: string): Quaternion {
  const copy = tuple(value, 4, path) as Quaternion;
  const norm = Math.hypot(...copy);
  if (!Number.isFinite(norm) || norm === 0 || Math.abs(norm - 1) > UNIT_TOLERANCE) {
    fail(path, 'Expected a unit Hamilton quaternion within 1e-10; scale and zero rotations are invalid.');
  }
  return copy;
}

/** Strict detached declaration copy. Accepted quaternion values are preserved. */
export function validateRigidPose(value: unknown, path = 'pose'): RigidPose {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail(path, 'Expected a plain rigid-pose record.');
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || !keys.includes('translation') || !keys.includes('rotation')) {
    fail(path, 'Expected only translation and rotation.');
  }
  const read = (key: 'translation' | 'rotation'): unknown => {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !('value' in field) || !field.enumerable) fail(`${path}.${key}`, 'Expected an own data field, without accessors.');
    return field.value;
  };
  return { translation: vector(read('translation'), `${path}.translation`), rotation: quaternion(read('rotation'), `${path}.rotation`) };
}

export function identityRigidPose(): RigidPose {
  return { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
}

// Computation uses a normalized copy; it never repairs an invalid declaration.
function normalized(value: Quaternion): Quaternion {
  const norm = Math.hypot(...value);
  return value.map(component => component / norm) as Quaternion;
}

/** Row-major 3-by-3 matrix; vectors are columns. No reflection or scaling. */
export function rigidRotationMatrix(rotation: Quaternion): RotationMatrix {
  const [x, y, z, w] = normalized(quaternion(rotation, 'rotation'));
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

function finiteVector(value: Vec3, path: string): Vec3 {
  if (!value.every(Number.isFinite)) fail(path, 'Rigid-pose arithmetic produced a non-finite coordinate.');
  return value;
}

function rotate(matrix: RotationMatrix, value: Vec3): Vec3 {
  return finiteVector([
    matrix[0] * value[0] + matrix[1] * value[1] + matrix[2] * value[2],
    matrix[3] * value[0] + matrix[4] * value[1] + matrix[5] * value[2],
    matrix[6] * value[0] + matrix[7] * value[1] + matrix[8] * value[2],
  ], 'rotation');
}

export function transformRigidPoint(pose: RigidPose, point: Vec3): Vec3 {
  const checked = validateRigidPose(pose), rotated = rotate(rigidRotationMatrix(checked.rotation), vector(point, 'point'));
  return finiteVector(rotated.map((coordinate, index) => coordinate + checked.translation[index]) as Vec3, 'point');
}

/** Translation never affects a direction, and its length is not normalized. */
export function transformRigidDirection(pose: RigidPose, direction: Vec3): Vec3 {
  const checked = validateRigidPose(pose);
  return rotate(rigidRotationMatrix(checked.rotation), vector(direction, 'direction'));
}

/** world = parent * local; local translation is rotated before parent translation. */
export function composeRigidPoses(parent: RigidPose, local: RigidPose): RigidPose {
  const a = validateRigidPose(parent, 'parent'), b = validateRigidPose(local, 'local');
  const [ax, ay, az, aw] = normalized(a.rotation), [bx, by, bz, bw] = normalized(b.rotation);
  const rotation = normalized(quaternion([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ], 'composition.rotation'));
  const translated = rotate(rigidRotationMatrix(a.rotation), b.translation);
  return { translation: finiteVector(translated.map((coordinate, index) => coordinate + a.translation[index]) as Vec3,
    'composition.translation'), rotation };
}

export function inverseRigidPose(pose: RigidPose): RigidPose {
  const checked = validateRigidPose(pose), [x, y, z, w] = normalized(checked.rotation);
  const rotation: Quaternion = [-x, -y, -z, w];
  const shifted = rotate(rigidRotationMatrix(rotation), checked.translation);
  return { translation: finiteVector(shifted.map(coordinate => -coordinate) as Vec3, 'inverse.translation'), rotation };
}
