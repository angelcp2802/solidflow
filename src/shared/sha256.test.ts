import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Bytes } from './sha256'

describe('exact byte SHA-256', () => {
  it.each([0, 1, 55, 56, 63, 64, 65, 127, 128, 1000])('matches an independent implementation across padding boundaries (%i bytes)', (length) => {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 128) % 256)
    const before = bytes.slice()
    expect(sha256Bytes(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'))
    expect(bytes).toEqual(before)
  })

  it('hashes only the view, including zero and non-UTF-8 bytes', () => {
    const buffer = new Uint8Array([7, 7, 0, 128, 255, 0, 7])
    const view = buffer.subarray(2, 6)
    expect(sha256Bytes(view)).toBe(createHash('sha256').update(new Uint8Array([0, 128, 255, 0])).digest('hex'))
    expect(sha256Bytes(view)).not.toBe(createHash('sha256').update(buffer).digest('hex'))
    expect(buffer).toEqual(new Uint8Array([7, 7, 0, 128, 255, 0, 7]))
  })
})
