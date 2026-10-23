import { validateAssemblyGeometryReference } from './assemblyDocument'
import { validateAssemblyProfileFaceSelection, type AssemblyProfileFaceSelection } from './assemblyProfileReferences'
import type { EdgeReference } from '../cad/kernel.types'

export interface AssemblyProfileCenterSelection { face: AssemblyProfileFaceSelection; axis: { edge: EdgeReference; sense: 1 | -1 } | null }
export interface AssemblyProfileCenterReferenceRequest {
  first: AssemblyProfileCenterSelection
  second: AssemblyProfileCenterSelection
  alignment: 'aligned' | 'opposed'
  offsetMm: number
  orientation: { mode: 'free' } | { mode: 'rectangle'; quarterTurns: 0 | 1 | 2 | 3 }
}
function record(value: unknown, names: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('Profile center references require plain data.')
  if (Reflect.ownKeys(value).length !== names.length) throw Error('Profile center reference fields must be exact.')
  const result: Record<string, unknown> = {}
  for (const name of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, name)!
    if (typeof name !== 'string' || !names.includes(name) || !field.enumerable || !('value' in field)) throw Error('Profile center references require own data fields.')
    result[name] = field.value
  }
  return result
}
export function validateAssemblyProfileCenterReferenceRequest(value: unknown): AssemblyProfileCenterReferenceRequest {
  const raw = record(value, ['first', 'second', 'alignment', 'offsetMm', 'orientation'])
  if (raw.alignment !== 'aligned' && raw.alignment !== 'opposed') throw Error('Profile center alignment must be explicit.')
  if (typeof raw.offsetMm !== 'number' || !Number.isFinite(raw.offsetMm)) throw Error('Profile center offset must be finite.')
  const mode = raw.orientation && typeof raw.orientation === 'object' ? Object.getOwnPropertyDescriptor(raw.orientation, 'mode') : undefined
  if (!mode?.enumerable || !('value' in mode) || !['free', 'rectangle'].includes(mode.value)) throw Error('Profile center orientation must be explicit data.')
  const o = record(raw.orientation, mode.value === 'free' ? ['mode'] : ['mode', 'quarterTurns'])
  if (o.mode === 'rectangle' && ![0, 1, 2, 3].includes(o.quarterTurns as number)) throw Error('Profile center quarter turns must be 0..3.')
  const selection = (value: unknown): AssemblyProfileCenterSelection => {
    const s = record(value, ['face', 'axis']), face = validateAssemblyProfileFaceSelection(s.face)
    if (o.mode === 'free') { if (s.axis !== null) throw Error('Free profile orientation requires null axes.'); return { face, axis: null } }
    const a = record(s.axis, ['edge', 'sense'])
    if (a.sense !== 1 && a.sense !== -1) throw Error('Material edge sense must be +1 or -1.')
    const edge = validateAssemblyGeometryReference({ kind: 'edge', component: face.component, body: face.body, edge: a.edge, support: 'line' })
    if (edge.kind !== 'edge' || edge.edge.sourceFeatureId !== face.face.sourceFeatureId) throw Error('Profile face and material edge sources must agree.')
    return { face, axis: { edge: edge.edge, sense: a.sense } }
  }
  return { first: selection(raw.first), second: selection(raw.second), alignment: raw.alignment, offsetMm: raw.offsetMm,
    orientation: o.mode === 'free' ? { mode: 'free' } : { mode: 'rectangle', quarterTurns: o.quarterTurns as 0 | 1 | 2 | 3 } }
}
