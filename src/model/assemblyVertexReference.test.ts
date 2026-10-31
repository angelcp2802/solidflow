import { expect, it } from 'vitest'
import { validateAssemblyGeometryReference, validateAssemblyVertexReference, type AssemblyVertexReference } from './assemblyDocument'
const fixture = (): AssemblyVertexReference => ({ kind: 'vertex', component: { occurrencePath: ['sub', 'part'], definition: { id: 'part', revision: 'r1' } },
  body: { bodyId: 'original-body', sourceFeatureId: 'extrude' }, vertex: { sourceFeatureId: 'extrude', key: 'vertex-v1|' + 'a'.repeat(64) }, support: 'point' })
it('round trips a detached exact vertex selection without widening directional references', () => {
  const input = fixture(), value = validateAssemblyVertexReference(JSON.parse(JSON.stringify(input)))
  expect(value).toEqual(input); expect(value.component.occurrencePath).not.toBe(input.component.occurrencePath)
  value.component.occurrencePath[0] = 'changed'; expect(input.component.occurrencePath[0]).toBe('sub')
  expect(() => validateAssemblyGeometryReference(input)).toThrow()
})
it('preserves explicit legacy aggregate null separately from missing body', () => {
  const input = { ...fixture(), body: null }; expect(validateAssemblyVertexReference(input)).toEqual(input)
  const { body: _body, ...missing } = fixture(); expect(() => validateAssemblyVertexReference(missing)).toThrow()
})
it('rejects wrong purpose, source scope, hidden data and sparse paths', () => {
  const base = fixture(), sparse = Array(2); sparse[1] = 'part'
  for (const bad of [{ ...base, kind: 'datum-point' }, { ...base, support: 'axis' }, { ...base, point: [0, 0, 0] },
    { ...base, body: { ...base.body, sourceFeatureId: 'other' } }, { ...base, vertex: { ...base.vertex, key: 'vertex-v1|broken' } },
    { ...base, component: { ...base.component, occurrencePath: sparse } }, { ...base, vertex: { ...base.vertex, sourceFeatureId: 'bad\n' } }]) expect(() => validateAssemblyVertexReference(bad)).toThrow()
  const hidden = fixture(); Object.defineProperty(hidden, 'extra', { value: true }); expect(() => validateAssemblyVertexReference(hidden)).toThrow()
})
it('does not invoke a reference accessor or serialize executable values', () => {
  let calls = 0; const input = fixture()
  Object.defineProperty(input, 'vertex', { enumerable: true, get() { calls++; return fixture().vertex } })
  expect(() => validateAssemblyVertexReference(input)).toThrow(); expect(calls).toBe(0)
  expect(() => validateAssemblyVertexReference({ ...fixture(), toJSON() { calls++; return fixture() } })).toThrow(); expect(calls).toBe(0)
})
