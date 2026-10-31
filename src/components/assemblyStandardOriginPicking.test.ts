import { expect, it } from 'vitest'
import { identityRigidPose } from '../model/rigidPose'
import { assemblyOriginReferenceKey, type AssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'
import { standardAssemblyOriginKinds, standardAssemblyOriginPick, type StandardAssemblyOriginPickTicket } from './assemblyStandardOriginPicking'

const component = { occurrencePath: ['nested', 'pin'], definition: { id: 'part', revision: 'r1' } }
const axis: AssemblyOriginReference = { kind: 'principal-axis', component, axis: 'Y' }
const plane: AssemblyOriginReference = { kind: 'principal-plane', component: null, plane: 'XZ' }
function display(reference: AssemblyOriginReference): AssemblyOriginDisplay {
  return { key: assemblyOriginReferenceKey(reference), label: 'Original UI datum fixture', reference, worldPose: identityRigidPose() }
}
function ticket(family: StandardAssemblyOriginPickTicket['family'] = 'parallel'): StandardAssemblyOriginPickTicket {
  return { signature: 'current-document', scope: '["reuse-b"]', generation: 4, sceneId: 'current-scene', family, slot: 1, armed: true, blocked: false }
}

it('declares only origins already supported by general relations, never material capture roles', () => {
  expect(standardAssemblyOriginKinds('concentric')).toEqual({ axes: true, planes: false })
  expect(standardAssemblyOriginKinds('distance')).toEqual({ axes: false, planes: true })
  expect(standardAssemblyOriginKinds('limit-angle')).toEqual({ axes: true, planes: true })
  expect(standardAssemblyOriginKinds('tangent')).toEqual({ axes: false, planes: true })
  for (const family of ['gear', 'screw', 'rack-pinion', 'hinge', 'circular-path', 'line-path', 'profile-center', 'limit-directed-angle', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const) {
    expect(standardAssemblyOriginKinds(family)).toEqual({ axes: false, planes: false })
  }
})

it('returns a detached current scoped reference for either active role without a native authority claim', () => {
  for (const slot of [0, 1] as const) {
    const intent = { ...ticket(), slot }, result = standardAssemblyOriginPick(structuredClone(axis), [display(axis)], intent, intent)
    expect(result).toEqual(axis)
    expect(result).not.toBe(axis)
    result!.component!.occurrencePath[0] = 'changed-copy'
    expect(axis.component!.occurrencePath).toEqual(['nested', 'pin'])
    expect(result).not.toHaveProperty('token')
  }
  const intent = ticket('distance')
  expect(standardAssemblyOriginPick(plane, [display(plane)], intent, intent)).toEqual({ kind: 'principal-plane', component: null, plane: 'XZ' })
})

it('rejects old callbacks, disarmed or blocked picks, absent scenes and missing or ambiguous current entries', () => {
  const intent = ticket(), displays = [display(axis)]
  expect(standardAssemblyOriginPick(axis, displays, intent, { ...intent })).toBeNull()
  expect(standardAssemblyOriginPick(axis, displays, intent, null)).toBeNull()
  for (const changed of [{ armed: false }, { blocked: true }, { sceneId: null }]) {
    const unavailable = { ...intent, ...changed }
    expect(standardAssemblyOriginPick(axis, displays, unavailable, unavailable)).toBeNull()
  }
  expect(standardAssemblyOriginPick(null, displays, intent, intent)).toBeNull()
  expect(standardAssemblyOriginPick(axis, [], intent, intent)).toBeNull()
  expect(standardAssemblyOriginPick(axis, [...displays, display(axis)], intent, intent)).toBeNull()
  for (const incoming of [
    { ...axis, component: { ...component, occurrencePath: ['another-use', 'pin'] } },
    { ...axis, component: { ...component, definition: { ...component.definition, revision: 'stale' } } },
    { ...axis, component: null },
  ]) expect(standardAssemblyOriginPick(incoming, displays, intent, intent)).toBeNull()
})

it('rejects a visible datum of the wrong purpose even when its identity is current', () => {
  for (const [family, reference] of [['concentric', plane], ['distance', axis], ['tangent', axis], ['gear', axis]] as const) {
    const intent = ticket(family)
    expect(standardAssemblyOriginPick(reference, [display(reference)], intent, intent)).toBeNull()
  }
})
