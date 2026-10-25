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

function exerciseChildDeadline(checks, { timing = null } = {}) {
  const source = fs.readFileSync(path.join(__dirname, 'desktop-pattern-ui.cjs'), 'utf8');
  const start = source.indexOf('  const childBudgetStarted ='), end = source.indexOf('  function finish(error) {', start);
  assert.ok(start > 0 && end > start);
  let callback, delay, failure, now = 100;
  const context = vm.createContext({ checks, TEST_MS: 180_000, performance: { now: () => now }, assembly: !!timing,
    require(name) { assert.equal(name, './desktop-workflow-timing.cjs'); return { createWorkflowTiming: () => timing }; },
    presentation: { active: true, frames: 123, captureBarriers: 2 }, presentationWaiters: new Set([1, 2, 3]),
    setTimeout(fn, milliseconds) { callback = fn; delay = milliseconds; }, finish(error) { failure = error; } });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(delay, 170_000); assert.equal(failure, undefined);
  now = 170_100.6; callback();
  assert.ok(failure); assert.equal(context.presentation.active, true);
  assert.equal(context.presentationWaiters.size, 3);
  return failure;
}

test('actual child deadline reports existing counters and the last completed wait before trailing object evidence', () => {
  const trailing = { toJSON() { throw Error('Evidence must not be serialized'); } };
  const error = exerciseChildDeadline(['earlier wait', 'last completed wait', trailing]);
  assert.equal(error.message, 'The isolated UI workflow did not finish before its child deadline.'
    + ' elapsedMs=170001; checks=3; frames=123; captureBarriers=2; presentationActive=true; pendingPresentations=3;'
    + ' lastCompletedWait="last completed wait"');
  assert.match(emit(error).lines[0], /lastCompletedWait="last completed wait"/);
});

test('actual child deadline handles no completed wait and bounds checkpoint text', () => {
  for (const checks of [[], [{ phase: 'started' }]]) {
    assert.match(exerciseChildDeadline(checks).message, /lastCompletedWait="none"$/);
  }
  const error = exerciseChildDeadline(['x'.repeat(1000)]);
  assert.ok(error.message.endsWith('lastCompletedWait="' + 'x'.repeat(200) + '"'));
});

test('actual child deadline annotation redacts synthetic checkpoint paths through the existing formatter', () => {
  const error = exerciseChildDeadline(['ENOENT: C:\\Users\\Original Person\\secret\\fixture.solidflow']);
  const actual = emit(error);
  assert.equal(actual.lines.length, 1);
  assert.match(actual.lines[0], /elapsedMs=170001/); assert.match(actual.lines[0], /<path>/);
  assert.doesNotMatch(actual.lines[0], /Original Person|fixture\.solidflow/);
});

test('actual child deadline allowlists the last movement and response without serializing payloads or dates', () => {
  const payload = { toJSON() { throw Error('No payload serialization'); } };
  const error = exerciseChildDeadline([
    { assemblyResponseProgress: { status: 'reading-snapshot', action: 'move-assembly-component-motion', afterSerial: 125,
      polls: 12, observedSerial: 126, elapsedMs: 5312.4, lastReadMs: 2.2, workerErrorCount: 0,
      startedAt: '2026-10-25T00:00:00Z', matching: payload, document: payload } },
    { moveTimings: [{ name: 'previous move' }, { name: 'gear/winding-720-preview-apply', status: 'started', elapsedMs: 106,
      latestCounterSerial: 125, startedAt: '2026-10-25T00:00:00Z', document: payload, geometry: payload,
      steps: [{ name: 'click-preview', status: 'completed', durationMs: 11 }, { name: 'wait-response', status: 'started' }] }] },
    'last completed control', payload,
  ]);
  const progress = JSON.parse(error.message.split(' progress=')[1].split('; lastCompletedWait=')[0]);
  assert.deepEqual(progress, {
    movement: { name: 'gear/winding-720-preview-apply', status: 'started', reportedElapsedMs: 106, step: 'wait-response',
      stepStatus: 'started', completedStepDurationMs: null, latestCounterSerial: 125, eventSerial: null },
    response: { status: 'reading-snapshot', action: 'move-assembly-component-motion', afterSerial: 125, polls: 12,
      observedSerial: 126, reportedElapsedMs: 5312, lastReadMs: 2, workerErrorCount: 0 },
  });
  assert.doesNotMatch(error.message, /previous move|2026-10|startedAt|document|geometry|matching/);
});

test('actual child deadline progress rejects invalid scalars, bounds strings and redacts annotation paths', () => {
  let getterCalls = 0;
  const response = { action: 'x'.repeat(500), polls: Infinity, afterSerial: -1, observedSerial: 1e10,
    elapsedMs: NaN, lastReadMs: '12', workerErrorCount: 0 };
  Object.defineProperty(response, 'status', { get() { getterCalls++; throw Error('No getter execution'); } });
  const error = exerciseChildDeadline([{ assemblyResponseProgress: response }, { moveTimings: [{
    name: 'ENOENT: C:\\Users\\Original Person\\secret\\fixture.solidflow', steps: null,
  }] }]);
  assert.equal(getterCalls, 0);
  const progress = JSON.parse(error.message.split(' progress=')[1].split('; lastCompletedWait=')[0]);
  assert.equal(progress.response.action, 'x'.repeat(80));
  for (const key of ['status', 'polls', 'afterSerial', 'observedSerial', 'reportedElapsedMs', 'lastReadMs']) assert.equal(progress.response[key], null);
  assert.equal(progress.movement.step, null);
  const annotation = emit(error).lines[0];
  assert.match(annotation, /<path>/); assert.doesNotMatch(annotation, /Original Person|fixture\.solidflow/);
  assert.ok(Buffer.byteLength(annotation) <= 4096);
  assert.doesNotMatch(exerciseChildDeadline([{ moveTimings: [] }, { assemblyResponseProgress: null }]).message, / progress=/);
});

test('actual deadline retains pending timing and scalar-only phase evidence without renderer reads', () => {
  const { createWorkflowTiming } = require('./desktop-workflow-timing.cjs');
  let now = 0, forbiddenCalls = 0;
  const timing = createWorkflowTiming(() => now);
  timing.enterPhase('authoring');
  const completed = timing.begin('pointer'); now = 12; completed();
  timing.enterPhase('gear');
  const pendingInspect = timing.begin('waitInspect'), pendingEvaluate = timing.begin('evaluate');
  now = 137;
  const payload = Object.defineProperties({}, {
    document: { get() { forbiddenCalls++; throw Error('No renderer/document inspection'); } },
    toJSON: { value() { forbiddenCalls++; throw Error('No arbitrary evidence serialization'); } },
  });
  const error = exerciseChildDeadline(['last real checkpoint', payload], { timing });
  const compact = JSON.parse(error.message.split(' timing=')[1].split(';')[0]);
  assert.equal(compact.phase, 'gear');
  assert.deepEqual(compact.categories.find(row => row[0] === 'evaluate'), ['evaluate', 1, 125, 1, 125]);
  assert.deepEqual(compact.categories.find(row => row[0] === 'waitInspect'), ['waitInspect', 1, 125, 1, 125]);
  assert.deepEqual(compact.categories.find(row => row[0] === 'pointer'), ['pointer', 1, 12, 0, 0]);
  assert.equal(compact.phases.find(row => row[0] === 'gear')[1], 125);
  assert.equal(forbiddenCalls, 0);
  assert.ok(error.message.length < 2048, 'Primary message must not truncate before its pending operation');
  const annotation = emit(error).lines[0];
  assert.ok(Buffer.byteLength(annotation) <= 4096);
  assert.match(annotation, /lastCompletedWait="last real checkpoint"/);
  assert.doesNotMatch(annotation, /document|toJSON|undefined|NaN/);
  const retained = error.message;
  now = 500; pendingEvaluate(); pendingInspect(); timing.completePhase();
  assert.equal(error.message, retained, 'Late completion must not rewrite the captured deadline');
});

test('actual deadline keeps every timing phase and existing progress within the primary-message limit', () => {
  const { createWorkflowTiming } = require('./desktop-workflow-timing.cjs');
  let now = 0;
  const timing = createWorkflowTiming(() => now);
  for (const phase of ['authoring', 'source', 'movement', 'drag', 'projection', 'interference', 'translation', 'bom', 'gear']) {
    timing.enterPhase(phase); now += 10_000;
  }
  for (const category of ['evaluate', 'pointer', 'waitInspect', 'waitSleep', 'assemblyResponse']) {
    const end = timing.begin(category); now += 1000; end(); timing.begin(category);
  }
  now = 170_000;
  const error = exerciseChildDeadline([
    { moveTimings: [{ name: 'x'.repeat(80), status: 'completed', elapsedMs: 12905, latestCounterSerial: 125, eventSerial: 126,
      steps: [{ name: 'x'.repeat(80), status: 'completed', durationMs: 99999 }] }] },
    { assemblyResponseProgress: { status: 'waiting-response', action: 'move-assembly-component-motion', afterSerial: 128,
      polls: 99, observedSerial: 129, elapsedMs: 99999, lastReadMs: 999, workerErrorCount: 0 } },
    'w'.repeat(200),
  ], { timing });
  assert.ok(error.message.length < 2048, 'All normal timing/progress fields must survive the formatter primary-message cap: ' + error.message.length);
  const annotation = emit(error).lines[0];
  assert.ok(Buffer.byteLength(annotation) <= 4096);
  assert.match(annotation, /"assemblyResponse"/);
  assert.match(annotation, /"afterSerial":128/);
  assert.ok(annotation.includes('lastCompletedWait="' + 'w'.repeat(200) + '"'));
});

function exerciseChildFinish({ primary = new Error('Original child coordinate assertion'), active = true, frames = 1,
  cleanupError = null, withWindow = true, timing = null, duringCleanup = () => {} } = {}) {
  const source = fs.readFileSync(path.join(__dirname, 'desktop-pattern-ui.cjs'), 'utf8');
  const start = source.indexOf('  function finish(error) {'), end = source.indexOf('  const evaluate =', start);
  const settleStart = source.indexOf('  function settlePresentationWaiters(error) {');
  const settleEnd = source.indexOf('  const childBudgetStarted =', settleStart);
  assert.ok(start > 0 && end > start && settleStart > 0 && settleEnd > settleStart);
  const events = [], writes = [], clearedTimers = [], rejected = [];
  const presentationWaiters = new Set(active ? [1, 2].map(id => ({ timer: 'presentation-' + id,
    resolve() { throw Error('Failure must reject pending presentation'); },
    reject(error) { rejected.push(error); events.push(['presentation-reject', id]); },
  })) : []);
  const context = vm.createContext({ finished: false, workflowTiming: timing, timeout: 'child-deadline', clearTimeout(id) { clearedTimers.push(id); },
    checks: [], protocolResponses: [], consoleErrors: [], failedRequests: [], captures: [], ipc: [],
    opens: 0, saves: 0, csvExports: 0, geometryExports: 0, sourceOpens: 0, stepImports: 0,
    linkedSource: false, sourceRevision: false, partFinishing: false, partRevolution: false, assemblyExport: false, structuralStep: false, structuralInsertion: false,
    presentation: { active, stopped: false, frames, captureBarriers: 0 }, presentationWaiters,
    window: withWindow ? { isVisible: () => false, webContents: { isDestroyed: () => false,
      endFrameSubscription() { events.push(['presentation-end']); duringCleanup(); if (cleanupError) throw cleanupError; } } } : undefined,
    check(condition, message) { if (!condition) throw Error(message); },
    saveCompletion: { enabled: !!primary, ordinal: 1, armed: true, pending: !!primary, samples: [] },
    releaseSaveCompletion(by) { context.saveCompletion.pending=false;context.saveCompletion.releasedBy=by;events.push(['release',by]); },
    owned: '/original-owned-test', activeScenario: { test: 'original-diagnostic-integration' },
    path, describeError: value => ({ name: value.name, message: value.message }),
    emitDesktopCiFailure(value) { events.push(['annotation', value.message]); },
    fs: { writeFileSync(_name, data) { writes.push(JSON.parse(data)); }, writeSync(_fd, data) { events.push(['json', JSON.parse(data).workflowStatus]); } },
    console: { error() {}, log() { throw Error('No PASS log allowed'); } }, process: { exitCode: undefined },
    app: { exit(code) { events.push(['exit', code]); }, quit() { throw Error('Failure must not call successful quit'); } }, error: primary,
  });
  // Run the actual waiter cleanup and finish bodies, not a mirrored teardown.
  vm.runInContext(source.slice(settleStart, settleEnd) + source.slice(start, end) + '\nfinish(error);', context);
  const firstEvents = events.slice();
  vm.runInContext('finish(error);', context);
  assert.deepEqual(events, firstEvents, 'Second finish must not repeat cleanup or reporting');
  return { context, events, writes, clearedTimers, rejected };
}

test('actual child finish releases Save, unsubscribes, rejects presentation waiters and retains the primary failure', () => {
  const error = new Error('Original child coordinate assertion');
  const { context, events, writes, clearedTimers, rejected } = exerciseChildFinish({ primary: error });
  assert.equal(writes[0].workflowStatus, 'FAIL'); assert.equal(writes[0].error.message, error.message);
  assert.deepEqual(events, [['release', 'cleanup'], ['presentation-end'], ['presentation-reject', 1], ['presentation-reject', 2],
    ['annotation', error.message], ['json', 'FAIL'], ['exit', 1]]);
  assert.deepEqual(clearedTimers, ['child-deadline', 'presentation-1', 'presentation-2']);
  assert.ok(rejected.every(value => value === error));
  assert.equal(context.presentationWaiters.size, 0);
  assert.equal(context.presentation.active, false); assert.equal(context.presentation.stopped, true);
  assert.equal(context.process.exitCode, 1);
});

test('presentation teardown failure cannot replace the original child failure or strand waiters', () => {
  const primary = new Error('Original worker assertion'), cleanupError = new Error('Subscription teardown failed');
  const { context, writes, rejected, events } = exerciseChildFinish({ primary, cleanupError });
  assert.equal(writes[0].workflowStatus, 'FAIL'); assert.equal(writes[0].error.message, primary.message);
  assert.ok(rejected.every(value => value === primary)); assert.equal(rejected.length, 2);
  assert.equal(context.presentationWaiters.size, 0);
  assert.deepEqual(events.filter(event => event[0] === 'annotation'), [['annotation', primary.message]]);
  assert.deepEqual(events.at(-1), ['exit', 1]);
});

test('early child failure before a window or subscription exists still reports the original error', () => {
  const primary = new Error('Initial production load failed');
  const { context, writes, events } = exerciseChildFinish({ primary, active: false, frames: 0, withWindow: false });
  assert.equal(writes[0].error.message, primary.message);
  assert.equal(events.some(event => event[0] === 'presentation-end'), false);
  assert.equal(context.presentationWaiters.size, 0);
  assert.deepEqual(events.at(-1), ['exit', 1]);
});

test('failed presentation invariant still tears down the active subscription and rejects its waiters', () => {
  const { context, writes, events, rejected } = exerciseChildFinish({ primary: null, frames: 0 });
  assert.equal(writes[0].workflowStatus, 'FAIL');
  assert.match(writes[0].error.message, /hidden presentation observer/);
  assert.equal(events.filter(event => event[0] === 'presentation-end').length, 1);
  assert.equal(rejected.length, 2); assert.ok(rejected.every(error => error.message === writes[0].error.message));
  assert.equal(context.presentationWaiters.size, 0);
  assert.equal(context.presentation.active, false); assert.equal(context.presentation.stopped, true);
});

test('actual finish retains a detached partial timing snapshot through cleanup and late completion', () => {
  const { createWorkflowTiming } = require('./desktop-workflow-timing.cjs');
  let now = 0;
  const timing = createWorkflowTiming(() => now);
  timing.enterPhase('authoring'); now = 40; timing.enterPhase('gear');
  const endResponse = timing.begin('assemblyResponse'), endEvaluate = timing.begin('evaluate');
  now = 65;
  const original = new Error('Original native preview deadline');
  const beforeFinish = timing.snapshot();
  const { writes, rejected, events } = exerciseChildFinish({ primary: original, timing,
    duringCleanup() { now = 90; endEvaluate(); } });
  const retained = writes[0].workflowTiming;
  assert.deepEqual(retained, beforeFinish);
  assert.equal(retained.currentPhase, 'gear');
  assert.equal(retained.phases.gear.status, 'pending');
  assert.equal(retained.phases.gear.durationMs, 25);
  assert.equal(retained.categories.evaluate.activeCount, 1);
  assert.equal(retained.categories.evaluate.pendingMs, 25);
  assert.equal(retained.categories.assemblyResponse.activeCount, 1);
  assert.equal(timing.snapshot().categories.evaluate.activeCount, 0, 'Cleanup has already completed the live operation');
  assert.equal(writes[0].error.message, original.message);
  assert.ok(rejected.every(error => error === original));
  assert.deepEqual(events.at(-1), ['exit', 1]);
  const immutableReport = JSON.stringify(retained);
  now = 100; endEvaluate(); endResponse(); timing.completePhase();
  assert.equal(timing.snapshot().categories.evaluate.activeCount, 0);
  assert.equal(JSON.stringify(retained), immutableReport);
  assert.deepEqual(retained, beforeFinish, 'Both snapshots remain detached after late promise cleanup');
});
