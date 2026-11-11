'use strict';
const fsp = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Presentation evidence for fixed original-fixture states. This does not
// inspect pixels, attest CAD geometry or activate any application control.
module.exports = function createPartActiveProfileCapture({ window, evaluate, waitFor, waitForPresentation, check, owned, digest, captures, STEP_MS }) {
  const phases = new Map([['staged-sleeve', 'sleeve-profile'], ['consumed-sleeve', 'sleeve-profile'],
    ['revolved-groove', 'outer-groove-one']]), attempted = new Set();
  check(Number.isSafeInteger(STEP_MS) && STEP_MS > 0, 'Active-profile capture requires the existing step deadline.');
  check(typeof owned === 'string' && path.isAbsolute(owned) && Array.isArray(captures), 'Active-profile capture requires owned output and a separate evidence array.');
  let capturing = false;
  return async (phase, sketchId) => {
    check(process.env.SOLIDFLOW_UI_CAPTURE === '1', 'Active-profile capture requires the explicit capture setting.');
    check(phases.get(phase) === sketchId, 'Only fixed original profile/phase bindings may be captured.');
    check(!capturing && !attempted.has(phase) && attempted.size < phases.size && captures.length < phases.size,
      'Active-profile captures must be sequential, unique and limited to the three fixed phases.');
    check(!window.isDestroyed() && !window.isVisible(), 'Active-profile capture requires the hidden test-owned window.');
    attempted.add(phase);
    capturing = true;
    const read = () => evaluate(`(() => {
      const visible = element => !!element && !element.closest('[hidden]') && element.getClientRects().length > 0
        && getComputedStyle(element).visibility === 'visible';
      const managers = [...document.querySelectorAll('.property-manager')].filter(visible);
      const manager = managers.length === 1 ? managers[0] : null;
      const selectors = manager ? [...manager.querySelectorAll('select[aria-label="Croquis de la operación"]')] : [];
      const applies = manager ? [...manager.querySelectorAll('button[title="Aceptar operación"]')] : [];
      const viewports = [...document.querySelectorAll('.viewport-canvas')].filter(visible);
      const viewport = viewports.length === 1 ? viewports[0] : null, rect = viewport?.getBoundingClientRect();
      const activeInputs = viewport?.getAttribute('data-part-active-input-sketches');
      const bounds = rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      const ready = !!manager && selectors.length === 1 && visible(selectors[0]) && selectors[0].value === ${quote(sketchId)}
        && applies.length === 1 && visible(applies[0]) && !applies[0].disabled
        && activeInputs === ${quote(JSON.stringify([sketchId]))} && !!rect && rect.width > 0 && rect.height > 0
        && rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
      return { ready, viewportBounds: bounds, activeInputs, sketchId: selectors[0]?.value ?? null,
        applyEnabled: applies.length === 1 && !applies[0].disabled, windowWidth: innerWidth, windowHeight: innerHeight };
    })()`);
    try {
      await waitFor('current resolved active profile before ' + phase + ' capture', async () => (await read()).ready, STEP_MS);
      const before = await read();
      check(before.ready && !window.isVisible(), 'The active-profile editor must remain ready and hidden before presentation.');
      // Wait for React/WebGL frames, then observe an actual compositor frame.
      // Neither barrier is a pixel or native-geometry oracle.
      await evaluate(`new Promise((resolve, reject) => {
        let first, second;
        const timer = setTimeout(() => {
          cancelAnimationFrame(first); cancelAnimationFrame(second);
          reject(new Error('Active-profile renderer frame deadline.'));
        }, ${STEP_MS});
        first = requestAnimationFrame(() => {
          second = requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
        });
      })`);
      await waitForPresentation('Active-profile');
      const presented = await read();
      check(presented.ready && JSON.stringify(presented) === JSON.stringify(before) && !window.isVisible(),
        'The active-profile editor and viewport bounds must remain unchanged through presentation.');
      const image = await window.webContents.capturePage(undefined, { stayHidden: true });
      const png = image.toPNG(), size = image.getSize();
      check(!image.isEmpty() && png.length > 0 && png.length <= 10 * 1024 * 1024
        && Number.isInteger(size.width) && size.width > 0 && Number.isInteger(size.height) && size.height > 0,
      'Active-profile capture must be a nonempty PNG no larger than 10 MiB.');
      const after = await read();
      check(after.ready && JSON.stringify(after) === JSON.stringify(before) && !window.isVisible(),
        'The active-profile editor and viewport bounds must remain unchanged after capture.');
      const name = `part-profile-${phase}.png`;
      await fsp.writeFile(path.join(owned, name), png, { flag: 'wx' });
      const metadata = { name, phase, sketchId, bytes: png.length, sha256: digest(png), width: size.width, height: size.height,
        viewportBounds: after.viewportBounds, windowWidth: after.windowWidth, windowHeight: after.windowHeight,
        presentation: true, stayHidden: true, evidenceLimits: 'Presented PNG for visual review; no pixel or CAD geometry oracle.' };
      captures.push(metadata);
      return metadata;
    } finally {
      capturing = false;
    }
  };
};
