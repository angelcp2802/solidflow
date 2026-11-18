import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, Shape, type AnyShape, type Face } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyMate, type AssemblyCylinderSurfaceReference, type EmbeddedAssemblyDefinition, type AssemblyAxisReference } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { identityRigidPose, type Quaternion } from '../model/rigidPose'
import type { AssemblyCylinderTangentBranch, AssemblyCylinderTangentMateType } from '../model/assemblyCylinderTangentMates'
import { createAssemblyExample } from '../examples/assembly'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneCylinderSurfaceReference, assemblySceneFaceReference, assemblySceneEdgeReference, type AssemblyPreviewReply, type AssemblyScene, type AssemblySceneFace } from './kernel.assembly-types'
import { applyAssemblySolvePreview, discardAssemblySolvePreview, prepareAssemblySolve, prepareAssemblyTranslationPreview, type AssemblySolvePreview } from './kernel.assembly-solve'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners, NativeCleanupError, type NativeOwners, type NativeOwner } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { extractAssemblyFaceSupport } from './kernel.assembly-supports'
import * as numericSolver from '../model/assemblySolver'
import type { Vec3 } from './kernel.types'

type CylinderMate = Extract<AssemblyMate, { type: 'skew-cylinder-tangent' | 'parallel-cylinder-tangent' }>
const kinds = ['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const
let originals: Record<AssemblyCylinderTangentMateType, AssemblyDocument>, scenes: Record<AssemblyCylinderTangentMateType, AssemblyScene>
let screwOriginal: AssemblyDocument, rackOriginal: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  const skew = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-cylinder-tangent-skew-original.json', import.meta.url), 'utf8')),
    parallel = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-cylinder-tangent-parallel-original.json', import.meta.url), 'utf8'))
  originals = { 'skew-cylinder-tangent': skew, 'parallel-cylinder-tangent': parallel }
  scenes = { 'skew-cylinder-tangent': buildAssemblyScene(skew), 'parallel-cylinder-tangent': buildAssemblyScene(parallel) }
  screwOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-screw-original.json', import.meta.url), 'utf8'))
  rackOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-rack-pinion-original.json', import.meta.url), 'utf8'))
}, 60_000)
const fixture = (kind: AssemblyCylinderTangentMateType = 'skew-cylinder-tangent') => validateAssemblyDocument(originals[kind])
const near = (a: number, b: number, tolerance = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
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
    const occurrence = node.occurrences.find(value => value.id === id)!, a = pose.rotation, b = occurrence.pose.rotation,
      translated = rotate(a, occurrence.pose.translation)
    pose = { translation: translated.map((value, i) => value + pose.translation[i]) as Vec3, rotation: [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]] }
    const definition = document.definitions.find(value => value.id === occurrence.definition.id && value.revision === occurrence.definition.revision)!
    if (index === path.length - 1 && definition.kind === 'part') return { pose, part: definition }
    if (definition.kind !== 'assembly') throw new Error('Actual nested part path required'); node = definition
  }
  throw new Error('Actual native leaf required')
}
function surface(scene: AssemblyScene, id: string, radius: number): AssemblyCylinderSurfaceReference {
  const faces = scene.bodies.filter(body => body.component.occurrencePath.at(-1) === id).flatMap(body => body.faces)
    .filter(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - radius) < 1e-9)
  expect(faces).toHaveLength(1); const ref = assemblySceneCylinderSurfaceReference(faces[0])
  if (!ref) throw new Error('Actual native cylinder surface required'); return ref
}
function relation(kind: AssemblyCylinderTangentMateType, internal = false, reversed = false, scene = scenes[kind], radii: [number, number] = [2, 3]): CylinderMate {
  const first = surface(scene, 'fixed', radii[0]), second = surface(scene, 'moving', radii[1])
  return { id: 'cylinder-tangent', name: 'Original ' + kind, type: kind, suppressed: false,
    first: reversed ? second : first, second: reversed ? first : second,
    branch: internal ? { kind: 'internal', larger: reversed ? 'first' : 'second' } : { kind: 'external' } }
}
function savedRelation(document: AssemblyDocument): CylinderMate {
  const value = document.mates.find(mate => mate.type === 'skew-cylinder-tangent' || mate.type === 'parallel-cylinder-tangent')
  if (!value || (value.type !== 'skew-cylinder-tangent' && value.type !== 'parallel-cylinder-tangent')) throw new Error('Actual declared cylinder tangency required')
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
interface Spec { radius: number; length: number; bore?: number; centerX?: number; selectedRadius?: number }
const standard: Record<string, Spec> = { fixed: { radius: 2, length: 12 }, moving: { radius: 3, length: 10 } }
/** Differential normals use actual D1, independent of the production frame determinant. */
function normal(face: Face, center: Vec3, axis: Vec3, radius: number, sense: 1 | -1): void {
  withNativeOwners(owners => {
    const oc = getOC(), adaptor = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false)), p = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
    adaptor.D1(.73, 4, p, du, dv)
    const point: Vec3 = [p.X(), p.Y(), p.Z()], delta = point.map((value, i) => value - center[i]) as Vec3,
      axial = dot(delta, axis), radial = delta.map((value, i) => value - axial * axis[i]), differential = cross([du.X(), du.Y(), du.Z()], [dv.X(), dv.Y(), dv.Z()]),
      sign = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1
    near(Math.hypot(...radial), radius, 1e-8); near(sign * dot(differential, radial) / (Math.hypot(...differential) * radius), sense, 1e-8)
  })
}
/** Independent native reconstruction/placement, analytical mass/cap bounds and support equations. */
function physical(document: AssemblyDocument, kind: AssemblyCylinderTangentMateType, branch: AssemblyCylinderTangentBranch,
  specs = standard, prefix: string[] = []): void {
  withNativeOwners(owners => {
    const supports: { point: Vec3; axis: Vec3; radius: number }[] = []
    for (const id of ['fixed', 'moving']) {
      const { pose, part } = leaf(document, [...prefix, id]), spec = specs[id], engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(part.document.features)
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('One original explicit body required')
      const copy = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(copy, pose)), oc = getOC(),
        analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      const bore = spec.bore ?? 0
      near(volume.Mass(), Math.PI * (spec.radius ** 2 - bore ** 2) * spec.length, 1e-5)
      near(area.Mass(), 2 * Math.PI * (spec.radius + bore) * spec.length + 2 * Math.PI * (spec.radius ** 2 - bore ** 2), 1e-5)
      const axis = rotate(pose.rotation, [0, 0, 1]), offset = rotate(pose.rotation, [spec.centerX ?? 0, 0, 0]),
        c0 = pose.translation.map((value, i) => value + offset[i]) as Vec3, c1 = c0.map((value, i) => value + spec.length * axis[i]), box = owners.own(shape.boundingBox).bounds
      for (let i = 0; i < 3; i++) {
        const extent = spec.radius * Math.sqrt(Math.max(0, 1 - axis[i] * axis[i]))
        near(box[0][i], Math.min(c0[i], c1[i]) - extent); near(box[1][i], Math.max(c0[i], c1[i]) + extent)
      }
      const selected = spec.selectedRadius ?? spec.radius
      let found = false
      for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) {
        const actual = extractAssemblyFaceSupport(face)
        if (actual.kind !== 'cylinder' || Math.abs(actual.radius - selected) > 1e-9) continue
        expect(found).toBe(false); found = true
        near(Math.hypot(...cross(actual.axis, axis)), 0, 1e-8); near(Math.hypot(...cross(actual.point.map((value, i) => value - c0[i]), axis)), 0)
        normal(face, c0, axis, selected, bore && selected === bore ? -1 : 1); supports.push(actual)
      }
      expect(found).toBe(true)
    }
    const [a, b] = supports, d = b.point.map((value, i) => value - a.point[i]), k = cross(a.axis, b.axis), g = Math.hypot(...k)
    const distance = kind === 'skew-cylinder-tangent' ? Math.abs(dot(k, d)) / g : Math.hypot(...d.map((value, i) => value - a.axis[i] * dot(a.axis, d)))
    if (kind === 'skew-cylinder-tangent') expect(g).toBeGreaterThan(1e-7); else near(Math.atan2(g, Math.abs(dot(a.axis, b.axis))), 0, 1e-8)
    const r1 = specs.fixed.selectedRadius ?? specs.fixed.radius, r2 = specs.moving.selectedRadius ?? specs.moving.radius
    near(distance, branch.kind === 'external' ? r1 + r2 : branch.larger === 'first' ? r1 - r2 : r2 - r1)
  })
}
function solved(kind: AssemblyCylinderTangentMateType, internal = false): AssemblyDocument {
  const base = fixture(kind); base.mates = [relation(kind, internal)]; const value = nativeReady(prepareAssemblySolve(base))
  try { return validateAssemblyDocument(value.document) } finally { discardAssemblySolvePreview(value) }
}

it.each(kinds)('reconstructs original %s sources with independent analytical initial mass and bounds', kind => {
  const scene = scenes[kind]; expect(scene.solidCount).toBe(2); expect(scene.prototypeCount).toBe(2)
  near(scene.volume, 138 * Math.PI, 1e-5); near(scene.area, 134 * Math.PI, 1e-5)
  expect(scene.bounds!.min.map(value => Math.round(value))).toEqual([-2, kind === 'skew-cylinder-tangent' ? -5 : -3, -6])
  expect(scene.bounds!.max.map(value => Math.round(value))).toEqual([10, kind === 'skew-cylinder-tangent' ? 5 : 3, 6])
})

it.each(kinds.flatMap(kind => [false, true].flatMap(internal => [false, true].map(reversed => ({ kind, internal, reversed })))))('solves native $kind internal=$internal/reversed=$reversed with the declared rank and fresh surface report', spec => {
  const base = fixture(spec.kind); base.mates = [relation(spec.kind, spec.internal, spec.reversed)]; const before = serializeAssemblyDocument(base), value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(value.scopes.at(-1)!.result.rank).toBe(spec.kind === 'skew-cylinder-tangent' ? 1 : 3)
    expect(value.scopes.at(-1)!.result.localDOF).toBe(spec.kind === 'skew-cylinder-tangent' ? 5 : 3)
    expect(value.checks).toHaveLength(1); expect(value.checks[0].satisfied).toBe(true); expect(value.tangencies).toBeUndefined()
    expect(value.cylinderTangencies).toEqual([{ kind: spec.kind, scopePath: [], mateId: 'cylinder-tangent', branch: savedRelation(base).branch,
      radialMaterialSense: { first: 1, second: 1 }, normalRelation: spec.internal ? 'same' : 'opposed', supportOnly: true }])
    const branch: AssemblyCylinderTangentBranch = spec.internal ? { kind: 'internal', larger: 'second' } : { kind: 'external' }
    physical(validateAssemblyDocument(value.document), spec.kind, branch); expect(serializeAssemblyDocument(base)).toBe(before)
    expect(value.document.occurrences[0].pose).toEqual(base.occurrences[0].pose)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds.flatMap(kind => [false, true].map(internal => ({ kind, internal }))))('keeps common six-coordinate gauge for floating $kind internal=$internal', spec => {
  const base = fixture(spec.kind); base.occurrences[0].fixed = false; base.mates = [relation(spec.kind, spec.internal)]
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.localDOF).toBe(spec.kind === 'skew-cylinder-tangent' ? 11 : 9); physical(validateAssemblyDocument(value.document), spec.kind, savedRelation(base).branch) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('accepts fixed satisfied %s supports and withholds fixed contradiction poses', kind => {
  const base = solved(kind); base.occurrences[1].fixed = true; const value = nativeReady(prepareAssemblySolve(base)); expect(value.scopes.at(-1)!.result.localDOF).toBe(0); discardAssemblySolvePreview(value)
  base.occurrences[1].pose.translation[0] += 2; const result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); expect('document' in result || 'cylinderTangencies' in result).toBe(false)
  if (result.status === 'rejected') expect(result.scopes.at(-1)!.result.certificates).toMatchObject([{ kind: 'fixedConstraint' }])
}, 60_000)

it.each(kinds)('checks an original exact external %s discriminator without imposing the other family', kind => {
  const base = fixture(kind); base.occurrences[1].pose.translation[0] = 5; base.occurrences[1].fixed = true; base.mates = [relation(kind)]
  const value = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(value.document), kind, { kind: 'external' }); expect(value.document.occurrences).toEqual(base.occurrences); expect(value.cylinderTangencies![0].normalRelation).toBe('opposed') }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('admits an actual reversed native axis without changing undirected %s support intent', kind => {
  const base = fixture(kind), moving = base.occurrences[1]
  moving.pose = kind === 'skew-cylinder-tangent' ? { translation: [5, 5, 0], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] } : { translation: [5, 0, 5], rotation: [1, 0, 0, 0] }
  moving.fixed = true; base.mates = [relation(kind, false, false, buildAssemblyScene(base))]
  const value = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(value.document), kind, { kind: 'external' }); expect(value.cylinderTangencies![0].radialMaterialSense).toEqual({ first: 1, second: 1 }); expect(value.cylinderTangencies![0].normalRelation).toBe('opposed') }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('uses both eccentric native axis points instead of either component origin for %s', kind => {
  const base = fixture(kind)
  for (const [index, offset] of [[0, 2], [1, 3]] as const) {
    const part = base.definitions[index]
    if (part.kind !== 'part' || part.document.features[0].type !== 'sketch' || part.document.features[0].profile.kind !== 'circle') throw new Error('Original circle required')
    part.document.features[0].profile.center = [offset, 0]; base.occurrences[index].pose.translation[0] -= offset
  }
  base.mates = [relation(kind, false, false, buildAssemblyScene(base))]; const value = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(value.document), kind, { kind: 'external' }, { fixed: { radius: 2, length: 12, centerX: 2 }, moving: { radius: 3, length: 10, centerX: 3 } }) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

function boreFixture(kind: AssemblyCylinderTangentMateType): { document: AssemblyDocument; specs: Record<string, Spec> } {
  const document = fixture(kind), first = document.definitions.find(value => value.id === 'cylinder-tangent-fixed')!, second = document.definitions.find(value => value.id === 'cylinder-tangent-moving')!
  if (first.kind !== 'part' || second.kind !== 'part' || first.document.features[0].type !== 'sketch' || first.document.features[0].profile.kind !== 'circle'
    || second.document.features[0].type !== 'sketch' || second.document.features[0].profile.kind !== 'circle' || second.document.features[1].type !== 'extrude') throw new Error('Original cylinders required')
  first.document.features[0].profile.radius = 7
  first.document.features.push({ id: 'bore-profile', name: 'Original R5 bore', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 5 } },
    { id: 'bore', name: 'Original through bore', type: 'cut', sketchId: 'bore-profile', depth: 12, symmetric: false, suppressed: false, bodyScope: [{ bodyId: 'fixed-body', sourceFeatureId: 'fixed-body-solid' }] })
  second.document.features[0].profile.radius = 2; second.document.features[1].depth = 8
  document.occurrences[0].pose.translation = [0, 0, kind === 'skew-cylinder-tangent' ? -6 : 0]
  document.occurrences[1].pose.translation = kind === 'skew-cylinder-tangent' ? [3, -4, 0] : [3, 0, 2]
  document.mates = [{ ...relation(kind, false, false, buildAssemblyScene(document), [5, 2]), branch: { kind: 'internal', larger: 'first' } }]
  return { document, specs: { fixed: { radius: 7, bore: 5, selectedRadius: 5, length: 12 }, moving: { radius: 2, length: 8 } } }
}

it.each(kinds)('attests actual inner/outer D1 normals on an original internal %s pair without containment claims', kind => {
  const { document, specs } = boreFixture(kind); document.occurrences[1].fixed = true; const value = nativeReady(prepareAssemblySolve(document))
  try {
    physical(validateAssemblyDocument(value.document), kind, { kind: 'internal', larger: 'first' }, specs)
    expect(value.cylinderTangencies![0]).toMatchObject({ branch: { kind: 'internal', larger: 'first' }, radialMaterialSense: { first: -1, second: 1 }, normalRelation: 'opposed', supportOnly: true })
    const scene = buildAssemblyScene(validateAssemblyDocument(value.document)); near(scene.volume, 320 * Math.PI, 1e-5); near(scene.area, 376 * Math.PI, 1e-5)
    const report = analyzeAssemblyInterference(document, { clearance: 0 })
    expect(report.pairs).toHaveLength(1)
    if (kind === 'skew-cylinder-tangent') expect(report.pairs[0].intersectionVolume).toBeGreaterThan(0)
    else near(report.pairs[0].intersectionVolume, 0, 1e-9)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('preserves internal larger-role and fresh bore normal ordering when %s endpoints reverse', kind => {
  const { document, specs } = boreFixture(kind), mate = savedRelation(document), originalFirst = mate.first
  mate.first = mate.second; mate.second = originalFirst; mate.branch = { kind: 'internal', larger: 'second' }; document.occurrences[1].fixed = true
  const value = nativeReady(prepareAssemblySolve(document))
  try { physical(validateAssemblyDocument(value.document), kind, { kind: 'internal', larger: 'first' }, specs); expect(value.cylinderTangencies![0]).toMatchObject({ branch: { kind: 'internal', larger: 'second' }, radialMaterialSense: { first: 1, second: -1 }, normalRelation: 'opposed' }) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('keeps native surface geometry invariant under a noncommuting common placement for %s', kind => {
  const base = solved(kind), group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'group', revision: 'r1', name: 'Original pair', createdAt: base.createdAt, updatedAt: base.updatedAt,
    occurrences: structuredClone(base.occurrences), mates: structuredClone(base.mates) }
  base.definitions.push(group); base.mates = []; base.occurrences = [{ id: 'common', name: 'Original common rigid pose', definition: { id: group.id, revision: group.revision }, pose: { translation: [40, -30, 20], rotation: [.5, -.5, .5, .5] }, fixed: false, visible: true, suppressed: false }]
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.localDOF).toBe(6); physical(validateAssemblyDocument(value.document), kind, { kind: 'external' }, standard, ['common']); expect(value.cylinderTangencies![0].scopePath).toEqual(['common']) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('verifies both actual reused scopes, hidden participation and fresh world reports for %s', kind => {
  const base = fixture(kind), group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'reused', revision: 'r1', name: 'Original shared declaration', createdAt: base.createdAt, updatedAt: base.updatedAt,
    occurrences: structuredClone(base.occurrences), mates: [relation(kind)] }
  base.definitions.push(group); base.occurrences = [
    { id: 'A', name: 'Z90', definition: { id: group.id, revision: group.revision }, pose: { translation: [40, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'B', name: 'Hidden X90', definition: { id: group.id, revision: group.revision }, pose: { translation: [-40, 30, 10], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: false, suppressed: false },
  ]
  const value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(value.scopes[0].result.localDOF).toBe(kind === 'skew-cylinder-tangent' ? 5 : 3); expect(value.scopes.at(-1)!.result.localDOF).toBe(0)
    expect(value.cylinderTangencies?.map(report => report.scopePath)).toEqual([['A'], ['B']])
    const actual = validateAssemblyDocument(value.document); physical(actual, kind, { kind: 'external' }, standard, ['A']); physical(actual, kind, { kind: 'external' }, standard, ['B'])
    const scene = buildAssemblyScene(actual); expect(scene.solidCount).toBe(4); expect(scene.prototypeCount).toBe(2); expect(scene.bodies.filter(body => !body.visible)).toHaveLength(2)
    near(scene.volume, 276 * Math.PI, 1e-5); near(scene.area, 268 * Math.PI, 1e-5); expect(actual.occurrences).toEqual(base.occurrences)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('keeps a real same-owner %s relation at rank0 and rejects its impossible branch', kind => {
  const base = fixture(kind), part = base.definitions[0]
  if (part.kind !== 'part') throw new Error('Original fixed cylinder required')
  part.document.features.push({ id: 'second-profile', name: 'Original independent second cylinder', type: 'sketch', plane: kind === 'skew-cylinder-tangent' ? 'XZ' : 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [5, 0], radius: 3 } },
    { id: 'second-solid', name: 'Original second explicit solid', type: 'extrude', sketchId: 'second-profile', depth: 10, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'second-body' } })
  base.occurrences = [base.occurrences[0]]; base.occurrences[0].fixed = false
  const scene = buildAssemblyScene(base); base.mates = [{ id: 'self', name: 'Original same-owner support pair', type: kind, suppressed: false, branch: { kind: 'external' }, first: surface(scene, 'fixed', 2), second: surface(scene, 'fixed', 3) }]
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.rank).toBe(0); expect(value.scopes.at(-1)!.result.localDOF).toBe(6); expect(value.document.occurrences).toEqual(base.occurrences); expect(value.cylinderTangencies).toHaveLength(1) }
  finally { discardAssemblySolvePreview(value) }
  savedRelation(base).branch = { kind: 'internal', larger: 'second' }; const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
}, 60_000)

it.each(kinds)('preserves compatible redundancy and rejects opposite radial branches for %s', kind => {
  const base = fixture(kind); base.mates = [relation(kind), { ...relation(kind), id: 'duplicate' }]
  const value = nativeReady(prepareAssemblySolve(base)); expect(value.scopes.at(-1)!.result.rank).toBe(kind === 'skew-cylinder-tangent' ? 1 : 3); expect(value.cylinderTangencies).toHaveLength(2); discardAssemblySolvePreview(value)
  savedRelation(base).branch = { kind: 'internal', larger: 'second' }; const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('document' in result || 'cylinderTangencies' in result).toBe(false)
}, 60_000)

function retainedParallelRedundancy(reversed: boolean, opposite: boolean) {
  const current = fixture('parallel-cylinder-tangent')
  // Original public geometry and the actual retained UI pose. Both relations
  // already satisfy physical tolerances; their row frames can still expose an
  // uncertain extra singular mode until a bounded numerical refinement.
  current.occurrences[1].pose = { translation: [1.0000000083145897, 0, -4.999579950764704], rotation: [0, -4.514114087029962e-10, 0, 1] }
  const mate = relation('parallel-cylinder-tangent', true, reversed)
  current.mates = [mate]
  const first = reversed ? 'moving' : 'fixed', second = reversed ? 'fixed' : 'moving', proposed = validateAssemblyDocument(current)
  proposed.mates.push({ id: 'parallel-redundancy', name: 'Original aligned axis redundancy', type: 'parallel', suppressed: false, alignment: 'aligned',
    first: axis(scenes['parallel-cylinder-tangent'], opposite ? second : first, (opposite ? second : first) === 'moving' ? 3 : 2),
    second: axis(scenes['parallel-cylinder-tangent'], opposite ? first : second, (opposite ? first : second) === 'moving' ? 3 : 2) })
  return { current, proposed }
}

it.each([false, true].flatMap(reversed => [false, true].map(opposite => ({ reversed, opposite }))))('refines native internal parallel redundancy to rank3 for reversed=$reversed/opposite=$opposite and preserves exact source/purpose through Apply/reopen', spec => {
  const { current, proposed } = retainedParallelRedundancy(spec.reversed, spec.opposite), source = serializeAssemblyDocument(current), intent = serializeAssemblyDocument(proposed), session = new AssemblyWorkerSession()
  try {
    const value = ready(session.prepare(current, proposed)), result = value.scopes.at(-1)!.result
    expect(result.rank).toBe(3); expect(result.rankRange).toEqual([3, 3]); expect(result.localDOF).toBe(3)
    if (spec.opposite) expect(result.iterations).toBeGreaterThan(0)
    expect(value.checks).toHaveLength(2); expect(value.checks.every(check => check.satisfied && check.lengthResidual <= check.lengthTolerance && check.angleResidual <= check.angleTolerance)).toBe(true)
    expect(value.document.definitions).toEqual(current.definitions); expect(value.document.mates).toEqual(proposed.mates); expect(value.document.occurrences[0]).toEqual(current.occurrences[0])
    expect(value.cylinderTangencies).toEqual([{ kind: 'parallel-cylinder-tangent', scopePath: [], mateId: 'cylinder-tangent',
      branch: { kind: 'internal', larger: spec.reversed ? 'first' : 'second' }, radialMaterialSense: { first: 1, second: 1 }, normalRelation: 'same', supportOnly: true }])
    expect(savedRelation(value.document).first.support).toBe('cylinder-surface'); expect(savedRelation(value.document).second.support).toBe('cylinder-surface')
    const direction = value.document.mates.find(mate => mate.id === 'parallel-redundancy')!
    expect(direction.type).toBe('parallel'); if (direction.type !== 'parallel') throw new Error('Actual native direction declaration required')
    expect(direction.first).toHaveProperty('support', 'axis'); expect(direction.second).toHaveProperty('support', 'axis')
    physical(value.document, 'parallel-cylinder-tangent', { kind: 'internal', larger: 'second' })
    expect(value.scene.solidCount).toBe(2); expect(value.scene.prototypeCount).toBe(2); near(value.scene.volume, 138 * Math.PI, 1e-5); near(value.scene.area, 134 * Math.PI, 1e-5)
    const applied = session.apply(current, value.token).document, reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    expect(applied.mates).toEqual(proposed.mates); expect(applied.definitions).toEqual(current.definitions)
    expect(fresh.scopes.at(-1)!.result.rank).toBe(3); expect(fresh.scopes.at(-1)!.result.localDOF).toBe(3); expect(fresh.cylinderTangencies).toEqual(value.cylinderTangencies)
    expect(fresh.document.mates).toEqual(proposed.mates); expect(fresh.checks).toHaveLength(2); expect(fresh.checks.every(check => check.satisfied)).toBe(true)
    physical(fresh.document, 'parallel-cylinder-tangent', { kind: 'internal', larger: 'second' }); session.apply(reopened, fresh.token)
    expect(serializeAssemblyDocument(current)).toBe(source); expect(serializeAssemblyDocument(proposed)).toBe(intent)
  } finally { session.discard() }
}, 60_000)

it('retains native rank uncertainty and withholds Apply when the actual opposite-order redundancy has zero iteration budget', () => {
  const { current, proposed } = retainedParallelRedundancy(true, true), source = serializeAssemblyDocument(current), intent = serializeAssemblyDocument(proposed), session = new AssemblyWorkerSession()
  try {
    const result = session.prepare(current, proposed, { solver: { maxIterations: 0 } })
    expect(result.status).toBe('rejected'); expect('token' in result || 'document' in result || 'cylinderTangencies' in result).toBe(false)
    if (result.status !== 'rejected') throw new Error('Zero-budget uncertain rank must not publish authority')
    expect(result.reason).toBe('numeric'); const scope = result.scopes.at(-1)!.result
    expect(scope.status).toBe('rankUncertain'); expect(scope.rankRange).toEqual([3, 4]); expect(scope.iterations).toBe(0)
    expect(scope.evidence.groups).toHaveLength(1); expect(scope.evidence.groups[0].trials).toBe(0); expect(scope.evidence.groups[0].checks).toHaveLength(2); expect(scope.evidence.groups[0].checks.every(check => check.satisfied)).toBe(true)
    expect(serializeAssemblyDocument(current)).toBe(source); expect(serializeAssemblyDocument(proposed)).toBe(intent)
  } finally { session.discard() }
}, 60_000)

it.each(['parallel-skew', 'orthogonal-parallel', 'near-parallel-skew'] as const)('rejects an actual native %s singular chart without a family fallback', fault => {
  const kind = fault === 'orthogonal-parallel' ? 'parallel-cylinder-tangent' : 'skew-cylinder-tangent', base = fixture(kind)
  base.occurrences[1].pose.rotation = fault === 'orthogonal-parallel' ? [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] : fault === 'near-parallel-skew' ? [Math.sin(5e-11), 0, 0, Math.cos(5e-11)] : [0, 0, 0, 1]
  base.mates = [relation(kind)]; const before = serializeAssemblyDocument(base), result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); expect('document' in result || 'cylinderTangencies' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each(['axis', 'plane', 'body', 'key', 'revision', 'path'] as const)('rejects actual cylinder tangency with a wrong %s declaration before candidate publication', fault => {
  const base = fixture(), value = relation('skew-cylinder-tangent'), ref = value.second
  if (fault === 'axis') Object.assign(ref, { support: 'axis' })
  else if (fault === 'plane') {
    const cap = scenes['skew-cylinder-tangent'].bodies.find(body => body.component.occurrencePath[0] === 'moving')!.faces.find(face => face.support?.kind === 'plane')!
    ref.face = { ...cap.selection.face }
  } else if (fault === 'body') ref.body = null
  else if (fault === 'key') ref.face.key += '-missing'
  else if (fault === 'revision') ref.component.definition.revision = 'missing'
  else ref.component.occurrencePath = ['moving', 'fixed']
  base.mates = [value]; const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('document' in result || 'cylinderTangencies' in result).toBe(false)
}, 60_000)

it('uses existing private surface witnesses and rejects cloned, cross-snapshot or changed-source proof', () => {
  const base = fixture(), value = relation('skew-cylinder-tangent'), first = new AssemblyGeometrySnapshot(base), second = new AssemblyGeometrySnapshot(base)
  try {
    const a = first.resolveCylinderSurfaceReference(base, value.first), b = first.resolveCylinderSurfaceReference(base, value.second)
    expect(first.assertWitness(a, base)).toBe(a); expect(first.assertWitness(b, base)).toBe(b); expect(a).not.toBe(b)
    expect(() => second.assertWitness(a, base)).toThrow('verificada'); expect(() => first.assertWitness(structuredClone(b), base)).toThrow('verificada')
    const changed = fixture(); changed.occurrences[1].pose.translation[0] += 1; expect(() => first.assertWitness(a, changed)).toThrow('documento cambió')
  } finally { first.dispose(); second.dispose() }
}, 60_000)

it.each(kinds)('keeps suppression/deletion inactive and broken active %s declarations repairable', kind => {
  const base = fixture(kind); base.occurrences[1].visible = false; base.mates = [relation(kind)]
  const active = nativeReady(prepareAssemblySolve(base)); expect(active.cylinderTangencies).toHaveLength(1); discardAssemblySolvePreview(active)
  base.occurrences[1].suppressed = true; expect(prepareAssemblySolve(base).status).toBe('rejected'); base.mates[0].suppressed = true
  const suppressed = nativeReady(prepareAssemblySolve(base)); expect(suppressed.cylinderTangencies).toBeUndefined(); expect(suppressed.document.mates).toEqual(base.mates); discardAssemblySolvePreview(suppressed)
  base.mates = []; const deleted = nativeReady(prepareAssemblySolve(base)); expect(deleted.cylinderTangencies).toBeUndefined(); discardAssemblySolvePreview(deleted)
}, 60_000)

it.each(kinds)('keeps one authenticated %s transaction across Cancel/report mutation/Apply/history/reopen', kind => {
  const base = fixture(kind), proposed = fixture(kind); proposed.mates = [relation(kind)]
  const history = new AssemblyDocumentHistory(base), session = new AssemblyWorkerSession()
  try {
    const canceled = ready(session.prepare(base, proposed)); session.discard(canceled.token); expect(() => session.apply(base, canceled.token)).toThrow('disponible'); expect(history.current).toEqual(base)
    const value = ready(session.prepare(base, proposed)); value.cylinderTangencies![0].branch = { kind: 'internal', larger: 'first' }; value.cylinderTangencies![0].radialMaterialSense.second = -1; value.document.mates[0].name = 'Renderer mutation'
    const applied = session.apply(base, value.token); expect(applied.document.mates).toEqual(proposed.mates); history.commitDocument(applied.document)
    expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied.document)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(history.current)), fresh = ready(session.prepare(reopened)); expect(fresh.cylinderTangencies![0].branch).toEqual({ kind: 'external' }); expect(fresh.cylinderTangencies![0].normalRelation).toBe('opposed')
    physical(fresh.document, kind, { kind: 'external' }); expect('cylinderTangencies' in reopened).toBe(false)
  } finally { session.discard() }
}, 60_000)

it('rejects cloned capabilities and stale direct Apply sources without trusting the report', () => {
  const base = fixture(); base.mates = [relation('skew-cylinder-tangent')]; const history = new AssemblyDocumentHistory(base), value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(() => applyAssemblySolvePreview(history, structuredClone(value))).toThrow('verificada')
    history.commitDocument({ ...base, name: 'Actual source change' }); expect(() => applyAssemblySolvePreview(history, value)).toThrow('documento cambió')
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(kinds)('does not inherit plane/cylinder constant-R translation admission for %s', kind => {
  const base = solved(kind), moving = base.occurrences[1], before = serializeAssemblyDocument(base)
  const result = prepareAssemblyTranslationPreview(base, { component: { occurrencePath: ['moving'], definition: { ...moving.definition } }, translation: [...moving.pose.translation] })
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('trayectoria rectilínea')
  expect('document' in result || 'cylinderTangencies' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each(kinds)('preserves sampled-only winding and the last fresh report for a pure cylinder spin in %s', kind => {
  const base = solved(kind), moving = base.occurrences[1], session = new AssemblyWorkerSession()
  try {
    const value = ready(session.moveMotion(base, { component: { occurrencePath: ['moving'], definition: { ...moving.definition } }, translation: [...moving.pose.translation], rotation: { axis: 2, angle: 2 * Math.PI / 3 } }))
    expect(value.motion!.sampledOnly).toBe(true); expect(value.motion!.verifiedStations).toBe(2); near(value.motion!.evaluatedAngle, 2 * Math.PI / 3, 1e-8)
    expect(value.cylinderTangencies).toHaveLength(1); expect(value.cylinderTangencies![0].kind).toBe(kind); physical(value.document, kind, { kind: 'external' })
  } finally { session.discard() }
}, 60_000)

it.each([1.5, 2])('rejects native internal larger-role reversal/equality after explicit source repair to radius%s', radius => {
  const base = solved('parallel-cylinder-tangent', true), part = base.definitions.find(value => value.id === 'cylinder-tangent-moving')!
  if (part.kind !== 'part') throw new Error('Original moving cylinder required')
  const replacement = structuredClone(part.document), profile = replacement.features[0]
  if (profile.type !== 'sketch' || profile.profile.kind !== 'circle') throw new Error('Original circle required'); profile.profile.radius = radius
  const review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, replacement, 'r2')
  expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].status).toBe('needs-repair')
  const repaired = repairAssemblyEndpoint(review.document, review.endpoints[0].locator, surface(review.scene, 'moving', radius)), before = serializeAssemblyDocument(base), session = new AssemblyWorkerSession()
  try {
    const result = session.prepare(base, repaired); expect(result.status).toBe('rejected'); expect('token' in result || 'cylinderTangencies' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
    expect(savedRelation(repaired).branch).toEqual({ kind: 'internal', larger: 'second' })
    if (radius < 2) {
      savedRelation(repaired).branch = { kind: 'internal', larger: 'first' }
      const explicit = ready(session.prepare(base, repaired)); expect(explicit.cylinderTangencies![0].branch).toEqual({ kind: 'internal', larger: 'first' })
      physical(explicit.document, 'parallel-cylinder-tangent', { kind: 'internal', larger: 'first' }, { fixed: { radius: 2, length: 12 }, moving: { radius, length: 10 } })
    }
  } finally { session.discard() }
}, 60_000)

it('re-queries a legitimate external source radius update after exact current manual repair and preserves old revision', () => {
  const base = solved('skew-cylinder-tangent'), part = base.definitions.find(value => value.id === 'cylinder-tangent-moving')!
  if (part.kind !== 'part') throw new Error('Original moving cylinder required')
  const replacement = structuredClone(part.document), profile = replacement.features[0]
  if (profile.type !== 'sketch' || profile.profile.kind !== 'circle') throw new Error('Original circle required'); profile.profile.radius = 2.5
  const review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, replacement, 'r2')
  expect(review.endpoints[0].status).toBe('needs-repair'); expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  const repaired = repairAssemblyEndpoint(review.document, review.endpoints[0].locator, surface(review.scene, 'moving', 2.5)), session = new AssemblyWorkerSession()
  try {
    const value = ready(session.prepare(base, repaired)); physical(value.document, 'skew-cylinder-tangent', { kind: 'external' }, { fixed: { radius: 2, length: 12 }, moving: { radius: 2.5, length: 10 } })
    expect(value.cylinderTangencies![0].normalRelation).toBe('opposed'); const applied = session.apply(base, value.token).document
    expect(applied.definitions.find(value => value.id === part.id && value.revision === 'r1')).toEqual(part)
    const fresh = ready(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied)))); physical(fresh.document, 'skew-cylinder-tangent', { kind: 'external' }, { fixed: { radius: 2, length: 12 }, moving: { radius: 2.5, length: 10 } })
  } finally { session.discard() }
}, 60_000)

const extractionContext = 'Assembly cylinder surface extraction or release failed.'
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

it('freshly queries both exact cylinder surfaces again after actual numerical solving', () => {
  const base = fixture(); base.mates = [relation('skew-cylinder-tangent')]
  let solved = false; const after: number[] = [], actualSolve = numericSolver.solveRigidMates, actualQuery = CadEngine.prototype.inspectCurrentCylinderSurfaceSupport
  const solver = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentCylinderSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) { const result = actualQuery.apply(this, args); if (solved) after.push(result.radius); return result })
  try { const value = nativeReady(prepareAssemblySolve(base)); expect(after).toEqual([2, 3]); expect(value.cylinderTangencies).toHaveLength(1); discardAssemblySolvePreview(value) }
  finally { query.mockRestore(); solver.mockRestore() }
}, 60_000)

it.each([0, 1])('withholds a pair report when fresh final endpoint%i query actually fails', endpoint => {
  const base = fixture(); base.mates = [relation('skew-cylinder-tangent')]; const before = serializeAssemblyDocument(base)
  let solved = false, finalQueries = 0; const actualSolve = numericSolver.solveRigidMates, actualQuery = CadEngine.prototype.inspectCurrentCylinderSurfaceSupport
  const solver = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentCylinderSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = actualQuery.apply(this, args); if (solved && finalQueries++ === endpoint) throw new Error('Original actual final endpoint failure'); return result
  })
  try {
    const result = prepareAssemblySolve(base); expect(finalQueries).toBe(endpoint + 1); expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.reason).toBe('verification'); expect('cylinderTangencies' in result || 'document' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { query.mockRestore(); solver.mockRestore() }
}, 60_000)

it.each([0, 1].flatMap(endpoint => [0, 1, 2, 3, 4, 5, 6].map(owner => ({ endpoint, owner }))))('drains both surface lifetimes and withholds authority when endpoint$endpoint owner$owner release fails', spec => {
  const base = fixture(); base.mates = [relation('skew-cylinder-tangent')]; const released: number[] = [], failure = new Error('Original paired surface release failure')
  const result = observeExtraction((owner, query, index) => {
    if (query !== spec.endpoint) return
    const remove = owner.delete.bind(owner)
    Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(index); remove(); if (index === spec.owner) throw failure } })
  }, () => prepareAssemblySolve(base))
  expect(result.status).toBe('rejected'); expect('document' in result || 'cylinderTangencies' in result).toBe(false); expect(released).toEqual([6, 5, 4, 3, 2, 1, 0])
}, 60_000)

it('preserves second-surface primary and cleanup failures without publishing the first surface alone', () => {
  const base = fixture(); base.mates = [relation('skew-cylinder-tangent')]
  const primary = new Error('Original second Y scalar failure'), cleanup = new Error('Original second Y release failure'), actualQuery = CadEngine.prototype.inspectCurrentCylinderSurfaceSupport
  let failure: unknown, releases = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentCylinderSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    try { return actualQuery.apply(this, args) } catch (error) { failure = error; throw error }
  })
  try {
    const result = observeExtraction((owner, endpoint, index) => {
      if (endpoint !== 1 || index !== 6) return
      const point = owner as NativeOwner & { X(): number }, read = point.X.bind(point), remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'X', { configurable: true, value: () => { read(); throw primary } })
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { releases++; remove(); throw cleanup } })
    }, () => prepareAssemblySolve(base))
    expect(result.status).toBe('rejected'); expect(failure).toBeInstanceOf(NativeCleanupError); expect(errorTree(failure)).toContain(primary); expect(errorTree(failure)).toContain(cleanup); expect(releases).toBe(1); expect('cylinderTangencies' in result).toBe(false)
  } finally { query.mockRestore() }
}, 60_000)

it('rejects second-surface late reentry after actual native Y cleanup and permits a separate fresh rebuild', () => {
  const base = fixture(); base.mates = [relation('skew-cylinder-tangent')]; const part = base.definitions.find(value => value.id === 'cylinder-tangent-moving')!
  if (part.kind !== 'part') throw new Error('Original moving cylinder required')
  const actualQuery = CadEngine.prototype.inspectCurrentCylinderSurfaceSupport; let engine: CadEngine | undefined, calls = 0, entered = false
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentCylinderSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) { if (calls++ === 1) engine = this; return actualQuery.apply(this, args) })
  try {
    const result = observeExtraction((owner, endpoint, index) => {
      if (endpoint !== 1 || index !== 6) return
      const remove = owner.delete.bind(owner)
      Object.defineProperty(owner, 'delete', { configurable: true, value: () => { remove(); if (!entered) { entered = true; engine!.rebuildForAssemblyReferences(part.document.features) } } })
    }, () => prepareAssemblySolve(base))
    expect(entered).toBe(true); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('geometría cambió'); expect('cylinderTangencies' in result).toBe(false)
  } finally { query.mockRestore() }
  const fresh = nativeReady(prepareAssemblySolve(base)); expect(fresh.cylinderTangencies).toHaveLength(1); discardAssemblySolvePreview(fresh)
}, 60_000)

it.each(['mesh', 'cleanup'] as const)('withholds session token/report and retires old authority on final scene %s failure', fault => {
  const base = fixture(), proposed = fixture(); proposed.mates = [relation('skew-cylinder-tangent')]
  const session = new AssemblyWorkerSession(), previous = ready(session.prepare(base)), source = serializeAssemblyDocument(base), failure = new Error('Original CC final scene failure')
  let reached = false, releases = 0; const actualMesh = Shape.prototype.mesh, arena = ownership.withNativeOwners
  const implementation: typeof arena = <T>(operation: (owners: NativeOwners) => T, retained: (result: T) => readonly NativeOwner[] = () => [], context?: string): T => arena(owners => {
    if (fault === 'cleanup' && context === 'Assembly scene placement, mesh or release failed.') {
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
  const mesh = vi.spyOn(Shape.prototype, 'mesh').mockImplementation(function (this: AnyShape, ...args) { const result = actualMesh.apply(this, args); if (fault === 'mesh') { reached = true; throw failure } return result })
  const owners = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { expect(() => session.prepare(base, proposed)).toThrow(); expect(reached).toBe(true); expect(releases).toBe(fault === 'cleanup' ? 1 : 0); expect(() => session.apply(base, previous.token)).toThrow('disponible'); expect(serializeAssemblyDocument(base)).toBe(source) }
  finally { owners.mockRestore(); mesh.mockRestore(); session.discard() }
  const fresh = ready(session.prepare(base, proposed)); expect(fresh.cylinderTangencies).toHaveLength(1); session.discard()
}, 60_000)

function cylinderFace(scene: AssemblyScene, id: string, radius: number, x?: number): AssemblySceneFace {
  const faces = scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces.filter(face => face.support?.kind === 'cylinder'
    && Math.abs(face.support.radius - radius) < 1e-9 && (x === undefined || Math.abs(face.support.point[0] - x) < 1e-9))
  expect(faces).toHaveLength(1); return faces[0]
}
function axis(scene: AssemblyScene, id: string, radius: number, x?: number): AssemblyAxisReference {
  const ref = assemblySceneFaceReference(cylinderFace(scene, id, radius, x))
  if (!ref || ref.support !== 'axis') throw new Error('Actual original mechanical axis required'); return { ...ref, support: 'axis' }
}
function cap(scene: AssemblyScene, id: string, z: number) {
  const face = scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces.find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - z) < 1e-9)!, ref = assemblySceneFaceReference(face)
  if (!ref || ref.support !== 'plane') throw new Error('Actual original mechanical cap required'); return { ...ref, support: 'plane' as const }
}
function component(document: AssemblyDocument, id: string) { return { occurrencePath: [id], definition: { ...document.occurrences.find(value => value.id === id)!.definition } } }
type Mechanism = 'gear' | 'screw' | 'rack'
function mechanism(kind: Mechanism) {
  const base = kind === 'gear' ? createAssemblyExample() : validateAssemblyDocument(kind === 'screw' ? screwOriginal : rackOriginal), driver = kind === 'gear' ? 'left' : kind === 'screw' ? 'shaft' : 'pinion'
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) base.occurrences.find(value => value.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = buildAssemblyScene(base)
  base.mates = []
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) base.mates.push(
    { id: id + '-axis', name: 'Original pin bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(scene, id, 2), second: axis(scene, 'plate', 3, x) },
    { id: id + '-cap', name: 'Original axial cap', type: 'coincident', suppressed: false, alignment: 'aligned', first: cap(scene, id, 12), second: cap(scene, 'plate', 4) })
  else base.mates = [
    { id: 'bearing', name: 'Original motor bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(scene, driver, 2), second: axis(scene, 'ground', 3) },
    { id: 'axial', name: 'Original axial datum', type: 'distance', suppressed: false, alignment: 'aligned', distance: 18, first: cap(scene, driver, 30), second: cap(scene, 'ground', 4) },
    { id: 'guide', name: 'Original nonrotating follower guide', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: [0, 0, 0, 1],
      first: axis(scene, kind === 'screw' ? 'nut' : 'rack', 2.5), second: axis(scene, kind === 'screw' ? 'ground' : 'guide', kind === 'screw' ? 3 : 2) },
  ]
  const added = structuredClone(originals['parallel-cylinder-tangent'].definitions[0]); if (added.kind !== 'part') throw new Error('Original R2 cylinder required')
  added.id = 'cc-adjacent'; added.document.id = added.id; base.definitions.push(added)
  const tangentKind = kind === 'screw' ? 'parallel-cylinder-tangent' : 'skew-cylinder-tangent', x = kind === 'gear' ? -6 : 4
  base.occurrences.push({ id: 'adjacent', name: 'Original fixed adjacent cylinder', definition: { id: added.id, revision: added.revision },
    pose: tangentKind === 'skew-cylinder-tangent' ? { translation: [x, -6, 0], rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] } : { ...identityRigidPose(), translation: [x, 0, -8] }, fixed: true, visible: true, suppressed: false })
  const session = new AssemblyWorkerSession(), initial = ready(session.prepare(base))
  const capture = kind === 'gear' ? session.captureGear(base, initial.token, { first: axis(initial.scene, 'left', 2), second: axis(initial.scene, 'right', 2), carrier: component(base, 'plate'), ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original gear and cylinder tangency' })
    : kind === 'screw' ? session.captureScrew(base, initial.token, { first: axis(initial.scene, 'shaft', 2), second: axis(initial.scene, 'nut', 2.5), lead: 2, reverse: false, alignment: 'aligned', name: 'Original screw and cylinder tangency' })
      : session.captureRackPinion(base, initial.token, { first: axis(initial.scene, 'pinion', 2), second: (() => {
        const edges = initial.scene.bodies.find(body => body.component.occurrencePath[0] === 'rack')!.edges!, edge = edges.find(edge => edge.support?.kind === 'line' && edge.support.axis[2] > .99 && Math.abs(Math.abs(edge.support.point[0]) - 5) < 1e-9 && Math.abs(Math.abs(edge.support.point[1]) - 5) < 1e-9)
        if (!edge) throw new Error('Actual original rack LINE required'); return assemblySceneEdgeReference(edge)!
      })(), conversion: { mode: 'diameter', override: null }, reverse: false, name: 'Original rack and cylinder tangency' })
  let document = session.apply(base, ready(capture).token).document
  const current = buildAssemblyScene(document), proposed = validateAssemblyDocument(document)
  proposed.mates.push({ id: 'cc-mechanical', name: 'Original compatible cylinder tangency', type: tangentKind, suppressed: false, branch: { kind: 'external' }, first: surface(current, driver, 2), second: surface(current, 'adjacent', 2) })
  const supported = ready(session.prepare(document, proposed)); expect(supported.scopes.at(-1)!.result.localDOF).toBe(1)
  document = session.apply(document, supported.token).document
  return { session, document, driver, tangentKind }
}

it.each(['gear', 'screw', 'rack'] as const)('continues original native %s winding through +720 with compatible cylinder support, Apply and fresh reopen', kind => {
  const { session, document, driver, tangentKind } = mechanism(kind), original = serializeAssemblyDocument(document), occurrence = document.occurrences.find(value => value.id === driver)!
  try {
    const value = ready(session.moveMotion(document, { component: component(document, driver), translation: [...occurrence.pose.translation], rotation: { axis: 2, angle: 4 * Math.PI } }))
    expect(value.motion!.verifiedStations).toBe(12); expect(value.motion!.sampledOnly).toBe(true); near(value.motion!.evaluatedAngle, 4 * Math.PI, 1e-8)
    expect(value.cylinderTangencies).toEqual([{ kind: tangentKind, scopePath: [], mateId: 'cc-mechanical', branch: { kind: 'external' }, radialMaterialSense: { first: 1, second: 1 }, normalRelation: 'opposed', supportOnly: true }])
    const winding = value.document.mates.find(mate => mate.type === (kind === 'rack' ? 'rack-pinion' : kind))!
    if (winding.type === 'gear') { near(winding.angles.first, -4 * Math.PI, 1e-8); near(winding.angles.second, 2 * Math.PI, 1e-8) }
    else if (winding.type === 'screw' || winding.type === 'rack-pinion') near(winding.angle, -4 * Math.PI, 1e-8)
    else throw new Error('Actual saved mechanical winding required')
    if (kind === 'screw') near(value.document.occurrences.find(value => value.id === 'nut')!.pose.translation[2], 14)
    if (kind === 'rack') near(value.document.occurrences.find(value => value.id === 'rack')!.pose.translation[0], -10 - 8 * Math.PI)
    const marker = cylinderFace(value.scene, driver, .25).worldSupport; if (marker?.kind !== 'cylinder') throw new Error('Actual eccentric native bore marker required')
    near(marker.point[0], kind === 'gear' ? -9 : 1); near(marker.point[1], 0)
    const groups = value.scopes.flatMap(scope => scope.result.evidence.groups); expect(groups.length).toBeGreaterThan(0); expect(groups.every(group => group.seededConstraintIds.length === 0)).toBe(true)
    expect(value.checks).toHaveLength(kind === 'gear' ? 6 : 5); expect(value.checks.every(check => check.satisfied)).toBe(true)
    expect(value.scene.solidCount).toBe(kind === 'rack' ? 5 : 4); expect(value.scene.prototypeCount).toBe(kind === 'gear' ? 3 : kind === 'screw' ? 4 : 5)
    near(value.scene.volume, kind === 'gear' ? 4800 + 141 * Math.PI / 2 : kind === 'screw' ? 5400 + 741 * Math.PI / 8 : 10800 + 601 * Math.PI / 8, 1e-5)
    near(value.scene.area, kind === 'gear' ? 2960 + 767 * Math.PI / 4 : kind === 'screw' ? 3400 + 1779 * Math.PI / 8 : 5560 + 6563 * Math.PI / 8, 1e-5)
    const applied = session.apply(document, value.token).document, reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    expect(fresh.scopes.at(-1)!.result.localDOF).toBe(1); expect(fresh.cylinderTangencies).toEqual(value.cylinderTangencies); expect(fresh.document.mates).toEqual(applied.mates); expect(fresh.checks.every(check => check.satisfied)).toBe(true)
    session.apply(reopened, fresh.token); expect(serializeAssemblyDocument(document)).toBe(original)
  } finally { session.discard() }
}, 60_000)

it.each([false, true])('rejects a singular native cylinder chart without reseeding or losing gear state (passive=%s)', passive => {
  const { session, document } = mechanism('gear')
  try {
    const original = document.mates.find(mate => mate.type === 'gear')!; if (original.type !== 'gear') throw new Error('Actual gear required'); original.suppressed = passive
    const proposed = validateAssemblyDocument(document); proposed.occurrences.find(value => value.id === 'adjacent')!.pose = { ...identityRigidPose(), translation: [-6, 0, -8] }
    const source = serializeAssemblyDocument(document), actual = numericSolver.solveRigidMates; let calls = 0
    const solver = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { calls++; return actual(problem, options) })
    try {
      const result = session.prepare(document, proposed); expect(calls).toBeGreaterThan(0); expect(result.status).toBe('rejected'); expect('token' in result || 'cylinderTangencies' in result).toBe(false); expect(serializeAssemblyDocument(document)).toBe(source)
      expect(original.angles).toEqual({ first: 0, second: 0 })
    } finally { solver.mockRestore() }
  } finally { session.discard() }
}, 60_000)
