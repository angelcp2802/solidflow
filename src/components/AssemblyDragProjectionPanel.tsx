import type { AssemblyPreviewReply } from '../cad/kernel.assembly-types'
import type { AssemblyDefinitionReference, AssemblyComponentReference } from '../model/assemblyDocument'
import type { AssemblyDragFrame } from '../model/assemblyDrag'

type ReadyReply = Extract<AssemblyPreviewReply, { status: 'ready' }>
export type AssemblyDragProjection = NonNullable<ReadyReply['projection']>
function sameComponent(a: AssemblyComponentReference, b: AssemblyComponentReference): boolean {
  return a.definition.id === b.definition.id && a.definition.revision === b.definition.revision
    && a.occurrencePath.length === b.occurrencePath.length && a.occurrencePath.every((id, index) => id === b.occurrencePath[index])
}
/** Display binding only. A matching witness never supplies an Apply capability. */
export function assemblyDragProjectionMatches(projection: AssemblyDragProjection | undefined, frame: AssemblyDragFrame,
  mode: 'translate' | 'rotate', scope: AssemblyDefinitionReference): boolean {
  return !!projection && projection.frame === 'world' && projection.mode === mode && projection.temporaryAnchor === false
    && projection.evidence.localOnly === true && sameComponent(projection.component, frame.component)
    && sameComponent(projection.drivenComponent, frame.drivenComponent)
    && projection.scope.id === scope.id && projection.scope.revision === scope.revision
}
export interface AssemblyDragProjectionPanelProps {
  projection: AssemblyDragProjection
  checks: ReadyReply['checks']
  selectedName: string
  drivenName: string
  pending: boolean
}
const scalar = (value: number) => Number(value.toPrecision(10)).toString()
const position = (values: readonly number[]) => values.map(scalar).join(', ')
export default function AssemblyDragProjectionPanel({ projection, checks, selectedName, drivenName, pending }: AssemblyDragProjectionPanelProps) {
  const convergence = projection.evidence.convergence === 'target' ? 'Destino alcanzado'
    : projection.evidence.convergence === 'stationary' ? 'Proyección estacionaria' : 'Sin movilidad útil en este destino'
  return <section className="assembly-section" role="region" aria-label="Proyección del arrastre">
    <h3>Proyección local de {selectedName}</h3><p>{projection.mode === 'translate' ? 'Arrastre de posición' : 'Arrastre de giro'} · grupo rígido {drivenName}.</p>
    <p>{convergence}. La desviación del puntero se muestra por separado de los errores de las relaciones.</p>
    <div aria-label="Destino del puntero"><strong>Destino del puntero · global</strong><p>{position(projection.requestedPose.translation)} mm.</p></div>
    <div aria-label="Posición resuelta"><strong>Posición resuelta · global</strong><p>{position(projection.resolvedPose.translation)} mm.</p></div>
    <div aria-label="Desviación del puntero"><strong>Desviación del puntero</strong><p>Posición: {scalar(projection.positionResidual)} mm.<br />Giro: {scalar(projection.angleResidual)} rad.</p></div>
    <div aria-label="Comprobación de relaciones"><strong>Comprobación de relaciones</strong><p>Relaciones guardadas, comprobadas con sus tolerancias propias.</p>
      {checks.length ? <><p>{checks.filter(check => check.satisfied).length} de {checks.length} dentro de sus tolerancias.</p>
        <ul>{checks.map((check, index) => <li key={index}>Relación {index + 1}: posición {scalar(check.lengthResidual)} / {scalar(check.lengthTolerance)} mm; giro {scalar(check.angleResidual)} / {scalar(check.angleTolerance)} rad.{!check.satisfied && ' Fuera de tolerancia.'}</li>)}</ul></> : <p>No hay relaciones activas que comprobar.</p>}
    </div>
    <p>Los grados de libertad describen las relaciones guardadas, sin un ancla temporal del puntero. Esta proyección local no añade un bloqueo guardado.</p>
    <p>{pending ? 'Último destino verificado. El arrastre sigue pendiente; Aplicar y Guardar permanecen bloqueados.' : 'Revisa el destino resuelto antes de Aplicar. El documento confirmado todavía no ha cambiado.'}</p>
  </section>
}
