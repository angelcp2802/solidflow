'use strict';
const fsp = require('node:fs/promises');

// Actual pointer input targets a visible manipulator in an owned hidden window.
// Hover-axis labels are observed; no Three object, React state or native reply
// is injected. Dialog selection remains the documented isolated substitution.
module.exports = async function dragWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { output, observe, waitFor, click, button, page, idle, responseAfter, pointer, capture,
    checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', ACTION = 'project-assembly-component';
  const bytes = await fsp.readFile(output), base = JSON.parse(bytes.toString('utf8'));
  const original = base.occurrences.find(value => value.id === 'right'), phases = [], gestures = [];
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action, current: event.current,
    drag: event.drag, response: event.response.value });
  async function selectRight() {
    (await assemblyNavigation.panel('components'), await page(name => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Expected the actual right component tree control.'); rows[0].click();
    }, original.name));
    await waitFor('pointer movement component selection', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, original.name));
  }
  async function origin(document) {
    const state = await observe(), events = state.assemblies.filter(value => value.response?.ok);
    const latest = events.filter(value => value.response.value?.kind === 'assembly-scene' && canonical(value.document) === canonical(document)
      || value.action === 'apply-assembly' && value.response.value?.scene && canonical(value.response.value.document) === canonical(document)).at(-1);
    check(!!latest, 'Expected the actual confirmed scene matching the manipulator source.');
    const scene = latest.response.value.kind === 'assembly-scene' ? latest.response.value : latest.response.value.scene;
    const bounds = scene.visibleBounds, position = document.occurrences.find(value => value.id === 'right').pose.translation;
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2), span = Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis]));
    const pixels = rect.height / (span * 1.3);
    return { x: rect.x + rect.width / 2 + (position[0] - center[0]) * pixels,
      y: rect.y + rect.height / 2 - (position[1] - center[1]) * pixels + (position[2] - center[2]) * .0001 * pixels, rect };
  }
  async function handle(document, mode, axis) {
    await button('Superior', '.assembly-view-tools'); await click('button[aria-label="Arrastrar ' + (mode === 'rotate' ? 'giro' : 'posición') + '"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const center = await origin(document), candidates = [];
    if (mode === 'rotate') {
      for (const scale of [1, .9, 1.1]) for (let angle = .3; angle < Math.PI * 2; angle += .2) {
        const radius = center.rect.height * .1125 * scale;
        candidates.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
      }
    } else {
      for (const sign of [1, -1]) for (const scale of [.1, .13, .16, .19]) candidates.push({ x: center.x + center.rect.height * scale * sign, y: center.y });
    }
    for (const point of candidates) {
      if (point.x < center.rect.x || point.x >= center.rect.x + center.rect.width || point.y < center.rect.y || point.y >= center.rect.y + center.rect.height) continue;
      await pointer('mouseMoved', point);
      if (await page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-drag-axis')) === axis) return { center, point };
    }
    throw Error('Actual manipulator hover did not expose the requested ' + axis + ' axis.');
  }
  async function gesture(document, mode) {
    const { center, point } = await handle(document, mode, mode === 'rotate' ? 'Z' : 'X'), before = await observe();
    await pointer('mousePressed', point, 1);
    await waitFor('pointer-down blocks Apply and Save', () => page(apply => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'true'
      && document.querySelector(apply)?.disabled === true && [...document.querySelectorAll(':is(.assembly-toolbar, .assembly-quickbar) button')].find(value => value.textContent.trim() === 'Guardar')?.disabled === true, APPLY));
    const actual = [];
    for (const fraction of [1 / 3, 2 / 3, 1]) {
      const angle = .6 * fraction, dx = point.x - center.x, dy = point.y - center.y;
      const target = mode === 'rotate' ? { x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle) }
        : { x: point.x + 16 * fraction, y: point.y };
      await pointer('mouseMoved', target, 1); actual.push(target);
    }
    await pointer('mouseReleased', actual.at(-1), 0);
    await idle('latest pointer target reaches a real native reply');
    const observation = await observe(), requests = observation.assemblies.filter(value => value.serial > before.serial && value.action === ACTION);
    check(requests.length >= 1 && requests.length <= 3 && requests.every(value => value.response?.ok && canonical(value.current) === canonical(document)), 'Pointer targets exceeded their bounded stream or used another committed base.');
    check(requests.every(value => value.drag.mode === mode && canonical(value.drag.component) === canonical({ occurrencePath: ['right'], definition: original.definition })), 'Pointer targeted a different occurrence or mode.');
    gestures.push({ mode, axis: mode === 'rotate' ? 'Z' : 'X', down: point, moves: actual, workerSerials: requests.map(value => value.serial) });
    const event = requests.at(-1); record('drag/' + mode + '/latest', event); return event;
  }
  function assertReady(event, document) {
    const result = event.response.value, target = event.drag.pose, before = document.occurrences.find(value => value.id === 'right').pose;
    check(result.status === 'ready' && result.hasToken && result.projection?.frame === 'world' && !result.movement && result.checks.every(value => value.satisfied), 'Actual pointer target failed native projection verification.');
    check(canonical(result.document.definitions) === canonical(document.definitions) && canonical(result.document.mates) === canonical(document.mates), 'Pointer gesture edited geometry or relation declarations.');
    check(canonical(result.projection.drivenComponent) === canonical(event.drag.component) && canonical(result.projection.affectedPaths) === canonical([['right']])
      && result.projection.temporaryAnchor === false && result.scopes.every(value => !value.temporaryAnchor), 'Projected pointer target changed the wrong rigid owner or fixed its natural freedom.');
    const pose = result.document.occurrences.find(value => value.id === 'right').pose;
    near(pose.translation, before.translation, 1e-6, 'Pointer spin retained position'); near(pose.translation, target.translation, 1e-6, 'Native pointer target translation');
    const q = target.rotation.map(value => value / Math.hypot(...target.rotation)), dot = pose.rotation.reduce((sum, value, axis) => sum + value * q[axis], 0);
    close(Math.abs(dot), 1, 1e-8, 'Native pointer world rotation');
    check(Math.abs(before.rotation.reduce((sum, value, axis) => sum + value * q[axis], 0)) < .999, 'Actual pointer movement did not rotate the component.');
    for (const id of ['plate', 'left']) {
      const previous = document.occurrences.find(value => value.id === id).pose, next = result.document.occurrences.find(value => value.id === id).pose;
      near(next.translation, previous.translation, 1e-6, id + ' unchanged pointer position');
      close(Math.abs(next.rotation.reduce((sum, value, axis) => sum + value * previous.rotation[axis], 0)), 1, 1e-8, id + ' unchanged pointer orientation');
    }
    const scene = result.scene; check(scene.solidCount === 3 && scene.bodies.length === 3, 'Pointer scene lost independent solids.');
    close(scene.volume, 4800 + 153 * Math.PI / 2, 1e-5, 'Pointer native volume'); close(scene.area, 2960 + 675 * Math.PI / 4, 1e-5, 'Pointer native area');
    near(scene.bounds.min, [-20, -15, -8], 1e-6, 'Pointer native bounds minimum'); near(scene.bounds.max, [20, 15, 4], 1e-6, 'Pointer native bounds maximum');
    const bore = scene.bodies.find(value => value.component.occurrencePath[0] === 'right').faces.filter(value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - .25) < 1e-10);
    check(bore.length === 1 && bore[0].worldSupport?.kind === 'cylinder', 'Pointer scene lost eccentric-bore support.');
    const [x, y, z, w] = q;
    near(bore[0].worldSupport.point, target.translation.map((value, axis) => value + [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)][axis]), 1e-6, 'Independent Cartesian quaternion bore placement');
    check(result.projection.positionResidual <= 1e-6 && result.projection.angleResidual <= 1e-8 && result.projection.evidence.localOnly === true, 'Reachable pointer target residual exceeded its requested policy.');
    return result;
  }
  await selectRight(); const savedRecovery = await recovery(), first = assertReady(await gesture(base, 'rotate'), base);
  check((await fsp.readFile(output)).equals(bytes) && await recovery() === savedRecovery, 'Pointer preview changed saved/recovery state.');
  let before = await observe(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
  const cancelled = await responseAfter(before.serial, 'discard-assembly'); await idle('pointer preview Cancel completes');
  check(cancelled.hasToken && (await fsp.readFile(output)).equals(bytes) && await recovery() === savedRecovery, 'Pointer Cancel failed capability/file/recovery atomicity.'); record('drag/cancelled', cancelled);
  check(first.scene.sceneId !== undefined, 'Pointer preview lacked a real display generation.');
  const latest = await gesture(base, 'rotate'), second = assertReady(latest, base);
  before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly'), moved = applied.response.value.document;
  check(canonical(moved.occurrences) === canonical(second.document.occurrences) && canonical(moved.mates) === canonical(base.mates), 'Apply differs from the final verified pointer destination.');
  await idle('pointer Apply completes'); record('drag/applied', applied);
  before = await observe(); await click('button[aria-label="Deshacer ensamblaje"]'); const undo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(undo.document) === canonical(base), 'Pointer gesture created more than one history entry.'); await idle('pointer Undo completes'); record('drag/undo', undo);
  before = await observe(); await click('button[aria-label="Rehacer ensamblaje"]'); const redo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(redo.document) === canonical(moved), 'Pointer Redo changed the actual applied document.'); await idle('pointer Redo completes'); record('drag/redo', redo);
  await button('Guardar', ':is(.assembly-toolbar, .assembly-quickbar)'); await waitFor('pointer native Save completes', () => ipc.filter(value => value.channel === 'document:save' && value.completed).length === 4);
  const movedBytes = await fsp.readFile(output); check(canonical(JSON.parse(movedBytes.toString('utf8'))) === canonical(moved), 'Pointer saved file differs from committed Apply.');
  await waitFor('pointer Save reaches clean controls', () => page(name => document.querySelector('.assembly-shell-document > strong')?.textContent === name && document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false', moved.name));
  before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); const reopened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(reopened.document) === canonical(moved), 'Pointer reopen changed the actual saved document.'); await idle('pointer saved reopen completes'); record('drag/reopened', reopened);
  await selectRight();
  const movedRecovery = await recovery(), rejected = await gesture(moved, 'translate');
  check(rejected.drag.pose.translation[0] > moved.occurrences.find(value => value.id === 'right').pose.translation[0] + .1,
    'Actual X pointer movement did not request a nontrivial lateral target.');
  check(rejected.response.value.status === 'rejected' && rejected.response.value.reason === 'numeric' && !rejected.response.value.hasToken,
    'Prohibited actual pointer translation unexpectedly gained Apply authority.');
  await waitFor('rejected pointer target blocks Apply', () => page(apply => document.querySelector(apply)?.disabled === true && !!document.querySelector('.assembly-status.error'), APPLY));
  check((await fsp.readFile(output)).equals(movedBytes) && await recovery() === movedRecovery, 'Rejected pointer translation changed committed state.');
  check(dialogCounts().opens === 7 && dialogCounts().saves === 1 && ipc.filter(value => value.channel === 'document:save').length === 4 && ipc.every(value => value.completed), 'Unexpected pointer native file sequence.');
  const state = await observe(); check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Pointer renderer/worker failure.');
  checks.push({ pointerInputSha256: digest(bytes), pointerSavedSha256: digest(movedBytes), phases, gestures,
    independentOracles: 'real pointer Z ring hover/press/3 moves/release; reachable projected WORLD target checked against native supports with explicit Cartesian quaternion matrix; pin/plate V4800+153pi/2,A2960+675pi/4 (1e-5),bounds/positions1e-6,quaternionDot1e-8; lateral-only X has no available translation and cannot publish Apply',
    evidenceLimits: 'Scripted Chromium pointer events in hidden owned Electron renderer, actual native worker DTOs and save/reopen IPC; no React/Three/result injection, human gesture, trajectory projection, continuous collision stopping, installed package or platform generalization.' });
};
