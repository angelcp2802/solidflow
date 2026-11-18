import { expect, it } from 'vitest'
import { validateAssemblySymmetryReferenceSet } from './assemblySymmetryReferences'
const kinds = ['point', 'line', 'plane', 'sphere', 'cylinder'] as const
type Kind = typeof kinds[number]
function selected(kind: Kind, owner: string) {
  const common = { component: { occurrencePath: ['sub', owner], definition: { id: 'part', revision: 'r1' } }, body: { bodyId: 'body', sourceFeatureId: 'solid' } }
  if (kind === 'point') return { ...common, kind: 'vertex', vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) }, support: 'point' }
  if (kind === 'line') return { ...common, kind: 'edge', edge: { sourceFeatureId: 'solid', key: 'edge-v1|original' }, support: 'line' }
  return { ...common, kind: 'face', face: { sourceFeatureId: 'solid', key: 'face-v1|original' }, support: kind === 'plane' ? 'plane' : kind === 'sphere' ? 'sphere-surface' : 'cylinder-surface' }
}
function fixture(kind: Kind) { return { entityKind: kind, source: selected(kind, 'a'), target: selected(kind, 'b'), mirror: selected('plane', 'm'), alignment: kind === 'point' || kind === 'sphere' ? null : 'aligned' } }
for (const kind of kinds) it('round trips detached ' + kind + ' selections with all three original roles', () => {
  const input = fixture(kind), before = structuredClone(input), result = validateAssemblySymmetryReferenceSet(JSON.parse(JSON.stringify(input)))
  expect(result).toEqual(input); expect(input).toEqual(before)
  expect(result.source.component).not.toBe(input.source.component); expect(result.target.component).not.toBe(result.source.component)
  expect(result.mirror.component).not.toBe(result.source.component)
  if (result.source.component) result.source.component.occurrencePath[0] = 'changed'
  expect(input.source.component.occurrencePath[0]).toBe('sub')
  const shared = fixture(kind); shared.target = shared.source; expect(validateAssemblySymmetryReferenceSet(shared).target).toEqual(shared.source)
})
it('admits explicit axis line purpose and fixed-scope principal mirror without surface substitution', () => {
  const input = fixture('line'), axis = { ...selected('plane', 'a'), support: 'axis' }
  expect(validateAssemblySymmetryReferenceSet({ ...input, source: axis, alignment: 'opposed', mirror: { kind: 'principal-plane', component: null, plane: 'YZ' } }).entityKind).toBe('line')
  expect(() => validateAssemblySymmetryReferenceSet({ ...input, source: selected('cylinder', 'a') })).toThrow()
  expect(() => validateAssemblySymmetryReferenceSet({ ...fixture('cylinder'), source: axis })).toThrow()
})
it('rejects cross-family supports, wrong mirror purposes and absent/null alignment distinctions', () => {
  for (const kind of kinds) {
    const input = fixture(kind)
    expect(() => validateAssemblySymmetryReferenceSet({ ...input, target: selected(kind === 'point' ? 'sphere' : 'point', 'b') })).toThrow()
    expect(() => validateAssemblySymmetryReferenceSet({ ...input, mirror: selected('sphere', 'm') })).toThrow()
    const { alignment: _alignment, ...missing } = input; expect(() => validateAssemblySymmetryReferenceSet(missing)).toThrow()
    expect(() => validateAssemblySymmetryReferenceSet({ ...input, alignment: kind === 'point' || kind === 'sphere' ? 'aligned' : null })).toThrow()
  }
})
it('preserves explicit legacy null body and rejects missing or mismatched source bodies', () => {
  for (const kind of kinds) {
    const input = fixture(kind), { body: _body, ...missing } = input.source
    const parsed = validateAssemblySymmetryReferenceSet({ ...input, source: { ...input.source, body: null } }).source
    if (parsed.kind === 'principal-plane') throw new Error('Original material fixture unexpectedly became a principal datum')
    expect(parsed.body).toBeNull()
    expect(() => validateAssemblySymmetryReferenceSet({ ...input, source: missing })).toThrow()
    expect(() => validateAssemblySymmetryReferenceSet({ ...input, source: { ...input.source, body: { bodyId: 'body', sourceFeatureId: 'foreign' } } })).toThrow()
  }
})
it('rejects sparse paths, extra/hidden fields and executable data without invoking getters', () => {
  const input = fixture('point'), sparse = Array(2); sparse[1] = 'a'
  expect(() => validateAssemblySymmetryReferenceSet({ ...input, source: { ...input.source, component: { ...input.source.component, occurrencePath: sparse } } })).toThrow()
  expect(() => validateAssemblySymmetryReferenceSet({ ...input, first: input.source })).toThrow()
  const hidden = fixture('point'); Object.defineProperty(hidden, 'extra', { value: 1 }); expect(() => validateAssemblySymmetryReferenceSet(hidden)).toThrow()
  let calls = 0
  for (const key of ['entityKind', 'source', 'target', 'mirror', 'alignment']) {
    const getter = fixture('point'); Object.defineProperty(getter, key, { enumerable: true, get() { calls++; return input[key as keyof typeof input] } })
    expect(() => validateAssemblySymmetryReferenceSet(getter)).toThrow()
  }
  const nested = fixture('point'); Object.defineProperty(nested.source, 'vertex', { enumerable: true, get() { calls++; return {} } })
  expect(() => validateAssemblySymmetryReferenceSet(nested)).toThrow(); expect(calls).toBe(0)
})
