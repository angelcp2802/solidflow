'use strict';

// Real header controls only; snapshots retain the caller's CAD/file authority.
module.exports = async function headerMenus({ page, waitFor, check, checks, canonical, actualControl, menuKey, captureHeader, snapshot, kind }) {
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
