import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { createAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { validateAssemblyMate, type AssemblyMate, type AssemblyEdgeReference, type AssemblyVertexReference } from '../model/assemblyDocument'
import { applyAssemblyConfiguredMateEdit, type AssemblyConfiguredMateEdit } from '../model/assemblyConfiguredMateEditing'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import { configuredMateUiPreviewMatches, configuredMateUiTicketMatches, configuredUiTicket } from './configuredAssemblyUi'
import type { ConfiguredCompoundUiChoices } from './configuredCompoundUiChoices'
import ConfiguredAssemblyCompoundPanel, { configuredCompoundUiDraft, configuredCompoundUiProposal, configuredCompoundUiProfileFace, configuredCompoundUiLineEdge, configuredCompoundMate, type ConfiguredCompoundMate } from './ConfiguredAssemblyCompoundPanel'

// Original public A/B declarations, with symbolic locators ONLY for pure form
// tests. No native face classification, topology/incidence, solver or capability
// is supplied or asserted here. The native and renderer suites own that evidence.
const component = (id: 'a' | 'b') => ({ occurrencePath: [id], definition: { id: 'configuration-' + id.toUpperCase(), revision: 'r1' } })
const face = (id: 'a' | 'b') => ({ component: component(id), body: null, face: { sourceFeatureId: 'solid', key: 'ui-face-' + id } })
const edge = (id: 'a' | 'b'): AssemblyEdgeReference => ({ kind: 'edge', component: component(id), body: null, edge: { sourceFeatureId: 'solid', key: 'edge-v1|ui-line-' + id }, support: 'line' })
const vertex = (id: 'a' | 'b', key: string = id): AssemblyVertexReference => ({ kind: 'vertex', component: component(id), body: null, vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + (key === 'a' || key === 'b' ? key : 'c').repeat(64) }, support: 'point' })
const arc = () => ({ component: component('a'), body: null, edge: { sourceFeatureId: 'solid', key: 'edge-v1|ui-open-arc' }, startVertex: vertex('a').vertex })
const guide = () => ({ kind: 'face' as const, ...face('a'), support: 'plane' as const })
const choice = <T,>(reference: T) => ({ key: JSON.stringify(reference), label: 'Original UI-only nominee', reference })
function choices(): ConfiguredCompoundUiChoices {
  return { profileFaces: [face('a'), face('b')].map(choice), profileEdges: ['a', 'b'].map(id => ({ key: JSON.stringify(edge(id as 'a' | 'b')), label: 'Original material LINE nominee', faceOwner: face(id as 'a' | 'b'), edge: edge(id as 'a' | 'b').edge })),
    points: [vertex('a'), vertex('a', 'ui-other-end'), vertex('b')].map(choice), lineEdges: [edge('a'), edge('b')].map(choice), circularPaths: [arc()].map(choice), guides: [guide()].map(choice) }
}
const target = { scopePath: ['right'], definition: { id: 'configuration-S', revision: 's-r1' }, configuration: 'compact' }
function fixture() { const f = assemblyConfigurationCoreFixture(); return createAssemblyConfiguredDocument(f.document, f.catalog, 'mixed') }
function saved(id: 'profile-circle' | 'profile-rectangle' | 'line' | 'circular'): ConfiguredCompoundMate {
  const common = { id: 'original-' + id, name: 'Original ' + id, suppressed: true }
  const orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: true }, roll: { mode: 'up', axis: 'z', reverse: false, guide: guide() } }
  const raw = id.startsWith('profile') ? { ...common, type: 'profile-center', first: { face: face('a'), axis: id === 'profile-circle' ? null : { edge: edge('a').edge, sense: -1 } }, second: { face: face('b'), axis: id === 'profile-circle' ? null : { edge: edge('b').edge, sense: 1 } }, alignment: 'opposed', offsetMm: -2, orientation: id === 'profile-circle' ? { mode: 'free' } : { mode: 'rectangle', quarterTurns: 3 } }
    : id === 'line' ? { ...common, type: 'line-path', point: vertex('b'), path: { component: component('a'), body: null, edge: edge('a').edge, startVertex: vertex('a').vertex }, position: { mode: 'percent', percent: 25, reverse: true }, orientation }
      : { ...common, type: 'circular-path', point: vertex('b'), path: arc(), position: { mode: 'coordinate', distanceMm: 1 }, orientation }
  const mate = validateAssemblyMate(raw); if (!configuredCompoundMate(mate)) throw Error('Original compound declaration')
  return mate
}
const forms = ['profile-circle', 'profile-rectangle', 'line', 'circular'] as const
it.each(forms)('restores complete saved %s intent, including suppression and compound roles, without measured geometry', id => {
  const mate = saved(id), before = JSON.stringify(mate), draft = configuredCompoundUiDraft('unused', mate)
  expect(configuredCompoundUiProposal(draft, choices())).toEqual(mate)
  for (const key of ['center', 'radiusMm', 'lengthMm', 'precision', 'token', 'nativeWitness']) expect(Object.hasOwn(draft, key)).toBe(false)
  expect(JSON.stringify(mate)).toBe(before)
  const roundtrip = configuredCompoundUiDraft('unused', validateAssemblyMate(JSON.parse(JSON.stringify(mate))) as ConfiguredCompoundMate)
  expect(roundtrip).toEqual(draft)
})
it('treats face, boundary edge and sense as one compound profile intent and clears the old edge on face selection', () => {
  const draft = configuredCompoundUiDraft('unused', saved('profile-rectangle')), before = structuredClone(draft)
  const changed = configuredCompoundUiProfileFace(draft, 0, face('b'))
  expect(changed.profiles[0]).toEqual({ face: face('b'), axis: null }); expect(changed.profiles[1]).toEqual(draft.profiles[1])
  expect(() => configuredCompoundUiProposal(changed, choices())).toThrow(/aristas/); expect(draft).toEqual(before)
  changed.profiles[0]!.axis = { edge: edge('a').edge, sense: 1 }; expect(() => configuredCompoundUiProposal(changed, choices())).toThrow(/aristas/)
  changed.profiles[0]!.axis = { edge: edge('b').edge, sense: -1 }; expect(configuredCompoundUiProposal(changed, choices())).toMatchObject({ first: { axis: { sense: -1 } }, orientation: { mode: 'rectangle', quarterTurns: 3 }, alignment: 'opposed', offsetMm: -2 })
})
it('does not silently retain rectangular axes in Free profile mode or infer a correspondence for incomplete rectangles', () => {
  const draft = configuredCompoundUiDraft('unused', saved('profile-rectangle')); draft.profileMode = 'free'
  expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/sin eje/)
  draft.profiles = [null, null]; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/ambos perfiles/)
  draft.profiles = [{ face: face('a'), axis: null }, { face: face('b'), axis: null }]
  expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ orientation: { mode: 'free' }, first: { axis: null }, second: { axis: null } })
  draft.profileMode = 'rectangle'; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/aristas/)
})
it('requires a current LINE edge and explicit same-body material start and clears origin when edge changes', () => {
  const draft = configuredCompoundUiDraft('unused', saved('line')), before = structuredClone(draft)
  const changed = configuredCompoundUiLineEdge(draft, edge('b'))
  expect(changed.lineOrigin).toBeNull(); expect(changed.point).toEqual(draft.point); expect(draft).toEqual(before)
  expect(() => configuredCompoundUiProposal(changed, choices())).toThrow(/origen/)
  changed.lineOrigin = vertex('a').vertex; expect(() => configuredCompoundUiProposal(changed, choices())).toThrow(/origen/)
  changed.lineOrigin = vertex('b').vertex; expect(configuredCompoundUiProposal(changed, choices())).toMatchObject({ path: { component: component('b'), startVertex: vertex('b').vertex } })
})
it('keeps LINE position, Follow and UP reversals independent, with no implicit axis reassignment', () => {
  const draft = configuredCompoundUiDraft('unused', saved('line'))
  draft.lineMode = 'distance'; draft.quantity = '1'; draft.positionReverse = false; draft.followReverse = true; draft.upReverse = false
  const base = configuredCompoundUiProposal(draft, choices())
  expect(base).toMatchObject({ position: { mode: 'distance', distanceMm: 1, reverse: false }, orientation: { pitchYaw: { reverse: true }, roll: { reverse: false } } })
  draft.positionReverse = true; expect(configuredCompoundUiProposal(draft, choices())).toEqual({ ...base, position: { mode: 'distance', distanceMm: 1, reverse: true } })
  draft.followReverse = false; draft.upReverse = true
  expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ position: { reverse: true }, orientation: { pitchYaw: { reverse: false }, roll: { reverse: true } } })
  draft.upAxis = 'x'; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/distintos/); expect(draft.followAxis).toBe('x'); expect(draft.upAxis).toBe('x')
  draft.upAxis = 'z'; draft.following = false; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/alinear/); expect(draft.upEnabled).toBe(true)
})
it('keeps the exact previous Free/Free path shape and enforces explicit bounded position syntax', () => {
  const draft = configuredCompoundUiDraft('unused', saved('line')); draft.following = false; draft.upEnabled = false; draft.lineMode = 'free'; draft.quantity = ''
  expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ position: { mode: 'free' }, orientation: { pitchYaw: 'free', roll: 'free' } })
  draft.lineMode = 'percent'; for (const invalid of ['', '-1', '101', 'Infinity']) { draft.quantity = invalid; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow() }
  draft.quantity = '100'; expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ position: { mode: 'percent', percent: 100, reverse: true } })
  draft.lineMode = 'distance'; draft.quantity = '-1'; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow()
})
it('requires an atomic current circular arc/material endpoint and explicit Free domain, with no LINE purpose substitution', () => {
  const draft = configuredCompoundUiDraft('unused', saved('circular')); draft.circularMode = 'free'; draft.domain = 'support-circle'
  expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ position: { mode: 'free', domain: 'support-circle' } })
  draft.domain = 'trim'; expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ position: { mode: 'free', domain: 'trim' } })
  draft.circularPath = { ...arc(), startVertex: vertex('a', 'ui-other-end').vertex }
  expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/arco/)
  draft.circularPath = { ...arc(), edge: edge('a').edge }; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/arco/)
  draft.circularPath = arc(); draft.circularMode = 'coordinate'; draft.quantity = '0'
  expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ position: { mode: 'coordinate', distanceMm: 0 } })
})
it.each(['line', 'circular'] as const)('normalizes %s guide property order while refusing stale namespace/body/face or principal-plane UP', id => {
  const draft = configuredCompoundUiDraft('unused', saved(id)), g = guide()
  draft.guide = { support: 'plane', face: { key: g.face.key, sourceFeatureId: g.face.sourceFeatureId }, body: g.body, component: { definition: { revision: 'r1', id: 'configuration-A' }, occurrencePath: ['a'] }, kind: 'face' }
  expect(configuredCompoundUiProposal(draft, choices())).toMatchObject({ orientation: { roll: { guide: g } } })
  draft.guide.component.definition.revision = 'stale'; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/UP/)
  draft.guide = { ...g, body: { bodyId: 'other', sourceFeatureId: 'solid' } }; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/UP/)
  draft.guide = { ...g, face: { ...g.face, key: 'other' } }; expect(() => configuredCompoundUiProposal(draft, choices())).toThrow(/UP/)
})
it.each(forms)('rejects missing, stale or ambiguous current %s catalogs without changing the draft', id => {
  const draft = configuredCompoundUiDraft('unused', saved(id)), before = JSON.stringify(draft), c = choices()
  const empty = { profileFaces: [], profileEdges: [], points: [], lineEdges: [], circularPaths: [], guides: [] }
  expect(() => configuredCompoundUiProposal(draft, empty)).toThrow()
  if (id.startsWith('profile')) c.profileFaces.push(c.profileFaces[0]); else c.points.push(c.points.at(-1)!)
  expect(() => configuredCompoundUiProposal(draft, c)).toThrow()
  expect(JSON.stringify(draft)).toBe(before)
})
it.each(forms)('compares complete selected-state %s intent and keeps preview, history and input ownership separate', id => {
  const original = saved(id), document = fixture(), before = serializeAssemblyConfiguredDocument(document), history = new AssemblyConfiguredDocumentHistory(document)
  const draft = configuredCompoundUiDraft(original.id, original), proposed = configuredCompoundUiProposal(draft, choices())
  const edit: AssemblyConfiguredMateEdit = { ...target, change: { kind: 'add', mate: proposed } }, candidate = applyAssemblyConfiguredMateEdit(document, edit)
  expect(configuredMateUiPreviewMatches(candidate, edit)).toBe(true); expect(history.current).toEqual(document); expect(serializeAssemblyConfiguredDocument(document)).toBe(before)
  for (const changed of [{ ...edit, scopePath: ['left'] }, { ...edit, configuration: null }, { ...edit, definition: { ...target.definition, revision: 'stale' } }]) expect(configuredMateUiPreviewMatches(candidate, changed)).toBe(false)
  const tampered = structuredClone(edit); if (tampered.change.kind !== 'add') throw Error('add fixture')
  if (tampered.change.mate.type === 'profile-center') tampered.change.mate.first.face.body = { bodyId: 'other', sourceFeatureId: 'solid' }
  else if (tampered.change.mate.type === 'line-path' || tampered.change.mate.type === 'circular-path') tampered.change.mate.path.startVertex.key = 'other'
  expect(configuredMateUiPreviewMatches(candidate, tampered)).toBe(false)
  history.commitDocument(candidate); expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(candidate)
})
it.each(forms)('renders the real controlled %s fields and disables the entire form during preview without invoking callbacks', id => {
  const draft = configuredCompoundUiDraft('unused', saved(id)), callbacks = { onChange: vi.fn(), onPreview: vi.fn(), onClose: vi.fn() }, c = choices()
  const html = renderToStaticMarkup(<ConfiguredAssemblyCompoundPanel draft={draft} choices={c} disabled={false} {...callbacks} />)
  for (const label of ['Tipo de relación compuesta configurada', 'Nombre de relación compuesta configurada', 'Vista previa de relación compuesta configurada']) expect(html).toContain(label)
  if (id.startsWith('profile')) { expect(html).toContain('Cara del perfil 1 configurado'); if (id === 'profile-rectangle') expect(html).toContain('Arista material del perfil 2 configurado') }
  else { const p = id === 'line' ? 'LINE configurado' : 'circular configurado'; for (const label of ['Punto del trayecto ', 'Guía UP del trayecto ', 'Eje de orientación del trayecto ']) expect(html).toContain(label + p) }
  expect(html).not.toContain('textarea'); expect(html).not.toContain('QX')
  const locked = renderToStaticMarkup(<ConfiguredAssemblyCompoundPanel draft={draft} choices={c} disabled {...callbacks} />)
  expect(locked).toMatch(/<button(?=[^>]*disabled="")[^>]*>Vista previa de relación compuesta configurada/)
  expect(locked.match(/<(?:input|select)(?=[^>]*disabled="")/g)?.length).toBe(locked.match(/<(?:input|select)\b/g)?.length)
  expect(callbacks.onChange).not.toHaveBeenCalled(); expect(callbacks.onPreview).not.toHaveBeenCalled(); expect(callbacks.onClose).not.toHaveBeenCalled()
})
it('rejects old callbacks after compound face, origin, mode, quantity, each orientation flag and full context or scene changes', () => {
  const document = fixture(), draft = configuredCompoundUiDraft('unused', saved('line')), context = configuredUiTicket(document, 7, '["right"]', 'original.solidflow', 'b', 1)
  const ticket = { context, revision: 1, draft: JSON.stringify(draft), sceneId: 'actual-scene' }
  const patches = [{ lineOrigin: vertex('a', 'ui-other-end').vertex }, { type: 'circular-path' }, { lineMode: 'free' }, { quantity: '10' }, { following: false }, { followAxis: 'z' }, { followReverse: false }, { upEnabled: false }, { upAxis: 'y' }, { upReverse: true }]
  for (const patch of patches) expect(configuredMateUiTicketMatches(ticket, { ...ticket, draft: JSON.stringify({ ...draft, ...patch }) })).toBe(false)
  for (const changed of [{ ...ticket, revision: 2 }, { ...ticket, sceneId: 'other' }, { ...ticket, context: { ...context, generation: 8 } }, { ...ticket, context: { ...context, scope: '[]' } }]) expect(configuredMateUiTicketMatches(ticket, changed)).toBe(false)
})
