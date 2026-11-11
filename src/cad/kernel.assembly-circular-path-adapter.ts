import { assemblyDefinitionKey, type AssemblyDocument, type AssemblyDefinition } from '../model/assemblyDocument'
import { assemblyLinePathFollowAxis, assemblyLinePathRollAxis, validateAssemblyLinePathOrientation } from '../model/assemblyLinePathMate'
import { copyRigidCircularPathConstraint } from '../model/assemblyCircularPathNumeric'
import type { RigidCircularPathConstraint, RigidMateEndpoint } from '../model/assemblySolveTypes'
import { composeRigidPoses, identityRigidPose, validateRigidPose, type RigidPose } from '../model/rigidPose'
import { assemblyArcPathPlacementArithmetic, assemblyEndpointPlacementArithmetic, assemblyPointPlacementArithmetic,
  type ResolvedAssemblyCircularPathMate, type AssemblyResolvedMateWitness } from './kernel.assembly-snapshot'

const ROUND = 128 * Number.EPSILON
/** Saved scopes solve their own top-level rigid occurrences. Rebuild each
 * nested material frame from declarations; do not cancel composed world poses
 * or promote descendants to independently moving owners. Final static checks
 * deliberately use null owners and each current full world placement. */
function frame(document: AssemblyDocument, witness: AssemblyResolvedMateWitness, fixed: boolean): Pick<RigidMateEndpoint, 'bodyId' | 'frame'> {
  if (fixed) return { bodyId: null, frame: validateRigidPose(witness.declaredWorldPose) }
  const table = new Map([document, ...document.definitions].map(d => [assemblyDefinitionKey(d), d]))
  let source: AssemblyDefinition = document, placement: RigidPose = identityRigidPose()
  for (let i = 0; i < witness.componentPath.length; i++) {
    if (source.kind !== 'assembly') throw Error('Circular material path crosses a part.')
    const occurrence = source.occurrences.find(o => o.id === witness.componentPath[i])
    if (!occurrence || occurrence.suppressed) throw Error('Circular material occurrence is unavailable.')
    if (i > 0) placement = composeRigidPoses(placement, occurrence.pose)
    const next = table.get(assemblyDefinitionKey(occurrence.definition))
    if (!next) throw Error('Circular material source is unavailable.')
    source = next
  }
  if (!witness.componentPath.length || source.kind !== 'part') throw Error('Circular material roles require actual part occurrences.')
  return { bodyId: witness.componentPath[0], frame: placement }
}

/** Authenticated saved-mate witnesses -> numerical input in the current solve
 * scope, or static native final-check frames. No standalone root resolution is
 * reused as a saved-mate or Apply capability. Topology tolerance stays separate
 * from the current analytic Float64 reference-model arithmetic. */
export function savedAssemblyCircularPathConstraint(document: AssemblyDocument, item: ResolvedAssemblyCircularPathMate,
  id: string, fixed = false): RigidCircularPathConstraint {
  const { first, second, up } = item, arc = second.localCurve
  const pa = assemblyPointPlacementArithmetic(first, document), pb = assemblyArcPathPlacementArithmetic(second, document)
  const ra = ROUND * (pa.depth + 1), rb = ROUND * (pb.depth + 1)
  if (arc.arithmetic.referenceModel !== 'current-native-analytic-float64') throw Error('Current circular arithmetic proof is unavailable.')
  const orientation = validateAssemblyLinePathOrientation(item.mate.orientation)
  const followAxis = assemblyLinePathFollowAxis(orientation), rollAxis = assemblyLinePathRollAxis(orientation)
  let roll: RigidCircularPathConstraint['roll']
  if (rollAxis) {
    if (!up || up.kind !== 'support' || up.origin !== 'native-face' || up.localSupport.kind !== 'plane' || typeof orientation.roll !== 'object') throw Error('Circular UP requires a current material plane.')
    const pg = assemblyEndpointPlacementArithmetic(up, document)
    roll = { axis: rollAxis, reverse: orientation.roll.reverse, directionErrorRad: ra,
      guideDirectionErrorRad: ROUND * (pg.depth + 1) + Math.abs(Math.hypot(...up.localSupport.normal) - 1),
      guide: { ...frame(document, up, fixed), support: { kind: 'plane', point: [...up.localSupport.point],
        normal: [...up.localSupport.normal], xDirection: [...up.localSupport.xDirection], tolerance: up.localSupport.tolerance } } }
  }
  return copyRigidCircularPathConstraint({ id, type: 'circular-path',
    first: { ...frame(document, first, fixed), support: { kind: 'point', point: [...first.localSupport.point],
      tolerance: ra * (pa.placementSum + Math.hypot(...first.localSupport.point)) } },
    second: { ...frame(document, second, fixed), arc: { center: [...arc.center], radial: [...arc.materialFrame.radial], tangent: [...arc.materialFrame.tangent],
      radiusMm: arc.radiusMm, sweepRad: arc.parameterDomain.last - arc.parameterDomain.first,
      positionErrorMm: arc.arithmetic.positionMm + rb * (pb.placementSum + Math.hypot(...arc.center)),
      radiusErrorMm: arc.arithmetic.radiusMm, frameErrorRad: arc.arithmetic.frameRad + rb, sweepErrorRad: arc.arithmetic.sweepRad } },
    position: item.mate.position,
    ...(followAxis ? { follow: { axis: followAxis, reverse: typeof orientation.pitchYaw === 'object' && orientation.pitchYaw.reverse, directionErrorRad: ra } } : {}),
    ...(roll ? { roll } : {}) })
}
