import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyExample } from '../examples/assembly'
import { applyAssemblyEdit } from '../model/assemblyEditing'
import { serializeAssemblyDocument, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference, type AssemblySphereTangentMate, type AssemblySphereTangentReference } from '../model/assemblyDocument'
import type { AssemblySphereTangentMateType } from '../model/assemblySphereTangentMates'
import type { AssemblySphericalTangencySupportReport } from '../cad/kernel.assembly-types'
import AssemblySphereTangentMatePanel, { AssemblySphereTangentSupportSummary, assemblySphereTangentUiBranch, assemblySphereTangentUiEdit, assemblySphereTangentUiProposal, assemblySphereTangentUiReady, assemblySphereTangentUiReports, type AssemblySphereTangentMatePanelProps, type AssemblySphereTangentUiFields } from './AssemblySphereTangentMatePanel'

// Symbolic declarations and SSR only. Reference purpose here does not prove the
// example part has native spherical geometry; fresh authority belongs to CAD.
function spherical(path = 'right'): AssemblySphereSurfaceReference {
  return { kind: 'face', component: { occurrencePath: [path], definition: { id: 'example-pin', revision: 'r1' } }, body: { bodyId: 'pin-body', sourceFeatureId: 'bore' }, face: { sourceFeatureId: 'bore', key: 'face-v1|' + 'b'.repeat(64) }, support: 'sphere-surface' }
}
function endpoints(type: AssemblySphereTangentMateType): [AssemblySphereTangentReference, AssemblySphereTangentReference] {
  return [type === 'plane-sphere-tangent' ? { kind: 'principal-plane', component: null, plane: 'XY' }
    : type === 'sphere-sphere-tangent' ? spherical('left') : { ...spherical('left'), support: 'cylinder-surface' } as AssemblyCylinderSurfaceReference, spherical()]
}
function fields(type: AssemblySphereTangentMateType, internal = false): AssemblySphereTangentUiFields {
  return type === 'plane-sphere-tangent' ? { type, name: 'Original sphere support', side: 'positive' }
    : { type, name: 'Original sphere support', branch: internal ? { kind: 'internal', larger: 'second' } : { kind: 'external' } }
}
function props(type: AssemblySphereTangentMateType = 'plane-sphere-tangent'): AssemblySphereTangentMatePanelProps {
  const [first, second] = endpoints(type)
  return { type, first, second, firstLabel: 'First support', secondLabel: 'Second sphere R3', name: 'Original sphere support', side: 'positive', branchKind: 'external', larger: '', editing: false, disabled: false,
    onName: vi.fn(), onSide: vi.fn(), onBranch: vi.fn(), onLarger: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() }
}
function documentWithMate(type: AssemblySphereTangentMateType = 'plane-sphere-tangent') {
  return applyAssemblyEdit(createAssemblyExample(), { type: 'add-mate', mate: assemblySphereTangentUiProposal(...endpoints(type), fields(type)) })
}
function report(document = documentWithMate()): AssemblySphericalTangencySupportReport {
  const mate = document.mates[0] as AssemblySphereTangentMate, common = { scopePath: [], mateId: mate.id, normalRelation: 'opposed' as const, supportOnly: true as const }
  return mate.type === 'plane-sphere-tangent' ? { ...common, kind: mate.type, side: mate.side, sphereRadialMaterialSense: 1 }
    : { ...common, kind: mate.type, branch: structuredClone(mate.branch), radialMaterialSense: { first: 1, second: 1 } }
}
it.each([['plane-sphere-tangent', false], ['plane-sphere-tangent', true], ['sphere-sphere-tangent', false], ['sphere-sphere-tangent', true], ['cylinder-sphere-tangent', false], ['cylinder-sphere-tangent', true]] as const)('creates explicit %s intent reversed=%s without geometry or axis invention', (type, reverse) => {
  const refs = endpoints(type), first = refs[reverse ? 1 : 0], second = refs[reverse ? 0 : 1], before = JSON.stringify([first, second]), value = assemblySphereTangentUiProposal(first, second, fields(type))
  expect(value).toMatchObject({ type, first, second, suppressed: false }); expect(value.first).not.toBe(first); expect(JSON.stringify([first, second])).toBe(before)
  expect('radius' in value || 'center' in value || 'axis' in value || 'id' in value).toBe(false)
  expect('branch' in value).toBe(type !== 'plane-sphere-tangent'); expect('side' in value).toBe(type === 'plane-sphere-tangent')
})
it.each([['sphere-sphere-tangent', 'first'], ['sphere-sphere-tangent', 'second'], ['cylinder-sphere-tangent', 'first'], ['cylinder-sphere-tangent', 'second']] as const)('preserves %s internal larger=%s explicitly without selecting from radii', (type, larger) => {
  const value = assemblySphereTangentUiProposal(...endpoints(type), { type, name: 'Internal', branch: { kind: 'internal', larger } })
  expect('branch' in value && value.branch).toEqual({ kind: 'internal', larger }); expect(assemblySphereTangentUiBranch('internal', '')).toBeNull()
})
it.each(['positive', 'negative'] as const)('retains plane-oriented %s side with reversed endpoints', side => {
  const [first, second] = endpoints('plane-sphere-tangent'), value = assemblySphereTangentUiProposal(second, first, { type: 'plane-sphere-tangent', name: 'Signed', side })
  expect(value).toMatchObject({ type: 'plane-sphere-tangent', side, first: second, second: first }); expect('alignment' in value).toBe(false)
})
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('edits %s preserving ID/refs/suppression and rejects family conversion', type => {
  const document = documentWithMate(type), mate = document.mates[0] as AssemblySphereTangentMate; mate.suppressed = true
  const before = serializeAssemblyDocument(document), editFields = fields(type, true); editFields.name = 'Edited'
  const updated = applyAssemblyEdit(document, { type: 'update-mate', mateId: mate.id, mate: assemblySphereTangentUiEdit(mate, editFields) })
  expect(updated.mates[0]).toMatchObject({ id: mate.id, type, name: 'Edited', first: mate.first, second: mate.second, suppressed: true }); expect(updated.mates).toHaveLength(1); expect(serializeAssemblyDocument(document)).toBe(before)
  expect(() => assemblySphereTangentUiEdit(mate, fields(type === 'plane-sphere-tangent' ? 'sphere-sphere-tangent' : 'plane-sphere-tangent'))).toThrow('Cierra la edición')
})
it.each(['axis', 'line', 'two-planes', 'two-cylinders', 'ps-cylinder', 'ss-plane', 'cs-two-spheres', 'missing-metadata-purpose'] as const)('rejects %s instead of coercing another surface purpose', fault => {
  let type: AssemblySphereTangentMateType = 'plane-sphere-tangent', [first, second] = endpoints(type)
  if (fault === 'axis') second = { ...spherical(), support: 'axis' } as unknown as AssemblySphereTangentReference
  if (fault === 'line') second = { kind: 'edge', component: spherical().component, body: null, edge: { sourceFeatureId: 'bore', key: 'edge-v1|original' }, support: 'line' } as unknown as AssemblySphereTangentReference
  if (fault === 'two-planes') second = first
  if (fault === 'two-cylinders') { type = 'cylinder-sphere-tangent'; first = { ...spherical('left'), support: 'cylinder-surface' }; second = { ...spherical(), support: 'cylinder-surface' } }
  if (fault === 'ps-cylinder') first = { ...spherical('left'), support: 'cylinder-surface' }
  if (fault === 'ss-plane') type = 'sphere-sphere-tangent'
  if (fault === 'cs-two-spheres') { type = 'cylinder-sphere-tangent'; first = spherical('left') }
  if (fault === 'missing-metadata-purpose') second = { ...spherical(), support: 'sphere' } as unknown as AssemblySphereTangentReference
  expect(assemblySphereTangentUiReady(first, second, fields(type))).toBe(false)
})
it.each([['plane-sphere-tangent', false], ['plane-sphere-tangent', true], ['sphere-sphere-tangent', false], ['sphere-sphere-tangent', true], ['cylinder-sphere-tangent', false], ['cylinder-sphere-tangent', true]] as const)('renders only %s parameters and blocks controls while pending, editing=%s', (type, editing) => {
  const p = { ...props(type), branchKind: 'internal' as const, larger: 'second' as const, editing, disabled: true }, html = renderToStaticMarkup(<AssemblySphereTangentMatePanel {...p} />)
  expect(html).toContain('Interna no garantiza contención'); expect(html).toContain('No añade rodadura'); expect(html).toMatch(/<input(?=[^>]*aria-label="Nombre de la relación")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa de la (?:nueva tangencia con esfera|tangencia con esfera editada)")(?=[^>]*disabled="")[^>]*>/)
  expect(html.includes('Lado de la esfera respecto al plano')).toBe(type === 'plane-sphere-tangent'); expect(html.includes('Rama de tangencia con superficies esféricas')).toBe(type !== 'plane-sphere-tangent')
  expect(html).not.toContain('Orientación de la relación'); if (editing) expect(html).toContain('La edición conserva la familia y las referencias')
  expect(p.onPreview).not.toHaveBeenCalled()
})
it.each(['missing-first', 'missing-second', 'blank-name', 'missing-larger'] as const)('blocks incomplete %s authoring', fault => {
  const p = props('sphere-sphere-tangent'); if (fault === 'missing-first') p.first = null; if (fault === 'missing-second') p.second = null; if (fault === 'blank-name') p.name = ' '; if (fault === 'missing-larger') p.branchKind = 'internal'
  expect(renderToStaticMarkup(<AssemblySphereTangentMatePanel {...p} />)).toMatch(/<button(?=[^>]*aria-label="Vista previa de la nueva tangencia con esfera")(?=[^>]*disabled="")[^>]*>/)
})
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('clones the display-consistent %s report', type => {
  const document = documentWithMate(type), value = report(document), result = assemblySphereTangentUiReports(document, [value])
  expect(result).toEqual([value]); expect(result[0]).not.toBe(value); result[0].scopePath.push('local'); expect(value.scopePath).toEqual([])
})
it.each(['wrong-id', 'wrong-family', 'wrong-side', 'wrong-branch', 'wrong-sense', 'wrong-normal', 'not-support-only', 'duplicate', 'suppressed'] as const)('hides inconsistent %s reports instead of claiming verification', fault => {
  const document = documentWithMate(fault === 'wrong-branch' ? 'sphere-sphere-tangent' : 'plane-sphere-tangent'), value = report(document)
  if (fault === 'wrong-id') value.mateId = 'missing'
  if (fault === 'wrong-family') value.kind = 'cylinder-sphere-tangent'
  if (fault === 'wrong-side' && value.kind === 'plane-sphere-tangent') value.side = 'negative'
  if (fault === 'wrong-branch' && value.kind !== 'plane-sphere-tangent') value.branch = { kind: 'internal', larger: 'first' }
  if (fault === 'wrong-sense' && value.kind === 'plane-sphere-tangent') value.sphereRadialMaterialSense = 0 as 1
  if (fault === 'wrong-normal') value.normalRelation = 'same'
  if (fault === 'not-support-only') value.supportOnly = false as true
  if (fault === 'suppressed') document.mates[0].suppressed = true
  expect(assemblySphereTangentUiReports(document, fault === 'duplicate' ? [value, value] : [value])).toEqual([])
})
it.each(['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('renders the named %s report with support-only limits', type => {
  const document = documentWithMate(type), html = renderToStaticMarkup(<AssemblySphereTangentSupportSummary document={document} reports={[report(document)]} />)
  expect(html).toContain('<strong>Original sphere support</strong>'); expect(html).toContain('normales de soporte opuestas'); expect(html).toContain('no comprueba contacto entre caras finitas, contención, ausencia de interferencia ni rodadura')
  expect(renderToStaticMarkup(<AssemblySphereTangentSupportSummary document={document} reports={[]} />)).toBe('')
})
it('binds reused scope names by complete occurrence path and hides a suppressed expansion', () => {
  const document = documentWithMate(), value = report(document), definition = { id: 'original-spherical-scope', revision: 'r1' }
  document.definitions.push({ kind: 'assembly', ...definition, name: 'Original shared sphere declaration', createdAt: document.createdAt, updatedAt: document.updatedAt, occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) })
  const original = document.occurrences[0]; document.occurrences = ['a', 'b'].map(id => ({ ...structuredClone(original), id, name: 'Named ' + id, definition: { ...definition } })); document.mates = []
  const values = ['a', 'b'].map(id => ({ ...structuredClone(value), scopePath: [id] })), html = renderToStaticMarkup(<AssemblySphereTangentSupportSummary document={document} reports={values} />)
  expect(html).toContain('Named a'); expect(html).toContain('Named b'); document.occurrences[1].suppressed = true
  expect(assemblySphereTangentUiReports(document, [values[1]])).toEqual([]); expect(assemblySphereTangentUiReports(document, [{ ...value, scopePath: ['missing'] }])).toEqual([])
})
