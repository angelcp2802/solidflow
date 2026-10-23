import { useState } from 'react'
import { validateAssemblyPlaneReference, validateAssemblyVertexReference, type AssemblyDocument, type AssemblyFaceReference, type AssemblyEdgeReference, type AssemblyLinePathMate, type AssemblyVertexReference } from '../model/assemblyDocument'
import { coordinateAssemblyLinePathPosition, validateAssemblyLinePathMateRequest, validateAssemblyLinePathOrientation, type AssemblyLinePathOrientation, type AssemblyLinePathPosition } from '../model/assemblyLinePathMate'
import type { AssemblyLinePathSelection } from '../model/assemblyLinePathReferences'
import { assemblySceneEdgeReference, assemblySceneFaceReference, type AssemblyScene, type AssemblyLinePathSupportReport } from '../cad/kernel.assembly-types'
import { assemblyTangentReportContext } from './AssemblyTangentMatePanel'

export interface LinePathPointChoice { key: string; label: string; reference: AssemblyVertexReference }
export interface LinePathEdgeChoice { key: string; label: string; reference: AssemblyEdgeReference }
export type LinePathGuideReference = AssemblyFaceReference & { support: 'plane' }
export interface LinePathGuideChoice { key: string; label: string; reference: LinePathGuideReference }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
/** Syntax identity only; parser normalization preserves every locator field. */
export function sameLinePathGuide(first: unknown, second: unknown): boolean {
  try {
    const a = validateAssemblyPlaneReference(first), b = validateAssemblyPlaneReference(second)
    return a.kind === 'face' && b.kind === 'face' && same(a, b)
  } catch { return false }
}
/** Current scene choices confer syntax only, never incidence or Apply authority. */
export function assemblyLinePathUiChoices(scene: AssemblyScene | null, scopePath: readonly string[]) {
  const points: LinePathPointChoice[] = [], edges: LinePathEdgeChoice[] = [], guides: LinePathGuideChoice[] = []
  const scoped = (path: string[]) => path.length > scopePath.length && scopePath.every((id, i) => id === path[i])
  for (const body of scene?.bodies ?? []) {
    if (!body.visible || !scoped(body.component.occurrencePath)) continue
    for (const vertex of body.vertexPoints ?? []) {
      if (!same(vertex.selection.component, body.component) || !same(vertex.selection.body, body.body)) continue
      try {
        const reference = validateAssemblyVertexReference({ kind: 'vertex', ...vertex.selection, component: { ...vertex.selection.component, occurrencePath: vertex.selection.component.occurrencePath.slice(scopePath.length) }, support: 'point' })
        points.push({ key: JSON.stringify(reference), label: body.name + ' · vértice (' + vertex.point.map(v => Number(v.toPrecision(6))).join(', ') + ') · ' + reference.vertex.key, reference })
      } catch { /* Unavailable or malformed display candidates are not selectable. */ }
    }
    for (const face of body.faces) {
      if (face.support?.kind !== 'plane' || !same(face.selection.component, body.component) || !same(face.selection.body, body.body)) continue
      const reference = assemblySceneFaceReference(face)
      if (!reference || reference.support !== 'plane') continue
      reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
      guides.push({ key: JSON.stringify(reference), label: body.name + ' · plano material · normal (' + face.support.normal.map(v => Number(v.toPrecision(6))).join(', ') + ') · ' + reference.face.key, reference: reference as LinePathGuideReference })
    }
    for (const edge of body.edges ?? []) {
      const reference = assemblySceneEdgeReference(edge)
      if (!reference || !edge.support || !same(edge.selection.component, body.component) || !same(edge.selection.body, body.body)) continue
      reference.component.occurrencePath = reference.component.occurrencePath.slice(scopePath.length)
      edges.push({ key: JSON.stringify(reference), label: body.name + ' · LINE (' + edge.support.point.map(v => Number(v.toPrecision(6))).join(', ') + ') · ' + reference.edge.key, reference })
    }
  }
  return { points: [...new Map(points.map(x => [x.key, x])).values()], edges: [...new Map(edges.map(x => [x.key, x])).values()], guides: [...new Map(guides.map(x => [x.key, x])).values()] }
}
export function linePathOrigins(points: readonly LinePathPointChoice[], edge: AssemblyEdgeReference | null) {
  return edge ? points.filter(p => same(p.reference.component, edge.component) && same(p.reference.body, edge.body) && p.reference.vertex.sourceFeatureId === edge.edge.sourceFeatureId) : []
}
export function assemblyLinePathUiProposal(point: AssemblyVertexReference | null, path: AssemblyLinePathSelection | null, name: string, mode: AssemblyLinePathPosition['mode'], quantity: string, reverse: boolean, orientation: AssemblyLinePathOrientation = { pitchYaw: 'free', roll: 'free' }) {
  if (!name.trim() || !point || !path || mode !== 'free' && !quantity.trim()) throw Error('Completa el punto, la arista, su vértice de origen y el valor.')
  const position: AssemblyLinePathPosition = mode === 'free' ? { mode } : mode === 'distance' ? { mode, distanceMm: Number(quantity), reverse } : { mode, percent: Number(quantity), reverse }
  return { type: 'line-path' as const, name: name.trim(), suppressed: false, ...validateAssemblyLinePathMateRequest({ point, path, position, orientation }) }
}
export default function AssemblyLinePathMatePanel(props: { mate?: AssemblyLinePathMate; points: LinePathPointChoice[]; edges: LinePathEdgeChoice[]; guides?: LinePathGuideChoice[]; disabled: boolean; onPreview: (proposal: ReturnType<typeof assemblyLinePathUiProposal>) => void; onCancelEdit: () => void }) {
  const [name, setName] = useState(props.mate?.name ?? 'Punto sobre trayecto LINE'), [point, setPoint] = useState<AssemblyVertexReference | null>(props.mate ? structuredClone(props.mate.point) : null)
  const [edge, setEdge] = useState<AssemblyEdgeReference | null>(props.mate ? { kind: 'edge', component: structuredClone(props.mate.path.component), body: structuredClone(props.mate.path.body), edge: structuredClone(props.mate.path.edge), support: 'line' } : null)
  const [origin, setOrigin] = useState(props.mate ? structuredClone(props.mate.path.startVertex) : null), [mode, setMode] = useState<AssemblyLinePathPosition['mode']>(props.mate?.position.mode ?? 'free')
  const [quantity, setQuantity] = useState(String(props.mate?.position.mode === 'distance' ? props.mate.position.distanceMm : props.mate?.position.mode === 'percent' ? props.mate.position.percent : 0)), [reverse, setReverse] = useState(props.mate?.position.mode === 'free' ? false : props.mate?.position.reverse ?? false)
  const savedFollow = props.mate?.orientation.pitchYaw
  const [following, setFollowing] = useState(!!savedFollow && savedFollow !== 'free'), [followAxis, setFollowAxis] = useState<'x' | 'y' | 'z'>(savedFollow && savedFollow !== 'free' ? savedFollow.axis : 'x'), [followReverse, setFollowReverse] = useState(savedFollow && savedFollow !== 'free' ? savedFollow.reverse : false)
  const savedRoll = props.mate?.orientation.roll
  const [upEnabled, setUpEnabled] = useState(!!savedRoll && savedRoll !== 'free'), [upAxis, setUpAxis] = useState<'x' | 'y' | 'z'>(savedRoll && savedRoll !== 'free' ? savedRoll.axis : 'y'), [upReverse, setUpReverse] = useState(savedRoll && savedRoll !== 'free' ? savedRoll.reverse : false)
  const [guide, setGuide] = useState<LinePathGuideReference | null>(savedRoll && savedRoll !== 'free' ? structuredClone(savedRoll.guide) : null)
  const guides = props.guides ?? [], currentGuide = guides.find(choice => sameLinePathGuide(choice.reference, guide))
  const upError = upEnabled && !following ? 'Vector UP necesita alinear primero un eje con el trayecto.' : upEnabled && upAxis === followAxis ? 'El eje UP y el eje del trayecto deben ser diferentes. Elige explícitamente otro eje.' : upEnabled && !currentGuide ? 'Elige una cara plana material disponible como guía UP.' : null
  const origins = linePathOrigins(props.points, edge), currentPoint = props.points.find(p => same(p.reference, point)), currentEdge = props.edges.find(e => same(e.reference, edge)), currentOrigin = origins.find(p => same(p.reference.vertex, origin))
  let proposal: ReturnType<typeof assemblyLinePathUiProposal> | null = null
  try { proposal = assemblyLinePathUiProposal(point, edge && origin ? { component: edge.component, body: edge.body, edge: edge.edge, startVertex: origin } : null, name, mode, quantity, reverse, validateAssemblyLinePathOrientation({ pitchYaw: following ? { mode: 'follow', axis: followAxis, reverse: followReverse } : 'free', roll: upEnabled && guide ? { mode: 'up', axis: upAxis, reverse: upReverse, guide } : 'free' })) } catch { /* Compound drafts remain transient until complete. */ }
  const current = !!currentPoint && !!currentEdge && !!currentOrigin && !upError
  return <section className="assembly-line-path-panel" role="region" aria-label="Punto sobre trayecto LINE">
    <p>Elige un punto material, una arista LINE y explícitamente uno de sus vértices de origen. La incidencia se comprueba en la vista previa; la lista no la certifica. El giro alrededor del trayecto permanece libre o usa una guía UP plana material explícita.</p>
    <label>Punto material<select aria-label="Punto del trayecto LINE" disabled={props.disabled} value={currentPoint?.key ?? ''} onChange={e => setPoint(structuredClone(props.points.find(p => p.key === e.target.value)?.reference ?? null))}><option value="">Selecciona un vértice actual</option>{props.points.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
    <label>Arista LINE<select aria-label="Arista del trayecto LINE" disabled={props.disabled} value={currentEdge?.key ?? ''} onChange={e => { setEdge(structuredClone(props.edges.find(p => p.key === e.target.value)?.reference ?? null)); setOrigin(null) }}><option value="">Selecciona una arista actual</option>{props.edges.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
    <label>Vértice material de origen<select aria-label="Origen del trayecto LINE" disabled={props.disabled || !currentEdge} value={currentOrigin?.key ?? ''} onChange={e => setOrigin(structuredClone(origins.find(p => p.key === e.target.value)?.reference.vertex ?? null))}><option value="">Selecciona un extremo explícito</option>{origins.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
    {props.mate && !current && <p>Referencia guardada pendiente de elección actual y verificación.</p>}
    <label>Nombre<input aria-label="Nombre del trayecto LINE" disabled={props.disabled} value={name} onChange={e => setName(e.target.value)} /></label>
    <label>Posición<select aria-label="Modo del trayecto LINE" disabled={props.disabled} value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="free">Libre</option><option value="distance">Distancia</option><option value="percent">Porcentaje</option></select></label>
    {mode !== 'free' && <><label>{mode === 'distance' ? 'Distancia · mm' : 'Porcentaje'}<input aria-label="Valor del trayecto LINE" type="number" min={0} max={mode === 'percent' ? 100 : undefined} disabled={props.disabled} value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label><input aria-label="Invertir trayecto LINE" type="checkbox" disabled={props.disabled} checked={reverse} onChange={e => setReverse(e.target.checked)} />Medir desde el otro extremo</label></>}
    <label>Orientación del componente del punto<select aria-label="Orientación del trayecto LINE" disabled={props.disabled} value={following ? 'follow' : 'free'} onChange={e => setFollowing(e.target.value === 'follow')}><option value="free">Libre</option><option value="follow">Alinear un eje local con el trayecto</option></select></label>
    {following && <><label>Eje local del componente del punto<select aria-label="Eje de orientación del trayecto LINE" disabled={props.disabled} value={followAxis} onChange={e => setFollowAxis(e.target.value as typeof followAxis)}>{(['x', 'y', 'z'] as const).map(axis => <option key={axis} value={axis}>{axis.toUpperCase()}</option>)}</select></label><label><input type="checkbox" aria-label="Invertir orientación del trayecto LINE" disabled={props.disabled} checked={followReverse} onChange={e => setFollowReverse(e.target.checked)} />Orientar el eje en sentido opuesto</label></>}
    <label>Giro alrededor del trayecto<select aria-label="Giro del trayecto LINE" disabled={props.disabled} value={upEnabled ? 'up' : 'free'} onChange={e => setUpEnabled(e.target.value === 'up')}><option value="free">Libre</option><option value="up">Vector UP · cara plana material</option></select></label>
    {upEnabled && <><label>Guía UP<select aria-label="Guía UP del trayecto LINE" disabled={props.disabled} value={currentGuide?.key ?? ''} onChange={e => setGuide(structuredClone(guides.find(p => p.key === e.target.value)?.reference ?? null))}><option value="">Selecciona una cara plana actual</option>{guides.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
      <label>Eje local UP del componente del punto<select aria-label="Eje UP del trayecto LINE" disabled={props.disabled} value={upAxis} onChange={e => setUpAxis(e.target.value as typeof upAxis)}>{(['x', 'y', 'z'] as const).map(axis => <option key={axis} value={axis}>{axis.toUpperCase()}</option>)}</select></label>
      <label><input aria-label="Invertir UP del trayecto LINE" type="checkbox" disabled={props.disabled} checked={upReverse} onChange={e => setUpReverse(e.target.checked)} />Orientar el eje UP en sentido opuesto</label>
      <p>La guía aporta su normal proyectada perpendicularmente al trayecto. No se puede usar una proyección nula o insuficientemente precisa.</p>
      {upError && <p role="status">{upError}</p>}
    </>}
    <button disabled={props.disabled || !proposal || !current} onClick={() => { if (proposal && current && !props.disabled) props.onPreview(proposal) }}>{props.mate ? 'Vista previa de la edición de trayecto LINE' : 'Vista previa de trayecto LINE'}</button>
    {props.mate && <button disabled={props.disabled} onClick={props.onCancelEdit}>Cancelar edición de trayecto LINE</button>}
  </section>
}
/** Display consistency only. Worker-owned capabilities authenticate Apply. */
export function assemblyLinePathUiReports(document: AssemblyDocument, reports: readonly AssemblyLinePathSupportReport[]) {
  const seen = new Set<string>(), result: AssemblyLinePathSupportReport[] = []
  for (const r of reports) {
    const mate = assemblyTangentReportContext(document, r)?.mate, key = JSON.stringify([r.scopePath, r.mateId])
    const roll = mate?.type === 'line-path' ? mate.orientation.roll : 'free'
    const paths = mate?.type === 'line-path' ? { point: [...r.scopePath, ...mate.point.component.occurrencePath], path: [...r.scopePath, ...mate.path.component.occurrencePath], ...(roll !== 'free' ? { up: [...r.scopePath, ...roll.guide.component.occurrencePath] } : {}) } : null
    if (!mate || mate.type !== 'line-path' || r.kind !== 'line-path' || r.satisfied !== true || r.underlyingLine !== true || r.materialOrigin !== true || r.verificationOnly !== true || seen.has(key)
      || !same(r.componentPaths, paths) || !same(r.position, mate.position) || !same(r.orientation, mate.orientation)
      || ![r.curveLengthMm, r.coordinateMm, r.transverseResidualMm, r.positionResidualMm, r.lengthTolerance].every(Number.isFinite) || r.curveLengthMm <= 0 || r.lengthTolerance <= 0 || r.transverseResidualMm < 0 || r.transverseResidualMm > r.lengthTolerance || r.positionResidualMm < 0 || r.positionResidualMm > r.lengthTolerance
      || !r.precision || ![r.precision.positionErrorMm, r.precision.directionErrorRad].every(v => Number.isFinite(v) && v >= 0)
      || (mate.orientation.pitchYaw === 'free' ? r.precision.orientationErrorRad !== null : r.precision.orientationErrorRad === null || !Number.isFinite(r.precision.orientationErrorRad) || r.precision.orientationErrorRad < 0)
      || (roll === 'free' ? r.rollResidualRad !== null || r.precision.rollErrorRad !== null : r.rollResidualRad === null || !Number.isFinite(r.rollResidualRad) || r.rollResidualRad < 0 || r.rollResidualRad > r.angleTolerance || r.precision.rollErrorRad === null || !Number.isFinite(r.precision.rollErrorRad) || r.precision.rollErrorRad < 0 || r.rollResidualRad + r.precision.rollErrorRad > r.angleTolerance)
      || !Number.isFinite(r.angleTolerance) || r.angleTolerance <= 0 || (mate.orientation.pitchYaw === 'free' ? r.orientationResidualRad !== null : r.orientationResidualRad === null || !Number.isFinite(r.orientationResidualRad) || r.orientationResidualRad < 0 || r.orientationResidualRad > r.angleTolerance)
      || (mate.position.mode === 'free' ? r.targetCoordinateMm !== null || r.coordinateResidualMm !== null : r.targetCoordinateMm === null || !Number.isFinite(r.targetCoordinateMm) || r.coordinateResidualMm === null || !Number.isFinite(r.coordinateResidualMm) || Math.abs(r.coordinateResidualMm) > r.lengthTolerance)) return []
    try {
      const target = coordinateAssemblyLinePathPosition(mate.position, r.curveLengthMm)
      if (target !== null && (r.targetCoordinateMm === null || Math.abs(target - r.targetCoordinateMm) > r.lengthTolerance || Math.abs(r.coordinateMm - target) > r.lengthTolerance)) return []
    } catch { return [] }
    seen.add(key); result.push(structuredClone(r))
  }
  return result
}
export function AssemblyLinePathSupportSummary({ document, reports }: { document: AssemblyDocument; reports: readonly AssemblyLinePathSupportReport[] }) {
  const rows = assemblyLinePathUiReports(document, reports)
  return rows.length ? <section className="assembly-solve-summary" role="region" aria-label="Trayecto LINE verificado"><strong>Punto sobre LINE · origen material actual</strong>{rows.map(r => <p key={JSON.stringify([r.scopePath, r.mateId])}>{assemblyTangentReportContext(document, r)!.mate.name} · coordenada {r.coordinateMm.toPrecision(6)} mm · residuo transversal {r.transverseResidualMm.toPrecision(6)} mm · residuo de posición {r.positionResidualMm.toPrecision(6)} mm{r.orientationResidualRad !== null && <> · residuo de orientación {r.orientationResidualRad.toPrecision(6)} rad</>}{r.rollResidualRad !== null && <> · residuo UP {r.rollResidualRad.toPrecision(6)} rad · error UP {r.precision.rollErrorRad!.toPrecision(6)} rad</>}</p>)}<p>Soporte LINE; no comprueba contacto ni colisiones durante un recorrido.</p></section> : null
}
