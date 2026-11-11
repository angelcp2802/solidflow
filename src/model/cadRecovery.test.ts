import { expect, it } from 'vitest'
import { CAD_RECOVERY_KEY, readCadRecovery, writeCadRecovery, type CadRecoveryStorage } from './cadRecovery'
import { validateAssemblyDocument } from './assemblyDocument'
import { parseCadDocument, serializeCadDocument, type CadDocument } from './cadDocument'
import { createAssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import { serializeDocument, validateDocument } from './document'

// Original persistence-only documents. No file path, renderer state, native
// scene or solver capability is stored in the shared recovery entry.
const stamp = '2026-10-15T00:00:00.000Z'
function part() { return validateDocument({ version: 1, id: 'original-part', name: 'Original recovery part', units: 'mm',
  features: [], createdAt: stamp, updatedAt: stamp }) }
function assembly() { return validateAssemblyDocument({ version: 2, kind: 'assembly', id: 'original-assembly', revision: 'r1',
  name: 'Original recovery assembly', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [], occurrences: [], mates: [] }) }
function storage(initial: string | null = null): CadRecoveryStorage & { bytes: string | null; reads: number; writes: number } {
  return { bytes: initial, reads: 0, writes: 0,
    getItem(key) { expect(key).toBe(CAD_RECOVERY_KEY); this.reads++; return this.bytes },
    setItem(key, value) { expect(key).toBe(CAD_RECOVERY_KEY); this.writes++; this.bytes = value },
  }
}

it.each([{ document: part() }, { document: assembly() }])('recovers version $document.version without rewriting saved bytes or inventing file access', ({ document }) => {
  const bytes = JSON.stringify(document), saved = storage(bytes), result = readCadRecovery(saved)
  expect(result.status).toBe('recovered'); if (result.status !== 'recovered') throw new Error('Original valid recovery missing')
  expect(result.document).toEqual(document); expect(result.serialized).toBe(serializeCadDocument(document))
  expect(saved.bytes).toBe(bytes); expect(saved.reads).toBe(1); expect(saved.writes).toBe(0)
  expect(Object.hasOwn(result, 'filePath') || Object.hasOwn(result, 'savedPath') || Object.hasOwn(result, 'token')).toBe(false)
  if (result.document.version === 3) result.document.source.name = 'Mutation outside recovery'
  else result.document.name = 'Mutation outside recovery'
  expect(parseCadDocument(saved.bytes!)).toEqual(document)
})

it('recovers the selected configured context with all dormant variants and no persisted epoch or file grant', () => {
  const original = assemblyConfigurationCoreFixture(), document = createAssemblyConfiguredDocument(original.document, original.catalog, 'mixed')
  const saved = storage(JSON.stringify(document)), bytes = saved.bytes
  const result = readCadRecovery(saved)
  expect(result.status).toBe('recovered')
  if (result.status !== 'recovered' || result.document.version !== 3) throw Error('Original configured recovery missing')
  expect(result.document).toEqual(document); expect(saved.bytes).toBe(bytes); expect(saved.writes).toBe(0)
  result.document.catalog[0].configurations[0].name = 'Detached recovery mutation'
  result.document.source.occurrences[0].pose.translation[0] = 700
  expect(parseCadDocument(saved.bytes!)).toEqual(document)
  expect(Object.keys(result.document).sort()).toEqual(['catalog', 'kind', 'rootConfiguration', 'source', 'version'])
})

it('writes source, catalog and selected state together through v3 recovery without changing source bytes', () => {
  const original = assemblyConfigurationCoreFixture(), before = serializeCadDocument(original.document)
  const document = createAssemblyConfiguredDocument(original.document, original.catalog, 'both-compact'), saved = storage(before)
  const serialized = writeCadRecovery(saved, document)
  expect(serialized).toBe(serializeCadDocument(document)); expect(saved.writes).toBe(1)
  expect(readCadRecovery(saved)).toEqual({ status: 'recovered', document, serialized })
  expect(serializeCadDocument(original.document)).toBe(before)
})

it.each(['unknown-version', 'invalid-selector', 'catalog-loss', 'persisted-capability'])('preserves configured recovery bytes after %s replacement is rejected', problem => {
  const original = assemblyConfigurationCoreFixture(), document = createAssemblyConfiguredDocument(original.document, original.catalog, 'mixed')
  const saved = storage(serializeCadDocument(document)), before = saved.bytes
  const invalid = problem === 'unknown-version' ? { ...document, version: 4 }
    : problem === 'invalid-selector' ? { ...document, rootConfiguration: 'missing' }
    : problem === 'catalog-loss' ? { ...document, catalog: [] }
    : { ...document, token: 'Not saved authority', generation: 99 }
  expect(() => writeCadRecovery(saved, invalid as unknown as CadDocument)).toThrow()
  expect(saved.bytes).toBe(before); expect(saved.writes).toBe(0)
})

it('preserves the legacy part recovery bytes when using the union serializer', () => {
  const document = part(), saved = storage(), serialized = writeCadRecovery(saved, document)
  expect(serialized).toBe(serializeDocument(document)); expect(saved.bytes).toBe(serialized); expect(saved.writes).toBe(1)
})

it('uses the same key for a committed mode replacement and can recover the new assembly independently', () => {
  const saved = storage(serializeDocument(part())), next = assembly()
  writeCadRecovery(saved, next); expect(saved.writes).toBe(1)
  const recovered = readCadRecovery(saved)
  expect(recovered.status).toBe('recovered'); expect(recovered.document).toEqual(next)
  expect(CAD_RECOVERY_KEY).toBe('solidflow.autosave')
})

it.each(['{broken', '{}', JSON.stringify({ ...assembly(), units: 'inch' }), JSON.stringify({ ...assembly(), occurrences: [null] })])(
  'leaves invalid recovery untouched without writing a default document: %#', bytes => {
    const saved = storage(bytes); expect(readCadRecovery(saved)).toEqual({ status: 'invalid', document: null })
    expect(saved.bytes).toBe(bytes); expect(saved.writes).toBe(0)
  })

it('distinguishes a missing entry from unreadable recovery without modifying storage', () => {
  const missing = storage(); expect(readCadRecovery(missing)).toEqual({ status: 'missing', document: null }); expect(missing.writes).toBe(0)
  expect(readCadRecovery({ getItem() { throw new Error('Original storage access failure') } })).toEqual({ status: 'unavailable', document: null })
})

it('retains the prior valid recovery if a replacement document is invalid', () => {
  const bytes = serializeDocument(part()), saved = storage(bytes), invalid = { ...assembly(), occurrences: [null] }
  expect(() => writeCadRecovery(saved, invalid as unknown as CadDocument)).toThrow()
  expect(saved.bytes).toBe(bytes); expect(saved.writes).toBe(0)
})

it('rejects executable document fields before serialization can invoke them or replace recovery', () => {
  const saved = storage(serializeDocument(part())); let reads = 0
  const invalid = Object.defineProperty(assembly(), 'name', { enumerable: true, get() { reads++; return 'Executable name' } })
  expect(() => writeCadRecovery(saved, invalid)).toThrow(); expect(reads).toBe(0); expect(saved.writes).toBe(0)
})

it('enforces the UTF-8 document boundary on read and before replacing valid recovery', () => {
  const oversized = JSON.stringify({ ...assembly(), name: 'é'.repeat(10 * 1024 * 1024 + 1) }), saved = storage(serializeDocument(part()))
  expect(readCadRecovery(storage(oversized)).status).toBe('invalid')
  const invalid = { ...assembly(), name: 'é'.repeat(10 * 1024 * 1024 + 1) }
  expect(() => writeCadRecovery(saved, invalid)).toThrow(); expect(saved.writes).toBe(0); expect(saved.bytes).toBe(serializeDocument(part()))
})

it('surfaces a storage write failure and leaves the previous entry available', () => {
  const bytes = serializeDocument(part()), failure = new Error('Original quota failure')
  const saved = { getItem() { return bytes }, setItem() { throw failure } }
  expect(() => writeCadRecovery(saved, assembly())).toThrow(failure)
  expect(readCadRecovery(saved).document).toEqual(part())
})
