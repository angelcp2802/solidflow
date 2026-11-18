'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Real controls, worker previews and file IPC. Literal prism corners and plane
// normals are independent of the application's reference/solver helpers.
module.exports = function originOpposedWorkflow(c) {
  c = require('./desktop-assembly-navigation.cjs').withNavigation(c);
  const assemblyNavigation = c.assemblyNavigation;
  const { configured, expected, input, output, evaluate, observe, waitFor, pointer, asideWheel, capture, checks,
    consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = c;
  const ROOT = configured ? '.configured-assembly-workspace' : '.assembly-app';
  const NAV = configured ? ':is([aria-label="Archivo del ensamblaje configurado"],[aria-label="Comandos del ensamblaje configurado"])' : ':is(.assembly-toolbar, .assembly-quickbar)';
  const FORM = '[aria-label="Editar relación del estado"]';
  const BUILD = configured ? 'build-configured-assembly' : 'build-assembly';
  const phases = [], selectionGestures = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = configured ? require('./desktop-configured-navigation.cjs')({page,waitFor,actualControl}) : null;
  const near = (actual, wanted, tolerance, name) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    name + ': actual=' + actual + ', expected=' + wanted);
  async function actualControl(selector, text = null, allowAsideWheel = false) {
    if (navigation) await navigation.reveal(selector, text ?? ''); else await assemblyNavigation.reveal(selector, text ?? '');
    const inspect = () => page((selector, text) => {
      const matches = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (matches.length !== 1 || matches[0].disabled || matches[0].closest('[hidden]')) throw Error('One visible enabled actual control required: ' + selector);
      const e = matches[0], r = e.getBoundingClientRect(), aside = e.closest('[aria-label="Inspector del ensamblaje configurado"],.assembly-manager-panel'), a = aside?.getBoundingClientRect();
      const top = Math.max(0, a ? a.top + aside.clientTop : 0), bottom = Math.min(innerHeight, a ? a.top + aside.clientTop + aside.clientHeight : innerHeight);
      const x = r.x + r.width / 2, y = r.y + r.height / 2, hit = document.elementFromPoint(x, y);
      const viewport = e.closest('.assembly-viewport'), canvas = viewport?.querySelector('canvas'), cr = canvas?.getBoundingClientRect();
      const viewportReady = !viewport || !!cr && Math.abs(cr.width - viewport.clientWidth) < 1 && Math.abs(cr.height - viewport.clientHeight) < 1;
      return { point: { x, y }, visible: r.width > 0 && r.height > 0 && r.left >= Math.max(0, a?.left ?? 0) && r.right <= Math.min(innerWidth, a?.right ?? innerWidth)
        && r.top >= top && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)), aside: !!aside, scrollTop: aside?.scrollTop ?? 0,
        delta: r.top < top ? -200 : 200, wheelPoint: aside ? { x: a.left + Math.min(100, a.width / 2), y: (top + bottom) / 2 } : null,
        rect: { top: r.top, bottom: r.bottom }, clip: { top, bottom }, originKey: e.getAttribute('data-origin-key'), viewportReady };
    }, selector, text);
    const stationary = async () => {
      let previous = null, stableSince = 0;
      return waitFor('stationary actual origin selection target', async () => {
        const next = await inspect(), key = JSON.stringify(next);
        if (key !== previous) { previous = key; stableSince = Date.now(); return false; }
        return next.viewportReady && Date.now() - stableSince >= 120 ? next : false;
      });
    };
    let state = await stationary();
    for (let step = 0; !state.visible && allowAsideWheel && state.aside && step < 24; step++) {
      check(typeof asideWheel === 'function', 'Bounded actual inspector wheel available');
      const old = state.scrollTop; await asideWheel(state.wheelPoint, state.delta);
      await waitFor('actual origin inspector wheel movement', async () => { const next = await inspect(); return next.scrollTop !== old || next.visible; });
      state = await stationary();
    }
    check(state.visible, 'Actual origin control is fully visible and unobscured: ' + JSON.stringify({ selector, text, ...state }));
    if (state.originKey) {
      const layout = await page(() => {
        const viewport = document.querySelector('.assembly-viewport'), boundary = viewport.getBoundingClientRect();
        const toolbars = [...viewport.parentElement.querySelectorAll(':scope > .compact-viewport-toolbar')];
        const tr = toolbars.length === 1 ? toolbars[0].getBoundingClientRect() : null;
        const toolbar = tr ? { left: tr.left, top: tr.top, right: tr.right, bottom: tr.bottom, width: tr.width, height: tr.height } : null;
        const labels = [...viewport.querySelectorAll('button[data-origin-key]')].map(button => {
          const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { key: button.getAttribute('data-origin-key'), left: r.left, top: r.top, right: r.right, bottom: r.bottom, relativeTop: r.top - boundary.top,
            inBounds: r.width > 0 && r.height > 0 && r.left >= boundary.left && r.right <= boundary.right && r.top >= boundary.top && r.bottom <= boundary.bottom,
            ownHit: hit === button || button.contains(hit), hitTarget: hit ? { tag: hit.tagName,
              role: hit.getAttribute('role'), label: hit.getAttribute('aria-label')?.slice(0, 160) ?? null,
              className: hit.getAttribute('class')?.slice(0, 160) ?? null } : null };
        });
        return { labels, toolbar, toolbarCount: toolbars.length, overflow: !!viewport.querySelector('.assembly-origin-overflow') };
      });
      check(layout.labels.length > 0 && !layout.overflow && layout.labels.every(row => row.inBounds && row.ownHit),
        'Original origin fixture labels remain inside the viewport and individually hittable: ' + JSON.stringify(layout));
      check(layout.labels.every((a, i) => layout.labels.slice(i + 1).every(b => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)),
        'Distinct origin label rectangles do not overlap on the original fixture');
      check(layout.toolbarCount === 1 && layout.toolbar && layout.toolbar.width > 0 && layout.toolbar.height > 0
        && layout.labels.every(row => row.relativeTop >= 48 && (row.right <= layout.toolbar.left || layout.toolbar.right <= row.left
          || row.bottom <= layout.toolbar.top || layout.toolbar.bottom <= row.top)),
        'Visible origin labels reserve the toolbar band and do not cover its actual rectangle: ' + JSON.stringify(layout));
      selectionGestures.push({ kind: 'origin-label-layout', labels: layout.labels, toolbar: layout.toolbar });
    }
    await pointer('mouseMoved', state.point);
    const hit = await inspect();
    let pointerDiagnostic = null;
    if (!(hit.visible && hit.scrollTop === state.scrollTop && hit.point.x === state.point.x && hit.point.y === state.point.y)) {
      pointerDiagnostic = await page((selector, text, point) => {
        const elements = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text), e = elements[0];
        const describe = node => {
          if (!node) return null;
          const r = node.getBoundingClientRect(), s = getComputedStyle(node);
          return { tag: node.tagName, id: node.id, className: node.getAttribute('class'), label: node.getAttribute('aria-label'),
            rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, scrollTop: node.scrollTop, scrollLeft: node.scrollLeft,
            clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
            overflowX: s.overflowX, overflowY: s.overflowY, scrollBehavior: s.scrollBehavior, position: s.position, transform: s.transform,
            transition: s.transition, hover: node.matches(':hover'), focus: node === document.activeElement };
        };
        const ancestors = []; for (let p = e?.parentElement; p && ancestors.length < 8; p = p.parentElement) ancestors.push(describe(p));
        return { targetCount: elements.length, target: describe(e), focus: describe(document.activeElement), ancestors,
          hitAtOriginalPoint: describe(document.elementFromPoint(point.x, point.y)),
          originsOpen: document.querySelector('#assembly-relation-origins')?.open,
          selectedPanel: document.querySelector('.assembly-manager-tabs [aria-selected="true"]')?.id };
      }, selector, text, state.point);
      selectionGestures.push({ kind: 'origin-target-moved-before-press', selector, text, before: state, after: hit, diagnostic: pointerDiagnostic });
    }
    check(hit.visible && hit.scrollTop === state.scrollTop && hit.point.x === state.point.x && hit.point.y === state.point.y,
      'Actual target remains stationary immediately before press: ' + JSON.stringify({ selector, text, before: state, after: hit, diagnostic: pointerDiagnostic }));
    await pointer('mousePressed', state.point, 1);
    const pressed = await inspect();
    check(pressed.visible && pressed.point.x === state.point.x && pressed.point.y === state.point.y, 'Actual origin control remains stationary while pressed: ' + JSON.stringify({ before: state, pressed }));
    await pointer('mouseReleased', state.point, 0);
    selectionGestures.push({ kind: 'control', selector, text, point: state.point, scrollTop: state.scrollTop, originKey: state.originKey });
  }
  const originMode = () => page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking'));
  async function references() {
    return page(configured => [1, 2].map(slot => configured
      ? document.querySelector('[aria-label="Referencia ' + slot + ' de relación configurada"]')?.value
      : document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"] span')?.textContent), configured);
  }
  async function selectMoving() {
    if (navigation) await navigation.pane('model'); else await assemblyNavigation.panel('components');
    await actualControl(configured ? 'button[aria-label="Seleccionar componente moving"]' : '.assembly-tree [role="treeitem"]', configured ? null : 'movingorigin-axis-prism · r1', true);
    await waitFor('actual moving component selection', () => page(configured => configured
      ? document.querySelector('button[aria-label="Seleccionar componente moving"]')?.getAttribute('aria-pressed') === 'true'
      : [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].some(e => e.getAttribute('aria-selected') === 'true' && e.textContent.trim() === 'movingorigin-axis-prism · r1'), configured));
  }
  async function showOrigins() {
    for (const selector of configured ? ['[aria-label="Mostrar ejes de origen configurados"]', '[aria-label="Mostrar planos de origen configurados"]']
      : ['.assembly-origin-tools label:nth-of-type(1) input', '.assembly-origin-tools label:nth-of-type(2) input']) {
      if (!await page(selector => document.querySelector(selector)?.checked, selector)) await actualControl(selector, null, true);
      check(await page(selector => document.querySelector(selector)?.checked === true, selector), 'Actual visibility checkbox enabled');
    }
  }
  async function armOrigin(slot) {
    if (configured) {
      await navigation.pane('relation');
      await actualControl('button[aria-label="Seleccionar Referencia ' + slot + ' por origen en vista configurada"]', null, true);
    } else {
      await assemblyNavigation.panel('relations');
      await actualControl('button[aria-label="Referencia ' + slot + ' de la relación"]', null, true);
      await actualControl('button[aria-label="Seleccionar orígenes"]', null, true);
    }
    await waitFor('actual origin role armed', async () => await originMode() === 'origin' && await page((configured, slot) => configured
      ? document.querySelector('button[aria-label="Seleccionar Referencia ' + slot + ' por origen en vista configurada"]')?.getAttribute('aria-pressed') === 'true'
      : document.querySelector('button[aria-label="Referencia ' + slot + ' de la relación"]')?.classList.contains('active'), configured, slot));
  }
  async function originLabel(slot, kind, value, owner, accepted = true) {
    const before = (await observe()).serial, original = await references();
    const label = 'Seleccionar ' + (kind === 'principal-axis' ? 'Eje ' : 'Plano ') + value + ' · ' + (owner ?? 'Raíz');
    const wanted = { kind, component: owner ? { occurrencePath: [owner], definition: { id: 'origin-axis-prism', revision: 'r1' } } : null,
      [kind === 'principal-axis' ? 'axis' : 'plane']: value };
    const key = JSON.stringify([kind, owner ? [[owner], 'origin-axis-prism', 'r1'] : null, value]);
    check(await page((label, key) => document.querySelector('button[aria-label="' + label + '"]')?.getAttribute('data-origin-key') === key, label, key), 'Projected label has exact literal scope/owner/datum identity');
    // Temporary passive DOM observation only. No React state, handler guards,
    // native references or click delivery are supplied by this diagnostic.
    await page(key => {
      if (window.__solidflowOriginLabelEventProbe) throw Error('Previous origin event probe was not removed');
      const probe = { events: [], dropped: 0, types: ['pointerdown', 'pointerup', 'click', 'pointercancel'] };
      probe.label = [...document.querySelectorAll('button[data-origin-key]')].find(e => e.getAttribute('data-origin-key') === key);
      if (!probe.label) throw Error('One current origin label required for event observation');
      probe.listener = event => {
        if (probe.events.length >= 16) { probe.dropped++; return; }
        const label = [...document.querySelectorAll('button[data-origin-key]')].find(e => e.getAttribute('data-origin-key') === key);
        const r = label?.getBoundingClientRect(), host = label?.closest('.assembly-viewport');
        const identity = node => node instanceof Element ? { tag: node.tagName, id: node.id,
          className: node.getAttribute('class')?.slice(0, 160) ?? null, key: node.closest('[data-origin-key]')?.getAttribute('data-origin-key') ?? null,
          label: node.getAttribute('aria-label')?.slice(0, 160) ?? null } : { nodeName: node?.nodeName ?? null };
        const current = event.currentTarget instanceof Element ? event.currentTarget : null, currentRect = current?.getBoundingClientRect(), currentHost = current?.closest('.assembly-viewport');
        probe.events.push({ type: event.type, timeStamp: event.timeStamp, trusted: event.isTrusted, detail: event.detail,
          target: identity(event.target), currentTarget: { ...identity(event.currentTarget), disabled: current?.disabled ?? null,
            connected: event.currentTarget?.isConnected ?? null, rect: currentRect ? { left: currentRect.left, right: currentRect.right, top: currentRect.top, bottom: currentRect.bottom } : null,
            host: currentHost ? { clientWidth: currentHost.clientWidth, clientHeight: currentHost.clientHeight } : null },
          originalLabelConnected: probe.label.isConnected,
          label: label ? { key: label.getAttribute('data-origin-key'), disabled: label.disabled, connected: label.isConnected,
            rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height },
            host: host ? { clientWidth: host.clientWidth, clientHeight: host.clientHeight } : null } : null });
      };
      window.__solidflowOriginLabelEventProbe = probe;
      for (const type of probe.types) for (const target of [document, probe.label]) target.addEventListener(type, probe.listener, { capture: true, passive: true });
    }, key);
    try {
      await actualControl('button[aria-label="' + label + '"]');
    } finally {
      const events = await page(() => {
        const probe = window.__solidflowOriginLabelEventProbe;
        if (!probe) throw Error('Origin event probe missing during cleanup');
        for (const type of probe.types) for (const target of [document, probe.label]) target.removeEventListener(type, probe.listener, true);
        delete window.__solidflowOriginLabelEventProbe;
        return { events: probe.events, dropped: probe.dropped };
      });
      checks.push({ originLabelEvents: { label, key, slot, ...events } });
    }
    checks.push({ originPress: { label, slot, intended: wanted, observed: await page((configured, label) => ({
      roles: [1, 2].map(slot => configured ? document.querySelector('[aria-label="Referencia ' + slot + ' de relación configurada"]')?.value : document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"] span')?.textContent),
      mode: document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking'),
      status: document.querySelector('.configured-assembly-workspace footer,.assembly-status')?.textContent,
      labelSelected: document.querySelector('button[aria-label="' + label + '"]')?.classList.contains('selected'),
    }), configured, label) } });
    if (accepted) {
      const ownerName = !configured && owner ? expected.occurrences.find(value => value.id === owner)?.name : 'Ámbito actual';
      if (!configured) check(typeof ownerName === 'string' && ownerName.length > 0, 'Exact original origin owner has a display name');
      await waitFor('actual origin assigned to intended role', () => page((configured, slot, wanted, ownerName) => {
        if (configured) { const value = document.querySelector('[aria-label="Referencia ' + slot + ' de relación configurada"]')?.value;
          if (!value) return false; const ref = JSON.parse(value);
          return ref.kind === wanted.kind && ref.axis === wanted.axis && ref.plane === wanted.plane
            && (wanted.component ? JSON.stringify(ref.component?.occurrencePath) === JSON.stringify(wanted.component.occurrencePath)
              && ref.component?.definition.id === wanted.component.definition.id && ref.component?.definition.revision === wanted.component.definition.revision : ref.component === null); }
        const text = ownerName + ' · ' + (wanted.kind === 'principal-axis' ? 'Eje de origen ' + wanted.axis : wanted.plane);
        return document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"] span')?.textContent === text;
      }, configured, slot, wanted, ownerName));
      await waitFor('origin selection ends after assigning one role', async () => await originMode() === '');
      const after = await references(); check(after[slot === 1 ? 1 : 0] === original[slot === 1 ? 1 : 0], 'The other origin role remains unchanged');
      check(await page(key => [...document.querySelectorAll('[data-origin-key]')].some(e => e.getAttribute('data-origin-key') === key && e.classList.contains('selected')), key), 'Accepted current origin is visibly highlighted');
    } else {
      check(canonical(await references()) === canonical(original) && await originMode() === 'origin', 'Incompatible visible plane is rejected without replacing a role or disarming the eligible axis pick');
    }
    check((await observe()).serial === before, 'Origin selection sends no worker solve');
    selectionGestures.push({ kind: accepted ? 'origin-assigned' : 'origin-rejected', slot, reference: wanted });
  }
  async function control(label, value) { await assemblyNavigation.reveal('[aria-label="' + label + '"]');
    if (navigation) await navigation.reveal('[aria-label="' + label + '"]');
    if (!configured && label === 'Orígenes visibles de') {
      await page(label => document.querySelector('[aria-label="' + label + '"]').scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }), label);
      const target = await waitFor('visible current origin owner selector in Relations', () => page(label => {
        const e = document.querySelector('[aria-label="' + label + '"]'), r = e?.getBoundingClientRect(), aside = e?.closest('aside'), a = aside?.getBoundingClientRect();
        if (!e || !r || !a || e.disabled || e.closest('[hidden]') || !e.closest('#assembly-relation-origins')?.open) return false;
        const x = r.left + r.width / 2, y = r.top + r.height / 2, hit = document.elementFromPoint(x, y);
        return r.width > 0 && r.height >= 28 && r.left >= Math.max(0, a.left) && r.right <= Math.min(innerWidth, a.right)
          && r.top >= Math.max(0, a.top + aside.clientTop) && r.bottom <= Math.min(innerHeight, a.top + aside.clientTop + aside.clientHeight)
          && !!hit && (hit === e || e.contains(hit)) ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : false;
      }, label));
      selectionGestures.push({ kind: 'origin-owner-visible-field', label, rect: target, input: 'Visible scripted select setter after DOM scrollIntoView; no keyboard typing claim' });
    }
    await page((label, value) => { const e = document.querySelector('[aria-label="' + label + '"]');
      if (!e || e.disabled) throw Error('Enabled control required: ' + label);
      const p = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Exact enabled option absent: ' + label);
      Object.getOwnPropertyDescriptor(p, 'value').set.call(e, value);
      e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
    }, label, value);
  }
  const serial = async () => (await observe.counters()).serial;
  const button = (text, parent = NAV) => actualControl(parent + ' button', text, true);
  const aria = label => actualControl('button[aria-label="' + label + '"]', null, true);
  const declarations = doc => configured ? doc.catalog[0].configurations.find(s => s.id === 'demo').mateDeclarations ?? [] : doc.mates;
  const fieldLabel = kind => configured ? ({ type: 'Tipo de relación configurada', name: 'Nombre de relación configurada', alignment: 'Alineación de relación configurada' })[kind]
    : ({ type: 'Tipo de relación', name: 'Nombre de la relación', alignment: 'Orientación de la relación' })[kind];
  async function field(kind, value) {
    const label = fieldLabel(kind), selector = '[aria-label="' + label + '"]';
    if (navigation) await navigation.reveal(selector); else await assemblyNavigation.reveal(selector);
    await page(selector => { const e = document.querySelector(selector); if (!e || e.disabled || e.closest('[hidden]')) throw Error('Current visible editable field required');
      e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); }, selector);
    await waitFor('visible field ' + label, () => page(selector => {
      const e = document.querySelector(selector), r = e?.getBoundingClientRect(), hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!r && r.width > 0 && r.height > 0 && !e.disabled && !e.closest('[hidden]') && r.left >= 0 && r.right <= innerWidth
        && r.top >= 0 && r.bottom <= innerHeight && (hit === e || e.contains(hit));
    }, selector));
    await control(label, value);
    check(await page((selector, value) => document.querySelector(selector)?.value === value, selector, value), 'Visible field retains the exact requested value');
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
  function declaration(doc, alignment, name, id) {
    const rows = declarations(doc);
    check(rows.length === (alignment ? 1 : 0), 'Exactly the intended number of ordinary plane declarations');
    if (!alignment) return;
    const mate = rows[0];
    check(typeof mate.id === 'string' && mate.id.length > 0 && (!id || mate.id === id), 'A current generated relation identity survives editing and persistence');
    check(canonical(mate) === canonical({ id: mate.id, name, type: 'coincident', suppressed: false, alignment,
      first: { kind: 'principal-plane', plane: 'XY', component: { occurrencePath: ['moving'], definition: { id: 'origin-axis-prism', revision: 'r1' } } },
      second: { kind: 'principal-plane', plane: 'XY', component: null } }), 'Exact complete declaration and ordered moving/root XY references');
  }
  function geometry(wrapper, doc, alignment, label, name, id) {
    const scene = configured ? wrapper.scene : wrapper;
    declaration(doc, alignment, name, id);
    if (configured) {
      check(wrapper.kind === 'configured-assembly-scene' && wrapper.context.rootConfiguration === 'demo'
        && canonical(JSON.parse(wrapper.context.sourceSignature)) === canonical(doc.source)
        && canonical(JSON.parse(wrapper.context.catalogSignature)) === canonical(doc.catalog), 'Exact current configured native scene context');
      check(canonical(doc.source) === canonical(expected.source), 'Configured edit preserves the full Base source');
      check(canonical(doc.catalog[0].configurations.find(s => s.id === 'untouched')) === canonical(expected.catalog[0].configurations[1]), 'Untouched named state is byte-equivalent');
      const active = doc.catalog[0].configurations.find(s => s.id === 'demo'), wanted = structuredClone(expected);
      if (alignment) {
        check(active.occurrences.length === 1 && active.occurrences[0].occurrenceId === 'moving'
          && canonical(Object.keys(active.occurrences[0]).sort()) === canonical(['occurrenceId', 'pose']), 'Named solve stores exactly one moving pose override and no visibility/fixed/suppression changes');
        const moving = scene.bodies.find(b => canonical(b.component.occurrencePath) === '["moving"]');
        for (const field of ['translation', 'rotation']) active.occurrences[0].pose[field].forEach((value, i) =>
          near(value, moving.worldPose[field][i], 1e-9, 'Saved named pose matches current native placement'));
        const variant = wanted.catalog[0].configurations.find(s => s.id === 'demo');
        variant.occurrences = [{ occurrenceId: 'moving', pose: active.occurrences[0].pose }];
        variant.mateDeclarations = declarations(doc);
      }
      check(canonical(doc) === canonical(wanted), 'Entire configured document differs from original only in the verified named relation and moving pose');
    } else {
      check(canonical(doc.definitions) === canonical(expected.definitions), 'Original embedded definitions remain exact');
      check(canonical(doc.occurrences.find(o => o.id === 'ground')) === canonical(expected.occurrences.find(o => o.id === 'ground')), 'Fixed occurrence declaration and pose remain exact');
      const immutable = value => ({ ...value, updatedAt: null, mates: null, occurrences: value.occurrences.map(o => ({ ...o, pose: null })) });
      check(canonical(immutable(doc)) === canonical(immutable(expected)), 'Complete standard source and occurrence declarations stay exact outside solved poses and relation intent');
    }
    check(scene.solidCount === 2 && scene.prototypeCount === 1 && scene.bodies.length === 2 && !scene.warnings.length, 'Two original native solids without warnings');
    near(scene.volume, 48, 1e-5, 'Independent total volume mm3'); near(scene.area, 104, 1e-5, 'Independent total area mm2');
    for (const owner of ['ground', 'moving']) {
      const rows = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([owner]));
      check(rows.length === 1 && rows[0].component.definition.id === 'origin-axis-prism' && rows[0].component.definition.revision === 'r1', 'Exact placed original source identity');
      const b = rows[0], { translation: t, rotation: q } = b.worldPose, [x, y, z, w] = q;
      check(t.every(Number.isFinite) && q.every(Number.isFinite), 'Finite observed free placement'); near(Math.hypot(...q), 1, 1e-9, 'Unit native rotation');
      near(b.volume, 24, 1e-5, 'Original prism volume'); near(b.area, 52, 1e-5, 'Original prism area');
      if (owner === 'ground') check(canonical(b.worldPose) === canonical({ translation: [-15, 0, 0], rotation: [0, 0, 0, 1] }), 'Fixed native ground world pose remains exact');
      else if (alignment) {
        const normal = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
        near(normal[0], 0, 1e-6, 'Moving XY normal X'); near(normal[1], 0, 1e-6, 'Moving XY normal Y');
        near(normal[2], alignment === 'opposed' ? -1 : 1, 1e-6, 'Independent moving/root normal dot product');
        near(t[2], 0, 1e-6, 'Independent signed root-normal plane separation');
      } else {
        const originalPose = (configured ? expected.source : expected).occurrences.find(o => o.id === owner).pose;
        t.forEach((v, i) => near(v, originalPose.translation[i], 1e-9, 'Original unsolved translation'));
        q.forEach((v, i) => near(v, originalPose.rotation[i], 1e-9, 'Original unsolved rotation after native unit normalization'));
      }
      // The original local rectangle is [0,2] x [0,3], extruded from Z0 to Z4.
      // Use the observed free XY/yaw only as a rigid placement; never infer the
      // source dimensions or a unique free solution from the returned bounds.
      const corners = [0, 2].flatMap(a => [0, 3].flatMap(bb => [0, 4].map(cc => [
        t[0] + (1 - 2 * (y * y + z * z)) * a + 2 * (x * y - w * z) * bb + 2 * (x * z + w * y) * cc,
        t[1] + 2 * (x * y + w * z) * a + (1 - 2 * (x * x + z * z)) * bb + 2 * (y * z - w * x) * cc,
        t[2] + 2 * (x * z - w * y) * a + 2 * (y * z + w * x) * bb + (1 - 2 * (x * x + y * y)) * cc,
      ])));
      for (let axis = 0; axis < 3; axis++) {
        near(b.bounds.min[axis], Math.min(...corners.map(p => p[axis])), 1e-5, 'Literal eight-corner native minimum');
        near(b.bounds.max[axis], Math.max(...corners.map(p => p[axis])), 1e-5, 'Literal eight-corner native maximum');
      }
    }
    phases.push({ label, alignment, volume: scene.volume, area: scene.area, members: scene.bodies.map(b => ({ path: b.component.occurrencePath, pose: b.worldPose, bounds: b.bounds })),
      documentSha256: digest(canonical(doc)), declarations: declarations(doc) });
  }
  function ready(row, baseline, alignment, label, name, id) {
    const v = row.response.value;
    check(v.hasToken, 'Actual preview retains private Apply authority');
    if (configured) {
      check(v.kind === 'configured-assembly-preview' && v.candidateGeneration > v.generation
        && canonical(row.current.document) === canonical(baseline) && v.verification.accepted && v.verification.status === 'verified', 'Current configured candidate is verified against exact committed baseline');
      check(v.verification.reports.length === 1 && v.verification.reports.every(r => !r.passive && r.measurement.status === 'ok' && r.measurement.satisfied), 'One actual physical plane verification');
      check(v.states.length === 1 && v.states[0].solver.localDOF === 3, 'Coincident planes preserve three free degrees of freedom');
    } else check(v.status === 'ready' && v.checks.length === 1 && v.checks.every(r => r.satisfied)
      && v.scopes.length === 1 && !v.scopes[0].temporaryAnchor && v.scopes[0].result.localDOF === 3, 'Verified standard plane coincidence leaves exactly three free degrees of freedom');
    geometry(v.scene, v.document, alignment, label, name, id); return v.document;
  }
  async function preview(baseline, alignment, name, id, editing, label) {
    const before = await serial();
    if (configured) await button('Vista previa de relación configurada', FORM);
    else if (editing) await aria('Vista previa de la relación editada');
    else await button('Vista previa de la nueva relación', ROOT);
    const row = await response(before, configured ? 'preview-configured-assembly-relation-edit' : 'preview-assembly');
    const doc = ready(row, baseline, alignment, label, name, id); await recovery(baseline); return doc;
  }
  async function apply(candidate, alignment, name, id, label) {
    const before = await serial();
    if (configured) await button('Aplicar configuración'); else await aria('Aplicar ensamblaje');
    const row = await response(before, configured ? 'apply-configured-assembly' : 'apply-assembly'), doc = row.response.value.document;
    const untimed = value => { const { updatedAt, ...rest } = value; return rest; };
    check(canonical(untimed(doc)) === canonical(untimed(candidate)), 'Apply publishes exactly the authenticated document');
    const scene = configured ? (await response(before, BUILD)).response.value : row.response.value.scene;
    geometry(scene, doc, alignment, label, name, id); await recovery(doc); return doc;
  }
  async function cancel(doc, alignment, name, id, label) {
    const before = await serial();
    if (configured) await button('Cancelar'); else await aria('Cancelar vista previa del ensamblaje');
    const discarded = await response(before, configured ? 'discard-configured-assembly' : 'discard-assembly');
    check(discarded.response.value === null, 'Cancel revokes the preview capability');
    if (configured) {
      const rebuilt = await response(before, BUILD); check(canonical(rebuilt.current.document) === canonical(doc), 'Configured Cancel rebuild retains exact committed document');
      geometry(rebuilt.response.value, doc, alignment, label, name, id);
    } else {
      await waitFor('Cancel disables Apply', () => page(() => document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true));
      check(!(await observe()).assemblies.some(r => r.serial > before && r.action === BUILD), 'Standard Cancel retains confirmed scene without a fabricated rebuild');
      phases.push({ label, alignment, confirmedSceneRestored: true, freshNativeMeasurement: false });
    }
    await recovery(doc);
  }
  async function inspectEditor() {
    return page((configured, labels) => {
      const field = name => document.querySelector('[aria-label="' + labels[name] + '"]');
      const e = field('type'), pane = e?.closest('[data-configured-pane],#assembly-panel-relations');
      return { type: e?.value, typeDisabled: e?.disabled, name: field('name')?.value, alignment: field('alignment')?.value,
        visible: !!e && !e.closest('[hidden]') && !!e.getClientRects().length, paneHidden: pane?.hidden ?? false,
        refs: [1, 2].map(slot => configured ? document.querySelector('[aria-label="Referencia ' + slot + ' de relación configurada"]')?.value
          : document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"] span')?.textContent),
        history: configured ? [...document.querySelectorAll('[aria-label="Comandos del ensamblaje configurado"] button')].filter(e => ['Deshacer', 'Rehacer'].includes(e.textContent.trim())).map(e => [e.textContent.trim(), e.disabled])
          : ['Deshacer', 'Rehacer'].map(x => [x, document.querySelector('button[aria-label="' + x + ' ensamblaje"]')?.disabled]) };
    }, configured, { type: fieldLabel('type'), name: fieldLabel('name'), alignment: fieldLabel('alignment') });
  }
  return async () => {
    const alignedName = 'Original aligned XY', opposedName = 'Original opposed XY';
    await waitFor('production startup', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    const sourceBytes = await fs.readFile(input); let before = await serial(); await aria('Abrir (Ctrl+O)');
    await waitFor('owned replacement prompt', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let row = await response(before, BUILD);
    check(canonical(configured ? row.current.document : row.document) === canonical(expected), 'Exact tracked original admitted through ordinary native file route');
    geometry(row.response.value, expected, null, 'initial'); await recovery(expected);
    await selectMoving();
    if (configured) await button('Nueva relación configurada', '[aria-label="Relaciones del estado configurado"]');
    await field('type', 'coincident'); await field('name', alignedName); await field('alignment', 'aligned'); await showOrigins();
    for (const [slot, owner] of [[1, 'moving'], [2, null]]) {
      await control(configured ? 'Propietario de referencias de origen configuradas' : 'Orígenes visibles de', owner ? 'selected' : 'scope');
      await armOrigin(slot); await originLabel(slot, 'principal-plane', 'XY', owner);
    }
    let candidate = await preview(expected, 'aligned', alignedName, null, false, 'aligned-create-preview');
    const aligned = await apply(candidate, 'aligned', alignedName, null, 'aligned-created'), mateId = declarations(aligned)[0].id;
    await aria((configured ? 'Editar relación configurada ' : 'Editar coincidencia ') + alignedName);
    await waitFor('saved plane editor is currently revealed', async () => {
      const e = await inspectEditor(); return e.visible && !e.paneHidden && e.type === 'coincident' && e.typeDisabled
        && e.name === alignedName && e.alignment === 'aligned' && e.refs.every(Boolean);
    }).catch(async error => { error.message += '; editor=' + JSON.stringify(await inspectEditor()); throw error; });
    const initialEditor = await inspectEditor();
    check(initialEditor.visible && !initialEditor.paneHidden && initialEditor.type === 'coincident' && initialEditor.typeDisabled
      && initialEditor.name === alignedName && initialEditor.alignment === 'aligned' && initialEditor.refs.every(Boolean), 'Saved plane edit opens current immutable type and exact retained roles');
    const committedRecovery = await page(() => localStorage.getItem('solidflow.autosave')), untouched = await observe();
    await field('name', opposedName); await field('alignment', 'opposed');
    check((await observe()).serial === untouched.serial && await page(() => localStorage.getItem('solidflow.autosave')) === committedRecovery, 'Opposed field editing neither solves nor commits before Preview');
    candidate = await preview(aligned, 'opposed', opposedName, mateId, true, 'opposed-edit-preview');
    await cancel(aligned, 'aligned', alignedName, mateId, 'opposed-edit-cancel');
    await waitFor('retained opposed editor ready after Cancel', async () => { const e = await inspectEditor(); return e.visible && !e.paneHidden && e.typeDisabled && e.name === opposedName && e.alignment === 'opposed'; });
    const retainedEditor = await inspectEditor();
    check(canonical(retainedEditor.refs) === canonical(initialEditor.refs) && canonical(retainedEditor.history) === canonical(initialEditor.history)
      && await page(() => localStorage.getItem('solidflow.autosave')) === committedRecovery, 'Cancel retains exact ordered draft roles, name/opposed choice, committed recovery and history');
    const retry = await preview(aligned, 'opposed', opposedName, mateId, true, 'opposed-edit-retry');
    check(canonical(declarations(retry)) === canonical(declarations(candidate)), 'Retry preserves complete saved relation identity and intent');
    const current = await apply(retry, 'opposed', opposedName, mateId, 'opposed-edit-applied');
    for (const [redo, wanted, alignment, name] of [[false, aligned, 'aligned', alignedName], [true, current, 'opposed', opposedName]]) {
      before = await serial(); if (configured) await button(redo ? 'Rehacer' : 'Deshacer'); else await aria((redo ? 'Rehacer' : 'Deshacer') + ' ensamblaje');
      row = await response(before, BUILD); check(canonical(configured ? row.current.document : row.document) === canonical(wanted), 'History restores exact whole original document');
      geometry(row.response.value, wanted, alignment, redo ? 'redo-opposed' : 'undo-aligned', name, mateId); await recovery(wanted);
    }
    if (configured) { await button('Guardar como'); await waitFor('canceled configured Save As', () => ipc.filter(r => r.channel === 'document:save' && r.completed).length === 1); await recovery(current); }
    await button('Guardar como');
    await waitFor('exact saved native document bytes', async () => { try { return ipc.filter(r => r.channel === 'document:save' && r.completed).length === (configured ? 2 : 1)
      && canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(current)
      && await page(root => document.querySelector(root)?.getAttribute('aria-busy') === 'false'
        && !document.querySelector(root + ' header')?.textContent.includes('*'), ROOT); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } });
    const savedBytes = await fs.readFile(output); before = await serial(); await button('Abrir'); row = await response(before, BUILD);
    check(canonical(configured ? row.current.document : row.document) === canonical(current), 'Saved Open retains exact complete opposed document and IDs');
    geometry(row.response.value, current, 'opposed', 'saved-reopened', opposedName, mateId); await recovery(current);
    before = await serial(); if (configured) await button('Resolver configuración'); else await aria('Resolver ensamblaje');
    row = await response(before, configured ? 'preview-configured-assembly' : 'preview-assembly');
    ready(row, current, 'opposed', 'fresh-saved-solve', opposedName, mateId); await recovery(current);
    await cancel(current, 'opposed', opposedName, mateId, 'fresh-saved-solve-cancel');
    check((await fs.readFile(input)).equals(sourceBytes) && (await fs.readFile(output)).equals(savedBytes), 'Original and saved files remain byte-equivalent after Open and fresh-solve Cancel');
    check(dialogCounts().opens === 2 && dialogCounts().saves === (configured ? 2 : 1), 'Exact owned native Open/Save dialog counts');
    check(!consoleErrors.length && !failedRequests.length, 'No renderer or resource errors');
    checks.push({ scenario: configured ? 'configured-origin-opposed' : 'origin-opposed', phases, selectionGestures, initialEditor, retainedEditor,
      savedSha256: digest(savedBytes), sourceSha256: digest(sourceBytes),
      limits: 'Two original 2x3x4 prisms, one fixed; actual projected moving/root XY roles and saved aligned-to-opposed edit. Normal dot and plane separation, exact fixed ground, 3 free DOF, literal eight-corner bounds and native volume/area; no unique free XY/yaw pose. Visible form setters are scripted, not physical keyboard input. Same-process native Save/Open/fresh solve, no STEP interoperability or all datum combinations claim.' });
    await capture(current);
  };
};
