'use strict';
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Fixed original material loci, actual standard-view commands and CDP input.
// Current native poses locate existing material, never supply expected solve
// outputs, renderer references, camera state, witnesses or native capabilities.
module.exports = function profileCenterInput({ evaluate, observe, pointer, referenceRoleKeyboard, click, waitFor, check, canonical, assemblyNavigation, evidence }) {
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + encodeJavaScriptString(JSON.stringify(v)) + ')').join(',') + ')');
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
  const picker = (slot, kind) => 'button[aria-label="Seleccionar ' + (kind === 'face' ? 'cara' : 'arista material') + ' del perfil ' + slot + ' en el modelo"]';
  const target = (slot, kind) => 'select[aria-label="' + (kind === 'face' ? 'Cara' : 'Arista material') + ' del perfil ' + slot + '"]';
  const fields = () => page(() => ['Cara del perfil 1', 'Arista material del perfil 1', 'Cara del perfil 2', 'Arista material del perfil 2'].map(label => document.querySelector('select[aria-label="' + label + '"]')?.value ?? null));
  const snapshot = async () => ({ fields: await fields(), serial: (await observe()).serial, recovery: await page(() => localStorage.getItem('solidflow.autosave')) });
  async function unchanged(before, label) {
    check(canonical(before.fields) === canonical(await fields()) && before.serial === (await observe()).serial
      && before.recovery === await page(() => localStorage.getItem('solidflow.autosave')), label + ' preserves fields, worker and recovery');
    evidence.pointerNegatives.push({ label, ...before });
  }
  async function arm(slot, kind) {
    await click(picker(slot, kind)); await waitFor('armed profile ' + slot + '/' + kind, () => page((selector, mode) => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === mode, picker(slot, kind), kind === 'face' ? 'face' : 'edge'));
  }
  function placed(pose, p) {
    const [x, y, z, w] = pose.rotation, t = [2 * (y * p[2] - z * p[1]), 2 * (z * p[0] - x * p[2]), 2 * (x * p[1] - y * p[0])];
    return [p[0] + w * t[0] + y * t[2] - z * t[1], p[1] + w * t[1] + z * t[0] - x * t[2], p[2] + w * t[2] + x * t[1] - y * t[0]].map((v, i) => v + pose.translation[i]);
  }
  async function projection(scene, id, local, view) {
    const bodies = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id])); check(bodies.length === 1, 'Exact original visible material owner');
    const world = placed(bodies[0].worldPose, local), selector = 'select[aria-label="Orientación de vista"]'; await assemblyNavigation.reveal(selector);
    await page((selector, view) => { const e = document.querySelector(selector);
      if (!e || e.disabled || ![...e.options].some(o => o.value === view && !o.disabled)) throw Error('Public standard view command unavailable');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, view); e.dispatchEvent(new Event('change', { bubbles: true })); }, selector, view);
    await frames(); const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const b = scene.visibleBounds, center = b.min.map((v, i) => (v + b.max[i]) / 2), span = Math.max(1, Math.hypot(...b.max.map((v, i) => v - b.min[i]))), pixels = rect.height / (1.3 * span), r = world.map((v, i) => v - center[i]);
    // Front/back look along +/-Z, with world Y up; ISO is the existing Y-up basis.
    const point = { x: rect.x + rect.width / 2 + (view === 'iso' ? (r[0] - r[2]) / Math.sqrt(2) : view === 'back' ? -r[0] : r[0]) * pixels,
      y: rect.y + rect.height / 2 - (view === 'iso' ? (-r[0] + 2 * r[1] - r[2]) / Math.sqrt(6) : r[1]) * pixels };
    check(point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height, 'Literal material point inside current canvas');
    return { point, id, local, world, view, center, span, pixelsPerMm: pixels, rect };
  }
  async function hit(point) { await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point); await frames(); }
  const idOf = native => native.selection.component.occurrencePath[0];
  async function choose(scene, slot, kind, native, key, bottom = false) {
    const projected = await projection(scene, idOf(native), kind === 'face' ? [0, 0, 3] : [0, -2, bottom ? 0 : 3], bottom ? 'back' : 'front');
    await arm(slot, kind); const before = await snapshot(); await hit(projected.point); const observed = await fields();
    evidence.pointerHits.push({ slot, kind, expectedKey: key, actualKey: observed[(slot - 1) * 2 + (kind === 'face' ? 0 : 1)], ...projected });
    await waitFor('actual profile full identity ' + slot + '/' + kind, () => page((selector, key) => document.querySelector(selector)?.value === key, target(slot, kind), key));
    check((await observe()).serial === before.serial && await page(() => localStorage.getItem('solidflow.autosave')) === before.recovery, 'Material hit grants no native/history authority');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false', picker(slot, kind)), 'Successful profile material hit disarms current role');
    if (kind === 'face') check(observed[(slot - 1) * 2 + 1] === '' || observed[(slot - 1) * 2 + 1] === null, 'Choosing face clears prior material edge');
  }
  async function negative(scene) {
    const projected = await projection(scene, 'circle-fixed', [Math.SQRT2, Math.SQRT2, 1.5], 'iso'); await arm(1, 'face'); const before = await snapshot(); await hit(projected.point);
    await unchanged(before, 'curved face rejection'); check(await page(() => document.querySelector('.assembly-status.error')?.textContent.includes('Selecciona una cara plana actual')), 'Incompatible profile face guidance');
    await click('button[aria-label="Cancelar selección de centro de perfiles"]'); await unchanged(before, 'profile selection Cancel');
  }
  async function wrongOwner(scene, native) {
    const p = await projection(scene, idOf(native), [0, -2, 3], 'front'); await arm(2, 'line-edge'); const before = await snapshot(); await hit(p.point);
    await unchanged(before, 'foreign component LINE rejection'); check(await page(() => document.querySelector('.assembly-status.error')?.textContent.includes('mismo componente, cuerpo y productor')), 'Wrong-owner LINE guidance');
    await click('button[aria-label="Cancelar selección de centro de perfiles"]');
  }
  async function ownership(name) {
    await assemblyNavigation.panel('components');
    await page(name => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(e => e.querySelector('span')?.firstChild?.textContent === name);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact original free-circle component row'); rows[0].click(); }, name);
    await assemblyNavigation.panel('relations'); await arm(1, 'face'); const before = await snapshot();
    await click('button[aria-label="Arrastrar giro"]');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false'
      && document.querySelector('button[aria-label="Arrastrar giro"]')?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', picker(1, 'face')), 'Manipulator takes ownership from profile selection');
    await click('button[aria-label="Desactivar manipulador"]'); await unchanged(before, 'profile drag/stop ownership');
    await arm(1, 'face'); await click('button[aria-label="Editar centro de perfiles Circle original"]');
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false', picker(1, 'face')), 'Opening saved profile editor disarms previous role');
    const text = 'Cancelar edición de centro de perfiles'; await assemblyNavigation.button(text);
    await page(text => { const rows = [...document.querySelectorAll('.assembly-profile-center-panel button')].filter(e => e.textContent.trim() === text);
      if (rows.length !== 1 || rows[0].disabled) throw Error('Exact profile edit Cancel'); rows[0].click(); }, text);
    check(await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'false'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === '', picker(1, 'face')), 'Closing saved profile editor does not revive prior intent');
    await unchanged(before, 'profile saved editor ownership');
  }
  async function heldOwnership(scene) {
    const projected=await projection(scene,'circle-fixed',[0,0,3],'front');await arm(1,'face');let before=await snapshot(),failure;
    await pointer('mouseMoved',projected.point);await pointer('mousePressed',projected.point,1);
    try{evidence.keyboardTransitions??=[];evidence.keyboardTransitions.push({kind:'held profile face switch',...await referenceRoleKeyboard('profile-2')})}catch(error){failure=error}finally{try{await pointer('mouseReleased',projected.point)}catch(error){failure=failure?new AggregateError([failure,error],'Held reference release failed',{cause:failure}):error}}if(failure)throw failure;
    await frames();await unchanged(before,'Held face cannot nominate under later profile slot');
    before=await snapshot();await pointer('mouseMoved',projected.point);await pointer('mousePressed',projected.point,1);failure=null;
    try{evidence.keyboardTransitions.push({kind:'held profile Cancel',...await referenceRoleKeyboard('profile-2')});evidence.keyboardTransitions.push({kind:'held profile rearm',...await referenceRoleKeyboard('profile-2')})}catch(error){failure=error}finally{try{await pointer('mouseReleased',projected.point)}catch(error){failure=failure?new AggregateError([failure,error],'Held reference release failed',{cause:failure}):error}}if(failure)throw failure;
    await frames();await unchanged(before,'Held profile face cannot survive Cancel/rearm ABA');await click('button[aria-label="Cancelar selección de centro de perfiles"]');
  }
  return { choose, negative, wrongOwner, ownership, heldOwnership };
};
