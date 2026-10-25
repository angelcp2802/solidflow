import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { assemblyMateProposal } from './AssemblyWorkspace'
import { assemblyDirectedAngleChoices } from './AssemblyDirectedAnglePanel'
import ConfiguredAssemblyMatePanel, { configuredMateUiDraft, configuredMateUiProposal, configuredMateUiRoleChoices, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'
import type { AssemblyPrincipalAxisReference } from '../model/assemblyDocument'
import { configuredMechanicalDraft, configuredMechanicalRoleChoices } from './ConfiguredAssemblyMechanicalPanel'

// Original symbolic datum declarations: UI admission only, no native solve claim.
const root: AssemblyPrincipalAxisReference = { kind: 'principal-axis', component: null, axis: 'X' }
const child: AssemblyPrincipalAxisReference = { kind: 'principal-axis', component: { occurrencePath: ['moving'], definition: { id: 'original-part', revision: 'r1' } }, axis: 'Z' }
const choices: ConfiguredMateUiChoice[] = [root, child].map(reference => ({ key: JSON.stringify(reference), label: `Eje de origen ${reference.axis}`, reference }))

it('authors unlocked concentric and directional intent with actual origin-axis identity', () => {
  expect(assemblyMateProposal(root, child, 'concentric', 'opposed', 0)).toMatchObject({ first: root, second: child, rotationLock: null, alignment: 'opposed' })
  expect(assemblyMateProposal(root, child, 'parallel', 'aligned', 0)).toMatchObject({ alignment: 'aligned' })
  expect(assemblyMateProposal(root, child, 'perpendicular', 'aligned', 0)).toMatchObject({ alignment: null })
  expect(assemblyMateProposal(root, child, 'angle', 'aligned', 30)).toMatchObject({ angle: 30 })
  expect(() => assemblyMateProposal(root, child, 'distance', 'aligned', 5)).toThrow()
})

it('keeps configured datum choices out of material, plane-only and symmetry roles', () => {
  const draft = configuredMateUiDraft('original-axis'); draft.name = 'Original axes'; draft.references = [root, child]
  for (const type of ['concentric', 'parallel', 'perpendicular', 'angle', 'limit-angle', 'limit-directed-angle'] as const) {
    draft.type = type; expect(configuredMateUiRoleChoices(draft, 0, choices)).toHaveLength(2)
  }
  for (const type of ['hinge', 'width', 'distance', 'coincident', 'tangent', 'symmetry', 'cylinder-sphere-tangent'] as const) {
    draft.type = type; expect(configuredMateUiRoleChoices(draft, 0, choices)).toEqual([])
  }
  for (const type of ['gear', 'screw', 'rack-pinion'] as const) {
    const mechanical = configuredMechanicalDraft('material-only'); mechanical.type = type
    expect(configuredMechanicalRoleChoices(mechanical, 0, { geometry: choices, components: [] })).toEqual([])
    expect(configuredMechanicalRoleChoices(mechanical, 1, { geometry: choices, components: [] })).toEqual([])
  }
  const locked = configuredMechanicalDraft('origin-lock'); locked.type = 'concentric'
  expect(configuredMechanicalRoleChoices(locked, 0, { geometry: choices, components: [] })).toEqual(choices)
  expect(configuredMechanicalRoleChoices(locked, 1, { geometry: choices, components: [] })).toEqual(choices)
  draft.type = 'concentric'
  expect(configuredMateUiProposal(draft, choices)).toMatchObject({ first: root, second: child, rotationLock: null })
  expect(() => configuredMateUiProposal(draft, [choices[0]])).toThrow(/catálogo/)
  const html = renderToStaticMarkup(<ConfiguredAssemblyMatePanel draft={draft} choices={choices} disabled={false} onChange={() => {}} onPreview={() => {}} onClose={() => {}} />)
  expect(html).toContain('Eje de origen X'); expect(html).toContain('Eje de origen Z')
})

it('enumerates all scope/component origin axes with scoped identities and no material locator', () => {
  const rows = [{ path: ['group', 'moving'], occurrence: { name: 'Moving', definition: { id: 'original-part', revision: 'r1' } }, visible: true, suppressed: false }]
  const choices = assemblyDirectedAngleChoices(null, ['group'], rows).filter(c => c.reference.kind === 'principal-axis')
  expect(choices).toHaveLength(6)
  expect(choices.filter(c => c.reference.component === null).map(c => c.reference)).toEqual(['X', 'Y', 'Z'].map(axis => ({ kind: 'principal-axis', component: null, axis })))
  expect(choices.filter(c => c.reference.component !== null).every(c => JSON.stringify(c.reference.component?.occurrencePath) === '["moving"]')).toBe(true)
  expect(choices.every(c => !('body' in c.reference) && !('face' in c.reference))).toBe(true)
  expect(assemblyDirectedAngleChoices(null, [], []).filter(c => c.reference.kind === 'principal-axis').every(c => c.label.includes('Raíz'))).toBe(true)
})
