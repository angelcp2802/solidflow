import type { RigidMateConstraint, RigidMateEndpoint } from './assemblySolveTypes'

export type RigidMateEndpointRole = 'angle-0' | 'angle-1' | 'axis-0' | 'axis-1' | 'axial-0' | 'axial-1' | 'first' | 'second' | 'carrier' | 'guide' | 'width-0' | 'width-1' | 'tab-0' | 'tab-1' | 'source' | 'target' | 'mirror'
export interface RigidMateEndpointEntry { role: RigidMateEndpointRole; endpoint: RigidMateEndpoint | null }
function unsupportedConstraint(_constraint: never): never {
  throw new Error('Unknown numerical mate endpoint family.')
}
/** Ordered numerical incidence only, not native reference authority. A null gear
 * carrier is a real fixed-scope role. Repeated owners and nulls are not deduplicated. */
export function rigidMateConstraintEndpointEntries(constraint: RigidMateConstraint): RigidMateEndpointEntry[] {
  switch (constraint.type) {
    case 'hinge': return [{role:'axis-0',endpoint:constraint.axis[0]},{role:'axis-1',endpoint:constraint.axis[1]},{role:'axial-0',endpoint:constraint.axial[0]},{role:'axial-1',endpoint:constraint.axial[1]},
      ...(constraint.stops ? [{role:'angle-0' as const,endpoint:constraint.stops.angular[0]},{role:'angle-1' as const,endpoint:constraint.stops.angular[1]}] : [])]
    case 'symmetry': return [{ role: 'source', endpoint: constraint.source }, { role: 'target', endpoint: constraint.target },
      { role: 'mirror', endpoint: constraint.mirror }]
    case 'width': return [
      { role: 'width-0', endpoint: constraint.width[0] }, { role: 'width-1', endpoint: constraint.width[1] },
      { role: 'tab-0', endpoint: constraint.tab[0] }, { role: 'tab-1', endpoint: constraint.tab[1] },
    ]
    case 'gear': return [{ role: 'first', endpoint: constraint.first }, { role: 'second', endpoint: constraint.second },
      { role: 'carrier', endpoint: constraint.carrier }]
    case 'limit-directed-angle': return [{ role: 'first', endpoint: constraint.first }, { role: 'second', endpoint: constraint.second },
      { role: 'guide', endpoint: constraint.guide }]
    case 'circular-path': case 'line-path': return [{role:'first',endpoint:constraint.first},{role:'second',endpoint:constraint.second},...(constraint.roll?[{role:'guide' as const,endpoint:constraint.roll.guide}]:[])]
    case 'profile-center': case 'concentric': case 'coincident': case 'distance': case 'limit-distance': case 'limit-angle':
    case 'angle': case 'parallel': case 'perpendicular': case 'tangent': case 'skew-cylinder-tangent':
    case 'parallel-cylinder-tangent': case 'plane-sphere-tangent': case 'sphere-sphere-tangent':
    case 'cylinder-sphere-tangent': case 'lock': case 'screw': case 'rack-pinion':
      return [{ role: 'first', endpoint: constraint.first }, { role: 'second', endpoint: constraint.second }]
    default: return unsupportedConstraint(constraint)
  }
}
export function rigidMateConstraintEndpoints(constraint: RigidMateConstraint): (RigidMateEndpoint | null)[] {
  return rigidMateConstraintEndpointEntries(constraint).map(entry => entry.endpoint)
}
