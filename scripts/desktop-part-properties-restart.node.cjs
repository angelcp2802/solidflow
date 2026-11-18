'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const contract = require('./desktop-part-properties-restart.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

// Syntax-only original test reports. Their placeholder faces/edges do not
// attest geometry, renderer presentation, actual child PIDs or application IO.
function originalReports(captureEnabled = false) {
  const original = require('./desktop-part-properties-original.cjs')(), document = { ...original,
    material: { name: 'Material sintético original', densityKgPerM3: 1000 }, appearance: { color: '#cc6633' } };
  const savedContent = JSON.stringify(document, null, 2), savedSha256 = sha(savedContent);
  const nativeBody = { ref: { bodyId: 'original-properties-cube-body', sourceFeatureId: 'original-properties-extrusion' },
    createdByFeatureId: 'original-properties-extrusion', volume: 1000, bounds: { min: [-5, -5, 0], max: [5, 5, 10] },
    faces: Array.from({ length: 6 }, (_, i) => ({ originalUnattestedFace: i })), edges: Array.from({ length: 12 }, (_, i) => ({ originalUnattestedEdge: i })) };
  const context = { pid: 102, firstPid: 101, tokenSha256: 'a'.repeat(64), profileSha256: 'b'.repeat(64), captureEnabled,
    productionInputHashes: { 'electron/main.cjs': 'c'.repeat(64), 'electron/preload.cjs': 'd'.repeat(64), 'dist/index.html': 'e'.repeat(64) } };
  const defaultBackground = { persisted: null, inlineBackground: '', backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none' };
  const receipt = { version: 1, kind: 'part-properties-profile-restart', document, savedContent, savedSha256,
    recoveryContent: savedContent, recoverySha256: savedSha256, backgroundKey: contract.BACKGROUND_KEY,
    backgroundContent: contract.BACKGROUND_CONTENT, defaultBackground, originalSha256: sha(JSON.stringify(original)), nativeSerial: 6, nativeBody };
  const process = (phase, pid) => ({ phase, pid, tokenSha256: context.tokenSha256, profileSha256: context.profileSha256, productionInputHashes: copy(context.productionInputHashes) });
  const captures = (phase, phases) => captureEnabled ? phases.map(name => ({ phase: name,
    name: 'part-properties-' + phase + '-' + name + '.png', repeatName: 'part-properties-' + phase + '-' + name + '-repeat.png',
    sha256: '1'.repeat(64), repeatSha256: '2'.repeat(64), bytes: 1000, repeatBytes: 1001, width: 1024, height: 681,
    frame: { documentId: document.id, recoverySha256: savedSha256, nativeSerial: 6, bodyReference: copy(nativeBody.ref),
      viewportBounds: { x: 270, y: 150, width: 500, height: 478 }, windowWidth: 1024, windowHeight: 681,
      selection: { bodies: JSON.stringify(name === 'selected' ? [nativeBody.ref] : []), face: '', edges: '[]' } },
    noise: { changedPixels: 3, totalPixels: 1024 * 681, maxByteDelta: 4 }, presented: true, stayHidden: true, visualAcceptance: 'pending-review' })) : [];
  const first = { workflowStatus: 'PASS', consoleErrors: [], failedRequests: [], partPropertiesProcess: process('first', 101),
    partPropertiesCaptures: captures('first', contract.FIRST_PHASES), checks: [{ partProperties: { restartReceipt: receipt } }] };
  const second = { workflowStatus: 'PASS', consoleErrors: [], failedRequests: [], partPropertiesProcess: process('reopen', 102),
    partPropertiesCaptures: captures('reopen', contract.REOPEN_PHASES), checks: [{ partProperties: { restartResult: {
      bootstrapRecoverySha256: savedSha256, bootstrapBackgroundContent: contract.BACKGROUND_CONTENT, bootstrapBeforeControls: 0, bootstrapBeforeFileIpc: 0,
      bootstrapNativeSerial: 1, bootstrapNativeBody: copy(nativeBody), savedSha256, reopenedRecoverySha256: savedSha256,
      defaultBackground: copy(defaultBackground), originalSha256: receipt.originalSha256,
    } } }] };
  return { first, second, context };
}

test('reopen flag is closed to the single fixed transition scenario', () => {
  assert.equal(contract.partPropertiesReopenPhase(undefined, false), null);
  assert.equal(contract.partPropertiesReopenPhase(undefined, true), 'first');
  assert.equal(contract.partPropertiesReopenPhase('1', true), 'reopen');
  for (const [flag, allowed] of [['1', false], ['0', true], ['', true], [1, true], ['1', undefined]]) {
    assert.throws(() => contract.partPropertiesReopenPhase(flag, allowed));
  }
});
test('strict receipt accepts matching complete phases and returns detached metadata only', () => {
  for (const enabled of [false, true]) {
    const { first, second, context } = originalReports(enabled), before = JSON.stringify({ first, second });
    const receipt = contract.validatePartPropertiesReopenReport(first, second, context);
    assert.equal(receipt.savedSha256, sha(receipt.savedContent));
    receipt.document.name = 'Changed detached receipt';
    assert.equal(JSON.stringify({ first, second }), before);
  }
});
test('different actual child, token, profile and production identities cannot masquerade as a restart', () => {
  for (const field of ['pid', 'tokenSha256', 'profileSha256', 'productionInputHashes']) {
    const { first, second, context } = originalReports();
    second.partPropertiesProcess[field] = field === 'pid' ? 101 : field === 'productionInputHashes'
      ? { ...context.productionInputHashes, 'dist/index.html': 'f'.repeat(64) } : 'f'.repeat(64);
    assert.throws(() => contract.validatePartPropertiesReopenReport(first, second, context), undefined, field);
  }
  const { first, second, context } = originalReports();
  context.pid = 101; second.partPropertiesProcess.pid = 101;
  assert.throws(() => contract.validatePartPropertiesReopenReport(first, second, context), /distinct actual child/);
});
test('saved bytes, actual recovery, material and custom preference must agree before restart', () => {
  const mutations = [receipt => { receipt.savedContent += '\n' }, receipt => { receipt.recoveryContent += '\n' },
    receipt => { receipt.document.appearance.color = '#000000' }, receipt => { receipt.backgroundContent = null },
    receipt => { receipt.backgroundKey = 'other-profile-key' }, receipt => { receipt.nativeBody.ref.sourceFeatureId = 'other-owner' },
    receipt => { receipt.extra = true }];
  for (const mutate of mutations) {
    const { first, context } = originalReports(); mutate(first.checks[0].partProperties.restartReceipt);
    assert.throws(() => contract.validatePartPropertiesFirstReport(first, { ...context, pid: 101 }));
  }
});
test('Open or a control before bootstrap cannot manufacture recovery and a default reset is mandatory', () => {
  for (const field of ['bootstrapBeforeControls', 'bootstrapBeforeFileIpc', 'bootstrapRecoverySha256', 'bootstrapBackgroundContent', 'defaultBackground']) {
    const { first, second, context } = originalReports(), result = second.checks[0].partProperties.restartResult;
    result[field] = field === 'defaultBackground' ? { ...result.defaultBackground, persisted: contract.BACKGROUND_CONTENT }
      : field.startsWith('bootstrapBefore') ? 1 : 'not-the-startup-value';
    assert.throws(() => contract.validatePartPropertiesReopenReport(first, second, context), undefined, field);
  }
});
test('capture receipts are bound to fixed names, bounded owned rectangles and true selection phases', () => {
  for (const mutate of [capture => { capture.name = '../outside.png' }, capture => { capture.repeatName = 'other.png' },
    capture => { capture.frame.viewportBounds.width = 1025 }, capture => { capture.frame.viewportBounds.x = -1 },
    capture => { capture.frame.selection.bodies = '[{}]' }, capture => { capture.bytes = 10 * 1024 * 1024 + 1 },
    capture => { capture.sha256 = 'not-a-hash' }, capture => { capture.sha256 += '\n' }, capture => { capture.noise.changedPixels = -1 }, capture => { capture.extra = true }]) {
    const { first, second, context } = originalReports(true); mutate(first.partPropertiesCaptures[0]);
    assert.throws(() => contract.validatePartPropertiesReopenReport(first, second, context));
  }
  const { first, second, context } = originalReports(true); second.partPropertiesCaptures.push(copy(second.partPropertiesCaptures[0]));
  assert.throws(() => contract.validatePartPropertiesReopenReport(first, second, context), /fixed capture inventory/);
});
test('report guards reject executable and non-JSON input without invoking accessors', () => {
  for (const kind of ['getter', 'symbol', 'prototype', 'sparse']) {
    const { first, context } = originalReports(true); let reads = 0;
    if (kind === 'getter') Object.defineProperty(first.partPropertiesProcess, 'pid', { enumerable: true, get() { reads++; return 101 } });
    if (kind === 'symbol') first[Symbol('extra')] = true;
    if (kind === 'prototype') Object.setPrototypeOf(first, { inherited: true });
    if (kind === 'sparse') delete first.partPropertiesCaptures[0];
    assert.throws(() => contract.validatePartPropertiesFirstReport(first, { ...context, pid: 101 })); assert.equal(reads, 0);
  }
});
