'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original tracked DOM workflow. Only real Worker/IPC observations supply results.
module.exports = function untilNextWorkflow(context) {
  const { fixtures, outputs, inputPaths, evaluate, observe, waitFor, click, menu, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts } = context;
  const METHOD = 'select[aria-label="Método de repetición de operaciones"]';
  const SCOPE = 'select[aria-label="Alcance de los cuerpos de la repetición"]';
  const APPLY = 'button[title="Aceptar operación"]';
  const INCOMPLETE = 'Ninguna superficie siguiente del cuerpo intercepta todo el perfil.';
  const builds = [], savedDocuments = [];
  // Arguments are encoded data; these functions only read DOM or dispatch DOM events.
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const original = key => fixtures[key].features.at(-1);
  const expectedTargetName = key => fixtures[key].features.find(feature => feature.id === 'create-A').name;
  function assertDeclaration(document, key, method, scope = 'selected') {
    const expected = fixtures[key], initial = original(key), feature = document.features.at(-1);
    check(document.version === 1 && document.id === expected.id && document.name === expected.name
      && document.units === 'mm' && document.createdAt === expected.createdAt,
      'Unexpected original UntilNext document identity/units.');
    check(document.features.map(item => item.id).join('|') === expected.features.map(item => item.id).join('|')
      && canonical(document.features.slice(0, -1)) === canonical(expected.features.slice(0, -1)),
      'UntilNext source/target prefix or identities changed.');
    const desired = method === 'geometry' ? initial : {
      ...initial, source: { ...initial.source, geometryPattern: false },
      featurePattern: scope === 'all'
        ? { mode: 'regenerate', scope: 'all', reevaluateAt: 'patternInput',
          bindings: initial.featurePattern.bindings.map(binding => ({ source: binding.source, targetBodyIds: 'scope' })),
          referencePolicies: [], variation: { kind: 'none' } }
        : { mode: 'regenerate', scope: 'selected', targets: initial.featurePattern.targets,
          bindings: initial.featurePattern.bindings, referencePolicies: [], variation: { kind: 'none' } },
    };
    check(canonical(feature) === canonical(desired), 'UntilNext method/scope, historical bindings or pattern parameters changed.');
    const seed = document.features.find(item => item.id === (key === 'add' ? 'seed-add' : 'seed-cut'));
    check(seed.endCondition.kind === 'untilNext'
      && seed.endCondition.baseFeatureId === (key === 'add' ? 'cavity-S' : 'create-S'),
      'Saved UntilNext source base was rewritten to a target or copied depth.');
  }
  async function assertOriginalGeometryAutosave(key, phase) {
    const value = await page(() => localStorage.getItem('solidflow.autosave'));
    check(!!value, 'Expected original geometry autosave during ' + phase);
    const document = JSON.parse(value);
    assertDeclaration(document, key, 'geometry');
    check(canonical(document.features) === canonical(fixtures[key].features),
      'Rejected UntilNext edit changed the original geometry autosave during ' + phase);
    checks.push({ originalGeometryAutosave: phase, documentId: document.id,
      featuresSha256: digest(canonical(document.features)) });
  }
  function assertBodies(record, key, method, rejected = false) {
    const values = record.response.value.bodies, bodies = new Map(values.map(body => [body.ref.bodyId, body]));
    const pattern = original(key).id;
    const desired = key === 'cut' ? {
      S: ['seed-cut', 'create-S', 1000 - 10 * Math.PI, [0, 0, 0], [10, 10, 10]],
      A: [pattern, 'create-A', 656 - (method === 'geometry' ? 4 : 2) * Math.PI, [20, 0, 0], [30, 10, 8]],
      B: ['create-B', 'create-B', 800, [20, 0, -10], [30, 10, -2]],
    } : key === 'add' ? {
      S: ['seed-add', 'create-S', 656 + 4 * Math.PI, [0, 0, 0], [10, 10, 8]],
      A: [pattern, 'create-A', 912 + (method === 'geometry' ? 4 : 8) * Math.PI, [20, 0, 0], [30, 10, 12]],
    } : {
      S: ['seed-cut', 'create-S', 1000 - 10 * Math.PI, [0, 0, 0], [10, 10, 10]],
      A: [rejected ? 'create-A' : pattern, 'create-A',
        rejected ? 440 : 440 - 16 * Math.PI / 3 - 2 * Math.sqrt(3), [20, 0, 0], [25.5, 10, 8]],
    };
    check(values.length === Object.keys(desired).length && bodies.size === values.length,
      'Expected exactly the complete distinct original UntilNext owners.');
    for (const [id, [source, creator, volume, min, max]] of Object.entries(desired)) {
      const body = bodies.get(id);
      check(body?.ref.sourceFeatureId === source && body.createdByFeatureId === creator,
        'Unexpected exact UntilNext ref/creator for ' + id);
      check(Number.isFinite(body.volume) && Math.abs(body.volume - volume) < 1e-5,
        'Unexpected independently derived UntilNext volume for ' + id);
      for (const [side, expectedSide] of [['min', min], ['max', max]]) expectedSide.forEach((coordinate, index) =>
        check(Number.isFinite(body.bounds[side][index]) && Math.abs(body.bounds[side][index] - coordinate) < 1e-6,
          'Unexpected independent UntilNext bounds for ' + id));
    }
  }
  async function buildAfter(serial, key, method, scope = 'selected', rejected = false) {
    return waitFor('actual UntilNext worker ' + key + '/' + method + '/' + scope + (rejected ? '/rejection' : ''), async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Observed a real worker error.');
      const ids = fixtures[key].features.map(item => item.id).join('|');
      const record = state.builds.filter(item => {
        const feature = item.features.at(-1), operation = feature?.featurePattern;
        return item.serial > serial && item.features.map(value => value.id).join('|') === ids && item.response
          && operation?.mode === method && feature.source.geometryPattern === (method === 'geometry')
          && (method === 'geometry' || operation.scope === scope);
      }).at(-1);
      if (!record) return false;
      check(record.response.ok, record.response.error || 'UntilNext worker failed outside its feature boundary.');
      check(record.response.value.bodyCatalogActive, 'UntilNext worker did not use the real owned catalog.');
      assertDeclaration({ ...fixtures[key], features: record.features }, key, method, scope);
      const errors = record.response.value.featureErrors;
      if (rejected) check(errors.length === 1 && errors[0].id === original(key).id
        && errors[0].message.includes(INCOMPLETE), 'Expected actual whole-profile native UntilNext rejection.');
      else check(errors.length === 0, 'Unexpected UntilNext feature errors.');
      assertBodies(record, key, method, rejected);
      return record;
    });
  }
  function recordBuild(phase, record) {
    builds.push({ phase, requestId: record.id, serial: record.serial,
      featuresSha256: digest(canonical(record.features)),
      prefixSha256: digest(canonical(record.features.slice(0, -1))),
      bodies: record.response.value.bodies, featureErrors: record.response.value.featureErrors });
  }
  async function enterEditor(key, method, scope = 'selected') {
    await page(name => {
      const rows = [...document.querySelectorAll('.tree-row')].filter(row =>
        [...row.querySelectorAll('span')].some(span => span.textContent === name));
      if (rows.length !== 1) throw Error('Original UntilNext pattern row missing/ambiguous.');
      rows[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, original(key).name);
    await waitFor('UntilNext editor preserves ' + key + ' exact selected owner', () => page((method, scope, target) => {
      const select = document.querySelector('select[aria-label="Método de repetición de operaciones"]');
      const scopeSelect = document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]');
      const chosen = [...document.querySelectorAll('input[aria-label]')].filter(input =>
        input.getAttribute('aria-label') === 'Aplicar repetición a ' + target);
      return select?.value === method && !select.disabled
        && (method === 'geometry' || scopeSelect?.value === scope)
        && (scope === 'all' ? chosen.length === 0 : chosen.length === 1 && chosen[0].checked);
    }, method, scope, expectedTargetName(key)));
  }
  async function changePreview(key, selector, value, scope = 'selected', rejected = false) {
    const before = await observe();
    await page((selector, value) => {
      const select = document.querySelector(selector);
      if (!select || select.disabled || select.value === value) throw Error('Expected one editable UntilNext control change.');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    const preview = await buildAfter(before.serial, key, 'regenerate', scope, rejected);
    const samples = (await observe()).ui.filter(sample => sample.eventSerial > before.eventSerial
      && sample.eventSerial < preview.responseEventSerial && sample.method === 'regenerate' && sample.scope === scope);
    check(samples.some(sample => sample.applyDisabled === true) && samples.every(sample => sample.applyDisabled === true),
      'UntilNext Apply did not remain disabled before its actual worker preview response.');
    checks.push('UntilNext ' + key + '/' + scope + ' Apply disabled until actual preview response');
    if (rejected) {
      await waitFor('native whole-profile error visible and Apply disabled', () => page(message => {
        const apply = document.querySelector('button[title="Aceptar operación"]');
        return !!apply && apply.disabled && document.body.textContent.includes(message);
      }, INCOMPLETE));
    } else {
      await waitFor('fresh UntilNext ' + key + '/' + scope + ' preview enables Apply', () => page(scope => {
        const apply = document.querySelector('button[title="Aceptar operación"]');
        return !!apply && !apply.disabled
          && document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]')?.value === scope;
      }, scope));
    }
    return preview;
  }
  async function openOriginal(key, openCount, first = false) {
    const serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    if (first) {
      await waitFor('fresh isolated document asks to discard', () => page(() =>
        document.querySelectorAll('[role="dialog"][aria-labelledby="discard-title"]').length === 1));
      await page(() => {
        const button = document.querySelector('[role="dialog"][aria-labelledby="discard-title"] .primary-button');
        if (!button || button.disabled || button.textContent.trim() !== 'Continuar sin guardar') throw Error('Expected exact discard confirmation.');
        button.click();
      });
      await waitFor('fresh isolated discard dialog closes', () => page(() =>
        !document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    }
    const geometry = await buildAfter(serial, key, 'geometry');
    await waitFor('loaded original UntilNext ' + key + ' document', () => page(name =>
      document.querySelector('.document-title')?.textContent.includes(name), fixtures[key].name));
    check(dialogCounts().opens === openCount, 'Unexpected UntilNext original document open count.');
    recordBuild(key + '/geometry', geometry);
    return geometry;
  }
  async function applySaveReopen(key, scope, output, saveCount, openCount, label) {
    let serial = (await observe()).serial;
    await click(APPLY);
    await waitFor('React UntilNext ' + label + ' Apply leaves editor', () => page(() =>
      !document.querySelector('.property-manager')));
    const committed = await buildAfter(serial, key, 'regenerate', scope);
    recordBuild(label + '/committed', committed);
    await waitFor('committed UntilNext ' + label + ' autosave matches intent', async () => {
      const value = await page(() => localStorage.getItem('solidflow.autosave')); if (!value) return false;
      const document = JSON.parse(value); if (document.id !== fixtures[key].id
        || document.features.at(-1)?.featurePattern?.mode !== 'regenerate'
        || document.features.at(-1)?.featurePattern?.scope !== scope) return false;
      assertDeclaration(document, key, 'regenerate', scope); return true;
    });
    await menu('Guardar como…');
    await waitFor('real UntilNext ' + label + ' preload/IPC save', () => dialogCounts().saves === saveCount
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === saveCount);
    await waitFor('UntilNext ' + label + ' save marks document clean', () => page(name => {
      const title = document.querySelector('.document-title')?.textContent || '';
      return title.includes(name) && !title.includes('*');
    }, fixtures[key].name));
    const saved = JSON.parse(await fsp.readFile(output, 'utf8'));
    assertDeclaration(saved, key, 'regenerate', scope);
    serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await buildAfter(serial, key, 'regenerate', scope);
    check(canonical(reopened.features) === canonical(saved.features), 'Reopened UntilNext worker input differs from the actual saved file.');
    check(dialogCounts().opens === openCount && dialogCounts().saves === saveCount, 'Unexpected UntilNext save/reopen dialog counts.');
    recordBuild(label + '/reopened', reopened);
    savedDocuments.push({ case: label, savedPattern: saved.features.at(-1),
      savedContentSha256: digest(await fsp.readFile(output)), savedFeaturesSha256: digest(JSON.stringify(saved.features)) });
  }
  return async function workflow() {
    for (const key of ['cut', 'add', 'reject']) assertDeclaration(fixtures[key], key, 'geometry');
    await waitFor('initial renderer readiness', () => page(() => {
      const status = document.querySelector('.statusbar')?.textContent || '';
      return status.includes('Listo') && status.includes('Sólido') && document.querySelectorAll('canvas').length > 0
        && typeof window.solidflow?.openDocument === 'function'
        && typeof window.require === 'undefined' && typeof window.process === 'undefined';
    }), initialReadyMs);
    await openOriginal('cut', 1, true);
    await enterEditor('cut', 'geometry');
    recordBuild('cut/selected-preview', await changePreview('cut', METHOD, 'regenerate'));
    await applySaveReopen('cut', 'selected', outputs.cutSelected, 1, 2, 'cut/selected');
    await enterEditor('cut', 'regenerate');
    recordBuild('cut/all-preview', await changePreview('cut', SCOPE, 'all', 'all'));
    await applySaveReopen('cut', 'all', outputs.cutAll, 2, 3, 'cut/all');
    await openOriginal('add', 4);
    await enterEditor('add', 'geometry');
    recordBuild('add/selected-preview', await changePreview('add', METHOD, 'regenerate'));
    await applySaveReopen('add', 'selected', outputs.add, 3, 5, 'add/selected');
    await openOriginal('reject', 6);
    await enterEditor('reject', 'geometry');
    recordBuild('partial/rejected-preview', await changePreview('reject', METHOD, 'regenerate', 'selected', true));
    await assertOriginalGeometryAutosave('reject', 'partial/rejected-preview');
    const serial = (await observe()).serial;
    await click('button[title="Cancelar operación"]');
    await waitFor('rejected UntilNext edit cancels through React', () => page(() => !document.querySelector('.property-manager')));
    recordBuild('partial/cancelled-geometry', await buildAfter(serial, 'reject', 'geometry'));
    await assertOriginalGeometryAutosave('reject', 'partial/cancelled-geometry');
    check(new Set(builds.map(record => record.serial)).size === builds.length,
      'UntilNext workflow phases must observe distinct actual worker builds.');
    check(dialogCounts().opens === 6 && dialogCounts().saves === 3, 'Unexpected final UntilNext dialog counts.');
    check(canonical(ipc.map(event => event.channel)) === canonical([
      'document:open', 'document:save', 'document:open', 'document:save', 'document:open',
      'document:open', 'document:save', 'document:open', 'document:open',
    ]) && ipc.every(event => event.completed), 'UntilNext real IPC sequence did not complete exactly.');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length,
      'UntilNext workflow observed renderer/request/worker failure.');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200),
      'UntilNext real production worker/WASM loads were not observed.');
    const fixtureHashes = Object.fromEntries(await Promise.all(Object.entries(inputPaths).map(async ([key, file]) =>
      [key, digest(await fsp.readFile(file))])));
    checks.push({ originalFixtureHashes: fixtureHashes,
      independentBodyOracles: 'cut S1000-10pi; A geometry656-4pi/regenerated656-2pi; B800 unchanged; add S656+4pi/A geometry912+4pi/regenerated912+8pi; partial geometry440-16pi/3-2sqrt3/rejected440; Vtol1e-5/bounds1e-6',
      evidenceLimits: 'Actual worker volumes/bounds/refs and scripted React/preload/IPC only. No UI BRep/area/material-probe, human-pointer/native-dialog or installed-package claim.',
      workerBuilds: builds, savedDocuments });
  };
};
