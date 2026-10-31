import { validateAssemblyVertexReference, type AssemblyVertexReference } from './assemblyDocument'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection } from './assemblyArcPathReferences'
import { validateAssemblyLinePathOrientation, type AssemblyLinePathOrientation } from './assemblyLinePathMate'
import type { RigidCircularPathPosition } from './assemblySolveTypes'

/** Shared circular declaration syntax only; no native proof or publication authority. */
export interface AssemblyCircularPathReferenceRequest {
  point: AssemblyVertexReference
  path: AssemblyArcPathSelection
  position: RigidCircularPathPosition
  orientation: AssemblyLinePathOrientation
}
function data(value: unknown, names: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== names.length) throw Error('Circular reference query requires exact plain data.')
  const result: Record<string, unknown> = {}
  for (const name of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, name)!
    if (typeof name !== 'string' || !names.includes(name) || !field.enumerable || !('value' in field)) throw Error('Circular reference query requires own data.')
    result[name] = field.value
  }
  return result
}
export function validateAssemblyCircularPathReferenceRequest(value: unknown): AssemblyCircularPathReferenceRequest {
  const input = data(value, ['point', 'path', 'position', 'orientation'])
  const mode = input.position && typeof input.position === 'object' ? Object.getOwnPropertyDescriptor(input.position, 'mode') : undefined
  if (!mode?.enumerable || !('value' in mode)) throw Error('Circular position must be explicit own data.')
  const p = data(input.position, mode.value === 'free' ? ['mode', 'domain'] : ['mode', 'distanceMm'])
  let position: RigidCircularPathPosition
  if (p.mode === 'free') {
    if (p.domain !== 'trim' && p.domain !== 'support-circle') throw Error('Choose an explicit circular domain.')
    position = { mode: 'free', domain: p.domain }
  } else {
    if (p.mode !== 'coordinate' || typeof p.distanceMm !== 'number' || !Number.isFinite(p.distanceMm) || p.distanceMm < 0) throw Error('Circular distance must be finite and nonnegative.')
    position = { mode: 'coordinate', distanceMm: p.distanceMm }
  }
  return { point: validateAssemblyVertexReference(input.point), path: validateAssemblyArcPathSelection(input.path), position,
    orientation: validateAssemblyLinePathOrientation(input.orientation) }
}
