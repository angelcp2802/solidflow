'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Fixed original three-use source-revision workflow. All mutations use current
// production controls; observers, bytes and PNGs are evidence, never CAD authority.
module.exports = function assemblyPartPropertiesWorkflow(c) {
  const { expected, input, output, configuredOutput, evaluate, observe, waitFor, pointer, check, canonical, digest,
    checks, ipc, consoleErrors, failedRequests, initialReadyMs, dialogCounts, captureAssemblyProperties } = c;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(...JSON.parse(' + quote(JSON.stringify(args)) + '))');
  const PART = '.assembly-embedded-part-editor .app-shell', FORM = PART + ' form[aria-label="Material y apariencia de la pieza"]';
  const RETURN = PART + ' [aria-label="Edición de pieza en el ensamblaje"] button.primary-button';
  const REVIEW = '[role="region"][aria-label="Actualizar origen compartido"]';
  const APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL_REVIEW = 'button[aria-label="Cancelar actualización de pieza"]';
  const phases = [], interactions = [], evidence = { assemblyPartProperties: { phases, interactions,
    limits: 'Original 2x3x4 prisms, two shared uses plus same-id independent revision. Standard embedded properties/source Cancel+Apply; real conversion into one configured root state; hidden/suppressed mass; actual save/Open. Passive PNG pairs need qualitative review. No configured embedded editor, generic topology, imported material presets, RGB/PBR equality or platform equivalence.' } };
  checks.push(evidence);
  let mode = 'part', accepted, revision = 'r0', lastScene, namedId;
  const navigation = require('./desktop-assembly-navigation.cjs').withNavigation({ ...c, page }).assemblyNavigation;
  const configuredNavigation = require('./desktop-configured-navigation.cjs')({ page, waitFor, pointer, actualControl: rawPress });
  const serial = async () => (await observe.counters()).serial;
  const rawRecovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const document = async () => JSON.parse(await rawRecovery());
  const near = (a, b, tolerance, label) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, label + ': ' + a + ' expected ' + b);
  const vector = (a, b, tolerance, label) => { check(Array.isArray(a) && a.length === b.length, label + ' dimensions'); a.forEach((v, i) => near(v, b[i], tolerance, label + '[' + i + ']')); };
  async function inspect(selector, text) {
    return page((selector, text) => {
      const label = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim() ?? '';
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || label(e) === text);
      if (rows.length !== 1) return { count: rows.length, ready: false };
      const e = rows[0], r = e.getBoundingClientRect(), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let p = e.parentElement; p; p = p.parentElement) {
        const style = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, ready: !e.matches(':disabled')
        && !e.closest('[hidden],[inert]') && e.checkVisibility() && r.width > 0 && r.height > 0
        && r.left >= left && r.right <= right && r.top >= top && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)) };
    }, selector, text ?? null);
  }
  async function rawPress(selector, text = null) {
    await page((selector, text) => {
      const label = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim() ?? '';
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || label(e) === text);
      if (rows.length !== 1 || rows[0].closest('[hidden],[inert]')) throw Error('One active appearance control required: ' + selector + '/' + text);
      rows[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    let previous, since = 0;
    const target = await waitFor('stationary assembly properties control ' + selector + '/' + text, async () => {
      const state = await inspect(selector, text), key = canonical(state);
      if (key !== previous) { previous = key; since = Date.now(); }
      return state.ready && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; control=' + JSON.stringify(await inspect(selector, text)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, text)) === canonical(target), 'Control is still current and hit-tested before its real click');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, text, kind: 'CDP click', point: target.point });
  }
  async function reveal(selector, text = null) {
    if (mode === 'standard') await navigation.reveal(selector, text ?? '');
    if (mode === 'configured') await configuredNavigation.reveal(selector, text ?? '');
  }
  async function press(selector, text = null) { await reveal(selector, text); await rawPress(selector, text); }
  const button = (text, scope = mode === 'configured' ? '.configured-assembly-workspace' : mode === 'embedded' ? PART : '.assembly-app') => press(scope + ' button', text);
  async function change(selector, value) {
    await reveal(selector);
    await page(selector => { const e = document.querySelector(selector); if (!e || e.closest('[hidden],[inert]')) throw Error('Current property field required'); e.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }, selector);
    await waitFor('current enabled appearance field ' + selector, async () => (await inspect(selector)).ready);
    await page((selector, value) => {
      const rows = document.querySelectorAll(selector), e = rows[0];
      if (rows.length !== 1 || e.matches(':disabled') || e.closest('[hidden],[inert]') || !e.checkVisibility()) throw Error('Exact active input required');
      const prototype = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : e instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
      if (!prototype || e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Fixed current input/option required');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('field retained ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
    interactions.push({ selector, value, kind: 'visible native setter/input/change; scripted field input' });
  }
  async function response(after, action) {
    return waitFor('real native assembly property response ' + action, async () => {
      const state = await observe.assemblyResponseAfter(after, action);
      check(!consoleErrors.length, 'Renderer observation failed: ' + consoleErrors.join('; '));
      check(!state.workerErrors.length && state.completedCount <= 1, 'No worker error or duplicate completion for ' + action);
      if (!state.record) return false;
      check(state.record.response.ok, state.record.response.error || 'Expected actual native response');
      if (action === 'build-configured-assembly') check(Number.isSafeInteger(state.record.current?.generation)
        && state.record.response.value.context?.generation === state.record.current.generation,
      'Configured native scene generation equals its authentic dispatched request generation');
      phases.push({ action, serial: state.record.serial, response: state.record.response });
      return state.record;
    });
  }
  async function idle(doc, label) {
    await waitFor(label + ' healthy committed recovery', async () => {
      const root = mode === 'configured' ? '.configured-assembly-workspace' : '.assembly-app';
      return canonical(await document()) === canonical(doc) && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false', root);
    });
  }
  function geometry(scene, sharedRevision, suppressed = false, hidden = false) {
    check(scene?.kind === 'assembly-scene' && scene.bodies.length === (suppressed ? 2 : 3) && scene.solidCount === (suppressed ? 2 : 3)
      && scene.prototypeCount === 2 && !scene.warnings.length, 'Exact current original bodies/prototypes without warnings');
    near(scene.volume, suppressed ? 48 : 72, 1e-5, 'Literal assembly volume mm3'); near(scene.area, suppressed ? 104 : 156, 1e-5, 'Literal assembly BRep area mm2');
    for (const [id, offset, sourceRevision] of [['base', [0, 0, 0], sharedRevision], ['moving', [0, 0, 10], sharedRevision], ['control', [10, 0, 0], 'r-control']]) {
      const rows = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id]));
      if (id === 'moving' && suppressed) { check(rows.length === 0, 'Suppressed use has no native body'); continue; }
      check(rows.length === 1, 'One actual body under exact ' + id); const body = rows[0];
      check(body.component.definition.id === 'embedded-edit-prism' && body.component.definition.revision === sourceRevision
        && canonical(body.body) === canonical({ bodyId: 'embedded-body', sourceFeatureId: 'embedded-solid' }) && body.solidCount === 1
        && body.visible === !(id === 'moving' && hidden), 'Exact revision/body/visibility for ' + id);
      near(body.volume, 24, 1e-5, id + ' volume'); near(body.area, 52, 1e-5, id + ' area');
      vector(body.bounds.min, offset, 1e-6, id + ' lower'); vector(body.bounds.max, offset.map((v, i) => v + [2, 3, 4][i]), 1e-6, id + ' upper');
      vector(body.worldPose.translation, offset, 1e-6, id + ' placement'); const sign = body.worldPose.rotation[3] < 0 ? -1 : 1;
      vector(body.worldPose.rotation.map(v => v * sign), [0, 0, 0, 1], 1e-8, id + ' orientation');
    }
    vector(scene.bounds.min, [0, 0, 0], 1e-6, 'Full lower'); vector(scene.bounds.max, [12, 3, suppressed ? 4 : 14], 1e-6, 'Full upper');
    vector(scene.visibleBounds.min, [0, 0, 0], 1e-6, 'Visible lower'); vector(scene.visibleBounds.max, [12, 3, suppressed || hidden ? 4 : 14], 1e-6, 'Visible upper');
    lastScene = scene;
  }
  function configuredGeometry(wrapper, doc, suppressed = false, hidden = false) {
    check(wrapper?.kind === 'configured-assembly-scene' && Number.isSafeInteger(wrapper.context?.generation)
      && canonical(JSON.parse(wrapper.context.sourceSignature)) === canonical(doc.source)
      && canonical(JSON.parse(wrapper.context.catalogSignature)) === canonical(doc.catalog)
      && wrapper.context.rootConfiguration === doc.rootConfiguration, 'Actual configured geometry is bound to the complete source, catalog, root state and generation');
    geometry(wrapper.scene, revision, suppressed, hidden);
  }
  function acceptedIntent(doc) {
    const without = (value, names) => Object.fromEntries(Object.entries(value).filter(([name]) => !names.includes(name)));
    check(canonical(without(doc, ['updatedAt', 'definitions', 'occurrences', 'mates'])) === canonical(without(expected, ['updatedAt', 'definitions', 'occurrences', 'mates']))
      && doc.definitions.length === 3 && doc.occurrences.length === 3 && doc.mates.length === expected.mates.length, 'Accepted source update preserves root identity and exact graph inventory');
    for (const occurrence of doc.occurrences) {
      const old = expected.occurrences.find(value => value.id === occurrence.id);
      check(old && canonical(without(occurrence, ['definition'])) === canonical(without(old, ['definition']))
        && canonical(occurrence.definition) === canonical({ id: 'embedded-edit-prism', revision: occurrence.id === 'control' ? 'r-control' : revision }), 'Only exact shared source references advance; occurrence IDs, poses and flags remain fixed');
    }
    const part = doc.definitions.find(value => value.id === 'embedded-edit-prism' && value.revision === revision), oldPart = expected.definitions[0];
    check(part?.kind === 'part' && !Object.hasOwn(part, 'sourceLink')
      && canonical(without(part.document, ['updatedAt', 'material', 'appearance'])) === canonical(without(oldPart.document, ['updatedAt', 'material', 'appearance']))
      && canonical(part.document.material) === canonical({ name: 'Synthetic shared accepted', densityKgPerM3: 3000 })
      && canonical(part.document.appearance) === canonical({ color: '#339966' }), 'New source revision changes only accepted material/appearance and update timestamp');
    const expectedMate = structuredClone(expected.mates[0]); expectedMate.second.component.definition.revision = revision;
    check(canonical(doc.mates) === canonical([expectedMate]), 'Original root-Z relation retains exact intent and ordered origin owners under the new part revision');
  }
  async function mass(expectedKg, unknown = false) {
    const selector = mode === 'configured' ? '[aria-label="Masa del ensamblaje configurado"]' : mode === 'embedded' ? PART + ' [aria-label="Masa de la pieza"]' : '[aria-label="Masa del ensamblaje"]';
    await waitFor('actual visible ' + selector + (unknown ? ' unknown' : ' ' + expectedKg), () => page((selector, expectedKg, unknown) => {
      const rows = document.querySelectorAll(selector), e = rows[0], text = e?.textContent;
      if (rows.length !== 1 || !e.checkVisibility()) return false;
      if (unknown) return /sin definir|Pendiente de reconstrucción/.test(text);
      const match = text.match(/([\d.,]+)\s*kg/); return !!match && Math.abs(Number(match[1].replaceAll('.', '').replace(',', '.')) - expectedKg) <= 1e-12;
    }, selector, expectedKg, unknown));
  }
  async function historyState() { return page(() => [...document.querySelectorAll('.assembly-app button[aria-label="Deshacer ensamblaje"],.assembly-app button[aria-label="Rehacer ensamblaje"],.configured-assembly-workspace button[title="Deshacer"],.configured-assembly-workspace button[title="Rehacer"]')].map(e => ({ label: e.getAttribute('aria-label') ?? e.title, disabled: e.disabled }))); }
  async function unchanged(before, label) { check(await rawRecovery() === before.raw && canonical(await historyState()) === before.history, label + ' preserves exact parent recovery/history'); }
  const snapshot = async () => ({ raw: await rawRecovery(), history: canonical(await historyState()), serial: await serial() });
  async function selectMoving() {
    if (mode === 'configured') { await configuredNavigation.pane('model'); await press('[aria-label="Seleccionar componente moving"]'); }
    else { await navigation.panel('components'); await press('[data-assembly-tree-path=\'["moving"]\']'); }
  }
  async function clearSelection() {
    const host = mode === 'configured' ? '.configured-assembly-workspace .assembly-viewport' : '.assembly-app .assembly-viewport';
    const point = await page(host => {
      const canvas = document.querySelector(host + ' > canvas:not([role="img"])'), r = canvas?.getBoundingClientRect();
      const point = r && { x: r.left + r.width * .95, y: r.top + r.height * .88 };
      if (!point || document.elementFromPoint(point.x, point.y) !== canvas) throw Error('Unobstructed actual empty canvas witness required');
      return point;
    }, host);
    await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    await waitFor('actual empty selection clears owner', () => page(configured => configured
      ? document.querySelector('[aria-label="Ocurrencia configurada"]')?.value === ''
      : !document.querySelector('.assembly-app [data-assembly-tree-path][aria-selected="true"]'), mode === 'configured'));
  }
  async function captures(prefix) {
    const before = await snapshot();
    if (captureAssemblyProperties) { await park(); await captureAssemblyProperties(prefix + '-unselected'); }
    await selectMoving();
    if (captureAssemblyProperties) { await park(); await captureAssemblyProperties(prefix + '-selected'); }
    await clearSelection();
    if (captureAssemblyProperties) { await park(); await captureAssemblyProperties(prefix + '-deselected'); }
    await unchanged(before, prefix + ' actual selection/capture'); check(await serial() === before.serial, 'Selection/capture posts no CAD request');
  }
  async function park() { const point = await page(() => ({ x: innerWidth - 8, y: 10 })); await pointer('mouseMoved', point); }
  async function enter() {
    await selectMoving(); await navigation.panel('properties'); const after = await serial(); await press('button[aria-label="Editar pieza del componente"]'); mode = 'embedded';
    await waitFor('real embedded editor owns the visible workspace', () => page(part => document.querySelector(part)?.checkVisibility()
      && document.querySelector('.assembly-app')?.hidden && document.querySelector('.assembly-app')?.inert, PART));
    await partBuild(after); await press(PART + ' .taskbar button[title="Propiedades físicas"]'); await mass(.000024);
    await waitFor('existing shared properties form', () => page(form => document.querySelector(form + ' [aria-label="Densidad del material"]')?.value === '1000', FORM));
  }
  async function partBuild(after) {
    return waitFor('actual fresh original embedded prism build', async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No worker errors'); const row = state.builds.filter(x => x.serial > after && x.response).at(-1);
      if (!row) return false; const value = row.response.value;
      check(row.response.ok && canonical(row.features) === canonical(expected.definitions[0].document.features) && !value.featureErrors.length && !value.warnings.length
        && value.bodyCatalogActive && value.bodies?.length === 1 && canonical(value.bodies[0].ref) === canonical({ bodyId: 'embedded-body', sourceFeatureId: 'embedded-solid' }), 'Current unmodified original embedded geometry/identity');
      near(value.bodies[0].volume, 24, 1e-5, 'Embedded volume'); return row;
    });
  }
  async function draft() {
    await change(FORM + ' [aria-label="Nombre del material"]', 'Synthetic shared accepted');
    await change(FORM + ' [aria-label="Densidad del material"]', '3000'); await change(FORM + ' [aria-label="Color de la pieza"]', '#339966');
  }
  async function review() {
    const after = await serial(); await press(RETURN); mode = 'standard'; const row = await response(after, 'review-assembly-part-update');
    check(canonical(row.current) === canonical(expected) && canonical(row.source) === canonical({ id: 'embedded-edit-prism', revision: 'r0' })
      && canonical(row.part.material) === canonical({ name: 'Synthetic shared accepted', densityKgPerM3: 3000 }) && row.part.appearance.color === '#339966'
      && canonical(row.part.features) === canonical(expected.definitions[0].document.features), 'Source review receives actual edited metadata under captured exact revision');
    check(row.response.value.occurrences.length === 2 && !row.response.value.hasToken, 'Review affects only the two exact r0 uses and grants no Apply');
    await mass(0, true); return row;
  }
  async function applyFlag(field, value, doc) {
    await selectMoving(); const after = await serial();
    if (mode === 'configured') {
      await configuredNavigation.pane('occurrence'); await press('[aria-label="Ocurrencia configurada ' + (field === 'visible' ? 'visible' : 'suprimida') + '"]');
      const build = await response(after, 'build-configured-assembly'); const next = await document(); await idle(next, 'configured direct flag edit');
      check(canonical(next.source) === canonical(doc.source), 'Named flag changes only its catalog state, not source definitions');
      configuredGeometry(build.response.value, next, field === 'suppressed' ? value : false, field === 'visible' ? !value : false);
      await mass(field === 'suppressed' && value ? .000120 : .000192); return next;
    }
    await navigation.panel('properties'); await press('.assembly-app label.assembly-check', field === 'visible' ? 'Visible' : 'Suprimido');
    const build = await response(after, 'build-assembly'), next = await document();
    check(next.occurrences.find(o => o.id === 'moving')[field] === value, 'Actual flag intent updates only the selected occurrence');
    await idle(next, 'standard direct flag edit'); geometry(build.response.value, revision, field === 'suppressed' ? value : false, field === 'visible' ? !value : false);
    await mass(field === 'suppressed' && value ? .000120 : .000192); return next;
  }
  async function fileMenu(command) {
    const scope = mode === 'configured' ? '.configured-assembly-workspace' : '.assembly-app';
    await press(scope + ' [data-assembly-menu="file"]'); await rawPress(scope + ' .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', command);
  }
  async function save(file, saveAs, doc) {
    const before = ipc.filter(x => x.channel === 'document:save' && x.completed).length;
    await fileMenu(saveAs ? 'Guardar como…' : 'Guardar');
    await waitFor('actual native save complete', () => ipc.filter(x => x.channel === 'document:save' && x.completed).length === before + 1);
    const bytes = await fs.readFile(file); check(canonical(JSON.parse(bytes)) === canonical(doc), 'Saved native bytes contain exact complete graph');
    await idle(doc, 'saved document'); await waitFor('saved header is clean', () => page(configured => { const header = document.querySelector(configured ? '.configured-assembly-workspace .assembly-shell-document > strong' : '.assembly-app .assembly-shell-document > strong'); return !!header && header.checkVisibility() && !header.textContent.includes('*'); }, mode === 'configured'));
    return bytes;
  }
  async function reopen(file, doc) {
    const after = await serial(); await fileMenu('Abrir…');
    const row = await response(after, mode === 'configured' ? 'build-configured-assembly' : 'build-assembly');
    await idle(doc, 'native reopened graph'); check((await fs.readFile(file)).equals(Buffer.from(await rawRecovery())), 'Fresh native Open restores byte-exact saved/recovery contents');
    if (mode === 'configured') configuredGeometry(row.response.value, doc); else geometry(row.response.value, revision);
    await mass(.000192);
  }
  return async () => {
    await waitFor('production loader ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const originalBytes = await fs.readFile(input); const afterOpen = await serial(); await press('button[aria-label="Abrir (Ctrl+O)"]');
    const discard = '[role="dialog"][aria-labelledby="discard-title"]';
    if (await page(selector => !!document.querySelector(selector), discard)) await rawPress(discard + ' button', 'Continuar sin guardar');
    mode = 'standard'; const initial = await response(afterOpen, 'build-assembly'); geometry(initial.response.value, 'r0'); await idle(expected, 'initial original assembly'); await mass(.000096); await clearSelection(); await captures('standard-initial');
    const parent = await snapshot(); await enter(); await draft(); const cancelSerial = await serial(); await button('Cancelar cambios', FORM);
    check(await page(form => document.querySelector(form + ' [aria-label="Densidad del material"]')?.value === '1000'
      && document.querySelector(form + ' [aria-label="Color de la pieza"]')?.value === '#cc6633', FORM), 'Cancel restores original shared form declaration');
    check(await serial() === cancelSerial, 'Draft Cancel does not rebuild native geometry'); await unchanged(parent, 'Embedded panel Cancel');
    const unchangedReturn = await serial(); await press(RETURN); mode = 'standard'; const restored = await response(unchangedReturn, 'build-assembly'); geometry(restored.response.value, 'r0'); await idle(expected, 'unchanged embedded return'); await mass(.000096);
    check(!(await observe()).assemblies.some(r => r.serial > unchangedReturn && r.action === 'review-assembly-part-update'), 'Cancelled unchanged piece does not create a source review');
    await enter(); await draft(); const afterLocal = await serial(); await button('Aplicar propiedades', FORM); await partBuild(afterLocal); await mass(.000072); await unchanged(parent, 'Local properties Apply');
    await review(); const beforeCancel = await serial(); await press(CANCEL_REVIEW); mode = 'embedded'; await waitFor('Cancel resumes actual retained draft', () => page(part => document.querySelector(part)?.checkVisibility(), PART)); await partBuild(beforeCancel); await mass(.000072); await unchanged(parent, 'Source review Cancel');
    await review(); const beforeSolve = await serial(); await press('button[aria-label="Resolver actualización de pieza"]'); const preview = await response(beforeSolve, 'preview-assembly-part-update'); await mass(0, true);
    check(preview.response.value.hasToken && preview.response.value.status === 'ready' && preview.response.value.checks.every(row => row.satisfied), 'Fresh native source preview alone supplies opaque Apply capability');
    const beforeApply = await serial(); await press(APPLY); const applied = await response(beforeApply, 'apply-assembly'); accepted = applied.response.value.document;
    revision = accepted.occurrences.find(o => o.id === 'moving').definition.revision;
    check(revision !== 'r0' && revision !== 'r-control' && accepted.occurrences.filter(o => o.definition.revision === revision).length === 2, 'Only two shared exact uses advance together to a genuine new revision');
    check(canonical(accepted.definitions.find(d => d.revision === 'r-control')) === canonical(expected.definitions[1])
      && canonical(accepted.definitions.find(d => d.revision === 'r0')) === canonical(expected.definitions[0]), 'Independent and historical exact revisions remain unchanged');
    acceptedIntent(accepted);
    geometry(applied.response.value.scene, revision); await idle(accepted, 'accepted shared metadata'); await mass(.000192); await clearSelection(); await captures('standard-accepted');
    for (const [label, wanted, rev, kg] of [['Deshacer', expected, 'r0', .000096], ['Rehacer', accepted, revision, .000192]]) {
      const after = await serial(); await press('button[aria-label="' + label + ' ensamblaje"]'); const row = await response(after, 'build-assembly'); geometry(row.response.value, rev); await idle(wanted, label); await mass(kg);
    }
    let current = accepted;
    for (const [field, value] of [['visible', false], ['visible', true], ['suppressed', true], ['suppressed', false]]) current = await applyFlag(field, value, current);
    const standardBytes = await save(output, true, current); await reopen(output, current);
    const beforeConvert = await serial(); await press('button[aria-label="Crear configuraciones del ensamblaje"]'); mode = 'configured'; const converted = await response(beforeConvert, 'build-configured-assembly'); let configured = await document();
    check(configured.version === 3 && canonical(configured.source) === canonical(current) && !configured.catalog.length && configured.rootConfiguration === null, 'Actual UI conversion wraps complete accepted source without fabricating a catalog'); configuredGeometry(converted.response.value, configured); await idle(configured, 'real configured conversion');
    await change('[aria-label="Nombre de nueva configuración raíz"]', 'Appearance demo'); const beforeName = await serial(); await button('Crear configuración basada en Base'); const named = await response(beforeName, 'build-configured-assembly'); configured = await document(); namedId = configured.rootConfiguration;
    check(typeof namedId === 'string' && configured.catalog.length === 1 && canonical(configured.source) === canonical(current), 'Actual named root state retains exact full source'); configuredGeometry(named.response.value, configured); await idle(configured, 'named root state'); await mass(.000192); await clearSelection(); await captures('configured-named');
    // Existing configured flag controls commit directly. Cancel the actual ready solve preview instead.
    const beforeFlag = await snapshot(); await button('Resolver configuración', '[aria-label="Comandos del ensamblaje configurado"]'); await response(beforeFlag.serial, 'preview-configured-assembly'); await mass(0, true);
    const beforeDiscard = await serial(); await button('Cancelar', '[aria-label="Comandos del ensamblaje configurado"]'); await response(beforeDiscard, 'discard-configured-assembly'); await response(beforeDiscard, 'build-configured-assembly'); await idle(configured, 'configured Cancel'); await unchanged(beforeFlag, 'Configured ready flag Cancel');
    configured = await applyFlag('visible', false, configured); configured = await applyFlag('visible', true, configured); configured = await applyFlag('suppressed', true, configured);
    check(canonical(configured.source) === canonical(current), 'Named visibility/suppression never mutate Base source');
    let after = await serial(); await change('[aria-label="Configuración raíz"]', ''); let row = await response(after, 'build-configured-assembly'); configuredGeometry(row.response.value, await document()); await mass(.000192);
    after = await serial(); await change('[aria-label="Configuración raíz"]', namedId); row = await response(after, 'build-configured-assembly'); configured = await document(); configuredGeometry(row.response.value, configured, true); await mass(.000120);
    configured = await applyFlag('suppressed', false, configured); const configuredBytes = await save(configuredOutput, true, configured); await reopen(configuredOutput, configured);
    check((await fs.readFile(input)).equals(originalBytes) && (await fs.readFile(output)).equals(standardBytes) && (await fs.readFile(configuredOutput)).equals(configuredBytes), 'Original and both saved exact graphs remain isolated');
    check(dialogCounts().opens === 3 && dialogCounts().saves === 2 && dialogCounts().geometryExports === 0, 'Only fixed original/standard/configured native file grants');
    check(!consoleErrors.length && !failedRequests.length, 'No renderer console/resource errors');
    evidence.assemblyPartProperties.result = { sourceSha256: digest(originalBytes), standardSha256: digest(standardBytes), configuredSha256: digest(configuredBytes),
      sharedRevision: revision, controlRevision: 'r-control', namedId, massKg: .000192, lastSceneId: lastScene.sceneId,
      captures: captureAssemblyProperties ? 'nine fixed states; eighteen passive images pending visual review' : 'disabled; no raster claim',
      configuredEditor: 'missing production route; not exercised or claimed' };
  };
};
