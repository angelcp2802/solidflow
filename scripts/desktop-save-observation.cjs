'use strict';
const path = require('node:path');

// Passive, bounded evidence for the source-revision Save workflow. These
// observers neither retry writes nor replace the authored graph being checked.
function ownValue(value, key) {
  if (value === null || !['object', 'function'].includes(typeof value)) return undefined;
  try { const field = Object.getOwnPropertyDescriptor(value, key); return field && 'value' in field ? field.value : undefined; }
  catch { return undefined; }
}
function safeError(error) {
  const result = {};
  for (const key of ['name', 'code']) {
    const value = ownValue(error, key);
    if (typeof value === 'string') result[key] = /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : '<redacted>';
  }
  const message = ownValue(error, 'message');
  if (typeof message === 'string') result.message = message.slice(0, 2048)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '<url>')
    .replace(/[A-Za-z]:[\\/][^\r\n"'<>]*/g, '<path>')
    .replace(/\\\\[^\r\n"'<>]*/g, '<path>')
    .replace(/(^|[^A-Za-z0-9_])\/(?![/*])[^\r\n"'<>]*/g, '$1<path>')
    .replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, ' ').slice(0, 512);
  return result;
}
const graphFields = new Set(['version', 'kind', 'id', 'revision', 'name', 'units', 'definitions', 'occurrences', 'mates', 'createdAt', 'updatedAt']);

function createSaveObservation({ input, output, canonical, digest }) {
  const pathKey = value => { const resolved = path.resolve(value); return process.platform === 'win32' ? resolved.toLowerCase() : resolved; };
  function target(value) {
    if (value === null || value === undefined) return 'none';
    if (typeof value !== 'string') return 'other';
    const resolved = pathKey(value);
    return resolved === pathKey(input) ? 'input' : resolved === pathKey(output) ? 'output' : 'other';
  }
  function request(payload, ordinal) {
    const record = { ordinal };
    try {
      record.requestTarget = target(ownValue(payload, 'filePath'));
      const content = ownValue(payload, 'content');
      record.requestCanonicalSha256 = typeof content === 'string' ? digest(canonical(JSON.parse(content))) : null;
    } catch { record.diagnosticUnavailable = 'request'; }
    return record;
  }
  function returned(record, value) {
    try { record.returnedTarget = target(value); }
    catch { /* Diagnostics must not replace the real IPC outcome. */ }
  }
  function rejected(record, error) {
    try { record.error = safeError(error); }
    catch { /* Preserve the original rejection even if recording fails. */ }
  }
  function graph(authored) {
    // Freeze the same complete Apply result used by the existing assertion.
    // No later app/recovery/disk snapshot is accepted as the expectation.
    const expected = canonical(authored), original = JSON.parse(expected);
    const record = { expectedCanonicalSha256: digest(expected), diskEqualsAuthored: null, completedChosenSaveCount: null };
    return {
      record,
      failed(error) {
        // JSON.parse may quote document content in its error message.
        if (record.parseStatus === 'invalid') record.error = { category: 'invalid-json' };
        else rejected(record, error);
      },
      sample(raw, completedChosenSaveCount) {
        record.completedChosenSaveCount = completedChosenSaveCount;
        record.diskRawSha256 = digest(raw);
        let document;
        try { document = JSON.parse(raw); record.parseStatus = 'valid'; }
        catch (error) { record.parseStatus = 'invalid'; throw error; }
        const actual = canonical(document);
        record.diskCanonicalSha256 = digest(actual);
        record.diskEqualsAuthored = actual === expected;
        const keys = new Set([...Object.keys(original), ...Object.keys(document ?? {})]);
        const different = [...keys].filter(key => Object.hasOwn(original, key) !== Object.hasOwn(document ?? {}, key)
          || canonical(original[key]) !== canonical(document?.[key]));
        record.differingFields = different.filter(key => graphFields.has(key)).slice(0, 16);
        record.otherDifferingFieldCount = different.filter(key => !graphFields.has(key)).length;
        return record.diskEqualsAuthored && completedChosenSaveCount === 1;
      },
    };
  }
  return Object.freeze({ request, returned, rejected, graph });
}
module.exports = Object.freeze({ createSaveObservation });
