export interface AssemblyTreeNode { key: string; parentKey: string | null }

/** Presentation identities belong to occurrences, never to a reused definition alone. */
export function assemblyTreeModel(nodes: readonly AssemblyTreeNode[]) {
  const parents = new Map<string, string | null>()
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (parents.has(node.key)) throw new Error('Duplicate assembly tree occurrence key')
    // A pruned or unavailable parent leaves an independently reachable root.
    const parent = node.parentKey !== null && parents.has(node.parentKey) ? node.parentKey : null
    parents.set(node.key, parent)
    children.set(node.key, [])
    if (parent !== null) children.get(parent)!.push(node.key)
  }
  const keys = [...parents.keys()]
  function ancestors(key: string) {
    const result: string[] = []
    let parent = parents.get(key)
    while (parent !== null && parent !== undefined) { result.push(parent); parent = parents.get(parent) }
    return result
  }
  const canExpand = (key: string) => (children.get(key)?.length ?? 0) > 0
  const visible = (key: string, expanded: ReadonlySet<string>) => parents.has(key) && ancestors(key).every(parent => expanded.has(parent))
  return { keys, parents, children, ancestors, canExpand, visible }
}
export type AssemblyTreeModel = ReturnType<typeof assemblyTreeModel>
export interface AssemblyTreeNavigationState {
  expanded: ReadonlySet<string>
  focusKey: string | null
  selectedKey: string | null
  active: boolean
  resetKey: unknown
}
export interface AssemblyTreeNavigationContext { selectedKey: string | null; active: boolean; resetKey: unknown }

export function reconcileAssemblyTreeNavigation(previous: AssemblyTreeNavigationState | null, model: AssemblyTreeModel,
  context: AssemblyTreeNavigationContext): AssemblyTreeNavigationState {
  const reset = !previous || !Object.is(previous.resetKey, context.resetKey)
  const selectedKey = context.selectedKey !== null && model.parents.has(context.selectedKey) ? context.selectedKey : null
  const expanded = new Set(reset ? [] : [...previous.expanded].filter(key => model.canExpand(key)))
  const reveal = context.active && (reset || !previous.active || selectedKey !== previous.selectedKey)
  if (reveal && selectedKey !== null) model.ancestors(selectedKey).forEach(key => expanded.add(key))
  let focusKey = reveal && selectedKey !== null ? selectedKey : reset ? null : previous.focusKey
  if (focusKey === null || !model.visible(focusKey, expanded)) {
    focusKey = (focusKey !== null ? model.ancestors(focusKey).find(key => model.visible(key, expanded)) : null)
      ?? model.keys.find(key => model.visible(key, expanded)) ?? null
  }
  if (previous && !reset && previous.focusKey === focusKey && previous.selectedKey === selectedKey && previous.active === context.active
    && previous.expanded.size === expanded.size && [...expanded].every(key => previous.expanded.has(key))) return previous
  return { expanded, focusKey, selectedKey, active: context.active, resetKey: context.resetKey }
}

export function toggleAssemblyTreeBranch(model: AssemblyTreeModel, state: AssemblyTreeNavigationState, key: string): AssemblyTreeNavigationState {
  if (!model.canExpand(key) || !model.visible(key, state.expanded)) return state
  const expanded = new Set(state.expanded)
  if (expanded.has(key)) expanded.delete(key)
  else expanded.add(key)
  const focusKey = state.focusKey !== null && !model.visible(state.focusKey, expanded) ? key : state.focusKey
  return { ...state, expanded, focusKey }
}

/** Only presentation state changes; activation stays with the native row button. */
export function navigateAssemblyTree(model: AssemblyTreeModel, state: AssemblyTreeNavigationState, key: string, command: string) {
  if (!model.visible(key, state.expanded)) return null
  const visible = model.keys.filter(value => model.visible(value, state.expanded)), index = visible.indexOf(key)
  let focusKey = key, next = state
  switch (command) {
    case 'ArrowDown': focusKey = visible[Math.min(index + 1, visible.length - 1)]; break
    case 'ArrowUp': focusKey = visible[Math.max(index - 1, 0)]; break
    case 'Home': focusKey = visible[0]; break
    case 'End': focusKey = visible[visible.length - 1]; break
    case 'ArrowRight':
      if (model.canExpand(key)) {
        if (!state.expanded.has(key)) next = toggleAssemblyTreeBranch(model, state, key)
        else focusKey = model.children.get(key)![0]
      }
      break
    case 'ArrowLeft':
      if (model.canExpand(key) && state.expanded.has(key)) next = toggleAssemblyTreeBranch(model, state, key)
      else focusKey = model.parents.get(key) ?? key
      break
    default: return null
  }
  return { ...next, focusKey }
}
