import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { validateAssemblyMate, validateAssemblyGeometryReference, type AssemblyMate } from '../model/assemblyDocument'
import { applyAssemblyConfiguredMateEdit, type AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { identityRigidPose } from '../model/rigidPose'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { configuredUiTicket, configuredUiTicketMatches, configuredMateUiTicketMatches, configuredMateUiPreviewMatches } from './configuredAssemblyUi'
import ConfiguredAssemblyMatePanel, { configuredMateUiDraft, configuredMateUiChoices, configuredMateUiProposal, configuredMateUiRoleChoices, configuredMateEditUnavailable, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'

// Original public A/B declaration fixture. The empty, un-attested scene below
// is ONLY a UI context fixture; no native surface, solve or capability is claimed.
function fixture() { const f = assemblyConfigurationCoreFixture(); return createAssemblyConfiguredDocument(f.document, f.catalog, 'mixed') }
function scene(document = fixture(), generation = 7): ConfiguredAssemblyScene {
  return { kind: 'configured-assembly-scene', context: { generation, root: { id: document.source.id, revision: document.source.revision }, rootConfiguration: document.rootConfiguration,
    sourceSignature: JSON.stringify(document.source), catalogSignature: JSON.stringify(document.catalog) }, scene: { kind: 'assembly-scene', sceneId: 'unattested-ui-display', bodies: [], bounds: null, visibleBounds: null, volume: 0, area: 0, solidCount: 0, prototypeCount: 0, warnings: [] }, referenceDiagnostics: [] }
}
const principal = (id: 'a' | 'b' | null) => validateAssemblyGeometryReference({ kind: 'principal-plane', component: id === null ? null : { occurrencePath: [id], definition: { id: 'configuration-' + id.toUpperCase(), revision: 'r1' } }, plane: 'YZ' })
const axis = (id: 'a' | 'b') => validateAssemblyGeometryReference({ kind: 'face', component: { occurrencePath: [id], definition: { id: 'configuration-' + id.toUpperCase(), revision: 'r1' } }, body: null, face: { sourceFeatureId: 'solid', key: 'symbolic-axis-' + id }, support: 'axis' })
const choice = (reference: ConfiguredMateUiChoice['reference']): ConfiguredMateUiChoice => ({ key: JSON.stringify(reference), label: 'Original symbolic UI selection', reference })
const distance = (): AssemblyMate => validateAssemblyMate({ id: 'distance', name: 'Original X distance', type: 'distance', suppressed: false, first: principal('b'), second: principal(null), alignment: 'aligned', distance: 10 })

it('nominates scope-relative principal references from the selected effective state without a fake v2 document', () => {
  const document = fixture(), before = serializeAssemblyConfiguredDocument(document), choices = configuredMateUiChoices(document, scene(document), 7, ['right'])
  expect(choices).toHaveLength(9); expect(choices.filter(row => row.reference.component === null)).toHaveLength(3)
  expect(choices.some(row => row.key === JSON.stringify(principal('b')))).toBe(true)
  expect(choices.every(row => !row.reference.component || row.reference.component.occurrencePath.length === 1 && ['a', 'b'].includes(row.reference.component.occurrencePath[0]))).toBe(true)
  expect(configuredMateUiChoices(document, scene(document), 8, ['right'])).toEqual([])
  expect(configuredMateUiChoices(document, scene(document), 7, ['missing'])).toEqual([])
  document.rootConfiguration = 'single-right'
  expect(configuredMateUiChoices(document, scene(document), 7, ['right'])).toHaveLength(6)
  expect(serializeAssemblyConfiguredDocument({ ...document, rootConfiguration: 'mixed' })).toBe(before)
})

it('restores a real saved distance and edits its numerical parameter and references without mutating the original', () => {
  const mate = distance(), before = JSON.stringify(mate), document = fixture(), choices = configuredMateUiChoices(document, scene(document), 7, ['right']), draft = configuredMateUiDraft('unused', mate)
  expect(draft.id).toBe('distance'); expect(draft.value).toBe('10'); expect(draft.editing).toBe(true)
  draft.value = '6'; expect(configuredMateUiProposal(draft, choices)).toEqual({ ...mate, distance: 6 })
  draft.references[0] = principal('a'); expect(configuredMateUiProposal(draft, choices)).toMatchObject({ first: principal('a'), distance: 6 })
  expect(JSON.stringify(mate)).toBe(before)
})

it('requires explicit complete current references and finite parameters and refuses purpose substitution', () => {
  const document = fixture(), choices = configuredMateUiChoices(document, scene(document), 7, ['right']), draft = configuredMateUiDraft('original-new')
  draft.name = 'Original new distance'; draft.value = '6'
  expect(() => configuredMateUiProposal(draft, choices)).toThrow(/referencias/)
  draft.references = [principal('b'), principal(null)]; expect(configuredMateUiProposal(draft, choices)).toMatchObject({ type: 'distance', distance: 6, id: 'original-new' })
  draft.value = ''; expect(() => configuredMateUiProposal(draft, choices)).toThrow(/numéricos/)
  draft.value = 'Infinity'; expect(() => configuredMateUiProposal(draft, choices)).toThrow()
  draft.value = '6'; draft.references[0] = axis('a'); expect(() => configuredMateUiProposal(draft, [...choices, choice(axis('a'))])).toThrow(/referencias/)
  draft.references[0] = principal('b'); const stale = structuredClone(draft.references[0]); stale.component!.definition.revision = 'other'
  draft.references[0] = stale; expect(() => configuredMateUiProposal(draft, choices)).toThrow(/referencias/)
})

it('keeps mixed plane/axis directional intent explicit and does not manufacture a capture', () => {
  const draft = configuredMateUiDraft('direction'); draft.type = 'parallel'; draft.name = 'Original plane/axis'; draft.references = [principal(null), axis('a')]
  const choices = draft.references.map(ref => choice(ref!)), parallel = configuredMateUiProposal(draft, choices)
  expect(parallel).toMatchObject({ type: 'parallel', alignment: null })
  draft.type = 'perpendicular'; draft.alignment = 'opposed'
  expect(configuredMateUiProposal(draft, choices)).toMatchObject({ type: 'perpendicular', alignment: 'opposed' })
  draft.type = 'concentric'; draft.references = [axis('a'), axis('b')]
  expect(configuredMateUiProposal(draft, draft.references.map(ref => choice(ref!)))).toMatchObject({ type: 'concentric', rotationLock: null })
})

it.each(['lock', 'gear', 'screw', 'rack-pinion', 'concentric'] as const)('routes %s capture-dependent editing to its dedicated form while preserving the generic form boundary', type => {
  const common = { id: 'captured', name: 'Original captured state', suppressed: false, type, first: axis('a'), second: axis('b') }
  const mate = validateAssemblyMate(type === 'lock' ? { ...common, first: axis('a').component, second: axis('b').component, relativePose: identityRigidPose() }
    : type === 'gear' ? { ...common, carrier: null, ratio: { numerator: 1, denominator: 1 }, direction: 'opposed', neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: { first: 0, second: 0 }, phase: 0 }
      : type === 'screw' ? { ...common, lead: 4, reverse: false, alignment: 'aligned', neutralRotation: [0, 0, 0, 1], neutralTravel: 0, angle: 0 }
        : type === 'rack-pinion' ? { ...common, conversion: { mode: 'diameter', override: null }, reverse: false, neutralRotation: [0, 0, 0, 1], neutralTravel: 0, angle: 0 }
          : { ...common, alignment: 'aligned', rotationLock: [0, 0, 0, 1] })
  expect(configuredMateEditUnavailable(mate)).toMatch(/formulario de relaciones mecánicas/); expect(() => configuredMateUiDraft('unused', mate)).toThrow(/formulario de relaciones mecánicas/)
  expect(mate.id).toBe('captured'); expect(mate.suppressed).toBe(false)
})

it('requires material angular faces for six-slot hinges without treating principal normals as material proof', () => {
  const draft = configuredMateUiDraft('hinge'); draft.type = 'hinge'; draft.limited = true
  const choices = [choice(principal(null)), choice(axis('a'))]
  expect(configuredMateUiRoleChoices(draft, 0, choices)).toEqual([choices[1]])
  expect(configuredMateUiRoleChoices(draft, 2, choices)).toEqual([choices[0]])
  expect(configuredMateUiRoleChoices(draft, 4, choices)).toEqual([])
})

it('renders actual parameter/ref controls with no JSON editor and locks the complete form during preview', () => {
  const document = fixture(), draft = configuredMateUiDraft('unused', distance()), choices = configuredMateUiChoices(document, scene(document), 7, ['right']), onChange = vi.fn(), onPreview = vi.fn(), onClose = vi.fn()
  const html = renderToStaticMarkup(<ConfiguredAssemblyMatePanel {...{ draft, choices, onChange, onPreview, onClose }} disabled={false} />)
  for (const label of ['Tipo de relación configurada', 'Nombre de relación configurada', 'Referencia 1 de relación configurada', 'Referencia 2 de relación configurada', 'Distancia de relación configurada en mm', 'Vista previa de relación configurada']) expect(html).toContain(label)
  expect(html).not.toContain('textarea'); expect(html).not.toContain('QX'); expect(html).toContain('value="10"')
  const locked = renderToStaticMarkup(<ConfiguredAssemblyMatePanel {...{ draft, choices, onChange, onPreview, onClose }} disabled />)
  expect(locked).toMatch(/<input(?=[^>]*aria-label="Distancia de relación configurada en mm")(?=[^>]*disabled="")[^>]*>/)
  expect(locked).toMatch(/<button(?=[^>]*disabled="")[^>]*>Vista previa de relación configurada/)
  expect(onChange).not.toHaveBeenCalled(); expect(onPreview).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled()
})

it('rejects old callbacks after draft/field/mode changes, context changes or scene replacement before a render', () => {
  const document = fixture(), context = configuredUiTicket(document, 7, '["right"]', 'original.solidflow', 'b', 1)
  const ticket = { context, revision: 1, draft: JSON.stringify(configuredMateUiDraft('original')), sceneId: 'original-current-scene' }
  for (const next of [{ ...ticket, revision: 2 }, { ...ticket, draft: ticket.draft + ' ' }, { ...ticket, sceneId: 'different-scene' }, { ...ticket, context: { ...context, generation: 9 } }, { ...ticket, context: { ...context, scope: '[]' } }]) expect(configuredMateUiTicketMatches(ticket, next)).toBe(false)
  expect(configuredUiTicketMatches(context, configuredUiTicket(document, 7, '["right"]', 'original.solidflow', 'b', 2))).toBe(false)
  expect(configuredUiTicketMatches(context, configuredUiTicket(document, 7, '["right"]', 'original.solidflow', 'b', 3))).toBe(false)
})

it('checks exact effective edit intent in a candidate while leaving the complete committed context untouched', () => {
  const document = fixture(); document.source.definitions.find(value => value.kind === 'assembly')!.mates = [distance()]
  const before = serializeAssemblyConfiguredDocument(document), mate = { ...distance(), distance: 6 }
  const intent: AssemblyConfiguredMateEdit = { scopePath: ['right'], definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact', change: { kind: 'replace', mateId: mate.id, mate } }
  const candidate = applyAssemblyConfiguredMateEdit(document, intent)
  expect(configuredMateUiPreviewMatches(candidate, intent)).toBe(true); expect(configuredMateUiPreviewMatches(document, intent)).toBe(false)
  expect(configuredMateUiPreviewMatches(candidate, { ...intent, configuration: null })).toBe(false)
  expect(configuredMateUiPreviewMatches(candidate, { ...intent, definition: { id: 'other', revision: 's-r1' } })).toBe(false)
  expect(serializeAssemblyConfiguredDocument(document)).toBe(before); expect(candidate.source).toEqual(document.source)
  const removed = { ...intent, change: { kind: 'remove' as const, mateId: mate.id } }
  expect(configuredMateUiPreviewMatches(applyAssemblyConfiguredMateEdit(candidate, removed), removed)).toBe(true)
  const suppressed = { ...intent, change: { kind: 'suppression' as const, mateId: mate.id, suppressed: true } }
  expect(configuredMateUiPreviewMatches(applyAssemblyConfiguredMateEdit(candidate, suppressed), suppressed)).toBe(true)
})
