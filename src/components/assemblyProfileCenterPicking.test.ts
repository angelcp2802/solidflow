import { expect, it } from 'vitest'
import { currentProfileCenterPick, profileCenterContextIsCurrent, type ProfileCenterPickContext, type ProfileCenterPickTicket } from './assemblyProfileCenterPicking'

function context(): ProfileCenterPickContext {
  return { phase: 'committed', owner: {}, document: {} as ProfileCenterPickContext['document'], preview: null, scene: {} as ProfileCenterPickContext['scene'],
    signature: 'original', candidateSignature: null, token: null, generation: 3, scope: '[]', scopeDefinition: '["original","r1"]', family: 'profile-center', session: {},
    inputs: { owner: {}, mode: 'free', selections: [null, null] }, editor: null }
}
it('keeps nomination committed-only and binds every native owner plus exact input/editor identity', () => {
  const c = context(), ticket: ProfileCenterPickTicket = { ...c, slot: 0, producer: 'face' }
  expect(currentProfileCenterPick(ticket, ticket, c, false)).toBe(true)
  for (const change of [{ owner: {} }, { document: { ...c.document } }, { scene: {} }, { signature: 'other' }, { generation: 4 },
    { scope: '["child"]' }, { scopeDefinition: '["original","r2"]' }, { family: 'gear' }, { session: {} }, { inputs: { ...c.inputs } }, { editor: 'saved' },
    { phase: 'preview', preview: {}, token: 'native' }]) expect(profileCenterContextIsCurrent(ticket, { ...c, ...change } as ProfileCenterPickContext)).toBe(false)
})
it('rejects old role callbacks after Cancel/rearm or same-byte document/scope/editor ABA', () => {
  const c = context(), old: ProfileCenterPickTicket = { ...c, slot: 0, producer: 'face' }
  expect(currentProfileCenterPick(old, null, c, false)).toBe(false)
  expect(currentProfileCenterPick(old, { ...old, slot: 1 }, c, false)).toBe(false)
  expect(currentProfileCenterPick(old, old, { ...c, document: { ...c.document } }, false)).toBe(false)
  expect(currentProfileCenterPick(old, old, { ...c, session: {} }, false)).toBe(false)
  expect(currentProfileCenterPick(old, old, { ...c, inputs: { ...c.inputs, owner: {} } }, false)).toBe(false)
  expect(currentProfileCenterPick(old, old, c, true)).toBe(false)
})
it('requires an explicitly selected rectangle face before its LINE role, without proving boundary incidence', () => {
  const c = context(), edge: ProfileCenterPickTicket = { ...c, slot: 0, producer: 'line-edge' }
  expect(currentProfileCenterPick(edge, edge, c, false)).toBe(false)
  const rectangle: ProfileCenterPickContext = { ...c, inputs: { ...c.inputs, mode: 'rectangle' } }, empty = { ...rectangle, slot: 0 as const, producer: 'line-edge' as const }
  expect(currentProfileCenterPick(empty, empty, rectangle, false)).toBe(false)
  const selected: ProfileCenterPickContext = { ...rectangle, inputs: { ...rectangle.inputs, selections: [{ face: {} as never, axis: null }, null] } }
  const ready = { ...selected, slot: 0 as const, producer: 'line-edge' as const }
  expect(currentProfileCenterPick(ready, ready, selected, false)).toBe(true)
  const invalid = { ...selected, slot: 2 as 0, producer: 'face' as const }
  expect(currentProfileCenterPick(invalid, invalid, selected, false)).toBe(false)
})
