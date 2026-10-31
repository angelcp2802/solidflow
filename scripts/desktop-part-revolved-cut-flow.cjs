'use strict';
const fsp = require('node:fs/promises');

async function assertDisabled({ press, page, check }, phase) {
  check(await page(() => {
    const buttons = [...document.querySelectorAll('button.command')].filter(button => button.textContent?.trim() === 'Corte por revolución');
    return buttons.length === 1 && buttons[0].disabled === true;
  }),
    'Revolved-cut ribbon disabled: ' + phase);
  await press('[data-assembly-menu="insert"]');
  const disabled = await page(() => {
    const items = [...document.querySelectorAll('.part-main-menus [role="menuitem"]')]
      .filter(item => item.textContent?.trim() === 'Corte por revolución');
    return items.length === 1 && items[0].disabled === true;
  });
  check(disabled, 'Revolved-cut Insert command disabled: ' + phase);
  await press('[data-assembly-menu="insert"]');
}

// Extends the existing original revolution route. All commands and file writes
// go through the production UI/worker/IPC; only visible field setters are scripted.
module.exports = async function revolvedCutWorkflow(context) {
  const { page, press, change, tab, ready, built, recovery, fileCommand, activeProfile,
    observe, waitFor, check, canonical, digest, ipc, output, revolutionStepPath,
    captureProfile, dialogCounts, saved: originalSaved, bodyId, previousFeatureId, evidence } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const bounds = { min: [-4, -5, -4], max: [4, 5, 4] }, count = originalSaved.features.length;
  const details = { scenario: 'original-successive-scoped-revolved-cuts', records: [],
    input: 'Actual visible pointer commands, scripted input/change fields; no worker result or reference injection',
    oracles: 'Initial R4/R1 height10 sleeve150pi. Groove1 r3..4,y0..2 removes14pi; groove2 r3.5..4,y-4..-3 removes3.75pi. Final V132.25pi,A146.5pi; one solid, bounds X/Z±4,Y±5. Units mm; V/A1e-5,bounds1e-6.' };
  evidence.partRevolvedCuts = details;
  const idle = phase => waitFor('committed revolved cut idle ' + phase, () => page(() =>
    !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  async function start(sketchId, fromMenu = false) {
    await press(`.tree-row[data-feature-id="${sketchId}"]:not([data-parent-feature-id])`); await tab('Operaciones');
    const serial = (await observe()).serial;
    if (fromMenu) {
      await press('[data-assembly-menu="insert"]');
      await press('.part-main-menus [role="menuitem"]', 'Corte por revolución');
    } else await press('button.command[title="Corte por revolución"]');
    return serial;
  }
  function declaration(row, sketchId, index, sourceFeatureId) {
    const actual = row.features.at(-1);
    // Only the newly authored UUID is observed; every behavior/reference field
    // is literal and independent from the returned worker geometry.
    const wanted = { id: actual.id, name: `Corte-Revolución${index}`, type: 'revolvedCut', suppressed: false,
      sketchId, angle: 360, bodyScope: [{ bodyId, sourceFeatureId }] };
    check(canonical(actual) === canonical(wanted), 'Exact subtractive declaration, input and current owner scope');
    return wanted;
  }
  async function saveAndReopen(features, volume, phase) {
    const completed = ipc.filter(event => event.channel === 'document:save' && event.completed).length;
    await fileCommand('Guardar');
    await waitFor('new exact completed normal Save ' + phase, async () => {
      if (ipc.filter(event => event.channel === 'document:save' && event.completed).length !== completed + 1) return false;
      const saved = JSON.parse(await fsp.readFile(output, 'utf8'));
      return canonical(saved.features) === canonical(features)
        && await page(() => !document.querySelector('.document-title')?.textContent.includes('*'));
    });
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    const serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, row => canonical(row.features) === canonical(features), volume, bounds, phase, bodyId);
    await idle(phase); check(canonical(reopened.features) === canonical(saved.features), 'Reopen retains complete authored cut graph');
    details.records.push({ phase, savedSha256: digest(bytes), features: saved.features });
    return { saved, bytes };
  }

  const before = await recovery();
  let serial = await start('outer-groove-one');
  await built(serial, row => row.features.length === count + 1 && row.features.at(-1).type === 'revolvedCut'
    && row.features.at(-1).angle === 360, 136 * Math.PI, bounds, 'first-groove-full-preview', bodyId);
  await ready(); await assertDisabled({ press, page, check }, 'operation-active');
  await require('./desktop-part-parameter-layout.cjs')({ page, observe, recovery, check, canonical, records: details.records }, 'revolved-cut-layout', false, 'cut');
  serial = (await observe()).serial;
  await change('select[aria-label="Condición final de revolución"]', 'mid-plane');
  await change('input[aria-label="Ángulo"]', 90);
  await built(serial, row => row.features.at(-1).type === 'revolvedCut' && row.features.at(-1).angle === 90
    && row.features.at(-1).extent?.kind === 'mid-plane', 146.5 * Math.PI, bounds, 'mid-plane-cut-preview', bodyId);
  await ready(); await activeProfile(['outer-groove-one'], 'revolved-groove');
  await captureProfile('revolved-groove', 'outer-groove-one');
  check(await recovery() === before, 'Cut preview does not commit recovery');
  serial = (await observe()).serial; await press(CANCEL);
  await built(serial, row => canonical(row.features) === canonical(originalSaved.features), 150 * Math.PI, bounds, 'cancel-first-groove', bodyId);
  await idle('cancel-first-groove'); check(await recovery() === before, 'Cancel restores exact original document');

  serial = await start('outer-groove-one');
  const firstPreview = await built(serial, row => row.features.length === count + 1 && row.features.at(-1).type === 'revolvedCut'
    && row.features.at(-1).angle === 360, 136 * Math.PI, bounds, 'retry-first-groove', bodyId);
  const first = declaration(firstPreview, 'outer-groove-one', 1, previousFeatureId);
  check(canonical(firstPreview.features) === canonical([...originalSaved.features, first]), 'First cut retains the complete independent original feature prefix');
  await ready(); serial = (await observe()).serial; await press(APPLY);
  await built(serial, row => canonical(row.features) === canonical(firstPreview.features), 136 * Math.PI, bounds, 'apply-first-groove', bodyId);
  await idle('apply-first-groove');
  for (const stage of [
    { button: 'Deshacer (Ctrl+Z)', features: originalSaved.features, volume: 150 * Math.PI, phase: 'undo-first-groove' },
    { button: 'Rehacer (Ctrl+Y)', features: firstPreview.features, volume: 136 * Math.PI, phase: 'redo-first-groove' },
  ]) {
    serial = (await observe()).serial; await press(`button[aria-label="${stage.button}"]`);
    await built(serial, row => canonical(row.features) === canonical(stage.features), stage.volume, bounds, stage.phase, bodyId);
    await idle(stage.phase);
  }
  await saveAndReopen(firstPreview.features, 136 * Math.PI, 'first-groove-reopened');
  serial = await start('outer-groove-two', true);
  const secondPreview = await built(serial, row => row.features.length === count + 2 && row.features.at(-1).type === 'revolvedCut'
    && row.features.at(-1).angle === 360, 132.25 * Math.PI, bounds, 'second-groove-preview', bodyId);
  const second = declaration(secondPreview, 'outer-groove-two', 2, first.id);
  check(canonical(secondPreview.features) === canonical([...originalSaved.features, first, second]), 'Second cut retains the complete independent original and first-cut prefix');
  await ready(); serial = (await observe()).serial; await press(APPLY);
  await built(serial, row => canonical(row.features) === canonical(secondPreview.features), 132.25 * Math.PI, bounds, 'apply-second-groove', bodyId);
  await idle('apply-second-groove');
  const final = await saveAndReopen(secondPreview.features, 132.25 * Math.PI, 'second-groove-reopened');
  const committed = await recovery();
  await press(`.tree-row[data-feature-id="${second.id}"]:not([data-parent-feature-id])`);
  await press('[data-assembly-menu="edit"]'); await press('.part-main-menus [role="menuitem"]', 'Editar operación');
  await ready(); serial = (await observe()).serial; await change('input[aria-label="Ángulo"]', 180);
  await built(serial, row => row.features.at(-1).id === second.id && row.features.at(-1).angle === 180,
    134.125 * Math.PI, bounds, 'edit-saved-revolved-cut', bodyId);
  await ready(); check(await recovery() === committed, 'Editing a saved cut preserves committed recovery');
  serial = (await observe()).serial; await press(CANCEL);
  await built(serial, row => canonical(row.features) === canonical(final.saved.features), 132.25 * Math.PI, bounds, 'cancel-saved-revolved-cut', bodyId);
  await idle('cancel-saved-revolved-cut');
  check(await recovery() === committed && (await fsp.readFile(output)).equals(final.bytes), 'Cancel preserves exact saved cut bytes and recovery');
  const exports = ipc.filter(event => event.channel === 'document:export' && event.completed).length;
  await fileCommand('Exportar STEP');
  await waitFor('grooved sleeve actual STEP export', () => ipc.filter(event => event.channel === 'document:export' && event.completed).length === exports + 1);
  const step = await fsp.readFile(revolutionStepPath);
  details.nativeStep = await require('./desktop-part-revolution-native.cjs')(step, check, 'two-grooves');
  const dialogs = dialogCounts();
  check(dialogs.opens === 4 && dialogs.saves === 1 && dialogs.geometryExports === 2, 'Four exact opens, one Save As grant and two original STEP exports');
  check((await fsp.readFile(output)).equals(final.bytes) && ipc.every(event => event.completed), 'STEP export preserves final saved document and all IPC completes');
  details.savedSha256 = digest(final.bytes); details.stepSha256 = digest(step);
  evidence.savedSha256 = details.savedSha256;
  return final.saved;
};
module.exports.assertDisabled = assertDisabled;
