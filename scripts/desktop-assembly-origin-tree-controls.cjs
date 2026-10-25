'use strict';

// Presentation checks on the existing original fixtures. All datum activation
// uses real CDP input; references are checked against the committed document.
module.exports = async function originTreeControls({ configured = false, page, waitFor, pointer, actualControl,
  navigation, observe, check, canonical, checks, ownerPath = ['moving'], siblingPath = null }) {
  if (!pointer && !actualControl) throw Error('Actual origin tree pointer transport required');
  const mode = configured ? 'configured' : '';
  if (configured) await navigation.pane('model'); else await navigation.panel('components');
  const tree = require('./desktop-assembly-tree-navigation.cjs')({ page, waitFor, pointer, actualControl });
  const read = () => page(configured => {
    const root = document.querySelector(configured ? '.configured-assembly-workspace' : '.assembly-app');
    const history = configured
      ? [...document.querySelectorAll('[aria-label="Archivo del ensamblaje configurado"] button')].filter(el => ['Deshacer', 'Rehacer'].includes(el.textContent.trim()))
      : [...document.querySelectorAll('button[aria-label="Deshacer ensamblaje"],button[aria-label="Rehacer ensamblaje"]')];
    return { recovery: localStorage.getItem('solidflow.autosave'), busy: root?.getAttribute('aria-busy'),
      scope: document.querySelector(configured ? '[aria-label="Ámbito de configuración"]' : '[aria-label="Ámbito de las relaciones"]')?.value,
      occurrence: configured ? document.querySelector('[aria-label="Ocurrencia configurada"]')?.value : document.querySelector('[aria-label="Nombre del componente"]')?.value,
      history: history.map(el => ({ label: el.getAttribute('aria-label') || el.textContent.trim(), disabled: el.disabled })),
      components: [...document.querySelectorAll('[data-assembly-tree-key][aria-selected="true"]')]
        .filter(el => !el.hasAttribute('data-assembly-origin-tree-key')).map(el => el.getAttribute('data-assembly-tree-key')),
      picking: document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking'),
      dragbuttons: [...document.querySelectorAll('button[aria-label="Arrastrar posición"],button[aria-label="Arrastrar giro"]')]
        .map(el => ({ label: el.getAttribute('aria-label'), pressed: el.getAttribute('aria-pressed'), disabled: el.disabled })),
      origins: [...document.querySelectorAll('[data-assembly-origin-tree-key][aria-selected="true"]')].map(el => el.getAttribute('data-assembly-origin-tree-key')),
      overlay: [...document.querySelectorAll('.assembly-origin-labels [data-origin-key]')].map(el => ({ key: el.getAttribute('data-origin-key'), selected: el.classList.contains('selected'), disabled: el.disabled })) };
  }, mode);
  await waitFor('origin tree committed model ready', async () => (await read()).busy === 'false');
  const baseline = await read(), nativeBefore = await observe();
  check(baseline.recovery && baseline.history.length === 2 && baseline.components.length === 1 && baseline.picking === '',
    'Origin browsing starts with one actual component, two history guards and no armed reference role');
  const committed = JSON.parse(baseline.recovery), source = configured ? committed.source : committed;
  let owner = source, definition = null;
  for (const id of ownerPath) {
    const occurrences = owner.occurrences.filter(row => row.id === id);
    check(occurrences.length === 1, 'One committed original origin owner at ' + JSON.stringify(ownerPath));
    definition = occurrences[0].definition;
    const matches = source.definitions.filter(row => row.id === definition.id && row.revision === definition.revision);
    check(matches.length === 1, 'One committed original origin definition');
    owner = matches[0];
  }
  const inventory = await page(() => [...document.querySelectorAll('[data-assembly-origin-tree-key]')].map(el => ({
    key: el.getAttribute('data-assembly-origin-tree-key'), owner: JSON.parse(el.getAttribute('data-assembly-origin-tree-owner')),
    reference: JSON.parse(el.getAttribute('data-assembly-origin-tree-reference')),
  })));
  const componentKey = async path => {
    const candidates = await page(path => [...document.querySelectorAll('[data-assembly-tree-key]')]
      .filter(el => !el.hasAttribute('data-assembly-origin-tree-key')).map(el => {
        const key = el.getAttribute('data-assembly-tree-key'), tuple = JSON.parse(key);
        return { key, path: Array.isArray(tuple[0]) ? tuple[0] : tuple[0] === 'occurrence' ? tuple[1] : null };
      }).filter(row => JSON.stringify(row.path) === path), JSON.stringify(path));
    check(candidates.length === 1, 'One original component tree identity at ' + JSON.stringify(path));
    return candidates[0].key;
  };
  const ownerKey = await componentKey(ownerPath), siblingKey = siblingPath ? await componentKey(siblingPath) : null;
  const disclosure = key => tree.selector('data-assembly-tree-disclosure', key);
  const expanded = key => page(key => [...document.querySelectorAll('[data-assembly-tree-disclosure]')]
    .find(el => el.getAttribute('data-assembly-tree-disclosure') === key)?.getAttribute('aria-expanded'), key);
  if (siblingKey && await expanded(siblingKey) === 'true') await tree.press(await disclosure(siblingKey));
  const gestures = [];
  const checkDragContinuity = !configured && ownerPath.length === 1 && ownerPath[0] === 'moving';
  const dragModeMatches = (state, label) => state.dragbuttons.length === 2
    && state.dragbuttons.every(button => button.pressed === (button.label === label ? 'true' : 'false'));
  async function invariants(phase) {
    const state = await read(), current = await observe();
    check(state.recovery === baseline.recovery && canonical(state.history) === canonical(baseline.history)
      && state.scope === baseline.scope && state.occurrence === baseline.occurrence,
    'Origin tree ' + phase + ' preserves exact document recovery, history guards, owner and scope');
    check(state.busy === 'false' && state.picking === '' && current.serial === nativeBefore.serial
      && current.assemblies.length === nativeBefore.assemblies.length && !current.workerErrors.length,
    'Origin tree ' + phase + ' sends no native request and arms no relation role');
  }
  for (const [path, kind, axisOrPlane] of [[ownerPath, 'principal-plane', 'XY'], [ownerPath, 'principal-axis', 'Z'],
    [[], 'principal-plane', 'XZ'], [[], 'principal-axis', 'X']]) {
    const reference = { kind, component: path.length ? { occurrencePath: path, definition } : null,
      [kind === 'principal-axis' ? 'axis' : 'plane']: axisOrPlane };
    const matches = inventory.filter(entry => canonical(entry.owner) === canonical(path) && canonical(entry.reference) === canonical(reference));
    check(matches.length === 1, 'One exact committed tree datum: ' + canonical(reference));
    const entry = matches[0], selector = await tree.selector('data-assembly-origin-tree-key', entry.key);
    const overlayKey = JSON.stringify([kind, path.length ? [path, definition.id, definition.revision] : null, axisOrPlane]);
    const datumSelected = async () => {
      const state = await read();
      return canonical(state.origins) === canonical([entry.key]) && state.overlay.length === 1
        && state.overlay[0].key === overlayKey && state.overlay[0].selected && state.overlay[0].disabled;
    };
    const observedRow = () => page(selector => {
      const rows = [...document.querySelectorAll(selector)], row = rows[0], rect = row?.getBoundingClientRect();
      return { count: rows.length, ariaDisabled: row?.getAttribute('aria-disabled'), disabled: row?.disabled,
        selected: row?.getAttribute('aria-selected'), visible: !!row && !row.closest('[hidden]') && !!rect?.width && !!rect.height };
    }, selector);
    if (!gestures.length && checkDragContinuity) {
      check(baseline.components[0] === ownerKey && !baseline.origins.length && !baseline.overlay.length,
        'Manipulator continuity uses the original free moving component with no datum overlay');
      await tree.press('button[aria-label="Arrastrar giro"]');
      await waitFor('actual rotation manipulator arms before datum selection', async () => dragModeMatches(await read(), 'Arrastrar giro'));
      await invariants('rotation armed before datum');
    }
    if (!gestures.length) {
      const state = await read();
      checks.push({ originTreeBeforeActivation: { configured, expectedEntry: entry, observedRow: await observedRow(),
        overlay: state.overlay, selectedOrigins: state.origins, dragbuttons: state.dragbuttons } });
    }
    try {
      await tree.press(selector);
      await waitFor('tree datum selection and matching viewport overlay', datumSelected);
    } catch (error) {
      const state = await read(); delete state.recovery;
      checks.push({ originTreeActivationFailure: { configured, expectedEntry: entry, observedRow: await observedRow(), state } });
      throw error;
    }
    await invariants(kind + ' ' + axisOrPlane);
    if (!gestures.length && checkDragContinuity) {
      const datumState = await read();
      check(dragModeMatches(datumState, null), 'Selecting the datum disarms both manipulator modes');
      await tree.press('button[aria-label="Arrastrar posición"]');
      await waitFor('actual translation rearm restores the component and clears the datum overlay', async () => {
        const state = await read();
        return dragModeMatches(state, 'Arrastrar posición') && !state.origins.length && !state.overlay.length
          && canonical(state.components) === canonical(baseline.components);
      });
      await invariants('translation rearmed after datum');
      const rearmedState = await read();
      await tree.press('button[aria-label="Desactivar manipulador"]');
      await waitFor('actual manipulator deactivation clears both modes', async () => dragModeMatches(await read(), null));
      await tree.press(selector);
      await waitFor('same datum is selected again after manipulator deactivation', datumSelected);
      check(dragModeMatches(await read(), null), 'Reselected datum keeps the manipulator disarmed');
      await invariants('datum reselected after manipulator deactivation');
      checks.push({ originTreeManipulatorContinuity: { owner: ownerPath, reference,
        sequence: ['Arrastrar giro', entry.key, 'Arrastrar posición', 'Desactivar manipulador', entry.key],
        selectedDatumModes: datumState.dragbuttons, rearmedModes: rearmedState.dragbuttons,
        restoredComponent: rearmedState.components, nativeSerial: nativeBefore.serial,
        evidenceLimits: 'Actual CDP mode buttons and datum selection on the original free moving fixture; no drag gesture or CAD solve.' } });
    }
    if (!gestures.length) {
      const selected = await read(), trigger = '[data-assembly-menu="edit"]';
      await tree.press(trigger);
      await waitFor('actual Edit menu opens for the selected datum', () => page(() =>
        document.querySelector('[data-assembly-menu="edit"]')?.getAttribute('aria-expanded') === 'true'
        && document.querySelector('[data-assembly-command="component-properties"]')?.getClientRects().length > 0));
      check(await page(configured => {
        const items = [...document.querySelectorAll('[data-assembly-command="component-properties"]')];
        const buttons = [...document.querySelectorAll('button[aria-label="Propiedades del componente seleccionado"]')];
        const tabs = [...document.querySelectorAll('button[aria-label="Mostrar propiedades del componente"]')];
        return items.length === 1 && items[0].disabled && !items[0].closest('[hidden]')
          && buttons.length === 1 && buttons[0].disabled && !buttons[0].closest('[hidden]')
          && (!configured || tabs.length === 1 && tabs[0].disabled && !tabs[0].closest('[hidden]'));
      }, mode), 'Datum selection disables the actual Edit properties action, component-properties button and configured Properties tab');
      await tree.press(trigger);
      await waitFor('same actual Edit trigger closes its menu', () => page(() =>
        document.querySelector('[data-assembly-menu="edit"]')?.getAttribute('aria-expanded') === 'false'
        && !document.querySelector('[data-assembly-command="component-properties"]')));
      const retained = await read();
      check(canonical(retained.origins) === canonical(selected.origins) && canonical(retained.overlay) === canonical(selected.overlay),
        'Opening and closing Edit preserves the selected datum and its viewport overlay');
      if (!configured) check(await page(() => {
        const group = document.querySelector('fieldset[aria-label="Edición del componente seleccionado"]');
        return group?.hidden && group.disabled && group.getClientRects().length === 0
          && document.querySelector('button[aria-label="Mover componente"]')?.disabled
          && [...group.querySelectorAll('input,select,textarea,button')].every(control => control.matches(':disabled'));
      }), 'Datum browsing hides and disables retained component editors and their Move shortcut without unmounting controls');
      await invariants('properties menu guard');
    }
    if (path.length) {
      await tree.press(await disclosure(ownerKey));
      await waitFor('collapsed owner retains selected origin overlay', async () => {
        const state = await read();
        return await expanded(ownerKey) === 'false' && canonical(state.origins) === canonical([entry.key])
          && state.overlay.length === 1 && state.overlay[0].key === overlayKey && state.overlay[0].selected
          && await page(selector => !!document.querySelector(selector)?.closest('[hidden]'), selector);
      });
      if (siblingKey) check(await expanded(siblingKey) === 'false', 'A reused sibling origin branch remains independently collapsed');
      await invariants('collapsed ' + kind);
      await tree.press(await disclosure(ownerKey));
      await waitFor('reopened owner retains selected origin row', () => page(selector => {
        const row = document.querySelector(selector); return row?.getAttribute('aria-selected') === 'true' && !row.closest('[hidden]');
      }, selector));
    }
    gestures.push({ owner: path, reference, overlayKey, collapsedRetention: !!path.length });
  }
  // Restore the original component through its real row; no fabricated clear action.
  await tree.press(await tree.selector('data-assembly-tree-key', baseline.components[0]));
  await waitFor('origin browsing restores original component selection and overlays', async () => {
    const state = await read(); return canonical(state.components) === canonical(baseline.components)
      && canonical(state.origins) === canonical(baseline.origins) && canonical(state.overlay) === canonical(baseline.overlay);
  });
  await invariants('restored');
  if (!configured) check(await page(() => {
    const group = document.querySelector('fieldset[aria-label="Edición del componente seleccionado"]');
    return !!group && !group.hidden && !group.disabled && group.getClientRects().length > 0;
  }), 'Restored component selection reveals its retained editing controls');
  checks.push({ assemblyOriginTreeNavigation: { configured, owner: ownerPath, sibling: siblingPath, gestures,
    nativeSerial: nativeBefore.serial, history: baseline.history, propertiesMenuGuard: 'Actual Edit trigger open/close; unique properties action, tree button and configured Properties tab disabled for the first selected datum',
    evidenceLimits: 'Actual CDP model-tree datum selection and retained viewport-label highlight on existing original fixtures. No role assignment, new CAD solve, geometry oracle or native-product keyboard equivalence.' } });
};
