'use strict';
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Actual CDP input on the tracked original sector. Native poses locate material;
// all solve and STEP expectations remain literal independent formulas.
module.exports = function circularPathInput({ evaluate, observe, pointer, referenceRoleKeyboard, click, waitFor, check, canonical, assemblyNavigation, evidence }) {
  const labels = { point: 'Punto del trayecto circular', arc: 'Arco del trayecto circular', origin: 'Origen del trayecto circular', up: 'Guía UP del trayecto circular' };
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(v)) + ')').join(',') + ')');
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const picker = role => 'button[aria-label="Seleccionar ' + labels[role] + ' en el modelo"]';
  const target = role => 'select[aria-label="' + (role === 'arc' || role === 'origin' ? 'Arco y origen del trayecto circular' : labels[role]) + '"]';
  const fields = () => page(() => Object.fromEntries(['Punto del trayecto circular','Arco y origen del trayecto circular','Guía UP del trayecto circular'].map(label => [label, document.querySelector('select[aria-label="' + label + '"]')?.value ?? null])));
  const snapshot = async () => ({ fields: await fields(), serial: (await observe()).serial, recovery: await page(() => localStorage.getItem('solidflow.autosave')) });
  async function unchanged(before, label) {
    check(canonical(before.fields) === canonical(await fields()) && before.serial === (await observe()).serial && before.recovery === await page(() => localStorage.getItem('solidflow.autosave')), label + ' preserves fields, native work and recovery');
    evidence.pointerNegatives.push({ label, ...before });
  }
  async function arm(role) {
    await click(picker(role)); const mode = role === 'point' || role === 'origin' ? 'vertex' : role === 'arc' ? 'edge' : 'face';
    await waitFor('armed circular role ' + role, () => page((selector, mode) => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true' && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === mode, picker(role), mode));
  }
  async function disarmed(role) { check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false' && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', picker(role)), 'Circular role remains disarmed ' + role); }
  function placed(pose, p) {
    const [x, y, z, w] = pose.rotation, t = [2 * (y * p[2] - z * p[1]), 2 * (z * p[0] - x * p[2]), 2 * (x * p[1] - y * p[0])];
    return [p[0] + w * t[0] + y * t[2] - z * t[1], p[1] + w * t[1] + z * t[0] - x * t[2], p[2] + w * t[2] + x * t[1] - y * t[0]].map((v, i) => v + pose.translation[i]);
  }
  async function projection(scene, id, local, view) {
    const bodies = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id])); check(bodies.length === 1, 'Exact original material owner');
    const world = placed(bodies[0].worldPose, local), selector = 'select[aria-label="Orientación de vista"]'; await assemblyNavigation.reveal(selector);
    await page((selector, view) => { const e = document.querySelector(selector);
      if (!e || e.disabled || ![...e.options].some(o => o.value === view && !o.disabled)) throw Error('Enabled public standard view');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, view); e.dispatchEvent(new Event('change', { bubbles: true })); }, selector, view);
    await frames(); const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const b = scene.visibleBounds, center = b.min.map((v, i) => (v + b.max[i]) / 2), span = Math.max(1, Math.hypot(...b.max.map((v, i) => v - b.min[i]))), pixels = rect.height / (1.3 * span), r = world.map((v, i) => v - center[i]);
    // Literal standard-view screen bases, independent of renderer camera state.
    const horizontal = view === 'iso' ? (r[0] - r[2]) / Math.sqrt(2) : view === 'left' ? r[2] : view === 'right' ? -r[2] : view === 'back' ? -r[0] : r[0];
    const vertical = view === 'iso' ? (-r[0] + 2 * r[1] - r[2]) / Math.sqrt(6) : view === 'top' ? -r[2] : view === 'bottom' ? r[2] : r[1];
    const point = { x: rect.x + rect.width / 2 + horizontal * pixels, y: rect.y + rect.height / 2 - vertical * pixels };
    check(point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height, 'Material witness inside canvas');
    return { point, id, local, world, view, center, span, pixelsPerMm: pixels, rect };
  }
  async function hit(point) { await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point); await frames(); }
  async function choose(scene, role, native, key, local, view) {
    const projected = await projection(scene, native.selection.component.occurrencePath[0], local, view);
    await arm(role); const before = await snapshot(); await hit(projected.point);
    const actual = await fields(), observedKey = actual[role === 'point' ? labels.point : role === 'up' ? labels.up : 'Arco y origen del trayecto circular'];
    evidence.pointerHits.push({ role, expectedReference: native.selection, ...(native.circularPathOrigins ? { expectedEndpoints: native.circularPathOrigins } : {}), expectedKey: key, actualKey: observedKey, statusAfterHit: await page(() => document.querySelector('.assembly-status')?.textContent), ...projected });
    if (role === 'arc') {
      check(observedKey === '' && await page(() => !!document.querySelector('[aria-label="Arco material pendiente"]')), 'Arc nomination leaves the complete path empty and requires explicit origin');
      check(await page(() => [...document.querySelectorAll('.assembly-circular-path-panel button')].find(e => e.textContent.trim() === 'Vista previa de trayecto circular')?.disabled === true), 'Pending arc cannot preview');
    } else await waitFor('actual full circular identity ' + role, () => page((selector, key) => document.querySelector(selector)?.value === key, target(role), key));
    check((await observe()).serial === before.serial && await page(() => localStorage.getItem('solidflow.autosave')) === before.recovery, 'Circular nomination grants no native/history authority');
    for (const label of Object.keys(actual)) if (label !== (role === 'point' ? labels.point : role === 'up' ? labels.up : 'Arco y origen del trayecto circular')) check(actual[label] === before.fields[label], 'Circular pick preserves other field ' + label);
    await disarmed(role);
  }
  async function reject(scene, role, id, local, view, label, message) {
    const projected = await projection(scene, id, local, view); await arm(role); const before = await snapshot(); await hit(projected.point);
    await unchanged(before, label); check(await page(message => document.querySelector('.assembly-status.error')?.textContent.includes(message), message), label + ' provides guidance');
    await click('button[aria-label="Cancelar selección de trayecto circular"]'); await unchanged(before, label + ' reference Cancel'); await disarmed(role);
  }
  async function ownership(name) {
    await assemblyNavigation.panel('components');
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(e => e.querySelector('span')?.firstChild?.textContent === name); if (rows.length !== 1 || rows[0].disabled) throw Error('Exact original free sector'); rows[0].click(); }, name);
    await assemblyNavigation.panel('relations'); await arm('arc'); const before = await snapshot(); await click('button[aria-label="Arrastrar giro"]'); await disarmed('arc');
    check(await page(() => document.querySelector('button[aria-label="Arrastrar giro"]')?.getAttribute('aria-pressed') === 'true'), 'Manipulator takes circular pick ownership'); await click('button[aria-label="Desactivar manipulador"]'); await disarmed('arc'); await unchanged(before, 'Circular drag/stop ownership');
    await arm('arc'); await click('button[aria-label="Editar trayecto circular Circular original"]'); await disarmed('arc');
    const text = 'Cancelar edición de trayecto circular'; await assemblyNavigation.button(text); await page(text => { const rows = [...document.querySelectorAll('.assembly-circular-path-panel button')].filter(e => e.textContent.trim() === text); if (rows.length !== 1 || rows[0].disabled) throw Error('Current circular editor Cancel'); rows[0].click(); }, text);
    await disarmed('arc'); await unchanged(before, 'Circular saved editor ownership');
  }
  async function heldOwnership(scene) {
    const p = await projection(scene, 'a', [5,-2,4], 'front');await arm('point');let before=await snapshot();
    await pointer('mouseMoved',p.point);await pointer('mousePressed',p.point,1);let failure;
    try { evidence.keyboardTransitions.push({kind:'held role switch',...await referenceRoleKeyboard('origin')}); }
    catch(error){failure=error}finally{try{await pointer('mouseReleased',p.point)}catch(error){failure=failure?new AggregateError([failure,error],'Held reference release failed',{cause:failure}):error}}if(failure)throw failure;
    await frames();await unchanged(before,'Held point press cannot nominate under the later origin role');
    check(await page(selector=>document.querySelector(selector)?.getAttribute('aria-pressed')==='true',picker('origin')),'Origin remains explicitly armed after unrelated press release');
    before=await snapshot();await pointer('mouseMoved',p.point);await pointer('mousePressed',p.point,1);failure=null;
    try { evidence.keyboardTransitions.push({kind:'held Cancel',...await referenceRoleKeyboard('origin')});evidence.keyboardTransitions.push({kind:'held rearm',...await referenceRoleKeyboard('origin')}); }
    catch(error){failure=error}finally{try{await pointer('mouseReleased',p.point)}catch(error){failure=failure?new AggregateError([failure,error],'Held reference release failed',{cause:failure}):error}}if(failure)throw failure;
    await frames();await unchanged(before,'Held origin press cannot survive Cancel/rearm ABA');await click('button[aria-label="Cancelar selección de trayecto circular"]');await disarmed('origin');
  }
  return { choose, reject, arm, disarmed, ownership, heldOwnership };
};
