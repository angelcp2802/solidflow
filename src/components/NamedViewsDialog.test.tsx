import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NamedViewsDialog, namedViewDialogKeyAction, namedViewTextEditingKey } from './NamedViewsDialog'
import { ViewOrientationControls } from './ViewOrientationControls'
import { MAX_NAMED_VIEWS, type NamedView } from '../model/namedViews'

const saved = (id: string, name: string): NamedView => ({ id, name, view: {
  position: [0, 0, 30], target: [0, 0, 0], up: [0, 1, 0], top: 10, bottom: -10, zoom: 1, near: 0.1, far: 100,
} })
const callbacks = { onSave: () => 'created', onShow: () => {}, onDelete: () => {}, onRename: () => {}, onUpdate: () => {}, onClose: () => {} }

describe('named view presentation boundaries', () => {
  it('permits native word editing and composed text while keeping file commands blocked', () => {
    const key = (value: string, modifiers = {}) => ({ key: value, ctrlKey: true, metaKey: false, altKey: false,
      isComposing: false, getModifierState: () => false, ...modifiers })
    expect(namedViewTextEditingKey(key('ArrowLeft'))).toBe(true)
    expect(namedViewTextEditingKey(key('Backspace'))).toBe(true)
    expect(namedViewTextEditingKey(key('ArrowRight', { ctrlKey: false, altKey: true }))).toBe(true)
    expect(namedViewTextEditingKey(key('@', { altKey: true, getModifierState: (name: string) => name === 'AltGraph' }))).toBe(true)
    expect(namedViewTextEditingKey(key('Dead', { ctrlKey: false, altKey: true }))).toBe(true)
    expect(namedViewTextEditingKey(key('Process', { isComposing: true }))).toBe(true)
    for (const value of ['s', 'o', 'n']) expect(namedViewTextEditingKey(key(value))).toBe(false)
    expect(namedViewTextEditingKey(key('F4', { ctrlKey: false, altKey: true }))).toBe(false)
    expect(namedViewDialogKeyAction(key('ArrowRight', { ctrlKey: false, altKey: true }), true)).toBe('native')
    expect(namedViewDialogKeyAction(key('@', { altKey: true, getModifierState: () => true }), true)).toBe('native')
    expect(namedViewDialogKeyAction(key('s'), true)).toBe('block')
    expect(namedViewDialogKeyAction(key('s'), false)).toBe('block')
    expect(namedViewDialogKeyAction(key('Escape', { ctrlKey: false }), true)).toBe('close')
    expect(namedViewDialogKeyAction(key('Escape', { isComposing: true }), true)).toBe('native')
    expect(namedViewDialogKeyAction(key('Escape'), true, true)).toBe('native')
  })
  it('renders document names as text rather than markup or attributes', () => {
    const html = renderToStaticMarkup(<NamedViewsDialog views={[saved('original', '<img src=x onerror="bad()">')]} canSave canUpdate {...callbacks} />)
    expect(html).toContain('&lt;img src=x onerror=&quot;bad()&quot;&gt;')
    expect(html).not.toContain('<img')
    expect(html).toContain('aria-label="Vistas de este documento"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('value="original"')
  })
  it('keeps recall and deletion available at capacity while disabling new captures', () => {
    const views = Array.from({ length: MAX_NAMED_VIEWS }, (_, index) => saved('view-' + index, 'Vista ' + index))
    const html = renderToStaticMarkup(<NamedViewsDialog views={views} canSave={false} canUpdate {...callbacks} />)
    expect(html).toContain('<button type="button">Mostrar</button>')
    expect(html).toContain('<button type="button">Eliminar</button>')
    expect(html).toContain('>Actualizar vista</button>')
    expect(html).not.toContain('disabled="" title="Sustituir')
    expect(html).toContain('aria-label="Nombre de la vista seleccionada"')
    expect(html).toContain('value="Vista 0"')
    expect(html).toContain('<button type="submit" disabled="">Guardar vista actual</button>')
    expect(html).toContain('Se ha alcanzado el límite de 64 vistas.')
  })
  it('requires a selected entry and a current capture only for updating its pose', () => {
    const empty = renderToStaticMarkup(<NamedViewsDialog views={[]} canSave canUpdate {...callbacks} />)
    expect(empty).toContain('<button type="button" disabled="" title="Sustituir el encuadre seleccionado por el actual">Actualizar vista</button>')
    expect(empty).not.toContain('Nombre de la vista seleccionada')
    const withoutCamera = renderToStaticMarkup(<NamedViewsDialog views={[saved('one', 'Detalle')]} canSave={false} canUpdate={false} {...callbacks} />)
    expect(withoutCamera).toContain('<button type="button" disabled="" title="Sustituir el encuadre seleccionado por el actual">Actualizar vista</button>')
    expect(withoutCamera).toContain('aria-label="Nombre de la vista seleccionada"')
    expect(withoutCamera).toContain('value="Detalle"')
  })
  it('exposes the catalog command only with an owner and honors its separate availability', () => {
    const base = { onView: () => {}, canPrevious: false }
    expect(renderToStaticMarkup(<ViewOrientationControls {...base} />)).not.toContain('class="view-named"')
    const guarded = renderToStaticMarkup(<ViewOrientationControls {...base} onNamedViews={() => {}} canNamedViews={false} />)
    expect(guarded).toContain('title="Vistas guardadas…" disabled=""')
  })
})
