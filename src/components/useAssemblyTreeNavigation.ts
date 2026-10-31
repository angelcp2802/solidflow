import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { assemblyTreeModel, navigateAssemblyTree, reconcileAssemblyTreeNavigation, toggleAssemblyTreeBranch,
  type AssemblyTreeNode, type AssemblyTreeNavigationContext } from './assemblyTreeNavigation'

export interface UseAssemblyTreeNavigationOptions extends AssemblyTreeNavigationContext {
  nodes: readonly AssemblyTreeNode[]
  disabled: boolean
}

export function useAssemblyTreeNavigation({ nodes, selectedKey, resetKey, active, disabled }: UseAssemblyTreeNavigationOptions) {
  const model = assemblyTreeModel(nodes)
  const context = { selectedKey, resetKey, active }
  const [stored, setState] = useState(() => reconcileAssemblyTreeNavigation(null, model, context))
  const state = reconcileAssemblyTreeNavigation(stored, model, context)
  const elements = useRef(new Map<string, HTMLElement>())
  const pendingFocus = useRef<string | null>(null)
  // Reconcile during render so no commit exposes an invalid or hidden tab stop.
  if (state !== stored) {
    const focused = typeof document === 'undefined' ? undefined
      : [...elements.current].find(([, element]) => element === document.activeElement)?.[0]
    if (active && focused !== undefined && !model.visible(focused, state.expanded)) pendingFocus.current = state.focusKey
    setState(state)
  }
  useLayoutEffect(() => {
    const key = pendingFocus.current
    pendingFocus.current = null
    if (key !== null && active && !disabled && model.visible(key, state.expanded)) elements.current.get(key)?.focus()
  })
  function toggle(key: string) {
    if (disabled || !active) return
    const next = toggleAssemblyTreeBranch(model, state, key)
    if (next === state) return
    // A pointer press focuses the sibling disclosure before its click handler.
    // Return to the owning row so the following arrow key navigates this tree.
    pendingFocus.current = key
    setState({ ...next, focusKey: key })
  }
  function onKeyDown(event: KeyboardEvent<HTMLElement>, key: string) {
    if (disabled || !active || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    const next = navigateAssemblyTree(model, state, key, event.key)
    if (!next) return
    event.preventDefault()
    event.stopPropagation()
    pendingFocus.current = next.focusKey
    setState(next)
  }
  return {
    isVisible: (key: string) => model.visible(key, state.expanded),
    isExpanded: (key: string) => model.canExpand(key) && state.expanded.has(key),
    canExpand: model.canExpand,
    toggle,
    rowTabIndex: (key: string) => active && !disabled && key === state.focusKey && model.visible(key, state.expanded) ? 0 : -1,
    onFocus: (key: string) => {
      if (active && !disabled && model.visible(key, state.expanded) && key !== state.focusKey) setState({ ...state, focusKey: key })
    },
    onKeyDown,
    register: (key: string, element: HTMLElement | null) => {
      if (element) elements.current.set(key, element)
      else elements.current.delete(key)
    },
  }
}
