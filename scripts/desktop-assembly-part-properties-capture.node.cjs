'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { captureNativeFrame } = require('./desktop-assembly-part-properties-capture.cjs');

// Synthetic transport shapes only. Native acceptance remains with the real
// worker and the separately executed fixed renderer workflow.
const record = value => ({ response: { ok: true, value } });
test('configured build and authenticated Apply observations retain the same real wrapper context', () => {
  const scene = Object.freeze({ kind: 'assembly-scene' }), context = Object.freeze({ sourceSignature: 'original', generation: 3 });
  const wrapper = Object.freeze({ kind: 'configured-assembly-scene', scene, context });
  for (const value of [wrapper, Object.freeze({ kind: 'configured-assembly-applied', scene: wrapper, generation: 2 })]) {
    const before = JSON.stringify(value), frame = captureNativeFrame(record(value), true);
    assert.strictEqual(frame.scene, scene); assert.strictEqual(frame.context, context);
    assert.equal(JSON.stringify(value), before, 'Read-only transport projection does not fabricate or replace context');
  }
});
test('standard build and Apply shapes retain scene identity without configured context', () => {
  const scene = Object.freeze({ kind: 'assembly-scene' });
  for (const value of [scene, Object.freeze({ kind: 'assembly-applied', scene })]) {
    const frame = captureNativeFrame(record(value), false);
    assert.strictEqual(frame.scene, scene); assert.equal(frame.context, null);
  }
});
test('capture projection rejects wrong workspace, preview, missing wrapper/context and worker failures', () => {
  const scene = { kind: 'assembly-scene' }, wrapper = { kind: 'configured-assembly-scene', scene, context: {} };
  for (const value of [scene, { kind: 'configured-assembly-preview', scene: wrapper }, { kind: 'configured-assembly-applied', scene },
    { kind: 'configured-assembly-scene', scene }, { kind: 'configured-assembly-scene', context: {}, scene: {} }]) assert.throws(() => captureNativeFrame(record(value), true));
  for (const value of [wrapper, { kind: 'assembly-preview', scene }, null]) assert.throws(() => captureNativeFrame(record(value), false));
  assert.throws(() => captureNativeFrame({ response: { ok: false, error: 'Actual worker rejection' } }, true));
});
