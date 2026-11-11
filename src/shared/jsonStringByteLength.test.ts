import { expect, it } from 'vitest'
import { jsonStringByteLength } from './jsonStringByteLength'

const oracleEncoder = new TextEncoder()
const nativeLength = (value: string) => oracleEncoder.encode(JSON.stringify(value)).byteLength

it.each([
  ['empty', '', 2],
  ['ordinary ASCII', 'SolidFlow', 11],
  ['DEL', '\x7f', 3],
  ['slash', '/', 3],
  ['quote', '"', 4],
  ['backslash', '\\', 4],
  ['short control escapes', '\b\t\n\f\r', 12],
  ['NUL', '\0', 8],
  ['last JSON control', '\x1f', 8],
  ['two-byte UTF-8', 'é', 4],
  ['three-byte UTF-8', '\u0800', 5],
  ['line and paragraph separators', '\u2028\u2029', 8],
  ['astral character', '\ud83d\ude00', 6],
  ['lone high surrogate', '\ud800', 8],
  ['lone low surrogate', '\udfff', 8],
  ['first surrogate pair', '\ud800\udc00', 6],
  ['last surrogate pair', '\udbff\udfff', 6],
  ['high surrogate followed by a pair', '\ud800\ud800\udc00', 12],
  ['low then high surrogate', '\udc00\ud800', 14],
  ['mixed JSON escapes and Unicode', 'A"\né\ud83d\ude00\ud800Z', 20],
] as const)('counts %s exactly as native JSON and UTF-8', (_label, value, expected) => {
  expect(nativeLength(value)).toBe(expected)
  expect(jsonStringByteLength(value, new TextEncoder())).toBe(expected)
})

it('matches native JSON and UTF-8 for every UTF-16 unit alone and surrounded by ASCII', () => {
  const encoder = new TextEncoder()
  let checked = 0
  for (let unit = 0; unit <= 0xffff; unit++) {
    const character = String.fromCharCode(unit)
    for (const value of [character, 'before' + character + 'after']) {
      const actual = jsonStringByteLength(value, encoder), expected = nativeLength(value)
      if (actual !== expected) throw new Error(`UTF-16 unit ${unit.toString(16)}: ${actual} bytes, expected ${expected}.`)
      checked++
    }
  }
  expect(checked).toBe(131_072)
})

it('counts safe ASCII punctuation and apostrophes as native JSON does', () => {
  const encoder = new TextEncoder()
  for (const value of ['', 'SolidFlow 0123456789', '\x20\x7f/<>&', "apostrophe ' stays literal"]) {
    expect(jsonStringByteLength(value, encoder)).toBe(nativeLength(value))
  }
})

it('keeps counts stable across repeated and alternating ASCII, escapes and Unicode', () => {
  const encoder = new TextEncoder()
  const values = ['é', 'safe ASCII', '"', '\ud800', 'safe again', 'é', '\ud800\udc00', '\\']
  for (const value of values) expect(jsonStringByteLength(value, encoder)).toBe(nativeLength(value))
})

it('rejects nonprimitive strings without reading coercion or serialization hooks', () => {
  let reads = 0
  const executable = Object.create(null), boxed = new String('boxed')
  for (const value of [executable, boxed]) {
    for (const key of [Symbol.toPrimitive, 'toString', 'valueOf', 'toJSON']) {
      Object.defineProperty(value, key, { enumerable: true, get() { reads++; throw new Error('Input hook must not run.') } })
    }
  }
  const encoder = new TextEncoder()
  const values: unknown[] = [null, undefined, false, 0, 1n, Symbol('input'), [], () => 'input', executable, boxed]
  for (const value of values) expect(() => jsonStringByteLength(value as string, encoder)).toThrow(TypeError)
  expect(reads).toBe(0)
})

it('retains exact quoted byte counts immediately below, at and above 20 MiB', () => {
  const encoder = new TextEncoder(), limit = 20 * 1024 * 1024, atLimit = 'A'.repeat(limit - 2)
  for (const [value, expected] of [[atLimit.slice(1), limit - 1], [atLimit, limit], [atLimit + 'A', limit + 1]] as const) {
    expect(nativeLength(value)).toBe(expected)
    expect(jsonStringByteLength(value, encoder)).toBe(expected)
  }
})
