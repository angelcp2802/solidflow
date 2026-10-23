'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original parts, real renderer input, fresh native replies and restricted file IPC.
module.exports = function rackPinionWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', SOLVE = 'button[aria-label="Resolver ensamblaje"]';
  const CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]', MOVE = 'button[aria-label="Vista previa del movimiento"]';
  const VALUE = 'input[aria-label="Valor de conversión del piñón"]';
  const phases = [], gestures = [], evidence = { scenario: 'original-rack-pinion', phases, gestures };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, desired, tolerance, message) => check(Number.isFinite(actual) && Math.abs(actual - desired) < tolerance,
    message + '; actual=' + actual + ', expected=' + desired + ', tolerance=' + tolerance);
  const near = (actual, desired, tolerance, message) => {
    check(Array.isArray(actual) && actual.length === desired.length, message + ' dimensions');
    actual.forEach((value, i) => close(value, desired[i], tolerance, message + '[' + i + ']'));
  };
  const rotationAngle = (actual, saved, label) => {
    const unit = rotation => {
      check(Array.isArray(rotation) && rotation.length === 4 && rotation.every(Number.isFinite), label + ' invalid quaternion');
      const norm = Math.hypot(...rotation); close(norm, 1, 1e-10, label + ' quaternion norm');
      return rotation.map(value => value / norm);
    };
    const a = unit(actual), b = unit(saved);
    // Stable physical angle near zero, including equivalent q and -q.
    const chord = Math.min(Math.hypot(...a.map((value, axis) => value - b[axis])), Math.hypot(...a.map((value, axis) => value + b[axis])));
    return 4 * Math.asin(Math.min(1, chord / 2));
  };
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action,
    hasToken: event.hasToken, current: event.current, proposed: event.proposed, request: event.request,
    motion: event.motion, document: event.document, response: event.response.value });
  const mateOf = document => {
    const values = document.mates.filter(mate => mate.type === 'rack-pinion');
    check(values.length === 1, 'Expected one captured rack and pinion.'); return values[0];
  };
  const bodyOf = (scene, id) => {
    const body = scene.bodies.find(body => canonical(body.component.occurrencePath) === canonical([id]));
    check(!!body, 'Original component missing: ' + id); return body;
  };
  function face(scene, id, kind, value) {
    const matches = bodyOf(scene, id).faces.filter(face => face.support?.kind === kind && (kind === 'cylinder'
      ? Math.abs(face.support.radius - value) < 1e-10 && Math.abs(face.support.point[0]) < 1e-9 && Math.abs(face.support.point[1]) < 1e-9
      : Math.abs(face.support.point[2] - value) < 1e-9 && face.support.normal[2] > .99));
    check(matches.length === 1, 'Expected one actual native ' + kind + ' for ' + id); return matches[0];
  }
  const selectionKey = (selection, item) => JSON.stringify([JSON.stringify([selection.component.occurrencePath,
    selection.component.definition.id, selection.component.definition.revision]),
    selection.body ? [selection.body.bodyId, selection.body.sourceFeatureId] : null, item.sourceFeatureId, item.key]);
  const faceKey = face => selectionKey(face.selection, face.selection.face);
  const edgeKey = edge => selectionKey(edge.selection, edge.selection.edge);
  const faceReference = face => ({ kind: 'face', ...face.selection, support: face.support.kind === 'plane' ? 'plane' : 'axis' });
  const edgeReference = edge => ({ kind: 'edge', ...edge.selection, support: 'line' });
  function geometry(scene, document) {
    check(scene?.solidCount === 4 && scene.prototypeCount === 4 && scene.bodies.length === 4 && !scene.warnings.length,
      'Original mechanism lost independent bodies or prototypes.');
    close(scene.volume, 10800 + 217 * Math.PI / 8, 1e-5, 'Independent mechanism volume');
    close(scene.area, 5560 + 6115 * Math.PI / 8, 1e-5, 'Independent mechanism area');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Mechanical solve rewrote a source part.');
    const values = { ground: [4800 - 36 * Math.PI, 2960 + 6 * Math.PI],
      pinion: [945 * Math.PI / 8, 1143 * Math.PI / 8], rack: [6000 - 375 * Math.PI, 2600 + 575 * Math.PI / 2],
      guide: [320 * Math.PI, 328 * Math.PI] };
    for (const body of scene.bodies) {
      const id = body.component.occurrencePath[0], original = expected.occurrences.find(value => value.id === id);
      check(original && canonical(body.component.definition) === canonical(original.definition) && body.solidCount === 1,
        'Native body lost exact source revision.');
      close(body.volume, values[id][0], 1e-5, id + ' independent volume');
      close(body.area, values[id][1], 1e-5, id + ' independent area');
      const declaredPose = document.occurrences.find(value => value.id === id).pose;
      near(body.worldPose.translation, declaredPose.translation, 1e-12, id + ' scene/saved translation');
      close(rotationAngle(body.worldPose.rotation, declaredPose.rotation, id + ' scene/saved'), 0, 1e-8, id + ' scene/saved angle in radians');
      check(Array.isArray(body.edges) && body.edges.length > 0, 'Individual actual native edges absent.');
    }
    for (const id of ['ground', 'guide']) {
      const actual = document.occurrences.find(value => value.id === id).pose, original = expected.occurrences.find(value => value.id === id).pose;
      near(actual.translation, original.translation, 1e-12, id + ' fixed origin'); near(actual.rotation, original.rotation, 1e-12, id + ' fixed attitude');
    }
  }
  function mechanical(scene, document) {
    geometry(scene, document);
    const mate = mateOf(document), pinion = document.occurrences.find(value => value.id === 'pinion'), rack = document.occurrences.find(value => value.id === 'rack');
    near(pinion.pose.translation, [0, 0, -8], 1e-6, 'Axially stopped pinion');
    near(rack.pose.translation.slice(1), [10, 10], 1e-6, 'Guided rack lateral position');
    close(rotationAngle(rack.pose.rotation, expected.occurrences.find(value => value.id === 'rack').pose.rotation, 'Rack guide'), 0, 1e-8, 'Rack remains nonrotating in radians');
    for (const [id, radius] of [['pinion', 2], ['ground', 3]]) {
      const support = face(scene, id, 'cylinder', radius).worldSupport;
      check(support?.kind === 'cylinder', 'Actual native pinion bearing cylinder absent.');
      near(support.axis, [0, 0, -1], 1e-8, id + ' native directed axis'); near(support.point.slice(0, 2), [0, 0], 1e-6, id + ' native axis');
    }
    for (const [id, radius] of [['rack', 2.5], ['guide', 2]]) {
      const support = face(scene, id, 'cylinder', radius).worldSupport;
      check(support?.kind === 'cylinder', 'Actual native slider guide cylinder absent.');
      near(support.axis, [-1, 0, 0], 1e-8, id + ' native guide direction'); near(support.point.slice(1), [10, 10], 1e-6, id + ' native guide axis');
    }
    const conversion = mate.conversion.override === null ? 2 : mate.conversion.mode === 'diameter' ? mate.conversion.override / 2 : mate.conversion.override / (2 * Math.PI);
    const pinionFace = bodyOf(scene, 'pinion').faces.find(value => value.support?.kind === 'cylinder'
      && canonical(faceReference(value)) === canonical(mate.first));
    check(!!pinionFace, 'Exact current pinion reference missing during equation observation.');
    const selectedRack = mate.second.kind === 'edge'
      ? bodyOf(scene, 'rack').edges.find(edge => edge.support?.kind === 'line' && canonical(edgeReference(edge)) === canonical(mate.second))
      : bodyOf(scene, 'rack').faces.find(value => value.support?.kind === 'cylinder' && canonical(faceReference(value)) === canonical(mate.second));
    check(!!selectedRack, 'Exact current rack reference missing during equation observation.');
    const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
    const nativeAxis = support => {
      check(support && (support.kind === 'line' || support.kind === 'cylinder'), 'Actual native axis absent.');
      const norm = Math.hypot(...support.axis); close(norm, 1, 1e-10, 'Native unit direction');
      return support.axis.map(value => value / norm);
    };
    const pinionAxis = nativeAxis(pinionFace.worldSupport), rackWorldAxis = nativeAxis(selectedRack.worldSupport);
    const firstDirected = selectedRack.support.axis.find(value => Math.abs(value) > 1e-12);
    check(Number.isFinite(firstDirected), 'Native rack direction cannot be canonicalized.');
    // Canonicalize in the declaring LOCAL frame, then use its actual world axis.
    const direction = rackWorldAxis.map(value => value * (firstDirected < 0 ? -1 : 1));
    const axialParameter = dot(pinionAxis, pinionFace.worldSupport.point.map((value, axis) => value - pinion.pose.translation[axis]));
    const axisPoint = pinionFace.worldSupport.point.map((value, axis) => value - pinionAxis[axis] * axialParameter);
    const travel = dot(direction, rack.pose.translation.map((value, axis) => value - axisPoint[axis]));
    const coupledTravel = (mate.reverse ? -1 : 1) * conversion * mate.angle;
    evidence.mechanicalObservation = { documentSha256: digest(canonical(document)), mate, travel, coupledTravel,
      residual: travel - mate.neutralTravel - coupledTravel,
      pinionWorldPose: bodyOf(scene, 'pinion').worldPose, rackWorldPose: bodyOf(scene, 'rack').worldPose,
      pinion: { selection: pinionFace.selection, support: pinionFace.support, worldSupport: pinionFace.worldSupport },
      rack: { selection: selectedRack.selection, support: selectedRack.support, worldSupport: selectedRack.worldSupport } };
    if (!mate.suppressed) close(travel - mate.neutralTravel, coupledTravel, 1e-6,
      'Independent rack displacement/pinion rotation equation');
    const marker = bodyOf(scene, 'pinion').faces.filter(value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - .25) < 1e-10);
    check(marker.length === 1 && marker[0].worldSupport?.kind === 'cylinder', 'Actual eccentric pinion marker absent.');
    near(marker[0].worldSupport.point.slice(0, 2), [Math.cos(-mate.angle), Math.sin(-mate.angle)], 1e-6, 'Native eccentric marker agrees with lifted angle modulo a turn');
    const end = face(scene, 'rack', 'plane', 60).worldSupport;
    check(end?.kind === 'plane', 'Actual rack end plane absent.');
    close(end.point[0], rack.pose.translation[0] + 60, 1e-6, 'Native rack end confirms physical displacement');
    near(bodyOf(scene, 'rack').bounds.min, [rack.pose.translation[0], 5, 5], 1e-5, 'Native rack bounds minimum');
    near(bodyOf(scene, 'rack').bounds.max, [rack.pose.translation[0] + 60, 15, 15], 1e-5, 'Native rack bounds maximum');
    near(scene.bounds.min, [Math.min(-40, rack.pose.translation[0]), -15, -8], 1e-5, 'Mechanism minimum');
    near(scene.bounds.max, [Math.max(40, rack.pose.translation[0] + 60), 15, 22], 1e-5, 'Mechanism maximum');
    return mate;
  }
  async function button(text, parent = '.assembly-app') {
    await page((text, parent) => { const buttons = [...document.querySelectorAll(parent + ' button')].filter(value => value.textContent.trim() === text);
      if (buttons.length !== 1 || buttons[0].disabled) throw Error('Expected one enabled control: ' + text); buttons[0].click(); }, text, parent);
  }
  async function control(selector, value) {
    await page((selector, value) => { const input = document.querySelector(selector); if (!input || input.disabled) throw Error('Expected editable control: ' + selector);
      const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (input instanceof HTMLSelectElement && ![...input.options].some(option => option.value === value)) throw Error('Actual scene option missing.');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('control records ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  const idle = name => waitFor(name, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  async function conversionReady(mode, value, nativeDefault, background) {
    await waitFor('rendered conversion ' + mode + '/' + value, () => page((mode, value, nativeDefault, background) => {
      const input = document.querySelector('input[aria-label="Valor de conversión del piñón"]');
      return input && !input.disabled && document.querySelector('select[aria-label="Definir conversión del piñón"]')?.value === mode
        && (value === '' ? input.value === '' : Math.abs(Number(input.value) - Number(value)) < 1e-12)
        && Math.abs(Number(input.placeholder) - Number(nativeDefault)) < 1e-12 && getComputedStyle(input).backgroundColor === background;
    }, mode, value, String(nativeDefault), background)).catch(async error => {
      const observed = await page(() => {
        const input = document.querySelector('input[aria-label="Valor de conversión del piñón"]');
        return input ? { mode: document.querySelector('select[aria-label="Definir conversión del piñón"]')?.value,
          value: input.value, placeholder: input.placeholder, disabled: input.disabled, background: getComputedStyle(input).backgroundColor } : null;
      });
      throw new Error(error.message + '; observed=' + JSON.stringify(observed), { cause: error });
    });
  }
  async function responseAfter(serial, action) {
    return waitFor('actual worker ' + action, async () => { const state = await observe(); check(!state.workerErrors.length, 'Actual worker error.');
      const event = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response).at(-1);
      if (!event) return false; check(event.response.ok, event.response.error || 'Actual RPC rejected.'); return event;
    });
  }
  function ready(event, count, dof) {
    const value = event.response.value;
    check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count, 'Expected authenticated mechanism preview.');
    evidence.lastReady = { serial: event.serial, action: event.action, documentSha256: digest(canonical(value.document)), checks: value.checks };
    check(value.scopes.length === 1 && value.scopes[0].result.localDOF === dof, 'Unexpected mechanism DOF.');
    check(value.checks.length === value.document.mates.filter(value => !value.suppressed).length
      && value.checks.every(value => value.satisfied && value.lengthResidual <= value.lengthTolerance && value.angleResidual <= value.angleTolerance), 'Fresh native relation checks failed.');
    geometry(value.scene, value.document); return value;
  }
  async function recovery(document, name) {
    await waitFor(name + ' idle committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
      && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  async function apply(event, name) {
    await idle(name + ' preview idle'); await waitFor(name + ' Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly');
    check(applied.response.value.kind === 'assembly-applied' && applied.hasToken, 'Apply lost one-use authority.');
    const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = applied.response.value.document;
    check(canonical(a) === canonical(b), 'Apply rewrote the authenticated candidate.');
    await recovery(applied.response.value.document, name); record(name + '/apply', applied); return applied.response.value;
  }
  async function add(name, type, first, second, count, dof, distance) {
    for (const [index, selected] of [first, second].entries()) {
      await page(index => { const buttons = [...document.querySelectorAll('.assembly-endpoints button')].filter(value => value.querySelector('strong')?.textContent.trim() === 'Referencia ' + (Number(index) + 1));
        if (buttons.length !== 1 || buttons[0].disabled) throw Error('Reference slot unavailable.'); buttons[0].click(); }, String(index));
      await control('select[aria-label="Cara de referencia"]', faceKey(selected)); await button('Usar cara en referencia ' + (index + 1));
    }
    await control('input[aria-label="Nombre de la relación"]', name); await control('select[aria-label="Tipo de relación"]', type);
    await control('select[aria-label="Orientación de la relación"]', 'aligned');
    if (distance !== undefined) { await waitFor('distance input mounted', () => page(() => document.querySelector('input[aria-label="Distancia firmada"]')?.disabled === false)); await control('input[aria-label="Distancia firmada"]', String(distance)); }
    const before = await observe(); await button('Vista previa de la nueva relación');
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, count, dof), mate = result.document.mates.at(-1);
    check(mate.type === type && mate.name === name && canonical(mate.first) === canonical(faceReference(first)) && canonical(mate.second) === canonical(faceReference(second)), 'Exact native relation references changed.');
    record(name + '/preview', event); return apply(event, name);
  }
  async function solve(base, dof) {
    const before = await observe(); await click(SOLVE); const event = await responseAfter(before.serial, 'preview-assembly');
    ready(event, base.document.mates.length, dof); await idle('fresh mechanism solve idle'); return event;
  }
  async function select(id) {
    const name = expected.occurrences.find(value => value.id === id).name;
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact original component row unavailable.'); rows[0].click(); }, name);
    await waitFor('selected ' + name, () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, name));
  }
  async function move(base, id, degrees, finalX, name) {
    await select(id); const pose = base.document.occurrences.find(value => value.id === id).pose;
    for (const [index, axis] of ['X', 'Y', 'Z'].entries()) await control('input[aria-label="Destino local ' + axis + ' del componente"]', String(index === 0 ? finalX : pose.translation[index]));
    await control('select[aria-label="Eje local del movimiento"]', '2'); await control('input[aria-label="Giro local del movimiento en grados"]', String(degrees));
    const stored = await page(() => localStorage.getItem('solidflow.autosave')), before = await observe(); await click(MOVE);
    const event = await responseAfter(before.serial, 'move-assembly-component-motion'), result = ready(event, 4, mateOf(base.document).suppressed ? 1 : 0);
    mechanical(result.scene, result.document);
    check(result.motion?.sampledOnly && result.motion.verifiedStations === result.motion.stationCount && result.motion.windingResidual <= result.motion.windingTolerance, 'Explicit winding witness absent.');
    close(result.motion.requestedAngle, degrees * Math.PI / 180, 1e-12, 'Signed winding request');
    if (degrees === 720) { check(result.motion.stationCount === 12 && result.motion.verifiedStations === 12, 'Expected twelve verified angular stations.'); close(result.motion.evaluatedAngle, 4 * Math.PI, 1e-8, 'Actual two-turn driver winding'); }
    await idle(name + ' preview idle'); check(await page(() => localStorage.getItem('solidflow.autosave')) === stored, 'Preview altered committed recovery.'); record(name, event); return event;
  }
  async function pickRackEdge(scene) {
    const edges = bodyOf(scene, 'rack').edges.filter(edge => edge.support?.kind === 'line' && Math.abs(edge.support.axis[2]) > .99
      && edge.lines.length >= 6 && edge.lines.every((value, index) => index % 3 === 0 || Math.abs(value - 15) < 1e-6));
    check(edges.length === 1, 'Expected one actual longitudinal top rack edge.'); const edge = edges[0];
    await button('Superior', '.assembly-view-tools'); await click('button[aria-label="Seleccionar arista lineal"]');
    await waitFor('native edge pick intent bound to current preview', () => page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === 'edge'));
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const bounds = scene.visibleBounds, center = bounds.min.map((value, i) => (value + bounds.max[i]) / 2), span = Math.hypot(...bounds.max.map((value, i) => value - bounds.min[i])), pixels = rect.height / (1.3 * span);
    const point = { x: rect.x + rect.width / 2 + (20 - center[0]) * pixels, y: rect.y + rect.height / 2 - (15 - center[1]) * pixels };
    const before = await observe(); await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point);
    await waitFor('actual native edge pointer selection', () => page(key => document.querySelector('select[aria-label="Referencia lineal de la cremallera"]')?.value === key, edgeKey(edge)));
    check(await page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === ''), 'Successful edge pick did not end its selection intent.');
    check((await observe()).serial === before.serial, 'Reference selection modified or solved the candidate.'); gestures.push({ type: 'native-rack-edge', point, selection: edge.selection }); return edge;
  }
  return async function workflow() {
    const originalBytes = await fsp.readFile(input); evidence.fixtureSha256 = digest(originalBytes);
    check(expected.id === 'assembly-rack-pinion-original' && expected.mates.length === 0, 'Expected original unmated fixture.');
    await waitFor('initial production part readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function' && typeof window.require === 'undefined' && typeof window.process === 'undefined'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('isolated document replacement', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Original fixture changed on open.');
    let committed = { document: event.document, scene: event.response.value }; geometry(committed.scene, committed.document); await idle('opened mechanism idle'); record('open/original', event);
    committed = await add('Cojinete del piñón', 'concentric', face(committed.scene, 'pinion', 'cylinder', 2), face(committed.scene, 'ground', 'cylinder', 3), 1, 8);
    committed = await add('Tope del piñón', 'distance', face(committed.scene, 'pinion', 'plane', 30), face(committed.scene, 'ground', 'plane', 4), 2, 7, 18);
    committed = await add('Guía de la cremallera', 'concentric', face(committed.scene, 'rack', 'cylinder', 2.5), face(committed.scene, 'guide', 'cylinder', 2), 3, 3);
    await solve(committed, 3); before = await observe(); await click('button[aria-label="Bloquear giro Guía de la cremallera"]');
    event = await responseAfter(before.serial, 'lock-assembly-rotation'); ready(event, 3, 2); record('guide/spinlock', event); committed = await apply(event, 'guide/spinlock');
    const capturedBase = await solve(committed, 2); await control('select[aria-label="Tipo de relación"]', 'rack-pinion');
    await waitFor('native rack capture selectors', () => page(() => document.querySelector('select[aria-label="Eje del piñón"]')?.disabled === false));
    const pinionFace = face(committed.scene, 'pinion', 'cylinder', 2); await control('select[aria-label="Eje del piñón"]', faceKey(pinionFace));
    await conversionReady('diameter', '', 4, 'rgb(255, 255, 255)');
    const edge = await pickRackEdge(capturedBase.response.value.scene);
    await control('input[aria-label="Nombre de cremallera y piñón"]', 'Cremallera original');
    check(await page(selector => { const value = document.querySelector(selector); return value.value === '' && Number(value.placeholder) === 4 && value.classList.contains('assembly-conversion-default'); }, VALUE), 'Native default is not empty/white with current diameter4.');
    await control('select[aria-label="Definir conversión del piñón"]', 'travel');
    await conversionReady('travel', '', 4 * Math.PI, 'rgb(255, 255, 255)');
    close(Number(await page(selector => document.querySelector(selector).placeholder, VALUE)), 4 * Math.PI, 1e-12, 'Default travel per turn');
    await control(VALUE, '12'); await control('select[aria-label="Definir conversión del piñón"]', 'diameter');
    // L = pi * D: twelve millimetres per turn means diameter 12/pi, not radius 6/pi.
    await conversionReady('diameter', String(12 / Math.PI), 4, 'rgb(255, 242, 168)');
    close(Number(await page(selector => document.querySelector(selector).value, VALUE)), 12 / Math.PI, 1e-12, 'Override mode conversion preserves travel12');
    await control(VALUE, ''); await conversionReady('diameter', '', 4, 'rgb(255, 255, 255)');
    check(await page(selector => document.querySelector(selector).classList.contains('assembly-conversion-default'), VALUE), 'Clearing override did not restore native default.');
    await waitFor('native capture enabled with exact selected references', () => page(() => document.querySelector('button[aria-label="Capturar cremallera y piñón"]')?.disabled === false));
    before = await observe(); await click('button[aria-label="Capturar cremallera y piñón"]'); event = await responseAfter(before.serial, 'capture-assembly-rack-pinion');
    let result = ready(event, 4, 1), mate = mechanical(result.scene, result.document);
    check(canonical(event.request.first) === canonical(faceReference(pinionFace)) && canonical(event.request.second) === canonical(edgeReference(edge))
      && canonical(mate.first) === canonical(event.request.first) && canonical(mate.second) === canonical(event.request.second), 'Pointer-selected exact native reference changed before capture.');
    check(mate.conversion.mode === 'diameter' && mate.conversion.override === null && mate.reverse === false, 'Capture substituted cached or explicit conversion.');
    close(mate.angle, 0, 1e-12, 'Fresh captured winding'); close(mate.neutralTravel, -10, 1e-6, 'Fresh native axis-relative travel zero');
    check(canonical(result.document.occurrences) === canonical(committed.document.occurrences), 'Capture introduced an unrequested alignment.');
    record('rack/capture', event); committed = await apply(event, 'rack/capture'); const neutral = committed;
    event = await move(committed, 'pinion', 720, 0, 'rack/720-cancel'); close(mateOf(event.response.value.document).angle, -4 * Math.PI, 1e-8, 'Two lifted pinion turns');
    close(event.response.value.document.occurrences.find(value => value.id === 'rack').pose.translation[0], -10 - 8 * Math.PI, 1e-6, 'Two turns drive rack minus8pi mm');
    before = await observe(); await click(CANCEL); await responseAfter(before.serial, 'discard-assembly'); await recovery(committed.document, 'cancel720');
    close(Number(await page(() => document.querySelector('input[aria-label="Giro local del movimiento en grados"]').value)), 720, 1e-12, 'Cancel retains typed winding');
    event = await move(committed, 'pinion', 720, 0, 'rack/720-repeat'); committed = await apply(event, 'rack/720'); const twoTurns = committed;
    close(Number(await page(() => document.querySelector('input[aria-label="Giro local del movimiento en grados"]').value)), 0, 1e-12, 'Apply resets incremental winding');
    await click('button[aria-label="Deshacer ensamblaje"]'); await recovery(neutral.document, 'one Undo restores relation and poses');
    await click('button[aria-label="Rehacer ensamblaje"]'); await recovery(twoTurns.document, 'one Redo restores winding and poses');
    event = await move(committed, 'rack', 0, committed.document.occurrences.find(value => value.id === 'rack').pose.translation[0] + 2 * Math.PI, 'rack/translation-drives-rotation');
    close(mateOf(event.response.value.document).angle, -3 * Math.PI, 1e-5, 'Rack plus2pi drives pinion half turn within length-derived angular tolerance'); committed = await apply(event, 'rack/translation');
    await select('pinion'); await control('input[aria-label="Destino local X del componente"]', '1'); await control('input[aria-label="Giro local del movimiento en grados"]', '0');
    before = await observe(); await click(MOVE); event = await responseAfter(before.serial, 'move-assembly-component-motion'); check(event.response.value.status === 'rejected', 'Incompatible lateral pinion target accepted.');
    await recovery(committed.document, 'rejected lateral target'); record('rack/rejected-lateral', event); check(await page(selector => document.querySelector(selector)?.disabled, APPLY), 'Rejected target enables Apply.');
    await click('button[aria-label="Editar cremallera y piñón Cremallera original"]');
    await waitFor('editing retained native default', () => page(selector => document.querySelector(selector)?.disabled === false && document.querySelector(selector).value === '', VALUE));
    await conversionReady('diameter', '', 4, 'rgb(255, 255, 255)');
    await control('select[aria-label="Definir conversión del piñón"]', 'travel'); await control(VALUE, '12'); await click('input[aria-label="Invertir avance de la cremallera"]');
    await conversionReady('travel', '12', 4 * Math.PI, 'rgb(255, 242, 168)');
    check(await page(selector => document.querySelector(selector).classList.contains('assembly-conversion-override'), VALUE), 'Explicit conversion not distinguished.');
    before = await observe(); await click('button[aria-label="Vista previa de cremallera y piñón"]'); event = await responseAfter(before.serial, 'preview-assembly'); result = ready(event, 4, 1);
    evidence.editChecks = result.checks; mate = mechanical(result.scene, result.document);
    check(mate.conversion.mode === 'travel' && mate.conversion.override === 12 && mate.reverse && mate.id === mateOf(committed.document).id
      && canonical(mate.neutralRotation) === canonical(mateOf(committed.document).neutralRotation) && mate.neutralTravel === mateOf(committed.document).neutralTravel, 'Parameter edit reset captured identity/zeros.');
    record('rack/edit-conversion-reverse', event); committed = await apply(event, 'rack/edit');
    before = await observe(); await click('input[aria-label="Activar Cremallera original"]'); event = await responseAfter(before.serial, 'preview-assembly'); result = ready(event, 4, 2); check(mateOf(result.document).suppressed, 'Suppression lost declaration.');
    record('rack/suppress', event); committed = await apply(event, 'rack/suppress');
    event = await move(committed, 'rack', 0, committed.document.occurrences.find(value => value.id === 'rack').pose.translation[0] + 1, 'rack/passive-translation'); committed = await apply(event, 'rack/passive');
    before = await observe(); await click('input[aria-label="Activar Cremallera original"]'); event = await responseAfter(before.serial, 'preview-assembly'); result = ready(event, 4, 1); mechanical(result.scene, result.document);
    record('rack/reactivate', event); committed = await apply(event, 'rack/reactivate');
    before = await observe(); await button('Guardar como', '.assembly-toolbar'); await waitFor('native saved rack bytes', async () => { try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed.document); } catch { return false; } });
    await idle('saved mechanism idle'); await button('Abrir', '.assembly-toolbar'); event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(committed.document), 'Save/reopen changed lifted rack relation or poses.'); mechanical(event.response.value, event.document); record('rack/reopen', event); await idle('reopened mechanism idle');
    event = await solve({ document: event.document, scene: event.response.value }, 1); result = ready(event, 4, 1); close(mateOf(result.document).angle, mateOf(committed.document).angle, 1e-8, 'Fresh reopened solve retains angular branch'); mechanical(result.scene, result.document); record('rack/reopened-fresh-solve', event);
    before = await observe(); await click(CANCEL); await responseAfter(before.serial, 'discard-assembly'); await recovery(committed.document, 'final clean committed mechanism'); await capture(committed.document);
    const state = await observe(); check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request failure.');
    check(state.assemblyUi.some(value => value.busy && value.applyDisabled) && state.assemblyUi.filter(value => value.busy).every(value => value.applyDisabled), 'Apply available during pending native work.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200) && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Actual production worker/WASM loads absent.');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().csvExports === 0 && ipc.every(value => value.completed), 'Unexpected native dialog/IPC count.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Original fixture file changed.');
    Object.assign(evidence, { savedSha256: digest(await fsp.readFile(output)), finalDocument: committed.document,
      independentOracles: 'V10800+217pi/8,A5560+6115pi/8 tolerance1e-5; actual rack end/bounds and native marker1e-6/1e-5; native axes1e-8; scalar coupling1e-6mm; pinion+720Z→theta-4pi/rack-8pi; rack+2pi→theta+pi within1e-5rad; unchanged source geometry.',
      limits: 'Actual Chromium pointer for one authenticated native rack edge; other controls are scripted DOM. Isolated production preload/worker/IPC with test-owned dialog paths; no tooth contact, swept collision, human dialogs, installed package or platform generalization.' });
  };
};
