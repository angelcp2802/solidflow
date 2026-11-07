'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// All operations are authored through the production renderer. Native observations
// are read-only witnesses; no React state, body ID, reference or reply is injected.
module.exports = function sweepLoftWorkflow(context) {
  const { expected, input, output, sweepLoftStepPath, evaluate, observe, waitFor, pointer,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const PROFILE = 'select[aria-label="Perfil del barrido"]';
  const SECTION = 'select[aria-label="Croquis de sección 2"]';
  const records = [], interactions = [];
  const evidence = { partSweepLoft: { records, interactions,
    scope: 'Original sketches -> normal sweep/loft creation, recoverable invalid input, Cancel, existing-operation editing, four Undo/Redo pairs, native Save/reopen and final STEP',
    inputLimits: 'Actual CDP pointer press/release on visible hit-tested controls. Select fields use native setters and change events after legitimate DOM reveal; not physical keyboard typing. No reference or worker response injection.',
    featureLimits: 'One straight circular sweep, two coaxial circular loft sections, separate new bodies, profile/section reassignment and ruled final loft. No curved sweep, seam correspondence, multi-section loft, merge or cross-platform support claim.',
    tolerances: { previewVolumeMm3: 1e-5, previewBoundsMm: 1e-6 } } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  async function reveal(selector, label) {
    await page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible sweep/loft control required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector, label ?? null);
  }
  async function inspect(selector, label) {
    return page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1) return { available: false, count: matches.length };
      const element = matches[0], r = element.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left + parent.clientLeft); right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top + parent.clientTop); bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
        }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        available: !element.matches(':disabled') && !element.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom
          && !!hit && (hit === element || element.contains(hit)) };
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label);
    let previous, since = 0;
    const target = await waitFor('stationary sweep/loft control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), key = canonical(state);
      if (key !== previous) { previous = key; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Sweep/loft target remains contained and hit-tested before pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after DOM reveal' });
  }
  async function change(selector, value) {
    await reveal(selector);
    await waitFor('one visible sweep/loft select ' + selector, async () => (await inspect(selector)).available);
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLSelectElement) || field.disabled || field.closest('[hidden]')
        || !r || r.width <= 0 || r.height <= 0 || !hit || !(field === hit || field.contains(hit))
        || ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('One enabled visible current sweep/loft option required');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Visible select native setter/change event after DOM reveal and hit test' });
    await waitFor('sweep/loft select retains authored value', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  const tab = () => press('.ribbon-tabs button', 'Operaciones');
  async function ready() {
    await waitFor('current sweep/loft native preview may be accepted', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  async function committed(features, phase) {
    const snapshot = await waitFor('committed sweep/loft recovery ' + phase, async () => {
      const current = await page(() => {
        const value = localStorage.getItem('solidflow.autosave');
        if (!value || document.querySelector('.property-manager') || !document.querySelector('.statusbar')?.textContent.includes('Listo')) return false;
        const history = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
          const matches = [...document.querySelectorAll('button')].filter(element => element.title === title);
          if (matches.length !== 1) throw Error('One current part history command required');
          return { title, disabled: matches[0].disabled };
        });
        return { recovery: value, history, title: document.querySelector('.document-title')?.textContent };
      });
      return current && canonical(JSON.parse(current.recovery).features) === canonical(features) ? current : false;
    });
    records.push({ phase: phase + '-committed', recoverySha256: digest(snapshot.recovery), history: snapshot.history });
    return snapshot;
  }
  const sourceCount = expected.features.length;
  function sourceUnchanged(features) {
    return canonical(features.slice(0, sourceCount)) === canonical(expected.features);
  }
  function geometry(record, radii, phase) {
    check(record.response.ok, record.response.error || 'Native sweep/loft build failed');
    const result = record.response.value, count = Number(!!radii.sweep) + Number(!!radii.loft);
    check(sourceUnchanged(record.features), 'Every preview preserves all original sketch declarations');
    // A sketch-only result has no native body catalogue, so its optional bodies
    // field is absent. Require the actual catalogue once a solid exists.
    check(result.featureErrors.length === 0 && (count ? Array.isArray(result.bodies) && result.bodies.length === count : !result.bodies?.length)
      && canonical(result.warnings) === canonical(count === 2 ? ['La pieza contiene 2 sólidos separados.'] : []),
    'Exact healthy separate-body count and warning for ' + phase);
    if (count) check(result.bodyCatalogActive, 'Sweep/loft normal commands use the explicit body catalogue');
    else check(result.bodyCatalogActive === false && result.volume === 0 && result.meshTriangleCount === 0,
      'Sketch-only native state has no body catalogue, solid volume or solid mesh');
    for (const [type, radius] of Object.entries(radii)) {
      if (!radius) continue;
      const feature = record.features.find(item => item.type === type);
      check(feature?.bodyOperation?.mode === 'new' && feature.merge === false, 'Authored ' + type + ' creates a separate exact body');
      const bodies = result.bodies.filter(body => body.ref.bodyId === feature.bodyOperation.bodyId);
      check(bodies.length === 1 && bodies[0].ref.sourceFeatureId === feature.id && bodies[0].createdByFeatureId === feature.id,
        'Current producer, creator and body identity agree for ' + type);
      const body = bodies[0], bounds = type === 'sweep'
        ? { min: [-radius, -radius, 0], max: [radius, radius, 20] }
        : { min: [20 - radius, -radius, 0], max: [20 + radius, radius, 12] };
      const volume = type === 'sweep' ? 20 * radius * radius * Math.PI : 4 * Math.PI * (4 + 2 * radius + radius * radius);
      near(body.volume, volume, 1e-5, 'Independent ' + type + ' volume for ' + phase);
      for (const side of ['min', 'max']) bounds[side].forEach((value, axis) => near(body.bounds[side][axis], value, 1e-6,
        'Literal ' + type + ' bounds for ' + phase));
    }
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: result.bodies ?? null,
      bodyCatalogActive: result.bodyCatalogActive, aggregateVolume: result.volume, meshTriangleCount: result.meshTriangleCount });
    return record;
  }
  async function response(afterSerial, predicate, phase) {
    return waitFor('native sweep/loft response ' + phase, async () => {
      const state = await observe(); check(state.workerErrors.length === 0, 'No native sweep/loft worker errors');
      return state.builds.filter(record => record.serial > afterSerial && predicate(record.features) && record.response).at(-1);
    });
  }
  async function built(afterSerial, predicate, radii, phase) {
    return geometry(await response(afterSerial, predicate, phase), radii, phase);
  }
  async function invalid(afterSerial, predicate, baseline, phase) {
    const record = await response(afterSerial, predicate, phase);
    check(sourceUnchanged(record.features) && record.response.ok
      && record.response.value.featureErrors.some(error => error.id === record.features.at(-1).id),
    'Actual native current operation rejects the open profile/section for ' + phase);
    const state = await waitFor('recoverable visible sweep/loft error ' + phase, () => page(selector => {
      const button = document.querySelector(selector), alert = document.querySelector('.error-banner[role="alert"]');
      return button?.disabled && alert?.textContent.trim() ? { message: alert.textContent.trim() } : false;
    }, APPLY));
    check(await recovery() === baseline.recovery, 'Invalid preview cannot commit or replace recovery');
    records.push({ phase, serial: record.serial, featureErrors: record.response.value.featureErrors, visibleError: state.message });
  }
  async function cancel(baselineRecord, baselineSnapshot, radii, phase) {
    const serial = (await observe()).serial; await press(CANCEL);
    const restored = await built(serial, features => canonical(features) === canonical(baselineRecord.features), radii, phase);
    const snapshot = await committed(restored.features, phase);
    check(canonical(snapshot) === canonical(baselineSnapshot), 'Cancel restores exact recovery, history availability and title for ' + phase);
  }
  async function accept(preview, radii, phase) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const record = await built(serial, features => canonical(features) === canonical(preview.features), radii, phase);
    return { record, snapshot: await committed(record.features, phase) };
  }
  async function edit(feature, selector) {
    await press('.tree-row[data-feature-id="' + feature.id + '"]:not([data-parent-feature-id])');
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('existing sweep/loft editor has exact input', () => page((selector, value) => document.querySelector(selector)?.value === value,
      selector, feature.type === 'sweep' ? feature.profileSketchId : feature.sections[1].sketchId));
  }
  async function newSweep(phase) {
    await press('.tree-row[data-feature-id="sweep-profile-r2"]:not([data-parent-feature-id])'); await tab();
    const serial = (await observe()).serial; await press('button.command[title="Barrido"]');
    const record = await built(serial, features => features.length === sourceCount + 1 && features.at(-1).type === 'sweep'
      && features.at(-1).profileSketchId === 'sweep-profile-r2' && features.at(-1).pathSketchId === 'sweep-path', { sweep: 2 }, phase);
    check(canonical(record.features.at(-1).path) === canonical([{ entityId: 'path-line', reversed: false }]), 'Actual command resolves the original LINE in its declared direction');
    await ready(); return record;
  }
  async function newLoft(phase) {
    await press('.tree-row[data-feature-id="loft-base-r2"]:not([data-parent-feature-id])'); await tab();
    const serial = (await observe()).serial; await press('button.command[title="Recubrir"]');
    const record = await built(serial, features => features.length === sourceCount + 2 && features.at(-1).type === 'loft'
      && canonical(features.at(-1).sections.map(section => section.sketchId)) === canonical(['loft-base-r2', 'loft-top-r4']),
    { sweep: 3, loft: 4 }, phase);
    await ready(); return record;
  }
  return async () => {
    await waitFor('sweep/loft production file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, features => canonical(features) === canonical(expected.features), {}, 'original-sketches');
    const originalSnapshot = await committed(original.features, 'original-sketches');
    await newSweep('new-sweep-r2-preview');
    serial = (await observe()).serial; await change(PROFILE, 'sweep-path');
    await invalid(serial, features => features.at(-1).type === 'sweep' && features.at(-1).profileSketchId === 'sweep-path', originalSnapshot, 'new-sweep-open-profile-error');
    serial = (await observe()).serial; await change(PROFILE, 'sweep-profile-r3');
    await built(serial, features => features.at(-1).profileSketchId === 'sweep-profile-r3', { sweep: 3 }, 'new-sweep-error-recovered'); await ready();
    await cancel(original, originalSnapshot, {}, 'new-sweep-cancel');
    const sweepCreated = await accept(await newSweep('new-sweep-r2-retry'), { sweep: 2 }, 'sweep-r2-accepted');
    const sweep = sweepCreated.record.features.at(-1);
    await edit(sweep, PROFILE); serial = (await observe()).serial; await change(PROFILE, 'sweep-profile-r3');
    const sweepEditedPreview = await built(serial, features => features.at(-1).id === sweep.id && features.at(-1).profileSketchId === 'sweep-profile-r3',
      { sweep: 3 }, 'existing-sweep-r3-preview');
    check(sweepEditedPreview.features.at(-1).bodyOperation.bodyId === sweep.bodyOperation.bodyId, 'Existing sweep edit preserves its actual body identity');
    check(await recovery() === sweepCreated.snapshot.recovery, 'Existing sweep preview does not commit');
    const sweepEdited = await accept(sweepEditedPreview, { sweep: 3 }, 'existing-sweep-r3-accepted');
    await newLoft('new-loft-r4-preview');
    serial = (await observe()).serial; await change(SECTION, 'sweep-path');
    await invalid(serial, features => features.at(-1).type === 'loft' && features.at(-1).sections[1].sketchId === 'sweep-path',
      sweepEdited.snapshot, 'new-loft-open-section-error');
    serial = (await observe()).serial; await change(SECTION, 'loft-top-r4');
    await built(serial, features => features.at(-1).type === 'loft' && features.at(-1).sections[1].sketchId === 'loft-top-r4',
      { sweep: 3, loft: 4 }, 'new-loft-error-recovered'); await ready();
    await cancel(sweepEdited.record, sweepEdited.snapshot, { sweep: 3 }, 'new-loft-cancel');
    const loftCreated = await accept(await newLoft('new-loft-r4-retry'), { sweep: 3, loft: 4 }, 'loft-r4-accepted');
    const loft = loftCreated.record.features.at(-1);
    check(loft.bodyOperation.bodyId !== sweep.bodyOperation.bodyId, 'Separate sweep/loft creations receive different actual body IDs');
    await edit(loft, SECTION); serial = (await observe()).serial; await change(SECTION, 'loft-top-r5');
    await built(serial, features => features.at(-1).id === loft.id && features.at(-1).sections[1].sketchId === 'loft-top-r5',
      { sweep: 3, loft: 5 }, 'existing-loft-r5-cancel-preview'); await ready();
    await cancel(loftCreated.record, loftCreated.snapshot, { sweep: 3, loft: 4 }, 'existing-loft-cancel');
    await edit(loft, SECTION); serial = (await observe()).serial; await change(SECTION, 'loft-top-r5');
    await built(serial, features => features.at(-1).id === loft.id && features.at(-1).sections[1].sketchId === 'loft-top-r5',
      { sweep: 3, loft: 5 }, 'existing-loft-r5-retry'); await ready();
    serial = (await observe()).serial; await press('.property-manager label.check-option', 'Unión recta entre secciones');
    const finalPreview = await built(serial, features => features.at(-1).id === loft.id && features.at(-1).ruled === true
      && features.at(-1).sections[1].sketchId === 'loft-top-r5', { sweep: 3, loft: 5 }, 'existing-loft-ruled-preview');
    check(finalPreview.features.at(-1).bodyOperation.bodyId === loft.bodyOperation.bodyId, 'Existing loft edit preserves its actual body identity');
    check(canonical(finalPreview.response.value.bodies.find(body => body.ref.bodyId === sweep.bodyOperation.bodyId))
      === canonical(sweepEdited.record.response.value.bodies[0]), 'Loft creation/editing leaves exact observed sweep body unchanged');
    const final = await accept(finalPreview, { sweep: 3, loft: 5 }, 'existing-loft-r5-accepted');
    const stages = [
      { record: original, snapshot: originalSnapshot, radii: {} },
      { ...sweepCreated, radii: { sweep: 2 } }, { ...sweepEdited, radii: { sweep: 3 } },
      { ...loftCreated, radii: { sweep: 3, loft: 4 } }, { ...final, radii: { sweep: 3, loft: 5 } },
    ];
    for (const [direction, indices] of [['undo', [3, 2, 1, 0]], ['redo', [1, 2, 3, 4]]]) {
      for (const index of indices) {
        const stage = stages[index], phase = direction + '-transaction-' + index;
        serial = (await observe()).serial; await press('button[title="' + (direction === 'undo' ? 'Deshacer (Ctrl+Z)' : 'Rehacer (Ctrl+Y)') + '"]');
        const record = await built(serial, features => canonical(features) === canonical(stage.record.features), stage.radii, phase);
        const snapshot = await committed(record.features, phase);
        check(snapshot.recovery === stage.snapshot.recovery, 'One history action restores the exact stored transaction document');
      }
    }
    await file('Guardar como…');
    await waitFor('actual sweep/loft Save As completes and title is clean', async () => dialogCounts().saves === 1
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.record.features), 'Actual saved bytes contain both authored operations, IDs and exact inputs');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, features => canonical(features) === canonical(saved.features), { sweep: 3, loft: 5 }, 'saved-reopened');
    const reopenedSnapshot = await committed(reopened.features, 'saved-reopened');
    check(canonical(reopened.response.value.bodies) === canonical(final.record.response.value.bodies), 'Reopened native bodies retain exact identities and observed geometry');
    check(canonical(JSON.parse(reopenedSnapshot.recovery)) === canonical(saved), 'Reopened recovery equals actual native saved document');
    await file('Exportar STEP');
    await waitFor('actual sweep/loft STEP export completes', () => dialogCounts().geometryExports === 1
      && ipc.filter(event => event.channel === 'document:export' && event.completed).length === 1);
    const step = await fsp.readFile(sweepLoftStepPath);
    evidence.partSweepLoft.nativeStep = await require('./desktop-part-sweep-loft-step.cjs')(step, check);
    evidence.partSweepLoft.stepSha256 = digest(step);
    evidence.partSweepLoft.originalSha256 = digest(await fsp.readFile(input)); evidence.savedSha256 = digest(bytes);
    check(await recovery() === reopenedSnapshot.recovery && (await fsp.readFile(output)).equals(bytes), 'STEP export preserves exact reopened recovery and saved bytes');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1,
      'Exactly original Open, Save As, saved Open and one STEP export');
    check(ipc.filter(event => event.channel === 'document:open' && event.completed).length === 2,
      'Both Open commands use the real production file bridge');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Actual production worker and WASM assets loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer, asset or worker transport errors');
  };
};
