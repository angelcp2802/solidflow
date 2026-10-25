'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Existing production commands, pointer activation and visible scripted fields.
// Original analytical profiles exercise actual axis/direction controls as well
// as the existing staged sketch, cut, history and file interchange workflow.
module.exports = function partRevolutionWorkflow(context) {
  const { expected, input, output, revolutionStepPath, evaluate, observe, waitFor, pointer, capture,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const records = [], interactions = [];
  const evidence = { partRevolution: { records, interactions,
    scope: 'Original X/Y/line axis previews and reversal -> Cancel -> saved unused sketch edit -> reversed local-Y revolution -> symmetric cylindrical bore cut -> history/save/reopen/STEP',
    inputLimits: 'Pointer activation of actual visible controls; fields use native input/select setters and bubbling input/change events, not keyboard typing. DOM scrollIntoView reveals controls without altering application state. No worker result or geometric reference is injected.',
    featureLimits: 'X/Y and same-sketch construction-line previews, reverse partial angle and explicit Y/reversed persistence. External axes, symmetric/two-direction and thin-wall revolution are not exercised or claimed.' } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance, label);
  async function reveal(selector, label) {
    await page((selector, label) => {
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null ||
        (element.matches('[data-assembly-command]') ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() === label);
      if (matches.length === 1 && !matches[0].closest('[hidden]')) matches[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label);
    const inspect = () => page((selector, label) => {
      const candidates = [...document.querySelectorAll(selector)];
      // The command label has its own span; its keyboard shortcut is separate
      // visible content and must not become part of the exact label match.
      const commandLabel = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent
        : element.textContent)?.trim() ?? '';
      const matches = candidates.filter(element => label === null || commandLabel(element) === label);
      if (matches.length !== 1) return { available: false, count: matches.length,
        candidateCount: candidates.length, candidates: candidates.slice(0, 10).map(element => {
          const r = element.getBoundingClientRect();
          return { label: commandLabel(element).slice(0, 100), disabled: !!element.disabled, hidden: !!element.closest('[hidden]'),
            rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
        }) };
      const target = matches[0], r = target.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      return { available: !target.disabled && !target.closest('[hidden]') && r.width > 0 && r.height > 0
        && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && (target === hit || target.contains(hit)),
      count: matches.length, disabled: !!target.disabled, hidden: !!target.closest('[hidden]'),
      hit: hit ? { tag: hit.tagName, owned: target === hit || target.contains(hit) } : null,
      point, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, text: commandLabel(target).slice(0, 100) };
    }, selector, label ?? null);
    let previous, lastInspection, stableSince = 0;
    try {
      const target = await waitFor('visible stationary revolution control ' + (label ?? selector), async () => {
        const state = lastInspection = await inspect(), key = canonical(state);
        if (key !== previous) { previous = key; stableSince = Date.now(); }
        return state.available && Date.now() - stableSince >= 120 ? state : false;
      });
      await pointer('mouseMoved', target.point);
      lastInspection = await inspect();
      check(canonical(lastInspection) === canonical(target), 'Pointer target remains visible and stationary before activation');
      await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
      interactions.push({ selector, ...(label ? { label } : {}), point: target.point, rect: target.rect, input: 'CDP left press/release' });
    } catch (error) {
      interactions.push({ selector, ...(label ? { label } : {}), status: 'failed', lastInspection,
        error: { name: error.name, message: error.message } });
      throw error;
    }
  }
  async function change(selector, value) {
    await reveal(selector);
    await waitFor('one visible hit-tested revolution field ' + selector, () => page(selector => {
      const fields = [...document.querySelectorAll(selector)];
      if (fields.length !== 1) return false;
      const field = fields[0], r = field.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !field.disabled && !field.closest('[hidden]') && r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0
        && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && (field === hit || field.contains(hit));
    }, selector));
    await page((selector, value) => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (fields.length !== 1 || !field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight || !hit || !(field === hit || field.contains(hit))) throw Error('One visible enabled hit-tested revolution field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Enabled current option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    interactions.push({ selector, value: String(value), input: 'visible field setter/input or change event after DOM reveal and hit test' });
    await waitFor('visible field retains authored value ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)));
  }
  const tab = label => press('.ribbon-tabs button', label);
  async function fileCommand(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function ready() {
    await waitFor('current revolution workflow preview is acceptable', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled;
    }, APPLY));
  }
  const profileHeight = record => record.features.find(feature => feature.id === 'sleeve-profile')?.profile?.height;
  async function built(afterSerial, predicate, volume, bounds, phase, bodyId) {
    const record = await waitFor('native revolution sequence ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No native worker transport errors');
      return state.builds.filter(value => value.serial > afterSerial && value.features[0]?.id === 'sleeve-profile'
        && predicate(value) && value.response).at(-1);
    });
    check(record.response.ok, record.response.error || 'Actual native build rejected');
    const result = record.response.value;
    check(!result.featureErrors.length && !result.warnings.length, 'Current authored features rebuild without errors or warnings');
    if (volume === 0) check(!result.bodies?.length, 'Profile-only states contain no manufactured solid');
    else {
      check(result.bodyCatalogActive && result.bodies?.length === 1, 'One current explicit native body');
      const body = result.bodies[0];
      if (bodyId) check(body.ref.bodyId === bodyId, 'Downstream operations preserve the exact authored body identity');
      near(body.volume, volume, 1e-5, 'Independent analytical revolution sequence volume');
      for (let axis = 0; axis < 3; axis++) {
        near(body.bounds.min[axis], bounds.min[axis], 1e-6, 'Independent revolution minimum');
        near(body.bounds.max[axis], bounds.max[axis], 1e-6, 'Independent revolution maximum');
      }
    }
    records.push({ phase, serial: record.serial, featureCount: record.features.length,
      bodies: result.bodies, independentVolume: volume });
    return record;
  }
  const fullBounds = { min: [-4, -5, -4], max: [4, 5, 4] };
  const halfBounds = { min: [-4, -5, -4], max: [4, 5, 0] };
  const originalCount = expected.features.length;
  const axisSelector = 'select[aria-label="Eje de revolución"]';
  const reverseSelector = 'input[aria-label="Invertir dirección"]';
  return async () => {
    await waitFor('part file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function' && !!document.querySelector('button[aria-label="Abrir (Ctrl+O)"]')), initialReadyMs);
    let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, row => row.features.length === originalCount && profileHeight(row) === 8, 0, null, 'original-profiles');
    check(canonical(original.features) === canonical(expected.features), 'Actual opened profiles equal the original recipe');
    await waitFor('opened profiles are idle', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')));
    const originalRecovery = await recovery();
    await press('.tree-row[data-feature-id="axis-profile"]'); await tab('Operaciones');
    serial = (await observe()).serial; await press('button.command[title="Revolución"]');
    await built(serial, row => row.features.at(-1).type === 'revolve' && row.features.at(-1).sketchId === 'axis-profile'
      && row.features.at(-1).angle === 360, 400 * Math.PI, { min: [-7, 0, -7], max: [7, 10, 7] }, 'entity-default-y');
    await ready();
    serial = (await observe()).serial; await change('input[aria-label="Ángulo"]', 90);
    await built(serial, row => row.features.at(-1).angle === 90, 100 * Math.PI,
      { min: [0, 0, -7], max: [7, 10, 0] }, 'entity-y-quarter');
    await ready();
    serial = (await observe()).serial; await change(axisSelector, 'sketch-x');
    await built(serial, row => row.features.at(-1).axis?.kind === 'sketch-axis' && row.features.at(-1).axis.axis === 'x',
      100 * Math.PI, { min: [3, 0, 0], max: [7, 10, 10] }, 'entity-x-quarter');
    await ready();
    serial = (await observe()).serial; await press(reverseSelector);
    await built(serial, row => row.features.at(-1).axis?.axis === 'x' && row.features.at(-1).reversed === true,
      100 * Math.PI, { min: [3, 0, -10], max: [7, 10, 0] }, 'entity-x-quarter-reversed');
    await ready();
    serial = (await observe()).serial; await change(axisSelector, JSON.stringify(['sketch-line', 'axis-line']));
    await built(serial, row => row.features.at(-1).axis?.kind === 'sketch-line' && row.features.at(-1).axis.entityId === 'axis-line'
      && row.features.at(-1).reversed === true, 40 * Math.PI,
      { min: [3, 0, 0], max: [7, 10, 4] }, 'entity-construction-line-quarter-reversed');
    await ready();
    serial = (await observe()).serial; await change(axisSelector, 'sketch-y');
    await built(serial, row => row.features.at(-1).axis?.kind === 'sketch-axis' && row.features.at(-1).axis.axis === 'y'
      && row.features.at(-1).reversed === true, 100 * Math.PI,
      { min: [0, 0, 0], max: [7, 10, 7] }, 'entity-explicit-y-quarter-reversed');
    await ready(); check(await recovery() === originalRecovery, 'Every axis and reversal preview preserves exact committed recovery');
    serial = (await observe()).serial; await press(CANCEL);
    const axesCancelled = await built(serial, row => row.features.length === originalCount, 0, null, 'axis-previews-cancelled');
    check(canonical(axesCancelled.features) === canonical(expected.features) && await recovery() === originalRecovery,
      'Cancel of changed axes/reversal restores exact original document');
    await waitFor('axis preview editor closed', () => page(() => !document.querySelector('.property-manager')
      && document.querySelector('.statusbar')?.textContent.includes('Listo')));
    await press('.tree-row[data-feature-id="sleeve-profile"]');
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('existing unused rectangle editor', () => page(() => document.querySelector('input[aria-label="Altura"]')?.value === '8'));
    serial = (await observe()).serial; await change('input[aria-label="Altura"]', 10);
    const edited = await built(serial, row => row.features.length === originalCount && profileHeight(row) === 10, 0, null, 'edited-profile');
    await ready();
    check(await recovery() === originalRecovery, 'Unaccepted profile edit preserves committed recovery');
    await tab('Operaciones');
    await press('button.command[title="Revolución"]');
    await waitFor('revolution owns the staged profile selector', () => page(() => {
      const field = document.querySelector('select[aria-label="Croquis de la operación"]');
      return field?.disabled && field.value === 'sleeve-profile' && !!document.querySelector('input[aria-label="Ángulo"]');
    }));
    serial = (await observe()).serial; await change('input[aria-label="Ángulo"]', 180);
    await built(serial, row => row.features.length === originalCount + 1 && row.features.at(-1).type === 'revolve' && row.features.at(-1).angle === 180,
      80 * Math.PI, halfBounds, 'half-turn-preview');
    await ready(); check(await recovery() === originalRecovery, 'Half-turn preview does not commit profile or solid');
    serial = (await observe()).serial; await press(reverseSelector);
    await built(serial, row => row.features.at(-1).angle === 180 && row.features.at(-1).reversed === true,
      80 * Math.PI, { min: [-4, -5, 0], max: [4, 5, 4] }, 'half-turn-reversed-preview');
    await ready(); check(await recovery() === originalRecovery, 'Reversed half-turn preserves staged sketch recovery');
    serial = (await observe()).serial; await press(CANCEL);
    await waitFor('revolution Cancel restores the live modified profile', () => page(() => document.querySelector('input[aria-label="Altura"]')?.value === '10'
      && document.querySelector('.ribbon-tabs .selected')?.textContent.trim() === 'Croquis'));
    const restored = await built(serial, row => row.features.length === originalCount && profileHeight(row) === 10, 0, null, 'cancel-restores-profile');
    check(canonical(restored.features) === canonical(edited.features) && await recovery() === originalRecovery,
      'Cancel restores exact profile IDs/order/draft without altering committed recovery');
    await ready(); await tab('Operaciones');
    serial = (await observe()).serial; await press('button.command[title="Revolución"]');
    await built(serial, row => row.features.length === originalCount + 1 && row.features.at(-1).type === 'revolve' && row.features.at(-1).angle === 360,
      160 * Math.PI, fullBounds, 'full-turn-preview');
    await ready(); await change(axisSelector, 'sketch-y'); await ready();
    serial = (await observe()).serial; await press(reverseSelector);
    const preview = await built(serial, row => row.features.at(-1).axis?.kind === 'sketch-axis' && row.features.at(-1).axis.axis === 'y'
      && row.features.at(-1).reversed === true && row.features.at(-1).angle === 360,
      160 * Math.PI, fullBounds, 'explicit-y-reversed-full-turn-preview');
    const revolution = preview.features.at(-1), bodyId = revolution.bodyOperation?.bodyId;
    check(revolution.sketchId === 'sleeve-profile' && revolution.bodyOperation?.mode === 'new' && typeof bodyId === 'string' && !!bodyId,
      'Actual revolution draft creates one independently identified body from the staged profile');
    check(await recovery() === originalRecovery, 'Full-turn preview still preserves original recovery');
    await ready(); serial = (await observe()).serial; await press(APPLY);
    const revolved = await built(serial, row => row.features.length === originalCount + 1 && row.features.at(-1).id === revolution.id,
      160 * Math.PI, fullBounds, 'revolution-accepted', bodyId);
    check(canonical(revolved.features) === canonical(preview.features), 'Acceptance preserves exact verified sketch and revolution declarations');
    await waitFor('revolution committed and editor closed', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
    const revolvedRecovery = await recovery();
    await press('.tree-row[data-feature-id="bore-profile"]'); await tab('Operaciones');
    await press('button.command[title="Corte extruido"]');
    await waitFor('sole current revolved body automatically selected for cut', () => page(() => document.querySelectorAll('.body-operation-panel input[type="checkbox"]:checked').length === 1));
    serial = (await observe()).serial;
    await change('select[aria-label="Condición final"]', 'mid');
    await change('input[aria-label="Profundidad"]', 20);
    // A same-valued depth need not trigger a build: the preceding condition edit
    // already requests this exact symmetric tool. Use the existing request bound.
    const cutPreview = await built(serial, row => row.features.length === originalCount + 2 && row.features.at(-1).type === 'cut'
      && row.features.at(-1).symmetric === true && row.features.at(-1).depth === 20, 150 * Math.PI, fullBounds, 'axial-bore-preview', bodyId);
    const cut = cutPreview.features.at(-1);
    check(cut.sketchId === 'bore-profile' && cut.bodyScope?.length === 1 && cut.bodyScope[0].bodyId === bodyId
      && cut.bodyScope[0].sourceFeatureId === revolution.id, 'Cut targets the exact current revolution state, not a stale body');
    check(await recovery() === revolvedRecovery, 'Cut preview leaves the accepted revolution intact');
    await ready(); serial = (await observe()).serial; await press(APPLY);
    const final = await built(serial, row => row.features.length === originalCount + 2 && row.features.at(-1).id === cut.id,
      150 * Math.PI, fullBounds, 'bore-accepted', bodyId);
    check(canonical(final.features) === canonical(cutPreview.features), 'Cut acceptance retains the actual verified tool and body scope');
    await waitFor('cut committed and editor closed', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
    for (const stage of [
      { button: 'Deshacer (Ctrl+Z)', count: originalCount + 1, volume: 160 * Math.PI, phase: 'undo-cut', features: revolved.features },
      { button: 'Deshacer (Ctrl+Z)', count: originalCount, volume: 0, phase: 'undo-revolution', features: edited.features },
      { button: 'Rehacer (Ctrl+Y)', count: originalCount + 1, volume: 160 * Math.PI, phase: 'redo-revolution', features: revolved.features },
      { button: 'Rehacer (Ctrl+Y)', count: originalCount + 2, volume: 150 * Math.PI, phase: 'redo-cut', features: final.features },
    ]) {
      serial = (await observe()).serial; await press('button[title="' + stage.button + '"]');
      const history = await built(serial, row => row.features.length === stage.count, stage.volume, fullBounds, stage.phase, bodyId);
      check(canonical(history.features) === canonical(stage.features), 'One history step restores the exact authored profile/operation transaction');
      await waitFor('history reaches current recovery ' + stage.phase, async () => {
        const value = await recovery(); return value && canonical(JSON.parse(value).features) === canonical(stage.features)
          && await page(() => document.querySelector('.statusbar')?.textContent.includes('Listo'));
      });
    }
    await fileCommand('Guardar como…');
    await waitFor('actual save completes and document is clean', async () => dialogCounts().saves === 1
      && ipc.some(event => event.channel === 'document:save' && event.completed)
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.features), 'Saved bytes contain the actual authored revolution and subsequent cut');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, row => row.features.length === originalCount + 2, 150 * Math.PI, fullBounds, 'saved-reopened', bodyId);
    check(canonical(reopened.features) === canonical(saved.features), 'Reopen retains explicit Y axis, reversed direction, angle, profile IDs and current body references');
    await waitFor('reopened sleeve is idle', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')));
    await require('./desktop-part-tree-doubleclick-controls.cjs')({
      feature: revolution, saved, output, evaluate, observe, waitFor, pointer, press, ready, checks, check, canonical, digest,
      verifyOpened: async afterSerial => {
        const editing = await built(afterSerial, row => row.features.length === originalCount + 1
          && row.features.at(-1).id === revolution.id, 160 * Math.PI, fullBounds, 'tree-doubleclick-existing-revolution', bodyId);
        check(canonical(editing.features) === canonical(saved.features.slice(0, originalCount + 1)),
          'Double-click edits the exact saved revolution and its original upstream features');
      },
      verifyCancelled: async afterSerial => {
        const cancelled = await built(afterSerial, row => row.features.length === originalCount + 2,
          150 * Math.PI, fullBounds, 'tree-doubleclick-cancel', bodyId);
        check(canonical(cancelled.features) === canonical(saved.features), 'Double-click Cancel restores exact saved operation declarations');
      },
    });
    const beforeExport = await recovery();
    await fileCommand('Exportar STEP');
    await waitFor('actual STEP export completes', () => dialogCounts().geometryExports === 1
      && ipc.some(event => event.channel === 'document:export' && event.completed));
    const step = await fsp.readFile(revolutionStepPath);
    evidence.partRevolution.nativeStep = await require('./desktop-part-revolution-native.cjs')(step, check);
    check(await recovery() === beforeExport && (await fsp.readFile(output)).equals(bytes), 'STEP export leaves saved document and recovery untouched');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1,
      'Only original open, saved reopen, one document save and one STEP export');
    const observed = await observe();
    check(!observed.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No worker, renderer, resource or unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production worker and WASM actually loaded');
    Object.assign(evidence.partRevolution, { originalSha256: digest(await fsp.readFile(input)), savedSha256: digest(bytes), stepSha256: digest(step),
      bodyId, revolutionId: revolution.id, cutId: cut.id,
      independentOracles: 'Entity rectangle x=[3,7],y=[0,10]: Y full annulus V400pi; quarter X/Y V100pi but different literal bounds, reversal flips Z; translated line x3 quarter V40pi. Sleeve rectangle x=[0,4],y=[-5,5]: half-turn V80pi with Z[-4,0], reversed Z[0,4]; full cylinder V160pi, bounds X/Z±4,Y±5. Symmetric R1 bore removes10pi, leaving V150pi; separate native STEP area130pi and one valid solid. Volume/area1e-5, bounds1e-6 mm.' });
    // The isolated launcher verifies captured demo bytes against this common
    // top-level proof shared by the other part workflow reports.
    evidence.savedSha256 = evidence.partRevolution.savedSha256;
    await capture(saved);
  };
};
