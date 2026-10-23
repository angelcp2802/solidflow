import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { rotationExp, retractRigidBodyPose } from './assemblyKinematics'
import { identityRigidPose, transformRigidDirection, type RigidPose } from './rigidPose'
import type { RigidHingeConstraint, RigidMateEndpoint, RigidMateProblem } from './assemblySolveTypes'
import type { AssemblyDirectedAngleArc } from './assemblyLimitDirectedAngle'

// Original Cartesian declarations. No saved/native reference authority is supplied.
const rad = (degrees: number) => degrees * Math.PI / 180
const near = (actual: number, expected: number, band = 1e-8) => {
  expect(Number.isFinite(actual)).toBe(true)
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(band)
}
function fixture(degrees = 0, arc: AssemblyDirectedAngleArc = { start: 330, sweep: 60 }, bothFree = false): RigidMateProblem {
  const axis = (bodyId: string): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(),
    support: { kind: 'line', point: [0, 0, 0], axis: [0, 0, 1], tolerance: 0 } })
  const plane = (bodyId: string, angular = false): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(),
    support: { kind: 'plane', point: angular ? [3, 0, 0] : [0, 0, 2], normal: angular ? [1, 0, 0] : [0, 0, 1],
      xDirection: angular ? [0, 1, 0] : [1, 0, 0], tolerance: 0 } })
  const hinge: RigidHingeConstraint = { id: 'original-stop', type: 'hinge', axis: [axis('a'), axis('b')],
    axial: [plane('a'), plane('b')], alignment: 'aligned',
    stops: { coordinate: 'directed-about-axis', angular: [plane('a', true), plane('b', true)], arc } }
  return { bodies: [{ id: 'a', pose: identityRigidPose(), fixed: !bothFree },
    { id: 'b', fixed: false, pose: { translation: [0, 0, 0], rotation: rotationExp([0, 0, rad(degrees)]) } }],
    constraints: [hinge], origin: [0, 0, 0], lengthScale: 3, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
const hinge = (p: RigidMateProblem) => p.constraints[0] as RigidHingeConstraint
function ray(pose: RigidPose, degrees: number) {
  const direction = transformRigidDirection(pose, [1, 0, 0])
  near(direction[0], Math.cos(rad(degrees))); near(direction[1], Math.sin(rad(degrees))); near(direction[2], 0)
}

it.each([{ degrees: 0, lineality: 1, active: 0 }, { degrees: 330, lineality: 0, active: 1 },
  { degrees: 30, lineality: 0, active: 1 }])('keeps bilateral rank five and reports the actual stop cone at $degrees', ({ degrees, lineality, active }) => {
  const p = fixture(degrees), before = structuredClone(p), result = solveRigidMates(p)
  expect(result.poses, result.evidence.diagnostics.join('\n')).not.toBeNull()
  expect(result.rank).toBe(5); expect(result.localDOF).toBe(1)
  const group = result.evidence.groups[0]
  expect(group.limitCone?.linealityDimension ?? 1).toBe(lineality)
  expect(group.limitCone?.activeBounds.length ?? 0).toBe(active)
  if (active) expect(group.limitCone?.rankRange).toEqual([6, 6])
  expect(group.hingeStops).toHaveLength(1); expect(group.checks[0].satisfied).toBe(true)
  expect(group.hingeStops![0].directionErrorRad).toBeGreaterThan(0)
  ray(result.poses!.get('b')!, degrees); expect(p).toEqual(before)
})

it.each([{ degrees: 320, target: 330 }, { degrees: 40, target: 30 }])('restores $degrees to $target without a seed that could jump the interval', ({ degrees, target }) => {
  const p = fixture(degrees), before = structuredClone(p), result = solveRigidMates(p)
  expect(result.poses, result.evidence.diagnostics.join('\n')).not.toBeNull()
  expect(result.evidence.groups[0].seededConstraintIds).toEqual([])
  ray(result.poses!.get('b')!, target); expect(p).toEqual(before)
})

it('releases inward and clamps outward at both stops without saving an active set', () => {
  const p = fixture(330), original = structuredClone(hinge(p))
  for (const [requested, expected] of [[350, 350], [40, 30], [10, 10], [320, 330]]) {
    const result = projectRigidMateTarget(p, { bodyId: 'b', frame: identityRigidPose(), mode: 'rotate',
      targetPose: { translation: [0, 0, 0], rotation: rotationExp([0, 0, rad(requested)]) } })
    expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
    if (result.status !== 'ready') throw Error('Projection rejected')
    ray(result.resolvedPose, expected)
    result.resolvedPose.translation.forEach(value => near(value, 0, 1e-6))
    expect(result.result.rank).toBe(5)
    p.bodies[1].pose = result.resolvedPose
  }
  expect(hinge(p)).toEqual(original)
})

it('keeps equal endpoints distinct from a full turn and rejects the opposite-centre chart atomically', () => {
  const equal = fixture(30, { start: 20, sweep: 0 }), result = solveRigidMates(equal)
  expect(result.poses).not.toBeNull(); ray(result.poses!.get('b')!, 20)
  expect(result.rank).toBe(5); expect(result.evidence.groups[0].limitCone?.linealityDimension).toBe(0)
  const full = fixture(180, { start: 0, sweep: 360 }), evaluated = evaluateRigidMates(full)
  expect(evaluated.diagnostics).toEqual([]); expect(evaluated.inequalities ?? []).toEqual([])
  expect(solveRigidMates(full).localDOF).toBe(1)
  const cut = fixture(180), before = structuredClone(cut), rejected = solveRigidMates(cut)
  expect(rejected.status).toBe('nonConverged'); expect(rejected.poses).toBeNull()
  expect(rejected.certificates).toEqual([]); expect(cut).toEqual(before)
})

it('keeps fixed infeasibility and a zero iteration budget atomic and distinct', () => {
  const fixed = fixture(40); fixed.bodies[1].fixed = true
  const rejected = solveRigidMates(fixed)
  expect(rejected.status).toBe('inconsistent'); expect(rejected.poses).toBeNull()
  expect(rejected.certificates[0]).toMatchObject({ kind: 'fixedConstraint', constraintIds: ['original-stop'] })
  const p = fixture(40), before = structuredClone(p), budget = solveRigidMates(p, { maxIterations: 0 })
  expect(budget.status).toBe('nonConverged'); expect(budget.poses).toBeNull(); expect(p).toEqual(before)
})

it('uses both descendant material frames and preserves common gauge in all actual owner columns', () => {
  const p = fixture(20, { start: 0, sweep: 15 }, true), c = hinge(p)
  c.stops!.angular[0].frame.rotation = rotationExp([0, 0, rad(10)])
  c.stops!.angular[1].frame.rotation = rotationExp([0, 0, rad(-5)])
  const e = evaluateRigidMates(p)
  expect(e.diagnostics).toEqual([]); near(e.hingeStops![0].angleRadians, rad(5), 1e-14)
  expect(e.checks[0].satisfied).toBe(true)
  for (const row of [...e.rows, ...e.inequalities!]) for (let i = 0; i < 6; i++) near(row.jacobian[i] + row.jacobian[6 + i], 0, 2e-13)
  const result = solveRigidMates(p); expect(result.rank).toBe(5); expect(result.localDOF).toBe(7)
})

it('uses the first material axis for angle sign independently of the bilateral axis alignment', () => {
  const p = fixture(20), c = hinge(p)
  c.alignment = 'opposed'
  c.axis[1].frame.rotation = rotationExp([Math.PI, 0, 0])
  c.axial[1].frame = { translation: [0, 0, 4], rotation: rotationExp([Math.PI, 0, 0]) }
  const opposed = evaluateRigidMates(p)
  expect(opposed.diagnostics).toEqual([]); expect(opposed.checks[0].satisfied).toBe(true)
  near(opposed.hingeStops![0].angleRadians, rad(20), 1e-14)
  const reverse = fixture(20)
  for (const axis of hinge(reverse).axis) axis.frame.rotation = rotationExp([Math.PI, 0, 0])
  const reversed = evaluateRigidMates(reverse)
  expect(reversed.diagnostics).toEqual([]); expect(reversed.checks[0].satisfied).toBe(true)
  near(reversed.hingeStops![0].angleRadians, rad(340), 1e-14)
})

for (const step of [2e-5, 7e-6]) it('retains six-role owner derivatives off solution at step ' + step, () => {
  const p = fixture(0, { start: 300, sweep: 120 }, true)
  p.bodies[0].pose = { translation: [.3, -.4, .2], rotation: rotationExp([.13, -.22, .17]) }
  p.bodies[1].pose = { translation: [-.2, .1, .3], rotation: rotationExp([-.18, .14, -.11]) }
  const c = hinge(p)
  c.stops!.angular[0].frame.rotation = rotationExp([.1, .2, -.1])
  c.stops!.angular[1].frame.rotation = rotationExp([-.2, .1, .15])
  const baseline = evaluateRigidMates(p)
  expect(baseline.diagnostics).toEqual([]); expect(baseline.inequalities).toHaveLength(2)
  for (let col = 0; col < 12; col++) {
    const at = (sign: number) => {
      const poses = new Map<string, RigidPose>(p.bodies.map(body => [body.id, body.pose]))
      const body = p.bodies[Math.floor(col / 6)], delta = Array(6).fill(0); delta[col % 6] = sign * step
      poses.set(body.id, retractRigidBodyPose(body.pose, delta, p.origin, p.lengthScale))
      const value = evaluateRigidMates(p, poses); expect(value.diagnostics).toEqual([]); return value
    }
    const plus = at(1), minus = at(-1)
    baseline.rows.forEach((row, i) => near((plus.rows[i].residual - minus.rows[i].residual) / (2 * step), row.jacobian[col], 3e-8))
    baseline.inequalities!.forEach((row, i) => near((plus.inequalities![i].margin - minus.inequalities![i].margin) / (2 * step), row.jacobian[col], 3e-8))
  }
})

it('does not invent angular freedom for repeated or null owners', () => {
  const p = fixture(0, undefined, true), c = hinge(p)
  for (const e of [c.axis[1], c.axial[1], c.stops!.angular[1]]) e.bodyId = 'a'
  const repeated = evaluateRigidMates(p)
  expect(repeated.diagnostics).toEqual([])
  for (const row of [...repeated.rows, ...repeated.inequalities!]) expect(row.jacobian.every(x => Math.abs(x) < 2e-13)).toBe(true)
  expect(solveRigidMates(p).rank).toBe(0)
  for (const e of [...c.axis, ...c.axial, ...c.stops!.angular]) e.bodyId = null
  expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true)
})

it('withholds singular angular caps and exhausted angular cones without enlarging the band', () => {
  const singular = fixture(); hinge(singular).stops!.angular[1] = structuredClone(hinge(singular).axial[1])
  expect(solveRigidMates(singular).status).toBe('precisionLimit')
  const uncertain = fixture(), c = hinge(uncertain)
  c.stops!.uncertainty = [{ positionErrorMm: 0, directionErrorRad: 1e-4 }, { positionErrorMm: 0, directionErrorRad: 0 }]
  expect(solveRigidMates(uncertain).status).toBe('precisionLimit'); expect(uncertain.angleTolerance).toBe(1e-8)
})

it('withholds a nominal near-bound fit after the retained direction cone consumes its remaining band', () => {
  const p = fixture(30 + 8e-9 * 180 / Math.PI), c = hinge(p)
  c.stops!.uncertainty = [{ positionErrorMm: 0, directionErrorRad: 2e-9 }, { positionErrorMm: 0, directionErrorRad: 0 }]
  const rejected = evaluateRigidMates(p)
  expect(rejected.diagnostics[0].code).toBe('precisionLimit')
  expect(rejected.rows).toEqual([]); expect(rejected.checks).toEqual([]); expect(rejected.inequalities ?? []).toEqual([])
  p.bodies[1].pose.rotation = rotationExp([0, 0, rad(29)])
  expect(evaluateRigidMates(p).checks[0].satisfied).toBe(true)
})

it('retains coupled gearing and the hinge interval in one actual connected group', () => {
  const p = fixture(40), neutral = identityRigidPose().rotation
  p.bodies.push({ id: 'follower', fixed: false, pose: identityRigidPose() })
  const cylinder = (bodyId: string): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(), support: {
    kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1] as Vec3, xDirection: [1, 0, 0] as Vec3, radius: 1, tolerance: 0 } })
  p.constraints.push({ id: 'coupling', type: 'gear', first: cylinder('b'), second: cylinder('follower'), carrier: null,
    ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', neutralRotations: { first: [...neutral], second: [...neutral] },
    // The declared 2:1 gear uses normalized weights 1 and 1/2:
    // thetaB + thetaFollower/2 = 40 degrees, hence 30 -> 20.
    angles: { first: rad(40), second: 0 }, phase: rad(40) })
  const result = solveRigidMates(p)
  expect(result.poses, result.evidence.diagnostics.join('\n')).not.toBeNull()
  expect(result.evidence.groups).toHaveLength(1)
  ray(result.poses!.get('b')!, 30); ray(result.poses!.get('follower')!, 20)
  expect(result.evidence.groups[0].checks.every(check => check.satisfied)).toBe(true)
})
