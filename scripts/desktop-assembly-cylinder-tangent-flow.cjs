'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Actual controls and native face pointer. Analytical cylinder bounds, volumes,
// areas and support equations are independent of the product/model helpers.
module.exports = function cylinderTangentWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { cylinderTangentFixtures, cylinderTangentInputs, cylinderTangentOutputs, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]', NAME = 'input[aria-label="Nombre de la relación"]';
  const BRANCH = 'select[aria-label="Rama de tangencia entre cilindros"]', LARGER = 'select[aria-label="Superficie de mayor radio"]';
  const CREATE = 'button[aria-label="Vista previa de la nueva tangencia entre cilindros"]', EDIT = 'button[aria-label="Vista previa de la tangencia entre cilindros editada"]';
  const SUMMARY = '[aria-label="Tangencias entre cilindros verificadas"]', cases = [];
  checks.push({ scenario: 'original-cylinder-cylinder-tangency', cases });
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance, label + '; actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const near = (actual, wanted, tolerance, label) => { check(Array.isArray(actual) && actual.length === wanted.length, label + ' dimensions'); actual.forEach((value, i) => close(value, wanted[i], tolerance, label + '[' + i + ']')); };
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const subtract = (a, b) => a.map((value, i) => value - b[i]);
  function rotate(q, point) {
    close(Math.hypot(...q), 1, 1e-10, 'Saved unit quaternion');
    const t = cross(q.slice(0, 3), point).map(value => 2 * value), c = cross(q.slice(0, 3), t);
    return point.map((value, i) => value + q[3] * t[i] + c[i]);
  }
  function body(scene, id) {
    const values = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([id])); check(values.length === 1, 'Exact original body missing: ' + id); return values[0];
  }
  function face(scene, id) {
    const values = body(scene, id).faces.filter(value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - (id === 'fixed' ? 2 : 3)) < 1e-8);
    check(values.length === 1, 'Exact original native cylinder face missing: ' + id); return values[0];
  }
  const reference = value => ({ kind: 'face', ...value.selection, support: 'cylinder-surface' });
  const selectionKey = value => JSON.stringify([JSON.stringify([value.selection.component.occurrencePath, value.selection.component.definition.id, value.selection.component.definition.revision]), value.selection.body ? [value.selection.body.bodyId, value.selection.body.sourceFeatureId] : null, value.selection.face.sourceFeatureId, value.selection.face.key]);
  function geometry(scene, document, original) {
    check(scene?.solidCount === 2 && scene.prototypeCount === 2 && scene.bodies.length === 2 && !scene.warnings.length, 'Original native solids/prototypes changed.');
    check(canonical(document.definitions) === canonical(original.definitions), 'Tangency changed embedded sources.');
    close(scene.volume, 138 * Math.PI, 1e-5, 'Total volume mm3'); close(scene.area, 134 * Math.PI, 1e-5, 'Total area mm2');
    const minima = [], maxima = [];
    for (const id of ['fixed', 'moving']) {
      const native = body(scene, id), occurrence = document.occurrences.find(value => value.id === id), source = original.occurrences.find(value => value.id === id), radius = id === 'fixed' ? 2 : 3, height = id === 'fixed' ? 12 : 10;
      check(native.solidCount === 1 && canonical(native.component.definition) === canonical(source.definition), 'Original definition identity changed.');
      check(canonical(native.body) === canonical({ bodyId: id + '-body', sourceFeatureId: id + '-body-solid' }), 'Original body state changed.');
      close(native.volume, Math.PI * radius * radius * height, 1e-5, id + ' volume'); close(native.area, 2 * Math.PI * radius * (radius + height), 1e-5, id + ' area');
      near(native.worldPose.translation, occurrence.pose.translation, 1e-12, id + ' scene/saved translation');
      const chord = Math.min(Math.hypot(...subtract(native.worldPose.rotation, occurrence.pose.rotation)), Math.hypot(...native.worldPose.rotation.map((value, i) => value + occurrence.pose.rotation[i])));
      close(4 * Math.asin(Math.min(1, chord / 2)), 0, 1e-8, id + ' scene/saved physical angle');
      if (id === 'fixed') { near(occurrence.pose.translation, [0, 0, -6], 1e-12, 'Fixed origin'); near(occurrence.pose.rotation, [0, 0, 0, 1], 1e-12, 'Fixed quaternion'); check(occurrence.fixed === true, 'Ground became free.'); }
      else check(occurrence.fixed === false, 'Moving owner became fixed.');
      const axis = rotate(occurrence.pose.rotation, [0, 0, 1]), c0 = occurrence.pose.translation, c1 = c0.map((value, i) => value + height * axis[i]), extent = axis.map(value => radius * Math.sqrt(Math.max(0, 1 - value * value)));
      const min = c0.map((value, i) => Math.min(value, c1[i]) - extent[i]), max = c0.map((value, i) => Math.max(value, c1[i]) + extent[i]);
      near(native.bounds.min, min, 1e-5, id + ' exact cylinder minimum'); near(native.bounds.max, max, 1e-5, id + ' exact cylinder maximum'); minima.push(min); maxima.push(max);
    }
    near(scene.bounds.min, [0, 1, 2].map(i => Math.min(...minima.map(value => value[i]))), 1e-5, 'Overall minimum'); near(scene.bounds.max, [0, 1, 2].map(i => Math.max(...maxima.map(value => value[i]))), 1e-5, 'Overall maximum');
  }
  function nativeSupport(scene, ref) {
    check(ref.kind === 'face' && ref.support === 'cylinder-surface' && ref.component.occurrencePath.length === 1, 'Expected exact cylindrical-surface reference.');
    const owner = body(scene, ref.component.occurrencePath[0]); check(canonical(owner.component) === canonical(ref.component) && canonical(owner.body) === canonical(ref.body), 'Reference owner/revision/body changed.');
    const values = owner.faces.filter(value => canonical(value.selection.face) === canonical(ref.face)); check(values.length === 1 && values[0].worldSupport?.kind === 'cylinder', 'Fresh native cylindrical support absent.'); return values[0].worldSupport;
  }
  function relations(scene, document, original) {
    geometry(scene, document, original);
    for (const mate of document.mates.filter(value => !value.suppressed && (value.type === 'skew-cylinder-tangent' || value.type === 'parallel-cylinder-tangent'))) {
      const first = nativeSupport(scene, mate.first), second = nativeSupport(scene, mate.second), normal = cross(first.axis, second.axis), sine = Math.hypot(...normal), delta = subtract(second.point, first.point);
      close(Math.hypot(...first.axis), 1, 1e-10, 'First unit native axis'); close(Math.hypot(...second.axis), 1, 1e-10, 'Second unit native axis');
      let distance;
      if (mate.type === 'skew-cylinder-tangent') { check(sine > 1e-6, 'Nonparallel tangency left its admitted chart.'); distance = Math.abs(dot(delta, normal)) / sine; }
      else { close(Math.atan2(sine, Math.abs(dot(first.axis, second.axis))), 0, 1e-6, 'Parallel native axis angle rad'); distance = Math.hypot(...delta.map((value, i) => value - dot(delta, first.axis) * first.axis[i])); }
      const target = mate.branch.kind === 'external' ? first.radius + second.radius : mate.branch.larger === 'first' ? first.radius - second.radius : second.radius - first.radius;
      check(target > 0, 'Declared internal larger role does not match actual radii.'); close(distance, target, 1e-6, mate.name + ' independent axis distance mm');
    }
  }
  const idle = label => waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.assembly-spinner')));
  async function responseAfter(serial, action) {
    return waitFor('actual ' + action + ' reply', async () => { const state = await observe(); check(!state.workerErrors.length, 'Actual worker error.'); const values = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response); check(values.length <= 1, 'Duplicate operation: ' + action); const event = values[0]; if (!event) return false; check(event.response.ok, event.response.error || 'Actual operation failed.'); return event; });
  }
  async function button(text, scope = '.assembly-app') { await assemblyNavigation.button(text, scope); await page((text, scope) => { const values = [...document.querySelectorAll(scope + ' button')].filter(value => value.textContent.trim() === text); if (values.length !== 1 || values[0].disabled) throw Error('Exact enabled control absent: ' + text); values[0].click(); }, text, scope); }
  async function control(selector, value) { await assemblyNavigation.reveal(selector);
    await page((selector, value) => { const element = document.querySelector(selector); if (!element || element.disabled) throw Error('Editable control absent: ' + selector); const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; if (element instanceof HTMLSelectElement && ![...element.options].some(option => option.value === value && !option.disabled)) throw Error('Enabled option absent.'); Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, selector, value);
    await waitFor('control rendered ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function recovery(document, label) { await waitFor(label + ' idle committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false') && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document)); }
  async function choose(slot, selected) { await click('button[aria-label="Referencia ' + (slot + 1) + ' de la relación"]'); await control('select[aria-label="Cara de referencia"]', selectionKey(selected)); await button('Usar cara en referencia ' + (slot + 1)); }
  return async function workflow() {
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    for (const family of ['skew', 'parallel']) {
      const expected = cylinderTangentFixtures[family], input = cylinderTangentInputs[family], output = cylinderTangentOutputs[family], type = family === 'skew' ? 'skew-cylinder-tangent' : 'parallel-cylinder-tangent', naturalDOF = family === 'skew' ? 5 : 3;
      const originalBytes = await fsp.readFile(input), phases = [], gestures = [], evidence = { family, phases, gestures, fixtureSha256: digest(originalBytes) }; cases.push(evidence);
      check(expected.id === 'assembly-cylinder-tangent-' + family + '-original' && expected.mates.length === 0 && expected.occurrences.length === 2, 'Expected original unmated cylinder fixture.');
      const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action, hasToken: event.hasToken, current: event.current, proposed: event.proposed, document: event.document, response: event.response.value });
      function ready(event, count, dof) {
        const value = event.response.value, active = value.document?.mates.filter(mate => !mate.suppressed) ?? [], tangentMates = active.filter(mate => mate.type === type);
        if (!(value?.status === 'ready' && value.hasToken && value.document.mates.length === count)) evidence.failedPreview = { serial: event.serial, action: event.action, current: event.current, proposed: event.proposed, response: value, expectedCount: count, expectedDOF: dof };
        check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count, 'Expected authenticated native cylinder tangency preview.');
        check(value.scopes.length === 1 && !value.scopes[0].temporaryAnchor && value.scopes[0].result.localDOF === dof && value.scopes[0].result.rank === 6 - dof, 'Wrong natural rank or DOF.');
        check(value.checks.length === active.length && value.checks.every(check => check.satisfied && check.lengthResidual <= check.lengthTolerance && check.angleResidual <= check.angleTolerance), 'Native checks are unsatisfied.');
        const reports = value.cylinderTangencies ?? []; check(Array.isArray(reports) && reports.length === tangentMates.length, 'Fresh cylinder report count differs.');
        for (const report of reports) { const mate = tangentMates.find(value => value.id === report.mateId); check(mate && report.kind === type && canonical(report.scopePath) === '[]' && canonical(report.branch) === canonical(mate.branch) && report.radialMaterialSense.first === 1 && report.radialMaterialSense.second === 1 && report.supportOnly === true && report.normalRelation === (mate.branch.kind === 'external' ? 'opposed' : 'same'), 'Fresh outer-cylinder report differs.'); }
        relations(value.scene, value.document, expected); return value;
      }
      async function readyUi(event) {
        await idle('cylinder preview idle'); const active = event.response.value.document.mates.filter(value => !value.suppressed && value.type === type);
        await waitFor('fresh named report and locked intent controls', () => page((selector, branchSelector, nameSelector, reportSelector, name) => document.querySelector(selector)?.disabled === true && document.querySelector(branchSelector)?.disabled === true && document.querySelector(nameSelector)?.disabled === true && (name ? document.querySelector(reportSelector)?.textContent.includes(name) && document.querySelector(reportSelector)?.textContent.includes('no comprueba contacto entre caras finitas') : !document.querySelector(reportSelector)), TYPE, BRANCH, NAME, SUMMARY, active[0]?.name ?? ''));
      }
      async function apply(event, label, direction = false) {
        if (direction) await idle(label + ' idle'); else await readyUi(event);
        await waitFor(label + ' Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY)); const before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly');
        check(applied.response.value.kind === 'assembly-applied' && applied.hasToken, 'Apply lost authority.'); const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = applied.response.value.document; check(canonical(a) === canonical(b), 'Apply changed authenticated candidate.'); relations(applied.response.value.scene, applied.response.value.document, expected); await recovery(applied.response.value.document, label); await waitFor('support report cleared after Apply', () => page(selector => !document.querySelector(selector), SUMMARY)); record(label + '/apply', applied); return applied.response.value;
      }
      async function cancel(base, label) { await idle(label + ' idle'); await click(CANCEL); await recovery(base.document, label); await waitFor(label + ' committed view', () => page((applySelector, reportSelector) => document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm' && document.querySelector(applySelector)?.disabled === true && !document.querySelector(reportSelector), APPLY, SUMMARY)); }
      async function pickFixed(scene, selected) {
        await button('Frontal', '.assembly-view-tools'); await click('button[aria-label="Referencia 1 de la relación"]'); await waitFor('actual face pointer mode', () => page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === 'face'));
        await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        const center = scene.visibleBounds.min.map((value, i) => (value + scene.visibleBounds.max[i]) / 2), span = Math.hypot(...subtract(scene.visibleBounds.max, scene.visibleBounds.min)), surfacePoint = [0, -2, 0], pixels = rect.height / (1.3 * span), point = { x: rect.x + rect.width / 2 + (surfacePoint[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (surfacePoint[2] - center[2]) * pixels };
        check(Number.isSafeInteger(selected.vertexCount) && selected.vertexCount > 0 && Number.isSafeInteger(selected.triangleCount) && selected.triangleCount > 0, 'Actual cylindrical face has no display mesh.');
        const before = await observe(); await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point);
        await waitFor('exact fixed surface selected by actual pointer', () => page(key => document.querySelector('select[aria-label="Cara de referencia"]')?.value === key && document.querySelector('button[aria-label="Referencia 1 de la relación"]')?.textContent.includes('Superficie cilíndrica') && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', selectionKey(selected)));
        check((await observe()).serial === before.serial, 'Pointer selection performed CAD work.'); gestures.push({ kind: 'native-cylinder-surface-face', surfacePoint, point, selection: selected.selection });
      }
      async function add(base, label, internal, reversed = false, pointerFace = false) {
        await control(TYPE, type); await waitFor('cylinder authoring mounted', () => page(selector => !!document.querySelector(selector), CREATE));
        const first = face(base.scene, reversed ? 'moving' : 'fixed'), second = face(base.scene, reversed ? 'fixed' : 'moving'); if (pointerFace) await pickFixed(base.scene, first); else await choose(0, first); await choose(1, second);
        await control(NAME, label); await control(BRANCH, internal ? 'internal' : 'external'); if (internal) { await waitFor('explicit larger role mounted', () => page(selector => !!document.querySelector(selector) && document.querySelector(selector).value === '', LARGER)); await control(LARGER, reversed ? 'first' : 'second'); }
        const before = await observe(); await click(CREATE); const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, base.document.mates.length + 1, naturalDOF), mate = result.document.mates.at(-1);
        check(mate.type === type && mate.name === label && canonical(mate.branch) === canonical(internal ? { kind: 'internal', larger: reversed ? 'first' : 'second' } : { kind: 'external' }) && canonical(mate.first) === canonical(reference(first)) && canonical(mate.second) === canonical(reference(second)), 'Saved cylinder order/purpose/branch changed.'); await readyUi(event); record(label + '/preview', event); return event;
      }
      async function edit(base, label, internal) {
        const mate = base.document.mates[0]; await click('button[aria-label="Editar tangencia entre cilindros ' + mate.name + '"]'); await waitFor('saved cylinder editor mounted', () => page((nameSelector, branchSelector, name, branch) => document.querySelector(nameSelector)?.value === name && document.querySelector(branchSelector)?.value === branch, NAME, BRANCH, mate.name, mate.branch.kind));
        await control(NAME, label); if (mate.branch.kind !== (internal ? 'internal' : 'external')) await control(BRANCH, internal ? 'internal' : 'external'); if (internal) { await waitFor('larger role mounted', () => page(selector => !!document.querySelector(selector), LARGER)); await control(LARGER, mate.first.component.occurrencePath[0] === 'moving' ? 'first' : 'second'); }
        const before = await observe(); await click(EDIT); const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 1, naturalDOF), changed = result.document.mates[0];
        check(changed.id === mate.id && changed.type === type && changed.name === label && canonical(changed.first) === canonical(mate.first) && canonical(changed.second) === canonical(mate.second) && changed.branch.kind === (internal ? 'internal' : 'external'), 'Edit replaced identity, family or exact references.'); await readyUi(event); record(label + '/preview', event); return event;
      }
      async function suppression(base, suppressed, label) { const mate = base.document.mates[0], before = await observe(); await click('input[aria-label="Activar ' + mate.name + '"]'); const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 1, suppressed ? 6 : naturalDOF); check(result.document.mates[0].id === mate.id && result.document.mates[0].suppressed === suppressed, 'Suppression changed identity.'); await readyUi(event); record(label + '/preview', event); return event; }
      async function remove(base, label, index = 0) { const before = await observe(); await click('button[aria-label="Eliminar ' + base.document.mates[index].name + '"]'); const event = await responseAfter(before.serial, 'preview-assembly'); ready(event, base.document.mates.length - 1, index ? naturalDOF : 6); await readyUi(event); record(label + '/preview', event); return event; }
      async function history(action, wanted, label) { const before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]'); const event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(wanted), 'History did not restore exactly one state.'); relations(event.response.value, event.document, expected); await recovery(event.document, label); record(label, event); return { document: event.document, scene: event.response.value }; }
      let before = await observe(); if (family === 'skew') { await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]'))); await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]'); } else await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
      let event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Open changed original fixture.'); let committed = { document: event.document, scene: event.response.value }; geometry(committed.scene, committed.document, expected);
      near(committed.scene.bounds.min, family === 'skew' ? [-2, -5, -6] : [-2, -3, -6], 1e-5, 'Initial bounds minimum'); near(committed.scene.bounds.max, family === 'skew' ? [10, 5, 6] : [10, 3, 6], 1e-5, 'Initial bounds maximum'); await recovery(committed.document, 'original ' + family); record('open/original', event);
      event = await add(committed, 'Tangencia externa ' + family, false, false, true); await cancel(committed, 'pointer candidate cancelled');
      event = await add(committed, 'Tangencia externa ' + family, false); committed = await apply(event, 'external'); const external = committed.document;
      committed = await history('undo', expected, 'undo/one-tangency'); committed = await history('redo', external, 'redo/one-tangency');
      event = await edit(committed, 'Tangencia interna ' + family, true); await cancel(committed, 'internal edit cancelled'); event = await edit(committed, 'Tangencia interna ' + family, true); committed = await apply(event, 'internal');
      event = await suppression(committed, true, 'suppress-cancel'); await cancel(committed, 'suppression cancelled'); event = await suppression(committed, true, 'suppressed'); committed = await apply(event, 'suppressed'); event = await suppression(committed, false, 'reactivated'); committed = await apply(event, 'reactivated');
      await control(TYPE, type); await choose(0, face(committed.scene, 'fixed')); await choose(1, face(committed.scene, 'moving')); await control(NAME, 'Ramas incompatibles ' + family); await control(BRANCH, 'external'); before = await observe(); await click(CREATE); event = await responseAfter(before.serial, 'preview-assembly');
      check(canonical(event.current) === canonical(committed.document) && event.proposed?.mates.length === 2 && event.proposed.mates.at(-1).type === type && event.proposed.mates.at(-1).branch.kind === 'external', 'Conflict request lost intended surfaces.'); check(event.response.value.status === 'rejected' && event.response.value.reason === 'numeric' && event.response.value.scopes.some(scope => ['inconsistent', 'nonConverged'].includes(scope.result.status)), 'External/internal conflict was falsely accepted or failed before numeric verification.'); await idle('conflict idle'); check(await page((applySelector, reportSelector) => document.querySelector(applySelector)?.disabled === true && !document.querySelector(reportSelector), APPLY, SUMMARY), 'Rejected candidate exposed Apply/report.'); await recovery(committed.document, 'conflict preservation'); record('conflict/rejected', event);
      event = await remove(committed, 'delete-cancel'); await cancel(committed, 'deletion cancelled'); event = await remove(committed, 'deleted'); committed = await apply(event, 'deleted'); event = await add(committed, 'Orden invertido interno ' + family, true, true); committed = await apply(event, 'reversed-order');
      if (family === 'parallel') {
        // Compatible explicit direction, authored with current axis references.
        // Pure edit navigation must not retain a hidden editor lock or do CAD work.
        await control(TYPE, 'parallel'); await waitFor('direction authoring mounted', () => page(() => !!document.querySelector('[aria-label="Relación paralela o perpendicular"]'))); await choose(0, face(committed.scene, 'fixed')); await choose(1, face(committed.scene, 'moving')); await control(NAME, 'Dirección temporal'); await control('select[aria-label="Orientación de la relación"]', 'aligned'); before = await observe(); await click('button[aria-label="Vista previa de la nueva relación direccional"]'); event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 2, naturalDOF); record('cross-editor/direction-preview', event); committed = await apply(event, 'cross-editor/direction', true);
        const mate = committed.document.mates[0], serial = (await observe()).serial; await click('button[aria-label="Editar tangencia entre cilindros ' + mate.name + '"]'); await waitFor('CC edit family locked', () => page(selector => document.querySelector(selector)?.disabled === true, TYPE)); await click('button[aria-label="Editar relación Dirección temporal"]'); await waitFor('direction edit replaces CC editor', () => page((typeSelector, nameSelector) => document.querySelector(typeSelector)?.value === 'parallel' && document.querySelector(typeSelector)?.disabled === false && document.querySelector(nameSelector)?.value === 'Dirección temporal' && !document.querySelector('[aria-label="Tangencia entre superficies cilíndricas"]'), TYPE, NAME)); await click('button[aria-label="Cerrar edición de relación direccional"]'); await waitFor('direction closure releases CC option', () => page(selector => [...document.querySelector(selector).options].filter(option => option.value.endsWith('cylinder-tangent')).every(option => !option.disabled), TYPE)); await click('button[aria-label="Editar tangencia entre cilindros ' + mate.name + '"]'); await waitFor('CC editor remounted', () => page(selector => !!document.querySelector(selector), EDIT)); await click('button[aria-label="Cerrar edición de tangencia entre cilindros"]'); await waitFor('CC closure releases direction option', () => page(selector => !document.querySelector(selector).disabled && [...document.querySelector(selector).options].find(option => option.value === 'parallel').disabled === false, TYPE)); check((await observe()).serial === serial, 'Editor navigation performed CAD work.');
        evidence.editorTransitions = ['cylinder-to-direction', 'direction-close-to-cylinder', 'cylinder-close-to-direction']; event = await remove(committed, 'cross-editor/delete-direction', 1); committed = await apply(event, 'cross-editor/delete-direction');
      }
      event = await edit(committed, 'Tangencia de cilindros guardada ' + family, true); committed = await apply(event, 'renamed'); await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)');
      await waitFor('actual Save As and file IPC', async () => { if (dialogCounts().saves !== (family === 'skew' ? 1 : 2) || ipc.filter(value => value.channel === 'document:save' && value.completed).length !== (family === 'skew' ? 1 : 2)) return false; try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }); await idle('saved cylinder idle'); const savedBytes = await fsp.readFile(output);
      before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(committed.document), 'Reopen changed saved sources/order/branch/poses.'); relations(event.response.value, event.document, expected); committed = { document: event.document, scene: event.response.value }; await recovery(committed.document, 'reopened'); record('reopen/committed', event); await waitFor('reopen resets history', () => page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true));
      before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 1, naturalDOF); await readyUi(event); record('reopen/fresh-native', event); await cancel(committed, 'reopened solve cancelled');
      const finalMate = committed.document.mates[0]; check(committed.document.mates.length === 1 && !finalMate.suppressed && finalMate.type === type && finalMate.branch.kind === 'internal' && finalMate.branch.larger === 'first' && finalMate.first.component.occurrencePath[0] === 'moving' && finalMate.second.component.occurrencePath[0] === 'fixed', 'Final explicit internal reversed intent changed.');
      check(phases.length === (family === 'skew' ? 24 : 28) && phases.filter(value => value.action === 'apply-assembly').length === (family === 'skew' ? 7 : 9) && gestures.length === 1, 'Unexpected per-fixture coverage/count.'); check(digest(await fsp.readFile(input)) === digest(originalBytes) && digest(await fsp.readFile(output)) === digest(savedBytes), 'Original or saved bytes changed after reopen.');
      Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: committed.document, independentOracles: 'Original cylinders fixedR2H12/movingR3H10,totalV138pi/A134pi;exact placed bounds capcenters t,t+H*QZ plus R*sqrt(1-axis_i^2),V/A/bounds1e-5;fixed posecomponents andscene/savedtranslation1e-12,physicalqangle1e-8rad;native nonparallel shortestaxisdistance abs(delta dot cross)/normcross or parallel perpendicular-distance target external5/internal1 within1e-6mm;parallel axisangle1e-6rad;outer material senses+1/+1 externalopposed/internalsame;naturalrank1/DOF5 skew,rank3/DOF3 parallel,rank0/DOF6 suppressed/deleted. Free moving origin has no unique position.', limits: 'Two original fixed/free infinite cylindrical-support cases only;both explicit branches and endpoint orders;actual face pointer plus scriptedcontrols,test-ownedfiledialogs,no state/replyinjection. No finite trim/contact,containment/nonoverlap,rolling,source-repair desktop,human native dialogs,installed package or platform claim.' });
      if (family === 'parallel') { await button('Isométrica', '.assembly-view-tools'); await capture(committed.document); }
    }
    const state = await observe(), counts = dialogCounts(); check(counts.opens === 4 && counts.saves === 2 && counts.csvExports === 0 && ipc.length === 6 && ipc.every(value => value.completed), 'Unexpected dialogs or incomplete file IPC.'); check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request error.'); check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200) && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Real worker/WASM load absent.');
  };
};
