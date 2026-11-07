import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import originalFixture from './fixtures/assembly-material-arc-original.json'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import { validateAssemblyArcPathSelection, type AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyArcPathPlacementArithmetic } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError } from './kernel.native-ownership'

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

it('reconstructs the original sector solid with independent volume, surface and bounds', () => {
  const input = original(), before = structuredClone(input), scene = buildAssemblyScene(input)
  expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(2); expect(scene.prototypeCount).toBe(1)
  expect(Math.abs(scene.volume - 8 * Math.PI)).toBeLessThan(1e-5)
  expect(Math.abs(scene.area - (12 * Math.PI + 32))).toBeLessThan(1e-5)
  for (const body of scene.bodies) {
    expect(body.solidCount).toBe(1); expect(body.body).toEqual({ bodyId: 'sector', sourceFeatureId: 'solid' })
    expect(Math.abs(body.volume - 4 * Math.PI)).toBeLessThan(1e-5)
    expect(Math.abs(body.area - (6 * Math.PI + 16))).toBeLessThan(1e-5)
    near(body.bounds.min, [3, -2, 0], 1e-6); near(body.bounds.max, [5, 0, 4], 1e-6)
  }
  expect(input).toEqual(before)
})

for (const explicit of [false, true]) it('queries fresh material circular endpoints and directed metric evaluation, explicit=' + explicit, () => {
  const input = original()
  if (!explicit) {
    const part = input.definitions[0]; if (part.kind !== 'part') throw Error('Expected original part')
    const solid = part.document.features.find(f => f.type === 'extrude')!; if (solid.type !== 'extrude') throw Error('Expected extrusion')
    delete solid.bodyOperation
  }
  const s = arcSelection(input), reverse = arcSelection(input, ['a'], true), snapshot = new AssemblyGeometrySnapshot(input)
  const queries = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath'), evaluations = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPathEvaluation')
  try {
    const w = snapshot.resolveArcPathSelection(input, s)
    expect(w.kind).toBe('arc-path'); expect(w.origin).toBe('native-circular-material-endpoint')
    expect(w.localCurve.kind).toBe('circle'); expect(w.localCurve.closed).toBe(false)
    near(w.localCurve.center, [3, -2, 4]); expect(w.localCurve.radiusMm).toBeCloseTo(2, 12)
    near(w.localCurve.startPoint, [5, -2, 4]); near(w.localCurve.endPoint, [3, 0, 4]); expect(w.localCurve.lengthMm).toBeCloseTo(Math.PI, 12)
    const half = snapshot.evaluateArcPathSelection(input, s, { kind: 'arc-length', distanceMm: Math.PI / 2 })
    near(half.localEvaluation.point, [3 + Math.SQRT2, -2 + Math.SQRT2, 4]); near(half.worldEvaluation.tangent, [-Math.SQRT1_2, Math.SQRT1_2, 0])
    const backward = snapshot.evaluateArcPathSelection(input, reverse, { kind: 'arc-length', distanceMm: 0 })
    near(backward.localCurve.startPoint, [3, 0, 4]); near(backward.worldEvaluation.point, [3, 0, 4]); near(backward.worldEvaluation.tangent, [1, 0, 0])
    const rawMidpoint = (w.localCurve.startParameter + w.localCurve.endParameter) / 2
    const parameter = snapshot.evaluateArcPathSelection(input, s, { kind: 'parameter', parameter: rawMidpoint })
    near(parameter.worldEvaluation.point, [3 + Math.SQRT2, -2 + Math.SQRT2, 4]); expect(parameter.localEvaluation.arcLengthMm).toBeCloseTo(Math.PI / 2, 12)
    expect(queries).toHaveBeenCalledTimes(1); expect(evaluations).toHaveBeenCalledTimes(3)
    expect(snapshot.assertArcPathWitness(w, input)).toBe(w); expect(snapshot.assertArcPathWitness(half, input)).toBe(half)
    expect(Object.isFrozen(half.worldEvaluation.point)).toBe(true)
    expect(Object.isFrozen(w.localCurve.startPoint)).toBe(true)
  } finally { queries.mockRestore(); evaluations.mockRestore(); snapshot.dispose() }
})

it('keeps copied, foreign, generic bounded and material LINE proof purposes separate', () => {
  const input = original(), s = arcSelection(input), snapshot = new AssemblyGeometrySnapshot(input), foreign = new AssemblyGeometrySnapshot(input)
  try {
    const w = snapshot.resolveArcPathSelection(input, s), generic = snapshot.resolvePathCurveSelection(input, { component: s.component, body: s.body, edge: s.edge, sense: 1 })
    expect(() => snapshot.assertArcPathWitness(structuredClone(w), input)).toThrow()
    expect(() => foreign.assertArcPathWitness(w, input)).toThrow()
    expect(() => snapshot.assertArcPathWitness(generic as never, input)).toThrow()
    expect(() => snapshot.assertPathCurveWitness(w as never, input)).toThrow()
    expect(() => snapshot.assertLinePathWitness(w as never, input)).toThrow()
    expect(() => snapshot.assertWitness(w as never, input)).toThrow()
    expect(() => assemblyArcPathPlacementArithmetic(structuredClone(w), input)).toThrow()
    const changed = structuredClone(input); changed.occurrences[0].pose.translation[0]++
    expect(() => snapshot.assertArcPathWitness(w, changed)).toThrow()
    snapshot.dispose(); expect(() => snapshot.assertArcPathWitness(w, input)).toThrow()
  } finally { snapshot.dispose(); foreign.dispose() }
})

it('composes the true 3D nested arc and reuses one prototype without merging occurrence identity', () => {
  const input = original(); nested(input, [10, 20, 30], [2, 0, 0], true)
  input.occurrences.push({ ...structuredClone(input.occurrences[0]), id: 'other', name: 'Other root use', pose: { translation: [-10, -20, -30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } })
  const s = arcSelection(input, ['outer', 'inner']), other = arcSelection(input, ['other', 'inner']), scoped = structuredClone(s)
  scoped.component.occurrencePath = ['inner']
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    // inner Rx90: (x,y,z)->(x+2,-z,y), outer Rz90+t:
    // (x,y,z)->(z+10,x+22,y+30).
    const w = snapshot.evaluateArcPathSelection(input, scoped, { kind: 'arc-length', distanceMm: Math.PI / 2 }, ['outer'])
    near(w.worldCurve.center, [14, 25, 28]); near(w.worldCurve.normal, [1, 0, 0])
    near(w.worldCurve.startPoint, [14, 27, 28]); near(w.worldCurve.endPoint, [14, 25, 30])
    near(w.worldEvaluation.point, [14, 25 + Math.SQRT2, 28 + Math.SQRT2]); near(w.worldEvaluation.tangent, [0, -Math.SQRT1_2, Math.SQRT1_2])
    expect(w.componentPath).toEqual(['outer', 'inner'])
    const b = snapshot.evaluateArcPathSelection(input, other, { kind: 'arc-length', distanceMm: Math.PI / 2 })
    near(b.worldEvaluation.point, [-6, -15 + Math.SQRT2, -32 + Math.SQRT2]); expect(b.componentPath).toEqual(['other', 'inner'])
    expect(w.localCurve).toEqual(b.localCurve)
    expect(assemblyArcPathPlacementArithmetic(w, input).depth).toBe(2)
    expect(assemblyArcPathPlacementArithmetic(w, input).placementSum).toBeCloseTo(Math.sqrt(1400) + 2, 12)
  } finally { snapshot.dispose() }
})

it('retains the original cancelled placement magnitude instead of admitting small final coordinates', () => {
  const input = original(); nested(input, [1e16, 0, 0], [-1e16, 0, 0])
  const s = arcSelection(input, ['outer', 'inner']), rejected = new AssemblyGeometrySnapshot(input)
  try { expect(() => rejected.resolveArcPathSelection(input, s)).toThrow(/precisionLimit/); expect(() => rejected.resolveArcPathSelection(input, s)).toThrow() } finally { rejected.dispose() }
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const w = snapshot.evaluateArcPathSelection(input, s, { kind: 'arc-length', distanceMm: Math.PI / 2 }, [], { lengthToleranceMm: 1e5 })
    near(w.worldEvaluation.point, [3 + Math.SQRT2, -2 + Math.SQRT2, 4])
    expect(w.worldCurve.precision.positionMm).toBeGreaterThan(100); expect(w.localCurve.precision.positionMm).toBeLessThan(1e-6)
    expect(assemblyArcPathPlacementArithmetic(w, input)).toEqual({ placementSum: 2e16, depth: 2 })
  } finally { snapshot.dispose() }
})

it('rejects malformed executable selection, scope and coordinate before native query without consuming the session', () => {
  const input = original(), s = arcSelection(input), snapshot = new AssemblyGeometrySnapshot(input), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath'), evaluate = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPathEvaluation')
  let reads = 0
  try {
    const bad = { ...s }; Object.defineProperty(bad, 'startVertex', { enumerable: true, get() { reads++; return s.startVertex } })
    expect(() => snapshot.resolveArcPathSelection(input, bad)).toThrow()
    expect(() => snapshot.resolveArcPathSelection(input, s, new Array(1))).toThrow()
    expect(() => snapshot.evaluateArcPathSelection(input, s, { kind: 'parameter', get parameter() { reads++; return 0 } })).toThrow()
    expect(() => validateAssemblyArcPathSelection({ ...s, sense: 1 })).toThrow()
    expect(query).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled(); expect(reads).toBe(0)
    expect(snapshot.resolveArcPathSelection(input, s).kind).toBe('arc-path')
  } finally { query.mockRestore(); evaluate.mockRestore(); snapshot.dispose() }
})

for (const error of ['nonincident', 'other-body', 'aggregate', 'old-source', 'suppressed'] as const) it('withholds current material incidence for ' + error, () => {
  const input = original(), s = arcSelection(input)
  if (error === 'suppressed') input.occurrences[0].suppressed = true
  const snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const bad = structuredClone(s)
    if (error === 'nonincident') bad.startVertex = bodyAt(input).vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - [3, -2, 4][i]) < 1e-12))!.selection.vertex
    if (error === 'other-body') bad.body = { ...s.body!, bodyId: 'foreign-sector' }
    if (error === 'aggregate') bad.body = null
    if (error === 'old-source') bad.component.definition.revision = 'obsolete'
    expect(() => snapshot.resolveArcPathSelection(input, bad)).toThrow()
    if (error === 'old-source') expect(snapshot.resolveArcPathSelection(input, s).kind).toBe('arc-path')
    else expect(() => snapshot.resolveArcPathSelection(input, s)).toThrow()
  } finally { snapshot.dispose() }
})

it('does not invent an eligible full-circle seam or retain an old material arc origin after rebuilding it closed', () => {
  const input = original(), oldSelection = arcSelection(input), part = input.definitions[0]; if (part.kind !== 'part') throw Error('Expected original part')
  const sketch = part.document.features[0]; if (sketch.type !== 'sketch') throw Error('Expected original sketch')
  sketch.profile = { kind: 'circle', center: [3, -2], radius: 2 }
  const body = bodyAt(input), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    const circles = body.edges!.filter(edge => !edge.support).map(edge => ({ edge, curve: snapshot.resolvePathCurveSelection(input, { ...edge.selection, sense: 1 }).localCurve }))
      .filter(({ curve }) => curve.kind === 'circle' && curve.closed && Math.abs(curve.center[2] - 4) < 1e-12)
    expect(circles).toHaveLength(1)
    expect(body.vertexPoints!.filter(v => Math.abs(v.point[2] - 4) < 1e-12)).toEqual([])
    const s = { ...structuredClone(circles[0].edge.selection), startVertex: oldSelection.startVertex }
    expect(() => snapshot.resolveArcPathSelection(input, s)).toThrow()
    expect(() => snapshot.resolveArcPathSelection(input, s)).toThrow()
  } finally { snapshot.dispose() }
})

for (const distanceMm of [-1e-4, Math.PI + 1e-4]) it('does not extrapolate a material arc evaluation at ' + distanceMm, () => {
  const input = original(), s = arcSelection(input), snapshot = new AssemblyGeometrySnapshot(input)
  try { expect(() => snapshot.evaluateArcPathSelection(input, s, { kind: 'arc-length', distanceMm })).toThrow(); expect(() => snapshot.resolveArcPathSelection(input, s)).toThrow() } finally { snapshot.dispose() }
})

for (const action of ['dispose', 'mutate', 'fault', 'cleanup'] as const) it('withholds publication and old authority after native ' + action, () => {
  const input = original(), s = arcSelection(input), snapshot = new AssemblyGeometrySnapshot(input), old = CadEngine.prototype.inspectCurrentArcPath
  const prior = snapshot.resolveArcPathSelection(input, s)
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath').mockImplementation(function (this: CadEngine, ...args) {
    const result = old.apply(this, args)
    if (action === 'dispose') snapshot.dispose()
    if (action === 'mutate') input.occurrences[0].name = 'Reentrant edit'
    if (action === 'fault') throw Error('Injected native query failure after actual geometry')
    if (action === 'cleanup') throw new NativeCleanupError({ error: Error('Injected failed native query') }, [Error('Injected native release failure')], 'Original arc query/release failed')
    return result
  })
  try { expect(() => snapshot.resolveArcPathSelection(input, s)).toThrow(); expect(() => snapshot.assertArcPathWitness(prior, input)).toThrow(); expect(() => snapshot.resolveArcPathSelection(input, s)).toThrow() } finally { query.mockRestore(); snapshot.dispose() }
})

it('does not turn a source tuple or body-producer alias into a current arc', () => {
  const input = original(), s = arcSelection(input), snapshot = new AssemblyGeometrySnapshot(input)
  try {
    expect(() => snapshot.resolveArcPathSelection(input, { ...s, startVertex: { ...s.startVertex, sourceFeatureId: 'other-solid' } })).toThrow()
    // Malformed producer syntax is preflight, so the same current session remains usable.
    const w = snapshot.resolveArcPathSelection(input, s)
    input.definitions[0].revision = 'r2'
    expect(() => snapshot.assertArcPathWitness(w, input)).toThrow()
  } finally { snapshot.dispose() }
})
