'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Trusted tracked workflow factory. It receives only the shared observer/DOM
// helpers and test-owned paths; it never supplies worker or application state.
module.exports = function worldLimitWorkflow(context) {
  const { second, expected, expectedIds, evaluate, observe, waitFor, click, pointer, menu, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, input, output,
    check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const PATTERN_ID = 'ui-world-P', SEED_ID = 'seed-limit';
  const METHOD = 'select[aria-label="Método de repetición de operaciones"]';
  const firstLabel = 'Mantener plano límite fijo de Original fixed-plane seed';
  const LIMIT = 'input[aria-label="' + (second ? 'Mantener plano límite fijo de dirección 2 de Original fixed-plane seed' : firstLabel) + '"]';
  const FIRST_LIMIT = 'input[aria-label="' + firstLabel + '"]';
  const APPLY = 'button[title="Aceptar operación"]';
  const expectedPolicy = { featureId: SEED_ID, path: second ? 'secondDirection.endCondition.target' : 'endCondition.target', placement: 'world' };
  const originalCutLength = second ? 7 : 6, regeneratedCutLength = second ? 3 : 2;
  const volumeAfterCut = length => 64 - length * Math.PI / 4;
  function assertOrigin(document) {
    check(document.version === 1 && document.id === 'ui-world-original-document' && document.id === expected.id
      && document.name === 'Original isolated world-limit interaction' && document.name === expected.name
      && document.units === 'mm' && document.createdAt === expected.createdAt
      && document.features.map(feature => feature.id).join('|') === expectedIds.join('|'), 'Unexpected world-limit document origin or identities.');
    check(canonical(document.features.slice(0, -1)) === canonical(expected.features.slice(0, -1)), 'The original fixed-plane source/target prefix changed.');
  }
  function assertDeclaration(document, world) {
    assertOrigin(document);
    const original = expected.features.at(-1), feature = document.features.at(-1);
    const desired = world ? { ...original, source: { ...original.source, geometryPattern: false },
      featurePattern: { mode: 'regenerate', scope: 'selected', targets: original.featurePattern.targets,
        bindings: original.featurePattern.bindings, referencePolicies: [expectedPolicy], variation: { kind: 'none' } } } : original;
    check(feature.id === PATTERN_ID && canonical(feature) === canonical(desired), 'Unexpected fixed-plane method/policy, exact routes or original pattern settings.');
  }
  function assertBodies(record, phase) {
    const bodies = record.response.value.bodies, actual = new Map(bodies.map(body => [body.ref.bodyId, body]));
    check(bodies.length === 2 && actual.size === 2, 'Expected exactly two distinct original world-limit owners.');
    const desired = {
      S: [SEED_ID, 'create-S', volumeAfterCut(originalCutLength), [-1, -1, -8], [1, 1, 8]],
      A: [phase === 'missing-policy' ? 'create-A' : PATTERN_ID, 'create-A', phase === 'missing-policy' ? 64
        : volumeAfterCut(phase === 'geometry' ? originalCutLength : regeneratedCutLength), [2, -1, -8], [4, 1, 8]],
    };
    for (const [id, [source, creator, volume, min, max]] of Object.entries(desired)) {
      const body = actual.get(id);
      check(body?.ref.sourceFeatureId === source && body.createdByFeatureId === creator, 'Unexpected exact fixed-plane ref/creator for ' + id);
      check(Number.isFinite(body.volume) && Math.abs(body.volume - volume) < 1e-5, 'Unexpected independent fixed-plane volume for ' + id);
      for (const [side, expectedSide] of [['min', min], ['max', max]]) expectedSide.forEach((coordinate, index) =>
        check(Number.isFinite(body.bounds[side][index]) && Math.abs(body.bounds[side][index] - coordinate) < 1e-6, 'Unexpected independent fixed-plane bounds for ' + id));
    }
  }
  async function buildAfter(serial, phase) {
    return waitFor('actual worker ' + phase + ' fixed-plane build', async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Observed a real worker error.');
      const matches = state.builds.filter(record => {
        const feature = record.features.at(-1), operation = feature?.featurePattern;
        if (record.serial <= serial || record.features.map(item => item.id).join('|') !== expectedIds.join('|') || !record.response) return false;
        if (phase === 'geometry') return operation?.mode === 'geometry' && feature.source.geometryPattern === true;
        return operation?.mode === 'regenerate' && operation.scope === 'selected' && feature.source.geometryPattern === false
          && Array.isArray(operation.referencePolicies) && operation.referencePolicies.length === (phase === 'missing-policy' ? 0 : 1);
      });
      const record = matches.at(-1); if (!record) return false;
      check(record.response.ok, record.response.error || 'Worker rejected outside the expected feature boundary.');
      check(record.response.value.bodyCatalogActive, 'The fixed-plane worker did not use the owned catalog.');
      const errors = record.response.value.featureErrors;
      if (phase === 'missing-policy') {
        check(errors.length === 1 && errors[0].id === PATTERN_ID
          && errors[0].message.startsWith(SEED_ID + ':' + expectedPolicy.path + ': ')
          && errors[0].message.includes('saved remap policy'), 'Expected the real worker missing-reference-policy error for this exact direction.');
      } else check(errors.length === 0, 'Fixed-plane worker returned unexpected feature errors.');
      assertBodies(record, phase); return record;
    });
  }
  function assertPendingUi(before, response, limitChecked) {
    const samples = response.ui.filter(sample => sample.eventSerial > before.eventSerial
      && sample.eventSerial < response.responseEventSerial && sample.method === 'regenerate' && sample.worldLimitChecked === limitChecked);
    check(samples.some(sample => sample.applyDisabled === true) && samples.every(sample => sample.applyDisabled === true),
      'Apply did not stay disabled before the actual fixed-plane worker response.');
  }
  const recovery = () => evaluate("localStorage.getItem('solidflow.autosave')");
  async function pressSecondLimit() {
    const selector = encodeJavaScriptString(LIMIT);
    await evaluate(`document.querySelector(${selector}).scrollIntoView({block:'nearest',behavior:'instant'})`);
    const point = await waitFor('actual Direction 2 policy is visible and hit-tested', () => evaluate(`(() => {
      const rows = document.querySelectorAll(${selector}), field = rows[0], r = field?.getBoundingClientRect();
      if (rows.length !== 1 || !r.width || !r.height || field.disabled || field.checked || !field.checkVisibility()) return false;
      const x = Math.floor(r.left + r.width/2), y = Math.floor(r.top + r.height/2);
      return field === document.elementFromPoint(x,y) ? { x, y } : false;
    })()`));
    await pointer('mouseMoved', point);
    check(await evaluate(`document.querySelector(${selector}) === document.elementFromPoint(${point.x},${point.y})`),
      'Direction 2 pointer remains on the current policy before press');
    await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    return point;
  }
  async function previewWorld() {
    await evaluate(`(() => { const rows=[...document.querySelectorAll('.tree-row')].filter(row=>[...row.querySelectorAll('span')].some(span=>span.textContent==='UI world-limit pattern original')); if(rows.length!==1) throw Error('Original fixed-plane row missing/ambiguous'); rows[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); })()`);
    await waitFor('geometry editor keeps exact selected A', () => evaluate(`(() => {const method=document.querySelector(${encodeJavaScriptString(METHOD)});const a=document.querySelector('input[aria-label="Aplicar repetición a Original A"]');return method?.value==='geometry'&&!method.disabled&&a?.checked&&!document.querySelector(${encodeJavaScriptString(LIMIT)});})()`));
    const beforeMethod = await observe();
    await evaluate(`(() => {const select=document.querySelector(${encodeJavaScriptString(METHOD)});if(!select||select.disabled||select.value!=='geometry') throw Error('Geometry method is not editable');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'regenerate');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const missing = await buildAfter(beforeMethod.serial, 'missing-policy');
    const afterMissing = await observe(); assertPendingUi(beforeMethod, { ...missing, ui: afterMissing.ui }, false);
    await waitFor('missing policy blocks Apply and offers an explicit unchecked limit', () => evaluate(`(() => {const method=document.querySelector(${encodeJavaScriptString(METHOD)});const limit=document.querySelector(${encodeJavaScriptString(LIMIT)});const apply=document.querySelector(${encodeJavaScriptString(APPLY)});return method?.value==='regenerate'&&!!limit&&!limit.disabled&&!limit.checked&&!!apply&&apply.disabled;})()`));
    if (second) check(await evaluate(`!document.querySelector(${encodeJavaScriptString(FIRST_LIMIT)})`), 'Direction 1 is Blind and offers no fixed-plane policy');
    const option = second ? 'Mantener el plano límite de dirección 2 de Original fixed-plane seed'
      : 'Mantener el plano límite de Original fixed-plane seed';
    const guidance = 'Para recalcular la dirección ' + (second ? '2' : '1') + ' hasta el plano XY, activa «' + option + '» en «Planos límite».';
    const banner = () => evaluate("document.querySelector('.error-banner[role=alert] span')?.textContent");
    await waitFor('Spanish guidance names the exact fixed-plane option', async () => await banner() === guidance)
      .catch(async error => { error.message += '; banner=' + JSON.stringify(await banner()); throw error; });
    check(await evaluate(`document.querySelector(${encodeJavaScriptString(LIMIT)})?.closest('label')?.textContent.trim() === ${encodeJavaScriptString(option)}`),
      'The Spanish diagnostic names the actual visible fixed-plane choice');
    const raw = missing.response.value.featureErrors[0].message;
    check(raw === SEED_ID + ':' + expectedPolicy.path + ': An external/internal support needs a saved remap policy; no world/latest/nearest default.',
      'The original worker diagnostic remains exact');
    checks.push({ worldLimitDiagnostic: { direction: second ? 2 : 1, raw, guidance } });
    const beforePolicy = await observe();
    let pointerPoint = null;
    if (second) pointerPoint = await pressSecondLimit();
    else await click(LIMIT);
    const preview = await buildAfter(beforePolicy.serial, 'world'); assertDeclaration({ ...expected, features: preview.features }, true);
    const afterPreview = await observe(); assertPendingUi(beforePolicy, { ...preview, ui: afterPreview.ui }, true);
    await waitFor('explicit fixed-plane preview enables Apply with exact selected A', () => evaluate(`(() => {const method=document.querySelector(${encodeJavaScriptString(METHOD)});const limit=document.querySelector(${encodeJavaScriptString(LIMIT)});const scope=document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]');const a=document.querySelector('input[aria-label="Aplicar repetición a Original A"]');const apply=document.querySelector(${encodeJavaScriptString(APPLY)});return method?.value==='regenerate'&&limit?.checked&&scope?.value==='selected'&&a?.checked&&!!apply&&!apply.disabled;})()`));
    return { missing, preview, pointerPoint };
  }
  return async function workflow() {
    assertDeclaration(expected, false);
    const originalBytes = await fsp.readFile(input);
    await waitFor('initial renderer readiness', async () => evaluate(`(() => { const s=document.querySelector('.statusbar')?.textContent||''; return s.includes('Listo')&&s.includes('Sólido')&&document.querySelectorAll('canvas').length>0&&typeof window.solidflow?.openDocument==='function'&&typeof window.require==='undefined'&&typeof window.process==='undefined'; })()`), initialReadyMs);
    let serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('fresh isolated document asks to discard', () => evaluate(`document.querySelectorAll('[role="dialog"][aria-labelledby="discard-title"]').length === 1`));
    await evaluate(`(() => { const button=document.querySelector('[role="dialog"][aria-labelledby="discard-title"] .primary-button'); if(!button||button.disabled||button.textContent.trim()!=='Continuar sin guardar') throw Error('Expected exact enabled discard confirmation'); button.click(); })()`);
    await waitFor('fresh isolated discard dialog closes', () => evaluate(`!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')`));
    const geometry = await buildAfter(serial, 'geometry'); assertDeclaration({ ...expected, features: geometry.features }, false);
    await waitFor('loaded original fixed-plane document', () => evaluate(`document.querySelector('.document-title')?.textContent.includes('Original isolated world-limit interaction')`));
    const geometryRecovery = await waitFor('original geometry recipe reaches recovery', async () => {
      const value = await recovery();
      if (!value || canonical(JSON.parse(value).features) !== canonical(expected.features)) return false;
      return value;
    });
    let staged = await previewWorld(), cancelled = null;
    if (second) {
      check(await recovery() === geometryRecovery, 'Direction 2 verified preview leaves the committed geometry recipe intact');
      const beforeCancel = await observe();
      await click('button[title="Cancelar operación"]');
      await waitFor('Cancel closes the Direction 2 property manager', () => evaluate("!document.querySelector('.property-manager')"));
      const restored = await buildAfter(beforeCancel.serial, 'geometry');
      assertDeclaration({ ...expected, features: restored.features }, false);
      check(await recovery() === geometryRecovery, 'Cancel restores exact geometry recipe recovery');
      cancelled = { restoredSerial: restored.serial, pointerPoint: staged.pointerPoint };
      staged = await previewWorld();
      check(await recovery() === geometryRecovery, 'Retry does not publish the fixed Direction 2 policy before Apply');
    }
    const { preview, missing, pointerPoint } = staged;
    serial = (await observe()).serial;
    await click(APPLY);
    await waitFor('React Apply leaves the property manager', () => evaluate(`!document.querySelector('.property-manager')`));
    const committed = await buildAfter(serial, 'world');
    await waitFor('committed fixed-plane policy reaches autosave', async () => {
      const value = await evaluate(`localStorage.getItem('solidflow.autosave')`); if (!value) return false;
      const document = JSON.parse(value); if (document.id !== expected.id || document.features.at(-1)?.featurePattern?.referencePolicies?.length !== 1) return false;
      assertDeclaration(document, true); return true;
    });
    await menu('Guardar como…');
    await waitFor('real preload/IPC save completes', () => dialogCounts().saves === 1 && ipc.some(event => event.channel === 'document:save' && event.completed));
    await waitFor('renderer records the completed save', () => evaluate(`(() => {const title=document.querySelector('.document-title')?.textContent||'';return title.includes('Original isolated world-limit interaction')&&!title.includes('*');})()`));
    const saved = JSON.parse(await fsp.readFile(output, 'utf8')); assertDeclaration(saved, true);
    serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await buildAfter(serial, 'world');
    check(canonical(reopened.features) === canonical(saved.features), 'Reopened worker input differs from the saved fixed-plane file.');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Expected fixture open, test-owned Save As and saved-output reopen only.');
    check(!consoleErrors.length && !failedRequests.length, 'Renderer console/request failure occurred.');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Real production worker/WASM loads were not observed.');
    check((await fsp.readFile(input)).equals(originalBytes), 'Original input bytes are unchanged after Save As and reopen');
    checks.push({ independentBodyOracles: { seedAndCopiedCutLengthMm: originalCutLength, regeneratedCutLengthMm: regeneratedCutLength,
        formula: '64 - pi*L/4 mm³ per body', boundsToleranceMm: 1e-6, volumeToleranceMm3: 1e-5 },
      direction: second ? 'second' : 'first', ...(second && { pointerPoint, cancelled }),
      originalFixtureSha256: digest(originalBytes),
      workerBuilds: [['geometry', geometry], ['preview-world', preview], ['committed-world', committed], ['reopened-world', reopened]].map(([phase, record]) => ({
        phase, requestId: record.id, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: record.response.value.bodies })),
      expectedRejectedPreview: { phase: 'missing-policy', requestId: missing.id, serial: missing.serial, featuresSha256: digest(canonical(missing.features)),
        featureErrors: missing.response.value.featureErrors, bodies: missing.response.value.bodies },
      savedPattern: saved.features.at(-1), savedContentSha256: digest(await fsp.readFile(output)), savedFeaturesSha256: digest(JSON.stringify(saved.features)) });
  };
};

// Original project-owned variation of the tracked two-box world-limit fixture.
// A -1 mm Blind ray and an opposing ray to XY meet at z=-6. Translation by
// [3,0,4] leaves a three-millimetre regenerated cut ending at z=0.
module.exports.createSecondDirectionDocument = () => {
  const document = structuredClone(require('../src/cad/fixtures/pattern-world-limit-original.json'));
  const seed = document.features.find(feature => feature.id === 'seed-limit');
  if (seed?.type !== 'cut' || seed.endCondition?.kind !== 'upToSurface' || seed.endCondition.target.kind !== 'principal') {
    throw Error('Original fixed-plane seed required.');
  }
  seed.secondDirection = { enabled: true, depth: 6, endCondition: seed.endCondition };
  delete seed.endCondition;
  seed.depth = -1;
  return document;
};
