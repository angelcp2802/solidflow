import type { AssemblyMate } from '../model/assemblyDocument'
import { assemblyOriginReferenceKey, type AssemblyOriginDisplay, type AssemblyOriginReference } from './assemblyOriginPicking'

/** Explicit datum intent only; material capture families keep their own producers. */
export function standardAssemblyOriginKinds(type: AssemblyMate['type']): { axes: boolean; planes: boolean } {
  return {
    axes: ['concentric', 'parallel', 'perpendicular', 'angle', 'limit-angle'].includes(type),
    planes: ['coincident', 'distance', 'parallel', 'perpendicular', 'angle', 'limit-angle', 'limit-distance', 'tangent', 'plane-sphere-tangent'].includes(type),
  }
}

export interface StandardAssemblyOriginPickTicket {
  signature: string
  scope: string
  generation: number
  sceneId: string | null
  family: AssemblyMate['type']
  slot: 0 | 1
  armed: boolean
  blocked: boolean
}

/** Resolve a unique current display entry, never trust a callback's saved owner.
 * Object identity rejects events retained from an earlier rendered intent. */
export function standardAssemblyOriginPick(
  incoming: AssemblyOriginReference | null,
  displays: readonly AssemblyOriginDisplay[],
  expected: StandardAssemblyOriginPickTicket,
  current: StandardAssemblyOriginPickTicket | null,
): AssemblyOriginReference | null {
  if (!incoming || expected !== current || !expected.armed || expected.blocked || !expected.sceneId) return null
  let key: string
  try { key = assemblyOriginReferenceKey(incoming) } catch { return null }
  const matches = displays.filter(value => assemblyOriginReferenceKey(value.reference) === key)
  if (matches.length !== 1) return null
  const reference = matches[0].reference, kinds = standardAssemblyOriginKinds(expected.family)
  if (reference.kind === 'principal-axis' ? !kinds.axes : !kinds.planes) return null
  return structuredClone(reference)
}
