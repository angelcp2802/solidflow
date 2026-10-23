import { requireBinaryAssemblyMate as binaryMate } from './assemblyBinaryFixtures.test-utils'
import { expect, it } from 'vitest'
import { validateDocument } from './document'
import { identityRigidPose } from './rigidPose'
import { parseAssemblyDocument, serializeAssemblyDocument, validateAssemblyDocument, type AssemblyComponentReference, type AssemblyDocument,
  type AssemblyFaceReference, type AssemblyOccurrence, type AssemblyBinaryMate as AssemblyMate, type EmbeddedPartDefinition } from './assemblyDocument'
import { inspectBinaryAssemblyMateReferences as inspectAssemblyMateReferences } from './assemblyBinaryFixtures.test-utils'
import type { AssemblyCylinderTangentMateType } from './assemblyCylinderTangentMates'
import type { AssemblySphereTangentMateType } from './assemblySphereTangentMates'

const date = '2026-10-15T00:00:00.000Z'
function part(): EmbeddedPartDefinition {
  return { kind: 'part', id: 'part', revision: 'r1', document: validateDocument({ version: 1, id: 'part', name: 'Original box', units: 'mm',
    createdAt: date, updatedAt: date, features: [
      { id: 'sketch', name: 'Rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [0, 0], width: 2, height: 3 } },
      { id: 'solid', name: 'Extrusion', type: 'extrude', sketchId: 'sketch', depth: 4, symmetric: false,
        suppressed: false, bodyOperation: { mode: 'new', bodyId: 'body' } },
    ] }) }
}
function occurrence(id = 'pin', definition = { id: 'part', revision: 'r1' }): AssemblyOccurrence {
  return { id, name: id, definition, pose: identityRigidPose(), fixed: false, suppressed: false, visible: true }
}
function component(path = ['pin'], revision = 'r1'): AssemblyComponentReference {
  return { occurrencePath: path, definition: { id: 'part', revision } }
}
function face(): AssemblyFaceReference {
  return { kind: 'face', component: component(), body: { bodyId: 'body', sourceFeatureId: 'solid' },
    face: { sourceFeatureId: 'solid', key: 'face-v1|unattested-test-key' }, support: 'plane' }
}
function mate(): AssemblyMate {
  return { id: 'mate', name: 'Declared planes', suppressed: false, type: 'coincident', alignment: 'aligned',
    first: { ...face(), support: 'plane' }, second: { kind: 'principal-plane', component: null, plane: 'XY' } }
}
function document(): AssemblyDocument {
  return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'root', revision: 'r1', name: 'Original reference graph', units: 'mm',
    createdAt: date, updatedAt: date, definitions: [part()], occurrences: [occurrence()], mates: [mate()] })
}
function firstFace(value: AssemblyDocument): AssemblyFaceReference {
  const first = binaryMate(value.mates[0]).first
  if (!('kind' in first) || first.kind !== 'face' || first.support !== 'plane' && first.support !== 'axis') throw new Error('Expected original face declaration')
  return first
}
function codes(value: AssemblyDocument) { return inspectAssemblyMateReferences(value)[0].first.diagnostics.map(item => item.code) }

it('keeps structurally matching but unattested faces explicitly pending native verification', () => {
  const input = document(), before = JSON.stringify(input), [inspection] = inspectAssemblyMateReferences(input)
  expect(inspection.first.diagnostics).toEqual([]); expect(inspection.nativeVerificationRequired).toBe(true)
  expect(inspection.first.candidate?.path).toEqual(['pin']); expect(inspection.first.candidate?.definition.kind).toBe('part')
  expect(inspection.second).toEqual({ candidate: null, diagnostics: [] }); expect(inspection.scopePath).toEqual([])
  expect(JSON.stringify(input)).toBe(before)
  inspection.first.candidate!.chain[0].name = 'Changed returned clone'
  expect(input.occurrences[0].name).toBe('pin')
})

it('preserves stale definitions for repair without interpreting their old face and body identifiers', () => {
  const input = document(), saved = firstFace(input)
  saved.component.definition.revision = 'retired'; saved.face.sourceFeatureId = 'missing'; saved.body!.sourceFeatureId = 'missing'
  expect(validateAssemblyDocument(input).mates).toEqual(input.mates)
  expect(codes(input)).toEqual(['STALE_DEFINITION'])
  expect(inspectAssemblyMateReferences(input)[0].first.candidate?.definition.revision).toBe('r1')
})

it('does not recover a deleted occurrence by another occurrence with the same name and definition', () => {
  const input = document(); input.occurrences[0].id = 'new-pin'
  const [inspection] = inspectAssemblyMateReferences(input)
  expect(inspection.first.candidate).toBeNull()
  expect(inspection.first.diagnostics).toEqual([{ code: 'MISSING_OCCURRENCE', path: ['pin'] }])
})

it('distinguishes a nonexistent child from a path that wrongly traverses a part', () => {
  const input = document(); firstFace(input).component.occurrencePath.push('invented-child')
  expect(inspectAssemblyMateReferences(input)[0].first).toEqual({ candidate: null,
    diagnostics: [{ code: 'PATH_THROUGH_PART', path: ['pin'] }] })
})

it('uses identities through renames and sibling reordering', () => {
  const input = document(); input.occurrences.push(occurrence('other'))
  input.occurrences.reverse(); input.occurrences[1].name = 'Renamed pin'
  const candidate = inspectAssemblyMateReferences(input)[0].first.candidate!
  expect(candidate.path).toEqual(['pin']); expect(candidate.chain[0].name).toBe('Renamed pin'); expect(codes(input)).toEqual([])
})

it('reports a suppressed component while hidden components retain their valid declaration paths', () => {
  const input = document(); input.occurrences[0].visible = false
  expect(codes(input)).toEqual([]); expect(inspectAssemblyMateReferences(input)[0].first.candidate?.visible).toBe(false)
  input.occurrences[0].suppressed = true
  expect(codes(input)).toEqual(['SUPPRESSED_COMPONENT'])
  expect(inspectAssemblyMateReferences(input)[0].first.candidate?.suppressed).toBe(true)
})

for (const producer of ['missing', 'sketch']) it('rejects a face producer that is ' + producer + ' structurally', () => {
  const input = document(), reference = firstFace(input)
  reference.body = null; reference.face.sourceFeatureId = producer
  expect(codes(input)).toEqual(['MISSING_FACE_PRODUCER'])
})

it('reports suppressed solid producers without treating syntax presence as native availability', () => {
  const input = document(), definition = input.definitions[0]
  if (definition.kind !== 'part') throw new Error('Expected original part')
  definition.document.features[1].suppressed = true
  expect(codes(input)).toEqual(['SUPPRESSED_FACE_PRODUCER', 'SUPPRESSED_BODY_PRODUCER'])
})

it('rejects a body identity absent from the declared output rather than matching a face name', () => {
  const input = document(); firstFace(input).body!.bodyId = 'another-body'
  expect(codes(input)).toEqual(['MISSING_BODY_STATE'])
})

it('reports mismatched exact body and face states', () => {
  const input = document(); firstFace(input).body!.sourceFeatureId = 'sketch'
  expect(codes(input)).toEqual(['MISSING_BODY_STATE', 'FACE_BODY_STATE_MISMATCH'])
})

it('retains a legacy aggregate endpoint without inventing a persistent body identity', () => {
  const input = document(); firstFace(input).body = null
  const [inspection] = inspectAssemblyMateReferences(input)
  expect(inspection.first.diagnostics).toEqual([]); expect(firstFace(input).body).toBeNull()
  expect(inspection.nativeVerificationRequired).toBe(true)
})

function surfaceDocument(): AssemblyDocument {
  const input = document()
  input.mates = [{ id: 'tangent', name: 'Original analytic surface declaration', type: 'tangent', suppressed: false,
    first: { ...face(), support: 'cylinder-surface' }, second: { kind: 'principal-plane', component: null, plane: 'XY' }, side: 'negative' }]
  return input
}
it('inspects an explicit cylinder surface as exact face syntax, never axis or native contact authority', () => {
  const input = surfaceDocument(), before = serializeAssemblyDocument(input), [inspection] = inspectAssemblyMateReferences(input)
  expect(inspection.first.diagnostics).toEqual([]); expect(inspection.first.candidate?.path).toEqual(['pin'])
  expect(inspection.nativeVerificationRequired).toBe(true); expect(inspection.mate).toMatchObject({ type: 'tangent', side: 'negative', first: { support: 'cylinder-surface' } })
  inspection.first.candidate!.chain[0].name = 'Detached mutation'; expect(serializeAssemblyDocument(input)).toBe(before)
})
it.each(['missing', 'revision', 'producer', 'body', 'suppressed'] as const)('keeps surface %s diagnostics repairable without changing its purpose', fault => {
  const input = surfaceDocument(), relation = binaryMate(input.mates[0])
  if (relation.type !== 'tangent' || relation.first.kind !== 'face') throw new Error('Original surface required')
  if (fault === 'missing') relation.first.component.occurrencePath = ['deleted']
  else if (fault === 'revision') { relation.first.component.definition.revision = 'old'; relation.first.face.sourceFeatureId = 'absent' }
  else if (fault === 'producer') relation.first.face.sourceFeatureId = 'absent'
  else if (fault === 'body') relation.first.body = { bodyId: 'absent', sourceFeatureId: 'absent' }
  else input.occurrences[0].suppressed = true
  const before = serializeAssemblyDocument(input), result = inspectAssemblyMateReferences(input)[0]
  expect(result.first.diagnostics.map(value => value.code)).toContain(fault === 'missing' ? 'MISSING_OCCURRENCE' : fault === 'revision' ? 'STALE_DEFINITION'
    : fault === 'producer' ? 'MISSING_FACE_PRODUCER' : fault === 'body' ? 'MISSING_BODY_STATE' : 'SUPPRESSED_COMPONENT')
  if (fault === 'revision') expect(result.first.diagnostics.map(value => value.code)).toEqual(['STALE_DEFINITION'])
  expect(serializeAssemblyDocument(input)).toBe(before); expect(result.nativeVerificationRequired).toBe(true)
})
it('retains surface identity in each actual reused hidden/suppressed scope namespace', () => {
  const input = surfaceDocument(), local = structuredClone(input.mates)
  input.definitions.push({ kind: 'assembly', id: 'group', revision: 'g1', name: 'Original group', createdAt: date, updatedAt: date,
    occurrences: [occurrence()], mates: local })
  const a = occurrence('A', { id: 'group', revision: 'g1' }), b = occurrence('B', { id: 'group', revision: 'g1' })
  a.visible = false; b.suppressed = true; input.occurrences = [a, b]; input.mates = []
  const result = inspectAssemblyMateReferences(input)
  expect(result.map(value => value.scopePath)).toEqual([['A'], ['B']]); expect(result.map(value => value.first.candidate?.path)).toEqual([['A', 'pin'], ['B', 'pin']])
  expect(result[0].first.candidate?.visible).toBe(false); expect(result[0].first.diagnostics).toEqual([])
  expect(result[1].first.diagnostics).toEqual([{ code: 'SUPPRESSED_COMPONENT', path: ['B', 'pin'] }])
  expect(result.every(value => value.mate.type === 'tangent' && value.nativeVerificationRequired)).toBe(true)
})

it('preserves opaque face keys through the existing part-reference length boundary without attesting them', () => {
  const input = document(), key = 'face-v1|' + 'x'.repeat(4088)
  firstFace(input).face.key = key
  const reopened = parseAssemblyDocument(serializeAssemblyDocument(input))
  expect(firstFace(reopened).face.key).toBe(key); expect(key).toHaveLength(4096)
  expect(inspectAssemblyMateReferences(reopened)[0].nativeVerificationRequired).toBe(true)
  firstFace(input).face.key += 'x'
  expect(() => validateAssemblyDocument(input)).toThrow('texto no válido')
})

function nested(): AssemblyDocument {
  const input = document(), child = { kind: 'assembly' as const, id: 'sub', revision: 'r1', name: 'Original subassembly',
    createdAt: date, updatedAt: date, occurrences: [occurrence()], mates: [mate()] }
  child.occurrences[0].pose.translation = [1, 2, 3]; child.occurrences[0].fixed = true
  input.definitions.push(child); input.mates = []
  input.occurrences = [occurrence('left', { id: 'sub', revision: 'r1' }), occurrence('right', { id: 'sub', revision: 'r1' })]
  input.occurrences[0].pose = { translation: [10, 20, 30], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }
  input.occurrences[1].pose.translation = [100, 0, 0]
  return validateAssemblyDocument(input)
}

it('scopes reused nested mate IDs and local endpoints to their actual occurrence paths', () => {
  const input = nested(), values = inspectAssemblyMateReferences(input)
  expect(values.map(value => value.mate.id)).toEqual(['mate', 'mate'])
  expect(values.map(value => value.scopePath)).toEqual([['left'], ['right']])
  expect(values.map(value => value.first.candidate?.path)).toEqual([['left', 'pin'], ['right', 'pin']])
  expect(values.map(value => value.first.diagnostics)).toEqual([[], []])
  // Parent Z90 maps local translation (1,2,3) to (-2,1,3).
  values[0].first.candidate!.worldPose.translation.forEach((value, index) => expect(Math.abs(value - [8, 21, 33][index])).toBeLessThan(1e-12))
  expect(values[1].first.candidate?.worldPose.translation).toEqual([101, 2, 3])
  expect(values[0].first.candidate?.chain.map(value => value.fixed)).toEqual([false, true])
  expect(values[0].second).toEqual({ candidate: null, diagnostics: [] })
  expect(values[0].scopePose.translation).toEqual([10, 20, 30])
})

it('propagates suppressed assembly state to its mates and component endpoints separately', () => {
  const input = nested(); input.occurrences[0].suppressed = true; input.occurrences[0].visible = false
  const values = inspectAssemblyMateReferences(input)
  expect(values.map(value => value.suppressed)).toEqual([true, false])
  expect(values[0].first.diagnostics).toEqual([{ code: 'SUPPRESSED_COMPONENT', path: ['left', 'pin'] }])
  expect(values[0].first.candidate?.visible).toBe(false); expect(values[1].first.diagnostics).toEqual([])
})

it('keeps a suppressed individual mate declared without suppressing the referenced component', () => {
  const input = document(); input.mates[0].suppressed = true
  const [inspection] = inspectAssemblyMateReferences(input)
  expect(inspection.suppressed).toBe(true); expect(inspection.first.candidate?.suppressed).toBe(false)
  expect(inspection.first.diagnostics).toEqual([])
})

it('allows assembly principal planes but diagnoses face endpoints that target an assembly definition', () => {
  const input = nested(); input.mates = [mate()]
  firstFace(input).component = { occurrencePath: ['left'], definition: { id: 'sub', revision: 'r1' } }
  expect(codes(input)).toEqual(['FACE_REQUIRES_PART'])
  const own = binaryMate(input.mates[0])
  if (own.type !== 'coincident') throw new Error('Expected coincident declaration')
  own.first = { kind: 'principal-plane', component: firstFace(input).component, plane: 'YZ' }
  expect(codes(input)).toEqual([]); expect(inspectAssemblyMateReferences(input)[0].first.candidate?.definition.kind).toBe('assembly')
})

it('inspects component locks without inventing a face endpoint', () => {
  const input = document(); input.occurrences.push(occurrence('other'))
  input.mates = [{ id: 'lock', name: 'Relative pose declaration', type: 'lock', suppressed: false,
    first: component(), second: component(['other']), relativePose: identityRigidPose() }]
  const [inspection] = inspectAssemblyMateReferences(input)
  expect(inspection.first.candidate?.path).toEqual(['pin']); expect(inspection.second.candidate?.path).toEqual(['other'])
  expect(inspection.first.diagnostics).toEqual([]); expect(inspection.second.diagnostics).toEqual([])
  expect(inspection.nativeVerificationRequired).toBe(true)
})

it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('keeps both %s purposes pending exact native witnesses in reused scopes', type => {
  const input = nested(), sub = input.definitions.find(value => value.kind === 'assembly')
  if (sub?.kind !== 'assembly') throw new Error('Original shared assembly required')
  sub.occurrences.push(occurrence('roller'))
  sub.mates = [{ id: 'CC', name: 'Original two surface references', type, suppressed: false,
    first: { ...face(), support: 'cylinder-surface' }, second: { ...face(), component: component(['roller']), support: 'cylinder-surface' }, branch: { kind: 'external' } }]
  input.occurrences[0].visible = false
  const before = serializeAssemblyDocument(input), result = inspectAssemblyMateReferences(input)
  expect(result.map(value => value.scopePath)).toEqual([['left'], ['right']]); expect(result.map(value => value.first.candidate?.path)).toEqual([['left', 'pin'], ['right', 'pin']])
  expect(result.map(value => value.second.candidate?.path)).toEqual([['left', 'roller'], ['right', 'roller']])
  expect(result.every(value => value.nativeVerificationRequired && value.first.diagnostics.length === 0 && value.second.diagnostics.length === 0)).toBe(true)
  expect(result[0].first.candidate?.visible).toBe(false); expect(serializeAssemblyDocument(input)).toBe(before)
})
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] as const)('preserves stale/suppressed %s surface references without promoting them to axes', type => {
  const input = document(); input.occurrences.push(occurrence('roller')); input.occurrences[1].suppressed = true
  input.mates = [{ id: 'CC', name: 'Original repairable cylinder supports', type, suppressed: true,
    first: { ...face(), support: 'cylinder-surface' }, second: { ...face(), component: component(['roller'], 'retired'), support: 'cylinder-surface' }, branch: { kind: 'internal', larger: 'second' } }]
  const [result] = inspectAssemblyMateReferences(input)
  expect(result.suppressed).toBe(true); expect(result.nativeVerificationRequired).toBe(true)
  expect(result.first.diagnostics).toEqual([]); expect(result.second.diagnostics.map(value => value.code)).toContain('STALE_DEFINITION')
  expect(result.second.diagnostics.map(value => value.code)).toContain('SUPPRESSED_COMPONENT')
  expect(result.mate).toMatchObject({ type, first: { support: 'cylinder-surface' }, second: { support: 'cylinder-surface' }, branch: { kind: 'internal', larger: 'second' } })
})
it.each(['skew-cylinder-tangent', 'parallel-cylinder-tangent'] satisfies AssemblyCylinderTangentMateType[])('still diagnoses retired body/face producers for both %s surface endpoints', type => {
  const input = document(); input.occurrences.push(occurrence('roller'))
  const first = { ...face(), support: 'cylinder-surface' as const }, second = { ...face(), component: component(['roller']), support: 'cylinder-surface' as const }
  first.face.sourceFeatureId = 'missing'; second.body!.sourceFeatureId = 'missing-body'
  input.mates = [{ id: 'CC', name: 'Original invalid native locators', type, suppressed: false, first, second, branch: { kind: 'external' } }]
  const [result] = inspectAssemblyMateReferences(input)
  expect(result.first.diagnostics.map(value => value.code)).toContain('MISSING_FACE_PRODUCER'); expect(result.second.diagnostics.map(value => value.code)).toContain('MISSING_BODY_STATE')
  expect(result.nativeVerificationRequired).toBe(true)
})

const sphereReferenceTypes: AssemblySphereTangentMateType[] = ['plane-sphere-tangent', 'sphere-sphere-tangent', 'cylinder-sphere-tangent']
function sphereReferenceMate(type: AssemblySphereTangentMateType): AssemblyMate {
  const sphere = { ...face(), component: component(['roller']), support: 'sphere-surface' as const }
  if (type === 'plane-sphere-tangent') return { id: 'S', name: 'Original sphere purpose', type, suppressed: false, first: { ...face(), support: 'plane' }, second: sphere, side: 'negative' }
  if (type === 'sphere-sphere-tangent') return { id: 'S', name: 'Original sphere pair', type, suppressed: false, first: { ...face(), support: 'sphere-surface' }, second: sphere, branch: { kind: 'internal', larger: 'second' } }
  return { id: 'S', name: 'Original cylinder/sphere', type, suppressed: false, first: { ...face(), support: 'cylinder-surface' }, second: sphere, branch: { kind: 'internal', larger: 'second' } }
}
it.each(sphereReferenceTypes)('keeps %s exact face/body purposes separate in both reused scopes', type => {
  const input = nested(), sub = input.definitions.find(value => value.kind === 'assembly'); if (sub?.kind !== 'assembly') throw new Error('Original shared assembly required')
  sub.occurrences.push(occurrence('roller')); sub.mates = [sphereReferenceMate(type)]; input.occurrences[0].visible = false
  const before = serializeAssemblyDocument(input), result = inspectAssemblyMateReferences(input)
  expect(result.map(value => value.scopePath)).toEqual([['left'], ['right']]); expect(result.map(value => value.second.candidate?.path)).toEqual([['left', 'roller'], ['right', 'roller']])
  expect(result.every(value => value.nativeVerificationRequired && !value.first.diagnostics.length && !value.second.diagnostics.length)).toBe(true)
  expect(result[0].second.candidate?.visible).toBe(false); expect(result[0].mate).toMatchObject({ second: { support: 'sphere-surface' } }); expect(serializeAssemblyDocument(input)).toBe(before)
})
it.each(sphereReferenceTypes)('preserves stale suppressed %s sphere declarations without native promotion', type => {
  const input = document(); input.occurrences.push(occurrence('roller')); input.occurrences[1].suppressed = true
  const mate = sphereReferenceMate(type); mate.suppressed = true
  if (!('kind' in mate.second) || mate.second.kind !== 'face') throw new Error('Original sphere required'); mate.second.component.definition.revision = 'retired'; input.mates = [mate]
  const [result] = inspectAssemblyMateReferences(input); expect(result.suppressed).toBe(true); expect(result.nativeVerificationRequired).toBe(true)
  expect(result.second.diagnostics.map(value => value.code)).toEqual(['STALE_DEFINITION', 'SUPPRESSED_COMPONENT']); expect(result.mate).toEqual(mate)
})
it.each(sphereReferenceTypes)('diagnoses missing sphere face/body producers for %s without searching another face', type => {
  const input = document(); input.occurrences.push(occurrence('roller')); const mate = sphereReferenceMate(type)
  if (!('kind' in mate.second) || mate.second.kind !== 'face') throw new Error('Original sphere required')
  mate.second.face.sourceFeatureId = 'missing'; mate.second.body = { bodyId: 'absent', sourceFeatureId: 'missing' }; input.mates = [mate]
  const [result] = inspectAssemblyMateReferences(input); expect(result.second.diagnostics.map(value => value.code)).toContain('MISSING_FACE_PRODUCER'); expect(result.second.diagnostics.map(value => value.code)).toContain('MISSING_BODY_STATE'); expect(result.nativeVerificationRequired).toBe(true)
})
