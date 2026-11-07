import { serializeAssemblyDocument, validateAssemblyDocument, type AssemblyDocument } from '../model/assemblyDocument'
import type { CadExportFormat } from '../cad/kernel.types'

/** Matches the existing geometry file bridge; not a native peak-memory limit. */
export const MAX_ASSEMBLY_DOWNLOAD_BYTES = 256 * 1024 * 1024
export type AssemblyUiExportFormat = CadExportFormat | 'step-assembly'
export interface AssemblyExportState {
  document: AssemblyDocument
  generation: number
  mounted: boolean
  busy: boolean
  draft: boolean
  preview: boolean
  sourceUpdate: boolean
  replacing: boolean
  sceneSignature: string
  confirmedSceneSignature: string | null
}
function confirmed(state: AssemblyExportState, signature: string): boolean {
  return state.mounted && !state.draft && !state.preview && !state.sourceUpdate && !state.replacing
    && state.sceneSignature === signature && state.confirmedSceneSignature === signature
}
/** Saved/dirty state is deliberately not an eligibility condition. */
export function canExportAssemblyGeometry(state: AssemblyExportState): boolean {
  if (state.busy) return false
  try { return confirmed(state, serializeAssemblyDocument(state.document)) }
  catch { return false }
}
export interface AssemblyExportOperation {
  operation: { current: boolean }
  state: () => AssemblyExportState
  setBusy: (busy: boolean) => void
  notify: (message: string, failure?: boolean) => void
  build: (document: AssemblyDocument, format: CadExportFormat) => Promise<Blob>
  buildStructured?: (document: AssemblyDocument) => Promise<Blob>
  write?: (bytes: Uint8Array, name: string, format: CadExportFormat) => Promise<string | null>
  download: (bytes: Uint8Array, name: string, format: CadExportFormat) => void
}
export type AssemblyExportOutcome = 'blocked' | 'stale' | 'exported' | 'cancelled' | 'failed'

/** Read-only transaction: no history, document, preview or recovery mutation. */
export async function runAssemblyGeometryExport(format: AssemblyUiExportFormat, io: AssemblyExportOperation): Promise<AssemblyExportOutcome> {
  const start = io.state()
  if (io.operation.current || !canExportAssemblyGeometry(start)) return 'blocked'
  // Acquire before the first await (and before calling any injected callback).
  io.operation.current = true
  const generation = start.generation, label = format === 'step-assembly' ? 'STEP estructurado' : format === 'step' ? 'STEP plano' : 'STL'
  const bridgeFormat: CadExportFormat = format === 'step-assembly' ? 'step' : format
  let signature = ''
  const fresh = () => {
    try {
      const state = io.state()
      return io.operation.current && state.generation === generation && confirmed(state, signature)
        && serializeAssemblyDocument(state.document) === signature
    } catch { return false }
  }
  try {
    const snapshot = validateAssemblyDocument(start.document)
    signature = serializeAssemblyDocument(snapshot)
    io.setBusy(true); io.notify(`Preparando exportación ${label}…`)
    if (!fresh()) return 'stale'
    if (format === 'step-assembly' && !io.buildStructured) throw new Error('La exportación STEP estructurada no está disponible.')
    const blob = await (format === 'step-assembly' ? io.buildStructured!(snapshot) : io.build(snapshot, format))
    if (!fresh()) return 'stale'
    if (!blob || !Number.isSafeInteger(blob.size) || blob.size <= 0 || blob.size > MAX_ASSEMBLY_DOWNLOAD_BYTES || typeof blob.arrayBuffer !== 'function') {
      throw new Error('La exportación está vacía o supera 256 MiB.')
    }
    const buffer = await blob.arrayBuffer()
    if (!fresh()) return 'stale'
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== blob.size || !buffer.byteLength || buffer.byteLength > MAX_ASSEMBLY_DOWNLOAD_BYTES) {
      throw new Error('Los bytes de la exportación están incompletos o superan 256 MiB.')
    }
    const bytes = new Uint8Array(buffer)
    if (io.write) {
      // The bridge owns dialog + atomic write. Once issued, that IPC cannot be
      // retracted here; the shared operation gate stays held until it settles.
      const target = await io.write(bytes, snapshot.name, bridgeFormat)
      if (!fresh()) return 'stale'
      if (target === null) { io.notify(`Exportación ${label} cancelada.`); return 'cancelled' }
      io.notify(`Geometría del ensamblaje exportada como ${label}.`)
    } else {
      io.download(bytes, snapshot.name, bridgeFormat)
      if (!fresh()) return 'stale'
      io.notify(`Geometría del ensamblaje descargada como ${label}.`)
    }
    return 'exported'
  } catch (reason) {
    if (!fresh()) return 'stale'
    io.notify(reason instanceof Error ? reason.message : 'No se pudo exportar la geometría del ensamblaje.', true)
    return 'failed'
  } finally {
    // A late export must not release a newer operation or update an unmounted UI.
    const state = io.state()
    if (state.generation === generation) {
      io.operation.current = false
      if (state.mounted) io.setBusy(false)
    }
  }
}

export interface AssemblyDownloadEnvironment {
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  createLink: () => { href: string; download: string; click: () => void }
  schedule: (callback: () => void, milliseconds: number) => void
}
/** Own one bounded file Blob and release its temporary browser URL. */
export function downloadAssemblyGeometry(bytes: Uint8Array, name: string, format: CadExportFormat, environment: AssemblyDownloadEnvironment = {
  createObjectURL: blob => URL.createObjectURL(blob), revokeObjectURL: url => URL.revokeObjectURL(url),
  createLink: () => window.document.createElement('a'), schedule: (callback, milliseconds) => { setTimeout(callback, milliseconds) },
}): void {
  if (!bytes.byteLength || bytes.byteLength > MAX_ASSEMBLY_DOWNLOAD_BYTES) throw new Error('La exportación está vacía o supera 256 MiB.')
  const blob = new Blob([bytes.slice().buffer], { type: format === 'step' ? 'application/step' : 'model/stl' })
  const url = environment.createObjectURL(blob)
  try {
    const link = environment.createLink(); link.href = url; link.download = name + '.' + format; link.click()
    environment.schedule(() => environment.revokeObjectURL(url), 2000)
  } catch (reason) { environment.revokeObjectURL(url); throw reason }
}
