'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Original two-prism browsing acceptance. Only real CDP pointer/keyboard input
// changes selection or disclosure state; evaluation observes DOM/worker results.
module.exports = function bodyCatalogWorkflow(c) {
  const { expected, input, evaluate, observe, waitFor, pointer, key, captureCatalog, checks, check, canonical, digest,
    protocolResponses, consoleErrors, failedRequests, ipc, initialReadyMs, dialogCounts } = c;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + quote(JSON.stringify(v)) + ')').join(',') + ')');
  const ROOT = '.tree-document', FOLDER = '.part-body-catalog-toggle', CONTENT = '#part-body-catalog-content';
  const ENTRY = '.part-body-catalog .body-catalog-entry', HOST = '.viewport-canvas[aria-label="Vista 3D de la pieza"]';
  const row = i => ENTRY + ':nth-child(' + (i + 1) + ')';
  const interactions = [], layouts = [], native = [];
  const evidence = { partBodyCatalog: { interactions, layouts, native } }; checks.push(evidence);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const history = () => page(() => ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
    const matches = [...document.querySelectorAll('button')].filter(e => e.title === title);
    if (matches.length !== 1) throw Error('One exact history control required');
    return { title, disabled: matches[0].disabled };
  }));
  async function inspect(selector) {
    return page(selector => {
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1) return { count: matches.length };
      const e = matches[0], r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      const clipping = [];
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
        if (clipping.length < 12 && (p.matches('.body-catalog-entry,.body-list,.part-body-catalog,.tree,.manager') || /(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)))
          clipping.push({ tag: p.tagName, className: p.className, rect: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
            clientWidth: p.clientWidth, scrollWidth: p.scrollWidth, clientHeight: p.clientHeight, scrollHeight: p.scrollHeight,
            scrollLeft: p.scrollLeft, scrollTop: p.scrollTop, overflowX: s.overflowX, overflowY: s.overflowY });
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        clip: { left, top, right, bottom }, clipping, clientWidth: e.clientWidth, scrollWidth: e.scrollWidth,
        hitTarget: hit ? { tag: hit.tagName, className: typeof hit.className === 'string' ? hit.className : null,
          label: hit.getAttribute('aria-label'), title: hit.getAttribute('title'), own: hit === e || e.contains(hit) } : null,
        available: !e.matches(':disabled') && !e.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)),
        focused: document.activeElement === e };
    }, selector);
  }
  async function press(selector, double = false) {
    await page(selector => {
      const matches = document.querySelectorAll(selector);
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One visible control required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector);
    let previous, since = 0;
    const target = await waitFor('stationary catalog target ' + selector, async () => {
      const state = await inspect(selector), signature = canonical({ ...state, focused: undefined });
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector)); throw error; });
    await pointer('mouseMoved', target.point);
    const current = await inspect(selector);
    check(current.available && canonical(current.rect) === canonical(target.rect), 'Current contained catalog target before actual pointer press');
    for (const clickCount of double ? [1, 2] : [1]) {
      await pointer('mousePressed', target.point, 1, clickCount); await pointer('mouseReleased', target.point, 0, clickCount);
    }
    interactions.push({ kind: double ? 'CDP double click' : 'CDP click', selector, point: target.point });
  }
  async function keyboard(value, shift = false) {
    await key(value, shift); interactions.push({ kind: 'CDP keyboard', key: value, shift });
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  async function focused(selector) {
    await waitFor('native keyboard focus ' + selector, () => page(selector => document.activeElement?.matches(selector), selector))
      .catch(async error => { error.message += '; focus=' + JSON.stringify(await page(() => {
        const e = document.activeElement, r = e?.getBoundingClientRect();
        return { tag: e?.tagName, label: e?.getAttribute('aria-label'), title: e?.getAttribute('title'),
          hiddenAncestor: !!e?.closest('[hidden]'), rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null };
      })); throw error; });
  }
  function geometry(record, phase) {
    check(record.response?.ok, 'Successful original body build: ' + phase);
    const result = record.response.value;
    check(result.bodyCatalogActive && result.bodies.length === 2 && result.featureErrors.length === 0
      && canonical(result.warnings) === canonical(['La pieza contiene 2 sólidos separados.']), 'Exactly two original healthy solids');
    for (const [index, id] of ['a', 'b'].entries()) {
      const matches = result.bodies.filter(b => b.ref.bodyId === 'workflow-body-' + id && b.ref.sourceFeatureId === 'create-' + id);
      check(matches.length === 1, 'Exact current original body owner ' + id);
      const body = matches[0];
      check(Number.isFinite(body.volume) && Math.abs(body.volume - 240) <= 5e-6
        && Number.isFinite(body.meshAreaMm2) && Math.abs(body.meshAreaMm2 - 248) <= 5e-6, 'Literal prism V240 and planar mesh area248');
      for (const [side, wanted] of [['min', [index * 20, 0, 0]], ['max', [index * 20 + 10, 6, 4]]])
        check(wanted.every((v, axis) => Number.isFinite(body.bounds[side][axis]) && Math.abs(body.bounds[side][axis] - v) <= 5e-6), 'Literal prism bounds ' + side);
    }
    native.push({ phase, serial: record.serial, bodies: result.bodies });
  }
  async function built(boundary, phase) {
    const record = await waitFor('current original build ' + phase, async () => {
      const state = await observe(); check(state.workerErrors.length === 0, 'No worker errors during catalog workflow');
      return state.builds.filter(r => r.serial > boundary && canonical(r.features) === canonical(expected.features) && r.response).at(-1);
    });
    geometry(record, phase);
    await waitFor('idle original catalog ' + phase, () => page(() => !document.querySelector('.property-manager')
      && document.querySelector('.statusbar')?.textContent.includes('Listo') && !!document.querySelector('.part-body-catalog-toggle')));
    return record;
  }
  async function invariant() {
    const state = await observe();
    check(state.workerErrors.length === 0, 'No worker errors during presentation-only actions');
    return { serial: state.serial, builds: digest(canonical(state.builds)), recovery: await recovery(), history: await history() };
  }
  async function selection(ids) {
    await waitFor('exact body selection ' + ids.join(','), () => page((host, ids) => {
      const refs = JSON.parse(document.querySelector(host)?.getAttribute('data-part-selected-bodies') || '[]');
      return refs.length === ids.length && refs.every((ref, i) => ref.bodyId === 'workflow-body-' + ids[i] && ref.sourceFeatureId === 'create-' + ids[i]);
    }, HOST, ids));
  }
  async function layout(phase) {
    const state = await page(() => {
      const tree = document.querySelector('.tree'), folder = document.querySelector('.part-body-catalog'), content = document.querySelector('#part-body-catalog-content');
      const root = document.querySelector('.tree-document'), feature = document.querySelector('[data-feature-id="create-a"]');
      if (!tree || !folder || !content || !root || !feature) throw Error('Complete body catalog hierarchy required');
      const tr = tree.getBoundingClientRect(), fr = feature.getBoundingClientRect();
      return { contentSize: [innerWidth, innerHeight], treeHeight: tr.height, featureOffset: fr.top - tr.top + tree.scrollTop,
        featureVisible: fr.top >= tr.top && fr.bottom <= tr.bottom, featureTop: fr.top,
        rows: [...folder.querySelectorAll('.body-row')].map(e => ({ height: e.getBoundingClientRect().height, checked: e.querySelector('input')?.checked })),
        expanded: folder.querySelector('button')?.getAttribute('aria-expanded'), hidden: content.hidden,
        insideTree: tree.contains(folder), rootBeforeFolder: !!(root.compareDocumentPosition(folder) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    layouts.push({ phase, ...state }); return state;
  }
  return async () => {
    const originalBytes = await fsp.readFile(input);
    check(canonical(JSON.parse(originalBytes).features) === canonical(expected.features), 'Original named two-prism fixture');
    await waitFor('original document file controls ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let boundary = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button');
    await built(boundary, 'opened');
    await require('./desktop-command-header-layout.cjs')({ page, check, checks }, 'body-catalog-initial-before-reveal', 'part');
    const baseline = await invariant(), initial = await layout('initial-before-reveal');
    check(initial.insideTree && initial.rootBeforeFolder && initial.expanded === 'true' && !initial.hidden
      && initial.rows.length === 2 && initial.rows.every(r => r.height >= 28 && r.height <= 29 && !r.checked), 'Initially expanded compact catalog under document root with two 28px rows');
    const initialTargets = [];
    for (const i of [0, 1]) initialTargets.push({ entry: i, row: await inspect(row(i) + ' > .body-row'), summary: await inspect(row(i) + ' summary') });
    layouts.push({ phase: 'initial-target-diagnostics', targets: initialTargets });
    for (const target of initialTargets) check(target.row.available && target.summary.available,
      'Initial body row and separate details target fully contained and hit-tested: ' + JSON.stringify(target));
    await captureCatalog('initial');
    await press(row(0) + ' input'); await selection(['a']);
    await keyboard('Tab'); await focused(row(0) + ' summary');
    const detailTarget = await inspect(row(0) + ' summary');
    check(detailTarget.rect.width >= 28 && detailTarget.rect.height >= 28, 'Details keyboard target is at least28px');
    await keyboard('Enter');
    await waitFor('native details opened by Enter', () => page(selector => document.querySelector(selector)?.open === true, row(0) + ' details'));
    await keyboard('Tab'); await focused(row(0) + ' .body-catalog-details-content');
    const detail = await inspect(row(0) + ' .body-catalog-details-content');
    const detailText = await page(selector => { const e = document.querySelector(selector), strong = e.querySelector('strong'), volume = e.querySelector('span');
      const r = e.getBoundingClientRect();
      return { name: strong.textContent, volume: volume.textContent, visible: [strong, volume].every(item => {
        const b = item.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom;
      }) }; }, row(0) + ' .body-catalog-details-content');
    check(detail.available && detailText.visible && detailText.name === expected.features.find(f => f.id === 'create-a').name
      && detailText.volume === 'Volumen: 240 mm³', 'Keyboard reveals readable full original name and measured volume');
    const secondWithDetails = { row: await inspect(row(1) + ' > .body-row'), summary: await inspect(row(1) + ' summary') };
    layouts.push({ phase: 'second-body-with-first-details-open', ...secondWithDetails });
    check(secondWithDetails.row.available && secondWithDetails.summary.available,
      'Opening the first original body details keeps the second body and its information target fully visible in the same tree');
    await captureCatalog('details');
    await keyboard('Tab', true); await focused(row(0) + ' summary'); await keyboard(' ');
    await waitFor('native details closed by Space', () => page(selector => document.querySelector(selector)?.open === false, row(0) + ' details'));
    await press(row(1) + ' input'); await selection(['a', 'b']);
    await press(row(1) + ' input'); await selection(['a']);
    check(canonical(await invariant()) === canonical(baseline), 'Pointer selection and keyboard details preserve native history, geometry and recovery');

    const expanded = await layout('before-folder-collapse'); await press(FOLDER);
    const collapsed = await layout('folder-collapsed');
    check(collapsed.hidden && collapsed.expanded === 'false' && Math.abs(collapsed.treeHeight - expanded.treeHeight) <= 1
      && expanded.featureOffset - collapsed.featureOffset >= 55, 'Collapsing catalog gains feature space inside the unchanged tree frame');
    await selection(['a']); await focused(FOLDER); await keyboard('Tab');
    check(await page(content => !document.querySelector(content).contains(document.activeElement), CONTENT), 'Native Tab bypasses hidden catalog controls');
    await keyboard('Tab', true); await focused(FOLDER); await keyboard(' ');
    await waitFor('folder expanded by Space', () => page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true', FOLDER));
    await selection(['a']);
    await press(ROOT); await focused(ROOT);
    check(await page(() => document.querySelector('#part-document-tree-content')?.hidden === true
      && document.querySelector('.tree-document')?.getAttribute('aria-expanded') === 'false'), 'Document disclosure hides mounted catalog and features');
    await selection(['a']); await keyboard('Tab');
    check(await page(() => !document.querySelector('#part-document-tree-content').contains(document.activeElement)), 'Native Tab bypasses all collapsed document descendants');
    await keyboard('Tab', true); await focused(ROOT); await keyboard('Enter');
    await waitFor('document expanded by Enter', () => page(() => document.querySelector('.tree-document')?.getAttribute('aria-expanded') === 'true'));
    await selection(['a']);
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true', FOLDER), 'Document re-expansion retains folder state');
    check(await page(selector => { const inputs = [...document.querySelectorAll(selector + ' input')];
      return inputs.length === 2 && inputs[0].checked && !inputs[1].checked;
    }, ENTRY), 'Both disclosure levels retain checked A and unchecked B in the mounted rows');
    check(canonical(await invariant()) === canonical(baseline), 'Both disclosure levels preserve geometry, recovery and history without worker requests');

    await press('[data-feature-id="create-b"]', true);
    await waitFor('lower original feature edit ready', () => page(name => document.querySelector('[aria-label="Nombre de operación"]')?.value === name
      && !!document.querySelector('.property-manager-extrude') && !document.querySelector('button[title="Aceptar operación"]')?.disabled,
    expected.features.find(f => f.id === 'create-b').name));
    check(await recovery() === baseline.recovery, 'Double-click opens the original lower feature without committing');
    boundary = (await observe()).serial; await press('button[title="Cancelar operación"]');
    await built(boundary, 'edit-cancelled');
    check(await recovery() === baseline.recovery && canonical(await history()) === canonical(baseline.history), 'Cancel restores original recovery and history');
    await press(FOLDER);
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', FOLDER), 'Catalog is closed before same-ID replacement');
    boundary = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]'); await built(boundary, 'same-id-reopened');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true', FOLDER)
      && await recovery() === baseline.recovery, 'Reopening identical original document resets folder open and preserves document identity/recovery');
    check((await fsp.readFile(input)).equals(originalBytes), 'Original fixture bytes remain unchanged');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 0 && dialogCounts().geometryExports === 0, 'Exactly two original opens; no Save/export');
    const final = await observe();
    check(!final.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No worker, console, resource or unfinished IPC errors');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Real production worker and WASM loaded');
    evidence.partBodyCatalog.originalSha256 = digest(originalBytes);
    evidence.partBodyCatalog.limits = 'Original two-prism catalog only; V240/planar-mesh A248 and literal bounds tolerance5e-6. Actual pointer/Tab/Enter/Space; reveal uses scrollIntoView. No CAD editing commit, export or new finishing coverage; deadlines unchanged.';
    await captureCatalog('final');
  };
};
