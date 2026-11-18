const requiresEncoding = /[^\x20-\x7f]|["\\]/

/** Exact UTF-8 size of one quoted JSON string, without allocating safe ASCII. */
export function jsonStringByteLength(value: string, encoder: TextEncoder): number {
  if (typeof value !== 'string') throw new TypeError('JSON byte counting requires a primitive string.')
  if (!requiresEncoding.test(value)) return value.length + 2
  return encoder.encode(JSON.stringify(value)).byteLength
}
