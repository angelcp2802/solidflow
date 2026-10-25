'use strict';
const fsp = require('node:fs/promises');

// Original boxes and saved mates are opened through the real file bridge.
// Only actual controls supply intent; worker geometry/trace/capabilities remain
// untouched. A clear final endpoint must not tunnel through the thin obstacle.
module.exports = async function translationWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { translationPath, translationFixture, translationOutput, observe, waitFor, click, capture, button, control, page,
    idle, responseAfter, checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests } = context;
  const ACTION = 'translate-assembly-until-contact', PREVIEW = 'button[aria-label="Vista previa con parada"]', APPLY = 'button[aria-label="Aplicar ensamblaje"]';
  const phases = [], inputBytes = await fsp.readFile(translationPath);
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action,
    current: event.current, translation: event.translation, stopOptions: event.stopOptions, document: event.document, response: event.response.value });
  let before = await observe.counters(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
  const opened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(opened.document) === canonical(translationFixture), 'Contact fixture did not open through actual file routing.');
  await idle('original contact slider opens'); record('translation/opened', opened);
  async function select() {
    (await assemblyNavigation.panel('components'), await page(() => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === 'Original moving slider');
      if (rows.length !== 1 || rows[0].disabled) throw Error('Expected the actual slider tree row.'); rows[0].click(); }));
    await waitFor('contact slider reaches actual controls', () => page(selector => !!document.querySelector(selector) && !document.querySelector(selector).disabled, PREVIEW));
  }
  await select();
  async function preview(x, clearance, base, phase) {
    for (const [axis, value] of [['X', x], ['Y', 0], ['Z', 0]]) await control(`input[aria-label="Destino global ${axis} hasta contacto"]`, String(value));
    await control('input[aria-label="Holgura hasta contacto"]', String(clearance));
    const recovery = await page(() => localStorage.getItem('solidflow.autosave')), start = await observe.counters();
    await click(PREVIEW); const event = await responseAfter(start.serial, ACTION), reply = event.response.value;
    check(canonical(event.current) === canonical(base) && canonical(event.translation.component) === canonical({ occurrencePath: ['slider'], definition: base.occurrences[0].definition }), 'Contact request used stale base/selection.');
    near(event.translation.translation, [x, 0, 0], 1e-10, 'Actual absolute world translation intent');
    check(event.stopOptions.clearance === clearance && event.stopOptions.lengthTolerance === 1e-6, 'Contact options changed the rendered requested policy.');
    await idle('contact preview completes'); record(phase, event);
    check(await page(() => localStorage.getItem('solidflow.autosave')) === recovery && (await fsp.readFile(translationPath)).equals(inputBytes), 'Contact preview changed committed recovery or original bytes.');
    return { event, reply };
  }
  function verify(reply, x, clearance, stopped) {
    check(reply.status === 'ready' && reply.hasToken && reply.translation && !reply.movement && !reply.projection
      && reply.checks.length === 2 && reply.checks.every(value => value.satisfied), 'Native contact preview failed or borrowed another movement witness.');
    check(reply.scopes.every(value => !value.temporaryAnchor) && reply.scopes.at(-1).result.localDOF === 1, 'Contact preview did not retain natural slider mobility.');
    const trace = reply.translation.trace, expectedX = stopped ? 7.75 - clearance : x;
    check(trace.status === (stopped ? 'stopped' : 'complete') && trace.bodyCount === 2 && trace.pairCount === 1 && trace.queryCount >= 2, 'Unexpected actual native trace.');
    near(reply.document.occurrences[0].pose.translation, [expectedX, 0, 0], 1e-5, 'Independent rectilinear stop location');
    near(reply.translation.resolvedPose.translation, reply.document.occurrences[0].pose.translation, 1e-8, 'Native resolved world placement');
    near(reply.translation.requestedPose.translation, [x, 0, 0], 1e-10, 'Requested and resolved placement stay distinct');
    check(canonical(reply.document.definitions) === canonical(translationFixture.definitions) && canonical(reply.document.mates) === canonical(translationFixture.mates)
      && canonical(reply.document.occurrences[1]) === canonical(translationFixture.occurrences[1]), 'Contact motion changed sources, mates or fixed obstacle.');
    close(reply.scene.volume, 96, 1e-7, 'Original cube64 plus obstacle32 native volume'); close(reply.scene.area, 240, 1e-7, 'Original cube96 plus obstacle144 native area');
    check(reply.scene.solidCount === 2 && reply.scene.bodies.length === 2, 'Contact motion lost independently placed native solids.');
    if (stopped) {
      check(trace.fraction > 0 && trace.fraction < 1 && trace.blockingPair.minimumDistance > trace.blockingPair.band
        && trace.blockingPair.minimumDistance - trace.blockingPair.band <= 1e-6, 'Stop did not retain its measured numerical gap.');
      close(trace.fraction, expectedX / x, 1e-6, 'Independent travel fraction before thin obstacle');
      const pairPaths = [trace.blockingPair.first.component.occurrencePath[0], trace.blockingPair.second.component.occurrencePath[0]].sort();
      check(canonical(pairPaths) === canonical(['obstacle', 'slider']), 'Stop lost its actual scoped body pair.');
    } else check(trace.fraction === 1 && !trace.blockingPair, 'Clear path falsely reported a stop.');
  }
  async function cancel() {
    const start = await observe.counters(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
    const event = await responseAfter(start.serial, 'discard-assembly'); check(event.hasToken, 'Contact Cancel did not revoke the genuine capability.');
    await waitFor('contact Cancel restores confirmed controls', () => page(apply => document.querySelector(apply)?.disabled === true
      && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm'
      && document.querySelector('input[aria-label="Destino global X hasta contacto"]')?.disabled === false, APPLY));
    await idle('contact Cancel completes'); record('translation/cancelled', event);
    check(canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(translationFixture)
      && (await fsp.readFile(translationPath)).equals(inputBytes), 'Contact Cancel changed confirmed recovery or original bytes.');
  }
  let result = await preview(20, 0, translationFixture, 'translation/stopped-preview-cancel'); verify(result.reply, 20, 0, true);
  await waitFor('actual contact witness renders separately from requested target', () => page(() => {
    const panel = document.querySelector('[aria-label="Trasladar hasta contacto"]'); return !!panel && panel.textContent.includes('7.749') && panel.textContent.includes('20');
  }));
  await cancel(); result = await preview(-5, 0, translationFixture, 'translation/clear-preview-cancel'); verify(result.reply, -5, 0, false); await cancel();
  result = await preview(20, .25, translationFixture, 'translation/clearance-preview-cancel'); verify(result.reply, 20, .25, true); await cancel();
  result = await preview(20, 0, translationFixture, 'translation/stopped-preview-apply'); verify(result.reply, 20, 0, true);
  before = await observe.counters(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly'), moved = applied.response.value.document;
  near(moved.occurrences[0].pose.translation, result.reply.document.occurrences[0].pose.translation, 1e-10, 'Contact Apply consumes actual stopped target');
  check(!Object.hasOwn(moved, 'translation') && canonical(moved.mates) === canonical(translationFixture.mates), 'Contact Apply persisted temporary diagnostics or changed mates.');
  await idle('contact Apply completes'); record('translation/applied', applied);
  before = await observe.counters(); await click('button[aria-label="Deshacer ensamblaje"]'); const undo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(undo.document) === canonical(translationFixture), 'One Contact Undo failed to restore the complete source.'); await idle('contact Undo completes'); record('translation/undo', undo);
  before = await observe.counters(); await click('button[aria-label="Rehacer ensamblaje"]'); const redo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(redo.document) === canonical(moved), 'Contact Redo failed to restore stopped pose.'); await idle('contact Redo completes'); record('translation/redo', redo);
  await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)'); await waitFor('contact native Save As completes', () => ipc.filter(value => value.channel === 'document:save' && value.completed).length === 6);
  const bytes = await fsp.readFile(translationOutput); check(canonical(JSON.parse(bytes.toString('utf8'))) === canonical(moved), 'Contact saved bytes differ from verified Apply.');
  await waitFor('contact Save As reaches clean committed controls', () => page(name => {
    const save = [...document.querySelectorAll(':is(.assembly-toolbar, .assembly-quickbar) button')].find(value => value.textContent.trim() === 'Guardar');
    return document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
      && document.querySelector('.assembly-shell-document > strong')?.textContent === name && save?.disabled === false
      && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm';
  }, moved.name));
  before = await observe.counters(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
  const reopened = await responseAfter(before.serial, 'build-assembly'); check(canonical(reopened.document) === canonical(moved), 'Contact reopen lost stopped placement.'); await idle('contact reopen completes'); record('translation/reopened', reopened);
  await select(); const failure = await preview(20, 0, moved, 'translation/no-effective-progress');
  check(failure.reply.status === 'rejected' && !failure.reply.hasToken && await page(selector => document.querySelector(selector)?.disabled === true, APPLY), 'Near-contact restart published an ineffective/unsafe Apply.');
  check((await fsp.readFile(translationOutput)).equals(bytes) && (await fsp.readFile(translationPath)).equals(inputBytes), 'Rejected contact restart changed saved source.');
  await button('Frontal', '.assembly-view-tools'); await capture(moved);
  check(dialogCounts().opens === 12 && dialogCounts().saves === 3 && ipc.filter(value => value.channel === 'document:save').length === 6 && ipc.every(value => value.completed), 'Unexpected contact native file sequence.');
  const final = await observe(); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Contact renderer/worker failure.');
  checks.push({ translationInputSha256: digest(inputBytes), translationSavedSha256: digest(bytes), phases,
    independentOracles: '4mm cubeV64/A96; .5x8x8obstacleV32/A144 atX10; exact geometric firstcontactX7.75; guarded stop slightly before within1e-5; clearance.25->X7.5; targetX20 is clear after traversing obstacle; clear targetX-5; two saved plane mates leave naturalDOF1; mm/volume/area bounds as asserted',
    evidenceLimits: 'Numerically guarded native-distance advancement for straight constant-rotation translation; actual DOM/native worker/Apply/file IPC, no injected poses/results. No certified distance interval, exact first-contact time, rotary/curved/flexible motion, pointer collision stopping, human gesture, installed package or platform generalization.' });
};
