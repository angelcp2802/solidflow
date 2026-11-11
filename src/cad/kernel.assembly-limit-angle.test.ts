import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, Shape, Edge, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyGeometryReference, type AssemblyMate, type AssemblyAxisReference, type AssemblyPlaneReference,
  type EmbeddedAssemblyDefinition, type AssemblyOccurrence } from '../model/assemblyDocument'
import { identityRigidPose, type Quaternion, type RigidPose } from '../model/rigidPose'
import { AssemblyDocumentHistory, applyAssemblyEdit } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { createAssemblyExample } from '../examples/assembly'
import * as numerical from '../model/assemblySolver'
import { CadEngine } from './kernel.engine'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { assemblySceneEdgeReference, assemblySceneFaceReference, type AssemblyScene, type AssemblySceneFace,
  type AssemblyPreviewReply, type AssemblyLimitAngleSupportReport } from './kernel.assembly-types'
import { prepareAssemblySolve, prepareAssemblyMovePreview, prepareAssemblyDragPreview, prepareAssemblyMotionPreview,
  prepareAssemblyTranslationPreview, applyAssemblySolvePreview, discardAssemblySolvePreview, type AssemblySolvePreview } from './kernel.assembly-solve'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { ownedNativeTopology } from './kernel.native-topology'
import { extractAssemblyDirectionFaceSupport, extractAssemblyEdgeSupport } from './kernel.assembly-supports'
import { withNativeOwners, NativeCleanupError, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import type { Vec3 } from './kernel.types'

type DirectionKind = 'plane' | 'cylinder' | 'line'
type AngularMate = Extract<AssemblyMate, { type: 'limit-angle' }>
const kinds: DirectionKind[] = ['plane', 'cylinder', 'line']
const pairs = kinds.flatMap(first => kinds.map(second => ({ first, second })))
const singularCases = [{ theta: 0, minimum: 30, maximum: 60 }, { theta: 180, minimum: 0, maximum: 150 },
  { theta: 180, minimum: 0, maximum: 0 }, { theta: 0, minimum: 180, maximum: 180 }].flatMap(spec => [false, true]
  .flatMap(floating => [false, true].map(reversed => ({ ...spec, floating, reversed }))))
const near = (actual: number, expected: number, tolerance = 1e-8) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const vector = (actual: readonly number[], expected: readonly number[], tolerance = 1e-8) => {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, index) => near(value, expected[index], tolerance))
}
const tuple = (point: { X(): number; Y(): number; Z(): number }): Vec3 => [point.X(), point.Y(), point.Z()]
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0)
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => a.map(value => value / Math.hypot(...a)) as Vec3
const rx = (degrees: number): Quaternion => [Math.sin(degrees * Math.PI / 360), 0, 0, Math.cos(degrees * Math.PI / 360)]
function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]
}
function rotate(q: Quaternion, point: Vec3): Vec3 {
  const norm = Math.hypot(...q), a = q.map(value => value / norm) as Quaternion,
    value = multiply(multiply(a, [...point, 0]), [-a[0], -a[1], -a[2], a[3]])
  return [value[0], value[1], value[2]]
}
const transform = (pose: RigidPose, point: Vec3): Vec3 => rotate(pose.rotation, point).map((value, index) => value + pose.translation[index]) as Vec3
function leaf(document: AssemblyDocument, path: readonly string[]) {
  let scope: AssemblyDocument | EmbeddedAssemblyDefinition = document, pose = identityRigidPose()
  for (const [index, id] of path.entries()) {
    const occurrence: AssemblyOccurrence | undefined = scope.occurrences.find(value => value.id === id)
    if (!occurrence) throw new Error('Original current occurrence required')
    pose = { translation: transform(pose, occurrence.pose.translation), rotation: multiply(pose.rotation, occurrence.pose.rotation) }
    const part = document.definitions.find(value => value.id === occurrence.definition.id && value.revision === occurrence.definition.revision)
    if (!part) throw new Error('Original current definition required')
    if (index === path.length - 1 && part.kind === 'part') return { part, pose }
    if (part.kind !== 'assembly') throw new Error('Original nested assembly required'); scope = part
  }
  throw new Error('Original part path required')
}
let original: AssemblyDocument, originalScene: AssemblyScene, directionOriginal: AssemblyDocument, directionScene: AssemblyScene,
  screwOriginal: AssemblyDocument, rackOriginal: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const load = async (name: string) => parseAssemblyDocument(await readFile(new URL('./fixtures/' + name, import.meta.url), 'utf8'))
  original = await load('assembly-limit-angle-original.json'); originalScene = buildAssemblyScene(original)
  directionOriginal = await load('assembly-direction-mates-original.json'); directionScene = buildAssemblyScene(directionOriginal)
  screwOriginal = await load('assembly-screw-original.json'); rackOriginal = await load('assembly-rack-pinion-original.json')
}, 60_000)
function component(document: AssemblyDocument, id = 'moving') {
  const value = document.occurrences.find(item => item.id === id)
  if (!value) throw new Error('Actual driver required')
  return { occurrencePath: [id], definition: { ...value.definition } }
}
function face(scene: AssemblyScene, id: string, predicate: (value: AssemblySceneFace) => boolean): AssemblySceneFace {
  const matches = scene.bodies.filter(body => body.component.occurrencePath.at(-1) === id).flatMap(body => body.faces).filter(predicate)
  expect(matches).toHaveLength(1); return matches[0]
}
function cap(scene: AssemblyScene, id: string, z: number, sign = 1): AssemblyPlaneReference {
  const value = assemblySceneFaceReference(face(scene, id, item => item.support?.kind === 'plane'
    && Math.abs(item.support.point[2] - z) < 1e-8 && sign * item.support.normal[2] > .99))
  if (!value || value.support !== 'plane') throw new Error('Actual exact cap required')
  return { ...value, support: 'plane' }
}
function directionReference(id: string, kind: DirectionKind): AssemblyGeometryReference {
  const body = directionScene.bodies.find(value => value.component.occurrencePath[0] === id)!
  if (kind === 'line') {
    const matches = (body.edges ?? []).filter(value => value.support?.kind === 'line' && value.support.axis[2] > .99
      && Math.abs(value.support.point[0] - 5) < 1e-8 && Math.abs(value.support.point[1] - 3) < 1e-8)
    expect(matches).toHaveLength(1); return assemblySceneEdgeReference(matches[0])!
  }
  const matches = body.faces.filter(value => kind === 'cylinder' ? value.support?.kind === 'cylinder'
    : value.support?.kind === 'plane' && value.support.normal[2] > .99 && Math.abs(value.support.point[2] - 4) < 1e-8)
  expect(matches).toHaveLength(1); return assemblySceneFaceReference(matches[0])!
}
function relation(minimum = 30, maximum = 120, reversed = false): AngularMate {
  const moving = cap(originalScene, 'moving', 2), fixed = cap(originalScene, 'fixed', 4)
  return { id: 'angular-interval', name: 'Original principal direction interval', type: 'limit-angle', coordinate: 'principal-direction',
    suppressed: false, first: reversed ? fixed : moving, second: reversed ? moving : fixed, limits: { minimum, maximum } }
}
function mated(theta = 60, minimum = 30, maximum = 120, reversed = false): AssemblyDocument {
  const value = validateAssemblyDocument(original); value.occurrences[1].pose.rotation = rx(theta)
  value.mates = [relation(minimum, maximum, reversed)]; return validateAssemblyDocument(value)
}
function nativeReady(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function report(value: AssemblySolvePreview | Extract<AssemblyPreviewReply, { status: 'ready' }>): AssemblyLimitAngleSupportReport {
  expect(value.limitAngles).toHaveLength(1); const result = value.limitAngles![0]
  return { ...result, scopePath: [...result.scopePath], firstDirection: [...result.firstDirection], secondDirection: [...result.secondDirection],
    limitsDegrees: { ...result.limitsDegrees }, domainBounds: { ...result.domainBounds } }
}
/** Independent actual BRep D1/axis/LINE observations, never a production support helper. */
function physicalDirection(shape: Shape3D, pose: RigidPose, kind: DirectionKind, localZ: number, localSign = 1): Vec3 {
  return withNativeOwners(owners => {
    const oc = getOC(), wantedPoint = transform(pose, [0, 0, localZ]), wantedNormal = rotate(pose.rotation, [0, 0, localSign]), found: Vec3[] = []
    if (kind === 'line') {
      const lower = transform(pose, [5, 3, 0]), upper = transform(pose, [5, 3, 4])
      for (const edge of owners.ownAll(ownedNativeTopology(shape, 'edge'))) {
        const curve = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped))
        if (curve.GetType() !== oc.GeomAbs_CurveType.GeomAbs_Line) continue
        const p = tuple(owners.own(curve.Value(curve.FirstParameter()))), q = tuple(owners.own(curve.Value(curve.LastParameter()))),
          same = (a: Vec3, b: Vec3) => Math.hypot(...a.map((value, index) => value - b[index])) < 1e-6,
          forward = same(p, lower) && same(q, upper), backward = same(q, lower) && same(p, upper)
        if (!forward && !backward) continue
        const at = owners.own(new oc.gp_Pnt()), derivative = owners.own(new oc.gp_Vec()); curve.D1(curve.FirstParameter(), at, derivative)
        const tangent = unit(tuple(derivative)), orientation = dot(tangent, q.map((value, index) => value - p[index])) > 0 ? 1 : -1
        found.push(tangent.map(value => value * orientation * (forward ? 1 : -1)) as Vec3)
      }
    } else for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) {
      const adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false))
      if (kind === 'cylinder') {
        if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) continue
        const cylinder = owners.own(adaptor.Cylinder()), position = owners.own(cylinder.Position())
        found.push(unit(tuple(owners.own(position.Direction())))); continue
      }
      if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) continue
      const p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
      adaptor.D1(.37, .71, p, du, dv)
      const sign = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1,
        normal = unit(cross(tuple(du), tuple(dv))).map(value => sign * value) as Vec3
      if (dot(normal, wantedNormal) > .999 && Math.abs(dot(normal, tuple(p).map((value, index) => value - wantedPoint[index]))) < 1e-6) found.push(normal)
    }
    expect(found).toHaveLength(1); return found[0]
  })
}
function physical(document: AssemblyDocument, spec?: { first: DirectionKind; second: DirectionKind }, prefix: string[] = [], movingSign = 1): number {
  return withNativeOwners(owners => {
    const directions: Vec3[] = []
    for (const [index, id] of (spec ? ['ground', 'moving'] : ['moving', 'fixed']).entries()) {
      const { part, pose } = leaf(document, [...prefix, id]), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(part.document.features)
      expect(inventory.featureErrors).toEqual([])
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('Original exact solid required')
      const source = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(source, pose)), oc = getOC(),
        analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      const size: Vec3 = spec ? [10, 6, 4] : id === 'moving' ? [10, 6, 2] : [40, 30, 4]
      near(volume.Mass(), spec ? 240 - 4 * Math.PI : size[0] * size[1] * size[2], 1e-5)
      near(area.Mass(), spec ? 248 + 6 * Math.PI : 2 * (size[0] * size[1] + size[0] * size[2] + size[1] * size[2]), 1e-5)
      const bounds = owners.own(shape.boundingBox).bounds, corners = [-size[0] / 2, size[0] / 2].flatMap(x => [-size[1] / 2, size[1] / 2]
        .flatMap(y => [0, size[2]].map(z => transform(pose, [x, y, z]))))
      for (let axis = 0; axis < 3; axis++) { near(bounds[0][axis], Math.min(...corners.map(value => value[axis])), 1e-6); near(bounds[1][axis], Math.max(...corners.map(value => value[axis])), 1e-6) }
      directions.push(physicalDirection(shape, pose, spec ? index === 0 ? spec.first : spec.second : 'plane',
        id === 'moving' && movingSign < 0 ? 0 : size[2], id === 'moving' ? movingSign : 1))
    }
    return Math.atan2(Math.hypot(...cross(directions[0], directions[1])), dot(directions[0], directions[1]))
  })
}

it('reconstructs the original Rx60 two boxes and measures fresh native cap normals, metrics and all eight corner bounds', () => {
  expect(original.mates).toEqual([]); expect(originalScene.solidCount).toBe(2); expect(originalScene.prototypeCount).toBe(2)
  near(originalScene.volume, 4920, 1e-5); near(originalScene.area, 3144, 1e-5); near(physical(original), Math.PI / 3)
  const value = nativeReady(prepareAssemblySolve(mated()))
  try {
    const actual = report(value); expect(actual.coordinate).toBe('principal-direction'); near(actual.angleDegrees, 60, 1e-6)
    expect(actual.limitsDegrees).toEqual({ minimum: 30, maximum: 120 }); expect(actual.activity).toBe('interior')
    expect(actual.stratum).toBe('regular'); expect(actual.domainBounds).toEqual({ minimum: false, maximum: false })
    expect(value.scopes.at(-1)!.result.rank).toBe(0); expect(value.scopes.at(-1)!.result.localDOF).toBe(6)
    near(Math.atan2(Math.hypot(...cross(actual.firstDirection, actual.secondDirection)), dot(actual.firstDirection, actual.secondDirection)), Math.PI / 3)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(pairs)('uses the literal principal direction coordinate for native $first/$second in both orders, without plane/axis complement', spec => {
  const base = validateAssemblyDocument(directionOriginal), first = directionReference('ground', spec.first), second = directionReference('moving', spec.second),
    opposedSigns = (spec.first === 'cylinder') !== (spec.second === 'cylinder'), expected = opposedSigns ? 150 : 30
  base.mates = [{ ...relation(expected - 10, expected + 10), first, second }]
  for (const swapped of [false, true]) {
    const proposed = validateAssemblyDocument(base), binary = requireBinaryAssemblyMate(proposed.mates[0]); if (swapped) [binary.first, binary.second] = [second, first]
    const value = nativeReady(prepareAssemblySolve(proposed))
    try {
      const actual = report(value); near(actual.angleDegrees, expected, 1e-6); near(physical(validateAssemblyDocument(value.document), spec), expected * Math.PI / 180)
      expect(actual.firstKind).toBe(swapped ? spec.second : spec.first); expect(actual.secondKind).toBe(swapped ? spec.first : spec.second)
      expect(value.document.mates).toEqual(proposed.mates); expect(value.scopes.at(-1)!.result.rank).toBe(0)
      const without = validateAssemblyDocument(value.document); without.mates = []; expect(without.occurrences).toEqual(base.occurrences)
    } finally { discardAssemblySolvePreview(value) }
  }
}, 60_000)

it.each([30, 60, 120])('keeps literal regular bound/interior alpha=%i degrees separate from bilateral rank', theta => {
  const base = mated(theta), before = serializeAssemblyDocument(base), value = nativeReady(prepareAssemblySolve(base))
  try { near(physical(validateAssemblyDocument(value.document)), theta * Math.PI / 180); expect(value.scopes.at(-1)!.result.rank).toBe(0)
    expect(report(value).activity).toBe(theta === 30 ? 'minimum' : theta === 120 ? 'maximum' : 'interior'); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([15, 150])('rejects strict driver alpha=%i instead of clamping or publishing an invalid candidate', theta => {
  const base = mated(), before = serializeAssemblyDocument(base), value = prepareAssemblyMovePreview(base, { component: component(base), pose: { ...base.occurrences[1].pose, rotation: rx(theta) } })
  expect(value.status).toBe('rejected'); expect('document' in value || 'limitAngles' in value).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each([{ wanted: 15, expected: 30 }, { wanted: 150, expected: 120 }])('projects alpha$wanted to its original regular bound $expected with separate angular target error', spec => {
  const base = mated(), value = nativeReady(prepareAssemblyDragPreview(base, { component: component(base), mode: 'rotate',
    pose: { ...base.occurrences[1].pose, rotation: rx(spec.wanted) } }))
  try { near(physical(validateAssemblyDocument(value.document)), spec.expected * Math.PI / 180); near(value.projection!.angleResidual, Math.abs(spec.wanted - spec.expected) * Math.PI / 180)
    near(value.projection!.positionResidual, 0, 1e-6); expect(value.document.mates).toEqual(base.mates)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([30, 120])('releases inward from the alpha=%i boundary to the unchanged literal target60', theta => {
  const base = mated(theta), value = nativeReady(prepareAssemblyDragPreview(base, { component: component(base), mode: 'rotate', pose: { ...base.occurrences[1].pose, rotation: rx(60) } }))
  try { near(physical(validateAssemblyDocument(value.document)), Math.PI / 3); expect(report(value).activity).toBe('interior'); near(value.projection!.angleResidual, 0)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(singularCases)('restores native singular alpha$theta into [$minimum,$maximum] (floating=$floating,reversed=$reversed) rather than treating zero cosine gradient as conflict', spec => {
  const base = mated(spec.theta, spec.minimum, spec.maximum, spec.reversed); base.occurrences[0].fixed = !spec.floating
  const before = serializeAssemblyDocument(base), value = nativeReady(prepareAssemblySolve(base))
  try { const angle = physical(validateAssemblyDocument(value.document)); expect(angle).toBeGreaterThanOrEqual(spec.minimum * Math.PI / 180 - 1e-8)
    expect(angle).toBeLessThanOrEqual(spec.maximum * Math.PI / 180 + 1e-8); expect(value.document.mates).toEqual(base.mates); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([{ theta: 0, minimum: 0, maximum: 180 }, { theta: 180, minimum: 0, maximum: 180 },
  { theta: 0, minimum: 0, maximum: 60 }, { theta: 180, minimum: 30, maximum: 180 },
  { theta: 0, minimum: 0, maximum: 0 }, { theta: 180, minimum: 180, maximum: 180 },
  { theta: 60, minimum: 60, maximum: 60 }])('keeps domain/equality strata alpha$theta [$minimum,$maximum] distinct from bilateral rank and activity', spec => {
  const base = mated(spec.theta, spec.minimum, spec.maximum), value = nativeReady(prepareAssemblySolve(base))
  try { near(physical(validateAssemblyDocument(value.document)), spec.theta * Math.PI / 180); const actual = report(value)
    expect(actual.domainBounds).toEqual({ minimum: spec.minimum === 0, maximum: spec.maximum === 180 }); expect(value.scopes.at(-1)!.result.rank).toBe(0)
    expect(actual.activity).toBe(spec.minimum === spec.maximum ? 'both' : spec.theta === spec.minimum ? 'minimum' : spec.theta === spec.maximum ? 'maximum' : 'interior')
    expect(actual.stratum).toBe(spec.theta === 0 ? 'parallel' : spec.theta === 180 ? 'antiparallel' : 'regular')
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([{ theta: 0, minimum: 0, maximum: 60, target: 10, feasible: true }, { theta: 180, minimum: 30, maximum: 180, target: 170, feasible: true },
  { theta: 0, minimum: 0, maximum: 0, target: 10, feasible: false }, { theta: 180, minimum: 180, maximum: 180, target: 170, feasible: false }])('checks actual finite endpoint tilt alpha$theta->$target against [$minimum,$maximum]', spec => {
  const base = mated(spec.theta, spec.minimum, spec.maximum), value = prepareAssemblyMovePreview(base, { component: component(base), pose: { ...base.occurrences[1].pose, rotation: rx(spec.target) } })
  expect(value.status).toBe(spec.feasible ? 'ready' : 'rejected')
  if (value.status === 'ready') try { near(physical(validateAssemblyDocument(value.document)), spec.target * Math.PI / 180) } finally { discardAssemblySolvePreview(value) }
  else expect('document' in value || 'limitAngles' in value).toBe(false)
}, 60_000)

it.each([false, true])('keeps an unused far translation out of angular length conditioning (endpoint=%s)', endpoint => {
  const base = mated(); if (endpoint) base.occurrences[1].pose.translation = [1e12, -1e12, 1e12]
  else base.occurrences.push({ ...structuredClone(base.occurrences[0]), id: 'far-unused', pose: { ...identityRigidPose(), translation: [1e12, -1e12, 1e12] } })
  const value = nativeReady(prepareAssemblySolve(base))
  try { near(report(value).angleDegrees, 60, 1e-6); expect(value.document.occurrences).toEqual(base.occurrences) } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('retains the original millimeter precision guard when actual positional constraints participate', () => {
  const base = mated(); base.occurrences.push({ ...structuredClone(base.occurrences[0]), id: 'far-unused', pose: { ...identityRigidPose(), translation: [1e12, 0, 0] } })
  base.mates.push({ id: 'real-distance', name: 'Original positional relation', type: 'distance', suppressed: false, alignment: 'aligned', distance: 18,
    first: { kind: 'principal-plane', component: component(base), plane: 'XY' }, second: { kind: 'principal-plane', component: null, plane: 'XY' } })
  const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('precisionLimit')
}, 60_000)

it('rejects an angular frame chain whose conservative composition bound exceeds the requested angular precision', () => {
  const base = mated(), result = prepareAssemblySolve(base, { angleTolerance: 1e-15 })
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('precisionLimit')
}, 60_000)

it.each([false, true])('retains common rigid gauge for two floating angular owners (reversed=%s)', reversed => {
  const base = mated(60, 30, 120, reversed); base.occurrences[0].fixed = false
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.rank).toBe(0); expect(value.scopes.at(-1)!.result.localDOF).toBe(12)
    near(physical(validateAssemblyDocument(value.document)), Math.PI / 3); expect(value.document.occurrences).toEqual(base.occurrences)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([false, true])('checks invariant same-owner native normal angles without inventing a body lock (impossible=%s)', impossible => {
  const base = validateAssemblyDocument(original); base.occurrences = [base.occurrences[1]]
  base.mates = [{ ...relation(impossible ? 30 : 180, 180), first: cap(originalScene, 'moving', 2), second: cap(originalScene, 'moving', 0, -1) }]
  if (impossible) (base.mates[0] as AngularMate).limits = { minimum: 30, maximum: 120 }
  const value = prepareAssemblySolve(base)
  if (impossible) { expect(value.status).toBe('rejected'); expect('document' in value).toBe(false) }
  else { const actual = nativeReady(value); try { near(report(actual).angleDegrees, 180, 1e-6); expect(actual.scopes.at(-1)!.result.rank).toBe(0)
    expect(actual.scopes.at(-1)!.result.localDOF).toBe(6); expect(actual.document.occurrences).toEqual(base.occurrences)
  } finally { discardAssemblySolvePreview(actual) } }
}, 60_000)

it.each([false, true])('retains both originally declared duplicate/reversed intervals (incompatible=%s)', incompatible => {
  const base = mated(); base.mates.push({ ...relation(incompatible ? 130 : 30, incompatible ? 150 : 120, true), id: 'other-angular-interval' })
  const before = serializeAssemblyDocument(base), value = prepareAssemblySolve(base)
  if (incompatible) { expect(value.status).toBe('rejected'); expect('document' in value).toBe(false) }
  else { const actual = nativeReady(value); try { expect(actual.limitAngles).toHaveLength(2); expect(actual.scopes.at(-1)!.result.rank).toBe(0)
    actual.limitAngles!.forEach(item => near(item.angleDegrees, 60, 1e-6)); near(physical(validateAssemblyDocument(actual.document)), Math.PI / 3)
  } finally { discardAssemblySolvePreview(actual) } }
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('uses actual opposite native BOTTOM normals with the literal complementary interval, without implicit edit conversion', () => {
  const base = mated(); const mate = base.mates[0] as AngularMate
  mate.first = cap(originalScene, 'moving', 0, -1); mate.limits = { minimum: 60, maximum: 150 }
  const value = nativeReady(prepareAssemblySolve(base))
  try { near(report(value).angleDegrees, 120, 1e-6); near(physical(validateAssemblyDocument(value.document), undefined, [], -1), 2 * Math.PI / 3)
    expect(value.document.mates).toEqual(base.mates)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('admits an explicit principal plane against the exact native plane without adding a position condition', () => {
  const base = mated(); const mate = base.mates[0] as AngularMate
  mate.second = { kind: 'principal-plane', component: null, plane: 'XY' }; base.occurrences[1].pose.translation = [123, -456, 789]
  const value = nativeReady(prepareAssemblySolve(base))
  try { near(report(value).angleDegrees, 60, 1e-6); expect(value.document.occurrences).toEqual(base.occurrences); expect(value.document.mates).toEqual(base.mates) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(['suppressed', 'deleted', 'hidden'] as const)('keeps saved declaration/report semantics when the native angular interval is %s', mode => {
  const base = mated(); if (mode === 'suppressed') base.mates[0].suppressed = true; if (mode === 'deleted') base.mates = []; if (mode === 'hidden') base.occurrences[1].visible = false
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.limitAngles?.length ?? 0).toBe(mode === 'hidden' ? 1 : 0); expect(value.document.mates).toEqual(base.mates)
    expect(buildAssemblyScene(validateAssemblyDocument(value.document)).solidCount).toBe(2)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('keeps native angular reports display-only through Cancel/repeat, token Apply, one Undo/Redo and fresh saved reopen', () => {
  const base = validateAssemblyDocument(original), proposed = mated(), session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(base), source = serializeAssemblyDocument(base)
  try {
    const canceled = ready(session.prepare(base, proposed)); session.discard(canceled.token); expect(() => session.apply(base, canceled.token)).toThrow('disponible')
    expect(history.canUndo).toBe(false)
    const value = ready(session.prepare(base, proposed)), exact = structuredClone(value.document), expected = structuredClone(value.limitAngles)
    value.limitAngles![0].angleDegrees = 999; value.limitAngles![0].limitsDegrees.maximum = 999; value.limitAngles![0].firstDirection[0] = 999
    value.limitAngles![0].scopePath.push('forged'); value.limitAngles![0].domainBounds.minimum = true; value.document.name = 'forged'; value.document.occurrences[1].pose.rotation = rx(150)
    const applied = session.apply(base, value.token).document; expect(applied).toEqual(exact); expect('limitAngles' in applied).toBe(false)
    history.commitDocument(applied); expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied); expect(history.canRedo).toBe(false)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    expect(fresh.limitAngles).toEqual(expected); expect(fresh.document.mates).toEqual(applied.mates); near(physical(fresh.document), Math.PI / 3)
    session.apply(reopened, fresh.token); expect(serializeAssemblyDocument(base)).toBe(source)
  } finally { session.discard() }
}, 60_000)

it('preserves exact interval identity during parameter editing and rejects cloned/stale native authority', () => {
  const base = mated(), history = new AssemblyDocumentHistory(base), value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(() => applyAssemblySolvePreview(history, structuredClone(value))).toThrow('vista previa')
    const { id: _id, ...declaration } = relation(20, 130), edited = applyAssemblyEdit(base, { type: 'update-mate',
      scope: { id: base.id, revision: base.revision }, mateId: 'angular-interval', mate: declaration })
    expect(edited.mates[0].id).toBe('angular-interval'); expect(() => applyAssemblySolvePreview(new AssemblyDocumentHistory(edited), value)).toThrow()
    expect(history.current).toEqual(base); expect(history.canUndo).toBe(false)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('keeps the new mixed principal interval plus legacy angle independent of a far unused translation', () => {
  const base = mated(), first = (base.mates[0] as AngularMate).first, second = (base.mates[0] as AngularMate).second
  base.mates.push({ id: 'legacy-angular', name: 'Original exact 60-degree relation', type: 'angle', suppressed: false, first, second, angle: 60 })
  base.occurrences.push({ ...structuredClone(base.occurrences[0]), id: 'far-unused', pose: { ...identityRigidPose(), translation: [1e12, -1e12, 1e12] } })
  const value = nativeReady(prepareAssemblySolve(base))
  try { near(report(value).angleDegrees, 60, 1e-6); expect(value.scopes.at(-1)!.result.rank).toBe(1); expect(value.document.occurrences).toEqual(base.occurrences) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(['foreign-body', 'foreign-definition', 'stale-key', 'missing-owner', 'suppressed-owner', 'axis-purpose'] as const)('withholds exact native angular authority for %s', fault => {
  const base = mated(), mate = base.mates[0] as AngularMate
  if (mate.first.kind !== 'face') throw new Error('Actual original face required')
  if (fault === 'foreign-body') mate.first.body = { bodyId: 'angle-fixed-body', sourceFeatureId: 'fixed-solid' }
  if (fault === 'foreign-definition') mate.first.component.definition.id = 'limit-angle-fixed'
  if (fault === 'stale-key') mate.first.face.key += '-stale'
  if (fault === 'missing-owner') mate.first.component.occurrencePath = ['missing']
  if (fault === 'suppressed-owner') base.occurrences[1].suppressed = true
  if (fault === 'axis-purpose') Object.assign(mate.first, { support: 'axis' })
  const before = JSON.stringify(base), value = prepareAssemblySolve(base)
  expect(value.status).toBe('rejected'); expect('document' in value || 'limitAngles' in value).toBe(false); expect(JSON.stringify(base)).toBe(before)
}, 60_000)

it('repairs the current exact native depth revision explicitly without changing angular bounds or older source', () => {
  const base = mated(), part = base.definitions.find(item => item.id === 'limit-angle-moving')!
  if (part.kind !== 'part') throw new Error('Original moving box required')
  const replacement = structuredClone(part.document), extrude = replacement.features[1]
  if (extrude.type !== 'extrude') throw new Error('Original box extrusion required'); extrude.depth = 4
  const review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, replacement, 'r2')
  expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].status).toBe('needs-repair'); expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  const repaired = repairAssemblyEndpoint(review.document, review.endpoints[0].locator, cap(review.scene, 'moving', 4)), session = new AssemblyWorkerSession()
  try { const value = ready(session.prepare(base, repaired)); near(report(value).angleDegrees, 60, 1e-6); expect(report(value).limitsDegrees).toEqual({ minimum: 30, maximum: 120 })
    const applied = session.apply(base, value.token).document; expect(applied.definitions.find(value => value.id === part.id && value.revision === 'r1')).toEqual(part)
    const fresh = ready(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied)))); near(report(fresh).angleDegrees, 60, 1e-6); expect(fresh.document.mates).toEqual(applied.mates)
  } finally { session.discard() }
}, 60_000)

it('keeps native angular witness identity and lifetime separate from mutated scene directions', () => {
  const base = mated(), snapshot = new AssemblyGeometrySnapshot(base), other = new AssemblyGeometrySnapshot(base)
  try {
    const actual = requireResolvedBinaryMate(snapshot.resolveActiveMates(base)[0]); expect(snapshot.assertWitness(actual.first, base)).toBe(actual.first)
    expect(() => snapshot.assertWitness(structuredClone(actual.first), base)).toThrow(); expect(() => other.assertWitness(actual.first, base)).toThrow()
    const scene = buildAssemblyScene(base), selected = face(scene, 'moving', value => value.support?.kind === 'plane' && value.support.normal[2] > .99 && Math.abs(value.support.point[2] - 2) < 1e-8)
    if (selected.support?.kind !== 'plane') throw new Error('Actual plane metadata required'); selected.support.normal = [1, 0, 0]
    const value = nativeReady(prepareAssemblySolve(base)); try { near(report(value).angleDegrees, 60, 1e-6) } finally { discardAssemblySolvePreview(value) }
    snapshot.dispose(); expect(() => snapshot.assertWitness(actual.first, base)).toThrow()
  } finally { snapshot.dispose(); other.dispose() }
}, 60_000)

it('rejects a genuine circular native edge falsely declared as a LINE before numerical admission', () => {
  const base = validateAssemblyDocument(directionOriginal), body = directionScene.bodies.find(item => item.component.occurrencePath[0] === 'moving')!,
    edge = (body.edges ?? []).find(item => item.support === null)
  if (!edge) throw new Error('Original current circular bore edge required')
  base.mates = [{ ...relation(), first: { kind: 'edge', ...structuredClone(edge.selection), support: 'line' }, second: directionReference('ground', 'plane') }]
  const actual = numerical.solveRigidMates, solver = vi.spyOn(numerical, 'solveRigidMates').mockImplementation(actual), before = serializeAssemblyDocument(base)
  try { const value = prepareAssemblySolve(base); expect(value.status).toBe('rejected'); expect(solver).not.toHaveBeenCalled()
    expect('document' in value || 'limitAngles' in value).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { solver.mockRestore() }
}, 60_000)

it.each([false, true])('remeasures both reused rotated native scopes with hidden parent=%s', hidden => {
  const base = mated(), child: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'angle-reused-child', revision: 'r1', name: 'Original angular local scope',
    createdAt: base.createdAt, updatedAt: base.updatedAt, occurrences: structuredClone(base.occurrences), mates: structuredClone(base.mates) }
  base.definitions.push(child); base.mates = []; base.occurrences = [
    { id: 'A', name: 'Original Rz90 parent', definition: { id: child.id, revision: child.revision }, fixed: true, suppressed: false, visible: !hidden,
      pose: { translation: [100, 7, -9], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } },
    { id: 'B', name: 'Original Ry90 parent', definition: { id: child.id, revision: child.revision }, fixed: true, suppressed: false, visible: true,
      pose: { translation: [-70, 11, 4], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] } }]
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.limitAngles?.map(item => item.scopePath)).toEqual([['A'], ['B']]); for (const path of [['A'], ['B']]) near(physical(validateAssemblyDocument(value.document), undefined, path), Math.PI / 3)
    const scene = buildAssemblyScene(validateAssemblyDocument(value.document)); expect(scene.solidCount).toBe(4); near(scene.volume, 9840, 1e-5); near(scene.area, 6288, 1e-5)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('queries native D1 directions again after numerical solving and rejects a final actual query failure', () => {
  const base = mated(), before = serializeAssemblyDocument(base), actualSolve = numerical.solveRigidMates,
    actualQuery = CadEngine.prototype.inspectCurrentDirectionFaceSupport; let solved = false, finalQueries = 0
  const solver = vi.spyOn(numerical, 'solveRigidMates').mockImplementation((...args) => { const value = actualSolve(...args); solved = true; return value }),
    query = vi.spyOn(CadEngine.prototype, 'inspectCurrentDirectionFaceSupport').mockImplementation(function (this: CadEngine, ...args) {
      const support = actualQuery.apply(this, args); if (solved && ++finalQueries === 2) throw new Error('Original final D1 measurement failure'); return support
    })
  try { const value = prepareAssemblySolve(base); expect(value.status).toBe('rejected'); expect(finalQueries).toBe(2)
    expect('document' in value || 'limitAngles' in value).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { query.mockRestore(); solver.mockRestore() }
}, 60_000)

function observeD1<T>(patch: (owner: NativeOwner, query: number, index: number) => void, operation: () => T): T {
  const arena = ownership.withNativeOwners; let query = 0
  const implementation: typeof arena = <R>(work: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => arena(owners => {
    if (context === 'Assembly direction-plane measurement or release failed.') {
      const current = query++, own = owners.own.bind(owners); let index = 0
      owners.own = <V extends NativeOwner>(value: V): V => { patch(value, current, index++); return own(value) }
    }
    return work(owners)
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { return operation() } finally { spy.mockRestore() }
}
it.each([0, 1].flatMap(endpoint => [0, 1, 2, 3].map(owner => ({ endpoint, owner }))))('drains every actual D1 owner and withholds angular authority on endpoint$endpoint owner$owner cleanup failure', spec => {
  const released: number[] = [], failure = new Error('Original angular D1 owner cleanup failure'), value = observeD1((owner, endpoint, index) => {
    if (endpoint !== spec.endpoint) return
    const remove = owner.delete.bind(owner); Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(index); remove(); if (index === spec.owner) throw failure } })
  }, () => prepareAssemblySolve(mated()))
  expect(value.status).toBe('rejected'); expect('document' in value || 'limitAngles' in value).toBe(false); expect(released).toEqual([3, 2, 1, 0])
}, 60_000)

it('preserves both native D1 point query and cleanup errors instead of exposing a partial angular report', () => {
  const primary = new Error('Original D1 point coordinate failure'), cleanup = new Error('Original D1 point cleanup failure'),
    actual = CadEngine.prototype.inspectCurrentDirectionFaceSupport; let observed: unknown, releases = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentDirectionFaceSupport').mockImplementation(function (this: CadEngine, ...args) { try { return actual.apply(this, args) } catch (error) { observed = error; throw error } })
  try {
    const value = observeD1((owner, endpoint, index) => {
      if (endpoint !== 1 || index !== 1) return
      const point = owner as NativeOwner & { X(): number }, read = point.X.bind(point), remove = point.delete.bind(point)
      Object.defineProperty(point, 'X', { configurable: true, value: () => { read(); throw primary } })
      Object.defineProperty(point, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
    }, () => prepareAssemblySolve(mated()))
    const errors = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(errors) : [])]
    expect(value.status).toBe('rejected'); expect(observed).toBeInstanceOf(NativeCleanupError); expect(errors(observed)).toContain(primary); expect(errors(observed)).toContain(cleanup)
    expect(releases).toBe(1); expect('document' in value || 'limitAngles' in value).toBe(false)
  } finally { query.mockRestore() }
}, 60_000)

it.each(kinds)('keeps the native %s direction convention explicit under actual topology orientation reversal', kind => withNativeOwners(owners => {
  const part = directionOriginal.definitions.find(item => item.id === 'direction-block')!; if (part.kind !== 'part') throw new Error('Original direction part required')
  const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
  const inventory = engine.rebuildForAssemblyReferences(part.document.features); if (inventory.kind !== 'explicit') throw new Error('Original exact body required')
  const shape = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref))
  if (kind === 'line') {
    const matches = owners.ownAll(ownedNativeTopology(shape, 'edge')).filter(edge => {
      const oc = getOC(), curve = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped)); if (curve.GetType() !== oc.GeomAbs_CurveType.GeomAbs_Line) return false
      const a = tuple(owners.own(curve.Value(curve.FirstParameter()))), b = tuple(owners.own(curve.Value(curve.LastParameter())))
      return Math.abs(a[0] - 5) < 1e-8 && Math.abs(a[1] - 3) < 1e-8 && Math.abs(b[0] - 5) < 1e-8 && Math.abs(b[1] - 3) < 1e-8
    })
    expect(matches).toHaveLength(1); const edge = matches[0], orientation = edge.wrapped.Orientation(), raw = owners.own(edge.wrapped.Reversed()),
      reversed = owners.own(new Edge(getOC().TopoDS.Edge(raw)))
    vector(extractAssemblyEdgeSupport(edge).axis, [0, 0, 1]); vector(extractAssemblyEdgeSupport(reversed).axis, [0, 0, 1]); expect(edge.wrapped.Orientation()).toBe(orientation)
  } else {
    const matches = owners.ownAll(ownedNativeTopology(shape, 'face')).filter(face => {
      if (kind === 'cylinder') return face.geomType === 'CYLINDRE'
      if (face.geomType !== 'PLANE') return false
      const data = extractAssemblyDirectionFaceSupport(face); return data.kind === 'plane' && data.normal[2] > .99 && Math.abs(data.point[2] - 4) < 1e-8
    })
    expect(matches).toHaveLength(1); const face = matches[0], orientation = face.wrapped.Orientation(), reversed = owners.own(face.flipOrientation()),
      a = extractAssemblyDirectionFaceSupport(face), b = extractAssemblyDirectionFaceSupport(reversed)
    if (a.kind === 'plane' && b.kind === 'plane') { vector(a.normal, [0, 0, 1]); vector(b.normal, [0, 0, -1]) }
    else if (a.kind === 'cylinder' && b.kind === 'cylinder') { vector(a.axis, [0, 0, -1]); vector(b.axis, [0, 0, -1]) }
    else throw new Error('Original direction kind changed')
    expect(face.wrapped.Orientation()).toBe(orientation)
  }
}), 60_000)

it.each(['prepare', 'apply'] as const)('retires angular worker authority on %s final scene failure after actual native mesh work', stage => {
  const base = validateAssemblyDocument(original), proposed = mated(), session = new AssemblyWorkerSession(), prior = ready(session.prepare(base, proposed)),
    originalMesh = Shape.prototype.mesh; let reached = false
  const mesh = vi.spyOn(Shape.prototype, 'mesh').mockImplementation(function (this: Shape3D, ...args) { originalMesh.apply(this, args); reached = true; throw new Error('Original final angular scene fault') })
  try { expect(() => stage === 'apply' ? session.apply(base, prior.token) : session.prepare(base, proposed)).toThrow(); expect(reached).toBe(true)
    expect(() => session.apply(base, prior.token)).toThrow('disponible'); expect(base.mates).toEqual([])
  } finally { mesh.mockRestore(); session.discard() }
}, 60_000)

it('does not inherit the constant-rotation contact-stop family allowlist', () => {
  const base = mated(), value = prepareAssemblyTranslationPreview(base, { component: component(base), translation: [1, 0, 0] })
  expect(value.status).toBe('rejected'); if (value.status === 'rejected') expect(value.message).toContain('trayectoria rectilínea')
}, 60_000)

it('rejects an explicit sampled +240-degree excursion whose feasible endpoint quaternions hide an invalid middle', () => {
  const base = mated(-120, 90, 150), before = serializeAssemblyDocument(base), value = prepareAssemblyMotionPreview(base, {
    component: component(base), translation: [...base.occurrences[1].pose.translation], rotation: { axis: 0, angle: 4 * Math.PI / 3 } })
  expect(value.status).toBe('rejected'); if (value.status === 'rejected') expect(value.message).toContain('Estación')
  expect('document' in value || 'motion' in value || 'limitAngles' in value).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  near(physical(base), 2 * Math.PI / 3)
}, 60_000)

it('honestly rejects infeasible native angular restoration under a zero iteration/seed budget', () => {
  const base = mated(0, 30, 60), value = prepareAssemblySolve(base, { solver: { maxIterations: 0, maxSeedPasses: 0 } })
  expect(value.status).toBe('rejected'); expect('document' in value || 'limitAngles' in value).toBe(false)
  if (value.status === 'rejected') expect(value.scopes.at(-1)!.result.iterations).toBe(0)
}, 60_000)

function axis(scene: AssemblyScene, id: string, radius: number, x?: number): AssemblyAxisReference {
  const selected = face(scene, id, value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - radius) < 1e-9
    && (x === undefined || Math.abs(value.support.point[0] - x) < 1e-9)), reference = assemblySceneFaceReference(selected)
  if (!reference || reference.support !== 'axis') throw new Error('Actual native bearing axis required')
  return { ...reference, support: 'axis' }
}
function mechanism(kind: 'gear' | 'screw' | 'rack') {
  const base = kind === 'gear' ? createAssemblyExample() : validateAssemblyDocument(kind === 'screw' ? screwOriginal : rackOriginal),
    driver = kind === 'gear' ? 'left' : kind === 'screw' ? 'shaft' : 'pinion'
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) base.occurrences.find(item => item.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = buildAssemblyScene(base), bearings: AssemblyMate[] = []
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) bearings.push(
    { id: id + '-axis', name: 'Original pin bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null,
      first: axis(scene, id, 2), second: axis(scene, 'plate', 3, x) },
    { id: id + '-cap', name: 'Original cap stop', type: 'coincident', suppressed: false, alignment: 'aligned', first: cap(scene, id, 12), second: cap(scene, 'plate', 4) })
  else bearings.push(
    { id: 'bearing', name: 'Original motor bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(scene, driver, 2), second: axis(scene, 'ground', 3) },
    { id: 'axial', name: 'Original axial datum', type: 'distance', suppressed: false, alignment: 'aligned', distance: 18, first: cap(scene, driver, 30), second: cap(scene, 'ground', 4) },
    { id: 'guide', name: 'Original nonrotating follower', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: [0, 0, 0, 1],
      first: axis(scene, kind === 'screw' ? 'nut' : 'rack', 2.5), second: axis(scene, kind === 'screw' ? 'ground' : 'guide', kind === 'screw' ? 3 : 2) })
  base.mates = bearings; const session = new AssemblyWorkerSession(), initial = ready(session.prepare(base))
  const capture = kind === 'gear' ? session.captureGear(base, initial.token, { first: axis(initial.scene, 'left', 2), second: axis(initial.scene, 'right', 2),
    carrier: component(base, 'plate'), ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original angular-stop gear' })
    : kind === 'screw' ? session.captureScrew(base, initial.token, { first: axis(initial.scene, 'shaft', 2), second: axis(initial.scene, 'nut', 2.5),
      lead: 2, reverse: false, alignment: 'aligned', name: 'Original angular-stop screw' })
      : session.captureRackPinion(base, initial.token, { first: axis(initial.scene, 'pinion', 2), second: (() => {
        const edge = initial.scene.bodies.find(body => body.component.occurrencePath[0] === 'rack')!.edges!.find(item => item.support?.kind === 'line'
          && item.support.axis[2] > .99 && Math.abs(Math.abs(item.support.point[0]) - 5) < 1e-9 && Math.abs(Math.abs(item.support.point[1]) - 5) < 1e-9)
        if (!edge) throw new Error('Original rack LINE required'); return assemblySceneEdgeReference(edge)!
      })(), conversion: { mode: 'diameter', override: null }, reverse: false, name: 'Original angular-stop rack' })
  let document = session.apply(base, ready(capture).token).document
  const current = buildAssemblyScene(document), proposed = validateAssemblyDocument(document)
  proposed.mates.push({ ...relation(0, 0), id: 'mechanical-angular-interval', name: 'Original native axial direction stop',
    first: cap(current, driver, kind === 'gear' ? 12 : 30), second: { kind: 'principal-plane', component: null, plane: 'XY' } })
  const supported = ready(session.prepare(document, proposed)); document = session.apply(document, supported.token).document
  return { session, document, driver }
}

/** Rebuild a measured leaf independently, including its native eccentric axis. */
function placedDirection(document: AssemblyDocument, path: readonly string[], kind: DirectionKind, localZ: number, sign = 1): Vec3 {
  return withNativeOwners(owners => {
    const { part, pose } = leaf(document, path), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
    const inventory = engine.rebuildForAssemblyReferences(part.document.features)
    if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('Original native leaf body required')
    const source = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(source, pose)), oc = getOC(),
      analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false))
    expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
    return physicalDirection(shape, pose, kind, localZ, sign)
  })
}

it.each((['gear', 'screw', 'rack'] as const).flatMap(kind => [false, true].flatMap(passive => [-1, 1].map(sign => ({ kind, passive, sign })))))('preserves native $kind winding at the endpoint kernel through twelve sampled $sign*720-degree stations (passive=$passive)', spec => {
  const { session, document, driver } = mechanism(spec.kind), family = spec.kind === 'rack' ? 'rack-pinion' : spec.kind,
    mechanical = document.mates.find(item => item.type === family)!; mechanical.suppressed = spec.passive
  const before = serializeAssemblyDocument(document), occurrence = document.occurrences.find(item => item.id === driver)!,
    originalResolve = AssemblyGeometrySnapshot.prototype.resolveActiveMates, observations = new Map<string, AssemblyDocument>()
  const observe = vi.spyOn(AssemblyGeometrySnapshot.prototype, 'resolveActiveMates').mockImplementation(function (this: AssemblyGeometrySnapshot, input) {
    const value = originalResolve.call(this, input), current = input.occurrences.find(item => item.id === driver)
    if (input.id === document.id && current) observations.set(JSON.stringify(current.pose.rotation), validateAssemblyDocument(input))
    return value
  })
  try {
    const value = ready(session.moveMotion(document, { component: component(document, driver), translation: [...occurrence.pose.translation],
      rotation: { axis: 2, angle: spec.sign * 4 * Math.PI } }))
    expect(value.motion!.verifiedStations).toBe(12); expect(value.motion!.sampledOnly).toBe(true); near(value.motion!.evaluatedAngle, spec.sign * 4 * Math.PI)
    expect(report(value).activity).toBe('both'); near(report(value).angleDegrees, 0, 1e-6)
    expect(value.scopes.flatMap(scope => scope.result.evidence.groups).every(group => group.seededConstraintIds.length === 0)).toBe(true)
    const accepted = value.document.mates.find(item => item.type === family)!
    if (accepted.type === 'gear') { near(accepted.angles.first, -spec.sign * 4 * Math.PI); if (!spec.passive) near(accepted.angles.second, spec.sign * 2 * Math.PI) }
    else if (accepted.type === 'screw' || accepted.type === 'rack-pinion') near(accepted.angle, -spec.sign * 4 * Math.PI)
    else throw new Error('Actual accepted mechanical lift required')
    // Actual snapshot configurations from each station, not reconstructed target
    // poses, select the fresh native eccentric bore used as an angular marker.
    const expectedStations = Array.from({ length: 12 }, (_, index) => spec.sign * 4 * Math.PI * ((index + 1) / 12))
    for (const theta of expectedStations) {
      const expected: Vec3 = [Math.cos(theta), Math.sin(theta), 0], candidates = [...observations.values()].filter(item => {
        const q = item.occurrences.find(value => value.id === driver)!.pose.rotation, actual = rotate(q, [1, 0, 0]); return Math.hypot(...actual.map((v, index) => v - expected[index])) < 1e-8
      })
      expect(candidates.length).toBeGreaterThan(0)
      const observed = candidates.at(-1)!, measuredPose = leaf(observed, [driver]).pose
      withNativeOwners(owners => {
        const { part } = leaf(observed, [driver]), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
        const inventory = engine.rebuildForAssemblyReferences(part.document.features); if (inventory.kind !== 'explicit') throw new Error('Actual marker solid required')
        const shape = owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), measuredPose)), oc = getOC(), markers: Vec3[] = []
        for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) {
          const adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false)); if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) continue
          const cylinder = owners.own(adaptor.Cylinder()); if (Math.abs(cylinder.Radius() - .25) > 1e-9) continue
          const position = owners.own(cylinder.Position()); markers.push(tuple(owners.own(position.Location())))
        }
        expect(markers).toHaveLength(1); near(markers[0][0] - measuredPose.translation[0], expected[0], 1e-6); near(markers[0][1] - measuredPose.translation[1], expected[1], 1e-6)
      })
    }
    const applied = session.apply(document, value.token).document, fresh = ready(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied))))
    expect(fresh.document.mates).toEqual(applied.mates); near(report(fresh).angleDegrees, 0, 1e-6); expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { observe.mockRestore(); session.discard() }
}, 60_000)

it.each((['gear', 'screw', 'rack'] as const).flatMap(kind => [false, true].map(passive => ({ kind, passive }))))('rolls back incompatible angular restoration with active/passive native $kind lifts (passive=$passive)', spec => {
  const { session, document } = mechanism(spec.kind), family = spec.kind === 'rack' ? 'rack-pinion' : spec.kind,
    mechanical = document.mates.find(item => item.type === family)!; mechanical.suppressed = spec.passive
  const proposed = validateAssemblyDocument(document), interval = proposed.mates.find(item => item.type === 'limit-angle') as AngularMate
  interval.limits = { minimum: 30, maximum: 60 }
  const before = serializeAssemblyDocument(document), intent = serializeAssemblyDocument(proposed), captured = structuredClone(mechanical), actual = numerical.solveRigidMates,
    outcomes: ReturnType<typeof actual>[] = [], solver = vi.spyOn(numerical, 'solveRigidMates').mockImplementation((...args) => { const result = actual(...args); outcomes.push(result); return result })
  try { const value = session.prepare(document, proposed); expect(value.status).toBe('rejected'); expect(outcomes.length).toBeGreaterThan(0)
    expect(outcomes.every(result => result.evidence.groups.every(group => group.seededConstraintIds.length === 0))).toBe(true)
    expect(outcomes.filter(result => !result.poses).every(result => result.gearAngles.size === 0 && result.screwAngles.size === 0 && result.rackPinionAngles.size === 0)).toBe(true)
    expect('document' in value || 'token' in value || 'limitAngles' in value).toBe(false); expect(mechanical).toEqual(captured)
    expect(serializeAssemblyDocument(document)).toBe(before); expect(serializeAssemblyDocument(proposed)).toBe(intent)
    const retry = ready(session.prepare(document)); expect(retry.document.mates).toEqual(document.mates); near(report(retry).angleDegrees, 0, 1e-6)
  } finally { solver.mockRestore(); session.discard() }
}, 60_000)

it.each((['gear', 'screw', 'rack'] as const).flatMap(kind => [false, true].map(passive => ({ kind, passive }))))('rolls back all native $kind charts when a +720 endpoint hides an invalid sampled angular station (passive=$passive)', spec => {
  const setup = mechanism(spec.kind), session = setup.session, family = spec.kind === 'rack' ? 'rack-pinion' : spec.kind
  let document = setup.document; document.mates.find(item => item.type === family)!.suppressed = spec.passive
  try {
    const proposed = validateAssemblyDocument(document); proposed.mates.push({ ...relation(0, 150), id: 'transverse-principal-stop',
      first: { kind: 'principal-plane', component: component(document, setup.driver), plane: 'YZ' },
      second: { kind: 'principal-plane', component: null, plane: 'YZ' } })
    const initial = ready(session.prepare(document, proposed)); expect(initial.limitAngles).toHaveLength(2); document = session.apply(document, initial.token).document
    const before = serializeAssemblyDocument(document), captured = structuredClone(document.mates.find(item => item.type === family)),
      driver = document.occurrences.find(item => item.id === setup.driver)!, value = session.moveMotion(document, {
        component: component(document, setup.driver), translation: [...driver.pose.translation], rotation: { axis: 2, angle: 4 * Math.PI } })
    expect(value.status).toBe('rejected'); if (value.status === 'rejected') expect(value.message).toContain('Estación 3/12')
    expect('document' in value || 'token' in value || 'motion' in value || 'limitAngles' in value).toBe(false)
    expect(serializeAssemblyDocument(document)).toBe(before); expect(document.mates.find(item => item.type === family)).toEqual(captured)
    const fresh = ready(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(document))))
    expect(fresh.document.mates).toEqual(document.mates); expect(fresh.limitAngles).toHaveLength(2); fresh.limitAngles!.forEach(item => near(item.angleDegrees, 0, 1e-6))
  } finally { session.discard() }
}, 60_000)

/** Original rigid leaf placements supply actual oblique bearing axes; no new plane primitive. */
function curvedMechanism(antiparallel: boolean) {
  const base = validateAssemblyDocument(original), block = directionOriginal.definitions.find(item => item.id === 'direction-block')!,
    plane = base.definitions.find(item => item.id === 'limit-angle-moving')!
  base.definitions.push(structuredClone(block))
  const child = (id: string, definition: { id: string; revision: string }, rotation: Quaternion): AssemblyOccurrence => ({ id, name: 'Original rigid ' + id,
    definition, pose: { ...identityRigidPose(), rotation }, fixed: true, visible: true, suppressed: false }),
    bearingA: Quaternion = [0, Math.SQRT1_2, 0, Math.SQRT1_2], bearingB: Quaternion = [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)],
    assembly = (id: string, occurrences: AssemblyOccurrence[]): EmbeddedAssemblyDefinition => ({ kind: 'assembly', id, revision: 'r1', name: 'Original rigid ' + id,
      createdAt: base.createdAt, updatedAt: base.updatedAt, mates: [], occurrences }),
    first = assembly('curved-rotor-a', [child('axis', { id: block.id, revision: block.revision }, bearingA), child('normal', { id: plane.id, revision: plane.revision }, [0, 0, 0, 1])]),
    second = assembly('curved-rotor-b', [child('axis', { id: block.id, revision: block.revision }, bearingB), child('normal', { id: plane.id, revision: plane.revision }, [0, 0, 0, 1])]),
    ground = assembly('curved-ground', [child('guide-a', { id: block.id, revision: block.revision }, bearingA), child('guide-b', { id: block.id, revision: block.revision }, bearingB)])
  base.definitions.push(first, second, ground); base.mates = []
  base.occurrences = [first, second, ground].map((definition, index) => ({ id: ['A', 'B', 'G'][index], name: definition.name,
    definition: { id: definition.id, revision: definition.revision }, pose: identityRigidPose(), fixed: index === 2, visible: true, suppressed: false }))
  const scene = buildAssemblyScene(base), select = (path: string[], predicate: (face: AssemblySceneFace) => boolean) => {
    const matches = scene.bodies.filter(body => JSON.stringify(body.component.occurrencePath) === JSON.stringify(path)).flatMap(body => body.faces).filter(predicate)
    expect(matches).toHaveLength(1); return assemblySceneFaceReference(matches[0])!
  }, cylinder = (path: string[]): AssemblyAxisReference => ({ ...select(path, face => face.support?.kind === 'cylinder'), support: 'axis' }),
    top = (path: string[], sign = 1): AssemblyPlaneReference => ({ ...select(path, face => face.support?.kind === 'plane' && sign * face.support.normal[2] > .99
      && Math.abs(face.support.point[2] - (sign > 0 ? path.at(-1) === 'normal' ? 2 : 4 : 0)) < 1e-8), support: 'plane' }),
    a = cylinder(['A', 'axis']), b = cylinder(['B', 'axis'])
  for (const [id, guide] of [['A', 'guide-a'], ['B', 'guide-b']]) base.mates.push(
    { id: id + '-bearing', name: 'Original oblique bearing ' + id, type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null,
      first: cylinder([id, 'axis']), second: cylinder(['G', guide]) },
    { id: id + '-stop', name: 'Original oblique axial stop ' + id, type: 'coincident', suppressed: false, alignment: 'aligned', first: top([id, 'axis']), second: top(['G', guide]) })
  const session = new AssemblyWorkerSession(), initial = ready(session.prepare(base)), captured = ready(session.captureGear(base, initial.token, {
    first: a, second: b, carrier: component(base, 'G'), ratio: { numerator: Math.SQRT2, denominator: 1 }, direction: 'same', name: 'Original second-order opening gear' }))
  const document = session.apply(base, captured.token).document, proposed = validateAssemblyDocument(document)
  proposed.mates.push({ ...relation(antiparallel ? 120 : 30, antiparallel ? 150 : 60), name: 'Original curved endpoint angular restoration',
    first: top(['A', 'normal']), second: top(['B', 'normal'], antiparallel ? -1 : 1) })
  return { session, document, proposed }
}

it.each([false, true])('restores a native curved gear with zero first-order opening at the endpoint (antiparallel=%s)', antiparallel => {
  const { session, document, proposed } = curvedMechanism(antiparallel), before = serializeAssemblyDocument(document), intent = serializeAssemblyDocument(proposed)
  try {
    // The actual cylinder parameter axes are -X and -(X+Z)/sqrt(2).
    const axisA = placedDirection(document, ['A', 'axis'], 'cylinder', 4), axisB = placedDirection(document, ['B', 'axis'], 'cylinder', 4),
      startA = placedDirection(document, ['A', 'normal'], 'plane', 2), startB = placedDirection(document, ['B', 'normal'], 'plane', 2),
      omegaA = axisA.map(value => -value) as Vec3, omegaB = axisB.map(value => -Math.SQRT2 * value) as Vec3,
      firstA = cross(omegaA, startA), firstB = cross(omegaB, startB), secondA = cross(omegaA, firstA), secondB = cross(omegaB, firstB)
    vector(axisA, [-1, 0, 0]); vector(axisB, [-Math.SQRT1_2, 0, -Math.SQRT1_2]); vector(startA, [0, 0, 1]); vector(startB, [0, 0, 1])
    vector(firstA.map((value, index) => value - firstB[index]), [0, 0, 0]); vector(secondA.map((value, index) => value - secondB[index]), [-1, 0, 0])
    if (antiparallel) vector(placedDirection(document, ['B', 'normal'], 'plane', 0, -1), [0, 0, -1])
    // Independent finite feasible reference: at t=pi/2, cos(alpha) lies
    // strictly between 1/2 and sqrt(3/8), so alpha is inside [30,60].
    const cosine = Math.sin(Math.PI / Math.SQRT2) / Math.SQRT2; expect(cosine).toBeGreaterThan(.5); expect(cosine).toBeLessThan(Math.sqrt(3 / 8))
    const value = ready(session.prepare(document, proposed)), actual = report(value), gear = value.document.mates.find(item => item.type === 'gear')!
    if (gear.type !== 'gear') throw new Error('Actual curved gear lift required')
    near(gear.angles.first - gear.angles.second / Math.SQRT2, 0); const t = -gear.angles.first, phi = -gear.angles.second,
      a = placedDirection(value.document, ['A', 'normal'], 'plane', 2), b = placedDirection(value.document, ['B', 'normal'], 'plane', antiparallel ? 0 : 2, antiparallel ? -1 : 1),
      expectedA: Vec3 = [0, -Math.sin(t), Math.cos(t)], expectedB: Vec3 = [(1 - Math.cos(phi)) / 2, -Math.sin(phi) / Math.SQRT2, (1 + Math.cos(phi)) / 2]
    vector(a, expectedA); vector(b, expectedB.map(v => antiparallel ? -v : v))
    // The real eccentric bore is not a root-origin bearing. Its native pivot
    // must stay fixed while the selected normal rotates about that offset axis.
    const pivotA: Vec3 = [0, 0, -2], pivotB: Vec3 = [Math.SQRT2, 0, -Math.SQRT2],
      rotationA: Quaternion = [Math.sin(t / 2), 0, 0, Math.cos(t / 2)],
      rotationB: Quaternion = [Math.sin(phi / 2) / Math.SQRT2, 0, Math.sin(phi / 2) / Math.SQRT2, Math.cos(phi / 2)]
    for (const [id, pivot, rotation] of [['A', pivotA, rotationA], ['B', pivotB, rotationB]] as const) {
      const rotated = rotate(rotation, pivot), expected = pivot.map((value, index) => value - rotated[index])
      vector(value.document.occurrences.find(item => item.id === id)!.pose.translation, expected, 1e-6)
    }
    const angle = Math.atan2(Math.hypot(...cross(a, b)), dot(a, b)); near(actual.angleDegrees * Math.PI / 180, angle)
    expect(angle).toBeGreaterThanOrEqual((antiparallel ? 120 : 30) * Math.PI / 180 - 1e-8)
    expect(angle).toBeLessThanOrEqual((antiparallel ? 150 : 60) * Math.PI / 180 + 1e-8)
    expect(value.scopes.at(-1)!.result.localDOF).toBe(1); expect(value.scopes.at(-1)!.result.rank).toBe(11)
    expect(value.scene.solidCount).toBe(6); expect(value.scene.prototypeCount).toBe(2)
    near(value.scene.volume, 1200 - 16 * Math.PI, 1e-5); near(value.scene.area, 1360 + 24 * Math.PI, 1e-5)
    expect(value.scopes.flatMap(scope => scope.result.evidence.groups).every(group => group.seededConstraintIds.length === 0)).toBe(true)
    const applied = session.apply(document, value.token).document, saved = serializeAssemblyDocument(applied), parsed = parseAssemblyDocument(saved)
    expect(parsed.mates).toEqual(applied.mates)
    const reopened = ready(session.prepare(parsed)), computedMates = structuredClone(reopened.document.mates),
      persistedGear = applied.mates.find(item => item.type === 'gear'), computedGear = computedMates.find(item => item.type === 'gear')
    if (persistedGear?.type !== 'gear' || computedGear?.type !== 'gear') throw new Error('Actual persisted and recomputed gear coordinates required')
    // Parsing preserves exact saved intent. A new solve may remeasure atan2 by
    // an ULP; require the same lifted branch at the existing native tolerance.
    near(computedGear.angles.first, persistedGear.angles.first); near(computedGear.angles.second, persistedGear.angles.second)
    computedGear.angles = { ...persistedGear.angles }
    expect(computedMates).toEqual(applied.mates); expect(serializeAssemblyDocument(parsed)).toBe(saved)
    near(report(reopened).angleDegrees, actual.angleDegrees, 1e-6)
    expect(serializeAssemblyDocument(document)).toBe(before); expect(serializeAssemblyDocument(proposed)).toBe(intent)
  } finally { session.discard() }
}, 60_000)
import { requireResolvedBinaryMate } from './kernel.assembly-binary-fixtures.test-utils'
import { requireBinaryAssemblyMate } from '../model/assemblyBinaryFixtures.test-utils'
