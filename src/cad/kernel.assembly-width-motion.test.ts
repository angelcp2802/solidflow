import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import fixture from './fixtures/assembly-width-original.json'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyDocument, type AssemblyPlaneReference } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import type { RigidPose } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyPreviewReply } from './kernel.assembly-types'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { withNativeOwners } from './kernel.native-ownership'
import { ownedNativeTopology } from './kernel.native-topology'
import * as widthMeasurement from './kernel.assembly-width'
import * as translationModel from '../model/assemblyTranslation'
import * as tracing from './kernel.assembly-translation'
import type { Vec3 } from './kernel.types'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)
const near = (actual: number, expected: number, tolerance = 1e-6) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const vector = (actual: readonly number[], expected: readonly number[], tolerance = 1e-6) => {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, axis) => near(value, expected[axis], tolerance))
}
const component = { occurrencePath: ['d'], definition: { id: 'original-width-box', revision: 'r1' } }
const pose = (translation: Vec3, angle = 0): RigidPose => ({ translation, rotation: [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)] })
function ready(value: AssemblyPreviewReply) {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw Error(value.message)
  return value
}
function original(): AssemblyDocument {
  const document = validateAssemblyDocument(fixture)
  // This motion starts centered; author the four actual native faces, not an
  // analytical stand-in or a face index copied from another build.
  document.occurrences[3].pose.translation = [0, 0, 0]
  const scene = buildAssemblyScene(document)
  const plane = (id: string, sign: number): AssemblyPlaneReference => {
    const faces = scene.bodies.filter(body => body.component.occurrencePath.at(-1) === id).flatMap(body => body.faces)
      .filter(face => face.support?.kind === 'plane' && face.support.normal[0] * sign > .999)
    expect(faces).toHaveLength(1)
    return { ...assemblySceneFaceReference(faces[0])!, support: 'plane' }
  }
  document.mates = [{ id: 'width', name: 'Original centered motion planes', type: 'width', mode: 'centered', suppressed: false,
    width: [plane('a', -1), plane('b', 1)], tab: [plane('c', -1), plane('d', 1)],
    widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned' }]
  return validateAssemblyDocument(document)
}
function supportReport(value: Extract<AssemblyPreviewReply, { status: 'ready' }>): void {
  expect(value.widthCentered).toHaveLength(1)
  const report = value.widthCentered![0]
  expect(report).toMatchObject({ kind: 'width', mode: 'centered', scopePath: [], mateId: 'width', supportOnly: true,
    widthBranch: 'difference', tabBranch: 'difference', alignment: 'aligned' })
  near(report.angleRadians, 0, 1e-8); near(report.offsetMm, 0)
  near(report.branchLengths.width, 2, 1e-10); near(report.branchLengths.tab, 2, 1e-10)
  expect(report.angleRadians).toBeLessThanOrEqual(report.angleTolerance)
  expect(Math.abs(report.offsetMm)).toBeLessThanOrEqual(report.lengthTolerance)
  expect(value.checks.every(check => check.satisfied)).toBe(true)
}

/** Literal Rx corners and D1 surface measurements are independent of the mate evaluator. */
function nativeGeometry(document: AssemblyDocument, destination: Vec3, angle = 0): void {
  const definition = document.definitions[0]
  if (definition.kind !== 'part') throw Error('Original box required')
  withNativeOwners(owners => {
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
    const inventory = engine.rebuildForAssemblyReferences(definition.document.features)
    expect(inventory.featureErrors).toEqual([])
    if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw Error('One original explicit box required')
    const oc = getOC(), xs = new Map<string, number[]>()
    for (const occurrence of document.occurrences) {
      const moving = occurrence.id === 'd', translation = moving ? destination : ({ a: [-6, 0, 0], b: [6, 0, 0], c: [0, 0, 0] }[occurrence.id]!)
      vector(occurrence.pose.translation, translation)
      const [qx, qy, qz, qw] = occurrence.pose.rotation
      // Check the actual rotated Y direction, allowing equivalent q/-q.
      vector([2 * (qx * qy - qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qx * qw)],
        [0, Math.cos(moving ? angle : 0), Math.sin(moving ? angle : 0)], 1e-8)
      const shape = owners.own(placeAssemblyShape(owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), occurrence.pose))
      expect(owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)).IsValid()).toBe(true)
      expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      const volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false)
      oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      near(volume.Mass(), 96, 1e-5); near(area.Mass(), 128, 1e-5)
      const theta = moving ? angle : 0, corners = [-2, 2].flatMap(x => [-3, 3].flatMap(y => [0, 4].map(z =>
        [translation[0] + x, translation[1] + Math.cos(theta) * y - Math.sin(theta) * z, translation[2] + Math.sin(theta) * y + Math.cos(theta) * z])))
      const bounds = owners.own(shape.boundingBox).bounds
      vector(bounds[0], [0, 1, 2].map(axis => Math.min(...corners.map(point => point[axis]))))
      vector(bounds[1], [0, 1, 2].map(axis => Math.max(...corners.map(point => point[axis]))))
      const actualX: number[] = []
      for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) {
        const surface = owners.own(new oc.BRepAdaptor_Surface(face.wrapped, false))
        expect(surface.GetType()).toBe(oc.GeomAbs_SurfaceType.GeomAbs_Plane)
        const point = owners.own(new oc.gp_Pnt()), du = owners.own(new oc.gp_Vec()), dv = owners.own(new oc.gp_Vec())
        surface.D1(.37, .71, point, du, dv)
        const normal = [du.Y() * dv.Z() - du.Z() * dv.Y(), du.Z() * dv.X() - du.X() * dv.Z(), du.X() * dv.Y() - du.Y() * dv.X()]
        const sense = face.wrapped.Orientation() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -1 : 1
        const unit = normal.map(value => sense * value / Math.hypot(...normal))
        if (Math.abs(unit[0]) > .999) { vector(unit, [Math.sign(unit[0]), 0, 0], 1e-8); actualX.push(point.X()) }
      }
      expect(actualX).toHaveLength(2); actualX.sort((a, b) => a - b)
      vector(actualX, [translation[0] - 2, translation[0] + 2]); xs.set(occurrence.id, actualX)
    }
    // Width(-8,+8) and tab(-2,+2) have the same literal midpoint x=0.
    const widthCenter = (xs.get('a')![0] + xs.get('b')![1]) / 2, tabCenter = (xs.get('c')![0] + xs.get('d')![1]) / 2
    near(widthCenter, 0); near(tabCenter, 0); near(widthCenter, tabCenter)
  })
}

it('projects the fourth native owner, preserves strict movement and authenticates Cancel/Apply/reopen', () => {
  const document = original(), before = serializeAssemblyDocument(document), session = new AssemblyWorkerSession(), target = pose([6, 7, -3], .2)
  const history = new AssemblyDocumentHistory(document)
  try {
    nativeGeometry(document, [0, 0, 0])
    for (const strict of [session.move.bind(session), session.moveWorld.bind(session)]) {
      const rejected = strict(document, { component, pose: target })
      expect(rejected.status).toBe('rejected'); expect('token' in rejected).toBe(false); expect('document' in rejected).toBe(false)
    }
    const canceled = ready(session.project(document, { component, pose: target, mode: 'translate' }))
    supportReport(canceled); nativeGeometry(canceled.document, [0, 7, -3], .2)
    expect(canceled.projection).toMatchObject({ mode: 'translate', temporaryAnchor: false, affectedPaths: [['d']], requestedPose: target,
      evidence: { localOnly: true, convergence: 'stationary' } })
    near(canceled.projection!.positionResidual, 6); near(canceled.projection!.angleResidual, 0, 1e-8)
    expect(canceled.scopes.at(-1)!.result.localDOF).toBe(3); expect(canceled.scopes.at(-1)!.temporaryAnchor).toBeUndefined()
    session.discard(canceled.token); expect(() => session.apply(document, canceled.token)).toThrow()
    expect(serializeAssemblyDocument(document)).toBe(before); expect(history.canUndo).toBe(false)
    const preview = ready(session.project(document, { component, pose: target, mode: 'translate' }))
    const applied = session.apply(document, preview.token).document
    expect(() => session.apply(document, preview.token)).toThrow(); expect(applied.mates).toEqual(document.mates)
    expect(applied.occurrences.slice(0, 3)).toEqual(document.occurrences.slice(0, 3)); expect(applied.occurrences[3].fixed).toBe(false)
    nativeGeometry(applied, [0, 7, -3], .2); history.commitDocument(applied)
    expect(history.undo()).toEqual(document); expect(history.redo()).toEqual(applied)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(applied)), fresh = ready(session.prepare(reopened))
    supportReport(fresh); nativeGeometry(fresh.document, [0, 7, -3], .2)
    const reachable = ready(session.moveWorld(document, { component, pose: pose([0, 7, -3], .2) }))
    supportReport(reachable); nativeGeometry(reachable.document, [0, 7, -3], .2)
    expect(reachable.movement).toMatchObject({ frame: 'world', temporaryAnchor: true, targetPose: pose([0, 7, -3], .2) })
  } finally { session.discard() }
}, 60_000)

it.each(['anchor', 'normal', 'tolerance'] as const)('withholds a contact-stop capability when native local %s continuity fails', fault => {
  const document = original(), before = serializeAssemblyDocument(document), session = new AssemblyWorkerSession()
  let guardPhase = false, guardedFaces = 0
  const plan = translationModel.prepareAssemblyTranslationPath, inspect = CadEngine.prototype.inspectCurrentFaceSupport
  // Controlled native-provider inconsistency after the real endpoint solve.
  // The snapshots still issue/authenticate the actual returned witnesses;
  // no forged witness identity or CAD success reply is supplied by this test.
  const pathSpy = vi.spyOn(translationModel, 'prepareAssemblyTranslationPath').mockImplementationOnce((...args) => {
    const actual = plan(...args); guardPhase = true; return actual
  })
  const supportSpy = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function(this: CadEngine, ...args) {
    const actual = inspect.apply(this, args)
    if (!guardPhase || ++guardedFaces !== 5 || actual.kind !== 'plane') return actual
    if (fault === 'anchor') return { ...actual, point: [actual.point[0], actual.point[1] + .001, actual.point[2]] }
    if (fault === 'normal') return { ...actual, normal: actual.normal.map(value => -value) as Vec3 }
    return { ...actual, tolerance: actual.tolerance + 1e-7 }
  })
  const traceSpy = vi.spyOn(tracing, 'traceAssemblyTranslation')
  try {
    const result = session.translateUntilContact(document, { component, translation: [0, 6, -3] })
    expect(result.status).toBe('rejected')
    if (result.status !== 'rejected') throw Error('Inconsistent native supports must reject')
    expect(result.reason).toBe('verification')
    expect(result.message).toMatch(/cuatro soportes locales, sus anclajes y tolerancias/)
    expect(guardedFaces).toBe(8); expect(traceSpy).not.toHaveBeenCalled()
    expect('token' in result).toBe(false); expect('document' in result).toBe(false)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { traceSpy.mockRestore(); supportSpy.mockRestore(); pathSpy.mockRestore(); session.discard() }
}, 60_000)

it('verifies three native Rx stations and keeps initial relative overlap from gaining a contact-stop capability', () => {
  const document = original(), before = serializeAssemblyDocument(document), session = new AssemblyWorkerSession()
  // Transparent observation of the real fresh-snapshot verifier. Each actual
  // station candidate is rebuilt below with independent literal Rx geometry.
  const observed = vi.spyOn(widthMeasurement, 'measureAssemblyWidthWitnesses')
  try {
    const preview = ready(session.moveMotion(document, { component, translation: [0, 6, -3], rotation: { axis: 0, angle: 2.4 } }))
    expect(preview.motion).toMatchObject({ frame: 'local', axis: 0, requestedAngle: 2.4, stationCount: 3, verifiedStations: 3, sampledOnly: true })
    near(preview.motion!.evaluatedAngle, 2.4, 1e-8); near(preview.motion!.windingResidual, 0, 1e-8)
    expect(observed.mock.calls).toHaveLength(3)
    observed.mock.calls.forEach((call, index) => nativeGeometry(validateAssemblyDocument(call[1]), [0, 2 * (index + 1), -(index + 1)], .8 * (index + 1)))
    supportReport(preview); nativeGeometry(preview.document, [0, 6, -3], 2.4)
    const applied = session.apply(document, preview.token).document
    expect(applied.mates).toEqual(document.mates); nativeGeometry(applied, [0, 6, -3], 2.4)
    const rejected = session.translateUntilContact(document, { component, translation: [0, 6, -3] })
    expect(rejected.status).toBe('rejected'); expect('token' in rejected).toBe(false); expect('document' in rejected).toBe(false)
    if (rejected.status !== 'rejected') throw Error('The original overlapping boxes must not gain a contact-stop capability')
    expect(rejected.message).toMatch(/empieza con contacto, interferencia o una separación insuficiente/)
    expect(serializeAssemblyDocument(document)).toBe(before)
  } finally { observed.mockRestore(); session.discard() }
}, 60_000)
