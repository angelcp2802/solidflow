'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Only production controls author changes. Evaluation reads the actual DOM,
// recovery and profile preference; the existing observer forwards native builds.
module.exports = function partPropertiesWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const restart = context.propertiesRestart;
  const FORM = 'form[aria-label="Material y apariencia de la pieza"]';
  const MASS = '[aria-label="Masa de la pieza"]';
  const HOST = '.viewport-canvas[aria-label="Vista 3D de la pieza"]';
  const BACKGROUND = 'dialog[aria-label="Fondo del visor"]';
  const KEY = 'solidflow.viewport-background.v1';
  const assignedProperties = { material: { name: 'Material sintético original', densityKgPerM3: 1000 }, appearance: { color: '#cc6633' } };
  const records = [], interactions = [];
  const evidence = { partProperties: { records, interactions,
    scope: 'Original cube; material/density/colour Apply and fresh build; Cancel; one Undo/Redo; native Save As/Open; profile background Apply/Cancel/default and document isolation',
    inputLimits: 'Actual CDP left press/release on contained hit-tested controls. Input values use native input setters and bubbling input/change events on revealed current fields; not physical keyboard typing. No React/document/native reply injection.',
    geometryLimits: 'Healthy actual worker responses, body/face/edge identities, native volume/bounds and independent planar triangle area. Mesh area is a presentation observation, not a native BRep-area capability. The separate native cube unit test covers BRep validity/area.',
    colourLimits: context.captureProperties ? 'Fixed presented original-cube PNG pairs for visual review, with measured same-state noise. No PBR hex equality or automated material-appearance acceptance.' : 'Part colour declaration, form state and saved/recovered bytes. No framebuffer/pixel fidelity claim.',
    freshProcessBackgroundPersistence: restart ? { status: 'phase-under-test', phase: restart.phase }
      : { status: 'not-exercised', reason: 'This baseline route checks saved-document Open in the same production process. The separate fixed transition scenario owns restart acceptance.' },
    tolerances: { volumeMm3: 1e-6, boundsMm: 1e-6, planarMeshAreaMm2: 1e-6, displayedMassKg: 1e-12 } } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  async function reveal(selector, label) {
    await page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted property/background control required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector, label ?? null);
  }
  async function inspect(selector, label) {
    return page((selector, label) => {
      const text = element => (element.matches('[data-assembly-command]')
        ? element.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : element.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(element => label === null || text(element) === label);
      if (matches.length !== 1) return { count: matches.length, available: false };
      const element = matches[0], r = element.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, bounds.left + parent.clientLeft); right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, bounds.top + parent.clientTop); bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight);
        }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        available: !element.matches(':disabled') && !element.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom
          && !!hit && (hit === element || element.contains(hit)) };
    }, selector, label ?? null);
  }
  async function press(selector, label) {
    await reveal(selector, label);
    let previous, since = 0;
    const target = await waitFor('stationary property/background control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Current property/background target is contained and hit-tested before pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'CDP left press/release after DOM reveal' });
  }
  async function change(selector, value) {
    await reveal(selector);
    await waitFor('one enabled visible property/background input ' + selector, async () => (await inspect(selector)).available);
    await page((selector, value) => {
      const matches = document.querySelectorAll(selector), field = matches[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (matches.length !== 1 || !(field instanceof HTMLInputElement) || !['text', 'number', 'color'].includes(field.type)
        || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || !hit || !(field === hit || field.contains(hit))) throw Error('One revealed enabled current property/background input required');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    interactions.push({ selector, value, input: 'Visible input native setter and input/change events after hit test' });
    await waitFor('authored property/background value retained', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function menu(id, label) {
    await press('[data-assembly-menu="' + id + '"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="' + id + '"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  const propertiesButton = () => press('.taskbar button[title="Propiedades físicas"]');
  const openBackground = () => menu('view', 'Fondo del visor…');
  function geometry(record, phase, previous) {
    check(record.response.ok, record.response.error || 'Native property cube build failed');
    check(canonical(record.features) === canonical(expected.features), 'Properties preserve every original feature declaration for ' + phase);
    const result = record.response.value;
    check(result.bodyCatalogActive && result.bodies?.length === 1 && result.featureErrors.length === 0 && result.warnings.length === 0,
      'One healthy current original cube body for ' + phase);
    const body = result.bodies[0];
    check(body.ref.bodyId === 'original-properties-cube-body' && body.ref.sourceFeatureId === 'original-properties-extrusion'
      && body.createdByFeatureId === 'original-properties-extrusion', 'Exact original cube body and producer identities');
    near(result.volume, 1000, 1e-6, 'Aggregate native cube volume ' + phase);
    near(body.volume, 1000, 1e-6, 'Current body native cube volume ' + phase);
    near(body.meshAreaMm2, 600, 1e-6, 'Independent planar triangle cube area ' + phase);
    for (const side of ['min', 'max']) (side === 'min' ? [-5, -5, 0] : [5, 5, 10]).forEach((value, index) => {
      near(body.bounds[side][index], value, 1e-6, 'Literal cube body bounds ' + phase);
      near(result.bounds[side][index], value, 1e-6, 'Literal aggregate cube bounds ' + phase);
    });
    check(body.faces?.length === 6 && body.edges?.length === 12, 'Six current native face and twelve edge reference witnesses');
    if (previous) check(canonical(result.bodies) === canonical(previous.response.value.bodies), 'Properties/history/reopen retain exact observed cube identities and geometry for ' + phase);
    records.push({ phase, nativeSerial: record.serial, featuresSha256: digest(canonical(record.features)), body });
    return record;
  }
  async function built(afterSerial, phase, previous) {
    const record = await waitFor('fresh native properties build ' + phase, async () => {
      const state = await observe(); check(state.workerErrors.length === 0, 'No property cube worker errors');
      return state.builds.filter(record => record.serial > afterSerial && record.response
        && canonical(record.features) === canonical(expected.features)).at(-1);
    });
    return geometry(record, phase, previous);
  }
  const snapshot = () => page(() => {
    const history = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
      const matches = [...document.querySelectorAll('button')].filter(button => button.title === title);
      if (matches.length !== 1) throw Error('One exact current part history command required');
      return { title, disabled: matches[0].disabled };
    });
    return { recovery: localStorage.getItem('solidflow.autosave'), history, title: document.querySelector('.document-title')?.textContent };
  });
  async function committed(wanted, phase) {
    const value = await waitFor('committed property cube recovery ' + phase, async () => {
      const value = await snapshot();
      return value.recovery && canonical(JSON.parse(value.recovery)) === canonical(wanted)
        && await page(name => {
          const rows = document.querySelectorAll('button[aria-label="Material de la pieza"]');
          return document.querySelector('.statusbar')?.textContent.includes('Listo') && !document.querySelector('.error-banner[role="alert"]')
            && rows.length === 1 && rows[0].textContent.trim() === 'Material <' + name + '>';
        }, wanted.material?.name ?? 'sin especificar') ? value : false;
    });
    const treeMaterial = await page(() => document.querySelector('button[aria-label="Material de la pieza"]')?.textContent.trim());
    records.push({ phase: phase + '-committed', recoverySha256: digest(value.recovery), history: value.history, title: value.title, treeMaterial });
    return value;
  }
  async function mass(wanted) {
    await reveal(MASS);
    const text = await waitFor('current material cube mass ' + wanted, () => page((selector, wanted) => {
      const text = document.querySelector(selector)?.textContent.trim();
      return wanted === null ? text === 'Sin asignar' && text : /^[-\d\s.,]+ kg$/.test(text ?? '') && text;
    }, MASS, wanted));
    if (wanted !== null) near(Number(text.replace(/\s*kg$/, '').replace(/\s/g, '').replace(',', '.')), wanted, 1e-12, 'Actual locale-formatted mass');
    records.push({ phase: 'displayed-mass', text });
  }
  async function backgroundState() {
    return page((key, host) => {
      const element = document.querySelector(host), style = element && getComputedStyle(element);
      return { persisted: localStorage.getItem(key), inlineBackground: element?.style.background ?? null,
        backgroundColor: style?.backgroundColor ?? null, backgroundImage: style?.backgroundImage ?? null };
    }, KEY, HOST);
  }
  async function unchanged(baseline, serial, savedBytes, phase) {
    check(canonical(await snapshot()) === canonical(baseline), 'Exact recovery/history/dirty title unchanged by ' + phase);
    check((await observe()).serial === serial, 'No CAD worker request caused by ' + phase);
    if (savedBytes) check((await fsp.readFile(output)).equals(savedBytes), 'Saved bytes unchanged by ' + phase);
    records.push({ phase, recoverySha256: digest(baseline.recovery), nativeSerial: serial });
  }
  const parkHover = () => pointer('mouseMoved', { x: 14, y: 14 });
  async function captureAppearance(phase, fit = false) {
    if (!context.captureProperties) return;
    if (fit) await press('button[title="Ajustar a pantalla (F)"]');
    await parkHover(); await context.captureProperties(phase);
  }
  async function recoveredPhase(originalBytes, bootstrap) {
    const receipt = restart.receipt, saved = receipt.document, bytes = await fsp.readFile(output);
    check(bootstrap.recovery === receipt.recoveryContent && bootstrap.background === receipt.backgroundContent
      && digest(bootstrap.recovery) === receipt.recoverySha256 && bytes.toString('utf8') === receipt.savedContent,
    'Actual startup recovery/profile and saved bytes agree before any control or Open');
    check(interactions.length === 0 && ipc.length === 0, 'Bootstrap recovery is observed before every actual control and file IPC');
    const bootstrapBuild = await built(0, 'restart-bootstrap', { response: { value: { bodies: [receipt.nativeBody] } } });
    const bootstrapSnapshot = await committed(saved, 'restart-bootstrap');
    check(bootstrapSnapshot.recovery === receipt.recoveryContent && bootstrapSnapshot.history.every(button => button.disabled),
      'Fresh process reconstructs the exact original assigned document with empty local history');
    const custom = await waitFor('startup profile custom background applied before controls', async () => {
      const state = await backgroundState();
      return state.persisted === receipt.backgroundContent && state.backgroundColor === 'rgb(221, 238, 255)' && state.backgroundImage === 'none' ? state : false;
    });
    await captureAppearance('recovered-custom');
    check(interactions.length === 0 && ipc.length === 0, 'Read-only startup presentation does not manufacture recovery through UI or IPC');
    const beforeControls = interactions.length, beforeFileIpc = ipc.length;
    await propertiesButton(); await mass(0.001);
    check(await page((form, properties) => {
      const root = document.querySelector(form);
      return root?.querySelector('[aria-label="Nombre del material"]')?.value === properties.material.name
        && root.querySelector('[aria-label="Densidad del material"]')?.value === '1000'
        && root.querySelector('[aria-label="Color de la pieza"]')?.value === properties.appearance.color;
    }, FORM, assignedProperties), 'Recovered fresh form displays the actual material/density/colour');
    await press('.task-panel button[title="Cerrar panel"]');
    const beforeOpen = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const discard = '[role="dialog"][aria-labelledby="discard-title"]';
    const opening = await waitFor('recovered document opens or asks through the real discard dialog', async () => {
      if (await page(selector => !!document.querySelector(selector), discard)) return 'discard';
      return ipc.some(event => event.channel === 'document:open' && event.completed) ? 'opened' : false;
    });
    if (opening === 'discard') await press(discard + ' .primary-button', 'Continuar sin guardar');
    const reopenedBuild = await built(beforeOpen, 'restart-saved-open', bootstrapBuild), reopened = await committed(saved, 'restart-saved-open');
    check(reopened.recovery === receipt.recoveryContent && canonical(await backgroundState()) === canonical(custom)
      && (await fsp.readFile(output)).equals(bytes), 'Actual saved Open preserves exact saved/recovered bytes and custom profile background');
    const beforeSave = (await observe()).serial; await press('button[title="Guardar (Ctrl+S)"]');
    await waitFor('fresh Open grant permits exact ordinary Save without a transferred grant', () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1);
    await unchanged(reopened, beforeSave, bytes, 'restart-native-save');
    await captureAppearance('saved-open-custom');
    await propertiesButton(); await mass(0.001); await press('.task-panel button[title="Cerrar panel"]');
    const serial = (await observe()).serial; await openBackground();
    await press(BACKGROUND + ' button[type="button"]', 'Restaurar predeterminado');
    check(canonical(await backgroundState()) === canonical(custom), 'Restart default restoration waits for actual Apply');
    await press(BACKGROUND + ' button[type="submit"]', 'Aplicar fondo');
    const restored = await waitFor('default profile restored after the real restart', async () => {
      const state = await backgroundState();
      return canonical(state) === canonical(receipt.defaultBackground) && await page(selector => !document.querySelector(selector), BACKGROUND) ? state : false;
    });
    await unchanged(reopened, serial, bytes, 'restart-default-restored');
    await captureAppearance('default-background');
    check((await fsp.readFile(input)).equals(originalBytes) && digest(originalBytes) === receipt.originalSha256,
      'Two-process recovery and actual native Open/Save retain the original fixture bytes');
    evidence.partProperties.restartResult = { bootstrapRecoverySha256: digest(bootstrap.recovery), bootstrapBackgroundContent: bootstrap.background,
      bootstrapBeforeControls: beforeControls, bootstrapBeforeFileIpc: beforeFileIpc, bootstrapNativeSerial: bootstrapBuild.serial,
      bootstrapNativeBody: bootstrapBuild.response.value.bodies[0], savedSha256: digest(await fsp.readFile(output)),
      reopenedRecoverySha256: digest(reopened.recovery), defaultBackground: restored, originalSha256: digest(originalBytes) };
    evidence.partProperties.freshProcessBackgroundPersistence = { status: 'observed-after-real-restart', restoredDefault: true, thirdRestart: 'not-exercised' };
    evidence.partProperties.reopenedNativeSerial = reopenedBuild.serial;
    check(dialogCounts().opens === 1 && dialogCounts().saves === 0 && dialogCounts().geometryExports === 0
      && ipc.filter(event => event.channel === 'document:open' && event.completed).length === 1,
    'Fresh process uses one real Open and ordinary Save on its own new grant, with no Save As or export');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'Restart has no renderer, asset or native-worker errors');
  }
  return async () => {
    const originalBytes = await fsp.readFile(input);
    check(canonical(JSON.parse(originalBytes.toString('utf8'))) === canonical(expected), 'Owned input contains the exact original cube recipe');
    const bootstrap = restart?.phase === 'reopen' ? await page(key => ({ recovery: localStorage.getItem('solidflow.autosave'), background: localStorage.getItem(key) }), KEY) : null;
    await waitFor('property cube production file command ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    if (restart?.phase === 'reopen') { await recoveredPhase(originalBytes, bootstrap); return; }
    let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const originalBuild = await built(serial, 'original-cube'), originalSnapshot = await committed(expected, 'original-cube');
    check(originalSnapshot.history[0].disabled && originalSnapshot.history[1].disabled, 'Original Open resets the part history');
    await press('button[aria-label="Material de la pieza"]'); await mass(null);
    const originalBackground = await backgroundState();
    check(originalBackground.persisted === null && originalBackground.inlineBackground === '', 'Isolated profile starts with the original default background');
    if (restart) await captureAppearance('default-unselected', true);
    await press(FORM + ' .part-property-check', 'Asignar material');
    await change(FORM + ' input[aria-label="Nombre del material"]', assignedProperties.material.name);
    await change(FORM + ' input[aria-label="Densidad del material"]', '1000');
    await press(FORM + ' .part-property-check', 'Color de pieza personalizado');
    await change(FORM + ' input[aria-label="Color de la pieza"]', assignedProperties.appearance.color);
    check(await recovery() === originalSnapshot.recovery, 'Material/colour draft does not commit recovery');
    serial = (await observe()).serial; await press(FORM + ' button[type="submit"]', 'Aplicar propiedades');
    const assignedBuild = await built(serial, 'properties-applied', originalBuild);
    const assigned = await waitFor('applied material/appearance recovery', async () => {
      const text = await recovery(), value = text && JSON.parse(text);
      return value && canonical(value.material) === canonical(assignedProperties.material)
        && canonical(value.appearance) === canonical(assignedProperties.appearance) ? value : false;
    });
    const { material, appearance, updatedAt, ...unchangedDocument } = assigned;
    const { updatedAt: originalUpdatedAt, ...originalDocument } = expected;
    check(canonical(unchangedDocument) === canonical(originalDocument) && updatedAt >= originalUpdatedAt, 'Apply changes only bounded properties and monotonic timestamp');
    const assignedSnapshot = await committed(assigned, 'properties-applied'); await mass(0.001);
    check(!assignedSnapshot.history[0].disabled && assignedSnapshot.history[1].disabled, 'One material transaction is undoable');
    if (restart && context.captureProperties) {
      await captureAppearance('custom-unselected', true);
      const selectionSerial = (await observe()).serial;
      await press('.part-body-catalog .body-row input[type="checkbox"]');
      await waitFor('actual body selection for appearance capture', () => page(host => JSON.parse(document.querySelector(host)?.getAttribute('data-part-selected-bodies') ?? '[]').length === 1, HOST));
      await captureAppearance('selected');
      await press('.part-body-catalog .body-row input[type="checkbox"]');
      await waitFor('actual body deselection restores custom appearance capture', () => page(host => document.querySelector(host)?.getAttribute('data-part-selected-bodies') === '[]', HOST));
      await captureAppearance('deselected-custom');
      await unchanged(assignedSnapshot, selectionSerial, null, 'appearance-selection-observation');
    }
    serial = (await observe()).serial;
    await change(FORM + ' input[aria-label="Nombre del material"]', 'Cancelled material draft');
    await change(FORM + ' input[aria-label="Densidad del material"]', '2000');
    await change(FORM + ' input[aria-label="Color de la pieza"]', '#112233');
    await press(FORM + ' button[type="button"]', 'Cancelar cambios');
    await waitFor('Cancel restores committed property fields', () => page((form, properties) => {
      const root = document.querySelector(form);
      return root?.querySelector('[aria-label="Nombre del material"]')?.value === properties.material.name
        && root.querySelector('[aria-label="Densidad del material"]')?.value === '1000'
        && root.querySelector('[aria-label="Color de la pieza"]')?.value === properties.appearance.color;
    }, FORM, assignedProperties));
    await unchanged(assignedSnapshot, serial, null, 'property-draft-cancel'); await mass(0.001);
    check((await fsp.readFile(input)).equals(originalBytes), 'Property draft Cancel preserves the exact selected original file bytes');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, 'properties-undone', originalBuild);
    const undone = await committed(expected, 'properties-undone'); await mass(null);
    check(undone.recovery === originalSnapshot.recovery && undone.history[0].disabled && !undone.history[1].disabled,
      'Exactly one Undo restores the complete original document and no older transaction');
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, 'properties-redone', assignedBuild);
    const redone = await committed(assigned, 'properties-redone'); await mass(0.001);
    check(redone.recovery === assignedSnapshot.recovery, 'One Redo restores exact assigned document bytes');
    await menu('file', 'Guardar como…');
    await waitFor('actual material cube Save As completes cleanly', async () => dialogCounts().saves === 1
      && ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const bytes = await fsp.readFile(output), saved = JSON.parse(bytes.toString('utf8'));
    check(canonical(saved) === canonical(assigned), 'Native saved bytes contain exact assigned properties, feature IDs and inputs');
    const savedSnapshot = await committed(saved, 'native-saved');
    await press('.task-panel button[title="Cerrar panel"]');
    serial = (await observe()).serial;
    await openBackground(); await press(BACKGROUND + ' label', 'Usar un color sólido');
    await change(BACKGROUND + ' input[aria-label="Color del fondo"]', '#ddeeff');
    await press(BACKGROUND + ' button[type="submit"]', 'Aplicar fondo');
    const solidBackground = await waitFor('actual profile solid background applied', async () => {
      const state = await backgroundState();
      return state.persisted === JSON.stringify({ version: 1, color: '#ddeeff' }) && state.backgroundColor === 'rgb(221, 238, 255)'
        && state.backgroundImage === 'none' && await page(selector => !document.querySelector(selector), BACKGROUND) ? state : false;
    });
    await unchanged(savedSnapshot, serial, bytes, 'background-solid-applied');
    await openBackground(); await change(BACKGROUND + ' input[aria-label="Color del fondo"]', '#123456');
    check(canonical(await backgroundState()) === canonical(solidBackground), 'Background draft does not mutate committed preference or viewport');
    await press(BACKGROUND + ' button[type="button"]', 'Cancelar');
    check(canonical(await backgroundState()) === canonical(solidBackground), 'Background Cancel preserves exact persisted preference and viewport');
    await unchanged(savedSnapshot, serial, bytes, 'background-draft-cancel');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const reopenedBuild = await built(serial, 'saved-reopened', assignedBuild);
    const reopened = await committed(saved, 'saved-reopened');
    check(reopened.history.every(button => button.disabled), 'Saved-document Open has no material/background undo entries');
    check(canonical(await backgroundState()) === canonical(solidBackground), 'Persisted profile background survives actual saved-document Open in the same process');
    await propertiesButton(); await mass(0.001);
    const restoredFields = await page(form => {
      const root = document.querySelector(form);
      return { name: root?.querySelector('[aria-label="Nombre del material"]')?.value,
        density: root?.querySelector('[aria-label="Densidad del material"]')?.value,
        color: root?.querySelector('[aria-label="Color de la pieza"]')?.value };
    }, FORM);
    check(canonical(restoredFields) === canonical({ name: assignedProperties.material.name, density: '1000', color: '#cc6633' }), 'Reopened normal form displays actual saved material/density/colour');
    await press('.task-panel button[title="Cerrar panel"]');
    if (restart) {
      check(restart.phase === 'first' && reopened.recovery === bytes.toString('utf8'), 'Phase one leaves exact saved/recovered bytes before real process exit');
      evidence.partProperties.restartReceipt = { version: 1, kind: 'part-properties-profile-restart', document: saved,
        savedContent: bytes.toString('utf8'), savedSha256: digest(bytes), recoveryContent: reopened.recovery, recoverySha256: digest(reopened.recovery),
        backgroundKey: KEY, backgroundContent: (await backgroundState()).persisted, defaultBackground: originalBackground,
        originalSha256: digest(originalBytes), nativeSerial: reopenedBuild.serial, nativeBody: reopenedBuild.response.value.bodies[0] };
      evidence.partProperties.freshProcessBackgroundPersistence = { status: 'phase-one-only-awaiting-parent-observed-exit-and-restart' };
    } else {
      serial = (await observe()).serial; await openBackground();
      await press(BACKGROUND + ' button[type="button"]', 'Restaurar predeterminado');
      check(canonical(await backgroundState()) === canonical(solidBackground), 'Restore-default draft waits for Apply');
      await press(BACKGROUND + ' button[type="submit"]', 'Aplicar fondo');
      await waitFor('original profile background restored', async () => canonical(await backgroundState()) === canonical(originalBackground)
        && await page(selector => !document.querySelector(selector), BACKGROUND));
      await unchanged(reopened, serial, bytes, 'background-default-restored');
    }
    check((await fsp.readFile(input)).equals(originalBytes), 'The complete workflow preserves the original selected file bytes');
    evidence.partProperties.originalSha256 = digest(originalBytes);
    evidence.partProperties.savedSha256 = digest(bytes);
    evidence.partProperties.sameProcessBackgroundPersistence = { status: 'PASS', solidBackground, ...(restart ? { retainedForRestart: await backgroundState() } : { restoredDefault: await backgroundState() }) };
    evidence.partProperties.reopenedNativeSerial = reopenedBuild.serial;
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().geometryExports === 0, 'Exactly original Open, Save As, saved Open and no geometry export');
    check(ipc.filter(event => event.channel === 'document:open' && event.completed).length === 2, 'Both Open commands use the production file bridge');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Actual production worker and WASM assets loaded');
    check(!consoleErrors.length && !failedRequests.length && !(await observe()).workerErrors.length, 'No renderer, asset or native-worker transport errors');
  };
};
