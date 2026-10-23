'use strict';
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original H4 leaves only. CDP supplies actual pointer input. Two trusted DOM
// positions and their posted targets calibrate the final input; no solved pose
// participates in that calibration or supplies the expected stop destination.
module.exports = async function hingeLimitsDrag(context) {
  const { evaluate, observe, waitFor, click, pointer, checks, check, canonical, intent, callbacks } = context;
  const VIEW = '[aria-label="Visor 3D del ensamblaje"]', APPLY = 'button[aria-label="Aplicar ensamblaje"]', SUMMARY = '[aria-label="Bisagra verificada"]';
  const evidence = { scenario: 'original-hinge-limited-local-Z-pointer', gestures: [], phases: [] }; checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); if (json === undefined) throw Error('Expected JSON data'); return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (actual, expected, band, label) => check(Number.isFinite(actual) && Math.abs(actual - expected) <= band, label + ': ' + actual + ' expected ' + expected);
  const vector = (a, b, band, label) => { check(Array.isArray(a) && a.length === b.length, label + ' dimensions'); a.forEach((v, i) => near(v, b[i], band, label + '[' + i + ']')); };
  const radians = degrees => degrees * Math.PI / 180, circular = angle => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const angleNear = (a, b, band, label) => near(Math.atan2(Math.sin(a - b), Math.cos(a - b)), 0, band, label);
  const moving = document => { const rows = document.occurrences.filter(o => o.id === 'moving'); check(rows.length === 1, 'Exact original moving root owner'); return rows[0]; };
  const body = (scene, id) => { const rows = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id])); check(rows.length === 1, 'Exact original native body ' + id); return rows[0]; };
  const yaw = pose => {
    near(Math.hypot(...pose.rotation), 1, 1e-10, 'Original current unit rotation'); vector(pose.rotation.slice(0, 2), [0, 0], 1e-6, 'Bounded physical local-Z chart');
    return Math.atan2(Math.sin(2 * Math.atan2(pose.rotation[2], pose.rotation[3])), Math.cos(2 * Math.atan2(pose.rotation[2], pose.rotation[3]))) * 180 / Math.PI;
  };
  function quaternionError(pose, degrees) {
    const h = radians(degrees) / 2, wanted = [0, 0, Math.sin(h), Math.cos(h)], chord = Math.min(
      Math.hypot(...pose.rotation.map((v, i) => v - wanted[i])), Math.hypot(...pose.rotation.map((v, i) => v + wanted[i])));
    return 4 * Math.asin(Math.min(1, chord / 2));
  }
  async function button(text, scope = '.assembly-app') { await page((text, scope) => {
    const rows = [...document.querySelectorAll(scope + ' button')].filter(e => e.textContent.trim() === text);
    if (rows.length !== 1 || rows[0].disabled) throw Error('Exact enabled button ' + text); rows[0].click();
  }, text, scope); }
  async function idle() { await waitFor('hinge pointer released workspace idle', () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')); }
  async function selectMoving(base) {
    await page(name => { const rows = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact original moving row'); rows[0].click(); }, moving(base.document).name);
    await waitFor('original moving root selected', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, moving(base.document).name));
  }
  function savedIntent(document) {
    check(document.mates.length === 1 && document.mates[0].type === 'hinge' && !document.mates[0].suppressed, 'One active original hinge for pointer projection');
    const mate = document.mates[0]; check(mate.stops?.coordinate === 'directed-about-axis' && canonical(mate.stops.arc) === canonical({ start: 330, sweep: 60 }), 'Literal symmetric physical stop interval');
    check(canonical([...mate.axis, ...mate.axial, ...mate.stops.angular]) === canonical(intent.references), 'Exact six saved reference identities');
    return mate;
  }
  function currentDirections(scene, mate) {
    const support = (reference, kind) => {
      check(reference.kind === 'face' && reference.component.occurrencePath.length === 1, 'Original material face purpose');
      const b = body(scene, reference.component.occurrencePath[0]); check(canonical(b.component) === canonical(reference.component) && canonical(b.body) === canonical(reference.body), 'Exact original current face owner/body');
      const rows = b.faces.filter(f => canonical(f.selection.face) === canonical(reference.face)); check(rows.length === 1 && rows[0].worldSupport?.kind === kind, 'Unique native current ' + kind);
      return rows[0].worldSupport;
    };
    const guide = support(mate.axis[0], 'cylinder').axis, a = support(mate.stops.angular[0], 'plane').normal, b = support(mate.stops.angular[1], 'plane').normal;
    check(intent.guideSign === 1 || intent.guideSign === -1, 'Explicit original observed guide sign'); vector(guide, [0, 0, intent.guideSign], 1e-8, 'Actual signed native Z guide');
    vector(a, [1, 0, 0], 1e-8, 'Fixed original +X angular normal'); near(a[2], 0, 1e-8, 'First angular XY projection'); near(b[2], 0, 1e-8, 'Second angular XY projection');
    near(Math.hypot(...b), 1, 1e-8, 'Moving native angular normal unit length');
    return { guide, first: a, second: b, phase: circular(intent.guideSign * Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])) };
  }
  function physical(scene, document, degrees, label) {
    check(scene.solidCount === 2 && scene.bodies.length === 2 && scene.prototypeCount === 1 && !scene.warnings.length, label + ' two original H4 native solids');
    near(scene.volume, 384 - 8 * Math.PI, 1e-5, label + ' original volume'); near(scene.area, 448 + 12 * Math.PI, 1e-5, label + ' original area');
    const c = Math.cos(radians(degrees)), s = Math.sin(radians(degrees)), native = body(scene, 'moving'), pose = moving(document).pose;
    near(quaternionError(pose, degrees), 0, 1e-6, label + ' input-derived physical quaternion'); vector(pose.translation, [0, 0, 4], 1e-6, label + ' coaxial axial seating');
    const points = native.vertexPoints.filter(v => v.point.every((x, i) => Math.abs(x - [10, 2, 4][i]) < 1e-10)); check(points.length === 1, label + ' exact material corner');
    vector(points[0].worldPoint, [10 * c - 2 * s, 10 * s + 2 * c, 8], 1e-6, label + ' literal input-derived native corner');
    const corners = [-2, 10].flatMap(x => [-2, 2].flatMap(y => [4, 8].map(z => [x * c - y * s, x * s + y * c, z])));
    vector(native.bounds.min, [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]))), 1e-6, label + ' literal moving lower bounds');
    vector(native.bounds.max, [0, 1, 2].map(i => Math.max(...corners.map(p => p[i]))), 1e-6, label + ' literal moving upper bounds');
    vector(body(scene, 'ground').bounds.min, [-2, -2, 0], 1e-6, label + ' fixed lower'); vector(body(scene, 'ground').bounds.max, [10, 2, 4], 1e-6, label + ' fixed upper');
    for (const b of scene.bodies) { near(b.volume, 192 - 4 * Math.PI, 1e-5, label + ' per-body volume'); near(b.area, 224 + 6 * Math.PI, 1e-5, label + ' per-body area'); }
    const directions = currentDirections(scene, savedIntent(document)); angleNear(directions.phase, circular(intent.guideSign * radians(degrees)), 1e-8, label + ' independent native XY azimuth');
    callbacks.geometry(scene, document, label); return directions;
  }
  async function drag(base, targetDegrees, label) {
    savedIntent(base.document); const old = moving(base.document).pose, oldDegrees = yaw(old); physical(base.scene, base.document, oldDegrees, label + '/base');
    check(targetDegrees >= -90 && targetDegrees <= 90 && Math.abs(targetDegrees - oldDegrees) < 180, 'Bounded original short local-Z pointer chart');
    await selectMoving(base); await button('Frontal', '.assembly-view-tools'); await click('button[aria-label="Arrastrar giro"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(selector => { const r = document.querySelector(selector + ' canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, VIEW), bounds = base.scene.visibleBounds,
      center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2), span = Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i])), pixels = rect.height / (1.3 * span),
      origin = { x: rect.x + rect.width / 2 + (old.translation[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (old.translation[2] - center[2]) * pixels };
    let down; const hoverInputs = [];
    for (const sign of [-1, 1]) { for (const offset of [.08, .10, .06, .12, .14, .04, .16, .02]) {
      const point = { x: origin.x + sign * rect.height * offset, y: origin.y }; hoverInputs.push(point); await pointer('mouseMoved', point);
      if (await page(selector => document.querySelector(selector)?.getAttribute('data-drag-axis'), VIEW) === 'Z') { down = point; break; }
    } if (down) break; }
    check(!!down, 'Actual original local-Z rotation handle');
    await page(selector => {
      if (Object.hasOwn(window, '__solidflowHingeStopInput')) throw Error('Previous hinge pointer observer retained');
      const canvas = document.querySelector(selector + ' canvas'), events = []; let overflow = false;
      const read = e => { if (events.length >= 32) { overflow = true; return; } events.push({ type: e.type, clientX: e.clientX, clientY: e.clientY, buttons: e.buttons,
        isTrusted: e.isTrusted, pointerId: e.pointerId, pointerType: e.pointerType, timeStamp: e.timeStamp }); };
      const types = ['pointerdown', 'pointermove', 'pointerup']; types.forEach(type => canvas.addEventListener(type, read, { capture: true, passive: true }));
      Object.defineProperty(window, '__solidflowHingeStopInput', { configurable: true, value: Object.freeze({ snapshot: () => ({ events: events.map(e => ({ ...e })), overflow }),
        stop: () => { types.forEach(type => canvas.removeEventListener(type, read, true)); delete window.__solidflowHingeStopInput; return { events: events.map(e => ({ ...e })), overflow }; } }) });
    }, VIEW);
    let calibration;
    try {
      const before = await observe(), recoveryBefore = await page(() => localStorage.getItem('solidflow.autosave')), moves = [], samples = [];
      await pointer('mousePressed', down, 1);
      await waitFor('held hinge projection blocks Apply', () => page(selector => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'true' && document.querySelector(selector)?.disabled === true, APPLY));
      for (const fraction of [1 / 3, 2 / 3]) {
        const point = { x: down.x + radians(targetDegrees - oldDegrees) * rect.height / 13 * fraction, y: down.y }, serial = (await observe()).serial;
        moves.push(point); await pointer('mouseMoved', point, 1);
        const request = await waitFor('actual posted local-Z calibration target', async () => { const state = await observe(); check(!state.workerErrors.length, 'Hinge pointer native worker errors');
          const list = state.assemblies.filter(e => e.serial > serial && e.action === 'project-assembly-component'); check(list.length <= 1, 'One posted calibration target'); return list[0] || false; });
        const input = await page(() => window.__solidflowHingeStopInput.snapshot()), held = input.events.filter(e => e.type === 'pointermove' && e.buttons === 1), actual = held.at(-1);
        check(!input.overflow && held.length === moves.length && actual?.isTrusted && actual.pointerType === 'mouse' && request.drag.mode === 'rotate' && canonical(request.current) === canonical(base.document), 'Actual trusted held input and exact posted base');
        samples.push({ point, input: actual, clientPoint: { x: actual.clientX, y: actual.clientY }, workerSerial: request.serial, requestedPose: request.drag.pose, requestedDegrees: yaw(request.drag.pose) });
      }
      const a = samples[0], b = samples[1], slope = (b.requestedDegrees - a.requestedDegrees) / (b.clientPoint.x - a.clientPoint.x);
      check(Number.isFinite(slope) && slope !== 0 && a.workerSerial !== b.workerSerial, 'Distinct affine local-Z posted-input calibration');
      const point = { x: b.clientPoint.x + (targetDegrees - b.requestedDegrees) / slope, y: down.y };
      check(Number.isFinite(point.x) && point.x >= 0, 'Finite global final pointer coordinate');
      calibration = { method: 'two-posted-local-Z-target-affine', coordinateSource: 'actual-dom-client', samples, slope, finalPoint: point }; evidence.pendingCalibration = { label, ...calibration };
      moves.push(point); await pointer('mouseMoved', point, 1);
      const input = await page(() => window.__solidflowHingeStopInput.snapshot()), held = input.events.filter(e => e.type === 'pointermove' && e.buttons === 1), actual = held.at(-1);
      check(!input.overflow && held.length === 3 && actual?.isTrusted && actual.pointerId === a.input.pointerId, 'Third held input is the actual calibrated destination');
      calibration.finalInput = actual; await pointer('mouseReleased', point);
      await waitFor('actual hinge projection completion', async () => (await observe()).assemblies.some(e => e.serial > before.serial && e.action === 'project-assembly-component' && e.response)); await idle();
      const requests = (await observe()).assemblies.filter(e => e.serial > before.serial && e.action === 'project-assembly-component');
      check(requests.length === 3 && samples.every((s, i) => s.workerSerial === requests[i].serial) && requests.every(e => e.response?.ok && canonical(e.current) === canonical(base.document)), 'All three actual pointer targets complete against one exact base');
      const event = requests.at(-1), requested = event.drag.pose, requestedDegrees = yaw(requested), expectedDegrees = Math.max(-30, Math.min(30, requestedDegrees));
      evidence.pendingEvent = { label, event }; calibration.finalRequest = { serial: event.serial, pose: requested };
      near(quaternionError(requested, targetDegrees), 0, 1e-6, 'Literal intended posted local-Z quaternion'); near(radians(requestedDegrees - targetDegrees), 0, 1e-6, 'Actual posted target radians');
      const activity = expectedDegrees === 30 ? intent.guideSign > 0 ? 'maximum' : 'minimum' : expectedDegrees === -30 ? intent.guideSign > 0 ? 'minimum' : 'maximum' : 'interior';
      await callbacks.ready(event, label, { projected: true, angle: expectedDegrees, activity });
      const v = event.response.value, witness = v.projection;
      check(v.status === 'ready' && v.hasToken && witness?.temporaryAnchor === false && witness.evidence.localOnly === true && !v.motion && !v.movement, 'Native local projection capability, not strict motion');
      physical(v.scene, v.document, expectedDegrees, label + '/resolved');
      vector(requested.translation, old.translation, 1e-6, 'Posted pointer rotation retains source origin'); vector(moving(v.document).pose.translation, old.translation, 1e-6, 'Resolved secondary position retained');
      near(witness.positionResidual, 0, 1e-6, 'Secondary position deviation'); near(witness.angleResidual, Math.abs(radians(requestedDegrees - expectedDegrees)), 1e-6, 'Pointer deviation from independently clamped posted intent');
      check(v.hinges?.length === 1 && v.hinges[0].stops?.activity === activity, 'Actual native stop activity matches the signed input-derived endpoint');
      angleNear(v.hinges[0].stops.angleRadians, circular(intent.guideSign * radians(expectedDegrees)), 1e-8, 'Fresh native report phase follows the actual input-derived target');
      check(canonical(v.document.mates) === canonical(base.document.mates) && canonical(v.document.definitions) === canonical(base.document.definitions), 'Pointer preserves full six-role source intent');
      check(await page(() => localStorage.getItem('solidflow.autosave')) === recoveryBefore, 'Pointer preview preserves exact committed recovery');
      await waitFor('released hinge projection summary', () => page((apply, summary) => document.querySelector(apply)?.disabled === false && !!document.querySelector(summary)
        && document.querySelector('[aria-label="Proyección del arrastre"]')?.textContent.includes('Revisa el destino resuelto antes de Aplicar'), APPLY, SUMMARY));
      const text = await page(() => document.querySelector('[aria-label="Desviación del puntero"]')?.textContent), positionText = /Posición:\s*([+\-.\deE]+)\s*mm/.exec(text ?? ''), angleText = /Giro:\s*([+\-.\deE]+)\s*rad/.exec(text ?? '');
      check(!!positionText && !!angleText, 'Actual pointer feedback mm/rad'); near(Number(positionText[1]), witness.positionResidual, 1e-6, 'Displayed position deviation'); near(Number(angleText[1]), witness.angleResidual, 1e-9, 'Displayed angular deviation');
      const gesture = { label, targetDegrees, requestedDegrees, expectedDegrees, activity, axis: 'Z', down, hoverInputs, moves, calibration, actualStop: v.hinges[0].stops, pointerResidual: witness.angleResidual };
      evidence.gestures.push(gesture); evidence.phases.push({ label, serial: event.serial, action: event.action }); delete evidence.pendingCalibration; delete evidence.pendingEvent;
      return { event, expectedDegrees, gesture };
    } finally {
      const observed = await page(() => window.__solidflowHingeStopInput?.stop() ?? null);
      if (calibration && observed) calibration.inputEvents = observed.events;
      if (evidence.pendingCalibration && observed) evidence.pendingCalibration.inputEvents = observed.events;
    }
  }
  let base = context.base;
  const cancelled = await drag(base, 60, 'pointer/upper-cancel'); await callbacks.cancel(base, 'Upper pointer Cancel');
  const upper = await drag(base, 60, 'pointer/upper-retry'), before = base.document; base = await callbacks.apply(upper.event, 'Upper pointer Apply');
  physical(base.scene, base.document, upper.expectedDegrees, 'Upper committed'); const accepted = base.document;
  await callbacks.history('Deshacer', before, 'Upper pointer Undo'); base = await callbacks.history('Rehacer', accepted, 'Upper pointer Redo'); physical(base.scene, base.document, upper.expectedDegrees, 'Upper Redo');
  for (const [target, label] of [[10, 'pointer/inward-from-upper'], [-60, 'pointer/lower'], [-10, 'pointer/inward-from-lower']]) {
    const result = await drag(base, target, label); base = await callbacks.apply(result.event, label + ' Apply'); physical(base.scene, base.document, result.expectedDegrees, label + '/committed');
  }
  check(evidence.gestures.length === 5, 'Five actual local-Z pointer gestures including Cancel/retry and both inward releases');
  evidence.limits = 'Original H4 root pair and symmetric directed330/60 arc only. Trusted CDP/DOM input and actual posted local-Z targets calibrate each gesture, never resolved poses. Bounded local projection; no global-nearest, continuous motion/contact, external angular policy, human pointer or platform claim.';
  return base;
};
