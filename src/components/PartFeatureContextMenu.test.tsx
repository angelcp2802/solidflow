import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Pencil } from 'lucide-react'
import PartFeatureContextMenu, { clampPartContextMenu } from './PartFeatureContextMenu'
import CadContextMenu from './CadContextMenu'

it('keeps tree commands inside the viewport at edges and in a compact window', () => {
  expect(clampPartContextMenu({ x: 1000, y: 650 }, { width: 260, height: 120 }, { width: 1024, height: 661 }))
    .toEqual({ x: 756, y: 533 })
  expect(clampPartContextMenu({ x: -30, y: -10 }, { width: 260, height: 120 }, { width: 1024, height: 661 }))
    .toEqual({ x: 8, y: 8 })
  expect(clampPartContextMenu({ x: 320, y: 100 }, { width: 260, height: 120 }, { width: 1024, height: 661 }))
    .toEqual({ x: 320, y: 100 })
  expect(clampPartContextMenu({ x: 200, y: 300 }, { width: 304, height: 224 }, { width: 320, height: 240 }))
    .toEqual({ x: 8, y: 8 })
})

it('renders only caller actions with feature identity and disabled state, without invoking them', () => {
  const select = vi.fn(), close = vi.fn()
  const html = renderToStaticMarkup(<PartFeatureContextMenu featureName="Saliente <1>" point={{ x: 30, y: 40 }} onClose={close}
    actions={[{ id: 'edit-feature', label: 'Editar operación', icon: Pencil, onSelect: select },
      { id: 'edit-sketch', label: 'Editar croquis', disabled: true, onSelect: select }]} />)
  expect(html).toContain('role="menu"')
  expect(html).toContain('Saliente &lt;1&gt;')
  expect(html.match(/role="menuitem"/g)).toHaveLength(2)
  expect(html).toContain('data-part-context-action="edit-feature"')
  expect(html).toContain('data-part-context-action="edit-sketch"')
  expect(html).toContain('aria-disabled="true"')
  expect(html).not.toContain('Eliminar')
  expect(select).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled()
})

it('keeps neutral component commands separate from legacy part selectors', () => {
  const select = vi.fn(), close = vi.fn()
  const html = renderToStaticMarkup(<CadContextMenu targetName="Componente <2>" point={{ x: 20, y: 30 }} onClose={close}
    actions={[{ id: 'properties', label: 'Propiedades', onSelect: select },
      { id: 'fix', label: 'Fijar', disabled: true, onSelect: select }]} />)
  expect(html).toContain('role="menu"')
  expect(html).toContain('Componente &lt;2&gt;')
  expect(html.match(/role="menuitem"/g)).toHaveLength(2)
  expect(html).toContain('data-cad-context-action="properties"')
  expect(html).toContain('data-cad-context-index="0"')
  expect(html).toContain('data-cad-context-action="fix"')
  expect(html).toContain('aria-disabled="true"')
  expect(html).not.toContain('data-part-context-')
  expect(select).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled()
})
