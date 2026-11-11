'use strict';
const fs = require('node:fs/promises');

module.exports = function instanceRectangleWorkflow(context) {
  const { expected, input, output, observe, waitFor, checks, consoleErrors, failedRequests,
    additive, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const volumes = additive ? { original: 804, unvaried: 812, varied: 810, removed: 809 }
    : { original: 796, unvaried: 788, varied: 790, removed: 791 };
  const maxZ = additive ? 6 : 5;
  const evidence = { phases: [], interactions: [],
    scope: 'Original anchored rectangular Blind ' + (additive ? 'merged boss' : 'cut') + ', independent width and height on two linear instances.',
    input: 'Contained pointer press/release and visible field setters in the owned production renderer.',
    geometry: 'Independent volume and planar mesh area, exact body identity and bounds. Native material probes are separate.' };
  checks.push({ instanceRectangleDimensions: evidence });
  const { page, press, change, file } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions: evidence.interactions });
  const ADDRESS = 'select[aria-label="Instancia para variar sus cotas"]';
  const CONSTRAINT = 'select[aria-label="Cota del croquis para variar"]';
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const owner = { bodyId: 'plate-body', sourceFeatureId: 'pocket' };
  const specifications = [
    { id: 'driving-width', label: 'Anchura' },
    { id: 'driving-height', label: 'Altura' },
  ];
  const field = label => 'input[aria-label="' + label + ' del croquis de la instancia"]';
  const row = (address, constraintId, value) => ({ address, sketchId: 'pocket-profile', constraintId, value });
  const table = (first, second) => [first, second].flatMap((values, index) =>
    specifications.map(({ id }, dimension) => row((index + 1) + ',0', id, values[dimension])));
  const first = table([1, 3], [3, 1]), swapped = table([3, 1], [1, 3]);
  const compareRows = rows => [...rows].sort((a, b) => a.address.localeCompare(b.address) || a.constraintId.localeCompare(b.constraintId));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const serial = async () => (await observe()).serial;
  const mounted = (selector) => waitFor('one current ' + selector, () => page(selector =>
    document.querySelectorAll(selector).length === 1, selector));
  const near = (value, expected, label) => check(Number.isFinite(value) && Math.abs(value - expected) < 1e-5,
    label + ': ' + value + ', expected ' + expected);

  function exact(features, values) {
    if (values === null) return canonical(features) === canonical(expected.features);
    const pattern = features.at(-1), operation = pattern?.featurePattern;
    return features.length === 5 && canonical(features.slice(0, -1)) === canonical(expected.features)
      && pattern.type === 'linearPattern' && pattern.baseFeatureId === 'pocket'
      && canonical(pattern.source) === canonical({ mode: 'features', geometryPattern: false, featureIds: ['pocket'] })
      && canonical(pattern.first) === canonical({ direction: [1, 0, 0], count: 3, spacing: 5 })
      && pattern.second === null && !pattern.secondSeedOnly && !pattern.skipped.length
      && operation?.mode === 'regenerate' && operation.scope === 'selected'
      && canonical(operation.targets) === canonical([owner])
      && canonical(operation.bindings) === canonical([{ source: owner, targetBodyIds: [owner.bodyId] }])
      && !operation.referencePolicies.length
      && (values.length ? operation.variation.kind === 'sketchDimensions'
        && canonical(compareRows(operation.variation.values)) === canonical(compareRows(values))
        : operation.variation.kind === 'none');
  }
  async function native(after, values, volume, area, phase) {
    const record = await waitFor('native rectangle dimensions ' + phase, async () =>
      (await observe()).builds.findLast(item => item.serial > after && item.response?.ok && exact(item.features, values)));
    const model = record.response.value, body = model.bodies?.[0];
    check(model.bodyCatalogActive && model.bodies.length === 1 && !model.featureErrors.length && body.createdByFeatureId === 'plate',
      'One healthy original owner remains');
    check(body.ref.bodyId === owner.bodyId && body.ref.sourceFeatureId === (values === null ? 'pocket' : record.features.at(-1).id),
      'Only the exact current body producer advances');
    near(body.volume, volume, 'Independent native volume');
    near(body.meshAreaMm2, area, 'Independent planar mesh area');
    check(canonical(body.bounds) === canonical({ min: [0, 0, 0], max: [20, 8, maxZ] }), 'Exact outer body bounds');
    evidence.phases.push({ phase, serial: record.serial, body, variation: record.features.at(-1).featurePattern?.variation });
    return record;
  }
  async function committed(features) {
    return waitFor('closed editor and exact committed rectangle recovery', async () => {
      const value = await recovery();
      return value && canonical(JSON.parse(value).features) === canonical(features)
        && await page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo'))
        ? value : false;
    });
  }
  async function assign(rows) {
    for (const entry of rows) {
      const { label } = specifications.find(specification => specification.id === entry.constraintId);
      await change(ADDRESS, entry.address);
      await change(CONSTRAINT, entry.constraintId);
      await change(field(label), entry.value);
      await press('.property-manager button.outline-button', 'Asignar ' + label.toLowerCase());
    }
  }
  async function commit(values, phase) {
    const before = await serial();
    await press(APPLY);
    const result = await native(before, values, volumes.varied, 624, phase);
    await committed(result.features);
    return result;
  }
  return async () => {
    await waitFor('production desktop ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')), initialReadyMs);
    const inputBytes = await fs.readFile(input);
    let before = await serial();
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await native(before, null, volumes.original, 608, 'original');
    const originalRecovery = await committed(original.features);

    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) {
      await press('.part-body-catalog-toggle');
    }
    const body = '.part-body-catalog .body-row input[type="checkbox"]';
    if (!await page(selector => document.querySelector(selector)?.checked, body)) await press(body);
    await press('.ribbon-tabs button', 'Operaciones');
    await press('button.command[title="Matriz lineal"]');
    const sourceKind = 'select[aria-label="Tipo de repetición en cuerpos"]';
    const method = 'select[aria-label="Método de repetición de operaciones"]';
    await mounted(sourceKind);
    await change(sourceKind, 'features');
    await mounted(method);
    await change(method, 'regenerate');
    const contribution = '[aria-label="Resultados de la operación para repetir"] input';
    await mounted(contribution);
    if (!await page(selector => document.querySelector(selector)?.checked, contribution)) await press(contribution);
    const target = '[aria-label="Cuerpos destino de la repetición de operaciones"] input';
    await mounted(target);
    if (!await page(selector => document.querySelector(selector)?.checked, target)) await press(target);
    before = await serial();
    await change('input[aria-label="Instancias en dirección 1"]', 3);
    await change('input[aria-label="Separación en dirección 1"]', 5);
    await native(before, [], volumes.unvaried, 624, 'unvaried-preview');

    await mounted(field('Anchura'));
    await change(field('Anchura'), 0);
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-invalid') === 'true'
      && [...document.querySelectorAll('.property-manager button')].find(button => button.textContent.trim() === 'Asignar anchura')?.disabled,
    field('Anchura')), 'Zero does not allow assigning a width');
    before = await serial();
    await assign(first);
    await native(before, first, volumes.varied, 624, 'two-dimensions-preview');
    check(await recovery() === originalRecovery, 'Unapplied dimension assignments preserve recovery');
    const created = await commit(first, 'two-dimensions-commit');
    const patternId = created.features.at(-1).id, createdRecovery = await recovery();
    const edit = async () => {
      await press('.tree-row[data-feature-id="' + patternId + '"]:not([data-parent-feature-id])');
      await press('.selection-tools button[title="Editar operación"]');
      await waitFor('four exact dimension rows in saved editor', () => page(() => document.querySelectorAll('[aria-label="Cotas asignadas"] li').length === 4));
    };

    await edit();
    before = await serial();
    await assign(swapped);
    await native(before, swapped, volumes.varied, 624, 'swap-preview');
    before = await serial();
    await press(CANCEL);
    const restored = await native(before, first, volumes.varied, 624, 'swap-cancel');
    check(await committed(restored.features) === createdRecovery
      && canonical(restored.response.value.bodies) === canonical(created.response.value.bodies),
    'Cancel restores the exact first table, recovery and native body');
    await edit();
    before = await serial();
    await assign(swapped);
    await native(before, swapped, volumes.varied, 624, 'swap-retry');
    const edited = await commit(swapped, 'swap-commit');
    check(edited.features.at(-1).id === patternId, 'Editing preserves pattern identity');

    before = await serial();
    await press('button[title="Deshacer (Ctrl+Z)"]');
    check(await committed((await native(before, first, volumes.varied, 624, 'undo')).features) === createdRecovery,
      'Undo restores the exact first table');
    before = await serial();
    await press('button[title="Rehacer (Ctrl+Y)"]');
    await committed((await native(before, swapped, volumes.varied, 624, 'redo')).features);
    await file('Guardar como…');
    await waitFor('native Save As completes and the title is clean', async () =>
      ipc.some(event => event.channel === 'document:save' && event.completed)
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fs.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(edited.features), 'Saved bytes retain exact dimensions and source');
    before = await serial();
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await native(before, swapped, volumes.varied, 624, 'reopened');
    const savedRecovery = await committed(reopened.features);
    check(canonical(JSON.parse(savedRecovery)) === canonical(saved), 'Native Open rebuilds the exact saved table');

    await edit();
    before = await serial();
    await press('button[aria-label="Quitar anchura de Instancia 2, 1"]');
    await native(before, swapped.slice(1), volumes.removed, 622, 'remove-one-dimension');
    check(await page(() => document.querySelectorAll('[aria-label="Cotas asignadas"] li').length === 3
      && !!document.querySelector('button[aria-label="Quitar altura de Instancia 2, 1"]')),
    'Removing width retains the height on the same instance');
    before = await serial();
    await press(CANCEL);
    const cancelled = await native(before, swapped, volumes.varied, 624, 'remove-cancel');
    check(await committed(cancelled.features) === savedRecovery && (await fs.readFile(output)).equals(bytes),
      'Cancel after removal preserves saved recovery and bytes');
    check((await fs.readFile(input)).equals(inputBytes), 'Original source file bytes unchanged');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && ipc.every(event => event.completed), 'Exactly two Open and one Save As complete');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer or worker transport errors');
    evidence.savedSha256 = digest(bytes);
  };
};
