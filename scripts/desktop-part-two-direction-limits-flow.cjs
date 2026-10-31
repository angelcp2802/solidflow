'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function twoDirectionLimitsWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, capture, check, canonical, digest,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, dialogCounts, initialReadyMs } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const D1 = 'input[aria-label="Profundidad"]', TWO = 'input[aria-label="Dirección 2"]';
  const D2 = 'input[aria-label="Profundidad de dirección 2"]', END = 'select[aria-label="Condición final"]';
  const END2 = 'select[aria-label="Condición final de dirección 2"]';
  const TARGET = 'select[aria-label="Superficie de destino"]', TARGET2 = 'select[aria-label="Superficie de destino de dirección 2"]';
  const BODY = 'select[aria-label="Cuerpo límite de la extrusión"]', BODY2 = 'select[aria-label="Cuerpo límite de dirección 2"]';
  const NAME = 'input[aria-label="Nombre de operación"]', THIN = 'input[aria-label="Operación lámina"]';
  const PLANE = 'input[aria-label="Distancia del plano"]';
  const up = name => ({ kind: 'upToSurface', target: { kind: 'plane', planeId: 'limits-' + name + '-plane' } });
  const second = (endCondition = up('bottom'), depth = 7, enabled = true) => ({ enabled, depth, ...(endCondition ? { endCondition } : {}) });
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const records = [], inputs = [], evidence = { partTwoDirectionLimits: { records, inputs,
    provenance: 'Original analytical millimetre declarations: one merged step, two separate read-only limit bodies, four reference planes and two unused rectangles; no imported geometry.',
    scope: 'Independent blind/automatic ends, explicit per-side body limits, reverse without reference substitution, midpoint/OFF recovery, anchored source-plane motion, exact cut ownership, Cancel/retry, history, two writes and fresh reopening.',
    inputLimits: 'Actual CDP left press/release on visible stationary hit-tested controls. Parameters use native setters and bubbling input/change events; no physical keyboard claim. DOM scrolling only reveals controls. No handlers, worker results or application state are injected.',
    limits: 'Original parallel XY rectangles and planar world targets. Renderer volume/bounds do not independently attest BRep validity, area, STEP, curved limits, regeneration recipes, arbitrary frames, complete interaction parity or installed-platform support.' } };
  checks.push(evidence);
  const originalCount = expected.features.length, originalCanonical = canonical(expected);
  const last = row => row.features.at(-1);
  const feature = (row, id) => row.features.find(item => item.id === id);
  const base = { bodyId: 'limits-base-body', featureId: 'limits-upper', createdBy: 'limits-base', volume: 7056,
    min: [0, 0, -10], max: [20, 14, 20] };
  const top = { bodyId: 'limits-top-body', featureId: 'limits-top', createdBy: 'limits-top', volume: 288,
    min: [29, -1, 16], max: [41, 7, 19] };
  const bottom = { bodyId: 'limits-bottom-body', featureId: 'limits-bottom', createdBy: 'limits-bottom', volume: 576,
    min: [29, -1, -9], max: [41, 7, -3] };
  const originalOwners = [base, top, bottom];
  const plain = { volume: 1140, min: [30, 0, -3], max: [40, 6, 16] };
  const firstOnly = { volume: 660, min: [30, 0, 5], max: [40, 6, 16] };
  const firstAutomatic = { volume: 1080, min: [30, 0, -2], max: [40, 6, 16] };
  const secondAutomatic = { volume: 1260, min: [30, 0, -3], max: [40, 6, 18] };
  const midpoint = { volume: 780, min: [30, 0, -1.5], max: [40, 6, 11.5] };
  const editedPlain = { volume: 1260, min: [30, 0, -5], max: [40, 6, 16] };
  const owner = (operation, dimensions) => ({ bodyId: operation.bodyOperation.bodyId, featureId: operation.id, createdBy: operation.id, ...dimensions });
  const plainOwners = (row, dimensions = plain) => [...originalOwners, owner(last(row), dimensions)];
  const plainDraft = (row, first = up('top'), opposite = up('bottom'), sign = 13, enabled = true) => {
    const operation = last(row);
    return operation?.type === 'extrude' && operation.sketchId === 'limits-plain-profile' && operation.name === 'Límites independientes'
      && operation.depth === sign && !operation.symmetric && canonical(operation.endCondition ?? null) === canonical(first)
      && canonical(operation.secondDirection) === canonical(second(opposite, 7, enabled)) && operation.bodyOperation?.mode === 'new';
  };
  const nativeLimit = (kind, limit) => ({ kind, baseFeatureId: limit.featureId,
    ...(kind === 'throughAll' ? { bothDirections: false } : {}), baseBody: { bodyId: limit.bodyId, sourceFeatureId: limit.featureId } });
  const near = (actual, value, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - value) <= tolerance,
    `${label}: ${actual}, expected ${value}`);
  let plainOperation, cutOperation;
  const allOwners = (dimensions = plain, cut = false) => [
    cut ? { ...base, featureId: cutOperation.id, volume: 6876 } : base,
    top, bottom, owner(plainOperation, dimensions),
  ];
  async function visible(selector, label = null) {
    await page((selector, label) => {
      const caption = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim();
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || caption(e) === label);
      if (matches.length === 1) matches[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, label);
    return page((selector, label) => {
      const caption = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim();
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || caption(e) === label);
      if (matches.length !== 1) return { available: false, count: matches.length };
      const element = matches[0], r = element.getBoundingClientRect(), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      return { available: !element.disabled && !element.closest('[hidden]') && r.width > 0 && r.height > 0
        && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && (hit === element || element.contains(hit)),
        point, value: element.value, checked: element.checked, text: caption(element) };
    }, selector, label);
  }
  async function press(selector, label = null) {
    let previous, stationary = 0;
    const state = await waitFor('stationary two-direction control ' + (label ?? selector), async () => {
      const current = await visible(selector, label), signature = canonical(current);
      if (signature !== previous) { previous = signature; stationary = Date.now(); }
      return current.available && Date.now() - stationary >= 100 ? current : false;
    });
    await pointer('mouseMoved', state.point);
    check(canonical(await visible(selector, label)) === canonical(state), 'Two-direction control remains enabled, hit-tested and stationary');
    await pointer('mousePressed', state.point, 1); await pointer('mouseReleased', state.point, 0);
    inputs.push({ selector, ...(label ? { label } : {}), point: state.point, input: 'actual left press/release' });
  }
  async function change(selector, value) {
    await waitFor('visible two-direction parameter ' + selector, async () => (await visible(selector)).available);
    await page((selector, value) => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (fields.length !== 1 || !field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight || !hit || !(field === hit || field.contains(hit))) throw Error('One visible enabled hit-tested two-direction parameter required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('One current enabled two-direction option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    inputs.push({ selector, value: String(value), input: 'visible native field setter and bubbling event' });
    await waitFor('retained two-direction parameter ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)));
    await frames();
  }
  const idle = () => waitFor('closed idle two-direction editor', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  const ready = () => waitFor('native acceptable two-direction preview', () => page(selector => { const button = document.querySelector(selector); return !!button && !button.disabled; }, APPLY));
  function material(row, expectedOwners, phase, sourceOffset = 5, rejected = false) {
    check(row.response.ok, row.response.error || 'Native two-direction build response succeeds');
    const result = row.response.value, actualOwners = typeof expectedOwners === 'function' ? expectedOwners(row) : expectedOwners;
    if (rejected) check(result.featureErrors.length === 1 && result.featureErrors[0].id === last(row).id
      && /detrás|sentido/.test(result.featureErrors[0].message), 'Wrong-side targets reject at the exact draft operation');
    else check(!result.featureErrors.length, 'No two-direction limit native feature error: ' + JSON.stringify({ phase, featureErrors: result.featureErrors }));
    const warnings = actualOwners.length > 1 ? [`La pieza contiene ${actualOwners.length} sólidos separados.`] : [];
    if (rejected) warnings.unshift('Reconstrucción detenida en «Límites independientes». Se muestra el último sólido válido.');
    check(canonical(result.warnings) === canonical(warnings) && result.bodyCatalogActive && result.bodies?.length === actualOwners.length,
      'Two-direction build retains exact body inventory and warnings: ' + JSON.stringify({ phase, warnings: result.warnings }));
    const prefix = expected.features.map(item => item.id === 'limits-source-plane' ? { ...item, offset: sourceOffset } : item)
      .slice(0, Math.min(originalCount, row.features.length));
    check(canonical(row.features.slice(0, originalCount)) === canonical(prefix), 'Original declarations remain exact except the explicitly edited source-plane distance');
    check(canonical(expected) === originalCanonical, 'The original fixture object remains unchanged');
    for (const expectedOwner of actualOwners) {
      const body = result.bodies.find(body => body.ref.bodyId === expectedOwner.bodyId);
      check(body?.ref.sourceFeatureId === expectedOwner.featureId && body.createdByFeatureId === expectedOwner.createdBy, 'Exact current and creation identities for ' + expectedOwner.bodyId);
      near(body.volume, expectedOwner.volume, 1e-5, 'Independent two-direction body volume');
      for (let axis = 0; axis < 3; axis++) {
        near(body.bounds.min[axis], expectedOwner.min[axis], 1e-6, 'Independent two-direction minimum');
        near(body.bounds.max[axis], expectedOwner.max[axis], 1e-6, 'Independent two-direction maximum');
      }
    }
    records.push({ phase, serial: row.serial, features: row.features, ...(rejected ? { rejected: true, featureErrors: result.featureErrors } : {}),
      bodies: result.bodies.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, bounds: body.bounds })), warnings: result.warnings });
    return row;
  }
  async function built(after, predicate, expectedOwners, phase, sourceOffset = 5) {
    const row = await waitFor('native two-direction build ' + phase, async () => {
      const observation = await observe(); check(!observation.workerErrors.length, 'No two-direction worker transport failure');
      return observation.builds.filter(row => row.serial > after && row.features[0]?.id === 'limits-base-profile' && predicate(row) && row.response).at(-1);
    });
    return material(row, expectedOwners, phase, sourceOffset);
  }
  async function begin(sketchId, command = 'Saliente/Base extruido') {
    await idle(); await press('.tree-row[data-feature-id="' + sketchId + '"]'); await press('.ribbon-tabs button', 'Operaciones');
    await press('button.command[title="' + command + '"]');
    await waitFor('optional closed-profile controls and current second direction', () => page((thin, direction, cut) => {
      const field = document.querySelector(thin), second = document.querySelector(direction);
      return !!field && !field.checked && !field.disabled && !!second && !second.checked && (cut || !second.disabled);
    }, THIN, TWO, command === 'Corte extruido'));
  }
  async function apply(row, expectedOwners, phase, committedFeatures = row.features, sourceOffset = 5) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const accepted = await built(serial, current => canonical(current.features) === canonical(committedFeatures), expectedOwners, phase, sourceOffset);
    await idle(); return accepted;
  }
  async function fileCommand(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function edit(id, field) {
    await idle(); await press('.tree-row[data-feature-id="' + id + '"]'); await press('.selection-tools button[title="Editar operación"]');
    await waitFor('saved editable two-direction parameter', async () => (await visible(field)).available);
  }
  async function selectOnlyBody(name) {
    await waitFor('current exact two-direction cut body selector', () => page(() => document.querySelectorAll('.body-operation-panel .body-list label.body-row').length > 0));
    const rows = await page(() => [...document.querySelectorAll('.body-operation-panel .body-list label.body-row')].map((row, index) => ({
      index, name: row.querySelector('span')?.firstChild?.textContent.trim(), checked: row.querySelector('input').checked })));
    check(rows.filter(row => row.name === name).length === 1, 'One exact named stepped body target is available');
    for (const row of rows) if (row.checked !== (row.name === name)) await press('.body-operation-panel .body-list label.body-row:nth-of-type(' + (row.index + 1) + ') input');
    check(await page(name => {
      const checked = [...document.querySelectorAll('.body-operation-panel .body-list label.body-row')].filter(row => row.querySelector('input').checked);
      return checked.length === 1 && checked[0].querySelector('span')?.firstChild?.textContent.trim() === name;
    }, name), 'Only the explicit original stepped material owner is selected');
    const label = 'Seleccionar cuerpos en el visor';
    const picker = await page(label => {
      const buttons = [...document.querySelectorAll('.body-operation-panel button.outline-button')].filter(button => button.textContent.trim() === label);
      return { count: buttons.length, active: buttons.length === 1 && buttons[0].classList.contains('active') };
    }, label);
    check(picker.count === 1, 'One actual body-picker control accompanies the exact cut target list');
    if (picker.active) await press('.body-operation-panel button.outline-button', label);
    await waitFor('two-direction cut body picker finished', () => page(label => {
      const buttons = [...document.querySelectorAll('.body-operation-panel button.outline-button')].filter(button => button.textContent.trim() === label);
      return buttons.length === 1 && !buttons[0].classList.contains('active');
    }, label));
  }


  async function configureBoth() {
    await change(D1, 13); await change('select[aria-label="Resultado del saliente"]', 'new');
    await change(NAME, 'Límites independientes');
    await change(END, 'upToSurface'); await change(TARGET, 'plane:limits-top-plane');
    await press(TWO); await change(D2, 7);
    await change(END2, 'upToSurface'); await change(TARGET2, 'plane:limits-bottom-plane');
  }
  async function wrongSideRejected(after) {
    const row = await waitFor('native rejection of unchanged targets after global reverse', async () => {
      const observation = await observe(); check(!observation.workerErrors.length, 'Wrong-side limits cause no worker transport error');
      return observation.builds.filter(row => row.serial > after && row.features[0]?.id === 'limits-base-profile'
        && plainDraft(row, up('top'), up('bottom'), -13) && row.response).at(-1);
    });
    material(row, originalOwners, 'reverse-retains-and-rejects-wrong-side-targets', 5, true);
    await waitFor('wrong-side target Apply blocked', () => page(selector => document.querySelector(selector)?.disabled === true, APPLY));
    check(await page((first, opposite) => document.querySelector(first)?.value === 'plane:limits-top-plane'
      && document.querySelector(opposite)?.value === 'plane:limits-bottom-plane', TARGET, TARGET2),
    'Global reverse retains both exact targets until the user explicitly reassigns them');
  }
  async function setBodyLimit(selector, limit) {
    await change(selector, JSON.stringify([limit.bodyId, limit.featureId]));
  }

  return async () => {
    const originalBytes = await fsp.readFile(input);
    await waitFor('initial independent-limit document commands', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    await built(serial, row => canonical(row.features) === canonical(expected.features), originalOwners, 'original-independent-limit-fixture'); await idle();
    const initialRecovery = await recovery();
    await begin('limits-plain-profile'); serial = (await observe()).serial; await configureBoth();
    await built(serial, row => plainDraft(row), row => plainOwners(row), 'two-independently-anchored-world-planes');
    await ready();

    serial = (await observe()).serial; await press('.property-manager button.outline-button', 'Invertir dirección');
    await wrongSideRejected(serial);
    serial = (await observe()).serial; await change(TARGET, 'plane:limits-bottom-plane'); await change(TARGET2, 'plane:limits-top-plane');
    await built(serial, row => plainDraft(row, up('bottom'), up('top'), -13), row => plainOwners(row), 'explicit-target-reassignment-after-global-reverse');
    serial = (await observe()).serial; await press('.property-manager button.outline-button', 'Invertir dirección');
    await change(TARGET, 'plane:limits-top-plane'); await change(TARGET2, 'plane:limits-bottom-plane');
    await built(serial, row => plainDraft(row), row => plainOwners(row), 'restore-forward-and-explicit-targets');

    serial = (await observe()).serial;
    await change(END, 'untilNext'); await setBodyLimit(BODY, top);
    await change(END2, 'untilNext'); await setBodyLimit(BODY2, bottom);
    await built(serial, row => plainDraft(row, nativeLimit('untilNext', top), nativeLimit('untilNext', bottom)),
      row => plainOwners(row), 'each-next-limit-reads-its-own-exact-body');
    serial = (await observe()).serial; await change(END, 'throughAll');
    await built(serial, row => plainDraft(row, nativeLimit('throughAll', top), nativeLimit('untilNext', bottom)),
      row => plainOwners(row, { volume: 1320, min: [30, 0, -3], max: [40, 6, 19] }), 'first-all-exit-second-next-entry');
    serial = (await observe()).serial; await change(END2, 'throughAll');
    await built(serial, row => plainDraft(row, nativeLimit('throughAll', top), nativeLimit('throughAll', bottom)),
      row => plainOwners(row, { volume: 1680, min: [30, 0, -9], max: [40, 6, 19] }), 'both-all-use-native-exits-without-margin-material');
    serial = (await observe()).serial; await change(END, 'untilNext');
    await built(serial, row => plainDraft(row, nativeLimit('untilNext', top), nativeLimit('throughAll', bottom)),
      row => plainOwners(row, { volume: 1500, min: [30, 0, -9], max: [40, 6, 16] }), 'first-next-entry-second-all-exit');
    serial = (await observe()).serial;
    await change(END, 'upToSurface'); await change(TARGET, 'plane:limits-top-plane');
    await change(END2, 'upToSurface'); await change(TARGET2, 'plane:limits-bottom-plane');
    await built(serial, row => plainDraft(row), row => plainOwners(row), 'restore-independent-plane-targets-after-body-limits');

    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => plainDraft(row, up('top'), up('bottom'), 13, false),
      row => plainOwners(row, firstOnly), 'second-off-retains-its-own-plane-and-depth');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => plainDraft(row), row => plainOwners(row), 'reactivation-restores-the-second-automatic-target');
    serial = (await observe()).serial; await change(END, 'blind');
    await built(serial, row => plainDraft(row, null), row => plainOwners(row, secondAutomatic), 'first-blind-second-automatic');
    serial = (await observe()).serial;
    await change(END, 'upToSurface'); await change(TARGET, 'plane:limits-top-plane'); await change(END2, 'blind');
    await built(serial, row => plainDraft(row, up('top'), null), row => plainOwners(row, firstAutomatic), 'first-automatic-second-blind');
    serial = (await observe()).serial; await change(END2, 'upToSurface'); await change(TARGET2, 'plane:limits-bottom-plane');
    await built(serial, row => plainDraft(row), row => plainOwners(row), 'restore-both-automatic-before-midpoint-recovery');

    await change(END, 'mid');
    await waitFor('explicit midpoint recovery with retained opposite target', () => page((end, two, opposite, apply) => document.querySelector(end)?.value === 'mid'
      && document.querySelector(two)?.checked === true && document.querySelector(two)?.disabled === false
      && document.querySelector(opposite)?.value === 'upToSurface' && document.querySelector(opposite)?.disabled === true
      && document.querySelector(apply)?.disabled === true, END, TWO, END2, APPLY));
    check(await recovery() === initialRecovery, 'Incompatible midpoint retains the request without committing or silently turning it off');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => last(row)?.type === 'extrude' && last(row).sketchId === 'limits-plain-profile'
      && last(row).depth === 13 && last(row).symmetric === true && !last(row).endCondition
      && canonical(last(row).secondDirection) === canonical(second(up('bottom'), 7, false)),
    row => plainOwners(row, midpoint), 'explicit-off-recovers-midpoint-and-retains-second-reference');
    serial = (await observe()).serial;
    await change(END, 'upToSurface'); await change(TARGET, 'plane:limits-top-plane'); await press(TWO);
    await built(serial, row => plainDraft(row), row => plainOwners(row), 'explicit-reactivation-after-leaving-midpoint');
    await change(END, 'mid');
    await waitFor('Cancel from incompatible independent-limit draft', () => page(selector => document.querySelector(selector)?.disabled === true, APPLY));
    check(await recovery() === initialRecovery, 'All new independent-limit drafts leave committed recovery unchanged');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(expected.features), originalOwners, 'cancel-incompatible-new-limit-draft'); await idle();
    check(await recovery() === initialRecovery, 'Cancel restores all original declarations and read-only bodies');

    await begin('limits-plain-profile'); serial = (await observe()).serial; await configureBoth();
    let preview = await built(serial, row => plainDraft(row), row => plainOwners(row), 'retry-independent-world-targets');
    plainOperation = last(preview);
    const accepted = await apply(preview, row => plainOwners(row), 'new-two-plane-boss-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(expected.features), originalOwners, 'undo-new-two-plane-boss'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(accepted.features), row => plainOwners(row), 'redo-new-two-plane-boss'); await idle();

    await begin('limits-cut-profile', 'Corte extruido'); serial = (await observe()).serial;
    await selectOnlyBody('Original stepped base'); await change(D1, 11); await change(NAME, 'Corte con límites propios');
    await change(END, 'upToSurface'); await change(TARGET, 'plane:limits-top-plane');
    await press(TWO); await change(D2, 8); await change(END2, 'upToSurface'); await change(TARGET2, 'plane:limits-bottom-plane');
    preview = await built(serial, row => last(row)?.type === 'cut' && last(row).sketchId === 'limits-cut-profile'
      && last(row).depth === 11 && !last(row).symmetric && !last(row).thinWall
      && canonical(last(row).endCondition) === canonical(up('top'))
      && canonical(last(row).secondDirection) === canonical(second(up('bottom'), 8))
      && canonical(last(row).bodyScope) === canonical([{ bodyId: base.bodyId, sourceFeatureId: base.featureId }]),
    row => [{ ...base, featureId: last(row).id, volume: 6876 }, top, bottom, owner(plainOperation, plain)], 'exact-owner-cut-between-its-own-two-world-planes');
    cutOperation = last(preview);
    const complete = await apply(preview, allOwners(plain, true), 'independent-two-plane-cut-applied');
    check(canonical(feature(complete, plainOperation.id)) === canonical(plainOperation),
      'Cut retains the separate boss declaration and both read-only limit bodies');
    await fileCommand('Guardar como…');
    await waitFor('first independent-limit save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8'));
    check(canonical(saved.features) === canonical(complete.features), 'Saved independent-limit sequence equals the accepted worker declarations');
    const savedRecovery = await recovery();
    await edit(plainOperation.id, TARGET2); serial = (await observe()).serial; await change(TARGET2, 'plane:limits-alternate-plane');
    await built(serial, row => plainDraft(row, up('top'), up('alternate')), row => plainOwners(row, editedPlain), 'saved-second-target-preview');
    check(await recovery() === savedRecovery, 'Saved target preview preserves committed recovery');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(saved.features), allOwners(plain, true), 'cancel-saved-second-target-edit'); await idle();
    check(await recovery() === savedRecovery, 'Saved target Cancel restores both independent references and downstream cut exactly');
    await edit(plainOperation.id, TARGET2); serial = (await observe()).serial; await change(TARGET2, 'plane:limits-alternate-plane');
    preview = await built(serial, row => plainDraft(row, up('top'), up('alternate')), row => plainOwners(row, editedPlain), 'retry-saved-second-target-edit');
    check(preview.features.length === originalCount + 1, 'Saved boss preview rolls back the later cut until Apply');
    const editedFeatures = saved.features.map(item => item.id === plainOperation.id
      ? { ...item, secondDirection: { ...item.secondDirection, endCondition: up('alternate') } } : item);
    const edited = await apply(preview, allOwners(editedPlain, true), 'saved-second-target-applied-with-own-cut-target-unchanged', editedFeatures);
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(saved.features), allOwners(plain, true), 'undo-saved-second-target'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), allOwners(editedPlain, true), 'redo-saved-second-target'); await idle();

    const beforeFrameRecovery = await recovery();
    await edit('limits-source-plane', PLANE); serial = (await observe()).serial; await change(PLANE, 7);
    preview = await built(serial, row => last(row)?.id === 'limits-source-plane' && last(row).offset === 7,
      originalOwners, 'saved-source-plane-preview', 7);
    check(await recovery() === beforeFrameRecovery, 'Source-plane preview preserves the committed independent-limit declarations');
    const movedFeatures = edited.features.map(item => item.id === 'limits-source-plane' ? { ...item, offset: 7 } : item);
    const moved = await apply(preview, allOwners(editedPlain, true), 'moved-source-keeps-both-boss-and-cut-world-ends-anchored', movedFeatures, 7);
    check(canonical(feature(moved, plainOperation.id)) === canonical(feature(edited, plainOperation.id))
      && canonical(feature(moved, cutOperation.id)) === canonical(cutOperation),
    'Moving the source changes resolved distances without changing either operation target or cached depth');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), allOwners(editedPlain, true), 'undo-anchored-source-plane-motion'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(moved.features), allOwners(editedPlain, true), 'redo-anchored-source-plane-motion', 7); await idle();
    await fileCommand('Guardar');
    await waitFor('second independent-limit save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const finalBytes = await fsp.readFile(output), finalSaved = JSON.parse(finalBytes.toString('utf8'));
    check(canonical(finalSaved.features) === canonical(moved.features), 'Second write preserves independent saved targets and the moved source plane');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await built(serial, row => canonical(row.features) === canonical(finalSaved.features), allOwners(editedPlain, true), 'fresh-reopen-preserves-anchored-two-direction-limits', 7); await idle();
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Original limit fixture file remains byte-identical');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Two bounded Open dialogs and one Save As dialog only');
    const observation = await observe();
    check(!observation.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed),
      'No independent-limit worker, renderer, resource or unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production independent-limit worker and WASM actually loaded');
    evidence.partTwoDirectionLimits.persistence = { inputSha256: digest(originalBytes), initialSha256: digest(savedBytes), finalSha256: digest(finalBytes), dialogs: dialogCounts(),
      geometricLimits: 'Renderer native volume1e-5mm³/bounds1e-6mm. Step7056, read-only limits288/576; plane boss1140, mixed firstAuto1080/secondAuto1260; body Next/Next1140, All/Next1320, Next/All1500, All/All1680; edited boss1260 and cut6876 retain world bounds after source5->7. No BRep, area, STEP, recipe or platform claim.' };
    evidence.savedSha256 = digest(finalBytes); await capture(finalSaved);
  };
};
