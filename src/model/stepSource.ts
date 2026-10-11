import { sha256Bytes } from '../shared/sha256'

/** Raw STEP bytes fit below the desktop's 20 MiB document limit after base64. */
export const MAX_STEP_BYTES = 8 * 1024 * 1024
const MAX_BASE64_LENGTH = Math.ceil(MAX_STEP_BYTES / 3) * 4

export interface StepSource {
  format: 'step'
  encoding: 'base64'
  data: string
  sha256: string
}

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`)
}

function encodeBytes(bytes: Uint8Array): string {
  const chunks: string[] = []
  // A bounded spread avoids argument limits on larger files in any renderer.
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
  }
  return btoa(chunks.join(''))
}

function decodeAndValidate(value: unknown, path: string): { source: StepSource; bytes: Uint8Array } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'se esperaba una fuente STEP')
  const input = value as Record<string, unknown>
  const fields = ['format', 'encoding', 'data', 'sha256']
  for (const field of Object.keys(input)) {
    if (!fields.includes(field)) fail(`${path}.${field}`, 'campo desconocido')
  }
  for (const field of fields) {
    if (!Object.hasOwn(input, field)) fail(`${path}.${field}`, 'campo obligatorio')
  }
  if (input.format !== 'step') fail(`${path}.format`, 'formato no compatible')
  if (input.encoding !== 'base64') fail(`${path}.encoding`, 'codificación no compatible')
  const data = input.data
  if (typeof data !== 'string' || data.length === 0 || data.length > MAX_BASE64_LENGTH) {
    fail(`${path}.data`, 'la fuente STEP debe contener entre 1 byte y 8 MiB')
  }
  if (data.length % 4 !== 0) fail(`${path}.data`, 'base64 no canónico')
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
  const byteLength = data.length / 4 * 3 - padding
  if (byteLength < 1 || byteLength > MAX_STEP_BYTES) fail(`${path}.data`, 'la fuente STEP supera 8 MiB')
  // atob tolerates whitespace and non-zero padding bits; require the canonical
  // spelling as well as a successful decode. No text transcoding touches bytes.
  let binary: string
  try {
    binary = atob(data)
  } catch {
    return fail(`${path}.data`, 'base64 no canónico')
  }
  if (btoa(binary) !== data) fail(`${path}.data`, 'base64 no canónico')
  if (typeof input.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(input.sha256)) {
    fail(`${path}.sha256`, 'se esperaba SHA-256 hexadecimal en minúsculas')
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  if (sha256Bytes(bytes) !== input.sha256) fail(`${path}.sha256`, 'el contenido STEP no coincide con su SHA-256')
  return { source: { format: 'step', encoding: 'base64', data, sha256: input.sha256 }, bytes }
}

/** Stores exact bytes, never paths, filenames or runtime native pointers. */
export function createStepSource(bytes: Uint8Array): StepSource {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_STEP_BYTES) {
    fail('STEP', 'la fuente STEP debe contener entre 1 byte y 8 MiB')
  }
  return { format: 'step', encoding: 'base64', data: encodeBytes(bytes), sha256: sha256Bytes(bytes) }
}

/** Structural/integrity validation; Part 21, units and geometry belong to import. */
export function validateStepSource(value: unknown, path = 'STEP'): StepSource {
  return decodeAndValidate(value, path).source
}

/** Returns a newly owned byte view after all structural and integrity checks. */
export function decodeStepSource(value: unknown, path = 'STEP'): Uint8Array {
  return decodeAndValidate(value, path).bytes
}
