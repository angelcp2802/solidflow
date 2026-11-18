import type { AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyWidthCenteredSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'
import { validateAssemblyPlaneReference, type AssemblyPlaneReference } from '../model/assemblyDocument'
import type { NewAssemblyMate } from '../model/assemblyEditing'
export type WidthUiReferences = [AssemblyPlaneReference | null, AssemblyPlaneReference | null, AssemblyPlaneReference | null, AssemblyPlaneReference | null]
export type WidthUiSlot = 0 | 1 | 2 | 3
export type WidthUiBranch = 'sum' | 'difference'
export const WIDTH_ROLE_LABELS = ['Anchura · plano 1', 'Anchura · plano 2', 'Pestaña · plano 1', 'Pestaña · plano 2'] as const
export function assemblyWidthUiProposal(references: WidthUiReferences, name: string, widthBranch: WidthUiBranch | '', tabBranch: WidthUiBranch | '', alignment: 'aligned' | 'opposed' | ''): Extract<NewAssemblyMate, { type: 'width' }> {
  if (!name.trim()) throw new Error('Escribe un nombre para la relación.')
  if ((widthBranch !== 'sum' && widthBranch !== 'difference') || (tabBranch !== 'sum' && tabBranch !== 'difference') || (alignment !== 'aligned' && alignment !== 'opposed')) throw new Error('Elige ambas bisectrices y su orientación.')
  if (references.length !== 4 || references.some(reference => !reference)) throw new Error('Selecciona los cuatro planos originales.')
  const refs = references.map(reference => structuredClone(validateAssemblyPlaneReference(reference)))
  return { name: name.trim(), suppressed: false, type: 'width', mode: 'centered', width: [refs[0], refs[1]], tab: [refs[2], refs[3]], widthBranch, tabBranch, alignment }
}
export interface WidthPlaneChoice { key: string; label: string; reference: AssemblyPlaneReference }
export function AssemblyWidthMatePanel(props: { references: WidthUiReferences; choices: WidthPlaneChoice[]; name: string; widthBranch: WidthUiBranch | ''; tabBranch: WidthUiBranch | ''; alignment: 'aligned' | 'opposed' | ''; editing: boolean; disabled: boolean; pickingIndex: WidthUiSlot | null; onPick: (slot: WidthUiSlot) => void; onReference: (index: number, reference: AssemblyPlaneReference | null) => void; onName: (value: string) => void; onWidthBranch: (value: WidthUiBranch | '') => void; onTabBranch: (value: WidthUiBranch | '') => void; onAlignment: (value: 'aligned' | 'opposed' | '') => void; onPreview: () => void; onCancelEdit: () => void }) {
  const branch = (label: string, value: WidthUiBranch | '', change: (value: WidthUiBranch | '') => void) => <label>{label}<select aria-label={label} disabled={props.disabled} value={value} onChange={event => change(event.target.value as WidthUiBranch | '')}><option value="">Elige una bisectriz</option><option value="sum">Bisectriz 1</option><option value="difference">Bisectriz 2</option></select></label>
  return <div className="assembly-width-panel"><p>Selecciona dos planos de anchura y dos planos de pestaña.</p>{props.pickingIndex !== null && <p role="status">Selecciona una cara plana para {WIDTH_ROLE_LABELS[props.pickingIndex]}</p>}{([0, 1, 2, 3] as const).map(index => {
    const label = WIDTH_ROLE_LABELS[index]
    const reference=props.references[index], found=props.choices.find(choice => JSON.stringify(choice.reference)===JSON.stringify(reference)), value=found?.key ?? (reference ? 'retained' : '')
    return <div className="assembly-width-role" key={label}><label>{label}<select aria-label={label} disabled={props.disabled} value={value} onChange={event => props.onReference(index, props.choices.find(choice => choice.key===event.target.value)?.reference ?? null)}><option value="">Selecciona un plano</option>{reference && !found && <option value="retained">Referencia guardada · pendiente de verificación</option>}{props.choices.map(choice => <option key={choice.key} value={choice.key}>{choice.label}</option>)}</select></label><button type="button" aria-label={`Seleccionar ${label} en el modelo`} aria-pressed={props.pickingIndex === index} disabled={props.disabled} onClick={() => props.onPick(index)}>Seleccionar en el modelo</button></div>
  })}<label>Nombre<input aria-label="Nombre de anchura" value={props.name} disabled={props.disabled} onChange={event=>props.onName(event.target.value)} /></label>{branch('Bisectriz de anchura',props.widthBranch,props.onWidthBranch)}{branch('Bisectriz de pestaña',props.tabBranch,props.onTabBranch)}<label>Orientación de bisectrices<select aria-label="Orientación de bisectrices" disabled={props.disabled} value={props.alignment} onChange={event=>props.onAlignment(event.target.value as 'aligned'|'opposed'|'')}><option value="">Elige orientación</option><option value="aligned">Alineadas</option><option value="opposed">Opuestas</option></select></label><button disabled={props.disabled || props.references.some(value=>!value) || !props.widthBranch || !props.tabBranch || !props.alignment || !props.name.trim()} onClick={props.onPreview}>{props.editing ? 'Vista previa de la edición de anchura' : 'Vista previa de anchura centrada'}</button>{props.editing && <button disabled={props.disabled} onClick={props.onCancelEdit}>Cancelar edición de anchura</button>}</div>
}

/** Display consistency only. Preview authority and freshness remain with the workspace/worker. */
export function assemblyWidthUiReports(document: AssemblyDocument, reports: readonly AssemblyWidthCenteredSupportReport[]): AssemblyWidthCenteredSupportReport[] {
  const result: AssemblyWidthCenteredSupportReport[]=[], seen=new Set<string>()
  for(const report of reports) {
    const mate=assemblyTangentReportContext(document,report)?.mate, key=JSON.stringify([report.scopePath,report.mateId])
    if(!mate || mate.type!=='width' || mate.mode!=='centered' || report.kind!=='width' || report.mode!=='centered' || report.supportOnly!==true || seen.has(key)
      || report.widthBranch!==mate.widthBranch || report.tabBranch!==mate.tabBranch || report.alignment!==mate.alignment
      || ![report.angleRadians,report.offsetMm,report.lengthTolerance,report.angleTolerance,report.branchLengths?.width,report.branchLengths?.tab].every(Number.isFinite)
      || report.angleRadians<0 || report.angleRadians>Math.PI || report.lengthTolerance<=0 || report.angleTolerance<=0
      || report.angleRadians>report.angleTolerance || Math.abs(report.offsetMm)>report.lengthTolerance || report.branchLengths.width<=0 || report.branchLengths.tab<=0) return []
    seen.add(key);result.push(structuredClone(report))
  }
  return result
}
export function AssemblyWidthSupportSummary({document,reports}:{document:AssemblyDocument;reports:readonly AssemblyWidthCenteredSupportReport[]}) {
  const rows=assemblyWidthUiReports(document,reports)
  if(!rows.length)return null
  const number=(value:number)=>String(Number(value.toPrecision(6)))
  return <section className="assembly-solve-summary" role="region" aria-label="Anchura centrada verificada"><strong>Anchura centrada · cuatro planos</strong>{rows.map(report=>{
    const context=assemblyTangentReportContext(document,report)!
    return <p key={JSON.stringify([report.scopePath,report.mateId])}><strong>{context.mate.name}</strong> · {context.scopeLabel} · desviación angular {number(report.angleRadians*180/Math.PI)}° · desplazamiento {number(report.offsetMm)} mm · bisectrices {report.alignment==='aligned'?'alineadas':'opuestas'}.</p>
  })}<p>Comprobación de planos infinitos; no comprueba los recortes de las caras, interferencias ni contacto entre las piezas.</p></section>
}
