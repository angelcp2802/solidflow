'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function twoDirectionWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, capture, check, canonical, digest,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, dialogCounts, initialReadyMs } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const D1 = 'input[aria-label="Profundidad"]', TWO = 'input[aria-label="Dirección 2"]';
  const D2 = 'input[aria-label="Profundidad de dirección 2"]', END = 'select[aria-label="Condición final"]';
  const TARGET = 'select[aria-label="Superficie de destino"]', NAME = 'input[aria-label="Nombre de operación"]';
  const THIN = 'input[aria-label="Operación lámina"]', T = 'input[aria-label="Espesor de pared"]';
  const CAPS = 'input[aria-label="Tapas de extremos"]', C = 'input[aria-label="Espesor de tapas"]';
  const PLANE = 'input[aria-label="Distancia del plano"]';
  const second = (depth = 7, enabled = true) => ({ enabled, depth });
  const wall = { kind: 'one-side', thickness: 2, reversed: false, endCaps: { enabled: true, thickness: 4 } };
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const records = [], inputs = [], evidence = { partTwoDirection: { records, inputs,
    provenance: 'Original analytical millimetre declarations: one merged stepped base, two reference planes and three unused rectangle profiles; no imported geometry.',
    scope: 'Unequal fixed linear directions, global reverse, retained OFF depth and focus, explicit midpoint/automatic recovery, caps over the complete span, exact cut owner, source-frame translation, Cancel/retry, history, two writes and fresh reopening.',
    inputLimits: 'Actual CDP left press/release on visible stationary hit-tested controls. Parameter changes use native value setters and bubbling input/change events; no physical keyboard claim. DOM scrolling only reveals controls. No handlers, worker results or application state are injected.',
    limits: 'Original XY rectangles and translated parallel source frame. Renderer native volume/bounds do not independently attest BRep validity, area, STEP, arbitrary frames, two anchored automatic limits, complete interaction parity or installed-platform support.' } };
  checks.push(evidence);
  const originalCount = expected.features.length, originalCanonical = canonical(expected);
  const last = row => row.features.at(-1);
  const feature = (row, id) => row.features.find(item => item.id === id);
  const hasSecond = (operation, depth = 7, enabled = true) => canonical(operation?.secondDirection) === canonical(second(depth, enabled));
  const authored = (row, first = 13, depth = 7, enabled = true) => last(row)?.type === 'extrude'
    && last(row).sketchId === 'two-plain-profile' && last(row).depth === first && hasSecond(last(row), depth, enabled);
  const base = { bodyId: 'two-base-body', featureId: 'two-upper', createdBy: 'two-base', volume: 7056,
    min: [0, 0, -10], max: [20, 14, 20] };
  const plain = { volume: 1200, min: [30, 0, -2], max: [40, 6, 18] };
  const oneWay = { volume: 780, min: [30, 0, 5], max: [40, 6, 18] };
  const reversed = { volume: 1200, min: [30, 0, -8], max: [40, 6, 12] };
  const midpoint = { volume: 780, min: [30, 0, -1.5], max: [40, 6, 11.5] };
  const automatic = { volume: 660, min: [30, 0, 5], max: [40, 6, 16] };
  const corrected = { volume: 990, min: [30, 0, 1.5], max: [40, 6, 18] };
  const caps = { volume: 2688, min: [53, -2, -2], max: [69, 10, 18] };
  const enlarged = { volume: 1320, min: [30, 0, -2], max: [40, 6, 20] };
  const shiftedPlain = { volume: 1320, min: [30, 0, 0], max: [40, 6, 22] };
  const shiftedCaps = { volume: 2688, min: [53, -2, 0], max: [69, 10, 20] };
  const owner = (operation, dimensions) => ({ bodyId: operation.bodyOperation.bodyId, featureId: operation.id, createdBy: operation.id, ...dimensions });
  const plainOwners = (row, dimensions) => [base, owner(last(row), dimensions)];
  const near = (actual, value, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - value) <= tolerance,
    `${label}: ${actual}, expected ${value}`);
  let plainOperation, capOperation, cutOperation;
  const allOwners = (dimensions = plain, capDimensions = caps, cut = false, cutVolume = 6876) => [
    cut ? { ...base, featureId: cutOperation.id, volume: cutVolume } : base,
    owner(plainOperation, dimensions), owner(capOperation, capDimensions),
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
  function material(row, expectedOwners, phase, sourceOffset = 5) {
    check(row.response.ok, row.response.error || 'Native two-direction build response succeeds');
    const result = row.response.value, actualOwners = typeof expectedOwners === 'function' ? expectedOwners(row) : expectedOwners;
    check(!result.featureErrors.length, 'No two-direction native feature error: ' + JSON.stringify({ phase, featureErrors: result.featureErrors }));
    const warnings = actualOwners.length > 1 ? [`La pieza contiene ${actualOwners.length} sólidos separados.`] : [];
    check(canonical(result.warnings) === canonical(warnings) && result.bodyCatalogActive && result.bodies?.length === actualOwners.length,
      'Two-direction build retains exact body inventory and warnings: ' + JSON.stringify({ phase, warnings: result.warnings }));
    const prefix = expected.features.map(item => item.id === 'two-source-plane' ? { ...item, offset: sourceOffset } : item)
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
    records.push({ phase, serial: row.serial, features: row.features,
      bodies: result.bodies.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, bounds: body.bounds })), warnings: result.warnings });
    return row;
  }
  async function built(after, predicate, expectedOwners, phase, sourceOffset = 5) {
    const row = await waitFor('native two-direction build ' + phase, async () => {
      const observation = await observe(); check(!observation.workerErrors.length, 'No two-direction worker transport failure');
      return observation.builds.filter(row => row.serial > after && row.features[0]?.id === 'two-base-profile' && predicate(row) && row.response).at(-1);
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
  async function configurePlain() {
    await change(D1, 13); await change('select[aria-label="Resultado del saliente"]', 'new');
    await change(NAME, 'Dos direcciones desiguales'); await press(TWO); await change(D2, 7);
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

  return async () => {
    const originalBytes = await fsp.readFile(input);
    await waitFor('initial two-direction document commands', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'original-unused-profiles-and-translated-frame'); await idle();
    const initialRecovery = await recovery();
    await begin('two-plain-profile'); serial = (await observe()).serial; await configurePlain();
    await built(serial, row => authored(row) && !last(row).symmetric && !last(row).endCondition,
      row => plainOwners(row, plain), 'unequal-positive-directions');
    serial = (await observe()).serial; await press('.property-manager button.outline-button', 'Invertir dirección');
    await built(serial, row => authored(row, -13) && !last(row).symmetric && !last(row).endCondition,
      row => plainOwners(row, reversed), 'global-reverse-swaps-the-two-interval-sides');
    serial = (await observe()).serial; await press('.property-manager button.outline-button', 'Invertir dirección');
    await built(serial, row => authored(row), row => plainOwners(row, plain), 'restore-global-forward-direction');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => authored(row, 13, 7, false), row => plainOwners(row, oneWay), 'direction-two-off-retains-seven');
    check(await page(selector => { const field = document.querySelector(selector); return !!field && field.value === '7'
      && !field.checkVisibility() && !field.getClientRects().length; }, D2), 'Valid inactive second depth remains mounted, retained and hidden');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => authored(row), row => plainOwners(row, plain), 'direction-two-reactivated-retains-seven');

    await change(END, 'mid');
    await waitFor('explicit midpoint direction-two recovery', () => page((end, two, depth, apply) => document.querySelector(end)?.value === 'mid'
      && document.querySelector(two)?.checked === true && document.querySelector(two)?.disabled === false
      && document.querySelector(depth)?.value === '7' && document.querySelector(depth)?.disabled === true
      && document.querySelector(apply)?.disabled === true, END, TWO, D2, APPLY));
    check(await recovery() === initialRecovery, 'Unsupported midpoint retains the active second request without committing');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => authored(row, 13, 7, false) && last(row).symmetric === true && !last(row).endCondition,
      row => plainOwners(row, midpoint), 'explicit-second-deactivation-for-total-depth-midpoint');
    check(await page(selector => document.querySelector(selector)?.checked === false && document.querySelector(selector)?.disabled === true, TWO),
      'Midpoint prevents new second activation after explicit recovery');
    serial = (await observe()).serial; await change(END, 'blind'); await press(TWO);
    await built(serial, row => authored(row) && !last(row).symmetric && !last(row).endCondition,
      row => plainOwners(row, plain), 'explicit-second-reactivation-after-midpoint');

    serial = (await observe()).serial; await change(END, 'upToSurface'); await change(TARGET, 'plane:two-limit-plane');
    await built(serial, row => authored(row) && !last(row).symmetric
      && canonical(last(row).endCondition) === canonical({ kind: 'upToSurface', target: { kind: 'plane', planeId: 'two-limit-plane' } }),
    row => plainOwners(row, { volume: 1080, min: [30, 0, -2], max: [40, 6, 16] }), 'first-automatic-limit-with-retained-second-blind-depth');
    await ready();
    check(await page((end, target, two, depth, apply) =>
      document.querySelector(end)?.value === 'upToSurface' && document.querySelector(target)?.value === 'plane:two-limit-plane'
      && document.querySelector(two)?.checked === true && document.querySelector(two)?.disabled === false
      && document.querySelector(depth)?.value === '7' && document.querySelector(depth)?.disabled === false
      && document.querySelector(apply)?.disabled === false, END, TARGET, TWO, D2, APPLY),
    'The first automatic plane and independent second blind depth are simultaneously valid');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => authored(row, 13, 7, false) && !last(row).symmetric
      && canonical(last(row).endCondition) === canonical({ kind: 'upToSurface', target: { kind: 'plane', planeId: 'two-limit-plane' } }),
    row => plainOwners(row, automatic), 'explicit-second-off-preserves-the-exact-automatic-target');
    check(await page((target, two) => document.querySelector(target)?.value === 'plane:two-limit-plane'
      && document.querySelector(two)?.checked === false && document.querySelector(two)?.disabled === false, TARGET, TWO),
    'Explicit second OFF preserves the selected first target and permits independent reactivation');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => authored(row) && !last(row).symmetric
      && canonical(last(row).endCondition) === canonical({ kind: 'upToSurface', target: { kind: 'plane', planeId: 'two-limit-plane' } }),
    row => plainOwners(row, { volume: 1080, min: [30, 0, -2], max: [40, 6, 16] }), 'reactivate-second-with-first-plane-still-anchored');
    serial = (await observe()).serial; await change(END, 'blind');
    await built(serial, row => authored(row) && !last(row).symmetric && !last(row).endCondition,
      row => plainOwners(row, plain), 'return-blind-and-explicitly-restore-second');

    await change(D2, 0);
    check(await page((depth, apply) => document.querySelector(depth)?.value === '0' && document.querySelector(apply)?.disabled === true
      && !!document.querySelector('#extrusion-direction-error[role="alert"]'), D2, APPLY), 'Zero second depth stays editable, visibly invalid and cannot Apply');
    await press(TWO);
    check(await page((depth, two, apply) => { const field = document.querySelector(depth); return !!field && field.value === '0'
      && field.checkVisibility() && !field.disabled && document.querySelector(two)?.checked === false && document.querySelector(apply)?.disabled === true;
    }, D2, TWO, APPLY), 'Inactive zero second depth remains visible and editable');
    serial = (await observe()).serial; await press(D2);
    const correction = await page(async selector => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0];
      if (fields.length !== 1 || !(field instanceof HTMLInputElement)) throw Error('One retained second-depth input required');
      const inspect = () => {
        const rect = field.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { sameNode: document.querySelector(selector) === field, focused: document.activeElement === field,
          visible: field.checkVisibility() && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0
            && rect.right <= innerWidth && rect.bottom <= innerHeight && !!hit && (hit === field || field.contains(hit)),
          disabled: field.disabled, value: field.value, focusWithin: field.closest('label')?.matches(':focus-within') === true };
      };
      const before = inspect();
      if (!before.sameNode || !before.focused || !before.visible || before.disabled || before.value !== '0') throw Error('Actual pointer focus on the invalid second depth required');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const enter = async value => {
        const current = inspect();
        if (!current.sameNode || !current.focused || !current.visible || current.disabled) throw Error('Second depth lost identity, focus or visibility before the next value');
        setter.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return inspect();
      };
      const first = await enter('3');
      if (!first.sameNode || !first.focused || !first.visible || first.disabled || first.value !== '3' || !first.focusWithin) throw Error('The first valid second-depth digit must retain the exact focused visible input');
      const completed = await enter('3.5');
      if (!completed.sameNode || !completed.focused || !completed.visible || completed.disabled || completed.value !== '3.5' || !completed.focusWithin) throw Error('The complete second-depth decimal must retain the exact focused visible input');
      return { before, first, completed };
    }, D2);
    check(correction.first.sameNode && correction.first.focused && correction.first.visible && correction.first.value === '3'
      && correction.completed.sameNode && correction.completed.focused && correction.completed.visible && correction.completed.value === '3.5',
    'Inactive second depth retains the same visible focused DOM input through the first valid digit and decimal');
    inputs.push({ selector: D2, values: ['3', '3.5'], input: 'actual pointer focus, then native setter and bubbling input events; no physical keyboard claim' });
    evidence.partTwoDirection.focusCorrection = correction;
    await built(serial, row => authored(row, 13, 3.5, false), row => plainOwners(row, oneWay), 'inactive-second-depth-focus-correction');
    await press(D1);
    check(await page((depth, primary) => { const field = document.querySelector(depth); return !!field && !field.checkVisibility()
      && !field.getClientRects().length && document.activeElement === document.querySelector(primary); }, D2, D1), 'Real pointer blur hides the retained valid inactive second depth');
    serial = (await observe()).serial; await press(TWO);
    await built(serial, row => authored(row, 13, 3.5), row => plainOwners(row, corrected), 'corrected-second-depth-reactivated');
    serial = (await observe()).serial; await change(D2, 7);
    await built(serial, row => authored(row), row => plainOwners(row, plain), 'restore-second-depth-before-invalid-cancel');
    await change(D2, 0);
    check(await page((depth, apply) => document.querySelector(depth)?.value === '0' && document.querySelector(apply)?.disabled === true, D2, APPLY),
      'Cancel is exercised from an invalid active second-depth draft');
    check(await recovery() === initialRecovery, 'All two-direction previews and invalid recovery preserve committed recovery');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'cancel-new-invalid-second-depth'); await idle();
    check(await recovery() === initialRecovery, 'Cancel restores exact original declarations and recovery');

    await begin('two-plain-profile'); serial = (await observe()).serial; await configurePlain();
    let preview = await built(serial, row => authored(row) && !last(row).symmetric && !last(row).endCondition,
      row => plainOwners(row, plain), 'retry-new-two-direction-boss');
    plainOperation = last(preview);
    const acceptedPlain = await apply(preview, row => plainOwners(row, plain), 'new-two-direction-boss-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'undo-new-two-direction-boss'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(acceptedPlain.features), row => plainOwners(row, plain), 'redo-new-two-direction-boss'); await idle();

    await begin('two-caps-profile'); serial = (await observe()).serial;
    await change(D1, 13); await change('select[aria-label="Resultado del saliente"]', 'new'); await change(NAME, 'Caja axial de dos direcciones');
    await press(TWO); await change(D2, 7); await press(THIN); await change(T, 2); await press(CAPS); await change(C, 4);
    preview = await built(serial, row => last(row)?.type === 'extrude' && last(row).sketchId === 'two-caps-profile'
      && last(row).depth === 13 && hasSecond(last(row)) && !last(row).symmetric && !last(row).endCondition
      && canonical(last(row).thinWall) === canonical(wall) && last(row).bodyOperation?.mode === 'new',
    row => [base, owner(plainOperation, plain), owner(last(row), caps)], 'caps-four-over-the-total-twenty-span');
    capOperation = last(preview);
    await apply(preview, allOwners(), 'single-core-two-direction-caps-applied');

    await begin('two-cut-profile', 'Corte extruido'); serial = (await observe()).serial;
    await change(D1, 11); await change(NAME, 'Corte desigual del escalón'); await selectOnlyBody('Original stepped base');
    await press(TWO); await change(D2, 8);
    preview = await built(serial, row => last(row)?.type === 'cut' && last(row).sketchId === 'two-cut-profile'
      && last(row).depth === 11 && hasSecond(last(row), 8) && !last(row).symmetric && !last(row).endCondition
      && !last(row).thinWall && canonical(last(row).bodyScope) === canonical([{ bodyId: base.bodyId, sourceFeatureId: base.featureId }]),
    row => [{ ...base, featureId: last(row).id, volume: 6876 }, owner(plainOperation, plain), owner(capOperation, caps)], 'cut-crosses-the-source-plane-and-step-on-one-exact-owner');
    cutOperation = last(preview);
    const complete = await apply(preview, allOwners(plain, caps, true), 'exact-owner-two-direction-cut-applied');
    check(canonical(feature(complete, plainOperation.id)) === canonical(plainOperation) && canonical(feature(complete, capOperation.id)) === canonical(capOperation),
      'Cut leaves both separate additive declarations and exact material owners unchanged');
    await fileCommand('Guardar como…');
    await waitFor('initial two-direction save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8'));
    check(canonical(saved.features) === canonical(complete.features), 'Saved original two-direction sequence equals accepted worker declarations');
    const savedRecovery = await recovery();
    await edit(plainOperation.id, D1); serial = (await observe()).serial; await change(D1, 15);
    await built(serial, row => authored(row, 15), row => plainOwners(row, enlarged), 'saved-first-depth-preview-preserves-second');
    check(await recovery() === savedRecovery, 'Saved unequal-depth preview preserves committed recovery');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(saved.features), allOwners(plain, caps, true), 'saved-first-depth-cancel'); await idle();
    check(await recovery() === savedRecovery, 'Saved unequal-depth Cancel restores exact downstream declarations and recovery');
    await edit(plainOperation.id, D1); serial = (await observe()).serial; await change(D1, 15);
    preview = await built(serial, row => authored(row, 15), row => plainOwners(row, enlarged), 'saved-first-depth-retry');
    check(preview.features.length === originalCount + 1, 'Saved first-operation preview rolls back the later cap and cut operations until Apply');
    const editedFeatures = saved.features.map(item => item.id === plainOperation.id ? { ...item, depth: 15 } : item);
    const edited = await apply(preview, allOwners(enlarged, caps, true), 'saved-first-depth-applied-with-downstream-rebuild', editedFeatures);
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(saved.features), allOwners(plain, caps, true), 'undo-saved-first-depth'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), allOwners(enlarged, caps, true), 'redo-saved-first-depth'); await idle();

    const beforeFrameRecovery = await recovery();
    await edit('two-source-plane', PLANE); serial = (await observe()).serial; await change(PLANE, 7);
    preview = await built(serial, row => last(row)?.id === 'two-source-plane' && last(row).offset === 7,
      [base], 'saved-source-plane-distance-preview', 7);
    check(await recovery() === beforeFrameRecovery, 'Source-frame preview leaves all committed fixed-depth declarations untouched');
    const shiftedFeatures = edited.features.map(item => item.id === 'two-source-plane' ? { ...item, offset: 7 } : item);
    const shifted = await apply(preview, allOwners(shiftedPlain, shiftedCaps, true, 6888), 'source-frame-shifts-both-fixed-depth-branches-once', shiftedFeatures, 7);
    check(hasSecond(feature(shifted, plainOperation.id)) && hasSecond(feature(shifted, capOperation.id)) && hasSecond(feature(shifted, cutOperation.id), 8)
      && canonical(feature(shifted, cutOperation.id)) === canonical(cutOperation), 'Source-plane motion preserves every fixed depth and exact cut target; it does not anchor the old world ends');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), allOwners(enlarged, caps, true), 'undo-source-frame-translation'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(shifted.features), allOwners(shiftedPlain, shiftedCaps, true, 6888), 'redo-source-frame-translation', 7); await idle();
    await fileCommand('Guardar');
    await waitFor('edited two-direction save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const finalBytes = await fsp.readFile(output), finalSaved = JSON.parse(finalBytes.toString('utf8'));
    check(canonical(finalSaved.features) === canonical(shifted.features), 'Second write preserves edited fixed depths, moved frame, caps and exact target ownership');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await built(serial, row => canonical(row.features) === canonical(finalSaved.features), allOwners(shiftedPlain, shiftedCaps, true, 6888), 'saved-two-directions-fresh-native-reopen', 7); await idle();
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'The original fixture file remains byte-identical after all edits and writes');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Two bounded Open dialogs and one Save As dialog only');
    const observation = await observe();
    check(!observation.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No two-direction worker, renderer, resource or unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production two-direction worker and WASM actually loaded');
    evidence.partTwoDirection.persistence = { inputSha256: digest(originalBytes), initialSha256: digest(savedBytes), finalSha256: digest(finalBytes), dialogs: dialogCounts(),
      geometricLimits: 'Renderer native volume1e-5mm³/bounds1e-6mm. Original steppedbase7056; plain13/7=1200, OFF=780, corrected13/3.5=990, edited15/7=1320; caps13/7/c4=2688; cut11/8 at source5=6876 and source7=6888. No BRep, area, STEP, dual anchored automatic limits or platform-equivalence claim.' };
    evidence.savedSha256 = digest(finalBytes); await capture(finalSaved);
  };
};
