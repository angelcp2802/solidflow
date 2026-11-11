import { describe, expect, it } from 'vitest'
import { createDocument, DocumentHistory, validateDocument } from './document'
import { createAssemblyDocument, validateAssemblyDocument, type EmbeddedPartDefinition } from './assemblyDocument'
import { assemblyConfiguredGeometryInput, createAssemblyConfiguredDocument, validateAssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { AssemblyDocumentHistory } from './assemblyEditing'
import { AssemblyConfiguredDocumentHistory } from './assemblyConfiguredHistory'
import { parseCadDocument, serializeCadDocument, validateCadDocument, type CadDocument } from './cadDocument'
import { readCadRecovery, writeCadRecovery } from './cadRecovery'
import { type NamedView } from './namedViews'

// Original declaration-only empty documents and finite camera poses. These
// persistence tests do not claim native geometry, picking or rendered fidelity.
function entries(): NamedView[] {
  return [{ id: 'view-original', name: 'Vista guardada', view: {
    position: [3, 4, 25], target: [3, 4, 5], up: [0, 1, 0], top: 12, bottom: -8, zoom: 2.5, near: .1, far: 1000,
  } }]
}
function documents(): CadDocument[] {
  const part = createDocument('Original part'), assembly = createAssemblyDocument('Original assembly')
  return [part, assembly, createAssemblyConfiguredDocument(assembly)]
}
function history(document: CadDocument) {
  if (document.version === 1) {
    const value = new DocumentHistory(document)
    return { get current() { return value.current }, commit: (next: CadDocument) => value.apply(validateDocument(next)), undo: () => value.undo(), redo: () => value.redo() }
  }
  if (document.version === 2) {
    const value = new AssemblyDocumentHistory(document)
    return { get current() { return value.current }, commit: (next: CadDocument) => value.commitDocument(validateAssemblyDocument(next)), undo: () => value.undo(), redo: () => value.redo() }
  }
  const value = new AssemblyConfiguredDocumentHistory(document)
  return { get current() { return value.current }, commit: (next: CadDocument) => value.commitDocument(validateAssemblyConfiguredDocument(next)), undo: () => value.undo(), redo: () => value.redo() }
}

describe.each([1, 2, 3])('version %i named-view persistence', version => {
  it('keeps absent catalogs and legacy canonical bytes unchanged', () => {
    const original = documents().find(document => document.version === version)!
    const json = JSON.stringify(original, null, 2), copy = parseCadDocument(json)
    expect(copy).toEqual(original); expect(Object.hasOwn(copy, 'namedViews')).toBe(false)
    expect(serializeCadDocument(copy)).toBe(json)
  })
  it('roundtrips detached saved views through file and recovery without changing other fields', () => {
    const original = documents().find(document => document.version === version)!, document = { ...original, namedViews: entries() }
    const json = serializeCadDocument(document), reopened = parseCadDocument(json)
    expect(reopened).toEqual(document)
    const { namedViews, ...rest } = reopened
    expect(rest).toEqual(original); expect(namedViews).toEqual(entries())
    let bytes: string | null = null
    const storage = { setItem(_key: string, value: string) { bytes = value }, getItem() { return bytes } }
    expect(writeCadRecovery(storage, document)).toBe(json)
    const recovery = readCadRecovery(storage)
    expect(recovery).toEqual({ status: 'recovered', document, serialized: json })
    namedViews![0].view.position[0] = 500
    expect(document.namedViews).toEqual(entries()); expect(parseCadDocument(bytes!).namedViews).toEqual(entries())
  })
  it('records metadata edits in document history and omits the last deleted catalog', () => {
    const original = documents().find(document => document.version === version)!, store = history(original)
    const candidate = { ...original, namedViews: entries() }
    store.commit(candidate); candidate.namedViews[0].view.target[0] = 99
    expect(store.current.namedViews).toEqual(entries())
    expect(store.undo()).toEqual(original); expect(store.redo().namedViews).toEqual(entries())
    const deleted = store.current; delete deleted.namedViews; store.commit(deleted)
    expect(Object.hasOwn(store.current, 'namedViews')).toBe(false)
    expect(store.undo().namedViews).toEqual(entries())
  })
  it('rejects invalid catalogs before overwriting recovery and preserves history', () => {
    const original = documents().find(document => document.version === version)!, store = history(original)
    for (const namedViews of [undefined, null, [{ ...entries()[0], name: ' Not normalized' }], [{ ...entries()[0], view: { ...entries()[0].view, zoom: 1e100 } }]]) {
      const invalid = { ...original, namedViews }
      expect(() => validateCadDocument(invalid)).toThrow()
      let writes = 0
      expect(() => writeCadRecovery({ setItem() { writes++ } }, invalid as CadDocument)).toThrow(); expect(writes).toBe(0)
      expect(() => store.commit(invalid as CadDocument)).toThrow(); expect(store.current).toEqual(original)
      if (namedViews !== undefined) expect(readCadRecovery({ getItem: () => JSON.stringify(invalid) }).status).toBe('invalid')
    }
  })
})

it('keeps root, configured and embedded-part catalogs separate without sharing arrays or camera vectors', () => {
  const part = { ...createDocument('Original embedded part'), namedViews: entries() }
  const embedded: EmbeddedPartDefinition = { kind: 'part', id: part.id, revision: 'r1', document: part }
  const assembly = validateAssemblyDocument({ ...createAssemblyDocument('Original assembly'), definitions: [embedded], namedViews: [{ ...entries()[0], name: 'Assembly view' }] })
  const configured = validateAssemblyConfiguredDocument({ ...createAssemblyConfiguredDocument(assembly), namedViews: [{ ...entries()[0], name: 'Configured view' }] })
  expect(configured.source.namedViews![0].name).toBe('Assembly view')
  const copied = configured.source.definitions[0] as EmbeddedPartDefinition
  expect(copied.document.namedViews![0].name).toBe('Vista guardada')
  configured.namedViews![0].view.target[0] = 999
  expect(configured.source.namedViews![0].view.target[0]).toBe(3); expect(copied.document.namedViews![0].view.target[0]).toBe(3)
  copied.document.namedViews![0].view.position[0] = 555
  expect(part.namedViews![0].view.position[0]).toBe(3)
  const input = assemblyConfiguredGeometryInput(configured, 7)
  expect(Object.hasOwn(input, 'namedViews')).toBe(false)
  expect(input.document.namedViews).toEqual(configured.source.namedViews)
})

it('rejects a direct part catalog getter without invoking it', () => {
  const part = createDocument(); let reads = 0
  Object.defineProperty(part, 'namedViews', { enumerable: true, get() { reads++; return entries() } })
  expect(() => validateDocument(part)).toThrow(); expect(reads).toBe(0)
})
