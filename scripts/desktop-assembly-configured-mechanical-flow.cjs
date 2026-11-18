'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Five fixed commands share original dimensions and independent coordinate
// oracles. Only actual DOM controls, production worker and file IPC are used.
module.exports = function configuredMechanicalWorkflow(c) {
  const { family, expected, input, output, evaluate, observe, waitFor, click, capture, check, checks, canonical, digest, completePendingSave,
    ipc, dialogCounts, consoleErrors, failedRequests, initialReadyMs } = c;
  const ROOT = '.configured-assembly-workspace', NAV = ':is([aria-label="Archivo del ensamblaje configurado"],[aria-label="Comandos del ensamblaje configurado"])';
  const FORM = '[aria-label="Editar relación mecánica del estado"]', ACTION = 'preview-configured-assembly-mechanical-edit', phases = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
 const navigation=require('./desktop-configured-navigation.cjs')({page,waitFor});
  async function button(text, parent = ROOT) { await navigation.reveal(parent+' button',text); await page((text, parent) => {
    const found = [...document.querySelectorAll(parent + ' button')].filter(b => b.textContent.trim() === text);
    if (found.length !== 1 || found[0].disabled) throw Error('One enabled button required: ' + text); found[0].click();
  }, text, parent); }
  async function aria(label) { await navigation.reveal('button[aria-label="'+label+'"]'); await page(label => { const b = document.querySelector('button[aria-label="' + label + '"]'); if (!b || b.disabled) throw Error('Enabled button required: ' + label); b.click(); }, label); }
  async function control(label, value) { await navigation.reveal('[aria-label="'+label+'"]'); await page((label, value) => {
    const e = document.querySelector('[aria-label="' + label + '"]'); if (!e || e.disabled) throw Error('Enabled control required: ' + label);
    const p = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(p, 'value').set.call(e, value); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }, label, value); }
  async function response(after, action) { return waitFor('actual ' + action, async () => {
    const s = await observe(); check(!s.workerErrors.length, 'Real worker transport healthy');
    const r = s.assemblies.filter(r => r.serial > after && r.action === action && r.response).at(-1);
    if (!r) return false; check(r.response.ok, r.response.error || 'Native request failed'); return r;
  }); }
  async function recovery(doc) { await waitFor('exact configured recovery', async () => {
    const raw = await page(() => localStorage.getItem('solidflow.autosave'));
    return raw && canonical(JSON.parse(raw)) === canonical(doc) && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false', ROOT);
  }); }
  async function savedReady(doc,label) {
    await completePendingSave();
    const ready=await waitFor(label+' clean configured saved controls',()=>page((name,file,nav)=>{
      const root=document.querySelector('.configured-assembly-workspace'),header=root?.querySelector('header');
      const rows=[...document.querySelectorAll(nav+' button')],one=text=>rows.filter(b=>b.textContent.trim()===text);
      const open=one('Abrir'),save=one('Guardar'),apply=one('Aplicar configuración');
      if(root?.getAttribute('aria-busy')!=='false'||header?.querySelector('.assembly-shell-document > strong')?.textContent!==name
        ||header?.querySelector('.assembly-shell-file')?.getAttribute('title')!==file||open.length!==1||open[0].disabled
        ||save.length!==1||save[0].disabled||apply.length!==1||!apply[0].disabled)return false;
      return {busy:'false',header:header.querySelector('.assembly-shell-document > strong').textContent,file:header.querySelector('.assembly-shell-file').textContent,openEnabled:true,saveEnabled:true,applyDisabled:true};
    },doc.source.name,output,NAV));
    await recovery(doc);checks.push({savedRendererReady:{label,...ready}});
  }
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance, label + ': ' + actual + ' / ' + wanted);
  const variants = doc => doc.catalog.find(r => r.definition.id === 'mechanical-S').configurations;
  const compact = doc => variants(doc).find(v => v.id === 'compact');
  const mate = doc => { const rows = compact(doc).mateDeclarations ?? []; check(rows.length === 1 && rows[0].type === family, 'One actual captured named declaration'); return rows[0]; };
  function preserved(doc) {
    check(canonical(doc.source) === canonical(expected.source), 'Named capture leaves Base source untouched');
    check(canonical(doc.catalog[0]) === canonical(expected.catalog[0]), 'Root selector definitions untouched');
    check(canonical(variants(doc).find(v => v.id === 'dormant')) === canonical(variants(expected).find(v => v.id === 'dormant')), 'Dormant named state untouched');
  }
  function geometry(wrapper, doc, captured, label) {
    check(wrapper.kind === 'configured-assembly-scene' && wrapper.context.rootConfiguration === doc.rootConfiguration, 'Actual selected configured scene');
    check(canonical(JSON.parse(wrapper.context.sourceSignature)) === canonical(doc.source) && canonical(JSON.parse(wrapper.context.catalogSignature)) === canonical(doc.catalog), 'Exact complete native context');
    const s = wrapper.scene; check(s.bodies.length === 6 && s.solidCount === 6 && s.prototypeCount === 3 && s.warnings.length === 0, 'Six original solids / three prototypes');
    near(s.volume, 38 * Math.PI + 48, 1e-5, 'Independent total volume'); near(s.area, 64 * Math.PI + 104, 1e-5, 'Independent total area');
    const radius = { a: 2, b: 1 }, sizes = { a: [16 * Math.PI, 24 * Math.PI], b: [3 * Math.PI, 8 * Math.PI], rack: [24, 52] };
    check(new Set(s.bodies.map(b => canonical(b.component.occurrencePath))).size === 6, 'One native member for every exact placement');
    for (const owner of ['left', 'right']) for (const leaf of ['a', 'b', 'rack']) {
      const b = s.bodies.find(b => canonical(b.component.occurrencePath) === canonical([owner, leaf]));
      check(b && b.component.definition.id === 'mechanical-' + (leaf === 'rack' ? leaf : leaf.toUpperCase()) && b.component.definition.revision === 'r1' && b.solidCount === 1, 'Exact original member tuple');
      near(b.volume, sizes[leaf][0], 1e-5, 'Member volume'); near(b.area, sizes[leaf][1], 1e-5, 'Member area');
      const base = doc.rootConfiguration === 'mixed' && owner === 'left';
      const bx = base ? 8 : captured && ['concentric', 'screw'].includes(family) ? 0 : 6;
      const center = leaf === 'a' ? [0, 0] : leaf === 'b' ? [bx, 0] : [1, 9.5];
      const cx = owner === 'left' ? center[0] : 30 - center[1], cy = owner === 'left' ? center[1] : center[0];
      const half = leaf === 'rack' ? owner === 'left' ? [1, 1.5] : [1.5, 1] : [radius[leaf], radius[leaf]];
      const min = [cx - half[0], cy - half[1], 0], max = [cx + half[0], cy + half[1], leaf === 'b' ? 3 : 4];
      for (let i = 0; i < 3; i++) { near(b.bounds.min[i], min[i], 1e-6, 'Independent minimum'); near(b.bounds.max[i], max[i], 1e-6, 'Independent maximum'); }
    }
    phases.push({ label, generation: wrapper.context.generation, selected: doc.rootConfiguration, volume: s.volume, area: s.area, members: s.bodies.map(b => ({ path: b.component.occurrencePath, bounds: b.bounds })) });
  }
  function captureOracle(doc, wrapper) {
    const m = mate(doc), identity = [0, 0, 0, 1];
    const quaternion = (q, wanted = identity) => { check(Array.isArray(q) && q.length === 4, 'Captured quaternion dimensions'); const sign = q.reduce((s, v, i) => s + v * wanted[i], 0) < 0 ? -1 : 1; q.forEach((v, i) => near(v, sign * wanted[i], 1e-9, 'Independent neutral quaternion')); };
    // Unlocked alignment leaves axial spin free. Measure that actual physical
    // pose rather than inventing an identity-spin requirement. Left/A is fixed
    // at the literal identity, so the relative quaternion is B or conjugate(B).
    let alignedRotation;
    if (family === 'concentric' || family === 'screw') {
      const a = wrapper.scene.bodies.find(b => canonical(b.component.occurrencePath) === canonical(['left', 'a']));
      const b = wrapper.scene.bodies.find(b => canonical(b.component.occurrencePath) === canonical(['left', 'b']));
      quaternion(a.worldPose.rotation); alignedRotation = b.worldPose.rotation;
      near(alignedRotation[0], 0, 1e-6, 'Aligned B X quaternion component'); near(alignedRotation[1], 0, 1e-6, 'Aligned B Y quaternion component'); near(Math.hypot(...alignedRotation), 1, 1e-10, 'Actual aligned unit rotation');
    }
    if (family === 'lock') { quaternion(m.relativePose.rotation); m.relativePose.translation.forEach((v, i) => near(v, i === 0 ? 6 : 0, 1e-9, 'Independent relative component translation')); }
    else if (family === 'concentric') quaternion(m.rotationLock, alignedRotation);
    else if (family === 'gear') { quaternion(m.neutralRotations.first); quaternion(m.neutralRotations.second); check(m.angles.first === 0 && m.angles.second === 0 && m.phase === 0, 'Explicit zero neutral weighted phase and turn branches'); }
    else { quaternion(m.neutralRotation, family === 'screw' ? [-alignedRotation[0], -alignedRotation[1], -alignedRotation[2], alignedRotation[3]] : identity); near(m.neutralTravel, 0, 1e-9, 'Independent zero axial/material travel'); check(m.angle === 0, 'Fresh capture starts on explicit zero turn branch'); }
  }
  function verified(value, doc) {
    const owners = doc.rootConfiguration === 'mixed' ? ['right'] : ['left', 'right'];
    const id = mate(doc).id, keys = owners.map(owner => JSON.stringify([[owner], 'mechanical-S', 's-r1', 'compact', id]));
    check(value.verification.status === 'verified' && value.verification.accepted && canonical(value.verification.reports.map(r => r.key).sort()) === canonical(keys.sort()), 'Every placed shared relation independently verified exactly once');
    for (const r of value.verification.reports) check(!r.passive && r.measurement.status === 'ok' && r.measurement.satisfied, 'Fresh physical relation measurement satisfied');
  }
  async function choose(label, leaf, purpose) {
    const value = await page((label, leaf, purpose) => {
      const s = document.querySelector('[aria-label="' + label + '"]');
      const matches = [...s.options].filter(o => { try { const r = JSON.parse(o.value), component = purpose === 'component' ? r : r.component;
        if (component?.occurrencePath.length !== 1 || component.occurrencePath[0] !== leaf) return false;
        return purpose === 'component' || purpose === 'axis' && r.kind === 'face' && r.support === 'axis' || purpose === 'line' && r.kind === 'edge';
      } catch { return false; } });
      if (!matches.length || purpose !== 'line' && matches.length !== 1) throw Error('One actual current mechanical nominee required: ' + label);
      // A prism has several LINE edges. Select its explicit native X direction
      // using the real option's reference, checked against observed geometry later.
      return matches.map(o => o.value);
    }, label, leaf, purpose);
    let picked = value[0];
    if (purpose === 'line') {
      const current = (await observe()).assemblies.filter(r => r.action === 'build-configured-assembly' && r.response?.ok).at(-1).response.value.scene;
      const body = current.bodies.find(b => canonical(b.component.occurrencePath) === canonical(['right', 'rack']));
      const edges = body.edges.filter(e => e.support?.kind === 'line' && Math.abs(e.support.axis[0]) > .99 && Math.abs(e.support.point[1]) < 1e-9 && Math.abs(e.support.point[2]) < 1e-9);
      check(edges.length === 1, 'Unique original material X edge at local y=z=0');
      const e = edges[0].selection, ref = { kind: 'edge', ...e, component: { ...e.component, occurrencePath: ['rack'] }, body: e.body ?? null, support: 'line' };
      const found = value.filter(v => canonical(JSON.parse(v)) === canonical(ref)); check(found.length === 1, 'Actual DOM nominee matches independent native LINE role'); picked = found[0];
    }
    await control(label, picked);
  }
  async function preview(baseline, mode) {
    const before = await observe(); await button('Vista previa de relación mecánica configurada', FORM); const r = await response(before.serial, ACTION), v = r.response.value;
    check(canonical(r.current.document) === canonical(baseline), 'Capture request bound to original complete baseline');
    check(canonical(r.intent.scopePath) === canonical(['right']) && r.intent.definition.id === 'mechanical-S' && r.intent.definition.revision === 's-r1' && r.intent.configuration === 'compact', 'Exact configured capture target');
    const change = r.intent.change; check(change.kind === (mode === 'add' ? 'add' : 'replace') && (mode === 'add' || change.capture === mode), 'Exact native capture / retain intent');
    check(!['relativePose', 'rotationLock', 'neutralRotations', 'angles', 'neutralRotation', 'neutralTravel', 'angle'].some(k => Object.hasOwn(change.spec, k)), 'Renderer sends no captured neutral or saved turns');
    check(v.kind === 'configured-assembly-preview' && v.hasToken && v.candidateGeneration > v.generation, 'Actual private single-use ready proposal');
    preserved(v.document); verified(v, v.document); geometry(v.scene, v.document, true, mode + '-ready'); captureOracle(v.document, v.scene); await recovery(baseline); return v.document;
  }
  async function apply(staged) {
    const before = await observe(); await button('Aplicar configuración', NAV); const a = await response(before.serial, 'apply-configured-assembly');
    check(canonical(a.response.value.document) === canonical(staged), 'Apply publishes exact privately captured candidate');
    const b = await response(before.serial, 'build-configured-assembly'); geometry(b.response.value, staged, true, 'applied'); await recovery(staged); return staged;
  }
  async function history(label, doc, captured) { const before = await observe(); await button(label, NAV); const row = await response(before.serial, 'build-configured-assembly'); check(canonical(row.current.document) === canonical(doc), label + ' restores complete v3 context'); geometry(row.response.value, doc, captured, label); await recovery(doc); }
  const navigateScope=require('./desktop-configured-scope-navigation.cjs')({page,control,observe,waitFor,check,canonical,ipc,dialogCounts,checks:c.checks});
 return async () => {
    await waitFor('production startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const originalBytes = await fs.readFile(input); let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('initial discard dialog', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]'))); await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let row = await response(before.serial, 'build-configured-assembly'); check(canonical(row.current.document) === canonical(expected), 'Real file IPC opened original configured geometry'); geometry(row.response.value, expected, false, 'initial'); await recovery(expected);
    before = await observe(); await navigateScope('["right"]');
    await button('Nueva relación mecánica configurada'); await control('Tipo de relación mecánica configurada', family); let name = 'Original configured ' + family; await control('Nombre de relación mecánica configurada', name);
    await choose('Referencia 1 mecánica configurada', 'a', family === 'lock' ? 'component' : 'axis');
    await choose('Referencia 2 mecánica configurada', family === 'rack-pinion' ? 'rack' : 'b', family === 'lock' ? 'component' : family === 'rack-pinion' ? 'line' : 'axis');
    if (family === 'gear') await choose('Portador mecánico configurado', 'rack', 'component');
    let staged = await preview(expected, 'add'); before = await observe(); await button('Cancelar', NAV); await response(before.serial, 'discard-configured-assembly'); row = await response(before.serial, 'build-configured-assembly'); geometry(row.response.value, expected, false, 'cancel'); await recovery(expected);
    const retry = await preview(expected, 'add'); check(canonical(retry) === canonical(staged), 'Canceled native capture retry has identical complete candidate'); let current = await apply(retry);
    await history('Deshacer', expected, false); await history('Rehacer', current, true);
    const originalCapture = mate(current); await aria('Editar relación configurada ' + name); name += ' edited'; await control('Nombre de relación mecánica configurada', name);
    if (family === 'gear') { await control('Numerador mecánico configurado', '5'); await control('Denominador mecánico configurado', '7'); }
    if (family === 'screw') await control('Avance de tornillo configurado en mm por vuelta', '2');
    if (family === 'rack-pinion') { await control('Conversión de cremallera configurada', 'travel'); await control('Sustitución de cremallera configurada en mm', '10'); }
    staged = await preview(current, 'retain'); const retained = mate(staged);
    for (const k of ['relativePose', 'rotationLock', 'neutralRotations', 'angles', 'neutralRotation', 'neutralTravel', 'angle']) if (Object.hasOwn(originalCapture, k)) check(canonical(retained[k]) === canonical(originalCapture[k]), 'Parameter edit retains exact capture field ' + k);
    current = await apply(staged); const beforeRecapture = current;
    await aria('Editar relación configurada ' + name); name += ' recaptured'; await control('Nombre de relación mecánica configurada', name); await control('Captura mecánica configurada', 'recapture'); staged = await preview(current, 'recapture'); current = await apply(staged);
    await history('Deshacer', beforeRecapture, true); await history('Rehacer', current, true);
    before = await observe(); await control('Configuración raíz', 'mixed'); row = await response(before.serial, 'build-configured-assembly'); current = row.current.document; geometry(row.response.value, current, true, 'Base-isolated'); preserved(current); await recovery(current);
    const headerBefore = await page(root => document.querySelector(root + ' header')?.textContent, ROOT);
    await button('Guardar como', NAV); await waitFor('canceled Save As', () => ipc.filter(x => x.channel === 'document:save' && x.completed).length === 1);
    check(dialogCounts().saves === 1 && await page(root => document.querySelector(root + ' header')?.textContent, ROOT) === headerBefore, 'Canceled Save As preserves current identity and dirty presentation'); await recovery(current);
    await button('Guardar como', NAV); await waitFor('actual complete-context Save As', async () => { try { return ipc.filter(x => x.channel === 'document:save' && x.completed).length === 2 && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(current); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } });
    await savedReady(current,'Configured Save As');
    before = await observe(); await control('Configuración raíz', 'both-compact'); row = await response(before.serial, 'build-configured-assembly'); current = row.current.document; geometry(row.response.value, current, true, 'shared-again'); await recovery(current);
    await button('Guardar', NAV); await waitFor('ordinary actual Save', async () => ipc.filter(x => x.channel === 'document:save' && x.completed).length === 3 && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(current));
    const saved = await fs.readFile(output), last = ipc.filter(x => x.channel === 'document:save' && x.completed).at(-1); check(last.documentWrite.hasPath && last.documentWrite.filePath === output && last.documentWrite.sha256 === digest(saved) && dialogCounts().saves === 2, 'Ordinary Save uses exact granted path and bytes');
    await savedReady(current,'Configured normal Save');
    before = await observe(); await button('Abrir', NAV); row = await response(before.serial, 'build-configured-assembly'); check(canonical(row.current.document) === canonical(current), 'Actual saved full-context reopening'); geometry(row.response.value, current, true, 'reopened'); captureOracle(current, row.response.value); await recovery(current);
    before = await observe(); await button('Resolver configuración', NAV); row = await response(before.serial, 'preview-configured-assembly'); check(canonical(row.response.value.document) === canonical(current), 'Reopened native solve preserves exact saved captures'); verified(row.response.value, current); geometry(row.response.value.scene, current, true, 'fresh-reopened-solve');
    before = await observe(); await button('Cancelar', NAV); await response(before.serial, 'discard-configured-assembly'); row = await response(before.serial, 'build-configured-assembly'); geometry(row.response.value, current, true, 'final-cancel'); await recovery(current);
    check((await fs.readFile(input)).equals(originalBytes) && (await fs.readFile(output)).equals(saved), 'Native checks preserve original and saved files');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 2 && !consoleErrors.length && !failedRequests.length, 'Exact isolated dialogs and no renderer/resource errors');
    await capture(current); console.log(JSON.stringify({ test: 'production-renderer-configured-mechanical-measurements', family, phases, sourceSha256: digest(originalBytes), savedSha256: digest(saved) }));
  };
};
