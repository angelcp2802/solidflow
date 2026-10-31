import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyExample } from '../examples/assembly'
import { applyAssemblyEdit } from '../model/assemblyEditing'
import { serializeAssemblyDocument, type AssemblyLimitDistanceMate, type AssemblyPlaneReference } from '../model/assemblyDocument'
import type { AssemblyLimitDistanceSupportReport } from '../cad/kernel.assembly-types'
import AssemblyLimitDistanceMatePanel, { AssemblyLimitDistanceSupportSummary, assemblyLimitDistanceUiEdit, assemblyLimitDistanceUiProposal, assemblyLimitDistanceUiReady, assemblyLimitDistanceUiReports, type AssemblyLimitDistanceMatePanelProps, type AssemblyLimitDistanceUiFields } from './AssemblyLimitDistanceMatePanel'

// Symbolic syntax and SSR boundaries only: no native planes, browser events or
// accepted solve are supplied by these declarations.
const first = (): AssemblyPlaneReference => ({ kind: 'face', component: { occurrencePath: ['right'], definition: { id: 'example-pin', revision: 'r1' } }, body: { bodyId: 'pin-body', sourceFeatureId: 'bore' }, face: { sourceFeatureId: 'bore', key: 'face-v1|' + 'b'.repeat(64) }, support: 'plane' })
const second = (): AssemblyPlaneReference => ({ kind: 'principal-plane', component: null, plane: 'XY' })
const fields = (): AssemblyLimitDistanceUiFields => ({ name: 'Signed plane interval', alignment: 'aligned', minimum: '10', maximum: '30' })
function props(): AssemblyLimitDistanceMatePanelProps { return { ...fields(), first: first(), second: second(), editing: false, disabled: false, onName: vi.fn(), onAlignment: vi.fn(), onMinimum: vi.fn(), onMaximum: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() } }
function documentWithMate() { return applyAssemblyEdit(createAssemblyExample(), { type: 'add-mate', mate: assemblyLimitDistanceUiProposal(first(), second(), fields()) }) }
function report(document = documentWithMate()): AssemblyLimitDistanceSupportReport {
  const mate = document.mates[0] as AssemblyLimitDistanceMate
  return { kind: 'limit-distance', scopePath: [], mateId: mate.id, alignment: mate.alignment, limits: { ...mate.limits }, coordinate: 20, activity: 'interior', lengthTolerance: 1e-6, supportOnly: true }
}
it.each([['10', '30'], ['-30', '-10'], ['0', '0'], ['-2.5', '4e1']] as const)('preserves signed [%s,%s] millimeters without converting equal bounds to a lock', (minimum, maximum) => {
  const a = first(), b = second(), before = JSON.stringify([a, b]), value = assemblyLimitDistanceUiProposal(a, b, { ...fields(), minimum, maximum })
  expect(value).toMatchObject({ type: 'limit-distance', limits: { minimum: Number(minimum), maximum: Number(maximum) }, first: a, second: b, suppressed: false })
  expect(value.first).not.toBe(a); expect(value.second).not.toBe(b); expect(JSON.stringify([a, b])).toBe(before); expect('id' in value || 'distance' in value || 'relativePose' in value).toBe(false)
})
it.each(['aligned', 'opposed'] as const)('retains explicit %s orientation and does not sign-flip reversed reference limits', alignment => {
  const value = assemblyLimitDistanceUiProposal(second(), first(), { ...fields(), alignment, minimum: '-30', maximum: '-10' })
  expect(value).toMatchObject({ first: second(), second: first(), alignment, limits: { minimum: -30, maximum: -10 } })
})
it.each(['missing-first', 'missing-second', 'blank-name', 'blank-minimum', 'blank-maximum', 'not-number', 'infinite', 'backwards', 'wrong-orientation'] as const)('blocks incomplete or invalid %s fields', fault => {
  const p = props()
  if (fault === 'missing-first') p.first = null
  if (fault === 'missing-second') p.second = null
  if (fault === 'blank-name') p.name = ' '
  if (fault === 'blank-minimum') p.minimum = ' '
  if (fault === 'blank-maximum') p.maximum = ''
  if (fault === 'not-number') p.minimum = 'not a number'
  if (fault === 'infinite') p.maximum = '1e999'
  if (fault === 'backwards') p.minimum = '31'
  if (fault === 'wrong-orientation') p.alignment = 'other' as 'aligned'
  expect(assemblyLimitDistanceUiReady(p.first, p.second, p)).toBe(false)
  expect(renderToStaticMarkup(<AssemblyLimitDistanceMatePanel {...p} />)).toMatch(/<button(?=[^>]*aria-label="Vista previa del nuevo intervalo entre planos")(?=[^>]*disabled="")[^>]*>/)
})
it.each(['axis', 'cylinder-surface', 'sphere-surface', 'line'] as const)('refuses %s purpose instead of converting it to a plane', support => {
  const ref = support === 'line' ? { kind: 'edge', component: first().component, body: null, edge: { sourceFeatureId: 'bore', key: 'edge-v1|' + 'a'.repeat(64) }, support }
    : { ...first(), support }
  expect(assemblyLimitDistanceUiReady(ref as unknown as AssemblyPlaneReference, second(), fields())).toBe(false)
})
it('edits limits/orientation/name while preserving exact identity, endpoints and suppression', () => {
  const document = documentWithMate(), mate = document.mates[0] as AssemblyLimitDistanceMate; mate.suppressed = true
  const before = serializeAssemblyDocument(document), updated = applyAssemblyEdit(document, { type: 'update-mate', mateId: mate.id,
    mate: assemblyLimitDistanceUiEdit(mate, { name: 'Edited', alignment: 'opposed', minimum: '-5', maximum: '7' }) })
  expect(updated.mates).toHaveLength(1); expect(updated.mates[0]).toMatchObject({ id: mate.id, type: 'limit-distance', name: 'Edited', first: mate.first, second: mate.second, suppressed: true, alignment: 'opposed', limits: { minimum: -5, maximum: 7 } })
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it.each([false, true])('renders signed fields and disabled pending controls, editing=%s', editing => {
  const p = { ...props(), editing, disabled: true }, html = renderToStaticMarkup(<AssemblyLimitDistanceMatePanel {...p} />)
  for (const label of ['Nombre de la relación', 'Orientación de los planos del intervalo', 'Distancia mínima entre planos en mm', 'Distancia máxima entre planos en mm']) expect(html).toMatch(new RegExp('<(?:input|select)(?=[^>]*aria-label="' + label + '")(?=[^>]*disabled="")[^>]*>'))
  expect(html).toContain('normal del segundo plano'); expect(html).toContain('no cambia automáticamente los límites'); expect(html).toContain('El mínimo puede ser igual al máximo')
  expect(html.includes('Cerrar edición del intervalo entre planos')).toBe(editing); if (editing) expect(html).toContain('La edición conserva la familia y las referencias')
  expect(p.onPreview).not.toHaveBeenCalled()
})
it.each([['interior', 20], ['minimum', 10], ['maximum', 30], ['both', 10]] as const)('displays fresh %s proximity without declaring a boundary fixed', (activity, coordinate) => {
  const document = documentWithMate(), value = report(document)
  if (activity === 'both') { (document.mates[0] as AssemblyLimitDistanceMate).limits = { minimum: 10, maximum: 10 }; value.limits = { minimum: 10, maximum: 10 } }
  value.activity = activity; value.coordinate = coordinate
  const result = assemblyLimitDistanceUiReports(document, [value]), html = renderToStaticMarkup(<AssemblyLimitDistanceSupportSummary document={document} reports={[value]} />)
  expect(result).toEqual([value]); expect(result[0]).not.toBe(value); result[0].limits.minimum = -99; expect(value.limits.minimum).toBe(10)
  expect(html).toContain('<strong>Signed plane interval</strong>'); expect(html).toContain('no fija el componente'); expect(html).toContain('relaciones bilaterales'); expect(html).toContain('Soportes infinitos')
})
it.each(['wrong-id', 'wrong-scope', 'wrong-kind', 'wrong-alignment', 'wrong-limits', 'wrong-activity', 'outside', 'nonfinite', 'zero-tolerance', 'not-support-only', 'duplicate', 'suppressed'] as const)('hides inconsistent %s reports', fault => {
  const document = documentWithMate(), value = report(document)
  if (fault === 'wrong-id') value.mateId = 'absent'
  if (fault === 'wrong-scope') value.scopePath = ['absent']
  if (fault === 'wrong-kind') value.kind = 'distance' as 'limit-distance'
  if (fault === 'wrong-alignment') value.alignment = 'opposed'
  if (fault === 'wrong-limits') value.limits.maximum = 40
  if (fault === 'wrong-activity') value.activity = 'maximum'
  if (fault === 'outside') value.coordinate = 31
  if (fault === 'nonfinite') value.coordinate = NaN
  if (fault === 'zero-tolerance') value.lengthTolerance = 0
  if (fault === 'not-support-only') value.supportOnly = false as true
  if (fault === 'suppressed') document.mates[0].suppressed = true
  expect(assemblyLimitDistanceUiReports(document, fault === 'duplicate' ? [value, value] : [value])).toEqual([])
  expect(renderToStaticMarkup(<AssemblyLimitDistanceSupportSummary document={document} reports={[]} />)).toBe('')
})
it('keeps two nearby unequal limits distinct when their precision bands both contain the coordinate', () => {
  const document = documentWithMate(), value = report(document), limits = { minimum: 10, maximum: 10.000001 }
  ;(document.mates[0] as AssemblyLimitDistanceMate).limits = { ...limits }; value.limits = { ...limits }; value.coordinate = 10.0000005; value.activity = 'both'
  expect(assemblyLimitDistanceUiReports(document, [value])).toEqual([value])
  const html = renderToStaticMarkup(<AssemblyLimitDistanceSupportSummary document={document} reports={[value]} />)
  expect(html).toContain('[10, 10.000001] mm'); expect(html).toContain('próximo a ambos límites'); expect((document.mates[0] as AssemblyLimitDistanceMate).limits).toEqual(limits)
})
it('uses full reused scope paths for named reports and rejects a suppressed expansion', () => {
  const document = documentWithMate(), value = report(document), definition = { id: 'original-limit-scope', revision: 'r1' }
  document.definitions.push({ kind: 'assembly', ...definition, name: 'Shared plane interval', createdAt: document.createdAt, updatedAt: document.updatedAt, occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) })
  const original = document.occurrences[0]; document.occurrences = ['a', 'b'].map(id => ({ ...structuredClone(original), id, name: 'Scope ' + id, definition: { ...definition } })); document.mates = []
  const values = ['a', 'b'].map(id => ({ ...structuredClone(value), scopePath: [id] })), html = renderToStaticMarkup(<AssemblyLimitDistanceSupportSummary document={document} reports={values} />)
  expect(html).toContain('Scope a'); expect(html).toContain('Scope b'); document.occurrences[1].suppressed = true; expect(assemblyLimitDistanceUiReports(document, [values[1]])).toEqual([])
})
