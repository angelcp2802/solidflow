import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import fixture from './fixtures/assembly-material-arc-original.json'
import { validateAssemblyDocument, serializeAssemblyDocument, parseAssemblyDocument, type AssemblyDocument, type AssemblyCircularPathMate } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose, transformRigidPoint, type RigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference } from './kernel.assembly-types'
import { prepareAssemblySolve, prepareAssemblyDragPreview, prepareAssemblyMovePreview, prepareAssemblyMotionPreview,
  prepareAssemblyTranslationPreview, applyAssemblySolvePreview, discardAssemblySolvePreview } from './kernel.assembly-solve'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { CadEngine } from './kernel.engine'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const near = (a: readonly number[], b: readonly number[], band = 1e-6) => a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThanOrEqual(band))
function mate(d: AssemblyDocument): AssemblyCircularPathMate {
  const m = d.mates.find(m => m.type === 'circular-path')
  if (!m || m.type !== 'circular-path') throw Error('Missing original circular declaration')
  return m
}
function original(reverse = false, pointPath = ['b'], document?: AssemblyDocument) {
  const d = document ?? validateAssemblyDocument(fixture)
  if (!document) d.occurrences[1].pose.translation = [4, 1, -1]
  const scene = buildAssemblyScene(d), path = scene.bodies.find(b => b.component.occurrencePath.join('/') === 'a')!,
    point = scene.bodies.find(b => b.component.occurrencePath.join('/') === pointPath.join('/'))!, snapshot = new AssemblyGeometrySnapshot(d)
  try {
    const arcs = path.edges!.filter(e => !e.support).filter(e => {
      const observed = snapshot.resolvePathCurveSelection(d, { ...e.selection, sense: 1 }).localCurve
      return observed.kind === 'circle' && !observed.closed && Math.abs(observed.center[2] - 4) < 1e-12
    })
    const P = reverse ? [3, 0, 4] : [5, -2, 4], start = path.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - P[i]) < 1e-12))!,
      chosen = point.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [3, -2, 4][i]) < 1e-12))!
    expect(arcs).toHaveLength(1)
    const selection = { ...structuredClone(arcs[0].selection), startVertex: { ...start.selection.vertex } }, length = snapshot.resolveArcPathSelection(d, selection).localCurve.lengthMm
    d.mates.push({ id: 'original-circular', name: 'Original material quarter arc', type: 'circular-path', suppressed: false,
      point: { kind: 'vertex', ...structuredClone(chosen.selection), support: 'point' }, path: selection,
      position: { mode: 'free', domain: 'trim' }, orientation: { pitchYaw: 'free', roll: 'free' } })
    return { d: validateAssemblyDocument(d), length }
  } finally { snapshot.dispose() }
}
function upOriginal(reverse = false) {
  const { d, length } = original()
  d.occurrences.push({ ...structuredClone(d.occurrences[0]), id: 'g', name: 'Original material guide', pose: { ...identityRigidPose(), translation: [20, -10, 0] } })
  const b = buildAssemblyScene(d).bodies.find(b => b.component.occurrencePath[0] === 'g')!,
    f = b.faces.find(f => f.support?.kind === 'plane' && f.support.normal[2] > .999 && Math.abs(f.support.point[2] - 4) < 1e-10)!, guide = assemblySceneFaceReference(f)
  if (!guide || guide.support !== 'plane') throw Error('Original top guide missing')
  mate(d).orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: { mode: 'up', axis: 'z', reverse, guide: { ...guide, support: 'plane' } } }
  return { d, length }
}
function ready(d: AssemblyDocument) {
  const r = prepareAssemblySolve(d)
  if (r.status !== 'ready') throw Error(r.reason + ': ' + r.message)
  expect(r.circularPaths).toBeDefined()
  return r
}
function actualPoint(d: AssemblyDocument, path: string[] = []) {
  const snapshot = new AssemblyGeometrySnapshot(d)
  try { return [...snapshot.resolveVertexReference(d, mate(d).point, path).worldSupport.point] }
  finally { snapshot.dispose() }
}
function geometry(d: AssemblyDocument, count = 2) {
  const scene = buildAssemblyScene(d)
  expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(count); expect(scene.prototypeCount).toBe(1)
  expect(Math.abs(scene.volume - count * 4 * Math.PI)).toBeLessThan(1e-5)
  expect(Math.abs(scene.area - count * (6 * Math.PI + 16))).toBeLessThan(1e-5)
  for (const b of scene.bodies) { expect(b.solidCount).toBe(1); expect(Math.abs(b.volume - 4 * Math.PI)).toBeLessThan(1e-5); expect(Math.abs(b.area - (6 * Math.PI + 16))).toBeLessThan(1e-5) }
}
for (const domain of ['trim', 'support-circle'] as const) it('saves explicit Free ' + domain + ' with independent current-native report and unchanged input', () => {
  const { d } = original(); mate(d).position = { mode: 'free', domain }
  const before = serializeAssemblyDocument(d), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath')
  try {
    const r = ready(d), report = r.circularPaths![0]
    expect(r.circularPaths).toHaveLength(1); expect(report).toMatchObject({ kind: 'circular-path', status: 'ok', satisfied: true,
      mateId: 'original-circular', scopePath: [], componentPaths: { point: ['b'], path: ['a'] }, position: { mode: 'free', domain },
      uncertaintyModel: 'current-native-analytic-float64', verificationOnly: true, compatibilityAuthority: false })
    expect(report.precision.positionErrorMm).toBeGreaterThan(0); expect(report.topologyTolerancesMm.point).toBeGreaterThan(0)
    expect(report.positionResidualMm + report.precision.positionErrorMm).toBeLessThanOrEqual(1e-6)
    expect(r.scopes[0].result.rank).toBe(2); expect(r.scopes[0].result.localDOF).toBe(4)
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(3); geometry(validateAssemblyDocument(r.document))
    expect(serializeAssemblyDocument(d)).toBe(before); discardAssemblySolvePreview(r)
  } finally { query.mockRestore() }
})
for (const reverse of [false, true]) for (const fraction of [0, .5, 1]) it('saved native fixed coordinate fraction=' + fraction + ' opposite material endpoint=' + reverse, () => {
  const { d, length } = original(reverse); mate(d).position = { mode: 'coordinate', distanceMm: length * fraction }
  mate(d).orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: 'free' }
  const r = ready(d), candidate = validateAssemblyDocument(r.document), report = r.circularPaths![0], fromA = reverse ? 1 - fraction : fraction,
    P = fromA === 0 ? [5, -2, 4] : fromA === 1 ? [3, 0, 4] : [3 + Math.SQRT2, -2 + Math.SQRT2, 4]
  near(actualPoint(candidate), P); expect(report.targetCoordinateMm).toBe(length * fraction)
  expect(report.coordinateMm).toBe(length * fraction); expect(report.orientationResidualRad! + report.precision.orientationErrorRad!).toBeLessThanOrEqual(1e-8)
  const scene = buildAssemblyScene(candidate), b = scene.bodies.find(b => b.component.occurrencePath[0] === 'b')!,
    C = b.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [3, -2, 4][i]) < 1e-12))!,
    A = b.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [5, -2, 4][i]) < 1e-12))!,
    T = fromA === 0 ? [0, 1, 0] : fromA === 1 ? [-1, 0, 0] : [-Math.SQRT1_2, Math.SQRT1_2, 0]
  near(A.worldPoint.map((v, i) => (v - C.worldPoint[i]) / 2), T.map(v => reverse ? -v : v), 1e-8)
  geometry(candidate); discardAssemblySolvePreview(r)
})
for (const reverse of [false, true]) it('saved Free Follow plus actual third-owner UP reverse=' + reverse, () => {
  const { d } = upOriginal(reverse), r = ready(d), report = r.circularPaths![0]
  expect(report.componentPaths).toEqual({ point: ['b'], path: ['a'], up: ['g'] })
  expect(report.rollResidualRad! + report.precision.rollErrorRad!).toBeLessThanOrEqual(1e-8)
  expect(report.orientation).toEqual(mate(d).orientation)
  const candidate = validateAssemblyDocument(r.document), b = buildAssemblyScene(candidate).bodies.find(b => b.component.occurrencePath[0] === 'b')!,
    top = b.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [3, -2, 4][i]) < 1e-12))!,
    bottom = b.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [3, -2, 0][i]) < 1e-12))!
  near(top.worldPoint.map((v, i) => (v - bottom.worldPoint[i]) / 4), [0, 0, reverse ? -1 : 1], 1e-8)
  geometry(candidate, 3); discardAssemblySolvePreview(r)
})
it('authenticates saved Apply/history and fresh roundtrip without copied or consumed capability', () => {
  const { d, length } = original(); mate(d).position = { mode: 'coordinate', distanceMm: length / 2 }
  const history = new AssemblyDocumentHistory(d), r = ready(d)
  expect(() => applyAssemblySolvePreview(history, structuredClone(r))).toThrow()
  const applied = applyAssemblySolvePreview(history, r)
  near(actualPoint(applied), [3 + Math.SQRT2, -2 + Math.SQRT2, 4]); expect(history.undo()).toEqual(d); expect(history.redo()).toEqual(applied)
  expect(() => applyAssemblySolvePreview(history, r)).toThrow()
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), again = ready(reopened)
  expect(again.circularPaths![0].position).toEqual(mate(d).position); geometry(validateAssemblyDocument(again.document)); discardAssemblySolvePreview(again)
})
it('worker owns exact private candidate despite altered report/document DTO, and rejects stale/cancelled tokens', () => {
  const { d, length } = original(); mate(d).position = { mode: 'coordinate', distanceMm: length / 2 }
  const base = validateAssemblyDocument({ ...d, mates: [] }), session = new AssemblyWorkerSession(), reply = session.prepare(base, d)
  if (reply.status !== 'ready') throw Error(reply.message)
  expect(reply.circularPaths).toHaveLength(1); reply.circularPaths![0].coordinateMm = 999; reply.document.occurrences[1].pose.translation[0] = 999
  const applied = session.apply(base, reply.token).document; near(actualPoint(applied), [3 + Math.SQRT2, -2 + Math.SQRT2, 4])
  expect(() => session.apply(base, reply.token)).toThrow()
  const next = session.prepare(base, d); if (next.status !== 'ready') throw Error(next.message)
  const stale = validateAssemblyDocument(base); stale.name = 'Changed exact committed base'
  expect(() => session.apply(stale, next.token)).toThrow()
  const cancelled = session.prepare(base, d); if (cancelled.status !== 'ready') throw Error(cancelled.message)
  session.discard(); expect(() => session.apply(base, cancelled.token)).toThrow(); expect(() => session.apply(base, 'forged')).toThrow()
})
it('suppressed and deleted declarations publish no active arc report and preserve exact saved intent', () => {
  const { d } = original(); mate(d).suppressed = true
  const suppressed = prepareAssemblySolve(d); if (suppressed.status !== 'ready') throw Error(suppressed.message)
  expect(suppressed.circularPaths ?? []).toEqual([]); expect(suppressed.document.mates).toEqual(d.mates); discardAssemblySolvePreview(suppressed)
  d.mates = []; const deleted = prepareAssemblySolve(d); if (deleted.status !== 'ready') throw Error(deleted.message)
  expect(deleted.circularPaths ?? []).toEqual([]); discardAssemblySolvePreview(deleted)
})
it('rejects conflicting coordinates and an exterior actual-trim request atomically', () => {
  const { d, length } = original(); mate(d).position = { mode: 'coordinate', distanceMm: length / 4 }
  const other = structuredClone(mate(d)); other.id = 'conflict'; other.position = { mode: 'coordinate', distanceMm: length * .75 }; d.mates.push(other)
  const before = serializeAssemblyDocument(d); expect(prepareAssemblySolve(d).status).toBe('rejected'); expect(serializeAssemblyDocument(d)).toBe(before)
  d.mates.pop(); mate(d).position = { mode: 'coordinate', distanceMm: length + 1e-6 }
  const r = prepareAssemblySolve(d); expect(r.status).toBe('rejected'); expect(r).not.toHaveProperty('token')
})
it('invalidates prior worker capability when independent final arc querying fails', () => {
  const { d } = original(), base = validateAssemblyDocument({ ...d, mates: [] }), session = new AssemblyWorkerSession(), prior = session.prepare(base, d)
  if (prior.status !== 'ready') throw Error(prior.message)
  const current = CadEngine.prototype.inspectCurrentArcPath; let calls = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath').mockImplementation(function (this: CadEngine, ...args) {
    if (++calls === 3) throw Error('Original final arc query fault')
    return current.apply(this, args)
  })
  try { expect(session.prepare(base, d).status).toBe('rejected'); expect(calls).toBe(3); expect(() => session.apply(base, prior.token)).toThrow() }
  finally { query.mockRestore() }
})
it('fresh physical reports accompany projected endpoint/interior movement without inheriting a continuous translation proof', () => {
  const { d, length } = upOriginal(); mate(d).position = { mode: 'coordinate', distanceMm: length / 2 }
  const initial = ready(d); let candidate = validateAssemblyDocument(initial.document); discardAssemblySolvePreview(initial)
  // Establish a measured interior start, then release only the coordinate.
  // Free initialization may already choose the first endpoint; that is not a
  // real movement and the editor correctly rejects it as an unchanged target.
  mate(candidate).position = { mode: 'free', domain: 'trim' }
  const released = ready(candidate); candidate = validateAssemblyDocument(released.document); discardAssemblySolvePreview(released)
  near(actualPoint(candidate), [3 + Math.SQRT2, -2 + Math.SQRT2, 4])
  const component = { occurrencePath: ['b'], definition: { ...candidate.occurrences[1].definition } }
  for (const [P, angle] of [[[5, -2, 4], Math.PI / 2], [[3 + Math.SQRT2, -2 + Math.SQRT2, 4], 3 * Math.PI / 4]] as const) {
    const rotation: RigidPose['rotation'] = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)], rotated = transformRigidPoint({ ...identityRigidPose(), rotation }, [3, -2, 4]),
      pose: RigidPose = { rotation, translation: P.map((x, i) => x - rotated[i]) as RigidPose['translation'] }
    const drag = prepareAssemblyDragPreview(candidate, { component, mode: 'translate', pose })
    if (drag.status !== 'ready') throw Error(drag.message)
    expect(drag.circularPaths).toHaveLength(1); expect(drag.projection!.evidence.localOnly).toBe(true)
    candidate = validateAssemblyDocument(drag.document); near(actualPoint(candidate), P); geometry(candidate, 3); discardAssemblySolvePreview(drag)
    const moved = prepareAssemblyMovePreview(candidate, { component, pose }); if (moved.status !== 'ready') throw Error(moved.message)
    expect(moved.circularPaths![0].satisfied).toBe(true); discardAssemblySolvePreview(moved)
  }
  const rejected = prepareAssemblyTranslationPreview(candidate, { component, translation: [...candidate.occurrences[1].pose.translation] })
  expect(rejected.status).toBe('rejected')
})

it('solves one saved source declaration and independently verifies both proper-3D reused scope instances', () => {
  const { d: child, length } = original(); mate(child).position = { mode: 'coordinate', distanceMm: length / 2 }
  const { version: _version, units: _units, definitions, ...embedded } = child
  const parent = validateAssemblyDocument({ ...child, id: 'original-reuse-parent', mates: [], definitions: [...definitions, embedded], occurrences: [
    { id: 'left', name: 'Original Rz90 instance', definition: { id: child.id, revision: child.revision }, pose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false },
    { id: 'right', name: 'Original Rx90 instance', definition: { id: child.id, revision: child.revision }, pose: { translation: [-10, -20, -30], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false },
  ] })
  const r = ready(parent), candidate = validateAssemblyDocument(r.document), scene = buildAssemblyScene(candidate)
  expect(r.circularPaths).toHaveLength(2); expect(r.circularPaths!.map(p => p.scopePath)).toEqual([['left'], ['right']])
  expect(r.circularPaths!.map(p => p.componentPaths)).toEqual([{ point: ['left', 'b'], path: ['left', 'a'] }, { point: ['right', 'b'], path: ['right', 'a'] }])
  const x = 3 + Math.SQRT2, y = -2 + Math.SQRT2
  for (const [id, P] of [['left', [10 - y, 20 + x, 34]], ['right', [-10 + x, -24, -30 + y]]] as const) {
    const b = scene.bodies.find(b => b.component.occurrencePath.join('/') === id + '/b')!, v = b.vertexPoints!.find(v => v.point.every((q, i) => Math.abs(q - [3, -2, 4][i]) < 1e-12))!
    near(v.worldPoint, P)
  }
  geometry(candidate, 4); discardAssemblySolvePreview(r)
})

it('retains one shared root rigid owner instead of inventing independent descendant freedom', () => {
  const { d: child } = original(), declared = structuredClone(mate(child)); child.mates = []
  child.occurrences[1].pose = { ...identityRigidPose(), translation: [2, 0, 0] }; child.occurrences[1].fixed = true
  const { version: _version, units: _units, definitions, ...embedded } = child
  declared.point.component.occurrencePath = ['group', 'b']; declared.path.component.occurrencePath = ['group', 'a']
  const parent = validateAssemblyDocument({ ...child, id: 'original-shared-parent', definitions: [...definitions, embedded], mates: [declared], occurrences: [
    { id: 'group', name: 'One original rigid owner', definition: { id: child.id, revision: child.revision }, pose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false },
  ] })
  const r = ready(parent), scope = r.scopes.find(s => s.definition.id === parent.id)!
  expect(scope.result.rank).toBe(0); expect(scope.result.localDOF).toBe(6); expect(r.document.occurrences[0].pose).toEqual(parent.occurrences[0].pose)
  expect(r.circularPaths![0].componentPaths).toEqual({ point: ['group', 'b'], path: ['group', 'a'] })
  near(actualPoint(validateAssemblyDocument(r.document)), [12, 25, 34]); discardAssemblySolvePreview(r)
})

it('carries fresh arc reports through actual sampled rotation stations of a nested material-point frame', () => {
  const document = validateAssemblyDocument(fixture), part = document.definitions[0]
  document.definitions.push({ kind: 'assembly', id: 'original-point-frame', revision: 'r1', name: 'Original material-origin frame', createdAt: document.createdAt, updatedAt: document.updatedAt, mates: [], occurrences: [
    { id: 'inner', name: 'Original shifted sector', definition: { id: part.id, revision: part.revision }, pose: { ...identityRigidPose(), translation: [-3, 2, -4] }, fixed: true, visible: true, suppressed: false },
  ] })
  document.occurrences[1].definition = { id: 'original-point-frame', revision: 'r1' }; document.occurrences[1].pose.translation = [5, -2, 4]
  const { d } = original(false, ['b', 'inner'], document), component = { occurrencePath: ['b'], definition: { ...d.occurrences[1].definition } }
  const r = prepareAssemblyMotionPreview(d, { component, translation: [5, -2, 4], rotation: { axis: 2, angle: Math.PI / 2 } })
  if (r.status !== 'ready') throw Error(r.message)
  expect(r.motion!.sampledOnly).toBe(true); expect(r.motion!.stationCount).toBeGreaterThanOrEqual(2)
  expect(r.motion!.verifiedStations).toBe(r.motion!.stationCount); expect(r.circularPaths).toHaveLength(1)
  expect(r.circularPaths![0].componentPaths.point).toEqual(['b', 'inner'])
  near(actualPoint(validateAssemblyDocument(r.document)), [5, -2, 4]); geometry(validateAssemblyDocument(r.document)); discardAssemblySolvePreview(r)
})

it('refuses huge original cancelled chains before publishing saved native evidence', () => {
  const { d: child } = original(); child.occurrences.forEach(o => { o.pose.translation[0] -= 1e16 })
  const { version: _version, units: _units, definitions, ...embedded } = child
  const d = validateAssemblyDocument({ ...child, id: 'original-cancelled-parent', mates: [], definitions: [...definitions, embedded], occurrences: [
    { id: 'outer', name: 'Original cancelled placement', definition: { id: child.id, revision: child.revision }, pose: { ...identityRigidPose(), translation: [1e16, 0, 0] }, fixed: false, visible: true, suppressed: false },
  ] })
  const before = serializeAssemblyDocument(d), r = prepareAssemblySolve(d)
  expect(r.status).toBe('rejected'); expect(r).not.toHaveProperty('circularPaths'); expect(serializeAssemblyDocument(d)).toBe(before)
})
