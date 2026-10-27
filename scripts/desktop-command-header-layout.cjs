'use strict';

// Read-only initial layout evidence. No reveal, scrolling, focus or app-state writes.
module.exports = async function commandHeaderLayout({ page, check, checks }, phase, kind) {
  const layout = await page(() => {
    const headers = [...document.querySelectorAll('.command-header')].filter(e => e.getClientRects().length);
    const result = { viewport: { width: innerWidth, height: innerHeight }, count: headers.length };
    if (headers.length !== 1) return result;
    const header = headers[0], rect = e => {
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const h = rect(header), visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const describe = e => {
      const r = rect(e), point = { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
      let left = Math.max(0, h.left), right = Math.min(innerWidth, h.right), top = Math.max(0, h.top), bottom = Math.min(innerHeight, h.bottom);
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { rect: r, clip: { left, right, top, bottom }, point,
        contained: r.width > 0 && r.height > 0 && r.left >= left - .5 && r.right <= right + .5 && r.top >= top - .5 && r.bottom <= bottom + .5,
        ownHit: !!hit && (hit === e || e.contains(hit)), hitTarget: hit ? { tag: hit.tagName, className: typeof hit.className === 'string' ? hit.className : null } : null };
    };
    const controls = [...header.querySelectorAll('button,input,select')].filter(visible);
    const menus = [...header.querySelectorAll('[data-assembly-menu]')], quick = [...header.querySelectorAll('.command-header-quick-actions button')];
    const documentSlot = header.querySelector('.command-header-document'), title = documentSlot?.querySelector('.document-title,.assembly-shell-document');
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5;
    const targets = controls.map(e => ({ label: e.getAttribute('aria-label') || e.title || e.textContent.trim(), disabled: e.matches(':disabled'), ...describe(e) }));
    const overlaps = [];
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) if (overlap(targets[i].rect, targets[j].rect)) overlaps.push([i, j]);
    const groups = [...header.children].map(e => ({ className: e.className, rect: rect(e) }));
    const groupOverlaps = [];
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) if (overlap(groups[i].rect, groups[j].rect)) groupOverlaps.push([i, j]);
    return { ...result, header: h, clientWidth: header.clientWidth, scrollWidth: header.scrollWidth,
      popupCount: header.querySelectorAll('[role="menu"]').length, menus: menus.map(e => e.textContent.trim()), quickCount: quick.length,
      pinCount: header.querySelectorAll('button[data-header-menu-pin][aria-pressed="true"]').length,
      menusBeforeQuick: !!menus.length && !!quick.length && !!(menus.at(-1).compareDocumentPosition(quick[0]) & Node.DOCUMENT_POSITION_FOLLOWING),
      targets, overlaps, groups, groupOverlaps,
      document: title && { ...describe(title), slotWidth: documentSlot.getBoundingClientRect().width, textLength: title.textContent.trim().length,
        hasFullTitle: !!title.title, clientWidth: title.clientWidth, scrollWidth: title.scrollWidth } };
  });
  checks.push({ commandHeaderLayout: { phase, kind, ...layout } });
  const fail = message => check(false, message + '; headerLayout=' + JSON.stringify(layout));
  if (layout.count !== 1 || layout.popupCount !== 0) fail('Exactly one idle command header before reveal');
  if (Math.abs(layout.header.height - 35) > .5 || layout.header.left < -.5 || layout.header.right > layout.viewport.width + .5
    || layout.scrollWidth > layout.clientWidth + 1) fail('Single 35px command row fits current content width');
  if (layout.menus.join('|') !== 'Archivo|Editar|Ver|Insertar|Herramientas|Ayuda' || !layout.menusBeforeQuick
    || layout.quickCount !== (kind === 'configured' ? 5 : 6)) fail('Existing menus precede each single quick-action instance');
  if (layout.pinCount !== 1 || layout.targets.length !== (kind === 'part' ? 15 : kind === 'configured' ? 12 : 13)
    || !layout.targets.every(t => t.contained && t.ownHit && t.rect.height >= 28) || layout.overlaps.length || layout.groupOverlaps.length)
    fail('All header controls, including disabled actions, are contained, hit-tested and disjoint');
  if (!layout.document?.contained || !layout.document.ownHit || !layout.document.hasFullTitle || layout.document.slotWidth < 95.5)
    fail('Document title retains a visible outside-click target and complete tooltip');
  return layout;
};
