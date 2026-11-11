'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original parts, real production controls and read-only native/IPC observations.
// No solver reply, saved relation or renderer document state is substituted.
module.exports = function screwWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, evaluate, observe, waitFor, click, capture, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', SOLVE = 'button[aria-label="Resolver ensamblaje"]';
  const CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]', MOVE = 'button[aria-label="Vista previa del movimiento"]';
  const phases = [], evidence = { scenario: 'original-shaft-slider-screw', phases };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, desired, tolerance, message) => check(Number.isFinite(actual) && Math.abs(actual - desired) < tolerance,
    message + '; actual=' + actual + ', expected=' + desired + ', tolerance=' + tolerance);
  const near = (actual, desired, tolerance, message) => {
    check(Array.isArray(actual) && actual.length === desired.length, message + ' dimensions');
    actual.forEach((value, i) => close(value, desired[i], tolerance, message + '[' + i + ']'));
  };
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action,
    hasToken: event.hasToken, current: event.current, proposed: event.proposed, request: event.request,
    motion: event.motion, document: event.document, response: event.response.value });
  const screw = document => {
    const mates = document.mates.filter(mate => mate.type === 'screw');
    check(mates.length === 1, 'Expected one captured screw.'); return mates[0];
  };
  function face(scene, id, kind, value) {
    const body = scene.bodies.find(body => canonical(body.component.occurrencePath) === canonical([id]));
    check(!!body, 'Original component missing: ' + id);
    const matches = body.faces.filter(face => face.support?.kind === kind && (kind === 'cylinder'
      ? Math.abs(face.support.radius - value) < 1e-10 && Math.abs(face.support.point[0]) < 1e-9 && Math.abs(face.support.point[1]) < 1e-9
      : Math.abs(face.support.point[2] - value) < 1e-9 && face.support.normal[2] > .99));
    check(matches.length === 1, 'Expected one actual native ' + kind + ' for ' + id); return matches[0];
  }
  const faceKey = face => JSON.stringify([JSON.stringify([face.selection.component.occurrencePath,
    face.selection.component.definition.id, face.selection.component.definition.revision]),
    face.selection.body ? [face.selection.body.bodyId, face.selection.body.sourceFeatureId] : null,
    face.selection.face.sourceFeatureId, face.selection.face.key]);
  const reference = face => ({ kind: 'face', ...face.selection, support: face.support.kind === 'plane' ? 'plane' : 'axis' });
  function geometry(scene, document) {
    check(scene?.solidCount === 3 && scene.prototypeCount === 3 && scene.bodies.length === 3 && !scene.warnings.length,
      'Original mechanism lost independent bodies or prototypes.');
    close(scene.volume, 5400 + 357 * Math.PI / 8, 1e-5, 'Independent mechanism volume');
    close(scene.area, 3400 + 1331 * Math.PI / 8, 1e-5, 'Independent mechanism area');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Mechanical solve rewrote a source part.');
    const values = { ground: [4800 - 36 * Math.PI, 2960 + 6 * Math.PI],
      shaft: [945 * Math.PI / 8, 1143 * Math.PI / 8], nut: [600 - 75 * Math.PI / 2, 440 + 35 * Math.PI / 2] };
    for (const body of scene.bodies) {
      const id = body.component.occurrencePath[0], original = expected.occurrences.find(value => value.id === id);
      check(original && canonical(body.component.definition) === canonical(original.definition) && body.solidCount === 1,
        'Native body lost exact source revision.');
      close(body.volume, values[id][0], 1e-5, id + ' independent volume');
      close(body.area, values[id][1], 1e-5, id + ' independent area');
      check(canonical(body.worldPose) === canonical(document.occurrences.find(value => value.id === id).pose), 'Scene/saved placement mismatch.');
    }
    near(document.occurrences[0].pose.translation, [0, 0, 0], 1e-12, 'Fixed ground origin');
    near(document.occurrences[0].pose.rotation, [0, 0, 0, 1], 1e-12, 'Fixed ground attitude');
  }
  function mechanical(scene, document) {
    geometry(scene, document);
    const mate = screw(document), shaft = document.occurrences.find(value => value.id === 'shaft'), nut = document.occurrences.find(value => value.id === 'nut');
    near(shaft.pose.translation, [0, 0, -8], 1e-6, 'Axially stopped shaft');
    near(nut.pose.translation.slice(0, 2), [0, 0], 1e-6, 'Guided slider lateral position');
    // q and -q are physically identical; the rotation-locked slider must stay still.
    close(Math.hypot(...nut.pose.rotation.slice(0, 3)), 0, 1e-8, 'Slider remains nonrotating');
    for (const [id, radius] of [['shaft', 2], ['nut', 2.5], ['ground', 3]]) {
      const support = face(scene, id, 'cylinder', radius).worldSupport;
      check(support?.kind === 'cylinder', 'Actual native cylinder unavailable.');
      near(support.axis, [0, 0, -1], 1e-8, id + ' native directed axis');
      near(support.point.slice(0, 2), [0, 0], 1e-6, id + ' native coaxiality');
    }
    const z = -(nut.pose.translation[2] - shaft.pose.translation[2]);
    if (!mate.suppressed) close(z - mate.neutralTravel, (mate.reverse ? -1 : 1) * mate.lead * mate.angle / (2 * Math.PI), 1e-6,
      'Independent directed axial/helical equation');
    const body = scene.bodies.find(value => value.component.occurrencePath[0] === 'shaft');
    const marker = body.faces.filter(value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - .25) < 1e-10);
    check(marker.length === 1 && marker[0].worldSupport?.kind === 'cylinder', 'Actual eccentric shaft marker unavailable.');
    near(marker[0].worldSupport.point.slice(0, 2), [Math.cos(-mate.angle), Math.sin(-mate.angle)], 1e-6,
      'Independent eccentric marker agrees with saved lifted angle modulo a turn');
    near(scene.bounds.min, [-20, -15, Math.min(-8, nut.pose.translation[2])], 1e-5, 'Mechanism minimum');
    near(scene.bounds.max, [20, 15, Math.max(22, nut.pose.translation[2] + 6)], 1e-5, 'Mechanism maximum');
    return mate;
  }
  async function button(text, parent = '.assembly-app') { await assemblyNavigation.button(text, parent);
    await page((text, parent) => {
      const buttons = [...document.querySelectorAll(parent + ' button')].filter(value => value.textContent.trim() === text);
      if (buttons.length !== 1 || buttons[0].disabled) throw Error('Expected one enabled control: ' + text); buttons[0].click();
    }, text, parent);
  }
  async function control(selector, value) { await assemblyNavigation.reveal(selector);
    await page((selector, value) => {
      const input = document.querySelector(selector);
      if (!input || input.disabled) throw Error('Expected editable control: ' + selector);
      const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (input instanceof HTMLSelectElement && ![...input.options].some(option => option.value === value)) throw Error('Actual scene option missing.');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('control records ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  const idle = name => waitFor(name, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  async function responseAfter(serial, action) {
    return waitFor('actual worker ' + action, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Actual worker error.');
      const event = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response).at(-1);
      if (!event) return false; check(event.response.ok, event.response.error || 'Actual RPC rejected.'); return event;
    });
  }
  function ready(event, count, dof) {
    const value = event.response.value;
    check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count, 'Expected authenticated screw mechanism preview.');
    check(value.scopes.length === 1 && value.scopes[0].result.localDOF === dof, 'Unexpected mechanism DOF.');
    check(value.checks.length === value.document.mates.filter(value => !value.suppressed).length
      && value.checks.every(value => value.satisfied && value.lengthResidual <= value.lengthTolerance && value.angleResidual <= value.angleTolerance),
      'Fresh native relation checks missing or failed.');
    geometry(value.scene, value.document); return value;
  }
  async function recovery(document, name) {
    await waitFor(name + ' idle committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
      && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  async function apply(event, name) {
    await idle(name + ' preview idle');
    await waitFor(name + ' Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly');
    check(applied.response.value.kind === 'assembly-applied' && applied.hasToken, 'Apply lost one-use authority.');
    const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = applied.response.value.document;
    check(canonical(a) === canonical(b), 'Apply rewrote the authenticated candidate.');
    await recovery(applied.response.value.document, name); record(name + '/apply', applied); return applied.response.value;
  }
  async function add(name, type, first, second, count, dof, distance) {
    for (const [index, selected] of [first, second].entries()) {
      (await assemblyNavigation.panel('relations'), await page(index => {
        const buttons = [...document.querySelectorAll('.assembly-endpoints button')].filter(value => value.querySelector('strong')?.textContent.trim() === 'Referencia ' + (Number(index) + 1));
        if (buttons.length !== 1 || buttons[0].disabled) throw Error('Reference slot unavailable.'); buttons[0].click();
      }, String(index)));
      await control('select[aria-label="Cara de referencia"]', faceKey(selected)); await button('Usar cara en referencia ' + (index + 1));
    }
    await control('input[aria-label="Nombre de la relación"]', name);
    await control('select[aria-label="Tipo de relación"]', type);
    await control('select[aria-label="Orientación de la relación"]', 'aligned');
    if (distance !== undefined) {
      await waitFor('distance input mounted', () => page(() => document.querySelector('input[aria-label="Distancia firmada"]')?.disabled === false));
      await control('input[aria-label="Distancia firmada"]', String(distance));
    }
    const before = await observe(); await button('Vista previa de la nueva relación');
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, count, dof), mate = result.document.mates.at(-1);
    check(mate.type === type && mate.name === name && canonical(mate.first) === canonical(reference(first))
      && canonical(mate.second) === canonical(reference(second)), 'Selected exact native references changed.');
    record(name + '/preview', event); return apply(event, name);
  }
  async function solve(base, dof) {
    const before = await observe(); await click(SOLVE); const event = await responseAfter(before.serial, 'preview-assembly');
    ready(event, base.document.mates.length, dof); await idle('fresh mechanism solve idle'); return event;
  }
  async function select(id) {
    const name = expected.occurrences.find(value => value.id === id).name;
    (await assemblyNavigation.panel('components'), await page(name => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact original component row unavailable.'); rows[0].click();
    }, name));
    await waitFor('selected ' + name, () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, name));
  }
  async function move(base, id, degrees, finalZ, name) {
    await select(id); const pose = base.document.occurrences.find(value => value.id === id).pose;
    for (const [index, axis] of ['X', 'Y', 'Z'].entries()) await control('input[aria-label="Destino local ' + axis + ' del componente"]', String(index === 2 ? finalZ : pose.translation[index]));
    await control('select[aria-label="Eje local del movimiento"]', '2');
    await control('input[aria-label="Giro local del movimiento en grados"]', String(degrees));
    const stored = await page(() => localStorage.getItem('solidflow.autosave')), before = await observe();
    await click(MOVE); const event = await responseAfter(before.serial, 'move-assembly-component-motion');
    const result = ready(event, 4, screw(base.document).suppressed ? 1 : 0);
    mechanical(result.scene, result.document);
    check(result.motion?.sampledOnly && result.motion.verifiedStations === result.motion.stationCount
      && result.motion.windingResidual <= result.motion.windingTolerance, 'Explicit winding witness missing.');
    close(result.motion.requestedAngle, degrees * Math.PI / 180, 1e-12, 'Signed winding request');
    if (degrees === 720) {
      check(result.motion.stationCount === 12 && result.motion.verifiedStations === 12, 'Expected twelve actually verified angular stations.');
      close(result.motion.evaluatedAngle, 4 * Math.PI, 1e-8, 'Actual two-turn driver winding');
    }
    await idle(name + ' preview idle');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === stored, 'Preview altered committed recovery.');
    record(name, event); return event;
  }
  return async function workflow() {
    const originalBytes = await fsp.readFile(input); evidence.fixtureSha256 = digest(originalBytes);
    check(expected.id === 'assembly-screw-original' && expected.mates.length === 0, 'Expected original unmated fixture.');
    await waitFor('initial production part readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function' && typeof window.require === 'undefined' && typeof window.process === 'undefined'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('isolated initial document replacement', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(expected), 'Original fixture changed on open.');
    let committed = { document: event.document, scene: event.response.value }; geometry(committed.scene, committed.document);
    await idle('opened mechanism idle'); record('open/original', event);
    committed = await add('Cojinete del eje', 'concentric', face(committed.scene, 'shaft', 'cylinder', 2), face(committed.scene, 'ground', 'cylinder', 3), 1, 8);
    committed = await add('Tope del eje', 'distance', face(committed.scene, 'shaft', 'plane', 30), face(committed.scene, 'ground', 'plane', 4), 2, 7, 18);
    committed = await add('Guía de la corredera', 'concentric', face(committed.scene, 'nut', 'cylinder', 2.5), face(committed.scene, 'ground', 'cylinder', 3), 3, 3);
    await solve(committed, 3); before = await observe(); await click('button[aria-label="Bloquear giro Guía de la corredera"]');
    event = await responseAfter(before.serial, 'lock-assembly-rotation'); ready(event, 3, 2); record('guide/spinlock', event);
    committed = await apply(event, 'guide/spinlock');
    await solve(committed, 2);
    await control('select[aria-label="Tipo de relación"]', 'screw');
    await waitFor('native screw capture selectors', () => page(() => document.querySelector('select[aria-label="Eje 1 del tornillo"]')?.disabled === false));
    await control('select[aria-label="Eje 1 del tornillo"]', faceKey(face(committed.scene, 'shaft', 'cylinder', 2)));
    await control('select[aria-label="Eje 2 del tornillo"]', faceKey(face(committed.scene, 'nut', 'cylinder', 2.5)));
    await control('input[aria-label="Nombre del tornillo"]', 'Tornillo original');
    await control('input[aria-label="Avance del tornillo"]', '2');
    await control('select[aria-label="Unidad del avance del tornillo"]', 'turns-per-mm');
    close(Number(await page(() => document.querySelector('input[aria-label="Avance del tornillo"]').value)), .5, 1e-12, 'Reciprocal mode preserves 2 mm/turn');
    before = await observe(); await button('Capturar tornillo'); event = await responseAfter(before.serial, 'capture-assembly-screw');
    let result = ready(event, 4, 1), captured = mechanical(result.scene, result.document);
    close(captured.lead, 2, 1e-12, 'Canonical advance from reciprocal UI'); close(captured.angle, 0, 1e-12, 'Captured zero winding');
    close(captured.neutralTravel, -18, 1e-6, 'Captured component-origin axial zero');
    check(captured.alignment === 'aligned' && captured.reverse === false && result.document.mates.filter(value => value.type === 'concentric').length === 2,
      'Screw capture added an extra user concentric mate or changed direction.');
    record('screw/capture', event); committed = await apply(event, 'screw/capture'); const neutral = committed;
    event = await move(committed, 'shaft', 720, -8, 'screw/720-cancel');
    close(screw(event.response.value.document).angle, -4 * Math.PI, 1e-8, 'Two lifted turns retained');
    close(event.response.value.document.occurrences.find(value => value.id === 'nut').pose.translation[2], 14, 1e-6, 'Rotation drives 4 mm translation');
    before = await observe(); await click(CANCEL); await responseAfter(before.serial, 'discard-assembly'); await recovery(committed.document, 'cancel720');
    close(Number(await page(() => document.querySelector('input[aria-label="Giro local del movimiento en grados"]').value)), 720, 1e-12, 'Cancel retains typed winding');
    event = await move(committed, 'shaft', 720, -8, 'screw/720-repeat'); committed = await apply(event, 'screw/720'); const twoTurns = committed;
    close(Number(await page(() => document.querySelector('input[aria-label="Giro local del movimiento en grados"]').value)), 0, 1e-12, 'Apply resets incremental winding');
    await click('button[aria-label="Deshacer ensamblaje"]'); await recovery(neutral.document, 'one Undo restores screw and poses');
    await click('button[aria-label="Rehacer ensamblaje"]'); await recovery(twoTurns.document, 'one Redo restores turns and poses');
    event = await move(committed, 'nut', 0, 15, 'screw/translation-drives-rotation');
    close(screw(event.response.value.document).angle, -5 * Math.PI, 1e-5, 'Translation drives another half turn within the length-derived angular bound');
    committed = await apply(event, 'screw/translation');
    await select('shaft'); await control('input[aria-label="Destino local X del componente"]', '1');
    await control('input[aria-label="Giro local del movimiento en grados"]', '0');
    before = await observe(); await click(MOVE); event = await responseAfter(before.serial, 'move-assembly-component-motion');
    check(event.response.value.status === 'rejected', 'Incompatible lateral shaft target was accepted.');
    await recovery(committed.document, 'rejected lateral target'); record('screw/rejected-lateral', event);
    check(await page(selector => document.querySelector(selector)?.disabled, APPLY), 'Rejected target enables Apply.');
    await click('button[aria-label="Editar tornillo Tornillo original"]');
    await waitFor('editing canonical advance in mm per turn', () => page(() => document.querySelector('select[aria-label="Unidad del avance del tornillo"]')?.value === 'mm-per-turn'
      && document.querySelector('input[aria-label="Avance del tornillo"]')?.disabled === false
      && Number(document.querySelector('input[aria-label="Avance del tornillo"]').value) === 2));
    await control('input[aria-label="Avance del tornillo"]', '4');
    (await assemblyNavigation.panel('relations'), await page(() => document.querySelector('input[aria-label="Invertir avance del tornillo"]').click()));
    before = await observe(); await button('Vista previa del tornillo'); event = await responseAfter(before.serial, 'preview-assembly');
    result = ready(event, 4, 1); captured = mechanical(result.scene, result.document);
    check(captured.lead === 4 && captured.reverse && canonical(captured.neutralRotation) === canonical(screw(committed.document).neutralRotation)
      && captured.neutralTravel === screw(committed.document).neutralTravel && captured.id === screw(committed.document).id,
      'Parameter edit reset the captured identity or coordinate zero.');
    record('screw/edit-reverse-lead', event); committed = await apply(event, 'screw/edit');
    before = await observe(); (await assemblyNavigation.panel('relations'), await page(() => document.querySelector('input[aria-label="Activar Tornillo original"]').click()));
    event = await responseAfter(before.serial, 'preview-assembly'); result = ready(event, 4, 2); check(screw(result.document).suppressed, 'Suppression lost declaration.');
    record('screw/suppress', event); committed = await apply(event, 'screw/suppress');
    const z = committed.document.occurrences.find(value => value.id === 'nut').pose.translation[2];
    event = await move(committed, 'nut', 0, z + 1, 'screw/passive-translation'); committed = await apply(event, 'screw/passive');
    before = await observe(); (await assemblyNavigation.panel('relations'), await page(() => document.querySelector('input[aria-label="Activar Tornillo original"]').click()));
    event = await responseAfter(before.serial, 'preview-assembly'); result = ready(event, 4, 1); mechanical(result.scene, result.document);
    record('screw/reactivate', event); committed = await apply(event, 'screw/reactivate');
    before = await observe(); await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)');
    await waitFor('native saved screw bytes', async () => { try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch { return false; } });
    await idle('saved mechanism idle'); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(committed.document), 'Save/reopen changed the lifted screw or poses.');
    mechanical(event.response.value, event.document); record('screw/reopen', event); await idle('reopened mechanism idle');
    const reopened = { document: event.document, scene: event.response.value }; event = await solve(reopened, 1); result = ready(event, 4, 1);
    close(screw(result.document).angle, screw(committed.document).angle, 1e-8, 'Fresh reopened solve keeps branch');
    mechanical(result.scene, result.document); record('screw/reopened-fresh-solve', event);
    before = await observe(); await click(CANCEL); await responseAfter(before.serial, 'discard-assembly'); await recovery(committed.document, 'final clean committed mechanism');
    await capture(committed.document);
    const state = await observe();
    check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request failure.');
    check(state.assemblyUi.some(value => value.busy && value.applyDisabled) && state.assemblyUi.filter(value => value.busy).every(value => value.applyDisabled), 'Apply available during pending native work.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200)
      && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Actual production worker/WASM loads missing.');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().csvExports === 0 && ipc.every(value => value.completed), 'Unexpected native dialog/IPC count.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Original fixture file changed.');
    Object.assign(evidence, { savedSha256: digest(await fsp.readFile(output)), finalDocument: committed.document,
      independentOracles: 'V5400+357pi/8, A3400+1331pi/8 tolerance1e-5; directed native axes1e-8; coaxiality/travel1e-6; bounds1e-5; eccentric marker1e-6; driver lifted angle1e-8; translation-driven half-turn1e-5rad derived from mm coupling tolerance and lead2. Rotor+720Z drives nut+4mm; nut+1mm drives rotor+180Z.',
      limits: 'Scripted DOM controls, actual native scene DTOs and relation checks, real isolated preload/IPC. No physical threads, continuous collision, human dialogs, installed package or general platform claim.' });
  };
};
