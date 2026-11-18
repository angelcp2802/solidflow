import { expect, it, vi } from 'vitest'
import { MAX_ASSEMBLY_MOTION_ANGULAR_STEP, MAX_ASSEMBLY_MOTION_STATIONS, measureAssemblyComponentMotionAngle,
  planAssemblyComponentMotion, validateAssemblyComponentMotion, type AssemblyComponentMotion } from './assemblyMotion'
import type { AssemblyComponentReference, AssemblyDocument, AssemblyOccurrence, EmbeddedAssemblyDefinition } from './assemblyDocument'
import type { Quaternion, RigidPose } from './rigidPose'

// Original declaration-only fixtures and Cartesian rotation oracles. Neither
// these pure plans nor their station coordinates attest BRep, mates, collision
// clearance, motion between stations or native preview/Apply authority.
const stamp = '2026-10-16T00:00:00.000Z', source = { id: 'original-rotor', revision: 'r1' }
const I: Quaternion = [0, 0, 0, 1], H = Math.SQRT1_2
const component = (path = ['rotor']): AssemblyComponentReference => ({ occurrencePath: [...path], definition: { ...source } })
function placement(translation: RigidPose['translation'] = [0, 0, 0], rotation: Quaternion = [...I]): RigidPose {
  return { translation: [...translation], rotation: [...rotation] }
}
function occurrence(id: string, pose = placement()): AssemblyOccurrence {
  return { id, name: 'Original ' + id, definition: { ...source }, pose, fixed: false, suppressed: false, visible: true }
}
function document(pose = placement()): AssemblyDocument {
  return { version: 2, kind: 'assembly', units: 'mm', id: 'original-root', revision: 'a1', name: 'Original angular path',
    createdAt: stamp, updatedAt: stamp, mates: [], occurrences: [occurrence('rotor', pose)],
    definitions: [{ kind: 'part', ...source, document: { version: 1, id: source.id, name: 'Original empty rotor declaration',
      units: 'mm', features: [], createdAt: stamp, updatedAt: stamp } }] }
}
function motion(angle = 4 * Math.PI, axis: 0 | 1 | 2 = 2, translation: RigidPose['translation'] = [0, 0, 0]): AssemblyComponentMotion {
  return { component: component(), translation: [...translation], rotation: { axis, angle } }
}
function near(actual: readonly number[], expected: readonly number[], tolerance = 2e-12): void {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(tolerance))
}

it('retains explicit signed turns and exposes a bounded original-base plan without document authority', () => {
  const input = document(), request = motion(), before = structuredClone(input), plan = planAssemblyComponentMotion(input, request)
  expect(plan.request).toEqual(request); expect(plan.component).toEqual(component())
  expect(plan.scope).toEqual({ id: 'original-root', revision: 'a1' }); expect(plan.occurrenceId).toBe('rotor')
  expect(plan.affectedPaths).toEqual([['rotor']])
  expect(plan.startPose).toEqual(placement()); expect(plan.targetPose).toEqual(placement())
  expect(plan.stationCount).toBeGreaterThanOrEqual(12); expect(plan.stationCount).toBeLessThanOrEqual(13)
  expect(plan.maxAngularStep).toBe(Math.PI / 3)
  expect(Math.abs(request.rotation.angle) / plan.stationCount).toBeLessThanOrEqual(plan.maxAngularStep)
  expect(Object.hasOwn(plan, 'document')).toBe(false); expect(Object.hasOwn(plan, 'token')).toBe(false)
  expect(input).toEqual(before)
})
it('composes local intrinsic X after the original Z90 orientation, without rotating translation', () => {
  const start = placement([2, 3, 4], [0, 0, H, H]), plan = planAssemblyComponentMotion(document(start), motion(Math.PI / 2, 0, [8, 9, 10]))
  // Rz90*Rx90 maps x->y, y->z, z->x; its Hamilton quaternion is (.5,.5,.5,.5).
  near(plan.targetPose.rotation, [.5, .5, .5, .5]); near(plan.targetPose.translation, [8, 9, 10])
  expect(plan.stationCount).toBe(2)
  near(plan.atStation(1).pose.translation, [5, 6, 7])
})
it.each([0, 1, 2] as const)('uses the selected intrinsic component axis %s with a signed quarter turn', axis => {
  const plan = planAssemblyComponentMotion(document(), motion(-Math.PI / 2, axis)), expected: Quaternion = [0, 0, 0, H]
  expected[axis] = -H
  near(plan.targetPose.rotation, expected)
})
it.each([2 * Math.PI, 4 * Math.PI, -4 * Math.PI])('keeps every intermediate station for a whole-turn endpoint %s', angle => {
  const start = placement([1, -2, 3], [0, 0, H, H]), plan = planAssemblyComponentMotion(document(start), motion(angle, 0, [1, -2, 3]))
  expect(plan.targetPose.rotation).toEqual(start.rotation)
  expect(plan.atStation(plan.stationCount).pose.rotation).toEqual(start.rotation)
  expect(plan.request.rotation.angle).toBe(angle); expect(plan.stationCount).toBeGreaterThan(1)
  expect(plan.atStation(1).pose.rotation).not.toEqual(start.rotation)
})
it('does not erase an unsupported full X revolution merely because its final orientation is identical', () => {
  const plan = planAssemblyComponentMotion(document(), motion(2 * Math.PI, 0))
  expect(plan.targetPose.rotation).toEqual(I); expect(plan.stationCount).toBeGreaterThanOrEqual(6)
  const first = plan.atStation(1).pose.rotation
  expect(Math.abs(first[0])).toBeGreaterThan(.1); expect(first[1]).toBe(0); expect(first[2]).toBe(0)
  // Whether the intermediate tilt violates bearings belongs to native checks.
})
it('computes all station rotations from the original frame rather than accumulating previous products', () => {
  const angle = 7 * Math.PI / 2, plan = planAssemblyComponentMotion(document(), motion(angle))
  for (let index = 0; index <= plan.stationCount; index++) {
    const theta = angle * index / plan.stationCount
    near(plan.atStation(index).pose.rotation, [0, 0, Math.sin(theta / 2), Math.cos(theta / 2)])
  }
})
it('preserves an exact zero increment while interpolating an absolute local translation', () => {
  const start = placement([2, -3, 5], [0, 0, H, H]), plan = planAssemblyComponentMotion(document(start), motion(0, 1, [8, 9, -1]))
  expect(plan.stationCount).toBe(1); expect(plan.atStation(0).pose).toEqual(start)
  expect(plan.atStation(1).pose).toEqual(placement([8, 9, -1], start.rotation))
})
it('admits the exact station budget and rejects excess before trigonometry', () => {
  expect(MAX_ASSEMBLY_MOTION_STATIONS).toBe(128); expect(MAX_ASSEMBLY_MOTION_ANGULAR_STEP).toBe(Math.PI / 3)
  const maximum = MAX_ASSEMBLY_MOTION_STATIONS * MAX_ASSEMBLY_MOTION_ANGULAR_STEP
  expect(planAssemblyComponentMotion(document(), motion(maximum)).stationCount).toBe(128)
  const input = document(), request = motion(maximum + MAX_ASSEMBLY_MOTION_ANGULAR_STEP), sin = vi.spyOn(Math, 'sin'), cos = vi.spyOn(Math, 'cos')
  try {
    expect(() => planAssemblyComponentMotion(input, request)).toThrow('128 estaciones')
    expect(sin).not.toHaveBeenCalled(); expect(cos).not.toHaveBeenCalled()
  } finally { sin.mockRestore(); cos.mockRestore() }
})
it.each([1, -1])('rejects an angular underflow instead of converting nonzero intent into identity: %s', sign => {
  expect(() => validateAssemblyComponentMotion(motion(sign * Number.MIN_VALUE))).toThrow('precisión')
})
it('rejects overflowing local displacement before constructing an angular endpoint', () => {
  const input = document(placement([1e308, 0, 0])), request = motion(Math.PI / 2, 2, [-1e308, 0, 0]), sin = vi.spyOn(Math, 'sin')
  try { expect(() => planAssemblyComponentMotion(input, request)).toThrow('aritmética finita'); expect(sin).not.toHaveBeenCalled() }
  finally { sin.mockRestore() }
})
it('rejects unrepresentable translation stations in a large local coordinate before trigonometry', () => {
  const input = document(placement([1e16, 0, 0])), request = motion(Math.PI / 2, 2, [1e16 + 2, 0, 0]), sin = vi.spyOn(Math, 'sin')
  try { expect(() => planAssemblyComponentMotion(input, request)).toThrow('precisión representable'); expect(sin).not.toHaveBeenCalled() }
  finally { sin.mockRestore() }
})
it('returns detached plan fields and stations independently of source, caller and previous results', () => {
  const input = document(), request = motion(Math.PI / 2, 2, [4, 6, 8]), plan = planAssemblyComponentMotion(input, request)
  const first = plan.atStation(1), expected = structuredClone(first)
  request.translation[0] = 999; request.component.occurrencePath[0] = 'changed'; input.occurrences[0].pose.rotation[3] = -1
  plan.request.rotation.angle = 100; plan.request.translation[1] = 999; plan.component.occurrencePath[0] = 'changed-again'
  plan.startPose.translation[0] = 999; plan.targetPose.rotation[0] = 999; plan.affectedPaths[0][0] = 'changed-path'
  first.pose.translation[0] = 999; first.pose.rotation[0] = 999; first.component.definition.revision = 'changed-revision'
  expect(plan.atStation(1)).toEqual(expected)
})
it.each([-1, .5, NaN, Infinity, 1000])('rejects invalid station index %s instead of truncating or clamping', index => {
  const plan = planAssemblyComponentMotion(document(), motion(Math.PI / 2))
  expect(() => plan.atStation(index)).toThrow('índice de estación')
})

const malformed: Array<[string, (value: AssemblyComponentMotion) => unknown]> = [
  ['null', () => null], ['array', () => []], ['inherited record', value => Object.assign(Object.create({}), value)],
  ['unknown field', value => ({ ...value, targetPose: placement() })],
  ['missing rotation', value => ({ component: value.component, translation: value.translation })],
  ['string axis', value => ({ ...value, rotation: { axis: 'Z', angle: 1 } })],
  ['fractional axis', value => ({ ...value, rotation: { axis: .5, angle: 1 } })],
  ['out-of-range axis', value => ({ ...value, rotation: { axis: 3, angle: 1 } })],
  ['nonfinite angle', value => ({ ...value, rotation: { axis: 2, angle: Infinity } })],
  ['string angle', value => ({ ...value, rotation: { axis: 2, angle: '720' } })],
  ['rotation extra field', value => ({ ...value, rotation: { ...value.rotation, turns: 2 } })],
  ['empty component path', value => ({ ...value, component: { ...value.component, occurrencePath: [] } })],
  ['sparse translation', value => ({ ...value, translation: new Array(3) })],
  ['nonfinite translation', value => ({ ...value, translation: [Infinity, 0, 0] })],
  ['overflowing translation norm', value => ({ ...value, translation: [Number.MAX_VALUE, Number.MAX_VALUE, 0] })],
  ['symbol field', value => ({ ...value, [Symbol('private')]: true })],
]
it.each(malformed)('rejects malformed motion data without coercion: %s', (_name, change) => {
  expect(() => validateAssemblyComponentMotion(change(motion()))).toThrow()
})
it.each(['rotation', 'angle', 'translation element'] as const)('does not execute a getter in %s', field => {
  const input = motion(); let reads = 0
  const target = field === 'rotation' ? input : field === 'angle' ? input.rotation : input.translation
  const key = field === 'rotation' ? 'rotation' : field === 'angle' ? 'angle' : '0'
  Object.defineProperty(target, key, { enumerable: true, get() { reads++; return 0 } })
  expect(() => validateAssemblyComponentMotion(input)).toThrow(); expect(reads).toBe(0)
})
it('accepts plain null-prototype request records without sharing them', () => {
  const original = motion(), input = Object.assign(Object.create(null), original) as AssemblyComponentMotion
  input.rotation = Object.assign(Object.create(null), original.rotation) as AssemblyComponentMotion['rotation']
  expect(validateAssemblyComponentMotion(input)).toEqual(original)
})
it.each(['stale revision', 'missing occurrence', 'fixed occurrence', 'suppressed occurrence', 'path through part'] as const)(
  'rejects a nonmovable or mismatched selection: %s', kind => {
    const input = document(), request = motion()
    if (kind === 'stale revision') request.component.definition.revision = 'old'
    else if (kind === 'missing occurrence') request.component.occurrencePath = ['missing']
    else if (kind === 'fixed occurrence') input.occurrences[0].fixed = true
    else if (kind === 'suppressed occurrence') input.occurrences[0].suppressed = true
    else request.component.occurrencePath = ['rotor', 'not-a-child']
    expect(() => planAssemblyComponentMotion(input, request)).toThrow()
  })
it('resolves a shared local declaration and includes all actual affected paths without inheriting fixed flags', () => {
  const input = document(), nested: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'shared', revision: 's1', name: 'Original shared rotor holder',
    occurrences: [occurrence('rotor', placement([1, 2, 3]))], mates: [], createdAt: stamp, updatedAt: stamp }
  input.definitions.push(nested)
  const a = occurrence('a'), b = occurrence('b'); a.definition = { id: 'shared', revision: 's1' }; b.definition = { ...a.definition }
  a.fixed = true; b.suppressed = true; input.occurrences = [a, b]
  const request = motion(Math.PI / 2, 2, [4, 5, 6]); request.component = component(['a', 'rotor'])
  const plan = planAssemblyComponentMotion(input, request)
  expect(plan.scope).toEqual({ id: 'shared', revision: 's1' }); expect(plan.startPose.translation).toEqual([1, 2, 3])
  expect(plan.affectedPaths).toEqual([['a', 'rotor'], ['b', 'rotor']])
  request.component.occurrencePath = ['b', 'rotor']; expect(() => planAssemblyComponentMotion(input, request)).toThrow('suprimida')
})
it('validates dormant graph data before publishing a motion plan', () => {
  const input = document()
  input.definitions.push({ kind: 'assembly', id: 'dormant', revision: 'd1', name: 'Original broken dormant definition',
    occurrences: [{ ...occurrence('missing'), definition: { id: 'missing', revision: 'r1' } }], mates: [], createdAt: stamp, updatedAt: stamp })
  expect(() => planAssemblyComponentMotion(input, motion())).toThrow('no encontrada')
})

it.each([1, -1])('measures two actual resolved revolutions without echoing request data: %s', sign => {
  let angle = 0
  for (let index = 1; index <= 16; index++) {
    const actual = sign * index * Math.PI / 4, quaternion: Quaternion = [0, 0, Math.sin(actual / 2), Math.cos(actual / 2)]
    angle = measureAssemblyComponentMotionAngle(I, 2, quaternion, angle)
    expect(Math.abs(angle - actual)).toBeLessThan(2e-12)
  }
  expect(Math.abs(angle - sign * 4 * Math.PI)).toBeLessThan(2e-12)
})
it('measures actual intrinsic spin in a nonidentity original frame', () => {
  const angle = measureAssemblyComponentMotionAngle([0, 0, H, H], 0, [.5, .5, .5, .5], 1)
  expect(Math.abs(angle - Math.PI / 2)).toBeLessThan(2e-12)
})
it('rejects ambiguous or singular measured coordinates instead of inventing a completed turn', () => {
  expect(() => measureAssemblyComponentMotionAngle(I, 2, [0, 0, 1, 0], 0)).toThrow('ambiguous')
  expect(() => measureAssemblyComponentMotionAngle(I, 2, [1, 0, 0, 0], 0)).toThrow('singular')
})
