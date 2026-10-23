import { expect, it } from 'vitest'
import { solveRigidMates, type RigidMateSolverOptions } from './assemblySolver'
import { evaluateRigidMates } from './assemblyMateEquations'
import type { RigidMateProblem, RigidMateEndpoint } from './assemblySolveTypes'
import { identityRigidPose } from './rigidPose'
import { rotationExp } from './assemblyKinematics'

// Original independent XY plane declarations. A fixed small tilt cannot be
// corrected, whereas the separate variable plane has an actual rotation DOF.
function fixture(fixedTilt = 4e-9): RigidMateProblem {
  const plane = (bodyId: string | null): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(),
    support: { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 } })
  return { origin: [0, 0, 0], lengthScale: 1, lengthTolerance: 1e-6, angleTolerance: 1e-8,
    bodies: [ { id: 'immutable', fixed: true, pose: { translation: [0, 0, 0], rotation: rotationExp([fixedTilt, 0, 0]) } },
      { id: 'movable', fixed: false, pose: { translation: [3, 2, 1], rotation: rotationExp([4e-9, 0, 0]) } } ],
    constraints: [ { id: 'fixed', type: 'parallel', first: plane('immutable'), second: plane(null), alignment: 'aligned' },
      { id: 'variable', type: 'parallel', first: plane('movable'), second: plane(null), alignment: 'aligned' } ] }
}
it('keeps an immutable public-band defect while refining an independent variable group and its evidence', () => {
  const p = fixture(), before = structuredClone(p), result = solveRigidMates(p, { angleRefinementTolerance: 1e-9 })
  expect(result.status).toBe('underdefined'); expect(result.poses).not.toBeNull()
  expect(result.poses!.get('immutable')).toEqual(p.bodies[0].pose)
  expect(result.evidence.groups).toHaveLength(1)
  const group = result.evidence.groups[0]
  expect(group.bodyIds).toEqual(['movable']); expect(group.iterations).toBeGreaterThan(0)
  expect(group.checks[0].angleTolerance).toBe(1e-9); expect(group.checks[0].angleResidual).toBeLessThanOrEqual(1e-9)
  expect(group.rowResiduals.every(r => r.tolerance === 1e-9)).toBe(true)
  const physical = evaluateRigidMates(p, result.poses!)
  expect(physical.checks.every(c => c.satisfied)).toBe(true)
  expect(physical.checks[0].angleResidual).toBeCloseTo(4e-9, 16)
  expect(physical.checks[0].angleResidual).toBeGreaterThan(1e-9)
  expect(result.evidence.maxAngleResidual).toBeGreaterThan(1e-9)
  expect(p).toEqual(before)
})
it('preserves ordinary no-option behavior and permits an equal refinement tolerance', () => {
  const p = fixture(), ordinary = solveRigidMates(p), equal = solveRigidMates(p, { angleRefinementTolerance: p.angleTolerance })
  expect(equal).toEqual(ordinary)
  expect(ordinary.evidence.groups[0].checks[0].angleTolerance).toBe(1e-8)
  expect(ordinary.evidence.groups[0].iterations).toBe(0)
  expect(ordinary.poses!.get('movable')).toEqual(p.bodies[1].pose)
})
it('rejects immutable defects beyond the public band without publishing partially refined poses', () => {
  const p = fixture(2e-8), before = structuredClone(p), result = solveRigidMates(p, { angleRefinementTolerance: 1e-9 })
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull()
  expect(result.certificates[0].kind).toBe('fixedConstraint')
  if (result.certificates[0].kind !== 'fixedConstraint') throw Error('Expected fixed certificate')
  expect(result.certificates[0].checks[0].angleTolerance).toBe(1e-8)
  expect(result.certificates[0].checks[0].angleResidual).toBeGreaterThan(1e-8)
  expect(p).toEqual(before)
})
for (const value of [NaN, Infinity, -Infinity, 0, -1e-9, 2e-8, undefined, '1e-9']) it('atomically rejects invalid refinement ' + String(value), () => {
  const p = fixture(), before = structuredClone(p)
  const result = solveRigidMates(p, { angleRefinementTolerance: value } as RigidMateSolverOptions)
  expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull(); expect(result.iterations).toBe(0); expect(p).toEqual(before)
})
it('rejects an executable or inherited refinement field without invoking it', () => {
  let reads = 0
  const options = { get angleRefinementTolerance() { reads++; return 1e-9 } }
  expect(solveRigidMates(fixture(), options).status).toBe('invalidInput'); expect(reads).toBe(0)
  expect(solveRigidMates(fixture(), Object.create({ angleRefinementTolerance: 1e-9 })).status).toBe('invalidInput')
})

// Original parallel XY plane pairs with independently prescribed signed gaps.
// An immutable gap uses public acceptance; a movable gap has a real Z DOF.
function lengthFixture(fixedGap = 4e-7): RigidMateProblem {
  const plane = (bodyId: string | null): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(),
    support: { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 } })
  return { origin: [0, 0, 0], lengthScale: 1, lengthTolerance: 1e-6, angleTolerance: 1e-8,
    bodies: [ { id: 'immutable', fixed: true, pose: { translation: [0, 0, fixedGap], rotation: [0, 0, 0, 1] } },
      { id: 'movable', fixed: false, pose: { translation: [3, 2, 8e-7], rotation: [0, 0, 0, 1] } } ],
    constraints: [ { id: 'fixed-gap', type: 'distance', first: plane('immutable'), second: plane(null), distance: 0, alignment: 'aligned' },
      { id: 'variable-gap', type: 'distance', first: plane('movable'), second: plane(null), distance: 0, alignment: 'aligned' } ] }
}
it('refines a movable length residual while preserving an immutable defect inside its public band', () => {
  const p = lengthFixture(), before = structuredClone(p)
  const ordinary = solveRigidMates(p), result = solveRigidMates(p, { lengthRefinementTolerance: 2e-7 })
  expect(result.status).toBe('underdefined'); expect(result.poses).not.toBeNull()
  expect(result.poses!.get('immutable')).toEqual(p.bodies[0].pose)
  const group = result.evidence.groups[0]
  expect(group.bodyIds).toEqual(['movable']); expect(group.iterations).toBeGreaterThan(0)
  expect(group.checks[0].lengthTolerance).toBe(2e-7)
  expect(group.checks[0].lengthResidual).toBeLessThanOrEqual(2e-7)
  expect(group.rowResiduals.filter(row => row.kind === 'length').every(row => row.tolerance === 2e-7)).toBe(true)
  const actualZ = Math.abs(result.poses!.get('movable')!.translation[2])
  expect(actualZ).toBeLessThanOrEqual(2e-7)
  expect(actualZ).toBeLessThan(Math.abs(ordinary.poses!.get('movable')!.translation[2]))
  expect(ordinary.evidence.groups[0].iterations).toBe(0)
  const physical = evaluateRigidMates(p, result.poses!)
  expect(physical.checks.every(check => check.satisfied)).toBe(true)
  expect(physical.checks[0].lengthResidual).toBeCloseTo(4e-7, 16)
  expect(physical.checks[0].lengthResidual).toBeGreaterThan(2e-7)
  expect(result.evidence.maxLengthResidual).toBeGreaterThan(2e-7)
  expect(p).toEqual(before)
})
it('keeps default length behavior byte-for-byte equivalent to an explicit equal refinement band', () => {
  const p = lengthFixture(), ordinary = solveRigidMates(p)
  expect(solveRigidMates(p, { lengthRefinementTolerance: p.lengthTolerance })).toEqual(ordinary)
  expect(ordinary.poses!.get('movable')).toEqual(p.bodies[1].pose)
  expect(ordinary.evidence.groups[0].checks[0].lengthTolerance).toBe(1e-6)
})
it('rejects an immutable gap outside the public band before publishing any variable refinement', () => {
  const p = lengthFixture(2e-6), before = structuredClone(p), result = solveRigidMates(p, { lengthRefinementTolerance: 2e-7 })
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull()
  expect(result.certificates[0].kind).toBe('fixedConstraint')
  if (result.certificates[0].kind !== 'fixedConstraint') throw Error('Expected immutable gap certificate')
  expect(result.certificates[0].checks[0].lengthTolerance).toBe(1e-6)
  expect(result.certificates[0].checks[0].lengthResidual).toBeGreaterThan(1e-6)
  expect(p).toEqual(before)
})
for (const value of [NaN, Infinity, -Infinity, 0, -1e-7, 2e-6, undefined, '1e-7']) it('atomically rejects invalid length refinement ' + String(value), () => {
  const p = lengthFixture(), before = structuredClone(p)
  const result = solveRigidMates(p, { lengthRefinementTolerance: value } as RigidMateSolverOptions)
  expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull(); expect(result.iterations).toBe(0); expect(p).toEqual(before)
})
it('rejects own, inherited and hidden length refinement accessors without executing them', () => {
  let reads = 0
  const getter = { get lengthRefinementTolerance() { reads++; return 2e-7 } }
  expect(solveRigidMates(lengthFixture(), getter).status).toBe('invalidInput')
  const inherited = Object.create(Object.defineProperty({}, 'lengthRefinementTolerance', { enumerable: true, get() { reads++; return 2e-7 } }))
  expect(solveRigidMates(lengthFixture(), inherited).status).toBe('invalidInput')
  expect(solveRigidMates(lengthFixture(), Object.create({ lengthRefinementTolerance: 2e-7 })).status).toBe('invalidInput')
  expect(solveRigidMates(lengthFixture(), Object.defineProperty({}, 'lengthRefinementTolerance', { value: 2e-7 })).status).toBe('invalidInput')
  expect(reads).toBe(0)
})
it('refines actual variable travel while preserving active and passive multi-turn gear continuity and authored captures', () => {
  const p = lengthFixture(), tau = 2 * Math.PI
  const neutral = (a: number): [number, number, number, number] => [0, 0, Math.sin(a / 2), Math.cos(a / 2)]
  const captured = { first: neutral(.3), second: neutral(-.2) }
  const shaft = (bodyId: string, rotation: [number, number, number, number]): RigidMateEndpoint => ({ bodyId,
    frame: { translation: [0, 0, 0], rotation: [...rotation] },
    support: { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 0 } })
  const active: Extract<RigidMateProblem['constraints'][number], { type: 'gear' }> = {
    id: 'active-lift', type: 'gear', first: shaft('movable', captured.first), second: shaft('immutable', captured.second), carrier: null,
    ratio: { numerator: 1, denominator: 1 }, direction: 'opposed', neutralRotations: structuredClone(captured),
    angles: { first: 4 * tau, second: -2 * tau }, phase: 2 * tau,
  }
  const passive = { ...structuredClone(active), id: 'passive-lift', angles: { first: -6 * tau, second: 8 * tau } }
  p.constraints.push(active); p.passiveGears = [passive]
  const before = structuredClone(p), ordinary = solveRigidMates(p)
  const result = solveRigidMates(p, { lengthRefinementTolerance: 2e-7 })
  expect(result.status).toBe('underdefined'); expect(result.poses).not.toBeNull()
  const group = result.evidence.groups[0]
  expect(group.constraintIds).toContain('active-lift'); expect(group.constraintIds).toContain('variable-gap')
  expect(group.iterations).toBeGreaterThan(0)
  expect(Math.abs(result.poses!.get('movable')!.translation[2])).toBeLessThanOrEqual(2e-7)
  expect(Math.abs(result.poses!.get('movable')!.translation[2])).toBeLessThan(Math.abs(ordinary.poses!.get('movable')!.translation[2]))
  expect(result.gearAngles.get('active-lift')!.first).toBeCloseTo(4 * tau, 12)
  expect(result.gearAngles.get('active-lift')!.second).toBeCloseTo(-2 * tau, 12)
  expect(result.gearAngles.get('passive-lift')!.first).toBeCloseTo(-6 * tau, 12)
  expect(result.gearAngles.get('passive-lift')!.second).toBeCloseTo(8 * tau, 12)
  expect(p).toEqual(before)
  expect(active.neutralRotations).toEqual(captured); expect(active.phase).toBe(2 * tau)
  const physical = evaluateRigidMates(p, result.poses!)
  expect(physical.diagnostics).toEqual([]); expect(physical.checks.every(check => check.satisfied)).toBe(true)
})
