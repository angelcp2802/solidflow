import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import { composeRigidPoses, identityRigidPose, transformRigidDirection, transformRigidPoint, type RigidPose } from './rigidPose'
import { oneSidedJacobiSvd } from './assemblyLeastSquares'
import type { RigidMateEndpoint, RigidMateProblem, RigidSolverBody, RigidWidthCenteredConstraint } from './assemblySolveTypes'

// Original numerical infinite planes, not native CAD, saved mates or an external model.
function near(actual: readonly number[], expected: readonly number[], tolerance = 1e-8): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => { expect(Number.isFinite(value)).toBe(true); expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(tolerance) })
}
function end(bodyId: string | null, point: Vec3, normal: Vec3, frame = identityRigidPose(), xDirection: Vec3 = [0, 1, 0]): RigidMateEndpoint {
  return { bodyId, frame, support: { kind: 'plane', point, normal, xDirection, tolerance: 0 } }
}
function centered(ids: readonly [string | null, string | null, string | null, string | null]): RigidWidthCenteredConstraint {
  return { id: 'width-original', type: 'width', mode: 'centered', widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned',
    width: [end(ids[0], [-8, 0, 0], [-1, 0, 0]), end(ids[1], [8, 0, 0], [1, 0, 0])],
    tab: [end(ids[2], [-2, 0, 0], [-1, 0, 0]), end(ids[3], [2, 0, 0], [1, 0, 0])] }
}
const body = (id: string, translation: Vec3 = [0, 0, 0], fixed = false): RigidSolverBody => ({ id, pose: { ...identityRigidPose(), translation }, fixed })
function problem(mate: RigidWidthCenteredConstraint, bodies: RigidSolverBody[], lengthScale = 10): RigidMateProblem {
  return { bodies, constraints: [mate], origin: [0, 0, 0], lengthScale, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
function grounded(translation: Vec3 = [0, 0, 0]): RigidMateProblem {
  return problem(centered([null, null, 'tab', 'tab']), [body('tab', translation)])
}
function four(): RigidMateProblem { return problem(centered(['a', 'b', 'c', 'd']), ['a', 'b', 'c', 'd'].map(id => body(id))) }
function solved(input: RigidMateProblem) {
  const result = solveRigidMates(input)
  expect(['underdefined', 'fullyDefined']).toContain(result.status)
  expect(result.poses).not.toBeNull()
  if (!result.poses) throw new Error(result.evidence.diagnostics.join('; '))
  return result as typeof result & { poses: Map<string, RigidPose> }
}
function planePoint(endpoint: RigidMateEndpoint, poses: ReadonlyMap<string, RigidPose>): Vec3 {
  if (endpoint.support?.kind !== 'plane') throw new Error('Original plane required')
  const local = transformRigidPoint(endpoint.frame, endpoint.support.point)
  return endpoint.bodyId === null ? local : transformRigidPoint(poses.get(endpoint.bodyId)!, local)
}
function planeNormal(endpoint: RigidMateEndpoint, poses: ReadonlyMap<string, RigidPose>): Vec3 {
  if (endpoint.support?.kind !== 'plane') throw new Error('Original plane required')
  const local = transformRigidDirection(endpoint.frame, endpoint.support.normal)
  return endpoint.bodyId === null ? local : transformRigidDirection(poses.get(endpoint.bodyId)!, local)
}
function angle(a: Vec3, b: Vec3): number {
  const cross: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  return Math.atan2(Math.hypot(...cross), a.reduce((sum, x, i) => sum + x * b[i], 0))
}

it('evaluates a truly n-ary declaration without fabricated first and second endpoints', () => {
  const input = grounded([3, 0, 0]), mate = input.constraints[0]
  expect(mate).not.toHaveProperty('first'); expect(mate).not.toHaveProperty('second')
  const value = evaluateRigidMates(input)
  expect(value.diagnostics).toEqual([]); expect(value.rows).toHaveLength(4); expect(value.checks).toHaveLength(1)
  expect(value.rows.filter(row => row.kind === 'angle')).toHaveLength(3)
  expect(value.rows.filter(row => row.kind === 'length')).toHaveLength(1)
  expect(Math.abs(value.maxLengthResidual - 3)).toBeLessThanOrEqual(1e-10)
  expect(value.maxAngleResidual).toBeLessThanOrEqual(1e-12)
  expect(value.checks[0].satisfied).toBe(false)
  expect(value.inequalities ?? []).toEqual([])
  expect(value.widthCentered).toHaveLength(1)
  const measured = value.widthCentered![0]
  expect(measured).toMatchObject({ constraintId: 'width-original', mode: 'centered', widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned', lengthTolerance: 1e-6, angleTolerance: 1e-8 })
  near([measured.offsetMm, measured.angleRadians, measured.branchLengths.width, measured.branchLengths.tab], [-3, 0, 2, 2], 1e-10)
})

it('checks physical normal angle with atan2 rather than reporting vector chord length as radians', () => {
  const input = grounded(), mate = input.constraints[0] as RigidWidthCenteredConstraint
  input.bodies[0].pose.rotation = rotationExp([0, 0, Math.PI / 2])
  const poses = new Map(input.bodies.map(v => [v.id, v.pose])), independent = angle(planeNormal(mate.width[0], poses), planeNormal(mate.tab[0], poses))
  expect(Math.abs(independent - Math.PI / 2)).toBeLessThanOrEqual(1e-12)
  const value = evaluateRigidMates(input)
  expect(value.diagnostics).toEqual([])
  expect(Math.abs(value.maxAngleResidual - independent)).toBeLessThanOrEqual(1e-10)
  expect(Math.abs(value.checks[0].angleResidual - independent)).toBeLessThanOrEqual(1e-10)
  expect(Math.abs(value.widthCentered![0].angleRadians - independent)).toBeLessThanOrEqual(1e-10)
  expect(Math.abs(value.maxAngleResidual - Math.SQRT2)).toBeGreaterThan(.1)
})

it('retains explicit opposed alignment and rejects the same pose for aligned coincidence', () => {
  const input = grounded(), mate = input.constraints[0] as RigidWidthCenteredConstraint
  input.bodies[0].pose.rotation = rotationExp([0, 0, Math.PI])
  const wrong = evaluateRigidMates(input)
  expect(wrong.diagnostics.some(value => value.code === 'orientationChart')).toBe(true)
  expect(solveRigidMates(input).poses).toBeNull()
  mate.alignment = 'opposed'
  const admitted = evaluateRigidMates(input)
  expect(admitted.diagnostics).toEqual([]); expect(admitted.checks[0].satisfied).toBe(true)
})

it('keeps the fourth reference owner in the graph and solves its independently known translation', () => {
  const input = four(); input.bodies.slice(0, 3).forEach(v => { v.fixed = true }); input.bodies[3].pose.translation = [3, 0, 0]
  const before = structuredClone(input), result = solved(input)
  // Fixed tab plane x=-2 and moving tab plane x=2+d require d=0 to bisect at x=0.
  near(result.poses.get('d')!.translation, [0, 0, 0])
  const group = result.evidence.groups.find(v => v.constraintIds.includes('width-original'))!
  expect(group.bodyIds).toEqual(['d']); expect(group.unanchored).toBe(false)
  expect(group.rank).toBe(3); expect(group.localDOF).toBe(3)
  expect(input).toEqual(before)
})

it('joins all four distinct free owners into one regular rank-three group', () => {
  const input = four(); input.bodies.push(body('unrelated'))
  const result = solved(input), group = result.evidence.groups.find(v => v.constraintIds.includes('width-original'))!
  expect([...group.bodyIds].sort()).toEqual(['a', 'b', 'c', 'd'])
  expect(group.variableCount).toBe(24); expect(group.rank).toBe(3); expect(group.localDOF).toBe(21); expect(group.unanchored).toBe(true)
  expect(result.evidence.groups).toHaveLength(2)
})

it('solves original four-owner displaced planes and checks their final literal midpoint geometry independently', () => {
  const input = four(), mate = input.constraints[0] as RigidWidthCenteredConstraint
  input.bodies[2].pose.translation = [2, 0, 0]; input.bodies[3].pose.translation = [4, 0, 0]
  const result = solved(input)
  const w = mate.width.map(v => planePoint(v, result.poses)), t = mate.tab.map(v => planePoint(v, result.poses))
  expect(Math.abs((w[0][0] + w[1][0]) / 2 - (t[0][0] + t[1][0]) / 2)).toBeLessThanOrEqual(1e-6)
  expect(angle(planeNormal(mate.width[0], result.poses), planeNormal(mate.tab[0], result.poses))).toBeLessThanOrEqual(1e-8)
})

it('keeps repeated ownership and null fixed references separate from formal reference count', () => {
  const common = problem(centered(['same', 'same', 'same', 'same']), [body('same')])
  const commonResult = solved(common)
  expect(commonResult.rank).toBe(0); expect(commonResult.localDOF).toBe(6)
  const two = problem(centered(['w', 'w', 't', 't']), [body('w'), body('t')])
  const pairResult = solved(two)
  expect(pairResult.rank).toBe(3); expect(pairResult.localDOF).toBe(9)
  expect(pairResult.evidence.groups[0].unanchored).toBe(true)
  const fixed = solved(grounded())
  expect(fixed.rank).toBe(3); expect(fixed.localDOF).toBe(3); expect(fixed.evidence.groups[0].unanchored).toBe(false)
})

it('composes a nested endpoint frame without attaching its derived midpoint to another owner', () => {
  const input = grounded([2, 6, -4]), mate = input.constraints[0] as RigidWidthCenteredConstraint
  const frame: RigidPose = { translation: [7, 3, -1], rotation: rotationExp([0, 0, Math.PI / 2]) }
  // Rz90 maps local points y=11,3 to x=-4,+4 after frame translation x=7.
  mate.tab = [end('tab', [0, 11, 0], [0, 1, 0], frame, [0, 0, 1]), end('tab', [0, 3, 0], [0, -1, 0], frame, [0, 0, 1])]
  const value = evaluateRigidMates(input)
  expect(value.diagnostics).toEqual([]); expect(Math.abs(value.maxLengthResidual - 2)).toBeLessThanOrEqual(1e-10)
  const result = solved(input)
  near(result.poses.get('tab')!.translation, [0, 6, -4], 1e-6)
})

it('solves intersecting ordered plane pairs while preserving their independent opening angles', () => {
  const input = grounded([3, 4, -3]), mate = input.constraints[0] as RigidWidthCenteredConstraint
  mate.width = [end(null, [-8, 0, 0], [-.6, -.8, 0], undefined, [0, 0, 1]), end(null, [8, 0, 0], [.6, -.8, 0], undefined, [0, 0, 1])]
  mate.tab = [end('tab', [-2, 0, 0], [-.8, -.6, 0], undefined, [0, 0, 1]), end('tab', [2, 0, 0], [.8, -.6, 0], undefined, [0, 0, 1])]
  input.bodies[0].pose.rotation = rotationExp([0, 0, .27])
  const result = solved(input)
  const independent = (pair: readonly [RigidMateEndpoint, RigidMateEndpoint]) => {
    const normals = pair.map(v => planeNormal(v, result.poses)), points = pair.map(v => planePoint(v, result.poses))
    const difference = normals[0].map((v, i) => v - normals[1][i]) as Vec3
    const length = Math.hypot(...difference)
    return { normal: difference.map(v => v / length) as Vec3,
      offset: (normals[0].reduce((s, v, i) => s + v * points[0][i], 0) - normals[1].reduce((s, v, i) => s + v * points[1][i], 0)) / length,
      openingDot: normals[0].reduce((s, v, i) => s + v * normals[1][i], 0) }
  }
  const width = independent(mate.width), tab = independent(mate.tab)
  near(width.normal, [-1, 0, 0]); near(tab.normal, [-1, 0, 0])
  expect(angle(width.normal, tab.normal)).toBeLessThanOrEqual(1e-8)
  near([width.offset, tab.offset], [0, 0], 1e-6)
  near([width.openingDot, tab.openingDot], [.28, -.28], 1e-12)
  // Tangential translation and rotation about the common bisector are not prescribed.
})

it.each(['x', 'y'] as const)('distinguishes a bisector-preserving X tilt from an initial Y orientation defect (%s)', axis => {
  const input = grounded([0, 7, -3]), mate = input.constraints[0] as RigidWidthCenteredConstraint
  // Original rational planes through the origin; no native geometry or implicit axis relation.
  mate.width = [end(null, [0, 0, 0], [-3 / 5, -4 / 5, 0], undefined, [0, 0, 1]), end(null, [0, 0, 0], [3 / 5, -4 / 5, 0], undefined, [0, 0, 1])]
  mate.tab = [end('tab', [0, 0, 0], [-4 / 5, -3 / 5, 0], undefined, [0, 0, 1]), end('tab', [0, 0, 0], [4 / 5, -3 / 5, 0], undefined, [0, 0, 1])]
  const radians = Math.PI / 12, c = Math.cos(radians), s = Math.sin(radians)
  input.bodies[0].pose.rotation = rotationExp(axis === 'x' ? [radians, 0, 0] : [0, radians, 0])
  // Literal matrix action is independent of the bisector/residual implementation.
  const rotate = ([x, y, z]: Vec3): Vec3 => axis === 'x' ? [x, c * y - s * z, s * y + c * z] : [c * x + s * z, y, -s * x + c * z]
  const expectedNormals = [[-4 / 5, -3 / 5, 0], [4 / 5, -3 / 5, 0]].map(n => rotate(n as Vec3))
  const poses = new Map(input.bodies.map(owner => [owner.id, owner.pose]))
  mate.tab.forEach((endpoint, i) => { near(planeNormal(endpoint, poses), expectedNormals[i], 1e-12); near(planePoint(endpoint, poses), [0, 7, -3], 1e-12) })
  const bisector: Vec3 = axis === 'x' ? [-1, 0, 0] : [-c, 0, s]
  const offset = bisector[1] * 7 - bisector[2] * 3
  const hinge: Vec3 = axis === 'x' ? [0, -s, c] : [s, 0, c]
  // Both initial hinges tilt by 15 degrees; only the X tilt preserves X=0.
  near(transformRigidDirection(input.bodies[0].pose, [0, 0, 1]), hinge, 1e-12)
  expect(Math.abs(angle([0, 0, 1], hinge) - radians)).toBeLessThanOrEqual(1e-12)
  near([expectedNormals[0].reduce((sum, v, i) => sum + v * expectedNormals[1][i], 0)], [-7 / 25], 1e-12)
  const before = structuredClone(input), value = evaluateRigidMates(input)
  expect(value.diagnostics).toEqual([])
  expect(value.checks[0].satisfied).toBe(axis === 'x')
  const measurement = value.widthCentered![0]
  near([measurement.angleRadians, measurement.offsetMm], [axis === 'x' ? 0 : radians, offset], 1e-12)
  expect(input).toEqual(before)
  // The Y pose is outside the initial constraint; a free-owner solve may legitimately repair it.
})

for (const radians of [1e-4 - 1e-8, 1e-4 + 1e-8, Math.PI - 2e-7]) {
  it('evaluates the physical angular residual at the admitted chart sample ' + radians, () => {
    const input = grounded()
    input.bodies[0].pose.rotation = rotationExp([0, 0, radians])
    const value = evaluateRigidMates(input)
    expect(value.diagnostics).toEqual([])
    const physical = Math.atan2(Math.abs(Math.sin(radians)), Math.cos(radians))
    near([value.maxAngleResidual, value.widthCentered![0].angleRadians], [physical, physical], 1e-10)
    if (radians < 1e-3) {
      for (const h of [2e-8, 7e-9]) {
        const plus = evaluateRigidMates(input, new Map([['tab', retractRigidBodyPose(input.bodies[0].pose, [0, 0, 0, 0, 0, h], input.origin, input.lengthScale)]]))
        const minus = evaluateRigidMates(input, new Map([['tab', retractRigidBodyPose(input.bodies[0].pose, [0, 0, 0, 0, 0, -h], input.origin, input.lengthScale)]]))
        expect(plus.diagnostics).toEqual([]); expect(minus.diagnostics).toEqual([])
        value.rows.forEach((row, index) => {
          const derivative = (plus.rows[index].residual - minus.rows[index].residual) / (2 * h)
          expect(Math.abs(row.jacobian[5] - derivative)).toBeLessThanOrEqual(5e-7)
        })
      }
    }
  })
}

it('reports the excluded antipodal chart sample without claiming a global solve result', () => {
  const input = grounded(); input.bodies[0].pose.rotation = rotationExp([0, 0, Math.PI - .5e-7])
  expect(evaluateRigidMates(input).diagnostics.some(v => v.code === 'orientationChart')).toBe(true)
})

it('preserves a half-millimeter defect in an already normalized distant common frame', () => {
  const input = grounded(), mate = input.constraints[0] as RigidWidthCenteredConstraint
  input.origin = [1e16, 0, 0]; input.lengthScale = 1
  mate.width = [end('width', [-1, 0, 0], [-1, 0, 0]), end('width', [1, 0, 0], [1, 0, 0])]
  const local = { ...identityRigidPose(), translation: [.5, 0, 0] as Vec3 }
  mate.tab = [end('tab', [-.25, 0, 0], [-1, 0, 0], local), end('tab', [.25, 0, 0], [1, 0, 0], local)]
  input.bodies = [body('width', [1e16, 0, 0], true), body('tab', [1e16, 0, 0])]
  const value = evaluateRigidMates(input)
  expect(value.diagnostics).toEqual([])
  expect(Math.abs(value.maxLengthResidual - .5)).toBeLessThanOrEqual(1e-10)
  expect(value.checks[0].satisfied).toBe(false)
})

for (const ids of [['a', 'b', 'c', 'd'], ['a', 'a', 'c', 'd'], ['a', 'b', 'a', 'b'], [null, 'b', 'c', 'd']] as const) {
  it('differentiates all free owner columns with actual left retractions for ' + JSON.stringify(ids), () => {
    const owners = [...new Set(ids.flatMap(v => v === null ? [] : [v]))]
    const input = problem(centered(ids), owners.map((id, i) => ({ id, fixed: false, pose: { translation: [i + .2, -i - .1, .3 * i] as Vec3, rotation: rotationExp([.03 * (i + 1), -.02 * i, .04]) } })))
    input.origin = [1, -2, 3]
    const mate = input.constraints[0] as RigidWidthCenteredConstraint
    mate.width[0].frame = { translation: [.4, -.2, .1], rotation: rotationExp([.23, -.31, .17]) }
    const base = evaluateRigidMates(input); expect(base.diagnostics).toEqual([]); expect(base.rows).toHaveLength(4)
    for (const h of [2e-6, 7e-7]) for (let column = 0; column < owners.length * 6; column++) {
      const owner = input.bodies[Math.floor(column / 6)], delta = Array(6).fill(0) as number[]; delta[column % 6] = h
      const plus = evaluateRigidMates(input, new Map([[owner.id, retractRigidBodyPose(owner.pose, delta, input.origin, input.lengthScale)]]))
      delta[column % 6] = -h
      const minus = evaluateRigidMates(input, new Map([[owner.id, retractRigidBodyPose(owner.pose, delta, input.origin, input.lengthScale)]]))
      expect(plus.diagnostics).toEqual([]); expect(minus.diagnostics).toEqual([])
      base.rows.forEach((row, index) => {
        const expected = (plus.rows[index].residual - minus.rows[index].residual) / (2 * h)
        expect(Math.abs(row.jacobian[column] - expected)).toBeLessThanOrEqual(5e-7 * Math.max(1, Math.abs(expected)))
      })
    }
  })
}

it('retains common rigid gauge directions off solution for four original free owners', () => {
  const input = four(); input.bodies[2].pose.translation = [1, 2, 3]; input.bodies[3].pose.rotation = rotationExp([.1, -.2, .3])
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([])
  expect(value.checks[0].satisfied).toBe(false)
  for (const row of value.rows) for (let axis = 0; axis < 6; axis++) {
    const common = input.bodies.reduce((sum, _, owner) => sum + row.jacobian[owner * 6 + axis], 0)
    expect(Math.abs(common)).toBeLessThanOrEqual(1e-10)
  }
})

it('projects a grounded tab onto its actual three free directions with no invented boundary', () => {
  const input = grounded(), before = structuredClone(input), request = { bodyId: 'tab', frame: identityRigidPose(), targetPose: { translation: [5, 7, -3] as Vec3, rotation: rotationExp([.2, 0, 0]) }, mode: 'translate' as const }
  const result = projectRigidMateTarget(input, request)
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  near(result.resolvedPose.translation, [0, 7, -3], 1e-6)
  near(transformRigidDirection(result.resolvedPose, [0, 1, 0]), [0, Math.cos(.2), Math.sin(.2)], 1e-8)
  expect(result.result.rank).toBe(3); expect(result.result.localDOF).toBe(3)
  expect(result.evidence.localOnly).toBe(true); expect(result.evidence.inequalityProjection).toBeUndefined()
  expect(result.result.evidence.groups[0].limitCone).toBeUndefined()
  expect(input).toEqual(before)
})

it('projects a fourth-only free reference owner rather than dropping it from target incidence', () => {
  const input = four(); input.bodies.slice(0, 3).forEach(v => { v.fixed = true })
  const result = projectRigidMateTarget(input, { bodyId: 'd', frame: identityRigidPose(), targetPose: { ...identityRigidPose(), translation: [6, 7, -3] }, mode: 'translate' })
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  near(result.resolvedPose.translation, [0, 7, -3], 1e-6)
  expect(result.result.evidence.groups.find(v => v.constraintIds.includes('width-original'))!.bodyIds).toEqual(['d'])
})

it('rejects an incompatible all-fixed width without publishing poses', () => {
  const input = grounded([3, 0, 0]); input.bodies[0].fixed = true
  const result = solveRigidMates(input)
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull()
  expect(result.certificates.some(v => v.kind === 'fixedConstraint')).toBe(true)
})

it('rejects selected branch cancellation and unresolved normalization with atomic pose failure', () => {
  const degenerate = grounded(), mate = degenerate.constraints[0] as RigidWidthCenteredConstraint
  mate.widthBranch = 'sum'
  expect(evaluateRigidMates(degenerate).diagnostics.length).toBeGreaterThan(0)
  expect(solveRigidMates(degenerate).poses).toBeNull()
  const tiny = grounded(); tiny.lengthScale = 1e308; tiny.lengthTolerance = Number.MIN_VALUE
  const value = evaluateRigidMates(tiny)
  expect(value.diagnostics.some(v => v.code === 'precisionLimit')).toBe(true)
  expect(solveRigidMates(tiny).poses).toBeNull()
})

it('rejects missing owners, wrong support purposes, non-centered modes and malformed tuples without mutating input', () => {
  const mutations: ((v: any) => void)[] = [
    v => { v.constraints[0].tab[1].bodyId = 'absent' },
    v => { v.constraints[0].mode = 'free' },
    v => { v.constraints[0].widthBranch = 'automatic' },
    v => { v.constraints[0].alignment = null },
    v => { v.constraints[0].width = [v.constraints[0].width[0]] },
    v => { v.constraints[0].tab.push(structuredClone(v.constraints[0].tab[1])) },
    v => { v.constraints[0].tab[1].support = { kind: 'cylinder', point: [2, 0, 0], axis: [1, 0, 0], xDirection: [0, 1, 0], radius: 1, tolerance: 0 } },
  ]
  for (const mutation of mutations) {
    const input = grounded(); mutation(input); const before = structuredClone(input)
    const result = solveRigidMates(input)
    expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull(); expect(input).toEqual(before)
  }
})

/** Original rational four-owner mechanism. The common rotation has matrix
 * [9,-12,20;20,15,0;-12,16,15]/25, so its bisector is
 * b=(-9,-20,12)/25 and b.dot((7,-11,13))=313/25 mm. */
function obliqueFourOwners(): RigidMateProblem {
  const mate: RigidWidthCenteredConstraint = { id: 'oblique-four-owner', type: 'width', mode: 'centered',
    widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned',
    width: [end('a', [-8, 0, 0], [-3 / 5, -4 / 5, 0], undefined, [0, 0, 1]), end('b', [8, 0, 0], [3 / 5, -4 / 5, 0], undefined, [0, 0, 1])],
    tab: [end('c', [-2, 0, 0], [-4 / 5, -3 / 5, 0], undefined, [0, 0, 1]), end('d', [2, 0, 0], [4 / 5, -3 / 5, 0], undefined, [0, 0, 1])] }
  return problem(mate, ['a', 'b', 'c', 'd'].map(id => ({ id, fixed: false,
    pose: { translation: [7, -11, 13], rotation: [1 / 5, 2 / 5, 2 / 5, 4 / 5] } })))
}
function independentObliquePlanes(input: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>) {
  const mate = input.constraints[0]
  if (mate.type !== 'width') throw new Error('Original four-plane width required')
  const pair = (ends: [RigidMateEndpoint, RigidMateEndpoint]) => {
    const n = ends.map(value => planeNormal(value, poses)), p = ends.map(value => planePoint(value, poses))
    const difference = n[0].map((value, i) => value - n[1][i]) as Vec3, length = Math.hypot(...difference)
    return { normal: difference.map(value => value / length) as Vec3,
      offset: (n[0].reduce((sum, value, i) => sum + value * p[0][i], 0) - n[1].reduce((sum, value, i) => sum + value * p[1][i], 0)) / length }
  }
  return { width: pair(mate.width), tab: pair(mate.tab) }
}
function checkFourOwnerGauge(input: RigidMateProblem, poses: ReadonlyMap<string, RigidPose>): void {
  const value = evaluateRigidMates(input, poses)
  expect(value.diagnostics).toEqual([])
  for (const row of value.rows) for (let axis = 0; axis < 6; axis++) {
    expect(Math.abs(input.bodies.reduce((sum, _, owner) => sum + row.jacobian[6 * owner + axis], 0))).toBeLessThanOrEqual(2e-10)
  }
  // An actual common quarter-turn plus translation, not only a Jacobian sum.
  const moved = new Map([...poses].map(([id, pose]) => [id, composeRigidPoses({ translation: [-5, 4, 9],
    rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, pose)]))
  const transformed = evaluateRigidMates(input, moved)
  expect(transformed.diagnostics).toEqual([])
  near(transformed.rows.map(row => row.residual), value.rows.map(row => row.residual), 2e-12)
  const originalPlanes = independentObliquePlanes(input, poses), movedPlanes = independentObliquePlanes(input, moved)
  for (const group of ['width', 'tab'] as const) {
    const original = originalPlanes[group], actual = movedPlanes[group]
    near(actual.normal, [-original.normal[1], original.normal[0], original.normal[2]], 1e-12)
    near([actual.offset], [original.offset - 5 * actual.normal[0] + 4 * actual.normal[1] + 9 * actual.normal[2]], 1e-10)
  }
}

it.each([0, 1e-9, .08])('solves four free oblique owners from an original angular displacement %s with a physical rank-three zero set', radians => {
  const input = obliqueFourOwners(), initial = new Map(input.bodies.map(value => [value.id, value.pose]))
  const literal = independentObliquePlanes(input, initial)
  near(literal.width.normal, [-9 / 25, -20 / 25, 12 / 25]); near(literal.tab.normal, literal.width.normal)
  near([literal.width.offset, literal.tab.offset], [313 / 25, 313 / 25])
  input.bodies[3].pose = composeRigidPoses({ translation: [radians * 3, -radians * 2, radians], rotation: rotationExp([radians, -radians / 2, radians / 3]) }, input.bodies[3].pose)
  const initialEvaluation = evaluateRigidMates(input), initialFactor = oneSidedJacobiSvd(initialEvaluation.rows.map(row => row.jacobian))
  const before = structuredClone(input), result = solved(input), actual = independentObliquePlanes(input, result.poses)
  expect(angle(actual.width.normal, actual.tab.normal)).toBeLessThanOrEqual(input.angleTolerance)
  near([actual.width.offset - actual.tab.offset], [0], input.lengthTolerance)
  expect(result.rank).toBe(3); expect(result.localDOF).toBe(21)
  const group = result.evidence.groups[0]
  expect(group.bodyIds).toEqual(['a', 'b', 'c', 'd']); expect(group.unanchored).toBe(true)
  expect(group.rankRange).toEqual([3, 3]); expect(group.factorEvidence?.certified).toBe(true)
  expect(group.nullspace).toHaveLength(21)
  checkFourOwnerGauge(input, result.poses)
  const fresh = evaluateRigidMates(input, result.poses), factor = oneSidedJacobiSvd(fresh.rows.map(value => value.jacobian))
  expect(factor.rankRange).toEqual([3, 3]); expect(factor.evidence.certified).toBe(true)
  if (radians === 1e-9) {
    // Already within physical tolerances, but the fourth singular value is
    // ambiguous. The existing certified residual refinement must still run.
    expect(initialEvaluation.checks[0].satisfied).toBe(true)
    expect(initialFactor.rankRange).toEqual([3, 4])
    expect(result.iterations).toBeGreaterThan(0)
  }
  if (radians > .001) expect(result.iterations).toBeGreaterThan(0)
  expect(input).toEqual(before)
})

it('projects a real target for the fourth oblique free owner while the other three remain in the same hard group', () => {
  const input = obliqueFourOwners(), before = structuredClone(input), target = composeRigidPoses({ translation: [2, -1, 1], rotation: rotationExp([.1, .05, -.07]) }, input.bodies[3].pose)
  const projected = projectRigidMateTarget(input, { bodyId: 'd', frame: identityRigidPose(), targetPose: target, mode: 'translate' })
  expect(projected.status).toBe('ready')
  if (projected.status !== 'ready') throw new Error(projected.message)
  near(projected.resolvedPose.translation, target.translation, input.lengthTolerance)
  expect(angle(transformRigidDirection(projected.resolvedPose, [1, 0, 0]), transformRigidDirection(target, [1, 0, 0]))).toBeLessThanOrEqual(input.angleTolerance)
  expect(angle(transformRigidDirection(projected.resolvedPose, [0, 1, 0]), transformRigidDirection(target, [0, 1, 0]))).toBeLessThanOrEqual(input.angleTolerance)
  expect(projected.result.poses).not.toBeNull()
  const poses = projected.result.poses!, actual = independentObliquePlanes(input, poses)
  expect(angle(actual.width.normal, actual.tab.normal)).toBeLessThanOrEqual(input.angleTolerance)
  near([actual.width.offset - actual.tab.offset], [0], input.lengthTolerance)
  expect(projected.result.rank).toBe(3); expect(projected.result.localDOF).toBe(21)
  expect(projected.result.evidence.groups[0].bodyIds).toEqual(['a', 'b', 'c', 'd'])
  expect(projected.evidence.localOnly).toBe(true); expect(projected.evidence.inequalityProjection).toBeUndefined()
  checkFourOwnerGauge(input, poses)
  expect(input).toEqual(before)
})

it.each([false, true])('preserves the affine anchored offset with a nonzero accepted normal defect (rational gauge=%s)', gauged => {
  const epsilon = 4e-9, input = obliqueFourOwners(), before = structuredClone(input)
  // All four velocities differ. Their common pairwise Y translations keep
  // h_width=0 and give h_tab=-2*f*sin(epsilon), in physical millimeters.
  const velocities: Vec3[] = [[0, 3, 1], [0, 3, -2], [0, 2, 3], [0, 2, -4]]
  const gauge = gauged ? { translation: [7, -11, 13] as Vec3, rotation: [1 / 5, 2 / 5, 2 / 5, 4 / 5] as RigidPose['rotation'] } : identityRigidPose()
  const tolerance = gauged ? 1e-12 : 1e-13
  const samples: { fraction: number; offset: number; normal: Vec3; angle: number }[] = []
  for (const fraction of [0, 1 / 8, 1 / 2, 7 / 8, 1]) {
    const poses = new Map(input.bodies.map((owner, i) => [owner.id, composeRigidPoses(gauge, {
      translation: velocities[i].map(value => fraction * value) as Vec3,
      rotation: i < 2 ? [0, 0, 0, 1] : rotationExp([0, 0, epsilon]),
    })]))
    const actual = evaluateRigidMates(input, poses), physical = independentObliquePlanes(input, poses)
    expect(actual.diagnostics).toEqual([]); expect(actual.checks[0].satisfied).toBe(true)
    const mate = input.constraints[0]
    if (mate.type !== 'width') throw new Error('Original four-plane width required')
    const anchor = planePoint(mate.width[0], poses), q = physical.tab.normal.map((value, i) => value - physical.width.normal[i]) as Vec3
    const anchorTerm = q.reduce((sum, value, i) => sum + value * anchor[i], 0)
    const offset = physical.tab.offset - physical.width.offset - anchorTerm
    // In the direct coordinates q=(1-cos(epsilon),-sin(epsilon),0)
    // and p0=(-8,3*f,f). Subtracting q.dot(p0) changes the slope from
    // -2*sin(epsilon) to +sin(epsilon). No bisector helper supplies this oracle.
    const expected = 16 * Math.sin(epsilon / 2) ** 2 + fraction * Math.sin(epsilon)
    near([offset, actual.widthCentered![0].offsetMm], [expected, expected], tolerance)
    near([angle(physical.width.normal, physical.tab.normal), actual.widthCentered![0].angleRadians], [epsilon, epsilon], 1e-14)
    expect(Math.hypot(...q)).toBeGreaterThan(3e-9)
    if (!gauged) {
      near([physical.tab.offset - physical.width.offset], [-2 * fraction * Math.sin(epsilon)], tolerance)
      near([anchorTerm], [-16 * Math.sin(epsilon / 2) ** 2 - 3 * fraction * Math.sin(epsilon)], tolerance)
    }
    samples.push({ fraction, offset, normal: q, angle: actual.widthCentered![0].angleRadians })
  }
  const start = samples[0], finish = samples.at(-1)!
  for (const sample of samples) {
    near([sample.offset], [(1 - sample.fraction) * start.offset + sample.fraction * finish.offset], tolerance)
    near(sample.normal, start.normal, 1e-14); near([sample.angle], [start.angle], 1e-14)
    expect(Math.abs(sample.offset)).toBeLessThan(input.lengthTolerance)
  }
  expect(finish.offset - start.offset).toBeGreaterThan(3e-9)
  expect(input).toEqual(before)
})
