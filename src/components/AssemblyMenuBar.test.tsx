import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyMenuBar, { assemblyMenuFocusIndex, type AssemblyMenuDefinition } from './AssemblyMenuBar'
import { AssemblyShellHeader } from './AssemblyCommandManager'

it('keeps a closed menubar accessible without mounting duplicate action buttons or executing them', () => {
  const action = vi.fn(), menus: AssemblyMenuDefinition[] = [
    { id: 'file', label: 'Archivo', items: [{ id: 'save', label: 'Guardar', disabled: true, onSelect: action }] },
    { id: 'view', label: 'Ver', items: [{ id: 'show-axes', label: 'Ejes de origen', checked: true, onSelect: action }] },
  ]
  const html = renderToStaticMarkup(<AssemblyMenuBar menus={menus} />)
  expect(html).toContain('role="menubar"'); expect(html).toContain('aria-label="Menú principal del ensamblaje"')
  expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(2)
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(2)
  expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  expect(html).toContain('data-assembly-menu="file"'); expect(html).toContain('data-assembly-menu="view"')
  expect(html).not.toContain('data-assembly-command'); expect(html).not.toContain('role="menu"'); expect(html).not.toContain('Guardar')
  expect(action).not.toHaveBeenCalled()
})

it('keeps named file identity in the header and existing quick access below the menus', () => {
  const html = renderToStaticMarkup(<AssemblyShellHeader name="Original assembly" dirty fileLabel="original.solidflow"
    menus={[{ id: 'file', label: 'Archivo', items: [] }]}><nav aria-label="Existing file actions"><button>Guardar</button></nav></AssemblyShellHeader>)
  expect(html).toContain('<strong>Original assembly *</strong>')
  expect(html).toContain('original.solidflow')
  expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('aria-label="Existing file actions"'))
  expect(html.match(/>Guardar<\/button>/g)).toHaveLength(1)
})

it('preserves the prior header arrangement when a caller has no menu definitions', () => {
  const html = renderToStaticMarkup(<AssemblyShellHeader name="Original legacy caller"><nav aria-label="File actions"><button>Abrir</button></nav></AssemblyShellHeader>)
  expect(html.indexOf('aria-label="File actions"')).toBeLessThan(html.indexOf('</header>'))
  expect(html).not.toContain('role="menubar"'); expect(html).not.toContain('assembly-shell-quick-access')
})

it('wraps keyboard navigation and skips commands unavailable in the current workspace state', () => {
  const items = [{ disabled: true }, {}, { disabled: true }, {}]
  expect(assemblyMenuFocusIndex(items, -1, 1)).toBe(1)
  expect(assemblyMenuFocusIndex(items, -1, -1)).toBe(3)
  expect(assemblyMenuFocusIndex(items, 1, 1)).toBe(3)
  expect(assemblyMenuFocusIndex(items, 3, 1)).toBe(1)
  expect(assemblyMenuFocusIndex(items, 1, -1)).toBe(3)
  expect(assemblyMenuFocusIndex(items, 3, -1)).toBe(1)
  expect(assemblyMenuFocusIndex([], -1, 1)).toBeNull()
  expect(assemblyMenuFocusIndex([{ disabled: true }], -1, 1)).toBeNull()
  expect(assemblyMenuFocusIndex([{}], 0, -1)).toBe(0)
})
