import { assemblyDefinitionKey, validateAssemblyGeometryReference, type AssemblyMate, type AssemblyComponentReference } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import type { AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { configuredUiSceneMatches } from './configuredAssemblyUi'
import { configuredMateUiChoices, type ConfiguredMateUiChoice } from './ConfiguredAssemblyMatePanel'
import { validateAssemblyConfiguredMechanicalEdit, type AssemblyConfiguredMechanicalEdit } from '../model/assemblyConfiguredMechanicalEditing'

const families = { lock: 'Bloqueo', concentric: 'Concéntrica con bloqueo de giro', gear: 'Engranaje', screw: 'Tornillo', 'rack-pinion': 'Piñón y cremallera' } as const
function validateAssemblyComponentReference(component: AssemblyComponentReference): AssemblyComponentReference {
  const checked = validateAssemblyGeometryReference({ kind: 'principal-plane', component, plane: 'XY' })
  if (!checked.component) throw Error('Selecciona un componente actual.')
  return checked.component
}
export type ConfiguredMechanicalType = keyof typeof families
export type ConfiguredMechanicalMate = Extract<AssemblyMate, { type: ConfiguredMechanicalType }>
export interface ConfiguredMechanicalDraft {
  mechanical: true; id: string; editing: boolean; type: ConfiguredMechanicalType; name: string; suppressed: boolean
  references: (ConfiguredMateUiChoice['reference'] | AssemblyComponentReference | null)[]
  carrier: AssemblyComponentReference | null; capture: 'retain' | 'recapture'; alignment: 'aligned' | 'opposed'
  numerator: string; denominator: string; direction: 'same' | 'opposed'; phase: string
  lead: string; reverse: boolean; conversion: 'diameter' | 'travel'; override: string
}
export interface ConfiguredMechanicalChoices { geometry: ConfiguredMateUiChoice[]; components: { key: string; label: string; reference: AssemblyComponentReference }[] }
export function configuredMechanicalMate(mate: AssemblyMate): mate is ConfiguredMechanicalMate {
  return mate.type === 'lock' || mate.type === 'gear' || mate.type === 'screw' || mate.type === 'rack-pinion' || mate.type === 'concentric' && mate.rotationLock !== null
}
export function configuredMechanicalDraft(id: string, mate?: ConfiguredMechanicalMate): ConfiguredMechanicalDraft {
  const draft: ConfiguredMechanicalDraft = { mechanical: true, id: mate?.id ?? id, editing: !!mate, type: mate?.type ?? 'lock', name: mate?.name ?? '', suppressed: mate?.suppressed ?? false,
    references: mate ? [structuredClone(mate.first), structuredClone(mate.second)] : [null, null], carrier: null, capture: mate ? 'retain' : 'recapture', alignment: 'aligned',
    numerator: '1', denominator: '1', direction: 'opposed', phase: '0', lead: '1', reverse: false, conversion: 'diameter', override: '' }
  if (mate?.type === 'gear') Object.assign(draft, { carrier: structuredClone(mate.carrier), numerator: String(mate.ratio.numerator), denominator: String(mate.ratio.denominator), direction: mate.direction, phase: String(mate.phase) })
  if (mate?.type === 'screw') Object.assign(draft, { lead: String(mate.lead), reverse: mate.reverse, alignment: mate.alignment })
  if (mate?.type === 'concentric') draft.alignment = mate.alignment
  if (mate?.type === 'rack-pinion') Object.assign(draft, { reverse: mate.reverse, conversion: mate.conversion.mode, override: mate.conversion.override === null ? '' : String(mate.conversion.override) })
  return draft
}
export function configuredMechanicalChoices(document: AssemblyConfiguredDocument, scene: ConfiguredAssemblyScene | null, generation: number, scopePath: string[]): ConfiguredMechanicalChoices {
  if (!scene || !configuredUiSceneMatches(scene, document, generation)) return { geometry: [], components: [] }
  const evaluation = evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration)
  const scope = evaluation.scopes.find(row => JSON.stringify(row.path) === JSON.stringify(scopePath))
  if (!scope || scope.suppressed) return { geometry: [], components: [] }
  const inside = (path: readonly string[]) => path.length > scopePath.length && scopePath.every((id, index) => path[index] === id)
  const nodes = [...evaluation.scopes, ...evaluation.parts].filter(row => !row.suppressed && inside(row.path))
  if (nodes.length > 4096) throw Error('Hay demasiados componentes para este formulario.')
  const components = nodes.map(row => {
    const reference = validateAssemblyComponentReference({ occurrencePath: row.path.slice(scopePath.length), definition: { id: row.definition.id, revision: row.definition.revision } })
    return { key: JSON.stringify(reference), label: `${reference.occurrencePath.join(' / ')} · ${assemblyDefinitionKey(reference.definition)}`, reference }
  })
  return { geometry: configuredMateUiChoices(document, scene, generation, scopePath), components }
}
export function configuredMechanicalRoleChoices(draft: ConfiguredMechanicalDraft, slot: number, choices: ConfiguredMechanicalChoices) {
  if (draft.type === 'lock') return choices.components
  return choices.geometry.filter(({ reference }) => reference.kind === 'face' && reference.support === 'axis' || draft.type === 'rack-pinion' && slot === 1 && reference.kind === 'edge')
}
export function configuredMechanicalIntent(draft: ConfiguredMechanicalDraft, choices: ConfiguredMechanicalChoices,
  target: Pick<AssemblyConfiguredMechanicalEdit, 'scopePath' | 'definition' | 'configuration'>): AssemblyConfiguredMechanicalEdit {
  const refs = [0, 1].map(slot => {
    const reference = draft.references[slot]
    if (!reference) throw Error('Selecciona las dos referencias mecánicas actuales.')
    const normalized = 'kind' in reference ? validateAssemblyGeometryReference(reference) : validateAssemblyComponentReference(reference)
    const matches = configuredMechanicalRoleChoices(draft, slot, choices).filter(row => row.key === JSON.stringify(normalized))
    if (matches.length !== 1) throw Error('Selecciona las dos referencias mecánicas del catálogo actual.')
    return normalized
  })
  const number = (value: string) => { if (!value.trim() || !Number.isFinite(Number(value))) throw Error('Escribe parámetros mecánicos finitos.'); return Number(value) }
  const spec: Record<string, unknown> = { type: draft.type, id: draft.id, name: draft.name.trim(), suppressed: draft.suppressed, first: refs[0], second: refs[1] }
  if (draft.type === 'concentric' || draft.type === 'screw') spec.alignment = draft.alignment
  if (draft.type === 'gear') {
    const carrier = draft.carrier === null ? null : validateAssemblyComponentReference(draft.carrier)
    if (carrier !== null && choices.components.filter(row => row.key === JSON.stringify(carrier)).length !== 1) throw Error('Selecciona un portador actual o el marco del ámbito.')
    Object.assign(spec, { carrier, ratio: { numerator: number(draft.numerator), denominator: number(draft.denominator) }, direction: draft.direction, phase: number(draft.phase) })
  }
  if (draft.type === 'screw') Object.assign(spec, { lead: number(draft.lead), reverse: draft.reverse })
  if (draft.type === 'rack-pinion') Object.assign(spec, { conversion: { mode: draft.conversion, override: draft.override.trim() ? number(draft.override) : null }, reverse: draft.reverse })
  return validateAssemblyConfiguredMechanicalEdit({ ...target, change: draft.editing ? { kind: 'replace', mateId: draft.id, capture: draft.capture, spec } : { kind: 'add', spec } })
}
export default function ConfiguredAssemblyMechanicalPanel(props: { draft: ConfiguredMechanicalDraft; choices: ConfiguredMechanicalChoices; target: Pick<AssemblyConfiguredMechanicalEdit, 'scopePath' | 'definition' | 'configuration'>; disabled: boolean; error?: string; onChange: (draft: ConfiguredMechanicalDraft) => void; onPreview: () => void; onClose: () => void }) {
  const { draft, disabled } = props, change = (patch: Partial<ConfiguredMechanicalDraft>) => { if (!disabled) props.onChange({ ...draft, ...patch }) }
  let reason = props.error ?? ''; try { configuredMechanicalIntent(draft, props.choices, props.target) } catch (error) { reason ||= error instanceof Error ? error.message : 'Completa las referencias mecánicas.' }
  const numeric = (label: string, key: 'numerator' | 'denominator' | 'phase' | 'lead' | 'override') => <label>{label}<input aria-label={label} type="number" step="any" value={draft[key]} disabled={disabled} onChange={event => change({ [key]: event.target.value })} /></label>
  return <section className="configured-mate-editor" role="region" aria-label="Editar relación mecánica del estado">
    <h3>{draft.editing ? 'Editar relación mecánica' : 'Nueva relación mecánica'}</h3>
    <p>La captura y la solución se verifican en todos los usos antes de aplicar.</p>
    <label>Tipo<select aria-label="Tipo de relación mecánica configurada" value={draft.type} disabled={disabled || draft.editing} onChange={event => change({ ...configuredMechanicalDraft(draft.id), type: event.target.value as ConfiguredMechanicalType, name: draft.name })}>{Object.entries(families).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Nombre<input aria-label="Nombre de relación mecánica configurada" value={draft.name} disabled={disabled} onChange={event => change({ name: event.target.value })} /></label>
    {draft.editing && <><label>Captura<select aria-label="Captura mecánica configurada" value={draft.capture} disabled={disabled} onChange={event => change({ capture: event.target.value as ConfiguredMechanicalDraft['capture'] })}><option value="retain">Conservar captura y vueltas acumuladas</option><option value="recapture">Volver a capturar la posición actual</option></select></label><p>{draft.capture === 'retain' ? 'La edición conserva los ceros y las vueltas guardadas. Cambiar referencias requiere volver a capturar.' : 'La nueva captura establece ceros y vueltas desde la posición actual. No conserva las vueltas anteriores.'}</p></>}
    {[0, 1].map(slot => { const list = configuredMechanicalRoleChoices(draft, slot, props.choices), selected = draft.references[slot], key = selected ? JSON.stringify(selected) : '', found = list.some(row => row.key === key); return <label key={slot}>{draft.type === 'lock' ? 'Componente' : 'Eje'} {slot + 1}<select aria-label={`Referencia ${slot + 1} mecánica configurada`} value={found ? key : selected ? 'retained' : ''} disabled={disabled} onChange={event => { const references = [...draft.references]; references[slot] = list.find(row => row.key === event.target.value)?.reference ?? null; change({ references }) }}><option value="">Selecciona una referencia actual</option>{selected && !found && <option value="retained">Referencia guardada · pendiente de reselección</option>}{list.map(row => <option key={row.key} value={row.key} title={row.label}>{row.label}</option>)}</select></label> })}
    {draft.type === 'gear' && <><label>Portador<select aria-label="Portador mecánico configurado" value={draft.carrier === null ? 'scope' : props.choices.components.some(row => row.key === JSON.stringify(draft.carrier)) ? JSON.stringify(draft.carrier) : 'retained'} disabled={disabled} onChange={event => { if (event.target.value === 'scope') change({ carrier: null }); else { const row = props.choices.components.find(row => row.key === event.target.value); if (row) change({ carrier: row.reference }) } }}><option value="scope">Marco del ámbito</option>{draft.carrier && !props.choices.components.some(row => row.key === JSON.stringify(draft.carrier)) && <option value="retained">Portador guardado · pendiente de reselección</option>}{props.choices.components.map(row => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>{numeric('Numerador mecánico configurado', 'numerator')}{numeric('Denominador mecánico configurado', 'denominator')}<label>Sentido<select aria-label="Sentido de engranaje configurado" value={draft.direction} disabled={disabled} onChange={event => change({ direction: event.target.value as ConfiguredMechanicalDraft['direction'] })}><option value="opposed">Opuesto</option><option value="same">Mismo</option></select></label>{numeric('Fase ponderada de engranaje en radianes', 'phase')}<p>Fase ponderada de la relación; no es un ángulo geométrico ni se reduce a una vuelta.</p></>}
    {(draft.type === 'concentric' || draft.type === 'screw') && <label>Alineación<select aria-label="Alineación mecánica configurada" value={draft.alignment} disabled={disabled} onChange={event => change({ alignment: event.target.value as ConfiguredMechanicalDraft['alignment'] })}><option value="aligned">Alineada</option><option value="opposed">Opuesta</option></select></label>}
    {draft.type === 'screw' && numeric('Avance de tornillo configurado en mm por vuelta', 'lead')}
    {draft.type === 'rack-pinion' && <><label>Conversión<select aria-label="Conversión de cremallera configurada" value={draft.conversion} disabled={disabled} onChange={event => change({ conversion: event.target.value as ConfiguredMechanicalDraft['conversion'] })}><option value="diameter">Diámetro primitivo (mm)</option><option value="travel">Recorrido por vuelta (mm)</option></select></label>{numeric('Sustitución de cremallera configurada en mm', 'override')}<p>Deja la sustitución vacía para usar el diámetro cilíndrico actual.</p></>}
    {(draft.type === 'screw' || draft.type === 'rack-pinion') && <label><input type="checkbox" aria-label="Invertir avance mecánico configurado" checked={draft.reverse} disabled={disabled} onChange={event => change({ reverse: event.target.checked })} />Invertir avance</label>}
    {reason && <p role="status">{reason}</p>}<button disabled={disabled || !!reason} onClick={props.onPreview}>Vista previa de relación mecánica configurada</button><button disabled={disabled} onClick={props.onClose}>Cerrar edición de relación configurada</button>
  </section>
}
