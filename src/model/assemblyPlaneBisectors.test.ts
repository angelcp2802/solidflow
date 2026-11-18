import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, transformRigidPoint } from './rigidPose'
import { compareOrderedPlaneBisectors, evaluateOrderedPlaneBisector, type PlaneBisectorSupport, type PlaneBisectorConditioning } from './assemblyPlaneBisectors'

// Original rational supports. These are numerical geometry tests, not saved mates or native fixtures.
const conditioning: PlaneBisectorConditioning = { originMm: [1, -2, 3], lengthScaleMm: 4, lengthToleranceMm: 1e-6, angleToleranceRad: 1e-8 }
const support = (ownerId: string | null, pointMm: Vec3, normal: Vec3): PlaneBisectorSupport => ({ ownerId, pointMm, normal })
function width(): [PlaneBisectorSupport, PlaneBisectorSupport] {
  return [support('a', [5, 0, 0], [3 / 5, 4 / 5, 0]), support('b', [-10, 0, 0], [-3 / 5, 4 / 5, 0])]
}
function tab(): [PlaneBisectorSupport, PlaneBisectorSupport] {
  return [support('c', [0, 13, 0], [0, 5 / 13, 12 / 13]), support('d', [0, -26, 0], [0, -5 / 13, 12 / 13])]
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-11): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => { expect(Number.isFinite(value)).toBe(true); expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(tolerance) })
}
function evaluated(pair: readonly [PlaneBisectorSupport, PlaneBisectorSupport], branch: 'sum' | 'difference' = 'sum', policy = conditioning) {
  const result = evaluateOrderedPlaneBisector(pair, branch, policy)
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') throw new Error(result.message)
  return result
}
function reversed(value: PlaneBisectorSupport): PlaneBisectorSupport {
  return { ...value, normal: value.normal.map(x => -x) as Vec3 }
}
function moved(value: PlaneBisectorSupport, owner: string, column: number, amount: number): PlaneBisectorSupport {
  if (value.ownerId !== owner) return structuredClone(value)
  const delta = Array(6).fill(0) as number[]; delta[column] = amount
  const pose = retractRigidBodyPose(identityRigidPose(), delta, conditioning.originMm, conditioning.lengthScaleMm)
  return { ...value, pointMm: transformRigidPoint(pose, value.pointMm), normal: transformRigidDirection(pose, value.normal) }
}

it('normalizes original rational plane equations with literal sum and difference oracles', () => {
  // In this conditioned frame a0=1, a1=41/20. No implementation helper supplies these oracles.
  const sum = evaluated(width()), difference = evaluated(width(), 'difference')
  near(sum.normal, [0, 1, 0]); near([sum.offset, sum.branchLength], [61 / 32, 8 / 5])
  near(difference.normal, [1, 0, 0]); near([difference.offset, difference.branchLength], [-7 / 8, 6 / 5])
  const second = evaluated(tab())
  near(second.normal, [0, 0, 1]); near([second.offset, second.branchLength], [41 / 32, 24 / 13])
})

it('retains ordered branches under swaps and independent plane-equation sign reversals', () => {
  for (const branch of ['sum', 'difference'] as const) {
    const pair = width(), original = evaluated(pair, branch), swapped = evaluated([pair[1], pair[0]], branch)
    const sign = branch === 'sum' ? 1 : -1
    near(swapped.normal, original.normal.map(x => sign * x)); near([swapped.offset], [sign * original.offset])
    const both = evaluated([reversed(pair[0]), reversed(pair[1])], branch)
    near(both.normal, original.normal.map(x => -x)); near([both.offset], [-original.offset])
    const otherBranch = branch === 'sum' ? 'difference' : 'sum'
    const secondFlip = evaluated([pair[0], reversed(pair[1])], otherBranch)
    near(secondFlip.normal, original.normal); near([secondFlip.offset], [original.offset])
    const firstFlip = evaluated([reversed(pair[0]), pair[1]], otherBranch)
    near(firstFlip.normal, original.normal.map(x => -x)); near([firstFlip.offset], [-original.offset])
  }
})

it('keeps the same plane when its parameter points move tangentially', () => {
  const original = evaluated(width()), pair = width()
  pair[0].pointMm = [9, -3, 7] // Add (4,-3,7), orthogonal to (3/5,4/5,0).
  pair[1].pointMm = [-6, 3, -5] // Add (4,3,-5), orthogonal to (-3/5,4/5,0).
  const shifted = evaluated(pair)
  near(shifted.normal, original.normal); near([shifted.offset], [original.offset])
})

it('transforms a plane equation under a common rigid gauge without treating its closest point as a material point', () => {
  const pair = width().map(value => ({ ...value,
    pointMm: [-value.pointMm[1] + 7, value.pointMm[0] - 11, value.pointMm[2] + 13] as Vec3,
    normal: [-value.normal[1], value.normal[0], value.normal[2]] as Vec3 })) as [PlaneBisectorSupport, PlaneBisectorSupport]
  // A literal quarter-turn about Z and translation (7,-11,13), with the original conditioning origin retained.
  const sum = evaluated(pair), difference = evaluated(pair, 'difference')
  near(sum.normal, [-1, 0, 0]); near([sum.offset], [-3 / 32])
  near(difference.normal, [0, 1, 0]); near([difference.offset], [-23 / 8])
  const changedOrigin = evaluated(pair, 'sum', { ...conditioning, originMm: [9, -10, 16] })
  near(changedOrigin.normal, [-1, 0, 0]); near([changedOrigin.offset], [61 / 32])
})

it('accumulates shared owners while retaining independent support derivatives and omitting fixed-frame columns', () => {
  const pair = width(); pair[1].ownerId = 'a'
  const result = evaluated(pair)
  expect(result.supports).toHaveLength(2); expect(result.owners).toHaveLength(1)
  expect(result.owners[0].ownerId).toBe('a')
  near(result.owners[0].offset, [0, 1, 0, 0, 0, 0])
  const expected: Vec3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 1], [0, 0, 0], [-1, 0, 0]]
  expected.forEach((column, index) => near(result.owners[0].normal[index], column))
  result.owners[0].normal.forEach((column, index) => near(column, column.map((_, axis) => result.supports[0].normal[index][axis] + result.supports[1].normal[index][axis])))
  near(result.owners[0].offset, result.supports[0].offset.map((x, i) => x + result.supports[1].offset[i]))
  pair[0].ownerId = null
  const oneFixed = evaluated(pair)
  expect(oneFixed.supports).toHaveLength(2); expect(oneFixed.owners.map(x => x.ownerId)).toEqual(['a'])
  oneFixed.owners[0].normal.forEach((column, index) => near(column, oneFixed.supports[1].normal[index]))
  near(oneFixed.owners[0].offset, oneFixed.supports[1].offset)
  pair[1].ownerId = null
  expect(evaluated(pair).owners).toEqual([])
})

for (const ids of [['a', 'b', 'c', 'd'], ['a', 'a', 'c', 'd'], ['a', 'b', 'a', 'b'], [null, 'b', 'c', 'd'], ['a', 'a', 'a', 'a']] as const) {
  it('matches left-retraction finite differences at two steps for four original supports owned by ' + JSON.stringify(ids), () => {
    const input = [...width(), ...tab()].map((value, i) => ({ ...value, ownerId: ids[i] }))
    const ownerIds = [...new Set(input.flatMap(value => value.ownerId === null ? [] : [value.ownerId]))]
    // Stacked bisector geometry is not a saved relation or an assumed solver residual.
    for (const branch of ['sum', 'difference'] as const) {
      const first = evaluated([input[0], input[1]], branch), second = evaluated([input[2], input[3]], branch)
      const values = (supports: PlaneBisectorSupport[]) => {
        const w = evaluated([supports[0], supports[1]], branch), t = evaluated([supports[2], supports[3]], branch)
        return [...w.normal, w.offset, ...t.normal, t.offset]
      }
      for (const h of [2e-6, 7e-7]) for (const owner of ownerIds) for (let column = 0; column < 6; column++) {
        const plus = values(input.map(value => moved(value, owner, column, h)))
        const minus = values(input.map(value => moved(value, owner, column, -h)))
        const blocks = [first, second].flatMap(result => {
          const derivative = result.owners.find(value => value.ownerId === owner)
          return derivative ? [...derivative.normal[column], derivative.offset[column]] : [0, 0, 0, 0]
        })
        blocks.forEach((actual, row) => {
          const expected = (plus[row] - minus[row]) / (2 * h)
          expect(Math.abs(actual - expected)).toBeLessThanOrEqual(3e-7 * Math.max(1, Math.abs(expected)))
        })
      }
    }
  })
}

it('rejects an undefined branch instead of silently choosing the other bisector', () => {
  const pair: [PlaneBisectorSupport, PlaneBisectorSupport] = [support('a', [-2, 0, 0], [-1, 0, 0]), support('b', [6, 0, 0], [1, 0, 0])]
  expect(evaluateOrderedPlaneBisector(pair, 'sum', conditioning).status).toBe('degenerate')
  const valid = evaluated(pair, 'difference')
  near(valid.normal, [-1, 0, 0]); near([valid.offset], [-1 / 4]) // x=2, relative to origin x=1, scale4.
  const same = [pair[1], { ...pair[1], pointMm: [10, 0, 0] as Vec3 }] as const
  expect(evaluateOrderedPlaneBisector(same, 'difference', conditioning).status).toBe('degenerate')
  expect(evaluateOrderedPlaneBisector([pair[1], pair[1]], 'difference', conditioning).status).toBe('degenerate')
})

it('reports unresolved branch precision separately from exact degeneracy', () => {
  const pair: [PlaneBisectorSupport, PlaneBisectorSupport] = [
    { ...support('a', [0, 0, 0], [1, 0, 0]), normalErrorRad: 1e-8 },
    { ...support('b', [1, 0, 0], [-1, 1e-10, 0]), normalErrorRad: 1e-8 },
  ]
  expect(evaluateOrderedPlaneBisector(pair, 'sum', conditioning).status).toBe('precisionLimit')
})

it('rejects nonfinite or nonunit supports without mutating caller data', () => {
  const pair = width(), before = structuredClone(pair)
  pair[0].normal = [2, 0, 0]
  expect(() => evaluateOrderedPlaneBisector(pair, 'sum', conditioning)).toThrow()
  pair[0] = { ...before[0], pointMm: [Number.POSITIVE_INFINITY, 0, 0] }
  expect(() => evaluateOrderedPlaneBisector(pair, 'sum', conditioning)).toThrow()
  const valid = width(), serialized = JSON.stringify(valid)
  evaluated(valid)
  expect(JSON.stringify(valid)).toBe(serialized)
})

function compared(input: PlaneBisectorSupport[], alignment: 1 | -1 = 1, frame: [number, number, number, number] = [0, 0, 0, 1]) {
  const result = compareOrderedPlaneBisectors([input[0], input[1]], 'sum', [input[2], input[3]], 'sum', alignment, frame, conditioning)
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') throw new Error(result.message)
  return result
}

it('compares two original rational bisectors using literal anchored residuals away from a solution', () => {
  // width b=y,h=61/32; tab b=z,h=41/32; anchor x0=(1,1/2,-3/4).
  const input = [...width(), ...tab()]
  const aligned = compared(input)
  near(aligned.normal, [0, -1, 1]); near([aligned.offset], [5 / 8])
  const opposed = compared(input, -1)
  near(opposed.normal, [0, 1, 1]); near([opposed.offset], [55 / 16])
})

it('keeps nonzero comparison residuals invariant under a common rigid gauge and includes frame and anchor variations', () => {
  const input = [...width(), ...tab()]
  const transformed = input.map(value => ({ ...value,
    pointMm: [-value.pointMm[1] + 7, value.pointMm[0] - 11, value.pointMm[2] + 13] as Vec3,
    normal: [-value.normal[1], value.normal[0], value.normal[2]] as Vec3 }))
  near(compared(transformed, 1, [0, 0, Math.SQRT1_2, Math.SQRT1_2]).normal, [0, -1, 1])
  near([compared(transformed, 1, [0, 0, Math.SQRT1_2, Math.SQRT1_2]).offset], [5 / 8])
  const common = compared(input.map(value => ({ ...value, ownerId: 'shared' })))
  expect(common.owners).toHaveLength(1)
  // A nonzero residual cannot acquire spurious rank from common rigid motion.
  common.owners[0].normal.forEach(column => near(column, [0, 0, 0]))
  near(common.owners[0].offset, [0, 0, 0, 0, 0, 0])
  expect(compared(input.map(value => ({ ...value, ownerId: null }))).owners).toEqual([])
})

for (const ids of [['a', 'b', 'c', 'd'], ['a', 'a', 'c', 'd'], ['a', 'b', 'a', 'b'], [null, 'b', 'c', 'd'], ['a', null, 'c', 'd'], ['a', 'a', 'a', 'a']] as const) {
  it('differentiates anchored comparison in all original owner columns ' + JSON.stringify(ids), () => {
    const input = [...width(), ...tab()].map((value, i) => ({ ...value, ownerId: ids[i] }))
    const ownerIds = [...new Set(input.flatMap(value => value.ownerId === null ? [] : [value.ownerId]))]
    for (const frameBase of [[0, 0, 0, 1] as [number, number, number, number], rotationExp([.23, -.31, .17])]) for (const alignment of [1, -1] as const) {
      const base = compared(input, alignment, frameBase)
      for (const h of [2e-6, 7e-7]) for (const owner of ownerIds) for (let column = 0; column < 6; column++) {
        const values = (step: number) => {
          const delta = Array(6).fill(0) as number[]; delta[column] = step
          const frame = input[0].ownerId === owner
            ? composeRigidPoses({ ...identityRigidPose(), rotation: retractRigidBodyPose(identityRigidPose(), delta, conditioning.originMm, conditioning.lengthScaleMm).rotation },
              { ...identityRigidPose(), rotation: frameBase }).rotation
            : frameBase
          const result = compared(input.map(value => moved(value, owner, column, step)), alignment, frame)
          return [...result.normal, result.offset]
        }
        const plus = values(h), minus = values(-h), derivative = base.owners.find(value => value.ownerId === owner)!
        const actual = [...derivative.normal[column], derivative.offset[column]]
        actual.forEach((value, row) => {
          const expected = (plus[row] - minus[row]) / (2 * h)
          expect(Math.abs(value - expected)).toBeLessThanOrEqual(4e-7 * Math.max(1, Math.abs(expected)))
        })
      }
    }
  })
}


it('retains six common rigid gauge directions for four distinct free owners both on and off the comparison solution', () => {
  const on = [...width(), support('c', [0, 45 / 8, 0], [4 / 5, 3 / 5, 0]), support('d', [0, 45 / 8, 0], [-4 / 5, 3 / 5, 0])]
  const off = [...width(), ...tab()]
  for (const [input, expected] of [[on, [0, 0, 0, 0]], [off, [0, -1, 1, 5 / 8]]] as const) {
    const base = compared([...input])
    expect(base.owners).toHaveLength(4)
    near([...base.normal, base.offset], expected)
    for (let column = 0; column < 6; column++) {
      const sum = [0, 0, 0, 0]
      for (const owner of base.owners) {
        owner.normal[column].forEach((value, row) => { sum[row] += value })
        sum[3] += owner.offset[column]
      }
      near(sum, [0, 0, 0, 0])
      for (const h of [2e-6, 7e-7]) {
        const delta = Array(6).fill(0) as number[]; delta[column] = h
        const frame = retractRigidBodyPose(identityRigidPose(), delta, conditioning.originMm, conditioning.lengthScaleMm).rotation
        const common = compared(input.map(value => moved(value, value.ownerId!, column, h)), 1, frame)
        near([...common.normal, common.offset], expected)
      }
    }
  }
})

it('rejects unrepresentable normalized length tolerances even when every plane offset is zero', () => {
  const pair: [PlaneBisectorSupport, PlaneBisectorSupport] = [support('a', [0, 0, 0], [1, 0, 0]), support('b', [0, 0, 0], [1, 0, 0])]
  for (const [lengthScaleMm, lengthToleranceMm] of [[1e308, Number.MIN_VALUE], [1e-308, 1e308]]) {
    const policy = { ...conditioning, originMm: [0, 0, 0] as Vec3, lengthScaleMm, lengthToleranceMm }
    expect(evaluateOrderedPlaneBisector(pair, 'sum', policy).status).toBe('precisionLimit')
  }
})

it('does not erase nonzero coordinate or point uncertainty through normalization underflow', () => {
  const zero = support('b', [0, 0, 0], [1, 0, 0])
  for (const lengthScaleMm of [1, 4]) {
    const tiny = support('a', [Number.MIN_VALUE, 0, 0], [1, 0, 0])
    expect(evaluateOrderedPlaneBisector([tiny, zero], 'sum', { ...conditioning, originMm: [0, 0, 0], lengthScaleMm }).status).toBe('precisionLimit')
  }
  const uncertain = { ...support('a', [0, 0, 0], [1, 0, 0]), pointErrorMm: 1e-300 }
  expect(evaluateOrderedPlaneBisector([uncertain, zero], 'sum', { ...conditioning, originMm: [0, 0, 0], lengthScaleMm: 1e100 }).status).toBe('precisionLimit')
})

it('budgets original input errors before cancellations of plane offsets', () => {
  const pair: [PlaneBisectorSupport, PlaneBisectorSupport] = [
    { ...support('a', [10, 0, 0], [1, 0, 0]), pointErrorMm: 1e-3 },
    { ...support('b', [-10, 0, 0], [1, 0, 0]), pointErrorMm: 1e-3 },
  ]
  expect(evaluateOrderedPlaneBisector(pair, 'sum', { ...conditioning, originMm: [0, 0, 0] }).status).toBe('precisionLimit')
  const large: [PlaneBisectorSupport, PlaneBisectorSupport] = [support('a', [1e15, 0, 0], [1, 0, 0]), support('b', [-1e15, 0, 0], [1, 0, 0])]
  expect(evaluateOrderedPlaneBisector(large, 'sum', { ...conditioning, originMm: [0, 0, 0] }).status).toBe('precisionLimit')
})

it('keeps accepted stressed support and repeated-owner derivative blocks finite', () => {
  const pair = width().map(value => ({ ...value, ownerId: 'shared', pointMm: value.pointMm.map(x => x * 1e120) as Vec3 })) as [PlaneBisectorSupport, PlaneBisectorSupport]
  const result = evaluated(pair, 'sum', { originMm: [1e120, -2e120, 3e120], lengthScaleMm: 4e120, lengthToleranceMm: 1e114, angleToleranceRad: 1e-8 })
  near(result.normal, [0, 1, 0]); near([result.offset], [61 / 32])
  for (const block of [...result.supports, ...result.owners]) {
    expect(block.offset.every(Number.isFinite)).toBe(true)
    expect(block.normal.every(column => column.every(Number.isFinite))).toBe(true)
  }
})
