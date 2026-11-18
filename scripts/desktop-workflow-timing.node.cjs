'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkflowTiming } = require('./desktop-workflow-timing.cjs');

function fixture() { let time = 100; return { timing: createWorkflowTiming(() => time), at(value) { time = 100 + value; } }; }

test('overlapping waits and evaluations report inclusive totals and pending intervals without double-counting completions', () => {
  const { timing, at } = fixture();
  const response = timing.begin('assemblyResponse'); at(2);
  const inspect = timing.begin('waitInspect'), evaluate = timing.begin('evaluate'); at(7); evaluate(); inspect();
  const sleep = timing.begin('waitSleep'); at(10); sleep();
  const pending = timing.snapshot();
  assert.equal(pending.elapsedMs, 10);
  assert.deepEqual(pending.categories.assemblyResponse, { count: 1, completedCount: 0, totalMs: 10, maxCompletedMs: 0, activeCount: 1, pendingMs: 10 });
  assert.equal(pending.categories.evaluate.totalMs, 5); assert.equal(pending.categories.waitInspect.totalMs, 5);
  assert.equal(pending.categories.waitSleep.totalMs, 3);
  assert.match(pending.overlap, /evaluate is included in waitInspect\/assemblyResponse/);
  at(12); response(); response();
  assert.deepEqual(timing.snapshot().categories.assemblyResponse, { count: 1, completedCount: 1, totalMs: 12, maxCompletedMs: 12, activeCount: 0, pendingMs: 0 });
});

test('same-category concurrent intervals can finish out of order while pendingMs remains their sum', () => {
  const { timing, at } = fixture();
  const first = timing.begin('evaluate'); at(3); const second = timing.begin('evaluate');
  at(8); second();
  assert.deepEqual(timing.snapshot().categories.evaluate, { count: 2, completedCount: 1, totalMs: 13, maxCompletedMs: 5, activeCount: 1, pendingMs: 8 });
  at(11); first();
  assert.deepEqual(timing.snapshot().categories.evaluate, { count: 2, completedCount: 2, totalMs: 16, maxCompletedMs: 11, activeCount: 0, pendingMs: 0 });
});

test('finally closes a rejected operation while its interrupted phase stays pending at the deadline', async () => {
  const { timing, at } = fixture(); timing.enterPhase('gear');
  const error = new Error('Operation failed');
  await assert.rejects(async () => { const end = timing.begin('pointer'); try { at(9); throw error; } finally { end(); } }, value => value === error);
  at(15); const report = timing.snapshot();
  assert.equal(report.categories.pointer.completedCount, 1); assert.equal(report.categories.pointer.totalMs, 9);
  assert.deepEqual(report.phases.gear, { count: 1, durationMs: 15, status: 'pending' }); assert.equal(report.currentPhase, 'gear');
});

test('phase transitions close the previous phase and retain bounded aggregates on re-entry', () => {
  const { timing, at } = fixture(); timing.enterPhase('authoring'); at(4); timing.enterPhase('source');
  at(10); timing.enterPhase('authoring'); at(13); timing.completePhase(); timing.completePhase();
  const report = timing.snapshot();
  assert.deepEqual(report.phases.authoring, { count: 2, durationMs: 7, status: 'completed' });
  assert.deepEqual(report.phases.source, { count: 1, durationMs: 6, status: 'completed' });
  assert.deepEqual(report.phases.gear, { count: 0, durationMs: 0, status: 'idle' }); assert.equal(report.currentPhase, null);
});

test('snapshots are detached and late resolutions cannot mutate deadline evidence', () => {
  const { timing, at } = fixture(); timing.enterPhase('movement'); const end = timing.begin('evaluate'); at(5);
  const report = timing.snapshot(), exact = structuredClone(report); at(8); end(); timing.completePhase();
  assert.deepEqual(report, exact);
  report.categories.evaluate.count = 999; report.phases.movement.durationMs = 999;
  const next = timing.snapshot(); assert.equal(next.categories.evaluate.count, 1); assert.equal(next.phases.movement.durationMs, 8);
});

test('only fixed names are accepted without coercing or retaining caller data', () => {
  const { timing } = fixture(); let calls = 0;
  const hostile = { toString() { calls++; throw Error('must not execute'); } };
  for (const value of ['unknown', '__proto__', null, hostile]) {
    assert.throws(() => timing.begin(value), /Unknown workflow timing category/);
    assert.throws(() => timing.enterPhase(value), /Unknown workflow timing phase/);
  }
  assert.equal(calls, 0); assert.equal(Object.keys(timing.snapshot().categories).length, 5); assert.equal(Object.keys(timing.snapshot().phases).length, 9);
});

test('bad or regressing clock readings cannot break a synchronous deadline snapshot or produce nonfinite durations', () => {
  let value = 100, throws = false; const timing = createWorkflowTiming(() => { if (throws) throw Error('clock unavailable'); return value; });
  const end = timing.begin('evaluate'); value = 110; assert.equal(timing.snapshot().elapsedMs, 10);
  for (const bad of [105, NaN, Infinity, -1, '120']) { value = bad; assert.equal(timing.snapshot().elapsedMs, 10); }
  throws = true; end(); assert.equal(timing.snapshot().categories.evaluate.totalMs, 10);
  throws = false; value = Number.MAX_VALUE;
  const report = timing.snapshot(); assert.equal(report.elapsedMs, Number.MAX_SAFE_INTEGER);
  assert.doesNotThrow(() => JSON.stringify(report)); assert.equal(report.categories.evaluate.activeCount, 0);
});
