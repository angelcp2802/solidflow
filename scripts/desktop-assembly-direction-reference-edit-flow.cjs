'use strict';
const fsp = require('node:fs/promises');

// Continue the complete original direction workflow on its actual saved scene.
// No model, worker response, capability or geometric locator is injected.
module.exports = async function directionReferenceEditing({ context, base, page, button, control, choose,
  orientation, responseAfter, recovery, idle, ready, relations, face, line, reference }) {
  const { expected, output, click, pointer, observe, waitFor, capture, checks, check, canonical, digest,
    ipc, dialogCounts, consoleErrors, failedRequests } = context;
  const TYPE = 'select[aria-label="Tipo de relación"]', NAME = 'input[aria-label="Nombre de la relación"]';
  const EDIT = 'button[aria-label="Vista previa de la relación direccional editada"]';
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const CLOSE = 'button[aria-label="Cerrar edición de relación direccional"]';
  const role = slot => 'button[aria-label="Referencia ' + slot + ' de la relación"]';
  const clear = slot => 'button[aria-label="Quitar referencia ' + slot + ' de la relación"]';
  const attribute = (name, value) => '[' + name + '=' + JSON.stringify(value) + ']';
  const definition = { id: expected.definitions[0].id, revision: expected.definitions[0].revision };
  const originalMate = structuredClone(base.document.mates[0]);
  const phases = [], gestures = [], evidence = { scenario: 'saved-direction-reference-edit', phases, gestures,
    provenance: 'Continuation of the tracked original two drilled prisms; literal principal axes/XY plane and current native top face/LINE.',
    scope: 'Root-scope perpendicular and parallel reference replacement, root/component datums, material plane/LINE, support-kind semantic inversion, Cancel/retry, Apply, history, Save/reopen and fresh solve.',
    limits: 'Scripted visible form fields and actual CDP origin-label clicks. This adds no nested/configured/human/platform claim or exact Cancel raster equivalence. Datums use literal declared axes and independently rotated placed poses; material references use actual native world supports.' };
  checks.push(evidence);
  const record = (phase, event) => phases.push({ phase, serial: event.serial, action: event.action,
    mate: event.response.value?.document?.mates[0] ?? event.document?.mates[0] });
  const references = () => page(() => [1, 2].map(slot => {
    const span = document.querySelector('button[aria-label="Referencia ' + slot + ' de la relación"] span');
    if (!span) throw Error('Exactly two displayed reference roles required.');
    return span.title ? JSON.parse(span.title) : null;
  }));
  async function unchanged(before, document, label) {
    await recovery(document, label);
    check((await observe()).serial === before, label + ' must not perform CAD work.');
  }
  async function begin(document) {
    await click('button[aria-label="Editar relación ' + document.mates[0].name + '"]');
    await waitFor('saved directional draft mounted', () => page(selector => !!document.querySelector(selector), EDIT));
    check(await page(() => [1, 2].every(slot => {
      const role = document.querySelector('button[aria-label="Referencia ' + slot + ' de la relación"]');
      const clear = document.querySelector('button[aria-label="Quitar referencia ' + slot + ' de la relación"]');
      return role && !role.disabled && clear && !clear.disabled;
    })), 'Saved direction editor exposes both replaceable, removable reference roles.');
    check(canonical(await references()) === canonical([document.mates[0].first, document.mates[0].second]),
      'Beginning saved direction editing restores its exact current endpoints.');
  }
  async function origin(slot, kind, id, value) {
    if (id) await click('[data-assembly-tree-path]' + attribute('data-assembly-tree-path', JSON.stringify([id])));
    await control('select[aria-label="Orígenes visibles de"]', id ? 'selected' : 'scope');
    const toggle = '.assembly-origin-tools label:nth-of-type(' + (kind === 'principal-axis' ? 1 : 2) + ') input';
    if (!await page(selector => document.querySelector(selector)?.checked, toggle)) await click(toggle);
    await click(role(slot)); await click('button[aria-label="Seleccionar orígenes"]');
    const key = JSON.stringify([kind, id ? [[id], definition.id, definition.revision] : null, value]);
    const selector = 'button[data-origin-key]' + attribute('data-origin-key', key);
    await waitFor('direction edit exact origin picker is active', () => page(selector => {
      const element = document.querySelector(selector);
      return element && !element.disabled && document.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking') === 'origin';
    }, selector));
    const inspect = () => page(selector => {
      const element = document.querySelector(selector);
      if (!element || element.disabled || element.closest('[hidden]')) return null;
      const r = element.getBoundingClientRect(), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth
        && r.bottom <= innerHeight && hit && (hit === element || element.contains(hit)) ? point : null;
    }, selector);
    let previous, stableSince = 0;
    const point = await waitFor('stable hit-tested current origin label', async () => {
      const next = await inspect(), serialized = canonical(next);
      if (serialized !== previous) { previous = serialized; stableSince = Date.now(); }
      return next && Date.now() - stableSince >= 120 ? next : false;
    });
    const before = (await observe()).serial;
    await pointer('mouseMoved', point);
    check(canonical(await inspect()) === canonical(point), 'Origin target remains current before its actual press.');
    await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    const selected = { kind, component: id ? { occurrencePath: [id], definition: { ...definition } } : null,
      [kind === 'principal-axis' ? 'axis' : 'plane']: value };
    await waitFor('exact replaced origin reference rendered', async () => canonical((await references())[slot - 1]) === canonical(selected));
    check((await observe()).serial === before, 'Direction origin selection performs no native solve.');
    gestures.push({ kind: 'direction-reference-origin', slot, selection: selected, point });
    return selected;
  }
  async function preview(label, type, pair, alignment, dof) {
    await control(TYPE, type); await control(NAME, label); await orientation(alignment);
    check(canonical(await references()) === canonical(pair), 'Directional draft displays exact replacement references.');
    const before = await observe(); await click(EDIT);
    const event = await responseAfter(before.serial, 'preview-assembly'), result = ready(event, 1, dof), mate = result.document.mates[0];
    check(mate.id === originalMate.id && mate.suppressed === originalMate.suppressed && mate.name === label
      && mate.type === type && mate.alignment === alignment && canonical([mate.first, mate.second]) === canonical(pair),
    'Native preview preserves identity and consumes the new direction-reference intent.');
    record(label + '/preview', event); return event;
  }
  async function cancel(document, pair, label) {
    await idle(label); await click(CANCEL); await recovery(document, label);
    await waitFor(label + ' retains editable replacement draft', () => page(selector => document.querySelector(selector)?.disabled === false, EDIT));
    check(canonical(await references()) === canonical(pair), 'Preview Cancel preserves replacement endpoints for retry.');
  }
  async function apply(event, label) {
    await idle(label); const before = await observe(); await click(APPLY);
    const result = await responseAfter(before.serial, 'apply-assembly');
    check(result.hasToken && result.response.value.kind === 'assembly-applied', 'Edited direction Apply requires the native token.');
    const { updatedAt: _a, ...a } = event.response.value.document, { updatedAt: _b, ...b } = result.response.value.document;
    check(canonical(a) === canonical(b), 'Apply preserves exact previewed replacement declaration.');
    relations(result.response.value.scene, result.response.value.document);
    await recovery(result.response.value.document, label);
    await waitFor('Apply ends the saved direction editor', () => page(selector => !document.querySelector(selector), EDIT));
    record(label + '/apply', result); return { document: result.response.value.document, scene: result.response.value.scene };
  }
  async function history(action, wanted, label) {
    const before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]');
    const event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(wanted), 'Direction reference history restores exactly one document.');
    relations(event.response.value, event.document); await recovery(event.document, label); record(label, event);
    return { document: event.document, scene: event.response.value };
  }

  await begin(base.document);
  let before = (await observe()).serial;
  await click(clear(1));
  check((await references())[0] === null && await page(selector => document.querySelector(selector)?.disabled === true, EDIT),
    'A removed direction endpoint disables preview without substituting the saved reference.');
  await unchanged(before, base.document, 'cleared first directional reference');
  const rootPlane = await origin(1, 'principal-plane', null, 'XY');
  await click(clear(2));
  check((await references())[1] === null && await page(selector => document.querySelector(selector)?.disabled === true, EDIT),
    'The second saved direction endpoint is independently removable.');
  const movingAxis = await origin(2, 'principal-axis', 'moving', 'X'), rootPair = [rootPlane, movingAxis];
  await unchanged(before, base.document, 'direction origin replacements');
  let event = await preview('Perpendicular con eje de origen', 'perpendicular', rootPair, 'aligned', 4);
  await cancel(base.document, rootPair, 'origin replacement preview cancelled');
  event = await preview('Perpendicular con eje de origen', 'perpendicular', rootPair, 'aligned', 4);
  const original = base.document;
  base = await apply(event, 'origin-reference-replacement'); const originDocument = base.document;
  base = await history('undo', original, 'direction-reference/undo');
  base = await history('redo', originDocument, 'direction-reference/redo');

  await begin(base.document); before = (await observe()).serial;
  const rootAxis = await origin(1, 'principal-axis', null, 'Y');
  await click(clear(2));
  const currentLine = line(base.scene, 'moving'); await choose(1, currentLine);
  const linePair = [rootAxis, reference(currentLine)];
  await unchanged(before, base.document, 'direction LINE replacement');
  event = await preview('Perpendicular con eje raíz y LINE', 'perpendicular', linePair, null, 5);
  base = await apply(event, 'axis-line-perpendicular');

  await begin(base.document); before = (await observe()).serial;
  await click(clear(1)); const currentPlane = face(base.scene, 'ground', 'plane'); await choose(0, currentPlane);
  const mixedPair = [reference(currentPlane), base.document.mates[0].second];
  await unchanged(before, base.document, 'parallel plane replacement');
  event = await preview('Paralela con plano y LINE', 'parallel', mixedPair, null, 5);
  await cancel(base.document, mixedPair, 'parallel replacement preview cancelled');
  event = await preview('Paralela con plano y LINE', 'parallel', mixedPair, null, 5);
  base = await apply(event, 'plane-line-parallel');

  await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)');
  await waitFor('direction replacements saved through real restricted file IPC', async () => {
    if (dialogCounts().saves !== 2) return false;
    try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(base.document); }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  });
  const savedBytes = await fsp.readFile(output);
  before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
  event = await responseAfter(before.serial, 'build-assembly');
  check(canonical(event.document) === canonical(base.document), 'Fresh reopening preserves replaced direction references.');
  relations(event.response.value, event.document); await recovery(event.document, 'direction references reopened');
  base = { document: event.document, scene: event.response.value }; record('direction-reference/reopen', event);
  before = await observe(); await click('button[aria-label="Resolver ensamblaje"]');
  event = await responseAfter(before.serial, 'preview-assembly'); ready(event, 1, 5); record('direction-reference/fresh-native', event);
  await idle('fresh reopened direction solve'); await click(CANCEL); await recovery(base.document, 'fresh reopened direction cancelled');

  await begin(base.document); before = (await observe()).serial;
  await click(clear(1)); await click(CLOSE); await unchanged(before, base.document, 'closing a changed directional draft');
  await begin(base.document); await click(CLOSE);
  await capture(base.document);
  const counts = dialogCounts(), state = await observe();
  check(phases.length === 12 && phases.filter(value => value.action === 'apply-assembly').length === 3 && gestures.length === 3,
    'Exact appended direction-reference lifecycle coverage is required.');
  check(counts.opens === 3 && counts.saves === 2 && ipc.every(value => value.completed), 'Direction reference persistence requires complete actual file IPC.');
  check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Direction reference workflow has renderer/worker/request errors.');
  check(digest(await fsp.readFile(output)) === digest(savedBytes), 'Fresh solve or abandoned editing changed the saved replacement bytes.');
  evidence.finalDocument = base.document; evidence.savedSha256 = digest(savedBytes);
  evidence.independentOracles = 'Retains complete original BRep, V480-8pi/A496+12pi, two solids/one prototype and placed-corner checks. Literal datum directions and actual world plane/LINE supports satisfy angular targets at1e-6rad. Fixed ground remains exact; free moving poses are not required to be unique. Mixed plane-axis perpendicular is collinear/DOF4; axis-LINE perpendicular and plane-LINE parallel are orthogonal/DOF5.';
  return { document: base.document, savedSha256: evidence.savedSha256 };
};
