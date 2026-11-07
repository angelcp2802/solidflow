import { expect, it } from 'vitest'
import { currentHingePick, hingeTicketIsCurrent, liveHingeTicketIsCurrent, nextHingePick, renderedHingePick, type HingePickTicket } from './assemblyHingePicking'
const ticket: HingePickTicket = { signature: 'original', scope: '[]', generation: 4, sceneId: 'original-scene', family: 'hinge', epoch: 3, slot: 0, producer: 'face' }
it('rejects late callbacks after switching roles or replacing the rendered intent on the same scene', () => {
  expect(renderedHingePick(ticket, ticket, ticket, false)).toBe(true)
  const next = { ...ticket, slot: 1 as const }
  expect(currentHingePick(next, ticket, false)).toBe(true)
  expect(renderedHingePick(ticket, next, ticket, false)).toBe(false)
  expect(renderedHingePick(structuredClone(ticket), ticket, ticket, false)).toBe(false)
  expect(renderedHingePick(ticket, ticket, ticket, true)).toBe(false)
})
it('invalidates document, scope, scene, generation, family and edit epoch independently', () => {
  for (const change of [{ signature: 'other' }, { scope: '["sub"]' }, { sceneId: 'other' }, { generation: 5 }, { family: 'width' }, { epoch: 4 }, { sceneId: null }]) {
    expect(hingeTicketIsCurrent(ticket, { ...ticket, ...change })).toBe(false)
  }
  expect(currentHingePick({ ...ticket, slot: 2, producer: 'line-edge' }, ticket, false)).toBe(false)
})
it('advances only missing roles and switches from LINE axes to planar-face selection', () => {
  const selected = { kind: 'principal-plane', component: null, plane: 'XY' } as const
  expect(nextHingePick({ ...ticket, producer: 'line-edge' }, [selected, null, null, null])).toMatchObject({ slot: 1, producer: 'line-edge' })
  expect(nextHingePick({ ...ticket, slot: 1, producer: 'line-edge' }, [selected, selected, null, null])).toMatchObject({ slot: 2, producer: 'face' })
  expect(nextHingePick(ticket, [selected, selected, selected, selected])).toBeNull()
})
it('rejects mutable document and generation changes even before replacement callbacks have rendered', () => {
  const live = { mounted: true, signature: ticket.signature, generation: ticket.generation, scope: ticket.scope,
    sceneId: ticket.sceneId, confirmedSignature: ticket.signature, sceneSignature: ticket.signature }
  expect(liveHingeTicketIsCurrent(ticket, ticket, live)).toBe(true)
  for (const changed of [{ generation: 5 }, { signature: 'new-document' }, { scope: '["new"]' }, { sceneId: 'new-scene' },
    { mounted: false }, { confirmedSignature: null }, { sceneSignature: '' }]) {
    expect(liveHingeTicketIsCurrent(ticket, ticket, { ...live, ...changed })).toBe(false)
  }
  expect(liveHingeTicketIsCurrent(ticket, null, live)).toBe(false)
})
