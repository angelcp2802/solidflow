'use strict';

// Observe the visible editor and existing native transport at the no-op boundary.
module.exports = async function observeEmbeddedPropertiesNoOp({ page, observe, waitFor, check, canonical, digest, dialogCounts, ipc,
  childBuild, submit, close, waitParent, ownerPath }) {
  const PART = '.assembly-embedded-part-editor .app-shell';
  const FORM = PART + ' form[aria-label="Material y apariencia de la pieza"]';
  const snapshot = () => page((part, form) => {
    const host = document.querySelector(part), parent = document.querySelector('.assembly-app'), fields = document.querySelector(form);
    const title = host?.querySelector('.document-title'), parentTitle = parent?.querySelector('.assembly-shell-document > strong');
    const returning = host?.querySelector('[aria-label="Edición de pieza en el ensamblaje"] button.primary-button');
    const read = label => fields?.querySelector('[aria-label="' + label + '"]')?.value;
    return { recovery: localStorage.getItem('solidflow.autosave'), visible: !!host?.checkVisibility(), inertParent: !!parent?.inert && !!parent?.hidden,
      returning: returning?.disabled === false && returning.checkVisibility(), localTitle: title?.title, parentTitle: parentTitle?.textContent,
      localHistory: [...(host?.querySelectorAll('button[title="Deshacer (Ctrl+Z)"],button[title="Rehacer (Ctrl+Y)"]') ?? [])]
        .map(button => [button.title, button.disabled]), parentPath: parent?.querySelector('[data-assembly-tree-path][aria-selected="true"]')?.dataset.assemblyTreePath,
      fields: [read('Nombre del material'), read('Densidad del material'), read('Color de la pieza')],
      mass: host?.querySelector('[aria-label="Masa de la pieza"]')?.textContent?.trim(), error: !!fields?.querySelector('[role="alert"]') };
  }, PART, FORM);
  const before = await waitFor('same visible embedded owner has a ready Return witness', async () => {
    const value = await snapshot();
    return value.visible && value.inertParent && value.returning && value.localHistory.length === 2 && value.recovery
      && value.parentPath === JSON.stringify(ownerPath) && value.parentTitle && !value.parentTitle.includes('*') && !value.error ? value : false;
  });
  const nativeBefore = await observe.counters(), files = canonical({ ipc, dialogs: dialogCounts() });
  check(childBuild.response?.ok && childBuild.serial === nativeBefore.serial, 'Exact settled child build is the most recent native request before untouched Apply');
  await submit();
  // The real child producer waits 120 ms. A delayed rebuild must still be caught.
  await page(() => new Promise(resolve => setTimeout(resolve, 500)));
  const after = await snapshot(), nativeAfter = await observe.counters();
  check(canonical(after) === canonical(before) && canonical(nativeAfter) === canonical(nativeBefore),
    'Untouched Apply keeps exact ready child build, Return, property controls, histories and clean parent recovery');
  check(canonical({ ipc, dialogs: dialogCounts() }) === files, 'Untouched embedded Apply leaves file activity unchanged');
  await close(); const restored = await waitParent(nativeAfter.serial);
  const post = await snapshot(), native = await observe();
  check(!post.visible && !post.inertParent && post.recovery === before.recovery && post.parentTitle === before.parentTitle,
    'Return reveals the clean unchanged parent and exact recovery');
  const actions = native.assemblies.filter(row => row.serial > nativeAfter.serial).map(row => row.action);
  check(canonical(actions) === canonical(['build-assembly']) && !native.builds.some(row => row.serial > nativeAfter.serial),
    'Return only rebuilds the unchanged parent scene, without a child generation or source review');
  check(canonical({ ipc, dialogs: dialogCounts() }) === files, 'Unchanged embedded Return leaves file activity unchanged');
  return { restored, receipt: { ownerPath, originalBuildSerial: childBuild.serial, beforeApplySerial: nativeBefore.serial,
    afterApplySerial: nativeAfter.serial, returnBuildSerial: restored.serial, actions, recoverySha256: digest(before.recovery),
    childUndoRedo: before.localHistory, mass: before.mass, parentClean: true } };
};
