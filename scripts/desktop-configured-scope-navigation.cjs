'use strict';

// Scope is UI navigation, not a new configured document or native producer.
// Keep the prior real build explicit; never manufacture a new worker reply.
module.exports = function configuredScopeNavigation({ page, control, observe, waitFor, check, canonical, ipc, dialogCounts, checks }) {
  const snapshot = () => page(() => {
    const root = document.querySelector('.configured-assembly-workspace');
    return { scope: document.querySelector('[aria-label="Ámbito de configuración"]')?.value,
      recovery: localStorage.getItem('solidflow.autosave'), busy: root?.getAttribute('aria-busy'),
      history: [...(root?.querySelectorAll('button') ?? [])].filter(button =>
        /^(Deshacer|Rehacer)(?:\b|\s)/.test(button.title || button.getAttribute('aria-label') || button.textContent.trim()))
        .map(button => ({ label: button.title || button.getAttribute('aria-label') || button.textContent.trim(), disabled: button.disabled })) };
  });
  return async function navigateScope(target) {
    check(typeof target === 'string', 'Scope navigation needs an explicit serialized path');
    const before = await snapshot(), counters = await observe.counters();
    check(before.busy === 'false' && before.recovery && before.history.length >= 2 && counters.workerErrorCount === 0,
      'Scope navigation starts from an idle committed document with observed history guards');
    const document = JSON.parse(before.recovery), projection = await observe.assemblyResponseAfter(0, 'build-configured-assembly');
    const retainedBuild = projection.record, wrapper = retainedBuild?.response?.value;
    check(retainedBuild?.response?.ok && wrapper?.kind === 'configured-assembly-scene'
      && canonical(JSON.parse(wrapper.context.sourceSignature)) === canonical(document.source)
      && canonical(JSON.parse(wrapper.context.catalogSignature)) === canonical(document.catalog)
      && wrapper.context.rootConfiguration === document.rootConfiguration,
    'Scope navigation retains a prior real build for the complete current source/catalog/root state');
    const files = canonical({ ipc, dialogs: dialogCounts() });
    await control('Ámbito de configuración', target);
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    const after = await waitFor('requested scope is idle without changing committed recovery', async () => {
      const value = await snapshot();
      return value.scope === target && value.busy === 'false' && value.recovery === before.recovery ? value : false;
    });
    const observed = await observe.counters();
    check(canonical(observed) === canonical(counters), 'Idle scope navigation sends no worker request or error');
    check(canonical(after.history) === canonical(before.history), 'Idle scope navigation retains document history guards');
    check(canonical({ ipc, dialogs: dialogCounts() }) === files, 'Idle scope navigation has no file authority');
    checks?.push({ configuredScopeNavigation: { from: before.scope, to: target, before: counters, after: observed,
      retainedBuildSerial: retainedBuild.serial, documentUnchanged: true,
      limits: 'Existing native build retained for UI scope navigation; not a fresh producer, geometry cache across revisions, native restart or platform claim.' } });
    return { document, retainedBuild, before: counters, after: observed };
  };
};
