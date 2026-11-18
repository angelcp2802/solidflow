'use strict';

// Shared observation of the current source review. The embedded-part route
// separately attempts trusted clicks on all three disabled Solve controls.
module.exports = async function assertPendingSourceSolve({ page, observe, waitFor, check, canonical }, pending) {
  const before = await observe.counters();
  await waitFor('Current source review blocks Solve until all repairs are selected', () => page(expected => {
    const panel = document.querySelector('[role="region"][aria-label="Actualizar origen compartido"]');
    const solve = panel?.querySelector('button[aria-label="Resolver actualización de pieza"]');
    return panel?.getAttribute('aria-busy') === 'false' && solve?.disabled === true
      && panel.querySelectorAll('[data-endpoint-status="needs-repair"]').length === Number(expected)
      && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true;
  }, String(pending)));
  check(canonical(await observe.counters()) === canonical(before), 'Pending source repair sends no worker request');
  return { serial: before.serial, pending };
};
