import type { AssemblyGeometryReference } from './assemblyDocument'

export type AssemblyDirectionMateType = 'parallel' | 'perpendicular'
export type AssemblyDirectionSupportKind = 'plane' | 'cylinder' | 'line'
export type AssemblyDirectionAlignment = 'aligned' | 'opposed' | null

/** Direction semantics only: a cylinder reference explicitly selects its axis. */
export function assemblyDirectionMateObjective(type: AssemblyDirectionMateType,
  first: AssemblyDirectionSupportKind, second: AssemblyDirectionSupportKind): 'collinear' | 'orthogonal' {
  if (type !== 'parallel' && type !== 'perpendicular') throw new Error('Unknown direction mate family.')
  if (![first, second].every(kind => kind === 'plane' || kind === 'cylinder' || kind === 'line')) throw new Error('Unknown direction support kind.')
  const mixed = (first === 'plane') !== (second === 'plane')
  return (type === 'parallel') !== mixed ? 'collinear' : 'orthogonal'
}

/** Internal normal/axis target, in degrees. It is never a saved angle field. */
export function assemblyDirectionMateAngle(type: AssemblyDirectionMateType, first: AssemblyDirectionSupportKind,
  second: AssemblyDirectionSupportKind, alignment: unknown): 0 | 90 | 180 {
  if (assemblyDirectionMateObjective(type, first, second) === 'collinear') {
    if (alignment !== 'aligned' && alignment !== 'opposed') throw new Error('Direction mate collinearity requires aligned or opposed.')
    return alignment === 'aligned' ? 0 : 180
  }
  if (alignment !== null) throw new Error('Direction mate orthogonality requires null alignment.')
  return 90
}

function field(value: AssemblyGeometryReference, name: string): unknown {
  if (!value || typeof value !== 'object') throw new Error('Expected a direction reference declaration.')
  const descriptor = Object.getOwnPropertyDescriptor(value, name)
  if (!descriptor || !('value' in descriptor)) throw new Error('Direction reference fields must be own data.')
  return descriptor.value
}

/** Classifies saved intent only; it cannot attest a native support or reference. */
export function assemblyDirectionReferenceKind(reference: AssemblyGeometryReference): AssemblyDirectionSupportKind {
  const kind = field(reference, 'kind')
  if (kind === 'principal-plane') return 'plane'
  const support = field(reference, 'support')
  if (kind === 'face' && support === 'plane') return 'plane'
  if (kind === 'face' && support === 'axis') return 'cylinder'
  if (kind === 'edge' && support === 'line') return 'line'
  throw new Error('Unknown direction reference declaration.')
}
