import { expect, it } from 'vitest'
import { assemblyLinePathFollowAxis, assemblyLinePathRollAxis, validateAssemblyLinePathOrientation,
  type AssemblyLinePathAxis, type AssemblyLinePathRollUp, type AssemblyLinePathUpReference } from './assemblyLinePathMate'
import { validateAssemblyDocument, validateAssemblyMate, serializeAssemblyDocument, parseAssemblyDocument,
  type AssemblyDocument, type AssemblyLinePathMate, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from './assemblyDocument'
import { assemblyMateEndpoint, assemblyMateEndpoints, assemblyMateEndpointComponent,
  withAssemblyMateEndpoint, withAssemblyMateEndpointComponent } from './assemblyMateEndpoints'
import { inspectAssemblyMateReferences, isAssemblyLinePathMateInspection } from './assemblyReferences'
import { AssemblyDocumentHistory, applyAssemblyEdit } from './assemblyEditing'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { prepareAssemblyDocumentUpdate } from './assemblySubassemblyUpdates'
import { identityRigidPose } from './rigidPose'

// Original declarations for independent role/lifecycle tests. Opaque boundary
// keys describe syntax only and are never used as native geometry evidence.
const stamp = '2026-10-22T00:00:00.000Z'
const material = { id: 'up-moving-material', revision: 'r0' }, guideSource = { id: 'up-guide-material', revision: 'r0' }
function part(id: string): EmbeddedPartDefinition {
  return { kind: 'part', id, revision: 'r0', document: { version: 1, id, name: 'Original 4 by 6 prism', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
    { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
    { id: 'solid', name: 'Original extrusion', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } },
  ] } }
}
function guide(source = guideSource): AssemblyLinePathUpReference {
  return { kind: 'face', component: { occurrencePath: ['c'], definition: { ...source } }, body: { bodyId: 'body', sourceFeatureId: 'solid' },
    face: { sourceFeatureId: 'solid', key: 'face-v1|original-up-plane' }, support: 'plane' }
}
function original(shared = false): AssemblyDocument {
  const point = { kind: 'vertex' as const, component: { occurrencePath: ['a'], definition: { ...material } }, body: { bodyId: 'body', sourceFeatureId: 'solid' },
    vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) }, support: 'point' as const }
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'up-root', revision: 'r0', name: 'Original three-role LINE', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [part(material.id), ...(shared ? [] : [part(guideSource.id)])],
    occurrences: ['a', 'b', 'c'].map(id => ({ id, name: id, definition: { ...(id === 'c' && !shared ? guideSource : material) }, pose: identityRigidPose(), fixed: id !== 'a', suppressed: false, visible: true })),
    mates: [{ id: 'up-mate', name: 'Original UP path', type: 'line-path', suppressed: false, point,
      path: { component: { occurrencePath: ['b'], definition: { ...material } }, body: { ...point.body }, edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-line' }, startVertex: { ...point.vertex } },
      position: { mode: 'distance', distanceMm: 1, reverse: true }, orientation: { pitchYaw: { mode: 'follow', axis: 'x', reverse: true },
        roll: { mode: 'up', axis: 'y', reverse: false, guide: guide(shared ? material : guideSource) } } }],
  })
}
function line(d: AssemblyDocument): AssemblyLinePathMate { const m = d.mates[0]; if (m.type !== 'line-path') throw Error('Expected original LINE'); return m }
function up(d: AssemblyDocument): AssemblyLinePathRollUp { const r = line(d).orientation.roll; if (r === 'free') throw Error('Expected original UP'); return r }
const axes: AssemblyLinePathAxis[] = ['x', 'y', 'z']
for (const followAxis of axes) for (const upAxis of axes.filter(a => a !== followAxis)) for (const reverse of [false, true]) {
  it(`round-trips three roles and independent UP ${upAxis}/${reverse} with Follow ${followAxis}`, () => {
    const d = original(), m = line(d), g = up(d).guide
    m.orientation = { pitchYaw: { mode: 'follow', axis: followAxis, reverse: true }, roll: { mode: 'up', axis: upAxis, reverse, guide: g } }
    const copy = validateAssemblyLinePathOrientation(m.orientation)
    expect(copy).toEqual(m.orientation); expect(copy).not.toBe(m.orientation)
    if (copy.roll === 'free') throw Error('UP expected')
    expect(copy.roll.guide).not.toBe(g); expect(copy.roll.guide.face).not.toBe(g.face); expect(copy.roll.guide.body).not.toBe(g.body)
    expect(assemblyLinePathFollowAxis(copy)).toEqual(followAxis === 'x' ? [1, 0, 0] : followAxis === 'y' ? [0, 1, 0] : [0, 0, 1])
    expect(assemblyLinePathRollAxis(copy)).toEqual(upAxis === 'x' ? [1, 0, 0] : upAxis === 'y' ? [0, 1, 0] : [0, 0, 1])
    expect(parseAssemblyDocument(serializeAssemblyDocument(d))).toEqual(d)
    copy.roll.guide.component.occurrencePath[0] = 'changed'; copy.roll.reverse = !reverse
    expect(g.component.occurrencePath).toEqual(['c']); expect(up(d).reverse).toBe(reverse)
    expect(m.position).toEqual({ mode: 'distance', distanceMm: 1, reverse: true })
  })
}
it('preserves both old orientation forms and rejects unavailable or ambiguous UP purpose', () => {
  expect(assemblyLinePathRollAxis({ pitchYaw: 'free', roll: 'free' })).toBeNull()
  expect(assemblyLinePathRollAxis({ pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: 'free' })).toBeNull()
  const good = line(original()).orientation
  if (good.roll === 'free') throw Error('UP expected')
  const variants = [
    { ...good, pitchYaw: 'free' }, { ...good, roll: { ...good.roll, axis: 'x' } },
    { ...good, roll: { ...good.roll, axis: 'Y' } }, { ...good, roll: { ...good.roll, reverse: 0 } },
    { ...good, roll: { ...good.roll, mode: 'locked' } }, { ...good, roll: { mode: 'up', axis: 'y', reverse: false } },
    { ...good, roll: { ...good.roll, preview: true } },
    { ...good, roll: { ...good.roll, guide: { kind: 'principal-plane', component: null, plane: 'XY' } } },
    { ...good, roll: { ...good.roll, guide: { ...good.roll.guide, support: 'axis' } } },
    { ...good, roll: { ...good.roll, guide: { ...good.roll.guide, body: { bodyId: 'body', sourceFeatureId: 'different' } } } },
  ]
  for (const orientation of variants) expect(() => validateAssemblyLinePathOrientation(orientation)).toThrow()
})
it('rejects executable UP fields and nested face data without invoking accessors', () => {
  let calls = 0
  for (const key of ['mode', 'axis', 'reverse', 'guide']) {
    const r = structuredClone(up(original())); Object.defineProperty(r, key, { enumerable: true, get() { calls++; throw Error('Accessor'); } })
    expect(() => validateAssemblyLinePathOrientation({ pitchYaw: { mode: 'follow', axis: 'x', reverse: false }, roll: r })).toThrow()
  }
  const d = original(); Object.defineProperty(up(d).guide.face, 'key', { enumerable: true, get() { calls++; throw Error('Accessor'); } })
  expect(() => validateAssemblyMate(line(d))).toThrow(); expect(calls).toBe(0)
})
it('exposes UP as an atomic third role and repairs only its nested declaration', () => {
  const m = line(original()), before = structuredClone(m), endpoints = assemblyMateEndpoints(m)
  expect(endpoints.map(e => e.side)).toEqual(['point', 'path', 'up'])
  expect(assemblyMateEndpoint(m, 'up')?.reference).toEqual(up(original()).guide)
  const g = guide(), bound = withAssemblyMateEndpointComponent(g, { occurrencePath: ['nested', 'new'], definition: { ...guideSource, revision: 'r1' } })
  const repaired = withAssemblyMateEndpoint(m, 'up', bound)
  expect(assemblyMateEndpointComponent(assemblyMateEndpoint(repaired, 'up')!.reference!)).toEqual({ occurrencePath: ['nested', 'new'], definition: { ...guideSource, revision: 'r1' } })
  expect(repaired.type === 'line-path' && repaired.position).toEqual(m.position)
  expect(repaired.type === 'line-path' && repaired.point).toEqual(m.point)
  expect(repaired.type === 'line-path' && repaired.path).toEqual(m.path); expect(m).toEqual(before)
  expect(() => withAssemblyMateEndpoint(m, 'up', m.point)).toThrow()
  expect(() => withAssemblyMateEndpoint({ ...m, orientation: { pitchYaw: 'free', roll: 'free' } }, 'up', g)).toThrow()
})
it('keeps UP intent through suppression, deletion, Undo/Redo and saved reopen', () => {
  const d = original(), history = new AssemblyDocumentHistory(d), { id, ...m } = line(d)
  history.commit({ type: 'update-mate', mateId: id, mate: { ...m, suppressed: true } })
  const suppressed = history.current
  expect(up(suppressed)).toEqual(up(d)); expect(history.undo()).toEqual(d); expect(history.redo()).toEqual(suppressed)
  history.commit({ type: 'delete-mate', mateId: id }); expect(history.current.mates).toEqual([]); expect(history.undo()).toEqual(suppressed)
  expect(parseAssemblyDocument(serializeAssemblyDocument(history.current))).toEqual(suppressed)
  const deleted = applyAssemblyEdit(d, { type: 'delete-occurrence', occurrenceId: 'c' })
  expect(deleted.mates).toEqual(d.mates)
  const inspected = inspectAssemblyMateReferences(deleted)[0]
  if (!isAssemblyLinePathMateInspection(inspected)) throw Error('LINE expected')
  expect(inspected.up?.diagnostics.map(x => x.code)).toEqual(['MISSING_OCCURRENCE'])
  expect(inspected.point.diagnostics).toEqual([]); expect(inspected.path.diagnostics).toEqual([])
})
it.each([false, true])('inventories and explicitly repairs UP-only source changes in dormant scopes and root suppressed=%s', suppressed => {
  const d = original(), p = d.definitions.find(x => x.id === guideSource.id)
  if (p?.kind !== 'part') throw Error('Original guide part required')
  line(d).suppressed = suppressed
  const dormant: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'up-dormant', revision: 'r0', name: 'Original dormant group', createdAt: stamp, updatedAt: stamp,
    occurrences: structuredClone(d.occurrences), mates: [structuredClone(line(d))] }
  d.definitions.push(dormant)
  const before = structuredClone(d), plan = prepareAssemblyPartUpdate(d, guideSource, p.document, 'r1')
  expect(plan.endpoints.map(x => [x.locator.scope.id, x.locator.side])).toEqual([['up-root', 'up'], ['up-dormant', 'up']])
  const stale = inspectAssemblyMateReferences(plan.document)[0]
  if (!isAssemblyLinePathMateInspection(stale)) throw Error('LINE expected')
  expect(stale.up?.diagnostics.map(x => x.code)).toEqual(['STALE_DEFINITION'])
  expect(stale.point.diagnostics).toEqual([]); expect(stale.path.diagnostics).toEqual([])
  let repaired = plan.document
  for (const item of plan.endpoints) {
    const owner = assemblyMateEndpointComponent(item.endpoint)!
    repaired = repairAssemblyEndpoint(repaired, item.locator, withAssemblyMateEndpointComponent(item.endpoint, { ...owner, definition: plan.replacement }))
  }
  expect(up(repaired).guide.component.definition).toEqual(plan.replacement)
  expect(line(repaired).point).toEqual(line(before).point); expect(line(repaired).path).toEqual(line(before).path)
  expect(up(repaired).axis).toBe('y'); expect(up(repaired).reverse).toBe(false); expect(line(repaired).suppressed).toBe(suppressed)
  expect(d).toEqual(before); expect(parseAssemblyDocument(serializeAssemblyDocument(repaired))).toEqual(repaired)
})
it('inspects all three roles in reused hidden and suppressed occurrence namespaces', () => {
  const d = original(), group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'up-reused', revision: 'r0', name: 'Original reused group',
    createdAt: stamp, updatedAt: stamp, occurrences: structuredClone(d.occurrences), mates: structuredClone(d.mates) }
  d.definitions.push(group); d.mates = []
  d.occurrences = ['left', 'right'].map(id => ({ id, name: id, definition: { id: group.id, revision: group.revision },
    pose: identityRigidPose(), fixed: false, suppressed: id === 'right', visible: id !== 'left' }))
  const inspected = inspectAssemblyMateReferences(d)
  expect(inspected.map(i => i.scopePath)).toEqual([['left'], ['right']])
  if (!isAssemblyLinePathMateInspection(inspected[0]) || !isAssemblyLinePathMateInspection(inspected[1])) throw Error('LINE scopes required')
  expect(inspected[0].up?.candidate?.path).toEqual(['left', 'c']); expect(inspected[0].up?.candidate?.visible).toBe(false)
  expect(inspected[0].up?.diagnostics).toEqual([])
  expect(inspected[1].up?.diagnostics.map(x => x.code)).toEqual(['SUPPRESSED_COMPONENT'])
  expect(inspected[1].point.diagnostics.map(x => x.code)).toEqual(['SUPPRESSED_COMPONENT'])
  expect(inspected[1].path.diagnostics.map(x => x.code)).toEqual(['SUPPRESSED_COMPONENT', 'SUPPRESSED_COMPONENT'])
})
it('keeps selected and all-use replacement roles distinct, with no UP frame retention', () => {
  const d = original(), p = d.definitions.find(x => x.id === guideSource.id)
  if (p?.kind !== 'part') throw Error('Original guide required')
  const plan = prepareAssemblyPartReplacement(d, { component: up(d).guide.component, part: { ...p.document, id: 'new-original-guide' }, revision: 'r1', ancestorRevisions: [], mode: 'selected' })
  expect(plan.endpoints.map(e => e.locator.side)).toEqual(['up']); expect(plan.endpoints[0].retainFrame).toBe(false)
  const shared = original(true), main = shared.definitions[0]; if (main.kind !== 'part') throw Error('Part required')
  const all = prepareAssemblyPartReplacement(shared, { component: up(shared).guide.component, part: { ...main.document, id: 'new-shared-original' }, revision: 'r1', ancestorRevisions: [], mode: 'all' })
  expect(all.endpoints.map(e => e.locator.side)).toEqual(['point', 'path', 'up']); expect(all.endpoints.every(e => !e.retainFrame)).toBe(true)
})
it('keeps a renamed descendant UP role pending across an imported subassembly revision', () => {
  const d = original(), p = d.definitions.find(x => x.id === guideSource.id)
  if (p?.kind !== 'part') throw Error('Original guide required')
  const nested: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'up-sub', revision: 'r0', name: 'Original guide subassembly', createdAt: stamp, updatedAt: stamp,
    occurrences: [{ ...structuredClone(d.occurrences[2]), id: 'child' }], mates: [] }
  d.definitions.push(nested); d.occurrences[2].definition = { id: nested.id, revision: nested.revision }; up(d).guide.component.occurrencePath = ['c', 'child']
  const incoming = validateAssemblyDocument({ version: 2, kind: 'assembly', id: nested.id, revision: 'r1', name: 'Original guide update', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [p], occurrences: [{ ...nested.occurrences[0], id: 'renamed' }], mates: [] })
  const plan = prepareAssemblyDocumentUpdate(d, { id: nested.id, revision: 'r0' }, incoming)
  expect(plan.endpoints).toHaveLength(1)
  expect(plan.endpoints[0]).toMatchObject({ locator: { side: 'up' }, suffix: ['child'], status: 'needs-repair', afterResolution: 'missing-path' })
  expect(plan.capturedMates).toEqual([]); expect(plan.endpoints[0].endpoint).toEqual(up(d).guide)
})
