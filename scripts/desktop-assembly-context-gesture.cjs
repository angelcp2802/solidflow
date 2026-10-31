'use strict';

// The original fixtures and their geometry/file oracles remain in each caller.
// Real CDP presses/releases are combined with an explicitly synthetic early
// context intent; this controls ordering, not the operating system's delivery.
module.exports = async function assemblyContextGesture(c, { kind, point, heading }) {
  const { page, pointer, menuKey, waitFor, check, checks, canonical, observe } = c;
  const evidence = { kind, point, heading, cases: [], cleanupErrors: [],
    limits: 'Original standard/configured prism fixture. Trusted CDP pointer input with controlled untrusted early MouseEvent context intent; no application state, scene, camera or CAD-result injection. Natural OS event ordering and human acceptance are separate.' };
  checks.push({ assemblyContextGesture: evidence });
  const state = () => page(() => {
    const hosts = document.querySelectorAll('.assembly-viewport'), host = hosts[0];
    if (hosts.length !== 1 || host.querySelectorAll(':scope > canvas').length !== 1) throw Error('One assembly canvas required');
    const normal = host.closest('[data-normal-selection-kind]');
    return { menus: [...document.querySelectorAll('.cad-context-menu[role="menu"]')].map(menu => ({
      heading: menu.querySelector('.part-feature-context-heading')?.textContent.trim(),
      focused: menu.contains(document.activeElement),
      actions: [...menu.querySelectorAll('[data-cad-context-action]')].map(e => e.dataset.cadContextAction),
    })), selection: {
      tree: [...document.querySelectorAll('[data-assembly-tree-key][aria-selected="true"],[data-assembly-origin-tree-key][aria-selected="true"]')]
        .map(e => [e.getAttribute('data-assembly-tree-key'), e.getAttribute('data-assembly-origin-tree-key')]),
      scope: document.querySelector('[aria-label="Ámbito de configuración"]')?.value ?? null,
      occurrence: document.querySelector('[aria-label="Ocurrencia configurada"]')?.value ?? null,
      normal: normal ? [normal.dataset.normalSelectionKind, normal.dataset.normalSelectionKeys] : null,
    }, recovery: localStorage.getItem('solidflow.autosave'),
    history: [...document.querySelectorAll('button[aria-label^="Deshacer"],button[aria-label^="Rehacer"],[aria-label="Archivo del ensamblaje configurado"] button')]
      .filter(e => /Deshacer|Rehacer/.test(e.getAttribute('aria-label') || e.textContent.trim()))
      .map(e => [e.getAttribute('aria-label') || e.textContent.trim(), e.disabled]) };
  });
  const original = await state(), counters = await observe.counters();
  check(original.menus.length === 0, kind + ': no context before gesture audit');
  const record = (label, value) => {
    evidence.cases.push({ label, menus: value.menus, selection: value.selection });
    return value;
  };
  const unchanged = async (before, label) => {
    const after = record(label, await state());
    check(after.menus.length === 0 && canonical(after.selection) === canonical(before.selection), label + ': no popup or selection change');
    return after;
  };
  async function press() {
    await page(point => {
      const host = document.querySelector('.assembly-viewport'), canvas = host?.querySelector(':scope > canvas');
      if (!canvas || document.elementFromPoint(point.x, point.y) !== canvas) throw Error('Original projected material point must hit its current canvas');
      host.focus();
    }, point);
    await pointer('mouseMoved', point); await pointer('mousePressed', point, 2);
  }
  async function earlyIntent() {
    const accepted = await page(point => {
      const canvas = document.querySelector('.assembly-viewport > canvas');
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: point.x, clientY: point.y });
      const trusted = event.isTrusted;
      canvas.dispatchEvent(event);
      return { trusted, prevented: event.defaultPrevented };
    }, point);
    check(!accepted.trusted && accepted.prevented, kind + ': controlled early intent is explicitly untrusted and handled');
  }
  async function release() { await pointer('mouseReleased', point, 2); }
  async function heldGesture(run) {
    let held = true, failed = false;
    try {
      await press();
      await run(async () => { await release(); held = false; });
    } catch (error) { failed = true; throw error; }
    finally {
      if (held) {
        try { await release(); }
        catch (error) {
          evidence.cleanupErrors.push(String(error?.message ?? error).slice(0, 240));
          if (!failed) throw error;
        }
      }
    }
  }
  async function rejected(label, cancel) {
    const before = await state();
    await heldGesture(async finish => {
      await earlyIntent();
      await unchanged(before, label + ' before actual release');
      await cancel();
      await finish();
      await unchanged(before, label + ' after actual release');
    });
  }
  await rejected('Early intent then a 12px drag returning to its start', async () => {
    await pointer('mouseMoved', { x: point.x + 12, y: point.y }, 2);
    await pointer('mouseMoved', point, 2);
  });
  await rejected('Escape cancels a held context', () => menuKey('Escape'));

  // A keyboard menu supersedes the held pointer intent and retains its target
  // even if a late native contextmenu follows the actual pointer release.
  const beforeKeyboard = await state();
  await heldGesture(async finish => {
    await earlyIntent();
    await unchanged(beforeKeyboard, 'Keyboard replacement before activation');
    await menuKey('ContextMenu');
    const keyboard = await waitFor('current selected keyboard context', async () => {
      const value = await state(); return value.menus.length === 1 && value.menus[0].focused ? value : false;
    });
    await finish();
    const released = record('Keyboard replacement survives pointer release', await state());
    check(canonical(released.menus) === canonical(keyboard.menus) && canonical(released.selection) === canonical(keyboard.selection),
      kind + ': pointer release cannot replace the keyboard context');
    await menuKey('Escape');
    await waitFor('keyboard context closes with viewport focus', () => page(() => !document.querySelector('.cad-context-menu')
      && document.activeElement === document.querySelector('.assembly-viewport')));
  });

  for (const early of [true, false]) {
    const before = await state();
    await heldGesture(async finish => {
      if (early) {
        await earlyIntent();
        await unchanged(before, 'Completed click still waits for its actual release');
      }
      await finish();
      const opened = await waitFor('one exact released component context', async () => {
        const value = await state(); return value.menus.length === 1 && value.menus[0].focused && value.menus[0].heading === heading ? value : false;
      });
      record(early ? 'Controlled early intent completes on release' : 'Native context completes after the actual click', opened);
      check(opened.menus[0].actions.includes('component-properties'), kind + ': released target offers current component Properties');
      await menuKey('Escape');
      await waitFor('released component context closes', () => page(() => !document.querySelector('.cad-context-menu')));
      const closed = await state();
      check(canonical(closed.selection) === canonical(opened.selection), kind + ': Escape retains the released component selection');
    });
  }
  const final = await state();
  check(final.recovery === original.recovery && canonical(final.history) === canonical(original.history)
    && canonical(await observe.counters()) === canonical(counters), kind + ': gesture ordering preserves recovery, history and all worker counters');
};
