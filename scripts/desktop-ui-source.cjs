'use strict';

// A primitive string literal for JavaScript source, including an HTML script
// context. This encodes data; it does not accept source code or sanitize HTML.
function encodeJavaScriptString(value) {
  if (typeof value !== 'string') throw new TypeError('Expected a primitive string for JavaScript source.');
  const literal = JSON.stringify(value);
  if (typeof literal !== 'string') throw new TypeError('String encoding did not produce a literal.');
  return literal
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = Object.freeze({ encodeJavaScriptString });
