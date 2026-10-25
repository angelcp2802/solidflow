'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original asymmetric prisms expose spin in material bounds, independently of
// the captured declaration. Commands use actual CDP presses, never DOM click().
module.exports = function originAxisLockWorkflow(context) {
  const c = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const { configured, expected, input, output, evaluate, observe, waitFor, pointer, capture,
    check, checks, canonical, digest, ipc, dialogCounts, consoleErrors, failedRequests, initialReadyMs } = c;
  const ROOT = configured ? '.configured-assembly-workspace' : '.assembly-app';
  const NAV = configured ? ':is([aria-label="Archivo del ensamblaje configurado"],[aria-label="Comandos del ensamblaje configurado"])' : ':is(.assembly-toolbar,.assembly-quickbar)';
  const FORM = '[aria-label="Editar relación mecánica del estado"]';
  const BUILD = configured ? 'build-configured-assembly' : 'build-assembly';
  const phases = [], gestures = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = configured ? require('./desktop-configured-navigation.cjs')({ page, waitFor, actualControl, pointer }) : c.assemblyNavigation;
  const serial = async () => (await observe.counters()).serial;
  async function actualControl(selector, text = null) {
    await navigation.reveal(selector, text ?? '');
    await waitFor('enabled command ' + (text || selector), () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      return rows.length === 1 && !rows[0].disabled && !rows[0].closest('[hidden]') && rows[0].getClientRects().length > 0;
    }, selector, text));
    await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]')) throw Error('One visible enabled command required: ' + selector);
      rows[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, selector, text);
    const inspect = () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text), e = rows[0], r = e?.getBoundingClientRect();
      const x = r?.left + r?.width / 2, y = r?.top + r?.height / 2;
      const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      for (let parent = e?.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { clip.left = Math.max(clip.left, rect.left + parent.clientLeft); clip.right = Math.min(clip.right, rect.left + parent.clientLeft + parent.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { clip.top = Math.max(clip.top, rect.top + parent.clientTop); clip.bottom = Math.min(clip.bottom, rect.top + parent.clientTop + parent.clientHeight); }
      }
      return { count: rows.length, enabled: !!e && !e.disabled, visible: !!e && !e.closest('[hidden]') && !!r.width && !!r.height,
        rect: r ? [r.x, r.y, r.width, r.height] : null, clip, contained: !!r && r.left >= clip.left && r.top >= clip.top && r.right <= clip.right && r.bottom <= clip.bottom, x, y,
        hit: !!e && x >= 0 && y >= 0 && x < innerWidth && y < innerHeight && e.contains(document.elementFromPoint(x, y)) };
    }, selector, text);
    let previous = '', since = 0;
    const target = await waitFor('stationary hit-tested command ' + (text || selector), async () => {
      const value = await inspect(), key = JSON.stringify(value);
      if (key !== previous) { previous = key; since = Date.now(); }
      return value.count === 1 && value.enabled && value.visible && value.contained && value.hit && Date.now() - since >= 120 ? value : false;
    }).catch(async error => { error.message += '; control=' + JSON.stringify(await inspect()); throw error; });
    await pointer('mouseMoved', { x: target.x, y: target.y });
    check(canonical(await inspect()) === canonical(target), 'Command geometry and hit remain current before pointer press');
    await pointer('mousePressed', { x: target.x, y: target.y }, 1); await pointer('mouseReleased', { x: target.x, y: target.y }, 0);
    gestures.push({ selector, text, point: [target.x, target.y] });
  }
  const button = (text, parent = NAV) => actualControl(parent + ' button', text);
  const aria = label => actualControl('button[aria-label="' + label + '"]');
  async function response(after, action) {
    return waitFor('native ' + action, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Worker transport healthy');
      const rows = state.assemblies.filter(row => row.serial > after && row.action === action && row.response);
      check(rows.length <= 1, 'Exactly one requested response for ' + action); if (!rows.length) return false;
      check(rows[0].response.ok, rows[0].response.error || 'Native response succeeds'); return rows[0];
    });
  }
  async function recovery(doc) {
    await waitFor('exact idle committed recovery', () => page(root => {
      const raw = localStorage.getItem('solidflow.autosave');
      return raw && document.querySelector(root)?.getAttribute('aria-busy') === 'false' ? JSON.parse(raw) : null;
    }, ROOT).then(actual => actual && canonical(actual) === canonical(doc)));
  }
  const declarations = doc => configured ? doc.catalog[0].configurations.find(row => row.id === 'demo').mateDeclarations : doc.mates;
  const untimed = doc => { const { updatedAt, ...rest } = doc; return rest; };
  const near = (a, b, tolerance, label) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, label + ': actual=' + a + ', expected=' + b + ', tolerance=' + tolerance);
  function declaration(doc, locked) {
    const rows = declarations(doc), original = declarations(expected)[0];
    check(rows.length === 1, 'Exactly one retained original relation');
    const { rotationLock, ...intent } = rows[0], { rotationLock: unused, ...wanted } = original;
    check(canonical(intent) === canonical(wanted), 'Capture preserves ID, name, ordered origin references, alignment and suppression');
    if (!locked) check(rotationLock === null, 'Original concentric spin remains free');
    else {
      check(Array.isArray(rotationLock) && rotationLock.length === 4, 'Captured full relative quaternion');
      const sign = rotationLock[3] < 0 ? -1 : 1;
      [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)].forEach((v, i) => near(sign * rotationLock[i], v, 1e-8, 'Independent inverse Rz30 relative frame'));
    }
  }
  function geometry(wrapper, doc, locked, label) {
    const scene = configured ? wrapper.scene : wrapper;
    declaration(doc, locked);
    if (configured) {
      check(wrapper.kind === 'configured-assembly-scene' && wrapper.context.rootConfiguration === 'demo'
        && canonical(JSON.parse(wrapper.context.sourceSignature)) === canonical(doc.source)
        && canonical(JSON.parse(wrapper.context.catalogSignature)) === canonical(doc.catalog), 'Exact native configured context');
      check(canonical(doc.source) === canonical(expected.source), 'Capture leaves the complete source unchanged');
      check(canonical(doc.catalog[0].configurations.find(row => row.id === 'untouched')) === canonical(expected.catalog[0].configurations[1]), 'Inactive named state unchanged');
    } else check(canonical(doc.definitions) === canonical(expected.definitions), 'Embedded geometry unchanged');
    check(scene.solidCount === 2 && scene.prototypeCount === 1 && scene.bodies.length === 2 && !scene.warnings.length, 'Two original native solids without warnings');
    near(scene.volume, 48, 1e-5, 'Independent total volume'); near(scene.area, 104, 1e-5, 'Independent total area');
    for (const id of ['ground', 'moving']) {
      const rows = scene.bodies.filter(body => canonical(body.component.occurrencePath) === canonical([id]));
      check(rows.length === 1 && rows[0].component.definition.id === 'origin-axis-prism' && rows[0].component.definition.revision === 'r1', 'Exact placed original identity');
      const body = rows[0], q = body.worldPose.rotation, sign = q[3] < 0 ? -1 : 1;
      const translation = id === 'ground' ? [-15, 0, 0] : [0, 0, 6];
      const rotation = id === 'ground' ? [0, 0, 0, 1] : [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)];
      translation.forEach((v, i) => near(body.worldPose.translation[i], v, 1e-6, 'Original placement retained'));
      rotation.forEach((v, i) => near(sign * q[i], v, 1e-8, 'Literal original spin retained'));
      const lo = id === 'ground' ? [-15, 0, 0] : [-1.5, 0, 6], hi = id === 'ground' ? [-13, 3, 4] : [Math.sqrt(3), 1 + 3 * Math.sqrt(3) / 2, 10];
      lo.forEach((v, i) => near(body.bounds.min[i], v, 1e-5, 'Literal asymmetric prism minimum'));
      hi.forEach((v, i) => near(body.bounds.max[i], v, 1e-5, 'Literal asymmetric prism maximum'));
      near(body.volume, 24, 1e-5, 'Member volume'); near(body.area, 52, 1e-5, 'Member area');
    }
    phases.push({ label, locked, volume: scene.volume, area: scene.area, members: scene.bodies.map(body => ({ path: body.component.occurrencePath, pose: body.worldPose, bounds: body.bounds })) });
  }
  function ready(row, baseline, locked, label) {
    const value = row.response.value;
    check(value.hasToken, 'Preview has private Apply authority');
    if (configured) {
      check(value.kind === 'configured-assembly-preview' && value.candidateGeneration > value.generation
        && canonical(row.current.document) === canonical(baseline) && value.verification.accepted && value.verification.status === 'verified', 'Bound configured verified candidate');
      check(value.verification.reports.length === 1 && value.verification.reports.every(r => !r.passive && r.measurement.status === 'ok' && r.measurement.satisfied), 'One fresh physical relation verification');
      check(value.states.length === 1 && value.states[0].solver.localDOF === (locked ? 1 : 2), 'Configured origin lock removes spin and keeps axial travel free');
    } else check(value.status === 'ready' && value.checks.length === 1 && value.checks.every(r => r.satisfied)
      && value.scopes.length === 1 && !value.scopes[0].temporaryAnchor && value.scopes[0].result.localDOF === (locked ? 1 : 2), 'Origin lock removes spin and keeps axial travel free');
    geometry(value.scene, value.document, locked, label); return value.document;
  }
  async function solve(doc, locked, label) {
    const before = await serial();
    if (configured) await button('Resolver configuración'); else await aria('Resolver ensamblaje');
    const row = await response(before, configured ? 'preview-configured-assembly' : 'preview-assembly');
    ready(row, doc, locked, label); await recovery(doc);
  }
  async function lockPreview(doc, retry) {
    if (configured) {
      if (!retry) await aria('Bloquear giro de relación configurada Original axis spin');
      await waitFor('existing free relation editor with required recapture', () => page(form => {
        const e = document.querySelector(form), field = label => e?.querySelector('[aria-label="' + label + '"]');
        return !!e && !e.closest('[hidden]') && field('Tipo de relación mecánica configurada')?.disabled
          && field('Tipo de relación mecánica configurada')?.value === 'concentric'
          && field('Nombre de relación mecánica configurada')?.value === 'Original axis spin'
          && field('Captura mecánica configurada')?.value === 'recapture'
          && field('Captura mecánica configurada')?.querySelector('option[value="retain"]')?.disabled;
      }, FORM));
      check(true, 'Existing free relation opens an immutable type with required recapture');
    } else await solve(doc, false, retry ? 'retry-free-solve' : 'free-solve');
    const before = await serial();
    if (configured) await button('Vista previa de relación mecánica configurada', FORM); else await aria('Bloquear giro Original axis spin');
    const row = await response(before, configured ? 'preview-configured-assembly-mechanical-edit' : 'lock-assembly-rotation');
    if (configured) {
      const intent = row.intent, change = intent.change, { rotationLock, ...original } = declarations(expected)[0];
      check(canonical(intent.scopePath) === '[]' && canonical(intent.definition) === canonical({ id: expected.source.id, revision: expected.source.revision })
        && intent.configuration === 'demo' && change.kind === 'replace' && change.mateId === original.id && change.capture === 'recapture'
        && canonical(change.spec) === canonical(original), 'Renderer sends only exact replace/recapture intent, no quaternion');
    }
    const proposal = ready(row, doc, true, retry ? 'retry-lock' : 'lock'); await recovery(doc); return proposal;
  }
  async function cancel(doc, locked, label) {
    const before = await serial();
    if (configured) await button('Cancelar'); else await aria('Cancelar vista previa del ensamblaje');
    const discarded = await response(before, configured ? 'discard-configured-assembly' : 'discard-assembly');
    check(discarded.response.value === null, 'Cancel discards the current preview capability');
    if (configured) {
      const row = await response(before, BUILD);
      check(canonical(row.current.document) === canonical(doc), 'Cancel rebuild retains exact baseline'); geometry(row.response.value, doc, locked, label);
    } else {
      await waitFor('Cancel restores the previously verified confirmed scene', () => page(() =>
        document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true
        && document.querySelector('.assembly-canvas-label span')?.textContent === 'Componentes independientes · mm'));
      check(!(await observe()).assemblies.some(row => row.serial > before && row.action === BUILD), 'Standard Cancel reuses its unchanged confirmed scene without another native build');
      phases.push({ label, locked, confirmedSceneRestored: true, freshNativeMeasurement: false });
    }
    await recovery(doc);
  }
  return async () => {
    await waitFor('production startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const sourceBytes = await fs.readFile(input); let before = await serial(); await aria('Abrir (Ctrl+O)');
    await waitFor('owned replacement dialog', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let row = await response(before, BUILD);
    check(canonical(configured ? row.current.document : row.document) === canonical(expected), 'File IPC opens exact original free-axis assembly');
    geometry(row.response.value, expected, false, 'initial'); await recovery(expected);
    const originalRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
    const first = await lockPreview(expected, false); await cancel(expected, false, 'capture-cancel');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === originalRecovery, 'Capture Cancel preserves exact recovery bytes');
    const proposed = await lockPreview(expected, true);
    check(canonical(configured ? proposed : untimed(proposed)) === canonical(configured ? first : untimed(first)), 'Canceled capture retry preserves all candidate fields except the standard capture timestamp');
    if (!configured) check(Number.isFinite(Date.parse(first.updatedAt)) && Date.parse(first.updatedAt) > Date.parse(expected.updatedAt)
      && Date.parse(proposed.updatedAt) >= Date.parse(first.updatedAt), 'Fresh standard captures advance valid timestamps without committing');
    before = await serial(); if (configured) await button('Aplicar configuración'); else await aria('Aplicar ensamblaje');
    row = await response(before, configured ? 'apply-configured-assembly' : 'apply-assembly'); const current = row.response.value.document;
    check(canonical(configured ? current : untimed(current)) === canonical(configured ? proposed : untimed(proposed)), 'Apply publishes only the authenticated candidate');
    geometry(configured ? (await response(before, BUILD)).response.value : row.response.value.scene, current, true, 'applied'); await recovery(current);
    for (const [redo, wanted, locked] of [[false, expected, false], [true, current, true]]) {
      before = await serial(); if (configured) await button(redo ? 'Rehacer' : 'Deshacer'); else await aria((redo ? 'Rehacer' : 'Deshacer') + ' ensamblaje');
      row = await response(before, BUILD); check(canonical(configured ? row.current.document : row.document) === canonical(wanted), 'History restores exact complete document');
      geometry(row.response.value, wanted, locked, redo ? 'redo' : 'undo'); await recovery(wanted);
    }
    if (configured) { await button('Guardar como'); await waitFor('canceled Save As', () => ipc.filter(r => r.channel === 'document:save' && r.completed).length === 1); await recovery(current); }
    await button('Guardar como');
    await waitFor('completed saved bytes and idle clean header', async () => { try { return ipc.filter(r => r.channel === 'document:save' && r.completed).length === (configured ? 2 : 1)
      && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(current)
      && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false' && !document.querySelector(root + ' header')?.textContent.includes('*'), ROOT);
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; } });
    const savedBytes = await fs.readFile(output); before = await serial(); await button('Abrir'); row = await response(before, BUILD);
    check(canonical(configured ? row.current.document : row.document) === canonical(current), 'Reopen retains complete captured document');
    geometry(row.response.value, current, true, 'reopened'); await recovery(current);
    const reopenedRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
    await solve(current, true, 'fresh-saved-solve'); await cancel(current, true, 'fresh-solve-cancel');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === reopenedRecovery, 'Fresh saved Solve/Cancel preserves exact recovery bytes');
    check((await fs.readFile(input)).equals(sourceBytes) && (await fs.readFile(output)).equals(savedBytes), 'Preview, history and fresh Cancel do not alter input or saved bytes');
    check(dialogCounts().opens === 2 && dialogCounts().saves === (configured ? 2 : 1), 'Exact owned Open/Save dialog counts');
    const final = await observe(); check(!final.workerErrors.length && !final.assemblies.some(r => r.response?.ok === false) && !consoleErrors.length && !failedRequests.length, 'No native, transport, console or resource failures');
    checks.push({ scenario: configured ? 'configured-origin-axis-lock' : 'origin-axis-lock', phases, gestures,
      limits: 'Actual stationary hit-tested command presses; native file dialogs use owned paths. Literal Rz30 asymmetric prisms and relative quaternion, exact document history and saved bytes. Axial freedom is solver DOF evidence, not a demonstrated drag.',
      sourceSha256: digest(sourceBytes), savedSha256: digest(savedBytes) });
    await capture(current);
  };
};
