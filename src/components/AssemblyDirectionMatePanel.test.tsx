import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyExample } from '../examples/assembly'
import { applyAssemblyEdit } from '../model/assemblyEditing'
import { serializeAssemblyDocument, type AssemblyGeometryReference } from '../model/assemblyDocument'
import type { AssemblyDirectionAlignment, AssemblyDirectionMateType, AssemblyDirectionSupportKind } from '../model/assemblyDirectionMates'
import AssemblyDirectionMatePanel, { assemblyDirectionUiEdit, assemblyDirectionUiObjective, assemblyDirectionUiProposal, type AssemblyDirectionMatePanelProps, type AssemblyUiDirectionMate } from './AssemblyDirectionMatePanel'

// Original symbolic declarations and SSR only; no native reference, worker
// solve, accepted Apply, pointer event or desktop result is supplied here.
function ref(kind: AssemblyDirectionSupportKind, path = 'left'): AssemblyGeometryReference {
  const component = { occurrencePath: [path], definition: { id: 'example-pin', revision: 'r1' } }, body = { bodyId: 'pin-body', sourceFeatureId: 'bore' }
  return kind === 'line' ? { kind: 'edge', component, body, edge: { sourceFeatureId: 'bore', key: 'edge-v1|' + 'a'.repeat(64) }, support: 'line' }
    : { kind: 'face', component, body, face: { sourceFeatureId: 'bore', key: 'face-v1|' + 'b'.repeat(64) }, support: kind === 'plane' ? 'plane' : 'axis' }
}
function props(type: AssemblyDirectionMateType = 'parallel', first = ref('plane'), second = ref('plane', 'right')): AssemblyDirectionMatePanelProps {
  return { type, first, second, name: 'Original direction', alignment: 'aligned', editing: false, disabled: false,
    onName: vi.fn(), onAlignment: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() }
}
const supportCases: [AssemblyDirectionMateType, AssemblyDirectionSupportKind, AssemblyDirectionSupportKind, boolean, string][] = [
  ['parallel', 'plane', 'plane', true, 'Las normales de los planos quedarán paralelas.'],
  ['perpendicular', 'plane', 'plane', false, 'Las normales de los planos quedarán perpendiculares.'],
  ['parallel', 'cylinder', 'cylinder', true, 'Las direcciones de los ejes o aristas quedarán paralelas.'],
  ['perpendicular', 'cylinder', 'line', false, 'Las direcciones de los ejes o aristas quedarán perpendiculares.'],
  ['parallel', 'line', 'line', true, 'Las direcciones de los ejes o aristas quedarán paralelas.'],
  ['parallel', 'plane', 'cylinder', false, 'El eje o la arista quedará paralelo al plano.'],
  ['perpendicular', 'cylinder', 'plane', true, 'El eje o la arista quedará perpendicular al plano.'],
  ['perpendicular', 'plane', 'line', true, 'El eje o la arista quedará perpendicular al plano.'],
  ['parallel', 'line', 'plane', false, 'El eje o la arista quedará paralelo al plano.'],
]
it.each(supportCases)('renders %s %s/%s with applicable orientation=%s', (type, first, second, orientation, text) => {
  const p = props(type, ref(first), ref(second, 'right')), html = renderToStaticMarkup(<AssemblyDirectionMatePanel {...p} />)
  expect(html).toContain(text); expect(html.includes('aria-label="Orientación de la relación"')).toBe(orientation)
  expect(html).toContain('no une posiciones ni añade contacto'); expect(html).not.toContain('Ángulo de relación')
  expect(p.onPreview).not.toHaveBeenCalled()
})
it('builds a distinct signed direction proposal without an angle field or aliased endpoints', () => {
  const first = ref('plane'), second = ref('plane', 'right'), before = JSON.stringify([first, second])
  const mate = assemblyDirectionUiProposal(first, second, { type: 'parallel', name: 'Signed parallel', alignment: 'opposed' })
  expect(mate).toMatchObject({ type: 'parallel', alignment: 'opposed', name: 'Signed parallel', suppressed: false })
  expect('id' in mate).toBe(false); expect('angle' in mate).toBe(false)
  expect('first' in mate && mate.first).not.toBe(first); expect(JSON.stringify([first, second])).toBe(before)
})
it.each([
  ['parallel', 'plane', 'cylinder', 'aligned'], ['perpendicular', 'plane', 'plane', 'opposed'],
  ['parallel', 'plane', 'plane', null], ['perpendicular', 'plane', 'line', null],
] as const)('rejects inapplicable orientation for %s %s/%s', (type, first, second, alignment) => {
  expect(() => assemblyDirectionUiProposal(ref(first), ref(second, 'right'), { type, name: 'Invalid branch', alignment })).toThrow(/requires/)
})
it('edits name/orientation while the editing layer preserves the saved ID, exact endpoints and suppression', () => {
  const document = createAssemblyExample(), first: AssemblyGeometryReference = { kind: 'principal-plane', component: { occurrencePath: ['left'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'XY' },
    second: AssemblyGeometryReference = { kind: 'principal-plane', component: { occurrencePath: ['right'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'XY' }
  const added = applyAssemblyEdit(document, { type: 'add-mate', mate: { type: 'parallel', name: 'Original saved direction', first, second, alignment: 'aligned', suppressed: true } })
  const mate = added.mates[0] as AssemblyUiDirectionMate, before = serializeAssemblyDocument(added)
  const updated = applyAssemblyEdit(added, { type: 'update-mate', mateId: mate.id, mate: assemblyDirectionUiEdit(mate, { type: 'parallel', name: 'Edited saved direction', alignment: 'opposed' }) })
  expect(updated.mates[0]).toMatchObject({ id: mate.id, type: 'parallel', name: 'Edited saved direction', first, second, alignment: 'opposed', suppressed: true })
  expect(serializeAssemblyDocument(added)).toBe(before)
})
it('changes the family through update-mate without leaving an additional active relation', () => {
  const document = createAssemblyExample(), first: AssemblyGeometryReference = { kind: 'principal-plane', component: null, plane: 'XY' },
    second: AssemblyGeometryReference = { kind: 'principal-plane', component: { occurrencePath: ['left'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'XY' }
  const added = applyAssemblyEdit(document, { type: 'add-mate', mate: { type: 'parallel', name: 'Original direction', first, second, alignment: 'aligned', suppressed: false } })
  const mate = added.mates[0] as AssemblyUiDirectionMate
  const updated = applyAssemblyEdit(added, { type: 'update-mate', mateId: mate.id, mate: assemblyDirectionUiEdit(mate, { type: 'perpendicular', name: mate.name, alignment: null }) })
  expect(updated.mates).toHaveLength(1); expect(updated.mates[0]).toMatchObject({ id: mate.id, type: 'perpendicular', first, second, alignment: null })
})
it.each([0, 1])('rejects missing reference slot %s before creating a proposal', index => {
  expect(() => assemblyDirectionUiProposal(index === 0 ? null : ref('plane'), index === 1 ? null : ref('plane', 'right'), { type: 'parallel', name: 'Missing endpoint', alignment: 'aligned' })).toThrow('dos referencias')
})
it('does not treat an unsupported edge as a line or manufacture its direction', () => {
  const unsupported = { ...ref('line'), support: 'circle' } as unknown as AssemblyGeometryReference
  expect(() => assemblyDirectionUiObjective('parallel', unsupported, ref('plane'))).toThrow('reference')
})
it('rejects blank names without altering the endpoint declarations', () => {
  expect(() => assemblyDirectionUiProposal(ref('plane'), ref('plane', 'right'), { type: 'parallel', name: ' ', alignment: 'aligned' })).toThrow('nombre')
})
it.each([false, true])('blocks proposal controls during pending work (editing=%s)', editing => {
  const p = { ...props(), disabled: true, editing }, html = renderToStaticMarkup(<AssemblyDirectionMatePanel {...p} />)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Nombre de la relación")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<select(?=[^>]*aria-label="Orientación de la relación")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa de la (?:nueva relación direccional|relación direccional editada)")(?=[^>]*disabled="")[^>]*>/)
  expect(p.onPreview).not.toHaveBeenCalled()
})
it.each(['missing reference', 'blank name'])('keeps preview blocked for %s', invalid => {
  const p = props(); if (invalid === 'missing reference') p.first = null; else p.name = ''
  const html = renderToStaticMarkup(<AssemblyDirectionMatePanel {...p} />)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa de la nueva relación direccional")(?=[^>]*disabled="")[^>]*>/)
})
it('labels existing direction editing and explains the preserved-reference/family boundary', () => {
  const html = renderToStaticMarkup(<AssemblyDirectionMatePanel {...props()} editing />)
  expect(html).toContain('La edición conserva las referencias.'); expect(html).toContain('cierra la edición para crear otra familia')
  expect(html).toContain('aria-label="Vista previa de la relación direccional editada"'); expect(html).toContain('aria-label="Cerrar edición de relación direccional"')
})
