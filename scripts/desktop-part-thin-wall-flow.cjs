'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function thinWallWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, capture, check, canonical, digest,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, dialogCounts, initialReadyMs } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const THIN = 'input[aria-label="Operación lámina"]', MODE = 'select[aria-label="Tipo de pared"]';
  const T = 'input[aria-label="Espesor de pared"]', T1 = 'input[aria-label="Espesor 1"]', T2 = 'input[aria-label="Espesor 2"]';
  const REVERSE = 'button[aria-label="Invertir lado de pared"]';
  const one = (thickness, reversed = false) => ({ kind: 'one-side', thickness, reversed });
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const records = [], inputs = [], evidence = { partThinWall: { records, inputs,
    provenance: 'Original analytical synthetic mm declarations; visible controls and real worker responses only.',
    scope: 'Four successive thin material/cut operations, three wall modes, explicit owner selection, invalid drafts, Cancel/retry, history, saved editing and a fresh native rebuild.',
    inputLimits: 'Actual CDP left press/release on visible stationary hit-tested controls. Parameter fields use their native value setters and bubbling input/change events. DOM scrolling only reveals controls; no worker result, handler, reference or application state is injected.',
    limits: 'One original XY fixture. Renderer volume/bounds observations do not independently attest BRep validity, surface area, STEP round trips, external-application parity, general assembly behavior or installed-platform acceptance. Axial caps, automatic corner fillets and offset repair remain outside this route.' } };
  checks.push(evidence);
  const originalCount = expected.features.length;
  const base = { bodyId: 'base-body', createdBy: 'base-cylinder', featureId: 'base-cylinder', volume: 2880 * Math.PI,
    min: [-12, -12, 0], max: [12, 12, 20] };
  const originalBase = { ...base };
  const rectangleBounds = { min: [25, -4, 0], max: [35, 4, 6] };
  const revolutionBounds = { min: [19, -3, 24], max: [31, 3, 36] };
  let rectangle = null, revolution = null;
  const owners = (...others) => [base, ...others.filter(Boolean)];
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
    const state = await waitFor('stationary thin-wall control ' + (label ?? selector), async () => {
      const current = await visible(selector, label), signature = canonical(current);
      if (signature !== previous) { previous = signature; stationary = Date.now(); }
      return current.available && Date.now() - stationary >= 100 ? current : false;
    });
    await pointer('mouseMoved', state.point);
    check(canonical(await visible(selector, label)) === canonical(state), 'Thin-wall control remains enabled, hit-tested and stationary');
    await pointer('mousePressed', state.point, 1); await pointer('mouseReleased', state.point, 0);
    inputs.push({ selector, ...(label ? { label } : {}), point: state.point, input: 'actual left press/release' });
  }
  async function change(selector, value) {
    await waitFor('visible thin-wall parameter ' + selector, async () => (await visible(selector)).available);
    await page((selector, value) => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (fields.length !== 1 || !field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight || !hit || !(field === hit || field.contains(hit))) throw Error('One visible enabled hit-tested thin-wall parameter required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('One current enabled thin-wall option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    inputs.push({ selector, value: String(value), input: 'visible native field setter and bubbling event' });
    await waitFor('retained thin-wall parameter ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)));
    await frames();
  }
  const idle = () => waitFor('closed idle thin-wall editor', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  const ready = () => waitFor('native acceptable thin-wall preview', () => page(selector => { const button = document.querySelector(selector); return !!button && !button.disabled; }, APPLY));
  const last = row => row.features.at(-1);
  const sameWall = (feature, wall) => canonical(feature.thinWall) === canonical(wall);
  async function built(after, predicate, expectedOwners, phase) {
    const row = await waitFor('native thin-wall build ' + phase, async () => {
      const observation = await observe(); check(!observation.workerErrors.length, 'No thin-wall worker transport failure');
      return observation.builds.filter(row => row.serial > after && row.features[0]?.id === 'base-profile' && predicate(row) && row.response).at(-1);
    });
    check(row.response.ok, row.response.error || 'Native thin-wall build succeeds');
    const result = row.response.value;
    const actualOwners = typeof expectedOwners === 'function' ? expectedOwners(row) : expectedOwners;
    const warnings = actualOwners.length > 1 ? [`La pieza contiene ${actualOwners.length} sólidos separados.`] : [];
    check(!result.featureErrors.length && canonical(result.warnings) === canonical(warnings) && result.bodyCatalogActive,
      'Thin-wall build has exact owned-body inventory and independent-solid warnings: ' + JSON.stringify({ phase, featureErrors: result.featureErrors, warnings: result.warnings }));
    check(result.bodies?.length === actualOwners.length, 'No implicit body, target or dropped owner');
    for (const owner of actualOwners) {
      const body = result.bodies.find(body => body.ref.bodyId === owner.bodyId);
      check(body?.ref.sourceFeatureId === owner.featureId && body.createdByFeatureId === owner.createdBy, 'Exact current and creation identities for ' + owner.bodyId);
      near(body.volume, owner.volume, 1e-5, 'Independent thin-wall body volume');
      for (let axis = 0; axis < 3; axis++) {
        near(body.bounds.min[axis], owner.min[axis], 1e-6, 'Independent thin-wall minimum');
        near(body.bounds.max[axis], owner.max[axis], 1e-6, 'Independent thin-wall maximum');
      }
    }
    records.push({ phase, serial: row.serial, features: row.features,
      bodies: result.bodies.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, bounds: body.bounds })), warnings: result.warnings });
    return row;
  }
  async function begin(sketchId, command, open) {
    await idle(); await press('.tree-row[data-feature-id="' + sketchId + '"]'); await press('.ribbon-tabs button', 'Operaciones');
    const serial = (await observe()).serial; await press('button.command[title="' + command + '"]');
    await waitFor('thin-wall panel metadata ready', () => page((selector, open) => {
      const field = document.querySelector(selector), thickness = document.querySelector('input[aria-label="Espesor de pared"]');
      return !!field && (open ? field.checked && field.disabled && !!thickness && !thickness.disabled : !field.checked && !field.disabled);
    }, THIN, open));
    return serial;
  }
  async function selectOnlyBody(name) {
    await waitFor('current thin-wall body selector', () => page(() => document.querySelectorAll('.body-operation-panel .body-list label.body-row').length > 0));
    const rows = await page(() => [...document.querySelectorAll('.body-operation-panel .body-list label.body-row')].map((row, index) => ({
      index, name: row.querySelector('span')?.firstChild?.textContent.trim(), checked: row.querySelector('input').checked })));
    check(rows.filter(row => row.name === name).length === 1, 'One exact named current body target is available');
    for (const row of rows) if (row.checked !== (row.name === name)) await press('.body-operation-panel .body-list label.body-row:nth-of-type(' + (row.index + 1) + ') input');
    check(await page(name => {
      const checked = [...document.querySelectorAll('.body-operation-panel .body-list label.body-row')].filter(row => row.querySelector('input').checked);
      return checked.length === 1 && checked[0].querySelector('span')?.firstChild?.textContent.trim() === name;
    }, name), 'Only the explicit intended material owner is selected');
    const pickerLabel = 'Seleccionar cuerpos en el visor';
    const picker = await page(label => {
      const buttons = [...document.querySelectorAll('.body-operation-panel button.outline-button')].filter(button => button.textContent.trim() === label);
      return { count: buttons.length, active: buttons.length === 1 && buttons[0].classList.contains('active') };
    }, pickerLabel);
    check(picker.count === 1, 'One actual body-picker control accompanies the exact target list');
    if (picker.active) await press('.body-operation-panel button.outline-button', pickerLabel);
    await waitFor('thin-wall body picker finished', () => page(label => {
      const buttons = [...document.querySelectorAll('.body-operation-panel button.outline-button')].filter(button => button.textContent.trim() === label);
      return buttons.length === 1 && !buttons[0].classList.contains('active');
    }, pickerLabel));
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
    await waitFor('saved thin-wall declaration editor', () => page(selector => { const field = document.querySelector(selector); return field?.checked && field.disabled; }, THIN));
  }
  const rectangleOwner = (feature, volume = 192, bounds = rectangleBounds) => ({ bodyId: feature.bodyOperation.bodyId,
    createdBy: feature.id, featureId: feature.id, volume, ...bounds });
  return async () => {
    await waitFor('initial thin-wall document commands', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, row => row.features.length === originalCount, owners(), 'original-cylinder-and-unused-profiles');
    check(canonical(original.features) === canonical(expected.features), 'Original independent thin-wall fixture retains every declared sketch');
    await idle(); const originalRecovery = await recovery();
    await begin('wall-rectangle', 'Saliente/Base extruido', false);
    serial = (await observe()).serial; await change('input[aria-label="Profundidad"]', 6);
    await change('select[aria-label="Resultado del saliente"]', 'new'); await change('input[aria-label="Nombre de operación"]', 'Pared rectangular');
    await press(THIN); await change(T, 1);
    let preview = await built(serial, row => last(row).type === 'extrude' && last(row).name === 'Pared rectangular' && last(row).sketchId === 'wall-rectangle' && last(row).depth === 6
      && last(row).bodyOperation?.mode === 'new' && sameWall(last(row), one(1)),
    row => owners(rectangleOwner(last(row))), 'rectangle-one-side');
    rectangle = rectangleOwner(last(preview));
    serial = (await observe()).serial; await press(THIN);
    const filled = await built(serial, row => last(row).id === rectangle.featureId && !Object.hasOwn(last(row), 'thinWall'),
      owners({ ...rectangle, volume: 288, min: [26, -3, 0], max: [34, 3, 6] }), 'rectangle-thin-disabled');
    check(!Object.hasOwn(last(filled), 'thinWall'), 'Disabling a new closed-profile wall removes its declaration rather than sending own undefined');
    serial = (await observe()).serial; await press(THIN); await change(T, 1);
    await built(serial, row => last(row).id === rectangle.featureId && sameWall(last(row), one(1)),
      owners(rectangle), 'rectangle-thin-reenabled');
    serial = (await observe()).serial; await press(REVERSE);
    await built(serial, row => sameWall(last(row), one(1, true)), owners({ ...rectangle, volume: 144, min: [26, -3, 0], max: [34, 3, 6] }), 'rectangle-reversed');
    serial = (await observe()).serial; await change(MODE, 'mid-plane'); await change(T, 2);
    await built(serial, row => sameWall(last(row), { kind: 'mid-plane', thickness: 2 }), owners({ ...rectangle, volume: 336 }), 'rectangle-mid-plane');
    check(await page(selector => document.querySelector(selector)?.disabled === true, REVERSE), 'Mid-plane wall ignores directional reversal');
    serial = (await observe()).serial; await change(MODE, 'two-sides'); await change(T1, 1); await change(T2, .5);
    await built(serial, row => sameWall(last(row), { kind: 'two-sides', firstThickness: 1, secondThickness: .5 }), owners({ ...rectangle, volume: 270 }), 'rectangle-two-sides');
    await change(T1, 0);
    check(await page(selector => document.querySelector(selector)?.disabled === true && !!document.querySelector('.thin-wall-error[role="alert"]'), APPLY), 'Zero thickness is visibly rejected and cannot Apply');
    check(await recovery() === originalRecovery, 'Invalid and unaccepted wall drafts preserve committed recovery');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => row.features.length === originalCount, owners(), 'cancel-new-wall'); await idle();
    check(await recovery() === originalRecovery, 'Cancel restores the exact original recovery');
    await begin('wall-rectangle', 'Saliente/Base extruido', false);
    serial = (await observe()).serial; await change('input[aria-label="Profundidad"]', 6); await change('select[aria-label="Resultado del saliente"]', 'new');
    await change('input[aria-label="Nombre de operación"]', 'Pared rectangular'); await press(THIN); await change(T, 1);
    const pendingRectangle = await waitFor('new rectangular wall request', async () => (await observe()).builds.filter(row => row.serial > serial && last(row)?.type === 'extrude'
      && last(row).name === 'Pared rectangular' && last(row).sketchId === 'wall-rectangle' && sameWall(last(row), one(1)) && last(row).depth === 6 && last(row).bodyOperation?.mode === 'new').at(-1));
    rectangle = rectangleOwner(last(pendingRectangle));
    preview = await built(serial, row => canonical(row.features) === canonical(pendingRectangle.features), owners(rectangle), 'rectangle-retry');
    await apply(preview, owners(rectangle), 'rectangle-applied');

    await begin('slot-line', 'Corte extruido', true);
    serial = (await observe()).serial; await change(T, 2); await change('input[aria-label="Profundidad"]', -1);
    await selectOnlyBody('Original base cylinder'); await change('select[aria-label="Condición final"]', 'throughAll');
    await change('input[aria-label="Nombre de operación"]', 'Ranura pasante');
    const slotRequest = await waitFor('exact open slot request', async () => (await observe()).builds.filter(row => row.serial > serial && last(row)?.type === 'cut'
      && last(row).name === 'Ranura pasante' && last(row).sketchId === 'slot-line' && sameWall(last(row), one(2)) && last(row).depth < 0 && last(row).endCondition?.kind === 'throughAll'
      && canonical(last(row).bodyScope) === canonical([{ bodyId: base.bodyId, sourceFeatureId: base.featureId }])).at(-1));
    const slot = last(slotRequest); base.featureId = slot.id; base.volume = 2880 * Math.PI - 400;
    preview = await built(serial, row => canonical(row.features) === canonical(slotRequest.features), owners(rectangle), 'open-line-through-all');
    await apply(preview, owners(rectangle), 'open-line-cut-applied');

    await begin('revolve-line', 'Revolución', true);
    serial = (await observe()).serial; await change(T, 1); await change('select[aria-label="Eje de revolución"]', JSON.stringify(['sketch-line', 'axis-line']));
    await change('select[aria-label="Resultado del saliente"]', 'new'); await change('input[aria-label="Nombre de operación"]', 'Pared revolucionada');
    const revolutionRequest = await waitFor('exact open revolution request', async () => (await observe()).builds.filter(row => row.serial > serial && last(row)?.type === 'revolve'
      && last(row).name === 'Pared revolucionada' && last(row).sketchId === 'revolve-line' && last(row).axis?.entityId === 'axis-line' && sameWall(last(row), one(1)) && last(row).bodyOperation?.mode === 'new').at(-1));
    const revolve = last(revolutionRequest);
    check(canonical(revolve.axis) === canonical({ kind: 'sketch-line', entityId: 'axis-line' }), 'Revolution reads the exact local construction LINE');
    revolution = { bodyId: revolve.bodyOperation.bodyId, createdBy: revolve.id, featureId: revolve.id, volume: 66 * Math.PI, ...revolutionBounds };
    preview = await built(serial, row => canonical(row.features) === canonical(revolutionRequest.features), owners(rectangle, revolution), 'open-line-revolution');
    serial = (await observe()).serial; await press(REVERSE);
    await built(serial, row => last(row).id === revolve.id && sameWall(last(row), one(1, true)), owners(rectangle,
      { ...revolution, volume: 54 * Math.PI, min: [20, -3, 25], max: [30, 3, 35] }), 'revolution-reversed-wall');
    serial = (await observe()).serial; await press(REVERSE);
    preview = await built(serial, row => last(row).id === revolve.id && sameWall(last(row), one(1)), owners(rectangle, revolution), 'revolution-restored-wall');
    await apply(preview, owners(rectangle, revolution), 'revolution-applied');

    await begin('groove-line', 'Corte por revolución', true);
    serial = (await observe()).serial; await change(T, 1); await change('select[aria-label="Eje de revolución"]', JSON.stringify(['sketch-line', 'axis-line']));
    await selectOnlyBody('Pared revolucionada'); await change('input[aria-label="Nombre de operación"]', 'Ranura revolucionada');
    const grooveRequest = await waitFor('exact open revolved groove request', async () => (await observe()).builds.filter(row => row.serial > serial && last(row)?.type === 'revolvedCut'
      && last(row).name === 'Ranura revolucionada' && last(row).sketchId === 'groove-line' && last(row).axis?.entityId === 'axis-line' && sameWall(last(row), one(1))
      && canonical(last(row).bodyScope) === canonical([{ bodyId: revolution.bodyId, sourceFeatureId: revolution.featureId }])).at(-1));
    const groove = last(grooveRequest); revolution.featureId = groove.id; revolution.volume = 43 * Math.PI;
    check(canonical(groove.axis) === canonical({ kind: 'sketch-line', entityId: 'axis-line' }), 'Revolved cut reads its exact local construction LINE');
    preview = await built(serial, row => canonical(row.features) === canonical(grooveRequest.features), owners(rectangle, revolution), 'revolved-wall-groove');
    const accepted = await apply(preview, owners(rectangle, revolution), 'revolved-cut-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => row.features.length === originalCount + 3, owners(rectangle, { ...revolution, featureId: revolve.id, volume: 66 * Math.PI }), 'undo-revolved-cut');
    await idle(); serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    const redone = await built(serial, row => canonical(row.features) === canonical(accepted.features), owners(rectangle, revolution), 'redo-revolved-cut'); await idle();
    await fileCommand('Guardar como…');
    await waitFor('first thin-wall save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const initialBytes = await fsp.readFile(output), saved = JSON.parse(initialBytes.toString('utf8'));
    check(canonical(saved.features) === canonical(redone.features), 'Saved four-operation sequence equals the accepted worker declarations');
    const savedRecovery = await recovery();
    await edit(rectangle.featureId); serial = (await observe()).serial; await change(T, 1.5);
    const enlarged = { ...rectangle, volume: 306, min: [24.5, -4.5, 0], max: [35.5, 4.5, 6] };
    await built(serial, row => row.features.find(feature => feature.id === rectangle.featureId)?.thinWall?.thickness === 1.5,
      [originalBase, enlarged], 'saved-thickness-preview');
    check(await recovery() === savedRecovery, 'Saved wall preview leaves committed recovery unchanged');
    serial = (await observe()).serial; await press(CANCEL);
    await built(serial, row => canonical(row.features) === canonical(saved.features), owners(rectangle, revolution), 'saved-thickness-cancel'); await idle();
    check(await recovery() === savedRecovery, 'Saved-wall Cancel restores exact parameters and owner states');
    await edit(rectangle.featureId); serial = (await observe()).serial; await change(T, 1.5);
    preview = await built(serial, row => row.features.find(feature => feature.id === rectangle.featureId)?.thinWall?.thickness === 1.5,
      [originalBase, enlarged], 'saved-thickness-retry');
    check(preview.features.length === originalCount + 1, 'Saved operation preview rolls back the later three operations until acceptance');
    const expectedEditedFeatures = saved.features.map(feature => feature.id === rectangle.featureId ? { ...feature, thinWall: one(1.5) } : feature);
    const edited = await apply(preview, owners(enlarged, revolution), 'saved-thickness-applied', expectedEditedFeatures);
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(saved.features), owners(rectangle, revolution), 'undo-saved-thickness'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), owners(enlarged, revolution), 'redo-saved-thickness'); await idle();
    await fileCommand('Guardar');
    await waitFor('edited thin-wall save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const finalBytes = await fsp.readFile(output), finalSaved = JSON.parse(finalBytes.toString('utf8'));
    check(canonical(finalSaved.features) === canonical(edited.features), 'Saved edited wall preserves all four operations and exact references');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const fresh = await built(serial, row => canonical(row.features) === canonical(finalSaved.features), owners(enlarged, revolution), 'saved-fresh-native-reopen'); await idle();
    check(fresh.features.slice(0, originalCount).every((feature, index) => canonical(feature) === canonical(expected.features[index])), 'Unused/source sketches remain byte-equivalent to their original declarations');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Two bounded Open dialogs and one Save As dialog only');
    const observation = await observe();
    check(!observation.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No worker, renderer, resource or unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production worker and WASM actually loaded');
    evidence.partThinWall.persistence = { inputSha256: digest(await fsp.readFile(input)), initialSha256: digest(initialBytes), finalSha256: digest(finalBytes), dialogs: dialogCounts(),
      geometricLimits: 'Renderer native volume1e-5mm³/bounds1e-6mm: cylinder2880pi then-400, rectangularwall192 then306, revolution66pi then43pi. Mode previews144/336/270 and reversedrevolution54pi. No BRep validity, area, STEP or platform-equivalence claim from renderer.' };
    evidence.savedSha256 = digest(finalBytes); await capture(finalSaved);
  };
};
