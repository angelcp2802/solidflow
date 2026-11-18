import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import type { Quaternion, RigidPose } from './rigidPose'
import type { RigidMateConstraint, RigidMateProblem, RigidSolverBody } from './assemblySolveTypes'
import { solveRigidMates, type RigidMateSolverOptions } from './assemblySolver'
import { evaluateRigidMates } from './assemblyMateEquations'

type ProfileConstraint = Extract<RigidMateConstraint, { type: 'profile-center' }>
type ProfileEndpoint = ProfileConstraint['first']
type Profile = ProfileEndpoint['profile']
const I: Quaternion = [0, 0, 0, 1], S = Math.SQRT1_2
const pose = (translation: Vec3 = [0, 0, 0], rotation: Quaternion = I): RigidPose => ({ translation: [...translation], rotation: [...rotation] })
const body = (id = 'moving', translation: Vec3 = [4, -6, 9], rotation: Quaternion = I, fixed = false): RigidSolverBody => ({ id, fixed, pose: pose(translation, rotation) })
const near = (actual: readonly number[], expected: readonly number[], tolerance = 1e-7) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((v, i) => { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(tolerance) })
}
// Original numerical profiles only: no CAD fixture, saved mate or native-policy
// claim. Full input error fields are explicit, even when the declared error is 0.
function profile(kind: 'circle' | 'rectangle' = 'circle', center: Vec3 = [0, 0, 0]): Profile {
  const common = { center, normal: [0, 0, 1] as Vec3, positionErrorMm: 0, normalErrorRad: 0 }
  return kind === 'circle' ? { kind, ...common } : { kind, ...common, xDirection: [1, 0, 0], xDirectionErrorRad: 0 }
}
const endpoint = (bodyId: string | null, p: Profile = profile(), frame = pose()): ProfileEndpoint => ({ bodyId, frame, profile: p })
function constraint(rectangle = false): ProfileConstraint {
  return { id: 'original-profile-center', type: 'profile-center', first: endpoint(null, profile(rectangle ? 'rectangle' : 'circle', [1, 2, 3])),
    second: endpoint('moving', profile(rectangle ? 'rectangle' : 'circle')), alignment: 'aligned', offsetMm: 2,
    orientation: rectangle ? { mode: 'rectangle', quarterTurns: 0 } : { mode: 'free' } }
}
function problem(c = constraint(), bodies = [body()]): RigidMateProblem {
  return { bodies, constraints: [c], origin: [0, 0, 0], lengthScale: 10, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
function solved(p: RigidMateProblem, options?: RigidMateSolverOptions) {
  const result = solveRigidMates(p, options)
  expect(['underdefined', 'fullyDefined'], JSON.stringify(result.evidence.diagnostics)).toContain(result.status)
  if (!result.poses) throw Error('Expected independently checkable solved poses')
  return { ...result, poses: result.poses }
}
// Independent closed-form quaternion matrix. Expected target centers/bases below
// are literal Cartesian values; no production geometry/pose helper is an oracle.
function rotate(q: readonly number[], v: readonly number[]): Vec3 {
  const [x, y, z, w] = q, [a, b, c] = v
  return [(1 - 2 * (y * y + z * z)) * a + 2 * (x * y - z * w) * b + 2 * (x * z + y * w) * c,
    2 * (x * y + z * w) * a + (1 - 2 * (x * x + z * z)) * b + 2 * (y * z - x * w) * c,
    2 * (x * z - y * w) * a + 2 * (y * z + x * w) * b + (1 - 2 * (x * x + y * y)) * c]
}
function placed(e: ProfileEndpoint, poses: ReadonlyMap<string, RigidPose>) {
  const owner = e.bodyId === null ? pose() : poses.get(e.bodyId)!
  const localCenter = rotate(e.frame.rotation, e.profile.center).map((v, i) => v + e.frame.translation[i]) as Vec3
  return { center: rotate(owner.rotation, localCenter).map((v, i) => v + owner.translation[i]) as Vec3,
    normal: rotate(owner.rotation, rotate(e.frame.rotation, e.profile.normal)),
    x: e.profile.kind === 'rectangle' ? rotate(owner.rotation, rotate(e.frame.rotation, e.profile.xDirection)) : null }
}
function physical(c: ProfileConstraint, poses: ReadonlyMap<string, RigidPose>, tolerance = 1e-6) {
  const a = placed(c.first, poses), b = placed(c.second, poses), sign = c.alignment === 'aligned' ? 1 : -1
  near(b.center, a.center.map((v, i) => v + c.offsetMm * a.normal[i]), tolerance)
  near(b.normal, a.normal.map(v => sign * v), 1e-8)
  if (c.orientation.mode === 'rectangle') {
    if (!a.x || !b.x) throw Error('Original rectangle axes required')
    const y: Vec3 = [a.normal[1] * a.x[2] - a.normal[2] * a.x[1], a.normal[2] * a.x[0] - a.normal[0] * a.x[2], a.normal[0] * a.x[1] - a.normal[1] * a.x[0]], q = c.orientation.quarterTurns
    near(b.x, a.x.map((v, i) => [1, 0, -1, 0][q] * v + [0, 1, 0, -1][q] * y[i]), 1e-8)
  }
}

it('places a free circular center at the signed first-normal offset with rank5 and one spin freedom', () => {
  const c = constraint(), p = problem(c), before = structuredClone(p), result = solved(p)
  near(result.poses.get('moving')!.translation, [1, 2, 5]); physical(c, result.poses)
  expect(result.rank).toBe(5); expect(result.localDOF).toBe(1); expect(result.status).toBe('underdefined')
  expect(result.evidence.groups[0]).toMatchObject({ bodyIds: ['moving'], variableCount: 6, rank: 5, localDOF: 1, unanchored: false, rowCount: 6 })
  expect(p).toEqual(before)
})

it('admits two already-satisfied circular spins without inventing a unique roll', () => {
  for (const roll of [0, .7]) {
    const rotation: Quaternion = [0, 0, Math.sin(roll / 2), Math.cos(roll / 2)], p = problem(constraint(), [body('moving', [1, 2, 5], rotation)]), before = structuredClone(p)
    const result = solved(p); physical(p.constraints[0] as ProfileConstraint, result.poses)
    expect(result.rank).toBe(5); expect(result.localDOF).toBe(1)
    near(rotate(result.poses.get('moving')!.rotation, [1, 0, 0]), [Math.cos(roll), Math.sin(roll), 0], 1e-8)
    expect(p).toEqual(before)
  }
})

it('solves the unique off-origin rectangular pose and keeps actual row count separate from rank', () => {
  const c = constraint(true); c.second.profile.center = [2, -1, 4]
  const p = problem(c), before = structuredClone(p), initial = evaluateRigidMates(p)
  expect(initial.diagnostics).toEqual([]); expect(initial.rows.filter(r => r.kind === 'length')).toHaveLength(3)
  expect(initial.rows.filter(r => r.kind === 'angle')).toHaveLength(6)
  const result = solved(p), final = result.poses.get('moving')!
  near(final.translation, [-1, 3, 1]); near(rotate(final.rotation, [1, 0, 0]), [1, 0, 0], 1e-8); near(rotate(final.rotation, [0, 0, 1]), [0, 0, 1], 1e-8)
  physical(c, result.poses); expect(result.rank).toBe(6); expect(result.localDOF).toBe(0); expect(result.status).toBe('fullyDefined')
  expect(result.evidence.groups[0].rowCount).toBe(9); expect(p).toEqual(before)
})

it.each((['aligned', 'opposed'] as const).flatMap(alignment => ([0, 1, 2, 3] as const).map(quarterTurns => ({ alignment, quarterTurns }))))(
  'restores the literal rectangle basis for $alignment quarterTurns=$quarterTurns without changing offset sign', ({ alignment, quarterTurns }) => {
    const c = constraint(true); c.alignment = alignment; c.orientation = { mode: 'rectangle', quarterTurns }
    const p = problem(c), before = structuredClone(p), result = solved(p), b = placed(c.second, result.poses)
    const xs: Vec3[] = [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]]
    near(b.center, [1, 2, 5]); near(b.normal, [0, 0, alignment === 'aligned' ? 1 : -1], 1e-8); near(b.x!, xs[quarterTurns], 1e-8)
    physical(c, result.poses); expect(result.rank).toBe(6); expect(result.localDOF).toBe(0); expect(p).toEqual(before)
  })

it('keeps a negative offset along the first normal even when the second normal is opposed', () => {
  const c = constraint(true); c.offsetMm = -3; c.alignment = 'opposed'
  const result = solved(problem(c)); near(placed(c.second, result.poses).center, [1, 2, 0]); physical(c, result.poses)
})

it.each(['normal', 'rectangle-roll'] as const)('restores the exact antipodal %s start and honors disabled seed/iteration budgets', start => {
  const c = constraint(start === 'rectangle-roll'), rotation: Quaternion = start === 'normal' ? [1, 0, 0, 0] : [0, 0, 1, 0],
    p = problem(c, [body('moving', [1, 2, 5], rotation)]), before = structuredClone(p), result = solved(p)
  physical(c, result.poses); expect(result.evidence.groups[0].seededConstraintIds).toContain(c.id)
  const rejected = solveRigidMates(p, { maxSeedPasses: 0, maxIterations: 0 })
  expect(rejected.poses).toBeNull(); expect(rejected.localDOF).toBeNull(); expect(rejected.evidence.groups[0].seededConstraintIds).toEqual([])
  expect(p).toEqual(before)
})

it('solves a nonzero rotated endpoint frame against literal center and basis coordinates', () => {
  const c = constraint(true); c.first.profile.center = [5, 6, 7]; c.second.profile.center = [2, 3, 4]
  c.second.frame = pose([10, 20, 30], [0, 0, S, S])
  const p = problem(c), before = structuredClone(p), result = solved(p), b = result.poses.get('moving')!
  // Endpoint frame maps C to[7,22,34] and X to+Y. Body Rz-90 maps
  // that C to[22,-7,34], so T[-17,13,-25] gives target[5,6,9].
  near(b.translation, [-17, 13, -25]); near(rotate(b.rotation, [1, 0, 0]), [0, -1, 0], 1e-8)
  near(placed(c.second, result.poses).center, [5, 6, 9]); physical(c, result.poses)
  expect(result.rank).toBe(6); expect(p).toEqual(before)
})

it.each([false, true])('retains common rigid gauge with both original owners moving, rectangle=%s', rectangle => {
  const c = constraint(rectangle); c.first = endpoint('a', profile(rectangle ? 'rectangle' : 'circle'))
  c.second = endpoint('b', profile(rectangle ? 'rectangle' : 'circle'))
  if (rectangle) c.orientation = { mode: 'rectangle', quarterTurns: 1 }
  const p = problem(c, [body('a', [-2, 5, -1]), body('b', [8, 0, 4])]), before = structuredClone(p), result = solved(p)
  physical(c, result.poses); expect(result.rank).toBe(rectangle ? 6 : 5); expect(result.localDOF).toBe(rectangle ? 6 : 7)
  expect(result.evidence.groups[0]).toMatchObject({ bodyIds: ['a', 'b'], variableCount: 12, unanchored: true })
  expect(p).toEqual(before)
})

it('sums repeated-owner blocks and leaves a satisfied self-relation with rank0 and six freedoms', () => {
  const c = constraint(true); c.first = endpoint('same', profile('rectangle')); c.second = endpoint('same', profile('rectangle')); c.offsetMm = 0
  const p = problem(c, [body('same', [3, -2, 5], [.2, -.1, .3, Math.sqrt(.86)])]), before = structuredClone(p), result = solved(p)
  physical(c, result.poses); expect(result.rank).toBe(0); expect(result.localDOF).toBe(6)
  expect(result.evidence.groups[0].bodyIds).toEqual(['same']); expect(result.evidence.groups[0].unanchored).toBe(true)
  near(result.poses.get('same')!.translation, p.bodies[0].pose.translation)
  near(rotate(result.poses.get('same')!.rotation, [1, 0, 0]), rotate(p.bodies[0].pose.rotation, [1, 0, 0]), 1e-10)
  expect(p).toEqual(before)
})

it('moves the first owner against a null second scope and retains the original first-normal sign', () => {
  const c = constraint(); c.first = endpoint('moving'); c.second = endpoint(null, profile('circle', [1, 2, 3]))
  const result = solved(problem(c)); near(result.poses.get('moving')!.translation, [1, 2, 1]); physical(c, result.poses)
  expect(result.rank).toBe(5); expect(result.localDOF).toBe(1); expect(result.evidence.groups[0].unanchored).toBe(false)
})

it.each((['aligned', 'opposed'] as const).flatMap(alignment => ([1, 3] as const).map(quarterTurns => ({ alignment, quarterTurns }))))(
  'solves the first rectangular owner with inverse quarterTurns=$quarterTurns and $alignment normal', ({ alignment, quarterTurns }) => {
    const c = constraint(true); c.first = endpoint('moving', profile('rectangle')); c.second = endpoint(null, profile('rectangle', [1, 2, 3]))
    c.alignment = alignment; c.orientation = { mode: 'rectangle', quarterTurns }
    const p = problem(c), before = structuredClone(p), result = solved(p), first = placed(c.first, result.poses), s = alignment === 'aligned' ? 1 : -1
    // Nfirst=s*Z; Xsecond=X=R(Nfirst,+q*pi/2)Xfirst. Hence
    // Xfirst=-s*Y for q1, +s*Y for q3, and Cfirst=Csecond-2*Nfirst.
    near(first.normal, [0, 0, s], 1e-8); near(first.x!, [0, quarterTurns === 1 ? -s : s, 0], 1e-8)
    near(first.center, [1, 2, 3 - 2 * s]); physical(c, result.poses)
    expect(result.rank).toBe(6); expect(result.localDOF).toBe(0); expect(p).toEqual(before)
  })

it('keeps a named fixed body unchanged while solving the other actual endpoint', () => {
  const c = constraint(); c.first = endpoint('fixed')
  const p = problem(c, [body('fixed', [5, -1, 3], I, true), body()]), before = structuredClone(p), result = solved(p)
  near(result.poses.get('moving')!.translation, [5, -1, 5]); expect(result.poses.get('fixed')).toEqual(p.bodies[0].pose)
  physical(c, result.poses); expect(result.rank).toBe(5); expect(result.localDOF).toBe(1); expect(p).toEqual(before)
})

it('rejects incompatible simultaneous offsets atomically without an old-family conflict certificate', () => {
  const c = constraint(), p = problem(c); p.constraints.push({ ...structuredClone(c), id: 'incompatible-offset', offsetMm: 3 })
  const before = structuredClone(p), result = solveRigidMates(p)
  expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull(); expect(['underdefined', 'fullyDefined']).not.toContain(result.status)
  expect(result.certificates.some(v => v.kind === 'duplicateOffset')).toBe(false); expect(p).toEqual(before)
})

it.each([{ rectangle: false, count: 42, admitted: true }, { rectangle: false, count: 43, admitted: false },
  { rectangle: true, count: 28, admitted: true }, { rectangle: true, count: 29, admitted: false }])(
  'keeps the256-row ceiling with $count original constraints, rectangle=$rectangle', ({ rectangle, count, admitted }) => {
    const c = constraint(rectangle), p = problem(c, [body('moving', [1, 2, 5])])
    p.constraints = Array.from({ length: count }, (_, i) => ({ ...structuredClone(c), id: 'original-profile-' + i }))
    const before = structuredClone(p), result = solveRigidMates(p)
    if (admitted) {
      expect(result.poses).not.toBeNull(); expect(result.rank).toBe(rectangle ? 6 : 5)
      expect(result.evidence.groups[0].rowCount).toBe(252)
    } else { expect(result.status).toBe('capacityLimit'); expect(result.poses).toBeNull() }
    expect(p).toEqual(before)
  })

it.each(['position', 'normal', 'rectangle-x'] as const)('rejects explicit %s uncertainty rather than widening requested bands', kind => {
  const c = constraint(kind === 'rectangle-x'), p = problem(c, [body('moving', [1, 2, 5])])
  if (kind === 'position') c.second.profile.positionErrorMm = 1e-5
  else if (kind === 'normal') c.second.profile.normalErrorRad = 1e-7
  else { if (c.second.profile.kind !== 'rectangle') throw Error('Original rectangle required'); c.second.profile.xDirectionErrorRad = 1e-7 }
  const before = structuredClone(p), result = solveRigidMates(p)
  expect(result.status).toBe('precisionLimit'); expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull()
  expect(p.lengthTolerance).toBe(1e-6); expect(p.angleTolerance).toBe(1e-8); expect(p).toEqual(before)
})

it('permits a free mixed mathematical pair without claiming native profile compatibility', () => {
  const c = constraint(); c.first.profile = profile('rectangle', [1, 2, 3])
  const p = problem(c), result = solved(p); physical(c, result.poses)
  expect(result.rank).toBe(5); expect(result.localDOF).toBe(1); expect(result.evidence.groups[0].rowCount).toBe(6)
})

it('rejects malformed mandatory errors, rectangle branches and old-purpose endpoints without mutating input', () => {
  const mutations: ((c: Record<string, unknown>) => void)[] = [
    c => { delete ((c.second as ProfileEndpoint).profile as unknown as Record<string, unknown>).positionErrorMm },
    c => { (c.second as ProfileEndpoint).profile.normalErrorRad = NaN },
    c => { (c.second as ProfileEndpoint).profile.positionErrorMm = -1 },
    c => { c.orientation = { mode: 'rectangle', quarterTurns: 4 } },
    c => { c.orientation = { mode: 'rectangle', quarterTurns: 0 } },
    c => { c.first = { bodyId: null, frame: pose(), support: { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 } } },
  ]
  for (const mutate of mutations) {
    const p = problem(); mutate(p.constraints[0] as unknown as Record<string, unknown>)
    const before = structuredClone(p), result = solveRigidMates(p)
    expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull(); expect(p).toEqual(before)
  }
})

it.each(['id', 'type'] as const)('rejects an executable constraint %s before dispatch without reading it', field => {
  const p = problem(), bodiesBefore = structuredClone(p.bodies)
  let reads = 0
  Object.defineProperty(p.constraints[0], field, { enumerable: true, get() { reads++; return field === 'id' ? 'executable-id' : 'profile-center' } })
  const before = Object.getOwnPropertyDescriptor(p.constraints[0], field), result = solveRigidMates(p)
  expect(reads).toBe(0); expect(result.status).toBe('invalidInput'); expect(result.poses).toBeNull(); expect(result.localDOF).toBeNull()
  expect(Object.getOwnPropertyDescriptor(p.constraints[0], field)).toEqual(before); expect(p.bodies).toEqual(bodiesBefore)
})
