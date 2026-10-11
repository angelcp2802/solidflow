import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createStepSource, decodeStepSource, MAX_STEP_BYTES, validateStepSource } from './stepSource'

const textSource = (text = 'f') => createStepSource(new TextEncoder().encode(text))

describe('owned STEP bytes', () => {
  it('preserves every byte value with canonical base64 and an independently checked digest', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index)
    const before = bytes.slice()
    const source = createStepSource(bytes)
    expect(source).toEqual({
      format: 'step', encoding: 'base64', data: Buffer.from(bytes).toString('base64'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
    expect(validateStepSource(source)).toEqual(source)
    expect(decodeStepSource(source)).toEqual(before)
    bytes[0] = 99
    const decoded = decodeStepSource(source)
    decoded[1] = 99
    expect(decodeStepSource(source)).toEqual(before)
  })

  it('stores only the supplied byte view and returns detached source objects', () => {
    const bytes = new Uint8Array([0, 65, 255, 66, 0])
    const source = createStepSource(bytes.subarray(1, 4))
    expect(decodeStepSource(source)).toEqual(new Uint8Array([65, 255, 66]))
    const validated = validateStepSource(source)
    validated.data = 'changed'
    expect(source.data).toBe(Buffer.from([65, 255, 66]).toString('base64'))
  })

  it('accepts opaque bytes without pretending structural validation is a STEP geometry read', () => {
    expect(decodeStepSource(createStepSource(new Uint8Array([0, 255, 128])))).toEqual(new Uint8Array([0, 255, 128]))
  })

  it.each([null, [], 'STEP', 123])('rejects a non-object source %s', (value) => {
    expect(() => validateStepSource(value)).toThrow('fuente STEP')
  })

  it.each(['format', 'encoding', 'data', 'sha256'])('requires its own %s field', (field) => {
    const value: Record<string, unknown> = { ...textSource() }
    delete value[field]
    expect(() => validateStepSource(value)).toThrow(`${field}: campo obligatorio`)
    expect(() => validateStepSource(Object.assign(Object.create({ [field]: textSource()[field as keyof ReturnType<typeof textSource>] }), value))).toThrow('campo obligatorio')
  })

  it.each(['path', 'filename', 'url', 'byteLength'])('rejects unknown persisted metadata %s', (field) => {
    expect(() => validateStepSource({ ...textSource(), [field]: 'untrusted' })).toThrow('campo desconocido')
  })

  it('rejects different formats and encodings', () => {
    expect(() => validateStepSource({ ...textSource(), format: 'stl' })).toThrow('format')
    expect(() => validateStepSource({ ...textSource(), encoding: 'utf8' })).toThrow('encoding')
  })

  it.each(['Zg', 'Zg=', 'Zg===', 'Zg==\n', ' Zg==', 'Z h==', 'Zh==', 'Zm9=', 'Zg__', '====', ''])('rejects noncanonical base64 %j', (data) => {
    expect(() => decodeStepSource({ ...textSource(), data })).toThrow('data')
  })

  it('rejects a changed byte, malformed digest and uppercase digest', () => {
    const source = textSource('source bytes')
    expect(() => validateStepSource({ ...source, data: textSource('different bytes').data })).toThrow('no coincide')
    expect(() => validateStepSource({ ...source, sha256: source.sha256.toUpperCase() })).toThrow('minúsculas')
    for (const sha256 of ['', '0'.repeat(63), 'g'.repeat(64), 123, null]) {
      expect(() => validateStepSource({ ...source, sha256 })).toThrow('sha256')
    }
  })

  it('enforces byte limits before decoding data, including the last padded group', () => {
    expect(() => createStepSource(new Uint8Array())).toThrow('1 byte y 8 MiB')
    expect(() => createStepSource(new Uint8Array(MAX_STEP_BYTES + 1))).toThrow('8 MiB')
    const paddedMaximum = Math.ceil(MAX_STEP_BYTES / 3) * 4
    expect(() => decodeStepSource({ ...textSource(), data: 'A'.repeat(paddedMaximum) })).toThrow('supera 8 MiB')
    expect(() => decodeStepSource({ ...textSource(), data: 'A'.repeat(paddedMaximum + 4) })).toThrow('8 MiB')
  })

  it('round trips the actual 8 MiB boundary without changing raw bytes', () => {
    const bytes = new Uint8Array(MAX_STEP_BYTES)
    bytes[0] = 255
    bytes[bytes.length - 1] = 128
    const source = createStepSource(bytes)
    expect(source.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    const decoded = decodeStepSource(source)
    expect(decoded.length).toBe(MAX_STEP_BYTES)
    expect(decoded[0]).toBe(255)
    expect(decoded[decoded.length - 1]).toBe(128)
  }, 15_000)
})
