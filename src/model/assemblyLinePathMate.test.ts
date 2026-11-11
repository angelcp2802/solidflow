import { expect, it } from 'vitest'
import { assemblyLinePathFollowAxis, validateAssemblyLinePathOrientation, validateAssemblyLinePathMateRequest, coordinateAssemblyLinePathPosition, type AssemblyLinePathPosition } from './assemblyLinePathMate'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, validateAssemblyMate, type AssemblyDocument, type AssemblyLinePathMate, type AssemblyVertexReference, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { AssemblyDocumentHistory, applyAssemblyEdit } from './assemblyEditing'
import { assemblyMateEndpoints, assemblyMateEndpointComponent, isAssemblyLinePathEndpoint, withAssemblyMateEndpoint, withAssemblyMateEndpointComponent } from './assemblyMateEndpoints'
import { inspectAssemblyMateReferences, isAssemblyLinePathMateInspection, isAssemblyBinaryMateInspection } from './assemblyReferences'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { prepareAssemblyDocumentUpdate } from './assemblySubassemblyUpdates'
import { identityRigidPose } from './rigidPose'

// Original declaration-only prism recipe; opaque keys do not grant native incidence.
const stamp = '2026-10-22T00:00:00.000Z', source = { id: 'line-original-part', revision: 'r0' }
function point(id = 'a'): AssemblyVertexReference { return { kind: 'vertex', component: { occurrencePath: [id], definition: { ...source } }, body: { bodyId: 'box', sourceFeatureId: 'solid' }, vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) }, support: 'point' } }
function path(id = 'b') { const p = point(id); return { component: p.component, body: p.body, edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-line' }, startVertex: p.vertex } }
function declaration(position: AssemblyLinePathPosition = { mode: 'distance', distanceMm: 1, reverse: true }): AssemblyLinePathMate { return { id: 'line-mate', name: 'Original material LINE', suppressed: false, type: 'line-path', point: point(), path: path(), position, orientation: { pitchYaw: 'free', roll: 'free' } } }
function original(): AssemblyDocument { return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'line-root', revision: 'r0', name: 'Original LINE lifecycle', units: 'mm', createdAt: stamp, updatedAt: stamp,
  definitions: [{ kind: 'part', ...source, document: { version: 1, id: source.id, name: 'Original 4x6x4 prism', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'sketch', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
    { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'sketch', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'box' } }] } }],
  occurrences: ['a', 'b'].map(id => ({ id, name: id, definition: { ...source }, pose: identityRigidPose(), fixed: id === 'b', visible: true, suppressed: false })), mates: [declaration()] }) }
function mate(d: AssemblyDocument) { const m = d.mates[0]; if (m.type !== 'line-path') throw Error('Expected original LINE declaration'); return m }
for (const axis of ['x', 'y', 'z'] as const) for (const reverse of [false, true]) it('round-trips explicit unsigned component axis ' + axis + ' with independent reverse=' + reverse, () => {
  const orientation = { pitchYaw: { mode: 'follow' as const, axis, reverse }, roll: 'free' as const }, doc = original()
  mate(doc).orientation = orientation
  expect(parseAssemblyDocument(serializeAssemblyDocument(doc))).toEqual(doc)
  expect(assemblyLinePathFollowAxis(orientation)).toEqual(axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1])
  const checked = validateAssemblyLinePathOrientation(orientation)
  expect(checked).toEqual(orientation); expect(checked).not.toBe(orientation)
  if (checked.pitchYaw === 'free') throw Error('Expected follow declaration')
  checked.pitchYaw.reverse = !reverse; expect(orientation.pitchYaw.reverse).toBe(reverse)
  expect(mate(doc).position).toEqual({ mode: 'distance', distanceMm: 1, reverse: true })
})
it('keeps legacy free orientation exact and rejects partial, unknown and executable follow data', () => {
  const free = { pitchYaw: 'free' as const, roll: 'free' as const }
  expect(validateAssemblyLinePathOrientation(free)).toEqual(free); expect(assemblyLinePathFollowAxis(free)).toBeNull()
  let calls = 0
  for (const value of [{ pitchYaw: { mode: 'follow', axis: 'x' }, roll: 'free' }, { pitchYaw: { mode: 'follow', axis: 'X', reverse: false }, roll: 'free' }, { pitchYaw: { mode: 'follow', axis: 'x', reverse: false, capture: [1, 0, 0] }, roll: 'free' }, { pitchYaw: 'free', roll: 'locked' }, { pitchYaw: 'free', roll: 'free', axis: 'x' }, { pitchYaw: { mode: 'follow', axis: 'x', get reverse() { calls++; return false } }, roll: 'free' }]) expect(() => validateAssemblyLinePathOrientation(value)).toThrow()
  expect(calls).toBe(0)
})
it('preserves explicit follow intent through suppression, source repair and history', () => {
  const doc = original(), orientation = { pitchYaw: { mode: 'follow' as const, axis: 'z' as const, reverse: true }, roll: 'free' as const }
  mate(doc).orientation = orientation; const history = new AssemblyDocumentHistory(doc), { id, ...value } = mate(doc)
  history.commit({ type: 'update-mate', mateId: id, mate: { ...value, suppressed: true } }); const suppressed = history.current
  expect(mate(suppressed).orientation).toEqual(orientation); expect(history.undo()).toEqual(doc); expect(history.redo()).toEqual(suppressed)
  const part = doc.definitions[0]; if (part.kind !== 'part') throw Error('Expected original part')
  const plan = prepareAssemblyPartUpdate(doc, source, part.document, 'r1'); let repaired = plan.document
  for (const entry of plan.endpoints) repaired = repairAssemblyEndpoint(repaired, entry.locator, withAssemblyMateEndpointComponent(entry.endpoint, { ...assemblyMateEndpointComponent(entry.endpoint)!, definition: plan.replacement }))
  expect(mate(repaired).orientation).toEqual(orientation); expect(mate(doc).orientation).toEqual(orientation)
})
it.each< [AssemblyLinePathPosition, number | null] >([
  [{ mode: 'free' }, null], [{ mode: 'distance', distanceMm: 1, reverse: false }, 1], [{ mode: 'distance', distanceMm: 1, reverse: true }, 5],
  [{ mode: 'percent', percent: 25, reverse: false }, 1.5], [{ mode: 'percent', percent: 25, reverse: true }, 4.5],
  [{ mode: 'percent', percent: 0, reverse: false }, 0], [{ mode: 'percent', percent: 100, reverse: false }, 6],
])('retains exact explicit position %j and converts against a literal 6mm LINE', (position, expected) => {
  const m = declaration(position), parsed = validateAssemblyMate(m)
  expect(parsed).toEqual(m); expect(coordinateAssemblyLinePathPosition(position, 6)).toBe(expected)
  const doc = original(); doc.mates = [m]; expect(parseAssemblyDocument(serializeAssemblyDocument(doc))).toEqual(doc)
})
it('detaches both roles, keeps same-owner syntax and never saves measurements or native proofs', () => {
  const m = declaration(), { id: _id, name: _name, suppressed: _s, type: _t, ...request } = m
  request.path.component = request.point.component
  const parsed = validateAssemblyLinePathMateRequest(request)
  expect(parsed.path.component).toEqual(parsed.point.component); expect(parsed.path.component).not.toBe(parsed.point.component)
  parsed.path.component.occurrencePath[0] = 'changed'; expect(request.point.component.occurrencePath).toEqual(['a'])
  expect(Object.keys(parsed.path).sort()).toEqual(['body', 'component', 'edge', 'startVertex'])
  expect(() => validateAssemblyMate({ ...m, coordinateMm: 1 })).toThrow()
})
it('rejects executable fields at every dedicated boundary without invoking getters', () => {
  let calls = 0
  for (const field of ['type', 'point', 'path', 'position', 'orientation']) { const m = declaration(); Object.defineProperty(m, field, { enumerable: true, get() { calls++; throw Error('Getter'); } }); expect(() => validateAssemblyMate(m)).toThrow() }
  for (const [target, field] of [['position', 'mode'], ['orientation', 'roll'], ['path', 'startVertex']] as const) { const m = declaration(); Object.defineProperty(m[target], field, { enumerable: true, get() { calls++; throw Error('Getter'); } }); expect(() => validateAssemblyMate(m)).toThrow() }
  expect(calls).toBe(0)
})
it('rejects partial origins, wrong sources, orientation claims and invalid scalar/data variants', () => {
  const m = declaration()
  for (const value of [{ ...m, path: { ...path(), startVertex: null } }, { ...m, path: { ...path(), startVertex: { ...point().vertex, sourceFeatureId: 'other' } } },
    { ...m, orientation: { pitchYaw: 'follow', roll: 'free' } }, { ...m, position: { mode: 'free', reverse: false } }, { ...m, position: { mode: 'percent', percent: NaN, reverse: false } },
    { ...m, position: { mode: 'distance', distanceMm: Infinity, reverse: false } }, { ...m, position: { mode: 'distance', distanceMm: 1 } }, { ...m, position: { mode: 'percent', percent: 25, reverse: 0 } }]) expect(() => validateAssemblyMate(value)).toThrow()
  for (const length of [0, -1, Infinity, NaN]) expect(() => coordinateAssemblyLinePathPosition({ mode: 'free' }, length)).toThrow()
  expect(() => coordinateAssemblyLinePathPosition({ mode: 'distance', distanceMm: -Number.MAX_VALUE, reverse: true }, Number.MAX_VALUE)).toThrow()
  expect(() => coordinateAssemblyLinePathPosition({ mode: 'percent', percent: Number.MIN_VALUE, reverse: false }, 6)).toThrow()
  expect(() => coordinateAssemblyLinePathPosition({ mode: 'percent', percent: 1, reverse: false }, Number.MIN_VALUE)).toThrow()
})
it('preserves size-independent saved distance but rejects it against a shorter actual material LINE', () => {
  const m = declaration({ mode: 'distance', distanceMm: 7, reverse: false })
  expect(validateAssemblyMate(m)).toEqual(m)
  expect(() => coordinateAssemblyLinePathPosition(m.position, 6)).toThrow(RangeError)
  expect(coordinateAssemblyLinePathPosition(m.position, 8)).toBe(7)
  expect(coordinateAssemblyLinePathPosition({ mode: 'distance', distanceMm: 6, reverse: true }, 6)).toBe(0)
  for (const position of [{ mode: 'distance', distanceMm: -1, reverse: false }, { mode: 'percent', percent: -1, reverse: false }, { mode: 'percent', percent: 125, reverse: false }]) expect(() => validateAssemblyMate({ ...declaration(), position })).toThrow(RangeError)
})
it('keeps a deleted component role repairable rather than silently cascading away its material mate', () => {
  const doc = original(), next = applyAssemblyEdit(doc, { type: 'delete-occurrence', occurrenceId: 'b' })
  expect(next.mates).toEqual(doc.mates)
  const inspection = inspectAssemblyMateReferences(next)[0]
  if (!isAssemblyLinePathMateInspection(inspection)) throw Error('LINE inspection required')
  expect(inspection.path.diagnostics.map(d => d.code)).toEqual(['MISSING_OCCURRENCE', 'MISSING_OCCURRENCE'])
  expect(inspection.point.diagnostics).toEqual([])
})
it('retains two reused nested declaration scopes including hidden and suppressed occurrences', () => {
  const doc = original(), nested: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'nested', revision: 'r0', name: 'Original reused group', createdAt: stamp, updatedAt: stamp, occurrences: structuredClone(doc.occurrences), mates: [declaration()] }
  doc.definitions.push(nested); doc.mates = []; doc.occurrences = ['left', 'right'].map(id => ({ id, name: id, definition: { id: nested.id, revision: nested.revision }, pose: identityRigidPose(), fixed: false, suppressed: id === 'right', visible: id !== 'left' }))
  const inspected = inspectAssemblyMateReferences(doc)
  expect(inspected.map(i => i.scopePath)).toEqual([['left'], ['right']]); expect(inspected.every(isAssemblyLinePathMateInspection)).toBe(true)
  if (!isAssemblyLinePathMateInspection(inspected[0]) || !isAssemblyLinePathMateInspection(inspected[1])) throw Error('LINE scopes required')
  expect(inspected[0].point.candidate?.visible).toBe(false); expect(inspected[0].point.diagnostics).toEqual([])
  expect(inspected[1].suppressed).toBe(true); expect(inspected[1].path.diagnostics.map(d => d.code)).toEqual(['SUPPRESSED_COMPONENT', 'SUPPRESSED_COMPONENT'])
  expect(parseAssemblyDocument(serializeAssemblyDocument(doc))).toEqual(doc)
})
it('exposes point/path separately and diagnoses both path producers without binary reinterpretation', () => {
  const doc = original(), m = mate(doc)
  expect(assemblyMateEndpoints(m)).toEqual([{ side: 'point', reference: m.point }, { side: 'path', reference: m.path }])
  m.path.body = null; m.path.edge.sourceFeatureId = 'missing'; m.path.startVertex.sourceFeatureId = 'missing'
  const inspection = inspectAssemblyMateReferences(doc)[0]
  expect(isAssemblyBinaryMateInspection(inspection)).toBe(false)
  if (!isAssemblyLinePathMateInspection(inspection)) throw Error('LINE inspection required')
  expect(inspection.point.diagnostics).toEqual([]); expect(inspection.path.diagnostics.map(x => x.code)).toEqual(['MISSING_EDGE_PRODUCER', 'MISSING_VERTEX_PRODUCER'])
})
it('rebinds an atomic path owner while preserving both material identities and preserving input', () => {
  const m = declaration(), before = structuredClone(m), desired = { occurrencePath: ['sub', 'renamed'], definition: { id: source.id, revision: 'r1' } }, bound = withAssemblyMateEndpointComponent(m.path, desired)
  expect(isAssemblyLinePathEndpoint(bound)).toBe(true); expect(assemblyMateEndpointComponent(bound)).toEqual(desired)
  expect(withAssemblyMateEndpoint(m, 'path', bound)).toEqual({ ...m, path: bound }); expect(m).toEqual(before)
  expect(() => withAssemblyMateEndpoint(m, 'path', { kind: 'edge', component: m.path.component, body: m.path.body, edge: m.path.edge, support: 'line' })).toThrow()
  expect(() => withAssemblyMateEndpoint(m, 'point', m.path)).toThrow()
})
it('preserves suppression, deletion, Undo/Redo and save/reopen without inferred coordinates', () => {
  const doc = original(), history = new AssemblyDocumentHistory(doc), { id, ...m } = mate(doc)
  history.commit({ type: 'update-mate', mateId: id, mate: { ...m, suppressed: true, position: { mode: 'percent', percent: 25, reverse: true } } })
  const edited = history.current; expect(mate(edited).suppressed).toBe(true); expect(history.undo()).toEqual(doc); expect(history.redo()).toEqual(edited)
  history.commit({ type: 'delete-mate', mateId: id }); expect(history.current.mates).toEqual([]); expect(history.undo()).toEqual(edited)
  expect(parseAssemblyDocument(serializeAssemblyDocument(edited))).toEqual(edited)
})
it('inventories active, suppressed and dormant two-role source repairs without half-path retention', () => {
  const doc = original(), part = doc.definitions[0]; if (part.kind !== 'part') throw Error('Part expected')
  mate(doc).suppressed = true
  const dormant: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'dormant', revision: 'r0', name: 'Dormant original', createdAt: stamp, updatedAt: stamp, occurrences: structuredClone(doc.occurrences), mates: [declaration()] }
  doc.definitions.push(dormant); const before = structuredClone(doc), plan = prepareAssemblyPartUpdate(doc, source, part.document, 'r1')
  expect(plan.endpoints.map(e => [e.locator.scope.id, e.locator.side])).toEqual([['line-root', 'point'], ['line-root', 'path'], ['dormant', 'point'], ['dormant', 'path']])
  let repaired = plan.document
  for (const e of plan.endpoints) { const component = assemblyMateEndpointComponent(e.endpoint)!; repaired = repairAssemblyEndpoint(repaired, e.locator, withAssemblyMateEndpointComponent(e.endpoint, { ...component, definition: plan.replacement })) }
  expect(mate(repaired).path.component.definition).toEqual(plan.replacement); expect(mate(repaired).path.startVertex).toEqual(mate(doc).path.startVertex); expect(mate(repaired).suppressed).toBe(true); expect(doc).toEqual(before)
})
it('requires explicit path repair in selected/all replacement and through renamed nested children', () => {
  const doc = original(), part = doc.definitions[0]; if (part.kind !== 'part') throw Error('Part expected')
  const request = { component: mate(doc).path.component, part: { ...part.document, id: 'new-original' }, revision: 'r1', ancestorRevisions: [] }
  const selected = prepareAssemblyPartReplacement(doc, { ...request, mode: 'selected' }), all = prepareAssemblyPartReplacement(doc, { ...request, mode: 'all' })
  expect(selected.endpoints.map(e => e.locator.side)).toEqual(['path']); expect(selected.endpoints[0].retainFrame).toBe(false); expect(all.endpoints.map(e => e.locator.side)).toEqual(['point', 'path']); expect(all.endpoints.every(e => !e.retainFrame)).toBe(true)
  const old: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'sub', revision: 'r0', name: 'Original source', createdAt: stamp, updatedAt: stamp, occurrences: [structuredClone(doc.occurrences[1])], mates: [] }
  doc.definitions.push(old); doc.occurrences[1].definition = { id: 'sub', revision: 'r0' }; mate(doc).path.component.occurrencePath = ['b', 'b']
  const incoming = validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'sub', revision: 'r1', name: 'Original revised', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part], occurrences: [{ ...old.occurrences[0], id: 'renamed' }], mates: [] })
  const plan = prepareAssemblyDocumentUpdate(doc, { id: 'sub', revision: 'r0' }, incoming)
  expect(plan.endpoints).toHaveLength(1); expect(plan.endpoints[0]).toMatchObject({ locator: { side: 'path' }, suffix: ['b'], status: 'needs-repair', afterResolution: 'missing-path' }); expect(isAssemblyLinePathEndpoint(plan.endpoints[0].endpoint)).toBe(true); expect(plan.capturedMates).toEqual([])
})
