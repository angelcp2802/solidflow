'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Actual renderer controls and native face pointer. Analytical solids, placed
// cylinder bounds and dot/cross equations are independent of the UI helpers.
module.exports = function tangentWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]', NAME = 'input[aria-label="Nombre de la relación"]';
  const SIDE = 'select[aria-label="Lado del cilindro respecto al plano"]';
  const CREATE = 'button[aria-label="Vista previa de la nueva tangencia"]', EDIT = 'button[aria-label="Vista previa de la tangencia editada"]';
  const SUMMARY = '[aria-label="Tangencias de soportes verificadas"]';
  const phases = [], gestures = [], evidence = { scenario: 'original-plane-cylinder-tangency', phases, gestures };
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
  function body(scene, id) {
    const values = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([id]));
    check(values.length === 1, 'Exact original body missing: ' + id); return values[0];
  }
  function face(scene, id) {
    const values = body(scene, id).faces.filter(value => id === 'ground'
      ? value.support?.kind === 'plane' && Math.abs(value.support.point[2] - 4) < 1e-8 && value.support.normal[2] > .999
      : value.support?.kind === 'cylinder' && Math.abs(value.support.radius - 2) < 1e-8);
    check(values.length === 1, 'Exact original native face missing: ' + id); return values[0];
  }
  const reference = value => ({ kind: 'face', ...value.selection, support: value.support.kind === 'plane' ? 'plane' : 'cylinder-surface' });
  const selectionKey = value => JSON.stringify([JSON.stringify([value.selection.component.occurrencePath, value.selection.component.definition.id, value.selection.component.definition.revision]),
    value.selection.body ? [value.selection.body.bodyId, value.selection.body.sourceFeatureId] : null, value.selection.face.sourceFeatureId, value.selection.face.key]);
  function geometry(scene, document) {
    check(scene?.solidCount === 2 && scene.prototypeCount === 2 && scene.bodies.length === 2 && !scene.warnings.length, 'Original native solids/prototypes changed.');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Tangency changed embedded sources.');
    close(scene.volume, 4800 + 48 * Math.PI, 1e-5, 'Original total volume mm3'); close(scene.area, 2960 + 56 * Math.PI, 1e-5, 'Original total area mm2');
    for (const id of ['ground', 'roller']) {
      const native = body(scene, id), occurrence = document.occurrences.find(value => value.id === id), original = expected.occurrences.find(value => value.id === id);
      check(native.solidCount === 1 && canonical(native.component.definition) === canonical(original.definition), 'Exact original definition identity changed.');
      check(canonical(native.body) === canonical({ bodyId: id === 'ground' ? 'ground-body' : 'roller-body', sourceFeatureId: id + '-solid' }), 'Exact original body state changed.');
      close(native.volume, id === 'ground' ? 4800 : 48 * Math.PI, 1e-5, id + ' volume'); close(native.area, id === 'ground' ? 2960 : 56 * Math.PI, 1e-5, id + ' area');
      near(native.worldPose.translation, occurrence.pose.translation, 1e-12, id + ' scene/saved translation');
      const chord = Math.min(Math.hypot(...native.worldPose.rotation.map((value, i) => value - occurrence.pose.rotation[i])), Math.hypot(...native.worldPose.rotation.map((value, i) => value + occurrence.pose.rotation[i])));
      close(4 * Math.asin(Math.min(1, chord / 2)), 0, 1e-8, id + ' scene/saved physical angle');
      if (id === 'ground') {
        near(occurrence.pose.translation, [0, 0, 0], 1e-12, 'Fixed ground origin'); near(occurrence.pose.rotation, [0, 0, 0, 1], 1e-12, 'Fixed ground rotation');
        near(native.bounds.min, [-20, -15, 0], 1e-5, 'Fixed ground bounds minimum'); near(native.bounds.max, [20, 15, 4], 1e-5, 'Fixed ground bounds maximum');
        near(face(scene, id).support.normal, [0, 0, 1], 1e-8, 'Native top-plane normal');
      } else {
        const a = rotate(occurrence.pose.rotation, [0, 0, 1]), c0 = occurrence.pose.translation, c1 = c0.map((value, i) => value + 12 * a[i]);
        const extent = a.map(value => 2 * Math.sqrt(Math.max(0, 1 - value * value)));
        near(native.bounds.min, c0.map((value, i) => Math.min(value, c1[i]) - extent[i]), 1e-5, 'Exact placed cylinder minimum');
        near(native.bounds.max, c0.map((value, i) => Math.max(value, c1[i]) + extent[i]), 1e-5, 'Exact placed cylinder maximum');
      }
    }
  }
  function nativeSupport(scene, ref) {
    check(ref.kind === 'face' && ref.component.occurrencePath.length === 1, 'Expected exact original native face reference.');
    const owner = body(scene, ref.component.occurrencePath[0]);
    check(canonical(owner.component) === canonical(ref.component) && canonical(owner.body) === canonical(ref.body), 'Exact native reference owner/revision/body changed.');
    const values = owner.faces.filter(value => canonical(value.selection.face) === canonical(ref.face));
    check(values.length === 1, 'Exact current face is absent.'); const support = values[0].worldSupport;
    check(support?.kind === (ref.support === 'plane' ? 'plane' : 'cylinder'), 'Native support purpose changed.'); return support;
  }
  function relations(scene, document) {
    geometry(scene, document);
    for (const mate of document.mates.filter(value => !value.suppressed)) {
      check(mate.type === 'tangent' && canonical(Object.keys(mate).sort()) === canonical(['first', 'id', 'name', 'second', 'side', 'suppressed', 'type']), 'Unexpected saved tangent fields or relation family.');
      const first = nativeSupport(scene, mate.first), second = nativeSupport(scene, mate.second), plane = first.kind === 'plane' ? first : second, cylinder = first.kind === 'cylinder' ? first : second;
      check(plane.kind === 'plane' && cylinder.kind === 'cylinder' && [mate.first.support, mate.second.support].includes('cylinder-surface'), 'Plane/surface purpose was silently converted to an axis.');
      const cosine = dot(plane.normal, cylinder.axis), sine = Math.hypot(...cross(plane.normal, cylinder.axis));
      close(Math.atan2(cosine, sine), 0, 1e-6, mate.name + ' independent plane/axis angle rad');
      close(dot(plane.normal, cylinder.point.map((value, i) => value - plane.point[i])), (mate.side === 'positive' ? 1 : -1) * cylinder.radius, 1e-6, mate.name + ' independent signed tangent distance mm');
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
      check(event.response.ok, event.response.error || 'Actual operation failed.'); return event;
    });
  }
  async function button(text, scope = '.assembly-app') {
    await page((text, scope) => { const values = [...document.querySelectorAll(scope + ' button')].filter(value => value.textContent.trim() === text);
      if (values.length !== 1 || values[0].disabled) throw Error('Exact enabled control absent: ' + text); values[0].click(); }, text, scope);
  }
  async function control(selector, value) {
    await page((selector, value) => { const element = document.querySelector(selector); if (!element || element.disabled) throw Error('Editable control absent: ' + selector);
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (element instanceof HTMLSelectElement && ![...element.options].some(option => option.value === value && !option.disabled)) throw Error('Enabled option absent.');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('control rendered ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function recovery(document, label) {
    await waitFor(label + ' idle committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
      && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  function ready(event, count, dof) {
    const value = event.response.value, active = value.document?.mates.filter(mate => !mate.suppressed) ?? [];
    check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count, 'Expected authenticated native tangency preview.');
    check(value.scopes.length === 1 && !value.scopes[0].temporaryAnchor && value.scopes[0].result.localDOF === dof && value.scopes[0].result.rank === 6 - dof, 'Wrong natural tangent rank or DOF.');
    check(value.checks.length === active.length && value.checks.every(check => check.satisfied && check.lengthResidual <= check.lengthTolerance && check.angleResidual <= check.angleTolerance), 'Native tangency checks are unsatisfied.');
    const tangencies = value.tangencies ?? [];
    check(Array.isArray(tangencies) && tangencies.length === active.length, 'Fresh tangent support report count differs.');
    for (const report of tangencies) {
      const mate = active.find(value => value.id === report.mateId);
      check(mate && canonical(report.scopePath) === '[]' && report.side === mate.side && report.radialMaterialSense === 1 && report.supportOnly === true
        && report.normalRelation === (mate.side === 'positive' ? 'opposed' : 'same'), 'Fresh native outer-cylinder support normal report differs.');
    }
    relations(value.scene, value.document); return value;
  }
  async function readyUi(event) {
    await idle('tangent preview idle'); const active = event.response.value.document.mates.filter(value => !value.suppressed);
    await waitFor('fresh tangent report and blocked intent controls rendered', () => page((selector, sideSelector, nameSelector, reportSelector, reportText) =>
      document.querySelector(selector)?.disabled === true && document.querySelector(sideSelector)?.disabled === true && document.querySelector(nameSelector)?.disabled === true
        && (reportText ? document.querySelector(reportSelector)?.textContent.includes(reportText) && document.querySelector(reportSelector)?.textContent.includes('no comprueba recortes finitos') : !document.querySelector(reportSelector)),
    TYPE, SIDE, NAME, SUMMARY, active.length ? 'normales de soporte ' + (active[0].side === 'positive' ? 'opuestas' : 'del mismo sentido') : ''));
  }
  async function apply(event, label) {
    await readyUi(event); await waitFor(label + ' Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly');
    check(applied.response.value.kind === 'assembly-applied' && applied.hasToken, 'Tangent Apply lost authority.');
    const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = applied.response.value.document;
    check(canonical(a) === canonical(b), 'Apply changed authenticated tangency candidate.'); relations(applied.response.value.scene, applied.response.value.document);
    await recovery(applied.response.value.document, label); await waitFor('report cleared after Apply', () => page(selector => !document.querySelector(selector), SUMMARY));
    record(label + '/apply', applied); return applied.response.value;
  }
  async function cancel(base, label) {
    await idle(label + ' preview idle'); await click(CANCEL); await recovery(base.document, label);
    await waitFor(label + ' committed view restored', () => page((applySelector, summarySelector) => document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm'
      && document.querySelector(applySelector)?.disabled === true && !document.querySelector(summarySelector), APPLY, SUMMARY));
  }
  async function choose(slot, selected) {
    await click('button[aria-label="Referencia ' + (slot + 1) + ' de la relación"]');
    await control('select[aria-label="Cara de referencia"]', selectionKey(selected)); await button('Usar cara en referencia ' + (slot + 1));
  }
  async function pickSurface(scene, selected) {
    await button('Frontal', '.assembly-view-tools'); await click('button[aria-label="Referencia 2 de la relación"]');
    await waitFor('actual face pointer mode', () => page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === 'face'));
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const center = scene.visibleBounds.min.map((value, i) => (value + scene.visibleBounds.max[i]) / 2), span = Math.hypot(...scene.visibleBounds.max.map((value, i) => value - scene.visibleBounds.min[i]));
    const surfacePoint = [0, -2, 10], pixels = rect.height / (1.3 * span), point = { x: rect.x + rect.width / 2 + (surfacePoint[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (surfacePoint[2] - center[2]) * pixels };
    check(Number.isSafeInteger(selected.vertexCount) && selected.vertexCount > 0
      && Number.isSafeInteger(selected.triangleCount) && selected.triangleCount > 0, 'Native cylindrical face has no display mesh.');
    const before = await observe(); await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point);
    await waitFor('exact cylinder surface selected by actual pointer', () => page(key => document.querySelector('select[aria-label="Cara de referencia"]')?.value === key
      && document.querySelector('button[aria-label="Referencia 2 de la relación"]')?.textContent.includes('Superficie cilíndrica')
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', selectionKey(selected)));
    check((await observe()).serial === before.serial, 'Face pointer selection performed CAD work.'); gestures.push({ kind: 'native-cylinder-surface-face', point, surfacePoint, selection: selected.selection });
  }
  async function add(base, label, side, reversed = false, pointerFace = false) {
    await control(TYPE, 'tangent'); await waitFor('tangent authoring mounted', () => page(selector => !!document.querySelector(selector), CREATE));
    const first = face(base.scene, reversed ? 'roller' : 'ground'), second = face(base.scene, reversed ? 'ground' : 'roller');
    await choose(0, first); if (pointerFace) await pickSurface(base.scene, second); else await choose(1, second);
    await control(NAME, label); await control(SIDE, side); const before = await observe(); await click(CREATE);
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, base.document.mates.length + 1, 4), mate = result.document.mates.at(-1);
    check(mate.type === 'tangent' && mate.name === label && mate.side === side && canonical(mate.first) === canonical(reference(first)) && canonical(mate.second) === canonical(reference(second)), 'Saved tangent surface/order/side intent changed.');
    await readyUi(event); record(label + '/preview', event); return event;
  }
  async function edit(base, label, side) {
    const mate = base.document.mates[0]; await click('button[aria-label="Editar tangencia ' + mate.name + '"]');
    await waitFor('saved tangent editor rendered', () => page((selector, sideSelector, name, side) => document.querySelector(selector)?.value === name && document.querySelector(sideSelector)?.value === side, NAME, SIDE, mate.name, mate.side));
    await control(NAME, label); await control(SIDE, side); const before = await observe(); await click(EDIT);
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 1, 4), changed = result.document.mates[0];
    check(changed.id === mate.id && changed.type === 'tangent' && changed.name === label && changed.side === side && canonical(changed.first) === canonical(mate.first) && canonical(changed.second) === canonical(mate.second), 'Edit replaced identity or exact tangent references.');
    await readyUi(event); record(label + '/preview', event); return event;
  }
  async function suppression(base, suppressed, label, dof) {
    const mate = base.document.mates[0], before = await observe(); await click('input[aria-label="Activar ' + mate.name + '"]');
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 1, dof);
    check(result.document.mates[0].id === mate.id && result.document.mates[0].suppressed === suppressed, 'Suppression changed tangent identity.');
    await readyUi(event); record(label + '/preview', event); return event;
  }
  async function remove(base, label) {
    const before = await observe(); await click('button[aria-label="Eliminar ' + base.document.mates[0].name + '"]');
    const event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 0, 6); await readyUi(event); record(label + '/preview', event); return event;
  }
  async function history(action, wanted, label) {
    const before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]');
    const event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(wanted), 'History did not restore exactly one state.');
    relations(event.response.value, event.document); await recovery(event.document, label); record(label, event); return { document: event.document, scene: event.response.value };
  }
  return async function workflow() {
    const originalBytes = await fsp.readFile(input); evidence.fixtureSha256 = digest(originalBytes);
    check(expected.id === 'assembly-tangent-plane-cylinder-original' && expected.mates.length === 0 && expected.occurrences.length === 2, 'Expected original plane/cylinder fixture.');
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Open changed original fixture.');
    let committed = { document: event.document, scene: event.response.value }; geometry(committed.scene, committed.document);
    near(committed.scene.bounds.min, [-20, -15, 0], 1e-5, 'Initial overall bounds minimum'); near(committed.scene.bounds.max, [20, 15, 12], 1e-5, 'Initial overall bounds maximum');
    await recovery(committed.document, 'original'); record('open/original', event);
    event = await add(committed, 'Tangencia positiva', 'positive', false, true); await cancel(committed, 'pointer candidate cancelled');
    event = await add(committed, 'Tangencia positiva', 'positive'); committed = await apply(event, 'positive'); const positive = committed.document;
    committed = await history('undo', expected, 'undo/one-tangency'); committed = await history('redo', positive, 'redo/one-tangency');
    event = await edit(committed, 'Tangencia negativa', 'negative'); await cancel(committed, 'negative edit cancelled');
    event = await edit(committed, 'Tangencia negativa', 'negative'); committed = await apply(event, 'negative');
    event = await suppression(committed, true, 'suppress-cancel', 6); await cancel(committed, 'suppression cancelled');
    event = await suppression(committed, true, 'suppressed', 6); committed = await apply(event, 'suppressed');
    event = await suppression(committed, false, 'reactivated', 4); committed = await apply(event, 'reactivated');
    await control(TYPE, 'tangent'); await choose(0, face(committed.scene, 'ground')); await choose(1, face(committed.scene, 'roller')); await control(NAME, 'Tangencias incompatibles'); await control(SIDE, 'positive');
    before = await observe(); await click(CREATE); event = await responseAfter(before.serial, 'preview-assembly');
    check(canonical(event.current) === canonical(committed.document) && event.proposed?.mates.length === 2 && event.proposed.mates.at(-1).type === 'tangent' && event.proposed.mates.at(-1).side === 'positive', 'Conflict request lost intended signed surfaces.');
    check(event.response.value.status === 'rejected' && event.response.value.reason === 'numeric' && event.response.value.scopes.some(scope => ['inconsistent', 'nonConverged'].includes(scope.result.status)), 'Opposite signed tangencies were falsely accepted or failed before numeric verification.');
    await idle('conflict idle'); check(await page((applySelector, reportSelector) => document.querySelector(applySelector)?.disabled === true && !document.querySelector(reportSelector), APPLY, SUMMARY), 'Rejected tangent exposed Apply/report.');
    await recovery(committed.document, 'conflict preservation'); record('conflict/rejected', event);
    event = await remove(committed, 'delete-cancel'); await cancel(committed, 'deletion cancelled');
    event = await remove(committed, 'deleted'); committed = await apply(event, 'deleted');
    event = await add(committed, 'Cilindro y plano positivos', 'positive', true); committed = await apply(event, 'reversed-order');
    event = await edit(committed, 'Tangencia de soportes guardada', 'positive'); committed = await apply(event, 'renamed');
    await button('Guardar como', '.assembly-toolbar');
    await waitFor('actual Save As and file IPC', async () => {
      if (dialogCounts().saves !== 1 || !ipc.some(value => value.channel === 'document:save' && value.completed)) return false;
      try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    });
    await idle('saved tangent idle'); const savedBytes = await fsp.readFile(output);
    before = await observe(); await button('Abrir', '.assembly-toolbar'); event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(committed.document), 'Reopen changed saved tangent source/order/side/poses.'); relations(event.response.value, event.document);
    committed = { document: event.document, scene: event.response.value }; await recovery(committed.document, 'reopened'); record('reopen/committed', event);
    await waitFor('reopen resets history', () => page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true));
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 1, 4); await readyUi(event); record('reopen/fresh-native', event); await cancel(committed, 'reopened solve cancelled');
    await button('Isométrica', '.assembly-view-tools'); await capture(committed.document);
    const state = await observe(), counts = dialogCounts();
    check(phases.length === 24 && phases.filter(value => value.action === 'apply-assembly').length === 7 && gestures.length === 1, 'Unexpected tangent coverage/count.');
    check(counts.opens === 2 && counts.saves === 1 && counts.csvExports === 0 && ipc.every(value => value.completed), 'Unexpected dialogs or incomplete file IPC.');
    check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request error.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200) && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Real worker/WASM load absent.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes) && digest(await fsp.readFile(output)) === digest(savedBytes), 'Original or saved bytes changed after reopen.');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: committed.document,
      independentOracles: 'Ground40x30x4 V4800/A2960;rollerR2H12 V48pi/A56pi; exact cylinder bounds C0=t,C1=t+12QZ,radialextent2sqrt(1-a_i^2),1e-5mm;V/A1e-5;fixedground andscene/savedtranslations1e-12mm,physicalqangle1e-8rad;actualnative normal-axis angle1e-6rad,signedn dot(C-P)=side*r1e-6mm;outer material sense+1:positive opposed,negative same;naturalrank2/DOF4,rank0/DOF6 suppressed/deleted. Moving origin is free.',
      limits: 'Only infinite plane/cylinder-surface supports,originalfixed/free2componentfixture. Both endpoint orders and sides; actualpointerface+scriptedcontrols,test-owneddialogchoices, no state/CADreplyinjection. No finite trim/contact/nonoverlap/rolling,other tangent pairs,arbitrary mechanisms,human dialogs,installedpackage orplatform support.' });
  };
};
