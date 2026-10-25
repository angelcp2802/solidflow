import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { EdgeFinishFeature, EdgeSelection } from '../cad/kernel.types'
import EdgeFinishPanel from './EdgeFinishPanel'

// Original symbolic references only: SSR checks presentation, not native geometry,
// actual viewport picking, CSS visibility or keyboard/pointer interaction.
const selected = (count: number): EdgeSelection => ({ mode: 'selected', edges: Array.from({ length: count }, (_, index) => ({
  sourceFeatureId: 'original-source', key: `original-edge-${index}`,
})) })
const feature = (type: EdgeFinishFeature['type'], selection = selected(2)): EdgeFinishFeature => ({
  id: 'original-finish', name: 'Original finish', type, suppressed: false,
  baseFeatureId: 'original-source', size: 1.5, selection,
})
const noAction = () => { throw Error('Rendering must not invoke an editing callback') }
const render = (draft: EdgeFinishFeature, { loading = false, canPreview = true, preview = false } = {}) => renderToStaticMarkup(
  <EdgeFinishPanel feature={draft} onSize={noAction} onSelection={noAction} onPreview={noAction}
    loading={loading} canPreview={canPreview} preview={preview} />)
const button = (markup: string, label: string) => {
  const matches = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
    .filter(match => match[2].replace(/<[^>]*>/g, '').trim() === label)
  expect(matches).toHaveLength(1)
  return matches[0][1]
}

describe('selection-first solid edge finishing', () => {
  it.each([
    ['fillet', 'Radio del redondeo', 'Radio constante'],
    ['chamfer', 'Distancia del chaflán', 'Distancias iguales'],
  ] as const)('presents edge selection before the named %s size without changing its draft', (type, label, heading) => {
    const draft = feature(type), before = structuredClone(draft), markup = render(draft)
    const numbers = markup.match(/<input\b[^>]*type="number"[^>]*>/g) ?? []
    expect(numbers).toHaveLength(1)
    expect(numbers[0]).toContain(`aria-label="${label}"`)
    expect(numbers[0]).toContain('value="1.5"')
    expect(markup).toContain(heading)
    expect(markup.indexOf('Aristas del acabado')).toBeLessThan(markup.indexOf(`aria-label="${label}"`))
    expect(markup).toContain('aria-label="Vaciar selección de aristas"')
    expect(markup).toContain('aria-label="Quitar arista 1"')
    expect(markup).toContain('aria-label="Quitar arista 2"')
    expect(button(markup, 'Seleccionar aristas')).not.toContain('disabled')
    expect(button(markup, 'Vista previa')).not.toContain('disabled')
    expect(draft).toEqual(before)
  })

  it.each([false, true])('keeps every selected edge and removal control mounted when preview is %s', preview => {
    const markup = render(feature('fillet', selected(12)), { preview })
    const list = markup.match(/<ul\b[^>]*aria-label="Aristas seleccionadas"[^>]*>([\s\S]*?)<\/ul>/)
    expect(list).not.toBeNull()
    expect(list![1].match(/<li\b/g)).toHaveLength(12)
    for (let index = 1; index <= 12; index++) expect(list![1]).toContain(`aria-label="Quitar arista ${index}"`)
    expect(markup).not.toMatch(/\shidden(?:=|\s|>)/)
    expect(markup).not.toContain('<details')
    expect(markup).not.toContain('Haz clic en las aristas de la pieza.')
  })

  it('distinguishes an empty manual selection from all edges without implying a preview is available', () => {
    const empty = render(feature('chamfer', selected(0)), { canPreview: false })
    expect(empty).toContain('aria-label="Aristas seleccionadas"')
    expect(empty).toContain('Haz clic en las aristas de la pieza.')
    expect(empty).toMatch(/<button(?=[^>]*aria-label="Vaciar selección de aristas")(?=[^>]*disabled="")[^>]*>/)
    expect(empty).not.toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*checked="")[^>]*>/)
    expect(button(empty, 'Vista previa')).toContain('disabled=""')

    const all = render(feature('chamfer', { mode: 'all' }), { canPreview: false })
    expect(all).toContain('Todas las aristas')
    expect(all).toMatch(/<input(?=[^>]*type="checkbox")(?=[^>]*checked="")[^>]*>/)
    expect(all).not.toContain('aria-label="Aristas seleccionadas"')
    expect(all).not.toContain('Vaciar selección de aristas')
    expect(all).not.toContain('Haz clic en las aristas de la pieza.')
    expect(button(all, 'Vista previa')).toContain('disabled=""')
  })

  it.each([
    { loading: true, canPreview: false },
    { loading: false, canPreview: false },
    { loading: false, canPreview: true },
  ])('preserves source-loading and preview-availability guards: %j', state => {
    const markup = render(feature('fillet'), state)
    expect(button(markup, 'Seleccionar aristas').includes('disabled=""')).toBe(state.loading)
    expect(button(markup, 'Vista previa').includes('disabled=""')).toBe(!state.canPreview)
    if (state.loading) expect(markup).toContain('Preparando la pieza anterior al acabado…')
    else expect(markup).toContain('Gira la pieza para seleccionar sus aristas.')
  })
})
