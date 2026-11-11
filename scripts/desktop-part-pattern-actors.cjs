'use strict';
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Drive the visible, settled controls in the hidden, test-owned part editor.
module.exports = function partPatternActors({ evaluate, waitFor, pointer, check, canonical, interactions }) {
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  async function reveal(selector, label) {
    await page((selector, label) => {
      const text = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || text(e) === label);
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted pattern control required: ' + selector);
      matches[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector, label ?? null);
  }
  async function inspect(selector, label) {
    return page((selector, label) => {
      const text = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || text(e) === label);
      if (matches.length !== 1) return { count: matches.length, available: false };
      const e = matches[0], r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let p = e.parentElement; p; p = p.parentElement) {
        const style = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, clip: { left, top, right, bottom },
        disabled: e.matches(':disabled'), hidden: !!e.closest('[hidden]'), hit: !!hit && (hit === e || e.contains(hit)),
        available: !e.matches(':disabled') && !e.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)) };
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label); let previous, since = 0;
    const target = await waitFor('stationary pattern control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { try { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); } catch {} throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Pattern control stays fully contained and hit-tested before press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after ordinary DOM reveal' });
  }
  async function change(selector, value) {
    value = String(value); await reveal(selector);
    await waitFor('one current enabled pattern field', async () => (await inspect(selector)).available);
    const isInput = await page(selector => document.querySelector(selector) instanceof HTMLInputElement, selector);
    if (isInput) await press(selector);
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement || field instanceof HTMLSelectElement) || field.disabled
        || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0 || !hit || !(field === hit || field.contains(hit))) throw Error('Current visible enabled pattern field required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('Current enabled pattern option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Native visible field setter and input/change event after hit test' });
    await waitFor('pattern field retains authored value', () => page((s, v) => document.querySelector(s)?.value === v, selector, value));
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  return { page, press, change, file, inspect, reveal };
};
