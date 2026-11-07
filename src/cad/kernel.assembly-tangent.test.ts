import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { getOC, setOC, Shape, type AnyShape } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument,
  type AssemblyMate, type AssemblyCylinderSurfaceReference, type AssemblyPlaneReference, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { repairAssemblyEndpoint } from '../model/assemblySourceUpdates'
import { identityRigidPose, type Quaternion } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { AssemblyGeometrySnapshot } from './kernel.assembly-snapshot'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneCylinderSurfaceReference, assemblySceneFaceReference, type AssemblyPreviewReply, type AssemblyScene } from './kernel.assembly-types'
import { applyAssemblySolvePreview, discardAssemblySolvePreview, prepareAssemblySolve, prepareAssemblyTranslationPreview, type AssemblySolvePreview } from './kernel.assembly-solve'
import { reviewAssemblyPartSourceUpdate } from './kernel.assembly-source-updates'
import { CadEngine } from './kernel.engine'
import { placeAssemblyShape } from './kernel.assembly-placements'
import { ownedNativeTopology } from './kernel.native-topology'
import { withNativeOwners, type NativeOwners, type NativeOwner } from './kernel.native-ownership'
import * as ownership from './kernel.native-ownership'
import { extractAssemblyFaceSupport } from './kernel.assembly-supports'
import { analyzeAssemblyInterference } from './kernel.assembly-interference'
import * as numericSolver from '../model/assemblySolver'
import type { Vec3 } from './kernel.types'
import { createAssemblyExample } from '../examples/assembly'

let original: AssemblyDocument, originalScene: AssemblyScene
beforeAll(async () => {
  setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) }))
  original = parseAssemblyDocument(await readFile(new URL('./fixtures/assembly-tangent-plane-cylinder-original.json', import.meta.url), 'utf8'))
  originalScene = buildAssemblyScene(original)
}, 60_000)
const fixture = () => validateAssemblyDocument(original)
const near = (a: number, b: number, tolerance = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance)
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0)
function rotate(q: Quaternion, p: Vec3): Vec3 {
  const n = Math.hypot(...q), [x, y, z, w] = q.map(value => value / n)
  // Independent Hamilton q*p*q^-1 Cartesian expansion.
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
function select(scene = originalScene, radius = 2): { plane: AssemblyPlaneReference; cylinder: AssemblyCylinderSurfaceReference } {
  const ground = scene.bodies.find(body => body.component.occurrencePath[0] === 'ground')!, roller = scene.bodies.find(body => body.component.occurrencePath[0] === 'roller')!
  const planeFace = ground.faces.find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - 4) < 1e-8)!,
    cylinderFace = roller.faces.find(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - radius) < 1e-10)!
  const plane = assemblySceneFaceReference(planeFace), cylinder = assemblySceneCylinderSurfaceReference(cylinderFace)
  if (!plane || plane.support !== 'plane' || !cylinder) throw new Error('Actual original native plane and cylindrical surface required')
  return { plane: { ...plane, support: 'plane' }, cylinder }
}
function tangent(side: 'positive' | 'negative' = 'positive', reversed = false, scene = originalScene, radius = 2): Extract<AssemblyMate, { type: 'tangent' }> {
  const refs = select(scene, radius)
  return { id: 'tangent', name: 'Original infinite plane/cylinder tangent', type: 'tangent', suppressed: false, side,
    first: reversed ? refs.cylinder : refs.plane, second: reversed ? refs.plane : refs.cylinder }
}
function ready(value: AssemblyPreviewReply): Extract<AssemblyPreviewReply, { status: 'ready' }> {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
function nativeReady(value: ReturnType<typeof prepareAssemblySolve>): AssemblySolvePreview {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message); return value
}
/** Fresh placed native shapes, independent analytical mass/bounds and support residual. */
function physical(document: AssemblyDocument, side: 'positive' | 'negative', radius = 2, bore = 0, offsetX = 0, prefix: string[] = []): void {
  withNativeOwners(owners => {
    let plane: { point: Vec3; normal: Vec3 } | undefined, cylinder: { point: Vec3; axis: Vec3; radius: number } | undefined
    for (const id of ['ground', 'roller']) {
      const { pose, part } = leaf(document, [...prefix, id])
      const engine = new CadEngine(); owners.own({ delete: () => engine.dispose() })
      const inventory = engine.rebuildForAssemblyReferences(part.document.features)
      if (inventory.kind !== 'explicit' || inventory.bodies.length !== 1) throw new Error('Actual original body required')
      const copy = owners.own(engine.copyCurrentBodyShape(inventory.bodies[0].ref)), shape = owners.own(placeAssemblyShape(copy, pose)), oc = getOC(),
        analyzer = owners.own(new oc.BRepCheck_Analyzer(shape.wrapped, true, false, false)), volume = owners.own(new oc.GProp_GProps()), area = owners.own(new oc.GProp_GProps())
      expect(analyzer.IsValid()).toBe(true); expect(owners.ownAll(ownedNativeTopology(shape, 'solid'))).toHaveLength(1)
      oc.BRepGProp.VolumeProperties(shape.wrapped, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(shape.wrapped, area, false, false)
      near(volume.Mass(), id === 'ground' ? 4800 : 12 * Math.PI * (radius * radius - bore * bore), 1e-5)
      near(area.Mass(), id === 'ground' ? 2960 : 24 * Math.PI * (radius + bore) + 2 * Math.PI * (radius * radius - bore * bore), 1e-5)
      const box = owners.own(shape.boundingBox).bounds, q = pose.rotation, t = pose.translation
      if (id === 'ground') {
        const corners: Vec3[] = []
        for (const x of [-20, 20]) for (const y of [-15, 15]) for (const z of [0, 4]) corners.push(rotate(q, [x, y, z]).map((value, i) => value + t[i]) as Vec3)
        for (let i = 0; i < 3; i++) { near(box[0][i], Math.min(...corners.map(point => point[i]))); near(box[1][i], Math.max(...corners.map(point => point[i]))) }
      } else {
        const a = rotate(q, [0, 0, 1]), offset = rotate(q, [offsetX, 0, 0]), c0 = t.map((value, i) => value + offset[i]), c1 = c0.map((value, i) => value + 12 * a[i])
        for (let i = 0; i < 3; i++) {
          const extent = radius * Math.sqrt(Math.max(0, 1 - a[i] * a[i]))
          near(box[0][i], Math.min(c0[i], c1[i]) - extent); near(box[1][i], Math.max(c0[i], c1[i]) + extent)
        }
      }
      for (const face of owners.ownAll(ownedNativeTopology(shape, 'face'))) {
        const data = extractAssemblyFaceSupport(face)
        if (id === 'ground' && data.kind === 'plane' && dot(data.normal, rotate(q, [0, 0, 1])) > .99) plane = data
        if (id === 'roller' && data.kind === 'cylinder' && Math.abs(data.radius - (bore || radius)) < 1e-9) cylinder = data
      }
    }
    if (!plane || !cylinder) throw new Error('Actual placed native tangent supports required')
    near(Math.asin(Math.min(1, Math.abs(dot(plane.normal, cylinder.axis)))), 0, 1e-8)
    near(dot(plane.normal, cylinder.point.map((value, i) => value - plane!.point[i])), (side === 'positive' ? 1 : -1) * (bore || radius))
  })
}
function solved(side: 'positive' | 'negative' = 'positive'): AssemblyDocument {
  const base = fixture(); base.mates = [tangent(side)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { return validateAssemblyDocument(preview.document) } finally { discardAssemblySolvePreview(preview) }
}

it('reconstructs the original two native solids and analytical initial dimensions without treating the axis as surface intent', () => {
  expect(originalScene.solidCount).toBe(2); expect(originalScene.prototypeCount).toBe(2)
  near(originalScene.volume, 4800 + 48 * Math.PI, 1e-5); near(originalScene.area, 2960 + 56 * Math.PI, 1e-5)
  expect(originalScene.bounds!.min.map(value => Math.round(value * 1e6) / 1e6)).toEqual([-20, -15, 0])
  expect(originalScene.bounds!.max.map(value => Math.round(value * 1e6) / 1e6)).toEqual([20, 15, 12])
  const refs = select(); expect(refs.cylinder.support).toBe('cylinder-surface')
  const face = originalScene.bodies[1].faces.find(face => face.support?.kind === 'cylinder')!
  expect(assemblySceneFaceReference(face)?.support).toBe('axis')
  refs.cylinder.face.key = 'mutated picker intent'; expect(face.selection.face.key).not.toBe(refs.cylinder.face.key)
}, 60_000)

it.each([{ side: 'positive' as const, reversed: false }, { side: 'negative' as const, reversed: false },
  { side: 'positive' as const, reversed: true }, { side: 'negative' as const, reversed: true }])('solves exact native supports $side/order$reversed with rank2 and fresh normal evidence', spec => {
  const base = fixture(); base.mates = [tangent(spec.side, spec.reversed)]; const before = serializeAssemblyDocument(base), preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(preview.scopes.at(-1)!.result.rank).toBe(2); expect(preview.scopes.at(-1)!.result.localDOF).toBe(4)
    expect(preview.checks).toHaveLength(1); expect(preview.checks[0].satisfied).toBe(true)
    expect(preview.tangencies).toEqual([{ scopePath: [], mateId: 'tangent', side: spec.side, radialMaterialSense: 1, normalRelation: spec.side === 'positive' ? 'opposed' : 'same', supportOnly: true }])
    const actual = validateAssemblyDocument(preview.document); expect(actual.mates).toEqual(base.mates); expect(actual.occurrences[0].pose).toEqual(base.occurrences[0].pose)
    physical(actual, spec.side); expect(serializeAssemblyDocument(base)).toBe(before)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it.each(['positive', 'negative'] as const)('retains the six common rigid gauge coordinates for two floating %s support owners', side => {
  const base = fixture(); base.occurrences[0].fixed = false; base.mates = [tangent(side)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.scopes.at(-1)!.result.rank).toBe(2); expect(preview.scopes.at(-1)!.result.localDOF).toBe(10); physical(validateAssemblyDocument(preview.document), side) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('accepts exact fixed supports and certifies an incompatible fixed signed offset without publishing a pose', () => {
  const good = solved(); good.occurrences[1].fixed = true
  const preview = nativeReady(prepareAssemblySolve(good)); expect(preview.scopes.at(-1)!.result.localDOF).toBe(0); discardAssemblySolvePreview(preview)
  const bad = fixture(); bad.occurrences[1].fixed = true; bad.mates = [tangent()]; const result = prepareAssemblySolve(bad)
  expect(result.status).toBe('rejected'); expect('document' in result).toBe(false)
  if (result.status === 'rejected') expect(result.scopes.at(-1)!.result.certificates).toMatchObject([{ kind: 'fixedConstraint' }])
}, 60_000)

it('reports infinite-support tangency when the selected finite parts are disjoint', () => {
  const base = solved(); base.occurrences[1].pose.translation[1] += 100
  const preview = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(preview.document), 'positive'); expect(preview.tangencies![0].supportOnly).toBe(true); expect(analyzeAssemblyInterference(base, { clearance: 1 }).pairs).toEqual([]) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('does not turn same-normal support tangency into material interference prevention', () => {
  const base = solved('negative'), report = analyzeAssemblyInterference(base, { clearance: 0 })
  expect(report.pairs).toHaveLength(1); expect(report.pairs[0].intersectionVolume).toBeGreaterThan(0)
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.tangencies![0].normalRelation).toBe('same'); physical(validateAssemblyDocument(preview.document), 'negative') }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it.each(['positive', 'negative'] as const)('uses the actual inner cylindrical surface for %s side and its independent oriented radial sense', side => {
  const base = fixture(), part = base.definitions.find(value => value.id === 'tangent-roller')!
  if (part.kind !== 'part') throw new Error('Original roller required')
  part.document.features.push({ id: 'bore-profile', name: 'Original R.5 bore', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: .5 } },
    { id: 'bore', name: 'Original through bore', type: 'cut', sketchId: 'bore-profile', depth: 12, symmetric: false, suppressed: false, bodyScope: [{ bodyId: 'roller-body', sourceFeatureId: 'roller-solid' }] })
  base.mates = [tangent(side, false, buildAssemblyScene(base), .5)]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(preview.document), side, 2, .5); expect(preview.tangencies![0]).toMatchObject({ radialMaterialSense: -1, normalRelation: side === 'positive' ? 'same' : 'opposed', supportOnly: true }) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('uses an eccentric native cylinder axis rather than its orbiting component origin', () => {
  const base = fixture(), part = base.definitions.find(value => value.id === 'tangent-roller')!
  if (part.kind !== 'part' || part.document.features[0].type !== 'sketch' || part.document.features[0].profile.kind !== 'circle') throw new Error('Original circle required')
  part.document.features[0].profile.center = [3, 0]; base.mates = [tangent('positive', false, buildAssemblyScene(base))]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { physical(validateAssemblyDocument(preview.document), 'positive', 2, 0, 3); expect(preview.tangencies![0].radialMaterialSense).toBe(1) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('authenticates only a private surface witness and rejects cloned, axis-purpose, stale-content and cross-session proof', () => {
  const base = fixture(), reference = select().cylinder, first = new AssemblyGeometrySnapshot(base), second = new AssemblyGeometrySnapshot(base)
  try {
    const witness = first.resolveCylinderSurfaceReference(base, reference); expect(witness.kind).toBe('cylinder-surface'); expect(witness.origin).toBe('native-cylinder-surface'); expect(Object.isFrozen(witness)).toBe(true)
    expect(first.assertWitness(witness, base)).toBe(witness); expect(() => first.assertWitness(structuredClone(witness), base)).toThrow('verificada'); expect(() => second.assertWitness(witness, base)).toThrow('verificada')
    expect(() => first.resolveReference(base, reference as never)).toThrow('soporte')
    const changed = fixture(); changed.occurrences[1].pose.translation[0] += 1
    expect(() => first.assertWitness(witness, changed)).toThrow('documento cambió')
  } finally { first.dispose(); second.dispose() }
}, 60_000)

it.each(['axis', 'face-kind', 'revision', 'body', 'key', 'path'] as const)('rejects a wrong tangent surface %s without candidate authority', fault => {
  const base = fixture(), relation = tangent(), surface = relation.second
  if (surface.kind !== 'face' || surface.support !== 'cylinder-surface') throw new Error('Original surface intent required')
  if (fault === 'axis') Object.assign(surface, { support: 'axis' })
  else if (fault === 'face-kind') { const plane = select().plane; if (plane.kind !== 'face') throw new Error('Actual native plane required'); surface.component = plane.component; surface.body = plane.body; surface.face = plane.face }
  else if (fault === 'revision') surface.component.definition.revision = 'missing'
  else if (fault === 'body') surface.body = null
  else if (fault === 'key') surface.face.key += '-missing'
  else surface.component.occurrencePath = ['roller', 'ground']
  base.mates = [relation]; const result = prepareAssemblySolve(base)
  expect(result.status).toBe('rejected'); expect('document' in result || 'token' in result).toBe(false)
}, 60_000)

it('keeps surface intent out of existing angle/direction/concentric admission before any native solve', () => {
  const base = fixture(), { plane, cylinder } = select(), oldAxis = { ...cylinder, support: 'axis' }
  for (const declaration of [
    { id: 'bad', name: 'Bad angle', type: 'angle', suppressed: false, first: plane, second: cylinder, angle: 90 },
    { id: 'bad', name: 'Bad parallel', type: 'parallel', suppressed: false, first: plane, second: cylinder, alignment: null },
    { id: 'bad', name: 'Bad concentric', type: 'concentric', suppressed: false, first: oldAxis, second: cylinder, alignment: 'aligned', rotationLock: null },
  ]) {
    const proposed = { ...base, mates: [declaration] }; expect(() => validateAssemblyDocument(proposed)).toThrow()
  }
}, 60_000)

it('preserves one transaction across Cancel, response mutation, Apply, history and fresh reopen', () => {
  const base = fixture(), proposed = fixture(); proposed.mates = [tangent()]
  const history = new AssemblyDocumentHistory(base), session = new AssemblyWorkerSession()
  try {
    const cancel = ready(session.prepare(base, proposed)); session.discard(cancel.token); expect(() => session.apply(base, cancel.token)).toThrow('disponible'); expect(history.current).toEqual(base)
    const preview = ready(session.prepare(base, proposed)); preview.tangencies![0].normalRelation = 'same'; preview.document.mates[0].name = 'Mutated renderer'
    const applied = session.apply(base, preview.token); history.commitDocument(applied.document); expect(applied.document.mates).toEqual(proposed.mates)
    expect(history.undo()).toEqual(base); expect(history.redo()).toEqual(applied.document)
    const reopened = parseAssemblyDocument(serializeAssemblyDocument(history.current)), fresh = ready(session.prepare(reopened)); expect(fresh.tangencies![0].normalRelation).toBe('opposed'); physical(fresh.document, 'positive')
    expect('tangencies' in reopened).toBe(false)
  } finally { session.discard() }
}, 60_000)

it('rejects cloned direct capabilities and stale current documents without committing', () => {
  const base = fixture(); base.mates = [tangent()]; const history = new AssemblyDocumentHistory(base), preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(() => applyAssemblySolvePreview(history, structuredClone(preview))).toThrow('verificada')
    history.commitDocument({ ...base, name: 'Actual new source name' }); expect(() => applyAssemblySolvePreview(history, preview)).toThrow('documento cambió')
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('retains hidden participation and broken suppressed declarations without publishing reports for inactive mates', () => {
  const base = fixture(); base.occurrences[1].visible = false; base.mates = [tangent()]
  const preview = nativeReady(prepareAssemblySolve(base)); expect(preview.tangencies).toHaveLength(1); discardAssemblySolvePreview(preview)
  base.occurrences[1].suppressed = true; expect(prepareAssemblySolve(base).status).toBe('rejected'); base.mates[0].suppressed = true
  const inactive = nativeReady(prepareAssemblySolve(base))
  try { expect(inactive.tangencies).toBeUndefined(); expect(inactive.document.mates).toEqual(base.mates) } finally { discardAssemblySolvePreview(inactive) }
}, 60_000)

it('requires explicit current revision/body surface repair and re-queries the changed native radius', () => {
  const base = solved(), part = base.definitions.find(value => value.id === 'tangent-roller')!
  if (part.kind !== 'part') throw new Error('Original roller required')
  const changed = structuredClone(part.document), profile = changed.features[0]
  if (profile.type !== 'sketch' || profile.profile.kind !== 'circle') throw new Error('Original circle required')
  profile.profile.radius = 2.5
  const review = reviewAssemblyPartSourceUpdate(base, { id: part.id, revision: part.revision }, changed, 'r2')
  expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].status).toBe('needs-repair'); expect(prepareAssemblySolve(review.document).status).toBe('rejected')
  const repaired = repairAssemblyEndpoint(review.document, review.endpoints[0].locator, select(review.scene, 2.5).cylinder), session = new AssemblyWorkerSession()
  try { const preview = ready(session.prepare(base, repaired)); physical(preview.document, 'positive', 2.5); const applied = session.apply(base, preview.token).document; expect(applied.definitions.find(value => value.id === part.id && value.revision === 'r1')).toEqual(part) }
  finally { session.discard() }
}, 60_000)

it('performs a fresh final surface query after an actual solve and rejects a real scalar-query failure', () => {
  const base = fixture(); base.mates = [tangent()]
  let solved = false, queried = 0; const actualSolve = numericSolver.solveRigidMates, actualQuery = CadEngine.prototype.inspectCurrentCylinderSurfaceSupport
  const solve = vi.spyOn(numericSolver, 'solveRigidMates').mockImplementation((problem, options) => { const result = actualSolve(problem, options); if (result.poses) solved = true; return result })
  const query = vi.spyOn(CadEngine.prototype, 'inspectCurrentCylinderSurfaceSupport').mockImplementation(function (this: CadEngine, ...args) {
    const result = actualQuery.apply(this, args); if (solved) { queried++; throw new Error('Original fresh final cylinder surface failure') } return result
  })
  try { const result = prepareAssemblySolve(base); expect(queried).toBe(1); expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.reason).toBe('verification'); expect('tangencies' in result || 'document' in result).toBe(false) }
  finally { query.mockRestore(); solve.mockRestore() }
}, 60_000)

it.each(['positive', 'negative'] as const)('admits clear constant-R translation for the exact infinite plane/cylinder %s subset', side => {
  const base = solved(side), roller = base.occurrences[1]; roller.pose.translation[1] = 100
  const preview = nativeReady(prepareAssemblyTranslationPreview(base, { component: { occurrencePath: ['roller'], definition: { ...roller.definition } }, translation: [34, 100, roller.pose.translation[2]] }))
  try { expect(preview.translation!.trace.status).toBe('complete'); expect(preview.document.occurrences[1].pose.rotation).toEqual(roller.pose.rotation); expect(preview.tangencies![0].side).toBe(side); physical(validateAssemblyDocument(preview.document), side) }
  finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('preserves actual native obstacle stopping while checking only infinite tangent supports', () => {
  const base = solved(), roller = base.occurrences[1]; roller.pose.translation = [-6, 100, 6]; roller.pose.rotation = [0, Math.SQRT1_2, 0, Math.SQRT1_2]
  const obstacle = structuredClone(base.definitions[0])
  if (obstacle.kind !== 'part' || obstacle.document.features[0].type !== 'sketch' || obstacle.document.features[0].profile.kind !== 'rectangle' || obstacle.document.features[1].type !== 'extrude') throw new Error('Original rectangle required')
  obstacle.id = 'obstacle'; obstacle.document.id = obstacle.id; obstacle.document.features[0].profile.width = .2; obstacle.document.features[0].profile.height = 8; obstacle.document.features[1].depth = 8
  base.definitions.push(obstacle); base.occurrences.push({ id: 'obstacle', name: 'Original thin obstacle', definition: { id: obstacle.id, revision: obstacle.revision }, pose: { ...identityRigidPose(), translation: [20, 100, 2] }, fixed: true, visible: true, suppressed: false })
  const preview = nativeReady(prepareAssemblyTranslationPreview(base, { component: { occurrencePath: ['roller'], definition: { ...roller.definition } }, translation: [34, 100, 6] }))
  try {
    expect(preview.translation!.trace.status).toBe('stopped'); const x = preview.document.occurrences[1].pose.translation[0]; expect(x).toBeLessThan(7.9); near(x, 7.9, 1e-5)
    expect(preview.tangencies![0]).toMatchObject({ normalRelation: 'opposed', supportOnly: true }); expect(preview.document.occurrences[1].pose.rotation).toEqual(roller.pose.rotation)
    expect(preview.scopes.at(-1)!.result.localDOF).toBe(4)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it('carries only the last freshly checked support report through explicit angular stations', () => {
  const base = solved(), session = new AssemblyWorkerSession(), roller = base.occurrences[1]
  try {
    const preview = ready(session.moveMotion(base, { component: { occurrencePath: ['roller'], definition: { ...roller.definition } }, translation: [...roller.pose.translation], rotation: { axis: 2, angle: 2 * Math.PI / 3 } }))
    expect(preview.motion!.verifiedStations).toBe(2); expect(preview.tangencies).toEqual([{ scopePath: [], mateId: 'tangent', side: 'positive', radialMaterialSense: 1, normalRelation: 'opposed', supportOnly: true }]); physical(preview.document, 'positive')
  } finally { session.discard() }
}, 60_000)

it('keeps satisfied same-owner tangent supports at rank0 and rejects an impossible relative side without poses', () => {
  const base = fixture(), roller = base.occurrences[1], part = base.definitions.find(value => value.id === 'tangent-roller')!
  if (part.kind !== 'part' || part.document.features[0].type !== 'sketch' || part.document.features[0].profile.kind !== 'circle') throw new Error('Original circle required')
  part.document.features[0].profile.center = [2, 0]; base.occurrences = [roller]
  const scene = buildAssemblyScene(base), face = scene.bodies[0].faces.find(face => face.support?.kind === 'cylinder')!, surface = assemblySceneCylinderSurfaceReference(face)!
  base.mates = [{ id: 'self', name: 'Original same-owner support tangent', type: 'tangent', suppressed: false, side: 'positive',
    first: { kind: 'principal-plane', component: { occurrencePath: ['roller'], definition: { ...roller.definition } }, plane: 'YZ' }, second: surface }]
  const preview = nativeReady(prepareAssemblySolve(base))
  try { expect(preview.scopes.at(-1)!.result.rank).toBe(0); expect(preview.scopes.at(-1)!.result.localDOF).toBe(6); expect(preview.document.occurrences[0].pose).toEqual(roller.pose); expect(preview.tangencies![0].supportOnly).toBe(true) }
  finally { discardAssemblySolvePreview(preview) }
  if (base.mates[0].type !== 'tangent') throw new Error('Actual tangent required'); base.mates[0].side = 'negative'
  const saved = serializeAssemblyDocument(base), result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('document' in result).toBe(false); expect(serializeAssemblyDocument(base)).toBe(saved)
}, 60_000)

it('retains compatible redundancy and atomically rejects two incompatible sides', () => {
  const base = fixture(); base.mates = [tangent(), { ...tangent(), id: 'duplicate' }]
  const preview = nativeReady(prepareAssemblySolve(base)); expect(preview.scopes.at(-1)!.result.rank).toBe(2); expect(preview.tangencies).toHaveLength(2); discardAssemblySolvePreview(preview)
  base.mates[1] = { ...tangent('negative'), id: 'contradiction' }
  const result = prepareAssemblySolve(base); expect(result.status).toBe('rejected'); expect('tangencies' in result || 'document' in result).toBe(false)
}, 60_000)

it('solves one shared declaration and verifies fresh world supports/reports under two noncommuting parent rotations', () => {
  const base = fixture(), group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'tangent-group', revision: 'r1', name: 'Original reused support pair',
    createdAt: base.createdAt, updatedAt: base.updatedAt, occurrences: structuredClone(base.occurrences), mates: [tangent()] }
  base.definitions.push(group)
  base.occurrences = [
    { id: 'A', name: 'Z90 group', definition: { id: group.id, revision: group.revision }, pose: { translation: [50, 0, 0], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false },
    { id: 'B', name: 'X90 hidden group', definition: { id: group.id, revision: group.revision }, pose: { translation: [-40, 30, 10], rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] }, fixed: true, visible: false, suppressed: false },
  ]
  const preview = nativeReady(prepareAssemblySolve(base))
  try {
    expect(preview.scopes.map(scope => scope.definition.id)).toEqual([group.id, base.id]); expect(preview.scopes[0].result.localDOF).toBe(4); expect(preview.scopes[1].result.localDOF).toBe(0)
    expect(preview.tangencies?.map(report => report.scopePath)).toEqual([['A'], ['B']]); expect(preview.tangencies?.every(report => report.radialMaterialSense === 1 && report.normalRelation === 'opposed' && report.supportOnly)).toBe(true)
    const actual = validateAssemblyDocument(preview.document); physical(actual, 'positive', 2, 0, 0, ['A']); physical(actual, 'positive', 2, 0, 0, ['B'])
    const scene = buildAssemblyScene(actual); expect(scene.solidCount).toBe(4); expect(scene.prototypeCount).toBe(2); expect(scene.bodies.filter(body => !body.visible)).toHaveLength(2)
    near(scene.volume, 9600 + 96 * Math.PI, 1e-5); near(scene.area, 5920 + 112 * Math.PI, 1e-5); expect(actual.occurrences).toEqual(base.occurrences)
  } finally { discardAssemblySolvePreview(preview) }
}, 60_000)

it.each(['mesh', 'cleanup'] as const)('withholds worker tokens and reports on actual final scene %s failure after native preparation', fault => {
  const base = fixture(), proposed = fixture(); proposed.mates = [tangent()]
  const session = new AssemblyWorkerSession(), previous = ready(session.prepare(base)), source = serializeAssemblyDocument(base), failure = new Error('Original final scene ' + fault + ' failure')
  let reached = false, releases = 0
  const actualMesh = Shape.prototype.mesh, arena = ownership.withNativeOwners
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
  try {
    expect(() => session.prepare(base, proposed)).toThrow(); expect(reached).toBe(true); expect(releases).toBe(fault === 'cleanup' ? 1 : 0)
    expect(() => session.apply(base, previous.token)).toThrow('disponible'); expect(serializeAssemblyDocument(base)).toBe(source)
  } finally { owners.mockRestore(); mesh.mockRestore(); session.discard() }
  const fresh = ready(session.prepare(base, proposed)); expect(fresh.tangencies).toHaveLength(1); session.discard()
}, 60_000)

it('preserves native gear winding and authenticated Apply when an infinite tangent support is added to its guided shaft', () => {
  const base = createAssemblyExample()
  for (const [id, x] of [['left', -10], ['right', 10]] as const) base.occurrences.find(value => value.id === id)!.pose = { ...identityRigidPose(), translation: [x, 0, -8] }
  const scene = buildAssemblyScene(base), faces = (id: string) => scene.bodies.find(body => body.component.occurrencePath[0] === id)!.faces
  const axis = (id: string, r: number, x: number) => {
    const face = faces(id).find(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - r) < 1e-9 && Math.abs(face.support.point[0] - x) < 1e-9)!, ref = assemblySceneFaceReference(face)
    if (!ref || ref.support !== 'axis') throw new Error('Actual original bearing axis required'); return { ...ref, support: 'axis' as const }
  }
  const cap = (id: string, z: number) => {
    const ref = assemblySceneFaceReference(faces(id).find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - z) < 1e-9)!)
    if (!ref || ref.support !== 'plane') throw new Error('Actual original native cap required'); return { ...ref, support: 'plane' as const }
  }
  base.mates = []
  for (const [id, x] of [['left', -10], ['right', 10]] as const) base.mates.push(
    { id: id + '-axis', name: id + ' bearing', type: 'concentric', suppressed: false, alignment: 'aligned', rotationLock: null, first: axis(id, 2, 0), second: axis('plate', 3, x) },
    { id: id + '-cap', name: id + ' cap', type: 'coincident', suppressed: false, alignment: 'aligned', first: cap(id, 12), second: cap('plate', 4) })
  const wall = structuredClone(original.definitions[0]); if (wall.kind !== 'part') throw new Error('Original rectangular wall required')
  wall.id = 'tangent-wall'; wall.document.id = wall.id; base.definitions.push(wall)
  base.occurrences.push({ id: 'wall', name: 'Original wall tangent to shaft', definition: { id: wall.id, revision: wall.revision }, pose: { translation: [-16, 0, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }, fixed: true, visible: true, suppressed: false })
  const session = new AssemblyWorkerSession()
  try {
    const initial = ready(session.prepare(base)), capture = ready(session.captureGear(base, initial.token, { first: axis('left', 2, 0), second: axis('right', 2, 0),
      carrier: { occurrencePath: ['plate'], definition: { ...base.occurrences.find(value => value.id === 'plate')!.definition } }, ratio: { numerator: 1, denominator: 2 }, direction: 'opposed', name: 'Original gear with tangent support' }))
    let document = session.apply(base, capture.token).document
    const currentScene = buildAssemblyScene(document), wallFace = currentScene.bodies.find(body => body.component.occurrencePath[0] === 'wall')!.faces.find(face => face.support?.kind === 'plane' && face.support.normal[2] > .99 && Math.abs(face.support.point[2] - 4) < 1e-9)!,
      shaftFace = currentScene.bodies.find(body => body.component.occurrencePath[0] === 'left')!.faces.find(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - 2) < 1e-9)!, plane = assemblySceneFaceReference(wallFace), surface = assemblySceneCylinderSurfaceReference(shaftFace)
    if (!plane || plane.support !== 'plane' || !surface) throw new Error('Actual wall/shaft surface pair required')
    const proposed = validateAssemblyDocument(document); proposed.mates.push({ id: 'tangent', name: 'Original infinite shaft/wall tangent', type: 'tangent', suppressed: false, side: 'positive', first: { ...plane, support: 'plane' }, second: surface })
    const supported = ready(session.prepare(document, proposed)); expect(supported.scopes.at(-1)!.result.localDOF).toBe(1); document = session.apply(document, supported.token).document
    const left = document.occurrences.find(value => value.id === 'left')!, moved = ready(session.move(document, { component: { occurrencePath: ['left'], definition: { ...left.definition } },
      pose: { translation: [...left.pose.translation], rotation: [0, 0, Math.sin(Math.PI / 6), Math.cos(Math.PI / 6)] } }))
    const gear = moved.document.mates.find(mate => mate.type === 'gear')!; if (gear.type !== 'gear') throw new Error('Actual saved winding required')
    near(gear.angles.first, -Math.PI / 3, 1e-8); near(gear.angles.second, Math.PI / 6, 1e-8)
    expect(moved.tangencies).toEqual([{ scopePath: [], mateId: 'tangent', side: 'positive', radialMaterialSense: 1, normalRelation: 'opposed', supportOnly: true }])
    expect(moved.scopes.flatMap(scope => scope.result.evidence.groups).every(group => group.seededConstraintIds.length === 0)).toBe(true)
    expect(moved.scene.solidCount).toBe(4); near(moved.scene.volume, 9600 + 45 * Math.PI / 2, 1e-5); near(moved.scene.area, 5920 + 543 * Math.PI / 4, 1e-5)
    const committed = session.apply(document, moved.token).document, wrong = validateAssemblyDocument(committed), relation = wrong.mates.find(mate => mate.type === 'tangent')!
    if (relation.type !== 'tangent') throw new Error('Actual tangent required'); relation.side = 'negative'
    const source = serializeAssemblyDocument(committed), rejected = session.prepare(committed, wrong); expect(rejected.status).toBe('rejected'); expect('token' in rejected || 'tangencies' in rejected).toBe(false); expect(serializeAssemblyDocument(committed)).toBe(source)
  } finally { session.discard() }
}, 60_000)
