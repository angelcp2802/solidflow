type Vector = readonly [number, number];
export interface ArcRadials {
  start: Vector;
  end: Vector;
}

const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Vector, b: Vector) => a[0] * b[1] - a[1] * b[0];
const delta = (a: Vector, b: Vector): Vector => [b[0] - a[0], b[1] - a[1]];
const at = (a: Vector, change: Vector, t: number): Vector => [
  a[0] + change[0] * t,
  a[1] + change[1] * t,
];

function minimumRadius(a: Vector, change: Vector): number {
  const squaredStep = dot(change, change);
  const t = squaredStep === 0
    ? 0
    : Math.max(0, Math.min(1, -dot(a, change) / squaredStep));
  return Math.hypot(...at(a, change, t));
}

/**
 * Preserves the continuous finite sweep during one affine Newton trial.
 * A zero cross product with positive dot product crosses the 0/2π seam;
 * negative dot product crosses π and is valid for either arc direction.
 * It does not classify the final arc as minor/major or store new metadata.
 */
export function arcStepPreservesWinding(
  before: ArcRadials,
  after: ArcRadials,
  radiusMinimum: number,
): boolean {
  const vectors = [before.start, before.end, after.start, after.end];
  if (
    !Number.isFinite(radiusMinimum) || radiusMinimum <= 0 ||
    vectors.some(vector => vector.some(value => !Number.isFinite(value)))
  ) return false;
  // Uniform normalization avoids overflow and makes this independent of units.
  const scale = Math.max(...vectors.flatMap(vector => vector.map(Math.abs)));
  if (scale === 0) return false;
  const normalized = vectors.map(vector => vector.map(value => value / scale) as [number, number]);
  const [u, v, nextU, nextV] = normalized;
  const du = delta(u, nextU), dv = delta(v, nextV);
  if (
    minimumRadius(u, du) < radiusMinimum / scale ||
    minimumRadius(v, dv) < radiusMinimum / scale
  ) return false;

  // cross(u+t*du, v+t*dv) = a*t² + b*t + c.
  let a = cross(du, dv), b = cross(du, v) + cross(u, dv), c = cross(u, v);
  const coefficientScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  if (coefficientScale === 0) {
    // Always collinear: the radial minimum above prevents a sign reversal.
    return dot(u, v) < 0;
  }
  a /= coefficientScale;
  b /= coefficientScale;
  c /= coefficientScale;
  let roots: number[];
  if (a === 0) {
    roots = b === 0 ? [] : [-c / b];
  } else {
    const discriminant = b * b - 4 * a * c;
    const roundoff = 32 * Number.EPSILON * (b * b + 4 * Math.abs(a * c));
    if (discriminant < -roundoff) return true;
    const sqrt = Math.sqrt(Math.max(0, discriminant));
    // q avoids cancellation for the root nearest zero. c/q recovers its mate.
    const q = -0.5 * (b + (b < 0 ? -sqrt : sqrt));
    roots = q === 0 ? [-b / (2 * a)] : [q / a, c / q];
  }
  return !roots.some(root => {
    if (!Number.isFinite(root) || root <= 0 || root > 1 + 64 * Number.EPSILON)
      return false;
    const t = Math.min(1, root);
    return dot(at(u, du, t), at(v, dv, t)) > 0;
  });
}
