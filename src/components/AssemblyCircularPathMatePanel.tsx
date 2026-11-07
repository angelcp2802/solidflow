import { useState } from 'react'
import type { AssemblyCircularPathSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'
import { validateAssemblyPlaneReference, validateAssemblyVertexReference, type AssemblyDocument, type AssemblyFaceReference, type AssemblyCircularPathMate, type AssemblyVertexReference } from '../model/assemblyDocument'
import { validateAssemblyLinePathOrientation, type AssemblyLinePathOrientation } from '../model/assemblyLinePathMate'
import { validateAssemblyCircularPathReferenceRequest } from '../model/assemblyCircularPathReferences'
import type { RigidCircularPathPosition as AssemblyCircularPathPosition } from '../model/assemblySolveTypes'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection as AssemblyCircularPathSelection } from '../model/assemblyArcPathReferences'


export interface LinePathPointChoice { key: string; label: string; reference: AssemblyVertexReference }
export type LinePathGuideReference = AssemblyFaceReference & { support: 'plane' }
export interface LinePathGuideChoice { key: string; label: string; reference: LinePathGuideReference }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function sameCircularPathPoint(a:unknown,b:unknown):boolean{try{return same(validateAssemblyVertexReference(a),validateAssemblyVertexReference(b))}catch{return false}}
export function sameCircularPathSelection(a:unknown,b:unknown):boolean{try{return same(validateAssemblyArcPathSelection(a),validateAssemblyArcPathSelection(b))}catch{return false}}
/** Syntax identity only; parser normalization preserves every locator field. */
export function sameLinePathGuide(first: unknown, second: unknown): boolean {
  try {
    const a = validateAssemblyPlaneReference(first), b = validateAssemblyPlaneReference(second)
    return a.kind === 'face' && b.kind === 'face' && same(a, b)
  } catch { return false }
}
export interface CircularPathChoice { key:string;label:string;reference:AssemblyCircularPathSelection }
export function assemblyCircularPathUiProposal(point: AssemblyVertexReference | null, path: AssemblyCircularPathSelection | null, name: string, mode: AssemblyCircularPathPosition['mode'], domain:'trim'|'support-circle', quantity: string, orientation: AssemblyLinePathOrientation = { pitchYaw: 'free', roll: 'free' }) {
 if (!name.trim() || !point || !path || mode !== 'free' && !quantity.trim()) throw Error('Completa el punto, el arco, su origen material y el valor.')
 const position: AssemblyCircularPathPosition = mode === 'free' ? { mode,domain } : {mode,distanceMm:Number(quantity)}
 return {type:'circular-path' as const,name:name.trim(),suppressed:false,...validateAssemblyCircularPathReferenceRequest({point,path,position,orientation})}
}
export default function AssemblyCircularPathMatePanel(props: { mate?: AssemblyCircularPathMate; points: LinePathPointChoice[]; paths: CircularPathChoice[]; guides?: LinePathGuideChoice[]; disabled: boolean; onPreview: (proposal: ReturnType<typeof assemblyCircularPathUiProposal>) => void; onCancelEdit: () => void }) {
  const [name, setName] = useState(props.mate?.name ?? 'Punto sobre trayecto circular'), [point, setPoint] = useState<AssemblyVertexReference | null>(props.mate ? structuredClone(props.mate.point) : null)
 const [path,setPath]=useState<AssemblyCircularPathSelection|null>(props.mate?structuredClone(props.mate.path):null),[mode,setMode]=useState<AssemblyCircularPathPosition['mode']>(props.mate?.position.mode??'free')
 const [domain,setDomain]=useState<'trim'|'support-circle'>(props.mate?.position.mode==='free'?props.mate.position.domain:'trim'),[quantity,setQuantity]=useState(String(props.mate?.position.mode==='coordinate'?props.mate.position.distanceMm:0))
  const savedFollow = props.mate?.orientation.pitchYaw
  const [following, setFollowing] = useState(!!savedFollow && savedFollow !== 'free'), [followAxis, setFollowAxis] = useState<'x' | 'y' | 'z'>(savedFollow && savedFollow !== 'free' ? savedFollow.axis : 'x'), [followReverse, setFollowReverse] = useState(savedFollow && savedFollow !== 'free' ? savedFollow.reverse : false)
  const savedRoll = props.mate?.orientation.roll
  const [upEnabled, setUpEnabled] = useState(!!savedRoll && savedRoll !== 'free'), [upAxis, setUpAxis] = useState<'x' | 'y' | 'z'>(savedRoll && savedRoll !== 'free' ? savedRoll.axis : 'y'), [upReverse, setUpReverse] = useState(savedRoll && savedRoll !== 'free' ? savedRoll.reverse : false)
  const [guide, setGuide] = useState<LinePathGuideReference | null>(savedRoll && savedRoll !== 'free' ? structuredClone(savedRoll.guide) : null)
  const guides = props.guides ?? [], currentGuide = guides.find(choice => sameLinePathGuide(choice.reference, guide))
  const upError = upEnabled && !following ? 'Vector UP necesita alinear primero un eje con el trayecto.' : upEnabled && upAxis === followAxis ? 'El eje UP y el eje del trayecto deben ser diferentes. Elige explícitamente otro eje.' : upEnabled && !currentGuide ? 'Elige una cara plana material disponible como guía UP.' : null
 const currentPoint=props.points.find(p=>sameCircularPathPoint(p.reference,point)),currentPath=props.paths.find(p=>sameCircularPathSelection(p.reference,path))
 let proposal:ReturnType<typeof assemblyCircularPathUiProposal>|null=null
 try{proposal=assemblyCircularPathUiProposal(point,path,name,mode,domain,quantity,validateAssemblyLinePathOrientation({pitchYaw:following?{mode:'follow',axis:followAxis,reverse:followReverse}:'free',roll:upEnabled&&guide?{mode:'up',axis:upAxis,reverse:upReverse,guide}:'free'}))}catch{/* Incomplete drafts confer no authority. */}
 const current=!!currentPoint&&!!currentPath&&!upError
  return <section className="assembly-line-path-panel assembly-circular-path-panel" role="region" aria-label="Punto sobre trayecto circular">
    <p>Elige un punto material, un arco y explícitamente uno de sus vértices de origen. La incidencia se comprueba en la vista previa; la lista no la certifica. El giro alrededor del trayecto permanece libre o usa una guía UP plana material explícita.</p>
    <label>Punto material<select aria-label="Punto del trayecto circular" disabled={props.disabled} value={currentPoint?.key ?? ''} onChange={e => setPoint(structuredClone(props.points.find(p => p.key === e.target.value)?.reference ?? null))}><option value="">Selecciona un vértice actual</option>{props.points.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
 <label>Arco y origen material<select aria-label="Arco y origen del trayecto circular" disabled={props.disabled} value={currentPath?.key??''} onChange={e=>setPath(structuredClone(props.paths.find(p=>p.key===e.target.value)?.reference??null))}><option value="">Selecciona un arco y su extremo de origen</option>{props.paths.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
    {props.mate && !current && <p>Referencia guardada pendiente de elección actual y verificación.</p>}
    <label>Nombre<input aria-label="Nombre del trayecto circular" disabled={props.disabled} value={name} onChange={e => setName(e.target.value)} /></label>
 <label>Posición<select aria-label="Modo del trayecto circular" disabled={props.disabled} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="free">Libre</option><option value="coordinate">Distancia desde el origen</option></select></label>
 {mode==='free'?<label>Dominio libre<select aria-label="Dominio del trayecto circular" disabled={props.disabled} value={domain} onChange={e=>setDomain(e.target.value as typeof domain)}><option value="trim">Arco recortado</option><option value="support-circle">Circunferencia de soporte</option></select></label>:<label>Distancia · mm<input aria-label="Valor del trayecto circular" type="number" min={0} disabled={props.disabled} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>}
 <p>El dominio libre es una elección explícita de SolidFlow. La distancia se mide desde el extremo elegido y permanece dentro del arco.</p>
    <label>Orientación del componente del punto<select aria-label="Orientación del trayecto circular" disabled={props.disabled} value={following ? 'follow' : 'free'} onChange={e => setFollowing(e.target.value === 'follow')}><option value="free">Libre</option><option value="follow">Alinear un eje local con el trayecto</option></select></label>
    {following && <><label>Eje local del componente del punto<select aria-label="Eje de orientación del trayecto circular" disabled={props.disabled} value={followAxis} onChange={e => setFollowAxis(e.target.value as typeof followAxis)}>{(['x', 'y', 'z'] as const).map(axis => <option key={axis} value={axis}>{axis.toUpperCase()}</option>)}</select></label><label><input type="checkbox" aria-label="Invertir orientación del trayecto circular" disabled={props.disabled} checked={followReverse} onChange={e => setFollowReverse(e.target.checked)} />Orientar el eje en sentido opuesto</label></>}
    <label>Giro alrededor del trayecto<select aria-label="Giro del trayecto circular" disabled={props.disabled} value={upEnabled ? 'up' : 'free'} onChange={e => setUpEnabled(e.target.value === 'up')}><option value="free">Libre</option><option value="up">Vector UP · cara plana material</option></select></label>
    {upEnabled && <><label>Guía UP<select aria-label="Guía UP del trayecto circular" disabled={props.disabled} value={currentGuide?.key ?? ''} onChange={e => setGuide(structuredClone(guides.find(p => p.key === e.target.value)?.reference ?? null))}><option value="">Selecciona una cara plana actual</option>{guides.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
      <label>Eje local UP del componente del punto<select aria-label="Eje UP del trayecto circular" disabled={props.disabled} value={upAxis} onChange={e => setUpAxis(e.target.value as typeof upAxis)}>{(['x', 'y', 'z'] as const).map(axis => <option key={axis} value={axis}>{axis.toUpperCase()}</option>)}</select></label>
      <label><input aria-label="Invertir UP del trayecto circular" type="checkbox" disabled={props.disabled} checked={upReverse} onChange={e => setUpReverse(e.target.checked)} />Orientar el eje UP en sentido opuesto</label>
      <p>La guía aporta su normal proyectada perpendicularmente al trayecto. No se puede usar una proyección nula o insuficientemente precisa.</p>
      {upError && <p role="status">{upError}</p>}
    </>}
    <button disabled={props.disabled || !proposal || !current} onClick={() => { if (proposal && current && !props.disabled) props.onPreview(proposal) }}>{props.mate ? 'Vista previa de la edición de trayecto circular' : 'Vista previa de trayecto circular'}</button>
    {props.mate && <button disabled={props.disabled} onClick={props.onCancelEdit}>Cancelar edición de trayecto circular</button>}
  </section>
}

/** Display consistency only. Reports confer no worker capability. */
export function assemblyCircularPathUiReports(document:AssemblyDocument,reports:readonly AssemblyCircularPathSupportReport[]){
 const seen=new Set<string>(),rows:AssemblyCircularPathSupportReport[]=[]
 for(const r of reports){
  const mate=assemblyTangentReportContext(document,r)?.mate,key=JSON.stringify([r.scopePath,r.mateId])
  if(!mate||mate.type!=='circular-path'||seen.has(key)||r.kind!=='circular-path'||r.status!=='ok'||r.satisfied!==true||r.materialOrigin!==true||r.verificationOnly!==true||r.compatibilityAuthority!==false||r.uncertaintyModel!=='current-native-analytic-float64')return []
  const roll=mate.orientation.roll,paths={point:[...r.scopePath,...mate.point.component.occurrencePath],path:[...r.scopePath,...mate.path.component.occurrencePath],...(roll!=='free'?{up:[...r.scopePath,...roll.guide.component.occurrencePath]}:{})}
  if(!same(r.componentPaths,paths)||!same(r.position,mate.position)||!same(r.orientation,mate.orientation)||![r.radiusMm,r.sweepRad,r.curveLengthMm,r.coordinateMm,r.positionResidualMm,r.lengthTolerance,r.angleTolerance].every(v=>typeof v==='number'&&Number.isFinite(v))||r.radiusMm<=0||r.sweepRad<=0||r.sweepRad>=2*Math.PI||r.curveLengthMm<=0||r.lengthTolerance<=0||r.angleTolerance<=0||r.positionResidualMm<0||!r.precision)return []
  const p=r.precision,finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0
  if(!finite(p.positionErrorMm)||r.positionResidualMm+p.positionErrorMm>r.lengthTolerance||!finite(p.tangentErrorRad)||p.tangentErrorRad>r.angleTolerance)return []
  if(mate.orientation.pitchYaw==='free'?r.orientationResidualRad!==null||p.orientationErrorRad!==null:!finite(r.orientationResidualRad)||!finite(p.orientationErrorRad)||r.orientationResidualRad+p.orientationErrorRad>r.angleTolerance)return []
  if(roll==='free'?r.rollResidualRad!==null||p.rollErrorRad!==null:!finite(r.rollResidualRad)||!finite(p.rollErrorRad)||r.rollResidualRad+p.rollErrorRad>r.angleTolerance)return []
  if(mate.position.mode==='coordinate'){
   if(r.targetCoordinateMm!==mate.position.distanceMm||r.domainMarginsMm!==null||p.domainMarginErrorMm!==null||Math.abs(r.coordinateMm!-mate.position.distanceMm)>r.lengthTolerance)return []
  }else if(r.targetCoordinateMm!==null)return []
  if(mate.position.mode==='free'&&mate.position.domain==='trim'){
   if(!r.domainMarginsMm||!finite(p.domainMarginErrorMm)||!Object.values(r.domainMarginsMm).every(v=>Number.isFinite(v)&&v-p.domainMarginErrorMm!>=-r.lengthTolerance))return []
  }else if(r.domainMarginsMm!==null||p.domainMarginErrorMm!==null)return []
  seen.add(key);rows.push(structuredClone(r))
 }
 return rows
}
export function AssemblyCircularPathSupportSummary({document,reports}:{document:AssemblyDocument;reports:readonly AssemblyCircularPathSupportReport[]}){
 const rows=assemblyCircularPathUiReports(document,reports)
 return rows.length?<section className="assembly-solve-summary" role="region" aria-label="Trayecto circular verificado"><strong>Punto sobre arco · origen material actual</strong>{rows.map(r=><p key={JSON.stringify([r.scopePath,r.mateId])}>{assemblyTangentReportContext(document,r)!.mate.name} · coordenada {r.coordinateMm!.toPrecision(6)} mm · residuo de posición {r.positionResidualMm.toPrecision(6)} mm{r.orientationResidualRad!==null&&<> · residuo de orientación {r.orientationResidualRad.toPrecision(6)} rad</>}{r.rollResidualRad!==null&&<> · residuo UP {r.rollResidualRad.toPrecision(6)} rad</>}</p>)}<p>Arco o circunferencia de soporte según el dominio elegido; no comprueba contacto ni colisiones durante un recorrido.</p></section>:null
}
