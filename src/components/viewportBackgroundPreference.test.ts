import { describe, expect, it } from 'vitest'
import { createViewportBackgroundPreference, validViewportBackground, VIEWPORT_BACKGROUND_KEY } from './viewportBackgroundPreference'

describe('viewport profile preference', () => {
  it('shares only a committed finite colour and survives a new profile reader', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, text: string) => { values.set(key, text) }, removeItem: (key: string) => { values.delete(key) } }
    const first = createViewportBackgroundPreference(storage), seen: unknown[] = []
    const unsubscribe = first.subscribe(() => seen.push(first.snapshot()))
    expect(first.snapshot()).toBeNull()
    expect(first.set('#1234aB')).toBe(true)
    expect(createViewportBackgroundPreference(storage).snapshot()).toBe('#1234aB')
    expect(seen).toEqual(['#1234aB'])
    first.set('#1234aB')
    expect(seen).toHaveLength(1)
    unsubscribe()
    first.set(null)
    expect(values.has(VIEWPORT_BACKGROUND_KEY)).toBe(false)
    expect(createViewportBackgroundPreference(storage).snapshot()).toBeNull()
    expect(seen).toHaveLength(1)
  })
  it.each(['red', '#fff', '#123456\n', '#123456\r', 'url(https://example.test)', '#12345600', {}, 123])('rejects malformed colour %j without changing storage', color => {
    const values: string[] = []
    const preference = createViewportBackgroundPreference({ getItem: () => null, setItem: (_, text) => { values.push(text) }, removeItem: () => {} })
    expect(validViewportBackground(color)).toBe(false)
    expect(() => preference.set(color as string)).toThrow()
    expect(preference.snapshot()).toBeNull()
    expect(values).toEqual([])
  })
  it.each(['not json', '{"version":2,"color":"#123456"}', '{"version":1,"color":"url(a)"}', '{"version":1,"color":"#123456","extra":true}', 'x'.repeat(81)])('keeps the original background for corrupt stored data %j', text => {
    expect(createViewportBackgroundPreference({ getItem: () => text, setItem: () => {}, removeItem: () => {} }).snapshot()).toBeNull()
  })
  it('retains usable session colour and reports persistence failure', () => {
    const preference = createViewportBackgroundPreference({ getItem: () => { throw Error('unavailable') },
      setItem: () => { throw Error('full') }, removeItem: () => { throw Error('unavailable') } })
    expect(preference.snapshot()).toBeNull()
    expect(preference.set('#123456')).toBe(false)
    expect(preference.snapshot()).toBe('#123456')
    expect(preference.set(null)).toBe(false)
    expect(preference.snapshot()).toBeNull()
  })
})
