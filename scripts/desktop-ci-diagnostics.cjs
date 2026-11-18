'use strict';
const fs = require('node:fs');

const TITLE = 'SolidFlow desktop workflow failure';
const MAX_ANNOTATION_BYTES = 4096;
const reported = new WeakSet();
const object = value => value !== null && (typeof value === 'object' || typeof value === 'function');
function ownValue(value, key) {
  if (!object(value)) return undefined;
  try { const field = Object.getOwnPropertyDescriptor(value, key); return field && 'value' in field ? field.value : undefined; }
  catch { return undefined; }
}
function markDesktopCiFailureReported(error) { if (object(error)) reported.add(error); }
function alreadyReported(error) {
  const seen = new Set();
  for (let value = error, depth = 0; object(value) && depth < 8 && !seen.has(value); depth++) {
    if (reported.has(value)) return true;
    seen.add(value); value = ownValue(value, 'cause');
  }
  return false;
}
function safeMessage(error) {
  const message = ownValue(error, 'message');
  if (typeof message !== 'string' || !message) return 'Desktop workflow failed without a readable own error message.';
  // Only a bounded own message is used, never stack, cause serialization or an
  // arbitrary toString. Redact absolute paths/URLs rather than leaking profiles,
  // credentials or personal workspace directories into a public annotation.
  return message.slice(0, 2048)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '<url>')
    .replace(/[A-Za-z]:[\\/][^\r\n"'<>]*/g, '<path>')
    .replace(/\\\\[^\r\n"'<>]*/g, '<path>')
    .replace(/(^|[^A-Za-z0-9_])\/(?![/*])[^\r\n"'<>]*/g, '$1<path>')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029]/g, ' ');
}
function annotation(error) {
  const prefix = '::error title=' + TITLE + '::';
  const budget = MAX_ANNOTATION_BYTES - Buffer.byteLength(prefix + '\n') - 3;
  let text = '', bytes = 0, truncated = false;
  for (const char of safeMessage(error)) {
    const escaped = char === '%' ? '%25' : char === '\r' ? '%0D' : char === '\n' ? '%0A' : char;
    const length = Buffer.byteLength(escaped);
    if (bytes + length > budget) { truncated = true; break; }
    text += escaped; bytes += length;
  }
  return prefix + text + (truncated ? '...' : '') + '\n';
}
/** Diagnostics cannot change workflow outcomes or throw during failure cleanup.
 * A child primary failure is emitted before app.exit; its parent only supplies
 * a fallback when no failed child evidence exists or an outer failure occurs. */
function emitDesktopCiFailure(error, { env = process.env, write = line => fs.writeSync(1, line) } = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || alreadyReported(error)) return false;
  try { write(annotation(error)); markDesktopCiFailureReported(error); return true; }
  catch { return false; }
}
module.exports = Object.freeze({ emitDesktopCiFailure, markDesktopCiFailureReported });
