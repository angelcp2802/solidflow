import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, Shape, makeVertex, type AnyShape, type Face } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyMate, type AssemblySphereTangentMate, type AssemblySphereSurfaceReference, type AssemblyPlaneReference,
  type AssemblyCylinderSurfaceReference, type EmbeddedAssemblyDefinition, type AssemblyAxisReference } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { identityRigidPose, type Quaternion } from '../model/rigidPose'
import type { AssemblySphereTangentMateType } from '../model/assemblySphereTangentMates'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot, assemblyEndpointPlacementArithmetic } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneSphereSurfaceReference, assemblySceneCylinderSurfaceReference, assemblySceneFaceReference, assemblySceneEdgeReference,
  type AssemblyPreviewReply, type AssemblyScene, type AssemblySceneFace } from './kernel.assembly-types'
import { applyAssemblySolvePreview, discardAssemblySolvePreview, prepareAssemblySolve, prepareAssemblyTranslationPreview,
  type AssemblySolvePreview } from './kernel.assembly-solve'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners, NativeCleanupError, type NativeOwners, type NativeOwner } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { extractAssemblyFaceSupport } from './kernel.assembly-supports'
import * as numericSolver from '../model/assemblySolver'
import { createAssemblyExample } from '../examples/assembly'
import type { Vec3 } from './kernel.types'

const kinds = ['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const
let originals: Record<AssemblySphereTangentMateType, AssemblyDocument>, scenes: Record<AssemblySphereTangentMateType, AssemblyScene>
let screwOriginal: AssemblyDocument, rackOriginal: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const documents = await Promise.all(kinds.map(async kind => parseAssemblyDocument(await readFile(new URL(`./fixtures/assembly-${kind}-original.json`, import.meta.url), 'utf8'))))
  originals = { 'plane-sphere-tangent': documents[0], 'sphere-sphere-tangent': documents[1], 'cylinder-sphere-tangent': documents[2] }
  scenes = { 'plane-sphere-tangent': buildAssemblyScene(documents[0]), 'sphere-sphere-tangent': buildAssemblyScene(documents[1]), 'cylinder-sphere-tangent': buildAssemblyScene(documents[2]) }
  screwOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-screw-original.json', import.meta.url), 'utf8'))
  rackOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-rack-pinion-original.json', import.meta.url), 'utf8'))
}, 60_000)
const fixture = (kind: AssemblySphereTangentMateType = 'plane-sphere-tangent') => validateAssemblyDocument(originals[kind])
const near = (a: number, b: number, tolerance = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
const tuple = (p: { X(): number; Y(): number; Z(): number }): Vec3 => [p.X(), p.Y(), p.Z()]
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
function rotate(q: Quaternion, p: Vec3): Vec3 {
  const n = Math.hypot(...q), [x, y, z, w] = q.map(value => value / n)
  return [(1 - 2 * (y * y + z * z)) * p[0] + 2 * (x * y - z * w) * p[1] + 2 * (x * z + y * w) * p[2],
    2 * (x * y + z * w) * p[0] + (1 - 2 * (x * x + z * z)) * p[1] + 2 * (y * z - x * w) * p[2],
    2 * (x * z - y * w) * p[0] + 2 * (y * z + x * w) * p[1] + (1 - 2 * (x * x + y * y)) * p[2]]
}
function leaf(document: AssemblyDocument, path: string[]) {
  let node: AssemblyDocument | EmbeddedAssemblyDefinition = document, pose = identityRigidPose()
  for (const [index, id] of path.entries()) {
    const occurrence = node.occurrences.find(value => value.id === id)!, a = pose.rotation, b = occurrence.pose.rotation, translated = rotate(a, occurrence.pose.translation)
    pose = { translation: translated.map((value, i) => value + pose.translation[i]) as Vec3, rotation: [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]] }
    const definition = document.definitions.find(value => value.id === occurrence.definition.id && value.revision === occurrence.definition.revision)!
    if (index === path.length - 1 && definition.kind === 'part') return { pose, part: definition }
    if (definition.kind !== 'assembly') throw new Error('Actual nested spherical part required'); node = definition
  }
  throw new Error('Actual native part path required')
}
function face(scene: AssemblyScene, id: string, predicate: (face: AssemblySceneFace) => boolean): AssemblySceneFace {
  const matches = scene.bodies.filter(body => body.component.occurrencePath.at(-1) === id).flatMap(body => body.faces).filter(predicate)
  expect(matches).toHaveLength(1); return matches[0]
}
function sphere(scene: AssemblyScene, id: string, radius = 3): AssemblySphereSurfaceReference {
  const selected = face(scene, id, value => value.sphereSurface !== undefined && Math.abs(value.sphereSurface.radius - radius) < 1e-10), reference = assemblySceneSphereSurfaceReference(selected)
  if (!reference) throw new Error('Actual native sphere selection required'); return reference
}
function plane(scene: AssemblyScene): AssemblyPlaneReference {
  const reference = assemblySceneFaceReference(face(scene, 'fixed', value => value.support?.kind === 'plane' && value.support.normal[2] > .99 && Math.abs(value.support.point[2] - 4) < 1e-9))
  if (!reference || reference.support !== 'plane') throw new Error('Original outward top plane required'); return { ...reference, support: 'plane' }
}
function cylinder(scene: AssemblyScene, id = 'fixed', radius = 2): AssemblyCylinderSurfaceReference {
  const reference = assemblySceneCylinderSurfaceReference(face(scene, id, value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - radius) < 1e-10))
  if (!reference) throw new Error('Actual native cylindrical surface required'); return reference
}
function relation(kind: AssemblySphereTangentMateType, internal = false, reversed = false, scene = scenes[kind]): AssemblySphereTangentMate {
  const moving = sphere(scene, 'moving'), common = { id: 'sphere-tangent', name: 'Original ' + kind, suppressed: false }
  if (kind === 'plane-sphere-tangent') { const fixed = plane(scene); return { ...common, type: kind, first: reversed ? moving : fixed, second: reversed ? fixed : moving, side: internal ? 'negative' : 'positive' } }
  if (kind === 'sphere-sphere-tangent') { const fixed = sphere(scene, 'fixed', 2); return { ...common, type: kind, first: reversed ? moving : fixed, second: reversed ? fixed : moving,
    branch: internal ? { kind: 'internal', larger: reversed ? 'first' : 'second' } : { kind: 'external' } } }
  const fixed = cylinder(scene)
  return { ...common, type: kind, first: reversed ? moving : fixed, second: reversed ? fixed : moving,
    branch: internal ? { kind: 'internal', larger: reversed ? 'first' : 'second' } : { kind: 'external' } }
}
function savedRelation(document: AssemblyDocument): AssemblySphereTangentMate {
  const value = document.mates.find(mate => kinds.some(kind => kind === mate.type))
  if (!value || value.type !== 'plane-sphere-tangent' && value.type !== 'sphere-sphere-tangent' && value.type !== 'cylinder-sphere-tangent') throw new Error('Actual spherical tangent declaration required')
  return value
}
function nativeReady(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
interface SphereSpec { kind: 'sphere'; radius: number; center?: Vec3; bore?: number; selectedRadius?: number }
interface CylinderSpec { kind: 'cylinder'; radius: number; length: number; center?: Vec3; bore?: number; selectedRadius?: number }
type Spec = SphereSpec | CylinderSpec | { kind: 'box' }
const standard = (kind: AssemblySphereTangentMateType): Record<string, Spec> => ({ fixed: kind === 'plane-sphere-tangent' ? { kind: 'box' } : kind === 'sphere-sphere-tangent' ? { kind: 'sphere', radius: 2 } : { kind: 'cylinder', radius: 2, length: 12 }, moving: { kind: 'sphere', radius: 3 } })
function differential(face: Face, center: Vec3, radius: number, sense: 1 | -1, axis?: Vec3): void {
  withNativeOwners(owners => {
    const oc = getOC(), adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false)), p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
    adaptor.D1(.73, axis ? 4 : .4, p, du, dv)
    const delta = tuple(p).map((value, i) => value - center[i]), radial = axis ? delta.map((value, i) => value - axis[i] * dot(delta, axis)) : delta,
      normal = cross(tuple(du), tuple(dv)), sign = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1
    near(Math.hypot(...radial), radius, 1e-8); expect(Math.hypot(...normal)).toBeGreaterThan(0)
    near(sign * dot(normal, radial) / (Math.hypot(...normal) * radius), sense, 1e-8)
  })
}
/** Fresh placed BReps, independent quaternion expansion, sphere/cap/corner bounds and support equation. */
function physical(document: AssemblyDocument, kind: AssemblySphereTangentMateType, internal = false, specs = standard(kind), prefix: string[] = []): void {
  withNativeOwners(owners => {
    const coordinates: Record<string, { center: Vec3; axis?: Vec3; radius?: number }> = {}
    for (const id of ['fixed', 'moving']) {
      const { pose, part } = leaf(document, [...prefix, id]), spec = specs[id], engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(part.document.features)
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('One original explicit body required')
      const copy = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(copy, pose)), oc = getOC(),
        analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box())
      expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false)
      const min = tuple(owners.own(box.CornerMin())), max = tuple(owners.own(box.CornerMax())), axis = rotate(pose.rotation, [0, 0, 1])
      if (spec.kind === 'box') {
        near(volume.Mass(), 4800, 1e-5); near(area.Mass(), 2960, 1e-5)
        const corners = [-20, 20].flatMap(x => [-15, 15].flatMap(y => [0, 4].map(z => rotate(pose.rotation, [x, y, z]).map((v, i) => v + pose.translation[i]))))
        for (let i = 0; i < 3; i++) { near(min[i], Math.min(...corners.map(p => p[i]))); near(max[i], Math.max(...corners.map(p => p[i]))) }
        const cap = rotate(pose.rotation, [0, 0, 4]).map((value, i) => value + pose.translation[i]) as Vec3
        const matches = owners.ownAll(ownedNativeTopology(shape, 'face')).filter(face => {
          const data = extractAssemblyFaceSupport(face)
          return data.kind === 'plane' && Math.hypot(...data.normal.map((value, i) => value - axis[i])) < 1e-8 && Math.abs(dot(data.point.map((value, i) => value - cap[i]), axis)) < 1e-6
        })
        expect(matches).toHaveLength(1); coordinates[id] = { center: cap, axis }; continue
      }
      const offset = rotate(pose.rotation, spec.center ?? [0, 0, 0]), center = pose.translation.map((value, i) => value + offset[i]) as Vec3,
        radius = spec.radius, bore = spec.bore ?? 0, selected = spec.selectedRadius ?? radius
      near(volume.Mass(), spec.kind === 'sphere' ? 4 * Math.PI * (radius ** 3 - bore ** 3) / 3 : Math.PI * (radius ** 2 - bore ** 2) * spec.length, 1e-5)
      near(area.Mass(), spec.kind === 'sphere' ? 4 * Math.PI * (radius ** 2 + bore ** 2) : 2 * Math.PI * (radius + bore) * spec.length + 2 * Math.PI * (radius ** 2 - bore ** 2), 1e-5)
      for (let i = 0; i < 3; i++) {
        const end = spec.kind === 'cylinder' ? center[i] + spec.length * axis[i] : center[i], extent = spec.kind === 'sphere' ? radius : radius * Math.sqrt(Math.max(0, 1 - axis[i] ** 2))
        near(min[i], Math.min(center[i], end) - extent); near(max[i], Math.max(center[i], end) + extent)
      }
      let found = 0
      for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) withNativeOwners(local => {
        const adaptor = local.own(new oc.BRepAdaptor_Surface(face.wrapped, false))
        if (spec.kind === 'sphere') {
          if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Sphere) return
          const sphere = local.own(adaptor.Sphere()); if (Math.abs(sphere.Radius() - selected) > 1e-9) return
          const actual = tuple(local.own(sphere.Location())); actual.forEach((value, i) => near(value, center[i], 1e-8))
        } else {
          if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) return
          const cylinder = local.own(adaptor.Cylinder()); if (Math.abs(cylinder.Radius() - selected) > 1e-9) return
          const frame = local.own(cylinder.Position()), actualAxis = tuple(local.own(frame.Direction())), point = tuple(local.own(frame.Location()))
          near(Math.hypot(...cross(actualAxis, axis)), 0, 1e-8); near(Math.hypot(...cross(point.map((value, i) => value - center[i]), axis)), 0)
        }
        found++; differential(face, center, selected, bore && selected === bore ? -1 : 1, spec.kind === 'cylinder' ? axis : undefined)
      })
      expect(found).toBe(1); coordinates[id] = { center, radius: selected, ...(spec.kind === 'cylinder' ? { axis } : {}) }
    }
    const first = coordinates.fixed, second = coordinates.moving, delta = second.center.map((value, i) => value - first.center[i])
    if (kind === 'plane-sphere-tangent') near(dot(first.axis!, delta), (internal ? -1 : 1) * second.radius!)
    else {
      const distance = kind === 'sphere-sphere-tangent' ? Math.hypot(...delta) : Math.hypot(...cross(delta, first.axis!)),
        target = internal ? Math.abs(first.radius! - second.radius!) : first.radius! + second.radius!
      near(distance, target)
    }
  })
}

it.each(kinds)('builds the original unmated %s sources with independent exact analytical scene totals and bounds', kind => {
  const scene = scenes[kind]
  expect(scene.solidCount).toBe(2); expect(scene.prototypeCount).toBe(2)
  near(scene.volume, kind === 'plane-sphere-tangent' ? 4800 + 36 * Math.PI : kind === 'sphere-sphere-tangent' ? 140 * Math.PI / 3 : 84 * Math.PI, 1e-5)
  near(scene.area, kind === 'plane-sphere-tangent' ? 2960 + 36 * Math.PI : kind === 'sphere-sphere-tangent' ? 52 * Math.PI : 92 * Math.PI, 1e-5)
  expect(scene.bounds!.min.map(value => Math.round(value))).toEqual(kind === 'plane-sphere-tangent' ? [-20, -15, 0] : kind === 'sphere-sphere-tangent' ? [-2, -3, -3] : [-2, -3, -6])
  expect(scene.bounds!.max.map(value => Math.round(value))).toEqual(kind === 'plane-sphere-tangent' ? [20, 15, 13] : kind === 'sphere-sphere-tangent' ? [10, 3, 3] : [10, 3, 6])
})

it.each(kinds.flatMap(kind => [false, true].flatMap(internal => [false, true].map(reversed => ({ kind, internal, reversed })))))(
  'solves native $kind internal=$internal/reversed=$reversed with one physical rank and fresh oriented support evidence', spec => {
    const base = fixture(spec.kind), source = serializeAssemblyDocument(base); base.mates = [relation(spec.kind, spec.internal, spec.reversed)]
    const value = nativeReady(prepareAssemblySolve(base))
    try {
      expect(value.scopes.at(-1)!.result.rank).toBe(1); expect(value.scopes.at(-1)!.result.localDOF).toBe(5)
      expect(value.checks).toHaveLength(1); expect(value.checks[0].satisfied).toBe(true); expect(value.checks[0].angleResidual).toBe(0)
      expect(value.document.mates).toEqual(base.mates); expect(value.document.definitions).toEqual(base.definitions); expect(value.document.occurrences[0]).toEqual(base.occurrences[0])
      expect(value.sphericalTangencies).toHaveLength(1); expect(value.sphericalTangencies![0]).toMatchObject({ kind: spec.kind, scopePath: [], mateId: 'sphere-tangent', normalRelation: spec.internal ? 'same' : 'opposed', supportOnly: true })
      if (spec.kind === 'plane-sphere-tangent') expect(value.sphericalTangencies![0]).toHaveProperty('sphereRadialMaterialSense', 1)
      else expect(value.sphericalTangencies![0]).toHaveProperty('radialMaterialSense', { first: 1, second: 1 })
      physical(validateAssemblyDocument(value.document), spec.kind, spec.internal)
      expect(serializeAssemblyDocument({ ...base, mates: [] })).toBe(source)
    } finally { discardAssemblySolvePreview(value) }
  }, 60_000)

it.each(kinds)('keeps the full six rigid gauge coordinates for a floating native %s pair', kind => {
  const base = fixture(kind); base.occurrences[0].fixed = false; base.mates = [relation(kind)]
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.rank).toBe(1); expect(value.scopes.at(-1)!.result.localDOF).toBe(11); physical(validateAssemblyDocument(value.document), kind) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('accepts an original exact fixed %s target and rejects its incompatible radial/side declaration', kind => {
  const base = fixture(kind); base.occurrences[1].fixed = true; base.occurrences[1].pose.translation = kind === 'plane-sphere-tangent' ? [0, 0, 7] : [5, 0, 0]; base.mates = [relation(kind)]
  const value = nativeReady(prepareAssemblySolve(base)); discardAssemblySolvePreview(value)
  expect(value.scopes.at(-1)!.result.localDOF).toBe(0)
  base.mates = [relation(kind, true)]; const source = serializeAssemblyDocument(base), rejected = prepareAssemblySolve(base)
  expect(rejected.status).toBe('rejected'); expect('document' in rejected || 'sphericalTangencies' in rejected).toBe(false); expect(serializeAssemblyDocument(base)).toBe(source)
}, 60_000)

it.each(kinds)('uses the actual eccentric sphere centre through noncommuting native %s placement', kind => {
  const base = fixture(kind), part = base.definitions.find(value => value.id === 'sphere-source-r3')!
  if (part.kind !== 'part') throw new Error('Original moving sphere required')
  const sketch = part.document.features[0]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'entities') throw new Error('Original saved sphere profile required')
  sketch.offset = 2; sketch.profile.points = [{ id: 'south', x: 0, y: 1 }, { id: 'north', x: 0, y: 7 }, { id: 'sphere-center', x: 0, y: 4 }]
  const arc = sketch.profile.entities.find(entity => entity.type === 'arc')!; if (arc.type !== 'arc') throw new Error('Original arc required'); arc.center = 'sphere-center'
  base.occurrences[1].pose.rotation = [.5, .5, .5, .5]
  base.mates = [relation(kind, false, false, buildAssemblyScene(base))]
  const value = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(value.document), kind, false, { ...standard(kind), moving: { kind: 'sphere', radius: 3, center: [0, 4, 2] } }) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('uses the actual eccentric cylinder centreline rather than its component origin in a spherical tangent', () => {
  const base = fixture('cylinder-sphere-tangent'), part = base.definitions.find(value => value.id === 'sphere-tangent-cylinder')!
  if (part.kind !== 'part' || part.document.features[0].type !== 'sketch' || part.document.features[0].profile.kind !== 'circle') throw new Error('Original cylindrical profile required')
  part.document.features[0].profile.center = [3, 0]; base.occurrences[0].pose.translation[0] = -3
  base.mates = [relation('cylinder-sphere-tangent', false, false, buildAssemblyScene(base))]
  const value = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(value.document), 'cylinder-sphere-tangent', false, { fixed: { kind: 'cylinder', radius: 2, length: 12, center: [3, 0, 0] }, moving: { kind: 'sphere', radius: 3 } }) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(['plane-sphere-tangent', 'cylinder-sphere-tangent'] as const)('admits complete %s support equality away from selected finite geometry and independently measures positive BRep distance', kind => {
  const base = fixture(kind); base.occurrences[1].fixed = true; base.occurrences[1].pose.translation = kind === 'plane-sphere-tangent' ? [0, 100, 7] : [5, 0, 100]; base.mates = [relation(kind)]
  const value = nativeReady(prepareAssemblySolve(base))
  try {
    physical(validateAssemblyDocument(value.document), kind); expect(value.sphericalTangencies![0].supportOnly).toBe(true)
    withNativeOwners(owners => {
      const shapes = ['fixed', 'moving'].map(id => {
        const { pose, part } = leaf(base, [id]), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
        const inventory = engine.rebuildForAssemblyReferences(part.document.features)
        if (inventory.kind !== 'explicit') throw new Error('Original finite support body required')
        return owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), pose))
      })
      const distance = owners.own(new (getOC().BRepExtrema_DistShapeShape)())
      distance.SetDeflection(1e-6); distance.LoadS1(shapes[0].wrapped); distance.LoadS2(shapes[1].wrapped); distance.Perform()
      expect(distance.IsDone()).toBe(true)
      near(distance.Value(), (kind === 'plane-sphere-tangent' ? Math.hypot(85, 3) : Math.hypot(94, 3)) - 3)
      expect(distance.Value()).toBeGreaterThan(80)
    })
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('keeps the old scene support union strict and creates only detached explicit spherical picker intent', () => {
  const nativePointTolerance = 1e-8, localCenter: Vec3 = [0, 0, 0], worldCenter: Vec3 = [0, 0, 10]
  const base = fixture(), scene = buildAssemblyScene(base), selected = face(scene, 'moving', value => value.sphereSurface !== undefined),
    reference = assemblySceneSphereSurfaceReference(selected)!
  expect(selected.support).toBeNull(); expect(selected.worldSupport).toBeNull()
  expect(selected.sphereSurface).toEqual({ kind: 'sphere-surface', center: selected.sphereSurface!.center, radius: 3, tolerance: selected.sphereSurface!.tolerance })
  expect(selected.sphereSurface!.center).toHaveLength(3); near(Math.hypot(...selected.sphereSurface!.center.map((value, i) => value - localCenter[i])), 0, nativePointTolerance)
  expect(selected.worldSphereSurface!.center).toHaveLength(3); near(Math.hypot(...selected.worldSphereSurface!.center.map((value, i) => value - worldCenter[i])), 0, nativePointTolerance)
  expect('radialMaterialSense' in selected.sphereSurface!).toBe(false)
  expect(assemblySceneFaceReference(selected)).toBeNull(); expect(assemblySceneCylinderSurfaceReference(selected)).toBeNull()
  expect(reference.support).toBe('sphere-surface'); selected.selection.face.key = 'caller-forged'; selected.sphereSurface!.center[0] = 1000; selected.sphereSurface!.radius = 99
  expect(reference.face.key).not.toBe('caller-forged')
  const snapshot = new AssemblyGeometrySnapshot(base)
  try {
    const witness = snapshot.resolveSphereSurfaceReference(base, reference)
    if (witness.kind !== 'sphere-surface') throw new Error('Dedicated native sphere purpose required')
    expect(witness.localSupport.center).toHaveLength(3); near(Math.hypot(...witness.localSupport.center.map((value, i) => value - localCenter[i])), 0, nativePointTolerance)
    expect(witness.localSupport.radius).toBe(3)
    expect(witness.worldSupport.center).toHaveLength(3); near(Math.hypot(...witness.worldSupport.center.map((value, i) => value - worldCenter[i])), 0, nativePointTolerance)
    expect(witness.origin).toBe('native-sphere-surface')
    expect(() => snapshot.resolveReference(base, { ...reference, support: 'axis' })).toThrow()
    expect(() => snapshot.resolveCylinderSurfaceReference(base, { ...reference, support: 'cylinder-surface' })).toThrow()
  } finally { snapshot.dispose() }
}, 60_000)

it('authenticates sphere witness object identity, exact source contents and owning native lifetime', () => {
  const base = fixture(), reference = sphere(scenes['plane-sphere-tangent'], 'moving'), first = new AssemblyGeometrySnapshot(base), second = new AssemblyGeometrySnapshot(base)
  try {
    const witness = first.resolveSphereSurfaceReference(base, reference)
    expect(witness.kind).toBe('sphere-surface'); expect(Object.isFrozen(witness)).toBe(true); expect(first.assertWitness(witness, base)).toBe(witness)
    expect(() => first.assertWitness(structuredClone(witness), base)).toThrow('verificada')
    expect(() => second.assertWitness(witness, base)).toThrow('verificada')
    const changed = fixture(); changed.occurrences[1].pose.translation[2] += 1
    expect(() => first.assertWitness(witness, changed)).toThrow('documento cambió')
    first.dispose(); expect(() => first.assertWitness(witness, base)).toThrow('vigente')
  } finally { second.dispose(); first.dispose() }
}, 60_000)

it.each(['axis-purpose', 'cylinder-purpose', 'wrong-native-kind', 'revision', 'body', 'key', 'path'] as const)('rejects spherical reference %s without candidate or report authority', fault => {
  const base = fixture(), mate = relation('plane-sphere-tangent')
  if (mate.type !== 'plane-sphere-tangent' || mate.second.kind !== 'face' || mate.second.support !== 'sphere-surface') throw new Error('Original sphere endpoint required')
  const endpoint = mate.second
  if (fault === 'axis-purpose') Object.assign(endpoint, { support: 'axis' })
  else if (fault === 'cylinder-purpose') Object.assign(endpoint, { support: 'cylinder-surface' })
  else if (fault === 'wrong-native-kind') { const selected = plane(scenes['plane-sphere-tangent']); if (selected.kind !== 'face') throw new Error('Original plane face required'); endpoint.component = selected.component; endpoint.body = selected.body; endpoint.face = selected.face }
  else if (fault === 'revision') endpoint.component.definition.revision = 'missing'
  else if (fault === 'body') endpoint.body = null
  else if (fault === 'key') endpoint.face.key += '-foreign'
  else endpoint.component.occurrencePath = ['moving', 'fixed']
  base.mates = [mate]; const result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); expect('document' in result || 'sphericalTangencies' in result).toBe(false)
}, 60_000)

it.each(kinds)('keeps hidden %s participation and preserves broken suppressed declarations without active reports', kind => {
  const base = fixture(kind); base.occurrences[1].visible = false; base.mates = [relation(kind)]
  const hidden = nativeReady(prepareAssemblySolve(base)); expect(hidden.sphericalTangencies).toHaveLength(1); discardAssemblySolvePreview(hidden)
  base.occurrences[1].suppressed = true; expect(prepareAssemblySolve(base).status).toBe('rejected'); base.mates[0].suppressed = true
  const inactive = nativeReady(prepareAssemblySolve(base))
  try { expect(inactive.sphericalTangencies).toBeUndefined(); expect(inactive.document.mates).toEqual(base.mates) }
  finally { discardAssemblySolvePreview(inactive) }
  base.mates = []; const deleted = nativeReady(prepareAssemblySolve(base)); expect(deleted.sphericalTangencies).toBeUndefined(); discardAssemblySolvePreview(deleted)
}, 60_000)

it.each(kinds)('keeps %s report data outside Apply authority across Cancel, response mutation, history and fresh reopen', kind => {
  const base = fixture(kind), proposed = fixture(kind); proposed.mates = [relation(kind)]
  const history = new AssemblyDocumentHistory(base), session = new AssemblyWorkerSession()
  try {
    const cancel = ready(session.prepare(base, proposed)); session.discard(cancel.token); expect(() => session.apply(base, cancel.token)).toThrow('disponible'); expect(history.current).toEqual(base)
    const preview = ready(session.prepare(base, proposed)); preview.sphericalTangencies![0].normalRelation = 'same'; preview.sphericalTangencies![0].scopePath.push('forged-scope')
    const report = preview.sphericalTangencies![0]
    if (report.kind === 'plane-sphere-tangent') report.sphereRadialMaterialSense = -1; else report.radialMaterialSense.first = -1
    preview.document.mates[0].name = 'Mutated renderer declaration'
    const applied = session.apply(base, preview.token); history.commitDocument(applied.document); expect(applied.document.mates).toEqual(proposed.mates)
    expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied.document)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(history.current)), fresh = ready(session.prepare(reopened))
    expect(fresh.sphericalTangencies![0]).toMatchObject({ kind, scopePath: [], normalRelation: 'opposed' }); physical(fresh.document, kind)
    expect('sphericalTangencies' in reopened).toBe(false)
  } finally { session.discard() }
}, 60_000)

it('rejects cloned direct native capabilities and changed committed sources instead of trusting a sphere report', () => {
  const base = fixture(); base.mates = [relation('plane-sphere-tangent')]; const history = new AssemblyDocumentHistory(base), preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow('verificada')
    history.commitDocument({ ...base, name: 'Actual changed source' }); expect(() => applyAssemblySolvePreview(history, preview)).toThrow('documento cambió')
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

function solved(kind: AssemblySphereTangentMateType, internal = false): AssemblyDocument {
  const base = fixture(kind); base.mates = [relation(kind, internal)]; const value = nativeReady(prepareAssemblySolve(base))
  try { return validateAssemblyDocument(value.document) } finally { discardAssemblySolvePreview(value) }
}
function sphereRadius(document: import('../model/document').Document, radius: number): void {
  const sketch = document.features[0]
  if (sketch.type !== 'sketch' || sketch.profile.kind !== 'entities') throw new Error('Original sphere sketch required')
  sketch.profile.points.find(point => point.id === 'south')!.y = -radius; sketch.profile.points.find(point => point.id === 'north')!.y = radius
}

it.each(kinds)('requires exact current surface repair after a native %s sphere radius edit and preserves the old revision', kind => {
  const base = solved(kind), part = base.definitions.find(value => value.id === 'sphere-source-r3')!
  if (part.kind !== 'part') throw new Error('Original moving sphere required')
  const replacement = structuredClone(part.document); sphereRadius(replacement, 2.5)
  const review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, replacement, 'r2')
  expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].status).toBe('needs-repair'); expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  const repaired = repairAssemblyEndpoint(review.document, review.endpoints[0].locator, sphere(review.scene, 'moving', 2.5)), session = new AssemblyWorkerSession()
  try {
    const value = ready(session.prepare(base, repaired)); physical(value.document, kind, false, { ...standard(kind), moving: { kind: 'sphere', radius: 2.5 } })
    const applied = session.apply(base, value.token).document
    expect(applied.definitions.find(value => value.id === part.id && value.revision === 'r1')).toEqual(part)
    const reopened = ready(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied)))); physical(reopened.document, kind, false, { ...standard(kind), moving: { kind: 'sphere', radius: 2.5 } })
  } finally { session.discard() }
}, 60_000)

it.each(['sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('rejects saved larger-role reversal/equality for %s and admits only an explicit role edit', kind => {
  const base = solved(kind, true), part = base.definitions.find(value => value.id === 'sphere-source-r3')!
  if (part.kind !== 'part') throw new Error('Original sphere source required')
  const session = new AssemblyWorkerSession(), before = serializeAssemblyDocument(base)
  try {
    for (const radius of [2, 1.5]) {
      const replacement = structuredClone(part.document); sphereRadius(replacement, radius)
      const review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, replacement, 'r2'),
        repaired = repairAssemblyEndpoint(review.document, review.endpoints[0].locator, sphere(review.scene, 'moving', radius))
      const result = session.prepare(base, repaired); expect(result.status).toBe('rejected'); expect('token' in result || 'sphericalTangencies' in result).toBe(false)
      const mate = savedRelation(repaired); if (mate.type === 'plane-sphere-tangent') throw new Error('Internal radial declaration required')
      expect(mate.branch).toEqual({ kind: 'internal', larger: 'second' })
      if (radius < 2) {
        mate.branch = { kind: 'internal', larger: 'first' }
        const explicit = ready(session.prepare(base, repaired)); expect(explicit.sphericalTangencies![0]).toHaveProperty('branch', { kind: 'internal', larger: 'first' })
        physical(explicit.document, kind, true, { ...standard(kind), moving: { kind: 'sphere', radius } })
      }
    }
    expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it.each(kinds)('does not inherit translation-until-contact admission for new %s relations', kind => {
  const base = solved(kind), occurrence = base.occurrences[1], source = serializeAssemblyDocument(base)
  const result = prepareAssemblyTranslationPreview(base, { component: { occurrencePath: ['moving'], definition: occurrence.definition }, translation: [...occurrence.pose.translation] })
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('trayectoria rectilínea')
  expect('translation' in result || 'sphericalTangencies' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(source)
}, 60_000)

it.each(kinds)('verifies common proper rigid placement without constraining the six parent gauge freedoms for %s', kind => {
  const base = solved(kind), group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'group', revision: 'r1', name: 'Original spherical pair', createdAt: base.createdAt, updatedAt: base.updatedAt,
    occurrences: structuredClone(base.occurrences), mates: structuredClone(base.mates) }
  base.definitions.push(group); base.mates = []; base.occurrences = [{ id: 'common', name: 'Original common placement', definition: { id: group.id, revision: group.revision },
    pose: { translation: [40, -30, 20], rotation: [.5, -.5, .5, .5] }, fixed: false, visible: true, suppressed: false }]
  const value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(value.scopes.at(-1)!.result.localDOF).toBe(6); expect(value.sphericalTangencies![0].scopePath).toEqual(['common'])
    physical(validateAssemblyDocument(value.document), kind, false, standard(kind), ['common'])
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('authenticates both reused nested %s expansions and their independent world geometry, including a hidden parent', kind => {
  const base = fixture(kind), group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'reused', revision: 'r1', name: 'Original shared spherical declaration', createdAt: base.createdAt, updatedAt: base.updatedAt,
    occurrences: structuredClone(base.occurrences), mates: [relation(kind)] }
  base.definitions.push(group); base.mates = []; base.occurrences = [
    { id: 'A', name: 'Original Z90 parent', definition: { id: group.id, revision: group.revision }, pose: { translation: [40, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'B', name: 'Original hidden X90 parent', definition: { id: group.id, revision: group.revision }, pose: { translation: [-40, 30, 10], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: false, suppressed: false },
  ]
  const value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(value.scopes[0].result.localDOF).toBe(5); expect(value.scopes.at(-1)!.result.localDOF).toBe(0)
    expect(value.sphericalTangencies?.map(report => report.scopePath)).toEqual([['A'], ['B']])
    const actual = validateAssemblyDocument(value.document); physical(actual, kind, false, standard(kind), ['A']); physical(actual, kind, false, standard(kind), ['B'])
    const scene = buildAssemblyScene(actual); expect(scene.solidCount).toBe(4); expect(scene.prototypeCount).toBe(2); expect(scene.bodies.filter(body => !body.visible)).toHaveLength(2)
    near(scene.volume, 2 * scenes[kind].volume, 1e-5); near(scene.area, 2 * scenes[kind].area, 1e-5); expect(actual.occurrences).toEqual(base.occurrences)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('uses an actual oriented principal plane without calling its normal a material contact guarantee', () => {
  const base = fixture(); base.mates = [{ id: 'principal', name: 'Original principal plane and sphere', type: 'plane-sphere-tangent', suppressed: false,
    first: { kind: 'principal-plane', component: null, plane: 'XY' }, second: sphere(scenes['plane-sphere-tangent'], 'moving'), side: 'positive' }]
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.localDOF).toBe(5); near(value.document.occurrences[1].pose.translation[2], 3); expect(value.sphericalTangencies![0]).toMatchObject({ normalRelation: 'opposed', supportOnly: true }) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('keeps a native same-owner %s relation at rank0 and rejects its impossible side or branch', kind => {
  const base = fixture(kind), first = base.definitions.find(value => value.id === base.occurrences[0].definition.id)!, second = base.definitions.find(value => value.id === 'sphere-source-r3')!
  if (first.kind !== 'part' || second.kind !== 'part') throw new Error('Original same-owner part sources required')
  const added = structuredClone(second.document.features), sketch = added[0], revolve = added[1]
  if (sketch.type !== 'sketch' || revolve.type !== 'revolve') throw new Error('Original saved sphere features required')
  sketch.id = 'same-owner-profile'; revolve.id = 'same-owner-sphere'; revolve.sketchId = sketch.id; revolve.bodyOperation = { mode: 'new', bodyId: 'same-owner-sphere-body' }
  if (kind === 'plane-sphere-tangent') sketch.offset = 7
  else { sketch.plane = 'YZ'; sketch.offset = 5 }
  first.document.features.push(...added); base.occurrences = [base.occurrences[0]]; base.occurrences[0].fixed = false; base.occurrences[0].pose = identityRigidPose()
  if (kind === 'cylinder-sphere-tangent') {
    const cylinderProfile = first.document.features[0]; if (cylinderProfile.type !== 'sketch') throw new Error('Original cylinder profile required'); cylinderProfile.offset = -6
  }
  const scene = buildAssemblyScene(base), moving = sphere(scene, 'fixed', 3), common = { id: 'self', name: 'Original same-owner support pair', suppressed: false }
  base.mates = [kind === 'plane-sphere-tangent' ? { ...common, type: kind, first: plane(scene), second: moving, side: 'positive' }
    : kind === 'sphere-sphere-tangent' ? { ...common, type: kind, first: sphere(scene, 'fixed', 2), second: moving, branch: { kind: 'external' } }
      : { ...common, type: kind, first: cylinder(scene), second: moving, branch: { kind: 'external' } }]
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.rank).toBe(0); expect(value.scopes.at(-1)!.result.localDOF).toBe(6); expect(value.document.occurrences).toEqual(base.occurrences); expect(value.sphericalTangencies).toHaveLength(1) }
  finally { discardAssemblySolvePreview(value) }
  const mate = savedRelation(base); if (mate.type === 'plane-sphere-tangent') mate.side = 'negative'; else mate.branch = { kind: 'internal', larger: 'second' }
  const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('document' in result || 'sphericalTangencies' in result).toBe(false)
}, 60_000)

it.each(kinds)('keeps compatible native %s redundancy at rank1 and rejects conflicting support equations', kind => {
  const base = fixture(kind); base.mates = [relation(kind), { ...relation(kind), id: 'duplicate' }]
  const value = nativeReady(prepareAssemblySolve(base)); expect(value.scopes.at(-1)!.result.rank).toBe(1); expect(value.scopes.at(-1)!.result.localDOF).toBe(5); expect(value.sphericalTangencies).toHaveLength(2); discardAssemblySolvePreview(value)
  const mate = savedRelation(base); if (mate.type === 'plane-sphere-tangent') mate.side = 'negative'; else mate.branch = { kind: 'internal', larger: 'second' }
  const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('document' in result || 'sphericalTangencies' in result).toBe(false)
}, 60_000)

it.each(['sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const)('rejects the native zero-separation %s chart without a nominal direction seed', kind => {
  const base = fixture(kind); base.occurrences[1].pose.translation = [0, 0, 0]; base.mates = [relation(kind)]
  const source = serializeAssemblyDocument(base), result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); expect('document' in result || 'sphericalTangencies' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(source)
}, 60_000)

it('rejects unresolved world centre precision without widening a spherical length tolerance', () => {
  const base = fixture('sphere-sphere-tangent'); base.occurrences[0].pose.translation[0] = 1e13; base.occurrences[1].pose.translation[0] = 1e13 + 7; base.mates = [relation('sphere-sphere-tangent')]
  const source = serializeAssemblyDocument(base), result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('precisionLimit')
  expect('document' in result || 'sphericalTangencies' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(source)
}, 60_000)

it.each(kinds.flatMap(kind => [false, true].map(reversed => ({ kind, reversed }))))('retains original nested placement magnitudes before cancellation and rejects unsafe $kind coordinates (reversed=$reversed)', spec => {
  const base = fixture(spec.kind), direction = spec.kind === 'plane-sphere-tangent' ? 2 : 0, target = spec.kind === 'plane-sphere-tangent' ? 7 : 5,
    chainPose = (value: number) => { const pose = identityRigidPose(); pose.translation[direction] = value; return pose },
    sphereDefinition = { ...base.occurrences[1].definition }, stamps = { createdAt: base.createdAt, updatedAt: base.updatedAt }
  const groups: EmbeddedAssemblyDefinition[] = [
    { kind: 'assembly', id: 'chain0', revision: 'r1', name: 'Original chain root', ...stamps, mates: [], occurrences: [{ id: 'plus', name: 'Large positive original placement', definition: { id: 'chain1', revision: 'r1' }, pose: chainPose(1e16), fixed: true, visible: true, suppressed: false }] },
    { kind: 'assembly', id: 'chain1', revision: 'r1', name: 'Original small term', ...stamps, mates: [], occurrences: [{ id: 'unit', name: 'Original one millimetre term', definition: { id: 'chain2', revision: 'r1' }, pose: chainPose(1), fixed: true, visible: true, suppressed: false }] },
    { kind: 'assembly', id: 'chain2', revision: 'r1', name: 'Original negative term', ...stamps, mates: [], occurrences: [{ id: 'minus', name: 'Large negative original placement', definition: { id: 'chain3', revision: 'r1' }, pose: chainPose(-1e16), fixed: true, visible: true, suppressed: false }] },
    { kind: 'assembly', id: 'chain3', revision: 'r1', name: 'Original small native sphere', ...stamps, mates: [], occurrences: [{ id: 'leaf', name: 'Original R3 sphere at local target', definition: sphereDefinition, pose: chainPose(target), fixed: true, visible: true, suppressed: false }] },
  ]
  base.definitions.push(...groups); base.occurrences = [base.occurrences[0], { id: 'owner', name: 'Original fixed chain owner', definition: { id: 'chain0', revision: 'r1' }, pose: identityRigidPose(), fixed: true, visible: true, suppressed: false }]
  const mate = relation(spec.kind, false, spec.reversed), selected = [mate.first, mate.second].find(endpoint => endpoint.component?.definition.id === 'sphere-source-r3')
  if (!selected || selected.kind !== 'face' || selected.support !== 'sphere-surface') throw new Error('Original moving sphere endpoint required')
  selected.component.occurrencePath = ['owner', 'plus', 'unit', 'minus', 'leaf']; base.mates = [mate]
  const before = serializeAssemblyDocument(base), snapshot = new AssemblyGeometrySnapshot(base)
  try {
    const witness = snapshot.resolveSphereSurfaceReference(base, selected), arithmetic = assemblyEndpointPlacementArithmetic(witness, base)
    // Float64 composed placement loses the declared +1 term. The original
    // small BRep is ordinary; private proof must retain the large chain inputs.
    expect(witness.declaredWorldPose.translation[direction]).toBe(target); expect(target + 1 - witness.declaredWorldPose.translation[direction]).toBe(1)
    expect(arithmetic.placementSum).toBeGreaterThan(1e16); expect(arithmetic.depth).toBe(5)
    expect(() => assemblyEndpointPlacementArithmetic(structuredClone(witness), base)).toThrow('evidencia')
  } finally { snapshot.dispose() }
  const result = prepareAssemblySolve(base)
  // A child scope's pre-existing magnitude policy may reject before the new
  // family guard. Both paths must withhold authority; this is not a prior PASS claim.
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('precisionLimit')
  expect('document' in result || 'sphericalTangencies' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

function boreFixture(kind: 'sphere-sphere-tangent' | 'cylinder-sphere-tangent') {
  const base = fixture(kind), fixed = base.definitions.find(value => value.id === base.occurrences[0].definition.id)!, moving = base.definitions.find(value => value.id === 'sphere-source-r3')!
  if (fixed.kind !== 'part' || moving.kind !== 'part') throw new Error('Original bore sources required')
  sphereRadius(moving.document, 2)
  if (kind === 'sphere-sphere-tangent') {
    sphereRadius(fixed.document, 7)
    const inner = structuredClone(fixed.document); sphereRadius(inner, 5)
    const sketch = inner.features[0], solid = inner.features[1]
    if (sketch.type !== 'sketch' || solid.type !== 'revolve') throw new Error('Original spherical shell features required')
    sketch.id = 'inner-profile'; solid.id = 'inner-solid'; solid.sketchId = sketch.id; solid.bodyOperation = { mode: 'new', bodyId: 'inner-body' }
    fixed.document.features.push(sketch, solid, { id: 'hollow-solid', name: 'Original spherical cavity', type: 'combine', suppressed: false, operation: 'subtract',
      target: { bodyId: 'sphere-body', sourceFeatureId: 'sphere-revolve' }, tools: [{ bodyId: 'inner-body', sourceFeatureId: 'inner-solid' }], keepTools: false })
  } else {
    const sketch = fixed.document.features[0]
    if (sketch.type !== 'sketch' || sketch.profile.kind !== 'circle') throw new Error('Original cylinder profile required')
    sketch.profile.radius = 7
    fixed.document.features.push({ id: 'bore-profile', name: 'Original R5 through bore', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 5 } },
      { id: 'bore', name: 'Original through bore', type: 'cut', sketchId: 'bore-profile', depth: 12, symmetric: false, suppressed: false,
        bodyScope: [{ bodyId: 'sphere-cylinder-body', sourceFeatureId: 'cylinder-solid' }] })
  }
  base.occurrences[1].pose.translation = [3, 0, 0]; base.occurrences[1].fixed = true
  const scene = buildAssemblyScene(base), first = kind === 'sphere-sphere-tangent' ? sphere(scene, 'fixed', 5) : cylinder(scene, 'fixed', 5)
  if (kind === 'sphere-sphere-tangent') {
    if (first.support !== 'sphere-surface') throw new Error('Actual inner spherical purpose required')
    base.mates = [{ id: 'bore', name: 'Original spherical cavity tangent', type: kind, suppressed: false, first, second: sphere(scene, 'moving', 2), branch: { kind: 'internal', larger: 'first' } }]
  } else base.mates = [{ id: 'bore', name: 'Original cylindrical bore and sphere', type: kind, suppressed: false, first, second: sphere(scene, 'moving', 2), branch: { kind: 'internal', larger: 'first' } }]
  return { base, specs: { fixed: kind === 'sphere-sphere-tangent' ? { kind: 'sphere' as const, radius: 7, bore: 5, selectedRadius: 5 } : { kind: 'cylinder' as const, radius: 7, bore: 5, selectedRadius: 5, length: 12 }, moving: { kind: 'sphere' as const, radius: 2 } } }
}

it.each((['sphere-sphere-tangent', 'cylinder-sphere-tangent'] as const).flatMap(kind => [false, true].map(reversed => ({ kind, reversed }))))('attests fresh inner spherical/cylindrical normals and ordered internal $kind support (reversed=$reversed)', spec => {
  const { base, specs } = boreFixture(spec.kind), mate = savedRelation(base)
  if (mate.type === 'plane-sphere-tangent') throw new Error('Original internal radial relation required')
  if (spec.reversed) { const first = mate.first; Object.assign(mate, { first: mate.second, second: first, branch: { kind: 'internal', larger: 'second' } }) }
  const value = nativeReady(prepareAssemblySolve(base))
  try {
    physical(validateAssemblyDocument(value.document), spec.kind, true, specs)
    expect(value.sphericalTangencies![0]).toMatchObject({ radialMaterialSense: spec.reversed ? { first: 1, second: -1 } : { first: -1, second: 1 }, normalRelation: 'opposed', supportOnly: true })
    const scene = buildAssemblyScene(validateAssemblyDocument(value.document)); near(scene.volume, spec.kind === 'sphere-sphere-tangent' ? 904 * Math.PI / 3 : 896 * Math.PI / 3, 1e-5); near(scene.area, spec.kind === 'sphere-sphere-tangent' ? 312 * Math.PI : 352 * Math.PI, 1e-5)
    const interference = analyzeAssemblyInterference(base, { clearance: 0 }); expect(interference.pairs).toHaveLength(1); near(interference.pairs[0].intersectionVolume, 0, 1e-9)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('accepts the larger-sphere internal cylinder branch while independently reporting material overlap and additional surface crossings', () => {
  const base = fixture('cylinder-sphere-tangent'); base.occurrences[1].fixed = true; base.occurrences[1].pose.translation = [1, 0, 0]; base.mates = [relation('cylinder-sphere-tangent', true)]
  const value = nativeReady(prepareAssemblySolve(base))
  try {
    physical(validateAssemblyDocument(value.document), 'cylinder-sphere-tangent', true)
    expect(value.sphericalTangencies![0]).toMatchObject({ branch: { kind: 'internal', larger: 'second' }, normalRelation: 'same', supportOnly: true })
    const report = analyzeAssemblyInterference(base, { clearance: 0 }); expect(report.pairs).toHaveLength(1); expect(report.pairs[0].intersectionVolume).toBeGreaterThan(0)
    withNativeOwners(owners => {
      for (const id of ['fixed', 'moving']) {
        const { pose, part } = leaf(base, [id]), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
        const inventory = engine.rebuildForAssemblyReferences(part.document.features)
        if (inventory.kind !== 'explicit') throw new Error('Original crossing body required')
        const copy = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(copy, pose)), oc = getOC()
        const selected = owners.ownAll(ownedNativeTopology(shape, 'face')).filter(face => withNativeOwners(local => {
          const adaptor = local.own(new oc.BRepAdaptor_Surface(face.wrapped, false))
          return adaptor.GetType() === (id === 'fixed' ? oc.GeomAbs_SurfaceType.GeomAbs_Cylinder : oc.GeomAbs_SurfaceType.GeomAbs_Sphere)
        }))
        expect(selected).toHaveLength(1)
        for (const z of [-2 * Math.SQRT2, 2 * Math.SQRT2]) {
          const point = owners.own(makeVertex([2, 0, z])), distance = owners.own(new oc.BRepExtrema_DistShapeShape())
          distance.SetDeflection(1e-8); distance.LoadS1(point.wrapped); distance.LoadS2(selected[0].wrapped); distance.Perform()
          expect(distance.IsDone()).toBe(true); near(distance.Value(), 0, 1e-8)
        }
      }
    })
    expect(Math.hypot(0 - 1, 0, 5)).toBeGreaterThan(3)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

const extractionContext = 'Assembly sphere surface extraction or release failed.'
function observeExtraction<T>(patch: (owner: NativeOwner, query: number, index: number) => void, operation: () => T): T {
  const actual = ownership.withNativeOwners; let query = 0
  const implementation: typeof actual = <R>(work: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => actual(owners => {
    if (context === extractionContext) {
      const current = query++, own = owners.own.bind(owners); let index = 0
      owners.own = <V extends NativeOwner>(value: V): V => { patch(value, current, index++); return own(value) }
    }
    return work(owners)
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { return operation() } finally { spy.mockRestore() }
}
const errorTree = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(errorTree) : [])]

it('freshly observes both exact native sphere surfaces after actual numerical solving before emitting their pair report', () => {
  const base = fixture('sphere-sphere-tangent'); base.mates = [relation('sphere-sphere-tangent')]
  let solved = false; const after: number[] = [], actualSolve = numericSolver.solveRigidMates, actualQuery = CadEngine.prototype.inspectCurrentSphereSurfaceSupport
  const solver = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentSphereSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) { const result = actualQuery.apply(this, args); if (solved) after.push(result.radius); return result })
  try { const value = nativeReady(prepareAssemblySolve(base)); expect(after).toEqual([2, 3]); expect(value.sphericalTangencies).toHaveLength(1); discardAssemblySolvePreview(value) }
  finally { query.mockRestore(); solver.mockRestore() }
}, 60_000)

it.each([0, 1])('withholds the paired spherical report when final fresh endpoint%i query fails after its real native observation', endpoint => {
  const base = fixture('sphere-sphere-tangent'); base.mates = [relation('sphere-sphere-tangent')]; const before = serializeAssemblyDocument(base)
  let solved = false, finalQueries = 0; const actualSolve = numericSolver.solveRigidMates, actualQuery = CadEngine.prototype.inspectCurrentSphereSurfaceSupport
  const solver = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentSphereSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = actualQuery.apply(this, args); if (solved && finalQueries++ === endpoint) throw new Error('Original final spherical endpoint failure'); return result
  })
  try {
    const result = prepareAssemblySolve(base); expect(finalQueries).toBe(endpoint + 1); expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.reason).toBe('verification')
    expect('sphericalTangencies' in result || 'document' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { query.mockRestore(); solver.mockRestore() }
}, 60_000)

it.each([0, 1].flatMap(endpoint => [0, 1, 2, 3, 4, 5, 6].map(owner => ({ endpoint, owner }))))('retires both native spherical lifetimes and withholds authority when endpoint$endpoint owner$owner release fails', spec => {
  const base = fixture('sphere-sphere-tangent'); base.mates = [relation('sphere-sphere-tangent')]; const released: number[] = [], failure = new Error('Original paired sphere release fault')
  const result = observeExtraction((owner, query, index) => {
    if (query !== spec.endpoint) return
    const remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(index); remove(); if (index === spec.owner) throw failure } })
  }, () => prepareAssemblySolve(base))
  expect(result.status).toBe('rejected'); expect('document' in result || 'sphericalTangencies' in result).toBe(false); expect(released).toEqual([6, 5, 4, 3, 2, 1, 0])
}, 60_000)

it('preserves primary and cleanup failures on the second spherical observation without reporting the first alone', () => {
  const base = fixture('sphere-sphere-tangent'); base.mates = [relation('sphere-sphere-tangent')]
  const primary = new Error('Original second sphere Y query failure'), cleanup = new Error('Original second sphere Y cleanup failure'), actualQuery = CadEngine.prototype.inspectCurrentSphereSurfaceSupport
  let failure: unknown, releases = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentSphereSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    try { return actualQuery.apply(this, args) } catch (error) { failure = error; throw error }
  })
  try {
    const result = observeExtraction((owner, endpoint, index) => {
      if (endpoint !== 1 || index !== 6) return
      const point = owner as NativeOwner & { X(): number }, read = point.X.bind(point), remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'X', { configurable: true, value: () => { read(); throw primary } })
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
    }, () => prepareAssemblySolve(base))
    expect(result.status).toBe('rejected'); expect(failure).toBeInstanceOf(NativeCleanupError); expect(errorTree(failure)).toContain(primary); expect(errorTree(failure)).toContain(cleanup); expect(releases).toBe(1); expect('sphericalTangencies' in result).toBe(false)
  } finally { query.mockRestore() }
}, 60_000)

it('rejects a late second-sphere epoch replacement after actual native Y release and permits a separate current rebuild', () => {
  const base = fixture('sphere-sphere-tangent'); base.mates = [relation('sphere-sphere-tangent')]; const part = base.definitions.find(value => value.id === 'sphere-source-r3')!
  if (part.kind !== 'part') throw new Error('Original moving sphere required')
  const actualQuery = CadEngine.prototype.inspectCurrentSphereSurfaceSupport; let engine: CadEngine | undefined, calls = 0, entered = false
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentSphereSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) { if (calls++ === 1) engine = this; return actualQuery.apply(this, args) })
  try {
    const result = observeExtraction((owner, endpoint, index) => {
      if (endpoint !== 1 || index !== 6) return
      const remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { remove(); if (!entered) { entered = true; engine!.rebuildForAssemblyReferences(part.document.features) } } })
    }, () => prepareAssemblySolve(base))
    expect(entered).toBe(true); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('geometría cambió'); expect('sphericalTangencies' in result).toBe(false)
  } finally { query.mockRestore() }
  const fresh = nativeReady(prepareAssemblySolve(base)); expect(fresh.sphericalTangencies).toHaveLength(1); discardAssemblySolvePreview(fresh)
}, 60_000)

it.each(['prepare', 'apply'].flatMap(stage => ['mesh', 'cleanup'].map(fault => ({ stage, fault }))))('withholds session response and retires authority on $stage final scene $fault failure', spec => {
  const base = fixture(), proposed = fixture(); proposed.mates = [relation('plane-sphere-tangent')]
  const session = new AssemblyWorkerSession(), previous = ready(session.prepare(base, spec.stage === 'apply' ? proposed : base)), source = serializeAssemblyDocument(base), failure = new Error('Original spherical final scene fault')
  let reached = false, releases = 0; const actualMesh = Shape.prototype.mesh, arena = ownership.withNativeOwners
  const implementation: typeof arena = <T>(operation: (owners: NativeOwners) => T, retained: (result: T) => readonly NativeOwner[] = () => [], context?: string): T => arena(owners => {
    if (spec.fault === 'cleanup' && context === 'Assembly scene placement, mesh or release failed.') {
      const own = owners.own.bind(owners)
      owners.own = <V extends NativeOwner>(value: V): V => {
        if (!reached && 'wrapped' in value && 'asShape3D' in value) {
          reached = true; const remove = value.delete.bind(value)
          Object.defineProperty(value, 'delete', { configurable: true, value: () => { releases++; remove(); throw failure } })
        }
        return own(value)
      }
    }
    return operation(owners)
  }, retained, context)
  const mesh = vi.spyOn(Shape.prototype, 'mesh').mockImplementation(function (this: AnyShape, ...args) { const result = actualMesh.apply(this, args); if (spec.fault === 'mesh') { reached = true; throw failure } return result })
  const owners = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try {
    expect(() => spec.stage === 'apply' ? session.apply(base, previous.token) : session.prepare(base, proposed)).toThrow()
    expect(reached).toBe(true); expect(releases).toBe(spec.fault === 'cleanup' ? 1 : 0); expect(() => session.apply(base, previous.token)).toThrow('disponible'); expect(serializeAssemblyDocument(base)).toBe(source)
  } finally { owners.mockRestore(); mesh.mockRestore(); session.discard() }
  const fresh = ready(session.prepare(base, proposed)); expect(fresh.sphericalTangencies).toHaveLength(1); session.discard()
}, 60_000)

function axis(scene: AssemblyScene, id: string, radius: number, x?: number): AssemblyAxisReference {
  const selected = face(scene, id, value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - radius) < 1e-9 && (x === undefined || Math.abs(value.support.point[0] - x) < 1e-9)),
    reference = assemblySceneFaceReference(selected)
  if (!reference || reference.support !== 'axis') throw new Error('Actual original mechanical cylinder axis required'); return { ...reference, support: 'axis' }
}
function cap(scene: AssemblyScene, id: string, z: number): AssemblyPlaneReference {
  const selected = face(scene, id, value => value.support?.kind === 'plane' && value.support.normal[2] > .99 && Math.abs(value.support.point[2] - z) < 1e-9), reference = assemblySceneFaceReference(selected)
  if (!reference || reference.support !== 'plane') throw new Error('Actual original mechanical cap required'); return { ...reference, support: 'plane' }
}
function component(document: AssemblyDocument, id: string) { return { occurrencePath: [id], definition: { ...document.occurrences.find(value => value.id === id)!.definition } } }
type Mechanism = 'gear' | 'screw' | 'rack'
function mechanism(kind: Mechanism) {
  const base = kind === 'gear' ? createAssemblyExample() : validateAssemblyDocument(kind === 'screw' ? screwOriginal : rackOriginal), driver = kind === 'gear' ? 'left' : kind === 'screw' ? 'shaft' : 'pinion'
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) base.occurrences.find(value => value.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = buildAssemblyScene(base)
  const bearings: AssemblyMate[] = []
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) bearings.push(
    { id: id + '-axis', name: 'Original pin bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(scene, id, 2), second: axis(scene, 'plate', 3, x) },
    { id: id + '-cap', name: 'Original axial cap', type: 'coincident', suppressed: false, alignment: 'aligned', first: cap(scene, id, 12), second: cap(scene, 'plate', 4) })
  else bearings.push(
    { id: 'bearing', name: 'Original motor bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(scene, driver, 2), second: axis(scene, 'ground', 3) },
    { id: 'axial', name: 'Original axial datum', type: 'distance', suppressed: false, alignment: 'aligned', distance: 18, first: cap(scene, driver, 30), second: cap(scene, 'ground', 4) },
    { id: 'guide', name: 'Original nonrotating follower guide', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: [0, 0, 0, 1],
      first: axis(scene, kind === 'screw' ? 'nut' : 'rack', 2.5), second: axis(scene, kind === 'screw' ? 'ground' : 'guide', kind === 'screw' ? 3 : 2) })
  base.mates = bearings
  const added = structuredClone(originals['plane-sphere-tangent'].definitions.find(value => value.id === 'sphere-source-r3')!)
  if (added.kind !== 'part') throw new Error('Original R3 sphere source required')
  added.id = 'spherical-adjacent'; added.document.id = added.id; base.definitions.push(added)
  base.occurrences.push({ id: 'adjacent', name: 'Original fixed adjacent R3 sphere', definition: { id: added.id, revision: added.revision },
    pose: { ...identityRigidPose(), translation: [kind === 'gear' ? -5 : 5, 0, 0] }, fixed: true, visible: true, suppressed: false })
  const session = new AssemblyWorkerSession(), initial = ready(session.prepare(base))
  const capture = kind === 'gear' ? session.captureGear(base, initial.token, { first: axis(initial.scene, 'left', 2), second: axis(initial.scene, 'right', 2), carrier: component(base, 'plate'), ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original gear and spherical support' })
    : kind === 'screw' ? session.captureScrew(base, initial.token, { first: axis(initial.scene, 'shaft', 2), second: axis(initial.scene, 'nut', 2.5), lead: 2, reverse: false, alignment: 'aligned', name: 'Original screw and spherical support' })
      : session.captureRackPinion(base, initial.token, { first: axis(initial.scene, 'pinion', 2), second: (() => {
        const edges = initial.scene.bodies.find(body => body.component.occurrencePath[0] === 'rack')!.edges!, edge = edges.find(edge => edge.support?.kind === 'line' && edge.support.axis[2] > .99 && Math.abs(Math.abs(edge.support.point[0]) - 5) < 1e-9 && Math.abs(Math.abs(edge.support.point[1]) - 5) < 1e-9)
        if (!edge) throw new Error('Actual original rack LINE required'); return assemblySceneEdgeReference(edge)!
      })(), conversion: { mode: 'diameter', override: null }, reverse: false, name: 'Original rack and spherical support' })
  let document = session.apply(base, ready(capture).token).document
  const current = buildAssemblyScene(document), proposed = validateAssemblyDocument(document)
  proposed.mates.push({ id: 'sphere-mechanical', name: 'Original compatible cylindrical/spherical support', type: 'cylinder-sphere-tangent', suppressed: false,
    branch: { kind: 'external' }, first: cylinder(current, driver, 2), second: sphere(current, 'adjacent') })
  const supported = ready(session.prepare(document, proposed)); expect(supported.scopes.at(-1)!.result.localDOF).toBe(1)
  document = session.apply(document, supported.token).document
  return { session, document, driver }
}

it.each(['gear', 'screw', 'rack'] as const)('preserves actual native %s winding through +720 with a compatible spherical support, Apply and fresh reopen', kind => {
  const { session, document, driver } = mechanism(kind), original = serializeAssemblyDocument(document), occurrence = document.occurrences.find(value => value.id === driver)!
  try {
    const value = ready(session.moveMotion(document, { component: component(document, driver), translation: [...occurrence.pose.translation], rotation: { axis: 2, angle: 4 * Math.PI } }))
    expect(value.motion!.verifiedStations).toBe(12); expect(value.motion!.sampledOnly).toBe(true); near(value.motion!.evaluatedAngle, 4 * Math.PI, 1e-8)
    expect(value.sphericalTangencies).toEqual([{ kind: 'cylinder-sphere-tangent', scopePath: [], mateId: 'sphere-mechanical', branch: { kind: 'external' }, radialMaterialSense: { first: 1, second: 1 }, normalRelation: 'opposed', supportOnly: true }])
    expect(value.checks).toHaveLength(kind === 'gear' ? 6 : 5); expect(value.checks.every(check => check.satisfied)).toBe(true)
    expect(value.scopes.every(scope => scope.result.evidence.groups.every(group => group.seededConstraintIds.length === 0))).toBe(true)
    const winding = value.document.mates.find(mate => mate.type === (kind === 'rack' ? 'rack-pinion' : kind))!
    if (winding.type === 'gear') { near(winding.angles.first, -4 * Math.PI, 1e-8); near(winding.angles.second, 2 * Math.PI, 1e-8) }
    else if (winding.type === 'screw' || winding.type === 'rack-pinion') near(winding.angle, -4 * Math.PI, 1e-8)
    else throw new Error('Actual persisted mechanical winding required')
    if (kind === 'screw') near(value.document.occurrences.find(item => item.id === 'nut')!.pose.translation[2], 14)
    if (kind === 'rack') near(value.document.occurrences.find(item => item.id === 'rack')!.pose.translation[0], -10 - 8 * Math.PI)
    const marker = face(value.scene, driver, selected => selected.worldSupport?.kind === 'cylinder' && Math.abs(selected.worldSupport.radius - .25) < 1e-9).worldSupport
    if (marker?.kind !== 'cylinder') throw new Error('Actual independently rebuilt bore marker required')
    near(marker.point[0], kind === 'gear' ? -9 : 1); near(marker.point[1], 0)
    const spherical = face(value.scene, 'adjacent', selected => selected.sphereSurface?.radius === 3)
    expect(spherical.support).toBeNull(); expect(spherical.worldSphereSurface!.center).toEqual([kind === 'gear' ? -5 : 5, 0, 0])
    expect(value.scene.solidCount).toBe(kind === 'rack' ? 5 : 4); expect(value.scene.prototypeCount).toBe(kind === 'gear' ? 3 : kind === 'screw' ? 4 : 5)
    near(value.scene.volume, kind === 'gear' ? 4800 + 117 * Math.PI / 2 : kind === 'screw' ? 5400 + 645 * Math.PI / 8 : 10800 + 505 * Math.PI / 8, 1e-5)
    near(value.scene.area, kind === 'gear' ? 2960 + 687 * Math.PI / 4 : kind === 'screw' ? 3400 + 1619 * Math.PI / 8 : 5560 + 6403 * Math.PI / 8, 1e-5)
    const applied = session.apply(document, value.token).document, reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    expect(fresh.scopes.at(-1)!.result.localDOF).toBe(1); expect(fresh.sphericalTangencies).toEqual(value.sphericalTangencies); expect(fresh.document.mates).toEqual(applied.mates)
    expect(fresh.checks.every(check => check.satisfied)).toBe(true); session.apply(reopened, fresh.token)
    expect(serializeAssemblyDocument(document)).toBe(original)
  } finally { session.discard() }
}, 60_000)

it.each((['gear', 'screw', 'rack'] as const).flatMap(kind => [false, true].map(passive => ({ kind, passive }))))('rejects a singular native spherical chart without reseeding or changing $kind angular state (passive=$passive)', spec => {
  const { session, document, driver } = mechanism(spec.kind)
  try {
    const original = document.mates.find(mate => mate.type === (spec.kind === 'rack' ? 'rack-pinion' : spec.kind))!
    original.suppressed = spec.passive
    const proposed = validateAssemblyDocument(document), source = serializeAssemblyDocument(document), before = structuredClone(original)
    proposed.occurrences.find(value => value.id === 'adjacent')!.pose.translation = [driver === 'left' ? -10 : 0, 0, 0]
    const intent = serializeAssemblyDocument(proposed), actual = numericSolver.solveRigidMates; let calls = 0
    const solver = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { calls++; return actual(problem, options) })
    try {
      const result = session.prepare(document, proposed); expect(calls).toBeGreaterThan(0); expect(result.status).toBe('rejected')
      expect('token' in result || 'sphericalTangencies' in result).toBe(false); expect(original).toEqual(before)
      expect(serializeAssemblyDocument(document)).toBe(source); expect(serializeAssemblyDocument(proposed)).toBe(intent)
    } finally { solver.mockRestore() }
  } finally { session.discard() }
}, 60_000)

it('keeps only sampled angular evidence and the last fresh spherical report for a regular free sphere spin', () => {
  const base = solved('plane-sphere-tangent'), session = new AssemblyWorkerSession(), moving = base.occurrences[1]
  try {
    const value = ready(session.moveMotion(base, { component: component(base, 'moving'), translation: [...moving.pose.translation], rotation: { axis: 2, angle: 2 * Math.PI / 3 } }))
    expect(value.motion!.sampledOnly).toBe(true); expect(value.motion!.verifiedStations).toBe(2); near(value.motion!.evaluatedAngle, 2 * Math.PI / 3, 1e-8)
    expect(value.sphericalTangencies).toHaveLength(1); physical(value.document, 'plane-sphere-tangent'); expect(value.document.mates).toEqual(base.mates)
  } finally { session.discard() }
}, 60_000)
