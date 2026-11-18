import { expect, it } from 'vitest'
import original from '../cad/fixtures/assembly-material-arc-original.json'
import { validateAssemblyHingeReferenceRequest } from './assemblyHingeReferences'
import { validateAssemblyDocument, validateAssemblyMate, serializeAssemblyDocument, parseAssemblyDocument,
  type AssemblyHingeMate, type AssemblyDocument, type EmbeddedAssemblyDefinition } from './assemblyDocument'
import { assemblyMateEndpoints, withAssemblyMateEndpoint, assemblyMateEndpointComponent } from './assemblyMateEndpoints'
import { inspectAssemblyMateReferences, isAssemblyHingeMateInspection, isAssemblyBinaryMateInspection } from './assemblyReferences'
import { prepareAssemblyPartUpdate, repairAssemblyEndpoint } from './assemblySourceUpdates'
import { prepareAssemblyPartReplacement } from './assemblyReplacement'
import { prepareAssemblyDocumentUpdate } from './assemblySubassemblyUpdates'
import { createAssemblyRootRevision } from './assemblyRevisions'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { identityRigidPose } from './rigidPose'

// Original declaration-only examples reuse the public sector source recipe.
// Opaque topology keys test syntax and explicit repair, never native incidence.
const part = validateAssemblyDocument(original).definitions[0]
const source = { id: part.id, revision: part.revision }
const component = (path: string[]) => ({ occurrencePath: path, definition: { ...source } })
const body = { bodyId: 'sector', sourceFeatureId: 'solid' }
function hinge(a = ['a'], b = ['b']): AssemblyHingeMate {
  const edge = (path: string[]) => ({ kind: 'edge' as const, component: component(path), body, edge: { sourceFeatureId: 'solid', key: 'edge-v1|original-axis' }, support: 'line' as const })
  const face = (path: string[], support: 'axis' | 'plane') => ({ kind: 'face' as const, component: component(path), body, face: { sourceFeatureId: 'solid', key: 'face-v1|original-' + support }, support })
  return { id: 'hinge', name: 'Original four-role hinge', type: 'hinge', suppressed: true, axis: [edge(a), { ...face(b, 'axis'), support: 'axis' }],
    axial: [{ ...face(a, 'plane'), support: 'plane' }, { ...face(b, 'plane'), support: 'plane' }], alignment: 'opposed' }
}
function fixture(): AssemblyDocument {
  const d = validateAssemblyDocument(original)
  const use = (id: string) => ({ id, name: id, definition: { ...source }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: id === 'b' })
  d.occurrences = [use('a'), use('b')]; d.mates = [hinge()]
  const group: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-hinge-group', revision: 'g0', name: 'Original dormant group', createdAt: d.createdAt, updatedAt: d.updatedAt,
    occurrences: [use('a'), use('b')], mates: [hinge()] }
  d.definitions.push(group)
  return validateAssemblyDocument(d)
}
it('roundtrips detached four-role intent without inventing a binary endpoint or native proof', () => {
  const d = fixture(), before = structuredClone(d), checked = validateAssemblyDocument(d)
  expect(parseAssemblyDocument(serializeAssemblyDocument(checked))).toEqual(before)
  expect(assemblyMateEndpoints(hinge()).map(e => e.side)).toEqual(['axis-0', 'axis-1', 'axial-0', 'axial-1'])
  const request = validateAssemblyHingeReferenceRequest({ axis: hinge().axis, axial: hinge().axial, alignment: 'aligned' })
  expect(request.axis).not.toBe(d.mates[0]); expect(request).not.toHaveProperty('first'); expect(request).not.toHaveProperty('proof')
  const inspection = inspectAssemblyMateReferences(d)[0]
  expect(isAssemblyHingeMateInspection(inspection)).toBe(true); expect(isAssemblyBinaryMateInspection(inspection)).toBe(false)
  if (!isAssemblyHingeMateInspection(inspection)) throw Error('Expected hinge inspection')
  expect(inspection.axis[1].diagnostics.some(v => v.code === 'SUPPRESSED_COMPONENT')).toBe(true)
  expect(inspection.nativeVerificationRequired).toBe(true); expect(d).toEqual(before)
})
it('rejects unknown modes, false purposes, sparse tuples and executable data', () => {
  const m = hinge(), request = { axis: m.axis, axial: m.axial, alignment: m.alignment }
  for (const bad of [{ ...request, limit: 90 }, { ...request, alignment: undefined }, { ...request, axis: [, m.axis[1]] },
    { ...request, axis: [m.axial[0], m.axis[1]] }, { ...request, axial: [m.axis[0], m.axial[1]] },
    { ...request, axis: [{ ...m.axis[1], support: 'cylinder-surface' }, m.axis[1]] }]) expect(() => validateAssemblyHingeReferenceRequest(bad)).toThrow()
  let reads = 0
  const bad = { ...request, get axis() { reads++; return m.axis } }
  expect(() => validateAssemblyHingeReferenceRequest(bad)).toThrow(); expect(reads).toBe(0)
  const nested = hinge(); Object.defineProperty(nested.axial[0], 'component', { enumerable: true, get() { reads++; return component(['a']) } })
  expect(() => validateAssemblyMate(nested)).toThrow(); expect(reads).toBe(0)
  expect(() => validateAssemblyMate({ ...m, first: m.axis[0] })).toThrow()
})
it('rewrites only the selected atomic role and retains other topology and orientation declarations', () => {
  const m = hinge(), before = structuredClone(m), replacement = { ...m.axial[0], component: component(['renamed']) }
  const next = withAssemblyMateEndpoint(m, 'axial-1', replacement)
  expect(next.type).toBe('hinge'); if (next.type !== 'hinge') throw Error('Hinge required')
  expect(next.axial[1]).toEqual(replacement); expect(next.axis).toEqual(m.axis); expect(next.axial[0]).toEqual(m.axial[0]); expect(m).toEqual(before)
  expect(() => withAssemblyMateEndpoint(m, 'first', m.axis[0])).toThrow()
})
it('captures all four declaration roles across dormant source updates and requires explicit material repair', () => {
  const d = fixture(), p = d.definitions[0]; if (p.kind !== 'part') throw Error('Part required')
  const plan = prepareAssemblyPartUpdate(d, source, p.document, 'r2')
  expect(plan.endpoints).toHaveLength(8)
  expect(new Set(plan.endpoints.map(e => e.locator.side))).toEqual(new Set(['axis-0', 'axis-1', 'axial-0', 'axial-1']))
  const e = plan.endpoints[0], reference = { ...e.endpoint, component: { ...component(['a']), definition: plan.replacement } }
  const repaired = repairAssemblyEndpoint(plan.document, e.locator, reference)
  expect(assemblyMateEndpointComponent(assemblyMateEndpoints(repaired.mates[0])[0].reference!)?.definition).toEqual(plan.replacement)
  expect(d.mates[0]).toEqual(hinge())
})
for (const mode of ['selected', 'all'] as const) it('retains ordered roles and explicit repair obligations for ' + mode + ' replacement', () => {
  const d = fixture(), p = d.definitions[0]; if (p.kind !== 'part') throw Error('Part required')
  const replacement = structuredClone(p.document); replacement.id = 'original-replacement'
  const plan = prepareAssemblyPartReplacement(d, { component: component(['a']), mode, part: replacement, revision: 'r0', ancestorRevisions: [] })
  expect(plan.endpoints).toHaveLength(mode === 'all' ? 8 : 2)
  expect(plan.endpoints.every(e => !e.retainFrame)).toBe(true)
  expect(plan.endpoints.map(e => e.locator.side)).toContain('axis-0'); expect(plan.endpoints.map(e => e.locator.side)).toContain('axial-0')
  expect(plan.document.mates[0].type).toBe('hinge')
})
it('traces renamed nested source boundaries without automatic role correspondence, including reused scopes', () => {
  const d = fixture(), group = d.definitions[1]; if (group.kind !== 'assembly') throw Error('Group required')
  d.occurrences.push(...['left', 'right'].map(id => ({ id, name: id, definition: { id: group.id, revision: group.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: id === 'right' })))
  d.mates.push({ ...hinge(['left', 'a'], ['left', 'b']), id: 'nested' })
  const incoming = { version: 2 as const, units: 'mm' as const, ...structuredClone(group), revision: 'g1', definitions: [structuredClone(part)] }
  incoming.occurrences[0].id = 'a-new'
  const plan = prepareAssemblyDocumentUpdate(d, { id: group.id, revision: group.revision }, incoming)
  expect(plan.occurrences).toHaveLength(2); expect(plan.endpoints).toHaveLength(4)
  expect(plan.endpoints.every(e => e.status === 'needs-repair')).toBe(true)
  expect(plan.endpoints.filter(e => e.afterResolution === 'missing-path')).toHaveLength(2)
  expect(plan.capturedMates).toEqual([])
})
it('preserves four-role syntax through history and explicit root revisions without reinterpreting stale material owners', () => {
  const d = fixture(), next = createAssemblyRootRevision(d, 'new-root-revision'), h = new AssemblyDocumentHistory(d)
  expect(next.mates).toEqual(d.mates); h.commitDocument(next); expect(h.undo()).toEqual(d); expect(h.redo()).toEqual(next)
})

it('preserves stale body locators as syntax without granting current material association', () => {
  const d = fixture(), m = hinge();
  m.axis[0].body = { ...body, sourceFeatureId: 'foreign' };
  d.mates = [m];
  const parsed = validateAssemblyDocument(d), inspection = inspectAssemblyMateReferences(parsed)[0];
  expect(isAssemblyHingeMateInspection(inspection)).toBe(true);
  if (!isAssemblyHingeMateInspection(inspection)) throw Error('Hinge inspection required');
  expect(inspection.axis[0].diagnostics.length).toBeGreaterThan(0);
  expect(parsed.mates[0]).toEqual(m);
});
it('copies only the selected reused ancestor while retaining four-role repairs in its private clone', () => {
  const d = fixture(), group = d.definitions[1], p = d.definitions[0];
  if (group.kind !== 'assembly' || p.kind !== 'part') throw Error('Original declarations required');
  d.occurrences.push(...['left', 'right'].map(id => ({ id, name: id, definition: { id: group.id, revision: group.revision }, pose: identityRigidPose(), fixed: false, visible: true, suppressed: false })));
  const replacement = structuredClone(p.document); replacement.id = 'original-nested-replacement';
  const plan = prepareAssemblyPartReplacement(d, { component: component(['left', 'a']), mode: 'selected', part: replacement, revision: 'r0', ancestorRevisions: ['g-selected'] });
  expect(plan.endpoints.map(e => e.locator.side)).toEqual(['axis-0', 'axial-0']);
  expect(plan.document.occurrences.find(o => o.id === 'right')!.definition).toEqual({ id: group.id, revision: 'g0' });
  const clone = plan.document.definitions.find(v => v.id === group.id && v.revision === 'g-selected');
  expect(clone?.kind).toBe('assembly');
  if (clone?.kind !== 'assembly') throw Error('Expected copied ancestor');
  expect(clone.mates[0]).toEqual(group.mates[0]);
  expect(plan.endpoints.every(e => e.locator.scope.revision === 'g-selected' && !e.retainFrame)).toBe(true);
});
it('rekeys actual root principal-plane roles in dormant hinge declarations without promoting material axes', () => {
  const d = fixture(), holder: EmbeddedAssemblyDefinition = { kind: 'assembly', id: 'original-root-holder', revision: 'h0', name: 'Dormant root holder', createdAt: d.createdAt, updatedAt: d.updatedAt,
    occurrences: [{ id: 'root-use', name: 'Root use', definition: { id: d.id, revision: d.revision }, pose: identityRigidPose(), fixed: true, visible: true, suppressed: true }], mates: [hinge()] };
  const m = holder.mates[0]; if (m.type !== 'hinge') throw Error('Hinge required');
  m.axial = [0, 1].map(() => ({ kind: 'principal-plane', plane: 'XY', component: { occurrencePath: ['root-use'], definition: { id: d.id, revision: d.revision } } })) as AssemblyHingeMate['axial'];
  d.definitions.push(holder);
  const next = createAssemblyRootRevision(d, 'authored-root'), after = next.definitions.at(-1);
  if (after?.kind !== 'assembly' || after.mates[0].type !== 'hinge') throw Error('Hinge holder required');
  expect(after.mates[0].axis).toEqual(m.axis);
  for (const e of after.mates[0].axial) expect(e.component?.definition.revision).toBe('authored-root');
});
