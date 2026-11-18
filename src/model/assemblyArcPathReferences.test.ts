import { expect, it } from 'vitest'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection } from './assemblyArcPathReferences'

// Original declaration-only locators. No opaque key asserts native incidence.
function original(body: AssemblyArcPathSelection['body'] = { bodyId: 'sector', sourceFeatureId: 'solid' }): AssemblyArcPathSelection {
  return { component: { occurrencePath: ['outer', 'path'], definition: { id: 'original-sector', revision: 'r1' } }, body,
    edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-circular-trim' },
    startVertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) } }
}
for (const legacy of [false, true]) it('retains detached exact arc/endpoint locators without a parameter sense, legacy=' + legacy, () => {
  const source = original(legacy ? null : undefined), parsed = validateAssemblyArcPathSelection(source)
  expect(parsed).toEqual(source); expect(parsed).not.toBe(source); expect(parsed.component).not.toBe(source.component)
  expect(parsed.component.occurrencePath).not.toBe(source.component.occurrencePath); expect(parsed.edge).not.toBe(source.edge); expect(parsed.startVertex).not.toBe(source.startVertex)
  source.component.occurrencePath[0] = 'other'; source.startVertex.key = 'changed'
  expect(parsed.component.occurrencePath).toEqual(['outer', 'path']); expect(parsed.startVertex.key).toBe('vertex-v1|' + 'a'.repeat(64))
})
it('rejects producer disagreement, incomplete/hybrid selections and extra sense', () => {
  const a = original(); a.startVertex.sourceFeatureId = 'other'; expect(() => validateAssemblyArcPathSelection(a)).toThrow()
  const b = original(); b.body!.sourceFeatureId = 'other'; expect(() => validateAssemblyArcPathSelection(b)).toThrow()
  const legacy = original(null); legacy.startVertex.sourceFeatureId = 'other'; expect(() => validateAssemblyArcPathSelection(legacy)).toThrow(/producer/)
  const { startVertex: _v, ...missing } = original(); expect(() => validateAssemblyArcPathSelection(missing)).toThrow()
  expect(() => validateAssemblyArcPathSelection({ ...original(), sense: 1 })).toThrow()
  expect(() => validateAssemblyArcPathSelection({ ...original(), support: 'circle' })).toThrow()
  expect(() => validateAssemblyArcPathSelection({ ...original(), startVertex: { ...original().startVertex, point: [5, -2, 4] } })).toThrow()
})
it('does not execute accessors at any declaration boundary', () => {
  let reads = 0
  for (const field of ['component', 'body', 'edge', 'startVertex'] as const) {
    const value = original(); Object.defineProperty(value, field, { enumerable: true, get() { reads++; return original()[field] } })
    expect(() => validateAssemblyArcPathSelection(value)).toThrow()
  }
  const nested = original(); Object.defineProperty(nested.startVertex, 'key', { enumerable: true, get() { reads++; return 'vertex-v1|' + 'a'.repeat(64) } })
  expect(() => validateAssemblyArcPathSelection(nested)).toThrow(); expect(reads).toBe(0)
})
it('preserves reused namespace and definition revision rather than merging identical topology keys', () => {
  const first = original(), second = original(); second.component.occurrencePath[0] = 'right'; second.component.definition.revision = 'r2'
  expect(validateAssemblyArcPathSelection(first).component).toEqual(first.component)
  expect(validateAssemblyArcPathSelection(second).component).toEqual(second.component)
  expect(validateAssemblyArcPathSelection(first)).not.toEqual(validateAssemblyArcPathSelection(second))
})
