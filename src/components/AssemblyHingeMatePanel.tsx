import { validateAssemblyGeometryReference, type AssemblyDocument } from '../model/assemblyDocument'
import { validateAssemblyHingeReferenceRequest, type AssemblyHingeReferenceRequest } from '../model/assemblyHingeReferences'
import { validateAssemblyLimitedHingeReferenceRequest } from '../model/assemblyLimitedHingeReferences'
import { evaluateAssemblyDirectedAngleArc } from '../model/assemblyLimitDirectedAngle'
import type { AssemblyHingeSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'

export type HingeUiReference = AssemblyHingeReferenceRequest['axis'][number] | AssemblyHingeReferenceRequest['axial'][number]
type Role = HingeUiReference | null
export type HingeUiReferences = [Role, Role, Role, Role] | [Role, Role, Role, Role, Role, Role]
export type HingeUiSlot = 0 | 1 | 2 | 3 | 4 | 5
export interface HingeUiStops { start: string; sweep: string }
export interface HingeUiChoice { key: string; label: string; reference: HingeUiReference }
export const HINGE_ROLE_LABELS = ['Eje A de bisagra', 'Eje B de bisagra', 'Plano axial A de bisagra', 'Plano axial B de bisagra', 'Plano angular A de bisagra', 'Plano angular B de bisagra'] as const
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function exactData(value: unknown, names: string[]): boolean {
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false
  const keys=Reflect.ownKeys(value)
  return keys.length===names.length&&keys.every(key=>{const d=Object.getOwnPropertyDescriptor(value,key)!;return typeof key==='string'&&names.includes(key)&&d.enumerable&&'value'in d})
}
/** Full saved identity after strict normalization; object field order is not identity. */
export function sameHingeReference(a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b
  try { return same(validateAssemblyGeometryReference(a), validateAssemblyGeometryReference(b)) } catch { return false }
}

export function assemblyHingeUiProposal(references: HingeUiReferences, name: string, alignment: 'aligned' | 'opposed' | '', stops: HingeUiStops | null = null) {
  if (!name.trim()) throw Error('Escribe un nombre para la bisagra.')
  if (references.length !== (stops ? 6 : 4) || references.some(r => r === null)) throw Error('Selecciona todas las referencias de la bisagra.')
  let limited
  if (stops) {
    if (Reflect.ownKeys(stops).length !== 2 || !['start','sweep'].every(k => { const d = Object.getOwnPropertyDescriptor(stops,k); return d?.enumerable && 'value' in d && typeof d.value === 'string' && d.value.trim().length > 0 })) throw Error('Escribe el inicio y el recorrido angular en grados.')
    limited = validateAssemblyLimitedHingeReferenceRequest({ axis: references.slice(0,2), axial: references.slice(2,4), alignment,
      stops: { coordinate:'directed-about-axis', angular:references.slice(4), arc:{start:Number(stops.start),sweep:Number(stops.sweep)} } }).stops
  }
  return { type: 'hinge' as const, name: name.trim(), suppressed: false,
    ...validateAssemblyHingeReferenceRequest({ axis: references.slice(0, 2), axial: references.slice(2,4), alignment }), ...(limited ? {stops:limited}: {}) }
}

export function AssemblyHingeMatePanel(props: {
  references: HingeUiReferences; axes: HingeUiChoice[]; planes: HingeUiChoice[]; name: string;
  alignment: 'aligned' | 'opposed' | ''; editing: boolean; disabled: boolean;
  picking: { slot: HingeUiSlot; producer: 'face' | 'line-edge' } | null;
  onReference: (slot: HingeUiSlot, ref: HingeUiReference | null) => void;
  onPick: (slot: HingeUiSlot, producer: 'face' | 'line-edge') => void;
  onName: (value: string) => void; onAlignment: (value: 'aligned' | 'opposed' | '') => void;
  onPreview: () => void; onCancelEdit: () => void;
  limited?: boolean; start?: string; sweep?: string; onLimited?: (value:boolean)=>void; onStart?: (value:string)=>void; onSweep?: (value:string)=>void;
}) {
  const limited = props.limited ?? false
  const choices = (slot: HingeUiSlot) => slot < 2 ? props.axes : slot < 4 ? props.planes : props.planes.filter(c=>c.reference.kind==='face'&&c.reference.support==='plane')
  let valid = false; try { assemblyHingeUiProposal(props.references,props.name,props.alignment,limited?{start:props.start??'',sweep:props.sweep??''}:null); valid=true } catch { /* Incomplete explicit intent stays editable. */ }
  const current = valid && props.references.every((r, i) => r && choices(i as HingeUiSlot).filter(c => sameHingeReference(c.reference, r)).length === 1)
  return <section className="assembly-hinge-panel" role="region" aria-label="Bisagra">
    <p>Elige dos ejes y un plano axial de cada lado. Los planos axiales deben ser perpendiculares a sus ejes.{limited?' Los planos angulares definen el giro dirigido alrededor del eje A.':' El giro queda libre.'}</p>
    <label><input type="checkbox" aria-label="Limitar giro de bisagra" checked={limited} disabled={props.disabled} onChange={e=>props.onLimited?.(e.target.checked)} />Limitar giro de bisagra</label>
    {props.picking && <p role="status">Selecciona {props.picking.producer === 'line-edge' ? 'una arista recta' : props.picking.slot < 2 ? 'una cara cilíndrica' : 'una cara plana'} para {HINGE_ROLE_LABELS[props.picking.slot]}.</p>}
    {((limited?[0,1,2,3,4,5]:[0,1,2,3]) as HingeUiSlot[]).map(slot => {
      const selected = props.references[slot], list = choices(slot), found = list.find(c => sameHingeReference(c.reference, selected))
      return <div className="assembly-hinge-role" key={slot}>
        <label>{HINGE_ROLE_LABELS[slot]}<select aria-label={HINGE_ROLE_LABELS[slot]} disabled={props.disabled}
          title={found?.label ?? (selected ? 'Referencia guardada · pendiente de reselección' : undefined)}
          value={found?.key ?? (selected ? 'retained' : '')} onChange={event => props.onReference(slot, list.find(c => c.key === event.target.value)?.reference ?? null)}>
          <option value="">{slot < 2 ? 'Selecciona un eje actual' : 'Selecciona un plano actual'}</option>
          {selected && !found && <option value="retained">Referencia guardada · pendiente de reselección</option>}
          {list.map(c => <option key={c.key} value={c.key} title={c.label}>{c.label}</option>)}
        </select></label>
        <button type="button" aria-label={`Seleccionar ${HINGE_ROLE_LABELS[slot]} en el modelo`}
          aria-pressed={props.picking?.slot === slot && props.picking.producer === 'face'} disabled={props.disabled}
          onClick={() => props.onPick(slot, 'face')}>Seleccionar cara</button>
        {slot < 2 && <button type="button" aria-label={`Seleccionar arista para ${HINGE_ROLE_LABELS[slot]}`}
          aria-pressed={props.picking?.slot === slot && props.picking.producer === 'line-edge'} disabled={props.disabled}
          onClick={() => props.onPick(slot, 'line-edge')}>Seleccionar arista recta</button>}
      </div>
    })}
    {limited&&<><label>Inicio angular (grados)<input type="number" aria-label="Inicio angular de bisagra en grados" min="0" max="360" step="any" value={props.start??''} disabled={props.disabled} onChange={e=>props.onStart?.(e.target.value)} /></label>
      <label>Recorrido angular (grados)<input type="number" aria-label="Recorrido angular de bisagra en grados" min="0" max="360" step="any" value={props.sweep??''} disabled={props.disabled} onChange={e=>props.onSweep?.(e.target.value)} /></label><p>Inicio: 0 ≤ valor &lt; 360°. Recorrido: 0 a 360°. No se capturan un cero ni vueltas acumuladas.</p></>}
    <label>Nombre<input aria-label="Nombre de bisagra" value={props.name} disabled={props.disabled} onChange={e => props.onName(e.target.value)} /></label>
    <label>Alineación de ejes<select aria-label="Alineación de ejes de bisagra" value={props.alignment} disabled={props.disabled}
      onChange={e => props.onAlignment(e.target.value as typeof props.alignment)}><option value="">Elige alineación</option><option value="aligned">Alineados</option><option value="opposed">Opuestos</option></select></label>
    <button disabled={props.disabled || !current || !props.alignment || !props.name.trim()} onClick={props.onPreview}>{props.editing ? 'Verificar edición de bisagra' : 'Añadir bisagra'}</button>
    {props.editing && <button disabled={props.disabled} onClick={props.onCancelEdit}>Cancelar edición de bisagra</button>}
  </section>
}

/** Display consistency only. Reports never grant document or Apply authority. */
export function assemblyHingeUiReports(document: AssemblyDocument, reports: readonly AssemblyHingeSupportReport[]) {
  const result: AssemblyHingeSupportReport[] = [], seen = new Set<string>()
  for (const r of reports) {
    const mate = assemblyTangentReportContext(document, r)?.mate, key = JSON.stringify([r.scopePath, r.mateId])
    if (!mate || mate.type !== 'hinge' || seen.has(key) || r.kind !== 'hinge' || r.status !== 'ok' || r.satisfied !== true
      || r.supportOnly !== true || r.qualifiedRotation !== true || r.alignment !== mate.alignment) return []
    const paths = { axis: mate.axis.map(ref => [...r.scopePath, ...ref.component.occurrencePath]),
      axial: mate.axial.map(ref => [...r.scopePath, ...(ref.component?.occurrencePath ?? [])]) }
    if (!same(r.componentPaths, paths) || ![r.axisAngleRad, r.transverseResidualMm, r.axialOffsetMm, r.lengthToleranceMm,
      r.angleToleranceRad, r.precision?.positionMm, r.precision?.directionRad, ...(r.axialityRad ?? [])].every(Number.isFinite)
      || r.axialityRad?.length !== 2 || r.axialityRad.some(a => a < 0 || a > 1e-12)
      || r.axisAngleRad < 0 || r.axisAngleRad > Math.PI || r.transverseResidualMm < 0
      || r.lengthToleranceMm <= 0 || r.angleToleranceRad <= 0 || r.angleToleranceRad >= Math.PI / 2
      || r.precision.positionMm < 0 || r.precision.directionRad < 0
      || r.axisAngleRad + r.precision.directionRad > r.angleToleranceRad
      || Math.max(r.transverseResidualMm, Math.abs(r.axialOffsetMm)) + r.precision.positionMm > r.lengthToleranceMm) return []
    if (Object.hasOwn(mate,'stops') !== Object.hasOwn(r,'stops') || Object.hasOwn(r,'stops')&&(!mate.stops||!r.stops)) return []
    if (mate.stops && r.stops) {
      const s = r.stops
      if (!exactData(s,['coordinate','componentPaths','arcDegrees','angleRadians','projectionLengths','marginsRadians','activity','fullCircle','directionErrorRad'])
        || !exactData(s.arcDegrees,['start','sweep']) || !exactData(s.projectionLengths,['first','second']) || !exactData(s.marginsRadians,['minimum','maximum'])
        || s.coordinate !== mate.stops.coordinate || s.arcDegrees.start!==mate.stops.arc.start || s.arcDegrees.sweep!==mate.stops.arc.sweep
        || !same(s.componentPaths,mate.stops.angular.map(ref=>[...r.scopePath,...ref.component.occurrencePath]))
        || ![s.angleRadians,s.directionErrorRad,s.projectionLengths.first,s.projectionLengths.second,s.marginsRadians.minimum,s.marginsRadians.maximum].every(Number.isFinite)
        || s.angleRadians<0 || s.angleRadians>=2*Math.PI || s.directionErrorRad<0
        || s.projectionLengths.first<=0 || s.projectionLengths.second<=0 || s.projectionLengths.first>1+1e-12 || s.projectionLengths.second>1+1e-12
        || Math.max(0,-s.marginsRadians.minimum,-s.marginsRadians.maximum)+s.directionErrorRad>r.angleToleranceRad) return []
      try {
        const expected=evaluateAssemblyDirectedAngleArc(s.angleRadians,mate.stops.arc,r.angleToleranceRad)
        if(s.fullCircle!==expected.fullCircle || s.activity!==expected.activity || Math.abs(s.marginsRadians.minimum-expected.marginsRadians.minimum)>r.angleToleranceRad || Math.abs(s.marginsRadians.maximum-expected.marginsRadians.maximum)>r.angleToleranceRad)return []
      } catch { return [] }
    }
    seen.add(key); result.push(structuredClone(r))
  }
  return result
}
export function AssemblyHingeSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyHingeSupportReport[] }) {
  const rows = assemblyHingeUiReports(document, reports), number = (n: number) => String(Number(n.toPrecision(6)))
  if (!rows.length) return null
  return <section className="assembly-solve-summary" role="region" aria-label="Bisagra verificada"><strong>Bisagra · soportes actuales</strong>
    {rows.map(r => <p key={JSON.stringify([r.scopePath, r.mateId])}><strong>{assemblyTangentReportContext(document, r)!.mate.name}</strong> · desviación de ejes {number(r.axisAngleRad)} rad · separación transversal {number(r.transverseResidualMm)} mm · separación axial {number(r.axialOffsetMm)} mm.{r.stops&&<> Giro dirigido {number(r.stops.angleRadians)} rad · inicio {r.stops.arcDegrees.start}° · recorrido {r.stops.arcDegrees.sweep}° · incertidumbre {number(r.stops.directionErrorRad)} rad.</>}</p>)}
    <p>Comprobación de soportes infinitos e intervalos declarados. No comprueba contacto, interferencias ni trayectoria continua.</p>
  </section>
}
