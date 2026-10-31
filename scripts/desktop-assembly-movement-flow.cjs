'use strict';
const fsp = require('node:fs/promises');

// Actual controls, native worker replies and committed file IPC only. Targets
// are user intent; no pose, report, geometry or accepted result is injected.
module.exports = async function movementWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { output, observe, waitFor, click, button, control, page, idle, responseAfter, checks, ipc,
    check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests } = context;
  const MOVE = 'button[aria-label="Vista previa del movimiento"]', APPLY = 'button[aria-label="Aplicar ensamblaje"]';
  const AXIS = 'select[aria-label="Eje local del movimiento"]', ANGLE = 'input[aria-label="Giro local del movimiento en grados"]';
  const X = 'input[aria-label="Destino local X del componente"]';
  const bytes = await fsp.readFile(output), base = JSON.parse(bytes.toString('utf8')), phases = [];
  const original = base.occurrences.find(value => value.id === 'right');
  const unit = original.pose.rotation.map(value => value / Math.hypot(...original.pose.rotation)), [qx, qy, qz, qw] = unit;
  // Independent Hamilton product q * Z90; not the application rotation helper.
  const expectedQ = [(qx + qy) / Math.SQRT2, (qy - qx) / Math.SQRT2, (qz + qw) / Math.SQRT2, (qw - qz) / Math.SQRT2];
  const expectedBore = original.pose.translation.map((value, axis) => value + [2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx)][axis]);
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action, current: event.current,
    hasToken: event.hasToken, document: event.response.value?.document ?? event.document, response: event.response.value });
  const orientation = (actual, expected, description) => {
    const dot = actual.reduce((sum, value, axis) => sum + value * expected[axis], 0);
    close(Math.abs(dot), 1, 1e-8, description);
  };
  async function selectRight() {
    (await assemblyNavigation.panel('components'), await page(name => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Expected the actual right component tree control.');
      rows[0].click();
    }, original.name));
    await waitFor('right component movement panel reaches rendered controls', () => page(name =>
      document.querySelector('input[aria-label="Nombre del componente"]')?.value === name
      && !!document.querySelector('button[aria-label="Vista previa del movimiento"]'), original.name));
  }
  function assertMoved(document, scene) {
    check(canonical(document.definitions) === canonical(base.definitions) && canonical(document.mates) === canonical(base.mates)
      && !Object.hasOwn(document, 'movement'), 'Movement changed source geometry, declarations or persisted a driver.');
    check(canonical(document.occurrences.map(value => [value.id, value.definition, value.fixed, value.visible, value.suppressed]))
      === canonical(base.occurrences.map(value => [value.id, value.definition, value.fixed, value.visible, value.suppressed])), 'Movement changed occurrence identity/state.');
    const right = document.occurrences.find(value => value.id === 'right');
    near(right.pose.translation, original.pose.translation, 1e-6, 'Allowed spin retained its local translation');
    orientation(right.pose.rotation, expectedQ, 'Local incremental Z90 orientation');
    for (const id of ['left', 'plate']) {
      const before = base.occurrences.find(value => value.id === id), after = document.occurrences.find(value => value.id === id);
      near(after.pose.translation, before.pose.translation, 1e-6, id + ' retained translation');
      orientation(after.pose.rotation, before.pose.rotation, id + ' retained orientation');
    }
    check(scene.solidCount === 3 && scene.bodies.length === 3, 'Movement lost independent component solids.');
    close(scene.volume, 4800 + 153 * Math.PI / 2, 1e-5, 'Moved revised assembly native DTO volume');
    close(scene.area, 2960 + 675 * Math.PI / 4, 1e-5, 'Moved revised assembly native DTO area');
    near(scene.bounds.min, [-20, -15, -8], 1e-6, 'Moved assembly bounds minimum');
    near(scene.bounds.max, [20, 15, 4], 1e-6, 'Moved assembly bounds maximum');
    const body = scene.bodies.find(value => canonical(value.component.occurrencePath) === canonical(['right']));
    check(canonical(body.component.definition) === canonical(original.definition) && body.body?.bodyId === 'pin-body'
      && body.body.sourceFeatureId === 'bore' && canonical(body.worldPose) === canonical(right.pose), 'Moved native scene lost exact body/revision/pose scope.');
    const bore = body.faces.filter(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - .25) < 1e-10);
    check(bore.length === 1 && bore[0].worldSupport.kind === 'cylinder', 'Moved scene did not retain the actual eccentric-bore support.');
    near(bore[0].worldSupport.point, expectedBore, 1e-6, 'Actual moved world support agrees with independent prior-Y basis');
  }
  async function preview(phase) {
    await control(AXIS, '2'); await control(ANGLE, '90');
    const recovery = await page(() => localStorage.getItem('solidflow.autosave')), before = await observe.counters();
    await click(MOVE); const event = await responseAfter(before.serial, 'move-assembly-component-motion'), result = event.response.value;
    check(canonical(event.current) === canonical(base) && canonical(event.motion.component) === canonical({ occurrencePath: ['right'], definition: original.definition }), 'Movement targeted a stale base or another occurrence.');
    near(event.motion.translation, original.pose.translation, 1e-6, 'Actual requested local translation');
    check(event.motion.rotation.axis === 2, 'Numeric motion lost its intrinsic local axis.');
    close(event.motion.rotation.angle, Math.PI / 2, 1e-12, 'Actual signed numeric rotation intent');
    check(result.status === 'ready' && result.movement?.temporaryAnchor === true && result.checks.every(value => value.satisfied), 'Actual native movement preview did not pass its relation checks.');
    check(canonical(result.movement.scope) === canonical({ id: base.id, revision: base.revision })
      && canonical(result.movement.affectedPaths) === canonical([['right']]) && result.movement.lengthResidual <= 1e-6
      && result.movement.angleResidual <= 1e-8, 'Movement witness exceeded its scoped target policy.');
    const scope = result.scopes.find(value => value.definition.id === base.id && value.definition.revision === base.revision);
    check(scope.temporaryAnchor?.occurrenceId === 'right' && scope.result.localDOF === 0, 'Driven DOF was not explicitly qualified by its temporary anchor.');
    assertMoved(result.document, result.scene); await idle('actual native movement preview completes');
    await waitFor('authenticated movement enables Apply', () => page(apply => document.querySelector(apply)?.disabled === false, APPLY));
    check(await page(() => localStorage.getItem('solidflow.autosave')) === recovery && (await fsp.readFile(output)).equals(bytes), 'Movement preview changed committed recovery or saved bytes.');
    record(phase, event); return result;
  }
  await selectRight(); await preview('movement/preview-cancel');
  let before = await observe.counters(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
  const cancelled = await responseAfter(before.serial, 'discard-assembly');
  check(cancelled.hasToken && cancelled.response.value === null && (await fsp.readFile(output)).equals(bytes), 'Cancel did not discard the actual capability or changed saved bytes.');
  await idle('movement Cancel restores the previously confirmed scene');
  await waitFor('movement Cancel leaves committed recovery and Apply unchanged', async () => canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(base)
    && await page(apply => document.querySelector(apply)?.disabled === true && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm', APPLY));
  record('movement/cancelled', cancelled);
  await preview('movement/preview-apply'); before = await observe.counters(); await click(APPLY);
  const applied = await responseAfter(before.serial, 'apply-assembly'), moved = applied.response.value.document;
  assertMoved(moved, applied.response.value.scene); await idle('movement Apply completes');
  await waitFor('movement Apply reaches committed recovery', async () => canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(moved));
  record('movement/applied', applied);
  before = await observe.counters(); await click('button[aria-label="Resolver ensamblaje"]');
  const natural = await responseAfter(before.serial, 'preview-assembly'), naturalResult = natural.response.value;
  check(canonical(natural.current) === canonical(moved) && naturalResult.status === 'ready' && !naturalResult.movement
    && naturalResult.scopes.every(value => !value.temporaryAnchor)
    && naturalResult.scopes.find(value => value.definition.id === moved.id).result.localDOF === 1,
  'Releasing the movement driver did not restore the saved mechanism freedom.');
  assertMoved(naturalResult.document, naturalResult.scene); await idle('natural undriven relation preview completes'); record('movement/natural-preview', natural);
  before = await observe.counters(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
  const released = await responseAfter(before.serial, 'discard-assembly'); check(released.hasToken && released.response.value === null, 'Cancel did not revoke the undriven preview capability.');
  await idle('natural check Cancel restores the previously confirmed movement scene');
  check(canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(moved), 'Cancel of the undriven check changed committed movement recovery.');
  record('movement/natural-cancelled', released);
  before = await observe.counters(); await click('button[aria-label="Deshacer ensamblaje"]');
  const undo = await responseAfter(before.serial, 'build-assembly'); check(canonical(undo.document) === canonical(base), 'One Undo did not restore the complete pre-movement document.');
  await idle('movement Undo rebuild completes'); record('movement/undo', undo);
  before = await observe.counters(); await click('button[aria-label="Rehacer ensamblaje"]');
  const redo = await responseAfter(before.serial, 'build-assembly'); check(canonical(redo.document) === canonical(moved), 'Redo changed the authenticated movement.');
  assertMoved(redo.document, redo.response.value); await idle('movement Redo rebuild completes'); record('movement/redo', redo);
  await button('Guardar', ':is(.assembly-toolbar, .assembly-quickbar)');
  await waitFor('movement native Save completes', () => ipc.filter(value => value.channel === 'document:save' && value.completed).length === 3);
  const movedBytes = await fsp.readFile(output); check(canonical(JSON.parse(movedBytes.toString('utf8'))) === canonical(moved), 'Movement save differs from the actual Apply/Redo document.');
  await waitFor('movement Save reaches clean rendered controls', () => page(name => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
    && document.querySelector('.assembly-shell-document > strong')?.textContent === name
    && [...document.querySelectorAll(':is(.assembly-toolbar, .assembly-quickbar) button')].some(value => value.textContent.trim() === 'Abrir' && !value.disabled), moved.name));
  before = await observe.counters(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
  const reopened = await responseAfter(before.serial, 'build-assembly'); check(canonical(reopened.document) === canonical(moved), 'Movement reopen changed saved poses/declarations.');
  assertMoved(reopened.document, reopened.response.value); await idle('moved assembly reopen completes'); record('movement/reopened', reopened);
  await selectRight(); await control(AXIS, '2'); await control(ANGLE, '0'); await control(X, '11');
  const recovery = await page(() => localStorage.getItem('solidflow.autosave')); before = await observe.counters(); await click(MOVE);
  const rejected = await responseAfter(before.serial, 'move-assembly-component-motion');
  check(canonical(rejected.current) === canonical(moved) && rejected.motion.translation[0] === 11
    && rejected.response.value.status === 'rejected' && rejected.response.value.kind === 'assembly-preview', 'Prohibited lateral move was accepted or targeted another base.');
  await idle('prohibited lateral movement rejects');
  await waitFor('movement rejection stays visible with Apply blocked', () => page((apply, x) => document.querySelector(apply)?.disabled === true
    && !!document.querySelector('.assembly-status.error') && document.querySelector(x)?.value === '11', APPLY, X));
  check((await fsp.readFile(output)).equals(movedBytes) && await page(() => localStorage.getItem('solidflow.autosave')) === recovery,
    'Rejected movement changed saved or committed recovery bytes.'); record('movement/rejected-lateral', rejected);
  check(dialogCounts().opens === 6 && dialogCounts().saves === 1 && ipc.filter(value => value.channel === 'document:save').length === 3
    && ipc.every(value => value.completed), 'Unexpected movement native file sequence.');
  const observation = await observe.counters(); check(!consoleErrors.length && !failedRequests.length && !observation.workerErrorCount, 'Movement renderer/worker failure.');
  checks.push({ movementInputSha256: digest(bytes), movedSavedSha256: digest(movedBytes), movedDocument: moved, phases,
    independentOracles: 'q*Z90 explicit Hamilton product; eccentric-bore world point is prior local-Y basis plus translation; original R2.5 pin formulas V297pi/4,A627pi/8, totals V4800+153pi/2,A2960+675pi/4; V/A1e-5,local/world/bounds1e-6,orientationDot1e-8; lateralX11 incompatible with fixed plate concentric axis',
    evidenceLimits: 'Scripted numeric target controls, actual native worker reply DTOs/supports and secure Apply/Undo/Redo/Save/reopen only; temporary solve anchor not saved. No injected geometry/poses/results, UI BRep/probes, real pointer drag, path projection, continuous collision stopping, installed package or general platform claim.' });
};
