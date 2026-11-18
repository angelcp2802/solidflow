'use strict';

// Exercise application-owned menu controls using actual CDP input. This adds
// navigation evidence, not a replacement for the calling flow's CAD oracles.
module.exports = function assemblyMenuControls({ configured, page, waitFor, actualControl, menuKey, observe, check, gestures }) {
  const trigger = id => '[data-assembly-menu="' + id + '"]';
  const command = id => '[data-assembly-command="' + id + '"]';
  const closed = () => page(() => !document.querySelector('.assembly-main-menus [role="menu"]'));
  const focused = id => page(id => {
    const trigger = document.querySelector('[data-assembly-menu="' + id + '"]');
    const popup = trigger?.getAttribute('aria-controls') && document.getElementById(trigger.getAttribute('aria-controls'));
    return trigger?.getAttribute('aria-expanded') === 'true' && !!popup && popup.contains(document.activeElement);
  }, id);
  const key = async value => { await menuKey(value); gestures.push({ kind: 'menu-key', key: value }); };
  const open = async id => { await actualControl(trigger(id)); await waitFor('menu opens with keyboard focus: ' + id, () => focused(id)); };
  const close = async id => {
    await key('Escape'); await waitFor('Escape closes menu and restores trigger', async () => await closed() && await page(id => document.activeElement === document.querySelector('[data-assembly-menu="' + id + '"]'), id));
  };
  async function initial() {
    const before = await observe();
    check(await page(() => [...document.querySelectorAll('[data-assembly-menu]')].map(e => e.textContent.trim()).join('|') === 'Archivo|Editar|Ver|Insertar|Herramientas|Ayuda'), 'Both assembly spaces expose the same ordered top-level menus');
    for (const id of ['file', 'edit', 'view', 'insert', 'tools', 'help']) {
      check(await page(id => { const e = document.querySelector('[data-assembly-menu="' + id + '"]'), r = e?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }, id), 'Top-level menu fits the actual window: ' + id);
    }
    await open('edit');
    check(await page(() => document.querySelector('[data-assembly-command="undo"]')?.disabled && document.querySelector('[data-assembly-command="redo"]')?.disabled), 'Initial empty history disables menu Undo and Redo');
    await waitFor('menu focus skips disabled history', () => page(() => document.activeElement?.closest('[role="menu"]') && document.activeElement.disabled === false));
    await close('edit');
    await open('file');
    check(await page(() => document.querySelector('[data-assembly-command="save"]')?.disabled === false), 'Idle file menu exposes the existing enabled Save action');
    await key('Tab'); await waitFor('Tab exits to the pinned header control', async () => await closed() && await page(() => document.activeElement === document.querySelector('button[data-header-menu-pin][aria-pressed="true"]')));
    await key('Tab'); await waitFor('Tab continues to existing quick access', async () => await closed() && await page(() => !!document.activeElement?.closest('.assembly-quickbar')));
    await open('view'); await key('ArrowRight'); await waitFor('Right arrow opens and focuses Insert', () => focused('insert'));
    await key('ArrowLeft'); await waitFor('Left arrow returns focus to View', () => focused('view'));
    check(await page(() => [...document.querySelectorAll('.assembly-main-menus [role="menu"] [data-assembly-command]')].slice(0, 9)
      .map(e => [e.getAttribute('data-assembly-command'), e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent.trim(), e.querySelector(':scope > kbd')?.textContent.trim(), e.disabled])
      .map(row => JSON.stringify(row)).join('|') ===
      [['view-front', 'Frontal', 'Ctrl+1', false], ['view-back', 'Posterior', 'Ctrl+2', false], ['view-left', 'Izquierda', 'Ctrl+3', false], ['view-right', 'Derecha', 'Ctrl+4', false],
        ['view-top', 'Superior', 'Ctrl+5', false], ['view-bottom', 'Inferior', 'Ctrl+6', false], ['view-iso', 'Isométrica', 'Ctrl+7', false],
        ['view-dimetric', 'Dimétrica', undefined, false], ['view-trimetric', 'Trimétrica', undefined, false]].map(row => JSON.stringify(row)).join('|')),
    'View menu starts with the exact ordered nine enabled standard views; only the original seven have shortcut labels');
    await key('Home'); await waitFor('Home focuses front view', () => page(() => document.activeElement?.getAttribute('data-assembly-command') === 'view-front'));
    await key('ArrowDown'); await waitFor('Down focuses back view', () => page(() => document.activeElement?.getAttribute('data-assembly-command') === 'view-back'));
    await key('ArrowUp'); await waitFor('Up returns focus to front view', () => page(() => document.activeElement?.getAttribute('data-assembly-command') === 'view-front'));
    await key('Enter'); await waitFor('Enter invokes view and closes the menu', closed);
    await open('view'); await actualControl(command('view-fit')); await waitFor('Fit command closes menu', closed);
    // Restore the explicit isometric view used by the original projected-label
    // scenario; front-on axes/planes can share projected label positions.
    await open('view'); await actualControl(command('view-iso')); await waitFor('Return to original isometric command closes menu', closed);
    await open('help'); await actualControl('.assembly-shell-document'); await waitFor('Outside click closes the menu', closed);
    await open('insert'); await actualControl(command('insert-relation'));
    await waitFor('Insert opens the existing relation editor', () => page(configured => configured
      ? document.querySelector('[data-configured-pane="relation"]')?.hidden === false && !!document.querySelector('[aria-label="Editar relación del estado"]')
      : document.querySelector('#assembly-panel-relations')?.hidden === false, configured));
    check(await closed() && (await observe()).serial === before.serial, 'Menu navigation and a new relation draft do not commit or solve a document');
  }
  async function retainedDraft(readReferences, canonical) {
    const original = await readReferences(), before = await observe();
    await open('file');
    if (configured) check(await page(() => ['open', 'save', 'save-as'].every(id => document.querySelector('[data-assembly-command="' + id + '"]')?.disabled)), 'Configured relation draft retains existing file-action guards in its menu');
    await close('file');
    check(canonical(await readReferences()) === canonical(original), 'Escape from a menu preserves both authored relation references');
    await open('view'); await actualControl(command('show-tree'));
    await waitFor('Menu reveals component tree', () => page(configured => configured ? document.querySelector('[data-configured-pane="model"]')?.hidden === false : document.querySelector('#assembly-panel-components')?.hidden === false, configured));
    await open('view'); await actualControl(command('show-relations'));
    await waitFor('Menu returns to relation editing', () => page(configured => configured ? document.querySelector('[data-configured-pane="relation"]')?.hidden === false : document.querySelector('#assembly-panel-relations')?.hidden === false, configured));
    check(canonical(await readReferences()) === canonical(original) && (await observe()).serial === before.serial, 'Menu tree/editor navigation retains the draft without a native request');
  }
  return { initial, retainedDraft };
};
