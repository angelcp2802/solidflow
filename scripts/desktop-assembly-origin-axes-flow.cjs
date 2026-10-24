'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Real controls, worker previews and file IPC. Literal prism geometry and angle
// formulas are independent of the application's reference/solver helpers.
module.exports = function originAxesWorkflow(c) {
  c = require('./desktop-assembly-navigation.cjs').withNavigation(c);
  const assemblyNavigation = c.assemblyNavigation;
  const { configured, expected, input, output, evaluate, observe, waitFor, click, capture, checks,
    consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = c;
  const ROOT = configured ? '.configured-assembly-workspace' : '.assembly-app';
  const NAV = configured ? ':is([aria-label="Archivo del ensamblaje configurado"],[aria-label="Comandos del ensamblaje configurado"])' : ':is(.assembly-toolbar, .assembly-quickbar)';
  const FORM = '[aria-label="Editar relación del estado"]';
  const BUILD = configured ? 'build-configured-assembly' : 'build-assembly';
  const phases = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = configured ? require('./desktop-configured-navigation.cjs')({page,waitFor}) : null;
  const near = (actual, wanted, tolerance, name) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    name + ': actual=' + actual + ', expected=' + wanted);
  async function button(text, parent = ROOT) { await assemblyNavigation.button(text, parent);
    if (navigation) await navigation.reveal(parent + ' button', text);
    await page((text, parent) => { const matches = [...document.querySelectorAll(parent + ' button')].filter(e => e.textContent.trim() === text);
      if (matches.length !== 1 || matches[0].disabled) throw Error('One enabled button required: ' + text); matches[0].click(); }, text, parent);
  }
  async function control(label, value) { await assemblyNavigation.reveal('[aria-label="' + label + '"]');
    if (navigation) await navigation.reveal('[aria-label="' + label + '"]');
    await page((label, value) => { const e = document.querySelector('[aria-label="' + label + '"]');
      if (!e || e.disabled) throw Error('Enabled control required: ' + label);
      const p = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Exact enabled option absent: ' + label);
      Object.getOwnPropertyDescriptor(p, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, value);
  }
  async function response(after, action) {
    return waitFor('actual ' + action, async () => { const state = await observe(); check(!state.workerErrors.length, 'No worker transport error');
      const rows = state.assemblies.filter(r => r.serial > after && r.action === action && r.response);
      check(rows.length <= 1, 'One requested native response'); if (!rows.length) return false;
      check(rows[0].response.ok, rows[0].response.error || 'Native request failed'); return rows[0]; });
  }
  async function recovery(doc) {
    await waitFor('exact idle committed recovery', async () => {
      const raw = await page(() => localStorage.getItem('solidflow.autosave'));
      return raw && canonical(JSON.parse(raw)) === canonical(doc) && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false', ROOT);
    });
  }
  function geometry(wrapper, doc, stage, label) {
    const scene = configured ? wrapper.scene : wrapper;
    if (configured) {
      check(wrapper.kind === 'configured-assembly-scene' && wrapper.context.rootConfiguration === 'demo', 'Exact configured scene selector');
      check(canonical(JSON.parse(wrapper.context.sourceSignature)) === canonical(doc.source) && canonical(JSON.parse(wrapper.context.catalogSignature)) === canonical(doc.catalog), 'Exact full scene context');
      check(canonical(doc.source) === canonical(expected.source), 'Named edits preserve complete Base geometry and declarations');
      check(canonical(doc.catalog[0].configurations.find(v => v.id === 'untouched')) === canonical(expected.catalog[0].configurations[1]), 'Dormant state remains unchanged');
    } else check(canonical(doc.definitions) === canonical(expected.definitions), 'Embedded original source geometry unchanged');
    check(scene.solidCount === 2 && scene.prototypeCount === 1 && scene.bodies.length === 2 && !scene.warnings.length, 'Two independent original solids');
    near(scene.volume, 48, 1e-5, 'Total volume mm3'); near(scene.area, 104, 1e-5, 'Total area mm2');
    for (const id of ['ground', 'moving']) {
      const rows = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id]));
      check(rows.length === 1 && rows[0].component.definition.id === 'origin-axis-prism' && rows[0].component.definition.revision === 'r1', 'Exact native placed member');
      const b = rows[0], q = b.worldPose.rotation;
      // Concentricity leaves axial translation and spin free. Validate only
      // constrained coordinates; use the observed free coordinates to check
      // the independently known placed prism dimensions and native bounds.
      check(b.worldPose.translation.every(Number.isFinite), 'Finite actual placement');
      const translation = id === 'ground' ? [-15, 0, 0] : stage ? [0, 0, b.worldPose.translation[2]] : [20, 10, 6];
      const theta = (stage === 2 ? 30 : 20) * Math.PI / 180;
      const cos = id === 'moving' && stage === 1 ? 1 - 2 * q[2] * q[2] : Math.cos(theta);
      const sin = id === 'moving' && stage === 1 ? 2 * q[2] * q[3] : Math.sin(theta);
      near(b.volume, 24, 1e-5, 'Member volume'); near(b.area, 52, 1e-5, 'Member area');
      translation.forEach((v, i) => { if (id === 'ground' || stage === 0 || i < 2) near(b.worldPose.translation[i], v, 1e-5, id + ' origin'); });
      near(Math.hypot(...q), 1, 1e-9, 'Unit rotation');
      near(q[0], 0, 1e-6, 'Origin Z remains vertical X'); near(q[1], 0, 1e-6, 'Origin Z remains vertical Y');
      if (id === 'ground' || stage !== 1) {
        near(2 * q[2] * q[3], id === 'ground' ? 0 : sin, 1e-6, 'Independent positive X direction Y');
        near(1 - 2 * q[2] * q[2], id === 'ground' ? 1 : cos, 1e-6, 'Independent X direction X');
      }
      const corners = [[0, 0], [2 * cos, 2 * sin], [-3 * sin, 3 * cos], [2 * cos - 3 * sin, 2 * sin + 3 * cos]];
      const lo = id === 'ground' ? [-15, 0, 0] : [translation[0] + Math.min(...corners.map(p => p[0])), translation[1] + Math.min(...corners.map(p => p[1])), translation[2]];
      const hi = id === 'ground' ? [-13, 3, 4] : [translation[0] + Math.max(...corners.map(p => p[0])), translation[1] + Math.max(...corners.map(p => p[1])), translation[2] + 4];
      lo.forEach((v, i) => near(b.bounds.min[i], v, 1e-5, 'Literal placed minimum'));
      hi.forEach((v, i) => near(b.bounds.max[i], v, 1e-5, 'Literal placed maximum'));
    }
    phases.push({ label, stage, volume: scene.volume, area: scene.area, placements: scene.bodies.map(b => ({ path: b.component.occurrencePath, pose: b.worldPose, bounds: b.bounds })) });
  }
  function declarations(doc) { return configured ? doc.catalog[0].configurations.find(v => v.id === 'demo').mateDeclarations ?? [] : doc.mates; }
  function ready(row, baseline, stage) {
    const v = row.response.value;
    check(configured ? v.kind === 'configured-assembly-preview' && v.hasToken && v.verification.accepted && v.verification.status === 'verified'
      : v.status === 'ready' && v.hasToken && v.checks.length === stage && v.checks.every(c => c.satisfied), 'Authenticated physically verified preview');
    if (configured) check(canonical(row.current.document) === canonical(baseline) && v.verification.reports.length === stage
      && v.verification.reports.every(r => !r.passive && r.measurement.status === 'ok' && r.measurement.satisfied), 'Every placed configured relation physically verified');
    else check(v.scopes.length === 1 && !v.scopes[0].temporaryAnchor && v.scopes[0].result.localDOF === (stage === 1 ? 2 : 1), 'Concentric keeps slide/spin; angle removes only spin');
    const mates = declarations(v.document);
    check(mates.length === stage && mates[0].type === 'concentric' && mates[0].rotationLock === null, 'Saved origin concentric retains free spin');
    for (const [i, mate] of mates.entries()) {
      check(mate.first.kind === 'principal-axis' && mate.second.kind === 'principal-axis'
        && mate.first.axis === (i ? 'X' : 'Z') && mate.second.axis === mate.first.axis
        && canonical(mate.first.component.occurrencePath) === '["moving"]' && mate.first.component.definition.id === 'origin-axis-prism'
        && mate.second.component === null, 'Exact root/component axis declarations');
    }
    if (stage === 2) check(mates[1].type === 'angle' && mates[1].angle === 30, 'Saved 30 degree relation');
    geometry(v.scene, v.document, stage, 'preview-' + stage); return v.document;
  }
  async function draft(stage) {
    const type = stage === 1 ? 'concentric' : 'angle', axis = stage === 1 ? 'Z' : 'X';
    if (configured && !await page(form => !!document.querySelector(form), FORM)) await button('Nueva relación configurada', '[aria-label="Relaciones del estado configurado"]');
    await control(configured ? 'Tipo de relación configurada' : 'Tipo de relación', type);
    await control(configured ? 'Nombre de relación configurada' : 'Nombre de la relación', stage === 1 ? 'Origin Z alignment' : 'Origin X 30 degrees');
    for (const [slot, owner] of [[1, 'moving'], [2, null]]) {
      if (configured) {
        const label = 'Referencia ' + slot + ' de relación configurada';
        const value = await page((label, owner, axis) => { const e = document.querySelector('[aria-label="' + label + '"]');
          const matches = [...e.options].filter(o => { try { const r = JSON.parse(o.value); return r.kind === 'principal-axis' && r.axis === axis
            && (owner ? JSON.stringify(r.component?.occurrencePath) === JSON.stringify([owner]) && r.component.definition.id === 'origin-axis-prism' : r.component === null); } catch { return false; } });
          if (matches.length !== 1) throw Error('One current exact origin-axis option required'); return matches[0].value;
        }, label, owner, axis);
        await control(label, value);
      } else {
        await click('button[aria-label="Referencia ' + slot + ' de la relación"]');
        (await assemblyNavigation.panel('relations'), await page(() => { const d = [...document.querySelectorAll('details')].find(d => d.querySelector('summary')?.textContent === 'Usar un eje de origen'); if (!d) throw Error('Origin axis controls absent'); d.open = true; }));
        await control('Componente del eje de origen', owner ? JSON.stringify([owner]) : 'scope');
        await control('Eje de origen', axis); await button('Usar eje en referencia ' + slot);
      }
    }
    if (stage === 2) await control(configured ? 'Ángulo de relación configurada en grados' : 'Ángulo de relación', '30');
  }
  async function preview(baseline, stage) {
    const before = await observe(); await button(configured ? 'Vista previa de relación configurada' : 'Vista previa de la nueva relación', configured ? FORM : ROOT);
    const row = await response(before.serial, configured ? 'preview-configured-assembly-relation-edit' : 'preview-assembly'); return ready(row, baseline, stage);
  }
  async function apply(proposed, stage) {
    await waitFor('Apply enabled', () => page((configured, nav) => configured
      ? [...document.querySelectorAll(nav + ' button')].some(b => b.textContent.trim() === 'Aplicar configuración' && !b.disabled)
      : document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === false, configured, NAV));
    const before = await observe(); if (configured) await button('Aplicar configuración', NAV); else await click('button[aria-label="Aplicar ensamblaje"]');
    const row = await response(before.serial, configured ? 'apply-configured-assembly' : 'apply-assembly'), actual = row.response.value.document;
    const withoutTimestamp = doc => { const { updatedAt, ...rest } = doc; return rest; };
    check(canonical(withoutTimestamp(actual)) === canonical(withoutTimestamp(proposed)), 'Apply publishes exactly the authenticated proposal');
    const scene = configured ? (await response(before.serial, BUILD)).response.value : row.response.value.scene;
    geometry(scene, actual, stage, 'applied-' + stage); await recovery(actual); return actual;
  }
  async function history(redo, wanted, stage) {
    const before = await observe(); if (configured) await button(redo ? 'Rehacer' : 'Deshacer', NAV); else await click('button[aria-label="' + (redo ? 'Rehacer' : 'Deshacer') + ' ensamblaje"]');
    const row = await response(before.serial, BUILD), actual = configured ? row.current.document : row.document;
    check(canonical(actual) === canonical(wanted), 'History restores complete document'); geometry(row.response.value, actual, stage, redo ? 'redo' : 'undo'); await recovery(actual);
  }
  return async () => {
    await waitFor('production startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const sourceBytes = await fs.readFile(input); let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('owned replacement prompt', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let row = await response(before.serial, BUILD); check(canonical(configured ? row.current.document : row.document) === canonical(expected), 'Actual original opened through file IPC');
    geometry(row.response.value, expected, 0, 'initial'); await recovery(expected);
    await draft(1); const rejectedCommit = await preview(expected, 1); await recovery(expected);
    if (configured) await button('Cancelar', NAV); else await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
    await recovery(expected); await draft(1); let proposed = await preview(expected, 1);
    const intents = doc => declarations(doc).map(({ id, ...intent }) => intent);
    check(canonical(intents(proposed)) === canonical(intents(rejectedCommit)), 'Canceled draft preserves the same complete relation intent');
    let current = await apply(proposed, 1); const first = current;
    await draft(2); proposed = await preview(current, 2); current = await apply(proposed, 2);
    await history(false, first, 1); await history(true, current, 2);
    if (configured) { await button('Guardar como', NAV); await waitFor('actual canceled Save As', () => ipc.filter(x => x.channel === 'document:save' && x.completed).length === 1); await recovery(current); }
    await button('Guardar como', NAV);
    await waitFor('actual saved bytes and completed Save', async () => { try { return ipc.filter(x => x.channel === 'document:save' && x.completed).length === (configured ? 2 : 1)
      && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(current)
      && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false' && !document.querySelector(root + ' header')?.textContent.includes('*'), ROOT); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } });
    const savedBytes = await fs.readFile(output); before = await observe(); await button('Abrir', NAV); row = await response(before.serial, BUILD);
    check(canonical(configured ? row.current.document : row.document) === canonical(current), 'Reopened saved document exactly retains axis identities and mates');
    geometry(row.response.value, current, 2, 'reopened'); await recovery(current);
    check((await fs.readFile(input)).equals(sourceBytes) && (await fs.readFile(output)).equals(savedBytes), 'Input and saved bytes unchanged by reopen');
    check(dialogCounts().opens === 2 && dialogCounts().saves === (configured ? 2 : 1), 'Exact native Open/Save dialog count');
    check(!consoleErrors.length && !failedRequests.length, 'No console or resource failures');
    checks.push({ scenario: configured ? 'configured-origin-axes' : 'origin-axes', phases, savedSha256: digest(savedBytes), sourceSha256: digest(sourceBytes) });
    await capture(current);
  };
};
