'use strict';
const fs = require('node:fs/promises');

// Fixed entry points on the existing public sequence fixture. These
// cancellations supplement, and do not replace, each family's native lifecycle.
module.exports = async function partOperationAliases(context) {
  const { waitFor, check, checks, canonical, snapshot, pointer, menuKey,
    cameraFrame, rasterComparison, waitForPresentation, observe, restore, idle,
    document, output, digest } = context;
  const evidence = { entries: [], interactions: [], frames: [],
    limits: 'Finite Insertar/Operaciones aliases on the existing original one-body sequence fixture. Actual contained CDP presses, current input nomination, direct Cancel/Escape, unchanged saved document/history/file authority and exact restored opaque crops. Sweep has no open path here and Combine has one body; their positive native lifecycles remain in the existing sweep/loft and Combine routes. No new operation variant, native Apply authority, other-platform or complete-C13 claim.' };
  checks.push({ partOperationAliases: evidence });
  const { page, press, inspect, reveal } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions: evidence.interactions });
  const MENU = 'nav.part-main-menus [role="menu"] > button[data-assembly-command]';
  const INSERT_TRIGGER = 'nav.part-main-menus button[data-assembly-menu="insert"]';
  const insertTriggerFocused = () => page(selector => document.activeElement === document.querySelector(selector + '[aria-expanded="false"]'), INSERT_TRIGGER);
  const CANCEL = 'button[title="Cancelar operación"]';
  const CLEAR = 'button[aria-label="Limpiar selección de pieza"]';
  const VIEW = '.viewport-canvas[aria-label="Vista 3D de la pieza"]';
  const types = [
    ['Croquis rectangular', 'Croquis', 'Croquis', 'sketch'],
    ['Croquis circular', null, 'Croquis', 'sketch'],
    ['Saliente extruido', 'Saliente/Base extruido', 'Saliente-Extruir', 'extrude'],
    ['Corte extruido', 'Corte extruido', 'Corte-Extruir', 'cut'],
    ['Revolución', 'Revolución', 'Saliente-Revolución', 'revolve'],
    ['Corte por revolución', 'Corte por revolución', 'Corte-Revolución', 'revolvedCut'],
    ['Asistente para taladro', 'Asistente para taladro', 'Taladro', 'hole'],
    ['Barrido', 'Barrido', null, 'sweep'],
    ['Recubrir', 'Recubrir', 'Saliente-Recubrir', 'loft'],
    ['Redondeo', 'Redondeo', 'Redondeo', 'fillet'],
    ['Chaflán', 'Chaflán', 'Chaflán', 'chamfer'],
    ['Vaciado', 'Vaciado', 'Vaciado', 'shell'],
    ['Desmoldeo', 'Desmoldeo', 'Desmoldeo', 'draft'],
    ['Plano de referencia', 'Geometría de referencia', 'Plano', 'plane'],
    ['Matriz lineal', 'Matriz lineal', 'Matriz-Lineal', 'linearPattern'],
    ['Matriz circular', 'Matriz circular', 'Matriz-Circular', 'circularPattern'],
    ['Simetría', 'Simetría', 'Simetría', 'mirror'],
    [null, 'Combinar cuerpos', null, 'combine'],
  ];
  const entries = types.flatMap(([menu, ribbon, title, type]) => [
    ...(menu ? [{ surface: 'Insertar', label: menu, title, type }] : []),
    ...(ribbon ? [{ surface: 'Operaciones', label: ribbon, title, type }] : []),
  ]);
  check(entries.length === 34, 'Exactly seventeen Insertar and seventeen Operaciones entry points');
  const fields = () => page(() => ({ title: document.querySelector('.property-manager .property-title > span')?.textContent,
    inputs: [...document.querySelectorAll('.property-manager input,.property-manager select')].map(e => ({
      label: e.getAttribute('aria-label'), value: e.value, checked: e.checked, disabled: e.disabled })),
    focus: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.getAttribute('title') ?? document.activeElement?.tagName,
    selectedTools: [...document.querySelectorAll('.commands button.command.active > span')].map(e => e.textContent.trim())
      .filter(label => ['Seleccionar', 'Línea', 'Rectángulo', 'Círculo', 'Arco de centro', 'Recortar', 'Extender',
        'Chaflán', 'Redondeo', 'Simetría', 'Equidistancia'].includes(label)) }));
  const authority = async () => {
    const s = await snapshot();
    return { recovery: s.recovery, history: s.ui.history, dialogs: s.dialogs, ipc: s.ipc,
      assemblies: s.native.assemblies, workerErrors: s.native.workerErrors };
  };
  async function frame(label) {
    await waitForPresentation('Operation alias ' + label);
    let previous = '', since = 0;
    return waitFor('settled original opaque entry crop ' + label, async () => {
      const value = await cameraFrame();
      check(value.maskedRects.length === 0 && value.rawSha256 === value.sha256
        && value.unmaskedPixelCount === value.width * value.height, 'Entry crop has no raster exclusions');
      const signature = canonical(value);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return Date.now() - since >= 500 ? value : false;
    });
  }
  const selectedTree = await page(() => [...document.querySelectorAll('.tree-row.selected[data-feature-id]')].map(e => ({
    id: e.dataset.featureId, parent: e.dataset.parentFeatureId ?? null })));
  const saved = await fs.readFile(output), baselineAuthority = await authority();
  const profile = [...document.features].reverse().find(f => f.type === 'sketch' && document.features.some(consumer => consumer.sketchId === f.id));
  const consumer = document.features.find(f => f.sketchId === profile.id);
  const originalBody = (await observe()).builds.filter(r => canonical(r.features) === canonical(document.features)
    && r.response?.ok && r.response.value.bodies?.length === 1).at(-1)?.response.value.bodies[0].ref;
  check(profile && consumer && originalBody, 'Existing saved sketch, consuming operation and current native body own the checklist');
  const clear = async () => { if (await page(s => !document.querySelector(s)?.disabled, CLEAR)) await press(CLEAR); };
  async function nominate(entry) {
    await clear();
    if (['extrude', 'cut', 'revolve', 'revolvedCut', 'loft', 'sweep'].includes(entry.type)) {
      const toggle = 'button[data-part-tree-toggle="' + consumer.id + '"]';
      if (await page(s => document.querySelector(s)?.getAttribute('aria-expanded') === 'false', toggle)) await press(toggle);
      await press('.tree-row[data-feature-id="' + profile.id + '"][data-parent-feature-id="' + consumer.id + '"]');
      check(await page((id, parent, view) => {
        const rows = [...document.querySelectorAll('.tree-row.selected[data-feature-id]')];
        return rows.length === 1 && rows[0].dataset.featureId === id && rows[0].dataset.parentFeatureId === parent
          && document.querySelector(view)?.getAttribute('data-part-selected-bodies') === '[]';
      }, profile.id, consumer.id, VIEW), 'Entry nomination uses the exact current consumed sketch occurrence without a conflicting body selection');
      return { sketch: profile.id, body: null };
    }
    if (['hole', 'fillet', 'chamfer', 'shell', 'draft', 'linearPattern', 'circularPattern', 'mirror', 'combine'].includes(entry.type)) {
      const catalog = '.part-body-catalog > button';
      if (await page(s => document.querySelector(s)?.getAttribute('aria-expanded') === 'false', catalog)) await press(catalog);
      await press('.part-body-catalog .body-catalog-entry input[type="checkbox"]');
      check(await page((s, ref) => document.querySelector(s)?.getAttribute('data-part-selected-bodies') === JSON.stringify([ref])
        && document.querySelectorAll('.tree-row.selected[data-feature-id]').length === 0, VIEW, originalBody),
      'Entry nomination uses the one exact currently built native body without a conflicting feature selection');
      return { sketch: null, body: originalBody };
    }
    return { sketch: null, body: null };
  }
  async function open(entry, disabled = false) {
    if (await page(() => document.querySelector('.ribbon-tabs button.selected')?.textContent.trim() !== 'Operaciones'))
      await press('.ribbon-tabs button', 'Operaciones');
    if (entry.surface === 'Insertar') await press('nav.part-main-menus [data-assembly-menu="insert"]');
    const selector = entry.surface === 'Insertar' ? MENU : '.commands button.command';
    const label = entry.label;
    if (!disabled) { await press(selector, label); return; }
    await reveal(selector, label);
    let previous = '', since = 0;
    const target = await waitFor('stationary disabled operation entry ' + entry.label, async () => {
      const value = await inspect(selector, label), signature = canonical(value), r = value.rect, c = value.clip;
      if (signature !== previous) { previous = signature; since = Date.now(); }
      return value.count === 1 && value.disabled && !value.hidden && value.hit && r?.right > r.left && r.bottom > r.top
        && r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom
        && Date.now() - since >= 120 ? value : false;
    });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Disabled operation entry remains the exact contained target');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    evidence.interactions.push({ surface: entry.surface, label: entry.label, disabled: true, point: target.point, input: 'CDP press/release' });
    if (entry.surface === 'Insertar') await menuKey('Escape');
  }
  await idle();
  const original = await frame('original selection'); rasterComparison.retainMovedBaseline(original);
  await clear();
  const baseline = await frame('original unselected'); rasterComparison.retainBaseline(baseline);
  try {
  for (const [index, entry] of entries.entries()) {
    evidence.pending = { ...entry, phase: 'current input nomination' };
    const nomination = await nominate(entry);
    if (entry.type === 'combine') {
      const guard = await snapshot(); await open(entry, true);
      check(canonical(await snapshot()) === canonical(guard), 'One-body Combine disabled press preserves the exact current state');
      evidence.entries.push({ ...entry, outcome: 'disabled: one native body', inputBody: originalBody });
    } else {
      const serial = (await observe()).serial; await open(entry);
      if (entry.type === 'sweep') {
        await waitFor('current closed profiles explain missing open path', () => page(() => !document.querySelector('.property-manager')
          && document.querySelector('.toast')?.textContent.includes('cadena abierta')));
        check((await observe()).serial === serial, 'Missing sweep path creates no native request or draft');
        evidence.entries.push({ ...entry, outcome: 'guidance: no open path', inputSketch: nomination.sketch });
      } else {
        await waitFor('exact current operation editor ' + entry.label, async () => (await fields()).title === entry.title);
        await waitFor('current editor native work settled before its field snapshot', async () => {
          const state = await observe();
          return state.builds.every(row => row.response) && await page(() =>
            !document.querySelector('.statusbar > span')?.textContent.includes('Reconstruyendo'));
        });
        const current = await fields();
        evidence.pending = { ...entry, phase: 'current editor', editor: current };
        if (entry.type === 'sketch') check(canonical(current.selectedTools) === canonical([entry.label === 'Croquis circular' ? 'Círculo' : 'Rectángulo']),
          'Sketch entry nominates its actual advertised rectangle/circle tool');
        if (['extrude', 'cut', 'revolve', 'revolvedCut'].includes(entry.type))
          check(current.inputs.some(e => e.label === 'Croquis de la operación' && e.value === profile.id), 'Profile alias keeps the exact selected saved sketch');
        if (entry.type === 'loft') check(current.inputs.some(e => e.label === 'Croquis de sección 1' && e.value === profile.id)
          && current.inputs.some(e => e.label === 'Croquis de sección 2' && e.value === document.features.filter(f => f.type === 'sketch').at(-1).id),
        'Loft entry nominates the selected current section and the actual last source section');
        if (['fillet', 'chamfer', 'shell', 'draft', 'hole'].includes(entry.type)) check(await page((s, ref) =>
          document.querySelector(s)?.getAttribute('data-part-selected-bodies') === JSON.stringify([ref]), VIEW, originalBody),
        'Body-operation entry retains exactly its nominated current native body');
        check(await recoveryIsOriginal(), 'Opening the editor never publishes its draft');
        if (entry.surface === 'Insertar') check(await insertTriggerFocused(),
          'The activated Insertar alias returns focus to its actual closed menu trigger');
        if (entry.type === 'extrude' && entry.surface === 'Insertar') {
          await waitFor('new extrusion native observation settled', async () => {
            const state = await observe(); return state.serial > serial && state.builds.every(row => row.response);
          });
          const draftBefore = await snapshot();
          for (const guarded of entries) await open(guarded, true);
          check(canonical(await snapshot()) === canonical(draftBefore), 'All thirty-four disabled entries preserve the exact extrusion draft, references, Apply state, history and native observation');
        }
        const delegateEscape = entry.surface === 'Insertar' && entry.type === 'extrude';
        if (entry.surface === 'Insertar') {
          const menuBefore = await snapshot();
          await press(INSERT_TRIGGER);
          await waitFor('open Insertar popup owns keyboard focus over the current draft', () => page(selector => {
            const trigger = document.querySelector(selector), popup = document.getElementById(trigger?.getAttribute('aria-controls') ?? '');
            return trigger?.getAttribute('aria-expanded') === 'true' && popup?.getAttribute('role') === 'menu'
              && popup.contains(document.activeElement);
          }, INSERT_TRIGGER));
          await menuKey('Escape');
          await waitFor('open Insertar Escape returns focus to its closed trigger', insertTriggerFocused);
          check(canonical(await snapshot()) === canonical(menuBefore), 'Open popup Escape preserves the exact current CAD draft and native authority');
        }
        if (!delegateEscape) await press('.ribbon-tabs button', entry.type === 'sketch' ? 'Croquis' : 'Operaciones');
        let exit = 'editor/Cancel';
        if (entry.type === 'sketch') {
          const draftBefore = await snapshot(); await menuKey('Escape');
          await waitFor('Escape ends the current sketch tool without abandoning its editor', async () => (await fields()).title === 'Croquis'
            && canonical((await fields()).selectedTools) === canonical(['Seleccionar']));
          check(canonical(await snapshot()) === canonical(draftBefore), 'Sketch Escape preserves exact draft fields, references, Apply, history and native state');
          exit = 'editor/Escape ends tool/Cancel';
        }
        const beforeCancel = (await observe()).serial;
        if (delegateEscape) { await menuKey('Escape'); exit = 'closed Insertar/Escape'; }
        else if (entry.type !== 'sketch' && index % 2) { await menuKey('Escape'); exit = 'editor/Escape'; }
        else await press(CANCEL);
        await idle(); await restore(beforeCancel, entry.label + '/cancel');
        evidence.entries.push({ ...entry, outcome: exit, inputSketch: nomination.sketch,
          inputBody: nomination.body, editor: current, menuEscapePreserved: entry.surface === 'Insertar' });
      }
    }
    await clear();
    check(canonical(await authority()) === canonical(baselineAuthority) && (await fs.readFile(output)).equals(saved),
      'Entry lifecycle preserves exact source/recovery/history/file authority: ' + entry.label);
    const after = await frame(entry.label + '/restored'), pixels = rasterComparison.compare(after);
    check(pixels.raw.changedPixels === 0 && pixels.raw.maxByteDelta === 0 && baseline.sha256 === after.sha256,
      'Entry lifecycle restores the exact complete opaque crop: ' + entry.label);
    evidence.frames.push({ surface: entry.surface, label: entry.label, baseline, after, pixels });
    delete evidence.pending;
  }
  for (const row of selectedTree) await press('.tree-row[data-feature-id="' + row.id + '"]'
    + (row.parent === null ? ':not([data-parent-feature-id])' : '[data-parent-feature-id="' + row.parent + '"]'));
  check(canonical(await page(() => [...document.querySelectorAll('.tree-row.selected[data-feature-id]')].map(e => ({
    id: e.dataset.featureId, parent: e.dataset.parentFeatureId ?? null })))) === canonical(selectedTree),
  'Finite entry checklist restores exactly the original selected tree occurrence IDs and parents');
  check(canonical(JSON.parse((await snapshot()).recovery)) === canonical(document) && digest(await fs.readFile(output)) === digest(saved),
    'All finite entries retain the exact saved original document and current source references');
  const restored = await frame('original selection restored'), pixels = rasterComparison.compare(restored, original);
  check(pixels.raw.changedPixels === 0 && pixels.raw.maxByteDelta === 0 && restored.sha256 === original.sha256,
    'Finite entry checklist restores the original selected tree owner and exact camera crop');
  evidence.frames.push({ original, restored, pixels });
  } finally { rasterComparison.clear(); }
  async function recoveryIsOriginal() { return (await snapshot()).recovery === baselineAuthority.recovery; }
};
