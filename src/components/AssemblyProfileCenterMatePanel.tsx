import { useState } from 'react'
import type { AssemblyDocument, AssemblyProfileCenterMate } from '../model/assemblyDocument'
import { validateAssemblyProfileCenterReferenceRequest, type AssemblyProfileCenterReferenceRequest, type AssemblyProfileCenterSelection } from '../model/assemblyProfileCenterReferences'
import type { AssemblyProfileFaceSelection } from '../model/assemblyProfileReferences'
import type { EdgeReference } from '../cad/kernel.types'
import type { AssemblyProfileCenterSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'

export interface ProfileFaceChoice { key: string; label: string; reference: AssemblyProfileFaceSelection }
export interface ProfileEdgeChoice { key: string; label: string; faceOwner: AssemblyProfileFaceSelection; edge: EdgeReference }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function profileEdgesForFace(choices: readonly ProfileEdgeChoice[], face: AssemblyProfileFaceSelection | null) {
  return face ? choices.filter(choice => same(choice.faceOwner.component, face.component) && same(choice.faceOwner.body, face.body) && choice.edge.sourceFeatureId === face.face.sourceFeatureId) : []
}
/** Selection syntax only. Incidence, bounded shape and material direction require a fresh worker query. */
export function assemblyProfileCenterUiProposal(first: AssemblyProfileCenterSelection | null, second: AssemblyProfileCenterSelection | null, name: string, alignment: 'aligned' | 'opposed', offset: string, orientation: AssemblyProfileCenterReferenceRequest['orientation']) {
  if (!name.trim()) throw Error('Escribe un nombre para la relación.')
  if (!first || !second || !offset.trim()) throw Error('Completa ambos perfiles y el desplazamiento.')
  return { type: 'profile-center' as const, name: name.trim(), suppressed: false,
    ...validateAssemblyProfileCenterReferenceRequest({ first, second, alignment, offsetMm: Number(offset), orientation }) }
}
export default function AssemblyProfileCenterMatePanel(props: { mate?: AssemblyProfileCenterMate; faces: ProfileFaceChoice[]; edges: ProfileEdgeChoice[]; disabled: boolean; onPreview: (proposal: ReturnType<typeof assemblyProfileCenterUiProposal>) => void; onCancelEdit: () => void }) {
  const [name, setName] = useState(props.mate?.name ?? 'Centro de perfiles'), [mode, setMode] = useState<'free' | 'rectangle'>(props.mate?.orientation.mode ?? 'free')
  const [selections, setSelections] = useState<[AssemblyProfileCenterSelection | null, AssemblyProfileCenterSelection | null]>(props.mate ? structuredClone([props.mate.first, props.mate.second]) : [null, null])
  const [alignment, setAlignment] = useState<'aligned' | 'opposed'>(props.mate?.alignment ?? 'aligned'), [offset, setOffset] = useState(String(props.mate?.offsetMm ?? 0)), [quarterTurns, setQuarterTurns] = useState<0 | 1 | 2 | 3>(props.mate?.orientation.mode === 'rectangle' ? props.mate.orientation.quarterTurns : 0)
  const change = (slot: 0 | 1, value: AssemblyProfileCenterSelection | null) => setSelections(previous => { const next: typeof previous = [...previous]; next[slot] = value; return next })
  let proposal: ReturnType<typeof assemblyProfileCenterUiProposal> | null = null
  try { proposal = assemblyProfileCenterUiProposal(selections[0], selections[1], name, alignment, offset, mode === 'free' ? { mode } : { mode, quarterTurns }) } catch { /* Incomplete compound selections remain transient. */ }
  const current = selections.every(selection => selection && props.faces.some(choice => same(choice.reference, selection.face)) && (mode === 'free' || selection.axis && profileEdgesForFace(props.edges, selection.face).some(choice => same(choice.edge, selection.axis!.edge))))
  return <section className="assembly-profile-center-panel" role="region" aria-label="Centro de perfiles">
    <p>Elige caras circulares completas o dos rectángulos con una arista material explícita. El worker verifica los perfiles acotados; la lista no certifica su forma.</p>
    <label>Familia de perfiles<select aria-label="Familia de perfiles" disabled={props.disabled} value={mode} onChange={event => { setMode(event.target.value as typeof mode); setSelections([null, null]) }}><option value="free">Círculos · giro libre</option><option value="rectangle">Rectángulos · eje material</option></select></label>
    {([0, 1] as const).map(slot => { const selection = selections[slot], found = props.faces.find(choice => same(choice.reference, selection?.face)), edges = profileEdgesForFace(props.edges, selection?.face ?? null), edge = edges.find(choice => same(choice.edge, selection?.axis?.edge))
      return <fieldset key={slot}><legend>Perfil {slot + 1}</legend><label>Cara<select aria-label={`Cara del perfil ${slot + 1}`} disabled={props.disabled} value={found?.key ?? (selection ? 'retained' : '')} onChange={event => { const face = props.faces.find(choice => choice.key === event.target.value)?.reference; change(slot, face ? { face: structuredClone(face), axis: null } : null) }}><option value="">Selecciona una cara actual</option>{selection && !found && <option value="retained">Referencia guardada · pendiente de verificación</option>}{props.faces.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label>
        {mode === 'rectangle' && <><label>Arista material<select aria-label={`Arista material del perfil ${slot + 1}`} disabled={props.disabled || !found} value={edge?.key ?? ''} onChange={event => { const selected = edges.find(choice => choice.key === event.target.value); if (selection) change(slot, { face: selection.face, axis: selected ? { edge: structuredClone(selected.edge), sense: selection.axis?.sense ?? 1 } : null }) }}><option value="">Selecciona una arista LINE actual</option>{edges.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label><label>Sentido de parámetro<select aria-label={`Sentido material del perfil ${slot + 1}`} disabled={props.disabled || !selection?.axis} value={selection?.axis?.sense ?? 1} onChange={event => { if (selection?.axis) change(slot, { face: selection.face, axis: { ...selection.axis, sense: Number(event.target.value) as 1 | -1 } }) }}><option value="1">+1 · parámetro LINE creciente</option><option value="-1">−1 · parámetro LINE decreciente</option></select></label></>}
      </fieldset>
    })}
    <label>Nombre<input aria-label="Nombre de centro de perfiles" value={name} disabled={props.disabled} onChange={event => setName(event.target.value)} /></label>
    <label>Normales<select aria-label="Orientación de normales de perfiles" value={alignment} disabled={props.disabled} onChange={event => setAlignment(event.target.value as typeof alignment)}><option value="aligned">Alineadas</option><option value="opposed">Opuestas</option></select></label>
    <label>Desplazamiento · mm<input aria-label="Desplazamiento de centro de perfiles" type="number" value={offset} disabled={props.disabled} onChange={event => setOffset(event.target.value)} /></label>
    {mode === 'rectangle' && <label>Cuartos de vuelta<select aria-label="Cuartos de vuelta de perfiles" value={quarterTurns} disabled={props.disabled} onChange={event => setQuarterTurns(Number(event.target.value) as typeof quarterTurns)}>{([0, 1, 2, 3] as const).map(value => <option key={value} value={value}>{value} · {value * 90}°</option>)}</select></label>}
    <button disabled={props.disabled || !proposal || !current} onClick={() => { if (proposal && current && !props.disabled) props.onPreview(proposal) }}>{props.mate ? 'Vista previa de la edición de centro de perfiles' : 'Vista previa de centro de perfiles'}</button>
    {props.mate && <button disabled={props.disabled} onClick={props.onCancelEdit}>Cancelar edición de centro de perfiles</button>}
  </section>
}

/** Display consistency only; neither the DTO nor this summary grants Apply. */
export function assemblyProfileCenterUiReports(document: AssemblyDocument, reports: readonly AssemblyProfileCenterSupportReport[]) {
  const seen = new Set<string>(), result: AssemblyProfileCenterSupportReport[] = []
  for (const report of reports) {
    const mate = assemblyTangentReportContext(document, report)?.mate, key = JSON.stringify([report.scopePath, report.mateId])
    if (!mate || mate.type !== 'profile-center' || report.kind !== 'profile-center' || report.satisfied !== true || report.boundedProfiles !== true || report.verificationOnly !== true || seen.has(key)
      || !same(report.componentPaths, { first: [...report.scopePath, ...mate.first.face.component.occurrencePath], second: [...report.scopePath, ...mate.second.face.component.occurrencePath] })
      || report.alignment !== mate.alignment || report.offsetMm !== mate.offsetMm || !same(report.orientation, mate.orientation)
      || ![report.positionResidualMm, report.normalAngleRadians, report.lengthTolerance, report.angleTolerance].every(Number.isFinite)
      || report.lengthTolerance <= 0 || report.angleTolerance <= 0 || report.positionResidualMm < 0 || report.positionResidualMm > report.lengthTolerance || report.normalAngleRadians < 0 || report.normalAngleRadians > report.angleTolerance
      || (mate.orientation.mode === 'rectangle' ? report.profileKinds.first !== 'rectangle' || report.profileKinds.second !== 'rectangle' || report.rectangleAngleRadians === null || !Number.isFinite(report.rectangleAngleRadians) || report.rectangleAngleRadians < 0 || report.rectangleAngleRadians > report.angleTolerance : report.profileKinds.first !== 'circle' || report.profileKinds.second !== 'circle' || report.rectangleAngleRadians !== null)) return []
    seen.add(key); result.push(structuredClone(report))
  }
  return result
}
export function AssemblyProfileCenterSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyProfileCenterSupportReport[] }) {
  const rows = assemblyProfileCenterUiReports(document, reports)
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Centro de perfiles verificado"><strong>Centro de perfiles · geometría acotada actual</strong>{rows.map(row => <p key={JSON.stringify([row.scopePath, row.mateId])}>{assemblyTangentReportContext(document, row)!.mate.name} · residuo de posición {row.positionResidualMm.toPrecision(6)} mm · normales {row.normalAngleRadians.toPrecision(6)} rad{row.rectangleAngleRadians !== null && <> · eje material {row.rectangleAngleRadians.toPrecision(6)} rad</>}</p>)}<p>Verificación de la relación; no comprueba interferencias ni contacto entre sólidos.</p></section>
}
