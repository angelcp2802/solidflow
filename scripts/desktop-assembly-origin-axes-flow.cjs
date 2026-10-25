'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Real controls, worker previews and file IPC. Literal prism geometry and angle
// formulas are independent of the application's reference/solver helpers.
module.exports = function originAxesWorkflow(c) {
  c = require('./desktop-assembly-navigation.cjs').withNavigation(c);
  const assemblyNavigation = c.assemblyNavigation;
  const { configured, expected, input, output, evaluate, observe, waitFor, click, pointer, menuKey, asideWheel, capture, checks,
    consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = c;
  const ROOT = configured ? '.configured-assembly-workspace' : '.assembly-app';
  const NAV = configured ? ':is([aria-label="Archivo del ensamblaje configurado"],[aria-label="Comandos del ensamblaje configurado"])' : ':is(.assembly-toolbar, .assembly-quickbar)';
  const FORM = '[aria-label="Editar relación del estado"]';
  const BUILD = configured ? 'build-configured-assembly' : 'build-assembly';
  const phases = [], selectionGestures = [];
  let checkedOriginNavigation = false;
  let checkedOwnerContinuity = false;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')');
  const navigation = configured ? require('./desktop-configured-navigation.cjs')({page,waitFor,actualControl}) : null;
  const menus = require('./desktop-assembly-menu-controls.cjs')({ configured, page, waitFor, actualControl, menuKey, observe, check, gestures: selectionGestures });
  const ribbon = require('./desktop-assembly-ribbon-controls.cjs')({ configured, page, waitFor, actualControl, menuKey, observe, check, canonical, gestures: selectionGestures });
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
  async function leaveArmedOrigin() {
    const before = (await observe()).serial, original = await references();
    await armOrigin(1);
    if (configured) {
      const summary = 'summary[aria-label="Mostrar referencias de origen configuradas"]';
      const disclosureState = () => page(() => {
        const owner = document.querySelector('[aria-label="Componente de referencias de origen configuradas"]');
        if (!owner) throw Error('Retained origin owner control required');
        return { owner: owner.value,
        visibility: ['Mostrar ejes de origen configurados', 'Mostrar planos de origen configurados'].map(label =>
          document.querySelector('[aria-label="' + label + '"]')?.checked),
        recovery: localStorage.getItem('solidflow.autosave'),
        roles: [1, 2].map(slot => document.querySelector('button[aria-label="Seleccionar Referencia ' + slot + ' por origen en vista configurada"]')?.getAttribute('aria-pressed')),
        mode: document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking'),
      }; });
      const retained = await disclosureState();
      for (const wanted of [false, true]) {
        await actualControl(summary, null, true);
        await waitFor('origin reference section disclosure ' + wanted, () => page(wanted =>
          document.querySelector('details[aria-label="Referencias de origen configuradas"]')?.open === wanted, wanted));
        check(canonical(await disclosureState()) === canonical(retained) && canonical(await references()) === canonical(original)
          && (await observe()).serial === before, 'Origin disclosure retains armed role, visibility, owner, references, recovery and native serial');
      }
      selectionGestures.push({kind: 'configured-origin-disclosure', states: ['collapsed-armed', 'reopened-armed'], retainedPicking: true});
    } else {
      const summary = '#assembly-relation-origins > summary[aria-label="Mostrar referencias de origen"]';
      const snapshot = () => page(() => {
        const pane = document.querySelector('#assembly-panel-relations'), group = document.querySelector('.assembly-origin-tools');
        if (!pane || !group || !pane.contains(group)) throw Error('One origin group in the relation pane required');
        return { recovery: localStorage.getItem('solidflow.autosave'),
          controls: [...pane.querySelectorAll('input,select')].map(e => ({ label: e.getAttribute('aria-label'), value: e.value, checked: e instanceof HTMLInputElement ? e.checked : null, disabled: e.disabled })),
          references: [1, 2].map(slot => { const e = pane.querySelector('[aria-label="Referencia ' + slot + ' de la relación"]'); return { text: e?.textContent, active: e?.classList.contains('active') }; }),
          selection: [...document.querySelectorAll('.assembly-tree [aria-selected="true"]')].map(e => e.getAttribute('data-assembly-tree-key')),
          history: ['Deshacer ensamblaje', 'Rehacer ensamblaje'].map(label => { const e = document.querySelector('button[aria-label="' + label + '"]'); if (!e) throw Error('Existing history control required'); return { label, disabled: e.disabled }; }),
          mode: document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking'),
          armed: group.querySelector('button[aria-label="Seleccionar orígenes"]')?.getAttribute('aria-pressed') };
      });
      const retained = await snapshot(), native = await observe(), counters = await observe.counters();
      check(retained.mode === 'origin' && retained.armed === 'true' && !native.workerErrors.length, 'Disclosure starts with an authenticated current origin role armed');
      const assertRetained = async wanted => {
        await waitFor('standard origin disclosure ' + wanted, () => page(wanted => {
          const d = document.querySelector('#assembly-relation-origins'), s = d?.querySelector('summary');
          return d?.open === wanted && document.activeElement === s;
        }, wanted));
        check(canonical(await snapshot()) === canonical(retained) && canonical(await references()) === canonical(original)
          && canonical(await observe.counters()) === canonical(counters), 'Origin disclosure retains exact roles, controls, selection, recovery, history and worker counters');
      };
      // The actual summary click leaves native keyboard focus on that summary.
      // No reveal helper runs between Enter presses, so it cannot reopen it.
      await actualControl(summary, null, true); await assertRetained(false);
      for (const wanted of [true, false, true]) {
        check(await page(selector => document.activeElement === document.querySelector(selector), summary), 'Native Enter targets the focused origin summary');
        await menuKey('Enter'); await assertRetained(wanted);
      }
      const after = await observe();
      check(digest(canonical(after)) === digest(canonical(native)), 'Origin disclosure leaves the complete worker observation history unchanged');
      selectionGestures.push({ kind: 'standard-origin-disclosure', input: 'Actual summary pointer press, then native Enter/Enter/Enter',
        states: ['collapsed-armed', 'reopened-armed', 'collapsed-armed', 'reopened-armed'], retainedPicking: true, serial: native.serial,
        recoverySha256: digest(retained.recovery), observationSha256: digest(canonical(native)) });
    }
    if (navigation) await navigation.pane('model'); else await assemblyNavigation.panel('components');
    await waitFor('leaving relations disarms origin selection', async () => await originMode() === '');
    check(canonical(await references()) === canonical(original), 'Leaving relation preserves both authored references');
    if (navigation) await navigation.pane('relation'); else await assemblyNavigation.panel('relations');
    check(await originMode() === '' && canonical(await references()) === canonical(original), 'Returning restores the draft without rearming origin selection');
    check((await observe()).serial === before, 'Origin navigation is display-only');
    selectionGestures.push({ kind: 'leave-armed-origin', draftRetained: true, pickingStopped: true });
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
      await waitFor('actual origin assigned to intended role', () => page((configured, slot, wanted) => {
        if (configured) { const value = document.querySelector('[aria-label="Referencia ' + slot + ' de relación configurada"]')?.value;
          if (!value) return false; const ref = JSON.parse(value);
          return ref.kind === wanted.kind && ref.axis === wanted.axis && ref.plane === wanted.plane
            && (wanted.component ? JSON.stringify(ref.component?.occurrencePath) === JSON.stringify(wanted.component.occurrencePath)
              && ref.component?.definition.id === wanted.component.definition.id && ref.component?.definition.revision === wanted.component.definition.revision : ref.component === null); }
        const text = (wanted.component?.occurrencePath.join(' / ') ?? 'Ámbito actual') + ' · ' + (wanted.kind === 'principal-axis' ? 'Eje de origen ' + wanted.axis : wanted.plane);
        return document.querySelector('[aria-label="Referencia ' + slot + ' de la relación"] span')?.textContent === text;
      }, configured, slot, wanted));
      await waitFor('origin selection ends after assigning one role', async () => await originMode() === '');
      const after = await references(); check(after[slot === 1 ? 1 : 0] === original[slot === 1 ? 1 : 0], 'The other origin role remains unchanged');
      check(await page(key => [...document.querySelectorAll('[data-origin-key]')].some(e => e.getAttribute('data-origin-key') === key && e.classList.contains('selected')), key), 'Accepted current origin is visibly highlighted');
    } else {
      check(canonical(await references()) === canonical(original) && await originMode() === 'origin', 'Incompatible visible plane is rejected without replacing a role or disarming the eligible axis pick');
    }
    check((await observe()).serial === before, 'Origin selection sends no worker solve');
    selectionGestures.push({ kind: accepted ? 'origin-assigned' : 'origin-rejected', slot, reference: wanted });
  }
  async function button(text, parent = ROOT) { await assemblyNavigation.button(text, parent);
    if (navigation) await navigation.reveal(parent + ' button', text);
    await page((text, parent) => { const matches = [...document.querySelectorAll(parent + ' button')].filter(e => e.textContent.trim() === text);
      if (matches.length !== 1 || matches[0].disabled) throw Error('One enabled button required: ' + text); matches[0].click(); }, text, parent);
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
  async function standardRelationGuidance(phase) {
    if (configured) return;
    const expected = phase === 'first-reference' ? 'Selecciona la referencia 2.'
      : phase === 'complete-references' ? 'Revisa el nombre y los parámetros; pulsa «Vista previa de la nueva relación». Después de verificarla, podrás Aplicar.'
      : 'Vista previa verificada. Revisa el resultado y pulsa Aplicar.';
    const state = await waitFor('standard relation guidance ' + phase, async () => {
      const actual = await page(() => {
        const guides = [...document.querySelectorAll('[data-assembly-relation-guidance]')];
        const apply = [...document.querySelectorAll('button[aria-label="Aplicar ensamblaje"]')];
        const preview = [...document.querySelectorAll('#assembly-panel-relations button')].filter(button => button.textContent.trim() === 'Vista previa de la nueva relación');
        const guide = guides[0];
        return { count: guides.length, text: guide?.textContent, shown: !!guide && !guide.closest('[hidden]') && guide.getClientRects().length > 0,
          applyCount: apply.length, applyDisabled: apply[0]?.disabled, previewCount: preview.length, previewDisabled: preview[0]?.disabled,
          status: document.querySelector('.assembly-status')?.textContent };
      });
      return actual.count === 1 && actual.shown && actual.text === expected && actual.applyCount === 1
        && actual.applyDisabled === (phase !== 'verified-preview') && actual.previewCount === 1
        && actual.previewDisabled === (phase !== 'complete-references') ? actual : false;
    });
    check(phase === 'verified-preview' || state.status.includes(expected), 'Origin selection status agrees with the current role guidance');
    selectionGestures.push({ kind: 'standard-relation-guidance', phase, ...state });
  }
  async function draft(stage) {
    const type = stage === 1 ? 'concentric' : 'angle', axis = stage === 1 ? 'Z' : 'X';
    if (configured && !await page(form => !!document.querySelector(form), FORM)) await button('Nueva relación configurada', '[aria-label="Relaciones del estado configurado"]');
    if (!configured && !checkedOriginNavigation) {
      await assemblyNavigation.panel('relations');
      const layout = await page(() => {
        const panes = document.querySelectorAll('#assembly-panel-relations'), disclosures = document.querySelectorAll('#assembly-relation-origins'), groups = document.querySelectorAll('.assembly-origin-tools');
        const pane = panes[0], disclosure = disclosures[0], group = groups[0], summary = disclosure?.querySelector('summary');
        const rect = e => { const r = e?.getBoundingClientRect(); return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null; };
        const references = [1, 2].map(slot => pane?.querySelector('[aria-label="Referencia ' + slot + ' de la relación"]'));
        return { viewport: { width: innerWidth, height: innerHeight }, paneCount: panes.length, disclosureCount: disclosures.length, groupCount: groups.length,
          pane: rect(pane), summary: rect(summary), group: rect(group), open: disclosure?.open, paneHidden: pane?.hidden,
          insideRelations: !!pane && !!group && pane.contains(group) && disclosure?.contains(group),
          outsideRelations: [...groups].filter(e => !pane?.contains(e)).length,
          afterReferences: references.every(e => e && !!(e.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING)),
          controls: [...(group?.querySelectorAll('input,select,button') ?? [])].map(e => {
            if (typeof e.checkVisibility !== 'function') throw Error('Chromium Element.checkVisibility support required for closed origin disclosure evidence');
            const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { label: e.getAttribute('aria-label'), rect: rect(e), hasClientRects: !!e.getClientRects().length,
              painted: e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true }),
              ownHit: !!hit && (hit === e || e.contains(hit)), checked: e instanceof HTMLInputElement ? e.checked : null };
          }), summaryLabel: summary?.getAttribute('aria-label') };
      });
      selectionGestures.push({ kind: 'standard-origin-inspector-initial-before-reveal', ...layout });
      check(layout.paneCount === 1 && layout.disclosureCount === 1 && layout.groupCount === 1 && layout.insideRelations && layout.outsideRelations === 0
        && layout.afterReferences && layout.paneHidden === false && layout.open === false && layout.summaryLabel === 'Mostrar referencias de origen',
      'One initially closed origin disclosure follows the generic roles inside Relations, with no viewport duplicate: ' + JSON.stringify(layout));
      check(layout.controls.length === 4 && layout.controls.every(e => !e.painted && !e.ownHit && e.checked !== true), 'Closed origin controls remain mounted, unpainted and unhittable with both visibility options off');
    }
    await control(configured ? 'Tipo de relación configurada' : 'Tipo de relación', type);
    await control(configured ? 'Nombre de relación configurada' : 'Nombre de la relación', stage === 1 ? 'Origin Z alignment' : 'Origin X 30 degrees');
    await showOrigins();
    const ownerLabel = configured ? 'Propietario de referencias de origen configuradas' : 'Orígenes visibles de';
    await control(ownerLabel, 'both');
    if (!checkedOriginNavigation) {
      await leaveArmedOrigin();
      await armOrigin(1); await originLabel(1, 'principal-plane', 'XY', 'moving', false);
      checkedOriginNavigation = true;
    }
    if (stage === 2) {
      // Angle already accepts plane directions. Exercise that existing role,
      // then replace it with X before the unchanged geometric preview oracle.
      await control(ownerLabel, 'selected'); await armOrigin(1);
      await originLabel(1, 'principal-plane', 'XZ', 'moving');
    }
    for (const [slot, owner] of [[1, 'moving'], [2, null]]) {
      await control(ownerLabel, owner ? 'selected' : 'scope');
      await armOrigin(slot); await originLabel(slot, 'principal-axis', axis, owner);
      if (!configured && stage === 1) await standardRelationGuidance(slot === 1 ? 'first-reference' : 'complete-references');
    }
    if (configured && !checkedOwnerContinuity) {
      const ownerControl = 'Componente de referencias de origen configuradas';
      const ownerValue = async owner => page((label, owner) => {
        const select = document.querySelector('[aria-label="' + label + '"]');
        const values = [...(select?.options ?? [])].filter(option => {
          if (!option.value || option.disabled) return false;
          const value = JSON.parse(option.value);
          return JSON.stringify(value[0]) === '[]' && JSON.stringify(value[1]?.occurrencePath) === JSON.stringify([owner])
            && value[1]?.definition.id === 'origin-axis-prism' && value[1]?.definition.revision === 'r1';
        });
        if (values.length !== 1) throw Error('One current original owner option required: ' + owner);
        return values[0].value;
      }, ownerControl, owner);
      const original = await references(), before = (await observe()).serial;
      await control(ownerControl, await ownerValue('ground')); await armOrigin(2);
      await control(ownerControl, await ownerValue('moving'));
      await waitFor('owner change disarms the current origin nomination', async () => await originMode() === '');
      check(canonical(await references()) === canonical(original), 'Changing the display owner while armed preserves both relation references');
      await control(ownerControl, await ownerValue('ground')); await armOrigin(2); await originLabel(2, 'principal-axis', 'Z', 'ground');
      const pair = await references();
      check(JSON.parse(pair[0]).component.occurrencePath[0] === 'moving' && JSON.parse(pair[1]).component.occurrencePath[0] === 'ground', 'Two different component origins can occupy the two roles inside one editor');
      await control(ownerControl, await ownerValue('moving'));
      check(canonical(await references()) === canonical(pair) && await page(() => document.querySelector('[data-configured-pane="relation"]')?.hidden === false
        && document.querySelector('button[aria-label="Seleccionar componente moving"]')?.getAttribute('aria-pressed') === 'true'), 'Owner changes retain the open draft and the original tree selection');
      check((await observe()).serial === before, 'Changing origin owners does not solve or commit');
      await control(ownerLabel, 'scope'); await armOrigin(2); await originLabel(2, 'principal-axis', 'Z', null);
      check(canonical(await references()) === canonical(original), 'Restore the original root/component pair before the unchanged native oracle');
      selectionGestures.push({ kind: 'configured-origin-owner-continuity', owners: ['moving', 'ground'], draftRetained: true, pickingStopped: true });
      checkedOwnerContinuity = true;
    }
    if (stage === 2) await control(configured ? 'Ángulo de relación configurada en grados' : 'Ángulo de relación', '30');
  }
  async function preview(baseline, stage) {
    const before = await observe(); await button(configured ? 'Vista previa de relación configurada' : 'Vista previa de la nueva relación', configured ? FORM : ROOT);
    const row = await response(before.serial, configured ? 'preview-configured-assembly-relation-edit' : 'preview-assembly');
    const proposed = ready(row, baseline, stage);
    if (!configured) await standardRelationGuidance('verified-preview');
    return proposed;
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
    await require('./desktop-command-header-layout.cjs')({ page, check, checks }, 'origin-axes-initial-before-reveal', configured ? 'configured' : 'standard');
    await selectMoving();
    await require('./desktop-assembly-origin-tree-controls.cjs')({ configured, page, waitFor, pointer,
      actualControl: (selector, text) => actualControl(selector, text, true), navigation: navigation ?? assemblyNavigation,
      observe, check, canonical, checks });
    await menus.initial();
    await draft(1); await menus.retainedDraft(references, canonical); await ribbon.retained('relation-draft');
    const rejectedCommit = await preview(expected, 1); await recovery(expected); await ribbon.retained('verified-preview');
    const cancelSerial = (await observe()).serial;
    if (configured) await button('Cancelar', NAV); else await click('button[aria-label="Cancelar vista previa del ensamblaje"]');
    if (configured) {
      // Cancel clears the preview scene before its committed-scene rebuild starts.
      // Recovery equality plus a transient aria-busy=false is not editor readiness.
      const restored = await response(cancelSerial, BUILD);
      check(canonical(restored.current.document) === canonical(expected), 'Cancel rebuild uses the exact committed configured document');
      const inspect = () => page(() => {
        const fields = [...document.querySelectorAll('[aria-label="Tipo de relación configurada"]')];
        const field = fields[0], pane = field?.closest('[data-configured-pane]');
        return { count: fields.length, disabled: field?.disabled ?? null,
          pane: pane?.getAttribute('data-configured-pane') ?? null, hidden: pane?.hidden ?? null,
          visible: !!field && !field.closest('[hidden]') && field.getClientRects().length > 0,
          busy: document.querySelector('.configured-assembly-workspace')?.getAttribute('aria-busy') ?? null };
      });
      await waitFor('Cancel rebuild restores the retained configured relation editor', async () => {
        const state = await inspect();
        return state.count === 1 && state.disabled === false && state.pane === 'relation' && state.hidden === false && state.visible && state.busy === 'false';
      }).catch(async error => { error.message += '; retainedEditor=' + JSON.stringify(await inspect()); throw error; });
    }
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
    checks.push({ scenario: configured ? 'configured-origin-axes' : 'origin-axes', phases, selectionGestures,
      selectionLimits: 'Actual CDP menu and ribbon pointer/keyboard navigation, component, visibility, role and projected-origin label presses; owner/type/name/value form controls scripted and visible. Ribbon tabs preserve draft and verified-preview fields, recovery, inspector state, confirmation guards and native request serial. Configured owner changes preserve the open draft and allow both component origins before restoring the root/component oracle. One incompatible concentric plane rejected; one eligible angle plane replaced before preview. Existing geometry, history and file oracles unchanged.',
      savedSha256: digest(savedBytes), sourceSha256: digest(sourceBytes) });
    await capture(current);
  };
};
