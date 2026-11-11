'use strict';
const fs = require('node:fs/promises');

// Reuse the tracked original sequence fixture; no captured or private CAD input.
module.exports = function partOperationAliasWorkflow(context) {
  const { expected, input, output, observe, waitFor, check, checks, canonical, digest, ipc,
    dialogCounts, consoleErrors, failedRequests, initialReadyMs } = context;
  const interactions = [];
  const { page, press, file } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions });
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const snapshot = require('./desktop-part-menu-snapshot.cjs')({ page, observe, recovery, dialogCounts, ipc });
  const idle = () => waitFor('original sequence workspace ready', () => page(() => !document.querySelector('.property-manager')
    && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance, label);
  async function restore(after, phase) {
    const row = await waitFor('original native sequence prism ' + phase, async () => {
      const state = await observe(); check(state.workerErrors.length === 0, 'Original native observer has no transport errors');
      return state.builds.filter(row => row.serial > after && canonical(row.features) === canonical(expected.features)
        && row.response?.ok && !row.response.value.featureErrors.length && row.response.value.bodies?.length === 1).at(-1);
    });
    const result = row.response.value, body = result.bodies[0];
    check(result.bodyCatalogActive && !result.warnings.length
      && canonical(body.ref) === canonical({ bodyId: 'seq-body', sourceFeatureId: 'seq-base' }), 'Exact original explicit body/reference remains current');
    near(body.volume, 960, 1e-5, 'Independent20×12×4 prism volume960mm³');
    near(body.meshAreaMm2, 736, 1e-4, 'Independent planar triangle area2(240+80+48)=736mm²');
    for (let i = 0; i < 3; i++) {
      near(body.bounds.min[i], [-10, -6, 0][i], 1e-6, 'Original minimum bound');
      near(body.bounds.max[i], [10, 6, 4][i], 1e-6, 'Original maximum bound');
    }
    checks.push({ nativeOperationAliasRestoration: { phase, serial: row.serial, ref: body.ref,
      volume: body.volume, planarMeshAreaMm2: body.meshAreaMm2, bounds: body.bounds } });
    return row;
  }
  return async () => {
    await waitFor('ordinary part open control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const before = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('owned initial replacement prompt', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    await idle(); await restore(before, 'opened');
    await file('Guardar como…');
    await waitFor('one owned fixture save completes', () => dialogCounts().saves === 1
      && ipc.some(row => row.channel === 'document:save' && row.completed));
    const savedBytes = await fs.readFile(output), document = JSON.parse(savedBytes);
    check(canonical(document.features) === canonical(expected.features) && document.id === expected.id, 'Saved sequence input retains exact public fixture identity/features');
    await require('./desktop-part-operation-alias-flow.cjs')({ ...context, snapshot, idle, restore, document });
    check(dialogCounts().opens === 1 && dialogCounts().saves === 1 && ipc.every(row => row.completed)
      && (await fs.readFile(output)).equals(savedBytes) && canonical(JSON.parse(await recovery())) === canonical(document),
    'Finite aliases leave exactly one owned Open/Save and byte-identical source/recovery');
    check(!consoleErrors.length && !failedRequests.length, 'Finite aliases have no renderer/resource errors');
    checks.push({ originalOperationAliasFixture: { sha256: digest(await fs.readFile(input)), savedSha256: digest(savedBytes), interactions,
      provenance: 'Existing tracked src/cad/fixtures/part-sequence-original.json; original20×12×4 explicit prism and five declared rectangular sketches. No new model.',
      limits: 'Native reconstruction checks current explicit body, volume1e-5mm³, planar mesh area1e-4mm² and bounds1e-6mm after each direct Cancel. Mesh area is not a native BRep-area capability; full operation Apply/history/exchange remains in existing family routes.' } });
  };
};
