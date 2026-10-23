import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyExample } from '../examples/assembly'
import { applyAssemblyEdit } from '../model/assemblyEditing'
import { serializeAssemblyDocument, type AssemblyCylinderSurfaceReference, type AssemblyCylinderTangentMate } from '../model/assemblyDocument'
import type { AssemblyCylinderTangencySupportReport } from '../cad/kernel.assembly-types'
import AssemblyCylinderTangentMatePanel, { AssemblyCylinderTangentSupportSummary, assemblyCylinderTangentUiBranch, assemblyCylinderTangentUiEdit, assemblyCylinderTangentUiProposal, assemblyCylinderTangentUiReady, assemblyCylinderTangentUiReports, type AssemblyCylinderTangentMatePanelProps } from './AssemblyCylinderTangentMatePanel'

// Original symbolic declarations and SSR only; no native geometry or accepted
// preview capability is supplied by these tests. Real navigation is desktop-owned.
function surface(path = 'left'): AssemblyCylinderSurfaceReference {
  return { kind: 'face', component: { occurrencePath: [path], definition: { id: 'example-pin', revision: 'r1' } },
    body: { bodyId: 'pin-body', sourceFeatureId: 'bore' }, face: { sourceFeatureId: 'bore', key: 'face-v1|' + 'b'.repeat(64) }, support: 'cylinder-surface' }
}
function props(): AssemblyCylinderTangentMatePanelProps {
  return { type: 'skew-cylinder-tangent', first: surface(), second: surface('right'), firstLabel: 'Left R2', secondLabel: 'Right R3', name: 'Original cylindrical supports', branchKind: 'external', larger: '', editing: false, disabled: false,
    onName: vi.fn(), onBranch: vi.fn(), onLarger: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() }
}
function documentWithMate(type: AssemblyCylinderTangentMate['type'] = 'skew-cylinder-tangent', internal = false) {
  return applyAssemblyEdit(createAssemblyExample(), { type: 'add-mate', mate: assemblyCylinderTangentUiProposal(surface(), surface('right'), { type, name: 'Original cylindrical supports', branch: internal ? { kind: 'internal', larger: 'second' } : { kind: 'external' } }) })
}
function report(document = documentWithMate()): AssemblyCylinderTangencySupportReport {
  const mate = document.mates[0] as AssemblyCylinderTangentMate
  return { kind: mate.type, scopePath: [], mateId: mate.id, branch: structuredClone(mate.branch), radialMaterialSense: { first: 1, second: 1 }, normalRelation: mate.branch.kind === 'external' ? 'opposed' : 'same', supportOnly: true }
}
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('builds %s without axis conversion or geometry claims', type => {
  const first = surface(), second = surface('right'), before = JSON.stringify([first, second])
  const value = assemblyCylinderTangentUiProposal(first, second, { type, name: 'Supports', branch: { kind: 'external' } })
  expect(value).toMatchObject({ type, first, second, branch: { kind: 'external' }, suppressed: false }); expect(value.first).not.toBe(first)
  expect('alignment' in value || 'radius' in value || 'id' in value).toBe(false); expect(JSON.stringify([first, second])).toBe(before)
})
it.each(['first', 'second'] as const)('preserves explicit internal larger=%s and reversed endpoint intent', larger => {
  const value = assemblyCylinderTangentUiProposal(surface('right'), surface(), { type: 'skew-cylinder-tangent', name: 'Internal', branch: { kind: 'internal', larger } })
  expect(value.branch).toEqual({ kind: 'internal', larger }); expect(value.first.component.occurrencePath).toEqual(['right'])
})
it('requires a fresh explicit larger role instead of choosing from displayed radius labels', () => {
  expect(assemblyCylinderTangentUiBranch('external', '')).toEqual({ kind: 'external' })
  expect(assemblyCylinderTangentUiBranch('internal', '')).toBeNull()
  expect(assemblyCylinderTangentUiBranch('internal', 'first')).toEqual({ kind: 'internal', larger: 'first' })
  const p = { ...props(), branchKind: 'internal' as const }
  expect(renderToStaticMarkup(<AssemblyCylinderTangentMatePanel {...p} />)).toMatch(/<button(?=[^>]*aria-label="Vista previa de la nueva tangencia entre cilindros")(?=[^>]*disabled="")[^>]*>/)
})
it.each([0, 1])('rejects missing surface %s', index => {
  expect(() => assemblyCylinderTangentUiProposal(index ? surface() : null, index ? null : surface('right'), { type: 'skew-cylinder-tangent', name: 'Missing', branch: { kind: 'external' } })).toThrow('Selecciona dos')
})
it.each(['axis', 'plane', 'edge'] as const)('rejects %s purpose rather than creating a cylinder surface', support => {
  const invalid = support === 'edge' ? { kind: 'edge', component: surface().component, body: null, edge: { sourceFeatureId: 'bore', key: 'edge-v1|original' }, support: 'line' } : { ...surface(), support }
  expect(() => assemblyCylinderTangentUiProposal(invalid as unknown as AssemblyCylinderSurfaceReference, surface('right'), { type: 'skew-cylinder-tangent', name: 'Invalid', branch: { kind: 'external' } })).toThrow()
})
it.each(['name', 'branch', 'family'] as const)('rejects invalid %s intent before preview', fault => {
  const fields = { type: 'skew-cylinder-tangent' as const, name: fault === 'name' ? ' ' : 'Invalid', branch: fault === 'branch' ? null : { kind: 'external' as const } }
  if (fault === 'family') fields.type = 'tangent' as typeof fields.type
  expect(assemblyCylinderTangentUiReady(surface(), surface('right'), fields)).toBe(false)
})
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('edits %s branch/name preserving identity, refs and suppression', type => {
  const document = documentWithMate(type), mate = document.mates[0] as AssemblyCylinderTangentMate; mate.suppressed = true
  const before = serializeAssemblyDocument(document), updated = applyAssemblyEdit(document, { type: 'update-mate', mateId: mate.id, mate: assemblyCylinderTangentUiEdit(mate, { type, name: 'Edited', branch: { kind: 'internal', larger: 'second' } }) })
  expect(updated.mates).toHaveLength(1); expect(updated.mates[0]).toMatchObject({ ...mate, name: 'Edited', branch: { kind: 'internal', larger: 'second' }, suppressed: true })
  expect(serializeAssemblyDocument(document)).toBe(before)
  expect(() => assemblyCylinderTangentUiEdit(mate, { type: type === 'skew-cylinder-tangent' ? 'parallel-cylinder-tangent' : 'skew-cylinder-tangent', name: 'Other family', branch: { kind: 'external' } })).toThrow('Cierra la edición')
})
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('renders %s explanation and bounded internal meaning', type => {
  const p = { ...props(), type }, html = renderToStaticMarkup(<AssemblyCylinderTangentMatePanel {...p} />)
  expect(html).toContain(type === 'skew-cylinder-tangent' ? 'ejes no son paralelos' : 'añade paralelismo'); expect(html).toContain('Interna no garantiza contención')
  expect(html).toContain('No añade rodadura'); expect(html).not.toContain('Orientación de la relación'); expect(p.onPreview).not.toHaveBeenCalled()
})
it.each([false, true])('blocks authoring controls while pending, editing=%s', editing => {
  const html = renderToStaticMarkup(<AssemblyCylinderTangentMatePanel {...props()} editing={editing} branchKind="internal" larger="second" disabled />)
  for (const label of ['Nombre de la relación', 'Rama de tangencia entre cilindros', 'Superficie de mayor radio']) expect(html).toMatch(new RegExp('<(?:input|select)(?=[^>]*aria-label="' + label + '")(?=[^>]*disabled="")[^>]*>'))
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa de la (?:nueva tangencia|tangencia) entre cilindros(?: editada)?")(?=[^>]*disabled="")[^>]*>/)
  if (editing) { expect(html).toContain('conserva la variante y las referencias'); expect(html).toContain('Cerrar edición de tangencia entre cilindros') }
})
it.each([['skew-cylinder-tangent', false], ['skew-cylinder-tangent', true], ['parallel-cylinder-tangent', false], ['parallel-cylinder-tangent', true]] as const)('retains display-consistent %s internal=%s report', (type, internal) => {
  const document = documentWithMate(type, internal), value = report(document), actual = assemblyCylinderTangentUiReports(document, [value])
  expect(actual).toEqual([value]); expect(actual[0]).not.toBe(value); actual[0].radialMaterialSense.first = -1; expect(value.radialMaterialSense.first).toBe(1)
})
it.each(['id', 'kind', 'branch', 'sense', 'normal', 'support', 'scope', 'duplicate', 'suppressed'] as const)('hides inconsistent %s support report', fault => {
  const document = documentWithMate(), value = report(document)
  if (fault === 'id') value.mateId = 'absent'
  if (fault === 'kind') value.kind = 'parallel-cylinder-tangent'
  if (fault === 'branch') value.branch = { kind: 'internal', larger: 'first' }
  if (fault === 'sense') value.radialMaterialSense.first = 0 as 1
  if (fault === 'normal') value.normalRelation = 'same'
  if (fault === 'support') value.supportOnly = false as true
  if (fault === 'scope') value.scopePath = ['absent']
  if (fault === 'suppressed') document.mates[0].suppressed = true
  expect(assemblyCylinderTangentUiReports(document, fault === 'duplicate' ? [value, value] : [value])).toEqual([])
})
it('renders the named current mate and radius role without implying finite contact', () => {
  const document = documentWithMate('parallel-cylinder-tangent', true), value = report(document)
  const html = renderToStaticMarkup(<AssemblyCylinderTangentSupportSummary document={document} reports={[value]} />)
  expect(html).toContain('<strong>Original cylindrical supports</strong>'); expect(html).toContain('con paralelismo'); expect(html).toContain('interna · mayor: referencia 2')
  expect(html).toContain('normales de soporte del mismo sentido'); expect(html).toContain('no comprueba contacto entre caras finitas, contención ni ausencia de interferencia')
  expect(renderToStaticMarkup(<AssemblyCylinderTangentSupportSummary document={document} reports={[{ ...value, normalRelation: 'opposed' }]} />)).toBe('')
})
it('distinguishes reused cylinder mate names by complete scope path and omits a suppressed expansion', () => {
  const document = documentWithMate(), value = report(document), definition = { id: 'original-cylinder-subassembly', revision: 'r1' }
  document.definitions.push({ kind: 'assembly', ...definition, name: 'Original reused cylinders', createdAt: document.createdAt, updatedAt: document.updatedAt, occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) })
  const original = document.occurrences[0]; document.occurrences = ['sub-a', 'sub-b'].map(id => ({ ...structuredClone(original), id, name: 'Scope ' + id, definition: { ...definition } })); document.mates = []
  const values = ['sub-a', 'sub-b'].map(id => ({ ...structuredClone(value), scopePath: [id] }))
  expect(assemblyCylinderTangentUiReports(document, values)).toHaveLength(2)
  const html = renderToStaticMarkup(<AssemblyCylinderTangentSupportSummary document={document} reports={values} />)
  expect(html).toContain('Scope sub-a'); expect(html).toContain('Scope sub-b'); document.occurrences[1].suppressed = true
  expect(assemblyCylinderTangentUiReports(document, [values[1]])).toEqual([])
})
