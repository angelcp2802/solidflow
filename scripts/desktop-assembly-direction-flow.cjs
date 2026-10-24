'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Actual controls, scoped native planes/axes/LINE and authenticated worker Apply.
// Independent expectations are the original drilled prism, rotation formulas,
// direction dot/cross products and the isolated fixed/free rank, not UI helpers.
module.exports = function directionWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]', NAME = 'input[aria-label="Nombre de la relación"]';
  const ORIENTATION = 'select[aria-label="Orientación de la relación"]';
  const CREATE = 'button[aria-label="Vista previa de la nueva relación direccional"]', EDIT = 'button[aria-label="Vista previa de la relación direccional editada"]';
  const phases = [], gestures = [], evidence = { scenario: 'original-parallel-perpendicular', phases, gestures };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + '; actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const near = (actual, wanted, tolerance, label) => {
    check(Array.isArray(actual) && actual.length === wanted.length, label + ' dimensions');
    actual.forEach((value, index) => close(value, wanted[index], tolerance, label + '[' + index + ']'));
  };
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function rotate(q, point) {
    close(Math.hypot(...q), 1, 1e-10, 'Saved unit quaternion');
    const t = cross(q.slice(0, 3), point).map(value => 2 * value), c = cross(q.slice(0, 3), t);
    return point.map((value, index) => value + q[3] * t[index] + c[index]);
  }
  const body = (scene, id) => {
    const matches = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([id]));
    check(matches.length === 1, 'Exact native body missing: ' + id); return matches[0];
  };
  function face(scene, id, kind) {
    const matches = body(scene, id).faces.filter(value => value.support?.kind === kind && (kind === 'plane'
      ? Math.abs(value.support.point[2] - 4) < 1e-8 && value.support.normal[2] > .999
      : Math.abs(value.support.radius - 1) < 1e-8 && Math.abs(value.support.point[0] - 2) < 1e-8 && Math.abs(value.support.point[1]) < 1e-8));
    check(matches.length === 1, 'Expected original native ' + kind + ' support: ' + id); return matches[0];
  }
  function line(scene, id) {
    const matches = body(scene, id).edges.filter(value => value.support?.kind === 'line'
      && Math.abs(value.support.point[0] - 5) < 1e-8 && Math.abs(value.support.point[1] - 3) < 1e-8 && Math.abs(value.support.axis[2] - 1) < 1e-8);
    check(matches.length === 1, 'Expected exact original vertical LINE: ' + id); return matches[0];
  }
  const reference = value => value.selection.face ? { kind: 'face', ...value.selection, support: value.support.kind === 'plane' ? 'plane' : 'axis' }
    : { kind: 'edge', ...value.selection, support: 'line' };
  const selectionKey = value => JSON.stringify([JSON.stringify([value.selection.component.occurrencePath, value.selection.component.definition.id, value.selection.component.definition.revision]),
    value.selection.body ? [value.selection.body.bodyId, value.selection.body.sourceFeatureId] : null,
    (value.selection.face ?? value.selection.edge).sourceFeatureId, (value.selection.face ?? value.selection.edge).key]);
  function geometry(scene, document) {
    check(scene?.solidCount === 2 && scene.prototypeCount === 1 && scene.bodies.length === 2 && !scene.warnings.length, 'Original native solids/prototype changed.');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Direction solve changed embedded source geometry.');
    close(scene.volume, 480 - 8 * Math.PI, 1e-5, 'Original total volume mm3'); close(scene.area, 496 + 12 * Math.PI, 1e-5, 'Original total area mm2');
    for (const id of ['ground', 'moving']) {
      const native = body(scene, id), occurrence = document.occurrences.find(value => value.id === id), original = expected.occurrences.find(value => value.id === id);
      check(native.solidCount === 1 && canonical(native.component.definition) === canonical(original.definition), 'Native occurrence definition identity changed.');
      close(native.volume, 240 - 4 * Math.PI, 1e-5, id + ' volume'); close(native.area, 248 + 6 * Math.PI, 1e-5, id + ' area');
      if (id === 'ground') near(occurrence.pose.translation, original.pose.translation, 1e-12, 'Fixed ground origin');
      near(native.worldPose.translation, occurrence.pose.translation, 1e-12, id + ' scene/saved translation');
      const chord = Math.min(Math.hypot(...native.worldPose.rotation.map((value, i) => value - occurrence.pose.rotation[i])), Math.hypot(...native.worldPose.rotation.map((value, i) => value + occurrence.pose.rotation[i])));
      close(4 * Math.asin(Math.min(1, chord / 2)), 0, 1e-8, id + ' scene/saved physical angle');
      const corners = [];
      for (const x of [-5, 5]) for (const y of [-3, 3]) for (const z of [0, 4]) corners.push(rotate(occurrence.pose.rotation, [x, y, z]).map((value, axis) => value + occurrence.pose.translation[axis]));
      near(native.bounds.min, [0, 1, 2].map(axis => Math.min(...corners.map(point => point[axis]))), 1e-5, id + ' native placed prism minimum');
      near(native.bounds.max, [0, 1, 2].map(axis => Math.max(...corners.map(point => point[axis]))), 1e-5, id + ' native placed prism maximum');
      near(face(scene, id, 'plane').support.normal, [0, 0, 1], 1e-8, id + ' native local top normal');
      near(face(scene, id, 'cylinder').support.axis, [0, 0, -1], 1e-8, id + ' native local bore axis');
      near(line(scene, id).support.axis, [0, 0, 1], 1e-8, id + ' native canonical LINE direction');
    }
    near(document.occurrences.find(value => value.id === 'ground').pose.rotation, [0, 0, 0, 1], 1e-12, 'Ground fixed orientation');
  }
  function nativeDirection(scene, ref) {
    const owner = body(scene, ref.component.occurrencePath[0]), entity = ref.kind === 'edge' ? ref.edge : ref.face;
    check(canonical(owner.component) === canonical(ref.component) && canonical(owner.body) === canonical(ref.body), 'Native endpoint owner/revision differs.');
    const values = ref.kind === 'edge' ? owner.edges : owner.faces;
    const matches = values.filter(value => canonical(value.selection.face ?? value.selection.edge) === canonical(entity));
    check(matches.length === 1, 'Exact native endpoint absent.'); const support = matches[0].worldSupport;
    const kind = ref.kind === 'edge' ? 'line' : ref.support === 'plane' ? 'plane' : 'cylinder';
    check(support?.kind === kind, 'Native endpoint support kind changed.');
    const direction = kind === 'plane' ? support.normal : support.axis;
    close(Math.hypot(...direction), 1, 1e-8, 'Actual native direction norm'); return { kind, direction };
  }
  function relations(scene, document) {
    geometry(scene, document);
    for (const mate of document.mates.filter(value => !value.suppressed)) {
      check(mate.type === 'parallel' || mate.type === 'perpendicular', 'Unexpected relation family.');
      const a = nativeDirection(scene, mate.first), b = nativeDirection(scene, mate.second);
      const mixed = (a.kind === 'plane') !== (b.kind === 'plane'), collinear = (mate.type === 'parallel') !== mixed;
      check(collinear ? mate.alignment === 'aligned' || mate.alignment === 'opposed' : mate.alignment === null, 'Saved mixed-support orientation branch is invalid.');
      const target = collinear ? mate.alignment === 'aligned' ? 0 : Math.PI : Math.PI / 2;
      close(Math.atan2(Math.hypot(...cross(a.direction, b.direction)), dot(a.direction, b.direction)), target, 1e-6, mate.name + ' independent actual native angle rad');
    }
  }
  function record(phase, event) { phases.push({ phase, serial: event.serial, action: event.action, hasToken: event.hasToken,
    current: event.current, proposed: event.proposed, document: event.document, response: event.response.value }); }
  const idle = label => waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.assembly-spinner')));
  async function responseAfter(serial, action) {
    return waitFor('actual ' + action + ' reply', async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Actual worker error.');
      const values = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response);
      check(values.length <= 1, 'Duplicate requested operation: ' + action); const event = values[0]; if (!event) return false;
      check(event.response.ok, event.response.error || 'Actual operation rejected.'); return event;
    });
  }
  async function button(text, scope = '.assembly-app') { await assemblyNavigation.button(text, scope);
    await page((text, scope) => { const values = [...document.querySelectorAll(scope + ' button')].filter(value => value.textContent.trim() === text);
      if (values.length !== 1 || values[0].disabled) throw Error('Exact enabled control absent: ' + text); values[0].click(); }, text, scope);
  }
  async function control(selector, value) { await assemblyNavigation.reveal(selector);
    await page((selector, value) => { const element = document.querySelector(selector); if (!element || element.disabled) throw Error('Editable control absent: ' + selector);
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (element instanceof HTMLSelectElement && ![...element.options].some(option => option.value === value && !option.disabled)) throw Error('Enabled native option absent.');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('control rendered ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function recovery(document, label) {
    await waitFor(label + ' idle committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
      && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  function ready(event, count, dof) {
    const value = event.response.value;
    check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count, 'Expected authenticated direction preview.');
    check(value.scopes.length === 1 && !value.scopes[0].temporaryAnchor && value.scopes[0].result.localDOF === dof && value.scopes[0].result.rank === 6 - dof, 'Wrong natural fixed/free direction rank or DOF.');
    check(value.checks.length === value.document.mates.filter(mate => !mate.suppressed).length && value.checks.every(check => check.satisfied && check.lengthResidual <= check.lengthTolerance && check.angleResidual <= check.angleTolerance), 'Actual native direction checks failed.');
    relations(value.scene, value.document); return value;
  }
  async function apply(event, label) {
    await idle(label + ' preview idle'); await waitFor(label + ' Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly');
    check(applied.response.value.kind === 'assembly-applied' && applied.hasToken, 'Direction Apply lost capability.');
    const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = applied.response.value.document;
    check(canonical(a) === canonical(b), 'Apply changed authenticated direction candidate.'); relations(applied.response.value.scene, applied.response.value.document);
    await recovery(applied.response.value.document, label); record(label + '/apply', applied); return applied.response.value;
  }
  async function cancel(base, label) {
    await idle(label + ' preview idle'); await click(CANCEL); await recovery(base.document, label);
    await waitFor(label + ' committed scene label restored', () => page(() => document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm'
      && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true));
  }
  async function choose(slot, selected) {
    await click('button[aria-label="Referencia ' + (slot + 1) + ' de la relación"]');
    const edge = !!selected.selection.edge;
    await control(edge ? 'select[aria-label="Arista de referencia"]' : 'select[aria-label="Cara de referencia"]', selectionKey(selected));
    await button('Usar ' + (edge ? 'arista' : 'cara') + ' en referencia ' + (slot + 1));
  }
  async function orientation(value) {
    await waitFor('orientation branch rendered', () => page(value => value === 'null' ? !document.querySelector('select[aria-label="Orientación de la relación"]')
      : document.querySelector('select[aria-label="Orientación de la relación"]')?.disabled === false, value === null ? 'null' : value));
    if (value !== null) await control(ORIENTATION, value);
  }
  async function add(base, label, type, first, second, alignment, dof, pointerEdge = false) {
    await control(TYPE, type); await waitFor('direction authoring mounted', () => page(selector => !!document.querySelector(selector), CREATE));
    await choose(0, first);
    if (pointerEdge) await pickLine(base.scene, second); else await choose(1, second);
    await control(NAME, label); await orientation(alignment);
    const before = await observe(); await click(CREATE); const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, base.document.mates.length + 1, dof);
    const mate = result.document.mates.at(-1);
    check(mate.type === type && mate.name === label && mate.alignment === alignment && canonical(mate.first) === canonical(reference(first)) && canonical(mate.second) === canonical(reference(second)), 'Selected exact native direction intention changed.');
    record(label + '/preview', event); return event;
  }
  async function edit(base, label, type, alignment, dof) {
    const mate = base.document.mates[0]; await click('button[aria-label="Editar relación ' + mate.name + '"]');
    await waitFor('saved direction editor rendered', () => page((selector, name) => document.querySelector(selector)?.value === name, NAME, mate.name));
    await control(TYPE, type); await control(NAME, label); await orientation(alignment);
    const before = await observe(); await click(EDIT); const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 1, dof), edited = result.document.mates[0];
    check(edited.id === mate.id && edited.type === type && edited.name === label && edited.alignment === alignment
      && canonical(edited.first) === canonical(mate.first) && canonical(edited.second) === canonical(mate.second), 'Edit replaced or duplicated the existing direction relation.');
    check(await page(selector => document.querySelector(selector)?.disabled === true, TYPE), 'Direction family remains editable during its preview.');
    record(label + '/preview', event); return event;
  }
  async function suppression(base, suppressed, label, dof) {
    const mate = base.document.mates[0], before = await observe(); await click('input[aria-label="Activar ' + mate.name + '"]');
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 1, dof);
    check(result.document.mates[0].id === mate.id && result.document.mates[0].suppressed === suppressed, 'Suppression changed relation identity.');
    record(label + '/preview', event); return event;
  }
  async function remove(base, label) {
    const before = await observe(); await click('button[aria-label="Eliminar ' + base.document.mates[0].name + '"]');
    const event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 0, 6); record(label + '/preview', event); return event;
  }
  async function history(action, wanted, label) {
    const before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]');
    const event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(wanted), 'History did not restore exactly one committed state.');
    relations(event.response.value, event.document); await recovery(event.document, label); record(label, event); return { document: event.document, scene: event.response.value };
  }
  async function pickLine(scene, selected) {
    await button('Superior', '.assembly-view-tools'); await click('button[aria-label="Seleccionar aristas lineales"]');
    await waitFor('actual LINE pointer mode', () => page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === 'edge'));
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const center = scene.visibleBounds.min.map((value, i) => (value + scene.visibleBounds.max[i]) / 2), span = Math.hypot(...scene.visibleBounds.max.map((value, i) => value - scene.visibleBounds.min[i]));
    const midpoint = [25, 9 + 1.5 * Math.sqrt(3), 7.5 + Math.sqrt(3)], pixels = rect.height / (1.3 * span);
    check(selected.lines.length >= 6 && selected.lines.every(Number.isFinite), 'Native LINE has no display segments.');
    const point = { x: rect.x + rect.width / 2 + (midpoint[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (midpoint[1] - center[1]) * pixels };
    const before = await observe(); await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point);
    await waitFor('actual scoped LINE selected by pointer', () => page(key => document.querySelector('select[aria-label="Arista de referencia"]')?.value === key
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', selectionKey(selected)));
    check((await observe()).serial === before.serial, 'Reference pointer selection performed CAD work.'); gestures.push({ kind: 'native-direction-line', point, selection: selected.selection, midpoint });
  }
  return async function workflow() {
    const originalBytes = await fsp.readFile(input); evidence.fixtureSha256 = digest(originalBytes);
    check(expected.id === 'assembly-direction-original' && expected.mates.length === 0 && expected.occurrences.length === 2, 'Expected original two-component direction fixture.');
    await waitFor('initial part production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('initial document replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Opening changed the original fixture.');
    let committed = { document: event.document, scene: event.response.value }; geometry(committed.scene, committed.document);
    near(committed.scene.bounds.min, [-5, -3, 0], 1e-5, 'Original overall minimum'); near(committed.scene.bounds.max, [25, 10 + 1.5 * Math.sqrt(3), 7.5 + 2 * Math.sqrt(3)], 1e-5, 'Original overall maximum');
    await recovery(committed.document, 'original'); record('open/original', event);
    event = await add(committed, 'Plano y LINE perpendicular', 'perpendicular', face(committed.scene, 'ground', 'plane'), line(committed.scene, 'moving'), 'aligned', 4, true);
    await cancel(committed, 'pointer candidate cancelled');
    event = await add(committed, 'Plano y LINE perpendicular', 'perpendicular', face(committed.scene, 'ground', 'plane'), line(committed.scene, 'moving'), 'aligned', 4);
    committed = await apply(event, 'line-perpendicular'); const lineCommitted = committed.document;
    committed = await history('undo', expected, 'undo/one-direction'); committed = await history('redo', lineCommitted, 'redo/one-direction');
    event = await edit(committed, 'Plano y LINE paralela', 'parallel', null, 5); committed = await apply(event, 'line-parallel');
    event = await suppression(committed, true, 'line-suppress-cancel', 6); await cancel(committed, 'suppression cancelled');
    event = await suppression(committed, true, 'line-suppressed', 6); committed = await apply(event, 'line-suppressed');
    event = await suppression(committed, false, 'line-reactivated', 5); committed = await apply(event, 'line-reactivated');
    event = await remove(committed, 'line-delete-cancel'); await cancel(committed, 'deletion cancelled');
    event = await remove(committed, 'line-deleted'); committed = await apply(event, 'line-deleted');
    event = await add(committed, 'Planos paralelos', 'parallel', face(committed.scene, 'ground', 'plane'), face(committed.scene, 'moving', 'plane'), 'aligned', 4); committed = await apply(event, 'planes-aligned');
    event = await edit(committed, 'Planos opuestos', 'parallel', 'opposed', 4); await cancel(committed, 'opposed edit cancelled');
    event = await edit(committed, 'Planos opuestos', 'parallel', 'opposed', 4); committed = await apply(event, 'planes-opposed');
    event = await edit(committed, 'Planos opuestos renombrados', 'parallel', 'opposed', 4); committed = await apply(event, 'planes-renamed');
    await control(TYPE, 'parallel'); await choose(0, face(committed.scene, 'ground', 'cylinder')); await choose(1, face(committed.scene, 'moving', 'cylinder')); await control(NAME, 'Ejes incompatibles'); await orientation('aligned');
    before = await observe(); await click(CREATE); event = await responseAfter(before.serial, 'preview-assembly');
    check(canonical(event.current) === canonical(committed.document) && event.proposed?.mates.length === 2
      && event.proposed.mates.at(-1).type === 'parallel' && event.proposed.mates.at(-1).alignment === 'aligned', 'Conflict request did not contain the intended two relations.');
    check(event.response.value.status === 'rejected' && event.response.value.reason === 'numeric'
      && event.response.value.scopes.some(scope => ['inconsistent', 'nonConverged'].includes(scope.result.status)), 'Conflicting native direction constraints were falsely accepted or failed before numerical verification.');
    await idle('direction conflict idle'); check(await page(selector => document.querySelector(selector)?.disabled === true, APPLY), 'Apply enabled after conflict.');
    await recovery(committed.document, 'conflict preservation'); record('conflict/rejected', event);
    // A rejected candidate has no Apply capability; Resolver/Cancel are not used
    // to manufacture one. The next operation starts from the same committed base.
    event = await remove(committed, 'planes-deleted'); committed = await apply(event, 'planes-deleted');
    event = await add(committed, 'Ejes paralelos', 'parallel', face(committed.scene, 'ground', 'cylinder'), face(committed.scene, 'moving', 'cylinder'), 'aligned', 4); committed = await apply(event, 'axes-parallel');
    event = await remove(committed, 'axes-deleted'); committed = await apply(event, 'axes-deleted');
    event = await add(committed, 'Plano y eje paralelos', 'parallel', face(committed.scene, 'ground', 'plane'), face(committed.scene, 'moving', 'cylinder'), null, 5); committed = await apply(event, 'mixed-axis-parallel');
    event = await edit(committed, 'Plano y eje perpendicular', 'perpendicular', 'opposed', 4); committed = await apply(event, 'mixed-axis-perpendicular');
    await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)');
    await waitFor('actual Save As and file IPC', async () => {
      if (dialogCounts().saves !== 1 || !ipc.some(value => value.channel === 'document:save' && value.completed)) return false;
      try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    });
    await idle('saved direction idle'); const savedBytes = await fsp.readFile(output);
    before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(committed.document), 'Reopen changed the relation graph or placements.'); relations(event.response.value, event.document);
    committed = { document: event.document, scene: event.response.value }; await recovery(committed.document, 'reopened'); record('reopen/committed', event);
    await waitFor('reopen resets history', () => page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true));
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 1, 4); record('reopen/fresh-native', event); await cancel(committed, 'reopened solve cancelled');
    await button('Isométrica', '.assembly-view-tools'); await capture(committed.document);
    const state = await observe(), counts = dialogCounts();
    check(phases.length === 36 && phases.filter(value => value.action === 'apply-assembly').length === 13 && gestures.length === 1, 'Unexpected direction workflow coverage/count.');
    check(counts.opens === 2 && counts.saves === 1 && counts.csvExports === 0 && ipc.every(value => value.completed), 'Unexpected file dialogs or incomplete file IPC.');
    check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request error.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200) && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Real worker/WASM load absent.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes) && digest(await fsp.readFile(output)) === digest(savedBytes), 'Workflow changed original or saved bytes after reopen.');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: committed.document,
      independentOracles: 'Two native drilled prisms:V480-8pi mm3,A496+12pi mm2;per-body V240-4pi/A248+6pi and transformed outer-corner bounds1e-5;fixed-ground origin and scene/saved translation1e-12mm;moving origin remains free;native top+Z,bore-axis-Z,LINE+Z at1e-8;actual world direction angles1e-6rad;natural rank2/DOF4 collinear,rank1/DOF5 orthogonal,rank0/DOF6 suppressed/deleted.',
      limits: 'Original fixed/free two-component cases only. Scripted controls and one actual Chromium LINE pointer; dialog paths test-owned. No state/CAD reply injection, complete27-combination desktop matrix, global mobility, contact, human dialogs, packages or platform generalization.' });
  };
};
