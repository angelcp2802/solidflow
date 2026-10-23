import { parseCadDocument, serializeCadDocument, type CadDocument } from './assemblyDocument'

export const CAD_RECOVERY_KEY = 'solidflow.autosave'
export interface CadRecoveryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type CadRecoveryResult =
  | { status: 'recovered'; document: CadDocument; serialized: string }
  | { status: 'missing' | 'invalid' | 'unavailable'; document: null }

/** Read-only recovery: invalid/unavailable data never causes a fallback write. */
export function readCadRecovery(storage: Pick<CadRecoveryStorage, 'getItem'>): CadRecoveryResult {
  let saved: string | null
  try { saved = storage.getItem(CAD_RECOVERY_KEY) } catch { return { status: 'unavailable', document: null } }
  if (saved === null) return { status: 'missing', document: null }
  try {
    const document = parseCadDocument(saved)
    // A routed workspace must also be able to represent the validated document
    // in the bounded canonical save format before it replaces the current one.
    return { status: 'recovered', document, serialized: serializeCadDocument(document) }
  } catch { return { status: 'invalid', document: null } }
}

/** Committed document only. Validate/serialize before touching existing bytes. */
export function writeCadRecovery(storage: Pick<CadRecoveryStorage, 'setItem'>, document: CadDocument): string {
  const serialized = serializeCadDocument(document)
  storage.setItem(CAD_RECOVERY_KEY, serialized)
  return serialized
}
