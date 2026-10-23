import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyExample } from '../examples/assembly'
import { applyAssemblyEdit } from '../model/assemblyEditing'
import { serializeAssemblyDocument, type AssemblyTangentReference } from '../model/assemblyDocument'
import type { AssemblyTangentSupportReport } from '../cad/kernel.assembly-types'
import AssemblyTangentMatePanel, { AssemblyTangentSupportSummary, assemblyTangentUiEdit, assemblyTangentUiProposal, assemblyTangentUiReady, assemblyTangentUiReports,
  type AssemblyTangentMatePanelProps, type AssemblyUiTangentMate } from './AssemblyTangentMatePanel'

// Original symbolic declarations/SSR. No native authority, worker response,
// geometric solve, event navigation or accepted Apply is fabricated here.
const plane: AssemblyTangentReference = { kind: 'principal-plane', component: null, plane: 'XY' }
function surface(): AssemblyTangentReference {
  return { kind: 'face', component: { occurrencePath: ['left'], definition: { id: 'example-pin', revision: 'r1' } },
    body: { bodyId: 'pin-body', sourceFeatureId: 'bore' }, face: { sourceFeatureId: 'bore', key: 'face-v1|' + 'b'.repeat(64) }, support: 'cylinder-surface' }
}
function props(): AssemblyTangentMatePanelProps {
  return { first: plane, second: surface(), name: 'Original tangency', side: 'positive', editing: false, disabled: false,
    onName: vi.fn(), onSide: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() }
}
function documentWithTangent(side: 'positive' | 'negative' = 'positive') {
  return applyAssemblyEdit(createAssemblyExample(), { type: 'add-mate', mate: assemblyTangentUiProposal(plane, surface(), { name: 'Original tangency', side }) })
}
function report(document = documentWithTangent()): AssemblyTangentSupportReport {
  return { scopePath: [], mateId: document.mates[0].id, side: 'positive', radialMaterialSense: 1, normalRelation: 'opposed', supportOnly: true }
}
it.each([['positive', false], ['positive', true], ['negative', false], ['negative', true]] as const)('builds explicit %s surface intent in reverse order=%s', (side, reverse) => {
  const first = reverse ? surface() : plane, second = reverse ? plane : surface(), before = JSON.stringify([first, second])
  const mate = assemblyTangentUiProposal(first, second, { name: 'Tangency', side })
  expect(mate).toMatchObject({ type: 'tangent', side, first, second, suppressed: false })
  expect('alignment' in mate).toBe(false); expect('radius' in mate).toBe(false); expect('id' in mate).toBe(false)
  expect('first' in mate && mate.first).not.toBe(first); expect(JSON.stringify([first, second])).toBe(before)
})
it('updates side/name through the editing layer without replacing identity, endpoints or suppression', () => {
  const original = documentWithTangent(), mate = original.mates[0] as AssemblyUiTangentMate; mate.suppressed = true
  const before = serializeAssemblyDocument(original)
  const updated = applyAssemblyEdit(original, { type: 'update-mate', mateId: mate.id, mate: assemblyTangentUiEdit(mate, { name: 'Edited', side: 'negative' }) })
  expect(updated.mates).toHaveLength(1); expect(updated.mates[0]).toMatchObject({ ...mate, name: 'Edited', side: 'negative', suppressed: true })
  expect(serializeAssemblyDocument(original)).toBe(before)
})
it.each([0, 1])('rejects missing endpoint%s before forming intent', index => {
  expect(() => assemblyTangentUiProposal(index === 0 ? null : plane, index === 1 ? null : surface(), { name: 'Missing', side: 'positive' })).toThrow('Selecciona')
})
it.each(['two-planes', 'two-surfaces', 'axis-purpose', 'line-purpose'] as const)('rejects %s rather than silently converting another reference purpose', fault => {
  const second = fault === 'two-planes' ? plane : fault === 'axis-purpose' ? { ...surface(), support: 'axis' }
    : fault === 'line-purpose' ? { kind: 'edge', component: { occurrencePath: ['left'], definition: { id: 'example-pin', revision: 'r1' } }, body: null, edge: { sourceFeatureId: 'bore', key: 'edge-v1|original' }, support: 'line' } : surface()
  const first = fault === 'two-surfaces' ? surface() : plane
  expect(() => assemblyTangentUiProposal(first, second as AssemblyTangentReference, { name: 'Invalid purpose', side: 'positive' })).toThrow()
  expect(assemblyTangentUiReady(first, second as AssemblyTangentReference)).toBe(false)
})
it('rejects a blank name and invalid side without changing the references', () => {
  const second = surface(), before = JSON.stringify(second)
  expect(() => assemblyTangentUiProposal(plane, second, { name: ' ', side: 'positive' })).toThrow('nombre')
  expect(() => assemblyTangentUiProposal(plane, second, { name: 'Invalid', side: 'other' as 'positive' })).toThrow('side')
  expect(JSON.stringify(second)).toBe(before)
})
it.each(['positive', 'negative'] as const)('renders %s with side relative to the plane and no axis/offset/alignment parameter', side => {
  const p = { ...props(), side }, html = renderToStaticMarkup(<AssemblyTangentMatePanel {...p} />)
  expect(html).toContain('Lado del cilindro respecto al plano'); expect(html).toContain('normal del plano')
  expect(html).toContain('superficie'); expect(html).toContain('soportes infinitos'); expect(html).toContain('no garantiza contacto')
  expect(html).not.toContain('Orientación de la relación'); expect(html).not.toContain('type="number"'); expect(p.onPreview).not.toHaveBeenCalled()
})
it.each([false, true])('blocks controls during pending work, editing=%s', editing => {
  const html = renderToStaticMarkup(<AssemblyTangentMatePanel {...props()} editing={editing} disabled />)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Nombre de la relación")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<select(?=[^>]*aria-label="Lado del cilindro respecto al plano")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa de la (?:nueva tangencia|tangencia editada)")(?=[^>]*disabled="")[^>]*>/)
  if (editing) expect(html).toContain('Cerrar edición de tangencia')
})
it.each(['missing', 'same-kind', 'blank-name'] as const)('keeps preview blocked for %s', fault => {
  const p = props(); if (fault === 'missing') p.second = null; else if (fault === 'same-kind') p.second = plane; else p.name = ''
  expect(renderToStaticMarkup(<AssemblyTangentMatePanel {...p} />)).toMatch(/<button(?=[^>]*aria-label="Vista previa de la nueva tangencia")(?=[^>]*disabled="")[^>]*>/)
})
it.each([['positive', 1, 'opposed'], ['positive', -1, 'same'], ['negative', 1, 'same'], ['negative', -1, 'opposed']] as const)('retains consistent symbolic support report %s/%s', (side, radialMaterialSense, normalRelation) => {
  const document = documentWithTangent(side), value = { ...report(document), side, radialMaterialSense, normalRelation }
  const reports = assemblyTangentUiReports(document, [value]); expect(reports).toEqual([value]); expect(reports[0]).not.toBe(value)
})
it.each(['wrong-id', 'wrong-side', 'wrong-normal', 'wrong-sense', 'not-support-only', 'duplicate', 'wrong-scope', 'suppressed'] as const)('hides inconsistent %s report instead of displaying a verified claim', fault => {
  const document = documentWithTangent(), value = report(document)
  if (fault === 'wrong-id') value.mateId = 'other'
  if (fault === 'wrong-side') value.side = 'negative'
  if (fault === 'wrong-normal') value.normalRelation = 'same'
  if (fault === 'wrong-sense') value.radialMaterialSense = 0 as 1
  if (fault === 'not-support-only') value.supportOnly = false as true
  if (fault === 'wrong-scope') value.scopePath = ['absent']
  if (fault === 'suppressed') document.mates[0].suppressed = true
  expect(assemblyTangentUiReports(document, fault === 'duplicate' ? [value, value] : [value])).toEqual([])
})
function nestedReports() {
  const document = documentWithTangent(), value = report(document), definition = { id: 'original-tangent-subassembly', revision: 'r1' }
  document.definitions.push({ kind: 'assembly', ...definition, name: 'Original reused scope', createdAt: document.createdAt, updatedAt: document.updatedAt,
    occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) })
  const original = document.occurrences[0]
  document.occurrences = ['sub-a', 'sub-b'].map(id => ({ ...structuredClone(original), id, definition: { ...definition } })); document.mates = []
  return { document, values: ['sub-a', 'sub-b'].map(id => ({ ...structuredClone(value), scopePath: [id] })) }
}
it('binds reused-scope reports by complete expansion path while retaining one local mate identity', () => {
  const { document, values } = nestedReports(), before = JSON.stringify(values)
  const actual = assemblyTangentUiReports(document, values); expect(actual).toHaveLength(2)
  expect(actual.map(value => value.scopePath)).toEqual([['sub-a'], ['sub-b']]); actual[0].scopePath[0] = 'local-mutation'
  expect(JSON.stringify(values)).toBe(before)
})
it('hides a report belonging to a suppressed scope instead of treating a reused mate ID as active', () => {
  const { document, values } = nestedReports(); document.occurrences[1].suppressed = true
  expect(assemblyTangentUiReports(document, [values[1]])).toEqual([])
})
it('renders support-normal sense separately and makes no finite-contact or overlap claim', () => {
  const document = documentWithTangent(), html = renderToStaticMarkup(<AssemblyTangentSupportSummary document={document} reports={[report(document)]} />)
  expect(html).toContain('Tangencias de soportes verificadas'); expect(html).toContain('normales de soporte opuestas')
  expect(html).toContain('<strong>Original tangency</strong>')
  expect(html).toContain('no comprueba recortes finitos, interferencia ni contacto')
  expect(renderToStaticMarkup(<AssemblyTangentSupportSummary document={document} reports={[]} />)).toBe('')
})
it('labels the same local mate in reused scopes by occurrence names and hides stale summary data', () => {
  const { document, values } = nestedReports(); document.occurrences[0].name = 'Scope A'; document.occurrences[1].name = 'Scope B'
  const html = renderToStaticMarkup(<AssemblyTangentSupportSummary document={document} reports={values} />)
  expect(html).toContain('Scope A'); expect(html).toContain('Scope B'); expect(html.match(/<strong>Original tangency<\/strong>/g)).toHaveLength(2)
  expect(renderToStaticMarkup(<AssemblyTangentSupportSummary document={document} reports={[{ ...values[0], side: 'negative' }]} />)).toBe('')
})
