import { expect, it } from 'vitest'
import { validateAssemblyLimitedHingeReferenceRequest } from './assemblyLimitedHingeReferences'
import { validateAssemblyHingeReferenceRequest } from './assemblyHingeReferences'
import { validateAssemblyMate } from './assemblyDocument'

// Original declaration-only locators. Opaque keys have no current/native
// authority; physical ownership and angular observations belong to the snapshot.
const component = (id: string) => ({ occurrencePath: [id], definition: { id: 'original-leaf', revision: 'r0' } })
function face(id: string, support: 'plane' | 'axis') {
  return { kind: 'face' as const, component: component(id), body: { bodyId: 'leaf', sourceFeatureId: 'solid' },
    face: { sourceFeatureId: 'solid', key: 'original-' + support + '-face' }, support }
}
function request() {
  return { axis: [face('a', 'axis'), face('b', 'axis')], axial: [face('a', 'plane'), face('b', 'plane')], alignment: 'opposed',
    stops: { coordinate: 'directed-about-axis', angular: [face('a', 'plane'), face('b', 'plane')], arc: { start: 330, sweep: 60 } } }
}
it('detaches all six ordered declarations and explicit interval data without granting proof', () => {
  const input = request(), before = structuredClone(input), copy = validateAssemblyLimitedHingeReferenceRequest(input)
  expect(copy).toEqual(input); expect(copy.stops).not.toBe(input.stops)
  copy.stops.angular[0].component.definition.revision = 'mutated'; copy.stops.arc.start = 10
  expect(input).toEqual(before); expect(copy).not.toHaveProperty('proof'); expect(copy).not.toHaveProperty('satisfied')
})
it('keeps the unlimited request strict while admitting explicitly bounded saved mates', () => {
  const value = request(), { stops: _stops, ...unlimited } = value
  expect(validateAssemblyHingeReferenceRequest(unlimited)).toEqual(unlimited)
  expect(() => validateAssemblyHingeReferenceRequest(value)).toThrow()
  const input = { ...value, id: 'original', name: 'Explicit saved interval', type: 'hinge', suppressed: false }
  const saved = validateAssemblyMate(input)
  expect(saved).toEqual(input)
  expect(saved.type).toBe('hinge')
  if (saved.type !== 'hinge' || !saved.stops) throw Error('Expected explicit saved stops')
  expect(saved.stops).not.toBe(value.stops)
  saved.stops.arc.start = 10
  expect(value.stops.arc.start).toBe(330)
  expect(() => validateAssemblyMate({ ...input, stops: { ...value.stops, nominalAngle: 0 } })).toThrow()
})
it('requires two material planar angular faces, never principal frames or cylinder axes', () => {
  const value = request()
  for (const angular of [[{ kind: 'principal-plane', component: null, plane: 'XY' }, value.stops.angular[1]],
    [value.axis[0], value.stops.angular[1]], [{ kind: 'edge', component: component('a'), body: null, edge: { sourceFeatureId: 'solid', key: 'line' }, support: 'line' }, value.stops.angular[1]]])
    expect(() => validateAssemblyLimitedHingeReferenceRequest({ ...value, stops: { ...value.stops, angular } })).toThrow()
})
it('preserves full producer/body/revision identities and repeated owner declarations for later native checks', () => {
  const value = request(); value.stops.angular[1] = face('a', 'plane')
  value.stops.angular[0].body.sourceFeatureId = 'stale-body'
  const copy = validateAssemblyLimitedHingeReferenceRequest(value)
  expect(copy.stops.angular.map(r => r.component.occurrencePath)).toEqual([['a'], ['a']])
  expect(copy.stops.angular[0].body?.sourceFeatureId).toBe('stale-body')
  expect(copy.stops.angular[0].face.sourceFeatureId).toBe('solid')
})
it('rejects missing, undefined, extra and false coordinate/domain fields', () => {
  const value = request()
  for (const bad of [{ ...value, stops: undefined }, { ...value, stops: null }, { ...value, nominalAngle: 0 },
    { ...value, stops: { ...value.stops, coordinate: 'principal-angle' } }, { ...value, stops: { ...value.stops, units: 'radians' } },
    { ...value, stops: { ...value.stops, arc: { start: 360, sweep: 60 } } }, { ...value, stops: { ...value.stops, arc: { start: 0, sweep: -1 } } }])
    expect(() => validateAssemblyLimitedHingeReferenceRequest(bad)).toThrow()
})
it('rejects sparse and custom-prototype angular arrays without resolving or filling a role', () => {
  const value = request(), custom = [...value.stops.angular]; Object.setPrototypeOf(custom, Object.create(Array.prototype))
  const extra = [...value.stops.angular]; Object.defineProperty(extra, 'label', { enumerable: true, value: 'not data' })
  for (const angular of [[, value.stops.angular[1]], custom, extra, [value.stops.angular[0]]])
    expect(() => validateAssemblyLimitedHingeReferenceRequest({ ...value, stops: { ...value.stops, angular } })).toThrow()
})
it('rejects executable data at every added boundary without invoking getters', () => {
  const value = request(); let reads = 0
  const angular = [...value.stops.angular]; Object.defineProperty(angular, '0', { enumerable: true, get() { reads++; return value.stops.angular[0] } })
  for (const bad of [{ ...value, get stops() { reads++; return value.stops } },
    { ...value, stops: { ...value.stops, get angular() { reads++; return value.stops.angular } } },
    { ...value, stops: { ...value.stops, angular } },
    { ...value, stops: { ...value.stops, arc: { get start() { reads++; return 0 }, sweep: 60 } } }])
    expect(() => validateAssemblyLimitedHingeReferenceRequest(bad)).toThrow()
  expect(reads).toBe(0)
})
