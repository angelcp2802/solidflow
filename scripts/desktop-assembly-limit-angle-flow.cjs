'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Actual renderer controls, native cap picking and local-X rotation gestures.
// Original box formulas and principal direction angles use no product helpers.
module.exports = function limitAngleWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]', NAME = 'input[aria-label="Nombre de la relación"]';
  const MIN = 'input[aria-label="Ángulo principal mínimo en grados"]', MAX = 'input[aria-label="Ángulo principal máximo en grados"]';
  const CREATE = 'button[aria-label="Vista previa del nuevo intervalo angular"]', EDIT = 'button[aria-label="Vista previa del intervalo angular editado"]';
  const SUMMARY = '[aria-label="Intervalos angulares verificados"]', VIEW = '[aria-label="Visor 3D del ensamblaje"]';
  const phases = [], gestures = [], evidence = { scenario: 'original-principal-limit-angle', phases, gestures };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + '; actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const near = (actual, wanted, tolerance, label) => { check(Array.isArray(actual) && actual.length === wanted.length, label + ' dimensions'); actual.forEach((value, i) => close(value, wanted[i], tolerance, label + '[' + i + ']')); };
  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rotate = (q, v) => { const t = cross(q.slice(0, 3), v).map(value => 2 * value), u = cross(q.slice(0, 3), t); return v.map((value, i) => value + q[3] * t[i] + u[i]); };
  const occurrence = (document, id) => { const value = document.occurrences.find(value => value.id === id); check(!!value, 'Original occurrence absent: ' + id); return value; };
  function body(scene, id) {
    const values = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([id])); check(values.length === 1, 'Exact original body absent: ' + id); return values[0];
  }
  function face(scene, id, bottom = false) {
    const localZ = bottom ? 0 : id === 'fixed' ? 4 : 2, sign = bottom ? -1 : 1;
    const values = body(scene, id).faces.filter(value => value.support?.kind === 'plane' && Math.abs(value.support.point[2] - localZ) < 1e-8 && value.support.normal[2] * sign > .999);
    check(values.length === 1, 'Exact original top/bottom native face absent: ' + id); return values[0];
  }
  const reference = value => ({ kind: 'face', ...value.selection, support: 'plane' });
  const selectionKey = value => JSON.stringify([JSON.stringify([value.selection.component.occurrencePath, value.selection.component.definition.id, value.selection.component.definition.revision]),
    value.selection.body ? [value.selection.body.bodyId, value.selection.body.sourceFeatureId] : null, value.selection.face.sourceFeatureId, value.selection.face.key]);
  function geometry(scene, document) {
    check(scene?.solidCount === 2 && scene.prototypeCount === 2 && scene.bodies.length === 2 && !scene.warnings.length, 'Original solid/prototype inventory changed.');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Interval changed embedded geometry.');
    close(scene.volume, 4920, 1e-5, 'Original box volume mm3'); close(scene.area, 3144, 1e-5, 'Original box area mm2');
    const totalMin = [Infinity, Infinity, Infinity], totalMax = [-Infinity, -Infinity, -Infinity];
    for (const id of ['fixed', 'moving']) {
      const native = body(scene, id), saved = occurrence(document, id), original = occurrence(expected, id);
      check(native.solidCount === 1 && canonical(native.component.definition) === canonical(original.definition), 'Exact body definition changed.');
      check(canonical(native.body) === canonical({ bodyId: id === 'fixed' ? 'angle-fixed-body' : 'angle-moving-body', sourceFeatureId: id + '-solid' }), 'Exact original body state changed.');
      close(native.volume, id === 'fixed' ? 4800 : 120, 1e-5, id + ' volume'); close(native.area, id === 'fixed' ? 2960 : 184, 1e-5, id + ' area');
      near(native.worldPose.translation, saved.pose.translation, 1e-12, id + ' scene/saved translation');
      const chord = Math.min(Math.hypot(...native.worldPose.rotation.map((value, i) => value - saved.pose.rotation[i])), Math.hypot(...native.worldPose.rotation.map((value, i) => value + saved.pose.rotation[i])));
      close(4 * Math.asin(Math.min(1, chord / 2)), 0, 1e-8, id + ' scene/saved physical rotation');
      if (id === 'fixed') { near(saved.pose.translation, [0, 0, 0], 1e-12, 'Fixed origin'); near(saved.pose.rotation, [0, 0, 0, 1], 1e-12, 'Fixed orientation'); }
      const half = id === 'fixed' ? [20, 15, 4] : [5, 3, 2], corners = [];
      for (const x of [-half[0], half[0]]) for (const y of [-half[1], half[1]]) for (const z of [0, half[2]]) corners.push(rotate(saved.pose.rotation, [x, y, z]).map((value, i) => value + saved.pose.translation[i]));
      const minimum = [0, 1, 2].map(i => Math.min(...corners.map(value => value[i]))), maximum = [0, 1, 2].map(i => Math.max(...corners.map(value => value[i])));
      near(native.bounds.min, minimum, 1e-5, id + ' independently placed box minimum'); near(native.bounds.max, maximum, 1e-5, id + ' independently placed box maximum');
      for (let i = 0; i < 3; i++) { totalMin[i] = Math.min(totalMin[i], minimum[i]); totalMax[i] = Math.max(totalMax[i], maximum[i]); }
    }
    near(scene.bounds.min, totalMin, 1e-5, 'Placed overall minimum'); near(scene.bounds.max, totalMax, 1e-5, 'Placed overall maximum');
  }
  function nativePlane(scene, ref) {
    check(ref.kind === 'face' && ref.support === 'plane' && ref.component.occurrencePath.length === 1, 'Expected exact native plane purpose.');
    const owner = body(scene, ref.component.occurrencePath[0]); check(canonical(owner.component) === canonical(ref.component) && canonical(owner.body) === canonical(ref.body), 'Plane owner/body/revision changed.');
    const matches = owner.faces.filter(value => canonical(value.selection.face) === canonical(ref.face));
    check(matches.length === 1 && matches[0].worldSupport?.kind === 'plane', 'Exact current native plane absent.'); return matches[0].worldSupport;
  }
  const principalAngle = (a, b) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));
  function angle(scene, mate) { return principalAngle(nativePlane(scene, mate.first).normal, nativePlane(scene, mate.second).normal); }
  function relations(scene, document) {
    geometry(scene, document);
    for (const mate of document.mates.filter(value => !value.suppressed)) {
      check(mate.type === 'limit-angle' && mate.coordinate === 'principal-direction'
        && canonical(Object.keys(mate).sort()) === canonical(['coordinate', 'first', 'id', 'limits', 'name', 'second', 'suppressed', 'type']), 'Unexpected saved angular interval fields.');
      const alpha = angle(scene, mate);
      check(alpha >= mate.limits.minimum * Math.PI / 180 - 1e-6 && alpha <= mate.limits.maximum * Math.PI / 180 + 1e-6, 'Independent actual native principal angle outside saved bounds.');
    }
  }
  const record = (phase, event) => phases.push({ phase, serial: event.serial, eventSerial: event.eventSerial, action: event.action, hasToken: event.hasToken,
    current: event.current, proposed: event.proposed, document: event.document, motion: event.motion, drag: event.drag, response: event.response.value });
  const idle = label => waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.assembly-spinner')));
  async function responseAfter(serial, action) {
    return waitFor('actual ' + action + ' response', async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Actual worker error.'); const values = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response);
      check(values.length <= 1, 'Duplicate operation: ' + action); const event = values[0]; if (!event) return false; check(event.response.ok, event.response.error || 'Actual operation failed.'); return event;
    });
  }
  async function button(text, scope = '.assembly-app') {
    await page((text, scope) => { const values = [...document.querySelectorAll(scope + ' button')].filter(value => value.textContent.trim() === text); if (values.length !== 1 || values[0].disabled) throw Error('Exact enabled control absent: ' + text); values[0].click(); }, text, scope);
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
    await waitFor(label + ' committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
      && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  function ready(event, count) {
    const value = event.response.value, active = value.document?.mates.filter(mate => !mate.suppressed) ?? [];
    if (!(value?.status === 'ready' && value.hasToken && value.document.mates.length === count)) evidence.failedPreview = { serial: event.serial, action: event.action, current: event.current, proposed: event.proposed, actual: value, expectedCount: count };
    check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count, 'Expected authenticated native angular interval preview.');
    check(value.scopes.length === 1 && !value.scopes[0].temporaryAnchor && value.scopes[0].result.rank === 0 && value.scopes[0].result.localDOF === 6, 'Interval must retain separate bilateral rank0/DOF6; this is not cone freedom.');
    check(value.checks.length === active.length && value.checks.every(item => item.satisfied && item.lengthResidual <= item.lengthTolerance && item.angleResidual <= item.angleTolerance), 'Hard angular interval checks failed.');
    const reports = value.limitAngles ?? []; check(Array.isArray(reports) && reports.length === active.length, 'Fresh angular interval report count differs.');
    for (const report of reports) {
      const mate = active.find(item => item.id === report.mateId), alpha = mate && angle(value.scene, mate);
      check(mate && report.kind === 'limit-angle' && report.coordinate === 'principal-direction' && canonical(report.scopePath) === '[]'
        && canonical(report.limitsDegrees) === canonical(mate.limits) && report.supportOnly === true && Number.isFinite(report.angleToleranceRadians) && report.angleToleranceRadians > 0, 'Fresh angular report differs from saved intent.');
      close(report.angleDegrees * Math.PI / 180, alpha, 1e-6, 'Fresh actual native principal angle rad');
      const lower = Math.abs(alpha - mate.limits.minimum * Math.PI / 180) <= report.angleToleranceRadians, upper = Math.abs(alpha - mate.limits.maximum * Math.PI / 180) <= report.angleToleranceRadians;
      check(report.activity === (lower && upper ? 'both' : lower ? 'minimum' : upper ? 'maximum' : 'interior'), 'Fresh angular activity differs.');
      check(canonical(report.domainBounds) === canonical({ minimum: mate.limits.minimum === 0, maximum: mate.limits.maximum === 180 }), 'Domain endpoints are not unilateral stops.');
      close(principalAngle(report.firstDirection, report.secondDirection), alpha, 1e-6, 'Reported actual direction vectors');
    }
    relations(value.scene, value.document); return value;
  }
  async function readyUi(event) {
    await idle('angular preview idle'); const active = event.response.value.document.mates.filter(value => !value.suppressed);
    await waitFor('angular intent locked and fresh summary rendered', () => page((type, min, max, name, summary, present) => document.querySelector(type)?.disabled === true
      && document.querySelector(min)?.disabled === true && document.querySelector(max)?.disabled === true && document.querySelector(name)?.disabled === true
      && (present === 'yes' ? document.querySelector(summary)?.textContent.includes('El recuento de grados de libertad no describe por sí solo los movimientos permitidos') : !document.querySelector(summary)), TYPE, MIN, MAX, NAME, SUMMARY, active.length ? 'yes' : 'no'));
  }
  async function apply(event, label) {
    await readyUi(event); await waitFor(label + ' Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly');
    check(applied.response.value.kind === 'assembly-applied' && applied.hasToken, 'Apply lost actual capability.');
    const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = applied.response.value.document; check(canonical(a) === canonical(b), 'Apply changed authenticated candidate.');
    relations(applied.response.value.scene, applied.response.value.document); await recovery(applied.response.value.document, label); record(label + '/apply', applied); return applied.response.value;
  }
  async function cancel(base, label) {
    await idle(label + ' preview idle'); await click(CANCEL); await recovery(base.document, label);
    await waitFor(label + ' restored', () => page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY));
  }
  async function rejected(event, base, label) {
    check(event.response.value.status === 'rejected' && !event.response.value.hasToken, 'Incompatible interval intent was accepted.'); await idle(label + ' rejected idle');
    check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY), 'Rejected intent exposed Apply/report.');
    await recovery(base.document, label); record(label + '/rejected', event);
  }
  async function choose(slot, selected) {
    await click('button[aria-label="Referencia ' + (slot + 1) + ' de la relación"]'); await control('select[aria-label="Cara de referencia"]', selectionKey(selected)); await button('Usar cara en referencia ' + (slot + 1));
  }
  async function pickTop(scene, selected) {
    await button('Superior', '.assembly-view-tools'); await click('button[aria-label="Referencia 1 de la relación"]');
    await waitFor('native angular plane pick mode', () => page(selector => document.querySelector(selector)?.getAttribute('data-reference-picking') === 'face', VIEW));
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(selector => { const r = document.querySelector(selector + ' canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, VIEW);
    const center = scene.visibleBounds.min.map((value, i) => (value + scene.visibleBounds.max[i]) / 2), span = Math.hypot(...scene.visibleBounds.max.map((value, i) => value - scene.visibleBounds.min[i])), pixels = rect.height / (1.3 * span);
    // Original moving cap point Rx60*[1,1,2]+[0,0,22], inside its edges.
    const surfacePoint = [1, .5 - Math.sqrt(3), 23 + Math.sqrt(3) / 2], norm = Math.hypot(1, .0001), screenY = ((surfacePoint[1] - center[1]) + .0001 * (surfacePoint[2] - center[2])) / norm;
    const point = { x: rect.x + rect.width / 2 + (surfacePoint[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - screenY * pixels };
    check(selected.vertexCount > 0 && selected.triangleCount > 0, 'Actual native angular cap mesh absent.'); const before = await observe();
    await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point);
    await waitFor('exact original angular cap selected', () => page((key, view) => document.querySelector('select[aria-label="Cara de referencia"]')?.value === key && document.querySelector(view)?.getAttribute('data-reference-picking') === '', selectionKey(selected), VIEW));
    check((await observe()).serial === before.serial, 'Native face pick performed CAD work.'); gestures.push({ kind: 'native-plane-face', point, surfacePoint, selection: selected.selection });
  }
  async function add(base, name, minimum, maximum, reversed = false, usePointer = false) {
    await control(TYPE, 'limit-angle'); await waitFor('principal interval panel', () => page(selector => !!document.querySelector(selector), CREATE));
    check(await page(() => { const panel = document.querySelector('[aria-label="Ángulo principal con límites"]'); return panel?.textContent.includes('No es un tope de giro firmado ni cuenta vueltas')
      && panel.textContent.includes('normal de un plano') && !panel.querySelector('select'); }), 'Principal-angle meaning or absence of alignment selector changed.');
    const a = face(base.scene, reversed ? 'fixed' : 'moving'), b = face(base.scene, reversed ? 'moving' : 'fixed');
    if (usePointer) await pickTop(base.scene, a); else await choose(0, a); await choose(1, b);
    await control(NAME, name); await control(MIN, String(minimum)); await control(MAX, String(maximum));
    const before = await observe(); await click(CREATE); const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, base.document.mates.length + 1), mate = result.document.mates.at(-1);
    check(mate.type === 'limit-angle' && mate.coordinate === 'principal-direction' && mate.name === name && canonical(mate.limits) === canonical({ minimum, maximum })
      && canonical(mate.first) === canonical(reference(a)) && canonical(mate.second) === canonical(reference(b)) && !('alignment' in mate), 'Explicit angular interval/purposes/order changed.');
    await readyUi(event); record(name + '/preview', event); return event;
  }
  async function edit(base, name, minimum, maximum) {
    const mate = base.document.mates[0]; await click('button[aria-label="Editar intervalo angular ' + mate.name + '"]');
    await waitFor('saved angular editor', () => page((type, nameSelector, min, max, name, minimum, maximum) => document.querySelector(type)?.disabled === true && document.querySelector(nameSelector)?.value === name
      && document.querySelector(min)?.value === minimum && document.querySelector(max)?.value === maximum, TYPE, NAME, MIN, MAX, mate.name, String(mate.limits.minimum), String(mate.limits.maximum)));
    await control(NAME, name); await control(MIN, String(minimum)); await control(MAX, String(maximum)); const before = await observe(); await click(EDIT);
    const event = await responseAfter(before.serial, 'preview-assembly'); check(event.proposed.mates[0].id === mate.id && canonical(event.proposed.mates[0].first) === canonical(mate.first) && canonical(event.proposed.mates[0].second) === canonical(mate.second), 'Edit changed stable angular identity/endpoints.');
    ready(event, 1); await readyUi(event); record(name + '/preview', event); return event;
  }
  async function suppression(base, suppressed, label) {
    const before = await observe(); await click('input[aria-label="Activar ' + base.document.mates[0].name + '"]'); const event = await responseAfter(before.serial, 'preview-assembly');
    ready(event, 1); check(event.response.value.document.mates[0].suppressed === suppressed, 'Angular suppression changed intent.'); await readyUi(event); record(label + '/preview', event); return event;
  }
  async function remove(base, label) { const before = await observe(); await click('button[aria-label="Eliminar ' + base.document.mates[0].name + '"]'); const event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 0); await readyUi(event); record(label + '/preview', event); return event; }
  async function history(action, document, label) {
    const before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]'); const event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(document), 'History failed exact accepted angular state.'); relations(event.response.value, event.document); await recovery(document, label); record(label, event); return { document: event.document, scene: event.response.value };
  }
  async function selectMoving() {
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name); if (rows.length !== 1 || rows[0].disabled) throw Error('Original angular component absent.'); rows[0].click(); }, occurrence(expected, 'moving').name);
    await waitFor('angular moving owner selected', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, occurrence(expected, 'moving').name));
  }
  const xDegrees = pose => {
    near(pose.rotation.slice(1, 3), [0, 0], 1e-6, 'Original local-X rotation chart');
    const degrees = 2 * Math.atan2(pose.rotation[0], pose.rotation[3]) * 180 / Math.PI; return degrees < -180 ? degrees + 360 : degrees > 180 ? degrees - 360 : degrees;
  };
  function physicalXError(pose, degrees) {
    close(Math.hypot(...pose.rotation), 1, 1e-10, 'Actual rotation quaternion unit norm');
    const half = degrees * Math.PI / 360, expected = [Math.sin(half), 0, 0, Math.cos(half)],
      chord = Math.min(Math.hypot(...pose.rotation.map((value, i) => value - expected[i])), Math.hypot(...pose.rotation.map((value, i) => value + expected[i])));
    return 4 * Math.asin(Math.min(1, chord / 2));
  }
  async function strictOutside(base, target, label) {
    await selectMoving(); const old = occurrence(base.document, 'moving').pose;
    for (let i = 0; i < 3; i++) await control('input[aria-label="Destino local ' + ['X', 'Y', 'Z'][i] + ' del componente"]', String(old.translation[i]));
    await control('select[aria-label="Eje local del movimiento"]', '0'); await control('input[aria-label="Giro local del movimiento en grados"]', String(target - xDegrees(old)));
    const before = await observe(); await button('Vista previa del movimiento'); const event = await responseAfter(before.serial, 'move-assembly-component-motion');
    check(canonical(event.current) === canonical(base.document), 'Strict angular request lost committed base.'); close(event.motion.rotation.angle, (target - xDegrees(old)) * Math.PI / 180, 1e-12, 'Literal strict local-X increment'); await rejected(event, base, label);
  }
  async function drag(base, targetDegrees, wantedDegrees, activity, label) {
    await selectMoving(); await button('Frontal', '.assembly-view-tools'); await click('button[aria-label="Arrastrar giro"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(selector => { const r = document.querySelector(selector + ' canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, VIEW);
    const bounds = base.scene.visibleBounds, old = occurrence(base.document, 'moving').pose, oldDegrees = xDegrees(old), center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2), span = Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i])), pixels = rect.height / (1.3 * span);
    const origin = { x: rect.x + rect.width / 2 + (old.translation[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (old.translation[2] - center[2]) * pixels };
    let point; const hoverInputs = [];
    for (const sign of [-1, 1]) { for (const offset of [.08, .10, .06, .12, .14, .04, .16, .02]) {
      const candidate = { x: origin.x, y: origin.y + sign * rect.height * offset }; hoverInputs.push(candidate); await pointer('mouseMoved', candidate);
      if (await page(selector => document.querySelector(selector)?.getAttribute('data-drag-axis'), VIEW) === 'X') { point = candidate; break; }
    } if (point) break; }
    check(!!point, 'Actual local-X rotation handle absent.');
    await page(selector => {
      if (Object.hasOwn(window, '__solidflowAngleInputObservation')) throw Error('Previous angular input observer retained.');
      const canvas = document.querySelector(selector + ' canvas'), events = []; let overflow = false;
      const read = event => { if (events.length >= 32) { overflow = true; return; } events.push({ type: event.type, clientX: event.clientX, clientY: event.clientY, buttons: event.buttons,
        isTrusted: event.isTrusted, pointerId: event.pointerId, pointerType: event.pointerType, timeStamp: event.timeStamp }); };
      const types = ['pointerdown', 'pointermove', 'pointerup']; types.forEach(type => canvas.addEventListener(type, read, { capture: true, passive: true }));
      Object.defineProperty(window, '__solidflowAngleInputObservation', { configurable: true, value: Object.freeze({ snapshot: () => ({ events: events.map(e => ({ ...e })), overflow }),
        stop: () => { types.forEach(type => canvas.removeEventListener(type, read, true)); delete window.__solidflowAngleInputObservation; return { events: events.map(e => ({ ...e })), overflow }; } }) });
    }, VIEW);
    let calibration;
    try {
      const before = await observe(), recoveryBefore = await page(() => localStorage.getItem('solidflow.autosave')), moves = [], samples = [];
      await pointer('mousePressed', point, 1); await waitFor('held angular input blocks Apply', () => page(apply => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'true' && document.querySelector(apply)?.disabled === true, APPLY));
      for (const fraction of [1 / 3, 2 / 3]) {
        // The fit/TransformControls scale estimates only where to take samples.
        // Final calibration uses actual DOM coordinates and POSTED intent.
        const next = { x: point.x, y: point.y + (targetDegrees - oldDegrees) * Math.PI / 180 * rect.height / 13 * fraction }, serial = (await observe()).serial;
        moves.push(next); await pointer('mouseMoved', next, 1);
        const request = await waitFor('actual posted local-X calibration target', async () => { const state = await observe(); check(!state.workerErrors.length, 'Actual angular worker error.');
          const values = state.assemblies.filter(value => value.serial > serial && value.action === 'project-assembly-component'); check(values.length <= 1, 'Duplicate angular calibration request.'); return values[0] || false; });
        const input = await page(() => window.__solidflowAngleInputObservation.snapshot()), held = input.events.filter(e => e.type === 'pointermove' && e.buttons === 1), actual = held.at(-1);
        check(!input.overflow && held.length === moves.length && actual?.isTrusted && actual.pointerType === 'mouse' && request.drag.mode === 'rotate' && canonical(request.current) === canonical(base.document), 'Lost actual held angular input or posted base.');
        samples.push({ point: next, clientPoint: { x: actual.clientX, y: actual.clientY }, inputEvent: actual, workerSerial: request.serial, requestedPose: request.drag.pose, requestedDegrees: xDegrees(request.drag.pose) });
      }
      const a = samples[0], b = samples[1], slope = (b.requestedDegrees - a.requestedDegrees) / (b.clientPoint.y - a.clientPoint.y);
      check(Number.isFinite(slope) && slope !== 0 && a.workerSerial !== b.workerSerial, 'Actual local-X calibration is not a distinct affine input mapping.');
      const finalPoint = { x: point.x, y: b.clientPoint.y + (targetDegrees - b.requestedDegrees) / slope };
      check(Number.isFinite(finalPoint.y) && finalPoint.y >= 0, 'Literal angular pointer target is not a finite global coordinate.');
      calibration = { method: 'two-posted-local-X-target-affine', coordinateSource: 'actual-dom-client', samples, slope, finalPoint }; evidence.pendingPointerCalibration = { label, ...calibration };
      moves.push(finalPoint); await pointer('mouseMoved', finalPoint, 1);
      const input = await page(() => window.__solidflowAngleInputObservation.snapshot()), held = input.events.filter(e => e.type === 'pointermove' && e.buttons === 1), actualInput = held.at(-1);
      check(!input.overflow && held.length === 3 && actualInput?.isTrusted && actualInput.pointerId === a.inputEvent.pointerId, 'Final angular target was not the third actual held move.');
      calibration.finalClientPoint = { x: actualInput.clientX, y: actualInput.clientY }; calibration.finalInputEvent = actualInput;
      await pointer('mouseReleased', finalPoint); await waitFor('actual angular projection reply', async () => (await observe()).assemblies.some(value => value.serial > before.serial && value.action === 'project-assembly-component' && value.response)); await idle('angular projection idle');
      const requests = (await observe()).assemblies.filter(value => value.serial > before.serial && value.action === 'project-assembly-component');
      check(requests.length === 3 && samples.every((s, i) => s.workerSerial === requests[i].serial) && requests.every(value => value.response?.ok && canonical(value.current) === canonical(base.document)), 'Angular stream lost its three actual inputs/base.');
      const event = requests.at(-1), result = ready(event, 1), requested = event.drag.pose, resolved = occurrence(result.document, 'moving').pose, witness = result.projection;
      calibration.finalRequest = { workerSerial: event.serial, requestedPose: requested }; Object.assign(evidence.pendingPointerCalibration, calibration);
      const requestedQuaternionErrorRadians = physicalXError(requested, targetDegrees), resolvedQuaternionErrorRadians = physicalXError(resolved, wantedDegrees);
      close(requestedQuaternionErrorRadians, 0, 1e-6, 'Literal requested physical quaternion error rad'); close(resolvedQuaternionErrorRadians, 0, 1e-6, 'Projected physical quaternion error rad');
      close(xDegrees(requested) * Math.PI / 180, targetDegrees * Math.PI / 180, 1e-6, 'Literal actual requested local-X angle rad');
      close(xDegrees(resolved) * Math.PI / 180, wantedDegrees * Math.PI / 180, 1e-6, 'Independent angular projection local-X pose rad');
      near(requested.translation, old.translation, 1e-6, 'Pointer rotation preserves requested origin'); near(resolved.translation, old.translation, 1e-6, 'Angular projection secondary position');
      check(event.drag.mode === 'rotate' && witness?.temporaryAnchor === false && witness.evidence.localOnly === true && !result.motion && !result.movement, 'Projected rotation replaced by strict motion.');
      close(witness.positionResidual, 0, 1e-6, 'Secondary position residual'); close(witness.angleResidual, Math.abs(targetDegrees - wantedDegrees) * Math.PI / 180, 1e-6, 'Pointer angular deviation separate from hard bounds');
      check(result.limitAngles[0].activity === activity && canonical(result.document.mates) === canonical(base.document.mates) && canonical(result.document.definitions) === canonical(base.document.definitions), 'Angular projection changed declaration or activity.');
      check(await page(() => localStorage.getItem('solidflow.autosave')) === recoveryBefore, 'Angular preview changed committed recovery.');
      gestures.push({ kind: 'local-X-rotation-projection', label, axis: 'X', down: point, hoverInputs, moves, targetDegrees, wantedDegrees, requestedQuaternionErrorRadians, resolvedQuaternionErrorRadians,
        nativeAngleRadians: angle(result.scene, result.document.mates[0]), pointerAngularResidualRadians: witness.angleResidual, workerSerials: requests.map(value => value.serial), calibration });
      delete evidence.pendingPointerCalibration; await readyUi(event); record(label + '/preview', event); return event;
    } finally {
      const input = await page(() => window.__solidflowAngleInputObservation?.stop() ?? null);
      if (calibration && input) calibration.inputEvents = input.events;
      if (evidence.pendingPointerCalibration?.label === label && input) evidence.pendingPointerCalibration.inputEvents = input.events;
    }
  }
  return async function workflow() {
    const originalBytes = await fsp.readFile(input); evidence.fixtureSha256 = digest(originalBytes);
    check(expected.id === 'assembly-limit-angle-original' && expected.mates.length === 0 && expected.occurrences.length === 2, 'Expected original principal-angle document.');
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('original replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]'))); await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Open changed original angular fixture.'); let committed = { document: event.document, scene: event.response.value };
    geometry(committed.scene, committed.document); near(occurrence(committed.document, 'moving').pose.translation, [0, 0, 22], 1e-12, 'Original moving origin'); close(xDegrees(occurrence(committed.document, 'moving').pose), 60, 1e-12, 'Original literal Rx60'); await recovery(committed.document, 'original'); record('open/original', event);
    event = await add(committed, 'Intervalo angular inicial', 30, 120, false, true); await cancel(committed, 'native angular candidate cancelled');
    event = await add(committed, 'Intervalo angular inicial', 30, 120); committed = await apply(event, 'authored'); const authored = committed.document;
    committed = await history('undo', expected, 'undo/one-angular-interval'); committed = await history('redo', authored, 'redo/one-angular-interval');
    event = await edit(committed, 'Intervalo angular estrecho', 40, 100); await cancel(committed, 'angular edit cancelled');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await idle('angular cancel reconstruction settled');
    before = await observe(); await click('button[aria-label="Cerrar edición del intervalo angular"]');
    await waitFor('angular editor close unlocks family', () => page(type => document.querySelector(type)?.disabled === false && !document.querySelector('button[aria-label="Cerrar edición del intervalo angular"]'), TYPE));
    check((await observe()).serial === before.serial, 'Closing angular editor performed CAD work.'); evidence.editorTransitions = ['edit-locks-family', 'close-releases-family-without-CAD'];
    event = await edit(committed, 'Intervalo angular confirmado', 30, 120); committed = await apply(event, 'edited');
    await strictOutside(committed, 15, 'strict/below-minimum'); await strictOutside(committed, 150, 'strict/above-maximum');
    event = await drag(committed, 15, 30, 'minimum', 'projection/lower-cancel'); await cancel(committed, 'lower angular projection cancelled');
    event = await drag(committed, 15, 30, 'minimum', 'projection/lower'); const beforeProjection = committed.document; committed = await apply(event, 'lower-boundary'); const lower = committed.document;
    committed = await history('undo', beforeProjection, 'undo/one-angular-projection'); committed = await history('redo', lower, 'redo/one-angular-projection');
    event = await drag(committed, 60, 60, 'interior', 'projection/inward-from-lower'); committed = await apply(event, 'inward-from-lower');
    event = await drag(committed, 150, 120, 'maximum', 'projection/upper'); committed = await apply(event, 'upper-boundary');
    event = await drag(committed, 60, 60, 'interior', 'projection/inward-from-upper'); committed = await apply(event, 'inward-from-upper');
    event = await suppression(committed, true, 'suppress-cancel'); await cancel(committed, 'angular suppression cancelled');
    event = await suppression(committed, true, 'suppressed'); committed = await apply(event, 'suppressed');
    event = await suppression(committed, false, 'reactivated'); committed = await apply(event, 'reactivated');
    await control(TYPE, 'limit-angle'); await choose(0, face(committed.scene, 'moving')); await choose(1, face(committed.scene, 'fixed')); await control(NAME, 'Intervalos angulares incompatibles'); await control(MIN, '130'); await control(MAX, '150');
    before = await observe(); await click(CREATE); event = await responseAfter(before.serial, 'preview-assembly'); check(event.proposed.mates.length === 2 && canonical(event.proposed.mates.at(-1).limits) === canonical({ minimum: 130, maximum: 150 }), 'Contradictory angle intent changed.'); await rejected(event, committed, 'contradiction');
    event = await remove(committed, 'delete-cancel'); await cancel(committed, 'angular deletion cancelled'); event = await remove(committed, 'deleted'); committed = await apply(event, 'deleted');
    event = await add(committed, 'Extremo paralelo de ancho cero', 0, 0); committed = await apply(event, 'zero-width-parallel');
    event = await remove(committed, 'remove-parallel'); committed = await apply(event, 'remove-parallel');
    event = await add(committed, 'Extremo opuesto de ancho cero', 180, 180); committed = await apply(event, 'zero-width-antiparallel');
    event = await remove(committed, 'remove-antiparallel'); committed = await apply(event, 'remove-antiparallel');
    event = await add(committed, 'Dominio angular completo', 0, 180); await cancel(committed, 'full-domain angular candidate cancelled');
    event = await add(committed, 'Referencias angulares invertidas', 30, 120, true); committed = await apply(event, 'reversed-same-bounds');
    event = await edit(committed, 'Intervalo angular guardado', 30, 120); committed = await apply(event, 'renamed');
    await button('Guardar como', '.assembly-toolbar'); await waitFor('actual angular Save As IPC', async () => { if (dialogCounts().saves !== 1 || !ipc.some(value => value.channel === 'document:save' && value.completed)) return false; try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } });
    await idle('angular saved idle'); const savedBytes = await fsp.readFile(output); before = await observe(); await button('Abrir', '.assembly-toolbar'); event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(committed.document), 'Reopen changed exact saved angular intent.'); relations(event.response.value, event.document); committed = { document: event.document, scene: event.response.value }; await recovery(committed.document, 'reopened'); record('reopen/committed', event);
    await waitFor('angular reopened history reset', () => page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true));
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 1); await readyUi(event); record('reopen/fresh-native', event); await cancel(committed, 'fresh angular solve cancelled');
    await button('Isométrica', '.assembly-view-tools'); await capture(committed.document);
    const final = await observe(), dialogs = dialogCounts(); check(phases.length === 46 && phases.filter(value => value.action === 'apply-assembly').length === 15 && gestures.length === 6, 'Unexpected registered angular workflow inventory.');
    check(dialogs.opens === 2 && dialogs.saves === 1 && dialogs.csvExports === 0 && ipc.length === 3 && ipc.every(value => value.completed), 'Unexpected angular file IPC sequence.'); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Actual angular renderer/worker failure.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200) && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Actual angular worker/WASM load absent.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes) && digest(await fsp.readFile(output)) === digest(savedBytes), 'Angular fixture/saved file mutated after reopen.');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: committed.document,
      independentOracles: 'Original fixed40x30x4 V4800/A2960,moving10x6x2 V120/A184,total4920/3144; eight-corner placed box bounds/V/A1e-5; scene/savedtranslation1e-12 and physicalquaternionangle1e-8. OriginalRx60,T[0,0,22]. Principalatan2(crossnorm,dot) of actual native cap normals/inclusivebounds1e-6rad; engine report tolerance remains separate. Strict15/150 rejects; actual local-X pointer15projects30/150projects120; inward60 frombothbounds. Pointer quaterniontargets/actualresolvedangles/deviation1e-6rad,secondarytranslation1e-6mm. Bilateralrank0/DOF6 doesnotreportcone freedom,includingequal0/180. Domain0..180 addsnoalignmentorpositionlock. Final explicitreversedreferences retain30..120.',
      limits: 'Two original boxes and complete plane direction supports; no arbitraryentity/motion/continuouspath/finitecontact/globalmobility/optimality orsignedliftedturnstop claim. Five actual rotation drags useactualDOM+postedintent calibration only,notresolvedCADfeedback. Principal/cylinder-axis/LINE syntax/picking andsource repair coverage areseparate. Hidden scriptedUI/test-owneddialogs,not human dialogs/installedpackage/otherplatform evidence. RecordedphasesexcludeordinaryCancelrebuilds/intermediatethree-requestdragstream.' });
  };
};
