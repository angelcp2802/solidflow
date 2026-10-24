'use strict';
const fsp = require('node:fs/promises');

// Real controls, native replies and isolated file IPC. The same original
// plate/two-pin fixture is mounted afresh; no saved mate or pose is injected.
module.exports = async function gearWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, gearOutput, observe, waitFor, click, capture, pointer,
    button, control, page, idle, responseAfter, addRelation, face, faceKey, checks,
    ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', SOLVE = 'button[aria-label="Resolver ensamblaje"]';
  const MOVE = 'button[aria-label="Vista previa del movimiento"]';
  const phases = [], gestures = [], originalBytes = await fsp.readFile(input);
  // Retain actual completed phases even if a later assertion rejects the flow.
  const evidence = { gearInputSha256: digest(originalBytes), phases, gestures };
  checks.push(evidence);
  const rad = value => value * Math.PI / 180;
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action,
    current: event.current, proposed: event.proposed, hasToken: event.hasToken,
    document: event.response.value?.document ?? event.document, response: event.response.value });
  const gear = document => {
    const matches = document.mates.filter(value => value.type === 'gear');
    check(matches.length === 1, 'Expected exactly one original angular coupling.'); return matches[0];
  };
  function geometry(scene) {
    check(scene?.solidCount === 3 && scene.prototypeCount === 2 && scene.bodies.length === 3,
      'Gear operation lost independently placed original bodies.');
    close(scene.volume, 4800 + 45 * Math.PI / 2, 1e-5, 'Original mechanism native volume');
    close(scene.area, 2960 + 543 * Math.PI / 4, 1e-5, 'Original mechanism native area');
    near(scene.bounds.min, [-20, -15, -8], 1e-6, 'Original mechanism minimum');
    near(scene.bounds.max, [20, 15, 4], 1e-6, 'Original mechanism maximum');
    for (const id of ['left', 'right']) {
      const body = scene.bodies.find(value => canonical(value.component.occurrencePath) === canonical([id]));
      near(body.worldPose.translation, [id === 'left' ? -10 : 10, 0, -8], 1e-6, id + ' retained bearing center');
      const cylinder = body.faces.find(value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - 2) < 1e-10);
      check(cylinder?.worldSupport?.kind === 'cylinder', 'Missing actual native shaft support.');
      near(cylinder.worldSupport.axis, [0, 0, -1], 1e-8, id + ' retained directed native shaft axis');
    }
  }
  function marker(scene, id) {
    const body = scene.bodies.find(value => canonical(value.component.occurrencePath) === canonical([id]));
    const bores = body.faces.filter(value => value.support?.kind === 'cylinder' && Math.abs(value.support.radius - .25) < 1e-10);
    check(bores.length === 1 && bores[0].worldSupport?.kind === 'cylinder', 'Missing independent eccentric native marker.');
    const vector = bores[0].worldSupport.point.map((value, i) => value - body.worldPose.translation[i]);
    close(Math.hypot(vector[0], vector[1]), 1, 1e-6, id + ' eccentric marker radius');
    return vector;
  }
  function assertTurn(before, after, id, angle) {
    const a = marker(before, id), b = marker(after, id);
    near([b[0], b[1]], [a[0] * Math.cos(angle) - a[1] * Math.sin(angle),
      a[0] * Math.sin(angle) + a[1] * Math.cos(angle)], 1e-6, id + ' independent marker rotation');
  }
  function delta(before, after, id) {
    const a = marker(before, id), b = marker(after, id);
    return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
  }
  function ready(event, count, dof) {
    const value = event.response.value;
    check(value?.status === 'ready' && value.hasToken && value.document.mates.length === count,
      'Expected a fresh native mechanical preview.');
    const active = value.document.mates.filter(mate => !mate.suppressed);
    check(value.checks.length === active.length && value.checks.every(value => value.satisfied)
      && active.every(mate => value.checks.some(check => check.constraintId === JSON.stringify([[], mate.id]))),
      'A mechanical preview omitted or failed a fresh native relation.');
    if (dof !== undefined) check(value.scopes.length === 1 && value.scopes[0].result.localDOF === dof,
      'Mechanical mobility differs from the independent bearing/coupling count.');
    geometry(value.scene); return value;
  }
  async function apply(event, name) {
    const proposed = event.response.value.document;
    await idle(name + ' preview completes');
    await waitFor(name + ' enables Apply', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY));
    const before = await observe(); await click(APPLY); const applied = await responseAfter(before.serial, 'apply-assembly');
    check(applied.hasToken && applied.response.value.kind === 'assembly-applied', 'Mechanical Apply lost worker capability.');
    const { updatedAt: _before, ...a } = proposed, { updatedAt: _after, ...b } = applied.response.value.document;
    check(canonical(a) === canonical(b), 'Mechanical Apply rewrote the authenticated proposal.');
    await idle(name + ' Apply completes');
    await waitFor(name + ' reaches recovery', async () => canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave'))))
      === canonical(applied.response.value.document));
    record(name + '/applied', applied); return applied.response.value;
  }
  async function select(id) {
    const name = expected.occurrences.find(value => value.id === id).name;
    (await assemblyNavigation.panel('components'), await page(name => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Expected exact original shaft tree row.'); rows[0].click();
    }, name));
    await waitFor('selected shaft movement controls', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name
      && !!document.querySelector('button[aria-label="Vista previa del movimiento"]'), name));
  }
  async function move(base, degrees, id, name) {
    await select(id);
    const pose = base.document.occurrences.find(value => value.id === id).pose;
    for (const [index, axis] of ['X', 'Y', 'Z'].entries()) await control('input[aria-label="Destino local ' + axis + ' del componente"]', String(pose.translation[index]));
    await control('select[aria-label="Eje local del movimiento"]', '2');
    await control('input[aria-label="Giro local del movimiento en grados"]', String(degrees));
    const recovery = await page(() => localStorage.getItem('solidflow.autosave')), before = await observe();
    await click(MOVE); const event = await responseAfter(before.serial, 'move-assembly-component-motion');
    check(canonical(event.current) === canonical(base.document), 'Mechanical movement used another committed base.');
    const result = ready(event, 5, gear(base.document).suppressed ? 1 : 0);
    check(result.movement?.temporaryAnchor && result.movement.lengthResidual <= 1e-6 && result.movement.angleResidual <= 1e-8,
      'Mechanical target did not receive a fresh bounded native witness.');
    check(canonical(event.motion.component) === canonical({ occurrencePath: [id], definition: base.document.occurrences.find(value => value.id === id).definition })
      && event.motion.rotation.axis === 2, 'Mechanical motion lost its exact target or signed axis.');
    close(event.motion.rotation.angle, rad(degrees), 1e-12, 'Typed mechanical winding request');
    assertTurn(base.scene, result.scene, id, rad(degrees));
    await idle(name + ' movement completes');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === recovery, 'Mechanical preview changed committed recovery.');
    record(name, event); return event;
  }
  async function recovery(document, name) {
    await waitFor(name + ' exact idle history state', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
      && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  async function edit(base, numerator, denominator, direction, offset, name) {
    await click('button[aria-label="Editar engranaje ' + gear(base.document).name + '"]');
    await waitFor(name + ' editor reflects the current gear', () => page((numerator, denominator) => {
      const first = document.querySelector('input[aria-label="Numerador del engranaje"]');
      const second = document.querySelector('input[aria-label="Denominador del engranaje"]');
      return first?.disabled === false && second?.disabled === false && first.value === numerator && second.value === denominator;
    }, String(gear(base.document).ratio.numerator), String(gear(base.document).ratio.denominator)));
    await control('input[aria-label="Numerador del engranaje"]', String(numerator));
    await control('input[aria-label="Denominador del engranaje"]', String(denominator));
    await control('select[aria-label="Sentido del engranaje"]', direction);
    await control('input[aria-label="Desfase del seguidor en grados"]', String(offset));
    const before = await observe(); await click('button[aria-label="Vista previa del engranaje"]');
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 5, 1);
    const old = gear(base.document), next = gear(result.document);
    check(next.id === old.id && canonical(next.neutralRotations) === canonical(old.neutralRotations)
      && canonical(next.first) === canonical(old.first) && canonical(next.second) === canonical(old.second)
      && canonical(next.carrier) === canonical(old.carrier), 'Editing a ratio recaptured neutral frames or replaced exact identity.');
    check(next.ratio.numerator === numerator && next.ratio.denominator === denominator && next.direction === direction,
      'Actual gear edit parameters differ from the controls.');
    const sign = direction === 'opposed' ? 1 : -1;
    close(next.phase, sign * denominator / Math.max(numerator, denominator) * rad(offset), 1e-10, 'Human follower offset conversion');
    record(name + '/preview', event); return apply(event, name);
  }

  let before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
  let opened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(opened.document) === canonical(expected), 'Gear scenario did not reopen the untouched original fixture.');
  await idle('original gear mechanism opens');
  let committed = { document: opened.document, scene: opened.response.value }, scene = committed.scene;
  for (const [id, x, axisDof, capDof, count] of [['left', -10, 8, 7, 1], ['right', 10, 3, 2, 3]]) {
    const pin = face(scene, id, 'cylinder', 0, 2), hole = face(scene, 'plate', 'cylinder', x, 3);
    const alignment = pin.support.axis[2] * hole.support.axis[2] > 0 ? 'aligned' : 'opposed';
    committed = await addRelation(scene, 'Eje ' + id, 'concentric', pin, hole, axisDof, count, alignment); scene = committed.scene;
    committed = await addRelation(scene, 'Tope ' + id, 'coincident', face(scene, id, 'plane', 12), face(scene, 'plate', 'plane', 4), capDof, count + 1); scene = committed.scene;
  }
  before = await observe(); await click(SOLVE); let event = await responseAfter(before.serial, 'preview-assembly');
  ready(event, 4, 2); await idle('fresh bearing preview for angular capture');
  await control('select[aria-label="Tipo de relación"]', 'gear');
  await waitFor('gear capture selectors are mounted and editable', () => page(() => ['Eje 1 del engranaje', 'Eje 2 del engranaje', 'Portador del engranaje']
    .every(label => document.querySelector('select[aria-label="' + label + '"]')?.disabled === false)));
  await control('select[aria-label="Eje 1 del engranaje"]', faceKey(face(scene, 'left', 'cylinder', 0, 2)));
  await control('select[aria-label="Eje 2 del engranaje"]', faceKey(face(scene, 'right', 'cylinder', 0, 2)));
  await control('select[aria-label="Portador del engranaje"]', JSON.stringify(['plate']));
  await control('input[aria-label="Nombre del engranaje"]', 'Acoplamiento original');
  await control('input[aria-label="Numerador del engranaje"]', '1');
  await control('input[aria-label="Denominador del engranaje"]', '2');
  await control('select[aria-label="Sentido del engranaje"]', 'opposed');
  await waitFor('exact selected native axes enable capture', () => page(() => document.querySelector('button[aria-label="Capturar engranaje"]')?.disabled === false));
  const captureRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
  await control('input[aria-label="Numerador del engranaje"]', '0'); before = await observe();
  await click('button[aria-label="Capturar engranaje"]');
  await waitFor('zero gear ratio is rejected by the actual editor', () => page(() => document.querySelector('[aria-label="Engranaje"] [role="alert"]')?.textContent.includes('positivos')));
  check((await observe()).serial === before.serial && await page(() => localStorage.getItem('solidflow.autosave')) === captureRecovery,
    'Rejected gear parameter entered CAD or changed committed recovery.');
  phases.push({ phase: 'gear/zero-ratio-editor-rejection', action: 'ui-parameter-rejection', serial: before.serial });
  await control('input[aria-label="Numerador del engranaje"]', '1');
  before = await observe(); await click('button[aria-label="Capturar engranaje"]');
  event = await responseAfter(before.serial, 'capture-assembly-gear'); let result = ready(event, 5, 1);
  check(event.hasToken && canonical(gear(result.document).carrier) === canonical({ occurrencePath: ['plate'], definition: expected.occurrences[0].definition }),
    'Native capture did not use the exact current carrier and capability.');
  close(gear(result.document).angles.first, 0, 1e-8, 'Fresh first angular zero');
  close(gear(result.document).angles.second, 0, 1e-8, 'Fresh second angular zero');
  record('gear/captured-1-to-2', event); committed = await apply(event, 'gear/capture'); const neutral = committed;

  await select('left'); await control('input[aria-label="Destino local X del componente"]', '-9');
  const rejectedRecovery = await page(() => localStorage.getItem('solidflow.autosave')); before = await observe();
  await click(MOVE); event = await responseAfter(before.serial, 'move-assembly-component-motion');
  check(event.response.value.status === 'rejected' && !event.response.value.hasToken, 'Incompatible bearing displacement received a gear preview.');
  await idle('incompatible mechanical displacement rejects');
  check(await page(() => localStorage.getItem('solidflow.autosave')) === rejectedRecovery
    && await page(selector => document.querySelector(selector)?.disabled === true, APPLY), 'Rejected mechanical displacement changed recovery or enabled Apply.');
  record('gear/incompatible-lateral-displacement', event);

  event = await move(committed, 60, 'left', 'gear/preview-cancel'); result = event.response.value;
  assertTurn(committed.scene, result.scene, 'right', rad(-30));
  before = await observe(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
  const cancelled = await responseAfter(before.serial, 'discard-assembly');
  check(cancelled.hasToken, 'Gear movement Cancel did not discard the capability.'); await recovery(neutral.document, 'gear Cancel');
  record('gear/cancelled', cancelled);
  event = await move(committed, 60, 'left', 'gear/preview-60-minus30');
  assertTurn(committed.scene, event.response.value.scene, 'right', rad(-30));
  close(gear(event.response.value.document).angles.first, rad(-60), 1e-8, 'Driven lifted angle about native -Z');
  close(gear(event.response.value.document).angles.second, rad(30), 1e-8, 'Follower lifted angle about native -Z');
  committed = await apply(event, 'gear/move-60'); const moved = committed;
  await click('button[aria-label="Deshacer ensamblaje"]'); await recovery(neutral.document, 'single gear movement Undo');
  await click('button[aria-label="Rehacer ensamblaje"]'); await recovery(moved.document, 'single gear movement Redo');
  await click('button[aria-label="Deshacer ensamblaje"]'); await recovery(neutral.document, 'restore neutral before ratio edit'); committed = neutral;
  committed = await edit(committed, 2, 1, 'opposed', 0, 'gear/edit-two-to-one');
  event = await move(committed, 120, 'left', 'gear/preview-follower-beyond-half-turn');
  assertTurn(committed.scene, event.response.value.scene, 'right', rad(-240));
  close(gear(event.response.value.document).angles.first, rad(-120), 1e-8, 'First lifted branch about native -Z');
  close(gear(event.response.value.document).angles.second, rad(240), 1e-8, 'Follower +240-degree native-axis branch, not principal -120');
  committed = await apply(event, 'gear/move-120');

  const priorAngles = { ...gear(committed.document).angles };
  before = await observe(); await click('input[aria-label="Activar Acoplamiento original"]');
  event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 5, 2);
  check(gear(event.response.value.document).suppressed, 'Gear suppression bypassed preview or failed.');
  committed = await apply(event, 'gear/suppress');
  event = await move(committed, 90, 'right', 'gear/independent-suppressed-spin');
  close(gear(event.response.value.document).angles.first, priorAngles.first, 1e-8, 'Suppression retains first lifted branch');
  close(gear(event.response.value.document).angles.second, priorAngles.second - rad(90), 1e-8, 'Suppressed gear tracks independent rotation about native -Z');
  committed = await apply(event, 'gear/suppressed-spin');
  before = await observe(); await click('input[aria-label="Activar Acoplamiento original"]');
  event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 5, 1);
  check(!gear(event.response.value.document).suppressed, 'Gear reactivation failed.');
  committed = await apply(event, 'gear/reactivate');

  // Chromium input operates the real Z ring. Independent eccentric native
  // markers verify the linked rotations; no scene or target result is supplied.
  await select('left'); await button('Superior', '.assembly-view-tools'); await click('button[aria-label="Arrastrar giro"]');
  await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  const bounds = committed.scene.visibleBounds, span = Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis]));
  const centerWorld = bounds.min.map((value, i) => (value + bounds.max[i]) / 2), p = committed.document.occurrences.find(value => value.id === 'left').pose.translation;
  const pixels = rect.height / (span * 1.3), center = { x: rect.x + rect.width / 2 + (p[0] - centerWorld[0]) * pixels,
    y: rect.y + rect.height / 2 - (p[1] - centerWorld[1]) * pixels + (p[2] - centerWorld[2]) * .0001 * pixels };
  let handle;
  for (const scale of [1, .9, 1.1]) {
    for (let angle = .3; angle < 2 * Math.PI; angle += .2) {
      const radius = rect.height * .1125 * scale, point = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
      if (point.x < rect.x || point.x >= rect.x + rect.width || point.y < rect.y || point.y >= rect.y + rect.height) continue;
      await pointer('mouseMoved', point);
      if (await page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-drag-axis')) === 'Z') { handle = point; break; }
    }
    if (handle) break;
  }
  check(!!handle, 'Actual gear manipulator did not expose its Z ring.'); before = await observe();
  await pointer('mousePressed', handle, 1);
  await waitFor('gear gesture blocks file/Apply operations', () => page(selector => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'true'
    && document.querySelector(selector)?.disabled === true && [...document.querySelectorAll(':is(.assembly-toolbar, .assembly-quickbar) button')].find(value => value.textContent.trim() === 'Guardar')?.disabled === true, APPLY));
  const points = [];
  for (const fraction of [1 / 3, 2 / 3, 1]) {
    const angle = .3 * fraction, dx = handle.x - center.x, dy = handle.y - center.y;
    const point = { x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle) };
    await pointer('mouseMoved', point, 1); points.push(point);
  }
  await pointer('mouseReleased', points.at(-1), 0); await idle('gear gesture receives latest native projection');
  const streamed = (await observe()).assemblies.filter(value => value.serial > before.serial && value.action === 'project-assembly-component');
  check(streamed.length >= 1 && streamed.length <= 3 && streamed.every(value => value.response?.ok && canonical(value.current) === canonical(committed.document)),
    'Gear gesture exceeded stream bounds or used another committed source.');
  event = streamed.at(-1); result = ready(event, 5, 1);
  const firstDelta = delta(committed.scene, result.scene, 'left'), secondDelta = delta(committed.scene, result.scene, 'right');
  check(Math.abs(firstDelta) > .01 && Math.abs(firstDelta) < .5, 'Gear pointer did not produce the intended local spin.');
  close(secondDelta, -2 * firstDelta, 1e-8, 'Real pointer follower ratio from independent native markers');
  gestures.push({ down: handle, moves: points, firstDelta, secondDelta, workerSerials: streamed.map(value => value.serial) });
  record('gear/pointer-linked-spin', event); committed = await apply(event, 'gear/pointer');

  // Edit sign and phase at the end, then verify the fresh scalar relation and
  // preservation of captured origins instead of assuming a particular solve.
  committed = await edit(committed, 1, 2, 'same', 15, 'gear/edit-direction-and-phase');
  const windingBase = committed;
  function winding(event) {
    const value = event.response.value, witness = value.motion;
    check(witness?.sampledOnly === true && witness.axis === 2 && witness.stationCount === 12
      && witness.verifiedStations === 12 && witness.windingTolerance === 1e-8,
      'Full-turn motion omitted its measured station/winding boundary.');
    close(witness.requestedAngle, 4 * Math.PI, 1e-12, 'Two-turn requested winding');
    close(witness.evaluatedAngle, 4 * Math.PI, 1e-8, 'Two-turn evaluated driver winding');
    check(witness.windingResidual <= witness.windingTolerance && witness.maxAngularStep <= Math.PI / 3 + 1e-12,
      'Full-turn continuation exceeded its angular policy.');
    close(gear(value.document).angles.first - gear(windingBase.document).angles.first, -4 * Math.PI, 1e-8,
      'Two turns retained about the actual native first -Z axis');
    close(gear(value.document).angles.second - gear(windingBase.document).angles.second, -2 * Math.PI, 1e-8,
      'Same-direction half-speed follower retained its full native turn');
    assertTurn(windingBase.scene, value.scene, 'left', 0);
    assertTurn(windingBase.scene, value.scene, 'right', 0);
    return value;
  }
  event = await move(committed, 720, 'left', 'gear/winding-720-preview-cancel'); winding(event);
  await waitFor('actual winding summary reports requested/evaluated turns and verified stations', () => page(() =>
    document.querySelector('[aria-label="Giro solicitado del movimiento"]')?.textContent.includes('720° · 2 vueltas')
    && document.querySelector('[aria-label="Giro evaluado del movimiento"]')?.textContent.includes('720° · 2 vueltas')
    && document.querySelector('[aria-label="Estaciones del movimiento"]')?.textContent.includes('12 de 12 estaciones verificadas')
    && document.querySelector('[aria-label="Error de continuación angular"]')?.textContent.includes('rad')));
  before = await observe(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
  const windingCancelled = await responseAfter(before.serial, 'discard-assembly');
  check(windingCancelled.hasToken, 'Full-turn Cancel did not revoke the final capability.');
  await recovery(windingBase.document, 'full-turn Cancel');
  check(await page(() => document.querySelector('input[aria-label="Giro local del movimiento en grados"]')?.value) === '720',
    'Cancel unexpectedly discarded the typed winding intent.');
  record('gear/winding-720-cancelled', windingCancelled);
  event = await move(committed, 720, 'left', 'gear/winding-720-preview-apply'); winding(event);
  committed = await apply(event, 'gear/winding-720'); const wound = committed;
  await waitFor('full-turn Apply clears the incremental angle despite matching final poses', () => page(() =>
    document.querySelector('input[aria-label="Giro local del movimiento en grados"]')?.value === '0'));
  before = await observe(); await click('button[aria-label="Deshacer ensamblaje"]');
  const windingUndo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(windingUndo.document) === canonical(windingBase.document), 'One Undo did not restore all pre-winding angles and poses.');
  await recovery(windingBase.document, 'one full-turn Undo'); record('gear/winding-720-undo', windingUndo);
  before = await observe(); await click('button[aria-label="Rehacer ensamblaje"]');
  const windingRedo = await responseAfter(before.serial, 'build-assembly');
  check(canonical(windingRedo.document) === canonical(wound.document), 'One Redo did not restore the complete full-turn transaction.');
  await recovery(wound.document, 'one full-turn Redo'); record('gear/winding-720-redo', windingRedo);
  await select('left');
  await control('select[aria-label="Eje local del movimiento"]', '0');
  await control('input[aria-label="Giro local del movimiento en grados"]', '360');
  const fullTurnRecovery = await page(() => localStorage.getItem('solidflow.autosave')); before = await observe();
  await click(MOVE); event = await responseAfter(before.serial, 'move-assembly-component-motion');
  check(event.motion.rotation.axis === 0 && event.motion.rotation.angle === 2 * Math.PI
    && event.response.value.status === 'rejected' && !event.response.value.hasToken,
    'A full X turn bypassed its incompatible intermediate bearing poses.');
  await recovery(wound.document, 'incompatible full-turn rejection');
  check(await page(() => localStorage.getItem('solidflow.autosave')) === fullTurnRecovery
    && await page(selector => document.querySelector(selector)?.disabled === true, APPLY),
    'Rejected full-turn motion committed a partial station or enabled Apply.');
  record('gear/winding-360-X-rejected', event);
  await control('select[aria-label="Eje local del movimiento"]', '2');
  await control('input[aria-label="Giro local del movimiento en grados"]', '0');
  const finalGear = gear(committed.document);
  close(.5 * finalGear.angles.first - finalGear.angles.second - finalGear.phase, 0, 1e-8, 'Edited signed weighted phase');
  before = await observe(); await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)');
  await waitFor('actual gear file write completes', () => dialogCounts().saves === 4 && ipc.filter(value => value.channel === 'document:save' && value.completed).length === 7);
  await idle('gear Save As completes'); const bytes = await fsp.readFile(gearOutput), saved = JSON.parse(bytes.toString('utf8'));
  check(canonical(saved) === canonical(committed.document), 'Saved gear bytes differ from the authenticated committed result.');
  before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); opened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(opened.document) === canonical(saved), 'Gear reopen lost ratio, neutral rotations, winding or references.');
  await idle('gear file reopens'); geometry(opened.response.value);
  before = await observe(); await click(SOLVE); event = await responseAfter(before.serial, 'preview-assembly'); result = ready(event, 5, 1);
  close(gear(result.document).angles.first, finalGear.angles.first, 1e-8, 'Reopened first lift');
  close(gear(result.document).angles.second, finalGear.angles.second, 1e-8, 'Reopened second lift');
  record('gear/reopened-fresh-solve', event);
  before = await observe(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
  await responseAfter(before.serial, 'discard-assembly'); await recovery(saved, 'final gear preview cancellation');
  check((await fsp.readFile(input)).equals(originalBytes) && (await fsp.readFile(gearOutput)).equals(bytes), 'Gear workflow changed original input or cancelled saved bytes.');
  check(dialogCounts().opens === 15 && dialogCounts().saves === 4 && dialogCounts().csvExports === 4,
    'Unexpected gear native file-dialog count.');
  check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'Gear interaction reported console/request/worker failures.');
  await capture(saved);
  const observed = (await observe()).assemblies;
  const workerCounts = Object.fromEntries([...new Set(observed.map(value => value.action))].map(action => [action, observed.filter(value => value.action === action).length]));
  const sourceRejections = checks.flatMap(value => value && typeof value === 'object' && value.sourceUpdateInputSha256
    ? value.stages.filter(stage => stage.phase === 'source/rejected-unrepaired') : []);
  check(sourceRejections.length === 1, 'Expected one explicitly checked incomplete source-repair rejection.');
  const expectedRejection = sourceRejections[0], rejected = observed.filter(value => value.response?.ok !== true);
  check(rejected.length === 1 && expectedRejection.action === 'preview-assembly-part-update'
    && expectedRejection.rpcError === 'Quedan referencias de la pieza pendientes de reparación.'
    && typeof expectedRejection.reviewId === 'string' && rejected[0].serial === expectedRejection.serial
    && rejected[0].action === expectedRejection.action && rejected[0].reviewId === expectedRejection.reviewId
    && digest(canonical(rejected[0].current)) === expectedRejection.currentSha256
    && digest(canonical(rejected[0].proposed)) === expectedRejection.proposedSha256
    && rejected[0].response.ok === false && rejected[0].response.error === expectedRejection.rpcError
    && !rejected[0].response.value, 'Only the exact recorded incomplete private source repair may reject.');
  check(observed.every(value => value === rejected[0] || value.response?.ok === true), 'An unexpected assembly request failed or did not complete.');
  Object.assign(evidence, { gearSavedSha256: digest(bytes), savedDocument: saved, workerCounts,
    independentOracles: 'Original plate/pin formulas; native eccentric radius1 bore markers rotated with sin/cos; world/local Z opposite1:2 +60/-30 and opposite2:1 +120/-240; selected native axes are -Z, so lifted angles have opposite signs (-120/+240); same1:2 +720 driver produces native deltas -4pi/-2pi and unchanged physical endpoints; incompatible360X must reject intermediate stations; DOF2->1->2->1; metrics1e-5, centers1e-6, angles1e-8.',
    evidenceLimits: 'Real hidden production renderer/native worker/file IPC with substituted isolated native-dialog paths. Explicit numeric winding verifies bounded stations only, not a continuous trajectory or collision-free rotation. No installed reference runtime, gear teeth/contact simulation, continuous multi-turn gesture, flexible assemblies, installed-package or platform claim.' });
};
