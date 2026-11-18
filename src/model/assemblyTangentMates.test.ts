import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { assemblyTangentAxisPoint, assemblyTangentPlanePoint, assemblyTangentSideSign,
  assemblyTangentSupportNormalRelation } from './assemblyTangentMates'

// Original Cartesian/oblique coordinates; these supply no native face authority.
const near = (actual: Vec3, expected: Vec3) => actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(1e-12))
it.each(['positive', 'negative'] as const)('defines %s relative to the plane, without endpoint ordering', side => {
  expect(assemblyTangentSideSign(side)).toBe(side === 'positive' ? 1 : -1)
})
it.each([null, 'aligned', 1, true, undefined])('rejects an undeclared side %s', side => {
  expect(() => assemblyTangentSideSign(side as never)).toThrow('side')
})
it.each([
  { side: 'positive', sense: 1, expected: 'opposed' }, { side: 'positive', sense: -1, expected: 'same' },
  { side: 'negative', sense: 1, expected: 'same' }, { side: 'negative', sense: -1, expected: 'opposed' },
] as const)('reports geometric support normals for $side/$sense', ({ side, sense, expected }) => {
  // At the generator radial=-sigma*n, and material normal=sense*radial.
  expect(assemblyTangentSupportNormalRelation(side, sense)).toBe(expected)
})
it.each([0, 2, NaN, Infinity, true])('rejects unverified radial material sense %s', sense => {
  expect(() => assemblyTangentSupportNormalRelation('positive', sense as never)).toThrow('material sense')
})
it('removes arbitrary axial origins without canonicalizing the directed cylinder axis', () => {
  const point: Vec3 = [9, 5, 3], axis: Vec3 = [Math.SQRT1_2, Math.SQRT1_2, 0], before = [...point]
  near(assemblyTangentAxisPoint(point, axis, 1e-9), [2, -2, 3])
  near(assemblyTangentAxisPoint(point.map((v, i) => v + 100 * axis[i]) as Vec3, axis, 1e-9), [2, -2, 3])
  near(assemblyTangentAxisPoint(point, axis.map(v => -v) as Vec3, 1e-9), [2, -2, 3])
  expect(point).toEqual(before); expect(axis).toEqual([Math.SQRT1_2, Math.SQRT1_2, 0])
})
it('removes arbitrary in-plane origins for either oriented normal', () => {
  near(assemblyTangentPlanePoint([17, -23, 4], [0, 0, 1], 1e-9), [0, 0, 4])
  near(assemblyTangentPlanePoint([Number.MAX_VALUE, -Number.MAX_VALUE, 4], [0, 0, -1], 1e-9), [0, 0, 4])
})
it('retains exactly representable Cartesian offsets despite a huge axial parameter', () => {
  expect(assemblyTangentAxisPoint([2, 3, Number.MAX_VALUE], [0, 0, 2], 1e-9)).toEqual([2, 3, 0])
})
it.each([assemblyTangentAxisPoint, assemblyTangentPlanePoint])('rejects oblique cancellation rather than claiming a small precise origin %#', project => {
  expect(() => project([1e14, 1e14 + 2, 3], [1, 1, 0], 1e-8)).toThrow('precision')
})
it.each([0, -1, Infinity, NaN])('rejects invalid requested point precision %s', tolerance => {
  expect(() => assemblyTangentAxisPoint([0, 0, 0], [0, 0, 1], tolerance)).toThrow()
})
it.each([{ axis: [0, 0, 0] }, { axis: [Infinity, 0, 0] }, { axis: [NaN, 1, 0] }])('rejects unusable axis $axis', ({ axis }) => {
  expect(() => assemblyTangentAxisPoint([0, 0, 0], axis as Vec3)).toThrow()
})
it('rejects coordinate accessors before invoking them', () => {
  let reads = 0
  for (const project of [assemblyTangentAxisPoint, assemblyTangentPlanePoint]) {
    const point: Vec3 = [0, 0, 0], direction: Vec3 = [0, 0, 1]
    Object.defineProperty(point, '0', { get() { reads++; return 0 } })
    expect(() => project(point, direction)).toThrow('own data')
    Object.defineProperty(direction, '2', { get() { reads++; return 1 } })
    expect(() => project([0, 0, 0], direction)).toThrow('own data')
  }
  expect(reads).toBe(0)
})
