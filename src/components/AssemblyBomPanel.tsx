import { Download, List, X } from 'lucide-react'
import type { AssemblyBomMember, AssemblyBomOptions, AssemblyBomReport, AssemblyBomRow } from '../model/assemblyBom'

export interface AssemblyBomPanelProps {
  report: AssemblyBomReport | null
  options: AssemblyBomOptions
  selectedPath: readonly string[]
  disabled: boolean
  error?: string
  onOptionsChange: (options: AssemblyBomOptions) => void
  onSelect: (path: string[]) => void
  onExport: () => void
  onClose: () => void
}

/** Full saved paths distinguish reused nested occurrences; names are labels only. */
export function assemblyBomSelectedMember(row: AssemblyBomRow, selectedPath: readonly string[]): AssemblyBomMember | undefined {
  return row.members.find(member => member.component.occurrencePath.length === selectedPath.length
    && member.component.occurrencePath.every((id, index) => id === selectedPath[index]))
}

export function assemblyBomMemberLabel(member: AssemblyBomMember): string {
  return `${member.pathNames.join(' / ')} · Ruta: ${JSON.stringify(member.component.occurrencePath)} · ${member.component.definition.id} · ${member.component.definition.revision}`
}

const modeNames: Record<AssemblyBomOptions['mode'], string> = {
  'parts-only': 'Solo piezas', 'top-level': 'Primer nivel', indented: 'Con jerarquía',
}

export default function AssemblyBomPanel(props: AssemblyBomPanelProps) {
  const { report, options, disabled } = props
  const rowsByKey = new Map<string, AssemblyBomRow>(report?.rows.map(row => [row.key, row]))
  return <section id="assembly-bom-panel" className="assembly-bom-drawer" role="region" aria-label="Lista de materiales del ensamblaje"
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); props.onClose() } }}>
    <header className="assembly-bom-header">
      <div><h2><List size={18} />Lista de materiales</h2><p>Documento confirmado{report ? ` · ${report.source.name} · ${report.source.revision}` : ''}</p></div>
      <label>Contenido<select aria-label="Modo de lista de materiales" value={options.mode} disabled={disabled}
        onChange={event => props.onOptionsChange({ ...options, mode: event.target.value as AssemblyBomOptions['mode'] })}>
        <option value="parts-only">Solo piezas</option><option value="top-level">Primer nivel</option><option value="indented">Con jerarquía</option>
      </select></label>
      <label className="assembly-bom-hidden"><input type="checkbox" aria-label="Incluir componentes ocultos en la lista de materiales" checked={options.includeHidden} disabled={disabled}
        onChange={event => props.onOptionsChange({ ...options, includeHidden: event.target.checked })} />Incluir ocultos</label>
      <button className="assembly-primary" aria-label="Exportar lista de materiales CSV" disabled={disabled || !report} onClick={() => { if (!disabled && report) props.onExport() }}><Download size={16} />Exportar CSV</button>
      <button className="assembly-bom-close" aria-label="Cerrar lista de materiales" onClick={props.onClose}><X size={19} /></button>
    </header>
    <p className="assembly-bom-note">Los componentes suprimidos y su contenido quedan excluidos. Una ocurrencia de pieza cuenta como una unidad, con independencia de sus cuerpos.</p>
    <p className="assembly-bom-note">En el CSV, todas las columnas de texto llevan un apóstrofo inicial para conservarlas como texto.</p>
    {disabled && <p className="assembly-bom-note">Selección y exportación disponibles al terminar la operación y aplicar o cancelar los cambios pendientes.</p>}
    {props.error && <p className="assembly-bom-error" role="alert">{props.error}</p>}
    {report && <div className="assembly-bom-table">
      <table><caption>{modeNames[report.options.mode]} · {report.rows.length} filas · {report.options.includeHidden ? 'Incluye componentes ocultos' : 'Solo componentes visibles'}</caption>
        <thead><tr><th scope="col">N.º</th><th scope="col">Tipo</th><th scope="col">Nombre del origen y contexto</th><th scope="col">ID del origen</th><th scope="col">Revisión</th><th scope="col">Cant. por padre</th><th scope="col">Cant. total</th><th scope="col">Seleccionar ocurrencia</th></tr></thead>
        <tbody>{report.rows.map(row => {
          const selected = assemblyBomSelectedMember(row, props.selectedPath)
          const parent = row.parentKey === null ? null : rowsByKey.get(row.parentKey)
          return <tr key={row.key} data-bom-row={row.key} data-bom-parent={row.parentKey ?? ''} data-selected-member={selected ? JSON.stringify(selected.component.occurrencePath) : undefined} className={selected ? 'selected' : ''}>
            <td className="assembly-bom-number">{row.itemNumber}</td><td>{row.kind === 'part' ? 'Pieza' : 'Ensamblaje'}</td>
            <th scope="row" style={{ paddingLeft: 10 + row.depth * 18 }}><strong>{row.name}</strong><small>{options.mode === 'parts-only' ? 'Agrupada en todo el ensamblaje'
              : parent ? `Padre: ${parent.name} · ${parent.itemNumber} · ${parent.definition.id} · ${parent.definition.revision}`
                : `Padre: ${report.source.name} · ${report.source.id} · ${report.source.revision}`}</small></th>
            <td className="assembly-bom-id">{row.definition.id}</td><td className="assembly-bom-id">{row.definition.revision}</td>
            <td className="assembly-bom-quantity">{row.quantityPerParent ?? '—'}</td><td className="assembly-bom-quantity">{row.quantityTotal}</td>
            <td className="assembly-bom-members"><select aria-label={`Ocurrencia de ${row.itemNumber}: ${row.name}`} value={selected ? JSON.stringify(selected.component.occurrencePath) : ''} disabled={disabled}
              onChange={event => {
                if (disabled) return
                const member = row.members.find(value => JSON.stringify(value.component.occurrencePath) === event.target.value)
                if (member) props.onSelect([...member.component.occurrencePath])
              }}>
              <option value="">Elige una de {row.members.length} ocurrencias</option>
              {row.members.map(member => <option key={JSON.stringify(member.component.occurrencePath)} value={JSON.stringify(member.component.occurrencePath)}>{assemblyBomMemberLabel(member)}</option>)}
            </select>{selected && <small className="assembly-bom-selected">Seleccionada: {assemblyBomMemberLabel(selected)}</small>}</td>
          </tr>
        })}</tbody>
      </table>
      {!report.rows.length && <p className="assembly-bom-empty">No hay ocurrencias activas para este contenido y filtro.</p>}
    </div>}
  </section>
}
