import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyRackPinionPanel, { assemblyRackPinionUiChangeMode, assemblyRackPinionUiEdit, assemblyRackPinionUiParameters,
  type AssemblyRackPinionPanelProps, type AssemblyRackPinionUiFields, type AssemblyUiRackPinionMate } from './AssemblyRackPinionPanel'
import type { AssemblyAxisReference, AssemblyEdgeReference } from '../model/assemblyDocument'

// Original symbolic references and arithmetic oracles; no native solve/capability.
const component = (id: string) => ({ occurrencePath: [id], definition: { id, revision: 'r1' } })
const axis: AssemblyAxisReference = { kind: 'face', support: 'axis', component: component('pinion'), body: null, face: { sourceFeatureId: 'final', key: 'face-v1|original' } }
const edge: AssemblyEdgeReference = { kind: 'edge', support: 'line', component: component('rack'), body: { bodyId: 'rack-body', sourceFeatureId: 'final' }, edge: { sourceFeatureId: 'final', key: 'edge-v1|original' } }
const fields = (change: Partial<AssemblyRackPinionUiFields> = {}): AssemblyRackPinionUiFields => ({ name: 'Original coupling', mode: 'diameter', value: '', reverse: false, ...change })
function mate(): AssemblyUiRackPinionMate { return { id: 'original-pair', type: 'rack-pinion', name: 'Original coupling', suppressed: false,
  first: structuredClone(axis), second: structuredClone(edge), conversion: { mode: 'diameter', override: null }, reverse: false, neutralRotation: [0, 0, 0, 1], angle: 4 * Math.PI, neutralTravel: -10 } }
function props(change: Partial<AssemblyRackPinionPanelProps> = {}): AssemblyRackPinionPanelProps { return {
  pinions: [{ key: 'exact-pinion', label: 'Pinion · pinion · r1 · Cilindro R2', reference: axis, radius: 2 }],
  racks: [{ key: 'exact-edge', label: 'Rack · rack · r1 · Arista lineal · dirección canónica (1, 0, 0)', reference: edge }],
  firstKey: 'exact-pinion', secondKey: 'exact-edge', nativeRadius: 2, disabled: false, canCapture: true,
  onChoice: vi.fn(), onPick: vi.fn(), onCapture: vi.fn(), onEdit: vi.fn(), onCancelEdit: vi.fn(), ...change } }
it('keeps blank input as a native default declaration rather than saving a nominal diameter', () => {
  expect(assemblyRackPinionUiParameters(fields(), 2)).toEqual({ name: 'Original coupling', conversion: { mode: 'diameter', override: null }, reverse: false })
  expect(assemblyRackPinionUiParameters(fields({ mode: 'travel', value: '  ' }), 5).conversion).toEqual({ mode: 'travel', override: null })
})
it('preserves explicit diameter or travel overrides and independent reverse', () => {
  expect(assemblyRackPinionUiParameters(fields({ value: '4', reverse: true }), 2)).toMatchObject({ conversion: { mode: 'diameter', override: 4 }, reverse: true })
  expect(assemblyRackPinionUiParameters(fields({ value: '12', mode: 'travel' }), 2).conversion).toEqual({ mode: 'travel', override: 12 })
})
it('switches explicit modes without changing physical distance per turn', () => {
  const travel = assemblyRackPinionUiChangeMode(fields({ value: '4' }), 'travel', 2)
  expect(travel.mode).toBe('travel'); expect(Number(travel.value)).toBeCloseTo(4 * Math.PI, 14)
  expect(Number(assemblyRackPinionUiChangeMode(travel, 'diameter', 2).value)).toBeCloseTo(4, 14)
})
it('keeps an empty default empty in either mode and deletion restores the fresh native value policy', () => {
  expect(assemblyRackPinionUiChangeMode(fields(), 'travel', 2).value).toBe('')
  const edited = fields({ value: '12', mode: 'travel' }); edited.value = ''
  expect(assemblyRackPinionUiParameters(edited, 9).conversion.override).toBeNull()
})
it.each(['0', '-1', 'Infinity', 'NaN', '1e309', '1e-400', 'word'])('rejects invalid explicit override %s', value => {
  expect(() => assemblyRackPinionUiParameters(fields({ value }), 2)).toThrow()
})
it('rejects unrepresentable conversion arithmetic rather than accepting zero advance', () => {
  expect(() => assemblyRackPinionUiParameters(fields({ value: '5e-324', mode: 'travel' }), 2)).toThrow()
  expect(() => assemblyRackPinionUiParameters(fields({ value: '1e308' }), 2)).toThrow()
})
it('rejects unknown modes and invalid native support metadata', () => {
  expect(() => assemblyRackPinionUiParameters(fields({ mode: 'invalid' as 'travel' }), 2)).toThrow()
  expect(() => assemblyRackPinionUiParameters(fields(), NaN)).toThrow()
  expect(() => assemblyRackPinionUiChangeMode(fields({ value: '4' }), 'invalid' as 'diameter', 2)).toThrow()
})
it('rejects missing/oversized names and nonboolean reverse', () => {
  for (const name of [' ', 'a'.repeat(201)]) expect(() => assemblyRackPinionUiParameters(fields({ name }), 2)).toThrow()
  expect(() => assemblyRackPinionUiParameters(fields({ reverse: 1 as unknown as boolean }), 2)).toThrow()
})
it('edits only user intent and retains detached exact references, captured zeros and full turns', () => {
  const source = mate(), before = JSON.stringify(source), next = assemblyRackPinionUiEdit(source, fields({ name: 'Edited pair', value: '12', mode: 'travel', reverse: true }), 2)
  expect(next).toMatchObject({ id: source.id, first: source.first, second: source.second, angle: 4 * Math.PI, neutralTravel: -10, neutralRotation: [0, 0, 0, 1], conversion: { mode: 'travel', override: 12 }, reverse: true })
  next.first.component.occurrencePath[0] = 'changed'; next.neutralRotation[0] = .1
  expect(JSON.stringify(source)).toBe(before)
})
it('renders the white empty native default and current diameter placeholder', () => {
  const html = renderToStaticMarkup(<AssemblyRackPinionPanel {...props()} />)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Valor de conversión del piñón")(?=[^>]*class="assembly-conversion-default")(?=[^>]*value="")(?=[^>]*placeholder="4")[^>]*>/)
  expect(html).toContain('distancia por vuelta: 12.566370614359172 mm/vuelta')
  expect(html).toContain('Borra la sustitución para restaurarlo')
})
it('keeps an explicit override yellow even when numerically equal to the native default', () => {
  const value = mate(); value.conversion.override = 4
  const html = renderToStaticMarkup(<AssemblyRackPinionPanel {...props({ mate: value })} />)
  expect(html).toMatch(/<input(?=[^>]*class="assembly-conversion-override")(?=[^>]*value="4")[^>]*>/)
  expect(html).toContain('El valor amarillo es una sustitución explícita')
})
it('refreshes a default placeholder from selected native pinion metadata', () => {
  const input = props(); input.pinions = [{ ...input.pinions[0], radius: 3 }]
  const html = renderToStaticMarkup(<AssemblyRackPinionPanel {...input} />)
  expect(html).toContain('placeholder="6"'); expect(html).toContain('piñón: 6 mm')
})
it('offers exact line-edge selection and cylindrical picking without plane normals or coaxiality controls', () => {
  const html = renderToStaticMarkup(<AssemblyRackPinionPanel {...props()} />)
  expect(html).toContain('value="exact-pinion"'); expect(html).toContain('value="exact-edge"'); expect(html).toContain('dirección canónica (1, 0, 0)')
  for (const label of ['Seleccionar arista lineal', 'Seleccionar cilindro del piñón', 'Seleccionar eje cilíndrico de la cremallera']) expect(html).toContain(`aria-label="${label}"`)
  expect(html).not.toContain('Orientación'); expect(html).not.toContain('Portador'); expect(html).not.toContain('normal de plano')
})
it('blocks capture and reference picking until a native preview is current', () => {
  const html = renderToStaticMarkup(<AssemblyRackPinionPanel {...props({ canCapture: false })} />)
  for (const label of ['Capturar cremallera y piñón', 'Seleccionar arista lineal']) expect(html).toMatch(new RegExp(`<button(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
})
it('shows saved references/turns while editing and requires native radius for its preview action', () => {
  const html = renderToStaticMarkup(<AssemblyRackPinionPanel {...props({ mate: mate(), nativeRadius: undefined })} />)
  expect(html).toContain('Piñón: pinion · pinion · r1'); expect(html).toContain('Cremallera: rack · rack · r1 · Arista lineal')
  expect(html).toContain('2 vueltas'); expect(html).toContain('Referencia lineal capturada: -10 mm')
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa de cremallera y piñón")(?=[^>]*disabled="")[^>]*>/)
})
it('blocks parameters during pending work and keeps all callbacks idle during SSR', () => {
  const input = props({ mate: mate(), disabled: true }), before = JSON.stringify(input.mate), html = renderToStaticMarkup(<AssemblyRackPinionPanel {...input} />)
  for (const label of ['Valor de conversión del piñón', 'Nombre de cremallera y piñón', 'Invertir avance de la cremallera']) expect(html).toMatch(new RegExp(`<input(?=[^>]*aria-label="${label}")(?=[^>]*disabled="")[^>]*>`))
  expect(html).toContain('sin contacto de dientes ni prevención de colisiones'); expect(JSON.stringify(input.mate)).toBe(before)
  for (const callback of [input.onChoice, input.onPick, input.onCapture, input.onEdit, input.onCancelEdit]) expect(callback).not.toHaveBeenCalled()
})
