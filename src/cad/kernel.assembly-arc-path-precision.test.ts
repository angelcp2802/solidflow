import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import originalFixture from './fixtures/assembly-material-arc-original.json'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { type AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import { AssemblyGeometrySnapshot, assemblyArcPathPlacementArithmetic } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { AssemblyPathCurvePrecisionError } from './kernel.assembly-path-curves'

// Original GPL-3.0-only recipe, 22 October 2026. No external native model:
// first-quadrant R2 sector around (3,-2), two radial LINEs, positive extrusion4.
// A_sector=pi; perimeter=pi+4; V=4pi; A_total=2pi+4(pi+4)=6pi+16.
beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const original = () => validateAssemblyDocument(originalFixture)
const near = (actual: readonly number[], expected: readonly number[], band = 1e-10) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(band))
}
function bodyAt(input: AssemblyDocument, occurrencePath = ['a']) {
  const bodies = buildAssemblyScene(input).bodies.filter(body => JSON.stringify(body.component.occurrencePath) === JSON.stringify(occurrencePath))
  expect(bodies).toHaveLength(1)
  return bodies[0]
}
function arcSelection(input: AssemblyDocument, occurrencePath = ['a'], reverse = false): AssemblyArcPathSelection {
  const body = bodyAt(input, occurrencePath), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const matches = body.edges!.filter(edge => !edge.support).filter(edge => {
      const curve = snapshot.resolvePathCurveSelection(input, { ...edge.selection, sense: 1 }, [], { lengthToleranceMm: 1e5 }).localCurve
      return curve.kind === 'circle' && !curve.closed && Math.abs(curve.center[2] - 4) < 1e-12 && Math.abs(curve.radiusMm - 2) < 1e-12
    })
    expect(matches).toHaveLength(1)
    // Cartesian selection locates a candidate only. The API under test must
    // independently authenticate the exact native edge/endpoint incidence.
    const wanted = reverse ? [3, 0, 4] : [5, -2, 4]
    const vertices = body.vertexPoints!.filter(v => v.point.every((x, i) => Math.abs(x - wanted[i]) < 1e-12))
    expect(vertices).toHaveLength(1)
    return { ...structuredClone(matches[0].selection), startVertex: { ...vertices[0].selection.vertex } }
  } finally { snapshot.dispose() }
}
function nested(input: AssemblyDocument, outer: [number, number, number], inner: [number, number, number], rotations = false) {
  const part = input.definitions[0]
  input.definitions.push({ kind: 'assembly', id: 'nested', revision: 'r1', name: 'Original nested sector', createdAt: input.createdAt, updatedAt: input.updatedAt, mates: [],
    occurrences: [{ id: 'inner', name: 'Original inner', definition: { id: part.id, revision: part.revision }, pose: { translation: inner, rotation: rotations ? [Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }] })
  input.occurrences = [{ id: 'outer', name: 'Original outer', definition: { id: 'nested', revision: 'r1' }, pose: { translation: outer, rotation: rotations ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }]
}


// The geometry is always queried from the actual sector. Only a conservative
// declared evaluation error is raised, independently of its endpoint observation.
for (const field of ['positionMm', 'tangentRad'] as const) it('withholds an evaluation proof when world arithmetic exhausts its ' + field + ' band', () => {
  const input = original(), selection = arcSelection(input), snapshot = new AssemblyGeometrySnapshot(input)
  const originalQuery = CadEngine.prototype.inspectCurrentArcPathEvaluation
  const band = field === 'positionMm' ? 1e-6 : 1e-8
  const known = band - (field === 'positionMm' ? 1e-13 : 1e-14)
  let observed = 0, evaluation = 0
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPathEvaluation').mockImplementation(function (this: CadEngine, ...args) {
    const result = originalQuery.apply(this, args)
    observed = result.observation.precision[field]
    evaluation = known
    expect(result.precision[field]).toBeLessThan(known)
    return { ...result, precision: { ...result.precision, [field]: known } }
  })
  try {
    expect(() => snapshot.evaluateArcPathSelection(input, selection, { kind: 'arc-length', distanceMm: Math.PI / 2 })).toThrow(AssemblyPathCurvePrecisionError)
    expect(observed).toBeLessThan(evaluation)
    expect(evaluation).toBeLessThan(band)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(() => snapshot.resolveArcPathSelection(input, selection)).toThrow()
  } finally { spy.mockRestore(); snapshot.dispose() }
})

it('retains evaluation errors and original placement depth without translating radius or tangent uncertainty', () => {
  const input = original(), selected = arcSelection(input)
  nested(input, [1000, -2000, 3000], [-1000, 2000, -3000])
  const selection = { ...selected, component: { ...selected.component, occurrencePath: ['outer', 'inner'] } }
  const snapshot = new AssemblyGeometrySnapshot(input), originalQuery = CadEngine.prototype.inspectCurrentArcPathEvaluation
  const knownPosition = 2e-7, knownTangent = 2e-9
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPathEvaluation').mockImplementation(function (this: CadEngine, ...args) {
    const result = originalQuery.apply(this, args)
    return { ...result, precision: { ...result.precision, positionMm: knownPosition, tangentRad: knownTangent } }
  })
  try {
    const result = snapshot.evaluateArcPathSelection(input, selection, { kind: 'arc-length', distanceMm: Math.PI / 2 })
    near(result.worldEvaluation.point, [3 + Math.SQRT2, -2 + Math.SQRT2, 4])
    near(result.worldEvaluation.tangent, [-Math.SQRT1_2, Math.SQRT1_2, 0])
    const arithmetic = assemblyArcPathPlacementArithmetic(result, input)
    expect(arithmetic.depth).toBe(2)
    expect(arithmetic.placementSum).toBeCloseTo(2 * Math.sqrt(14e6), 10)
    expect(result.localEvaluation.precision.positionMm).toBe(knownPosition)
    expect(result.localEvaluation.precision.tangentRad).toBe(knownTangent)
    const round = 128 * Number.EPSILON * 3
    expect(result.worldEvaluation.precision.positionMm).toBeGreaterThanOrEqual(knownPosition + round * arithmetic.placementSum)
    expect(result.worldEvaluation.precision.tangentRad).toBe(knownTangent + round)
    expect(result.worldCurve.radiusMm).toBe(result.localCurve.radiusMm)
    expect(result.worldCurve.precision.lengthMm).toBe(result.localCurve.precision.lengthMm)
    expect(result.worldEvaluation.precision.positionMm).toBeGreaterThan(result.worldCurve.precision.positionMm)
    snapshot.assertArcPathWitness(result, input)
  } finally { spy.mockRestore(); snapshot.dispose() }
})
