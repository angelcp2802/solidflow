'use strict';
const fsp = require('node:fs/promises');

module.exports = function additiveAllWorkflow(context) {
  const { expected, input, output, additiveAllStepPath, evaluate, observe, waitFor, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const SPACING = 'input[aria-label="Separación en dirección 1"]', COUNT = 'input[aria-label="Instancias en dirección 1"]';
  const records = [], interactions = [], evidence = { partAdditiveAll: { records, interactions,
    scope: 'Normal historical merge-extrusion selection, additive dynamic ALL creation/edit, native rejection/Cancel, history, Save/Open and literal physical STEP caps',
    inputLimits: 'Actual CDP left presses/releases on contained stationary hit-tested controls. Native setters/events author visible fields; no physical typing, canvas-pick, React/document/reference/native-response injection claim.',
    limits: 'One linear Blind intrinsic rectangle, one source, three current owners, variation none. Other transforms/profiles have separate finite native tests; broader endings/supports/AUTO/variation/bridge merges remain pending.',
    tolerances: { volumeMm3: 1e-5, planarMeshAreaMm2: 1e-5, boundsMm: 1e-6 } } };
  checks.push(evidence);
  const { page, press, change, file } = require('./desktop-part-pattern-actors.cjs')({ evaluate, waitFor, pointer, check, canonical, interactions });
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  async function ready() {
    await waitFor('current positive ALL preview is acceptable', () => page(selector => {
      const b = document.querySelector(selector); return !!b && !b.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  async function committed(features, phase) {
    const snapshot = await waitFor('committed positive ALL recovery ' + phase, async () => {
      const current = await page(() => {
        const recovery = localStorage.getItem('solidflow.autosave');
        if (!recovery || document.querySelector('.property-manager') || !document.querySelector('.statusbar')?.textContent.includes('Listo')) return false;
        const history = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
          const matches = [...document.querySelectorAll('button')].filter(e => e.title === title);
          if (matches.length !== 1) throw Error('One current part history command required'); return { title, disabled: matches[0].disabled };
        });
        return { recovery, history, title: document.querySelector('.document-title')?.textContent };
      });
      return current && canonical(JSON.parse(current.recovery).features) === canonical(features) ? current : false;
    });
    records.push({ phase: phase + '-committed', recoverySha256: digest(snapshot.recovery), history: snapshot.history }); return snapshot;
  }
  const originals = new Map();
  function declaration(record, spacing) {
    const f = record.features.at(-1);
    check(record.features.length === expected.features.length + 1 && f.type === 'linearPattern' && !f.suppressed && f.baseFeatureId === 'create-c'
      && canonical(f.source) === canonical({ mode: 'features', geometryPattern: false, featureIds: ['seed-cap'] })
      && canonical(f.first) === canonical({ direction: [1, 0, 0], spacing, count: 2 }) && f.second === null && !f.secondSeedOnly && !f.skipped.length,
    'Exact historical merge source and one forward linear placement at the final predecessor');
    check(canonical(f.featurePattern) === canonical({ mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput',
      bindings: [{ source: { bodyId: 'A', sourceFeatureId: 'seed-cap' }, targetBodyIds: 'scope' }], referencePolicies: [], variation: { kind: 'none' } })
      && !Object.hasOwn(f, 'bodyPattern'), 'Saved dynamic ALL intent has exact historical binding and no fixed targets/instance body IDs'); return f;
  }
  function geometry(record, spacing, phase) {
    check(record.response.ok, record.response.error || 'Native positive ALL build failed');
    check(canonical(record.features.slice(0, expected.features.length)) === canonical(expected.features), 'All original recipes remain exact');
    const result = record.response.value;
    check(result.bodyCatalogActive && result.bodies?.length === 3 && !result.featureErrors.length
      && canonical(result.warnings) === canonical(['La pieza contiene 3 sólidos separados.']), 'Exactly three healthy native current owners');
    const feature = spacing === null ? null : declaration(record, spacing), changedId = spacing === 10 ? 'B' : spacing === 30 ? 'C' : null;
    const bodies = ['A', 'B', 'C'].map((id, index) => {
      const body = result.bodies.find(b => b.ref.bodyId === id), x = [0, 10, 30][index], cap = id === 'A' || id === changedId;
      check(!!body && body.createdByFeatureId === 'create-' + id.toLowerCase(), 'Every owner retains its original body identity and creator');
      const sourceFeatureId = id === changedId ? feature.id : id === 'A' ? 'seed-cap' : 'create-' + id.toLowerCase();
      check(canonical(body.ref) === canonical({ bodyId: id, sourceFeatureId }), 'Only the actually changed owner receives the pattern source revision');
      near(body.volume, cap ? 72 : 64, 1e-5, 'Independent original cube/cap volume');
      near(body.meshAreaMm2, cap ? 112 : 96, 1e-5, 'Independent original cube/cap planar mesh area');
      const box = { min: [x, 0, 0], max: [x + 4, 4, cap ? 6 : 4] };
      for (const side of ['min', 'max']) box[side].forEach((v, axis) => near(body.bounds[side][axis], v, 1e-6, 'Literal owner/cap bounds'));
      if (!originals.has(id)) {
        check(!feature, 'Original native owner witnesses are captured only before the first repetition'); originals.set(id, structuredClone(body));
      } else if (id !== changedId) check(canonical(body) === canonical(originals.get(id)), 'Remote/no-op or restored owner preserves its first exact reference, geometry and metadata witness');
      return body;
    });
    near(result.volume, spacing === null ? 200 : 208, 1e-5, 'Independent complete three-owner volume');
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies }); return record;
  }
  async function response(serial, predicate, phase) {
    return waitFor('fresh native positive ALL response ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No positive ALL worker transport errors');
      return state.builds.filter(r => r.serial > serial && predicate(r.features) && r.response).at(-1);
    });
  }
  async function built(serial, predicate, spacing, phase) { return geometry(await response(serial, predicate, phase), spacing, phase); }
  const isPattern = (features, spacing) => features.length === expected.features.length + 1
    && features.at(-1).type === 'linearPattern' && features.at(-1).first.spacing === spacing && features.at(-1).first.count === 2
    && features.at(-1).featurePattern?.scope === 'all' && features.at(-1).featurePattern?.bindings.length === 1;
  async function newPattern(spacing) {
    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) await press('.part-body-catalog-toggle');
    const seedSelector = '.part-body-catalog .body-row:has(.body-row-name[title^="Original body A ·"]) input';
    const selected = await page(selector => {
      const fields = document.querySelectorAll(selector); if (fields.length !== 1) throw Error('One actual original A catalogue row required'); return fields[0].checked;
    }, seedSelector);
    if (!selected) await press(seedSelector);
    await waitFor('exact current A seed selected through real catalogue', () => page(() => document.querySelector('.viewport-canvas')?.getAttribute('data-part-selected-bodies')
      === JSON.stringify([{ bodyId: 'A', sourceFeatureId: 'seed-cap' }])));
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Matriz lineal"]');
    await waitFor('normal pattern source controls ready', () => page(() => {
      const field = document.querySelector('select[aria-label="Tipo de repetición en cuerpos"]'); return field && !field.disabled;
    }));
    await change('select[aria-label="Tipo de repetición en cuerpos"]', 'features');
    check(await page(() => {
      const selected = [...document.querySelectorAll('[aria-label="Operaciones para repetir"] input:checked')];
      return selected.length === 1 && selected[0].getAttribute('aria-label') === 'Repetir Original cap';
    }), 'Normal body selection offers only its historical producing cap as the selected operation');
    await change('select[aria-label="Método de repetición de operaciones"]', 'regenerate');
    await change('select[aria-label="Alcance de los cuerpos de la repetición"]', 'all');
    await waitFor('exact current historical output can be selected', () => page(() => {
      const fields = document.querySelectorAll('[aria-label="Resultados de la operación para repetir"] input');
      return fields.length === 1 && !fields[0].disabled;
    }));
    await press('[aria-label="Resultados de la operación para repetir"] input');
    await change(COUNT, 2); const serial = (await observe()).serial; await change(SPACING, spacing); return serial;
  }
  async function edit(feature, spacing) {
    await press('.tree-row[data-feature-id="' + feature.id + '"]:not([data-parent-feature-id])');
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('exact saved positive ALL editor ready', () => page((selector, value) => {
      const field = document.querySelector(selector), scope = document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]');
      const method = document.querySelector('select[aria-label="Método de repetición de operaciones"]');
      const selected = document.querySelectorAll('[aria-label="Resultados de la operación para repetir"] input:checked:not(:disabled)');
      return field && !field.disabled && field.value === String(value) && scope && !scope.disabled && scope.value === 'all'
        && method && !method.disabled && method.value === 'regenerate' && selected.length === 1
        && document.querySelectorAll('[aria-label="Catálogo actual para el alcance todos los cuerpos"] > li').length === 3;
    }, SPACING, spacing));
  }
  async function accept(preview, spacing, phase) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const record = await built(serial, f => canonical(f) === canonical(preview.features), spacing, phase);
    return { record, snapshot: await committed(record.features, phase), spacing };
  }
  async function cancel(stage, phase) {
    const serial = (await observe()).serial; await press(CANCEL);
    const record = await built(serial, f => canonical(f) === canonical(stage.record.features), stage.spacing, phase);
    check(canonical(await committed(record.features, phase)) === canonical(stage.snapshot), 'Cancel restores exact recovery/history/dirty title');
    check(canonical(record.response.value.bodies) === canonical(stage.record.response.value.bodies), 'Cancel restores every native owner/ref exactly');
  }
  async function history(stage, direction, phase) {
    const serial = (await observe()).serial; await press('button[title="' + (direction === 'undo' ? 'Deshacer (Ctrl+Z)' : 'Rehacer (Ctrl+Y)') + '"]');
    const record = await built(serial, f => canonical(f) === canonical(stage.record.features), stage.spacing, phase);
    check((await committed(record.features, phase)).recovery === stage.snapshot.recovery, 'One history action restores the exact dynamic ALL transaction');
  }
  return async () => {
    await waitFor('production positive ALL file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const originalBytes = await fsp.readFile(input); let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]'); await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const originalRecord = await built(serial, f => canonical(f) === canonical(expected.features), null, 'original-three-current-owners');
    const original = { record: originalRecord, snapshot: await committed(originalRecord.features, 'original'), spacing: null };
    serial = await newPattern(4);
    const invalid = await response(serial, f => isPattern(f, 4), 'edge-contact-rejection'), invalidFeature = declaration(invalid, 4);
    check(invalid.response.ok && invalid.response.value.featureErrors.some(e => e.id === invalidFeature.id), 'Actual native edge-only contact rejects a disconnected positive result');
    check(canonical(invalid.response.value.bodies) === canonical(originalRecord.response.value.bodies), 'Native rejection preserves the complete original current catalogue');
    const visibleError = await waitFor('native rejection has visible message and disabled Accept', () => page(selector => {
      const alert = document.querySelector('.error-banner[role="alert"]'); return document.querySelector(selector)?.disabled && alert?.textContent.trim() ? alert.textContent.trim() : false;
    }, APPLY));
    check(await recovery() === original.snapshot.recovery, 'Rejected positive pattern never commits recovery');
    records.push({ phase: 'native-edge-contact-rejection', serial: invalid.serial, featureErrors: invalid.response.value.featureErrors, visibleError });
    await cancel(original, 'direct-invalid-pattern-cancel');
    serial = await newPattern(10);
    const retry = await built(serial, f => isPattern(f, 10), 10, 'new-positive-all-retry');
    check(retry.features.at(-1).id !== invalidFeature.id, 'Cancelled creation uses a fresh actual pattern identity on reentry');
    const created = await accept(retry, 10, 'positive-all-B-accepted'), feature = created.record.features.at(-1);
    await edit(feature, 10); serial = (await observe()).serial; await change(SPACING, 30);
    const cancelled = await built(serial, f => isPattern(f, 30) && f.at(-1).id === feature.id, 30, 'existing-positive-all-C-cancel-preview');
    await ready(); await cancel(created, 'existing-positive-all-edit-cancel');
    await edit(feature, 10); serial = (await observe()).serial; await change(SPACING, 30);
    const edited = await built(serial, f => isPattern(f, 30) && f.at(-1).id === feature.id, 30, 'existing-positive-all-C-retry');
    check(canonical(edited.features) === canonical(cancelled.features), 'Explicit existing edit reentry preserves exact source binding and operation identity');
    check(canonical(edited.features.at(-1).featurePattern) === canonical(feature.featurePattern), 'Editing only placement retains exact dynamic ALL saved intent');
    const final = await accept(edited, 30, 'positive-all-C-accepted');
    await history(created, 'undo', 'undo-positive-placement'); await history(original, 'undo', 'undo-positive-create');
    await history(created, 'redo', 'redo-positive-create'); await history(final, 'redo', 'redo-positive-placement');
    await file('Guardar como…');
    await waitFor('actual positive ALL Save As completes', async () => dialogCounts().saves === 1
      && ipc.filter(e => e.channel === 'document:save' && e.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.record.features), 'Actual saved bytes retain exact dynamic ALL identity, binding, placement and recipes');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, f => canonical(f) === canonical(saved.features), 30, 'saved-positive-all-reopened');
    const restored = await committed(reopened.features, 'saved-positive-all-reopened');
    check(canonical(JSON.parse(restored.recovery)) === canonical(saved) && restored.history.every(b => b.disabled)
      && canonical(reopened.response.value.bodies) === canonical(final.record.response.value.bodies), 'Saved/Open has fresh physical rebuild with exact owners/references and reset history');
    await file('Exportar STEP'); await waitFor('actual positive ALL STEP export completes', () => dialogCounts().geometryExports === 1
      && ipc.filter(e => e.channel === 'document:export' && e.completed).length === 1);
    const step = await fsp.readFile(additiveAllStepPath);
    evidence.partAdditiveAll.step = { ...await require('./desktop-part-additive-all-step.cjs')(step, check), savedSha256: digest(bytes), stepSha256: digest(step) };
    check(await recovery() === restored.recovery && (await fsp.readFile(output)).equals(bytes), 'STEP export preserves exact saved document and recovery');
    check((await fsp.readFile(input)).equals(originalBytes), 'Original public recipe file remains byte-for-byte unchanged');
    evidence.partAdditiveAll.originalSha256 = digest(originalBytes);
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1
      && ipc.filter(e => e.channel === 'document:open' && e.completed).length === 2, 'Exactly two native Opens, one Save As and one STEP export');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production worker and WASM loaded through actual protocol');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer/asset/worker transport errors');
  };
};
