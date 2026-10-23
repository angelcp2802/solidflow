'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original drilled prisms: actual DOM controls, worker, authenticated Apply and
// restricted file IPC. No document/React-state/CAD-response injection.
module.exports = function directedAngleWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts, captureAtEnd = true } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const TYPE = 'select[aria-label="Tipo de relación"]', NAME = 'input[aria-label="Nombre de la relación"]';
  const START = 'input[aria-label="Inicio del arco en grados"]', SWEEP = 'input[aria-label="Recorrido permitido en grados"]';
  const CREATE = 'button[aria-label="Vista previa del nuevo límite dirigido"]', EDIT = 'button[aria-label="Vista previa del límite dirigido editado"]';
  const SUMMARY = '[aria-label="Límites dirigidos verificados"]', VIEW = '[aria-label="Visor 3D del ensamblaje"]';
  const labels = ['Primera dirección del límite', 'Segunda dirección del límite', 'Eje guía del límite'];
  const phases = [], gestures = [], evidence = { scenario: 'original-directed-circular-stops', phases, gestures }; checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + '; actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const vector = (actual, wanted, tolerance, label) => { check(Array.isArray(actual) && actual.length === wanted.length, label + ' dimensions'); actual.forEach((value, index) => near(value, wanted[index], tolerance, label + '[' + index + ']')); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rotate = (q, v) => { const t = cross(q.slice(0, 3), v).map(value => 2 * value), u = cross(q.slice(0, 3), t); return v.map((value, index) => value + q[3] * t[index] + u[index]); };
  const idle = () => waitFor('directed angle workspace idle', () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  const record = (label, event) => phases.push({ label, serial: event.serial, action: event.action,
    current: event.current, proposed: event.proposed, document: event.document, motion: event.motion, drag: event.drag, response: event.response });
  async function button(text, scope = '.assembly-app') {
    await page((text, scope) => { const values = [...document.querySelectorAll(scope + ' button')].filter(value => value.textContent.trim() === text);
      if (values.length !== 1 || values[0].disabled) throw Error('Exact enabled button absent: ' + text); values[0].click(); }, text, scope);
  }
  async function control(selector, value) {
    await page((selector, value) => { const element = document.querySelector(selector); if (!element || element.disabled) throw Error('Editable control absent: ' + selector);
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (element instanceof HTMLSelectElement && ![...element.options].some(option => option.value === value && !option.disabled)) throw Error('Enabled option absent.');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('rendered control ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function response(serial, action) {
    return waitFor('actual ' + action, async () => { const state = await observe(), events = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response);
      check(!state.workerErrors.length && events.length <= 1, 'Worker error or duplicate operation.'); if (!events.length) return false;
      check(events[0].response.ok, events[0].response.error || 'Actual operation failed.'); return events[0]; });
  }
  async function recovery(document, label) {
    await waitFor(label + ' exact committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
      && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  const moving = document => { const values = document.occurrences.filter(value => value.id === 'moving'); check(values.length === 1, 'Moving occurrence absent.'); return values[0]; };
  function geometry(scene, document, degrees) {
    check(scene?.solidCount === 2 && scene.prototypeCount === 1 && scene.bodies.length === 2 && !scene.warnings.length, 'Original native inventory changed.');
    near(scene.volume, 480 - 8 * Math.PI, 1e-5, 'Two original drilled prism volumes mm3');
    near(scene.area, 496 + 12 * Math.PI, 1e-5, 'Two original drilled prism areas mm2');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Stop changed native source geometry.');
    check(canonical(document.occurrences.find(value => value.id === 'ground')) === canonical(expected.occurrences.find(value => value.id === 'ground')), 'Ground component changed.');
    const totalMin = [Infinity, Infinity, Infinity], totalMax = [-Infinity, -Infinity, -Infinity];
    for (const saved of document.occurrences) {
      const bodies = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([saved.id])); check(bodies.length === 1, 'Exact placed native body absent.');
      const native = bodies[0]; check(native.solidCount === 1 && canonical(native.component.definition) === canonical(saved.definition), 'Native body identity changed.');
      near(native.volume, 240 - 4 * Math.PI, 1e-5, 'Original placed prism volume'); near(native.area, 248 + 6 * Math.PI, 1e-5, 'Original placed prism area');
      vector(native.worldPose.translation, saved.pose.translation, 1e-12, 'Scene/saved position mm');
      near(Math.hypot(...saved.pose.rotation), 1, 1e-10, 'Saved unit quaternion');
      const poseChord = Math.min(Math.hypot(...native.worldPose.rotation.map((value, index) => value - saved.pose.rotation[index])), Math.hypot(...native.worldPose.rotation.map((value, index) => value + saved.pose.rotation[index])));
      near(4 * Math.asin(Math.min(1, poseChord / 2)), 0, 1e-8, 'Scene/saved orientation rad');
      // Angular restoration does not constrain the free origin. Independent
      // corners authenticate the resulting placement, not an invented anchor.
      const corners = [-5, 5].flatMap(x => [-3, 3].flatMap(y => [0, 4].map(z => rotate(saved.pose.rotation, [x, y, z]).map((value, index) => value + saved.pose.translation[index]))));
      const minimum = [0, 1, 2].map(index => Math.min(...corners.map(value => value[index]))), maximum = [0, 1, 2].map(index => Math.max(...corners.map(value => value[index])));
      vector(native.bounds.min, minimum, 1e-5, 'Independent placed prism minimum mm'); vector(native.bounds.max, maximum, 1e-5, 'Independent placed prism maximum mm');
      for (let index = 0; index < 3; index++) { totalMin[index] = Math.min(totalMin[index], minimum[index]); totalMax[index] = Math.max(totalMax[index], maximum[index]); }
    }
    vector(scene.bounds.min, totalMin, 1e-5, 'Independent aggregate minimum mm'); vector(scene.bounds.max, totalMax, 1e-5, 'Independent aggregate maximum mm');
    const pose = moving(document).pose;
    const half = degrees * Math.PI / 360, q = [Math.sin(half), 0, 0, Math.cos(half)],
      chord = Math.min(Math.hypot(...pose.rotation.map((value, index) => value - q[index])), Math.hypot(...pose.rotation.map((value, index) => value + q[index])));
    near(4 * Math.asin(Math.min(1, chord / 2)), 0, 1e-6, 'Independent local-X orientation radians');
  }
  function ready(event, degrees, activity, active = true, expectedAngleDegrees = degrees) {
    const value = event.response.value;
    if (!(value.status === 'ready' && value.hasToken)) evidence.failedPreview = event;
    check(value.status === 'ready' && value.hasToken, 'Expected authenticated directed-stop preview.'); geometry(value.scene, value.document, degrees);
    const mate = value.document.mates[0], reports = value.limitDirectedAngles ?? [];
    check(mate?.type === 'limit-directed-angle' && mate.coordinate === 'directed-about-axis' && mate.suppressed === !active, 'Saved circular stop missing.');
    check(reports.length === (active ? 1 : 0), 'Fresh directed-stop report count differs.');
    check(value.checks.every(item => item.satisfied && item.angleResidual <= item.angleTolerance && item.lengthResidual <= item.lengthTolerance), 'Hard native checks failed.');
    if (active) {
      const report = reports[0];
      check(report.kind === 'limit-directed-angle' && report.coordinate === 'directed-about-axis' && report.mateId === mate.id
        && canonical(report.scopePath) === '[]' && canonical(report.arcDegrees) === canonical(mate.arc) && report.supportOnly === true
        && report.activity === activity && report.fullCircle === false, 'Fresh native report intent/activity differs.');
      near(Math.min(Math.abs(report.angleDegrees - expectedAngleDegrees), 360 - Math.abs(report.angleDegrees - expectedAngleDegrees)), 0, 1e-5, 'Circular angle degrees');
      [0, 0, 1].forEach((v, i) => near(report.firstDirection[i], v, 1e-8, 'Fixed original top normal'));
      rotate(moving(value.document).pose.rotation, [0, 0, 1]).forEach((v, i) => near(report.secondDirection[i], v, 1e-8, 'Moving original top normal from saved pose'));
      [1, 0, 0].forEach((v, i) => near(report.guideDirection[i], v, 1e-8, 'Explicit +X guide'));
      check([report.firstKind, report.secondKind, report.guideKind].every(kind => kind === 'plane'), 'Expected native plane normals and datum guide.');
      check(report.marginsRadians.minimum >= -report.angleToleranceRadians && report.marginsRadians.maximum >= -report.angleToleranceRadians, 'Fresh native circular margins failed.');
    }
    return value;
  }
  async function apply(event, label, degrees) {
    await idle(); await waitFor(label + ' Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await observe(); await click(APPLY); const applied = await response(before.serial, 'apply-assembly'), value = applied.response.value;
    check(value.kind === 'assembly-applied' && applied.hasToken, 'Actual Apply capability absent.');
    const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = value.document;
    check(canonical(a) === canonical(b), 'Apply changed authenticated candidate.'); geometry(value.scene, value.document, degrees);
    await recovery(value.document, label); record(label + '/apply', applied); return value;
  }
  async function cancel(base, label) {
    await idle(); await click(CANCEL); await recovery(base.document, label);
    check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY), 'Cancelled report or Apply retained.');
  }
  async function select(slot, ref) {
    const selector = 'select[aria-label="' + labels[slot] + '"]', values = await page(selector => [...document.querySelector(selector).options].map(value => value.value), selector);
    const matches = values.filter(value => value && canonical(JSON.parse(value)) === canonical(ref)); check(matches.length === 1, 'Exact stop reference absent.');
    await control(selector, matches[0]);
  }
  async function history(action, document, degrees) {
    const before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]');
    const event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(document), 'History lost exact accepted state.');
    geometry(event.response.value, event.document, degrees); await recovery(document, action); record(action, event);
    return { document: event.document, scene: event.response.value };
  }
  async function selectMoving() {
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Moving component row absent.'); rows[0].click(); }, moving(expected).name);
    await waitFor('moving component selected', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, moving(expected).name));
  }
  const circularDegrees = degrees => ((degrees % 360) + 360) % 360;
  const xDegrees = pose => {
    vector(pose.rotation.slice(1, 3), [0, 0], 1e-6, 'Original local-X rotation chart');
    const degrees = 2 * Math.atan2(pose.rotation[0], pose.rotation[3]) * 180 / Math.PI;
    return degrees < -180 ? degrees + 360 : degrees > 180 ? degrees - 360 : degrees;
  };
  function physicalXError(pose, degrees) {
    near(Math.hypot(...pose.rotation), 1, 1e-10, 'Actual rotation quaternion unit norm');
    const half = degrees * Math.PI / 360, expected = [Math.sin(half), 0, 0, Math.cos(half)],
      chord = Math.min(Math.hypot(...pose.rotation.map((value, index) => value - expected[index])), Math.hypot(...pose.rotation.map((value, index) => value + expected[index])));
    return 4 * Math.asin(Math.min(1, chord / 2));
  }
  function nativeCircularAngle(scene, mate) {
    check(mate.type === 'limit-directed-angle' && canonical(mate.guide) === canonical({ kind: 'principal-plane', component: null, plane: 'YZ' }), 'Original explicit +X guide changed.');
    const direction = ref => {
      check(ref.kind === 'face' && ref.support === 'plane', 'Original cap purpose changed.');
      const bodies = scene.bodies.filter(value => canonical(value.component) === canonical(ref.component) && canonical(value.body) === canonical(ref.body));
      check(bodies.length === 1, 'Exact current native direction body absent.');
      const faces = bodies[0].faces.filter(value => canonical(value.selection.face) === canonical(ref.face));
      check(faces.length === 1 && faces[0].worldSupport?.kind === 'plane', 'Exact current native cap absent.');
      const normal = faces[0].worldSupport.normal; near(Math.hypot(...normal), 1, 1e-8, 'Actual native cap unit normal'); return normal;
    };
    const a = direction(mate.first), b = direction(mate.second);
    // Independent yz-plane azimuth for the declared +X guide. No CAD solver
    // coordinate helper or reported angle supplies this expectation.
    return circularDegrees(Math.atan2(a[1] * b[2] - a[2] * b[1], a[1] * b[1] + a[2] * b[2]) * 180 / Math.PI);
  }
  async function drag(base, targetDegrees, wantedDegrees, activity, label) {
    await selectMoving(); await button('Frontal', '.assembly-view-tools'); await click('button[aria-label="Arrastrar giro"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(selector => { const r = document.querySelector(selector + ' canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, VIEW);
    const bounds = base.scene.visibleBounds, old = moving(base.document).pose, oldDegrees = xDegrees(old), center = bounds.min.map((value, index) => (value + bounds.max[index]) / 2),
      span = Math.hypot(...bounds.max.map((value, index) => value - bounds.min[index])), pixels = rect.height / (1.3 * span),
      origin = { x: rect.x + rect.width / 2 + (old.translation[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (old.translation[2] - center[2]) * pixels };
    check(targetDegrees >= -90 && targetDegrees <= 90 && Math.abs(targetDegrees - oldDegrees) < 180, 'Pointer oracle requires the declared short local-X chart.');
    let point; const hoverInputs = [];
    for (const sign of [-1, 1]) { for (const offset of [.08, .10, .06, .12, .14, .04, .16, .02]) {
      const candidate = { x: origin.x, y: origin.y + sign * rect.height * offset }; hoverInputs.push(candidate); await pointer('mouseMoved', candidate);
      if (await page(selector => document.querySelector(selector)?.getAttribute('data-drag-axis'), VIEW) === 'X') { point = candidate; break; }
    } if (point) break; }
    check(!!point, 'Actual circular-stop local-X rotation handle absent.');
    await page(selector => {
      if (Object.hasOwn(window, '__solidflowDirectedInputObservation')) throw Error('Previous directed angular input observer retained.');
      const canvas = document.querySelector(selector + ' canvas'), events = []; let overflow = false;
      const read = event => { if (events.length >= 32) { overflow = true; return; } events.push({ type: event.type, clientX: event.clientX, clientY: event.clientY, buttons: event.buttons,
        isTrusted: event.isTrusted, pointerId: event.pointerId, pointerType: event.pointerType, timeStamp: event.timeStamp }); };
      const types = ['pointerdown', 'pointermove', 'pointerup']; types.forEach(type => canvas.addEventListener(type, read, { capture: true, passive: true }));
      Object.defineProperty(window, '__solidflowDirectedInputObservation', { configurable: true, value: Object.freeze({ snapshot: () => ({ events: events.map(event => ({ ...event })), overflow }),
        stop: () => { types.forEach(type => canvas.removeEventListener(type, read, true)); delete window.__solidflowDirectedInputObservation; return { events: events.map(event => ({ ...event })), overflow }; } }) });
    }, VIEW);
    let calibration;
    try {
      const before = await observe(), recoveryBefore = await page(() => localStorage.getItem('solidflow.autosave')), moves = [], samples = [];
      await pointer('mousePressed', point, 1); await waitFor('held directed angular input blocks Apply', () => page(apply => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'true' && document.querySelector(apply)?.disabled === true, APPLY));
      for (const fraction of [1 / 3, 2 / 3]) {
        // Fit scale only chooses sampling inputs. Calibration uses actual DOM
        // coordinates and posted targets, never a solved pose or CAD response.
        const next = { x: point.x, y: point.y + (targetDegrees - oldDegrees) * Math.PI / 180 * rect.height / 13 * fraction }, serial = (await observe()).serial;
        moves.push(next); await pointer('mouseMoved', next, 1);
        const request = await waitFor('actual posted directed local-X calibration target', async () => { const state = await observe(); check(!state.workerErrors.length, 'Actual directed angular worker error.');
          const values = state.assemblies.filter(value => value.serial > serial && value.action === 'project-assembly-component'); check(values.length <= 1, 'Duplicate directed angular calibration request.'); return values[0] || false; });
        const input = await page(() => window.__solidflowDirectedInputObservation.snapshot()), held = input.events.filter(event => event.type === 'pointermove' && event.buttons === 1), actual = held.at(-1);
        check(!input.overflow && held.length === moves.length && actual?.isTrusted && actual.pointerType === 'mouse' && request.drag.mode === 'rotate'
          && canonical(request.current) === canonical(base.document), 'Lost actual held directed angular input or posted base.');
        samples.push({ point: next, clientPoint: { x: actual.clientX, y: actual.clientY }, inputEvent: actual, workerSerial: request.serial, requestedPose: request.drag.pose, requestedDegrees: xDegrees(request.drag.pose) });
      }
      const a = samples[0], b = samples[1], slope = (b.requestedDegrees - a.requestedDegrees) / (b.clientPoint.y - a.clientPoint.y);
      check(Number.isFinite(slope) && slope !== 0 && a.workerSerial !== b.workerSerial, 'Actual directed local-X calibration is not a distinct affine input mapping.');
      const finalPoint = { x: point.x, y: b.clientPoint.y + (targetDegrees - b.requestedDegrees) / slope };
      check(Number.isFinite(finalPoint.y) && finalPoint.y >= 0, 'Literal directed pointer target is not a finite global coordinate.');
      calibration = { method: 'two-posted-local-X-target-affine', coordinateSource: 'actual-dom-client', samples, slope, finalPoint }; evidence.pendingPointerCalibration = { label, ...calibration };
      moves.push(finalPoint); await pointer('mouseMoved', finalPoint, 1);
      const input = await page(() => window.__solidflowDirectedInputObservation.snapshot()), held = input.events.filter(event => event.type === 'pointermove' && event.buttons === 1), actualInput = held.at(-1);
      check(!input.overflow && held.length === 3 && actualInput?.isTrusted && actualInput.pointerId === a.inputEvent.pointerId, 'Final directed target was not the third actual held move.');
      calibration.finalClientPoint = { x: actualInput.clientX, y: actualInput.clientY }; calibration.finalInputEvent = actualInput;
      await pointer('mouseReleased', finalPoint); await waitFor('actual directed projection reply', async () => (await observe()).assemblies.some(value => value.serial > before.serial && value.action === 'project-assembly-component' && value.response)); await idle();
      const requests = (await observe()).assemblies.filter(value => value.serial > before.serial && value.action === 'project-assembly-component');
      check(requests.length === 3 && samples.every((sample, index) => sample.workerSerial === requests[index].serial)
        && requests.every(value => value.response?.ok && canonical(value.current) === canonical(base.document)), 'Directed angular stream lost its three actual inputs/base.');
      const event = requests.at(-1);
      evidence.pendingPointerEvent = { label, event };
      const requested = event.drag.pose, requestedQuaternionErrorRadians = physicalXError(requested, targetDegrees), requestedDegrees = xDegrees(requested);
      near(requestedQuaternionErrorRadians, 0, 1e-6, 'Literal requested physical quaternion error rad');
      near(requestedDegrees * Math.PI / 180, targetDegrees * Math.PI / 180, 1e-6, 'Literal actual requested local-X angle rad');
      check(canonical(base.document.mates[0].arc) === canonical({ start: 330, sweep: 90 }), 'Pointer oracle requires the literal [-30,60] arc.');
      // Finite DOM coordinates quantize the input. Project the bounded actual
      // posted intention onto the literal arc, without reading solved output.
      const inputExpectedDegrees = Math.max(-30, Math.min(60, requestedDegrees)), inputExpectedCircularDegrees = circularDegrees(inputExpectedDegrees);
      calibration.finalRequest = { workerSerial: event.serial, requestedPose: requested }; Object.assign(evidence.pendingPointerCalibration, calibration);
      const result = ready(event, circularDegrees(wantedDegrees), activity, true, inputExpectedCircularDegrees), resolved = moving(result.document).pose, witness = result.projection;
      const resolvedQuaternionErrorRadians = physicalXError(resolved, wantedDegrees);
      near(resolvedQuaternionErrorRadians, 0, 1e-6, 'Projected physical quaternion error rad');
      near(xDegrees(resolved) * Math.PI / 180, wantedDegrees * Math.PI / 180, 1e-6, 'Independent directed projection local-X pose rad');
      vector(requested.translation, old.translation, 1e-6, 'Pointer rotation preserves requested origin'); vector(resolved.translation, old.translation, 1e-6, 'Directed projection secondary position');
      check(event.drag.mode === 'rotate' && witness?.temporaryAnchor === false && witness.evidence.localOnly === true && !result.motion && !result.movement, 'Projected directed rotation replaced by strict motion.');
      near(witness.positionResidual, 0, 1e-6, 'Secondary position residual'); near(witness.angleResidual, Math.abs(requestedDegrees - inputExpectedDegrees) * Math.PI / 180, 1e-6, 'Pointer deviation separate from circular bounds');
      const nativeAngleDegrees = nativeCircularAngle(result.scene, result.document.mates[0]);
      near(Math.min(Math.abs(nativeAngleDegrees - inputExpectedCircularDegrees), 360 - Math.abs(nativeAngleDegrees - inputExpectedCircularDegrees)), 0, 1e-5, 'Independent native circular projection angle');
      check(canonical(result.document.mates) === canonical(base.document.mates) && canonical(result.document.definitions) === canonical(base.document.definitions), 'Directed projection changed saved declaration.');
      check(await page(() => localStorage.getItem('solidflow.autosave')) === recoveryBefore, 'Directed projection preview changed committed recovery.');
      await waitFor('released projection and circular summary rendered', () => page((apply, summary) => document.querySelector(apply)?.disabled === false
        && !!document.querySelector(summary) && document.querySelector('[aria-label="Proyección del arrastre"]')?.textContent.includes('Revisa el destino resuelto antes de Aplicar'), APPLY, SUMMARY));
      const displayed = await page(name => ({ deviation: document.querySelector('[aria-label="Desviación del puntero"]')?.textContent,
        angle: document.querySelector('output[aria-label="Ángulo dirigido verificado ' + name + '"]')?.textContent }), result.document.mates[0].name),
        positionText = /Posición:\s*([+\-.\deE]+)\s*mm/.exec(displayed.deviation ?? ''), angleText = /Giro:\s*([+\-.\deE]+)\s*rad/.exec(displayed.deviation ?? '');
      check(!!positionText && !!angleText, 'Actual projection feedback units or values absent.');
      near(Number(positionText[1]), witness.positionResidual, 1e-6, 'Displayed pointer position deviation mm');
      near(Number(angleText[1]), witness.angleResidual, 1e-9, 'Displayed pointer angular deviation rad'); near(Number(displayed.angle), inputExpectedCircularDegrees, 1e-5, 'Displayed circular limit angle degrees');
      gestures.push({ kind: 'local-X-directed-stop-projection', label, axis: 'X', down: point, hoverInputs, moves, targetDegrees, wantedDegrees,
        circularWantedDegrees: circularDegrees(wantedDegrees), requestedDegrees, inputExpectedDegrees, inputExpectedCircularDegrees,
        requestedQuaternionErrorRadians, resolvedQuaternionErrorRadians, nativeAngleDegrees,
        pointerAngularResidualRadians: witness.angleResidual, workerSerials: requests.map(value => value.serial), calibration, displayed });
      delete evidence.pendingPointerCalibration; delete evidence.pendingPointerEvent; record(label + '/preview', event); return event;
    } finally {
      const input = await page(() => window.__solidflowDirectedInputObservation?.stop() ?? null);
      if (calibration && input) calibration.inputEvents = input.events;
      if (evidence.pendingPointerCalibration?.label === label && input) evidence.pendingPointerCalibration.inputEvents = input.events;
    }
  }
  async function move(base, increment, degrees, activity, accept = true, active = true) {
    await selectMoving(); const pose = moving(base.document).pose;
    for (let index = 0; index < 3; index++) await control('input[aria-label="Destino local ' + ['X', 'Y', 'Z'][index] + ' del componente"]', String(pose.translation[index]));
    await control('select[aria-label="Eje local del movimiento"]', '0');
    await control('input[aria-label="Giro local del movimiento en grados"]', String(increment));
    const before = await observe(); await button('Vista previa del movimiento'); const event = await response(before.serial, 'move-assembly-component-motion');
    check(canonical(event.current) === canonical(base.document), 'Movement lost committed base.');
    near(event.motion.rotation.angle, increment * Math.PI / 180, 1e-12, 'Explicit signed motion request radians');
    if (accept) {
      ready(event, degrees, activity, active);
      vector(moving(event.response.value.document).pose.translation, pose.translation, 1e-7, 'Strict movement preserves explicitly requested position mm');
    }
    else {
      check(event.response.value.status === 'rejected' && !event.response.value.hasToken, 'Forbidden sampled motion was accepted.');
      await recovery(base.document, 'atomic rejected movement');
      check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY), 'Rejected movement exposed Apply or stale report.');
    }
    record('motion/' + increment + (accept ? '/ready' : '/rejected'), event); return event;
  }
  async function suppression(base, suppress, degrees, activity) {
    const before = await observe(); await click('input[aria-label="Activar ' + base.document.mates[0].name + '"]'); const event = await response(before.serial, 'preview-assembly');
    ready(event, degrees, activity, !suppress); record(suppress ? 'suppress/preview' : 'reactivate/preview', event); return event;
  }
  return async () => {
    const originalBytes = await fsp.readFile(input); check(expected.id === 'assembly-direction-original' && expected.mates.length === 0, 'Original synthetic fixture required.');
    await waitFor('initial production desktop', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('test-owned initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Fixture changed on open.');
    let committed = { document: event.document, scene: event.response.value }; geometry(committed.scene, committed.document, 30);
    function top(id) {
      const bodies = committed.scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([id])); check(bodies.length === 1, 'Exact component body absent.');
      const faces = bodies[0].faces.filter(value => value.support?.kind === 'plane' && value.support.normal[2] > .999 && Math.abs(value.support.point[2] - 4) < 1e-8);
      check(faces.length === 1, 'Exact native cap absent.'); return { kind: 'face', ...faces[0].selection, support: 'plane' };
    }
    const first = top('ground'), second = top('moving'), guide = { kind: 'principal-plane', component: null, plane: 'YZ' };
    async function author() {
      await control(TYPE, 'limit-directed-angle'); await select(0, first); await select(1, second); await select(2, guide);
      await control(NAME, 'Tope circular original'); await control(START, '330'); await control(SWEEP, '60');
      const serial = (await observe()).serial; await click(CREATE); const result = await response(serial, 'preview-assembly'); ready(result, 30, 'maximum');
      const mate = result.response.value.document.mates[0]; check(canonical(mate.arc) === canonical({ start: 330, sweep: 60 })
        && canonical(mate.first) === canonical(first) && canonical(mate.second) === canonical(second) && canonical(mate.guide) === canonical(guide), 'Authoring lost explicit arc/references.');
      record('author/preview', result); return result;
    }
    await idle(); event = await author(); await cancel(committed, 'cancel initial stop');
    event = await author(); committed = await apply(event, 'authored', 30); const authored = committed.document;
    await history('undo', expected, 30); committed = await history('redo', authored, 30);
    await move(committed, 5, 35, null, false);
    event = await move(committed, -30, 0, 'interior'); committed = await apply(event, 'return from upper to zero', 0);
    event = await move(committed, -30, 330, 'minimum'); committed = await apply(event, 'lower boundary', 330);
    await move(committed, -5, 325, null, false);
    event = await move(committed, 20, 350, 'interior'); committed = await apply(event, 'return from lower', 350);
    event = await move(committed, 20, 10, 'interior'); committed = await apply(event, 'cross zero', 10);
    await move(committed, 360, 10, null, false);
    event = await suppression(committed, true, 10, null); committed = await apply(event, 'suppress', 10);
    event = await move(committed, 40, 50, null, true, false); committed = await apply(event, 'suppressed motion', 50);
    event = await suppression(committed, false, 30, 'maximum'); committed = await apply(event, 'reactivate and restore', 30);
    event = await move(committed, -20, 10, 'interior'); committed = await apply(event, 'inward after restored stop', 10);
    const beforeEdit = committed.document, oldMate = beforeEdit.mates[0];
    await click('button[aria-label="Editar límite dirigido ' + oldMate.name + '"]');
    await control(NAME, 'Tope circular guardado'); await control(SWEEP, '90'); before = await observe(); await click(EDIT);
    event = await response(before.serial, 'preview-assembly'); ready(event, 10, 'interior');
    const edited = event.response.value.document.mates[0]; check(edited.id === oldMate.id && canonical(edited.arc) === canonical({ start: 330, sweep: 90 })
      && canonical(edited.first) === canonical(first) && canonical(edited.second) === canonical(second) && canonical(edited.guide) === canonical(guide), 'Editing lost identity or explicit refs.');
    record('edit/preview', event); committed = await apply(event, 'edit', 10); const editedDocument = committed.document;
    await history('undo', beforeEdit, 10); committed = await history('redo', editedDocument, 10);
    // The edited 330+90 arc is [-30,60] on this short signed input chart.
    // Cancel one actual pointer preview before applying an identical gesture.
    event = await drag(committed, 90, 60, 'maximum', 'pointer/upper-cancel'); await cancel(committed, 'cancel upper pointer projection');
    const beforePointer = committed.document;
    event = await drag(committed, 90, 60, 'maximum', 'pointer/upper'); committed = await apply(event, 'pointer upper stop', 60); const upperPointer = committed.document;
    await history('undo', beforePointer, 10); committed = await history('redo', upperPointer, 60);
    event = await drag(committed, 40, 40, 'interior', 'pointer/inward-from-upper'); committed = await apply(event, 'pointer inward from upper', 40);
    event = await drag(committed, -40, -30, 'minimum', 'pointer/lower'); committed = await apply(event, 'pointer lower stop', 330);
    event = await drag(committed, -10, -10, 'interior', 'pointer/inward-from-lower'); committed = await apply(event, 'pointer inward from lower', 350);
    event = await drag(committed, 10, 10, 'interior', 'pointer/cross-zero'); committed = await apply(event, 'pointer cross zero', 10);
    const savedExpectedCircularDegrees = gestures.at(-1).inputExpectedCircularDegrees;
    await button('Guardar como', '.assembly-toolbar');
    await waitFor('actual directed stop saved', async () => { if (dialogCounts().saves !== 1) return false;
      try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } });
    await idle(); before = await observe(); await button('Abrir', '.assembly-toolbar'); event = await response(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(committed.document), 'Saved/reopened circular intent changed.'); geometry(event.response.value, event.document, 10); await recovery(committed.document, 'reopen'); record('reopen', event);
    check(await page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true
      && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true), 'Reopening retained unrelated history.');
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly'); ready(event, 10, 'interior', true, savedExpectedCircularDegrees); record('reopen/fresh native verification', event);
    await waitFor('fresh report rendered', () => page(selector => !!document.querySelector(selector), SUMMARY)); await cancel(committed, 'final read-only verification');
    if (captureAtEnd) await capture(committed.document);
    const state = await observe(); check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && ipc.every(value => value.completed), 'Unexpected or incomplete dialogs.');
    check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request failure.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200)
      && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Production worker/WASM absent.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Original fixture bytes changed.');
    Object.assign(evidence, { savedSha256: digest(await fsp.readFile(output)),
      independentOracles: 'Original drilled prisms V480-8pi,A496+12pi at1e-5; local-X quaternions at1e-6rad; top+Z to Rx(theta)+Z about+X=theta modulo360 at1e-5deg; initial330+60arc. Atomic outward/full-turn rejection, inward release, suppression/reactivation, history, exact save/reopen. Six trusted local-X pointer drags on edited330+90arc:90projects60(cancel/repeat),40inward,-40projects-30,-10inward,10crosseszero. Actual posted input and resolved quaternion versus ideal targets1e-6rad; report/native cap yz azimuth/display versus actual posted input independently clamped to[-30,60] at1e-5deg, with the input-derived expectation retained through reopen. Pointer deviation1e-6rad; secondaryposition1e-6mm; displayed deviation1e-9rad.',
      limits: 'Hidden CDP pointer gestures and actual worker; input calibrated from actual DOM coordinates and posted intents only, never solved CAD feedback. Test-owned file dialogs. No human pointer/native-dialog, arbitrary orientation/guide gesture, continuous path, accumulated-turn stop, packaging or general platform support claim.' });
  };
};
