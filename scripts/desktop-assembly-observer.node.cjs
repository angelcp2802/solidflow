'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual injected observer without starting Electron or CAD.
function observer(options = []) {
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
  vm.runInContext(source.slice(start, end) + '\ninstallWorkerObserver(...' + JSON.stringify(options) + ');', context);
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

// Synthetic transport DTOs; these do not assert native CAD validity.
function normalScene(configured) {
  const bounds = { min: [0,0,0], max: [1,1,1] };
  return { kind: 'assembly-scene', sceneId: 'original', volume: 1, area: 6, solidCount: 1, prototypeCount: 1,
    bounds, visibleBounds: bounds, warnings: [], bodies: [{ component: { occurrencePath: ['original'] },
      body: { bodyId: 'original-body', sourceFeatureId: 'original-feature' }, name: 'Original', visible: true,
      worldPose: { translation: [0,0,0], rotation: [0,0,0,1] }, volume: 1, area: 6, solidCount: 1, bounds,
      ...(configured ? { configurationAncestry: [{ path: [], configuration: 'original' }] } : {}),
      faces: [{ selection: { face: { key: 'original-face' } }, support: null, worldSupport: null,
        worldViewAxis: { kind: 'axis', point: [0,0,0], direction: [0,0,1], xDirection: [1,0,0] }, vertices: [], triangles: [] }], edges: [] }] };
}

test('mixed normal-view observer retains standard and configured native metadata without inventing ancestry', () => {
  const { api, worker } = observer([false,false,false,true,false,false,false,true]);
  const scene = normalScene(false), configured = normalScene(true);
  worker.postMessage({ id: 'standard', action: 'build-assembly' });
  worker.emit('message', { id: 'standard', ok: true, value: scene });
  worker.postMessage({ id: 'configured', action: 'build-configured-assembly' });
  worker.emit('message', { id: 'configured', ok: true, value: { kind: 'configured-assembly-scene', context: {}, scene: configured, referenceDiagnostics: [] } });
  const rows = plain(api.snapshot()).assemblies;
  assert.equal(rows.length,2);
  assert.equal(Object.hasOwn(rows[0].response.value.bodies[0],'configurationAncestry'),false);
  assert.deepEqual(rows[1].response.value.scene.bodies[0].configurationAncestry,configured.bodies[0].configurationAncestry);
  assert.deepEqual(rows[0].response.value.bodies[0].faces[0].worldViewAxis,scene.bodies[0].faces[0].worldViewAxis);
  assert.equal(worker.sent.length,2);
});

test('configured observation still rejects a missing required configuration ancestry', () => {
  for (const mixed of [false,true]) {
    const { worker } = observer([false,false,false,true,false,false,false,mixed]);
    worker.postMessage({ id: 'configured', action: 'build-configured-assembly' });
    assert.throws(()=>worker.emit('message',{id:'configured',ok:true,value:{kind:'configured-assembly-scene',context:{},scene:normalScene(false),referenceDiagnostics:[]}}));
  }
});
