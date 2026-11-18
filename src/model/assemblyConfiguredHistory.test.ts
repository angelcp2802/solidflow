import { describe, expect, it } from 'vitest'
import { AssemblyConfiguredDocumentHistory, DEFAULT_ASSEMBLY_CONFIGURED_HISTORY_STATES, MAX_ASSEMBLY_CONFIGURED_HISTORY_STATES } from './assemblyConfiguredHistory'
import { createAssemblyConfiguredDocument, serializeAssemblyConfiguredDocument, type AssemblyConfiguredDocument } from './assemblyConfiguredDocument'
import { assemblyConfigurationCoreFixture } from './assemblyConfigurationCore.test-utils'
import type { AssemblyAxisReference, EmbeddedAssemblyDefinition } from './assemblyDocument'

function fixture(): AssemblyConfiguredDocument {
 const { document, catalog } = assemblyConfigurationCoreFixture()
 const owner = document.definitions.find(d => d.id === 'configuration-S') as EmbeddedAssemblyDefinition
 // Original declaration-only locators exercise persistence/history; these keys
 // do not assert real native cylindrical membership or fresh capture authority.
 const axis = (id: 'a' | 'b'): AssemblyAxisReference => ({ kind: 'face', component: { occurrencePath: [id], definition: { id: id === 'a' ? 'configuration-A' : 'configuration-B', revision: 'r1' } }, body: null, face: { sourceFeatureId: 'solid', key: 'face-v1|UNATTESTED-configured-history-axis' }, support: 'axis' })
 owner.mates = [{ id: 'screw-history', name: 'Original authored screw history', type: 'screw', suppressed: true,
  first: axis('a'), second: axis('b'), alignment: 'aligned', lead: 2, reverse: false,
  neutralRotation: [0, 0, 0, 1], neutralTravel: 3, angle: 2 * Math.PI }]
 catalog[1].configurations[0].mates = [{ mateId: 'screw-history', suppressed: false,
  capture: { type: 'screw', neutralRotation: [0, 0, 1, 0], neutralTravel: 9, angle: 4 * Math.PI } }]
 catalog[1].configurations[1].mates = [{ mateId: 'screw-history', suppressed: true,
  capture: { type: 'screw', neutralRotation: [0, 0, 0, 1], neutralTravel: 13, angle: 6 * Math.PI } }]
 return createAssemblyConfiguredDocument(document, catalog, 'mixed')
}
const sourceOwner = (value: AssemblyConfiguredDocument) => value.source.definitions.find(d => d.id === 'configuration-S') as EmbeddedAssemblyDefinition
const signature = (value: AssemblyConfiguredDocument) => serializeAssemblyConfiguredDocument(value)

describe('complete configured document history', () => {
 it('commits source, named catalog and selected root atomically through Undo/Redo', () => {
  const initial = fixture(), history = new AssemblyConfiguredDocumentHistory(initial), before = signature(initial), next = structuredClone(initial)
  sourceOwner(next).occurrences[1].pose.translation = [12, 0, 0]
  next.catalog[1].configurations[0].occurrences[0].pose!.translation = [6, 0, 0]
  next.rootConfiguration = 'both-compact'
  const expected = signature(next), committed = history.commitDocument(next)
  expect(signature(committed)).toBe(expected); expect(history.canUndo).toBe(true); expect(history.canRedo).toBe(false)
  expect(signature(history.undo())).toBe(before); expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(true)
  expect(signature(history.redo())).toBe(expected); expect(history.canRedo).toBe(false)
  expect(signature(initial)).toBe(before)
 })
 it('retains base and named mechanical captures plus dormant state exactly', () => {
  const initial = fixture(), history = new AssemblyConfiguredDocumentHistory(initial), next = structuredClone(initial), dormant = structuredClone(initial.catalog[1].configurations[1])
  const baseMate = sourceOwner(next).mates[0]
  if (baseMate.type !== 'screw') throw Error('screw fixture')
  baseMate.angle = 8 * Math.PI
  const named = next.catalog[1].configurations[0].mates[0].capture
  if (named?.type !== 'screw') throw Error('named capture')
  named.angle = 10 * Math.PI
  const committed = history.commitDocument(next)
  expect(sourceOwner(committed).mates[0]).toEqual(baseMate)
  expect(committed.catalog[1].configurations[0].mates[0].capture).toEqual({ type: 'screw', neutralRotation: [0, 0, 1, 0], neutralTravel: 9, angle: 10 * Math.PI })
  expect(committed.catalog[1].configurations[1]).toEqual(dormant)
  expect(signature(history.undo())).toBe(signature(initial)); expect(signature(history.redo())).toBe(signature(next))
 })
 it('never aliases constructor inputs, commits or values returned by current/Undo/Redo/reset', () => {
  const initial = fixture(), saved = signature(initial), history = new AssemblyConfiguredDocumentHistory(initial)
  initial.source.name = 'external mutation'; initial.catalog[1].configurations[0].occurrences[0].pose!.translation[0] = 999
  expect(signature(history.current)).toBe(saved)
  const next = history.current; next.rootConfiguration = null
  const expected = signature(next), result = history.commitDocument(next)
  next.catalog.length = 0; result.source.name = 'returned mutation'; result.rootConfiguration = 'single-right'
  const current = history.current; current.catalog.length = 0
  expect(signature(history.current)).toBe(expected)
  const undone = history.undo(); undone.source.name = 'undo mutation'
  expect(signature(history.current)).toBe(saved)
  const redone = history.redo(); redone.catalog.length = 0
  expect(signature(history.current)).toBe(expected)
  const replacement = fixture(), resetSignature = signature(replacement), reset = history.reset(replacement)
  replacement.source.name = 'reset input mutation'; reset.catalog.length = 0
  expect(signature(history.current)).toBe(resetSignature)
 })
 it('does not clear a Redo branch for a normalized no-op commit', () => {
  const history = new AssemblyConfiguredDocumentHistory(fixture()), original = history.current, next = history.current
  next.rootConfiguration = null; history.commitDocument(next); history.undo()
  history.commitDocument(structuredClone(original))
  expect(history.canRedo).toBe(true); expect(history.redo().rootConfiguration).toBeNull()
 })
 it('invalid commit and reset preserve present, past and future without executing accessors', () => {
  const history = new AssemblyConfiguredDocumentHistory(fixture()), next = history.current
  next.rootConfiguration = null; history.commitDocument(next); history.undo()
  const before = signature(history.current); let reads = 0
  const executable = history.current
  Object.defineProperty(executable, 'catalog', { enumerable: true, get() { reads++; return [] } })
  expect(() => history.commitDocument(executable)).toThrow(); expect(() => history.reset(executable)).toThrow(); expect(reads).toBe(0)
  const invalid = history.current; invalid.rootConfiguration = 'missing-configuration'
  expect(() => history.commitDocument(invalid)).toThrow(); expect(() => history.reset(invalid)).toThrow()
  expect(signature(history.current)).toBe(before); expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(true)
  expect(history.redo().rootConfiguration).toBeNull()
 })
 it('rejects an over20MiB complete state atomically before replacing history data', () => {
  const history = new AssemblyConfiguredDocumentHistory(fixture()), next = history.current, before = signature(next)
  next.source.name = 'x'.repeat(20 * 1024 * 1024 + 1)
  expect(() => history.commitDocument(next)).toThrow(); expect(() => history.reset(next)).toThrow()
  expect(signature(history.current)).toBe(before); expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(false)
 })
 it('bounds present/past/future together and discards Redo only after a valid new branch', () => {
  const history = new AssemblyConfiguredDocumentHistory(fixture(), 3)
  for (let i = 1; i <= 3; i++) { const next = history.current; next.source.name = 'state-' + i; history.commitDocument(next) }
  expect(history.undo().source.name).toBe('state-2'); expect(history.undo().source.name).toBe('state-1')
  expect(history.canUndo).toBe(false); expect(history.undo().source.name).toBe('state-1')
  expect(history.redo().source.name).toBe('state-2')
  const branch = history.current; branch.source.name = 'branch'; history.commitDocument(branch)
  expect(history.canRedo).toBe(false); expect(history.undo().source.name).toBe('state-2'); expect(history.undo().source.name).toBe('state-1')
 })
 it('uses a default and maximum of100 retained states', () => {
  expect(DEFAULT_ASSEMBLY_CONFIGURED_HISTORY_STATES).toBe(100); expect(MAX_ASSEMBLY_CONFIGURED_HISTORY_STATES).toBe(100)
  const history = new AssemblyConfiguredDocumentHistory(fixture())
  for (let i = 1; i <= 100; i++) { const next = history.current; next.source.name = 'bounded-' + i; history.commitDocument(next) }
  for (let i = 0; i < 99; i++) history.undo()
  expect(history.current.source.name).toBe('bounded-1'); expect(history.canUndo).toBe(false)
 })
 it('supports a one-state history and reset clears both branches', () => {
  const history = new AssemblyConfiguredDocumentHistory(fixture(), 1), next = history.current
  next.rootConfiguration = null; history.commitDocument(next)
  expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(false)
  const result = history.reset(fixture()); expect(result.rootConfiguration).toBe('mixed'); expect(history.canUndo).toBe(false); expect(history.canRedo).toBe(false)
 })
 it.each([0, -1, 101, 1.5, NaN, Infinity])('rejects invalid history state limit %s', limit => {
  expect(() => new AssemblyConfiguredDocumentHistory(fixture(), limit)).toThrow()
 })
 it('does not accept generation, preview tokens or detached native reports as persisted history fields', () => {
  const initial = fixture()
  expect(() => new AssemblyConfiguredDocumentHistory({ ...initial, generation: 1 } as AssemblyConfiguredDocument)).toThrow()
  expect(() => new AssemblyConfiguredDocumentHistory({ ...initial, token: 'unattested' } as AssemblyConfiguredDocument)).toThrow()
  const history = new AssemblyConfiguredDocumentHistory(initial)
  expect(() => history.commitDocument({ ...initial, verification: { accepted: true } } as AssemblyConfiguredDocument)).toThrow()
  expect(signature(history.current)).toBe(signature(initial))
 })
})
