'use strict';
const fs = require('node:fs/promises');

// Existing original part and drafts only. Public saved-view declarations locate
// material; current native references, never projected coordinates, identify it.
module.exports = async function partSelectionAliases(context, phase = 'committed') {
  const { waitFor, check, checks, canonical, snapshot, pointer, output, document,
    cameraFrame, rasterComparison, waitForPresentation, sketchProjection, digest } = context;
  check(['committed', 'live-sketch', 'saved-operation'].includes(phase), 'Fixed original selection-alias contexts');
  const evidence = { phase, interactions: [], modes: [], frames: {},
    limits: 'Four ordinary part selection controls on the original saved eight-feature part, plus the existing live sketch and saved-cut draft. Actual contained CDP presses, current native target identities and exact full opaque crop restoration. The existing recalled saved view locates material only. No camera/React/model injection, new geometric fixture, full-viewport, other-platform or complete-C13 claim.' };
  checks.push({ partSelectionAliases: evidence });
  const { page, press, inspect, reveal } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions: evidence.interactions });
  const GROUP = '.part-selection-controls';
  const VIEW = '.viewport-canvas[aria-label="Vista 3D de la pieza"]';
  const CLEAR = GROUP + ' button[aria-label="Limpiar selección de pieza"]';
  const PLANES = '.viewport-toolbar button[aria-label="Mostrar planos de referencia"]';
  const modes = ['auto', 'face', 'edge', 'body'];
  const modeButton = mode => GROUP + ' button[data-part-selection-mode="' + mode + '"]';
  const state = () => page((group, viewport) => {
    const view = document.querySelector(viewport), decode = name => {
      const value = view?.getAttribute('data-part-' + name); return value ? JSON.parse(value) : null;
    };
    return { mode: view?.getAttribute('data-part-selection-mode') ?? null,
      face: decode('selected-face'), edges: decode('selected-edges'), bodies: decode('selected-bodies'),
      buttons: [...document.querySelectorAll(group + ' button[data-part-selection-mode]')].map(button => ({
        mode: button.dataset.partSelectionMode, pressed: button.getAttribute('aria-pressed'), disabled: button.disabled })),
      clearDisabled: document.querySelector(group + ' button[aria-label="Limpiar selección de pieza"]')?.disabled,
      selectedTree: [...document.querySelectorAll('.tree-row.selected[data-feature-id]')].map(row => ({ id: row.dataset.featureId, occurrence: row.dataset.treeOccurrence })) };
  }, GROUP, VIEW);
  async function frame(name) {
    await waitForPresentation('Part selection alias ' + name);
    let previous = '', since = 0;
    const result = await waitFor('stationary full opaque selection crop ' + name, async () => {
      const value = await cameraFrame();
      check(value.maskedRects.length === 0 && value.unmaskedPixelCount === value.width * value.height
        && value.rawSha256 === value.sha256, 'Selection crop uses fresh native opaque bytes without exclusions');
      const signature = canonical(value);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return Date.now() - since >= 500 ? value : false;
    });
    evidence.frames[name] = result; return result;
  }
  async function disabledPress(selector) {
    await reveal(selector);
    let previous = '', since = 0;
    const target = await waitFor('stationary disabled selection control ' + selector, async () => {
      const value = await inspect(selector), signature = canonical(value);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      const r = value.rect, clip = value.clip;
      return value.count === 1 && value.disabled && !value.hidden && value.hit && r && clip
        && r.left >= clip.left && r.right <= clip.right && r.top >= clip.top && r.bottom <= clip.bottom
        && Date.now() - since >= 120 ? value : false;
    });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector)) === canonical(target), 'Disabled current control remains contained and hit-tested before its actual press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    evidence.interactions.push({ selector, point: target.point, disabled: true, input: 'CDP press on the actual disabled control' });
  }

  if (phase !== 'committed') {
    const before = await snapshot(), beforeState = await state();
    evidence.owner = await page(() => ({ name: document.querySelector('input[aria-label="Nombre de operación"]')?.value,
      editor: !!document.querySelector('.property-manager'), sketch: !!document.querySelector('svg[aria-label="Editor de croquis multientidad"]') }));
    check(evidence.owner.editor && evidence.owner.sketch === (phase === 'live-sketch'), 'The existing draft owns this selection-guard case');
    check(beforeState.buttons.length === 4 && beforeState.buttons.every(button => button.disabled)
      && beforeState.buttons.filter(button => button.pressed === 'true').length === 1 && beforeState.clearDisabled,
    'All four ordinary modes and Clear are disabled while the existing draft owns input');
    const projection = phase === 'live-sketch' ? await sketchProjection() : await frame('draft-before');
    for (const mode of modes) await disabledPress(modeButton(mode));
    await disabledPress(CLEAR);
    check(canonical(await snapshot()) === canonical(before) && canonical(await state()) === canonical(beforeState),
      'Actual disabled presses preserve the current draft, effective mode, selection, native work, history and file authority');
    const planes = await page(selector => ({ active: document.querySelector(selector)?.classList.contains('active'), disabled: document.querySelector(selector)?.disabled }), PLANES);
    check(planes.disabled === false, 'Planes remain an enabled presentation control during the draft');
    await press(PLANES); check(await page((selector, active) => document.querySelector(selector)?.classList.contains('active') === !active, PLANES, planes.active), 'Draft plane control changes only its presentation state');
    await press(PLANES); check(await page((selector, active) => document.querySelector(selector)?.classList.contains('active') === active, PLANES, planes.active), 'Draft plane control restores its original presentation state');
    check(canonical(await snapshot()) === canonical(before) && canonical(await state()) === canonical(beforeState), 'Draft plane toggles preserve the same draft owner and exact document/history/native observations');
    if (phase === 'live-sketch') check(canonical(await sketchProjection()) === canonical(projection), 'Draft aliases preserve the exact existing SVG projection');
    else {
      const after = await frame('draft-restored');
      check(canonical(after) === canonical(projection), 'Draft aliases restore exactly the original opaque canvas crop');
    }
    evidence.before = beforeState; evidence.after = await state(); return;
  }

  const before = await snapshot(), beforeState = await state(), savedBytes = await fs.readFile(output);
  const current = JSON.parse(before.recovery);
  check(canonical(current) === canonical(document) && (await fs.readFile(output)).equals(savedBytes), 'Selection aliases own the exact saved and reopened original document');
  check(beforeState.buttons.length === 4 && beforeState.buttons.every(button => !button.disabled)
    && modes.includes(beforeState.mode), 'All ordinary modes are enabled only for the current committed preview');
  const native = before.native.builds.filter(record => record.response?.ok && canonical(record.features) === canonical(document.features)).at(-1);
  const bodies = native?.response.value.bodies;
  check(bodies?.length === 1 && bodies[0].ref.sourceFeatureId === document.features.at(-1).id, 'One actual current native body owns all selection witnesses');
  const body = bodies[0];
  check(document.namedViews?.length === 1, 'The existing workflow has recalled its single surviving saved view');
  const view = document.namedViews[0].view;
  // Literal quiet material on the original plate. Choose its visible exterior
  // side using only the public saved pose, not a renderer raycast or reference.
  const side = view.position.map((v, i) => v - view.target[i]), axes = [0, 1, 2].sort((a, b) => Math.abs(side[b]) - Math.abs(side[a]));
  const a = axes[0], b = axes[1], remaining = axes[2], box = [[-20, -15, 0], [20, 15, 10]];
  const boundary = axis => box[side[axis] >= 0 ? 1 : 0][axis], normal = [0, 0, 0]; normal[a] = side[a] >= 0 ? 1 : -1;
  const facePoint = [-10, 10, 5], edgePoint = [0, 0, 5]; facePoint[a] = boundary(a); edgePoint[a] = boundary(a); edgePoint[b] = boundary(b);
  const face = body.faces?.filter(face => face.frame?.normal.every((v, i) => Math.abs(v - normal[i]) < 1e-6)
    && Math.abs(face.frame.origin[a] - boundary(a)) < 1e-6);
  const edge = body.edges?.filter(edge => edge.lines.length >= 6 && edge.lines.every((v, i) => i % 3 === a ? Math.abs(v - boundary(a)) < 1e-6 : i % 3 === b ? Math.abs(v - boundary(b)) < 1e-6 : true)
    && Math.abs(Math.min(...edge.lines.filter((_, i) => i % 3 === remaining)) - box[0][remaining]) < 1e-6
    && Math.abs(Math.max(...edge.lines.filter((_, i) => i % 3 === remaining)) - box[1][remaining]) < 1e-6);
  check(face?.length === 1 && edge?.length === 1, 'Unique current exterior plate face and literal boundary LINE edge');
  evidence.native = { serial: native.serial, body: body.ref, face: face[0].ref, edge: edge[0].ref, savedViewId: document.namedViews[0].id,
    savedViewSha256: digest(canonical(view)), savedSha256: digest(savedBytes) };
  const invariant = value => { const { selection, ...ui } = value.ui; return { ...value, ui }; };
  const expectedInvariant = invariant(before);
  const unchanged = async label => check(canonical(invariant(await snapshot())) === canonical(expectedInvariant)
    && (await fs.readFile(output)).equals(savedBytes), label + ' preserves exact native work, document/recovery/history and actual saved bytes');
  const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = value => { const length = Math.hypot(...value); check(Number.isFinite(length) && length > 0, 'Finite public saved-view screen basis'); return value.map(v => v / length); };
  const direction = unit(sub(view.target, view.position)), horizontal = unit(cross(direction, view.up)), vertical = cross(horizontal, direction);
  async function projection(local) {
    const rect = await page(selector => { const canvas = document.querySelector(selector + ' > canvas:not([role="img"])'), r = canvas.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }, VIEW);
    const relative = sub(local, view.target), half = (view.top - view.bottom) / (2 * view.zoom), centerY = (view.top + view.bottom) / (2 * view.zoom);
    const point = { x: rect.x + rect.width / 2 + dot(relative, horizontal) * rect.height / (2 * half),
      y: rect.y + rect.height / 2 - (dot(relative, vertical) - centerY) * rect.height / (2 * half) };
    check(point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height
      && await page((selector, point) => document.elementFromPoint(point.x, point.y) === document.querySelector(selector + ' > canvas:not([role="img"])'), VIEW, point), 'Literal original material is inside the current actual canvas');
    return { local, point, rect };
  }
  try {
    const originalFrame = await frame('original-selected'); rasterComparison.retainMovedBaseline(originalFrame);
    await press(modeButton(beforeState.mode));
    const baseline = await frame('original-unselected'); rasterComparison.retainBaseline(baseline);
    for (const mode of modes) {
      await press(modeButton(mode));
      const empty = await state();
      check(empty.mode === mode && empty.buttons.filter(button => button.pressed === 'true').map(button => button.mode).join() === mode
        && !empty.face && empty.edges.length === 0 && empty.bodies.length === 0 && empty.clearDisabled, 'The actual mode button owns one current effective mode and clears prior nominations');
      const projected = await projection(mode === 'edge' ? edgePoint : facePoint);
      await pointer('mouseMoved', projected.point); await pointer('mousePressed', projected.point, 1); await pointer('mouseReleased', projected.point, 0);
      const expected = mode === 'body' ? body.ref : mode === 'edge' ? edge[0].ref : face[0].ref;
      const selected = await waitFor('current native target under part mode ' + mode, async () => {
        const value = await state(), actual = mode === 'body' ? value.bodies : mode === 'edge' ? value.edges : value.face;
        return canonical(actual) === canonical(mode === 'body' || mode === 'edge' ? [expected] : expected) ? value : false;
      });
      check(selected.mode === mode && !selected.clearDisabled && (mode === 'body' ? !selected.face && selected.edges.length === 0
        : mode === 'edge' ? !selected.face && selected.bodies.length === 0 : selected.edges.length === 0 && selected.bodies.length === 0), 'A real canvas press nominates only the intended current native target kind');
      evidence.modes.push({ mode, projected, expected, actual: selected }); await unchanged('Selection mode ' + mode);
      await press(CLEAR);
      const cleared = await state(), restored = await frame(mode + '-cleared'), pixels = rasterComparison.compare(restored);
      check(cleared.clearDisabled && !cleared.face && cleared.edges.length === 0 && cleared.bodies.length === 0
        && canonical(restored) === canonical(baseline) && pixels.raw.changedPixels === 0 && pixels.raw.maxByteDelta === 0, 'Clear restores the exact unselected opaque frame without camera movement');
      await unchanged('Clear after ' + mode);
    }
    await press(modeButton(beforeState.mode));
    await press('.tree-row[data-feature-id="' + document.features.at(-1).id + '"]:not([data-parent-feature-id])');
    const restored = await frame('original-selection-restored'), pixels = rasterComparison.compare(restored, originalFrame);
    check(canonical(await state()) === canonical(beforeState) && canonical(restored) === canonical(originalFrame)
      && pixels.raw.changedPixels === 0 && pixels.raw.maxByteDelta === 0, 'All selection aliases restore the original current selection and exact camera/display crop');
    await unchanged('All four selection aliases');
  } finally { rasterComparison.clear(); }
};
