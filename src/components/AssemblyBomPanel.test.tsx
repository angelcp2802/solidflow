import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AssemblyBomPanel, { assemblyBomMemberLabel, assemblyBomSelectedMember, type AssemblyBomPanelProps } from './AssemblyBomPanel'
import { buildAssemblyBom, type AssemblyBomOptions, type AssemblyBomReport } from '../model/assemblyBom'
import { createAssemblyExample } from '../examples/assembly'
import { validateAssemblyDocument, type AssemblyOccurrence } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'

// Original symbolic occurrence graph built from the public original assembly
// example. These checks cover SSR labels and pure selection, not native CAD,
// WebGL, browser events, file dialogs or exported CSV bytes.
function fixture() {
  const document = createAssemblyExample()
  document.id = 'original-bom-panel-root'; document.name = 'Original BOM panel'
  const occurrence = (id: string, name: string, definition = 'example-pin'): AssemblyOccurrence => ({ id, name,
    definition: { id: definition, revision: 'r1' }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })
  document.definitions.push({ kind: 'assembly', id: 'original-bom-panel-sub', revision: 'r1', name: 'Soporte original',
    createdAt: document.createdAt, updatedAt: document.updatedAt, mates: [],
    occurrences: [occurrence('pin', 'Pasador repetido'), occurrence('pin-2', 'Pasador repetido'), { ...occurrence('suppressed-pin', 'Pasador suprimido'), suppressed: true }] },
  { kind: 'assembly', id: 'original-bom-panel-other', revision: 'r1', name: 'Otro soporte original',
    createdAt: document.createdAt, updatedAt: document.updatedAt, mates: [], occurrences: [occurrence('pin', 'Pasador repetido')] })
  document.occurrences = [occurrence('sub-a', 'Soporte A', 'original-bom-panel-sub'),
    { ...occurrence('sub-b', 'Soporte B', 'original-bom-panel-sub'), visible: false },
    occurrence('other', 'Otro soporte', 'original-bom-panel-other'), occurrence('direct', 'Pasador directo')]
  return validateAssemblyDocument(document)
}
function report(mode: AssemblyBomOptions['mode'] = 'parts-only', includeHidden = true) { return buildAssemblyBom(fixture(), { mode, includeHidden }) }
function props(value: AssemblyBomReport | null = report(), disabled = false, selectedPath: string[] = []): AssemblyBomPanelProps {
  return { report: value, options: value?.options ?? { mode: 'parts-only', includeHidden: true }, disabled, selectedPath,
    onOptionsChange: vi.fn(), onSelect: vi.fn(), onExport: vi.fn(), onClose: vi.fn() }
}
function markup(value: AssemblyBomReport | null = report(), disabled = false, selectedPath: string[] = []) {
  return renderToStaticMarkup(<AssemblyBomPanel {...props(value, disabled, selectedPath)} />)
}
it('renders a closable nonmodal region with an explicit committed-document label', () => {
  const html = markup()
  expect(html).toContain('id="assembly-bom-panel"'); expect(html).toContain('class="assembly-bom-drawer"')
  expect(html).toContain('role="region"'); expect(html).toContain('aria-label="Lista de materiales del ensamblaje"')
  expect(html).toContain('aria-label="Cerrar lista de materiales"'); expect(html).toContain('Documento confirmado · Original BOM panel · r1')
  expect(html).not.toContain('role="dialog"'); expect(html).not.toContain('aria-modal'); expect(html).not.toContain('assembly-modal-backdrop')
})
it('exposes the three declared views and the default hidden-component filter without a suppression override', () => {
  const html = markup()
  expect(html).toContain('aria-label="Modo de lista de materiales"')
  for (const mode of ['parts-only', 'top-level', 'indented']) expect(html).toContain(`value="${mode}"`)
  expect(html).toMatch(/<input(?=[^>]*aria-label="Incluir componentes ocultos en la lista de materiales")(?=[^>]*checked="")[^>]*>/)
  expect(html).toContain('Los componentes suprimidos y su contenido quedan excluidos')
  expect(html).not.toContain('Incluir suprimidos'); expect(html).not.toContain('Pasador suprimido')
})
it('displays canonical source names, raw definition identity and flat total rather than an arbitrary instance name', () => {
  const value = report(), html = markup(value)
  expect(value.rows).toHaveLength(1); expect(value.rows[0].quantityTotal).toBe(6)
  expect(html).toContain('<strong>Pasador original</strong>'); expect(html).toContain('example-pin'); expect(html).toContain('r1')
  expect(html).toContain('Cant. por padre'); expect(html).toContain('Cant. total'); expect(html).toContain('>—</td>')
  expect(html).toContain('Agrupada en todo el ensamblaje'); expect(html).toContain('Una ocurrencia de pieza cuenta como una unidad')
})
it('keeps hierarchical item numbers, local and total counts and separate parent contexts reviewable', () => {
  const value = report('indented'), html = markup(value)
  expect(value.rows.map(row => [row.itemNumber, row.quantityPerParent, row.quantityTotal])).toEqual([
    ['1', 2, 2], ['1.1', 2, 4], ['2', 1, 1], ['2.1', 1, 1], ['3', 1, 1],
  ])
  expect(html.match(/data-bom-row=/g)).toHaveLength(5)
  expect(html).toContain('Padre: Soporte original'); expect(html).toContain('Padre: Otro soporte original')
  expect(html.match(/data-bom-parent=/g)).toHaveLength(5); expect(html).not.toContain('Identidad de fila')
  expect(html).toContain('Padre: Soporte original · 1 · original-bom-panel-sub · r1')
  expect(value.rows[1].key).not.toBe(value.rows[3].key)
})
it('shows full path names and saved path IDs for repeated friendly names', () => {
  const row = report().rows[0], first = row.members[0], other = row.members.find(member => member.component.occurrencePath.join('/') === 'sub-b/pin')!
  expect(assemblyBomMemberLabel(first)).toBe('Soporte A / Pasador repetido · Ruta: ["sub-a","pin"] · example-pin · r1')
  expect(assemblyBomMemberLabel(other)).toBe('Soporte B / Pasador repetido · Ruta: ["sub-b","pin"] · example-pin · r1')
  const html = markup(); expect(html).toContain('Soporte A / Pasador repetido'); expect(html).toContain('Soporte B / Pasador repetido')
  expect(html).toContain('[&quot;sub-b&quot;,&quot;pin&quot;]')
})
it('matches one exact nested occurrence and never its reused sibling, parent or leaf suffix', () => {
  const row = report().rows[0], selected = assemblyBomSelectedMember(row, ['sub-b', 'pin'])!
  expect(selected.component.occurrencePath).toEqual(['sub-b', 'pin'])
  for (const path of [[], ['pin'], ['sub-b'], ['sub-b', 'pin', 'extra'], ['missing', 'pin']]) expect(assemblyBomSelectedMember(row, path)).toBeUndefined()
  expect(assemblyBomSelectedMember(row, ['sub-a', 'pin'])).not.toBe(selected)
})
it('highlights the matching row but selects only the chosen member of its aggregate', () => {
  const html = markup(report(), false, ['sub-b', 'pin'])
  expect(html.match(/class="selected"/g)).toHaveLength(1)
  expect(html).toContain('data-selected-member="[&quot;sub-b&quot;,&quot;pin&quot;]"')
  expect(html).toMatch(/<option(?=[^>]*value="\[&quot;sub-b&quot;,&quot;pin&quot;\]")(?=[^>]*selected="")[^>]*>/)
  expect(html).toMatch(/<option(?=[^>]*value="\[&quot;sub-a&quot;,&quot;pin&quot;\]")(?![^>]*selected=)[^>]*>/)
  expect(html).toContain('Seleccionada: Soporte B / Pasador repetido')
})
it('leaves an aggregate unselected when a selected path is outside the current filter', () => {
  const value = report('parts-only', false), html = markup(value, false, ['sub-b', 'pin'])
  expect(value.rows[0].quantityTotal).toBe(4); expect(html).not.toContain('data-selected-member=')
  expect(html).not.toContain('class="selected"'); expect(html).not.toContain('Soporte B / Pasador repetido')
  expect(html).toContain('Solo componentes visibles')
})
it('blocks selection, options and CSV export during a pending workspace operation while keeping close available', () => {
  const html = markup(report(), true)
  expect(html).toMatch(/<select(?=[^>]*aria-label="Ocurrencia de 1: Pasador original")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<select(?=[^>]*aria-label="Modo de lista de materiales")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Exportar lista de materiales CSV")(?=[^>]*disabled="")[^>]*>/)
  expect(html).toMatch(/<button(?=[^>]*aria-label="Cerrar lista de materiales")(?![^>]*disabled=)[^>]*>/)
  expect(html).toContain('aplicar o cancelar los cambios pendientes')
})
it('renders an empty declared result separately from a failed report and keeps empty CSV export available', () => {
  const value = report(); value.rows = []
  expect(markup(value)).toContain('No hay ocurrencias activas para este contenido y filtro')
  expect(markup(value)).toMatch(/<button(?=[^>]*aria-label="Exportar lista de materiales CSV")(?![^>]*disabled=)[^>]*>/)
  const failed = renderToStaticMarkup(<AssemblyBomPanel {...props(null)} error="Lista no disponible" />)
  expect(failed).toContain('role="alert"'); expect(failed).toContain('Lista no disponible')
  expect(failed).toMatch(/<button(?=[^>]*aria-label="Exportar lista de materiales CSV")(?=[^>]*disabled="")[^>]*>/)
  expect(failed).not.toContain('No hay ocurrencias activas')
})
it('keeps raw labels intact in the UI while React escapes markup', () => {
  const value = report(); value.rows[0].name = '=Source <original>'; value.rows[0].definition.id = '=RAW-ID'; value.rows[0].definition.revision = '+RAW-REV'
  const html = markup(value)
  expect(html).toContain('=Source &lt;original&gt;'); expect(html).toContain('>=RAW-ID</td>'); expect(html).toContain('>+RAW-REV</td>')
  expect(html).not.toContain("&#x27;=RAW-ID"); expect(html).not.toContain('<original>')
  expect(html).toContain('En el CSV, todas las columnas de texto llevan un apóstrofo inicial')
})
it('performs no callbacks or input mutation during read-only rendering and exact-member lookup', () => {
  const value = report('indented'), input = props(value, false, ['sub-b', 'pin']), before = JSON.stringify(value)
  renderToStaticMarkup(<AssemblyBomPanel {...input} />); assemblyBomSelectedMember(value.rows[1], input.selectedPath)
  expect(JSON.stringify(value)).toBe(before)
  for (const callback of [input.onOptionsChange, input.onSelect, input.onExport, input.onClose]) expect(callback).not.toHaveBeenCalled()
})
