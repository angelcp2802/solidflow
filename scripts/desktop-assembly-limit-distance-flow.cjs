'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Actual renderer controls, native plane picking and world-Z manipulator input.
// Independent box geometry and signed plane equations do not use product helpers.
module.exports = function limitDistanceWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, wheel, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]', NAME = 'input[aria-label="Nombre de la relación"]';
  const MIN = 'input[aria-label="Distancia mínima entre planos en mm"]', MAX = 'input[aria-label="Distancia máxima entre planos en mm"]';
  const ALIGN = 'select[aria-label="Orientación de los planos del intervalo"]';
  const CREATE = 'button[aria-label="Vista previa del nuevo intervalo entre planos"]', EDIT = 'button[aria-label="Vista previa del intervalo entre planos editado"]';
  const SUMMARY = '[aria-label="Intervalos entre planos verificados"]', VIEW = '[aria-label="Visor 3D del ensamblaje"]';
  const phases = [], gestures = [], evidence = { scenario: 'original-plane-limit-distance', phases, gestures };
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
      check(canonical(native.body) === canonical({ bodyId: id === 'fixed' ? 'limit-fixed-body' : 'limit-moving-body', sourceFeatureId: id + '-solid' }), 'Exact original body state changed.');
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
  function coordinate(scene, mate) { const a = nativePlane(scene, mate.first), b = nativePlane(scene, mate.second); return dot(b.normal, a.point.map((value, i) => value - b.point[i])); }
  function relations(scene, document) {
    geometry(scene, document);
    for (const mate of document.mates.filter(value => !value.suppressed)) {
      check(mate.type === 'limit-distance' && canonical(Object.keys(mate).sort()) === canonical(['alignment', 'first', 'id', 'limits', 'name', 'second', 'suppressed', 'type']), 'Unexpected saved interval fields.');
      const a = nativePlane(scene, mate.first), b = nativePlane(scene, mate.second), q = coordinate(scene, mate);
      close(Math.atan2(Math.hypot(...cross(a.normal, b.normal)), dot(a.normal, b.normal)), mate.alignment === 'aligned' ? 0 : Math.PI, 1e-6, 'Independent plane orientation radians');
      check(Number.isFinite(q) && q >= mate.limits.minimum - 1e-6 && q <= mate.limits.maximum + 1e-6, 'Independent signed interval failed.');
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
  function ready(event, count, dof) {
    const value = event.response.value, active = value.document?.mates.filter(mate => !mate.suppressed) ?? [];
    if (!(value?.status === 'ready' && value.hasToken && value.document.mates.length === count)) evidence.failedPreview = { serial: event.serial, action: event.action, current: event.current, proposed: event.proposed, actual: value, expectedCount: count, expectedDOF: dof };
    check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count, 'Expected authenticated native interval preview.');
    check(value.scopes.length === 1 && !value.scopes[0].temporaryAnchor && value.scopes[0].result.localDOF === dof && value.scopes[0].result.rank === 6 - dof, 'Wrong bilateral rank/DOF.');
    check(value.checks.length === active.length && value.checks.every(check => check.satisfied && check.lengthResidual <= check.lengthTolerance && check.angleResidual <= check.angleTolerance), 'Hard interval checks failed.');
    const reports = value.limitDistances ?? []; check(Array.isArray(reports) && reports.length === active.length, 'Fresh interval report count differs.');
    for (const report of reports) {
      const mate = active.find(value => value.id === report.mateId); check(mate && report.kind === 'limit-distance' && canonical(report.scopePath) === '[]' && report.alignment === mate.alignment && canonical(report.limits) === canonical(mate.limits) && report.supportOnly === true && Number.isFinite(report.lengthTolerance) && report.lengthTolerance > 0, 'Fresh signed interval report intent differs.');
      const q = coordinate(value.scene, mate), minimum = Math.abs(q - mate.limits.minimum) <= report.lengthTolerance, maximum = Math.abs(q - mate.limits.maximum) <= report.lengthTolerance;
      close(report.coordinate, q, 1e-6, 'Fresh native signed coordinate'); check(report.activity === (minimum && maximum ? 'both' : minimum ? 'minimum' : maximum ? 'maximum' : 'interior'), 'Report activity differs from proximity.');
    }
    relations(value.scene, value.document); return value;
  }
  async function readyUi(event) {
    await idle('interval preview idle'); const active = event.response.value.document.mates.filter(value => !value.suppressed);
    await waitFor('fresh report and intent locks rendered', () => page((type, min, max, align, name, summary, present) => document.querySelector(type)?.disabled === true
      && document.querySelector(min)?.disabled === true && document.querySelector(max)?.disabled === true && document.querySelector(align)?.disabled === true && document.querySelector(name)?.disabled === true
      && (present === 'yes' ? document.querySelector(summary)?.textContent.includes('normal del segundo plano') && document.querySelector(summary)?.textContent.includes('no fija el componente') : !document.querySelector(summary)), TYPE, MIN, MAX, ALIGN, NAME, SUMMARY, active.length ? 'yes' : 'no'));
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
    await waitFor('native plane pointer mode', () => page(selector => document.querySelector(selector)?.getAttribute('data-reference-picking') === 'face', VIEW));
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(selector => { const r = document.querySelector(selector + ' canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, VIEW);
    const center = scene.visibleBounds.min.map((value, i) => (value + scene.visibleBounds.max[i]) / 2), span = Math.hypot(...scene.visibleBounds.max.map((value, i) => value - scene.visibleBounds.min[i])), pixels = rect.height / (1.3 * span);
    // The top camera has the product's small Y tilt; project the literal point in that frame.
    const surfacePoint = [1, 1, 24], norm = Math.hypot(1, .0001), screenY = ((surfacePoint[1] - center[1]) + .0001 * (surfacePoint[2] - center[2])) / norm;
    const point = { x: rect.x + rect.width / 2 + (surfacePoint[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - screenY * pixels };
    check(Number.isSafeInteger(selected.vertexCount) && selected.vertexCount > 0 && Number.isSafeInteger(selected.triangleCount) && selected.triangleCount > 0, 'Native top plane has no actual display mesh.');
    const before = await observe(); await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point);
    await waitFor('exact native plane pointer selected', () => page((key, view) => document.querySelector('select[aria-label="Cara de referencia"]')?.value === key && document.querySelector(view)?.getAttribute('data-reference-picking') === '', selectionKey(selected), VIEW));
    check((await observe()).serial === before.serial, 'Plane selection performed CAD work.'); gestures.push({ kind: 'native-plane-face', point, surfacePoint, selection: selected.selection });
  }
  async function add(base, name, minimum, maximum, alignment = 'aligned', reversed = false, bottom = false, pointerFace = false) {
    await control(TYPE, 'limit-distance'); await waitFor('interval panel ready', () => page(selector => !!document.querySelector(selector), CREATE));
    const a = face(base.scene, reversed ? 'fixed' : 'moving', bottom), b = face(base.scene, reversed ? 'moving' : 'fixed');
    if (pointerFace) await pickTop(base.scene, a); else await choose(0, a); await choose(1, b);
    await control(NAME, name); await control(MIN, String(minimum)); await control(MAX, String(maximum)); await control(ALIGN, alignment);
    await waitFor('complete interval authoring enabled', () => page(selector => document.querySelector(selector)?.disabled === false, CREATE));
    const before = await observe(); await click(CREATE); const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, base.document.mates.length + 1, 4), mate = result.document.mates.at(-1);
    check(mate.type === 'limit-distance' && mate.name === name && mate.alignment === alignment && canonical(mate.limits) === canonical({ minimum, maximum }) && canonical(mate.first) === canonical(reference(a)) && canonical(mate.second) === canonical(reference(b)), 'Saved signed interval/order/plane purpose changed.');
    await readyUi(event); record(name + '/preview', event); return event;
  }
  async function edit(base, name, minimum, maximum, alignment = base.document.mates[0].alignment, reject = false) {
    const mate = base.document.mates[0]; await click('button[aria-label="Editar intervalo entre planos ' + mate.name + '"]');
    await waitFor('saved interval editor rendered', () => page((nameSelector, minSelector, maxSelector, alignSelector, name, min, max, align, type) => document.querySelector(nameSelector)?.value === name && document.querySelector(minSelector)?.value === min && document.querySelector(maxSelector)?.value === max && document.querySelector(alignSelector)?.value === align && document.querySelector(type)?.disabled === true, NAME, MIN, MAX, ALIGN, mate.name, String(mate.limits.minimum), String(mate.limits.maximum), mate.alignment, TYPE));
    await control(NAME, name); await control(MIN, String(minimum)); await control(MAX, String(maximum)); await control(ALIGN, alignment);
    const before = await observe(); await click(EDIT); const event = await responseAfter(before.serial, 'preview-assembly');
    check(event.proposed.mates[0].id === mate.id && canonical(event.proposed.mates[0].first) === canonical(mate.first) && canonical(event.proposed.mates[0].second) === canonical(mate.second), 'Edit replaced saved identity/references.');
    if (reject) await rejected(event, base, name); else { ready(event, 1, 4); await readyUi(event); record(name + '/preview', event); } return event;
  }
  async function closeEdit() { await click('button[aria-label="Cerrar edición del intervalo entre planos"]'); await waitFor('editor closed/family unlocked', () => page((type, close) => document.querySelector(type)?.disabled === false && !document.querySelector(close), TYPE, 'button[aria-label="Cerrar edición del intervalo entre planos"]')); }
  async function suppression(base, suppressed, label) {
    const before = await observe(); await click('input[aria-label="Activar ' + base.document.mates[0].name + '"]'); const event = await responseAfter(before.serial, 'preview-assembly');
    ready(event, 1, suppressed ? 6 : 4); check(event.response.value.document.mates[0].suppressed === suppressed, 'Suppression intent changed.'); await readyUi(event); record(label + '/preview', event); return event;
  }
  async function remove(base, label) { const before = await observe(); await click('button[aria-label="Eliminar ' + base.document.mates[0].name + '"]'); const event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 0, 6); await readyUi(event); record(label + '/preview', event); return event; }
  async function history(action, document, label) {
    const before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]'); const event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(document), 'History did not restore exactly one accepted state.'); relations(event.response.value, event.document); await recovery(document, label); record(label, event); return { document: event.document, scene: event.response.value };
  }
  async function selectMoving() {
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name); if (rows.length !== 1 || rows[0].disabled) throw Error('Original moving component control absent.'); rows[0].click(); }, occurrence(expected, 'moving').name);
    await waitFor('moving component selected', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, occurrence(expected, 'moving').name));
  }
  async function strictOutside(base, z, label) {
    await selectMoving(); const old = occurrence(base.document, 'moving').pose;
    for (let i = 0; i < 3; i++) await control('input[aria-label="Destino local ' + ['X', 'Y', 'Z'][i] + ' del componente"]', String(i === 2 ? z : old.translation[i]));
    await control('select[aria-label="Eje local del movimiento"]', '2'); await control('input[aria-label="Giro local del movimiento en grados"]', '0');
    const before = await observe(); await button('Vista previa del movimiento'); const event = await responseAfter(before.serial, 'move-assembly-component-motion');
    check(canonical(event.current) === canonical(base.document) && event.motion.translation[2] === z && event.motion.rotation.angle === 0, 'Strict numeric movement request changed.'); await rejected(event, base, label);
  }
  async function drag(base, targetZ, wantedZ, activity, label) {
    await selectMoving(); await button('Frontal', '.assembly-view-tools'); await click('button[aria-label="Arrastrar posición"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(selector => { const r = document.querySelector(selector + ' canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, VIEW);
    // Observe real DOM input coordinates. CDP's issued doubles may be rounded
    // before PointerEvent.clientY; this observer supplies no model/proxy state.
    await page(selector => {
      if (Object.hasOwn(window, '__solidflowLimitInputObservation')) throw Error('Previous interval input observer was not removed.');
      const canvas = document.querySelector(selector + ' canvas'), events = []; let overflow = false;
      const read = event => {
        if (events.length >= 64) { overflow = true; return; }
        events.push({ type: event.type, clientX: event.clientX, clientY: event.clientY, buttons: event.buttons, isTrusted: event.isTrusted,
          timeStamp: event.timeStamp, ...(event.type === 'wheel' ? { deltaY: event.deltaY, deltaMode: event.deltaMode }
            : { pointerId: event.pointerId, pointerType: event.pointerType }) });
      };
      const types = ['pointerdown', 'pointermove', 'pointerup', 'wheel'];
      types.forEach(type => canvas.addEventListener(type, read, { capture: true, passive: true }));
      Object.defineProperty(window, '__solidflowLimitInputObservation', { configurable: true, value: Object.freeze({
        snapshot: () => ({ events: events.map(event => ({ ...event })), overflow }),
        stop: () => { types.forEach(type => canvas.removeEventListener(type, read, true)); const result = { events: events.map(event => ({ ...event })), overflow };
          delete window.__solidflowLimitInputObservation; return result; },
      }) });
    }, VIEW);
    let calibration;
    try {
    let viewZoom = 1;
    if (label === 'projection/inward-release') {
      const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, beforeWheel = (await observe()).serial;
      await wheel(point, -1000);
      await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const input = await page(() => window.__solidflowLimitInputObservation.snapshot()), events = input.events.filter(event => event.type === 'wheel');
      check(!input.overflow && events.length === 1 && events[0].isTrusted && events[0].buttons === 0 && events[0].deltaY === -1000 && events[0].deltaMode === 0, 'Expected one actual pixel-mode inward view wheel.');
      // OrbitControls default zoomSpeed=1, pixel delta: scale=.95^abs(deltaY*.01).
      viewZoom = 1 / Math.pow(.95, Math.abs(events[0].deltaY * .01));
      check((await observe()).serial === beforeWheel, 'View wheel performed CAD work.');
      (evidence.viewInputs ??= []).push({ kind: 'wheel-zoom', label, point, deltaY: -1000, actual: events[0], zoomFactor: viewZoom });
    }
    const bounds = base.scene.visibleBounds, old = occurrence(base.document, 'moving').pose, center = bounds.min.map((value, i) => (value + bounds.max[i]) / 2), span = Math.hypot(...bounds.max.map((value, i) => value - bounds.min[i])), pixels = rect.height / (1.3 * span) * viewZoom;
    const origin = { x: rect.x + rect.width / 2 + (old.translation[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (old.translation[2] - center[2]) * pixels };
    let point;
    for (const offset of [.08, .10, .06, .12, .14, .04]) { const candidate = { x: origin.x, y: origin.y - rect.height * offset }; await pointer('mouseMoved', candidate); if (await page(selector => document.querySelector(selector)?.getAttribute('data-drag-axis'), VIEW) === 'Z') { point = candidate; break; } }
    check(!!point, 'Actual front-view Z manipulator handle absent.'); const before = await observe(), recoveryBefore = await page(() => localStorage.getItem('solidflow.autosave'));
    await pointer('mousePressed', point, 1); await waitFor('pointer-down blocks Apply', () => page(apply => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'true' && document.querySelector(apply)?.disabled === true, APPLY));
    // Calibrate the held Z handle from actual POSTED pointer targets. The
    // orthographic mapping is affine, but the DOM/camera screen scale need not
    // equal the analytical fit estimate to the final requested precision.
    // Samples use request intent only, never projected CAD result geometry.
    const moves = [], samples = [];
    for (const fraction of [1 / 3, 2 / 3]) {
      const next = { x: point.x, y: point.y - (targetZ - old.translation[2]) * pixels * fraction }, serial = (await observe()).serial;
      moves.push(next); await pointer('mouseMoved', next, 1);
      const request = await waitFor('actual posted Z calibration target', async () => {
        const state = await observe(); check(!state.workerErrors.length, 'Actual worker error during pointer calibration.');
        const values = state.assemblies.filter(value => value.serial > serial && value.action === 'project-assembly-component');
        check(values.length <= 1, 'Calibration move posted duplicate projection requests.'); return values[0] || false;
      });
      check(request.drag?.mode === 'translate' && canonical(request.current) === canonical(base.document) && Number.isFinite(request.drag.pose.translation[2]), 'Calibration lost actual drag intent/base.');
      const observed = await page(() => window.__solidflowLimitInputObservation.snapshot()), down = observed.events.filter(event => event.type === 'pointerdown'), held = observed.events.filter(event => event.type === 'pointermove' && event.buttons === 1), actualInput = held.at(-1);
      check(!observed.overflow && down.length === 1 && held.length === moves.length && actualInput?.isTrusted && actualInput.pointerType === 'mouse'
        && actualInput.pointerId === down[0].pointerId && actualInput.timeStamp >= down[0].timeStamp && Number.isFinite(actualInput.clientX) && Number.isFinite(actualInput.clientY), 'Calibration sample lost its actual held-pointer event.');
      const frame = await page((view, apply) => { const r = document.querySelector(view + ' canvas').getBoundingClientRect(); return {
        rect: { x: r.x, y: r.y, width: r.width, height: r.height }, axis: document.querySelector(view)?.getAttribute('data-drag-axis'),
        busy: document.querySelector('.assembly-app')?.getAttribute('aria-busy'), applyDisabled: document.querySelector(apply)?.disabled,
      }; }, VIEW, APPLY);
      check(canonical(frame.rect) === canonical(rect) && frame.axis === 'Z' && frame.busy === 'true' && frame.applyDisabled === true, 'Calibration changed the held viewport/axis or enabled Apply.');
      samples.push({ point: next, clientPoint: { x: actualInput.clientX, y: actualInput.clientY }, inputEvent: actualInput,
        workerSerial: request.serial, requestedPose: request.drag.pose });
    }
    const first = samples[0], second = samples[1], slope = (second.requestedPose.translation[2] - first.requestedPose.translation[2]) / (second.clientPoint.y - first.clientPoint.y);
    check(first.workerSerial !== second.workerSerial && Number.isFinite(slope) && slope < 0, 'Held Z pointer calibration is not a distinct finite front-view mapping.');
    const finalPoint = { x: point.x, y: second.clientPoint.y + (targetZ - second.requestedPose.translation[2]) / slope };
    check(Number.isFinite(finalPoint.x) && Number.isFinite(finalPoint.y) && finalPoint.x >= 0 && finalPoint.y >= 0, 'Calibrated literal pointer target is not a finite global input coordinate.');
    calibration = { method: 'two-posted-target-affine', coordinateSource: 'actual-dom-client', samples, slope, finalPoint };
    evidence.pendingPointerCalibration = { label, ...calibration };
    moves.push(finalPoint); await pointer('mouseMoved', finalPoint, 1);
    const observed = await page(() => window.__solidflowLimitInputObservation.snapshot()), held = observed.events.filter(event => event.type === 'pointermove' && event.buttons === 1), actualInput = held.at(-1);
    check(!observed.overflow && held.length === 3 && actualInput?.isTrusted && actualInput.pointerType === 'mouse'
      && actualInput.pointerId === first.inputEvent.pointerId && actualInput.timeStamp >= second.inputEvent.timeStamp, 'Final pointer input was not the third actual held move.');
    calibration.finalClientPoint = { x: actualInput.clientX, y: actualInput.clientY }; calibration.finalInputEvent = actualInput;
    check(actualInput.clientY === finalPoint.y || actualInput.clientY === Math.fround(finalPoint.y), 'Issued Z input must arrive unchanged or as its exact float32 coordinate.');
    calibration.clientYIsFloat32 = Number.isFinite(actualInput.clientY) && Math.fround(actualInput.clientY) === actualInput.clientY;
    calibration.clientYFloat32Spacing = calibration.clientYIsFloat32 && actualInput.clientY !== 0 ? 2 ** (Math.floor(Math.log2(Math.abs(actualInput.clientY))) - 23) : null;
    calibration.worldHalfFloat32Step = calibration.clientYFloat32Spacing === null ? null : Math.abs(slope) * calibration.clientYFloat32Spacing / 2;
    Object.assign(evidence.pendingPointerCalibration, calibration);
    await pointer('mouseReleased', moves.at(-1));
    await waitFor('actual final projected request', async () => (await observe()).assemblies.some(value => value.serial > before.serial && value.action === 'project-assembly-component' && value.response)); await idle('final projected destination idle');
    const requests = (await observe()).assemblies.filter(value => value.serial > before.serial && value.action === 'project-assembly-component');
    check(requests.length === 3 && samples.every((sample, index) => sample.workerSerial === requests[index].serial)
      && requests.every(value => value.response?.ok && canonical(value.current) === canonical(base.document)), 'Projection stream lost calibrated targets/base or pointer input count.');
    const event = requests.at(-1), result = ready(event, 1, 4), requested = event.drag.pose, actual = occurrence(result.document, 'moving').pose, witness = result.projection;
    calibration.finalRequest = { workerSerial: event.serial, requestedPose: requested };
    evidence.pendingPointerCalibration.finalRequest = calibration.finalRequest;
    check(event.drag.mode === 'translate' && canonical(event.drag.component) === canonical({ occurrencePath: ['moving'], definition: occurrence(expected, 'moving').definition }) && witness?.temporaryAnchor === false && witness.evidence.localOnly === true && !result.motion && !result.movement, 'Projection was replaced by a strict anchor.');
    const expectedPostedZ = second.requestedPose.translation[2] + slope * (actualInput.clientY - second.clientPoint.y);
    near(requested.translation, [old.translation[0], old.translation[1], expectedPostedZ], 1e-6, 'Independent affine mapping of actual DOM Z input');
    // The original top planes have q=Tz+2-4. Clamp the actual posted intention,
    // independently of the solved pose; issued doubles need not survive DOM input.
    check(base.document.mates.length === 1 && canonical(base.document.mates[0].limits) === canonical({ minimum: 10, maximum: 30 })
      && wantedZ === Math.max(12, Math.min(32, targetZ)), 'Pointer oracle requires the original literal top-plane interval.');
    const inputExpectedZ = Math.max(12, Math.min(32, requested.translation[2]));
    near(actual.translation, [old.translation[0], old.translation[1], inputExpectedZ], 1e-6, 'Independent interval projection of actual posted input');
    close(witness.positionResidual, Math.abs(requested.translation[2] - inputExpectedZ), 1e-6, 'Pointer deviation separated from hard constraint'); close(witness.angleResidual, 0, 1e-8, 'Projection secondary rotation');
    check(result.limitDistances[0].activity === activity && canonical(result.document.mates) === canonical(base.document.mates) && canonical(result.document.definitions) === canonical(base.document.definitions), 'Projection edited limits/sources or reported wrong proximity.');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === recoveryBefore, 'Projected preview changed committed recovery.');
    await waitFor('projection deviation and hard checks rendered', () => page(() => { const panel = document.querySelector('[aria-label="Proyección del arrastre"]'); return panel?.textContent.includes('Desviación del puntero') && panel.textContent.includes('Comprobación de relaciones'); }));
    gestures.push({ kind: 'world-Z-projection', label, axis: 'Z', down: point, moves, targetZ, wantedZ, expectedPostedZ, inputExpectedZ, workerSerials: requests.map(value => value.serial),
      calibration }); delete evidence.pendingPointerCalibration; await readyUi(event); record(label + '/preview', event); return event;
    } finally {
      const input = await page(() => window.__solidflowLimitInputObservation?.stop() ?? null);
      if (calibration && input) calibration.inputEvents = input.events;
      if (evidence.pendingPointerCalibration?.label === label && input) evidence.pendingPointerCalibration.inputEvents = input.events;
    }
  }
  return async function workflow() {
    const originalBytes = await fsp.readFile(input); evidence.fixtureSha256 = digest(originalBytes);
    check(expected.id === 'assembly-limit-distance-original' && expected.mates.length === 0 && expected.occurrences.length === 2, 'Expected original plane interval fixture.');
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]'))); await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Open changed original fixture.'); let committed = { document: event.document, scene: event.response.value };
    geometry(committed.scene, committed.document); near(occurrence(committed.document, 'moving').pose.translation, [0, 0, 22], 1e-12, 'Original literal placement'); near(committed.scene.bounds.min, [-20, -15, 0], 1e-5, 'Original bounds minimum'); near(committed.scene.bounds.max, [20, 15, 24], 1e-5, 'Original bounds maximum'); await recovery(committed.document, 'original'); record('open/original', event);
    event = await add(committed, 'Intervalo firmado', 10, 30, 'aligned', false, false, true); await cancel(committed, 'native plane candidate cancelled');
    event = await add(committed, 'Intervalo firmado', 10, 30); committed = await apply(event, 'authored'); const authored = committed.document;
    committed = await history('undo', expected, 'undo/one-interval'); committed = await history('redo', authored, 'redo/one-interval');
    event = await edit(committed, 'Intervalo más estrecho', 12, 28); await cancel(committed, 'edit cancelled');
    event = await edit(committed, 'Intervalo confirmado', 10, 30); committed = await apply(event, 'edited');
    await edit(committed, 'Orientación incompatible sin resembrar', 10, 30, 'opposed', true); await closeEdit();
    await strictOutside(committed, 42, 'strict/above-maximum'); await strictOutside(committed, 2, 'strict/below-minimum');
    event = await drag(committed, 42, 32, 'maximum', 'projection/upper-cancel'); await cancel(committed, 'boundary projection cancelled');
    event = await drag(committed, 42, 32, 'maximum', 'projection/upper'); const beforeProjection = committed.document; committed = await apply(event, 'boundary'); const boundary = committed.document;
    committed = await history('undo', beforeProjection, 'undo/one-projection'); committed = await history('redo', boundary, 'redo/one-projection');
    event = await drag(committed, 22, 22, 'interior', 'projection/inward-release'); committed = await apply(event, 'inward');
    event = await suppression(committed, true, 'suppress-cancel'); await cancel(committed, 'suppression cancelled');
    event = await suppression(committed, true, 'suppressed'); committed = await apply(event, 'suppressed');
    event = await suppression(committed, false, 'reactivated'); committed = await apply(event, 'reactivated');
    await control(TYPE, 'limit-distance'); await choose(0, face(committed.scene, 'moving')); await choose(1, face(committed.scene, 'fixed')); await control(NAME, 'Intervalos incompatibles'); await control(MIN, '40'); await control(MAX, '50'); await control(ALIGN, 'aligned');
    before = await observe(); await click(CREATE); event = await responseAfter(before.serial, 'preview-assembly'); check(event.proposed.mates.length === 2 && canonical(event.proposed.mates.at(-1).limits) === canonical({ minimum: 40, maximum: 50 }), 'Contradiction intent changed.'); await rejected(event, committed, 'contradiction');
    event = await remove(committed, 'delete-cancel'); await cancel(committed, 'deletion cancelled'); event = await remove(committed, 'deleted'); committed = await apply(event, 'deleted');
    event = await add(committed, 'Normales opuestas actuales', 10, 30, 'opposed', false, true); committed = await apply(event, 'opposed-native-bottom');
    event = await remove(committed, 'remove-opposed'); committed = await apply(event, 'remove-opposed');
    event = await add(committed, 'Referencias invertidas con signo explícito', -30, -10, 'aligned', true); committed = await apply(event, 'reversed-signed-range');
    event = await edit(committed, 'Intervalo entre planos guardado', -30, -10); committed = await apply(event, 'renamed');
    await button('Guardar como', '.assembly-toolbar'); await waitFor('actual Save As/file IPC', async () => { if (dialogCounts().saves !== 1 || !ipc.some(value => value.channel === 'document:save' && value.completed)) return false; try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } });
    await idle('saved interval idle'); const savedBytes = await fsp.readFile(output); before = await observe(); await button('Abrir', '.assembly-toolbar'); event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(committed.document), 'Reopen changed exact saved interval/source/poses.'); relations(event.response.value, event.document); committed = { document: event.document, scene: event.response.value }; await recovery(committed.document, 'reopened'); record('reopen/committed', event);
    await waitFor('reopen history reset', () => page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true));
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 1, 4); await readyUi(event); record('reopen/fresh-native', event); await cancel(committed, 'fresh solve cancelled');
    await button('Isométrica', '.assembly-view-tools'); await capture(committed.document);
    const final = await observe(), counts = dialogCounts(); check(phases.length === 38 && phases.filter(value => value.action === 'apply-assembly').length === 11 && gestures.length === 4
      && evidence.viewInputs?.length === 1 && evidence.viewInputs[0].label === 'projection/inward-release', 'Unexpected interval workflow coverage/counts.');
    check(counts.opens === 2 && counts.saves === 1 && counts.csvExports === 0 && ipc.length === 3 && ipc.every(value => value.completed), 'Unexpected actual file IPC/dialog sequence.'); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Actual renderer/worker failure.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200) && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Actual worker/WASM load absent.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes) && digest(await fsp.readFile(output)) === digest(savedBytes), 'Original or saved bytes changed after reopen.');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: committed.document,
      independentOracles: 'Original fixed40x30x4 V4800/A2960,moving10x6x2 V120/A184,total4920/3144; placed eight-corner box bounds/V/A1e-5; fixedpose and scene/savedtranslations1e-12,physicalscene/savedangle1e-8; actual n2 dot(P1-P2) signed inclusive range1e-6mm/orientation1e-6rad. Initial top/topq20 range10..30; strict Tz42/Tz2 rejected, issuedZpointerTz42 projects32; actual DOM double-or-float32 and affine postedinput1e-6mm, literal clampTz[12,32] and deviation use actual posted intention1e-6mm; nominal inwardTz22 releases boundary. Bilateralrank2/DOF4 even boundary, suppressed/deletedrank0/DOF6. Opposed actualmovingbottom vsfixedtop, no antipodal reseed; reversedtops explicit[-30,-10].',
      limits: 'Only two infinite plane supports,original fixed/free2boxfixture. Actual nativefacepointer and Zmanipulator/scriptedcontrols,test-owneddialogs, no state/workerreplyinjection. Geometric bound proximity is not a working-set or fullydefined certificate; no general cone/KKT, finitecontact, anglelimit, arbitrary mechanisms, human dialogs,installedpackage orplatform support.' });
  };
};
