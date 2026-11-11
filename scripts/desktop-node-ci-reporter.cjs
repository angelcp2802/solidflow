'use strict';
const { emitDesktopCiFailure } = require('./desktop-ci-diagnostics.cjs');

function own(value, key) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
  try { const descriptor = Object.getOwnPropertyDescriptor(value, key); return descriptor && 'value' in descriptor ? descriptor.value : undefined; }
  catch { return undefined; }
}

// Consume the documented TestsStream, not formatted spec/TAP output. Node wraps
// the actual assertion in details.error.cause; parent subtest aggregations add
// no new failure and must not produce another annotation.
module.exports = async function* desktopNodeCiReporter(source) {
  for await (const event of source) {
    if (own(event, 'type') !== 'test:fail') continue;
    const data = own(event, 'data'), details = own(data, 'details'), error = own(details, 'error');
    if (own(data, 'skip') || own(data, 'todo') || own(error, 'failureType') === 'subtestsFailed') continue;
    const name = own(data, 'name');
    const messages = [];
    const seen = new Set();
    for (let current = error, depth = 0; current && depth < 8 && !seen.has(current); depth++) {
      seen.add(current);
      const message = own(current, 'message');
      if (typeof message === 'string' && message && !messages.includes(message)) messages.push(message.slice(0, 1024));
      current = own(current, 'cause');
    }
    // Put the original assertion first so the shared bounded sanitizer cannot
    // truncate it behind the runner's generic "test failed" wrapper.
    const original = messages.reverse().join(' | ') || 'Failure without a readable own error message.';
    const diagnostic = new Error('Node test: ' + (typeof name === 'string' ? name.slice(0, 512) : '<unnamed>') + '\n' + original);
    let output;
    emitDesktopCiFailure(diagnostic, { write: line => { output = line; } });
    if (output) yield output;
  }
};
