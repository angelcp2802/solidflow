'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function automaticCornerWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, capture, check, canonical, digest,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, dialogCounts, initialReadyMs } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const THIN = 'input[aria-label="Operación lámina"]', MODE = 'select[aria-label="Tipo de pared"]';
  const T = 'input[aria-label="Espesor de pared"]', T1 = 'input[aria-label="Espesor 1"]', T2 = 'input[aria-label="Espesor 2"]';
  const AUTO = 'input[aria-label="Redondeo automático de esquinas"]', R = 'input[aria-label="Radio del redondeo automático"]';
  const REVERSE = 'button[aria-label="Invertir lado de pared"]';
  const one = (reversed = false, radius = 3, enabled = true) => ({ kind: 'one-side', thickness: 2, reversed, autoCorners: { enabled, radius } });
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const records = [], inputs = [], evidence = { partAutoCorners: { records, inputs,
    provenance: 'Original analytical millimetre declarations; two connected LINEs and one separately owned cylinder, without imported geometry.',
    scope: 'Inner-radius corner rounding through wall modes, reversal, invalid drafts, Cancel/retry, new/saved Apply, history, Save and fresh reopening.',
    inputLimits: 'Actual CDP left press/release on visible stationary hit-tested controls. Parameter fields use their native value setter and bubbling input/change events. DOM scrolling only reveals controls; no worker result, handler or application state is injected.',
    limits: 'One original XY L profile. Renderer volume/bounds checks do not independently attest BRep validity, area, STEP, complete interaction parity, other corner/support families, end caps or installed-platform support.' } };
  checks.push(evidence);
  const originalCount = expected.features.length;
  const base = { bodyId: 'corner-base-body', featureId: 'corner-base', createdBy: 'corner-base', volume: 12 * Math.PI,
    min: [38, -2, 0], max: [42, 2, 3] };
  const right = { volume: 580 + 40 * Math.PI, min: [0, -2, 0], max: [22, 15, 10] };
  const left = { volume: 500 + 40 * Math.PI, min: [0, 0, 0], max: [20, 15, 10] };
  const midpoint = { volume: 540 + 40 * Math.PI, min: [0, -1, 0], max: [21, 15, 10] };
  const twoSides = { volume: 810 + 67.5 * Math.PI, min: [0, -2, 0], max: [22, 15, 10] };
  const small = { volume: 619.96 + 10.01 * Math.PI, min: [0, 0, 0], max: [20, 15, 10] };
  const near = (actual, value, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - value) <= tolerance,
    `${label}: ${actual}, expected ${value}`);
  const last = row => row.features.at(-1);
  const sameWall = (row, wall) => last(row)?.type === 'extrude' && canonical(last(row).thinWall) === canonical(wall);
  const owner = (feature, dimensions) => ({ bodyId: feature.bodyOperation.bodyId, featureId: feature.id, createdBy: feature.id, ...dimensions });
  const owners = (row, dimensions) => [base, owner(last(row), dimensions)];

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
    const state = await waitFor('stationary corner control ' + (label ?? selector), async () => {
      const current = await visible(selector, label), signature = canonical(current);
      if (signature !== previous) { previous = signature; stationary = Date.now(); }
      return current.available && Date.now() - stationary >= 100 ? current : false;
    });
    await pointer('mouseMoved', state.point);
    check(canonical(await visible(selector, label)) === canonical(state), 'Corner control remains enabled, hit-tested and stationary');
    await pointer('mousePressed', state.point, 1); await pointer('mouseReleased', state.point, 0);
    inputs.push({ selector, ...(label ? { label } : {}), point: state.point, input: 'actual left press/release' });
  }
  async function change(selector, value) {
    await waitFor('visible corner parameter ' + selector, async () => (await visible(selector)).available);
    await page((selector, value) => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (fields.length !== 1 || !field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight || !hit || !(field === hit || field.contains(hit))) throw Error('One visible enabled hit-tested corner parameter required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('One current enabled corner option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    inputs.push({ selector, value: String(value), input: 'visible native field setter and bubbling event' });
    await waitFor('retained corner parameter ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)));
    await frames();
  }
  const idle = () => waitFor('closed idle corner editor', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  const ready = () => waitFor('native acceptable corner preview', () => page(selector => { const button = document.querySelector(selector); return !!button && !button.disabled; }, APPLY));
  async function built(after, predicate, expectedOwners, phase) {
    const row = await waitFor('native corner build ' + phase, async () => {
      const observation = await observe(); check(!observation.workerErrors.length, 'No corner worker transport failure');
      return observation.builds.filter(row => row.serial > after && row.features[0]?.id === 'corner-base-profile' && predicate(row) && row.response).at(-1);
    });
    check(row.response.ok, row.response.error || 'Native corner build succeeds');
    const result = row.response.value;
    const actualOwners = typeof expectedOwners === 'function' ? expectedOwners(row) : expectedOwners;
    const warnings = actualOwners.length > 1 ? [`La pieza contiene ${actualOwners.length} sólidos separados.`] : [];
    check(!result.featureErrors.length && canonical(result.warnings) === canonical(warnings) && result.bodyCatalogActive,
      'Corner build has exact owned-body inventory and warnings: ' + JSON.stringify({ phase, featureErrors: result.featureErrors, warnings: result.warnings }));
    check(result.bodies?.length === actualOwners.length, 'No implicit corner body, changed target or dropped owner');
    check(canonical(row.features.slice(0, originalCount)) === canonical(expected.features), 'Original source sketches and read-only cylinder remain unchanged');
    for (const expectedOwner of actualOwners) {
      const body = result.bodies.find(body => body.ref.bodyId === expectedOwner.bodyId);
      check(body?.ref.sourceFeatureId === expectedOwner.featureId && body.createdByFeatureId === expectedOwner.createdBy, 'Exact current and creation identities for ' + expectedOwner.bodyId);
      near(body.volume, expectedOwner.volume, 1e-5, 'Independent corner body volume');
      for (let axis = 0; axis < 3; axis++) {
        near(body.bounds.min[axis], expectedOwner.min[axis], 1e-6, 'Independent corner minimum');
        near(body.bounds.max[axis], expectedOwner.max[axis], 1e-6, 'Independent corner maximum');
      }
    }
    records.push({ phase, serial: row.serial, features: row.features,
      bodies: result.bodies.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, bounds: body.bounds })), warnings: result.warnings });
    return row;
  }
  async function begin() {
    await idle(); await press('.tree-row[data-feature-id="corner-L"]'); await press('.ribbon-tabs button', 'Operaciones');
    await press('button.command[title="Saliente/Base extruido"]');
    await waitFor('current open-only corner controls', () => page((thin, auto, t) => {
      const field = document.querySelector(thin), round = document.querySelector(auto), thickness = document.querySelector(t);
      return field?.checked && field.disabled && !!thickness && !thickness.disabled && !!round && !round.disabled && !round.checked;
    }, THIN, AUTO, T));
  }
  async function configure() {
    await change('input[aria-label="Profundidad"]', 10); await change('select[aria-label="Resultado del saliente"]', 'new');
    await change('input[aria-label="Nombre de operación"]', 'Esquina de pared'); await change(T, 2); await press(AUTO); await change(R, 3);
  }
  async function apply(row, expectedOwners, phase, committedFeatures = row.features) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const accepted = await built(serial, current => canonical(current.features) === canonical(committedFeatures), expectedOwners, phase);
    await idle(); return accepted;
  }
  async function fileCommand(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function edit(id) {
    await idle(); await press('.tree-row[data-feature-id="' + id + '"]'); await press('.selection-tools button[title="Editar operación"]');
    await waitFor('saved automatic corner editor', () => page((thin, auto, radius) => {
      const field = document.querySelector(thin), round = document.querySelector(auto);
      return field?.checked && field.disabled && round?.checked && !round.disabled && !!document.querySelector(radius);
    }, THIN, AUTO, R));
  }
  return async () => {
    await waitFor('initial corner document commands', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'original-unused-L'); await idle();
    const initialRecovery = await recovery();
    await begin(); serial = (await observe()).serial; await configure();
    let preview = await built(serial, row => sameWall(row, one()) && last(row).depth === 10 && last(row).bodyOperation?.mode === 'new', row => owners(row, right), 'right-inner-radius');
    serial = (await observe()).serial; await press(REVERSE);
    await built(serial, row => sameWall(row, one(true)), row => owners(row, left), 'reversed-inner-radius');
    serial = (await observe()).serial; await change(MODE, 'mid-plane'); await change(T, 2);
    await built(serial, row => sameWall(row, { kind: 'mid-plane', thickness: 2, autoCorners: { enabled: true, radius: 3 } }), row => owners(row, midpoint), 'mid-wall-preserves-radius');
    check(await page(selector => document.querySelector(selector)?.disabled === true, REVERSE), 'Mid-plane thickness keeps wall reversal disabled');
    serial = (await observe()).serial; await change(MODE, 'two-sides'); await change(T1, 2); await change(T2, 1);
    await built(serial, row => sameWall(row, { kind: 'two-sides', firstThickness: 2, secondThickness: 1, autoCorners: { enabled: true, radius: 3 } }), row => owners(row, twoSides), 'two-wall-preserves-radius');
    serial = (await observe()).serial; await change(MODE, 'one-side');
    await built(serial, row => sameWall(row, one()), row => owners(row, right), 'return-one-wall-preserves-radius');
    serial = (await observe()).serial; await press(REVERSE);
    await built(serial, row => sameWall(row, one(true)), row => owners(row, left), 'restore-left-wall');
    serial = (await observe()).serial; await press(AUTO);
    await built(serial, row => sameWall(row, one(true, 3, false)), row => owners(row, { ...left, volume: 660 }), 'rounding-disabled-retains-radius');
    check(await page(selector => { const field = document.querySelector(selector); return !!field && !field.checkVisibility() && !field.getClientRects().length; }, R), 'Disabled rounding hides the retained radius field');
    serial = (await observe()).serial; await press(AUTO);
    preview = await built(serial, row => sameWall(row, one(true)), row => owners(row, left), 'rounding-reenabled-restores-radius');
    check(await page(selector => document.querySelector(selector)?.value === '3', R), 'Re-enabling rounding restores the user radius');
    await change(R, 0);
    check(await page(selector => document.querySelector(selector)?.disabled === true && !!document.querySelector('.thin-wall-error[role="alert"]'), APPLY), 'Zero inner radius remains editable, visibly rejected and cannot Apply');
    check(await recovery() === initialRecovery, 'Invalid radius and new previews do not change committed recovery');
    // Correct an inactive radius without losing the user's focus after the first valid digit.
    await press(AUTO);
    check(await page((radius, auto, apply) => { const field = document.querySelector(radius), toggle = document.querySelector(auto);
      return !!field && field.value === '0' && field.checkVisibility() && !field.disabled && toggle?.checked === false
        && document.querySelector(apply)?.disabled === true && !!document.querySelector('.thin-wall-error[role="alert"]');
    }, R, AUTO, APPLY), 'An invalid inactive radius remains visible, editable and blocks Apply');
    serial = (await observe()).serial; await press(R);
    const correction = await page(async selector => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0];
      if (fields.length !== 1 || !(field instanceof HTMLInputElement)) throw Error('One retained corner-radius input required');
      const inspect = () => {
        const rect = field.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { sameNode: document.querySelector(selector) === field, focused: document.activeElement === field,
          visible: field.checkVisibility() && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0
            && rect.right <= innerWidth && rect.bottom <= innerHeight && !!hit && (hit === field || field.contains(hit)),
          disabled: field.disabled, value: field.value, focusWithin: field.closest('label')?.matches(':focus-within') === true };
      };
      const before = inspect();
      if (!before.sameNode || !before.focused || !before.visible || before.disabled || before.value !== '0') throw Error('Actual pointer focus on the visible invalid radius required');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const enter = async value => {
        const current = inspect();
        if (!current.sameNode || !current.focused || !current.visible || current.disabled) throw Error('The radius input lost identity, focus or visibility before the next value');
        setter.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return inspect();
      };
      const first = await enter('2');
      if (!first.sameNode || !first.focused || !first.visible || first.disabled || first.value !== '2' || !first.focusWithin) throw Error('The first valid digit must retain the exact focused visible radius input');
      const completed = await enter('2.5');
      if (!completed.sameNode || !completed.focused || !completed.visible || completed.disabled || completed.value !== '2.5' || !completed.focusWithin) throw Error('Completing the decimal must retain the exact focused visible radius input');
      return { before, first, completed };
    }, R);
    check(correction.first.sameNode && correction.first.focused && correction.first.visible && correction.first.value === '2'
      && correction.completed.sameNode && correction.completed.focused && correction.completed.visible && correction.completed.value === '2.5',
    'The inactive radius retains the same visible focused DOM input through the first valid digit and the complete decimal');
    inputs.push({ selector: R, values: ['2', '2.5'], input: 'actual pointer focus, then native field setter and bubbling input events; no physical keyboard claim' });
    evidence.partAutoCorners.focusCorrection = correction;
    await built(serial, row => sameWall(row, one(true, 2.5, false)), row => owners(row, { ...left, volume: 660 }), 'inactive-radius-focus-correction');
    await press(T);
    check(await page((radius, thickness) => { const field = document.querySelector(radius); return !!field && !field.checkVisibility()
      && !field.getClientRects().length && document.activeElement === document.querySelector(thickness); }, R, T), 'Real pointer blur hides the retained valid inactive radius');
    serial = (await observe()).serial; await press(AUTO);
    await built(serial, row => sameWall(row, one(true, 2.5)), row => owners(row, { ...left, volume: 520 + 35 * Math.PI }), 'corrected-radius-reactivated');
    check(await page(selector => document.querySelector(selector)?.value === '2.5', R), 'Reactivating rounding restores the complete corrected decimal');
    serial = (await observe()).serial; await change(R, 3);
    await built(serial, row => sameWall(row, one(true)), row => owners(row, left), 'restore-radius-before-original-cancel');
    check(await recovery() === initialRecovery, 'Focus correction and its previews preserve committed recovery before the original Cancel');
    await change(R, 0);
    check(await page((radius, apply) => document.querySelector(radius)?.value === '0' && document.querySelector(apply)?.disabled === true,
      R, APPLY), 'Restore the original invalid-radius condition before Cancel');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'new-radius-cancel'); await idle();
    check(await recovery() === initialRecovery, 'Cancel restores the exact original declarations and recovery');
    await begin(); serial = (await observe()).serial; await configure(); await press(REVERSE);
    preview = await built(serial, row => sameWall(row, one(true)) && last(row).depth === 10 && last(row).bodyOperation?.mode === 'new', row => owners(row, left), 'new-radius-retry');
    const operation = last(preview), accepted = await apply(preview, row => owners(row, left), 'new-radius-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'undo-new-radius'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    const redone = await built(serial, row => canonical(row.features) === canonical(accepted.features), row => owners(row, left), 'redo-new-radius'); await idle();
    await fileCommand('Guardar como…');
    await waitFor('initial corner save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8'));
    check(canonical(saved.features) === canonical(redone.features), 'Saved corner declarations equal the accepted worker sequence');
    const savedRecovery = await recovery();
    await edit(operation.id); serial = (await observe()).serial; await change(R, .001);
    await built(serial, row => sameWall(row, one(true, .001)), row => owners(row, small), 'saved-small-radius-preview');
    check(await recovery() === savedRecovery, 'Small-radius preview leaves committed recovery unchanged');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(saved.features), row => owners(row, left), 'saved-radius-cancel'); await idle();
    check(await recovery() === savedRecovery, 'Saved-radius Cancel restores exact declarations and recovery');
    await edit(operation.id); serial = (await observe()).serial; await change(R, .001);
    preview = await built(serial, row => sameWall(row, one(true, .001)), row => owners(row, small), 'saved-small-radius-retry');
    const edited = await apply(preview, row => owners(row, small), 'saved-small-radius-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(saved.features), row => owners(row, left), 'undo-saved-radius'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), row => owners(row, small), 'redo-saved-radius'); await idle();
    await fileCommand('Guardar');
    await waitFor('edited corner save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const finalBytes = await fsp.readFile(output), finalSaved = JSON.parse(finalBytes.toString('utf8'));
    check(canonical(finalSaved.features) === canonical(edited.features), 'Saved small radius retains the exact source, wall and body declarations');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await built(serial, row => canonical(row.features) === canonical(finalSaved.features), row => owners(row, small), 'saved-radius-fresh-native-reopen'); await idle();
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Two bounded Open dialogs and one Save As dialog only');
    const observation = await observe();
    check(!observation.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No corner worker, renderer, resource or unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production corner worker and WASM actually loaded');
    evidence.partAutoCorners.persistence = { inputSha256: digest(await fsp.readFile(input)), initialSha256: digest(savedBytes), finalSha256: digest(finalBytes), dialogs: dialogCounts(),
      geometricLimits: 'Renderer volume tolerance1e-5mm³ and bounds1e-6mm on one original L. Independent formulas: right580+40pi, left500+40pi, mid540+40pi, two810+67.5pi, leftsmall619.96+10.01pi. No BRep, area, STEP or broad platform claim.' };
    evidence.savedSha256 = digest(finalBytes); await capture(finalSaved);
  };
};
