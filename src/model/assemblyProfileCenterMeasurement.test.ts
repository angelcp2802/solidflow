import { describe, expect, it } from 'vitest'
import { measureOrderedProfileCenters, type ProfileCenterObservation, type OrderedProfileCenterMeasurement } from './assemblyProfileCenterMeasurement'
import type { Vec3 } from '../cad/kernel.types'

const resolution = { lengthMm: 1e-6, angleRad: 1e-8 }
const observation = (centerMm: Vec3, normal: Vec3 = [0, 0, 1]): ProfileCenterObservation => ({ centerMm, normal })
function ok(a: ProfileCenterObservation, b: ProfileCenterObservation): OrderedProfileCenterMeasurement {
  const value = measureOrderedProfileCenters(a, b, resolution)
  expect(value.status).toBe('ok')
  if (value.status !== 'ok') throw Error('Expected resolved geometry')
  return value
}
const near = (a: number, b: number, tolerance = 1e-11) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
function vectorNear(a: Vec3, b: Vec3) { a.forEach((v, i) => near(v, b[i])) }

describe('ordered profile center measurements', () => {
  it('measures an independent 5-12-13 center triangle and both normal branches', () => {
    const value = ok(observation([1, 2, 3]), observation([4, 6, 15], [3 / 5, 0, 4 / 5]))
    vectorNear(value.deltaMm, [3, 4, 12]); near(value.centerDistanceMm, 13)
    near(value.axialMm, 12); vectorNear(value.transverseMm, [3, 4, 0]); near(value.transverseDistanceMm, 5)
    near(value.alignedAngleRad, Math.atan2(3, 4)); near(value.opposedAngleRad, Math.PI - Math.atan2(3, 4))
    expect(value).not.toHaveProperty('satisfied'); expect(value).not.toHaveProperty('roll')
  })
  it('uses the first normal when reversing nonparallel roles', () => {
    const value = ok(observation([4, 6, 15], [3 / 5, 0, 4 / 5]), observation([1, 2, 3]))
    vectorNear(value.deltaMm, [-3, -4, -12]); near(value.axialMm, -57 / 5)
    vectorNear(value.transverseMm, [96 / 25, -4, -72 / 25]); near(value.transverseDistanceMm, Math.sqrt(976) / 5)
  })
  it('keeps opposed normal sense independent of the signed offset', () => {
    const value = ok(observation([1, 2, 3]), observation([1, 2, 5], [0, 0, -1]))
    near(value.axialMm, 2); near(value.alignedAngleRad, Math.PI); near(value.opposedAngleRad, 0)
    const reversed = ok(observation([1, 2, 5], [0, 0, -1]), observation([1, 2, 3]))
    near(reversed.axialMm, 2); near(reversed.transverseDistanceMm, 0)
  })
  it.each([-1, 1])('measures signed rational-normal displacement %s without an offset policy', sign => {
    const n: Vec3 = [12 / 13, 5 / 13, 0]
    const value = ok(observation([1, 2, 3], n), observation([1 + sign * 24 / 13, 2 + sign * 10 / 13, 3], n))
    near(value.axialMm, sign * 2); near(value.centerDistanceMm, 2); near(value.transverseDistanceMm, 0)
  })
  it('retains scalar geometry under an independently prescribed proper coordinate permutation', () => {
    const a = observation([1, 2, 3]), b = observation([4, 6, 15], [3 / 5, 0, 4 / 5]), base = ok(a, b)
    // R(x,y,z)=(z,x,y), determinant +1. No production placement helper supplies this oracle.
    const movedA = observation([103, -49, 9], [1, 0, 0])
    const movedB = observation([115, -46, 13], [4 / 5, 3 / 5, 0]), moved = ok(movedA, movedB)
    near(moved.axialMm, base.axialMm); near(moved.centerDistanceMm, base.centerDistanceMm)
    near(moved.transverseDistanceMm, base.transverseDistanceMm); near(moved.alignedAngleRad, base.alignedAngleRad)
    vectorNear(moved.deltaMm, [12, 3, 4]); vectorNear(moved.transverseMm, [0, 3, 4])
  })
  it('resolves coincident centers and opposite normals without a synthetic roll direction', () => {
    const value = ok(observation([3, 4, 5]), observation([3, 4, 5], [0, 0, -1]))
    near(value.centerDistanceMm, 0); near(value.transverseDistanceMm, 0); near(value.axialMm, 0)
    near(value.alignedAngleRad, Math.PI); near(value.opposedAngleRad, 0)
  })
  it('reports a small resolved angle even when it exceeds the requested numerical resolution', () => {
    const angle = 1e-10, value = measureOrderedProfileCenters(observation([0, 0, 0], [1, 0, 0]),
      observation([0, 0, 0], [Math.cos(angle), Math.sin(angle), 0]), { lengthMm: 1e-6, angleRad: 1e-12 })
    expect(value.status).toBe('ok')
    if (value.status !== 'ok') throw Error('Expected resolved small angle')
    near(value.alignedAngleRad, angle, 1e-20)
    expect(value.alignedAngleRad).toBeGreaterThan(1e-12)
  })
  it('accounts for first-normal uncertainty over the actual center lever arm', () => {
    const a = { ...observation([0, 0, 0]), normalErrorRad: 1e-4 }, b = observation([0, 0, 1000])
    expect(measureOrderedProfileCenters(a, b, { lengthMm: .01, angleRad: .001 }).status).toBe('precisionLimit')
    const targetNormalError = measureOrderedProfileCenters(observation([0, 0, 0]), { ...b, normalErrorRad: 1e-4 }, { lengthMm: .01, angleRad: .001 })
    expect(targetNormalError.status).toBe('ok')
  })
  it('does not erase large-coordinate rounding when the centers cancel', () => {
    expect(measureOrderedProfileCenters(observation([1e15, 0, 0]), observation([1e15, 0, 2]), resolution).status).toBe('precisionLimit')
    const moved = ok(observation([1e6, 1e6, 1e6]), observation([1e6, 1e6, 1e6 + 2]))
    near(moved.axialMm, 2); expect(moved.precision.deltaMm).toBeGreaterThan(1e-8)
  })
  it('rejects input uncertainty beyond a requested resolution without widening it', () => {
    expect(measureOrderedProfileCenters({ ...observation([0, 0, 0]), centerErrorMm: 2e-6 }, observation([0, 0, 2]), resolution).status).toBe('precisionLimit')
    expect(measureOrderedProfileCenters({ ...observation([0, 0, 0]), normalErrorRad: 2e-8 }, observation([0, 0, 2]), resolution).status).toBe('precisionLimit')
  })
  it('diagnoses overflow, subnormal inputs and an unattainable arithmetic resolution', () => {
    expect(measureOrderedProfileCenters(observation([-Number.MAX_VALUE, 0, 0]), observation([Number.MAX_VALUE, 0, 0]), resolution).status).toBe('precisionLimit')
    expect(measureOrderedProfileCenters(observation([Number.MIN_VALUE, 0, 0]), observation([0, 0, 0]), resolution).status).toBe('precisionLimit')
    expect(measureOrderedProfileCenters(observation([0, 0, 0]), observation([0, 0, 0]), { lengthMm: 1e-6, angleRad: 1e-16 }).status).toBe('precisionLimit')
  })
  it('rejects malformed declarations and executable coordinates without invoking getters', () => {
    let invoked = false
    const malformed = [
      { centerMm: [0, 0, 0], normal: [0, 0, 2] },
      { centerMm: [0, 0, 0], normal: [0, 0, 0] },
      { centerMm: [0, NaN, 0], normal: [0, 0, 1] },
      { ...observation([0, 0, 0]), centerErrorMm: -1 },
      { ...observation([0, 0, 0]), normalErrorRad: Infinity },
      { ...observation([0, 0, 0]), unknown: true },
      Object.create(observation([0, 0, 0])),
      { get centerMm() { invoked = true; return [0, 0, 0] }, normal: [0, 0, 1] },
      { centerMm: [0, 0, 0], normal: Object.defineProperty([0, 0, 1], '0', { get() { invoked = true; return 0 } }) },
      { centerMm: [0, , 0], normal: [0, 0, 1] },
    ]
    for (const value of malformed) expect(() => measureOrderedProfileCenters(value as ProfileCenterObservation, observation([0, 0, 0]), resolution)).toThrow()
    expect(invoked).toBe(false)
    for (const value of [{ lengthMm: 0, angleRad: 1e-8 }, { lengthMm: 1e-6, angleRad: Math.PI }, { lengthMm: 1e-6, angleRad: NaN }]) {
      expect(() => measureOrderedProfileCenters(observation([0, 0, 0]), observation([0, 0, 0]), value)).toThrow()
    }
  })
})
