import type { Vec3 } from '../cad/kernel.types'

export type AssemblyTangentSide = 'positive' | 'negative'

/** Geometric side of the oriented plane, independent of endpoint order. */
export function assemblyTangentSideSign(side: AssemblyTangentSide): 1 | -1 {
  if (side !== 'positive' && side !== 'negative') throw new Error('Tangent side must be positive or negative.')
  return side === 'positive' ? 1 : -1
}

/** Support normals only: neither finite face contact nor material non-overlap. */
export function assemblyTangentSupportNormalRelation(side: AssemblyTangentSide, radialMaterialSense: 1 | -1): 'same' | 'opposed' {
  const sign = assemblyTangentSideSign(side)
  if (radialMaterialSense !== 1 && radialMaterialSense !== -1) throw new Error('Cylinder radial material sense must be +1 or -1.')
  return sign * radialMaterialSense === 1 ? 'opposed' : 'same'
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('Tangent support coordinates must be finite.')
  return value
}
function vector(value: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Tangent support needs three coordinates.')
  return [0, 1, 2].map(i => {
    const field = Object.getOwnPropertyDescriptor(value, String(i))
    if (!field || !('value' in field)) throw new Error('Tangent coordinates must be own data.')
    return finite(field.value)
  }) as Vec3
}
function projection(point: Vec3, direction: Vec3, lengthTolerance?: number): { point: Vec3; direction: Vec3; along: number } {
  const p = vector(point), raw = vector(direction), norm = Math.hypot(...raw)
  if (!(norm > 0) || !Number.isFinite(norm)) throw new RangeError('Tangent support direction is degenerate.')
  const a = raw.map(value => value / norm) as Vec3
  const along = finite(a[0] * p[0] + a[1] * p[1] + a[2] * p[2])
  if (lengthTolerance !== undefined) {
    const tolerance = finite(lengthTolerance)
    if (tolerance <= 0) throw new RangeError('Tangent point precision must be positive.')
    // Cartesian projections copy coordinates or subtract identical values.
    // Oblique distant parameter origins may lose the small geometric offset.
    const cartesian = a.some((value, i) => Math.abs(value) === 1 && a.every((other, j) => j === i || other === 0))
    if (!cartesian) {
      const magnitude = finite(a.reduce((sum, value, i) => sum + Math.abs(value * p[i]), 0))
      const error = Math.max(...a.map((value, i) => value === 0 ? 0 : 8 * Number.EPSILON * (Math.abs(p[i]) + Math.abs(value) * (Math.abs(along) + magnitude))))
      if (!Number.isFinite(error) || error > tolerance) throw new RangeError('Canonical tangent point exceeds the requested length precision.')
    }
  }
  return { point: p, direction: a, along }
}

/** Closest LOCAL cylinder-axis point to its component origin; no axis sign change. */
export function assemblyTangentAxisPoint(point: Vec3, axis: Vec3, lengthTolerance?: number): Vec3 {
  const value = projection(point, axis, lengthTolerance)
  return value.point.map((coordinate, i) => finite(coordinate - value.direction[i] * value.along)) as Vec3
}

/** Closest LOCAL plane point to its component origin; in-plane origins are arbitrary. */
export function assemblyTangentPlanePoint(point: Vec3, normal: Vec3, lengthTolerance?: number): Vec3 {
  const value = projection(point, normal, lengthTolerance)
  return value.direction.map(coordinate => finite(coordinate * value.along)) as Vec3
}
