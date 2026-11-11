import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { validateDocument } from '../model/document'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyOccurrence,
  type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import type { AssemblyProfileAxisSelection } from '../model/assemblyProfileReferences'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyGeometrySnapshot, assemblyProfileAxisPlacementArithmetic, type AssemblyProfileAxisWitness,
  type AssemblyProfileWitness, type AssemblyEndpointWitness } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { NativeCleanupError, withNativeOwners } from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import type { Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
})), 60_000)

// Original disjoint 6x4x3 box, 2x2x3 square prism and R2x3 circular prism.
// Cartesian recipes and endpoints identify intentional test selections; scene
// metadata supplies identity only. A separate native copy supplies the observed
// increasing-parameter D1 sign, independently of the new profile-axis adapter.
const stamp = '2026-10-22T00:00:00.000Z'
const near = (a: readonly number[], b: readonly number[], band = 1e-10) => {
  expect(a).toHaveLength(b.length)
  a.forEach((v, i) => { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v - b[i])).toBeLessThanOrEqual(band) })
}
function occurrence(id: string, definition = { id: 'original-material-profiles', revision: 'r1' }): AssemblyOccurrence {
  return { id, name: id, definition, pose: identityRigidPose(), fixed: true, visible: true, suppressed: false }
}
function original(): AssemblyDocument {
  const p = validateDocument({ version: 1, id: 'original-material-profiles', name: 'Original material profile axes', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'rectangle', name: 'Original 6x4 rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [2, 1], width: 6, height: 4 } },
    { id: 'box', name: 'Original box', type: 'extrude', sketchId: 'rectangle', depth: 3, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'box-body' } },
    { id: 'square', name: 'Original square', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [22, 1], width: 2, height: 2 } },
    { id: 'square-solid', name: 'Original square prism', type: 'extrude', sketchId: 'square', depth: 3, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'square-body' } },
    { id: 'circle', name: 'Original R2 circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'circle', center: [12, 1], radius: 2 } },
    { id: 'disk', name: 'Original circular prism', type: 'extrude', sketchId: 'circle', depth: 3, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'circle-body' } },
  ] })
  const document = createEmptyAssembly('Original material profile proof')
  document.definitions = [{ kind: 'part', id: p.id, revision: 'r1', document: p }]
  document.occurrences = [occurrence('first'), occurrence('second')]
  return validateAssemblyDocument(document)
}
type Side = 'x' | 'y' | 'bottom-x'
function selection(document: AssemblyDocument, bodyId = 'box-body', side: Side = 'x', path = ['first'], sense: 1 | -1 = 1): AssemblyProfileAxisSelection {
  const body = buildAssemblyScene(document).bodies.find(b => b.component.occurrencePath.join('/') === path.join('/') && b.body?.bodyId === bodyId)!
  if (!body) throw Error('Original body missing')
  const face = body.faces.filter(f => f.support?.kind === 'plane' && f.support.normal[2] > .999 && Math.abs(f.support.point[2] - 3) < 1e-10)
  expect(face).toHaveLength(1)
  const y = bodyId === 'square-body' ? 0 : -1, x = bodyId === 'square-body' ? 23 : 5
  const edges = body.edges!.filter(e => {
    if (e.support?.kind !== 'line') return false
    const s = e.support
    return side === 'y' ? Math.abs(s.axis[1]) > .999 && Math.abs(s.point[0] - x) < 1e-10 && Math.abs(s.point[2] - 3) < 1e-10
      : Math.abs(s.axis[0]) > .999 && Math.abs(s.point[1] - y) < 1e-10 && Math.abs(s.point[2] - (side === 'bottom-x' ? 0 : 3)) < 1e-10
  })
  expect(edges).toHaveLength(1)
  return { ...structuredClone(face[0].selection), edge: structuredClone(edges[0].selection.edge), sense }
}
function endpoints(bodyId = 'box-body', side: Side = 'x'): [Vec3, Vec3] {
  if (bodyId === 'square-body') return side === 'y' ? [[23, 0, 3], [23, 2, 3]] : [[21, 0, 3], [23, 0, 3]]
  return side === 'y' ? [[5, -1, 3], [5, 3, 3]] : [[-1, -1, side === 'bottom-x' ? 0 : 3], [5, -1, side === 'bottom-x' ? 0 : 3]]
}
function parameterDirection(document: AssemblyDocument, bodyId = 'box-body', side: Side = 'x'): Vec3 {
  const part = document.definitions.find(d => d.kind === 'part')!
  if (part.kind !== 'part') throw Error('Original part required')
  const engine = new CadEngine(), expected = endpoints(bodyId, side)
  try {
    const built = engine.rebuildForAssemblyReferences(part.document.features)
    if (built.kind !== 'explicit') throw Error('Original explicit bodies required')
    const body = built.bodies.find(b => b.ref.bodyId === bodyId)!
    return withNativeOwners(owners => {
      const shape = owners.own(engine.copyCurrentBodyShape(body.ref)), edges = owners.ownAll(ownedNativeTopology(shape, 'edge')), oc = getOC(), matches: Vec3[] = []
      const coordinate = (p: { X(): number; Y(): number; Z(): number }): Vec3 => [p.X(), p.Y(), p.Z()]
      for (const edge of edges) {
        const curve = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped))
        if (curve.GetType() !== oc.GeomAbs_CurveType.GeomAbs_Line) continue
        const first = curve.FirstParameter(), last = curve.LastParameter(), a = coordinate(owners.own(curve.Value(first))), b = coordinate(owners.own(curve.Value(last)))
        const same = (p: Vec3, q: Vec3) => p.every((v, i) => Math.abs(v - q[i]) < 1e-10)
        if (!(same(a, expected[0]) && same(b, expected[1]) || same(a, expected[1]) && same(b, expected[0]))) continue
        const d = coordinate(owners.own(curve.DN((first + last) / 2, 1))), length = Math.hypot(...d)
        matches.push(d.map(v => v / length) as Vec3)
      }
      expect(matches).toHaveLength(1)
      near(matches[0].map(Math.abs), side === 'y' ? [0, 1, 0] : [1, 0, 0])
      return matches[0]
    })
  } finally { engine.dispose() }
}
const flatten = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(flatten) : [])]

it('issues a fresh exact boundary-axis proof on every joint face/edge query', () => {
  const document = original(), pick = selection(document), derivative = parameterDirection(document), before = serializeAssemblyDocument(document), snapshot = new AssemblyGeometrySnapshot(document),
    query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileAxisSupport')
  try {
    const a = snapshot.resolveProfileAxisSelection(document, pick), b = snapshot.resolveProfileAxisSelection(document, pick)
    expect(query).toHaveBeenCalledTimes(2); expect(a).not.toBe(b); expect(a.kind).toBe('profile-axis'); expect(a.origin).toBe('native-profile-boundary-edge')
    near(a.localSupport.profile.center, [2, 1, 3]); near(a.localSupport.profile.normal, [0, 0, 1]); near(a.localSupport.xDirection, derivative)
    expect(Math.abs(a.localSupport.edgeLengthMm - 6)).toBeLessThan(1e-10); expect(a.localSupport.sense).toBe(1)
    expect(Number.isFinite(a.localSupport.xDirectionErrorRad)).toBe(true); expect(a.localSupport.xDirectionErrorRad).toBeGreaterThanOrEqual(0)
    expect(a.localSupport.xDirectionErrorRad).toBeLessThanOrEqual(1e-8); expect(snapshot.assertProfileAxisWitness(a, document)).toBe(a)
    expect(Object.isFrozen(a.localSupport.xDirection)).toBe(true); expect(Object.isFrozen(a.localSupport.profile.corners[0])).toBe(true)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { query.mockRestore(); snapshot.dispose() }
})

it.each([{ side: 'x' as const, sense: -1 as const }, { side: 'y' as const, sense: 1 as const }, { side: 'y' as const, sense: -1 as const }])(
  'uses only the explicitly selected $side edge and parameter sense$sense', ({ side, sense }) => {
    const document = original(), pick = selection(document, 'box-body', side, ['first'], sense), derivative = parameterDirection(document, 'box-body', side), snapshot = new AssemblyGeometrySnapshot(document)
    try {
      const w = snapshot.resolveProfileAxisSelection(document, pick)
      near(w.localSupport.xDirection, derivative.map(v => sense * v)); near(w.localSupport.profile.normal, [0, 0, 1]); near(w.localSupport.profile.center, [2, 1, 3])
      expect(Math.abs(w.localSupport.edgeLengthMm - (side === 'x' ? 6 : 4))).toBeLessThan(1e-10)
      expect(w.localSupport.sense).toBe(sense)
    } finally { snapshot.dispose() }
  })

it('requires an explicit edge for a square and accepts either declared perpendicular boundary direction', () => {
  const document = original(), x = selection(document, 'square-body'), y = selection(document, 'square-body', 'y'), dx = parameterDirection(document, 'square-body'), dy = parameterDirection(document, 'square-body', 'y'), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const a = snapshot.resolveProfileAxisSelection(document, x), b = snapshot.resolveProfileAxisSelection(document, y)
    near(a.localSupport.profile.center, [22, 1, 3]); near(a.localSupport.xDirection, dx); near(b.localSupport.xDirection, dy)
    expect(Math.abs(a.localSupport.edgeLengthMm - 2)).toBeLessThan(1e-10); expect(Math.abs(b.localSupport.edgeLengthMm - 2)).toBeLessThan(1e-10)
    const { edge: _edge, ...missing } = x
    expect(() => snapshot.resolveProfileAxisSelection(document, missing as AssemblyProfileAxisSelection)).toThrow()
    expect(snapshot.assertProfileAxisWitness(a, document)).toBe(a)
  } finally { snapshot.dispose() }
})

it('rejects a parallel bottom edge in the same current body instead of matching a direction or projected line', () => {
  const document = original(), valid = selection(document), wrong = selection(document, 'box-body', 'bottom-x'), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const prior = snapshot.resolveProfileAxisSelection(document, valid)
    expect(() => snapshot.resolveProfileAxisSelection(document, wrong)).toThrow()
    expect(() => snapshot.assertProfileAxisWitness(prior, document)).toThrow(/vigente/)
  } finally { snapshot.dispose() }
})

it('keeps circles axis-free and refuses to create a rectangle-axis witness from their circular boundary', () => {
  const document = original(), body = buildAssemblyScene(document).bodies.find(b => b.component.occurrencePath[0] === 'first' && b.body?.bodyId === 'circle-body')!,
    face = body.faces.find(f => f.support?.kind === 'plane' && f.support.normal[2] > .999)!,
    edge = body.edges!.find(e => e.lines.length > 0 && e.lines.filter((_, i) => i % 3 === 2).every(z => Math.abs(z - 3) < 1e-10))!, snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const w = snapshot.resolveProfileFaceSelection(document, face.selection)
    expect(w.localSupport.kind).toBe('circle'); near(w.localSupport.center, [12, 1, 3]); expect(w.localSupport).not.toHaveProperty('xDirection')
    expect(() => snapshot.resolveProfileAxisSelection(document, { ...face.selection, edge: edge.selection.edge, sense: 1 })).toThrow()
    expect(() => snapshot.assertProfileWitness(w, document)).toThrow(/vigente/)
  } finally { snapshot.dispose() }
})

it('does not accept ordinary face/edge/profile proofs, copies, or another live session as axis authority', () => {
  const document = original(), pick = selection(document), snapshot = new AssemblyGeometrySnapshot(document), other = new AssemblyGeometrySnapshot(document)
  try {
    const { edge, sense: _sense, ...face } = pick, profile = snapshot.resolveProfileFaceSelection(document, face),
      plane = snapshot.resolveReference(document, { kind: 'face', ...face, support: 'plane' }),
      line = snapshot.resolveReference(document, { kind: 'edge', component: pick.component, body: pick.body, edge, support: 'line' }),
      w = snapshot.resolveProfileAxisSelection(document, pick)
    for (const fake of [profile, plane, line, structuredClone(w)]) expect(() => snapshot.assertProfileAxisWitness(fake as AssemblyProfileAxisWitness, document)).toThrow()
    expect(() => other.assertProfileAxisWitness(w, document)).toThrow(); expect(() => assemblyProfileAxisPlacementArithmetic(structuredClone(w), document)).toThrow()
    expect(() => snapshot.assertProfileWitness(w as unknown as AssemblyProfileWitness, document)).toThrow()
    expect(() => snapshot.assertWitness(w as unknown as AssemblyEndpointWitness, document)).toThrow()
    snapshot.dispose(); expect(() => snapshot.assertProfileAxisWitness(w, document)).toThrow(/vigente/)
  } finally { snapshot.dispose(); other.dispose() }
})

function nested(): AssemblyDocument {
  const document = original(), leaf = occurrence('leaf'); leaf.pose = { translation: [10, -3, 5], rotation: [0, 1 / Math.sqrt(5), 0, 2 / Math.sqrt(5)] }
  const inner: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-axis-inner', revision: 'r1', name: 'Original oblique frame',
    createdAt: stamp, updatedAt: stamp, occurrences: [leaf], mates: [] }
  document.definitions.push(inner)
  document.occurrences = ['left', 'right'].map((id, i) => ({ ...occurrence(id, { id: inner.id, revision: inner.revision }),
    pose: { translation: i ? [23, 1, 7] : [-7, 11, 2], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }))
  return validateAssemblyDocument(document)
}
it('composes explicit material directions through noncommuting nested frames and keeps reused paths distinct', () => {
  const document = nested(), left = selection(document, 'box-body', 'x', ['left', 'leaf']), right = selection(document, 'box-body', 'x', ['right', 'leaf']),
    derivative = parameterDirection(document), build = vi.spyOn(CadEngine.prototype, 'rebuildForAssemblyReferences'), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    expect(build).toHaveBeenCalledTimes(1)
    left.component.occurrencePath = ['leaf']
    const a = snapshot.resolveProfileAxisSelection(document, left, ['left']), b = snapshot.resolveProfileAxisSelection(document, right), sign = derivative[0]
    near(a.worldSupport.profile.center, [-5, 24.6, 7.2]); near(b.worldSupport.profile.center, [25, 14.6, 12.2])
    near(a.worldSupport.profile.normal, [0, .8, .6]); near(a.worldSupport.xDirection, [0, .6 * sign, -.8 * sign]); near(b.worldSupport.xDirection, a.worldSupport.xDirection)
    expect(a.componentPath).toEqual(['left', 'leaf']); expect(b.componentPath).toEqual(['right', 'leaf'])
    expect(a.worldSupport.xDirectionErrorRad).toBeGreaterThanOrEqual(a.localSupport.xDirectionErrorRad)
    expect(assemblyProfileAxisPlacementArithmetic(a, document).depth).toBe(2)
  } finally { snapshot.dispose(); build.mockRestore() }
})

it('retains large cancelled placement errors while composing the direction without translated endpoint subtraction', () => {
  const document = nested(), inner = document.definitions.find(d => d.id === 'original-axis-inner')!
  if (inner.kind !== 'assembly') throw Error('Original inner required')
  inner.occurrences[0].pose = identityRigidPose(); inner.occurrences[0].pose.translation = [-1e16, 0, 0]
  document.occurrences = [occurrence('left', { id: inner.id, revision: inner.revision })]; document.occurrences[0].pose.translation = [1e16, 0, 0]
  const pick = selection(document, 'box-body', 'x', ['left', 'leaf']), derivative = parameterDirection(document), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const w = snapshot.resolveProfileAxisSelection(document, pick)
    near(w.worldSupport.profile.center, [2, 1, 3]); near(w.worldSupport.xDirection, derivative)
    expect(w.localSupport.profile.uncertainty.positionErrorMm).toBeLessThan(1e-6)
    expect(w.worldSupport.profile.uncertainty.positionErrorMm).toBeGreaterThan(100)
    expect(assemblyProfileAxisPlacementArithmetic(w, document)).toEqual({ placementSum: 2e16, depth: 2 })
  } finally { snapshot.dispose() }
})

it('rejects executable/malformed sense or edge declarations before native queries without retiring live proof', () => {
  const document = original(), pick = selection(document), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const w = snapshot.resolveProfileAxisSelection(document, pick)
    let reads = 0
    const bad = { ...pick, get edge() { reads++; return pick.edge } }, query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileAxisSupport')
    try {
      expect(() => snapshot.resolveProfileAxisSelection(document, bad)).toThrow()
      expect(() => snapshot.resolveProfileAxisSelection(document, { ...pick, sense: 0 } as unknown as AssemblyProfileAxisSelection)).toThrow()
      expect(() => snapshot.resolveProfileAxisSelection(document, { ...pick, edge: { ...pick.edge, sourceFeatureId: 'disk' } })).toThrow()
      expect(() => snapshot.resolveProfileAxisSelection(document, pick, new Array<string>(1))).toThrow()
      expect(query).not.toHaveBeenCalled(); expect(reads).toBe(0)
    } finally { query.mockRestore() }
    expect(snapshot.assertProfileAxisWitness(w, document)).toBe(w)
  } finally { snapshot.dispose() }
})

it('refuses a stricter unrepresentable angular band instead of replacing the declared edge error with zero', () => {
  const document = original(), pick = selection(document), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    expect(() => snapshot.resolveProfileAxisSelection(document, pick, [], { angleToleranceRad: 1e-16 })).toThrow(/precision|precisi/i)
    expect(() => snapshot.listFaces(document, ['first'])).toThrow(/vigente/)
  } finally { snapshot.dispose() }
})

it('invalidates source/path/suppression changes even when face and edge labels are unchanged', () => {
  const document = original(), pick = selection(document), snapshot = new AssemblyGeometrySnapshot(document)
  try {
    const w = snapshot.resolveProfileAxisSelection(document, pick)
    for (const change of ['source', 'pose', 'suppression'] as const) {
      const changed = structuredClone(document)
      if (change === 'source') {
        const p = changed.definitions[0]
        if (p.kind !== 'part' || p.document.features[0].type !== 'sketch' || p.document.features[0].profile.kind !== 'rectangle') throw Error('Original rectangle required')
        p.document.features[0].profile.width = 7
      } else if (change === 'pose') changed.occurrences[0].pose.translation = [1, 0, 0]
      else changed.occurrences[0].suppressed = true
      expect(() => snapshot.assertProfileAxisWitness(w, changed)).toThrow(/documento cambió/)
    }
    const wrong = structuredClone(pick); wrong.component.occurrencePath = ['missing-current-path']
    expect(() => snapshot.resolveProfileAxisSelection(document, wrong)).toThrow()
    expect(snapshot.assertProfileAxisWitness(w, document)).toBe(w)
  } finally { snapshot.dispose() }
})

it('withholds authority after a reentrant source edit during the actual joint native query', () => {
  const document = original(), pick = selection(document), snapshot = new AssemblyGeometrySnapshot(document), actual = CadEngine.prototype.inspectCurrentProfileAxisSupport
  let reached = false
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileAxisSupport').mockImplementation(function (this: CadEngine, ...args) {
    const value = actual.apply(this, args); document.occurrences[0].pose.translation[0] = 1; reached = true; return value
  })
  try {
    expect(() => snapshot.resolveProfileAxisSelection(document, pick)).toThrow(/documento cambió/); expect(reached).toBe(true)
    expect(() => snapshot.listFaces(document, ['first'])).toThrow(/vigente/)
  } finally { query.mockRestore(); snapshot.dispose() }
})

it('aggregates a post-native primary failure and genuine engine cleanup failure without reusable axis proof', () => {
  const document = original(), pick = selection(document), snapshot = new AssemblyGeometrySnapshot(document), prior = snapshot.resolveProfileAxisSelection(document, pick),
    actual = CadEngine.prototype.inspectCurrentProfileAxisSupport, dispose = CadEngine.prototype.dispose,
    primary = Error('Original joint native profile-axis failure'), cleanup = Error('Original axis engine cleanup failure')
  let observed: unknown, queried = false, released = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileAxisSupport').mockImplementation(function (this: CadEngine, ...args) { actual.apply(this, args); queried = true; throw primary }),
    release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function (this: CadEngine) { dispose.call(this); released++; throw cleanup })
  try {
    try { snapshot.resolveProfileAxisSelection(document, pick) } catch (error) { observed = error }
    expect(queried).toBe(true); expect(released).toBe(1); expect(observed).toBeInstanceOf(NativeCleanupError)
    expect(flatten(observed)).toContain(primary); expect(flatten(observed)).toContain(cleanup)
    expect(() => snapshot.assertProfileAxisWitness(prior, document)).toThrow(/vigente/)
  } finally { query.mockRestore(); release.mockRestore(); snapshot.dispose() }
  const fresh = new AssemblyGeometrySnapshot(document)
  try { expect(fresh.resolveProfileAxisSelection(document, pick).kind).toBe('profile-axis') }
  finally { fresh.dispose() }
})
