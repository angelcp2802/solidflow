'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// One ordinary assembly authored through the production UI, starting at New.
// Only the imported part is a recipe. Root/occurrence/relation IDs and imported
// revisions come from actual worker observations, never synthetic UI state.
module.exports = function basicAuthoringWorkflow(context) {
  const { expected: part, input, output, evaluate, observe, waitFor, pointer, menuKey, capture, checks, check,
    canonical, digest, ipc, dialogCounts, consoleErrors, failedRequests, initialReadyMs } = context;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value =>
    'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = require('./desktop-assembly-navigation.cjs').withNavigation({ ...context, page }).assemblyNavigation;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = '[aria-label="Tipo de relación"]', NAME = '[aria-label="Nombre de la relación"]';
  const phases = [], gestures = [], owners = {}, baselinePoses = {};
  const evidence = { scenario: 'basic-authoring', phases, gestures,
    limits: 'One original part imported once and reused twice in a newly created standard assembly. Actual CDP actions and origin-label picks; visible numeric/name/select form setters are scripted. No configured, nested, contact or collision claim. Free coordinates are not a unique-placement oracle.' };
  checks.push(evidence);
  let rootIdentity, definition;
  const attr = (name, value) => '[' + name + '=' + JSON.stringify(value) + ']';
  const tree = id => '[data-assembly-tree-path]' + attr('data-assembly-tree-path', JSON.stringify([id]));
  const near = (a, b, tolerance, message) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, message + ': actual=' + a + ', expected=' + b);
  const vector = (a, b, tolerance, message) => { check(Array.isArray(a) && a.length === b.length, message + ' dimensions'); a.forEach((v, i) => near(v, b[i], tolerance, message + '[' + i + ']')); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  function rotate(q, p) {
    near(Math.hypot(...q), 1, 1e-10, 'Unit occurrence quaternion');
    const t = cross(q.slice(0, 3), p).map(v => 2 * v), c = cross(q.slice(0, 3), t);
    return p.map((v, i) => v + q[3] * t[i] + c[i]);
  }
  const withoutStamp = doc => { const { updatedAt, ...value } = doc; return value; };
  const occurrence = (doc, id) => { const matches = doc.occurrences.filter(o => o.id === id); check(matches.length === 1, 'Exact observed occurrence'); return matches[0]; };
  const ref = (kind, id, value) => ({ kind, component: id ? { occurrencePath: [id], definition: { ...definition } } : null,
    [kind === 'principal-plane' ? 'plane' : 'axis']: value });

  async function inspect(selector, text) {
    return page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1) throw Error('One exact control required: ' + selector + ' / ' + text);
      const e = rows[0], r = e.getBoundingClientRect();
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const point = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, hit = document.elementFromPoint(point.x, point.y);
      const host = e.closest('.assembly-viewport'), canvas = host?.querySelector('canvas'), cr = canvas?.getBoundingClientRect();
      return { point, rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, clip: { left, right, top, bottom },
        visible: !e.disabled && !e.closest('[hidden]') && e.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
          && r.width > 0 && r.height > 0 && r.left >= left && r.right <= right && r.top >= top && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)),
        frameCurrent: !host || !!cr && Math.abs(cr.width - host.clientWidth) < 1 && Math.abs(cr.height - host.clientHeight) < 1,
        hit: hit ? { tag: hit.tagName, label: hit.getAttribute('aria-label'), key: hit.closest('[data-origin-key]')?.getAttribute('data-origin-key') ?? null } : null };
    }, selector, text);
  }
  async function prepare(selector, text = null) {
    if (await page(() => !!document.querySelector('.assembly-app'))) await navigation.reveal(selector, text ?? '');
    await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]')) throw Error('One enabled visible control required: ' + JSON.stringify({
        selector, text, count: rows.length, busy: document.querySelector('.assembly-app')?.getAttribute('aria-busy'),
        controls: rows.slice(0, 4).map(e => ({ disabled: !!e.disabled, hiddenAncestor: !!e.closest('[hidden]'),
          panel: e.closest('[role="tabpanel"]')?.id ?? null, label: e.getAttribute('aria-label'), title: e.getAttribute('title') })) }));
      rows[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    let previous, since = 0;
    return waitFor('stationary visible authoring control ' + (text ?? selector), async () => {
      const state = await inspect(selector, text), key = canonical(state);
      if (key !== previous) { previous = key; since = Date.now(); }
      return state.visible && state.frameCurrent && Date.now() - since >= 120 ? state : false;
    });
  }
  async function actual(selector, text = null) {
    const before = await prepare(selector, text);
    await pointer('mouseMoved', before.point);
    const after = await inspect(selector, text);
    check(canonical(after) === canonical(before), 'Authoring target remains stationary before press: ' + JSON.stringify({ selector, text, before, after }));
    await pointer('mousePressed', before.point, 1); await pointer('mouseReleased', before.point, 0);
    gestures.push({ action: 'pointer', selector, text, point: before.point });
  }
  async function rightClick(selector) {
    const before = await prepare(selector);
    await pointer('mouseMoved', before.point);
    check(canonical(await inspect(selector, null)) === canonical(before), 'Context target remains stationary before right press');
    await pointer('mousePressed', before.point, 2); await pointer('mouseReleased', before.point, 2);
    gestures.push({ action: 'context-pointer', selector, point: before.point });
  }
  async function button(text, parent = '.assembly-app') { await actual(parent + ' button', text); }
  async function control(selector, value) {
    await prepare(selector);
    await page((selector, value) => {
      const e = document.querySelector(selector);
      if (!e || e.disabled || !e.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })) throw Error('Current visible form control required');
      const p = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Exact current option required');
      Object.getOwnPropertyDescriptor(p, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('visible scripted field retained', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
    gestures.push({ action: 'visible-scripted-field', selector, value });
  }
  async function response(serial, action) {
    return waitFor('actual authoring worker ' + action, async () => {
      const state = await observe.assemblyResponseAfter(serial, action);
      check(!state.workerErrors.length, 'No worker transport errors');
      if (!state.record) return false;
      check(state.record.response.ok, state.record.response.error || 'Worker action rejected'); return state.record;
    });
  }
  const serial = async () => (await observe.counters()).serial;
  async function recovery(doc) {
    await waitFor('exact committed authoring recovery and idle', async () => {
      const state = await page(() => ({ raw: localStorage.getItem('solidflow.autosave'), idle: document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' }));
      return state.idle && state.raw && canonical(JSON.parse(state.raw)) === canonical(doc);
    });
  }
  async function uiState() {
    return page(() => ({ recovery: localStorage.getItem('solidflow.autosave'), selected: document.querySelector('[data-assembly-tree-path][aria-selected="true"]')?.getAttribute('data-assembly-tree-path'),
      panel: document.querySelector('.assembly-manager-tabs [aria-selected="true"]')?.id ?? [...document.querySelectorAll('[id^="assembly-tab-"]')].find(e => e.getAttribute('aria-selected') === 'true')?.id,
      undo: document.querySelector('[aria-label="Deshacer ensamblaje"]')?.disabled, redo: document.querySelector('[aria-label="Rehacer ensamblaje"]')?.disabled,
      apply: document.querySelector('[aria-label="Aplicar ensamblaje"]')?.disabled, title: document.querySelector('.assembly-shell-document > strong')?.textContent }));
  }
  function graph(doc, count) {
    check(doc.version === 2 && doc.kind === 'assembly' && doc.id === rootIdentity && doc.units === 'mm' && doc.occurrences.length === count, 'Created parent identity and exact occurrence count');
    check(doc.definitions.length === (count ? 1 : 0), 'One original definition reused without duplication');
    if (count) {
      const d = doc.definitions[0]; check(d.kind === 'part' && canonical(d.document) === canonical(part) && canonical({ id: d.id, revision: d.revision }) === canonical(definition), 'Imported source bytes and current tuple retained');
      check(new Set(doc.occurrences.map(o => o.id)).size === count && doc.occurrences.every(o => canonical(o.definition) === canonical(definition) && o.visible && !o.suppressed), 'Distinct visible exact-tuple uses');
    }
  }
  function geometry(scene, doc, count, phase, baseFixed = true) {
    graph(doc, count);
    check(scene.kind === 'assembly-scene' && scene.solidCount === count && scene.bodies.length === count && scene.prototypeCount === (count ? 1 : 0) && !scene.warnings.length, 'Exact independent prism counts');
    near(scene.volume, 24 * count, 1e-5, 'Original total volume'); near(scene.area, 52 * count, 1e-5, 'Original total area');
    for (const o of doc.occurrences) {
      const rows = scene.bodies.filter(b => canonical(b.component) === canonical({ occurrencePath: [o.id], definition }));
      check(rows.length === 1 && rows[0].solidCount === 1, 'Unique current occurrence native body'); const b = rows[0];
      near(b.volume, 24, 1e-5, 'Original member volume'); near(b.area, 52, 1e-5, 'Original member area');
      vector(b.worldPose.translation, o.pose.translation, 1e-6, 'Native occurrence placement');
      const vertices = [0, 3].flatMap(x => [0, 2].flatMap(y => [0, 4].map(z => rotate(o.pose.rotation, [x, y, z]).map((v, i) => v + o.pose.translation[i]))));
      vector(b.bounds.min, [0, 1, 2].map(i => Math.min(...vertices.map(v => v[i]))), 1e-6, 'Eight original vertices lower bounds');
      vector(b.bounds.max, [0, 1, 2].map(i => Math.max(...vertices.map(v => v[i]))), 1e-6, 'Eight original vertices upper bounds');
    }
    if (owners.base && baselinePoses.base) check(canonical(occurrence(doc, owners.base).pose) === canonical(baselinePoses.base) && occurrence(doc, owners.base).fixed === baseFixed, 'Base retains its exact pose and explicitly expected fixed state');
    phases.push({ phase, solids: count, volume: scene.volume, area: scene.area, documentSha256: digest(canonical(doc)), mates: doc.mates.map(m => ({ id: m.id, name: m.name, type: m.type })) });
  }
  function relationGeometry(doc) {
    const plane = doc.mates.find(m => m.name === 'Guide to root'), direction = doc.mates.find(m => m.name.startsWith('Follower to base'));
    check(doc.mates.length <= 2 && (doc.mates.length === 0 || !!plane) && (doc.mates.length < 2 || !!direction), 'All authored relations accounted for by independent oracles');
    if (plane) {
      check(plane.type === 'distance' && plane.distance === -10 && plane.alignment === 'aligned'
        && canonical(plane.first) === canonical(ref('principal-plane', null, 'YZ')) && canonical(plane.second) === canonical(ref('principal-plane', owners.guide, 'YZ')), 'Exact root then component signed-plane intent');
      const pose = occurrence(doc, owners.guide).pose, normal = rotate(pose.rotation, [1, 0, 0]);
      // Signed distance is dot(second normal, first origin - second origin).
      // Root YZ first and guide YZ second therefore require -10, not +10.
      vector(normal, [1, 0, 0], 1e-6, 'Aligned independent YZ normals');
      near(dot(normal, pose.translation.map(v => -v)), -10, 1e-6, 'Independent signed root-to-guide distance');
    }
    if (direction) {
      check(['parallel', 'perpendicular'].includes(direction.type) && canonical(direction.first) === canonical(ref('principal-axis', owners.follower, 'Z'))
        && canonical(direction.second) === canonical(ref('principal-axis', owners.base, 'Z')), 'Exact ordered component origin axes');
      const a = rotate(occurrence(doc, owners.follower).pose.rotation, [0, 0, 1]), b = rotate(occurrence(doc, owners.base).pose.rotation, [0, 0, 1]);
      const norm = Math.hypot(...a) * Math.hypot(...b);
      if (direction.type === 'parallel') { near(Math.hypot(...cross(a, b)) / norm, 0, 1e-6, 'Independent normalized parallel cross residual'); near(dot(a, b) / norm, 1, 1e-6, 'Aligned axes sign'); }
      else near(Math.abs(dot(a, b)) / norm, 0, 1e-6, 'Independent normalized perpendicular dot residual');
    }
  }
  async function built(before, count, phase) {
    const event = await response(before, 'build-assembly'); geometry(event.response.value, event.document, count, phase); await recovery(event.document); return event.document;
  }
  async function builtNameAction(before, original, id, changes, count, phase) {
    // Blur can start a name rebuild before the following explicit action starts
    // its own rebuild. Accept the completed final intent, not the first reply.
    const event = await waitFor('actual name and following action rebuild ' + phase, async () => {
      const state = await observe.assemblyResponseAfter(before, 'build-assembly');
      check(!state.workerErrors.length, 'No worker errors during name/action continuity');
      if (!state.record) return false;
      check(state.record.response.ok, state.record.response.error || 'Name/action rebuild rejected');
      const owner = state.record.document?.occurrences.find(o => o.id === id);
      return owner && Object.entries(changes).every(([key, value]) => owner[key] === value) ? state.record : false;
    });
    const expected = structuredClone(original);
    Object.assign(occurrence(expected, id), changes);
    check(Number.isFinite(Date.parse(event.document.updatedAt)) && Date.parse(event.document.updatedAt) > Date.parse(original.updatedAt),
      'Name/action changes advance the document timestamp');
    expected.updatedAt = event.document.updatedAt;
    check(canonical(event.document) === canonical(expected), 'Name/action preserves every other document declaration');
    geometry(event.response.value, event.document, count, phase); await recovery(event.document);
    checks.push({ nameActionContinuity: { phase, afterSerial: before, completedSerial: event.serial, changes } });
    return event.document;
  }
  async function insertedSelection(doc, id, phase) {
    // This observation precedes navigation/scroll assistance: the application
    // itself must select the new identity, open Properties and focus its name.
    const state = await waitFor('application-owned inserted selection and Properties focus', () => page(path => {
      const row = [...document.querySelectorAll('[data-assembly-tree-path]')].find(e => e.getAttribute('data-assembly-tree-path') === path);
      const panel = document.querySelector('#assembly-panel-properties'), name = panel?.querySelector('[aria-label="Nombre del componente"]');
      return row?.getAttribute('aria-selected') === 'true' && panel?.hidden === false && document.querySelector('#assembly-tab-properties')?.getAttribute('aria-selected') === 'true'
        && name === document.activeElement && !name.disabled ? { path, name: name.value, focused: true } : false;
    }, JSON.stringify([id])));
    check(state.name === occurrence(doc, id).name, 'Newly inserted exact occurrence owns the visible Properties form'); gestures.push({ action: 'automatic-insertion-selection', phase, ...state });
  }
  async function rename(doc, id, name) {
    const selector = '[aria-label="Nombre del componente"]'; await actual(selector); await control(selector, name);
    const before = await serial(); await menuKey('Tab');
    const next = await built(before, doc.occurrences.length, 'rename-' + name);
    check(occurrence(next, id).name === name, 'Native blur commits the new occurrence name'); return next;
  }
  async function select(id) {
    const before = await observe.counters(); await actual(tree(id));
    await waitFor('exact occurrence selected without forcing Properties', () => page(selector => document.querySelector(selector)?.getAttribute('aria-selected') === 'true'
      && document.querySelector('#assembly-panel-components')?.hidden === false, tree(id)));
    check(canonical(await observe.counters()) === canonical(before), 'Presentation selection allocates no native work');
  }
  const contextAction = id => '[data-cad-context-action=' + JSON.stringify(id) + ']';
  async function contextMenuState() {
    return page(() => {
      const menus = [...document.querySelectorAll('.cad-context-menu[role="menu"]')];
      if (menus.length !== 1 || !menus[0].checkVisibility({ visibilityProperty: true }) || !menus[0].contains(document.activeElement)) return false;
      const headings = [...menus[0].querySelectorAll('.part-feature-context-heading')];
      const nodes = [...menus[0].querySelectorAll('[data-cad-context-action]')];
      if (headings.length !== 1 || !headings[0].textContent.trim() || !nodes.length
        || menus[0].querySelectorAll('button').length !== nodes.length
        || nodes.some(e => !(e instanceof HTMLButtonElement) || e.getAttribute('role') !== 'menuitem'
          || !e.getAttribute('data-cad-context-action')?.trim() || !e.textContent.trim())
        || new Set(nodes.map(e => e.getAttribute('data-cad-context-action'))).size !== nodes.length)
        throw Error('Context menu requires one named heading and unique labelled button actions');
      return { target: headings[0].textContent.trim(),
        actions: nodes.map(e => ({ id: e.getAttribute('data-cad-context-action'), label: e.textContent.trim(), disabled: e.disabled })) };
    });
  }
  async function contextReadOnlyState() {
    const { selected, panel, ...persistentUi } = await uiState();
    return { persistentUi, observation: await observe(), counters: await observe.counters(), references: await page(() => {
      const first = [...document.querySelectorAll('[aria-label="Referencia 1 de la relación"]')];
      const second = [...document.querySelectorAll('[aria-label="Referencia 2 de la relación"]')];
      const viewports = [...document.querySelectorAll('.assembly-viewport')];
      // Relations stays mounted while its manager is hidden. Existence and
      // nonempty role text are required; an empty picking mode is valid browsing.
      if (first.length !== 1 || second.length !== 1 || viewports.length !== 1
        || !first[0].textContent.trim() || !second[0].textContent.trim()
        || !viewports[0].hasAttribute('data-reference-picking'))
        throw Error('Context audit requires both exact named relation roles and an explicit viewport picking mode');
      return { first: first[0].textContent, second: second[0].textContent,
        mode: viewports[0].getAttribute('data-reference-picking') };
    }) };
  }
  function checkContextUnchanged(before, after, label) {
    const snapshot = state => {
      const { recovery, ...ui } = state.persistentUi;
      return { references: state.references, counters: state.counters, ui,
        recoverySha256: digest(recovery ?? ''), observationSha256: digest(canonical(state.observation)),
        assemblyCount: state.observation.assemblies.length, buildCount: state.observation.builds.length };
    };
    // Retain bounded evidence before asserting, including on a failed comparison.
    // The assertion still compares complete observations and recovery text.
    checks.push({ contextReadOnlyAudit: { label, before: snapshot(before), after: snapshot(after) } });
    check(canonical(after) === canonical(before), label);
  }
  async function closeContextRetaining(selector) {
    await menuKey('Escape');
    await waitFor('Escape closes context and restores its selected row', () => page(selector => {
      const row = document.querySelector(selector);
      return !document.querySelector('.cad-context-menu') && row?.getAttribute('aria-selected') === 'true' && document.activeElement === row;
    }, selector));
  }
  async function componentContextWorkflow(doc, previousId) {
    await select(previousId);
    const baseline = await contextReadOnlyState(), baseSelector = tree(owners.base);
    await rightClick(baseSelector);
    const menu = await waitFor('right click retargets exact Base component context', async () => {
      const state = await contextMenuState();
      return state?.target === 'Base' && await page(selector => document.querySelector(selector)?.getAttribute('aria-selected') === 'true', baseSelector) ? state : false;
    });
    for (const id of ['component-properties', 'component-move', 'component-fixed', 'component-visible', 'component-suppressed'])
      check(menu.actions.filter(action => action.id === id).length === 1, 'One existing component context action: ' + id);
    check(menu.actions.find(action => action.id === 'component-fixed').label === 'Flotar', 'Fixed component offers Float');
    check(menu.actions.find(action => action.id === 'component-move').disabled && !menu.actions.find(action => action.id === 'component-properties').disabled,
      'Fixed component blocks Move but permits Properties');
    check(menu.actions.find(action => action.id === 'component-visible').label === 'Ocultar'
      && menu.actions.find(action => action.id === 'component-suppressed').label === 'Suprimir', 'Visible active component exposes its actual state actions');
    await closeContextRetaining(baseSelector);
    checkContextUnchanged(baseline, await contextReadOnlyState(), 'Right click and Escape preserve document, recovery, full history and relation roles');
    await menuKey('ContextMenu');
    await waitFor('keyboard opens selected component context', contextMenuState);
    await actual(contextAction('component-properties'));
    await waitFor('context Properties focuses the exact Base name', () => page(() => {
      const input = document.querySelector('[aria-label="Nombre del componente"]');
      return document.querySelector('#assembly-panel-properties')?.hidden === false && input?.value === 'Base' && input === document.activeElement;
    }));
    checkContextUnchanged(baseline, await contextReadOnlyState(), 'Keyboard context Properties preserves all committed state and relation roles');
    for (const fixed of [false, true]) {
      await rightClick(baseSelector);
      const state = await waitFor('current fixed-state context action', contextMenuState), action = state.actions.find(action => action.id === 'component-fixed');
      check(action && !action.disabled && action.label === (fixed ? 'Fijar' : 'Flotar'), 'Context fixed action matches current committed state');
      check(state.actions.find(action => action.id === 'component-move').disabled === !fixed, 'Context Move follows the actual current fixed state');
      const before = await serial(); await actual(contextAction('component-fixed'));
      const event = await response(before, 'build-assembly'), next = event.document, expected = structuredClone(doc);
      occurrence(expected, owners.base).fixed = fixed; expected.updatedAt = next.updatedAt;
      check(canonical(next) === canonical(expected), 'Context fix/float changes only the exact Base fixed flag and timestamp');
      geometry(event.response.value, next, doc.occurrences.length, fixed ? 'context-fix-base' : 'context-float-base', fixed);
      await recovery(next); doc = next;
    }
    const originSelector = '[data-assembly-origin-tree-reference]' + attr('data-assembly-origin-tree-reference', JSON.stringify(ref('principal-plane', null, 'YZ')));
    const originBefore = await contextReadOnlyState(); await rightClick(originSelector);
    const originMenu = await waitFor('root plane context selects only its browsing datum', async () => {
      const state = await contextMenuState();
      return state && await page(selector => document.querySelector(selector)?.getAttribute('aria-selected') === 'true'
        && document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking') === '', originSelector) ? state : false;
    });
    check(!originMenu.actions.some(action => action.id.startsWith('component-')), 'Root datum context exposes no component mutation');
    check(canonical(originMenu.actions.map(action => action.id).sort()) === canonical(['origin-controls', 'origin-owner']), 'Root datum context contains only existing origin navigation');
    check(originMenu.actions.find(action => action.id === 'origin-owner').disabled && !originMenu.actions.find(action => action.id === 'origin-controls').disabled,
      'Root datum has no component owner but retains origin controls navigation');
    await closeContextRetaining(originSelector);
    checkContextUnchanged(originBefore, await contextReadOnlyState(), 'Origin context browsing and Escape preserve document, complete observations and relation roles');
    checks.push({ assemblyContextNavigation: { component: menu, origin: originMenu, fixedCycle: [false, true], counters: await observe.counters(), documentSha256: digest(canonical(doc)) } });
    await select(previousId); await actual('[aria-label="Propiedades del componente seleccionado"]');
    await waitFor('context workflow restores prior component Properties', () => page(name => {
      const input = document.querySelector('[aria-label="Nombre del componente"]');
      return input?.value === name && input === document.activeElement;
    }, occurrence(doc, previousId).name));
    return doc;
  }
  async function viewportContextWorkflow(doc, selectedId) {
    await select(owners.base);
    const baseline = await contextReadOnlyState();
    const corner = () => page(() => {
      const canvas = document.querySelector('.assembly-viewport canvas'), rect = canvas?.getBoundingClientRect();
      if (!canvas || !rect || rect.width < 40 || rect.height < 60) return false;
      const point = { x: rect.right - 12, y: rect.bottom - 32 };
      return document.elementFromPoint(point.x, point.y) === canvas ? { point, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } } : false;
    });
    const target = await waitFor('actual empty canvas corner is pointer reachable', corner);
    await pointer('mouseMoved', target.point);
    check(canonical(await corner()) === canonical(target), 'Background context point remains stationary and hits the canvas before press');
    await pointer('mousePressed', target.point, 2); await pointer('mouseReleased', target.point, 2);
    const background = await waitFor('blank canvas opens only current view commands', contextMenuState);
    check(canonical(background.actions.map(action => action.id).sort()) === canonical(['view-fit', 'view-front', 'view-iso', 'view-top']), 'Background context contains exact existing view commands');
    check(background.actions.every(action => !action.disabled), 'Idle background view commands are enabled');
    await menuKey('Escape');
    await waitFor('background Escape returns focus to viewport without clearing selection', () => page(selector => !document.querySelector('.cad-context-menu')
      && document.activeElement === document.querySelector('.assembly-viewport') && document.querySelector(selector)?.getAttribute('aria-selected') === 'true', tree(owners.base)));
    await menuKey('ContextMenu');
    const keyboard = await waitFor('viewport keyboard context targets the selected exact component', contextMenuState);
    check(keyboard.target === occurrence(doc, owners.base).name && keyboard.actions.some(action => action.id === 'component-properties'), 'Keyboard viewport context uses current selected Base component');
    await menuKey('Escape');
    await waitFor('keyboard viewport context closes with host focus', () => page(() => !document.querySelector('.cad-context-menu') && document.activeElement === document.querySelector('.assembly-viewport')));
    checkContextUnchanged(baseline, await contextReadOnlyState(), 'Viewport pointer and keyboard context preserve document, full observations and relation roles');
    checks.push({ assemblyViewportContextNavigation: { background, keyboard, point: target.point, counters: await observe.counters(), documentSha256: digest(canonical(doc)) } });
    await select(selectedId);
  }
  async function preview(doc, selector, text, phase, mateCount = doc.mates.length) {
    const before = await serial(); await actual(selector, text); const event = await response(before, 'preview-assembly'), value = event.response.value;
    check(canonical(event.current) === canonical(doc) && value.status === 'ready' && value.hasToken && value.checks.every(c => c.satisfied && c.lengthResidual <= c.lengthTolerance && c.angleResidual <= c.angleTolerance), 'Exact committed baseline and independently verified private preview');
    check(value.document.mates.length === mateCount && value.checks.length === mateCount && value.scopes.length === 1
      && value.scopes[0].result.localDOF > 0 && !value.scopes[0].temporaryAnchor, 'Exactly the authored relations are verified with remaining freedom and no temporary anchor');
    geometry(value.scene, value.document, 3, phase); relationGeometry(value.document); await recovery(doc); return value;
  }
  async function apply(candidate, phase, expectedCount = 3) {
    const before = await serial(); await actual(APPLY); const event = await response(before, 'apply-assembly'), actualDoc = event.response.value.document;
    check(event.hasToken && event.response.value.kind === 'assembly-applied' && canonical(withoutStamp(actualDoc)) === canonical(withoutStamp(candidate.document)), 'Apply consumes authority for exactly the verified proposal');
    geometry(event.response.value.scene, actualDoc, expectedCount, phase); relationGeometry(actualDoc); await recovery(actualDoc); return actualDoc;
  }
  async function move(doc, id, x, expectedCount) {
    await control('[aria-label="Destino local X del componente"]', String(x));
    const before = await serial(); await actual('[aria-label="Vista previa del movimiento"]'); const event = await response(before, 'move-assembly-component-motion'), value = event.response.value;
    check(canonical(event.current) === canonical(doc) && value.status === 'ready' && value.hasToken && value.checks.every(c => c.satisfied), 'Actual movement verified against committed document');
    check(canonical(event.motion.component) === canonical({ occurrencePath: [id], definition }) && event.motion.rotation.angle === 0,
      'Numeric move targets only the selected occurrence with zero requested rotation');
    vector(occurrence(value.document, id).pose.translation, [x, 0, 0], 1e-6, 'Literal authored translation');
    for (const basis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      vector(rotate(occurrence(value.document, id).pose.rotation, basis), basis, 1e-6, 'Zero requested rotation preserves each original basis');
    }
    check(canonical(value.document.mates) === canonical(doc.mates), 'Movement adds no persistent constraint');
    check(canonical(value.document.occurrences.map(o => o.id).sort()) === canonical(doc.occurrences.map(o => o.id).sort())
      && canonical(value.document.definitions) === canonical(doc.definitions), 'Movement preserves the entire occurrence identity set and source definitions');
    check(doc.occurrences.filter(o => o.id !== id).every(o => canonical(occurrence(value.document, o.id)) === canonical(o)), 'Other occurrences remain exact through the move');
    await recovery(doc); return apply(value, 'move-' + x, expectedCount);
  }
  async function origin(slot, kind, id, value) {
    if (id) await select(id);
    await control('[aria-label="Orígenes visibles de"]', id ? 'selected' : 'scope');
    const toggle = '.assembly-origin-tools label:nth-of-type(' + (kind === 'principal-axis' ? 1 : 2) + ') input';
    if (!await page(selector => document.querySelector(selector)?.checked, toggle)) await actual(toggle);
    await actual('[aria-label="Referencia ' + slot + ' de la relación"]'); await actual('[aria-label="Seleccionar orígenes"]');
    const expectedRef = ref(kind, id, value), key = JSON.stringify([kind, id ? [[id], definition.id, definition.revision] : null, value]);
    const selector = 'button[data-origin-key]' + attr('data-origin-key', key), before = await observe.counters();
    // Arming and projected-label publication commit separately. Navigation
    // requires an already mounted target; wait for the real current picker and
    // exact label first, without supplying a reference or bypassing hit tests.
    const readiness = { key, slot, polls: 0, first: null, last: null };
    checks.push({ originLabelReadiness: readiness });
    try {
      await waitFor('armed origin role and exact mounted projected label', async () => {
        const state = await page((key, slot) => {
          const host = document.querySelector('[aria-label="Visor 3D del ensamblaje"]');
          const labels = [...document.querySelectorAll('button[data-origin-key]')];
          const matches = labels.filter(e => e.getAttribute('data-origin-key') === key), target = matches[0];
          const rect = target?.getBoundingClientRect();
          const picker = document.querySelector('[aria-label="Seleccionar orígenes"]');
          const role = document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"]');
          return { mode: host?.getAttribute('data-reference-picking') ?? null,
            panelVisible: document.querySelector('#assembly-panel-relations')?.hidden === false,
            roleActive: !!role?.classList.contains('active'), roleDisabled: role?.disabled ?? null,
            pickerPressed: picker?.getAttribute('aria-pressed') ?? null, pickerDisabled: picker?.disabled ?? null,
            owner: document.querySelector('[aria-label="Orígenes visibles de"]')?.value ?? null,
            axes: document.querySelector('.assembly-origin-tools label:nth-of-type(1) input')?.checked ?? null,
            planes: document.querySelector('.assembly-origin-tools label:nth-of-type(2) input')?.checked ?? null,
            selectedPath: document.querySelector('[data-assembly-tree-path][aria-selected="true"]')?.getAttribute('data-assembly-tree-path') ?? null,
            viewport: host ? { width: host.clientWidth, height: host.clientHeight } : null,
            matches: matches.length, targetDisabled: target?.disabled ?? null,
            targetPainted: !!target && target.isConnected && !target.closest('[hidden]')
              && target.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) && rect.width > 0 && rect.height > 0,
            labelCount: labels.length, labels: labels.slice(0, 12).map(e => ({ key: e.getAttribute('data-origin-key'), disabled: e.disabled })) };
        }, key, slot);
        readiness.polls += 1; readiness.first ??= state; readiness.last = state;
        return state.mode === 'origin' && state.panelVisible && state.roleActive && state.roleDisabled === false
          && state.pickerPressed === 'true' && state.pickerDisabled === false && state.owner === (id ? 'selected' : 'scope')
          && (kind === 'principal-axis' ? state.axes : state.planes) && state.matches === 1
          && state.targetDisabled === false && state.targetPainted;
      });
    } catch (error) {
      throw Error(error.message + ': ' + JSON.stringify(readiness));
    }
    await actual(selector);
    const label = (id ?? 'Ámbito actual') + ' · ' + (kind === 'principal-axis' ? 'Eje de origen ' : '') + value;
    await waitFor('exact picked origin assigned to intended role', () => page((slot, label) => document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"] span')?.textContent === label
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', slot, label));
    check(canonical(await observe.counters()) === canonical(before), 'Origin pick alone changes no native history');
    gestures.push({ action: 'origin-pointer', slot, reference: expectedRef });
  }

  return async () => {
    await waitFor('production part startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const inputBytes = await fs.readFile(input); let before = await serial();
    await actual('button[title="Crear un ensamblaje"]');
    await waitFor('initial part replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await response(before, 'build-assembly'), current = event.document;
    rootIdentity = current.id; check(typeof rootIdentity === 'string' && rootIdentity !== part.id && !current.mates.length && !current.definitions.length && !current.occurrences.length, 'New creates an actual empty assembly without loading a prepared assembly');
    geometry(event.response.value, current, 0, 'new-empty'); await recovery(current);
    check(dialogCounts().opens === 0, 'New performs no file Open');
    before = await serial(); await button('Importar componente'); event = await response(before, 'build-assembly');
    check(event.document.occurrences.length === 1 && event.document.definitions.length === 1, 'One actual imported part');
    definition = { ...event.document.occurrences[0].definition }; current = event.document; owners.base = current.occurrences[0].id;
    check(!current.occurrences[0].fixed && canonical(current.occurrences[0].pose) === canonical({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] }), 'Import retains floating identity placement');
    geometry(event.response.value, current, 1, 'import'); await recovery(current); await insertedSelection(current, owners.base, 'import');
    // Rejected blur edits must restore the committed text without creating a
    // document/history entry or worker request. Tab uses actual CDP input.
    const componentName = '[aria-label="Nombre del componente"]';
    for (const rejected of [{ kind: 'empty', value: '' }, { kind: 'whitespace', value: '   ' }, { kind: 'over-limit', value: 'x'.repeat(201) }]) {
      await actual(componentName);
      const initial = { ui: await uiState(), observation: await observe(), counters: await observe.counters() };
      await control(componentName, rejected.value);
      check(await page(selector => document.activeElement === document.querySelector(selector), componentName), 'Rejected component name has focus before real Tab');
      await menuKey('Tab');
      const restored = await waitFor('rejected component name restored with visible error', () => page((selector, name) => {
        const input = document.querySelector(selector), status = document.querySelector('.assembly-status');
        return input && document.activeElement !== input && !input.disabled && !input.closest('[hidden]')
          && input.checkVisibility({ visibilityProperty: true }) && input.value === name
          && status?.classList.contains('error') && status.textContent.includes('texto no válido')
          ? { name: input.value, error: status.textContent } : false;
      }, componentName, occurrence(current, owners.base).name));
      const final = { ui: await uiState(), observation: await observe(), counters: await observe.counters() };
      check(canonical(final.observation) === canonical(initial.observation), 'Rejected component name preserves complete worker and UI observation history');
      check(canonical(final.counters) === canonical(initial.counters), 'Rejected component name issues no worker request');
      check(canonical(final.ui) === canonical(initial.ui), 'Rejected component name preserves recovery, selection, history controls and title');
      check(canonical(JSON.parse(final.ui.recovery)) === canonical(current), 'Rejected component name preserves the complete committed document');
      checks.push({ rejectedComponentName: { kind: rejected.kind, length: rejected.value.length, restoredName: restored.name,
        error: restored.error, counters: final.counters, documentSha256: digest(canonical(current)) } });
    }
    await actual(componentName);
    const fixedIndex = await page(() => [...document.querySelectorAll('#assembly-panel-properties .assembly-check')].findIndex(e => e.textContent.trim() === 'Fijo respecto a su padre'));
    check(fixedIndex === 0, 'Explicit fixed control is the first component-state checkbox'); before = await serial();
    await control('[aria-label="Nombre del componente"]', 'Base');
    check(await page(() => document.activeElement === document.querySelector('[aria-label="Nombre del componente"]')),
      'Name remains focused until the single explicit Fixed click');
    await actual('#assembly-panel-properties label.assembly-check', 'Fijo respecto a su padre');
    current = await builtNameAction(before, current, owners.base, { name: 'Base', fixed: true }, 1, 'rename-and-fix-base');
    check(occurrence(current, owners.base).fixed, 'Base fixed only by explicit control'); baselinePoses.base = structuredClone(occurrence(current, owners.base).pose);
    const canceledState = await uiState(), canceledNative = await observe();
    const observationSummary = state => ({ sha256: digest(canonical(state)), serial: state.serial,
      assemblyCount: state.assemblies.length, buildCount: state.builds.length, workerErrors: state.workerErrors });
    const cancellation = { before: { ui: canceledState, observations: observationSummary(canceledNative) }, ipcCompleted: null, after: null, readiness: null };
    checks.push({ canceledImport: cancellation });
    await button('Importar componente');
    await waitFor('actual cancelled component file picker', () => dialogCounts().opens === 2 && ipc.filter(x => x.channel === 'document:open' && x.completed).length === 2);
    cancellation.ipcCompleted = await uiState();
    // Main-process IPC completion precedes open()'s renderer continuation and
    // finally { setBusy(false) }. Compare final UI state, not transient disabled
    // history controls while the canceled picker is still unwinding.
    await waitFor('canceled import finishes its production busy state', async () => {
      const state = await page(() => {
        const buttons = [...document.querySelectorAll('.assembly-app button')].filter(e => e.textContent.trim() === 'Importar componente');
        return { busy: document.querySelector('.assembly-app')?.getAttribute('aria-busy') ?? null,
          importCount: buttons.length, importDisabled: buttons[0]?.disabled ?? null,
          nameDisabled: document.querySelector('[aria-label="Nombre del componente"]')?.disabled ?? null,
          spinner: !!document.querySelector('.assembly-spinner') };
      });
      cancellation.readiness = state;
      return state.busy === 'false' && state.importCount === 1 && state.importDisabled === false && state.nameDisabled === false && !state.spinner;
    });
    const canceledAfterState = await uiState(), canceledAfterNative = await observe();
    cancellation.after = { ui: canceledAfterState, observations: observationSummary(canceledAfterNative) };
    cancellation.uiEqual = canonical(canceledAfterState) === canonical(canceledState);
    cancellation.observationsEqual = canonical(canceledAfterNative) === canonical(canceledNative);
    // Full worker requests/responses (including embedded documents/geometry),
    // errors, serial and every other observation remain exact. Only the separate
    // presentation audit may append the two observed picker busy transitions.
    const nonAssemblyUiObservations = state => { const { eventSerial, assemblyUi, ...rest } = state; return rest; };
    cancellation.workerHistoryEqual = canonical(nonAssemblyUiObservations(canceledAfterNative)) === canonical(nonAssemblyUiObservations(canceledNative));
    const prefix = canceledNative.assemblyUi, lastUi = prefix.at(-1), suffix = canceledAfterNative.assemblyUi.slice(prefix.length);
    const expectedSuffix = lastUi ? [
      { ...lastUi, eventSerial: canceledNative.eventSerial + 1, busy: true, saveDisabled: true, stepExportDisabled: true, stlExportDisabled: true },
      { ...lastUi, eventSerial: canceledNative.eventSerial + 2 },
    ] : [];
    cancellation.assemblyUiAudit = { beforeLength: prefix.length, afterLength: canceledAfterNative.assemblyUi.length,
      prefixEqual: canonical(canceledAfterNative.assemblyUi.slice(0, prefix.length)) === canonical(prefix),
      beforeEventSerial: canceledNative.eventSerial, afterEventSerial: canceledAfterNative.eventSerial, suffix, expectedSuffix };
    cancellation.assemblyUiAudit.valid = !!lastUi && lastUi.busy === false && lastUi.applyDisabled === true
      && lastUi.saveDisabled === false && lastUi.stepExportDisabled === false && lastUi.stlExportDisabled === false
      && lastUi.preview === 'Componentes independientes · mm' && prefix.length > 0 && canceledAfterNative.assemblyUi.length < 512
      && cancellation.assemblyUiAudit.prefixEqual && suffix.length === 2 && canonical(suffix) === canonical(expectedSuffix)
      && canceledAfterNative.eventSerial === canceledNative.eventSerial + 2;
    const cancellationValid = cancellation.uiEqual && cancellation.workerHistoryEqual && cancellation.assemblyUiAudit.valid;
    // A failed audit retains complete records for diagnosis. The normal two UI
    // events are retained above, not erased or silently compared as counters.
    if (!cancellationValid) cancellation.observationDifference = { before: canceledNative, after: canceledAfterNative };
    check(cancellationValid,
      'Canceled import preserves complete worker history and original UI with only bounded busy transitions: ' + JSON.stringify({
        before: cancellation.before, ipcCompleted: cancellation.ipcCompleted, after: cancellation.after,
        readiness: cancellation.readiness, uiEqual: cancellation.uiEqual, workerHistoryEqual: cancellation.workerHistoryEqual,
        observationsEqual: cancellation.observationsEqual, assemblyUiAudit: cancellation.assemblyUiAudit }));
    for (const [role, name, x, count] of [['guide', 'Guía', 8, 2], ['follower', 'Seguidor', 16, 3]]) {
      const key = await page(definition => { const options = [...document.querySelector('[aria-label="Origen del componente"]').options].filter(o => { try { const v = JSON.parse(o.value); return JSON.stringify(v) === JSON.stringify([definition.id, definition.revision]); } catch { return false; } });
        if (options.length !== 1) throw Error('One exact registered source option'); return options[0].value; }, definition);
      await control('[aria-label="Origen del componente"]', key); before = await serial(); await button('Insertar otra ocurrencia'); event = await response(before, 'build-assembly');
      const added = event.document.occurrences.filter(o => !current.occurrences.some(old => old.id === o.id)); check(added.length === 1 && !added[0].fixed && canonical(added[0].pose) === canonical({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] }), 'Reuse creates exactly one floating identity occurrence');
      check(current.occurrences.every(old => canonical(occurrence(event.document, old.id)) === canonical(old)), 'Reuse preserves every prior occurrence');
      owners[role] = added[0].id; current = event.document; geometry(event.response.value, current, count, 'reuse-' + role); await recovery(current); await insertedSelection(current, owners[role], role);
      current = await rename(current, owners[role], name);
      if (role === 'guide') current = await componentContextWorkflow(current, owners.guide);
      current = await move(current, owners[role], x, count);
    }
    // Explicitly frame all three placed parts. Movement preserves the user's
    // camera, so the first imported part's framing need not contain root datums
    // projected using the later assembly bounds.
    const beforeFit = { ui: await uiState(), observations: await observe() };
    await actual('.assembly-view-tools button[title="Ajustar"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    await recovery(current);
    check(canonical(await uiState()) === canonical(beforeFit.ui) && canonical(await observe()) === canonical(beforeFit.observations),
      'Explicit fit after placement preserves recovery, selection, history and complete worker observations');
    gestures.push({ action: 'explicit-fit-after-three-component-placement', documentSha256: digest(canonical(current)) });
    await viewportContextWorkflow(current, owners.follower);
    await control(TYPE, 'distance'); await control(NAME, 'Guide to root'); await control('[aria-label="Distancia firmada"]', '-10');
    await origin(1, 'principal-plane', null, 'YZ'); await origin(2, 'principal-plane', owners.guide, 'YZ');
    current = await apply(await preview(current, '#assembly-panel-relations button', 'Vista previa de la nueva relación', 'root-plane-preview', 1), 'root-plane-apply');
    await control(TYPE, 'parallel'); await control(NAME, 'Follower to base');
    await origin(1, 'principal-axis', owners.follower, 'Z'); await origin(2, 'principal-axis', owners.base, 'Z');
    await control('[aria-label="Orientación de la relación"]', 'aligned');
    current = await apply(await preview(current, '[aria-label="Vista previa de la nueva relación direccional"]', null, 'component-axis-preview', 2), 'component-axis-apply');
    const parallelDoc = current, originalMate = current.mates.find(m => m.name === 'Follower to base');
    await actual('button' + attr('aria-label', 'Editar relación Follower to base'));
    await control(TYPE, 'perpendicular'); await control(NAME, 'Follower to base edited');
    const canceledHistory = await uiState(); let candidate = await preview(current, '[aria-label="Vista previa de la relación direccional editada"]', null, 'edit-preview');
    const edited = candidate.document.mates.find(m => m.id === originalMate.id);
    check(edited?.type === 'perpendicular' && candidate.document.mates.length === 2 && canonical(edited.first) === canonical(originalMate.first) && canonical(edited.second) === canonical(originalMate.second), 'Edit preserves relation ID, ordered references and count');
    before = await serial(); await actual(CANCEL); await response(before, 'discard-assembly'); await recovery(current);
    await waitFor('Cancel revokes Apply and restores committed scene', () => page(selector => document.querySelector(selector)?.disabled === true && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm', APPLY));
    const afterCancel = await uiState(); check(afterCancel.undo === canceledHistory.undo && afterCancel.redo === canceledHistory.redo && afterCancel.recovery === canceledHistory.recovery, 'Canceled edit leaves committed recovery and history unchanged');
    await waitFor('direction edit fields retained for retry', () => page(() => document.querySelector('[aria-label="Tipo de relación"]')?.value === 'perpendicular' && document.querySelector('[aria-label="Nombre de la relación"]')?.value === 'Follower to base edited'));
    const retry = await preview(current, '[aria-label="Vista previa de la relación direccional editada"]', null, 'edit-retry');
    check(canonical(retry.document.mates) === canonical(candidate.document.mates), 'Retry preserves the exact edited relation intent'); current = await apply(retry, 'edit-apply');
    for (const [label, wanted] of [['Deshacer ensamblaje', parallelDoc], ['Rehacer ensamblaje', current]]) {
      before = await serial(); await actual('button' + attr('aria-label', label)); const restored = await built(before, 3, label);
      check(canonical(restored) === canonical(wanted), 'One history step restores complete authored assembly'); relationGeometry(restored);
    }
    await select(owners.follower); await actual('[aria-label="Propiedades del componente seleccionado"]');
    await actual('[aria-label="Nombre del componente"]'); before = await serial();
    await control('[aria-label="Nombre del componente"]', 'Seguidor guardado');
    check(await page(() => document.activeElement === document.querySelector('[aria-label="Nombre del componente"]')),
      'Name remains focused until the single explicit Save As click');
    // Reuse the workflow's one Save As: no Tab or blur/rebuild wait before click.
    await button('Guardar como');
    current = await builtNameAction(before, current, owners.follower, { name: 'Seguidor guardado' }, 3, 'rename-and-save-follower');
    relationGeometry(current);
    await waitFor('actual saved complete authored assembly', async () => { try { return ipc.filter(x => x.channel === 'document:save' && x.completed).length === 1 && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(current); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } });
    // Main-process file completion precedes save()'s renderer setSaved/finally.
    // Observe that commit before invoking the next guarded file action.
    await recovery(current);
    await waitFor('saved identity is clean and Open is enabled after renderer completion', () => page((name, filename) => {
      const open = document.querySelector('.assembly-quickbar button[title="Abrir"]');
      return document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
        && !!open && !open.disabled && !open.closest('[hidden]')
        && document.querySelector('.assembly-shell-document > strong')?.textContent === name
        && document.querySelector('.assembly-shell-file')?.textContent === filename;
    }, current.name, output.split(/[\\/]/).pop()));
    const saved = await fs.readFile(output); before = await serial(); await button('Abrir'); const reopened = await built(before, 3, 'saved-reopen');
    check(canonical(reopened) === canonical(current), 'Save/reopen preserves created root, imported definition, three occurrences and both relations'); relationGeometry(reopened);
    candidate = await preview(current, '[aria-label="Resolver ensamblaje"]', null, 'reopened-solve');
    check(canonical(candidate.document.mates) === canonical(current.mates), 'Fresh solve preserves saved declarations');
    before = await serial(); await actual(CANCEL); await response(before, 'discard-assembly'); await recovery(current);
    await waitFor('final committed renderer and complete worker responses', async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No final worker errors');
      return state.assemblies.every(r => !!r.response) && await page(selector => document.querySelector(selector)?.disabled === true
        && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm', APPLY);
    });
    check((await fs.readFile(input)).equals(inputBytes) && (await fs.readFile(output)).equals(saved), 'Original part and saved bytes unchanged by final solve/Cancel');
    const full = await observe(); check(!full.workerErrors.length && full.assemblies.every(r => r.response?.ok === true), 'Complete worker history contains no pending or failed assembly action');
    check(!consoleErrors.length && !failedRequests.length && dialogCounts().opens === 3 && dialogCounts().saves === 1, 'Exact import/cancel/reopen and Save dialog counts; healthy renderer');
    evidence.sourceSha256 = digest(inputBytes); evidence.savedSha256 = digest(saved); evidence.identities = { root: rootIdentity, definition, owners };
    await navigation.panel('components'); await capture(current);
  };
};
