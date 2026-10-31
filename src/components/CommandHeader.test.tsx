import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CommandHeader from './CommandHeader'
import AssemblyMenuBar from './AssemblyMenuBar'
import { createHeaderMenuPreference, headerMenuPreference } from './headerMenuPreference'

afterEach(() => headerMenuPreference.setPinned(true))

it('shares an immutable preference snapshot across subscribers without notifying unchanged state or removed workspaces', () => {
  const preference = createHeaderMenuPreference(), part = vi.fn(), assembly = vi.fn()
  const removePart = preference.subscribe(part), removeAssembly = preference.subscribe(assembly)
  expect(preference.snapshot()).toBe(true)
  preference.setPinned(true); expect(part).not.toHaveBeenCalled()
  preference.setPinned(false); expect(part).toHaveBeenCalledOnce(); expect(assembly).toHaveBeenCalledOnce()
  removePart(); preference.setPinned(true)
  expect(part).toHaveBeenCalledOnce(); expect(assembly).toHaveBeenCalledTimes(2)
  removeAssembly(); preference.setPinned(false); expect(assembly).toHaveBeenCalledTimes(2)
  expect(preference.snapshot()).toBe(false)
})

it('keeps commands caller-owned and the initial pinned layout accessible', () => {
  const action = vi.fn()
  const html = renderToStaticMarkup(<CommandHeader brand="SolidFlow"
    menus={<AssemblyMenuBar menus={[{ id: 'file', label: 'Archivo', items: [{ id: 'save', label: 'Guardar', disabled: true, onSelect: action }] }]} />}
    quickActions={<button disabled>Guardar pieza</button>} document={<span>Pieza original</span>} />)
  expect(html).toContain('data-menu-pinned="true"'); expect(html).toContain('data-menu-expanded="true"')
  expect(html).toContain('role="menubar"'); expect(html).toContain('aria-label="Fijar barra de menús" aria-pressed="true"')
  expect(html).toContain('<button disabled="">Guardar pieza</button>'); expect(html).toContain('Pieza original')
  expect(html).not.toContain('Mostrar barra de menús'); expect(html).not.toContain('data-assembly-command')
  expect(action).not.toHaveBeenCalled()
})

it('remounts collapsed in the same session with one disclosure and no hidden menu actions', () => {
  headerMenuPreference.setPinned(false)
  const html = renderToStaticMarkup(<CommandHeader menus={<AssemblyMenuBar menus={[{ id: 'file', label: 'Archivo', items: [] }]} />}
    quickActions={<button>Guardar</button>} />)
  expect(html).toContain('data-menu-pinned="false"'); expect(html).toContain('data-menu-expanded="false"')
  expect(html).toContain('aria-label="Mostrar barra de menús"'); expect(html).toContain('aria-controls=')
  expect(html).toContain('class="command-header-menus" hidden=""')
  expect(html).not.toContain('role="menubar"'); expect(html).not.toContain('data-header-menu-pin')
  expect(html).toContain('>Guardar</button>'); expect(html).not.toContain('inert=""')
})

it('leaves callers without menus free of disclosure or pin controls', () => {
  headerMenuPreference.setPinned(false)
  const html = renderToStaticMarkup(<CommandHeader brand="SolidFlow" quickActions={<button>Abrir</button>} />)
  expect(html).not.toContain('data-menu-pinned'); expect(html).not.toContain('data-header-menu-pin')
  expect(html).not.toContain('Mostrar barra de menús'); expect(html).toContain('>Abrir</button>')
})
