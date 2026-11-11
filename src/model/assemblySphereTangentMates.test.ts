import { expect, it } from 'vitest'
import { assemblyPlaneSphereTangentSupportNormalRelation, assemblySphereTangentSupportNormalRelation,
  assemblySphereTangentTarget, validateAssemblySphereTangentBranch, type AssemblySphereTangentBranch } from './assemblySphereTangentMates'

const branches: { branch: AssemblySphereTangentBranch; first: number; second: number; target: number }[] = [
  { branch: { kind: 'external' }, first: 2, second: 3, target: 5 },
  { branch: { kind: 'internal', larger: 'first' }, first: 5, second: 2, target: 3 },
  { branch: { kind: 'internal', larger: 'second' }, first: 2, second: 5, target: 3 },
]
it.each(branches)('preserves declared $branch.kind/$branch.larger roles without cached geometry', ({ branch, first, second, target }) => {
  expect(validateAssemblySphereTangentBranch(branch)).toEqual(branch); expect(validateAssemblySphereTangentBranch(branch)).not.toBe(branch)
  expect(assemblySphereTangentTarget(branch, first, second, 1e-6)).toBe(target)
})
it.each([{}, { kind: 'internal' }, { kind: 'external', larger: 'first' }, { kind: 'internal', larger: 'auto' }, { kind: 'internal', larger: 'first', side: 1 }])(
  'rejects a malformed spherical branch %#', value => { expect(() => validateAssemblySphereTangentBranch(value)).toThrow() })
it('rejects executable/hidden branch fields without running a getter', () => {
  let reads = 0; const getter = Object.defineProperty({}, 'kind', { enumerable: true, get() { reads++; return 'external' } })
  expect(() => validateAssemblySphereTangentBranch(getter)).toThrow(); expect(reads).toBe(0)
  expect(() => validateAssemblySphereTangentBranch(Object.defineProperty({ kind: 'external' }, 'radius', { value: 2 }))).toThrow()
})
it.each(branches.flatMap(item => [1, -1].flatMap(first => [1, -1].map(second => ({ ...item, first: first as 1 | -1, second: second as 1 | -1 }))))) (
  'reports oriented support normals for $branch.kind/$branch.larger/$first/$second', ({ branch, first, second }) => {
    const product = (branch.kind === 'external' ? -1 : 1) * first * second
    expect(assemblySphereTangentSupportNormalRelation(branch, first, second)).toBe(product < 0 ? 'opposed' : 'same')
  })
it.each(['positive', 'negative'] as const)('reports PS %s normals for material outward/inward surfaces', side => {
  expect(assemblyPlaneSphereTangentSupportNormalRelation(side, 1)).toBe(side === 'positive' ? 'opposed' : 'same')
  expect(assemblyPlaneSphereTangentSupportNormalRelation(side, -1)).toBe(side === 'positive' ? 'same' : 'opposed')
})
it.each([0, -1, NaN, Infinity])('rejects a nonpositive/nonfinite sphere radius %s', radius => {
  expect(() => assemblySphereTangentTarget({ kind: 'external' }, radius, 2)).toThrow()
  expect(() => assemblySphereTangentTarget({ kind: 'external' }, 2, radius)).toThrow()
})
it.each(['order', 'equal', 'gap', 'overflow', 'precision'] as const)('rejects %s without auto-flipping radius roles', fault => {
  const branch: AssemblySphereTangentBranch = fault === 'overflow' || fault === 'precision' ? { kind: 'external' } : { kind: 'internal', larger: 'first' }
  const radii = fault === 'order' ? [2, 3] : fault === 'equal' ? [2, 2] : fault === 'gap' ? [1 + Number.EPSILON, 1] : fault === 'overflow' ? [Number.MAX_VALUE, Number.MAX_VALUE] : [1e12, 2]
  expect(() => assemblySphereTangentTarget(branch, radii[0], radii[1], 1e-6)).toThrow()
})
