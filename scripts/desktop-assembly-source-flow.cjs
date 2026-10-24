'use strict';
const fsp = require('node:fs/promises');

// Extends the original assembled plate/two-pin workflow through real controls.
// Test data and observations never replace renderer state or worker results.
module.exports = async function sourceUpdateWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, saved, savedBytes, output, partUpdatePath, updatedPart, observe, waitFor, click, capture,
    button, control, page, idle, responseAfter, recordPhase, checks, ipc, check, canonical, digest,
    near, close, dialogCounts, consoleErrors, failedRequests } = context;
  const UPDATE = 'button[aria-label="Actualizar pieza"]', APPLY = 'button[aria-label="Aplicar ensamblaje"]';
  const PANEL = '[role="region"][aria-label="Actualizar origen compartido"]';
  const SOLVE_UPDATE = 'button[aria-label="Resolver actualización de pieza"]';
  const CANCEL_UPDATE = 'button[aria-label="Cancelar actualización de pieza"]';
  const stages = [], source = { id: 'example-pin', revision: 'r1' };
  const record = (phase, event, scene) => {
    recordPhase(phase, event, scene);
    const value = event.response.value;
    stages.push({ phase, serial: event.serial, action: event.action,
      ...(scene ? { scene } : {}), ...(event.current ? { currentSha256: digest(canonical(event.current)) } : {}),
      ...(event.proposed ? { proposedSha256: digest(canonical(event.proposed)) } : {}),
      ...(value?.source ? { source: value.source, replacement: value.replacement, occurrences: value.occurrences, endpoints: value.endpoints } : {}),
      ...(value?.scopes ? { scopes: value.scopes, checks: value.checks } : {}),
      ...(value?.status ? { status: value.status } : {}), ...(value?.reason ? { reason: value.reason } : {}),
      ...(event.reviewId ? { reviewId: event.reviewId } : {}),
      ...(!event.response.ok ? { rpcError: event.response.error } : {}) });
  };
  async function stageResponse(serial, rejected = false) {
    return waitFor('actual private part-update preview', async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Observed a real assembly worker error.');
      const matches = state.assemblies.filter(value => value.serial > serial && value.action === 'preview-assembly-part-update' && value.response);
      check(matches.length <= 1, 'One actual private part-update preview.'); if (!matches.length) return false;
      const event = matches[0]; check(rejected ? event.response.ok === false : event.response.ok === true, 'Expected exact private-stage response disposition.'); return event;
    });
  }
  check(updatedPart.version === 1 && updatedPart.id === source.id
    && updatedPart.features[0].profile.radius === 2.5, 'Expected the original revised radius-2.5 pin input.');
  const oldPin = saved.definitions.find(value => value.id === source.id && value.revision === 'r1');
  check(oldPin?.kind === 'part', 'Missing the original shared source.');

  function assertDocument(document, revision, repaired) {
    check(document.version === 2 && document.kind === 'assembly' && document.id === saved.id
      && document.revision === saved.revision && document.name === saved.name && document.createdAt === saved.createdAt,
    'Source update changed the assembly identity.');
    check(document.definitions.length === saved.definitions.length + 1
      && canonical(document.definitions.slice(0, saved.definitions.length)) === canonical(saved.definitions),
    'Source update changed an earlier revision or another embedded source.');
    const definition = document.definitions.at(-1);
    check(definition.kind === 'part' && definition.id === source.id && definition.revision === revision
      && canonical(definition.document) === canonical(updatedPart), 'Wrong embedded revised source.');
    check(document.occurrences.length === saved.occurrences.length && document.mates.length === saved.mates.length,
      'Source update changed component or mate cardinality.');
    document.occurrences.forEach((value, index) => {
      const original = saved.occurrences[index], target = original.id === 'plate' ? original.definition : { id: source.id, revision };
      check(value.id === original.id && value.name === original.name && canonical(value.definition) === canonical(target)
        && value.fixed === original.fixed && value.visible === original.visible && value.suppressed === original.suppressed,
      'A source update changed occurrence identity, role or sharing.');
      near(value.pose.translation, original.pose.translation, 1e-6, 'Source update preserved solved translation.');
      const cosine = Math.abs(value.pose.rotation.reduce((sum, element, i) => sum + element * original.pose.rotation[i], 0));
      close(cosine, 1, 1e-8, 'Source update preserved solved orientation.');
    });
    document.mates.forEach((mate, index) => {
      const original = saved.mates[index], { first, ...rest } = mate, { first: oldFirst, ...oldRest } = original;
      check(canonical(rest) === canonical(oldRest), 'Source update changed mate identity, target or saved spin-lock intent.');
      check(first.kind === 'face' && canonical(first.component.occurrencePath) === canonical(oldFirst.component.occurrencePath)
        && canonical(first.body) === canonical(oldFirst.body) && first.support === oldFirst.support,
      'Repair changed the occurrence assignment, body state or endpoint family.');
      check(first.component.definition.id === source.id && first.component.definition.revision === (repaired ? revision : 'r1'),
        'An ordinal face was silently retargeted, or an explicit repair was lost.');
    });
  }
  function assertScene(scene, revision) {
    check(scene.kind === 'assembly-scene' && scene.bodies.length === 3 && scene.solidCount === 3
      && scene.prototypeCount === 2 && scene.warnings.length === 0, 'Revised source did not keep three independent components.');
    close(scene.volume, 4800 + 153 * Math.PI / 2, 1e-5, 'Revised total volume.');
    close(scene.area, 2960 + 675 * Math.PI / 4, 1e-5, 'Revised total area.');
    near(scene.bounds.min, [-20, -15, -8], 1e-6, 'Revised assembly minimum.');
    near(scene.bounds.max, [20, 15, 4], 1e-6, 'Revised assembly maximum.');
    for (const id of ['plate', 'left', 'right']) {
      const bodies = scene.bodies.filter(body => canonical(body.component.occurrencePath) === canonical([id]));
      check(bodies.length === 1, 'Revised component identity is missing or ambiguous.');
      const body = bodies[0];
      check(body.solidCount === 1 && body.component.definition.revision === (id === 'plate' ? 'r1' : revision)
        && body.body.bodyId === (id === 'plate' ? 'plate-body' : 'pin-body')
        && body.body.sourceFeatureId === (id === 'plate' ? 'hole-1' : 'bore'), 'Revised exact owner state changed.');
      close(body.volume, id === 'plate' ? 4800 - 72 * Math.PI : 297 * Math.PI / 4, 1e-5, 'Revised native component volume.');
      close(body.area, id === 'plate' ? 2960 + 12 * Math.PI : 627 * Math.PI / 8, 1e-5, 'Revised native component area.');
      if (id !== 'plate') {
        near(body.worldPose.translation, [id === 'left' ? -10 : 10, 0, -8], 1e-6, 'Revised pin placement.');
        near(body.bounds.min, [id === 'left' ? -12.5 : 7.5, -2.5, -8], 1e-6, 'Revised pin minimum.');
        near(body.bounds.max, [id === 'left' ? -7.5 : 12.5, 2.5, 4], 1e-6, 'Revised pin maximum.');
      }
    }
  }
  async function unchanged(description) {
    check((await fsp.readFile(output)).equals(savedBytes), description + ': saved file changed.');
    check(canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(saved),
      description + ': committed recovery changed.');
  }
  async function openReview() {
    (await assemblyNavigation.panel('components'), await page(() => {
      const items = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')]
        .filter(item => item.querySelector('span')?.firstChild?.textContent === 'Original left pin');
      if (items.length !== 1 || items[0].disabled) throw Error('Expected the actual selectable left pin.');
      items[0].click();
    }));
    const before = await observe(); await click(UPDATE);
    const event = await responseAfter(before.serial, 'review-assembly-part-update'), reply = event.response.value;
    check(canonical(event.current) === canonical(saved) && canonical(event.source) === canonical(source)
      && canonical(event.part) === canonical(updatedPart) && event.revision !== 'r1', 'Review bypassed the exact committed source/input.');
    check(reply.kind === 'assembly-source-review' && typeof reply.reviewId === 'string' && reply.reviewId.length > 0 && !reply.hasToken && canonical(reply.source) === canonical(source)
      && reply.replacement.id === source.id && reply.replacement.revision === event.revision,
    'Native review manufactured Apply authority or the wrong revision.');
    check(reply.occurrences.length === 2 && reply.endpoints.length === 4
      && reply.endpoints.every(value => value.status === 'needs-repair' && value.locator.side === 'first')
      && new Set(reply.endpoints.map(value => value.locator.mateId)).size === 4,
    'Expected explicit repair of four original ordinal face endpoints.');
    assertDocument(reply.document, event.revision, false); assertScene(reply.scene, event.revision);
    await waitFor('source update panel is editable', () => page(selector => {
      const panel = document.querySelector(selector); return !!panel && panel.getAttribute('aria-busy') === 'false';
    }, PANEL));
    await unchanged('Staged source review'); record('source/review', event, reply.scene); return event;
  }

  const cancelled = await openReview(); let beforeCancel = await observe(); await click(CANCEL_UPDATE);
  const discarded = await responseAfter(beforeCancel.serial, 'discard-assembly-part-update');
  check(discarded.reviewId === cancelled.response.value.reviewId && !discarded.hasToken, 'Cancel discards the exact retained private source review.');
  await waitFor('source update Cancel restores confirmed controls', () => page((panel, apply) => !document.querySelector(panel)
    && document.querySelector(apply)?.disabled === true && document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false', PANEL, APPLY));
  await unchanged('Cancelled source update');
  const reviewed = await openReview(), review = reviewed.response.value, revision = reviewed.revision;
  check(revision !== cancelled.revision && review.reviewId !== cancelled.response.value.reviewId, 'Canceled source revision or private review identity was reused.');
  let before = await observe(); await click(SOLVE_UPDATE);
  const broken = await stageResponse(before.serial, true);
  check(broken.reviewId === review.reviewId && canonical(broken.current) === canonical(saved)
    && canonical(broken.proposed) === canonical(review.document), 'Unrepaired preview bypassed the exact private review/base/proposal.');
  check(broken.response.error === 'Quedan referencias de la pieza pendientes de reparación.'
    && !broken.response.value && !broken.hasToken, 'Unrepaired source references unexpectedly enabled Apply.');
  await idle('unrepaired source rejection completes');
  check(await page((panel, apply) => !!document.querySelector(panel) && document.querySelector(apply)?.disabled === true, PANEL, APPLY),
    'Source rejection discarded the editable stage or left Apply enabled.');
  await unchanged('Unrepaired source rejection'); record('source/rejected-unrepaired', broken);
  for (const endpoint of review.endpoints) {
    const original = endpoint.endpoint, path = original.component.occurrencePath;
    const body = review.scene.bodies.find(value => canonical(value.component.occurrencePath) === canonical(path));
    const faces = body.faces.filter(value => value.support?.kind === (original.support === 'axis' ? 'cylinder' : 'plane')
      && (original.support === 'axis' ? Math.abs(value.support.radius - 2.5) < 1e-9
        && Math.hypot(value.support.point[0], value.support.point[1]) < 1e-9
      : Math.abs(value.support.point[2] - 12) < 1e-9 && value.support.normal[2] > .99));
    check(faces.length === 1, 'Expected one actual revised outer cylinder or upper cap.');
    const reference = { kind: 'face', ...faces[0].selection, support: original.support }, label = endpoint.locator.mateId + ' ' + endpoint.locator.side;
    await control('select[aria-label="Cara de reparación ' + label + '"]', JSON.stringify(reference));
    await click('button[aria-label="Reparar referencia ' + label + '"]');
  }
  before = await observe(); await click(SOLVE_UPDATE);
  const preview = await stageResponse(before.serial), reply = preview.response.value;
  check(preview.reviewId === review.reviewId && reply.status === 'ready' && reply.hasToken && canonical(preview.current) === canonical(saved), 'Repaired update has no fresh authenticated private review preview.');
  assertDocument(preview.proposed, revision, true);
  assertDocument(reply.document, revision, true); assertScene(reply.scene, revision);
  const root = reply.scopes.find(value => value.definition.id === expected.id);
  check(root?.result.status === 'underdefined' && root.result.localDOF === 1 && root.result.rank === 11
    && reply.checks.length === 4 && reply.checks.every(value => value.satisfied
      && value.lengthResidual <= value.lengthTolerance && value.angleResidual <= value.angleTolerance), 'Repaired source lost the actual physical solution/spin lock.');
  await unchanged('Ready source preview before Apply'); record('source/preview-repaired', preview, reply.scene);
  await waitFor('repaired source preview enables Apply', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
  before = await observe(); await click(APPLY);
  const applied = await responseAfter(before.serial, 'apply-assembly');
  check(applied.response.value.kind === 'assembly-applied' && applied.hasToken, 'Source Apply did not consume a worker capability.');
  const updated = applied.response.value.document;
  assertDocument(updated, revision, true); assertScene(applied.response.value.scene, revision);
  await idle('source Apply completes');
  await waitFor('source Apply reaches committed recovery', async () => {
    const recovery = await page(() => localStorage.getItem('solidflow.autosave'));
    return !!recovery && canonical(JSON.parse(recovery)) === canonical(updated);
  });
  record('source/applied', applied, applied.response.value.scene);
  before = await observe(); await click('button[aria-label="Deshacer ensamblaje"]');
  const undone = await responseAfter(before.serial, 'build-assembly');
  check(canonical(undone.document) === canonical(saved), 'One Undo did not restore the entire original source/ref transaction.');
  close(undone.response.value.volume, 4800 + 45 * Math.PI / 2, 1e-5, 'Undo restored original native volume.');
  await idle('source Undo rebuild completes'); record('source/undo', undone, undone.response.value);
  before = await observe(); await click('button[aria-label="Rehacer ensamblaje"]');
  const redone = await responseAfter(before.serial, 'build-assembly');
  check(canonical(redone.document) === canonical(updated), 'Redo did not restore exact revised identities/references.');
  assertScene(redone.response.value, revision); await idle('source Redo rebuild completes'); record('source/redo', redone, redone.response.value);
  await button('Guardar', ':is(.assembly-toolbar, .assembly-quickbar)');
  await waitFor('updated source native Save completes', () => ipc.filter(value => value.channel === 'document:save' && value.completed).length === 2);
  const updatedBytes = await fsp.readFile(output), fromDisk = JSON.parse(updatedBytes.toString('utf8'));
  check(canonical(fromDisk) === canonical(updated), 'Actually saved update differs from authenticated Apply/Redo.');
  // Main-process IPC completion precedes the renderer's saved/busy state.
  // Wait for the actual clean controls instead of relying on file-read latency.
  await waitFor('updated source Save reaches clean renderer controls', () => page((panel, apply, name) => {
    const toolbar = [...document.querySelectorAll(':is(.assembly-toolbar, .assembly-quickbar) button')];
    const open = toolbar.find(value => value.textContent.trim() === 'Abrir'), save = toolbar.find(value => value.textContent.trim() === 'Guardar');
    return document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
      && document.querySelector('.assembly-shell-document > strong')?.textContent === name && !document.querySelector(panel)
      && !!open && !open.disabled && !!save && !save.disabled && document.querySelector(apply)?.disabled === true;
  }, PANEL, APPLY, saved.name));
  before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
  const reopened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(reopened.document) === canonical(fromDisk), 'Updated source reopen differs from saved bytes.');
  assertDocument(reopened.document, revision, true); assertScene(reopened.response.value, revision);
  await idle('updated source reopen completes'); record('source/reopened', reopened, reopened.response.value);
  check(dialogCounts().opens === 5 && dialogCounts().saves === 1
    && canonical(ipc.map(value => value.channel)) === canonical(['document:open', 'document:save', 'document:open',
      'document:open', 'document:open', 'document:save', 'document:open']) && ipc.every(value => value.completed), 'Unexpected source-update native file sequence.');
  const observation = await observe();
  check(!consoleErrors.length && !failedRequests.length && !observation.workerErrors.length, 'Source-update renderer/worker failure.');
  checks.push({ sourceUpdateInputSha256: digest(await fsp.readFile(partUpdatePath)), revisedSavedSha256: digest(updatedBytes),
    revisedDocument: fromDisk, stages, independentOracles: 'R2.5 pins V297pi/4,A627pi/8; totalV4800+153pi/2,A2960+675pi/4; V/A1e-5,bounds/translation1e-6,orientationDot1e-8; rank11/DOF1',
    evidenceLimits: 'Actual source-update controls, native review/solve/Apply, one-step Undo/Redo and preload/IPC only; explicit four-face repair. No general correspondence, native UI BRep/probes, human pointer/dialog, linked-file watcher, installed-package or platform claim.' });
};
