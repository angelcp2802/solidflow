'use strict';

// Inspect initial presentation before any helper reveal, field edit or scroll.
// Native work already in flight may finish; this observation must not save a draft.
module.exports = async function inspectExtrudeLayout({ page, recovery, check, records }, phase, expected) {
  const saved = await recovery();
  const layout = await page(() => {
    const panel = document.querySelector('.property-manager.property-manager-extrude');
    const header = panel?.querySelector('.property-manager-header');
    if (!panel || !header) throw Error('Current extrusion/cut property panel required');
    const one = selector => { const matches = panel.querySelectorAll(selector); if (matches.length !== 1) throw Error('One field required: ' + selector); return matches[0]; };
    const profile = one('[aria-label="Croquis de la operación"]'), end = one('[aria-label="Condición final"]'), depth = one('[aria-label="Profundidad"]');
    const reverse = [...panel.querySelectorAll('button')].filter(e => e.textContent.trim() === 'Invertir dirección');
    if (reverse.length !== 1) throw Error('One reverse control required');
    const body = one('.body-operation-panel'), name = one('[aria-label="Nombre de operación"]');
    const fields = [profile, end, depth, reverse[0], body, name], labels = ['Profile', 'End condition', 'Depth', 'Reverse', 'Bodies', 'Name'];
    const rect = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
    const p = panel.getBoundingClientRect(), h = header.getBoundingClientRect();
    const clip = { left: Math.max(0, p.left + panel.clientLeft), right: Math.min(innerWidth, p.left + panel.clientLeft + panel.clientWidth),
      top: Math.max(0, p.top + panel.clientTop, h.bottom), bottom: Math.min(innerHeight, p.top + panel.clientTop + panel.clientHeight) };
    const inspect = element => {
      const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const box = element.matches('input[type="number"]') ? element.parentElement.getBoundingClientRect() : r;
      return { rect: rect(r), box: rect(box), visible: !element.closest('[hidden]') && r.width > 0 && r.height > 0
        && r.left >= clip.left && r.right <= clip.right && r.top >= clip.top && r.bottom <= clip.bottom
        && !!hit && (hit === element || element.contains(hit)) };
    };
    return { viewport: { width: innerWidth, height: innerHeight }, scrollTop: panel.scrollTop, clip, header: rect(h),
      fields: fields.map((element, index) => ({ label: labels[index], ...inspect(element),
        followsPrevious: index === 0 || !!(fields[index - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) })),
      profile: { value: profile.value, disabled: profile.disabled }, end: end.value, depth: depth.value,
      bodyResult: body.querySelector('[aria-label="Resultado del saliente"]')?.value ?? null,
      selectedBodies: [...body.querySelectorAll('input[type="checkbox"]:checked')].map(e => e.closest('label')?.textContent.trim()),
      confirmation: ['Aceptar operación', 'Cancelar operación'].map(title => {
        const button = header.querySelector('button[title="' + title + '"]'), r = button?.getBoundingClientRect();
        const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { title, visible: !!r && r.top >= p.top && r.bottom <= clip.bottom && r.left >= clip.left && r.right <= clip.right
          && !!hit && (hit === button || button.contains(hit)) };
      }) };
  });
  records.push({ phase, initialExtrudeLayout: layout });
  check(layout.scrollTop === 0, 'Extrusion/cut opens unscrolled before any field reveal: ' + phase);
  check(layout.fields.every(field => field.followsPrevious), 'Profile, direction parameters, Bodies and Name retain their intended DOM order');
  check(layout.fields.slice(0, 3).every(field => field.visible), 'Initial profile, end condition and depth are fully contained and hit-tested: ' + JSON.stringify(layout));
  check(layout.fields.slice(0, 3).every(field => field.rect.height >= 28 && field.box.height >= 28), 'Primary extrusion/cut controls and boxes retain at least 28 CSS pixels');
  check(layout.confirmation.every(button => button.visible), 'Initial extrusion/cut accept and cancel remain visible and hit-tested');
  check(layout.profile.value === expected.profileId && layout.profile.disabled === expected.locked && layout.end === 'blind',
    'Initial layout retains the exact source sketch, staged lock and blind end condition');
  check(await recovery() === saved, 'Read-only initial layout inspection preserves committed recovery');
};
