import { expect, it } from 'vitest'
import { evaluateRigidMates } from './assemblyMateEquations'
import { rigidMateConstraintEndpointEntries } from './assemblyNumericMateEndpoints'
import { projectRigidMateTarget } from './assemblyProjection'
import { solveRigidMates } from './assemblySolver'
import { identityRigidPose, transformRigidDirection, transformRigidPoint } from './rigidPose'
import type { RigidCircularPathConstraint, RigidMateProblem } from './assemblySolveTypes'

/** Independently authored circle: C=(0,0,0), R=2, A=(2,0,0), B=(0,2,0). */
function original(): RigidMateProblem {
  const constraint: RigidCircularPathConstraint = {
    id: 'arc', type: 'circular-path',
    first: { bodyId: 'point', frame: identityRigidPose(), support: { kind: 'point', point: [0, 0, 0], tolerance: 0 } },
    second: { bodyId: 'path', frame: identityRigidPose(), arc: {
      center: [0, 0, 0], radial: [1, 0, 0], tangent: [0, 1, 0], radiusMm: 2, sweepRad: Math.PI / 2,
      positionErrorMm: 0, radiusErrorMm: 0, frameErrorRad: 0, sweepErrorRad: 0,
    } }, position: { mode: 'free', domain: 'trim' },
  }
  return { bodies: [
    { id: 'point', fixed: false, pose: { translation: [Math.SQRT2, Math.SQRT2, 0], rotation: [0, 0, 0, 1] } },
    { id: 'path', fixed: true, pose: identityRigidPose() },
  ], constraints: [constraint], origin: [0, 0, 0], lengthScale: 5, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
const arc = (problem: RigidMateProblem) => problem.constraints[0] as RigidCircularPathConstraint

for (const pathMoves of [false, true]) it('restores an exact radial-axis chart using the actual movable owner ' + pathMoves, () => {
  const p = original(); p.bodies[0].pose = identityRigidPose()
  p.bodies[0].fixed = pathMoves; p.bodies[1].fixed = !pathMoves
  const before = structuredClone(p)
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart')
  const result = solveRigidMates(p)
  expect(result.status).toBe('underdefined'); expect(result.rank).toBe(2)
  expect(result.evidence.groups[0].seededConstraintIds).toContain('arc')
  expect(evaluateRigidMates(p, result.poses!).checks[0].satisfied).toBe(true)
  expect(p).toEqual(before)
  const fixed = pathMoves ? 'point' : 'path'
  expect(result.poses!.get(fixed)).toEqual(p.bodies.find(b => b.id === fixed)!.pose)
})

it('restores the complement cut toward the explicit material start and fully rechecks the trim', () => {
  const p = original(); p.bodies[0].pose.translation = [-Math.SQRT2, -Math.SQRT2, .2]
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart')
  const result = solveRigidMates(p)
  expect(result.status).toBe('underdefined'); expect(result.poses).not.toBeNull()
  expect(evaluateRigidMates(p, result.poses!).checks[0].satisfied).toBe(true)
})

it('cannot translate a shared owner to invent radial freedom', () => {
  const p = original(); p.bodies[0].pose = identityRigidPose(); arc(p).second.bodyId = 'point'
  const before = structuredClone(p), result = solveRigidMates(p)
  expect(result.poses).toBeNull(); expect(result.status).toBe('nonConverged'); expect(result.certificates).toEqual([])
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([]); expect(p).toEqual(before)
})

for (const pathMoves of [false, true]) it('seeds exact Follow antipodes about the offset material point ' + pathMoves, () => {
  const p = original(), c = arc(p)
  c.first.support!.point = [1, 0, 0]; p.bodies[0].pose.translation = [1, 0, 0]
  c.follow = { axis: [0, -1, 0], reverse: false, directionErrorRad: 0 }
  p.bodies[0].fixed = pathMoves; p.bodies[1].fixed = !pathMoves
  expect(evaluateRigidMates(p).diagnostics[0].code).toBe('orientationChart')
  const result = solveRigidMates(p)
  expect(result.status).toBe('underdefined'); expect(result.rank).toBe(4)
  const pointPose = result.poses!.get('point')!, point = transformRigidPoint(pointPose, [1, 0, 0])
  expect(Math.hypot(point[0] - 2, point[1], point[2])).toBeLessThan(1e-8)
  expect(evaluateRigidMates(p, result.poses!).checks[0].satisfied).toBe(true)
  const direction = transformRigidDirection(pointPose, [0, -1, 0])
  expect(Math.hypot(...direction)).toBeCloseTo(1, 12)
})

it('retains a third guide role without using it to repair an undefined radial chart', () => {
  const p = original(), c = arc(p)
  p.bodies[0].pose = identityRigidPose(); p.bodies[0].fixed = true
  p.bodies.push({ id: 'guide', fixed: false, pose: identityRigidPose() })
  c.follow = { axis: [1, 0, 0], reverse: false, directionErrorRad: 0 }
  c.roll = { axis: [0, 0, 1], reverse: false, directionErrorRad: 0, guideDirectionErrorRad: 0,
    guide: { bodyId: 'guide', frame: identityRigidPose(), support: { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 } } }
  expect(rigidMateConstraintEndpointEntries(c).map(e => [e.role, e.endpoint?.bodyId])).toEqual([
    ['first', 'point'], ['second', 'path'], ['guide', 'guide'],
  ])
  const result = solveRigidMates(p)
  expect(result.poses).toBeNull(); expect(result.evidence.groups[0].bodyIds).toEqual(['guide'])
  expect(result.evidence.groups[0].variableCount).toBe(6); expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
})

for (const count of [64, 65]) it('counts both finite trim bounds in capacity independently of rank ' + count, () => {
  const p = original(), c = arc(p)
  p.constraints = Array.from({ length: count }, (_, i) => ({ ...structuredClone(c), id: 'arc-' + i }))
  const result = solveRigidMates(p)
  if (count === 64) {
    expect(result.status).toBe('underdefined'); expect(result.rank).toBe(2)
    expect(result.evidence.groups[0].rowCount).toBe(128)
    expect(result.evidence.groups[0].variableCount).toBe(6)
  } else { expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull() }
})

it('certifies a regular fixed physical contradiction and keeps precision failures separate', () => {
  const p = original(); p.bodies[0].fixed = true; p.bodies[0].pose.translation[2] = .01
  const result = solveRigidMates(p)
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull()
  expect(result.certificates).toMatchObject([{ kind: 'fixedConstraint', checks: [{ satisfied: false }] }])
  p.bodies[0].pose.translation[2] = 8e-7; arc(p).second.arc.positionErrorMm = 4e-7
  const uncertain = solveRigidMates(p)
  expect(uncertain.status).toBe('precisionLimit'); expect(uncertain.poses).toBeNull(); expect(uncertain.certificates).toEqual([])
})

for (const maximum of [false, true]) it('activates the actual trim end and releases it for an inward target ' + maximum, () => {
  const p = original(), target = maximum ? [-2, 2, 0] : [2, -2, 0]
  const result = projectRigidMateTarget(p, { bodyId: 'point', frame: identityRigidPose(),
    targetPose: { translation: target as [number, number, number], rotation: [0, 0, 0, 1] }, mode: 'translate' })
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw Error(result.message)
  const expected = maximum ? [0, 2, 0] : [2, 0, 0]
  expect(Math.hypot(...result.resolvedPose.translation.map((v, i) => v - expected[i]))).toBeLessThan(1e-6)
  expect(result.evidence.inequalityProjection).toBeDefined()
  expect(result.result.rank).toBe(2)
  expect(result.result.evidence.groups[0].limitCone?.activeBounds).toContainEqual({ constraintId: 'arc', bound: maximum ? 'maximum' : 'minimum' })
  p.bodies = p.bodies.map(body => ({ ...body, pose: result.result.poses!.get(body.id)! }))
  const released = projectRigidMateTarget(p, { bodyId: 'point', frame: identityRigidPose(),
    targetPose: { translation: [Math.SQRT2, Math.SQRT2, 0], rotation: [0, 0, 0, 1] }, mode: 'translate' })
  expect(released.status).toBe('ready')
  if (released.status !== 'ready') throw Error(released.message)
  expect(Math.hypot(...released.resolvedPose.translation.map((v, i) => v - [Math.SQRT2, Math.SQRT2, 0][i]))).toBeLessThan(1e-6)
  expect(released.result.evidence.groups[0].limitCone?.activeBounds).toEqual([])
  expect(released.result.rank).toBe(2)
})
