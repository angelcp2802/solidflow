'use strict';
const fs = require('node:fs/promises');

module.exports = function normalHoleVariants(context) {
  const { variant, expected, input, output, holeStepPath, observe, waitFor, checks, check, canonical, digest, pointer,
    initialReadyMs, ipc, consoleErrors, failedRequests, dialogCounts } = context;
  const states = { flat: ['flat3', 'flat4'], conical: ['shoulder3', 'tip3'], next: ['next90', 'next120'] }[variant];
  if (!states) throw Error('Fixed original normal Hole variant required');
  const oracle = require('./desktop-part-hole-variants-oracles.cjs'), interactions = [], records = [], evidence = { variant, interactions, records };
  checks.push({ normalHoleVariant: evidence });
  const { page, press, change, file } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions });
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const X = 'input[aria-label="Centro del taladro X"]', Y = 'input[aria-label="Centro del taladro Y"]';
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const uiSnapshot = () => page(() => ({ recovery: localStorage.getItem('solidflow.autosave'), title: document.querySelector('.document-title')?.textContent,
    history: ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
      const matches = [...document.querySelectorAll('button')].filter(button => button.title === title);
      if (matches.length !== 1) throw Error('One current part history control required');
      return { title, disabled: matches[0].disabled };
    }) }));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  let top;
  function authored(features, state, id) {
    const feature = features.at(-1), wanted = oracle(state);
    return features.length === expected.features.length + 1 && canonical(features.slice(0, -1)) === canonical(expected.features)
      && feature.type === 'hole' && (!id || feature.id === id) && feature.diameter === 2 && feature.reversed === false
      && feature.baseFeatureId === expected.features.at(-1).id
      && canonical(feature.bodyScope) === canonical([{ bodyId: 'original-hole-body', sourceFeatureId: expected.features.at(-1).id }])
      && canonical(feature.support) === canonical({ kind: 'face', face: top.ref })
      && canonical(feature.head) === canonical(wanted.head) && canonical(feature.endCondition) === canonical(wanted.endCondition)
      && feature.positions.length === 2 && feature.positions[0].x === -4 && feature.positions[0].y === 0 && feature.positions[1].x === 4 && feature.positions[1].y === 0;
  }
  async function native(after, state, phase, id) {
    const record = await waitFor('native normal Hole ' + phase, async () => (await observe()).builds.findLast(row => row.serial > after && row.response
      && (state ? authored(row.features, state, id) : canonical(row.features) === canonical(expected.features))));
    check(record.response.ok, record.response.error || 'Actual normal Hole build failed');
    const model = record.response.value, body = model.bodies?.[0], wanted = state ? oracle(state) : { volume: variant === 'next' ? 2208 : 2400 };
    check(model.bodyCatalogActive && model.bodies.length === 1 && !model.featureErrors.length && !model.warnings.length, 'One healthy original native owner');
    check(body.ref.bodyId === 'original-hole-body' && body.createdByFeatureId === 'original-hole-plate'
      && body.ref.sourceFeatureId === (state ? record.features.at(-1).id : expected.features.at(-1).id), 'Exact original owner/creator and current producer');
    near(body.volume, wanted.volume, 1e-5, 'Independent normal Hole native volume');
    near(model.volume, wanted.volume, 1e-5, 'Independent normal Hole aggregate volume');
    for (const [side, values] of [['min', [-10, -6, 0]], ['max', [10, 6, 10]]]) values.forEach((value, axis) => near(body.bounds[side][axis], value, 1e-6, 'Literal original bounds'));
    records.push({ phase, state, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: model.bodies });
    return record;
  }
  async function committed(features, label) {
    return waitFor('exact normal Hole recovery ' + label, async () => {
      const raw = await recovery();
      return raw && canonical(JSON.parse(raw).features) === canonical(features) && await page(() => !document.querySelector('.property-manager')
        && document.querySelector('.statusbar')?.textContent.includes('Listo')) ? raw : false;
    });
  }
  async function newHole() {
    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) await press('.part-body-catalog-toggle');
    const body = '.part-body-catalog .body-row input[type="checkbox"]';
    if (!await page(selector => document.querySelector(selector)?.checked, body)) await press(body);
    await press('button[title="Vista frontal (Ctrl+1)"]'); await press('button[title="Ajustar a pantalla (F)"]');
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Asistente para taladro"]');
    await waitFor('actual normal Hole entry-face picker', () => page(() => document.querySelector('.viewport-label span')?.textContent.includes('Selecciona la cara de entrada')
      && !!document.querySelector('.plane-support button:not(:disabled)')));
    const target = await page(() => {
      const list = document.querySelectorAll('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])');
      if (list.length !== 1) throw Error('One normal Hole canvas required');
      const canvas = list[0], r = canvas.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (!r.width || !r.height || document.elementFromPoint(point.x, point.y) !== canvas) throw Error('Literal symmetric top-face target must hit the canvas');
      return { point, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
    });
    await pointer('mouseMoved', target.point);
    check(await page((point, rect) => { const canvas = document.querySelector('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])'), r = canvas?.getBoundingClientRect();
      return !!r && r.left === rect.left && r.top === rect.top && r.width === rect.width && r.height === rect.height && document.elementFromPoint(point.x, point.y) === canvas;
    }, target.point, target.rect), 'Literal XY origin target remains stationary before actual top-face press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ input: 'Actual canvas press/release', literalWorld: [0, 0, 10], basis: 'Public Front/Fit and original symmetric bounds', target });
    await waitFor('actual face opens normal Hole coordinates', () => page(() => document.querySelector('select[aria-label="Soporte del plano"]')?.value === 'face'
      && !!document.querySelector('svg[aria-label="Posiciones del asistente para taladro"]')));
    await press('.hole-tabs button', 'Tipo'); await change('input[aria-label="Diámetro del taladro"]', 2);
    if (variant === 'next') {
      await change('select[aria-label="Tipo de taladro"]', 'countersink');
      await change('input[aria-label="Diámetro del avellanado"]', 4); await change('input[aria-label="Ángulo del avellanado"]', 90);
      await change('select[aria-label="Condición final del taladro"]', 'untilNext');
    } else {
      await change('select[aria-label="Condición final del taladro"]', 'blind'); await change('input[aria-label="Profundidad del taladro"]', 3);
      await change('select[aria-label="Fondo del taladro"]', variant === 'flat' ? 'flat' : 'conical');
      if (variant === 'conical') { await change('input[aria-label="Ángulo de la punta"]', 90); await change('select[aria-label="Referencia de profundidad"]', 'shoulder'); }
    }
    await press('.hole-tabs button', 'Posiciones (0)'); await press('.property-manager button.outline-button', 'Añadir centro por coordenadas');
    await change(X, -4); await change(Y, 0); await press('.property-manager button.outline-button', 'Añadir centro por coordenadas');
    const after = (await observe()).serial; await change(X, 4); await change(Y, 0);
    return native(after, states[0], 'new-' + states[0]);
  }
  async function invalid(baseline) {
    await press('.hole-tabs button', 'Tipo');
    let after = (await observe()).serial;
    if (variant === 'conical') { await change('select[aria-label="Referencia de profundidad"]', 'tip'); after = (await observe()).serial; }
    await change(variant === 'next' ? 'input[aria-label="Diámetro del avellanado"]' : 'input[aria-label="Profundidad del taladro"]', variant === 'next' ? 12 : variant === 'conical' ? .5 : 0);
    if (variant !== 'flat') {
      const rejected = await waitFor('native invalid announced Hole parameter', async () => (await observe()).builds.findLast(row => row.serial > after
        && row.response?.ok && row.response.value.featureErrors.some(error => error.id === row.features.at(-1)?.id)));
      check(rejected.response.value.featureErrors.some(error => error.message.includes(variant === 'conical' ? 'tramo cilíndrico' : 'salida Hasta siguiente')),
        'Native rejection has the actual tip/first-exit reason');
    }
    const message = await waitFor('invalid normal Hole parameter is visible and blocks Apply', () => page(selector => {
      const error = document.querySelector('.error-banner[role="alert"]');
      return document.querySelector(selector)?.disabled && error?.textContent.trim() ? error.textContent.trim() : false;
    }, APPLY));
    check(await recovery() === baseline, 'Invalid normal Hole parameter changes no committed recovery'); evidence.invalid = { message, value: variant === 'next' ? 12 : variant === 'conical' ? .5 : 0 };
    const serial = (await observe()).serial;
    await change(variant === 'next' ? 'input[aria-label="Diámetro del avellanado"]' : 'input[aria-label="Profundidad del taladro"]', variant === 'next' ? 4 : 3);
    if (variant === 'conical') await change('select[aria-label="Referencia de profundidad"]', 'shoulder');
    return native(serial, states[0], 'invalid-corrected');
  }
  async function edit(feature) {
    await press('.tree-row[data-feature-id="' + feature.id + '"]:not([data-parent-feature-id])'); await press('.selection-tools button[title="Editar operación"]');
    await waitFor('existing normal Hole editor is mounted', () => page(() => !!document.querySelector('.hole-tabs'))); await press('.hole-tabs button', 'Tipo');
    const serial = (await observe()).serial;
    await change(variant === 'flat' ? 'input[aria-label="Profundidad del taladro"]' : variant === 'conical' ? 'select[aria-label="Referencia de profundidad"]' : 'input[aria-label="Ángulo del avellanado"]',
      variant === 'flat' ? 4 : variant === 'conical' ? 'tip' : 120);
    return native(serial, states[1], 'edited-preview', feature.id);
  }
  async function accept(preview, state, phase) {
    await waitFor('normal Hole Apply is current', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const serial = (await observe()).serial; await press(APPLY); const record = await native(serial, state, phase, preview.features.at(-1).id);
    return { record, recovery: await committed(record.features, phase) };
  }
  return async () => {
    await waitFor('normal Hole variant desktop ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')), initialReadyMs);
    const inputBytes = await fs.readFile(input); let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]'); await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await native(serial, null, 'original'), baseline = await committed(original.features, 'original'), baselineUi = await uiSnapshot();
    const candidates = original.response.value.bodies[0].faces.filter(face => face.frame && Math.abs(face.frame.normal[2] - 1) < 1e-6 && Math.abs(face.frame.origin[2] - 10) < 1e-6);
    check(candidates.length === 1, 'One native witness for the literal original top plane; never injected into selection'); top = candidates[0];
    await newHole(); await invalid(baseline); serial = (await observe()).serial; await press(CANCEL); const canceled = await native(serial, null, 'new-cancel');
    check(await committed(original.features, 'new-cancel') === baseline, 'Cancel after corrected invalid input restores the exact original document');
    check(canonical(await uiSnapshot()) === canonical(baselineUi) && canonical(canceled.response.value.bodies) === canonical(original.response.value.bodies), 'New Cancel restores exact history availability, title and native body');
    const preview = await newHole(), first = await accept(preview, states[0], 'first-accepted'), feature = first.record.features.at(-1), ids = feature.positions.map(position => position.id);
    check(ids.length === 2 && ids[0] !== ids[1] && ids.every(id => typeof id === 'string' && id.length), 'Two genuine distinct authored position IDs');
    const firstUi = await uiSnapshot(); await edit(feature); serial = (await observe()).serial; await press(CANCEL); const editCanceled = await native(serial, states[0], 'edit-cancel', feature.id);
    check(await committed(first.record.features, 'edit-cancel') === first.recovery, 'Cancel of existing parameter edit preserves exact recovery');
    check(canonical(await uiSnapshot()) === canonical(firstUi) && canonical(editCanceled.response.value.bodies) === canonical(first.record.response.value.bodies), 'Edit Cancel restores exact history availability, title and native body');
    const edited = await edit(feature), second = await accept(edited, states[1], 'edit-accepted');
    for (const [direction, target, state] of [['undo', first, states[0]], ['undo', { record: original, recovery: baseline }, null], ['redo', first, states[0]], ['redo', second, states[1]]]) {
      serial = (await observe()).serial; await press('button[title="' + (direction === 'undo' ? 'Deshacer (Ctrl+Z)' : 'Rehacer (Ctrl+Y)') + '"]');
      await native(serial, state, direction + '-' + state, state ? feature.id : undefined);
      check(await committed(target.record.features, direction) === target.recovery, 'One history action restores the exact authored transaction');
    }
    check(canonical(second.record.features.at(-1).positions.map(position => position.id)) === canonical(ids), 'Parameter edits preserve original position IDs and order');
    await file('Guardar como…'); await waitFor('normal Hole Save As completes', () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1);
    const savedBytes = await fs.readFile(output), saved = JSON.parse(savedBytes);
    check(saved.id === expected.id && canonical(saved.features) === canonical(second.record.features), 'Actual saved file retains full final parameters and original prefix');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]'); await native(serial, states[1], 'reopened', feature.id);
    check(canonical(JSON.parse(await committed(saved.features, 'reopened'))) === canonical(saved), 'Native reopening restores exact saved declarations');
    await file('Exportar STEP'); await waitFor('normal Hole STEP completes', () => dialogCounts().geometryExports === 1 && ipc.some(event => event.channel === 'document:export' && event.completed));
    const step = await fs.readFile(holeStepPath); evidence.step = await require('./desktop-part-hole-step.cjs')(step, check, states[1]);
    evidence.stepSha256 = digest(step); evidence.savedSha256 = digest(savedBytes); evidence.originalSha256 = digest(inputBytes);
    check((await fs.readFile(input)).equals(inputBytes) && (await fs.readFile(output)).equals(savedBytes), 'Reopen and STEP leave original and saved native files unchanged');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1 && ipc.every(event => event.completed), 'Exactly two Open, one Save As and one STEP export complete');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No normal Hole transport or renderer errors');
    evidence.limits = 'One fixed original normal Hole case, actual face/controls and visible-field setters. Native worker V1e-5, STEP V/A1e-5, geometry1e-6; same kernel-family reader, no independent interoperability or general family claim.';
  };
};
