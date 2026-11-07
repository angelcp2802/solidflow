'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function endCapsWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, capture, check, canonical, digest,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, dialogCounts, initialReadyMs } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const THIN = 'input[aria-label="Operación lámina"]', T = 'input[aria-label="Espesor de pared"]';
  const CAPS = 'input[aria-label="Tapas de extremos"]', C = 'input[aria-label="Espesor de tapas"]';
  const END = 'select[aria-label="Condición final"]';
  const wall = (thickness = 1, enabled = true) => ({ kind: 'one-side', thickness: 2, reversed: false,
    endCaps: { enabled, thickness } });
  const plainWall = { kind: 'one-side', thickness: 2, reversed: false };
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const records = [], inputs = [], evidence = { partEndCaps: { records, inputs,
    provenance: 'Original analytical millimetre declarations: one unused closed rectangle and one separate read-only cylinder; no imported geometry.',
    scope: 'Interior axial caps, explicit unsupported-extent recovery, native zero-core rejection, retained inactive thickness focus, Cancel/retry, new/saved Apply, history and fresh reopening.',
    inputLimits: 'Actual CDP left press/release on visible stationary hit-tested controls. Parameter changes use native value setters and bubbling input/change events; no physical keyboard claim. DOM scrolling only reveals controls. No handlers, worker results or application state are injected.',
    limits: 'One original rectangular XY profile, outside wall2 and positive blind depth20. Renderer volume/bounds do not independently attest BRep validity, area, STEP, other profiles or termination families, complete interaction parity or installed-platform support.' } };
  checks.push(evidence);
  const originalCount = expected.features.length;
  const base = { bodyId: 'caps-base-body', featureId: 'caps-base', createdBy: 'caps-base', volume: 12 * Math.PI,
    min: [38, -2, 0], max: [42, 2, 3] };
  const bounds = { min: [-2, -2, 0], max: [14, 10, 20] };
  const capped = { ...bounds, volume: 2112 }, uncapped = { ...bounds, volume: 1920 };
  const middleTube = { volume: 1920, min: [-2, -2, -10], max: [14, 10, 10] };
  const corrected = { ...bounds, volume: 2208 }, editedCaps = { ...bounds, volume: 2304 };
  const last = row => row.features.at(-1);
  const sameWall = (row, definition) => last(row)?.type === 'extrude' && canonical(last(row).thinWall) === canonical(definition);
  const owner = (feature, dimensions) => ({ bodyId: feature.bodyOperation.bodyId, featureId: feature.id, createdBy: feature.id, ...dimensions });
  const owners = (row, dimensions) => [base, owner(last(row), dimensions)];
  const near = (actual, value, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - value) <= tolerance,
    `${label}: ${actual}, expected ${value}`);

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
    const state = await waitFor('stationary end-cap control ' + (label ?? selector), async () => {
      const current = await visible(selector, label), signature = canonical(current);
      if (signature !== previous) { previous = signature; stationary = Date.now(); }
      return current.available && Date.now() - stationary >= 100 ? current : false;
    });
    await pointer('mouseMoved', state.point);
    check(canonical(await visible(selector, label)) === canonical(state), 'End-cap control remains enabled, hit-tested and stationary');
    await pointer('mousePressed', state.point, 1); await pointer('mouseReleased', state.point, 0);
    inputs.push({ selector, ...(label ? { label } : {}), point: state.point, input: 'actual left press/release' });
  }
  async function change(selector, value) {
    await waitFor('visible end-cap parameter ' + selector, async () => (await visible(selector)).available);
    await page((selector, value) => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (fields.length !== 1 || !field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight || !hit || !(field === hit || field.contains(hit))) throw Error('One visible enabled hit-tested end-cap parameter required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('One current enabled end-cap option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    inputs.push({ selector, value: String(value), input: 'visible native field setter and bubbling event' });
    await waitFor('retained end-cap parameter ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)));
    await frames();
  }
  const idle = () => waitFor('closed idle end-cap editor', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  const ready = () => waitFor('native acceptable capped preview', () => page(selector => { const button = document.querySelector(selector); return !!button && !button.disabled; }, APPLY));
  function material(row, expectedOwners, phase, failed = false) {
    check(row.response.ok, row.response.error || 'Native end-cap build response succeeds');
    const result = row.response.value, actualOwners = typeof expectedOwners === 'function' ? expectedOwners(row) : expectedOwners;
    if (failed) {
      check(result.featureErrors.length === 1 && result.featureErrors[0].id === last(row).id && typeof result.featureErrors[0].message === 'string'
        && result.featureErrors[0].message.length > 0, 'The native builder explicitly rejects the exact zero-core cap operation');
    } else check(!result.featureErrors.length, 'No end-cap native feature error');
    const warnings = actualOwners.length > 1 ? [`La pieza contiene ${actualOwners.length} sólidos separados.`] : [];
    if (failed) warnings.push('Reconstrucción detenida en «Caja con tapas». Se muestra el último sólido válido.');
    check(canonical(result.warnings) === canonical(warnings) && result.bodyCatalogActive && result.bodies?.length === actualOwners.length,
      'End-cap build retains exact body inventory and warnings: ' + JSON.stringify({ phase, featureErrors: result.featureErrors, warnings: result.warnings }));
    check(canonical(row.features.slice(0, originalCount)) === canonical(expected.features), 'Original closed sketch and read-only cylinder declarations remain unchanged');
    for (const expectedOwner of actualOwners) {
      const body = result.bodies.find(body => body.ref.bodyId === expectedOwner.bodyId);
      check(body?.ref.sourceFeatureId === expectedOwner.featureId && body.createdByFeatureId === expectedOwner.createdBy, 'Exact current and creation identities for ' + expectedOwner.bodyId);
      near(body.volume, expectedOwner.volume, 1e-5, 'Independent end-cap body volume');
      for (let axis = 0; axis < 3; axis++) {
        near(body.bounds.min[axis], expectedOwner.min[axis], 1e-6, 'Independent end-cap minimum');
        near(body.bounds.max[axis], expectedOwner.max[axis], 1e-6, 'Independent end-cap maximum');
      }
    }
    records.push({ phase, serial: row.serial, features: row.features, ...(failed ? { rejected: true } : {}), featureErrors: result.featureErrors,
      bodies: result.bodies.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, bounds: body.bounds })), warnings: result.warnings });
    return row;
  }
  async function response(after, predicate, phase) {
    return waitFor('native end-cap build ' + phase, async () => {
      const observation = await observe(); check(!observation.workerErrors.length, 'No end-cap worker transport failure');
      return observation.builds.filter(row => row.serial > after && row.features[0]?.id === 'caps-base-profile' && predicate(row) && row.response).at(-1);
    });
  }
  async function built(after, predicate, expectedOwners, phase) { return material(await response(after, predicate, phase), expectedOwners, phase); }
  async function rejected(after, phase) {
    const row = material(await response(after, row => sameWall(row, wall(10)) && last(row).depth === 20 && !last(row).symmetric && !last(row).endCondition, phase), [base], phase, true);
    await waitFor('zero-core cap Apply blocked', () => page(selector => document.querySelector(selector)?.disabled === true, APPLY));
    return row;
  }
  async function begin() {
    await idle(); await press('.tree-row[data-feature-id="caps-rectangle"]'); await press('.ribbon-tabs button', 'Operaciones');
    await press('button.command[title="Saliente/Base extruido"]');
    await waitFor('current optional closed-profile wall control', () => page(selector => { const field = document.querySelector(selector); return !!field && !field.checked && !field.disabled; }, THIN));
  }
  async function configure() {
    await change('input[aria-label="Profundidad"]', 20); await change('select[aria-label="Resultado del saliente"]', 'new');
    await change('input[aria-label="Nombre de operación"]', 'Caja con tapas'); await press(THIN); await change(T, 2);
    await waitFor('eligible closed-profile end-cap checkbox', () => page(selector => { const field = document.querySelector(selector); return !!field && !field.disabled && !field.checked; }, CAPS));
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
    await waitFor('saved end-cap declaration editor', () => page((thin, caps, thickness) => {
      const field = document.querySelector(thin), closed = document.querySelector(caps), parameter = document.querySelector(thickness);
      return field?.checked && field.disabled && closed?.checked && !closed.disabled && !!parameter && !parameter.disabled;
    }, THIN, CAPS, C));
  }
  return async () => {
    await waitFor('initial end-cap document commands', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'original-unused-closed-profile'); await idle();
    const initialRecovery = await recovery();
    await begin(); serial = (await observe()).serial; await configure();
    await built(serial, row => sameWall(row, plainWall) && last(row).depth === 20 && last(row).bodyOperation?.mode === 'new', row => owners(row, uncapped), 'uncapped-wall-before-first-activation');
    serial = (await observe()).serial; await press(CAPS); await change(C, 1);
    let preview = await built(serial, row => sameWall(row, wall()) && last(row).depth === 20 && last(row).bodyOperation?.mode === 'new', row => owners(row, capped), 'interior-end-caps');
    serial = (await observe()).serial; await press(CAPS);
    await built(serial, row => sameWall(row, wall(1, false)), row => owners(row, uncapped), 'caps-disabled-retain-thickness');
    check(await page(selector => { const field = document.querySelector(selector); return !!field && !field.checkVisibility() && !field.getClientRects().length; }, C), 'Disabled valid caps retain their hidden thickness input');
    serial = (await observe()).serial; await press(CAPS);
    await built(serial, row => sameWall(row, wall()), row => owners(row, capped), 'caps-reactivated-retain-thickness');
    check(await page(selector => document.querySelector(selector)?.value === '1', C), 'Reactivating caps restores the retained thickness');

    await change(END, 'mid');
    await waitFor('explicit recovery after unsupported axial midpoint', () => page((end, caps, thickness, apply) => {
      const field = document.querySelector(caps), parameter = document.querySelector(thickness);
      return document.querySelector(end)?.value === 'mid' && field?.checked && !field.disabled && parameter?.value === '1'
        && parameter.disabled && document.querySelector(apply)?.disabled === true;
    }, END, CAPS, C, APPLY));
    check(await recovery() === initialRecovery, 'Unsupported extent retains the active cap request and committed recovery until explicit deactivation');
    serial = (await observe()).serial; await press(CAPS);
    await built(serial, row => sameWall(row, wall(1, false)) && last(row).symmetric === true && !last(row).endCondition, row => owners(row, middleTube), 'explicit-cap-deactivation-for-midpoint');
    check(await page(selector => { const field = document.querySelector(selector); return !!field && !field.checked && field.disabled; }, CAPS), 'Axial midpoint prevents new cap activation after explicit recovery');
    serial = (await observe()).serial; await change(END, 'blind');
    await built(serial, row => sameWall(row, wall(1, false)) && !last(row).symmetric && !last(row).endCondition, row => owners(row, uncapped), 'return-blind-keeps-caps-off');
    serial = (await observe()).serial; await press(CAPS);
    await built(serial, row => sameWall(row, wall()), row => owners(row, capped), 'explicit-cap-reactivation-after-blind');

    serial = (await observe()).serial; await change(C, 10); await rejected(serial, 'native-zero-core-cap-rejection');
    check(await recovery() === initialRecovery, 'A native zero-core rejection does not alter the committed document');
    await change(C, 0);
    check(await page((thickness, apply) => document.querySelector(thickness)?.value === '0' && document.querySelector(apply)?.disabled === true
      && !!document.querySelector('.thin-wall-error[role="alert"]'), C, APPLY), 'Zero cap thickness remains editable, visibly invalid and cannot Apply');
    await press(CAPS);
    check(await page((thickness, caps, apply) => { const field = document.querySelector(thickness); return !!field && field.value === '0'
      && field.checkVisibility() && !field.disabled && document.querySelector(caps)?.checked === false && document.querySelector(apply)?.disabled === true;
    }, C, CAPS, APPLY), 'Invalid inactive cap thickness remains visible and editable');
    serial = (await observe()).serial; await press(C);
    const correction = await page(async selector => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0];
      if (fields.length !== 1 || !(field instanceof HTMLInputElement)) throw Error('One retained cap-thickness input required');
      const inspect = () => {
        const rect = field.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { sameNode: document.querySelector(selector) === field, focused: document.activeElement === field,
          visible: field.checkVisibility() && rect.width > 0 && rect.height > 0 && rect.x >= 0 && rect.y >= 0
            && rect.right <= innerWidth && rect.bottom <= innerHeight && !!hit && (hit === field || field.contains(hit)),
          disabled: field.disabled, value: field.value, focusWithin: field.closest('label')?.matches(':focus-within') === true };
      };
      const before = inspect();
      if (!before.sameNode || !before.focused || !before.visible || before.disabled || before.value !== '0') throw Error('Actual pointer focus on the invalid cap thickness required');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      const enter = async value => {
        const current = inspect();
        if (!current.sameNode || !current.focused || !current.visible || current.disabled) throw Error('Cap thickness lost identity, focus or visibility before the next value');
        setter.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return inspect();
      };
      const first = await enter('1');
      if (!first.sameNode || !first.focused || !first.visible || first.disabled || first.value !== '1' || !first.focusWithin) throw Error('The first valid thickness digit must retain the exact focused visible input');
      const completed = await enter('1.5');
      if (!completed.sameNode || !completed.focused || !completed.visible || completed.disabled || completed.value !== '1.5' || !completed.focusWithin) throw Error('The complete thickness decimal must retain the exact focused visible input');
      return { before, first, completed };
    }, C);
    check(correction.first.sameNode && correction.first.focused && correction.first.visible && correction.first.value === '1'
      && correction.completed.sameNode && correction.completed.focused && correction.completed.visible && correction.completed.value === '1.5',
    'Inactive cap thickness retains the same visible focused DOM input through the first valid digit and decimal');
    inputs.push({ selector: C, values: ['1', '1.5'], input: 'actual pointer focus, then native setter and bubbling input events; no physical keyboard claim' });
    evidence.partEndCaps.focusCorrection = correction;
    await built(serial, row => sameWall(row, wall(1.5, false)), row => owners(row, uncapped), 'inactive-cap-thickness-focus-correction');
    await press(T);
    check(await page((thickness, wallThickness) => { const field = document.querySelector(thickness); return !!field && !field.checkVisibility()
      && !field.getClientRects().length && document.activeElement === document.querySelector(wallThickness); }, C, T), 'Real pointer blur hides the retained valid inactive cap thickness');
    serial = (await observe()).serial; await press(CAPS);
    await built(serial, row => sameWall(row, wall(1.5)), row => owners(row, corrected), 'corrected-cap-thickness-reactivated');
    check(await page(selector => document.querySelector(selector)?.value === '1.5', C), 'Reactivated caps restore the complete corrected decimal');
    serial = (await observe()).serial; await change(C, 1);
    await built(serial, row => sameWall(row, wall()), row => owners(row, capped), 'restore-cap-thickness-before-invalid-cancel');
    serial = (await observe()).serial; await change(C, 10); await rejected(serial, 'restore-native-invalid-caps-before-cancel');
    check(await recovery() === initialRecovery, 'Recovery and restored invalid cap previews preserve committed recovery before Cancel');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'cancel-new-invalid-caps'); await idle();
    check(await recovery() === initialRecovery, 'Cancel from the native-invalid cap draft restores the exact original recovery');

    await begin(); await configure(); serial = (await observe()).serial; await press(CAPS); await change(C, 1);
    preview = await built(serial, row => sameWall(row, wall()) && last(row).depth === 20 && last(row).bodyOperation?.mode === 'new', row => owners(row, capped), 'new-cap-retry');
    const operation = last(preview), accepted = await apply(preview, row => owners(row, capped), 'new-cap-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(expected.features), [base], 'undo-new-caps'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    const redone = await built(serial, row => canonical(row.features) === canonical(accepted.features), row => owners(row, capped), 'redo-new-caps'); await idle();
    await fileCommand('Guardar como…');
    await waitFor('initial cap save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8'));
    check(canonical(saved.features) === canonical(redone.features), 'Saved cap sequence equals the accepted worker declarations');
    const savedRecovery = await recovery();
    await edit(operation.id); serial = (await observe()).serial; await change(C, 2);
    await built(serial, row => sameWall(row, wall(2)), row => owners(row, editedCaps), 'saved-cap-thickness-preview');
    check(await recovery() === savedRecovery, 'Saved cap preview leaves committed recovery unchanged');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(saved.features), row => owners(row, capped), 'saved-cap-edit-cancel'); await idle();
    check(await recovery() === savedRecovery, 'Saved cap Cancel restores exact declarations and recovery');
    await edit(operation.id); serial = (await observe()).serial; await change(C, 2);
    preview = await built(serial, row => sameWall(row, wall(2)), row => owners(row, editedCaps), 'saved-cap-thickness-retry');
    const edited = await apply(preview, row => owners(row, editedCaps), 'saved-cap-thickness-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(saved.features), row => owners(row, capped), 'undo-saved-cap-thickness'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), row => owners(row, editedCaps), 'redo-saved-cap-thickness'); await idle();
    await fileCommand('Guardar');
    await waitFor('edited cap save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const finalBytes = await fsp.readFile(output), finalSaved = JSON.parse(finalBytes.toString('utf8'));
    check(canonical(finalSaved.features) === canonical(edited.features), 'Saved edited cap thickness preserves source and body identities');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await built(serial, row => canonical(row.features) === canonical(finalSaved.features), row => owners(row, editedCaps), 'saved-caps-fresh-native-reopen'); await idle();
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Two bounded Open dialogs and one Save As dialog only');
    const observation = await observe();
    check(!observation.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No end-cap worker, renderer, resource or unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production end-cap worker and WASM actually loaded');
    evidence.partEndCaps.persistence = { inputSha256: digest(await fsp.readFile(input)), initialSha256: digest(savedBytes), finalSha256: digest(finalBytes), dialogs: dialogCounts(),
      geometricLimits: 'Renderer native volume tolerance1e-5mm³ and bounds1e-6mm. Independent rectangle outsidewall2/depth20: uncapped1920, cap1=2112, cap1.5=2208, cap2=2304. No BRep, area, STEP or general platform claim.' };
    evidence.savedSha256 = digest(finalBytes); await capture(finalSaved);
  };
};
