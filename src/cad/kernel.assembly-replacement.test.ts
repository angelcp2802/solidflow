import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initOpenCascade from 'replicad-opencascadejs'
import { setOC } from 'replicad'
import { beforeAll, expect, it, vi } from 'vitest'
import { createEmptyAssembly } from '../examples/assembly'
import { validateDocument, type Document } from '../model/document'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type AssemblyMate, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { identityRigidPose } from '../model/rigidPose'
import { AssemblyWorkerSession } from './kernel.assembly-session'
import { assemblySceneFaceReference, type AssemblyPreviewReply, type AssemblyScene } from './kernel.assembly-types'
import { prepareAssemblyReplacementDecisions, reviewAssemblyReplacement, type AssemblyReplacementDecisions,
  type AssemblyReplacementReview } from './kernel.assembly-replacement'
import { KernelDispatcher } from './kernel.dispatcher'
import { NativeCleanupError } from './kernel.native-ownership'
import * as placements from './kernel.assembly-placements'
import * as solves from './kernel.assembly-solve'

beforeAll(async () => setOC(await initOpenCascade({ wasmBinary: await readFile(createRequire(import.meta.url).resolve('replicad-opencascadejs/wasm')) })), 60_000)

// Original source-local cylinders R2/R3, H4, with explicitly declared frames.
// Replacement of one R2 by R3 gives V=(4+9)*4*pi=52*pi mm^3. No external
// geometry, expected solved poses, fabricated worker replies or native witnesses.
function part(id: string, radius = 2, plane: 'XY' | 'YZ' = 'XY'): Document {
  return validateDocument({ version: 1, id, name: id, units: 'mm', createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z', features: [
    { id: 'profile', type: 'sketch', name: 'Original circle', plane, offset: 0, suppressed: false, profile: { kind: 'circle', center: [0, 0], radius } },
    { id: 'extrude', type: 'extrude', name: 'Original cylinder H4', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false,
      bodyOperation: { mode: 'new', bodyId: 'cylinder-body' } },
  ] })
}
function document(rack = false): AssemblyDocument {
  const value = createEmptyAssembly('Original replacement mechanism'), original = part('original-cylinder')
  value.definitions = [{ kind: 'part', id: original.id, revision: 'r1', document: original }]
  if (rack) value.definitions.push({ kind: 'part', id: 'original-rack', revision: 'r1', document: part('original-rack', 2, 'YZ') })
  value.occurrences = ['a', 'b'].map((id, index) => ({ id, name: id, definition: { id: rack && index ? 'original-rack' : original.id, revision: 'r1' },
    pose: { ...identityRigidPose(), translation: index ? rack ? [5, 0, 0] : [0, 0, 6] : [0, 0, 0] }, fixed: !index, visible: true, suppressed: false }))
  return validateAssemblyDocument(value)
}
function ready(value: AssemblyPreviewReply) {
  expect(value.status, value.status === 'rejected' ? value.message : '').toBe('ready')
  if (value.status !== 'ready') throw new Error(value.message)
  return value
}
function cylinder(scene: AssemblyScene, path: string[]) {
  const face = scene.bodies.find(value => JSON.stringify(value.component.occurrencePath) === JSON.stringify(path))!.faces.find(value => value.support?.kind === 'cylinder')!
  const reference = assemblySceneFaceReference(face)
  if (!reference || reference.support !== 'axis') throw new Error('Expected actual cylinder axis')
  return { ...reference, support: 'axis' as const }
}
function replacementRequest(value: AssemblyDocument, path = ['b'], ancestorRevisions: string[] = []) {
  return { component: { occurrencePath: path, definition: { id: 'original-cylinder', revision: 'r1' } }, mode: 'selected' as const,
    part: part('replacement-cylinder', 3), revision: 'replacement-r1', ancestorRevisions }
}
const empty = (): AssemblyReplacementDecisions => ({ repairs: [], removed: [], recapture: [] })
function repaired(review: AssemblyReplacementReview): AssemblyReplacementDecisions {
  const decisions = empty()
  for (const endpoint of review.endpoints) if (endpoint.status === 'needs-repair') {
    if (!('kind' in endpoint.endpoint) || endpoint.endpoint.kind !== 'face' || endpoint.endpoint.support !== 'axis') throw new Error('Expected original cylinder axis repair')
    decisions.repairs.push({ locator: endpoint.locator, reference: { ...cylinder(review.replacementCatalog, ['catalog-part']), component: endpoint.desiredComponent } })
  }
  return decisions
}
function captured(type: 'gear' | 'screw' | 'rack-pinion') {
  const session = new AssemblyWorkerSession(), base = document(type === 'rack-pinion'), initial = ready(session.prepare(base))
  const first = cylinder(initial.scene, ['a']), second = cylinder(initial.scene, ['b'])
  const preview = type === 'gear' ? session.captureGear(base, initial.token, { first, second, carrier: null, ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', name: 'Original gear' })
    : type === 'screw' ? session.captureScrew(base, initial.token, { first, second, lead: 2, reverse: false, alignment: 'aligned', name: 'Original screw' })
      : session.captureRackPinion(base, initial.token, { first, second, conversion: { mode: 'diameter', override: null }, reverse: false, name: 'Original rack' })
  return { session, current: session.apply(base, ready(preview).token).document }
}
function nestedMechanism(mechanism: AssemblyDocument, extra = false) {
  const { version: _version, units: _units, definitions, ...inner } = validateAssemblyDocument(mechanism)
  if (extra) inner.occurrences.push({ ...structuredClone(inner.occurrences[0]), id: 'extra', name: 'Original unrelated cylinder',
    pose: { ...identityRigidPose(), translation: [20, 0, 0] }, fixed: true })
  const root = createEmptyAssembly('Original two-level reused replacement'), stamp = root.createdAt
  const outer: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-outer-mechanism', revision: 'r1', name: 'Original outer carrier',
    createdAt: stamp, updatedAt: stamp, mates: [], occurrences: [{ id: 'nested', name: 'Original nested mechanism',
      definition: { id: inner.id, revision: inner.revision }, pose: identityRigidPose(), fixed: true, visible: true, suppressed: false }] }
  root.definitions = [...definitions, inner, outer]
  root.occurrences = ['left', 'right'].map((id, index) => ({ id, name: id, definition: { id: outer.id, revision: outer.revision },
    pose: { ...identityRigidPose(), translation: [50 * index, 0, 0] }, fixed: true, visible: true, suppressed: false }))
  return { root: validateAssemblyDocument(root), inner, outer }
}

it.each(['selected', 'all'] as const)('keeps %s review data detached and publishes one replacement Apply with complete undo and reopened geometry', mode => {
  const session = new AssemblyWorkerSession(), base = document(), before = serializeAssemblyDocument(base), history = new AssemblyDocumentHistory(base)
  const review = session.reviewReplacement(base, { ...replacementRequest(base), mode }), id = review.reviewId, volume = (mode === 'all' ? 72 : 52) * Math.PI
  expect('token' in review).toBe(false); expect(serializeAssemblyDocument(base)).toBe(before); expect(history.canUndo).toBe(false)
  expect(review.replacementCatalog.bodies).toHaveLength(1); expect(review.scene.solidCount).toBe(2)
  expect(review.scene.volume).toBeCloseTo(volume, 6)
  expect(review.occurrences).toHaveLength(mode === 'all' ? 2 : 1); expect(review.expandedPaths).toHaveLength(mode === 'all' ? 2 : 1)
  review.document.occurrences[0].pose.translation[0] = 999; review.endpoints.length = 0
  const earlier = ready(session.previewReplacement(base, id, empty())); session.discard(earlier.token)
  const preview = ready(session.previewReplacement(base, id, empty())); session.discard(earlier.token)
  expect(preview.document.occurrences[0].pose.translation[0]).toBe(0); expect(serializeAssemblyDocument(base)).toBe(before)
  preview.document.name = 'Forged mutable reply'
  const applied = session.apply(base, preview.token)
  expect(applied.document.name).toBe(base.name); expect(applied.scene.volume).toBeCloseTo(volume, 6)
  history.commitDocument(applied.document); expect(serializeAssemblyDocument(history.undo())).toBe(before)
  const reopened = validateAssemblyDocument(JSON.parse(serializeAssemblyDocument(history.redo())))
  expect(new AssemblyWorkerSession().build(reopened).volume).toBeCloseTo(volume, 6)
  expect(() => session.apply(base, preview.token)).toThrow(/disponible/)
}, 60_000)

it('requires every inactive face repair or explicit relation removal and validates exact catalog identity', () => {
  const session = new AssemblyWorkerSession(), base = document(), geometry = session.build(base)
  base.mates = [{ id: 'inactive-axis', name: 'Original inactive axis', type: 'concentric', suppressed: true,
    first: cylinder(geometry, ['a']), second: cylinder(geometry, ['b']), alignment: 'aligned', rotationLock: null }]
  base.occurrences[1].suppressed = true
  const before = serializeAssemblyDocument(base), review = session.reviewReplacement(base, replacementRequest(base))
  expect(review.scene.bodies).toHaveLength(1); expect(review.replacementCatalog.bodies).toHaveLength(1)
  expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].status).toBe('needs-repair')
  expect(() => session.previewReplacement(base, review.reviewId, empty())).toThrow(/pendientes/)
  const decisions = repaired(review), forged = structuredClone(decisions)
  const reference = forged.repairs[0].reference
  if (!('kind' in reference) || reference.kind !== 'face') throw new Error('Expected face')
  reference.face.key = 'invented-native-key'
  expect(() => session.previewReplacement(base, review.reviewId, forged)).toThrow(/catálogo/)
  expect(ready(session.previewReplacement(base, review.reviewId, decisions)).document.mates[0].suppressed).toBe(true)
  expect(serializeAssemblyDocument(base)).toBe(before)
  const removed = empty(); removed.removed.push({ scope: review.endpoints[0].locator.scope, mateId: 'inactive-axis' })
  expect(ready(session.previewReplacement(base, review.reviewId, removed)).document.mates).toEqual([])
  session.discardReplacement(review.reviewId); expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it.each(['gear', 'screw', 'rack-pinion'] as const)('recaptures actual %s coordinates in one replacement transaction with unchanged mechanical intent', type => {
  const { session, current } = captured(type), original = structuredClone(current.mates[0]), before = serializeAssemblyDocument(current)
  const path = type === 'rack-pinion' ? ['a'] : ['b'], review = session.reviewReplacement(current, replacementRequest(current, path))
  expect(review.mechanicalMates).toEqual([{ scope: { id: current.id, revision: current.revision }, mateId: original.id, type, requiresRecapture: true }])
  const decisions = repaired(review)
  expect(() => session.previewReplacement(current, review.reviewId, decisions)).toThrow(/recaptura/)
  decisions.recapture = [{ scope: { id: current.id, revision: current.revision }, mateId: original.id }]
  const preview = ready(session.previewReplacement(current, review.reviewId, decisions))
  expect(preview.checks.every(check => check.satisfied)).toBe(true); expect(serializeAssemblyDocument(current)).toBe(before)
  const mate = preview.document.mates[0]
  expect(mate.id).toBe(original.id); expect(mate.type).toBe(type); expect(mate.name).toBe(original.name)
  if (mate.type === 'gear' && original.type === 'gear') {
    expect(mate.ratio).toEqual(original.ratio); expect(mate.direction).toBe(original.direction); expect(mate.phase).toBe(original.phase)
  } else if (mate.type === 'screw' && original.type === 'screw') {
    expect(mate.lead).toBe(original.lead); expect(mate.reverse).toBe(original.reverse); expect(mate.alignment).toBe(original.alignment)
  } else if (mate.type === 'rack-pinion' && original.type === 'rack-pinion') {
    expect(mate.conversion).toEqual(original.conversion); expect(mate.reverse).toBe(original.reverse)
  } else throw new Error('Mechanical family changed')
  const applied = session.apply(current, preview.token), history = new AssemblyDocumentHistory(current)
  history.commitDocument(applied.document); expect(serializeAssemblyDocument(history.undo())).toBe(before)
  const reopened = validateAssemblyDocument(JSON.parse(serializeAssemblyDocument(history.redo())))
  const fresh = new AssemblyWorkerSession(), rebuilt = ready(fresh.prepare(reopened))
  expect(rebuilt.scene.volume).toBeCloseTo(52 * Math.PI, 6); fresh.discard()
}, 60_000)

it('recaptures two affected mechanical families before publishing their single shared Apply', () => {
  const session = new AssemblyWorkerSession(), base = document(), initial = ready(session.prepare(base))
  const first = cylinder(initial.scene, ['a']), second = cylinder(initial.scene, ['b'])
  const geared = ready(session.captureGear(base, initial.token, { first, second, carrier: null, ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', name: 'Original combined gear' }))
  const screwed = ready(session.captureScrew(base, geared.token, { first: cylinder(geared.scene, ['a']), second: cylinder(geared.scene, ['b']), lead: 2, reverse: false, alignment: 'aligned', name: 'Original combined screw' }))
  const current = session.apply(base, screwed.token).document, before = serializeAssemblyDocument(current)
  const review = session.reviewReplacement(current, replacementRequest(current)), decisions = repaired(review)
  decisions.recapture = review.mechanicalMates.map(({ scope, mateId }) => ({ scope, mateId }))
  expect(decisions.recapture).toHaveLength(2)
  const preview = ready(session.previewReplacement(current, review.reviewId, decisions))
  expect(preview.document.mates.map(value => [value.id, value.type])).toEqual(current.mates.map(value => [value.id, value.type]))
  expect(preview.checks).toHaveLength(2); expect(preview.checks.every(value => value.satisfied)).toBe(true)
  expect(serializeAssemblyDocument(current)).toBe(before)
  const applied = session.apply(current, preview.token)
  expect(applied.scene.volume).toBeCloseTo(52 * Math.PI, 6)
  expect(() => session.apply(current, preview.token)).toThrow(/disponible/)
}, 60_000)

it('withholds Apply after real incompatible fixed-axis recapture and retains the stage for an explicit removal', () => {
  const { session, current } = captured('screw'); current.occurrences[1].fixed = true
  const request = replacementRequest(current), profile = request.part.features[0]
  if (profile.type !== 'sketch' || profile.profile.kind !== 'circle') throw new Error('Expected original circle')
  profile.profile.center = [1, 0]
  const before = serializeAssemblyDocument(current), review = session.reviewReplacement(current, request), decisions = repaired(review)
  decisions.recapture = review.mechanicalMates.map(({ scope, mateId }) => ({ scope, mateId }))
  expect(() => session.previewReplacement(current, review.reviewId, decisions)).toThrow(/alinear/)
  expect(serializeAssemblyDocument(current)).toBe(before)
  expect(() => session.apply(current, review.reviewId)).toThrow(/disponible/)
  const removed = empty(); removed.removed = decisions.recapture
  const preview = ready(session.previewReplacement(current, review.reviewId, removed))
  expect(preview.document.mates).toEqual([]); expect(serializeAssemblyDocument(current)).toBe(before)
  session.discardReplacement(review.reviewId)
  expect(() => session.apply(current, preview.token)).toThrow(/disponible/)
}, 60_000)

it('preserves an unaffected gear through a selected COW branch without granting generic renderer scope equivalence', () => {
  const { current: mechanism } = captured('gear'), root = createEmptyAssembly('Original COW pair'), session = new AssemblyWorkerSession()
  const { version: _version, units: _units, definitions, ...sub } = mechanism
  sub.occurrences.push({ ...structuredClone(sub.occurrences[1]), id: 'extra', name: 'Original extra cylinder', fixed: true,
    pose: { ...identityRigidPose(), translation: [20, 0, 0] } })
  root.definitions = [...definitions, sub]
  root.occurrences = ['left', 'right'].map((id, index) => ({ id, name: id, definition: { id: sub.id, revision: sub.revision },
    pose: { ...identityRigidPose(), translation: [index * 50, 0, 0] }, fixed: true, visible: true, suppressed: false }))
  const base = validateAssemblyDocument(root), before = serializeAssemblyDocument(base)
  const review = session.reviewReplacement(base, replacementRequest(base, ['left', 'extra'], ['cow-r2']))
  expect(review.mechanicalMates).toEqual([]); expect(review.scopeMap).toHaveLength(1)
  expect(() => new AssemblyWorkerSession().prepare(base, review.document)).toThrow(/captura nativa/)
  const preview = ready(session.previewReplacement(base, review.reviewId, empty()))
  const clone = preview.document.definitions.find(value => value.id === sub.id && value.revision === 'cow-r2')!
  if (clone.kind !== 'assembly') throw new Error('Expected COW assembly')
  expect(clone.mates).toEqual(sub.mates)
  expect(preview.document.occurrences[1].definition).toEqual(base.occurrences[1].definition)
  const applied = session.apply(base, preview.token)
  expect(applied.scene.volume).toBeCloseTo((5 * 4 + 9) * 4 * Math.PI, 6)
  expect(serializeAssemblyDocument(base)).toBe(before)
}, 60_000)

it('recaptures an affected gear under two COW levels while retaining the reused sibling and all original sources', () => {
  const { current: mechanism } = captured('gear'), { root: base, inner, outer } = nestedMechanism(mechanism)
  const carrier = base.definitions.find(value => value.id === outer.id && value.revision === outer.revision)!
  if (carrier.kind !== 'assembly') throw new Error('Expected original outer carrier')
  const half = Math.SQRT1_2
  carrier.occurrences[0].pose = { translation: [0, 20, 0], rotation: [0, half, 0, half] }
  base.occurrences[0].pose = { translation: [10, 0, 0], rotation: [0, 0, half, half] }
  const before = serializeAssemblyDocument(base), session = new AssemblyWorkerSession()
  const review = session.reviewReplacement(base, replacementRequest(base, ['left', 'nested', 'b'], ['outer-cow-r2', 'inner-cow-r2']))
  expect(review.scopeMap.map(value => [value.beforeScope, value.afterScope, value.scopePath])).toEqual([
    [{ id: outer.id, revision: outer.revision }, { id: outer.id, revision: 'outer-cow-r2' }, ['left']],
    [{ id: inner.id, revision: inner.revision }, { id: inner.id, revision: 'inner-cow-r2' }, ['left', 'nested']],
  ])
  expect(review.expandedPaths).toEqual([['left', 'nested', 'b']])
  const decisions = repaired(review)
  decisions.recapture = review.mechanicalMates.map(({ scope, mateId }) => ({ scope, mateId }))
  expect(decisions.recapture).toEqual([{ scope: { id: inner.id, revision: 'inner-cow-r2' }, mateId: inner.mates[0].id }])
  const preview = ready(session.previewReplacement(base, review.reviewId, decisions))
  expect(preview.checks.every(check => check.satisfied)).toBe(true)
  expect(preview.scene.solidCount).toBe(4)
  // Three unchanged R2,H4 cylinders plus one R3,H4 cylinder.
  expect(preview.scene.volume).toBeCloseTo(84 * Math.PI, 6); expect(preview.scene.area).toBeCloseTo(114 * Math.PI, 6)
  const changed = preview.scene.bodies.filter(body => body.component.definition.id === 'replacement-cylinder')
  expect(changed.map(body => body.component.occurrencePath)).toEqual([['left', 'nested', 'b']])
  // Manually composed Ry90 then Rz90: world cylinder axis is +Y, the
  // changed cylinder center is (-10,8,0), axial extent6..10 and radius3.
  const leftA = preview.scene.bodies.find(body => JSON.stringify(body.component.occurrencePath) === JSON.stringify(['left', 'nested', 'a']))!
  for (const [actual, expected] of [[changed[0].bounds.min, [-13, 6, -3]], [changed[0].bounds.max, [-7, 10, 3]],
    [changed[0].worldPose.translation, [-10, 6, 0]], [leftA.bounds.min, [-12, 0, -2]], [leftA.bounds.max, [-8, 4, 2]]] as const) {
    actual.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-6))
  }
  expect(preview.document.occurrences[1]).toEqual(base.occurrences[1])
  for (const source of base.definitions) expect(preview.document.definitions.find(value => value.id === source.id && value.revision === source.revision)).toEqual(source)
  const clone = preview.document.definitions.find(value => value.id === inner.id && value.revision === 'inner-cow-r2')!
  if (clone.kind !== 'assembly') throw new Error('Expected inner COW definition')
  expect(clone.mates[0].id).toBe(inner.mates[0].id); expect(clone.mates[0].type).toBe('gear')
  expect(serializeAssemblyDocument(base)).toBe(before)
  const applied = session.apply(base, preview.token), history = new AssemblyDocumentHistory(base)
  history.commitDocument(applied.document); expect(serializeAssemblyDocument(history.undo())).toBe(before)
  const reopened = validateAssemblyDocument(JSON.parse(serializeAssemblyDocument(history.redo())))
  const fresh = new AssemblyWorkerSession(), rebuilt = ready(fresh.prepare(reopened))
  expect(rebuilt.scene.volume).toBeCloseTo(84 * Math.PI, 6); fresh.discard()
  expect(() => session.apply(base, preview.token)).toThrow(/disponible/)
}, 60_000)

it('rejects unavailable suppressed-gear recapture without altering its saved coordinates and permits explicit removal', () => {
  const { session, current } = captured('gear')
  current.mates[0].suppressed = true; current.occurrences[1].suppressed = true
  const before = serializeAssemblyDocument(current), originalMate = structuredClone(current.mates[0])
  const review = session.reviewReplacement(current, replacementRequest(current)), decisions = repaired(review)
  decisions.recapture = review.mechanicalMates.map(({ scope, mateId }) => ({ scope, mateId }))
  expect(() => session.previewReplacement(current, review.reviewId, decisions)).toThrow(/portador|ejes|vigente|referencia|actual/)
  expect(serializeAssemblyDocument(current)).toBe(before); expect(current.mates[0]).toEqual(originalMate)
  expect(() => session.apply(current, review.reviewId)).toThrow(/disponible/)
  const removed = empty(); removed.removed = decisions.recapture
  const preview = ready(session.previewReplacement(current, review.reviewId, removed))
  expect(preview.document.mates).toEqual([]); expect(preview.document.occurrences[1].suppressed).toBe(true)
  expect(preview.scene.solidCount).toBe(1); expect(preview.scene.volume).toBeCloseTo(16 * Math.PI, 6)
  session.discardReplacement(review.reviewId); expect(serializeAssemblyDocument(current)).toBe(before)
}, 60_000)

it('requires explicit fresh capture when a same-ID ancestor carrier was stale before the selected COW repair', () => {
  const { root: base, outer } = nestedMechanism(document(), true), session = new AssemblyWorkerSession()
  const initial = ready(session.prepare(base)), geared = ready(session.captureGear(base, initial.token, {
    first: cylinder(initial.scene, ['left', 'nested', 'a']), second: cylinder(initial.scene, ['left', 'nested', 'b']),
    carrier: { occurrencePath: ['left'], definition: { id: outer.id, revision: outer.revision } },
    ratio: { numerator: 2, denominator: 1 }, direction: 'opposed', name: 'Original stale ancestor carrier',
  }))
  const current = session.apply(base, geared.token).document, gear = current.mates[0]
  if (gear.type !== 'gear' || !gear.carrier) throw new Error('Expected captured carrier')
  gear.carrier.definition.revision = 'original-stale-revision'
  const before = serializeAssemblyDocument(current)
  const review = session.reviewReplacement(current, replacementRequest(current, ['left', 'nested', 'extra'], ['outer-carrier-r2', 'inner-carrier-r2']))
  expect(review.endpoints).toHaveLength(1); expect(review.endpoints[0].locator.side).toBe('carrier')
  expect(review.endpoints[0].retainFrame).toBe(false)
  expect(review.mechanicalMates).toEqual([{ scope: { id: current.id, revision: current.revision }, mateId: gear.id, type: 'gear', requiresRecapture: true }])
  const decisions = empty()
  decisions.repairs = [{ locator: review.endpoints[0].locator, reference: structuredClone(review.endpoints[0].desiredComponent) }]
  expect(() => session.previewReplacement(current, review.reviewId, decisions)).toThrow(/recaptura/)
  decisions.recapture = review.mechanicalMates.map(({ scope, mateId }) => ({ scope, mateId }))
  const preview = ready(session.previewReplacement(current, review.reviewId, decisions))
  expect(preview.checks.every(check => check.satisfied)).toBe(true)
  expect(preview.scene.volume).toBeCloseTo(116 * Math.PI, 6)
  const recaptured = preview.document.mates[0]
  if (recaptured.type !== 'gear') throw new Error('Expected recaptured gear')
  expect(recaptured.id).toBe(gear.id); expect(recaptured.ratio).toEqual(gear.ratio)
  expect(recaptured.carrier).toEqual({ occurrencePath: ['left'], definition: { id: outer.id, revision: 'outer-carrier-r2' } })
  expect(serializeAssemblyDocument(current)).toBe(before)
  session.discardReplacement(review.reviewId)
}, 60_000)

it.each(['review catalog', 'recaptured preview'] as const)('withholds %s authority on real native mesh/release faults and permits a clean retry', phase => {
  const { session, current } = captured('gear'), before = serializeAssemblyDocument(current)
  const review = session.reviewReplacement(current, replacementRequest(current)), decisions = repaired(review)
  decisions.recapture = review.mechanicalMates.map(({ scope, mateId }) => ({ scope, mateId }))
  const previous = ready(session.previewReplacement(current, review.reviewId, decisions))
  const primary = new Error('Original replacement mesh fault'), cleanup = new Error('Original replacement release fault')
  const original = placements.placeAssemblyShapeChecked, restored: { mockRestore(): void }[] = []
  const actualCapture = vi.spyOn(solves, 'captureAssemblyGearPreview')
  let meshes = 0, releases = 0
  const spy = vi.spyOn(placements, 'placeAssemblyShapeChecked').mockImplementation((source, pose) => {
    const placed = original(source, pose), shape = placed.shape, mesh = shape.mesh.bind(shape), remove = shape.delete.bind(shape)
    let failed = false
    restored.push(vi.spyOn(shape, 'mesh').mockImplementation(options => {
      const result = mesh(options)
      if (++meshes === (phase === 'review catalog' ? 3 : 1)) { failed = true; throw primary }
      return result
    }), vi.spyOn(shape, 'delete').mockImplementation(() => {
      remove()
      if (failed) { releases++; throw cleanup }
    }))
    return placed
  })
  const causalErrors = (error: unknown): unknown[] => error instanceof AggregateError ? [error, ...error.errors.flatMap(causalErrors)] : [error]
  try {
    let failure: unknown, returned: unknown
    try {
      returned = phase === 'review catalog' ? session.reviewReplacement(current, replacementRequest(current))
        : session.previewReplacement(current, review.reviewId, decisions)
    } catch (error) { failure = error }
    expect(returned).toBeUndefined(); expect(failure).toBeInstanceOf(NativeCleanupError)
    expect(causalErrors(failure)).toContain(primary); expect(causalErrors(failure)).toContain(cleanup)
    expect(meshes).toBe(phase === 'review catalog' ? 3 : 1); expect(releases).toBe(1)
    expect(actualCapture).toHaveBeenCalledTimes(phase === 'review catalog' ? 0 : 1)
    expect(serializeAssemblyDocument(current)).toBe(before)
  } finally { spy.mockRestore(); actualCapture.mockRestore(); restored.forEach(value => value.mockRestore()) }
  expect(() => session.apply(current, previous.token)).toThrow(/disponible/)
  if (phase === 'review catalog') {
    expect(() => session.previewReplacement(current, review.reviewId, decisions)).toThrow(/disponible/)
    const fresh = session.reviewReplacement(current, replacementRequest(current)), freshDecisions = repaired(fresh)
    freshDecisions.recapture = fresh.mechanicalMates.map(({ scope, mateId }) => ({ scope, mateId }))
    const retry = ready(session.previewReplacement(current, fresh.reviewId, freshDecisions))
    expect(retry.scene.volume).toBeCloseTo(52 * Math.PI, 6); expect(retry.checks.every(value => value.satisfied)).toBe(true)
  } else {
    const retry = ready(session.previewReplacement(current, review.reviewId, decisions))
    expect(retry.scene.volume).toBeCloseTo(52 * Math.PI, 6); expect(retry.checks.every(value => value.satisfied)).toBe(true)
  }
  session.discard(); expect(serializeAssemblyDocument(current)).toBe(before)
}, 60_000)

it('rejects executable decisions without reading accessors and preserves the confirmed source', () => {
  const base = document(), { plan, review } = reviewAssemblyReplacement(base, replacementRequest(base)); let calls = 0
  const decisions = { removed: [], recapture: [], get repairs() { calls++; return [] } }
  expect(() => prepareAssemblyReplacementDecisions(plan, review, decisions)).toThrow(/accesores/); expect(calls).toBe(0)
  expect(() => prepareAssemblyReplacementDecisions(plan, review, { ...empty(), candidate: base } as AssemblyReplacementDecisions)).toThrow(/desconocidos/)
}, 60_000)

it('keeps late targeted cancellation separate and revokes stages on base drift, other operations and mode replacement', () => {
  const dispatcher = new KernelDispatcher(), base = document(), request = replacementRequest(base)
  try {
    const first = dispatcher.handle({ id: 1, action: 'review-assembly-part-replacement', current: base, request }) as AssemblyReplacementReview
    const latest = dispatcher.handle({ id: 2, action: 'review-assembly-part-replacement', current: base, request }) as AssemblyReplacementReview
    dispatcher.handle({ id: 3, action: 'discard-assembly-part-replacement', reviewId: first.reviewId })
    const preview = dispatcher.handle({ id: 4, action: 'preview-assembly-part-replacement', current: base, reviewId: latest.reviewId, decisions: empty() }) as AssemblyPreviewReply
    const token = ready(preview).token
    expect(() => dispatcher.handle({ id: 40, action: 'preview-assembly-part-replacement', current: base, reviewId: first.reviewId, decisions: empty() })).toThrow(/disponible/)
    dispatcher.handle({ id: 41, action: 'discard-assembly-part-replacement', reviewId: first.reviewId })
    const applied = dispatcher.handle({ id: 42, action: 'apply-assembly', current: base, token })
    expect(applied && !(applied instanceof Blob) && 'kind' in applied && applied.kind).toBe('assembly-applied')
    const next = dispatcher.handle({ id: 43, action: 'review-assembly-part-replacement', current: base, request }) as AssemblyReplacementReview
    dispatcher.handle({ id: 5, action: 'build-assembly', document: base })
    expect(() => dispatcher.handle({ id: 6, action: 'apply-assembly', current: base, token })).toThrow(/disponible/)
    expect(() => dispatcher.handle({ id: 7, action: 'preview-assembly-part-replacement', current: base, reviewId: next.reviewId, decisions: empty() })).toThrow(/disponible/)
    const changed = structuredClone(base); changed.name += ' changed'
    const review = dispatcher.handle({ id: 8, action: 'review-assembly-part-replacement', current: base, request }) as AssemblyReplacementReview
    expect(() => dispatcher.handle({ id: 9, action: 'preview-assembly-part-replacement', current: changed, reviewId: review.reviewId, decisions: empty() })).toThrow(/documento cambió/)
    const final = dispatcher.handle({ id: 10, action: 'review-assembly-part-replacement', current: base, request }) as AssemblyReplacementReview
    dispatcher.handle({ id: 11, action: 'build', features: part('original-part-mode').features })
    dispatcher.handle({ id: 12, action: 'discard-assembly-part-replacement', reviewId: final.reviewId })
    expect(dispatcher.handle({ id: 13, action: 'export', format: 'stl' })).toBeInstanceOf(Blob)
  } finally { dispatcher.dispose() }
}, 60_000)
