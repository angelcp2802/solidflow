import { requireBinaryAssemblyMate as binaryMate } from './assemblyBinaryFixtures.test-utils'
import { expect, it } from 'vitest'
import type { Vec3 } from '../cad/kernel.types'
import { admitRigidRackPinionStep, assemblyRackPinionAdvance, assemblyRackPinionAxisPoint, assemblyRackPinionConversion,
  canonicalAssemblyRackDirection, deriveRigidRackPinionAngles, rebaseRigidRackPinionAngles, rigidRackPinionCoordinates,
  validateAssemblyRackPinionData, type AssemblyRackPinionData } from './assemblyRackPinion'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { retractRigidBodyPose, rotationExp } from './assemblyKinematics'
import { composeRigidPoses, identityRigidPose, type Quaternion, type RigidPose } from './rigidPose'
import type { RigidGearConstraint, RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport, RigidRackPinionConstraint, RigidScrewConstraint } from './assemblySolveTypes'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyAxisReference, type AssemblyDocument, type AssemblyEdgeReference } from './assemblyDocument'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { applyAssemblyEdit } from './assemblyEditing'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'

// Original Cartesian mechanism: an axially stopped Z rotor and an X slider.
// Expectations use independent circumference/trigonometry, not native fixtures
// or saved solver outputs. Numeric supports carry no native CAD authority.
const TAU = 2 * Math.PI, I: Quaternion = [0, 0, 0, 1]
const z = (angle: number): Quaternion => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]
const pose = (angle = 0, translation: Vec3 = [0, 0, 0]): RigidPose => ({ translation, rotation: z(angle) })
const cylinder: RigidMateSupport = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 0 }
const line: RigidMateSupport = { kind: 'line', point: [7, -9, 3], axis: [1, 0, 0], tolerance: 0 }
const xCylinder: RigidMateSupport = { kind: 'cylinder', point: [0, 0, 0], axis: [1, 0, 0], xDirection: [0, 1, 0], radius: 1, tolerance: 0 }
const plane: RigidMateSupport = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 }
function data(): AssemblyRackPinionData { return { conversion: { mode: 'diameter', override: null }, reverse: false, neutralRotation: [...I], angle: 0, neutralTravel: 0 } }
function end(bodyId: string | null, support: RigidMateSupport = cylinder): RigidMateEndpoint { return { bodyId, frame: identityRigidPose(), support: structuredClone(support) } }
function rackPinion(): RigidRackPinionConstraint { return { id: 'rack-pinion', type: 'rack-pinion', first: end('pinion'), second: end('rack', line), ...data() } }
function problem(c = rackPinion()): RigidMateProblem { return { bodies: [{ id: 'pinion', pose: pose(), fixed: false }, { id: 'rack', pose: pose(), fixed: false }],
  constraints: [c], origin: [0, 0, 0], lengthScale: 1, lengthTolerance: 1e-9, angleTolerance: 1e-8 } }
function near(actual: number, expected: number, tolerance = 1e-8): void { expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance) }
function bearing(bodyId: string, rotationLock: Quaternion | null = null, support: RigidMateSupport = cylinder): RigidMateConstraint {
  return { id: bodyId + '-bearing', type: 'concentric', first: end(bodyId, support), second: end(null, support), alignment: 'aligned', rotationLock }
}
function stop(bodyId: string): RigidMateConstraint { return { id: bodyId + '-stop', type: 'distance', first: end(bodyId, plane), second: end(null, plane), alignment: 'aligned', distance: 0 } }
function guided(c = rackPinion()): RigidMateProblem { const input = problem(c); input.constraints = [bearing('pinion'), stop('pinion'), bearing('rack', I, xCylinder), c]; return input }
function drive(bodyId: string, target: RigidPose): RigidMateConstraint { return { id: bodyId + '-driver', type: 'lock',
  first: { bodyId: null, frame: target }, second: { bodyId, frame: identityRigidPose() }, relativePose: identityRigidPose() } }

it('uses fresh native diameter by default and independently converts explicit diameter or travel', () => {
  for (const mode of ['diameter', 'travel'] as const) {
    expect(assemblyRackPinionConversion({ mode, override: null }, 2)).toEqual({ diameter: 4, distancePerTurn: 4 * Math.PI, advance: 2 })
    near(assemblyRackPinionAdvance({ mode, override: null }, true, 2), -2)
  }
  near(assemblyRackPinionAdvance({ mode: 'diameter', override: 6 }, false, 2), 3)
  near(assemblyRackPinionAdvance({ mode: 'travel', override: 6 * Math.PI }, false, 2), 3)
  const source = data(), checked = validateAssemblyRackPinionData(source)
  checked.conversion.override = 10; checked.neutralRotation[0] = 99
  expect(source.conversion.override).toBeNull(); expect(source.neutralRotation).toEqual(I)
})
it.each([
  { mode: 'diameter', override: 0 }, { mode: 'travel', override: -1 }, { mode: 'diameter', override: Infinity },
  { mode: 'travel', override: NaN }, { mode: 'travel', override: Number.MIN_VALUE }, { mode: 'diameter', override: Number.MIN_VALUE },
  { mode: 'diameter', override: Number.MAX_VALUE }, { mode: 'unknown', override: null },
])('rejects malformed or unrepresentable conversion $mode/$override', conversion => {
  expect(() => validateAssemblyRackPinionData({ ...data(), conversion })).toThrow()
})
it.each([0, -1, Infinity, NaN, Number.MAX_VALUE])('rejects unusable native default radius %s', radius => {
  expect(() => assemblyRackPinionConversion(data().conversion, radius)).toThrow()
})
it.each([
  { label: 'inherited fields', change: () => Object.assign(Object.create({}), data()) },
  { label: 'unknown field', change: () => ({ ...data(), carrier: null }) },
  { label: 'missing lifted angle', change: () => { const { angle: _angle, ...rest } = data(); return rest } },
  { label: 'numeric reverse', change: () => ({ ...data(), reverse: 1 }) },
  { label: 'nonfinite angle', change: () => ({ ...data(), angle: Infinity }) },
  { label: 'nonfinite neutral', change: () => ({ ...data(), neutralTravel: NaN }) },
  { label: 'invalid quaternion', change: () => ({ ...data(), neutralRotation: [0, 0, 0, 2] }) },
])('rejects $label as data without coercion', ({ change }) => { expect(() => validateAssemblyRackPinionData(change())).toThrow() })
it('does not invoke accessors in data, nested conversion or direction coordinates', () => {
  let reads = 0
  const source = data(); Object.defineProperty(source.conversion, 'override', { enumerable: true, get() { reads++; return null } })
  expect(() => validateAssemblyRackPinionData(source)).toThrow('executable')
  const axis: Vec3 = [1, 0, 0]; Object.defineProperty(axis, '0', { enumerable: true, get() { reads++; return 1 } })
  expect(() => canonicalAssemblyRackDirection(axis)).toThrow('data'); expect(reads).toBe(0)
})
it('canonicalizes an undirected rack axis without dropping its small components', () => {
  const first: Vec3 = [1e-14, -1, 2e-15], reversed = first.map(value => -value) as Vec3
  const direction = canonicalAssemblyRackDirection(first)
  expect(direction).toEqual(canonicalAssemblyRackDirection(reversed)); expect(direction[0]).toBeLessThan(0); expect(direction[2]).toBeLessThan(0)
  near(direction[1], 1, 1e-15)
  expect(canonicalAssemblyRackDirection([2, 0, 0])).toEqual([1, 0, 0])
  const before = canonicalAssemblyRackDirection([2e-12, -1, 0]), after = canonicalAssemblyRackDirection([-2e-12, -1, 0])
  expect(before[1]).toBeLessThan(0); expect(after[1]).toBeGreaterThan(0)
})
it.each([{ reverse: false, sign: 1 }, { reverse: true, sign: -1 }])('couples a quarter turn to native-radius travel with reverse=$reverse', ({ reverse, sign }) => {
  const c = rackPinion(); c.reverse = reverse
  const input = problem(c); input.bodies[0].pose = pose(Math.PI / 2); input.bodies[1].pose.translation[0] = sign * Math.PI
  const value = evaluateRigidMates(input)
  expect(value.diagnostics).toEqual([]); expect(value.rows).toHaveLength(1); expect(value.checks[0].satisfied).toBe(true)
  near(value.rackPinionAngles.get(c.id)!, Math.PI / 2); near(value.rows[0].residual, 0, 1e-12)
})
it.each([1, -1])('retains native pinion-axis sign %s while canonicalizing either rack line direction', sign => {
  const c = rackPinion(); c.first.support = { ...cylinder, axis: [0, 0, sign] }; c.second.support = { ...line, axis: [-1, 0, 0] }
  const input = problem(c); input.bodies[0].pose = pose(Math.PI / 2); input.bodies[1].pose.translation[0] = sign * Math.PI
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); near(value.rackPinionAngles.get(c.id)!, sign * Math.PI / 2); near(value.rows[0].residual, 0, 1e-12)
})
it('uses a cylinder axis as a rack direction without inferring axis placement or perpendicularity', () => {
  const c = rackPinion(); c.second.support = { ...cylinder, axis: [0, 0, -1] }
  const input = problem(c); input.bodies[0].pose = pose(Math.PI / 2); input.bodies[1].pose.translation[2] = Math.PI
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); expect(value.rows).toHaveLength(1); near(value.rows[0].residual, 0, 1e-12)
})
it('measures relative rotation from a nonzero authenticated neutral orientation', () => {
  const c = rackPinion(); c.neutralRotation = z(.5 - .24)
  const input = problem(c); input.bodies[0].pose = pose(.5 + Math.PI / 2); input.bodies[1].pose = pose(.24)
  // Rack direction is its rotated local X. Dotting this translation with it gives pi.
  input.bodies[1].pose.translation = [Math.PI * Math.cos(.24), Math.PI * Math.sin(.24), 0]
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); near(value.rackPinionAngles.get(c.id)!, Math.PI / 2); near(value.rows[0].residual, 0, 1e-12)
})
it('keeps an eccentric pinion axis stationary while its component origin orbits', () => {
  const c = rackPinion(); c.first.support = { ...cylinder, point: [2, 0, 99] }; c.neutralTravel = 10
  const input = problem(c), angle = Math.PI / 3
  input.bodies[0].pose = pose(angle, [-1, -Math.sqrt(3), 0]); input.bodies[1].pose.translation[0] = 10 + 2 * Math.PI / 3
  const value = evaluateRigidMates(input), coordinate = rigidRackPinionCoordinates(c, new Map(input.bodies.map(body => [body.id, body.pose])), input.angleTolerance)
  expect(value.diagnostics).toEqual([]); near(value.rows[0].residual, 0, 1e-12); near(coordinate.travel, 10 + 2 * Math.PI / 3)
  // Using the orbiting origin would spuriously add one millimeter to travel here.
  near(input.bodies[1].pose.translation[0] - input.bodies[0].pose.translation[0] - coordinate.travel, 1, 1e-12)
})
it('ignores cylinder axial parameter origins and rack line parameter points', () => {
  const c = rackPinion(); c.first.support = { ...cylinder, point: [2, -3, 5] }
  const input = problem(c); input.bodies[1].pose.translation = [7, 8, 9]
  const baseline = evaluateRigidMates(input).rows[0].residual
  c.first.support = { ...cylinder, point: [2, -3, 1e6] }; c.second.support = { ...line, point: [1e5, -2e5, 3e5], axis: [-1, 0, 0] }
  near(evaluateRigidMates(input).rows[0].residual, baseline, 1e-12)
  expect(assemblyRackPinionAxisPoint([2, -3, 1e6], [0, 0, -1])).toEqual([2, -3, 0])
})
it('does not compose an irrelevant large rack parameter point into a world position', () => {
  const c = rackPinion(); c.second.support = { ...line, point: [1e308, 1e308, 1e308] }
  const input = problem(c); input.bodies[1].pose.rotation = rotationExp([0, 0, Math.PI / 4])
  const value = evaluateRigidMates(input); expect(value.diagnostics).toEqual([]); expect(Number.isFinite(value.rows[0].residual)).toBe(true)
})
it('preserves an oblique pinion axis under a representable axial parameter shift', () => {
  const c = rackPinion(), s = Math.SQRT1_2
  c.first.support = { ...cylinder, axis: [s, s, 0], xDirection: [0, 0, 1], point: [2, -2, 3] }
  const input = problem(c); input.bodies[1].pose.translation = [7, 8, 9]
  const before = evaluateRigidMates(input); expect(before.diagnostics).toEqual([]); near(before.rows[0].residual, 5, 1e-12)
  c.first.support = { ...c.first.support, point: [2 + 100 * s, -2 + 100 * s, 3] }
  const after = evaluateRigidMates(input); expect(after.diagnostics).toEqual([]); near(after.rows[0].residual, 5, 1e-12)
})
it('rejects an oblique axis projection whose parameter origin loses the requested length precision', () => {
  const c = rackPinion(), s = Math.SQRT1_2
  c.first.support = { ...cylinder, axis: [s, s, 0], xDirection: [0, 0, 1], point: [1e16, 1e16, 3] }
  const value = solveRigidMates(problem(c)); expect(value.poses).toBeNull(); expect(value.rackPinionAngles.size).toBe(0)
  expect(value.status).toBe('precisionLimit')
})
it('conditions local frame and axis offsets before adding a distant common translation', () => {
  const c = rackPinion(); c.first.frame.translation = [.25, 0, 0]; c.first.support = { ...cylinder, point: [.5, 0, 4] }
  c.second.frame.translation = [1.75, 0, 0]; c.neutralTravel = 1
  const input = problem(c); input.origin = [1e16, -1e16, 1e16]
  for (const body of input.bodies) body.pose.translation = [...input.origin]
  const value = evaluateRigidMates(input), measured = rigidRackPinionCoordinates(c, new Map(input.bodies.map(body => [body.id, body.pose])), input.angleTolerance, input)
  expect(value.diagnostics).toEqual([]); near(value.rows[0].residual, 0, 1e-12); near(measured.travel, 1, 1e-12)
})
it('derives default travel from each current radius while explicit conversion remains unchanged', () => {
  const c = rackPinion(), input = problem(c); input.bodies[0].pose = pose(Math.PI / 2); input.bodies[1].pose.translation[0] = Math.PI
  near(evaluateRigidMates(input).rows[0].residual, 0, 1e-12)
  c.first.support = { ...cylinder, radius: 3 }; near(evaluateRigidMates(input).rows[0].residual, -Math.PI / 2, 1e-12)
  c.conversion = { mode: 'diameter', override: 4 }; near(evaluateRigidMates(input).rows[0].residual, 0, 1e-12)
  c.conversion.override = null; near(evaluateRigidMates(input).rows[0].residual, -Math.PI / 2, 1e-12)
})
it('reports one scalar constraint and eleven free-pair DOF without hidden guides', () => {
  const value = solveRigidMates(problem()); expect(value.poses).not.toBeNull(); expect(value.rank).toBe(1); expect(value.localDOF).toBe(11)
  expect(value.evidence.groups[0].unanchored).toBe(true); expect(value.evidence.groups[0].rowCount).toBe(1)
})
it('reduces an independently guided rotor and slider from two DOF to one', () => {
  const input = guided(), without = { ...input, constraints: input.constraints.filter(c => c.type !== 'rack-pinion') }
  expect(solveRigidMates(without).localDOF).toBe(2)
  const value = solveRigidMates(input); expect(value.poses).not.toBeNull(); expect(value.rank).toBe(11); expect(value.localDOF).toBe(1)
})
it('matches all analytical derivatives to independent central differences away from zero residual', () => {
  const c = rackPinion(); c.first.frame = { translation: [.2, -.3, .1], rotation: rotationExp([.1, .2, -.15]) }
  c.second.frame = { translation: [-.4, .1, .2], rotation: rotationExp([-.2, .1, .15]) }
  c.first.support = { ...cylinder, point: [2, -1, 7], radius: 1.7 }
  c.second.support = { ...line, axis: [.3 / Math.sqrt(.5), -.4 / Math.sqrt(.5), .5 / Math.sqrt(.5)] }
  c.neutralRotation = rotationExp([.11, -.07, .05]); c.neutralTravel = .4
  const input = problem(c); input.origin = [10, -4, 3]; input.lengthScale = 3
  input.bodies[0].pose = { translation: [11, -3, 4], rotation: rotationExp([.2, -.3, .4]) }
  input.bodies[1].pose = { translation: [9, -2, 5], rotation: rotationExp([-.1, .15, -.25]) }
  const analytic = evaluateRigidMates(input); expect(analytic.diagnostics).toEqual([]); expect(analytic.rows).toHaveLength(1)
  const h = 1e-6
  for (let column = 0; column < 12; column++) {
    const body = Math.floor(column / 6), coordinate = column % 6
    const values = [-1, 1].map(sign => {
      const poses = new Map(input.bodies.map(item => [item.id, item.pose])), delta = [0, 0, 0, 0, 0, 0]; delta[coordinate] = sign * h
      poses.set(input.bodies[body].id, retractRigidBodyPose(input.bodies[body].pose, delta, input.origin, input.lengthScale))
      const evaluated = evaluateRigidMates(input, poses); expect(evaluated.diagnostics).toEqual([]); return evaluated.rows[0].residual
    })
    near(analytic.rows[0].jacobian[column], (values[1] - values[0]) / (2 * h), 5e-7)
  }
  for (let coordinate = 0; coordinate < 6; coordinate++) near(analytic.rows[0].jacobian[coordinate] + analytic.rows[0].jacobian[coordinate + 6], 0, 1e-12)
  const transform: RigidPose = { translation: [1e6, -2e6, 3e6], rotation: rotationExp([.6, -.2, .3]) }
  const transformed = { ...input, origin: composeRigidPoses(transform, { translation: input.origin, rotation: I }).translation,
    bodies: input.bodies.map(body => ({ ...body, pose: composeRigidPoses(transform, body.pose) })) }
  near(evaluateRigidMates(transformed).rows[0].residual, analytic.rows[0].residual, 5e-10)
})
it.each([1, -1])('preserves signed two-turn pinion winding %s through bounded actual states', sign => {
  let input = guided()
  for (let station = 1; station <= 12; station++) {
    input.bodies[0] = { ...input.bodies[0], fixed: true, pose: pose(sign * station * Math.PI / 3) }
    const result = solveRigidMates(input); expect(result.poses).not.toBeNull()
    near(result.rackPinionAngles.get('rack-pinion')!, sign * station * Math.PI / 3)
    near(result.poses!.get('rack')!.translation[0], sign * station * 2 * Math.PI / 3, 3e-8)
    input = rebaseRigidRackPinionAngles({ ...input, bodies: input.bodies.map(body => ({ ...body, pose: result.poses!.get(body.id)! })) }, result.rackPinionAngles)
  }
  near(input.bodies[1].pose.translation[0], sign * 8 * Math.PI, 3e-8)
  const tracked = input.constraints.find((c): c is RigidRackPinionConstraint => c.type === 'rack-pinion')!
  near(tracked.angle, sign * 4 * Math.PI)
})
it.each([1, -1])('rotates the actual follower through two turns from rack translation sign %s', sign => {
  const input = guided(); input.bodies[1].fixed = true; input.bodies[1].pose.translation[0] = sign * 8 * Math.PI
  const value = solveRigidMates(input); expect(value.poses).not.toBeNull(); near(value.rackPinionAngles.get('rack-pinion')!, sign * 4 * Math.PI, 2e-8)
  const q = value.poses!.get('pinion')!.rotation; near(Math.abs(q[3]), 1, 1e-12); near(Math.hypot(q[0], q[1], q[2]), 0, 2e-8)
})
it('publishes no poses or lifted branch after a failed hard solve', () => {
  const input = guided(); input.bodies[1].fixed = true; input.bodies[1].pose.translation[0] = 20
  const before = structuredClone(input), value = solveRigidMates(input, { maxIterations: 0 })
  expect(value.poses).toBeNull(); expect(value.rackPinionAngles.size).toBe(0); expect(input).toEqual(before)
})
it('tracks a suppressed relation through a full turn without rows and restores travel on reactivation', () => {
  const declaration = rackPinion(); let input = guided(); input.constraints = input.constraints.filter(c => c.type !== 'rack-pinion'); input.passiveRackPinions = [declaration]
  for (let station = 1; station <= 6; station++) {
    input.bodies[0] = { ...input.bodies[0], fixed: true, pose: pose(station * TAU / 6) }
    const value = solveRigidMates(input); expect(value.poses).not.toBeNull(); near(value.rackPinionAngles.get(declaration.id)!, station * TAU / 6)
    near(value.poses!.get('rack')!.translation[0], 0); expect(value.evidence.groups.flatMap(group => group.constraintIds)).not.toContain(declaration.id)
    input = rebaseRigidRackPinionAngles({ ...input, bodies: input.bodies.map(body => ({ ...body, pose: value.poses!.get(body.id)! })) }, value.rackPinionAngles)
  }
  const tracked = input.passiveRackPinions![0]; input.passiveRackPinions = undefined; input.constraints.push(tracked)
  const restored = solveRigidMates(input); expect(restored.poses).not.toBeNull(); near(restored.poses!.get('rack')!.translation[0], 4 * Math.PI, 3e-8)
})
it('rejects ambiguous or singular passive charts and bounds every trial against its accepted chart', () => {
  const input = problem(); input.constraints = []; input.passiveRackPinions = [rackPinion()]
  const poses = new Map(input.bodies.map(body => [body.id, body.pose]))
  expect(admitRigidRackPinionStep(input, poses, new Map([['pinion', 2 * Math.PI]]))).toBe(false)
  input.bodies[0].pose = pose(Math.PI)
  let value = solveRigidMates(input); expect(value.poses).toBeNull(); expect(value.rackPinionAngles.size).toBe(0)
  input.bodies[0].pose.rotation = [1, 0, 0, 0]
  value = solveRigidMates(input); expect(value.poses).toBeNull(); expect(value.rackPinionAngles.size).toBe(0)
})
it('updates passive rack, screw and gear states across independent groups without joining hard incidence', () => {
  const c = rackPinion(), input = problem(c), screw: RigidScrewConstraint = { id: 'passive-screw', type: 'screw', first: end('pinion'), second: end('rack'),
    lead: 4, reverse: false, alignment: 'aligned', neutralRotation: I, angle: 0, neutralTravel: 0 }
  const gear: RigidGearConstraint = { id: 'passive-gear', type: 'gear', first: end('pinion'), second: end('rack'), carrier: null,
    ratio: { numerator: 1, denominator: 1 }, direction: 'opposed', neutralRotations: { first: I, second: I }, angles: { first: 0, second: 0 }, phase: 0 }
  input.constraints = [drive('pinion', pose(TAU / 3)), drive('rack', pose(-TAU / 3))]
  input.passiveRackPinions = [c]; input.passiveScrews = [screw]; input.passiveGears = [gear]
  const value = solveRigidMates(input); expect(value.poses).not.toBeNull(); expect(value.evidence.groups).toHaveLength(2)
  near(value.rackPinionAngles.get(c.id)!, 2 * TAU / 3, 3e-8); near(value.screwAngles.get(screw.id)!, 2 * TAU / 3, 3e-8)
  near(value.gearAngles.get(gear.id)!.first, TAU / 3, 3e-8); near(value.gearAngles.get(gear.id)!.second, -TAU / 3, 3e-8)
  expect(value.evidence.groups.flatMap(group => group.constraintIds)).toEqual(['pinion-driver', 'rack-driver'])
})
it('solves active rack, screw and gear equations together and returns all independent winding maps', () => {
  const input = guided(), c = input.constraints.find(c => c.type === 'rack-pinion')!
  input.bodies[0] = { ...input.bodies[0], fixed: true, pose: pose(Math.PI / 3) }
  input.bodies.push({ id: 'follower', pose: pose(), fixed: false }, { id: 'nut', pose: pose(), fixed: false })
  const screw: RigidScrewConstraint = { id: 'active-screw', type: 'screw', first: end('pinion'), second: end('nut'),
    lead: TAU, reverse: false, alignment: 'aligned', neutralRotation: I, angle: 0, neutralTravel: 0 }
  const gear: RigidGearConstraint = { id: 'active-gear', type: 'gear', first: end('pinion'), second: end('follower'), carrier: null,
    ratio: { numerator: 1, denominator: 1 }, direction: 'opposed', neutralRotations: { first: I, second: I }, angles: { first: 0, second: 0 }, phase: 0 }
  input.constraints.push(bearing('follower'), stop('follower'), bearing('nut', I), screw, gear)
  const value = solveRigidMates(input); expect(value.poses).not.toBeNull(); expect(value.localDOF).toBe(0)
  near(value.poses!.get('rack')!.translation[0], 2 * Math.PI / 3, 3e-8); near(value.poses!.get('nut')!.translation[2], Math.PI / 3, 3e-8)
  near(value.rackPinionAngles.get(c.id)!, Math.PI / 3); near(value.screwAngles.get(screw.id)!, Math.PI / 3)
  near(value.gearAngles.get(gear.id)!.second, -Math.PI / 3, 3e-8)
})
it('projects a rotor objective along the coupled slider degree without losing accepted rack state', () => {
  const input = guided(), before = structuredClone(input), value = projectRigidMateTarget(input,
    { bodyId: 'pinion', frame: identityRigidPose(), targetPose: pose(Math.PI / 2), mode: 'rotate' })
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  near(value.result.rackPinionAngles.get('rack-pinion')!, Math.PI / 2, 3e-8); near(value.result.poses!.get('rack')!.translation[0], Math.PI, 3e-8)
  expect(input).toEqual(before)
})
it.each(['angle magnitude', 'travel magnitude', 'normalized advance'] as const)('rejects unrepresentable %s without angular publication', kind => {
  const c = rackPinion(), input = guided(c)
  if (kind === 'angle magnitude') c.angle = 1e20
  else if (kind === 'travel magnitude') c.neutralTravel = 1e308
  else { c.conversion = { mode: 'travel', override: 1e-300 }; input.lengthScale = 1e300 }
  const value = solveRigidMates(input); expect(value.poses).toBeNull(); expect(value.rackPinionAngles.size).toBe(0)
})
it('counts passive declarations against the unchanged total constraint envelope', () => {
  const input = problem(); input.constraints = []; input.passiveRackPinions = Array.from({ length: 4097 }, (_, index) => ({ ...rackPinion(), id: 'passive-' + index }))
  const value = solveRigidMates(input); expect(value.status).toBe('capacityLimit'); expect(value.rackPinionAngles.size).toBe(0)
})
it('derives a suppressed chart without travel constraints or geometric row publication', () => {
  const input = problem(); input.constraints = []; input.passiveRackPinions = [rackPinion()]; input.bodies[0].pose = pose(.5, [2, 3, 4])
  const poses = new Map(input.bodies.map(body => [body.id, body.pose])), value = evaluateRigidMates(input)
  expect(value.rows).toEqual([]); expect(value.checks).toEqual([]); near(value.rackPinionAngles.get('rack-pinion')!, .5)
  expect(deriveRigidRackPinionAngles(input, poses)).toEqual(value.rackPinionAngles)
})

const stamp = '2026-10-16T00:00:00.000Z', definition = { id: 'original-rack-part', revision: 'r1' }
function axis(id: string): AssemblyAxisReference { return { kind: 'face', component: { occurrencePath: [id], definition: { ...definition } },
  body: { bodyId: 'original-body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'face-v1|original-unattested-pinion' }, support: 'axis' } }
function edge(id: string): AssemblyEdgeReference { return { kind: 'edge', component: { occurrencePath: [id], definition: { ...definition } },
  body: { bodyId: 'original-body', sourceFeatureId: 'solid' }, edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-unattested-rack' }, support: 'line' } }
function document(): AssemblyDocument { return { version: 2, kind: 'assembly', units: 'mm', id: 'original-rack-root', revision: 'a1', name: 'Original rack declarations',
  createdAt: stamp, updatedAt: stamp, definitions: [{ kind: 'part', ...definition, document: { version: 1, id: definition.id, name: 'Original rack source', units: 'mm',
    features: [{ id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
      { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'original-body' } }], createdAt: stamp, updatedAt: stamp } }],
  occurrences: ['pinion', 'rack'].map(id => ({ id, name: 'Same display name', definition: { ...definition }, pose: pose(), fixed: false, visible: true, suppressed: false })),
  mates: [{ id: 'rack-pinion', name: 'Original rack relation', type: 'rack-pinion', suppressed: false, first: axis('pinion'), second: edge('rack'), ...data() }] } }
it('round-trips exact edge references and lifted state in v2 while older documents remain valid', () => {
  const input = document(), c = binaryMate(input.mates[0]); if (c.type !== 'rack-pinion') throw new Error('Original rack declaration missing')
  c.angle = 3 * TAU + .25; c.neutralTravel = -17
  expect(parseAssemblyDocument(serializeAssemblyDocument(input))).toEqual(input)
  const legacy = structuredClone(input); legacy.mates = []; expect(parseAssemblyDocument(serializeAssemblyDocument(legacy))).toEqual(legacy)
})
it('inspects edge producers, body states and exact revisions without granting native authority', () => {
  const input = document(), c = binaryMate(input.mates[0]); if (c.type !== 'rack-pinion' || c.second.kind !== 'edge') throw new Error('Original rack edge missing')
  input.occurrences[1].suppressed = true; c.second.edge.sourceFeatureId = 'missing-edge'
  let inspected = inspectAssemblyMateReferences(input)[0]
  expect(inspected.second.diagnostics.map(value => value.code)).toEqual(['SUPPRESSED_COMPONENT', 'MISSING_EDGE_PRODUCER', 'EDGE_BODY_STATE_MISMATCH'])
  c.second.component.definition.revision = 'stale'; inspected = inspectAssemblyMateReferences(input)[0]
  expect(inspected.second.diagnostics.map(value => value.code)).toEqual(['STALE_DEFINITION', 'SUPPRESSED_COMPONENT']); expect(inspected.nativeVerificationRequired).toBe(true)
})
it('does not reinterpret edge source updates as component retention and preserves explicit repair support', () => {
  const input = document(), source = input.definitions[0]; if (source.kind !== 'part') throw new Error('Original source missing')
  const part = structuredClone(source.document); part.name += ' updated'
  const plan = prepareAssemblyPartUpdate(input, definition, part, 'r2'); expect(plan.endpoints).toHaveLength(2)
  const original = plan.endpoints.find(item => item.locator.side === 'second')!; expect(original.endpoint).toMatchObject({ kind: 'edge', support: 'line' })
  const replacement = edge('rack'); replacement.component.definition = { ...plan.replacement }
  const repaired = repairAssemblyEndpoint(plan.document, original.locator, replacement)
  expect(binaryMate(repaired.mates[0]).second).toEqual(replacement)
  expect(() => repairAssemblyEndpoint(plan.document, original.locator, { ...axis('rack'), component: replacement.component })).toThrow('tipo de soporte')
  expect(binaryMate(input.mates[0]).second).toEqual(edge('rack'))
})
it.each(['plane rack', 'edge pinion', 'unknown edge field', 'edge support', 'edge accessor'] as const)('rejects invalid rack endpoint %s without broadening native authority', kind => {
  const input = document(), c = binaryMate(input.mates[0]); if (c.type !== 'rack-pinion') throw new Error('Original rack declaration missing')
  let reads = 0
  if (kind === 'plane rack') (c as unknown as { second: unknown }).second = { kind: 'principal-plane', component: null, plane: 'XY' }
  else if (kind === 'edge pinion') (c as unknown as { first: unknown }).first = edge('pinion')
  else if (kind === 'unknown edge field') Object.assign(c.second, { nativeAxis: [1, 0, 0] })
  else if (kind === 'edge support') Object.assign(c.second, { support: 'axis' })
  else if (c.second.kind === 'edge') Object.defineProperty(c.second.edge, 'key', { enumerable: true, get() { reads++; return 'edge-v1|fake' } })
  expect(() => validateAssemblyDocument(input)).toThrow(); expect(reads).toBe(0)
})
it('preserves identity and captured branch while generic editing changes conversion or reverse', () => {
  const input = document(), c = binaryMate(input.mates[0]); if (c.type !== 'rack-pinion') throw new Error('Original rack declaration missing')
  const { id, ...mate } = c, edited = applyAssemblyEdit(input, { type: 'update-mate', mateId: id,
    mate: { ...mate, conversion: { mode: 'travel', override: 7 }, reverse: true } })
  expect(edited.mates[0]).toMatchObject({ id, type: 'rack-pinion', conversion: { mode: 'travel', override: 7 }, reverse: true, angle: 0, neutralTravel: 0 })
  expect(c.conversion.override).toBeNull()
})
