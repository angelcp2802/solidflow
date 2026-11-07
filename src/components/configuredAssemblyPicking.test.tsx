import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssemblyScene, AssemblySceneFace, AssemblySceneEdge } from '../cad/kernel.assembly-types'
import { identityRigidPose } from '../model/rigidPose'
import { configuredComponentPick, configuredMatePickChoice, configuredMateHighlights } from './configuredAssemblyPicking'
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
  expect(html).toContain('Cancelar selección en vista'); expect(html).toContain('Elige planos o ejes de origen en las listas o activa su selección en vista.')
  expect(html).not.toContain('Elegir arista LINE en vista'); expect(callback).not.toHaveBeenCalled()
})

it('highlights only current compatible draft roles in their declaring scope', () => {
  const { scene, face, edge, choices } = fixture(), draft = configuredMateUiDraft('mate')
  draft.type = 'parallel'; draft.references = choices.map(choice => structuredClone(choice.reference))
  const highlights = configuredMateHighlights(scene, ['group'], draft, choices)
  expect(highlights.faces).toEqual([face]); expect(highlights.faces[0]).toBe(face)
  expect(highlights.edges).toEqual([edge]); expect(highlights.edges[0]).toBe(edge)
  expect(configuredMateHighlights(scene, [], draft, choices)).toEqual({ faces: [], edges: [] })
  expect(configuredMateHighlights(null, ['group'], draft, choices)).toEqual({ faces: [], edges: [] })
  draft.type = 'coincident'
  expect(configuredMateHighlights(scene, ['group'], draft, choices).edges).toEqual([])
})

it('does not highlight retained stale, hidden or ambiguous draft references', () => {
  const { scene, face, choices } = fixture(), draft = configuredMateUiDraft('mate')
  draft.references = [structuredClone(choices[0].reference), null]
  expect(configuredMateHighlights(scene, ['group'], draft, []).faces).toEqual([])
  scene.bodies[0].faces.push(face)
  expect(configuredMateHighlights(scene, ['group'], draft, choices).faces).toEqual([])
  scene.bodies[0].faces.pop(); scene.bodies[0].visible = false
  expect(configuredMateHighlights(scene, ['group'], draft, choices).faces).toEqual([])
  scene.bodies[0].visible = true
  draft.references[0]!.component!.definition.revision = 'obsolete'
  expect(configuredMateHighlights(scene, ['group'], draft, choices).faces).toEqual([])
})

it('matches reordered saved properties structurally while preserving reference purpose', () => {
  const { scene, face, edge, choices } = fixture(), draft = configuredMateUiDraft('mate')
  draft.type = 'parallel'
  draft.references = [
    { support: 'plane', face: { key: 'face-1', sourceFeatureId: 'extrude' }, body: null,
      component: { definition: { revision: 'r1', id: 'part' }, occurrencePath: ['part'] }, kind: 'face' },
    { edge: { key: 'edge-1', sourceFeatureId: 'extrude' }, support: 'line', body: null,
      component: { definition: { revision: 'r1', id: 'part' }, occurrencePath: ['part'] }, kind: 'edge' },
  ]
  expect(JSON.stringify(draft.references[0])).not.toBe(JSON.stringify(choices[0].reference))
  expect(configuredMateHighlights(scene, ['group'], draft, choices)).toEqual({ faces: [face], edges: [edge] })
  draft.references[0] = { kind: 'face', component: { occurrencePath: ['part'], definition: { id: 'part', revision: 'r1' } }, body: null, face: face.selection.face, support: 'axis' }
  expect(configuredMateHighlights(scene, ['group'], draft, choices)).toEqual({ faces: [], edges: [edge] })
})
