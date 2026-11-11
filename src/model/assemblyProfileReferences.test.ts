import { expect, it } from 'vitest'
import { validateAssemblyProfileFaceSelection, validateAssemblyProfileReferencePair } from './assemblyProfileReferences'

const selected = () => ({ component: { occurrencePath: ['owner'], definition: { id: 'part', revision: 'r0' } },
  body: { bodyId: 'body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'opaque-current-face' } })
it('validates two ordered face identities without inventing profile classification or authority', () => {
  const first = selected(), second = selected(); second.component.occurrencePath = ['other']
  const input = { first, second }, result = validateAssemblyProfileReferencePair(input)
  expect(result).toEqual(input); expect(result).not.toBe(input); expect(result.first).not.toBe(first)
  first.face.key = 'changed'; expect(result.first.face.key).toBe('opaque-current-face')
  expect(result.first).not.toHaveProperty('kind'); expect(result.first).not.toHaveProperty('support')
})
it('requires an explicit body/null and exact face/body source agreement', () => {
  const legacy = { ...selected(), body: null }; expect(validateAssemblyProfileFaceSelection(legacy)).toEqual(legacy)
  const mismatch = selected(); mismatch.body.sourceFeatureId = 'other'
  expect(() => validateAssemblyProfileFaceSelection(mismatch)).toThrow(/source/)
  const missing = { component: selected().component, face: selected().face }
  expect(() => validateAssemblyProfileFaceSelection(missing)).toThrow()
})
it('rejects inherited, executable, sparse, unknown and cross-purpose selections without invoking accessors', () => {
  let invoked = false
  const valid = selected(), bad = [
    { ...valid, kind: 'profile' }, { ...valid, support: 'plane' }, { ...valid, component: null },
    { ...valid, face: { ...valid.face, extra: true } },
    { ...valid, component: { ...valid.component, occurrencePath: [, 'owner'] } },
    Object.create(valid), Object.defineProperty({ ...valid }, 'face', { get() { invoked = true; return valid.face }, enumerable: true }),
    { ...valid, component: { ...valid.component, get occurrencePath() { invoked = true; return ['owner'] } } },
  ]
  for (const input of bad) expect(() => validateAssemblyProfileFaceSelection(input)).toThrow()
  expect(() => validateAssemblyProfileReferencePair({ first: valid, second: valid, alignment: 'aligned' })).toThrow()
  expect(() => validateAssemblyProfileReferencePair({ first: valid })).toThrow()
  expect(invoked).toBe(false)
})
