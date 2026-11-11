import { expect, it } from 'vitest'
import { validateAssemblyProfileCenterReferenceRequest } from './assemblyProfileCenterReferences'
const face = () => ({ component: { occurrencePath: ['a'], definition: { id: 'part', revision: 'r1' } }, body: { bodyId: 'body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'current-face' } })
const request = () => ({ first: { face: face(), axis: null }, second: { face: face(), axis: null }, alignment: 'aligned', offsetMm: 2, orientation: { mode: 'free' } })
it('copies an exact free request without granting geometric authority', () => {
  const input = request(), copy = validateAssemblyProfileCenterReferenceRequest(input)
  expect(copy).toEqual(input); input.first.face.face.key = 'changed'; expect(copy.first.face.face.key).toBe('current-face')
  expect(copy).not.toHaveProperty('proof')
})
it('requires explicit material edges and sense for both rectangular roles', () => {
  const input = request(), axis = { edge: { sourceFeatureId: 'solid', key: 'current-edge' }, sense: -1 }
  const rectangle = { ...input, first: { ...input.first, axis }, second: { ...input.second, axis }, orientation: { mode: 'rectangle', quarterTurns: 3 } }
  expect(validateAssemblyProfileCenterReferenceRequest(rectangle)).toEqual(rectangle)
  for (const bad of [{ ...rectangle, second: input.second }, { ...rectangle, orientation: { mode: 'rectangle', quarterTurns: 4 } },
    { ...rectangle, first: { ...rectangle.first, axis: { ...axis, sense: 0 } } },
    { ...rectangle, first: { ...rectangle.first, axis: { ...axis, edge: { ...axis.edge, sourceFeatureId: 'foreign' } } } },
    { ...input, first: rectangle.first }]) expect(() => validateAssemblyProfileCenterReferenceRequest(bad)).toThrow()
})
it('rejects all nested accessors, sparse paths and unknown fields without executing them', () => {
  let invoked = 0
  const input = request()
  const bad = [{ ...input, get alignment() { invoked++; return 'aligned' } },
    { ...input, orientation: { get mode() { invoked++; return 'free' } } },
    { ...input, first: { ...input.first, get face() { invoked++; return face() } } },
    { ...input, first: { face: { ...face(), component: { ...face().component, occurrencePath: [, 'a'] } }, axis: null } },
    { ...input, offsetMm: Infinity }, { ...input, extra: true }, { ...input, first: { ...input.first, extra: true } }]
  for (const value of bad) expect(() => validateAssemblyProfileCenterReferenceRequest(value)).toThrow()
  expect(invoked).toBe(0)
})
