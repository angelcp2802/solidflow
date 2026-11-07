import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, Shape, makeBox, type AnyShape } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyMate,
  type AssemblyLimitDistanceMate, type AssemblyPlaneReference, type AssemblyAxisReference, type AssemblyOccurrence, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { identityRigidPose, type Quaternion } from '../model/rigidPose'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { createAssemblyExample } from '../examples/assembly'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot, assemblyEndpointPlacementArithmetic } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, assemblySceneEdgeReference, type AssemblyScene, type AssemblySceneFace,
  type AssemblyPreviewReply, type AssemblyLimitDistanceSupportReport } from './kernel.assembly-types'
import { prepareAssemblySolve, prepareAssemblyMovePreview, prepareAssemblyDragPreview, prepareAssemblyTranslationPreview,
  applyAssemblySolvePreview, discardAssemblySolvePreview, type AssemblySolvePreview } from './kernel.assembly-solve'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { ownedNativeTopology } from './kernel.native-topology'
import { extractAssemblyFaceSupport } from './kernel.assembly-supports'
import { withNativeOwners, NativeCleanupError, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import { bodyBoolean } from './kernel.bodies'
import * as ownership from './kernel.native-ownership'
import * as numerical from '../model/assemblySolver'
import type { Vec3 } from './kernel.types'

let original: AssemblyDocument, originalScene: AssemblyScene, screwOriginal: AssemblyDocument, rackOriginal: AssemblyDocument, sphereOriginal: AssemblyDocument
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  original = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-limit-distance-original.json', import.meta.url), 'utf8'))
  originalScene = buildAssemblyScene(original)
  screwOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-screw-original.json', import.meta.url), 'utf8'))
  rackOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-rack-pinion-original.json', import.meta.url), 'utf8'))
  sphereOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-plane-sphere-tangent-original.json', import.meta.url), 'utf8'))
}, 60_000)
const fixture = () => validateAssemblyDocument(original)
const near = (actual: number, expected: number, tolerance = 1e-6) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const tuple = (point: { X(): number; Y(): number; Z(): number }): Vec3 => [point.X(), point.Y(), point.Z()]
function rotate(q: Quaternion, p: Vec3): Vec3 {
  const n = Math.hypot(...q), [x, y, z, w] = q.map(value => value / n)
  return [(1 - 2 * (y * y + z * z)) * p[0] + 2 * (x * y - z * w) * p[1] + 2 * (x * z + y * w) * p[2],
    2 * (x * y + z * w) * p[0] + (1 - 2 * (x * x + z * z)) * p[1] + 2 * (y * z - x * w) * p[2],
    2 * (x * z - y * w) * p[0] + 2 * (y * z + x * w) * p[1] + (1 - 2 * (x * x + y * y)) * p[2]]
}
function leaf(document: AssemblyDocument, path: readonly string[]) {
  let scope: AssemblyDocument | EmbeddedAssemblyDefinition = document, pose = identityRigidPose()
  for (const [index, id] of path.entries()) {
    const occurrence: AssemblyOccurrence | undefined = scope.occurrences.find(value => value.id === id)
    if (!occurrence) throw new Error('Original exact native occurrence required')
    const a = pose.rotation, b = occurrence.pose.rotation, offset = rotate(a, occurrence.pose.translation)
    pose = { translation: offset.map((value, i) => value + pose.translation[i]) as Vec3, rotation: [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]] }
    const part = document.definitions.find(value => value.id === occurrence.definition.id && value.revision === occurrence.definition.revision)
    if (!part) throw new Error('Original current native definition required')
    if (index === path.length - 1 && part.kind === 'part') return { part, pose }
    if (part.kind !== 'assembly') throw new Error('Original nested scope required')
    scope = part
  }
  throw new Error('Original native part path required')
}
function component(document: AssemblyDocument, id = 'moving') {
  const item = document.occurrences.find(value => value.id === id)
  if (!item) throw new Error('Original driver required')
  return { occurrencePath: [id], definition: { ...item.definition } }
}
function face(scene: AssemblyScene, id: string, predicate: (value: AssemblySceneFace) => boolean): AssemblySceneFace {
  const matches = scene.bodies.filter(value => value.component.occurrencePath.at(-1) === id).flatMap(value => value.faces).filter(predicate)
  expect(matches).toHaveLength(1); return matches[0]
}
function cap(scene: AssemblyScene, id: string, z: number, sign = 1): AssemblyPlaneReference {
  const selected = face(scene, id, value => value.support?.kind === 'plane' && Math.abs(value.support.point[2] - z) < 1e-8 && sign * value.support.normal[2] > .99),
    reference = assemblySceneFaceReference(selected)
  if (!reference || reference.support !== 'plane') throw new Error('Exact outward native plane required')
  return { ...reference, support: 'plane' }
}
function relation(alignment: 'aligned' | 'opposed' = 'aligned', minimum = 10, maximum = 30, reversed = false, scene = originalScene): AssemblyLimitDistanceMate {
  const moving = cap(scene, 'moving', alignment === 'aligned' ? 2 : 0, alignment === 'aligned' ? 1 : -1), fixed = cap(scene, 'fixed', 4)
  return { id: 'interval', name: 'Original signed interval', type: 'limit-distance', suppressed: false, alignment,
    first: reversed ? fixed : moving, second: reversed ? moving : fixed,
    limits: reversed && alignment === 'aligned' ? { minimum: -maximum, maximum: -minimum } : { minimum, maximum } }
}
function mated(alignment: 'aligned' | 'opposed' = 'aligned', q = 20, minimum = 10, maximum = 30, reversed = false): AssemblyDocument {
  const value = fixture(); value.occurrences[1].pose.translation[2] = q + (alignment === 'aligned' ? 2 : 4)
  value.mates = [relation(alignment, minimum, maximum, reversed)]; return validateAssemblyDocument(value)
}
function nativeReady(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function report(value: AssemblySolvePreview | Extract<AssemblyPreviewReply, { status: 'ready' }>): AssemblyLimitDistanceSupportReport {
  expect(value.limitDistances).toHaveLength(1); const measured = value.limitDistances![0]
  return { ...measured, scopePath: [...measured.scopePath], limits: { ...measured.limits } }
}
function physical(document: AssemblyDocument, alignment: 'aligned' | 'opposed' = 'aligned', prefix: string[] = [], movingHeight = 2): number {
  return withNativeOwners(owners => {
    const supports: { point: Vec3; normal: Vec3 }[] = []
    for (const id of ['moving', 'fixed']) {
      const { part, pose } = leaf(document, [...prefix, id]), size: Vec3 = id === 'fixed' ? [40, 30, 4] : [10, 6, movingHeight],
        z = id === 'moving' && alignment === 'opposed' ? 0 : size[2], sign = id === 'moving' && alignment === 'opposed' ? -1 : 1,
        axis = rotate(pose.rotation, [0, 0, sign]), offset = rotate(pose.rotation, [0, 0, z]), point = offset.map((value, i) => value + pose.translation[i]) as Vec3,
        engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(part.document.features)
      expect(inventory.featureErrors).toEqual([])
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('One original explicit box required')
      const source = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(source, pose)), oc = getOC(),
        analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()),
        area = owners.own(new oc.GProp_GProps()), box = owners.own(new oc.Bnd_Box())
      expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      near(volume.Mass(), size[0] * size[1] * size[2], 1e-5); near(area.Mass(), 2 * (size[0] * size[1] + size[0] * size[2] + size[1] * size[2]), 1e-5)
      oc.BRepBndLib.AddOptimal(shape.wrapped, box, false, false)
      const min = tuple(owners.own(box.CornerMin())), max = tuple(owners.own(box.CornerMax())),
        corners = [-size[0] / 2, size[0] / 2].flatMap(x => [-size[1] / 2, size[1] / 2].flatMap(y => [0, size[2]].map(z => rotate(pose.rotation, [x, y, z]).map((value, i) => value + pose.translation[i]))))
      for (let i = 0; i < 3; i++) { near(min[i], Math.min(...corners.map(value => value[i]))); near(max[i], Math.max(...corners.map(value => value[i]))) }
      const selected = owners.ownAll(ownedNativeTopology(shape, 'face')).filter(face => {
        const observed = extractAssemblyFaceSupport(face)
        return observed.kind === 'plane' && Math.hypot(...observed.normal.map((value, i) => value - axis[i])) < 1e-8 && Math.abs(dot(observed.point.map((value, i) => value - point[i]), axis)) < 1e-6
      })
      expect(selected).toHaveLength(1)
      withNativeOwners(local => {
        const adaptor = local.own(new oc.BRepAdaptor_Surface(selected[0].wrapped, false)), p = local.own(new oc.gp_Pnt()), du = local.own(new oc.gp_Vec()), dv = local.own(new oc.gp_Vec())
        expect(adaptor.GetType()).toBe(oc.GeomAbs_SurfaceType.GeomAbs_Plane); adaptor.D1(.73, .4, p, du, dv)
        const u = tuple(du), v = tuple(dv), n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
          faceSign = selected[0].wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_FORWARD ? 1 : -1
        near(faceSign * dot(n, axis) / Math.hypot(...n), 1, 1e-8); near(dot(tuple(p).map((value, i) => value - point[i]), axis), 0)
        supports.push({ point: tuple(p), normal: n.map(value => faceSign * value / Math.hypot(...n)) as Vec3 })
      })
    }
    near(dot(supports[0].normal, supports[1].normal), alignment === 'aligned' ? 1 : -1, 1e-8)
    const a = supports[0].normal, b = supports[1].normal,
      cross: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    near(Math.atan2(Math.hypot(...cross), dot(a, b)), alignment === 'aligned' ? 0 : Math.PI, 1e-8)
    return dot(supports[1].normal, supports[0].point.map((value, i) => value - supports[1].point[i]))
  })
}

it('reconstructs the original unmated two-box scene and exact local top plane identities', () => {
  expect(originalScene.solidCount).toBe(2); expect(originalScene.prototypeCount).toBe(2); near(originalScene.volume, 4920, 1e-5); near(originalScene.area, 3144, 1e-5)
  expect(originalScene.bounds).not.toBeNull(); originalScene.bounds!.min.forEach((value, i) => near(value, [-20, -15, 0][i])); originalScene.bounds!.max.forEach((value, i) => near(value, [20, 15, 24][i]))
  const first = relation().first, second = relation().second
  expect(first.kind).toBe('face'); expect(second.kind).toBe('face')
  if (first.kind !== 'face' || second.kind !== 'face') throw new Error('Original exact native top faces required')
  expect(first.body).toEqual({ bodyId: 'limit-moving-body', sourceFeatureId: 'moving-solid' }); expect(second.body).toEqual({ bodyId: 'limit-fixed-body', sourceFeatureId: 'fixed-solid' })
  near(physical(fixture()), 20)
}, 60_000)

it.each((['aligned', 'opposed'] as const).flatMap(alignment => [10, 20, 30].map(q => ({ alignment, q }))))('keeps $alignment q=$q feasible without counting a boundary as bilateral rank', ({ alignment, q }) => {
  const base = mated(alignment, q), source = serializeAssemblyDocument(base), value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(value.scopes.at(-1)!.result.rank).toBe(2); expect(value.scopes.at(-1)!.result.localDOF).toBe(4); expect(value.scopes.at(-1)!.result.status).toBe('underdefined')
    const cone = value.scopes.at(-1)!.result.evidence.groups[0].limitCone
    expect(cone?.linealityDimension).toBe(q === 20 ? 4 : 3); expect(cone?.activeBounds).toHaveLength(q === 20 ? 0 : 1)
    expect(cone?.rankRange).toEqual(q === 20 ? [2, 2] : [3, 3]); expect(cone && 'dimension' in cone).toBe(false)
    const actual = report(value); expect(actual.kind).toBe('limit-distance'); expect(actual.alignment).toBe(alignment); expect(actual.scopePath).toEqual([])
    expect(actual.limits).toEqual({ minimum: 10, maximum: 30 }); expect(actual.activity).toBe(q === 10 ? 'minimum' : q === 30 ? 'maximum' : 'interior'); expect(actual.supportOnly).toBe(true)
    expect(actual.lengthTolerance).toBe(value.checks[0].lengthTolerance)
    near(actual.coordinate, q); near(physical(validateAssemblyDocument(value.document), alignment), q); expect(value.checks.every(check => check.satisfied)).toBe(true)
    expect(serializeAssemblyDocument(base)).toBe(source)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each((['aligned', 'opposed'] as const).flatMap(alignment => [10, 20, 30].map(q => ({ alignment, q }))))('preserves explicit signed endpoint reversal for $alignment q=$q', ({ alignment, q }) => {
  const base = mated(alignment, q, 10, 30, true), value = nativeReady(prepareAssemblySolve(base))
  try { near(report(value).coordinate, alignment === 'aligned' ? -q : q); expect(report(value).limits).toEqual(alignment === 'aligned' ? { minimum: -30, maximum: -10 } : { minimum: 10, maximum: 30 }); near(physical(validateAssemblyDocument(value.document), alignment), q); expect(value.scopes.at(-1)!.result.rank).toBe(2) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([0, 40])('restores an initially violated signed distance q=%i without changing saved bounds', q => {
  const base = mated('aligned', q), value = nativeReady(prepareAssemblySolve(base))
  try { near(report(value).coordinate, q === 0 ? 10 : 30); near(physical(validateAssemblyDocument(value.document)), report(value).coordinate); expect(value.document.mates).toEqual(base.mates); expect(value.scopes.at(-1)!.result.rank).toBe(2) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([Math.PI / 6, Math.PI / 3])('restores nonparallel native planes at initial angle %f without demanding an inconsistent exact linearized vector step', angle => {
  const base = mated(); base.occurrences[1].pose.rotation = [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)]
  const value = nativeReady(prepareAssemblySolve(base))
  try { const q = physical(validateAssemblyDocument(value.document)); expect(q).toBeGreaterThanOrEqual(10 - 1e-6); expect(q).toBeLessThanOrEqual(30 + 1e-6); near(report(value).coordinate, q); expect(value.scopes.at(-1)!.result.rank).toBe(2) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([0, 20])('keeps equal bounds %i as two inequalities and reports both without adding a bilateral distance row', q => {
  const base = mated('aligned', q, q, q), value = nativeReady(prepareAssemblySolve(base))
  try { expect(report(value).activity).toBe('both'); expect(report(value).limits).toEqual({ minimum: q, maximum: q }); near(physical(validateAssemblyDocument(value.document)), q); expect(value.scopes.at(-1)!.result.rank).toBe(2); expect(value.scopes.at(-1)!.result.localDOF).toBe(4); expect(value.document.mates[0].type).toBe('limit-distance') }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([10, 20, 30])('retains common rigid gauge and bilateral DOF10 for floating q=%i', q => {
  const base = mated('aligned', q); base.occurrences[0].fixed = false; const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.localDOF).toBe(10); expect(value.scopes.at(-1)!.result.rank).toBe(2); expect(value.scopes.at(-1)!.result.evidence.groups[0].unanchored).toBe(true); near(physical(validateAssemblyDocument(value.document)), q) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([0, 20, 40])('checks a completely fixed native interval q=%i without publishing violated geometry', q => {
  const base = mated('aligned', q); base.occurrences[1].fixed = true; const before = serializeAssemblyDocument(base), result = prepareAssemblySolve(base)
  if (q !== 20) { expect(result.status).toBe('rejected'); expect('document' in result || 'limitDistances' in result).toBe(false) }
  else { const value = nativeReady(result); try { expect(value.scopes.at(-1)!.result.rank).toBe(0); expect(value.scopes.at(-1)!.result.localDOF).toBe(0); near(report(value).coordinate, 20) } finally { discardAssemblySolvePreview(value) } }
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each([10, 20, 30])('accepts an exact local driver at q=%i while keeping the undriven bilateral mobility separate', q => {
  const base = mated(), pose = structuredClone(base.occurrences[1].pose); pose.translation[2] = q + 2
  const value = nativeReady(prepareAssemblyMovePreview(base, { component: component(base), pose }))
  try { near(report(value).coordinate, q); expect(value.movement!.temporaryAnchor).toBe(true); near(value.movement!.lengthResidual, 0); near(physical(validateAssemblyDocument(value.document)), q)
    const natural = nativeReady(prepareAssemblySolve(validateAssemblyDocument(value.document))); try { expect(natural.scopes.at(-1)!.result.localDOF).toBe(4) } finally { discardAssemblySolvePreview(natural) }
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each([0, 40])('rejects strict local target q=%i atomically instead of clamping the driver', q => {
  const base = mated(), pose = structuredClone(base.occurrences[1].pose), source = serializeAssemblyDocument(base); pose.translation[2] = q + 2
  const result = prepareAssemblyMovePreview(base, { component: component(base), pose })
  expect(result.status).toBe('rejected'); expect('document' in result || 'limitDistances' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(source)
}, 60_000)

it.each([{ start: 20, target: 40, expected: 30 }, { start: 20, target: 0, expected: 10 },
  { start: 10, target: 20, expected: 20 }, { start: 30, target: 20, expected: 20 }])('projects original q=$start toward $target to $expected and preserves secondary attitude', spec => {
  const base = mated('aligned', spec.start), pose = structuredClone(base.occurrences[1].pose), source = serializeAssemblyDocument(base)
  pose.translation = [3, 4, spec.target + 2]
  const value = nativeReady(prepareAssemblyDragPreview(base, { component: component(base), pose, mode: 'translate' }))
  try {
    near(report(value).coordinate, spec.expected); near(physical(validateAssemblyDocument(value.document)), spec.expected)
    const resolved = value.document.occurrences[1].pose; near(resolved.translation[0], 3); near(resolved.translation[1], 4); near(resolved.translation[2], spec.expected + 2)
    near(Math.abs(dot(resolved.rotation, pose.rotation)), 1, 1e-8); near(value.projection!.positionResidual, Math.abs(spec.target - spec.expected))
    const kkt = value.projection!.evidence.inequalityProjection
    expect(kkt?.primary.certified).toBe(true); expect(Number.isFinite(kkt?.primary.stationarityNorm)).toBe(true)
    expect(Number.isFinite(kkt?.primary.primalResidual)).toBe(true); expect(Number.isFinite(kkt?.primary.complementarityResidual)).toBe(true)
    if (kkt?.secondary) expect(kkt.secondary.certified).toBe(true)
    expect(value.projection!.temporaryAnchor).toBe(false); expect(value.scopes.at(-1)!.result.rank).toBe(2); expect(value.scopes.at(-1)!.result.localDOF).toBe(4)
    expect(serializeAssemblyDocument(base)).toBe(source)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('does not inherit the constant-rotation contact-stop allowlist', () => {
  const base = mated(), before = serializeAssemblyDocument(base), result = prepareAssemblyTranslationPreview(base, { component: component(base), translation: [0, 0, 25] })
  expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('relaciones')
  expect('translation' in result || 'limitDistances' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each(['suppressed', 'deleted', 'hidden'] as const)('keeps declaration/report semantics distinct when the interval is %s', mode => {
  const base = mated(); if (mode === 'suppressed') base.mates[0].suppressed = true; if (mode === 'deleted') base.mates = []; if (mode === 'hidden') base.occurrences[1].visible = false
  const value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.scopes.at(-1)!.result.localDOF).toBe(mode === 'hidden' ? 4 : 6); expect(value.limitDistances?.length ?? 0).toBe(mode === 'hidden' ? 1 : 0); expect(value.document.mates).toEqual(base.mates); expect(buildAssemblyScene(validateAssemblyDocument(value.document)).solidCount).toBe(2) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('keeps fresh limit reports detached through Cancel, authenticated Apply, one Undo/Redo and native reopen', () => {
  const base = fixture(), proposed = mated(), source = serializeAssemblyDocument(base), session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(base)
  try {
    const canceled = ready(session.prepare(base, proposed)); session.discard(canceled.token); expect(() => session.apply(base, canceled.token)).toThrow('disponible'); expect(history.canUndo).toBe(false)
    const value = ready(session.prepare(base, proposed)), exact = structuredClone(value.document), originalReport = structuredClone(value.limitDistances)
    value.limitDistances![0].coordinate = 999; value.limitDistances![0].limits.maximum = 1000; value.limitDistances![0].activity = 'maximum'; value.limitDistances![0].scopePath.push('caller-forged')
    value.document.occurrences[1].pose.translation[2] = 999; value.document.name = 'caller-forged'
    const applied = session.apply(base, value.token).document; expect(applied).toEqual(exact); expect('limitDistances' in applied).toBe(false)
    history.commitDocument(applied); expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied); expect(history.canRedo).toBe(false)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    expect(fresh.limitDistances).toEqual(originalReport); expect(fresh.document.mates).toEqual(applied.mates); near(physical(fresh.document), 20); session.apply(reopened, fresh.token)
    expect(serializeAssemblyDocument(base)).toBe(source)
  } finally { session.discard() }
}, 60_000)

it('rejects a cloned native capability and a same-revision changed source without committing history', () => {
  const base = mated(), history = new AssemblyDocumentHistory(base), value = nativeReady(prepareAssemblySolve(base))
  try {
    expect(() => applyAssemblySolvePreview(history, structuredClone(value))).toThrow('vista previa')
    const changed = validateAssemblyDocument(base); changed.name += ' changed'; const current = new AssemblyDocumentHistory(changed)
    expect(() => applyAssemblySolvePreview(current, value)).toThrow(); expect(current.canUndo).toBe(false); expect(history.current).toEqual(base)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(['foreign-body', 'foreign-definition', 'stale-key', 'missing-owner', 'suppressed-owner', 'axis-purpose'] as const)('withholds native interval authority for %s', fault => {
  const base = mated(), mate = base.mates[0]
  if (mate.type !== 'limit-distance' || mate.first.kind !== 'face') throw new Error('Original exact plane interval required')
  if (fault === 'foreign-body') mate.first.body = { bodyId: 'foreign', sourceFeatureId: 'moving-solid' }
  if (fault === 'foreign-definition') mate.first.component.definition.revision = 'missing'
  if (fault === 'stale-key') mate.first.face.key += '-stale'
  if (fault === 'missing-owner') mate.first.component.occurrencePath = ['missing']
  if (fault === 'suppressed-owner') base.occurrences[1].suppressed = true
  if (fault === 'axis-purpose') Object.assign(mate.first, { support: 'axis' })
  const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('document' in result || 'limitDistances' in result).toBe(false)
}, 60_000)

it.each(['cylinder', 'sphere'] as const)('rejects a genuine native %s selected face falsely declared as a plane before numerical admission', kind => {
  const base = kind === 'sphere' ? validateAssemblyDocument(sphereOriginal) : createAssemblyExample(), scene = buildAssemblyScene(base),
    selected = kind === 'sphere' ? face(scene, 'moving', value => value.sphereSurface !== undefined) : face(scene, 'left', value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - 2) < 1e-9)
  base.mates = [{ id: 'false-plane-purpose', name: 'Original invalid analytic purpose', type: 'limit-distance', suppressed: false, alignment: 'aligned',
    first: { kind: 'face', ...structuredClone(selected.selection), support: 'plane' }, second: cap(scene, kind === 'sphere' ? 'fixed' : 'plate', 4), limits: { minimum: 10, maximum: 30 } }]
  const before = serializeAssemblyDocument(base), actual = numerical.solveRigidMates, solver = vi.spyOn(numerical, 'solveRigidMates').mockImplementation(actual)
  try { const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect(solver).not.toHaveBeenCalled(); expect('document' in result || 'limitDistances' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before) }
  finally { solver.mockRestore() }
}, 60_000)

it('authenticates plane witness identity/lifetime and does not trust mutated scene metadata as current coordinates', () => {
  const base = mated(), scene = buildAssemblyScene(base), reference = cap(scene, 'moving', 2), snapshot = new AssemblyGeometrySnapshot(base), other = new AssemblyGeometrySnapshot(base)
  try {
    const witness = snapshot.resolveReference(base, reference); snapshot.assertWitness(witness, base)
    expect(() => snapshot.assertWitness(structuredClone(witness), base)).toThrow(); expect(() => other.assertWitness(witness, base)).toThrow()
    const selected = face(scene, 'moving', value => value.support?.kind === 'plane' && value.support.normal[2] > .99)
    if (selected.support?.kind !== 'plane') throw new Error('Original scene plane required')
    selected.support.point[2] = 999; selected.support.normal[2] = -1
    const fresh = snapshot.resolveReference(base, reference)
    if (fresh.kind !== 'support' || fresh.localSupport.kind !== 'plane') throw new Error('Fresh native plane required')
    near(fresh.localSupport.point[2], 2, 1e-8); expect(fresh.localSupport.normal).toEqual([0, 0, 1]); snapshot.dispose(); expect(() => snapshot.assertWitness(witness, base)).toThrow()
  } finally { snapshot.dispose(); other.dispose() }
}, 60_000)

it('preserves exact plane purpose while manually repairing a new native depth revision', () => {
  const base = mated(), part = base.definitions.find(value => value.id === 'limit-distance-moving')!
  if (part.kind !== 'part') throw new Error('Original moving box required')
  const replacement = structuredClone(part.document), extrude = replacement.features[1]
  if (extrude.type !== 'extrude') throw new Error('Original independent depth required'); extrude.depth = 4
  const review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, replacement, 'r2')
  expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].status).toBe('needs-repair'); expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  const repaired = repairAssemblyEndpoint(review.document, review.endpoints[0].locator, cap(review.scene, 'moving', 4)), session = new AssemblyWorkerSession()
  try {
    const value = ready(session.prepare(base, repaired)); near(physical(value.document, 'aligned', [], 4), report(value).coordinate)
    expect(report(value).limits).toEqual({ minimum: 10, maximum: 30 }); const applied = session.apply(base, value.token).document
    expect(applied.definitions.find(value => value.id === part.id && value.revision === 'r1')).toEqual(part)
    const fresh = ready(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(applied)))); expect(fresh.document.mates).toEqual(applied.mates); near(physical(fresh.document, 'aligned', [], 4), report(fresh).coordinate)
  } finally { session.discard() }
}, 60_000)

it.each([false, true])('handles duplicate/opposite ordered native intervals with incompatible=%s', incompatible => {
  const base = mated(), other = relation('aligned', incompatible ? 40 : 10, incompatible ? 50 : 30, true); other.id = 'other-interval'; base.mates.push(other)
  const before = serializeAssemblyDocument(base), result = prepareAssemblySolve(base)
  if (incompatible) { expect(result.status).toBe('rejected'); expect('document' in result).toBe(false) }
  else { const value = nativeReady(result); try { expect(value.limitDistances).toHaveLength(2); expect(value.scopes.at(-1)!.result.rank).toBe(2); near(value.limitDistances![0].coordinate, 20); near(value.limitDistances![1].coordinate, -20); near(physical(validateAssemblyDocument(value.document)), 20) } finally { discardAssemblySolvePreview(value) } }
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each([false, true])('checks same-owner plane intervals without inventing a rigid-body lock (impossible=%s)', impossible => {
  const base = fixture(); base.occurrences = [base.occurrences[1]]; base.occurrences[0].fixed = false
  base.mates = [{ id: 'same-owner', name: 'Original two planes on one box', type: 'limit-distance', suppressed: false, alignment: 'opposed',
    first: cap(originalScene, 'moving', 2), second: cap(originalScene, 'moving', 0, -1), limits: impossible ? { minimum: 1, maximum: 2 } : { minimum: -3, maximum: -1 } }]
  const result = prepareAssemblySolve(base)
  if (impossible) { expect(result.status).toBe('rejected'); expect('document' in result).toBe(false) }
  else { const value = nativeReady(result); try { expect(value.scopes.at(-1)!.result.rank).toBe(0); expect(value.scopes.at(-1)!.result.localDOF).toBe(6); near(report(value).coordinate, -2) } finally { discardAssemblySolvePreview(value) } }
}, 60_000)

it('admits an oriented principal-plane endpoint while retaining the exact moving face reference', () => {
  const base = mated(); base.occurrences[1].pose.translation[2] = 18
  const mate = base.mates[0]; if (mate.type !== 'limit-distance') throw new Error('Actual interval required')
  mate.second = { kind: 'principal-plane', component: null, plane: 'XY' }
  const value = nativeReady(prepareAssemblySolve(base))
  try { near(report(value).coordinate, 20); expect(value.scopes.at(-1)!.result.localDOF).toBe(4); expect(value.document.mates).toEqual(base.mates) }
  finally { discardAssemblySolvePreview(value) }
}, 60_000)

function nested(hidden = false): AssemblyDocument {
  const base = mated(), child: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'limit-reused-child', revision: 'r1', name: 'Original shared local signed interval',
    createdAt: base.createdAt, updatedAt: base.updatedAt, occurrences: structuredClone(base.occurrences), mates: structuredClone(base.mates) }
  base.definitions.push(child); base.mates = []; base.occurrences = [
    { id: 'A', name: 'Original Rz90 parent', definition: { id: child.id, revision: child.revision }, fixed: true, suppressed: false, visible: !hidden,
      pose: { rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], translation: [100, 7, -9] } },
    { id: 'B', name: 'Original Rx90 parent', definition: { id: child.id, revision: child.revision }, fixed: true, suppressed: false, visible: true,
      pose: { rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2], translation: [-70, 11, 4] } }]
  return validateAssemblyDocument(base)
}
it.each([false, true])('verifies every reused common rigid expansion with hidden parent=%s and one shared local configuration', hidden => {
  const base = nested(hidden), value = nativeReady(prepareAssemblySolve(base))
  try { expect(value.limitDistances?.map(item => item.scopePath)).toEqual([['A'], ['B']]); expect(value.limitDistances?.every(item => item.activity === 'interior')).toBe(true)
    for (const prefix of [['A'], ['B']]) near(physical(validateAssemblyDocument(value.document), 'aligned', prefix), 20)
    const scene = buildAssemblyScene(validateAssemblyDocument(value.document)); expect(scene.solidCount).toBe(4); expect(scene.prototypeCount).toBe(2); near(scene.volume, 9840, 1e-5); near(scene.area, 6288, 1e-5)
    const child = value.scopes.find(item => item.definition.id === 'limit-reused-child')!; expect(child.result.localDOF).toBe(4); expect(child.result.rank).toBe(2)
  } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it.each(['chain', 'bounds'] as const)('rejects lost precision in original %s terms before publishing a native interval', kind => {
  const base = kind === 'chain' ? nested() : mated()
  if (kind === 'chain') {
    base.occurrences[0].pose.translation[0] = 1e16
    const child = base.definitions.find(value => value.id === 'limit-reused-child')!
    if (child.kind !== 'assembly') throw new Error('Original child required'); child.occurrences[1].pose.translation[0] = 1
    const snapshot = new AssemblyGeometrySnapshot(base)
    try { const mate = child.mates[0]; if (mate.type !== 'limit-distance') throw new Error('Original child interval required')
      const witness = snapshot.resolveReference(base, mate.first, ['A']); expect(assemblyEndpointPlacementArithmetic(witness, base).placementSum).toBeGreaterThanOrEqual(1e16)
    } finally { snapshot.dispose() }
  } else { const mate = base.mates[0]; if (mate.type !== 'limit-distance') throw new Error('Original interval required'); mate.limits = { minimum: -1e16, maximum: 1e16 } }
  const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('precisionLimit'); expect('document' in result || 'limitDistances' in result).toBe(false)
  // Large child scopes can reject under the earlier absolute-coordinate guard;
  // this regression does not assert that the preceding source falsely passed.
}, 60_000)

it('locates actual moving material independently after a strict native boundary move', () => {
  const base = mated(), pose = structuredClone(base.occurrences[1].pose); pose.translation = [3, -2, 32]
  const value = nativeReady(prepareAssemblyMovePreview(base, { component: component(base), pose }))
  try { withNativeOwners(owners => {
    const item = leaf(validateAssemblyDocument(value.document), ['moving']), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
    const inventory = engine.rebuildForAssemblyReferences(item.part.document.features)
    if (inventory.kind !== 'explicit') throw new Error('Original material body required')
    const placed = owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), item.pose)),
      probe = owners.own(makeBox([2.9, -2.1, 32.9], [3.1, -1.9, 33.1])), common = owners.own(bodyBoolean('common', placed, probe)), properties = owners.own(new (getOC().GProp_GProps)())
    getOC().BRepGProp.VolumeProperties(common.wrapped, properties, 1e-10, false, false); near(properties.Mass(), .008, 1e-8)
  }) } finally { discardAssemblySolvePreview(value) }
}, 60_000)

it('observes both exact native planes again after the real solve before emitting the transient interval report', () => {
  const base = mated(); let solved = false; const points: number[] = [], actualSolve = numerical.solveRigidMates, actualQuery = CadEngine.prototype.inspectCurrentFaceSupport
  const solver = vi.spyOn(numerical, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) { const result = actualQuery.apply(this, args); if (solved && result.kind === 'plane') points.push(result.point[2]); return result })
  try { const value = nativeReady(prepareAssemblySolve(base)); try { expect(points).toEqual([2, 4]); near(report(value).coordinate, 20) } finally { discardAssemblySolvePreview(value) } }
  finally { query.mockRestore(); solver.mockRestore() }
}, 60_000)

it.each([0, 1])('withholds final interval authority on the actual endpoint%i query failure', endpoint => {
  const base = mated(), source = serializeAssemblyDocument(base); let solved = false, calls = 0
  const actualSolve = numerical.solveRigidMates, actualQuery = CadEngine.prototype.inspectCurrentFaceSupport
  const solver = vi.spyOn(numerical, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) { const result = actualQuery.apply(this, args); if (solved && calls++ === endpoint) throw new Error('Original final native plane failure'); return result })
  try { const result = prepareAssemblySolve(base); expect(calls).toBe(endpoint + 1); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('verification'); expect('document' in result || 'limitDistances' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(source) }
  finally { query.mockRestore(); solver.mockRestore() }
}, 60_000)

function observePlanes<T>(patch: (owner: NativeOwner, query: number, index: number) => void, operation: () => T): T {
  const arena = ownership.withNativeOwners; let query = 0
  const implementation: typeof arena = <R>(work: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => arena(owners => {
    if (context === 'Assembly face support extraction or release failed.') {
      const current = query++, own = owners.own.bind(owners); let index = 0
      owners.own = <V extends NativeOwner>(value: V): V => { patch(value, current, index++); return own(value) }
    }
    return work(owners)
  }, retained, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { return operation() } finally { spy.mockRestore() }
}
it.each([0, 1].flatMap(endpoint => [0, 1, 2, 3, 4, 5].map(owner => ({ endpoint, owner }))))('drains every real plane owner once and withholds the pair when endpoint$endpoint owner$owner release fails', spec => {
  const base = mated(), released: number[] = [], failure = new Error('Original native plane release failure')
  const result = observePlanes((owner, endpoint, index) => {
    if (endpoint !== spec.endpoint) return
    const remove = owner.delete.bind(owner); Object.defineProperty(owner, 'delete', { configurable: true, value: () => { released.push(index); remove(); if (index === spec.owner) throw failure } })
  }, () => prepareAssemblySolve(base))
  expect(result.status).toBe('rejected'); expect('document' in result || 'limitDistances' in result).toBe(false); expect(released).toEqual([5, 4, 3, 2, 1, 0])
}, 60_000)

const errors = (error: unknown): unknown[] => [error, ...(error instanceof AggregateError ? [...error.errors].flatMap(errors) : [])]
it('preserves the second-plane primary query and release failures instead of reporting a partial interval', () => {
  const base = mated(), primary = new Error('Original plane Y query failure'), cleanup = new Error('Original plane Y release failure'), actual = CadEngine.prototype.inspectCurrentFaceSupport
  let observed: unknown, released = 0
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) { try { return actual.apply(this, args) } catch (error) { observed = error; throw error } })
  try {
    const result = observePlanes((owner, endpoint, index) => {
      if (endpoint !== 1 || index !== 5) return
      const point = owner as NativeOwner & { X(): number }, read = point.X.bind(point), remove = point.delete.bind(point)
      Object.defineProperty(point, 'X', { configurable: true, value: () => { read(); throw primary } }); Object.defineProperty(point, 'delete', { configurable: true, value: () => { released++; remove(); throw cleanup } })
    }, () => prepareAssemblySolve(base))
    expect(result.status).toBe('rejected'); expect(observed).toBeInstanceOf(NativeCleanupError); expect(errors(observed)).toContain(primary); expect(errors(observed)).toContain(cleanup); expect(released).toBe(1); expect('limitDistances' in result).toBe(false)
  } finally { query.mockRestore() }
}, 60_000)

it('rejects reentrant current-generation replacement after genuine plane-owner release and permits a separate fresh rebuild', () => {
  const base = mated(), part = base.definitions.find(value => value.id === 'limit-distance-fixed')!
  if (part.kind !== 'part') throw new Error('Original fixed box required')
  const actual = CadEngine.prototype.inspectCurrentFaceSupport; let engine: CadEngine | undefined, calls = 0, entered = false
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, ...args) { if (calls++ === 1) engine = this; return actual.apply(this, args) })
  try {
    const result = observePlanes((owner, endpoint, index) => {
      if (endpoint !== 1 || index !== 5) return
      const remove = owner.delete.bind(owner); Object.defineProperty(owner, 'delete', { configurable: true, value: () => { remove(); if (!entered) { entered = true; engine!.rebuildForAssemblyReferences(part.document.features) } } })
    }, () => prepareAssemblySolve(base))
    expect(entered).toBe(true); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.message).toContain('geometría cambió'); expect('limitDistances' in result).toBe(false)
  } finally { query.mockRestore() }
  const fresh = nativeReady(prepareAssemblySolve(base)); discardAssemblySolvePreview(fresh)
}, 60_000)

it.each(['prepare', 'apply'].flatMap(stage => ['mesh', 'cleanup'].map(fault => ({ stage, fault }))))('retires the session token on $stage final scene $fault failure after actual native work', spec => {
  const base = fixture(), proposed = mated(), session = new AssemblyWorkerSession(), prior = ready(session.prepare(base, spec.stage === 'apply' ? proposed : base)), source = serializeAssemblyDocument(base), failure = new Error('Original interval scene failure')
  const arena = ownership.withNativeOwners, actualMesh = Shape.prototype.mesh; let reached = false, releases = 0
  const implementation: typeof arena = <R>(work: (owners: NativeOwners) => R, retained: (result: R) => readonly NativeOwner[] = () => [], context?: string): R => arena(owners => {
    if (spec.fault === 'cleanup' && context === 'Assembly scene placement, mesh or release failed.') {
      const own = owners.own.bind(owners); owners.own = <V extends NativeOwner>(value: V): V => {
        if (!reached && 'wrapped' in value && 'asShape3D' in value) { reached = true; const remove = value.delete.bind(value); Object.defineProperty(value, 'delete', { configurable: true, value: () => { releases++; remove(); throw failure } }) }
        return own(value)
      }
    }
    return work(owners)
  }, retained, context)
  const mesh = vi.spyOn(Shape.prototype, 'mesh').mockImplementation(function (this: AnyShape, ...args) { const result = actualMesh.apply(this, args); if (spec.fault === 'mesh') { reached = true; throw failure } return result }),
    own = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try { expect(() => spec.stage === 'apply' ? session.apply(base, prior.token) : session.prepare(base, proposed)).toThrow(); expect(reached).toBe(true); expect(releases).toBe(spec.fault === 'cleanup' ? 1 : 0); expect(() => session.apply(base, prior.token)).toThrow('disponible'); expect(serializeAssemblyDocument(base)).toBe(source) }
  finally { own.mockRestore(); mesh.mockRestore(); session.discard() }
  const fresh = ready(session.prepare(base, proposed)); expect(fresh.limitDistances).toHaveLength(1); session.discard()
}, 60_000)

function axis(scene: AssemblyScene, id: string, radius: number, x?: number): AssemblyAxisReference {
  const selected = face(scene, id, value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - radius) < 1e-9 && (x === undefined || Math.abs(value.support.point[0] - x) < 1e-9)), reference = assemblySceneFaceReference(selected)
  if (!reference || reference.support !== 'axis') throw new Error('Actual native mechanical cylinder required')
  return { ...reference, support: 'axis' }
}
function mechanism(kind: 'gear' | 'screw' | 'rack') {
  const base = kind === 'gear' ? createAssemblyExample() : validateAssemblyDocument(kind === 'screw' ? screwOriginal : rackOriginal), driver = kind === 'gear' ? 'left' : kind === 'screw' ? 'shaft' : 'pinion'
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) base.occurrences.find(value => value.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = buildAssemblyScene(base), bearings: AssemblyMate[] = []
  if (kind === 'gear') for (const [id, x] of [['left', -10], ['right', 10]] as const) bearings.push(
    { id: id + '-axis', name: 'Original pin bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(scene, id, 2), second: axis(scene, 'plate', 3, x) },
    { id: id + '-cap', name: 'Original pin cap', type: 'coincident', suppressed: false, alignment: 'aligned', first: cap(scene, id, 12), second: cap(scene, 'plate', 4) })
  else bearings.push(
    { id: 'bearing', name: 'Original motor bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(scene, driver, 2), second: axis(scene, 'ground', 3) },
    { id: 'axial', name: 'Original signed axial datum', type: 'distance', suppressed: false, alignment: 'aligned', distance: 18, first: cap(scene, driver, 30), second: cap(scene, 'ground', 4) },
    { id: 'guide', name: 'Original nonrotating follower guide', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: [0, 0, 0, 1],
      first: axis(scene, kind === 'screw' ? 'nut' : 'rack', 2.5), second: axis(scene, kind === 'screw' ? 'ground' : 'guide', kind === 'screw' ? 3 : 2) })
  base.mates = bearings; const session = new AssemblyWorkerSession(), initial = ready(session.prepare(base))
  const capture = kind === 'gear' ? session.captureGear(base, initial.token, { first: axis(initial.scene, 'left', 2), second: axis(initial.scene, 'right', 2), carrier: component(base, 'plate'), ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original gear with interval' })
    : kind === 'screw' ? session.captureScrew(base, initial.token, { first: axis(initial.scene, 'shaft', 2), second: axis(initial.scene, 'nut', 2.5), lead: 2, reverse: false, alignment: 'aligned', name: 'Original screw with interval' })
      : session.captureRackPinion(base, initial.token, { first: axis(initial.scene, 'pinion', 2), second: (() => {
        const edges = initial.scene.bodies.find(body => body.component.occurrencePath[0] === 'rack')!.edges!, edge = edges.find(value => value.support?.kind === 'line' && value.support.axis[2] > .99 && Math.abs(Math.abs(value.support.point[0]) - 5) < 1e-9 && Math.abs(Math.abs(value.support.point[1]) - 5) < 1e-9)
        if (!edge) throw new Error('Original native rack LINE required'); return assemblySceneEdgeReference(edge)!
      })(), conversion: { mode: 'diameter', override: null }, reverse: false, name: 'Original rack with interval' })
  let document = session.apply(base, ready(capture).token).document
  const current = buildAssemblyScene(document), proposed = validateAssemblyDocument(document), q = kind === 'gear' ? 0 : 18
  proposed.mates.push({ id: 'mechanical-interval', name: 'Original redundant axial interval', type: 'limit-distance', suppressed: false, alignment: 'aligned',
    first: cap(current, driver, kind === 'gear' ? 12 : 30), second: cap(current, kind === 'gear' ? 'plate' : 'ground', 4), limits: { minimum: q - 1, maximum: q + 1 } })
  const supported = ready(session.prepare(document, proposed)); expect(supported.scopes.at(-1)!.result.localDOF).toBe(1); document = session.apply(document, supported.token).document
  return { session, document, driver, q }
}

it.each(['gear', 'screw', 'rack'] as const)('preserves actual native %s winding and its interval through twelve verified +720 stations, Apply and reopen', kind => {
  const { session, document, driver, q } = mechanism(kind), original = serializeAssemblyDocument(document), occurrence = document.occurrences.find(value => value.id === driver)!
  try {
    const value = ready(session.moveMotion(document, { component: component(document, driver), translation: [...occurrence.pose.translation], rotation: { axis: 2, angle: 4 * Math.PI } }))
    expect(value.motion!.verifiedStations).toBe(12); expect(value.motion!.sampledOnly).toBe(true); near(value.motion!.evaluatedAngle, 4 * Math.PI, 1e-8)
    const measured = report(value); near(measured.coordinate, q); expect(measured.activity).toBe('interior'); expect(measured.mateId).toBe('mechanical-interval')
    expect(value.checks).toHaveLength(kind === 'gear' ? 6 : 5); expect(value.checks.every(check => check.satisfied)).toBe(true); expect(value.scopes.every(scope => scope.result.evidence.groups.every(group => group.seededConstraintIds.length === 0))).toBe(true)
    const winding = value.document.mates.find(mate => mate.type === (kind === 'rack' ? 'rack-pinion' : kind))!
    if (winding.type === 'gear') { near(winding.angles.first, -4 * Math.PI, 1e-8); near(winding.angles.second, 2 * Math.PI, 1e-8) }
    else if (winding.type === 'screw' || winding.type === 'rack-pinion') near(winding.angle, -4 * Math.PI, 1e-8)
    else throw new Error('Original accepted lifted mechanical state required')
    if (kind === 'screw') near(value.document.occurrences.find(item => item.id === 'nut')!.pose.translation[2], 14)
    if (kind === 'rack') near(value.document.occurrences.find(item => item.id === 'rack')!.pose.translation[0], -10 - 8 * Math.PI)
    const marker = face(value.scene, driver, item => item.worldSupport?.kind === 'cylinder' && Math.abs(item.worldSupport.radius - .25) < 1e-9).worldSupport
    if (marker?.kind !== 'cylinder') throw new Error('Actual independently rebuilt marker bore required')
    near(marker.point[0], kind === 'gear' ? -9 : 1); near(marker.point[1], 0)
    expect(value.scene.solidCount).toBe(kind === 'rack' ? 4 : 3); expect(value.scene.prototypeCount).toBe(kind === 'gear' ? 2 : kind === 'screw' ? 3 : 4)
    near(value.scene.volume, kind === 'gear' ? 4800 + 45 * Math.PI / 2 : kind === 'screw' ? 5400 + 357 * Math.PI / 8 : 10800 + 217 * Math.PI / 8, 1e-5)
    near(value.scene.area, kind === 'gear' ? 2960 + 543 * Math.PI / 4 : kind === 'screw' ? 3400 + 1331 * Math.PI / 8 : 5560 + 6115 * Math.PI / 8, 1e-5)
    withNativeOwners(owners => {
      const item = leaf(value.document, [driver]), engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(item.part.document.features); if (inventory.kind !== 'explicit') throw new Error('Original driver solid required')
      const shape = owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), item.pose)), oc = getOC(), analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      near(volume.Mass(), kind === 'gear' ? 189 * Math.PI / 4 : 945 * Math.PI / 8, 1e-5); near(area.Mass(), kind === 'gear' ? 495 * Math.PI / 8 : 1143 * Math.PI / 8, 1e-5)
    })
    const applied = session.apply(document, value.token).document, reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    expect(fresh.scopes.at(-1)!.result.localDOF).toBe(1); expect(fresh.document.mates).toEqual(applied.mates); near(report(fresh).coordinate, q); session.apply(reopened, fresh.token)
    expect(serializeAssemblyDocument(document)).toBe(original)
  } finally { session.discard() }
}, 60_000)

it.each((['gear', 'screw', 'rack'] as const).flatMap(kind => [false, true].map(passive => ({ kind, passive }))))('rolls back incompatible native interval restoration with $kind lift tracking (passive=$passive)', spec => {
  const { session, document } = mechanism(spec.kind)
  try {
    const mechanism = document.mates.find(mate => mate.type === (spec.kind === 'rack' ? 'rack-pinion' : spec.kind))!; mechanism.suppressed = spec.passive
    const proposed = validateAssemblyDocument(document), interval = proposed.mates.find(mate => mate.type === 'limit-distance')!
    if (interval.type !== 'limit-distance') throw new Error('Original interval required'); interval.limits = { minimum: 40, maximum: 50 }
    const before = serializeAssemblyDocument(document), intent = serializeAssemblyDocument(proposed), captured = structuredClone(mechanism), actual = numerical.solveRigidMates, results: ReturnType<typeof actual>[] = []
    const solver = vi.spyOn(numerical, 'solveRigidMates').mockImplementation((problem, options) => { const result = actual(problem, options); results.push(result); return result })
    try {
      const rejected = session.prepare(document, proposed); expect(results.length).toBeGreaterThan(0); expect(results.some(result => result.evidence.groups.length > 0)).toBe(true)
      expect(results.every(result => result.evidence.groups.every(group => group.seededConstraintIds.length === 0))).toBe(true)
      expect(rejected.status).toBe('rejected'); expect('document' in rejected || 'token' in rejected || 'limitDistances' in rejected).toBe(false)
      expect(mechanism).toEqual(captured); expect(serializeAssemblyDocument(document)).toBe(before); expect(serializeAssemblyDocument(proposed)).toBe(intent)
    } finally { solver.mockRestore() }
  } finally { session.discard() }
}, 60_000)

it('honestly rejects violated native interval restoration with a zero iteration budget', () => {
  const base = mated('aligned', 0), result = prepareAssemblySolve(base, { solver: { maxIterations: 0, maxSeedPasses: 0 } })
  expect(result.status).toBe('rejected'); expect('document' in result || 'limitDistances' in result).toBe(false)
  if (result.status === 'rejected') expect(result.scopes.at(-1)!.result.iterations).toBe(0)
}, 60_000)
