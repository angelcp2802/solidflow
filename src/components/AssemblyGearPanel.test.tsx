import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyGearPanel, { assemblyGearUiEdit, assemblyGearUiOffset, assemblyGearUiParameters, type AssemblyGearPanelProps,
  type AssemblyGearUiFields, type AssemblyUiGearMate } from './AssemblyGearPanel'
import type { AssemblyAxisReference } from '../model/assemblyDocument'

// Original symbolic UI data and analytic degree/radian expectations. No native
// cylinder, captured zero, accepted solve, worker reply or Apply token is seeded.
const axis = (path: string[]): AssemblyAxisReference => ({ kind: 'face', support: 'axis',
  component: { occurrencePath: path, definition: { id: 'original-shaft', revision: 'r1' } },
  body: { bodyId: 'original-shaft-body', sourceFeatureId: 'original-final' }, face: { sourceFeatureId: 'original-final', key: 'face-v1|' + 'a'.repeat(64) } })
const fields = (change: Partial<AssemblyGearUiFields> = {}): AssemblyGearUiFields => ({ name: 'Original gear pair', numerator: '2', denominator: '1', direction: 'opposed', offsetDegrees: '30', ...change })
function mate(): AssemblyUiGearMate {
  return { id: 'original-gear', name: 'Original gear pair', type: 'gear', suppressed: false, first: axis(['left']), second: axis(['right']),
    carrier: { occurrencePath: ['carrier'], definition: { id: 'original-carrier', revision: 'r3' } },
    ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', phase: Math.PI / 12,
    neutralRotations: { first: [0, 0, 0, 1], second: [0, 0, 0, 1] }, angles: { first: 12 * Math.PI, second: -24 * Math.PI } }
}
function props(change: Partial<AssemblyGearPanelProps> = {}): AssemblyGearPanelProps {
  return { axes: [{ key: 'actual-left-face', label: 'Original left · left · Cilindro R2 · original-shaft · r1', reference: axis(['left']) },
    { key: 'actual-right-face', label: 'Original right · right · Cilindro R3 · original-shaft · r1', reference: axis(['right']) }],
    carriers: [{ key: '["carrier"]', label: 'Original carrier · carrier · original-carrier · r3', reference: { occurrencePath: ['carrier'], definition: { id: 'original-carrier', revision: 'r3' } } }],
    scopeName: 'Original scope', disabled: false, canCapture: false, onCapture: vi.fn(), onEdit: vi.fn(), onCancelEdit: vi.fn(), ...change }
}
it('converts an explicit follower offset to weighted phase with the independent 2:1 opposed formula', () => {
  expect(assemblyGearUiParameters(fields())).toEqual({ name: 'Original gear pair', ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', phase: Math.PI / 12 })
  expect(assemblyGearUiParameters(fields({ direction: 'same' })).phase).toBe(-Math.PI / 12)
})
it('accepts positive finite real ratio fields and preserves a signed offset', () => {
  const result = assemblyGearUiParameters(fields({ numerator: '.5', denominator: '.25', offsetDegrees: '-60' }))
  expect(result.ratio).toEqual({ numerator: .5, denominator: .25 }); expect(result.phase).toBeCloseTo(-Math.PI / 6, 14)
})
it('does not normalize whole turns out of the entered offset or its inverse display', () => {
  const result = assemblyGearUiParameters(fields({ offsetDegrees: '1080' }))
  expect(result.phase).toBeCloseTo(3 * Math.PI, 14)
  expect(Number(assemblyGearUiOffset(result))).toBeCloseTo(1080, 10)
})
it.each([
  { label: 'missing numerator', value: { numerator: '' } }, { label: 'blank denominator', value: { denominator: ' ' } },
  { label: 'zero numerator', value: { numerator: '0' } }, { label: 'negative denominator', value: { denominator: '-1' } },
  { label: 'infinite ratio', value: { numerator: 'Infinity' } }, { label: 'overflowed ratio', value: { denominator: '1e309' } },
  { label: 'missing offset', value: { offsetDegrees: '' } }, { label: 'blank offset', value: { offsetDegrees: ' ' } },
  { label: 'nonfinite offset', value: { offsetDegrees: 'NaN' } }, { label: 'missing name', value: { name: ' ' } },
])('rejects $label without supplying implicit zero or default ratios', ({ value }) => {
  expect(() => assemblyGearUiParameters(fields(value))).toThrow()
})
it('rejects an unknown direction and a name beyond the document label envelope', () => {
  expect(() => assemblyGearUiParameters(fields({ direction: 'invalid' as 'same' }))).toThrow('sentido')
  expect(() => assemblyGearUiParameters(fields({ name: 'a'.repeat(201) }))).toThrow('nombre')
})
it('edits only user parameters while preserving exact ID, endpoints, carrier, neutral frames and lifted angles', () => {
  const source = mate(), before = JSON.stringify(source), updated = assemblyGearUiEdit(source, fields({ name: 'Edited pair', numerator: '.5', direction: 'same', offsetDegrees: '720' }))
  expect(updated.id).toBe(source.id); expect(updated.type).toBe('gear'); expect(updated.suppressed).toBe(false)
  expect(updated.first).toEqual(source.first); expect(updated.second).toEqual(source.second); expect(updated.carrier).toEqual(source.carrier)
  expect(updated.neutralRotations).toEqual(source.neutralRotations); expect(updated.angles).toEqual({ first: 12 * Math.PI, second: -24 * Math.PI })
  expect(updated.name).toBe('Edited pair'); expect(updated.ratio).toEqual({ numerator: .5, denominator: 1 }); expect(updated.phase).toBeCloseTo(-4 * Math.PI, 12)
  updated.first.component.occurrencePath[0] = 'changed'; updated.neutralRotations.first[0] = .1; updated.angles.first = 0
  expect(JSON.stringify(source)).toBe(before)
})
it('requires a current native preview before exposing selectable capture controls', () => {
  const input = props(), html = renderToStaticMarkup(<AssemblyGearPanel {...input} />)
  expect(html).toContain('role="region"'); expect(html).toContain('aria-label="Engranaje"'); expect(html).toContain('vista previa nativa vigente')
  for (const label of ['Eje 1 del engranaje', 'Eje 2 del engranaje', 'Portador del engranaje']) expect(html).toMatch(new RegExp(`<select(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  expect(html).toMatch(/<button(?=[^>]*aria-label="Capturar engranaje")(?=[^>]*disabled="")[^>]*>/)
  expect(input.onCapture).not.toHaveBeenCalled()
})
it('offers exact cylinder and carrier choices without deriving ratio from their unequal radii', () => {
  const html = renderToStaticMarkup(<AssemblyGearPanel {...props({ canCapture: true })} />)
  expect(html).toContain('value="actual-left-face"'); expect(html).toContain('value="actual-right-face"'); expect(html).toContain('Cilindro R2'); expect(html).toContain('Cilindro R3')
  expect(html).toContain('value="scope"'); expect(html).toContain('Original scope · marco del ámbito'); expect(html).toContain('original-carrier · r3')
  expect(html).toMatch(/<input(?=[^>]*aria-label="Numerador del engranaje")(?=[^>]*value="1")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Denominador del engranaje")(?=[^>]*value="1")[^>]*>/)
  expect(html).toContain('Vueltas del eje 2 por vuelta del eje 1'); expect(html).toContain('La relación se introduce explícitamente')
})
it('renders editing with retained identity/reference labels and one preview action', () => {
  const value = mate(), html = renderToStaticMarkup(<AssemblyGearPanel {...props({ mate: value })} />)
  expect(html).toContain('Eje 1: left · original-shaft · r1'); expect(html).toContain('Eje 2: right · original-shaft · r1')
  expect(html).toContain('Portador: carrier · original-carrier · r3'); expect(html).toContain('conserva los ceros angulares capturados y los ángulos acumulados')
  expect(html).toContain('aria-label="Ángulos acumulados del engranaje"'); expect(html).toContain('Eje 1: 2160° · Eje 2: -4320°')
  expect(html).toContain('aria-label="Vista previa del engranaje"'); expect(html).toContain('aria-label="Cancelar edición del engranaje"')
  expect(html).not.toContain('aria-label="Capturar engranaje"'); expect(html).not.toContain('aria-label="Eje 1 del engranaje"')
  expect(html).toContain('value="2"'); expect(html).not.toContain('token')
})
it('blocks every editable field and update action while an operation or preview owns the editor', () => {
  const html = renderToStaticMarkup(<AssemblyGearPanel {...props({ mate: mate(), disabled: true })} />)
  for (const label of ['Nombre del engranaje', 'Numerador del engranaje', 'Denominador del engranaje', 'Desfase del seguidor en grados']) expect(html).toMatch(new RegExp(`<input(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  expect(html).toMatch(/<select(?=[^>]*aria-label="Sentido del engranaje")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa del engranaje")(?=[^>]*disabled="")[^>]*>/)
})
it('labels scope carrier explicitly and keeps native capture/edit callbacks idle during SSR', () => {
  const value = mate(); value.carrier = null
  const input = props({ mate: value }), before = JSON.stringify(value), html = renderToStaticMarkup(<AssemblyGearPanel {...input} />)
  expect(html).toContain('Portador: Original scope'); expect(html).toContain('Acoplamiento cinemático de giros')
  expect(html).toContain('contacto entre dientes requieren comprobaciones independientes')
  expect(JSON.stringify(value)).toBe(before)
  for (const callback of [input.onCapture, input.onEdit, input.onCancelEdit]) expect(callback).not.toHaveBeenCalled()
})
