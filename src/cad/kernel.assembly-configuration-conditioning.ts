import { MAX_ASSEMBLY_MATES } from '../model/assemblyDocument'
import type { RigidMateConstraint, RigidMateEndpoint, RigidProfileCenterEndpoint, RigidLinePathEndpoint, RigidCircularPathEndpoint } from '../model/assemblySolveTypes'
import { transformRigidPoint, type RigidPose } from '../model/rigidPose'
import { assemblyTangentAxisPoint, assemblyTangentPlanePoint } from '../model/assemblyTangentMates'
import { assemblyRackPinionAxisPoint } from '../model/assemblyRackPinion'
import type { Vec3 } from './kernel.types'
import type { AssemblyConfigurationGeometryInput, AssemblyConfigurationGeometrySnapshot, AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import { type ConfiguredResolvedMate } from './kernel.assembly-configuration-relations'
import { assertConfiguredAssemblyNumericalScope, assertConfiguredAssemblyScopedRelation, type ConfiguredAssemblyNumericalScope } from './kernel.assembly-configuration-scope'
import { buildConfiguredAssemblyScopedConstraint, type ConfiguredAssemblyNumericOptions } from './kernel.assembly-configuration-numeric'
import { authenticateConfiguredMeasurement, configuredMeasurementBands } from './kernel.assembly-configuration-measurement'

const ROUND = 128 * Number.EPSILON
// Gear phase consumes rotations and native axis directions, never an origin
// or radius; its explicit carrier is directional even in a mixed problem.
const directionOnly = (type: RigidMateConstraint['type']): boolean => type === 'gear' || type === 'angle' || type === 'parallel' || type === 'perpendicular' || type === 'limit-angle' || type === 'limit-directed-angle'
function denseValues(input: readonly ConfiguredResolvedMate[]): ConfiguredResolvedMate[] {
 if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype || input.length > MAX_ASSEMBLY_MATES
  || Reflect.ownKeys(input).length !== input.length + 1) throw Error('Configured conditioning requires a bounded dense relation list.')
 const values: ConfiguredResolvedMate[] = []
 for (let index = 0; index < input.length; index++) {
  const field = Object.getOwnPropertyDescriptor(input, String(index))
  if (!field?.enumerable || !('value' in field) || field.value === undefined) throw Error('Configured conditioning relation entries must be own data.')
  values.push(field.value)
 }
 return values
}
function finite(value: number): number {
 if (!Number.isFinite(value)) throw new RangeError('Configured numerical conditioning exceeds finite coordinates.')
 return value
}
/** Build authenticated scoped numerical intent once, then select its static
 * conditioning frame. No caller-supplied numerical DTO can stand in for proof.
 * Original native/placement uncertainty remains enforced by the builders. */
export function conditionConfiguredAssemblyScope(snapshot: AssemblyConfigurationGeometrySnapshot,
 input: AssemblyConfigurationGeometryInput, scope: ConfiguredAssemblyNumericalScope,
 requestedValues: readonly ConfiguredResolvedMate[], options: ConfiguredAssemblyNumericOptions = {}): {
 origin: Vec3; lengthScale: number; constraints: RigidMateConstraint[]
} {
 assertConfiguredAssemblyNumericalScope(snapshot, input, scope)
 const values = denseValues(requestedValues), bands = configuredMeasurementBands(options), ids = new Set<string>()
 // Authenticate the entire list before building any numerical data. The exact
 // declaration namespace is local to this one placed selected state.
 for (const value of values) {
  authenticateConfiguredMeasurement(snapshot, input, value)
  assertConfiguredAssemblyScopedRelation(snapshot, input, scope, value)
  if (ids.has(value.mate.id)) throw Error('Configured conditioning cannot select a declaration twice.')
  ids.add(value.mate.id)
  if (value.suppressed && value.mate.type !== 'gear' && value.mate.type !== 'screw' && value.mate.type !== 'rack-pinion') throw Error('Only passive mechanical declarations may enter suppressed conditioning.')
 }
 const constraints = values.map(value => buildConfiguredAssemblyScopedConstraint(snapshot, input, scope, value, value.mate.id, bands))
 const bodies = new Map(scope.bodies.map(body => [body.id, body]))
 const points: Vec3[] = [], positionalOwners = new Set<string>(), directionalOwners = new Set<string>()
 let extent = 1, hasPositional = false
 const addExtent = (value: number) => { extent = Math.max(extent, Math.abs(finite(value))) }
 const addPoint = (value: readonly number[]) => {
  if (value.length !== 3 || !value.every(Number.isFinite)) throw new RangeError('Configured conditioning point is not finite.')
  points.push([value[0], value[1], value[2]])
 }
 type Endpoint = Pick<RigidMateEndpoint, 'bodyId' | 'frame'>
 const owner = (endpoint: Endpoint, positional: boolean) => {
  if (endpoint.bodyId === null) return
  if (!bodies.has(endpoint.bodyId)) throw Error('The conditioned endpoint names a foreign numerical body.')
  ;(positional ? positionalOwners : directionalOwners).add(endpoint.bodyId)
 }
 const place = (endpoint: Endpoint, local: Vec3): Vec3 => {
  const framed = transformRigidPoint(endpoint.frame, local)
  if (endpoint.bodyId === null) return framed
  const body = bodies.get(endpoint.bodyId)
  if (!body) throw Error('The conditioned endpoint names a missing numerical body.')
  return transformRigidPoint(body.pose as RigidPose, framed)
 }
 const endpointOrigin = (endpoint: Endpoint) => { owner(endpoint, true); addPoint(place(endpoint, [0, 0, 0])) }
 const directionEndpoint = (endpoint: Endpoint) => owner(endpoint, false)
 const positionEndpoint = (endpoint: RigidMateEndpoint, radiusUsed = false, originOnly = false, rackAxis = false) => {
  owner(endpoint, true)
  const support = endpoint.support
  if (!support || originOnly) { endpointOrigin(endpoint); return }
  let point: Vec3 = [...support.point]
  if (support.kind === 'plane') point = assemblyTangentPlanePoint(point, [...support.normal], bands.lengthToleranceMm)
  if (support.kind === 'line' || support.kind === 'cylinder') point = rackAxis
   ? assemblyRackPinionAxisPoint(point, [...support.axis], bands.lengthToleranceMm)
   : assemblyTangentAxisPoint(point, [...support.axis], bands.lengthToleranceMm)
  addPoint(place(endpoint, point))
  if (radiusUsed && (support.kind === 'sphere' || support.kind === 'cylinder')) addExtent(support.radius)
 }
 const profileEndpoint = (endpoint: RigidProfileCenterEndpoint, witness: AssemblyConfigurationWitness) => {
  owner(endpoint, true); addPoint(place(endpoint, [...endpoint.profile.center]))
  if (witness.kind !== 'configured-profile' && witness.kind !== 'configured-profile-axis') throw Error('Configured profile conditioning requires its full bounded native purpose.')
  const profile = witness.kind === 'configured-profile-axis' ? witness.localSupport.profile : witness.localSupport
  if (profile.kind === 'circle') addExtent(2 * profile.radiusMm)
  else {
   for (const corner of profile.corners) addPoint(place(endpoint, [...corner]))
   for (const length of profile.lengthsMm) addExtent(length)
  }
 }
 const pathEndpoint = (endpoint: RigidLinePathEndpoint | RigidCircularPathEndpoint) => {
  owner(endpoint, true)
  if ('line' in endpoint) {
   addPoint(place(endpoint, [...endpoint.line.start])); addExtent(endpoint.line.lengthMm)
   // The finite observed segment is a conditioning extent even when the saved
   // Free policy admits its underlying line rather than a bounded interval.
   const end = endpoint.line.start.map((v, i) => finite(v + endpoint.line.lengthMm * endpoint.line.direction[i])) as Vec3
   addPoint(place(endpoint, end))
  } else {
   addPoint(place(endpoint, [...endpoint.arc.center])); addExtent(2 * endpoint.arc.radiusMm)
   addExtent(endpoint.arc.radiusMm * endpoint.arc.sweepRad)
  }
 }
 for (let index = 0; index < constraints.length; index++) {
  const constraint = constraints[index], value = values[index]
  if (constraint.id !== value.mate.id || constraint.type !== value.mate.type) throw Error('Configured conditioning lost the exact declaration identity.')
  const passive = value.suppressed && (constraint.type === 'gear' || constraint.type === 'screw' || constraint.type === 'rack-pinion')
  if (passive || directionOnly(constraint.type)) {
   if (!('first' in constraint) || !('second' in constraint)) throw Error('Configured angular conditioning has a foreign family.')
   directionEndpoint(constraint.first); directionEndpoint(constraint.second)
   if (constraint.type === 'limit-directed-angle') directionEndpoint(constraint.guide)
   if (constraint.type === 'gear' && constraint.carrier) directionEndpoint(constraint.carrier)
   continue
  }
  hasPositional = true
  switch (constraint.type) {
   case 'width': for (const endpoint of [...constraint.width, ...constraint.tab]) positionEndpoint(endpoint); break
   case 'symmetry': {
    const sourceRadius = constraint.source.support?.kind === 'sphere' || constraint.source.support?.kind === 'cylinder'
    positionEndpoint(constraint.source, sourceRadius); positionEndpoint(constraint.target, sourceRadius); positionEndpoint(constraint.mirror)
    break
   }
   case 'profile-center': {
    if (value.mate.type !== 'profile-center' || !('first' in value)) throw Error('Foreign configured profile declaration.')
    profileEndpoint(constraint.first, value.first); profileEndpoint(constraint.second, value.second); addExtent(constraint.offsetMm); break
   }
   case 'line-path': case 'circular-path':
    positionEndpoint(constraint.first); pathEndpoint(constraint.second)
    if (constraint.type === 'line-path' && constraint.coordinateMm !== null) addExtent(constraint.coordinateMm)
    if (constraint.type === 'circular-path' && constraint.position.mode === 'coordinate') addExtent(constraint.position.distanceMm)
    if (constraint.roll) directionEndpoint(constraint.roll.guide)
    break
   case 'hinge':
    for (const endpoint of [...constraint.axis, ...constraint.axial]) positionEndpoint(endpoint)
    if (constraint.stops) for (const endpoint of constraint.stops.angular) directionEndpoint(endpoint)
    break
   case 'screw':
    positionEndpoint(constraint.first); positionEndpoint(constraint.second)
    endpointOrigin(constraint.first); endpointOrigin(constraint.second); addExtent(constraint.lead); addExtent(constraint.neutralTravel); break
   case 'rack-pinion':
    positionEndpoint(constraint.first, constraint.conversion.override === null, false, true); endpointOrigin(constraint.first); endpointOrigin(constraint.second)
    addExtent(constraint.neutralTravel); if (constraint.conversion.override !== null) addExtent(constraint.conversion.override); break
   case 'lock':
    endpointOrigin(constraint.first); endpointOrigin(constraint.second)
    for (const value of constraint.relativePose.translation) addExtent(value); break
   case 'distance': positionEndpoint(constraint.first); positionEndpoint(constraint.second); addExtent(constraint.distance); break
   case 'limit-distance':
    positionEndpoint(constraint.first); positionEndpoint(constraint.second); addExtent(constraint.limits.minimum); addExtent(constraint.limits.maximum); break
   case 'tangent': case 'plane-sphere-tangent': case 'sphere-sphere-tangent': case 'cylinder-sphere-tangent': case 'skew-cylinder-tangent': case 'parallel-cylinder-tangent':
    positionEndpoint(constraint.first, true); positionEndpoint(constraint.second, true); break
   case 'concentric': case 'coincident': positionEndpoint(constraint.first); positionEndpoint(constraint.second); break
   case 'gear': case 'angle': case 'parallel': case 'perpendicular': case 'limit-angle': case 'limit-directed-angle': throw Error('An angular-only family reached positional conditioning.')
   default: { const never: never = constraint; throw Error('Unknown configured conditioning family ' + String(never)) }
  }
 }
 // When there are no active positional equations, irrelevant body origins,
 // unused radii and passive mechanism translations cannot choose length units.
 if (!hasPositional) {
  for (const value of values) authenticateConfiguredMeasurement(snapshot, input, value)
  assertConfiguredAssemblyNumericalScope(snapshot, input, scope)
  return { origin: [0, 0, 0], lengthScale: 1, constraints }
 }
 // In mixed problems, retain conservative origins for unreferenced bodies;
 // exempt only owners proven to have exclusively directional incidence.
 for (const body of scope.bodies) if (!directionalOwners.has(body.id) || positionalOwners.has(body.id)) addPoint(body.pose.translation)
 const minimum: Vec3 = [Infinity, Infinity, Infinity], maximum: Vec3 = [-Infinity, -Infinity, -Infinity]
 for (const point of points) for (let axis = 0; axis < 3; axis++) {
  minimum[axis] = Math.min(minimum[axis], point[axis]); maximum[axis] = Math.max(maximum[axis], point[axis])
 }
 const origin: Vec3 = points.length ? minimum.map((v, axis) => finite(v / 2 + maximum[axis] / 2)) as Vec3 : [0, 0, 0]
 let lengthScale = extent, magnitude = extent
 for (const point of points) for (let axis = 0; axis < 3; axis++) {
  lengthScale = Math.max(lengthScale, Math.abs(finite(point[axis] - origin[axis]))); magnitude = Math.max(magnitude, Math.abs(point[axis]))
 }
 if (!Number.isFinite(lengthScale) || ROUND * Math.max(magnitude, lengthScale) > bands.lengthToleranceMm) throw new RangeError('Configured numerical coordinates cannot retain the requested length precision.')
 for (const value of values) authenticateConfiguredMeasurement(snapshot, input, value)
 assertConfiguredAssemblyNumericalScope(snapshot, input, scope)
 return { origin, lengthScale, constraints }
}
