import { expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { decodeStepSource, type StepSource } from './stepSource'
import { importStructuralStep } from './structuralStepImport'
import type { AssemblyDocument } from './assemblyDocument'
import type { StepFile } from './stepImport'

// Symbolic source bytes exercise transactions, not native STEP admission.
function fixture() {
  let current = true
  const bytes = new Uint8Array([1, 2, 3]), document = createAssemblyExample()
  const io = { fresh: () => current, read: vi.fn(async (): Promise<StepFile | null> => ({ name: 'Original.step', data: bytes })),
    prepare: vi.fn(async (_source: StepSource) => document), confirm: vi.fn(async () => true), commit: vi.fn((_document: AssemblyDocument) => undefined) }
  return { io, bytes, document, stale: () => { current = false } }
}
it('owns neutral bytes, validates a detached v2 graph and confirms only after preparation', async () => {
  const h = fixture(), order: string[] = []
  h.io.prepare.mockImplementation(async source => { order.push('prepare'); h.bytes.fill(9); expect(decodeStepSource(source)).toEqual(new Uint8Array([1, 2, 3])); return h.document })
  h.io.confirm.mockImplementation(async () => { order.push('confirm'); return true })
  expect(await importStructuralStep(h.io)).toBe('imported')
  expect(order).toEqual(['prepare', 'confirm'])
  expect(h.io.commit).toHaveBeenCalledTimes(1)
  const accepted = h.io.commit.mock.calls[0][0]
  expect(accepted).toEqual(h.document); expect(accepted).not.toBe(h.document)
  expect(accepted).not.toHaveProperty('path')
})
it('keeps cancellation before reading/preparation and after confirmation free of commits', async () => {
  const h = fixture(); h.stale()
  expect(await importStructuralStep(h.io)).toBe('stale'); expect(h.io.read).not.toHaveBeenCalled()
  const dialog = fixture(); dialog.io.read.mockResolvedValue(null)
  expect(await importStructuralStep(dialog.io)).toBe('cancelled'); expect(dialog.io.prepare).not.toHaveBeenCalled(); expect(dialog.io.commit).not.toHaveBeenCalled()
  const canceled = fixture(); canceled.io.confirm.mockResolvedValue(false)
  expect(await importStructuralStep(canceled.io)).toBe('cancelled'); expect(canceled.io.commit).not.toHaveBeenCalled()
})
it.each(['read', 'prepare', 'confirm'] as const)('withholds replacement when the base changes during %s', async boundary => {
  const h = fixture()
  if (boundary === 'read') h.io.read.mockImplementation(async () => { h.stale(); return { name: 'Original.step', data: h.bytes } })
  if (boundary === 'prepare') h.io.prepare.mockImplementation(async () => { h.stale(); return h.document })
  if (boundary === 'confirm') h.io.confirm.mockImplementation(async () => { h.stale(); return true })
  expect(await importStructuralStep(h.io)).toBe('stale'); expect(h.io.commit).not.toHaveBeenCalled()
  if (boundary === 'read') expect(h.io.prepare).not.toHaveBeenCalled()
  if (boundary !== 'confirm') expect(h.io.confirm).not.toHaveBeenCalled()
})
it('rejects malformed returned documents before asking to discard the current document', async () => {
  const h = fixture(); h.io.prepare.mockResolvedValue({ ...h.document, units: 'inch' } as never)
  await expect(importStructuralStep(h.io)).rejects.toThrow()
  expect(h.io.confirm).not.toHaveBeenCalled(); expect(h.io.commit).not.toHaveBeenCalled()
})
it('does not reinterpret a wrong file extension or worker failure as an empty imported document', async () => {
  const h = fixture(); h.io.read.mockResolvedValue({ name: 'Original.solidflow', data: h.bytes })
  await expect(importStructuralStep(h.io)).rejects.toThrow(/step/); expect(h.io.prepare).not.toHaveBeenCalled()
  const failed = fixture(); failed.io.prepare.mockRejectedValue(Error('Native refusal'))
  await expect(importStructuralStep(failed.io)).rejects.toThrow('Native refusal')
  expect(failed.io.confirm).not.toHaveBeenCalled(); expect(failed.io.commit).not.toHaveBeenCalled()
})
