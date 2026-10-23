'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Scripted real controls and read-only observations; never seeds React state,
// document contents, solver poses, IPC results or native-reference authority.
module.exports = function assemblyWorkflow(context) {
  const { expected, input, output, projectionOutput, partUpdatePath, updatedPart, interferencePath, interferenceFixture, translationPath, translationFixture, translationOutput, bomPath, bomFixture, bomCsvOutputs, gearOutput, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts } = context;
  const SOLVE = 'button[aria-label="Resolver ensamblaje"]';
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]';
  const FACE = 'select[aria-label="Cara de referencia"]';
  const phases = [], selections = [], relations = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, desired, tolerance, message) => check(Number.isFinite(actual) && Math.abs(actual - desired) < tolerance,
    message + '; actual=' + actual + ', expected=' + desired + ', tolerance=' + tolerance);
  const near = (actual, desired, tolerance, message) => {
    check(Array.isArray(actual) && actual.length === desired.length, message + ' dimensions');
    actual.forEach((value, index) => close(value, desired[index], tolerance, message + '[' + index + ']'));
  };
  const partId = path => path === 'plate' ? 'example-plate' : 'example-pin';
  function assertDocument(document, mateCount) {
    check(document.version === 2 && document.kind === 'assembly' && document.id === expected.id
      && document.revision === expected.revision && document.name === expected.name && document.units === 'mm'
      && document.createdAt === expected.createdAt, 'Unexpected assembly identity/units/source metadata.');
    check(canonical(document.definitions) === canonical(expected.definitions), 'A reused original part definition changed.');
    check(document.occurrences.length === 3 && document.occurrences.map(value => value.id).join('|') === 'plate|left|right',
      'Occurrence identities/order changed or a shared prototype was fused.');
    document.occurrences.forEach((value, index) => {
      const original = expected.occurrences[index];
      check(value.name === original.name && canonical(value.definition) === canonical(original.definition)
        && value.fixed === original.fixed && value.visible === original.visible && value.suppressed === original.suppressed,
        'Saved occurrence identity/source/role changed.');
    });
    check(canonical(document.occurrences[0].pose) === canonical(expected.occurrences[0].pose), 'The fixed plate moved.');
    check(document.mates.length === mateCount && new Set(document.mates.map(value => value.id)).size === mateCount,
      'Unexpected mate count or reused creation identity.');
    check(document.mates.every(value => typeof value.id === 'string' && value.id.length > 0 && !value.suppressed),
      'A created mate lost its opaque identity or active state.');
  }
  function assertScene(scene, final = false, document) {
    check(scene?.kind === 'assembly-scene' && scene.bodies.length === 3 && scene.solidCount === 3
      && scene.prototypeCount === 2 && scene.warnings.length === 0, 'Expected three independent placed solids from two prototypes.');
    close(scene.volume, 4800 + 45 * Math.PI / 2, 1e-5, 'Assembly volume sum');
    close(scene.area, 2960 + 543 * Math.PI / 4, 1e-5, 'Assembly area sum');
    const bodies = new Map(scene.bodies.map(body => [body.component.occurrencePath.join('/'), body]));
    check(bodies.size === 3, 'Duplicate occurrence body identity.');
    for (const id of ['plate', 'left', 'right']) {
      const body = bodies.get(id);
      check(body && body.visible && body.solidCount === 1 && body.component.definition.id === partId(id)
        && body.component.definition.revision === 'r1' && body.body?.bodyId === (id === 'plate' ? 'plate-body' : 'pin-body')
        && body.body.sourceFeatureId === (id === 'plate' ? 'hole-1' : 'bore'), 'Unexpected exact current component/body reference.');
      if (document) check(canonical(body.worldPose) === canonical(document.occurrences.find(value => value.id === id).pose),
        'Actual placed scene and returned saved pose differ for ' + id + '.');
      close(body.volume, id === 'plate' ? 4800 - 72 * Math.PI : 189 * Math.PI / 4, 1e-5, id + ' native DTO volume');
      close(body.area, id === 'plate' ? 2960 + 12 * Math.PI : 495 * Math.PI / 8, 1e-5, id + ' native DTO area');
      if (id === 'plate') {
        near(body.bounds.min, [-20, -15, 0], 1e-6, 'Fixed plate minimum');
        near(body.bounds.max, [20, 15, 4], 1e-6, 'Fixed plate maximum');
      } else {
        // Independent geometric support-function formula for a cylinder R2,
        // z0..12. The inner eccentric bore does not change its exterior bounds.
        const q = body.worldPose.rotation, norm = Math.hypot(...q), [x, y, z, w] = q.map(value => value / norm);
        close(norm, 1, 1e-10, id + ' unit rotation');
        const axis = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
        const minimum = axis.map((value, i) => body.worldPose.translation[i] + Math.min(0, 12 * value) - 2 * Math.sqrt(Math.max(0, 1 - value * value)));
        const maximum = axis.map((value, i) => body.worldPose.translation[i] + Math.max(0, 12 * value) + 2 * Math.sqrt(Math.max(0, 1 - value * value)));
        near(body.bounds.min, minimum, 1e-5, id + ' independently placed cylinder minimum');
        near(body.bounds.max, maximum, 1e-5, id + ' independently placed cylinder maximum');
        if (final) {
          near(body.worldPose.translation, [id === 'left' ? -10 : 10, 0, -8], 1e-6, id + ' solved independent placement');
          near(axis, [0, 0, 1], 1e-8, id + ' solved independent axis');
          near(body.bounds.min, [id === 'left' ? -12 : 8, -2, -8], 1e-6, id + ' solved minimum');
          near(body.bounds.max, [id === 'left' ? -8 : 12, 2, 4], 1e-6, id + ' solved maximum');
        }
      }
      check(body.faces.length > 0 && body.faces.every(face => canonical(face.selection.component) === canonical(body.component)
        && canonical(face.selection.body) === canonical(body.body)), 'Scene face metadata escaped its exact occurrence/current owner.');
    }
    near(scene.bounds.min, [-20, -15, final ? -8 : Math.min(...scene.bodies.map(body => body.bounds.min[2]))], 1e-5, 'Assembly total minimum');
    if (final) { near(scene.bounds.max, [20, 15, 4], 1e-6, 'Assembly solved maximum'); }
  }
  function face(scene, path, kind, coordinate, radius) {
    const body = scene.bodies.find(value => canonical(value.component.occurrencePath) === canonical([path]));
    const matches = body.faces.filter(value => value.support?.kind === kind && (kind === 'cylinder'
      ? Math.abs(value.support.radius - radius) < 1e-9 && Math.abs(value.support.point[0] - coordinate) < 1e-9
        && Math.abs(value.support.point[1]) < 1e-9
      : Math.abs(value.support.point[2] - coordinate) < 1e-9 && value.support.normal[2] > .99));
    check(matches.length === 1, 'Expected one original actual ' + kind + ' face for ' + path + '.');
    return matches[0];
  }
  const reference = face => ({ kind: 'face', ...face.selection, support: face.support.kind === 'plane' ? 'plane' : 'axis' });
  const faceKey = face => JSON.stringify([JSON.stringify([face.selection.component.occurrencePath,
    face.selection.component.definition.id, face.selection.component.definition.revision]),
    face.selection.body ? [face.selection.body.bodyId, face.selection.body.sourceFeatureId] : null,
    face.selection.face.sourceFeatureId, face.selection.face.key]);
  async function button(text, parent = '.assembly-app') {
    await page((text, parent) => {
      const buttons = [...document.querySelectorAll(parent + ' button')].filter(value => value.textContent.trim() === text);
      if (buttons.length !== 1 || buttons[0].disabled) throw Error('Expected one enabled assembly button: ' + text);
      buttons[0].click();
    }, text, parent);
  }
  async function control(selector, value) {
    await page((selector, value) => {
      const input = document.querySelector(selector);
      if (!input || input.disabled) throw Error('Expected an editable assembly control: ' + selector);
      const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (input instanceof HTMLSelectElement && ![...input.options].some(option => option.value === value)) throw Error('Actual scene option missing.');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('assembly control records ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function chooseReference(slot, selectedFace) {
    await page(slot => {
      const buttons = [...document.querySelectorAll('.assembly-endpoints button')].filter(value => value.querySelector('strong')?.textContent.trim() === 'Referencia ' + slot);
      if (buttons.length !== 1 || buttons[0].disabled) throw Error('Expected an enabled reference slot.'); buttons[0].click();
    }, String(slot));
    await control(FACE, faceKey(selectedFace));
    await button('Usar cara en referencia ' + slot);
    const selected = reference(selectedFace); selections.push({ slot, reference: selected, support: selectedFace.support });
    return selected;
  }
  async function idle(description) {
    await waitFor(description, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  }
  async function responseAfter(serial, action) {
    return waitFor('actual worker ' + action, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Observed a real assembly worker error.');
      const record = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response).at(-1);
      if (!record) return false; check(record.response.ok, record.response.error || 'Assembly RPC failed.'); return record;
    });
  }
  function recordPhase(phase, record, scene) {
    phases.push({ phase, requestId: record.id, serial: record.serial, action: record.action,
      ...(record.document ? { inputSha256: digest(canonical(record.document)) } : {}),
      ...(record.current ? { currentSha256: digest(canonical(record.current)) } : {}),
      ...(record.proposed ? { proposedSha256: digest(canonical(record.proposed)) } : {}),
      ...(record.mateId ? { mateId: record.mateId } : {}),
      ...(record.hasToken !== undefined ? { requestHasToken: record.hasToken } : {}),
      ...(scene ? { scene } : {}),
      ...(record.response.value?.document ? { document: record.response.value.document } : {}),
      ...(record.response.value?.scopes ? { scopes: record.response.value.scopes } : {}),
      ...(record.response.value?.checks ? { checks: record.response.value.checks } : {}),
      ...(record.response.value?.status ? { status: record.response.value.status } : {}),
      ...(record.response.value?.reason ? { reason: record.response.value.reason, message: record.response.value.message } : {}),
      ...(record.response.value?.hasToken !== undefined ? { replyHasToken: record.response.value.hasToken } : {}) });
  }
  function assertPreview(record, count, dof) {
    const reply = record.response.value;
    check(reply.kind === 'assembly-preview' && reply.status === 'ready' && reply.hasToken, 'Expected a real ready worker preview capability.');
    assertDocument(reply.document, count); assertScene(reply.scene, count === 4, reply.document);
    const root = reply.scopes.find(value => value.definition.id === expected.id && value.definition.revision === expected.revision);
    check(reply.scopes.length === 1 && root?.result.status === 'underdefined' && root.result.localDOF === dof
      && root.result.rank === 12 - dof && canonical(root.result.rankRange) === canonical([12 - dof, 12 - dof])
      && canonical(root.result.localDOFRange) === canonical([dof, dof]), 'Unexpected root rigid DOF/rank result.');
    check(reply.checks.length === count && reply.checks.every(value => value.satisfied
      && Number.isFinite(value.lengthResidual) && value.lengthResidual <= value.lengthTolerance
      && Number.isFinite(value.angleResidual) && value.angleResidual <= value.angleTolerance), 'A real physical mate check failed.');
    return reply;
  }
  async function applyPreview(record, count, final = false, label = 'apply/' + count) {
    await waitFor('fresh assembly preview enables Apply', () => page(selector => {
      const apply = document.querySelector(selector); return !!apply && !apply.disabled;
    }, APPLY));
    await waitFor('preview cannot replace committed recovery before Apply', async () => {
      const saved = await page(() => localStorage.getItem('solidflow.autosave'));
      return !!saved && canonical(JSON.parse(saved)) === canonical(record.current);
    });
    const serial = (await observe()).serial; await click(APPLY);
    const applied = await responseAfter(serial, 'apply-assembly'), reply = applied.response.value;
    check(reply.kind === 'assembly-applied' && applied.hasToken, 'Apply did not use the real worker capability.');
    assertDocument(reply.document, count); assertScene(reply.scene, final, reply.document);
    // Apply may advance only the root timestamp when solved poses differ from
    // the authenticated proposal; all geometry/declarations must match.
    const { updatedAt: appliedAt, ...appliedContent } = reply.document;
    const { updatedAt: previewAt, ...previewContent } = record.response.value.document;
    check(canonical(appliedContent) === canonical(previewContent) && Number.isFinite(Date.parse(appliedAt))
      && Date.parse(appliedAt) >= Date.parse(previewAt), 'Apply changed the authenticated preview content or regressed its timestamp.');
    await idle('assembly Apply completes');
    await waitFor('committed assembly reaches recovery', async () => {
      const saved = await page(() => localStorage.getItem('solidflow.autosave'));
      return !!saved && canonical(JSON.parse(saved)) === canonical(reply.document);
    });
    recordPhase(label, applied, reply.scene); return reply;
  }
  async function addRelation(scene, name, type, firstFace, secondFace, dof, count, alignment = 'aligned', distance) {
    const first = await chooseReference(1, firstFace), second = await chooseReference(2, secondFace);
    await control('input[aria-label="Nombre de la relación"]', name);
    await control('select[aria-label="Tipo de relación"]', type);
    await control('select[aria-label="Orientación de la relación"]', alignment);
    if (distance !== undefined) await control('input[aria-label="Distancia firmada"]', String(distance));
    const before = await observe(); await button('Vista previa de la nueva relación');
    const record = await responseAfter(before.serial, 'preview-assembly');
    check(record.current.mates.length === count - 1 && record.proposed.mates.length === count,
      'New mate bypassed the committed base/proposed preview boundary.');
    const proposal = record.proposed.mates.at(-1);
    check(proposal.name === name && proposal.type === type && proposal.alignment === alignment
      && canonical(proposal.first) === canonical(first) && canonical(proposal.second) === canonical(second),
      'DOM-selected exact face references changed before the worker proposal.');
    if (distance !== undefined) { close(proposal.distance, distance, 1e-12, 'Signed distance proposal'); return record; }
    const reply = assertPreview(record, count, dof);
    check(canonical(reply.document.mates.at(-1)) === canonical(proposal), 'Solver rewrote the newly declared mate.');
    relations.push({ id: proposal.id, name, type, first, second, alignment });
    recordPhase('preview/' + name, record, reply.scene);
    return applyPreview(record, count, count === 4);
  }
  return async function workflow() {
    assertDocument(expected, 0);
    check(canonical(expected.occurrences[1].pose.translation) === canonical([-4, 3, -2])
      && canonical(expected.occurrences[2].pose.translation) === canonical([14, -7, -1]), 'Fixture contains solved placements.');
    await waitFor('initial part renderer readiness', () => page(() => {
      const text = document.querySelector('.statusbar')?.textContent || '';
      return text.includes('Listo') && text.includes('Sólido') && document.querySelectorAll('canvas').length > 0
        && typeof window.solidflow?.openDocument === 'function' && typeof window.require === 'undefined' && typeof window.process === 'undefined';
    }), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('fresh isolated part asks before assembly replacement', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let record = await responseAfter(before.serial, 'build-assembly'), scene = record.response.value;
    assertScene(scene, false, record.document); check(canonical(record.document) === canonical(expected), 'Opened assembly differs from original file.');
    await idle('opened assembly renderer is ready'); recordPhase('opened/unmated', record, scene);
    before = await observe(); await click(SOLVE); record = await responseAfter(before.serial, 'preview-assembly');
    assertPreview(record, 0, 12); recordPhase('unmated/12DOF', record, record.response.value.scene);
    let committed = await applyPreview(record, 0); scene = committed.scene;
    for (const [id, x, axisDof, capDof, count] of [['left', -10, 8, 7, 1], ['right', 10, 3, 2, 3]]) {
      const pin = face(scene, id, 'cylinder', 0, 2), hole = face(scene, 'plate', 'cylinder', x, 3);
      const alignment = pin.support.axis[2] * hole.support.axis[2] > 0 ? 'aligned' : 'opposed';
      committed = await addRelation(scene, 'Eje ' + id, 'concentric', pin, hole, axisDof, count, alignment); scene = committed.scene;
      committed = await addRelation(scene, 'Tope ' + id, 'coincident', face(scene, id, 'plane', 12), face(scene, 'plate', 'plane', 4), capDof, count + 1); scene = committed.scene;
    }
    assertScene(scene, true);
    before = await observe(); await click(SOLVE); record = await responseAfter(before.serial, 'preview-assembly');
    assertPreview(record, 4, 2); recordPhase('fresh/unlocked/2DOF', record, record.response.value.scene);
    before = await observe(); await click('button[aria-label="Bloquear giro Eje left"]');
    const locked = await responseAfter(before.serial, 'lock-assembly-rotation'), lockedReply = assertPreview(locked, 4, 1);
    check(locked.hasToken && locked.mateId === relations[0].id, 'Spin lock did not consume the exact fresh left mate preview.');
    const left = lockedReply.document.mates[0];
    check(left.type === 'concentric' && Array.isArray(left.rotationLock) && left.rotationLock.length === 4,
      'Fresh rotation lock was not saved as a quaternion.');
    close(Math.hypot(...left.rotationLock), 1, 1e-10, 'Captured unit spin lock');
    const freshLeft = record.response.value.document.occurrences.find(value => value.id === 'left').pose.rotation;
    const expectedRelative = [-freshLeft[0], -freshLeft[1], -freshLeft[2], freshLeft[3]];
    close(Math.abs(left.rotationLock.reduce((sum, value, index) => sum + value * expectedRelative[index], 0)),
      1, 1e-10, 'Fresh left-to-fixed-plate rotation capture');
    check(canonical(lockedReply.document.mates.slice(1)) === canonical(record.response.value.document.mates.slice(1)), 'Spin lock changed other mate declarations.');
    recordPhase('locked/1DOF', locked, lockedReply.scene); committed = await applyPreview(locked, 4, true, 'apply/locked');
    await button('Guardar como', '.assembly-toolbar');
    await waitFor('real assembly preload/IPC Save As completes', () => dialogCounts().saves === 1
      && ipc.filter(value => value.channel === 'document:save' && value.completed).length === 1);
    await waitFor('saved assembly is clean', () => page(name => {
      const title = document.querySelector('.assembly-header strong')?.textContent;
      return typeof title === 'string' && title.includes(name) && !title.includes('*')
        && document.querySelector('.assembly-file')?.textContent === 'saved.solidflow';
    }, expected.name));
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8'));
    assertDocument(saved, 4); check(canonical(saved) === canonical(committed.document), 'Actual saved assembly differs from authenticated Apply.');
    check(saved.mates.every((mate, index) => mate.id === relations[index].id
      && canonical(mate.first) === canonical(relations[index].first) && canonical(mate.second) === canonical(relations[index].second)),
      'Saved v2 lost occurrence-scoped exact body/face references.');
    before = await observe(); await button('Abrir', '.assembly-toolbar');
    const reopened = await responseAfter(before.serial, 'build-assembly'); assertScene(reopened.response.value, true, reopened.document);
    check(canonical(reopened.document) === canonical(saved), 'Reopened worker input differs from the actual saved v2 file.');
    await idle('reopened assembly is ready'); recordPhase('reopened/locked', reopened, reopened.response.value);
    before = await observe(); await click(SOLVE); record = await responseAfter(before.serial, 'preview-assembly');
    assertPreview(record, 4, 1); recordPhase('reopened/verified/1DOF', record, record.response.value.scene);
    await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
    const cancelled = await responseAfter(record.serial, 'discard-assembly');
    check(cancelled.hasToken && cancelled.response.value === null, 'Cancel did not discard the actual preview capability.');
    await idle('fresh verification preview cancels without committing');
    await waitFor('Cancel restores confirmed scene without another solve', () => page(selector => {
      const apply = document.querySelector(selector);
      return !!apply && apply.disabled && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm';
    }, APPLY));
    // Cancel restores the existing confirmed scene. Its metrics were already
    // checked at reopen; no new native build or measurement is claimed here.
    scene = reopened.response.value; recordPhase('cancelled/capability-discarded', cancelled);
    const rejected = await addRelation(scene, 'Distancia incompatible original', 'distance',
      face(scene, 'left', 'plane', 12), face(scene, 'plate', 'plane', 4), null, 5, 'aligned', 1);
    const rejection = rejected.response.value;
    check(rejection.kind === 'assembly-preview' && rejection.status === 'rejected' && !rejection.hasToken,
      'Conflicting offset unexpectedly produced an Apply capability.');
    const root = rejection.scopes.find(value => value.definition.id === expected.id);
    check(root?.result.status === 'inconsistent' && root.result.certificates.some(value => value.kind === 'duplicateOffset'
      && value.constraintIds.includes(relations[1].id) && value.constraintIds.includes(rejected.proposed.mates[4].id)),
      'Expected the actual duplicate plane-offset inconsistency certificate.');
    await idle('contradictory assembly preview completes');
    await waitFor('contradiction is visible and Apply remains blocked', () => page(selector => {
      const apply = document.querySelector(selector), status = document.querySelector('.assembly-status');
      return !!apply && apply.disabled && status?.classList.contains('error') && status.textContent.trim().length > 0
        && document.querySelectorAll('.assembly-mate-row').length === 4;
    }, APPLY));
    const recovery = await page(() => localStorage.getItem('solidflow.autosave'));
    check(!!recovery && canonical(JSON.parse(recovery)) === canonical(saved), 'Rejected proposal changed committed recovery.');
    check((await fsp.readFile(output)).equals(savedBytes), 'Rejected proposal changed the actually saved file.');
    check(canonical(rejected.current) === canonical(saved), 'Contradictory preview did not use the reopened committed source.');
    recordPhase('rejected/duplicate-offset', rejected);
    const state = await observe();
    check(state.assemblyUi.some(value => value.busy && value.applyDisabled === true)
      && state.assemblyUi.filter(value => value.busy).every(value => value.applyDisabled === true),
      'Real assembly Apply was not consistently blocked during observed pending work.');
    check(new Set(phases.map(value => value.serial)).size === phases.length, 'Assembly evidence reused a worker reply for different phases.');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1
      && canonical(ipc.map(value => value.channel)) === canonical(['document:open', 'document:save', 'document:open'])
      && ipc.every(value => value.completed), 'Unexpected real assembly IPC sequence.');
    check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Assembly renderer/request/worker failure.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200)
      && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Real production worker/WASM loads were not observed.');
    checks.push({ originalFixtureSha256: digest(await fsp.readFile(input)), savedContentSha256: digest(savedBytes),
      committedRecoverySha256: digest(recovery), savedDocument: saved, selectedReferences: selections,
      independentOracles: 'plate V4800-72pi/A2960+12pi; each pin V189pi/4/A495pi/8; sum V4800+45pi/2/A2960+543pi/4; metrics1e-5; final bounds/translation1e-6/axis1e-8; initial cylinder support bounds1e-5; DOF12→8→7→3→2→1',
      evidenceLimits: 'Scripted production-renderer controls, actual worker scene DTO metrics/supports/physical checks and real preload/IPC only. No native BRep validity/material probes, human pointer/native-dialog interaction, installed-package or general assembly/platform claim.',
      workerPhases: phases.slice(), assemblyUi: state.assemblyUi });
    await require('./desktop-assembly-source-flow.cjs')({ expected, saved, savedBytes, output, partUpdatePath, updatedPart,
      evaluate, observe, waitFor, click, capture, button, control, page, idle, responseAfter, recordPhase,
      checks, ipc, check, canonical, digest, near, close, dialogCounts, protocolResponses, consoleErrors, failedRequests });
    await require('./desktop-assembly-movement-flow.cjs')({ output, observe, waitFor, click, button, control, page, idle, responseAfter,
      checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests });
    await require('./desktop-assembly-drag-flow.cjs')({ output, observe, waitFor, click, button, page, idle, responseAfter, pointer, capture,
      checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests });
    await require('./desktop-assembly-projection-flow.cjs')({ output, projectionOutput, observe, waitFor, click, button, page, idle, responseAfter, pointer, capture: async () => {},
      checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests });
    await require('./desktop-assembly-interference-flow.cjs')({ interferencePath, interferenceFixture, output,
      evaluate, observe, waitFor, click, capture, button, control, page, idle, responseAfter,
      checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests });
    await require('./desktop-assembly-translation-flow.cjs')({ translationPath, translationFixture, translationOutput,
      observe, waitFor, click, capture: async () => {}, button, control, page, idle, responseAfter,
      checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests });
    await require('./desktop-assembly-bom-flow.cjs')({ bomPath, bomFixture, bomCsvOutputs,
      observe, waitFor, click, capture: async () => {}, button, control, page, idle, responseAfter,
      checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests });
    await require('./desktop-assembly-gear-flow.cjs')({ expected, input, gearOutput,
      observe, waitFor, click, capture, pointer, button, control, page, idle, responseAfter,
      addRelation, face, faceKey, checks, ipc, check, canonical, digest, near, close,
      dialogCounts, consoleErrors, failedRequests });
  };
};
