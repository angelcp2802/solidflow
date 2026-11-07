import { assemblyDefinitionKey, assemblyOccurrencePathKey, validateAssemblyDocument, type AssemblyDocument, type AssemblyDefinition } from '../model/assemblyDocument'
import { validateAssemblyCircularPathReferenceRequest, type AssemblyCircularPathReferenceRequest } from '../model/assemblyCircularPathReferences'
import { assemblyLinePathFollowAxis, assemblyLinePathRollAxis } from '../model/assemblyLinePathMate'
import { validateAssemblyPathBands } from '../model/assemblyPathReferences'
import { copyRigidCircularPathConstraint } from '../model/assemblyCircularPathNumeric'
import type { RigidCircularPathConstraint, RigidMateEndpoint } from '../model/assemblySolveTypes'
import { composeRigidPoses, identityRigidPose, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyPointPlacementArithmetic, assemblyArcPathPlacementArithmetic, assemblyEndpointPlacementArithmetic,
  type AssemblyArcPathWitness, type AssemblyPointWitness, type AssemblyEndpointWitness, type AssemblyReadonly } from './kernel.assembly-snapshot'
import type { AssemblyPathCurveBands } from './kernel.assembly-path-curves'
import { NativeCleanupError } from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

const ROUND = 128 * Number.EPSILON
const norm = (value: readonly number[]) => Math.hypot(...value)
export interface AssemblyCircularPathResolution {
  readonly kind: 'circular-path-resolution'
  readonly uncertaintyModel: 'current-native-analytic-float64'
  readonly topologyTolerancesMm: Readonly<{ point: number; path: number }>
  readonly scopePath: readonly string[]
  readonly componentPaths: Readonly<{ point: readonly string[]; path: readonly string[]; up?: readonly string[] }>
  readonly request: AssemblyReadonly<AssemblyCircularPathReferenceRequest>
  readonly constraint: AssemblyReadonly<RigidCircularPathConstraint>
  readonly point: AssemblyPointWitness
  readonly path: AssemblyArcPathWitness
  readonly up?: AssemblyEndpointWitness
}
const resolutions = new WeakMap<object, { snapshot: AssemblyGeometrySnapshot }>()
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value) }
  return value
}
/** Root rigid-owner incidence. Reconstruct the nested frame from declarations,
 * rather than cancelling already-composed distant world placements. scopePath
 * selects reference context; it never creates a free child inside a rigid root. */
function ownerFrame(document: AssemblyDocument, componentPath: readonly string[]): Pick<RigidMateEndpoint, 'bodyId' | 'frame'> {
  if (!componentPath.length) throw Error('Circular material references need an actual part occurrence.')
  const definitions = new Map([document, ...document.definitions].map(item => [assemblyDefinitionKey(item), item]))
  let definition: AssemblyDefinition = document, frame: RigidPose = identityRigidPose()
  for (let index = 0; index < componentPath.length; index++) {
    if (definition.kind !== 'assembly') throw Error('Circular owner path crosses a part.')
    const occurrence = definition.occurrences.find(item => item.id === componentPath[index])
    if (!occurrence || occurrence.suppressed) throw Error('Circular owner path is unavailable.')
    if (index > 0) frame = composeRigidPoses(frame, occurrence.pose)
    const next = definitions.get(assemblyDefinitionKey(occurrence.definition))
    if (!next) throw Error('Circular owner source is missing.')
    definition = next
  }
  if (definition.kind !== 'part') throw Error('Circular material reference must resolve to a part.')
  return { bodyId: componentPath[0], frame }
}
/** Only the issued tuple, its live snapshot and unchanged document authenticate
 * this resolution. Detached numerical copies never gain saved/Apply authority. */
export function assertAssemblyCircularPathResolution(value: AssemblyCircularPathResolution, document: AssemblyDocument): AssemblyCircularPathResolution {
  const proof = value && typeof value === 'object' ? resolutions.get(value) : undefined
  if (!proof) throw Error('Circular resolution was not issued by a native snapshot.')
  proof.snapshot.assertPointWitness(value.point, document)
  proof.snapshot.assertArcPathWitness(value.path, document)
  if (value.up) proof.snapshot.assertWitness(value.up, document)
  return value
}
/** Current native data -> explicit numerical input only. This does not add a
 * saved mate, solve the document, or grant worker/Apply publication capability.
 * GPPoint and analytic circle Float64 data are the reference model. Topology
 * tolerances remain incidence metadata, not calibrated coordinate/angle noise. */
export function resolveAssemblyCircularPathReferences(snapshot: AssemblyGeometrySnapshot, document: AssemblyDocument, input: unknown,
  options: AssemblyPathCurveBands = {}, scopePath: readonly string[] = []): AssemblyCircularPathResolution {
  const request = validateAssemblyCircularPathReferenceRequest(input), bands = validateAssemblyPathBands(options)
  const scope = JSON.parse(assemblyOccurrencePathKey(scopePath)) as string[]
  const lengthBand = bands.lengthToleranceMm ?? 1e-6, angleBand = bands.angleToleranceRad ?? 1e-8
  try {
    const point = snapshot.resolveVertexReference(document, request.point, scope), path = snapshot.resolveArcPathSelection(document, request.path, scope, bands)
    const up = typeof request.orientation.roll === 'object' ? snapshot.resolveDirectionReference(document, request.orientation.roll.guide, scope) : undefined
    if (up && (up.kind !== 'support' || up.origin !== 'native-face' || up.localSupport.kind !== 'plane')) throw Error('Circular UP requires a current material plane.')
    const pa = assemblyPointPlacementArithmetic(point, document), pb = assemblyArcPathPlacementArithmetic(path, document), arc = path.localCurve
    const ra = ROUND * (pa.depth + 1), rb = ROUND * (pb.depth + 1)
    // Charge original chain magnitudes once, even when placements cancel.
    // The stored GPPoint is the actual model datum, not a +/- topology-tolerance
    // estimate of an unknown intended/physical point.
    const pointError = ra * (pa.placementSum + norm(point.localSupport.point))
    if (!arc.arithmetic || !arc.materialFrame || arc.arithmetic.referenceModel !== 'current-native-analytic-float64') throw Error('Circular analytic arithmetic proof is missing.')
    const positionErrorMm = arc.arithmetic.positionMm + rb * (pb.placementSum + norm(arc.center)), frameErrorRad = arc.arithmetic.frameRad + rb
    const model = validateAssemblyDocument(document), first: RigidMateEndpoint = { ...ownerFrame(model, point.componentPath),
      support: { kind: 'point', point: [...point.localSupport.point], tolerance: pointError } }
    const followAxis = assemblyLinePathFollowAxis(request.orientation), rollAxis = assemblyLinePathRollAxis(request.orientation)
    let roll: RigidCircularPathConstraint['roll']
    if (rollAxis) {
      if (!up || up.kind !== 'support' || up.localSupport.kind !== 'plane' || typeof request.orientation.roll !== 'object') throw Error('Circular UP plane proof is missing.')
      const pg = assemblyEndpointPlacementArithmetic(up, document)
      roll = { axis: rollAxis, reverse: request.orientation.roll.reverse, directionErrorRad: ra,
        guideDirectionErrorRad: ROUND * (pg.depth + 1) + Math.abs(norm(up.localSupport.normal) - 1),
        guide: { ...ownerFrame(model, up.componentPath), support: { kind: 'plane', point: [...up.localSupport.point],
          normal: [...up.localSupport.normal], xDirection: [...up.localSupport.xDirection], tolerance: up.localSupport.tolerance } } }
    }
    const constraint = copyRigidCircularPathConstraint({ id: 'circular-path-query', type: 'circular-path', first,
      second: { ...ownerFrame(model, path.componentPath), arc: { center: [...arc.center], radial: [...arc.materialFrame.radial], tangent: [...arc.materialFrame.tangent],
        radiusMm: arc.radiusMm, sweepRad: arc.parameterDomain.last - arc.parameterDomain.first,
        positionErrorMm, radiusErrorMm: arc.arithmetic.radiusMm, frameErrorRad, sweepErrorRad: arc.arithmetic.sweepRad } }, position: request.position,
      ...(followAxis ? { follow: { axis: followAxis, reverse: request.orientation.pitchYaw !== 'free' && request.orientation.pitchYaw.reverse, directionErrorRad: ra } } : {}), ...(roll ? { roll } : {}) })
    const error = pointError + positionErrorMm + arc.arithmetic.radiusMm + (arc.radiusMm + arc.arithmetic.radiusMm) * 2 * Math.sin(Math.min(frameErrorRad + arc.arithmetic.sweepRad, Math.PI) / 2)
    if (![pointError, positionErrorMm, frameErrorRad, error].every(Number.isFinite) || error > lengthBand || frameErrorRad > angleBand || arc.arithmetic.sweepRad > angleBand
      || arc.radiusMm - arc.arithmetic.radiusMm <= 0 || constraint.second.arc.sweepRad - arc.arithmetic.sweepRad <= 0 || constraint.second.arc.sweepRad + arc.arithmetic.sweepRad >= 2 * Math.PI) throw new RangeError('Circular native input cannot retain the requested numerical bands.')
    snapshot.assertPointWitness(point, document); snapshot.assertArcPathWitness(path, document); if (up) snapshot.assertWitness(up, document)
    const result: AssemblyCircularPathResolution = freeze({ kind: 'circular-path-resolution', uncertaintyModel: 'current-native-analytic-float64',
      topologyTolerancesMm: { point: point.localSupport.tolerance, path: arc.nativeToleranceMm }, scopePath: scope,
      componentPaths: { point: [...point.componentPath], path: [...path.componentPath], ...(up ? { up: [...up.componentPath] } : {}) },
      request, constraint, point, path, ...(up ? { up } : {}) })
    resolutions.set(result, { snapshot }); return assertAssemblyCircularPathResolution(result, document)
  } catch (error) {
    try { snapshot.dispose() } catch (cleanup) { throw new NativeCleanupError({ error }, [cleanup], 'Circular resolution or release failed.') }
    throw error
  }
}
