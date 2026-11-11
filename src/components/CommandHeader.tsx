import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronRight, Pin, PinOff } from 'lucide-react'
import { headerMenuPreference } from './headerMenuPreference'
import { HeaderMenuActionFocus } from './headerMenuActionFocus'
import './command-header.css'

interface CommandHeaderProps {
  className?: string
  brand?: ReactNode
  menus?: ReactNode
  quickActions?: ReactNode
  document?: ReactNode
  utilities?: ReactNode
}

/** Shared chrome only: callers retain their commands, disabled states and guards. */
export default function CommandHeader({ className = '', brand, menus, quickActions, document, utilities }: CommandHeaderProps) {
  const pinned = useSyncExternalStore(headerMenuPreference.subscribe, headerMenuPreference.snapshot, headerMenuPreference.snapshot)
  const [expanded, setExpanded] = useState(false), [focusMenu, setFocusMenu] = useState(false)
  const menuId = useId(), menuRoot = useRef<HTMLDivElement>(null), reveal = useRef<HTMLButtonElement>(null)
  const hasMenus = menus != null, visible = hasMenus && (pinned || expanded), transient = visible && !pinned
  const collapse = useCallback((restoreFocus = false) => {
    setExpanded(false); setFocusMenu(false)
    if (restoreFocus) reveal.current?.focus()
  }, [])
  const prepareActionFocus = useCallback(() => collapse(true), [collapse])
  useLayoutEffect(() => {
    if (!focusMenu || !visible) return
    menuRoot.current?.querySelector<HTMLButtonElement>('[role="menubar"] button[role="menuitem"]')?.focus()
    setFocusMenu(false)
  }, [focusMenu, visible])
  useEffect(() => {
    if (!transient) return
    const outside = (event: Event) => {
      if (event.target instanceof Node && !menuRoot.current?.contains(event.target) && !reveal.current?.contains(event.target)) {
        collapse()
      }
    }
    const blur = () => collapse()
    globalThis.document.addEventListener('pointerdown', outside, true)
    globalThis.document.addEventListener('focusin', outside)
    window.addEventListener('blur', blur)
    return () => {
      globalThis.document.removeEventListener('pointerdown', outside, true)
      globalThis.document.removeEventListener('focusin', outside)
      window.removeEventListener('blur', blur)
    }
  }, [transient, collapse])
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    // The existing menubar consumes Escape while its popup is open. A second
    // Escape closes only this temporary disclosure, retaining outside focus.
    if (event.key === 'Escape' && transient && !menuRoot.current?.querySelector('[role="menu"]')) {
      event.preventDefault(); event.stopPropagation(); collapse(true)
    }
  }
  const togglePin = () => {
    if (pinned) { setExpanded(true); headerMenuPreference.setPinned(false) }
    else { headerMenuPreference.setPinned(true); setExpanded(false) }
  }
  return <header className={`command-header${className ? ` ${className}` : ''}`}
    data-menu-pinned={hasMenus ? pinned : undefined} data-menu-expanded={hasMenus ? visible : undefined} onKeyDownCapture={keyDown}>
    {(brand != null || hasMenus) && <div className="command-header-brand">{brand}
      {hasMenus && !pinned && <button type="button" className="command-header-reveal" ref={reveal}
        aria-label="Mostrar barra de menús" title="Mostrar barra de menús" aria-expanded={visible} aria-controls={menuId}
        onClick={() => { setFocusMenu(false); setExpanded(value => !value) }}
        onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setExpanded(true); setFocusMenu(true) } }}>
        <ChevronRight size={14} aria-hidden="true" />
      </button>}
    </div>}
    {(hasMenus || quickActions != null) && <div className="command-header-actions">
      {hasMenus && <div id={menuId} className="command-header-menus" ref={menuRoot} hidden={!visible}>
        {visible && <>
          <HeaderMenuActionFocus.Provider value={transient ? prepareActionFocus : null}>{menus}</HeaderMenuActionFocus.Provider>
          <button type="button" className="command-header-menu-pin" data-header-menu-pin="true"
            aria-label="Fijar barra de menús" aria-pressed={pinned} title={pinned ? 'Desfijar barra de menús' : 'Fijar barra de menús'} onClick={togglePin}>
            {pinned ? <Pin size={14} aria-hidden="true" /> : <PinOff size={14} aria-hidden="true" />}
          </button>
        </>}
      </div>}
      {quickActions != null && <div className="command-header-quick-actions" inert={transient} aria-hidden={transient || undefined}>{quickActions}</div>}
    </div>}
    {document != null && <div className="command-header-document">{document}</div>}
    {utilities != null && <div className="command-header-utilities">{utilities}</div>}
  </header>
}
