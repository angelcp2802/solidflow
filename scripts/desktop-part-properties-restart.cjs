'use strict';
const { createHash } = require('node:crypto');

const FIRST_PHASES = Object.freeze(['default-unselected', 'custom-unselected', 'selected', 'deselected-custom']);
const REOPEN_PHASES = Object.freeze(['recovered-custom', 'saved-open-custom', 'default-background']);
const BACKGROUND_KEY = 'solidflow.viewport-background.v1';
const BACKGROUND_CONTENT = JSON.stringify({ version: 1, color: '#ddeeff' });
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error('Part-properties restart: ' + message); };
const check = (condition, message) => { if (!condition) fail(message); };
const hash = value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
const equal = (a, b) => JSON.stringify(a, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)
  === JSON.stringify(b, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);

// Report/receipt data is test-owned JSON, never a native solve or file grant.
// Reject executable/hidden records before reading or hashing any nested value.
function plainData(value, budget = { nodes: 0 }, depth = 0) {
  check(++budget.nodes <= 200_000 && depth <= 40, 'report data exceeds its finite structure budget');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { check(Number.isFinite(value), 'nonfinite report number'); return; }
  if (typeof value === 'string') { check(value.length <= 1_000_000, 'report string exceeds its bound'); return; }
  check(value && typeof value === 'object', 'report contains non-JSON data');
  const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
  check(array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null, 'report prototype is not plain JSON data');
  const fields = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(fields);
  if (array) check(names.length === value.length + 1, 'report array must be dense without extra fields');
  for (const name of names) {
    const field = fields[name];
    if (array && name === 'length') continue;
    check(typeof name === 'string' && field.enumerable && Object.hasOwn(field, 'value'), 'report contains hidden or executable fields');
    if (array) check(/^(0|[1-9]\d*)$/.test(name) && Number(name) < value.length, 'report array index is invalid');
    plainData(field.value, budget, depth + 1);
  }
}
function fields(value, names) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)), 'receipt fields are incomplete or unknown');
}
function currentProcess(report, context, phase) {
  check(report.workflowStatus === 'PASS' && Array.isArray(report.consoleErrors) && report.consoleErrors.length === 0
    && Array.isArray(report.failedRequests) && report.failedRequests.length === 0, 'both complete child reports must be error-free PASS');
  const process = report.partPropertiesProcess;
  fields(process, ['phase', 'pid', 'tokenSha256', 'profileSha256', 'productionInputHashes']);
  check(process.phase === phase && Number.isSafeInteger(process.pid) && process.pid > 0 && process.pid === context.pid,
    'child phase and observed PID must match');
  check(hash(process.tokenSha256) && process.tokenSha256 === context.tokenSha256, 'owned token identity differs');
  check(hash(process.profileSha256) && process.profileSha256 === context.profileSha256, 'owned profile identity differs');
  check(context.productionInputHashes && ['electron/main.cjs', 'electron/preload.cjs', 'dist/index.html'].every(name => hash(context.productionInputHashes[name]))
    && Object.values(context.productionInputHashes).every(hash) && equal(process.productionInputHashes, context.productionInputHashes), 'production inputs differ between children');
  const results = report.checks?.filter(value => value && typeof value === 'object' && Object.hasOwn(value, 'partProperties'));
  check(results?.length === 1, 'one fixed part-properties workflow result is required');
  return results[0].partProperties;
}
function nativeCube(body) {
  check(body?.ref?.bodyId === 'original-properties-cube-body' && body.ref.sourceFeatureId === 'original-properties-extrusion'
    && body.createdByFeatureId === 'original-properties-extrusion' && Math.abs(body.volume - 1000) <= 1e-6
    && equal(body.bounds, { min: [-5, -5, 0], max: [5, 5, 10] })
    && Array.isArray(body.faces) && body.faces.length === 6 && Array.isArray(body.edges) && body.edges.length === 12,
  'current original native cube identity and bounded geometry are required');
}
function captures(report, phase, context, receipt) {
  const phases = phase === 'first' ? FIRST_PHASES : REOPEN_PHASES, captures = report.partPropertiesCaptures;
  check(typeof context.captureEnabled === 'boolean' && Array.isArray(captures)
    && captures.length === (context.captureEnabled ? phases.length : 0), 'fixed capture inventory differs');
  for (let index = 0; index < captures.length; index++) {
    const capture = captures[index], expected = phases[index];
    fields(capture, ['phase', 'name', 'repeatName', 'sha256', 'repeatSha256', 'bytes', 'repeatBytes', 'width', 'height', 'frame', 'noise', 'presented', 'stayHidden', 'visualAcceptance']);
    const name = 'part-properties-' + phase + '-' + expected;
    check(capture.phase === expected && capture.name === name + '.png' && capture.repeatName === name + '-repeat.png', 'capture names must belong to the fixed phase');
    check(hash(capture.sha256) && hash(capture.repeatSha256) && [capture.bytes, capture.repeatBytes].every(value => Number.isSafeInteger(value) && value > 0 && value <= 10 * 1024 * 1024)
      && Number.isSafeInteger(capture.width) && capture.width > 0 && Number.isSafeInteger(capture.height) && capture.height > 0
      && capture.presented === true && capture.stayHidden === true && capture.visualAcceptance === 'pending-review', 'capture evidence is missing or unbounded');
    const frame = capture.frame, bounds = frame?.viewportBounds;
    check(frame?.documentId === 'original-part-properties' && hash(frame.recoverySha256)
      && Number.isSafeInteger(frame.nativeSerial) && frame.nativeSerial > 0
      && Number.isFinite(frame.windowWidth) && Number.isFinite(frame.windowHeight) && frame.windowWidth > 0 && frame.windowHeight > 0
      && bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key]))
      && bounds.x >= 0 && bounds.y >= 0 && bounds.width > 0 && bounds.height > 0
      && bounds.x + bounds.width <= frame.windowWidth && bounds.y + bounds.height <= frame.windowHeight,
    'capture frame must stay inside its exact owned viewport');
    check(frame.bodyReference?.bodyId === 'original-properties-cube-body' && frame.bodyReference.sourceFeatureId === 'original-properties-extrusion', 'capture body identity differs');
    const selected = expected === 'selected', bodies = JSON.parse(frame.selection.bodies);
    check(Array.isArray(bodies) && bodies.length === Number(selected) && (!selected || equal(bodies[0], frame.bodyReference))
      && frame.selection.face === '' && frame.selection.edges === '[]', 'capture selection does not match its fixed phase');
    if (expected !== 'default-unselected') check(frame.recoverySha256 === receipt.recoverySha256, 'captured document differs from the saved/recovered receipt');
    check(capture.noise?.totalPixels === capture.width * capture.height && Number.isSafeInteger(capture.noise.changedPixels)
      && capture.noise.changedPixels >= 0 && capture.noise.changedPixels <= capture.noise.totalPixels
      && Number.isInteger(capture.noise.maxByteDelta) && capture.noise.maxByteDelta >= 0 && capture.noise.maxByteDelta <= 255,
    'same-state observation must report bounded pixel noise without a fabricated tolerance');
  }
}
function partPropertiesReopenPhase(flag, allowed) {
  check(typeof allowed === 'boolean', 'scenario gate must be explicit');
  if (flag === undefined) return allowed ? 'first' : null;
  check(allowed && flag === '1', 'reopen flag is valid only in the exact fixed transition scenario');
  return 'reopen';
}
function validatePartPropertiesFirstReport(report, context) {
  plainData(report); plainData(context);
  const result = currentProcess(report, context, 'first'), receipt = result.restartReceipt;
  fields(receipt, ['version', 'kind', 'document', 'savedContent', 'savedSha256', 'recoveryContent', 'recoverySha256', 'backgroundKey', 'backgroundContent',
    'defaultBackground', 'originalSha256', 'nativeSerial', 'nativeBody']);
  check(receipt.version === 1 && receipt.kind === 'part-properties-profile-restart', 'wrong receipt kind/version');
  check(typeof receipt.savedContent === 'string' && receipt.savedContent.length > 0 && receipt.savedContent.length <= 65536
    && hash(receipt.savedSha256) && sha(receipt.savedContent) === receipt.savedSha256, 'exact saved bytes/hash are required');
  check(receipt.recoveryContent === receipt.savedContent && receipt.recoverySha256 === receipt.savedSha256
    && sha(receipt.recoveryContent) === receipt.recoverySha256, 'phase one must retain the exact opened recovery bytes');
  check(equal(JSON.parse(receipt.savedContent), receipt.document) && receipt.document.id === 'original-part-properties' && receipt.document.version === 1
    && equal(receipt.document.material, { name: 'Material sintético original', densityKgPerM3: 1000 })
    && equal(receipt.document.appearance, { color: '#cc6633' }), 'receipt must describe the actual saved original material cube');
  check(receipt.backgroundKey === BACKGROUND_KEY && receipt.backgroundContent === BACKGROUND_CONTENT
    && receipt.defaultBackground?.persisted === null && receipt.defaultBackground.inlineBackground === '', 'custom profile preference and original default must be retained');
  check(hash(receipt.originalSha256) && Number.isSafeInteger(receipt.nativeSerial) && receipt.nativeSerial > 0, 'original/native receipt identity is missing');
  nativeCube(receipt.nativeBody); captures(report, 'first', context, receipt);
  return JSON.parse(JSON.stringify(receipt));
}
function validatePartPropertiesReopenReport(first, second, context) {
  const receipt = validatePartPropertiesFirstReport(first, { ...context, pid: context.firstPid });
  plainData(second);
  const result = currentProcess(second, context, 'reopen').restartResult;
  fields(result, ['bootstrapRecoverySha256', 'bootstrapBackgroundContent', 'bootstrapBeforeControls', 'bootstrapBeforeFileIpc', 'bootstrapNativeSerial', 'bootstrapNativeBody',
    'savedSha256', 'reopenedRecoverySha256', 'defaultBackground', 'originalSha256']);
  check(second.partPropertiesProcess.pid !== first.partPropertiesProcess.pid, 'restart must use two distinct actual child processes');
  check(result.bootstrapRecoverySha256 === receipt.recoverySha256 && result.bootstrapBackgroundContent === receipt.backgroundContent
    && result.bootstrapBeforeControls === 0 && result.bootstrapBeforeFileIpc === 0, 'startup recovery and preference must be observed before any control/Open');
  check(Number.isSafeInteger(result.bootstrapNativeSerial) && result.bootstrapNativeSerial > 0 && equal(result.bootstrapNativeBody, receipt.nativeBody), 'fresh bootstrap must rebuild the matching original native cube');
  check(result.savedSha256 === receipt.savedSha256 && result.reopenedRecoverySha256 === receipt.recoverySha256
    && result.originalSha256 === receipt.originalSha256 && equal(result.defaultBackground, receipt.defaultBackground), 'reopen/reset altered document bytes or did not restore the original default');
  captures(second, 'reopen', context, receipt);
  return receipt;
}

module.exports = Object.freeze({ FIRST_PHASES, REOPEN_PHASES, BACKGROUND_KEY, BACKGROUND_CONTENT, partPropertiesReopenPhase,
  validatePartPropertiesFirstReport, validatePartPropertiesReopenReport });
