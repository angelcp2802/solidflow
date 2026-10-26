'use strict';

// Read actual layout; the caller performs stationary, hit-tested CDP presses.
// No camera/application state injection or CAD geometry substitute is used.
module.exports = async function compactViewportControls({ configured, page, waitFor, actualControl, observe, check, checks, canonical }) {
  const selector = configured ? '[aria-label="Vistas del ensamblaje configurado"]' : '.assembly-view-tools';
  const names = ['Vista anterior', 'Isométrica', 'Frontal', 'Superior', 'Ajustar', ...(configured ? [] : ['Seleccionar caras', 'Arrastrar posición', 'Arrastrar giro', 'Desactivar manipulador'])];
  const inspect = () => page(selector => {
    const bars = document.querySelectorAll(selector), bar = bars[0], viewport = document.querySelector('.assembly-viewport');
    if (bars.length !== 1 || !bar || !viewport) throw Error('One compact toolbar and assembly viewport required');
    const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const visible = e => !e.closest('[hidden]') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const bounds = rect(viewport), box = rect(bar), canvas = viewport.querySelector(':scope > canvas');
    const inside = (a, b) => a.width > 0 && a.height > 0 && a.left >= b.left && a.top >= b.top && a.right <= b.right && a.bottom <= b.bottom;
    const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const buttons = [...bar.querySelectorAll('button')].map(button => {
      const r = rect(button), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { text: button.textContent.trim(), label: button.getAttribute('aria-label') || button.textContent.trim(), title: button.title,
        disabled: button.disabled, pressed: button.getAttribute('aria-pressed'), rect: r, visible: visible(button),
        contained: inside(r, box) && inside(r, bounds), ownHit: !!hit && (hit === button || button.contains(hit)),
        hit: hit ? { tag: hit.tagName, class: hit.getAttribute('class') } : null };
    });
    const orientation = [...bar.querySelectorAll('select')].map(select => {
      const r = rect(select), hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      return { label: select.getAttribute('aria-label'), title: select.title, value: select.value, disabled: select.disabled,
        rect: r, visible: visible(select), contained: inside(r, box) && inside(r, bounds), ownHit: !!hit && (hit === select || select.contains(hit)),
        overlaps: buttons.filter(button => overlap(r, button.rect)).map(button => button.text),
        options: [...select.options].map(option => ({ value: option.value, text: option.textContent.trim(), disabled: option.disabled })) };
    });
    const nearby = [...document.querySelectorAll('.assembly-canvas-label,.assembly-origin-tools,[data-origin-key],.configured-assembly-layout main > p[role="status"]')]
      .filter(visible).map(e => ({ label: e.getAttribute('aria-label') || e.className, rect: rect(e) }));
    const overlapPairs = buttons.flatMap((a, i) => buttons.slice(i + 1).filter(b => overlap(a.rect, b.rect)).map(b => [a.text, b.text]));
    const covered = nearby.filter(e => overlap(e.rect, box));
    return { window: { width: innerWidth, height: innerHeight }, viewport: bounds, toolbar: box,
      toolbarVisible: visible(bar), contained: inside(box, bounds) && inside(box, { left: 0, top: 0, right: innerWidth, bottom: innerHeight }),
      canvasReady: !!canvas && Math.abs(rect(canvas).width - viewport.clientWidth) < 1 && Math.abs(rect(canvas).height - viewport.clientHeight) < 1,
      groups: [...bar.querySelectorAll('[role="group"]')].map(e => e.getAttribute('aria-label')), buttons, orientation, overlapPairs, covered, nearby };
  }, selector);
  const state = () => page(configured => {
    const root = document.querySelector(configured ? '.configured-assembly-workspace' : '.assembly-app');
    const history = configured ? [...root.querySelectorAll('[aria-label="Archivo del ensamblaje configurado"] button')].filter(e => ['Deshacer', 'Rehacer'].includes(e.textContent.trim()))
      : ['Deshacer ensamblaje', 'Rehacer ensamblaje'].map(label => root.querySelector('button[aria-label="' + label + '"]'));
    if (history.length !== 2 || history.some(e => !e)) throw Error('Both current history controls required');
    return { recovery: localStorage.getItem('solidflow.autosave'), busy: root.getAttribute('aria-busy'),
      history: history.map(e => ({ name: e.getAttribute('aria-label') || e.textContent.trim(), disabled: e.disabled })),
      selection: [...root.querySelectorAll('[data-assembly-tree-key]')].map(e => ({ key: e.getAttribute('data-assembly-tree-key'), selected: e.getAttribute('aria-selected'), pressed: e.getAttribute('aria-pressed') })),
      panes: [...root.querySelectorAll('[data-configured-pane],[role="tabpanel"][id^="assembly-panel-"]')].map(e => ({ key: e.getAttribute('data-configured-pane') || e.id, hidden: e.hidden })),
      picking: root.querySelector('.assembly-viewport')?.getAttribute('data-reference-picking'),
      drag: root.querySelector('.assembly-viewport')?.getAttribute('data-drag-axis') };
  }, configured);
  async function stable(label) {
    let previous = '', since = 0;
    return waitFor('stationary compact toolbar ' + label, async () => {
      const value = await inspect(), key = canonical(value);
      if (key !== previous) { previous = key; since = Date.now(); }
      return value.canvasReady && Date.now() - since >= 120 ? value : false;
    });
  }
  function verify(value, label) {
    const diagnostic = JSON.stringify(value);
    check(value.toolbarVisible && value.contained && value.toolbar.height === 32, label + ': compact 32px toolbar fully inside viewport/window: ' + diagnostic);
    check(canonical(value.buttons.map(button => button.text)) === canonical(names), label + ': exact unique current button command inventory');
    check(value.buttons.every(button => button.visible && button.contained && button.ownHit && button.rect.width === 28 && button.rect.height === 26 && button.title), label + ': all icon commands retain accessible text and full hit targets: ' + diagnostic);
    check(value.orientation.length === 1, label + ': one separate standard-view selector');
    const orientation = value.orientation[0];
    check(orientation.label === 'Orientación de vista' && orientation.title === 'Vistas estándar' && orientation.value === '' && !orientation.disabled
      && orientation.visible && orientation.contained && orientation.ownHit && orientation.rect.width === 66 && orientation.rect.height >= 26
      && !orientation.overlaps.length, label + ': named enabled selector has its full unobstructed hit target within the toolbar: ' + diagnostic);
    const choices = [['', 'Vistas', true], ['front', 'Frontal (Ctrl+1)', false], ['back', 'Posterior (Ctrl+2)', false],
      ['left', 'Izquierda (Ctrl+3)', false], ['right', 'Derecha (Ctrl+4)', false], ['top', 'Superior (Ctrl+5)', false],
      ['bottom', 'Inferior (Ctrl+6)', false], ['iso', 'Isométrica (Ctrl+7)', false]];
    check(canonical(orientation.options.map(option => [option.value, option.text, option.disabled])) === canonical(choices), label + ': exact ordered selector choices and shortcut labels');
    check(value.buttons.every(button => button.rect.top === value.buttons[0].rect.top) && !value.overlapPairs.length && !value.covered.length,
      label + ': one command row without command/context/origin/instruction overlaps: ' + diagnostic);
  }
  const before = await state(), counters = await observe.counters(), initial = await stable('initial');
  verify(initial, 'Initial');
  const views = [];
  for (const name of ['Frontal', 'Isométrica']) {
    await actualControl(selector + ' button', name);
    // Allow the real view callback and camera fit effect to reach a rendered frame.
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    const layout = await stable(name); verify(layout, name); views.push({ name, toolbar: layout.toolbar, viewport: layout.viewport });
    check(canonical(await state()) === canonical(before), name + ': view command preserves recovery, history, selection, inspector and picking state');
    check(canonical(await observe.counters()) === canonical(counters), name + ': camera command sends no CAD request or worker error');
  }
  checks.push({ compactViewportControls: { configured, initial, views, serial: counters.serial,
    input: 'Existing navigation and stationary center-hit CDP presses: Frontal, then Isométrica.',
    limits: 'Actual current window and original idle scene only. Layout and command interaction are verified; camera orientation is not inferred from layout. Only currently rendered context/origin/instruction elements enter overlap checks. No drag or active relation-picking claim.' } });
};
