'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function sketchPrimitivesWorkflow(context) {
  const { files, evaluate, observe, waitFor, pointer, wheel, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const SVG = 'svg[aria-label="Editor de croquis multientidad"]';
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const records = [], interactions = [], exports = [];
  const evidence = { sketchPrimitives: { records, interactions, exports,
    scope: 'Three empty documents: actual rectangle, circle and centre-arc/diameter strokes; driving constraint/conflict Cancel/local history/extrusion/SaveOpen/physical STEP',
    inputLimits: 'Actual CDP left pointer and SVG-only wheel; controls fully contained/hit-tested. Origin/10 mm grid provide coordinate calibration. Native setters author visible fields; no geometry/reference/response injection or physical-typing claim',
    featureLimits: 'Three original planar XY documents, one rectangle4x2 then6x2, circleR2, upper semicircleR2 plus diameter, height3. Centre arc only; no spline/other arc aliases or editing-tool coverage claim',
    tolerances: { volumeMm3: 1e-5, planarMeshAreaMm2: 1e-5, boundsMm: 1e-6 } } };
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
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible sketch-primitive control required: ' + selector);
      matches[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
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
        clip: { left, top, right, bottom }, disabled: element.matches(':disabled'), hidden: !!element.closest('[hidden]'),
        hit: !!hit && (hit === element || element.contains(hit)),
        available: !element.matches(':disabled') && !element.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom
          && !!hit && (hit === element || element.contains(hit)) };
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label);
    let previous, since = 0;
    const target = await waitFor('stationary sketch-primitive control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Pattern control remains contained and hit-tested before pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after DOM reveal' });
  }
  async function change(selector, value) {
    value = String(value); await reveal(selector);
    // Draft number editors commit on real blur. Focus the actual input before
    // authoring its text so the following pointer action crosses that boundary.
    if (await page(selector => document.querySelector(selector) instanceof HTMLInputElement, selector)) await press(selector);
    await waitFor('one enabled visible sketch-primitive field ' + selector, async () => (await inspect(selector)).available)
      .catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector)); throw error; });
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
        || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || !hit || !(field === hit || field.contains(hit))) throw Error('One revealed current enabled sketch-primitive field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Current enabled sketch-primitive option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Visible field native setter/input or change event after reveal and hit test' });
    await waitFor('sketch-primitive field retains authored value', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function ready() {
    await waitFor('current sketch-primitive preview is acceptable', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  async function committed(features, phase) {
    const snapshot = await waitFor('committed sketch-primitive recovery ' + phase, async () => {
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
  const newIds = new Set();
  async function response(serial, predicate, phase) {
    return waitFor('fresh sketch-primitive response ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No sketch-primitive worker transport errors');
      return state.builds.filter(record => record.serial > serial && predicate(record.features) && record.response).at(-1);
    }).catch(async error => {
      try {
        const state = await observe(); records.push({ phase: phase + '-failed-observation', afterSerial: serial,
          recent: state.builds.slice(-5).map(record => ({ serial: record.serial, features: record.features, responseOk: record.response?.ok, featureErrors: record.response?.value?.featureErrors })),
          ui: await page(() => ({ status: document.querySelector('.sketch-solver-status')?.textContent,
            fields: [...document.querySelectorAll('.property-manager input[aria-label],.property-manager select[aria-label]')].map(field => ({ label: field.getAttribute('aria-label'), value: field.value, disabled: field.disabled })),
            constraints: document.querySelector('[aria-label="Relaciones y cotas"]')?.textContent,
            focus: document.activeElement?.getAttribute('aria-label') })) });
      } catch (diagnosticError) { records.push({ phase: phase + '-diagnostic-unavailable', message: diagnosticError.message }); }
      throw error;
    });
  }
  function recordSketch(record, phase) {
    check(record.response.ok, record.response.error || 'Sketch build transport failed');
    const feature = record.features.at(-1);
    check(record.features.length === 1 && feature.type === 'sketch' && feature.plane === 'XY' && feature.offset === 0
      && (!feature.support || feature.support.kind === 'principal' && feature.support.plane === 'XY') && feature.profile.kind === 'entities', 'Real XY entity sketch is the only rolled-back feature');
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), profile: feature.profile, featureErrors: record.response.value.featureErrors });
    return record;
  }
  async function sketch(serial, predicate, phase) { return recordSketch(await response(serial, features => features.at(-1)?.type === 'sketch' && predicate(features.at(-1).profile), phase), phase); }
  const point = (profile, id) => id === 'origin' ? { x: 0, y: 0 } : profile.points.find(value => value.id === id);
  function rectangle(profile, width, constrained) {
    check(profile.entities.length === 4 && profile.entities.every(entity => entity.type === 'line' && !entity.construction), 'Four real drawn rectangle lines');
    const ids = new Set(profile.entities.flatMap(entity => [entity.start, entity.end]));
    check(ids.size === 4 && ids.has('origin'), 'Rectangle has four shared vertices including the real reserved origin');
    for (const [x, y] of [[0, 0], [width, 0], [width, 2], [0, 2]]) check([...ids].filter(id => {
      const value = point(profile, id); return value && Math.abs(value.x - x) <= 1e-6 && Math.abs(value.y - y) <= 1e-6;
    }).length === 1, 'Independent literal rectangle vertex ' + x + ',' + y);
    check(profile.constraints.filter(value => value.type === 'horizontal').length === 2 && profile.constraints.filter(value => value.type === 'vertical').length === 2, 'Rectangle tool authors its actual two horizontal/two vertical relations');
    if (constrained) check(profile.constraints.filter(value => value.type === 'length' && value.value === 6 && !value.driven).length === 1
      && profile.constraints.filter(value => value.type === 'length' && value.value === 2 && !value.driven).length === 1
      && profile.constraints.filter(value => value.type === 'fix' && value.x === 0 && value.y === 2).length === 1, 'Saved driving length and valid fixed corner are explicit');
  }
  function circle(profile) {
    check(profile.entities.length === 1 && profile.entities[0].type === 'circle' && profile.entities[0].center === 'origin' && !profile.entities[0].construction, 'One actual origin-centred circle');
    near(profile.entities[0].radius, 2, 1e-9, 'Literal drawn circle radius');
  }
  function semicircle(profile, closed) {
    const arc = profile.entities[0]; check(profile.entities.length === (closed ? 2 : 1) && arc.type === 'arc' && arc.center === 'origin'
      && !arc.clockwise && !arc.construction, 'Actual counterclockwise centre arc');
    for (const [id, x] of [[arc.start, 2], [arc.end, -2]]) { const p = point(profile, id); near(p.x, x, 1e-9, 'Literal semicircle endpoint X'); near(p.y, 0, 1e-9, 'Literal semicircle endpoint Y'); }
    if (closed) { const line = profile.entities[1]; check(line.type === 'line' && line.start === arc.end && line.end === arc.start && !line.construction,
      'Diameter uses both physically snapped original arc endpoints'); }
  }
  async function newDocument(first, kind) {
    await press('button[title="Nuevo documento"]'); await press('[role="dialog"][aria-labelledby="new-document-title"] [data-new-document-kind="part"]');
    if (first) await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const empty = await waitFor('new empty original ' + kind, async () => {
      const value = await recovery(); if (!value) return false; const doc = JSON.parse(value);
      return doc.features.length === 0 && !newIds.has(doc.id) && await page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')) ? doc : false;
    });
    check(empty.version === 1 && empty.name === 'Pieza1' && empty.units === 'mm', 'Public New creates a distinct empty millimetre part'); newIds.add(empty.id);
    records.push({ phase: kind + '-empty', documentId: empty.id, features: 0 }); return empty;
  }
  async function startSketch() {
    await press('.ribbon-tabs button', 'Croquis'); const serial = (await observe()).serial; await press('button.command[title="Nuevo croquis"]');
    await waitFor('actual empty multientity sketch', () => page(selector => !!document.querySelector(selector)
      && !document.querySelector(selector + ' [data-selection-kind="entity"]'), SVG));
    await change('select[aria-label="Soporte del plano"]', 'principal:XY'); await zoom();
    return sketch(serial, profile => !profile.entities.length, 'new-empty-sketch');
  }
  async function calibration(coordinates) {
    return page((selector, coordinates) => {
      const svg = document.querySelector(selector), origin = svg?.querySelector('[aria-label="Origen fijo (0, 0)"] circle'), grid = svg?.querySelector('pattern'), matrix = svg?.getScreenCTM();
      if (!origin || !grid || !matrix) throw Error('Current visible origin and 10 mm grid calibration required');
      const scale = Number(grid.getAttribute('width')) / 10, cx = Number(origin.getAttribute('cx')), cy = Number(origin.getAttribute('cy')), rect = svg.getBoundingClientRect();
      if (!Number.isFinite(scale) || scale <= 0 || scale > 100) throw Error('Bounded current sketch scale required');
      const points = coordinates.map(([x, y]) => { const value = new DOMPoint(cx + x * scale, cy - y * scale).matrixTransform(matrix); return { x: value.x, y: value.y }; });
      if (points.some(p => p.x <= Math.max(0, rect.left) + 12 || p.x >= Math.min(innerWidth, rect.right) - 12
        || p.y <= Math.max(0, rect.top) + 12 || p.y >= Math.min(innerHeight, rect.bottom) - 12 || !svg.contains(document.elementFromPoint(p.x, p.y)))) throw Error('Every literal drawing target must hit the visible SVG interior');
      return { scale, points, origin: [cx, cy], rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    }, SVG, coordinates);
  }
  async function zoom() {
    for (let step = 0; step < 16; step++) {
      const current = await calibration([[0, 0]]); if (current.scale >= 20) return;
      await wheel(current.points[0], -240);
      await waitFor('actual SVG wheel increases current scale', async () => (await calibration([[0, 0]])).scale > current.scale);
    }
    throw Error('Bounded real sketch zoom did not reach 20 pixels/mm');
  }
  async function stroke(tool, coordinates, clicks = false) {
    await press('button.command[title="' + tool + '"]'); const target = await calibration(coordinates), serial = (await observe()).serial;
    check(target.scale >= 20, 'Literal 2 mm features remain beyond the existing 8 pixel snap radius');
    const assertPoint = async p => check(await page((selector, p, expected) => {
      const svg = document.querySelector(selector), rect = svg?.getBoundingClientRect();
      return !!rect && rect.x === expected.x && rect.y === expected.y && rect.width === expected.width && rect.height === expected.height
        && svg.contains(document.elementFromPoint(p.x, p.y));
    }, SVG, p, target.rect), 'Actual drawing SVG remains stationary and hit-tested before input');
    if (clicks) for (const p of target.points) { await pointer('mouseMoved', p); await assertPoint(p); await pointer('mousePressed', p, 1); await pointer('mouseReleased', p, 0); }
    else { await pointer('mouseMoved', target.points[0]); await assertPoint(target.points[0]); await pointer('mousePressed', target.points[0], 1);
      await pointer('mouseMoved', target.points[1], 1); await assertPoint(target.points[1]); await pointer('mouseReleased', target.points[1], 0); }
    interactions.push({ tool, coordinates, calibration: target, input: clicks ? 'Actual CDP SVG clicks' : 'Actual CDP SVG drag' }); return serial;
  }
  async function selectAt(coordinates, kind) {
    await press('button.command[title="Seleccionar"]'); const target = await calibration([coordinates]), p = target.points[0];
    check(await page((p, kind) => document.elementFromPoint(p.x, p.y)?.closest('[data-selection-kind]')?.getAttribute('data-selection-kind') === kind, p, kind), 'Literal selection point hits requested real SVG ' + kind);
    await pointer('mouseMoved', p); await pointer('mousePressed', p, 1); await pointer('mouseReleased', p, 0);
    interactions.push({ input: 'Actual SVG selection press/release', coordinates, kind, point: p });
  }
  async function localHistory(before, after, phase) {
    let serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    const undo = await sketch(serial, profile => canonical(profile) === canonical(before.features[0].profile), phase + '-local-undo');
    check(canonical(undo.features) === canonical(before.features), 'One local Undo restores exact entity and constraint IDs');
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    const redo = await sketch(serial, profile => canonical(profile) === canonical(after.features[0].profile), phase + '-local-redo');
    check(canonical(redo.features) === canonical(after.features), 'One local Redo restores exact geometry/constraints');
  }
  async function acceptSketch(record, phase) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const accepted = await response(serial, features => canonical(features) === canonical(record.features), phase); await committed(accepted.features, phase); return accepted;
  }
  function solid(record, kind, phase, width = 6) {
    check(record.response.ok, record.response.error || 'Solid build transport failed'); const result = record.response.value;
    check(record.features.length === 2 && record.features[0].type === 'sketch' && record.features[1].type === 'extrude'
      && record.features[1].sketchId === record.features[0].id && record.features[1].depth === 3 && !record.features[1].symmetric
      && record.features[1].bodyOperation?.mode === 'new', 'One actual three-millimetre extrusion uses the explicitly drawn sketch');
    check(result.bodyCatalogActive && result.bodies?.length === 1 && !result.featureErrors.length && !result.warnings.length, 'One healthy actual extruded body');
    const body = result.bodies[0], expected = kind === 'rectangle' ? { volume: width * 6, min: [0, 0, 0], max: [width, 2, 3] }
      : kind === 'circle' ? { volume: 12 * Math.PI, min: [-2, -2, 0], max: [2, 2, 3] } : { volume: 6 * Math.PI, min: [-2, 0, 0], max: [2, 2, 3] };
    near(body.volume, expected.volume, 1e-5, 'Independent drawn-profile extrusion volume');
    if (kind === 'rectangle') near(body.meshAreaMm2, width === 4 ? 52 : 72, 1e-5, 'Independent planar rectangle extrusion area');
    else check(Number.isFinite(body.meshAreaMm2) && body.meshAreaMm2 > 0, 'Curved tessellated area is finite; exact curved area deferred to STEP');
    for (const side of ['min', 'max']) expected[side].forEach((value, axis) => near(body.bounds[side][axis], value, 1e-6, 'Literal drawn-profile solid bounds'));
    check(body.ref.bodyId === record.features[1].bodyOperation.bodyId && body.ref.sourceFeatureId === record.features[1].id
      && body.createdByFeatureId === record.features[1].id, 'Exact original extrusion output identity');
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), body: { ref: body.ref, volume: body.volume, bounds: body.bounds, meshArea: body.meshAreaMm2 } }); return record;
  }
  async function extrude(sketchRecord, kind, width) {
    await press('.tree-row[data-feature-id="' + sketchRecord.features[0].id + '"]:not([data-parent-feature-id])');
    await press('.ribbon-tabs button', 'Operaciones'); await press('button.command[title="Saliente/Base extruido"]');
    const serial = (await observe()).serial; await change('input[aria-label="Profundidad"]', 3); await ready();
    const preview = solid(await response(serial, features => features.at(-1)?.type === 'extrude' && features.at(-1).depth === 3, kind + '-extrude-preview'), kind, kind + '-extrude-preview', width);
    check(await page(id => document.querySelector('select[aria-label="Croquis de la operación"]')?.value === id, sketchRecord.features[0].id), 'Normal extrusion command retains explicitly selected sketch');
    const before = (await observe()).serial; await press(APPLY);
    const record = solid(await response(before, features => canonical(features) === canonical(preview.features), kind + '-extruded'), kind, kind + '-extruded', width);
    return { record, snapshot: await committed(record.features, kind + '-extruded') };
  }
  async function editRectangle(stage, phase) {
    const owner = 'button[data-part-tree-toggle="' + stage.record.features[1].id + '"]';
    if (await page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', owner)) await press(owner);
    await press('.tree-row[data-feature-id="' + stage.record.features[0].id + '"][data-parent-feature-id="' + stage.record.features[1].id + '"]');
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('original rectangle SVG edit mounted', () => page(selector => !!document.querySelector(selector), SVG)); await zoom();
    let serial = (await observe()).serial; await selectAt([0, 2], 'point'); await press('.relation-choices button', 'Fijar punto');
    const fixed = await sketch(serial, profile => profile.constraints.some(value => value.type === 'fix' && value.x === 0 && value.y === 2), phase + '-fixed-corner'); rectangle(fixed.features[0].profile, 4, false);
    await selectAt([4, 1], 'entity'); await press('button.command[title="Cota inteligente"]'); serial = (await observe()).serial;
    await change('input[aria-label="Valor de nueva cota"]', 2); await press('.property-manager button.outline-button', 'Añadir cota');
    const height = await sketch(serial, profile => profile.constraints.some(value => value.type === 'length' && value.value === 2 && !value.driven), phase + '-driving-height-two');
    rectangle(height.features[0].profile, 4, false);
    await selectAt([2, 0], 'entity'); await press('button.command[title="Cota inteligente"]');
    check(await page(() => document.querySelector('select[aria-label="Tipo de cota"]')?.value === 'length'
      && ![...document.querySelectorAll('.property-manager label.finish-checkbox')].find(label => label.textContent.trim() === 'Crear cota conducida')?.querySelector('input')?.checked), 'Actual selected line exposes a driving length dimension');
    serial = (await observe()).serial; await change('input[aria-label="Valor de nueva cota"]', 6); await press('.property-manager button.outline-button', 'Añadir cota');
    const dimensioned = await sketch(serial, profile => profile.constraints.some(value => value.type === 'length' && value.value === 6 && !value.driven), phase + '-driving-six'); rectangle(dimensioned.features[0].profile, 6, true);
    check(await page(() => document.querySelector('.sketch-solver-status')?.classList.contains('fullyDefined')), 'Both driving dimensions and fixed corner fully define this rectangle');
    return { fixed: height, dimensioned };
  }
  async function saveOpenExport(stage, kind, ordinal, doc) {
    await file('Guardar como…'); await waitFor('sketch-primitive Save As completes', async () => dialogCounts().saves === ordinal
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === ordinal && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(files[kind]), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === doc.id && canonical(saved.features) === canonical(stage.record.features), 'Saved original part retains exact pointer-authored profile/constraints/body IDs');
    const serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = solid(await response(serial, features => canonical(features) === canonical(saved.features), kind + '-reopened'), kind, kind + '-reopened');
    const snapshot = await committed(reopened.features, kind + '-reopened');
    check(canonical(JSON.parse(snapshot.recovery)) === canonical(saved) && snapshot.history.every(value => value.disabled)
      && canonical(reopened.response.value.bodies) === canonical(stage.record.response.value.bodies), 'Real Open retains native geometry/references/recovery and starts fresh history');
    await file('Exportar STEP'); await waitFor('actual primitive STEP completes', () => dialogCounts().geometryExports === ordinal
      && ipc.filter(event => event.channel === 'document:export' && event.completed).length === ordinal);
    const step = await fsp.readFile(files.steps[kind]); exports.push({ kind, ...await require('./desktop-sketch-primitives-step.cjs')(step, kind, check), savedSha256: digest(bytes), stepSha256: digest(step) });
    check(await recovery() === snapshot.recovery && (await fsp.readFile(files[kind])).equals(bytes), 'STEP preserves exact saved primitive document and recovery');
  }
  return async () => {
    await waitFor('production sketch primitives startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const rectangleDoc = await newDocument(true, 'rectangle'); await startSketch();
    let serial = await stroke('Rectángulo', [[0, 0], [4, 2]]), drawn = await sketch(serial, profile => profile.entities.length === 4, 'rectangle-drawn'); rectangle(drawn.features[0].profile, 4, false);
    const accepted = await acceptSketch(drawn, 'rectangle-sketch-accepted'), original = await extrude(accepted, 'rectangle', 4);
    const first = await editRectangle(original, 'rectangle-first-edit'); await localHistory(first.fixed, first.dimensioned, 'driving-length');
    await selectAt([3, 0], 'entity'); serial = (await observe()).serial; await press('.relation-choices button', 'Vertical');
    const invalid = await sketch(serial, profile => profile.constraints.filter(value => value.type === 'vertical').length === 3, 'incompatible-vertical');
    const diagnostic = await waitFor('incompatible relation has visible diagnostic and blocks Accept', () => page(selector => {
      const status = document.querySelector('.sketch-solver-status'); return status?.classList.contains('inconsistent') && document.querySelector(selector)?.disabled
        && status.textContent.trim() ? status.textContent.trim() : false;
    }, APPLY));
    check(await recovery() === original.snapshot.recovery, 'Incompatible local relation preserves exact committed recovery'); records.push({ phase: 'incompatible-relation-diagnostic', diagnostic, featuresSha256: digest(canonical(invalid.features)) });
    serial = (await observe()).serial; await press(CANCEL);
    const restored = solid(await response(serial, features => canonical(features) === canonical(original.record.features), 'invalid-edit-cancel'), 'rectangle', 'invalid-edit-cancel', 4);
    check(canonical(await committed(restored.features, 'invalid-edit-cancel')) === canonical(original.snapshot)
      && canonical(restored.response.value.bodies) === canonical(original.record.response.value.bodies), 'Cancel directly restores exact committed geometry/history/dirty title');
    const retry = await editRectangle(original, 'rectangle-retry'); await ready(); serial = (await observe()).serial; await press(APPLY);
    const updated = solid(await response(serial, features => features.length === 2 && canonical(features[0]) === canonical(retry.dimensioned.features[0]), 'rectangle-edited-accepted'), 'rectangle', 'rectangle-edited-accepted');
    check(updated.features[1].id === original.record.features[1].id && updated.response.value.bodies[0].ref.bodyId === original.record.response.value.bodies[0].ref.bodyId, 'Sketch edit rebuilds the original downstream extrusion and retained body');
    const rectangleFinal = { record: updated, snapshot: await committed(updated.features, 'rectangle-edited-accepted') };
    for (const [direction, stage, width] of [['Deshacer', original, 4], ['Rehacer', rectangleFinal, 6]]) {
      serial = (await observe()).serial; await press('button[title="' + direction + (direction === 'Deshacer' ? ' (Ctrl+Z)' : ' (Ctrl+Y)') + '"]');
      const record = solid(await response(serial, features => canonical(features) === canonical(stage.record.features), 'rectangle-document-' + direction), 'rectangle', 'rectangle-document-' + direction, width);
      check((await committed(record.features, 'rectangle-document-' + direction)).recovery === stage.snapshot.recovery, 'One document history action restores exact sketch/extrusion transaction');
    }
    await saveOpenExport(rectangleFinal, 'rectangle', 1, rectangleDoc);
    const circleDoc = await newDocument(false, 'circle'), circleEmpty = await startSketch();
    serial = await stroke('Círculo', [[0, 0], [2, 0]]); drawn = await sketch(serial, profile => profile.entities.length === 1 && profile.entities[0].type === 'circle', 'circle-drawn'); circle(drawn.features[0].profile);
    await localHistory(circleEmpty, drawn, 'circle-stroke'); const circleAccepted = await acceptSketch(drawn, 'circle-sketch-accepted');
    const circleFinal = await extrude(circleAccepted, 'circle'); await saveOpenExport(circleFinal, 'circle', 2, circleDoc);
    const semiDoc = await newDocument(false, 'semicircle'); await startSketch();
    serial = await stroke('Arco de centro', [[0, 0], [2, 0], [-2, 0]], true); const arc = await sketch(serial, profile => profile.entities.length === 1 && profile.entities[0].type === 'arc', 'centre-arc-drawn'); semicircle(arc.features[0].profile, false);
    serial = await stroke('Línea', [[-2, 0], [2, 0]], true); const closed = await sketch(serial, profile => profile.entities.length === 2, 'real-diameter-drawn'); semicircle(closed.features[0].profile, true);
    await localHistory(arc, closed, 'diameter-closure'); const semiAccepted = await acceptSketch(closed, 'semicircle-sketch-accepted');
    const semiFinal = await extrude(semiAccepted, 'semicircle'); await saveOpenExport(semiFinal, 'semicircle', 3, semiDoc);
    check(newIds.size === 3 && dialogCounts().opens === 3 && dialogCounts().saves === 3 && dialogCounts().geometryExports === 3, 'Exactly three original new parts/Save As/Open/STEP exports');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Actual production sketch worker and WASM loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No sketch-primitive renderer/asset/worker errors');
  };
};
