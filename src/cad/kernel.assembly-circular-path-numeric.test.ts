import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import originalFixture from './fixtures/assembly-material-arc-original.json'
import { validateAssemblyDocument, type AssemblyDocument, type AssemblyVertexReference } from '../model/assemblyDocument'
import type { AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import { identityRigidPose, type RigidPose } from '../model/rigidPose'
import { evaluateRigidMates } from '../model/assemblyMateEquations'
import { solveRigidMates, type RigidMateSolveResult } from '../model/assemblySolver'
import { projectRigidMateTarget } from '../model/assemblyProjection'
import type { RigidCircularPathConstraint, RigidMateProblem } from '../model/assemblySolveTypes'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'

// Original GPL-3.0-only sector fixture: R2 around (3,-2), CCW quarter arc,
// two radii, extrusion4. Reuse its upper radial-junction vertex as the point.
// This file is a numerical/CAD experiment, NOT a production native adapter.
// All numerical error inputs below are independently DECLARED 1e-12 mm/rad
// budgets for these hand-authored analytic inputs. They are not certified
// native metrology and are never inferred from a BRep topology tolerance.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const LENGTH = 1e-6, ANGLE = 1e-8, DECLARED_ERROR = 1e-12
const near = (actual: readonly number[], expected: readonly number[], band = LENGTH) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, i) => expect(Math.abs(value - expected[i])).toBeLessThanOrEqual(band))
}
function original() {
  const document = validateAssemblyDocument(originalFixture)
  document.occurrences.find(o => o.id === 'b')!.pose.translation = [4, 1, -1]
  return document
}
function selections(document: AssemblyDocument): { arc: AssemblyArcPathSelection; point: AssemblyVertexReference } {
  const scene = buildAssemblyScene(document), path = scene.bodies.find(body => body.component.occurrencePath[0] === 'a')!, point = scene.bodies.find(body => body.component.occurrencePath[0] === 'b')!
  const starts = path.vertexPoints!.filter(v => v.point.every((x, i) => Math.abs(x - [5, -2, 4][i]) < 1e-12))
  const points = point.vertexPoints!.filter(v => v.point.every((x, i) => Math.abs(x - [3, -2, 4][i]) < 1e-12))
  expect(starts).toHaveLength(1); expect(points).toHaveLength(1)
  const snapshot = new AssemblyGeometrySnapshot(document)
  try {
    // Generic observations locate the current candidate only. Targets and the
    // manually declared solver frame below come from the original recipe.
    const arcs = path.edges!.filter(edge => !edge.support).filter(edge => {
      const w = snapshot.resolvePathCurveSelection(document, { ...edge.selection, sense: 1 })
      return w.localCurve.kind === 'circle' && !w.localCurve.closed && Math.abs(w.localCurve.center[2] - 4) < 1e-12
    })
    expect(arcs).toHaveLength(1)
    const arc = { ...structuredClone(arcs[0].selection), startVertex: { ...starts[0].selection.vertex } }
    const pointReference: AssemblyVertexReference = { kind: 'vertex', ...structuredClone(points[0].selection), support: 'point' }
    const observed = snapshot.resolveArcPathSelection(document, arc), observedPoint = snapshot.resolveVertexReference(document, pointReference)
    near(observed.localCurve.center, [3, -2, 4], 1e-10); near(observed.localCurve.startPoint, [5, -2, 4], 1e-10); near(observed.localCurve.endPoint, [3, 0, 4], 1e-10)
    near(observedPoint.localSupport.point, [3, -2, 4], 1e-10)
    expect(observed.localCurve.radiusMm).toBeCloseTo(2, 12); expect(observed.localCurve.lengthMm).toBeCloseTo(Math.PI, 12)
    snapshot.assertArcPathWitness(observed, document); snapshot.assertPointWitness(observedPoint, document)
    return { arc, point: pointReference }
  } finally { snapshot.dispose() }
}
function numeric(document: AssemblyDocument, position: RigidCircularPathConstraint['position']): RigidMateProblem {
  const constraint: RigidCircularPathConstraint = {
    id: 'original-numeric-circle', type: 'circular-path',
    first: { bodyId: 'b', frame: identityRigidPose(), support: { kind: 'point', point: [3, -2, 4], tolerance: DECLARED_ERROR } },
    second: { bodyId: 'a', frame: identityRigidPose(), arc: { center: [3, -2, 4], radial: [1, 0, 0], tangent: [0, 1, 0], radiusMm: 2, sweepRad: Math.PI / 2,
      positionErrorMm: DECLARED_ERROR, radiusErrorMm: DECLARED_ERROR, frameErrorRad: DECLARED_ERROR, sweepErrorRad: DECLARED_ERROR } }, position,
  }
  return { bodies: document.occurrences.map(o => ({ id: o.id, pose: structuredClone(o.pose) as RigidPose, fixed: o.fixed })), constraints: [constraint],
    origin: [0, 0, 0], lengthScale: 10, lengthTolerance: LENGTH, angleTolerance: ANGLE }
}
function candidate(document: AssemblyDocument, result: RigidMateSolveResult) {
  expect(['underdefined', 'fullyDefined']).toContain(result.status)
  expect(result.poses).not.toBeNull()
  const next = validateAssemblyDocument(document)
  for (const occurrence of next.occurrences) {
    const pose = result.poses!.get(occurrence.id)
    expect(pose).toBeDefined(); occurrence.pose = structuredClone(pose!)
  }
  expect(next.occurrences.find(o => o.id === 'a')!.pose).toEqual(document.occurrences.find(o => o.id === 'a')!.pose)
  return next
}
function nativeGeometry(document: AssemblyDocument) {
  const scene = buildAssemblyScene(document)
  expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(2); expect(scene.prototypeCount).toBe(1)
  expect(Math.abs(scene.volume - 8 * Math.PI)).toBeLessThan(1e-5)
  expect(Math.abs(scene.area - (12 * Math.PI + 32))).toBeLessThan(1e-5)
  for (const body of scene.bodies) {
    expect(body.solidCount).toBe(1); expect(body.body).toEqual({ bodyId: 'sector', sourceFeatureId: 'solid' })
    expect(Math.abs(body.volume - 4 * Math.PI)).toBeLessThan(1e-5)
    expect(Math.abs(body.area - (6 * Math.PI + 16))).toBeLessThan(1e-5)
  }
  const fixed = scene.bodies.find(body => body.component.occurrencePath[0] === 'a')!
  near(fixed.bounds.min, [3, -2, 0]); near(fixed.bounds.max, [5, 0, 4])
  return scene
}
function independentlyRead(document: AssemblyDocument, references: ReturnType<typeof selections>) {
  const snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const arc = snapshot.resolveArcPathSelection(document, references.arc), point = snapshot.resolveVertexReference(document, references.point)
    near(arc.worldCurve.center, [3, -2, 4], 1e-10); expect(arc.worldCurve.radiusMm).toBeCloseTo(2, 12)
    const P = [...point.worldSupport.point], dx = P[0] - 3, dy = P[1] + 2
    expect(Math.abs(P[2] - 4)).toBeLessThanOrEqual(LENGTH)
    expect(Math.abs(Math.hypot(dx, dy) - 2)).toBeLessThanOrEqual(LENGTH)
    // Independent analytic material phase; not the numerical constraint helper.
    const phase = Math.atan2(dy, dx)
    snapshot.assertArcPathWitness(arc, document); snapshot.assertPointWitness(point, document)
    return { P, phase }
  } finally { snapshot.dispose() }
}

it('solves Free trim without prescribing a unique point-body pose and re-queries actual transformed BRep', () => {
  const document = original(), references = selections(document), problem = numeric(document, { mode: 'free', domain: 'trim' }), before = structuredClone(problem)
  const result = solveRigidMates(problem), next = candidate(document, result), final = independentlyRead(next, references)
  expect(final.phase).toBeGreaterThanOrEqual(-ANGLE); expect(final.phase).toBeLessThanOrEqual(Math.PI / 2 + ANGLE)
  expect(evaluateRigidMates(problem, result.poses!).checks[0].satisfied).toBe(true)
  nativeGeometry(next); expect(problem).toEqual(before); expect(next.definitions).toEqual(document.definitions); expect(next.mates).toEqual([])
})

for (const [distanceMm, point, tangent] of [
  [0, [5, -2, 4], [0, 1, 0]],
  [Math.PI / 2, [3 + Math.SQRT2, -2 + Math.SQRT2, 4], [-Math.SQRT1_2, Math.SQRT1_2, 0]],
  [Math.PI, [3, 0, 4], [-1, 0, 0]],
] as const) it('solves a fixed circular coordinate with native changing tangent Follow, distance=' + distanceMm, () => {
  const document = original(), references = selections(document), problem = numeric(document, { mode: 'coordinate', distanceMm })
  const constraint = problem.constraints[0] as RigidCircularPathConstraint
  constraint.follow = { axis: [1, 0, 0], reverse: false, directionErrorRad: DECLARED_ERROR }
  const before = structuredClone(document), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPathEvaluation')
  try {
    const result = solveRigidMates(problem), next = candidate(document, result), final = independentlyRead(next, references)
    near(final.P, point)
    const scene = nativeGeometry(next), body = scene.bodies.find(b => b.component.occurrencePath[0] === 'b')!
    const origin = body.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [3, -2, 4][i]) < 1e-12))!.worldPoint
    const X = body.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [5, -2, 4][i]) < 1e-12))!.worldPoint
    near(X.map((v, i) => (v - origin[i]) / 2), tangent, ANGLE)
    const snapshot = new AssemblyGeometrySnapshot(next)
    try {
      // The reconstructed trim length may be one ULP below analytic pi. Query
      // its actual endpoint parameter, without clamping/widening the observer's
      // finite metric domain. The numeric target and Cartesian oracle stay pi.
      const current = snapshot.resolveArcPathSelection(next, references.arc)
      const coordinate = distanceMm === Math.PI ? { kind: 'parameter' as const, parameter: current.localCurve.endParameter } : { kind: 'arc-length' as const, distanceMm }
      const actual = snapshot.evaluateArcPathSelection(next, references.arc, coordinate)
      near(actual.worldEvaluation.point, point, 1e-10); near(actual.worldEvaluation.tangent, tangent, 1e-10)
      near(final.P, actual.worldEvaluation.point); snapshot.assertArcPathWitness(actual, next)
    } finally { snapshot.dispose() }
    expect(query).toHaveBeenCalledTimes(1)
    expect(document).toEqual(before)
  } finally { query.mockRestore() }
})

it('keeps Follow reversal separate from the material-origin coordinate at the native half arc', () => {
  const document = original(), references = selections(document), problem = numeric(document, { mode: 'coordinate', distanceMm: Math.PI / 2 })
  const constraint = problem.constraints[0] as RigidCircularPathConstraint
  constraint.follow = { axis: [1, 0, 0], reverse: true, directionErrorRad: DECLARED_ERROR }
  const next = candidate(document, solveRigidMates(problem)), final = independentlyRead(next, references), scene = nativeGeometry(next)
  near(final.P, [3 + Math.SQRT2, -2 + Math.SQRT2, 4])
  const body = scene.bodies.find(b => b.component.occurrencePath[0] === 'b')!, C = body.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [3, -2, 4][i]) < 1e-12))!.worldPoint
  const X = body.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [5, -2, 4][i]) < 1e-12))!.worldPoint
  near(X.map((v, i) => (v - C[i]) / 2), [Math.SQRT1_2, -Math.SQRT1_2, 0], ANGLE)
})

it('projects an actual Free-trim midpoint to its explicit material endpoint target', () => {
  const document = original(); document.occurrences.find(o => o.id === 'b')!.pose.translation = [Math.SQRT2, Math.SQRT2, 0]
  const references = selections(document), problem = numeric(document, { mode: 'free', domain: 'trim' })
  const result = projectRigidMateTarget(problem, { bodyId: 'b', frame: identityRigidPose(), targetPose: { translation: [2, 0, 0], rotation: [0, 0, 0, 1] }, mode: 'translate' })
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw Error('Expected bounded endpoint projection')
  const next = candidate(document, result.result), final = independentlyRead(next, references)
  near(final.P, [5, -2, 4]); nativeGeometry(next)
})

it('keeps support-circle numerical policy distinct from the actual finite material trim', () => {
  const document = original(); document.occurrences.find(o => o.id === 'b')!.pose.translation = [0, -2, 0]
  document.occurrences.forEach(o => { o.fixed = true })
  const references = selections(document), support = numeric(document, { mode: 'free', domain: 'support-circle' })
  const result = solveRigidMates(support), next = candidate(document, result), final = independentlyRead(next, references)
  near(final.P, [3, -4, 4]); expect(final.phase).toBeCloseTo(-Math.PI / 2, 12)
  const trim = numeric(document, { mode: 'free', domain: 'trim' }), refused = solveRigidMates(trim)
  expect(refused.poses).toBeNull(); nativeGeometry(next)
  // No finite native arc evaluation is fabricated at this outside point. This
  // tests two explicit numerical domains, not a saved or external Path policy.
})

it('refuses independently declared radius uncertainty without consuming the actual native observation', () => {
  const document = original(), references = selections(document), problem = numeric(document, { mode: 'coordinate', distanceMm: Math.PI / 2 })
  const constraint = problem.constraints[0] as RigidCircularPathConstraint; constraint.second.arc.radiusErrorMm = 1e-3
  const before = structuredClone(problem), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const proof = snapshot.resolveArcPathSelection(document, references.arc), result = solveRigidMates(problem)
    expect(result.status).toBe('precisionLimit'); expect(result.poses).toBeNull(); expect(result.certificates).toEqual([])
    expect(snapshot.assertArcPathWitness(proof, document)).toBe(proof); expect(problem).toEqual(before)
  } finally { snapshot.dispose() }
})
