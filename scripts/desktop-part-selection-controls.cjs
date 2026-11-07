'use strict';
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Browsing the existing original sequential-part fixture, before any edits.
// Pixel targets use its literal bounds and the public orthographic fit, never
// native face/edge coordinates or the application's picking implementation.
module.exports = async function partSelectionControls(context) {
  const { expected, evaluate, observe, waitFor, pointer, check, canonical, checks } = context;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => 'JSON.parse(' + quote(JSON.stringify(value)) + ')').join(',') + ')');
  const host = '.viewport-canvas[aria-label="Vista 3D de la pieza"]';
  // Viewport mounts the WebGL renderer directly, plus a separate role=img triad.
  const canvas = host + ' > canvas:not([role="img"])';
  const mode = name => '.part-selection-controls button[data-part-selection-mode="' + name + '"]';
  const clear = 'button[aria-label="Limpiar selección de pieza"]';
  const selections = () => page(selector => {
    const e = document.querySelector(selector);
    if (!e) throw Error('Part viewport missing');
    const attr = name => e.getAttribute('data-part-' + name);
    return { mode: attr('selection-mode'), hover: attr('hover-kind'),
      face: JSON.parse(attr('selected-face') || 'null'), edges: JSON.parse(attr('selected-edges') || '[]'),
      bodies: JSON.parse(attr('selected-bodies') || '[]') };
  }, host);
  const empty = state => !state.face && !state.edges.length && !state.bodies.length;
  const history = () => page(() => {
    const titles = ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'];
    return titles.map(title => {
      const matches = [...document.querySelectorAll('button')].filter(e => e.title === title);
      if (matches.length !== 1) throw Error('One current history control required');
      return { title, disabled: matches[0].disabled };
    });
  });
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  async function press(point) {
    await pointer('mouseMoved', point);
    await pointer('mousePressed', point, 1);
    await pointer('mouseReleased', point, 0);
  }
  async function button(selector) {
    let previous = null, since = 0;
    const target = await waitFor('visible stationary part selection command ' + selector, async () => {
      const state = await page(selector => {
        const list = document.querySelectorAll(selector);
        if (list.length !== 1) return null;
        const e = list[0], r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const hit = document.elementFromPoint(point.x, point.y);
        return { point, width: r.width, height: r.height, ready: !e.disabled && !e.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && (hit === e || e.contains(hit)) };
      }, selector);
      const key = canonical(state);
      if (key !== previous) { previous = key; since = Date.now(); return false; }
      return state?.ready && Date.now() - since >= 120 ? state : false;
    });
    await press(target.point);
  }
  async function invariant(label) {
    const current = await observe();
    check(current.serial === before.serial && current.builds.length === before.builds.length
      && current.assemblies.length === before.assemblies.length && current.workerErrors.length === 0,
    label + ' issues no worker request or worker error');
    check(await recovery() === beforeRecovery && canonical(await history()) === canonical(beforeHistory),
      label + ' preserves exact recovery and history availability');
  }
  await waitFor('original sequence recovery ready for read-only selection', async () => {
    const saved = await recovery();
    return saved && JSON.parse(saved).id === expected.id;
  });
  const before = await observe(), beforeRecovery = await recovery(), beforeHistory = await history();
  check(before.workerErrors.length === 0, 'Selection browsing begins without worker errors');
  await button('button[title="Vista frontal (Ctrl+1)"]');
  await button('button[title="Ajustar a pantalla (F)"]');
  await button(mode('auto'));
  await waitFor('automatic part selection mode active', async () => (await selections()).mode === 'auto');
  await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const calibration = await page(selector => {
    const list = document.querySelectorAll(selector);
    if (list.length !== 1) throw Error('One part canvas required');
    const r = list[0].getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) throw Error('Part canvas has no layout');
    const aspect = r.width / r.height, halfHeight = 24.6 / Math.min(aspect, 1);
    const scale = r.height / (2 * halfHeight), center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    return { rect: { left: r.left, top: r.top, width: r.width, height: r.height }, scale,
      interior: { x: center.x + 4 * scale, y: center.y - 3 * scale },
      nearEdge: { x: center.x + 4 * scale, y: center.y - 6 * scale + 2 },
      blank: { x: r.left + r.width * .12, y: r.top + r.height * .82 } };
  }, canvas);
  async function canvasPress(point, hover) {
    check(await page((selector, point, rect) => {
      const e = document.querySelector(selector), r = e?.getBoundingClientRect();
      return !!r && r.left === rect.left && r.top === rect.top && r.width === rect.width && r.height === rect.height
        && document.elementFromPoint(point.x, point.y) === e;
    }, canvas, point, calibration.rect), 'Calibrated part pointer remains on the unchanged visible canvas');
    await pointer('mouseMoved', point);
    if (hover) await waitFor('actual automatic part hover ' + hover, async () => (await selections()).hover === hover);
    await pointer('mousePressed', point, 1);
    await pointer('mouseReleased', point, 0);
  }
  await canvasPress(calibration.interior, 'face');
  const face = await waitFor('automatic interior selects one current Base face', async () => {
    const s = await selections();
    return s.face?.sourceFeatureId === 'seq-base' && typeof s.face.key === 'string' && !s.edges.length && !s.bodies.length ? s : false;
  });
  await invariant('Automatic face browsing');
  await canvasPress(calibration.nearEdge, 'edge');
  const edge = await waitFor('automatic near-edge selects one current Base edge', async () => {
    const s = await selections();
    return !s.face && s.edges.length === 1 && s.edges[0].sourceFeatureId === 'seq-base' && typeof s.edges[0].key === 'string' && !s.bodies.length ? s : false;
  });
  await invariant('Automatic edge browsing');
  await canvasPress(calibration.blank);
  await waitFor('blank background clears automatic geometry selection', async () => empty(await selections()));
  await invariant('Blank background clearing');
  await button(mode('body'));
  await waitFor('explicit body selection mode active', async () => (await selections()).mode === 'body');
  await canvasPress(calibration.interior);
  const body = await waitFor('explicit body mode selects only original seq-body', async () => {
    const s = await selections();
    return !s.face && !s.edges.length && s.bodies.length === 1 && s.bodies[0].bodyId === 'seq-body' && s.bodies[0].sourceFeatureId === 'seq-base' ? s : false;
  });
  await invariant('Explicit body browsing');
  await button(clear);
  await waitFor('explicit Clear removes current part selection', async () => empty(await selections()));
  await invariant('Explicit selection clearing');
  await button(mode('auto'));
  await button('button[title="Vista isométrica (Ctrl+7)"]');
  await waitFor('ordinary part browsing restored to empty automatic selection', async () => { const s = await selections(); return s.mode === 'auto' && empty(s); });
  await invariant('Selection browsing restoration');
  checks.push({ partSelectionNavigation: { input: 'Actual CDP pointer on visible commands and calibrated canvas pixels',
    calibration, literalBaseBounds: { min: [-10, -6, 0], max: [10, 6, 4] }, face: face.face, edge: edge.edges[0], body: body.bodies[0],
    phases: ['automatic-face', 'automatic-edge', 'blank-clear', 'explicit-body', 'explicit-clear', 'restore-auto-iso'], serial: before.serial,
    evidenceLimits: 'Original sequence fixture only. DOM canvas bounds plus fixed front-view fit calibrate pixels; native geometry and picker helpers do not supply targets. No camera drag/wheel or general model coverage claimed. Recovery and history availability are checked without applying Undo/Redo.' } });
};
