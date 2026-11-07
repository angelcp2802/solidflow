'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Original drilled rectangular leaves. Production controls, native worker and
// actual file IPC supply every document, geometric result and Apply capability.
module.exports = function hingeWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, evaluate, observe, waitFor, click, capture, checks, protocolResponses, consoleErrors, failedRequests,
    ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]',
    SUMMARY = '[aria-label="Bisagra verificada"]', PANEL = '.assembly-hinge-panel', evidence = { scenario: 'original-unlimited-hinge-lifecycle', phases: [] };
  checks.push(evidence);
  let name = 'Bisagra original', quarter = false, intent;
  const roles = ['Eje A de bisagra', 'Eje B de bisagra', 'Plano axial A de bisagra', 'Plano axial B de bisagra'];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); if (json === undefined) throw Error('Expected JSON data argument');
    return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (actual, wanted, band, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= band, label + ': ' + actual + ' expected ' + wanted);
  const vector = (actual, wanted, band, label) => { check(Array.isArray(actual) && actual.length === wanted.length, label + ' shape'); actual.forEach((value, i) => near(value, wanted[i], band, label + '[' + i + ']')); };
  async function button(text, parent = '.assembly-app') { await assemblyNavigation.button(text, parent); await page((text, parent) => {
    const nodes = [...document.querySelectorAll(parent + ' button')].filter(node => node.textContent.trim() === text);
    if (nodes.length !== 1 || nodes[0].disabled) throw Error('Unique enabled button ' + text); nodes[0].click();
  }, text, parent); }
  async function control(selector, value) { await assemblyNavigation.reveal(selector);
    await page((selector, value) => { const element = document.querySelector(selector); if (!element || element.disabled) throw Error('Editable control ' + selector);
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (element instanceof HTMLSelectElement && ![...element.options].some(option => option.value === value && !option.disabled)) throw Error('Current option ' + value);
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('rendered ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function selectRole(label, reference) {
    const selector = 'select[aria-label="' + label + '"]';
    const values = await page((selector, reference) => {
      const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
      const select = document.querySelector(selector); if (!select || select.disabled) throw Error('Actual role selector');
      return [...select.options].filter(option => { if (!option.value || option.disabled) return false; try { return stable(JSON.parse(option.value)) === stable(reference); } catch { return false; } }).map(option => option.value);
    }, selector, reference);
    check(values.length === 1, 'One current full owner/body/producer option for ' + label); await control(selector, values[0]);
  }
  async function response(serial, action, allowError = false) { return waitFor('actual ' + action, async () => {
    const state = await observe(); check(!state.workerErrors.length, 'No worker runtime errors');
    const events = state.assemblies.filter(event => event.serial > serial && event.action === action && event.response);
    check(events.length <= 1, 'Unique worker operation ' + action); if (!events.length) return false;
    if (!allowError) check(events[0].response.ok, events[0].response.error || 'Worker rejected operation'); return events[0];
  }); }
  async function recovery(document, label) { await waitFor(label + ' exact committed recovery', async () => {
    const raw = await page(() => localStorage.getItem('solidflow.autosave'));
    return raw && canonical(JSON.parse(raw)) === canonical(document) && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false');
  }); }
  function body(scene, id) { const list = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([id])); check(list.length === 1, 'Exact original owner ' + id); return list[0]; }
  function vertex(scene, id, point) { const found = body(scene, id).vertexPoints.filter(value => value.point.every((x, i) => Math.abs(x - point[i]) < 1e-8)); check(found.length === 1, 'Unique material corner ' + id + ':' + point); return found[0]; }
  function geometry(scene, document, label, turn = quarter) {
    check(scene.solidCount === 2 && scene.bodies.length === 2 && scene.prototypeCount === 1 && !scene.warnings.length, label + ' two placed original solids/one prototype');
    near(scene.volume, 384 - 8 * Math.PI, 1e-5, label + ' literal total V'); near(scene.area, 448 + 12 * Math.PI, 1e-5, label + ' literal total A');
    check(canonical(document.definitions) === canonical(expected.definitions), label + ' complete original source cache unchanged');
    check(canonical(document.occurrences.find(o => o.id === 'ground')) === canonical(expected.occurrences.find(o => o.id === 'ground')), label + ' fixed ground and all its flags unchanged');
    for (const id of ['ground', 'moving']) {
      const b = body(scene, id); check(b.solidCount === 1 && b.body.bodyId === 'original-hinge-body' && b.body.sourceFeatureId === 'hole', label + ' current original body');
      near(b.volume, 192 - 4 * Math.PI, 1e-5, id + ' V'); near(b.area, 224 + 6 * Math.PI, 1e-5, id + ' A');
    }
    vector(body(scene, 'ground').bounds.min, [-2, -2, 0], 1e-6, 'Ground lower'); vector(body(scene, 'ground').bounds.max, [10, 2, 4], 1e-6, 'Ground upper');
    vector(body(scene, 'moving').bounds.min, [-2, -2, 4], 1e-6, 'Moving lower'); vector(body(scene, 'moving').bounds.max, turn ? [2, 10, 8] : [10, 2, 8], 1e-6, 'Moving upper');
    vector(vertex(scene, 'moving', [10, 2, 4]).worldPoint, turn ? [-2, 10, 8] : [10, 2, 8], 1e-6, 'Literal material spin corner');
    const P = vertex(scene, 'moving', [-2, 2, 4]).worldPoint, Q = vertex(scene, 'moving', [10, 2, 4]).worldPoint;
    vector(Q.map((value, i) => (value - P[i]) / 12), turn ? [0, 1, 0] : [1, 0, 0], 1e-8, 'Independent material X basis');
    for (const [id, z] of [['ground', 4], ['moving', 0]]) {
      const cap = body(scene, id).faces.filter(face => face.support?.kind === 'plane' && Math.abs(face.support.point[2] - z) < 1e-8 && Math.abs(face.support.normal[2]) > .99999);
      check(cap.length === 1 && cap[0].worldSupport?.kind === 'plane', 'Current actual axial cap ' + id);
      near(cap[0].worldSupport.point[2], 4, 1e-6, 'Independent common axial world plane');
    }
  }
  function chooseOriginal(scene) {
    const axis = id => { const found = body(scene, id).faces.filter(face => face.support?.kind === 'cylinder' && Math.abs(face.support.radius - 1) < 1e-8
      && Math.hypot(face.support.point[0], face.support.point[1]) < 1e-8); check(found.length === 1, 'Unique actual original hole axis ' + id); return { kind: 'face', ...found[0].selection, support: 'axis' }; };
    const plane = (id, z) => { const found = body(scene, id).faces.filter(face => face.support?.kind === 'plane' && Math.abs(face.support.point[2] - z) < 1e-8 && Math.abs(face.support.normal[2]) > .99999);
      check(found.length === 1, 'Unique actual original cap ' + id); return { kind: 'face', ...found[0].selection, support: 'plane' }; };
    return { axis: [axis('ground'), axis('moving')], axial: [plane('ground', 4), plane('moving', 0)], alignment: 'aligned' };
  }
  function ready(event, label, { suppressed = false, deleted = false, moving = false, turn = quarter } = {}) {
    const value = event.response.value; check(value.status === 'ready' && value.hasToken && value.checks.every(report => report.satisfied), label + ' real native ready capability');
    check(value.document.mates.length === (deleted ? 0 : 1), label + ' exact saved mate count');
    if (!deleted) {
      const mate = value.document.mates[0]; check(mate.type === 'hinge' && mate.name === name && mate.suppressed === suppressed, label + ' exact saved family/name/state');
      check(canonical({ axis: mate.axis, axial: mate.axial, alignment: mate.alignment }) === canonical(intent), label + ' all four exact saved roles and alignment');
    }
    const reports = value.hinges ?? []; check(reports.length === (suppressed || deleted ? 0 : 1), label + ' exact final native hinge report count');
    if (!suppressed && !deleted) {
      const r = reports[0]; check(r.kind === 'hinge' && r.status === 'ok' && r.satisfied && r.supportOnly === true && r.qualifiedRotation === true, label + ' actual independent analytic support report');
      check(r.mateId === value.document.mates[0].id && r.alignment === intent.alignment && canonical(r.scopePath) === canonical([])
        && canonical(r.componentPaths) === canonical({ axis: [['ground'], ['moving']], axial: [['ground'], ['moving']] }), label + ' report bound to all four exact roles and root scope');
      check(r.axisAngleRad + r.precision.directionRad <= r.angleToleranceRad, 'Combined native angular acceptance');
      check(r.transverseResidualMm + r.precision.positionMm <= r.lengthToleranceMm && Math.abs(r.axialOffsetMm) + r.precision.positionMm <= r.lengthToleranceMm, 'Combined native transverse/axial acceptance');
      check(r.axialityRad.every(angle => Number.isFinite(angle) && angle <= 1e-12), 'Independent pure axial structure retained');
      check(r.lengthToleranceMm === 1e-6 && r.angleToleranceRad === 1e-8, 'Unchanged requested hinge tolerances');
    }
    if (!moving) { const root = value.scopes.find(scope => scope.definition.id === expected.id);
      check(root?.result.localDOF === (suppressed || deleted ? 6 : 1) && root?.result.rank === (suppressed || deleted ? 0 : 5), label + ' actual local rank and DOF, without a temporary movement anchor'); }
    geometry(value.scene, value.document, label, turn);
    evidence.phases.push({ phase: label, serial: event.serial, action: event.action, document: value.document, hinges: reports,
      metrics: { volume: value.scene.volume, area: value.scene.area, bodies: value.scene.bodies.map(b => ({ component: b.component, volume: b.volume, area: b.area, bounds: b.bounds })) } });
    return value;
  }
  async function preview(text) { const before = await observe(); await button(text); return response(before.serial, 'preview-assembly'); }
  async function apply(event, label, turn = quarter) {
    check(await page(summary => !!document.querySelector(summary), SUMMARY) === ((event.response.value.hinges ?? []).length > 0), 'Actual current report DOM presence');
    check(await page(panel => [...document.querySelectorAll(panel + ' input,' + panel + ' select,' + panel + ' button')].every(element => element.disabled), PANEL), 'Ready four-role editor controls locked');
    const before = await observe(); await click(APPLY); const result = await response(before.serial, 'apply-assembly'), value = result.response.value;
    check(result.hasToken && value.kind === 'assembly-applied', 'Actual one-use worker capability Apply');
    check(canonical({ ...value.document, updatedAt: event.response.value.document.updatedAt }) === canonical(event.response.value.document) && Number.isFinite(Date.parse(value.document.updatedAt)), 'Exact Apply graph except valid history-owned root timestamp');
    geometry(value.scene, value.document, label, turn); await recovery(value.document, label); return { document: value.document, scene: value.scene };
  }
  async function cancel(base, label) {
    const before = await observe(); await click(CANCEL); const event = await response(before.serial, 'discard-assembly'); check(event.hasToken, label + ' actual capability discard'); await recovery(base.document, label);
    check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY), label + ' no stale report/Apply');
  }
  async function history(action, wanted, label) {
    const before = await observe(); await click('button[aria-label="' + action + ' ensamblaje"]'); const event = await response(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(wanted), label + ' exact historical graph'); geometry(event.response.value, event.document, label); await recovery(wanted, label); return { document: event.document, scene: event.response.value };
  }
  return async () => {
    const inputBytes = await fs.readFile(input); evidence.fixtureSha256 = digest(inputBytes); check(expected.id === 'original-hinge' && expected.mates.length === 0, 'Original empty-relation hinge fixture');
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial discard dialog', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]'); let event = await response(before.serial, 'build-assembly'), base = { document: event.document, scene: event.response.value };
    check(canonical(base.document) === canonical(expected), 'Real Open exact original fixture'); geometry(base.scene, base.document, 'Initial'); await recovery(base.document, 'Initial');
    intent = chooseOriginal(base.scene); await control('select[aria-label="Tipo de relación"]', 'hinge'); await control('input[aria-label="Nombre de bisagra"]', name);
    await control('select[aria-label="Alineación de ejes de bisagra"]', 'aligned');
    await selectRole(roles[0], intent.axis[0]);
    check(await page(() => [...document.querySelectorAll('.assembly-hinge-panel button')].find(b => b.textContent.trim() === 'Añadir bisagra')?.disabled === true), 'Incomplete four-role authoring is disabled');
    await selectRole(roles[1], intent.axis[1]); await selectRole(roles[2], intent.axial[0]);
    check(await page(() => [...document.querySelectorAll('.assembly-hinge-panel button')].find(b => b.textContent.trim() === 'Añadir bisagra')?.disabled === true), 'Fourth axial role remains mandatory');
    const radial = body(base.scene, 'moving').faces.filter(face => face.support?.kind === 'plane' && Math.abs(face.support.normal[0]) > .99999 && Math.abs(face.support.point[0] - 10) < 1e-8);
    check(radial.length === 1, 'Unique actual radial plane control'); await selectRole(roles[3], { kind: 'face', ...radial[0].selection, support: 'plane' });
    before = await observe(); await button('Añadir bisagra'); event = await response(before.serial, 'preview-assembly', true);
    check(!event.response.ok || event.response.value.status === 'rejected' && !event.response.value.hasToken, 'Complete radial geometry rejects in actual native worker');
    await recovery(base.document, 'Invalid axial selection'); check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY), 'Native rejection preserves no Apply/report authority');
    evidence.phases.push({ phase: 'native-radial-rejection', serial: event.serial, response: event.response });
    await selectRole(roles[3], intent.axial[1]); event = await preview('Añadir bisagra'); ready(event, 'Author ready Cancel'); await cancel(base, 'Author Cancel');
    event = await preview('Añadir bisagra'); ready(event, 'Author retry'); base = await apply(event, 'Author Apply'); const originalMate = base.document;
    await history('Deshacer', expected, 'Author Undo'); base = await history('Rehacer', originalMate, 'Author Redo');
    await click('button[aria-label="Editar bisagra ' + name + '"]');
    await control('select[aria-label="Plano axial B de bisagra"]', '');
    check(await page(() => [...document.querySelectorAll('.assembly-hinge-panel button')].find(b => b.textContent.trim() === 'Verificar edición de bisagra')?.disabled === true), 'Edited role removal revokes complete intent');
    await selectRole(roles[3], intent.axial[1]); name = 'Bisagra revisada'; await control('input[aria-label="Nombre de bisagra"]', name);
    event = await preview('Verificar edición de bisagra'); ready(event, 'Edit/reselection ready Cancel'); await cancel(base, 'Edit Cancel');
    event = await preview('Verificar edición de bisagra'); ready(event, 'Edit/reselection retry'); base = await apply(event, 'Edit Apply'); const edited = base.document;
    await history('Deshacer', originalMate, 'Edit Undo'); base = await history('Rehacer', edited, 'Edit Redo');
    (await assemblyNavigation.panel('components'), await page(() => { const rows = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === 'moving'); if (rows.length !== 1 || rows[0].disabled) throw Error('Exact moving leaf'); rows[0].click(); }));
    await waitFor('selected moving leaf', () => page(() => document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'moving'));
    await control('select[aria-label="Eje local del movimiento"]', '2');
    for (const [axis, value] of [['X', '0'], ['Y', '0'], ['Z', '4']]) await control('input[aria-label="Destino local ' + axis + ' del componente"]', value);
    await control('input[aria-label="Giro local del movimiento en grados"]', '90'); before = await observe(); await click('button[aria-label="Vista previa del movimiento"]'); event = await response(before.serial, 'move-assembly-component-motion');
    ready(event, 'Physical ninety-degree spin', { moving: true, turn: true }); check(event.response.value.motion?.verifiedStations === event.response.value.motion?.stationCount && event.response.value.motion?.requestedAngle === Math.PI / 2, 'Actual discrete rotation stations and signed quarter-turn intent');
    base = await apply(event, 'Ninety-degree Apply', true); quarter = true; const spun = base.document;
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly'); ready(event, 'Unanchored physical spin remains free'); await cancel(base, 'Spin verify Cancel');
    before = await observe(); await click('input[aria-label="Activar ' + name + '"]'); event = await response(before.serial, 'preview-assembly'); ready(event, 'Suppressed ready', { suppressed: true }); base = await apply(event, 'Suppressed Apply'); base = await history('Deshacer', spun, 'Suppression Undo');
    before = await observe(); await click('button[aria-label="Eliminar ' + name + '"]'); event = await response(before.serial, 'preview-assembly'); ready(event, 'Deleted ready', { deleted: true }); base = await apply(event, 'Deleted Apply'); base = await history('Deshacer', spun, 'Delete Undo');
    await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)'); await waitFor('actual Save As', async () => { if (dialogCounts().saves !== 1 || !ipc.some(value => value.channel === 'document:save' && value.completed)) return false;
      try { return canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(spun); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }); const savedBytes = await fs.readFile(output);
    before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(spun), 'Saved four-role hinge reopens exactly');
    base = { document: event.document, scene: event.response.value }; geometry(base.scene, base.document, 'Reopen'); await recovery(base.document, 'Reopen');
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly'); ready(event, 'Fresh saved native hinge solve'); await cancel(base, 'Fresh solve Cancel');
    await click('button[aria-label="Editar bisagra ' + name + '"]'); await page(panel => document.querySelector(panel)?.scrollIntoView({ block: 'center' }), PANEL); await capture(base.document);
    await button('Cancelar edición de bisagra'); await recovery(base.document, 'Capture edit Cancel');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().csvExports === 0, 'Exact two Open/one Save As queues');
    check((await fs.readFile(input)).equals(inputBytes) && (await fs.readFile(output)).equals(savedBytes), 'Original and saved bytes unchanged by preview/edit');
    check(ipc.every(value => value.completed) && !consoleErrors.length && !failedRequests.length && protocolResponses.every(value => value.status >= 200 && value.status < 400), 'No file/renderer/resource failures');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: spun,
      independentOracles: 'Original x[-2,10] y[-2,2] z[0,4] leaf minus through R1 circle at(0,0). Each V192-4pi/A224+6pi; total V384-8pi/A448+12pi. Ground identity, moving seatedz4. Materialcorner[10,2,4]→world[10,2,8] then[-2,10,8] at+90degZ. Movingbounds[-2,-2,4]..[10,2,8] then[-2,-2,4]..[2,10,8]. V/A1e-5; point/bounds1e-6; materialbasis1e-8. Fresh native local rank5/DOF1 after removing movementanchor, not an assumed global mobility certificate.',
      limits: 'Original synthetic reused leaf; explicit current four-role dropdown authoring and scripted production lifecycle with actual worker/file IPC, test-owned dialog substitutions. Unlimited support-only revolute family: no range, contact, finite pin engagement, pointer-selection, external application policy, human-dialog or platform support claim.' });
  };
};
