import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AssemblyCommandTabs, type AssemblyCommandTab } from './AssemblyCommandTabs'

const values: AssemblyCommandTab[] = ['assembly', 'relations', 'evaluate']

// Static markup verifies ownership and tab stops, not real browser focus or CAD work.
describe.each(['standard', 'configured'] as const)('%s command tabs', kind => {
  it.each(values)('exposes only %s as the selected tab stop and owns all three panels', value => {
    const onChange = vi.fn()
    const html = renderToStaticMarkup(<AssemblyCommandTabs kind={kind} value={value} onChange={onChange} />)
    const buttons = html.match(/<button\b[^>]*>[^<]*<\/button>/g) ?? []
    expect(html.match(/role="tablist"/g)).toHaveLength(1)
    expect(html).toContain(`aria-label="${kind === 'standard' ? 'Áreas de trabajo del ensamblaje' : 'Pestañas del ensamblaje configurado'}"`)
    expect(buttons).toHaveLength(3)
    expect(buttons.filter(button => button.includes('aria-selected="true"'))).toHaveLength(1)
    expect(buttons.filter(button => button.includes('tabindex="0"'))).toHaveLength(1)
    for (const [index, id] of values.entries()) {
      const button = buttons[index]
      expect(button).toContain('type="button"')
      expect(button).toContain('role="tab"')
      expect(button).toContain(`id="${kind}-command-tab-${id}"`)
      expect(button).toContain(`aria-controls="${kind}-command-panel-${id}"`)
      expect(button).toContain(`aria-selected="${value === id}"`)
      expect(button).toContain(`tabindex="${value === id ? 0 : -1}"`)
      expect(button).toContain(`data-${kind === 'standard' ? 'assembly' : 'configured'}-command-tab="${id}"`)
    }
    expect(buttons.map(button => button.slice(button.indexOf('>') + 1, -'</button>'.length)))
      .toEqual(['Ensamblaje', 'Relaciones', 'Evaluar'])
    expect(html).not.toContain(`data-${kind === 'standard' ? 'configured' : 'assembly'}-command-tab=`)
    expect(onChange).not.toHaveBeenCalled()
  })
})

it('keeps standard and configured ownership IDs disjoint when both ribbons are rendered', () => {
  const html = renderToStaticMarkup(<><AssemblyCommandTabs kind="standard" value="relations" onChange={() => undefined} />
    <AssemblyCommandTabs kind="configured" value="evaluate" onChange={() => undefined} /></>)
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
  const targets = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(match => match[1])
  expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6)
  expect(targets).toHaveLength(6); expect(new Set(targets).size).toBe(6)
})
