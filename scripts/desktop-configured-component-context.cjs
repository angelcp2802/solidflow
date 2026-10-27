'use strict';

// Original two-prism fixture from configured-components-original.cjs. This
// observes real menus/native responses; it never injects application state.
module.exports = function configuredComponentContext(c) {
  const { page, navigation, pointer, menuKey, captureComponentMenu, waitFor, check, canonical,
    observe, recovery, response, button, control, navigateScope, geometry, checks } = c;
  const action = id => '[data-cad-context-action="' + id + '"]';
  const row = path => '[data-assembly-tree-key=' + JSON.stringify(JSON.stringify(['occurrence', path,
    path.length === 1 ? 'authoring-shared' : 'authoring-anchor', 'r1'])) + ']';
  async function menu(path, name) {
    return waitFor('exact focused component menu', () => page((path, name) => {
      const menus = document.querySelectorAll('.cad-context-menu[role="menu"]'), menu = menus[0];
      if (menus.length !== 1 || !menu.contains(document.activeElement)) return false;
      const r = menu.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) throw Error('Menu must fit the compact viewport');
      const owner = path.slice(0, -1).join(' / ') || 'Raíz', heading = menu.querySelector('.part-feature-context-heading')?.textContent;
      if (heading !== name + ' · ' + owner + ' · ' + (path.length === 1 ? 'demo' : 'A')) return false;
      return [...menu.querySelectorAll('[data-cad-context-action]')].map(e => ({ id: e.dataset.cadContextAction, label: e.textContent.trim(), disabled: e.disabled }));
    }, path, name));
  }
  async function openTree(path, name, key = null) {
    const selector = row(path);
    await navigation.reveal(selector);
    const p = await page(selector => {
      const e = document.querySelector(selector); e.scrollIntoView({ block: 'nearest' });
      const r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (e.disabled || e.closest('[hidden]') || !e.contains(document.elementFromPoint(point.x, point.y))) throw Error('Hit-tested current tree row required');
      e.focus(); return point;
    }, selector);
    if (key) await menuKey(key, key === 'F10');
    else { await pointer('mouseMoved', p); await pointer('mousePressed', p, 2); await pointer('mouseReleased', p, 2); }
    return menu(path, name);
  }
  async function choose(id) {
    const point = await page(selector => {
      const e = document.querySelector(selector);
      if (!e || e.disabled || !e.closest('.cad-context-menu')?.contains(document.activeElement)) throw Error('Enabled current menu action required');
      const r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (!e.contains(document.elementFromPoint(point.x, point.y))) throw Error('Hit-tested current menu action required');
      return point;
    }, action(id));
    await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    await waitFor('menu closed after action', () => page(() => !document.querySelector('.cad-context-menu')));
  }
  async function escape(selector) {
    await menuKey('Escape');
    await waitFor('Escape restores initiating focus and retains selection', () => page(selector => {
      const e = document.querySelector(selector);
      return !document.querySelector('.cad-context-menu') && document.activeElement === e
        && (e.getAttribute('aria-selected') === 'true' || e.matches('.assembly-viewport'));
    }, selector));
  }
  async function initial(doc) {
    await navigateScope('["right"]');
    const before = await observe(), ipcBefore = c.ipc.length, dialogs = c.dialogCounts();
    const actions = await openTree(['left', 'anchor'], 'anchor');
    check(canonical(actions) === canonical([
      { id: 'component-properties', label: 'Propiedades', disabled: false }, { id: 'component-fixed', label: 'Flotar', disabled: false },
      { id: 'component-visible', label: 'Ocultar', disabled: false }, { id: 'component-suppressed', label: 'Suprimir', disabled: false },
    ]), 'Configured component menu contains the four supported actions');
    await captureComponentMenu();
    await menuKey('End'); check(await page(() => document.activeElement?.dataset.cadContextAction === 'component-suppressed'), 'End reaches last menu action');
    await menuKey('Home'); check(await page(() => document.activeElement?.dataset.cadContextAction === 'component-properties'), 'Home returns to Properties');
    await escape(row(['left', 'anchor']));
    await recovery(doc);
    check((await observe()).serial === before.serial && c.ipc.length === ipcBefore && canonical(c.dialogCounts()) === canonical(dialogs),
      'Context retargeting, owner navigation and Escape perform no native/file work');
    check(await page(() => document.querySelector('[aria-label="Ámbito de configuración"]').value === '["left"]'
      && document.querySelector('[aria-label="Ocurrencia configurada"]').value === 'anchor'), 'Right click selects exact reused owner and occurrence');
    await openTree(['left', 'anchor'], 'anchor', 'ContextMenu');
    await choose('component-properties');
    await waitFor('Properties reveals and focuses its first enabled existing control', () => page(() =>
      document.querySelector('[data-configured-pane="occurrence"]')?.hidden === false
        && document.activeElement?.closest('#configured-occurrence-inspector')
        && document.activeElement.textContent === 'Vista previa de liberar componente'));
    await openTree(['left', 'anchor'], 'anchor', 'F10'); await escape(row(['left', 'anchor']));

    // Frontal uses the literal original envelope [0,0,0]..[22,3,4].
    // Project its right prism centre through the unchanged 1.3 fit margin.
    await button('Frontal', '[aria-label="Vistas del ensamblaje configurado"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const p = await page(() => {
      const e = document.querySelector('.configured-assembly-view canvas'), r = e.getBoundingClientRect();
      const pixels = r.height / (1.3 * Math.hypot(22, 3, 4));
      return { x: r.left + r.width / 2 + 10 * pixels, y: r.top + r.height / 2 };
    });
    await pointer('mouseMoved', p); await pointer('mousePressed', p, 2); await pointer('mouseReleased', p, 2);
    await menu(['right', 'anchor'], 'anchor');
    const viewport = '.configured-assembly-view .assembly-viewport';
    await escape(viewport);
    await menuKey('ContextMenu'); await menu(['right', 'anchor'], 'anchor'); await escape(viewport);
    check((await observe()).serial === before.serial, 'Viewport pointer and keyboard menus retain the original committed native scene');

    for (const [id, field, value, reverse] of [
      ['component-visible', 'visible', false, 'Mostrar'], ['component-suppressed', 'suppressed', true, 'Activar'],
    ]) {
      const expected = structuredClone(doc), variant = expected.catalog.find(c => c.definition.id === 'authoring-shared').configurations.find(v => v.id === 'A');
      variant.occurrences.push({ occurrenceId: 'anchor', [field]: value });
      let previous = await observe(); await openTree(['left', 'anchor'], 'anchor'); await choose(id);
      let built = await response(previous.serial, 'build-configured-assembly');
      check(canonical(built.current.document) === canonical(expected), 'State action edits exact A declaration shared by both owners'); await recovery(expected);
      if (field === 'visible') {
        geometry(built.response.value, expected, 0, 'context-hidden');
        check(built.response.value.scene.bodies.every(b => b.visible === false) && built.response.value.scene.visibleBounds === null, 'Hidden prisms retain native physical totals and have no visible bounds');
      } else {
        const scene = built.response.value.scene;
        check(scene.solidCount === 0 && scene.bodies.length === 0 && scene.volume === 0 && scene.area === 0, 'Suppressed prisms allocate no physical bodies');
      }
      const stateActions = await openTree(['left', 'anchor'], 'anchor');
      check(stateActions.find(a => a.id === id).label === reverse, 'State action presents its exact inverse');
      if (field === 'suppressed') check(stateActions.find(a => a.id === 'component-fixed').disabled, 'Suppressed occurrence cannot start native Fix/Float');
      previous = await observe(); await choose(id);
      const restored = structuredClone(expected); restored.catalog.find(c => c.definition.id === 'authoring-shared').configurations.find(v => v.id === 'A').occurrences[0][field] = !value;
      built = await response(previous.serial, 'build-configured-assembly'); await recovery(restored); geometry(built.response.value, restored, 0, 'context-restored');
      for (const expectedHistory of [expected, doc]) {
        previous = await observe(); await button('Deshacer', c.NAV); built = await response(previous.serial, 'build-configured-assembly');
        check(canonical(built.current.document) === canonical(expectedHistory), 'Undo restores exact state-action declarations'); await recovery(expectedHistory);
      }
    }
    const suppressedOwner = structuredClone(doc);
    suppressedOwner.catalog.find(c => c.definition.id === 'authoring-root').configurations.find(v => v.id === 'demo').occurrences.find(o => o.occurrenceId === 'left').suppressed = true;
    let previous = await observe(); await openTree(['left'], 'left'); await choose('component-suppressed');
    let built = await response(previous.serial, 'build-configured-assembly'); await recovery(suppressedOwner);
    const remaining = built.response.value.scene.bodies;
    check(canonical(built.current.document) === canonical(suppressedOwner) && built.response.value.scene.solidCount === 1
      && remaining.length === 1 && canonical(remaining[0].component.occurrencePath) === canonical(['right', 'anchor'])
      && remaining[0].component.definition.id === 'authoring-anchor' && remaining[0].component.definition.revision === 'r1'
      && Math.abs(built.response.value.scene.volume - 24) <= 1e-5
      && Math.abs(remaining[0].area - 52) <= 1e-5
      && remaining[0].bounds.min.every((v, i) => Math.abs(v - [20, 0, 0][i]) <= 1e-6)
      && remaining[0].bounds.max.every((v, i) => Math.abs(v - [22, 3, 4][i]) <= 1e-6), 'Parent suppression removes only the left original 24 mm3 prism');
    const inherited = await openTree(['left', 'anchor'], 'anchor');
    check(canonical(inherited.map(a => [a.id, a.disabled])) === canonical([
      ['component-properties', false], ['component-fixed', true], ['component-visible', true], ['component-suppressed', true],
    ]), 'Suppressed owner permits Properties and blocks all three component mutations');
    await menuKey('End'); check(await page(() => document.activeElement?.dataset.cadContextAction === 'component-properties'), 'Menu keyboard navigation skips inherited disabled actions');
    await escape(row(['left', 'anchor']));
    previous = await observe(); await button('Deshacer', c.NAV); built = await response(previous.serial, 'build-configured-assembly');
    await recovery(doc); geometry(built.response.value, doc, 0, 'context-owner-undo');
    await openTree(['left', 'anchor'], 'anchor'); await navigateScope('["right"]'); await navigateScope('["left"]');
    check(await page(() => !document.querySelector('.cad-context-menu')), 'Owner navigation closes the old context across A/B/A');
    checks.push({ configuredComponentContexts: { treePointer: true, contextKey: true, shiftF10: true, viewportPointer: true, viewportKey: true,
      properties: true, visibility: true, suppression: true, inheritedSuppression: true,
      limits: 'Hidden original two-prism fixture; CDP pointer/key for opening/actions, scripted DOM navigation and initial focus. No OS input, whole-application or external-runtime parity claim.' } });
  }
  return { openTree, choose, initial };
};
