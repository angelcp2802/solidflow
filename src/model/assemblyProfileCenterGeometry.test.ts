import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { compareConditionedProfileCenters, type ConditionedProfileCenterSupport as Support, type ProfileCenterChoices, type ProfileCenterComparison } from './assemblyProfileCenterGeometry'
import { composeRigidPoses, transformRigidDirection, transformRigidPoint, type Quaternion } from './rigidPose'
import { rotationExp } from './assemblyKinematics'
const bands = { lengthTolerance: 1e-6, angleToleranceRad: 1e-8 }, identity: Quaternion = [0, 0, 0, 1]
const a: Support = { kind: 'rectangle', ownerId: 'a', center: [1, 2, 3], normal: [0, 0, 1], xDirection: [1, 0, 0] }
const b: Support = { kind: 'rectangle', ownerId: 'b', center: [4, 6, 5], normal: [0, 0, 1], xDirection: [1, 0, 0] }
const free: ProfileCenterChoices = { alignment: 'aligned', offset: 2, orientation: { mode: 'free' } }
function ok(first = a, second = b, choice = free, frame = identity): ProfileCenterComparison {
  const r = compareConditionedProfileCenters(first, second, choice, frame, bands)
  if (r.status !== 'ok') throw Error(r.message)
  return r
}
const near = (actual: readonly number[], expected: readonly number[], tolerance = 1e-11) => {
  expect(actual.length).toBe(expected.length); actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(tolerance))
}
const rows = (r: Pick<ProfileCenterComparison, 'position' | 'normal' | 'rectangle'>) => [...r.position, ...r.normal, ...(r.rectangle ?? [])]
function moved(s: Support, rotation: Quaternion, translation: Vec3): Support {
  const pose = { translation, rotation }, base = { ...s, center: transformRigidPoint(pose, s.center), normal: transformRigidDirection(pose, s.normal) }
  return s.kind === 'rectangle' ? { ...base, kind: 'rectangle', xDirection: transformRigidDirection(pose, s.xDirection) } : { ...base, kind: 'circle' }
}
it('has literal normalized signed offset, full vector position and physical angular oracles', () => {
  const r = ok(); near(r.position, [3, 4, 0]); expect(r.positionError).toBe(5); expect(r.axial).toBe(2); near(r.normal, [0, 0, 0]); expect(r.rectangle).toBeNull()
  const perpendicular = ok(a, { ...b, normal: [0, 1, 0], xDirection: [1, 0, 0] })
  expect(perpendicular.normalAngleRadians).toBe(Math.PI / 2); expect(Math.hypot(...perpendicular.normal)).toBe(Math.SQRT2)
})
for (const alignment of ['aligned', 'opposed'] as const) for (const quarterTurns of [0, 1, 2, 3] as const) it('uses literal quarter turn ' + quarterTurns + ' with ' + alignment, () => {
  const directions: Vec3[] = [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]]
  const target: Support = { ...b, center: [1, 2, 5], normal: [0, 0, alignment === 'aligned' ? 1 : -1], xDirection: directions[quarterTurns] }
  const r = ok(a, target, { alignment, offset: 2, orientation: { mode: 'rectangle', quarterTurns } })
  near(rows(r), Array(9).fill(0)); expect(r.normalAngleRadians).toBe(0); expect(r.rectangleAngleRadians).toBe(0)
})
it('free orientation accepts two circles and mixed shapes without creating roll', () => {
  const circle = (s: Support): Support => ({ kind: 'circle', center: s.center, normal: s.normal, ownerId: s.ownerId })
  expect(ok(circle(a), circle(b)).rectangle).toBeNull(); expect(ok(a, circle(b)).rectangle).toBeNull()
  expect(() => ok(a, circle(b), { ...free, orientation: { mode: 'rectangle', quarterTurns: 0 } })).toThrow(/two rectangles/)
})
it('reports true normal and rectangle antipodes with smooth chord rows, leaving chart admission to solver', () => {
  const normal = ok(a, { ...b, normal: [0, 0, -1], xDirection: [1, 0, 0] }); expect(normal.normalAngleRadians).toBe(Math.PI); expect(Math.hypot(...normal.normal)).toBe(2)
  const roll = ok(a, { ...b, xDirection: [-1, 0, 0] }, { ...free, orientation: { mode: 'rectangle', quarterTurns: 0 } })
  expect(roll.rectangleAngleRadians).toBe(Math.PI); expect(Math.hypot(...roll.rectangle!)).toBe(2)
})
for (const orientation of [{ mode: 'free' } as const, ...[0, 1, 2, 3].map(quarterTurns => ({ mode: 'rectangle' as const, quarterTurns: quarterTurns as 0 | 1 | 2 | 3 }))]) {
  it('matches all 12 formal columns at two left-retraction steps off solution: ' + JSON.stringify(orientation), () => {
    const qa = rotationExp([.23, -.31, .17]), qb = rotationExp([-.12, .26, .34]), first = moved(a, qa, [.2, -.4, .7]), second = moved(b, qb, [-.3, .8, -.2])
    const choice: ProfileCenterChoices = { alignment: 'opposed', offset: -.7, orientation }, measured = ok(first, second, choice, qa)
    for (const step of [2e-5, 5e-6]) for (let role = 0; role < 2; role++) for (let col = 0; col < 6; col++) {
      const sample = (sign: number) => {
        const tangent: Vec3 = [0, 0, 0], translation: Vec3 = [0, 0, 0]
        if (col < 3) translation[col] = sign * step; else tangent[col - 3] = sign * step
        const dq = rotationExp(tangent), selected = moved(role === 0 ? first : second, dq, translation)
        const frame = role === 0 ? composeRigidPoses({ translation: [0, 0, 0], rotation: dq }, { translation: [0, 0, 0], rotation: qa }).rotation : qa
        return rows(ok(role === 0 ? selected : first, role === 1 ? selected : second, choice, frame))
      }
      const plus = sample(1), minus = sample(-1), d = measured.supports[role]
      near(plus.map((v, i) => (v - minus[i]) / (2 * step)), [...d.position[col], ...d.normal[col], ...(d.rectangle?.[col] ?? [])], 3e-8)
    }
  })
}
it('retains formal null blocks and sums repeated owners; all common gauge columns vanish off solution', () => {
  const choice: ProfileCenterChoices = { ...free, orientation: { mode: 'rectangle', quarterTurns: 1 } }, r = ok(a, b, choice)
  const shared = ok({ ...a, ownerId: 'shared' }, { ...b, ownerId: 'shared' }, choice)
  expect(shared.owners.map(o => o.ownerId)).toEqual(['shared'])
  for (let col = 0; col < 6; col++) for (const key of ['position', 'normal', 'rectangle'] as const) {
    const sum = r.supports[0][key]![col].map((v, i) => v + r.supports[1][key]![col][i]); near(sum, [0, 0, 0]); near(shared.owners[0][key]![col], sum)
  }
  const fixed = ok({ ...a, ownerId: null }, b, choice); expect(fixed.owners.map(o => o.ownerId)).toEqual(['b']); expect(fixed.supports[0].position[0]).not.toEqual([0, 0, 0])
})
it('is invariant under a finite common proper rigid gauge, including the source frame off solution', () => {
  const choice: ProfileCenterChoices = { ...free, orientation: { mode: 'rectangle', quarterTurns: 3 } }, rotation = rotationExp([.3, -.2, .1])
  near(rows(ok(moved(a, rotation, [20, -30, 40]), moved(b, rotation, [20, -30, 40]), choice, rotation)), rows(ok(a, b, choice)))
})
it('matches physical repeated/null owner columns at two finite-difference steps', () => {
  const choice: ProfileCenterChoices = { alignment: 'opposed', offset: -.4, orientation: { mode: 'rectangle', quarterTurns: 2 } }
  for (const shared of [false, true]) {
    const first: Support = { ...a, ownerId: shared ? 'shared' : null }, second: Support = { ...b, ownerId: shared ? 'shared' : 'b' }, r = ok(first, second, choice)
    expect(r.owners).toHaveLength(1)
    for (const h of [2e-5, 5e-6]) for (let col = 0; col < 6; col++) {
      const sample = (sign: number) => {
        const t: Vec3 = [0, 0, 0], w: Vec3 = [0, 0, 0]; if (col < 3) t[col] = sign * h; else w[col - 3] = sign * h
        const q = rotationExp(w)
        return rows(ok(shared ? moved(first, q, t) : first, moved(second, q, t), choice, shared ? q : identity))
      }
      const plus = sample(1), minus = sample(-1), d = r.owners[0]
      near(plus.map((v, i) => (v - minus[i]) / (2 * h)), [...d.position[col], ...d.normal[col], ...d.rectangle![col]], 3e-8)
    }
  }
})
it('rejects insufficient requested precision without widening any band', () => {
  const evaluate = (first: Support, choice = free) => compareConditionedProfileCenters(first, b, choice, identity, bands)
  expect(evaluate({ ...a, center: [1e20, 0, 0] }).status).toBe('precisionLimit')
  expect(evaluate({ ...a, pointError: 2e-6 }).status).toBe('precisionLimit')
  expect(evaluate({ ...a, normalErrorRad: 1e-8 }, { ...free, offset: 1000 }).status).toBe('precisionLimit')
  expect(evaluate({ ...a, center: [Number.MIN_VALUE, 0, 0] }).status).toBe('precisionLimit')
  expect(evaluate({ ...a, xDirectionErrorRad: 2e-8 }, { ...free, orientation: { mode: 'rectangle', quarterTurns: 0 } }).status).toBe('precisionLimit')
})
it('validates explicit shape/purpose and data without invoking accessors', () => {
  let invoked = false
  const bad = { ...a, get center() { invoked = true; throw Error('not data') } }
  expect(() => ok(bad as unknown as Support)).toThrow(); expect(invoked).toBe(false)
  expect(() => ok({ ...a, normal: [0, 0, 2] })).toThrow()
  expect(() => ok({ ...a, xDirection: [0, 0, 1] })).toThrow()
  expect(() => ok({ kind: 'circle', ownerId: 'a', center: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0] } as unknown as Support)).toThrow()
  expect(() => ok(a, b, { ...free, orientation: { mode: 'rectangle', quarterTurns: 4 } } as unknown as ProfileCenterChoices)).toThrow()
})
