import { expect, it } from 'vitest'
import { assemblyDirectionMateAngle, assemblyDirectionMateObjective, assemblyDirectionReferenceKind,
  type AssemblyDirectionAlignment, type AssemblyDirectionMateType, type AssemblyDirectionSupportKind } from './assemblyDirectionMates'
import type { AssemblyGeometryReference } from './assemblyDocument'

// Independent geometric table: planes use normals, cylinders and LINE use axes.
const pairs: [AssemblyDirectionSupportKind, AssemblyDirectionSupportKind, AssemblyDirectionMateType][] = [
  ['plane', 'plane', 'parallel'], ['plane', 'cylinder', 'perpendicular'], ['plane', 'line', 'perpendicular'],
  ['cylinder', 'plane', 'perpendicular'], ['cylinder', 'cylinder', 'parallel'], ['cylinder', 'line', 'parallel'],
  ['line', 'plane', 'perpendicular'], ['line', 'cylinder', 'parallel'], ['line', 'line', 'parallel'],
]
const cases = pairs.flatMap(([first, second, collinear]) => [
  { first, second, type: collinear, alignment: 'aligned' as AssemblyDirectionAlignment, objective: 'collinear', angle: 0 },
  { first, second, type: collinear, alignment: 'opposed' as AssemblyDirectionAlignment, objective: 'collinear', angle: 180 },
  { first, second, type: (collinear === 'parallel' ? 'perpendicular' : 'parallel') as AssemblyDirectionMateType,
    alignment: null, objective: 'orthogonal', angle: 90 },
])
it.each(cases)('classifies $type $first/$second/$alignment without a uniform normal-angle shortcut', item => {
  expect(assemblyDirectionMateObjective(item.type, item.first, item.second)).toBe(item.objective)
  expect(assemblyDirectionMateAngle(item.type, item.first, item.second, item.alignment)).toBe(item.angle)
})
it.each([null, undefined, 'either', true, 0])('requires a declared collinear branch rather than defaulting %s', value => {
  expect(() => assemblyDirectionMateAngle('parallel', 'line', 'cylinder', value)).toThrow('requires aligned or opposed')
})
it.each(['aligned', 'opposed', undefined, true, 90])('rejects inert alignment %s for an orthogonal relation', value => {
  expect(() => assemblyDirectionMateAngle('parallel', 'plane', 'line', value)).toThrow('requires null alignment')
})
it.each(['sphere', '', null])('rejects unknown native support kind %s on either side', kind => {
  expect(() => assemblyDirectionMateObjective('parallel', kind as never, 'plane')).toThrow('support kind')
  expect(() => assemblyDirectionMateObjective('perpendicular', 'line', kind as never)).toThrow('support kind')
})
it('rejects an unknown family rather than deriving an accidental target', () => {
  expect(() => assemblyDirectionMateAngle('angle' as never, 'plane', 'line', null)).toThrow('family')
})
it.each([
  [{ kind: 'principal-plane', component: null, plane: 'XY' }, 'plane'],
  [{ kind: 'face', support: 'plane' }, 'plane'], [{ kind: 'face', support: 'axis' }, 'cylinder'], [{ kind: 'edge', support: 'line' }, 'line'],
] as const)('classifies saved intent without attesting topology %#', (reference, kind) => {
  expect(assemblyDirectionReferenceKind(reference as unknown as AssemblyGeometryReference)).toBe(kind)
})
it.each([{ kind: 'face', support: 'line' }, { kind: 'edge', support: 'axis' }, { kind: 'component' }])('rejects an incompatible reference declaration %#', reference => {
  expect(() => assemblyDirectionReferenceKind(reference as unknown as AssemblyGeometryReference)).toThrow()
})
it.each(['kind', 'support'])('does not execute a %s getter during standalone classification', name => {
  let called = false
  const reference = { kind: 'face', support: 'axis' }
  Object.defineProperty(reference, name, { get: () => { called = true; return 'axis' } })
  expect(() => assemblyDirectionReferenceKind(reference as AssemblyGeometryReference)).toThrow('own data')
  expect(called).toBe(false)
})
