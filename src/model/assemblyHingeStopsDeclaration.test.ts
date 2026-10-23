import { expect, it } from 'vitest'
import { copyRigidHingeConstraint } from './assemblyHingeNumeric'
import { rigidMateConstraintEndpointEntries } from './assemblyNumericMateEndpoints'
import { identityRigidPose } from './rigidPose'
import { rotationExp } from './assemblyKinematics'
import type { RigidHingeConstraint, RigidMateEndpoint } from './assemblySolveTypes'

// Original numerical declarations only: Z hinge with two oriented material
// planes. Topological/native/saved authority is not represented by these data.
function declaration(): RigidHingeConstraint {
  const axis = (bodyId: string | null): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(),
    support: { kind: 'line', point: [0, 0, 0], axis: [0, 0, 1], tolerance: 0 } })
  const plane = (bodyId: string | null, normal: [number, number, number], xDirection: [number, number, number]): RigidMateEndpoint => ({ bodyId, frame: identityRigidPose(),
    support: { kind: 'plane', point: [1, 2, 3], normal, xDirection, tolerance: 2e-7 } })
  return { id: 'original-six-role-hinge', type: 'hinge', alignment: 'aligned', axis: [axis('a'), axis('b')],
    axial: [plane('a', [0, 0, 1], [1, 0, 0]), plane('b', [0, 0, 1], [1, 0, 0])],
    stops: { coordinate: 'directed-about-axis', angular: [plane('a', [1, 0, 0], [0, 1, 0]), plane('b', [0, 1, 0], [1, 0, 0])],
      arc: { start: 330, sweep: 60 }, uncertainty: [{ positionErrorMm: 3e-7, directionErrorRad: 1e-12 }, { positionErrorMm: 4e-7, directionErrorRad: 2e-12 }] } }
}
it('detaches complete six-role declarations and ordered errors without changing the unlimited shape', () => {
  const input = declaration(), before = structuredClone(input), copy = copyRigidHingeConstraint(input)
  expect(copy).toEqual(before); expect(copy.stops).not.toBe(input.stops)
  copy.stops!.arc.start = 10; copy.stops!.angular[0].frame.translation[0] = 50; copy.stops!.uncertainty![1].directionErrorRad = 1
  expect(input).toEqual(before)
  const unlimited = declaration(); delete unlimited.stops
  expect(copyRigidHingeConstraint(unlimited)).toEqual(unlimited)
  expect(Object.hasOwn(copyRigidHingeConstraint(unlimited), 'stops')).toBe(false)
})
it('retains all six formal roles and repeated/null owners without deduplicating incidence', () => {
  const c = declaration(), entries = rigidMateConstraintEndpointEntries(c)
  expect(entries.map(e => e.role)).toEqual(['axis-0', 'axis-1', 'axial-0', 'axial-1', 'angle-0', 'angle-1'])
  expect(entries.map(e => e.endpoint?.bodyId)).toEqual(['a', 'b', 'a', 'b', 'a', 'b'])
  for (const e of entries) e.endpoint!.bodyId = null
  const copied = copyRigidHingeConstraint(c)
  expect(rigidMateConstraintEndpointEntries(copied).map(e => e.endpoint?.bodyId)).toEqual(Array(6).fill(null))
})
it('allows different descendant frames and leaves projection observability to evaluation', () => {
  const c = declaration()
  c.stops!.angular[0].frame = { translation: [12, -4, 2], rotation: rotationExp([.2, -.3, .1]) }
  c.stops!.angular[1].support = { kind: 'plane', point: [0, 0, 0], normal: [0, 0, 1], xDirection: [1, 0, 0], tolerance: 0 }
  expect(copyRigidHingeConstraint(c).stops).toEqual(c.stops)
  c.stops!.angular[0].bodyId = 'b'
  expect(() => copyRigidHingeConstraint(c)).toThrow(/corresponding rigid owner/)
})
it('rejects wrong coordinate, absent data, wrong angular purpose and unknown fields', () => {
  const c = declaration(), stops = c.stops!
  for (const value of [{ ...c, stops: undefined }, { ...c, stops: null }, { ...c, stops: { ...stops, coordinate: 'principal-angle' } },
    { ...c, stops: { ...stops, angular: [c.axis[0], stops.angular[1]] } }, { ...c, stops: { ...stops, nominalAngle: 0 } },
    { ...c, stops: { ...stops, uncertainty: undefined } }, { ...c, stops: { angular: stops.angular, arc: stops.arc } },
    { ...c, stops: { ...stops, arc: { start: 360, sweep: 60 } } }]) expect(() => copyRigidHingeConstraint(value)).toThrow()
})
it('rejects sparse, extra-key and nonstandard arrays at every new tuple boundary', () => {
  const c = declaration(), s = c.stops!, angular = [...s.angular]
  Object.defineProperty(angular, 'extra', { enumerable: true, value: 1 })
  const inherited = [...s.angular]; Object.setPrototypeOf(inherited, Object.create(Array.prototype))
  for (const stops of [{ ...s, angular }, { ...s, angular: inherited }, { ...s, angular: [, s.angular[1]] },
    { ...s, uncertainty: [, s.uncertainty![1]] }, { ...s, uncertainty: [...s.uncertainty!, s.uncertainty![0]] }])
    expect(() => copyRigidHingeConstraint({ ...c, stops })).toThrow()
})
it('requires total finite position errors and nonnegative finite directional errors', () => {
  const c = declaration(), s = c.stops!, second = s.uncertainty![1]
  for (const first of [{ positionErrorMm: 1e-7, directionErrorRad: 0 }, { positionErrorMm: Infinity, directionErrorRad: 0 },
    { positionErrorMm: 2e-7, directionErrorRad: -1 }, { positionErrorMm: 2e-7, directionErrorRad: NaN },
    { positionErrorMm: 2e-7, directionErrorRad: 0, radiusErrorMm: 0 }])
    expect(() => copyRigidHingeConstraint({ ...c, stops: { ...s, uncertainty: [first, second] } })).toThrow()
  expect(copyRigidHingeConstraint({ ...c, stops: { ...s, uncertainty: [{ positionErrorMm: 2e-7, directionErrorRad: 0 }, second] } }).stops!.uncertainty![0].positionErrorMm).toBe(2e-7)
})
it('rejects executable stop, role, uncertainty and arc fields without invoking their getters', () => {
  let reads = 0
  const c = declaration(), s = c.stops!
  const top = { ...c, get stops() { reads++; return s } }
  const role = structuredClone(s.angular); Object.defineProperty(role, '0', { enumerable: true, get() { reads++; return s.angular[0] } })
  const uncertainty = [{ get positionErrorMm() { reads++; return 2e-7 }, directionErrorRad: 0 }, s.uncertainty![1]]
  for (const value of [top, { ...c, stops: { ...s, angular: role } }, { ...c, stops: { ...s, uncertainty } },
    { ...c, stops: { ...s, arc: { get start() { reads++; return 0 }, sweep: 90 } } }]) expect(() => copyRigidHingeConstraint(value)).toThrow()
  expect(reads).toBe(0)
})
