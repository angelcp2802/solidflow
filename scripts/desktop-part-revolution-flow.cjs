'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Existing production commands, pointer activation and visible scripted fields.
// This baseline covers the currently supported local-Y revolution, not selectable
// axes, reversed/two-direction revolution, or a complete revolution workbench.
module.exports = function partRevolutionWorkflow(context) {
  const { expected, input, output, revolutionStepPath, evaluate, observe, waitFor, pointer, capture,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const records = [], interactions = [];
  const evidence = { partRevolution: { records, interactions,
    scope: 'Original saved unused sketch edit -> local-Y revolution -> symmetric cylindrical bore cut -> history/save/reopen/STEP',
    inputLimits: 'Pointer activation of actual visible controls; numerical fields use native input/select setters and bubbling input/change events, not keyboard typing. No application state, worker result or geometric reference is injected.',
    featureLimits: 'Revolution currently has a fixed local-Y sketch axis and one positive angle. Axis selection, reverse direction, symmetric/two-direction revolution and thin-wall revolution are not exercised or claimed.' } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance, label);
  async function press(selector, label) {
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
    await page((selector, value) => {
      const field = document.querySelector(selector), r = field?.getBoundingClientRect();
      if (!field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) throw Error('One visible enabled revolution field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Enabled current option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
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
  return async () => {
    await waitFor('part file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function' && !!document.querySelector('button[aria-label="Abrir (Ctrl+O)"]')), initialReadyMs);
    let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, row => row.features.length === 2 && profileHeight(row) === 8, 0, null, 'original-profiles');
    check(canonical(original.features) === canonical(expected.features), 'Actual opened profiles equal the original recipe');
    await waitFor('opened profiles are idle', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')));
    const originalRecovery = await recovery();
    await press('.tree-row[data-feature-id="sleeve-profile"]');
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('existing unused rectangle editor', () => page(() => document.querySelector('input[aria-label="Altura"]')?.value === '8'));
    serial = (await observe()).serial; await change('input[aria-label="Altura"]', 10);
    const edited = await built(serial, row => row.features.length === 2 && profileHeight(row) === 10, 0, null, 'edited-profile');
    await ready();
    check(await recovery() === originalRecovery, 'Unaccepted profile edit preserves committed recovery');
    await tab('Operaciones');
    await press('button.command[title="Revolución"]');
    await waitFor('revolution owns the staged profile selector', () => page(() => {
      const field = document.querySelector('select[aria-label="Croquis de la operación"]');
      return field?.disabled && field.value === 'sleeve-profile' && !!document.querySelector('input[aria-label="Ángulo"]');
    }));
    serial = (await observe()).serial; await change('input[aria-label="Ángulo"]', 180);
    await built(serial, row => row.features.length === 3 && row.features.at(-1).type === 'revolve' && row.features.at(-1).angle === 180,
      80 * Math.PI, halfBounds, 'half-turn-preview');
    await ready(); check(await recovery() === originalRecovery, 'Half-turn preview does not commit profile or solid');
    serial = (await observe()).serial; await press(CANCEL);
    await waitFor('revolution Cancel restores the live modified profile', () => page(() => document.querySelector('input[aria-label="Altura"]')?.value === '10'
      && document.querySelector('.ribbon-tabs .selected')?.textContent.trim() === 'Croquis'));
    const restored = await built(serial, row => row.features.length === 2 && profileHeight(row) === 10, 0, null, 'cancel-restores-profile');
    check(canonical(restored.features) === canonical(edited.features) && await recovery() === originalRecovery,
      'Cancel restores exact profile IDs/order/draft without altering committed recovery');
    await ready(); await tab('Operaciones');
    serial = (await observe()).serial; await press('button.command[title="Revolución"]');
    const preview = await built(serial, row => row.features.length === 3 && row.features.at(-1).type === 'revolve' && row.features.at(-1).angle === 360,
      160 * Math.PI, fullBounds, 'full-turn-preview');
    const revolution = preview.features.at(-1), bodyId = revolution.bodyOperation?.bodyId;
    check(revolution.sketchId === 'sleeve-profile' && revolution.bodyOperation?.mode === 'new' && typeof bodyId === 'string' && !!bodyId,
      'Actual revolution draft creates one independently identified body from the staged profile');
    check(await recovery() === originalRecovery, 'Full-turn preview still preserves original recovery');
    await ready(); serial = (await observe()).serial; await press(APPLY);
    const revolved = await built(serial, row => row.features.length === 3 && row.features.at(-1).id === revolution.id,
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
    const cutPreview = await built(serial, row => row.features.length === 4 && row.features.at(-1).type === 'cut'
      && row.features.at(-1).symmetric === true && row.features.at(-1).depth === 20, 150 * Math.PI, fullBounds, 'axial-bore-preview', bodyId);
    const cut = cutPreview.features.at(-1);
    check(cut.sketchId === 'bore-profile' && cut.bodyScope?.length === 1 && cut.bodyScope[0].bodyId === bodyId
      && cut.bodyScope[0].sourceFeatureId === revolution.id, 'Cut targets the exact current revolution state, not a stale body');
    check(await recovery() === revolvedRecovery, 'Cut preview leaves the accepted revolution intact');
    await ready(); serial = (await observe()).serial; await press(APPLY);
    const final = await built(serial, row => row.features.length === 4 && row.features.at(-1).id === cut.id,
      150 * Math.PI, fullBounds, 'bore-accepted', bodyId);
    check(canonical(final.features) === canonical(cutPreview.features), 'Cut acceptance retains the actual verified tool and body scope');
    await waitFor('cut committed and editor closed', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
    for (const stage of [
      { button: 'Deshacer (Ctrl+Z)', count: 3, volume: 160 * Math.PI, phase: 'undo-cut', features: revolved.features },
      { button: 'Deshacer (Ctrl+Z)', count: 2, volume: 0, phase: 'undo-revolution', features: edited.features },
      { button: 'Rehacer (Ctrl+Y)', count: 3, volume: 160 * Math.PI, phase: 'redo-revolution', features: revolved.features },
      { button: 'Rehacer (Ctrl+Y)', count: 4, volume: 150 * Math.PI, phase: 'redo-cut', features: final.features },
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
    const reopened = await built(serial, row => row.features.length === 4, 150 * Math.PI, fullBounds, 'saved-reopened', bodyId);
    check(canonical(reopened.features) === canonical(saved.features), 'Reopen retains exact local-Y angle, profile IDs and current body references');
    await waitFor('reopened sleeve is idle', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')));
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
      independentOracles: 'Rectangle x=[0,4],y=[-5,5],XY revolved about +localY: half-turn V80pi with Z[-4,0]; full cylinder V160pi, bounds X/Z±4,Y±5. Symmetric R1 bore removes10pi, leaving V150pi; separate native STEP area130pi and one valid solid. Volume/area1e-5, bounds1e-6 mm.' });
    // The isolated launcher verifies captured demo bytes against this common
    // top-level proof shared by the other part workflow reports.
    evidence.savedSha256 = evidence.partRevolution.savedSha256;
    await capture(saved);
  };
};
