'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function recipeAvailabilityWorkflow(context) {
  const { expected, input, output, observe, waitFor, pointer, checks, check, canonical, initialReadyMs, consoleErrors, failedRequests, ipc, dialogCounts } = context;
  const evidence = { interactions: [], cases: [], limits: 'Original cut/entity-merge/Hole fixture and unavailable saved recipe. Real contained pointer presses and visible-field setters; no general recipe or platform claim.' };
  checks.push({ recipeAvailability: evidence });
  const { page, press, change, file } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions: evidence.interactions });
  const METHOD = 'select[aria-label="Método de repetición de operaciones"]';
  const SCOPE = 'select[aria-label="Alcance de los cuerpos de la repetición"]';
  const source = name => '[aria-label="Operaciones para repetir"] input[aria-label="Repetir ' + name + '"]';
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const controls = () => page((method, scope) => {
    const option = (selector, value) => {
      const element = document.querySelector(selector + ' option[value="' + value + '"]');
      return element instanceof HTMLOptionElement ? { present: true, disabled: element.disabled } : { present: false };
    };
    return { regenerate: option(method, 'regenerate'), all: option(scope, 'all'), auto: option(scope, 'auto') };
  }, METHOD, SCOPE);
  async function healthyPrefix(after) {
    const record = await waitFor('exact original healthy availability prefix', async () => (await observe()).builds.findLast(row =>
      row.serial > after && row.response?.ok && canonical(row.features) === canonical(expected.features)));
    check(record.response.value.featureErrors.length === 0 && record.response.value.bodyCatalogActive && record.response.value.bodies.length === 1,
      'Original cut, entity merge and normal Hole all build successfully');
    check(Math.abs(record.response.value.bodies[0].volume - (796 - Math.PI / 4)) < 1e-5, 'Independent original plate/pocket/boss/bore volume');
    await waitFor('original recovery and closed editor', async () => {
      const raw = await recovery();
      return raw && canonical(JSON.parse(raw).features) === canonical(expected.features) && await page(() => !document.querySelector('.property-manager'));
    });
    return record;
  }
  async function start(seedName) {
    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) await press('.part-body-catalog-toggle');
    const body = '.part-body-catalog .body-row input[type="checkbox"]';
    if (!await page(selector => document.querySelector(selector)?.checked, body)) await press(body);
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Matriz lineal"]');
    await waitFor('new pattern source-kind control is mounted', () => page(() => document.querySelectorAll('select[aria-label="Tipo de repetición en cuerpos"]').length === 1));
    await change('select[aria-label="Tipo de repetición en cuerpos"]', 'features');
    await waitFor('feature contribution editor is mounted', () => page(() => !!document.querySelector('[aria-label="Operaciones para repetir"]')));
    const selected = await page(() => [...document.querySelectorAll('[aria-label="Operaciones para repetir"] input:checked')].map(element => element.getAttribute('aria-label')));
    if (!selected.includes('Repetir ' + seedName)) await press(source(seedName));
    for (const label of selected) if (label !== 'Repetir ' + seedName) await press('[aria-label="Operaciones para repetir"] input[aria-label="' + label + '"]');
    const contribution = '[aria-label="Resultados de la operación para repetir"] input';
    await waitFor('one exact historical seed contribution is mounted', () => page(selector => document.querySelectorAll(selector).length === 1, contribution));
    if (!await page(selector => document.querySelector(selector)?.checked, contribution)) await press(contribution);
    const target = '[aria-label="Cuerpos destino de la repetición de operaciones"] input';
    if (!await page(selector => document.querySelector(selector)?.checked, target)) await press(target);
    await change('input[aria-label="Instancias en dirección 1"]', 2); await change('input[aria-label="Separación en dirección 1"]', 5);
  }
  async function healthyPattern(after, id) {
    const record = await waitFor('exact explicitly repaired cut recipe', async () => (await observe()).builds.findLast(row => {
      const pattern = row.features.at(-1), operation = pattern?.featurePattern;
      return row.serial > after && row.response?.ok && !row.response.value.featureErrors.length && row.features.length === expected.features.length + 1
        && canonical(row.features.slice(0, -1)) === canonical(expected.features) && pattern.id === id && pattern.type === 'linearPattern'
        && canonical(pattern.source) === canonical({ mode: 'features', geometryPattern: false, featureIds: ['pocket'] })
        && operation?.mode === 'regenerate' && operation.scope === 'selected' && operation.variation.kind === 'none'
        && canonical(operation.targets) === canonical([{ bodyId: 'plate-body', sourceFeatureId: 'hole' }])
        && canonical(operation.bindings) === canonical([{ source: { bodyId: 'plate-body', sourceFeatureId: 'pocket' }, targetBodyIds: ['plate-body'] }]);
    }));
    const body = record.response.value.bodies[0];
    check(record.response.value.bodies.length === 1 && body.ref.bodyId === 'plate-body' && body.ref.sourceFeatureId === id && body.createdByFeatureId === 'plate',
      'Explicit repair preserves the original body identity and advances only its producer');
    check(Math.abs(body.volume - (792 - Math.PI / 4)) < 1e-5, 'Independent repaired original plate volume');
    return record;
  }
  async function selectCut() {
    await press(source('Corte semilla')); await press(source('Normal hole seed'));
    const contribution = '[aria-label="Resultados de la operación para repetir"] input';
    await waitFor('cut contribution available after explicit seed replacement', () => page(selector => document.querySelectorAll(selector).length === 1, contribution));
    if (!await page(selector => document.querySelector(selector)?.checked, contribution)) await press(contribution);
  }
  async function disabledPress(selector) {
    const before = await observe(), saved = await recovery();
    const point = await page(selector => {
      const elements = document.querySelectorAll(selector), element = elements[0];
      if (elements.length !== 1 || !(element instanceof HTMLInputElement) || !element.disabled) throw Error('One actual disabled seed control required');
      element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = element.getBoundingClientRect(), p = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, hit = document.elementFromPoint(p.x, p.y);
      if (!r.width || !r.height || !hit || !element.closest('label')?.contains(hit)) throw Error('Disabled seed press must hit its own visible label');
      return p;
    }, selector);
    await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(canonical(await observe()) === canonical(before) && await recovery() === saved, 'Real press on an unsupported unchecked seed changes no draft, native observation or recovery');
    evidence.interactions.push({ selector, point, input: 'Actual press/release on disabled seed' });
  }
  return async () => {
    await waitFor('availability desktop ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')), initialReadyMs);
    const inputBytes = await fs.readFile(input); let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]'); await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    await healthyPrefix(serial); const originalRecovery = await recovery();
    await start('Normal hole seed');
    const method = await controls(); check(method.regenerate.present && method.regenerate.disabled, 'Normal Hole retains geometry copying while unsupported Recalculate is unavailable');
    check(await page(selector => document.querySelector(selector)?.checked && !document.querySelector(selector).disabled, source('Normal hole seed')),
      'The chosen normal Hole remains selected and removable');
    await selectCut();
    const currentDraft = (await observe()).builds.findLast(row => row.features.at(-1)?.type === 'linearPattern')?.features.at(-1);
    check(!!currentDraft, 'The current draft has its own observed pattern ID');
    serial = (await observe()).serial; await change(METHOD, 'regenerate'); await healthyPattern(serial, currentDraft.id);
    await disabledPress(source('Normal hole seed'));
    evidence.cases.push({ name: 'unsupported-operation-new-selection', controls: method });
    serial = (await observe()).serial; await press('button[title="Cancelar operación"]'); await healthyPrefix(serial);
    check(await recovery() === originalRecovery, 'Explicit new-seed browsing and Cancel preserve exact original recovery');
    await start('Entity merge seed'); await change(METHOD, 'regenerate');
    const scopes = await controls(); check(scopes.all.present && scopes.all.disabled && scopes.auto.present && scopes.auto.disabled,
      'ALL and AUTO are unavailable for the Selected-only entity merge');
    check(await page(selector => document.querySelector(selector)?.value === 'selected', SCOPE), 'Availability does not change the chosen scope');
    evidence.cases.push({ name: 'unsupported-dynamic-scope', controls: scopes });
    serial = (await observe()).serial; await press('button[title="Cancelar operación"]'); await healthyPrefix(serial);
    check(await recovery() === originalRecovery, 'Scope availability and Cancel leave original recovery unchanged');

    const staleFile = path.join(path.dirname(input), 'stale.solidflow'), staleBytes = await fs.readFile(staleFile), stale = JSON.parse(staleBytes);
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const staleResult = async after => waitFor('saved unavailable recipe retained for explicit repair', async () => (await observe()).builds.findLast(row => row.serial > after
      && row.response?.ok && canonical(row.features) === canonical(stale.features) && row.response.value.featureErrors.some(error => error.message.includes('Regeneration for hole'))));
    await staleResult(serial);
    await waitFor('saved stale intent appears unchanged in recovery', async () => canonical(JSON.parse(await recovery())) === canonical(stale));
    const staleRecovery = await recovery();
    async function editStale() {
      await press('.tree-row[data-feature-id="stale-pattern"]:not([data-parent-feature-id])');
      await press('.selection-tools button[title="Editar operación"]');
      await waitFor('saved unsupported seed is mounted and removable', () => page(selector => document.querySelector(selector)?.checked && !document.querySelector(selector).disabled, source('Normal hole seed')));
      check(await page((method, scope) => document.querySelector(method)?.value === 'regenerate' && document.querySelector(scope)?.value === 'selected', METHOD, SCOPE),
        'Opening an unavailable saved recipe does not coerce its method or scope');
    }
    await editStale(); serial = (await observe()).serial; await press('button[title="Cancelar operación"]'); await staleResult(serial);
    check(await recovery() === staleRecovery, 'Cancel retains the exact unavailable saved intent for later repair');
    await editStale(); serial = (await observe()).serial; await selectCut(); await healthyPattern(serial, 'stale-pattern');
    serial = (await observe()).serial; await press('button[title="Aceptar operación"]'); const repaired = await healthyPattern(serial, 'stale-pattern');
    await waitFor('explicit repair committed without changing original features', async () => canonical(JSON.parse(await recovery()).features) === canonical(repaired.features)
      && await page(() => !document.querySelector('.property-manager')));
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]'); await staleResult(serial);
    check(await recovery() === staleRecovery, 'Undo restores the exact prior unavailable declaration');
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]'); await healthyPattern(serial, 'stale-pattern');
    await file('Guardar como…'); await waitFor('repair Save As completed', () => ipc.some(event => event.channel === 'document:save' && event.completed));
    const savedBytes = await fs.readFile(output), saved = JSON.parse(savedBytes);
    check(saved.id === stale.id && canonical(saved.features) === canonical(repaired.features), 'Save As preserves explicit repaired IDs and parameters');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]'); await healthyPattern(serial, 'stale-pattern');
    await waitFor('native reopen recovers the exact repaired document', async () => canonical(JSON.parse(await recovery())) === canonical(saved));
    check((await fs.readFile(input)).equals(inputBytes) && (await fs.readFile(staleFile)).equals(staleBytes), 'Availability and explicit repair never overwrite either original file');
    check(dialogCounts().opens === 3 && dialogCounts().saves === 1 && ipc.every(event => event.completed), 'Exactly three Open and one Save As complete');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer or worker transport errors during availability or repair');
    evidence.cases.push({ name: 'saved-unsupported-seed-cancel-repair-history-reopen', originalFeatures: expected.features.map(feature => feature.id), repairedPatternId: 'stale-pattern' });
  };
};
