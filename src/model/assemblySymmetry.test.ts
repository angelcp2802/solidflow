import { expect, it, vi } from 'vitest'
import { validateAssemblyDocument, validateAssemblyMate, serializeAssemblyDocument, parseAssemblyDocument,
  validateAssemblyVertexReference, type AssemblyDocument, type AssemblySymmetryMate } from './assemblyDocument'
import { assemblyMateEndpoints, withAssemblyMateEndpoint } from './assemblyMateEndpoints'
import { inspectAssemblyMateReferences, isAssemblySymmetryMateInspection, isAssemblyBinaryMateInspection } from './assemblyReferences'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { identityRigidPose } from './rigidPose'
const kinds = ['point', 'line', 'plane', 'sphere', 'cylinder'] as const
type Kind = typeof kinds[number]
const stamp = '2026-10-21T00:00:00.000Z'
function ref(kind: Kind, owner: string, revision = 'r1') {
  const base = { component: { occurrencePath: [owner], definition: { id: 'part', revision } }, body: null }
  if (kind === 'point') return { ...base, kind: 'vertex', vertex: { sourceFeatureId: 'solid', key: 'vertex-v1|' + 'a'.repeat(64) }, support: 'point' }
  if (kind === 'line') return { ...base, kind: 'edge', edge: { sourceFeatureId: 'solid', key: 'edge-v1|original' }, support: 'line' }
  return { ...base, kind: 'face', face: { sourceFeatureId: 'solid', key: 'face-v1|original' }, support: kind === 'plane' ? 'plane' : kind === 'sphere' ? 'sphere-surface' : 'cylinder-surface' }
}
function symmetry(kind: Kind): AssemblySymmetryMate {
  const mate = validateAssemblyMate({ id: 'symmetry-original', name: 'Original ' + kind, suppressed: false, type: 'symmetry', entityKind: kind,
    source: ref(kind, 'a'), target: ref(kind, 'b'), mirror: ref('plane', 'm'), alignment: kind === 'point' || kind === 'sphere' ? null : 'aligned' })
  if (mate.type !== 'symmetry') throw Error('Original symmetry declaration required')
  return mate
}
function original(kind: Kind): AssemblyDocument {
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original syntax-only symmetry lifecycle', units: 'mm', createdAt: stamp, updatedAt: stamp,
    definitions: [{ kind: 'part', id: 'part', revision: 'r1', document: { version: 1, id: 'part', name: 'Original declaration source', units: 'mm', createdAt: stamp, updatedAt: stamp,
      features: [{ id: 'profile', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [0, 0], width: 4, height: 6 } },
        { id: 'solid', name: 'Prism', type: 'extrude', sketchId: 'profile', depth: 4, suppressed: false, symmetric: false }] } }],
    occurrences: ['a', 'b', 'm'].map(id => ({ id, name: id, definition: { id: 'part', revision: 'r1' }, pose: identityRigidPose(), visible: true, fixed: false, suppressed: false })), mates: [symmetry(kind)] })
}
const mate = (d: AssemblyDocument): AssemblySymmetryMate => { const value = d.mates[0]; if (value.type !== 'symmetry') throw Error('Symmetry required'); return value }
for (const kind of kinds) it('persists all three original ' + kind + ' roles without binary aliases or native claims', () => {
  const doc = original(kind), result = parseAssemblyDocument(serializeAssemblyDocument(doc))
  expect(result).toEqual(doc); expect(mate(result)).not.toHaveProperty('first'); expect(mate(result)).not.toHaveProperty('second')
  expect(assemblyMateEndpoints(mate(result)).map(v => v.side)).toEqual(['source', 'target', 'mirror'])
  const inspections = inspectAssemblyMateReferences(result); expect(inspections).toHaveLength(1)
  expect(isAssemblySymmetryMateInspection(inspections[0])).toBe(true); expect(isAssemblyBinaryMateInspection(inspections[0])).toBe(false)
  if (!isAssemblySymmetryMateInspection(inspections[0])) throw Error('Symmetry inspection required')
  for (const role of ['source', 'target', 'mirror'] as const) { expect(inspections[0][role].diagnostics).toEqual([]); expect(inspections[0][role].candidate?.path).toEqual([role === 'source' ? 'a' : role === 'target' ? 'b' : 'm']) }
  expect(inspections[0].nativeVerificationRequired).toBe(true)
})
for (const kind of kinds) it('inventories and explicitly repairs three ' + kind + ' source-update roles', () => {
  const doc = original(kind), part = doc.definitions[0]; if (part.kind !== 'part') throw Error('Part required')
  const plan = prepareAssemblyPartUpdate(doc, { id: 'part', revision: 'r1' }, part.document, 'r2')
  expect(plan.endpoints.map(e => e.locator.side)).toEqual(['source', 'target', 'mirror'])
  let updated = plan.document
  for (const entry of plan.endpoints) {
    const old = mate(updated), endpoint = entry.endpoint
    if (!('kind' in endpoint) || endpoint.component === null) throw Error('Material fixture reference required')
    const changed = { ...endpoint, component: { ...endpoint.component, definition: { id: 'part', revision: 'r2' } } }
    updated = repairAssemblyEndpoint(updated, entry.locator, changed)
    const now = mate(updated); expect(now.id).toBe(old.id); expect(now.entityKind).toBe(kind)
    for (const role of ['source', 'target', 'mirror'] as const) if (role !== entry.locator.side) expect(now[role]).toEqual(old[role])
  }
  expect(inspectAssemblyMateReferences(updated).every(i => isAssemblySymmetryMateInspection(i) && [i.source, i.target, i.mirror].every(e => !e.diagnostics.length))).toBe(true)
})
for (const kind of kinds) it('retains all-instance ' + kind + ' replacement incidence and forbids implicit topology association', () => {
  const doc = original(kind), part = doc.definitions[0]; if (part.kind !== 'part') throw Error('Part required')
  const replacement = structuredClone(part.document); replacement.id = 'replacement'
  const plan = prepareAssemblyPartReplacement(doc, { component: { occurrencePath: ['a'], definition: { id: 'part', revision: 'r1' } }, mode: 'all', part: replacement, revision: 'new', ancestorRevisions: [] })
  expect(plan.endpoints.map(e => e.locator.side)).toEqual(['source', 'target', 'mirror']); expect(plan.endpoints.every(e => !e.retainFrame)).toBe(true)
  expect(mate(plan.document)).toEqual(mate(doc)); expect(plan.expandedPaths).toHaveLength(3)
})
it('visits reused suppressed namespaces and dormant declarations without double-counting repair addresses', () => {
  const doc = original('point'), shared = { kind: 'assembly' as const, id: 'shared', revision: 'r1', name: 'Shared', createdAt: stamp, updatedAt: stamp, occurrences: doc.occurrences, mates: [symmetry('point')] }
  shared.mates[0].suppressed = true
  doc.definitions.push(shared, { ...structuredClone(shared), id: 'dormant' })
  doc.mates = []; doc.occurrences = ['s1', 's2'].map(id => ({ id, name: id, definition: { id: 'shared', revision: 'r1' }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: id === 's2' }))
  const inspections = inspectAssemblyMateReferences(doc); expect(inspections).toHaveLength(2); expect(inspections.every(i => i.suppressed)).toBe(true)
  expect(inspections.map(i => i.scopePath)).toEqual([['s1'], ['s2']])
  const part = doc.definitions[0]; if (part.kind !== 'part') throw Error('Part required')
  const plan = prepareAssemblyPartUpdate(doc, { id: 'part', revision: 'r1' }, part.document, 'r2')
  expect(plan.endpoints).toHaveLength(6); expect(new Set(plan.endpoints.map(e => e.locator.scope.id))).toEqual(new Set(['shared', 'dormant']))
})
it('rejects malformed and executable grouped declarations and wrong-purpose repairs', () => {
  const doc = original('point'), value = mate(doc)
  for (const bad of [{ ...value, first: value.source }, { ...value, mirror: value.source }, { ...value, alignment: 'aligned' }, { ...value, source: ref('sphere', 'a') }]) expect(() => validateAssemblyDocument({ ...doc, mates: [bad] })).toThrow()
  let reads = 0
  for (const field of ['type', 'entityKind', 'source', 'target', 'mirror', 'alignment']) {
    const bad = { ...value }; Object.defineProperty(bad, field, { enumerable: true, get() { reads++; return value[field as keyof typeof value] } })
    expect(() => validateAssemblyDocument({ ...doc, mates: [bad] })).toThrow()
  }
  expect(reads).toBe(0)
  expect(() => withAssemblyMateEndpoint(value, 'first', value.source)).toThrow()
  expect(() => withAssemblyMateEndpoint(value, 'mirror', value.source)).toThrow()
  const replaced = withAssemblyMateEndpoint(value, 'source', validateAssemblyVertexReference(ref('point', 'b')))
  expect(replaced.id).toBe(value.id)
})
it('preserves all three roles on one owner and inventories every selected replacement role', () => {
  const doc = original('point'), originalMate = mate(doc)
  for (const role of ['target', 'mirror'] as const) originalMate[role].component!.occurrencePath = ['a']
  const parsed = validateAssemblyDocument(doc), inspected = inspectAssemblyMateReferences(parsed)[0]
  if (!isAssemblySymmetryMateInspection(inspected)) throw Error('Symmetry required')
  expect([inspected.source, inspected.target, inspected.mirror].map(e => e.candidate?.path)).toEqual([['a'], ['a'], ['a']])
  const part = parsed.definitions[0]; if (part.kind !== 'part') throw Error('Part required')
  const replacement = structuredClone(part.document); replacement.id = 'replacement'
  const plan = prepareAssemblyPartReplacement(parsed, { component: { occurrencePath: ['a'], definition: { id: 'part', revision: 'r1' } }, mode: 'selected', part: replacement, revision: 'new', ancestorRevisions: [] })
  expect(plan.endpoints.map(e => e.locator.side)).toEqual(['source', 'target', 'mirror'])
  expect(plan.document.occurrences.find(o => o.id === 'b')!.definition).toEqual({ id: 'part', revision: 'r1' })
})
it('reports missing and suppressed material vertex producers without inferring geometry', () => {
  for (const missing of [false, true]) {
    const doc = original('point'), part = doc.definitions[0]; if (part.kind !== 'part') throw Error('Part required')
    if (missing) part.document.features = part.document.features.filter(f => f.id !== 'solid')
    else part.document.features.find(f => f.id === 'solid')!.suppressed = true
    const inspection = inspectAssemblyMateReferences(doc)[0]; if (!isAssemblySymmetryMateInspection(inspection)) throw Error('Symmetry required')
    expect(inspection.source.diagnostics.map(d => d.code)).toContain(missing ? 'MISSING_VERTEX_PRODUCER' : 'SUPPRESSED_VERTEX_PRODUCER')
    expect(inspection.target.diagnostics.map(d => d.code)).toContain(missing ? 'MISSING_VERTEX_PRODUCER' : 'SUPPRESSED_VERTEX_PRODUCER')
  }
})
it('initializes both lazy parser import orders without cross-module initialization', async () => {
  vi.resetModules()
  const refs = await import('./assemblySymmetryReferences'), docs = await import('./assemblyDocument')
  const value = symmetry('point'); expect(refs.validateAssemblySymmetryReferenceSet({ entityKind: value.entityKind, source: value.source, target: value.target, mirror: value.mirror, alignment: value.alignment }).entityKind).toBe('point')
  expect(docs.validateAssemblyMate(value).type).toBe('symmetry')
  vi.resetModules(); const docsFirst = await import('./assemblyDocument'), refsSecond = await import('./assemblySymmetryReferences')
  expect(docsFirst.validateAssemblyMate(value).type).toBe('symmetry'); expect(typeof refsSecond.validateAssemblySymmetryReferenceSet).toBe('function')
})
