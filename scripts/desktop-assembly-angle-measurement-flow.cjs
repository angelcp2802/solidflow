'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original drilled-prism fixture at Rx(30). Uses actual DOM controls and worker
// results; never supplies a CAD reply, model state, or React state to the app.
module.exports = function angleMeasurementWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, capture, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const labels = ['Primera dirección del ángulo', 'Segunda dirección del ángulo', 'Eje guía del ángulo'];
  const MEASURE = 'button[aria-label="Medir ángulo dirigido"]', RESULT = 'output[aria-label="Ángulo dirigido en grados"]';
  const phases = [], evidence = { scenario: 'original-circular-angle-measurement', phases }; checks.push(evidence);
  const near = (a, b, tolerance, label) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, label + ': ' + a + ' expected ' + b);
  const idle = () => waitFor('measurement workspace idle', () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  async function button(text, scope) {
    await page((text, scope) => { const buttons = [...document.querySelectorAll(scope + ' button')].filter(value => value.textContent.trim() === text);
      if (buttons.length !== 1 || buttons[0].disabled) throw Error('Exact enabled button absent: ' + text); buttons[0].click(); }, text, scope);
  }
  async function response(serial, action, ok = true) {
    return waitFor('actual ' + action, async () => {
      const state = await observe(), events = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response);
      check(!state.workerErrors.length && events.length <= 1, 'Unexpected worker error or duplicate operation.');
      if (!events.length) return false; check(events[0].response.ok === ok, events[0].response.error || 'Unexpected response status.'); return events[0];
    });
  }
  async function select(slot, ref) {
    const selector = 'select[aria-label="' + labels[slot] + '"]', values = await page(selector => [...document.querySelector(selector).options].map(value => value.value), selector);
    const matches = values.filter(value => value && canonical(JSON.parse(value)) === canonical(ref));
    check(matches.length === 1, 'Exact native/datum selection is missing.');
    await page((selector, value) => { const element = document.querySelector(selector); if (!element || element.disabled) throw Error('Selection is disabled.');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('change', { bubbles: true })); }, selector, matches[0]);
    await waitFor('selected current direction', () => page((selector, value) => document.querySelector(selector)?.value === value, selector, matches[0]));
    check(await page(selector => !document.querySelector(selector), RESULT), 'Changed selection retained an obsolete measurement.');
  }
  async function unchanged() {
    await idle();
    check(canonical(JSON.parse(await page(() => localStorage.getItem('solidflow.autosave')))) === canonical(expected), 'Read-only measurement changed the recovered document.');
    check(await page(() => document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true
      && document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true), 'Read-only measurement granted Apply or added history.');
  }
  async function measure(degrees, kinds) {
    const before = await observe(); await click(MEASURE); const event = await response(before.serial, 'measure-assembly-directed-angle'), value = event.response.value;
    check(value.coordinate === 'directed-about-axis' && value.supportOnly === true && !value.token && !value.document, 'Measurement carries unexpected state or authority.');
    near(value.angleDegrees, degrees, 1e-7, 'Independent Rx(30) angle');
    check(canonical([value.firstKind, value.secondKind, value.guideKind]) === canonical(kinds), 'Native support purposes changed.');
    near(value.angleToleranceRadians, 1e-8, 0, 'Fixed angular precision');
    await waitFor('rendered circular degrees', () => page((selector, degrees) => Math.abs(Number(document.querySelector(selector)?.textContent) - Number(degrees)) < 1e-7, RESULT, String(degrees)));
    await unchanged(); phases.push({ action: event.action, request: event.request, report: value });
  }
  return async () => {
    const originalBytes = await fsp.readFile(input);
    check(expected.id === 'assembly-direction-original' && expected.mates.length === 0, 'Expected original synthetic fixture.');
    await waitFor('actual initial desktop', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    let event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Open changed fixture.');
    const scene = event.response.value;
    near(scene.volume, 480 - 8 * Math.PI, 1e-5, 'Two drilled prism volumes'); near(scene.area, 496 + 12 * Math.PI, 1e-5, 'Two drilled prism areas');
    check(scene.solidCount === 2 && scene.prototypeCount === 1, 'Expected independent native solids.');
    function body(id) { const values = scene.bodies.filter(value => canonical(value.component.occurrencePath) === canonical([id])); check(values.length === 1, 'Exact body absent.'); return values[0]; }
    function face(id, kind) {
      const values = body(id).faces.filter(value => value.support?.kind === kind && (kind === 'plane'
        ? value.support.normal[2] > .999 && Math.abs(value.support.point[2] - 4) < 1e-8 : Math.abs(value.support.radius - 1) < 1e-8));
      check(values.length === 1, 'Exact original native face absent.'); return { kind: 'face', ...values[0].selection, support: kind === 'plane' ? 'plane' : 'axis' };
    }
    const first = face('ground', 'plane'), second = face('moving', 'plane'), guide = { kind: 'principal-plane', component: null, plane: 'YZ' };
    await idle(); await select(0, first); await select(1, second); await select(2, guide); await measure(30, ['plane', 'plane', 'plane']);
    await select(0, second); await select(1, first); await measure(330, ['plane', 'plane', 'plane']);
    const lines = body('moving').edges.filter(value => value.support?.kind === 'line' && value.support.axis[2] > .999
      && Math.abs(value.support.point[0] - 5) < 1e-8 && Math.abs(value.support.point[1] - 3) < 1e-8);
    check(lines.length === 1, 'Original vertical LINE absent.');
    await select(0, first); await select(1, { kind: 'edge', ...lines[0].selection, support: 'line' }); await measure(30, ['plane', 'line', 'plane']);
    await select(1, face('moving', 'cylinder')); await measure(210, ['plane', 'cylinder', 'plane']);
    // No azimuth exists when the first direction is the guide itself.
    await select(2, { kind: 'principal-plane', component: null, plane: 'XY' }); before = await observe(); await click(MEASURE);
    event = await response(before.serial, 'measure-assembly-directed-angle', false); check(/paralela|próxima/.test(event.response.error), 'Expected actual geometric degeneracy rejection.');
    await unchanged(); check(await page(selector => !document.querySelector(selector), RESULT), 'Failure retained old degrees.'); phases.push({ rejection: event.response.error });
    await select(2, guide); await measure(210, ['plane', 'cylinder', 'plane']);
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly');
    check(event.response.value.status === 'ready' && event.response.value.hasToken, 'Expected real pending preview.'); await idle();
    check(await page(selector => document.querySelector(selector)?.disabled === true, MEASURE), 'Measurement remained enabled during staged preview.');
    await click('button[aria-label="Cancelar vista previa del ensamblaje"]'); await unchanged();
    await button('Guardar como', '.assembly-toolbar');
    await waitFor('actual read-only file saved', async () => {
      if (dialogCounts().saves !== 1) return false;
      try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(expected); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    });
    await idle(); before = await observe(); await button('Abrir', '.assembly-toolbar'); event = await response(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(expected), 'Measurement changed saved/reopened data.'); await unchanged();
    check(await page(selector => !document.querySelector(selector), RESULT), 'Reopening retained obsolete measurement.');
    await select(0, first); await select(1, second); await select(2, guide); await measure(30, ['plane', 'plane', 'plane']);
    await capture(expected);
    const state = await observe(); check(!state.assemblies.some(value => value.action === 'apply-assembly'), 'Read-only workflow committed a candidate.');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && ipc.every(value => value.completed), 'Unexpected or incomplete file interaction.');
    check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request failure.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200)
      && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Production worker/WASM not loaded.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Original fixture bytes changed.');
    Object.assign(evidence, { savedSha256: digest(await fsp.readFile(output)),
      independentOracles: 'Original drilled prisms V480-8pi,A496+12pi at1e-5; moving Rx30. Top+Z to rotated+Z about+X=30deg; reversed330deg; canonicalLINE+Z=30deg; cylindricalaxis-Z=210deg,angles1e-7deg. Same recovery/history/saved document, no Apply.',
      limits: 'Scripted controls and real worker; native dialogs choose only test-owned paths. No human pointer, angular stops, automatic guide, winding, packages or platform-general support claim.' });
  };
};
