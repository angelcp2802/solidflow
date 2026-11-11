'use strict';

// Fixed native focus/typeahead for the owned normal-to-view route only. This
// driver cannot name arbitrary keys, select arbitrary controls or set focus.
function inspectViewSelector() {
  const matches = [...document.querySelectorAll('select[aria-label="Orientación de vista"]')], select = matches[0];
  const visible = element => !!element?.isConnected && !element.closest('[hidden],[inert]')
    && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && element.getClientRects().length > 0;
  const path = element => {
    const parts = [];
    while (element && element !== document.documentElement && parts.length < 32) {
      const parent = element.parentElement; if (!parent) return null;
      parts.push(element.tagName + ':' + [...parent.children].indexOf(element)); element = parent;
    }
    return element === document.documentElement ? parts.reverse().join('/') : null;
  };
  const rect = select?.getBoundingClientRect(), active = document.activeElement;
  const point = rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const position = active && select ? active.compareDocumentPosition(select) : 0;
  let direction = null;
  if (active === document.body || active === document.documentElement) direction = 'Tab';
  else if (!(position & Node.DOCUMENT_POSITION_DISCONNECTED)) {
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) direction = 'Tab';
    else if (position & Node.DOCUMENT_POSITION_PRECEDING) direction = 'ShiftTab';
  }
  const options = [...(select?.options ?? [])];
  return { count: matches.length, visible: visible(select), disabled: !select || select.disabled,
    hit: !!point && document.elementFromPoint(point.x, point.y) === select,
    inViewport: !!rect && rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
    modal: [...document.querySelectorAll('[role="dialog"],[role="menu"],dialog[open]')].some(visible),
    options: options.slice(0, 17).map(option => ({ value: option.value, label: option.label.trim(), disabled: option.disabled })),
    focused: active === select, value: select?.value ?? null, activePath: path(active), selectPath: path(select), direction };
}

function createViewSelectInput({ allowed, getWindow, evaluate, waitFor, check }) {
  const ownedWindow = () => {
    const window = getWindow();
    check(allowed === true && window && !window.isVisible() && !window.webContents.isDestroyed() && window.webContents.debugger.isAttached(),
      'View selector input requires the hidden owned Normal To workflow');
    return window;
  };
  async function read() {
    const window = ownedWindow(), state = await evaluate('(' + inspectViewSelector.toString() + ')()');
    check(ownedWindow() === window && state.count === 1 && state.visible && !state.disabled && state.hit && state.inViewport,
      'One current enabled visible hit-tested view selector is required');
    check(!state.modal && state.options.length > 0 && state.options.length <= 16 && state.value === ''
      && state.activePath !== null && state.selectPath !== null, 'Closed bounded command selector without another input owner required');
    for (const [letter, value] of [['f', 'front'], ['p', 'back']]) {
      const options = state.options.filter(option => !option.disabled && option.label.toLowerCase().startsWith(letter));
      check(options.length === 1 && options[0].value === value, 'Fixed view typeahead must identify exactly its declared standard option');
    }
    return { window, state };
  }
  async function dispatch(combo, window) {
    check(ownedWindow() === window, 'View selector keyboard window ownership remains current');
    const letter = combo === 'f' || combo === 'p', shift = combo === 'ShiftTab';
    const event = { key: letter ? combo : 'Tab', code: letter ? 'Key' + combo.toUpperCase() : 'Tab',
      windowsVirtualKeyCode: letter ? combo.toUpperCase().charCodeAt(0) : 9, modifiers: shift ? 8 : 0 };
    const send = event => window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', event);
    let failure;
    try {
      if (shift) await send({ type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
      await send({ ...event, type: 'keyDown', ...(letter ? { text: combo, unmodifiedText: combo } : {}) });
    } catch (error) { failure = error; }
    for (const release of [{ ...event, type: 'keyUp' }, ...(shift ? [{ type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 0 }] : [])]) {
      try { await send(release); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure;
  }
  return {
    async key(letter) {
      check(letter === 'f' || letter === 'p', 'Only the fixed Frontal/Posterior selector keys are admitted');
      const { window, state } = await read(); check(state.focused, 'Native view typeahead requires actual selector focus');
      await dispatch(letter, window);
    },
    async focus() {
      let direction = null, previous = null, steps = 0; const visited = new Set();
      return waitFor('view selector receives native keyboard focus', async () => {
        const { window, state } = await read();
        if (state.focused) return { steps, direction, focusedPath: state.activePath };
        check(state.activePath !== previous && !visited.has(state.activePath) && steps < 64,
          'View selector native Tab traversal must advance without cycling beyond 64 controls');
        direction ??= state.direction;
        check(direction === 'Tab' || direction === 'ShiftTab', 'Current DOM order determines bounded native focus traversal');
        previous = state.activePath; visited.add(previous); await dispatch(direction, window); steps++; return false;
      });
    },
  };
}

function createViewSelectorBackgroundChecks(c) {
  const { page, waitFor, check, canonical, key, actual, raf, frame, presentation, snapshot, unchanged, clear, selection, viewSelectInput, checks } = c;
  const SELECT = 'select[aria-label="Orientación de vista"]', DIALOG = 'dialog[aria-label="Fondo del visor"]';
  const KEY = 'solidflow.viewport-background.v1';
  const evidence = { selectors: [], backgrounds: [], normalGuards: [],
    limits: 'Native Tab/ShiftTab and fixed Frontal/Posterior typeahead operate the real closed HTML select. Delivery is read-only observed trusted input/change before React resets its command value. Previous compares exact bounded unselected crops. Incompatible selected face/datum guards check disabled controls, current references, DOM layout and CAD/history/recovery/IPC; selected overlay pixels are not asserted equal. Background checks observe profile bytes and CSS host style, not framebuffer colours or fresh-process persistence.' };
  checks.push({ viewSelectorAndBackground: evidence });
  let expectedBackground = null;
  const host = kind => kind === 'part' ? '.viewport-canvas[aria-label="Vista 3D de la pieza"]' : '.assembly-viewport[aria-label="Visor 3D del ensamblaje"]';
  const docTitle = () => page(() => document.querySelector('.document-title')?.textContent
    ?? document.querySelector('.assembly-shell-document > strong')?.textContent ?? null);
  async function background(kind) {
    return page((selector, key) => {
      const matches = document.querySelectorAll(selector), element = matches[0], style = element && getComputedStyle(element);
      if (matches.length !== 1 || !element.isConnected) throw Error('One current viewport background host required');
      return { persisted: localStorage.getItem(key), inline: element.style.background,
        computedColor: style.backgroundColor, computedImage: style.backgroundImage };
    }, host(kind), KEY);
  }
  function isBackground(state, color) {
    if (color === null) return state.persisted === null && state.inline === '';
    const rgb = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
    return state.persisted === JSON.stringify({ version: 1, color }) && !!state.inline
      && state.computedColor === 'rgb(' + rgb.join(', ') + ')' && state.computedImage === 'none';
  }
  async function menuBackground() {
    await actual('button[data-assembly-menu="view"]');
    await actual('[data-assembly-menu="view"][aria-expanded="true"] + [role="menu"] > button', 'Fondo del visor…');
    await waitFor('actual workspace background dialog opens', () => page(selector => document.querySelector(selector)?.open === true, DIALOG));
  }
  async function colorField(color) {
    const selector = DIALOG + ' input[aria-label="Color del fondo"]';
    await page((selector, color) => {
      const fields = document.querySelectorAll(selector), field = fields[0], r = field?.getBoundingClientRect();
      if (fields.length !== 1 || !(field instanceof HTMLInputElement) || field.type !== 'color' || field.disabled
        || !field.checkVisibility() || !r?.width || !r.height || document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) !== field) {
        throw Error('One actual visible enabled background colour input required');
      }
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, color);
      field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, color);
    await waitFor('visible authored background colour retained', () => page((selector, color) => document.querySelector(selector)?.value === color, selector, color));
  }
  async function setSolid(kind, color) {
    await menuBackground();
    if (!await page(selector => document.querySelector(selector + ' input[type="checkbox"]')?.checked, DIALOG)) {
      await actual(DIALOG + ' label', 'Usar un color sólido');
    }
    await colorField(color); await actual(DIALOG + ' button[type="submit"]', 'Aplicar fondo');
    const state = await waitFor('committed background CSS and profile for ' + kind, async () => {
      const state = await background(kind);
      return isBackground(state, color) && await page(selector => !document.querySelector(selector), DIALOG) ? state : false;
    });
    expectedBackground = color; return state;
  }
  return {
    async afterOpen(kind) {
      const state = await waitFor('same-process shared background in ' + kind, async () => {
        const state = await background(kind); return isBackground(state, expectedBackground) ? state : false;
      });
      evidence.backgrounds.push({ kind, phase: 'after-workspace-open', expected: expectedBackground, state });
    },
    async selector(kind) {
      check(viewSelectInput, 'Fixed owned native view-selector input is required');
      await clear(); const before = await snapshot(); await key('7'); const iso = await frame(kind + ' selector baseline');
      for (const [letter, value] of [['f', 'front'], ['p', 'back']]) {
        const focus = await viewSelectInput.focus(); let observation, observing = false;
        try {
          await presentation('start'); observing = true; await viewSelectInput.key(letter); await raf();
          observation = (await presentation('finish')).menuObservation; observing = false;
        } finally { if (observing) await presentation('finish'); }
        const delivered = observation?.events.filter(event => event.type === 'input' || event.type === 'change');
        check(observation?.dropped === 0 && delivered?.length === 2
          && ['input', 'change'].every(type => delivered.filter(event => event.type === type).length === 1)
          && delivered.every(event => event.isTrusted && event.targetIsSelect && event.state?.current && event.state.connected
            && event.state.disabled === false && event.state.value === value), 'One trusted input/change pair delivers the fixed actual standard-view option');
        await clear(); const changed = await frame(kind + ' actual selector ' + value);
        check(changed.sha256 !== iso.sha256, 'Actual selector ' + value + ' changes the current isometric crop');
        await unchanged('Actual ' + kind + ' selector ' + value, before);
        await key('ShiftZ'); const restored = await frame(kind + ' selector Previous ' + value);
        check(restored.sha256 === iso.sha256 && restored.width === iso.width && restored.height === iso.height,
          'Previous restores every compared unselected pixel after actual standard-view selector input');
        await unchanged('Actual selector Previous ' + kind + '/' + value, before);
        evidence.selectors.push({ kind, value, input: 'native fixed typeahead after native Tab focus', focus, observation,
          before: iso, changed, restored });
      }
    },
    async rejectedNormal(kind) {
      const guard = await page(selector => {
        const rows = document.querySelectorAll(selector), select = rows[0], options = [...(select?.options ?? [])].filter(option => option.value === 'normal');
        return { count: rows.length, selectDisabled: select?.disabled, normalCount: options.length, normalDisabled: options[0]?.disabled,
          buttonDisabled: document.querySelector('button[aria-label="Normal a"]')?.disabled };
      }, SELECT);
      check(guard.count === 1 && guard.selectDisabled === false && guard.normalCount === 1 && guard.normalDisabled === true
        && guard.buttonDisabled === true, 'Incompatible selection disables only Normal To, preserving ordinary orientation choices');
      const before = await snapshot(), selected = await selection(), beforePresentation = await presentation();
      await key('8'); await raf(); const afterPresentation = await presentation();
      check(canonical(await selection()) === canonical(selected), 'Incompatible Normal To shortcut preserves exact current references');
      check(canonical(afterPresentation) === canonical(beforePresentation), 'Rejected incompatible Normal To preserves current viewport DOM layout');
      await unchanged('Rejected actual selector Normal To guard ' + kind, before);
      evidence.normalGuards.push({ kind, guard, selected, beforePresentation, afterPresentation,
        rasterComparison: 'not-asserted-while-face-and-origin-overlays-are-selected' });
    },
    async background(kind) {
      const before = await snapshot(), title = await docTitle();
      const color = { part: '#ddeeff', standard: '#eeddcc', configured: '#cceedd' }[kind];
      const solid = await setSolid(kind, color);
      await unchanged('Background Apply ' + kind, before); check(await docTitle() === title, 'Background Apply preserves document dirty title');
      await menuBackground(); await colorField('#123456');
      check(canonical(await background(kind)) === canonical(solid), 'Background draft preserves committed CSS and profile');
      await actual(DIALOG + ' button[type="button"]', 'Cancelar');
      check(canonical(await background(kind)) === canonical(solid), 'Background Cancel preserves committed CSS and profile');
      await unchanged('Background Cancel ' + kind, before);
      await menuBackground(); await actual(DIALOG + ' button[type="button"]', 'Restaurar predeterminado');
      check(canonical(await background(kind)) === canonical(solid), 'Default reset remains a draft until Apply');
      await actual(DIALOG + ' button[type="submit"]', 'Aplicar fondo');
      const reset = await waitFor('default background committed in ' + kind, async () => {
        const state = await background(kind);
        return isBackground(state, null) && await page(selector => !document.querySelector(selector), DIALOG) ? state : false;
      });
      expectedBackground = null;
      await unchanged('Background default reset ' + kind, before);
      if (kind !== 'configured') await setSolid(kind, color);
      await unchanged('Background profile workspace handoff ' + kind, before);
      check(await docTitle() === title, 'Background workflow preserves exact document dirty title');
      evidence.backgrounds.push({ kind, phase: 'apply-cancel-default', solid, reset, handoff: expectedBackground,
        persisted: await background(kind), historyRecoveryNativeIpcUnchanged: true });
    },
  };
}

module.exports = { createViewSelectInput, createViewSelectorBackgroundChecks };
