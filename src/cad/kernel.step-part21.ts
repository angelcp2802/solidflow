/** Bounded Part 21 syntax, not an EXPRESS or geometry validator. */
const MAX_TOKENS = 600_000, MAX_RECORDS = 100_000, MAX_DEPTH = 32;
const MAX_BYTES = 8 * 1024 * 1024;
type Token = { kind: 'word' | 'ref' | 'number' | 'enum' | 'string' | 'punct'; text: string };
export type StepRef = { ref: string };
export type StepText = { text: string };
export type StepCall = { name: string; args: StepValue[] };
export type StepValue = StepRef | StepText | StepCall | StepValue[] | number | string;
export type StepRecord = { components: StepCall[]; refs: string[] };
function invalid(message: string): never { throw new Error(`STEP: ${message}`); }
export function isStepRef(value: StepValue | undefined): value is StepRef {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'ref' in value;
}
export function isStepCall(value: StepValue | undefined): value is StepCall {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'name' in value;
}
export function isStepText(value: StepValue | undefined): value is StepText {
  return !!value && typeof value === 'object' && !Array.isArray(value) && 'text' in value;
}

/** ASCII escapes and the writer's UTF-8 literals; unsupported code pages fail closed. */
function literal(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length;) {
    if (raw[i] !== '\\') { out += raw[i++]; continue; }
    if (raw[i + 1] === '\\') { out += '\\'; i += 2; continue; }
    if (raw.startsWith('\\PA\\', i)) { i += 4; continue; }
    if (raw.startsWith('\\S\\', i) && i + 3 < raw.length) {
      const code = raw.charCodeAt(i + 3);
      if (code < 32 || code > 126) invalid('escape de página A no válido.');
      out += String.fromCharCode(code + 128); i += 4; continue;
    }
    if (raw.startsWith('\\X\\', i)) {
      const hex = raw.slice(i + 3, i + 5);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) invalid('escape hexadecimal no válido.');
      out += String.fromCharCode(parseInt(hex, 16)); i += 5; continue;
    }
    const width = raw.startsWith('\\X2\\', i) ? 4 : raw.startsWith('\\X4\\', i) ? 8 : 0;
    if (!width) invalid('escape de texto no admitido.');
    const end = raw.indexOf('\\X0\\', i + 4), hex = raw.slice(i + 4, end);
    if (end < 0 || !hex.length || hex.length % width || !/^[0-9A-Fa-f]+$/.test(hex)) invalid('escape Unicode no válido.');
    let decoded = '';
    for (let offset = 0; offset < hex.length; offset += width) {
      const code = parseInt(hex.slice(offset, offset + width), 16);
      if (width === 8 && (code > 0x10ffff || code >= 0xd800 && code <= 0xdfff)) invalid('punto Unicode no válido.');
      decoded += width === 4 ? String.fromCharCode(code) : String.fromCodePoint(code);
    }
    // X2 uses UTF-16 code units; lone surrogates must not survive save/reopen.
    for (let j = 0; j < decoded.length; j++) {
      const code = decoded.charCodeAt(j);
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = decoded.charCodeAt(++j);
        if (!(low >= 0xdc00 && low <= 0xdfff)) invalid('par sustituto Unicode incompleto.');
      } else if (code >= 0xdc00 && code <= 0xdfff) invalid('par sustituto Unicode incompleto.');
    }
    out += decoded; i = end + 4;
  }
  return out;
}

function tokenize(text: string, preserveText: boolean): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < text.length;) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) invalid('comentario sin cerrar.');
      i = end + 2; continue;
    }
    if (text[i] === "'" || text[i] === '"') {
      const quote = text[i++]; let closed = false, raw = '';
      if (quote === '"' && preserveText) invalid('literales binarios no admitidos en el perfil estructural.');
      while (i < text.length) {
        const character = text[i++];
        if (character !== quote) { raw += character; continue; }
        if (quote === "'" && text[i] === quote) { raw += quote; i++; continue; }
        closed = true; break;
      }
      if (!closed) invalid('literal sin cerrar.');
      tokens.push({ kind: 'string', text: preserveText ? literal(raw) : '' });
    } else {
      const tail = text.slice(i), match = /^(#[0-9]+|\.[A-Za-z_][A-Za-z_0-9]*\.|[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[Ee][+-]?[0-9]+)?|[A-Za-z_][A-Za-z_0-9-]*|[()=,;*$])/.exec(tail);
      if (!match) invalid('símbolo o sección no admitidos.');
      const value = match[0]; i += value.length;
      const kind = value[0] === '#' ? 'ref' : /^[A-Za-z_]/.test(value) ? 'word' : /^\.[A-Za-z_]/.test(value) ? 'enum'
        : /^[+\-0-9.]/.test(value) ? 'number' : 'punct';
      tokens.push({ kind, text: value.toUpperCase() });
    }
    if (tokens.length > MAX_TOKENS) invalid('supera el límite de 600.000 tokens.');
  }
  return tokens;
}
function reference(token: Token): string {
  const number = Number(token.text.slice(1));
  if (!Number.isSafeInteger(number) || number < 1) invalid('identificador de entidad no válido.');
  return String(number);
}

/** latin1 is a metadata-ignoring compatibility mode for the existing unit gate. */
export function parseStepPart21(bytes: Uint8Array, options: { textEncoding?: 'utf8' | 'latin1' } = {}): { records: Map<string, StepRecord>; header: StepCall[] } {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BYTES) invalid('el archivo debe contener entre 1 byte y 8 MiB.');
  const preserveText = options.textEncoding !== 'latin1';
  let text: string;
  try { text = new TextDecoder(preserveText ? 'utf-8' : 'latin1', { fatal: preserveText }).decode(bytes); }
  catch { return invalid('texto UTF-8 no válido; usa ASCII con escapes Part 21 o UTF-8.'); }
  const tokens = tokenize(text, preserveText), records = new Map<string, StepRecord>(), header: StepCall[] = []; let index = 0;
  const next = () => tokens[index++];
  const expect = (text: string) => { if (next()?.text !== text) invalid(`estructura Part 21 no admitida; se esperaba ${text}.`); };
  const value = (depth: number, refs: string[]): StepValue => {
    if (depth > MAX_DEPTH) invalid('supera la profundidad máxima de 32.');
    const token = next(); if (!token) invalid('archivo incompleto.');
    if (token.kind === 'ref') { const ref = reference(token); refs.push(ref); return { ref }; }
    if (token.kind === 'number') { const n = Number(token.text); if (!Number.isFinite(n)) invalid('número no finito.'); return n; }
    if (token.kind === 'string') return { text: token.text };
    if (token.kind === 'enum' || token.text === '$' || token.text === '*') return token.text;
    if (token.text === '(') return args(depth + 1, refs);
    if (token.kind === 'word') { expect('('); return { name: token.text, args: args(depth + 1, refs) }; }
    return invalid('parámetro Part 21 no admitido.');
  };
  const args = (depth: number, refs: string[]): StepValue[] => {
    if (depth > MAX_DEPTH) invalid('supera la profundidad máxima de 32.');
    const out: StepValue[] = [];
    if (tokens[index]?.text === ')') { index++; return out; }
    while (true) {
      out.push(value(depth, refs));
      const separator = next()?.text;
      if (separator === ')') return out;
      if (separator !== ',') invalid('lista Part 21 no válida.');
    }
  };
  expect('ISO-10303-21'); expect(';'); expect('HEADER'); expect(';');
  while (tokens[index]?.text !== 'ENDSEC') {
    if (tokens[index]?.kind !== 'word') invalid('cabecera Part 21 no válida.');
    const item = value(0, []); if (!isStepCall(item)) invalid('cabecera Part 21 no válida.');
    header.push(item); expect(';');
  }
  expect('ENDSEC'); expect(';'); expect('DATA'); expect(';');
  while (tokens[index]?.text !== 'ENDSEC') {
    const idToken = next(); if (idToken?.kind !== 'ref') invalid('se requiere una entidad DATA o ENDSEC.');
    const id = reference(idToken); if (records.has(id)) invalid('identificadores de entidad duplicados.');
    expect('='); const components: StepCall[] = [], refs: string[] = [];
    if (tokens[index]?.text === '(') {
      index++;
      while (tokens[index]?.text !== ')') {
        const component = value(0, refs); if (!isStepCall(component)) invalid('entidad compleja no válida.');
        components.push(component);
      }
      expect(')');
    } else {
      const component = value(0, refs); if (!isStepCall(component)) invalid('entidad no válida.');
      components.push(component);
    }
    if (!components.length || new Set(components.map(c => c.name)).size !== components.length) invalid('componentes vacíos o duplicados.');
    if (components.some(c => c.name.includes('EXTERNAL') || c.name === 'DOCUMENT_FILE')) invalid('las referencias a archivos externos no están admitidas.');
    expect(';'); records.set(id, { components, refs });
    if (records.size > MAX_RECORDS) invalid('supera el límite de 100.000 entidades.');
  }
  expect('ENDSEC'); expect(';'); expect('END-ISO-10303-21'); expect(';');
  if (index !== tokens.length) invalid('secciones adicionales no admitidas.');
  for (const record of records.values()) for (const ref of record.refs) if (!records.has(ref)) invalid('referencia a una entidad inexistente.');
  return { records, header };
}
