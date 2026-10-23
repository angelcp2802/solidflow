import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, type AssemblyFaceSelection } from './kernel.assembly-snapshot'
import { measureAssemblyProfileReferences } from './kernel.assembly-profile-measurement'
import { CadEngine } from './kernel.engine'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const stamp = '2026-10-22T00:00:00.000Z'
// Original tracked-source recipes: 4x6x4 prism, radius-2 depth-4 cylinder.
function original(circle = false, centerX = 2): AssemblyDocument {
  const part = (id: string, disk: boolean) => ({ kind: 'part', id, revision: 'r1', document: { version: 1, id, name: id, units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: disk ? { kind: 'circle', center: [5, 6], radius: 2 } : { kind: 'rectangle', center: [centerX, 3], width: 4, height: 6 } },
    { id: 'solid', name: 'Original solid', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } },
  ] } })
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original ordered profile measurements', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [part('box', false), ...(circle ? [part('disk', true)] : [])], occurrences: ['a', 'b'].map((id, i) => ({ id, name: id, definition: { id: i && circle ? 'disk' : 'box', revision: 'r1' }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })), mates: [] })
}
function top(snapshot: AssemblyGeometrySnapshot, doc: AssemblyDocument, path: string[]): AssemblyFaceSelection {
  for (const selection of snapshot.listFaces(doc, path)) {
    try {
      const w = snapshot.resolveReference(doc, { ...selection, kind: 'face', support: 'plane' })
      if (w.kind === 'support' && w.localSupport.kind === 'plane' && w.localSupport.normal[2] > .99) return selection
    } catch (error) { if (!(error instanceof Error) || !error.message.includes('no coincide')) throw error }
  }
  throw Error('Original native +Z cap missing')
}
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-10)
const vector = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => near(v, b[i]))
it('measures reused rectangular profiles from two fresh native queries without changing the document', () => {
  const doc = original(); doc.occurrences[1].pose.translation = [3, 4, 12]
  const before = JSON.stringify(doc), snapshot = new AssemblyGeometrySnapshot(doc)
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
  try {
    const pair = { first: top(snapshot, doc, ['a']), second: top(snapshot, doc, ['b']) }
    const report = measureAssemblyProfileReferences(snapshot, doc, pair)
    expect(query).toHaveBeenCalledTimes(2); expect(report.status).toBe('ok')
    if (report.status !== 'ok') throw Error('Expected numerical measurement')
    vector(report.deltaMm, [3, 4, 12]); near(report.centerDistanceMm, 13); near(report.axialMm, 12)
    vector(report.transverseMm, [3, 4, 0]); near(report.transverseDistanceMm, 5)
    expect(report.profileKinds).toEqual({ first: 'rectangle', second: 'rectangle' })
    expect(report.componentPaths).toEqual({ first: ['a'], second: ['b'] }); expect(report.measurementOnly).toBe(true)
    expect(report).not.toHaveProperty('satisfied'); expect(report).not.toHaveProperty('roll')
    expect(JSON.stringify(doc)).toBe(before); expect(snapshot.listFaces(doc, ['a']).length).toBe(6)
    measureAssemblyProfileReferences(snapshot, doc, pair); expect(query).toHaveBeenCalledTimes(4)
  } finally { query.mockRestore(); snapshot.dispose() }
})
it('measures mixed rectangle/disk and repeated roles without compatibility admission', () => {
  const doc = original(true), snapshot = new AssemblyGeometrySnapshot(doc)
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
  try {
    const first = top(snapshot, doc, ['a']), second = top(snapshot, doc, ['b'])
    const r = measureAssemblyProfileReferences(snapshot, doc, { first, second })
    expect(r.status).toBe('ok'); if (r.status !== 'ok') throw Error('Expected measurement')
    vector(r.deltaMm, [3, 3, 0]); near(r.transverseDistanceMm, Math.sqrt(18)); near(r.axialMm, 0)
    expect(r.profileKinds).toEqual({ first: 'rectangle', second: 'circle' })
    const same = measureAssemblyProfileReferences(snapshot, doc, { first, second: first })
    expect(query).toHaveBeenCalledTimes(4); expect(same.status).toBe('ok')
    if (same.status !== 'ok') throw Error('Expected repeated measurement')
    vector(same.deltaMm, [0, 0, 0]); near(same.centerDistanceMm, 0)
  } finally { query.mockRestore(); snapshot.dispose() }
})
it('composes genuinely three-dimensional nested poses against literal independent world coordinates', () => {
  const doc = original(true)
  const children = doc.occurrences
  children[0].pose.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2]
  children[0].pose.translation = [10, 20, 30]
  children[1].pose.rotation = [Math.SQRT1_2, 0, 0, Math.SQRT1_2]
  children[1].pose.translation = [-2, 3, 11]
  doc.definitions.push({ kind: 'assembly', id: 'nested', revision: 'r1', name: 'Original nested frame', createdAt: stamp, updatedAt: stamp, occurrences: children, mates: [] })
  doc.occurrences = [{ id: 'outer', name: 'Outer', definition: { id: 'nested', revision: 'r1' }, pose: { translation: [100, -50, 7], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }]
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const first = top(snapshot, doc, ['outer', 'a']), second = top(snapshot, doc, ['outer', 'b'])
    first.component.occurrencePath = ['a']; second.component.occurrencePath = ['b']
    // Rz90*(2,3,4)+(10,20,30)=(7,22,34).
    // Rx90*(5,6,4)+(-2,3,11)=(3,-1,17); common outer translation cancels.
    const r = measureAssemblyProfileReferences(snapshot, doc, { first, second }, {}, ['outer'])
    expect(r.status).toBe('ok'); if (r.status !== 'ok') throw Error('Expected measurement')
    vector(r.deltaMm, [-4, -23, -17]); near(r.axialMm, -17)
    vector(r.transverseMm, [-4, -23, 0]); near(r.transverseDistanceMm, Math.sqrt(545)); near(r.centerDistanceMm, Math.sqrt(834))
    near(r.alignedAngleRad, Math.PI / 2); near(r.opposedAngleRad, Math.PI / 2)
    expect(r.componentPaths).toEqual({ first: ['outer', 'a'], second: ['outer', 'b'] }); expect(r.scopePath).toEqual(['outer'])
    expect(r.coordinateFrame).toBe('world-axes-relative-to-first-placement')
  } finally { snapshot.dispose() }
})
it('refuses requested precision after a large cancelled placement chain despite a small final placement', () => {
  const doc = original(), children = doc.occurrences
  children.forEach(c => { c.pose.translation = [-1e12, 0, 0] })
  doc.definitions.push({ kind: 'assembly', id: 'nested', revision: 'r1', name: 'Cancelled chain', createdAt: stamp, updatedAt: stamp, occurrences: children, mates: [] })
  doc.occurrences = [{ id: 'outer', name: 'Outer', definition: { id: 'nested', revision: 'r1' }, pose: { translation: [1e12, 0, 0], rotation: [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }]
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const r = measureAssemblyProfileReferences(snapshot, doc, { first: top(snapshot, doc, ['outer', 'a']), second: top(snapshot, doc, ['outer', 'b']) })
    expect(r.status).toBe('precisionLimit'); expect(snapshot.listFaces(doc, ['outer', 'a']).length).toBe(6)
  } finally { snapshot.dispose() }
})
it('does not hide unsafe far-source coordinates behind an inverse placement', () => {
  const doc = original(false, 1e6); doc.occurrences.forEach(c => { c.pose.translation = [-1e6, 0, 0] })
  const snapshot = new AssemblyGeometrySnapshot(doc)
  try {
    const pair = { first: top(snapshot, doc, ['a']), second: top(snapshot, doc, ['b']) }
    // The local extractor itself must refuse this unresolvable original center;
    // no successful substitute support or widened budget is supplied.
    expect(() => measureAssemblyProfileReferences(snapshot, doc, pair, { lengthResolutionMm: 1e-7 })).toThrow(/precisionLimit/)
    expect(() => snapshot.listFaces(doc, ['a'])).toThrow()
  } finally { snapshot.dispose() }
})
