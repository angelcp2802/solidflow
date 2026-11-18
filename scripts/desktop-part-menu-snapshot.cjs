'use strict';

// Read-only current part owners shared by the original menu and entry checks.
module.exports = ({ page, observe, recovery, dialogCounts, ipc }) => async () => ({
  native: await observe(), recovery: await recovery(), dialogs: dialogCounts(), ipc: structuredClone(ipc), ui: await page(() => {
    const viewport = document.querySelector('.viewport-canvas[aria-label="Vista 3D de la pieza"]');
    return { history: ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => ({ title, disabled: document.querySelector('button[title="' + title + '"]')?.disabled })),
      selection: ['selection-mode', 'selected-face', 'selected-edges', 'selected-bodies'].map(name => [name, viewport?.getAttribute('data-part-' + name)]),
      draft: { mounted: !!document.querySelector('.property-manager'), solver: document.querySelector('.sketch-solver-status')?.textContent,
        fields: [...document.querySelectorAll('.property-manager input,.property-manager select')].map(field => ({ tag: field.tagName, label: field.getAttribute('aria-label'), value: field.value, checked: field.checked, disabled: field.disabled })),
        acceptDisabled: document.querySelector('button[title="Aceptar operación"]')?.disabled, cancelDisabled: document.querySelector('button[title="Cancelar operación"]')?.disabled } };
  }),
});
