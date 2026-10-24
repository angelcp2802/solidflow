'use strict';
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Navigation through application controls only. This never sets React state,
// unhides a panel, scrolls the DOM, changes intent, or supplies CAD results.
function withNavigation(context) {
  if (context.assemblyNavigation) return context;
  // The mixed origin-axis fixture retains its separate configured navigator.
  if (context.configured) return { ...context, assemblyNavigation: { panel: async () => {}, reveal: async () => {}, button: async () => {} } };
  const page = context.page || ((fn, ...args) => context.evaluate('(' + fn.toString() + ')(' + args.map(value =>
    'JSON.parse(' + encodeJavaScriptString(JSON.stringify(value)) + ')').join(',') + ')'));
  async function panel(name) {
    const target = await page(name => {
      if (!document.querySelector('.assembly-classic-workspace')) return null;
      const tab = document.querySelector('#assembly-tab-' + name), panel = document.querySelector('#assembly-panel-' + name);
      if (!tab || !panel || tab.disabled) throw Error('Actual assembly manager tab absent: ' + name);
      if (tab.getAttribute('aria-selected') === 'true' && !panel.hidden) return null;
      const rect = tab.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      if (rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || !tab.contains(document.elementFromPoint(x, y)))
        throw Error('Assembly manager tab is not pointer reachable: ' + name);
      return { x, y };
    }, name);
    if (!target) return;
    if (context.pointer) {
      await context.pointer('mouseMoved', target);
      await context.pointer('mousePressed', target, 1);
      await context.pointer('mouseReleased', target, 0);
    } else {
      // Subflows without pointer transport retain their existing scripted UI route.
      await page(name => document.querySelector('#assembly-tab-' + name).click(), name);
    }
    await context.waitFor('actual assembly manager reveals ' + name, () => page(name => {
      const tab = document.querySelector('#assembly-tab-' + name), panel = document.querySelector('#assembly-panel-' + name);
      return tab?.getAttribute('aria-selected') === 'true' && panel?.hidden === false && getComputedStyle(panel).display !== 'none';
    }, name));
  }
  async function reveal(selector, text = '') {
    const owner = await page((selector, text) => {
      const elements = [...document.querySelectorAll(selector)].filter(value => text === '' || value.textContent.trim() === text);
      if (elements.length !== 1) throw Error('Exact navigation target required: ' + selector + (text === '' ? '' : ' / ' + text));
      const panel = elements[0].closest('[role="tabpanel"][id^="assembly-panel-"]');
      return panel?.id.slice('assembly-panel-'.length) ?? null;
    }, selector, text);
    if (owner) await panel(owner);
    await page((selector, text) => {
      const elements = [...document.querySelectorAll(selector)].filter(value => text === '' || value.textContent.trim() === text);
      const element = elements[0];
      if (elements.length !== 1 || element.closest('[hidden]') || !element.getClientRects().length) throw Error('Action target remains hidden or in an inactive panel: ' + selector);
    }, selector, text);
  }
  const assemblyNavigation = { panel, reveal, button: (text, scope = '.assembly-app') => reveal(scope + ' button', text) };
  return { ...context, assemblyNavigation, ...(context.click ? { click: async selector => { await reveal(selector); return context.click(selector); } } : {}) };
}
module.exports = { withNavigation };
