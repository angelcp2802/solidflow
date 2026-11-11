import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createAssemblyExample } from '../examples/assembly'
import { applyAssemblyEdit } from '../model/assemblyEditing'
import { serializeAssemblyDocument, type AssemblyGeometryReference, type AssemblyLimitAngleMate } from '../model/assemblyDocument'
import type { AssemblyLimitAngleSupportReport } from '../cad/kernel.assembly-types'
import AssemblyLimitAngleMatePanel, { AssemblyLimitAngleSupportSummary, assemblyLimitAngleUiEdit, assemblyLimitAngleUiProposal, assemblyLimitAngleUiReady, assemblyLimitAngleUiReports, type AssemblyLimitAngleMatePanelProps, type AssemblyLimitAngleUiFields } from './AssemblyLimitAngleMatePanel'

// Original symbolic references and SSR only. No BRep, worker, pointer or
// accepted solver state is supplied by these syntax/display fixtures.
const component = () => ({ occurrencePath: ['right'], definition: { id: 'example-pin', revision: 'r1' } })
function reference(kind: 'plane' | 'axis' | 'line' = 'plane'): AssemblyGeometryReference {
  const body = { bodyId: 'pin-body', sourceFeatureId: 'bore' }
  return kind === 'line' ? { kind: 'edge', component: component(), body, edge: { sourceFeatureId: 'bore', key: 'edge-v1|' + 'a'.repeat(64) }, support: 'line' }
    : { kind: 'face', component: component(), body, face: { sourceFeatureId: 'bore', key: 'face-v1|' + 'b'.repeat(64) }, support: kind }
}
const second = (): AssemblyGeometryReference => ({ kind: 'principal-plane', component: null, plane: 'XY' })
const fields = (): AssemblyLimitAngleUiFields => ({ name: 'Original principal interval', minimum: '30', maximum: '120' })
const props = (): AssemblyLimitAngleMatePanelProps => ({ ...fields(), first: reference(), second: second(), editing: false, disabled: false, onName: vi.fn(), onMinimum: vi.fn(), onMaximum: vi.fn(), onPreview: vi.fn(), onCancelEdit: vi.fn() })
function documentWithMate() { return applyAssemblyEdit(createAssemblyExample(), { type: 'add-mate', mate: assemblyLimitAngleUiProposal(reference(), second(), fields()) }) }
function report(document = documentWithMate(), angle = 60): AssemblyLimitAngleSupportReport {
  const mate = document.mates[0] as AssemblyLimitAngleMate, radians = angle * Math.PI / 180
  return { kind: 'limit-angle', coordinate: 'principal-direction', scopePath: [], mateId: mate.id, angleDegrees: angle, limitsDegrees: { ...mate.limits }, angleToleranceRadians: 1e-8,
    activity: angle === mate.limits.minimum && angle === mate.limits.maximum ? 'both' : angle === mate.limits.minimum ? 'minimum' : angle === mate.limits.maximum ? 'maximum' : 'interior',
    stratum: angle === 0 ? 'parallel' : angle === 180 ? 'antiparallel' : 'regular', domainBounds: { minimum: mate.limits.minimum === 0, maximum: mate.limits.maximum === 180 },
    firstKind: 'plane', secondKind: 'plane', firstDirection: angle === 0 ? [0, 0, 1] : angle === 180 ? [0, 0, -1] : [0, -Math.sin(radians), Math.cos(radians)], secondDirection: [0, 0, 1], supportOnly: true }
}
it.each([['30', '120'], ['0', '180'], ['0', '0'], ['180', '180'], ['60', '60'], ['2.5', '4e1']] as const)('preserves inclusive [%s,%s] degrees and the explicit coordinate', (minimum, maximum) => {
  const a = reference(), b = second(), before = JSON.stringify([a, b]), value = assemblyLimitAngleUiProposal(a, b, { ...fields(), minimum, maximum })
  expect(value).toMatchObject({ type: 'limit-angle', coordinate: 'principal-direction', limits: { minimum: Number(minimum), maximum: Number(maximum) }, first: a, second: b, suppressed: false })
  expect(Object.keys(value).sort()).toEqual(['coordinate', 'first', 'limits', 'name', 'second', 'suppressed', 'type']); expect(value.first).not.toBe(a); expect(value.second).not.toBe(b); expect(JSON.stringify([a, b])).toBe(before)
})
it.each((['plane', 'axis', 'line'] as const).flatMap(first => (['plane', 'axis', 'line'] as const).map(second => ({ first, second }))))('retains ordered $first/$second purposes without converting surfaces to axes', ({ first, second }) => {
  const a = reference(first), b = reference(second), value = assemblyLimitAngleUiProposal(a, b, fields())
  expect(value.first).toEqual(a); expect(value.second).toEqual(b); expect(value.limits).toEqual({ minimum: 30, maximum: 120 }); expect('alignment' in value).toBe(false)
})
it('preserves the same numeric bounds when endpoints are explicitly reversed', () => {
  const value = assemblyLimitAngleUiProposal(second(), reference('line'), fields())
  expect(value.first).toEqual(second()); expect(value.second).toEqual(reference('line')); expect(value.limits).toEqual({ minimum: 30, maximum: 120 })
})
it.each(['missing-first', 'missing-second', 'blank-name', 'blank-minimum', 'blank-maximum', 'not-number', 'infinite', 'negative', 'above180', 'backwards'] as const)('blocks incomplete or invalid %s authoring', fault => {
  const p = props()
  if (fault === 'missing-first') p.first = null
  if (fault === 'missing-second') p.second = null
  if (fault === 'blank-name') p.name = ' '
  if (fault === 'blank-minimum') p.minimum = ' '
  if (fault === 'blank-maximum') p.maximum = ''
  if (fault === 'not-number') p.minimum = 'word'
  if (fault === 'infinite') p.maximum = '1e999'
  if (fault === 'negative') p.minimum = '-1'
  if (fault === 'above180') p.maximum = '181'
  if (fault === 'backwards') p.minimum = '121'
  expect(assemblyLimitAngleUiReady(p.first, p.second, p)).toBe(false)
  expect(renderToStaticMarkup(<AssemblyLimitAngleMatePanel {...p} />)).toMatch(/<button(?=[^>]*aria-label="Vista previa del nuevo intervalo angular")(?=[^>]*disabled="")[^>]*>/)
})
it.each(['cylinder-surface', 'sphere-surface', 'circle', 'curve'])('refuses an unsupported %s purpose', support => {
  expect(assemblyLimitAngleUiReady({ ...reference(), support } as unknown as AssemblyGeometryReference, second(), fields())).toBe(false)
})
it('edits name and bounds while preserving identity, both references and suppression', () => {
  const document = documentWithMate(), mate = document.mates[0] as AssemblyLimitAngleMate; mate.suppressed = true
  const before = serializeAssemblyDocument(document), edited = applyAssemblyEdit(document, { type: 'update-mate', mateId: mate.id, mate: assemblyLimitAngleUiEdit(mate, { name: 'Edited angle', minimum: '0', maximum: '90' }) })
  expect(edited.mates).toHaveLength(1); expect(edited.mates[0]).toMatchObject({ id: mate.id, type: 'limit-angle', coordinate: 'principal-direction', first: mate.first, second: mate.second, suppressed: true, limits: { minimum: 0, maximum: 90 } })
  expect(serializeAssemblyDocument(document)).toBe(before)
})
it.each([false, true])('renders explicit principal-angle semantics and pending controls, editing=%s', editing => {
  const p = { ...props(), editing, disabled: true }, html = renderToStaticMarkup(<AssemblyLimitAngleMatePanel {...p} />)
  for (const label of ['Nombre de la relación', 'Ángulo principal mínimo en grados', 'Ángulo principal máximo en grados']) expect(html).toMatch(new RegExp('<input(?=[^>]*aria-label="' + label + '")(?=[^>]*disabled="")[^>]*>'))
  expect(html).toContain('normal de un plano'); expect(html).toContain('dirección canónica de una arista lineal'); expect(html).toContain('No es un tope de giro firmado ni cuenta vueltas'); expect(html).toContain('mínimo puede ser igual al máximo')
  expect(html).not.toContain('<select'); expect(html.includes('Cerrar edición del intervalo angular')).toBe(editing); expect(p.onPreview).not.toHaveBeenCalled()
})
it.each([30, 60, 120])('displays actual %s degree reports as proximity and separates bilateral rank', angle => {
  const document = documentWithMate(), value = report(document, angle), values = assemblyLimitAngleUiReports(document, [value])
  expect(values).toEqual([value]); expect(values[0]).not.toBe(value); values[0].limitsDegrees.minimum = 99; expect(value.limitsDegrees.minimum).toBe(30)
  const html = renderToStaticMarkup(<AssemblyLimitAngleSupportSummary document={document} reports={[value]} />)
  expect(html).toContain('<strong>Original principal interval</strong>'); expect(html).toContain('El recuento de grados de libertad no describe por sí solo los movimientos permitidos'); expect(html).toContain('puedes volver al interior del intervalo')
})
it.each([{ bounds: [0, 60], angle: 0 }, { bounds: [30, 180], angle: 180 }, { bounds: [0, 0], angle: 0 }, { bounds: [180, 180], angle: 180 }, { bounds: [0, 180], angle: 0 }])('distinguishes endpoint/domain and zero-width strata $bounds at $angle', ({ bounds, angle }) => {
  const document = documentWithMate(); (document.mates[0] as AssemblyLimitAngleMate).limits = { minimum: bounds[0], maximum: bounds[1] }; const value = report(document, angle)
  expect(assemblyLimitAngleUiReports(document, [value])).toEqual([value]); const html = renderToStaticMarkup(<AssemblyLimitAngleSupportSummary document={document} reports={[value]} />)
  expect(html).toContain('pertenecen al dominio del ángulo'); expect(html).toContain('su proximidad no añade por sí sola un tope'); expect(html).toContain('se conserva la inclinación')
})
it.each(['wrong-id', 'wrong-scope', 'wrong-kind', 'wrong-coordinate', 'wrong-limits', 'wrong-activity', 'outside', 'nonfinite', 'zero-tolerance', 'bad-domain', 'bad-stratum', 'bad-direction', 'nonunit-direction', 'wrong-purpose', 'not-support-only', 'duplicate', 'suppressed'] as const)('hides inconsistent %s report data', fault => {
  const document = documentWithMate(), value = report(document)
  if (fault === 'wrong-id') value.mateId = 'absent'
  if (fault === 'wrong-scope') value.scopePath = ['absent']
  if (fault === 'wrong-kind') value.kind = 'angle' as 'limit-angle'
  if (fault === 'wrong-coordinate') value.coordinate = 'signed' as 'principal-direction'
  if (fault === 'wrong-limits') value.limitsDegrees.maximum = 130
  if (fault === 'wrong-activity') value.activity = 'maximum'
  if (fault === 'outside') { value.angleDegrees = 121; value.firstDirection = [0, -Math.sin(121 * Math.PI / 180), Math.cos(121 * Math.PI / 180)] }
  if (fault === 'nonfinite') value.angleDegrees = NaN
  if (fault === 'zero-tolerance') value.angleToleranceRadians = 0
  if (fault === 'bad-domain') value.domainBounds.minimum = true
  if (fault === 'bad-stratum') value.stratum = 'parallel'
  if (fault === 'bad-direction') value.firstDirection = [0, 0, 1]
  if (fault === 'nonunit-direction') value.firstDirection = value.firstDirection.map(x => x * 2) as [number, number, number]
  if (fault === 'wrong-purpose') value.firstKind = 'cylinder'
  if (fault === 'not-support-only') value.supportOnly = false as true
  if (fault === 'suppressed') document.mates[0].suppressed = true
  expect(assemblyLimitAngleUiReports(document, fault === 'duplicate' ? [value, value] : [value])).toEqual([])
})
it('does not relabel a small nonzero principal angle as the parallel stratum by tolerance', () => {
  const document = documentWithMate(); (document.mates[0] as AssemblyLimitAngleMate).limits = { minimum: 0, maximum: 60 }; const value = report(document, 1e-8)
  value.activity = 'minimum'; expect(value.stratum).toBe('regular'); expect(assemblyLimitAngleUiReports(document, [value])).toEqual([value]); value.stratum = 'parallel'; expect(assemblyLimitAngleUiReports(document, [value])).toEqual([])
})
it('keeps two nearby unequal bounds distinct while both precision bands contain the angle', () => {
  const document = documentWithMate(), mate = document.mates[0] as AssemblyLimitAngleMate; mate.limits = { minimum: 60, maximum: 60.0000001 }
  const value = report(document, 60.00000005); value.activity = 'both'; expect(assemblyLimitAngleUiReports(document, [value])).toEqual([value])
  expect(renderToStaticMarkup(<AssemblyLimitAngleSupportSummary document={document} reports={[value]} />)).toContain('[60, 60.0000001]°')
})
it('uses full reused scope paths and rejects inherited suppression without native authority', () => {
  const document = documentWithMate(), value = report(document), definition = { id: 'original-angle-scope', revision: 'r1' }
  document.definitions.push({ kind: 'assembly', ...definition, name: 'Shared angular interval', createdAt: document.createdAt, updatedAt: document.updatedAt, occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) })
  const original = document.occurrences[0]; document.occurrences = ['a', 'b'].map(id => ({ ...structuredClone(original), id, name: 'Scope ' + id, definition: { ...definition } })); document.mates = []
  const values = ['a', 'b'].map(id => ({ ...structuredClone(value), scopePath: [id] })), html = renderToStaticMarkup(<AssemblyLimitAngleSupportSummary document={document} reports={values} />)
  expect(html).toContain('Scope a'); expect(html).toContain('Scope b'); document.occurrences[1].suppressed = true; expect(assemblyLimitAngleUiReports(document, [values[1]])).toEqual([])
  expect(renderToStaticMarkup(<AssemblyLimitAngleSupportSummary document={document} reports={[]} />)).toBe('')
})
