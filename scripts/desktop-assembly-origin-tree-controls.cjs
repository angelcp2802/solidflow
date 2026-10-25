'use strict';

// Presentation checks on the existing original fixtures. All datum activation
// uses real CDP input; references are checked against the committed document.
module.exports = async function originTreeControls({ configured = false, page, waitFor, pointer, actualControl,
  navigation, observe, check, canonical, checks, ownerPath = ['moving'], siblingPath = null }) {
  if (!pointer && !actualControl) throw Error('Actual origin tree pointer transport required');
  if (typeof observe.counters !== 'function' || typeof observe.auditCounters !== 'function') throw Error('Read-only observer counters and parity audit required');
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
      componentFields: configured ? null : [...document.querySelectorAll('fieldset[aria-label="Edición del componente seleccionado"] input,fieldset[aria-label="Edición del componente seleccionado"] select,fieldset[aria-label="Edición del componente seleccionado"] textarea')]
        .map(el => ({ label: el.getAttribute('aria-label'), type: el.type, value: el.value, checked: el.checked })),
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
  const baseline = await read(), nativeBefore = await observe.auditCounters(configured ? 'configured-origin-tree-idle' : 'standard-origin-tree-idle');
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
    const state = await read(), current = await observe.counters();
    check(state.recovery === baseline.recovery && canonical(state.history) === canonical(baseline.history)
      && state.scope === baseline.scope && state.occurrence === baseline.occurrence
      && canonical(state.componentFields) === canonical(baseline.componentFields),
    'Origin tree ' + phase + ' preserves exact document recovery, history guards, owner and scope');
    check(state.busy === 'false' && state.picking === '' && current.serial === nativeBefore.serial
      && current.assemblyCount === nativeBefore.assemblyCount && current.workerErrorCount === 0,
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
        const tabs = [...document.querySelectorAll(configured ? 'button[aria-label="Mostrar propiedades del componente"]' : '#assembly-tab-properties')];
        return items.length === 1 && items[0].disabled && !items[0].closest('[hidden]')
          && buttons.length === 1 && buttons[0].disabled && !buttons[0].closest('[hidden]')
          && tabs.length === 1 && tabs[0].disabled && !tabs[0].closest('[hidden]');
      }, mode), 'Datum selection disables the actual Edit properties action, component-properties button and Properties tab');
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
  if (!configured) {
    check(await page(() => {
      const group = document.querySelector('fieldset[aria-label="Edición del componente seleccionado"]');
      return !!group && !group.hidden && !group.disabled && group.getClientRects().length === 0
        && group.closest('#assembly-panel-properties')?.hidden === true
        && document.querySelector('#assembly-panel-components')?.hidden === false
        && document.querySelector('#assembly-tab-components')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#assembly-tab-properties')?.disabled === false;
    }), 'Restored component keeps its enabled editors mounted in the hidden Properties pane while Model remains active');
    await tree.press('button[aria-label="Propiedades del componente seleccionado"]');
    await waitFor('explicit Properties reveals retained fields and focuses the component name', () => page(() => {
      const group = document.querySelector('fieldset[aria-label="Edición del componente seleccionado"]');
      return !!group && !group.hidden && !group.disabled && group.getClientRects().length > 0
        && document.querySelector('#assembly-panel-properties')?.hidden === false
        && document.querySelector('#assembly-tab-properties')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#assembly-panel-components')?.hidden === true
        && document.activeElement === document.querySelector('[aria-label="Nombre del componente"]');
    }));
    await invariants('explicit Properties after restoration');
    const localX = '[aria-label="Destino local X del componente"]';
    const field = await page(selector => {
      const inputs = [...document.querySelectorAll(selector)], input = inputs[0];
      if (inputs.length !== 1 || input.closest('[hidden]') || !input.getClientRects().length) throw Error('One mounted visible local-X field required');
      return { value: input.value, disabled: input.matches(':disabled') };
    }, localX);
    if (!field.disabled) {
      const original = Number(field.value), prepared = String(original + 1);
      check(field.value.trim() !== '' && Number.isFinite(original) && Number.isFinite(Number(prepared)) && Number(prepared) !== original,
        'Free component provides a finite local-X field for an unsubmitted draft');
      async function prepare(value) {
        await page((selector, value) => {
          const input = document.querySelector(selector);
          if (!input || input.matches(':disabled') || input.closest('[hidden]') || !input.getClientRects().length) throw Error('Visible enabled local-X field required for scripted form preparation');
          input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
        }, localX, value);
        await waitFor('local-X form value is rendered', () => page((selector, value) => document.querySelector(selector)?.value === value, localX, value));
      }
      const expectedFields = baseline.componentFields.map(value => value.label === 'Destino local X del componente' ? { ...value, value: prepared } : value);
      check(expectedFields.filter(value => value.label === 'Destino local X del componente').length === 1, 'One retained local-X field changes in the scripted preparation');
      async function retained(phase) {
        const state = await read(), current = await observe.counters();
        check(canonical(state.componentFields) === canonical(expectedFields) && canonical(state.components) === canonical(baseline.components)
          && state.scope === baseline.scope && state.occurrence === baseline.occurrence && state.recovery === baseline.recovery
          && canonical(state.history) === canonical(baseline.history) && state.busy === 'false' && state.picking === ''
          && current.serial === nativeBefore.serial && current.assemblyCount === nativeBefore.assemblyCount && current.workerErrorCount === 0,
        phase + ' retains the unsubmitted local-X value, component, scope, history and exact recovery without a native request');
      }
      await prepare(prepared);
      await tree.press('button[aria-label="Volver al árbol de componentes"]');
      await waitFor('Model hides the prepared movement editor and focuses its component', () => page(key =>
        document.querySelector('#assembly-panel-components')?.hidden === false
        && document.querySelector('#assembly-panel-properties')?.hidden === true
        && document.activeElement?.getAttribute('data-assembly-tree-key') === key, baseline.components[0]));
      await retained('Actual Model navigation');
      await tree.press('button[aria-label="Propiedades del componente seleccionado"]');
      await waitFor('Properties restores the prepared movement editor and name focus', () => page(() =>
        document.querySelector('#assembly-panel-properties')?.hidden === false
        && document.querySelector('#assembly-tab-properties')?.getAttribute('aria-selected') === 'true'
        && document.querySelector('#assembly-panel-components')?.hidden === true
        && document.activeElement === document.querySelector('[aria-label="Nombre del componente"]')));
      await retained('Actual Properties navigation');
      await prepare(field.value);
      await invariants('original local-X restored after pane navigation');
      checks.push({ assemblyComponentDraftContinuity: { status: 'checked', owner: ownerPath, field: 'Destino local X del componente',
        preparation: 'Scripted native input-value setter plus normal bubbling input/change events; original value restored before final invariants.',
        navigation: 'Actual CDP pointer on Model header return and component Properties button.',
        evidenceLimits: 'Unsubmitted form draft only; no preview, CAD edit, name blur change or geometric claim.' } });
    } else checks.push({ assemblyComponentDraftContinuity: { status: 'skipped', owner: ownerPath,
      reason: 'Local-X field is disabled by the current component guards; no form preparation or draft-retention claim for this fixture.' } });
    await tree.press('button[aria-label="Volver al árbol de componentes"]');
    await waitFor('actual Model return restores component focus after datum browsing', () => page(key =>
      document.querySelector('#assembly-panel-components')?.hidden === false
      && document.querySelector('#assembly-tab-components')?.getAttribute('aria-selected') === 'true'
      && document.querySelector('#assembly-panel-properties')?.hidden === true
      && document.activeElement?.getAttribute('data-assembly-tree-key') === key, baseline.components[0]));
    await invariants('Model return after Properties');
  }
  checks.push({ assemblyOriginTreeNavigation: { configured, owner: ownerPath, sibling: siblingPath, gestures,
    nativeSerial: nativeBefore.serial, history: baseline.history, propertiesMenuGuard: 'Actual Edit trigger open/close; unique properties action, tree button and Properties tab disabled for the first selected datum',
    evidenceLimits: 'Actual CDP model-tree datum selection and retained viewport-label highlight on existing original fixtures. No role assignment, new CAD solve, geometry oracle or native-product keyboard equivalence.' } });
};
