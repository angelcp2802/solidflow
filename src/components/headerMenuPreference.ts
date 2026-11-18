/** Renderer-session preference only; it never belongs to a CAD document. */
export function createHeaderMenuPreference() {
  let pinned = true
  const listeners = new Set<() => void>()
  return {
    snapshot: () => pinned,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setPinned(value: boolean) {
      if (value === pinned) return
      pinned = value
      listeners.forEach(listener => listener())
    },
  }
}

// Parts and both assembly workspaces share the preference across their mounts.
export const headerMenuPreference = createHeaderMenuPreference()
