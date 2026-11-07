import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyScrewPanel, { assemblyScrewUiAdvance, assemblyScrewUiEdit, assemblyScrewUiParameters, type AssemblyScrewPanelProps,
  type AssemblyScrewUiFields, type AssemblyUiScrewMate } from './AssemblyScrewPanel'
import type { AssemblyAxisReference } from '../model/assemblyDocument'

// Original symbolic display/intent records. These cases neither construct a
// cylinder nor seed native alignment, solved state or an Apply capability.
const axis = (path: string[]): AssemblyAxisReference => ({ kind: 'face', support: 'axis',
  component: { occurrencePath: path, definition: { id: 'original-member', revision: 'r1' } },
  body: { bodyId: 'original-body', sourceFeatureId: 'original-final' }, face: { sourceFeatureId: 'original-final', key: 'face-v1|' + 'b'.repeat(64) } })
const fields = (change: Partial<AssemblyScrewUiFields> = {}): AssemblyScrewUiFields => ({ name: 'Original screw', advance: '2', unit: 'mm-per-turn', reverse: false, alignment: 'aligned', ...change })
function mate(): AssemblyUiScrewMate {
  return { id: 'original-screw', name: 'Original screw', type: 'screw', suppressed: false, first: axis(['motor']), second: axis(['nut']),
    lead: 2, reverse: false, alignment: 'aligned', neutralRotation: [0, 0, 0, 1], angle: 4 * Math.PI, neutralTravel: -3 }
}
function props(change: Partial<AssemblyScrewPanelProps> = {}): AssemblyScrewPanelProps {
  return { axes: [{ key: 'actual-motor-face', label: 'Original motor · motor · Cilindro R2 · original-member · r1', reference: axis(['motor']) },
    { key: 'actual-nut-face', label: 'Original nut · nut · Cilindro R3 · original-member · r1', reference: axis(['nut']) }],
    disabled: false, canCapture: false, onCapture: vi.fn(), onEdit: vi.fn(), onCancelEdit: vi.fn(), ...change }
}
it('accepts a finite real distance per turn without inferring it from cylinder radii', () => {
  expect(assemblyScrewUiParameters(fields({ name: '  Original screw  ', advance: '.125' }))).toEqual({ name: 'Original screw', lead: .125, reverse: false, alignment: 'aligned' })
})
it('converts turns per millimeter to the independently known reciprocal lead', () => {
  expect(assemblyScrewUiParameters(fields({ advance: '.5', unit: 'turns-per-mm' })).lead).toBe(2)
  expect(assemblyScrewUiParameters(fields({ advance: '4', unit: 'turns-per-mm' })).lead).toBe(.25)
})
it('keeps reverse separate from positive lead and cylinder alignment', () => {
  expect(assemblyScrewUiParameters(fields({ reverse: true, alignment: 'opposed' }))).toEqual({ name: 'Original screw', lead: 2, reverse: true, alignment: 'opposed' })
})
it('preserves the physical lead when displaying either unit', () => {
  expect(assemblyScrewUiAdvance(2, 'mm-per-turn')).toBe('2')
  expect(assemblyScrewUiAdvance(2, 'turns-per-mm')).toBe('0.5')
  expect(assemblyScrewUiParameters(fields({ advance: assemblyScrewUiAdvance(.25, 'turns-per-mm'), unit: 'turns-per-mm' })).lead).toBe(.25)
})
it.each([
  { label: 'missing advance', value: { advance: '' } }, { label: 'blank advance', value: { advance: ' ' } },
  { label: 'zero distance', value: { advance: '0' } }, { label: 'negative distance', value: { advance: '-2' } },
  { label: 'infinite distance', value: { advance: 'Infinity' } }, { label: 'overflowed distance', value: { advance: '1e309' } },
  { label: 'NaN distance', value: { advance: 'NaN' } }, { label: 'invalid numeric text', value: { advance: 'two' } },
  { label: 'underflowed distance', value: { advance: '1e-400' } },
  { label: 'zero turns per mm', value: { advance: '0', unit: 'turns-per-mm' as const } },
  { label: 'negative turns per mm', value: { advance: '-.5', unit: 'turns-per-mm' as const } },
  { label: 'overflowed reciprocal', value: { advance: '5e-324', unit: 'turns-per-mm' as const } },
])('rejects $label without implicit defaults or a zero coupling', ({ value }) => {
  expect(() => assemblyScrewUiParameters(fields(value))).toThrow()
})
it('rejects an absent name or a name beyond the document label envelope', () => {
  expect(() => assemblyScrewUiParameters(fields({ name: ' ' }))).toThrow('nombre')
  expect(() => assemblyScrewUiParameters(fields({ name: 'a'.repeat(201) }))).toThrow('nombre')
})
it('rejects unknown units, nonboolean reverse and unknown cylinder alignment', () => {
  expect(() => assemblyScrewUiParameters(fields({ unit: 'invalid' as 'mm-per-turn' }))).toThrow('unidad')
  expect(() => assemblyScrewUiParameters(fields({ reverse: 1 as unknown as boolean }))).toThrow('sentido')
  expect(() => assemblyScrewUiParameters(fields({ alignment: 'invalid' as 'aligned' }))).toThrow('orientación')
})
it.each([0, -1, Infinity, NaN])('rejects invalid saved lead %s before reciprocal display', lead => {
  expect(() => assemblyScrewUiAdvance(lead, 'turns-per-mm')).toThrow()
})
it('rejects an unrepresentable reciprocal display and unknown display units', () => {
  expect(() => assemblyScrewUiAdvance(Number.MIN_VALUE, 'turns-per-mm')).toThrow()
  expect(() => assemblyScrewUiAdvance(2, 'invalid' as 'turns-per-mm')).toThrow('unidad')
})
it('edits name, lead and reverse while retaining alignment, detached captured state and exact IDs', () => {
  const source = mate(), before = JSON.stringify(source), next = assemblyScrewUiEdit(source, fields({ name: 'Edited screw', unit: 'turns-per-mm', advance: '.25', reverse: true }))
  expect(next.id).toBe(source.id); expect(next.type).toBe('screw'); expect(next.suppressed).toBe(false)
  expect(next.name).toBe('Edited screw'); expect(next.lead).toBe(4); expect(next.reverse).toBe(true); expect(next.alignment).toBe('aligned')
  expect(next.first).toEqual(source.first); expect(next.second).toEqual(source.second)
  expect(next.neutralRotation).toEqual([0, 0, 0, 1]); expect(next.neutralTravel).toBe(-3); expect(next.angle).toBe(4 * Math.PI)
  next.first.component.occurrencePath[0] = 'changed'; next.second.component.definition.revision = 'changed'; next.neutralRotation[0] = .1
  expect(JSON.stringify(source)).toBe(before)
})
it('rejects changing either captured alignment rather than silently recapturing or ignoring the request', () => {
  const source = mate(), before = JSON.stringify(source)
  expect(() => assemblyScrewUiEdit(source, fields({ alignment: 'opposed' }))).toThrow('nueva captura')
  expect(JSON.stringify(source)).toBe(before)
  source.alignment = 'opposed'
  expect(() => assemblyScrewUiEdit(source, fields())).toThrow('nueva captura')
})
it('requires a current native preview before enabling cylindrical capture controls', () => {
  const input = props(), html = renderToStaticMarkup(<AssemblyScrewPanel {...input} />)
  expect(html).toContain('role="region"'); expect(html).toContain('aria-label="Tornillo"'); expect(html).toContain('vista previa nativa vigente')
  for (const label of ['Eje 1 del tornillo', 'Eje 2 del tornillo']) expect(html).toMatch(new RegExp(`<select(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  expect(html).toMatch(/<button(?=[^>]*aria-label="Capturar tornillo")(?=[^>]*disabled="")[^>]*>/)
  expect(input.onCapture).not.toHaveBeenCalled()
})
it('offers exact cylinder choices and both lead units without exposing a carrier or a thread pitch inference', () => {
  const html = renderToStaticMarkup(<AssemblyScrewPanel {...props({ canCapture: true })} />)
  expect(html).toContain('value="actual-motor-face"'); expect(html).toContain('value="actual-nut-face"')
  expect(html).toContain('Cilindro R2'); expect(html).toContain('Cilindro R3'); expect(html).toContain('original-member · r1')
  expect(html).toContain('value="mm-per-turn"'); expect(html).toContain('value="turns-per-mm"')
  expect(html).toMatch(/<input(?=[^>]*aria-label="Avance del tornillo")(?=[^>]*step="any")(?=[^>]*value="1")[^>]*>/)
  expect(html).not.toContain('Portador'); expect(html).toContain('El avance se introduce explícitamente')
  expect(html).toMatch(/<select(?=[^>]*aria-label="Orientación de los ejes del tornillo")(?![^>]*disabled="")[^>]*>/)
})
it('renders exact editing references, preserved full turns and captured axial zero without recapturing', () => {
  const html = renderToStaticMarkup(<AssemblyScrewPanel {...props({ mate: mate() })} />)
  expect(html).toContain('Eje 1: motor · original-member · r1'); expect(html).toContain('Eje 2: nut · original-member · r1')
  expect(html).toContain('Giro relativo acumulado: 720° · 2 vueltas'); expect(html).toContain('Separación axial de referencia: -3 mm')
  expect(html).toContain('conserva los ceros capturados y continúa desde la rama angular guardada')
  expect(html).toContain('aria-label="Vista previa del tornillo"'); expect(html).toContain('aria-label="Cancelar edición del tornillo"')
  expect(html).not.toContain('aria-label="Capturar tornillo"'); expect(html).not.toContain('aria-label="Eje 1 del tornillo"')
})
it('locks the captured alignment in an otherwise editable panel and explains the new-capture route', () => {
  const value = mate(); value.alignment = 'opposed'
  const html = renderToStaticMarkup(<AssemblyScrewPanel {...props({ mate: value })} />)
  expect(html).toMatch(/<select(?=[^>]*aria-label="Orientación de los ejes del tornillo")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<option(?=[^>]*value="opposed")(?=[^>]*selected="")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Avance del tornillo")(?![^>]*disabled="")[^>]*>/)
  expect(html).toContain('Otra orientación de los ejes requiere una nueva captura del tornillo')
})
it('keeps the relative origin-separation sign explicit for direct and reversed coupling', () => {
  const direct = renderToStaticMarkup(<AssemblyScrewPanel {...props({ mate: mate() })} />), reversed = mate(); reversed.reverse = true
  expect(direct).toContain('la separación axial del origen 2 respecto del 1 aumenta 2 mm, medida sobre el eje 1')
  const html = renderToStaticMarkup(<AssemblyScrewPanel {...props({ mate: reversed })} />)
  expect(html).toContain('la separación axial del origen 2 respecto del 1 disminuye 2 mm, medida sobre el eje 1')
  expect(html).toMatch(/<input(?=[^>]*aria-label="Invertir avance del tornillo")(?=[^>]*checked="")[^>]*>/)
})
it('retains negative accumulated turns and distinguishes numeric full-pose intent from a scalar joint driver', () => {
  const value = mate(); value.angle = -5 * Math.PI / 2
  const html = renderToStaticMarkup(<AssemblyScrewPanel {...props({ mate: value })} />)
  expect(html).toContain('Giro relativo acumulado: -450° · -1.25 vueltas')
  expect(html).toContain('El movimiento numérico fija el destino completo'); expect(html).toContain('una posición y un giro compatibles')
})
it('blocks every editable parameter and preview action while an operation owns the editor', () => {
  const html = renderToStaticMarkup(<AssemblyScrewPanel {...props({ mate: mate(), disabled: true })} />)
  for (const label of ['Nombre del tornillo', 'Avance del tornillo', 'Invertir avance del tornillo']) expect(html).toMatch(new RegExp(`<input(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  for (const label of ['Orientación de los ejes del tornillo', 'Unidad del avance del tornillo']) expect(html).toMatch(new RegExp(`<select(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  for (const label of ['Vista previa del tornillo', 'Cancelar edición del tornillo']) expect(html).toMatch(new RegExp(`<button(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
})
it('keeps native capture/edit callbacks idle during SSR and distinguishes coupling from thread/contact geometry', () => {
  const value = mate(), input = props({ mate: value }), before = JSON.stringify(value), html = renderToStaticMarkup(<AssemblyScrewPanel {...input} />)
  expect(html).toContain('Acoplamiento cinemático'); expect(html).toContain('la geometría de rosca y su contacto requieren comprobaciones independientes')
  expect(JSON.stringify(value)).toBe(before)
  for (const callback of [input.onCapture, input.onEdit, input.onCancelEdit]) expect(callback).not.toHaveBeenCalled()
})
