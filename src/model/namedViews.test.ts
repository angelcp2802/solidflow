import { describe, expect, it } from 'vitest'
import { MAX_NAMED_VIEWS, MAX_SAVED_VIEW_COORDINATE, namedViewNameKey, normalizeNamedViewName, validateNamedViews, validateSavedCameraView, type NamedView, type SavedCameraView } from './namedViews'

// Original camera declarations, independent of a model or renderer capture.
function view(): SavedCameraView {
  return { position: [12, -8, 40], target: [12, -8, 0], up: [.6, .8, 0], top: 14, bottom: -6, zoom: 2, near: 1, far: 201 }
}
function entry(id = 'original-view', name = 'Vista oblicua'): NamedView { return { id, name, view: view() } }

describe('bounded document view declarations', () => {
  it('preserves every pose/frustum scalar and returns independently owned vectors', () => {
    const original = entry(), copy = validateNamedViews([original])
    expect(copy).toEqual([original])
    copy[0].view.position[0] = 99; copy[0].view.target[1] = 99; copy[0].view.up[0] = 1; copy[0].name = 'Changed'
    expect(original).toEqual(entry())
    expect(validateNamedViews(Object.freeze([Object.freeze(original)]))).toEqual([entry()])
  })

  it('normalizes creation names while enforcing canonical import and deterministic case collisions', () => {
    expect(normalizeNamedViewName('  Cafe\u0301  ')).toBe('Café')
    expect(namedViewNameKey('CAFÉ')).toBe('café')
    expect(() => validateNamedViews([entry('a', 'Café'), entry('b', 'CAFÉ')])).toThrow(/duplicado/)
    expect(() => validateNamedViews([entry('a'), entry('a', 'Another')])).toThrow(/duplicado/)
    expect(validateNamedViews([entry('a', 'I'), entry('b', 'ı')])).toHaveLength(2)
  })

  it.each(['', ' ', 'a'.repeat(81), ' padded', 'padded ', 'Cafe\u0301', 'line\nbreak', 'nul\u0000inside'])('rejects invalid persisted name %j', name => {
    expect(() => validateNamedViews([entry('id', name)])).toThrow()
  })
  it.each(['', ' ', ' padded', 'a'.repeat(129), 'id\u0000', 'id\u0085'])('rejects invalid id %j', id => {
    expect(() => validateNamedViews([entry(id)])).toThrow()
  })
  it('accepts boundary lengths and 64 independent entries, rejects the 65th', () => {
    expect(validateNamedViews([entry('a'.repeat(128), 'n'.repeat(80))])).toHaveLength(1)
    const entries = Array.from({ length: MAX_NAMED_VIEWS }, (_, index) => entry(`view-${index}`, `View ${index}`))
    expect(validateNamedViews(entries)).toEqual(entries)
    expect(() => validateNamedViews([...entries, entry('extra', 'Extra')])).toThrow()
    expect(validateNamedViews([])).toEqual([])
    expect(() => validateNamedViews(undefined)).toThrow()
  })

  it.each([
    { position: [NaN, 0, 40] }, { target: [Infinity, 0, 0] }, { position: [MAX_SAVED_VIEW_COORDINATE + 1, 0, 40] },
    { position: [12, -8, 0] }, { up: [0, 0, 0] }, { up: [0, 0, 1] }, { up: [0, 0, -1] }, { up: [0, 2, 0] },
    { up: [1e-200, 0, 1] }, { position: [0, 1e-200, 0], target: [0, 0, 0], up: [1, 0, 0] },
    { zoom: 0 }, { zoom: -1 }, { zoom: Infinity }, { zoom: 1e100 }, { zoom: 1e-100 },
    { zoom: Number.MIN_VALUE }, { top: -6 }, { top: -7 }, { top: Infinity },
    { near: 0 }, { near: -1 }, { near: 201 }, { far: 1 }, { far: Infinity },
    { far: MAX_SAVED_VIEW_COORDINATE + 1 }, { near: Number.MIN_VALUE, far: Number.MIN_VALUE * 2 },
    // Large asymmetric center plus tiny visible height collapses cy +/- h/2.
    { top: 1e9, bottom: 1e9 - 2, zoom: 1e20 },
  ])('rejects nonrepresentable or degenerate camera %j', patch => {
    expect(() => validateSavedCameraView({ ...view(), ...patch })).toThrow()
  })
  it('retains valid high zoom at a translated world origin without normalization', () => {
    const captured = { ...view(), position: [1e6, 1e6, 1e6 + 40], target: [1e6, 1e6, 1e6], top: 60, bottom: -60, zoom: 100000 }
    expect(validateSavedCameraView(captured)).toEqual(captured)
    expect(validateSavedCameraView({ ...view(), zoom: 1e12, top: 60, bottom: -60 }).zoom).toBe(1e12)
  })

  it.each(['getter', 'vector-getter', 'entry-getter', 'symbol', 'hidden', 'unknown', 'sparse', 'extra-index', 'prototype', 'array-prototype'] as const)('rejects non-JSON declaration %s without invoking getters', kind => {
    const candidate = entry(), entries = [candidate]; let reads = 0
    if (kind === 'getter') Object.defineProperty(candidate.view, 'top', { enumerable: true, get() { reads++; return 14 } })
    if (kind === 'vector-getter') Object.defineProperty(candidate.view.position, '0', { enumerable: true, get() { reads++; return 12 } })
    if (kind === 'entry-getter') Object.defineProperty(entries, '0', { enumerable: true, get() { reads++; return candidate } })
    if (kind === 'symbol') Object.defineProperty(candidate.view, Symbol('extra'), { value: 1, enumerable: true })
    if (kind === 'hidden') Object.defineProperty(candidate.view, 'top', { value: 14, enumerable: false })
    if (kind === 'unknown') Object.assign(candidate, { authority: true })
    if (kind === 'sparse') Reflect.deleteProperty(candidate.view.position, '1')
    if (kind === 'extra-index') Object.assign(candidate.view.position, { extra: true })
    if (kind === 'prototype') Object.setPrototypeOf(candidate, { inherited: true })
    if (kind === 'array-prototype') Object.setPrototypeOf(entries, null)
    expect(() => validateNamedViews(entries)).toThrow(); expect(reads).toBe(0)
  })
})
