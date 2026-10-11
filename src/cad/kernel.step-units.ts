/** A deliberately bounded Part 21 unit gate, not an EXPRESS schema validator.
 * Strings/comments cannot introduce entities; only referenced 3D representation
 * contexts supply length units. Native STEP transfer remains a separate check. */
const MAX_TOKENS = 600_000, MAX_RECORDS = 100_000, MAX_DEPTH = 32;
type Token = { kind: 'word' | 'ref' | 'number' | 'enum' | 'string' | 'punct'; text: string };
type Ref = { ref: string };
type Call = { name: string; args: Value[] };
type Value = Ref | Call | Value[] | number | string;
type RecordEntity = { components: Call[]; refs: string[] };
function invalid(message: string): never { throw new Error(`STEP: ${message}`); }

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < text.length;) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) invalid('comentario sin cerrar.');
      i = end + 2; continue;
    }
    if (text[i] === "'" || text[i] === '"') {
      const quote = text[i++]; let closed = false;
      while (i < text.length) {
        if (text[i++] !== quote) continue;
        if (quote === "'" && text[i] === quote) { i++; continue; }
        closed = true; break;
      }
      if (!closed) invalid('literal sin cerrar.');
      tokens.push({ kind: 'string', text: '' });
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
function isRef(value: Value | undefined): value is Ref { return !!value && typeof value === 'object' && !Array.isArray(value) && 'ref' in value; }
function isCall(value: Value | undefined): value is Call { return !!value && typeof value === 'object' && !Array.isArray(value) && 'name' in value; }

function parse(text: string): Map<string, RecordEntity> {
  const tokens = tokenize(text), records = new Map<string, RecordEntity>(); let index = 0;
  const next = () => tokens[index++];
  const expect = (text: string) => { if (next()?.text !== text) invalid(`estructura Part 21 no admitida; se esperaba ${text}.`); };
  const value = (depth: number, refs: string[]): Value => {
    if (depth > MAX_DEPTH) invalid('supera la profundidad máxima de 32.');
    const token = next(); if (!token) invalid('archivo incompleto.');
    if (token.kind === 'ref') { const ref = reference(token); refs.push(ref); return { ref }; }
    if (token.kind === 'number') { const n = Number(token.text); if (!Number.isFinite(n)) invalid('número no finito.'); return n; }
    if (token.kind === 'string') return '';
    if (token.kind === 'enum' || token.text === '$' || token.text === '*') return token.text;
    if (token.text === '(') return args(depth + 1, refs);
    if (token.kind === 'word') { expect('('); return { name: token.text, args: args(depth + 1, refs) }; }
    return invalid('parámetro Part 21 no admitido.');
  };
  const args = (depth: number, refs: string[]): Value[] => {
    if (depth > MAX_DEPTH) invalid('supera la profundidad máxima de 32.');
    const out: Value[] = [];
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
    value(0, []); expect(';');
  }
  expect('ENDSEC'); expect(';'); expect('DATA'); expect(';');
  while (tokens[index]?.text !== 'ENDSEC') {
    const idToken = next(); if (idToken?.kind !== 'ref') invalid('se requiere una entidad DATA o ENDSEC.');
    const id = reference(idToken); if (records.has(id)) invalid('identificadores de entidad duplicados.');
    expect('='); const components: Call[] = [], refs: string[] = [];
    if (tokens[index]?.text === '(') {
      index++;
      while (tokens[index]?.text !== ')') {
        const component = value(0, refs); if (!isCall(component)) invalid('entidad compleja no válida.');
        components.push(component);
      }
      expect(')');
    } else {
      const component = value(0, refs); if (!isCall(component)) invalid('entidad no válida.');
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
  return records;
}

/** Explicit supported length scales: millimeter, meter, and conversion-based inch.
 * A unit's display name is never used to determine its scale. */
export function stepLengthUnit(bytes: Uint8Array): { millimetersPerUnit: number } {
  const records = parse(new TextDecoder('latin1').decode(bytes));
  const get = (id: string) => records.get(id) ?? invalid('referencia de unidades inexistente.');
  const component = (record: RecordEntity, name: string) => record.components.find(c => c.name === name);
  const lengthScale = (id: string, visited = new Set<string>()): number => {
    if (visited.has(id) || visited.size > MAX_DEPTH) invalid('referencia de unidades circular o demasiado profunda.');
    const nextVisited = new Set(visited).add(id), record = get(id);
    const length = component(record, 'LENGTH_UNIT'), named = component(record, 'NAMED_UNIT');
    if (!length || length.args.length !== 0 || !named || named.args.length !== 1
      || component(record, 'PLANE_ANGLE_UNIT') || component(record, 'SOLID_ANGLE_UNIT')) invalid('se esperaba una unidad de longitud explícita y bien formada.');
    const si = component(record, 'SI_UNIT'), conversion = component(record, 'CONVERSION_BASED_UNIT');
    if (!!si === !!conversion) invalid('unidad de longitud desconocida o ambigua.');
    if (si) {
      if (named.args[0] !== '*') invalid('declaración SI NAMED_UNIT no admitida.');
      if (si.args.length !== 2 || si.args[1] !== '.METRE.') invalid('unidad SI de longitud no admitida.');
      if (si.args[0] === '.MILLI.') return 1;
      if (si.args[0] === '$') return 1000;
      invalid('prefijo SI no admitido; usa milímetros, metros o pulgadas declaradas.');
    }
    const factorRef = conversion!.args[1];
    if (conversion!.args.length !== 2 || !named || named.args.length !== 1 || !isRef(named.args[0]) || !isRef(factorRef)) invalid('conversión de longitud incompleta.');
    const dims = component(get(named.args[0].ref), 'DIMENSIONAL_EXPONENTS');
    if (!dims || dims.args.length !== 7 || dims.args.some((value, i) => value !== (i === 0 ? 1 : 0))) invalid('dimensiones de conversión no válidas para longitud.');
    const measureRecord = get(factorRef.ref), measure = measureRecord.components.find(c => ['LENGTH_MEASURE_WITH_UNIT', 'MEASURE_WITH_UNIT'].includes(c.name) && c.args.length > 0);
    if (!measure || measure.args.length !== 2 || !isRef(measure.args[1])) invalid('factor de conversión de longitud no válido.');
    const factor = isCall(measure.args[0]) && measure.args[0].name === 'LENGTH_MEASURE' && measure.args[0].args.length === 1 ? measure.args[0].args[0] : measure.args[0];
    if (typeof factor !== 'number' || factor <= 0) invalid('factor de conversión de longitud no válido.');
    return factor * lengthScale(measure.args[1].ref, nextVisited);
  };
  const scales: number[] = [];
  for (const record of records.values()) for (const rep of record.components) {
    if (rep.name !== 'REPRESENTATION' && !rep.name.endsWith('_REPRESENTATION')) continue;
    // These entities relate a definition to a representation. Their final
    // argument is the representation itself, never a geometric context.
    if (['SHAPE_DEFINITION_REPRESENTATION', 'PROPERTY_DEFINITION_REPRESENTATION', 'MATERIAL_PROPERTY_REPRESENTATION'].includes(rep.name)) continue;
    // Complex entities may carry the arguments on REPRESENTATION alone.
    if (!rep.args.length && component(record, 'REPRESENTATION')) continue;
    const contextRef = rep.args.at(-1);
    if (!isRef(contextRef)) invalid('contexto de representación ausente o no admitido.');
    const context = get(contextRef.ref), geometric = component(context, 'GEOMETRIC_REPRESENTATION_CONTEXT');
    if (!geometric || geometric.args.length !== 1 || ![2, 3].includes(geometric.args[0] as number)) invalid('dimensión del contexto geométrico no admitida.');
    if (geometric.args[0] === 2) {
      if (rep.name !== 'DEFINITIONAL_REPRESENTATION') invalid('se requiere un contexto geométrico tridimensional.');
      continue;
    }
    const units = component(context, 'GLOBAL_UNIT_ASSIGNED_CONTEXT');
    if (!units || units.args.length !== 1 || !Array.isArray(units.args[0]) || !units.args[0].every(isRef)) invalid('faltan unidades explícitas en el contexto tridimensional.');
    const lengthUnits = units.args[0].filter(ref => component(get(ref.ref), 'LENGTH_UNIT'));
    if (lengthUnits.length !== 1) invalid('unidad de longitud ausente o ambigua.');
    const scale = lengthScale(lengthUnits[0].ref);
    const supported = [1, 1000, 25.4].find(candidate => Math.abs(scale - candidate) <= candidate * 1e-12);
    if (!supported) invalid('escala de longitud no admitida; usa milímetros, metros o pulgadas declaradas.');
    scales.push(supported);
  }
  if (!scales.length) invalid('no hay una representación tridimensional con unidades explícitas.');
  if (scales.some(scale => scale !== scales[0])) invalid('los contextos usan unidades de longitud mezcladas.');
  return { millimetersPerUnit: scales[0] };
}
