import { expect, it, vi } from 'vitest'
import { projectRigidMateTarget, type RigidMateProjectionOptions, type RigidMateProjectionResult, type RigidMateTarget } from './assemblyProjection'
import { evaluateRigidMates } from './assemblyMateEquations'
import * as solver from './assemblySolver'
import { identityRigidPose, type RigidPose } from './rigidPose'
import type { RigidBinaryMateConstraint as RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport } from './assemblySolveTypes'
type BinaryMateProblem = Omit<RigidMateProblem, 'constraints'> & { constraints: RigidMateConstraint[] }

// Original Cartesian mechanisms, with no native/reference authority: an XY
// slider, a Z axis/cap pin, a one-unit eccentric hinge frame and a rigid pair.
// Independent targets use exact planes, circle extrema and Cartesian rotation
// formulas. A hard mate tolerance never bounds global projection optimality.
const plane: RigidMateSupport = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 }
const cylinder: RigidMateSupport = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 1, tolerance: 0 }
const z = (angle: number): RigidPose['rotation'] => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]
const pose = (translation: RigidPose['translation'] = [0, 0, 0], angle = 0): RigidPose => ({ translation, rotation: z(angle) })
const body = (id = 'moving', fixed = false, placement = pose()) => ({ id, fixed, pose: placement })
function end(bodyId: string | null, support?: RigidMateSupport): RigidMateEndpoint {
  return { bodyId, frame: identityRigidPose(), ...(support ? { support: structuredClone(support) } : {}) }
}
function problem(constraints: RigidMateConstraint[] = []): BinaryMateProblem {
  return { bodies: [body()], constraints, origin: [0, 0, 0], lengthScale: 1, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
function target(translation: RigidPose['translation'] = [4, -3, 2], angle = Math.PI / 6, mode: RigidMateTarget['mode'] = 'translate'): RigidMateTarget {
  return { bodyId: 'moving', frame: identityRigidPose(), targetPose: pose(translation, angle), mode }
}
function planeProblem(distance = 0): BinaryMateProblem {
  const common = { id: 'plane', first: end('moving', plane), second: end(null, plane), alignment: 'aligned' as const }
  const input = problem([distance === 0 ? { ...common, type: 'coincident' } : { ...common, type: 'distance', distance }])
  input.bodies[0].pose.translation[2] = distance; return input
}
function pinProblem(cap = false, spin = false): BinaryMateProblem {
  const input = problem([{ id: 'axis', type: 'concentric', first: end('moving', cylinder), second: end(null, cylinder),
    alignment: 'aligned', rotationLock: spin ? [0, 0, 0, 1] : null }])
  if (cap) input.constraints.push({ id: 'cap', type: 'coincident', first: end('moving', plane), second: end(null, plane), alignment: 'aligned' })
  return input
}
function ready(input: RigidMateProblem, request: RigidMateTarget, options?: RigidMateProjectionOptions): Extract<RigidMateProjectionResult, { status: 'ready' }> {
  const result = projectRigidMateTarget(input, request, options)
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  const checked = evaluateRigidMates(input, result.result.poses!)
  expect(checked.diagnostics).toEqual([]); expect(checked.checks).toHaveLength(input.constraints.length)
  expect(checked.checks.every(check => check.satisfied)).toBe(true)
  expect(checked.rows.every(row => Math.abs(row.residual) <= row.tolerance)).toBe(true)
  return result
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-6): void {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThan(tolerance))
}
function xDirection(value: RigidPose): number[] {
  const [x, y, qz, w] = value.rotation
  return [1 - 2 * (y * y + qz * qz), 2 * (x * y + w * qz), 2 * (x * qz - w * y)]
}

it('projects an off-plane pointer onto XY while using the remaining spin for the secondary orientation', () => {
  const input = planeProblem(), request = target(), before = structuredClone(input), result = ready(input, request)
  near(result.resolvedPose.translation, [4, -3, 0]); near(xDirection(result.resolvedPose), [Math.sqrt(3) / 2, .5, 0])
  expect(Math.abs(result.evidence.positionResidual - 2)).toBeLessThan(1e-6); expect(result.evidence.angleResidual).toBeLessThan(1e-8)
  expect(result.evidence.convergence).toBe('stationary'); expect(result.evidence.stationarityNorm).toBeLessThanOrEqual(1e-8)
  expect(result.result.rank).toBe(3); expect(result.result.localDOF).toBe(3); expect(result.evidence.localOnly).toBe(true)
  expect(input).toEqual(before); expect(input.bodies[0].fixed).toBe(false)
})

it('projects onto an explicitly offset parallel plane without changing the saved offset', () => {
  const input = planeProblem(2), result = ready(input, target([4, -3, 5]))
  near(result.resolvedPose.translation, [4, -3, 2]); expect(Math.abs(result.evidence.positionResidual - 3)).toBeLessThan(1e-6)
  expect(input.constraints[0]).toMatchObject({ type: 'distance', distance: 2 }); expect(result.result.rank).toBe(3)
})

it('permits both axial slide and spin while rejecting radial intent through projection rather than mate suppression', () => {
  const input = pinProblem(), result = ready(input, target([2, -1, 7], Math.PI / 3))
  near(result.resolvedPose.translation, [0, 0, 7]); near(xDirection(result.resolvedPose), [.5, Math.sqrt(3) / 2, 0])
  expect(Math.abs(result.evidence.positionResidual - Math.sqrt(5))).toBeLessThan(1e-6)
  expect(result.result.rank).toBe(4); expect(result.result.localDOF).toBe(2); expect(input.constraints[0]).not.toHaveProperty('suppressed')
})

it('retains a cap constraint while the remaining pin spin follows a rotation target', () => {
  const input = pinProblem(true), result = ready(input, target([2, -1, 7], Math.PI / 3, 'rotate'))
  near(result.resolvedPose.translation, [0, 0, 0]); near(xDirection(result.resolvedPose), [.5, Math.sqrt(3) / 2, 0])
  expect(result.evidence.angleResidual).toBeLessThan(1e-8); expect(Math.abs(result.evidence.positionResidual - Math.sqrt(54))).toBeLessThan(1e-6)
  expect(result.result.rank).toBe(5); expect(result.result.localDOF).toBe(1)
})

it('keeps off-axis position error independent of the free secondary pin spin in translate mode', () => {
  const input = pinProblem(), result = ready(input, target([3, 4, 5], Math.PI / 2))
  near(result.resolvedPose.translation, [0, 0, 5]); near(xDirection(result.resolvedPose), [0, 1, 0])
  expect(Math.abs(result.evidence.positionResidual - 5)).toBeLessThan(1e-6); expect(result.evidence.angleResidual).toBeLessThan(1e-8)
  expect(result.result.rank).toBe(4); expect(result.result.localDOF).toBe(2)
})

it('returns a feasible immobile pin with nonzero intent error instead of declaring the pointer a conflict', () => {
  const input = pinProblem(true, true), result = ready(input, target([2, 1, 3], .4))
  expect(result.evidence.convergence).toBe('immobile'); expect(result.evidence.stationarityNorm).toBe(0)
  expect(result.result.rank).toBe(6); expect(result.result.localDOF).toBe(0)
  near(result.resolvedPose.translation, [0, 0, 0]); near(xDirection(result.resolvedPose), [1, 0, 0])
  expect(result.result.certificates).toEqual([]); expect(result.evidence.positionResidual).toBeGreaterThan(3)
})

it('allows a pure fixed-owner query to return unchanged immobile geometry without creating movement authority', () => {
  const input = problem(); input.bodies[0].fixed = true
  const result = ready(input, target())
  expect(result.evidence.convergence).toBe('immobile'); expect(result.result.poses!.get('moving')).toEqual(input.bodies[0].pose)
  expect(result).not.toHaveProperty('token'); expect(result).not.toHaveProperty('native')
})

it('minimizes hinge translation to the unit circle before considering a conflicting orientation preference', () => {
  const input = pinProblem(true), request = target([0, 2, 0], 0)
  request.frame.translation = [1, 0, 0]
  const result = ready(input, request)
  near(result.resolvedPose.translation, [0, 1, 0]); near(xDirection(result.resolvedPose), [0, 1, 0])
  expect(Math.abs(result.evidence.positionResidual - 1)).toBeLessThan(1e-6)
  expect(Math.abs(result.evidence.angleResidual - Math.PI / 2)).toBeLessThan(1e-6)
  expect(result.evidence.convergence).toBe('stationary'); expect(result.result.localDOF).toBe(1)
  // A weighted position+orientation compromise would choose another angle.
  expect(result.evidence.secondaryCost).toBeGreaterThan(1)
})

it('requires sufficient descent rather than eighty tiny alternating improvements near the circle minimum', () => {
  const input = pinProblem(true), request = target([0, 2, 0], 0)
  request.frame.translation = [1, 0, 0]
  const result = ready(input, request, { maxIterations: 8 })
  // Here full GN gives deltaTheta=2*cos(theta), an almost-reflection near pi/2.
  // The independent circle minimum and original hard checks must still hold.
  near(result.resolvedPose.translation, [0, 1, 0]); near(xDirection(result.resolvedPose), [0, 1, 0])
  expect(result.evidence.iterations).toBeLessThanOrEqual(8)
  expect(result.evidence.stationarityNorm).toBeLessThanOrEqual(1e-8)
  expect(Math.abs(result.evidence.positionResidual - 1)).toBeLessThan(1e-6)
})

it('gives hinge attitude lexicographic priority in rotate mode even when position would prefer another angle', () => {
  const input = pinProblem(true), request = target([2, 0, 0], Math.PI / 2, 'rotate')
  request.frame.translation = [1, 0, 0]
  const result = ready(input, request)
  near(result.resolvedPose.translation, [0, 1, 0]); near(xDirection(result.resolvedPose), [0, 1, 0])
  expect(result.evidence.angleResidual).toBeLessThan(1e-8); expect(Math.abs(result.evidence.positionResidual - Math.sqrt(5))).toBeLessThan(1e-6)
  expect(result.result.rank).toBe(5); expect(result.result.localDOF).toBe(1)
})

it('uses the full finite primary-cost tie on a center-directed hinge to achieve its secondary spin', () => {
  const input = pinProblem(true), request = target([0, 0, 0], Math.PI / 2)
  request.frame.translation = [1, 0, 0]
  const result = ready(input, request)
  // Every point of the unit circle is exactly distance one from this target.
  // Position's rank-one differential must not erase the finite tied spin.
  near(result.resolvedPose.translation, [0, 1, 0]); near(xDirection(result.resolvedPose), [0, 1, 0])
  expect(Math.abs(result.evidence.positionResidual - 1)).toBeLessThan(1e-6)
  expect(result.evidence.angleResidual).toBeLessThan(1e-8); expect(result.result.rank).toBe(5); expect(result.result.localDOF).toBe(1)
  expect(result.evidence.convergence).toBe('stationary')
})

it('preserves a one-unit selected offset before adding a distant common conditioning origin', () => {
  const input = pinProblem(true), center: RigidPose['translation'] = [1e16, 0, 0]
  input.origin = [...center]; input.bodies[0].pose.translation = [...center]
  input.constraints.forEach(constraint => { constraint.second.frame.translation = [...center] })
  const request = target([center[0], 1, 0], 0); request.frame.translation = [1, 0, 0]
  const result = ready(input, request)
  // Composing C+[1,0,0] first would round away X=1 and falsely report no spin.
  near(xDirection(result.resolvedPose), [0, 1, 0]); expect(Math.abs(result.resolvedPose.translation[1] - 1)).toBeLessThan(1e-6)
  expect(result.evidence.positionResidual).toBeLessThan(1e-6); expect(result.result.rank).toBe(5)
  expect(input.bodies[0].pose.rotation).toEqual([0, 0, 0, 1])
})

it('moves a coupled rigid pair jointly and reports hard-only six free gauge directions', () => {
  const input = problem([{ id: 'pair', type: 'lock', first: end('moving'), second: end('other'), relativePose: pose([5, 0, 0]) }])
  input.bodies.push(body('other', false, pose([5, 0, 0])))
  const result = ready(input, target([10, 20, 30], Math.PI / 2))
  near(result.resolvedPose.translation, [10, 20, 30]); near(xDirection(result.resolvedPose), [0, 1, 0])
  near(result.result.poses!.get('other')!.translation, [10, 25, 30]); near(xDirection(result.result.poses!.get('other')!), [0, 1, 0])
  expect(result.result.rank).toBe(6); expect(result.result.localDOF).toBe(6)
  expect(result.evidence.convergence).toBe('target'); expect(input.bodies.every(value => !value.fixed)).toBe(true)
})

it('uses the selected component offset and noncommuting frame rather than driving the owner to the requested pose', () => {
  const input = problem(), request = target([10, 20, 30], Math.PI / 2)
  request.frame = { translation: [2, 3, 4], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  const result = ready(input, request)
  near(result.resolvedPose.translation, [10, 20, 30]); near(result.result.poses!.get('moving')!.translation, [14, 18, 33])
  const owner = result.result.poses!.get('moving')!, [x, y, qz, w] = owner.rotation
  near(xDirection(owner), [0, 1, 0]); near([2 * (x * qz + w * y), 2 * (y * qz - w * x), 1 - 2 * (x * x + y * y)], [-1, 0, 0])
  expect(result.result.rank).toBe(0); expect(result.result.localDOF).toBe(6)
})

it('keeps unrelated free and fixed owners unchanged without using them to merge the target group', () => {
  const input = planeProblem(); input.bodies.push(body('unrelated', false, pose([8, 9, 10], .3)), body('fixed', true, pose([-4, 0, 2], .2)))
  const result = ready(input, target())
  expect(result.result.poses!.get('unrelated')).toEqual(input.bodies[1].pose); expect(result.result.poses!.get('fixed')).toEqual(input.bodies[2].pose)
  expect(result.result.rank).toBe(3); expect(result.result.localDOF).toBe(9)
})

it('does not count repeated hard mates or the soft target as additional hard rank', () => {
  const input = planeProblem(); input.constraints.push({ ...structuredClone(input.constraints[0]), id: 'redundant' })
  const result = ready(input, target())
  near(result.resolvedPose.translation, [4, -3, 0]); expect(result.result.rank).toBe(3); expect(result.result.localDOF).toBe(3)
  expect(result.result.evidence.groups[0].constraintIds).toEqual(['plane', 'redundant'])
})

it('preserves exact hard inconsistency certificates instead of explaining them as pointer projection', () => {
  const input = planeProblem(); input.constraints.push({ id: 'incompatible', type: 'distance', first: end('moving', plane), second: end(null, plane), alignment: 'aligned', distance: 1 })
  const result = projectRigidMateTarget(input, target())
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') {
    expect(result.result?.status).toBe('inconsistent'); expect(result.result?.poses).toBeNull()
    expect(result.result?.certificates.some(value => value.kind === 'duplicateOffset')).toBe(true)
  }
})

it('treats opposite target quaternion signs identically and detaches returned poses/evidence', () => {
  const input = planeProblem(), a = target(), b = target(); b.targetPose.rotation = b.targetPose.rotation.map(value => -value) as RigidPose['rotation']
  const first = ready(input, a), second = ready(input, b)
  near(first.resolvedPose.translation, second.resolvedPose.translation); near(xDirection(first.resolvedPose), xDirection(second.resolvedPose))
  first.requestedPose.translation[0] = 100; first.resolvedPose.translation[0] = 200; first.result.poses!.get('moving')!.translation[0] = 300
  expect(input.bodies[0].pose.translation).toEqual([0, 0, 0]); expect(a.targetPose.translation).toEqual([4, -3, 2]); expect(second.resolvedPose.translation[0]).toBeLessThan(5)
})

it.each([.001, 1000])('preserves Cartesian projection when all lengths, tolerances and conditioning are scaled by %s', scale => {
  const input = planeProblem(2 * scale); input.lengthScale = scale; input.lengthTolerance *= scale
  const result = ready(input, target([4 * scale, -3 * scale, 5 * scale]))
  near(result.resolvedPose.translation.map(value => value / scale), [4, -3, 2])
  expect(Math.abs(result.evidence.positionResidual / scale - 3)).toBeLessThan(1e-6); expect(result.result.rank).toBe(3)
})

it('preserves the result under body/constraint permutation and a distant fixed conditioning origin', () => {
  const input = planeProblem(), offset: RigidPose['translation'] = [100, -200, 300]
  input.origin = [...offset]; input.bodies[0].pose.translation = [...offset]
  input.constraints[0].second.frame.translation = [...offset]
  input.constraints.push({ ...structuredClone(input.constraints[0]), id: 'again' }); input.constraints.reverse()
  input.bodies.unshift(body('unrelated', false, pose([108, -191, 310])))
  const result = ready(input, target([104, -203, 302]))
  near(result.resolvedPose.translation, [104, -203, 300]); expect(result.result.rank).toBe(3); expect(result.result.localDOF).toBe(9)
})

it('solves original infeasible hard declarations before projecting rather than freezing their declared pose', () => {
  const input = planeProblem(); input.bodies[0].pose.translation = [0, 0, 4]
  const result = ready(input, target([4, -3, 2], 0))
  near(result.resolvedPose.translation, [4, -3, 0]); expect(input.bodies[0].pose.translation).toEqual([0, 0, 4])
})

it('handles an unchanged requested target without claiming zero hard rank for its constraints', () => {
  const input = planeProblem(), result = ready(input, target([0, 0, 0], 0))
  expect(result.evidence.convergence).toBe('target'); expect(result.evidence.iterations).toBe(0)
  expect(result.result.rank).toBe(3); expect(result.result.localDOF).toBe(3)
})

it('rejects an exhausted outer budget with no feasible candidate poses in the rejected payload', () => {
  const result = projectRigidMateTarget(planeProblem(), target(), { maxIterations: 0 })
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') { expect(result.message).toContain('budget'); expect(result.result).toBeUndefined() }
})

it('rejects an ambiguous primary numerical rank instead of silently removing a motion direction', () => {
  const result = projectRigidMateTarget(problem(), target(), { solver: { svd: { rankAbsoluteTolerance: .1, rankRelativeTolerance: 0 } } })
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') { expect(result.message).toContain('rankUncertain'); expect(result.result).toBeUndefined() }
})

it('rejects an initial soft pi chart without inventing inconsistency or changing the strict kinematic chart', () => {
  const result = projectRigidMateTarget(problem(), target([0, 0, 0], Math.PI))
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') { expect(result.message).toContain('pi'); expect(result.result).toBeUndefined() }
})

it('tries a smaller projection step after actual hard restoration reports nonConverged', () => {
  const original = solver.solveRigidMates; let restoration = 0, initialRestoration: ReturnType<typeof solver.solveRigidMates> | undefined
  const spy = vi.spyOn(solver, 'solveRigidMates').mockImplementation((input, options) => {
    if (options?.maxSeedPasses === 0 && ++restoration === 1) { initialRestoration = original(input, { ...options, maxIterations: 0 }); return initialRestoration }
    return original(input, options)
  })
  try {
    // A real curved normal-angle constraint makes the finite tangent proposal
    // require restoration; maxIterations=0 genuinely withholds its poses.
    const input = problem([{ id: 'angle', type: 'angle', angle: 60, first: end('moving', plane), second: end(null, plane) }])
    input.bodies[0].pose.rotation = [0, Math.sin(Math.PI / 6), 0, Math.cos(Math.PI / 6)]
    const request = target([1, 2, 3], .3), result = projectRigidMateTarget(input, request)
    expect(initialRestoration?.status).toBe('nonConverged'); expect(initialRestoration?.poses).toBeNull(); expect(restoration).toBeGreaterThan(1)
    expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
    if (result.status !== 'ready') throw new Error(result.message)
    expect(evaluateRigidMates(input, result.result.poses!).checks.every(value => value.satisfied)).toBe(true)
    near(result.resolvedPose.translation, [1, 2, 3]); expect(Math.abs(result.evidence.angleResidual - Math.PI / 3)).toBeLessThan(1e-6)
  } finally { spy.mockRestore() }
})

it.each(['invalid-target', 'invalid-mode', 'invalid-pose', 'invalid-options', 'nonfinite'])('rejects %s data without modifying the hard input', kind => {
  const input = planeProblem(), before = structuredClone(input), request = target(), options: RigidMateProjectionOptions = {}
  if (kind === 'invalid-target') request.bodyId = 'missing'
  if (kind === 'invalid-mode') request.mode = 'unknown' as RigidMateTarget['mode']
  if (kind === 'invalid-pose') request.targetPose.rotation = [0, 0, 0, 2]
  if (kind === 'invalid-options') options.maxTrials = 0
  if (kind === 'nonfinite') request.targetPose.translation[0] = Infinity
  expect(projectRigidMateTarget(input, request, options).status).toBe('rejected'); expect(input).toEqual(before)
})

it('rejects executable or sparse input without invoking accessors or serializers', () => {
  const input = problem(), request = target(), getter = vi.fn(() => [0, 0, 0])
  Object.defineProperty(request.targetPose, 'translation', { get: getter, enumerable: true })
  expect(projectRigidMateTarget(input, request).status).toBe('rejected'); expect(getter).not.toHaveBeenCalled()
  const sparse = target(); Reflect.deleteProperty(sparse.targetPose.translation, '1')
  expect(projectRigidMateTarget(input, sparse).status).toBe('rejected')
  const serializer = vi.fn(() => ({})), executable = Object.assign(problem(), { toJSON: serializer })
  expect(projectRigidMateTarget(executable, target()).status).toBe('rejected'); expect(serializer).not.toHaveBeenCalled()
})

it('rejects huge arrays and excessive recursive data before unbounded cloning', () => {
  const huge = problem(); huge.bodies.length = 4097
  const oversized = projectRigidMateTarget(huge, target())
  expect(oversized.status).toBe('rejected'); if (oversized.status === 'rejected') expect(oversized.message).toContain('capacity')
  const deep: Record<string, unknown> = {}; let cursor = deep
  for (let index = 0; index < 66; index++) { const child = {}; cursor.child = child; cursor = child }
  const recursive = projectRigidMateTarget(Object.assign(problem(), { deep }), target())
  expect(recursive.status).toBe('rejected'); if (recursive.status === 'rejected') expect(recursive.message).toContain('traversal')
})

it('retains the existing connected-group capacity rejection without clipping the hard problem', () => {
  const input = problem(); input.bodies = Array.from({ length: 22 }, (_, i) => body('body-' + i))
  input.constraints = Array.from({ length: 21 }, (_, i) => ({ id: 'lock-' + i, type: 'lock', first: end('body-' + i), second: end('body-' + (i + 1)), relativePose: identityRigidPose() }))
  const request = target(); request.bodyId = 'body-0'
  const result = projectRigidMateTarget(input, request)
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') { expect(result.result?.status).toBe('capacityLimit'); expect(result.result?.poses).toBeNull() }
  expect(input.bodies).toHaveLength(22); expect(input.constraints).toHaveLength(21)
})
