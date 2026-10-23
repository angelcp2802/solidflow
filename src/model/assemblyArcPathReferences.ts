import { validateAssemblyVertexReference, type AssemblyComponentReference } from './assemblyDocument'
import { validateAssemblyPathCurveSelection } from './assemblyPathReferences'
import type { BodyReference, EdgeReference, VertexReference } from '../cad/kernel.types'

/** Declared material origin for a current open circular trim. Syntax alone
 * supplies neither native curve/incidence authority nor a saved mate. */
export interface AssemblyArcPathSelection {
  component: AssemblyComponentReference
  body: BodyReference | null
  edge: EdgeReference
  startVertex: VertexReference
}

export function validateAssemblyArcPathSelection(value: unknown): AssemblyArcPathSelection {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Material arc selection requires plain data.')
  const raw: Record<string, unknown> = {}, keys = ['component', 'body', 'edge', 'startVertex']
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !keys.includes(key) || !field.enumerable || !('value' in field)) throw Error('Material arc selection requires exact own data fields.')
    raw[key] = field.value
  }
  if (keys.some(key => !Object.hasOwn(raw, key))) throw Error('Incomplete material arc selection.')
  // Reuse locator syntax, without creating a LINE support or proof. Actual
  // circular kind and joint endpoint incidence are checked in the CAD engine.
  const edge = validateAssemblyPathCurveSelection({ component: raw.component, body: raw.body, edge: raw.edge, sense: 1 })
  const point = validateAssemblyVertexReference({ kind: 'vertex', component: raw.component, body: raw.body, vertex: raw.startVertex, support: 'point' })
  if (point.vertex.sourceFeatureId !== edge.edge.sourceFeatureId) throw Error('Arc and material origin must share the exact producer.')
  return { component: edge.component, body: edge.body, edge: edge.edge, startVertex: point.vertex }
}
