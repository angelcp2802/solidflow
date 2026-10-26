'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSaveObservation } = require('./desktop-save-observation.cjs');
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const digest = value => createHash('sha256').update(value).digest('hex');
const input = path.resolve('original.solidflow'), output = path.resolve('saved.solidflow');
const observer = () => createSaveObservation({ input, output, canonical, digest });
const authored = { version: 2, kind: 'assembly', id: 'original', revision: 'authored', occurrences: [], updatedAt: '2026-01-01T00:00:00Z' };

test('save graph evidence distinguishes both unchanged acceptance conjuncts and freezes the expectation', () => {
  const expected = structuredClone(authored), probe = observer().graph(expected);
  expected.revision = 'later-mutation';
  const raw = JSON.stringify(authored);
  assert.equal(probe.sample(raw, 0), false);
  assert.equal(probe.record.diskEqualsAuthored, true);
  assert.equal(probe.record.completedChosenSaveCount, 0);
  assert.equal(probe.sample(raw, 2), false);
  assert.equal(probe.sample(raw, 1), true);
  assert.equal(probe.record.expectedCanonicalSha256, digest(canonical(authored)));
  assert.equal(probe.record.diskCanonicalSha256, probe.record.expectedCanonicalSha256);
  assert.equal(probe.record.diskRawSha256, digest(raw));
  assert.deepEqual(probe.record.differingFields, []);
  assert.equal(probe.sample(JSON.stringify({ ...authored, revision: 'older' }), 1), false);
  assert.equal(probe.record.diskEqualsAuthored, false);
  assert.equal(probe.record.completedChosenSaveCount, 1);
  assert.deepEqual(probe.record.differingFields, ['revision']);
});

test('graph diagnostics list only allowed field names without storing document data or unknown keys', () => {
  const probe = observer().graph(authored);
  const changed = { ...authored, occurrences: [{ privateValue: 'do-not-report' }] };
  for (let i = 0; i < 30; i++) changed['private-key-' + i] = 'do-not-report';
  assert.equal(probe.sample(JSON.stringify(changed), 1), false);
  assert.deepEqual(probe.record.differingFields, ['occurrences']);
  assert.equal(probe.record.otherDifferingFieldCount, 30);
  assert.equal(JSON.stringify(probe.record).includes('private-key'), false);
  assert.equal(JSON.stringify(probe.record).includes('do-not-report'), false);
  assert.equal(probe.sample(JSON.stringify(authored), 1), true);
  assert.equal(probe.record.otherDifferingFieldCount, 0, 'only the last observation is retained');
});

test('save observations classify destinations and canonical content without exposing paths', () => {
  const o = observer(), record = o.request({ filePath: input, content: JSON.stringify(authored, null, 2) }, 2);
  assert.deepEqual(record, { ordinal: 2, requestTarget: 'input', requestCanonicalSha256: digest(canonical(authored)) });
  o.returned(record, input); assert.equal(record.returnedTarget, 'input');
  o.returned(record, input.toUpperCase()); assert.equal(record.returnedTarget, process.platform === 'win32' ? 'input' : 'other');
  assert.equal(o.request({ filePath: output, content: JSON.stringify(authored) }, 3).requestTarget, 'output');
  assert.equal(o.request({ filePath: path.resolve('different.solidflow') }, 4).requestTarget, 'other');
  assert.equal(o.request({}, 1).requestTarget, 'none');
  o.returned(record, null); assert.equal(record.returnedTarget, 'none');
  assert.equal(JSON.stringify(record).includes(input), false);
  assert.equal(JSON.stringify(record).includes(output), false);
});

test('failure observations are bounded and omit paths, URLs, stack, causes and unsafe own fields', () => {
  const o = observer(), record = {};
  const error = new Error('EPERM rename "C:\\private folder\\part.solidflow" /home/private/a to https://user:secret@example.invalid/path');
  error.code = 'EPERM'; error.name = 'C:/private-name'; error.cause = { secret: true };
  o.rejected(record, error);
  assert.equal(record.error.code, 'EPERM'); assert.equal(record.error.name, '<redacted>');
  assert.match(record.error.message, /<path>/);
  assert.doesNotMatch(JSON.stringify(record), /private|secret|stack|cause|example/);
  o.rejected(record, new Error('a'.repeat(10000)));
  assert.equal(record.error.message.length, 512);
  o.rejected(record, Object.defineProperty({}, 'message', { get() { throw Error('must not call'); } }));
  assert.deepEqual(record.error, {});
  o.rejected(record, new Proxy({}, { getOwnPropertyDescriptor() { throw Error('opaque'); } }));
  assert.deepEqual(record.error, {});
  assert.doesNotThrow(() => o.rejected(Object.freeze({}), error));
});

// Execute the existing IPC proxy, rather than a hand-written imitation of its
// catch/return path, so a diagnostic cannot accidentally swallow a rejection.
function wrapSave(handler) {
  const source = fs.readFileSync(path.join(__dirname, 'desktop-pattern-ui.cjs'), 'utf8');
  const start = source.indexOf('  const sourceSaveObservation ='), end = source.indexOf('  const testingDialog =', start);
  assert.ok(start >= 0 && end > start);
  let wrapped;
  const context = vm.createContext({ require, input, output, canonical, digest, handler, ipc: [],
    electron: { ipcMain: { handle(channel, callback) { assert.equal(channel, 'document:save'); wrapped = callback; } } },
    sourceRevision: true, configurations: false, assemblySourceUpdate: false, partRevolution: false,
    assemblyExport: false, structuralStep: false, structuralInsertion: false, linkedSource: false,
    saveCompletion: { enabled: false }, check(condition, message) { assert.ok(condition, message); },
  });
  vm.runInContext(source.slice(start, end) + '\ntestingIpc.handle("document:save", handler);', context);
  return { invoke: payload => wrapped({}, payload), records: context.ipc };
}

test('actual source Save IPC proxy forwards one request and preserves original rejection identity', async () => {
  const originalError = Object.assign(new Error('write rejected'), { code: 'EPERM' });
  const payload = { name: 'Original', filePath: input, content: JSON.stringify(authored) };
  let calls = 0;
  const proxy = wrapSave(async (_event, actual) => { calls++; assert.equal(actual, payload); throw originalError; });
  await assert.rejects(proxy.invoke(payload), error => error === originalError);
  assert.equal(calls, 1); assert.equal(proxy.records.length, 1);
  const record = proxy.records[0];
  assert.equal(record.completed, false); assert.equal(Object.hasOwn(record.documentWrite, 'chosen'), false);
  assert.equal(record.documentWrite.error.code, 'EPERM');
  assert.equal(record.documentWrite.sha256, digest(payload.content));
  assert.equal(record.documentWrite.requestCanonicalSha256, digest(canonical(authored)));
});

test('actual source Save IPC proxy retains cancellation and successful result without extra writes', async () => {
  const payload = { name: 'Original', content: JSON.stringify(authored) };
  let calls = 0;
  const proxy = wrapSave(async () => ++calls === 1 ? null : input);
  assert.equal(await proxy.invoke(payload), null);
  assert.equal(await proxy.invoke({ ...payload, filePath: input }), input);
  assert.equal(calls, 2);
  assert.equal(proxy.records[0].completed, true);
  assert.equal(proxy.records[0].documentWrite.chosen, false);
  assert.equal(proxy.records[0].documentWrite.returnedTarget, 'none');
  assert.equal(proxy.records[1].documentWrite.ordinal, 2);
  assert.equal(proxy.records[1].documentWrite.chosen, true);
  assert.equal(proxy.records[1].documentWrite.returnedTarget, 'input');
});

test('malformed diagnostic content cannot prevent the actual handler or replace its error', async () => {
  const error = new Error('real admission error');
  const proxy = wrapSave(async () => { throw error; });
  await assert.rejects(proxy.invoke({ content: '{', filePath: input }), actual => actual === error);
  assert.equal(proxy.records[0].documentWrite.diagnosticUnavailable, 'request');
  const probe = observer().graph(authored);
  let parsedError;
  try { probe.sample('private-document-marker-not-json', 0); } catch (caught) { parsedError = caught; probe.failed(caught); }
  assert.ok(parsedError instanceof SyntaxError);
  assert.equal(probe.record.completedChosenSaveCount, 0);
  assert.deepEqual(probe.record.error, { category: 'invalid-json' });
  assert.equal(JSON.stringify(probe.record).includes('private-document-marker'), false);
});
