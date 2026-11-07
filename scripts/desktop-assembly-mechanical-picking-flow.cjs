'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// These two fixed cases reuse the original plate/pins and shaft/slider fixtures.
// Material hits use CDP points projected from literal standard-view bases. The
// observed native catalogue supplies the expected full identity, never an event,
// renderer reference, camera state, solver reply or capability substitution.
module.exports = function mechanicalPickingWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const { family, expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts, assemblyNavigation } = context;
  check(family === 'gear' || family === 'screw', 'Only the two fixed mechanical picking cases.');
  const gear = family === 'gear', noun = gear ? 'engranaje' : 'tornillo', label = gear ? 'Engranaje por caras' : 'Tornillo por caras';
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', SOLVE = 'button[aria-label="Resolver ensamblaje"]',
    CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]', MOVE = 'button[aria-label="Vista previa del movimiento"]';
  const evidence = { scenario: 'original-' + family + '-material-picking', phases: [], hits: [], negatives: [] }; checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const close = (a, b, tolerance, message) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, message + ': ' + a + ' expected ' + b);
  const vector = (a, b, tolerance, message) => { check(Array.isArray(a) && a.length === b.length, message + ' dimensions'); a.forEach((v, i) => close(v, b[i], tolerance, message + '[' + i + ']')); };
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const idle = name => waitFor(name, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  const record = (phase, event) => evidence.phases.push({ phase, serial: event.serial, action: event.action, hasToken: event.hasToken,
    current: event.current, proposed: event.proposed, request: event.request, motion: event.motion, document: event.document, response: event.response.value });
  async function button(text, parent = '.assembly-app') {
    await assemblyNavigation.button(text, parent);
    await page((text, parent) => { const rows = [...document.querySelectorAll(parent + ' button')].filter(b => b.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact enabled button: ' + text); rows[0].click(); }, text, parent);
  }
  async function control(selector, value) {
    await assemblyNavigation.reveal(selector);
    await page((selector, value) => { const e = document.querySelector(selector);
      if (!e || e.disabled) throw Error('Enabled control: ' + selector);
      const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Actual option missing.');
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, selector, value);
    await waitFor('recorded control ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function response(serial, action) {
    return waitFor('actual native ' + action, async () => { const state = await observe(); check(!state.workerErrors.length, 'Worker error.');
      const event = state.assemblies.filter(v => v.serial > serial && v.action === action && v.response).at(-1);
      if (!event) return false; check(event.response.ok, event.response.error || 'Native RPC failed.'); return event; });
  }
  function body(scene, id) { const rows = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id])); check(rows.length === 1, 'Exact original body ' + id); return rows[0]; }
  function face(scene, id, kind, value, x = 0) {
    const rows = body(scene, id).faces.filter(f => f.support?.kind === kind && (kind === 'cylinder'
      ? Math.abs(f.support.radius - value) < 1e-10 && Math.abs(f.support.point[0] - x) < 1e-9 && Math.abs(f.support.point[1]) < 1e-9
      : Math.abs(f.support.point[2] - value) < 1e-9 && f.support.normal[2] > .99));
    check(rows.length === 1, 'One original native ' + kind + ' ' + id + '/' + value + '/' + x); return rows[0];
  }
  const faceKey = f => JSON.stringify([JSON.stringify([f.selection.component.occurrencePath, f.selection.component.definition.id, f.selection.component.definition.revision]),
    f.selection.body ? [f.selection.body.bodyId, f.selection.body.sourceFeatureId] : null, f.selection.face.sourceFeatureId, f.selection.face.key]);
  const reference = f => ({ kind: 'face', ...f.selection, support: f.support.kind === 'plane' ? 'plane' : 'axis' });
  function geometry(scene, doc, seated = true) {
    check(scene?.solidCount === 3 && scene.prototypeCount === (gear ? 2 : 3) && scene.bodies.length === 3 && !scene.warnings.length, 'Three original valid native solids and exact prototype count.');
    close(scene.volume, gear ? 4800 + 45 * Math.PI / 2 : 5400 + 357 * Math.PI / 8, 1e-5, 'Independent original volume');
    close(scene.area, gear ? 2960 + 543 * Math.PI / 4 : 3400 + 1331 * Math.PI / 8, 1e-5, 'Independent original area');
    check(canonical(doc.definitions) === canonical(expected.definitions), 'Mechanical operation preserves exact original source definitions.');
    for (const b of scene.bodies) {
      const original = expected.occurrences.find(o => o.id === b.component.occurrencePath[0]);
      const occurrence = doc.occurrences.find(o => o.id === b.component.occurrencePath[0]);
      check(original && b.solidCount === 1 && canonical(b.component.definition) === canonical(original.definition)
        && canonical(b.worldPose) === canonical(occurrence.pose), 'Native scene retains exact source revision and saved placement.');
    }
    vector(doc.occurrences[0].pose.translation, [0, 0, 0], 1e-12, 'Fixed origin'); vector(doc.occurrences[0].pose.rotation, [0, 0, 0, 1], 1e-12, 'Fixed orientation');
    if (!seated) return;
    if (gear) {
      vector(scene.bounds.min, [-20, -15, -8], 1e-6, 'Gear lower bounds'); vector(scene.bounds.max, [20, 15, 4], 1e-6, 'Gear upper bounds');
      for (const id of ['left', 'right']) { vector(body(scene, id).worldPose.translation, [id === 'left' ? -10 : 10, 0, -8], 1e-6, id + ' bearing centre');
        vector(face(scene, id, 'cylinder', 2).worldSupport.axis, [0, 0, -1], 1e-8, id + ' actual directed shaft axis'); }
    } else {
      const nut = doc.occurrences.find(o => o.id === 'nut'); vector(body(scene, 'shaft').worldPose.translation, [0, 0, -8], 1e-6, 'Axially stopped shaft');
      vector(nut.pose.translation.slice(0, 2), [0, 0], 1e-6, 'Nut remains laterally guided'); close(Math.hypot(...nut.pose.rotation.slice(0, 3)), 0, 1e-8, 'Nut stays nonrotating');
      vector(scene.bounds.min, [-20, -15, Math.min(-8, nut.pose.translation[2])], 1e-5, 'Screw lower bounds');
      vector(scene.bounds.max, [20, 15, Math.max(22, nut.pose.translation[2] + 6)], 1e-5, 'Screw upper bounds');
      for (const [id, r] of [['shaft', 2], ['nut', 2.5], ['ground', 3]]) { const s = face(scene, id, 'cylinder', r).worldSupport;
        vector(s.axis, [0, 0, -1], 1e-8, id + ' native directed axis'); vector(s.point.slice(0, 2), [0, 0], 1e-6, id + ' coaxiality'); }
    }
  }
  function ready(event, count, dof, seated = true) {
    const v = event.response.value; check(v?.status === 'ready' && v.hasToken && v.document.mates.length === count, 'Authenticated current mechanical candidate.');
    check(v.scopes.length === 1 && v.scopes[0].result.localDOF === dof, 'Independent native mobility: expected ' + dof);
    const active = v.document.mates.filter(m => !m.suppressed);
    check(v.checks.length === active.length && active.every(m => v.checks.some(c => c.constraintId === JSON.stringify([[], m.id]) && c.satisfied
      && c.lengthResidual <= c.lengthTolerance && c.angleResidual <= c.angleTolerance)), 'Each exact scoped native relation is freshly satisfied.');
    geometry(v.scene, v.document, seated); return v;
  }
  const mate = doc => { const rows = doc.mates.filter(m => m.type === family); check(rows.length === 1, 'One captured mechanical family.'); return rows[0]; };
  function marker(scene, id) {
    const b = body(scene, id), rows = b.faces.filter(f => f.support?.kind === 'cylinder' && Math.abs(f.support.radius - .25) < 1e-10);
    check(rows.length === 1 && rows[0].worldSupport?.kind === 'cylinder', 'Independent eccentric marker ' + id);
    const p = rows[0].worldSupport.point.map((v, i) => v - b.worldPose.translation[i]); close(Math.hypot(p[0], p[1]), 1, 1e-6, 'Marker radius'); return p;
  }
  function mechanical(scene, doc, baselineScene) {
    geometry(scene, doc); const m = mate(doc);
    if (gear) {
      close(m.ratio.numerator, 1, 1e-12, 'Numerator'); close(m.ratio.denominator, 2, 1e-12, 'Denominator');
      check(m.direction === 'opposed', 'Opposed angular coupling');
      if (baselineScene) for (const [id, turn] of [['left', 2 * Math.PI / 3], ['right', -Math.PI / 3]]) {
        const a = marker(baselineScene, id), b = marker(scene, id);
        vector(b.slice(0, 2), [a[0] * Math.cos(turn) - a[1] * Math.sin(turn), a[0] * Math.sin(turn) + a[1] * Math.cos(turn)], 1e-6, id + ' independent material rotation');
      }
    } else {
      close(m.lead, 2, 1e-12, 'Canonical lead mm/turn'); close(m.neutralTravel, -18, 1e-6, 'Captured original axial neutral');
      check(m.alignment === 'aligned' && !m.reverse, 'Original axial direction');
      const shaft = doc.occurrences.find(o => o.id === 'shaft'), nut = doc.occurrences.find(o => o.id === 'nut');
      close(-(nut.pose.translation[2] - shaft.pose.translation[2]) - m.neutralTravel, m.lead * m.angle / (2 * Math.PI), 1e-6, 'Independent directed helical law');
      vector(marker(scene, 'shaft').slice(0, 2), [Math.cos(-m.angle), Math.sin(-m.angle)], 1e-6, 'Eccentric native marker and lifted angle');
    }
    return m;
  }
  async function recovery(doc, name) { await waitFor(name + ' committed recovery', async () => await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false')
    && canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(doc)); }
  async function apply(event, name, seated = true) {
    await idle(name + ' preview idle'); await waitFor(name + ' Apply', () => page(s => document.querySelector(s)?.disabled === false, APPLY));
    const serial = (await observe()).serial; await click(APPLY); const e = await response(serial, 'apply-assembly'), v = e.response.value;
    check(e.hasToken && v.kind === 'assembly-applied', 'Native Apply authority');
    check(canonical({ ...v.document, updatedAt: event.response.value.document.updatedAt }) === canonical(event.response.value.document), 'Apply keeps exact candidate except timestamp');
    geometry(v.scene, v.document, seated); await recovery(v.document, name); record(name + '/apply', e); return { document: v.document, scene: v.scene };
  }
  async function cancel(base, name) {
    const serial = (await observe()).serial; await click(CANCEL); const e = await response(serial, 'discard-assembly'); check(e.hasToken, 'Cancel discards native authority');
    await recovery(base.document, name); check(await page(s => document.querySelector(s)?.disabled === true, APPLY), 'Cancel revokes Apply'); record(name, e);
  }
  async function add(name, type, a, b, count, dof, alignment = 'aligned', distance) {
    for (const [i, f] of [a, b].entries()) {
      await assemblyNavigation.panel('relations');
      await page(i => { const rows = [...document.querySelectorAll('.assembly-endpoints button')].filter(b => b.querySelector('strong')?.textContent.trim() === 'Referencia ' + (i + 1));
        if (rows.length !== 1 || rows[0].disabled) throw Error('Enabled ordinary role.'); rows[0].click(); }, i);
      await control('select[aria-label="Cara de referencia"]', faceKey(f)); await button('Usar cara en referencia ' + (i + 1));
    }
    await control('input[aria-label="Nombre de la relación"]', name); await control('select[aria-label="Tipo de relación"]', type);
    await control('select[aria-label="Orientación de la relación"]', alignment);
    if (distance !== undefined) await control('input[aria-label="Distancia firmada"]', String(distance));
    const serial = (await observe()).serial; await button('Vista previa de la nueva relación'); const e = await response(serial, 'preview-assembly'), v = ready(e, count, dof, false), m = v.document.mates.at(-1);
    check(m.name === name && m.type === type && canonical(m.first) === canonical(reference(a)) && canonical(m.second) === canonical(reference(b)), 'Original ordinary bearing identities');
    record(name + '/preview', e); return apply(e, name, false);
  }
  async function solve(base, dof) { const serial = (await observe()).serial; await click(SOLVE); const e = await response(serial, 'preview-assembly');
    ready(e, base.document.mates.length, dof); await idle('fresh global Solve'); record('global-solve', e); return e; }
  const picker = slot => 'button[aria-label="Seleccionar eje ' + (slot + 1) + ' del ' + noun + ' en el modelo"]';
  const fields = () => page(noun => [1, 2].map(i => document.querySelector('select[aria-label="Eje ' + i + ' del ' + noun + '"]')?.value), noun);
  async function arm(slot) {
    await click(picker(slot)); await waitFor('current material role ' + slot, () => page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === 'face', picker(slot)));
  }
  async function projection(scene, world) {
    const view = gear ? 'bottom' : 'iso', selector = 'select[aria-label="Orientación de vista"]'; await assemblyNavigation.reveal(selector);
    await page((selector, view) => { const e = document.querySelector(selector);
      if (!e || e.disabled || ![...e.options].some(o => o.value === view && !o.disabled)) throw Error('Enabled standard orientation command');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, view); e.dispatchEvent(new Event('change', { bubbles: true })); }, selector, view);
    await frames();
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const bounds = scene.visibleBounds, center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2), span = Math.max(1, Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i]))),
      pixels = rect.height / (1.3 * span), r = world.map((v, i) => v - center[i]);
    // Existing standard-view convention: world Y up. No camera/ref state read or written.
    const point = { x: rect.x + rect.width / 2 + (gear ? r[0] : (r[0] - r[2]) / Math.sqrt(2)) * pixels,
      y: rect.y + rect.height / 2 - (gear ? r[2] : (-r[0] + 2 * r[1] - r[2]) / Math.sqrt(6)) * pixels };
    check(point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height, 'Projected literal material witness inside canvas');
    return { point, world, view, rect, center, span, pixelsPerMm: pixels };
  }
  async function hit(point) { await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point); await frames(); }
  async function unchanged(before, name) {
    check(canonical(await fields()) === canonical(before.fields) && (await observe()).serial === before.serial
      && await page(() => localStorage.getItem('solidflow.autosave')) === before.recovery, name + ' keeps roles, native work and recovery'); evidence.negatives.push({ name, ...before });
  }
  const state = async () => ({ fields: await fields(), serial: (await observe()).serial, recovery: await page(() => localStorage.getItem('solidflow.autosave')) });
  async function pick(scene, slot, selected, world) {
    const projected = await projection(scene, world); await arm(slot); const before = await state(); await hit(projected.point);
    const actual = await fields(); evidence.hits.push({ slot, expectedKey: faceKey(selected), actualKey: actual[slot], reference: reference(selected), ...projected });
    await waitFor('actual full cylinder selected for role ' + slot, () => page((noun, slot, key) => document.querySelector('select[aria-label="Eje ' + (slot + 1) + ' del ' + noun + '"]')?.value === key, noun, slot, faceKey(selected)));
    check(actual[1 - slot] === before.fields[1 - slot] && (await observe()).serial === before.serial
      && await page(() => localStorage.getItem('solidflow.autosave')) === before.recovery, 'Material hit changes only the intended role');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false', picker(slot)), 'Successful hit disarms role');
  }
  async function parameters() {
    await control('input[aria-label="Nombre del ' + noun + '"]', label);
    if (gear) { await control('input[aria-label="Numerador del engranaje"]', '1'); await control('input[aria-label="Denominador del engranaje"]', '2');
      await control('select[aria-label="Sentido del engranaje"]', 'opposed'); await control('select[aria-label="Portador del engranaje"]', JSON.stringify(['plate'])); }
    else { await control('input[aria-label="Avance del tornillo"]', '2'); await control('select[aria-label="Orientación de los ejes del tornillo"]', 'aligned'); }
  }
  async function captureMate(scene, baseCount) {
    await parameters(); const serial = (await observe()).serial; await click('button[aria-label="Capturar ' + noun + '"]'); const e = await response(serial, 'capture-assembly-' + family), v = ready(e, baseCount + 1, 1), m = mechanical(v.scene, v.document);
    const ids = gear ? ['left', 'right'] : ['shaft', 'nut'], radii = gear ? [2, 2] : [2, 2.5];
    check(canonical(m.first) === canonical(reference(face(scene, ids[0], 'cylinder', radii[0])))
      && canonical(m.second) === canonical(reference(face(scene, ids[1], 'cylinder', radii[1]))) && m.name === label, 'Captured native roles equal the two actual viewport hits');
    if (gear) { close(m.angles.first, 0, 1e-8, 'Captured first neutral'); close(m.angles.second, 0, 1e-8, 'Captured second neutral'); }
    else close(m.angle, 0, 1e-8, 'Captured zero winding'); record('capture/' + family, e); return e;
  }
  async function select(id) {
    const name = expected.occurrences.find(o => o.id === id).name; await assemblyNavigation.panel('components');
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(e => e.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact moving component row'); rows[0].click(); }, name);
    await waitFor('selected original driver', () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, name));
  }
  async function motion(base) {
    const id = gear ? 'left' : 'shaft', degrees = gear ? 120 : 720; await select(id); const pose = base.document.occurrences.find(o => o.id === id).pose;
    for (const [i, axis] of ['X', 'Y', 'Z'].entries()) await control('input[aria-label="Destino local ' + axis + ' del componente"]', String(pose.translation[i]));
    await control('select[aria-label="Eje local del movimiento"]', '2'); await control('input[aria-label="Giro local del movimiento en grados"]', String(degrees));
    const saved = await page(() => localStorage.getItem('solidflow.autosave')), serial = (await observe()).serial; await click(MOVE);
    const e = await response(serial, 'move-assembly-component-motion'), v = ready(e, gear ? 5 : 4, 0), m = mechanical(v.scene, v.document, gear ? base.scene : undefined);
    check(v.motion?.sampledOnly && v.motion.verifiedStations === v.motion.stationCount && v.motion.windingResidual <= v.motion.windingTolerance, 'Native sampled winding witness');
    close(v.motion.requestedAngle, degrees * Math.PI / 180, 1e-12, 'Independent requested physical turn');
    if (gear) { close(m.angles.first, -2 * Math.PI / 3, 1e-8, 'Native directed driver lift'); close(m.angles.second, Math.PI / 3, 1e-8, 'Native directed follower lift'); }
    else { close(m.angle, -4 * Math.PI, 1e-8, 'Native two-turn lifted angle'); close(v.document.occurrences.find(o => o.id === 'nut').pose.translation[2], 14, 1e-6, 'Two positive world turns move nut +4mm'); }
    await idle('motion preview ready'); check(await page(() => localStorage.getItem('solidflow.autosave')) === saved, 'Motion preview keeps recovery'); record('motion/' + degrees, e); return e;
  }
  async function history(action, doc) {
    const serial = (await observe()).serial; await click('button[aria-label="' + action + ' ensamblaje"]'); const e = await response(serial, 'build-assembly');
    check(canonical(e.document) === canonical(doc), 'Exact history bytes ' + action); mechanical(e.response.value, doc); await recovery(doc, action); record('history/' + action, e);
  }
  async function toolOwnership() {
    await control('select[aria-label="Tipo de relación"]', 'concentric'); await control('select[aria-label="Tipo de relación"]', family);
    await select(gear ? 'left' : 'shaft'); await assemblyNavigation.panel('relations');
    await arm(0); const before = await state(); await click('button[aria-label="Arrastrar giro"]');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false'
      && document.querySelector('button[aria-label="Arrastrar giro"]')?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', picker(0)), 'Drag takes ownership and disarms material picking');
    await click('button[aria-label="Desactivar manipulador"]'); await unchanged(before, 'drag ownership and stop');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false', picker(0)), 'Stopping drag does not revive old pick');
    await arm(0); await click('button[aria-label="Editar ' + noun + ' ' + label + '"]');
    check(await page(selector => !document.querySelector(selector), picker(0)), 'Saved editor retains existing references without new-capture controls');
    await click('button[aria-label="Cancelar edición del ' + noun + '"]');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', picker(0)), 'Closing saved editor never revives previous material intent');
    await unchanged(before, 'saved editor open/close ownership');
  }
  return async () => {
    const original = await fs.readFile(input); evidence.fixtureSha256 = digest(original);
    check(expected.id === (gear ? 'ui-assembly' : 'assembly-screw-original') && expected.mates.length === 0, 'Original unmated fixture only');
    await waitFor('real renderer ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'
      && typeof window.require === 'undefined' && typeof window.process === 'undefined'), initialReadyMs);
    let serial = (await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial original fixture replacement', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]'); let e = await response(serial, 'build-assembly'), base = { document: e.document, scene: e.response.value };
    check(canonical(base.document) === canonical(expected), 'Exact native fixture admission'); geometry(base.scene, base.document, false); await recovery(base.document, 'Open'); record('Open', e);
    // Baseline selection is available without a relation preview/token. Arming
    // alone grants neither Capture nor Apply and Cancel preserves all CAD bytes.
    await control('select[aria-label="Tipo de relación"]', family); const baseline = await state(); await arm(0);
    check(await page((noun, apply) => document.querySelector('button[aria-label="Capturar ' + noun + '"]')?.disabled === true && document.querySelector(apply)?.disabled === true, noun, APPLY), 'Base-scene pick grants no capture/Apply authority');
    await click('button[aria-label="Cancelar selección de ejes del ' + noun + '"]'); await unchanged(baseline, 'baseline role Cancel');
    await control('select[aria-label="Tipo de relación"]', 'concentric');
    if (gear) {
      for (const [id, x, count, axisDof, capDof] of [['left', -10, 1, 8, 7], ['right', 10, 3, 3, 2]]) {
        const a = face(base.scene, id, 'cylinder', 2), b = face(base.scene, 'plate', 'cylinder', 3, x);
        base = await add('Eje ' + id, 'concentric', a, b, count, axisDof, a.support.axis[2] * b.support.axis[2] > 0 ? 'aligned' : 'opposed');
        base = await add('Tope ' + id, 'coincident', face(base.scene, id, 'plane', 12), face(base.scene, 'plate', 'plane', 4), count + 1, capDof);
      }
    } else {
      base = await add('Cojinete del eje', 'concentric', face(base.scene, 'shaft', 'cylinder', 2), face(base.scene, 'ground', 'cylinder', 3), 1, 8);
      base = await add('Tope del eje', 'distance', face(base.scene, 'shaft', 'plane', 30), face(base.scene, 'ground', 'plane', 4), 2, 7, 'aligned', 18);
      base = await add('Guía de la corredera', 'concentric', face(base.scene, 'nut', 'cylinder', 2.5), face(base.scene, 'ground', 'cylinder', 3), 3, 3);
      await solve(base, 3); serial = (await observe()).serial; await click('button[aria-label="Bloquear giro Guía de la corredera"]'); e = await response(serial, 'lock-assembly-rotation'); ready(e, 3, 2); record('nut/spin-lock', e); base = await apply(e, 'nut/spin-lock');
    }
    geometry(base.scene, base.document);
    const ids = gear ? ['left', 'right'] : ['shaft', 'nut'], radii = gear ? [2, 2] : [2, 2.5],
      points = gear ? [[-10, -2, -4], [10, -2, -4]] : [[Math.SQRT2, Math.SQRT2, 20], [-2.4, .7, 15.6]],
      planePoint = gear ? [0, -15, 2] : [15, 10, 4];
    // Genuine baseline material acquisition precedes any native relation token.
    await control('select[aria-label="Tipo de relación"]', family);
    await pick(base.scene, 0, face(base.scene, ids[0], 'cylinder', radii[0]), points[0]);
    await pick(base.scene, 1, face(base.scene, ids[1], 'cylinder', radii[1]), points[1]);
    check(await page((noun, apply) => document.querySelector('button[aria-label="Capturar ' + noun + '"]')?.disabled === true && document.querySelector(apply)?.disabled === true, noun, APPLY), 'Two base-scene hits still grant no native Capture/Apply capability');
    await control('select[aria-label="Tipo de relación"]', 'concentric'); await control('select[aria-label="Tipo de relación"]', family);
    e = await solve(base, 2); let pickScene = e.response.value.scene;
    let p = await projection(pickScene, planePoint); await arm(0); let before = await state(); await hit(p.point); await unchanged(before, 'incompatible planar hit');
    check(await page(() => document.querySelector('.assembly-status.error')?.textContent.includes('Selecciona una cara cilíndrica actual')), 'Incompatible material hit gives actionable cylinder guidance');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true', picker(0)), 'Incompatible hit keeps intended role armed');
    await click('button[aria-label="Cancelar selección de ejes del ' + noun + '"]'); await unchanged(before, 'role Cancel after incompatible hit');
    await pick(pickScene, 0, face(pickScene, ids[0], 'cylinder', radii[0]), points[0]);
    p = await projection(pickScene, points[0]); await arm(1); before = await state(); await hit(p.point); await unchanged(before, 'second axis cannot repeat first component');
    check(await page(() => document.querySelector('.assembly-status.error')?.textContent.includes('Selecciona un cilindro de otro componente')), 'Same-component hit gives actionable role guidance');
    await click('button[aria-label="Cancelar selección de ejes del ' + noun + '"]');
    await pick(pickScene, 1, face(pickScene, ids[1], 'cylinder', radii[1]), points[1]);
    const bearing = base, baseCount = base.document.mates.length; e = await captureMate(pickScene, baseCount); await cancel(bearing, 'capture/Cancel');
    // Retry through fresh native authority and two new actual material hits.
    await control('select[aria-label="Tipo de relación"]', 'concentric'); await control('select[aria-label="Tipo de relación"]', family);
    e = await solve(bearing, 2); pickScene = e.response.value.scene;
    await pick(pickScene, 0, face(pickScene, ids[0], 'cylinder', radii[0]), points[0]); await pick(pickScene, 1, face(pickScene, ids[1], 'cylinder', radii[1]), points[1]);
    e = await captureMate(pickScene, baseCount); base = await apply(e, 'capture/retry'); const neutral = base;
    await toolOwnership();
    e = await motion(base); await cancel(base, 'motion/Cancel'); e = await motion(base); base = await apply(e, 'motion/retry'); const moved = base;
    await history('Deshacer', neutral.document); await history('Rehacer', moved.document);
    await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)'); await waitFor('native Save exact bytes', async () => { try { return canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(base.document); } catch { return false; } });
    await idle('saved idle'); serial = (await observe()).serial; await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); e = await response(serial, 'build-assembly');
    check(canonical(e.document) === canonical(base.document), 'Save/Open exact graph and lifted state'); mechanical(e.response.value, e.document, gear ? neutral.scene : undefined); record('Save/Open', e); await recovery(base.document, 'reopened');
    e = await solve(base, 1); const v = ready(e, baseCount + 1, 1); mechanical(v.scene, v.document, gear ? neutral.scene : undefined);
    check(canonical(v.document.mates) === canonical(base.document.mates), 'Fresh Solve preserves captured frames, full reference identities and saved lifted angles'); await cancel(base, 'fresh Solve/Cancel');
    await control('select[aria-label="Tipo de relación"]', 'concentric'); await control('select[aria-label="Tipo de relación"]', family); await capture(base.document);
    const final = await observe(); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'No renderer/request/worker errors');
    check(final.assemblyUi.some(v => v.busy && v.applyDisabled) && final.assemblyUi.filter(v => v.busy).every(v => v.applyDisabled), 'Apply disabled during actual pending native work');
    check(protocolResponses.some(v => /kernel\.worker-[\w-]+\.js$/.test(v.url) && v.status === 200) && protocolResponses.some(v => v.url.endsWith('.wasm') && v.status === 200), 'Production worker/WASM loaded');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().csvExports === 0 && ipc.every(v => v.completed), 'Exact isolated native dialog/IPC counts');
    check(digest(await fs.readFile(input)) === digest(original), 'Original fixture remains untouched');
    Object.assign(evidence, { finalDocument: base.document, savedSha256: digest(await fs.readFile(output)),
      independentOracles: gear ? 'V4800+45pi/2/A2960+543pi/4 1e-5; bearing/bounds1e-6; axes1e-8; literal material clicks; driver+120/follower-60 worldZ eccentric-marker1e-6; native lifts-120/+60 1e-8rad.'
        : 'V5400+357pi/8/A3400+1331pi/8 1e-5; coaxial/travel1e-6; axes1e-8; literal material clicks; two+worldZ turns drive nut+4mm; liftedangle-4pi1e-8; neutral-18mm.',
      limits: 'Two fixed original standard assemblies; actual CDP clicks and scripted visible forms, not physical human input. No general cylinder visibility, configured specialized picking, collision, thread/tooth contact, installed package or other-platform claim.' });
  };
};
