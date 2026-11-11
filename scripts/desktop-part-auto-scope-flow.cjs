'use strict';
const fsp = require('node:fs/promises');
const { createHash } = require('node:crypto');

module.exports = function autoScopeWorkflow(context) {
  const { expected, input, output, autoScopeStepPath, observe, waitFor, checks, protocolResponses,
    consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts, pendingWorker } = context;
  const records = [], interactions = [], captures = [];
  const evidence = { records, interactions, captures,
    scope: 'Actual linear cut/refill creation and automatic discovery, held native request/Cancel, same captured identities during an invalid edit, explicit recapture, Apply, history, Save As/Open and physical STEP',
    inputLimits: 'CDP pointer controls and native visible field setters. One actual worker callback is paused and resumed unchanged. No geometry, document, React, worker response or file data is injected.',
    tolerances: { volumeMm3: 1e-5, planarMeshAreaMm2: 1e-5, boundsMm: 1e-6 } };
  checks.push({ partAutoScope: evidence });
  const { page, press, change, file } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions });
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const SCOPE = 'select[aria-label="Alcance de los cuerpos de la repetición"]';
  const STEP = 'select[aria-label="Operación para seleccionar su geometría"]';
  const OUTPUT = '[aria-label="Resultados de la operación para repetir"] input';
  const SPACING = 'input[aria-label="Separación en dirección 1"]';
  const rediscover = () => press('.property-manager button.outline-button', 'Volver a detectar cuerpos');
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const readCaptures = async () => (await observe()).autoCaptures ?? [];
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    `${label}: actual=${actual}, expected=${wanted}, tolerance=${tolerance}`);
  const ownerOracles = { S: [0, 2, 2, 'source-fill'], A: [10, 2, 2, 'create-a'], B: [10, -4, 4, 'create-b'],
    D: [20, -4, 4, 'create-d'], C: [30, -4, 4, 'create-c'] };
  const originalBodies = new Map();
  const declaration = (features, spacing, ids) => features.length === expected.features.length + 1
    && features.at(-1)?.type === 'linearPattern' && features.at(-1).first.spacing === spacing
    && canonical(features.at(-1).featurePattern?.capturedBodyIds) === canonical(ids);

  async function response(serial, predicate, phase) {
    return waitFor('fresh actual native AUTO build ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No AUTO worker transport errors');
      return state.builds.filter(record => record.serial > serial && record.response && predicate(record.features)).at(-1);
    });
  }

  function healthy(record, changedId, phase) {
    check(record.response.ok, record.response.error || 'AUTO worker build failed');
    const model = record.response.value;
    check(canonical(record.features.slice(0, expected.features.length)) === canonical(expected.features), 'The exact original construction history is retained');
    check(model.bodyCatalogActive && model.bodies.length === 5 && !model.featureErrors.length, 'Five healthy native body owners');
    const bodies = Object.entries(ownerOracles).map(([id, [x, z, depth, source]]) => {
      const body = model.bodies.find(owner => owner.ref.bodyId === id);
      const changed = id === changedId;
      check(body?.createdByFeatureId === 'create-' + id.toLowerCase() && body.ref.sourceFeatureId === (changed ? record.features.at(-1).id : source), 'Exact creator and current reference for ' + id);
      near(body.volume, changed ? 48 : 16 * depth, 1e-5, 'Literal owner volume ' + id);
      near(body.meshAreaMm2, changed ? 88 : 32 + 16 * depth, 1e-5, 'Literal planar mesh area ' + id);
      const bounds = { min: [x, 0, z], max: [x + 4, 4, z + depth] };
      for (const side of ['min', 'max']) bounds[side].forEach((value, axis) => near(body.bounds[side][axis], value, 1e-6, 'Literal bounds of ' + id));
      if (!originalBodies.has(id)) originalBodies.set(id, structuredClone(body));
      else if (!changed) check(canonical(body) === canonical(originalBodies.get(id)), 'Restored/unaffected owner retains exact native DTO ' + id);
      return body;
    });
    near(model.volume, changedId ? 240 : 256, 1e-5, 'Literal complete model volume');
    records.push({ phase, serial: record.serial, pattern: record.features.at(-1).featurePattern ?? null, bodies });
    return record;
  }

  async function committed(record, phase) {
    const snapshot = await waitFor('committed AUTO recovery ' + phase, async () => {
      const state = await page(() => {
        const value = localStorage.getItem('solidflow.autosave');
        if (!value || document.querySelector('.property-manager') || !document.querySelector('.statusbar')?.textContent.includes('Listo')) return null;
        const history = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => document.querySelector(`button[title="${title}"]`)?.disabled);
        return { recovery: value, history, title: document.querySelector('.document-title')?.textContent };
      });
      return state && canonical(JSON.parse(state.recovery).features) === canonical(record.features) ? state : false;
    });
    records.push({ phase: phase + '-committed', recoverySha256: digest(snapshot.recovery), history: snapshot.history });
    return snapshot;
  }

  async function ready() {
    await waitFor('fresh normal AUTO preview enables Apply', () => page(selector => {
      const button = document.querySelector(selector);
      return button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }

  async function captureAt(index, ids) {
    const record = await waitFor('authentic AUTO capture reply ' + (index + 1), async () => {
      const captured = await readCaptures(); return captured[index]?.response && captured[index];
    });
    const { value } = record.response, candidate = record.features.at(-1), operation = candidate.featurePattern;
    check(record.response.ok && value.kind === 'feature-recipe-auto-scope' && value.patternId === candidate.id
      && record.patternId === candidate.id && value.evaluatorRevision === 'intrinsic-auto-selected-sketch-radius-v11', 'Actual worker returns only matching detached AUTO intent');
    check(canonical(record.fields) === canonical(['action', 'features', 'id', 'patternId']) && operation.scope === 'all'
      && operation.reevaluateAt === 'patternInput' && !Object.hasOwn(operation, 'capturedBodyIds'), 'Capture receives only the temporary ALL declaration and its pattern identity');
    check(canonical(value.scope.capturedBodyIds) === canonical(ids) && value.scope.follow === 'sameIdentityAtPatternInput'
      && /^auto-scope-v1:[a-f0-9]{64}$/.test(value.scope.captureFingerprint), 'Observed native event capture has exact expected body IDs and provenance format');
    const sourceSignature = createHash('sha256').update(JSON.stringify({ patternId: candidate.id, features: record.features })).digest('hex');
    check(value.sourceFeaturesSignature === sourceSignature, 'Independent digest binds the exact capture request and operation');
    captures.push(record);
    return record;
  }

  function matchesCapture(build, capture) {
    const feature = build.features.at(-1), intent = capture.response.value.scope;
    check(build.serial > capture.serial && feature.id === capture.patternId && feature.baseFeatureId === 'create-c'
      && canonical(feature.source) === canonical({ mode: 'features', geometryPattern: false, featureIds: ['source-cut', 'source-fill'] }), 'Current preview belongs to the requested canonical historical sequence');
    check(canonical(feature.featurePattern) === canonical({ mode: 'regenerate', scope: 'auto', capturedBodyIds: intent.capturedBodyIds,
      captureFingerprint: intent.captureFingerprint, follow: intent.follow, bindings: ['source-cut', 'source-fill']
        .map(sourceFeatureId => ({ source: { bodyId: 'S', sourceFeatureId }, targetBodyIds: 'scope' })), referencePolicies: [], variation: { kind: 'none' } }),
    'Fresh normal preview persists only exact captured IDs, provenance, historical bindings and following policy');
  }

  async function createDraft() {
    const seed = '.part-body-catalog .body-row:has(.body-row-name[title^="Original body S ·"]) input';
    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) await press('.part-body-catalog-toggle');
    if (!await page(selector => document.querySelector(selector)?.checked, seed)) await press(seed);
    await waitFor('S exact current source is selected', () => page(() => document.querySelector('.viewport-canvas')?.getAttribute('data-part-selected-bodies')
      === JSON.stringify([{ bodyId: 'S', sourceFeatureId: 'source-fill' }])));
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Matriz lineal"]');
    const sourceType = 'select[aria-label="Tipo de repetición en cuerpos"]';
    await waitFor('current native body catalog enables pattern source controls', () => page(selector => {
      const field = document.querySelector(selector); return field && !field.disabled;
    }, sourceType));
    await change(sourceType, 'features');
    await press('input[aria-label="Repetir Original corner cut"]');
    await press('input[aria-label="Repetir Original corner fill"]');
    await press('input[aria-label="Repetir Original corner fill"]');
    await change('select[aria-label="Método de repetición de operaciones"]', 'regenerate');
    await change(SCOPE, 'all');
    await change(STEP, 'source-cut'); await press(OUTPUT);
    await change(STEP, 'source-fill'); await press(OUTPUT);
    await change('input[aria-label="Instancias en dirección 1"]', 2);
    const serial = (await observe()).serial; await change(SPACING, 10);
    await response(serial, features => features.at(-1)?.first?.spacing === 10 && features.at(-1)?.featurePattern?.scope === 'all', 'provisional ALL');
    await ready();
  }

  async function edit(feature) {
    await press(`.tree-row[data-feature-id="${feature.id}"]:not([data-parent-feature-id])`);
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('exact saved AUTO edit shows current captured owners', () => page(selector => document.querySelector(selector)?.value === 'auto'
      && document.querySelectorAll('[aria-label="Cuerpos detectados para la repetición"] li').length === 2, SCOPE));
  }

  async function accept(preview, changedId, phase) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const record = healthy(await response(serial, features => canonical(features) === canonical(preview.features), phase), changedId, phase);
    return { record, snapshot: await committed(record, phase) };
  }

  async function restore(stage, control, changedId, phase) {
    const serial = (await observe()).serial; await press(control);
    const record = healthy(await response(serial, features => canonical(features) === canonical(stage.record.features), phase), changedId, phase);
    const snapshot = await committed(record, phase);
    check(snapshot.recovery === stage.snapshot.recovery, 'One normal action restores exact committed AUTO recovery');
    if (control === CANCEL) check(canonical(snapshot) === canonical(stage.snapshot), 'Cancel restores original history availability and title');
  }

  return async () => {
    await waitFor('production AUTO file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const originalBytes = await fsp.readFile(input);
    let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]'); await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const initial = healthy(await response(serial, features => canonical(features) === canonical(expected.features), 'original'), null, 'original');
    const original = { record: initial, snapshot: await committed(initial, 'original') };

    await createDraft();
    await pendingWorker.arm('auto-scope');
    await change(SCOPE, 'auto');
    const paused = await waitFor('real AUTO request held before native execution', async () => {
      const sample = await pendingWorker.sample(); return sample.paused && sample;
    });
    const sent = (await readCaptures())[0];
    check(paused.request.id === sent.id && !sent.response, 'The genuine dispatched capture is pending and unmodified');
    check(await page(selector => document.querySelector(selector)?.disabled
      && document.querySelector('.property-manager [role="status"]')?.textContent.includes('Detectando cuerpos'), APPLY), 'Pending capture visibly disables the previously ready Apply');
    await press(CANCEL);
    await waitFor('direct Cancel removes original AUTO editor before worker reply', () => page(() => !document.querySelector('.property-manager')));
    check(await recovery() === original.snapshot.recovery && !(await readCaptures())[0].response, 'Cancel preserves committed bytes while the real request is pending');
    await pendingWorker.release();
    const canceledCapture = await captureAt(0, ['A', 'B']);
    const afterLate = healthy(await response(sent.serial, features => canonical(features) === canonical(expected.features), 'late-cancel'), null, 'late-cancel');
    check(canonical(await committed(afterLate, 'late-cancel')) === canonical(original.snapshot), 'Authentic late response leaves the original state and history unchanged');
    check(!(await observe()).builds.some(item => item.features.at(-1)?.id === canceledCapture.patternId && item.features.at(-1)?.featurePattern?.scope === 'auto'), 'Canceled native capture never creates an AUTO preview');
    evidence.pendingCancel = { paused, canceledPatternId: canceledCapture.patternId, workerReplyEvent: canceledCapture.responseEventSerial, noDraftBuild: true };

    await createDraft(); await change(SCOPE, 'auto');
    const initialCapture = await captureAt(1, ['A', 'B']);
    check(initialCapture.patternId !== canceledCapture.patternId, 'Reentry owns a fresh pattern identity');
    const candidate = healthy(await response(initialCapture.serial, features => declaration(features, 10, ['A', 'B']), 'captured A/B'), 'B', 'captured A/B');
    matchesCapture(candidate, initialCapture);
    const created = await accept(candidate, 'B', 'accepted A/B');
    const feature = created.record.features.at(-1);

    async function moveWithPinnedScope() {
      await edit(feature); const before = (await observe()).serial; await change(SPACING, 20);
      const failed = await response(before, features => declaration(features, 20, ['A', 'B']), 'move without recapture');
      check(failed.response.ok && failed.response.value.featureErrors.some(error => error.id === feature.id && /changes no material/.test(error.message)), 'The pinned set gives a recoverable native no-material error at +20');
      check(canonical(failed.features.at(-1).featurePattern) === canonical(feature.featurePattern) && (await readCaptures()).length === 2,
        'Editing placement issues no automatic rediscovery and preserves the complete captured intent');
      check(canonical(failed.response.value.bodies) === canonical(initial.response.value.bodies), 'Failed preview publishes no partial owner change');
      await waitFor('invalid pinned edit disables Apply', () => page(selector => document.querySelector(selector)?.disabled
        && document.querySelector('.error-banner[role="alert"]')?.textContent.includes('changes no material'), APPLY));
      check(await recovery() === created.snapshot.recovery, 'Invalid moved draft leaves committed recovery unchanged');
      records.push({ phase: 'pinned-move-error', serial: failed.serial, errors: failed.response.value.featureErrors });
    }

    await moveWithPinnedScope(); await restore(created, CANCEL, 'B', 'cancel pinned move');
    await moveWithPinnedScope();
    const beforeEmpty = (await observe()).serial; await change(SPACING, 25);
    await response(beforeEmpty, features => declaration(features, 25, ['A', 'B']), 'pinned empty placement');
    await rediscover();
    const failedCapture = await waitFor('empty placement returns an actual capture error', async () => {
      const record = (await readCaptures())[2]; return record?.response && record;
    });
    check(failedCapture.response.ok === false && /changes no material/.test(failedCapture.response.error)
      && failedCapture.patternId === feature.id && !Object.hasOwn(failedCapture.response, 'value'), 'Failed explicit capture withholds detached membership');
    await waitFor('failed capture leaves the pinned list and a visible error', () => page(selector => document.querySelector(selector)?.disabled
      && document.querySelector('.property-manager [role="alert"]')?.textContent.includes('changes no material')
      && document.querySelectorAll('[aria-label="Cuerpos detectados para la repetición"] li').length === 2, APPLY));
    check(await recovery() === created.snapshot.recovery, 'Failed discovery preserves exact committed recovery');
    evidence.failedCapture = failedCapture;
    const beforeRetry = (await observe()).serial; await change(SPACING, 20);
    await response(beforeRetry, features => declaration(features, 20, ['A', 'B']), 'retry pinned placement');
    await rediscover();
    const recapture = await captureAt(3, ['D']);
    check(recapture.patternId === feature.id && recapture.response.value.scope.captureFingerprint !== feature.featurePattern.captureFingerprint,
      'Explicit detection changes intent while retaining the exact pattern ID');
    const moved = healthy(await response(recapture.serial, features => declaration(features, 20, ['D']), 'recaptured D'), 'D', 'recaptured D');
    matchesCapture(moved, recapture);
    const final = await accept(moved, 'D', 'accepted D');
    await restore(created, 'button[title="Deshacer (Ctrl+Z)"]', 'B', 'undo recapture');
    await restore(final, 'button[title="Rehacer (Ctrl+Y)"]', 'D', 'redo recapture');

    await file('Guardar como…');
    await waitFor('actual AUTO Save As completes', async () => dialogCounts().saves === 1
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.record.features), 'Saved bytes retain captured IDs and original operation identities');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = healthy(await response(serial, features => canonical(features) === canonical(saved.features), 'reopened'), 'D', 'reopened');
    const reopenedSnapshot = await committed(reopened, 'reopened');
    check(canonical(JSON.parse(reopenedSnapshot.recovery)) === canonical(saved) && reopenedSnapshot.history.every(Boolean)
      && canonical(reopened.response.value.bodies) === canonical(final.record.response.value.bodies), 'Reopen has fresh actual geometry, exact captured scope and clean history');
    await file('Exportar STEP');
    await waitFor('actual AUTO STEP export', () => dialogCounts().geometryExports === 1
      && ipc.filter(event => event.channel === 'document:export' && event.completed).length === 1);
    const step = await fsp.readFile(autoScopeStepPath);
    evidence.step = { ...await require('./desktop-part-auto-scope-step.cjs')(step, check), stepSha256: digest(step), savedSha256: digest(bytes) };
    check((await fsp.readFile(input)).equals(originalBytes) && (await fsp.readFile(output)).equals(bytes) && await recovery() === reopenedSnapshot.recovery,
      'Original file, saved bytes and recovery remain exact after STEP');
    check((await readCaptures()).length === 4 && dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1,
      'Only the four explicit capture actions, two Opens, one Save As and one export ran');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production CAD worker and WASM loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer, asset or worker transport errors');
  };
};
