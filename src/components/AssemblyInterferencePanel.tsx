import { validateAssemblyInterferenceOptions, type AssemblyInterferenceOptions, type AssemblyInterferenceReport, type AssemblyInterferenceScope } from '../model/assemblyInterference'
import type { AssemblyComponentReference } from '../model/assemblyDocument'

export type AssemblyInterferencePair = AssemblyInterferenceReport['pairs'][number]
/** UI syntax only. Native admission, distance and Common remain in the worker. */
export function assemblyInterferenceUiOptions(clearance: string, includeHidden: boolean, scope?: AssemblyInterferenceScope, includeWithinComponent = false, treatSubassembliesAsComponents = false): AssemblyInterferenceOptions {
  const value = Number(clearance)
  if (!clearance.trim() || !Number.isFinite(value) || value < 0) throw new Error('La holgura debe ser un número finito mayor o igual que cero.')
  return validateAssemblyInterferenceOptions({ clearance: value, includeHidden, includeWithinComponent, treatSubassembliesAsComponents, lengthTolerance: 1e-6, volumeTolerance: 1e-6,
    ...(scope === undefined ? {} : { scope }) })
}
export function assemblyInterferenceComponentKey(component: AssemblyComponentReference): string {
  return JSON.stringify([component.occurrencePath, component.definition.id, component.definition.revision])
}
export interface AssemblyInterferenceChoice {
  component: AssemblyComponentReference
  label: string
}
export function assemblyInterferenceScopeLabel(mode: AssemblyInterferenceScope['mode']): string {
  return mode === 'all' ? 'Todos los componentes' : mode === 'among-selected' ? 'Entre seleccionados' : 'Seleccionados contra el resto'
}
export function assemblyInterferenceStatus(pair: AssemblyInterferencePair): string {
  if (pair.status === 'overlap') return 'Solape'
  if (pair.status === 'small-overlap') return 'Solape menor de tolerancia · colisión'
  if (pair.status === 'contact') return 'Contacto dentro de tolerancia'
  return 'Holgura'
}
const number = (value: number) => value.toLocaleString(undefined, { maximumSignificantDigits: 8 })
export interface AssemblyInterferencePanelProps {
  report: AssemblyInterferenceReport | null
  selectedPairId: string | null
  clearance: string
  includeHidden: boolean
  includeWithinComponent: boolean
  treatSubassembliesAsComponents: boolean
  scope: AssemblyInterferenceScope
  choices: readonly AssemblyInterferenceChoice[]
  disabled: boolean
  onClearanceChange: (value: string) => void
  onIncludeHiddenChange: (value: boolean) => void
  onIncludeWithinComponentChange: (value: boolean) => void
  onTreatSubassembliesAsComponentsChange: (value: boolean) => void
  onScopeChange: (value: AssemblyInterferenceScope) => void
  onInspect: () => void
  onSelectPair: (id: string | null) => void
  onClear: () => void
  showingHidden?: boolean
}
export default function AssemblyInterferencePanel(props: AssemblyInterferencePanelProps) {
  const { report, disabled } = props
  const grouped = props.treatSubassembliesAsComponents
  const collisions = report?.pairs.filter(pair => pair.status === 'overlap' || pair.status === 'small-overlap').length ?? 0
  // Keep obsolete identities visible so they can be removed explicitly; never
  // silently relabel them to a current component with a matching display name.
  const choices = new Map(props.choices.map(choice => [assemblyInterferenceComponentKey(choice.component), choice]))
  for (const component of [...props.scope.selected, ...props.scope.excluded]) {
    const key = assemblyInterferenceComponentKey(component)
    if (!choices.has(key)) choices.set(key, { component, label: `Referencia no actual · ${JSON.stringify(component.occurrencePath)} · ${component.definition.id} · ${component.definition.revision}` })
  }
  const componentList = (field: 'selected' | 'excluded', label: string) => <label>{label}<select multiple size={5} aria-label={label}
    disabled={disabled || field === 'selected' && props.scope.mode === 'all'}
    value={props.scope[field].map(assemblyInterferenceComponentKey)} onChange={event => {
      const components = Array.from(event.currentTarget.selectedOptions, option => choices.get(option.value)!.component)
      props.onScopeChange({ ...props.scope, [field]: structuredClone(components) })
    }}>{[...choices].map(([key, choice]) => <option key={key} value={key}>{choice.label}</option>)}</select></label>
  return <section className="assembly-section assembly-interference" role="region" aria-label="Interferencias y holguras">
    <h2>Interferencias y holguras</h2><p>Comprobación del ensamblaje confirmado. Aplica o cancela las vistas previas antes de comprobar.</p>
    <label>Holgura · mm<input aria-label="Holgura de comprobación" type="number" min="0" step="any" value={props.clearance} disabled={disabled} onChange={event => props.onClearanceChange(event.target.value)} /></label>
    <label className="assembly-check"><input aria-label="Incluir componentes ocultos" type="checkbox" checked={props.includeHidden} disabled={disabled} onChange={event => props.onIncludeHiddenChange(event.target.checked)} />Incluir componentes ocultos</label>
    <label className="assembly-check"><input aria-label="Incluir cuerpos de una misma pieza" type="checkbox" checked={props.includeWithinComponent} disabled={disabled} onChange={event => props.onIncludeWithinComponentChange(event.target.checked)} />Incluir cuerpos de una misma pieza</label>
    <label className="assembly-check"><input aria-label="Agrupar subensamblajes raíz" type="checkbox" checked={grouped} disabled={disabled} onChange={event => props.onTreatSubassembliesAsComponentsChange(event.target.checked)} />Agrupar subensamblajes raíz</label>
    <p>La agrupación se calcula desde la raíz original del documento: omite pares internos de cada componente raíz, incluso al incluir cuerpos de una misma pieza. Seleccionar o excluir descendientes no crea nuevas raíces ni amplía la selección.</p>
    <label>Ámbito<select aria-label="Ámbito de interferencias" value={props.scope.mode} disabled={disabled} onChange={event => {
      const mode = event.currentTarget.value as AssemblyInterferenceScope['mode']
      props.onScopeChange({ ...props.scope, mode, selected: mode === 'all' ? [] : props.scope.selected })
    }}><option value="all">Todos los componentes</option><option value="among-selected">Entre seleccionados</option><option value="selected-against-rest">Seleccionados contra el resto</option></select></label>
    <details><summary>Componentes: {props.scope.selected.length} seleccionados · {props.scope.excluded.length} excluidos</summary>
      <p>Un subensamblaje incluye sus piezas descendientes. Las exclusiones tienen prioridad. Usa Ctrl o Cmd para elegir varios.</p>
      <p>Las exclusiones eliminan las piezas indicadas y sus descendientes; no se amplían al componente raíz.</p>
      <p>Entre seleccionados comprueba pares del grupo. Contra el resto comprueba únicamente pares que cruzan entre el grupo y los demás componentes.</p>
      {componentList('selected', 'Componentes seleccionados para interferencias')}
      <button disabled={disabled || !props.scope.selected.length} onClick={() => props.onScopeChange({ ...props.scope, selected: [] })}>Vaciar selección de interferencias</button>
      {componentList('excluded', 'Componentes excluidos de interferencias')}
      <button disabled={disabled || !props.scope.excluded.length} onClick={() => props.onScopeChange({ ...props.scope, excluded: [] })}>Vaciar exclusiones de interferencias</button>
    </details>
    {props.scope.mode !== 'all' && !props.scope.selected.length && <p>Selecciona al menos un componente para este ámbito.</p>}
    <button aria-label="Comprobar interferencias" className="assembly-primary" disabled={disabled || props.scope.mode !== 'all' && !props.scope.selected.length} onClick={props.onInspect}>Comprobar interferencias</button>
    {!report && <p>No hay un informe vigente para estas opciones.</p>}
    {report && <div className="assembly-interference-result" data-analysis-id={report.analysisId}>
      <p>Ámbito comprobado: {assemblyInterferenceScopeLabel(report.scopeSummary.mode)}.</p>
      <p>Opción «cuerpos de una misma pieza»: {report.options.includeWithinComponent ? 'activada' : 'desactivada'}.</p>
      <p>Opción «agrupar subensamblajes raíz»: {report.options.treatSubassembliesAsComponents ? 'activada' : 'desactivada'}.</p>
      {report.options.treatSubassembliesAsComponents && report.options.includeWithinComponent && <p>La agrupación prevalece: no se comprueban pares internos de un mismo componente raíz.</p>}
      {report.scopeSummary.mode === 'selected-against-rest' && <p>Este ámbito comprueba pares entre piezas seleccionadas y el resto; no comprueba pares dentro de una misma pieza.</p>}
      <p>{report.scopeSummary.selectedLeafCount} piezas seleccionadas · {report.scopeSummary.excludedLeafCount} piezas excluidas · {report.scopeSummary.eligibleLeafCount} piezas participantes</p>
      <p>{report.bodyCount} cuerpos · {report.componentCount} componentes · {report.potentialPairCount} pares posibles</p>
      <p>{report.testedPairCount} pares comprobados con geometría nativa · {collisions} pares con solape</p>
      <p>{report.broadPhaseExcludedCount} pares descartados por sus envolventes; sus distancias exactas no se han consultado.</p>
      <p>Los volúmenes se muestran por par; no se suman como un volumen único de interferencia.</p>
      {report.warnings.map((message, index) => <p className="assembly-analysis-warning" key={index}>{message}</p>)}
      {!report.pairs.length && <p>No hay pares dentro de la holgura comprobada.</p>}
      {!!report.pairs.length && <div className="assembly-interference-table"><table><caption>Resultados por par de cuerpos</caption>
        <thead><tr><th>Componentes y cuerpos</th><th>Resultado</th><th>V · mm³</th><th>Distancia · mm</th><th>Ver</th></tr></thead>
        <tbody>{report.pairs.map(pair => <tr key={pair.id} data-analysis-pair={pair.id} className={props.selectedPairId === pair.id ? 'selected' : ''}>
          <td>{pair.first.componentName}<small>{pair.first.bodyName}</small><span> / </span>{pair.second.componentName}<small>{pair.second.bodyName}</small></td>
          <td>{assemblyInterferenceStatus(pair)}{pair.status === 'contact' && <small>Tolerancia: {number(pair.lengthTolerance)} mm</small>}{pair.status === 'small-overlap' && <small>Tolerancia de volumen: {number(pair.volumeTolerance)} mm³</small>}</td>
          <td>{number(pair.intersectionVolume)}</td><td>{number(pair.minimumDistance)}</td>
          <td><button aria-label={`Resaltar ${pair.first.componentName}, ${pair.first.bodyName}, y ${pair.second.componentName}, ${pair.second.bodyName}`} aria-pressed={props.selectedPairId === pair.id} disabled={disabled} onClick={() => props.onSelectPair(props.selectedPairId === pair.id ? null : pair.id)}>Ver par</button></td>
        </tr>)}</tbody>
      </table></div>}
      {props.showingHidden && <p>Se muestran temporalmente los componentes ocultos del resultado.</p>}
      <button aria-label="Cerrar comprobación de interferencias" disabled={disabled} onClick={props.onClear}>Cerrar informe</button>
    </div>}
  </section>
}
