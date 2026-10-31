'use strict';

// Current global-tree origins nominate existing form options. Original prisms
// and native geometry/persistence oracles stay in the component workflow.
module.exports = function originContextWorkflow(c) {
  const { page, navigation, pointer, menuKey, cameraFrame, captureComponentMenu, waitFor, check, canonical, observe, control, button,
    navigateScope, recovery, response, geometry, history, apply, checks, NAV } = c;
  const viewport = '.configured-assembly-view .assembly-viewport';
  async function frame() {
    const p = await page(() => { const r = document.querySelector('[aria-label="Vistas del ensamblaje configurado"]').getBoundingClientRect();
      return { x: r.left + 4, y: r.top + 4 }; });
    await pointer('mouseMoved', p);
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return cameraFrame();
  }
  async function state(title) {
    return waitFor('focused context ' + title, () => page(title => {
      const menus = document.querySelectorAll('.cad-context-menu'), menu = menus[0];
      if (menus.length !== 1 || !menu.contains(document.activeElement) || menu.querySelector('.part-feature-context-heading')?.textContent !== title) return false;
      const r = menu.getBoundingClientRect();
      if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) throw Error('Entire context must fit current compact window');
      return [...menu.querySelectorAll('[data-cad-context-action]')].map(e => ({ id: e.dataset.cadContextAction, disabled: e.disabled }));
    }, title));
  }
  async function press(selector, right = false) {
    const point = await page(selector => {
      const e = document.querySelector(selector);
      if (!e || e.disabled || e.closest('[hidden]')) throw Error('Current enabled context control required');
      e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(), p = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      if (!e.contains(document.elementFromPoint(p.x, p.y))) throw Error('Hit-tested visible context control required');
      return p;
    }, selector);
    await pointer('mouseMoved', point); await pointer('mousePressed', point, right ? 2 : 1); await pointer('mouseReleased', point, right ? 2 : 0);
  }
  async function choose(id) {
    await press('[data-cad-context-action="' + id + '"]');
    await waitFor('context closes after command', () => page(() => !document.querySelector('.cad-context-menu')));
  }
  async function origin(owner, kind, key = null) {
    const selector = await page((owner, kind) => {
      const matches = [...document.querySelectorAll('[data-assembly-origin-tree-owner]')].filter(e => {
        const r = JSON.parse(e.dataset.assemblyOriginTreeReference);
        return e.dataset.assemblyOriginTreeOwner === JSON.stringify(owner) && r.kind === kind
          && (kind === 'principal-plane' ? r.plane === 'XY' : r.axis === 'Z');
      });
      if (matches.length !== 1) throw Error('One exact global origin row required');
      return '[data-assembly-tree-key=' + JSON.stringify(matches[0].dataset.assemblyTreeKey) + ']';
    }, owner, kind);
    await navigation.reveal(selector);
    if (key) { await page(selector => document.querySelector(selector).focus(), selector); await menuKey(key, key === 'F10'); }
    else await press(selector, true);
    const title = (kind === 'principal-plane' ? 'Plano XY' : 'Eje Z') + ' · ' + (owner.join(' / ') || 'Raíz');
    return { selector, actions: await state(title) };
  }
  async function background() {
    const p = await page(() => { const r = document.querySelector('.configured-assembly-view canvas').getBoundingClientRect();
      return { x: r.left + 8, y: r.bottom - 8 }; });
    await pointer('mouseMoved', p); await pointer('mousePressed', p, 2); await pointer('mouseReleased', p, 2);
    return state('Vista del ensamblaje');
  }
  async function close(selector) {
    await menuKey('Escape'); await waitFor('Escape restores initiating context focus', () => page(selector =>
      !document.querySelector('.cad-context-menu') && document.activeElement === document.querySelector(selector), selector));
  }
  async function present(doc) {
    const before = await observe(); await navigateScope('["left"]');
    let menu = await origin(['right', 'anchor'], 'principal-plane');
    await captureComponentMenu('origin');
    check(canonical(menu.actions) === canonical([
      { id: 'view-normal', disabled: false }, { id: 'origin-relation', disabled: true }, { id: 'origin-owner', disabled: false },
    ]), 'Outside origin supports Normal/owner but cannot become a local relation endpoint');
    await choose('origin-owner');
    check(await page(() => document.querySelector('[aria-label="Ámbito de configuración"]').value === '["right"]'
      && document.querySelector('[aria-label="Ocurrencia configurada"]').value === 'anchor'), 'Origin owner selects exact parent scope and occurrence');
    menu = await origin(['right', 'anchor'], 'principal-plane', 'ContextMenu'); await close(menu.selector);
    await button('Isométrica', '[aria-label="Vistas del ensamblaje configurado"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const iso = await frame();
    await background();
    await captureComponentMenu('background');
    check(await page(() => document.querySelector('[aria-label="Ocurrencia configurada"]').value === 'anchor'), 'Background right click retains selected owner');
    await choose('view-front');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const front = await waitFor('Frontal visibly changes the same geometry crop', async () => { const current = await frame(); return current.sha256 !== iso.sha256 ? current : false; });
    check(front.sha256 !== iso.sha256, 'Background Frontal changes the actual rendered geometry crop from Isometric');
    await background(); await choose('view-fit');
    await background(); await choose('selection-clear');
    check(await page(() => document.querySelector('[aria-label="Ocurrencia configurada"]').value === ''
      && !document.querySelector('[data-assembly-origin-tree-key][aria-selected="true"]')), 'Explicit deselection clears component and origin state');
    // The DOM selection commits before the Three.js frame drops its old origin
    // catalog. Start keyboard input only after that real presentation boundary.
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await waitFor('old origin labels removed after deselection', () => page(() =>
      document.querySelector('.assembly-origin-labels')?.querySelectorAll('button').length === 0));
    await page(selector => document.querySelector(selector).focus(), viewport); await menuKey('ContextMenu');
    const views = await state('Vista del ensamblaje');
    const emptyNormal = await page(() => { const e = document.querySelector('.configured-assembly-view');
      return { kind: e.dataset.normalSelectionKind, enabled: e.dataset.normalEnabled === 'true' }; });
    check(views.length === 14 && emptyNormal.kind === 'none' && views.find(a => a.id === 'view-normal').disabled === !emptyNormal.enabled,
      'Background keyboard menu exposes all fourteen actions and preserves the existing empty-selection Normal To contract');
    await close(viewport);
    await navigateScope('[]');
    menu = await origin([], 'principal-plane', 'F10'); await close(menu.selector);
    await button('Isométrica', '[aria-label="Vistas del ensamblaje configurado"]');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const beforeNormal = await frame();
    menu = await origin([], 'principal-plane', 'F10'); await choose('view-normal');
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const normal = await waitFor('Normal To visibly changes the same selected origin crop', async () => { const current = await frame(); return current.sha256 !== beforeNormal.sha256 ? current : false; });
    check(normal.sha256 !== beforeNormal.sha256, 'Origin Normal To changes the actual crop from the same selected origin in Isometric');
    await page(selector => document.querySelector(selector).focus(), viewport); await menuKey('ContextMenu');
    await state('Plano XY · Raíz'); await close(viewport);
    menu = await origin([], 'principal-axis');
    check(menu.actions.find(a => a.id === 'view-normal').disabled && menu.actions.find(a => a.id === 'origin-owner').disabled, 'A single root axis has no Normal To pose or owner component');
    await choose('origin-relation');
    await waitFor('axis seeds exact root concentric role', () => page(() => {
      const first = document.querySelector('[aria-label="Referencia 1 de relación configurada"]');
      return document.querySelector('[aria-label="Tipo de relación configurada"]')?.value === 'concentric'
        && first?.value === JSON.stringify({ kind: 'principal-axis', component: null, axis: 'Z' });
    }));
    await button('Cerrar edición de relación configurada'); await recovery(doc);
    menu = await origin([], 'principal-plane'); await navigateScope('["left"]'); await navigateScope('[]');
    check(await page(() => !document.querySelector('.cad-context-menu')), 'Scope navigation invalidates origin menu across A/B/A');
    check((await observe()).serial === before.serial, 'Origin, owner, camera, background and draft commands perform no native edit');
    checks.push({ configuredAuxContexts: { originTreePointer: true, originContextKey: true, shiftF10: true, ownerRebase: true,
      normalCommand: true, normalRenderedChange: true, frontalRenderedChange: true, originViewportKeyboard: true, backgroundPointer: true, backgroundKeyboard: true, explicitDeselection: true, axisFormSeed: true,
      limits: 'Original compact hidden window; CDP context/action pointer and keys, scripted navigation/initial focus. No external UI parity or OS-input claim.' } });
  }
  async function relate(doc) {
    await navigateScope('[]'); await origin([], 'principal-plane'); await choose('origin-relation');
    const first = { kind: 'principal-plane', component: null, plane: 'XY' };
    const second = { kind: 'principal-plane', component: { occurrencePath: ['left', 'anchor'], definition: { id: 'authoring-anchor', revision: 'r1' } }, plane: 'XY' };
    await waitFor('root plane seeds exact first coincidence role', () => page(first =>
      document.querySelector('[aria-label="Tipo de relación configurada"]')?.value === 'coincident'
        && document.querySelector('[aria-label="Referencia 1 de relación configurada"]')?.value === JSON.stringify(first), first));
    await control('Referencia 2 de relación configurada', JSON.stringify(second));
    await control('Nombre de relación configurada', 'Original origin context coincidence');
    let before = await observe(); await button('Vista previa de relación configurada');
    let row = await response(before.serial, 'preview-configured-assembly-relation-edit'), reply = row.response.value;
    const mate = { id: row.edit.change.mate.id, name: 'Original origin context coincidence', type: 'coincident', first, second, alignment: 'aligned', suppressed: false };
    const expected = structuredClone(doc), variant = expected.catalog.find(c => c.definition.id === 'authoring-root').configurations.find(v => v.id === 'demo');
    variant.mateDeclarations = [...(variant.mateDeclarations ?? []), mate];
    check(canonical(row.current.document) === canonical(doc) && row.edit.configuration === 'demo' && canonical(row.edit.scopePath) === '[]'
      && canonical(row.edit.change.mate) === canonical(mate), 'Context editor submits literal root-state mate and exact ordered references');
    check(reply.hasToken && reply.verification.accepted, 'Actual private native producer verifies the nominated coincidence');
    checks.push({ originContextCandidate: { sourceMatches: canonical(reply.document.source) === canonical(expected.source),
      catalog: reply.document.catalog, expectedCatalog: expected.catalog } });
    check(canonical(reply.document) === canonical(expected), 'Native context coincidence preserves the complete expected declaration graph');
    geometry(reply.scene, expected, 2, 'context-coincidence-preview'); await recovery(doc);
    before = await observe(); await button('Cancelar', NAV); await response(before.serial, 'discard-configured-assembly'); await response(before.serial, 'build-configured-assembly'); await recovery(doc);
    before = await observe(); await button('Vista previa de relación configurada'); row = await response(before.serial, 'preview-configured-assembly-relation-edit');
    check(canonical(row.response.value.document) === canonical(expected), 'Retry preserves the exact context-nominated relation');
    const current = await apply(expected, 2); await history('Deshacer', doc, 2); await history('Rehacer', current, 2);
    return current;
  }
  return { present, relate };
};
