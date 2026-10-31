'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original derived fixtures and actual production controls/worker/IPC only.
// Cylinder R2->R2.5,H12 plus a separate 2x2x12 prism; no external CAD input.
module.exports = function replacementWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, replacementFiles, replacementPart, evaluate, observe, waitFor, click, capture,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', SOLVE = 'button[aria-label="Resolver ensamblaje"]';
  const PANEL = '[role="region"][aria-label="Sustituir componente"]';
  const PREVIEW = 'button[aria-label="Resolver sustitución de pieza"]', CANCEL = 'button[aria-label="Cancelar sustitución de pieza"]';
  const LEFT = ['left', 'inner', 'part'], RIGHT = ['right', 'inner', 'part'];
  const source = { id: 'example-pin', revision: 'r1' }, replacementId = 'original-replacement-pin';
  const phases = [], evidence = { scenario: 'original-component-replacement', phases };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + '; actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const near = (actual, wanted, tolerance, label) => {
    check(Array.isArray(actual) && actual.length === wanted.length, label + ' dimensions');
    actual.forEach((value, index) => close(value, wanted[index], tolerance, label + '[' + index + ']'));
  };
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action,
    currentSha256: event.current && digest(canonical(event.current)), document: event.response?.value?.document ?? event.document,
    request: event.request, decisions: event.decisions, response: event.response });
  async function responseAfter(serial, action) {
    return waitFor('actual ' + action + ' after ' + serial, async () => {
      const events = (await observe()).assemblies.filter(value => value.serial > serial && value.action === action);
      check(events.length <= 1, 'Unexpected duplicate request for ' + action);
      const event = events[0]; if (!event?.response) return false;
      check(event.response.ok, event.response.error || 'Actual worker rejected ' + action); return event;
    });
  }
  async function idle(label) {
    await waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
      && !document.querySelector('.assembly-spinner')));
  }
  async function button(label, root = ':is(.assembly-toolbar, .assembly-quickbar)') { await assemblyNavigation.button(label, root);
    await page((label, root) => {
      const values = [...document.querySelectorAll(root + ' button')].filter(value => value.textContent.trim() === label);
      if (values.length !== 1 || values[0].disabled) throw Error('Exact enabled button absent: ' + label); values[0].click();
    }, label, root);
  }
  async function control(selector, value) { await assemblyNavigation.reveal(selector);
    await page((selector, value) => {
      const element = document.querySelector(selector); if (!element || element.disabled) throw Error('Editable control absent: ' + selector);
      if (element instanceof HTMLSelectElement && ![...element.options].some(option => option.value === value)) throw Error('Exact option absent: ' + selector);
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('controlled value reaches ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function recovery(document, label) {
    await waitFor(label + ' exact committed recovery', async () => {
      const content = await page(() => localStorage.getItem('solidflow.autosave'));
      return !!content && canonical(JSON.parse(content)) === canonical(document)
        && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false');
    });
  }
  const identity = () => ({ translation: [0, 0, 0], rotation: [0, 0, 0, 1] });
  const own = (id, name, definition, pose = identity()) => ({ id, name, definition: structuredClone(definition), pose, fixed: true, suppressed: false, visible: true });
  function prismFeatures() {
    return [{ id: 'replacement-line-profile', name: 'Original separate prism profile', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
      profile: { kind: 'rectangle', center: [6, 0], width: 2, height: 2 } },
    { id: 'replacement-line-extrude', name: 'Original separate LINE prism', type: 'extrude', sketchId: 'replacement-line-profile', depth: 12,
      symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'replacement-line-body' } }];
  }
  function resolve(document, occurrencePath) {
    let node = document;
    for (const id of occurrencePath) {
      check(node.kind === 'assembly', 'Saved path traverses a part.');
      const occurrence = node.occurrences.find(value => value.id === id); check(!!occurrence, 'Saved occurrence absent: ' + id);
      node = document.definitions.find(value => canonical([value.id, value.revision]) === canonical([occurrence.definition.id, occurrence.definition.revision]));
      check(!!node, 'Saved exact definition absent.');
    }
    return node;
  }
  function componentBody(scene, path, bodyId) {
    const found = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical(path) && value.body?.bodyId === bodyId);
    check(found.length === 1, 'Exact scoped body absent: ' + JSON.stringify(path) + '/' + bodyId); return found[0];
  }
  function plane(scene, path) {
    const found = componentBody(scene, path, 'pin-body').faces.filter(value => value.support?.kind === 'plane'
      && Math.abs(value.support.point[2] - 12) < 1e-8 && value.support.normal[2] > .99);
    check(found.length === 1, 'One actual top cap required.'); return found[0];
  }
  function axis(scene, path, radius) {
    const found = componentBody(scene, path, 'pin-body').faces.filter(value => value.support?.kind === 'cylinder'
      && Math.abs(value.support.radius - radius) < 1e-8 && Math.hypot(value.support.point[0], value.support.point[1]) < 1e-8);
    check(found.length === 1, 'One actual outer cylinder required.'); return found[0];
  }
  function line(scene, path) {
    const found = (componentBody(scene, path, 'replacement-line-body').edges ?? []).filter(value => value.support?.kind === 'line'
      && Math.abs(Math.abs(value.support.axis[2]) - 1) < 1e-8 && Math.abs(value.support.point[0] - 5) < 1e-8 && Math.abs(value.support.point[1] + 1) < 1e-8);
    check(found.length === 1, 'One actual prism LINE at local X5/Y-1 required.'); return found[0];
  }
  const faceReference = (value, support) => ({ kind: 'face', ...structuredClone(value.selection), support });
  const edgeReference = value => ({ kind: 'edge', ...structuredClone(value.selection), support: 'line' });
  const faceKey = value => JSON.stringify([JSON.stringify([value.selection.component.occurrencePath, value.selection.component.definition.id, value.selection.component.definition.revision]),
    value.selection.body ? [value.selection.body.bodyId, value.selection.body.sourceFeatureId] : null, value.selection.face.sourceFeatureId, value.selection.face.key]);
  function geometry(scene, replaced) {
    check(scene?.kind === 'assembly-scene' && scene.bodies.length === 4 && scene.solidCount === 4, 'Expected four separately placed positive solids.');
    close(scene.volume, 96 + (96 + 27 * replaced) * Math.PI, 1e-5, 'Independent cylinder/prism aggregate volume');
    close(scene.area, 208 + (112 + 16.5 * replaced) * Math.PI, 1e-5, 'Independent cylinder/prism aggregate area');
    for (const path of [LEFT, RIGHT]) {
      const pin = componentBody(scene, path, 'pin-body'), box = componentBody(scene, path, 'replacement-line-body');
      const radius = pin.component.definition.id === replacementId ? 2.5 : 2, x = path[0] === 'left' ? -10 : 10;
      close(pin.volume, 12 * Math.PI * radius * radius, 1e-5, 'Independent cylinder volume');
      close(pin.area, 24 * Math.PI * radius + 2 * Math.PI * radius * radius, 1e-5, 'Independent cylinder area');
      close(box.volume, 48, 1e-6, 'Original separate prism volume'); close(box.area, 104, 1e-6, 'Original prism area');
      near(pin.worldPose.translation, [x, 0, 0], 1e-6, 'Fixed instance translation');
      near(pin.worldPose.rotation, [0, 0, 0, 1], 1e-8, 'Fixed instance orientation');
      near(pin.bounds.min, [x - radius, -radius, 0], 1e-6, 'Independent cylinder minimum');
      near(pin.bounds.max, [x + radius, radius, 12], 1e-6, 'Independent cylinder maximum');
      near(box.bounds.min, [x + 5, -1, 0], 1e-6, 'Independent prism minimum'); near(box.bounds.max, [x + 7, 1, 12], 1e-6, 'Independent prism maximum');
    }
  }
  async function openAssembly(document, name, initial = false) {
    const before = await observe();
    if (initial) {
      await click('button[aria-label="Abrir (Ctrl+O)"]');
      await waitFor('initial discard confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
      await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    } else await button('Abrir');
    const event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(document), name + ' Open changed source bytes.');
    await idle(name + ' Open completes'); await recovery(document, name); record(name, event); return event.response.value;
  }
  async function selectPart() {
    await assemblyNavigation.reveal(await assemblyNavigation.tree.selector('data-assembly-tree-path', JSON.stringify(LEFT)));
    (await assemblyNavigation.panel('components'), await page(() => {
      const found = [...document.querySelectorAll('[role="treeitem"]')].filter(value => value.querySelector('span')?.firstChild?.textContent === 'Original replacement pin');
      if (found.length !== 2 || found.some(value => value.disabled) || found[0].closest('[hidden]')) throw Error('Expected two actual reused pin tree rows and a visible left target.');
      found[0].click();
    }));
    await waitFor('exact selected pin replacement controls', () => page(() => !!document.querySelector('button[aria-label="Elegir pieza sustituta"]') && document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'Original replacement pin'));
    (await assemblyNavigation.panel('properties'), await page(() => {
      const found = [...document.querySelectorAll('.assembly-sidebar details')].filter(value => value.querySelector('summary')?.textContent === 'Sustituir pieza');
      if (found.length !== 1) throw Error('Replacement disclosure absent.'); found[0].open = true;
    }));
  }
  async function unchanged(document, files, label) {
    await recovery(document, label);
    for (const [file, bytes] of files) check((await fsp.readFile(file)).equals(bytes), label + ': input/saved bytes changed.');
    check(await page(selector => document.querySelector(selector)?.disabled === true, APPLY), label + ': review manufactured Apply.');
  }
  async function review(document, mode, embeddedTarget) {
    await selectPart(); await control('select[aria-label="Alcance de sustitución"]', mode);
    const before = await observe();
    if (embeddedTarget) {
      await control('select[aria-label="Pieza sustituta incorporada"]', JSON.stringify([embeddedTarget.id, embeddedTarget.revision]));
      await click('button[aria-label="Revisar sustitución incorporada"]');
    } else await click('button[aria-label="Elegir pieza sustituta"]');
    const event = await responseAfter(before.serial, 'review-assembly-part-replacement'), result = event.response.value;
    check(canonical(event.current) === canonical(document) && event.request.mode === mode && canonical(event.request.component.occurrencePath) === canonical(LEFT)
      && canonical(event.request.component.definition) === canonical(source), 'Review did not use exact current full-path intent.');
    check(result.kind === 'assembly-replacement-review' && !result.hasToken && result.source.id === source.id && result.replacement.id === replacementId,
      'Review manufactured an Apply token or a different source/target.');
    check(result.scopeMap.length === (mode === 'selected' ? 2 : 0) && result.occurrences.length === 1
      && result.expandedPaths.length === (mode === 'selected' ? 1 : 2), 'Selected/all declaration or expansion accounting differs.');
    check(result.endpoints.length === (mode === 'selected' ? 3 : 6) && result.endpoints.every(value => value.status === 'needs-repair' && !value.retainFrame),
      'Expected explicit new-identity face, LINE and axis repair for each affected side.');
    check(result.mechanicalMates.length === 1 && result.mechanicalMates[0].requiresRecapture, 'Changed mechanical source did not require explicit new capture.');
    geometry(result.scene, mode === 'selected' ? 1 : 2);
    await waitFor('replacement panel editable with Solve blocked', () => page((panel, preview) => document.querySelector(panel)?.getAttribute('aria-busy') === 'false'
      && document.querySelector(preview)?.disabled === true, PANEL, PREVIEW));
    record(mode + '/review', event); return event;
  }
  async function repairAndPreview(document, reviewed, mode) {
    const result = reviewed.response.value, originalRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
    for (const endpoint of result.endpoints) {
      const old = endpoint.endpoint, desired = endpoint.desiredComponent;
      let reference;
      if (old.kind === 'edge') reference = edgeReference(line(result.replacementCatalog, ['catalog-part']));
      else reference = faceReference(old.support === 'axis' ? axis(result.replacementCatalog, ['catalog-part'], 2.5) : plane(result.replacementCatalog, ['catalog-part']), old.support);
      reference.component = structuredClone(desired);
      const label = endpoint.locator.mateId + ' ' + endpoint.locator.side;
      await control('select[aria-label="Referencia de sustitución ' + label + '"]', JSON.stringify(reference));
      await click('button[aria-label="Reparar sustitución ' + label + '"]');
    }
    check(await page(selector => document.querySelector(selector)?.disabled === true, PREVIEW), 'Repair alone bypassed explicit mechanical recapture consent.');
    const gear = result.mechanicalMates[0];
    await click('input[aria-label="Recapturar sustitución ' + gear.mateId + '"]');
    await waitFor('explicit repair/recapture decisions enable Solve', () => page(selector => document.querySelector(selector)?.disabled === false, PREVIEW));
    const before = await observe(); await click(PREVIEW);
    const event = await responseAfter(before.serial, 'preview-assembly-part-replacement'), reply = event.response.value;
    check(reply.status === 'ready' && reply.hasToken && canonical(event.current) === canonical(document) && event.reviewId === result.reviewId,
      'Repaired/captured replacement did not receive a fresh native preview.');
    check(event.decisions.repairs.length === result.endpoints.length && event.decisions.recapture.length === 1 && event.decisions.removed.length === 0,
      'Actual request lost explicit repair/recapture decisions.');
    check(reply.checks.length === 4 && reply.checks.every(value => value.satisfied), 'Final native preview omitted/failed a relation.');
    check((await observe()).assemblies.filter(value => value.serial > before.serial && value.action === 'apply-assembly').length === 0,
      'Recapture performed an intermediate Apply.');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === originalRecovery, 'Replacement preview edited committed recovery.');
    geometry(reply.scene, mode === 'selected' ? 1 : 2); await idle(mode + ' preview completes'); record(mode + '/preview', event); return event;
  }
  function assertTransaction(document, baseline, mode, target) {
    check(document.id === baseline.id && document.revision === baseline.revision && document.name === baseline.name, 'Replacement changed root identity.');
    const expectedDefinitions = structuredClone(baseline.definitions);
    if (mode === 'all') expectedDefinitions.find(value => value.id === 'replacement-inner' && value.revision === 'r1').occurrences[0].definition = { id: target.id, revision: target.revision };
    check(canonical(document.definitions.slice(0, baseline.definitions.length)) === canonical(expectedDefinitions),
      'Replacement changed original part data or an unintended assembly declaration.');
    check(resolve(document, LEFT).id === target.id && resolve(document, LEFT).revision === target.revision, 'Selected leaf did not use exact target.');
    check(resolve(document, RIGHT).id === (mode === 'selected' ? source.id : target.id), 'Other reused expansion followed the wrong scope policy.');
    check(document.definitions.length === baseline.definitions.length + (mode === 'selected' ? 3 : 0), 'COW/target definition inventory differs.');
    for (const occurrence of document.occurrences) {
      const old = baseline.occurrences.find(value => value.id === occurrence.id);
      check(canonical({ ...occurrence, definition: old.definition }) === canonical(old), 'Replacement changed occurrence name, pose or flags.');
    }
    for (const path of [LEFT, RIGHT]) for (let depth = 1; depth <= path.length; depth++) {
      const previousNode = depth === 1 ? baseline : resolve(baseline, path.slice(0, depth - 1));
      const nextNode = depth === 1 ? document : resolve(document, path.slice(0, depth - 1));
      const previousOccurrence = previousNode.occurrences.find(value => value.id === path[depth - 1]);
      const nextOccurrence = nextNode.occurrences.find(value => value.id === path[depth - 1]);
      check(canonical({ ...nextOccurrence, definition: previousOccurrence.definition }) === canonical(previousOccurrence),
        'Replacement changed a nested occurrence ID, name, pose or flags.');
    }
    const oldGear = baseline.mates.find(value => value.type === 'gear'), gear = document.mates.find(value => value.type === 'gear');
    check(gear?.id === oldGear.id && canonical(gear.ratio) === canonical(oldGear.ratio) && gear.direction === oldGear.direction && gear.phase === oldGear.phase,
      'Recapture changed the mechanical relation identity or explicit intent.');
    close(gear.angles.first, 0, 1e-8, 'Recaptured first zero'); close(gear.angles.second, 0, 1e-8, 'Recaptured second zero');
    check(document.mates.filter(value => value.type === 'parallel').length === 3, 'Replacement lost an original face/LINE relation.');
  }
  async function applyAndHistory(baseline, preview, mode, target) {
    const before = await observe(); await click(APPLY);
    const event = await responseAfter(before.serial, 'apply-assembly'), document = event.response.value.document;
    check(event.hasToken && event.response.value.kind === 'assembly-applied', 'Replacement Apply did not consume a final capability.');
    const { updatedAt: _previewStamp, ...authenticated } = preview.response.value.document;
    const { updatedAt: _appliedStamp, ...committed } = document;
    check(canonical(authenticated) === canonical(committed), 'Apply changed the authenticated replacement proposal.');
    assertTransaction(document, baseline, mode, target); geometry(event.response.value.scene, mode === 'selected' ? 1 : 2);
    await recovery(document, mode + ' applied'); record(mode + '/applied', event);
    let snapshot = await observe(); await click('button[aria-label="Deshacer ensamblaje"]');
    const undone = await responseAfter(snapshot.serial, 'build-assembly');
    check(canonical(undone.document) === canonical(baseline), 'One Undo did not restore the complete source/ref/COW transaction.');
    geometry(undone.response.value, 0); await recovery(baseline, mode + ' undo'); record(mode + '/undo', undone);
    snapshot = await observe(); await click('button[aria-label="Rehacer ensamblaje"]');
    const redone = await responseAfter(snapshot.serial, 'build-assembly');
    check(canonical(redone.document) === canonical(document), 'Redo did not restore the exact authenticated replacement.');
    geometry(redone.response.value, mode === 'selected' ? 1 : 2); await recovery(document, mode + ' redo'); record(mode + '/redo', redone);
    check((await observe()).assemblies.filter(value => value.serial > before.serial && value.action === 'apply-assembly').length === 1,
      'Replacement required more than one Apply.'); return document;
  }
  return async () => {
    const trackedInput = await fsp.readFile(input), trackedPart = await fsp.readFile(replacementFiles.part);
    const originalPart = structuredClone(expected.definitions.find(value => value.kind === 'part' && value.id === source.id).document);
    originalPart.name = 'Original replacement cylinder and prism'; originalPart.features = [...originalPart.features.slice(0, 2), ...prismFeatures()];
    const targetPart = structuredClone(replacementPart); targetPart.id = replacementId; targetPart.name = 'Original larger replacement cylinder and prism';
    targetPart.features = [...targetPart.features.slice(0, 2), ...prismFeatures()];
    const inner = { kind: 'assembly', id: 'replacement-inner', revision: 'r1', name: 'Original inner group',
      createdAt: expected.createdAt, updatedAt: expected.updatedAt, occurrences: [own('part', 'Original replacement pin', source)], mates: [] };
    const outer = { kind: 'assembly', id: 'replacement-outer', revision: 'r1', name: 'Original outer group',
      createdAt: expected.createdAt, updatedAt: expected.updatedAt, occurrences: [own('inner', 'Original inner occurrence', { id: inner.id, revision: inner.revision })], mates: [] };
    const baseline = { ...structuredClone(expected), id: 'original-replacement-assembly', name: 'Original isolated replacement interaction',
      definitions: [{ kind: 'part', ...source, document: originalPart }, inner, outer],
      occurrences: ['left', 'right'].map((id, index) => own(id, 'Original ' + id + ' group', { id: outer.id, revision: outer.revision }, { translation: [index ? 10 : -10, 0, 0], rotation: [0, 0, 0, 1] })), mates: [] };
    await fsp.writeFile(input, JSON.stringify(baseline)); await fsp.writeFile(replacementFiles.part, JSON.stringify(targetPart));
    evidence.fixtureInputs = { trackedInputSha256: digest(trackedInput), derivedInputSha256: digest(await fsp.readFile(input)),
      trackedPartSha256: digest(trackedPart), derivedPartSha256: digest(await fsp.readFile(replacementFiles.part)) };
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const firstScene = await openAssembly(baseline, 'open/original', true); geometry(firstScene, 0);
    const mated = structuredClone(baseline);
    mated.mates = [LEFT, RIGHT].map(path => ({ id: 'original-top-' + path[0], name: 'Original top ' + path[0], type: 'parallel', suppressed: false,
      first: faceReference(plane(firstScene, path), 'plane'), second: { kind: 'principal-plane', component: null, plane: 'XY' }, alignment: 'aligned' }));
    mated.mates.push({ id: 'original-lines', name: 'Original parallel LINE witnesses', type: 'parallel', suppressed: false,
      first: edgeReference(line(firstScene, LEFT)), second: edgeReference(line(firstScene, RIGHT)), alignment: 'aligned' });
    await fsp.writeFile(replacementFiles.mated, JSON.stringify(mated));
    let scene = await openAssembly(mated, 'open/native-reference-fixture'); geometry(scene, 0);
    let before = await observe(); await click(SOLVE); let event = await responseAfter(before.serial, 'preview-assembly');
    check(event.response.value.status === 'ready' && event.response.value.hasToken, 'Original fixed relations did not solve.'); await idle('original relations ready');
    await control('select[aria-label="Tipo de relación"]', 'gear');
    await waitFor('actual gear capture selectors mounted and editable', () => page(() => ['Eje 1 del engranaje', 'Eje 2 del engranaje', 'Portador del engranaje']
      .every(label => document.querySelector('select[aria-label="' + label + '"]')?.disabled === false)));
    await control('select[aria-label="Eje 1 del engranaje"]', faceKey(axis(scene, LEFT, 2)));
    await control('select[aria-label="Eje 2 del engranaje"]', faceKey(axis(scene, RIGHT, 2)));
    await control('input[aria-label="Nombre del engranaje"]', 'Original replacement gear');
    await control('input[aria-label="Numerador del engranaje"]', '1'); await control('input[aria-label="Denominador del engranaje"]', '1');
    await control('select[aria-label="Portador del engranaje"]', 'scope');
    await control('select[aria-label="Sentido del engranaje"]', 'opposed'); await control('input[aria-label="Desfase del seguidor en grados"]', '0');
    await waitFor('actual selected cylinder axes enable capture', () => page(() => document.querySelector('button[aria-label="Capturar engranaje"]')?.disabled === false));
    before = await observe(); await click('button[aria-label="Capturar engranaje"]'); event = await responseAfter(before.serial, 'capture-assembly-gear');
    check(event.response.value.status === 'ready' && event.response.value.hasToken && event.response.value.document.mates.length === 4, 'Original actual gear capture failed.');
    record('original/gear-captured', event); await idle('original gear capture ready');
    before = await observe(); await click(APPLY); event = await responseAfter(before.serial, 'apply-assembly');
    const saved = event.response.value.document; geometry(event.response.value.scene, 0); await recovery(saved, 'original captured baseline'); record('original/gear-applied', event);
    const untouched = [[input, await fsp.readFile(input)], [replacementFiles.mated, await fsp.readFile(replacementFiles.mated)], [replacementFiles.part, await fsp.readFile(replacementFiles.part)]];
    const cancelled = await review(saved, 'selected'); await unchanged(saved, untouched, 'review before cancel');
    before = await observe(); await click(CANCEL);
    const discarded = await responseAfter(before.serial, 'discard-assembly-part-replacement');
    check(discarded.reviewId === cancelled.response.value.reviewId, 'Completed review cancellation discarded another review.');
    record('selected/cancel-completed-review', discarded); await idle('review cancellation');
    await waitFor('review cancellation removes panel', () => page(panel => !document.querySelector(panel), PANEL));
    await unchanged(saved, untouched, 'cancelled review');
    const reviewed = await review(saved, 'selected');
    check(reviewed.response.value.reviewId !== cancelled.response.value.reviewId, 'Canceled review identity was reused.');
    const preview = await repairAndPreview(saved, reviewed, 'selected');
    const selected = await applyAndHistory(saved, preview, 'selected', reviewed.response.value.replacement);
    await button('Guardar como'); await waitFor('selected Save As IPC completes', () => ipc.filter(value => value.channel === 'document:save' && value.completed).length === 1);
    const selectedBytes = await fsp.readFile(output); check(canonical(JSON.parse(selectedBytes.toString('utf8'))) === canonical(selected), 'Saved selected transaction changed.');
    await idle('selected Save As'); await openAssembly(selected, 'selected/reopen');
    const allInput = structuredClone(saved), target = selected.definitions.find(value => value.kind === 'part' && value.id === replacementId);
    allInput.definitions.push(structuredClone(target)); await fsp.writeFile(replacementFiles.allInput, JSON.stringify(allInput));
    await openAssembly(allInput, 'all/open-existing-target');
    const allReviewed = await review(allInput, 'all', target), allPreview = await repairAndPreview(allInput, allReviewed, 'all');
    const allDocument = await applyAndHistory(allInput, allPreview, 'all', target);
    await button('Guardar como'); await waitFor('all Save As IPC completes', () => ipc.filter(value => value.channel === 'document:save' && value.completed).length === 2);
    const allBytes = await fsp.readFile(replacementFiles.allOutput); check(canonical(JSON.parse(allBytes.toString('utf8'))) === canonical(allDocument), 'Saved all transaction changed.');
    await idle('all Save As'); scene = await openAssembly(allDocument, 'all/reopen'); geometry(scene, 2);
    check((await fsp.readFile(output)).equals(selectedBytes), 'All operation changed the earlier selected output.');
    for (const [file, bytes] of untouched) check((await fsp.readFile(file)).equals(bytes), 'Replacement changed original input bytes.');
    check(dialogCounts().opens === 7 && dialogCounts().saves === 2 && ipc.every(value => value.completed), 'Unexpected native document dialog/IPC sequence.');
    const observation = await observe(); check(!observation.workerErrors.length && !consoleErrors.length && !failedRequests.length, 'Replacement production renderer/worker failure.');
    check(protocolResponses.some(value => value.url.includes('kernel.worker') && value.status === 200) && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Real worker/WASM were not observed.');
    await capture(allDocument);
    evidence.saved = { selectedSha256: digest(selectedBytes), allSha256: digest(allBytes) };
    evidence.independentOracles = 'Two native components each cylinderR2,H12 + separate2x2x12prism; oldV96+96pi,A208+112pi; oneR2.5 V96+123pi,A208+128.5pi; bothR2.5 V96+150pi,A208+145pi; V/A1e-5,bounds1e-6,rotation1e-8; two-level reused COW selected vs all; explicit top-plane,LINE,axis repair + actual gear recapture; one replacementApply each; oneUndo/Redo and saved exact reopen';
    evidence.evidenceLimits = 'Scripted production controls, actual native worker and preload/IPC. No injected React/model/CAD responses; test-owned source files authored before normal Open. No human pointer/native-dialog, general correspondence, other mechanical families, installer or platform claim.';
  };
};
