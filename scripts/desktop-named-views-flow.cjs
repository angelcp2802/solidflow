'use strict';
const fs = require('node:fs/promises');

// Presentation/persistence acceptance over the callers' original authored part
// or original prism assembly. Inputs are native pointer/key events only. Camera
// declarations are observed only after the application saves them in recovery.
module.exports = async function namedViews(c) {
  const { kind, page, waitFor, check, checks, canonical, digest, key, text, namedViewKey, press, pointer,
    cameraFrame, cameraGesture, rasterComparison, observe, ipc, dialogCounts, output, reopen } = c;
  const DIALOG = 'dialog.named-views-dialog[open]', INPUT = DIALOG + ' input[aria-label="Nombre de la vista"]';
  const names = { part: 'Part view', standard: 'Assembly view', configured: 'Configured view' };
  check(Object.hasOwn(names, kind), 'Named views have one declared workspace owner');
  const name = names[kind], recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  await waitFor('named-view catalog has one idle committed scene owner', () => page(() => {
    const controls = document.querySelectorAll('button[aria-label="Vistas guardadas"]');
    return controls.length === 1 && !controls[0].disabled && controls[0].checkVisibility() && !document.querySelector('[role="dialog"]');
  }));
  const original = JSON.parse(await recovery()), native = await observe(), files = { ipc: structuredClone(ipc), dialogs: dialogCounts() };
  check(!Object.hasOwn(original, 'namedViews'), 'Original fixture starts without a document view catalog');
  check(!native.workerErrors.length, 'Named views start from healthy native history');
  const evidence = { kind, catalog: [], gestures: [], frames: {}, completed: false,
    limits: 'Real pointer, physical keys and fixed native text. Camera declarations come from committed recovery, never camera/React APIs. Part/tree selection is retained; currently projected labels retain their selected state. Labels may leave the viewport while navigating. Recalled views retain exact central-crop pixels outside the existing bounded text masks and original projected anchors. Two distinct saved poses use the actual list and Home/End selection. Original fixture geometry is rechecked by the caller after native reopen. No full-viewport, external-window or platform claim.' };
  checks.push({ namedViews: evidence });
  const projection = () => page(() => {
    const layer = document.querySelector('.assembly-origin-labels');
    if (!layer) return [];
    const labels = [...layer.children].filter(e => e.matches('button[data-origin-key]'));
    const lines = [...layer.querySelectorAll(':scope > svg > line')];
    if (labels.length !== lines.length) throw Error('Origin leader correspondence changed');
    return labels.map((e, i) => ({ key: e.dataset.originKey, selected: e.classList.contains('selected'),
      x: Number(lines[i].getAttribute('x1')), y: Number(lines[i].getAttribute('y1')) }));
  });
  const selection = () => page(() => {
    const part = document.querySelector('.viewport-canvas[aria-label="Vista 3D de la pieza"]');
    return { part: part ? ['selection-mode', 'selected-face', 'selected-edges', 'selected-bodies'].map(k => [k, part.getAttribute('data-part-' + k)]) : null,
      tree: [...document.querySelectorAll('[data-assembly-tree-key][aria-selected="true"]')]
        .map(e => e.getAttribute('data-assembly-tree-key')),
      origins: [...document.querySelectorAll('.assembly-origin-labels button[data-origin-key]')].map(e => [e.dataset.originKey, e.classList.contains('selected')]) };
  });
  let configuredDatum = null;
  if (kind === 'configured') {
    // Idle configured documents show an origin through the model tree. The
    // relation editor's visibility checkboxes are deliberately not mounted here.
    configuredDatum = await page(() => {
      const rows = [...document.querySelectorAll('[data-assembly-origin-tree-key]')].filter(element => {
        const reference = JSON.parse(element.dataset.assemblyOriginTreeReference);
        return element.dataset.assemblyOriginTreeOwner === '[]' && reference.kind === 'principal-axis'
          && reference.axis === 'X' && reference.component === null;
      });
      if (rows.length !== 1) throw Error('One actual root X datum required for named-view evidence');
      return { treeKey: rows[0].getAttribute('data-assembly-tree-key'), originKey: '["principal-axis",null,"X"]',
        selector: '[data-assembly-origin-tree-key="' + CSS.escape(rows[0].dataset.assemblyOriginTreeKey) + '"]' };
    });
    await press(configuredDatum.selector);
    await waitFor('configured named views retain one visible selected root X datum', () => page(datum => {
      const row = document.querySelector(datum.selector), labels = document.querySelectorAll('.assembly-origin-labels button[data-origin-key]');
      return row?.getAttribute('aria-selected') === 'true' && row.getAttribute('data-assembly-tree-key') === datum.treeKey
        && labels.length === 1 && labels[0].dataset.originKey === datum.originKey && labels[0].classList.contains('selected')
        && labels[0].checkVisibility() && labels[0].getBoundingClientRect().width > 0 && labels[0].getBoundingClientRect().height > 0;
    }, configuredDatum));
    check(canonical(JSON.parse(await recovery())) === canonical(original) && canonical(await observe()) === canonical(native)
      && canonical({ ipc, dialogs: dialogCounts() }) === canonical(files), 'Idle tree datum selection preserves document, complete native history and file requests');
  }
  const selected = await selection();
  const originStates = new Map(selected.origins);
  check(originStates.size === selected.origins.length, 'Named-view baseline has unique projected reference identities');
  if (kind === 'standard') check(selected.part === null && selected.tree.length === 0 && originStates.size === 3
    && ['X', 'Y', 'Z'].every(axis => originStates.get(JSON.stringify(['principal-axis', null, axis])) === false),
    'Original standard fixture exposes all three unselected root axes before navigation');
  if (kind === 'configured') check(selected.part === null && canonical(selected.tree) === canonical([configuredDatum.treeKey])
    && originStates.size === 1 && originStates.get(configuredDatum.originKey) === true,
    'Original configured fixture owns exactly the selected root X tree row and label');
  if (kind === 'part') check(selected.tree.length === 0 && originStates.size === 0, 'Original part fixture has no assembly reference selection');
  const visibilitySelectors = kind === 'standard' ? [1, 2].map(i => '#assembly-origin-controls label:nth-of-type(' + i + ') input')
    : kind === 'configured' ? ['Mostrar ejes de origen configurados', 'Mostrar planos de origen configurados'].map(label => 'input[aria-label="' + label + '"]') : [];
  const visibility = () => page((selectors, kind) => {
    if (kind === 'configured') {
      if (selectors.some(selector => document.querySelector(selector))) throw Error('Idle configured named views require relation-only visibility controls to remain unmounted');
      return []; // No checkbox value is inferred from absent controls.
    }
    return selectors.map(selector => {
      const e = document.querySelector(selector);
      if (!(e instanceof HTMLInputElement) || e.type !== 'checkbox') throw Error('Actual origin visibility control required');
      return e.checked;
    });
  }, visibilitySelectors, kind);
  const visible = await visibility();
  evidence.origins = { selection: selected, visibility: visible,
    controls: kind === 'configured' ? 'relation-controls-unmounted' : kind === 'standard' ? 'actual-checkboxes' : 'not-applicable',
    ...(configuredDatum ? { source: 'idle-tree-selection', treeKey: configuredDatum.treeKey, originKey: configuredDatum.originKey } : {}) };
  const layout = () => page(kind => {
    const canvases = [...document.querySelectorAll('.viewport-canvas[aria-label="Vista 3D de la pieza"] > canvas:not([role="img"]),.assembly-viewport canvas')]
      .filter(e => e.getClientRects().length && e.getBoundingClientRect().width > 100 && e.getBoundingClientRect().height > 100);
    if (canvases.length !== 1) throw Error('One current canvas owns the named-view layout');
    const rect = canvases[0].getBoundingClientRect();
    let managerTab = null;
    if (kind === 'standard') {
      const tabs = document.querySelectorAll('.assembly-manager-tabs[aria-label="Panel del ensamblaje"] [role="tab"][aria-selected="true"]');
      if (tabs.length !== 1 || tabs[0].disabled || !tabs[0].checkVisibility()
        || !['assembly-tab-components','assembly-tab-properties','assembly-tab-relations','assembly-tab-evaluate'].includes(tabs[0].id)) throw Error('One current standard manager tab owns the layout');
      managerTab = tabs[0].id;
    }
    return { canvas: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, managerTab,
      configuredPanes: kind === 'configured' ? [...document.querySelectorAll('[data-configured-pane]')]
        .filter(e => !e.hidden && e.checkVisibility()).map(e => e.getAttribute('data-configured-pane')) : [] };
  }, kind);
  const baselineLayout = await layout();
  evidence.layout = { baseline: baselineLayout };
  async function sameLayout(label) {
    const restored = await waitFor(label, async () => {
      const value = await layout();
      return canonical(value.canvas) === canonical(baselineLayout.canvas) && value.managerTab === baselineLayout.managerTab ? value : false;
    });
    check(canonical(restored.canvas) === canonical(baselineLayout.canvas) && restored.managerTab === baselineLayout.managerTab,
      label + ': exact canvas rectangle and original standard manager tab');
    return restored;
  }
  let rasterUnavailable = false;
  async function settled() { await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
  async function command(value) { await key(value); await settled(); }
  async function current(expected) {
    return waitFor('exact named-view recovery', async () => {
      const value = JSON.parse(await recovery()); return canonical(value) === canonical(expected) ? value : false;
    });
  }
  async function unchanged(doc, label) {
    await current(doc);
    const { namedViews: _catalog, ...geometry } = doc;
    check(canonical(geometry) === canonical(original), label + ': only the root view catalog may change');
    check(canonical(await observe()) === canonical(native), label + ': complete native history and serial unchanged');
    check(canonical({ ipc, dialogs: dialogCounts() }) === canonical(files), label + ': no file IPC or picker request');
    const actualSelection = await selection();
    // Projection deliberately culls labels outside the viewport. Selection lives
    // in the part metadata/tree; each label still in view must retain its state.
    // same() separately requires the exact original labels/anchors on recall.
    const selectionRetained = canonical(actualSelection.part) === canonical(selected.part)
      && canonical(actualSelection.tree) === canonical(selected.tree)
      && new Set(actualSelection.origins.map(([key]) => key)).size === actualSelection.origins.length
      && actualSelection.origins.every(([key, active]) => originStates.has(key) && originStates.get(key) === active);
    if (!selectionRetained) evidence.selectionMismatch = { label, expected: selected, actual: actualSelection };
    check(selectionRetained, label + ': part/tree selection and currently projected origin states retained');
    check(canonical(await visibility()) === canonical(visible), label + ': original origin visibility retained');
  }
  async function frame(label, accept) {
    await pointer('mouseMoved', { x: 16, y: 16 });
    let previous = '', since = 0;
    const value = await waitFor('stationary named-view crop: ' + label, async () => {
      const value = await cameraFrame();
      check(value.width > 0 && value.height > 0 && /^[0-9a-f]{64}$/.test(value.sha256)
        && /^[0-9a-f]{64}$/.test(value.rawSha256) && Array.isArray(value.maskedRects)
        && value.unmaskedPixelCount >= value.width * value.height * .9, 'Named-view capture preserves the existing bounded pixel oracle');
      const { rawSha256: _raw, ...compared } = value, signature = canonical(compared);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return Date.now() - since >= 500 ? value : false;
    });
    try { accept?.(value); } catch { rasterUnavailable = true; }
    return { ...value, projected: await projection() };
  }
  function same(actual, expected, label, diagnosticResult) {
    try {
      check(actual.width === expected.width && actual.height === expected.height && actual.sha256 === expected.sha256,
        label + ': exact named-view pixels ' + canonical({ actual, expected }));
      check(canonical(actual.maskedRects) === canonical(expected.maskedRects) && actual.unmaskedPixelCount === expected.unmaskedPixelCount,
        label + ': exact existing text-mask identities and bounds');
      check(actual.projected.length === expected.projected.length && actual.projected.every((p, i) => {
        const q = expected.projected[i]; return p.key === q.key && p.selected === q.selected
          && Math.abs(p.x - q.x) <= .11 && Math.abs(p.y - q.y) <= .11;
      }), label + ': same selected origin anchors within0.11CSSpx');
    } catch (error) {
      if (diagnosticResult && rasterComparison) {
        try { evidence.rasterComparison = rasterUnavailable ? { status: 'unavailable' } : rasterComparison.compare(diagnosticResult); }
        catch { evidence.rasterComparison = { status: 'unavailable' }; }
      }
      throw error;
    }
  }
  const different = (actual, expected, label) => check(actual.width === expected.width && actual.height === expected.height
    && actual.sha256 !== expected.sha256, label + ': actual gesture changes the displayed model');
  async function open() {
    await press('button[aria-label="Vistas guardadas"]');
    await waitFor('one current named-view modal', () => page(selector => {
      const dialogs = document.querySelectorAll('[role="dialog"]'), e = document.querySelector(selector);
      return dialogs.length === 1 && !!e && e.getAttribute('aria-modal') === 'true' && e.checkVisibility()
        && e.querySelector('h2')?.textContent.trim() === 'Vistas guardadas';
    }, DIALOG));
  }
  async function close() { await command('Escape'); await waitFor('named-view modal closes', () => page(s => !document.querySelector(s), DIALOG)); }
  async function type(value) {
    await press(INPUT); await command('A');
    await waitFor('native select-all owns the named-view field', () => page(s => {
      const e = document.querySelector(s); return !!e && document.activeElement === e && e.selectionStart === 0 && e.selectionEnd === e.value.length;
    }, INPUT));
    await text(value);
    await waitFor('physical text reaches named-view field', () => page((s, value) => document.querySelector(s)?.value === value, INPUT, value));
  }
  async function saveView(label, expectedCount) {
    await type(label); await press(DIALOG + ' button[type="submit"]');
    return waitFor('named view commits only its catalog', async () => {
      const doc = JSON.parse(await recovery());
      return doc.namedViews?.length === expectedCount && doc.namedViews.at(-1).name === label ? doc : false;
    });
  }
  async function show() {
    await open();
    check(await page(selector => {
      const e = document.querySelector(selector + ' select'); return e?.options.length === 1 && e.selectedIndex === 0 && !e.disabled;
    }, DIALOG), 'Recall selects the sole saved document view through its visible list');
    await press(DIALOG + ' button', 'Mostrar');
    await waitFor('recall closes its modal', () => page(s => !document.querySelector(s), DIALOG));
  }
  async function selectView(entry, command) {
    const selector = DIALOG + ' select[aria-label="Vistas de este documento"]';
    await press(selector); await namedViewKey(command); await settled();
    await waitFor('native list selects the intended saved view by identity and name', () => page((selector, id, name) => {
      const e = document.querySelector(selector), option = e?.selectedOptions[0];
      return e?.options.length === 2 && document.activeElement === e && e.value === id && option?.textContent === name;
    }, selector, entry.id, entry.name));
  }
  async function showSelected() {
    await press(DIALOG + ' button', 'Mostrar');
    await waitFor('selected named-view recall closes its modal', () => page(s => !document.querySelector(s), DIALOG));
  }
  try {
    await pointer('mouseMoved', { x: 30, y: 20 });
    const initial = await frame('initial fixture camera');
    evidence.authoredPose = { initial, input: [] };
    for (const gesture of ['orbit', 'pan', 'wheel-in']) evidence.authoredPose.input.push(await cameraGesture(gesture));
    await sameLayout('Authored pose retains the original viewport layout');
    const base = await frame('saved baseline', value => rasterComparison?.retainBaseline(value));
    check(canonical(base.projected.map(p => [p.key, p.selected])) === canonical(selected.origins),
      'Saved baseline retains the complete original label inventory for exact recall checks');
    different(base, initial, 'Original orbit/pan/zoom pose differs from the initial fixture view');
    await unchanged(original, 'Authoring the saved camera');
    evidence.frames.base = base;
    await open(); let doc = await saveView(name, 1), first = structuredClone(doc.namedViews[0]);
    check(typeof first.id === 'string' && first.id.length > 0 && Object.keys(first.view).sort().join(',') === 'bottom,far,near,position,target,top,up,zoom',
      'Saved view contains one owned identity and the complete camera declaration');
    check([first.view.position, first.view.target, first.view.up].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))
      && ['top', 'bottom', 'zoom', 'near', 'far'].every(k => Number.isFinite(first.view[k])), 'Committed camera declaration is finite and complete');
    await unchanged(doc, 'Create first view'); evidence.catalog.push({ action: 'create', view: first });
    await type(name.toUpperCase()); await press(DIALOG + ' button[type="submit"]');
    await waitFor('case-colliding name is rejected in the modal', () => page(s => document.querySelector(s + ' [role="alert"]')?.textContent.includes('duplicado'), DIALOG));
    await unchanged(doc, 'Duplicate name rejection');
    await type('Pending view');
    for (const value of ['N', 'O', 'S', 'ShiftS', 'Z', 'Y', '1', '8', 'F']) await command(value);
    check(await page(s => document.querySelectorAll(s).length === 1, DIALOG), 'Named-view modal owns background file, history and camera shortcuts');
    await unchanged(doc, 'Pending name and blocked shortcuts'); await close();
    same(await frame('after modal cancellation'), base, 'Cancel preserves the camera');
    await unchanged(doc, 'Cancel preserves committed first view');
    for (const gesture of ['orbit', 'pan', 'wheel-in']) {
      await cameraGesture(gesture); const moved = await frame(gesture + ' moved'); different(moved, base, gesture);
      const gestureEvidence = { gesture, moved }; evidence.gestures.push(gestureEvidence);
      await unchanged(doc, gesture + ' leaves the saved camera detached');
      await show(); let result;
      const recalled = await frame(gesture + ' recalled', value => { result = value; });
      same(recalled, base, 'Recall after ' + gesture, result);
      await show(); same(await frame(gesture + ' no-op recall'), base, 'Repeated recall is stationary');
      await command('ShiftZ'); const previous = await frame(gesture + ' Previous'); same(previous, moved, 'Previous bypasses no-op recall');
      await show(); const restored = await frame(gesture + ' final recall', value => { result = value; });
      same(restored, base, 'Final recall after ' + gesture, result);
      await unchanged(doc, gesture + ' recall/Previous has no document authority');
      Object.assign(gestureEvidence, { recalled, previous, restored });
    }
    await cameraGesture('pan'); const secondFrame = await frame('second saved pose'); different(secondFrame, base, 'Second original saved pose');
    await open(); const two = await saveView('Temporary view', 2), second = structuredClone(two.namedViews[1]);
    check(second.id !== first.id && canonical(two.namedViews[0]) === canonical(first) && canonical(second.view) !== canonical(first.view),
      'Second catalog entry retains a distinct camera and cannot overwrite the first identity');
    await unchanged(two, 'Create second view');
    await selectView(first, 'Home'); await showSelected(); let selectedResult;
    same(await frame('first of two selected views', value => { selectedResult = value; }), base, 'Actual first-name selection recalls the first pose', selectedResult);
    await unchanged(two, 'First name recall');
    await open(); await selectView(second, 'End'); await showSelected();
    const selectedSecond = await frame('second of two selected views'); same(selectedSecond, secondFrame, 'Actual second-name selection recalls the distinct second pose');
    await unchanged(two, 'Second name recall');
    await open(); await selectView(second, 'End');
    await press(DIALOG + ' button', 'Eliminar'); await current(doc); await unchanged(doc, 'Delete selected second view'); await close();
    await command('Z'); await unchanged(two, 'Undo catalog deletion');
    await command('Y'); await unchanged(doc, 'Redo catalog deletion');
    await open(); await press(DIALOG + ' button', 'Eliminar');
    await unchanged(original, 'Delete last view omits the optional catalog'); await close();
    await command('Z'); await unchanged(doc, 'Undo last deletion restores exact named camera');
    same(await frame('metadata transactions'), secondFrame, 'Catalog transactions preserve the exact displayed scene');
    await show(); let restoredFirstResult;
    same(await frame('first pose before file Save', value => { restoredFirstResult = value; }), base, 'Surviving entry recalls the first pose', restoredFirstResult);
    await unchanged(doc, 'Surviving entry recall');
    evidence.catalog.push({ action: 'select-delete-undo-redo', preserved: first, deleted: second, secondFrame, selectedSecond });
    const beforeSave = ipc.length, saveCount = ipc.filter(e => e.channel === 'document:save').length, dialogsBeforeSave = dialogCounts();
    await command('S');
    await waitFor('named-view native Save completes', async () => {
      const events = ipc.slice(beforeSave).filter(e => e.channel === 'document:save');
      check(events.length <= 1, 'Named views invoke exactly one native Save');
      if (events.length !== 1 || !events[0].completed) return false;
      const bytes = await fs.readFile(output); return canonical(JSON.parse(bytes)) === canonical(doc) ? bytes : false;
    });
    const savedBytes = await fs.readFile(output), save = ipc.slice(beforeSave).find(e => e.channel === 'document:save');
    check(canonical(dialogCounts()) === canonical(dialogsBeforeSave) && save.documentWrite?.hasPath === true
      && save.documentWrite.chosen === true && save.documentWrite.sha256 === digest(savedBytes), 'Native Save returns with the exact catalog bytes through the existing granted path');
    await waitFor('named-view Save clears the actual dirty indicator', () => page(kind => {
      if (kind === 'part') return !document.querySelector('.document-title')?.textContent.includes('*') && document.querySelector('.statusbar')?.textContent.includes('Listo');
      const root = document.querySelector(kind === 'configured' ? '.configured-assembly-workspace' : '.assembly-app');
      return root?.getAttribute('aria-busy') === 'false' && !root.querySelector('header')?.textContent.includes('*');
    }, kind));
    const beforeOpen = dialogCounts().opens;
    await reopen(doc);
    await current(doc);
    check(dialogCounts().opens === beforeOpen + 1 && dialogCounts().saves === dialogsBeforeSave.saves
      && ipc.filter(e => e.channel === 'document:save').length === saveCount + 1, 'Named-view reopen consumes exactly one added Open and no SaveAs');
    check(canonical(JSON.parse(await fs.readFile(output))) === canonical(doc), 'Native reopen leaves saved catalog bytes unchanged');
    // Manager tabs and selection/visibility are session state, not fields of a saved camera.
    // Standard Open resets to Components, whose sidebar has a different width.
    // Restore the captured tab through its real button before comparing the same viewport.
    evidence.layout.afterOpen = await layout();
    if (baselineLayout.managerTab && evidence.layout.afterOpen.managerTab !== baselineLayout.managerTab) await press('#' + baselineLayout.managerTab);
    evidence.layout.afterTab = await sameLayout('Reopened view restores the original manager layout');
    // Re-establish the original visible reference context through its controls
    // before comparing pixels; do not hide it or claim it was serialized.
    for (const treeKey of selected.tree) {
      const selector = '[data-assembly-tree-key=' + JSON.stringify(treeKey) + ']';
      if (!await page(selector => document.querySelector(selector)?.getAttribute('aria-selected') === 'true', selector)) await press(selector);
    }
    for (let i = 0; i < visible.length; i++) if ((await visibility())[i] !== visible[i]) await press(visibilitySelectors[i]);
    const referenceRestoration = { expected: { selection: selected, visibility: visible }, first: null, last: null, polls: 0 };
    evidence.referenceRestoration = referenceRestoration;
    // Tree selection and projected labels reach the DOM through separate updates.
    // Observe the original exact state; do not re-click or synthesize visibility.
    const restoredReferences = await waitFor('native reopen presents the exact original reference selection and visibility', async () => {
      const actual = { selection: await selection(), visibility: await visibility() };
      referenceRestoration.first ??= actual;
      referenceRestoration.last = actual; referenceRestoration.polls++;
      return canonical(actual) === canonical(referenceRestoration.expected) ? actual : false;
    });
    check(canonical(restoredReferences) === canonical(referenceRestoration.expected),
      'Native reopen reference context is restored through the original visible controls');
    referenceRestoration.matched = true;
    evidence.layout.beforeRecall = await sameLayout('Reference context retains the exact original viewport before recall');
    const recalledNative = await observe(), recalledIpc = structuredClone(ipc), recalledDialogs = dialogCounts();
    await show(); let reopenedFrameResult;
    const reopenedFrame = await frame('reopened named view', value => { reopenedFrameResult = value; });
    same(reopenedFrame, base, 'Reopened document recalls the exact original view', reopenedFrameResult);
    evidence.frames.reopened = reopenedFrame;
    check(canonical(JSON.parse(await recovery())) === canonical(doc), 'Recall after reopen leaves the full committed document unchanged');
    check(canonical(await observe()) === canonical(recalledNative) && canonical(ipc) === canonical(recalledIpc)
      && canonical(dialogCounts()) === canonical(recalledDialogs), 'Recall after reopen issues no native or file request');
    evidence.file = { savedSha256: digest(savedBytes), version: doc.version, saveOrdinal: saveCount + 1,
      opensBefore: beforeOpen, opensAfter: dialogCounts().opens, saveCompleted: save.completed, documentWrite: structuredClone(save.documentWrite) };
    evidence.completed = true;
    return { document: doc, savedBytes };
  } finally { try { rasterComparison?.clear(); } catch { /* Preserve the original workflow failure. */ } }
};
