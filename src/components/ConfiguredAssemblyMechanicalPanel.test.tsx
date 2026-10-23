import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { validateAssemblyMate, validateAssemblyGeometryReference, type AssemblyMate, type AssemblyComponentReference } from '../model/assemblyDocument'
import { configuredMechanicalMateSpec, inspectAssemblyConfiguredMechanicalEdit } from '../model/assemblyConfiguredMechanicalEditing'
import { applyAssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { identityRigidPose } from '../model/rigidPose'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { configuredMechanicalUiPreviewMatches, configuredMateUiTicketMatches, configuredUiTicket } from './configuredAssemblyUi'
import ConfiguredAssemblyMechanicalPanel, { configuredMechanicalDraft, configuredMechanicalIntent, configuredMechanicalChoices, configuredMechanicalRoleChoices, configuredMechanicalMate, type ConfiguredMechanicalChoices, type ConfiguredMechanicalMate, type ConfiguredMechanicalType } from './ConfiguredAssemblyMechanicalPanel'

// Original public A/B core declarations. Symbolic axes/LINE are ONLY UI
// nominees; these tests do not claim native topology, capture or a capability.
const families: ConfiguredMechanicalType[] = ['lock', 'concentric', 'gear', 'screw', 'rack-pinion']
function fixture() { const f = assemblyConfigurationCoreFixture(); return createAssemblyConfiguredDocument(f.document, f.catalog, 'mixed') }
const component = (id: 'a' | 'b'): AssemblyComponentReference => ({ occurrencePath: [id], definition: { id: 'configuration-' + id.toUpperCase(), revision: 'r1' } })
const axis = (id: 'a' | 'b') => validateAssemblyGeometryReference({ kind: 'face', component: component(id), body: null, face: { sourceFeatureId: 'solid', key: 'ui-axis-' + id }, support: 'axis' })
const edge = () => validateAssemblyGeometryReference({ kind: 'edge', component: component('b'), body: null, edge: { sourceFeatureId: 'solid', key: 'ui-line' }, support: 'line' })
const target = { scopePath: ['right'], definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact' }
const choices: ConfiguredMechanicalChoices = { geometry: [axis('a'), axis('b'), edge()].map(reference => ({ key: JSON.stringify(reference), label: 'Original symbolic current nominee', reference })), components: ['a', 'b'].map(id => { const reference = component(id as 'a' | 'b'); return { key: JSON.stringify(reference), label: 'Original component ' + id, reference } }) }
function mate(type: ConfiguredMechanicalType): ConfiguredMechanicalMate {
  const base = { id: 'mechanical-' + type, type, name: 'Original ' + type, suppressed: false, first: axis('a'), second: axis('b') }
  const checked = validateAssemblyMate(type === 'lock' ? { ...base, first: component('a'), second: component('b'), relativePose: { ...identityRigidPose(), translation: [3, 2, 1] } }
    : type === 'concentric' ? { ...base, alignment: 'aligned', rotationLock: [0, 0, 0, 1] }
      : type === 'gear' ? { ...base, carrier: null, ratio: { numerator: 5, denominator: 7 }, direction: 'opposed', phase: .25, neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: { first: 12 * Math.PI, second: -8 * Math.PI } }
        : type === 'screw' ? { ...base, lead: 4, reverse: true, alignment: 'aligned', neutralRotation: [0, 0, 0, 1], neutralTravel: 2, angle: 12 * Math.PI }
          : { ...base, second: edge(), conversion: { mode: 'travel', override: 12 }, reverse: false, neutralRotation: [0, 0, 0, 1], neutralTravel: 2, angle: -8 * Math.PI })
  if (!configuredMechanicalMate(checked)) throw Error('Original mechanical declaration required')
  return checked
}
function withMate(value: AssemblyMate) { const document = fixture(), s = document.source.definitions.find(row => row.id === target.definition.id)!; if (s.kind !== 'assembly') throw Error('Original assembly'); s.mates.push(value); return document }
function displayScene(document: ReturnType<typeof fixture>, generation = 7): ConfiguredAssemblyScene {
  return { kind: 'configured-assembly-scene', context: { generation, root: { id: document.source.id, revision: document.source.revision }, rootConfiguration: document.rootConfiguration, sourceSignature: JSON.stringify(document.source), catalogSignature: JSON.stringify(document.catalog) }, scene: { kind: 'assembly-scene', sceneId: 'unattested-ui-only', bodies: [], bounds: null, visibleBounds: null, volume: 0, area: 0, solidCount: 0, prototypeCount: 0, warnings: [] }, referenceDiagnostics: [] }
}
it.each(families)('restores %s refs and parameters without placing any capture or winding in the draft/intent', type => {
  const original = mate(type), before = JSON.stringify(original), draft = configuredMechanicalDraft('unused', original), intent = configuredMechanicalIntent(draft, choices, target)
  expect(intent.change).toEqual({ kind: 'replace', mateId: original.id, capture: 'retain', spec: configuredMechanicalMateSpec(original) })
  for (const key of ['relativePose', 'rotationLock', 'neutralRotations', 'neutralRotation', 'neutralTravel', 'angles', 'angle']) {
    expect(Object.hasOwn(draft, key)).toBe(false); expect(Object.hasOwn(intent.change.spec, key)).toBe(false)
  }
  expect(JSON.stringify(original)).toBe(before)
})
it.each(families)('builds explicit current %s authoring intent and blocks incomplete or stale references', type => {
  const draft = configuredMechanicalDraft('original-new'); draft.type = type; draft.name = 'Original new'; draft.references = type === 'lock' ? [component('a'), component('b')] : [axis('a'), type === 'rack-pinion' ? edge() : axis('b')]
  const intent = configuredMechanicalIntent(draft, choices, target)
  expect(intent.change.kind).toBe('add'); expect(intent.change.spec.type).toBe(type)
  draft.references[1] = null; expect(() => configuredMechanicalIntent(draft, choices, target)).toThrow(/referencias/)
  draft.references[1] = type === 'lock' ? component('b') : axis('b')
  expect(() => configuredMechanicalIntent(draft, { ...choices, components: [], geometry: [] }, target)).toThrow(/catálogo/)
})
it('does not confuse component, native axis, principal plane, LINE and optional carrier purposes', () => {
  const draft = configuredMechanicalDraft('purpose')
  expect(configuredMechanicalRoleChoices(draft, 0, choices)).toEqual(choices.components)
  draft.type = 'gear'; expect(configuredMechanicalRoleChoices(draft, 1, choices)).toEqual(choices.geometry.slice(0, 2))
  draft.type = 'rack-pinion'; expect(configuredMechanicalRoleChoices(draft, 0, choices)).toEqual(choices.geometry.slice(0, 2)); expect(configuredMechanicalRoleChoices(draft, 1, choices)).toEqual(choices.geometry)
  draft.type = 'gear'; draft.name = 'Original gear'; draft.references = [axis('a'), axis('b')]; draft.carrier = component('b')
  expect(configuredMechanicalIntent(draft, choices, target).change.spec).toMatchObject({ carrier: component('b') })
  draft.carrier = { ...component('b'), definition: { id: 'configuration-B', revision: 'stale' } }; expect(() => configuredMechanicalIntent(draft, choices, target)).toThrow(/portador/)
  draft.carrier = null; expect(configuredMechanicalIntent(draft, choices, target).change.spec).toMatchObject({ carrier: null, phase: 0 })
})
it('requires explicit recapture for changed endpoint roles and preserves the capture mode on reference edits', () => {
  const original = mate('gear'), document = withMate(original), draft = configuredMechanicalDraft('unused', original)
  draft.phase = '.75'; expect(inspectAssemblyConfiguredMechanicalEdit(document, configuredMechanicalIntent(draft, choices, target)).existing).toEqual(original)
  draft.references.reverse(); expect(draft.capture).toBe('retain'); expect(() => inspectAssemblyConfiguredMechanicalEdit(document, configuredMechanicalIntent(draft, choices, target))).toThrow(/endpoint/)
  draft.capture = 'recapture'; expect(inspectAssemblyConfiguredMechanicalEdit(document, configuredMechanicalIntent(draft, choices, target)).edit.change).toMatchObject({ capture: 'recapture' })
  expect(document).toEqual(withMate(original))
})
it('preserves weighted gear phase and signed winding independence and validates physical parameter inputs', () => {
  const draft = configuredMechanicalDraft('unused', mate('gear')); draft.phase = String(9 * Math.PI); draft.numerator = '2'; draft.denominator = '3'
  expect(configuredMechanicalIntent(draft, choices, target).change.spec).toMatchObject({ ratio: { numerator: 2, denominator: 3 }, phase: 9 * Math.PI })
  for (const bad of ['', 'Infinity', 'NaN']) { draft.phase = bad; expect(() => configuredMechanicalIntent(draft, choices, target)).toThrow() }
  draft.phase = '0'; draft.numerator = '0'; expect(() => configuredMechanicalIntent(draft, choices, target)).toThrow()
  draft.type = 'screw'; draft.lead = '-1'; expect(() => configuredMechanicalIntent(draft, choices, target)).toThrow()
  draft.type = 'rack-pinion'; draft.override = ''; expect(configuredMechanicalIntent(draft, choices, target).change.spec).toMatchObject({ conversion: { mode: 'diameter', override: null } })
  draft.override = '0'; expect(() => configuredMechanicalIntent(draft, choices, target)).toThrow()
})
it('nominates active full-context components relative to the selected scope without flattening or touching source bytes', () => {
  const document = fixture(), before = serializeAssemblyConfiguredDocument(document), scene = displayScene(document)
  expect(configuredMechanicalChoices(document, scene, 7, ['right']).components.map(row => row.reference)).toEqual([component('a'), component('b')])
  expect(configuredMechanicalChoices(document, scene, 8, ['right'])).toEqual({ components: [], geometry: [] })
  expect(configuredMechanicalChoices(document, scene, 7, ['absent'])).toEqual({ components: [], geometry: [] })
  document.rootConfiguration = 'single-right'; expect(configuredMechanicalChoices(document, displayScene(document), 7, ['right']).components.map(row => row.reference)).toEqual([component('a')])
  document.rootConfiguration = 'mixed'; expect(serializeAssemblyConfiguredDocument(document)).toBe(before)
})
it.each(families)('renders usable %s controls, explicit capture policy, no derived quaternion fields and preview lock', type => {
  const draft = configuredMechanicalDraft('unused', mate(type)), callbacks = { onChange: vi.fn(), onPreview: vi.fn(), onClose: vi.fn() }
  const html = renderToStaticMarkup(<ConfiguredAssemblyMechanicalPanel {...{ draft, choices, target, ...callbacks }} disabled={false} />)
  for (const label of ['Tipo de relación mecánica configurada', 'Nombre de relación mecánica configurada', 'Referencia 1 mecánica configurada', 'Referencia 2 mecánica configurada', 'Captura mecánica configurada', 'Vista previa de relación mecánica configurada']) expect(html).toContain(label)
  expect(html).toContain('Conservar captura'); expect(html).toContain('Volver a capturar'); expect(html).not.toContain('textarea'); expect(html).not.toContain('QX')
  const locked = renderToStaticMarkup(<ConfiguredAssemblyMechanicalPanel {...{ draft, choices, target, ...callbacks }} disabled />)
  expect(locked).toMatch(/<button(?=[^>]*disabled="")[^>]*>Vista previa de relación mecánica configurada/)
  expect(callbacks.onPreview).not.toHaveBeenCalled(); expect(callbacks.onChange).not.toHaveBeenCalled()
})
it('requires exactly the authored spec in the selected preview state, including locked concentric and full role identities', () => {
  const original = mate('concentric'), document = withMate(original), draft = configuredMechanicalDraft('unused', original), intent = configuredMechanicalIntent(draft, choices, target)
  expect(configuredMechanicalUiPreviewMatches(document, intent)).toBe(true)
  const changed = structuredClone(intent); changed.change.spec.name = 'Wrong name'; expect(configuredMechanicalUiPreviewMatches(document, changed)).toBe(false)
  expect(configuredMechanicalUiPreviewMatches(document, { ...intent, scopePath: ['left'] })).toBe(false)
  const unlocked = { ...original, rotationLock: null }; const candidate = applyAssemblyConfiguredMateEdit(document, { ...target, change: { kind: 'replace', mateId: original.id, mate: unlocked } })
  expect(configuredMechanicalUiPreviewMatches(candidate, intent)).toBe(false)
})
it.each(families)('compares the complete %s authored intent independently from generated capture fields', type => {
  const original = mate(type), document = withMate(original), draft = configuredMechanicalDraft('unused', original), intent = configuredMechanicalIntent(draft, choices, target)
  expect(configuredMechanicalUiPreviewMatches(document, intent)).toBe(true)
  for (const changed of [
    { ...intent, definition: { ...target.definition, revision: 'stale' } },
    { ...intent, configuration: null },
    { ...intent, change: { ...intent.change, spec: { ...intent.change.spec, suppressed: true } } },
  ]) expect(configuredMechanicalUiPreviewMatches(document, changed)).toBe(false)
  const bodyChanged = structuredClone(intent)
  if (bodyChanged.change.spec.type === 'lock') bodyChanged.change.spec.first.definition.revision = 'stale'
  else bodyChanged.change.spec.first.body = { sourceFeatureId: 'solid', bodyId: 'other-body' }
  expect(configuredMechanicalUiPreviewMatches(document, bodyChanged)).toBe(false)
  // This is declared UI data, not evidence of capture or Apply. A native
  // producer may generate different valid captures without changing intent.
  const captureChanged = structuredClone(original)
  if (captureChanged.type === 'lock') captureChanged.relativePose.translation[0] = 8
  else if (captureChanged.type === 'concentric') captureChanged.rotationLock = [0, 0, 1, 0]
  else if (captureChanged.type === 'gear') captureChanged.angles.first += 2 * Math.PI
  else captureChanged.angle += 2 * Math.PI
  const candidate = applyAssemblyConfiguredMateEdit(document, { ...target, change: { kind: 'replace', mateId: original.id, mate: captureChanged } })
  expect(configuredMechanicalUiPreviewMatches(candidate, intent)).toBe(true)
})
it('rejects retained mechanical callbacks after capture policy, type, reference slot, draft epoch, scene or full context changes', () => {
  const document = fixture(), draft = configuredMechanicalDraft('new'), context = configuredUiTicket(document, 7, '["right"]', 'original.solidflow', 'b', 1)
  const ticket = { context, revision: 1, draft: JSON.stringify(draft), sceneId: 'current' }
  for (const patch of [{ capture: 'retain' }, { type: 'gear' }, { references: [component('a'), component('b')] }]) expect(configuredMateUiTicketMatches(ticket, { ...ticket, draft: JSON.stringify({ ...draft, ...patch }) })).toBe(false)
  expect(configuredMateUiTicketMatches(ticket, { ...ticket, revision: 2 })).toBe(false)
  expect(configuredMateUiTicketMatches(ticket, { ...ticket, sceneId: 'new-scene' })).toBe(false)
  expect(configuredMateUiTicketMatches(ticket, { ...ticket, context: { ...context, generation: 8 } })).toBe(false)
})
