import { validateAssemblyGeometryReference, type AssemblyComponentReference } from './assemblyDocument'
import type { BodyReference, EdgeReference } from '../cad/kernel.types'
import type { AssemblyPathCurveBands, AssemblyPathCurveCoordinate } from '../cad/kernel.assembly-path-curves'

/** Current edge identity and explicit native parameter sense. This is neither
 * a saved path mate nor a promise that a rebuilt edge retains its start/seam. */
export interface AssemblyPathCurveSelection { component: AssemblyComponentReference; body: BodyReference | null; edge: EdgeReference; sense: 1 | -1 }

function data(value: unknown, allowed: string[], required = allowed): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Path declarations require plain data records.')
  const result: Record<string, unknown> = {}
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key)!
    if (typeof key !== 'string' || !allowed.includes(key) || !field.enumerable || !('value' in field)) throw Error('Path declarations require exact own data fields.')
    result[key] = field.value
  }
  if (required.some(key => !Object.hasOwn(result, key))) throw Error('Path declaration is incomplete.')
  return result
}
export function validateAssemblyPathCurveSelection(value: unknown): AssemblyPathCurveSelection {
  const raw = data(value, ['component', 'body', 'edge', 'sense'])
  if (raw.sense !== 1 && raw.sense !== -1) throw Error('Choose an explicit path parameter sense, +1 or -1.')
  // Reuse identity syntax only. No infinite LINE query or witness is created.
  const parsed = validateAssemblyGeometryReference({ kind: 'edge', component: raw.component, body: raw.body, edge: raw.edge, support: 'line' })
  if (parsed.kind !== 'edge' || parsed.body && parsed.body.sourceFeatureId !== parsed.edge.sourceFeatureId) throw Error('Path edge and body producer must agree.')
  return { component: parsed.component, body: parsed.body, edge: parsed.edge, sense: raw.sense }
}
export function validateAssemblyPathCoordinate(value: unknown): AssemblyPathCurveCoordinate {
  const raw = data(value, ['kind', 'parameter', 'distanceMm'], ['kind'])
  if (raw.kind !== 'parameter' && raw.kind !== 'arc-length') throw Error('Unknown path coordinate purpose.')
  const key = raw.kind === 'parameter' ? 'parameter' : 'distanceMm'
  if (Object.keys(raw).length !== 2 || !Object.hasOwn(raw, key) || typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) throw Error('Path coordinate must have one finite own numerical value.')
  return raw.kind === 'parameter' ? { kind: raw.kind, parameter: raw[key] as number } : { kind: raw.kind, distanceMm: raw[key] as number }
}
export function validateAssemblyPathBands(value: unknown = {}): AssemblyPathCurveBands {
  const raw = data(value, ['lengthToleranceMm', 'angleToleranceRad'], []), result: AssemblyPathCurveBands = {}
  for (const key of ['lengthToleranceMm', 'angleToleranceRad'] as const) if (Object.hasOwn(raw, key)) {
    const n = raw[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || key === 'angleToleranceRad' && n >= Math.PI) throw Error('Invalid path numerical resolution.')
    result[key] = n
  }
  return result
}
