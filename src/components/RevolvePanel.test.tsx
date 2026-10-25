import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { RevolveFeature, SketchFeature } from '../cad/kernel.types'
import type { EntityProfile } from '../sketch/types'
import RevolvePanel, { mergeRevolutionDraft, revolutionAngleError, revolutionAxisOptions, revolutionAxisValue } from './RevolvePanel'

// Original symbolic declarations exercise presentation and identity, not solved/native geometry.
const profile: EntityProfile = {
  kind: 'entities', points: [{ id: 'a', x: 2, y: 0 }, { id: 'b', x: 2, y: 4 }], constraints: [],
  entities: [
    { id: 'construction-axis', type: 'line', start: 'a', end: 'b', construction: true },
    { id: 'sketch-x', type: 'line', start: 'b', end: 'a', construction: false },
    { id: 'round', type: 'circle', center: 'a', radius: 1, construction: true },
  ],
}
const sketch: SketchFeature = { id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile }
const feature: RevolveFeature = { id: 'revolve', name: 'Original turn', type: 'revolve', suppressed: false, sketchId: sketch.id, angle: 90 }
const render = (value = feature, current: SketchFeature | undefined = sketch) => renderToStaticMarkup(
  <RevolvePanel feature={value} sketch={current} onChange={() => undefined}><input aria-label="Ángulo" value={value.angle} readOnly /></RevolvePanel>,
)

describe('revolution axis and direction controls', () => {
  it('displays legacy Y and forward direction without materializing optional declarations', () => {
    const original = JSON.stringify(feature), html = render()
    expect(html).toContain('<option value="sketch-y" selected="">Eje Y del croquis</option>')
    expect(html).toContain('id="revolution-reversed"')
    expect(html).not.toContain('checked=""')
    expect(JSON.stringify(feature)).toBe(original)
    expect(feature).not.toHaveProperty('axis')
    expect(feature).not.toHaveProperty('reversed')
  })

  it('offers only current unique lines, distinguishes construction, and keeps opaque IDs independent of local axes', () => {
    const options = revolutionAxisOptions(sketch)
    expect(options.map(option => option.value)).toEqual(['sketch-y', 'sketch-x', '["sketch-line","construction-axis"]', '["sketch-line","sketch-x"]'])
    expect(options[2].label).toBe('Línea construction-axis · Construcción')
    expect(options[3].label).toBe('Línea sketch-x · Perfil')
    const reordered = { ...sketch, profile: { ...profile, entities: [...profile.entities].reverse() } }
    expect(revolutionAxisOptions(reordered).find(option => option.axis.kind === 'sketch-line' && option.axis.entityId === 'construction-axis'))
      .toEqual(options[2])
  })

  it.each(['removed', 'retyped', 'ambiguous'] as const)('retains the %s line declaration visibly instead of falling back to Y', mode => {
    const remaining = profile.entities.filter(entity => entity.id !== 'construction-axis')
    const entities = mode === 'removed' ? remaining : mode === 'retyped'
      ? [...remaining, { id: 'construction-axis', type: 'circle' as const, center: 'a', radius: 1, construction: true }]
      : [...profile.entities, profile.entities[0]]
    const selected: RevolveFeature = { ...feature, axis: { kind: 'sketch-line', entityId: 'construction-axis' }, reversed: true }
    const html = render(selected, { ...sketch, profile: { ...profile, entities } })
    expect(html).toContain('disabled="" selected="">Línea no disponible: construction-axis</option>')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('checked=""')
    expect(html).not.toContain('<option value="sketch-y" selected="">')
    expect(selected.axis).toEqual({ kind: 'sketch-line', entityId: 'construction-axis' })
  })

  it('does not borrow a line from another sketch or a previous profile representation', () => {
    const selected: RevolveFeature = { ...feature, axis: { kind: 'sketch-line', entityId: 'construction-axis' } }
    expect(render(selected, { ...sketch, id: 'other' })).toContain('El croquis seleccionado no está disponible.')
    const legacy = { ...sketch, profile: { kind: 'rectangle' as const, center: [3, 2] as [number, number], width: 2, height: 4 } }
    expect(render(selected, legacy)).toContain('Línea no disponible: construction-axis')
    expect(revolutionAxisValue({ kind: 'sketch-axis', axis: 'x' })).toBe('sketch-x')
  })

  it('keeps the legacy angle field and offers only implemented end conditions', () => {
    const html = render()
    expect(html).toContain('id="revolution-end-condition" aria-label="Condición final de revolución"')
    expect(html).toContain('<option value="angle" selected="">Ángulo especificado</option>')
    expect(html).toContain('<option value="mid-plane">Plano medio</option>')
    expect(html).toContain('aria-label="Ángulo"')
    expect(html).toContain('id="revolution-direction-two"')
    expect(html).not.toContain('id="revolution-second-angle"')
    expect(feature).not.toHaveProperty('extent')
  })

  it('renders independent second angle and a combined-angle diagnostic without clamping either input', () => {
    const value: RevolveFeature = { ...feature, angle: 340, extent: { kind: 'two-directions', secondAngle: 30 } }
    const before = structuredClone(value), html = render(value)
    expect(html).toContain('aria-label="Dirección 2" checked=""')
    expect(html).toContain('aria-label="Ángulo de dirección 2"')
    expect(html).toContain('id="revolution-second-angle"')
    expect(html).toContain('value="30"')
    expect(html).toContain('value="340"')
    expect(html).toContain('La suma de los dos ángulos no puede superar 360°.')
    expect(html).toContain('aria-describedby="revolution-angle-error"')
    expect(value).toEqual(before)
  })

  it('explains a total mid-plane angle and retains reversal while disabling it', () => {
    const value: RevolveFeature = { ...feature, reversed: true, extent: { kind: 'mid-plane' } }
    const html = render(value)
    expect(html).toContain('<option value="mid-plane" selected="">Plano medio</option>')
    expect(html).toContain('aria-label="Invertir dirección" disabled="" checked=""')
    expect(html).toContain('El ángulo es el total: la mitad a cada lado del plano del croquis.')
    expect(html).not.toContain('id="revolution-direction-two"')
    expect(html).not.toContain('id="revolution-second-angle"')
    expect(value.reversed).toBe(true)
  })

  it('removes the extent declaration on return to one direction without changing the original profile or reversal', () => {
    const original: RevolveFeature = { ...feature, axis: { kind: 'sketch-line', entityId: 'construction-axis' }, reversed: true }
    const two = mergeRevolutionDraft(original, { extent: { kind: 'two-directions', secondAngle: 0 } })
    expect(two.angle).toBe(90)
    expect(two.extent).toEqual({ kind: 'two-directions', secondAngle: 0 })
    const changed = mergeRevolutionDraft(two, { extent: { kind: 'two-directions', secondAngle: 30 } })
    const mid = mergeRevolutionDraft(changed, { extent: { kind: 'mid-plane' } })
    expect(mid.angle).toBe(original.angle); expect(mid.reversed).toBe(true)
    const single = mergeRevolutionDraft(mid, { extent: undefined })
    expect(single).toEqual(original)
    expect(single).not.toHaveProperty('extent')
    expect(original).not.toHaveProperty('extent')
    expect(two.extent).toEqual({ kind: 'two-directions', secondAngle: 0 })
    expect(changed.extent).toEqual({ kind: 'two-directions', secondAngle: 30 })
  })

  it.each([[0, 90], [90, 0], [270, 90], [360, 0]])('accepts the presentation range for two sides %s + %s', (angle, secondAngle) => {
    expect(revolutionAngleError({ ...feature, angle, extent: { kind: 'two-directions', secondAngle } })).toBeNull()
  })

  it.each([
    [0, 0, 'mayor que 0°'], [-1, 90, 'no pueden ser negativos'], [90, -1, 'no pueden ser negativos'],
    [340, 30, 'no puede superar 360°'], [NaN, 90, 'finitos'], [90, Infinity, 'finitos'],
  ])('rejects the presentation range for two sides %s + %s', (angle, secondAngle, message) => {
    expect(revolutionAngleError({ ...feature, angle: Number(angle), extent: { kind: 'two-directions', secondAngle: Number(secondAngle) } })).toContain(String(message))
  })

  it('keeps positive-angle validation in one-direction and mid-plane modes', () => {
    for (const angle of [0, -1, 361]) {
      expect(revolutionAngleError({ ...feature, angle })).toContain('mayor que 0°')
      expect(revolutionAngleError({ ...feature, angle, extent: { kind: 'mid-plane' } })).toContain('mayor que 0°')
    }
    expect(revolutionAngleError({ ...feature, angle: 360, extent: { kind: 'mid-plane' } })).toBeNull()
  })
})
