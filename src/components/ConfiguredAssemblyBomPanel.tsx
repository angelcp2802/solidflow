import type { ConfiguredAssemblyBomMember, ConfiguredAssemblyBomOptions, ConfiguredAssemblyBomReport } from '../model/assemblyConfiguredBom'

export interface ConfiguredAssemblyBomPanelProps {
  report: ConfiguredAssemblyBomReport | null
  options: ConfiguredAssemblyBomOptions
  scopes: readonly { path: readonly string[]; label: string }[]
  selectedPath: readonly string[]
  rootConfigurationLabel: string
  disabled: boolean
  error?: string
  onOptionsChange: (options: ConfiguredAssemblyBomOptions) => void
  onSelect: (member: ConfiguredAssemblyBomMember) => void
  onExport: () => void
  onClose: () => void
}

export function configuredBomMemberLabel(member: ConfiguredAssemblyBomMember): string {
  const states = member.configurationAncestry.map(value => `${value.path.join(' / ') || 'Raíz'}: ${value.configuration === null ? 'Base' : JSON.stringify(value.configuration)}`).join(' · ')
  return `${member.pathNames.join(' / ')} · Ruta: ${JSON.stringify(member.component.occurrencePath)} · ${member.component.definition.id} · ${member.component.definition.revision} · ${states}`
}

/** Declaration inventory only. These rows never grant native or Apply authority. */
export default function ConfiguredAssemblyBomPanel(props: ConfiguredAssemblyBomPanelProps) {
  const { report, options, disabled } = props
  return <section className="configured-bom-panel" id="configured-assembly-bom-panel" role="region" aria-label="Lista de materiales de la configuración"
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); props.onClose() } }}>
    <header><div><h2>Lista de materiales de la configuración</h2><p>Documento confirmado{report && ` · ${report.source.name} · ${report.source.revision} · Raíz: ${props.rootConfigurationLabel}`}</p></div>
      <button aria-label="Cerrar lista de materiales configurada" onClick={props.onClose}>Cerrar</button></header>
    <div className="configured-bom-controls">
      <label>Ámbito de la lista<select aria-label="Ámbito de lista de materiales configurada" value={JSON.stringify(options.scopePath ?? [])} disabled={disabled}
        onChange={event => { const scope = props.scopes.find(value => JSON.stringify(value.path) === event.target.value); if (scope) props.onOptionsChange({ ...options, scopePath: [...scope.path] }) }}>
        {props.scopes.map(scope => <option key={JSON.stringify(scope.path)} value={JSON.stringify(scope.path)}>{scope.label}</option>)}</select></label>
      <label>Contenido<select aria-label="Modo de lista de materiales configurada" value={options.mode} disabled={disabled}
        onChange={event => props.onOptionsChange({ ...options, mode: event.target.value as ConfiguredAssemblyBomOptions['mode'] })}>
        <option value="parts-only">Solo piezas</option><option value="top-level">Primer nivel</option><option value="indented">Con jerarquía</option></select></label>
      <label><input type="checkbox" aria-label="Incluir ocultos en lista de materiales configurada" checked={options.includeHidden} disabled={disabled}
        onChange={event => props.onOptionsChange({ ...options, includeHidden: event.target.checked })} />Incluir ocultos</label>
      <button aria-label="Exportar lista de materiales configurada CSV" disabled={disabled || !report} onClick={() => { if (!disabled && report) props.onExport() }}>Exportar CSV</button>
    </div>
    <p>Una ocurrencia de pieza cuenta como una unidad, aunque tenga varios cuerpos. Los componentes suprimidos y su contenido quedan excluidos. Esta lista no certifica material, masa ni geometría.</p>
    <p>La procedencia muestra el nombre y SHA-256 guardados del archivo de origen; no verifica su contenido actual ni concede acceso al archivo. En el CSV, los textos llevan un apóstrofo inicial.</p>
    {report && <p>Ámbito: {report.scope.path.join(' / ') || 'Todo el ensamblaje'} · {report.scope.configuration === null ? 'Base' : `${report.scope.configurationName ?? report.scope.configuration} · ${JSON.stringify(report.scope.configuration)}`}{report.scope.suppressed ? ' · suprimido' : ''}{!report.scope.visible ? ' · oculto' : ''}</p>}
    {!!report?.referenceDiagnostics.length && <p>Hay referencias de relaciones que necesitan reparación. La lista cuenta las ocurrencias declaradas; no acredita que sus relaciones estén resueltas.</p>}
    {disabled && <p>Selección y exportación disponibles al terminar la operación y aplicar o cancelar la vista previa.</p>}
    {props.error && <p role="alert">{props.error}</p>}
    {report && <div className="configured-bom-table"><table><caption>{report.rows.length} filas · {options.includeHidden ? 'Incluye ocultos' : 'Solo visibles'}</caption>
      <thead><tr><th>N.º</th><th>Tipo</th><th>Origen</th><th>ID y revisión</th><th>Configuración</th><th>Cant. por padre</th><th>Cant. total</th><th>Procedencia guardada</th><th>Seleccionar ocurrencia</th></tr></thead>
      <tbody>{report.rows.map(row => {
        const selected = row.members.find(member => JSON.stringify(member.component.occurrencePath) === JSON.stringify(props.selectedPath))
        return <tr key={row.key} data-configured-bom-row={row.key} data-bom-definition={JSON.stringify([row.definition.id, row.definition.revision])} data-bom-configuration={JSON.stringify(row.configuration)} data-bom-quantity-total={row.quantityTotal} data-bom-quantity-per-parent={row.quantityPerParent ?? ''} data-selected-member={selected ? JSON.stringify(selected.component.occurrencePath) : undefined} className={selected ? 'selected' : ''}>
          <td>{row.itemNumber}</td><td>{row.kind === 'part' ? 'Pieza' : 'Ensamblaje'}</td><th scope="row" style={{ paddingLeft: 10 + row.depth * 18 }}>{row.name}</th>
          <td>{row.definition.id}<small>{row.definition.revision}</small></td><td>{row.kind === 'part' ? '—' : row.configuration === null ? 'Base' : `${row.configurationName ?? row.configuration} · ${JSON.stringify(row.configuration)}`}</td>
          <td>{row.quantityPerParent ?? '—'}</td><td>{row.quantityTotal}</td><td>{row.sourceLink ? <>{row.sourceLink.displayName}<small>SHA-256: {row.sourceLink.contentSha256}</small></> : 'Sin vínculo guardado'}</td>
          <td><select aria-label={`Ocurrencia configurada de ${row.itemNumber}: ${row.name}`} disabled={disabled} value={selected ? JSON.stringify(selected.component.occurrencePath) : ''}
            onChange={event => { if (disabled) return; const member = row.members.find(value => JSON.stringify(value.component.occurrencePath) === event.target.value); if (member) props.onSelect(member) }}>
            <option value="">Elige una de {row.members.length} ocurrencias</option>{row.members.map(member => <option key={JSON.stringify(member.component.occurrencePath)} value={JSON.stringify(member.component.occurrencePath)}>{configuredBomMemberLabel(member)}</option>)}</select></td>
        </tr>
      })}</tbody></table>{!report.rows.length && <p>No hay ocurrencias activas para este ámbito y filtro.</p>}</div>}
  </section>
}
