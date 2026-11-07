import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import originalFixture from './fixtures/assembly-material-arc-original.json'
import { validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import type { AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import { AssemblyGeometrySnapshot, assemblyArcPathPlacementArithmetic } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { AssemblyPathCurvePrecisionError } from './kernel.assembly-path-curves'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const original = () => validateAssemblyDocument(originalFixture)
const near = (a: readonly number[], b: readonly number[], band = 1e-10) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(band))
function selection(document: AssemblyDocument, reverse = false): AssemblyArcPathSelection {
  const body = buildAssemblyScene(document).bodies.find(b => b.component.occurrencePath[0] === 'a')!, snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const edges = body.edges!.filter(e => !e.support).filter(e => {
      const curve = snapshot.resolvePathCurveSelection(document, { ...e.selection, sense: 1 }).localCurve
      return curve.kind === 'circle' && !curve.closed && Math.abs(curve.center[2] - 4) < 1e-12
    })
    expect(edges).toHaveLength(1)
    const target = reverse ? [3, 0, 4] : [5, -2, 4], point = body.vertexPoints!.find(v => v.point.every((x, i) => Math.abs(x - target[i]) < 1e-12))!
    return { ...structuredClone(edges[0].selection), startVertex: { ...point.selection.vertex } }
  } finally { snapshot.dispose() }
}
function nested(document: AssemblyDocument, outer: [number, number, number], inner: [number, number, number], rotate = false) {
  const part = document.definitions[0]
  document.definitions.push({ kind: 'assembly', id: 'group', revision: 'r1', name: 'Original rigid group', createdAt: document.createdAt, updatedAt: document.updatedAt, mates: [],
    occurrences: [{ id: 'inner', name: 'Original sector', definition: { id: part.id, revision: part.revision }, pose: { translation: inner, rotation: rotate ? [Math.SQRT1_2, 0, 0, Math.SQRT1_2] : [0, 0, 0, 1] }, fixed: false, visible: true, suppressed: false }] })
  document.occurrences = [{ id: 'outer', name: 'Original outer', definition: { id: 'group', revision: 'r1' }, pose: { translation: outer, rotation: rotate ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : [0, 0, 0, 1] }, fixed: true, visible: true, suppressed: false }]
}
for (const reverse of [false, true]) it('composes a proper directed material frame through noncommuting actual placements ' + reverse, () => {
  const document = original(), selected = selection(document, reverse)
  nested(document, [10, 20, 30], [1, 2, 3], true)
  selected.component.occurrencePath = ['outer', 'inner']
  const snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const result = snapshot.resolveArcPathSelection(document, selected), local = result.localCurve, world = result.worldCurve
    near(world.center, [12, 24, 31])
    near(world.materialFrame.radial, reverse ? [0, 0, 1] : [0, 1, 0])
    near(world.materialFrame.tangent, reverse ? [0, 1, 0] : [0, 0, 1])
    near(world.materialFrame.normal, reverse ? [-1, 0, 0] : [1, 0, 0])
    expect(world.arithmetic.radiusMm).toBe(local.arithmetic.radiusMm)
    expect(world.arithmetic.sweepRad).toBe(local.arithmetic.sweepRad)
    expect(world.arithmetic.frameRad).toBe(local.arithmetic.frameRad + 128 * Number.EPSILON * 3)
    expect(world.arithmetic.positionMm).toBeGreaterThan(local.arithmetic.positionMm)
    expect(world.arithmetic).not.toBe(local.arithmetic)
    expect(Object.isFrozen(world.materialFrame.tangent)).toBe(true)
    const generic = snapshot.resolvePathCurveSelection(document, { component: selected.component, body: selected.body, edge: selected.edge, sense: 1 })
    expect(generic.worldCurve.kind).toBe('circle')
    if (generic.localCurve.kind !== 'circle' || generic.worldCurve.kind !== 'circle') throw Error('Expected original native circle')
    expect(generic.worldCurve.analyticArithmetic!.positionMm).toBeGreaterThan(generic.localCurve.analyticArithmetic!.positionMm)
    expect(generic.worldCurve.analyticArithmetic!.radiusMm).toBe(generic.localCurve.analyticArithmetic!.radiusMm)
    snapshot.assertArcPathWitness(result, document)
    const scene = buildAssemblyScene(document)
    expect(scene.solidCount).toBe(1); expect(Math.abs(scene.volume - 4 * Math.PI)).toBeLessThan(1e-5)
    expect(Math.abs(scene.area - (6 * Math.PI + 16))).toBeLessThan(1e-5)
    near(scene.bodies[0].bounds.min, [8, 24, 31], 1e-6); near(scene.bodies[0].bounds.max, [12, 26, 33], 1e-6)
  } finally { snapshot.dispose() }
})

it('retains cancelled original translations without inflating invariant radius/sweep or angular budgets', () => {
  const document = original(), selected = selection(document)
  nested(document, [1e16, 0, 0], [-1e16, 0, 0]); selected.component.occurrencePath = ['outer', 'inner']
  const snapshot = new AssemblyGeometrySnapshot(document)
  try {
    // An explicit wide linear band exposes the original arithmetic accounting;
    // it does not establish default-band precision at these placements.
    const result = snapshot.resolveArcPathSelection(document, selected, [], { lengthToleranceMm: 1e5 })
    const budget = assemblyArcPathPlacementArithmetic(result, document)
    expect(budget).toEqual({ placementSum: 2e16, depth: 2 })
    near(result.worldCurve.center, [3, -2, 4])
    expect(result.worldCurve.arithmetic.positionMm).toBeGreaterThan(1e-6)
    expect(result.worldCurve.arithmetic.positionMm).toBeGreaterThanOrEqual(128 * Number.EPSILON * 3 * 2e16)
    expect(result.worldCurve.arithmetic.radiusMm).toBe(result.localCurve.arithmetic.radiusMm)
    expect(result.worldCurve.arithmetic.sweepRad).toBe(result.localCurve.arithmetic.sweepRad)
    expect(result.worldCurve.arithmetic.frameRad).toBeLessThan(1e-8)
  } finally { snapshot.dispose() }
  const refused = new AssemblyGeometrySnapshot(document)
  try { expect(() => refused.resolveArcPathSelection(document, selected)).toThrow(AssemblyPathCurvePrecisionError) }
  finally { refused.dispose() }
})

for (const field of ['positionMm', 'frameRad'] as const) it('withholds the new world arithmetic proof when its ' + field + ' envelope exhausts the band', () => {
  const document = original(), selected = selection(document)
  nested(document, [1000, -2000, 3000], [-1000, 2000, -3000]); selected.component.occurrencePath = ['outer', 'inner']
  const snapshot = new AssemblyGeometrySnapshot(document), query = CadEngine.prototype.inspectCurrentArcPath
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath').mockImplementation(function (this: CadEngine, ...args) {
    const result = query.apply(this, args)
    // Actual geometry is forwarded unchanged; only a declared error is raised.
    return { ...result, arithmetic: { ...result.arithmetic, [field]: field === 'positionMm' ? 1e-6 - 1e-13 : 1e-8 - 1e-14 } }
  })
  try {
    expect(() => snapshot.resolveArcPathSelection(document, selected)).toThrow(AssemblyPathCurvePrecisionError)
    expect(() => snapshot.resolveArcPathSelection(document, selected)).toThrow()
  } finally { spy.mockRestore(); snapshot.dispose() }
})

it('does not issue a material proof with a negative analytic error field', () => {
  const document = original(), selected = selection(document), snapshot = new AssemblyGeometrySnapshot(document), query = CadEngine.prototype.inspectCurrentArcPath
  const spy = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath').mockImplementation(function (this: CadEngine, ...args) {
    const result = query.apply(this, args); return { ...result, arithmetic: { ...result.arithmetic, radiusMm: -1 } }
  })
  try { expect(() => snapshot.resolveArcPathSelection(document, selected)).toThrow(AssemblyPathCurvePrecisionError) }
  finally { spy.mockRestore(); snapshot.dispose() }
})
