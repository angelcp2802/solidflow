import { expect, it } from 'vitest'
import { validateAssemblyCircularPathReferenceRequest, type AssemblyCircularPathReferenceRequest } from './assemblyCircularPathReferences'

// Original syntax-only locators; opaque keys do not prove native incidence.
function original(): AssemblyCircularPathReferenceRequest {
  const component = { occurrencePath: ['outer', 'point'], definition: { id: 'original-sector', revision: 'r1' } }
  const body = { bodyId: 'sector', sourceFeatureId: 'solid' }, vertex = { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) }
  return { point: { kind: 'vertex', component, body, vertex, support: 'point' },
    path: { component: { ...component, occurrencePath: ['outer', 'path'] }, body: { ...body }, edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-arc' }, startVertex: { ...vertex } },
    position: { mode: 'free', domain: 'trim' }, orientation: { pitchYaw: 'free', roll: 'free' } }
}
for (const position of [{ mode: 'free', domain: 'trim' }, { mode: 'free', domain: 'support-circle' }, { mode: 'coordinate', distanceMm: 1e200 }] as const) it('copies explicit query syntax without inventing native length authority ' + JSON.stringify(position), () => {
  const source = original(); source.position = position
  const parsed = validateAssemblyCircularPathReferenceRequest(source)
  expect(parsed).toEqual(source); expect(parsed.point).not.toBe(source.point); expect(parsed.path.startVertex).not.toBe(source.path.startVertex)
  source.path.component.occurrencePath[0] = 'other'; expect(parsed.path.component.occurrencePath[0]).toBe('outer')
})
it('retains independent signed component Follow and a distinct material-plane UP role', () => {
  const source = original()
  source.orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: true }, roll: { mode: 'up', axis: 'z', reverse: false,
    guide: { kind: 'face', component: { occurrencePath: ['guide'], definition: { id: 'guide-source', revision: 'r1' } }, body: { bodyId: 'guide-body', sourceFeatureId: 'solid' }, face: { sourceFeatureId: 'solid', key: 'face-v1|original-plane' }, support: 'plane' } } }
  const checked = validateAssemblyCircularPathReferenceRequest(source)
  expect(checked).toEqual(source); expect(checked.orientation.roll).not.toBe(source.orientation.roll)
  expect(() => validateAssemblyCircularPathReferenceRequest({ ...source, orientation: { ...source.orientation, pitchYaw: 'free' } })).toThrow()
})
it('rejects implicit domains, percentage/wrapping policies and invalid coordinate data', () => {
  for (const position of [{ mode: 'free' }, { mode: 'free', domain: 'automatic' }, { mode: 'coordinate', distanceMm: -1 }, { mode: 'coordinate', distanceMm: Infinity },
    { mode: 'coordinate', distanceMm: NaN }, { mode: 'percent', percent: 25 }, { mode: 'coordinate', distanceMm: 1, reverse: true }]) {
    expect(() => validateAssemblyCircularPathReferenceRequest({ ...original(), position })).toThrow()
  }
  expect(() => validateAssemblyCircularPathReferenceRequest({ ...original(), type: 'circular-path' })).toThrow()
})
it('never invokes executable outer or nested query data', () => {
  let reads = 0
  for (const field of ['point', 'path', 'position', 'orientation'] as const) {
    const source = original(); Object.defineProperty(source, field, { enumerable: true, get() { reads++; return original()[field] } })
    expect(() => validateAssemblyCircularPathReferenceRequest(source)).toThrow()
  }
  const source = original(); Object.defineProperty(source.position, 'mode', { enumerable: true, get() { reads++; return 'free' } })
  expect(() => validateAssemblyCircularPathReferenceRequest(source)).toThrow(); expect(reads).toBe(0)
})
