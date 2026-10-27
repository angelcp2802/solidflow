import { createContext } from 'react'

/** Stable focus return for commands launched from a temporary header menu. */
export const HeaderMenuActionFocus = createContext<(() => void) | null>(null)
