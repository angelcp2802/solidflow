import { expect, it } from 'vitest'
import { validateAssemblyDocument, validateAssemblyMate, parseAssemblyDocument, serializeAssemblyDocument,
  type AssemblyDocument, type AssemblyProfileCenterMate, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { assemblyMateEndpoints, assemblyMateEndpointComponent, isAssemblyProfileCenterEndpoint, withAssemblyMateEndpoint, withAssemblyMateEndpointComponent } from './assemblyMateEndpoints'
import { inspectAssemblyMateReferences, isAssemblyProfileCenterMateInspection, isAssemblyBinaryMateInspection } from './assemblyReferences'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { prepareAssemblyDocumentUpdate } from './assemblySubassemblyUpdates'
import { identityRigidPose } from './rigidPose'
import type { AssemblyProfileCenterSelection } from './assemblyProfileCenterReferences'

// Original document declarations: opaque face/edge labels are not native
// geometry, boundary membership or shape-compatibility evidence.
const stamp = '2026-10-22T00:00:00.000Z', source = { id: 'profile-original-part', revision: 'r0' }
function selection(id: string, rectangle = true): AssemblyProfileCenterSelection {
  return { face: { component: { occurrencePath: [id], definition: { ...source } }, body: { bodyId: 'box', sourceFeatureId: 'solid' },
    face: { sourceFeatureId: 'solid', key: 'face-v1|original-profile-' + id } },
  axis: rectangle ? { edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-boundary-' + id }, sense: id === 'a' ? 1 : -1 } : null }
}
function declaration(rectangle = true): AssemblyProfileCenterMate {
  return { id: 'profile-center', name: 'Original ordered profile declarations', suppressed: false, type: 'profile-center', first: selection('a', rectangle), second: selection('b', rectangle),
    alignment: 'opposed', offsetMm: -2, orientation: rectangle ? { mode: 'rectangle', quarterTurns: 3 } : { mode: 'free' } }
}
function original(rectangle = true): AssemblyDocument {
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'profile-root', revision: 'r0', name: 'Original profile lifecycle', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', ...source, document: { version: 1, id: source.id, name: 'Original 4x6x4 prism', units: 'mm', createdAt: stamp, updatedAt: stamp,
      features: [{ id: 'sketch', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
        { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'sketch', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'box' } }] } }],
    occurrences: ['a', 'b'].map(id => ({ id, name: id, definition: { ...source }, pose: identityRigidPose(), fixed: id === 'a', visible: true, suppressed: false })), mates: [declaration(rectangle)] })
}
function profile(d: AssemblyDocument): AssemblyProfileCenterMate { const m = d.mates[0]; if (m.type !== 'profile-center') throw Error('Original profile required'); return m }
for (const rectangle of [false, true]) it('round-trips ordered compound selections without derived geometry, rectangle=' + rectangle, () => {
  const input = original(rectangle), m = profile(input), copy = validateAssemblyMate(m)
  expect(copy).toEqual(m); expect(copy).not.toBe(m); expect(parseAssemblyDocument(serializeAssemblyDocument(input))).toEqual(input)
  expect(assemblyMateEndpoints(m)).toEqual([{ side: 'first', reference: m.first }, { side: 'second', reference: m.second }])
  expect(Object.keys(m.first).sort()).toEqual(['axis', 'face']); expect(Object.keys(m.first.face).sort()).toEqual(['body', 'component', 'face'])
  const inspection = inspectAssemblyMateReferences(input)[0]
  expect(isAssemblyProfileCenterMateInspection(inspection)).toBe(true); expect(isAssemblyBinaryMateInspection(inspection)).toBe(false)
  expect('first' in inspection && inspection.first.diagnostics).toEqual([])
})
it.each(['first', 'second', 'alignment', 'offsetMm', 'orientation', 'worldSupport', 'relativePose'])('rejects malformed saved field %s', field => {
  const m: Record<string, unknown> = { ...declaration() }
  const bad: Record<string, unknown> = { first: { ...selection('a'), axis: null }, second: { face: selection('b').face }, alignment: 'automatic', offsetMm: NaN,
    orientation: { mode: 'rectangle', quarterTurns: 4 }, worldSupport: { center: [0, 0, 0] }, relativePose: identityRigidPose() }
  m[field] = bad[field]; expect(() => validateAssemblyMate(m)).toThrow()
})
it('rejects half repairs, wrong source/body and executable nested data without invoking them', () => {
  let reads = 0
  const m = declaration(), first = structuredClone(m.first)
  Object.defineProperty(first.axis!, 'edge', { enumerable: true, get() { reads++; throw Error('Executable edge') } })
  expect(() => validateAssemblyMate({ ...m, first })).toThrow(); expect(reads).toBe(0)
  const mismatched = selection('a'); mismatched.axis!.edge.sourceFeatureId = 'other'
  expect(() => validateAssemblyMate({ ...m, first: mismatched })).toThrow()
  const wrongBody = selection('a'); wrongBody.face.body!.sourceFeatureId = 'other'
  expect(() => validateAssemblyMate({ ...m, first: wrongBody })).toThrow()
  expect(() => validateAssemblyMate({ ...declaration(false), first: selection('a') })).toThrow()
})
it('rebinds a whole compound owner without silently replacing topology or sense', () => {
  const m = declaration(), desired = { occurrencePath: ['nested', 'renamed'], definition: { id: source.id, revision: 'r1' } }
  const rebound = withAssemblyMateEndpointComponent(m.first, desired)
  expect(isAssemblyProfileCenterEndpoint(rebound)).toBe(true); expect(assemblyMateEndpointComponent(rebound)).toEqual(desired)
  if (!isAssemblyProfileCenterEndpoint(rebound)) throw Error('Compound expected')
  expect(rebound.axis).toEqual(m.first.axis); expect(rebound.face.face).toEqual(m.first.face.face); expect(m.first.face.component.occurrencePath).toEqual(['a'])
  const changed = withAssemblyMateEndpoint(m, 'first', rebound)
  expect(changed).toMatchObject({ first: rebound, second: m.second })
  expect(() => withAssemblyMateEndpoint(m, 'first', { kind: 'face', ...m.first.face, support: 'plane' })).toThrow()
})
it('inspects both the face and material edge producer without inferring native boundary membership', () => {
  const input = original(), m = profile(input); m.first.axis!.edge = { sourceFeatureId: 'missing', key: 'edge-v1|missing' }
  m.first.face.face.sourceFeatureId = 'missing'; m.first.face.body = null
  const result = inspectAssemblyMateReferences(input)[0]
  if (!isAssemblyProfileCenterMateInspection(result)) throw Error('Profile inspection required')
  expect(result.first.diagnostics.map(d => d.code)).toEqual(['MISSING_FACE_PRODUCER', 'MISSING_EDGE_PRODUCER'])
})
it('preserves profile options and complete selections through edit, suppression, history and reopening', () => {
  const input = original(), history = new AssemblyDocumentHistory(input), { id, ...m } = profile(input)
  history.commit({ type: 'update-mate', mateId: id, mate: { ...m, suppressed: true, offsetMm: 4, first: m.second, second: m.first, orientation: { mode: 'rectangle', quarterTurns: 1 } } })
  expect(profile(history.current)).toMatchObject({ id, suppressed: true, offsetMm: 4, first: m.second, second: m.first, orientation: { mode: 'rectangle', quarterTurns: 1 } })
  expect(history.undo()).toEqual(input); const redo = history.redo(); expect(parseAssemblyDocument(serializeAssemblyDocument(redo))).toEqual(redo)
})
it('inventories active, suppressed and dormant source uses once per compound declaration role and repairs atomically', () => {
  const input = original(), part = input.definitions[0]; if (part.kind !== 'part') throw Error('Part required')
  input.mates[0].suppressed = true
  const dormant: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'dormant', revision: 'r0', name: 'Dormant profile source', createdAt: stamp, updatedAt: stamp,
    occurrences: structuredClone(input.occurrences), mates: [declaration()] }
  input.definitions.push(dormant)
  const before = structuredClone(input), plan = prepareAssemblyPartUpdate(input, source, part.document, 'r1')
  expect(plan.endpoints.map(e => [e.locator.scope.id, e.locator.side])).toEqual([['profile-root', 'first'], ['profile-root', 'second'], ['dormant', 'first'], ['dormant', 'second']])
  let repaired = plan.document
  for (const item of plan.endpoints) {
    if (!isAssemblyProfileCenterEndpoint(item.endpoint)) throw Error('Compound required')
    const reference = withAssemblyMateEndpointComponent(item.endpoint, { ...item.endpoint.face.component, definition: plan.replacement })
    repaired = repairAssemblyEndpoint(repaired, item.locator, reference)
  }
  expect(profile(repaired).first.face.component.definition).toEqual(plan.replacement)
  expect(profile(repaired).first.axis).toEqual(profile(input).first.axis)
  expect(profile(repaired).suppressed).toBe(true); expect(input).toEqual(before)
})
it('selected/all replacement never auto-retains a compound profile as a component frame', () => {
  const input = original(), part = input.definitions[0]; if (part.kind !== 'part') throw Error('Part required')
  const replacement = { ...part.document, id: 'original-replacement-part' }, common = { component: profile(input).second.face.component, part: replacement, revision: 'r1', ancestorRevisions: [] }
  const selected = prepareAssemblyPartReplacement(input, { ...common, mode: 'selected' })
  expect(selected.endpoints.map(e => e.locator.side)).toEqual(['second']); expect(selected.endpoints[0].retainFrame).toBe(false)
  expect(profile(selected.document).second).toEqual(profile(input).second)
  const all = prepareAssemblyPartReplacement(input, { ...common, mode: 'all' })
  expect(all.endpoints.map(e => e.locator.side)).toEqual(['first', 'second']); expect(all.endpoints.every(e => !e.retainFrame)).toBe(true)
})
it('traces compound endpoints across an updated subassembly boundary, retaining explicit renamed-child repair', () => {
  const input = original(), oldNode: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'sub', revision: 'r0', name: 'Original source', createdAt: stamp, updatedAt: stamp,
    occurrences: [structuredClone(input.occurrences[0])], mates: [] }
  input.definitions.push(oldNode); input.occurrences[0].definition = { id: 'sub', revision: 'r0' }
  profile(input).first.face.component.occurrencePath = ['a', 'a']
  const incoming = validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original updated source', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [input.definitions[0]], occurrences: [{ ...oldNode.occurrences[0], id: 'renamed' }], mates: [] })
  const plan = prepareAssemblyDocumentUpdate(input, { id: 'sub', revision: 'r0' }, incoming)
  expect(plan.endpoints).toHaveLength(1); expect(plan.endpoints[0]).toMatchObject({ locator: { side: 'first' }, boundary: { occurrencePath: ['a'] }, suffix: ['a'], status: 'needs-repair', afterResolution: 'missing-path' })
  expect(plan.endpoints[0].desiredComponent).toBeUndefined(); expect(plan.capturedMates).toEqual([])
  expect(isAssemblyProfileCenterEndpoint(plan.endpoints[0].endpoint)).toBe(true)
})
