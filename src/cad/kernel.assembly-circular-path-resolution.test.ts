import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import fixture from './fixtures/assembly-material-arc-original.json'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyVertexReference } from '../model/assemblyDocument'
import type { AssemblyCircularPathReferenceRequest } from '../model/assemblyCircularPathReferences'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import { solveRigidMates } from '../model/assemblySolver'
import { projectRigidMateTarget } from '../model/assemblyProjection'
import { copyRigidCircularPathConstraint } from '../model/assemblyCircularPathNumeric'
import type { RigidMateProblem } from '../model/assemblySolveTypes'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { resolveAssemblyCircularPathReferences, assertAssemblyCircularPathResolution } from './kernel.assembly-circular-path-resolution'
import { evaluateAssemblyCircularPathReferences } from './kernel.assembly-circular-path-evaluation'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference } from './kernel.assembly-types'
import { CadEngine } from './kernel.engine'

// Original tracked R2 sector, C=(3,-2), two radii and +4mm extrusion.
// These tests consume the actual issued native-derived numeric constraint.
// No hand-authored metrology, saved mate, worker capability or Apply is added.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const LENGTH = 1e-6, ANGLE = 1e-8
const near = (a: readonly number[], b: readonly number[], band = LENGTH) => {
  expect(a).toHaveLength(b.length); a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(band))
}
const original = () => {
  const d = validateAssemblyDocument(fixture); d.occurrences[1].pose.translation = [4, 1, -1]; return d
}
function body(d: AssemblyDocument, p: readonly string[]) {
  const list = buildAssemblyScene(d).bodies.filter(b => JSON.stringify(b.component.occurrencePath) === JSON.stringify(p))
  expect(list).toHaveLength(1); return list[0]
}
function request(d: AssemblyDocument, pointPath = ['b'], pathPath = ['a'], reverse = false, pointLocal = [3, -2, 4]): { input: AssemblyCircularPathReferenceRequest; length: number } {
  const a = body(d, pathPath), b = body(d, pointPath), snapshot = new AssemblyGeometrySnapshot(d)
  try {
    const edges = a.edges!.filter(e => !e.support).filter(e => {
      const w = snapshot.resolvePathCurveSelection(d, { ...e.selection, sense: 1 })
      return w.localCurve.kind === 'circle' && !w.localCurve.closed && Math.abs(w.localCurve.center[2] - 4) < 1e-12
    })
    const endpoint = reverse ? [3, 0, 4] : [5, -2, 4]
    const vertices = a.vertexPoints!.filter(v => v.point.every((x, i) => Math.abs(x - endpoint[i]) < 1e-12)), points = b.vertexPoints!.filter(v => v.point.every((x, i) => Math.abs(x - pointLocal[i]) < 1e-12))
    expect(edges).toHaveLength(1); expect(vertices).toHaveLength(1); expect(points).toHaveLength(1)
    const path = { ...structuredClone(edges[0].selection), startVertex: { ...vertices[0].selection.vertex } }
    const curve = snapshot.resolveArcPathSelection(d, path).localCurve
    near(curve.center, [3, -2, 4], 1e-10); expect(curve.radiusMm).toBeCloseTo(2, 12); expect(curve.lengthMm).toBeCloseTo(Math.PI, 12)
    return { input: { point: { kind: 'vertex', ...structuredClone(points[0].selection), support: 'point' }, path, position: { mode: 'free', domain: 'trim' }, orientation: { pitchYaw: 'free', roll: 'free' } }, length: curve.lengthMm }
  } finally { snapshot.dispose() }
}
function geometry(d: AssemblyDocument, solids = 2) {
  const s = buildAssemblyScene(d)
  expect(s.warnings).toEqual([]); expect(s.solidCount).toBe(solids); expect(s.prototypeCount).toBe(1)
  expect(Math.abs(s.volume - solids * 4 * Math.PI)).toBeLessThan(1e-5)
  expect(Math.abs(s.area - solids * (6 * Math.PI + 16))).toBeLessThan(1e-5)
  for (const b of s.bodies) { expect(b.solidCount).toBe(1); expect(Math.abs(b.volume - 4 * Math.PI)).toBeLessThan(1e-5); expect(Math.abs(b.area - (6 * Math.PI + 16))).toBeLessThan(1e-5) }
  return s
}
function solve(d: AssemblyDocument, input: AssemblyCircularPathReferenceRequest) {
  const snapshot = new AssemblyGeometrySnapshot(d), before = structuredClone(d)
  try {
    const resolution = resolveAssemblyCircularPathReferences(snapshot, d, input)
    expect(resolution.kind).toBe('circular-path-resolution')
    expect(Object.isFrozen(resolution.constraint.second.arc)).toBe(true)
    expect(resolution.constraint.id).toBe('circular-path-query')
    for (const field of ['positionErrorMm', 'radiusErrorMm', 'frameErrorRad', 'sweepErrorRad'] as const) expect(resolution.constraint.second.arc[field]).toBeGreaterThan(0)
    const problem: RigidMateProblem = { bodies: d.occurrences.map(o => ({ id: o.id, fixed: o.fixed, pose: structuredClone(o.pose) as RigidPose })), constraints: [copyRigidCircularPathConstraint(resolution.constraint)], origin: [0, 0, 0], lengthScale: 10, lengthTolerance: LENGTH, angleTolerance: ANGLE }
    const result = solveRigidMates(problem)
    expect(['underdefined', 'fullyDefined']).toContain(result.status); expect(result.poses).not.toBeNull()
    assertAssemblyCircularPathResolution(resolution, d)
    const candidate = validateAssemblyDocument(d)
    for (const o of candidate.occurrences) { const pose = result.poses!.get(o.id); expect(pose).toBeDefined(); o.pose = structuredClone(pose!) }
    for (const o of d.occurrences.filter(o => o.fixed)) expect(candidate.occurrences.find(x => x.id === o.id)!.pose).toEqual(o.pose)
    expect(candidate.definitions).toEqual(d.definitions); expect(candidate.mates).toEqual([]); expect(d).toEqual(before)
    return { candidate, result, problem }
  } finally { snapshot.dispose() }
}
function verify(d: AssemblyDocument, input: AssemblyCircularPathReferenceRequest, expectedPoint?: readonly number[], expectedTangent?: readonly number[], scope: string[] = []) {
  const snapshot = new AssemblyGeometrySnapshot(d)
  try {
    const actual = evaluateAssemblyCircularPathReferences(snapshot, d, input, {}, scope)
    expect(actual.status).toBe('ok'); expect(actual.satisfied).toBe(true); expect(actual.verificationOnly).toBe(true); expect(actual.compatibilityAuthority).toBe(false)
    expect(actual.uncertaintyModel).toBe('current-native-analytic-float64')
    expect(actual.topologyTolerancesMm.point).toBeGreaterThanOrEqual(0); expect(actual.topologyTolerancesMm.path).toBeGreaterThanOrEqual(0)
    expect(actual.positionResidualMm).toBeLessThanOrEqual(LENGTH)
    if (input.orientation.pitchYaw !== 'free') expect(actual.orientationResidualRad!).toBeLessThanOrEqual(ANGLE)
    if (input.orientation.roll !== 'free') expect(actual.rollResidualRad!).toBeLessThanOrEqual(ANGLE)
    const point = snapshot.resolveVertexReference(d, input.point, scope), arc = snapshot.resolveArcPathSelection(d, input.path, scope)
    if (expectedPoint) near(point.worldSupport.point, expectedPoint)
    if (expectedTangent && input.position.mode === 'coordinate') {
      const coordinate = input.position.distanceMm === arc.localCurve.lengthMm ? { kind: 'parameter' as const, parameter: arc.localCurve.endParameter } : { kind: 'arc-length' as const, distanceMm: input.position.distanceMm }
      const observation = snapshot.evaluateArcPathSelection(d, input.path, coordinate, scope)
      near(observation.worldEvaluation.tangent, expectedTangent, 1e-10)
      near(observation.worldEvaluation.point, point.worldSupport.point)
    }
    return actual
  } finally { snapshot.dispose() }
}
function axisFromNativeVertices(d: AssemblyDocument, p: string[], axis: 'x' | 'z') {
  const b = body(d, p), from = axis === 'x' ? [3, -2, 4] : [3, -2, 0], to = axis === 'x' ? [5, -2, 4] : [3, -2, 4]
  const v = (local: number[]) => b.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - local[i]) < 1e-12))!.worldPoint
  const A = v(from), B = v(to); return B.map((value, i) => (value - A[i]) / (axis === 'x' ? 2 : 4))
}
function freeFollowCheck(d: AssemblyDocument, input: AssemblyCircularPathReferenceRequest, up = false) {
  const measured = verify(d, input), snapshot = new AssemblyGeometrySnapshot(d)
  try {
    expect(input.position).toEqual({ mode: 'free', domain: 'trim' })
    expect(measured.targetCoordinateMm).toBeNull(); expect(measured.coordinateMm).not.toBeNull()
    expect(measured.precision.positionErrorMm).toBeGreaterThan(0)
    expect(measured.precision.tangentErrorRad).toBeGreaterThan(0)
    // The GPPoint Float64 arithmetic and native topology tolerance are separate
    // disclosed quantities; topology tolerance is not a phase/metrology budget.
    expect(measured.uncertaintyModel).toBe('current-native-analytic-float64')
    expect(measured.topologyTolerancesMm.path).toBeGreaterThan(0)
    const P = snapshot.resolveVertexReference(d, input.point).worldSupport.point, phase = Math.atan2(P[1] + 2, P[0] - 3)
    expect(Math.abs(Math.hypot(P[0] - 3, P[1] + 2) - 2)).toBeLessThanOrEqual(LENGTH)
    expect(Math.abs(P[2] - 4)).toBeLessThanOrEqual(LENGTH)
    expect(phase).toBeGreaterThanOrEqual(-ANGLE); expect(phase).toBeLessThanOrEqual(Math.PI / 2 + ANGLE)
    const tangent = [-Math.sin(phase), Math.cos(phase), 0]
    near(axisFromNativeVertices(d, ['b'], 'x'), tangent, ANGLE)
    if (up) near(axisFromNativeVertices(d, ['b'], 'z'), [0, 0, 1], ANGLE)
    geometry(d, up ? 3 : 2)
    return { point: P, tangent, coordinate: measured.coordinateMm! }
  } finally { snapshot.dispose() }
}
function freeFollowUpOriginal() {
  const d = original()
  d.occurrences.push({ ...structuredClone(d.occurrences[0]), id: 'g', name: 'Original Free UP guide', pose: { translation: [20, -10, 0], rotation: [0, 0, 0, 1] } })
  const { input } = request(d), face = body(d, ['g']).faces.find(f => f.support?.kind === 'plane' && f.support.normal[2] > .999 && Math.abs(f.support.point[2] - 4) < 1e-10)!
  const guide = assemblySceneFaceReference(face)
  if (!guide || guide.support !== 'plane') throw Error('Original Free UP top plane missing')
  input.orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: { mode: 'up', axis: 'z', reverse: false, guide: { ...guide, support: 'plane' } } }
  return { d, input }
}

it('solves actual native-derived Free Follow at the default bands and freshly checks material point and axis', () => {
  const d = original(), { input } = request(d)
  input.orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: 'free' }
  freeFollowCheck(solve(d, input).candidate, input)
})

it('solves Free Follow with a third actual material-plane UP guide at the default bands', () => {
  const { d, input } = freeFollowUpOriginal()
  freeFollowCheck(solve(d, input).candidate, input, true)
})

it('locally projects the Free Follow plus UP material point to the endpoint and back inside with fresh native checks', () => {
  const { d, input } = freeFollowUpOriginal(), before = structuredClone(d), solved = solve(d, input)
  let candidate = solved.candidate
  freeFollowCheck(candidate, input, true)
  let problem = solved.problem
  // Target the selected material point Ctop, not the moving component origin.
  const frame: RigidPose = { translation: [3, -2, 4], rotation: [0, 0, 0, 1] }
  for (const [point, angle, tangent] of [
    [[5, -2, 4], Math.PI / 2, [0, 1, 0]],
    [[3 + Math.SQRT2, -2 + Math.SQRT2, 4], 3 * Math.PI / 4, [-Math.SQRT1_2, Math.SQRT1_2, 0]],
  ] as const) {
    problem = { ...problem, bodies: problem.bodies.map(b => ({ ...b, pose: structuredClone(candidate.occurrences.find(o => o.id === b.id)!.pose) })) }
    const projected = projectRigidMateTarget(problem, { bodyId: 'b', frame, mode: 'translate', targetPose: { translation: [...point], rotation: [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)] } })
    expect(projected.status).toBe('ready')
    if (projected.status !== 'ready') throw Error(projected.message)
    expect(projected.evidence.localOnly).toBe(true)
    near(projected.resolvedPose.translation, point)
    candidate = validateAssemblyDocument(candidate)
    for (const o of candidate.occurrences) o.pose = structuredClone(projected.result.poses!.get(o.id)!)
    const measured = freeFollowCheck(candidate, input, true)
    near(measured.point, point); near(measured.tangent, tangent, ANGLE)
    near(axisFromNativeVertices(candidate, ['b'], 'x'), tangent, ANGLE)
    for (const fixed of d.occurrences.filter(o => o.fixed)) expect(candidate.occurrences.find(o => o.id === fixed.id)!.pose).toEqual(fixed.pose)
  }
  expect(d).toEqual(before); expect(candidate.definitions).toEqual(d.definitions); expect(candidate.mates).toEqual([])
})

for (const fraction of [0, .5, 1]) it('consumes native-derived arc budgets and independently verifies solved coordinate fraction=' + fraction, () => {
  const d = original(), { input, length } = request(d)
  input.position = { mode: 'coordinate', distanceMm: length * fraction }; input.orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: 'free' }
  const { candidate } = solve(d, input)
  const P = fraction === 0 ? [5, -2, 4] : fraction === 1 ? [3, 0, 4] : [3 + Math.SQRT2, -2 + Math.SQRT2, 4]
  const T = fraction === 0 ? [0, 1, 0] : fraction === 1 ? [-1, 0, 0] : [-Math.SQRT1_2, Math.SQRT1_2, 0]
  verify(candidate, input, P, T); near(axisFromNativeVertices(candidate, ['b'], 'x'), T, ANGLE)
  const s = geometry(candidate), a = s.bodies.find(b => b.component.occurrencePath[0] === 'a')!
  near(a.bounds.min, [3, -2, 0]); near(a.bounds.max, [5, 0, 4])
})

it('uses the opposite actual material endpoint without borrowing the circle parameter normal as directed orientation', () => {
  const d = original(), { input, length } = request(d, ['b'], ['a'], true)
  input.position = { mode: 'coordinate', distanceMm: length / 2 }; input.orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: 'free' }
  const snapshot = new AssemblyGeometrySnapshot(d)
  try { const r = resolveAssemblyCircularPathReferences(snapshot, d, input); near(r.constraint.second.arc.radial, [0, 1, 0], 1e-10); near(r.constraint.second.arc.tangent, [1, 0, 0], 1e-10) } finally { snapshot.dispose() }
  const { candidate } = solve(d, input), tangent = [Math.SQRT1_2, -Math.SQRT1_2, 0]
  verify(candidate, input, [3 + Math.SQRT2, -2 + Math.SQRT2, 4], tangent); near(axisFromNativeVertices(candidate, ['b'], 'x'), tangent, ANGLE); geometry(candidate)
})

it('resolves Free-trim geometry without prescribing an unobservable unique point-body pose', () => {
  const d = original(), { input } = request(d), { candidate } = solve(d, input)
  verify(candidate, input); geometry(candidate)
  const snapshot = new AssemblyGeometrySnapshot(candidate)
  try {
    const P = snapshot.resolveVertexReference(candidate, input.point).worldSupport.point, phase = Math.atan2(P[1] + 2, P[0] - 3)
    expect(Math.abs(Math.hypot(P[0] - 3, P[1] + 2) - 2)).toBeLessThanOrEqual(LENGTH)
    expect(Math.abs(P[2] - 4)).toBeLessThanOrEqual(LENGTH); expect(phase).toBeGreaterThanOrEqual(-ANGLE); expect(phase).toBeLessThanOrEqual(Math.PI / 2 + ANGLE)
  } finally { snapshot.dispose() }
})

for (const reverse of [false, true]) it('resolves an actual third material-plane guide and verifies its current independent UP sign=' + reverse, () => {
  const d = original(); d.occurrences.push({ ...structuredClone(d.occurrences[0]), id: 'g', name: 'Original third guide', pose: { translation: [20, -10, 0], rotation: [0, 0, 0, 1] } })
  const { input, length } = request(d), face = body(d, ['g']).faces.find(f => f.support?.kind === 'plane' && f.support.normal[2] > .999 && Math.abs(f.support.point[2] - 4) < 1e-10)!
  const guide = assemblySceneFaceReference(face); if (!guide || guide.support !== 'plane') throw Error('Original top plane missing')
  input.position = { mode: 'coordinate', distanceMm: length / 2 }
  input.orientation = { pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: { mode: 'up', axis: 'z', reverse, guide: { ...guide, support: 'plane' } } }
  const snapshot = new AssemblyGeometrySnapshot(d)
  try {
    const r = resolveAssemblyCircularPathReferences(snapshot, d, input)
    expect(r.up).toBeDefined(); expect(r.componentPaths).toEqual({ point: ['b'], path: ['a'], up: ['g'] }); expect(r.constraint.roll!.guide.bodyId).toBe('g')
  } finally { snapshot.dispose() }
  const { candidate } = solve(d, input)
  verify(candidate, input, [3 + Math.SQRT2, -2 + Math.SQRT2, 4], [-Math.SQRT1_2, Math.SQRT1_2, 0])
  near(axisFromNativeVertices(candidate, ['b'], 'z'), [0, 0, reverse ? -1 : 1], ANGLE); geometry(candidate, 3)
})

it('keeps a true nested point frame relative to its actual root owner through native resolution and solve', () => {
  const d = original(), source = d.definitions[0]
  d.definitions.push({ kind: 'assembly', id: 'point-container', revision: 'r1', name: 'Original nested point', createdAt: d.createdAt, updatedAt: d.updatedAt, mates: [], occurrences: [{ id: 'inner', name: 'Original Rx90 source', definition: { id: source.id, revision: source.revision }, pose: { translation: [2, 0, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false }] })
  d.occurrences[1].definition = { id: 'point-container', revision: 'r1' }
  const { input, length } = request(d, ['b', 'inner'])
  input.position = { mode: 'coordinate', distanceMm: length / 2 }; input.orientation = { pitchYaw: { mode: 'follow', axis: 'z', reverse: false }, roll: 'free' }
  const snapshot = new AssemblyGeometrySnapshot(d)
  try { const r = resolveAssemblyCircularPathReferences(snapshot, d, input); expect(r.constraint.first.bodyId).toBe('b'); expect(r.componentPaths.point).toEqual(['b', 'inner']); near(r.constraint.first.frame.translation, [2, 0, 0], 1e-10) } finally { snapshot.dispose() }
  const { candidate } = solve(d, input), tangent = [-Math.SQRT1_2, Math.SQRT1_2, 0]
  verify(candidate, input, [3 + Math.SQRT2, -2 + Math.SQRT2, 4], tangent); near(axisFromNativeVertices(candidate, ['b', 'inner'], 'z'), tangent, ANGLE); geometry(candidate)
})

it('retains scoped reused namespaces and does not turn shared-root child selections into free child bodies', () => {
  const inner = validateAssemblyDocument(fixture), source = inner.definitions[0]
  const d = validateAssemblyDocument({ ...inner, id: 'outer-host', definitions: [source, { kind: 'assembly', id: 'shared-scope', revision: 'r1', name: 'Original shared rigid scope', createdAt: inner.createdAt, updatedAt: inner.updatedAt, occurrences: inner.occurrences, mates: [] }], occurrences: [
    { id: 'left', name: 'Left scope', definition: { id: 'shared-scope', revision: 'r1' }, pose: { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false },
    { id: 'right', name: 'Right scope', definition: { id: 'shared-scope', revision: 'r1' }, pose: { translation: [-10, -20, -30], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: false, visible: true, suppressed: false },
  ] })
  const snapshot = new AssemblyGeometrySnapshot(d)
  try {
    for (const [id, P] of [['left', [12, 25, 34]], ['right', [-5, -24, -32]]] as const) {
      const { input } = request(d, [id, 'b'], [id, 'a'], false, [5, -2, 4])
      input.point.component.occurrencePath = ['b']; input.path.component.occurrencePath = ['a']; input.position = { mode: 'coordinate', distanceMm: 0 }
      const r = resolveAssemblyCircularPathReferences(snapshot, d, input, {}, [id])
      expect(r.scopePath).toEqual([id]); expect(r.componentPaths).toEqual({ point: [id, 'b'], path: [id, 'a'] })
      expect(r.constraint.first.bodyId).toBe(id); expect(r.constraint.second.bodyId).toBe(id)
      verify(d, input, P, undefined, [id]); assertAssemblyCircularPathResolution(r, d)
    }
  } finally { snapshot.dispose() }
})

it('rejects copied, wrong-purpose, stale and cancelled resolutions without creating Apply authority', () => {
  const d = original(), { input } = request(d), snapshot = new AssemblyGeometrySnapshot(d)
  try {
    const r = resolveAssemblyCircularPathReferences(snapshot, d, input)
    assertAssemblyCircularPathResolution(r, d)
    expect(() => assertAssemblyCircularPathResolution(structuredClone(r), d)).toThrow()
    expect(() => assertAssemblyCircularPathResolution(r.path as never, d)).toThrow()
    expect(r).not.toHaveProperty('token'); expect(r).not.toHaveProperty('hasToken')
    const stale = validateAssemblyDocument(d); stale.occurrences[1].pose.translation[0]++
    expect(() => assertAssemblyCircularPathResolution(r, stale)).toThrow()
    snapshot.dispose(); expect(() => assertAssemblyCircularPathResolution(r, d)).toThrow()
  } finally { snapshot.dispose() }
})

it('rejects malformed intent before native querying while keeping the valid borrowed snapshot', () => {
  const d = original(), { input } = request(d), snapshot = new AssemblyGeometrySnapshot(d), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath'); let reads = 0
  try {
    const bad = { ...input }; Object.defineProperty(bad, 'orientation', { enumerable: true, get() { reads++; return input.orientation } })
    expect(() => resolveAssemblyCircularPathReferences(snapshot, d, bad)).toThrow()
    expect(() => resolveAssemblyCircularPathReferences(snapshot, d, input, { lengthToleranceMm: -1 })).toThrow()
    expect(query).not.toHaveBeenCalled(); expect(reads).toBe(0)
    assertAssemblyCircularPathResolution(resolveAssemblyCircularPathReferences(snapshot, d, input), d)
  } finally { query.mockRestore(); snapshot.dispose() }
})

for (const action of ['query-failure', 'reentrant-document'] as const) it('withholds a resolution after ' + action, () => {
  const d = original(), { input } = request(d), snapshot = new AssemblyGeometrySnapshot(d), old = CadEngine.prototype.inspectCurrentArcPath
  const prior = resolveAssemblyCircularPathReferences(snapshot, d, input)
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath').mockImplementation(function (this: CadEngine, ...args) {
    const observed = old.apply(this, args)
    if (action === 'query-failure') throw Error('Original actual query followed by injected native failure')
    d.occurrences[1].name = 'Reentrant document mutation'; return observed
  })
  try { expect(() => resolveAssemblyCircularPathReferences(snapshot, d, input)).toThrow(); expect(() => assertAssemblyCircularPathResolution(prior, d)).toThrow() } finally { query.mockRestore(); snapshot.dispose() }
})

it('withholds native resolution at an unretained requested length band instead of inventing metrology', () => {
  const d = original(), { input } = request(d), snapshot = new AssemblyGeometrySnapshot(d)
  try { expect(() => resolveAssemblyCircularPathReferences(snapshot, d, input, { lengthToleranceMm: 1e-12 })).toThrow(); expect(() => resolveAssemblyCircularPathReferences(snapshot, d, input)).toThrow() } finally { snapshot.dispose() }
})

it('a fresh native verification rejects a changed solved point despite copied numeric intent', () => {
  const d = original(), { input, length } = request(d); input.position = { mode: 'coordinate', distanceMm: length / 2 }
  const { candidate } = solve(d, input); verify(candidate, input, [3 + Math.SQRT2, -2 + Math.SQRT2, 4])
  candidate.occurrences[1].pose.translation[2] += .01
  const snapshot = new AssemblyGeometrySnapshot(candidate)
  try { const rejected = evaluateAssemblyCircularPathReferences(snapshot, candidate, input); expect(rejected.satisfied).toBe(false); expect(rejected.positionResidualMm).toBeGreaterThan(.009) } finally { snapshot.dispose() }
})
