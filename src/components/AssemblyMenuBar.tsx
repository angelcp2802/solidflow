import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

export interface AssemblyMenuAction {
  id: string
  label: string
  onSelect: () => void
  disabled?: boolean
  checked?: boolean
}
export interface AssemblyMenuDefinition {
  id: string
  label: string
  items: readonly AssemblyMenuAction[]
}

/** Roving focus skips unavailable commands without ever invoking them. */
export function assemblyMenuFocusIndex(items: readonly Pick<AssemblyMenuAction, 'disabled'>[], current: number, direction: 1 | -1): number | null {
  if (!items.length) return null
  const from = current < 0 ? direction === 1 ? -1 : 0 : current
  for (let offset = 1; offset <= items.length; offset++) {
    const index = ((from + direction * offset) % items.length + items.length) % items.length
    if (!items[index].disabled) return index
  }
  return null
}

/** Only caller-owned commands are rendered. Closed menus have no hidden items. */
export default function AssemblyMenuBar({ menus, label = 'Menú principal del ensamblaje' }: { menus: readonly AssemblyMenuDefinition[]; label?: string }) {
  const prefix = useId(), root = useRef<HTMLElement>(null), triggers = useRef(new Map<string, HTMLButtonElement>())
  const [open, setOpen] = useState<string | null>(null), openRef = useRef(open)
  const [focusRequest, setFocusRequest] = useState<{ id: string; index: number | null } | null>(null)
  const [tabStop, setTabStop] = useState(0), currentMenus = useRef(menus); currentMenus.current = menus
  const close = (restore = false) => {
    const previous = openRef.current; openRef.current = null; setOpen(null); setFocusRequest(null)
    if (restore && previous) triggers.current.get(previous)?.focus()
  }
  const focusItem = (id: string, index: number | null) => {
    setFocusRequest({ id, index })
  }
  // Focus the newly committed popup before another input can target the removed
  // menu. A fresh request also handles repeated Home/arrow keys in the same menu.
  useLayoutEffect(() => {
    if (!focusRequest || open !== focusRequest.id || openRef.current !== focusRequest.id) return
    const popup = root.current?.querySelector<HTMLElement>('[role="menu"]')
    if (focusRequest.index === null) popup?.focus()
    else popup?.querySelector<HTMLButtonElement>(`[data-menu-index="${focusRequest.index}"]`)?.focus()
  }, [open, focusRequest])
  const show = (index: number, last = false) => {
    const menu = currentMenus.current[index]; if (!menu) return
    openRef.current = menu.id; setOpen(menu.id); setTabStop(index)
    focusItem(menu.id, assemblyMenuFocusIndex(menu.items, last ? 0 : -1, last ? -1 : 1))
  }
  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    const blur = () => close()
    window.addEventListener('blur', blur)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside); window.removeEventListener('blur', blur) }
  }, [open])
  const moveMenu = (index: number, direction: 1 | -1, expand: boolean) => {
    const next = (index + direction + menus.length) % menus.length
    setTabStop(next)
    if (expand) show(next)
    else triggers.current.get(menus[next].id)?.focus()
  }
  const topKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(index, event.key === 'ArrowUp') }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); moveMenu(index, event.key === 'ArrowRight' ? 1 : -1, openRef.current !== null) }
    else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault(); const next = event.key === 'Home' ? 0 : menus.length - 1
      if (openRef.current) show(next); else { setTabStop(next); triggers.current.get(menus[next].id)?.focus() }
    } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
  }
  const popupKey = (event: KeyboardEvent<HTMLDivElement>, menu: AssemblyMenuDefinition, index: number) => {
    const active = event.target instanceof HTMLElement ? Number(event.target.dataset.menuIndex ?? -1) : -1
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
    else if (event.key === 'Tab') close(true)
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); moveMenu(index, event.key === 'ArrowRight' ? 1 : -1, true) }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const backwards = event.key === 'ArrowUp' || event.key === 'End', from = event.key === 'Home' ? -1 : event.key === 'End' ? 0 : active
      focusItem(menu.id, assemblyMenuFocusIndex(menu.items, from, backwards ? -1 : 1))
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      const candidates = menu.items.map((_, offset) => (active + offset + 1 + menu.items.length) % menu.items.length)
      const next = candidates.find(i => !menu.items[i].disabled && menu.items[i].label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))
      if (next !== undefined) { event.preventDefault(); focusItem(menu.id, next) }
    }
  }
  return <nav className="assembly-main-menus" ref={root} role="menubar" aria-label={label}>
    {menus.map((menu, index) => <div className="assembly-menu-wrap" role="none" key={menu.id}>
      <button type="button" role="menuitem" data-assembly-menu={menu.id} id={`${prefix}-${menu.id}-trigger`} aria-haspopup="menu" aria-expanded={open === menu.id}
        aria-controls={open === menu.id ? `${prefix}-${menu.id}-popup` : undefined} tabIndex={tabStop === index ? 0 : -1}
        ref={button => { if (button) triggers.current.set(menu.id, button); else triggers.current.delete(menu.id) }}
        onFocus={() => setTabStop(index)} onKeyDown={event => topKey(event, index)}
        onClick={() => { if (openRef.current === menu.id) close(true); else show(index) }}>{menu.label}</button>
      {open === menu.id && <div id={`${prefix}-${menu.id}-popup`} className="assembly-menu-popup" role="menu" aria-labelledby={`${prefix}-${menu.id}-trigger`} tabIndex={-1}
        onKeyDown={event => popupKey(event, menu, index)}>
        {menu.items.map((item, itemIndex) => <button type="button" key={item.id} data-menu-index={itemIndex} data-assembly-command={item.id} tabIndex={-1}
          role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={item.checked} disabled={item.disabled} aria-disabled={item.disabled || undefined}
          onClick={() => {
            const actual = currentMenus.current.find(value => value.id === menu.id)?.items.find(value => value.id === item.id)
            if (!actual || actual.disabled || openRef.current !== menu.id) return
            close(true); actual.onSelect()
          }}><span className="assembly-menu-check" aria-hidden="true">{item.checked ? '✓' : ''}</span><span>{item.label}</span></button>)}
      </div>}
    </div>)}
  </nav>
}
