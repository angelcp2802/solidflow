'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function patternCreateWorkflow(context) {
  const { expected, input, files, evaluate, observe, waitFor, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const records = [], interactions = [], exports = [];
  const evidence = { partPatternCreate: { records, interactions, exports,
    scope: 'Normal body-pattern creation, edit, Cancel, history, Save/Open and actual STEP copy placement/orientation',
    inputLimits: 'Actual CDP left presses/releases on contained hit-tested controls, including the original seed body catalogue. Native setters/events author visible fields. No canvas-pick, physical-typing, React state, body-reference or native-response injection claim.',
    featureLimits: 'One seed cube; linear X spacing8/count2 to3, circular global Z/360/count4 to3, mirror YZ to reference X2; no skipped instances, merge, second direction, feature-pattern scope, arbitrary axes or general mirror chirality',
    tolerances: { volumeMm3: 1e-5, planarMeshAreaMm2: 1e-5, boundsMm: 1e-6 } } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  async function reveal(selector, label) {
    await page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible pattern control required: ' + selector);
      matches[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector, label ?? null);
  }
  async function inspect(selector, label) {
    return page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1) return { count: matches.length, available: false };
      const element = matches[0], r = element.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left + parent.clientLeft); right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top + parent.clientTop); bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
        }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        clip: { left, top, right, bottom }, disabled: element.matches(':disabled'), hidden: !!element.closest('[hidden]'),
        hit: !!hit && (hit === element || element.contains(hit)),
        available: !element.matches(':disabled') && !element.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom
          && !!hit && (hit === element || element.contains(hit)) };
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label);
    let previous, since = 0;
    const target = await waitFor('stationary pattern control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Pattern control remains contained and hit-tested before pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after DOM reveal' });
  }
  async function change(selector, value) {
    value = String(value); await reveal(selector);
    await waitFor('one enabled visible pattern field ' + selector, async () => (await inspect(selector)).available)
      .catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector)); throw error; });
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
        || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || !hit || !(field === hit || field.contains(hit))) throw Error('One revealed current enabled pattern field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Current enabled pattern option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Visible field native setter/input or change event after reveal and hit test' });
    await waitFor('pattern field retains authored value', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function ready() {
    if (await page(() => [...document.querySelectorAll('.property-manager button.outline-button')]
      .some(button => button.textContent.trim() === 'Terminar selección de semillas'))) {
      await press('.property-manager button.outline-button', 'Terminar selección de semillas');
    }
    await waitFor('current pattern preview is acceptable', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  async function committed(features, phase) {
    const snapshot = await waitFor('committed pattern recovery ' + phase, async () => {
      const current = await page(() => {
        const value = localStorage.getItem('solidflow.autosave');
        if (!value || document.querySelector('.property-manager') || !document.querySelector('.statusbar')?.textContent.includes('Listo')) return false;
        const history = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
          const matches = [...document.querySelectorAll('button')].filter(element => element.title === title);
          if (matches.length !== 1) throw Error('One current part history command required');
          return { title, disabled: matches[0].disabled };
        });
        return { recovery: value, history, title: document.querySelector('.document-title')?.textContent };
      });
      return current && canonical(JSON.parse(current.recovery).features) === canonical(features) ? current : false;
    });
    records.push({ phase: phase + '-committed', recoverySha256: digest(snapshot.recovery), history: snapshot.history });
    return snapshot;
  }
  const scope = { bodyId: 'pattern-seed-body', sourceFeatureId: 'pattern-create-cube' };
  const fields = { linear: 'input[aria-label="Instancias en dirección 1"]', circular: 'input[aria-label="Instancias circulares"]', mirror: 'select[aria-label="Plano de simetría"]' };
  const types = { linear: 'linearPattern', circular: 'circularPattern', mirror: 'mirror' };
  const sqrt3 = Math.sqrt(3);
  let sourceBody;
  function boxes(state) {
    const seed = { min: [4, -2, 0], max: [8, 2, 4] };
    if (state === 'source') return [seed];
    if (state.startsWith('linear')) return [seed, { min: [12, -2, 0], max: [16, 2, 4] },
      ...(state === 'linear-3' ? [{ min: [20, -2, 0], max: [24, 2, 4] }] : [])];
    if (state === 'circular-4') return [seed, { min: [-2, 4, 0], max: [2, 8, 4] },
      { min: [-8, -2, 0], max: [-4, 2, 4] }, { min: [-2, -8, 0], max: [2, -4, 4] }];
    if (state === 'circular-3') return [seed,
      { min: [-4 - sqrt3, 2 * sqrt3 - 1, 0], max: [-2 + sqrt3, 4 * sqrt3 + 1, 4] },
      { min: [-4 - sqrt3, -4 * sqrt3 - 1, 0], max: [-2 + sqrt3, 1 - 2 * sqrt3, 4] }];
    return [seed, state === 'mirror-0' ? { min: [-8, -2, 0], max: [-4, 2, 4] } : { min: [-4, -2, 0], max: [0, 2, 4] }];
  }
  function declaration(record, state) {
    const feature = record.features.at(-1), kind = state.split('-')[0];
    check(record.features.length === 4 && feature.type === types[kind] && feature.baseFeatureId === scope.sourceFeatureId && !feature.suppressed
      && canonical(feature.source) === canonical({ mode: 'bodies', scope: 'current', bodies: [scope] })
      && feature.bodyPattern?.mode === 'new', 'Exact explicit seed, upstream base and new-body pattern mode');
    if (kind === 'linear') check(canonical(feature.first) === canonical({ direction: [1, 0, 0], spacing: 8, count: Number(state.slice(-1)) })
      && feature.second === null && !feature.secondSeedOnly && !feature.skipped.length, 'Exact one-direction linear declaration');
    else if (kind === 'circular') check(canonical(feature.axis) === canonical({ origin: [0, 0, 0], direction: [0, 0, 1] })
      && feature.count === Number(state.slice(-1)) && feature.angle === 360 && feature.equalSpacing && !feature.reversed && !feature.skipped.length,
    'Exact full-turn global-Z circular declaration');
    else check(!feature.mergeBodies && canonical(feature.support) === canonical(state === 'mirror-0'
      ? { kind: 'principal', plane: 'YZ' } : { kind: 'plane', planeId: 'pattern-plane-x2' }), 'Exact selected mirror support');
    const active = feature.bodyPattern.instances.filter(slot => !slot.retired), count = boxes(state).length - 1;
    const addresses = kind === 'linear' ? Array.from({ length: count }, (_, index) => (index + 1) + ',0')
      : kind === 'circular' ? Array.from({ length: count }, (_, index) => String(index + 1)) : ['mirror'];
    check(active.length === count && active.every((slot, index) => slot.seedBodyId === scope.bodyId && slot.address === addresses[index])
      && new Set(feature.bodyPattern.instances.map(slot => slot.bodyId)).size === feature.bodyPattern.instances.length,
    'Exact active copy addresses and unique persistent body ledger');
    return feature;
  }
  function geometry(record, state, phase) {
    check(record.response.ok, record.response.error || 'Native pattern build failed');
    check(canonical(record.features.slice(0, 3)) === canonical(expected.features), 'All original cube and plane declarations remain exact');
    const result = record.response.value, wanted = boxes(state);
    const expectedWarnings = wanted.length > 1 ? ['La pieza contiene ' + wanted.length + ' sólidos separados.'] : [];
    check(result.bodyCatalogActive && result.bodies?.length === wanted.length && !result.featureErrors.length && canonical(result.warnings) === canonical(expectedWarnings),
      'Exact healthy native pattern body count: ' + JSON.stringify({ phase, count: result.bodies?.length, wanted: wanted.length, featureErrors: result.featureErrors, warnings: result.warnings, feature: record.features.at(-1) }));
    const feature = state === 'source' ? null : declaration(record, state);
    const seed = result.bodies.find(body => body.ref.bodyId === scope.bodyId);
    check(seed && canonical(seed.ref) === canonical(scope) && seed.createdByFeatureId === scope.sourceFeatureId, 'Pattern retains original seed identity and producer');
    if (sourceBody) check(canonical(seed) === canonical(sourceBody), 'Every pattern and history state retains the exact original seed native geometry/references');
    else sourceBody = seed;
    const active = feature?.bodyPattern.instances.filter(slot => !slot.retired) ?? [];
    const ordered = [seed, ...active.map(slot => {
      const body = result.bodies.find(body => body.ref.bodyId === slot.bodyId);
      check(body && body.ref.sourceFeatureId === feature.id && body.createdByFeatureId === feature.id, 'Each ledger output has exact native creator and producer'); return body;
    })];
    for (const [index, body] of ordered.entries()) {
      near(body.volume, 64, 1e-5, 'Independent 4 mm cube volume'); near(body.meshAreaMm2, 96, 1e-5, 'Independent planar cube mesh area');
      for (const side of ['min', 'max']) wanted[index][side].forEach((value, axis) => near(body.bounds[side][axis], value, 1e-6, 'Literal positioned copy bounds'));
    }
    near(result.bodies.reduce((sum, body) => sum + body.volume, 0), 64 * wanted.length, 1e-5, 'Independent complete pattern volume');
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: ordered.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, area: body.meshAreaMm2, bounds: body.bounds })) });
    return record;
  }
  async function response(serial, predicate, phase) {
    return waitFor('fresh native pattern response ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No pattern worker transport errors');
      return state.builds.filter(record => record.serial > serial && predicate(record.features) && record.response).at(-1);
    });
  }
  async function built(serial, predicate, state, phase) { return geometry(await response(serial, predicate, phase), state, phase); }
  async function sourceReady() {
    await waitFor('current pattern seed controls available', () => page(() => {
      const field = document.querySelector('select[aria-label="Estado de los cuerpos semilla"]');
      return !!field && !field.disabled && document.querySelectorAll('[aria-label="Cuerpos semilla"] input:checked:not(:disabled)').length === 1;
    }));
  }
  async function newOperation(kind) {
    if (await page(() => document.querySelector('.part-body-catalog-toggle')?.getAttribute('aria-expanded') === 'false')) await press('.part-body-catalog-toggle');
    const selected = await page(() => {
      const inputs = document.querySelectorAll('.part-body-catalog .body-row input');
      if (inputs.length !== 1) throw Error('One current original seed checkbox required'); return inputs[0].checked;
    });
    if (!selected) await press('.part-body-catalog .body-row input');
    await waitFor('original seed selected through catalogue', () => page(scope => document.querySelector('.viewport-canvas')?.getAttribute('data-part-selected-bodies') === JSON.stringify([scope]), scope));
    await press('.ribbon-tabs button', 'Operaciones');
    await press('button.command[title="' + ({ linear: 'Matriz lineal', circular: 'Matriz circular', mirror: 'Simetría' })[kind] + '"]');
    await sourceReady();
    check(await page(() => document.querySelector('select[aria-label="Tipo de repetición en cuerpos"]')?.value === 'bodies'
      && document.querySelector('select[aria-label="Resultado de las copias"]')?.value === 'new'), 'Normal ribbon chooses explicit new-body pattern');
  }
  async function accept(record, state, phase) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const accepted = await built(serial, features => canonical(features) === canonical(record.features), state, phase);
    return { record: accepted, snapshot: await committed(accepted.features, phase), state };
  }
  async function cancel(stage, phase) {
    const serial = (await observe()).serial; await press(CANCEL);
    const restored = await built(serial, features => canonical(features) === canonical(stage.record.features), stage.state, phase);
    check(canonical(await committed(restored.features, phase)) === canonical(stage.snapshot), 'Pattern Cancel restores exact recovery/history/dirty title');
    check(canonical(restored.response.value.bodies) === canonical(stage.record.response.value.bodies), 'Pattern Cancel restores exact native body collection and references');
  }
  async function edit(feature, selector, value) {
    await press('.tree-row[data-feature-id="' + feature.id + '"]:not([data-parent-feature-id])');
    await press('.selection-tools button[title="Editar operación"]'); await sourceReady();
    check(await page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)), 'Existing pattern retains exact authored parameter');
  }
  async function history(stage, direction, phase) {
    const serial = (await observe()).serial; await press('button[title="' + (direction === 'undo' ? 'Deshacer (Ctrl+Z)' : 'Rehacer (Ctrl+Y)') + '"]');
    const record = await built(serial, features => canonical(features) === canonical(stage.record.features), stage.state, phase);
    check((await committed(record.features, phase)).recovery === stage.snapshot.recovery, 'One history action restores exact stored pattern transaction');
  }
  async function openOriginal(first, phase) {
    const serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    if (first) await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const record = await built(serial, features => canonical(features) === canonical(expected.features), 'source', phase);
    return { record, snapshot: await committed(record.features, phase), state: 'source' };
  }
  async function saveOpenExport(final, kind, ordinal) {
    await file('Guardar como…');
    await waitFor('native pattern Save As completes', async () => dialogCounts().saves === ordinal
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === ordinal
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(files[kind]), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.record.features), 'Actual saved pattern retains exact copy IDs, retirement ledger and parameters');
    const serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, features => canonical(features) === canonical(saved.features), final.state, 'saved-' + kind + '-reopened');
    const restored = await committed(reopened.features, 'saved-' + kind + '-reopened');
    check(canonical(JSON.parse(restored.recovery)) === canonical(saved) && restored.history.every(button => button.disabled)
      && canonical(reopened.response.value.bodies) === canonical(final.record.response.value.bodies), 'Reopened pattern rebuild/recovery/history/physical body references agree');
    await file('Exportar STEP');
    await waitFor('actual pattern STEP export completes', () => dialogCounts().geometryExports === ordinal
      && ipc.filter(event => event.channel === 'document:export' && event.completed).length === ordinal);
    const step = await fsp.readFile(files.steps[kind]);
    exports.push({ kind, ...await require('./desktop-part-pattern-create-step.cjs')(step, kind, check), savedSha256: digest(bytes), stepSha256: digest(step) });
    check(await recovery() === restored.recovery && (await fsp.readFile(files[kind])).equals(bytes), 'STEP export preserves exact pattern document and recovery');
  }
  async function revise(created, kind, initial, value, state) {
    const feature = created.record.features.at(-1), selector = fields[kind];
    await edit(feature, selector, initial); let serial = (await observe()).serial; await change(selector, value);
    const predicate = features => features.at(-1).id === feature.id && (kind === 'linear' ? features.at(-1).first.count === value
      : kind === 'circular' ? features.at(-1).count === value : features.at(-1).support.planeId === 'pattern-plane-x2');
    const first = await built(serial, predicate, state, 'existing-' + kind + '-edit-cancel-preview');
    await ready(); await cancel(created, 'existing-' + kind + '-edit-cancel');
    await edit(feature, selector, initial); serial = (await observe()).serial; await change(selector, value);
    const retry = await built(serial, predicate, state, 'existing-' + kind + '-edit-retry');
    if (kind === 'linear') {
      const firstFeature = first.features.at(-1), retryFeature = retry.features.at(-1);
      const withoutLedger = feature => { const value = structuredClone(feature); delete value.bodyPattern; return value; };
      check(canonical(withoutLedger(firstFeature)) === canonical(withoutLedger(retryFeature)), 'Cancelled growth edit retains exact requested declaration');
      const newSlot = feature => feature.bodyPattern.instances.find(slot => !slot.retired && slot.address === '2,0');
      check(newSlot(firstFeature)?.bodyId && newSlot(retryFeature)?.bodyId && newSlot(firstFeature).bodyId !== newSlot(retryFeature).bodyId,
        'Cancelled uncommitted new copy ID is replaced by a fresh actual retry allocation');
    } else check(canonical(first.features) === canonical(retry.features), 'Cancelled edit leaves surviving copy identities deterministic');
    const before = feature.bodyPattern.instances.filter(slot => !slot.retired), after = retry.features.at(-1).bodyPattern.instances;
    check(before.every(slot => after.some(current => current.bodyId === slot.bodyId && current.address === slot.address)), 'Editing retains all existing slot identities, including retired positions');
    for (const old of before.filter(slot => state !== 'circular-3' || slot.address !== '3')) check(after.some(slot => !slot.retired && canonical(slot) === canonical(old)), 'Surviving address keeps exact original copy body ID');
    return accept(retry, state, 'edited-' + kind + '-accepted');
  }
  return async () => {
    await waitFor('production pattern file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const originalBytes = await fsp.readFile(input), original = await openOriginal(true, 'linear-original-seed');
    await newOperation('linear'); await change('input[aria-label="Separación en dirección 1"]', 8);
    let serial = (await observe()).serial; await change(fields.linear, 2);
    const first = await built(serial, features => features.at(-1).type === 'linearPattern' && features.at(-1).first.count === 2 && features.at(-1).first.spacing === 8, 'linear-2', 'linear-count-2-preview');
    serial = (await observe()).serial; await change(fields.linear, 0);
    const invalid = await waitFor('invalid linear count visibly rejected', () => page(selector => {
      const alert = document.querySelector('.error-banner[role="alert"]');
      return document.querySelector(selector)?.disabled && alert?.textContent.trim() ? alert.textContent.trim() : false;
    }, APPLY));
    check(await recovery() === original.snapshot.recovery, 'Invalid instance count preserves original recovery');
    records.push({ phase: 'invalid-linear-count', visibleError: invalid, serialBefore: serial, limits: 'Visible UI/declaration rejection; native execution not required or claimed' });
    await cancel(original, 'direct-invalid-linear-cancel');
    await newOperation('linear'); await change('input[aria-label="Separación en dirección 1"]', 8); serial = (await observe()).serial; await change(fields.linear, 2);
    const retry = await built(serial, features => features.at(-1).type === 'linearPattern' && features.at(-1).first.count === 2 && features.at(-1).first.spacing === 8, 'linear-2', 'linear-reentry');
    check(retry.features.at(-1).id !== first.features.at(-1).id, 'Cancelled creation reentry allocates a fresh actual pattern identity');
    const linear = await accept(retry, 'linear-2', 'linear-count-2-accepted'), linearFinal = await revise(linear, 'linear', 2, 3, 'linear-3');
    await history(linear, 'undo', 'undo-linear-count'); await history(original, 'undo', 'undo-linear-create');
    await history(linear, 'redo', 'redo-linear-create'); await history(linearFinal, 'redo', 'redo-linear-count'); await saveOpenExport(linearFinal, 'linear', 1);
    const circularOriginal = await openOriginal(false, 'circular-original-seed'); await newOperation('circular'); serial = (await observe()).serial; await change(fields.circular, 4);
    const circle = await built(serial, features => features.at(-1).type === 'circularPattern' && features.at(-1).count === 4, 'circular-4', 'circular-count-4-preview');
    const circular = await accept(circle, 'circular-4', 'circular-count-4-accepted'), circularFinal = await revise(circular, 'circular', 4, 3, 'circular-3');
    check(circularFinal.record.features.at(-1).bodyPattern.instances.some(slot => slot.address === '3' && slot.retired), 'Reduced circular count durably retires the removed copy ID');
    await history(circular, 'undo', 'undo-circular-count'); await history(circularOriginal, 'undo', 'undo-circular-create');
    await history(circular, 'redo', 'redo-circular-create'); await history(circularFinal, 'redo', 'redo-circular-count'); await saveOpenExport(circularFinal, 'circular', 2);
    const mirrorOriginal = await openOriginal(false, 'mirror-original-seed'); serial = (await observe()).serial; await newOperation('mirror');
    const mirrorPreview = await built(serial, features => features.at(-1).type === 'mirror' && features.at(-1).support.kind === 'principal' && features.at(-1).support.plane === 'YZ', 'mirror-0', 'mirror-YZ-preview');
    const mirror = await accept(mirrorPreview, 'mirror-0', 'mirror-YZ-accepted'), mirrorFinal = await revise(mirror, 'mirror', 'principal:YZ', 'plane:pattern-plane-x2', 'mirror-2');
    await history(mirror, 'undo', 'undo-mirror-support'); await history(mirrorOriginal, 'undo', 'undo-mirror-create');
    await history(mirror, 'redo', 'redo-mirror-create'); await history(mirrorFinal, 'redo', 'redo-mirror-support'); await saveOpenExport(mirrorFinal, 'mirror', 3);
    check((await fsp.readFile(input)).equals(originalBytes), 'All three pattern workflows preserve original fixture bytes');
    evidence.partPatternCreate.originalSha256 = digest(originalBytes);
    check(dialogCounts().opens === 6 && dialogCounts().saves === 3 && dialogCounts().geometryExports === 3, 'Exactly three original Opens, three saved Opens, three Save As and three STEP exports');
    check(ipc.filter(event => event.channel === 'document:open' && event.completed).length === 6, 'All six Opens use production native bridge');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Actual production pattern worker and WASM loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer, asset or pattern transport errors');
  };
};
