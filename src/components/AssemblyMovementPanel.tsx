import { useEffect, useState } from 'react'
import type { AssemblyComponentReference } from '../model/assemblyDocument'
import type { AssemblyComponentMove } from '../model/assemblyMovement'
import { MAX_ASSEMBLY_MOTION_ANGULAR_STEP, MAX_ASSEMBLY_MOTION_STATIONS, validateAssemblyComponentMotion, type AssemblyComponentMotion } from '../model/assemblyMotion'
import { composeRigidPoses, inverseRigidPose, validateRigidPose, type Quaternion, type RigidPose } from '../model/rigidPose'
import { rotationExp, rotationLog } from '../model/assemblyKinematics'
import type { AssemblyMotionWitness, AssemblyMovementWitness } from '../cad/kernel.assembly-solve'
import type { AssemblyDefinitionReference } from '../model/assemblyDocument'
import type { Vec3 } from '../cad/kernel.types'

function finiteField(value: string, name: string): number {
  const number = Number(value)
  if (!value.trim() || !Number.isFinite(number)) throw new Error(`${name} debe ser un número finito.`)
  return number
}
/** Numeric intent only. The worker authenticates scope, native references and mates. */
export function assemblyMovementTarget(component: AssemblyComponentReference, pose: RigidPose,
  translation: readonly [string, string, string], axis: number, degrees: string): AssemblyComponentMove {
  const current = validateRigidPose(pose)
  if (axis !== 0 && axis !== 1 && axis !== 2) throw new Error('Selecciona un eje local válido.')
  const target: Vec3 = [finiteField(translation[0], 'X'), finiteField(translation[1], 'Y'), finiteField(translation[2], 'Z')]
  const angle = finiteField(degrees, 'El giro') / 180 * Math.PI, tangent: Vec3 = [0, 0, 0]; tangent[axis] = angle
  if (!Number.isFinite(angle)) throw new Error('El giro excede el intervalo numérico admitido.')
  const rotation = composeRigidPoses({ translation: [0, 0, 0], rotation: current.rotation },
    { translation: [0, 0, 0], rotation: rotationExp(tangent) }).rotation
  return { component: structuredClone(component), pose: validateRigidPose({ translation: target, rotation }) }
}
/** Signed numeric intent, retaining complete turns before any quaternion construction. */
export function assemblyMovementMotion(component: AssemblyComponentReference, translation: readonly [string, string, string],
  axis: number, degrees: string): AssemblyComponentMotion {
  if (axis !== 0 && axis !== 1 && axis !== 2) throw new Error('Selecciona un eje local válido.')
  const degreeValue = finiteField(degrees, 'El giro'), angle = degreeValue * (Math.PI / 180)
  if (degreeValue !== 0 && angle === 0) throw new Error('El giro pierde precisión representable al convertirlo a radianes.')
  return validateAssemblyComponentMotion({ component, translation: [finiteField(translation[0], 'X'), finiteField(translation[1], 'Y'), finiteField(translation[2], 'Z')],
    rotation: { axis, angle } })
}
function sameComponent(first: AssemblyComponentReference, second: AssemblyComponentReference): boolean {
  return first.definition.id === second.definition.id && first.definition.revision === second.definition.revision
    && first.occurrencePath.length === second.occurrencePath.length && first.occurrencePath.every((id, index) => id === second.occurrencePath[index])
}
/** Display/request binding only. Matching data never creates Apply authority. */
export function assemblyMotionMatches(witness: AssemblyMotionWitness | undefined, supplied: AssemblyComponentMotion, scope: AssemblyDefinitionReference, startPose: RigidPose): boolean {
  try {
    if (!witness) return false
    const request = validateAssemblyComponentMotion(supplied), target = validateRigidPose(witness.targetPose), resolved = validateRigidPose(witness.resolvedPose)
    const original = validateRigidPose(startPose), tangent: Vec3 = [0, 0, 0]; tangent[request.rotation.axis] = request.rotation.angle
    const expected = composeRigidPoses({ translation: [0, 0, 0], rotation: original.rotation },
      { translation: [0, 0, 0], rotation: rotationExp(tangent) }).rotation
    const rotationError = (first: Quaternion, second: Quaternion) => Math.hypot(...rotationLog(composeRigidPoses(
      inverseRigidPose({ translation: [0, 0, 0], rotation: second }), { translation: [0, 0, 0], rotation: first }).rotation))
    const reportedPoseError = rotationError(resolved.rotation, target.rotation)
    const count = Math.max(1, Math.ceil(Math.abs(request.rotation.angle) / MAX_ASSEMBLY_MOTION_ANGULAR_STEP))
    return witness.frame === 'local' && witness.temporaryAnchor === true && witness.sampledOnly === true
      && sameComponent(witness.component, request.component) && sameComponent(witness.drivenComponent, request.component)
      && witness.scope.id === scope.id && witness.scope.revision === scope.revision && witness.axis === request.rotation.axis
      && witness.requestedAngle === request.rotation.angle && Number.isFinite(witness.evaluatedAngle)
      && Number.isInteger(witness.stationCount) && witness.stationCount === count && witness.stationCount <= MAX_ASSEMBLY_MOTION_STATIONS
      && witness.verifiedStations === count && witness.maxAngularStep === MAX_ASSEMBLY_MOTION_ANGULAR_STEP
      && target.translation.every((value, index) => value === request.translation[index])
      && rotationError(target.rotation, expected) <= 1e-12 && rotationError(resolved.rotation, expected) <= witness.angleTolerance
      && [witness.lengthResidual, witness.angleResidual, witness.windingResidual].every(value => Number.isFinite(value) && value >= 0)
      && Number.isFinite(witness.lengthTolerance) && witness.lengthTolerance > 0 && witness.lengthTolerance <= 1e-6
      && Number.isFinite(witness.angleTolerance) && witness.angleTolerance > 0 && witness.angleTolerance <= 1e-8
      && witness.windingTolerance === witness.angleTolerance
      && witness.lengthResidual <= witness.lengthTolerance && witness.angleResidual <= witness.angleTolerance
      && Math.abs(witness.angleResidual - reportedPoseError) <= 64 * Number.EPSILON * Math.max(1, witness.angleResidual, reportedPoseError)
      && Math.hypot(...resolved.translation.map((value, index) => value - request.translation[index])) <= witness.lengthTolerance
      && witness.windingResidual === Math.abs(witness.evaluatedAngle - witness.requestedAngle) && witness.windingResidual <= witness.windingTolerance
  } catch { return false }
}
function scalar(value: number): string { return Number(value.toPrecision(12)).toString() }
function angularLabel(value: number): string { return `${scalar(value * (180 / Math.PI))}° · ${scalar(value / (2 * Math.PI))} vueltas · ${scalar(value)} rad` }
export interface AssemblyMovementPanelProps {
  component: AssemblyComponentReference; pose: RigidPose; name: string; scopeName: string; drivenName?: string
  fixed: boolean; suppressed: boolean; disabled: boolean
  witness?: AssemblyMovementWitness
  motionWitness?: AssemblyMotionWitness
  /** Changes after Apply/Undo/Redo even when complete turns retain the same pose. */
  resetKey?: string | number
  onPreview: (motion: AssemblyComponentMotion) => void
}
export default function AssemblyMovementPanel(props: AssemblyMovementPanelProps) {
  const [translation, setTranslation] = useState<[string, string, string]>(() => props.pose.translation.map(String) as [string, string, string])
  const [axis, setAxis] = useState<0 | 1 | 2>(2), [degrees, setDegrees] = useState('0'), [error, setError] = useState('')
  const poseSignature = JSON.stringify(props.pose)
  useEffect(() => { setTranslation(props.pose.translation.map(String) as [string, string, string]); setDegrees('0'); setError('') }, [poseSignature, props.resetKey])
  const blocked = props.disabled || props.fixed || props.suppressed
  const witness = props.motionWitness ?? props.witness
  return <section className="assembly-section assembly-movement" role="region" aria-label="Mover componente con relaciones">
    <h3>Mover {props.name}</h3><p>Destino absoluto en el marco local de {props.scopeName}. El giro se incrementa sobre un eje local del componente.</p>
    <p>El incremento conserva el signo y las vueltas completas introducidas. La vista previa comprueba estaciones discretas del movimiento.</p>
    <p>Si este ámbito se reutiliza, el movimiento afecta a todos sus usos equivalentes. La vista previa debe resolverse y aplicarse; no añade un bloqueo guardado.</p>
    {props.suppressed ? <p>El componente está suprimido, directamente o por un padre.</p> : props.fixed && <p>El componente es fijo respecto a su padre. Este destino numérico local requiere una ocurrencia libre.</p>}
    <div className="assembly-coordinate-grid">{(['X', 'Y', 'Z'] as const).map((label, index) => <label key={label}>{label} · mm<input aria-label={`Destino local ${label} del componente`} type="number" step="any" value={translation[index]} disabled={blocked} onChange={event => {
      const next: [string, string, string] = [...translation]; next[index] = event.target.value; setTranslation(next); setError('')
    }} /></label>)}</div>
    <label>Eje local<select aria-label="Eje local del movimiento" value={axis} disabled={blocked} onChange={event => {
      const value = event.target.value; if (value === '0' || value === '1' || value === '2') setAxis(value === '0' ? 0 : value === '1' ? 1 : 2)
    }}><option value="0">X local</option><option value="1">Y local</option><option value="2">Z local</option></select></label>
    <label>Incremento de giro · grados<input aria-label="Giro local del movimiento en grados" type="number" step="any" value={degrees} disabled={blocked} onChange={event => { setDegrees(event.target.value); setError('') }} /></label>
    <button aria-label="Vista previa del movimiento" className="assembly-primary" disabled={blocked} onClick={() => {
      if (blocked) return
      try { const motion = assemblyMovementMotion(props.component, translation, axis, degrees); setError(''); props.onPreview(motion) }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo preparar el destino.') }
    }}>Vista previa del movimiento</button>
    {error && <p role="alert">{error}</p>}
    {witness && <div className="assembly-movement-witness" aria-label="Resultado del movimiento"><p>Destino verificado con ancla temporal · {witness.affectedPaths.length} usos dirigidos.</p>
      {witness.frame === 'world' && <p>Movimiento en el marco global. Grupo rígido dirigido: {props.drivenName ?? props.name}. El destino se resuelve moviendo este grupo y verificando sus relaciones.</p>}
      {props.motionWitness && <div className="assembly-motion-witness" aria-label="Continuación angular del movimiento">
        <p aria-label="Giro solicitado del movimiento">Giro solicitado: {angularLabel(props.motionWitness.requestedAngle)}.</p>
        <p aria-label="Giro evaluado del movimiento">Giro evaluado: {angularLabel(props.motionWitness.evaluatedAngle)}.</p>
        <p aria-label="Estaciones del movimiento">{props.motionWitness.verifiedStations} de {props.motionWitness.stationCount} estaciones verificadas · paso angular máximo {scalar(props.motionWitness.maxAngularStep * (180 / Math.PI))}°.</p>
        <p aria-label="Error de continuación angular">Error de continuación: {props.motionWitness.windingResidual.toExponential(3)} / {props.motionWitness.windingTolerance.toExponential(3)} rad.</p>
        <p>Las comprobaciones corresponden a estaciones discretas; el movimiento entre ellas y las colisiones requieren comprobaciones independientes.</p>
      </div>}
      <p>Posición resuelta {witness.frame === 'world' ? 'global' : 'local'}: {witness.resolvedPose.translation.map(value => Number(value.toPrecision(10))).join(', ')} mm.</p>
      <p>Error de posición final: {witness.lengthResidual.toExponential(3)} / {witness.lengthTolerance.toExponential(3)} mm.<br />Error angular de pose final: {witness.angleResidual.toExponential(3)} / {witness.angleTolerance.toExponential(3)} rad.</p>
      <p>El rango y los grados de libertad de esta vista previa incluyen el ancla temporal. Tras Aplicar, vuelve a Resolver para medir el ensamblaje sin ella.</p></div>}
  </section>
}
