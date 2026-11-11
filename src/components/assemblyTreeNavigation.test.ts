import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { assemblyTreeModel, navigateAssemblyTree, reconcileAssemblyTreeNavigation, toggleAssemblyTreeBranch,
  type AssemblyTreeNavigationState } from './assemblyTreeNavigation'
import { useAssemblyTreeNavigation } from './useAssemblyTreeNavigation'

// Original presentation-only occurrences: the same definition has two owners.
const nodes = [
  { key: 'left@group:r1', parentKey: null },
  { key: 'left/part@part:r1', parentKey: 'left@group:r1' },
  { key: 'left/nested@group:r1', parentKey: 'left@group:r1' },
  { key: 'left/nested/part@part:r1', parentKey: 'left/nested@group:r1' },
  { key: 'right@group:r1', parentKey: null },
  { key: 'right/part@part:r1', parentKey: 'right@group:r1' },
]
const [left, leftPart, nested, deepPart, right, rightPart] = nodes.map(node => node.key)
const model = assemblyTreeModel(nodes)
const context = { selectedKey: null as string | null, active: true, resetKey: 'document-one' }
const initial = () => reconcileAssemblyTreeNavigation(null, model, context)
const visible = (state: AssemblyTreeNavigationState) => model.keys.filter(key => model.visible(key, state.expanded))
const press = (state: AssemblyTreeNavigationState, key: string, command: string) => navigateAssemblyTree(model, state, key, command)!

describe('assembly occurrence tree presentation', () => {
  it('starts with only roots visible and one initial focus target', () => {
    const state = initial()
    expect(visible(state)).toEqual([left, right])
    expect(state.expanded.size).toBe(0)
    expect(state.focusKey).toBe(left)
    expect(model.canExpand(leftPart)).toBe(false)
  })
  it('keeps reused definitions independently expandable by full occurrence identity', () => {
    const state = toggleAssemblyTreeBranch(model, initial(), left)
    expect(visible(state)).toEqual([left, leftPart, nested, right])
    expect(model.visible(rightPart, state.expanded)).toBe(false)
    expect(state.selectedKey).toBeNull()
  })
  it('Right opens then enters; Left returns to the parent then closes', () => {
    let state = press(initial(), left, 'ArrowRight')
    expect(state.focusKey).toBe(left)
    expect(state.expanded.has(left)).toBe(true)
    state = press(state, left, 'ArrowRight')
    expect(state.focusKey).toBe(leftPart)
    state = press(state, leftPart, 'ArrowLeft')
    expect(state.focusKey).toBe(left)
    state = press(state, left, 'ArrowLeft')
    expect(visible(state)).toEqual([left, right])
    expect(state.selectedKey).toBeNull()
  })
  it('Up/Down/Home/End only traverse visible rows and clamp boundaries', () => {
    const state = initial()
    expect(press(state, left, 'ArrowUp').focusKey).toBe(left)
    expect(press(state, left, 'ArrowDown').focusKey).toBe(right)
    expect(press(state, right, 'ArrowDown').focusKey).toBe(right)
    expect(press(state, right, 'Home').focusKey).toBe(left)
    expect(press(state, left, 'End').focusKey).toBe(right)
    expect(navigateAssemblyTree(model, state, leftPart, 'ArrowDown')).toBeNull()
  })
  it('leaves Enter, Space, Escape and Tab to the caller/native button', () => {
    for (const key of ['Enter', ' ', 'Escape', 'Tab']) expect(navigateAssemblyTree(model, initial(), left, key)).toBeNull()
  })
  it('reveals externally selected ancestors without selecting on navigation or collapse', () => {
    let state = reconcileAssemblyTreeNavigation(initial(), model, { ...context, selectedKey: deepPart })
    expect([...state.expanded]).toEqual([nested, left])
    expect(state.focusKey).toBe(deepPart)
    state = toggleAssemblyTreeBranch(model, state, left)
    expect(state.focusKey).toBe(left)
    expect(state.selectedKey).toBe(deepPart)
    expect(model.visible(deepPart, state.expanded)).toBe(false)
    expect(reconcileAssemblyTreeNavigation(state, model, { ...context, selectedKey: deepPart })).toBe(state)
    state = toggleAssemblyTreeBranch(model, state, left)
    expect(model.visible(deepPart, state.expanded)).toBe(true)
  })
  it('does not open an off-screen tree until it becomes active', () => {
    const inactive = reconcileAssemblyTreeNavigation(initial(), model, { ...context, selectedKey: deepPart, active: false })
    expect(visible(inactive)).toEqual([left, right])
    const active = reconcileAssemblyTreeNavigation(inactive, model, { ...context, selectedKey: deepPart })
    expect(model.visible(deepPart, active.expanded)).toBe(true)
    expect(active.focusKey).toBe(deepPart)
  })
  it('prunes removed occurrences and revisions without transferring expansion to a reused definition', () => {
    const expanded = reconcileAssemblyTreeNavigation(initial(), model, { ...context, selectedKey: deepPart })
    const replacedModel = assemblyTreeModel([{ key: 'left@group:r2', parentKey: null }, { key: right, parentKey: null }])
    const replaced = reconcileAssemblyTreeNavigation(expanded, replacedModel, { ...context, selectedKey: deepPart })
    expect([...replaced.expanded]).toEqual([])
    expect(replaced.selectedKey).toBeNull()
    expect(replaced.focusKey).toBe('left@group:r2')
  })
  it('clears expansion on document replacement even when occurrence keys are reused', () => {
    const opened = toggleAssemblyTreeBranch(model, initial(), left)
    const reset = reconcileAssemblyTreeNavigation(opened, model, { ...context, resetKey: 'document-two' })
    expect(visible(reset)).toEqual([left, right])
    expect(reset.focusKey).toBe(left)
  })
  it('reveals a selected occurrence when its previously unavailable node arrives', () => {
    const empty = reconcileAssemblyTreeNavigation(null, assemblyTreeModel([]), { ...context, selectedKey: deepPart })
    expect(empty.focusKey).toBeNull()
    const loaded = reconcileAssemblyTreeNavigation(empty, model, { ...context, selectedKey: deepPart })
    expect(model.visible(deepPart, loaded.expanded)).toBe(true)
  })
  it('keeps remaining orphan roots reachable and rejects ambiguous duplicate identities', () => {
    const pruned = assemblyTreeModel([{ key: leftPart, parentKey: left }])
    expect(pruned.visible(leftPart, new Set())).toBe(true)
    expect(() => assemblyTreeModel([nodes[0], nodes[0]])).toThrow('Duplicate assembly tree occurrence key')
  })
})

function Tree({ disabled = false, active = true, selectedKey = null }: { disabled?: boolean; active?: boolean; selectedKey?: string | null }) {
  const tree = useAssemblyTreeNavigation({ nodes, ...context, selectedKey, disabled, active })
  return createElement('div', null, ...nodes.map(node => createElement('button', {
    key: node.key, hidden: !tree.isVisible(node.key), tabIndex: tree.rowTabIndex(node.key),
    'aria-expanded': tree.canExpand(node.key) ? tree.isExpanded(node.key) : undefined,
  }, node.key)))
}
it('SSR keeps every row mounted, one visible tab stop, and none when inactive or disabled', () => {
  const html = renderToStaticMarkup(createElement(Tree))
  expect(html.match(/<button/g)).toHaveLength(6)
  expect(html.match(/hidden=""/g)).toHaveLength(4)
  expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(3)
  for (const props of [{ disabled: true }, { active: false }]) expect(renderToStaticMarkup(createElement(Tree, props))).not.toContain('tabindex="0"')
  const selected = renderToStaticMarkup(createElement(Tree, { selectedKey: deepPart }))
  expect(selected).toContain(`tabindex="0">${deepPart}</button>`)
  expect(selected.match(/hidden=""/g)).toHaveLength(1)
})
