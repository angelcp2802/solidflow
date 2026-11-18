import { expect, it } from 'vitest'
import { admitRigidGearStep, assemblyGearFollowerAngle, assemblyGearFollowerPhase, assemblyGearStepAdmissible,
  assemblyGearWeights, measureAssemblyGearTwist, rebaseRigidGearAngles, validateAssemblyGearData,
  type AssemblyGearData } from './assemblyGear'
import { evaluateRigidMates } from './assemblyMateEquations'
import { solveRigidMates } from './assemblySolver'
import { projectRigidMateTarget } from './assemblyProjection'
import { retractRigidBodyPose } from './assemblyKinematics'
import { identityRigidPose, type Quaternion, type RigidPose } from './rigidPose'
import type { RigidGearConstraint, RigidMateConstraint, RigidMateEndpoint, RigidMateProblem, RigidMateSupport } from './assemblySolveTypes'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyAxisReference,
  type AssemblyComponentReference, type AssemblyDocument, type AssemblyMate, type AssemblyOccurrence } from './assemblyDocument'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { applyAssemblyEdit } from './assemblyEditing'

// Original Cartesian shafts and explicit phase oracles. No teeth, imported CAD,
// native authority or geometric solver result supplies these numeric fixtures.
const I: Quaternion = [0, 0, 0, 1], TAU = 2 * Math.PI
const z = (radians: number): Quaternion => [0, 0, Math.sin(radians / 2), Math.cos(radians / 2)]
const x = (radians: number): Quaternion => [Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)]
const y = (radians: number): Quaternion => [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)]
const pose = (angle = 0): RigidPose => ({ translation: [0, 0, 0], rotation: z(angle) })
const cylinder: RigidMateSupport = { kind: 'cylinder', point: [0, 0, 0], axis: [0, 0, 1], xDirection: [1, 0, 0], radius: 2, tolerance: 0 }
const plane: RigidMateSupport = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 }
function end(bodyId: string | null, support?: RigidMateSupport): RigidMateEndpoint {
  return { bodyId, frame: identityRigidPose(), ...(support ? { support: structuredClone(support) } : {}) }
}
function gearData(): AssemblyGearData {
  return { ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', neutralRotations: { first: [...I], second: [...I] },
    angles: { first: 0, second: 0 }, phase: 0 }
}
function gear(): RigidGearConstraint { return { id: 'gear', type: 'gear', first: end('first', cylinder), second: end('second', cylinder), carrier: null, ...gearData() } }
function problem(constraints: RigidMateConstraint[] = [gear()], carrier = false): RigidMateProblem {
  return { bodies: [{ id: 'first', pose: pose(), fixed: false }, { id: 'second', pose: pose(), fixed: false },
    ...(carrier ? [{ id: 'carrier', pose: pose(), fixed: false }] : [])], constraints,
    origin: [0, 0, 0], lengthScale: 1, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
function bearings(id: string): RigidMateConstraint[] {
  return [{ id: id + '-axis', type: 'concentric', first: end(id, cylinder), second: end(null, cylinder), alignment: 'aligned', rotationLock: null },
    { id: id + '-stop', type: 'coincident', first: end(id, plane), second: end(null, plane), alignment: 'aligned' }]
}
function near(actual: number, expected: number, tolerance = 1e-8): void { expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance) }

it('normalizes positive real ratios without inferring tooth counts or multiplying large ratio terms', () => {
  expect(assemblyGearWeights({ numerator: 2.5, denominator: 1 })).toEqual({ first: 1, second: .4 })
  expect(assemblyGearWeights({ numerator: 1e308, denominator: 5e307 })).toEqual({ first: 1, second: .5 })
})
it.each(['same', 'opposed'] as const)('converts follower phase without reducing full turns: %s', direction => {
  const angle = 4 * TAU + Math.PI / 6, ratio = { numerator: 2, denominator: 1 }
  const phase = assemblyGearFollowerPhase(ratio, direction, angle)
  near(phase, (direction === 'opposed' ? 1 : -1) * angle / 2)
  near(assemblyGearFollowerAngle(ratio, direction, phase), angle)
})
it.each([Math.PI - .01, Math.PI + .01, -Math.PI - .01, 7 * TAU + .25])('lifts a regular shaft continuously across pi and whole turns: %s', angle => {
  const measured = measureAssemblyGearTwist(I, I, z(angle), [0, 0, 1], angle - .1)
  near(measured.angle, angle, 2e-12)
  expect(measured.rho).toBeCloseTo(1, 14)
  measured.gradient.forEach((value, index) => near(value, index === 2 ? 1 : 0, 1e-12))
  const opposite = measureAssemblyGearTwist(I, I, z(angle).map(value => -value) as Quaternion, [0, 0, 1], angle - .1)
  near(opposite.angle, angle, 2e-12)
})
it('measures each selected native axis direction rather than forcing global Z or parallel axes', () => {
  near(measureAssemblyGearTwist(I, I, x(.7), [1, 0, 0], .6).angle, .7)
  near(measureAssemblyGearTwist(I, I, y(.4), [0, -1, 0], -.3).angle, -.4)
})
it('rejects the swing/twist singularity instead of inventing a spin branch', () => {
  expect(() => measureAssemblyGearTwist(I, I, [1, 0, 0, 0], [0, 0, 1], 0)).toThrow('singular')
})
it.each([1, -1])('rejects an ambiguous initial half-turn lift for either quaternion sign: %s', sign => {
  expect(() => measureAssemblyGearTwist(I, I, [0, 0, sign, 0], [0, 0, 1], 0)).toThrow('ambiguous')
})
it('rejects angular magnitude whose floating precision exceeds the requested tolerance', () => {
  expect(() => measureAssemblyGearTwist(I, I, I, [0, 0, 1], 1e15)).toThrow('precision')
})
it('bounds angular continuation by the chart margin, including carrier rotation', () => {
  expect(assemblyGearStepAdmissible(1, .5, .2)).toBe(true)
  expect(assemblyGearStepAdmissible(1, 2, 0)).toBe(false)
  expect(assemblyGearStepAdmissible(.01, .02, 0)).toBe(false)
  expect(assemblyGearStepAdmissible(1, .75, .75)).toBe(false)
  expect(assemblyGearStepAdmissible(1, Infinity, 0)).toBe(false)
})

const invalidData: Array<[string, (value: AssemblyGearData) => unknown]> = [
  ['zero numerator', value => ({ ...value, ratio: { numerator: 0, denominator: 1 } })],
  ['negative denominator', value => ({ ...value, ratio: { numerator: 1, denominator: -1 } })],
  ['nonfinite numerator', value => ({ ...value, ratio: { numerator: Infinity, denominator: 1 } })],
  ['underflow ratio', value => ({ ...value, ratio: { numerator: Number.MIN_VALUE, denominator: Number.MAX_VALUE } })],
  ['unknown direction', value => ({ ...value, direction: 'automatic' })],
  ['bad neutral quaternion', value => ({ ...value, neutralRotations: { first: [0, 0, 0, 2], second: I } })],
  ['nonfinite lift', value => ({ ...value, angles: { first: NaN, second: 0 } })],
  ['nonfinite phase', value => ({ ...value, phase: Infinity })],
  ['unknown angle field', value => ({ ...value, angles: { ...value.angles, turnGuess: 1 } })],
  ['unknown outer field', value => ({ ...value, nativeProof: true })],
]
it.each(invalidData)('strictly rejects malformed gear data: %s', (_name, mutate) => {
  expect(() => validateAssemblyGearData(mutate(gearData()))).toThrow()
})
it('rejects executable nested gear fields without invoking accessors', () => {
  const input = gearData(); let reads = 0
  Object.defineProperty(input.angles, 'first', { enumerable: true, get() { reads++; return 0 } })
  expect(() => validateAssemblyGearData(input)).toThrow('executable')
  expect(reads).toBe(0)
})

it.each(['same', 'opposed'] as const)('evaluates one angular coupling row with the signed real speed ratio: %s', direction => {
  const constraint = gear(); constraint.direction = direction; constraint.ratio = { numerator: 1, denominator: 2 }
  const input = problem([constraint]); input.bodies[0].pose = pose(Math.PI / 3); input.bodies[1].pose = pose((direction === 'opposed' ? -1 : 1) * Math.PI / 6)
  const evaluated = evaluateRigidMates(input)
  expect(evaluated.diagnostics).toEqual([]); expect(evaluated.rows).toHaveLength(1)
  near(evaluated.rows[0].residual, 0)
  expect(evaluated.checks[0].satisfied).toBe(true)
  near(evaluated.rows[0].jacobian[5], .5); near(evaluated.rows[0].jacobian[11], direction === 'opposed' ? 1 : -1)
  expect(evaluated.rows[0].jacobian.filter((_value, index) => index % 6 < 3)).toEqual(Array(6).fill(0))
})
it('honors a reversed second native axis without silently relabeling the saved direction', () => {
  const constraint = gear(); constraint.ratio = { numerator: 1, denominator: 2 }
  constraint.second.support = { ...cylinder, axis: [0, 0, -1] }
  const input = problem([constraint]); input.bodies[0].pose = pose(Math.PI / 3); input.bodies[1].pose = pose(Math.PI / 6)
  const result = evaluateRigidMates(input)
  expect(result.diagnostics).toEqual([]); near(result.rows[0].residual, 0)
  near(result.gearAngles.get('gear')!.second, -Math.PI / 6)
})
it('differentiates noncommuting neutral, carrier and endpoint rotations against independent central differences', () => {
  const constraint = gear(); constraint.carrier = end('carrier'); constraint.neutralRotations = { first: x(.17), second: y(-.21) }
  constraint.second.support = { ...cylinder, axis: [1, 0, 0], xDirection: [0, 1, 0] }
  const input = problem([constraint], true); input.bodies[0].pose.rotation = z(.6); input.bodies[1].pose.rotation = x(-.4); input.bodies[2].pose.rotation = y(.2)
  const base = evaluateRigidMates(input); expect(base.diagnostics).toEqual([])
  for (const h of [2e-6, 7e-7]) for (let column = 0; column < 18; column++) {
    const owner = input.bodies[Math.floor(column / 6)], delta = Array(6).fill(0) as number[]; delta[column % 6] = h
    const plus = evaluateRigidMates(input, new Map([[owner.id, retractRigidBodyPose(owner.pose, delta, input.origin, input.lengthScale)]]))
    delta[column % 6] = -h
    const minus = evaluateRigidMates(input, new Map([[owner.id, retractRigidBodyPose(owner.pose, delta, input.origin, input.lengthScale)]]))
    expect(plus.diagnostics).toEqual([]); expect(minus.diagnostics).toEqual([])
    near(base.rows[0].jacobian[column], (plus.rows[0].residual - minus.rows[0].residual) / (2 * h), 2e-7)
  }
})
it('preserves all six common rigid gauge directions when the carrier is a movable component', () => {
  const constraint = gear(); constraint.carrier = end('carrier'); constraint.phase = .2
  const input = problem([constraint], true); input.bodies[0].pose = pose(.7); input.bodies[1].pose = pose(-.2); input.bodies[2].pose = pose(.1)
  const base = evaluateRigidMates(input); expect(base.diagnostics).toEqual([])
  for (let coordinate = 0; coordinate < 6; coordinate++) near(base.rows[0].jacobian[coordinate] + base.rows[0].jacobian[coordinate + 6] + base.rows[0].jacobian[coordinate + 12], 0, 2e-12)
  const common = [.2, -.3, .1, .15, -.2, .1], poses = new Map(input.bodies.map(body => [body.id, retractRigidBodyPose(body.pose, common, input.origin, input.lengthScale)]))
  near(evaluateRigidMates(input, poses).rows[0].residual, base.rows[0].residual, 2e-12)
  const result = solveRigidMates({ ...input, constraints: [{ ...constraint, phase: base.rows[0].residual + constraint.phase }] })
  expect(result.localDOF).toBe(17); expect(result.rank).toBe(1); expect(result.evidence.groups).toHaveLength(1)
  expect(result.evidence.groups[0].bodyIds).toEqual(['carrier', 'first', 'second']); expect(result.evidence.groups[0].unanchored).toBe(true)
})
it('counts a null carrier as an explicit scope reference without inventing bearing or translation rows', () => {
  const result = solveRigidMates(problem())
  expect(result.rank).toBe(1); expect(result.localDOF).toBe(11); expect(result.evidence.groups[0].unanchored).toBe(false)
})
it('reduces two independently supported shaft spins to one coupled DOF', () => {
  const result = solveRigidMates(problem([...bearings('first'), ...bearings('second'), gear()]))
  expect(result.poses).not.toBeNull(); expect(result.rank).toBe(11); expect(result.localDOF).toBe(1)
  expect(result.evidence.groups).toHaveLength(1)
})
it('continues a 2:1 follower to minus 240 degrees for a fixed first shaft at plus 120 degrees', () => {
  const input = problem([...bearings('second'), gear()]); input.bodies[0].fixed = true; input.bodies[0].pose = pose(2 * Math.PI / 3)
  const before = structuredClone(input), result = solveRigidMates(input)
  expect(result.poses).not.toBeNull(); expect(result.localDOF).toBe(0)
  near(result.gearAngles.get('gear')!.first, 2 * Math.PI / 3)
  near(result.gearAngles.get('gear')!.second, -4 * Math.PI / 3, 3e-8)
  // Orientation alone would also look like plus 120; the lifted state differs.
  const q = result.poses!.get('second')!.rotation
  near(1 - 2 * q[2] * q[2], -.5); near(2 * q[2] * q[3], Math.sqrt(3) / 2)
  expect(input).toEqual(before)
})
it('preserves accumulated real-ratio turns across successive accepted transactions', () => {
  const constraint = gear(); constraint.ratio = { numerator: 2.5, denominator: 1 }
  let input = problem([...bearings('second'), constraint]); input.bodies[0].fixed = true
  for (let step = 1; step <= 20; step++) {
    input.bodies[0].pose = pose(step * Math.PI / 6)
    const result = solveRigidMates(input); expect(result.poses).not.toBeNull()
    input = rebaseRigidGearAngles({ ...input, bodies: input.bodies.map(body => ({ ...body, pose: result.poses!.get(body.id)! })) }, result.gearAngles)
  }
  const final = input.constraints.find(value => value.type === 'gear') as RigidGearConstraint
  near(final.angles.first, 10 * Math.PI / 3, 3e-8); near(final.angles.second, -25 * Math.PI / 3, 3e-8)
})
it('certifies a fixed gear phase violation instead of accepting an unrelated orientation angle', () => {
  const input = problem(); input.bodies.forEach(body => { body.fixed = true }); input.bodies[0].pose = pose(.3); input.bodies[1].pose = pose(.4)
  const result = solveRigidMates(input)
  expect(result.status).toBe('inconsistent'); expect(result.poses).toBeNull(); expect(result.gearAngles.size).toBe(0)
  expect(result.certificates[0]).toMatchObject({ kind: 'fixedConstraint', constraintIds: ['gear'] })
})
it('rolls back every derived angular state on a rejected solve', () => {
  const constraint = gear(); constraint.phase = 1
  const input = problem([...bearings('first'), ...bearings('second'), constraint]), before = structuredClone(input)
  const result = solveRigidMates(input, { maxIterations: 0 })
  expect(result.poses).toBeNull(); expect(result.gearAngles.size).toBe(0); expect(input).toEqual(before)
})
it('does not use an orientation reseed to cross a singular gear branch', () => {
  const input = problem(); input.bodies[0].pose.rotation = [1, 0, 0, 0]
  const result = solveRigidMates(input)
  expect(result.status).toBe('nonConverged'); expect(result.poses).toBeNull(); expect(result.gearAngles.size).toBe(0)
})
it('tracks suppressed gears through accepted hard solves without coupling their owner groups or enforcing phase', () => {
  const firstBearing = bearings('first'), secondBearing = bearings('second')
  if (firstBearing[0].type !== 'concentric' || secondBearing[0].type !== 'concentric') throw new Error('Original bearing fixture missing')
  // first is the moving shaft and second is the fixed scope: the saved
  // relative rotation R_first^-1*R_second is the inverse desired shaft spin.
  firstBearing[0].rotationLock = z(-2 * Math.PI / 3); secondBearing[0].rotationLock = z(2 * Math.PI / 3)
  const input = problem([...firstBearing, ...secondBearing]); input.passiveGears = [gear()]
  const result = solveRigidMates(input)
  expect(result.poses).not.toBeNull(); expect(result.rank).toBe(12); expect(result.localDOF).toBe(0)
  expect(result.evidence.groups).toHaveLength(2)
  expect(result.evidence.groups.flatMap(group => group.constraintIds)).not.toContain('gear')
  near(result.gearAngles.get('gear')!.first, 2 * Math.PI / 3, 3e-8); near(result.gearAngles.get('gear')!.second, -2 * Math.PI / 3, 3e-8)
  const evaluation = evaluateRigidMates(rebaseRigidGearAngles(input, result.gearAngles), result.poses!)
  expect(evaluation.checks).toHaveLength(4); expect(evaluation.rows).toHaveLength(26)
})
it('projects a first-shaft target while hard restoration carries the follower past minus pi', () => {
  const input = problem([...bearings('first'), ...bearings('second'), gear()]), before = structuredClone(input)
  const result = projectRigidMateTarget(input, { bodyId: 'first', frame: identityRigidPose(), targetPose: pose(2 * Math.PI / 3), mode: 'rotate' })
  expect(result.status, result.status === 'rejected' ? result.message : '').toBe('ready')
  if (result.status !== 'ready') throw new Error(result.message)
  near(result.result.gearAngles.get('gear')!.first, 2 * Math.PI / 3, 3e-8)
  near(result.result.gearAngles.get('gear')!.second, -4 * Math.PI / 3, 6e-8)
  expect(input).toEqual(before)
})
it('rejects an unsafe passive continuation trial even though it contributes no hard rows', () => {
  const input = problem([]); input.passiveGears = [gear()]
  const poses = new Map(input.bodies.map(body => [body.id, body.pose]))
  expect(admitRigidGearStep(input, poses, new Map([['first', 2]]))).toBe(false)
  const evaluated = evaluateRigidMates(input)
  expect(evaluated.rows).toEqual([]); expect(evaluated.checks).toEqual([]); expect(evaluated.gearAngles.get('gear')).toEqual({ first: 0, second: 0 })
})

const stamp = '2026-10-16T00:00:00.000Z', source = { id: 'source', revision: 'r1' }
function component(id: string): AssemblyComponentReference { return { occurrencePath: [id], definition: { ...source } } }
function axis(id: string): AssemblyAxisReference {
  return { kind: 'face', component: component(id), support: 'axis', body: { bodyId: 'body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'face-v1|unattested-original-cylinder' } }
}
function document(): AssemblyDocument {
  const occurrence = (id: string): AssemblyOccurrence => ({ id, name: id, definition: { ...source }, pose: pose(), fixed: false, visible: true, suppressed: false })
  return { version: 2, kind: 'assembly', units: 'mm', id: 'root', revision: 'r1', name: 'Original gear declarations', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...source, document: { version: 1, id: source.id, units: 'mm', name: 'Original cylindrical declaration', createdAt: stamp, updatedAt: stamp,
      features: [{ id: 'profile', name: 'Original circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 2 } },
        { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } }] } }],
    occurrences: ['first', 'second', 'carrier'].map(occurrence), mates: [{ id: 'gear', name: 'Original gear relation', type: 'gear', suppressed: false,
      first: axis('first'), second: axis('second'), carrier: component('carrier'), ...gearData() }] }
}
it('round-trips lifted phase and exact references in v2 without wrapping turns or adding native authority', () => {
  const input = document(), declaration = input.mates[0]
  if (declaration.type !== 'gear') throw new Error('Original gear fixture missing')
  declaration.angles = { first: 3 * TAU + .25, second: -6 * TAU - .5 }; declaration.phase = 4 * TAU + .75
  const parsed = parseAssemblyDocument(serializeAssemblyDocument(input))
  expect(parsed).toEqual(input); expect(parsed.mates[0]).not.toBe(input.mates[0])
  input.mates = []; expect(parseAssemblyDocument(serializeAssemblyDocument(input))).toEqual(input)
})
it('includes the carrier in reference diagnostics without using display names or stale revisions', () => {
  const input = document(); input.occurrences[2].suppressed = true
  let inspected = inspectAssemblyMateReferences(input)[0]
  expect(inspected.carrier!.diagnostics.map(value => value.code)).toEqual(['SUPPRESSED_COMPONENT'])
  expect(inspected.first.diagnostics).toEqual([]); expect(inspected.nativeVerificationRequired).toBe(true)
  const declaration = input.mates[0]
  if (declaration.type !== 'gear' || !declaration.carrier) throw new Error('Original carrier fixture missing')
  declaration.carrier.definition.revision = 'old'
  inspected = inspectAssemblyMateReferences(input)[0]
  expect(inspected.carrier!.diagnostics.map(value => value.code)).toEqual(['STALE_DEFINITION', 'SUPPRESSED_COMPONENT'])
})
it('preserves the explicit null scope carrier during reference inspection', () => {
  const input = document(), declaration = input.mates[0]
  if (declaration.type !== 'gear') throw new Error('Original gear fixture missing')
  declaration.carrier = null
  expect(inspectAssemblyMateReferences(input)[0].carrier).toEqual({ candidate: null, diagnostics: [] })
})
it('includes a part carrier in source revision review and requires an explicit component repair', () => {
  const input = document(), definition = input.definitions[0]
  if (definition.kind !== 'part') throw new Error('Original part fixture missing')
  const plan = prepareAssemblyPartUpdate(input, source, definition.document, 'r2')
  expect(plan.endpoints.map(value => value.locator.side)).toEqual(['first', 'second', 'carrier'])
  const carrier = plan.endpoints.find(value => value.locator.side === 'carrier')!
  const repaired = repairAssemblyEndpoint(plan.document, carrier.locator, { occurrencePath: ['carrier'], definition: { id: 'source', revision: 'r2' } })
  expect(inspectAssemblyMateReferences(repaired)[0].carrier!.diagnostics).toEqual([])
  expect(() => repairAssemblyEndpoint(plan.document, carrier.locator, axis('first'))).toThrow()
})
it('keeps the generic mate edit/history boundary detached and retains the gear identity', () => {
  const input = document(), before = structuredClone(input), { id, ...declaration } = input.mates[0]
  if (declaration.type !== 'gear') throw new Error('Original gear fixture missing')
  const edited = applyAssemblyEdit(input, { type: 'update-mate', mateId: id, mate: { ...declaration, ratio: { numerator: 2.5, denominator: 1 }, phase: .25 } })
  expect(edited.mates[0]).toMatchObject({ id, type: 'gear', ratio: { numerator: 2.5, denominator: 1 }, phase: .25 })
  expect(input).toEqual(before)
})
it.each(['plane endpoint', 'missing carrier', 'unknown gear proof'] as const)('rejects a malformed saved gear: %s', kind => {
  const input = document(), declaration = input.mates[0] as Extract<AssemblyMate, { type: 'gear' }>
  if (kind === 'plane endpoint') declaration.first = { ...declaration.first, support: 'plane' } as unknown as AssemblyAxisReference
  else if (kind === 'missing carrier') delete (declaration as unknown as Record<string, unknown>).carrier
  else Object.assign(declaration, { nativeProof: true })
  expect(() => validateAssemblyDocument(input)).toThrow()
})
