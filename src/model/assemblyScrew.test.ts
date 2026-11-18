import { requireBinaryAssemblyMate as binaryMate } from './assemblyBinaryFixtures.test-utils'
import { expect, it } from 'vitest'
import { assemblyScrewAdvance, admitRigidScrewStep, deriveRigidScrewAngles, rebaseRigidScrewAngles,
  rigidScrewCoordinates, validateAssemblyScrewData, type AssemblyScrewData } from './assemblyScrew'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { retractRigidBodyPose } from './assemblyKinematics'
import { composeRigidPoses, identityRigidPose, type Quaternion, type RigidPose } from './rigidPose'
import type { RigidBinaryMateConstraint as RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport, RigidScrewConstraint } from './assemblySolveTypes'
type BinaryMateProblem = Omit<RigidMateProblem, 'constraints'> & { constraints: RigidMateConstraint[] }
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyAxisReference, type AssemblyDocument } from './assemblyDocument'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { applyAssemblyEdit } from './assemblyEditing'

// Original Cartesian shafts and independent pitch/trigonometric expectations.
// Pure numeric supports and declaration fixtures supply no native CAD authority.
const TAU = 2 * Math.PI, I: Quaternion = [0, 0, 0, 1]
const z = (angle: number): Quaternion => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]
const x = (angle: number): Quaternion => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)]
const pose = (angle = 0, travel = 0): RigidPose => ({ translation: [0, 0, travel], rotation: z(angle) })
const cylinder: RigidMateSupport = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 0 }
const plane: RigidMateSupport = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 }
function data(): AssemblyScrewData { return { lead: 4, reverse: false, alignment: 'aligned', neutralRotation: [...I], angle: 0, neutralTravel: 0 } }
function end(bodyId: string | null, support: RigidMateSupport = cylinder): RigidMateEndpoint { return { bodyId, frame: identityRigidPose(), support: structuredClone(support) } }
function screw(): RigidScrewConstraint { return { id: 'screw', type: 'screw', first: end('first'), second: end('second'), ...data() } }
function problem(constraint = screw(), firstFixed = false, secondFixed = true): BinaryMateProblem {
  return { bodies: [{ id: 'first', pose: pose(), fixed: firstFixed }, { id: 'second', pose: pose(), fixed: secondFixed }],
    constraints: [constraint], origin: [0, 0, 0], lengthScale: 1, lengthTolerance: 1e-9, angleTolerance: 1e-8 }
}
function near(value: number, expected: number, tolerance = 1e-8): void { expect(Math.abs(value - expected)).toBeLessThanOrEqual(tolerance) }
function lock(angle: number): RigidMateConstraint { return { id: 'rotation-driver', type: 'concentric', first: end('first'), second: end(null), alignment: 'aligned', rotationLock: z(-angle) } }
function distance(travel: number): RigidMateConstraint { return { id: 'axial-driver', type: 'distance', first: end('first', plane), second: end(null, plane), alignment: 'aligned', distance: travel } }

it('keeps positive mm-per-turn lead separate from handedness and returns detached captured state', () => {
  const source = data(), result = validateAssemblyScrewData(source)
  near(assemblyScrewAdvance(4, false) * TAU, 4); near(assemblyScrewAdvance(4, true) * TAU, -4)
  result.neutralRotation[0] = 99; expect(source.neutralRotation).toEqual(I)
})
it.each([0, -1, Infinity, NaN, Number.MIN_VALUE])('rejects invalid or unrepresentable lead %s', lead => {
  expect(() => validateAssemblyScrewData({ ...data(), lead })).toThrow()
})
it.each([
  { label: 'inherited data', change: () => Object.assign(Object.create({}), data()) },
  { label: 'unknown field', change: () => ({ ...data(), phase: 0 }) },
  { label: 'missing field', change: () => { const { angle: _angle, ...rest } = data(); return rest } },
  { label: 'numeric reverse', change: () => ({ ...data(), reverse: 1 }) },
  { label: 'unknown alignment', change: () => ({ ...data(), alignment: 'automatic' }) },
  { label: 'nonfinite lift', change: () => ({ ...data(), angle: Infinity }) },
  { label: 'nonfinite origin', change: () => ({ ...data(), neutralTravel: NaN }) },
  { label: 'bad quaternion', change: () => ({ ...data(), neutralRotation: [0, 0, 0, 2] }) },
])('rejects $label without coercion', ({ change }) => { expect(() => validateAssemblyScrewData(change())).toThrow() })
it('does not invoke getters while validating screw fields', () => {
  const source = data(); let reads = 0
  Object.defineProperty(source, 'angle', { enumerable: true, get() { reads++; return 0 } })
  expect(() => validateAssemblyScrewData(source)).toThrow('executable'); expect(reads).toBe(0)
})
it.each([{ reverse: false, direction: 1 }, { reverse: true, direction: -1 }])(
  'couples a quarter turn to independently calculated axial travel with reverse=$reverse', ({ reverse, direction }) => {
    const c = screw(); c.reverse = reverse
    const input = problem(c); input.bodies[0].pose = pose(Math.PI / 2, -direction)
    const value = evaluateRigidMates(input)
    expect(value.diagnostics).toEqual([]); expect(value.rows).toHaveLength(7); expect(value.checks[0].satisfied).toBe(true)
    near(value.screwAngles.get('screw')!, Math.PI / 2); near(value.rows[6].residual, 0, 1e-12)
  })
it.each([1, -1])('uses first native-axis sign %s for both relative twist and travel', sign => {
  const c = screw(); c.first.support = { ...cylinder, axis: [0, 0, sign] }; c.alignment = sign === 1 ? 'aligned' : 'opposed'
  const input = problem(c); input.bodies[0].pose = pose(Math.PI / 2, -1)
  const value = evaluateRigidMates(input)
  expect(value.diagnostics).toEqual([]); expect(value.checks[0].satisfied).toBe(true)
  near(value.screwAngles.get('screw')!, sign * Math.PI / 2)
})
it('retains opposed second axes without changing the first-axis handedness', () => {
  const c = screw(); c.second.support = { ...cylinder, axis: [0, 0, -1] }; c.alignment = 'opposed'
  const input = problem(c); input.bodies[0].pose = pose(Math.PI / 2, -1)
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); expect(value.checks[0].satisfied).toBe(true)
  near(value.screwAngles.get('screw')!, Math.PI / 2)
})
it('measures actual relative increments from nonzero captured spins and axial origin', () => {
  const c = screw(); c.neutralRotation = z(.5 - .24); c.neutralTravel = 4
  const input = problem(c); input.bodies[0].pose = pose(.5 + Math.PI / 2, 2); input.bodies[1].pose = pose(.24, 7)
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); expect(value.checks[0].satisfied).toBe(true)
  near(value.screwAngles.get('screw')!, Math.PI / 2); near(value.rows[6].residual, 0, 1e-12)
})
it('measures component-origin travel independently of axial cylinder parametrization', () => {
  const c = screw(), input = problem(c); input.bodies[0].pose = pose(.3, -.7)
  const poses = new Map(input.bodies.map(body => [body.id, body.pose])), before = rigidScrewCoordinates(c, poses, input.angleTolerance)
  c.first.support!.point = [0, 0, 137]; c.second.support!.point = [0, 0, -293]
  const after = rigidScrewCoordinates(c, poses, input.angleTolerance)
  near(before.travel, .7); near(after.travel, .7); near(after.angle, .3)
  near(evaluateRigidMates(input).rows[6].residual, .7 - 4 * .3 / TAU, 1e-12)
})
it('conditions component origins before adding nested frame offsets in a distant common frame', () => {
  const c = screw(), input = problem(c), center: [number, number, number] = [1e16, -1e16, 1e16]
  input.bodies.forEach(body => { body.pose.translation = [...center] }); input.origin = [...center]
  c.first.frame.translation = [0, 0, .25]; c.second.frame.translation = [0, 0, 1.25]; c.neutralTravel = 1
  const poses = new Map(input.bodies.map(body => [body.id, body.pose]))
  near(rigidScrewCoordinates(c, poses, input.angleTolerance, input).travel, 1)
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); near(value.rows[6].residual, 0)
})
it('has five independent relative constraints and one remaining helical degree of freedom', () => {
  const value = solveRigidMates(problem())
  expect(value.status).toBe('underdefined'); expect(value.rank).toBe(5); expect(value.localDOF).toBe(1)
  expect(value.evidence.groups[0].rowCount).toBe(7); expect(value.screwAngles.get('screw')).toBe(0)
})
it('retains six common rigid degrees plus one relative helical degree when both components move', () => {
  const value = solveRigidMates(problem(screw(), false, false))
  expect(value.status).toBe('underdefined'); expect(value.rank).toBe(5); expect(value.localDOF).toBe(7)
  expect(value.evidence.groups[0].unanchored).toBe(true)
})
it.each([false, true])('solves rotation-driven travel with reverse=%s without adding an axial stop', reverse => {
  const c = screw(); c.reverse = reverse
  const input = problem(c); input.constraints.push(lock(Math.PI / 2))
  const before = structuredClone(input), value = solveRigidMates(input)
  expect(value.poses).not.toBeNull(); expect(value.localDOF).toBe(0); expect(input).toEqual(before)
  near(value.screwAngles.get('screw')!, Math.PI / 2, 2e-8)
  near(value.poses!.get('first')!.translation[2], reverse ? 1 : -1, 2e-9)
})
it.each([1, -1])('solves translation-driven %s×two complete relative turns with accepted lifted state', sign => {
  const input = problem(); input.constraints.push(distance(-sign * 8))
  const value = solveRigidMates(input)
  expect(value.poses).not.toBeNull(); expect(value.localDOF).toBe(0)
  near(value.screwAngles.get('screw')!, sign * 4 * Math.PI, 5e-9)
  near(value.poses!.get('first')!.translation[2], -sign * 8, 2e-9)
  near(Math.abs(value.poses!.get('first')!.rotation[3]), 1, 2e-10)
})
it('differentiates all seven rows at noncommuting component frames against central differences', () => {
  const c = screw(), input = problem(c, false, false); input.origin = [5, -3, 7]; input.lengthScale = 9
  input.bodies[0].pose = { translation: [6, -2, 8], rotation: z(.4) }; input.bodies[1].pose = { translation: [4, -3, 9], rotation: x(.21) }
  c.first.frame = { translation: [.2, -.3, .4], rotation: x(-.17) }; c.second.frame = { translation: [-.2, .1, -.3], rotation: z(.19) }
  c.neutralRotation = x(.11); c.neutralTravel = .7
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); expect(value.rows).toHaveLength(7)
  for (const h of [2e-6, 7e-7]) for (let column = 0; column < 12; column++) {
    const owner = input.bodies[Math.floor(column / 6)], delta = Array(6).fill(0) as number[]; delta[column % 6] = h
    const plus = evaluateRigidMates(input, new Map([[owner.id, retractRigidBodyPose(owner.pose, delta, input.origin, input.lengthScale)]]))
    delta[column % 6] = -h
    const minus = evaluateRigidMates(input, new Map([[owner.id, retractRigidBodyPose(owner.pose, delta, input.origin, input.lengthScale)]]))
    expect(plus.diagnostics).toEqual([]); expect(minus.diagnostics).toEqual([])
    value.rows.forEach((row, index) => near(row.jacobian[column], (plus.rows[index].residual - minus.rows[index].residual) / (2 * h), 2e-7))
  }
})
it('preserves residuals and all six gauge directions under a common noncommuting rigid motion', () => {
  const input = problem(screw(), false, false); input.bodies[0].pose = pose(.3, -.4); input.bodies[1].pose = pose(-.2, .7)
  const base = evaluateRigidMates(input); expect(base.diagnostics).toEqual([])
  for (const row of base.rows) for (let coordinate = 0; coordinate < 6; coordinate++) near(row.jacobian[coordinate] + row.jacobian[coordinate + 6], 0, 1e-12)
  const common: RigidPose = { translation: [19, -7, 23], rotation: x(.71) }
  const poses = new Map(input.bodies.map(body => [body.id, composeRigidPoses(common, body.pose)])), changed = evaluateRigidMates(input, poses)
  expect(changed.diagnostics).toEqual([]); base.rows.forEach((row, index) => near(changed.rows[index].residual, row.residual, 2e-12))
})
it('rolls back poses and angular publication after an exhausted solve', () => {
  const input = problem(); input.constraints.push(distance(-8)); const before = structuredClone(input), value = solveRigidMates(input, { maxIterations: 0 })
  expect(value.poses).toBeNull(); expect(value.screwAngles.size).toBe(0); expect(input).toEqual(before)
})
it('tracks a suppressed screw across complete turns without rows or phase enforcement and restores its original pitch on reactivation', () => {
  let input: RigidMateProblem = problem(); const c = screw(); input.constraints = []; input.passiveScrews = [c]
  for (let index = 1; index <= 3; index++) {
    input.constraints = [lock(index * TAU / 3)]
    const value = solveRigidMates(input); expect(value.poses).not.toBeNull(); near(value.screwAngles.get('screw')!, index * TAU / 3, 3e-8)
    expect(value.evidence.groups.flatMap(group => group.constraintIds)).not.toContain('screw')
    input = rebaseRigidScrewAngles({ ...input, bodies: input.bodies.map(body => ({ ...body, pose: value.poses!.get(body.id)! })) }, value.screwAngles)
  }
  const tracked = input.passiveScrews![0]; input.passiveScrews = undefined; input.constraints.push(tracked)
  const restored = solveRigidMates(input); expect(restored.poses).not.toBeNull(); near(restored.screwAngles.get('screw')!, TAU, 3e-8)
  near(restored.poses!.get('first')!.translation[2], -4, 3e-8)
})
it('rejects unsafe passive charts and never seeds through a singular or half-turn branch', () => {
  const input = problem(); input.constraints = []; input.passiveScrews = [screw()]
  const poses = new Map(input.bodies.map(body => [body.id, body.pose]))
  expect(admitRigidScrewStep(input, poses, new Map([['first', 2]]))).toBe(false)
  input.bodies[0].pose.rotation = x(Math.PI)
  const failed = solveRigidMates(input); expect(failed.poses).toBeNull(); expect(failed.screwAngles.size).toBe(0)
  input.bodies[0].pose.rotation = z(Math.PI)
  expect(solveRigidMates(input).poses).toBeNull()
})
it('keeps passive tracking equation-free while publishing only the actual measured lift', () => {
  const input = problem(); input.constraints = []; input.passiveScrews = [screw()]; input.bodies[0].pose = pose(.5, 37)
  const value = evaluateRigidMates(input)
  expect(value.rows).toEqual([]); expect(value.checks).toEqual([]); near(value.screwAngles.get('screw')!, .5)
  expect(deriveRigidScrewAngles(input, new Map(input.bodies.map(body => [body.id, body.pose])))).toEqual(value.screwAngles)
})
it('tracks suppressed relative spin across independently solved owner groups without adding hard incidence', () => {
  const input = problem(screw(), false, false), first = lock(TAU / 3), second = lock(-TAU / 3)
  second.id = 'second-rotation-driver'; second.first = end('second')
  input.constraints = [first, second]; input.passiveScrews = [screw()]
  const value = solveRigidMates(input); expect(value.poses).not.toBeNull(); expect(value.evidence.groups).toHaveLength(2)
  expect(value.evidence.groups.flatMap(group => group.constraintIds)).not.toContain('screw')
  near(value.screwAngles.get('screw')!, 2 * TAU / 3, 3e-8)
  const evaluated = evaluateRigidMates(rebaseRigidScrewAngles(input, value.screwAngles), value.poses!)
  expect(evaluated.rows).toHaveLength(18); expect(evaluated.checks).toHaveLength(2)
})
it('projects a rotational objective along the actual helical degree and carries its accepted screw state', () => {
  const input = problem(), before = structuredClone(input)
  const value = projectRigidMateTarget(input, { bodyId: 'first', frame: identityRigidPose(), targetPose: pose(Math.PI / 2), mode: 'rotate' })
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  near(value.result.screwAngles.get('screw')!, Math.PI / 2, 3e-8)
  near(value.result.poses!.get('first')!.translation[2], -1, 3e-8); expect(input).toEqual(before)
})
it.each(['angle magnitude', 'travel magnitude', 'normalized lead'] as const)('rejects unrepresentable %s with no angular publication', kind => {
  const c = screw(), input = problem(c)
  if (kind === 'angle magnitude') c.angle = 1e20
  else if (kind === 'travel magnitude') c.neutralTravel = 1e308
  else { c.lead = 1e-300; input.lengthScale = 1e300 }
  const value = solveRigidMates(input); expect(value.poses).toBeNull(); expect(value.screwAngles.size).toBe(0)
})

const stamp = '2026-10-16T00:00:00.000Z', definition = { id: 'original-shaft', revision: 'r1' }
function axis(id: string): AssemblyAxisReference { return { kind: 'face', component: { occurrencePath: [id], definition: { ...definition } },
  body: { bodyId: 'shaft-body', sourceFeatureId: 'shaft' }, face: { sourceFeatureId: 'shaft', key: 'face-v1|original-unattested-axis' }, support: 'axis' } }
function document(): AssemblyDocument { return { version: 2, kind: 'assembly', units: 'mm', id: 'original-screw-root', revision: 'a1', name: 'Original screw declarations',
  createdAt: stamp, updatedAt: stamp, definitions: [{ kind: 'part', ...definition, document: { version: 1, id: definition.id, name: 'Original shaft declaration', units: 'mm',
    features: [{ id: 'profile', name: 'Original circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
      { id: 'shaft', name: 'Original shaft', type: 'extrude', sketchId: 'profile', depth: 6, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'shaft-body' } }], createdAt: stamp, updatedAt: stamp } }],
  occurrences: ['first', 'second'].map(id => ({ id, name: id, definition: { ...definition }, pose: pose(), fixed: false, visible: true, suppressed: false })),
  mates: [{ id: 'screw', name: 'Original screw', type: 'screw', suppressed: false, first: axis('first'), second: axis('second'), ...data() }] } }
it('round-trips screw state and exact endpoint identities in v2 without requiring screw fields in older documents', () => {
  const input = document(), c = binaryMate(input.mates[0])
  if (c.type !== 'screw') throw new Error('Original screw missing')
  c.angle = 3 * TAU + .25; c.neutralTravel = -17
  expect(parseAssemblyDocument(serializeAssemblyDocument(input))).toEqual(input)
  const old = structuredClone(input); old.mates = []; expect(parseAssemblyDocument(serializeAssemblyDocument(old))).toEqual(old)
})
it('inspects suppression and exact stale revisions without retargeting equal names', () => {
  const input = document(); input.occurrences[0].suppressed = true; input.occurrences[1].name = input.occurrences[0].name
  const c = binaryMate(input.mates[0])
  if (c.type !== 'screw') throw new Error('Original screw missing')
  c.first.component.definition.revision = 'stale'
  const inspected = inspectAssemblyMateReferences(input)[0]
  expect(inspected.first.diagnostics.map(value => value.code)).toEqual(['STALE_DEFINITION', 'SUPPRESSED_COMPONENT'])
  expect(inspected.nativeVerificationRequired).toBe(true)
})
it('rejects non-axis screw references and preserves generic edits as detached intent', () => {
  const input = document(), c = binaryMate(input.mates[0])
  if (c.type !== 'screw') throw new Error('Original screw missing')
  const bad = structuredClone(input); (binaryMate(bad.mates[0]).first as AssemblyAxisReference).support = 'plane' as 'axis'
  expect(() => validateAssemblyDocument(bad)).toThrow('eje')
  const { id, ...mate } = c, changed = applyAssemblyEdit(input, { type: 'update-mate', mateId: id, mate: { ...mate, lead: 7, reverse: true } })
  expect(changed.mates[0]).toMatchObject({ id, type: 'screw', lead: 7, reverse: true, angle: 0, neutralTravel: 0 }); expect(c.lead).toBe(4)
})
