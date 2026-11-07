import { expect, it, vi } from 'vitest'
import { createAssemblyExample } from '../examples/assembly'
import { serializeAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import type { CadExportFormat } from '../cad/kernel.types'
import { canExportAssemblyGeometry, downloadAssemblyGeometry, MAX_ASSEMBLY_DOWNLOAD_BYTES, runAssemblyGeometryExport,
  type AssemblyDownloadEnvironment, type AssemblyExportOperation, type AssemblyExportState } from './assemblyExport'

// Original symbolic bytes and injected async boundaries only. These cases do
// not run a native writer, worker, Electron dialog or browser download.
const fileBytes = [11, 22, 33, 44]
const fileBlob = () => new Blob([Uint8Array.from(fileBytes).buffer])
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function fixture() {
  const document = createAssemblyExample(), signature = serializeAssemblyDocument(document)
  const state: AssemblyExportState = { document, generation: 7, mounted: true, busy: false, draft: false, preview: false, sourceUpdate: false,
    replacing: false, sceneSignature: signature, confirmedSceneSignature: signature }
  const build = vi.fn(async (_document: AssemblyDocument, _format: CadExportFormat) => fileBlob())
  const write = vi.fn(async (_bytes: Uint8Array, _name: string, _format: CadExportFormat): Promise<string | null> => 'symbolic-export.step')
  const download = vi.fn((_bytes: Uint8Array, _name: string, _format: CadExportFormat) => undefined)
  const notify = vi.fn((_message: string, _failure?: boolean) => undefined)
  const setBusy = vi.fn((value: boolean) => { state.busy = value })
  const io: AssemblyExportOperation = { operation: { current: false }, state: () => state, build, write, download, notify, setBusy }
  return { state, io, build, write, download, notify, setBusy }
}
it('exports a detached committed snapshot including hidden declarations without editing the input', async () => {
  const h = fixture(); h.state.document.occurrences[1].visible = false; h.state.document.occurrences[2].suppressed = true
  h.state.sceneSignature = h.state.confirmedSceneSignature = serializeAssemblyDocument(h.state.document)
  const before = serializeAssemblyDocument(h.state.document)
  expect(canExportAssemblyGeometry(h.state)).toBe(true)
  expect(await runAssemblyGeometryExport('step', h.io)).toBe('exported')
  const [snapshot, format] = h.build.mock.calls[0]
  expect(snapshot).not.toBe(h.state.document); expect(serializeAssemblyDocument(snapshot)).toBe(before); expect(format).toBe('step')
  expect(h.write).toHaveBeenCalledWith(Uint8Array.from(fileBytes), snapshot.name, 'step')
  expect(serializeAssemblyDocument(h.state.document)).toBe(before); expect(h.download).not.toHaveBeenCalled()
  expect(h.notify).toHaveBeenLastCalledWith('Geometría del ensamblaje exportada como STEP plano.')
  expect(h.io.operation.current).toBe(false); expect(h.setBusy.mock.calls).toEqual([[true], [false]])
})
it('passes STL bytes and the committed name to the existing file bridge', async () => {
  const h = fixture(); expect(await runAssemblyGeometryExport('stl', h.io)).toBe('exported')
  expect(h.write).toHaveBeenCalledWith(Uint8Array.from(fileBytes), h.state.document.name, 'stl')
  expect(h.notify).toHaveBeenLastCalledWith('Geometría del ensamblaje exportada como STL.')
})
it('uses the browser fallback with the same prepared bytes when no desktop bridge exists', async () => {
  const h = fixture(); h.io.write = undefined
  expect(await runAssemblyGeometryExport('step', h.io)).toBe('exported')
  expect(h.download).toHaveBeenCalledWith(Uint8Array.from(fileBytes), h.state.document.name, 'step')
  expect(h.write).not.toHaveBeenCalled(); expect(h.notify).toHaveBeenLastCalledWith('Geometría del ensamblaje descargada como STEP plano.')
})
it.each(['busy', 'unmounted', 'draft', 'preview', 'source update', 'replacement', 'stale scene', 'missing confirmed scene'])(
  'blocks %s before native work or file output', async reason => {
    const h = fixture()
    if (reason === 'busy') h.state.busy = true
    if (reason === 'unmounted') h.state.mounted = false
    if (reason === 'draft') h.state.draft = true
    if (reason === 'preview') h.state.preview = true
    if (reason === 'source update') h.state.sourceUpdate = true
    if (reason === 'replacement') h.state.replacing = true
    if (reason === 'stale scene') h.state.sceneSignature += '-stale'
    if (reason === 'missing confirmed scene') h.state.confirmedSceneSignature = null
    expect(canExportAssemblyGeometry(h.state)).toBe(false)
    expect(await runAssemblyGeometryExport('step', h.io)).toBe('blocked')
    expect(h.build).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.download).not.toHaveBeenCalled(); expect(h.setBusy).not.toHaveBeenCalled()
  },
)
it('acquires the shared operation gate synchronously and prevents reentrant exports', async () => {
  const h = fixture(), pending = deferred<Blob>(); h.build.mockReturnValue(pending.promise)
  const first = runAssemblyGeometryExport('step', h.io)
  expect(h.io.operation.current).toBe(true); expect(h.state.busy).toBe(true)
  expect(await runAssemblyGeometryExport('stl', h.io)).toBe('blocked'); expect(h.build).toHaveBeenCalledTimes(1)
  pending.resolve(fileBlob()); expect(await first).toBe('exported'); expect(h.write).toHaveBeenCalledTimes(1)
})
it('reports native failure and releases the gate without attempting file output', async () => {
  const h = fixture(), before = serializeAssemblyDocument(h.state.document); h.build.mockRejectedValue(new Error('Symbolic native rejection'))
  expect(await runAssemblyGeometryExport('step', h.io)).toBe('failed')
  expect(h.notify).toHaveBeenLastCalledWith('Symbolic native rejection', true); expect(h.write).not.toHaveBeenCalled(); expect(h.download).not.toHaveBeenCalled()
  expect(h.io.operation.current).toBe(false); expect(h.state.busy).toBe(false); expect(serializeAssemblyDocument(h.state.document)).toBe(before)
})
it('reports Blob read failure before invoking a save dialog', async () => {
  const h = fixture(), blob = fileBlob(); blob.arrayBuffer = async () => { throw new Error('Symbolic Blob read rejection') }; h.build.mockResolvedValue(blob)
  expect(await runAssemblyGeometryExport('stl', h.io)).toBe('failed')
  expect(h.notify).toHaveBeenLastCalledWith('Symbolic Blob read rejection', true); expect(h.write).not.toHaveBeenCalled(); expect(h.state.busy).toBe(false)
})
it('reports write failure without changing the committed document or claiming success', async () => {
  const h = fixture(), before = serializeAssemblyDocument(h.state.document); h.write.mockRejectedValue(new Error('Symbolic atomic-write rejection'))
  expect(await runAssemblyGeometryExport('step', h.io)).toBe('failed')
  expect(h.notify).toHaveBeenLastCalledWith('Symbolic atomic-write rejection', true); expect(h.download).not.toHaveBeenCalled()
  expect(serializeAssemblyDocument(h.state.document)).toBe(before); expect(h.state.busy).toBe(false)
})
it('reports dialog cancellation clearly and keeps the document unchanged', async () => {
  const h = fixture(), before = serializeAssemblyDocument(h.state.document); h.write.mockResolvedValue(null)
  expect(await runAssemblyGeometryExport('step', h.io)).toBe('cancelled')
  expect(h.notify).toHaveBeenLastCalledWith('Exportación STEP plano cancelada.'); expect(h.download).not.toHaveBeenCalled()
  expect(serializeAssemblyDocument(h.state.document)).toBe(before); expect(h.io.operation.current).toBe(false)
})
it.each(['document', 'generation', 'draft', 'preview', 'source update', 'replacement', 'scene'])(
  'rejects stale %s after native await and before reading bytes or opening a save dialog', async change => {
    const h = fixture(), pending = deferred<Blob>(), blob = fileBlob(), read = vi.fn(blob.arrayBuffer.bind(blob)); blob.arrayBuffer = read
    h.build.mockReturnValue(pending.promise); const exporting = runAssemblyGeometryExport('step', h.io)
    if (change === 'document') h.state.document.name = 'Changed committed source'
    if (change === 'generation') h.state.generation++
    if (change === 'draft') h.state.draft = true
    if (change === 'preview') h.state.preview = true
    if (change === 'source update') h.state.sourceUpdate = true
    if (change === 'replacement') h.state.replacing = true
    if (change === 'scene') h.state.confirmedSceneSignature = null
    pending.resolve(blob); expect(await exporting).toBe('stale')
    expect(read).not.toHaveBeenCalled(); expect(h.write).not.toHaveBeenCalled(); expect(h.download).not.toHaveBeenCalled()
    expect(h.notify.mock.calls).toEqual([['Preparando exportación STEP plano…']])
    if (change === 'generation') expect(h.setBusy.mock.calls).toEqual([[true]])
  },
)
it.each(['document', 'unmount'])(
  'rejects %s after Blob read await and before file output', async change => {
    const h = fixture(), pending = deferred<ArrayBuffer>(), started = deferred<void>(), blob = fileBlob()
    blob.arrayBuffer = () => { started.resolve(); return pending.promise }; h.build.mockResolvedValue(blob)
    const exporting = runAssemblyGeometryExport('stl', h.io); await started.promise
    if (change === 'document') h.state.document.occurrences[1].name = 'Changed during read'
    else { h.state.mounted = false; h.state.generation++ }
    pending.resolve(Uint8Array.from(fileBytes).buffer); expect(await exporting).toBe('stale')
    expect(h.write).not.toHaveBeenCalled(); expect(h.download).not.toHaveBeenCalled()
    expect(h.notify.mock.calls).toEqual([['Preparando exportación STL…']])
  },
)
it('ignores a native reply after unmount without updating the detached UI', async () => {
  const h = fixture(), pending = deferred<Blob>(); h.build.mockReturnValue(pending.promise)
  const exporting = runAssemblyGeometryExport('step', h.io); h.state.mounted = false; h.state.generation++
  pending.resolve(fileBlob()); expect(await exporting).toBe('stale')
  expect(h.write).not.toHaveBeenCalled(); expect(h.setBusy.mock.calls).toEqual([[true]])
})
it('holds the gate through the joined dialog/write and ignores completion after unmount without claiming rollback', async () => {
  const h = fixture(), pending = deferred<string | null>(), started = deferred<void>()
  h.write.mockImplementation(() => { started.resolve(); return pending.promise })
  const exporting = runAssemblyGeometryExport('step', h.io); await started.promise
  expect(h.io.operation.current).toBe(true); expect(h.state.busy).toBe(true)
  h.state.mounted = false; h.state.generation++; pending.resolve('symbolic-already-issued.step')
  expect(await exporting).toBe('stale'); expect(h.write).toHaveBeenCalledTimes(1)
  expect(h.notify.mock.calls).toEqual([['Preparando exportación STEP plano…']]); expect(h.setBusy.mock.calls).toEqual([[true]])
})
it.each(['empty', 'oversized', 'incomplete', 'invalid buffer'])(
  'rejects %s output without passing bytes to a file writer', async kind => {
    const h = fixture(), blob = fileBlob()
    if (kind === 'empty') Object.defineProperty(blob, 'size', { value: 0 })
    if (kind === 'oversized') Object.defineProperty(blob, 'size', { value: MAX_ASSEMBLY_DOWNLOAD_BYTES + 1 })
    if (kind === 'incomplete') blob.arrayBuffer = async () => new ArrayBuffer(2)
    if (kind === 'invalid buffer') blob.arrayBuffer = async () => null as unknown as ArrayBuffer
    h.build.mockResolvedValue(blob); expect(await runAssemblyGeometryExport('step', h.io)).toBe('failed')
    expect(h.write).not.toHaveBeenCalled(); expect(h.download).not.toHaveBeenCalled(); expect(h.state.busy).toBe(false)
  },
)
function browserFixture() {
  const link = { href: '', download: '', click: vi.fn() }, callbacks: Array<() => void> = []
  const environment: AssemblyDownloadEnvironment = { createObjectURL: vi.fn(() => 'blob:symbolic-owned-url'), revokeObjectURL: vi.fn(),
    createLink: () => link, schedule: vi.fn((callback, milliseconds) => { expect(milliseconds).toBe(2000); callbacks.push(callback) }) }
  return { link, callbacks, environment }
}
it('releases a browser URL after the click and uses the exact file bytes and extension', async () => {
  const h = browserFixture(); downloadAssemblyGeometry(Uint8Array.from(fileBytes), 'Original export', 'stl', h.environment)
  expect(h.link).toMatchObject({ href: 'blob:symbolic-owned-url', download: 'Original export.stl' }); expect(h.link.click).toHaveBeenCalledTimes(1)
  const blob = vi.mocked(h.environment.createObjectURL).mock.calls[0][0]
  expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual(fileBytes); expect(blob.type).toBe('model/stl')
  expect(h.environment.revokeObjectURL).not.toHaveBeenCalled(); expect(h.callbacks).toHaveLength(1)
  h.callbacks[0](); expect(h.environment.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:symbolic-owned-url')
})
it('releases a browser URL immediately when the click fails', () => {
  const h = browserFixture(); h.link.click.mockImplementation(() => { throw new Error('Symbolic click rejection') })
  expect(() => downloadAssemblyGeometry(Uint8Array.from(fileBytes), 'Original export', 'step', h.environment)).toThrow('click rejection')
  expect(h.environment.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:symbolic-owned-url'); expect(h.callbacks).toHaveLength(0)
})
it('releases a browser URL if scheduling its release fails', () => {
  const h = browserFixture(); h.environment.schedule = () => { throw new Error('Symbolic timer rejection') }
  expect(() => downloadAssemblyGeometry(Uint8Array.from(fileBytes), 'Original export', 'step', h.environment)).toThrow('timer rejection')
  expect(h.environment.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:symbolic-owned-url')
})
it('rejects an empty browser download before allocating a URL', () => {
  const h = browserFixture(); expect(() => downloadAssemblyGeometry(new Uint8Array(), 'Original export', 'step', h.environment)).toThrow('vacía')
  expect(h.environment.createObjectURL).not.toHaveBeenCalled(); expect(h.link.click).not.toHaveBeenCalled()
})

it('exports structured STEP through the explicit producer but keeps the existing STEP file bridge', async () => {
  const h=fixture(), buildStructured=vi.fn(async()=>fileBlob());h.io.buildStructured=buildStructured
  expect(await runAssemblyGeometryExport('step-assembly',h.io)).toBe('exported')
  expect(buildStructured).toHaveBeenCalledTimes(1);expect(h.build).not.toHaveBeenCalled()
  expect(h.write).toHaveBeenCalledWith(Uint8Array.from(fileBytes),h.state.document.name,'step')
  expect(h.notify).toHaveBeenLastCalledWith('Geometría del ensamblaje exportada como STEP estructurado.')
})
it('withholds structured export writes when producer is missing or the committed generation changes', async () => {
  const unavailable=fixture();expect(await runAssemblyGeometryExport('step-assembly',unavailable.io)).toBe('failed');expect(unavailable.write).not.toHaveBeenCalled()
  const h=fixture();h.io.buildStructured=async()=>{h.state.generation++;return fileBlob()}
  expect(await runAssemblyGeometryExport('step-assembly',h.io)).toBe('stale');expect(h.write).not.toHaveBeenCalled();expect(h.download).not.toHaveBeenCalled()
})
