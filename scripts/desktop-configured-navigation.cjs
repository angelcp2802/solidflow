'use strict';

const COMMANDS = '[aria-label="Comandos del ensamblaje configurado"]';
const routes = {
  model: ['button[aria-label="Mostrar árbol del ensamblaje"]', ''],
  configuration: ['button[aria-label="Mostrar configuraciones"]', ''],
  occurrence: ['button[aria-label="Mostrar propiedades del componente"]', ''],
  components: ['[aria-label="Pestañas del ensamblaje configurado"] button', 'Componentes'],
  relations: [COMMANDS + ' button', 'Relaciones'],
  relation: ['[aria-label="Pestañas del ensamblaje configurado"] button', 'Relaciones de posición'],
};

// Navigation is an application action, never a hidden-input or React-state write.
// Picking supplies CDP actualControl; the other workflows retain scripted DOM
// controls and must not be reported as human pointer interaction.
module.exports = function configuredNavigation({ page, waitFor, actualControl }) {
  async function pane(name) {
    const route = routes[name];
    if (!route) throw Error('Unknown configured inspector pane: ' + name);
    if (await page(name => document.querySelector('[data-configured-pane="' + name + '"]')?.hidden === false, name)) return;
    if (actualControl) await actualControl(route[0], route[1] || null);
    else await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => !text || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]') || !rows[0].getClientRects().length) throw Error('Visible enabled navigation control required: ' + selector);
      rows[0].click();
    }, route[0], route[1]);
    await waitFor('configured inspector navigation to ' + name, () => page(name => document.querySelector('[data-configured-pane="' + name + '"]')?.hidden === false, name));
  }
  async function reveal(selector, text = '') {
    const owner = await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => !text || e.textContent.trim() === text);
      if (rows.length !== 1) throw Error('One mounted configured control required: ' + selector + ' ' + text);
      return rows[0].closest('[data-configured-pane]')?.getAttribute('data-configured-pane') || '';
    }, selector, text);
    if (owner) await pane(owner);
    await waitFor('configured control belongs to visible pane', () => page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => !text || e.textContent.trim() === text);
      return rows.length === 1 && !rows[0].closest('[hidden]') && rows[0].getClientRects().length > 0;
    }, selector, text));
  }
  return { pane, reveal };
};
