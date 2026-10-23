import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssemblyScene, AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import { identityRigidPose } from '../model/rigidPose'
import { configuredComponentPick, configuredMatePickChoice } from './configuredAssemblyPicking'
import ConfiguredAssemblyMatePanel, { configuredMateUiDraft, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'

// Original symbolic display catalog: tests nomination, not native geometry.
function fixture() {
  const component = { occurrencePath: ['group', 'part'], definition: { id: 'part', revision: 'r1' } }
  const face: AssemblySceneFace = { selection: { component, body: null, face: { sourceFeatureId: 'extrude', key: 'face-1' } }, support: null, worldSupport: null, vertices: [], triangles: [] }
  const edge: AssemblySceneEdge = { selection: { component, body: null, edge: { sourceFeatureId: 'extrude', key: 'edge-1' } }, support: null, worldSupport: null, lines: [] }
  const bounds = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] }
  const scene: AssemblyScene = { kind: 'assembly-scene', sceneId: 'symbolic-display', bodies: [{ component, body: null, name: 'Part', visible: true, worldPose: identityRigidPose(), vertices: [], normals: [], triangles: [], edgeLines: [], faces: [face], edges: [edge], volume: 0, area: 0, solidCount: 0, bounds }], volume: 0, area: 0, solidCount: 0, prototypeCount: 0, bounds, visibleBounds: bounds, warnings: [] }
  const local = { ...component, occurrencePath: ['part'] }
  const references: ConfiguredMateUiChoice['reference'][] = [
    { kind: 'face', component: local, body: null, face: face.selection.face, support: 'plane' },
    { kind: 'edge', component: local, body: null, edge: edge.selection.edge, support: 'line' },
  ]
  const choices = references.map(reference => ({ key: JSON.stringify(reference), label: reference.kind, reference }))
  return { component, face, edge, scene, choices }
}

it('selects the immediate scope owner of a current visible nested component, rejecting stale and outside hits', () => {
  const { scene, component } = fixture()
  expect(configuredComponentPick(scene, component, [])).toBe('group')
  expect(configuredComponentPick(scene, component, ['group'])).toBe('part')
  expect(configuredComponentPick(scene, component, ['other'])).toBeNull()
  expect(configuredComponentPick(scene, { ...component, definition: { ...component.definition, revision: 'r2' } }, [])).toBeNull()
  scene.bodies[0].visible = false
  expect(configuredComponentPick(scene, component, [])).toBeNull()
})

it('nominates explicit face and LINE roles from the current scoped choices and returns detached references', () => {
  const { scene, face, edge, choices } = fixture(), draft = configuredMateUiDraft('mate')
  expect(configuredMatePickChoice(scene, ['group'], draft, choices, { slot: 0, kind: 'face' }, face)).toEqual(choices[0])
  expect(configuredMatePickChoice(scene, ['group'], draft, choices, { slot: 1, kind: 'edge' }, edge)).toBeNull()
  draft.type = 'parallel'
  const result = configuredMatePickChoice(scene, ['group'], draft, choices, { slot: 1, kind: 'edge' }, edge)!
  expect(result).toEqual(choices[1]); result.reference.component!.occurrencePath[0] = 'changed'
  expect(choices[1].reference.component!.occurrencePath).toEqual(['part'])
  expect(configuredMatePickChoice(scene, [], draft, choices, { slot: 0, kind: 'face' }, face)).toBeNull()
  expect(configuredMatePickChoice(scene, ['group'], draft, choices, { slot: 2, kind: 'face' }, face)).toBeNull()
})

it('rejects missing, ambiguous, hidden and stale reference nominations', () => {
  const { scene, face, choices } = fixture(), draft = configuredMateUiDraft('mate'), pick = { slot: 0, kind: 'face' } as const
  expect(configuredMatePickChoice(scene, ['group'], draft, [], pick, face)).toBeNull()
  expect(configuredMatePickChoice(scene, ['group'], draft, [...choices, choices[0]], pick, face)).toBeNull()
  const stale = structuredClone(face); stale.selection.component.definition.revision = 'r2'
  expect(configuredMatePickChoice(scene, ['group'], draft, choices, pick, stale)).toBeNull()
  scene.bodies[0].faces.push(face)
  expect(configuredMatePickChoice(scene, ['group'], draft, choices, pick, face)).toBeNull()
  scene.bodies[0].faces.pop(); scene.bodies[0].visible = false
  expect(configuredMatePickChoice(scene, ['group'], draft, choices, pick, face)).toBeNull()
})

it('renders explicit role picking, cancellation and principal-plane guidance without invoking callbacks', () => {
  const { choices } = fixture(), draft = configuredMateUiDraft('mate'), callback = vi.fn()
  const html = renderToStaticMarkup(<ConfiguredAssemblyMatePanel draft={draft} choices={choices} disabled={false} onChange={callback} onPreview={callback} onClose={callback} onPick={callback} onStopPicking={callback} picking={{ slot: 1, kind: 'face' }} />)
  expect(html).toContain('Seleccionar Referencia 1 por cara en vista configurada')
  expect(html).toContain('Cancelar selección en vista'); expect(html).toContain('planos XY, XZ e YZ')
  expect(html).not.toContain('Elegir arista LINE en vista'); expect(callback).not.toHaveBeenCalled()
})
