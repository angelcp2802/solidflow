import { describe, expect, it } from 'vitest'
import { createDocument, DocumentHistory } from '../model/document'
import { AssemblyDocumentHistory } from '../model/assemblyEditing'
import { AssemblyConfiguredDocumentHistory } from '../model/assemblyConfiguredHistory'
import { createAssemblyConfiguredDocument } from '../model/assemblyConfiguredDocument'
import { assemblyConfigurationCoreFixture } from '../model/assemblyConfigurationCore.test-utils'
import { parseCadDocument, serializeCadDocument, type CadDocument } from '../model/cadDocument'
import { readCadRecovery, writeCadRecovery } from '../model/cadRecovery'
import { renameNamedView, updateNamedViewCamera, type NamedView } from '../model/namedViews'
import { rebindNamedViewSelection, sameDocumentExceptNamedViews, withDocumentNamedViews } from './useNamedDocumentViews'

// Original camera declarations and existing original millimetre-box documents.
// These tests check document transactions, not native geometry or raster parity.
const view = (): NamedView => ({ id: 'original-view', name: 'Vista de trabajo', view: {
  position: [12, -8, 40], target: [12, -8, 0], up: [0, 1, 0], top: 14, bottom: -6, zoom: 2, near: 1, far: 201,
} })

function fixtures(): CadDocument[] {
  const { document, catalog } = assemblyConfigurationCoreFixture()
  return [createDocument('Pieza original'), document, createAssemblyConfiguredDocument(document, catalog, 'mixed')]
}
function historyFor(document: CadDocument) {
  if (document.version === 1) {
    const history = new DocumentHistory(document)
    return { current: () => history.current, undo: () => history.undo(), redo: () => history.redo(), commit: (next: CadDocument) => {
      if (next.version !== 1) throw Error('part fixture'); return history.apply(next)
    } }
  }
  if (document.version === 2) {
    const history = new AssemblyDocumentHistory(document)
    return { current: () => history.current, undo: () => history.undo(), redo: () => history.redo(), commit: (next: CadDocument) => {
      if (next.version !== 2) throw Error('assembly fixture'); return history.commitDocument(next)
    } }
  }
  const history = new AssemblyConfiguredDocumentHistory(document)
  return { current: () => history.current, undo: () => history.undo(), redo: () => history.redo(), commit: (next: CadDocument) => {
    if (next.version !== 3) throw Error('configured fixture'); return history.commitDocument(next)
  } }
}

describe('root named-view document transactions', () => {
  it.each([1, 2, 3])('renames and updates a saved version %s view through independent history and recovery', version => {
    const initial = fixtures().find(document => document.version === version)!, history = historyFor(initial)
    const original = history.commit(withDocumentNamedViews(initial, [view()])), originalBytes = serializeCadDocument(original)
    const renamed = history.commit(withDocumentNamedViews(original, renameNamedView(original.namedViews, 'original-view', 'Detalle')))
    const capture = { ...view().view, position: [52, -8, 0], zoom: 4 }
    const updated = history.commit(withDocumentNamedViews(renamed, updateNamedViewCamera(renamed.namedViews, 'original-view', capture)))
    expect(updated.namedViews).toEqual([{ id: 'original-view', name: 'Detalle', view: { ...view().view, position: [52, -8, 0], zoom: 4 } }])
    expect(sameDocumentExceptNamedViews(initial, updated)).toBe(true)
    const bytes = serializeCadDocument(updated)
    expect(parseCadDocument(bytes)).toEqual(updated)
    const storage = new Map<string, string>()
    writeCadRecovery({ setItem: (key, value) => { storage.set(key, value) } }, updated)
    expect(readCadRecovery({ getItem: key => storage.get(key) ?? null })).toEqual({ status: 'recovered', document: updated, serialized: bytes })
    expect(serializeCadDocument(history.undo())).toBe(serializeCadDocument(renamed))
    expect(serializeCadDocument(history.undo())).toBe(originalBytes)
    expect(serializeCadDocument(history.redo())).toBe(serializeCadDocument(renamed))
    expect(serializeCadDocument(history.redo())).toBe(bytes)
    expect(original.namedViews).toEqual([view()])
  })
  it.each([1, 2, 3])('creates, deletes, undoes, redoes and persists version %s without changing other document content', version => {
    const initial = fixtures().find(document => document.version === version)!, before = serializeCadDocument(initial), history = historyFor(initial)
    const saved = history.commit(withDocumentNamedViews(initial, [view()])), savedBytes = serializeCadDocument(saved)
    expect(savedBytes).not.toBe(before) // Existing dirty comparison sees metadata.
    expect(sameDocumentExceptNamedViews(initial, saved)).toBe(true)
    expect(saved.namedViews).toEqual([view()]); expect(parseCadDocument(savedBytes)).toEqual(saved)
    const storage = new Map<string, string>()
    writeCadRecovery({ setItem: (key, value) => { storage.set(key, value) } }, saved)
    expect(readCadRecovery({ getItem: key => storage.get(key) ?? null })).toEqual({ status: 'recovered', document: saved, serialized: savedBytes })
    expect(serializeCadDocument(history.undo())).toBe(before)
    expect(serializeCadDocument(history.redo())).toBe(savedBytes)
    const deleted = history.commit(withDocumentNamedViews(history.current(), []))
    expect(Object.hasOwn(deleted, 'namedViews')).toBe(false)
    expect(serializeCadDocument(deleted)).toBe(before)
    expect(serializeCadDocument(history.undo())).toBe(savedBytes)
    expect(serializeCadDocument(history.redo())).toBe(before)
    expect(serializeCadDocument(initial)).toBe(before)
  })

  it('never treats embedded metadata, placement, configuration or timestamps as root-only view edits', () => {
    const configured = fixtures()[2]
    if (configured.version !== 3) throw Error('configured fixture')
    for (const change of [
      (next: typeof configured) => { next.source.namedViews = [view()] },
      (next: typeof configured) => { next.source.updatedAt = '2026-10-26T12:00:00.000Z' },
      (next: typeof configured) => { next.source.occurrences[0].pose.translation[0]++ },
      (next: typeof configured) => { next.rootConfiguration = 'both-compact' },
      (next: typeof configured) => { next.catalog[0].configurations[0].name = 'Changed' },
      (next: typeof configured) => { const part = next.source.definitions[0]; if (part.kind !== 'part') throw Error('part fixture'); part.document.namedViews = [view()] },
    ]) {
      const next = structuredClone(configured); next.namedViews = [view()]; change(next)
      expect(sameDocumentExceptNamedViews(configured, next)).toBe(false)
    }
    const part = createDocument('Original'), changed = { ...part, updatedAt: '2026-10-26T12:00:00.000Z', namedViews: [view()] }
    expect(sameDocumentExceptNamedViews(part, changed)).toBe(false)
  })

  it('owns the camera data while preserving existing geometry object identity for the UI', () => {
    const document = createDocument('Original'), entry = view(), next = withDocumentNamedViews(document, [entry])
    expect(next.features).toBe(document.features)
    entry.view.position[0] = 999
    expect(next.namedViews).toEqual([view()])
    expect(document.namedViews).toBeUndefined()
    next.namedViews![0].view.target[0] = 800
    expect(entry.view.target[0]).toBe(12)
  })

  it('rejects an invalid catalogue before a history transaction can replace the prior saved state', () => {
    const document = createDocument('Original'), history = new DocumentHistory(document), before = serializeCadDocument(history.current)
    expect(() => history.apply(withDocumentNamedViews(document, [view(), { ...view(), id: 'second' }]))).toThrow(/duplicado/)
    expect(history.canUndo).toBe(false); expect(serializeCadDocument(history.current)).toBe(before)
  })

  it('keeps ordered face/origin UI selections current through a root-only metadata transaction', () => {
    const before = fixtures()[1], after = withDocumentNamedViews(before, [view()]), scene = {}
    const oldContext = { documentSignature: serializeCadDocument(before), scopePath: ['left'], sessionIdentity: {}, scene }
    const newContext = { ...oldContext, documentSignature: serializeCadDocument(after), sessionIdentity: {} }
    const selection = { ...oldContext, items: [{ kind: 'face', key: 'original-face' }, { kind: 'origin', key: 'original-plane', binding: 'original-binding' }] }
    const rebound = rebindNamedViewSelection(selection, before, after, oldContext, newContext)!
    expect(rebound.documentSignature).toBe(newContext.documentSignature); expect(rebound.sessionIdentity).toBe(newContext.sessionIdentity)
    expect(rebound.scene).toBe(scene); expect(rebound.items).toBe(selection.items); expect(rebound.scopePath).toBe(selection.scopePath)
    expect(selection.documentSignature).toBe(oldContext.documentSignature)
    const treeBefore = { documentSignature: oldContext.documentSignature, scopePath: [], sessionIdentity: {} }
    const treeAfter = { ...treeBefore, documentSignature: newContext.documentSignature, sessionIdentity: {} }
    const tree = { ...treeBefore, treeKey: 'original-plane', binding: 'original-binding' }
    expect(rebindNamedViewSelection(tree, before, after, treeBefore, treeAfter)).toEqual({ ...tree, ...treeAfter })
  })

  it('does not revive stale selection ownership or transfer it across a changed scene, scope or document', () => {
    const before = fixtures()[1], after = withDocumentNamedViews(before, [view()]), scene = {}
    const oldContext = { documentSignature: 'old', scopePath: ['left'], sessionIdentity: {}, scene }
    const newContext = { ...oldContext, documentSignature: 'new', sessionIdentity: {} }
    const selection = { ...oldContext, items: ['original-face'] }
    for (const stale of [
      { ...selection, documentSignature: 'stale' }, { ...selection, sessionIdentity: {} },
      { ...selection, scopePath: ['right'] }, { ...selection, scene: {} },
    ]) expect(rebindNamedViewSelection(stale, before, after, oldContext, newContext)).toBe(stale)
    expect(rebindNamedViewSelection(selection, before, after, oldContext, { ...newContext, scene: {} })).toBe(selection)
    expect(rebindNamedViewSelection(selection, before, after, oldContext, { ...newContext, scopePath: [] })).toBe(selection)
    const unowned = { ...selection, sessionIdentity: null }
    expect(rebindNamedViewSelection(unowned, before, after, unowned, newContext)).toBe(unowned)
    if (after.version !== 2) throw Error('assembly fixture')
    const changed = structuredClone(after); changed.occurrences[0].pose.translation[0]++
    expect(rebindNamedViewSelection(selection, before, changed, oldContext, newContext)).toBe(selection)
  })
})
