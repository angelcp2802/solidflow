import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyGeometryReference, type EmbeddedAssemblyDefinition } from '../model/assemblyDocument'
import { applyAssemblyEdit, AssemblyDocumentHistory } from '../model/assemblyEditing'
import { assemblyAngleUiEdit, retainAssemblyAngleEdit, resolveAssemblyAngleEdit, type AssemblyAngleEditContext, type AssemblyAngleMate } from './assemblyAngleEdit'

// Existing original prism declarations; this checks intent/identity, not geometry.
function fixture() {
  const document = assemblyConfigurationCoreFixture().document
  const scope = document.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
  const mate: AssemblyAngleMate = { id: 'saved-angle', type: 'angle', name: 'Saved angle', angle: 30,
    suppressed: true, first: { kind: 'principal-axis', component: null, axis: 'Z' },
    second: { kind: 'principal-axis', component: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } }, axis: 'Z' } }
  scope.mates.push(mate)
  const context: AssemblyAngleEditContext = { documentSignature: serializeAssemblyDocument(document), scopePath: ['left'], scope, session: 7 }
  return { document, scope, mate, context }
}

describe('saved angle editing', () => {
  it('updates only fields, keeps ordered endpoints/suppression and reuses the saved ID in its shared parent', () => {
    const { document, scope, mate } = fixture(), before = structuredClone(document)
    const update = assemblyAngleUiEdit(mate, { name: 'Revised angle', angle: '60.5' })
    expect(update).toEqual({ type: 'angle', name: 'Revised angle', angle: 60.5, suppressed: true,
      first: mate.first, second: mate.second })
    expect(update.first).not.toBe(mate.first); expect(update.second).not.toBe(mate.second)
    const candidate = applyAssemblyEdit(document, { type: 'update-mate', scope: { id: scope.id, revision: scope.revision }, mateId: mate.id, mate: update })
    const changedScope = candidate.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
    expect(changedScope.mates).toEqual([{ ...update, id: mate.id }])
    expect(candidate.mates).toEqual([])
    expect(candidate.occurrences).toEqual(before.occurrences)
    expect(document).toEqual(before)
    const history = new AssemblyDocumentHistory(document)
    history.commitDocument(candidate)
    expect(history.undo()).toEqual(before); expect(history.redo()).toEqual(candidate)
  })

  it('replaces ordered root/component references without mutating their owners or the saved document', () => {
    const { document, scope, mate } = fixture(), before = structuredClone(document)
    const owner = { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }
    const references: [AssemblyGeometryReference, AssemblyGeometryReference] = [
      { kind: 'principal-axis', component: owner, axis: 'X' },
      { kind: 'principal-plane', component: null, plane: 'XZ' },
    ]
    const update = assemblyAngleUiEdit(mate, { name: 'Moved angle', angle: '60', references })
    expect(update).toEqual({ type: 'angle', name: 'Moved angle', angle: 60, suppressed: true,
      first: { kind: 'principal-axis', component: { occurrencePath: ['b'], definition: { id: 'configuration-B', revision: 'r1' } }, axis: 'X' },
      second: { kind: 'principal-plane', component: null, plane: 'XZ' } })
    const snapshot = structuredClone(update)
    expect(update.first).not.toBe(references[0]); expect(update.second).not.toBe(references[1])
    owner.occurrencePath[0] = 'changed-after-proposal'; owner.definition.revision = 'changed'
    expect(update).toEqual(snapshot); expect(document).toEqual(before)
    const candidate = applyAssemblyEdit(document, { type: 'update-mate', scope: { id: scope.id, revision: scope.revision }, mateId: mate.id, mate: update })
    const changed = candidate.definitions.find(value => value.kind === 'assembly') as EmbeddedAssemblyDefinition
    expect(changed.mates).toEqual([{ ...snapshot, id: 'saved-angle' }]); expect(changed.occurrences).toEqual(scope.occurrences)
    expect(candidate.occurrences).toEqual(before.occurrences)
    expect(validateAssemblyDocument(JSON.parse(serializeAssemblyDocument(candidate)))).toEqual(candidate)
    const history = new AssemblyDocumentHistory(document); history.commitDocument(candidate)
    expect(history.undo()).toEqual(before); expect(history.redo()).toEqual(candidate)
  })

  it('retains the angle declaration contract for a material LINE reference', () => {
    const { mate } = fixture()
    const edge: AssemblyGeometryReference = { kind: 'edge', component: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } },
      body: null, edge: { sourceFeatureId: 'original', key: 'straight-edge' }, support: 'line' }
    const update = assemblyAngleUiEdit(mate, { name: 'Line angle', angle: '90', references: [edge, mate.first] })
    expect(update.first).toEqual(edge); expect(update.first).not.toBe(edge); expect(update.second).toEqual(mate.first)
  })

  it.each([0, 1] as const)('rejects missing or incompatible geometry in endpoint %s without fallback', slot => {
    const { mate } = fixture(), before = structuredClone(mate)
    const surface = { kind: 'face', component: { occurrencePath: ['a'], definition: { id: 'configuration-A', revision: 'r1' } }, body: null,
      face: { sourceFeatureId: 'original', key: 'surface' }, support: 'cylinder-surface' }
    for (const reference of [null, surface]) {
      const references: [AssemblyGeometryReference | null, AssemblyGeometryReference | null] = [mate.first, mate.second]
      references[slot] = reference as AssemblyGeometryReference | null
      expect(() => assemblyAngleUiEdit(mate, { name: 'Angle', angle: '60', references })).toThrow()
      expect(mate).toEqual(before)
    }
  })

  it.each(['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999', '-0.1', '180.1', '360'])('rejects invalid ordinary angle %j before proposing an edit', angle => {
    const { mate } = fixture()
    expect(() => assemblyAngleUiEdit(mate, { name: 'Angle', angle })).toThrow('ángulo finito entre 0° y 180°')
  })
  it.each(['0', '-0', '180', '60.5'])('preserves ordinary angle in degrees %s', angle => {
    expect(assemblyAngleUiEdit(fixture().mate, { name: 'Angle', angle })).toHaveProperty('angle', Number(angle))
  })
  it('rejects a blank name without changing the saved relation', () => {
    const { mate } = fixture(), before = structuredClone(mate)
    expect(() => assemblyAngleUiEdit(mate, { name: ' ', angle: '60' })).toThrow('nombre')
    expect(mate).toEqual(before)
  })
  it('keeps the editor valid across discarded proposals without using a worker generation as identity', () => {
    const { document, context, mate } = fixture(), before = serializeAssemblyDocument(document)
    const ticket = retainAssemblyAngleEdit(context, mate)!
    assemblyAngleUiEdit(mate, { name: 'Unapplied', angle: '60' })
    expect(resolveAssemblyAngleEdit(ticket, context)).toBe(mate)
    expect(resolveAssemblyAngleEdit(ticket, structuredClone(context))).toEqual(mate)
    expect(serializeAssemblyDocument(document)).toBe(before)
  })
  it('invalidates document edits, scope changes, revisions and byte-identical replacement sessions', () => {
    const { context, mate } = fixture(), ticket = retainAssemblyAngleEdit(context, mate)!
    for (const changed of [
      { ...context, documentSignature: context.documentSignature + ' ' },
      { ...context, scopePath: ['right'] },
      { ...context, scope: { ...context.scope, revision: 'r2' } },
      { ...context, session: context.session + 1 },
      { ...context, scope: { ...context.scope, mates: [{ ...mate, angle: 31 }] } },
      { ...context, scope: { ...context.scope, mates: [] } },
      { ...context, scope: { ...context.scope, mates: [mate, mate] } },
    ]) expect(resolveAssemblyAngleEdit(ticket, changed)).toBeNull()
    expect(resolveAssemblyAngleEdit(null, context)).toBeNull()
    expect(retainAssemblyAngleEdit(context, { ...mate, angle: 31 })).toBeNull()
  })
})
