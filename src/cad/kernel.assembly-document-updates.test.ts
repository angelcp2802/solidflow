import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { validateDocument } from '../model/document'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyOccurrence,
  type AssemblyFaceReference, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { isAssemblyProfileCenterEndpoint } from '../model/assemblyMateEndpoints'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose } from '../model/rigidPose'
import { reviewAssemblyDocumentSourceUpdate, prepareAssemblyDocumentUpdateDecisions } from './kernel.assembly-document-updates'
import { assemblyDocumentUpdateChoices, type AssemblyDocumentUpdateReview, type AssemblyDocumentUpdateDecisions } from './kernel.assembly-document-update-types'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { buildAssemblyScene } from './kernel.assembly-scene'
import { assemblySceneFaceReference, type AssemblyScene, type AssemblyPreviewReply } from './kernel.assembly-types'
import { NativeCleanupError } from './kernel.native-ownership'
import * as placements from './kernel.assembly-placements'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)

// Original GPL-3.0-only rectangles, not external or native-reference models.
// M0=[0,2]x[0,3]x[0,4]: V24/A52. M1 width3: V36/A66.
// The authored inner Rz90+t[1,2,3] maps (x,y,z) to (1-y,2+x,3+z).
// Literal world bounds below are independent of the placement/solve helpers.
const stamp = '2026-10-22T00:00:00.000Z', oldSource = { id: 'original-source', revision: 'r0' }
const reference = (value: { id: string; revision: string }) => ({ id: value.id, revision: value.revision })
function material(width = 2, revision = width === 2 ? 'r0' : 'r1') {
  return { kind: 'part' as const, id: 'original-material', revision, document: validateDocument({ version: 1, id: 'original-material',
    name: 'Original rectangular material', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [width / 2, 1.5], width, height: 3 } },
      { id: 'solid', name: 'Original extrusion 4 mm', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false,
        suppressed: false, bodyOperation: { mode: 'new', bodyId: 'material-body' } },
    ] }) }
}
const occurrence = (id: string, definition = oldSource, x = 0): AssemblyOccurrence => ({ id, name: id, definition: reference(definition),
  pose: { ...identityRigidPose(), translation: [x, 0, 0] }, fixed: true, visible: true, suppressed: false })
function source(width = 2, child = 'm', innerX = 1): AssemblyDocument {
  const value = createEmptyAssembly('Original reusable source'), part = material(width)
  Object.assign(value, { id: oldSource.id, revision: width === 2 && innerX === 1 && child === 'm' ? 'r0' : 'r1', createdAt: stamp, updatedAt: stamp })
  value.definitions = [part]
  value.occurrences = [{ ...occurrence(child, part), pose: { translation: [innerX, 2, 3], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] } }]
  return validateAssemblyDocument(value)
}
function embedded(value: AssemblyDocument): EmbeddedAssemblyDefinition {
  const { version: _version, units: _units, definitions: _definitions, ...node } = value
  return node
}
function fixture(incoming = source(3)) {
  const prior = source(), base = createEmptyAssembly('Original source-update parent')
  base.definitions = [...prior.definitions, embedded(prior)]
  base.occurrences = [occurrence('left', oldSource, -10), occurrence('right', oldSource, 20)]
  return { base: validateAssemblyDocument(base), incoming }
}
const near = (a: number, b: number, tolerance = 1e-5) => expect(Math.abs(a - b)).toBeLessThan(tolerance)
function vector(a: readonly number[], b: readonly number[]) { expect(a).toHaveLength(b.length); a.forEach((v, i) => near(v, b[i], 1e-6)) }
function top(scene: AssemblyScene, path: string[]): AssemblyFaceReference & { support: 'plane' } {
  const faces = scene.bodies.filter(b => JSON.stringify(b.component.occurrencePath) === JSON.stringify(path)).flatMap(b => b.faces)
    .filter(f => f.worldSupport?.kind === 'plane' && f.worldSupport.normal[2] > .99 && Math.abs(f.worldSupport.point[2] - 7) < 1e-6)
  expect(faces).toHaveLength(1)
  const reference = assemblySceneFaceReference(faces[0])
  if (!reference || reference.support !== 'plane') throw new Error('Expected actual original top plane')
  return { ...reference, support: 'plane' }
}
function mated(input: AssemblyDocument, path = ['left', 'm']): AssemblyDocument {
  input.mates.push({ id: 'external-plane', name: 'Original external parallel plane', type: 'parallel', suppressed: false,
    first: { kind: 'principal-plane', component: null, plane: 'XY' }, second: top(buildAssemblyScene(input), path), alignment: 'aligned' })
  return validateAssemblyDocument(input)
}
const empty = (): AssemblyDocumentUpdateDecisions => ({ repairs: [], removed: [], recapture: [], unlocked: [] })
function repaired(review: AssemblyDocumentUpdateReview): AssemblyDocumentUpdateDecisions {
  const decisions = empty(), body = review.replacementCatalog.bodies[0]
  const actual = top(review.replacementCatalog, body.component.occurrencePath)
  for (const endpoint of review.endpoints) {
    const original = endpoint.endpoint, component = { occurrencePath: [...endpoint.boundary.occurrencePath, ...body.component.occurrencePath], definition: { ...body.component.definition } }
    if (isAssemblyProfileCenterEndpoint(original) || 'startVertex' in original) throw Error('This original plane repair fixture does not supply a compound selection.')
    const reference = 'occurrencePath' in original ? component : original.kind === 'principal-plane'
      ? { ...original, component } : { ...actual, component }
    decisions.repairs.push({ locator: structuredClone(endpoint.locator), reference })
  }
  return decisions
}
function ready(value: AssemblyPreviewReply) {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function geometry(scene: AssemblyScene, child = 'm') {
  expect(scene.bodies).toHaveLength(2); expect(scene.solidCount).toBe(2); near(scene.volume, 72); near(scene.area, 132)
  vector(scene.bounds!.min, [-12, 2, 3]); vector(scene.bounds!.max, [21, 5, 7])
  for (const [root, low, high] of [['left', [-12, 2, 3], [-9, 5, 7]], ['right', [18, 2, 3], [21, 5, 7]]] as const) {
    const found = scene.bodies.filter(b => JSON.stringify(b.component.occurrencePath) === JSON.stringify([root, child]))
    expect(found).toHaveLength(1); near(found[0].volume, 36); near(found[0].area, 66); vector(found[0].bounds.min, low); vector(found[0].bounds.max, high)
  }
}

it('builds both reused updated prisms at independently calculated bounds without changing either source', () => {
  const { base, incoming } = fixture(), before = serializeAssemblyDocument(base), sourceBefore = serializeAssemblyDocument(incoming)
  const old = buildAssemblyScene(base); near(old.volume, 48); near(old.area, 104); vector(old.bounds!.max, [21, 4, 7])
  const { review } = reviewAssemblyDocumentSourceUpdate(base, oldSource, incoming)
  geometry(review.scene); expect(review.occurrences.map(v => v.occurrenceId)).toEqual(['left', 'right']); expect(review.endpoints).toEqual([])
  expect('token' in review).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before); expect(serializeAssemblyDocument(incoming)).toBe(sourceBefore)
  expect(review.document.occurrences.map(v => v.pose)).toEqual(base.occurrences.map(v => v.pose))
}, 60_000)

it('updates dormant source uses while leaving the independent old material occurrence and history intact', () => {
  const { base, incoming } = fixture(), dormant = embedded(createEmptyAssembly('Original dormant scope'))
  dormant.occurrences = [occurrence('dormant-use')]; base.definitions.push(dormant)
  base.occurrences.push(occurrence('outside', material(), 50)); const before = serializeAssemblyDocument(base)
  const { review } = reviewAssemblyDocumentSourceUpdate(base, oldSource, incoming)
  expect(review.occurrences.map(v => v.occurrenceId)).toEqual(['left', 'right', 'dormant-use'])
  expect(review.scene.solidCount).toBe(3); near(review.scene.volume, 96); near(review.scene.area, 184)
  vector(review.scene.bounds!.min, [-12, 0, 0]); vector(review.scene.bounds!.max, [52, 5, 7])
  expect(review.document.occurrences[2].definition).toEqual({ id: material().id, revision: 'r0' })
  expect(review.document.definitions.find(v => v.id === oldSource.id && v.revision === 'r0')).toEqual(base.definitions.find(v => v.id === oldSource.id))
  expect(review.document.definitions.find(v => v.id === material().id && v.revision === 'r0')).toEqual(material())
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('finds changed ancestor geometry even when the terminal part tuple and local face are unchanged', () => {
  const { base: raw, incoming } = fixture(source(2, 'm', 5)), base = mated(raw), { review } = reviewAssemblyDocumentSourceUpdate(base, oldSource, incoming)
  expect(review.endpoints).toHaveLength(1)
  expect(review.endpoints[0].desiredComponent?.definition).toEqual({ id: material().id, revision: 'r0' })
  near(review.scene.volume, 48); near(review.scene.area, 104); vector(review.scene.bounds!.min, [-8, 2, 3]); vector(review.scene.bounds!.max, [25, 4, 7])
  const oldBody = buildAssemblyScene(base).bodies.find(v => v.component.occurrencePath[0] === 'left')!, newBody = review.scene.bodies.find(v => v.component.occurrencePath[0] === 'left')!
  expect(newBody.component.definition).toEqual(oldBody.component.definition); expect(newBody.faces.map(v => v.selection.face)).toEqual(oldBody.faces.map(v => v.selection.face))
  expect(review.endpoints[0].status).toBe('needs-repair')
}, 60_000)

it('requires explicit repair for changed old-leaf geometry despite the same part identity and body producer', () => {
  const { base: raw, incoming } = fixture(), base = mated(raw), prepared = reviewAssemblyDocumentSourceUpdate(base, oldSource, incoming)
  expect(prepared.review.endpoints).toHaveLength(1); expect(prepared.review.endpoints[0].status).toBe('needs-repair')
  expect(() => prepareAssemblyDocumentUpdateDecisions(prepared.plan, prepared.catalog, prepared.review, empty())).toThrow(/pendientes/)
  const chosen = repaired(prepared.review), next = prepareAssemblyDocumentUpdateDecisions(prepared.plan, prepared.catalog, prepared.review, chosen)
  expect(next.proposal.mates[0].type).toBe('parallel'); expect(next.recapture).toEqual([])
  expect(chosen.repairs[0].reference).toMatchObject({ kind: 'face', component: { occurrencePath: ['left', 'm'], definition: { id: material().id, revision: 'r1' } } })
}, 60_000)

it('offers renamed current descendants and rejects stale or other-boundary repairs', () => {
  const { base: raw, incoming } = fixture(source(3, 'renamed')), base = mated(raw), prepared = reviewAssemblyDocumentSourceUpdate(base, oldSource, incoming), endpoint = prepared.review.endpoints[0]
  expect(endpoint.afterResolution).toBe('missing-path'); expect(endpoint.desiredComponent).toBeUndefined()
  const choices = assemblyDocumentUpdateChoices(prepared.review, endpoint)
  expect(choices).toHaveLength(6); expect(choices.every(v => 'component' in v.reference && v.reference.component?.occurrencePath.join('/') === 'left/renamed')).toBe(true)
  for (const wrong of [base.mates[0].type === 'parallel' ? base.mates[0].second : null, { ...repaired(prepared.review).repairs[0].reference, component: { occurrencePath: ['right', 'renamed'], definition: { id: material().id, revision: 'r1' } } }]) {
    const decisions = repaired(prepared.review); decisions.repairs[0].reference = wrong as typeof decisions.repairs[0]['reference']
    expect(() => prepareAssemblyDocumentUpdateDecisions(prepared.plan, prepared.catalog, prepared.review, decisions)).toThrow(/catálogo/)
  }
  const session = new AssemblyWorkerSession(), review = session.reviewDocumentUpdate(base, oldSource, incoming)
  try { const preview = ready(session.previewDocumentUpdate(base, review.reviewId, repaired(review))); geometry(preview.scene, 'renamed'); expect(preview.checks.every(v => v.satisfied)).toBe(true) } finally { session.discard() }
}, 60_000)

it('requires all four grouped width roles and verifies their exact repaired native planes', () => {
  const { base, incoming } = fixture(source(3, 'renamed'))
  base.occurrences = [-10, 20, 50, 80].map((x, i) => occurrence('use-' + i, oldSource, x))
  const scene = buildAssemblyScene(base), refs = base.occurrences.map(v => top(scene, [v.id, 'm']))
  base.mates = [{ id: 'four-planes', name: 'Original four-role top planes', type: 'width', mode: 'centered', suppressed: false,
    width: [refs[0], refs[1]], tab: [refs[2], refs[3]], widthBranch: 'sum', tabBranch: 'sum', alignment: 'aligned' }]
  const session = new AssemblyWorkerSession(), review = session.reviewDocumentUpdate(base, oldSource, incoming), decisions = repaired(review)
  try {
    expect(review.endpoints.map(v => v.locator.side)).toEqual(['width-0', 'width-1', 'tab-0', 'tab-1'])
    expect(() => session.previewDocumentUpdate(base, review.reviewId, { ...decisions, repairs: decisions.repairs.slice(0, 3) })).toThrow(/pendientes/)
    const duplicate = structuredClone(decisions); duplicate.repairs[3] = duplicate.repairs[2]
    expect(() => session.previewDocumentUpdate(base, review.reviewId, duplicate)).toThrow(/único/)
    const preview = ready(session.previewDocumentUpdate(base, review.reviewId, decisions))
    expect(preview.scene.solidCount).toBe(4); near(preview.scene.volume, 144); near(preview.scene.area, 264); expect(preview.checks.every(v => v.satisfied)).toBe(true)
    expect(preview.document.occurrences.map(v => v.pose)).toEqual(base.occurrences.map(v => v.pose))
  } finally { session.discard() }
}, 60_000)

it('keeps incoming null planes in their own declaring frame through a fresh hierarchical solve', () => {
  const { base, incoming } = fixture()
  incoming.mates.push({ id: 'source-distance', name: 'Original local 3 mm plane distance', type: 'distance', suppressed: false, distance: 3, alignment: 'aligned',
    first: { kind: 'principal-plane', component: { occurrencePath: ['m'], definition: reference(material(3)) }, plane: 'XY' }, second: { kind: 'principal-plane', component: null, plane: 'XY' } })
  base.mates.push({ id: 'root-distance', name: 'Original root 3 mm plane distance', type: 'distance', suppressed: false, distance: 3, alignment: 'aligned',
    first: { kind: 'principal-plane', component: { occurrencePath: ['left', 'm'], definition: reference(material()) }, plane: 'XY' }, second: { kind: 'principal-plane', component: null, plane: 'XY' } })
  const session = new AssemblyWorkerSession(), review = session.reviewDocumentUpdate(base, oldSource, incoming)
  try {
    const preview = ready(session.previewDocumentUpdate(base, review.reviewId, repaired(review))); geometry(preview.scene)
    expect(preview.checks).toHaveLength(3); expect(preview.checks.every(v => v.satisfied)).toBe(true)
    const node = preview.document.definitions.find(v => v.id === oldSource.id && v.revision === 'r1')!
    if (node.kind !== 'assembly' || node.mates[0].type !== 'distance' || preview.document.mates[0].type !== 'distance') throw Error('Expected original plane distances')
    expect(node.mates[0].second).toEqual({ kind: 'principal-plane', component: null, plane: 'XY' }); expect(preview.document.mates[0].second).toEqual(node.mates[0].second)
  } finally { session.discard() }
}, 60_000)

it('distinguishes suppressed scene geometry from explicit repair or removal of its saved references', () => {
  const { base: raw, incoming } = fixture(), base = mated(raw); base.mates[0].suppressed = true; base.occurrences[0].suppressed = true; base.occurrences[1].visible = false
  const session = new AssemblyWorkerSession(), review = session.reviewDocumentUpdate(base, oldSource, incoming)
  try {
    expect(review.scene.solidCount).toBe(1); near(review.scene.volume, 36); near(review.scene.area, 66); expect(review.replacementCatalog.solidCount).toBe(1)
    expect(review.endpoints).toHaveLength(1); expect(() => session.previewDocumentUpdate(base, review.reviewId, empty())).toThrow(/pendientes/)
    const removed = empty(); removed.removed = [{ scope: { id: base.id, revision: base.revision }, mateId: base.mates[0].id }]
    const preview = ready(session.previewDocumentUpdate(base, review.reviewId, removed))
    expect(preview.document.mates).toEqual([]); expect(preview.document.occurrences[0].suppressed).toBe(true); expect(preview.document.occurrences[1].visible).toBe(false)
  } finally { session.discard() }
}, 60_000)

it('requires an explicit fresh recapture or removal of a crossed component lock', () => {
  const { base, incoming } = fixture(); base.occurrences.push(occurrence('outside', material(), 50))
  const session = new AssemblyWorkerSession(), initial = ready(session.prepare(base))
  const locked = ready(session.captureComponents(base, initial.token, { occurrencePath: ['outside'], definition: reference(material()) }, { occurrencePath: ['left', 'm'], definition: reference(material()) }))
  const current = session.apply(base, locked.token).document, review = session.reviewDocumentUpdate(current, oldSource, incoming), decisions = repaired(review)
  try {
    expect(review.capturedMates.map(v => v.type)).toEqual(['lock'])
    expect(() => session.previewDocumentUpdate(current, review.reviewId, decisions)).toThrow(/capturado/)
    decisions.recapture = review.capturedMates.map(({ scope, mateId }) => ({ scope, mateId }))
    const preview = ready(session.previewDocumentUpdate(current, review.reviewId, decisions))
    expect(preview.checks.every(v => v.satisfied)).toBe(true); expect(preview.document.mates[0].id).toBe(current.mates[0].id); expect(preview.document.mates[0].type).toBe('lock')
    near(preview.scene.volume, 96); near(preview.scene.area, 184)
  } finally { session.discard() }
}, 60_000)

it('freshly recaptures a suppressed concentric lock and restores its saved suppression', () => {
  const prior = source(), part = prior.definitions[0]
  if (part.kind !== 'part') throw Error('Expected original source material')
  part.document.features = [
    { id: 'circle', name: 'Original R1 circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius: 1 } },
    { id: 'solid', name: 'Original cylinder H4', type: 'extrude', sketchId: 'circle', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'material-body' } },
  ]
  prior.occurrences[0].pose = identityRigidPose()
  const base = createEmptyAssembly('Original concentric source update')
  base.definitions = [...prior.definitions, embedded(prior)]; base.occurrences = [occurrence('left'), occurrence('right')]
  base.occurrences[1].pose.translation = [0, 0, 6]; base.occurrences[1].fixed = false
  const axes = buildAssemblyScene(base).bodies.map(body => {
    const face = body.faces.find(f => f.support?.kind === 'cylinder')!, value = assemblySceneFaceReference(face)
    if (!value || value.support !== 'axis') throw Error('Expected actual native cylinder axis')
    return { ...value, support: 'axis' as const }
  })
  base.mates = [{ id: 'original-concentric', name: 'Original native concentric spin', type: 'concentric', suppressed: false,
    first: axes[0], second: axes[1], alignment: 'aligned', rotationLock: null }]
  const session = new AssemblyWorkerSession(), initial = ready(session.prepare(base)), locked = ready(session.captureRotation(base, initial.token, base.mates[0].id))
  const current = session.apply(base, locked.token).document; current.mates[0].suppressed = true
  const before = serializeAssemblyDocument(current), incoming = structuredClone(prior); incoming.revision = 'r1'; incoming.occurrences[0].pose.translation[2] = 1
  const review = session.reviewDocumentUpdate(current, oldSource, incoming), decisions = empty()
  for (const endpoint of review.endpoints) {
    const body = review.replacementCatalog.bodies[0], face = body.faces.find(f => f.support?.kind === 'cylinder')!, axis = assemblySceneFaceReference(face)
    if (!axis || axis.support !== 'axis') throw Error('Expected actual updated cylinder axis')
    decisions.repairs.push({ locator: endpoint.locator, reference: { ...axis, support: 'axis', component: {
      occurrencePath: [...endpoint.boundary.occurrencePath, ...body.component.occurrencePath], definition: { ...body.component.definition } } } })
  }
  decisions.recapture = review.capturedMates.map(({ scope, mateId }) => ({ scope, mateId }))
  try {
    const preview = ready(session.previewDocumentUpdate(current, review.reviewId, decisions)), mate = preview.document.mates[0]
    expect(mate.type).toBe('concentric'); expect(mate.suppressed).toBe(true)
    if (mate.type !== 'concentric') throw Error('Expected preserved concentric family')
    expect(mate.rotationLock).not.toBeNull(); expect(mate.id).toBe('original-concentric'); expect(preview.scene.solidCount).toBe(2)
    near(preview.scene.volume, 8 * Math.PI); near(preview.scene.area, 20 * Math.PI)
    expect(serializeAssemblyDocument(current)).toBe(before)
  } finally { session.discard() }
}, 60_000)

it('rejects executable, sparse, duplicate and unknown decisions before trusting any accessor', () => {
  const { base: raw, incoming } = fixture(), base = mated(raw), prepared = reviewAssemblyDocumentSourceUpdate(base, oldSource, incoming); let calls = 0
  const malicious = { ...empty(), get repairs() { calls++; return [] } }
  expect(() => prepareAssemblyDocumentUpdateDecisions(prepared.plan, prepared.catalog, prepared.review, malicious)).toThrow(/accesores/); expect(calls).toBe(0)
  const sparse = empty(); sparse.repairs = Array(1)
  expect(() => prepareAssemblyDocumentUpdateDecisions(prepared.plan, prepared.catalog, prepared.review, sparse)).toThrow(/densa/)
  const duplicate = repaired(prepared.review); duplicate.repairs.push(duplicate.repairs[0])
  expect(() => prepareAssemblyDocumentUpdateDecisions(prepared.plan, prepared.catalog, prepared.review, duplicate)).toThrow(/acotada|único/)
  expect(() => prepareAssemblyDocumentUpdateDecisions(prepared.plan, prepared.catalog, prepared.review, { ...empty(), candidate: base } as AssemblyDocumentUpdateDecisions)).toThrow(/desconocidos/)
}, 60_000)

it('keeps forged review and scene DTOs powerless and commits one update with exact undo and native reopening', () => {
  const { base, incoming } = fixture(), before = serializeAssemblyDocument(base), session = new AssemblyWorkerSession(), history = new AssemblyDocumentHistory(base)
  const review = session.reviewDocumentUpdate(base, oldSource, incoming), id = review.reviewId
  review.document.occurrences[0].pose.translation[0] = 999; review.scene.bodies.length = 0; review.endpoints.length = 0
  const preview = ready(session.previewDocumentUpdate(base, id, empty())); geometry(preview.scene); preview.document.name = 'Forged reply'
  const applied = session.apply(base, preview.token); expect(applied.document.name).toBe(base.name); geometry(applied.scene)
  history.commitDocument(applied.document); expect(serializeAssemblyDocument(history.undo())).toBe(before)
  const reopened = validateAssemblyDocument(JSON.parse(serializeAssemblyDocument(history.redo()))); geometry(buildAssemblyScene(reopened))
  expect(() => session.apply(base, preview.token)).toThrow(/disponible/); expect(serializeAssemblyDocument(base)).toBe(before); session.discard()
}, 60_000)

it('revokes cancelled or stale-base capabilities without letting late cancellation revoke the next stage', () => {
  const { base, incoming } = fixture(), session = new AssemblyWorkerSession(), first = session.reviewDocumentUpdate(base, oldSource, incoming)
  const oldPreview = ready(session.previewDocumentUpdate(base, first.reviewId, empty())); session.discardDocumentUpdate(first.reviewId)
  expect(() => session.apply(base, oldPreview.token)).toThrow(/disponible/)
  const latest = session.reviewDocumentUpdate(base, oldSource, incoming); session.discardDocumentUpdate(first.reviewId)
  const preview = ready(session.previewDocumentUpdate(base, latest.reviewId, empty())); geometry(preview.scene); session.discard(preview.token)
  const changed = structuredClone(base); changed.name += ' changed'
  expect(() => session.previewDocumentUpdate(changed, latest.reviewId, empty())).toThrow(/documento cambió/)
  expect(() => session.previewDocumentUpdate(base, latest.reviewId, empty())).toThrow(/disponible/); session.discard()
}, 60_000)

it('withholds the whole source review after an actual failed downstream cut and permits a healthy retry', () => {
  const { base, incoming } = fixture(), before = serializeAssemblyDocument(base), part = incoming.definitions[0]
  if (part.kind !== 'part') throw Error('Expected original material')
  part.document.features.push({ id: 'remote-profile', name: 'Original remote circle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
    profile: { kind: 'circle', center: [100, 0], radius: 1 } }, { id: 'remote-cut', name: 'Original rejected remote cut', type: 'cut', sketchId: 'remote-profile', depth: 4, symmetric: false, suppressed: false })
  expect(() => reviewAssemblyDocumentSourceUpdate(base, oldSource, incoming)).toThrow(/reconstruir/); expect(serializeAssemblyDocument(base)).toBe(before)
  geometry(reviewAssemblyDocumentSourceUpdate(base, oldSource, source(3)).review.scene)
}, 60_000)

it('retains both real native mesh and release failures without publishing a replacement capability', () => {
  const { base, incoming } = fixture(), before = serializeAssemblyDocument(base), session = new AssemblyWorkerSession()
  const existing = session.reviewDocumentUpdate(base, oldSource, incoming), previous = ready(session.previewDocumentUpdate(base, existing.reviewId, empty()))
  const original = placements.placeAssemblyShapeChecked, primary = new Error('Original update mesh fault'), cleanup = new Error('Original update release fault'); let releases = 0
  const spy = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((source, pose) => {
    const placed = original(source, pose), shape = placed.shape, mesh = shape.mesh.bind(shape), remove = shape.delete.bind(shape)
    vi.spyOn(shape, 'mesh').mockImplementation(options => { mesh(options); throw primary })
    vi.spyOn(shape, 'delete').mockImplementation(() => { remove(); releases++; throw cleanup }); return placed
  })
  const causes = (e: unknown): unknown[] => e instanceof AggregateError ? [e, ...e.errors.flatMap(causes)] : [e]
  try {
    let failure: unknown, returned: unknown
    try { returned = session.reviewDocumentUpdate(base, oldSource, incoming) } catch (error) { failure = error }
    expect(returned).toBeUndefined(); expect(failure).toBeInstanceOf(NativeCleanupError); expect(causes(failure)).toContain(primary); expect(causes(failure)).toContain(cleanup); expect(releases).toBe(1)
  } finally { spy.mockRestore() }
  expect(() => session.apply(base, previous.token)).toThrow(/disponible/); expect(serializeAssemblyDocument(base)).toBe(before)
  geometry(session.reviewDocumentUpdate(base, oldSource, incoming).scene); session.discard()
}, 60_000)
