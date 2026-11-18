import { expect, it } from 'vitest'
import { currentMechanicalAxisPick, liveMechanicalAxisContextIsCurrent, mechanicalAxisContextIsCurrent,
  type MechanicalAxisContext, type MechanicalAxisLiveState, type MechanicalAxisPickTicket } from './assemblyMechanicalAxisPicking'

// UI ownership identities only; synthetic objects assert no native CAD admission.
function context(): MechanicalAxisContext {
  const preview = {}
  return { phase: 'preview', owner: preview, document: {} as MechanicalAxisContext['document'], preview, scene: {} as MechanicalAxisContext['scene'],
    signature: 'original bytes', candidateSignature: null, token: 'original-private-token', generation: 4,
    scope: '[]', scopeDefinition: '["original","r1"]', family: 'gear', session: {} }
}
const live = (c: MechanicalAxisContext): MechanicalAxisLiveState => ({ ...c, mounted: true, eligible: true })
it('accepts only the currently rendered role for both native mechanical families', () => {
  for (const family of ['gear', 'screw']) {
    const c = { ...context(), family }, ticket: MechanicalAxisPickTicket = { ...c, slot: 0 }
    expect(currentMechanicalAxisPick(ticket, ticket, c, false)).toBe(true)
    expect(liveMechanicalAxisContextIsCurrent(ticket, live(c))).toBe(true)
    const next = { ...c, slot: 1 as const }
    expect(currentMechanicalAxisPick(ticket, next, c, false)).toBe(false)
    expect(currentMechanicalAxisPick({ ...ticket }, ticket, c, false)).toBe(false)
    expect(currentMechanicalAxisPick(ticket, ticket, c, true)).toBe(false)
    const invalid: MechanicalAxisPickTicket = { ...c, slot: 2 as 0 }
    expect(currentMechanicalAxisPick(invalid, invalid, c, false)).toBe(false)
  }
})
it('rejects document, preview, scene, token, generation, scope, definition, family and Cancel-session changes independently', () => {
  const c = context()
  for (const change of [{ phase: 'committed' }, { owner: {} }, { owner: null }, { document: { ...c.document } }, { preview: {} }, { preview: null }, { scene: { ...c.scene } }, { scene: null },
    { token: 'other' }, { token: null }, { signature: 'other' }, { candidateSignature: 'other' }, { generation: 5 }, { scope: '["other"]' },
    { scopeDefinition: '["original","r2"]' }, { family: 'screw' }, { family: 'rack-pinion' }, { session: {} }]) {
    expect(mechanicalAxisContextIsCurrent(c, { ...c, ...change } as MechanicalAxisContext)).toBe(false)
  }
})
it('same-byte document and scope ABA or cancel/rearm cannot revive an old rendered callback', () => {
  const c = context(), old: MechanicalAxisPickTicket = { ...c, slot: 0 }
  const reopened = { ...c, document: { ...c.document } }, returnedScope = { ...c, session: {} }
  expect(currentMechanicalAxisPick(old, old, reopened, false)).toBe(false)
  expect(currentMechanicalAxisPick(old, old, returnedScope, false)).toBe(false)
  expect(currentMechanicalAxisPick(old, null, c, false)).toBe(false)
  const rearmed: MechanicalAxisPickTicket = { ...c, slot: 0 }
  expect(currentMechanicalAxisPick(old, rearmed, c, false)).toBe(false)
})
it('live mutable refs reject changes before React commits new callbacks, including source work and unmount', () => {
  const c = context(), state = live(c)
  for (const change of [{ mounted: false }, { eligible: false }, { phase: 'committed' as const }, { owner: {} }, { document: { ...c.document } }, { preview: {} }, { scene: null },
    { signature: 'changed' }, { candidateSignature: 'pending' }, { token: 'new token' }, { generation: 9 }, { scope: '["sub"]' }, { session: {} }]) {
    expect(liveMechanicalAxisContextIsCurrent(c, { ...state, ...change })).toBe(false)
  }
})
it('allows nomination from an exact committed native scene without a preview token or Apply authority', () => {
  const c: MechanicalAxisContext = { ...context(), phase: 'committed', owner: {}, preview: null, candidateSignature: null, token: null }
  const ticket: MechanicalAxisPickTicket = { ...c, slot: 1 }
  expect(currentMechanicalAxisPick(ticket, ticket, c, false)).toBe(true)
  expect(liveMechanicalAxisContextIsCurrent(ticket, live(c))).toBe(true)
  for (const bad of [{ ...c, token: 'not-a-build-capability' }, { ...c, preview: {} }, { ...c, candidateSignature: 'staged' }]) {
    const invalid: MechanicalAxisPickTicket = { ...bad, slot: 0 }
    expect(currentMechanicalAxisPick(invalid, invalid, bad, false)).toBe(false)
  }
})
