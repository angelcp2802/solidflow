'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function shellDraftWorkflow(context) {
  const { expected, input, files, evaluate, observe, waitFor, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  // atan(0.1) in degrees. Oracles use a literal 1 mm taper over 10 mm, independently of the stored angle.
  const DRAFT_ANGLE = 5.710593137499643;
  const records = [], interactions = [], exports = [];
  const evidence = { partShellDraft: { records, interactions, exports,
    scope: 'Original cube; top-face shell/native invalid thickness/direct Cancel/reentry/edit/history/persistence; four-side draft via public views/neutral XY/reversal/Cancel/history/persistence; actual STEP plane geometry',
    inputLimits: 'Actual CDP left presses/releases on contained hit-tested controls and the real main canvas. Native setters/events author visible fields. No React state, face/body reference or native response injection.',
    featureLimits: 'One top-open inward shell, thickness2 then1; one four-planar-face square draft at atan(0.1), inward then reversed outward, principal XY neutral plane. No curved faces, multiple openings, closed-shell acceptance, arbitrary supports or tangent propagation variants.',
    tolerances: { volumeMm3: 1e-5, boundsMm: 1e-6, sourceFrame: 1e-6 } } };
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
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible face-operation control required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
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
        clip: { left, top, right, bottom }, disabled: element.matches(':disabled'), hidden: !!element.closest('[hidden]'),
        hit: !!hit && (hit === element || element.contains(hit)),
        available: !element.matches(':disabled') && !element.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom
          && !!hit && (hit === element || element.contains(hit)) };
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label);
    let previous, since = 0;
    const target = await waitFor('stationary face-operation control ' + (label ?? selector), async () => {
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
    await waitFor('one enabled visible face-operation field ' + selector, async () => (await inspect(selector)).available);
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
        || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || !hit || !(field === hit || field.contains(hit))) throw Error('One revealed current enabled face-operation field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Current enabled face-operation option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Visible field native setter/input or change event after reveal and hit test' });
    await waitFor('face-operation field retains authored value', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function ready() {
    await waitFor('current face-operation preview is acceptable', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  async function committed(features, phase) {
    const snapshot = await waitFor('committed face-operation recovery ' + phase, async () => {
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
  const scope = { bodyId: 'face-operation-body', sourceFeatureId: 'face-create-cube' };
  function geometry(record, state, phase) {
    check(record.response.ok, record.response.error || 'Native face-operation build failed');
    check(canonical(record.features.slice(0, 2)) === canonical(expected.features), 'Original cube features remain exact');
    const result = record.response.value;
    check(result.bodyCatalogActive && result.bodies?.length === 1 && !result.featureErrors.length && !result.warnings.length, 'One healthy current face-operation body');
    const body = result.bodies[0], last = record.features.at(-1);
    check(body.ref.bodyId === scope.bodyId && body.createdByFeatureId === scope.sourceFeatureId
      && body.ref.sourceFeatureId === (state === 'source' ? scope.sourceFeatureId : last.id), 'Exact retained body, original creator and current producer');
    const metrics = state === 'source' ? [1000, 600, 5] : state === 'shell-2' ? [712, 792, 5] : state === 'shell-1' ? [424, 888, 5]
      : state === 'draft-in' ? [2440 / 3, 164 + 36 * Math.sqrt(101), 5] : [3640 / 3, 244 + 44 * Math.sqrt(101), 6];
    near(body.volume, metrics[0], 1e-5, 'Independent ' + state + ' volume');
    near(body.meshAreaMm2, metrics[1], 1e-5, 'Independent planar ' + state + ' mesh area');
    for (const [side, values] of [['min', [-metrics[2], -metrics[2], 0]], ['max', [metrics[2], metrics[2], 10]]])
      values.forEach((value, index) => near(body.bounds[side][index], value, 1e-6, 'Literal ' + state + ' bounds'));
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: result.bodies }); return record;
  }
  async function response(serial, predicate, phase) {
    return waitFor('native face-operation response ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No face-operation worker transport errors');
      return state.builds.filter(record => record.serial > serial && predicate(record.features) && record.response).at(-1);
    });
  }
  async function built(serial, predicate, state, phase) { return geometry(await response(serial, predicate, phase), state, phase); }
  function sourceFace(original, normal) {
    const faces = original.response.value.bodies[0].faces.filter(face => face.frame && normal.every((value, index) => Math.abs(face.frame.normal[index] - value) <= 1e-6));
    check(faces.length === 1 && faces[0].ref.sourceFeatureId === scope.sourceFeatureId, 'One original source-face witness for literal normal ' + normal);
    const expectedOrigin = normal[2] ? [0, 0, normal[2] === 1 ? 10 : 0] : normal.map(value => value * 5);
    expectedOrigin.forEach((value, index) => near(faces[0].frame.origin[index], value, 1e-6, 'Literal source plane origin'));
    return faces[0];
  }
  function declaration(record, kind, faces, value) {
    const feature = record.features.at(-1);
    check(record.features.length === 3 && feature.type === kind && feature.baseFeatureId === scope.sourceFeatureId
      && canonical(feature.bodyScope) === canonical(scope) && !feature.suppressed, 'Exact current body scope and upstream base');
    if (kind === 'shell') check(feature.direction === 'inward' && feature.thickness === value
      && canonical(feature.removedFaces) === canonical(faces.map(face => face.ref)), 'Exact inward shell thickness and physically picked original opening');
    else check(feature.angle === DRAFT_ANGLE && feature.reversed === value && feature.propagation === 'tangent'
      && canonical(feature.support) === canonical({ kind: 'principal', plane: 'XY' })
      && canonical(feature.faces) === canonical(faces.map(face => face.ref)), 'Exact canonical angle, neutral XY, direction and four picked historical faces');
    return feature;
  }
  async function sourceReady() {
    await waitFor('current source cube is available for face picking', () => page(() => {
      const buttons = document.querySelectorAll('.finish-view-switch button');
      return buttons.length === 2 && !buttons[0].disabled && !!document.querySelector('.body-operation-panel .body-row input:not(:disabled)');
    }));
  }
  async function newOperation(kind) {
    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) await press('.part-body-catalog-toggle');
    const selected = await page(() => {
      const inputs = document.querySelectorAll('.part-body-catalog .body-row input');
      if (inputs.length !== 1) throw Error('One actual original cube checkbox required'); return inputs[0].checked;
    });
    if (!selected) await press('.part-body-catalog .body-row input');
    await waitFor('exact original cube selected', () => page(scope => document.querySelector('.viewport-canvas')?.getAttribute('data-part-selected-bodies') === JSON.stringify([scope]), scope));
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="' + (kind === 'shell' ? 'Vaciado' : 'Desmoldeo') + '"]');
    await sourceReady();
  }
  async function menuView(label) {
    await press('[data-assembly-menu="view"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="view"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
    await press('button[title="Ajustar a pantalla (F)"]');
  }
  async function pick(original, kind, normal, view, count, phase) {
    await menuView(view); await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const target = await page(() => {
      const elements = document.querySelectorAll('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])');
      if (elements.length !== 1) throw Error('One actual source cube canvas required');
      const canvas = elements[0], rect = canvas.getBoundingClientRect(), point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      return { point, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, hit: document.elementFromPoint(point.x, point.y) === canvas };
    });
    check(target.hit, 'Literal cube face centre hits actual canvas in public ' + view + ' view');
    await pointer('mouseMoved', target.point);
    check(await page((point, expected) => {
      const canvas = document.querySelector('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])'), rect = canvas?.getBoundingClientRect();
      return !!rect && rect.x === expected.x && rect.y === expected.y && rect.width === expected.width && rect.height === expected.height
        && document.elementFromPoint(point.x, point.y) === canvas;
    }, target.point, target.rect), 'Cube source target is stationary and hit-tested immediately before press');
    const serial = (await observe()).serial; await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    const witness = sourceFace(original, normal);
    const record = await response(serial, features => {
      const feature = features.at(-1), selected = kind === 'shell' ? feature.removedFaces : feature.faces;
      return feature.type === kind && selected?.length === count && selected.some(face => canonical(face) === canonical(witness.ref));
    }, phase);
    check(await page(count => document.querySelectorAll('.edge-selection-list button[aria-label^="Quitar cara "]').length === count, count), 'Actual face list exposes every selected original face');
    interactions.push({ phase, input: 'CDP actual canvas press/release after public view/Fit', literalNormal: normal, target, witness: witness.ref });
    return record;
  }
  async function preview() {
    await ready(); await press('.finish-view-switch button', 'Vista previa');
    await waitFor('actual face-operation preview mode', () => page(() => document.querySelector('.finish-view-switch button.active')?.textContent.trim() === 'Vista previa'));
  }
  async function accept(record, state, phase) {
    await preview(); const serial = (await observe()).serial; await press(APPLY);
    const accepted = await built(serial, features => canonical(features) === canonical(record.features), state, phase);
    return { record: accepted, snapshot: await committed(accepted.features, phase) };
  }
  async function cancel(record, snapshot, state, phase) {
    const serial = (await observe()).serial; await press(CANCEL);
    const restored = await built(serial, features => canonical(features) === canonical(record.features), state, phase);
    check(canonical(await committed(restored.features, phase)) === canonical(snapshot), 'Face-operation Cancel restores exact recovery, history availability and dirty title');
    check(canonical(restored.response.value.bodies) === canonical(record.response.value.bodies), 'Cancel restores exact observed native body and references');
  }
  async function edit(feature, selector, value) {
    await press('.tree-row[data-feature-id="' + feature.id + '"]:not([data-parent-feature-id])');
    await press('.selection-tools button[title="Editar operación"]'); await sourceReady();
    check(await page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)), 'Existing face-operation field retains exact stored value');
  }
  async function history(stage, direction, phase) {
    const serial = (await observe()).serial; await press('button[title="' + (direction === 'undo' ? 'Deshacer (Ctrl+Z)' : 'Rehacer (Ctrl+Y)') + '"]');
    const record = await built(serial, features => canonical(features) === canonical(stage.record.features), stage.state, phase);
    check((await committed(record.features, phase)).recovery === stage.snapshot.recovery, 'One history action restores the exact stored face-operation transaction');
  }
  async function openOriginal(first, phase) {
    const serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    if (first) await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const record = await built(serial, features => canonical(features) === canonical(expected.features), 'source', phase);
    return { record, snapshot: await committed(record.features, phase), state: 'source' };
  }
  async function saveOpenExport(final, kind, ordinal) {
    await file('Guardar como…');
    await waitFor('native ' + kind + ' Save As completes cleanly', async () => dialogCounts().saves === ordinal
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === ordinal
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(files[kind]), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.record.features), 'Actual saved ' + kind + ' contains exact body/face/support declarations');
    const serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, features => canonical(features) === canonical(saved.features), final.state, 'saved-' + kind + '-reopened');
    const restored = await committed(reopened.features, 'saved-' + kind + '-reopened');
    check(canonical(JSON.parse(restored.recovery)) === canonical(saved) && restored.history.every(button => button.disabled)
      && canonical(reopened.response.value.bodies) === canonical(final.record.response.value.bodies), 'Actual reopened ' + kind + ' rebuild, recovery and references agree');
    await file('Exportar STEP');
    await waitFor('actual ' + kind + ' STEP export completes', () => dialogCounts().geometryExports === ordinal
      && ipc.filter(event => event.channel === 'document:export' && event.completed).length === ordinal);
    const step = await fsp.readFile(files.steps[kind]);
    exports.push({ kind, ...await require('./desktop-part-shell-draft-step.cjs')(step, kind, check), savedSha256: digest(bytes), stepSha256: digest(step) });
    check(await recovery() === restored.recovery && (await fsp.readFile(files[kind])).equals(bytes), 'STEP export preserves exact saved ' + kind + ' and recovery');
  }
  return async () => {
    await waitFor('production face-operation file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const originalBytes = await fsp.readFile(input), original = await openOriginal(true, 'shell-original-cube');
    const top = sourceFace(original.record, [0, 0, 1]);
    await newOperation('shell');
    const firstShell = geometry(await pick(original.record, 'shell', [0, 0, 1], 'Frontal', 1, 'shell-picked-top-preview'), 'shell-2', 'shell-thickness-2-preview');
    declaration(firstShell, 'shell', [top], 2);
    let serial = (await observe()).serial; await change('input[aria-label="Espesor del vaciado"]', 100);
    const invalid = await response(serial, features => features.at(-1).type === 'shell' && features.at(-1).thickness === 100, 'excessive-shell-thickness');
    check(invalid.response.ok && invalid.response.value.featureErrors.some(error => error.id === firstShell.features.at(-1).id), 'Actual native offset rejects excessive shell thickness');
    const text = await waitFor('excessive shell thickness has visible error and disabled Accept', () => page(selector => {
      const alert = document.querySelector('.error-banner[role="alert"]'); return document.querySelector(selector)?.disabled && alert?.textContent.trim() ? alert.textContent.trim() : false;
    }, APPLY));
    check(await recovery() === original.snapshot.recovery, 'Invalid shell thickness preserves exact recovery');
    records.push({ phase: 'native-excessive-shell-thickness', serial: invalid.serial, featureErrors: invalid.response.value.featureErrors, visibleError: text });
    await cancel(original.record, original.snapshot, 'source', 'direct-invalid-shell-cancel');
    await newOperation('shell');
    const shellRetry = geometry(await pick(original.record, 'shell', [0, 0, 1], 'Frontal', 1, 'shell-reentry-top-pick'), 'shell-2', 'shell-thickness-2-retry');
    declaration(shellRetry, 'shell', [top], 2);
    check(shellRetry.features.at(-1).id !== firstShell.features.at(-1).id, 'Shell reentry has a fresh actual operation identity');
    const shellCreated = { ...await accept(shellRetry, 'shell-2', 'shell-thickness-2-accepted'), state: 'shell-2' }, shellFeature = shellCreated.record.features.at(-1);
    await edit(shellFeature, 'input[aria-label="Espesor del vaciado"]', 2); serial = (await observe()).serial; await change('input[aria-label="Espesor del vaciado"]', 1);
    const shellEdit = await built(serial, features => features.at(-1).id === shellFeature.id && features.at(-1).thickness === 1, 'shell-1', 'existing-shell-thickness-1-cancel-preview');
    declaration(shellEdit, 'shell', [top], 1); await preview(); await cancel(shellCreated.record, shellCreated.snapshot, 'shell-2', 'existing-shell-edit-cancel');
    await edit(shellFeature, 'input[aria-label="Espesor del vaciado"]', 2); serial = (await observe()).serial; await change('input[aria-label="Espesor del vaciado"]', 1);
    const shellFinalPreview = await built(serial, features => features.at(-1).id === shellFeature.id && features.at(-1).thickness === 1, 'shell-1', 'existing-shell-thickness-1-retry');
    declaration(shellFinalPreview, 'shell', [top], 1);
    const shellFinal = { ...await accept(shellFinalPreview, 'shell-1', 'shell-thickness-1-accepted'), state: 'shell-1' };
    await history(shellCreated, 'undo', 'undo-shell-thickness-edit'); await history(original, 'undo', 'undo-shell-creation');
    await history(shellCreated, 'redo', 'redo-shell-creation'); await history(shellFinal, 'redo', 'redo-shell-thickness-edit');
    await saveOpenExport(shellFinal, 'shell', 1);
    const draftOriginal = await openOriginal(false, 'draft-original-cube');
    await newOperation('draft');
    const empty = await page(selector => ({ disabled: document.querySelector(selector)?.disabled,
      empty: document.querySelectorAll('.edge-selection-list button[aria-label^="Quitar cara "]').length === 0,
      guidance: document.querySelector('.edge-selection-list .selection-placeholder')?.textContent.trim() }), APPLY);
    check(empty.disabled && empty.empty && !!empty.guidance && await recovery() === draftOriginal.snapshot.recovery, 'Initial empty draft face selection is recoverable and cannot commit');
    records.push({ phase: 'empty-draft-selection', ...empty, limits: 'UI/document admission; no native rejection claim' });
    await cancel(draftOriginal.record, draftOriginal.snapshot, 'source', 'direct-empty-draft-cancel');
    await newOperation('draft'); await change('select[aria-label="Plano neutro"]', 'principal:XY');
    const directions = [[[1, 0, 0], 'Derecha'], [[-1, 0, 0], 'Izquierda'], [[0, 1, 0], 'Superior'], [[0, -1, 0], 'Inferior']];
    const draftFaces = directions.map(([normal]) => sourceFace(draftOriginal.record, normal));
    for (const [index, [normal, view]] of directions.entries()) await pick(draftOriginal.record, 'draft', normal, view, index + 1, 'draft-source-face-' + (index + 1));
    serial = (await observe()).serial; await change('input[aria-label="Ángulo de desmoldeo"]', DRAFT_ANGLE);
    const draftPreview = await built(serial, features => features.at(-1).type === 'draft' && features.at(-1).angle === DRAFT_ANGLE && features.at(-1).faces.length === 4,
      'draft-in', 'four-face-inward-draft-preview');
    declaration(draftPreview, 'draft', draftFaces, false);
    const draftCreated = { ...await accept(draftPreview, 'draft-in', 'inward-draft-accepted'), state: 'draft-in' }, draftFeature = draftCreated.record.features.at(-1);
    await edit(draftFeature, 'input[aria-label="Ángulo de desmoldeo"]', DRAFT_ANGLE); serial = (await observe()).serial;
    await press('.property-manager label.finish-checkbox', 'Invertir dirección del desmoldeo');
    const draftReverse = await built(serial, features => features.at(-1).id === draftFeature.id && features.at(-1).reversed === true, 'draft-out', 'existing-reversed-draft-cancel-preview');
    declaration(draftReverse, 'draft', draftFaces, true); await preview(); await cancel(draftCreated.record, draftCreated.snapshot, 'draft-in', 'existing-draft-edit-cancel');
    await edit(draftFeature, 'input[aria-label="Ángulo de desmoldeo"]', DRAFT_ANGLE); serial = (await observe()).serial;
    await press('.property-manager label.finish-checkbox', 'Invertir dirección del desmoldeo');
    const draftFinalPreview = await built(serial, features => features.at(-1).id === draftFeature.id && features.at(-1).reversed === true, 'draft-out', 'existing-reversed-draft-retry');
    declaration(draftFinalPreview, 'draft', draftFaces, true);
    const draftFinal = { ...await accept(draftFinalPreview, 'draft-out', 'outward-draft-accepted'), state: 'draft-out' };
    await history(draftCreated, 'undo', 'undo-draft-reversal'); await history(draftOriginal, 'undo', 'undo-draft-creation');
    await history(draftCreated, 'redo', 'redo-draft-creation'); await history(draftFinal, 'redo', 'redo-draft-reversal');
    await saveOpenExport(draftFinal, 'draft', 2);
    check((await fsp.readFile(input)).equals(originalBytes), 'Both complete workflows preserve the original selected cube file');
    evidence.partShellDraft.originalSha256 = digest(originalBytes);
    check(dialogCounts().opens === 4 && dialogCounts().saves === 2 && dialogCounts().geometryExports === 2, 'Exactly two original Opens, two saved Opens, two Save As and two STEP exports');
    check(ipc.filter(event => event.channel === 'document:open' && event.completed).length === 4, 'Every Open crosses the production native file bridge');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Actual production worker and WASM loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer, asset or face-operation worker transport errors');
  };
};
