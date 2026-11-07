import { validateAssemblyGeometryReference, type AssemblyComponentReference } from './assemblyDocument'
import type { BodyReference, FaceReference, EdgeReference } from '../cad/kernel.types'

/** Selected face identity only. Bounded profile purpose requires a fresh native query. */
export interface AssemblyProfileFaceSelection { component: AssemblyComponentReference; body: BodyReference | null; face: FaceReference }
export interface AssemblyProfileReferencePair { first: AssemblyProfileFaceSelection; second: AssemblyProfileFaceSelection }
/** Material direction is explicit increasing native LINE parameter, times sense.
 * This is syntax only; face-edge incidence needs one joint native query. */
export interface AssemblyProfileAxisSelection extends AssemblyProfileFaceSelection { edge: EdgeReference; sense: 1 | -1 }

function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Profile selections require plain data records.')
  const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(descriptors)
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) throw Error('Profile selection has missing or unknown fields.')
  return Object.fromEntries(keys.map(key => {
    const field = descriptors[key]
    if (!field?.enumerable || !('value' in field)) throw Error('Profile selections require own data fields.')
    return [key, field.value]
  }))
}
/** Reuses common face/component/body syntax validation only. The temporary plane
 * declaration neither measures a plane nor grants directional/profile proof. */
export function validateAssemblyProfileFaceSelection(value: unknown): AssemblyProfileFaceSelection {
  const raw = fields(value, ['component', 'body', 'face'])
  const parsed = validateAssemblyGeometryReference({ kind: 'face', component: raw.component, body: raw.body, face: raw.face, support: 'plane' })
  if (parsed.kind !== 'face') throw Error('Profile selection requires an actual face.')
  if (parsed.body !== null && parsed.body.sourceFeatureId !== parsed.face.sourceFeatureId) throw Error('Profile body and face source must agree exactly.')
  return { component: parsed.component, body: parsed.body, face: parsed.face }
}
/** Strict detached ordered identity syntax; no classification or native authority. */
export function validateAssemblyProfileReferencePair(value: unknown): AssemblyProfileReferencePair {
  const raw = fields(value, ['first', 'second'])
  return { first: validateAssemblyProfileFaceSelection(raw.first), second: validateAssemblyProfileFaceSelection(raw.second) }
}
export function validateAssemblyProfileAxisSelection(value: unknown): AssemblyProfileAxisSelection {
  const raw = fields(value, ['component', 'body', 'face', 'edge', 'sense'])
  if (raw.sense !== 1 && raw.sense !== -1) throw Error('Profile edge sense must be explicitly +1 or -1.')
  const face = validateAssemblyProfileFaceSelection({ component: raw.component, body: raw.body, face: raw.face })
  const edge = validateAssemblyGeometryReference({ kind: 'edge', component: raw.component, body: raw.body, edge: raw.edge, support: 'line' })
  if (edge.kind !== 'edge' || edge.edge.sourceFeatureId !== face.face.sourceFeatureId) throw Error('Profile face and edge source must agree exactly.')
  return { ...face, edge: edge.edge, sense: raw.sense }
}
