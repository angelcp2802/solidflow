import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyFaceReference,
  type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { AssemblyLimitedHingeReferenceRequest } from '../model/assemblyLimitedHingeReferences'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import { solveRigidMates } from '../model/assemblySolver'
import { projectRigidMateTarget } from '../model/assemblyProjection'
import type { RigidHingeConstraint, RigidMateProblem } from '../model/assemblySolveTypes'
import { originalHingeDocument } from './kernel.assembly-hinge-fixture.test-utils'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { resolveAssemblyHingeReferences } from './kernel.assembly-hinge'
import { resolveAssemblyLimitedHingeReferences, assertAssemblyLimitedHingeReferences, buildAssemblyLimitedHingeConstraint } from './kernel.assembly-hinge-limits'
import { measureAssemblyLimitedHingeReferences } from './kernel.assembly-hinge-limits-measure'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import type { Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
// Original H4 leaves: x[-2,10], y[-2,2], z[0,4], R1 axial hole.
// No external angular policy, saved stops or hand-authored metrology is supplied.
// The native verifier's raw dot/triple phase is mathematically the same circular
// coordinate as the numerical helper. Independence here comes from fresh native
// queries plus literal trigonometric rays, material vertices, mass and bounds;
// two floating-point implementations alone are not a physical oracle.
const rad = (d: number) => d * Math.PI / 180
const near = (a: number, b: number, band = 1e-6) => { expect(Number.isFinite(a)).toBe(true); expect(Math.abs(a - b)).toBeLessThanOrEqual(band) }
const vector = (a: readonly number[], b: readonly number[], band = 1e-6) => { expect(a).toHaveLength(b.length); a.forEach((v, i) => near(v, b[i], band)) }
const turn = (degrees: number): RigidPose['rotation'] => [0, 0, Math.sin(rad(degrees) / 2), Math.cos(rad(degrees) / 2)]
function documentAt(degrees = 0): AssemblyDocument { const d = originalHingeDocument(); d.occurrences[1].pose.rotation = turn(degrees); return d }
function circularRadians(degrees: number): number { return ((degrees % 360 + 360) % 360) * Math.PI / 180 }
function phase(actual: number, expected: number) { expect(actual).toBeGreaterThanOrEqual(0); expect(actual).toBeLessThan(2 * Math.PI); near(Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected)), 0, 1e-8) }
const samePath = (a: readonly string[], b: readonly string[]) => JSON.stringify(a) === JSON.stringify(b)
type Face = AssemblyFaceReference & { support: 'plane' }
function request(d: AssemblyDocument, paths: [string[], string[]] = [['ground'], ['moving']],
  angularPaths: [string[], string[]] = paths, axialPaths: [string[], string[]] = paths) {
  const scene = buildAssemblyScene(d)
  const body = (path: string[]) => { const rows = scene.bodies.filter(b => samePath(b.component.occurrencePath, path)); expect(rows).toHaveLength(1); return rows[0] }
  let guideSign = 0
  const axes = paths.map((path, i) => {
    const found = body(path).faces.filter(f => f.support?.kind === 'cylinder' && Math.abs(f.support.radius - 1) < 1e-10 && Math.hypot(f.support.point[0], f.support.point[1]) < 1e-10)
    expect(found).toHaveLength(1); const support = found[0].support!
    if (support.kind !== 'cylinder') throw Error('Original analytic cylinder required')
    vector(support.axis.slice(0, 2), [0, 0], 1e-12); near(Math.abs(support.axis[2]), 1, 1e-12)
    if (!i) guideSign = support.axis[2] > 0 ? 1 : -1
    return { kind: 'face' as const, ...structuredClone(found[0].selection), support: 'axis' as const }
  }) as AssemblyLimitedHingeReferenceRequest['axis']
  const plane = (path: string[], axis: 0 | 2, coordinate: number, positive = false): Face => {
    const found = body(path).faces.filter(f => f.support?.kind === 'plane' && Math.abs(f.support.point[axis] - coordinate) < 1e-10
      && (positive ? f.support.normal[axis] > .999999 : Math.abs(f.support.normal[axis]) > .999999))
    expect(found).toHaveLength(1)
    return { kind: 'face', ...structuredClone(found[0].selection), support: 'plane' }
  }
  const q: AssemblyLimitedHingeReferenceRequest = { axis: axes,
    axial: [plane(axialPaths[0], 2, 4), plane(axialPaths[1], 2, 0)], alignment: 'aligned',
    stops: { coordinate: 'directed-about-axis', angular: [plane(angularPaths[0], 0, 10, true), plane(angularPaths[1], 0, 10, true)], arc: { start: 330, sweep: 60 } } }
  return { q, guideSign }
}
function problem(d: AssemblyDocument, constraint: RigidHingeConstraint): RigidMateProblem {
  return { bodies: d.occurrences.map(o => ({ id: o.id, fixed: o.fixed, pose: structuredClone(o.pose) })), constraints: [constraint],
    origin: [0, 0, 0], lengthScale: 20, lengthTolerance: 1e-6, angleTolerance: 1e-8 }
}
function candidate(d: AssemblyDocument, poses: ReadonlyMap<string, RigidPose>): AssemblyDocument {
  const copy = validateAssemblyDocument(d); copy.occurrences.forEach(o => { o.pose = structuredClone(poses.get(o.id)!) }); return copy
}
function solve(d: AssemblyDocument, q: AssemblyLimitedHingeReferenceRequest, scope: string[] = []) {
  const before = serializeAssemblyDocument(d), s = new AssemblyGeometrySnapshot(d)
  try {
    const proof = resolveAssemblyLimitedHingeReferences(s, d, q, scope)
    expect(Object.isFrozen(proof)).toBe(true); expect(Object.isFrozen(proof.stops.angular)).toBe(true)
    assertAssemblyLimitedHingeReferences(s, d, proof)
    const constraint = buildAssemblyLimitedHingeConstraint(s, d, proof, 'original-native-limited-hinge')
    expect(constraint.uncertainty).toHaveLength(4); expect(constraint.stops!.uncertainty).toHaveLength(2)
    for (const error of [...constraint.uncertainty!, ...constraint.stops!.uncertainty!]) {
      expect(error.directionErrorRad).toBeGreaterThan(0); expect(error.positionErrorMm).toBeGreaterThan(0)
    }
    const input = problem(d, constraint), result = solveRigidMates(input)
    expect(result.poses, result.evidence.diagnostics.join('\n')).not.toBeNull()
    expect(serializeAssemblyDocument(d)).toBe(before); assertAssemblyLimitedHingeReferences(s, d, proof)
    return { candidate: candidate(d, result.poses!), result, constraint, input }
  } finally { s.dispose() }
}
function measure(d: AssemblyDocument, q: AssemblyLimitedHingeReferenceRequest, scope: string[] = []) {
  const s = new AssemblyGeometrySnapshot(d)
  try {
    const report = measureAssemblyLimitedHingeReferences(s, d, q, {}, scope)
    expect(report.status).toBe('ok'); if (report.status !== 'ok') throw Error(report.message)
    expect(report.supportOnly).toBe(true); expect(report.satisfied).toBe(true); expect(report.hinge.satisfied).toBe(true)
    expect(report.coordinate).toBe('directed-about-axis'); expect(report.arcDegrees).toEqual(q.stops.arc)
    expect(report.lengthToleranceMm).toBe(1e-6); expect(report.angleToleranceRad).toBe(1e-8)
    expect(report.directionErrorRad).toBeGreaterThan(0)
    expect(Math.max(0, -report.marginsRadians.minimum, -report.marginsRadians.maximum) + report.directionErrorRad).toBeLessThanOrEqual(1e-8)
    expect('token' in report).toBe(false); expect('localDOF' in report).toBe(false)
    return report
  } finally { s.dispose() }
}
function rotate([x, y, z, w]: readonly number[], p: readonly number[]): Vec3 {
  const uv = [y * p[2] - z * p[1], z * p[0] - x * p[2], x * p[1] - y * p[0]],
    uuv = [y * uv[2] - z * uv[1], z * uv[0] - x * uv[2], x * uv[1] - y * uv[0]]
  return p.map((v, i) => v + 2 * (w * uv[i] + uuv[i])) as Vec3
}
function physical(d: AssemblyDocument, degrees?: number) {
  const scene = buildAssemblyScene(d)
  expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(2); expect(scene.prototypeCount).toBe(1)
  near(scene.volume, 384 - 8 * Math.PI, 1e-5); near(scene.area, 448 + 12 * Math.PI, 1e-5)
  for (const body of scene.bodies) {
    near(body.volume, 192 - 4 * Math.PI, 1e-5); near(body.area, 224 + 6 * Math.PI, 1e-5); expect(body.solidCount).toBe(1)
    const pose = d.occurrences.find(o => o.id === body.component.occurrencePath[0])!.pose,
      corners = [-2, 10].flatMap(x => [-2, 2].flatMap(y => [0, 4].map(z => rotate(pose.rotation, [x, y, z]).map((v, i) => v + pose.translation[i]))))
    vector(body.bounds.min, [0, 1, 2].map(i => Math.min(...corners.map(v => v[i])))); vector(body.bounds.max, [0, 1, 2].map(i => Math.max(...corners.map(v => v[i]))))
  }
  if (degrees !== undefined) {
    const b = scene.bodies.find(b => b.component.occurrencePath[0] === 'moving')!, vertices = b.vertexPoints!.filter(v => v.point.every((n, i) => Math.abs(n - [10, 2, 4][i]) < 1e-10))
    expect(vertices).toHaveLength(1)
    const s = new AssemblyGeometrySnapshot(d)
    try { const p = s.resolveVertexReference(d, { kind: 'vertex', ...structuredClone(vertices[0].selection), support: 'point' })
      vector(p.worldSupport.point, [10 * Math.cos(rad(degrees)) - 2 * Math.sin(rad(degrees)), 10 * Math.sin(rad(degrees)) + 2 * Math.cos(rad(degrees)), 8])
    } finally { s.dispose() }
    vector(d.occurrences[1].pose.translation, [0, 0, 4])
  }
}

it.each([-30, 0, 30])('builds native six-role intent and freshly verifies the literal %i-degree endpoint/interior', degrees => {
  const d = documentAt(degrees), { q, guideSign } = request(d), before = serializeAssemblyDocument(d), solved = solve(d, q)
  expect(solved.result.rank).toBe(5); expect(solved.result.localDOF).toBe(1)
  const nativeAxis = solved.constraint.axis[0].support; if (!nativeAxis || nativeAxis.kind !== 'cylinder') throw Error('Actual cylinder axis required')
  vector(nativeAxis.axis, [0, 0, guideSign], 1e-12)
  const report = measure(solved.candidate, q); phase(report.angleRadians, circularRadians(guideSign * degrees))
  expect(report.activity).toBe(!degrees ? 'interior' : guideSign * degrees < 0 ? 'minimum' : 'maximum')
  expect(report.componentPaths).toEqual({ axis: [['ground'], ['moving']], axial: [['ground'], ['moving']], angular: [['ground'], ['moving']] })
  physical(solved.candidate, degrees); expect(serializeAssemblyDocument(d)).toBe(before)
}, 60_000)

it.each([{ from: -40, target: -30 }, { from: 40, target: 30 }])('restores actual native spin $from to the physical stop $target', ({ from, target }) => {
  const d = documentAt(from), { q, guideSign } = request(d), solved = solve(d, q)
  const report = measure(solved.candidate, q); phase(report.angleRadians, circularRadians(guideSign * target)); physical(solved.candidate, target)
}, 60_000)

it('clamps and releases both native-derived stops while preserving the six current declarations', () => {
  let d = documentAt(-30); const { q, guideSign } = request(d), first = solve(d, q), original = structuredClone(first.constraint), input = first.input
  for (const [wanted, expected] of [[-10, -10], [40, 30], [10, 10], [-40, -30]]) {
    const p = projectRigidMateTarget(input, { bodyId: 'moving', frame: identityRigidPose(), mode: 'rotate', targetPose: { translation: [0, 0, 4], rotation: turn(wanted) } })
    expect(p.status, p.status === 'rejected' ? p.message : '').toBe('ready'); if (p.status !== 'ready') throw Error(p.message)
    d = candidate(d, p.result.poses!); input.bodies.forEach(b => { b.pose = structuredClone(p.result.poses!.get(b.id)!) })
    phase(measure(d, q).angleRadians, circularRadians(guideSign * expected)); physical(d, expected)
  }
  expect(input.constraints[0]).toEqual(original)
}, 60_000)

it('preserves the circular coordinate under an original non-world-Z common rigid placement', () => {
  const d = documentAt(20), s = Math.SQRT1_2, h = rad(20) / 2
  d.occurrences[0].pose = { translation: [7, -2, 3], rotation: [s, 0, 0, s] }
  d.occurrences[1].pose = { translation: [7, -6, 3], rotation: [s * Math.cos(h), -s * Math.sin(h), s * Math.sin(h), s * Math.cos(h)] }
  const { q, guideSign } = request(d), solved = solve(d, q), report = measure(solved.candidate, q)
  phase(report.angleRadians, circularRadians(guideSign * 20)); physical(solved.candidate)
  const b = buildAssemblyScene(solved.candidate).bodies.find(b => b.component.occurrencePath[0] === 'moving')!, p = b.vertexPoints!.find(v => v.point.every((n, i) => Math.abs(n - [10, 2, 4][i]) < 1e-10))!
  vector(p.worldPoint, [7 + 10 * Math.cos(rad(20)) - 2 * Math.sin(rad(20)), -10, 3 + 10 * Math.sin(rad(20)) + 2 * Math.cos(rad(20))])
}, 60_000)

function nested(separate = false): AssemblyDocument {
  const d = originalHingeDocument(), stamp = d.createdAt, part = d.occurrences[0].definition
  const node: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-limited-container', revision: 'r0', name: 'Original six-role rigid container', createdAt: stamp, updatedAt: stamp, mates: [],
    occurrences: separate ? ['axis-leaf', 'cap-leaf', 'ray-a', 'ray-b'].map(id => ({ id, name: id, definition: { ...part }, fixed: true, visible: true, suppressed: false,
      pose: { translation: [0, 0, 0], rotation: turn(id === 'ray-a' ? 10 : id === 'ray-b' ? -5 : 0) } })) : structuredClone(d.occurrences) }
  d.definitions.push(node); d.occurrences.forEach(o => { o.definition = { id: node.id, revision: node.revision } }); return validateAssemblyDocument(d)
}
it('keeps axis/cap/angular descendants on their two actual reused root rigid owners', () => {
  const d = nested(true); d.occurrences[1].pose.rotation = turn(20)
  const paths: [string[], string[]] = [['ground', 'axis-leaf'], ['moving', 'axis-leaf']], angular: [string[], string[]] = [['ground', 'ray-a'], ['moving', 'ray-b']], caps: [string[], string[]] = [['ground', 'cap-leaf'], ['moving', 'cap-leaf']],
    { q, guideSign } = request(d, paths, angular, caps), solved = solve(d, q)
  expect(solved.constraint.stops!.angular.map(e => e.bodyId)).toEqual(['ground', 'moving']); expect(solved.result.rank).toBe(5)
  phase(measure(solved.candidate, q).angleRadians, circularRadians(guideSign * 5))
}, 60_000)

it('measures original oblique angular descendant normals by their actual perpendicular projections', () => {
  const d = nested(true), node = d.definitions.find(v => v.kind === 'assembly')!; if (node.kind !== 'assembly') throw Error('Original container')
  for (const o of node.occurrences.filter(o => o.id === 'ray-a' || o.id === 'ray-b')) o.pose.rotation = [0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)]
  d.occurrences[1].pose.rotation = turn(20)
  const { q, guideSign } = request(d, [['ground', 'axis-leaf'], ['moving', 'axis-leaf']], [['ground', 'ray-a'], ['moving', 'ray-b']], [['ground', 'cap-leaf'], ['moving', 'cap-leaf']]), solved = solve(d, q), report = measure(solved.candidate, q)
  phase(report.angleRadians, circularRadians(guideSign * 20)); near(report.projectionLengths.first, Math.sqrt(3) / 2, 1e-10); near(report.projectionLengths.second, Math.sqrt(3) / 2, 1e-10)
}, 60_000)

it('uses nested scope only as context and does not promote two children into independent owners', () => {
  const d = nested(); d.occurrences[0].fixed = false; d.occurrences[1].fixed = true
  const { q } = request(d, [['ground', 'ground'], ['ground', 'moving']])
  for (const r of [...q.axis, ...q.axial, ...q.stops.angular]) { if (!r.component) throw Error('Original material component'); r.component.occurrencePath = r.component.occurrencePath.slice(1) }
  const solved = solve(d, q, ['ground'])
  expect(solved.constraint.stops!.angular.map(e => e.bodyId)).toEqual(['ground', 'ground']); expect(solved.result.rank).toBe(0); expect(solved.result.localDOF).toBe(6)
  const report = measure(solved.candidate, q, ['ground']); expect(report.scopePath).toEqual(['ground']); expect(report.componentPaths.angular).toEqual([['ground', 'ground'], ['ground', 'moving']])
}, 60_000)

it('rejects copied, unlimited-purpose, foreign-snapshot, disposed and changed-source six-role proofs', () => {
  const d = documentAt(), { q } = request(d), a = new AssemblyGeometrySnapshot(d), b = new AssemblyGeometrySnapshot(d)
  try {
    const issued = resolveAssemblyLimitedHingeReferences(a, d, q), base = resolveAssemblyHingeReferences(a, d, { axis: q.axis, axial: q.axial, alignment: q.alignment })
    expect(() => assertAssemblyLimitedHingeReferences(a, d, structuredClone(issued))).toThrow(/issued/)
    expect(() => assertAssemblyLimitedHingeReferences(b, d, issued)).toThrow(/issued/)
    expect(() => buildAssemblyLimitedHingeConstraint(a, d, base as never, 'wrong-purpose')).toThrow(/issued/)
    const changed = validateAssemblyDocument(d), part = changed.definitions[0]
    if (part.kind !== 'part' || part.document.features[1].type !== 'extrude') throw Error('Original source')
    part.document.features[1].depth = 5
    expect(() => assertAssemblyLimitedHingeReferences(a, changed, issued)).toThrow()
  } finally { a.dispose(); b.dispose() }
  const s = new AssemblyGeometrySnapshot(d), issued = resolveAssemblyLimitedHingeReferences(s, d, q); s.dispose()
  expect(() => buildAssemblyLimitedHingeConstraint(s, d, issued, 'disposed')).toThrow()
}, 60_000)

it('preflights angular datums, null roles, wrong purposes and executable fields before native queries', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d), inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport'); let reads = 0
  const accessor = structuredClone(q); Object.defineProperty(accessor.stops.angular, '1', { enumerable: true, get() { reads++; return q.stops.angular[1] } })
  try {
    for (const invalid of [accessor, { ...q, stops: { ...q.stops, angular: [null, q.stops.angular[1]] } },
      { ...q, stops: { ...q.stops, angular: [{ kind: 'principal-plane', component: null, plane: 'YZ' }, q.stops.angular[1]] } },
      { ...q, stops: { ...q.stops, angular: [q.axis[0], q.stops.angular[1]] } }, { ...q, token: 'forged' }])
      expect(() => resolveAssemblyLimitedHingeReferences(s, d, invalid)).toThrow()
    expect(reads).toBe(0); expect(inspect).not.toHaveBeenCalled()
    expect(s.listFaces(d, ['ground']).length).toBeGreaterThan(0)
    assertAssemblyLimitedHingeReferences(s, d, resolveAssemblyLimitedHingeReferences(s, d, q))
  } finally { inspect.mockRestore(); s.dispose() }
}, 60_000)

it('rejects a fixed-scope null axial role rather than inventing a material owner', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d)
  q.axial[0] = { kind: 'principal-plane', component: null, plane: 'XY' }
  try { expect(() => resolveAssemblyLimitedHingeReferences(s, d, q)).toThrow(/owner/); expect(() => s.listFaces(d, ['ground'])).toThrow() }
  finally { s.dispose() }
}, 60_000)

it('withholds the whole proof after the sixth native face query fails and releases its engine', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d), actual = CadEngine.prototype.inspectCurrentFaceSupport; let count = 0
  const inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    if (++count === 6) throw Error('Original sixth-face failure'); return actual.apply(this, args)
  }), release = vi.spyOn(CadEngine.prototype, 'dispose')
  try { expect(() => resolveAssemblyLimitedHingeReferences(s, d, q)).toThrow('Original sixth-face failure'); expect(count).toBe(6); expect(release).toHaveBeenCalled(); expect(() => s.listFaces(d, ['ground'])).toThrow() }
  finally { inspect.mockRestore(); release.mockRestore(); s.dispose() }
}, 60_000)

it('retains both a sixth-query error and an actual release failure without publishing a proof', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d), actual = CadEngine.prototype.inspectCurrentFaceSupport, release = s.dispose.bind(s); let count = 0
  const inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    if (++count === 6) throw Error('Original primary query failure'); return actual.apply(this, args)
  }), close = vi.spyOn(s, 'dispose').mockImplementation(() => { release(); throw Error('Original cleanup failure') })
  try {
    let error: unknown; try { resolveAssemblyLimitedHingeReferences(s, d, q) } catch (e) { error = e }
    expect(error).toBeInstanceOf(NativeCleanupError)
    expect((error as AggregateError).errors.map(e => (e as Error).message)).toEqual(['Original primary query failure', 'Original cleanup failure'])
    expect(count).toBe(6)
  } finally { inspect.mockRestore(); close.mockRestore(); s.dispose() }
}, 60_000)

it('independently re-queries all six current faces for final measurement without trusting a built constraint', () => {
  const d = documentAt(20), { q, guideSign } = request(d), built = solve(d, q), inspect = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport')
  built.constraint.stops!.arc = { start: 100, sweep: 1 }
  try { phase(measure(built.candidate, q).angleRadians, circularRadians(guideSign * 20)); expect(inspect).toHaveBeenCalledTimes(6) }
  finally { inspect.mockRestore() }
}, 60_000)

it('rejects unobservable angular caps despite six syntactically valid current faces', () => {
  const d = documentAt(), { q } = request(d); q.stops.angular[1] = q.axial[1] as Face
  const s = new AssemblyGeometrySnapshot(d)
  try { const proof = resolveAssemblyLimitedHingeReferences(s, d, q), c = buildAssemblyLimitedHingeConstraint(s, d, proof, 'singular'); expect(solveRigidMates(problem(d, c)).status).toBe('precisionLimit') }
  finally { s.dispose() }
  const fresh = new AssemblyGeometrySnapshot(d)
  try { const report = measureAssemblyLimitedHingeReferences(fresh, d, q); expect(report.status).toBe('precisionLimit'); expect('angleRadians' in report).toBe(false) }
  finally { fresh.dispose() }
}, 60_000)

it('withholds apparent stop satisfaction when a physical axial gap consumes the retained length band', () => {
  const d = documentAt(0); d.occurrences[1].pose.translation[2] += .8e-6
  const { q } = request(d), s = new AssemblyGeometrySnapshot(d)
  try { const r = measureAssemblyLimitedHingeReferences(s, d, q); expect(r.status).toBe('precisionLimit'); expect('angleRadians' in r).toBe(false); expect(s.listFaces(d, ['moving']).length).toBeGreaterThan(0) }
  finally { s.dispose() }
}, 60_000)

it('retains large cancelling source declarations instead of certifying their small composed coordinates', () => {
  const d = nested(), node = d.definitions.find(v => v.kind === 'assembly')!; if (node.kind !== 'assembly') throw Error('Original container')
  d.occurrences.forEach(o => { o.pose.translation[0] = 1e12 }); node.occurrences.forEach(o => { o.pose.translation[0] = -1e12 })
  const { q } = request(d, [['ground', 'ground'], ['moving', 'ground']]), s = new AssemblyGeometrySnapshot(d)
  try { const proof = resolveAssemblyLimitedHingeReferences(s, d, q); expect(() => buildAssemblyLimitedHingeConstraint(s, d, proof, 'cancelled')).toThrow(/precision/) }
  finally { s.dispose() }
  const fresh = new AssemblyGeometrySnapshot(d)
  try { const r = measureAssemblyLimitedHingeReferences(fresh, d, q); expect(r.status).toBe('precisionLimit'); expect('angleRadians' in r).toBe(false) }
  finally { fresh.dispose() }
}, 60_000)

it('rejects a geometrically coincident angular face from the other rigid owner', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d); q.stops.angular[0] = structuredClone(q.stops.angular[1])
  try { expect(() => resolveAssemblyLimitedHingeReferences(s, d, q)).toThrow(/owner/); expect(() => s.listFaces(d, ['ground'])).toThrow() }
  finally { s.dispose() }
}, 60_000)

it('checks original BRep validity and solid count independently of any hinge measurement', () => {
  const d = originalHingeDocument(), part = d.definitions[0]; if (part.kind !== 'part') throw Error('Original H4 part')
  withNativeOwners(owners => {
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
    const inventory = engine.rebuildForAssemblyReferences(part.document.features)
    expect(inventory.featureErrors).toEqual([]); if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw Error('One actual native body')
    const shape = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), checker = owners.own(new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false, false))
    expect(checker.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
  })
}, 60_000)

it('releases the borrowed snapshot exactly once when fresh base axial qualification fails', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d)
  q.axial[1] = structuredClone(q.stops.angular[1]) // Actual +X radial plane, not an axial cap.
  const release = vi.spyOn(s, 'dispose')
  try {
    expect(() => measureAssemblyLimitedHingeReferences(s, d, q)).toThrow(/perpendicular/)
    expect(release).toHaveBeenCalledTimes(1)
    expect(() => s.listFaces(d, ['ground'])).toThrow()
  } finally { release.mockRestore(); s.dispose() }
}, 60_000)

it('retains ordered physical and cleanup failures with one actual disposal attempt', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d), actual = s.dispose.bind(s)
  q.axial[1] = structuredClone(q.stops.angular[1])
  const release = vi.spyOn(s, 'dispose').mockImplementation(() => { actual(); throw Error('Original physical-measure cleanup failure') })
  try {
    let error: unknown; try { measureAssemblyLimitedHingeReferences(s, d, q) } catch (e) { error = e }
    expect(error).toBeInstanceOf(NativeCleanupError)
    const failures = (error as AggregateError).errors
    expect(failures).toHaveLength(2); expect((failures[0] as Error).message).toMatch(/perpendicular/)
    expect((failures[1] as Error).message).toBe('Original physical-measure cleanup failure')
    expect(release).toHaveBeenCalledTimes(1)
  } finally { release.mockRestore(); s.dispose() }
}, 60_000)

it('rejects the aggregate six-role proof after reentrant mutation at the last query and disposes once', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d), actual = s.resolveReference.bind(s)
  let count = 0
  // Complete the real sixth query, then invalidate the document before aggregate
  // final assertions. No fabricated support or native response is returned.
  const query = vi.spyOn(s, 'resolveReference').mockImplementation((...args) => {
    const witness = actual(...args); if (++count === 6) d.name += ' changed during query'; return witness
  }), release = vi.spyOn(s, 'dispose')
  try {
    let published: ReturnType<typeof measureAssemblyLimitedHingeReferences> | undefined, error: unknown
    try { published = measureAssemblyLimitedHingeReferences(s, d, q) } catch (e) { error = e }
    expect(published).toBeUndefined(); expect(error).toBeInstanceOf(Error); expect((error as Error).message).toMatch(/documento cambió/)
    expect(count).toBe(6); expect(release).toHaveBeenCalledTimes(1)
    expect(() => s.listFaces(d, ['ground'])).toThrow()
  } finally { query.mockRestore(); release.mockRestore(); s.dispose() }
}, 60_000)

it('distinguishes an actual equal-endpoint phase from a one-degree physical departure', () => {
  const d = documentAt(20), { q, guideSign } = request(d)
  q.stops.arc = { start: (guideSign * 20 + 360) % 360, sweep: 0 }
  const exact = measure(d, q)
  expect(exact.activity).toBe('both'); expect(exact.fullCircle).toBe(false)
  phase(exact.angleRadians, circularRadians(guideSign * 20)); physical(d, 20)
  const departed = documentAt(21), s = new AssemblyGeometrySnapshot(departed)
  try {
    const r = measureAssemblyLimitedHingeReferences(s, departed, q)
    expect(r.status).toBe('ok'); if (r.status !== 'ok') throw Error(r.message)
    expect(r.satisfied).toBe(false); expect(r.hinge.satisfied).toBe(true)
    phase(r.angleRadians, circularRadians(guideSign * 21))
    near(Math.max(-r.marginsRadians.minimum, -r.marginsRadians.maximum), Math.PI / 180, 1e-10)
  } finally { s.dispose() }
}, 60_000)

it('admits a full-circle physical half-turn without inventing an opposite-centre seam stop', () => {
  const d = documentAt(180), { q, guideSign } = request(d); q.stops.arc = { start: 0, sweep: 360 }
  const r = measure(d, q)
  expect(r.fullCircle).toBe(true); expect(r.activity).toBe('interior'); phase(r.angleRadians, circularRadians(guideSign * 180)); physical(d, 180)
}, 60_000)

it('withholds an ambiguous opposite-centre phase for a proper circular interval', () => {
  const d = documentAt(180), { q } = request(d), s = new AssemblyGeometrySnapshot(d)
  try {
    const r = measureAssemblyLimitedHingeReferences(s, d, q)
    expect(r.status).toBe('precisionLimit'); expect('angleRadians' in r).toBe(false); expect('hinge' in r).toBe(false)
    expect(s.listFaces(d, ['ground']).length).toBeGreaterThan(0)
  } finally { s.dispose() }
}, 60_000)

it('rejects a declared circular start lost during degree-to-radian conversion without publishing phase', () => {
  const d = documentAt(), { q } = request(d), s = new AssemblyGeometrySnapshot(d)
  // This smallest positive Float64 degree value underflows when multiplied by
  // pi/180. It is not an intended declaration of a zero-degree start.
  q.stops.arc = { start: Number.MIN_VALUE, sweep: 60 }
  try {
    const r = measureAssemblyLimitedHingeReferences(s, d, q)
    expect(r.status).toBe('precisionLimit'); expect('angleRadians' in r).toBe(false); expect('marginsRadians' in r).toBe(false)
    expect(s.listFaces(d, ['ground']).length).toBeGreaterThan(0)
  } finally { s.dispose() }
}, 60_000)
