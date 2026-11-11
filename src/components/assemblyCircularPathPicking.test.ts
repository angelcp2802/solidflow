import { nativeReferencePressIsCurrent, nativeReferencePressMatches } from './assemblyNativeReferencePicking'
import { expect, it } from 'vitest'
import { circularContextIsCurrent, circularPickProducer, circularRoleIsAvailable, currentCircularPick, type CircularPickContext, type CircularPickTicket, type CircularPickRole } from './assemblyCircularPathPicking'
import { currentMaterialArcPaths, materialArcKey, materialArcKeys } from './assemblyMaterialArcPicking'
import type { AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
const path = (endpoint: string): AssemblyArcPathSelection => ({ component: { occurrencePath: ['sector'], definition: { id: 'original', revision: 'r1' } }, body: { bodyId: 'body', sourceFeatureId: 'solid' }, edge: { key: 'edge-v1|original', sourceFeatureId: 'solid' }, startVertex: { key: endpoint, sourceFeatureId: 'solid' } })
function context(): CircularPickContext {
  return { phase: 'committed', owner: {}, document: {} as CircularPickContext['document'], preview: null, scene: {} as CircularPickContext['scene'], signature: 'original', candidateSignature: null, token: null, generation: 4, scope: '[]', scopeDefinition: '["original","r1"]', family: 'circular-path', session: {}, editor: null, pathChoices: [{ reference: path('first') }, { reference: path('second') }], inputs: { owner: {}, point: null, arcKey: null, path: null, guide: null, following: false, upEnabled: false } }
}
it('requires current native ownership and exact input/editor identity before accepting a nomination', () => {
  const c = context(), ticket: CircularPickTicket = { ...c, role: 'point', producer: 'vertex' }
  expect(currentCircularPick(ticket, ticket, c, false)).toBe(true)
  for (const change of [{ owner: {} }, { document: { ...c.document } }, { scene: {} }, { signature: 'other' }, { generation: 5 }, { scope: '["child"]' }, { scopeDefinition: '["original","r2"]' }, { family: 'line-path' }, { session: {} }, { inputs: { ...c.inputs } }, { editor: 'saved' }, { phase: 'preview', preview: {}, token: 'native' }]) expect(circularContextIsCurrent(ticket, { ...c, ...change } as CircularPickContext)).toBe(false)
})
it('leaves the compound path incomplete after the arc nomination, requiring both exact catalogue endpoints', () => {
  const c = context(), inputs = { ...c.inputs, arcKey: materialArcKey(c.pathChoices[0].reference) }
  expect(inputs.path).toBeNull(); expect(circularRoleIsAvailable('origin', inputs, c.pathChoices)).toBe(true)
  for (const choices of [[], [c.pathChoices[0]], [c.pathChoices[0], c.pathChoices[0]], [...c.pathChoices, c.pathChoices[0]]]) {
    expect(currentMaterialArcPaths(inputs.arcKey, choices)).toEqual([]); expect(materialArcKeys(choices)).toEqual([])
    expect(circularRoleIsAvailable('origin', inputs, choices)).toBe(false)
    const ticket: CircularPickTicket = { ...c, inputs, role: 'origin', producer: 'vertex' }
    expect(currentCircularPick(ticket, ticket, { ...c, inputs, pathChoices: choices }, false)).toBe(false)
  }
  const selected = currentMaterialArcPaths(inputs.arcKey, c.pathChoices)
  expect(selected.map(c => c.reference.startVertex.key)).toEqual(['first', 'second'])
  const foreign = path('third'); foreign.component.definition.revision = 'r2'
  expect(currentMaterialArcPaths(materialArcKey(foreign), c.pathChoices)).toEqual([])
})
it('keeps producers explicit and rejects stale callbacks after role/editor/scope/family ABA', () => {
  const c = context(), ticket: CircularPickTicket = { ...c, role: 'arc', producer: 'material-arc' }
  for (const [role, producer] of [['point', 'vertex'], ['arc', 'material-arc'], ['origin', 'vertex'], ['up', 'face']] as const) expect(circularPickProducer(role)).toBe(producer)
  expect(circularPickProducer('other' as CircularPickRole)).toBeNull()
  expect(currentCircularPick(ticket, ticket, c, false)).toBe(true)
  for (const latest of [null, { ...ticket }, { ...ticket, role: 'point' as const }]) expect(currentCircularPick(ticket, latest, c, false)).toBe(false)
  const wrong = { ...ticket, producer: 'vertex' as const }; expect(currentCircularPick(wrong, wrong, c, false)).toBe(false)
  expect(currentCircularPick(ticket, ticket, c, true)).toBe(false)
  for (const change of [{ session: {} }, { document: { ...c.document } }, { inputs: { ...c.inputs } }, { editor: 'saved' }]) expect(currentCircularPick(ticket, ticket, { ...c, ...change }, false)).toBe(false)
  expect(circularRoleIsAvailable('up', c.inputs, c.pathChoices)).toBe(false)
  expect(circularRoleIsAvailable('up', { ...c.inputs, upEnabled: true }, c.pathChoices)).toBe(true)
})

it('binds a held reference press to its exact role owner and scene through Cancel/rearm ABA', () => {
  const c = context(), owner = {}, frame = { owner, scene: c.scene, mode: 'vertex' }
  expect(nativeReferencePressIsCurrent(frame, owner, c.scene, 'vertex')).toBe(true)
  expect(nativeReferencePressIsCurrent(frame, {}, c.scene, 'vertex')).toBe(false)
  expect(nativeReferencePressIsCurrent(frame, null, c.scene, 'vertex')).toBe(false)
  expect(nativeReferencePressIsCurrent(frame, owner, { ...c.scene! }, 'vertex')).toBe(false)
  expect(nativeReferencePressIsCurrent(frame, owner, c.scene, 'edge')).toBe(false)
  expect(nativeReferencePressIsCurrent(frame, owner, c.scene, 'vertex', 5)).toBe(false)
  expect(nativeReferencePressIsCurrent(frame, owner, c.scene, 'vertex', undefined, 'material-arc')).toBe(false)
  expect(nativeReferencePressIsCurrent({ ...frame, scene: null }, owner, null, 'vertex')).toBe(false)
})

it('cannot transfer an unowned canvas or label down into a newly armed reference pick', () => {
  const c = context(), owner = {}, frame = { owner, scene: c.scene, mode: 'origin', revision: 2 }
  expect(nativeReferencePressMatches(null, undefined, c.scene, null, 2)).toBe(true)
  expect(nativeReferencePressMatches(null, owner, c.scene, 'origin', 2)).toBe(false)
  expect(nativeReferencePressMatches(frame, null, c.scene, 'origin', 2)).toBe(false)
  expect(nativeReferencePressMatches(frame, owner, c.scene, 'origin', 2)).toBe(true)
  expect(nativeReferencePressMatches(frame, {}, c.scene, 'origin', 2)).toBe(false)
})
