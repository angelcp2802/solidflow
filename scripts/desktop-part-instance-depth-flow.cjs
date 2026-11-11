'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function instanceDimensionWorkflow(context, dimension = 'depth') {
  const { expected, input, output, evaluate, observe, waitFor, pointer, checks, consoleErrors,
    failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const radius = dimension === 'radius', kind = radius ? 'sketchDimensions' : 'dimensions';
  const assigned = radius ? [.5, 1.5] : [-2, -3], swappedValues = radius ? [1.5, .5] : [-3, -2];
  const assignLabel = radius ? 'Asignar radio' : 'Asignar profundidad';
  const rowLabel = radius ? 'Radios asignados' : 'Profundidades asignadas';
  const evidence = { phases: [], actions: [], limits: 'One original linear selected cut; actual CDP pointer and visible-field setters. Native STEP and physical face/probe measurements belong to the separate engine fixtures. Circular UI mesh area is not an exact surface-area oracle.' };
  checks.push({ [radius ? 'instanceSketchRadius' : 'instanceDepth']: evidence });
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const FIELD = radius ? 'input[aria-label="Radio del croquis de la instancia"]' : 'input[aria-label="Profundidad de la instancia"]';
  const ADDRESS = radius ? 'select[aria-label="Instancia para variar su radio"]' : 'select[aria-label="Instancia para variar su profundidad"]';
  const ASSIGN = '.property-manager button.outline-button';
  const APPLY = 'button[title="Aceptar operación"]';
  const owner = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
  const rows = values => values.map((value, index) => radius
    ? { address: `${index + 1},0`, sketchId: 'pocket-profile', constraintId: 'driving-radius', value }
    : { address: `${index + 1},0`, featureId: 'pocket', parameter: 'depth', value });
  const read = () => page(() => localStorage.getItem('solidflow.autosave'));
  function inspect(selector, label, reveal) {
    return page((selector, label, reveal) => {
      const text = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim();
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || text(e) === label);
      if (matches.length !== 1) return false;
      const element = matches[0];
      if (reveal) element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = element.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, right = innerWidth, top = 0, bottom = innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), b = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, b.left + parent.clientLeft); right = Math.min(right, b.left + parent.clientLeft + parent.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, b.top + parent.clientTop); bottom = Math.min(bottom, b.top + parent.clientTop + parent.clientHeight); }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return !element.matches(':disabled') && !element.closest('[hidden]') && r.width > 0 && r.height > 0
        && r.left >= left && r.right <= right && r.top >= top && r.bottom <= bottom && hit && (hit === element || element.contains(hit)) ? point : false;
    }, selector, label ?? null, reveal);
  }
  async function target(selector, label) {
    let previous, stableSince = 0;
    return waitFor(`stationary current depth control ${label || selector}`, async () => {
      const value = await inspect(selector, label, true);
      if (!value || canonical(value) !== canonical(previous)) { previous = value; stableSince = Date.now(); return false; }
      return Date.now() - stableSince >= 120 ? value : false;
    });
  }
  async function press(selector, label) {
    const point = await target(selector, label);
    await pointer('mouseMoved', point);
    check(canonical(await inspect(selector, label, false)) === canonical(point), 'The exact control remains contained and hit-tested');
    await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    evidence.actions.push({ selector, label, point, input: 'CDP pointer' });
  }
  async function change(selector, value) {
    await target(selector);
    await page((selector, value) => {
      const field = document.querySelector(selector);
      if (document.querySelectorAll(selector).length !== 1 || field.disabled || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) throw Error('Expected current visible depth field');
      if (field instanceof HTMLSelectElement && ![...field.options].some(o => o.value === value && !o.disabled)) throw Error('Expected one active option');
      const proto = field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }));
    }, selector, String(value));
    await waitFor('visible depth field retains input', () => page((s, v) => document.querySelector(s)?.value === v, selector, String(value)));
    evidence.actions.push({ selector, value, input: 'Visible field setter/event' });
  }
  async function assign(address, value) {
    await change(ADDRESS, address); await change(FIELD, value); await press(ASSIGN, assignLabel);
  }
  const exact = (features, values) => {
    if (values === null) return canonical(features) === canonical(expected.features);
    const f = features.at(-1), mode = f?.featurePattern;
    return features.length === 5 && canonical(features.slice(0, -1)) === canonical(expected.features) && f.type === 'linearPattern'
      && f.baseFeatureId === 'pocket' && canonical(f.source) === canonical({ mode: 'features', geometryPattern: false, featureIds: ['pocket'] })
      && canonical(f.first) === canonical({ direction: [1, 0, 0], count: radius ? 3 : 4, spacing: 5 }) && f.second === null && !f.secondSeedOnly && !f.skipped.length
      && mode?.mode === 'regenerate' && mode.scope === 'selected' && canonical(mode.targets) === canonical([owner])
      && canonical(mode.bindings) === canonical([{ source: owner, targetBodyIds: ['plate-body'] }])
      && (values.length ? mode.variation.kind === kind
        && canonical(mode.variation.values?.slice().sort((a, b) => a.address.localeCompare(b.address))) === canonical(rows(values)) : mode.variation.kind === 'none');
  };
  async function native(after, values, phase) {
    const record = await waitFor(`native addressed geometry ${phase}`, async () => (await observe()).builds.findLast(r => r.serial > after && r.response?.ok && exact(r.features, values)));
    const result = record.response.value, body = result.bodies?.[0];
    check(result.bodyCatalogActive && result.bodies.length === 1 && !result.featureErrors.length && body.createdByFeatureId === 'plate', 'One healthy original owner remains');
    check(body.ref.bodyId === 'plate-body' && body.ref.sourceFeatureId === (values ? record.features.at(-1).id : 'pocket'), 'Only the exact changed body advances its producer');
    const [volume, area] = radius ? [values ? 800 - (values.length ? 3.5 : 3) * Math.PI : 800 - Math.PI, null] : values ? [772, 656] : [796, 608];
    check(Math.abs(body.volume - volume) < 1e-5, 'Independent original plate volume');
    if (area !== null) check(Math.abs(body.meshAreaMm2 - area) < 1e-5, 'Literal original planar mesh area');
    check(canonical(body.bounds) === canonical({ min: [0, 0, 0], max: [20, 8, 5] }), 'Literal plate bounds remain unchanged');
    evidence.phases.push({ phase, serial: record.serial, body, variation: record.features.at(-1).featurePattern?.variation });
    return record;
  }
  async function idle(features) {
    return waitFor('exact committed recovery after closing editor', async () => {
      const raw = await read();
      return raw && canonical(JSON.parse(raw).features) === canonical(features)
        && await page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')) ? raw : false;
    });
  }
  async function apply(values, phase) {
    const before = (await observe()).serial; await press(APPLY);
    const record = await native(before, values, phase); await idle(record.features); return record;
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  return async () => {
    await waitFor('production desktop ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')), initialReadyMs);
    const inputBytes = await fs.readFile(input);
    let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]'); await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const initial = await native(serial, null, 'original'); await idle(initial.features);
    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) await press('.part-body-catalog-toggle');
    const body = '.part-body-catalog .body-row input[type="checkbox"]';
    if (!await page(s => document.querySelector(s)?.checked, body)) await press(body);
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Matriz lineal"]');
    await change('select[aria-label="Tipo de repetición en cuerpos"]', 'features');
    await change('select[aria-label="Método de repetición de operaciones"]', 'regenerate');
    const contribution = '[aria-label="Resultados de la operación para repetir"] input';
    if (!await page(s => document.querySelector(s)?.checked, contribution)) await press(contribution);
    const target = '[aria-label="Cuerpos destino de la repetición de operaciones"] input';
    if (!await page(s => document.querySelector(s)?.checked, target)) await press(target);
    await change('input[aria-label="Instancias en dirección 1"]', radius ? 3 : 4);
    await change('input[aria-label="Separación en dirección 1"]', 5);
    await change(FIELD, 0);
    check(await page((s, label) => document.querySelector(s)?.getAttribute('aria-invalid') === 'true'
      && [...document.querySelectorAll('.property-manager button')].find(e => e.textContent.trim() === label)?.disabled, FIELD, assignLabel), 'Zero leaves assignment disabled');
    serial = (await observe()).serial; await assign('1,0', Math.abs(assigned[0])); await assign('2,0', Math.abs(assigned[1]));
    await native(serial, assigned, 'addressed-preview');
    const created = await apply(assigned, 'addressed-commit'), feature = created.features.at(-1), createdRecovery = await read();
    const edit = async () => {
      await press(`.tree-row[data-feature-id="${feature.id}"]:not([data-parent-feature-id])`);
      await press('.selection-tools button[title="Editar operación"]');
      await waitFor('addressed editor retains both saved rows', () => page(label => document.querySelectorAll('[aria-label="' + label + '"] li').length === 2, rowLabel));
    };
    await edit(); serial = (await observe()).serial; await assign('1,0', Math.abs(swappedValues[0])); await assign('2,0', Math.abs(swappedValues[1]));
    await native(serial, swappedValues, 'swapped-preview');
    serial = (await observe()).serial; await press('button[title="Cancelar operación"]');
    const restored = await native(serial, assigned, 'swapped-cancel');
    check(await idle(restored.features) === createdRecovery && canonical(restored.response.value.bodies) === canonical(created.response.value.bodies), 'Cancel restores exact committed geometry and recovery');
    await edit(); serial = (await observe()).serial; await assign('1,0', Math.abs(swappedValues[0])); await assign('2,0', Math.abs(swappedValues[1]));
    await native(serial, swappedValues, 'swapped-retry');
    const swapped = await apply(swappedValues, 'swapped-commit');
    check(swapped.features.at(-1).id === feature.id, 'Editing depths retains the original feature ID');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    check(await idle((await native(serial, assigned, 'undo-dimensions')).features) === createdRecovery, 'Undo restores the original table and exact committed recovery');
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await idle((await native(serial, swappedValues, 'redo-dimensions')).features);
    await file('Guardar como…'); await waitFor('actual Save As completes', () => ipc.some(e => e.channel === 'document:save' && e.completed));
    const bytes = await fs.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(swapped.features), 'Saved bytes retain exact original and varied instances');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await native(serial, swappedValues, 'reopened-dimensions');
    check(canonical(JSON.parse(await idle(reopened.features))) === canonical(saved), 'Open rebuilds the saved variation exactly');
    if (radius) {
      const savedRecovery = await read(); await edit(); serial = (await observe()).serial;
      await press('button[aria-label="Quitar radio de Instancia 2, 1"]');
      await press('button[aria-label="Quitar radio de Instancia 3, 1"]');
      await native(serial, [], 'clear-table-preview');
      check(await page(() => {
        const method = document.querySelector('select[aria-label="Método de repetición de operaciones"] option[value="geometry"]');
        const scope = document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"] option[value="all"]');
        return !document.querySelector('[aria-label="Radios asignados"]') && method instanceof HTMLOptionElement && scope instanceof HTMLOptionElement
          && !method.disabled && !scope.disabled;
      }),
      'Actual remove-row commands restore none intent and unlock calculation method and scope');
      serial = (await observe()).serial; await press('button[title="Cancelar operación"]');
      const cancelled = await native(serial, swappedValues, 'clear-table-cancel');
      check(await idle(cancelled.features) === savedRecovery && (await fs.readFile(output)).equals(bytes),
        'Cancel after explicit row removal preserves exact saved recovery and native file bytes');
    }
    check((await fs.readFile(input)).equals(inputBytes), 'The original input file is unchanged');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && ipc.every(e => e.completed), 'Exactly two Open and one Save As complete');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer or worker transport errors');
    evidence.savedSha256 = digest(bytes);
  };
};
