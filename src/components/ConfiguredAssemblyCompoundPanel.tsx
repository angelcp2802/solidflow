import { validateAssemblyMate, validateAssemblyGeometryReference, validateAssemblyPlaneReference, validateAssemblyVertexReference,
  type AssemblyMate, type AssemblyEdgeReference, type AssemblyVertexReference, type AssemblyProfileCenterMate, type AssemblyLinePathMate, type AssemblyCircularPathMate } from '../model/assemblyDocument'
import { validateAssemblyProfileFaceSelection, type AssemblyProfileFaceSelection } from '../model/assemblyProfileReferences'
import { validateAssemblyProfileCenterReferenceRequest, type AssemblyProfileCenterSelection } from '../model/assemblyProfileCenterReferences'
import { validateAssemblyLinePathMateRequest } from '../model/assemblyLinePathMate'
import { validateAssemblyCircularPathReferenceRequest } from '../model/assemblyCircularPathReferences'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import type { VertexReference } from '../cad/kernel.types'
import { configuredCompoundProfileEdgesForFace, configuredCompoundLineOrigins, type ConfiguredCompoundUiChoices } from './configuredCompoundUiChoices'

const families = { 'profile-center': 'Centro de perfiles', 'line-path': 'Punto sobre trayecto LINE', 'circular-path': 'Punto sobre trayecto circular' } as const
export type ConfiguredCompoundType = keyof typeof families
export type ConfiguredCompoundMate = AssemblyProfileCenterMate | AssemblyLinePathMate | AssemblyCircularPathMate
type Guide = NonNullable<ConfiguredCompoundUiChoices['guides'][number]['reference']>
export interface ConfiguredCompoundDraft {
  compound: true; id: string; editing: boolean; type: ConfiguredCompoundType; name: string; suppressed: boolean
  profileMode: 'free' | 'rectangle'; profiles: [AssemblyProfileCenterSelection | null, AssemblyProfileCenterSelection | null]
  alignment: 'aligned' | 'opposed'; offset: string; quarterTurns: 0 | 1 | 2 | 3
  point: AssemblyVertexReference | null; lineEdge: AssemblyEdgeReference | null; lineOrigin: VertexReference | null; circularPath: AssemblyArcPathSelection | null
  lineMode: 'free' | 'distance' | 'percent'; circularMode: 'free' | 'coordinate'; domain: 'trim' | 'support-circle'; quantity: string; positionReverse: boolean
  following: boolean; followAxis: 'x' | 'y' | 'z'; followReverse: boolean; upEnabled: boolean; upAxis: 'x' | 'y' | 'z'; upReverse: boolean; guide: Guide | null
}
export function configuredCompoundMate(mate: AssemblyMate): mate is ConfiguredCompoundMate {
  return mate.type === 'profile-center' || mate.type === 'line-path' || mate.type === 'circular-path'
}
export function configuredCompoundUiDraft(id: string, mate?: ConfiguredCompoundMate): ConfiguredCompoundDraft {
  const draft: ConfiguredCompoundDraft = { compound: true, id: mate?.id ?? id, editing: !!mate, type: mate?.type ?? 'profile-center', name: mate?.name ?? '', suppressed: mate?.suppressed ?? false,
    profileMode: 'free', profiles: [null, null], alignment: 'aligned', offset: '0', quarterTurns: 0,
    point: null, lineEdge: null, lineOrigin: null, circularPath: null, lineMode: 'free', circularMode: 'free', domain: 'trim', quantity: '0', positionReverse: false,
    following: false, followAxis: 'x', followReverse: false, upEnabled: false, upAxis: 'y', upReverse: false, guide: null }
  if (!mate) return draft
  if (mate.type === 'profile-center') {
    draft.profiles = structuredClone([mate.first, mate.second]); draft.profileMode = mate.orientation.mode; draft.alignment = mate.alignment; draft.offset = String(mate.offsetMm)
    if (mate.orientation.mode === 'rectangle') draft.quarterTurns = mate.orientation.quarterTurns
  } else {
    draft.point = structuredClone(mate.point)
    if (mate.type === 'line-path') {
      draft.lineEdge = validateAssemblyGeometryReference({ kind: 'edge', component: mate.path.component, body: mate.path.body, edge: mate.path.edge, support: 'line' }) as AssemblyEdgeReference
      draft.lineOrigin = structuredClone(mate.path.startVertex); draft.lineMode = mate.position.mode
      if (mate.position.mode !== 'free') { draft.quantity = String(mate.position.mode === 'distance' ? mate.position.distanceMm : mate.position.percent); draft.positionReverse = mate.position.reverse }
    } else {
      draft.circularPath = structuredClone(mate.path); draft.circularMode = mate.position.mode
      if (mate.position.mode === 'free') draft.domain = mate.position.domain
      else draft.quantity = String(mate.position.distanceMm)
    }
    if (mate.orientation.pitchYaw !== 'free') Object.assign(draft, { following: true, followAxis: mate.orientation.pitchYaw.axis, followReverse: mate.orientation.pitchYaw.reverse })
    if (mate.orientation.roll !== 'free') Object.assign(draft, { upEnabled: true, upAxis: mate.orientation.roll.axis, upReverse: mate.orientation.roll.reverse, guide: structuredClone(mate.orientation.roll.guide) })
  }
  return draft
}
export function configuredCompoundUiProfileFace(draft: ConfiguredCompoundDraft, slot: 0 | 1, face: AssemblyProfileFaceSelection | null): ConfiguredCompoundDraft {
  const profiles: ConfiguredCompoundDraft['profiles'] = [...draft.profiles]
  profiles[slot] = face ? { face: validateAssemblyProfileFaceSelection(face), axis: null } : null
  return { ...draft, profiles }
}
export function configuredCompoundUiLineEdge(draft: ConfiguredCompoundDraft, lineEdge: AssemblyEdgeReference | null): ConfiguredCompoundDraft {
  return { ...draft, lineEdge: lineEdge ? structuredClone(lineEdge) : null, lineOrigin: null }
}
function same<T>(first: unknown, second: unknown, normalize: (input: unknown) => T): boolean {
  try { return JSON.stringify(normalize(first)) === JSON.stringify(normalize(second)) } catch { return false }
}
function current<T>(reference: T | null, choices: readonly { reference: T }[], normalize: (value: unknown) => T, message: string): T {
  if (reference === null || choices.filter(choice => same(reference, choice.reference, normalize)).length !== 1) throw Error(message)
  return normalize(reference)
}
const edgeReference = (input: unknown): AssemblyEdgeReference => {
  const value = validateAssemblyGeometryReference(input)
  if (value.kind !== 'edge') throw Error('Selecciona una arista LINE actual.')
  return value
}
const guideReference = (input: unknown): Guide => {
  const value = validateAssemblyPlaneReference(input)
  if (value.kind !== 'face') throw Error('Elige una cara plana material como guía UP.')
  return value
}
/** Complete authored syntax and current display nominees only. Joint incidence,
 * native kind, domains, budgets and final satisfaction remain worker gates. */
export function configuredCompoundUiProposal(draft: ConfiguredCompoundDraft, choices: ConfiguredCompoundUiChoices): ConfiguredCompoundMate {
  const finite = (value: string) => { if (!value.trim() || !Number.isFinite(Number(value))) throw Error('Escribe valores numéricos finitos.'); return Number(value) }
  const base = { id: draft.id, name: draft.name.trim(), suppressed: draft.suppressed, type: draft.type }
  if (draft.type === 'profile-center') {
    const selections = draft.profiles.map(selection => {
      if (!selection) throw Error('Completa ambos perfiles actuales.')
      const face = current(selection.face, choices.profileFaces, validateAssemblyProfileFaceSelection, 'Selecciona ambas caras del catálogo actual.')
      if (draft.profileMode === 'free') {
        if (selection.axis !== null) throw Error('El giro libre requiere perfiles sin eje material.')
        return { face, axis: null }
      }
      const edges = configuredCompoundProfileEdgesForFace(choices.profileEdges, face)
      if (!selection.axis || edges.filter(choice => same({ kind: 'edge', component: face.component, body: face.body, edge: choice.edge, support: 'line' }, { kind: 'edge', component: face.component, body: face.body, edge: selection.axis!.edge, support: 'line' }, edgeReference)).length !== 1) throw Error('Selecciona las dos aristas materiales actuales.')
      return { face, axis: structuredClone(selection.axis) }
    })
    const request = validateAssemblyProfileCenterReferenceRequest({ first: selections[0], second: selections[1], alignment: draft.alignment, offsetMm: finite(draft.offset), orientation: draft.profileMode === 'free' ? { mode: 'free' } : { mode: 'rectangle', quarterTurns: draft.quarterTurns } })
    return validateAssemblyMate({ ...base, ...request }) as AssemblyProfileCenterMate
  }
  const point = current(draft.point, choices.points, validateAssemblyVertexReference, 'Selecciona un punto material actual.')
  if (draft.upEnabled && !draft.following) throw Error('Vector UP necesita alinear primero un eje con el trayecto.')
  if (draft.upEnabled && draft.upAxis === draft.followAxis) throw Error('El eje UP y el eje del trayecto deben ser distintos; elige otro eje explícitamente.')
  const guide = draft.upEnabled ? current(draft.guide, choices.guides, guideReference, 'Elige una cara plana material actual como guía UP.') : null
  const orientation = { pitchYaw: draft.following ? { mode: 'follow', axis: draft.followAxis, reverse: draft.followReverse } : 'free', roll: draft.upEnabled ? { mode: 'up', axis: draft.upAxis, reverse: draft.upReverse, guide } : 'free' }
  if (draft.type === 'line-path') {
    const edge = current(draft.lineEdge, choices.lineEdges, edgeReference, 'Selecciona una arista LINE actual.')
    const origins = configuredCompoundLineOrigins(choices.points, edge)
    const origin = current(draft.lineOrigin ? { kind: 'vertex' as const, component: edge.component, body: edge.body, vertex: draft.lineOrigin, support: 'point' as const } : null, origins, validateAssemblyVertexReference, 'Selecciona el vértice material de origen actual de la arista.')
    const path = { component: edge.component, body: edge.body, edge: edge.edge, startVertex: origin.vertex }
    const position = draft.lineMode === 'free' ? { mode: 'free' } : draft.lineMode === 'distance' ? { mode: 'distance', distanceMm: finite(draft.quantity), reverse: draft.positionReverse } : { mode: 'percent', percent: finite(draft.quantity), reverse: draft.positionReverse }
    return validateAssemblyMate({ ...base, ...validateAssemblyLinePathMateRequest({ point, path, position, orientation }) }) as AssemblyLinePathMate
  }
  const path = current(draft.circularPath, choices.circularPaths, validateAssemblyArcPathSelection, 'Selecciona un arco actual y su extremo material de origen.')
  const position = draft.circularMode === 'free' ? { mode: 'free', domain: draft.domain } : { mode: 'coordinate', distanceMm: finite(draft.quantity) }
  return validateAssemblyMate({ ...base, ...validateAssemblyCircularPathReferenceRequest({ point, path, position, orientation }) }) as AssemblyCircularPathMate
}
export default function ConfiguredAssemblyCompoundPanel(props: { draft: ConfiguredCompoundDraft; choices: ConfiguredCompoundUiChoices; disabled: boolean; onChange: (draft: ConfiguredCompoundDraft) => void; onPreview: () => void; onClose: () => void }) {
  const { draft, disabled, choices } = props
  const change = (patch: Partial<ConfiguredCompoundDraft>) => { if (!disabled) props.onChange({ ...draft, ...patch }) }
  let reason = ''; try { configuredCompoundUiProposal(draft, choices) } catch (error) { reason = error instanceof Error ? error.message : 'Completa las referencias actuales.' }
  const numeric = (label: string, field: 'offset' | 'quantity', minimum?: number, maximum?: number) => <label>{label}<input aria-label={label} type="number" step="any" min={minimum} max={maximum} disabled={disabled} value={draft[field]} onChange={event => change({ [field]: event.target.value })} /></label>
  const select = <T,>(label: string, value: T | null, list: readonly { key: string; label: string; reference: T }[], normalize: (value: unknown) => T, onSelect: (value: T | null) => void, extraDisabled = false) => {
    const matches = value === null ? [] : list.filter(row => same(row.reference, value, normalize)), found = matches.length === 1 ? matches[0] : null
    return <label>{label}<select aria-label={label} disabled={disabled || extraDisabled} value={found?.key ?? (value === null ? '' : 'retained')} onChange={event => { if (!disabled && !extraDisabled) { const row = list.find(row => row.key === event.target.value); onSelect(row ? structuredClone(row.reference) : null) } }}><option value="">Selecciona una referencia actual</option>{value !== null && !found && <option value="retained">Referencia guardada · pendiente de reselección</option>}{list.map(row => <option key={row.key} value={row.key} title={row.label}>{row.label}</option>)}</select></label>
  }
  const pathLabel = draft.type === 'line-path' ? 'LINE configurado' : 'circular configurado'
  return <section className="configured-mate-editor" role="region" aria-label="Editar relación compuesta del estado">
    <h3>{draft.editing ? 'Editar relación compuesta' : 'Nueva relación compuesta'}</h3><p>Las listas muestran referencias actuales. Su geometría e incidencia se verifican en la vista previa antes de aplicar.</p>
    <label>Tipo<select aria-label="Tipo de relación compuesta configurada" disabled={disabled || draft.editing} value={draft.type} onChange={event => change({ ...configuredCompoundUiDraft(draft.id), type: event.target.value as ConfiguredCompoundType, name: draft.name })}>{Object.entries(families).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Nombre<input aria-label="Nombre de relación compuesta configurada" disabled={disabled} value={draft.name} onChange={event => change({ name: event.target.value })} /></label>
    {draft.type === 'profile-center' ? <>
      <label>Familia de perfiles<select aria-label="Familia de perfiles configurada" disabled={disabled} value={draft.profileMode} onChange={event => change({ profileMode: event.target.value as ConfiguredCompoundDraft['profileMode'], profiles: [null, null] })}><option value="free">Círculos · giro libre</option><option value="rectangle">Rectángulos · eje material</option></select></label>
      {([0, 1] as const).map(slot => { const selected = draft.profiles[slot], edges = configuredCompoundProfileEdgesForFace(choices.profileEdges, selected?.face ?? null), edgeChoices = edges.map(row => ({ ...row, reference: { kind: 'edge' as const, component: selected!.face.component, body: selected!.face.body, edge: row.edge, support: 'line' as const } })), currentEdge = selected?.axis ? { kind: 'edge' as const, component: selected.face.component, body: selected.face.body, edge: selected.axis.edge, support: 'line' as const } : null
        return <fieldset key={slot}><legend>Perfil {slot + 1}</legend>{select(`Cara del perfil ${slot + 1} configurado`, selected?.face ?? null, choices.profileFaces, validateAssemblyProfileFaceSelection, face => { if (!disabled) props.onChange(configuredCompoundUiProfileFace(draft, slot, face)) })}
          {draft.profileMode === 'rectangle' && <>{select(`Arista material del perfil ${slot + 1} configurado`, currentEdge, edgeChoices, edgeReference, edge => { if (selected) { const profiles: ConfiguredCompoundDraft['profiles'] = [...draft.profiles]; profiles[slot] = { face: selected.face, axis: edge ? { edge: edge.edge, sense: selected.axis?.sense ?? 1 } : null }; change({ profiles }) } }, !selected)}
            <label>Sentido material<select aria-label={`Sentido material del perfil ${slot + 1} configurado`} disabled={disabled || !selected?.axis} value={selected?.axis?.sense ?? 1} onChange={event => { if (selected?.axis) { const profiles: ConfiguredCompoundDraft['profiles'] = [...draft.profiles]; profiles[slot] = { face: selected.face, axis: { ...selected.axis, sense: Number(event.target.value) as 1 | -1 } }; change({ profiles }) } }}><option value="1">+1 · parámetro LINE creciente</option><option value="-1">−1 · parámetro LINE decreciente</option></select></label></>}
        </fieldset>
      })}
      <label>Normales<select aria-label="Orientación de normales de perfiles configurada" disabled={disabled} value={draft.alignment} onChange={event => change({ alignment: event.target.value as ConfiguredCompoundDraft['alignment'] })}><option value="aligned">Alineadas</option><option value="opposed">Opuestas</option></select></label>
      {numeric('Desplazamiento de perfiles configurado en mm', 'offset')}
      {draft.profileMode === 'rectangle' && <label>Cuartos de vuelta<select aria-label="Cuartos de vuelta de perfiles configurados" disabled={disabled} value={draft.quarterTurns} onChange={event => change({ quarterTurns: Number(event.target.value) as 0 | 1 | 2 | 3 })}>{([0, 1, 2, 3] as const).map(q => <option key={q} value={q}>{q} · {q * 90}°</option>)}</select></label>}
    </> : <>
      {select(`Punto del trayecto ${pathLabel}`, draft.point, choices.points, validateAssemblyVertexReference, point => change({ point }))}
      {draft.type === 'line-path' ? <>{select('Arista del trayecto LINE configurado', draft.lineEdge, choices.lineEdges, edgeReference, edge => { if (!disabled) props.onChange(configuredCompoundUiLineEdge(draft, edge)) })}
        {select('Origen del trayecto LINE configurado', draft.lineOrigin && draft.lineEdge ? { kind: 'vertex' as const, component: draft.lineEdge.component, body: draft.lineEdge.body, vertex: draft.lineOrigin, support: 'point' as const } : null, configuredCompoundLineOrigins(choices.points, draft.lineEdge), validateAssemblyVertexReference, point => change({ lineOrigin: point?.vertex ?? null }), !draft.lineEdge)}
        <label>Posición<select aria-label="Modo del trayecto LINE configurado" disabled={disabled} value={draft.lineMode} onChange={event => change({ lineMode: event.target.value as ConfiguredCompoundDraft['lineMode'] })}><option value="free">Libre · prolongación LINE</option><option value="distance">Distancia</option><option value="percent">Porcentaje</option></select></label>
        {draft.lineMode !== 'free' && <>{numeric('Valor del trayecto LINE configurado', 'quantity', 0, draft.lineMode === 'percent' ? 100 : undefined)}<label><input aria-label="Invertir posición del trayecto LINE configurado" type="checkbox" disabled={disabled} checked={draft.positionReverse} onChange={event => change({ positionReverse: event.target.checked })} />Medir desde el otro extremo</label></>}
      </> : <>{select('Arco y origen del trayecto circular configurado', draft.circularPath, choices.circularPaths, validateAssemblyArcPathSelection, circularPath => change({ circularPath }))}
        <label>Posición<select aria-label="Modo del trayecto circular configurado" disabled={disabled} value={draft.circularMode} onChange={event => change({ circularMode: event.target.value as ConfiguredCompoundDraft['circularMode'] })}><option value="free">Libre</option><option value="coordinate">Distancia desde el origen</option></select></label>
        {draft.circularMode === 'free' ? <label>Dominio libre<select aria-label="Dominio del trayecto circular configurado" disabled={disabled} value={draft.domain} onChange={event => change({ domain: event.target.value as ConfiguredCompoundDraft['domain'] })}><option value="trim">Arco recortado</option><option value="support-circle">Circunferencia de soporte</option></select></label> : numeric('Valor del trayecto circular configurado', 'quantity', 0)}
      </>}
      <label>Orientación del componente del punto<select aria-label={`Orientación del trayecto ${pathLabel}`} disabled={disabled} value={draft.following ? 'follow' : 'free'} onChange={event => change({ following: event.target.value === 'follow' })}><option value="free">Libre</option><option value="follow">Alinear un eje local con el trayecto</option></select></label>
      {draft.following && <><label>Eje local<select aria-label={`Eje de orientación del trayecto ${pathLabel}`} disabled={disabled} value={draft.followAxis} onChange={event => change({ followAxis: event.target.value as ConfiguredCompoundDraft['followAxis'] })}>{(['x', 'y', 'z'] as const).map(axis => <option key={axis} value={axis}>{axis.toUpperCase()}</option>)}</select></label><label><input aria-label={`Invertir orientación del trayecto ${pathLabel}`} type="checkbox" disabled={disabled} checked={draft.followReverse} onChange={event => change({ followReverse: event.target.checked })} />Orientar el eje en sentido opuesto</label></>}
      <label>Giro alrededor del trayecto<select aria-label={`Giro del trayecto ${pathLabel}`} disabled={disabled} value={draft.upEnabled ? 'up' : 'free'} onChange={event => change({ upEnabled: event.target.value === 'up' })}><option value="free">Libre</option><option value="up">Vector UP · cara plana material</option></select></label>
      {draft.upEnabled && <>{select(`Guía UP del trayecto ${pathLabel}`, draft.guide, choices.guides, guideReference, guide => change({ guide }))}<label>Eje local UP<select aria-label={`Eje UP del trayecto ${pathLabel}`} disabled={disabled} value={draft.upAxis} onChange={event => change({ upAxis: event.target.value as ConfiguredCompoundDraft['upAxis'] })}>{(['x', 'y', 'z'] as const).map(axis => <option key={axis} value={axis}>{axis.toUpperCase()}</option>)}</select></label><label><input aria-label={`Invertir UP del trayecto ${pathLabel}`} type="checkbox" disabled={disabled} checked={draft.upReverse} onChange={event => change({ upReverse: event.target.checked })} />Orientar el eje UP en sentido opuesto</label></>}
    </>}
    {reason && <p role="status">{reason}</p>}<button disabled={disabled || !!reason} onClick={props.onPreview}>Vista previa de relación compuesta configurada</button><button disabled={disabled} onClick={props.onClose}>Cerrar edición de relación configurada</button>
  </section>
}
