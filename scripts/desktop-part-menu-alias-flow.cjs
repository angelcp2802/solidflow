'use strict';
const fs = require('node:fs/promises');
const { version } = require('../package.json');

// Called on the original, already saved/reopened eight-feature pointer recipe.
// Menu and dialog actions use the caller's CDP transport; only DOM is observed.
module.exports = async function partMenuAliases(context) {
  const { page, waitFor, check, checks, canonical, snapshot, press, menuKey, key,
    cameraFrame, rasterComparison, built, observe, idle, document, change, ready, recovery, waitForPresentation, text, pointer, output, digest } = context;
  const phase = context.phase ?? 'committed';
  check(['committed', 'live-sketch'].includes(phase), 'Only the two original part Help contexts are admitted');
  const evidence = { phase, commands: [], frames: {}, limits: 'Help is exercised in the original live sketch and committed part. Other bounded View/Tools/Edit aliases use the saved eight-feature recipe. Actual pointer/key actions and exact restored crops; only translucent-plane ON uses the explicitly recorded one-native-byte quantization contract. No camera/model injection, full-viewport, installed-platform or human-use claim. Other aliases remain separate.' };
  checks.push(phase === 'live-sketch' ? { partHelpLiveSketch: evidence } : { partMenuAliases: evidence });
  if (phase === 'live-sketch') await ready(); else await idle();
  let before = await snapshot();
  const originalRecovery = before.recovery;
  const originalSavedBytes = phase === 'committed' ? await fs.readFile(output) : null;
  const sketchProjection = () => page(() => {
    const svg = document.querySelector('svg[aria-label="Editor de croquis multientidad"]'), matrix = svg?.getScreenCTM();
    if (!svg || !matrix) throw Error('The original visible sketch owns its projection');
    return { viewBox: svg.getAttribute('viewBox'), matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f] };
  });
  const beforeSketchProjection = phase === 'live-sketch' ? await sketchProjection() : null;
  const unchanged = async label => check(canonical(await snapshot()) === canonical(before),
    label + ': exact document/recovery/history, native observation, file authority and selection unchanged');
  async function actual(selector, text = null) {
    await page((selector, text) => {
      const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled || rows[0].closest('[hidden]')) throw Error('One current alias control required');
      rows[0].scrollIntoView({ block: rows[0].closest('.modal') ? 'center' : 'nearest', inline: 'nearest', behavior: 'instant' });
    }, selector, text);
    let previous = '', since = 0;
    await waitFor('contained stationary part menu alias', async () => {
      const state = await page((selector, text) => {
        const rows = [...document.querySelectorAll(selector)].filter(e => text === null || e.textContent.trim() === text);
        if (rows.length !== 1) throw Error('Current alias target replaced');
        const e = rows[0], r = e.getBoundingClientRect(); let left = 0, right = innerWidth, top = 0, bottom = innerHeight;
        for (let owner = e.parentElement; owner; owner = owner.parentElement) {
          const style = getComputedStyle(owner), bounds = owner.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, bounds.left + owner.clientLeft); right = Math.min(right, bounds.left + owner.clientLeft + owner.clientWidth); }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, bounds.top + owner.clientTop); bottom = Math.min(bottom, bounds.top + owner.clientTop + owner.clientHeight); }
        }
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, clip: { left, right, top, bottom },
          available: !e.disabled && e.checkVisibility() && !e.closest('[hidden]') && r.width > 0 && r.height > 0
            && r.left >= left && r.right <= right && r.top >= top && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)) };
      }, selector, text);
      const signature = canonical(state);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    });
    await press(selector, text);
  }
  async function command(menu, label, checked) {
    await actual('nav.part-main-menus > .menu-wrap > button[data-assembly-menu="' + menu + '"]');
    const current = await page(label => {
      const popup = document.querySelector('nav.part-main-menus [role="menu"]');
      const rows = [...(popup?.querySelectorAll(':scope > button[data-assembly-command]') ?? [])]
        .filter(e => e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent.trim() === label);
      if (rows.length !== 1 || rows[0].disabled) throw Error('One enabled exact menu alias required: ' + label);
      return { id: rows[0].dataset.assemblyCommand, role: rows[0].getAttribute('role'), checked: rows[0].getAttribute('aria-checked') };
    }, label);
    check(/^\d+$/.test(current.id), 'Observed literal current menu command ID');
    if (checked !== undefined) check(current.role === 'menuitemcheckbox' && current.checked === String(checked), 'Actual display menu checked state: ' + label);
    await actual('nav.part-main-menus [role="menu"] > button[data-assembly-command="' + current.id + '"]');
    await waitFor('current menu closes after alias activation', () => page(() => !document.querySelector('nav.part-main-menus [role="menu"]')));
    await waitForPresentation('Part alias ' + label);
    evidence.commands.push({ menu, label, ...current, input: 'CDP pointer' });
  }
  async function frame(label) {
    let previous = '', since = 0;
    const result = await waitFor('settled alias display crop ' + label, async () => {
      const next = await cameraFrame();
      check(next.width > 0 && next.height > 0 && /^[a-f0-9]{64}$/.test(next.sha256), 'Fresh actual canvas crop');
      const signature = canonical(next);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return Date.now() - since >= 500 ? next : false;
    });
    evidence.frames[label] = result; return result;
  }
  async function planeOnFrame(off) {
    rasterComparison.retainBaseline(off);
    let first = null, last = null, since = 0, resets = 0, comparison = null;
    const noMasks = value => value.masks.identical && value.masks.expectedPixels === 0 && value.masks.actualPixels === 0;
    const sameMetadata = value => value.pixelEvidence.status === 'retained'
      && canonical(value.pixelEvidence.expected) === canonical(value.pixelEvidence.actual);
    let result;
    try {
      result = await waitFor('two presented translucent-plane crops within one native byte level', async () => {
        const next = await cameraFrame(); last = next;
        check(next.width === off.width && next.height === off.height && next.maskedRects.length === 0
          && next.unmaskedPixelCount === next.width * next.height, 'Full unmasked plane crop retains its dimensions');
        if (!first) { first = next; since = Date.now(); rasterComparison.retainMovedBaseline(first); return false; }
        comparison = rasterComparison.compare(next, first);
        check(noMasks(comparison) && sameMetadata(comparison), 'Plane comparison retains exact crop/DPR/DOM metadata and no exclusions');
        if (comparison.raw.maxByteDelta > 1) {
          first = next; since = Date.now(); resets++; rasterComparison.retainMovedBaseline(first); return false;
        }
        const elapsed = Date.now() - since;
        if (elapsed < 500) return false;
        const effect = rasterComparison.compare(next);
        check(noMasks(effect) && sameMetadata(effect) && effect.raw.changedPixels > 0 && effect.raw.maxByteDelta > 1,
          'Plane ON has a genuine visible effect beyond one-level quantization versus exact OFF');
        evidence.planeOn = { first, last: next, elapsedMs: elapsed, resets, maximumNativeByteDelta: 1,
          comparison: { raw: comparison.raw, unmasked: comparison.unmasked, masks: comparison.masks },
          visibleEffect: { raw: effect.raw, unmasked: effect.unmasked, masks: effect.masks },
          limits: 'Two full crops at least 500 ms apart within one native 8-bit byte level; changed-pixel count is reported, not bounded by a fitted count. No new masks, bit-identical ON, exact camera-state, colour calibration or other GPU claim. All OFF and other camera/frame equalities remain exact.' };
        if (typeof rasterComparison.planePair === 'function') evidence.planeDiagnosticImages = rasterComparison.planePair(first, next);
        return next;
      });
    } catch (error) {
      try {
        evidence.planeOnFailure = { resets, comparison: comparison && { raw: comparison.raw, masks: comparison.masks, pixelEvidence: comparison.pixelEvidence } };
        if (first && last && typeof rasterComparison.planePair === 'function') evidence.planeDiagnosticImages = rasterComparison.planePair(first, last);
      } catch (diagnosticError) { evidence.planeOnFailure.diagnosticError = String(diagnosticError); }
      throw error;
    } finally { rasterComparison.clear(); }
    evidence.frames['planes-on'] = result; return result;
  }
  const help = () => page(expected => {
    const brand = document.querySelector('.modal .modal-brand');
    return brand?.querySelector('strong')?.textContent === 'SolidFlow' && brand.querySelector('span')?.textContent === expected;
  }, version);
  await command('help', 'Ayuda y atajos');
  await waitFor('Help shows the actual application version', help);
  await waitFor('native Help modal owns keyboard focus', () => page(() => {
    const dialog = document.querySelector('dialog.part-help-dialog');
    return dialog?.matches(':modal') && dialog.contains(document.activeElement)
      && document.activeElement?.getAttribute('aria-label') === 'Cerrar ayuda';
  }));
  await menuKey('Tab');
  await waitFor('Tab stays on the Help return control', () => page(() => document.activeElement?.matches('dialog.part-help-dialog .primary-button')));
  await menuKey('Tab');
  await waitFor('native Help Tab cycle returns to its close control', () => page(() => document.activeElement?.matches('dialog.part-help-dialog button[aria-label="Cerrar ayuda"]')));
  await menuKey('Tab', true);
  await waitFor('Reverse Tab wraps Help to its return control', () => page(() => document.activeElement?.matches('dialog.part-help-dialog .primary-button')));
  await menuKey('Tab', true);
  await waitFor('Reverse Tab returns Help to its close control', () => page(() => document.activeElement?.matches('dialog.part-help-dialog button[aria-label="Cerrar ayuda"]')));
  evidence.helpTabCycle = ['Cerrar ayuda', 'Volver a la pieza', 'Cerrar ayuda', 'Volver a la pieza', 'Cerrar ayuda'];
  for (const shortcut of ['N', 'O', 'S']) await key(shortcut);
  check(await help(), 'Help retains ownership of New/Open/Save shortcuts');
  await unchanged('Help shortcut ownership');
  const helpFocus = () => page(() => {
    const e = document.activeElement;
    return { tag: e?.tagName, role: e?.getAttribute('role'), label: e?.getAttribute('aria-label'),
      menu: e?.getAttribute('data-assembly-menu'), inHelp: !!e?.closest('.modal') };
  });
  evidence.helpFocusBeforeEscape = await helpFocus();
  await menuKey('Escape');
  evidence.helpFocusAfterEscape = await helpFocus();
  await waitFor('Escape closes Help', () => page(() => !document.querySelector('.modal-brand')));
  await unchanged('Help Escape');
  await command('help', 'Ayuda y atajos');
  await waitFor('Help reopens', help);
  await actual('button[aria-label="Cerrar ayuda"]');
  await unchanged('Help close button');
  await command('help', 'Ayuda y atajos');
  await waitFor('Help return action is available', help);
  await actual('dialog.part-help-dialog .primary-button');
  await waitFor('Help return action closes the modal', () => page(() => !document.querySelector('dialog.part-help-dialog')));
  await unchanged('Help return action');
  await command('help', 'Ayuda y atajos');
  await waitFor('Help backdrop belongs to the native modal', help);
  const backdrop = await page(() => {
    const dialog = document.querySelector('dialog.part-help-dialog:modal'), bounds = dialog?.getBoundingClientRect();
    if (!bounds || bounds.left <= 4 || bounds.top <= 4) throw Error('Bounded native Help backdrop required');
    const point = { x: bounds.left / 2, y: bounds.top / 2 };
    if (document.elementFromPoint(point.x, point.y) !== dialog) throw Error('Native Help must own the backdrop hit');
    return point;
  });
  await pointer('mouseMoved', backdrop); await pointer('mousePressed', backdrop, 1); await pointer('mouseReleased', backdrop, 0);
  await waitFor('Help backdrop closes only its modal', () => page(() => !document.querySelector('dialog.part-help-dialog')));
  evidence.helpBackdrop = backdrop;
  await unchanged('Help backdrop action');
  if (phase === 'live-sketch') {
    const afterSketchProjection = await sketchProjection();
    check(canonical(afterSketchProjection) === canonical(beforeSketchProjection), 'Help retains the exact actual SVG projection and live sketch');
    evidence.sketchProjection = { before: beforeSketchProjection, after: afterSketchProjection };
    return;
  }
  const base = await frame('initial');
  async function toggle(name, label, baseline) {
    await command('view', label, false);
    const enabled = name === 'planes' ? await planeOnFrame(baseline) : await frame(name + '-on');
    check(enabled.width === baseline.width && enabled.height === baseline.height && enabled.sha256 !== baseline.sha256, label + ': real visible display effect');
    await unchanged(label + ' on');
    await command('view', label, true);
    const restored = await frame(name + '-off');
    check(canonical(restored) === canonical(baseline), label + ': exact bounded canvas restoration');
    await unchanged(label + ' off');
  }
  await toggle('grid', 'Cuadrícula', base);
  // Principal supports are not created reference-plane objects. Author one
  // through its real menu so the display command has an actual native target.
  let serial = (await observe()).serial;
  await command('insert', 'Plano de referencia');
  await waitFor('actual reference-plane editor', () => page(() => !!document.querySelector('input[aria-label="Distancia del plano"]')));
  await change('select[aria-label="Soporte del plano"]', 'principal:XY');
  await change('input[aria-label="Distancia del plano"]', 20);
  await ready(); await actual('button[title="Aceptar operación"]'); await idle();
  const planeRow = await built(serial, 9, 11144, 4136, 13, 'menu-created-plane');
  const withPlane = JSON.parse(await recovery()), plane = withPlane.features.at(-1);
  check(canonical(withPlane.features.slice(0, -1)) === canonical(document.features)
    && plane.type === 'plane' && plane.offset === 20 && plane.support.kind === 'principal' && plane.support.plane === 'XY' && !plane.reversed,
  'Reference menu authors only the original XY+20 plane after the exact eight saved features');
  const nativePlane = planeRow.response.value.planes.filter(value => value.id === plane.id);
  check(nativePlane.length === 1 && nativePlane[0].frame.origin.every((v, i) => Math.abs(v - [0, 0, 20][i]) <= 1e-9)
    && nativePlane[0].frame.normal.every((v, i) => Math.abs(v - [0, 0, 1][i]) <= 1e-9), 'Independent literal native plane origin and normal');
  evidence.referencePlane = { declaration: structuredClone(plane), nativePlane: structuredClone(nativePlane[0]), serial: planeRow.serial,
    originalRecoverySha256: digest(originalRecovery), authoredRecoverySha256: digest(await recovery()) };
  await actual('.tree-row[data-feature-id="' + document.features.at(-1).id + '"]');
  before = await snapshot();
  const planeBase = await frame('planes-before');
  await toggle('planes', 'Planos de referencia', planeBase);
  serial = (await observe()).serial; await key('Z'); await idle();
  await built(serial, 8, 11144, 4136, 13, 'undo-menu-plane');
  check(await recovery() === originalRecovery, 'Undo removes exactly the temporary reference plane and restores the saved document');
  evidence.referencePlane.restoredRecoverySha256 = digest(await recovery());
  before = await snapshot();
  await command('tools', 'Propiedades físicas');
  await waitFor('Tools opens the current part properties', () => page(name => {
    const panel = document.querySelector('.task-panel');
    return panel?.querySelector('h3')?.textContent.includes('Propiedades físicas')
      && panel.querySelector('.panel-intro')?.textContent === name
      && !!panel.querySelector('form[aria-label="Material y apariencia de la pieza"]');
  }, document.name));
  await actual('.task-panel button[title="Cerrar panel"]');
  await unchanged('Tools properties close');
  const renameField = '.modal-backdrop form.modal.small input[aria-label="Nombre de la pieza"]';
  const renameClosed = () => page(() => !document.querySelector('.modal-backdrop form.modal.small input[aria-label="Nombre de la pieza"]'));
  const fieldValue = () => page(selector => document.querySelector(selector)?.value, renameField);
  const nameReceipts = [];
  evidence.rename = nameReceipts;
  await command('edit', 'Cambiar nombre de pieza');
  await waitFor('Part name field owns native keyboard editing', () => page(selector => document.activeElement?.matches(selector), renameField));
  await key('A'); await text('   ');
  check(await fieldValue() === '   ', 'The original rename field receives only the fixed whitespace rejection input');
  await actual('.modal-backdrop form.modal.small .primary-button');
  const rejection = await waitFor('Empty trimmed part name remains editable with a real error', () => page(selector => {
    const field = document.querySelector(selector), error = document.querySelector('.toast.toast-error[role="alert"]');
    return field?.value === '   ' && error?.textContent.trim() ? error.textContent.trim() : false;
  }, renameField));
  await unchanged('Rejected whitespace rename');
  await actual(renameField); await key('A'); await text('Part menu cancelled');
  check(await fieldValue() === 'Part menu cancelled', 'Actual part-name typing reaches its owned form');
  await key('Z');
  const undoneText = await fieldValue();
  check(undoneText !== 'Part menu cancelled', 'Ctrl+Z remains native text undo inside the rename field');
  await unchanged('Rename native text undo');
  await actual('.modal-backdrop form.modal.small .outline-button');
  await waitFor('Rename Cancel closes its original form', renameClosed);
  await unchanged('Rename Cancel');
  nameReceipts.push({ phase: 'invalid-and-cancel', rejection, nativeTextUndo: undoneText, recoverySha256: digest(await recovery()) });
  await command('edit', 'Cambiar nombre de pieza');
  await waitFor('Fresh rename form owns typing', () => page(selector => document.activeElement?.matches(selector), renameField));
  await key('A'); await text('Part menu renamed');
  check(await fieldValue() === 'Part menu renamed', 'The positive rename uses the same actual form');
  await actual('.modal-backdrop form.modal.small .primary-button');
  await waitFor('Accepted rename closes the form', renameClosed); await idle();
  const renamed = JSON.parse(await recovery());
  check(renamed.id === document.id && renamed.name === 'Part menu renamed'
    && canonical(renamed.features) === canonical(document.features) && canonical(renamed.namedViews) === canonical(document.namedViews),
  'Rename changes document metadata while preserving every feature and named view');
  nameReceipts.push({ phase: 'apply', document: renamed, recoverySha256: digest(await recovery()) });
  await command('edit', 'Deshacer'); await idle();
  check(await recovery() === originalRecovery, 'Edit-menu Undo restores the exact saved name and document');
  await command('edit', 'Rehacer'); await idle();
  check(canonical(JSON.parse(await recovery())) === canonical(renamed), 'Edit-menu Redo restores the exact accepted rename');
  await command('edit', 'Deshacer'); await idle();
  check(await recovery() === originalRecovery, 'Rename lifecycle returns to the original saved document');
  await actual('.tree-row[data-feature-id="' + document.features.at(-1).id + '"]');
  serial = (await observe()).serial; await command('edit', 'Eliminar operación'); await idle();
  const deleted = await built(serial, 7, 11192, 4096, 13, 'menu-delete-last-cut');
  const expectedPrefix = document.features.slice(0, -1);
  check(canonical(deleted.features) === canonical(expectedPrefix)
    && deleted.response.value.bodies[0].ref.sourceFeatureId === document.features[5].id,
  'Delete menu removes exactly its selected last cut, retaining its sketch and previous body producer');
  serial = (await observe()).serial; await command('edit', 'Deshacer'); await idle();
  const restored = await built(serial, 8, 11144, 4136, 13, 'undo-menu-delete');
  check(canonical(restored.features) === canonical(document.features), 'Edit-menu Undo restores all exact feature IDs');
  serial = (await observe()).serial; await command('edit', 'Rehacer'); await idle();
  await built(serial, 7, 11192, 4096, 13, 'redo-menu-delete');
  serial = (await observe()).serial; await command('edit', 'Deshacer'); await idle();
  await built(serial, 8, 11144, 4136, 13, 'restore-menu-delete');
  check(await recovery() === originalRecovery, 'Delete/history alias lifecycle restores exact original recovery');
  before = await snapshot();
  serial = (await observe()).serial;
  await command('tools', 'Reconstruir');
  const rebuilt = await built(serial, 8, 11144, 4136, 13, 'menu-rebuild');
  const after = await snapshot();
  check(canonical(rebuilt.features) === canonical(document.features), 'Explicit rebuild retains exact saved feature IDs and declarations');
  check(after.recovery === before.recovery && canonical(after.ui) === canonical(before.ui)
    && canonical(after.dialogs) === canonical(before.dialogs) && canonical(after.ipc) === canonical(before.ipc), 'Rebuild creates fresh native geometry without document/history/file changes');
  evidence.rebuiltSerial = rebuilt.serial;

  const cut = document.features.at(-1);
  const input = document.features.find(feature => feature.id === cut.sketchId);
  check(cut.type === 'cut' && input?.type === 'sketch', 'The last cut has one exact original saved input sketch');
  const cutRow = '.tree-row[data-feature-id="' + cut.id + '"]';
  const sketchRow = '.tree-row[data-feature-id="' + input.id + '"][data-parent-feature-id="' + cut.id + '"]';
  evidence.editEntries = [];
  for (const entry of [
    { label: 'Editar operación', target: cut, selector: cutRow, count: 8, volume: 11144, area: 4136 },
    { label: 'Editar croquis', target: input, selector: sketchRow, count: 7, volume: 11192, area: 4096 },
  ]) {
    await actual(cutRow);
    const initial = await snapshot();
    const beforeEntry = initial.native.serial;
    await command('edit', entry.label);
    const editor = await waitFor('exact saved editor for ' + entry.label, () => page((name, inputId, isSketch) => {
      const panel = document.querySelector('.property-manager');
      if (!panel || panel.querySelector('.confirm-row span')?.textContent.trim() !== 'Editar operación') return false;
      if (panel.querySelector('input[aria-label="Nombre de operación"]')?.value !== name) return false;
      if (isSketch) return !!document.querySelector('svg[aria-label="Editor de croquis multientidad"]');
      return panel.querySelector('select[aria-label="Croquis de la operación"]')?.value === inputId;
    }, entry.target.name, input.id, entry.target.type === 'sketch'));
    check(editor, 'The menu opens the saved feature editor with its own identity and inputs');
    await ready();
    const opened = await built(beforeEntry, entry.count, entry.volume, entry.area, 13, 'menu-entry-' + entry.target.type);
    check(canonical(opened.features) === canonical(document.features.slice(0, entry.count)),
      'The actual editor builds only its exact saved feature prefix');
    check(await recovery() === originalRecovery, 'Opening the editor leaves the committed recovery intact');
    const beforeCancel = (await observe()).serial;
    await actual('.property-manager button[title="Cancelar operación"]');
    await idle();
    const returned = await built(beforeCancel, 8, 11144, 4136, 13, 'menu-return-' + entry.target.type);
    const focus = await waitFor('focus restored to its exact saved tree occurrence', () => page(selector => {
      const row = document.querySelector(selector);
      return row && document.activeElement === row ? row.getAttribute('data-tree-occurrence') : false;
    }, entry.selector));
    const final = await snapshot();
    check(canonical(returned.features) === canonical(document.features)
      && canonical(returned.response.value.bodies) === canonical(rebuilt.response.value.bodies),
    'Cancel restores the exact saved geometry, IDs and producer');
    check(final.recovery === initial.recovery && canonical(final.ui.history) === canonical(initial.ui.history)
      && canonical(final.dialogs) === canonical(initial.dialogs) && canonical(final.ipc) === canonical(initial.ipc),
    'Editor entry and Cancel preserve document history and file authority');
    evidence.editEntries.push({ label: entry.label, targetId: entry.target.id, focus, previewSerial: opened.serial,
      restoredSerial: returned.serial, recoverySha256: digest(final.recovery) });
  }
  check(originalSavedBytes && (await fs.readFile(output)).equals(originalSavedBytes), 'All menu cases preserve the actual saved bytes without another file write');
};
