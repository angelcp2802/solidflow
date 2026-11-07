import { describe, expect, it } from 'vitest'
import { MAX_NAMED_VIEWS, renameNamedView, updateNamedViewCamera, type NamedView } from './namedViews'

const camera = () => ({ position: [0, 0, 30] as [number, number, number], target: [0, 0, 0] as [number, number, number],
  up: [0, 1, 0] as [number, number, number], top: 10, bottom: -10, zoom: 1, near: 0.1, far: 100 })
const original = (): NamedView[] => [{ id: 'front', name: 'Frente', view: camera() },
  { id: 'detail', name: 'Detalle', view: { ...camera(), zoom: 2 } }]

describe('editing an existing document view', () => {
  it('renames only the selected entry, retaining identity, order and exact camera', () => {
    const views = original(), before = structuredClone(views), renamed = renameNamedView(views, 'detail', '  Taladro  ')
    expect(renamed).toEqual([before[0], { id: 'detail', name: 'Taladro', view: before[1].view }])
    expect(views).toEqual(before)
    renamed[0].view.position[0] = 80; renamed[1].view.target[0] = 90
    expect(views).toEqual(before)
  })
  it.each(['', '  ', 'a\nb', 'x'.repeat(81), 'frente', ' FRENTE '])('rejects invalid or colliding names atomically: %j', name => {
    const views = original(), before = structuredClone(views)
    expect(() => renameNamedView(views, 'detail', name)).toThrow()
    expect(views).toEqual(before)
  })
  it('allows a case-only rename of the same identity and an unchanged normalized name', () => {
    expect(renameNamedView(original(), 'detail', 'DETALLE')[1].name).toBe('DETALLE')
    expect(renameNamedView(original(), 'detail', ' Detalle ')).toEqual(original())
  })
  it('replaces only the selected camera and owns both old and captured arrays', () => {
    const views = original(), before = structuredClone(views), capture = { ...camera(), position: [30, 0, 0], zoom: 3 }
    const updated = updateNamedViewCamera(views, 'front', capture)
    expect(updated).toEqual([{ id: 'front', name: 'Frente', view: { ...camera(), position: [30, 0, 0], zoom: 3 } }, before[1]])
    capture.position[0] = 99; updated[0].view.target[0] = 12; updated[1].view.up[0] = 42
    expect(updated[0].view.position).toEqual([30, 0, 0]); expect(views).toEqual(before)
  })
  it.each([null, { ...camera(), zoom: 0 }, { ...camera(), position: [0, 0, 0] }, { ...camera(), up: [0, 0, 1] }])(
    'rejects an unavailable or invalid current camera before any mutation', capture => {
      const views = original(), before = structuredClone(views)
      expect(() => updateNamedViewCamera(views, 'front', capture)).toThrow()
      expect(views).toEqual(before)
    })
  it('rejects stale selection identities rather than appending or editing another entry', () => {
    const views = original(), before = structuredClone(views)
    expect(() => renameNamedView(views, 'gone', 'Otra')).toThrow(/ya no está disponible/)
    expect(() => updateNamedViewCamera(views, 'gone', camera())).toThrow(/ya no está disponible/)
    expect(views).toEqual(before)
  })
  it('permits editing at capacity without changing the catalog size', () => {
    const views = Array.from({ length: MAX_NAMED_VIEWS }, (_, i) => ({ id: String(i), name: 'Vista ' + i, view: camera() }))
    const renamed = renameNamedView(views, '63', 'Última'), updated = updateNamedViewCamera(renamed, '63', { ...camera(), zoom: 4 })
    expect(updated.length).toBe(64)
    expect(updated[63]).toEqual({ id: '63', name: 'Última', view: { ...camera(), zoom: 4 } })
    expect(updated.slice(0, 63)).toEqual(views.slice(0, 63))
    expect(views[63].name).toBe('Vista 63')
  })
})
