import { expect, it } from 'vitest'
import { evaluateRigidMates } from './assemblyMateEquations'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import { identityRigidPose, type RigidPose } from './rigidPose'
import type { RigidMateProblem, RigidProfileCenterConstraint } from './assemblySolveTypes'
import type { Vec3 } from '../cad/kernel.types'

// Original numerical profile frames only: no native/current-reference authority.
const profile = (rectangle = false) => rectangle
  ? { kind: 'rectangle' as const, center: [2, 3, 4] as Vec3, normal: [0, 0, 1] as Vec3, xDirection: [1, 0, 0] as Vec3, positionErrorMm: 0, normalErrorRad: 0, xDirectionErrorRad: 0 }
  : { kind: 'circle' as const, center: [2, 3, 4] as Vec3, normal: [0, 0, 1] as Vec3, positionErrorMm: 0, normalErrorRad: 0 }
function original(rectangle = false): RigidMateProblem {
  const mate: RigidProfileCenterConstraint = { id: 'original-profile', type: 'profile-center',
    first: { bodyId: 'a', frame: identityRigidPose(), profile: profile(rectangle) }, second: { bodyId: 'b', frame: identityRigidPose(), profile: profile(rectangle) },
    alignment: 'aligned', offsetMm: .7, orientation: rectangle ? { mode: 'rectangle', quarterTurns: 1 } : { mode: 'free' } }
  return { bodies: ['a', 'b'].map(id => ({ id, fixed: false, pose: identityRigidPose() })), constraints: [mate], origin: [0, 0, 0], lengthScale: 10, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
function checked(p: RigidMateProblem) { const e = evaluateRigidMates(p); expect(e.diagnostics).toEqual([]); return e }
const near = (a: number, b: number, tolerance = 1e-10) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
it('uses literal rotated source frames and a moving first-normal offset in physical units', () => {
  const p = original(), c = p.constraints[0] as RigidProfileCenterConstraint
  c.first.frame = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  c.second.frame = { translation: [-2, 3, 11], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }
  c.second.profile.center = [5, 6, 7]; c.offsetMm = 2
  // Literal Rz90*(2,3,4)+tA=(7,22,34), Rx90*(5,6,7)+tB=(3,-4,17).
  // Subtract offset2*nA: world defect(-4,-26,-19); first-frame defect(-26,4,-19).
  const e = checked(p), rows = e.rows.filter(r => r.kind === 'length')
  rows.forEach((r, i) => near(r.residual, [-2.6, .4, -1.9][i]))
  near(e.maxLengthResidual, Math.sqrt(1053)); near(e.maxAngleResidual, Math.PI / 2)
  expect(e.profileCenter).toHaveLength(1); expect(e.rows).toHaveLength(6)
})
it.each([false, true])('matches independent central differences for both owners and nonzero source frames, rectangle=%s', rectangle => {
  const p = original(rectangle), c = p.constraints[0] as RigidProfileCenterConstraint
  c.first.frame = { translation: [1, -2, 3], rotation: rotationExp([.2, -.1, .15]) }
  c.second.frame = { translation: [-3, 1, 2], rotation: rotationExp([-.15, .25, .1]) }
  p.bodies[0].pose = { translation: [3, 4, 5], rotation: rotationExp([.1, .2, -.15]) }
  p.bodies[1].pose = { translation: [-1, 2, 3], rotation: rotationExp([-.2, .1, .3]) }
  const e = checked(p), h = 2e-6
  expect(e.rows).toHaveLength(rectangle ? 9 : 6)
  for (let owner = 0; owner < 2; owner++) for (let axis = 0; axis < 6; axis++) {
    const delta = [0, 0, 0, 0, 0, 0]; delta[axis] = h
    const plus = new Map<string, RigidPose>([[p.bodies[owner].id, retractRigidBodyPose(p.bodies[owner].pose, delta, p.origin, p.lengthScale)]])
    delta[axis] = -h
    const minus = new Map<string, RigidPose>([[p.bodies[owner].id, retractRigidBodyPose(p.bodies[owner].pose, delta, p.origin, p.lengthScale)]])
    const a = evaluateRigidMates(p, plus), b = evaluateRigidMates(p, minus)
    expect(a.diagnostics).toEqual([]); expect(b.diagnostics).toEqual([])
    e.rows.forEach((row, index) => near(row.jacobian[owner * 6 + axis], (a.rows[index].residual - b.rows[index].residual) / (2 * h), 2e-7))
  }
})
it('keeps physical norm acceptance separate from each component row and propagates max checks', () => {
  const p = original(), c = p.constraints[0] as RigidProfileCenterConstraint; c.offsetMm = 0
  p.bodies[1].pose.translation = [8e-7, 8e-7, 8e-7]
  const e = checked(p)
  expect(e.rows.filter(r => r.kind === 'length').every(r => Math.abs(r.residual) <= r.tolerance)).toBe(true)
  near(e.maxLengthResidual, Math.sqrt(3) * 8e-7); expect(e.checks[0].satisfied).toBe(false)
  near(e.checks[0].lengthResidual, e.maxLengthResidual)
})
it('preserves physical metrics and normalized derivatives over independent solve scales', () => {
  for (const scale of [1, 10, 1000]) {
    const p = original(); p.lengthScale = scale
    p.bodies[1].pose.translation = [3, 4, 12]
    const e = checked(p)
    near(e.maxLengthResidual, Math.hypot(3, 4, 11.3)); near(e.rows[0].jacobian[6], 1)
    near(e.rows[0].residual * scale, 3)
  }
})
it('reports true normal radians and sums repeated-owner derivatives once', () => {
  const p = original(), c = p.constraints[0] as RigidProfileCenterConstraint
  c.offsetMm = 0; c.first.profile.center = [0, 0, 0]; c.second.profile.center = [0, 0, 0]
  p.bodies[1].pose.rotation = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
  const e = checked(p)
  near(e.maxAngleResidual, Math.PI / 2)
  near(Math.hypot(...e.rows.filter(r => r.kind === 'angle').map(r => r.residual)), Math.PI / 2)
  expect(Math.abs(e.maxAngleResidual - Math.SQRT2)).toBeGreaterThan(.1)
  const shared = original(true), s = shared.constraints[0] as RigidProfileCenterConstraint
  s.second.bodyId = 'a'; s.offsetMm = 0; s.orientation = { mode: 'rectangle', quarterTurns: 0 }
  s.second.frame.translation = [1, 2, 3]
  const measured = checked(shared)
  // All supports and the reporting frame rotate together. This exact rigid
  // gauge must cancel even off solution; two independent formal blocks sum.
  measured.rows.forEach(row => row.jacobian.slice(0, 6).forEach(v => near(v, 0)))
})
it('takes the maximum physical angle including an explicit rectangle quarter-turn branch', () => {
  const p = original(true), c = p.constraints[0] as RigidProfileCenterConstraint
  c.offsetMm = 0
  const e = checked(p)
  near(e.maxAngleResidual, Math.PI / 2); expect(e.checks[0].satisfied).toBe(false)
  if (c.second.profile.kind !== 'rectangle') throw Error('Expected rectangle')
  // q=1 rotates source +X toward +Y around source +Z, independently literal.
  c.second.profile.xDirection = [0, 1, 0]
  const target = checked(p); near(target.maxAngleResidual, 0); expect(target.checks[0].satisfied).toBe(true)
})
it('rejects incomplete uncertainty, incompatible axes and cancelled-source precision without widening bands', () => {
  const missing = original(), m = missing.constraints[0] as RigidProfileCenterConstraint
  delete (m.first.profile as Partial<typeof m.first.profile>).positionErrorMm
  expect(evaluateRigidMates(missing).diagnostics[0].code).toBe('invalidGeometry')
  const bad = original(true), b = bad.constraints[0] as RigidProfileCenterConstraint
  if (b.first.profile.kind !== 'rectangle') throw Error('Expected rectangle')
  b.first.profile.xDirection = [0, 0, 1]
  expect(evaluateRigidMates(bad).diagnostics[0].code).toBe('invalidGeometry')
  const far = original(), f = far.constraints[0] as RigidProfileCenterConstraint
  f.first.frame.translation = [1e12, 0, 0]; f.first.profile.center = [-1e12, 0, 0]
  expect(evaluateRigidMates(far).diagnostics[0].code).toBe('precisionLimit')
})
it('reports antipodal charts explicitly instead of falsely accepting zero tangential derivatives', () => {
  const p = original(); p.bodies[1].pose.rotation = [1, 0, 0, 0]
  const e = evaluateRigidMates(p)
  expect(e.diagnostics[0].code).toBe('orientationChart'); expect(e.checks).toEqual([]); expect(e.rows).toEqual([])
})
it('rejects top-level identity and family accessors before executing either getter', () => {
  let invoked = 0
  for (const field of ['id', 'type'] as const) {
    const p = original()
    Object.defineProperty(p.constraints[0], field, { enumerable: true, get() { invoked++; throw Error('Executable declaration') } })
    expect(() => evaluateRigidMates(p)).toThrow(/own enumerable string data/)
  }
  expect(invoked).toBe(0)
})
