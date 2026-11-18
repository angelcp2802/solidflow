import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { evaluateHingeStopsGeometry, type AssemblyHingeStopsGeometryInput } from './assemblyHingeStopsGeometry'

// Original analytic unit directions; no native geometry or metrology is claimed.
const X: Vec3 = [1, 0, 0], Z: Vec3 = [0, 0, 1]
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => a.map(x => x / Math.hypot(...a)) as Vec3
const ray = (degrees: number): Vec3 => [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180), 0]
const circularDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const input = (overrides: Partial<AssemblyHingeStopsGeometryInput> = {}): AssemblyHingeStopsGeometryInput => ({
  first: [...X], second: ray(20), guide: [...Z], directionErrorsRad: [0, 0, 0], arc: { start: 330, sweep: 90 }, angleTolerance: 1e-8, ...overrides,
})
const near = (a: number, b: number, band = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(band)
// Independent scalar identity: normalization of projected rays cancels from
// atan2, leaving a triple product and the projected dot product.
function oracle(a0: Vec3, b0: Vec3, g0: Vec3): number {
  const a = unit(a0), b = unit(b0), g = unit(g0)
  return Math.atan2(dot(g, cross(a, b)), dot(a, b) - dot(a, g) * dot(b, g))
}
const oblique = (): AssemblyHingeStopsGeometryInput => input({ first: unit([2, -1, 3]), second: unit([-1, 4, 2]),
  guide: unit([1, 2, 5]), arc: { start: 0, sweep: 360 } })

describe('explicit hinge stop direction geometry', () => {
  it('measures an original oblique 240-degree azimuth rather than a principal angle', () => {
    const r = evaluateHingeStopsGeometry(input({ first: [.6, 0, .8], second: [-.3, -.3 * Math.sqrt(3), .8], arc: { start: 220, sweep: 40 } }))
    near(r.value.angleRadians, 4 * Math.PI / 3); near(r.projectionLengths.first, .6); near(r.projectionLengths.second, .6)
    near(r.value.marginsRadians.minimum, Math.PI / 9); near(r.value.marginsRadians.maximum, Math.PI / 9)
    expect(r.value.activity).toBe('interior'); expect(r.directionErrorRad).toBeGreaterThan(0)
  })
  it.each([{ theta: 330, activity: 'minimum' }, { theta: 350, activity: 'interior' }, { theta: 0, activity: 'interior' }, { theta: 60, activity: 'maximum' }])('retains the wrapped arc and inclusive $theta-degree nominal coordinate', ({ theta, activity }) => {
    const r = evaluateHingeStopsGeometry(input({ second: ray(theta) }))
    near(r.value.angleRadians, theta * Math.PI / 180); expect(r.value.activity).toBe(activity)
    expect(r.value.arcDegrees).toEqual({ start: 330, sweep: 90 })
  })
  it('distinguishes a zero-width stop from a complete circle while retaining valid directions', () => {
    const zero = evaluateHingeStopsGeometry(input({ second: [...X], arc: { start: 0, sweep: 0 } })),
      full = evaluateHingeStopsGeometry(input({ second: ray(180), arc: { start: 0, sweep: 360 } }))
    expect(zero.value.activity).toBe('both'); expect(zero.value.fullCircle).toBe(false)
    expect(full.value.fullCircle).toBe(true); expect(full.value.activity).toBe('interior'); near(full.value.angleRadians, Math.PI)
    expect(() => evaluateHingeStopsGeometry(input({ first: [...Z], arc: { start: 0, sweep: 360 } }))).toThrow()
  })
  it('keeps normal reversal distinct from operand/guide reversal and does not invent a zero', () => {
    near(evaluateHingeStopsGeometry(input({ second: ray(110), arc: { start: 0, sweep: 360 } })).value.angleRadians, 110 * Math.PI / 180)
    near(evaluateHingeStopsGeometry(input({ first: ray(20), second: X, arc: { start: 0, sweep: 360 } })).value.angleRadians, 340 * Math.PI / 180)
    near(evaluateHingeStopsGeometry(input({ guide: [0, 0, -1], arc: { start: 0, sweep: 360 } })).value.angleRadians, 340 * Math.PI / 180)
    near(evaluateHingeStopsGeometry(input({ second: ray(200), arc: { start: 0, sweep: 360 } })).value.angleRadians, 200 * Math.PI / 180)
  })
  it.each([2e-5, 7e-6])('matches all nine normalized ambient derivatives at independent step %s', step => {
    const q = oblique(), result = evaluateHingeStopsGeometry(q), names = ['first', 'second', 'guide'] as const
    for (const name of names) for (let column = 0; column < 3; column++) {
      const plus = structuredClone(q), minus = structuredClone(q)
      plus[name][column] += step; minus[name][column] -= step
      plus[name] = unit(plus[name]); minus[name] = unit(minus[name])
      const difference = circularDelta(oracle(plus.first, plus.second, plus.guide), oracle(minus.first, minus.second, minus.guide)) / (2 * step)
      near(result.gradients[name][column], difference, 4e-8)
    }
    expect(Math.hypot(...result.gradients.guide)).toBeGreaterThan(.1)
  })
  it('has zero nominal common-rotation derivative and transforms with an original proper 3D rotation', () => {
    // Rz(90)Rx(90) maps (x,y,z) to (z,x,y), independently of production transforms.
    const rotate = ([x, y, z]: Vec3): Vec3 => [z, x, y], q = oblique(), r = evaluateHingeStopsGeometry(q),
      s = evaluateHingeStopsGeometry({ ...q, first: rotate(q.first), second: rotate(q.second), guide: rotate(q.guide) })
    near(circularDelta(s.value.angleRadians, r.value.angleRadians), 0)
    const common = [0, 0, 0]
    for (const role of ['first', 'second', 'guide'] as const) {
      const d = cross(q[role], r.gradients[role]); d.forEach((v, i) => { common[i] += v })
      rotate(r.gradients[role]).forEach((v, i) => near(s.gradients[role][i], v))
      near(dot(q[role], r.gradients[role]), 0)
    }
    common.forEach(v => near(v, 0))
  })
  it('bounds simultaneous independently perturbed cones for all three original directions', () => {
    const q = oblique(); q.angleTolerance = 1e-2; q.directionErrorsRad = [2e-5, 3e-5, 1e-5]
    const r = evaluateHingeStopsGeometry(q)
    // Construct actual unit points on each cone using two explicit orthogonal
    // tangent directions and independently chosen signs, not derivative output.
    for (const phase of [0, Math.PI / 3, Math.PI / 2, 5 * Math.PI / 4]) for (const signs of [[1, 1, 1], [-1, 1, -1], [1, -1, -1], [-1, -1, 1]]) {
      const directions = (['first', 'second', 'guide'] as const).map((role, i) => {
        const v = q[role], t = unit(cross(v, X)), w = cross(v, t), e = signs[i] * q.directionErrorsRad[i]
        return v.map((x, j) => Math.cos(e) * x + Math.sin(e) * (Math.cos(phase) * t[j] + Math.sin(phase) * w[j])) as Vec3
      })
      expect(Math.abs(circularDelta(oracle(directions[0], directions[1], directions[2]), r.value.angleRadians))).toBeLessThanOrEqual(r.directionErrorRad)
    }
    for (let role = 0; role < 3; role++) {
      const one = oblique(); one.directionErrorsRad[role] = 1e-5; one.angleTolerance = 1e-2
      expect(evaluateHingeStopsGeometry(one).directionErrorRad).toBeGreaterThan(evaluateHingeStopsGeometry(oblique()).directionErrorRad)
    }
  })
  it('retains submitted norm defects instead of erasing them during normalization', () => {
    const exact = evaluateHingeStopsGeometry(input()), q = input({ first: [1 + 1e-10, 0, 0] }), result = evaluateHingeStopsGeometry(q)
    near(result.value.angleRadians, exact.value.angleRadians); expect(result.directionErrorRad).toBeGreaterThan(exact.directionErrorRad + 1e-10)
  })
  it('rejects exhausted direction cones and near-axis amplification without widening the band', () => {
    const small: Vec3 = [1e-4, 0, Math.sqrt(1 - 1e-8)]
    expect(evaluateHingeStopsGeometry(input({ first: small, angleTolerance: 1e-7 })).projectionLengths.first).toBeGreaterThan(0)
    expect(() => evaluateHingeStopsGeometry(input({ first: small, directionErrorsRad: [1e-10, 0, 0] }))).toThrow(/precision/)
    expect(() => evaluateHingeStopsGeometry(input({ directionErrorsRad: [0, 0, Math.PI] }))).toThrow(/unobservable/)
    expect(() => evaluateHingeStopsGeometry(input({ directionErrorsRad: [1e-8, 0, 0] }))).toThrow(/precision/)
    expect(() => evaluateHingeStopsGeometry(input({ angleTolerance: 1e-16 }))).toThrow()
  })
  it('rejects a cone crossing the chart cut even when its nominal phase is not an exact cut tie', () => {
    const theta = 7 * Math.PI / 6 - 5e-11, q = input({ second: [Math.cos(theta), Math.sin(theta), 0],
      arc: { start: 0, sweep: 60 }, directionErrorsRad: [1e-10, 0, 0] })
    expect(() => evaluateHingeStopsGeometry(q)).toThrow(/cut/)
    expect(evaluateHingeStopsGeometry({ ...q, arc: { start: 0, sweep: 360 } }).value.fullCircle).toBe(true)
  })
  it.each([
    { angleTolerance: 0 }, { angleTolerance: Infinity }, { angleTolerance: Math.PI },
    { directionErrorsRad: [-1, 0, 0] }, { directionErrorsRad: [0, NaN, 0] }, { directionErrorsRad: [0, 0] },
    { first: [0, 0, 0] }, { second: [2, 0, 0] }, { guide: [0, 0, Infinity] }, { arc: { start: 0, sweep: 361 } },
  ])('rejects malformed or nonfinite declarations %j', bad => {
    expect(() => evaluateHingeStopsGeometry({ ...input(), ...bad } as AssemblyHingeStopsGeometryInput)).toThrow()
  })
  it('rejects executable fields at every numeric boundary without invoking them and returns detached data', () => {
    let reads = 0
    for (const role of ['root', 'direction', 'errors', 'arc']) {
      const q = input(), target = role === 'root' ? q : role === 'direction' ? q.first : role === 'errors' ? q.directionErrorsRad : q.arc,
        key = role === 'root' ? 'angleTolerance' : role === 'arc' ? 'start' : '0'
      Object.defineProperty(target, key, { enumerable: true, get() { reads++; return 0 } })
      expect(() => evaluateHingeStopsGeometry(q)).toThrow()
    }
    expect(reads).toBe(0)
    const q = input(), before = structuredClone(q)
    Object.freeze(q.first); Object.freeze(q.second); Object.freeze(q.guide); Object.freeze(q.directionErrorsRad); Object.freeze(q.arc); Object.freeze(q)
    const r = evaluateHingeStopsGeometry(q); r.value.arcDegrees.start = 100; r.gradients.first[0] = 123
    expect(q).toEqual(before); expect(evaluateHingeStopsGeometry(q).value.arcDegrees.start).toBe(330)
    expect(() => evaluateHingeStopsGeometry({ ...input(), token: 'forged' } as AssemblyHingeStopsGeometryInput)).toThrow()
  })
})
