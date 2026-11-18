/** Profile preference; never enters a CAD document or its undo history. */
export const VIEWPORT_BACKGROUND_KEY = 'solidflow.viewport-background.v1'
export type ViewportBackground = string | null
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>

export function validViewportBackground(value: unknown): value is ViewportBackground {
  return value === null || typeof value === 'string' && value.length === 7 && /^#[\da-fA-F]{6}$/.test(value)
}

export function createViewportBackgroundPreference(storage?: Storage) {
  let value: ViewportBackground = null
  try {
    const text = storage?.getItem(VIEWPORT_BACKGROUND_KEY)
    if (text && text.length <= 80) {
      const saved = JSON.parse(text)
      if (saved && typeof saved === 'object' && !Array.isArray(saved)
        && Object.keys(saved).length === 2 && saved.version === 1 && validViewportBackground(saved.color)) value = saved.color
    }
  } catch { /* An unavailable or invalid preference keeps the original background. */ }
  const listeners = new Set<() => void>()
  return {
    snapshot: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next: ViewportBackground): boolean {
      if (!validViewportBackground(next)) throw Error('Elige un color hexadecimal de seis cifras.')
      let persisted = false
      try {
        if (storage) {
          if (next === null) storage.removeItem(VIEWPORT_BACKGROUND_KEY)
          else storage.setItem(VIEWPORT_BACKGROUND_KEY, JSON.stringify({ version: 1, color: next }))
          persisted = true
        }
      } catch { /* Keep the usable session preference and report the persistence limit. */ }
      if (value !== next) { value = next; listeners.forEach(listener => listener()) }
      return persisted
    },
  }
}

function profileStorage(): Storage | undefined {
  try { return globalThis.localStorage } catch { return undefined }
}
export const viewportBackgroundPreference = createViewportBackgroundPreference(profileStorage())
