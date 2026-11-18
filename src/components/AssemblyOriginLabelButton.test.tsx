import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { MouseEvent } from 'react'
import { AssemblyOriginLabelButton, originLabelEntries, type OriginLabelCurrent, type OriginLabelFrame } from './AssemblyOriginLabelButton'
import { assemblyOriginDisplayBinding, type AssemblyOriginDisplay } from './assemblyOriginPicking'

// Original declaration-only scope XY. These cases exercise real button markup
// and its production activation handler; they do not run a native CAD scene.
function fixture() {
  const entry: AssemblyOriginDisplay = { key: '["principal-plane",null,"XY"]', label: 'Plano XY · Ámbito right',
    reference: { kind: 'principal-plane', component: null, plane: 'XY' },
    worldPose: { translation: [30, 0, 0], rotation: [0, 0, 0, 1] } }
  const label = { key: entry.key, label: entry.label, binding: assemblyOriginDisplayBinding(entry) }
  const frame: OriginLabelFrame = { signature: 'frame-A', catalog: 'catalog-A', width: 800, height: 600, topInset: 44, usable: true }
  const current: OriginLabelCurrent = { disabled: false, picking: true, signature: 'frame-A', catalog: 'catalog-A',
    presentedCatalog: 'catalog-A', width: 800, height: 600, topInset: 44, entries: originLabelEntries([entry]) }
  const select = vi.fn(), acceptGesture = vi.fn(() => true)
  const render = () => AssemblyOriginLabelButton({ label, frame, current, selected: false,
    onPointerDown() {}, onPointerMove() {}, onPointerUp() {}, onPointerLeave() {}, onPointerCancel() {},
    activate: () => ({ current, acceptGesture, select }) })
  const activate = (button = render()) => button.props.onClick({ detail: 0 } as MouseEvent<HTMLButtonElement>)
  return { entry, label, frame, current, select, acceptGesture, render, activate }
}

describe('current origin-label availability and activation', () => {
  it('renders the unchanged available scope label and selects its exact current entry', () => {
    const f = fixture(), button = f.render(), html = renderToStaticMarkup(button)
    expect(html).toContain('title="Plano XY · Ámbito right"')
    expect(html).not.toContain('disabled=')
    f.activate(button)
    expect(f.select).toHaveBeenCalledExactlyOnceWith(f.entry)
  })

  it.each([
    ['width', (f: ReturnType<typeof fixture>) => { f.current.width = 801 }],
    ['height', (f: ReturnType<typeof fixture>) => { f.current.height = 599 }],
    ['presented frame', (f: ReturnType<typeof fixture>) => { f.current.signature = 'frame-B' }],
    ['presented catalog', (f: ReturnType<typeof fixture>) => { f.current.presentedCatalog = 'catalog-old' }],
    ['published label catalog', (f: ReturnType<typeof fixture>) => { f.frame.catalog = 'catalog-old' }],
    ['ambiguous key', (f: ReturnType<typeof fixture>) => { f.current.entries = originLabelEntries([f.entry, f.entry]) }],
    ['missing key', (f: ReturnType<typeof fixture>) => { f.current.entries = originLabelEntries([]) }],
    ['changed binding', (f: ReturnType<typeof fixture>) => { f.current.entries = originLabelEntries([{ ...f.entry, label: 'Another scope' }]) }],
    ['disabled workspace', (f: ReturnType<typeof fixture>) => { f.current.disabled = true }],
    ['unarmed role', (f: ReturnType<typeof fixture>) => { f.current.picking = false }],
    ['changed inset', (f: ReturnType<typeof fixture>) => { f.current.topInset = 0 }],
    ['unusable layout', (f: ReturnType<typeof fixture>) => { f.frame.usable = false }],
  ])('disables the rendered label and rejects activation for %s', (_name, change) => {
    const f = fixture(); change(f)
    const button = f.render()
    expect(renderToStaticMarkup(button)).toContain('disabled=""')
    f.activate(button)
    expect(f.select).not.toHaveBeenCalled()
    expect(f.acceptGesture).not.toHaveBeenCalled()
  })

  it('rejects an already rendered label after resize and enables the newly published matching frame', () => {
    const f = fixture(), before = f.render()
    f.current.width = 801
    f.activate(before)
    expect(f.select).not.toHaveBeenCalled()
    expect(renderToStaticMarkup(f.render())).toContain('disabled=""')
    f.frame.width = 801; f.frame.signature = 'frame-B'; f.current.signature = 'frame-B'
    const after = f.render()
    expect(renderToStaticMarkup(after)).not.toContain('disabled=')
    f.activate(after)
    expect(f.select).toHaveBeenCalledExactlyOnceWith(f.entry)
  })

  it('waits for the published label catalog even when geometry and the selected key are unchanged', () => {
    const f = fixture()
    f.current.catalog = 'catalog-B'; f.current.presentedCatalog = 'catalog-B'
    expect(renderToStaticMarkup(f.render())).toContain('disabled=""')
    f.activate()
    expect(f.select).not.toHaveBeenCalled()
    f.frame.catalog = 'catalog-B'
    expect(renderToStaticMarkup(f.render())).not.toContain('disabled=')
    f.activate()
    expect(f.select).toHaveBeenCalledExactlyOnceWith(f.entry)
  })

  it('retains the parent held-gesture rejection after the current label is resolved', () => {
    const f = fixture(); f.acceptGesture.mockReturnValue(false)
    f.activate()
    expect(f.acceptGesture).toHaveBeenCalledOnce()
    expect(f.select).not.toHaveBeenCalled()
  })
})
