'use strict';

// All navigation is real menu-key input. Merely inspecting a label never invokes
// its command; Save/New/import/export are intentionally not activated here.
async function fileNavigation({ page, waitFor, check, checks, canonical, actualControl, menuKey, snapshot, cameraFrame, kind, phase, expectedSaveEnabled }) {
  const evidence = { kind, phase, expectedSaveEnabled, states: [], keys: [], view: [] };
  checks.push({ headerFileNavigation: evidence });
  const before = canonical(await snapshot());
  const inspect = () => page(() => {
    const headers = document.querySelectorAll('.command-header'), header = headers[0];
    if (headers.length !== 1) throw Error('One owned current command header required');
    const trigger = header.querySelector('button[data-assembly-menu="file"]'), id = trigger?.getAttribute('aria-controls');
    const popup = id ? document.getElementById(id) : null;
    if (!trigger?.isConnected || popup && (!popup.isConnected || !header.contains(popup) || popup.getAttribute('role') !== 'menu')) throw Error('Current File popup must belong to its connected header');
    const items = popup ? [...popup.querySelectorAll(':scope > button[data-assembly-command]')].map(button => ({
      id: button.dataset.assemblyCommand, index: Number(button.dataset.menuIndex), label: button.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent.trim(), disabled: button.disabled,
      focused: document.activeElement === button })) : [];
    return { open: !!popup, items, popupFocused: !!popup && document.activeElement === popup,
      triggerFocused: document.activeElement === trigger, activeConnected: !!document.activeElement?.isConnected,
      activeDisabled: document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled,
      activeInHeader: header.contains(document.activeElement), activeCommand: document.activeElement?.getAttribute('data-assembly-command') ?? null };
  });
  const observeState = async (label, predicate) => {
    const current = await waitFor('File key navigation ' + kind + '/' + phase + ': ' + label, async () => { const value = await inspect(); return predicate(value) ? value : false; });
    check(current.activeConnected && !current.activeDisabled, 'Menu navigation retains a connected enabled focus owner');
    evidence.states.push({ label, ...current });
    check(canonical(await snapshot()) === before, 'Menu-only navigation preserves exact document, history, draft and native/file authority: ' + label);
    return current;
  };
  const key = async name => { await menuKey(name); evidence.keys.push(name); };
  const view = async label => {
    const svg = await page(() => {
      const element = document.querySelector('svg[aria-label="Editor de croquis multientidad"]'); if (!element?.checkVisibility()) return null;
      const matrix = element.getScreenCTM(), origin = element.querySelector('[aria-label="Origen fijo (0, 0)"] circle'), grid = element.querySelector('pattern');
      if (!matrix || !origin || !grid) throw Error('Actual visible sketch projection required');
      return { kind: 'sketch-projection', matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
        origin: [origin.getAttribute('cx'), origin.getAttribute('cy')], grid: [grid.getAttribute('x'), grid.getAttribute('y'), grid.getAttribute('width'), grid.getAttribute('height')] };
    });
    if (svg) { evidence.view.push({ label, value: svg }); return svg; }
    check(typeof cameraFrame === 'function', 'Existing real camera crop helper required for the displayed 3D workspace');
    let previous = '', since = 0;
    const frame = await waitFor('stationary File-navigation camera crop ' + label, async () => {
      const current = await cameraFrame(), { rawSha256, ...compared } = current, signature = canonical(compared);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return Date.now() - since >= 120 ? current : false;
    });
    const { rawSha256, ...compared } = frame;
    evidence.view.push({ label, value: frame }); return { kind: '3d-crop', ...compared };
  };
  // Put pointer/focus in the header before either projection/crop observation,
  // avoiding a transient hover overlay as an artificial camera difference.
  await actualControl('button[data-assembly-menu="file"]'); await key('Escape');
  await observeState('preparation Escape restores File trigger', state => !state.open && state.triggerFocused);
  const originalView = await view('before');
  await actualControl('button[data-assembly-menu="file"]');
  const opened = await observeState('File opens on first enabled item or its empty popup', state => state.open && (state.items.some(item => !item.disabled)
    ? state.activeCommand === state.items.find(item => !item.disabled).id : state.popupFocused));
  const saves = opened.items.filter(item => item.label?.toLocaleLowerCase().startsWith('g'));
  check(canonical(saves.map(item => item.label)) === canonical(['Guardar', 'Guardar como…']) && saves.every(item => item.disabled === !expectedSaveEnabled),
    'Actual File inventory contains exactly the two expected guarded G commands');
  const enabled = opened.items.filter(item => !item.disabled), focus = (state, item) => item ? state.activeCommand === item.id : state.popupFocused;
  await key('End'); await observeState('End skips disabled commands to last available item', state => state.open && focus(state, enabled.at(-1)));
  await key('ArrowDown'); await observeState('Down wraps to first available item', state => state.open && focus(state, enabled[0]));
  await key('ArrowUp'); await observeState('Up wraps to last available item', state => state.open && focus(state, enabled.at(-1)));
  await key('Home'); let current = await observeState('Home reaches first available item', state => state.open && focus(state, enabled[0]));
  for (let repetition = 0; repetition < 4; repetition++) {
    const activeIndex = current.items.findIndex(item => item.id === current.activeCommand), next = current.items.map((_, offset) => current.items[(activeIndex + offset + 1 + current.items.length) % current.items.length])
      .find(item => !item.disabled && item.label.toLocaleLowerCase().startsWith('g'));
    const oldFocus = current.activeCommand, popupFocused = current.popupFocused;
    await key('g'); current = await observeState('G cycle ' + (repetition + 1), state => state.open && (next ? state.activeCommand === next.id : state.activeCommand === oldFocus && state.popupFocused === popupFocused));
    check(current.items.filter(item => item.focused).every(item => !item.disabled), 'Repeated G never focuses an unavailable Save command');
  }
  if (expectedSaveEnabled) check(canonical(evidence.states.filter(state => /^G cycle /.test(state.label)).map(state => state.activeCommand))
    === canonical([saves[0].id, saves[1].id, saves[0].id, saves[1].id]), 'Repeated G alternates Guardar/Guardar como and wraps');
  await key('Tab'); await observeState('Tab closes popup and leaves connected header focus', state => !state.open && state.activeInHeader);
  await actualControl('button[data-assembly-menu="file"]');
  await observeState('Reopen retains exact command identities and guards', state => state.open
    && canonical(state.items.map(({ focused, ...item }) => item)) === canonical(opened.items.map(({ focused, ...item }) => item)));
  await key('Escape'); await observeState('Escape closes popup and restores File trigger', state => !state.open && state.triggerFocused);
  const restoredView = await view('after');
  check(canonical(restoredView) === canonical(originalView), 'Header keyboard navigation preserves exact displayed sketch projection or bounded 3D camera crop');
  evidence.completed = true;
  evidence.limits = 'One G prefix with two Save labels, actual Home/End/arrows/Tab/Escape; no command activation, arbitrary text, hardware-keyboard or all-letter/all-menu claim. Sketch mode checks its visible projection, not a hidden 3D camera.';
}

// Real header controls only; snapshots retain the caller's CAD/file authority.
module.exports = async function headerMenus({ page, waitFor, check, checks, canonical, actualControl, menuKey, captureHeader, snapshot, cameraFrame, kind }) {
  const evidence = { kind, states: [], captures: [] }; checks.push({ headerMenus: evidence });
  const before = canonical(await snapshot());
  const inspect = () => page(() => {
    const headers = document.querySelectorAll('.command-header'), header = headers[0];
    if (headers.length !== 1) throw Error('One current command header required');
    const menus = header.querySelector('.command-header-menus'), quick = header.querySelector('.command-header-quick-actions');
    const reveal = header.querySelector('.command-header-reveal'), pin = header.querySelector('[data-header-menu-pin]');
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const visible = element => !!element && element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) && element.getClientRects().length > 0;
    const triggers = [...header.querySelectorAll('[data-assembly-menu]')];
    const controls = [...triggers, reveal, pin, ...quick.querySelectorAll('button')].filter(visible);
    const rect = box(header);
    return { pinned: header.dataset.menuPinned, expanded: header.dataset.menuExpanded, header: rect,
      menus: triggers.map(element => ({ id: element.dataset.assemblyMenu, text: element.textContent.trim() })),
      quickVisible: visible(quick), quickInert: quick.inert, quickHidden: quick.getAttribute('aria-hidden'),
      quickGuards: [...quick.querySelectorAll('button')].map(element => ({ label: element.getAttribute('aria-label') ?? element.title ?? element.textContent, disabled: element.disabled })),
      reveal: visible(reveal), pin: visible(pin), pinPressed: pin?.getAttribute('aria-pressed') ?? null,
      activeReveal: document.activeElement === reveal, activePin: document.activeElement === pin,
      activeMenu: document.activeElement?.getAttribute('data-assembly-menu'),
      popupCount: header.querySelectorAll('[role="menu"]').length,
      dialog: !!document.querySelector('[role="dialog"][aria-labelledby="new-document-title"]'),
      namedDialog: !!document.querySelector('dialog.named-views-dialog[open]'),
      minimumControlHeight: Math.min(...controls.map(element => element.getBoundingClientRect().height)),
      contained: controls.every(element => { const r = element.getBoundingClientRect(); return r.left >= rect.x && r.top >= rect.y && r.right <= rect.x + rect.width && r.bottom <= rect.y + rect.height; }),
      viewport: { width: innerWidth, height: innerHeight } };
  });
  const state = async (label, predicate) => {
    const value = await waitFor('header menus: ' + label, async () => { const current = await inspect(); return predicate(current) ? current : false; });
    check(value.header.height >= 30 && value.header.height <= 36 && value.header.x >= 0
      && value.header.x + value.header.width <= value.viewport.width + 1 && value.contained && value.minimumControlHeight >= 28,
    'Header controls fit their single row: ' + label);
    evidence.states.push({ label, ...value }); return value;
  };
  const transient = value => value.pinned === 'false' && value.expanded === 'true' && value.reveal && value.pin
    && value.quickInert && !value.quickVisible && value.quickHidden === 'true';
  const collapsed = value => value.pinned === 'false' && value.expanded === 'false' && value.reveal && !value.pin
    && value.menus.length === 0 && !value.quickInert && value.quickVisible;
  const menuAction = async label => {
    const text = await page(label => {
      const rows = [...document.querySelectorAll('[role="menu"] button[data-assembly-command]')]
        .filter(button => button.children[1]?.textContent.trim() === label);
      if (rows.length !== 1 || rows[0].disabled) throw Error('One enabled menu command required: ' + label);
      return rows[0].textContent.trim();
    }, label);
    await actualControl('[role="menu"] button[data-assembly-command]', text);
  };
  const initial = await state('initial pinned', value => value.pinned === 'true' && value.expanded === 'true' && value.pin && !value.reveal && value.quickVisible && !value.quickInert);
  check(initial.menus.length > 0 && initial.popupCount === 0, 'Initial pinned header has one closed command inventory');
  await fileNavigation({ page, waitFor, check, checks, canonical, actualControl, menuKey, snapshot, cameraFrame, kind, phase: 'clean', expectedSaveEnabled: true });
  evidence.captures.push(await captureHeader('pinned'));
  await actualControl('[data-header-menu-pin]');
  const opened = await state('unpin retains temporary menus', transient);
  check(canonical(opened.menus) === canonical(initial.menus) && canonical(opened.quickGuards) === canonical(initial.quickGuards), 'Unpin retains all command identities and disabled guards');
  evidence.captures.push(await captureHeader('temporary'));
  await actualControl('.command-header-document');
  await state('outside caption collapses menus', collapsed);
  evidence.captures.push(await captureHeader('collapsed'));
  await actualControl('.command-header-reveal');
  await state('pointer reveals menus', transient);
  await actualControl('button[data-assembly-menu="view"]');
  await state('View popup opens', value => transient(value) && value.popupCount === 1);
  await menuKey('Escape');
  await state('first Escape closes popup', value => transient(value) && value.popupCount === 0 && value.activeMenu === 'view');
  await menuKey('Escape');
  await state('second Escape returns to disclosure', value => collapsed(value) && value.activeReveal);
  await menuKey('ArrowDown');
  await state('ArrowDown reveals first menu', value => transient(value) && value.activeMenu === initial.menus[0].id);
  await actualControl('button[data-assembly-menu="file"]');
  await menuAction('Nuevo…');
  await state('New dialog from temporary menu', value => collapsed(value) && value.dialog);
  await actualControl('[role="dialog"] button', 'Cancelar');
  await state('Cancel restores connected disclosure', value => collapsed(value) && !value.dialog && value.activeReveal);
  check(canonical(await snapshot()) === before, 'Transient New/Cancel retains exact CAD, history, recovery and file authority');
  await menuKey('Enter');
  await state('Enter reveals menus', transient);
  await actualControl('button[data-assembly-menu="view"]');
  await menuAction('Vistas guardadas…');
  await state('Named views from temporary menu', value => collapsed(value) && value.namedDialog);
  await menuKey('Escape');
  await state('Named views Escape restores disclosure', value => collapsed(value) && !value.namedDialog && value.activeReveal);
  check(canonical(await snapshot()) === before, 'Transient named-view cancellation retains exact CAD, history, recovery and file authority');
  await menuKey('Enter');
  await state('Enter reopens after modal cancellation', transient);
  await actualControl('[data-header-menu-pin]');
  const restored = await state('pin restores fixed row', value => value.pinned === 'true' && value.expanded === 'true' && !value.reveal && value.pin
    && value.pinPressed === 'true' && value.activePin && value.quickVisible && !value.quickInert);
  check(canonical(restored.header) === canonical(initial.header) && canonical(restored.menus) === canonical(initial.menus)
    && canonical(restored.quickGuards) === canonical(initial.quickGuards), 'Pin restores exact header bounds, commands and disabled guards');
  check(canonical(await snapshot()) === before, 'Header pinning preserves exact CAD, history, recovery and file authority');
  evidence.completed = true;
};
module.exports.fileNavigation = fileNavigation;
