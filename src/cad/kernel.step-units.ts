import { parseStepPart21, isStepRef as isRef, isStepCall as isCall, type StepRecord as RecordEntity } from './kernel.step-part21';
const MAX_DEPTH = 32;
function invalid(message: string): never { throw new Error(`STEP: ${message}`); }

/** Explicit supported length scales: millimeter, meter, and conversion-based inch.
 * A unit's display name is never used to determine its scale. */
export function stepLengthUnit(bytes: Uint8Array): { millimetersPerUnit: number } {
  const { records } = parseStepPart21(bytes, { textEncoding: 'latin1' });
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
    if (['SHAPE_DEFINITION_REPRESENTATION', 'PROPERTY_DEFINITION_REPRESENTATION', 'MATERIAL_PROPERTY_REPRESENTATION', 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION'].includes(rep.name)) continue;
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
