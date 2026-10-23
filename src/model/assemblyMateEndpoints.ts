import type { AssemblyComponentReference, AssemblyCylinderSurfaceReference, AssemblyGeometryReference,
  AssemblyMate, AssemblyPlaneReference, AssemblySphereSurfaceReference, AssemblyVertexReference, AssemblySymmetryMate } from './assemblyDocument'
import { validateAssemblyMate } from './assemblyDocument'
import type { AssemblyArcPathSelection } from './assemblyArcPathReferences'
import type { AssemblyLinePathSelection } from './assemblyLinePathReferences'
import type { AssemblyLinePathUpReference } from './assemblyLinePathMate'
import type { AssemblyProfileCenterSelection } from './assemblyProfileCenterReferences'

export type AssemblyMateEndpointReference = AssemblyGeometryReference | AssemblyCylinderSurfaceReference
  | AssemblySphereSurfaceReference | AssemblyComponentReference | AssemblyVertexReference | AssemblyProfileCenterSelection | AssemblyLinePathSelection | AssemblyArcPathSelection
export type AssemblyMateEndpointSide = 'angle-0' | 'angle-1' | 'axis-0' | 'axis-1' | 'axial-0' | 'axial-1' | 'point' | 'path' | 'up' | 'first' | 'second' | 'carrier' | 'guide' | 'width-0' | 'width-1' | 'tab-0' | 'tab-1' | 'source' | 'target' | 'mirror'
export type AssemblyMateEndpointEntry =
  | { side: 'point' | 'path' | 'first' | 'second'; reference: AssemblyMateEndpointReference }
  | { side: 'guide'; reference: AssemblyGeometryReference }
  | { side: 'up'; reference: AssemblyLinePathUpReference }
  | { side: 'carrier'; reference: AssemblyComponentReference | null }
  | { side: 'angle-0' | 'angle-1'; reference: NonNullable<Extract<AssemblyMate, {type:'hinge'}>['stops']>['angular'][number] }
  | { side: 'axis-0' | 'axis-1' | 'axial-0' | 'axial-1'; reference: AssemblyPlaneReference | Extract<AssemblyGeometryReference, {kind:'edge'}> | Extract<AssemblyGeometryReference, {kind:'face'}> }
  | { side: 'width-0' | 'width-1' | 'tab-0' | 'tab-1'; reference: AssemblyPlaneReference }
  | { side: 'source' | 'target'; reference: AssemblySymmetryMate['source'] }
  | { side: 'mirror'; reference: AssemblyPlaneReference }

export function isAssemblyMateEndpointSide(value: unknown): value is AssemblyMateEndpointSide {
  return value === 'angle-0' || value === 'angle-1' || value === 'axis-0' || value === 'axis-1' || value === 'axial-0' || value === 'axial-1' || value === 'point' || value === 'path' || value === 'up' || value === 'first' || value === 'second' || value === 'carrier' || value === 'guide'
    || value === 'width-0' || value === 'width-1' || value === 'tab-0' || value === 'tab-1'
    || value === 'source' || value === 'target' || value === 'mirror'
}
function unsupportedMate(_mate: never): never {
  throw new Error('Unknown assembly mate endpoint family.')
}

/** Saved declarations only; entries preserve reference identity and confer no native authority.
 * A null carrier is an actual fixed-scope role; an absent role has no entry. */
export function assemblyMateEndpoints(mate: AssemblyMate): AssemblyMateEndpointEntry[] {
  switch (mate.type) {
    case 'hinge': return [{ side: 'axis-0', reference: mate.axis[0] }, { side: 'axis-1', reference: mate.axis[1] },
      { side: 'axial-0', reference: mate.axial[0] }, { side: 'axial-1', reference: mate.axial[1] },
      ...(mate.stops ? [{ side: 'angle-0' as const, reference: mate.stops.angular[0] }, { side: 'angle-1' as const, reference: mate.stops.angular[1] }] : [])]
    case 'circular-path': case 'line-path': return [{ side: 'point', reference: mate.point }, { side: 'path', reference: mate.path },
      ...(mate.orientation.roll === 'free' ? [] : [{ side: 'up' as const, reference: mate.orientation.roll.guide }])]
    case 'profile-center': return [{ side: 'first', reference: mate.first }, { side: 'second', reference: mate.second }]
    case 'symmetry': return [{ side: 'source', reference: mate.source }, { side: 'target', reference: mate.target }, { side: 'mirror', reference: mate.mirror }]
    case 'width': return [{ side: 'width-0', reference: mate.width[0] }, { side: 'width-1', reference: mate.width[1] },
      { side: 'tab-0', reference: mate.tab[0] }, { side: 'tab-1', reference: mate.tab[1] }]
    case 'gear': return [{ side: 'first', reference: mate.first }, { side: 'second', reference: mate.second },
      { side: 'carrier', reference: mate.carrier }]
    case 'limit-directed-angle': return [{ side: 'first', reference: mate.first }, { side: 'second', reference: mate.second },
      { side: 'guide', reference: mate.guide }]
    case 'concentric': case 'coincident': case 'distance': case 'limit-distance': case 'limit-angle':
    case 'angle': case 'parallel': case 'perpendicular': case 'tangent': case 'skew-cylinder-tangent':
    case 'parallel-cylinder-tangent': case 'plane-sphere-tangent': case 'sphere-sphere-tangent':
    case 'cylinder-sphere-tangent': case 'lock': case 'screw': case 'rack-pinion':
      return [{ side: 'first', reference: mate.first }, { side: 'second', reference: mate.second }]
    default: return unsupportedMate(mate)
  }
}

/** Structural compound shape only. Analytic purpose comes from the mate/role. */
export function isAssemblyPathEndpoint(reference: AssemblyMateEndpointReference): reference is AssemblyLinePathSelection | AssemblyArcPathSelection { return 'startVertex' in reference }
/** Compatibility shape guard; it does not attest a native LINE. */
export function isAssemblyLinePathEndpoint(reference: AssemblyMateEndpointReference): reference is AssemblyLinePathSelection { return isAssemblyPathEndpoint(reference) }
/** The saved family, never compound shape or coordinates, declares path purpose. */
export function assemblyMatePathKind(mate: AssemblyMate, side: AssemblyMateEndpointSide): 'line-path' | 'circular-path' | null {
  return side === 'path' && (mate.type === 'line-path' || mate.type === 'circular-path') ? mate.type : null
}

/** A profile role is one complete face/optional-edge/sense selection. */
export function isAssemblyProfileCenterEndpoint(reference: AssemblyMateEndpointReference): reference is AssemblyProfileCenterSelection {
  return 'axis' in reference
}
export function assemblyMateEndpointComponent(reference: AssemblyMateEndpointReference): AssemblyComponentReference | null {
  return isAssemblyProfileCenterEndpoint(reference) ? reference.face.component : 'occurrencePath' in reference ? reference : reference.component
}
/** Rebind only the owning declaration; compound topology stays explicit and
 * stale until repaired. This function confers no geometry retention authority. */
export function withAssemblyMateEndpointComponent(reference: AssemblyMateEndpointReference, component: AssemblyComponentReference): AssemblyMateEndpointReference {
  const copied = structuredClone(reference), next = structuredClone(component)
  if (isAssemblyProfileCenterEndpoint(copied)) return { ...copied, face: { ...copied.face, component: next } }
  if ('occurrencePath' in copied) return next
  return { ...copied, component: next }
}

/** Undefined means the family has no such role; carrier.reference may explicitly be null. */
export function assemblyMateEndpoint(mate: AssemblyMate, side: AssemblyMateEndpointSide): AssemblyMateEndpointEntry | undefined {
  return assemblyMateEndpoints(mate).find(entry => entry.side === side)
}

/** Return a syntax-validated declaration copy. Group roles never become object keys.
 * The parser checks reference purpose; current native geometry is checked elsewhere. */
export function withAssemblyMateEndpoint(input: AssemblyMate, side: AssemblyMateEndpointSide,
  reference: AssemblyMateEndpointReference | null): AssemblyMate {
  const mate = validateAssemblyMate(input)
  if (!isAssemblyMateEndpointSide(side) || !assemblyMateEndpoint(mate, side)) throw new Error('The mate has no such endpoint role.')
  if (mate.type === 'line-path' || mate.type === 'circular-path') {
    if (side === 'up' && mate.orientation.roll !== 'free') return validateAssemblyMate({ ...mate, orientation: {
      ...mate.orientation, roll: { ...mate.orientation.roll, guide: reference },
    } })
    if (side !== 'point' && side !== 'path') throw Error('Material path requires an atomic point, path or existing UP role.')
    return validateAssemblyMate({ ...mate, [side]: reference })
  }
  if (mate.type === 'profile-center') {
    if (side !== 'first' && side !== 'second') throw new Error('Profile center requires a complete first or second selection.')
    return validateAssemblyMate({ ...mate, [side]: reference })
  }
  if (mate.type === 'symmetry') {
    switch (side) {
      case 'source': return validateAssemblyMate({ ...mate, source: reference })
      case 'target': return validateAssemblyMate({ ...mate, target: reference })
      case 'mirror': return validateAssemblyMate({ ...mate, mirror: reference })
      default: throw new Error('Symmetry requires an explicit source, target or mirror role.')
    }
  }
  if (mate.type === 'hinge') {
    switch (side) {
      case 'angle-0': case 'angle-1':
        if (!mate.stops) throw Error('Unlimited hinge has no angular reference role.')
        return validateAssemblyMate({ ...mate, stops: { ...mate.stops,
          angular: side === 'angle-0' ? [reference, mate.stops.angular[1]] : [mate.stops.angular[0], reference] } })
      case 'axis-0': return validateAssemblyMate({ ...mate, axis: [reference, mate.axis[1]] })
      case 'axis-1': return validateAssemblyMate({ ...mate, axis: [mate.axis[0], reference] })
      case 'axial-0': return validateAssemblyMate({ ...mate, axial: [reference, mate.axial[1]] })
      case 'axial-1': return validateAssemblyMate({ ...mate, axial: [mate.axial[0], reference] })
      default: throw Error('Hinge requires an explicit axis or axial role.')
    }
  }
  if (mate.type === 'width') {
    switch (side) {
      case 'width-0': return validateAssemblyMate({ ...mate, width: [reference, mate.width[1]] })
      case 'width-1': return validateAssemblyMate({ ...mate, width: [mate.width[0], reference] })
      case 'tab-0': return validateAssemblyMate({ ...mate, tab: [reference, mate.tab[1]] })
      case 'tab-1': return validateAssemblyMate({ ...mate, tab: [mate.tab[0], reference] })
      default: throw new Error('Width requires an explicit grouped endpoint role.')
    }
  }
  return validateAssemblyMate({ ...mate, [side]: reference })
}

