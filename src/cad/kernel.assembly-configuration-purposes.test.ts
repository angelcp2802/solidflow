import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import profileOriginal from './fixtures/assembly-profile-center-original.json'
import lineOriginal from './fixtures/assembly-line-path-original.json'
import arcOriginal from './fixtures/assembly-material-arc-original.json'
import sphereOriginal from './fixtures/assembly-plane-sphere-tangent-original.json'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyComponentReference, type AssemblyDocument, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { identityRigidPose } from '../model/rigidPose'
import type { AssemblyProfileAxisSelection } from '../model/assemblyProfileReferences'
import type { AssemblyLinePathSelection } from '../model/assemblyLinePathReferences'
import type { AssemblyArcPathSelection } from '../model/assemblyArcPathReferences'
import { AssemblyConfigurationGeometrySnapshot, assemblyConfigurationPlacementArithmetic, type AssemblyConfigurationGeometryInput, type AssemblyConfigurationWitness } from './kernel.assembly-configuration-snapshot'
import { AssemblyGeometrySnapshot, type AssemblyFaceSelection } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { CadEngine } from './kernel.engine'
import { withNativeOwners } from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import type { AssemblySceneBody } from './kernel.assembly-types'
import type { Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({
  wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')),
  print: () => undefined, printErr: () => undefined,
})), 60_000)

// Original tracked GPL-3.0-only recipes, with no changes to their feature data:
// box4x6x4, circular prism R2x3, quarter sector R2x4 centred(3,-2), sphereR3.
// Only the independently authored declaration/catalog below is new. The right
// use selects Rx90+[2,0,0] inside Rz90+[10,20,30]:
// point(x,y,z)->(10+z,22+x,30+y), direction(x,y,z)->(z,x,y).
// Source scene metadata nominates topology; it never grants configured proof.
const stamp = '2026-10-23T00:00:00.000Z'
type Shape = 'box' | 'circle' | 'arc' | 'sphere'
const near = (actual: readonly number[], wanted: readonly number[], band = 1e-10) => {
  expect(actual).toHaveLength(wanted.length)
  actual.forEach((v, i) => { expect(Number.isFinite(v)).toBe(true); expect(Math.abs(v - wanted[i])).toBeLessThanOrEqual(band) })
}
const position = ([x, y, z]: readonly number[]) => [10 + z, 22 + x, 30 + y]
const direction = ([x, y, z]: readonly number[]) => [z, x, y]
const flatten = (e: unknown): unknown[] => [e, ...(e instanceof AggregateError ? e.errors.flatMap(flatten) : [])]
function fixture(shape: Shape = 'box') {
  const source = validateAssemblyDocument(shape === 'box' ? lineOriginal : shape === 'circle' ? profileOriginal : shape === 'arc' ? arcOriginal : sphereOriginal)
  const id = shape === 'box' ? 'original-line-prism' : shape === 'circle' ? 'original-profile-circle' : shape === 'arc' ? 'original-quarter-sector' : 'sphere-source-r3'
  const part = source.definitions.find(d => d.kind === 'part' && d.id === id)
  if (part?.kind !== 'part') throw Error('Tracked original part is missing')
  const occurrence = (id: string, definition: { id: string; revision: string }) => ({ id, name: id, definition: { id: definition.id, revision: definition.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })
  // An actual source declaration, used only for native identity discovery.
  const probe = validateAssemblyDocument({ ...source, definitions: [part], occurrences: [occurrence('probe', part)], mates: [] })
  const inner = { kind: 'assembly' as const, id: 'purpose-inner', revision: 'r1', name: 'Original reused query scope', createdAt: stamp, updatedAt: stamp,
    occurrences: [occurrence('leaf', part)], mates: [] }
  const left = occurrence('left', inner), right = occurrence('right', inner)
  right.pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  const document = validateAssemblyDocument({ ...source, definitions: [part, inner], occurrences: [left, right], mates: [] })
  const input: AssemblyConfigurationGeometryInput = { document, catalog: [
    { definition: { id: document.id, revision: document.revision }, configurations: [
      { id: 'posed', name: 'Right selected state', occurrences: [{ occurrenceId: 'right', configuration: 'tilt' }], mates: [] },
      { id: 'hidden', name: 'Right hidden', occurrences: [{ occurrenceId: 'right', configuration: 'tilt', visible: false }], mates: [] },
      { id: 'suppressed', name: 'Right suppressed', occurrences: [{ occurrenceId: 'right', suppressed: true }], mates: [] },
    ] },
    { definition: { id: inner.id, revision: inner.revision }, configurations: [
      { id: 'tilt', name: 'Rx90 and local translation', occurrences: [{ occurrenceId: 'leaf', pose: { translation: [2, 0, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] } }], mates: [] },
    ] },
  ], rootConfiguration: 'posed', generation: 11 }
  const scene = buildAssemblyScene(probe)
  expect(scene.warnings).toEqual([]); expect(scene.solidCount).toBe(1); expect(scene.bodies).toHaveLength(1)
  return { input, part, body: scene.bodies[0] }
}
type Fixture = ReturnType<typeof fixture>
function component(f: Fixture, path = ['right', 'leaf']): AssemblyComponentReference {
  return { occurrencePath: [...path], definition: { id: f.part.id, revision: f.part.revision } }
}
function top(f: Fixture, path = ['right', 'leaf']): AssemblyFaceSelection {
  const z = f.part.id === 'original-profile-circle' ? 3 : 4
  const faces = f.body.faces.filter(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - z) < 1e-10)
  expect(faces).toHaveLength(1)
  return { ...structuredClone(faces[0].selection), component: component(f, path) }
}
function boxEdge(f: Fixture, bottom = false, path = ['right', 'leaf']) {
  const edges = f.body.edges!.filter(edge => edge.support?.kind === 'line' && Math.abs(edge.support.axis[0]) > .99
    && Math.abs(edge.support.point[1] + 3) < 1e-10 && Math.abs(edge.support.point[2] - (bottom ? 0 : 4)) < 1e-10)
  expect(edges).toHaveLength(1)
  return { ...structuredClone(edges[0].selection), component: component(f, path) }
}
function vertex(f: Fixture, wanted: Vec3) {
  const rows = f.body.vertexPoints!.filter(v => v.point.every((x, i) => Math.abs(x - wanted[i]) < 1e-10))
  expect(rows).toHaveLength(1)
  return structuredClone(rows[0].selection.vertex)
}
function line(f: Fixture, path = ['right', 'leaf']): AssemblyLinePathSelection {
  return { ...boxEdge(f, false, path), startVertex: vertex(f, [-2, -3, 4]) }
}
function arc(f: Fixture, reverse = false, path = ['right', 'leaf']): AssemblyArcPathSelection {
  const rows = f.body.edges!.filter(e => e.circularPathOrigins?.length === 2 && e.lines.length > 0 && e.lines.filter((_, i) => i % 3 === 2).every(z => Math.abs(z - 4) < 1e-10))
  expect(rows).toHaveLength(1)
  return { ...structuredClone(rows[0].selection), component: component(f, path), startVertex: vertex(f, reverse ? [3, 0, 4] : [5, -2, 4]) }
}
function cylinder(f: Fixture) {
  const rows = f.body.faces.filter(face => face.support?.kind === 'cylinder')
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), component: component(f), support: 'cylinder-surface' as const }
}
function sphere(f: Fixture) {
  const rows = f.body.faces.filter(face => face.sphereSurface?.kind === 'sphere-surface')
  expect(rows).toHaveLength(1)
  return { kind: 'face' as const, ...structuredClone(rows[0].selection), component: component(f), support: 'sphere-surface' as const }
}
function profileAxis(f: Fixture): AssemblyProfileAxisSelection {
  return { ...top(f), edge: boxEdge(f).edge, sense: 1 }
}
function metrics(body: AssemblySceneBody, volume: number, area: number, min: Vec3, max: Vec3) {
  expect(body.solidCount).toBe(1)
  expect(Math.abs(body.volume - volume)).toBeLessThanOrEqual(1e-5)
  expect(Math.abs(body.area - area)).toBeLessThanOrEqual(1e-5)
  near(body.bounds.min, min, 1e-6); near(body.bounds.max, max, 1e-6)
}
// Independent increasing-parameter sign from an original borrowed native edge,
// not the profile-axis adapter or the older canonical LINE direction helper.
function boxParameterDirection(part: EmbeddedPartDefinition): Vec3 {
  const engine = new CadEngine()
  try {
    const built = engine.rebuildForAssemblyReferences(part.document.features)
    if (built.kind !== 'explicit' || built.bodies.length !== 1) throw Error('Original explicit box required')
    return withNativeOwners(owners => {
      const copy = owners.own(engine.copyCurrentBodyShape(built.bodies[0].ref)), edges = owners.ownAll(ownedNativeTopology(copy, 'edge')), oc = getOC(), matches: Vec3[] = []
      const xyz = (v: { X(): number; Y(): number; Z(): number }): Vec3 => [v.X(), v.Y(), v.Z()]
      for (const edge of edges) {
        const c = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped))
        if (c.GetType() !== oc.GeomAbs_CurveType.GeomAbs_Line) continue
        const first = c.FirstParameter(), last = c.LastParameter(), a = xyz(owners.own(c.Value(first))), b = xyz(owners.own(c.Value(last)))
        if (![a, b].every(p => Math.abs(p[1] + 3) < 1e-10 && Math.abs(p[2] - 4) < 1e-10) || Math.abs(Math.abs(b[0] - a[0]) - 4) > 1e-10) continue
        const d = xyz(owners.own(c.DN((first + last) / 2, 1))), length = Math.hypot(...d)
        matches.push(d.map(x => x / length) as Vec3)
      }
      expect(matches).toHaveLength(1); near(matches[0].map(Math.abs), [1, 0, 0]); return matches[0]
    })
  } finally { engine.dispose() }
}

it('keeps configured component frames and null roles attached to the full root owner', () => {
  const f = fixture(), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    const full = s.resolveComponentReference(f.input, component(f)), scoped = s.resolveComponentReference(f.input, component(f, ['leaf']), ['right'])
    expect(full.kind).toBe('configured-component'); expect(full.componentPath).toEqual(['right', 'leaf']); expect(full.topLevelOwner).toBe('right')
    near(full.declaredWorldPose.translation, [10, 22, 30]); expect(scoped).toEqual(full); expect(scoped).not.toBe(full)
    const localNull = s.resolveComponentReference(f.input, null, ['right']), rootNull = s.resolveComponentReference(f.input, null)
    near(localNull.declaredWorldPose.translation, [10, 20, 30]); expect(localNull.topLevelOwner).toBe('right'); expect(rootNull.topLevelOwner).toBeNull()
    expect(full.configurationAncestry.map(x => x.configuration)).toEqual(['posed', 'tilt'])
    const arithmetic = assemblyConfigurationPlacementArithmetic(full, f.input)
    expect(arithmetic.depth).toBe(2); near([arithmetic.placementSum], [Math.sqrt(1400) + 2], 1e-12)
  } finally { s.dispose() }
})

it('lists detached full-path edges and separates generic support from explicit direction proofs', () => {
  const f = fixture(), before = serializeAssemblyDocument(f.input.document), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    metrics(f.body, 96, 128, [-2, -3, 0], [2, 3, 4])
    const rows = s.listEdges(f.input, ['right', 'leaf']); expect(rows).toHaveLength(12)
    expect(rows.every(r => r.component.occurrencePath.join('/') === 'right/leaf' && r.body?.bodyId === 'body')).toBe(true)
    rows[0].component.occurrencePath[0] = 'mutated-list'; rows[0].edge.key = 'mutated-metadata'
    expect(s.listEdges(f.input, ['right', 'leaf'])).not.toEqual(rows)
    const selected = boxEdge(f), lineRef = { kind: 'edge' as const, ...selected, support: 'line' as const }
    const full = s.resolveReference(f.input, lineRef), directed = s.resolveDirectionReference(f.input, lineRef)
    expect(full.kind).toBe('configured-support'); expect(directed.kind).toBe('configured-direction')
    if (full.localSupport.kind !== 'line' || full.worldSupport.kind !== 'line' || directed.worldSupport.kind !== 'line') throw Error('Expected actual LINE')
    near(full.worldSupport.point, position(full.localSupport.point)); near(full.worldSupport.axis, direction(full.localSupport.axis)); near(directed.worldSupport.axis, full.worldSupport.axis)
    const plane = s.resolveReference(f.input, { kind: 'face', ...top(f), support: 'plane' }), normal = s.resolveDirectionReference(f.input, { kind: 'face', ...top(f), support: 'plane' })
    if (plane.worldSupport.kind !== 'plane' || normal.worldSupport.kind !== 'plane') throw Error('Expected actual plane')
    near(plane.worldSupport.normal, [1, 0, 0]); near(normal.worldSupport.normal, [1, 0, 0])
    expect(serializeAssemblyDocument(f.input.document)).toBe(before)
  } finally { s.dispose() }
})

it('retains actual cylinder radius/material sense and distinguishes its axis from its surface', () => {
  const f = fixture('circle'), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    metrics(f.body, 12 * Math.PI, 20 * Math.PI, [-2, -2, 0], [2, 2, 3])
    const selected = cylinder(f), w = s.resolveCylinderSurfaceReference(f.input, selected)
    expect(w.kind).toBe('configured-cylinder-surface'); expect(w.worldSupport.radius).toBeCloseTo(2, 12); expect(w.worldSupport.radialMaterialSense).toBe(1)
    near(w.worldSupport.point, position(w.localSupport.point)); near(w.worldSupport.axis, direction(w.localSupport.axis)); near(w.worldSupport.axis.map(Math.abs), [1, 0, 0])
    const ref = { ...selected, support: 'axis' as const }, axis = s.resolveReference(f.input, ref), directionOnly = s.resolveDirectionReference(f.input, ref)
    expect(axis.kind).toBe('configured-support'); expect(directionOnly.kind).toBe('configured-direction')
    if (axis.worldSupport.kind !== 'cylinder' || directionOnly.worldSupport.kind !== 'cylinder') throw Error('Expected native axis')
    near(axis.worldSupport.axis, w.worldSupport.axis); near(directionOnly.worldSupport.axis, w.worldSupport.axis)
  } finally { s.dispose() }
})

it('transforms the original spherical centre without inventing a directional sphere frame', () => {
  const f = fixture('sphere'), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    metrics(f.body, 36 * Math.PI, 36 * Math.PI, [-3, -3, -3], [3, 3, 3])
    const w = s.resolveSphereSurfaceReference(f.input, sphere(f))
    expect(w.kind).toBe('configured-sphere-surface'); near(w.localSupport.center, [0, 0, 0]); near(w.worldSupport.center, [10, 22, 30])
    expect(w.worldSupport.radius).toBeCloseTo(3, 12); expect(w.worldSupport.radialMaterialSense).toBe(1); expect(w.worldSupport).not.toHaveProperty('axis')
    expect(Object.isFrozen(w.worldSupport.center)).toBe(true)
  } finally { s.dispose() }
})

it.each(['box', 'circle'] as const)('queries a fresh bounded %s profile in the selected 3D variant', shape => {
  const f = fixture(shape), s = new AssemblyConfigurationGeometrySnapshot(f.input), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileSupport')
  try {
    const a = s.resolveProfileFaceSelection(f.input, top(f)), b = s.resolveProfileFaceSelection(f.input, top(f, ['left', 'leaf']))
    expect(query).toHaveBeenCalledTimes(2); expect(a.kind).toBe('configured-profile'); expect(a.topLevelOwner).toBe('right'); expect(b.topLevelOwner).toBe('left')
    const z = shape === 'box' ? 4 : 3
    near(a.localSupport.center, [0, 0, z]); near(a.worldSupport.center, [10 + z, 22, 30]); near(b.worldSupport.center, [0, 0, z]); near(a.worldSupport.normal, [1, 0, 0])
    expect(a.worldSupport.uncertainty.positionErrorMm).toBeGreaterThan(a.localSupport.uncertainty.positionErrorMm)
    if (shape === 'box') {
      if (a.worldSupport.kind !== 'rectangle') throw Error('Expected actual rectangle')
      const remaining = [-2, 2].flatMap(x => [-3, 3].map(y => [14, 22 + x, 30 + y]))
      for (const corner of a.worldSupport.corners) {
        const index = remaining.findIndex(p => p.every((x, i) => Math.abs(x - corner[i]) <= 1e-10))
        expect(index).toBeGreaterThanOrEqual(0); remaining.splice(index, 1)
      }
      expect(remaining).toEqual([])
    } else {
      expect(a.worldSupport.kind).toBe('circle')
      if (a.worldSupport.kind !== 'circle') throw Error('Expected actual circle')
      expect(a.worldSupport.radiusMm).toBeCloseTo(2, 12); expect(a.worldSupport).not.toHaveProperty('boundaryAxes')
    }
  } finally { query.mockRestore(); s.dispose() }
})

it('uses an explicit incident boundary LINE and native increasing-parameter sign for profile axes', () => {
  const f = fixture(), selected = profileAxis(f), d = boxParameterDirection(f.part), s = new AssemblyConfigurationGeometrySnapshot(f.input), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileAxisSupport')
  try {
    const a = s.resolveProfileAxisSelection(f.input, selected), b = s.resolveProfileAxisSelection(f.input, { ...selected, sense: -1 })
    expect(query).toHaveBeenCalledTimes(2); expect(a.kind).toBe('configured-profile-axis')
    near(a.localSupport.profile.center, [0, 0, 4]); near(a.worldSupport.profile.center, [14, 22, 30])
    near(a.localSupport.xDirection, d); near(a.worldSupport.xDirection, direction(d)); near(b.worldSupport.xDirection, direction(d).map(x => -x))
    expect(a.worldSupport.edgeLengthMm).toBeCloseTo(4, 12); expect(a.worldSupport.sense).toBe(1); expect(b.worldSupport.sense).toBe(-1)
  } finally { query.mockRestore(); s.dispose() }
})

it('keeps material LINE origin and generic directed curve/evaluation purposes separate', () => {
  const f = fixture(), selected = line(f), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    const local = { ...selected, component: component(f, ['leaf']) }, w = s.resolveLinePathSelection(f.input, local, ['right'])
    expect(w.kind).toBe('configured-line-path'); expect(w.componentPath).toEqual(['right', 'leaf']); expect(w.topLevelOwner).toBe('right')
    near(w.localCurve.startPoint, [-2, -3, 4]); near(w.localCurve.endPoint, [2, -3, 4]); near(w.worldCurve.startPoint, [14, 20, 27]); near(w.worldCurve.endPoint, [14, 24, 27]); near(w.worldCurve.increasingDirection, [0, 1, 0])
    expect(w.worldCurve.lengthMm).toBeCloseTo(4, 12)
    const generic = { component: selected.component, body: selected.body, edge: selected.edge, sense: 1 as const }
    const observed = s.resolvePathCurveSelection(f.input, generic), evaluated = s.evaluatePathCurveSelection(f.input, generic, { kind: 'arc-length', distanceMm: 2 })
    expect(observed.kind).toBe('configured-path-curve'); expect(evaluated.kind).toBe('configured-path-evaluation'); expect(observed.localCurve.kind).toBe('line')
    near(evaluated.localEvaluation.point, [0, -3, 4]); near(evaluated.worldEvaluation.point, [14, 22, 27]); near(evaluated.worldEvaluation.tangent.map(Math.abs), [0, 1, 0])
    expect(evaluated.worldEvaluation.arcLengthMm).toBeCloseTo(2, 12); expect(Object.isFrozen(evaluated.worldEvaluation.point)).toBe(true)
  } finally { s.dispose() }
})

it('preserves original quarter-arc centre, radius, material reversal and fresh evaluation in true 3D', () => {
  const f = fixture('arc'), selected = arc(f), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    metrics(f.body, 4 * Math.PI, 6 * Math.PI + 16, [3, -2, 0], [5, 0, 4])
    const observed = s.resolveArcPathSelection(f.input, selected), evaluated = s.evaluateArcPathSelection(f.input, selected, { kind: 'arc-length', distanceMm: Math.PI / 2 })
    expect(observed.kind).toBe('configured-arc-path'); expect(evaluated.kind).toBe('configured-arc-evaluation')
    near(observed.localCurve.center, [3, -2, 4]); near(observed.worldCurve.center, [14, 25, 28]); near(observed.worldCurve.normal, [1, 0, 0]); expect(observed.worldCurve.radiusMm).toBeCloseTo(2, 12); expect(observed.worldCurve.lengthMm).toBeCloseTo(Math.PI, 12)
    near(observed.worldCurve.startPoint, [14, 27, 28]); near(observed.worldCurve.endPoint, [14, 25, 30])
    near(evaluated.localEvaluation.point, [3 + Math.SQRT2, -2 + Math.SQRT2, 4]); near(evaluated.worldEvaluation.point, [14, 25 + Math.SQRT2, 28 + Math.SQRT2]); near(evaluated.worldEvaluation.tangent, [0, -Math.SQRT1_2, Math.SQRT1_2])
    const reversed = s.evaluateArcPathSelection(f.input, arc(f, true), { kind: 'arc-length', distanceMm: 0 })
    near(reversed.worldEvaluation.point, [14, 25, 30]); near(reversed.worldEvaluation.tangent, [0, 1, 0])
    const generic = { component: selected.component, body: selected.body, edge: selected.edge, sense: 1 as const }, bounded = s.resolvePathCurveSelection(f.input, generic)
    expect(bounded.kind).toBe('configured-path-curve'); expect(bounded.worldCurve.kind).toBe('circle')
    const midpoint = (bounded.localCurve.parameterDomain.first + bounded.localCurve.parameterDomain.last) / 2
    const raw = s.evaluatePathCurveSelection(f.input, generic, { kind: 'parameter', parameter: midpoint })
    expect(raw.kind).toBe('configured-path-evaluation'); near(raw.worldEvaluation.point, [14, 25 + Math.SQRT2, 28 + Math.SQRT2]); near(raw.worldEvaluation.tangent, [0, -Math.SQRT1_2, Math.SQRT1_2])
    expect(raw.worldEvaluation.arcLengthMm).toBeCloseTo(Math.PI / 2, 12)
  } finally { s.dispose() }
})

it('keeps hidden configured material observable and refuses configured suppressed advanced paths', () => {
  const f = fixture('arc'), selected = arc(f)
  f.input.rootConfiguration = 'hidden'
  const hidden = new AssemblyConfigurationGeometrySnapshot(f.input)
  try { expect(hidden.resolveArcPathSelection(f.input, selected).topLevelOwner).toBe('right') } finally { hidden.dispose() }
  f.input.rootConfiguration = 'suppressed'; f.input.generation++
  const suppressed = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    expect(() => suppressed.resolveArcPathSelection(f.input, selected)).toThrow()
    expect(suppressed.resolveArcPathSelection(f.input, arc(f, false, ['left', 'leaf'])).topLevelOwner).toBe('left')
  } finally { suppressed.dispose() }
})

const purposes = ['component', 'support', 'direction', 'cylinder-surface', 'sphere-surface', 'profile', 'profile-axis', 'line-path', 'arc-path', 'arc-evaluation', 'path-curve', 'path-evaluation'] as const
type Purpose = typeof purposes[number]
function shapeFor(purpose: Purpose): Shape { return purpose === 'sphere-surface' ? 'sphere' : purpose === 'cylinder-surface' ? 'circle' : purpose.startsWith('arc-') ? 'arc' : 'box' }
function issue(purpose: Purpose, f: Fixture, s: AssemblyConfigurationGeometrySnapshot): AssemblyConfigurationWitness {
  switch (purpose) {
    case 'component': return s.resolveComponentReference(f.input, component(f))
    case 'support': return s.resolveReference(f.input, { kind: 'edge', ...boxEdge(f), support: 'line' })
    case 'direction': return s.resolveDirectionReference(f.input, { kind: 'face', ...top(f), support: 'plane' })
    case 'cylinder-surface': return s.resolveCylinderSurfaceReference(f.input, cylinder(f))
    case 'sphere-surface': return s.resolveSphereSurfaceReference(f.input, sphere(f))
    case 'profile': return s.resolveProfileFaceSelection(f.input, top(f))
    case 'profile-axis': return s.resolveProfileAxisSelection(f.input, profileAxis(f))
    case 'line-path': return s.resolveLinePathSelection(f.input, line(f))
    case 'arc-path': return s.resolveArcPathSelection(f.input, arc(f))
    case 'arc-evaluation': return s.evaluateArcPathSelection(f.input, arc(f), { kind: 'arc-length', distanceMm: Math.PI / 2 })
    case 'path-curve': return s.resolvePathCurveSelection(f.input, { ...boxEdge(f), sense: 1 })
    case 'path-evaluation': return s.evaluatePathCurveSelection(f.input, { ...boxEdge(f), sense: 1 }, { kind: 'arc-length', distanceMm: 2 })
  }
}
it.each(purposes)('keeps %s proof private, current to all context fields and distinct from legacy authority', purpose => {
  const f = fixture(shapeFor(purpose)), s = new AssemblyConfigurationGeometrySnapshot(f.input), foreign = new AssemblyConfigurationGeometrySnapshot(f.input), legacy = new AssemblyGeometrySnapshot(f.input.document)
  try {
    const w = issue(purpose, f, s)
    expect(w.kind).toBe('configured-' + purpose); expect(s.assertWitness(w, f.input)).toBe(w); expect(Object.isFrozen(w)).toBe(true)
    expect(() => s.assertWitness(structuredClone(w), f.input)).toThrow(); expect(() => foreign.assertWitness(w, f.input)).toThrow(); expect(() => legacy.assertWitness(w as never, f.input.document)).toThrow()
    expect(() => assemblyConfigurationPlacementArithmetic(structuredClone(w), f.input)).toThrow()
    const old = legacy.resolveReference(f.input.document, { kind: 'principal-plane', component: null, plane: 'XY' })
    expect(() => s.assertWitness(old, f.input)).toThrow(); expect(s.assertWitness(w, f.input)).toBe(w)
    const retiring = issue(purpose, f, foreign)
    foreign.dispose(); expect(() => foreign.assertWitness(retiring, f.input)).toThrow()
    expect(() => assemblyConfigurationPlacementArithmetic(retiring, f.input)).toThrow()
    f.input.generation++
    expect(() => s.assertWitness(w, f.input)).toThrow(); f.input.generation--
    expect(() => s.assertWitness(w, f.input)).toThrow(); expect(() => assemblyConfigurationPlacementArithmetic(w, f.input)).toThrow()
  } finally { s.dispose(); foreign.dispose(); legacy.dispose() }
})

it.each(['catalog', 'selector', 'source'] as const)('withholds advanced authority after current %s changes with unchanged topology IDs', change => {
  const f = fixture('arc'), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    const w = s.resolveArcPathSelection(f.input, arc(f))
    if (change === 'catalog') f.input.catalog[1].configurations[0].occurrences[0].pose!.translation[0]++
    if (change === 'selector') f.input.rootConfiguration = null
    if (change === 'source') f.input.document.occurrences[0].name = 'Changed declaration'
    expect(() => s.assertWitness(w, f.input)).toThrow(); expect(() => s.listEdges(f.input, ['left', 'leaf'])).toThrow()
  } finally { s.dispose() }
})

it.each(['line-path', 'arc-path', 'arc-evaluation', 'path-curve', 'path-evaluation'] as const)('refuses %s world precision after effective translations cancel without widening bands', purpose => {
  const f = fixture(shapeFor(purpose))
  f.input.document.occurrences[1].pose = { translation: [1e16, 0, 0], rotation: [0, 0, 0, 1] }
  f.input.catalog[1].configurations[0].occurrences[0].pose = { translation: [-1e16, 0, 0], rotation: [0, 0, 0, 1] }
  const s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try { expect(() => issue(purpose, f, s)).toThrow(/precision|precisi/i); expect(() => s.listEdges(f.input, ['left', 'leaf'])).toThrow() }
  finally { s.dispose() }
})

it('retains profile arithmetic error after cancellation and rejects an unrepresentable explicit angular band', () => {
  const f = fixture(), selected = profileAxis(f)
  f.input.document.occurrences[1].pose = { translation: [1e16, 0, 0], rotation: [0, 0, 0, 1] }
  f.input.catalog[1].configurations[0].occurrences[0].pose = { translation: [-1e16, 0, 0], rotation: [0, 0, 0, 1] }
  const s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    const w = s.resolveProfileAxisSelection(f.input, selected)
    near(w.worldSupport.profile.center, [0, 0, 4]); expect(w.localSupport.profile.uncertainty.positionErrorMm).toBeLessThan(1e-6)
    expect(w.worldSupport.profile.uncertainty.positionErrorMm).toBeGreaterThan(100)
    expect(assemblyConfigurationPlacementArithmetic(w, f.input)).toEqual({ placementSum: 2e16, depth: 2 })
    expect(() => s.resolveProfileAxisSelection(f.input, selected, [], { angleToleranceRad: 1e-16 })).toThrow(/precision|precisi/i)
    expect(() => s.assertWitness(w, f.input)).toThrow()
  } finally { s.dispose() }
})

it.each(['nonincident-profile', 'nonincident-line', 'arc-as-line', 'plane-as-cylinder'] as const)('does not promote %s metadata to the wrong native purpose', wrong => {
  const f = fixture(wrong === 'arc-as-line' ? 'arc' : 'box'), s = new AssemblyConfigurationGeometrySnapshot(f.input)
  try {
    expect(() => {
      if (wrong === 'nonincident-profile') return s.resolveProfileAxisSelection(f.input, { ...top(f), edge: boxEdge(f, true).edge, sense: 1 })
      if (wrong === 'nonincident-line') return s.resolveLinePathSelection(f.input, { ...line(f), startVertex: vertex(f, [2, 3, 4]) })
      if (wrong === 'arc-as-line') return s.resolveLinePathSelection(f.input, arc(f))
      return s.resolveCylinderSurfaceReference(f.input, { kind: 'face', ...top(f), support: 'cylinder-surface' })
    }).toThrow()
    expect(() => s.listEdges(f.input, ['left', 'leaf'])).toThrow()
  } finally { s.dispose() }
})

it('rejects executable advanced selections/coordinates before native access and preserves the current session', () => {
  const f = fixture('arc'), selected = arc(f), s = new AssemblyConfigurationGeometrySnapshot(f.input), query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPath'), evaluate = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPathEvaluation')
  let reads = 0
  try {
    const bad = { ...selected }; Object.defineProperty(bad, 'startVertex', { enumerable: true, get() { reads++; return selected.startVertex } })
    expect(() => s.resolveArcPathSelection(f.input, bad)).toThrow()
    expect(() => s.evaluateArcPathSelection(f.input, selected, { kind: 'arc-length', get distanceMm() { reads++; return 0 } })).toThrow()
    expect(() => s.resolveArcPathSelection(f.input, selected, new Array<string>(1))).toThrow()
    expect(query).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled(); expect(reads).toBe(0)
    expect(s.resolveArcPathSelection(f.input, selected).kind).toBe('configured-arc-path')
  } finally { query.mockRestore(); evaluate.mockRestore(); s.dispose() }
})

it('withholds an actual advanced native return after reentrant configuration mutation', () => {
  const f = fixture('arc'), selected = arc(f), s = new AssemblyConfigurationGeometrySnapshot(f.input), actual = CadEngine.prototype.inspectCurrentArcPathEvaluation
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentArcPathEvaluation').mockImplementation(function(this: CadEngine, ...args) {
    const result = actual.apply(this, args); f.input.catalog[1].configurations[0].name = 'Reentrant change'; return result
  })
  try { expect(() => s.evaluateArcPathSelection(f.input, selected, { kind: 'arc-length', distanceMm: Math.PI / 2 })).toThrow(); expect(() => s.listEdges(f.input, ['left', 'leaf'])).toThrow() }
  finally { query.mockRestore(); s.dispose() }
})

it('preserves actual advanced-query and cleanup errors while releasing its native prototype only once', () => {
  const f = fixture(), selected = profileAxis(f), s = new AssemblyConfigurationGeometrySnapshot(f.input), actualQuery = CadEngine.prototype.inspectCurrentProfileAxisSupport, actualDispose = CadEngine.prototype.dispose
  const primary = Error('Original post-query fault'), cleanup = Error('Original configured prototype release fault'), releases = new Map<CadEngine, number>()
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentProfileAxisSupport').mockImplementation(function(this: CadEngine, ...args) { actualQuery.apply(this, args); throw primary })
  const release = vi.spyOn(CadEngine.prototype, 'dispose').mockImplementation(function(this: CadEngine) { releases.set(this, (releases.get(this) ?? 0) + 1); actualDispose.call(this); throw cleanup })
  try {
    let caught: unknown; try { s.resolveProfileAxisSelection(f.input, selected) } catch (error) { caught = error }
    expect(flatten(caught)).toContain(primary); expect(flatten(caught)).toContain(cleanup); s.dispose()
    expect(releases.size).toBe(1); expect([...releases.values()]).toEqual([1]); expect(() => s.listFaces(f.input, ['left', 'leaf'])).toThrow()
  } finally { query.mockRestore(); release.mockRestore(); s.dispose() }
})
