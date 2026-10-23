import { requireBinaryAssemblyMate as binaryMate } from './assemblyBinaryFixtures.test-utils'
import { expect, it, vi } from 'vitest'
import { assemblySourceScopePaths, prepareAssemblyPartUpdate, repairAssemblyEndpoint,
  type AssemblyMateEndpointLocator } from './assemblySourceUpdates'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument,
  type AssemblyComponentReference, type AssemblyDefinitionReference, type AssemblyDocument,
  type AssemblyFaceReference, type AssemblyGeometryReference, type AssemblyMate, type AssemblyOccurrence,
  type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import { serializeDocument, validateDocument, type Document } from './document'
import { identityRigidPose } from './rigidPose'
import type { AssemblyCylinderTangentMateType } from './assemblyCylinderTangentMates'
import type { AssemblySphereTangentMateType } from './assemblySphereTangentMates'

// Original syntax-only fixtures: a 2×3×4 part and its 5×3×4 replacement.
// Face keys below are deliberately unattested declarations, not BRep evidence.
const date = '2026-10-15T00:00:00.000Z'
const source = { id: 'original-part', revision: 'r1' }, rootScope = { id: 'root', revision: 'a1' }
const subScope = { id: 'shared', revision: 's1' }, dormantScope = { id: 'dormant', revision: 's1' }
function part(id = source.id, width = 2): Document {
  return validateDocument({ version: 1, id, name: 'Original reusable part', units: 'mm', createdAt: date, updatedAt: date,
    features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width, height: 3 } },
      { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false,
        suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } },
    ] })
}
function occurrence(id: string, definition: AssemblyDefinitionReference = source): AssemblyOccurrence {
  return { id, name: 'Same display name', definition: { ...definition }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false }
}
function component(path: string[], definition: AssemblyDefinitionReference = source): AssemblyComponentReference {
  return { occurrencePath: path, definition: { ...definition } }
}
function face(path = ['left']): AssemblyFaceReference & { support: 'plane' } {
  return { kind: 'face', component: component(path), body: { bodyId: 'body', sourceFeatureId: 'solid' },
    face: { sourceFeatureId: 'solid', key: 'face-v1|original-unattested' }, support: 'plane' }
}
function planeMate(id: string, first: AssemblyGeometryReference = face()): AssemblyMate {
  // The common fixture uses only planes. The complete validator below remains
  // the authority rather than an unchecked cast becoming a fixture shortcut.
  if (first.kind === 'principal-axis' || first.kind === 'edge' || first.kind === 'face' && first.support !== 'plane') throw new Error('Expected an original plane declaration')
  return { id, name: 'Same mate display name', suppressed: false, type: 'coincident', alignment: 'aligned',
    first: first.kind === 'face' ? { ...first, support: 'plane' } : first,
    second: { kind: 'principal-plane', component: null, plane: 'XY' } }
}
function document(): AssemblyDocument {
  const child = occurrence('child'); child.suppressed = true; child.visible = false; child.pose.translation = [1, 2, 3]
  const shared: EmbeddedAssemblyDefinition = { kind: 'assembly', ...subScope, name: 'Shared source', createdAt: date, updatedAt: date,
    occurrences: [child, occurrence('vintage', { id: source.id, revision: 'r0' })], mates: [planeMate('child-mate', face(['child']))] }
  const dormant: EmbeddedAssemblyDefinition = { kind: 'assembly', ...dormantScope, name: 'Dormant source', createdAt: date, updatedAt: date,
    occurrences: [occurrence('child')], mates: [planeMate('dormant-mate', { kind: 'principal-plane', component: component(['child']), plane: 'YZ' })] }
  const left = occurrence('left'), right = occurrence('right'), hiddenShared = occurrence('shared-B', subScope)
  left.pose = { translation: [-3, 4, 1], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  right.fixed = true; right.visible = false; right.suppressed = true; right.pose.translation = [8, -2, 0]
  hiddenShared.suppressed = true
  const broken = face(); broken.face.sourceFeatureId = 'missing-face'; broken.body!.sourceFeatureId = 'missing-state'
  return validateAssemblyDocument({ version: 2, kind: 'assembly', ...rootScope, name: 'Original source revision graph', units: 'mm',
    createdAt: date, updatedAt: date, definitions: [
      { kind: 'part', ...source, document: part() },
      { kind: 'part', id: source.id, revision: 'r0', document: part(source.id, 1) },
      { kind: 'part', id: 'other', revision: 'r1', document: part('other') }, shared, dormant,
    ], occurrences: [left, right, occurrence('legacy', { id: source.id, revision: 'r0' }), occurrence('same-name-other', { id: 'other', revision: 'r1' }),
      occurrence('shared-A', subScope), hiddenShared], mates: [
      planeMate('plane'),
      { id: 'lock', name: 'Original component lock', type: 'lock', suppressed: true, first: component(['left']),
        second: component(['shared-A', 'child']), relativePose: { translation: [1, 2, 3], rotation: [0, 0, 0, 1] } },
      planeMate('datum', { kind: 'principal-plane', component: component(['shared-B', 'child']), plane: 'XZ' }),
      planeMate('broken-geometry', broken),
      planeMate('missing', { kind: 'principal-plane', component: component(['deleted']), plane: 'XY' }),
      planeMate('through-part', { kind: 'principal-plane', component: component(['left', 'invented-child']), plane: 'XY' }),
      planeMate('stale-label', { kind: 'principal-plane', component: component(['legacy']), plane: 'XY' }),
      planeMate('vintage', { kind: 'principal-plane', component: component(['legacy'], { id: source.id, revision: 'r0' }), plane: 'XY' }),
    ] })
}
function assembly(value: AssemblyDocument, reference = subScope): EmbeddedAssemblyDefinition {
  const result = value.definitions.find(item => item.id === reference.id && item.revision === reference.revision)
  if (!result || result.kind !== 'assembly') throw new Error('Original assembly declaration missing')
  return result
}
function firstFace(value: AssemblyDocument): AssemblyFaceReference {
  const first = binaryMate(value.mates.find(item => item.id === 'plane')!).first
  if (!('kind' in first) || first.kind !== 'face' || first.support !== 'plane' && first.support !== 'axis') throw new Error('Expected original face')
  return first
}
const planeLocator: AssemblyMateEndpointLocator = { scope: rootScope, mateId: 'plane', side: 'first' }
function rebind(endpoint: AssemblyFaceReference, revision = 'r2'): AssemblyFaceReference {
  return { ...structuredClone(endpoint), component: { ...structuredClone(endpoint.component), definition: { id: source.id, revision } } }
}

it('updates all unique exact-source occurrence declarations including shared, suppressed and dormant ones', () => {
  const input = document(), before = structuredClone(input), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  expect(plan.kind).toBe('assembly-source-plan'); expect(plan.source).toEqual(source); expect(plan.replacement).toEqual({ id: source.id, revision: 'r2' })
  expect(plan.occurrences).toEqual([
    { scope: rootScope, occurrenceId: 'left' }, { scope: rootScope, occurrenceId: 'right' },
    { scope: subScope, occurrenceId: 'child' }, { scope: dormantScope, occurrenceId: 'child' },
  ])
  expect(plan.document.occurrences.slice(0, 2).map(item => item.definition)).toEqual([plan.replacement, plan.replacement])
  expect(assembly(plan.document).occurrences[0].definition).toEqual(plan.replacement)
  expect(assembly(plan.document, dormantScope).occurrences[0].definition).toEqual(plan.replacement)
  expect(plan.document.occurrences.slice(2)).toEqual(input.occurrences.slice(2)); expect(input).toEqual(before)
})

it('retains every old revision and adds a detached replacement without changing any part or feature identity', () => {
  const input = document(), replacement = part(source.id, 5), beforePart = structuredClone(replacement)
  const plan = prepareAssemblyPartUpdate(input, source, replacement, 'r2'), added = plan.document.definitions.at(-1)!
  expect(plan.document.definitions.slice(0, input.definitions.length).filter(value => value.kind === 'part')).toEqual(input.definitions.filter(value => value.kind === 'part'))
  expect(added).toEqual({ kind: 'part', id: source.id, revision: 'r2', document: replacement })
  expect(replacement).toEqual(beforePart); expect(added).not.toBe(replacement)
  if (added.kind !== 'part') throw new Error('Expected replacement part')
  added.document.features[0].name = 'Mutation outside source'; expect(replacement).toEqual(beforePart)
})

it('keeps poses, fixed/visibility/suppression roles, all mate data and opaque assembly labels intact', () => {
  const input = document(), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  expect(plan.document.occurrences.map(({ definition: _definition, ...rest }) => rest)).toEqual(input.occurrences.map(({ definition: _definition, ...rest }) => rest))
  expect(plan.document.mates).toEqual(input.mates); expect(assembly(plan.document).mates).toEqual(assembly(input).mates)
  expect(assembly(plan.document).updatedAt).toBe(assembly(input).updatedAt)
  expect(plan.document.id).toBe(input.id); expect(plan.document.revision).toBe(input.revision)
  expect(plan.document.createdAt).toBe(input.createdAt); expect(Date.parse(plan.document.updatedAt)).toBeGreaterThan(Date.parse(input.updatedAt))
})

it('collects original endpoints once per declaration only after real path and exact expected tuple resolution', () => {
  const input = document(), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  expect(plan.endpoints.map(value => [value.locator.scope.id, value.locator.mateId, value.locator.side])).toEqual([
    ['root', 'plane', 'first'], ['root', 'lock', 'first'], ['root', 'lock', 'second'], ['root', 'datum', 'first'],
    ['root', 'broken-geometry', 'first'], ['shared', 'child-mate', 'first'], ['dormant', 'dormant-mate', 'first'],
  ])
  expect(plan.endpoints[0].endpoint).toEqual(firstFace(input))
  expect(firstFace(plan.document).component.definition).toEqual(source)
  const original = plan.endpoints[0].endpoint
  if (!('kind' in original) || original.kind !== 'face') throw new Error('Expected original endpoint')
  original.face.key = 'Mutation of detached inventory'; expect(firstFace(plan.document).face.key).toBe('face-v1|original-unattested')
  expect(firstFace(input).face.key).toBe('face-v1|original-unattested')
})

it('includes already broken geometry for manual repair but never invents an association for broken component paths', () => {
  const input = document(), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  expect(plan.endpoints.some(value => value.locator.mateId === 'broken-geometry')).toBe(true)
  for (const id of ['missing', 'through-part', 'stale-label', 'vintage']) expect(plan.endpoints.some(value => value.locator.mateId === id)).toBe(false)
  expect(plan.document.mates).toEqual(input.mates)
  const inspections = inspectAssemblyMateReferences(plan.document)
  expect(inspections.every(value => value.nativeVerificationRequired === true)).toBe(true)
  expect(inspections.find(value => value.mate.id === 'plane')!.first.diagnostics.map(value => value.code)).toContain('STALE_DEFINITION')
})

it('permits an explicit new revision label for identical source content without claiming geometric freshness', () => {
  const input = document(), plan = prepareAssemblyPartUpdate(input, source, part(), 'same-content-label')
  expect((plan.document.definitions.at(-1) as EmbeddedPartDefinition).document).toEqual(part())
  expect(firstFace(plan.document).component.definition.revision).toBe('r1')
  expect(inspectAssemblyMateReferences(plan.document).every(value => value.nativeVerificationRequired)).toBe(true)
})

it('treats revisions as exact definition tuples rather than globally unique display labels', () => {
  const plan = prepareAssemblyPartUpdate(document(), source, part(), subScope.revision)
  expect(plan.replacement).toEqual({ id: source.id, revision: 's1' })
  expect(assembly(plan.document).revision).toBe('s1')
})

it('does not recycle previous revisions or auto-update still-stale endpoints on a later source update', () => {
  const first = prepareAssemblyPartUpdate(document(), source, part(source.id, 5), 'r2')
  const second = prepareAssemblyPartUpdate(first.document, first.replacement, part(source.id, 7), 'r3')
  expect(second.occurrences).toEqual(first.occurrences); expect(second.endpoints).toEqual([])
  expect(second.document.definitions.filter(value => value.id === source.id).map(value => value.revision)).toEqual(['r1', 'r0', 'r2', 'r3'])
  expect(firstFace(second.document).component.definition).toEqual(source)
})

it('advances only the root timestamp monotonically even if its stored timestamp is ahead of the clock', () => {
  const input = document(); input.updatedAt = '2040-01-01T00:00:00.000Z'
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(date))
  try { const plan = prepareAssemblyPartUpdate(input, source, part(), 'r2'); expect(plan.document.updatedAt).toBe('2040-01-01T00:00:00.001Z') }
  finally { now.mockRestore() }
  expect(input.updatedAt).toBe('2040-01-01T00:00:00.000Z')
})

it.each(['r1', 'r0'])('rejects an already retained exact revision %s atomically', revision => {
  const input = document(), before = structuredClone(input)
  expect(() => prepareAssemblyPartUpdate(input, source, part(), revision)).toThrow(/revisión/); expect(input).toEqual(before)
})

it.each(['', ' ', 'x'.repeat(129), 'r\u0000two'])('rejects invalid replacement revision identifiers %#', revision => {
  expect(() => prepareAssemblyPartUpdate(document(), source, part(), revision)).toThrow(/identificador/)
})

it('requires the selected exact source to exist as a part and the replacement to keep its part identity', () => {
  const input = document()
  expect(() => prepareAssemblyPartUpdate(input, { ...source, revision: 'missing' }, part(), 'r2')).toThrow(/origen/)
  expect(() => prepareAssemblyPartUpdate(input, rootScope, part(), 'r2')).toThrow()
  expect(() => prepareAssemblyPartUpdate(input, source, part('different'), 'r2')).toThrow(/identidad/)
  expect(() => prepareAssemblyPartUpdate(input, source, input as unknown as Document, 'r2')).toThrow(/identidad/)
})

it('rejects executable source metadata, extra/hidden/symbol fields and custom prototypes without invoking accessors', () => {
  let calls = 0
  const getter = Object.defineProperty({ ...source }, 'id', { enumerable: true, get() { calls++; return source.id } })
  const hidden = Object.defineProperty({ ...source }, 'hidden', { value: true })
  const symbol = Object.assign({ ...source }, { [Symbol('untrusted')]: true })
  const callback = { ...source, toJSON() { calls++; return source } }
  for (const invalid of [getter, hidden, symbol, callback, Object.assign(Object.create({ inherited: true }), source)]) {
    expect(() => prepareAssemblyPartUpdate(document(), invalid, part(), 'r2')).toThrow()
  }
  expect(calls).toBe(0)
})

it('rejects executable or malformed replacement part data before legacy parsing or serialization can execute it', () => {
  let calls = 0
  const getter = Object.defineProperty(part(), 'features', { enumerable: true, get() { calls++; return [] } })
  const callback = Object.assign(part(), { toJSON() { calls++; return part() } })
  const symbol = Object.assign(part(), { [Symbol('untrusted')]: 1 }), invalid = part()
  if (invalid.features[1].type !== 'extrude') throw new Error('Expected original extrusion')
  invalid.features[1].depth = NaN
  for (const replacement of [getter, callback, symbol, invalid]) expect(() => prepareAssemblyPartUpdate(document(), source, replacement, 'r2')).toThrow()
  expect(calls).toBe(0)
})

it('rejects executable input assembly data before reading metadata or invoking callbacks', () => {
  let calls = 0
  const getter = Object.defineProperty(document(), 'name', { enumerable: true, get() { calls++; return 'Executed' } })
  const callback = Object.assign(document(), { toJSON() { calls++; return document() } })
  const symbol = Object.assign(document(), { [Symbol('untrusted')]: true })
  for (const input of [getter, callback, symbol]) expect(() => prepareAssemblyPartUpdate(input, source, part(), 'r2')).toThrow()
  expect(calls).toBe(0)
})

it('honours the complete definition admission cap rather than discarding old revisions to make room', () => {
  const input = document()
  while (input.definitions.length < 512) { const id = 'original-filler-' + input.definitions.length; input.definitions.push({ kind: 'part', id, revision: 'r1', document: part(id) }) }
  const before = serializeAssemblyDocument(input)
  expect(() => prepareAssemblyPartUpdate(input, source, part(), 'r2')).toThrow()
  expect(serializeAssemblyDocument(input)).toBe(before); expect(input.definitions).toHaveLength(512)
})

it('repairs one explicit face endpoint while keeping mate identity, other endpoint, source graph and native-verification requirement', () => {
  const plan = prepareAssemblyPartUpdate(document(), source, part(source.id, 5), 'r2'), before = structuredClone(plan.document)
  const next = repairAssemblyEndpoint(plan.document, planeLocator, rebind(firstFace(plan.document)))
  expect(firstFace(next).component.definition).toEqual(plan.replacement)
  expect(next.mates[0].id).toBe(before.mates[0].id); expect(binaryMate(next.mates[0]).type).toBe(binaryMate(before.mates[0]).type)
  expect(binaryMate(next.mates[0]).second).toEqual(binaryMate(before.mates[0]).second); expect(next.mates.slice(1)).toEqual(before.mates.slice(1))
  expect(next.definitions).toEqual(before.definitions); expect(next.occurrences).toEqual(before.occurrences)
  expect(plan.document).toEqual(before)
  const inspection = inspectAssemblyMateReferences(next).find(value => value.mate.id === 'plane')!
  expect(inspection.first.diagnostics).toEqual([]); expect(inspection.nativeVerificationRequired).toBe(true)
})

it('repairs shared declaration locators by exact scope rather than a root mate with the same local ID or name', () => {
  const input = document(); assembly(input).mates[0].id = 'plane'
  const plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2'), original = binaryMate(assembly(plan.document).mates[0]).first
  if (!('kind' in original) || original.kind !== 'face' || original.support !== 'plane' && original.support !== 'axis') throw new Error('Expected original child face')
  const next = repairAssemblyEndpoint(plan.document, { scope: subScope, mateId: 'plane', side: 'first' }, rebind(original))
  expect(next.mates).toEqual(plan.document.mates)
  const repaired = binaryMate(assembly(next).mates[0]).first
  if (!('kind' in repaired) || repaired.kind !== 'face') throw new Error('Expected child face')
  expect(repaired.component.definition).toEqual(plan.replacement)
  expect(inspectAssemblyMateReferences(next).filter(value => value.mate.id === 'plane' && value.scopePath.length === 1)).toHaveLength(2)
})

it('preserves component-lock relative pose and identity during an explicit component endpoint repair', () => {
  const plan = prepareAssemblyPartUpdate(document(), source, part(), 'r2'), original = plan.document.mates.find(value => value.id === 'lock')!
  const next = repairAssemblyEndpoint(plan.document, { scope: rootScope, mateId: 'lock', side: 'first' }, component(['left'], plan.replacement))
  const changed = next.mates.find(value => value.id === 'lock')!
  expect(changed).toEqual({ ...original, first: component(['left'], plan.replacement) })
  expect(next.revision).toBe(plan.document.revision)
})

it('repairs the second side of a concentric mate without losing its captured quaternion, first side or family', () => {
  const input = document()
  input.mates[0] = { id: 'plane', name: 'Original cylindrical declarations', suppressed: false, type: 'concentric', alignment: 'opposed',
    rotationLock: [0, 0, Math.SQRT1_2, Math.SQRT1_2], first: { ...face(), support: 'axis' }, second: { ...face(['right']), support: 'axis' } }
  const plan = prepareAssemblyPartUpdate(input, source, part(), 'r2'), original = binaryMate(plan.document.mates[0])
  if (original.type !== 'concentric') throw new Error('Expected original concentric mate')
  if (original.second.kind !== 'face') throw new Error('Expected original cylindrical face endpoint')
  const repaired = { ...rebind(original.second), support: 'axis' as const }
  const next = repairAssemblyEndpoint(plan.document, { ...planeLocator, side: 'second' }, repaired)
  expect(next.mates[0]).toEqual({ ...original, second: repaired })
  expect(plan.document.mates[0]).toEqual(original)
})

it('does not change timestamp or identity when explicitly repairing with the identical endpoint', () => {
  const input = document(), next = repairAssemblyEndpoint(input, planeLocator, firstFace(input))
  expect(next).toEqual(input); expect(next).not.toBe(input)
})

it('allows an explicitly chosen principal plane to repair planar support without introducing axis or component support', () => {
  const plan = prepareAssemblyPartUpdate(document(), source, part(), 'r2')
  const endpoint: AssemblyGeometryReference = { kind: 'principal-plane', component: component(['left'], plan.replacement), plane: 'YZ' }
  expect(binaryMate(repairAssemblyEndpoint(plan.document, planeLocator, endpoint).mates[0]).first).toEqual(endpoint)
})

it('rejects a support-family change even when an angle mate schema could accept both surfaces', () => {
  const input = document()
  input.mates[0] = { id: 'plane', name: 'Original angle', suppressed: false, type: 'angle', angle: 30,
    first: face(), second: { kind: 'principal-plane', component: null, plane: 'XY' } }
  const before = structuredClone(input), axis: AssemblyFaceReference = { ...face(), support: 'axis' }
  expect(() => repairAssemblyEndpoint(input, planeLocator, axis)).toThrow(/tipo de soporte/)
  expect(input).toEqual(before)
})

it('does not repair deleted mates or stale scopes by display name, sibling index or revision label alone', () => {
  const input = document(), before = structuredClone(input)
  for (const locator of [
    { ...planeLocator, mateId: 'deleted' }, { ...planeLocator, scope: { ...rootScope, revision: 'stale' } },
    { ...planeLocator, scope: source }, { ...planeLocator, side: 'third' },
    { ...planeLocator, scope: { id: rootScope.id } }, { ...planeLocator, extra: true },
  ]) expect(() => repairAssemblyEndpoint(input, locator as AssemblyMateEndpointLocator, face())).toThrow()
  expect(input).toEqual(before)
})

it('rejects executable locator fields and nested endpoint fields without invoking their accessors or toJSON', () => {
  const input = document(), before = structuredClone(input); let calls = 0
  const locator = Object.defineProperty({ ...planeLocator }, 'scope', { enumerable: true, get() { calls++; return rootScope } })
  expect(() => repairAssemblyEndpoint(input, locator, face())).toThrow()
  const endpoint = face(); Object.defineProperty(endpoint.face, 'key', { enumerable: true, get() { calls++; return 'executed' } })
  expect(() => repairAssemblyEndpoint(input, planeLocator, endpoint)).toThrow()
  const callback = Object.assign(face(), { toJSON() { calls++; return face() } })
  expect(() => repairAssemblyEndpoint(input, planeLocator, callback)).toThrow()
  const symbol = Object.assign(face(), { [Symbol('untrusted')]: true })
  const hidden = Object.defineProperty(face(), 'hidden', { value: true })
  expect(() => repairAssemblyEndpoint(input, planeLocator, symbol)).toThrow()
  expect(() => repairAssemblyEndpoint(input, planeLocator, hidden)).toThrow()
  expect(calls).toBe(0); expect(input).toEqual(before)
})

it('stores update and explicit repair as independent detached undo/redo states with old revisions and references intact', () => {
  const input = document(), history = new AssemblyDocumentHistory(input), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  history.commitDocument(plan.document)
  const repaired = repairAssemblyEndpoint(history.current, planeLocator, rebind(firstFace(history.current)))
  history.commitDocument(repaired)
  expect(history.undo()).toEqual(plan.document); expect(history.undo()).toEqual(input)
  expect(history.redo()).toEqual(plan.document); expect(history.redo()).toEqual(repaired)
  const outside = history.current; outside.definitions.pop(); expect(history.current).toEqual(repaired)
})

it('round-trips new revisions and repairable stale endpoints while preserving standalone legacy part bytes', () => {
  const input = document(), legacy = serializeDocument(part()), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(plan.document))
  expect(reopened).toEqual(plan.document); expect(firstFace(reopened).component.definition).toEqual(source)
  expect(serializeDocument((reopened.definitions[0] as EmbeddedPartDefinition).document)).toBe(legacy)
  const repaired = repairAssemblyEndpoint(reopened, planeLocator, rebind(firstFace(reopened)))
  expect(parseAssemblyDocument(serializeAssemblyDocument(repaired))).toEqual(repaired)
  expect(inspectAssemblyMateReferences(repaired).every(value => value.nativeVerificationRequired)).toBe(true)
})

it('enumerates actual root and shared scope prefixes including suppressed expansions, with no fabricated dormant prefix', () => {
  const input = document(), before = structuredClone(input)
  expect(assemblySourceScopePaths(input, rootScope)).toEqual([[]])
  expect(assemblySourceScopePaths(input, subScope)).toEqual([['shared-A'], ['shared-B']])
  expect(assemblySourceScopePaths(input, dormantScope)).toEqual([])
  const outside = assemblySourceScopePaths(input, subScope); outside[0].push('mutation')
  expect(assemblySourceScopePaths(input, subScope)).toEqual([['shared-A'], ['shared-B']]); expect(input).toEqual(before)
})

it('rejects nonassembly, missing and executable scope references before traversing the graph', () => {
  const input = document(); let calls = 0
  expect(() => assemblySourceScopePaths(input, source)).toThrow(/ámbito/)
  expect(() => assemblySourceScopePaths(input, { ...subScope, revision: 'missing' })).toThrow(/ámbito/)
  const getter = Object.defineProperty({ ...subScope }, 'id', { enumerable: true, get() { calls++; return subScope.id } })
  expect(() => assemblySourceScopePaths(input, getter)).toThrow(); expect(calls).toBe(0)
})

it('retains complete graph validation for suppressed cycles rather than walking hidden unbounded definitions', () => {
  const input = document(); assembly(input).occurrences.push({ ...occurrence('cycle', subScope), suppressed: true })
  expect(() => assemblySourceScopePaths(input, rootScope)).toThrow(/ciclo/)
  expect(() => prepareAssemblyPartUpdate(input, source, part(), 'r2')).toThrow(/ciclo/)
})

it('rejects a small declaration DAG whose suppressed repeated expansions exceed the existing graph cap', () => {
  const input = document()
  for (let index = 0; index < 13; index++) {
    const definition = { id: 'original-expansion-' + index, revision: 'r1' }
    const child = index === 12 ? source : { id: 'original-expansion-' + (index + 1), revision: 'r1' }
    input.definitions.push({ kind: 'assembly', ...definition, name: definition.id, createdAt: date, updatedAt: date,
      occurrences: [{ ...occurrence('a', child), suppressed: true }, occurrence('b', child)], mates: [] })
  }
  input.occurrences.push({ ...occurrence('expanded-hidden', { id: 'original-expansion-0', revision: 'r1' }), suppressed: true })
  expect(() => assemblySourceScopePaths(input, rootScope)).toThrow(/presupuesto/)
  expect(() => prepareAssemblyPartUpdate(input, source, part(), 'r2')).toThrow(/presupuesto/)
})

function tangentUpdateDocument(): AssemblyDocument {
  const input = document()
  input.mates = [{ id: 'tangent', name: 'Original infinite surface tangency', type: 'tangent', suppressed: true,
    first: face(), second: { ...face(['right']), support: 'cylinder-surface' }, side: 'negative' }]
  return input
}
it('enumerates both tangent endpoints through source updates without converting surface intent to axis', () => {
  const input = tangentUpdateDocument(), before = serializeAssemblyDocument(input), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  const endpoints = plan.endpoints.filter(value => value.locator.mateId === 'tangent')
  expect(endpoints.map(value => value.locator.side)).toEqual(['first', 'second'])
  expect(endpoints[1].endpoint).toMatchObject({ kind: 'face', support: 'cylinder-surface', component: { definition: source } })
  expect(plan.document.mates).toEqual(input.mates); expect(serializeAssemblyDocument(input)).toBe(before)
  const value = endpoints[1].endpoint
  if (!('kind' in value) || value.kind !== 'face') throw new Error('Original surface required')
  value.face.key = 'Detached plan mutation'; expect(serializeAssemblyDocument(input)).toBe(before)
})
it('repairs an exact surface locator and preserves tangent family, side, suppression and revision history', () => {
  const input = tangentUpdateDocument(), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2'), original = binaryMate(input.mates[0])
  if (original.type !== 'tangent' || original.second.kind !== 'face' || original.second.support !== 'cylinder-surface') throw new Error('Original surface required')
  const replacement = { ...structuredClone(original.second), component: component(['right'], plan.replacement), face: { sourceFeatureId: 'solid', key: 'face-v1|new-explicit-surface' } }
  const repaired = repairAssemblyEndpoint(plan.document, { scope: rootScope, mateId: original.id, side: 'second' }, replacement)
  expect(repaired.mates[0]).toEqual({ ...original, second: replacement }); expect(repaired.definitions.filter(value => value.kind === 'part')).toEqual(plan.document.definitions.filter(value => value.kind === 'part'))
  expect(input.mates[0]).toEqual(original); expect(plan.document.mates[0]).toEqual(original)
})
it.each(['axis', 'plane'] as const)('rejects repairing a cylinder surface as %s', support => {
  const input = tangentUpdateDocument(), original = binaryMate(input.mates[0])
  if (original.type !== 'tangent' || original.second.kind !== 'face') throw new Error('Original surface required')
  const replacement: AssemblyFaceReference = { kind: 'face', component: structuredClone(original.second.component),
    body: structuredClone(original.second.body), face: { ...original.second.face }, support }
  const before = serializeAssemblyDocument(input)
  expect(() => repairAssemblyEndpoint(input, { scope: rootScope, mateId: original.id, side: 'second' }, replacement)).toThrow()
  expect(serializeAssemblyDocument(input)).toBe(before)
})
it('rejects swapping a tangent plane repair to a surface, including under suppression', () => {
  const input = tangentUpdateDocument(), surface = { ...face(), support: 'cylinder-surface' as const }
  expect(() => repairAssemblyEndpoint(input, { scope: rootScope, mateId: 'tangent', side: 'first' }, surface)).toThrow()
})
it('rejects executable replacement surface locators without invoking their accessors', () => {
  const input = tangentUpdateDocument(), surface = { ...face(['right']), support: 'cylinder-surface' as const }; let reads = 0
  Object.defineProperty(surface.face, 'key', { enumerable: true, get() { reads++; return 'fake' } })
  expect(() => repairAssemblyEndpoint(input, { scope: rootScope, mateId: 'tangent', side: 'second' }, surface)).toThrow(); expect(reads).toBe(0)
})

function cylinderUpdateDocument(type: AssemblyCylinderTangentMateType): AssemblyDocument {
  const input = document(); input.mates = [{ id: 'CC', name: 'Original declared internal radius role', type, suppressed: true,
    first: { ...face(), support: 'cylinder-surface' }, second: { ...face(['right']), support: 'cylinder-surface' }, branch: { kind: 'internal', larger: 'second' } }]
  return input
}
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('enumerates and repairs exact %s surface locators without changing branch/radius roles', type => {
  const input = cylinderUpdateDocument(type), before = serializeAssemblyDocument(input), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  const endpoints = plan.endpoints.filter(value => value.locator.mateId === 'CC'); expect(endpoints.map(value => value.locator.side)).toEqual(['first', 'second'])
  expect(endpoints.every(value => 'support' in value.endpoint && value.endpoint.support === 'cylinder-surface')).toBe(true)
  const original = binaryMate(input.mates[0]); if (original.type !== type || original.type !== 'skew-cylinder-tangent' && original.type !== 'parallel-cylinder-tangent') throw new Error('Original cylinder tangency required')
  const replacement = { ...structuredClone(original.second), component: component(['right'], plan.replacement), face: { sourceFeatureId: 'solid', key: 'face-v1|explicit-current-cylinder' } }
  const repaired = repairAssemblyEndpoint(plan.document, { scope: rootScope, mateId: 'CC', side: 'second' }, replacement)
  expect(repaired.mates[0]).toEqual({ ...original, second: replacement }); expect(repaired.mates[0]).toMatchObject({ type, suppressed: true, branch: { kind: 'internal', larger: 'second' } })
  expect(plan.document.mates).toEqual(input.mates); expect(serializeAssemblyDocument(input)).toBe(before)
})
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('rejects axis/plane reattachment for either %s surface without mutating the document', type => {
  const input = cylinderUpdateDocument(type), before = serializeAssemblyDocument(input)
  for (const side of ['first', 'second'] as const) for (const support of ['plane', 'axis'] as const) {
    const replacement: AssemblyFaceReference = { ...face(side === 'first' ? ['left'] : ['right']), support }
    expect(() => repairAssemblyEndpoint(input, { scope: rootScope, mateId: 'CC', side }, replacement)).toThrow()
  }
  expect(serializeAssemblyDocument(input)).toBe(before)
})
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('preserves %s intent through source/history round trips without native radius claims', type => {
  const input = cylinderUpdateDocument(type), history = new AssemblyDocumentHistory(input), before = serializeAssemblyDocument(input)
  const plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  const parsed = parseAssemblyDocument(serializeAssemblyDocument(plan.document)); expect(parsed.mates).toEqual(input.mates)
  const stale = inspectAssemblyMateReferences(parsed).find(value => value.mate.id === 'CC')!
  expect(stale.nativeVerificationRequired).toBe(true); expect(stale.first.diagnostics.map(value => value.code)).toContain('STALE_DEFINITION')
  history.commitDocument(parsed); expect(history.current).toEqual(parsed); expect(history.canUndo).toBe(true)
  expect(history.undo()).toEqual(input); expect(history.redo()).toEqual(parsed); expect(serializeAssemblyDocument(input)).toBe(before)
})

const sphereUpdateTypes: AssemblySphereTangentMateType[] = ['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent']
function sphereUpdateDocument(type: AssemblySphereTangentMateType): AssemblyDocument {
  const input = document(), second = { ...face(['right']), support: 'sphere-surface' as const }
  input.mates = [type === 'plane-sphere-tangent' ? { id: 'S', name: 'Original sphere repair', type, suppressed: true, first: face(), second, side: 'negative' }
    : type === 'sphere-sphere-tangent' ? { id: 'S', name: 'Original sphere pair', type, suppressed: true, first: { ...face(), support: 'sphere-surface' }, second, branch: { kind: 'internal', larger: 'second' } }
      : { id: 'S', name: 'Original cylinder/sphere', type, suppressed: true, first: { ...face(), support: 'cylinder-surface' }, second, branch: { kind: 'internal', larger: 'second' } }]
  return input
}
it.each(sphereUpdateTypes)('enumerates and repairs the exact %s sphere locator preserving saved side/branch and history', type => {
  const input = sphereUpdateDocument(type), before = serializeAssemblyDocument(input), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2')
  const endpoints = plan.endpoints.filter(value => value.locator.mateId === 'S')
  expect(endpoints.map(value => value.locator.side)).toEqual(['first', 'second']); expect(endpoints[1].endpoint).toMatchObject({ support: 'sphere-surface', component: { definition: source } })
  const original = binaryMate(input.mates[0]); if (!('kind' in original.second) || original.second.kind !== 'face' || original.second.support !== 'sphere-surface') throw new Error('Original sphere required')
  const replacement = { ...structuredClone(original.second), component: component(['right'], plan.replacement), face: { sourceFeatureId: 'solid', key: 'face-v1|current-explicit-sphere' } }
  const repaired = repairAssemblyEndpoint(plan.document, { scope: rootScope, mateId: 'S', side: 'second' }, replacement)
  expect(repaired.mates[0]).toEqual({ ...original, second: replacement }); expect(plan.document.mates).toEqual(input.mates); expect(serializeAssemblyDocument(input)).toBe(before)
  const history = new AssemblyDocumentHistory(input); history.commitDocument(repaired); expect(history.undo()).toEqual(input); expect(history.redo()).toEqual(repaired)
})
it.each(sphereUpdateTypes)('rejects role-changing %s sphere repair without reinterpreting the family', type => {
  const input = sphereUpdateDocument(type), before = serializeAssemblyDocument(input)
  for (const support of ['axis', 'plane', 'cylinder-surface'] as const) expect(() => repairAssemblyEndpoint(input, { scope: rootScope, mateId: 'S', side: 'second' }, { ...face(['right']), support })).toThrow()
  expect(serializeAssemblyDocument(input)).toBe(before)
})
it.each(sphereUpdateTypes)('keeps %s updated sources stale until explicit repair and rejects executable replacement locators', type => {
  const input = sphereUpdateDocument(type), plan = prepareAssemblyPartUpdate(input, source, part(source.id, 5), 'r2'), reopened = parseAssemblyDocument(serializeAssemblyDocument(plan.document))
  const [inspection] = inspectAssemblyMateReferences(reopened); expect(inspection.nativeVerificationRequired).toBe(true); expect(inspection.second.diagnostics.map(value => value.code)).toContain('STALE_DEFINITION')
  let reads = 0; const replacement = { ...face(['right']), support: 'sphere-surface' as const }; Object.defineProperty(replacement.face, 'key', { enumerable: true, get() { reads++; return 'fake' } })
  expect(() => repairAssemblyEndpoint(plan.document, { scope: rootScope, mateId: 'S', side: 'second' }, replacement)).toThrow(); expect(reads).toBe(0); expect(plan.document.mates).toEqual(input.mates)
})
