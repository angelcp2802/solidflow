import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import ConfiguredAssemblyTree, { configuredAssemblyTreeKey, configuredAssemblyTreeNodes } from './ConfiguredAssemblyTree'
import { assemblyTreeModel, reconcileAssemblyTreeNavigation, toggleAssemblyTreeBranch } from './assemblyTreeNavigation'
import { buildAssemblyOriginTree, type AssemblyOriginTreeEntry } from './assemblyOriginTree'

function fixture() {
  const { document, catalog } = assemblyConfigurationCoreFixture()
  return { document, evaluation: evaluateAssemblyConfiguration(document, catalog, 'mixed') }
}
function render(options: { scope?: string; occurrenceId?: string; active?: boolean; disabled?: boolean; originRows?: readonly AssemblyOriginTreeEntry[]; selectedOriginKey?: string | null } = {}) {
  const { document, evaluation } = fixture(), onScope = vi.fn(), onOccurrence = vi.fn(), onProperties = vi.fn()
  const html = renderToStaticMarkup(<ConfiguredAssemblyTree name={document.name} evaluation={evaluation} scope="[]" occurrenceId=""
    active disabled={false} resetKey={document} onScope={onScope} onOccurrence={onOccurrence} onProperties={onProperties}
    onRelations={() => undefined} onOrigin={() => undefined} {...options} />)
  return { html, onScope, onOccurrence, onProperties }
}
const decode = (value: string) => value.replaceAll('&quot;', '"').replaceAll('&amp;', '&')
const tags = (html: string, attribute: string) => [...html.matchAll(new RegExp('<[^>]* ' + attribute + '="[^"]*"[^>]*>', 'g'))].map(match => match[0])
const value = (tag: string, attribute: string) => decode(tag.match(new RegExp(' ' + attribute + '="([^"]*)"'))?.[1] ?? '')

describe('configured occurrence tree', () => {
  it('keeps reused definitions distinct by path and revision with explicit configuration actions', () => {
    const { evaluation } = fixture(), nodes = configuredAssemblyTreeNodes(evaluation)
    expect(nodes).toHaveLength(8)
    expect(new Set(nodes.map(node => node.key)).size).toBe(8)
    const left = nodes.find(node => node.kind === 'occurrence' && node.path.join('/') === 'left')!
    const right = nodes.find(node => node.kind === 'occurrence' && node.path.join('/') === 'right')!
    expect(nodes.filter(node => node.parentKey === left.key).map(node => [node.kind, node.path.join('/')])).toEqual([
      ['configuration', 'left'], ['occurrence', 'left/a'], ['occurrence', 'left/b'],
    ])
    expect(nodes.filter(node => node.parentKey === right.key).map(node => [node.kind, node.path.join('/')])).toEqual([
      ['configuration', 'right'], ['occurrence', 'right/a'], ['occurrence', 'right/b'],
    ])
    expect(configuredAssemblyTreeKey('occurrence', ['right'], { id: 'configuration-S', revision: 's-r2' })).not.toBe(right.key)
  })

  it('starts both branches collapsed while retaining all semantic rows and real disclosure targets', () => {
    const { html, onScope, onOccurrence, onProperties } = render()
    const rows = tags(html, 'data-assembly-tree-key'), groups = tags(html, 'data-assembly-tree-parent-key')
    expect(rows).toHaveLength(8)
    expect(groups).toHaveLength(2)
    expect(groups.every(group => group.includes('hidden=""'))).toBe(true)
    expect(tags(html, 'data-assembly-tree-disclosure')).toHaveLength(2)
    for (const group of groups) {
      const parent = rows.find(row => value(row, 'data-assembly-tree-key') === value(group, 'data-assembly-tree-parent-key'))!
      expect(parent).toContain('aria-expanded="false"')
      expect(value(parent, 'aria-controls')).toBe(value(group, 'id'))
      expect(value(parent, 'aria-owns')).toBe(value(group, 'id'))
    }
    expect(rows.filter(row => row.includes('tabindex="0"'))).toHaveLength(1)
    expect(rows.every(row => row.includes('role="treeitem"'))).toBe(true)
    expect(html.match(/aria-label="Seleccionar componente a"/g)).toHaveLength(2)
    expect(html).not.toMatch(/<details|<summary|Eje [XYZ]/)
    expect(onScope).not.toHaveBeenCalled(); expect(onOccurrence).not.toHaveBeenCalled(); expect(onProperties).not.toHaveBeenCalled()
  })

  it('reveals only the selected occurrence ancestors and keeps Properties an explicit action', () => {
    const { html } = render({ scope: '["right"]', occurrenceId: 'b' })
    const groups = tags(html, 'data-assembly-tree-parent-key'), rows = tags(html, 'data-assembly-tree-key')
    expect(groups.filter(group => group.includes('hidden=""'))).toHaveLength(1)
    const selected = rows.filter(row => row.includes('aria-selected="true"'))
    expect(selected).toHaveLength(1)
    expect(selected[0]).toContain('aria-label="Seleccionar componente b"')
    expect(selected[0]).toContain('tabindex="0"')
    expect(selected[0]).toContain('aria-level="2"')
    expect(tags(html, 'aria-label').find(tag => value(tag, 'aria-label') === 'Propiedades del componente seleccionado')).not.toContain('disabled')
    expect(tags(render().html, 'aria-label').find(tag => value(tag, 'aria-label') === 'Propiedades del componente seleccionado')).toContain('disabled=""')
  })

  it('retains hidden selection when collapsed and reveals it when returning to the model pane', () => {
    const { evaluation, document } = fixture(), nodes = configuredAssemblyTreeNodes(evaluation), model = assemblyTreeModel(nodes)
    const selectedKey = nodes.find(node => node.kind === 'occurrence' && node.path.join('/') === 'right/b')!.key
    const parentKey = model.parents.get(selectedKey)!, context = { selectedKey, resetKey: document, active: true }
    const initial = reconcileAssemblyTreeNavigation(null, model, context)
    const collapsed = toggleAssemblyTreeBranch(model, initial, parentKey)
    expect(collapsed.selectedKey).toBe(selectedKey)
    expect(model.visible(selectedKey, collapsed.expanded)).toBe(false)
    expect(reconcileAssemblyTreeNavigation(collapsed, model, context)).toBe(collapsed)
    const inactive = reconcileAssemblyTreeNavigation(collapsed, model, { ...context, active: false })
    const returned = reconcileAssemblyTreeNavigation(inactive, model, context)
    expect(returned.selectedKey).toBe(selectedKey)
    expect(model.visible(selectedKey, returned.expanded)).toBe(true)
    expect(returned.expanded.size).toBe(1)
  })

  it('removes tree tab stops and disables selection, disclosure and Properties while inactive or guarded', () => {
    for (const options of [{ active: false }, { disabled: true }]) {
      const { html } = render({ scope: '["right"]', occurrenceId: 'b', ...options })
      for (const tag of [...tags(html, 'data-assembly-tree-key'), ...tags(html, 'data-assembly-tree-disclosure')]) {
        expect(tag).toContain('disabled=""'); expect(tag).toContain('tabindex="-1"')
      }
      expect(tags(html, 'aria-label').find(tag => value(tag, 'aria-label') === 'Propiedades del componente seleccionado')).toContain('disabled=""')
    }
  })

  it('adds real root datums and direct component datum children without changing part icons or scope', () => {
    const { evaluation } = fixture(), originRows = buildAssemblyOriginTree(evaluation, [])
    const nodes = configuredAssemblyTreeNodes(evaluation, originRows), before = JSON.stringify(evaluation)
    const { html, onScope, onOccurrence } = render({ scope: '["right"]', originRows })
    const rows = tags(html, 'data-assembly-origin-tree-key')
    expect(rows).toHaveLength(42)
    const rootRows = rows.filter(row => value(row, 'data-assembly-origin-tree-owner') === '[]')
    expect(rootRows).toHaveLength(6)
    expect(rootRows.every(row => value(row, 'aria-level') === '1' && value(row, 'data-assembly-tree-parent') === '')).toBe(true)
    for (const row of rootRows) expect(JSON.parse(value(row, 'data-assembly-origin-tree-reference')).component).toBeNull()
    const rightB = nodes.find(node => node.kind === 'occurrence' && node.path.join('/') === 'right/b')!
    const bDatums = nodes.filter(node => node.parentKey === rightB.key && node.kind === 'origin')
    expect(bDatums).toHaveLength(6)
    for (const row of rows.filter(row => value(row, 'data-assembly-origin-tree-owner') === '["right","b"]')) {
      expect(value(row, 'data-assembly-tree-parent')).toBe(rightB.key)
      expect(value(row, 'aria-level')).toBe('3')
      expect(JSON.parse(value(row, 'data-assembly-origin-tree-reference')).component.occurrencePath).toEqual(['right', 'b'])
    }
    const partButtons = [...html.matchAll(/<button[^>]*aria-label="Seleccionar componente b"[^>]*>[\s\S]*?<\/button>/g)]
    expect(partButtons).toHaveLength(2)
    expect(partButtons.every(match => match[0].includes('lucide-box') && match[0].includes('aria-expanded="false"'))).toBe(true)
    expect(html).toContain('data-origin-icon="plane"'); expect(html).toContain('data-origin-icon="axis"')
    expect(JSON.stringify(evaluation)).toBe(before)
    expect(onScope).not.toHaveBeenCalled(); expect(onOccurrence).not.toHaveBeenCalled()
  })

  it('retains a selected datum while its component is collapsed, independently of the selected occurrence', () => {
    const { evaluation, document } = fixture(), originRows = buildAssemblyOriginTree(evaluation, [])
    const entry = originRows.find(row => row.ownerPath.join('/') === 'right/b' && row.display.reference.kind === 'principal-plane' && row.display.reference.plane === 'XY')!
    const nodes = configuredAssemblyTreeNodes(evaluation, originRows), model = assemblyTreeModel(nodes)
    const context = { selectedKey: entry.treeKey, active: true, resetKey: document }
    const expanded = reconcileAssemblyTreeNavigation(null, model, context), owner = model.parents.get(entry.treeKey)!
    const collapsed = toggleAssemblyTreeBranch(model, expanded, owner)
    expect(collapsed.selectedKey).toBe(entry.treeKey)
    expect(model.visible(entry.treeKey, collapsed.expanded)).toBe(false)
    expect(reconcileAssemblyTreeNavigation(collapsed, model, context)).toBe(collapsed)
    expect(model.visible(entry.treeKey, toggleAssemblyTreeBranch(model, collapsed, owner).expanded)).toBe(true)
    const { html } = render({ originRows, selectedOriginKey: entry.treeKey, occurrenceId: 'left' })
    const selected = tags(html, 'data-assembly-tree-key').filter(row => value(row, 'aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(value(selected[0], 'data-assembly-origin-tree-key')).toBe(entry.treeKey)
    expect(selected[0]).toContain('tabindex="0"')
    expect(tags(html, 'aria-label').find(tag => value(tag, 'aria-label') === 'Propiedades del componente seleccionado')).toContain('disabled=""')
  })

  it('does not create datum actions under hidden or suppressed owners and disables them with a guarded tree', () => {
    const { document, catalog } = assemblyConfigurationCoreFixture()
    document.occurrences[0].visible = false
    const evaluation = evaluateAssemblyConfiguration(document, catalog, 'single-right'), originRows = buildAssemblyOriginTree(evaluation, [])
    const nodes = configuredAssemblyTreeNodes(evaluation, originRows)
    expect(nodes.filter(node => node.kind === 'origin' && node.path[0] === 'left')).toEqual([])
    expect(nodes.filter(node => node.kind === 'origin' && node.path.join('/') === 'right/b')).toEqual([])
    const { html } = render({ originRows, disabled: true })
    for (const row of tags(html, 'data-assembly-origin-tree-key')) {
      expect(row).toContain('disabled=""'); expect(row).toContain('tabindex="-1"')
    }
  })
})
