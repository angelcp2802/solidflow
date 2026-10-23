import { assemblyDefinitionKey, validateAssemblyMate, validateAssemblyGeometryReference, validateAssemblyVertexReference, validateAssemblyCylinderSurfaceReference, validateAssemblySphereSurfaceReference,
  type AssemblyMate, type AssemblyGeometryReference, type AssemblyVertexReference, type AssemblyCylinderSurfaceReference, type AssemblySphereSurfaceReference } from '../model/assemblyDocument'
import { evaluateAssemblyConfiguration } from '../model/assemblyConfigurationCore'
import type { AssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { assemblyDirectionMateObjective, assemblyDirectionReferenceKind } from '../model/assemblyDirectionMates'
import { assemblySceneFaceReference, assemblySceneEdgeReference, assemblySceneCylinderSurfaceReference, assemblySceneSphereSurfaceReference } from '../cad/kernel.assembly-types'
import type { ConfiguredAssemblyScene } from '../cad/kernel.assembly-configuration-scene'
import { configuredUiSceneMatches, configuredUiDisplayScene } from './configuredAssemblyUi'

const families = {
  distance: 'Distancia', coincident: 'Coincidencia', parallel: 'Paralela', perpendicular: 'Perpendicular', angle: 'Ángulo', concentric: 'Concéntrica sin bloqueo de giro',
  'limit-distance': 'Límites de distancia', 'limit-angle': 'Límites de ángulo principal', 'limit-directed-angle': 'Tope angular dirigido', hinge: 'Bisagra', width: 'Anchura centrada', symmetry: 'Simetría',
  tangent: 'Tangencia plano/cilindro', 'skew-cylinder-tangent': 'Tangencia entre cilindros no paralelos', 'parallel-cylinder-tangent': 'Tangencia entre cilindros paralelos',
  'plane-sphere-tangent': 'Tangencia plano/esfera', 'sphere-sphere-tangent': 'Tangencia entre esferas', 'cylinder-sphere-tangent': 'Tangencia cilindro/esfera',
} as const
export type ConfiguredEditableMateType = keyof typeof families
export type ConfiguredMateUiReference = AssemblyGeometryReference | AssemblyVertexReference | AssemblyCylinderSurfaceReference | AssemblySphereSurfaceReference
export interface ConfiguredMateUiChoice { key: string; label: string; reference: ConfiguredMateUiReference }
export interface ConfiguredMateDraft {
  id: string; editing: boolean; type: ConfiguredEditableMateType; name: string; suppressed: boolean; references: (ConfiguredMateUiReference | null)[]
  alignment: 'aligned' | 'opposed'; value: string; minimum: string; maximum: string; start: string; sweep: string; limited: boolean
  entityKind: 'point' | 'line' | 'plane' | 'sphere' | 'cylinder'; side: 'positive' | 'negative'; branch: 'external' | 'first' | 'second'; widthBranch: 'sum' | 'difference'; tabBranch: 'sum' | 'difference'
}
export function configuredMateEditUnavailable(mate: AssemblyMate): string | null {
  if (['lock', 'gear', 'screw', 'rack-pinion'].includes(mate.type) || mate.type === 'concentric' && mate.rotationLock !== null) return 'Usa el formulario de relaciones mecánicas para conservar o volver a capturar este estado.'
  if (mate.type === 'profile-center' || mate.type === 'line-path' || mate.type === 'circular-path') return 'Usa el formulario de relaciones compuestas para seleccionar sus referencias materiales y parámetros.'
  if (!Object.hasOwn(families, mate.type)) return 'Esta familia no está disponible en este formulario.'
  return null
}
export function configuredMateUiDraft(id: string, mate?: AssemblyMate): ConfiguredMateDraft {
  if (mate && configuredMateEditUnavailable(mate)) throw Error(configuredMateEditUnavailable(mate)!)
  const draft: ConfiguredMateDraft = { id: mate?.id ?? id, editing: !!mate, type: (mate?.type ?? 'distance') as ConfiguredEditableMateType, name: mate?.name ?? '', suppressed: mate?.suppressed ?? false,
    references: [null, null], alignment: 'aligned', value: '', minimum: '', maximum: '', start: '', sweep: '', limited: false,
    entityKind: 'point', side: 'positive', branch: 'external', widthBranch: 'sum', tabBranch: 'sum' }
  if (!mate) return draft
  if (mate.type === 'hinge') { draft.references = [...mate.axis, ...mate.axial, ...(mate.stops?.angular ?? [])]; draft.limited = !!mate.stops; if (mate.stops) { draft.start = String(mate.stops.arc.start); draft.sweep = String(mate.stops.arc.sweep) } }
  else if (mate.type === 'width') { draft.references = [...mate.width, ...mate.tab]; draft.widthBranch = mate.widthBranch; draft.tabBranch = mate.tabBranch }
  else if (mate.type === 'symmetry') { draft.references = [mate.source, mate.target, mate.mirror]; draft.entityKind = mate.entityKind }
  else if ('first' in mate && mate.type !== 'profile-center' && mate.type !== 'lock' && mate.type !== 'gear' && mate.type !== 'screw' && mate.type !== 'rack-pinion') draft.references = [mate.first, mate.second, ...(mate.type === 'limit-directed-angle' ? [mate.guide] : [])]
  if ('alignment' in mate && mate.alignment) draft.alignment = mate.alignment
  if (mate.type === 'distance') draft.value = String(mate.distance)
  if (mate.type === 'angle') draft.value = String(mate.angle)
  if ('limits' in mate) { draft.minimum = String(mate.limits.minimum); draft.maximum = String(mate.limits.maximum) }
  if (mate.type === 'limit-directed-angle') { draft.start = String(mate.arc.start); draft.sweep = String(mate.arc.sweep) }
  if ('side' in mate) draft.side = mate.side
  if ('branch' in mate) draft.branch = mate.branch.kind === 'external' ? 'external' : mate.branch.larger
  return structuredClone(draft)
}
function normalizedReference(reference: ConfiguredMateUiReference): ConfiguredMateUiReference {
  return reference.kind === 'vertex' ? validateAssemblyVertexReference(reference) : reference.kind === 'face' && reference.support === 'cylinder-surface' ? validateAssemblyCylinderSurfaceReference(reference)
    : reference.kind === 'face' && reference.support === 'sphere-surface' ? validateAssemblySphereSurfaceReference(reference) : validateAssemblyGeometryReference(reference)
}
const referenceKey = (reference: ConfiguredMateUiReference) => JSON.stringify(normalizedReference(reference))
const plane = (r: ConfiguredMateUiReference) => r.kind === 'principal-plane' || r.kind === 'face' && r.support === 'plane'
const axis = (r: ConfiguredMateUiReference) => r.kind === 'face' && r.support === 'axis'
const direction = (r: ConfiguredMateUiReference) => plane(r) || axis(r) || r.kind === 'edge'
const cylinder = (r: ConfiguredMateUiReference) => r.kind === 'face' && r.support === 'cylinder-surface'
const sphere = (r: ConfiguredMateUiReference) => r.kind === 'face' && r.support === 'sphere-surface'
export function configuredMateUiRoleLabels(draft: ConfiguredMateDraft): string[] {
  return draft.type === 'hinge' ? ['Eje A', 'Eje B', 'Plano axial A', 'Plano axial B', ...(draft.limited ? ['Plano angular A', 'Plano angular B'] : [])]
    : draft.type === 'width' ? ['Plano de anchura A', 'Plano de anchura B', 'Plano de pestaña A', 'Plano de pestaña B']
      : draft.type === 'symmetry' ? ['Origen', 'Destino', 'Plano de simetría'] : ['Referencia 1', 'Referencia 2', ...(draft.type === 'limit-directed-angle' ? ['Eje guía'] : [])]
}
export function configuredMateUiRoleChoices(draft: ConfiguredMateDraft, slot: number, choices: readonly ConfiguredMateUiChoice[]): ConfiguredMateUiChoice[] {
  return choices.filter(({ reference: r }) => {
    if (draft.type === 'hinge') return slot < 2 ? axis(r) || r.kind === 'edge' : slot < 4 ? plane(r) : r.kind === 'face' && r.support === 'plane'
    if (draft.type === 'width' || ['coincident', 'distance', 'limit-distance'].includes(draft.type)) return plane(r)
    if (draft.type === 'concentric') return axis(r)
    if (draft.type === 'symmetry') return slot === 2 ? plane(r) : draft.entityKind === 'point' ? r.kind === 'vertex' : draft.entityKind === 'line' ? axis(r) || r.kind === 'edge' : draft.entityKind === 'plane' ? plane(r) : draft.entityKind === 'sphere' ? sphere(r) : cylinder(r)
    if (draft.type === 'tangent') return plane(r) || cylinder(r)
    if (draft.type === 'plane-sphere-tangent') return plane(r) || sphere(r)
    if (draft.type === 'sphere-sphere-tangent') return sphere(r)
    if (draft.type === 'cylinder-sphere-tangent') return cylinder(r) || sphere(r)
    if (draft.type.includes('cylinder-tangent')) return cylinder(r)
    return direction(r)
  })
}
/** Exact current scene nominees only. Native purpose/incidence is checked later. */
export function configuredMateUiChoices(document: AssemblyConfiguredDocument, scene: ConfiguredAssemblyScene | null, generation: number, scopePath: string[]): ConfiguredMateUiChoice[] {
  if (!scene || !configuredUiSceneMatches(scene, document, generation)) return []
  const evaluation = evaluateAssemblyConfiguration(document.source, document.catalog, document.rootConfiguration), scope = evaluation.scopes.find(value => JSON.stringify(value.path) === JSON.stringify(scopePath))
  if (!scope || scope.suppressed) return []
  const choices = new Map<string, ConfiguredMateUiChoice>(), inside = (path: readonly string[]) => path.length > scopePath.length && scopePath.every((id, i) => id === path[i])
  const add = (reference: ConfiguredMateUiReference, label: string) => { const normalized = normalizedReference(reference), key = referenceKey(normalized); if (!choices.has(key)) { if (choices.size >= 4096) throw Error('Hay demasiadas referencias para este formulario.'); choices.set(key, { key, label, reference: normalized }) } }
  const nodes = [...evaluation.scopes.filter(row => !row.suppressed && inside(row.path)).map(row => ({ path: row.path, definition: row.definition })),
    ...evaluation.parts.filter(row => !row.suppressed && inside(row.path)).map(row => ({ path: row.path, definition: row.definition }))]
  for (const node of [null, ...nodes]) for (const planeName of ['XY', 'XZ', 'YZ'] as const) add({ kind: 'principal-plane', component: node ? { occurrencePath: node.path.slice(scopePath.length), definition: { id: node.definition.id, revision: node.definition.revision } } : null, plane: planeName }, `${node ? node.path.slice(scopePath.length).join(' / ') : 'Ámbito actual'} · plano principal ${planeName}`)
  for (const body of configuredUiDisplayScene(scene).bodies) {
    if (!body.visible || !inside(body.component.occurrencePath)) continue
    const component = { occurrencePath: body.component.occurrencePath.slice(scopePath.length), definition: { ...body.component.definition } }, label = component.occurrencePath.join(' / ') + ' · ' + body.name
    const local = (r: ConfiguredMateUiReference) => { if (r.component === null || JSON.stringify(r.component.occurrencePath) !== JSON.stringify(body.component.occurrencePath) || assemblyDefinitionKey(r.component.definition) !== assemblyDefinitionKey(body.component.definition)) throw Error('La referencia no corresponde al cuerpo actual.'); return { ...r, component } }
    for (const face of body.faces) {
      for (const r of [assemblySceneFaceReference(face), assemblySceneCylinderSurfaceReference(face), assemblySceneSphereSurfaceReference(face)]) if (r) add(local(r), `${label} · cara ${r.face.sourceFeatureId} · ${r.support} · ${r.face.key}`)
    }
    for (const edge of body.edges ?? []) { const r = assemblySceneEdgeReference(edge); if (r) add(local(r), `${label} · arista LINE · ${r.edge.sourceFeatureId} · ${r.edge.key}`) }
    for (const vertex of body.vertexPoints ?? []) add(local({ kind: 'vertex', ...structuredClone(vertex.selection), support: 'point' }), `${label} · vértice (${vertex.point.join(', ')}) mm`)
  }
  return [...choices.values()]
}
export function configuredMateUiProposal(draft: ConfiguredMateDraft, choices: readonly ConfiguredMateUiChoice[]): AssemblyMate {
  const labels = configuredMateUiRoleLabels(draft), refs = labels.map((_, i) => {
    const ref = draft.references[i]; if (!ref || configuredMateUiRoleChoices(draft, i, choices).filter(value => value.key === referenceKey(ref)).length !== 1) throw Error('Selecciona todas las referencias del catálogo actual.')
    return normalizedReference(ref)
  })
  const number = (value: string) => { if (!value.trim() || !Number.isFinite(Number(value))) throw Error('Escribe parámetros numéricos finitos.'); return Number(value) }
  const candidate: Record<string, unknown> = { id: draft.id, name: draft.name.trim(), suppressed: draft.suppressed, type: draft.type }
  if (draft.type === 'hinge') Object.assign(candidate, { axis: refs.slice(0, 2), axial: refs.slice(2, 4), alignment: draft.alignment }, draft.limited ? { stops: { coordinate: 'directed-about-axis', angular: refs.slice(4), arc: { start: number(draft.start), sweep: number(draft.sweep) } } } : {})
  else if (draft.type === 'width') Object.assign(candidate, { mode: 'centered', width: refs.slice(0, 2), tab: refs.slice(2, 4), widthBranch: draft.widthBranch, tabBranch: draft.tabBranch, alignment: draft.alignment })
  else if (draft.type === 'symmetry') Object.assign(candidate, { entityKind: draft.entityKind, source: refs[0], target: refs[1], mirror: refs[2], alignment: draft.entityKind === 'point' || draft.entityKind === 'sphere' ? null : draft.alignment })
  else {
    Object.assign(candidate, { first: refs[0], second: refs[1] })
    if (['distance', 'coincident', 'limit-distance', 'concentric'].includes(draft.type)) candidate.alignment = draft.alignment
    if (draft.type === 'distance') candidate.distance = number(draft.value)
    if (draft.type === 'concentric') candidate.rotationLock = null
    if (draft.type === 'parallel' || draft.type === 'perpendicular') candidate.alignment = assemblyDirectionMateObjective(draft.type, assemblyDirectionReferenceKind(validateAssemblyGeometryReference(refs[0])), assemblyDirectionReferenceKind(validateAssemblyGeometryReference(refs[1]))) === 'collinear' ? draft.alignment : null
    if (draft.type === 'angle') candidate.angle = number(draft.value)
    if (draft.type === 'limit-distance' || draft.type === 'limit-angle') { candidate.limits = { minimum: number(draft.minimum), maximum: number(draft.maximum) }; if (draft.type === 'limit-angle') candidate.coordinate = 'principal-direction' }
    if (draft.type === 'limit-directed-angle') Object.assign(candidate, { coordinate: 'directed-about-axis', guide: refs[2], arc: { start: number(draft.start), sweep: number(draft.sweep) } })
    if (draft.type === 'tangent' || draft.type === 'plane-sphere-tangent') candidate.side = draft.side
    if (['skew-cylinder-tangent', 'parallel-cylinder-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'].includes(draft.type)) candidate.branch = draft.branch === 'external' ? { kind: 'external' } : { kind: 'internal', larger: draft.branch }
  }
  return validateAssemblyMate(candidate)
}
export default function ConfiguredAssemblyMatePanel(props: { draft: ConfiguredMateDraft; choices: readonly ConfiguredMateUiChoice[]; disabled: boolean; onChange: (draft: ConfiguredMateDraft) => void; onPreview: () => void; onClose: () => void }) {
  const { draft, disabled } = props, change = (values: Partial<ConfiguredMateDraft>) => { if (!disabled) props.onChange({ ...draft, ...values }) }
  let reason = ''; try { configuredMateUiProposal(draft, props.choices) } catch (error) { reason = error instanceof Error ? error.message : 'Completa las referencias y parámetros.' }
  const numeric = (label: string, key: 'value' | 'minimum' | 'maximum' | 'start' | 'sweep') => <label>{label}<input type="number" step="any" aria-label={label} value={draft[key]} disabled={disabled} onChange={e => change({ [key]: e.target.value })} /></label>
  return <section className="configured-mate-editor" role="region" aria-label="Editar relación del estado">
    <h3>{draft.editing ? 'Editar relación' : 'Nueva relación'}</h3><p>Los cambios se conservan sólo al aplicar la vista previa verificada.</p>
    <label>Tipo<select aria-label="Tipo de relación configurada" value={draft.type} disabled={disabled || draft.editing} onChange={e => change({ ...configuredMateUiDraft(draft.id), type: e.target.value as ConfiguredEditableMateType, name: draft.name })}>{Object.entries(families).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
    <label>Nombre<input aria-label="Nombre de relación configurada" value={draft.name} disabled={disabled} onChange={e => change({ name: e.target.value })} /></label>
    {draft.type === 'symmetry' && <label>Familia<select aria-label="Familia de simetría configurada" value={draft.entityKind} disabled={disabled} onChange={e => change({ entityKind: e.target.value as ConfiguredMateDraft['entityKind'], references: [null, null, null] })}>{['point', 'line', 'plane', 'sphere', 'cylinder'].map(kind => <option key={kind}>{kind}</option>)}</select></label>}
    {draft.type === 'hinge' && <label><input type="checkbox" aria-label="Limitar giro de bisagra configurada" checked={draft.limited} disabled={disabled} onChange={e => change({ limited: e.target.checked, references: draft.references.slice(0, 4), start: '', sweep: '' })} />Limitar giro</label>}
    {configuredMateUiRoleLabels(draft).map((label, slot) => { const list = configuredMateUiRoleChoices(draft, slot, props.choices), selected = draft.references[slot], key = selected ? referenceKey(selected) : '', found = list.some(value => value.key === key); return <label key={slot}>{label}<select aria-label={`${label} de relación configurada`} disabled={disabled} value={found ? key : selected ? 'retained' : ''} onChange={e => { const refs = [...draft.references]; refs[slot] = list.find(value => value.key === e.target.value)?.reference ?? null; change({ references: refs }) }}>
      <option value="">Selecciona una referencia actual</option>{selected && !found && <option value="retained">Referencia guardada · pendiente de reselección</option>}{list.map(value => <option key={value.key} value={value.key} title={value.label}>{value.label}</option>)}</select></label> })}
    {draft.type === 'distance' && numeric('Distancia de relación configurada en mm', 'value')}{draft.type === 'angle' && numeric('Ángulo de relación configurada en grados', 'value')}
    {(draft.type === 'limit-distance' || draft.type === 'limit-angle') && <>{numeric(`Mínimo de relación configurada en ${draft.type === 'limit-distance' ? 'mm' : 'grados'}`, 'minimum')}{numeric(`Máximo de relación configurada en ${draft.type === 'limit-distance' ? 'mm' : 'grados'}`, 'maximum')}</>}
    {(draft.type === 'limit-directed-angle' || draft.type === 'hinge' && draft.limited) && <>{numeric('Inicio de relación configurada en grados', 'start')}{numeric('Recorrido de relación configurada en grados', 'sweep')}</>}
    {!['angle', 'limit-angle', 'limit-directed-angle', 'tangent', 'plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent', 'skew-cylinder-tangent', 'parallel-cylinder-tangent'].includes(draft.type) && <label>Alineación<select aria-label="Alineación de relación configurada" value={draft.alignment} disabled={disabled} onChange={e => change({ alignment: e.target.value as ConfiguredMateDraft['alignment'] })}><option value="aligned">Alineada</option><option value="opposed">Opuesta</option></select></label>}
    {draft.type === 'width' && (['widthBranch', 'tabBranch'] as const).map(key => <label key={key}>{key === 'widthBranch' ? 'Bisector de anchura' : 'Bisector de pestaña'}<select aria-label={key === 'widthBranch' ? 'Bisector de anchura configurada' : 'Bisector de pestaña configurada'} value={draft[key]} disabled={disabled} onChange={e => change({ [key]: e.target.value })}><option value="sum">Suma</option><option value="difference">Diferencia</option></select></label>)}
    {(draft.type === 'tangent' || draft.type === 'plane-sphere-tangent') && <label>Lado<select aria-label="Lado de tangencia configurada" value={draft.side} disabled={disabled} onChange={e => change({ side: e.target.value as ConfiguredMateDraft['side'] })}><option value="positive">Positivo</option><option value="negative">Negativo</option></select></label>}
    {['skew-cylinder-tangent', 'parallel-cylinder-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'].includes(draft.type) && <label>Rama<select aria-label="Rama de tangencia configurada" value={draft.branch} disabled={disabled} onChange={e => change({ branch: e.target.value as ConfiguredMateDraft['branch'] })}><option value="external">Externa</option><option value="first">Interna · radio mayor en referencia 1</option><option value="second">Interna · radio mayor en referencia 2</option></select></label>}
    {reason && <p role="status">{reason}</p>}<button disabled={disabled || !!reason} onClick={props.onPreview}>Vista previa de relación configurada</button><button disabled={disabled} onClick={props.onClose}>Cerrar edición de relación configurada</button>
  </section>
}
