'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// This flow changes documents only through production controls. Worker and DOM
// evaluation are read-only except for ordinary form input/change events and
// browser focus/scroll. Native face keys come from the actual current scene.
module.exports = function embeddedPartEditWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const { expected, input, output, partCopyOutput, evaluate, observe, waitFor, pointer, key, checks, ipc, consoleErrors, failedRequests,
    check, canonical, digest, initialReadyMs, dialogCounts, assemblyNavigation: navigation } = context;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(...JSON.parse(' + quote(JSON.stringify(args)) + '))');
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const PANEL = '[role="region"][aria-label="Actualizar origen compartido"]';
  const SOLVE = 'button[aria-label="Resolver actualización de pieza"]', CANCEL_UPDATE = 'button[aria-label="Cancelar actualización de pieza"]';
  const PART = '.assembly-embedded-part-editor .app-shell';
  const RETURN = PART + ' [aria-label="Edición de pieza en el ensamblaje"] button.primary-button';
  const DISCARD = PART + ' [aria-label="Edición de pieza en el ensamblaje"] button.outline-button';
  const DISCARD_DIALOG = PART + ' [role="dialog"][aria-labelledby="discard-title"]';
  const PART_APPLY = PART + ' button[title="Aceptar operación"]';
  const WIDTH = PART + ' input[aria-label="Anchura"]', CENTER = PART + ' input[aria-label="Centro X"]';
  const PROFILE = PART + ' .tree-row[data-feature-id="embedded-profile"]';
  const SOLID = PART + ' .tree-row[data-feature-id="embedded-solid"]:not([data-parent-feature-id])';
  const phases = [], interactions = [], boundaries = [];
  const evidence = { embeddedPartEdit: { phases, interactions, boundaries } }; checks.push(evidence);
  let parent, parentRecovery, parentFileBytes, mateId, lastReviewSerial = 0;
  const near = (a, b, t, label) => check(Number.isFinite(a) && Math.abs(a - b) <= t,
    label + '; actual=' + a + ', expected=' + b + ', tolerance=' + t);
  const vector = (a, b, t, label) => { check(Array.isArray(a) && a.length === b.length, label + ' shape'); a.forEach((v, i) => near(v, b[i], t, label + '[' + i + ']')); };
  const rawRecovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const serial = async () => (await observe.counters()).serial;
  const parentIdle = label => waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));

  async function inspect(selector, text = null, disabled = false) {
    return page((selector, text, disabled) => {
      const elements = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (elements.length !== 1) return { count: elements.length };
      const e = elements[0], r = e.getBoundingClientRect(), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { x: r.x, y: r.y, width: r.width, height: r.height },
        available: (disabled || !e.disabled) && !e.closest('[hidden],[inert]') && e.checkVisibility()
          && r.width > 0 && r.height > 0 && r.left >= left && r.right <= right && r.top >= top && r.bottom <= bottom
          && !!hit && (hit === e || e.contains(hit)) };
    }, selector, text, disabled);
  }
  async function prepare(selector, text = null) {
    const owner = await page(selector => {
      const e = document.querySelector(selector);
      return !!e?.closest('.assembly-app') && !e.closest('.assembly-app').hidden;
    }, selector);
    if (owner) await navigation.reveal(selector, text ?? '');
    await page((selector, text) => {
      const elements = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (elements.length !== 1 || elements[0].closest('[hidden],[inert]')) throw Error('One visible original control required: ' + selector);
      elements[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    let previous, since = 0;
    return waitFor('stationary embedded-edit control ' + (text ?? selector), async () => {
      const state = await inspect(selector, text), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); }
      return state.available && Date.now() - since >= 120 ? state : false;
    });
  }
  async function press(selector, text = null, double = false) {
    const target = await prepare(selector, text);
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, text)) === canonical(target), 'Current hit-tested control before pointer press');
    for (const count of double ? [1, 2] : [1]) {
      await pointer('mousePressed', target.point, 1, count); await pointer('mouseReleased', target.point, 0, count);
    }
    interactions.push({ kind: double ? 'CDP double click' : 'CDP click', selector, text, point: target.point });
  }
  const button = (text, scope = '.assembly-app') => press(scope + ' button', text);
  async function control(selector, value) {
    await prepare(selector);
    await page((selector, value) => {
      const e = document.querySelector(selector);
      if (!e || e.disabled || !e.checkVisibility() || e.closest('[hidden],[inert]')) throw Error('Actual editable input required');
      const prototype = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Exact current option required');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('actual input retained ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
    interactions.push({ kind: 'production field input/change', selector, value });
  }
  async function response(after, action, rejected = false) {
    const result = await waitFor('actual worker ' + action, async () => {
      const state = await observe.assemblyResponseAfter(after, action);
      check(!state.workerErrors.length, 'No native worker error');
      check(state.completedCount <= 1, 'Exactly one completed requested action: ' + action);
      if (!state.record) return false;
      check(state.record.response.ok === !rejected, state.record.response.error || 'Expected actual native result');
      return state.record;
    });
    phases.push({ action, serial: result.serial, requestHasToken: result.hasToken ?? false,
      currentSha256: result.current ? digest(canonical(result.current)) : null, response: result.response });
    return result;
  }
  async function recovery(doc, label) {
    await waitFor(label + ' exact committed recovery', async () => canonical(JSON.parse(await rawRecovery())) === canonical(doc));
  }
  async function unchanged(label) {
    check(await rawRecovery() === parentRecovery, label + ' retains byte-exact parent recovery');
    if (parentFileBytes) check((await fs.readFile(output)).equals(parentFileBytes), label + ' retains byte-exact parent file');
    const state = await observe();
    check(!state.workerErrors.length, 'No worker errors while parent suspended');
    const updates = state.assemblies.filter(x => x.serial > lastReviewSerial && ['apply-assembly', 'build-assembly'].includes(x.action));
    check(updates.length === 0, label + ' performs no committed-parent native action');
    boundaries.push({ phase: label, recoverySha256: digest(parentRecovery), serial: state.serial });
  }
  function body(scene, id) {
    const rows = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id]));
    check(rows.length === 1, 'Unique current native body for ' + id); return rows[0];
  }
  function top(scene, id) {
    const rows = body(scene, id).faces.filter(f => f.support?.kind === 'plane' && Math.abs(f.support.point[2] - 4) < 1e-8 && f.support.normal[2] > .999);
    check(rows.length === 1, 'Unique actual material top for ' + id); return rows[0];
  }
  const faceRef = f => ({ kind: 'face', ...f.selection, support: 'plane' });
  const faceKey = f => JSON.stringify([JSON.stringify([f.selection.component.occurrencePath, f.selection.component.definition.id, f.selection.component.definition.revision]),
    f.selection.body ? [f.selection.body.bodyId, f.selection.body.sourceFeatureId] : null, f.selection.face.sourceFeatureId, f.selection.face.key]);
  function geometry(scene, updated, revision = 'r0') {
    check(scene?.kind === 'assembly-scene' && scene.prototypeCount === 1 && scene.solidCount === 2 && scene.bodies.length === 2 && !scene.warnings.length,
      'Two current native solids share exactly one prototype without native warnings');
    near(scene.volume, updated ? 72 : 48, 1e-5, 'Independent total volume mm3');
    near(scene.area, updated ? 132 : 104, 1e-5, 'Independent total area mm2');
    vector(scene.bounds.min, [0, 0, 0], 1e-6, 'Independent assembly lower bounds');
    vector(scene.bounds.max, [updated ? 3 : 2, 3, 14], 1e-6, 'Independent assembly upper bounds');
    for (const [id, z] of [['base', 0], ['moving', 10]]) {
      const b = body(scene, id);
      check(b.solidCount === 1 && canonical(b.body) === canonical({ bodyId: 'embedded-body', sourceFeatureId: 'embedded-solid' })
        && canonical(b.component.definition) === canonical({ id: 'embedded-edit-prism', revision }), 'Stable exact native source/body identity ' + id);
      near(b.volume, updated ? 36 : 24, 1e-5, id + ' independent volume'); near(b.area, updated ? 66 : 52, 1e-5, id + ' independent area');
      vector(b.worldPose.translation, [0, 0, z], 1e-6, id + ' independent placement');
      const q = b.worldPose.rotation, sign = q[3] < 0 ? -1 : 1;
      vector(q.map(v => sign * v), [0, 0, 0, 1], 1e-8, id + ' physical identity rotation');
      vector(b.bounds.min, [0, 0, z], 1e-6, id + ' lower'); vector(b.bounds.max, [updated ? 3 : 2, 3, z + 4], 1e-6, id + ' upper');
    }
  }
  function signedTopSeparation(scene) {
    const a = top(scene, 'base').worldSupport, b = top(scene, 'moving').worldSupport;
    check(a?.kind === 'plane' && b?.kind === 'plane', 'Actual native world planes required');
    vector(a.normal, [0, 0, 1], 1e-8, 'Independent base top normal'); vector(b.normal, [0, 0, 1], 1e-8, 'Independent moving top normal');
    const q = b.normal.reduce((sum, v, i) => sum + v * (a.point[i] - b.point[i]), 0);
    near(q, -10, 1e-6, 'Verified first-minus-second signed top coordinate'); return q;
  }
  function solved(event, updated, revision = 'r0') {
    const v = event.response.value;
    check(v.status === 'ready' && v.hasToken && v.scopes.length === 1 && !v.scopes[0].temporaryAnchor
      && v.scopes[0].result.rank === 6 && v.scopes[0].result.localDOF === 0, 'Fresh native rank6/DOF0 preview with private Apply authority');
    check(v.checks.length === 2 && v.checks.every(c => c.satisfied && c.lengthResidual <= c.lengthTolerance && c.angleResidual <= c.angleTolerance),
      'Both actual independent native mate checks satisfy their reported budgets');
    geometry(v.scene, updated, revision); signedTopSeparation(v.scene); return v;
  }
  async function apply(event) {
    await parentIdle('native preview settled');
    await waitFor('authenticated Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await serial(); await press(APPLY); const result = await response(before, 'apply-assembly');
    check(result.hasToken && result.response.value.kind === 'assembly-applied', 'Apply consumes an actual private worker capability');
    await parentIdle('Apply settled'); await recovery(result.response.value.document, 'Apply'); return result;
  }
  async function selectMoving() {
    await navigation.panel('components');
    await press('[data-assembly-tree-path=\'["moving"]\']');
    await navigation.panel('properties');
    await waitFor('exact selected shared occurrence', () => page(() => document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'moving'));
  }
  async function enter(width = 2) {
    await selectMoving(); const before = await serial(); await press('button[aria-label="Editar pieza del componente"]');
    await waitFor('embedded editor active and parent inert', () => page(part => {
      const p = document.querySelector(part), a = document.querySelector('.assembly-app');
      return !!p && p.checkVisibility() && !!a?.hidden && a.inert && a.getAttribute('aria-hidden') === 'true';
    }, PART));
    await partReady(before, width, 'initial embedded activation'); await unchanged('First embedded render');
  }
  async function partReady(after, width, label) {
    const record = await waitFor(label + ' healthy actual part build', async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No actual part worker errors');
      const matches = state.builds.filter(b => b.serial > after && b.features.length === 2
        && b.features[0].profile?.width === width && b.features[0].profile?.center?.[0] === width / 2 && b.response);
      const row = matches.at(-1); if (!row) return false;
      check(row.response.ok && row.response.value.featureErrors.length === 0 && !row.response.value.warnings.length, 'Actual embedded build succeeds without feature errors');
      const bodies = row.response.value.bodies;
      check(row.response.value.bodyCatalogActive && bodies?.length === 1 && bodies[0].ref.bodyId === 'embedded-body'
        && bodies[0].ref.sourceFeatureId === 'embedded-solid', 'Exact explicit body in actual part build');
      near(bodies[0].volume, width * 3 * 4, 1e-5, 'Independent local part volume');
      vector(bodies[0].bounds.min, [0, 0, 0], 1e-6, 'Local lower'); vector(bodies[0].bounds.max, [width, 3, 4], 1e-6, 'Local upper'); return row;
    });
    await waitFor(label + ' current activation Return enabled', () => page(selector => document.querySelector(selector)?.disabled === false, RETURN));
    phases.push({ phase: label, serial: record.serial, features: record.features, native: record.response.value }); return record;
  }
  async function bodyFocus() {
    await page(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    check(await page(() => document.activeElement === document.body), 'Body owns physical shortcuts');
  }
  async function keyboard(combo, label) {
    await key(combo); interactions.push({ kind: 'CDP keyboard', combo, phase: label });
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    await unchanged(label);
  }
  async function closeGuard(blocked, label) {
    const state = await page(() => {
      const event = new Event('beforeunload', { cancelable: true });
      const allowed = window.dispatchEvent(event);
      return { allowed, prevented: event.defaultPrevented };
    });
    check(state.prevented === blocked && state.allowed === !blocked, label + ' synthetic beforeunload guard');
    boundaries.push({ phase: label, syntheticBeforeUnload: state });
  }
  async function cancelDiscard(escape) {
    await press(DISCARD);
    await waitFor('embedded discard confirmation with safe default', () => page(dialog => {
      const e = document.querySelector(dialog), cancel = e?.querySelector('button.outline-button');
      return !!e?.checkVisibility() && document.activeElement === cancel;
    }, DISCARD_DIALOG));
    if (escape) await key('Escape'); else await press(DISCARD_DIALOG + ' button.outline-button');
    await waitFor('discard cancellation retains current ready editor', () => page((dialog, returning) =>
      !document.querySelector(dialog) && document.querySelector(returning)?.disabled === false, DISCARD_DIALOG, RETURN));
    await unchanged(escape ? 'Escape cancels discard' : 'Cancel cancels discard');
    await closeGuard(true, escape ? 'Escape retains unapplied piece' : 'Cancel retains unapplied piece');
  }
  async function choose(slot, face) {
    await press('button[aria-label="Referencia ' + slot + ' de la relación"]');
    await control('select[aria-label="Cara de referencia"]', faceKey(face));
    await button('Usar cara en referencia ' + slot);
  }
  async function review() {
    const before = await serial(); await press(RETURN); const event = await response(before, 'review-assembly-part-update'), v = event.response.value;
    check(v.kind === 'assembly-source-review' && !v.hasToken && canonical(event.current) === canonical(parent)
      && canonical(event.source) === canonical({ id: 'embedded-edit-prism', revision: 'r0' }) && !Object.hasOwn(event, 'sourceLink'),
      'Return requests existing manual source review against live committed parent without file grants');
    check(v.occurrences.length === 2 && v.endpoints.filter(e => e.status === 'needs-repair').length === 2
      && v.endpoints.filter(e => e.status === 'needs-repair').every(e => e.locator.mateId === mateId), 'Both shared uses and two material faces require review');
    geometry(v.scene, true, event.revision); signedTopSeparation(v.scene);
    await waitFor('existing source review editable and part hidden', () => page((panel, part) => {
      const p = document.querySelector(panel); return !!p && p.getAttribute('aria-busy') === 'false'
        && !document.querySelector(part)?.checkVisibility() && document.querySelector('.assembly-app')?.hidden === false;
    }, PANEL, PART));
    check(await page(sel => document.querySelector(sel)?.disabled === true, APPLY), 'Review grants no Apply');
    await unchanged('Source review before repair');
    // The complete real observer history proves no standalone part producer was
    // posted after this review (such a build would dispose its worker stage).
    check(!(await observe()).builds.some(b => b.serial > event.serial), 'No late part build destroys the retained review');
    return event;
  }
  async function repair(event) {
    for (const endpoint of event.response.value.endpoints.filter(e => e.status === 'needs-repair')) {
      const owner = endpoint.endpoint.component.occurrencePath[0], selected = faceRef(top(event.response.value.scene, owner));
      const label = endpoint.locator.mateId + ' ' + endpoint.locator.side;
      check(selected.component.occurrencePath.length === 1 && ['base', 'moving'].includes(owner), 'Exact repair remains under its original occurrence owner');
      await control('select[aria-label="Cara de reparación ' + label + '"]', JSON.stringify(selected));
      await press('button[aria-label="Reparar referencia ' + label + '"]');
      await waitFor('manual material-face repair committed ' + label, () => page((mateId, side, panel) => {
        const fields = [...document.querySelectorAll(panel + ' fieldset[data-assembly-endpoint]')].filter(e => {
          const k = JSON.parse(e.getAttribute('data-assembly-endpoint')); return k[2] === mateId && k[3] === side;
        }); return fields.length === 1 && fields[0].getAttribute('data-endpoint-status') === 'manual-repair';
      }, endpoint.locator.mateId, endpoint.locator.side, PANEL));
    }
  }
  function intent(doc, revision) {
    check(doc.id === parent.id && doc.revision === parent.revision && doc.occurrences.length === 2 && doc.mates.length === 2, 'Parent identities and inventory preserved');
    for (const occurrence of doc.occurrences) {
      const old = parent.occurrences.find(o => o.id === occurrence.id);
      check(canonical({ ...occurrence, definition: undefined }) === canonical({ ...old, definition: undefined })
        && canonical(occurrence.definition) === canonical({ id: 'embedded-edit-prism', revision }), 'Both exact-source uses advance with IDs/poses/flags preserved');
    }
    const old = parent.definitions[0], historical = doc.definitions.find(d => d.id === old.id && d.revision === old.revision);
    check(canonical(historical) === canonical(old), 'Full historical embedded source remains unchanged');
    const part = doc.definitions.find(d => d.id === old.id && d.revision === revision);
    check(part?.kind === 'part' && !Object.hasOwn(part, 'sourceLink') && part.document.id === old.document.id
      && canonical(part.document.features.map(f => [f.id, f.type])) === canonical(old.document.features.map(f => [f.id, f.type]))
      && part.document.features[0].profile.width === 3 && canonical(part.document.features[0].profile.center) === '[1.5,1.5]'
      && canonical(part.document.features[1]) === canonical(old.document.features[1]), 'Only accepted profile geometry advances in a new local revision');
    const axis = doc.mates.find(m => m.id === 'embedded-root-z'), originalAxis = parent.mates.find(m => m.id === axis.id);
    check(canonical({ ...axis, second: undefined }) === canonical({ ...originalAxis, second: undefined })
      && axis.second.component.definition.revision === revision, 'Origin relation retains declaring identity and rotation lock');
    const distance = doc.mates.find(m => m.id === mateId), originalDistance = parent.mates.find(m => m.id === mateId);
    check(canonical({ ...distance, first: undefined, second: undefined }) === canonical({ ...originalDistance, first: undefined, second: undefined })
      && distance.first.component.occurrencePath[0] === 'base' && distance.second.component.occurrencePath[0] === 'moving'
      && distance.first.component.definition.revision === revision && distance.second.component.definition.revision === revision,
      'Material relation ID, signed intent and ordered owners survive explicit repairs');
  }
  async function undoRedo(label, doc, updated, revision = 'r0') {
    const before = await serial(); await press('button[aria-label="' + label + ' ensamblaje"]');
    const event = await response(before, 'build-assembly');
    check(canonical(event.document) === canonical(doc), 'Whole-parent ' + label + ' restores the exact complete graph');
    geometry(event.response.value, updated, revision); await parentIdle(label + ' settled'); await recovery(doc, label); return event;
  }

  return async () => {
    const inputBytes = await fs.readFile(input);
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function' && typeof window.require === 'undefined' && typeof window.process === 'undefined'), initialReadyMs);
    let before = await serial(); await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] button.primary-button');
    let event = await response(before, 'build-assembly');
    check(canonical(event.document) === canonical(expected), 'Actual original fixture opened'); geometry(event.response.value, false);
    await parentIdle('original assembly ready'); await recovery(expected, 'Open');

    // This actual Apply is the pre-entry history state. Independently verify
    // the native support sign before writing -10 into the production control.
    signedTopSeparation(event.response.value);
    await navigation.panel('relations'); await control('select[aria-label="Tipo de relación"]', 'distance');
    await choose(1, top(event.response.value, 'base')); await choose(2, top(event.response.value, 'moving'));
    await control('input[aria-label="Nombre de la relación"]', 'Original material top separation');
    await control('input[aria-label="Distancia firmada"]', '-10');
    await control('select[aria-label="Orientación de la relación"]', 'aligned');
    before = await serial(); await button('Vista previa de la nueva relación');
    event = await response(before, 'preview-assembly'); solved(event, false);
    mateId = event.response.value.document.mates.find(m => m.type === 'distance').id;
    parent = (await apply(event)).response.value.document;
    await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)');
    await waitFor('clean parent saved before embedded entry', async () => {
      try { return dialogCounts().saves === 1 && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(parent)
        && ipc.filter(x => x.channel === 'document:save' && x.completed).length === 1; }
      catch (reason) { if (reason.code === 'ENOENT') return false; throw reason; }
    });
    await parentIdle('clean saved parent ready');
    await closeGuard(false, 'Saved parent is initially clean');
    parentFileBytes = await fs.readFile(output);
    parentRecovery = await rawRecovery(); lastReviewSerial = await serial();

    await enter();
    await bodyFocus(); await keyboard('S', 'Inactive parent ignores body Save');
    await waitFor('first detached-copy save canceled', () => dialogCounts().saves === 2 && ipc.filter(x => x.channel === 'document:save' && x.completed).length === 2);
    before = await serial(); await press(PART + ' button[title="Reconstruir pieza"]'); await partReady(before, 2, 'after canceled copy');
    await bodyFocus(); await keyboard('Z', 'Inactive parent ignores body Undo without local history');
    await keyboard('F', 'Inactive parent ignores body Fit');

    // Exercise a source-prefix build from the existing solid editor. Return
    // remains unavailable until that operation is explicitly finished.
    before = await serial(); await press(SOLID, null, true);
    await waitFor('real extrusion operation and source builds', async () => {
      const state = await observe();
      return await page(part => !!document.querySelector(part + ' .property-manager-extrude') && document.querySelector(part + ' button.primary-button')?.disabled === true, PART)
        && state.builds.some(b => b.serial > before && b.features.length === 1 && b.features[0].id === 'embedded-profile' && b.response?.ok);
    });
    check(await page(selector => document.querySelector(selector)?.disabled === true, RETURN), 'Return blocked during real source/operation editing');
    before = await serial(); await press(PART + ' button[title="Cancelar operación"]'); await partReady(before, 2, 'after source-operation Cancel');

    const treeToggle = PART + ' button[data-part-tree-toggle="embedded-solid"]';
    if (await page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', treeToggle)) await press(treeToggle);
    const profileRows = await page(selector => [...document.querySelectorAll(selector)].map(e => e.dataset.parentFeatureId ?? null), PROFILE);
    check(profileRows.length === 1 && profileRows[0] === 'embedded-solid', 'One actual sketch occurrence under its consuming extrusion');
    await press(PROFILE, null, true);
    await waitFor('original sketch operation editable', () => page(selector => document.querySelector(selector)?.value === '2', WIDTH));
    await press(PART + ' input[aria-label="Nombre de operación"]');
    await keyboard('S', 'Inactive parent ignores Save in operation field');
    await keyboard('Z', 'Inactive parent ignores native Undo in operation field');
    await keyboard('F', 'Inactive parent ignores Fit in operation field');
    check(dialogCounts().saves === 2, 'Unfinished embedded operation cannot save the parent or a copy');

    // Sample the actual next render after the change while the production
    // 120ms debounce has not posted the edited build. No timer is overridden.
    const pending = await page(async (selector, returning) => {
      const field = document.querySelector(selector), start = globalThis.__solidflowUiTestObservation.counters().serial;
      if (!field || field.disabled) throw Error('Original width input required');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '3');
      field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(resolve));
      const state = globalThis.__solidflowUiTestObservation.snapshot(), target = document.querySelector(returning), r = target.getBoundingClientRect();
      return { start, returnDisabled: target.disabled, width: field.value, changedBuildPosted: state.builds.some(b => b.serial > start && b.features[0]?.profile?.width === 3),
        point: { x: r.x + r.width / 2, y: r.y + r.height / 2 } };
    }, WIDTH, RETURN);
    check(pending.width === '3' && pending.returnDisabled && !pending.changedBuildPosted, 'Actual unfinished width change blocks Return before its debounce sends a build');
    await pointer('mouseMoved', pending.point); await pointer('mousePressed', pending.point, 1); await pointer('mouseReleased', pending.point, 0);
    check(!(await observe()).assemblies.some(a => a.serial > pending.start && a.action === 'review-assembly-part-update'), 'Actual disabled Return click cannot start a source review');
    boundaries.push({ phase: 'unfinished width/debounce Return rejection', ...pending });
    await control(CENTER, '1.5');
    await waitFor('real edited sketch preview ready to accept', () => page(selector => document.querySelector(selector)?.disabled === false, PART_APPLY));
    before = await serial(); await press(PART_APPLY); await partReady(before, 3, 'accepted width and anchored center');
    await unchanged('Part accepted local operation');
    before = await serial(); await bodyFocus(); await keyboard('Z', 'Local part Undo never undoes parent'); await partReady(before, 2, 'local Undo');
    before = await serial(); await keyboard('Y', 'Local part Redo never redoes parent'); await partReady(before, 3, 'local Redo');
    await keyboard('S', 'Changed detached-copy save canceled');
    await waitFor('second detached-copy save canceled', () => dialogCounts().saves === 3 && ipc.filter(x => x.channel === 'document:save' && x.completed).length === 3);
    before = await serial(); await press(PART + ' button[title="Reconstruir pieza"]'); await partReady(before, 3, 'changed copy canceled activation rebuild');
    before = await serial(); await keyboard('S', 'Successful copy preserves committed parent');
    await waitFor('actual independent part copy saved', async () => {
      try { return dialogCounts().saves === 4 && ipc.filter(x => x.channel === 'document:save' && x.completed).length === 4
        && (await fs.stat(partCopyOutput)).isFile(); }
      catch (reason) { if (reason.code === 'ENOENT') return false; throw reason; }
    });
    const copiedBuild = await partReady(before, 3, 'successful copy fresh activation');
    const copyBytes = await fs.readFile(partCopyOutput), copied = JSON.parse(copyBytes.toString('utf8'));
    const write = ipc.filter(x => x.channel === 'document:save').at(-1).documentWrite;
    check(write?.chosen === true && write.hasPath === false && write.sha256 === digest(copyBytes),
      'Copy bytes exactly match real isolated save request without parent path reuse');
    const originalPart = parent.definitions[0].document;
    check(copied.version === originalPart.version && copied.id === originalPart.id && copied.name === originalPart.name
      && copied.units === originalPart.units && copied.createdAt === originalPart.createdAt
      && canonical(copied.features) === canonical(copiedBuild.features), 'Independent copy retains exact edited part identity/features');
    await waitFor('part copy clean marker', () => page(part => {
      const title = document.querySelector(part + ' .document-title'); return !!title && !title.title.includes('Cambios sin guardar');
    }, PART));
    await unchanged('Successful copy does not write assembly or recovery');
    await closeGuard(true, 'Saving a part copy does not clear unapplied assembly work');
    await cancelDiscard(false); await cancelDiscard(true);

    const first = await review(); await repair(first);
    before = await serial(); await press(SOLVE); event = await response(before, 'preview-assembly-part-update'); solved(event, true, first.revision);
    await unchanged('Ready repaired source preview');
    before = await serial(); await press(CANCEL_UPDATE); const discarded = await response(before, 'discard-assembly-part-update');
    check(discarded.reviewId === first.response.value.reviewId, 'Cancel revokes the exact first review');
    await partReady(before, 3, 'Cancel resumes retained local editor'); await unchanged('Cancel restored parent and retained part');
    before = await serial(); await bodyFocus(); await keyboard('Z', 'Resumed editor retains local Undo'); await partReady(before, 2, 'resumed Undo');
    before = await serial(); await keyboard('Y', 'Resumed editor retains local Redo'); await partReady(before, 3, 'resumed Redo');

    const second = await review();
    check(second.revision !== first.revision && second.response.value.reviewId !== first.response.value.reviewId, 'Retry creates a fresh revision and private review');
    await repair(second); before = await serial(); await press(SOLVE); event = await response(before, 'preview-assembly-part-update');
    solved(event, true, second.revision); intent(event.response.value.document, second.revision); await unchanged('Retry ready before Apply');
    check(!(await observe()).builds.some(b => b.serial > second.serial), 'No resumed/stale part producer posts during review, repair or Solve');
    const applied = await apply(event), accepted = applied.response.value.document;
    intent(accepted, second.revision); geometry(applied.response.value.scene, true, second.revision);
    check(!await page(part => !!document.querySelector(part), PART), 'Successful Apply disposes the temporary part editor');
    await undoRedo('Deshacer', parent, false);
    await undoRedo('Deshacer', expected, false);
    await undoRedo('Rehacer', parent, false);
    await undoRedo('Rehacer', accepted, true, second.revision);
    await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)');
    await waitFor('parent-only actual Save As', async () => {
      try { return dialogCounts().saves === 5 && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(accepted); }
      catch (reason) { if (reason.code === 'ENOENT') return false; throw reason; }
    });
    await parentIdle('saved parent controls ready');
    await recovery(accepted, 'Saved');
    before = await serial(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); event = await response(before, 'build-assembly');
    check(canonical(event.document) === canonical(accepted), 'Saved complete source/history result reopens exactly');
    geometry(event.response.value, true, second.revision); await parentIdle('reopened parent ready');
    before = await serial(); await press('button[aria-label="Resolver ensamblaje"]'); event = await response(before, 'preview-assembly');
    solved(event, true, second.revision); intent(event.response.value.document, second.revision);
    await press(CANCEL); await parentIdle('reopened fresh solve Cancel'); await recovery(accepted, 'Reopened');
    await closeGuard(false, 'Reopened saved accepted parent is clean');

    // An unfinished real sketch change queues its normal production debounce.
    // Record whether the tiny prism's native build is still pending at the
    // actual discard decision; do not make CI depend on a minimum kernel time.
    parent = accepted; parentRecovery = await rawRecovery(); parentFileBytes = await fs.readFile(output); lastReviewSerial = await serial();
    await enter(3);
    if (await page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', treeToggle)) await press(treeToggle);
    await press(PROFILE, null, true);
    await waitFor('reopened embedded sketch editable', () => page(selector => document.querySelector(selector)?.value === '3', WIDTH));
    const discardTarget = await prepare(DISCARD);
    const unfinished = await page(async (selector, returning) => {
      const field = document.querySelector(selector), start = globalThis.__solidflowUiTestObservation.counters().serial;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, '4');
      field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => requestAnimationFrame(resolve));
      const state = globalThis.__solidflowUiTestObservation.snapshot();
      return { start, returnDisabled: document.querySelector(returning)?.disabled,
        draftBuildPosted: state.builds.some(b => b.serial > start && b.features[0]?.profile?.width === 4),
        nativePending: state.builds.filter(b => !b.response).map(b => b.serial) };
    }, WIDTH, RETURN);
    check(unfinished.returnDisabled && !unfinished.draftBuildPosted, 'Discard begins with a real unfinished change and its debounce still queued');
    check((await inspect(DISCARD)).available, 'Original discard control remains physically reachable');
    await pointer('mouseMoved', discardTarget.point); await pointer('mousePressed', discardTarget.point, 1); await pointer('mouseReleased', discardTarget.point, 0);
    const confirm = await prepare(DISCARD_DIALOG + ' button.primary-button');
    const decision = await observe();
    const nativePending = decision.builds.filter(b => b.serial > unfinished.start && !b.response).map(b => b.serial);
    before = await serial();
    await pointer('mouseMoved', confirm.point); await pointer('mousePressed', confirm.point, 1); await pointer('mouseReleased', confirm.point, 0);
    await waitFor('unfinished embedded edit discarded and parent restored', () => page(part => !document.querySelector(part)
      && document.querySelector('.assembly-app')?.hidden === false, PART));
    event = await response(before, 'build-assembly');
    check(canonical(event.document) === canonical(accepted), 'Discarded unfinished change restores the exact accepted parent');
    geometry(event.response.value, true, second.revision); await parentIdle('discard restored healthy parent'); await recovery(accepted, 'Discard');
    check((await fs.readFile(output)).equals(parentFileBytes), 'Discard does not write the committed parent file');
    await closeGuard(false, 'Discard restores clean parent close guard');
    boundaries.push({ phase: 'Discard unfinished sketch change', debounce: unfinished, nativePendingAtDecision: nativePending,
      nativePendingObserved: nativePending.length > 0, limit: nativePending.length ? 'Actual native request was pending at the decision sample; no artificial hold.'
        : 'Native prism build had settled by the decision sample; this case proves queued-debounce/unfinished discard, not discard during an outstanding native request.' });
    check((await fs.readFile(input)).equals(inputBytes), 'Original synthetic input remains byte-identical');
    const final = await observe();
    check(dialogCounts().opens === 2 && dialogCounts().saves === 5 && dialogCounts().csvExports === 0 && ipc.every(x => x.completed), 'Exact test-owned Open/Save queue and completed IPC');
    check(!final.workerErrors.length && !consoleErrors.length && !failedRequests.length, 'No actual renderer/worker/resource failures');
    Object.assign(evidence.embeddedPartEdit, { inputSha256: digest(inputBytes), savedSha256: digest(await fs.readFile(output)), partCopySha256: digest(copyBytes), finalDocument: accepted,
      independentOracles: 'Original two-use 2x3x4 rectangular prism: V48/A104 -> two 3x3x4 solids V72/A132. Width2->3 and centerX1->1.5 keep lowerX0. Overall bounds[0,0,0]..[3,3,14]. Fixed baseZ0, movingZ10, identity orientations. First-minus-second material-top distance=-10, checked from actual native world plane supports before authoring. Native volume/area tolerance1e-5; coordinates1e-6; quaternion physical identity1e-8. Fresh rank6/DOF0 and both native mate checks satisfy their own reported tolerances.',
      limits: 'One original standard assembly, scripted visible form controls and real CDP pointer/keyboard, production worker/native placed solid inventory and metrology, test-owned native-dialog paths. Close guard sampled with a synthetic cancellable beforeunload event; no operating-system close is attempted. Native-pending discard coverage is limited to the explicitly recorded decision sample, without an artificial worker hold. No injected document, model, solver reply, native proof or Apply token. BRep admission belongs to production native body/placement validation; no separate renderer BRep-validity flag is invented. No human native-dialog, linked-file writeback, dormant uses, general topology correspondence, installed package or cross-platform claim.' });
  };
};
