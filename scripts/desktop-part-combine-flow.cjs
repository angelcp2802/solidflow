'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function combineWorkflow(context) {
  const { expected, input, output, combineStepPath, evaluate, observe, waitFor, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const OPERATION = 'select[aria-label="Operación Combine"]';
  const records = [], interactions = [];
  const evidence = { partCombine: { records, interactions,
    scope: 'Original overlapping A/B and distant witness C -> normal Union/Intersection authoring and history -> ordered subtraction with target edit/Cancel/retry -> native Save/Open/STEP',
    inputLimits: 'Actual CDP left presses/releases on visible contained hit-tested controls. Native select setters/change events author ordinary current options. No React state, body reference or native response injection.',
    featureLimits: 'Two overlapping boxes, one untouched distant box, keepTools=false. Union and Intersection are accepted/history-checked; the final persistent artifact is B-minus-A. No keepTools=true, arbitrary operands, disconnected unions or dependent-reference repair coverage.',
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
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible Combine control required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
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
    const target = await waitFor('stationary Combine control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Hole control remains contained and hit-tested before pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after DOM reveal' });
  }
  async function change(selector, value) {
    value = String(value); await reveal(selector);
    await waitFor('one enabled visible Combine field ' + selector, async () => (await inspect(selector)).available);
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)
        || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || !hit || !(field === hit || field.contains(hit))) throw Error('One revealed current enabled Combine field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Current enabled Combine option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Visible field native setter/input or change event after reveal and hit test' });
    await waitFor('Combine field retains authored value', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function ready() {
    await waitFor('current Combine preview is acceptable', () => page(selector => {
      const button = document.querySelector(selector); return !!button && !button.disabled && !document.querySelector('.error-banner[role="alert"]');
    }, APPLY));
  }
  async function committed(features, phase) {
    const snapshot = await waitFor('committed Combine recovery ' + phase, async () => {
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
  const refs = Object.fromEntries(['a', 'b', 'c'].map(id => [id, { bodyId: 'combine-body-' + id, sourceFeatureId: 'combine-create-' + id }]));
  let witnessC;
  function nativeBody(result, id) {
    const matches = result.bodies.filter(body => body.ref.bodyId === id);
    check(matches.length === 1, 'One exact current native body ' + id); return matches[0];
  }
  function bodyMetrics(body, volume, area, min, max, label) {
    near(body.volume, volume, 1e-5, 'Independent ' + label + ' volume');
    near(body.meshAreaMm2, area, 1e-5, 'Independent planar ' + label + ' mesh area');
    for (const [side, values] of [['min', min], ['max', max]]) values.forEach((value, index) => near(body.bounds[side][index], value, 1e-6, 'Literal ' + label + ' bounds'));
  }
  function combination(feature, kind, resultId) {
    check(feature.type === 'combine' && feature.keepTools === false && feature.suppressed === false, 'Normal Combine keeps no input tools');
    if (kind === 'add' || kind === 'common') {
      check(feature.operation === kind && canonical(feature.operands) === canonical([refs.a, refs.b])
        && typeof feature.resultBodyId === 'string' && feature.resultBodyId.length > 0
        && !Object.values(refs).some(ref => ref.bodyId === feature.resultBodyId), 'Exact ordered A/B operands and separate result identity');
      if (resultId) check(feature.resultBodyId === resultId, 'Union/Intersection editing retains its actual result body identity');
    } else {
      const reverse = kind === 'subtract-b';
      check(feature.operation === 'subtract' && canonical(feature.target) === canonical(reverse ? refs.b : refs.a)
        && canonical(feature.tools) === canonical([reverse ? refs.a : refs.b]), 'Exact target/tool order for ' + kind);
    }
  }
  function geometry(record, kind, phase) {
    check(record.response.ok, record.response.error || 'Native Combine build failed');
    check(canonical(record.features.slice(0, 6)) === canonical(expected.features), 'Every original body feature stays exact');
    const result = record.response.value, count = kind ? 2 : 3;
    check(result.bodyCatalogActive && result.bodies?.length === count && !result.featureErrors.length
      && canonical(result.warnings) === canonical(['La pieza contiene ' + count + ' sólidos separados.']), 'Exact healthy current body count and warning');
    const c = nativeBody(result, refs.c.bodyId);
    check(canonical(c.ref) === canonical(refs.c) && c.createdByFeatureId === refs.c.sourceFeatureId, 'Witness C retains exact producer and creator identities');
    bodyMetrics(c, 64, 96, [30, 0, 0], [34, 4, 4], 'witness C');
    if (witnessC) check(canonical(c) === canonical(witnessC), 'Witness C retains exact observed geometry, face/edge references and coordinates');
    if (!kind) {
      for (const [id, shift] of [['a', 0], ['b', 5]]) {
        const body = nativeBody(result, refs[id].bodyId);
        check(canonical(body.ref) === canonical(refs[id]) && body.createdByFeatureId === refs[id].sourceFeatureId, 'Exact original source body ' + id);
        bodyMetrics(body, 1000, 600, [shift, 0, 0], [shift + 10, 10, 10], 'source ' + id);
      }
    } else {
      const feature = record.features.at(-1); combination(feature, kind);
      const id = kind === 'add' || kind === 'common' ? feature.resultBodyId : (kind === 'subtract-a' ? refs.a.bodyId : refs.b.bodyId);
      const body = nativeBody(result, id), creator = kind === 'add' || kind === 'common' ? feature.id : (kind === 'subtract-a' ? refs.a.sourceFeatureId : refs.b.sourceFeatureId);
      check(body.ref.sourceFeatureId === feature.id && body.createdByFeatureId === creator, 'Actual result has the correct new/retained identity and current producer');
      const minX = kind === 'add' || kind === 'subtract-a' ? 0 : kind === 'common' ? 5 : 10;
      const maxX = kind === 'add' || kind === 'subtract-b' ? 15 : kind === 'common' ? 10 : 5;
      bodyMetrics(body, kind === 'add' ? 1500 : 500, kind === 'add' ? 800 : 400, [minX, 0, 0], [maxX, 10, 10], kind);
      check(result.bodies.filter(value => value.ref.bodyId !== refs.c.bodyId).length === 1, 'Only the intended result remains beside C');
      for (const ref of [refs.a, refs.b]) if (ref.bodyId !== id) check(!result.bodies.some(value => value.ref.bodyId === ref.bodyId), 'Consumed input is absent from the current catalogue');
    }
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: result.bodies }); return record;
  }
  async function built(serial, predicate, kind, phase) {
    const record = await waitFor('native Combine response ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No Combine worker transport errors');
      return state.builds.filter(record => record.serial > serial && predicate(record.features) && record.response).at(-1);
    });
    return geometry(record, kind, phase);
  }
  async function bodyCheckbox(name, editor) {
    const prefix = editor ? '.property-manager .body-operation-panel .body-list' : '.part-body-catalog .body-list';
    const current = await page((prefix, name) => {
      const labels = [...document.querySelectorAll(prefix + ' label.body-row')];
      const rows = labels.map(label => {
        const span = label.querySelector(':scope > span');
        return { name: [...(span?.childNodes ?? [])].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim(),
          checked: label.querySelector('input')?.checked, disabled: label.querySelector('input')?.disabled };
      });
      const indices = rows.map((row, index) => row.name === name ? index : -1).filter(index => index >= 0);
      return { rows, index: indices.length === 1 ? indices[0] : null };
    }, prefix, name);
    check(current.index !== null && current.rows.length === 3 && !current.rows[current.index].disabled, 'One real current source checkbox for ' + name + ': ' + JSON.stringify(current));
    const selector = prefix + (editor ? ' > label.body-row:nth-of-type(' : ' > .body-catalog-entry:nth-child(')
      + (current.index + 1) + (editor ? ') > input' : ') > label.body-row > input');
    return { selector, checked: current.rows[current.index].checked };
  }
  async function setBody(name, checked, editor = false) {
    const current = await bodyCheckbox(name, editor);
    if (current.checked !== checked) await press(current.selector);
    check((await bodyCheckbox(name, editor)).checked === checked, 'Actual body checkbox retains requested state for ' + name);
  }
  async function viewPreview() {
    await press('.property-manager .body-operation-panel button.outline-button', 'Ver vista previa'); await ready();
  }
  async function newCombine(phase) {
    if (await page(() => { const button = document.querySelector('button[aria-label="Limpiar selección de pieza"]'); return !!button && !button.disabled; }))
      await press('button[aria-label="Limpiar selección de pieza"]');
    await setBody('Original body A', true); await setBody('Original body B', true); await setBody('Original body C', false);
    await waitFor('exact ordered A/B browse selection', () => page(refs => document.querySelector('.viewport-canvas')?.getAttribute('data-part-selected-bodies') === JSON.stringify(refs), [refs.a, refs.b]));
    await press('.ribbon-tabs button', 'Operaciones'); const serial = (await observe()).serial;
    await press('button.command[title="Combinar cuerpos"]');
    const record = await built(serial, features => features.length === 7 && features.at(-1).type === 'combine' && features.at(-1).operation === 'add', 'add', phase);
    combination(record.features.at(-1), 'add'); return record;
  }
  async function modeOptions(subtract, phase) {
    const values = await page(selector => [...document.querySelector(selector).options].map(option => ({ value: option.value, disabled: option.disabled })), OPERATION);
    check(canonical(values) === canonical([{ value: 'add', disabled: subtract }, { value: 'subtract', disabled: !subtract }, { value: 'common', disabled: subtract }]), 'Existing operation preserves documented mode/identity boundary');
    records.push({ phase, modeOptions: values });
  }
  async function edit(feature) {
    await press('.tree-row[data-feature-id="' + feature.id + '"]:not([data-parent-feature-id])');
    await press('.selection-tools button[title="Editar operación"]');
    await waitFor('existing exact Combine editor with current source', () => page((selector, value) => {
      const field = document.querySelector(selector); return !!field && !field.disabled && field.value === value;
    }, OPERATION, feature.operation));
    await modeOptions(feature.operation === 'subtract', 'edit-' + feature.operation + '-mode-guards');
  }
  async function targetB(feature, phase) {
    await edit(feature);
    const value = await waitFor('current enabled B target option', () => page(() => {
      const field = document.querySelector('select[aria-label="Cuerpo objetivo de sustracción"]');
      if (!field || field.disabled) return false;
      const options = [...field.options]
        .filter(option => option.textContent.trim() === 'Original body B' && !option.disabled);
      return options.length === 1 ? options[0].value : false;
    }));
    const serial = (await observe()).serial; await change('select[aria-label="Cuerpo objetivo de sustracción"]', value);
    const record = await built(serial, features => features.at(-1).id === feature.id && features.at(-1).target?.bodyId === refs.b.bodyId, 'subtract-b', phase);
    await viewPreview(); return record;
  }
  async function accept(preview, kind, phase) {
    await viewPreview(); const serial = (await observe()).serial; await press(APPLY);
    const record = await built(serial, features => canonical(features) === canonical(preview.features), kind, phase);
    return { record, snapshot: await committed(record.features, phase) };
  }
  async function cancel(record, baseline, kind, phase) {
    const serial = (await observe()).serial; await press(CANCEL);
    const restored = await built(serial, features => canonical(features) === canonical(record.features), kind, phase);
    check(canonical(await committed(restored.features, phase)) === canonical(baseline), 'Combine Cancel restores exact recovery, history availability and title');
    check(canonical(restored.response.value.bodies) === canonical(record.response.value.bodies), 'Combine Cancel restores the exact observed current native bodies');
  }
  async function history(stage, direction, phase) {
    const serial = (await observe()).serial; await press('button[title="' + (direction === 'undo' ? 'Deshacer (Ctrl+Z)' : 'Rehacer (Ctrl+Y)') + '"]');
    const record = await built(serial, features => canonical(features) === canonical(stage.record.features), stage.kind, phase);
    check((await committed(record.features, phase)).recovery === stage.snapshot.recovery, 'One history action restores the exact stored Combine transaction');
  }
  return async () => {
    await waitFor('production Combine file control ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, features => canonical(features) === canonical(expected.features), null, 'original-three-bodies');
    witnessC = nativeBody(original.response.value, refs.c.bodyId);
    const baseline = await committed(original.features, 'original-three-bodies');
    const cancelledDraft = await newCombine('new-union-preview');
    await setBody('Original body B', false, true);
    const invalid = await waitFor('one operand visibly rejected by actual Combine editor', () => page(selector => {
      const message = document.querySelector('.body-operation-panel [role="status"]')?.textContent.trim();
      return document.querySelector(selector)?.disabled && message ? { message } : false;
    }, APPLY));
    check(await recovery() === baseline.recovery, 'Incomplete Combine selection never commits recovery');
    records.push({ phase: 'one-operand-selection-rejection', message: invalid.message, limits: 'Document/body-plan admission; no native rejection claim' });
    serial = (await observe()).serial; await setBody('Original body B', true, true);
    await built(serial, features => features.at(-1).id === cancelledDraft.features.at(-1).id && features.at(-1).operands?.length === 2, 'add', 'new-union-selection-recovered');
    await viewPreview(); await cancel(original, baseline, null, 'new-union-cancel');
    const retry = await newCombine('new-union-retry');
    check(retry.features.at(-1).id !== cancelledDraft.features.at(-1).id && retry.features.at(-1).resultBodyId !== cancelledDraft.features.at(-1).resultBodyId, 'Reentry creates fresh operation/result identities');
    const union = await accept(retry, 'add', 'union-accepted'), unionFeature = union.record.features.at(-1);
    await edit(unionFeature); serial = (await observe()).serial; await change(OPERATION, 'common');
    const commonPreview = await built(serial, features => features.at(-1).id === unionFeature.id && features.at(-1).operation === 'common', 'common', 'existing-intersection-preview');
    combination(commonPreview.features.at(-1), 'common', unionFeature.resultBodyId);
    check(await recovery() === union.snapshot.recovery, 'Intersection edit does not commit before Accept');
    const common = await accept(commonPreview, 'common', 'intersection-accepted');
    await history({ ...union, kind: 'add' }, 'undo', 'undo-intersection');
    await history({ record: original, snapshot: baseline, kind: null }, 'undo', 'undo-union');
    await newCombine('new-subtract-default-union'); serial = (await observe()).serial; await change(OPERATION, 'subtract');
    const subtractPreview = await built(serial, features => features.at(-1).operation === 'subtract' && features.at(-1).target?.bodyId === refs.a.bodyId, 'subtract-a', 'new-A-minus-B-preview');
    const subtract = await accept(subtractPreview, 'subtract-a', 'A-minus-B-accepted'), subtractFeature = subtract.record.features.at(-1);
    check(subtract.snapshot.history[1].disabled, 'New subtraction branch revokes abandoned Union/Intersection Redo');
    await targetB(subtractFeature, 'existing-B-minus-A-cancel-preview');
    await cancel(subtract.record, subtract.snapshot, 'subtract-a', 'existing-subtract-target-cancel');
    const reversePreview = await targetB(subtractFeature, 'existing-B-minus-A-retry');
    check(await recovery() === subtract.snapshot.recovery, 'Retargeting subtraction waits for normal acceptance');
    const final = await accept(reversePreview, 'subtract-b', 'B-minus-A-accepted');
    await history({ ...subtract, kind: 'subtract-a' }, 'undo', 'undo-target-edit');
    await history({ record: original, snapshot: baseline, kind: null }, 'undo', 'undo-subtract');
    await history({ ...subtract, kind: 'subtract-a' }, 'redo', 'redo-subtract');
    await history({ ...final, kind: 'subtract-b' }, 'redo', 'redo-target-edit');
    await file('Guardar como…');
    await waitFor('actual Combine Save As completes cleanly', async () => dialogCounts().saves === 1
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(saved.id === expected.id && canonical(saved.features) === canonical(final.record.features), 'Actual saved bytes retain exact ordered target/tools and every original feature');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await built(serial, features => canonical(features) === canonical(saved.features), 'subtract-b', 'saved-Combine-reopened');
    combination(reopened.features.at(-1), 'subtract-b'); const restored = await committed(reopened.features, 'saved-Combine-reopened');
    check(canonical(JSON.parse(restored.recovery)) === canonical(saved) && canonical(reopened.response.value.bodies) === canonical(final.record.response.value.bodies), 'Reopened exact saved declarations and fresh native current bodies agree');
    await file('Exportar STEP');
    await waitFor('actual Combine STEP export completes', () => dialogCounts().geometryExports === 1
      && ipc.filter(event => event.channel === 'document:export' && event.completed).length === 1);
    const step = await fsp.readFile(combineStepPath); evidence.partCombine.nativeStep = await require('./desktop-part-combine-step.cjs')(step, check);
    evidence.partCombine.stepSha256 = digest(step); evidence.partCombine.originalSha256 = digest(await fsp.readFile(input)); evidence.savedSha256 = digest(bytes);
    check(await recovery() === restored.recovery && (await fsp.readFile(output)).equals(bytes), 'Combine STEP export preserves exact recovery and saved bytes');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 1, 'Exactly original Open, Save As, saved Open and final Combine STEP export');
    check(ipc.filter(event => event.channel === 'document:open' && event.completed).length === 2, 'Both Combine Open commands use the actual production bridge');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Actual production worker and WASM loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer, asset or Combine worker transport errors');
    evidence.partCombine.acceptedTransientModes = { unionFeatureId: unionFeature.id, intersectionFeatureId: common.record.features.at(-1).id,
      persistence: 'Accepted and undone in this process; final saved artifact is B-minus-A only' };
  };
};
