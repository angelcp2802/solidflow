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
    // The manager's real tab handler schedules focus/scroll in requestAnimationFrame.
    // Let that reveal settle before scrolling this specific command into view.
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]')) throw Error('One visible enabled command required: ' + selector);
      rows[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    const inspect = () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text), e = rows[0], r = e?.getBoundingClientRect();
      const x = r?.left + r?.width / 2, y = r?.top + r?.height / 2;
      const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }, scrollOwners = [];
      for (let parent = e?.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX + ' ' + style.overflowY)) scrollOwners.push({
          tag: parent.tagName, id: parent.id, className: parent.className, scrollTop: parent.scrollTop, scrollLeft: parent.scrollLeft,
          clientHeight: parent.clientHeight, scrollHeight: parent.scrollHeight, clientWidth: parent.clientWidth, scrollWidth: parent.scrollWidth });
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { clip.left = Math.max(clip.left, rect.left + parent.clientLeft); clip.right = Math.min(clip.right, rect.left + parent.clientLeft + parent.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { clip.top = Math.max(clip.top, rect.top + parent.clientTop); clip.bottom = Math.min(clip.bottom, rect.top + parent.clientTop + parent.clientHeight); }
      }
      return { count: rows.length, enabled: !!e && !e.disabled, visible: !!e && !e.closest('[hidden]') && !!r.width && !!r.height,
        rect: r ? [r.x, r.y, r.width, r.height] : null, clip, scrollOwners, contained: !!r && r.left >= clip.left && r.top >= clip.top && r.right <= clip.right && r.bottom <= clip.bottom, x, y,
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
  function declaration(doc, locked, name = declarations(expected)[0].name) {
    const rows = declarations(doc), original = declarations(expected)[0];
    check(rows.length === 1, 'Exactly one retained original relation');
    const { rotationLock, ...intent } = rows[0], { rotationLock: unused, ...wanted } = original;
    check(canonical(intent) === canonical({ ...wanted, name }), 'Exact ID, expected name, ordered origin references, alignment and suppression');
    if (!locked) check(rotationLock === null, 'Original concentric spin remains free');
    else {
      check(Array.isArray(rotationLock) && rotationLock.length === 4, 'Captured full relative quaternion');
      const sign = rotationLock[3] < 0 ? -1 : 1;
      [0, 0, -Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)].forEach((v, i) => near(sign * rotationLock[i], v, 1e-8, 'Independent inverse Rz30 relative frame'));
    }
  }
  function geometry(wrapper, doc, locked, label, name, freePose = false) {
    const scene = configured ? wrapper.scene : wrapper;
    declaration(doc, locked, name);
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
      let lo = id === 'ground' ? [-15, 0, 0] : [-1.5, 0, 6], hi = id === 'ground' ? [-13, 3, 4] : [Math.sqrt(3), 1 + 3 * Math.sqrt(3) / 2, 10];
      if (freePose && id === 'moving') {
        // Unlock restores slide and roll. Check only the constrained axis;
        // transform all eight literal prism corners independently for bounds.
        const [x, y, z, w] = q, t = body.worldPose.translation;
        near(Math.hypot(...q), 1, 1e-9, 'Unlocked unit quaternion');
        check(t.every(Number.isFinite), 'Unlocked translation remains finite');
        near(t[0], 0, 1e-6, 'Concentric axis offset X'); near(t[1], 0, 1e-6, 'Concentric axis offset Y');
        const rotate = ([a, b, d]) => [(1 - 2 * (y*y + z*z))*a + 2*(x*y-z*w)*b + 2*(x*z+y*w)*d,
          2*(x*y+z*w)*a + (1-2*(x*x+z*z))*b + 2*(y*z-x*w)*d,
          2*(x*z-y*w)*a + 2*(y*z+x*w)*b + (1-2*(x*x+y*y))*d];
        rotate([0, 0, 1]).forEach((v, i) => near(v, i === 2 ? 1 : 0, 1e-6, 'Aligned literal local Z residual'));
        const points = [0, 2].flatMap(a => [0, 3].flatMap(b => [0, 4].map(d => rotate([a, b, d]).map((v, i) => v + t[i]))));
        lo = [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))); hi = [0, 1, 2].map(i => Math.max(...points.map(p => p[i])));
        const declared = doc.occurrences.find(o => o.id === id).pose;
        t.forEach((v, i) => near(v, declared.translation[i], 1e-6, 'Unlocked native placement matches the declared occurrence'));
        const declaredSign = q.reduce((sum, v, i) => sum + v * declared.rotation[i], 0) < 0 ? -1 : 1;
        q.forEach((v, i) => near(v, declaredSign * declared.rotation[i], 1e-8, 'Unlocked native orientation matches the declared occurrence'));
      } else {
        translation.forEach((v, i) => near(body.worldPose.translation[i], v, 1e-6, 'Original placement retained'));
        rotation.forEach((v, i) => near(sign * q[i], v, 1e-8, 'Literal original spin retained'));
      }
      lo.forEach((v, i) => near(body.bounds.min[i], v, 1e-5, 'Literal asymmetric prism minimum'));
      hi.forEach((v, i) => near(body.bounds.max[i], v, 1e-5, 'Literal asymmetric prism maximum'));
      near(body.volume, 24, 1e-5, 'Member volume'); near(body.area, 52, 1e-5, 'Member area');
    }
    phases.push({ label, locked, freePose, volume: scene.volume, area: scene.area, members: scene.bodies.map(body => ({ path: body.component.occurrencePath, pose: body.worldPose, bounds: body.bounds })) });
  }
  function ready(row, baseline, locked, label, name, freePose = false) {
    const value = row.response.value;
    check(value.hasToken, 'Preview has private Apply authority');
    if (configured) {
      check(value.kind === 'configured-assembly-preview' && value.candidateGeneration > value.generation
        && canonical(row.current.document) === canonical(baseline) && value.verification.accepted && value.verification.status === 'verified', 'Bound configured verified candidate');
      check(value.verification.reports.length === 1 && value.verification.reports.every(r => !r.passive && r.measurement.status === 'ok' && r.measurement.satisfied), 'One fresh physical relation verification');
      check(value.states.length === 1 && value.states[0].solver.localDOF === (locked ? 1 : 2), 'Configured origin lock removes spin and keeps axial travel free');
    } else check(value.status === 'ready' && value.checks.length === 1 && value.checks.every(r => r.satisfied)
      && value.scopes.length === 1 && !value.scopes[0].temporaryAnchor && value.scopes[0].result.localDOF === (locked ? 1 : 2), 'Origin lock removes spin and keeps axial travel free');
    geometry(value.scene, value.document, locked, label, name, freePose); return value.document;
  }
  async function solve(doc, locked, label, name, freePose = false) {
    const before = await serial();
    if (configured) await button('Resolver configuración'); else await aria('Resolver ensamblaje');
    const row = await response(before, configured ? 'preview-configured-assembly' : 'preview-assembly');
    ready(row, doc, locked, label, name, freePose); await recovery(doc);
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
  async function savedConcentricEdit(baseline) {
    const name = 'Renamed retained axis lock', originalMate = baseline.mates[0];
    const editor = () => page(() => {
      const one = selector => { const rows = [...document.querySelectorAll(selector)]; if (rows.length !== 1) throw Error('One editor control required: ' + selector); return rows[0]; };
      const region = one('[aria-label="Edición de concentricidad"]'), type = one('[aria-label="Tipo de relación"]');
      const refs = [1, 2].map(i => one('[aria-label="Referencia ' + i + ' de la relación"]'));
      const unlock = one('input[aria-label="Desbloquear giro"]');
      return { visible: !region.closest('[hidden]') && region.getClientRects().length > 0, type: type.value, typeDisabled: type.disabled,
        refs: refs.map(e => ({ text: e.textContent.trim(), disabled: e.disabled })),
        name: one('input[aria-label="Nombre de la relación"]').value, alignment: one('[aria-label="Orientación de la relación"]').value,
        unlock: unlock.checked, previewDisabled: one('button[aria-label="Vista previa de la relación editada"]').disabled,
        newCreation: [...document.querySelectorAll('#assembly-panel-relations button')].some(e => e.textContent.trim() === 'Vista previa de la nueva relación'),
        captureCount: document.querySelectorAll('button[aria-label^="Bloquear giro "]').length,
        captureDisabled: [...document.querySelectorAll('button[aria-label^="Bloquear giro "]')].every(e => e.disabled),
        history: ['Deshacer', 'Rehacer'].map(label => one('button[aria-label="' + label + ' ensamblaje"]').disabled) };
    });
    async function editPreview(committed, locked, label) {
      const before = await serial(); await aria('Vista previa de la relación editada');
      const row = await response(before, 'preview-assembly'), candidate = ready(row, committed, locked, label, name, !locked);
      const { name: unusedName, rotationLock: unusedLock, ...identity } = candidate.mates[0];
      const { name: oldName, rotationLock: oldLock, ...originalIdentity } = originalMate;
      check(canonical(identity) === canonical(originalIdentity), 'Ordinary edit preserves the complete ordered relation identity and suppression');
      check(canonical(candidate.mates[0].rotationLock) === canonical(locked ? originalMate.rotationLock : null), 'Rename preserves exact capture bytes; explicit unlock alone removes them');
      const immutable = doc => ({ ...doc, updatedAt: null, mates: null, occurrences: doc.occurrences.map(o => ({ ...o, pose: null })) });
      check(canonical(immutable(candidate)) === canonical(immutable(committed)), 'Edited preview changes no source, scope identity, owner identity or fixed flags');
      await recovery(committed); return candidate;
    }
    async function accept(candidate, locked, label) {
      const before = await serial(); await aria('Aplicar ensamblaje'); const row = await response(before, 'apply-assembly'), doc = row.response.value.document;
      check(canonical(untimed(doc)) === canonical(untimed(candidate)), 'Ordinary edit Apply publishes the exact authenticated candidate');
      geometry(row.response.value.scene, doc, locked, label, name, !locked); await recovery(doc); return doc;
    }
    await aria('Editar concentricidad ' + originalMate.name);
    const initial = await editor();
    check(initial.visible && initial.type === 'concentric' && initial.typeDisabled && initial.refs.every(e => !e.disabled && e.text && !e.text.includes('Sin seleccionar'))
      && initial.name === originalMate.name && initial.alignment === 'aligned' && !initial.unlock && !initial.previewDisabled
      && !initial.newCreation && initial.captureCount === 1 && initial.captureDisabled, 'Saved locked relation exposes one guarded ordinary editor without recapture or new creation');
    await actualControl('input[aria-label="Nombre de la relación"]');
    await page(value => {
      const e = document.querySelector('input[aria-label="Nombre de la relación"]');
      if (!e || e.disabled || e.closest('[hidden]') || !e.getClientRects().length) throw Error('Visible editable relation name required');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, value); e.dispatchEvent(new Event('input', { bubbles: true }));
    }, name);
    let proposed = await editPreview(baseline, true, 'saved-rename-preview');
    const renamed = await accept(proposed, true, 'saved-rename-applied');
    check(canonical(renamed.mates[0]) === canonical({ ...originalMate, name }), 'Renaming the saved relation retains every capture and reference byte');
    await aria('Editar concentricidad ' + name);
    const beforeUnlock = await editor(), committedRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
    await actualControl('input[aria-label="Desbloquear giro"]');
    proposed = await editPreview(renamed, false, 'unlock-preview');
    await cancel(renamed, true, 'unlock-cancel');
    const retained = await editor();
    check(retained.visible && retained.name === name && retained.unlock && retained.alignment === 'aligned' && !retained.previewDisabled
      && canonical(retained.refs) === canonical(beforeUnlock.refs) && canonical(retained.history) === canonical(beforeUnlock.history), 'Unlock Cancel retains editable fields, ordered references and history availability');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === committedRecovery, 'Unlock Cancel retains exact locked committed recovery bytes');
    const retry = await editPreview(renamed, false, 'unlock-retry');
    check(canonical(retry.mates) === canonical(proposed.mates), 'Unlock retry preserves the exact declaration without a fabricated free pose');
    const unlocked = await accept(retry, false, 'unlock-applied');
    for (const [redo, wanted, locked] of [[false, renamed, true], [true, unlocked, false]]) {
      const before = await serial(); await aria((redo ? 'Rehacer' : 'Deshacer') + ' ensamblaje');
      const row = await response(before, BUILD); check(canonical(row.document) === canonical(wanted), 'Unlock history restores the exact entire committed document');
      geometry(row.response.value, wanted, locked, redo ? 'unlock-redo' : 'unlock-undo', name, !locked); await recovery(wanted);
    }
    checks.push({ savedConcentricEdit: { id: originalMate.id, name, lockBefore: originalMate.rotationLock, lockAfter: unlocked.mates[0].rotationLock,
      initial, retained, committedSha256: digest(Buffer.from(canonical(renamed))), unlockedSha256: digest(Buffer.from(canonical(unlocked))),
      cancelledRecoverySha256: digest(Buffer.from(committedRecovery)), expectedLocalDOF: { locked: 1, unlocked: 2 } } });
    return unlocked;
  }
  return async () => {
    await waitFor('production startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const sourceBytes = await fs.readFile(input); let before = await serial(); await aria('Abrir (Ctrl+O)');
    await waitFor('owned replacement dialog', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let row = await response(before, BUILD);
    check(canonical(configured ? row.current.document : row.document) === canonical(expected), 'File IPC opens exact original free-axis assembly');
    geometry(row.response.value, expected, false, 'initial'); await recovery(expected);
    await require('./desktop-compact-viewport-controls.cjs')({ configured, page, waitFor, actualControl, observe, check, checks, canonical });
    const originalRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
    const first = await lockPreview(expected, false); await cancel(expected, false, 'capture-cancel');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === originalRecovery, 'Capture Cancel preserves exact recovery bytes');
    const proposed = await lockPreview(expected, true);
    check(canonical(configured ? proposed : untimed(proposed)) === canonical(configured ? first : untimed(first)), 'Canceled capture retry preserves all candidate fields except the standard capture timestamp');
    if (!configured) check(Number.isFinite(Date.parse(first.updatedAt)) && Date.parse(first.updatedAt) > Date.parse(expected.updatedAt)
      && Date.parse(proposed.updatedAt) >= Date.parse(first.updatedAt), 'Fresh standard captures advance valid timestamps without committing');
    before = await serial(); if (configured) await button('Aplicar configuración'); else await aria('Aplicar ensamblaje');
    row = await response(before, configured ? 'apply-configured-assembly' : 'apply-assembly'); let current = row.response.value.document;
    check(canonical(configured ? current : untimed(current)) === canonical(configured ? proposed : untimed(proposed)), 'Apply publishes only the authenticated candidate');
    geometry(configured ? (await response(before, BUILD)).response.value : row.response.value.scene, current, true, 'applied'); await recovery(current);
    for (const [redo, wanted, locked] of [[false, expected, false], [true, current, true]]) {
      before = await serial(); if (configured) await button(redo ? 'Rehacer' : 'Deshacer'); else await aria((redo ? 'Rehacer' : 'Deshacer') + ' ensamblaje');
      row = await response(before, BUILD); check(canonical(configured ? row.current.document : row.document) === canonical(wanted), 'History restores exact complete document');
      geometry(row.response.value, wanted, locked, redo ? 'redo' : 'undo'); await recovery(wanted);
    }
    if (!configured) current = await savedConcentricEdit(current);
    const finalLocked = configured, finalName = declarations(current)[0].name;
    if (configured) { await button('Guardar como'); await waitFor('canceled Save As', () => ipc.filter(r => r.channel === 'document:save' && r.completed).length === 1); await recovery(current); }
    await button('Guardar como');
    await waitFor('completed saved bytes and idle clean header', async () => { try { return ipc.filter(r => r.channel === 'document:save' && r.completed).length === (configured ? 2 : 1)
      && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(current)
      && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false' && !document.querySelector(root + ' header')?.textContent.includes('*'), ROOT);
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; } });
    const savedBytes = await fs.readFile(output); before = await serial(); await button('Abrir'); row = await response(before, BUILD);
    check(canonical(configured ? row.current.document : row.document) === canonical(current), 'Reopen retains complete captured document');
    geometry(row.response.value, current, finalLocked, 'reopened', finalName, !configured); await recovery(current);
    const reopenedRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
    await solve(current, finalLocked, 'fresh-saved-solve', finalName, !configured); await cancel(current, finalLocked, 'fresh-solve-cancel');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === reopenedRecovery, 'Fresh saved Solve/Cancel preserves exact recovery bytes');
    check((await fs.readFile(input)).equals(sourceBytes) && (await fs.readFile(output)).equals(savedBytes), 'Preview, history and fresh Cancel do not alter input or saved bytes');
    check(dialogCounts().opens === 2 && dialogCounts().saves === (configured ? 2 : 1), 'Exact owned Open/Save dialog counts');
    const final = await observe(); check(!final.workerErrors.length && !final.assemblies.some(r => r.response?.ok === false) && !consoleErrors.length && !failedRequests.length, 'No native, transport, console or resource failures');
    checks.push({ scenario: configured ? 'configured-origin-axis-lock' : 'origin-axis-lock', phases, gestures,
      limits: 'Actual stationary hit-tested command presses; native file dialogs use owned paths. Literal Rz30 asymmetric prisms and relative quaternion before unlock; standard saved rename preserves capture bytes, explicit unlock restores DOF2 with independent eight-corner bounds and axis residuals, without prescribing free slide or spin. Configured capture route unchanged. Exact document history and saved bytes. Axial freedom is solver DOF evidence, not a demonstrated drag.',
      sourceSha256: digest(sourceBytes), savedSha256: digest(savedBytes) });
    await capture(current);
  };
};
