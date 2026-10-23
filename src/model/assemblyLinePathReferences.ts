import { validateAssemblyVertexReference } from './assemblyDocument'
import { validateAssemblyPathCurveSelection } from './assemblyPathReferences'
import type { AssemblyComponentReference } from './assemblyDocument'
import type { BodyReference, EdgeReference, VertexReference } from '../cad/kernel.types'
export interface AssemblyLinePathSelection { component: AssemblyComponentReference; body: BodyReference | null; edge: EdgeReference; startVertex: VertexReference }
export function validateAssemblyLinePathSelection(value: unknown): AssemblyLinePathSelection {
  if (!value || typeof value !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw Error('Material line selection requires plain data.')
  const raw: Record<string,unknown> = {}, keys = ['component','body','edge','startVertex']
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value,key)!
    if (typeof key !== 'string' || !keys.includes(key) || !field.enumerable || !('value' in field)) throw Error('Material line selection requires exact own data fields.')
    raw[key] = field.value
  }
  if (keys.some(key => !Object.hasOwn(raw,key))) throw Error('Incomplete material line selection.')
  const edge = validateAssemblyPathCurveSelection({component:raw.component,body:raw.body,edge:raw.edge,sense:1})
  const point = validateAssemblyVertexReference({kind:'vertex',component:raw.component,body:raw.body,vertex:raw.startVertex,support:'point'})
  if (point.vertex.sourceFeatureId !== edge.edge.sourceFeatureId) throw Error('Line and material origin must share the exact producer.')
  return {component:edge.component,body:edge.body,edge:edge.edge,startVertex:point.vertex}
}
