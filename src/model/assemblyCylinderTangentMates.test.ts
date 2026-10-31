import { expect, it } from 'vitest'
import { assemblyCylinderTangentSupportNormalRelation, assemblyCylinderTangentTarget, validateAssemblyCylinderTangentBranch,
  type AssemblyCylinderTangentBranch } from './assemblyCylinderTangentMates'

// Independent arithmetic and oriented-normal signs for infinite supports only.
const branches: AssemblyCylinderTangentBranch[] = [{ kind: 'external' }, { kind: 'internal', larger: 'first' }, { kind: 'internal', larger: 'second' }]
it.each(branches)('clones the exact branch intent $kind/$larger', branch => {
  const result = validateAssemblyCylinderTangentBranch(branch)
  expect(result).toEqual(branch); expect(result).not.toBe(branch)
})
it.each([null, [], {}, { kind: 'external', larger: 'first' }, { kind: 'internal' }, { kind: 'internal', larger: 'both' },
  { kind: 'external', side: 'positive' }, { kind: 'internal', larger: 'first', alignment: 'aligned' }])('rejects a malformed or inert branch %#', value => {
  expect(() => validateAssemblyCylinderTangentBranch(value)).toThrow()
})
it.each(['getter', 'symbol', 'nonenumerable', 'prototype'] as const)('rejects executable/nonplain branch data: %s', kind => {
  const value = { kind: 'external' }; let reads = 0
  if (kind === 'getter') Object.defineProperty(value, 'kind', { enumerable: true, get() { reads++; return 'external' } })
  else if (kind === 'symbol') Object.defineProperty(value, Symbol('hidden'), { enumerable: true, value: 1 })
  else if (kind === 'nonenumerable') Object.defineProperty(value, 'extra', { value: 1 })
  else Object.setPrototypeOf(value, { inherited: true })
  expect(() => validateAssemblyCylinderTangentBranch(value)).toThrow(); expect(reads).toBe(0)
})
it.each([
  { branch: branches[0], first: 2, second: 3, target: 5 },
  { branch: branches[0], first: 2, second: 2, target: 4 },
  { branch: branches[1], first: 5, second: 2, target: 3 },
  { branch: branches[2], first: 2, second: 5, target: 3 },
])('derives fresh radii without persisting a target %#', ({ branch, first, second, target }) => {
  expect(assemblyCylinderTangentTarget(branch, first, second, 1e-6)).toBe(target)
})
it.each([
  { branch: branches[1], first: 2, second: 3 }, { branch: branches[2], first: 3, second: 2 },
  { branch: branches[1], first: 2, second: 2 }, { branch: branches[2], first: 2, second: 2 },
])('rejects a wrong/equal internal radius order rather than taking abs or flipping roles %#', ({ branch, first, second }) => {
  expect(() => assemblyCylinderTangentTarget(branch, first, second)).toThrow('larger')
})
it.each([0, -1, NaN, Infinity])('rejects an invalid radius %s', radius => {
  expect(() => assemblyCylinderTangentTarget(branches[0], radius, 2)).toThrow()
})
it.each(['overflow', 'gap', 'precision', 'tolerance'] as const)('rejects unresolvable radius arithmetic: %s', fault => {
  if (fault === 'overflow') expect(() => assemblyCylinderTangentTarget(branches[0], Number.MAX_VALUE, Number.MAX_VALUE)).toThrow(RangeError)
  else if (fault === 'gap') expect(() => assemblyCylinderTangentTarget(branches[1], 1 + Number.EPSILON, 1)).toThrow(RangeError)
  else if (fault === 'precision') expect(() => assemblyCylinderTangentTarget(branches[0], 1e12, 2, 1e-6)).toThrow(RangeError)
  else expect(() => assemblyCylinderTangentTarget(branches[0], 2, 3, 0)).toThrow()
})
const normalCases = branches.flatMap(branch => ([1, -1] as const).flatMap(first => ([1, -1] as const).map(second => ({ branch, first, second }))))
it.each(normalCases)('reports oriented support normals for $branch.kind/$branch.larger eps=$first/$second', ({ branch, first, second }) => {
  // External radial generators point toward each other; internal generators
  // point in the same direction. Material senses multiply those directions.
  const expectedDot = (branch.kind === 'external' ? -1 : 1) * first * second
  expect(assemblyCylinderTangentSupportNormalRelation(branch, first, second)).toBe(expectedDot < 0 ? 'opposed' : 'same')
})
it('rejects a forged radial material sense without inventing a normal relation', () => {
  expect(() => assemblyCylinderTangentSupportNormalRelation(branches[0], 0 as never, 1)).toThrow()
})
