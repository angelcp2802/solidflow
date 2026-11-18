'use strict';
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Fixed material witnesses on the original prisms; actual standard-view controls
// and CDP input. Current native placements locate the existing material only.
// No renderer references, camera state, worker replies or capabilities are set.
module.exports = function linePathInput({ evaluate, observe, pointer, referenceRoleKeyboard, click, waitFor, check, canonical, assemblyNavigation, evidence }) {
  const labels = { point: 'Punto del trayecto LINE', edge: 'Arista del trayecto LINE', origin: 'Origen del trayecto LINE', up: 'Guía UP del trayecto LINE' };
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(v)) + ')').join(',') + ')');
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const picker = role => 'button[aria-label="Seleccionar ' + labels[role] + ' en el modelo"]';
  const target = role => 'select[aria-label="' + labels[role] + '"]';
  const fields = () => page(labels => Object.fromEntries(Object.entries(labels).map(([role, label]) => [role, document.querySelector('select[aria-label="' + label + '"]')?.value ?? null])), labels);
  const snapshot = async () => ({ fields: await fields(), serial: (await observe()).serial, recovery: await page(() => localStorage.getItem('solidflow.autosave')) });
  async function unchanged(before, label) {
    check(canonical(before.fields) === canonical(await fields()) && before.serial === (await observe()).serial
      && before.recovery === await page(() => localStorage.getItem('solidflow.autosave')), label + ' preserves declarations, native work and recovery');
    evidence.pointerNegatives.push({ label, ...before });
  }
  async function arm(role) {
    await click(picker(role)); const mode = role === 'point' || role === 'origin' ? 'vertex' : role === 'edge' ? 'edge' : 'face';
    await waitFor('armed LINE role ' + role, () => page((selector, mode) => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === mode, picker(role), mode));
  }
  async function disarmed(role) { check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false'
    && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', picker(role)), 'Changed intent does not revive LINE role ' + role); }
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
  function faceView(face) {
    const n = face.worldSupport?.kind === 'plane' ? face.worldSupport.normal : null; check(n?.length === 3 && n.every(Number.isFinite), 'Current UP face normal for a public camera view only');
    const axis = [0, 1, 2].sort((a, b) => Math.abs(n[b]) - Math.abs(n[a]))[0];
    return axis === 0 ? n[0] >= 0 ? 'right' : 'left' : axis === 1 ? n[1] >= 0 ? 'top' : 'bottom' : n[2] >= 0 ? 'front' : 'back';
  }
  async function choose(scene, role, native, key, local, view) {
    const projected = await projection(scene, native.selection.component.occurrencePath[0], local, view ?? (role === 'up' ? faceView(native) : role === 'edge' || role === 'origin' ? 'left' : 'back'));
    await arm(role); const before = await snapshot(); await hit(projected.point); const actual = await fields();
    evidence.pointerHits.push({ role, beforeKey: before.fields[role], statusAfterHit: await page(() => document.querySelector('.assembly-status')?.textContent), expectedKey: key, actualKey: actual[role], ...projected });
    await waitFor('actual full LINE identity ' + role, () => page((selector, key) => document.querySelector(selector)?.value === key, target(role), key));
    check(await page(message => document.querySelector('.assembly-status')?.textContent.includes(message), labels[role] + (role === 'edge' || role === 'up' ? ' seleccionada.' : ' seleccionado.')), 'Current role explicitly acknowledges the actual material hit');
    for (const other of Object.keys(labels)) if (other !== role && !(role === 'edge' && other === 'origin')) check(actual[other] === before.fields[other], 'Pick preserves other LINE role ' + other);
    if (role === 'edge') check(actual.origin === '', 'Selecting LINE clears old material origin');
    check((await observe()).serial === before.serial && await page(() => localStorage.getItem('solidflow.autosave')) === before.recovery, 'Nomination grants no native/history authority'); await disarmed(role);
  }
  async function negative(scene) {
    const p = await projection(scene, 'up-fixed', [2, 0, 2], 'right'); await arm('point'); const before = await snapshot(); await hit(p.point);
    await unchanged(before, 'face interior is not a material vertex'); check(await page(() => document.querySelector('.assembly-status.error')?.textContent.includes('Selecciona un vértice material actual')), 'Point-role guidance');
    await click('button[aria-label="Cancelar selección de trayecto LINE"]'); await unchanged(before, 'LINE reference Cancel');
  }
  async function foreignOrigin(scene) {
    const p = await projection(scene, 'point-free', [-2, 3, 0], 'back'); await arm('origin'); const before = await snapshot(); await hit(p.point);
    await unchanged(before, 'origin rejects another material owner'); check(await page(() => document.querySelector('.assembly-status.error')?.textContent.includes('mismo componente, cuerpo y productor')), 'Origin namespace guidance');
    await click('button[aria-label="Cancelar selección de trayecto LINE"]');
  }
  async function ownership(name) {
    await assemblyNavigation.panel('components');
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(e => e.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact original free point component'); rows[0].click(); }, name);
    await assemblyNavigation.panel('relations'); await arm('edge'); const before = await snapshot(); await click('button[aria-label="Arrastrar giro"]');
    await disarmed('edge'); check(await page(() => document.querySelector('button[aria-label="Arrastrar giro"]')?.getAttribute('aria-pressed') === 'true'), 'Manipulator takes LINE selection ownership');
    await click('button[aria-label="Desactivar manipulador"]'); await disarmed('edge'); await unchanged(before, 'LINE drag/stop ownership');
    await arm('edge'); await click('button[aria-label="Editar trayecto LINE LINE original"]'); await disarmed('edge');
    const text = 'Cancelar edición de trayecto LINE'; await assemblyNavigation.button(text);
    await page(text => { const rows = [...document.querySelectorAll('.assembly-line-path-panel button')].filter(e => e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact LINE editor Cancel'); rows[0].click(); }, text);
    await disarmed('edge'); await unchanged(before, 'LINE saved editor ownership');
  }
  async function heldOwnership(scene) {
    const projected=await projection(scene,'path-fixed',[-2,-3,4],'left');await arm('point');let before=await snapshot(),failure;
    await pointer('mouseMoved',projected.point);await pointer('mousePressed',projected.point,1);
    try{evidence.keyboardTransitions??=[];evidence.keyboardTransitions.push({kind:'held vertex role switch',...await referenceRoleKeyboard('line-origin')})}catch(error){failure=error}finally{try{await pointer('mouseReleased',projected.point)}catch(error){failure=failure?new AggregateError([failure,error],'Held reference release failed',{cause:failure}):error}}if(failure)throw failure;
    await frames();await unchanged(before,'Held vertex cannot nominate under later LINE origin role');
    before=await snapshot();await pointer('mouseMoved',projected.point);await pointer('mousePressed',projected.point,1);failure=null;
    try{evidence.keyboardTransitions.push({kind:'held vertex Cancel',...await referenceRoleKeyboard('line-origin')});evidence.keyboardTransitions.push({kind:'held vertex rearm',...await referenceRoleKeyboard('line-origin')})}catch(error){failure=error}finally{try{await pointer('mouseReleased',projected.point)}catch(error){failure=failure?new AggregateError([failure,error],'Held reference release failed',{cause:failure}):error}}if(failure)throw failure;
    await frames();await unchanged(before,'Held LINE vertex cannot survive Cancel/rearm ABA');await click('button[aria-label="Cancelar selección de trayecto LINE"]');await disarmed('origin');
  }
  return { choose, arm, disarmed, negative, foreignOrigin, ownership, heldOwnership };
};
