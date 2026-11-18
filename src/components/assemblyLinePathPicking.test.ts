import { expect, it } from 'vitest'
import { currentLinePathPick, currentLinePathOriginEdge, linePathPickContextIsCurrent, linePathPickProducer, linePathRoleIsAvailable,
  type LinePathPickContext, type LinePathPickTicket, type LinePathPickRole } from './assemblyLinePathPicking'

// Synthetic UI ownership objects do not admit material or prove incidence.
function context(): LinePathPickContext {
  return { phase: 'committed', owner: {}, document: {} as LinePathPickContext['document'], preview: null, scene: {} as LinePathPickContext['scene'],
    signature: 'original', candidateSignature: null, token: null, generation: 4, scope: '[]', scopeDefinition: '["original","r1"]', family: 'line-path', session: {}, editor: null, edgeChoices: [],
    inputs: { owner: {}, point: null, edge: null, origin: null, guide: null, following: false, upEnabled: false } }
}
it('binds committed native scene/document/owner/session and exact live input/editor identity', () => {
  const c = context(), ticket: LinePathPickTicket = { ...c, role: 'point', producer: 'vertex' }
  expect(currentLinePathPick(ticket, ticket, c, false)).toBe(true)
  for (const change of [{ owner: {} }, { document: { ...c.document } }, { scene: {} }, { signature: 'other' }, { generation: 5 }, { scope: '["child"]' },
    { scopeDefinition: '["original","r2"]' }, { family: 'circular-path' }, { session: {} }, { inputs: { ...c.inputs } }, { editor: 'saved' },
    { phase: 'preview', preview: {}, token: 'native' }]) expect(linePathPickContextIsCurrent(ticket, { ...c, ...change } as LinePathPickContext)).toBe(false)
})
it('requires the declared producer and availability of each role without inferring a material endpoint', () => {
  const c = context()
  for (const [role, producer] of [['point', 'vertex'], ['edge', 'line-edge'], ['origin', 'vertex'], ['up', 'face']] as const) {
    expect(linePathPickProducer(role)).toBe(producer)
    expect(linePathRoleIsAvailable(role, c.inputs)).toBe(role === 'point' || role === 'edge')
  }
  const edge = {} as never, selected = { ...c, edgeChoices: [{ reference: edge }], inputs: { ...c.inputs, edge, upEnabled: true } }
  for (const role of ['origin', 'up'] as const) {
    const ticket = { ...selected, role, producer: linePathPickProducer(role)! }
    expect(currentLinePathPick(ticket, ticket, selected, false)).toBe(true)
    const wrong = { ...ticket, producer: 'line-edge' as const }
    expect(currentLinePathPick(wrong, wrong, selected, false)).toBe(false)
  }
  expect(linePathPickProducer('other' as LinePathPickRole)).toBe(null)
})
it('rejects a callback after role switch, Cancel/rearm and equal-byte document/editor/scope ABA', () => {
  const c = context(), old: LinePathPickTicket = { ...c, role: 'point', producer: 'vertex' }
  expect(currentLinePathPick(old, { ...old, role: 'origin' }, c, false)).toBe(false)
  expect(currentLinePathPick(old, null, c, false)).toBe(false)
  expect(currentLinePathPick(old, { ...old }, c, false)).toBe(false)
  expect(currentLinePathPick(old, old, { ...c, document: { ...c.document } }, false)).toBe(false)
  expect(currentLinePathPick(old, old, { ...c, session: {} }, false)).toBe(false)
  expect(currentLinePathPick(old, old, { ...c, inputs: { ...c.inputs, owner: {} } }, false)).toBe(false)
  expect(currentLinePathPick(old, old, c, true)).toBe(false)
})

it('requires exactly one current edge before arming or accepting an origin callback, including a retained lost edge', () => {
  const c = context(), edge = {} as never, inputs = { ...c.inputs, edge }, valid = { ...c, inputs, edgeChoices: [{ reference: edge }] }
  const ticket: LinePathPickTicket = { ...valid, role: 'origin', producer: 'vertex' }
  expect(currentLinePathOriginEdge(edge, valid.edgeChoices)).toBe(edge)
  expect(currentLinePathPick(ticket, ticket, valid, false)).toBe(true)
  for (const edgeChoices of [[], [{ reference: edge }, { reference: edge }]]) {
    expect(currentLinePathOriginEdge(edge, edgeChoices)).toBe(null)
    expect(linePathRoleIsAvailable('origin', inputs, edgeChoices)).toBe(false)
    expect(currentLinePathPick(ticket, ticket, { ...valid, edgeChoices }, false)).toBe(false)
  }
})
