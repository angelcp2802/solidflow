'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function referenceRepairWorkflow(context) {
  const { expected, input, output, referenceRepairStepPath, evaluate, observe, waitFor, pointer, wheel, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const records = [], interactions = [];
  const evidence = { partReferenceRepair: { records, interactions,
    scope: 'Original explicit body, real face-supported drawing/boss, earlier scalar edit, observed lost support after sign change, explicit current-face repair with Cancel/retry, suppression/reactivation, cascade deletion/history and Save/Open/STEP',
    inputLimits: 'Actual CDP pointer strokes and contained control presses; visible form setters after real input focus. No React state, native reference, geometric source or worker response injection.',
    limits: 'One original rectangular explicit body and its actual v1 cap reference; scalar-depth continuity and signed-branch loss only. V2 semantic naming belongs to another legacy eligible-output route and is not claimed here. Suppression omits the supported sketch and explicitly diagnoses the unavailable input of its body-aware boss; it is not presented as a healthy complete rebuild. Planar preview mesh area is separate from the final native STEP BRep evidence.',
    tolerances: { volumeMm3: 1e-5, previewPlanarMeshAreaMm2: 1e-4, boundsMm: 1e-6 } } };
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
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible support-recovery control required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector, label ?? null);
  }
  async function inspect(selector, label) {
    return page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1) return { count: matches.length, available: false };
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
    const target = await waitFor('stationary support-recovery control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Support-recovery control remains contained and hit-tested before pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after DOM reveal' });
  }
  async function change(selector, value, retained = true) {
    value = String(value); await reveal(selector);
    if (await page(selector => document.querySelector(selector) instanceof HTMLInputElement, selector)) await press(selector);
    await waitFor('one enabled visible support-recovery field ' + selector, async () => (await inspect(selector)).available);
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
        || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || !hit || !(field === hit || field.contains(hit))) throw Error('One revealed current enabled support-recovery field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Current enabled support-recovery option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    if (await page(selector => document.querySelector(selector) instanceof HTMLInputElement, selector)) await press('.operation-name-section h3');
    interactions.push({ selector, value, input: 'Visible field native setter/input or change event after reveal and hit test' });
    if (retained) await waitFor('support field retains authored value', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function ready() {
    await waitFor('current support-recovery preview is acceptable', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  const specs = {
    base4: { volume: 240, area: 248, lo: 0, hi: 4, producer: 'base' },
    boss4: { volume: 248, area: 264, lo: 0, hi: 6, producer: 'boss' },
    boss6: { volume: 368, area: 328, lo: 0, hi: 8, producer: 'boss' },
    base6: { volume: 360, area: 312, lo: 0, hi: 6, producer: 'base' },
    lost: { volume: 360, area: 312, lo: -6, hi: 0, producer: 'base', error: true },
    repaired: { volume: 368, area: 328, lo: -8, hi: 0, producer: 'boss' },
    prefixNegative: { volume: 360, area: 312, lo: -6, hi: 0, producer: 'base' },
    suppressed: { volume: 0, empty: true, suppressed: true },
    empty: { volume: 0, empty: true },
  };
  let sketch, boss, originalFace, replacementFace;
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function response(after, features, phase) {
    return waitFor('fresh native support response ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No support-recovery worker transport failure');
      return state.builds.filter(row => row.serial > after && canonical(row.features) === canonical(features) && row.response).at(-1);
    });
  }
  function geometry(row, kind, phase) {
    check(row.response.ok, row.response.error || 'Support native reconstruction completes');
    const result = row.response.value, wanted = specs[kind];
    if (wanted.error) check(result.featureErrors.length === 1 && result.featureErrors[0].id === sketch.id
      && /cara de soporte.*no se puede identificar.*Recupera la selección/i.test(result.featureErrors[0].message), 'Lost original face is explicitly diagnosed on its exact supported sketch');
    else if (wanted.suppressed) check(result.featureErrors.length === 1 && result.featureErrors[0].id === boss.id
      && /croquis.*suprimido.*soporte no está disponible/i.test(result.featureErrors[0].message), 'Explicit-body descendant exposes its unavailable-source diagnostic while the original sketch is omitted');
    else check(result.featureErrors.length === 0, 'No reconstruction error for ' + phase);
    if (wanted.empty) check(result.volume === 0 && !result.bodies?.length && result.meshTriangleCount === 0, 'Unavailable/deleted source leaves no solid or ghost mesh');
    else {
      check(result.bodyCatalogActive && result.bodies?.length === 1, 'Exactly one current explicit native body');
      const body = result.bodies[0], producer = wanted.producer === 'base' ? 'reference-base' : boss.id;
      check(body.ref.bodyId === 'reference-body' && body.ref.sourceFeatureId === producer && body.createdByFeatureId === 'reference-base', 'Current body identity, original creator and exact surviving producer');
      near(body.volume, wanted.volume, 1e-5, 'Independent support volume'); near(body.meshAreaMm2, wanted.area, 1e-4, 'Independent planar mesh area');
      for (const [side, values] of [['min', [-5, -3, wanted.lo]], ['max', [5, 3, wanted.hi]]]) values.forEach((value, axis) => near(body.bounds[side][axis], value, 1e-6, 'Literal support bounds'));
      check(result.meshTriangleCount > 0, 'Actual displayed native solid mesh exists');
    }
    records.push({ phase, serial: row.serial, features: row.features, featuresSha256: digest(canonical(row.features)), volume: result.volume,
      bodies: (result.bodies ?? []).map(b => ({ ref: b.ref, createdByFeatureId: b.createdByFeatureId, volume: b.volume, meshAreaMm2: b.meshAreaMm2, bounds: b.bounds })),
      errors: result.featureErrors, warnings: result.warnings });
    return row;
  }
  const built = async (after, features, kind, phase) => geometry(await response(after, features, phase), kind, phase);
  async function committed(features, phase) {
    return waitFor('committed support state ' + phase, () => page(features => {
      const raw = localStorage.getItem('solidflow.autosave');
      if (!raw || document.querySelector('.property-manager') || document.querySelector('.build-indicator')) return false;
      const doc = JSON.parse(raw);
      if (JSON.stringify(doc.features) !== JSON.stringify(features)) return false;
      return { raw, history: ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => ({ title, disabled: document.querySelector('button[title="' + title + '"]')?.disabled })),
        title: document.querySelector('.document-title')?.textContent };
    }, features));
  }
  async function accept(preview, features, kind, phase) {
    await ready(); const before = (await observe()).serial; await press(APPLY);
    const accepted = await built(before, features ?? preview.features, kind, phase); await committed(accepted.features, phase); return accepted;
  }
  async function edit(id, nestedOwner) {
    if (nestedOwner && await page(id => document.querySelector('button[data-part-tree-toggle="' + id + '"]')?.getAttribute('aria-expanded') === 'false', nestedOwner))
      await press('button[data-part-tree-toggle="' + nestedOwner + '"]');
    await press('.tree-row[data-feature-id="' + id + '"]' + (nestedOwner ? '[data-parent-feature-id="' + nestedOwner + '"]' : ':not([data-parent-feature-id])'));
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('current saved editor ' + id, () => page(() => !!document.querySelector('.property-manager')));
  }
  async function view(name) {
    await change('select[aria-label="Orientación de vista"]', name, false); await press('button[title="Ajustar a pantalla (F)"]'); await frames();
  }
  async function canvas(button = 1) {
    const target = await page(() => {
      const rows = document.querySelectorAll('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])');
      if (rows.length !== 1) throw Error('One real support-selection canvas required'); const e = rows[0], r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      return { point, rect: [r.x, r.y, r.width, r.height], hit: document.elementFromPoint(point.x, point.y) === e };
    });
    check(target.hit, 'Symmetric original XY origin hits the actual Front/Back fitted canvas centre');
    await pointer('mouseMoved', target.point);
    check(await page(target => { const e = document.querySelector('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"])'), r = e?.getBoundingClientRect();
      return !!r && JSON.stringify([r.x, r.y, r.width, r.height]) === JSON.stringify(target.rect) && document.elementFromPoint(target.point.x, target.point.y) === e;
    }, target), 'Original source target remains current and hit-tested before canvas press');
    await pointer('mousePressed', target.point, button); await pointer('mouseReleased', target.point, button === 2 ? 2 : 0);
    interactions.push({ canvas: true, button, target, calibration: 'Public Front/Back, Fit and literal symmetric original bounds' });
  }
  function cap(row, sign, z) {
    const matches = row.response.value.bodies[0].faces.filter(face => face.frame && face.ref.sourceFeatureId === 'reference-base'
      && Math.abs(face.frame.origin[2] - z) < 1e-6 && Math.abs(face.frame.normal[2] - sign) < 1e-8);
    check(matches.length === 1 && /^face-v1\|[a-f0-9]{64}$/.test(matches[0].ref.key), 'One actual current explicit-body v1 cap at the literal signed endpoint');
    const face = matches[0]; [0, 0, z].forEach((v, i) => near(face.frame.origin[i], v, 1e-6, 'Independent current cap origin'));
    [0, 0, sign].forEach((v, i) => near(face.frame.normal[i], v, 1e-8, 'Independent current cap normal'));
    evidence.partReferenceRepair.capWitnesses ??= []; evidence.partReferenceRepair.capWitnesses.push({ sign, z, ref: face.ref, frame: face.frame });
    return face.ref;
  }
  async function drawSupported(original) {
    originalFace = cap(original, 1, 4);
    await view('front'); await press('button[title="Seleccionar caras"]'); await canvas(2);
    await waitFor('actual current face context', () => page(() => !!document.querySelector('.part-feature-context-menu [data-part-context-action="new-sketch"]:not(:disabled)')));
    check(await page(ref => document.querySelector('.viewport-canvas')?.dataset.partSelectedFace === JSON.stringify(ref), originalFace), 'Real context selection equals the independent native original top-face witness');
    await press('[data-part-context-action="new-sketch"]'); await press('.ribbon-tabs button', 'Croquis'); await press('button.command[title="Rectángulo"]');
    const calibration = () => page(() => {
      const svg = document.querySelector('svg[aria-label="Editor de croquis multientidad"]'), origin = svg?.querySelector('[aria-label="Origen fijo (0, 0)"] circle'), pattern = svg?.querySelector('pattern'), matrix = svg?.getScreenCTM();
      if (!svg || !origin || !pattern || !matrix) return false;
      const scale = Number(pattern.getAttribute('width')) / 10, ox = Number(origin.getAttribute('cx')), oy = Number(origin.getAttribute('cy'));
      return { scale, points: [[-1, -1], [1, 1]].map(([x, y]) => { const p = svg.createSVGPoint(); p.x = ox + x * scale; p.y = oy - y * scale; const q = p.matrixTransform(matrix); return { x: q.x, y: q.y }; }) };
    });
    let calibrated = await waitFor('current visible original support sketch calibration', calibration);
    for (let step = 0; calibrated.scale < 20 && step < 12; step++) {
      const before = calibrated.scale, at = { x: (calibrated.points[0].x + calibrated.points[1].x) / 2, y: (calibrated.points[0].y + calibrated.points[1].y) / 2 };
      await wheel(at, -240); await waitFor('real support sketch zoom', async () => (await calibration()).scale > before); calibrated = await calibration();
    }
    check(calibrated.scale >= 20, 'Two-millimetre original square avoids unintended origin snapping');
    let before = (await observe()).serial;
    await pointer('mouseMoved', calibrated.points[0]); await pointer('mousePressed', calibrated.points[0], 1);
    await pointer('mouseMoved', calibrated.points[1], 1); await pointer('mouseReleased', calibrated.points[1], 0);
    const row = await waitFor('native actually drawn supported square', async () => (await observe()).builds.filter(r => r.serial > before && r.response?.ok
      && r.features.length === 3 && r.features.at(-1).type === 'sketch' && r.features.at(-1).profile.kind === 'entities' && r.features.at(-1).profile.entities.length === 4).at(-1));
    sketch = row.features.at(-1); const p = sketch.profile;
    check(sketch.support?.kind === 'face' && canonical(sketch.support.face) === canonical(originalFace) && sketch.offset === 0, 'Actual new sketch stores exact selected source support without offset replacement');
    check(p.points.length === 4 && p.entities.every(e => e.type === 'line'), 'Actual drawing has four material lines and four shared points');
    for (const [x, y] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) check(p.points.filter(p => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9).length === 1, 'Actual square equals literal independent local coordinates');
    geometry(row, 'base4', 'drawn-supported-square');
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Saliente/Base extruido"]'); before = (await observe()).serial; await change('input[aria-label="Profundidad"]', 2);
    const preview = await waitFor('actual supported boss preview', async () => (await observe()).builds.filter(r => r.serial > before && r.response?.ok && r.features.length === 4
      && r.features.at(-1).type === 'extrude' && r.features.at(-1).sketchId === sketch.id && r.features.at(-1).depth === 2).at(-1));
    boss = preview.features.at(-1); check(canonical(boss.bodyOperation) === canonical({ mode: 'merge', target: { bodyId: 'reference-body', sourceFeatureId: 'reference-base' } }), 'New boss targets the sole current source body normally');
    geometry(preview, 'boss4', 'supported-boss-preview'); return accept(preview, null, 'boss4', 'supported-boss-created');
  }
  async function depth(current, value, prefixKind, kind, phase) {
    await edit('reference-base'); const beforeRecovery = await recovery(); let before = (await observe()).serial;
    await change('input[aria-label="Profundidad"]', value);
    const features = current.features.map(f => f.id === 'reference-base' ? { ...f, depth: value } : f);
    const prefix = features.slice(0, 2), preview = await built(before, prefix, prefixKind, phase + '-preview');
    check(await recovery() === beforeRecovery, 'Earlier-feature preview preserves complete committed recovery');
    return accept(preview, features, kind, phase + '-applied');
  }
  async function repair(lost, retry) {
    const baseline = await committed(lost.features, retry ? 'repair-retry-baseline' : 'repair-baseline');
    await edit(sketch.id, boss.id);
    await waitFor('failed support editor requires explicit repair', () => page(selector => document.querySelector(selector)?.disabled
      && document.querySelector('select[aria-label="Soporte del plano"]')?.value === 'face' && !!document.querySelector('.error-banner[role="alert"]'), APPLY));
    await press('.plane-support button.outline-button', 'Cambiar cara de soporte'); await view('back');
    const before = (await observe()).serial; await canvas();
    const wantedSketch = { ...sketch, support: { kind: 'face', face: replacementFace } }, features = [...lost.features.slice(0, 2), wantedSketch];
    const preview = await built(before, features, 'prefixNegative', retry ? 'repair-retry-preview' : 'repair-preview');
    await ready(); check(await recovery() === baseline.raw, 'Fresh picked repair remains uncommitted until acceptance');
    if (!retry) {
      const beforeCancel = (await observe()).serial; await press(CANCEL); const restored = await built(beforeCancel, lost.features, 'lost', 'repair-cancel');
      check(canonical(await committed(restored.features, 'repair-cancel')) === canonical(baseline), 'Repair Cancel restores exact failed document, original reference, history and title'); return restored;
    }
    const complete = lost.features.map(f => f.id === sketch.id ? wantedSketch : f), accepted = await accept(preview, complete, 'repaired', 'repair-applied');
    check(canonical(accepted.features.at(-1)) === canonical(boss) && accepted.features[2].id === sketch.id, 'Explicit repair preserves sketch/boss identities and all downstream declarations');
    return accepted;
  }
  async function history(wanted, kind, redo, phase) {
    const before = (await observe()).serial; await press('button[title="' + (redo ? 'Rehacer (Ctrl+Y)' : 'Deshacer (Ctrl+Z)') + '"]');
    const restored = await built(before, wanted.features, kind, phase); await committed(restored.features, phase); return restored;
  }
  return async () => {
    await waitFor('part support startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const inputBytes = await fsp.readFile(input); let before = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(before, expected.features, 'base4', 'original'); await committed(original.features, 'original');
    const created = await drawSupported(original), deeper = await depth(created, 6, 'base6', 'boss6', 'earlier-scalar-depth');
    check(canonical(deeper.features.slice(2)) === canonical(created.features.slice(2)), 'Compatible earlier edit preserves exact saved support and complete downstream declarations');
    await history(created, 'boss4', false, 'undo-earlier-scalar'); await history(deeper, 'boss6', true, 'redo-earlier-scalar');
    const lost = await depth(deeper, -6, 'prefixNegative', 'lost', 'earlier-signed-depth'); replacementFace = cap(lost, -1, -6);
    check(canonical(replacementFace) !== canonical(originalFace), 'Observed signed branch has a genuinely different exact end-face reference');
    await press('[data-assembly-menu="file"]');
    check(await page(() => !!document.querySelector('.error-banner[role="alert"]') && [...document.querySelectorAll('.part-main-menus [role="menuitem"]')]
      .filter(e => e.textContent.trim() === 'Exportar STEP').length === 1 && [...document.querySelectorAll('.part-main-menus [role="menuitem"]')]
      .find(e => e.textContent.trim() === 'Exportar STEP')?.disabled === true), 'Lost support has visible diagnosis and withholds the ordinary STEP export command');
    await press('[data-assembly-menu="file"]');
    await repair(lost, false); const repaired = await repair(lost, true);
    await history(lost, 'lost', false, 'undo-explicit-repair'); await history(repaired, 'repaired', true, 'redo-explicit-repair');
    await press('.tree-row[data-feature-id="reference-base"]:not([data-parent-feature-id])'); before = (await observe()).serial; await press('button[title="Suprimir operación"]');
    const suppressedFeatures = repaired.features.map(f => f.id === 'reference-base' ? { ...f, suppressed: true } : f);
    const suppressed = await built(before, suppressedFeatures, 'suppressed', 'source-suppressed'); await committed(suppressedFeatures, 'source-suppressed');
    check(suppressed.response.value.warnings.some(w => /soporte.*suprimido|soporte.*no.*disponible/i.test(w)), 'Suppressed support exposes omission guidance without ghost material');
    check(canonical(suppressedFeatures.slice(2)) === canonical(repaired.features.slice(2)), 'Source suppression never rewrites descendant flags or references');
    await history(repaired, 'repaired', false, 'undo-source-suppression'); await history(suppressed, 'suppressed', true, 'redo-source-suppression');
    await press('.tree-row[data-feature-id="reference-base"]:not([data-parent-feature-id])'); before = (await observe()).serial; await press('button[title="Activar operación"]');
    const restored = await built(before, repaired.features, 'repaired', 'source-reactivated'); await committed(restored.features, 'source-reactivated');
    await press('.tree-row[data-feature-id="reference-base"]:not([data-parent-feature-id])'); before = (await observe()).serial; await press('button[title="Eliminar operación"]');
    const deleted = await built(before, expected.features.slice(0, 1), 'empty', 'source-deleted-cascade'); await committed(deleted.features, 'source-deleted-cascade');
    check(deleted.features.length === 1 && deleted.features[0].id === 'reference-profile', 'Deleting the source removes only its exact dependency closure and preserves the upstream profile');
    await history(restored, 'repaired', false, 'undo-source-deletion'); await history(deleted, 'empty', true, 'redo-source-deletion');
    const current = await history(restored, 'repaired', false, 'restore-before-save');
    await file('Guardar como…'); await waitFor('saved exact repaired features', async () => { try { return ipc.some(e => e.channel === 'document:save' && e.completed)
      && canonical(JSON.parse(await fsp.readFile(output, 'utf8')).features) === canonical(current.features) && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } });
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes); before = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await built(before, saved.features, 'repaired', 'saved-reopened'); const reopened = await committed(saved.features, 'saved-reopened');
    check(canonical(JSON.parse(reopened.raw)) === canonical(saved), 'Fresh Open retains the exact complete repaired document');
    await file('Exportar STEP'); await waitFor('owned original support STEP export', () => ipc.some(e => e.channel === 'document:export' && e.completed));
    const stepBytes = await fsp.readFile(referenceRepairStepPath); evidence.partReferenceRepair.step = await require('./desktop-part-reference-repair-step.cjs')(stepBytes, check);
    check((await fsp.readFile(input)).equals(inputBytes) && (await fsp.readFile(output)).equals(savedBytes), 'Original and saved document files remain byte-equivalent after native reopening and STEP');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1, 'Two owned Opens, one Save As and one fixed STEP dialog');
    check(!consoleErrors.length && !failedRequests.length && ipc.every(e => e.completed), 'No renderer/resource errors or unfinished file IPC');
    check(protocolResponses.some(x => /kernel\.worker-[\w-]+\.js$/.test(x.url) && x.status === 200) && protocolResponses.some(x => x.url.endsWith('.wasm') && x.status === 200), 'Actual production worker and WASM loaded');
    evidence.partReferenceRepair.persistence = { inputSha256: digest(inputBytes), savedSha256: digest(savedBytes), stepSha256: digest(stepBytes), dialogs: dialogCounts() };
  };
};
