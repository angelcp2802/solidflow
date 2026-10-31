import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyTranslationPanel, { assemblyTranslationMatches, assemblyTranslationTarget, type AssemblyUiTranslation } from './AssemblyTranslationPanel'
import type { AssemblyDragFrame } from '../model/assemblyDrag'
import type { AssemblyTranslationRequest } from '../model/assemblyTranslation'
import { identityRigidPose } from '../model/rigidPose'

// Original numeric intent and symbolic display fixtures only. These tests do
// not seed an accepted native response, contact trace, scene or Apply token.
const component = { occurrencePath: ['carrier', 'pin'], definition: { id: 'opaque-pin', revision: 'opaque-pin-r2' } }
const drivenComponent = { occurrencePath: ['carrier'], definition: { id: 'opaque-carrier', revision: 'opaque-carrier-r1' } }
function frame(): AssemblyDragFrame {
  return { component: structuredClone(component), drivenComponent: structuredClone(drivenComponent),
    worldPose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
    ownerPose: identityRigidPose(), relativePose: identityRigidPose(), visible: true, affectedPaths: [['carrier']] }
}
function request(): AssemblyTranslationRequest { return { component: structuredClone(component), translation: [14, 20, 30] } }
const options = { clearance: .05, lengthTolerance: 1e-6 }
function witness(): AssemblyUiTranslation {
  return { component: structuredClone(component), drivenComponent: structuredClone(drivenComponent),
    requestedPose: { ...frame().worldPose, translation: [14, 20, 30] }, resolvedPose: { ...frame().worldPose, translation: [11, 20, 30] },
    ...options, trace: { fraction: .25, status: 'stopped', bodyCount: 3, pairCount: 2, invariantPairCount: 1, queryCount: 12,
      blockingPair: { first: { component: structuredClone(component), body: { bodyId: 'opaque-body', sourceFeatureId: 'opaque-feature' }, componentName: 'Pasador móvil', bodyName: 'Cuerpo del pasador' },
        second: { component: { occurrencePath: ['stop'], definition: { id: 'opaque-stop', revision: 'opaque-stop-r1' } }, body: null, componentName: 'Tope fijo', bodyName: 'Cuerpo del tope' },
        minimumDistance: .050003, lengthTolerance: 1e-6, band: .0500031, closestPoints: { first: [12, 20, 30], second: [12.050003, 20, 30] } } } }
}
const checks = [{ constraintId: 'opaque-mate', lengthResidual: 2e-7, angleResidual: 3e-9, lengthTolerance: 1e-6, angleTolerance: 1e-8, satisfied: true }]
function render(value?: AssemblyUiTranslation, relationChecks = checks) {
  return renderToStaticMarkup(<AssemblyTranslationPanel frame={frame()} name="Pasador móvil" drivenName="Soporte móvil" disabled={!!value} witness={value} checks={relationChecks} onPreview={() => undefined} />)
}
it('prepares an absolute world destination without rotating it through the selected component frame', () => {
  const source = frame(), before = JSON.stringify(source), target = assemblyTranslationTarget(source.component, ['14', '-7', '30'], '0')
  expect(target.request.translation).toEqual([14, -7, 30]); expect(Object.keys(target.request).sort()).toEqual(['component', 'translation'])
  expect(target.stopOptions).toEqual({ clearance: 0, lengthTolerance: 1e-6 }); expect(Object.hasOwn(target.stopOptions, 'maxQueries')).toBe(false)
  target.request.translation[0] = 999; target.request.component.occurrencePath[0] = 'changed'; target.request.component.definition.revision = 'changed'
  expect(JSON.stringify(source)).toBe(before)
})
it('accepts finite coordinates without an arbitrary UI magnitude cap and keeps explicit whitespace zero', () => {
  const target = assemblyTranslationTarget(component, ['1e100', ' 0 ', '-1e100'], '.125')
  expect(target.request.translation).toEqual([1e100, 0, -1e100]); expect(target.stopOptions.clearance).toBe(.125)
})
it.each([
  { label: 'empty X', translation: ['', '2', '3'], clearance: '0' },
  { label: 'blank Y', translation: ['1', ' ', '3'], clearance: '0' },
  { label: 'invalid Z', translation: ['1', '2', 'abc'], clearance: '0' },
  { label: 'infinite X', translation: ['Infinity', '2', '3'], clearance: '0' },
  { label: 'overflow Z', translation: ['1', '2', '1e309'], clearance: '0' },
  { label: 'empty clearance', translation: ['1', '2', '3'], clearance: '' },
  { label: 'blank clearance', translation: ['1', '2', '3'], clearance: ' ' },
  { label: 'infinite clearance', translation: ['1', '2', '3'], clearance: 'Infinity' },
])('rejects $label without interpreting missing intent as zero', ({ translation, clearance }) => {
  expect(() => assemblyTranslationTarget(component, [translation[0], translation[1], translation[2]], clearance)).toThrow('finito')
})
it('rejects negative clearance instead of changing it silently', () => {
  expect(() => assemblyTranslationTarget(component, ['1', '2', '3'], '-.01')).toThrow('no negativa')
})
it('binds the displayed witness to the exact world request, selected revision and driven root without supplying authority', () => {
  const value = witness(), selected = frame(), before = JSON.stringify({ value, selected, options })
  expect(assemblyTranslationMatches(value, selected, request(), options)).toBe(true)
  expect(JSON.stringify({ value, selected, options })).toBe(before); expect(Object.hasOwn(value, 'token')).toBe(false)
  expect(assemblyTranslationMatches(undefined, selected, request(), options)).toBe(false)
})
it.each([
  { label: 'selected path', change: (value: AssemblyUiTranslation) => { value.component.occurrencePath = ['carrier', 'pin-2'] } },
  { label: 'selected path prefix', change: (value: AssemblyUiTranslation) => { value.component.occurrencePath = ['carrier'] } },
  { label: 'selected definition', change: (value: AssemblyUiTranslation) => { value.component.definition.id = 'another-pin' } },
  { label: 'selected revision', change: (value: AssemblyUiTranslation) => { value.component.definition.revision = 'r1' } },
  { label: 'root path', change: (value: AssemblyUiTranslation) => { value.drivenComponent.occurrencePath = ['other-carrier'] } },
  { label: 'root definition', change: (value: AssemblyUiTranslation) => { value.drivenComponent.definition.id = 'other-root' } },
  { label: 'root revision', change: (value: AssemblyUiTranslation) => { value.drivenComponent.definition.revision = 'r2' } },
  { label: 'absolute destination', change: (value: AssemblyUiTranslation) => { value.requestedPose.translation[0] = 4 } },
  { label: 'clearance', change: (value: AssemblyUiTranslation) => { value.clearance = 0 } },
  { label: 'distance tolerance', change: (value: AssemblyUiTranslation) => { value.lengthTolerance = 1e-3 } },
])('does not relabel a different $label as this request', ({ change }) => {
  const value = witness(); change(value); expect(assemblyTranslationMatches(value, frame(), request(), options)).toBe(false)
})
it('rejects a request from another occurrence even when the witness still matches the current selection', () => {
  const other = request(); other.component.occurrencePath = ['carrier', 'other-pin']
  expect(assemblyTranslationMatches(witness(), frame(), other, options)).toBe(false)
})
it('renders global input fields and a zero-clearance default without dispatching an operation during SSR', () => {
  const callback = vi.fn(), html = renderToStaticMarkup(<AssemblyTranslationPanel frame={frame()} name="Pasador móvil" drivenName="Soporte móvil" disabled={false} onPreview={callback} />)
  expect(html).toContain('aria-label="Trasladar hasta contacto"'); expect(html).toContain('Destino absoluto global de Pasador móvil')
  expect(html).toContain('grupo rígido Soporte móvil'); expect(html).toContain('en línea recta, sin cambiar su orientación')
  expect(html).toMatch(/<input(?=[^>]*aria-label="Destino global X hasta contacto")(?=[^>]*value="10")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Destino global Z hasta contacto")(?=[^>]*value="30")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Holgura hasta contacto")(?=[^>]*value="0")[^>]*>/)
  expect(html).toContain('aria-label="Vista previa con parada"'); expect(callback).not.toHaveBeenCalled()
  expect(html).not.toContain('Destino local'); expect(html).not.toContain('Eje local'); expect(html).not.toContain('opaque-')
})
it('does not block an eligible hidden group merely because it is not rendered visibly', () => {
  const hidden = { ...frame(), visible: false }
  const html = renderToStaticMarkup(<AssemblyTranslationPanel frame={hidden} name="Soporte oculto" disabled={false} onPreview={() => undefined} />)
  expect(html).toContain('piezas activas ocultas'); expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa con parada")(?![^>]*disabled)[^>]*>/)
})
it('blocks unavailable root/suppression frames without inventing a zero world placement', () => {
  const html = renderToStaticMarkup(<AssemblyTranslationPanel frame={null} name="Componente fijo" disabled={false} blockedReason="El grupo raíz es fijo." onPreview={() => undefined} />)
  expect(html).toContain('El grupo raíz es fijo.'); expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa con parada")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Destino global X hasta contacto")(?=[^>]*value="")(?=[^>]*disabled="")[^>]*>/)
})
it('blocks the input and preview while an operation or unapplied preview owns the workspace', () => {
  const html = renderToStaticMarkup(<AssemblyTranslationPanel frame={frame()} name="Pasador" disabled onPreview={() => undefined} />)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Vista previa con parada")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Holgura hasta contacto")(?=[^>]*disabled="")[^>]*>/)
})
it('separates a quarter-path numerical stop from its requested endpoint, clearance and natural relation checks', () => {
  const value = witness(), before = JSON.stringify({ value, checks }), html = render(value)
  expect(html).toContain('Parada en la banda numérica de contacto'); expect(html).toContain('recorrido 25 %')
  expect(html).toContain('Destino solicitado global: 14, 20, 30 mm'); expect(html).toContain('Posición resuelta global: 11, 20, 30 mm')
  expect(html).toContain('Holgura solicitada: 0.05 mm'); expect(html).toContain('Tolerancia de distancia: 0.000001 mm'); expect(html).toContain('no afirma contacto exacto')
  expect(html).toContain('Pasador móvil · Cuerpo del pasador / Tope fijo · Cuerpo del tope'); expect(html).toContain('distancia 0.050003 mm; banda de parada 0.0500031 mm')
  expect(html).toContain('3 cuerpos activos; 2 pares con movimiento relativo, 12 consultas de distancia'); expect(html).toContain('Pares de desplazamiento igual: 1')
  expect(html).toContain('no se certifica que estén libres de interferencias'); expect(html).toContain('1 de 1 dentro de sus tolerancias')
  expect(html).toContain('sin ancla temporal'); expect(html).toContain('el documento confirmado todavía no ha cambiado')
  expect(html).not.toContain('opaque-'); expect(JSON.stringify({ value, checks })).toBe(before)
})
it('shows a completed native trace without inventing a blocking pair or exact contact', () => {
  const value = witness(); value.trace.status = 'complete'; value.trace.fraction = 1; delete value.trace.blockingPair; value.resolvedPose.translation = [...value.requestedPose.translation]
  const html = render(value, []); expect(html).toContain('Destino completado'); expect(html).toContain('recorrido 100 %'); expect(html).not.toContain('banda de parada 0.0500031')
  expect(html).toContain('No hay relaciones activas que comprobar'); expect(html).not.toContain('0 grados de libertad')
})
it('keeps an out-of-tolerance symbolic relation visible rather than calling the translation acceptable', () => {
  const html = render(witness(), [{ ...checks[0], satisfied: false }])
  expect(html).toContain('0 de 1 dentro de sus tolerancias'); expect(html).toContain('Hay relaciones fuera de tolerancia')
})
