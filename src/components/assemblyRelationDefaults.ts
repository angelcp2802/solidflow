import type { AssemblyGeometryReference } from '../model/assemblyDocument'

export type AssemblyOrdinaryCreationType = 'coincident' | 'concentric' | 'distance' | 'angle' | 'parallel' | 'perpendicular'

export function isAssemblyOrdinaryCreationType(type: string): type is AssemblyOrdinaryCreationType {
  return type === 'coincident' || type === 'concentric' || type === 'distance' || type === 'angle'
    || type === 'parallel' || type === 'perpendicular'
}

function family(reference: AssemblyGeometryReference): 'plane' | 'axis' | 'line' | null {
  if (reference.kind === 'principal-plane' || reference.kind === 'face' && reference.support === 'plane') return 'plane'
  if (reference.kind === 'principal-axis' || reference.kind === 'face' && reference.support === 'axis') return 'axis'
  return reference.kind === 'edge' && reference.support === 'line' ? 'line' : null
}

/** Declaration compatibility only. Geometry, solvability and Apply remain native checks. */
export function assemblyRelationDefault(references: readonly AssemblyGeometryReference[], preferred: AssemblyOrdinaryCreationType): AssemblyOrdinaryCreationType | null {
  if (references.length < 1 || references.length > 2) return null
  const kinds = references.map(family)
  if (kinds.some(kind => kind === null)) return null
  const planes = kinds.every(kind => kind === 'plane'), axes = kinds.every(kind => kind === 'axis')
  if (planes && (preferred === 'coincident' || preferred === 'distance')) return preferred
  if (axes && preferred === 'concentric') return preferred
  if (preferred === 'angle' || preferred === 'parallel' || preferred === 'perpendicular') return preferred
  if (planes) return 'coincident'
  if (axes) return 'concentric'
  return 'parallel'
}
