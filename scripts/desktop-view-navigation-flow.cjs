'use strict';

// Shared, read-only camera acceptance. Input and fresh stationary canvas crops
// belong to the test-owned transport supplied by the caller, not camera APIs.
module.exports = async function viewNavigation(context) {
  const { page, waitFor, check, checks, canonical, snapshot, key, cameraGesture, cameraFrame, rasterComparison, kind, actualControl } = context;
  let rasterUnavailable = false;
  check(['part', 'standard', 'configured'].includes(kind), 'Known view-navigation workspace');
  const evidence = { kind, presets: [], menuPresets: [], gestures: [], previous: [], projectionTolerancePx: .11,
    limits: 'Actual keys, View-menu pointer actions and CDP middle-drag/pan/wheel; fresh central canvas crop only (12–88% width, 20–80% height), excluding bounded visible HTML origin-label text rectangles. Exact remaining pixels prove bounded displayed restoration, not exact preset orientation, BRep validity or full-viewport equality. Independent basis tests cover orientation. The orientation selector inventory is observed, not selected by this route. Optional SVG witnesses are actual projected anchors, never displaced label boxes. No camera state is read or injected.' };
  checks.push({ viewNavigation: evidence });
  const before = await snapshot();
  check(before.native && Array.isArray(before.native.builds) && Array.isArray(before.native.assemblies)
    && Array.isArray(before.native.workerErrors) && before.native.workerErrors.length === 0,
  'Camera navigation starts with a complete error-free worker observation');
  const records = [...before.native.builds, ...before.native.assemblies]
    .filter(row => row.response?.ok).sort((a, b) => b.serial - a.serial);
  let geometry = null;
  for (const record of records) {
    let value = record.response.value;
    for (let depth = 0; value && depth < 4; depth++, value = value.scene) {
      if (Array.isArray(value.bodies)) { geometry = { serial: record.serial, count: value.bodies.length }; break; }
    }
    if (geometry) break;
  }
  check(geometry && geometry.count > 0, 'Camera navigation requires a completed nonempty body scene');
  evidence.geometry = geometry;
  const projection = () => page(() => {
    const layer = document.querySelector('.assembly-origin-labels');
    if (!layer) return [];
    const buttons = [...layer.children].filter(e => e.matches('button[data-origin-key]'));
    const lines = [...layer.querySelectorAll(':scope > svg > line')];
    if (buttons.length !== lines.length) throw Error('Projected origin leader/label correspondence changed');
    return buttons.map((button, index) => ({ key: button.dataset.originKey,
      x: Number(lines[index].getAttribute('x1')), y: Number(lines[index].getAttribute('y1')) }));
  });
  async function frame(label, onAccepted) {
    let previous = '', since = 0;
    const value = await waitFor('stationary rendered camera crop: ' + label, async () => {
      const current = await cameraFrame();
      check(Number.isInteger(current.width) && current.width > 0 && Number.isInteger(current.height) && current.height > 0
        && /^[0-9a-f]{64}$/.test(current.sha256), 'A fresh nonempty canvas crop is required');
      check(/^[0-9a-f]{64}$/.test(current.rawSha256) && Array.isArray(current.maskedRects)
        && current.unmaskedPixelCount >= current.width * current.height * .9, 'Raw capture and bounded text exclusions are retained');
      const { rawSha256, ...compared } = current;
      const signature = canonical(compared);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      // A short identical-pixel plateau can precede the final damped pan frame.
      // Require a longer unchanged observation, without relaxing any pixel
      // comparison or the caller's existing operation deadline.
      return Date.now() - since >= 500 ? current : false;
    });
    // Bind diagnostic references to the exact accepted poll, before the
    // independent projection read and the public frame's shallow copy.
    try { onAccepted?.(value); } catch { rasterUnavailable = true; }
    const projected = await projection();
    check(projected.every(p => p.key && Number.isFinite(p.x) && Number.isFinite(p.y)), 'Finite projected origin witnesses');
    return { ...value, projected };
  }
  async function unchanged(label) {
    check(canonical(await snapshot()) === canonical(before), label + ': exact worker history, recovery, file IPC, document history and selection unchanged');
  }
  function projectedSame(actual, expected, label) {
    check(actual.projected.length === expected.projected.length && actual.projected.every((p, index) => {
      const q = expected.projected[index];
      return p.key === q.key && Math.abs(p.x - q.x) <= .11 && Math.abs(p.y - q.y) <= .11;
    }), label + ': retained projected origin anchors within 0.11 CSS px');
  }
  function same(actual, expected, label) {
    check(actual.width === expected.width && actual.height === expected.height && actual.sha256 === expected.sha256,
      label + ': exact stationary unmasked central canvas restoration ' + canonical({ actual, expected }));
    check(canonical(actual.maskedRects) === canonical(expected.maskedRects) && actual.unmaskedPixelCount === expected.unmaskedPixelCount,
      label + ': identical text exclusion identities, text, state and integer bounds');
    projectedSame(actual, expected, label);
  }
  function changed(actual, expected, label) {
    check(actual.width === expected.width && actual.height === expected.height && actual.sha256 !== expected.sha256,
      label + ': actual rendered scene changes at unchanged canvas dimensions');
  }
  async function menuPreset(name, label) {
    check(typeof actualControl === 'function', 'Additional presets require the original actual pointer transport');
    await actualControl('button[data-assembly-menu="view"]', 'Ver');
    const menu = await waitFor('View-menu popup belongs to its current trigger: ' + name, async () => {
      const value = await page(label => {
        const triggers = document.querySelectorAll('button[data-assembly-menu="view"]'), menus = document.querySelectorAll('[role="menu"]');
        const trigger = triggers[0], popup = menus[0];
        const rows = [...(popup?.querySelectorAll('button[role="menuitem"]') ?? [])].filter(row => row.textContent.trim() === label);
        const row = rows[0];
        return { triggerCount: triggers.length, menuCount: menus.length, expanded: trigger?.getAttribute('aria-expanded') === 'true',
          owned: !!trigger && popup?.getAttribute('aria-labelledby') === trigger.id, count: rows.length,
          enabled: !!row && !row.disabled, shortcut: !!row?.querySelector('.assembly-menu-shortcut'),
          command: row?.getAttribute('data-assembly-command') ?? null };
      }, label);
      return value.triggerCount === 1 && value.menuCount === 1 && value.expanded && value.owned ? value : false;
    });
    check(menu.triggerCount === 1 && menu.menuCount === 1 && menu.expanded && menu.owned && menu.count === 1
      && menu.enabled && !menu.shortcut && typeof menu.command === 'string' && menu.command.length > 0,
      'One current enabled View-menu command without an invented shortcut: ' + name);
    await actualControl('[role="menu"] button[role="menuitem"]', label);
    await waitFor('View-menu command closes its popup: ' + name, () => page(() => !document.querySelector('[role="menu"]')));
    return { name, label, command: menu.command, transport: 'actual View-menu pointer actions' };
  }
  try {
    await key('7');
    const iso = await frame('initial isometric');
    await unchanged('Initial isometric');
    const presets = new Map();
    for (const command of ['1', '2', '3', '4', '5', '6', '7']) {
      await key(command);
      const current = await frame('preset ' + command);
      if (command !== '7') changed(current, iso, 'Preset ' + command + ' differs from isometric');
      else same(current, iso, 'Isometric preset repeat');
      presets.set(command, current); evidence.presets.push({ command, frame: current });
      await unchanged('Preset ' + command);
    }
    // Selecting the already current preset must not insert an identical history
    // item. Two Previous commands then consume distinct accepted camera states.
    await key('7'); same(await frame('repeated isometric'), iso, 'Repeated current preset');
    for (const command of ['6', '5']) {
      await key('ShiftZ'); const restored = await frame('previous preset ' + command);
      same(restored, presets.get(command), 'Previous returns preset ' + command);
      evidence.previous.push({ expectedPreset: command, frame: restored });
      await unchanged('Previous preset ' + command);
    }
    for (const gesture of ['orbit', 'pan', 'wheel-in']) {
      await key('7'); const base = await frame(gesture + ' initial isometric', gesture === 'wheel-in'
        ? result => rasterComparison?.retainBaseline(result) : undefined);
      same(base, iso, gesture + ' baseline');
      await cameraGesture(gesture); const moved = await frame(gesture + ' actual input');
      changed(moved, base, gesture);
      await unchanged(gesture);
      if (gesture === 'wheel-in') {
        await key('F'); const fitted = await frame('fit after wheel');
        // Fit recomputes framing; it does not restore a stored camera snapshot.
        // Floating-point normalization may change raster edges despite matching
        // projected geometry. Keep every Previous comparison pixel-exact below.
        changed(fitted, moved, 'Fit visibly changes the zoomed scene');
        projectedSame(fitted, base, 'Fit recovers the projected framing');
        await key('ShiftZ'); same(await frame('previous restores zoom after Fit'), moved, 'Previous restores zoom before Fit');
        await unchanged('Fit and Previous');
        evidence.fit = { fitted, baseline: base, restored: moved,
          limits: 'Fit must change the zoomed crop at unchanged dimensions and recover available SVG anchors within 0.11 CSS px. It need not reproduce the preset bitmap; independent camera tests check framing numerically. Previous retains exact text exclusions and every remaining pixel.' };
      }
      await key('1'); const front = await frame(gesture + ' temporary front');
      changed(front, moved, gesture + ' temporary preset');
      await key('ShiftZ'); const restored = await frame(gesture + ' previous restores gesture');
      same(restored, moved, 'Previous restores ' + gesture);
      let restoredBaseResult;
      await key('ShiftZ'); const restoredBase = await frame(gesture + ' previous restores baseline', gesture === 'wheel-in'
        ? result => { restoredBaseResult = result; } : undefined);
      try {
        same(restoredBase, base, 'Previous crosses one completed ' + gesture + ' transaction');
      } catch (error) {
        if (gesture === 'wheel-in' && rasterComparison) {
          try {
            evidence.rasterComparison = rasterUnavailable ? { status: 'unavailable' } : rasterComparison.compare(restoredBaseResult);
          } catch { evidence.rasterComparison = { status: 'unavailable' }; }
        }
        throw error;
      }
      await unchanged(gesture + ' Previous twice');
      evidence.gestures.push({ gesture, base, moved, restored, restoredBase });
    }
    await key('7'); same(await frame('final isometric'), iso, 'Final isometric');
    await unchanged('Completed camera browsing');
    const orientation = await page(() => {
      const selectors = document.querySelectorAll('select[aria-label="Orientación de vista"]'), select = selectors[0];
      return { count: selectors.length, enabled: !!select && !select.disabled,
        visible: !!select?.checkVisibility() && select.getClientRects().length > 0, value: select?.value,
        options: [...(select?.options ?? [])].map(option => ({ value: option.value, label: option.textContent.trim(), disabled: option.disabled })) };
    });
    check(orientation.count === 1 && orientation.enabled && orientation.visible && orientation.value === ''
      && canonical(orientation.options.map(option => option.value)) === canonical(['', 'front', 'back', 'left', 'right', 'top', 'bottom', 'iso', 'dimetric', 'trimetric', 'normal'])
      && [['dimetric', 'Dimétrica'], ['trimetric', 'Trimétrica']].every(([name, label]) => orientation.options.some(option => option.value === name && option.label === label && !option.disabled)),
      'Shared orientation selector exposes both additional presets without shortcuts and leaves Normal To last');
    evidence.orientation = orientation;
    let previousMenuFrame = iso;
    for (const [name, label] of [['dimetric', 'Dimétrica'], ['trimetric', 'Trimétrica']]) {
      const input = await menuPreset(name, label), current = await frame('menu preset ' + name);
      changed(current, iso, 'Menu preset ' + name + ' differs from isometric');
      if (name === 'trimetric') changed(current, previousMenuFrame, 'Trimetric differs from dimetric');
      await unchanged('Menu preset ' + name);
      const repeatedInput = await menuPreset(name, label), repeated = await frame('repeated menu preset ' + name);
      same(repeated, current, 'Repeated menu preset ' + name);
      await unchanged('Repeated menu preset ' + name);
      evidence.menuPresets.push({ ...input, frame: current, repeatedInput, repeated });
      previousMenuFrame = current;
    }
    for (const [name, expected] of [['dimetric', evidence.menuPresets[0].frame], ['isometric', iso]]) {
      await key('ShiftZ'); const restored = await frame('previous menu preset ' + name);
      same(restored, expected, 'Previous bypasses repeated menu preset and returns ' + name);
      await unchanged('Previous menu preset ' + name);
      evidence.previous.push({ expectedPreset: name, frame: restored });
    }
    evidence.completed = true;
  } finally {
    // Diagnostics must never replace the original assertion or retain crops
    // after either successful navigation or an earlier workflow failure.
    try { rasterComparison?.clear(); } catch { /* Optional diagnostics only. */ }
  }
};
