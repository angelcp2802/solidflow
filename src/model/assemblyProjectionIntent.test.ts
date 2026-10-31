import { expect, it } from 'vitest'
import { validateAssemblyComponentDrag } from './assemblyProjectionIntent'
import { validateAssemblyMoveIntent } from './assemblyMovement'

const intent = () => ({ component: { occurrencePath: ['owner', 'child'], definition: { id: 'original-part', revision: 'r1' } },
  pose: { translation: [1, 2, 3], rotation: [0, 0, 0, 1] }, mode: 'translate' })
it.each(['translate', 'rotate'] as const)('detaches %s intent without supplying native authority', mode => {
  const input = { ...intent(), mode }, result = validateAssemblyComponentDrag(input)
  expect(result).toEqual(input); input.component.occurrencePath[0] = 'changed'; input.pose.translation[0] = 99
  expect(result.component.occurrencePath).toEqual(['owner', 'child']); expect(result.pose.translation).toEqual([1, 2, 3]); expect('token' in result).toBe(false)
})
it.each([undefined, null, [], {}, { ...intent(), mode: 'scale' }, { ...intent(), mode: '' }, { ...intent(), mode: false },
  { ...intent(), extra: 1 }, Object.assign(Object.create({}), intent()), { ...intent(), component: { ...intent().component, occurrencePath: [] } },
  { ...intent(), pose: { ...intent().pose, translation: [1, Infinity, 3] } }])('rejects malformed or undeclared pointer intent %#', input => {
  expect(() => validateAssemblyComponentDrag(input)).toThrow()
})
it.each(['component', 'pose', 'mode'] as const)('rejects the %s accessor without executing it', field => {
  let reads = 0; const input = Object.defineProperty(intent(), field, { enumerable: true, get() { reads++; throw Error('Must not execute') } })
  expect(() => validateAssemblyComponentDrag(input)).toThrow(); expect(reads).toBe(0)
})
it('keeps projection intent distinct from the strict movement boundary', () => {
  expect(() => validateAssemblyMoveIntent(intent())).toThrow()
  const input = intent(); Object.defineProperty(input, Symbol('extra'), { value: 1, enumerable: true })
  expect(() => validateAssemblyComponentDrag(input)).toThrow()
})
