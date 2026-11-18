import { expect, it } from 'vitest'
import original from '../cad/fixtures/assembly-hinge-original.json'
import { validateAssemblyDocument, validateAssemblyMate, serializeAssemblyDocument, parseAssemblyDocument,
  type AssemblyDocument, type AssemblyHingeMate, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { validateAssemblyHingeReferenceRequest } from './assemblyHingeReferences'
import { assemblyMateEndpoints, withAssemblyMateEndpoint, withAssemblyMateEndpointComponent } from './assemblyMateEndpoints'
import { inspectAssemblyMateReferences, isAssemblyHingeMateInspection, isAssemblyBinaryMateInspection } from './assemblyReferences'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { prepareAssemblyDocumentUpdate } from './assemblySubassemblyUpdates'
import { createAssemblyRootRevision } from './assemblyRevisions'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { identityRigidPose } from './rigidPose'

// Original declaration-only six-role examples reuse the project's public H4
// feature recipe. Opaque face keys nominate syntax, never native currentness.
const part = validateAssemblyDocument(original).definitions[0]
const source = { id: part.id, revision: part.revision }
function hinge(a = ['a'], b = ['b']): AssemblyHingeMate {
  const face = (path: string[], support: 'axis' | 'plane') => ({ kind: 'face' as const, component: { occurrencePath: path, definition: { ...source } },
    body: { bodyId: 'original-hinge-body', sourceFeatureId: 'hole' }, face: { sourceFeatureId: 'hole', key: 'original-' + support + '-face' }, support })
  return { id: 'hinge', name: 'Original explicitly bounded hinge', type: 'hinge', suppressed: true, alignment: 'aligned',
    axis: [{ ...face(a, 'axis'), support: 'axis' }, { ...face(b, 'axis'), support: 'axis' }],
    axial: [{ ...face(a, 'plane'), support: 'plane' }, { ...face(b, 'plane'), support: 'plane' }],
    stops: { coordinate: 'directed-about-axis', angular: [{ ...face(a, 'plane'), support: 'plane' }, { ...face(b, 'plane'), support: 'plane' }], arc: { start: 330, sweep: 60 } } }
}
function fixture(): AssemblyDocument {
  const d = validateAssemblyDocument(original)
  const use = (id: string) => ({ id, name: id, definition: { ...source }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: id === 'b' })
  d.occurrences = [use('a'), use('b')]; d.mates = [hinge()]
  const group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-stopped-hinge-group', revision: 'g0', name: 'Dormant original stopped hinge',
    createdAt: d.createdAt, updatedAt: d.updatedAt, occurrences: [use('a'), use('b')], mates: [hinge()] }
  d.definitions.push(group)
  return validateAssemblyDocument(d)
}
it('roundtrips explicit six-role intent while preserving absent unlimited stops byte-for-byte', () => {
  const d = fixture(), text = serializeAssemblyDocument(d)
  expect(serializeAssemblyDocument(parseAssemblyDocument(text))).toBe(text)
  const unlimited = structuredClone(d); for (const node of [unlimited, ...unlimited.definitions]) if (node.kind === 'assembly') for (const m of node.mates) if (m.type === 'hinge') delete m.stops
  const old = serializeAssemblyDocument(unlimited), parsed = parseAssemblyDocument(old)
  expect(serializeAssemblyDocument(parsed)).toBe(old); expect(Object.hasOwn(parsed.mates[0], 'stops')).toBe(false)
  const h = new AssemblyDocumentHistory(d); h.commitDocument(unlimited); expect(h.undo()).toEqual(d); expect(h.redo()).toEqual(unlimited)
})
it('exposes ordered conditional angular roles and a nonbinary inspection without claiming native ownership', () => {
  const d = fixture(), refs = assemblyMateEndpoints(d.mates[0])
  expect(refs.map(e => e.side)).toEqual(['axis-0', 'axis-1', 'axial-0', 'axial-1', 'angle-0', 'angle-1'])
  const inspection = inspectAssemblyMateReferences(d)[0]
  expect(isAssemblyHingeMateInspection(inspection)).toBe(true); expect(isAssemblyBinaryMateInspection(inspection)).toBe(false)
  if (!isAssemblyHingeMateInspection(inspection)) throw Error('Hinge inspection required')
  expect(inspection.angular).toHaveLength(2); expect(inspection.angular![1].diagnostics.some(e => e.code === 'SUPPRESSED_COMPONENT')).toBe(true)
  expect(inspection.nativeVerificationRequired).toBe(true)
})
it('rejects unknown/inactive-like fields, explicit undefined and angular principal or wrong-purpose references', () => {
  const m = hinge(), s = m.stops!
  for (const bad of [{ ...m, stops: undefined }, { ...m, nominalAngle: 0 }, { ...m, stops: { ...s, nominalAngle: 0 } },
    { ...m, stops: { ...s, coordinate: 'principal-angle' } }, { ...m, stops: { ...s, angular: [{ kind: 'principal-plane', component: null, plane: 'XY' }, s.angular[1]] } },
    { ...m, stops: { ...s, angular: [m.axis[0], s.angular[1]] } }, { ...m, stops: { ...s, angular: [, s.angular[1]] } },
    { ...m, stops: { ...s, arc: { start: 360, sweep: 60 } } }]) expect(() => validateAssemblyMate(bad)).toThrow()
  expect(() => validateAssemblyHingeReferenceRequest({ axis: m.axis, axial: m.axial, alignment: m.alignment, stops: s })).toThrow()
  let reads = 0
  expect(() => validateAssemblyMate({ ...m, get stops() { reads++; return s } })).toThrow()
  expect(() => validateAssemblyMate({ ...m, stops: { ...s, arc: { get start() { reads++; return 0 }, sweep: 60 } } })).toThrow()
  expect(reads).toBe(0)
})
it('writes one angular material selection atomically without changing interval, other roles or input', () => {
  const m = hinge(), before = structuredClone(m), replacement = { ...m.stops!.angular[1], component: { occurrencePath: ['renamed'], definition: { ...source } } }
  const next = withAssemblyMateEndpoint(m, 'angle-0', replacement)
  if (next.type !== 'hinge') throw Error('Hinge required')
  expect(next.stops!.angular).toEqual([replacement, m.stops!.angular[1]]); expect(next.stops!.arc).toEqual(m.stops!.arc)
  expect(next.axis).toEqual(m.axis); expect(next.axial).toEqual(m.axial); expect(m).toEqual(before)
  const unlimited = structuredClone(m); delete unlimited.stops
  expect(() => withAssemblyMateEndpoint(unlimited, 'angle-0', replacement)).toThrow()
  expect(() => withAssemblyMateEndpoint(m, 'angle-1', { kind: 'principal-plane', component: null, plane: 'XY' })).toThrow()
})
it('captures all six roles in active and dormant declarations and explicitly repairs both angular roles', () => {
  const d = fixture(), p = d.definitions[0]; if (p.kind !== 'part') throw Error('Part required')
  const plan = prepareAssemblyPartUpdate(d, source, p.document, 'r1')
  expect(plan.endpoints).toHaveLength(12)
  expect(plan.endpoints.filter(e => e.locator.side.startsWith('angle-'))).toHaveLength(4)
  let repaired = plan.document
  for (const e of plan.endpoints) {
    const owner = 'component' in e.endpoint ? e.endpoint.component : null
    if (!owner) throw Error('Material owner required')
    repaired = repairAssemblyEndpoint(repaired, e.locator, withAssemblyMateEndpointComponent(e.endpoint, { ...owner, definition: plan.replacement }))
  }
  for (const node of [repaired, ...repaired.definitions]) if (node.kind === 'assembly') for (const m of node.mates) if (m.type === 'hinge') {
    expect(m.stops!.arc).toEqual({ start: 330, sweep: 60 }); expect(m.stops!.angular.every(e => e.component.definition.revision === 'r1')).toBe(true)
  }
  expect(d.mates[0]).toEqual(hinge())
})
for (const mode of ['selected', 'all'] as const) it('retains explicit three/six affected roles under ' + mode + ' part replacement', () => {
  const d = fixture(), p = d.definitions[0]; if (p.kind !== 'part') throw Error('Part required')
  const replacement = structuredClone(p.document); replacement.id = 'original-replacement-leaf'
  const plan = prepareAssemblyPartReplacement(d, { component: { occurrencePath: ['a'], definition: { ...source } }, mode, part: replacement, revision: 'new', ancestorRevisions: [] })
  expect(plan.endpoints).toHaveLength(mode === 'all' ? 12 : 3)
  expect(plan.endpoints.every(e => !e.retainFrame)).toBe(true)
  if (mode === 'selected') expect(plan.endpoints.map(e => e.locator.side)).toEqual(['axis-0', 'axial-0', 'angle-0'])
})
it('traces all six roles across a renamed shared subassembly boundary without inventing angle correspondence', () => {
  const d = fixture(), group = d.definitions[1]; if (group.kind !== 'assembly') throw Error('Group required')
  d.occurrences.push(...['left', 'right'].map(id => ({ id, name: id, definition: { id: group.id, revision: group.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: id === 'right' })))
  d.mates = [hinge(['left', 'a'], ['left', 'b'])]
  const incoming = { version: 2 as const, units: 'mm' as const, ...structuredClone(group), revision: 'g1', definitions: [structuredClone(part)] }
  incoming.occurrences[0].id = 'a-new'
  const plan = prepareAssemblyDocumentUpdate(d, { id: group.id, revision: group.revision }, incoming)
  expect(plan.occurrences).toHaveLength(2); expect(plan.endpoints).toHaveLength(6)
  expect(plan.endpoints.filter(e => e.afterResolution === 'missing-path').map(e => e.locator.side)).toEqual(['axis-0', 'axial-0', 'angle-0'])
  expect(plan.endpoints.every(e => e.status === 'needs-repair')).toBe(true); expect(plan.capturedMates).toEqual([])
})
it('preserves material angular references during root authoring and selected reused-ancestor cloning', () => {
  const d = fixture(), p = d.definitions[0], group = d.definitions[1]
  if (p.kind !== 'part' || group.kind !== 'assembly') throw Error('Original sources required')
  expect(createAssemblyRootRevision(d, 'authored').mates).toEqual(d.mates)
  d.occurrences.push(...['left', 'right'].map(id => ({ id, name: id, definition: { id: group.id, revision: group.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })))
  const replacement = structuredClone(p.document); replacement.id = 'original-nested-replacement'
  const plan = prepareAssemblyPartReplacement(d, { component: { occurrencePath: ['left', 'a'], definition: { ...source } }, mode: 'selected', part: replacement, revision: 'new', ancestorRevisions: ['g-new'] })
  expect(plan.endpoints.map(e => e.locator.side)).toEqual(['axis-0', 'axial-0', 'angle-0'])
  expect(plan.endpoints.every(e => e.locator.scope.revision === 'g-new')).toBe(true)
  expect(plan.document.occurrences.find(o => o.id === 'right')!.definition.revision).toBe('g0')
})
