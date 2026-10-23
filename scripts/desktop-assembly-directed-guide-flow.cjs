'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Fixed original shared-prism source-update case after the pointer workflow.
// Files enter through actual Open; native catalogs supply reference identities.
module.exports = async function directedGuideWorkflow(context) {
  const { expected, input, output, files, evaluate, observe, waitFor, click, capture, checks,
    ipc, check, canonical, digest, dialogCounts, consoleErrors, failedRequests } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', PANEL = '[role="region"][aria-label="Actualizar origen compartido"]';
  const SOLVE = 'button[aria-label="Resolver actualización de pieza"]', CANCEL = 'button[aria-label="Cancelar actualización de pieza"]';
  const SUMMARY = '[aria-label="Límites dirigidos verificados"]', sides = ['first', 'second', 'guide'];
  const phases = [], evidence = { scenario: 'original-directed-guide-source-repair', phases }; checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const near = (value, target, tolerance, label) => check(Number.isFinite(value) && Math.abs(value - target) <= tolerance,
    label + '; actual=' + value + ', expected=' + target + ', tolerance=' + tolerance);
  const vector = (value, target, tolerance, label) => { check(Array.isArray(value) && value.length === target.length, label + ' dimensions'); value.forEach((x, i) => near(x, target[i], tolerance, label + '[' + i + ']')); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const rotate = (q, p) => { const t = cross(q.slice(0, 3), p).map(x => 2 * x), u = cross(q.slice(0, 3), t); return p.map((x, i) => x + q[3] * t[i] + u[i]); };
  const idle = () => waitFor('guide repair workspace idle', () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  const record = (label, event) => phases.push({ label, ...event });
  async function button(text) {
    await page(text => { const found = [...document.querySelectorAll('.assembly-toolbar button')].filter(item => item.textContent.trim() === text);
      if (found.length !== 1 || found[0].disabled) throw Error('Enabled toolbar button absent: ' + text); found[0].click(); }, text);
  }
  async function control(selector, value) {
    await page((selector, value) => { const item = document.querySelector(selector); if (!item || item.disabled) throw Error('Editable control absent: ' + selector);
      if (item instanceof HTMLSelectElement && ![...item.options].some(option => option.value === value && !option.disabled)) throw Error('Current option absent.');
      Object.getOwnPropertyDescriptor(item instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(item, value);
      item.dispatchEvent(new Event('input', { bubbles: true })); item.dispatchEvent(new Event('change', { bubbles: true })); }, selector, value);
    await waitFor('guide repair rendered control', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function choose(selector, reference) {
    const options = await page(selector => [...document.querySelector(selector).options].map(item => item.value), selector);
    const matches = options.filter(value => value && canonical(JSON.parse(value)) === canonical(reference));
    check(matches.length === 1, 'Exact current reference option missing or ambiguous.'); await control(selector, matches[0]);
  }
  async function response(serial, action) {
    return waitFor('guide repair actual ' + action, async () => { const state = await observe(), values = state.assemblies.filter(item => item.serial > serial && item.action === action && item.response);
      check(!state.workerErrors.length && values.length <= 1, 'Guide repair worker error or duplicate operation.'); if (!values.length) return false;
      check(values[0].response.ok, values[0].response.error || 'Guide repair operation failed.'); return values[0]; });
  }
  async function recovery(document) {
    await waitFor('guide repair exact recovery', async () => canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(document));
  }
  const trackedBytes = await fsp.readFile(input), pointerOutputBytes = await fsp.readFile(output);
  check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && expected.mates.length === 0, 'Expected the completed independent pointer workflow.');
  const baseline = structuredClone(expected), source = { ...baseline.occurrences[0].definition }, radians = Math.PI / 18;
  baseline.id = 'original-directed-guide-update'; baseline.name = 'Original shared guide repair';
  baseline.occurrences[1].pose.rotation = [-Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)];
  baseline.occurrences.push({ ...structuredClone(baseline.occurrences[0]), id: 'guide', name: 'Original fixed guide',
    pose: { translation: [40, 0, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] } });
  const updatedPart = structuredClone(baseline.definitions[0].document);
  for (const id of ['base', 'bore']) { const feature = updatedPart.features.find(item => item.id === id);
    check(feature && (feature.type === 'extrude' || feature.type === 'cut') && feature.depth === 4, 'Expected original through-drilled source.'); feature.depth = 5; }
  await fsp.writeFile(files.input, JSON.stringify(baseline), { flag: 'wx' }); await fsp.writeFile(files.part, JSON.stringify(updatedPart), { flag: 'wx' });
  const initialBytes = await fsp.readFile(files.input), updateBytes = await fsp.readFile(files.part);
  evidence.inputSha256 = digest(initialBytes); evidence.partSha256 = digest(updateBytes);
  let saved, savedBytes;
  function body(scene, id) {
    const found = scene.bodies.filter(item => canonical(item.component.occurrencePath) === canonical([id]));
    check(found.length === 1, 'Exact original prism occurrence absent.'); return found[0];
  }
  function geometry(scene, document, depth, revision) {
    check(scene.kind === 'assembly-scene' && scene.solidCount === 3 && scene.bodies.length === 3 && scene.prototypeCount === 1 && !scene.warnings.length,
      'Shared source lost the three native prisms.');
    near(scene.volume, 3 * (60 - Math.PI) * depth, 1e-5, 'Three through-drilled prism volumes mm3');
    near(scene.area, 3 * (120 + 32 * depth + (2 * depth - 2) * Math.PI), 1e-5, 'Three through-drilled prism areas mm2');
    const c = Math.cos(radians), s = Math.sin(radians), bounds = {
      ground: [[-5, -3, 0], [5, 3, depth]],
      moving: [[15, 10 - 3 * c, 6 - 3 * s], [25, 10 + 3 * c + depth * s, 6 + 3 * s + depth * c]],
      guide: [[40, -3, -5], [40 + depth, 3, 5]],
    };
    for (const original of baseline.occurrences) {
      const occurrence = document.occurrences.find(item => item.id === original.id), native = body(scene, original.id);
      check(occurrence && native.solidCount === 1 && canonical(native.component.definition) === canonical({ id: source.id, revision })
        && canonical(native.body) === canonical({ bodyId: 'block-body', sourceFeatureId: 'bore' }), 'Native owner/source revision changed.');
      near(native.volume, (60 - Math.PI) * depth, 1e-5, 'Placed original volume'); near(native.area, 120 + 32 * depth + (2 * depth - 2) * Math.PI, 1e-5, 'Placed original area');
      vector(occurrence.pose.translation, original.pose.translation, 1e-7, 'Original feasible source-update translation');
      near(Math.hypot(...occurrence.pose.rotation), 1, 1e-10, 'Saved unit rotation');
      const chord = Math.min(Math.hypot(...occurrence.pose.rotation.map((x, i) => x - original.pose.rotation[i])), Math.hypot(...occurrence.pose.rotation.map((x, i) => x + original.pose.rotation[i])));
      near(4 * Math.asin(Math.min(1, chord / 2)), 0, 1e-8, 'Original feasible source-update rotation rad');
      vector(native.worldPose.translation, occurrence.pose.translation, 1e-12, 'Native/saved translation');
      const nativeChord = Math.min(Math.hypot(...native.worldPose.rotation.map((x, i) => x - occurrence.pose.rotation[i])), Math.hypot(...native.worldPose.rotation.map((x, i) => x + occurrence.pose.rotation[i])));
      near(4 * Math.asin(Math.min(1, nativeChord / 2)), 0, 1e-8, 'Native/saved full orientation rad');
      const corners = [-5, 5].flatMap(x => [-3, 3].flatMap(y => [0, depth].map(z => rotate(occurrence.pose.rotation, [x, y, z]).map((v, i) => v + occurrence.pose.translation[i]))));
      vector(native.bounds.min, [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]))), 1e-5, 'Independent transformed corner minimum');
      vector(native.bounds.max, [0, 1, 2].map(i => Math.max(...corners.map(p => p[i]))), 1e-5, 'Independent transformed corner maximum');
      vector(native.bounds.min, bounds[original.id][0], 1e-5, 'Literal prism minimum'); vector(native.bounds.max, bounds[original.id][1], 1e-5, 'Literal prism maximum');
    }
    vector(scene.bounds.min, [-5, -3, -5], 1e-5, 'Literal aggregate minimum');
    vector(scene.bounds.max, [40 + depth, 10 + 3 * c + depth * s, 6 + 3 * s + depth * c], 1e-5, 'Literal aggregate maximum');
  }
  function reference(scene, id, depth) {
    const native = body(scene, id);
    if (id === 'guide') {
      const edges = native.edges.filter(item => item.support?.kind === 'line' && item.support.axis[2] > .999
        && Math.abs(item.support.point[0] - 5) < 1e-8 && Math.abs(item.support.point[1] - 3) < 1e-8);
      check(edges.length === 1 && edges[0].worldSupport?.kind === 'line', 'Unique current native +Z LINE guide missing.');
      vector(edges[0].support.axis, [0, 0, 1], 1e-8, 'Original local LINE direction'); vector(edges[0].worldSupport.axis, [1, 0, 0], 1e-8, 'Actual world guide direction');
      return { kind: 'edge', ...edges[0].selection, support: 'line' };
    }
    const faces = native.faces.filter(item => item.support?.kind === 'plane' && item.support.normal[2] > .999 && Math.abs(item.support.point[2] - depth) < 1e-8);
    check(faces.length === 1 && faces[0].worldSupport?.kind === 'plane', 'Unique current top cap missing.');
    vector(faces[0].worldSupport.normal, id === 'ground' ? [0, 0, 1] : [0, Math.sin(radians), Math.cos(radians)], 1e-8, 'Literal world top normal');
    return { kind: 'face', ...faces[0].selection, support: 'plane' };
  }
  function ready(event, depth, revision) {
    evidence.pendingEvent = event;
    const value = event.response.value;
    check(value.status === 'ready' && value.hasToken, 'Repaired stop lacks authenticated native preview.'); geometry(value.scene, value.document, depth, revision);
    const mate = value.document.mates[0], report = value.limitDirectedAngles?.[0];
    check(value.document.mates.length === 1 && mate.type === 'limit-directed-angle' && mate.coordinate === 'directed-about-axis' && !mate.suppressed
      && canonical(mate.arc) === canonical({ start: 330, sweep: 60 }), 'Original circular mate intent changed.');
    check(value.limitDirectedAngles.length === 1 && report.mateId === mate.id && canonical(report.scopePath) === '[]' && report.activity === 'interior'
      && report.supportOnly === true && report.coordinate === 'directed-about-axis' && canonical(report.arcDegrees) === canonical(mate.arc)
      && report.firstKind === 'plane' && report.secondKind === 'plane' && report.guideKind === 'line', 'Fresh three-reference report changed.');
    near(report.angleDegrees, 350, 1e-7, 'Independent circular angle degrees'); vector(report.firstDirection, [0, 0, 1], 1e-8, 'Fixed native top');
    vector(report.secondDirection, [0, Math.sin(radians), Math.cos(radians)], 1e-8, 'Moving native top'); vector(report.guideDirection, [1, 0, 0], 1e-8, 'Fixed native LINE guide');
    check(report.marginsRadians.minimum >= -report.angleToleranceRadians && report.marginsRadians.maximum >= -report.angleToleranceRadians
      && value.checks.every(item => item.satisfied && item.lengthResidual <= item.lengthTolerance && item.angleResidual <= item.angleTolerance), 'Fresh native hard checks failed.');
    for (const [side, id] of [['first', 'ground'], ['second', 'moving'], ['guide', 'guide']]) check(canonical(mate[side]) === canonical(reference(value.scene, id, depth)), 'Ready preview lost the exact current ' + side + ' reference.');
    delete evidence.pendingEvent; return value;
  }
  function updateDocument(document, revision, repaired) {
    const { first, second, guide, ...intent } = document.mates[0], { first: _a, second: _b, guide: _c, ...oldIntent } = saved.mates[0];
    check(document.id === saved.id && document.revision === saved.revision && document.name === saved.name && document.createdAt === saved.createdAt
      && document.mates.length === 1 && canonical(intent) === canonical(oldIntent), 'Update changed document/mate identity or arc.');
    check(document.definitions.length === 2 && canonical(document.definitions[0]) === canonical(saved.definitions[0])
      && document.definitions[1].kind === 'part' && document.definitions[1].id === source.id && document.definitions[1].revision === revision
      && canonical(document.definitions[1].document) === canonical(updatedPart), 'Update lost r1 or changed the exact through-hole revision.');
    check(document.occurrences.length === 3, 'Update changed shared use count.');
    document.occurrences.forEach((item, i) => { const { definition, pose, ...rest } = item, { definition: _d, pose: _p, ...old } = saved.occurrences[i];
      check(canonical(rest) === canonical(old) && canonical(definition) === canonical({ id: source.id, revision }), 'Update changed occurrence identity or sharing.'); });
    for (const side of sides) check(canonical(document.mates[0][side]) === canonical(repaired[side] ?? saved.mates[0][side]), 'Unexpected or missing explicit ' + side + ' repair.');
  }
  async function unchanged(label) {
    check((await fsp.readFile(files.output)).equals(savedBytes), label + ': confirmed file changed.'); await recovery(saved);
    check((await fsp.readFile(files.input)).equals(initialBytes) && (await fsp.readFile(files.part)).equals(updateBytes), label + ': source input changed.');
  }
  async function statuses(repaired) {
    await waitFor('exact three endpoint statuses', () => page((panel, repaired) => {
      const rows = [...document.querySelectorAll(panel + ' [data-assembly-endpoint]')], repairedSides = JSON.parse(repaired);
      return rows.length === 3 && rows.every(row => row.getAttribute('data-endpoint-status') === (repairedSides.includes(JSON.parse(row.getAttribute('data-assembly-endpoint'))[3]) ? 'manual-repair' : 'needs-repair'));
    }, PANEL, JSON.stringify(Object.keys(repaired))));
  }
  async function openReview() {
    await page(name => { const rows = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact original guide row absent.'); rows[0].click(); }, 'Original fixed guide');
    await waitFor('selected guide update enabled', () => page(() => document.querySelector('button[aria-label="Actualizar pieza"]')?.disabled === false));
    const before = await observe(); await click('button[aria-label="Actualizar pieza"]'); const event = await response(before.serial, 'review-assembly-part-update'), review = event.response.value;
    evidence.pendingEvent = event;
    check(canonical(event.current) === canonical(saved) && canonical(event.source) === canonical(source) && canonical(event.part) === canonical(updatedPart)
      && typeof event.revision === 'string' && event.revision !== source.revision, 'Source review bypassed actual input or base.');
    check(review.kind === 'assembly-source-review' && !review.hasToken && canonical(review.source) === canonical(source)
      && canonical(review.replacement) === canonical({ id: source.id, revision: event.revision }) && review.occurrences.length === 3
      && review.endpoints.length === 3 && canonical(review.endpoints.map(item => item.locator.side).sort()) === canonical([...sides].sort())
      && review.endpoints.every(item => item.status === 'needs-repair' && item.locator.mateId === saved.mates[0].id
        && canonical(item.locator.scope) === canonical({ id: saved.id, revision: saved.revision }) && canonical(item.endpoint) === canonical(saved.mates[0][item.locator.side])), 'Review did not require all three original references.');
    updateDocument(review.document, event.revision, {}); geometry(review.scene, review.document, 5, event.revision);
    await idle(); await statuses({});
    check(await page(panel => {
      const rows = [...document.querySelectorAll(panel + ' [data-assembly-endpoint]')], guide = rows.find(row => JSON.parse(row.getAttribute('data-assembly-endpoint'))[3] === 'guide');
      return guide?.textContent.includes('Al resolver se comprobarán de nuevo las tres direcciones y el arco permitido.') && !guide.textContent.includes('nueva captura');
    }, PANEL), 'Directed guide repair advertised unrelated mechanical recapture.');
    await unchanged('review'); record('source/review', event); delete evidence.pendingEvent; return event;
  }
  async function repair(review, side, repaired) {
    const id = side === 'first' ? 'ground' : side === 'second' ? 'moving' : 'guide', ref = reference(review.scene, id, 5), label = saved.mates[0].id + ' ' + side;
    await choose('select[aria-label="' + (side === 'guide' ? 'Arista' : 'Cara') + ' de reparación ' + label + '"]', ref);
    await click('button[aria-label="Reparar referencia ' + label + '"]'); repaired[side] = ref; await statuses(repaired); await unchanged('manual ' + side + ' repair');
  }
  async function solveUpdate(reviewed, repaired, accepted) {
    const before = await observe(); await click(SOLVE); const event = await response(before.serial, 'preview-assembly'); evidence.pendingEvent = event;
    check(canonical(event.current) === canonical(saved), 'Source solve lost committed base.'); updateDocument(event.proposed, reviewed.revision, repaired);
    if (accepted) { const value = ready(event, 5, reviewed.revision); updateDocument(value.document, reviewed.revision, repaired);
      await waitFor('repaired Apply enabled', () => page(selector => document.querySelector(selector)?.disabled === false, APPLY)); }
    else { const value = event.response.value;
      check(value.status === 'rejected' && value.reason === 'reference' && !value.hasToken && !value.limitDirectedAngles, 'Unrepaired source was given geometry authority.');
      await idle(); check(await page((panel, apply, summary) => !!document.querySelector(panel) && document.querySelector(apply)?.disabled === true && !document.querySelector(summary), PANEL, APPLY, SUMMARY), 'Rejected update lost editable stage or exposed stale Apply/report.'); }
    await statuses(repaired); await unchanged('source solve'); delete evidence.pendingEvent;
    record(accepted ? 'source/ready' : Object.keys(repaired).length ? 'source/rejected-guide-pending' : 'source/rejected-all-pending', event); return event;
  }
  async function apply(event, depth, revision) {
    await idle(); const before = await observe(); await click(APPLY); const result = await response(before.serial, 'apply-assembly'), value = result.response.value;
    check(result.hasToken && value.kind === 'assembly-applied', 'Apply did not consume real capability.');
    const { updatedAt: _a, ...candidate } = event.response.value.document, { updatedAt: _b, ...applied } = value.document;
    check(canonical(candidate) === canonical(applied), 'Apply changed authenticated candidate.'); geometry(value.scene, value.document, depth, revision);
    await idle(); await recovery(value.document); record('apply', result); return value.document;
  }
  await idle(); let before = await observe(); await button('Abrir'); let event = await response(before.serial, 'build-assembly');
  check(canonical(event.document) === canonical(baseline), 'Derived original fixture changed on actual Open.'); geometry(event.response.value, baseline, 4, source.revision); record('open/original', event); await idle();
  const originalRefs = [reference(event.response.value, 'ground', 4), reference(event.response.value, 'moving', 4), reference(event.response.value, 'guide', 4)];
  await control('select[aria-label="Tipo de relación"]', 'limit-directed-angle');
  for (const [index, label] of ['Primera dirección del límite', 'Segunda dirección del límite', 'Eje guía del límite'].entries()) await choose('select[aria-label="' + label + '"]', originalRefs[index]);
  await control('input[aria-label="Nombre de la relación"]', 'Original explicit LINE guide stop');
  await control('input[aria-label="Inicio del arco en grados"]', '330'); await control('input[aria-label="Recorrido permitido en grados"]', '60');
  before = await observe(); await click('button[aria-label="Vista previa del nuevo límite dirigido"]'); event = await response(before.serial, 'preview-assembly'); ready(event, 4, source.revision); record('author/ready', event);
  saved = await apply(event, 4, source.revision); await button('Guardar como');
  await waitFor('guide baseline saved through IPC', async () => { try { return dialogCounts().saves === 2 && canonical(JSON.parse(await fsp.readFile(files.output, 'utf8'))) === canonical(saved); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } });
  await idle(); savedBytes = await fsp.readFile(files.output); evidence.baselineSavedSha256 = digest(savedBytes);
  const cancelled = await openReview(), repaired = {};
  await solveUpdate(cancelled, repaired, false); await repair(cancelled.response.value, 'first', repaired); await repair(cancelled.response.value, 'second', repaired);
  await solveUpdate(cancelled, repaired, false); await repair(cancelled.response.value, 'guide', repaired); event = await solveUpdate(cancelled, repaired, true);
  await click(CANCEL); await idle();
  await waitFor('cancelled ready source stage clears Apply/report', () => page((panel, apply, summary) => !document.querySelector(panel)
    && document.querySelector(apply)?.disabled === true && !document.querySelector(summary), PANEL, APPLY, SUMMARY));
  await unchanged('cancelled ready update');
  // Cancel may restore the confirmed scene from cache. Request a fresh native
  // verification explicitly instead of requiring an unsolicited rebuild.
  before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly');
  evidence.pendingEvent = event;
  check(canonical(event.current) === canonical(saved) && canonical(event.proposed) === canonical(saved), 'Cancel did not restore the original confirmed solve input.');
  ready(event, 4, source.revision); record('source/cancel-fresh-baseline', event);
  await idle(); await click('button[aria-label="Cancelar vista previa del ensamblaje"]'); await idle();
  await waitFor('baseline verification Cancel clears Apply/report', () => page((panel, apply, summary) => !document.querySelector(panel)
    && document.querySelector(apply)?.disabled === true && !document.querySelector(summary), PANEL, APPLY, SUMMARY));
  await unchanged('cancelled fresh baseline verification');
  const reviewed = await openReview(), accepted = {}; check(reviewed.revision !== cancelled.revision, 'Cancelled revision reused.');
  for (const side of sides) await repair(reviewed.response.value, side, accepted);
  event = await solveUpdate(reviewed, accepted, true); const updated = await apply(event, 5, reviewed.revision); updateDocument(updated, reviewed.revision, accepted);
  for (const [action, document, depth, revision] of [['undo', saved, 4, source.revision], ['redo', updated, 5, reviewed.revision]]) {
    before = await observe(); await click('button[aria-label="' + (action === 'undo' ? 'Deshacer' : 'Rehacer') + ' ensamblaje"]'); event = await response(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(document), 'One ' + action + ' lost complete source/ref transaction.'); geometry(event.response.value, document, depth, revision);
    await idle(); await recovery(document); record('source/' + action, event);
  }
  await button('Guardar'); await waitFor('updated guide saved through actual IPC', async () => canonical(JSON.parse(await fsp.readFile(files.output, 'utf8'))) === canonical(updated)); await idle();
  before = await observe(); await button('Abrir'); event = await response(before.serial, 'build-assembly');
  check(canonical(event.document) === canonical(updated), 'Saved/reopened explicit guide changed.'); updateDocument(event.document, reviewed.revision, accepted);
  geometry(event.response.value, updated, 5, reviewed.revision); await idle(); await recovery(updated); record('source/reopen', event);
  check(await page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true), 'Reopen retained unrelated history.');
  before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly'); ready(event, 5, reviewed.revision); updateDocument(event.response.value.document, reviewed.revision, accepted); record('source/reopen-fresh', event);
  await waitFor('reopened current guide report visible', () => page(name => Number(document.querySelector('output[aria-label="Ángulo dirigido verificado ' + name + '"]')?.textContent) === 350, updated.mates[0].name));
  await click('button[aria-label="Cancelar vista previa del ensamblaje"]'); await idle(); await recovery(updated); await capture(updated);
  check(dialogCounts().opens === 6 && dialogCounts().saves === 2 && canonical(ipc.map(item => item.channel)) === canonical([
    'document:open', 'document:save', 'document:open', 'document:open', 'document:save', 'document:open', 'document:open', 'document:save', 'document:open'])
    && ipc.every(item => item.completed), 'Unexpected guide-repair file IPC sequence.');
  check((await fsp.readFile(input)).equals(trackedBytes) && (await fsp.readFile(output)).equals(pointerOutputBytes)
    && (await fsp.readFile(files.input)).equals(initialBytes) && (await fsp.readFile(files.part)).equals(updateBytes), 'Existing fixture/output or original repair inputs changed.');
  const state = await observe(); check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Guide repair renderer/worker/request failure.');
  Object.assign(evidence, { revisedDocument: updated, revisedSavedSha256: digest(await fsp.readFile(files.output)),
    independentOracles: 'Three original10x6xhprisms withthroughR1bores:h4 V720-12pi,A744+18pi;h5 V900-15pi,A840+24pi. Literalposes I,Rx(-10),Ry90; exactcurrenttop/top/+ZLINE gives350deg aboutworld+X. V/A,bounds1e-5; originalpositions1e-7mm,orientations1e-8rad; native/savedposition1e-12mm; directions1e-8,angle1e-7deg. Allthreepending andonlyguidependingreject; manualthree-refrepair; Cancelready,freshrevision,Apply,oneUndoRedo,exactSave/reopen/freshnativeSolve.',
    limits: 'One shared original source updated through actual DOM/worker/file IPC. Native catalog supports and geometric DTOs, not a desktop BRep-validity query. No automatic correspondence, guide part replacement, arbitrary direction families, pointer repair, human native dialogs, linked sources, installed packages or platform acceptance.' });
};
