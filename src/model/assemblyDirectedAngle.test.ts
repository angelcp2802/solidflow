import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { measureDirectedAngle, validateAssemblyDirectedAngleRequest, type AssemblyDirectedAngleRequest } from './assemblyDirectedAngle'

// Original unit vectors and analytical rotations. These are numeric tests, not native CAD evidence.
const x: Vec3 = [1, 0, 0], z: Vec3 = [0, 0, 1], tau = 2 * Math.PI
const ray = (degrees: number): Vec3 => [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180), 0]
const circularError = (actual: number, expected: number) => Math.abs(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)))
const near = (actual: number, expected: number, tolerance = 1e-12) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const request = (): AssemblyDirectedAngleRequest => ({ scopePath: [], first: { kind: 'principal-plane', component: null, plane: 'YZ' },
  second: { kind: 'principal-plane', component: { occurrencePath: ['moving'], definition: { id: 'part', revision: 'r1' } }, plane: 'YZ' },
  guide: { kind: 'principal-plane', component: null, plane: 'XY' } })

describe('directed circular measurement', () => {
  it.each([0, 10, 90, 120, 180, 200, 240, 270, 350, 359.999])('measures the original XY ray at %s degrees', degrees => {
    const result = measureDirectedAngle(x, ray(degrees), z)
    near(result.angleRadians, degrees * Math.PI / 180)
    expect(result.angleRadians).toBeGreaterThanOrEqual(0); expect(result.angleRadians).toBeLessThan(tau)
    near(result.projectionLengths.first, 1); near(result.projectionLengths.second, 1)
  })
  it('distinguishes an oblique projected 240 degrees from its smaller principal angle', () => {
    const a: Vec3 = [.6, 0, .8], b: Vec3 = [-.3, -.3 * Math.sqrt(3), .8], measured = measureDirectedAngle(a, b, z)
    near(measured.angleRadians, 4 * Math.PI / 3); near(measured.projectionLengths.first, .6); near(measured.projectionLengths.second, .6)
    expect(Math.abs(measured.angleRadians - Math.acos(.46))).toBeGreaterThan(3)
  })
  it('reverses direction when the endpoints or guide are reversed', () => {
    near(measureDirectedAngle(ray(240), x, z).angleRadians, 2 * Math.PI / 3)
    near(measureDirectedAngle(x, ray(240), [0, 0, -1]).angleRadians, 2 * Math.PI / 3)
    near(measureDirectedAngle([-1, 0, 0], ray(60), z).angleRadians, 4 * Math.PI / 3)
  })
  it('depends on the actual guide and distinguishes non-coplanar projections', () => {
    const b: Vec3 = [0, .6, .8]
    near(measureDirectedAngle(x, b, z).angleRadians, Math.PI / 2)
    near(measureDirectedAngle(x, b, [0, 1, 0]).angleRadians, 3 * Math.PI / 2)
  })
  it('is equivariant under an original noncommuting common rotation', () => {
    // Ry(30) Rx(45), written independently as a literal matrix.
    const rotate = ([a, b, c]: Vec3): Vec3 => [Math.sqrt(3) * a / 2 + (b + c) / Math.sqrt(8),
      (b - c) / Math.sqrt(2), -a / 2 + Math.sqrt(3 / 8) * (b + c)]
    near(measureDirectedAngle(rotate(x), rotate(ray(240)), rotate(z)).angleRadians, 4 * Math.PI / 3)
  })
  it('crosses zero circularly without retaining a turn count', () => {
    near(measureDirectedAngle(ray(350), ray(10), z).angleRadians, Math.PI / 9)
    near(measureDirectedAngle(x, ray(450), z).angleRadians, Math.PI / 2)
    expect(circularError(measureDirectedAngle(x, [1, -Number.EPSILON / 4, 0], z).angleRadians, 0)).toBeLessThan(1e-14)
    expect(Object.is(measureDirectedAngle(x, [1, -0, 0], z).angleRadians, -0)).toBe(false)
  })
  it.each([z, [0, 0, -1] as Vec3, [1e-10, 0, 1] as Vec3].map(direction => ({ direction })))('rejects an unobservable or ill-conditioned azimuth %j', ({ direction }) => {
    expect(() => measureDirectedAngle(direction, x, z)).toThrow()
    expect(() => measureDirectedAngle(x, direction, z)).toThrow()
  })
  it('admits an independently resolvable small projection without using its principal angle', () => {
    const small: Vec3 = [1e-4, 0, Math.sqrt(1 - 1e-8)]
    near(measureDirectedAngle(small, [0, 1, 0], z).angleRadians, Math.PI / 2)
  })
  it.each([0, -1, NaN, Infinity, Math.PI, 1e-16])('rejects unusable angular precision %s', tolerance => {
    expect(() => measureDirectedAngle(x, ray(90), z, tolerance)).toThrow()
  })
  it.each([[0, 0, 0], [2, 0, 0], [NaN, 0, 0], [Infinity, 0, 0], [1, 0]].map(bad => ({ bad })))('rejects invalid directions %j', ({ bad }) => {
    for (const slot of [0, 1, 2]) {
      const directions: Vec3[] = [x, ray(90), z]; directions[slot] = bad as Vec3
      expect(() => measureDirectedAngle(directions[0], directions[1], directions[2])).toThrow()
    }
  })
  it('does not invoke vector getters and does not mutate or alias inputs', () => {
    let reads = 0; const getter: Vec3 = [1, 0, 0]
    Object.defineProperty(getter, '0', { enumerable: true, get() { reads++; return 1 } })
    expect(() => measureDirectedAngle(getter, ray(90), z)).toThrow(); expect(reads).toBe(0)
    const first = Object.freeze([...x]) as Vec3, result = measureDirectedAngle(first, Object.freeze(ray(90)) as Vec3, Object.freeze([...z]) as Vec3)
    result.projectionLengths.first = 42
    expect(first).toEqual(x); expect(measureDirectedAngle(x, ray(90), z).projectionLengths.first).toBe(1)
  })
})

describe('directed measurement request boundary', () => {
  it('copies the complete scoped references and rejects extra authority fields', () => {
    const source = request(); source.scopePath = ['left', 'nested']; const copy = validateAssemblyDirectedAngleRequest(source)
    expect(copy).toEqual(source); copy.scopePath[0] = 'right'; copy.second.component!.occurrencePath[0] = 'changed'
    expect(source.scopePath).toEqual(['left', 'nested']); expect(source.second.component!.occurrencePath).toEqual(['moving'])
    expect(() => validateAssemblyDirectedAngleRequest({ ...source, token: 'forged' })).toThrow()
    expect(() => validateAssemblyDirectedAngleRequest({ ...source, angleDegrees: 240 })).toThrow()
  })
  it('rejects malformed roots, scopes, missing guide and incompatible support intent', () => {
    for (const value of [null, [], Object.create(request()), { ...request(), guide: undefined }, { ...request(), scopePath: [''] },
      { ...request(), scopePath: new Array(1) }, { ...request(), first: { kind: 'sphere-surface' } }]) expect(() => validateAssemblyDirectedAngleRequest(value)).toThrow()
  })
  it('rejects executable root, nested-reference and scope fields without invoking them', () => {
    let reads = 0
    const root = request(); Object.defineProperty(root, 'guide', { enumerable: true, get() { reads++; return request().guide } })
    const nested = request(); Object.defineProperty(nested.first, 'plane', { enumerable: true, get() { reads++; return 'XY' } })
    const scope = request(); scope.scopePath = ['left']; Object.defineProperty(scope.scopePath, '0', { enumerable: true, get() { reads++; return 'left' } })
    for (const bad of [root, nested, scope]) expect(() => validateAssemblyDirectedAngleRequest(bad)).toThrow()
    expect(reads).toBe(0)
  })
})
