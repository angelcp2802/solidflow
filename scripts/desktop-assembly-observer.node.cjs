'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual injected observer without starting Electron or CAD.
function observer() {
  const source = fs.readFileSync(path.join(__dirname, 'desktop-pattern-ui.cjs'), 'utf8');
  const start = source.indexOf('function installWorkerObserver(');
  const end = source.indexOf('\nasync function runInElectron()', start);
  assert.ok(start >= 0 && end > start);
  class Worker {
    constructor() { this.listeners = new Map(); this.sent = []; }
    postMessage(message) { this.sent.push(message); }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    emit(type, data) { this.listeners.get(type)({ data, message: data }); }
  }
  // DOM mutation auditing is outside this worker-projection test.
  const context = vm.createContext({ Worker, Blob, document: {}, MutationObserver: class { observe() {} } });
  vm.runInContext(source.slice(start, end) + '\ninstallWorkerObserver();', context);
  return { api: context.__solidflowUiTestObservation, worker: vm.runInContext('new Worker()', context) };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('assembly response projection preserves complete selected record, errors and strict boundary among pending/completed actions', () => {
  const { api, worker } = observer();
  const action = 'preview-assembly-part-update';
  worker.postMessage({ id: 'older', action, current: { id: 'original', nested: { retained: true } } });
  worker.emit('message', { id: 'older', ok: true, value: null });
  worker.postMessage({ id: 'other', action: 'discard-assembly' });
  worker.emit('message', { id: 'other', ok: true, value: null });
  worker.postMessage({ id: 'rejected', action, proposed: { id: 'proposal' } });
  worker.emit('message', { id: 'rejected', ok: false, error: 'actual rejection' });
  worker.postMessage({ id: 'pending', action });
  worker.emit('error', 'worker error retained');
  const full = plain(api.snapshot());
  const matching = full.assemblies.filter(row => row.serial > 1 && row.action === action);
  assert.deepEqual(plain(api.assemblyResponseAfter(1, action)), {
    serial: 4, assemblyCount: 4, workerErrors: ['worker error retained'],
    record: full.assemblies[2], completedCount: 1,
    matching: matching.map(row => ({ serial: row.serial, hasResponse: !!row.response, ok: row.response?.ok ?? null })),
  });
  assert.deepEqual(plain(api.assemblyResponseAfter(3, action)), {
    serial: 4, assemblyCount: 4, workerErrors: ['worker error retained'], record: null, completedCount: 0,
    matching: [{ serial: 4, hasResponse: false, ok: null }],
  });
  assert.equal(api.assemblyResponseAfter(0, action).completedCount, 2);
  assert.equal(worker.sent.length, 4, 'observer forwards every original request');
  const projected = api.assemblyResponseAfter(1, action);
  projected.record.proposed.id = 'mutated copy';
  projected.workerErrors.length = 0;
  assert.deepEqual(plain(api.snapshot()), full, 'returned copies cannot change retained observations');
});

test('completed cardinality stays exact beyond the ten-record diagnostic window', () => {
  const { api, worker } = observer();
  const action = 'preview-assembly-part-update';
  for (let i = 0; i < 14; i++) {
    const id = String(i);
    worker.postMessage({ id, action });
    if (i < 12) worker.emit('message', { id, ok: true, value: null });
  }
  const projected = api.assemblyResponseAfter(0, action);
  assert.equal(projected.completedCount, 12);
  assert.equal(projected.matching.length, 10);
  assert.equal(projected.record.serial, 12);
  assert.equal(projected.matching.filter(row => row.hasResponse).length, 8);
  assert.deepEqual(plain(api.assemblyResponseAfter(14, action)), {
    serial: 14, assemblyCount: 14, workerErrors: [], record: null, completedCount: 0, matching: [],
  });
});
