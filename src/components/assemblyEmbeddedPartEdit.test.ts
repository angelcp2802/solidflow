import { describe, expect, it } from 'vitest'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument, type EmbeddedAssemblyDefinition, type EmbeddedPartDefinition } from '../model/assemblyDocument'
import { serializeCadDocument } from '../model/cadDocument'
import type { Document } from '../model/document'
import { prepareAssemblyEmbeddedPartReturn, resolveAssemblyEmbeddedPartEdit, retainAssemblyEmbeddedPartEdit,
  type AssemblyEmbeddedPartEditContext } from './assemblyEmbeddedPartEdit'

// Reuses the independently authored configuration boxes and reused S scopes.
// These are declaration/session tests, with no new model or native BRep claim.
function fixture(scopePath: readonly string[] = []): AssemblyEmbeddedPartEditContext {
  return { document: assemblyConfigurationCoreFixture().document, ownerEpoch: 4, scopePath }
}
const shared = (document: AssemblyDocument) => document.definitions.find(value => value.id === 'configuration-S') as EmbeddedAssemblyDefinition
const part = (document: AssemblyDocument) => document.definitions.find(value => value.id === 'configuration-A') as EmbeddedPartDefinition
const retain = (context: AssemblyEmbeddedPartEditContext, occurrencePath = ['right', 'a']) => retainAssemblyEmbeddedPartEdit(context, occurrencePath, 'embedded-edit-1')!

describe('embedded part edit declaration ticket', () => {
  it('captures the exact reused occurrence and source without updating either instance', () => {
    const context = fixture(), before = serializeAssemblyDocument(context.document)
    const right = retain(context), left = retain(context, ['left', 'a'])
    expect(right.document).toBe(context.document)
    expect(right.source).toEqual({ id: 'configuration-A', revision: 'r1' })
    expect(right.occurrencePath).toEqual(['right', 'a'])
    expect(left.occurrencePath).toEqual(['left', 'a'])
    expect(right.initialDocument).toEqual(left.initialDocument)
    expect(right.initialDocument).not.toBe(part(context.document).document)
    expect(right.initialDocument).not.toBe(left.initialDocument)
    expect(resolveAssemblyEmbeddedPartEdit(right, context)).toEqual({ source: right.source, document: part(context.document).document, nonce: 'embedded-edit-1' })
    expect(serializeAssemblyDocument(context.document)).toBe(before)
  })

  it('anchors a ticket to its captured path instead of the last reused selection', () => {
    const context = fixture(['right']), ticket = retain(context)
    const other = retainAssemblyEmbeddedPartEdit(context, ['left', 'a'], 'global-component')!
    expect(other.occurrencePath).toEqual(['left', 'a'])
    expect(other.scopePath).toEqual(['right'])
    expect(resolveAssemblyEmbeddedPartEdit(other, context)?.source).toEqual(ticket.source)
    expect(resolveAssemblyEmbeddedPartEdit(ticket, context)?.source).toEqual(ticket.source)
    expect(ticket.occurrencePath).toEqual(['right', 'a'])
    expect(resolveAssemblyEmbeddedPartEdit(ticket, { ...context, scopePath: [] })).toBeNull()
    expect(resolveAssemblyEmbeddedPartEdit(ticket, { ...context, scopePath: ['left'] })).toBeNull()
  })

  it('accepts exact hidden and suppressed declarations without manufacturing scene evidence', () => {
    const context = fixture(['right'])
    context.document.occurrences.find(value => value.id === 'right')!.visible = false
    context.document.occurrences.find(value => value.id === 'right')!.suppressed = true
    shared(context.document).occurrences.find(value => value.id === 'a')!.visible = false
    const ticket = retain(context)
    expect(ticket).not.toBeNull()
    expect(resolveAssemblyEmbeddedPartEdit(ticket, context)?.document.id).toBe('configuration-A')
    expect(Object.keys(ticket)).not.toContain('scene')
  })

  it('requires a global part path and a separately valid assembly scope', () => {
    const context = fixture()
    for (const path of [[], ['right'], ['missing', 'a'], ['right', 'missing'], ['right', 'a', 'through-part']])
      expect(retainAssemblyEmbeddedPartEdit(context, path, 'edit')).toBeNull()
    expect(retainAssemblyEmbeddedPartEdit(fixture(['right', 'a']), ['right', 'a'], 'edit')).toBeNull()
    expect(retainAssemblyEmbeddedPartEdit(fixture(['missing']), ['right', 'a'], 'edit')).toBeNull()
  })

  it('uses the exact revision tuple when another revision has the same part ID', () => {
    const context = fixture(), newer = structuredClone(part(context.document))
    newer.revision = 'r2'; context.document.definitions.push(newer)
    shared(context.document).occurrences.find(value => value.id === 'a')!.definition.revision = 'r2'
    const ticket = retain(context)
    expect(ticket.source).toEqual({ id: 'configuration-A', revision: 'r2' })
    expect(resolveAssemblyEmbeddedPartEdit(ticket, context)?.source).toEqual(ticket.source)
    shared(context.document).occurrences.find(value => value.id === 'a')!.definition.revision = 'r1'
    expect(resolveAssemblyEmbeddedPartEdit(ticket, context)).toBeNull()
  })

  it('rejects equal reopened bytes, changed epochs and an equal-bytes ABA', () => {
    const context = fixture(), ticket = retain(context), original = serializeAssemblyDocument(context.document)
    const reopened = validateAssemblyDocument(context.document)
    expect(serializeAssemblyDocument(reopened)).toBe(original)
    expect(resolveAssemblyEmbeddedPartEdit(ticket, { ...context, document: reopened })).toBeNull()
    expect(resolveAssemblyEmbeddedPartEdit(ticket, { ...context, ownerEpoch: 5 })).toBeNull()
    context.document.name = 'Temporarily changed'
    expect(resolveAssemblyEmbeddedPartEdit(ticket, context)).toBeNull()
    context.document.name = JSON.parse(original).name
    expect(serializeAssemblyDocument(context.document)).toBe(original)
    expect(resolveAssemblyEmbeddedPartEdit(ticket, { ...context, ownerEpoch: 6 })).toBeNull()
  })

  it.each(['missing-occurrence', 'missing-definition', 'changed-source', 'changed-part'] as const)('rejects %s without redirecting to a reused sibling', change => {
    const context = fixture(), ticket = retain(context)
    if (change === 'missing-occurrence') shared(context.document).occurrences = shared(context.document).occurrences.filter(value => value.id !== 'a')
    if (change === 'missing-definition') context.document.definitions = context.document.definitions.filter(value => value.id !== 'configuration-A')
    if (change === 'changed-source') shared(context.document).occurrences.find(value => value.id === 'a')!.definition = { id: 'configuration-B', revision: 'r1' }
    if (change === 'changed-part') part(context.document).document.name = 'Changed embedded content'
    expect(resolveAssemblyEmbeddedPartEdit(ticket, context)).toBeNull()
  })

  it('validates the complete graph before reading an otherwise selectable part', () => {
    const context = fixture()
    shared(context.document).occurrences.find(value => value.id === 'b')!.definition.revision = 'missing'
    expect(retainAssemblyEmbeddedPartEdit(context, ['right', 'a'], 'edit')).toBeNull()
  })

  it('copies path/source data and freezes the nonce while keeping the initial part detached', () => {
    const scopePath = ['right'], occurrencePath = ['right', 'a'], context = fixture(scopePath)
    const ticket = retainAssemblyEmbeddedPartEdit(context, occurrencePath, 'edit')!, before = serializeAssemblyDocument(context.document)
    occurrencePath[0] = 'left'; scopePath[0] = 'left'
    expect(ticket.scopePath).toEqual(['right']); expect(ticket.occurrencePath).toEqual(['right', 'a'])
    expect(Object.isFrozen(ticket)).toBe(true); expect(Object.isFrozen(ticket.source)).toBe(true)
    expect(Object.isFrozen(ticket.scopePath)).toBe(true); expect(Object.isFrozen(ticket.occurrencePath)).toBe(true)
    ticket.initialDocument.name = 'Independent editor draft'
    const resolved = resolveAssemblyEmbeddedPartEdit(ticket, { ...context, scopePath: ['right'] })!
    expect(resolved.document.name).not.toBe(ticket.initialDocument.name)
    resolved.document.name = 'Independent resolved copy'; resolved.source.revision = 'local'
    expect(serializeAssemblyDocument(context.document)).toBe(before)
    expect(ticket.source.revision).toBe('r1')
  })

  it('rejects invalid epochs, nonce, sparse paths and accessor paths without coercion', () => {
    const context = fixture()
    for (const ownerEpoch of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(retainAssemblyEmbeddedPartEdit({ ...context, ownerEpoch }, ['right', 'a'], 'edit')).toBeNull()
    for (const nonce of ['', ' ', 'x'.repeat(129), 'bad\nnonce'])
      expect(retainAssemblyEmbeddedPartEdit(context, ['right', 'a'], nonce)).toBeNull()
    let calls = 0
    const accessorPath = ['right', 'a']; Object.defineProperty(accessorPath, '1', { get: () => { calls++; return 'a' } })
    expect(retainAssemblyEmbeddedPartEdit(context, accessorPath, 'edit')).toBeNull()
    expect(retainAssemblyEmbeddedPartEdit(context, Array(2), 'edit')).toBeNull()
    expect(calls).toBe(0)
  })

  it('rejects base/context accessors before calling them', () => {
    let calls = 0
    const context = fixture(), executable = structuredClone(context.document)
    Object.defineProperty(executable, 'id', { enumerable: true, get: () => { calls++; return 'configuration-root' } })
    expect(retainAssemblyEmbeddedPartEdit({ ...context, document: executable }, ['right', 'a'], 'edit')).toBeNull()
    const accessorContext = { ...context }
    Object.defineProperty(accessorContext, 'document', { enumerable: true, get: () => { calls++; return context.document } })
    expect(retainAssemblyEmbeddedPartEdit(accessorContext, ['right', 'a'], 'edit')).toBeNull()
    expect(calls).toBe(0)
  })
})

describe('embedded part return intent', () => {
  it('compares full baseline content and never treats a saved copy as parent Apply', () => {
    const context = fixture(), ticket = retain(context), before = serializeAssemblyDocument(context.document)
    const unchanged = prepareAssemblyEmbeddedPartReturn(ticket, context, ticket.initialDocument)
    expect(unchanged.changed).toBe(false)
    const edited = structuredClone(ticket.initialDocument)
    edited.name = 'Saved independent copy'
    const savedCopyBytes = serializeCadDocument(edited)
    const returned = prepareAssemblyEmbeddedPartReturn(ticket, context, JSON.parse(savedCopyBytes))
    expect(returned.changed).toBe(true)
    expect(returned.source).toEqual({ id: 'configuration-A', revision: 'r1' })
    expect(serializeCadDocument(returned.document)).toBe(savedCopyBytes)
    expect(Object.keys(returned).sort()).toEqual(['changed', 'document', 'source'])
    expect(serializeAssemblyDocument(context.document)).toBe(before)
  })

  it('counts feature, metadata and timestamp edits without ignoring fields', () => {
    const context = fixture(), ticket = retain(context)
    const variants = [structuredClone(ticket.initialDocument), structuredClone(ticket.initialDocument), structuredClone(ticket.initialDocument)]
    const extrude = variants[0].features.find(value => value.type === 'extrude')!
    if (extrude.type === 'extrude') extrude.depth = 7
    variants[1].name = 'Metadata edit'
    variants[2].updatedAt = '2026-10-29T00:00:00.000Z'
    for (const candidate of variants) expect(prepareAssemblyEmbeddedPartReturn(ticket, context, candidate).changed).toBe(true)
  })

  it('returns detached data and leaves the candidate, baseline and both uses intact', () => {
    const context = fixture(), ticket = retain(context), candidate = structuredClone(ticket.initialDocument)
    const before = serializeAssemblyDocument(context.document), candidateBytes = serializeCadDocument(candidate), baseline = ticket.baselineSerialized
    const result = prepareAssemblyEmbeddedPartReturn(ticket, context, candidate)
    expect(result.document).not.toBe(candidate)
    result.document.name = 'Caller changed result'; result.document.features[0].name = 'Caller changed feature'; result.source.id = 'local'
    expect(serializeCadDocument(candidate)).toBe(candidateBytes)
    expect(ticket.baselineSerialized).toBe(baseline)
    expect(serializeAssemblyDocument(context.document)).toBe(before)
  })

  it('rejects other document IDs, assembly documents and malformed part declarations', () => {
    const context = fixture(), ticket = retain(context), other = structuredClone(ticket.initialDocument)
    other.id = 'different-part'
    expect(() => prepareAssemblyEmbeddedPartReturn(ticket, context, other)).toThrow(/identidad/)
    expect(() => prepareAssemblyEmbeddedPartReturn(ticket, context, context.document)).toThrow(/identidad/)
    expect(() => prepareAssemblyEmbeddedPartReturn(ticket, context, { ...ticket.initialDocument, features: [{ type: 'invalid' }] })).toThrow()
  })

  it.each(['version', 'id', 'toJSON'] as const)('rejects candidate %s getters without invoking them', key => {
    const context = fixture(), ticket = retain(context), candidate = structuredClone(ticket.initialDocument)
    let calls = 0
    Object.defineProperty(candidate, key, { enumerable: true, get: () => { calls++; throw Error('Getter executed') } })
    expect(() => prepareAssemblyEmbeddedPartReturn(ticket, context, candidate)).toThrow()
    expect(calls).toBe(0)
  })

  it('rejects nested executable feature fields before the legacy part parser', () => {
    const context = fixture(), ticket = retain(context), candidate = structuredClone(ticket.initialDocument)
    let calls = 0
    Object.defineProperty(candidate.features[1], 'depth', { enumerable: true, get: () => { calls++; return 4 } })
    expect(() => prepareAssemblyEmbeddedPartReturn(ticket, context, candidate)).toThrow()
    expect(calls).toBe(0)
  })

  it('rejects a stale or absent ticket before inspecting the candidate', () => {
    const context = fixture(), ticket = retain(context)
    let calls = 0
    const candidate = { get version() { calls++; throw Error('Not reached') } } as unknown as Document
    expect(() => prepareAssemblyEmbeddedPartReturn(ticket, { ...context, ownerEpoch: 9 }, candidate)).toThrow(/origen cambió/)
    expect(() => prepareAssemblyEmbeddedPartReturn(null, context, candidate)).toThrow(/origen cambió/)
    expect(calls).toBe(0)
    expect(resolveAssemblyEmbeddedPartEdit(null, context)).toBeNull()
  })
})
