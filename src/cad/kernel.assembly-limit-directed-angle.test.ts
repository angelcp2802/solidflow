import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyGeometryReference, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory, applyAssemblyEdit } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import type { Quaternion, RigidPose } from '../model/rigidPose'
import * as numerical from '../model/assemblySolver'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { CadEngine } from './kernel.engine'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneEdgeReference, assemblySceneFaceReference, type AssemblyScene, type AssemblyPreviewReply } from './kernel.assembly-types'
import { prepareAssemblySolve, prepareAssemblyMovePreview, prepareAssemblyDragPreview, prepareAssemblyMotionPreview,
  discardAssemblySolvePreview, type AssemblySolvePreview } from './kernel.assembly-solve'
import { measureAssemblyDirectedAngleWitnesses } from './kernel.assembly-angle-measurement'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners } from './kernel.native-ownership'
import { placeAssemblyShape } from './kernel.assembly-placements'
import type { Vec3 } from './kernel.types'

type Stop = Extract<AssemblyMate, { type: 'limit-directed-angle' }>
type DirectionKind = 'plane' | 'cylinder' | 'line'
const kinds: DirectionKind[] = ['plane', 'cylinder', 'line']
const triples = kinds.flatMap(first => kinds.flatMap(second => kinds.map(guide => ({ first, second, guide }))))
const near = (actual: number, expected: number, tolerance = 1e-7) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const vector = (actual: readonly number[], expected: readonly number[], tolerance = 1e-8) => actual.forEach((value, index) => near(value, expected[index], tolerance))
const rx = (degrees: number): Quaternion => [Math.sin(degrees * Math.PI / 360), 0, 0, Math.cos(degrees * Math.PI / 360)]
const ry = (degrees: number): Quaternion => [0, Math.sin(degrees * Math.PI / 360), 0, Math.cos(degrees * Math.PI / 360)]
const tuple = (point: { X(): number; Y(): number; Z(): number }): Vec3 => [point.X(), point.Y(), point.Z()]
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => a.map(value => value / Math.hypot(...a)) as Vec3
function rotate(q: Quaternion, p: Vec3): Vec3 {
  // Independent quaternion sandwich expanded as a Rodrigues matrix.
  const [x, y, z, w] = q, s = 2 / dot(q, q)
  return [(1 - s * (y * y + z * z)) * p[0] + s * (x * y - z * w) * p[1] + s * (x * z + y * w) * p[2],
    s * (x * y + z * w) * p[0] + (1 - s * (x * x + z * z)) * p[1] + s * (y * z - x * w) * p[2],
    s * (x * z - y * w) * p[0] + s * (y * z + x * w) * p[1] + (1 - s * (x * x + y * y)) * p[2]]
}
const transform = (pose: RigidPose, p: Vec3): Vec3 => rotate(pose.rotation, p).map((value, index) => value + pose.translation[index]) as Vec3
let original: AssemblyDocument, originalScene: AssemblyScene
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  original = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-direction-mates-original.json', import.meta.url), 'utf8'))
  originalScene = buildAssemblyScene(original)
}, 60_000)
function component(document: AssemblyDocument, id = 'moving') {
  const occurrence = document.occurrences.find(value => value.id === id)!
  return { occurrencePath: [id], definition: { ...occurrence.definition } }
}
function reference(scene: AssemblyScene, id: string, kind: DirectionKind): AssemblyGeometryReference {
  const body = scene.bodies.find(value => value.component.occurrencePath.at(-1) === id)!
  if (kind === 'line') {
    const found = (body.edges ?? []).filter(value => value.support?.kind === 'line' && value.support.axis[2] > .99
      && Math.abs(value.support.point[0] - 5) < 1e-8 && Math.abs(value.support.point[1] - 3) < 1e-8)
    expect(found).toHaveLength(1); return assemblySceneEdgeReference(found[0])!
  }
  const found = body.faces.filter(value => kind === 'cylinder' ? value.support?.kind === 'cylinder'
    : value.support?.kind === 'plane' && value.support.normal[2] > .99)
  expect(found).toHaveLength(1); return assemblySceneFaceReference(found[0])!
}
function fixture(theta = 350, start = 330, sweep = 60): AssemblyDocument {
  const document = validateAssemblyDocument(original); document.occurrences[1].pose.rotation = rx(theta)
  document.mates = [{ id: 'circular-stop', name: 'Original circular stop', type: 'limit-directed-angle', coordinate: 'directed-about-axis', suppressed: false,
    first: reference(originalScene, 'ground', 'plane'), second: reference(originalScene, 'moving', 'plane'),
    guide: { kind: 'principal-plane', component: null, plane: 'YZ' }, arc: { start, sweep } }]
  return validateAssemblyDocument(document)
}
const stop = (document: AssemblyDocument) => document.mates[0] as Stop
function ready(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function workerReady(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function report(value: AssemblySolvePreview | Extract<AssemblyPreviewReply, { status: 'ready' }>) {
  expect(value.limitDirectedAngles).toHaveLength(1); return value.limitDirectedAngles![0]
}
/** Independent rebuilt BRep metrics, corners and oriented D1 normals. */
function physical(document: AssemblyDocument, height = 4, ids: readonly string[] = ['ground', 'moving']): number {
  return withNativeOwners(owners => {
    const normals: Vec3[] = [], oc = getOC()
    for (const id of ids) {
      const occurrence = document.occurrences.find(value => value.id === id)!, part = document.definitions.find(value => value.id === occurrence.definition.id && value.revision === occurrence.definition.revision)!
      if (part.kind !== 'part') throw new Error('Original drilled prism required')
      const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(part.document.features)
      expect(inventory.featureErrors).toEqual([])
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('One native original solid required')
      const source = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape: Shape3D = owners.own(placeAssemblyShape(source, occurrence.pose)),
        analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      near(volume.Mass(), (60 - Math.PI) * height, 1e-5); near(area.Mass(), 120 + 32 * height + (2 * height - 2) * Math.PI, 1e-5)
      const corners = [-5, 5].flatMap(x => [-3, 3].flatMap(y => [0, height].map(z => transform(occurrence.pose, [x, y, z])))), bounds = owners.own(shape.boundingBox).bounds
      for (let axis = 0; axis < 3; axis++) { near(bounds[0][axis], Math.min(...corners.map(p => p[axis])), 1e-6); near(bounds[1][axis], Math.max(...corners.map(p => p[axis])), 1e-6) }
      const wanted = rotate(occurrence.pose.rotation, [0, 0, 1]), at = transform(occurrence.pose, [0, 0, height]), matches: Vec3[] = []
      for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) {
        const adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false))
        if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) continue
        const p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec()); adaptor.D1(.37, .71, p, du, dv)
        const sign = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1,
          normal = unit(cross(tuple(du), tuple(dv))).map(value => sign * value) as Vec3
        if (dot(normal, wanted) > .999 && Math.abs(dot(normal, tuple(p).map((value, axis) => value - at[axis]))) < 1e-6) matches.push(normal)
      }
      expect(matches).toHaveLength(1); normals.push(matches[0])
    }
    // About the declared +X guide, yz azimuth is measured directly from D1.
    const a = normals[0], b = normals[1], signed = Math.atan2(a[1] * b[2] - a[2] * b[1], a[1] * b[1] + a[2] * b[2])
    return (signed < 0 ? signed + 2 * Math.PI : signed) * 180 / Math.PI
  })
}

it('verifies a crossing-zero circular arc from actual D1 normals and independent drilled-prism metrics', () => {
  const document = fixture(), value = ready(prepareAssemblySolve(document))
  try {
    const actual = report(value); near(actual.angleDegrees, 350); near(physical(validateAssemblyDocument(value.document)), 350)
    expect(actual.arcDegrees).toEqual({ start: 330, sweep: 60 }); expect(actual.activity).toBe('interior'); expect(actual.fullCircle).toBe(false)
    vector(actual.firstDirection, [0, 0, 1]); vector(actual.secondDirection, [0, Math.sin(Math.PI / 18), Math.cos(Math.PI / 18)]); vector(actual.guideDirection, [1, 0, 0])
    near(actual.marginsRadians.minimum, Math.PI / 9); near(actual.marginsRadians.maximum, 2 * Math.PI / 9)
    expect(value.scopes.at(-1)!.result.rank).toBe(0); expect(value.scopes.at(-1)!.result.localDOF).toBe(6)
    expect(value.document.occurrences).toEqual(document.occurrences)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(triples)('authenticates native direction purposes $first/$second about $guide without implicit sign conversion', spec => {
  const document = fixture(35, 0, 360), guideOccurrence = { ...structuredClone(document.occurrences[0]), id: 'guide', name: 'Original guide prism',
    pose: { translation: [40, 11, -7] as Vec3, rotation: ry(90) } }
  document.occurrences.push(guideOccurrence)
  const scene = buildAssemblyScene(document), declaration = stop(document)
  declaration.first = reference(scene, 'ground', spec.first); declaration.second = reference(scene, 'moving', spec.second); declaration.guide = reference(scene, 'guide', spec.guide)
  let expected = (spec.first === 'cylinder') !== (spec.second === 'cylinder') ? 215 : 35
  if (spec.guide === 'cylinder') expected = 360 - expected
  declaration.arc = { start: expected - 10, sweep: 20 }
  const value = ready(prepareAssemblySolve(document))
  try { const actual = report(value); near(actual.angleDegrees, expected); expect([actual.firstKind, actual.secondKind, actual.guideKind]).toEqual([spec.first, spec.second, spec.guide])
    vector(actual.guideDirection, [spec.guide === 'cylinder' ? -1 : 1, 0, 0]); expect(value.document.mates).toEqual(document.mates)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([{ target: 0, accepted: true }, { target: 30, accepted: true }, { target: 330, accepted: true }, { target: 31, accepted: false }, { target: 329, accepted: false }])('checks the strict circular destination $target inclusively', spec => {
  const document = fixture(), before = serializeAssemblyDocument(document), value = prepareAssemblyMovePreview(document, { component: component(document),
    pose: { ...document.occurrences[1].pose, rotation: rx(spec.target) } })
  expect(value.status).toBe(spec.accepted ? 'ready' : 'rejected')
  if (value.status === 'ready') try { near(report(value).angleDegrees, spec.target); near(physical(validateAssemblyDocument(value.document)), spec.target) } finally { discardAssemblySolvePreview(value) }
  else expect('document' in value || 'limitDirectedAngles' in value).toBe(false)
  expect(serializeAssemblyDocument(document)).toBe(before)
}, 60_000)

it.each([{ theta: 350, wanted: 60, expected: 30 }, { theta: 10, wanted: 300, expected: 330 },
  { theta: 30, wanted: 0, expected: 0 }, { theta: 330, wanted: 350, expected: 350 }])('projects $wanted from $theta to $expected and releases inward from either bound', spec => {
  const document = fixture(spec.theta), value = ready(prepareAssemblyDragPreview(document, { component: component(document), mode: 'rotate',
    pose: { ...document.occurrences[1].pose, rotation: rx(spec.wanted) } }))
  try { near(report(value).angleDegrees, spec.expected, 1e-6); near(physical(validateAssemblyDocument(value.document)), spec.expected, 1e-6)
    expect(value.document.mates).toEqual(document.mates); near(value.projection!.angleResidual, Math.abs(spec.wanted - spec.expected) * Math.PI / 180, 1e-7)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([{ theta: 45, start: 0, sweep: 0, expected: 0 }, { theta: 300, start: 330, sweep: 60, expected: 330 },
  { theta: 60, start: 330, sweep: 60, expected: 30 }])('restores $theta into the declared circular arc $start+$sweep', spec => {
  const document = fixture(spec.theta, spec.start, spec.sweep), value = ready(prepareAssemblySolve(document))
  try { near(report(value).angleDegrees, spec.expected, 1e-6); near(physical(validateAssemblyDocument(value.document)), spec.expected, 1e-6)
    expect(report(value).activity).toBe(spec.sweep === 0 ? 'both' : spec.expected === spec.start ? 'minimum' : 'maximum')
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('moves the guide owner independently and rejects its degenerate projection atomically', () => {
  const document = fixture(350, 0, 360); document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'guide', fixed: false,
    pose: { translation: [40, 0, 0], rotation: ry(90) } })
  stop(document).guide = reference(buildAssemblyScene(document), 'guide', 'plane')
  const value = ready(prepareAssemblyMovePreview(document, { component: component(document, 'guide'), pose: { translation: [40, 0, 0], rotation: ry(-90) } }))
  try { near(report(value).angleDegrees, 10); vector(report(value).guideDirection, [-1, 0, 0]); expect(value.document.occurrences[1]).toEqual(document.occurrences[1]) }
  finally { discardAssemblySolvePreview(value) }
  const before = serializeAssemblyDocument(document), rejected = prepareAssemblyMovePreview(document, { component: component(document, 'guide'), pose: { translation: [40, 0, 0], rotation: [0, 0, 0, 1] } })
  expect(rejected.status).toBe('rejected'); expect('document' in rejected || 'limitDirectedAngles' in rejected).toBe(false); expect(serializeAssemblyDocument(document)).toBe(before)
}, 60_000)

it('restores a violated arc by solving the independently movable native guide while both measured owners stay fixed', () => {
  const document = fixture(30, 40, 10), sine = Math.sin(Math.PI / 12), cosine = Math.cos(Math.PI / 12)
  document.occurrences[1].fixed = true
  // Rx30 * Ry30 gives the top normal (1/2,-sqrt(3)/4,3/4).
  document.occurrences[1].pose.rotation = [sine * cosine, sine * cosine, sine * sine, cosine * cosine]
  document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'guide', fixed: false,
    pose: { translation: [40, 11, -7], rotation: ry(90) } })
  stop(document).guide = reference(buildAssemblyScene(document), 'guide', 'plane')
  const value = ready(prepareAssemblySolve(document))
  try {
    const actual = report(value), a = actual.firstDirection as Vec3, b = actual.secondDirection as Vec3, g = actual.guideDirection as Vec3
    vector(a, [0, 0, 1]); vector(b, [.5, -Math.sqrt(3) / 4, .75]); near(actual.angleDegrees, 40, 1e-6)
    const projectedCosine = dot(a, b) - dot(a, g) * dot(b, g), projectedSine = dot(g, cross(a, b))
    near(Math.atan2(projectedSine, projectedCosine) * 180 / Math.PI, 40, 1e-6)
    expect(value.document.occurrences.slice(0, 2)).toEqual(document.occurrences.slice(0, 2))
    expect(value.document.occurrences[2].pose.rotation).not.toEqual(document.occurrences[2].pose.rotation)
    // This angular relation does not constrain the free guide's position.
    expect(value.document.occurrences[2].pose.translation.every(Number.isFinite)).toBe(true)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('checks the sampled 350 to 10 zero crossing and rejects a full excursion hidden by its final quaternion', () => {
  const document = fixture(), before = serializeAssemblyDocument(document), request = { component: component(document), translation: [...document.occurrences[1].pose.translation] as Vec3,
    rotation: { axis: 0 as const, angle: Math.PI / 9 } }, value = ready(prepareAssemblyMotionPreview(document, request))
  try { near(report(value).angleDegrees, 10); near(physical(validateAssemblyDocument(value.document)), 10); expect(value.motion!.sampledOnly).toBe(true)
    expect(value.motion!.verifiedStations).toBe(value.motion!.stationCount)
  } finally { discardAssemblySolvePreview(value) }
  const rejected = prepareAssemblyMotionPreview(document, { ...request, rotation: { axis: 0, angle: 2 * Math.PI } })
  expect(rejected.status).toBe('rejected'); if (rejected.status === 'rejected') expect(rejected.message).toContain('Estación')
  expect('document' in rejected || 'motion' in rejected || 'limitDirectedAngles' in rejected).toBe(false); expect(serializeAssemblyDocument(document)).toBe(before)
}, 60_000)

it('admits a full-circle turn without recording winding or a seam stop', () => {
  const document = fixture(350, 120, 360), value = ready(prepareAssemblyMotionPreview(document, { component: component(document),
    translation: [...document.occurrences[1].pose.translation], rotation: { axis: 0, angle: 2 * Math.PI } }))
  try { near(report(value).angleDegrees, 350); expect(report(value).fullCircle).toBe(true); expect(report(value).activity).toBe('interior')
    expect(value.document.mates).toEqual(document.mates); near(value.motion!.evaluatedAngle, 2 * Math.PI)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('keeps Cancel, authenticated Apply, Undo/Redo and saved reopening independent of forged report fields', () => {
  const proposed = fixture(), base = validateAssemblyDocument(proposed); base.mates = []
  const history = new AssemblyDocumentHistory(base), session = new AssemblyWorkerSession(), source = serializeAssemblyDocument(base)
  try {
    const canceled = workerReady(session.prepare(base, proposed)); session.discard(canceled.token); expect(() => session.apply(base, canceled.token)).toThrow(); expect(history.canUndo).toBe(false)
    const value = workerReady(session.prepare(base, proposed)), exact = structuredClone(value.document), expected = structuredClone(value.limitDirectedAngles)
    value.limitDirectedAngles![0].arcDegrees.sweep = 360; value.limitDirectedAngles![0].guideDirection[0] = 999; value.limitDirectedAngles![0].angleDegrees = 999
    value.document.mates = []; const applied = session.apply(base, value.token).document; expect(applied).toEqual(exact); expect('limitDirectedAngles' in applied).toBe(false)
    history.commitDocument(applied); expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = workerReady(session.prepare(reopened))
    expect(fresh.limitDirectedAngles).toEqual(expected); near(physical(fresh.document), 350); expect(serializeAssemblyDocument(base)).toBe(source)
  } finally { session.discard() }
}, 60_000)

it.each([50, 60])('suppresses the stop, moves to %i, and restores it on explicit reactivation without changing its identity', theta => {
  let document = fixture(); const session = new AssemblyWorkerSession()
  try {
    const suppressed = validateAssemblyDocument(document); stop(suppressed).suppressed = true
    let value = workerReady(session.prepare(document, suppressed)); expect(value.limitDirectedAngles).toBeUndefined(); document = session.apply(document, value.token).document
    value = workerReady(session.move(document, { component: component(document), pose: { ...document.occurrences[1].pose, rotation: rx(theta) } }))
    document = session.apply(document, value.token).document; near(physical(document), theta)
    const active = validateAssemblyDocument(document); stop(active).suppressed = false
    value = workerReady(session.prepare(document, active)); near(report(value).angleDegrees, 30, 1e-6)
    const applied = session.apply(document, value.token).document; expect(stop(applied)).toEqual(stop(fixture())); near(physical(applied), 30, 1e-6)
  } finally { session.discard() }
}, 60_000)

it.each(['stale-guide', 'suppressed-guide', 'parallel-projection', 'ambiguous-restoration', 'precision'] as const)('rejects %s without candidate or history mutation', fault => {
  const document = fixture(); document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'guide', pose: { translation: [40, 0, 0], rotation: ry(90) } })
  stop(document).guide = reference(buildAssemblyScene(document), 'guide', 'plane')
  if (fault === 'stale-guide') stop(document).guide.component!.definition.revision = 'obsolete'
  if (fault === 'suppressed-guide') document.occurrences[2].suppressed = true
  if (fault === 'parallel-projection') document.occurrences[2].pose.rotation = [0, 0, 0, 1]
  if (fault === 'ambiguous-restoration') document.occurrences[1].pose.rotation = rx(180)
  const before = serializeAssemblyDocument(document), value = prepareAssemblySolve(document, fault === 'precision' ? { angleTolerance: 1e-15 } : {})
  expect(value.status).toBe('rejected'); expect('document' in value || 'limitDirectedAngles' in value).toBe(false); expect(serializeAssemblyDocument(document)).toBe(before)
}, 60_000)

it('authenticates guide witnesses by native snapshot identity and lifetime', () => {
  const document = fixture(), snapshot = new AssemblyGeometrySnapshot(document), other = new AssemblyGeometrySnapshot(document)
  try {
    const resolved = requireResolvedBinaryMate(snapshot.resolveActiveMates(document)[0]); expect(resolved.guide).toBeDefined(); expect(snapshot.assertWitness(resolved.guide!, document)).toBe(resolved.guide)
    expect(() => other.assertWitness(resolved.guide!, document)).toThrow()
    expect(() => measureAssemblyDirectedAngleWitnesses(document, [resolved.first, resolved.second, structuredClone(resolved.guide!)])).toThrow()
    snapshot.dispose(); expect(() => measureAssemblyDirectedAngleWitnesses(document, [resolved.first, resolved.second, resolved.guide!])).toThrow()
  } finally { snapshot.dispose(); other.dispose() }
}, 60_000)

it('keeps legacy principal angle semantics alongside the directed circular stop', () => {
  const document = fixture(), circular = stop(document)
  document.mates.push({ id: 'principal', name: 'Original principal interval', type: 'limit-angle', coordinate: 'principal-direction', suppressed: false,
    first: circular.first, second: circular.second, limits: { minimum: 5, maximum: 20 } })
  const value = ready(prepareAssemblySolve(document))
  try { near(report(value).angleDegrees, 350); near(value.limitAngles![0].angleDegrees, 10); expect(value.document.mates).toEqual(document.mates) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('rebuilds directed stops independently in two rotated reused scopes with unchanged circular intent', () => {
  const document = fixture(), sub: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-directed-scope', revision: 'r1', name: 'Original circular scope',
    createdAt: document.createdAt, updatedAt: document.updatedAt, occurrences: structuredClone(document.occurrences), mates: structuredClone(document.mates) }
  document.definitions.push(sub); document.mates = []; document.occurrences = [
    { id: 'A', name: 'Original first scope', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [100, 7, -9], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'B', name: 'Original second scope', definition: { id: sub.id, revision: sub.revision }, pose: { translation: [-70, 11, 4], rotation: ry(90) }, fixed: true, visible: false, suppressed: false }]
  const value = ready(prepareAssemblySolve(document))
  try { expect(value.limitDirectedAngles!.map(item => item.scopePath)).toEqual([['A'], ['B']]); value.limitDirectedAngles!.forEach(item => near(item.angleDegrees, 350))
    vector(value.limitDirectedAngles![0].guideDirection, [0, 1, 0]); vector(value.limitDirectedAngles![1].guideDirection, [0, 0, -1])
    const scene = buildAssemblyScene(validateAssemblyDocument(value.document)); expect(scene.solidCount).toBe(4); near(scene.volume, 960 - 16 * Math.PI, 1e-5); near(scene.area, 992 + 24 * Math.PI, 1e-5)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('requires fresh manual LINE guide repair on source revision and keeps the arc unchanged on reopening', () => {
  const document = fixture(); document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'guide', pose: { translation: [40, 0, 0], rotation: ry(90) } })
  stop(document).guide = reference(buildAssemblyScene(document), 'guide', 'line')
  const part = document.definitions.find(value => value.id === document.occurrences[0].definition.id)!
  if (part.kind !== 'part') throw new Error('Original source required')
  const replacement = structuredClone(part.document), extrusion = replacement.features.find(value => value.type === 'extrude')!
  if (extrusion.type !== 'extrude') throw new Error('Original extrusion required'); extrusion.depth = 5
  const review = reviewAssemblyPartSourceUpdate(document, { id: part.id, revision: part.revision }, replacement, 'r2')
  const guide = review.endpoints.find(value => value.locator.side === 'guide'); expect(guide?.status).toBe('needs-repair')
  expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  let repaired = review.document
  for (const item of review.endpoints) if (item.status === 'needs-repair') {
    const id = item.locator.side === 'guide' ? 'guide' : item.locator.side === 'first' ? 'ground' : 'moving'
    repaired = repairAssemblyEndpoint(repaired, item.locator, reference(review.scene, id, item.locator.side === 'guide' ? 'line' : 'plane'))
  }
  const session = new AssemblyWorkerSession()
  try { const value = workerReady(session.prepare(document, repaired)); near(report(value).angleDegrees, 350); expect(report(value).arcDegrees).toEqual({ start: 330, sweep: 60 })
    const applied = session.apply(document, value.token).document, reopened = workerReady(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied))))
    near(report(reopened).angleDegrees, 350); expect(applied.definitions.find(value => value.id === part.id && value.revision === 'r1')).toEqual(part)
  } finally { session.discard() }
}, 60_000)

it.each(['plane', 'line'] as const)('repairs a replaced native %s guide in one authenticated transaction', kind => {
  const document = fixture(); document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'guide', pose: { translation: [40, 0, 0], rotation: ry(90) } })
  stop(document).guide = reference(buildAssemblyScene(document), 'guide', kind)
  const originalPart = document.definitions.find(value => value.id === document.occurrences[0].definition.id)!
  if (originalPart.kind !== 'part') throw new Error('Original source required')
  const replacement = structuredClone(originalPart.document); replacement.id = 'original-replacement-guide'; replacement.name = 'Original taller guide prism'
  const extrusion = replacement.features.find(value => value.type === 'extrude')!
  if (extrusion.type !== 'extrude') throw new Error('Original extrusion required'); extrusion.depth = 5
  const session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(document), before = serializeAssemblyDocument(document)
  try {
    const review = session.reviewReplacement(document, { component: component(document, 'guide'), mode: 'selected', part: replacement, revision: 'r1', ancestorRevisions: [] })
    expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].locator.side).toBe('guide'); expect(review.mechanicalMates).toEqual([])
    expect(() => session.previewReplacement(document, review.reviewId, { repairs: [], removed: [], recapture: [] })).toThrow(/pendientes/)
    const freshReference = reference(review.replacementCatalog, 'catalog-part', kind); freshReference.component = structuredClone(review.endpoints[0].desiredComponent)
    const value = workerReady(session.previewReplacement(document, review.reviewId, { repairs: [{ locator: review.endpoints[0].locator, reference: freshReference }], removed: [], recapture: [] }))
    near(report(value).angleDegrees, 350); expect(report(value).arcDegrees).toEqual({ start: 330, sweep: 60 })
    const applied = session.apply(document, value.token).document; expect(stop(applied).guide.component?.definition.id).toBe(replacement.id)
    expect(stop(applied).first).toEqual(stop(document).first); expect(stop(applied).second).toEqual(stop(document).second)
    history.commitDocument(applied); expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(applied)
    const reopened = workerReady(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied)))); near(report(reopened).angleDegrees, 350)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it('repairs all three original owners during all-instance replacement and rejects decisions beyond the pending inventory', () => {
  const document = fixture(); document.occurrences.push({ ...structuredClone(document.occurrences[0]), id: 'guide', pose: { translation: [40, 0, 0], rotation: ry(90) } })
  stop(document).guide = reference(buildAssemblyScene(document), 'guide', 'line')
  const originalPart = document.definitions.find(value => value.id === document.occurrences[0].definition.id)!
  if (originalPart.kind !== 'part') throw new Error('Original source required')
  // Original 10x6x5 mm variant with the same eccentric R1 through bore.
  const replacement = structuredClone(originalPart.document); replacement.id = 'original-three-owner-replacement'
  for (const feature of replacement.features) if (feature.type === 'extrude' || feature.type === 'cut') feature.depth = 5
  const session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(document), before = serializeAssemblyDocument(document)
  try {
    const review = session.reviewReplacement(document, { component: component(document, 'guide'), mode: 'all', part: replacement, revision: 'r1', ancestorRevisions: [] })
    expect(review.expandedPaths).toEqual([['ground'], ['moving'], ['guide']])
    expect(review.endpoints.map(item => [item.locator.side, item.status])).toEqual([
      ['first', 'needs-repair'], ['second', 'needs-repair'], ['guide', 'needs-repair'],
    ])
    const repairs = review.endpoints.map(item => {
      const fresh = reference(review.replacementCatalog, 'catalog-part', item.locator.side === 'guide' ? 'line' : 'plane')
      fresh.component = structuredClone(item.desiredComponent)
      return { locator: item.locator, reference: fresh }
    })
    expect(() => session.previewReplacement(document, review.reviewId, { repairs: repairs.slice(0, 2), removed: [], recapture: [] })).toThrow(/pendientes/)
    let calls = 0
    const extra = { get locator() { calls++; return repairs[0].locator }, get reference() { calls++; return repairs[0].reference } }
    expect(() => session.previewReplacement(document, review.reviewId, { repairs: [...repairs, extra], removed: [], recapture: [] })).toThrow(/lista de decisiones excede el límite/)
    expect(calls).toBe(0); expect(serializeAssemblyDocument(document)).toBe(before)
    const value = workerReady(session.previewReplacement(document, review.reviewId, { repairs, removed: [], recapture: [] }))
    near(report(value).angleDegrees, 350); expect(report(value).arcDegrees).toEqual({ start: 330, sweep: 60 })
    expect(value.scene.solidCount).toBe(3); near(value.scene.volume, 900 - 15 * Math.PI, 1e-5); near(value.scene.area, 840 + 24 * Math.PI, 1e-5)
    const applied = session.apply(document, value.token).document
    for (const occurrence of applied.occurrences) {
      const previous = document.occurrences.find(item => item.id === occurrence.id)!
      expect(occurrence.definition).toEqual({ id: replacement.id, revision: 'r1' })
      vector(occurrence.pose.translation, previous.pose.translation)
      const sign = dot(occurrence.pose.rotation, previous.pose.rotation) < 0 ? -1 : 1,
        chord = Math.hypot(...occurrence.pose.rotation.map((value, index) => value - sign * previous.pose.rotation[index]))
      near(4 * Math.asin(Math.min(1, chord / 2)), 0, 1e-8)
    }
    expect(stop(applied).id).toBe(stop(document).id)
    for (const [index, endpoint] of [stop(applied).first, stop(applied).second, stop(applied).guide].entries()) {
      expect(endpoint).toEqual(repairs[index].reference)
    }
    expect(applied.definitions.find(item => item.id === originalPart.id && item.revision === originalPart.revision)).toEqual(originalPart)
    near(physical(applied, 5, ['ground', 'moving', 'guide']), 350)
    history.commitDocument(applied); expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(applied)
    const reopened = workerReady(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied))))
    near(report(reopened).angleDegrees, 350); expect(stop(reopened.document)).toEqual(stop(applied))
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it('requeries actual native directions after solving and withholds the candidate on final query failure', () => {
  const document = fixture(), before = serializeAssemblyDocument(document), actualSolve = numerical.solveRigidMates,
    actualQuery = CadEngine.prototype.inspectCurrentDirectionFaceSupport; let solved = false, finalQueries = 0
  const solve = vi.spyOn(numerical, 'solveRigidMates').mockImplementation((...args) => { const result = actualSolve(...args); solved = true; return result }),
    query = vi.spyOn(CadEngine.prototype, 'inspectCurrentDirectionFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
      const result = actualQuery.apply(this, args); if (solved) { finalQueries++; throw new Error('Original fresh directed direction fault') } return result
    })
  try { const value = prepareAssemblySolve(document); expect(value.status).toBe('rejected'); expect(finalQueries).toBeGreaterThan(0)
    expect('document' in value || 'limitDirectedAngles' in value).toBe(false); expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { solve.mockRestore(); query.mockRestore() }
}, 60_000)

it('keeps explicit arc editing identity while a stale preview cannot apply', () => {
  const document = fixture(), session = new AssemblyWorkerSession(), value = workerReady(session.prepare(document)), before = serializeAssemblyDocument(document),
    { id: _id, ...declaration } = stop(document), edited = applyAssemblyEdit(document, { type: 'update-mate', scope: { id: document.id, revision: document.revision },
      mateId: stop(document).id, mate: { ...declaration, arc: { start: 320, sweep: 80 } } })
  try { expect(stop(edited).id).toBe(stop(document).id); expect(() => session.apply(edited, value.token)).toThrow()
    expect(serializeAssemblyDocument(document)).toBe(before); const fresh = ready(prepareAssemblySolve(edited)); discardAssemblySolvePreview(fresh)
  } finally { session.discard() }
}, 60_000)
import { requireResolvedBinaryMate } from './kernel.assembly-binary-fixtures.test-utils'
