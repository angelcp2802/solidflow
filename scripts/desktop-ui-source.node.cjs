'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original synthetic strings exercise source construction only. The five
// control strings are copied from the tracked ALL/world-limit UI workflows.
// No renderer, Electron, worker, CAD runtime, filesystem or network is used.
const roundTrips = [
  ['empty string', ''],
  ['quotes and attempted statement', '"; globalThis.__solidflowUiSourceSentinel = true; "'],
  ['slashes and backslashes', '/relative/\\segment\\\\tail'],
  ['backticks', '\u0060; globalThis.__solidflowUiSourceSentinel = true; \u0060'],
  ['literal template interpolation', '${globalThis.__solidflowUiSourceSentinel = true}'],
  ['control characters', '\n\r\t\b\f\0'],
  ['HTML script terminator', '</script><script>globalThis.__solidflowUiSourceSentinel = true</script>'],
  ['HTML delimiters and comment', '<>&<!-- -->'],
  ['Unicode line and paragraph separators', 'first\u2028second\u2029third'],
  ['Unicode text', 'á中🙂'],
  ['unpaired surrogate code units', '\uD800x\uDC00'],
  ['combined attempted source', '"; globalThis.__solidflowUiSourceSentinel = true; //\n</script>&\u2028\u2029\u0060${0}'],
  ['actual Open selector', 'button[aria-label="Abrir (Ctrl+O)"]'],
  ['actual Apply selector', 'button[title="Aceptar operación"]'],
  ['actual explicit world-limit selector', 'input[aria-label="Mantener plano límite fijo de Original fixed-plane seed"]'],
  ['actual repetition method selector', 'select[aria-label="Método de repetición de operaciones"]'],
  ['actual Save As label', 'Guardar como…'],
];

for (const [name, value] of roundTrips) {
  test('JavaScript literal round trip: ' + name, () => {
    const literal = encodeJavaScriptString(value);
    assert.equal(typeof literal, 'string');
    // Independent source-context oracle: an HTML closing tag and raw line
    // separators cannot survive even when the JavaScript VM accepts them.
    assert.doesNotMatch(literal, /[<>&\u2028\u2029]/u);
    const context = vm.createContext({ __solidflowUiSourceSentinel: false });
    const actual = vm.runInContext('const captured = ' + literal + '; captured;', context);
    assert.equal(actual, value);
    assert.equal(context.__solidflowUiSourceSentinel, false);
  });
}

test('reject every non-string category instead of coercing it', () => {
  const values = [
    undefined, null, false, true, 0, NaN, Infinity, 1n, Symbol('synthetic'),
    function synthetic() {}, [], {}, new String('boxed'),
  ];
  for (const value of values) {
    assert.throws(() => encodeJavaScriptString(value), {
      name: 'TypeError',
      message: 'Expected a primitive string for JavaScript source.',
    });
  }
});

for (const [name, key] of [
  ['toJSON', 'toJSON'],
  ['toString', 'toString'],
  ['Symbol.toPrimitive', Symbol.toPrimitive],
]) {
  test('reject an object without reading its ' + name + ' getter', () => {
    let reads = 0;
    const value = Object.defineProperty({}, key, {
      get() { reads += 1; return () => 'untrusted'; },
    });
    assert.throws(() => encodeJavaScriptString(value), {
      name: 'TypeError',
      message: 'Expected a primitive string for JavaScript source.',
    });
    assert.equal(reads, 0);
  });
}
