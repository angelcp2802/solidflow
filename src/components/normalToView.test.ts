import { describe, expect, it } from 'vitest'
import { resolveNormalToView, validateNormalToTarget, type NormalToPlane, type NormalToTarget, type NormalToVector } from './normalToView'

// Original mathematical frames, independent of CAD fixtures or native data.
const front: NormalToPlane = { origin: [2, 3, 4], normal: [0, 0, 1], xDirection: [1, 0, 0] }
const oblique: NormalToPlane = { origin: [101, -73, 25], normal: [3 / 5, 0, 4 / 5], xDirection: [4 / 5, 0, -3 / 5] }
const resolve = (target: NormalToTarget, direction: NormalToVector = [1, 1, 1], up: NormalToVector = [0, 1, 0]) => resolveNormalToView(target, direction, up)
const near = (actual: readonly number[] | undefined, expected: readonly number[]) => {
  expect(actual).toHaveLength(expected.length)
  expected.forEach((value, index) => expect(Math.abs(actual![index] - value)).toBeLessThan(1e-12))
}

describe('selection-derived Normal To orientations', () => {
  it('uses the supplied normal and natural sketch Y, independent of camera roll or translation', () => {
    const target: NormalToTarget = { kind: 'plane', key: 'original-oblique', frame: oblique }
    const first = resolve(target), otherCamera = resolve(target, [-1, 0, 0], [0, 0, 1])
    near(first?.direction, [3 / 5, 0, 4 / 5]); near(first?.up, [0, 1, 0])
    expect(first).toEqual(otherCamera)
    near(resolve({ kind: 'plane', key: 'negative', frame: { ...front, normal: [0, 0, -1] } })?.up, [0, -1, 0])
  })

  it('projects the ordered second plane normal upward and changes the result when ordered supports swap', () => {
    const second: NormalToPlane = { origin: [-5, 17, 80], normal: [0, 3 / 5, 4 / 5], xDirection: [1, 0, 0] }
    const first = resolve({ kind: 'planes', key: 'A/B', first: oblique, second })
    near(first?.direction, [3 / 5, 0, 4 / 5])
    near(first?.up, [-16 / Math.sqrt(1025), 25 / Math.sqrt(1025), 12 / Math.sqrt(1025)])
    const swapped = resolve({ kind: 'planes', key: 'B/A', first: second, second: oblique })
    near(swapped?.direction, [0, 3 / 5, 4 / 5])
    near(swapped?.up, [25 / Math.sqrt(1025), -16 / Math.sqrt(1025), 12 / Math.sqrt(1025)])
    expect(swapped?.repeatKey).not.toEqual(first?.repeatKey)
  })

  it('uses an analytic surface axis and natural radial X, or a deterministic basis when absent', () => {
    const selected = resolve({ kind: 'axis', key: 'surface-axis', point: [9, 8, 7], direction: [3 / 5, 0, 4 / 5], xDirection: [4 / 5, 0, -3 / 5] })
    near(selected?.direction, [3 / 5, 0, 4 / 5]); near(selected?.up, [0, 1, 0])
    near(resolve({ kind: 'axis', key: 'surface-no-radial-frame', point: [0, 0, 0], direction: [0, 1, 0] })?.up, [0, 0, -1])
  })

  it.each([
    { kind: 'plane', key: '', frame: front },
    { kind: 'plane', key: 'bad', frame: { ...front, origin: [Infinity, 0, 0] } },
    { kind: 'plane', key: 'bad', frame: { ...front, normal: [0, 0, 0] } },
    { kind: 'plane', key: 'bad', frame: { ...front, normal: [0, 0, 2] } },
    { kind: 'plane', key: 'bad', frame: { ...front, xDirection: [0, 0, 1] } },
    { kind: 'plane', key: 'bad', frame: { ...front, xDirection: [1, NaN, 0] } },
    { kind: 'planes', key: 'parallel', first: front, second: front },
    { kind: 'planes', key: 'opposed', first: front, second: { ...front, normal: [0, 0, -1] } },
    { kind: 'axis', key: 'bad', point: [0, 0, 0], direction: [0, 0, 0] },
    { kind: 'axis', key: 'bad', point: [0, 0, 0], direction: [0, 1, 0], xDirection: [0, 1, 0] },
  ] satisfies NormalToTarget[])('rejects invalid or underdetermined frames without treating them as no selection: %j', target => {
    expect(resolve(target)).toBeNull(); expect(validateNormalToTarget(target)).toBe(false)
  })

  it('rejects malformed runtime values safely and does not retain or mutate target arrays', () => {
    for (const malformed of [null, undefined, { kind: 'unknown' }, { kind: 'plane', key: 'x' }, { kind: 'axis', key: 'x', point: [0, 0, 0], direction: [0, 1] }]) {
      expect(resolve(malformed as NormalToTarget)).toBeNull()
    }
    const target: NormalToTarget = structuredClone({ kind: 'plane', key: 'owned', frame: front })
    const original = structuredClone(target), result = resolve(target)!
    result.direction[2] = 99; result.up[0] = 99
    expect(target).toEqual(original); near(resolve(target)?.direction, [0, 0, 1])
    expect(resolve({ ...target, key: 'different-owner' })?.repeatKey).not.toEqual(resolve(target)?.repeatKey)
    expect(resolve({ ...target, frame: { ...front, origin: [2, 3, 5] } })?.repeatKey).not.toEqual(resolve(target)?.repeatKey)
  })
})

describe('Normal To with no selection', () => {
  it.each([
    [[0, 0, 1], [0, 1, 0]], [[0, 0, 1], [1, 0, 0]],
    [[0, 0, -1], [-1, 0, 0]], [[1, 0, 0], [0, 0, -1]],
    [[-1, 0, 0], [0, -1, 0]], [[0, 1, 0], [0, 0, 1]],
    [[0, -1, 0], [1, 0, 0]],
  ] satisfies [NormalToVector, NormalToVector][])('preserves both cardinal direction %j and roll %j', (direction, up) => {
    const result = resolve({ kind: 'none' }, direction, up)
    near(result?.direction, direction); near(result?.up, up); expect(result?.repeatKey).toBeNull()
  })

  it('uses the closest full orientation and deterministic ties rather than a default front roll', () => {
    // A 30-degree roll and 20-degree turn from the -X-up front orientation.
    const a = Math.PI / 6, b = Math.PI / 9
    const result = resolve({ kind: 'none' }, [Math.sin(b), 0, Math.cos(b)], [-Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b)])
    near(result?.direction, [0, 0, 1]); near(result?.up, [-1, 0, 0])
    const tied = resolve({ kind: 'none' })
    near(tied?.direction, [0, 0, 1]); near(tied?.up, [0, 1, 0])
    expect(resolve({ kind: 'none' }, [0, 0, 0])).toBeNull()
    expect(resolve({ kind: 'none' }, [0, 0, 1], [0, 0, 1])).toBeNull()
  })
})
