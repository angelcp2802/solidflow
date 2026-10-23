'use strict';
const fsp = require('node:fs/promises');

// Real mate-suppression control, manipulator input and native projected replies.
// The original file is retained; the projected slider has its own Save As path.
module.exports = async function projectionWorkflow(context) {
  const { output, projectionOutput, observe, waitFor, click, button, page, idle, responseAfter, pointer, capture,
    checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', ACTION = 'project-assembly-component', phases = [], gestures = [];
  const bytes = await fsp.readFile(output), original = JSON.parse(bytes.toString('utf8')), right = original.occurrences.find(value => value.id === 'right');
  const caps = original.mates.filter(value => value.type === 'coincident' && [value.first, value.second].some(end => end.component?.occurrencePath[0] === 'right'));
  check(caps.length === 1 && !caps[0].suppressed, 'Expected one active original right-cap relation.');
  const cap = caps[0], recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action, current: event.current, document: event.document,
    drag: event.drag, response: event.response.value });
  let before = await observe();
  await page(label => { const matches = [...document.querySelectorAll('input[type="checkbox"]')].filter(value => value.getAttribute('aria-label') === label);
    if (matches.length !== 1 || matches[0].disabled || !matches[0].checked) throw Error('Expected the enabled original cap control.'); matches[0].click(); }, 'Activar ' + cap.name);
  const suppressed = await responseAfter(before.serial, 'build-assembly'), base = suppressed.document;
  check(base.mates.find(value => value.id === cap.id).suppressed === true
    && canonical(base.mates.filter(value => value.id !== cap.id)) === canonical(original.mates.filter(value => value.id !== cap.id))
    && canonical(base.occurrences) === canonical(original.occurrences) && canonical(base.definitions) === canonical(original.definitions), 'Actual suppression changed unrelated component/source state.');
  await idle('actual cap suppression rebuild completes'); record('projection/cap-suppressed', suppressed);
  async function selectRight() {
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Expected the actual slider component.'); rows[0].click(); }, right.name);
    await waitFor('slider selection reaches controls', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, right.name));
  }
  async function handle(document, scene) {
    await button('Frontal', '.assembly-view-tools'); await click('button[aria-label="Arrastrar posición"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    // Cancel restores this confirmed scene without issuing another native build.
    // A previous displaced preview must not supply the fitted camera's bounds.
    const bounds = scene.visibleBounds;
    const position = document.occurrences.find(value => value.id === 'right').pose.translation;
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const center = bounds.min.map((value, axis) => (value + bounds.max[axis]) / 2), span = Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis])), pixels = rect.height / (1.3 * span);
    const origin = { x: rect.x + rect.width / 2 + (position[0] - center[0]) * pixels, y: rect.y + rect.height / 2 - (position[2] - center[2]) * pixels };
    for (const a of [.03, .04, .02, .05]) for (const b of [.03, .04, .02, .05]) {
      const point = { x: origin.x + rect.height * a, y: origin.y - rect.height * b };
      await pointer('mouseMoved', point);
      if (await page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-drag-axis')) === 'XZ') return point;
    }
    throw Error('Actual front-view manipulator did not expose the XZ plane.');
  }
  async function gesture() {
    const point = await handle(base, suppressed.response.value), start = await observe(), savedRecovery = await recovery();
    await pointer('mousePressed', point, 1);
    await waitFor('projected slider pointer-down blocks Apply', () => page(apply => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'true' && document.querySelector(apply)?.disabled === true, APPLY));
    const targets = [];
    for (const fraction of [1 / 3, 2 / 3, 1]) { const target = { x: point.x + 16 * fraction, y: point.y - 16 * fraction }; targets.push(target); await pointer('mouseMoved', target, 1); }
    await pointer('mouseReleased', targets.at(-1)); await idle('projected slider last target completes');
    const observation = await observe(), requests = observation.assemblies.filter(value => value.serial > start.serial && value.action === ACTION);
    check(requests.length >= 1 && requests.length <= 3 && requests.every(value => value.response?.ok && canonical(value.current) === canonical(base)), 'Projected slider stream used another base or exceeded input count.');
    const event = requests.at(-1), result = event.response.value, requested = event.drag.pose, old = base.occurrences.find(value => value.id === 'right').pose;
    check(event.drag.mode === 'translate' && canonical(event.drag.component) === canonical({ occurrencePath: ['right'], definition: right.definition }), 'Projected slider request lost exact mode/component.');
    check(requested.translation[0] > old.translation[0] + .1 && requested.translation[2] > old.translation[2] + .1, 'XZ pointer input did not request both lateral and axial movement.');
    check(result.status === 'ready' && result.hasToken && result.projection?.temporaryAnchor === false && !result.movement && result.checks.every(value => value.satisfied), 'Native constrained slider projection failed.');
    check(result.scopes.every(value => !value.temporaryAnchor) && result.scopes.find(value => value.definition.id === base.id).result.localDOF === 2, 'Pointer target contaminated saved natural rank/DOF.');
    const actual = result.document.occurrences.find(value => value.id === 'right').pose;
    near(actual.translation, [10, 0, requested.translation[2]], 1e-6, 'Independent cylindrical-axis projection');
    close(Math.abs(actual.rotation.reduce((sum, value, axis) => sum + value * old.rotation[axis], 0)), 1, 1e-8, 'Projection preserves slider spin as a secondary objective');
    close(result.projection.positionResidual, Math.abs(requested.translation[0] - 10), 1e-6, 'Blocked lateral intent remains a separate pointer deviation');
    check(result.projection.positionResidual > .1 && result.projection.angleResidual < 1e-8 && result.projection.evidence.localOnly === true, 'Projection was mislabeled as exact target retention.');
    check(canonical(result.document.definitions) === canonical(base.definitions) && canonical(result.document.mates) === canonical(base.mates), 'Projection edited geometry or saved mate constraints.');
    for (const id of ['plate', 'left']) near(result.document.occurrences.find(value => value.id === id).pose.translation, base.occurrences.find(value => value.id === id).pose.translation, 1e-6, id + ' retained projected position');
    close(result.scene.volume, 4800 + 153 * Math.PI / 2, 1e-5, 'Projected slider native volume'); close(result.scene.area, 2960 + 675 * Math.PI / 4, 1e-5, 'Projected slider native area');
    near(result.scene.bounds.min, [-20, -15, -8], 1e-6, 'Projected slider native bounds minimum'); near(result.scene.bounds.max, [20, 15, requested.translation[2] + 12], 1e-6, 'Projected slider native bounds maximum');
    await waitFor('actual projected deviation and hard checks reach rendered panel', () => page(() => { const panel = document.querySelector('[aria-label="Proyección del arrastre"]'); return !!panel && panel.textContent.includes('proyección local') && panel.textContent.includes('Desviación del puntero') && panel.textContent.includes('Comprobación de relaciones'); }));
    check((await fsp.readFile(output)).equals(bytes) && await recovery() === savedRecovery, 'Projection preview changed committed recovery or original saved file.');
    gestures.push({ axis: 'XZ', down: point, moves: targets, workerSerials: requests.map(value => value.serial) });
    return event;
  }
  await selectRight(); const first = await gesture(); record('projection/preview-cancel', first);
  before = await observe(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]'); const cancelled = await responseAfter(before.serial, 'discard-assembly');
  check(cancelled.hasToken, 'Projection Cancel did not revoke its actual capability.'); await idle('projected slider Cancel completes'); record('projection/cancelled', cancelled);
  const latest = await gesture(); record('projection/preview-apply', latest); before = await observe(); await click(APPLY);
  const applied = await responseAfter(before.serial, 'apply-assembly'), moved = applied.response.value.document;
  check(canonical(moved.occurrences) === canonical(latest.response.value.document.occurrences) && canonical(moved.mates) === canonical(base.mates), 'Projection Apply differs from the verified candidate.');
  await idle('projected slider Apply completes'); record('projection/applied', applied);
  before = await observe(); await click('button[aria-label="Deshacer ensamblaje"]'); const undo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(undo.document) === canonical(base), 'One projected-motion Undo did not restore the entire cap-suppressed source.'); await idle('projected slider Undo completes'); record('projection/undo', undo);
  before = await observe(); await click('button[aria-label="Rehacer ensamblaje"]'); const redo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(redo.document) === canonical(moved), 'Projected-motion Redo changed the candidate.'); await idle('projected slider Redo completes'); record('projection/redo', redo);
  await button('Guardar como', '.assembly-toolbar'); await waitFor('projected slider native Save As completes', () => ipc.filter(value => value.channel === 'document:save' && value.completed).length === 5);
  const movedBytes = await fsp.readFile(projectionOutput); check(canonical(JSON.parse(movedBytes.toString('utf8'))) === canonical(moved) && (await fsp.readFile(output)).equals(bytes), 'Projection Save As changed the original or saved another candidate.');
  await waitFor('projected slider Save As reaches clean controls', () => page(name => document.querySelector('.assembly-header > strong')?.textContent === name && document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false', moved.name));
  before = await observe(); await button('Abrir', '.assembly-toolbar'); const reopened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(reopened.document) === canonical(moved) && !Object.hasOwn(reopened.document, 'projection'), 'Projected slider reopen lost saved state or persisted pointer diagnostics.'); await idle('projected slider reopen completes'); record('projection/reopened', reopened);
  await selectRight(); await handle(moved, reopened.response.value); await capture(moved);
  before = await observe(); await button('Abrir', '.assembly-toolbar'); const restored = await responseAfter(before.serial, 'build-assembly');
  check(canonical(restored.document) === canonical(original) && (await fsp.readFile(output)).equals(bytes), 'Original pre-slider assembly was not restored from its unchanged file.'); await idle('original assembly restored after projected Save As'); record('projection/original-restored', restored);
  check(dialogCounts().opens === 9 && dialogCounts().saves === 2 && ipc.filter(value => value.channel === 'document:save').length === 5 && ipc.every(value => value.completed), 'Unexpected projected slider native file sequence.');
  const final = await observe(); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Projected slider renderer/worker failure.');
  checks.push({ projectionInputSha256: digest(bytes), projectionSavedSha256: digest(movedBytes), phases, gestures,
    independentOracles: 'actual suppression releases right axial DOF; real XZ pointer target projects to x10,y0 and requestedZ, spin secondary unchanged; naturalDOF2,noanchor; pointer residual=abs(requestedX-10),hardchecks satisfied; original R2.5 volume/area1e-5,placedbounds/coordinates1e-6,orientationDot1e-8; unchanged original file and separate SaveAs/reopen',
    evidenceLimits: 'Local discrete constrained projection from original committed base, actual Chromium pointer/native worker/file IPC; no injected native results/poses, warm-start trajectory, global minimum proof, swept collision, human gesture, installed package or platform generalization.' });
};
