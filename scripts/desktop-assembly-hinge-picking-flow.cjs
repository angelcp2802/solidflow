'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Actual CDP geometry input only: no React callbacks, CAD responses, document
// stores or capabilities are replaced. Original literal camera/solid oracles.
module.exports = function hingePickingWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts, consoleErrors, failedRequests, protocolResponses } = context;
  const roles = ['Eje A de bisagra', 'Eje B de bisagra', 'Plano axial A de bisagra', 'Plano axial B de bisagra'],
    APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]', SUMMARY = '[aria-label="Bisagra verificada"]';
  const evidence = { scenario: 'original-hinge-actual-pointer', pointerHits: [], pointerAttempts: [], negatives: [], phases: [] }; checks.push(evidence);
  let name = 'Bisagra por puntero';
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); if (json === undefined) throw Error('Expected JSON data'); return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (a, b, band, label) => check(Number.isFinite(a) && Math.abs(a - b) <= band, label + ': ' + a + ' expected ' + b);
  const vector = (a, b, band, label) => { check(Array.isArray(a) && a.length === b.length, label + ' shape'); a.forEach((value, i) => near(value, b[i], band, label + '[' + i + ']')); };
  const sub = (a, b) => a.map((v, i) => v - b[i]), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function rotate(q, p) { near(Math.hypot(...q), 1, 1e-10, 'Proper quaternion'); const n = Math.hypot(...q), v = q.slice(0, 3).map(x => x / n), w = q[3] / n,
    t = cross(v, p).map(x => 2 * x), c = cross(v, t); return p.map((x, i) => x + w * t[i] + c[i]); }
  const placed = (pose, point) => rotate(pose.rotation, point).map((v, i) => v + pose.translation[i]);
  async function button(text, parent = '.assembly-app') { await assemblyNavigation.button(text, parent); await page((text, parent) => { const list = [...document.querySelectorAll(parent + ' button')].filter(e => e.textContent.trim() === text);
    if (list.length !== 1 || list[0].disabled) throw Error('Exact enabled button ' + text); list[0].click(); }, text, parent); }
  async function control(selector, value) { await assemblyNavigation.reveal(selector); await page((selector, value) => { const e = document.querySelector(selector); if (!e || e.disabled) throw Error('Editable control ' + selector);
    const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    if (e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Actual option ' + value);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value); await waitFor('rendered ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value)); }
  async function frames(count = 2) { await page(count => new Promise((resolve, reject) => { let frame, remaining = count;
    const timer = setTimeout(() => { cancelAnimationFrame(frame); reject(Error('Viewport frames exceeded the existing35second step budget')); }, 35000);
    const next = () => { if (--remaining <= 0) { clearTimeout(timer); resolve(); } else frame = requestAnimationFrame(next); }; frame = requestAnimationFrame(next);
  }), count); }
  async function response(serial, action) { return waitFor('actual ' + action, async () => { const state = await observe(); check(!state.workerErrors.length, 'No worker runtime errors');
    const list = state.assemblies.filter(e => e.serial > serial && e.action === action && e.response); check(list.length <= 1, 'One actual ' + action);
    if (!list.length) return false; check(list[0].response.ok, list[0].response.error || 'Worker rejection'); return list[0]; }); }
  async function recovery(document, label) { await waitFor(label + ' committed recovery', async () => { const raw = await page(() => localStorage.getItem('solidflow.autosave'));
    return raw && canonical(JSON.parse(raw)) === canonical(document) && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'); }); }
  function body(scene, id) { const list = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id])); check(list.length === 1, 'Exact native owner ' + id); return list[0]; }
  function vertex(scene, id, point) { const list = body(scene, id).vertexPoints.filter(v => v.point.every((x, i) => Math.abs(x - point[i]) < 1e-8)); check(list.length === 1, 'Unique native material vertex'); return list[0].worldPoint; }
  function geometry(scene, document, quarter = false) {
    check(scene.solidCount === 2 && scene.bodies.length === 2 && scene.prototypeCount === 1 && !scene.warnings.length, 'Two original native solids and one prototype');
    near(scene.volume, 384 - 8 * Math.PI, 1e-5, 'Literal total volume'); near(scene.area, 448 + 12 * Math.PI, 1e-5, 'Literal total area');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Original full source cache unchanged');
    check(canonical(document.occurrences[0]) === canonical(expected.occurrences[0]), 'Fixed ground unchanged');
    for (const o of document.occurrences) {
      const b = body(scene, o.id), corners = [-2, 10].flatMap(x => [-2, 2].flatMap(y => [0, 4].map(z => placed(o.pose, [x, y, z]))));
      near(b.volume, 192 - 4 * Math.PI, 1e-5, 'Each leaf V'); near(b.area, 224 + 6 * Math.PI, 1e-5, 'Each leaf A');
      check(b.solidCount === 1 && b.body.bodyId === 'original-hinge-body' && b.body.sourceFeatureId === 'hole', 'Current original cut body');
      vector(b.bounds.min, [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]))), 1e-6, 'Independent transformed rectangular minimum');
      vector(b.bounds.max, [0, 1, 2].map(i => Math.max(...corners.map(p => p[i]))), 1e-6, 'Independent transformed rectangular maximum');
      vector(vertex(scene, o.id, [10, 2, 4]), placed(o.pose, [10, 2, 4]), 1e-6, 'Independent native corner placement');
    }
    if (document.mates.some(m => m.type === 'hinge' && !m.suppressed)) {
      const P = vertex(scene, 'moving', [10, 2, 4]), Q = vertex(scene, 'moving', [10, 2, 0]); vector(P.map((v, i) => (v - Q[i]) / 4), [0, 0, 1], 1e-8, 'Actual material axial alignment');
      const pose = document.occurrences.find(o => o.id === 'moving').pose; vector(placed(pose, [0, 0, 0]), [0, 0, 4], 1e-6, 'Literal coaxial axial seating');
      if (quarter) { vector(P, [-2, 10, 8], 1e-6, 'Literal positive90 material corner'); vector(body(scene, 'moving').bounds.min, [-2, -2, 4], 1e-6, 'Quarter lower'); vector(body(scene, 'moving').bounds.max, [2, 10, 8], 1e-6, 'Quarter upper'); }
    }
  }
  function originalReferences(scene) {
    const face = (id, predicate, support) => { const list = body(scene, id).faces.filter(predicate); check(list.length === 1, 'Unique actual original face ' + id + '/' + support); return { kind: 'face', ...list[0].selection, support }; };
    const axis = id => face(id, f => f.support?.kind === 'cylinder' && Math.abs(f.support.radius - 1) < 1e-8 && Math.hypot(f.support.point[0], f.support.point[1]) < 1e-8, 'axis');
    const cap = (id, z) => face(id, f => f.support?.kind === 'plane' && Math.abs(f.support.point[2] - z) < 1e-8 && Math.abs(f.support.normal[2]) > .99999, 'plane');
    const lines = body(scene, 'ground').edges.filter(e => e.support?.kind === 'line' && Math.abs(e.support.axis[2]) > .99999 && Math.abs(e.support.point[0] - 10) < 1e-8 && Math.abs(e.support.point[1] + 2) < 1e-8);
    check(lines.length === 1, 'Exact visible original corner LINE');
    return { references: [axis('ground'), axis('moving'), cap('ground', 4), cap('moving', 0)], line: { kind: 'edge', ...lines[0].selection, support: 'line' } };
  }
  const fields = () => page(roles => roles.map(role => document.querySelector('select[aria-label="' + role + '"]')?.value), roles);
  const picker = (slot, edge = false) => 'button[aria-label="' + (edge ? 'Seleccionar arista para ' + roles[slot] : 'Seleccionar ' + roles[slot] + ' en el modelo') + '"]';
  async function arm(slot, edge = false) { const selector = picker(slot, edge); if (!await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true', selector)) await click(selector);
    await waitFor('actual armed role', () => page((selector, mode) => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === mode, selector, edge ? 'edge' : 'face'));
    check(await page(() => document.querySelector('button[aria-label="Arrastrar posición"]')?.getAttribute('aria-pressed') === 'false' && document.querySelector('button[aria-label="Arrastrar giro"]')?.getAttribute('aria-pressed') === 'false'), 'Reference picking disables component drag'); }
  async function projection(scene, world, fit = true) {
    if (fit) { await button('Isométrica', '.assembly-view-tools'); await frames(); }
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const bounds = scene.visibleBounds, center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2), span = Math.max(1, Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i]))), pixels = rect.height / (1.3 * span), r = sub(world, center);
    const point = { x: rect.x + rect.width / 2 + (1.3 * r[0] + r[1]) / Math.sqrt(2.69) * pixels,
      y: rect.y + rect.height / 2 - (-r[0] + 1.3 * r[1] + 2.69 * r[2]) / Math.sqrt(9.9261) * pixels };
    check(point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height, 'Literal projected material point inside current canvas');
    return { point, worldPoint: world, rect, sceneCenter: center, sceneSpan: span, pixelsPerMm: pixels };
  }
  async function hit(point) { await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point); }
  async function pick(base, slot, reference, world, { edge = false, reselect = false } = {}) {
    const projected = await projection(base.scene, world); await arm(slot, edge);
    const beforeFields = await fields(), serial = (await observe()).serial, stored = await page(() => localStorage.getItem('solidflow.autosave'));
    if (reselect) check(beforeFields[slot] === '', 'Current edit role is empty before actual pointer reselect');
    const keys = await page((role, reference) => { const stable = v => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
      return [...document.querySelector('select[aria-label="' + role + '"]').options].filter(o => { try { return !o.disabled && stable(JSON.parse(o.value)) === stable(reference); } catch { return false; } }).map(o => o.value); }, roles[slot], reference);
    check(keys.length === 1, 'Actual full reference option for pointer hit'); await hit(projected.point);
    const observedFields = await fields(); evidence.pointerAttempts.push({ slot, role: roles[slot], edge, reselect, expected: keys[0], actual: observedFields[slot], ...projected });
    await waitFor('CDP selected ' + roles[slot], () => page((role, key) => document.querySelector('select[aria-label="' + role + '"]')?.value === key, roles[slot], keys[0]));
    const after = await fields(); beforeFields.forEach((value, i) => { if (i !== slot) check(after[i] === value, 'Pointer preserves every other role'); }); if (reselect) check(after[slot] === keys[0] && after[slot] !== beforeFields[slot], 'Current edit reselect restores exact full identity from an empty role');
    check((await observe()).serial === serial && await page(() => localStorage.getItem('solidflow.autosave')) === stored, 'Pointer selection does not perform CAD/history work');
    evidence.pointerHits.push({ slot, role: roles[slot], edge, reselect, reference, ...projected });
  }
  async function selectMoving() { (await assemblyNavigation.panel('components'), await page(() => { const list = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(e => e.querySelector('span')?.firstChild?.textContent === 'moving'); if (list.length !== 1 || list[0].disabled) throw Error('Exact moving tree row'); list[0].click(); }));
    await waitFor('moving selected', () => page(() => document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'moving')); }
  async function noIntentChange(label, beforeFields, serial, stored) { await frames(); check(canonical(await fields()) === canonical(beforeFields), label + ' preserves every current field');
    check((await observe()).serial === serial && await page(() => localStorage.getItem('solidflow.autosave')) === stored, label + ' no native/history mutation'); evidence.negatives.push({ label, fields: beforeFields }); }
  async function preview(text) { const before = await observe(); await button(text); return response(before.serial, 'preview-assembly'); }
  function ready(event, refs, label, anchored = false, quarter = false) {
    const v = event.response.value; evidence.lastReadyObservation = { label, status: v.status, hasToken: v.hasToken, checks: v.checks, message: v.message, motion: v.motion };
    check(v.status === 'ready' && v.hasToken && v.checks.length === 1 && v.checks.every(c => c.satisfied), label + ' current native ready capability');
    check(v.document.mates.length === 1 && v.document.mates[0].type === 'hinge' && v.document.mates[0].name === name, label + ' saved family/name');
    const m = v.document.mates[0]; check(canonical([...m.axis, ...m.axial]) === canonical(refs) && m.alignment === 'aligned' && !m.suppressed, label + ' all four exact pointer-derived roles');
    check(v.checks[0].constraintId === JSON.stringify([[], m.id]), label + ' exact scoped final constraint check');
    check(v.hinges?.length === 1, label + ' one final native support report'); const r = v.hinges[0];
    check(r.kind === 'hinge' && r.status === 'ok' && r.satisfied && r.supportOnly && r.qualifiedRotation && r.mateId === m.id
      && canonical(r.scopePath) === canonical([]) && canonical(r.componentPaths) === canonical({ axis: [['ground'], ['moving']], axial: [['ground'], ['moving']] }), label + ' current report purpose/scope/roles');
    check(r.angleToleranceRad === 1e-8 && r.lengthToleranceMm === 1e-6 && r.axisAngleRad + r.precision.directionRad <= r.angleToleranceRad && Math.max(r.transverseResidualMm, Math.abs(r.axialOffsetMm)) + r.precision.positionMm <= r.lengthToleranceMm, 'Native residuals plus uncertainty stay in unchanged bands');
    if (!anchored) { const root = v.scopes.find(s => s.definition.id === expected.id); check(root?.result.rank === 5 && root?.result.localDOF === 1, 'Actual local rank5/DOF1, not prescribed spin'); }
    geometry(v.scene, v.document, quarter); evidence.phases.push({ label, serial: event.serial, hinges: v.hinges, volume: v.scene.volume, area: v.scene.area }); return v;
  }
  async function apply(event, label, quarter = false) { const before = await observe(); await click(APPLY); const e = await response(before.serial, 'apply-assembly'), v = e.response.value;
    check(e.hasToken && canonical({ ...v.document, updatedAt: event.response.value.document.updatedAt }) === canonical(event.response.value.document), 'Actual capability Apply retains exact candidate except history timestamp');
    geometry(v.scene, v.document, quarter); await recovery(v.document, label); return { document: v.document, scene: v.scene }; }
  async function cancel(base) { const before = await observe(); await click(CANCEL); const e = await response(before.serial, 'discard-assembly'); check(e.hasToken, 'Actual discarded native capability'); await recovery(base.document, 'Cancel');
    check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY), 'Cancel revokes report/Apply'); }
  async function history(action, document) { const before = await observe(); await click('button[aria-label="' + action + ' ensamblaje"]'); const e = await response(before.serial, 'build-assembly');
    check(canonical(e.document) === canonical(document), 'Exact historical graph'); geometry(e.response.value, document); await recovery(document, action); return { document, scene: e.response.value }; }
  return async () => {
    const inputBytes = await fs.readFile(input); evidence.fixtureSha256 = digest(inputBytes); check(expected.id === 'original-hinge-picking' && !expected.mates.length, 'Original separated pointer fixture');
    await waitFor('initial renderer readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial discard', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]'); let event = await response(before.serial, 'build-assembly'), base = { document: event.document, scene: event.response.value };
    check(canonical(base.document) === canonical(expected), 'Exact actual Open'); geometry(base.scene, base.document); await recovery(base.document, 'Open');
    await control('select[aria-label="Tipo de relación"]', 'hinge'); await control('input[aria-label="Nombre de bisagra"]', name); await control('select[aria-label="Alineación de ejes de bisagra"]', 'aligned');
    const refs = originalReferences(base.scene), groundWall = [-1 / Math.sqrt(2.69), 1.3 / Math.sqrt(2.69), 3.5], movingWallLocal = [-Math.SQRT1_2, Math.SQRT1_2, .5],
      movingWall = placed(expected.occurrences[1].pose, movingWallLocal), movingCap = placed(expected.occurrences[1].pose, [5, 0, 0]);
    let projected = await projection(base.scene, [5, 0, 4]); await arm(0); let beforeFields = await fields(), serial = (await observe()).serial, stored = await page(() => localStorage.getItem('solidflow.autosave'));
    await hit(projected.point); await noIntentChange('actual planar face rejected for cylindrical-axis role', beforeFields, serial, stored);
    projected = await projection(base.scene, groundWall); await arm(0); beforeFields = await fields(); serial = (await observe()).serial; stored = await page(() => localStorage.getItem('solidflow.autosave'));
    await pointer('mouseMoved', projected.point); await pointer('mousePressed', projected.point, 1); await click(picker(0));
    await waitFor('picking explicitly canceled before release', () => page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === ''));
    await pointer('mouseReleased', projected.point); await noIntentChange('canceled armed gesture late release', beforeFields, serial, stored);
    await selectMoving(); projected = await projection(base.scene, movingWall); before = await observe();
    (await assemblyNavigation.panel('properties'), await page(() => { const list = [...document.querySelectorAll('label.assembly-check')].filter(e => e.textContent.trim() === 'Visible'); if (list.length !== 1) throw Error('Unique Visible checkbox'); const input = list[0].querySelector('input'); if (!input.checked || input.disabled) throw Error('Visible original moving leaf'); input.click(); }));
    event = await response(before.serial, 'build-assembly'); const hidden = event.document; check(body(event.response.value, 'moving').visible === false, 'Actual source visibility hides the moving native body'); await recovery(hidden, 'Hide moving'); await frames();
    await arm(1); beforeFields = await fields(); serial = (await observe()).serial; stored = await page(() => localStorage.getItem('solidflow.autosave')); await hit(projected.point);
    await noIntentChange('hidden source at retained material pixel', beforeFields, serial, stored); await click(picker(1)); base = await history('Deshacer', expected);
    await control('input[aria-label="Nombre de bisagra"]', name); await control('select[aria-label="Alineación de ejes de bisagra"]', 'aligned');
    await pick(base, 0, refs.line, [10, -2, 2], { edge: true });
    await pick(base, 0, refs.references[0], groundWall);
    await pick(base, 1, refs.references[1], movingWall);
    await pick(base, 2, refs.references[2], [5, 0, 4]);
    await pick(base, 3, refs.references[3], movingCap);
    event = await preview('Añadir bisagra'); ready(event, refs.references, 'Four actual face picks Cancel'); await cancel(base);
    event = await preview('Añadir bisagra'); ready(event, refs.references, 'Four actual face picks retry'); base = await apply(event, 'Pointer author Apply'); const authored = base.document;
    await history('Deshacer', expected); base = await history('Rehacer', authored);
    await click('button[aria-label="Editar bisagra ' + name + '"]');
    const editFields = await fields(), editSerial = (await observe()).serial;
    await control('select[aria-label="Eje B de bisagra"]', ''); const clearedFields = await fields();
    check(clearedFields[1] === '' && editFields.every((value, slot) => slot === 1 || clearedFields[slot] === value), 'Clearing edit Eje B preserves the other three full roles');
    check(await page(() => { const list = [...document.querySelectorAll('.assembly-hinge-panel button')].filter(e => e.textContent.trim() === 'Verificar edición de bisagra'); return list.length === 1 && list[0].disabled; }), 'Incomplete edit cannot submit');
    check((await observe()).serial === editSerial, 'Clearing a draft edit performs no native request'); await recovery(base.document, 'Incomplete edit preserves committed recovery');
    await pick(base, 1, refs.references[1], [-1 / Math.sqrt(2.69), 1.3 / Math.sqrt(2.69), 7.5], { reselect: true });
    name = 'Bisagra reseleccionada'; await control('input[aria-label="Nombre de bisagra"]', name); event = await preview('Verificar edición de bisagra'); ready(event, refs.references, 'Current material edit reselect Cancel'); await cancel(base);
    event = await preview('Verificar edición de bisagra'); ready(event, refs.references, 'Edit retry'); base = await apply(event, 'Pointer edit Apply'); const edited = base.document;
    await history('Deshacer', authored); base = await history('Rehacer', edited);
    // A free hinge does not select a unique initial roll. Obtain its actual
    // material X basis, then request the bounded delta to the literal +90 pose.
    const X = sub(vertex(base.scene, 'moving', [10, 2, 4]), vertex(base.scene, 'moving', [-2, 2, 4])).map(x => x / 12), theta = Math.atan2(X[1], X[0]), deltaDegrees = 90 - theta * 180 / Math.PI;
    evidence.motionIntent = { materialX: X, theta, deltaDegrees, sourceOccurrence: base.document.occurrences.find(o => o.id === 'moving') };
    await selectMoving(); await control('select[aria-label="Eje local del movimiento"]', '2');
    for (const [axis, value] of [['X', '0'], ['Y', '0'], ['Z', '4']]) await control('input[aria-label="Destino local ' + axis + ' del componente"]', value);
    await control('input[aria-label="Giro local del movimiento en grados"]', String(deltaDegrees)); before = await observe(); await click('button[aria-label="Vista previa del movimiento"]'); event = await response(before.serial, 'move-assembly-component-motion');
    if (event.response.value.status !== 'ready') evidence.rejectedMotion = { document: event.document, request: event.motion, response: event.response.value, priorNativeReport: evidence.phases.at(-1) };
    ready(event, refs.references, 'Actual measured-spin delta to90', true, true); const motion = event.response.value.motion;
    check(motion && motion.frame === 'local' && motion.axis === 2 && motion.sampledOnly === true && motion.temporaryAnchor === true
      && Number.isInteger(motion.stationCount) && motion.stationCount >= 1 && Number.isInteger(motion.verifiedStations) && motion.verifiedStations >= 1 && motion.stationCount === motion.verifiedStations
      && [motion.requestedAngle, motion.evaluatedAngle, motion.windingResidual, motion.windingTolerance, motion.maxAngularStep].every(Number.isFinite)
      && Math.abs(motion.requestedAngle - deltaDegrees * Math.PI / 180) <= 1e-12 && motion.windingTolerance === 1e-8 && motion.windingResidual >= 0 && motion.windingResidual <= motion.windingTolerance && motion.maxAngularStep > 0, 'Actual verified discrete motion stations and requested winding');
    base = await apply(event, 'Material90 Apply', true); const accepted = base.document;
    await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)'); await waitFor('actual original Save As', async () => { if (dialogCounts().saves !== 1 || !ipc.some(v => v.channel === 'document:save' && v.completed)) return false;
      try { return canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(accepted); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }); const savedBytes = await fs.readFile(output);
    before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(accepted), 'Exact pointer-authored hinge reopening'); base = { document: event.document, scene: event.response.value }; geometry(base.scene, base.document, true); await recovery(base.document, 'Reopen');
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly'); ready(event, refs.references, 'Fresh reopened native hinge', false, true); await cancel(base);
    await click('button[aria-label="Editar bisagra ' + name + '"]'); await page(() => document.querySelector('.assembly-hinge-panel')?.scrollIntoView({ block: 'center' })); await capture(base.document); await button('Cancelar edición de bisagra'); await recovery(base.document, 'Final edit Cancel');
    check(evidence.pointerHits.length === 6 && evidence.pointerHits.filter(p => p.edge).length === 1 && evidence.pointerHits.filter(p => p.reselect).length === 1, 'Four author face picks, one staged LINE and one current face edit reselect');
    check(evidence.negatives.length === 3 && dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Three bounded negative interactions and exact two Open/one Save As');
    check((await fs.readFile(input)).equals(inputBytes) && (await fs.readFile(output)).equals(savedBytes), 'Original and saved files stay byte-identical');
    check(ipc.every(v => v.completed) && !consoleErrors.length && !failedRequests.length && protocolResponses.every(v => v.status >= 200 && v.status < 400), 'No file/runtime/resource errors');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: accepted, freeSpinBeforeMotionRad: theta, requestedDeltaDegrees: deltaDegrees,
      limits: 'One original separated/tilted drilled-leaf pair, actual CDP four-face authoring, one staged LINE restored to a cylinder before authoring, one face edit reselect. Wrong-purpose, hidden material pixel and canceled armed gesture release are bounded actual interactions; no claim of a callback-before-render race or saved LINE authoring. Free initial spin is observed, not prescribed. No external app policy, arbitrary cameras/occlusion, human file dialogs or platform support claim.' });
  };
};
