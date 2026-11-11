import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { validateAssemblyDocument, parseAssemblyDocument, serializeAssemblyDocument, type AssemblyDocument, type AssemblyProfileCenterMate } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import type { Vec3 } from './kernel.types'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { CadEngine } from './kernel.engine'
import { prepareAssemblySolve, prepareAssemblyMotionPreview, prepareAssemblyDragPreview, applyAssemblySolvePreview, discardAssemblySolvePreview } from './kernel.assembly-solve'
import { AssemblyWorkerSession } from './kernel.assembly-session'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const stamp = '2026-10-22T00:00:00.000Z'
// Original analytical prisms: rectangular cap C[2,1,4], circular cap C[0,0,4], N+Z. A shared prototype
// gives exactly the same parameter sense to the explicitly selected two edges.
function original(rectangle = false, offOriginCircle = false): AssemblyDocument {
  const part = { kind: 'part', id: 'original-center-part', revision: 'r1', document: { version: 1, id: 'original-center-part', name: 'Original profile', units: 'mm', createdAt: stamp, updatedAt: stamp,
    features: [{ id: 'profile', name: 'Original profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: rectangle ? { kind: 'rectangle', center: [2, 1], width: 6, height: 4 } : { kind: 'circle', center: offOriginCircle ? [2, 1] : [0, 0], radius: 2 } },
    { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'prism' } }] } }
  const d = validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'original-center-root', revision: 'r1', name: 'Original profile center solve', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [part], occurrences: ['a', 'b'].map(id => ({ id, name: id, definition: { id: part.id, revision: part.revision }, pose: { ...identityRigidPose(), translation: id === 'a' ? [0, 0, 0] : [9, -6, 7] }, fixed: id === 'a', visible: true, suppressed: false })), mates: [] })
  const scene = buildAssemblyScene(d)
  const selection = (id: string): AssemblyProfileCenterMate['first'] => {
    const body = scene.bodies.find(b => b.component.occurrencePath.join('/') === id)!
    const face = body.faces.find(f => f.support?.kind === 'plane' && f.support.normal[2] > .999 && Math.abs(f.support.point[2] - 4) < 1e-10)
    if (!face) throw Error('Original cap missing')
    const edge = rectangle ? body.edges?.find(e => e.support?.kind === 'line' && e.support.axis[0] > .999 && Math.abs(e.support.point[1] + 1) < 1e-10 && Math.abs(e.support.point[2] - 4) < 1e-10) : undefined
    if (rectangle && !edge) throw Error('Original bottom X edge missing')
    return { face: structuredClone(face.selection), axis: edge ? { edge: structuredClone(edge.selection.edge), sense: 1 } : null }
  }
  d.mates.push({ id: 'center', name: 'Original center', suppressed: false, type: 'profile-center', first: selection('a'), second: selection('b'), alignment: 'aligned', offsetMm: 2,
    orientation: rectangle ? { mode: 'rectangle', quarterTurns: 0 } : { mode: 'free' } })
  return validateAssemblyDocument(d)
}
const near = (actual: readonly number[], expected: readonly number[], band = 1e-6) => { expect(actual).toHaveLength(expected.length); actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(band)) }
function basis(p: RigidPose, column: number): Vec3 {
  const [x, y, z, w] = p.rotation
  return [[1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)]][column] as Vec3
}
function ready(d: AssemblyDocument) {
  const result = prepareAssemblySolve(d)
  if (result.status !== 'ready') throw Error(result.reason + ': ' + result.message)
  expect(result.checks.every(c => c.satisfied)).toBe(true)
  return result
}
it('solves and freshly verifies a saved circular pair without inventing roll authority', () => {
  const d = original(), before = serializeAssemblyDocument(d), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
  try {
    const result = ready(d), moving = result.document.occurrences.find(o => o.id === 'b')!
    near(moving.pose.translation, [0, 0, 2]); near(basis(moving.pose as RigidPose, 2), [0, 0, 1], 1e-8)
    expect(result.scopes[0].result.rank).toBe(5); expect(result.scopes[0].result.localDOF).toBe(1)
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(6) // initial, candidate and independent final pair queries
    expect(result.profileCenters).toHaveLength(1); expect(result.profileCenters![0]).toMatchObject({ kind: 'profile-center', mateId: 'center', alignment: 'aligned', offsetMm: 2,
      orientation: { mode: 'free' }, profileKinds: { first: 'circle', second: 'circle' }, satisfied: true, boundedProfiles: true })
    expect(result.profileCenters![0].positionResidualMm).toBeLessThanOrEqual(1e-6)
    const scene = buildAssemblyScene(validateAssemblyDocument(result.document)), b = scene.bodies.find(v => v.component.occurrencePath[0] === 'b')!
    expect(b.solidCount).toBe(1); expect(Math.abs(b.volume - 16 * Math.PI)).toBeLessThan(1e-5); expect(Math.abs(b.area - 24 * Math.PI)).toBeLessThan(1e-5)
    near(b.bounds.min, [-2, -2, 2]); near(b.bounds.max, [2, 2, 6]); expect(serializeAssemblyDocument(d)).toBe(before)
    discardAssemblySolvePreview(result)
  } finally { query.mockRestore() }
})
it('checks an off-origin circular center physically while preserving its genuine spin gauge', () => {
  const d = original(false, true), result = ready(d), b = result.document.occurrences[1].pose as RigidPose
  // T is not unique: a free Z spin also moves the off-origin local center.
  // Check the literal physical cap center instead of inventing a unique pose.
  const x = basis(b, 0), y = basis(b, 1), z = basis(b, 2)
  near(b.translation.map((v, i) => v + 2 * x[i] + y[i] + 4 * z[i]), [2, 1, 6])
  near(z, [0, 0, 1], 1e-8); expect(result.scopes[0].result.localDOF).toBe(1)
  const native = buildAssemblyScene(validateAssemblyDocument(result.document)).bodies.find(v => v.component.occurrencePath[0] === 'b')!
  near(native.bounds.min, [0, -1, 2]); near(native.bounds.max, [4, 3, 6]); discardAssemblySolvePreview(result)
})
it.each((['aligned', 'opposed'] as const).flatMap(alignment => ([0, 1, 2, 3] as const).map(q => ({ alignment, q }))))('solves original rectangular $alignment q=$q with literal pose bases and native material bounds', ({ alignment, q }) => {
  const d = original(true), m = d.mates[0]
  if (m.type !== 'profile-center') throw Error('Original profile required')
  m.alignment = alignment; m.orientation = { mode: 'rectangle', quarterTurns: q }
  const before = serializeAssemblyDocument(d), result = ready(d), b = result.document.occurrences.find(o => o.id === 'b')!, sign = alignment === 'aligned' ? 1 : -1
  const translations = alignment === 'aligned' ? [[0, 0, 2], [3, -1, 2], [4, 2, 2], [1, 3, 2]] : [[0, 2, 10], [1, -1, 10], [4, 0, 10], [3, 3, 10]]
  near(b.pose.translation, translations[q]); near(basis(b.pose as RigidPose, 0), [[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0]][q], 1e-8)
  near(basis(b.pose as RigidPose, 1), [[0, sign, 0], [-sign, 0, 0], [0, -sign, 0], [sign, 0, 0]][q], 1e-8); near(basis(b.pose as RigidPose, 2), [0, 0, sign], 1e-8)
  expect(result.scopes[0].result.rank).toBe(6); expect(result.scopes[0].result.localDOF).toBe(0)
  const report = result.profileCenters![0]; expect(report.orientation).toEqual(m.orientation); expect(report.profileKinds).toEqual({ first: 'rectangle', second: 'rectangle' })
  expect(report.positionResidualMm).toBeLessThanOrEqual(1e-6); expect(report.normalAngleRadians).toBeLessThanOrEqual(1e-8); expect(report.rectangleAngleRadians).toBeLessThanOrEqual(1e-8)
  const scene = buildAssemblyScene(validateAssemblyDocument(result.document)), native = scene.bodies.find(v => v.component.occurrencePath[0] === 'b')!
  expect(native.solidCount).toBe(1); expect(Math.abs(native.volume - 96)).toBeLessThan(1e-5); expect(Math.abs(native.area - 128)).toBeLessThan(1e-5)
  near(native.bounds.min, q % 2 ? [0, -2, sign === 1 ? 2 : 6] : [-1, -1, sign === 1 ? 2 : 6]); near(native.bounds.max, q % 2 ? [4, 4, sign === 1 ? 6 : 10] : [5, 3, sign === 1 ? 6 : 10])
  expect(serializeAssemblyDocument(d)).toBe(before); discardAssemblySolvePreview(result)
})
it('retains saved intent through authenticated Apply, history and fresh reopening, rejecting copied or consumed capability', () => {
  const d = original(true), history = new AssemblyDocumentHistory(d), result = ready(d)
  expect(() => applyAssemblySolvePreview(history, structuredClone(result))).toThrow()
  const applied = applyAssemblySolvePreview(history, result), saved = serializeAssemblyDocument(applied)
  expect(() => applyAssemblySolvePreview(history, result)).toThrow(); expect(history.undo()).toEqual(d); expect(history.redo()).toEqual(applied)
  const opened = parseAssemblyDocument(saved), again = ready(opened)
  expect(again.document.mates).toEqual(applied.mates); near(again.document.occurrences[1].pose.translation, [0, 0, 2])
  expect(serializeAssemblyDocument(opened)).toBe(saved); discardAssemblySolvePreview(again)
})
it('rejects incompatible simultaneous profile offsets atomically with no document mutation', () => {
  const d = original(true), m = d.mates[0]
  if (m.type !== 'profile-center') throw Error('Original profile required')
  d.mates.push({ ...structuredClone(m), id: 'conflict', offsetMm: 3 })
  const before = serializeAssemblyDocument(d), result = prepareAssemblySolve(d)
  expect(result.status).toBe('rejected'); expect(serializeAssemblyDocument(d)).toBe(before)
})
it('requires current joint boundary membership and never falls back to plane/coincident purpose', () => {
  const d = original(true), m = d.mates[0]
  if (m.type !== 'profile-center' || !m.second.axis) throw Error('Original material axis required')
  const scene = buildAssemblyScene(d), wrong = scene.bodies.find(b => b.component.occurrencePath[0] === 'b')!.edges!.find(e => e.support?.kind === 'line' && Math.abs(e.support.point[2]) < 1e-10)!
  m.second.axis.edge = structuredClone(wrong.selection.edge)
  const before = serializeAssemblyDocument(d), snapshot = new AssemblyGeometrySnapshot(d)
  try { expect(() => snapshot.resolveActiveMates(d)).toThrow() } finally { snapshot.dispose() }
  expect(prepareAssemblySolve(d).status).toBe('rejected'); expect(serializeAssemblyDocument(d)).toBe(before)
})
it('transports detached profile reports through worker previews without trusting mutated DTOs as Apply authority', () => {
  const proposed = original(true), base = validateAssemblyDocument({ ...proposed, mates: [] }), before = serializeAssemblyDocument(base), session = new AssemblyWorkerSession()
  const reply = session.prepare(base, proposed)
  if (reply.status !== 'ready') throw Error(reply.message)
  expect(reply.profileCenters).toHaveLength(1); expect(reply.profileCenters![0].positionResidualMm).toBeLessThanOrEqual(1e-6)
  reply.profileCenters![0].positionResidualMm = 999
  reply.document.occurrences[1].pose.translation[0] = 999
  const m = reply.document.mates[0]; if (m.type !== 'profile-center') throw Error('Original profile expected'); m.offsetMm = 999
  const applied = session.apply(base, reply.token), actual = applied.document.mates[0]
  if (actual.type !== 'profile-center') throw Error('Actual saved profile expected')
  expect(actual.offsetMm).toBe(2); near(applied.document.occurrences[1].pose.translation, [0, 0, 2]); expect(serializeAssemblyDocument(base)).toBe(before)
  expect(() => session.apply(base, reply.token)).toThrow()
})
it('withholds a worker token when a fresh independent native final query fails and revokes the older preview', () => {
  const proposed = original(true), base = validateAssemblyDocument({ ...proposed, mates: [] }), before = serializeAssemblyDocument(base), session = new AssemblyWorkerSession()
  const earlier = session.prepare(base, proposed); if (earlier.status !== 'ready') throw Error(earlier.message)
  const originalQuery = CadEngine.prototype.inspectCurrentProfileAxisSupport; let calls = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileAxisSupport').mockImplementation(function (this: CadEngine, ...args) {
    if (++calls === 5) throw Error('Original independent final-query fault')
    return originalQuery.apply(this, args)
  })
  try {
    const rejected = session.prepare(base, proposed)
    expect(calls).toBe(5); expect(rejected.status).toBe('rejected'); expect('token' in rejected).toBe(false)
    expect(() => session.apply(base, earlier.token)).toThrow(); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { query.mockRestore(); session.discard() }
})
it('retains independent profile reports in both sampled circular spin and constrained drag previews', () => {
  const initial = ready(original()), d = validateAssemblyDocument(initial.document); discardAssemblySolvePreview(initial)
  const component = { occurrencePath: ['b'], definition: { ...d.occurrences[1].definition } }
  const motion = prepareAssemblyMotionPreview(d, { component, translation: [0, 0, 2], rotation: { axis: 2, angle: Math.PI } })
  if (motion.status !== 'ready') throw Error(motion.message)
  expect(motion.motion!.verifiedStations).toBe(3); expect(motion.profileCenters).toHaveLength(1); expect(motion.profileCenters![0].satisfied).toBe(true)
  near(basis(motion.document.occurrences[1].pose as RigidPose, 0), [-1, 0, 0], 1e-8); discardAssemblySolvePreview(motion)
  const drag = prepareAssemblyDragPreview(d, { component, pose: { translation: [0, 0, 2], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, mode: 'rotate' })
  if (drag.status !== 'ready') throw Error(drag.message)
  expect(drag.profileCenters).toHaveLength(1); expect(drag.profileCenters![0].satisfied).toBe(true)
  near(basis(drag.document.occurrences[1].pose as RigidPose, 0), [0, 1, 0], 1e-6); discardAssemblySolvePreview(drag)
})
it('solves a reused child definition locally and verifies both noncommuting world occurrences afresh', () => {
  const child = original(true), { version: _v, units: _u, definitions, ...nested } = child
  const parent = validateAssemblyDocument({ ...child, id: 'parent', mates: [], definitions: [...definitions, nested], occurrences: [
    { id: 'left', name: 'Left', definition: { id: nested.id, revision: nested.revision }, pose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, suppressed: false, visible: true },
    { id: 'right', name: 'Right', definition: { id: nested.id, revision: nested.revision }, pose: { translation: [-10, 0, 0], rotation: [0, Math.sqrt(.2), 0, Math.sqrt(.8)] }, fixed: false, suppressed: false, visible: true },
  ] })
  const before = serializeAssemblyDocument(parent), result = ready(parent), reports = result.profileCenters!
  expect(reports).toHaveLength(2); expect(reports.map(r => r.scopePath)).toEqual([['left'], ['right']])
  expect(reports.map(r => r.componentPaths.second)).toEqual([['left', 'b'], ['right', 'b']])
  expect(result.scopes.find(s => s.definition.id === 'parent')!.result.localDOF).toBe(12)
  expect(result.scopes.find(s => s.definition.id === nested.id)!.result.localDOF).toBe(0)
  const scene = buildAssemblyScene(validateAssemblyDocument(result.document))
  expect(scene.prototypeCount).toBe(1); expect(scene.solidCount).toBe(4)
  expect(Math.abs(scene.volume - 384)).toBeLessThan(1e-5); expect(Math.abs(scene.area - 512)).toBeLessThan(1e-5)
  const left = scene.bodies.find(b => b.component.occurrencePath.join('/') === 'left/b')!, right = scene.bodies.find(b => b.component.occurrencePath.join('/') === 'right/b')!
  near(left.bounds.min, [7, 19, 32]); near(left.bounds.max, [11, 25, 36]); near(right.bounds.min, [-9, -1, -2.8]); near(right.bounds.max, [-2.2, 3, 4.4])
  expect(serializeAssemblyDocument(parent)).toBe(before); discardAssemblySolvePreview(result)
})
it('preserves common rigid freedom for a satisfied profile relation whose two supports share one owner', () => {
  const child = original(true), parentMate = structuredClone(child.mates[0]); if (parentMate.type !== 'profile-center') throw Error('Original profile required')
  child.mates = []; child.occurrences[1].pose = { ...identityRigidPose(), translation: [0, 0, 2] }; child.occurrences[1].fixed = true
  const { version: _v, units: _u, definitions, ...nested } = child
  parentMate.first.face.component.occurrencePath = ['group', 'a']; parentMate.second.face.component.occurrencePath = ['group', 'b']
  const parent = validateAssemblyDocument({ ...child, id: 'parent-owner', definitions: [...definitions, nested], mates: [parentMate], occurrences: [
    { id: 'group', name: 'Rigid group', definition: { id: nested.id, revision: nested.revision }, pose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false },
  ] })
  const result = ready(parent), scope = result.scopes.find(s => s.definition.id === 'parent-owner')!
  expect(scope.result.rank).toBe(0); expect(scope.result.localDOF).toBe(6); expect(result.profileCenters).toHaveLength(1)
  expect(result.document.occurrences[0].pose).toEqual(parent.occurrences[0].pose); discardAssemblySolvePreview(result)
})
