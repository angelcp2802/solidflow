import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, type Shape3D } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyAxisReference,
  type AssemblyDocument, type AssemblyGeometryReference, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { identityRigidPose, type Quaternion, type RigidPose } from '../model/rigidPose'
import * as numericSolver from '../model/assemblySolver'
import { CadEngine } from './kernel.engine'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneEdgeReference, assemblySceneFaceReference, type AssemblyPreviewReply,
  type AssemblyScene } from './kernel.assembly-types'
import { applyAssemblySolvePreview, discardAssemblySolvePreview, prepareAssemblySolve, prepareAssemblyTranslationPreview,
  type AssemblySolvePreview } from './kernel.assembly-solve'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { extractAssemblyFaceSupport } from './kernel.assembly-supports'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners, type NativeOwner, type NativeOwners } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { KernelDispatcher } from './kernel.dispatcher'
import type { Vec3 } from './kernel.types'

type Kind = 'plane' | 'cylinder' | 'line'
type Family = 'parallel' | 'perpendicular'
type Alignment = 'aligned' | 'opposed' | null
type DirectionCase = { first: Kind; second: Kind; type: Family; alignment: Alignment; target: 0 | 90 | 180 }
const kinds: Kind[] = ['plane', 'cylinder', 'line']
// Independent acceptance table: a plane's normal is perpendicular to its
// in-plane directions. No production objective/angle helper supplies oracles.
const cases: DirectionCase[] = []
for (const first of kinds) for (const second of kinds) for (const type of ['parallel', 'perpendicular'] as const) {
  const mixed = (first === 'plane') !== (second === 'plane')
  if (type === (mixed ? 'perpendicular' : 'parallel')) {
    cases.push({ first, second, type, alignment: 'aligned', target: 0 }, { first, second, type, alignment: 'opposed', target: 180 })
  } else cases.push({ first, second, type, alignment: null, target: 90 })
}
const near = (actual: number, expected: number, tolerance = 1e-8) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
const vector = (actual: readonly number[], expected: readonly number[], tolerance = 1e-8) => {
  expect(actual).toHaveLength(expected.length); actual.forEach((value, i) => near(value, expected[i], tolerance))
}
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0)
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v: Vec3): Vec3 => v.map(value => value / Math.hypot(...v)) as Vec3
// Quaternion product and vector rotation are analytical test formulas, separate
// from the production rotation matrix, placement and solver helper routes.
function multiply(a: Quaternion, b: Quaternion): Quaternion {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]
}
function rotate(q: Quaternion, point: Vec3): Vec3 {
  const n = Math.hypot(...q), normalized = q.map(value => value / n) as Quaternion
  const value = multiply(multiply(normalized, [...point, 0]), [-normalized[0], -normalized[1], -normalized[2], normalized[3]])
  return [value[0], value[1], value[2]]
}
function transform(pose: RigidPose, point: Vec3): Vec3 { return rotate(pose.rotation, point).map((value, i) => value + pose.translation[i]) as Vec3 }
function worldPose(document: AssemblyDocument, path: string[]): RigidPose {
  let node: AssemblyDocument | EmbeddedAssemblyDefinition = document, result = identityRigidPose()
  for (const [index, id] of path.entries()) {
    const occurrence = node.occurrences.find(value => value.id === id)!
    result = { translation: transform(result, occurrence.pose.translation), rotation: multiply(result.rotation, occurrence.pose.rotation) }
    if (index < path.length - 1) {
      const next = document.definitions.find(value => value.id === occurrence.definition.id && value.revision === occurrence.definition.revision)
      if (!next || next.kind !== 'assembly') throw new Error('Actual analytical nested path missing')
      node = next
    }
  }
  return result
}
let original: AssemblyDocument, contactOriginal: AssemblyDocument, originalScene: AssemblyScene
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  original = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-direction-mates-original.json', import.meta.url), 'utf8'))
  contactOriginal = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-translation-original.json', import.meta.url), 'utf8'))
  originalScene = buildAssemblyScene(original)
}, 60_000)
const fixture = () => validateAssemblyDocument(original)
function reference(scene: AssemblyScene, id: string, kind: Kind): AssemblyGeometryReference {
  const body = scene.bodies.find(value => value.component.occurrencePath.length === 1 && value.component.occurrencePath[0] === id)!
  if (kind === 'line') {
    const matches = (body.edges ?? []).filter(edge => edge.support?.kind === 'line' && Math.abs(edge.support.point[0] - 5) < 1e-8
      && Math.abs(edge.support.point[1] - 3) < 1e-8 && edge.support.axis[2] > .99)
    expect(matches).toHaveLength(1); const result = assemblySceneEdgeReference(matches[0])
    if (!result) throw new Error('Original exact native LINE required'); return result
  }
  const matches = body.faces.filter(face => kind === 'plane' ? face.support?.kind === 'plane' && face.support.normal[2] > .99
    && Math.abs(face.support.point[2] - 4) < 1e-8 : face.support?.kind === 'cylinder')
  expect(matches).toHaveLength(1); const result = assemblySceneFaceReference(matches[0])
  if (!result) throw new Error('Original exact native plane/cylinder required'); return result
}
function mate(spec: DirectionCase, scene = originalScene, id = 'direction'): Extract<AssemblyMate, { type: 'parallel' | 'perpendicular' }> {
  return { id, name: 'Original ' + spec.type + ' ' + spec.first + '/' + spec.second, type: spec.type, suppressed: false,
    first: reference(scene, 'ground', spec.first), second: reference(scene, 'moving', spec.second), alignment: spec.alignment }
}
const parallel: DirectionCase = { first: 'plane', second: 'plane', type: 'parallel', alignment: 'aligned', target: 0 }
const perpendicular: DirectionCase = { first: 'plane', second: 'plane', type: 'perpendicular', alignment: null, target: 90 }
function nativeReady(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function bodyGeometry(shape: Shape3D, pose: RigidPose, radius = 1): void {
  withNativeOwners(owners => {
    const oc = getOC(), validity = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)),
      volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
    expect(validity.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
    oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
    near(volume.Mass(), 240 - 4 * Math.PI * radius * radius, 1e-5); near(area.Mass(), 248 + 8 * Math.PI * radius - 2 * Math.PI * radius * radius, 1e-5)
    const corners: Vec3[] = []
    for (const x of [-5, 5]) for (const y of [-3, 3]) for (const z of [0, 4]) corners.push(transform(pose, [x, y, z]))
    const actual = owners.own(shape.boundingBox).bounds
    vector(actual[0], [0, 1, 2].map(i => Math.min(...corners.map(corner => corner[i]))), 1e-6)
    vector(actual[1], [0, 1, 2].map(i => Math.max(...corners.map(corner => corner[i]))), 1e-6)
  })
}
/** Query independently placed native BReps, not the scene's transformed DTO. */
function nativeDirection(shape: Shape3D, pose: RigidPose, kind: Kind): Vec3 {
  return withNativeOwners(owners => {
    if (kind !== 'line') {
      const expectedTop = transform(pose, [0, 0, 4]), expectedNormal = rotate(pose.rotation, [0, 0, 1])
      const supports = owners.ownAll(ownedNativeTopology(shape, 'face')).map(face => extractAssemblyFaceSupport(face))
      const matches = supports.filter(support => kind === 'cylinder' ? support.kind === 'cylinder' : support.kind === 'plane'
        && dot(support.normal, expectedNormal) > .999 && Math.abs(dot(support.normal, support.point.map((value, i) => value - expectedTop[i]))) < 1e-6)
      expect(matches).toHaveLength(1); const support = matches[0]
      if (support.kind === 'cylinder') return support.axis
      if (support.kind === 'plane') return support.normal
      throw new Error('Expected actual native direction')
    }
    const lower = transform(pose, [5, 3, 0]), upper = transform(pose, [5, 3, 4]), oc = getOC(), matches: Vec3[] = []
    for (const edge of owners.ownAll(ownedNativeTopology(shape, 'edge'))) {
      const curve = owners.own(new oc.BRepAdaptor_Curve(edge.wrapped))
      if (curve.GetType() !== oc.GeomAbs_CurveType.GeomAbs_Line) continue
      const a = owners.own(curve.Value(curve.FirstParameter())), b = owners.own(curve.Value(curve.LastParameter()))
      const p: Vec3 = [a.X(), a.Y(), a.Z()], q: Vec3 = [b.X(), b.Y(), b.Z()]
      const same = (x: Vec3, y: Vec3) => Math.hypot(...x.map((value, i) => value - y[i])) < 1e-6
      // Lower→upper gives the declared local +Z direction even when the native
      // traversal runs backward. No desired target chooses or flips this sign.
      if (same(p, lower) && same(q, upper)) matches.push(unit(q.map((value, i) => value - p[i]) as Vec3))
      else if (same(q, lower) && same(p, upper)) matches.push(unit(p.map((value, i) => value - q[i]) as Vec3))
    }
    expect(matches).toHaveLength(1); return matches[0]
  })
}
function verifyNative(document: AssemblyDocument, spec: DirectionCase, paths = [['ground'], ['moving']], radius = 1): void {
  withNativeOwners(owners => {
    const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
    const occurrenceDefinition = (path: string[]) => {
      let node: AssemblyDocument | EmbeddedAssemblyDefinition = document
      for (const [index, id] of path.entries()) {
        const occurrence = node.occurrences.find(value => value.id === id)!, definition = document.definitions.find(value =>
          value.id === occurrence.definition.id && value.revision === occurrence.definition.revision)!
        if (index === path.length - 1) { if (definition.kind !== 'part') throw new Error('Actual part required'); return definition }
        if (definition.kind !== 'assembly') throw new Error('Actual group required'); node = definition
      }
      throw new Error('Actual occurrence path required')
    }
    const part = occurrenceDefinition(paths[0]), inventory = engine.rebuildForAssemblyReferences(part.document.features)
    if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('Original explicit body inventory required')
    const directions = paths.map((path, i) => {
      expect(occurrenceDefinition(path).document).toEqual(part.document)
      const copy = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), pose = worldPose(document, path), shape = owners.own(placeAssemblyShape(copy, pose))
      bodyGeometry(shape, pose, radius); return nativeDirection(shape, pose, i === 0 ? spec.first : spec.second)
    })
    const angle = Math.atan2(Math.hypot(...cross(directions[0], directions[1])), dot(directions[0], directions[1]))
    near(angle, spec.target * Math.PI / 180, 1e-8)
  })
}

it('attests the original plane +Z, cylinder -Z and canonical LINE +Z with independent BRep metrics and bounds', () => {
  expect(cases).toHaveLength(27)
  const body = originalScene.bodies.find(value => value.component.occurrencePath[0] === 'ground')!
  const plane = body.faces.find(value => value.support?.kind === 'plane' && value.support.normal[2] > .99)!.support
  const cylinder = body.faces.find(value => value.support?.kind === 'cylinder')!.support
  const line = (body.edges ?? []).find(value => value.support?.kind === 'line' && Math.abs(value.support.point[0] - 5) < 1e-8 && Math.abs(value.support.point[1] - 3) < 1e-8 && value.support.axis[2] > .99)!.support
  if (plane?.kind !== 'plane' || cylinder?.kind !== 'cylinder' || line?.kind !== 'line') throw new Error('Actual original supports required')
  vector(plane.normal, [0, 0, 1], 1e-12); vector(cylinder.axis, [0, 0, -1], 1e-12); vector(line.axis, [0, 0, 1], 1e-12)
  near(cylinder.radius, 1, 1e-12); vector(cylinder.point.slice(0, 2), [2, 0], 1e-12)
  expect(originalScene.solidCount).toBe(2); expect(originalScene.prototypeCount).toBe(1)
  near(originalScene.volume, 480 - 8 * Math.PI, 1e-5); near(originalScene.area, 496 + 12 * Math.PI, 1e-5)
  vector(originalScene.bounds!.min, [-5, -3, 0], 1e-6); vector(originalScene.bounds!.max, [25, 10 + 1.5 * Math.sqrt(3), 7.5 + 2 * Math.sqrt(3)], 1e-6)
  verifyNative(fixture(), parallel, [['ground'], ['ground']])
}, 60_000)

it.each(cases)('solves exact native $type $first/$second $alignment ($target degrees), preserving signed intent and natural mobility', spec => {
  const base = fixture(), before = serializeAssemblyDocument(base); base.mates = [mate(spec)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(preview.checks).toHaveLength(1); expect(preview.checks[0].satisfied).toBe(true)
    expect(preview.scopes.at(-1)!.result.localDOF).toBe(spec.target === 90 ? 5 : 4)
    expect(preview.scopes.at(-1)!.result.rank).toBe(spec.target === 90 ? 1 : 2)
    const actual = validateAssemblyDocument(preview.document)
    expect(actual.mates).toEqual(base.mates); expect(actual.occurrences[0].pose).toEqual(base.occurrences[0].pose)
    expect(actual.mates[0].type).toBe(spec.type); expect('angle' in actual.mates[0]).toBe(false)
    verifyNative(actual, spec)
    const sourceWithoutMate = validateAssemblyDocument(base); sourceWithoutMate.mates = []
    expect(serializeAssemblyDocument(sourceWithoutMate)).toBe(before)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it.each([parallel, perpendicular])('retains six common rigid gauge coordinates for two floating $type owners', spec => {
  const base = fixture(); base.occurrences[0].fixed = false; base.mates = [mate(spec)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.scopes.at(-1)!.result.localDOF).toBe(spec.target === 90 ? 11 : 10); verifyNative(validateAssemblyDocument(preview.document), spec) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it.each([parallel, perpendicular])('rejects an incompatible fixed/fixed $type without poses or Apply authority', spec => {
  const base = fixture(); base.occurrences[1].fixed = true; base.mates = [mate(spec)]
  const before = serializeAssemblyDocument(base), result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
  if (result.status === 'rejected') expect(result.scopes.at(-1)?.result.certificates.map(value => value.kind)).toContain('fixedConstraint')
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('does not reduce a free owner gauge for a satisfied same-owner declaration, and rejects an impossible one', () => {
  const base = fixture(); base.occurrences = [base.occurrences[1]]
  const endpoint = reference(originalScene, 'moving', 'plane')
  base.mates = [{ ...mate(parallel), first: endpoint, second: structuredClone(endpoint) }]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.scopes.at(-1)!.result.rank).toBe(0); expect(preview.scopes.at(-1)!.result.localDOF).toBe(6); expect(preview.document.occurrences[0].pose).toEqual(base.occurrences[0].pose) }
  finally { discardAssemblySolvePreview(preview) }
  base.mates = [{ ...mate(perpendicular), first: endpoint, second: structuredClone(endpoint) }]
  const before = serializeAssemblyDocument(base), rejected = prepareAssemblySolve(base)
  expect(rejected.status).toBe('rejected'); expect('document' in rejected).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('counts compatible duplicate and mixed normal/axis declarations only once in the native rank', () => {
  const base = fixture(); base.mates = [mate(parallel), mate(parallel, originalScene, 'duplicate'), mate({ first: 'plane', second: 'cylinder', type: 'perpendicular', alignment: 'opposed', target: 180 }, originalScene, 'mixed')]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.checks).toHaveLength(3); expect(preview.checks.every(check => check.satisfied)).toBe(true); expect(preview.scopes.at(-1)!.result.rank).toBe(2); expect(preview.scopes.at(-1)!.result.localDOF).toBe(4); verifyNative(validateAssemblyDocument(preview.document), parallel) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('rejects contradictory parallel/perpendicular declarations without altering committed history or reviving a token', () => {
  const base = fixture(), history = new AssemblyDocumentHistory(base), session = new AssemblyWorkerSession(), earlier = ready(session.prepare(base))
  const proposal = fixture(); proposal.mates = [mate(parallel), mate(perpendicular, originalScene, 'conflict')]
  try {
    const reply = session.prepare(base, proposal); expect(reply.status).toBe('rejected'); expect('token' in reply).toBe(false)
    expect(history.current).toEqual(base); expect(history.canUndo).toBe(false); expect(() => session.apply(base, earlier.token)).toThrow('disponible')
  } finally { session.discard() }
}, 60_000)

it('edits aligned to opposed from an exactly collinear native solution and authenticates only the new branch', () => {
  const base = fixture(), session = new AssemblyWorkerSession(), proposed = fixture(); proposed.mates = [mate(parallel)]
  try {
    const first = ready(session.prepare(base, proposed)), applied = session.apply(base, first.token).document
    verifyNative(applied, parallel)
    const previous = applied.mates[0]
    if (previous.type !== 'parallel') throw new Error('Actual parallel declaration required')
    const { id: _id, ...declaration } = previous
    const edited = applyAssemblyEdit(applied, { type: 'update-mate', scope: { id: applied.id, revision: applied.revision }, mateId: previous.id, mate: { ...declaration, alignment: 'opposed' } })
    const next = ready(session.prepare(applied, edited)); expect(next.scopes.at(-1)!.result.localDOF).toBe(4)
    verifyNative(next.document, { ...parallel, alignment: 'opposed', target: 180 })
    const committed = session.apply(applied, next.token).document
    expect(committed.mates[0]).toMatchObject({ id: previous.id, type: 'parallel', alignment: 'opposed' }); expect(applied.mates[0]).toMatchObject({ alignment: 'aligned' })
    expect(() => session.apply(applied, next.token)).toThrow('disponible')
  } finally { session.discard() }
}, 60_000)

it('uses one authenticated transaction for Cancel, Apply, Undo/Redo and a fresh serialized reopen', () => {
  const base = fixture(), before = serializeAssemblyDocument(base), proposal = fixture(), history = new AssemblyDocumentHistory(base), session = new AssemblyWorkerSession()
  proposal.mates = [mate({ first: 'line', second: 'cylinder', type: 'parallel', alignment: 'opposed', target: 180 })]
  try {
    const canceled = ready(session.prepare(base, proposal)); session.discard(canceled.token)
    expect(() => session.apply(base, canceled.token)).toThrow('disponible'); expect(history.current).toEqual(base)
    const fresh = ready(session.prepare(base, proposal)), expected = structuredClone(fresh.document)
    // Renderer DTO mutations cannot alter the worker's private document, refs
    // or exact saved family/alignment authenticated by this token.
    fresh.document.occurrences[1].pose.translation[0] = 1e4
    fresh.document.mates[0].name = 'Renderer mutation'
    const applied = session.apply(base, fresh.token); expect(applied.document.mates).toEqual(expected.mates)
    expect(applied.document.occurrences).toEqual(expected.occurrences); history.commitDocument(applied.document)
    expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied.document)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(history.current)), verified = ready(session.prepare(reopened))
    expect(verified.document.mates).toEqual(proposal.mates); verifyNative(verified.document, { first: 'line', second: 'cylinder', type: 'parallel', alignment: 'opposed', target: 180 })
    expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it('binds direct native Apply to the exact source and rejects cloned capabilities', () => {
  const base = fixture(); base.mates = [mate(perpendicular)]
  const history = new AssemblyDocumentHistory(base), preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow(/verificada|consumi/)
    history.commitDocument({ ...base, name: 'Source changed before Apply' })
    expect(() => applyAssemblySolvePreview(history, preview)).toThrow('documento cambió')
    expect(history.current.name).toBe('Source changed before Apply')
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('includes hidden geometry in a native direction relation while occurrence and mate suppression remain distinct', () => {
  const base = fixture(); base.occurrences[1].visible = false; base.mates = [mate(parallel)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(preview.checks).toHaveLength(1); verifyNative(validateAssemblyDocument(preview.document), parallel)
    const scene = buildAssemblyScene(validateAssemblyDocument(preview.document))
    expect(scene.bodies).toHaveLength(2); expect(scene.bodies.find(body => body.component.occurrencePath[0] === 'moving')!.visible).toBe(false)
    near(scene.volume, 480 - 8 * Math.PI, 1e-5)
  } finally { discardAssemblySolvePreview(preview) }
  const suppressed = fixture(); suppressed.mates = [mate(parallel)]; suppressed.occurrences[1].suppressed = true
  expect(prepareAssemblySolve(suppressed).status).toBe('rejected')
  suppressed.mates[0].suppressed = true
  const inactive = nativeReady(prepareAssemblySolve(suppressed))
  try { expect(inactive.checks).toEqual([]); expect(inactive.document.mates).toEqual(suppressed.mates); expect(buildAssemblyScene(validateAssemblyDocument(inactive.document)).solidCount).toBe(1) }
  finally { discardAssemblySolvePreview(inactive) }
}, 60_000)

it('preserves a broken suppressed declaration, repairs its exact native endpoint and verifies reactivation', () => {
  const base = fixture(), relation = mate({ first: 'line', second: 'plane', type: 'parallel', alignment: null, target: 90 })
  if (relation.type !== 'parallel' || relation.first.kind !== 'edge') throw new Error('Original LINE declaration required')
  relation.first.edge.key = 'edge-v1:missing-original'; relation.suppressed = true; base.mates = [relation]
  const session = new AssemblyWorkerSession()
  try {
    const disabled = ready(session.prepare(base)); expect(disabled.document.mates).toEqual(base.mates)
    const locator = { scope: { id: base.id, revision: base.revision }, mateId: relation.id, side: 'first' as const }
    const repaired = repairAssemblyEndpoint(base, locator, reference(originalScene, 'ground', 'line')); repaired.mates[0].suppressed = false
    const active = ready(session.prepare(base, repaired)); expect(active.checks).toHaveLength(1)
    verifyNative(active.document, { first: 'line', second: 'plane', type: 'parallel', alignment: null, target: 90 })
    expect(base.mates[0]).toEqual(relation)
  } finally { session.discard() }
}, 60_000)

it.each(['revision', 'body', 'kind', 'curve', 'key', 'full-path'] as const)('rejects a forged/stale native direction %s without native-result authority', fault => {
  const base = fixture(); let relation = mate(parallel)
  if (relation.type !== 'parallel' || relation.second.kind !== 'face') throw new Error('Original face declaration required')
  if (fault === 'revision') relation.second.component.definition.revision = 'missing-revision'
  else if (fault === 'body') relation.second.body = { bodyId: 'wrong-body', sourceFeatureId: 'bore' }
  else if (fault === 'kind') relation.second = { ...relation.second, support: 'axis' }
  else if (fault === 'key') relation.second.face.key += '-missing'
  else if (fault === 'full-path') relation.second.component.occurrencePath = ['moving', 'ground']
  else {
    const body = originalScene.bodies.find(value => value.component.occurrencePath[0] === 'moving')!, curved = (body.edges ?? []).find(edge => edge.support === null)!
    expect(curved).toBeDefined()
    relation.second = { kind: 'edge', ...structuredClone(curved.selection), support: 'line' }
  }
  // Plane/axis mixed changes the valid objective. Keep declaration syntax valid
  // so this test reaches actual reference/native-family verification.
  if (fault === 'kind' || fault === 'curve') relation = { ...relation, type: 'perpendicular' }
  base.mates = [relation]; const saved = serializeAssemblyDocument(base), result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect('token' in result).toBe(false)
  if (result.status === 'rejected') expect(result.reason).toBe('reference')
  expect(serializeAssemblyDocument(base)).toBe(saved)
}, 60_000)

it('solves a shared local definition once and checks each rotated/hidden expansion against independently placed native directions', () => {
  const base = fixture(), group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'direction-group', revision: 'r1', name: 'Original shared direction group',
    createdAt: base.createdAt, updatedAt: base.updatedAt, occurrences: structuredClone(base.occurrences), mates: [mate({ first: 'cylinder', second: 'line', type: 'perpendicular', alignment: null, target: 90 })] }
  base.definitions.push(group)
  base.occurrences = [
    { id: 'A', name: 'Z90 group', definition: { id: group.id, revision: group.revision }, pose: { translation: [50, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'B', name: 'X90 hidden group', definition: { id: group.id, revision: group.revision }, pose: { translation: [-30, 20, 10], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: false, suppressed: false },
  ]
  const before = serializeAssemblyDocument(base), preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(preview.scopes.map(scope => scope.definition.id)).toEqual([group.id, base.id]); expect(preview.scopes[0].result.localDOF).toBe(5)
    expect(preview.scopes[1].result.localDOF).toBe(0); expect(preview.checks).toHaveLength(2)
    const actual = validateAssemblyDocument(preview.document)
    verifyNative(actual, { first: 'cylinder', second: 'line', type: 'perpendicular', alignment: null, target: 90 }, [['A', 'ground'], ['A', 'moving']])
    verifyNative(actual, { first: 'cylinder', second: 'line', type: 'perpendicular', alignment: null, target: 90 }, [['B', 'ground'], ['B', 'moving']])
    const scene = buildAssemblyScene(actual); expect(scene.solidCount).toBe(4); expect(scene.prototypeCount).toBe(1)
    expect(scene.bodies.filter(body => !body.visible)).toHaveLength(2); near(scene.volume, 960 - 16 * Math.PI, 1e-5); near(scene.area, 992 + 24 * Math.PI, 1e-5)
    expect(actual.occurrences).toEqual(base.occurrences); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('keeps changed v1 faces/LINE declarations repairable and requires current revision/body keys before a fresh source Apply', () => {
  const base = fixture(); base.mates = [mate({ first: 'cylinder', second: 'line', type: 'parallel', alignment: 'opposed', target: 180 })]
  const part = base.definitions[0]
  if (part.kind !== 'part') throw new Error('Original part required')
  const changed = structuredClone(part.document), profile = changed.features.find(feature => feature.id === 'bore-profile')!
  if (profile.type !== 'sketch' || profile.profile.kind !== 'circle') throw new Error('Original circle required')
  profile.profile.radius = 1.25
  const before = serializeAssemblyDocument(base), review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, changed, 'r2')
  expect(review.endpoints).toHaveLength(2); expect(review.endpoints.every(endpoint => endpoint.status === 'needs-repair')).toBe(true)
  expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  let repaired = review.document
  for (const endpoint of review.endpoints) repaired = repairAssemblyEndpoint(repaired, endpoint.locator,
    reference(review.scene, endpoint.locator.side === 'first' ? 'ground' : 'moving', endpoint.locator.side === 'first' ? 'cylinder' : 'line'))
  const session = new AssemblyWorkerSession()
  try {
    const preview = ready(session.prepare(base, repaired)), applied = session.apply(base, preview.token)
    verifyNative(applied.document, { first: 'cylinder', second: 'line', type: 'parallel', alignment: 'opposed', target: 180 }, undefined, 1.25)
    expect(applied.document.definitions.find(definition => definition.id === part.id && definition.revision === 'r1')).toEqual(part)
    expect(applied.document.mates[0].type).toBe('parallel'); expect(applied.document.occurrences.every(value => value.definition.revision === 'r2')).toBe(true)
    expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it('performs a fresh native query after the actual numeric solve and withholds the candidate on query failure', () => {
  const base = fixture(); base.mates = [mate(parallel)]
  const before = serializeAssemblyDocument(base), realSolve = numericSolver.solveRigidMates, realQuery = CadEngine.prototype.inspectCurrentFaceSupport
  let solved = false, finalQueries = 0
  const solve = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { const result = realSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentFaceSupport').mockImplementation(function (this: CadEngine, face, body) {
    const result = realQuery.call(this, face, body)
    if (solved) { finalQueries++; throw new Error('Original actual post-solve native query failure') }
    return result
  })
  try {
    const result = prepareAssemblySolve(base); expect(solved).toBe(true); expect(finalQueries).toBe(1); expect(result.status).toBe('rejected')
    if (result.status === 'rejected') { expect(result.reason).toBe('verification'); expect(result.message).toContain('post-solve native query') }
    expect('document' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { query.mockRestore(); solve.mockRestore() }
}, 60_000)

it.each([parallel, perpendicular])('admits clear constant-rotation translation for native $type with freshly checked endpoint directions', spec => {
  const base = fixture(); base.occurrences[1].pose.rotation = spec.target === 0 ? [0, 0, 0, 1] : [Math.SQRT1_2, 0, 0, Math.SQRT1_2]; base.mates = [mate(spec)]
  const before = serializeAssemblyDocument(base), preview = nativeReady(prepareAssemblyTranslationPreview(base, {
    component: { occurrencePath: ['moving'], definition: { ...base.occurrences[1].definition } }, translation: [40, 10, 6] }))
  try {
    expect(preview.translation!.trace.status).toBe('complete'); expect(preview.document.occurrences[1].pose.rotation).toEqual(base.occurrences[1].pose.rotation)
    vector(preview.document.occurrences[1].pose.translation, [40, 10, 6], 1e-8); expect(preview.scopes.at(-1)!.result.localDOF).toBe(spec.target === 90 ? 5 : 4)
    expect(preview.checks[0].satisfied).toBe(true); verifyNative(validateAssemblyDocument(preview.document), spec)
    expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('keeps the actual native thin-obstacle stop with a parallel direction row and unchanged rotations', () => {
  const base = validateAssemblyDocument(contactOriginal)
  base.mates.push({ id: 'native-parallel', name: 'Original native top directions', type: 'parallel', suppressed: false, alignment: 'aligned',
    first: { kind: 'principal-plane', component: { occurrencePath: ['slider'], definition: { ...base.occurrences[0].definition } }, plane: 'XY' },
    second: { kind: 'principal-plane', component: { occurrencePath: ['obstacle'], definition: { ...base.occurrences[1].definition } }, plane: 'XY' } })
  const scene = buildAssemblyScene(base), tops = scene.bodies.map(body => body.faces.find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99)!)
  const first = assemblySceneFaceReference(tops[0]), second = assemblySceneFaceReference(tops[1])
  if (!first || !second || base.mates[2].type !== 'parallel') throw new Error('Exact original top planes required')
  base.mates[2].first = first; base.mates[2].second = second
  const preview = nativeReady(prepareAssemblyTranslationPreview(base, { component: { occurrencePath: ['slider'], definition: { ...base.occurrences[0].definition } }, translation: [20, 0, 0] }))
  try {
    expect(preview.translation!.trace.status).toBe('stopped'); expect(preview.translation!.trace.queryCount).toBeGreaterThan(2)
    const x = preview.document.occurrences[0].pose.translation[0]; expect(x).toBeLessThan(7.75); near(x, 7.75, 1e-5)
    expect(preview.document.occurrences.map(value => value.pose.rotation)).toEqual(base.occurrences.map(value => value.pose.rotation))
    expect(preview.checks).toHaveLength(3); expect(preview.checks.every(check => check.satisfied)).toBe(true); expect(preview.scopes.at(-1)!.result.localDOF).toBe(1)
    const actual = buildAssemblyScene(validateAssemblyDocument(preview.document)); expect(actual.solidCount).toBe(2); near(actual.volume, 96, 1e-6); near(actual.area, 240, 1e-6)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('carries explicit direction intent through actual dispatcher preview/Apply and blocks stale original-source tokens', () => {
  const dispatcher = new KernelDispatcher(), base = fixture(), proposed = fixture(); proposed.mates = [mate(perpendicular)]
  try {
    const reply = dispatcher.handle({ id: 1, action: 'preview-assembly', current: base, proposed }) as AssemblyPreviewReply, preview = ready(reply)
    expect(preview.document.mates).toEqual(proposed.mates); expect(preview.scene.solidCount).toBe(2)
    const changed = { ...base, name: 'Actual changed source' }
    expect(() => dispatcher.handle({ id: 2, action: 'apply-assembly', current: changed, token: preview.token })).toThrow('documento cambió')
    const next = ready(dispatcher.handle({ id: 3, action: 'preview-assembly', current: base, proposed }) as AssemblyPreviewReply)
    const applied = dispatcher.handle({ id: 4, action: 'apply-assembly', current: base, token: next.token })
    if (!applied || applied instanceof Blob || !('kind' in applied) || applied.kind !== 'assembly-applied') throw new Error('Actual assembly Apply reply required')
    verifyNative(applied.document, perpendicular); expect(applied.document.mates[0].type).toBe('perpendicular')
    expect(() => dispatcher.handle({ id: 5, action: 'apply-assembly', current: base, token: next.token })).toThrow('disponible')
  } finally { dispatcher.dispose() }
}, 60_000)

it('allows independent XYZ translation without adding axis coincidence, plane distance or segment intersection', () => {
  const base = fixture(); base.mates = [mate({ first: 'cylinder', second: 'line', type: 'parallel', alignment: 'opposed', target: 180 })]
  const session = new AssemblyWorkerSession()
  try {
    const initial = ready(session.prepare(base)), applied = session.apply(base, initial.token).document, current = applied.occurrences[1]
    const target: RigidPose = { translation: [current.pose.translation[0] + 17, current.pose.translation[1] - 23, current.pose.translation[2] + 11], rotation: [...current.pose.rotation] }
    const moved = ready(session.move(applied, { component: { occurrencePath: ['moving'], definition: { ...current.definition } }, pose: target }))
    vector(moved.document.occurrences[1].pose.translation, target.translation, 1e-6)
    expect(moved.document.mates).toEqual(applied.mates); expect(moved.scopes.at(-1)!.result.localDOF).toBe(0)
    verifyNative(moved.document, { first: 'cylinder', second: 'line', type: 'parallel', alignment: 'opposed', target: 180 })
    const next = session.apply(applied, moved.token).document, reopened = ready(session.prepare(parseAssemblyDocument(serializeAssemblyDocument(next))))
    expect(reopened.scopes.at(-1)!.result.localDOF).toBe(4); expect(next.occurrences[1].fixed).toBe(false)
  } finally { session.discard() }
}, 60_000)

it.each(['concentric', 'coincident'] as const)('does not double-count native parallel orientation already implied by %s', type => {
  const base = fixture(), first = reference(originalScene, 'ground', type === 'concentric' ? 'cylinder' : 'plane'), second = reference(originalScene, 'moving', type === 'concentric' ? 'cylinder' : 'plane')
  if (first.kind !== 'face' || second.kind !== 'face') throw new Error('Exact native face required')
  const existing: AssemblyMate = type === 'concentric' ? { id: 'existing', name: 'Original coaxial cylinders', type, suppressed: false, alignment: 'aligned', rotationLock: null,
    first: { ...first, support: 'axis' }, second: { ...second, support: 'axis' } } : { id: 'existing', name: 'Original same supporting plane', type, suppressed: false, alignment: 'aligned',
    first: { ...first, support: 'plane' }, second: { ...second, support: 'plane' } }
  const spec: DirectionCase = { first: type === 'concentric' ? 'cylinder' : 'plane', second: type === 'concentric' ? 'cylinder' : 'plane', type: 'parallel', alignment: 'aligned', target: 0 }
  base.mates = [existing, mate(spec)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.checks).toHaveLength(2); expect(preview.scopes.at(-1)!.result.rank).toBe(type === 'concentric' ? 4 : 3); expect(preview.scopes.at(-1)!.result.localDOF).toBe(type === 'concentric' ? 2 : 3); verifyNative(validateAssemblyDocument(preview.document), spec) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it.each([parallel, perpendicular])('accepts a satisfied fixed/fixed $type with no numerical variables or invented mobility', spec => {
  const base = fixture(); base.occurrences[1].fixed = true; base.occurrences[1].pose.rotation = spec.target === 0 ? [0, 0, 0, 1] : [Math.SQRT1_2, 0, 0, Math.SQRT1_2]; base.mates = [mate(spec)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.scopes.at(-1)!.result.localDOF).toBe(0); expect(preview.scopes.at(-1)!.result.rank).toBe(0); expect(preview.document.occurrences).toEqual(base.occurrences); verifyNative(validateAssemblyDocument(preview.document), spec) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('preserves a singular orientation rejection when the caller supplies zero seed budget', () => {
  const base = fixture(); base.occurrences[1].pose.rotation = [0, 0, 0, 1]; base.mates = [mate(perpendicular)]
  const before = serializeAssemblyDocument(base), result = prepareAssemblySolve(base, { solver: { maxSeedPasses: 0 } })
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
  if (result.status === 'rejected') { expect(result.reason).toBe('numeric'); expect(result.scopes.at(-1)!.result.status).toBe('nonConverged'); expect(result.scopes.at(-1)!.result.evidence.diagnostics.join(' ')).toContain('singular') }
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('withholds an actual solved candidate when final native point cleanup fails, without retry or stale capability', () => {
  const base = fixture(); base.mates = [mate(parallel)]
  const actualSolve = numericSolver.solveRigidMates, arena = ownership.withNativeOwners, failure = new Error('Original direction final support point release failure')
  let solved = false, injected = false, releases = 0
  const solve = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const implementation: typeof arena = <T>(operation: (owners: NativeOwners) => T,
    resultOwners: (result: T) => readonly NativeOwner[] = () => [], context?: string): T => arena((owners: NativeOwners) => {
    if (solved && context === 'Assembly face support extraction or release failed.') {
      const own = owners.own.bind(owners)
      owners.own = <T extends NativeOwner>(value: T): T => {
        if (!injected && value instanceof getOC().gp_Pnt) {
          injected = true; const remove = value.delete.bind(value)
          Object.defineProperty(value, 'delete', { configurable: true, value: () => { releases++; remove(); throw failure } })
        }
        return own(value)
      }
    }
    return operation(owners)
  }, resultOwners, context)
  const spy = vi.spyOn(ownership, 'withNativeOwners').mockImplementation(implementation)
  try {
    const result = prepareAssemblySolve(base); expect(solved).toBe(true); expect(injected).toBe(true); expect(releases).toBe(1)
    expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
    if (result.status === 'rejected') expect(result.reason).toBe('verification')
  } finally { spy.mockRestore(); solve.mockRestore() }
}, 60_000)

function gearBase(): AssemblyDocument {
  const base = createAssemblyExample()
  for (const [id, x] of [['left', -10], ['right', 10]] as const) base.occurrences.find(value => value.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = buildAssemblyScene(base), faces = (id: string) => scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces
  const axis = (id: string, radius: number, x: number) => {
    const face = faces(id).find(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - radius) < 1e-10 && Math.abs(face.support.point[0] - x) < 1e-9)!
    if (face.support?.kind !== 'cylinder') throw new Error('Actual original bearing cylinder required')
    vector(face.support.axis, [0, 0, -1], 1e-12)
    return assemblySceneFaceReference(face)! as AssemblyAxisReference
  }
  const cap = (id: string, z: number) => {
    const face = faces(id).find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - z) < 1e-9)!, ref = assemblySceneFaceReference(face)!
    return { ...ref, support: 'plane' as const }
  }
  base.mates = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) base.mates.push(
    { id: id + '-axis', name: id + ' bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(id, 2, 0), second: axis('plate', 3, x) },
    { id: id + '-cap', name: id + ' cap', type: 'coincident', suppressed: false, alignment: 'aligned', first: cap(id, 12), second: cap('plate', 4) })
  return validateAssemblyDocument(base)
}
it('continues a native gear lift with a redundant direction relation and no chart reseeding', () => {
  const base = gearBase(), session = new AssemblyWorkerSession()
  try {
    const first = base.mates.find(mate => mate.id === 'left-axis'), second = base.mates.find(mate => mate.id === 'right-axis')
    if (first?.type !== 'concentric' || second?.type !== 'concentric' || first.first.kind !== 'face' || second.first.kind !== 'face') throw new Error('Actual bearing endpoints required')
    const initial = ready(session.prepare(base)), captured = ready(session.captureGear(base, initial.token, { first: first.first, second: second.first,
      carrier: { occurrencePath: ['plate'], definition: { ...base.occurrences.find(value => value.id === 'plate')!.definition } }, ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original direction plus gear' }))
    let document = session.apply(base, captured.token).document
    const proposed = validateAssemblyDocument(document); proposed.mates.push({ id: 'shaft-parallel', name: 'Original parallel directed shafts', type: 'parallel', suppressed: false, alignment: 'aligned', first: first.first, second: second.first })
    const aligned = ready(session.prepare(document, proposed)); expect(aligned.scopes.at(-1)!.result.localDOF).toBe(1)
    document = session.apply(document, aligned.token).document
    const left = document.occurrences.find(value => value.id === 'left')!, moved = ready(session.move(document, { component: { occurrencePath: ['left'], definition: { ...left.definition } },
      pose: { translation: [...left.pose.translation], rotation: [0, 0, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)] } }))
    const gear = moved.document.mates.find(mate => mate.type === 'gear')!
    if (gear.type !== 'gear') throw new Error('Actual lifted gear required')
    near(gear.angles.first, -Math.PI / 3); near(gear.angles.second, Math.PI / 6)
    expect(moved.scopes.flatMap(scope => scope.result.evidence.groups).every(group => group.seededConstraintIds.length === 0)).toBe(true)
    expect(moved.checks).toHaveLength(6); expect(moved.checks.every(check => check.satisfied)).toBe(true)
    const bore = moved.scene.bodies.find(body => body.component.occurrencePath[0] === 'right')!.faces.find(face => face.worldSupport?.kind === 'cylinder' && Math.abs(face.worldSupport.radius - .25) < 1e-10)!.worldSupport
    if (bore?.kind !== 'cylinder') throw new Error('Actual eccentric marker required')
    vector(bore.point.slice(0, 2), [10 + Math.sqrt(3) / 2, -.5], 1e-6); near(moved.scene.volume, 4800 + 45 * Math.PI / 2, 1e-5); near(moved.scene.area, 2960 + 543 * Math.PI / 4, 1e-5)
  } finally { session.discard() }
}, 60_000)

it.each([false, true])('preserves active/passive native winding at a singular orthogonal direction start (passive=%s)', passive => {
  const base = gearBase(), session = new AssemblyWorkerSession()
  try {
    const first = base.mates.find(mate => mate.id === 'left-axis'), second = base.mates.find(mate => mate.id === 'right-axis')
    if (first?.type !== 'concentric' || second?.type !== 'concentric' || first.first.kind !== 'face' || second.first.kind !== 'face') throw new Error('Actual original bearing axes required')
    const initial = ready(session.prepare(base)), capture = ready(session.captureGear(base, initial.token, { first: first.first, second: second.first,
      carrier: { occurrencePath: ['plate'], definition: { ...base.occurrences.find(value => value.id === 'plate')!.definition } }, ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original singular direction plus gear' }))
    let document = session.apply(base, capture.token).document
    if (passive) {
      const proposed = validateAssemblyDocument(document), gear = proposed.mates.find(mate => mate.type === 'gear')!
      gear.suppressed = true; document = session.apply(document, ready(session.prepare(document, proposed)).token).document
    }
    const before = serializeAssemblyDocument(document), old = ready(session.prepare(document)), proposed = validateAssemblyDocument(document)
    proposed.mates.push({ id: 'singular-direction', name: 'Original exactly parallel shafts requested orthogonal', type: 'perpendicular', suppressed: false, alignment: null, first: first.first, second: second.first })
    const rejected = session.prepare(document, proposed); expect(rejected.status).toBe('rejected'); expect('token' in rejected).toBe(false)
    if (rejected.status === 'rejected') {
      expect(rejected.reason).toBe('numeric'); expect(rejected.scopes.at(-1)!.result.status).toBe('nonConverged')
      expect(rejected.scopes.flatMap(scope => scope.result.evidence.groups).every(group => group.seededConstraintIds.length === 0)).toBe(true)
    }
    expect(serializeAssemblyDocument(document)).toBe(before); expect(() => session.apply(document, old.token)).toThrow('disponible')
  } finally { session.discard() }
}, 60_000)
