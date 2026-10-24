'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
module.exports = function sourceRevisionWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, files, original, evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests,
    ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const phases = [], APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]',
    CREATE = 'button[aria-label="Crear revisión del ensamblaje"]', REVISION = 'input[aria-label="Nueva revisión del ensamblaje"]',
    PREVIEW = 'button[aria-label="Vista previa de nueva revisión"]', CLOSE = 'button[aria-label="Cancelar creación de revisión"]',
    MODAL = '[role="dialog"][aria-labelledby="assembly-root-revision-title"]', targetRevision = 'authored-source-from-ui';
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); if (json === undefined) throw Error('Page arguments must be JSON data');
    return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  async function button(text, parent = ':is(.assembly-toolbar, .assembly-quickbar)') { await assemblyNavigation.button(text, parent); await page((text, parent) => {
    const nodes = [...document.querySelectorAll(parent + ' button')].filter(x => x.textContent.trim() === text);
    if (nodes.length !== 1 || nodes[0].disabled) throw Error('Unique enabled control ' + text); nodes[0].click();
  }, text, parent); }
  async function setInput(selector, value) { await assemblyNavigation.reveal(selector); await page((selector, value) => {
    const input = document.querySelector(selector); if (!input || input.disabled) throw Error('Available input ' + selector);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, value); await waitFor('input accepted ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value)); }
  async function response(serial, action) { return waitFor('actual worker ' + action, async () => {
    const state = await observe(); check(!state.workerErrors.length, 'No worker runtime errors');
    const event = state.assemblies.find(x => x.serial > serial && x.action === action && x.response);
    if (!event) return false; check(event.response.ok, event.response.error || 'Native rejection'); const value = event.response.value;
    const scene = value?.kind === 'assembly-scene' ? value : value?.scene;
    phases.push({ action, serial: event.serial, status: value?.status, ...(scene ? { geometry: { volume: scene.volume, area: scene.area, solidCount: scene.solidCount,
      prototypeCount: scene.prototypeCount, bodies: scene.bodies.map(b => ({ component: b.component, body: b.body, bounds: b.bounds, volume: b.volume, area: b.area })) } } : {}) });
    return event;
  }); }
  async function recovery(document, label) { await waitFor(label + ' exact committed recovery', async () => {
    const raw = await page(() => localStorage.getItem('solidflow.autosave'));
    return raw && canonical(JSON.parse(raw)) === canonical(document) && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false');
  }); }
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance, label + ': ' + actual + ' expected ' + wanted);
  function vector(actual, wanted, label) { check(Array.isArray(actual) && actual.length === 3, label + ' shape'); actual.forEach((v, i) => near(v, wanted[i], 1e-6, label + '[' + i + ']')); }
  function geometry(scene, parent, moved) {
    check(scene.solidCount === (parent ? 2 : 1) && scene.bodies.length === (parent ? 2 : 1) && scene.prototypeCount === 1, 'Exact current reused original solid counts');
    near(scene.volume, parent ? 48 : 24, 1e-5, 'Independent material volume'); near(scene.area, parent ? 104 : 52, 1e-5, 'Independent material area');
    for (const [owner, x] of parent ? [['left', -10], ['right', 20]] : [['m', 0]]) {
      const componentPath = parent ? [owner, 'm'] : ['m'], bodies = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical(componentPath));
      check(bodies.length === 1, 'Full native owner path ' + componentPath.join('/')); const body = bodies[0];
      check(body.body.bodyId === 'original-linked-body' && body.component.definition.id === 'original-linked-part' && body.component.definition.revision === 'r0', 'Unchanged material tuple/body despite new ancestor revision');
      near(body.volume, 24, 1e-5, 'Each prism volume'); near(body.area, 52, 1e-5, 'Each prism area');
      vector(body.bounds.min, [x + (moved ? 1 : 0), 0, 0], owner + ' lower'); vector(body.bounds.max, [x + (moved ? 3 : 2), 3, 4], owner + ' upper');
    }
  }
  async function ready(serial, action, base, parent, moved) {
    const event = await response(serial, action); check(event.response.value.status === 'ready' && event.response.value.hasToken, 'Actual privately authenticated ready preview');
    geometry(event.response.value.scene, parent, moved); await recovery(base, 'Preview');
    await waitFor('Apply exact native candidate', () => page(sel => document.querySelector(sel)?.disabled === false, APPLY)); return event;
  }
  async function apply(preview, parent, moved) { await click(APPLY); const event = await response(preview.serial, 'apply-assembly'), actual = event.response.value.document;
    const a = structuredClone(actual), p = structuredClone(preview.response.value.document); delete a.updatedAt; delete p.updatedAt;
    check(canonical(a) === canonical(p), 'Apply preserves exact private graph; history owns only updatedAt'); geometry(event.response.value.scene, parent, moved); await recovery(actual, 'Apply'); return actual; }
  async function select(name) { (await assemblyNavigation.panel('components'), await page(name => { const rows = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(x => x.querySelector('span')?.firstChild?.textContent === name);
    if (rows.length !== 1 || rows[0].disabled) throw Error('Exact tree component ' + name); rows[0].click(); }, name));
    await waitFor('selected ' + name, () => page(name => document.querySelector('input[aria-label="Nombre del componente"]')?.value === name, name)); }
  async function revisionDialog(value) { await click(CREATE); await waitFor('root revision dialog', () => page(sel => !!document.querySelector(sel), MODAL));
    check(await page((id, rev) => document.querySelector('[aria-label="Identidad raíz de la revisión"]')?.textContent === id
      && document.querySelector('[aria-label="Revisión raíz actual"]')?.textContent === rev
      && document.querySelector('button[aria-label="Resolver ensamblaje"]')?.disabled === true, expected.id, expected.revision), 'Explicit root identity and locked background solve');
    await setInput(REVISION, value); }
  async function history(aria, expectedDoc, parent, moved) { const before = await observe(); await click('button[aria-label="' + aria + '"]'); const event = await response(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(expectedDoc), 'Exact complete Undo/Redo snapshot'); geometry(event.response.value, parent, moved); await recovery(expectedDoc, aria); }
  async function open(document, initial) { const before = await observe();
    if (initial) { await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial discard dialog', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
      await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]'); } else await button('Abrir');
    const event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(document), 'Actual native Open exact graph'); await recovery(document, 'Open'); return event; }
  return async () => {
    await waitFor('production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const originalSourceBytes = await fs.readFile(input), originalParentBytes = await fs.readFile(files.parent);
    let event = await open(expected, true); geometry(event.response.value, false, false); await select('m');
    let before = await observe(); (await assemblyNavigation.panel('components'), await page(() => { const rows = [...document.querySelectorAll('label.assembly-check')].filter(x => x.textContent.trim() === 'Fijo respecto a su padre');
      if (rows.length !== 1) throw Error('Unique fixed control'); const input = rows[0].querySelector('input'); if (!input.checked || input.disabled) throw Error('Original child must be fixed'); input.click(); }));
    event = await response(before.serial, 'build-assembly'); const unfixed = event.document; check(unfixed.occurrences.length === 1 && unfixed.occurrences[0].fixed === false, 'User explicitly frees original child');
    await recovery(unfixed, 'Unfix'); geometry(event.response.value, false, false); await setInput('input[aria-label="Destino local X del componente"]', '1');
    before = await observe(); await click('button[aria-label="Vista previa del movimiento"]'); let preview = await ready(before.serial, 'move-assembly-component-motion', unfixed, false, true);
    const moved = await apply(preview, false, true); check(moved.revision === expected.revision && canonical(moved.occurrences[0].pose.translation) === canonical([1, 0, 0]), 'Actual authored motion does not silently version source');
    const noRequestBefore = (await observe()).serial; await revisionDialog(expected.revision); await click(PREVIEW);
    await waitFor('same revision visible rejection', () => page(sel => document.querySelector(sel + ' [role="alert"]')?.textContent.includes('existe'), MODAL));
    check((await observe()).assemblies.filter(x => x.serial > noRequestBefore && x.action === 'preview-assembly-root-revision').length === 0, 'Invalid revision never becomes a native request');
    await click(CLOSE); await recovery(moved, 'Invalid modal Cancel');
    await revisionDialog(targetRevision); before = await observe(); await click(PREVIEW); preview = await ready(before.serial, 'preview-assembly-root-revision', moved, false, true);
    check(preview.revision === targetRevision && !Object.hasOwn(preview, 'proposed'), 'Worker receives only explicit root revision intent');
    check(preview.response.value.document.id === expected.id && preview.response.value.document.revision === targetRevision, 'Requested root revision in actual candidate');
    await click(CANCEL); await recovery(moved, 'Revision ready Cancel'); check((await fs.readFile(input)).equals(originalSourceBytes), 'Canceled revision never writes original source');
    await revisionDialog(targetRevision); before = await observe(); await click(PREVIEW); preview = await ready(before.serial, 'preview-assembly-root-revision', moved, false, true);
    const authored = await apply(preview, false, true); check(authored.id === expected.id && authored.revision === targetRevision, 'User-authored revision is committed');
    check(canonical(authored.definitions) === canonical(expected.definitions) && canonical(authored.occurrences) === canonical(moved.occurrences), 'Root authoring preserves exact part cache and actual moved child');
    await history('Deshacer ensamblaje', moved, false, true); await history('Rehacer ensamblaje', authored, false, true);
    await button('Guardar como'); await waitFor('Save As cancellation completed', async () => dialogCounts().saves === 1 && ipc.some(x => x.channel === 'document:save' && x.completed && x.documentWrite?.chosen === false)
      && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
    await recovery(authored, 'Save As Cancel'); check((await fs.readFile(input)).equals(originalSourceBytes), 'Cancelled Save As leaves source bytes intact');
    check(await page(name => document.querySelector('.assembly-shell-file')?.textContent === name && document.querySelector('.assembly-shell-document > strong')?.textContent.endsWith(' *'), path.basename(input)), 'Cancelled Save As preserves source path and dirty authored revision');
    await button('Guardar'); await waitFor('normal source save actual authored graph', async () => canonical(JSON.parse(await fs.readFile(input, 'utf8'))) === canonical(authored)
      && ipc.filter(x => x.channel === 'document:save' && x.completed && x.documentWrite?.chosen === true).length === 1);
    const authoredBytes = await fs.readFile(input), saveCalls = ipc.filter(x => x.channel === 'document:save');
    check(saveCalls.length === 2 && saveCalls[1].documentWrite?.hasPath === true && saveCalls[1].documentWrite?.chosen === true && saveCalls[1].documentWrite.sha256 === digest(authoredBytes), 'Normal Save uses independently granted source pathname and exact authored bytes');
    await waitFor('source clean after successful save', () => page(name => document.querySelector('.assembly-shell-document > strong')?.textContent === name, authored.name));
    event = await open(original.assemblyParent, false); geometry(event.response.value, true, false); await select('left');
    before = await observe(); await click('button[aria-label="Vincular archivo de origen"]'); event = await response(before.serial, 'review-assembly-document-update');
    check(event.incoming.revision === authored.revision && canonical(event.incoming) === canonical(authored), 'Parent reads ACTUAL application-authored source, no prefabricated incoming revision');
    check(event.response.value.endpoints.length === 0 && !event.response.value.hasToken, 'Read-only source review has no Apply capability'); geometry(event.response.value.scene, true, true); await recovery(original.assemblyParent, 'Changed source review');
    await click('button[aria-label="Cancelar actualización de subensamblaje"]'); await recovery(original.assemblyParent, 'Source review Cancel');
    before = await observe(); await click('button[aria-label="Vincular archivo de origen"]'); event = await response(before.serial, 'review-assembly-document-update');
    const reviewId = event.response.value.reviewId; before = await observe(); await click('button[aria-label="Resolver actualización de subensamblaje"]'); preview = await ready(before.serial, 'preview-assembly-document-update', original.assemblyParent, true, true);
    check(preview.reviewId === reviewId && !Object.hasOwn(preview, 'proposed'), 'Native preview uses exact retained source review');
    const parent = await apply(preview, true, true); check(parent.id === original.assemblyParent.id && parent.revision === original.assemblyParent.revision, 'Reload preserves parent root identity/revision');
    check(parent.occurrences.every(x => x.definition.id === authored.id && x.definition.revision === authored.revision), 'Both reused roots advance to the UI-authored revision');
    const definition = parent.definitions.find(x => x.id === authored.id && x.revision === authored.revision);
    check(!!definition, 'Exact authored source definition present after Apply');
    check(canonical(definition.sourceLink) === canonical({ kind: 'local-file', displayName: path.basename(input), contentSha256: digest(authoredBytes) }), 'New cache and exact raw source digest commit atomically');
    check(!JSON.stringify(parent).includes('grantId') && !JSON.stringify(parent).includes(path.dirname(input)), 'Saved provenance grants no path/capability');
    await history('Deshacer ensamblaje', original.assemblyParent, true, false); await history('Rehacer ensamblaje', parent, true, true);
    await button('Guardar como'); await waitFor('saved parent exact linked graph', async () => { try { return canonical(JSON.parse(await fs.readFile(files.output, 'utf8'))) === canonical(parent); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } });
    event = await open(parent, false); geometry(event.response.value, true, true); await select('left');
    check(await page(() => document.querySelector('button[aria-label="Recargar origen enlazado"]')?.disabled === true), 'Reopened descriptor has no runtime source authority');
    const serial = (await observe()).serial; await click('button[aria-label="Re-vincular archivo de origen"]');
    await waitFor('fresh rebind of exact saved source', () => page(() => document.querySelector('button[aria-label="Recargar origen enlazado"]')?.disabled === false && document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
    await recovery(parent, 'Exact rebind'); check((await observe()).assemblies.filter(x => x.serial > serial && ['preview-assembly', 'review-assembly-document-update'].includes(x.action)).length === 0, 'Exact rebind adds permission only without fake reload/history');
    check((await fs.readFile(input)).equals(authoredBytes) && (await fs.readFile(files.parent)).equals(originalParentBytes), 'Parent workflow never modifies authored source or original parent bytes');
    const counts = dialogCounts(); check(counts.opens === 3 && counts.saves === 2 && counts.sourceOpens === 3 && counts.csvExports === 0, 'Exact source/parent Open, canceled/source SaveAs, parent SaveAs and read-only pickers');
    check(ipc.every(x => x.completed) && ipc.filter(x => x.channel === 'source:choose').length === 3 && ipc.filter(x => x.channel === 'source:read').length === 0, 'Actual file IPC: explicit rebind, no claimed forced reload');
    await capture(parent); const final = await observe(); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'No renderer/worker/resource errors');
    checks.push({ originalSourceSha256: digest(originalSourceBytes), authoredSourceSha256: digest(authoredBytes), originalParentSha256: digest(originalParentBytes), savedParentSha256: digest(await fs.readFile(files.output)), phases, finalDocument: parent,
      independentOracles: 'Original 2x3 rectangle extruded4: V24/A52. Source m moves +1X through actual controls, own bounds[1,0,0]..[3,3,4]. Parent two reused roots at-10/+20 have bounds[-9,0,0]..[-7,3,4] and[21,0,0]..[23,3,4], totalV48/A104. V/A1e-5, bounds1e-6. Incoming root revision comes solely from actual UI authoring+Save; original part cache remains r0.',
      limits: 'Scripted production controls and actual worker/private Apply/file IPC with test-owned dialog substitutions. Root-only revision authoring; no automatic dependency revision, change log, multiwindow concurrency, human native-dialog, reference-app or platform claim. Same-revision input rejection is UI/model preflight, not a fabricated native rejection.' });
  };
};
