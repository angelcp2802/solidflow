import { describe, expect, it, vi } from 'vitest'
import { assemblyShortcutCommand, dispatchAssemblyShortcut, withAssemblyShortcutLabels } from './useAssemblyShortcuts'

const key = (value: string, changes: Partial<KeyboardEvent> = {}) => ({ key: value, ctrlKey: false, metaKey: false,
  shiftKey: false, altKey: false, repeat: false, defaultPrevented: false, isComposing: false, preventDefault: vi.fn(), ...changes })

describe('assembly keyboard command ownership', () => {
  it('every displayed hint dispatches its existing command without changing actions, guards or menu membership', () => {
    const ids = ['new', 'open', 'save', 'save-as', 'undo', 'redo', 'view-front', 'view-back', 'view-left', 'view-right', 'view-top', 'view-bottom', 'view-iso', 'view-normal', 'view-fit', 'view-previous']
    const items = ids.map(id => ({ id, label: id, disabled: true, checked: true, onSelect: vi.fn() }))
    const help = { id: 'help', label: 'Help', onSelect: vi.fn() }
    const menus = [{ id: 'fixture', label: 'Original commands', items: [...items, help] }]
    const annotated = withAssemblyShortcutLabels(menus)
    expect(annotated[0].items.map(item => item.id)).toEqual([...ids, 'help'])
    for (const [index, item] of annotated[0].items.slice(0, -1).entries()) {
      const parts = item.shortcut!.split('+')
      expect(assemblyShortcutCommand(key(parts.at(-1)!, { ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Shift') }), false)).toBe(item.id)
      expect(item.onSelect).toBe(items[index].onSelect)
      expect(item.disabled).toBe(true); expect(item.checked).toBe(true)
      expect(items[index]).not.toHaveProperty('shortcut')
    }
    expect(annotated[0].items.at(-1)).toBe(help)
    expect(withAssemblyShortcutLabels([{ ...menus[0], items: [items[1]] }])[0].items).toHaveLength(1)
    expect(annotated.flatMap(menu => menu.items).some(item => item.shortcut === 'Ctrl+Shift+Z')).toBe(true)
  })
  it.each([
    ['o', false, 'open'], ['s', false, 'save'], ['s', true, 'save-as'], ['n', false, 'new'],
    ['z', false, 'undo'], ['y', false, 'redo'],
    ['1', false, 'view-front'], ['2', false, 'view-back'], ['3', false, 'view-left'], ['4', false, 'view-right'],
    ['5', false, 'view-top'], ['6', false, 'view-bottom'], ['7', false, 'view-iso'], ['8', false, 'view-normal'], ['z', true, 'view-previous'],
  ] as const)('maps only the existing %s / shift=%s command', (value, shiftKey, expected) => {
    expect(assemblyShortcutCommand(key(value, { ctrlKey: true, shiftKey }), false)).toBe(expected)
    expect(assemblyShortcutCommand(key(value, { metaKey: true, shiftKey }), false)).toBe(expected)
  })

  it('does not turn unsupported views or modifier combinations into actions', () => {
    for (const value of ['9', 'Delete', 'Enter']) expect(assemblyShortcutCommand(key(value, { ctrlKey: true }), false)).toBeNull()
    expect(assemblyShortcutCommand(key('8'), false)).toBeNull()
    expect(assemblyShortcutCommand(key('8', { ctrlKey: true, shiftKey: true }), false)).toBeNull()
    for (const modifiers of [{ ctrlKey: true, altKey: true }, { ctrlKey: true, metaKey: true }, { ctrlKey: true, shiftKey: true }])
      expect(assemblyShortcutCommand(key('o', modifiers), false)).toBeNull()
    expect(assemblyShortcutCommand(key('f', { shiftKey: true }), false)).toBeNull()
    expect(assemblyShortcutCommand(key('z', { ctrlKey: true, shiftKey: true }), false)).toBe('view-previous')
    expect(assemblyShortcutCommand(key('z', { metaKey: true, shiftKey: true }), false)).toBe('view-previous')
  })

  it('keeps axonometric menu commands available without assigning extra keyboard shortcuts', () => {
    const items = ['view-trimetric', 'view-dimetric'].map(id => ({ id, label: id, onSelect: vi.fn() }))
    const annotated = withAssemblyShortcutLabels([{ id: 'view', label: 'Ver', items }])[0].items
    expect(annotated).toEqual(items)
    expect(annotated.every(item => !item.shortcut)).toBe(true)
    for (const value of ['', '9', 'd', 't']) expect(assemblyShortcutCommand(key(value, { ctrlKey: true }), false)).toBeNull()
    expect(assemblyShortcutCommand(key('8', { ctrlKey: true }), false)).toBe('view-normal')
  })

  it('preserves native text undo, redo, camera keys and Escape in editable controls', () => {
    for (const value of ['z', 'y', '1', '5', '7', '8']) expect(assemblyShortcutCommand(key(value, { ctrlKey: true }), true)).toBeNull()
    expect(assemblyShortcutCommand(key('z', { metaKey: true, shiftKey: true }), true)).toBeNull()
    for (const value of ['f', 'Escape']) expect(assemblyShortcutCommand(key(value), true)).toBeNull()
    expect(assemblyShortcutCommand(key('s', { ctrlKey: true }), true)).toBe('save')
    expect(assemblyShortcutCommand(key('f'), false)).toBe('view-fit')
    expect(assemblyShortcutCommand(key('Escape'), false)).toBe('escape')
  })

  it.each([{ isComposing: true }, { defaultPrevented: true }])('respects prior event ownership %j', flags => {
    const action = vi.fn(), event = key('s', { ctrlKey: true, ...flags })
    expect(dispatchAssemblyShortcut(event, { editable: false, owned: false, command: () => ({ onSelect: action }) })).toBe('ignored')
    expect(action).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not invent configured New when no such command exists', () => {
    const event = key('n', { ctrlKey: true }), action = vi.fn()
    expect(dispatchAssemblyShortcut(event, { editable: false, owned: false, command: id => id === 'open' ? { onSelect: action } : undefined })).toBe('ignored')
    expect(action).not.toHaveBeenCalled(); expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it.each([{ disabled: true, repeat: false }, { disabled: false, repeat: true }])('blocks unavailable/repeated commands without browser fallback: %j', flags => {
    const action = vi.fn(), commit = vi.fn(() => true), event = key('s', { ctrlKey: true, repeat: flags.repeat })
    expect(dispatchAssemblyShortcut(event, { editable: false, owned: false, command: () => ({ disabled: flags.disabled, onSelect: action }), beforeFile: commit })).toBe('blocked')
    expect(event.preventDefault).toHaveBeenCalledOnce(); expect(action).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled()
  })

  it('lets modal Escape retain its owner and blocks file commands while that owner is open', () => {
    const action = vi.fn(), commit = vi.fn(() => true)
    for (const value of ['Escape', 'o', '8']) {
      const event = key(value, { ctrlKey: value !== 'Escape' })
      expect(dispatchAssemblyShortcut(event, { editable: false, owned: true, command: () => ({ onSelect: action }), beforeFile: commit })).toBe('blocked')
      expect(event.preventDefault).toHaveBeenCalledTimes(value === 'Escape' ? 0 : 1)
    }
    expect(action).not.toHaveBeenCalled(); expect(commit).not.toHaveBeenCalled()
  })

  it('serializes the accepted blur value, not the pre-blur name', () => {
    let name = 'Committed', saved = '', committed = false
    const action = () => { saved = name }
    expect(dispatchAssemblyShortcut(key('s', { ctrlKey: true }), { editable: true, owned: false,
      command: () => ({ onSelect: action }), beforeFile: () => { name = 'Accepted'; committed = true; return true },
    })).toBe('executed')
    expect(committed).toBe(true); expect(saved).toBe('Accepted')
  })

  it('does not save after rejection and rechecks authority if a field commit blocks the command', () => {
    const action = vi.fn()
    expect(dispatchAssemblyShortcut(key('s', { ctrlKey: true }), { editable: true, owned: false,
      command: () => ({ onSelect: action }), beforeFile: () => false,
    })).toBe('blocked')
    let disabled = false
    expect(dispatchAssemblyShortcut(key('o', { ctrlKey: true }), { editable: true, owned: false,
      command: () => ({ onSelect: action, disabled }), beforeFile: () => { disabled = true; return true },
    })).toBe('blocked')
    expect(action).not.toHaveBeenCalled()
  })

  it('dispatches only the current Escape action, so picker cancellation does not cascade to preview cancellation', () => {
    let picking = true
    const stop = vi.fn(() => { picking = false }), cancel = vi.fn()
    const command = () => ({ onSelect: picking ? stop : cancel })
    expect(dispatchAssemblyShortcut(key('Escape'), { editable: false, owned: false, command })).toBe('executed')
    expect(stop).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled()
    dispatchAssemblyShortcut(key('Escape'), { editable: false, owned: false, command })
    expect(cancel).toHaveBeenCalledOnce()
  })
})
