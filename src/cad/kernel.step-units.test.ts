import { expect, it } from 'vitest';
import { stepLengthUnit } from './kernel.step-units';

// Original, minimal Part 21 unit graphs. These exercise the lexical gate only;
// they deliberately contain no transferable BRep and are not CAD fixtures.
const mm = '#3=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));';
function file(units = mm, assignment = '#3', dimension = 3, extra = '') {
  return `ISO-10303-21;HEADER;FILE_DESCRIPTION(('original'),'2;1');ENDSEC;DATA;
    #1=ADVANCED_BREP_SHAPE_REPRESENTATION('',(),#2);
    #2=(GEOMETRIC_REPRESENTATION_CONTEXT(${dimension}) GLOBAL_UNIT_ASSIGNED_CONTEXT((${assignment})) REPRESENTATION_CONTEXT('',''));
    ${units}${extra}ENDSEC;END-ISO-10303-21;`;
}
function check(text: string) { return stepLengthUnit(new TextEncoder().encode(text)); }
const inch = `#3=(CONVERSION_BASED_UNIT('arbitrary label',#5) LENGTH_UNIT() NAMED_UNIT(#4));
  #4=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);
  #5=LENGTH_MEASURE_WITH_UNIT(25.4,#6);
  #6=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));`;
it('follows actual representation contexts and ignores definition association links', () => {
  expect(check(file(mm, '#3', 3, '#4=SHAPE_DEFINITION_REPRESENTATION(#5,#1);#5=PRODUCT_DEFINITION_SHAPE(\'\',\'\',#1);'))).toEqual({ millimetersPerUnit: 1 });
});
it('does not confuse an assembly relationship association with a geometric representation context', () => {
  const association = "#4=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#5,#6);#5=REPRESENTATION_RELATIONSHIP('','',#1,#1);#6=PRODUCT_DEFINITION_SHAPE('','',#1);";
  expect(check(file(mm, '#3', 3, association))).toEqual({ millimetersPerUnit: 1 });
  // An association cannot supply the missing units of its actual representation.
  expect(() => check(file(mm, '#3', 3, association).replace('GLOBAL_UNIT_ASSIGNED_CONTEXT((#3))', ''))).toThrow(/unidades explícitas/);
});
it.each([[mm, 1], [mm.replace('.MILLI.', '$'), 1000], [inch, 25.4]] as const)('resolves an explicit supported length graph %s', (units, scale) => {
  expect(check(file(units)).millimetersPerUnit).toBe(scale);
});
it('resolves typed values and complex measure inheritance without trusting the unit name', () => {
  const complex = inch.replace("LENGTH_MEASURE_WITH_UNIT(25.4,#6)", '(LENGTH_MEASURE_WITH_UNIT() MEASURE_WITH_UNIT(LENGTH_MEASURE(2.54E1),#6))');
  expect(check(file(complex)).millimetersPerUnit).toBe(25.4);
});
it.each([
  file(mm).replace('GLOBAL_UNIT_ASSIGNED_CONTEXT((#3))', "REPRESENTATION_CONTEXT('GLOBAL_UNIT_ASSIGNED_CONTEXT((#3))','')").replace(" REPRESENTATION_CONTEXT('','')", ''),
  file(mm).replace('GLOBAL_UNIT_ASSIGNED_CONTEXT((#3))', '/* GLOBAL_UNIT_ASSIGNED_CONTEXT((#3)) */'),
  file(mm).replace('GLOBAL_UNIT_ASSIGNED_CONTEXT((#3))', ''),
  file(mm, '#3', 3, '#4=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#3)));').replace('GLOBAL_UNIT_ASSIGNED_CONTEXT((#3))', ''),
])('rejects missing units even when strings, comments or dead contexts mention them', text => {
  expect(() => check(text)).toThrow(/unidades explícitas/);
});
it.each([
  [file(mm.replace('.MILLI.', '.CENTI.')), /prefijo SI/],
  [file(mm.replace('.METRE.', '.RADIAN.')), /unidad SI/],
  [file(inch.replace('25.4', '7.')), /escala/],
  [file(inch.replace('25.4', '-25.4')), /factor/],
  [file(inch.replace('1.,0.,0.,0.,0.,0.,0.', '0.,1.,0.,0.,0.,0.,0.')), /dimensiones/],
  [file(inch.replace('25.4,#6', '25.4,#3')), /circular/],
  [file(mm, '#3,#3'), /ambigua/],
  [file(mm.replace('LENGTH_UNIT()', 'PLANE_ANGLE_UNIT()')), /ausente/],
  [file(mm.replace('LENGTH_UNIT()', 'LENGTH_UNIT(777)')), /bien formada/],
  [file(mm.replace('NAMED_UNIT(*)', '')), /bien formada/],
  [file(mm.replace('NAMED_UNIT(*)', 'NAMED_UNIT($)')), /NAMED_UNIT/],
  [file(mm, '#3', 4), /dimensión/],
  [file(mm, '#3', 2), /tridimensional/],
] as const)('rejects unsupported or ambiguous unit graph %s', (text, message) => expect(() => check(text)).toThrow(message));
it('rejects mixed active context units rather than choosing the first unit', () => {
  const mixed = file(mm, '#3', 3, `#4=ADVANCED_BREP_SHAPE_REPRESENTATION('',(),#5);
    #5=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#6)));
    #6=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT($,.METRE.));`);
  expect(() => check(mixed)).toThrow(/mezcladas/);
});
it('treats external words in literals/comments as data and rejects external entity/section syntax', () => {
  expect(check(file(mm).replace("'original'", "'EXTERNAL_SOURCE(''private'') #999' /* DOCUMENT_FILE('x') */"))).toEqual({ millimetersPerUnit: 1 });
  expect(() => check(file(mm, '#3', 3, "#4=EXTERNAL_SOURCE('uri');"))).toThrow(/externos/);
  expect(() => check(file(mm).replace('DATA;', "REFERENCE;#9=<'file'>;ENDSEC;DATA;"))).toThrow(/STEP:/);
});
it.each([
  file(mm, '#3', 3, '#03=SI_UNIT($,.METRE.);'),
  file(mm, '#999'),
  file(mm).replace('3)', '3.1.2)'),
  file(mm).replace('DATA;', 'DATA;#8=DEEP('+ '('.repeat(40) + '$' + ')'.repeat(40) + ');'),
  file(mm).replace("'original'", "'unterminated"),
  file(mm).replace('DATA;', 'DATA;/* unclosed'),
  file(mm).replace('END-ISO-10303-21;', 'END-ISO-10303-21;DATA;'),
])('rejects malformed, duplicate, dangling or deeply nested records', text => expect(() => check(text)).toThrow(/STEP:/));
it('bounds token count before native parsing', () => {
  expect(() => check('ISO-10303-21;HEADER;FILE_NAME(' + '$,'.repeat(600_001) + '$);')).toThrow(/600.000 tokens/);
});
