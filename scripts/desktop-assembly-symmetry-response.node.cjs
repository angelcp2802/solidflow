'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const createResponseReader = require('./desktop-assembly-symmetry-response.cjs');

const action = 'preview-assembly';
const check = (condition, message) => { if (!condition) throw new Error(message); };
function harness(states, inspectWait = inspect => inspect(), timing) {
  const reads = [], waits = [];
  const observe = () => { throw new Error('Full observer history must not be read'); };
  observe.assemblyResponseAfter = async (...args) => {
    reads.push(args);
    assert.ok(states.length, 'No extra projection read');
    return states.shift();
  };
  const read = createResponseReader({ observe, check, timing, waitFor: (...args) => {
    assert.equal(args.length, 2, 'Keep the existing default wait budget');
    waits.push(args[0]);
    return inspectWait(args[1]);
  } });
  return { read, reads, waits };
}

test('optional response timing closes exactly once on success and on the unchanged original wait error', async () => {
  const calls = [], timing = { begin(category) { calls.push(['begin', category]); return () => calls.push(['end', category]); } };
  const record = { response: { ok: true, value: { original: true } } };
  const successful = harness([{ workerErrors: [], completedCount: 1, record }], undefined, timing);
  assert.strictEqual(await successful.read(0, action), record);
  const failure = new Error('Original wait failure');
  const rejected = harness([], async () => { throw failure; }, timing);
  await assert.rejects(rejected.read(0, action), error => error === failure);
  assert.deepEqual(calls, [['begin', 'assemblyResponse'], ['end', 'assemblyResponse'], ['begin', 'assemblyResponse'], ['end', 'assemblyResponse']]);
});

test('symmetry response waits on pending projection and returns the complete unique record', async () => {
  const record = Object.freeze({ serial: 9, action, current: { id: 'baseline' }, proposed: { mates: ['original'] },
    response: Object.freeze({ ok: true, value: { scene: { bounds: { min: [0, 0, 0], max: [4, 6, 4] } } } }) });
  const pending = { workerErrors: [], completedCount: 0, record: null,
    matching: [{ serial: 9, hasResponse: false, ok: null }] };
  // A later pending request must not hide the one completed response.
  const completed = { workerErrors: [], completedCount: 1, record,
    matching: [{ serial: 9, hasResponse: true, ok: true }, { serial: 10, hasResponse: false, ok: null }] };
  const before = JSON.stringify([pending, completed]);
  const h = harness([pending, completed], async inspect => {
    assert.equal(await inspect(), false, 'No completed record remains pending');
    return inspect();
  });
  assert.strictEqual(await h.read(8, action), record, 'Do not replace, truncate or reconstruct the selected record');
  assert.deepEqual(h.reads, [[8, action], [8, action]], 'Keep the exact serial boundary and action on every poll');
  assert.deepEqual(h.waits, ['actual preview-assembly']);
  assert.equal(JSON.stringify([pending, completed]), before, 'Do not mutate observed evidence');
});

test('symmetry response rejects two completions before inspecting the latest reply', async () => {
  const state = { workerErrors: [], completedCount: 2,
    get record() { throw new Error('Duplicate response payload must not be accepted'); } };
  const h = harness([state]);
  await assert.rejects(h.read(4, action), { message: 'Duplicate preview-assembly' });
  assert.equal(h.reads.length, 1);
});

test('symmetry response uses exact completion count beyond the bounded diagnostic summary', async () => {
  const h = harness([{ workerErrors: [], completedCount: 12,
    matching: Array.from({ length: 10 }, (_, i) => ({ serial: i + 13, hasResponse: false, ok: null })),
    record: { serial: 12, action, response: { ok: true, value: null } } }]);
  await assert.rejects(h.read(0, action), { message: 'Duplicate preview-assembly' });
});

test('symmetry response reports worker errors before pending or duplicate handling', async () => {
  for (const completedCount of [0, 2]) {
    const h = harness([{ workerErrors: ['retained worker transport failure'], completedCount,
      get record() { throw new Error('Worker failure must be checked first'); } }]);
    await assert.rejects(h.read(0, action), { message: 'Actual worker errors' });
    assert.equal(h.reads.length, 1, 'No retry after a worker error');
  }
});

test('symmetry response preserves a rejected operation message and its fallback', async () => {
  for (const [error, message] of [['native rejection', 'native rejection'], ['', 'Actual operation failed']]) {
    const h = harness([{ workerErrors: [], completedCount: 1, record: { response: { ok: false, error } } }]);
    await assert.rejects(h.read(3, action), { message });
    assert.equal(h.reads.length, 1, 'No retry after an operation rejection');
  }
});

test('symmetry response propagates projection and wait failures unchanged', async () => {
  const projectionFailure = new Error('original projection failure');
  let reads = 0;
  const reader = createResponseReader({ check,
    observe: { assemblyResponseAfter: async () => { reads++; throw projectionFailure; } },
    waitFor: (_description, inspect) => inspect() });
  await assert.rejects(reader(0, action), error => error === projectionFailure);
  assert.equal(reads, 1);
  const deadlineFailure = new Error('original wait deadline');
  const h = harness([], async () => { throw deadlineFailure; });
  await assert.rejects(h.read(0, action), error => error === deadlineFailure);
  assert.equal(h.reads.length, 0);
});
