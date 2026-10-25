'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { emitDesktopCiFailure, markDesktopCiFailureReported } = require('./desktop-ci-diagnostics.cjs');
const emit = (error, env = { GITHUB_ACTIONS: 'true' }) => { const lines = []; const result = emitDesktopCiFailure(error, { env, write: line => lines.push(line) }); return { result, lines }; };

test('only explicit GitHub Actions emits a failure annotation; local and lookalike values remain silent', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', true]) {
    const actual = emit(new Error('Original local failure'), { GITHUB_ACTIONS: value });
    assert.equal(actual.result, false); assert.deepEqual(actual.lines, []);
  }
  const actual = emit(new Error('Independent plane coordinate was outside its declared interval.'));
  assert.equal(actual.result, true);
  assert.match(actual.lines[0], /^::error title=SolidFlow desktop workflow failure::Independent plane coordinate/);
  assert.doesNotMatch(actual.lines[0], /::notice|PASS/);
});

test('CRLF, percent-encoded newlines and fake workflow commands cannot form a second command', () => {
  const actual = emit(new Error('Wrong physical angle\r\n::notice title=PASS::fake\n%0A::warning::injected%25'));
  assert.equal(actual.lines.length, 1);
  const line = actual.lines[0];
  assert.equal((line.match(/\n/g) || []).length, 1); assert.equal(line.at(-1), '\n');
  assert.equal(line.includes('\r'), false);
  assert.match(line, /%0D%0A::notice/); assert.match(line, /%250A::warning/); assert.match(line, /injected%2525/);
});

test('unreadable own messages and hostile serialization hooks never execute getters or coercion', () => {
  let calls = 0;
  const error = Object.defineProperties({}, {
    message: { get() { calls++; throw Error('message getter'); } },
    stack: { get() { calls++; throw Error('stack getter'); } },
    cause: { get() { calls++; throw Error('cause getter'); } },
    toString: { value() { calls++; throw Error('coercion'); } },
    toJSON: { value() { calls++; throw Error('serialization'); } },
  });
  const actual = emit(error);
  assert.equal(calls, 0); assert.match(actual.lines[0], /without a readable own error message/);
  const inherited = Object.create({ message: 'Inherited data must not be trusted' });
  assert.doesNotMatch(emit(inherited).lines[0], /Inherited data/);
});

test('absolute workspace, personal paths and URL query material are redacted', () => {
  for (const message of [
    'ENOENT: C:\\Users\\Original Person\\secret\\fixture.solidflow',
    'Failed opening "/home/original-person/private/fixture.solidflow"',
    'Failed opening [/home/original-person/private/fixture.solidflow]',
    'Failed opening `/home/original-person/private/fixture.solidflow`',
    String.raw`Failed opening \\original-server\private\fixture.solidflow`,
    'Request https://example.invalid/private?token=original-secret failed',
  ]) {
    const line = emit(new Error(message)).lines[0];
    assert.doesNotMatch(line, /Original Person|original-person|original-server|original-secret|fixture\.solidflow/);
    assert.match(line, /<path>|<url>/);
  }
});

test('control sequences are removed and the annotation has a strict byte cap', () => {
  const actual = emit(new Error('\u001b[2J\0\u0085\u009b\u2028' + '🙂%\r\n'.repeat(2000)));
  assert.ok(Buffer.byteLength(actual.lines[0]) <= 4096);
  assert.doesNotMatch(actual.lines[0], /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029]/);
  assert.equal((actual.lines[0].match(/\n/g) || []).length, 1);
});

test('diagnostic write failure does not throw or replace the original error', () => {
  const original = new Error('Original primary assertion');
  assert.doesNotThrow(() => assert.equal(emitDesktopCiFailure(original, { env: { GITHUB_ACTIONS: 'true' }, write() { throw Error('stdout closed'); } }), false));
  assert.equal(original.message, 'Original primary assertion');
  assert.equal(emit(original).result, true);
});

test('a reported child primary suppresses only its parent cause fallback', () => {
  const child = new Error('Actual child assertion'); markDesktopCiFailureReported(child);
  const parent = new AggregateError([child], 'Generic teardown wrapper', { cause: child });
  assert.deepEqual(emit(parent), { result: false, lines: [] });
  assert.equal(emit(new Error('Independent launch failure')).result, true);
});

test('same primary is annotated once, with no PASS representation or error mutation', () => {
  const original = new Error('Actual native assertion failed'), before = Object.getOwnPropertyDescriptors(original);
  assert.equal(emit(original).result, true); assert.equal(emit(original).result, false);
  assert.deepEqual(Object.getOwnPropertyDescriptors(original), before);
});

test('actual child finish releases a pending Save and emits before app.exit while retaining the primary failure', () => {
  const source = fs.readFileSync(path.join(__dirname, 'desktop-pattern-ui.cjs'), 'utf8');
  const start = source.indexOf('  function finish(error) {'), end = source.indexOf('  const evaluate =', start);
  assert.ok(start > 0 && end > start);
  const events = [], writes = [], error = new Error('Original child coordinate assertion');
  const context = vm.createContext({ finished: false, timeout: null, clearTimeout() {}, checks: [], protocolResponses: [], consoleErrors: [], failedRequests: [], captures: [], ipc: [],
    opens: 0, saves: 0, csvExports: 0, geometryExports: 0, sourceOpens: 0, stepImports: 0,
    linkedSource: false, sourceRevision: false, partRevolution: false, assemblyExport: false, structuralStep: false, structuralInsertion: false,
    saveCompletion: { enabled: true, ordinal: 1, armed: true, pending: true, samples: [] },
    releaseSaveCompletion(by) { context.saveCompletion.pending=false;context.saveCompletion.releasedBy=by;events.push(['release',by]); },
    owned: '/original-owned-test', activeScenario: { test: 'original-diagnostic-integration' },
    path, describeError: value => ({ name: value.name, message: value.message }),
    emitDesktopCiFailure(value) { events.push(['annotation', value.message]); },
    fs: { writeFileSync(_name, data) { writes.push(JSON.parse(data)); }, writeSync(_fd, data) { events.push(['json', JSON.parse(data).workflowStatus]); } },
    console: { error() {}, log() { throw Error('No PASS log allowed'); } }, process: { exitCode: undefined },
    app: { exit(code) { events.push(['exit', code]); }, quit() { throw Error('Failure must not call successful quit'); } }, error,
  });
  vm.runInContext(source.slice(start, end) + '\nfinish(error);', context);
  assert.equal(writes[0].workflowStatus, 'FAIL'); assert.equal(writes[0].error.message, error.message);
  assert.deepEqual(events, [['release', 'cleanup'], ['annotation', error.message], ['json', 'FAIL'], ['exit', 1]]);
  assert.equal(context.process.exitCode, 1);
});
