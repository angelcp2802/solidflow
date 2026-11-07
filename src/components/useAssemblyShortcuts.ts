import { useEffect, useLayoutEffect, useRef } from 'react'
import { standardViews, type ViewName } from './viewNavigation'
import type { AssemblyMenuAction, AssemblyMenuDefinition } from './AssemblyMenuBar'

export type AssemblyShortcutCommand = 'new' | 'open' | 'save' | 'save-as' | 'undo' | 'redo' | `view-${ViewName}` | 'escape'
type Key = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'defaultPrevented' | 'repeat'>
type Command = Pick<AssemblyMenuAction, 'disabled' | 'onSelect'>
const shortcuts: readonly { id: AssemblyShortcutCommand; key: string; modified: boolean; shift: boolean; label: string }[] = [
  { id: 'new', key: 'n', modified: true, shift: false, label: 'Ctrl+N' },
  { id: 'open', key: 'o', modified: true, shift: false, label: 'Ctrl+O' },
  { id: 'save', key: 's', modified: true, shift: false, label: 'Ctrl+S' },
  { id: 'save-as', key: 's', modified: true, shift: true, label: 'Ctrl+Shift+S' },
  { id: 'undo', key: 'z', modified: true, shift: false, label: 'Ctrl+Z' },
  { id: 'redo', key: 'y', modified: true, shift: false, label: 'Ctrl+Y' },
  ...standardViews.filter(view => view.shortcut).map(view => ({ id: `view-${view.name}` as const, key: view.shortcut.slice(-1), modified: true, shift: false, label: view.shortcut })),
  { id: 'view-normal', key: '8', modified: true, shift: false, label: 'Ctrl+8' },
  { id: 'view-previous', key: 'z', modified: true, shift: true, label: 'Ctrl+Shift+Z' },
  { id: 'view-fit', key: 'f', modified: false, shift: false, label: 'F' },
]

/** Annotate existing commands only, using the very same mapping as dispatch. */
export function withAssemblyShortcutLabels(menus: readonly AssemblyMenuDefinition[]): AssemblyMenuDefinition[] {
  return menus.map(menu => ({ ...menu, items: menu.items.map(item => {
    const shortcut = shortcuts.find(value => value.id === item.id)
    return shortcut ? { ...item, shortcut: shortcut.label } : item
  }) }))
}

/** Only existing assembly commands; native text undo and editing keys stay local. */
export function assemblyShortcutCommand(event: Key, editable: boolean): AssemblyShortcutCommand | null {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey && event.metaKey) return null
  const key = event.key.toLowerCase(), modified = event.ctrlKey || event.metaKey
  if (!modified && !event.shiftKey && key === 'escape') return editable ? null : 'escape'
  const shortcut = shortcuts.find(value => value.key === key && value.modified === modified && value.shift === event.shiftKey)
  if (!shortcut || editable && !['new', 'open', 'save', 'save-as'].includes(shortcut.id)) return null
  return shortcut.id
}

/** Re-read authority after a synchronous field commit; never queue or replay commands. */
export function dispatchAssemblyShortcut(event: Key & { preventDefault: () => void }, options: {
  active?: boolean
  editable: boolean
  owned: boolean
  command: (id: AssemblyShortcutCommand) => Command | undefined
  beforeFile?: (id: 'new' | 'open' | 'save' | 'save-as') => boolean
}): 'ignored' | 'blocked' | 'executed' {
  if (options.active === false) return 'ignored'
  const id = assemblyShortcutCommand(event, options.editable)
  if (!id) return 'ignored'
  if (options.owned) {
    // Dialog/menu Escape is handled by its owner, even if this listener runs first.
    if (id !== 'escape') event.preventDefault()
    return 'blocked'
  }
  const command = options.command(id)
  if (!command) return 'ignored'
  event.preventDefault()
  if (event.repeat || command.disabled) return 'blocked'
  if ((id === 'new' || id === 'open' || id === 'save' || id === 'save-as') && options.beforeFile && !options.beforeFile(id)) return 'blocked'
  const current = options.command(id)
  if (!current || current.disabled) return 'blocked'
  current.onSelect()
  return 'executed'
}

export function useAssemblyShortcuts(options: {
  root: string
  active?: boolean
  menus: readonly AssemblyMenuDefinition[]
  modal: boolean
  escape: Command
  beforeFile?: (id: 'new' | 'open' | 'save' | 'save-as', target: HTMLElement | null) => boolean
}) {
  const current = useRef(options)
  useLayoutEffect(() => { current.current = options })
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const state = current.current
      if (state.active === false) return
      const root = document.querySelector(state.root)
      const target = event.target instanceof HTMLElement ? event.target : null
      if (!root || target && target !== document.body && !root.contains(target)) return
      const editable = !!target && (target.isContentEditable || !!target.closest('input,textarea,select'))
      const owned = state.modal || !!document.querySelector('[role="dialog"][aria-modal="true"]') || !!root.querySelector('[role="menu"]')
      dispatchAssemblyShortcut(event, {
        editable, owned, active: current.current.active,
        command: id => current.current.active === false ? undefined : id === 'escape' ? current.current.escape : current.current.menus.flatMap(menu => menu.items).find(item => item.id === id),
        beforeFile: id => current.current.beforeFile?.(id, target) ?? true,
      })
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [])
}
