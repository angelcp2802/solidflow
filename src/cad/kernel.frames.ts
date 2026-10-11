import type { Plane, PlaneFrame, Vec3 } from './kernel.types';

export const frameDot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const frameCross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const scale = (vector: Vec3, factor: number): Vec3 => vector.map((value) => value * factor) as Vec3;
function unit(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector);
  if (!vector.every(Number.isFinite) || length < 1e-12) throw new Error('La dirección del plano no es válida.');
  return scale(vector, 1 / length);
}

export function clonePlaneFrame(frame: PlaneFrame): PlaneFrame {
  return { origin: [...frame.origin], xDirection: [...frame.xDirection], normal: [...frame.normal] };
}

export function principalPlaneFrame(plane: Plane, offset = 0): PlaneFrame {
  if (!Number.isFinite(offset)) throw new Error('El desplazamiento del plano no es válido.');
  if (plane === 'XY') return { origin: [0, 0, offset], xDirection: [1, 0, 0], normal: [0, 0, 1] };
  if (plane === 'XZ') return { origin: [0, -offset, 0], xDirection: [1, 0, 0], normal: [0, -1, 0] };
  if (plane === 'YZ') return { origin: [offset, 0, 0], xDirection: [0, 1, 0], normal: [1, 0, 0] };
  throw new Error('Plano principal desconocido.');
}

export function offsetPlaneFrame(frame: PlaneFrame, offset: number, reversed = false): PlaneFrame {
  if (!Number.isFinite(offset)) throw new Error('El desplazamiento del plano no es válido.');
  return {
    origin: frame.origin.map((value, axis) => value + offset * frame.normal[axis]) as Vec3,
    xDirection: [...frame.xDirection],
    normal: scale(frame.normal, reversed ? -1 : 1),
  };
}

export const frameYDirection = (frame: PlaneFrame): Vec3 => frameCross(frame.normal, frame.xDirection);

export function framePoint(frame: PlaneFrame, u: number, v: number): Vec3 {
  const y = frameYDirection(frame);
  return frame.origin.map((value, axis) => value + frame.xDirection[axis] * u + y[axis] * v) as Vec3;
}

/** Outward normal; stable X from projected world X (world Y at X-normal faces). */
export function planarFaceFrame(pointOnPlane: Vec3, outwardNormal: Vec3): PlaneFrame {
  const normal = unit(outwardNormal);
  const project = (axis: Vec3): Vec3 => {
    const dot = frameDot(axis, normal);
    return axis.map((value, index) => value - dot * normal[index]) as Vec3;
  };
  let x = project([1, 0, 0]);
  if (Math.hypot(...x) < 1e-6) x = project([0, 1, 0]);
  // Project the world origin onto the infinite support plane, not the face centroid.
  return { origin: scale(normal, frameDot(pointOnPlane, normal)), xDirection: unit(x), normal };
}
