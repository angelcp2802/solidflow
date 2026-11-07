'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function holeWorkflow(context) {
  const { expected, input, output, holeStepPath, evaluate, observe, waitFor, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const X = 'input[aria-label="Centro del taladro X"]', Y = 'input[aria-label="Centro del taladro Y"]';
  const records = [], interactions = [];
  const evidence = { partHole: { records, interactions,
    scope: 'Original plate -> real body and top-face selection -> two-centre through hole -> native outside-material error/direct Cancel/reentry -> existing counterbore edit/Cancel/retry -> Undo/Redo/Save/Open/STEP',
    inputLimits: 'Actual CDP left presses/releases on visible contained hit-tested controls and the original main canvas. Native input/select setters and bubbling events author ordinary visible fields; not physical typing. No React state, face/body reference or native response injection.',
    featureLimits: 'One planar XY top support, two coordinate-authored centres, simple through and counterbore through holes. No blind/conical tip, countersink, Until Next, multi-body scope, interactive centre dragging or curved support coverage.',
    tolerances: { volumeMm3: 1e-5, boundsMm: 1e-6, supportFrameMm: 1e-6 } } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  async function reveal(selector, label) {
    await page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible hole control required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector, label ?? null);
  }
  async function inspect(selector, label) {
    return page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1) return { count: matches.length, available: false };
      const element = matches[0], r = element.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left + parent.clientLeft); right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top + parent.clientTop); bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
        }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        available: !element.matches(':disabled') && !element.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom
          && !!hit && (hit === element || element.contains(hit)) };
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label);
    let previous, since = 0;
    const target = await waitFor('stationary hole control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Hole control remains contained and hit-tested before pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after DOM reveal' });
  }
  async function change(selector, value) {
    value = String(value); await reveal(selector);
    await waitFor('one enabled visible hole field ' + selector, async () => (await inspect(selector)).available);
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
        || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || !hit || !(field === hit || field.contains(hit))) throw Error('One revealed current enabled hole field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Current enabled hole option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Visible field native setter/input or change event after reveal and hit test' });
    await waitFor('hole field retains authored value', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function ready() {
    await waitFor('current hole preview is acceptable', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  async function committed(features, phase) {
    const snapshot = await waitFor('committed hole recovery ' + phase, async () => {
      const current = await page(() => {
        const value = localStorage.getItem('solidflow.autosave');
        if (!value || document.querySelector('.property-manager') || !document.querySelector('.statusbar')?.textContent.includes('Listo')) return false;
        const history = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
          const matches = [...document.querySelectorAll('button')].filter(element => element.title === title);
          if (matches.length !== 1) throw Error('One current part history command required');
          return { title, disabled: matches[0].disabled };
        });
        return { recovery: value, history, title: document.querySelector('.document-title')?.textContent };
      });
      return current && canonical(JSON.parse(current.recovery).features) === canonical(features) ? current : false;
    });
    records.push({ phase: phase + '-committed', recoverySha256: digest(snapshot.recovery), history: snapshot.history });
    return snapshot;
  }
  function geometry(record, kind, phase) {
    check(record.response.ok, record.response.error || 'Native hole build failed');
    check(canonical(record.features.slice(0, 2)) === canonical(expected.features), 'Original plate features stay exact for ' + phase);
    const result = record.response.value;
    check(result.bodyCatalogActive && result.bodies?.length === 1 && !result.featureErrors.length && !result.warnings.length, 'One healthy exact hole body');
    const body = result.bodies[0], last = record.features.at(-1);
    check(body.ref.bodyId === 'original-hole-body' && body.createdByFeatureId === 'original-hole-plate'
      && body.ref.sourceFeatureId === (kind ? last.id : 'original-hole-plate'), 'Exact hole body, creator and current producer identity');
    const volume = 2400 - (kind === 'simple' ? 20 * Math.PI : kind === 'counterbore' ? 32 * Math.PI : 0);
    near(body.volume, volume, 1e-5, 'Independent hole volume for ' + phase);
    near(result.volume, volume, 1e-5, 'Independent aggregate hole volume for ' + phase);
    for (const side of ['min', 'max']) (side === 'min' ? [-10, -6, 0] : [10, 6, 10]).forEach((value, axis) =>
      near(body.bounds[side][axis], value, 1e-6, 'Literal plate bounds for ' + phase));
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: result.bodies });
    return record;
  }
  async function response(serial, predicate, phase) {
    return waitFor('native hole response ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No native hole worker errors');
      return state.builds.filter(record => record.serial > serial && predicate(record.features) && record.response).at(-1);
    });
  }
  async function built(serial, predicate, kind, phase) { return geometry(await response(serial, predicate, phase), kind, phase); }
  function hole(record, originalTop, kind, expectedIds) {
    const feature = record.features.at(-1);
    check(record.features.length === 3 && feature.type === 'hole' && feature.baseFeatureId === 'original-hole-plate'
      && canonical(feature.bodyScope) === canonical([{ bodyId: 'original-hole-body', sourceFeatureId: 'original-hole-plate' }])
      && feature.support.kind === 'face' && canonical(feature.support.face) === canonical(originalTop.ref)
      && feature.diameter === 2 && feature.endCondition.kind === 'throughAll' && feature.reversed === false,
    'Actual hole uses the original current body, picked historical top face and through condition');
    check(feature.positions.length === 2 && feature.positions[0].x === -4 && feature.positions[0].y === 0
      && feature.positions[1].x === 4 && feature.positions[1].y === 0
      && feature.positions.every(position => typeof position.id === 'string' && position.id.length > 0)
      && feature.positions[0].id !== feature.positions[1].id, 'Two actual distinct centre IDs and literal local/world positions');
    if (expectedIds) check(canonical(feature.positions.map(position => position.id)) === canonical(expectedIds), 'Existing hole edit retains centre IDs and order');
    check(canonical(feature.head) === canonical(kind === 'counterbore' ? { kind, diameter: 4, depth: 2 } : { kind }), 'Exact authored hole head');
    return feature;
  }
  async function cancel(record, baseline, kind, phase) {
    const serial = (await observe()).serial; await press(CANCEL);
    const restored = await built(serial, features => canonical(features) === canonical(record.features), kind, phase);
    const snapshot = await committed(restored.features, phase);
    check(canonical(snapshot) === canonical(baseline), 'Cancel restores exact recovery, history availability and title');
    check(canonical(restored.response.value.bodies) === canonical(record.response.value.bodies), 'Cancel restores the exact observed current native body');
  }
  async function accept(preview, kind, phase) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const record = await built(serial, features => canonical(features) === canonical(preview.features), kind, phase);
    return { record, snapshot: await committed(record.features, phase) };
  }
  async function newHole(originalTop, phase) {
    await press('.part-body-catalog .body-row input[type="checkbox"]');
    await waitFor('exact original body selected before hole command', () => page(() => {
      const selected = JSON.parse(document.querySelector('.viewport-canvas')?.getAttribute('data-part-selected-bodies') || '[]');
      return selected.length === 1 && selected[0].bodyId === 'original-hole-body' && selected[0].sourceFeatureId === 'original-hole-plate';
    }));
    await press('button[title="Vista frontal (Ctrl+1)"]'); await press('button[title="Ajustar a pantalla (F)"]');
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Asistente para taladro"]');
    await waitFor('actual hole top-face picker is armed with current source', () => page(() =>
      document.querySelector('.viewport-label span')?.textContent.includes('Selecciona la cara de entrada')
      && !!document.querySelector('.plane-support button:not(:disabled)')));
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const target = await page(() => {
      const elements = document.querySelectorAll('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])');
      if (elements.length !== 1) throw Error('One actual plate canvas required');
      const canvas = elements[0], rect = canvas.getBoundingClientRect(), point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      return { point, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hit: document.elementFromPoint(point.x, point.y) === canvas };
    });
    check(target.hit, 'Literal XY origin hits the front-view centre of the actual plate canvas');
    await pointer('mouseMoved', target.point);
    check(await page((point, expected) => {
      const canvas = document.querySelector('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])'), rect = canvas?.getBoundingClientRect();
      return !!rect && rect.x === expected.x && rect.y === expected.y && rect.width === expected.width && rect.height === expected.height
        && document.elementFromPoint(point.x, point.y) === canvas;
    }, target.point, target.rect), 'Literal top-face target stays hit-tested and stationary immediately before press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ input: 'CDP main canvas press/release', literalWorldTarget: [0, 0, 10], calibration: 'Public Front/Fit and literal symmetric plate bounds', target });
    await waitFor('actual top face opens the hole centre editor', () => page(() => document.querySelector('select[aria-label="Soporte del plano"]')?.value === 'face'
      && !!document.querySelector('svg[aria-label="Posiciones del asistente para taladro"]')));
    await press('.hole-tabs button', 'Tipo'); await change('input[aria-label="Diámetro del taladro"]', 2);
    await press('.hole-tabs button', 'Posiciones (0)');
    await press('.property-manager button.outline-button', 'Añadir centro por coordenadas'); await change(X, -4); await change(Y, 0);
    await press('.property-manager button.outline-button', 'Añadir centro por coordenadas');
    const serial = (await observe()).serial; await change(X, 4); await change(Y, 0);
    const record = await built(serial, features => features.length === 3 && features.at(-1).type === 'hole'
      && features.at(-1).positions.length === 2 && features.at(-1).positions[0].x === -4 && features.at(-1).positions[1].x === 4,
    'simple', phase);
    hole(record, originalTop, 'simple'); await ready(); return record;
  }
  async function edit(feature) {
    await press('.tree-row[data-feature-id="' + feature.id + '"]:not([data-parent-feature-id])');
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('existing hole Type fields retain through hole', () => page(() =>
      document.querySelector('input[aria-label="Diámetro del taladro"]')?.value === '2'
      && document.querySelector('select[aria-label="Condición final del taladro"]')?.value === 'throughAll'));
  }
  async function counterbore(feature, originalTop, phase) {
    await edit(feature);
    await change('select[aria-label="Tipo de taladro"]', 'counterbore');
    await change('input[aria-label="Diámetro del refrentado"]', 4);
    const serial = (await observe()).serial; await change('input[aria-label="Profundidad del refrentado"]', 2);
    const record = await built(serial, features => features.at(-1).id === feature.id && features.at(-1).head.kind === 'counterbore'
      && features.at(-1).head.diameter === 4 && features.at(-1).head.depth === 2, 'counterbore', phase);
    hole(record, originalTop, 'counterbore', feature.positions.map(position => position.id)); await ready(); return record;
  }
  return async () => {
    await waitFor('production hole file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, features => canonical(features) === canonical(expected.features), null, 'original-plate');
    const baseline = await committed(original.features, 'original-plate');
    const topFaces = original.response.value.bodies[0].faces.filter(face => face.frame && Math.abs(face.frame.normal[2] - 1) < 1e-6
      && Math.abs(face.frame.origin[2] - 10) < 1e-6);
    check(topFaces.length === 1, 'One original native witness for the literal top plane, never supplied as a selection');
    const top = topFaces[0];
    for (const [key, values] of [['origin', [0, 0, 10]], ['normal', [0, 0, 1]], ['xDirection', [1, 0, 0]]])
      values.forEach((value, index) => near(top.frame[key][index], value, 1e-6, 'Literal top support frame'));
    const cancelledDraft = await newHole(top, 'new-simple-hole-preview');
    serial = (await observe()).serial; await change(X, 30);
    const invalid = await response(serial, features => features.at(-1).type === 'hole' && features.at(-1).positions[1]?.x === 30, 'outside-material-error');
    check(invalid.response.ok && invalid.response.value.featureErrors.some(error => error.id === cancelledDraft.features.at(-1).id), 'Actual native hole rejects the centre without material contact');
    const errorText = await waitFor('outside-material error is visible and Accept disabled', () => page(selector => {
      const alert = document.querySelector('.error-banner[role="alert"]');
      return document.querySelector(selector)?.disabled && alert?.textContent.trim() ? alert.textContent.trim() : false;
    }, APPLY));
    check(await recovery() === baseline.recovery, 'Invalid hole preview preserves the exact committed recovery');
    records.push({ phase: 'outside-material-error', serial: invalid.serial, featureErrors: invalid.response.value.featureErrors, visibleError: errorText });
    await cancel(original, baseline, null, 'direct-invalid-hole-cancel');
    const retry = await newHole(top, 'new-simple-hole-retry');
    check(retry.features.at(-1).id !== cancelledDraft.features.at(-1).id, 'Reentry creates a fresh operation rather than accepting the cancelled draft');
    const cancelledIds = cancelledDraft.features.at(-1).positions.map(position => position.id);
    check(retry.features.at(-1).positions.every(position => !cancelledIds.includes(position.id)), 'Cancelled centre IDs do not reappear in the new operation');
    const simple = await accept(retry, 'simple', 'simple-hole-accepted'), feature = simple.record.features.at(-1);
    await counterbore(feature, top, 'existing-counterbore-cancel-preview');
    await cancel(simple.record, simple.snapshot, 'simple', 'existing-hole-edit-cancel');
    const preview = await counterbore(feature, top, 'existing-counterbore-retry');
    check(await recovery() === simple.snapshot.recovery, 'Existing counterbore edit waits for normal acceptance');
    const final = await accept(preview, 'counterbore', 'counterbore-accepted');
    const stages = [{ record: original, snapshot: baseline, kind: null }, { ...simple, kind: 'simple' }, { ...final, kind: 'counterbore' }];
    for (const [direction, indices] of [['undo', [1, 0]], ['redo', [1, 2]]]) for (const index of indices) {
      const stage = stages[index], phase = direction + '-hole-transaction-' + index;
      serial = (await observe()).serial; await press('button[title="' + (direction === 'undo' ? 'Deshacer (Ctrl+Z)' : 'Rehacer (Ctrl+Y)') + '"]');
      const record = await built(serial, features => canonical(features) === canonical(stage.record.features), stage.kind, phase);
      check((await committed(record.features, phase)).recovery === stage.snapshot.recovery, 'One history action restores the exact original transaction document');
    }
    await file('Guardar como…');
    await waitFor('actual hole Save As completes cleanly', async () => dialogCounts().saves === 1
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.record.features), 'Actual saved bytes contain both centres, support and complete edited head');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, features => canonical(features) === canonical(saved.features), 'counterbore', 'saved-hole-reopened');
    hole(reopened, top, 'counterbore', feature.positions.map(position => position.id));
    const restored = await committed(reopened.features, 'saved-hole-reopened');
    check(canonical(JSON.parse(restored.recovery)) === canonical(saved)
      && canonical(reopened.response.value.bodies) === canonical(final.record.response.value.bodies), 'Fresh reopened native geometry and exact saved declarations agree');
    await file('Exportar STEP');
    await waitFor('actual hole STEP export completes', () => dialogCounts().geometryExports === 1
      && ipc.filter(event => event.channel === 'document:export' && event.completed).length === 1);
    const step = await fsp.readFile(holeStepPath);
    evidence.partHole.nativeStep = await require('./desktop-part-hole-step.cjs')(step, check);
    evidence.partHole.stepSha256 = digest(step); evidence.partHole.originalSha256 = digest(await fsp.readFile(input)); evidence.savedSha256 = digest(bytes);
    check(await recovery() === restored.recovery && (await fsp.readFile(output)).equals(bytes), 'Hole STEP export preserves exact recovery and saved bytes');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1, 'Exactly original Open, Save As, saved Open and final STEP export');
    check(ipc.filter(event => event.channel === 'document:open' && event.completed).length === 2, 'Both Open commands use the actual production bridge');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Actual production worker and WASM loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer, asset or worker transport errors');
  };
};
