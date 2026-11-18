import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { assemblyMenuFocusIndex } from './AssemblyMenuBar'
import './part-feature-context-menu.css'

export interface CadContextAction {
  id: string
  label: string
  icon?: LucideIcon
  disabled?: boolean
  onSelect: () => void
}

export interface CadContextMenuProps {
  targetName: string
  /** Keep existing part selectors through the compatibility adapter. */
  namespace?: 'cad' | 'part'
  actions: readonly CadContextAction[]
  /** Client coordinates, also used for keyboard-opened tree menus. */
  point: { x: number; y: number }
  onClose: () => void
  /** The focusable row or viewport host that opened this menu. */
  restoreFocusElement?: HTMLElement | null
}

export function clampCadContextMenu(
  point: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const clamp = (value: number, extent: number, available: number) => {
    const margin = Math.min(8, Math.max(0, available / 2))
    return Math.max(margin, Math.min(Number.isFinite(value) ? value : margin, available - extent - margin))
  }
  return { x: clamp(point.x, size.width, viewport.width), y: clamp(point.y, size.height, viewport.height) }
}

/** Caller-owned commands only; mounting a menu never edits or selects its target. */
export default function CadContextMenu(props: CadContextMenuProps) {
  const { targetName, actions, point, namespace = 'cad' } = props
  const indexAttribute = `data-${namespace}-context-index`
  const headingId = useId(), root = useRef<HTMLDivElement>(null)
  const current = useRef(props); current.current = props
  const closed = useRef(false)
  const [position, setPosition] = useState(point)
  const close = (restore: boolean) => {
    if (closed.current) return
    closed.current = true
    const { onClose, restoreFocusElement } = current.current
    if (restore && restoreFocusElement?.isConnected) restoreFocusElement.focus({ preventScroll: true })
    onClose()
  }
  const focusItem = (index: number | null) => {
    if (index === null) root.current?.focus({ preventScroll: true })
    else root.current?.querySelector<HTMLButtonElement>(`[${indexAttribute}="${index}"]`)?.focus()
  }
  useLayoutEffect(() => {
    closed.current = false
    focusItem(assemblyMenuFocusIndex(current.current.actions, -1, 1))
  }, [point.x, point.y, targetName, namespace])
  useLayoutEffect(() => {
    const updatePosition = () => {
      if (!root.current) return
      const rect = root.current.getBoundingClientRect()
      const next = clampCadContextMenu(current.current.point, rect, { width: window.innerWidth, height: window.innerHeight })
      setPosition(previous => previous.x === next.x && previous.y === next.y ? previous : next)
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition)
    if (root.current) observer?.observe(root.current)
    return () => { window.removeEventListener('resize', updatePosition); observer?.disconnect() }
  }, [point.x, point.y])
  useLayoutEffect(() => {
    const active = document.activeElement
    // An asynchronous rebuild can disable the focused command while open.
    if (root.current?.contains(active) && active instanceof HTMLButtonElement && active.disabled)
      focusItem(assemblyMenuFocusIndex(actions, Number(active.getAttribute(indexAttribute) ?? -1), 1))
  }, [actions])
  useLayoutEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close(false)
    }
    const blur = () => close(false)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
      window.removeEventListener('blur', blur)
    }
  }, [])
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Menu keystrokes must not reach workspace tools (Escape, Delete or F).
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); close(true); return }
    if (event.key === 'Tab') { close(true); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const active = event.target instanceof HTMLElement ? Number(event.target.getAttribute(indexAttribute) ?? -1) : -1
    const backwards = event.key === 'ArrowUp' || event.key === 'End'
    const from = event.key === 'Home' ? -1 : event.key === 'End' ? 0 : active
    focusItem(assemblyMenuFocusIndex(current.current.actions, from, backwards ? -1 : 1))
  }
  const menu = <div ref={root} className={namespace === 'part' ? 'part-feature-context-menu' : 'cad-context-menu part-feature-context-menu'} role="menu" aria-labelledby={headingId}
    tabIndex={-1} style={{ left: position.x, top: position.y }} onKeyDown={keyDown}
    onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation() }}>
    <div id={headingId} className="part-feature-context-heading" title={targetName}>{targetName}</div>
    {actions.map((action, index) => {
      const Icon = action.icon
      return <button type="button" role="menuitem" tabIndex={-1} key={action.id}
        {...{ [`data-${namespace}-context-action`]: action.id, [indexAttribute]: index }}
        disabled={action.disabled} aria-disabled={action.disabled || undefined}
        onClick={() => {
          const matches = current.current.actions.filter(item => item.id === action.id)
          if (closed.current || matches.length !== 1 || matches[0].disabled) return
          close(true)
          matches[0].onSelect()
        }}>
        <span className="part-feature-context-icon" aria-hidden="true">{Icon && <Icon size={16} />}</span>
        <span>{action.label}</span>
      </button>
    })}
  </div>
  return typeof document === 'undefined' ? menu : createPortal(menu, document.body)
}
