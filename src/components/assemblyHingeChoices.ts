import type { AssemblyScene } from '../cad/kernel.assembly-types'
import { assemblySceneFaceReference, assemblySceneEdgeReference } from '../cad/kernel.assembly-types'
import { validateAssemblyGeometryReference, validateAssemblyPlaneReference, type AssemblyPlaneReference } from '../model/assemblyDocument'
import type { HingeUiChoice, HingeUiReference } from './AssemblyHingeMatePanel'

export interface HingePrincipalChoice { reference: AssemblyPlaneReference; label?: string }

function numberLabel(value: number): string {
  // Display rounding is not saved identity or a geometric acceptance band.
  const rounded = Number(value.toPrecision(7))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}
function vectorLabel(value: readonly number[] | undefined): string | null {
  if (!value || value.length !== 3 || !value.every(Number.isFinite)) return null
  return '(' + value.map(numberLabel).join(', ') + ')'
}
function descriptors(point: readonly number[], direction: readonly number[], plane: boolean): string {
  const p = vectorLabel(point), d = vectorLabel(direction)
  return p && d ? 'p local ' + p + ' mm · ' + (plane ? 'n local ' : 'dirección local ') + d : 'geometría local no disponible'
}
function disambiguate(choices: HingeUiChoice[]): HingeUiChoice[] {
  const counts = new Map<string, number>(), indices = new Map<string, number>()
  for (const choice of choices) counts.set(choice.label, (counts.get(choice.label) ?? 0) + 1)
  return choices.map(choice => {
    if (counts.get(choice.label) === 1) return choice
    const index = (indices.get(choice.label) ?? 0) + 1
    indices.set(choice.label, index)
    return { ...choice, label: choice.label + ' · opción del catálogo actual ' + index }
  })
}
/** Current display choices, not native witnesses. Coordinates/directions are
 * prototype-local mm/unit vectors, even when the occurrence has a world pose.
 * Principal choices are declared frames supplied by the caller's current scope
 * catalog; neither their presence nor a display ordinal proves native identity. */
export function assemblyHingeChoices(scene: AssemblyScene | null, scopePath: readonly string[],
  principalChoices: readonly HingePrincipalChoice[] = []): { axes: HingeUiChoice[]; planes: HingeUiChoice[] } {
  if (!Array.isArray(scopePath) || scopePath.some(id => typeof id !== 'string') || Object.keys(scopePath).length !== scopePath.length) throw Error('Hinge choice scope must be a dense occurrence path.')
  const axes: HingeUiChoice[] = [], planes: HingeUiChoice[] = []
  const inside = (path: readonly string[]) => scopePath.length <= path.length && scopePath.every((id, i) => id === path[i])
  const choice = (reference: HingeUiReference, label: string): HingeUiChoice => ({ key: JSON.stringify(reference), reference, label })
  for (const body of scene?.bodies ?? []) {
    if (!body.visible) continue
    for (const face of body.faces) {
      const raw = assemblySceneFaceReference(face)
      if (!raw || !inside(raw.component.occurrencePath)) continue
      raw.component.occurrencePath = raw.component.occurrencePath.slice(scopePath.length)
      const reference = validateAssemblyGeometryReference(raw)
      if (reference.kind !== 'face') continue
      const prefix = (reference.component.occurrencePath.join(' / ') || 'Ámbito actual') + ' · ' + body.name + ' · ' + reference.face.sourceFeatureId
      if (face.support?.kind === 'plane' && reference.support === 'plane') planes.push(choice({ ...reference, support: 'plane' }, 'cara plana · ' + descriptors(face.support.point, face.support.normal, true) + ' · ' + prefix))
      else if (face.support?.kind === 'cylinder' && reference.support === 'axis') axes.push(choice({ ...reference, support: 'axis' }, 'eje de cara cilíndrica · ' + descriptors(face.support.point, face.support.axis, false) + ' · ' + prefix))
    }
    for (const edge of body.edges ?? []) {
      const raw = assemblySceneEdgeReference(edge)
      if (!raw || !inside(raw.component.occurrencePath)) continue
      raw.component.occurrencePath = raw.component.occurrencePath.slice(scopePath.length)
      const reference = validateAssemblyGeometryReference(raw)
      if (reference.kind !== 'edge' || edge.support?.kind !== 'line') continue
      const prefix = (reference.component.occurrencePath.join(' / ') || 'Ámbito actual') + ' · ' + body.name + ' · ' + reference.edge.sourceFeatureId
      axes.push(choice(reference, 'arista LINE · ' + descriptors(edge.support.point, edge.support.axis, false) + ' · ' + prefix))
    }
  }
  for (const candidate of principalChoices) {
    const reference = validateAssemblyPlaneReference(candidate.reference)
    if (reference.kind !== 'principal-plane') continue
    const owner = reference.component?.occurrencePath.join(' / ') || 'Ámbito actual'
    planes.push(choice(reference, owner + ' · plano principal declarado ' + reference.plane + ' · marco local declarado'))
  }
  return { axes: disambiguate(axes), planes: disambiguate(planes) }
}
