'use strict';

// Observe the initial editor before any reveal/scroll helper. A successful
// control setter later in the workflow does not prove initial accessibility.
module.exports = async function inspectPartParameterLayout({ page, observe, recovery, check, canonical, records }, phase, secondEnabled, operation = 'boss') {
  check(operation === 'boss' || operation === 'cut', 'Only additive/subtractive revolution layouts are admitted');
  const before = await observe.counters(), saved = await recovery();
  const layout = await page((secondEnabled, operation) => {
    const panel = document.querySelector('.property-manager.property-manager-revolve');
    const header = panel?.querySelector('.property-manager-header');
    if (!panel || !header) throw Error('Current revolution panel required');
    const labels = ['Croquis de la operación', 'Eje de revolución', 'Condición final de revolución', 'Ángulo',
      'Invertir dirección', 'Dirección 2', ...(secondEnabled ? ['Ángulo de dirección 2'] : []),
      ...(operation === 'boss' ? ['Resultado del saliente'] : []), 'Nombre de operación'];
    if (operation === 'cut' && panel.querySelector('[aria-label="Resultado del saliente"]')) throw Error('A cut must not offer additive output modes');
    const elements = labels.map(label => {
      const matches = panel.querySelectorAll('[aria-label="' + label + '"]');
      if (matches.length !== 1) throw Error('One mounted parameter required: ' + label);
      return matches[0];
    });
    const rectangle = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const p = panel.getBoundingClientRect(), h = header.getBoundingClientRect();
    const clip = { left: Math.max(0, p.left + panel.clientLeft), right: Math.min(innerWidth, p.left + panel.clientLeft + panel.clientWidth),
      top: Math.max(0, p.top + panel.clientTop, h.bottom), bottom: Math.min(innerHeight, p.top + panel.clientTop + panel.clientHeight) };
    const fields = elements.map((element, i) => {
      const r = element.getBoundingClientRect(), box = element.matches('input[type="number"]') ? element.parentElement.getBoundingClientRect() : r;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { label: labels[i], rect: rectangle(r), controlBox: rectangle(box),
        visible: !element.closest('[hidden]') && r.width > 0 && r.height > 0 && r.left >= clip.left && r.right <= clip.right
          && r.top >= clip.top && r.bottom <= clip.bottom && !!hit && (element === hit || element.contains(hit)),
        followsPrevious: i === 0 || !!(elements[i - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    const confirmation = ['Aceptar operación', 'Cancelar operación'].map(title => {
      const element = header.querySelector('button[title="' + title + '"]'), r = element?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { title, visible: !!r && r.top >= p.top && r.bottom <= clip.bottom && r.left >= clip.left && r.right <= clip.right && !!hit && (hit === element || element.contains(hit)) };
    });
    return { viewport: { width: innerWidth, height: innerHeight }, scrollTop: panel.scrollTop, clip, header: rectangle(h), fields, confirmation };
  }, secondEnabled, operation);
  records.push({ phase, initialParameterLayout: layout });
  check(layout.scrollTop === 0, 'The revolution editor opens at its initial unscrolled position');
  check(layout.fields.every(field => field.followsPrevious), 'Profile, axis and direction controls precede body options and Name in DOM order');
  check(layout.fields.slice(0, 4).every(field => field.visible), 'Profile, axis, end condition and first angle are visible before any reveal or scroll');
  check(layout.fields.slice(0, 4).every(field => field.controlBox.height >= 28), 'Primary parameter control boxes retain at least 28 CSS pixels');
  check(layout.confirmation.every(button => button.visible), 'Initial accept and cancel controls remain visible and hit-tested');
  check(canonical(await observe.counters()) === canonical(before) && await recovery() === saved,
    'Read-only layout inspection changes no observed worker request, error count or recovery');
};
