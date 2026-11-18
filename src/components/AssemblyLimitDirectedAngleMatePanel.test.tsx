import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyExample } from '../examples/assembly'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { parseCadDocument, serializeAssemblyDocument, type AssemblyGeometryReference, type AssemblyLimitDirectedAngleMate } from '../model/assemblyDocument'
import type { AssemblyLimitDirectedAngleSupportReport } from '../cad/kernel.assembly-types'
import { assemblyDirectedAngleReferenceKey } from './AssemblyDirectedAnglePanel'
import AssemblyLimitDirectedAngleMatePanel, { AssemblyLimitDirectedAngleSupportSummary, assemblyLimitDirectedAngleUiEdit, assemblyLimitDirectedAngleUiProposal, assemblyLimitDirectedAngleUiReports, type AssemblyLimitDirectedAngleMatePanelProps, type AssemblyLimitDirectedAngleUiFields } from './AssemblyLimitDirectedAngleMatePanel'

// Original symbolic declarations and literal vectors. These are UI syntax,
// history and server-rendered display checks, not native geometry or a solve.
const first = (): AssemblyGeometryReference => ({ kind: 'principal-plane', component: null, plane: 'YZ' })
const second = (): AssemblyGeometryReference => ({ kind: 'principal-plane', component: { occurrencePath: ['right'], definition: { id: 'example-pin', revision: 'r1' } }, plane: 'YZ' })
const guide = (): AssemblyGeometryReference => ({ kind: 'principal-plane', component: null, plane: 'XY' })
const fields = (): AssemblyLimitDirectedAngleUiFields => ({ name: 'Original circular stop', start: '330', sweep: '60' })
const proposal = (values = fields()) => assemblyLimitDirectedAngleUiProposal(first(), second(), guide(), values)
function props(): AssemblyLimitDirectedAngleMatePanelProps {
  const choices = [first(), second(), guide()].map((reference, i) => ({ key: assemblyDirectedAngleReferenceKey(reference), label: `Original direction ${i + 1}`, reference }))
  return { ...fields(), choices, selection: choices.map(value => value.key) as [string, string, string], scopePath: [], editing: false, disabled: false,
    onSelect: vi.fn(), onName: vi.fn(), onStart: vi.fn(), onSweep: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() }
}
function documentWithMate(values = fields()) { return applyAssemblyEdit(createAssemblyExample(), { type: 'add-mate', mate: proposal(values) }) }
function report(document = documentWithMate(), angle = 0): AssemblyLimitDirectedAngleSupportReport {
  const mate = document.mates[0] as AssemblyLimitDirectedAngleMate
  const ray: Record<number, [number, number, number]> = { 0: [1, 0, 0], 30: [Math.sqrt(3) / 2, 1 / 2, 0], 330: [Math.sqrt(3) / 2, -1 / 2, 0], 180: [-1, 0, 0] }
  const progress = angle < 330 ? angle + 30 : angle - 330
  return { kind: 'limit-directed-angle', coordinate: 'directed-about-axis', scopePath: [], mateId: mate.id, angleDegrees: angle, arcDegrees: { ...mate.arc },
    marginsRadians: { minimum: progress * Math.PI / 180, maximum: (mate.arc.sweep - progress) * Math.PI / 180 }, angleToleranceRadians: 1e-8,
    activity: angle === 330 ? 'minimum' : angle === 30 ? 'maximum' : 'interior', fullCircle: false,
    firstKind: 'plane', secondKind: 'plane', guideKind: 'plane', firstDirection: [1, 0, 0], secondDirection: ray[angle], guideDirection: [0, 0, 1],
    projectionLengths: { first: 1, second: 1 }, supportOnly: true }
}
it.each([{ start: '330', sweep: '60' }, { start: '0', sweep: '360' }, { start: '0', sweep: '0' }, { start: '359.5', sweep: '0' }, { start: '2.5', sweep: '4e1' }])('preserves the authored circular start $start and sweep $sweep without a hidden zero', values => {
  const a = first(), b = second(), g = guide(), before = JSON.stringify([a, b, g]), value = assemblyLimitDirectedAngleUiProposal(a, b, g, { ...fields(), ...values })
  expect(value).toEqual({ type: 'limit-directed-angle', coordinate: 'directed-about-axis', name: fields().name, suppressed: false, first: a, second: b, guide: g, arc: { start: Number(values.start), sweep: Number(values.sweep) } })
  expect(value.first).not.toBe(a); expect(value.second).not.toBe(b); expect(value.guide).not.toBe(g); expect(JSON.stringify([a, b, g])).toBe(before)
})
it('preserves the explicit arc when directions are swapped or the guide reference changes', () => {
  const value = assemblyLimitDirectedAngleUiProposal(second(), first(), first(), fields())
  expect(value.first).toEqual(second()); expect(value.second).toEqual(first()); expect(value.guide).toEqual(first()); expect(value.arc).toEqual({ start: 330, sweep: 60 })
})
it.each(['first', 'second', 'guide'] as const)('requires the current %s selection before preview', side => {
  const p = props(), index = side === 'first' ? 0 : side === 'second' ? 1 : 2; p.selection[index] = ''
  const html = renderToStaticMarkup(<AssemblyLimitDirectedAngleMatePanel {...p} />)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa del nuevo límite dirigido")(?=[^>]*disabled="")[^>]*>/)
  expect(p.onPreview).not.toHaveBeenCalled()
})
it.each([{ start: '', sweep: '60' }, { start: '360', sweep: '60' }, { start: '-1', sweep: '60' }, { start: 'word', sweep: '60' },
  { start: '0', sweep: '-1' }, { start: '0', sweep: '361' }, { start: '0', sweep: '1e999' }, { start: '0', sweep: ' ' }])('blocks invalid fields $start/$sweep', values => {
  expect(() => proposal({ ...fields(), ...values })).toThrow()
  const html = renderToStaticMarkup(<AssemblyLimitDirectedAngleMatePanel {...props()} {...values} />)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa del nuevo límite dirigido")(?=[^>]*disabled="")[^>]*>/)
})
it('rejects missing name, missing guide and ineligible surface purposes without inventing a reference', () => {
  expect(() => proposal({ ...fields(), name: ' ' })).toThrow()
  expect(() => assemblyLimitDirectedAngleUiProposal(first(), second(), null, fields())).toThrow()
  expect(() => assemblyLimitDirectedAngleUiProposal(first(), second(), { ...guide(), kind: 'circle' } as unknown as AssemblyGeometryReference, fields())).toThrow()
})
it('shows stale selection explicitly and blocks preview instead of choosing another direction', () => {
  const p = props(); p.choices = p.choices.slice(0, 2)
  const html = renderToStaticMarkup(<AssemblyLimitDirectedAngleMatePanel {...p} />)
  expect(html).toContain('Referencia no actual'); expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa del nuevo límite dirigido")(?=[^>]*disabled="")[^>]*>/)
})
it.each([false, true])('renders three disabled direction selectors and degree fields during work, editing=%s', editing => {
  const p = { ...props(), disabled: true, editing }, html = renderToStaticMarkup(<AssemblyLimitDirectedAngleMatePanel {...p} />)
  for (const label of ['Primera dirección del límite', 'Segunda dirección del límite', 'Eje guía del límite']) expect(html).toMatch(new RegExp('<select(?=[^>]*aria-label="' + label + '")(?=[^>]*disabled="")[^>]*>'))
  for (const label of ['Nombre de la relación', 'Inicio del arco en grados', 'Recorrido permitido en grados']) expect(html).toMatch(new RegExp('<input(?=[^>]*aria-label="' + label + '")(?=[^>]*disabled="")[^>]*>'))
  expect(html).toContain('inicio 330° y recorrido 60°'); expect(html).toContain('No cuenta vueltas acumuladas'); expect(html).toContain('mano derecha'); expect(html.includes('Cerrar edición del límite dirigido')).toBe(editing)
  expect(p.onPreview).not.toHaveBeenCalled()
})
it('edits all three refs while retaining identity/suppression, and history and serialization retain the circular declaration', () => {
  const initial = documentWithMate(), mate = initial.mates[0] as AssemblyLimitDirectedAngleMate; mate.suppressed = true
  const before = serializeAssemblyDocument(initial), history = new AssemblyDocumentHistory(initial)
  const edited = applyAssemblyEdit(initial, { type: 'update-mate', mateId: mate.id, mate: assemblyLimitDirectedAngleUiEdit(mate, second(), first(), guide(), { name: 'Edited stop', start: '340', sweep: '40' }) })
  const committed = history.commitDocument(edited)
  expect(committed.mates[0]).toMatchObject({ id: mate.id, type: 'limit-directed-angle', suppressed: true, first: second(), second: first(), guide: guide(), arc: { start: 340, sweep: 40 } })
  expect(parseCadDocument(serializeAssemblyDocument(committed))).toEqual(committed)
  expect(serializeAssemblyDocument(history.undo())).toBe(before); expect(history.redo()).toEqual(committed); expect(serializeAssemblyDocument(initial)).toBe(before)
})
it.each([330, 0, 30])('displays a circular %s degree native report with independent vector and margin consistency', angle => {
  const document = documentWithMate(), value = report(document, angle), rows = assemblyLimitDirectedAngleUiReports(document, [value])
  expect(rows).toEqual([value]); expect(rows[0]).not.toBe(value); rows[0].arcDegrees.start = 1; expect(value.arcDegrees.start).toBe(330)
  const html = renderToStaticMarkup(<AssemblyLimitDirectedAngleSupportSummary document={document} reports={[value]} />)
  expect(html).toContain('Límites dirigidos verificados'); expect(html).toContain('inicio 330°'); expect(html).toContain('recorrido 60°'); expect(html).toContain('regresar al interior'); expect(html).toContain('no une posiciones ni cuenta vueltas acumuladas')
})
it('distinguishes equality and full circle at the same zero-degree direction', () => {
  for (const sweep of [0, 360]) {
    const document = documentWithMate({ ...fields(), start: '0', sweep: String(sweep) }), value = report(document)
    value.marginsRadians = { minimum: 0, maximum: sweep * Math.PI / 180 }; value.activity = sweep ? 'interior' : 'both'; value.fullCircle = sweep === 360
    expect(assemblyLimitDirectedAngleUiReports(document, [value])).toEqual([value])
    const html = renderToStaticMarkup(<AssemblyLimitDirectedAngleSupportSummary document={document} reports={[value]} />)
    expect(html).toContain(sweep ? 'círculo completo, sin tope angular' : 'ángulo fijado por recorrido cero')
  }
})
it.each(['id', 'scope', 'kind', 'coordinate', 'arc', 'activity', 'outside', 'angle', 'tolerance', 'guide', 'purpose', 'projection', 'margins', 'full-circle', 'support-only', 'duplicate', 'suppressed'] as const)('hides inconsistent %s report data', fault => {
  const document = documentWithMate(), value = report(document)
  if (fault === 'id') value.mateId = 'absent'
  if (fault === 'scope') value.scopePath = ['absent']
  if (fault === 'kind') value.kind = 'limit-angle' as 'limit-directed-angle'
  if (fault === 'coordinate') value.coordinate = 'principal-direction' as 'directed-about-axis'
  if (fault === 'arc') value.arcDegrees.sweep = 80
  if (fault === 'activity') value.activity = 'maximum'
  if (fault === 'outside') { value.angleDegrees = 180; value.secondDirection = [-1, 0, 0] }
  if (fault === 'angle') value.angleDegrees = Number.NaN
  if (fault === 'tolerance') value.angleToleranceRadians = 0
  if (fault === 'guide') value.guideDirection = [1, 0, 0]
  if (fault === 'purpose') value.guideKind = 'line'
  if (fault === 'projection') value.projectionLengths.second = 0.5
  if (fault === 'margins') value.marginsRadians.maximum = -1
  if (fault === 'full-circle') value.fullCircle = true
  if (fault === 'support-only') value.supportOnly = false as true
  if (fault === 'suppressed') document.mates[0].suppressed = true
  const values = fault === 'duplicate' ? [value, structuredClone(value)] : [value]
  expect(assemblyLimitDirectedAngleUiReports(document, values)).toEqual([])
  expect(renderToStaticMarkup(<AssemblyLimitDirectedAngleSupportSummary document={document} reports={values} />)).toBe('')
})
