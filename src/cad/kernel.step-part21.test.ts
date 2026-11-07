import { expect, it } from 'vitest'
import { isStepCall, isStepRef, isStepText, parseStepPart21 } from './kernel.step-part21'

const bytes = (text: string) => new TextEncoder().encode(text)
const file = (data: string, header = "FILE_DESCRIPTION(('Original synthetic syntax'),'2;1');") =>
  bytes(`ISO-10303-21;HEADER;${header}ENDSEC;DATA;${data}ENDSEC;END-ISO-10303-21;`)

it('distinguishes literal strings, enums, references, typed values and nested lists', () => {
  const parsed = parseStepPart21(file("#1=ITEM('literal #2',.ITEM.,#2,3.5E-2,$,*,LENGTH_MEASURE(2.),('nested',#2));#2=OTHER();"))
  expect(parsed.records.get('1')).toEqual({ components: [{ name: 'ITEM', args: [
    { text: 'literal #2' }, '.ITEM.', { ref: '2' }, .035, '$', '*',
    { name: 'LENGTH_MEASURE', args: [2] }, [{ text: 'nested' }, { ref: '2' }],
  ] }], refs: ['2', '2'] })
  const args = parsed.records.get('1')!.components[0].args
  expect(isStepText(args[0])).toBe(true)
  expect(isStepRef(args[0])).toBe(false)
  expect(isStepRef(args[2])).toBe(true)
  expect(isStepCall(args[6])).toBe(true)
  expect(parsed.header[0].args[0]).toEqual([{ text: 'Original synthetic syntax' }])
})

it('preserves apostrophes, UTF-8 names, backslashes and explicit Unicode encodings', () => {
  const parsed = parseStepPart21(file("#1=ITEM('Pieza ''gemela'' ñ Ω','C:\\\\literal','\\X2\\D83DDE0000F1\\X0\\','\\X4\\0001F600000003A9\\X0\\','\\PA\\\\S\\q','\\X\\E9');"))
  expect(parsed.records.get('1')!.components[0].args).toEqual([
    { text: "Pieza 'gemela' ñ Ω" }, { text: 'C:\\literal' },
    { text: '😀ñ' }, { text: '😀Ω' }, { text: 'ñ' }, { text: 'é' },
  ])
})

it('ignores lexical smuggling inside comments and text without adding references or sections', () => {
  const parsed = parseStepPart21(file("/* #999=EXTERNAL(); ENDSEC; DATA; */#1=ITEM('ENDSEC; DATA; #888=DOCUMENT_FILE(); /* text */');"))
  expect([...parsed.records.keys()]).toEqual(['1'])
  expect(parsed.records.get('1')!.refs).toEqual([])
  expect(parsed.records.get('1')!.components[0].args).toEqual([{ text: 'ENDSEC; DATA; #888=DOCUMENT_FILE(); /* text */' }])
})

it('keeps complex components distinct and rejects repeated component names', () => {
  expect(parseStepPart21(file('#1=(FIRST(1.)SECOND(.T.));')).records.get('1')).toEqual({
    components: [{ name: 'FIRST', args: [1] }, { name: 'SECOND', args: ['.T.'] }], refs: [],
  })
  expect(() => parseStepPart21(file('#1=(FIRST()FIRST());'))).toThrow(/duplicados/)
})

it('allows the explicit metadata-ignoring latin1 unit-gate mode without decoding text escapes', () => {
  const source = file("#1=ITEM('legacy \\UNSUPPORTED\\');")
  const legacy = source.slice()
  // Replace the first literal ASCII character with one raw legacy high byte.
  const literalStart = new TextDecoder().decode(legacy).indexOf("'legacy") + 1
  legacy[literalStart] = 0xe9
  expect(() => parseStepPart21(legacy)).toThrow(/UTF-8/)
  expect(parseStepPart21(legacy, { textEncoding: 'latin1' }).records.get('1')!.components[0].args).toEqual([{ text: '' }])
})

it.each([
  "\\X2\\D800\\X0\\", "\\X2\\DC00\\X0\\",
  "\\X2\\D8000041\\X0\\", "\\X2\\123\\X0\\",
  "\\X4\\00110000\\X0\\", "\\X4\\0000D800\\X0\\",
  "\\X2\\0041", "\\X\\GG", "\\PB\\",
])('rejects malformed or unsupported text escape %s', escaped => {
  expect(() => parseStepPart21(file(`#1=ITEM('${escaped}');`))).toThrow(/STEP:/)
})

it.each([
  '#1=ITEM(#2);', '#0=ITEM();', '#1=ITEM();#01=OTHER();',
  '#9007199254740992=ITEM();', '#1=ITEM(1E999);', '#1=();',
  '#1=EXTERNAL_SOURCE();', '#1=DOCUMENT_FILE();', '#1=ITEM("0101");',
])('rejects unsafe or incomplete DATA declarations %s', data => {
  expect(() => parseStepPart21(file(data))).toThrow(/STEP:/)
})

it('rejects actual extra sections, unterminated literals/comments and bounded excessive nesting', () => {
  expect(() => parseStepPart21(bytes(new TextDecoder().decode(file('#1=ITEM();')) + 'DATA;ENDSEC;'))).toThrow(/adicionales/)
  expect(() => parseStepPart21(file("#1=ITEM('not closed);"))).toThrow(/literal/)
  expect(() => parseStepPart21(file('/* not closed'))).toThrow(/comentario/)
  expect(() => parseStepPart21(file(`#1=ITEM(${'('.repeat(34)}1${')'.repeat(34)});`))).toThrow(/profundidad/)
})
