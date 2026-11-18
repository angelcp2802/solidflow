'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Browser scrolling and real Chromium input only; no dispatched dblclick or
// application state/layout injection. The caller retains its geometry oracles.
module.exports = async function partTreeDoubleClick(context) {
  const { feature, saved, output, evaluate, observe, waitFor, pointer, press, ready,
    verifyOpened, verifyCancelled, checks, check, canonical, digest } = context;
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const clear = 'button[aria-label="Limpiar selección de pieza"]';
  if (await page(selector => document.querySelector(selector)?.disabled === false, clear)) await press(clear);
  await waitFor('empty stable part tree selection strip', () => page(() => {
    const tools = document.querySelector('.selection-tools'), buttons = tools?.querySelectorAll('button');
    return !!tools && buttons?.length === 3 && [...buttons].every(button => button.disabled)
      && !document.querySelector('.tree-row[data-feature-id].selected') && !document.querySelector('.face-selection-summary');
  }));
  const bytes = await fsp.readFile(output), initialRecovery = await recovery();
  check(canonical(JSON.parse(initialRecovery)) === canonical(saved), 'Tree double-click starts from exact saved recovery');
  const before = await observe.counters();
  const history = () => page(() => ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
    const button = document.querySelector('button[title="' + title + '"]');
    if (!button) throw Error('History control missing'); return { title, disabled: button.disabled };
  }));
  const initialHistory = await history();
  await page(id => {
    const rows = [...document.querySelectorAll('.tree-row[data-feature-id]')].filter(row => row.dataset.featureId === id && !row.dataset.parentFeatureId);
    if (rows.length !== 1 || rows[0].closest('[hidden]')) throw Error('One visible root feature row required');
    rows[0].scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'instant' });
  }, feature.id);
  const inspect = () => page(id => {
    const rows = [...document.querySelectorAll('.tree-row[data-feature-id]')].filter(row => row.dataset.featureId === id && !row.dataset.parentFeatureId);
    if (rows.length !== 1) throw Error('One root feature row required');
    const row = rows[0], tree = row.closest('.tree'), tools = document.querySelector('.selection-tools');
    if (!tree || !tools) throw Error('Mounted tree and selection strip required');
    const r = row.getBoundingClientRect(), t = tree.getBoundingClientRect(), a = tools.getBoundingClientRect();
    const point = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, hit = document.elementFromPoint(point.x, point.y);
    const rect = value => ({ x: value.x, y: value.y, width: value.width, height: value.height });
    return { point, layout: { row: rect(r), tree: rect(t), strip: rect(a), scrollTop: tree.scrollTop, clientHeight: tree.clientHeight },
      lowerGap: t.bottom - r.bottom, scrollable: tree.scrollHeight > tree.clientHeight,
      viewport: { width: innerWidth, height: innerHeight }, scrollHeight: tree.scrollHeight,
      maxScrollTop: tree.scrollHeight - tree.clientHeight, targetBottomOffset: r.bottom - t.top + tree.scrollTop,
      visible: !row.closest('[hidden]') && r.width > 0 && r.height > 0 && r.top >= t.top && r.bottom <= t.bottom
        && t.top >= 0 && t.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && !!hit && (hit === row || row.contains(hit)),
      selected: row.classList.contains('selected'), stripDisabled: [...tools.querySelectorAll('button')].map(button => button.disabled),
      hit: hit ? { tag: hit.tagName, class: typeof hit.className === 'string' ? hit.className : '' } : null };
  }, feature.id);
  let previous, lastInspection, lastPredicates, stationarySince = 0;
  const initial = await waitFor('stationary unselected feature at lower tree edge', async () => {
    const state = lastInspection = await inspect(), key = canonical(state);
    if (key !== previous) { previous = key; stationarySince = Date.now(); }
    lastPredicates = { visible: state.visible, unselected: !state.selected, scrollable: state.scrollable,
      gapInRange: state.lowerGap >= 0 && state.lowerGap <= 2, stableMs: Date.now() - stationarySince };
    return state.visible && !state.selected && state.scrollable && state.lowerGap >= 0 && state.lowerGap <= 2
      && Date.now() - stationarySince >= 120 ? state : false;
  }).catch(error => {
    const diagnostic = { lastInspection, predicates: lastPredicates };
    checks.push({ partTreeLowerEdgeFailure: diagnostic });
    error.message += '; lowerEdge=' + JSON.stringify(diagnostic); throw error;
  });
  await pointer('mouseMoved', initial.point);
  check(canonical(await inspect()) === canonical(initial), 'Lower-edge feature target is unchanged before the first click');
  const firstClickAt = Date.now();
  await pointer('mousePressed', initial.point, 1, 1); await pointer('mouseReleased', initial.point, 0, 1);
  const selected = await waitFor('first click selects without shifting the lower-edge row', async () => {
    const state = await inspect(); return state.selected ? state : false;
  });
  check(selected.visible && canonical(selected.layout) === canonical(initial.layout)
    && selected.stripDisabled.length === 3 && selected.stripDisabled.every(disabled => !disabled),
  'First selection preserves exact tree/row/strip geometry and enables existing actions');
  check((await observe.counters()).serial === before.serial && await recovery() === initialRecovery
    && canonical(await history()) === canonical(initialHistory), 'First tree click changes no CAD request, recovery or history');
  const beforeSecond = await inspect();
  check(beforeSecond.visible && beforeSecond.selected && canonical(beforeSecond.layout) === canonical(initial.layout),
    'The second actual click still hits the same selected lower-edge row');
  const secondClickAfterMs = Date.now() - firstClickAt;
  await pointer('mousePressed', initial.point, 1, 2); await pointer('mouseReleased', initial.point, 0, 2);
  await waitFor('native double-click opens the exact existing operation', () => page(feature => {
    return !!document.querySelector('.property-manager')
      && document.querySelector('input[aria-label="Nombre de operación"]')?.value === feature.name
      && document.querySelector('select[aria-label="Croquis de la operación"]')?.value === feature.sketchId;
  }, feature));
  await ready();
  await verifyOpened(before.serial);
  check(await recovery() === initialRecovery, 'Opening the existing operation leaves committed recovery unchanged');
  const beforeCancel = await observe.counters();
  await press('button[title="Cancelar operación"]');
  await waitFor('double-click editor Cancel returns to the tree', () => page(() => !document.querySelector('.property-manager')
    && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  await verifyCancelled(beforeCancel.serial);
  check(await recovery() === initialRecovery && canonical(await history()) === canonical(initialHistory)
    && (await fsp.readFile(output)).equals(bytes), 'Double-click edit and Cancel retain exact document, recovery, history and saved bytes');
  checks.push({ partTreeDoubleClick: { featureId: feature.id, initial: initial.layout, selected: selected.layout, secondClickAfterMs,
    initialRequestSerial: before.serial, recoverySha256: digest(initialRecovery), savedSha256: digest(bytes),
    input: 'DOM scrollIntoView at lower edge, actual CDP left clicks with clickCount 1 then 2 at the same point; actual Cancel',
    exactLayoutRetained: true, exactCancelRetained: true,
    evidenceLimits: 'One original saved part at the current viewport, starting without face selection. Does not establish other platform or face-summary transition behavior.' } });
};
