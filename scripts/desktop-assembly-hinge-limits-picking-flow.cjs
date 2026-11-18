'use strict';
const fs = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
// Actual CDP geometry input only: no React callbacks, CAD responses, document
// stores or capabilities are replaced. Original literal camera/solid oracles.
module.exports = function hingeLimitsPickingWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, evaluate, observe, waitFor, click, capture, pointer, checks, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts, consoleErrors, failedRequests, protocolResponses } = context;
  const roles = ['Eje A de bisagra', 'Eje B de bisagra', 'Plano axial A de bisagra', 'Plano axial B de bisagra', 'Plano angular A de bisagra', 'Plano angular B de bisagra'],
    APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]', SUMMARY = '[aria-label="Bisagra verificada"]';
  const evidence = { scenario: 'original-limited-hinge-actual-pointer', pointerHits: [], pointerAttempts: [], negatives: [], phases: [] }; checks.push(evidence);
  let name = 'Bisagra limitada por puntero';
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); if (json === undefined) throw Error('Expected JSON data'); return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (a, b, band, label) => check(Number.isFinite(a) && Math.abs(a - b) <= band, label + ': ' + a + ' expected ' + b);
  const vector = (a, b, band, label) => { check(Array.isArray(a) && a.length === b.length, label + ' shape'); a.forEach((value, i) => near(value, b[i], band, label + '[' + i + ']')); };
  const dot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
  const sub = (a, b) => a.map((v, i) => v - b[i]), cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  function rotate(q, p) { near(Math.hypot(...q), 1, 1e-10, 'Proper quaternion'); const n = Math.hypot(...q), v = q.slice(0, 3).map(x => x / n), w = q[3] / n,
    t = cross(v, p).map(x => 2 * x), c = cross(v, t); return p.map((x, i) => x + w * t[i] + c[i]); }
  const placed = (pose, point) => rotate(pose.rotation, point).map((v, i) => v + pose.translation[i]);
  async function button(text, parent = '.assembly-app') { await assemblyNavigation.button(text, parent); await page((text, parent) => { const list = [...document.querySelectorAll(parent + ' button')].filter(e => e.textContent.trim() === text);
    if (list.length !== 1 || list[0].disabled) throw Error('Exact enabled button ' + text); list[0].click(); }, text, parent); }
  async function control(selector, value) { await assemblyNavigation.reveal(selector); await page((selector, value) => { const e = document.querySelector(selector); if (!e || e.disabled) throw Error('Editable control ' + selector);
    const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    if (e instanceof HTMLSelectElement && ![...e.options].some(o => o.value === value && !o.disabled)) throw Error('Actual option ' + value);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value); await waitFor('rendered ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value)); }
  async function frames(count = 2) { await page(count => new Promise((resolve, reject) => { let frame, remaining = count;
    const timer = setTimeout(() => { cancelAnimationFrame(frame); reject(Error('Viewport frames exceeded the existing35second step budget')); }, 35000);
    const next = () => { if (--remaining <= 0) { clearTimeout(timer); resolve(); } else frame = requestAnimationFrame(next); }; frame = requestAnimationFrame(next);
  }), count); }
  async function response(serial, action) { return waitFor('actual ' + action, async () => { const state = await observe(); check(!state.workerErrors.length, 'No worker runtime errors');
    const list = state.assemblies.filter(e => e.serial > serial && e.action === action && e.response); check(list.length <= 1, 'One actual ' + action);
    if (!list.length) return false; check(list[0].response.ok, list[0].response.error || 'Worker rejection'); return list[0]; }); }
  async function recovery(document, label) { await waitFor(label + ' committed recovery', async () => { const raw = await page(() => localStorage.getItem('solidflow.autosave'));
    return raw && canonical(JSON.parse(raw)) === canonical(document) && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'); }); }
  function body(scene, id) { const list = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical([id])); check(list.length === 1, 'Exact native owner ' + id); return list[0]; }
  function vertex(scene, id, point) { const list = body(scene, id).vertexPoints.filter(v => v.point.every((x, i) => Math.abs(x - point[i]) < 1e-8)); check(list.length === 1, 'Unique native material vertex'); return list[0].worldPoint; }
  function geometry(scene, document) {
    check(scene.solidCount === 2 && scene.bodies.length === 2 && scene.prototypeCount === 1 && !scene.warnings.length, 'Two original native solids and one prototype');
    near(scene.volume, 384 - 8 * Math.PI, 1e-5, 'Literal total volume'); near(scene.area, 448 + 12 * Math.PI, 1e-5, 'Literal total area');
    check(canonical(document.definitions) === canonical(expected.definitions), 'Original full source cache unchanged');
    check(canonical(document.occurrences[0]) === canonical(expected.occurrences[0]), 'Fixed ground unchanged');
    for (const o of document.occurrences) {
      const b = body(scene, o.id), corners = [-2, 10].flatMap(x => [-2, 2].flatMap(y => [0, 4].map(z => placed(o.pose, [x, y, z]))));
      near(b.volume, 192 - 4 * Math.PI, 1e-5, 'Each leaf V'); near(b.area, 224 + 6 * Math.PI, 1e-5, 'Each leaf A');
      check(b.solidCount === 1 && b.body.bodyId === 'original-hinge-body' && b.body.sourceFeatureId === 'hole', 'Current original cut body');
      vector(b.bounds.min, [0, 1, 2].map(i => Math.min(...corners.map(p => p[i]))), 1e-6, 'Independent transformed rectangular minimum');
      vector(b.bounds.max, [0, 1, 2].map(i => Math.max(...corners.map(p => p[i]))), 1e-6, 'Independent transformed rectangular maximum');
      vector(vertex(scene, o.id, [10, 2, 4]), placed(o.pose, [10, 2, 4]), 1e-6, 'Independent native corner placement');
    }
    if (document.mates.some(m => m.type === 'hinge' && !m.suppressed)) {
      const P = vertex(scene, 'moving', [10, 2, 4]), Q = vertex(scene, 'moving', [10, 2, 0]); vector(P.map((v, i) => (v - Q[i]) / 4), [0, 0, 1], 1e-8, 'Actual material axial alignment');
      const pose = document.occurrences.find(o => o.id === 'moving').pose; vector(placed(pose, [0, 0, 0]), [0, 0, 4], 1e-6, 'Literal coaxial axial seating');
    }
  }
  function originalReferences(scene) {
    const face = (id, predicate, support) => { const list = body(scene, id).faces.filter(predicate); check(list.length === 1, 'Unique actual original face ' + id + '/' + support); return { kind: 'face', ...list[0].selection, support }; };
    const axis = id => face(id, f => f.support?.kind === 'cylinder' && Math.abs(f.support.radius - 1) < 1e-8 && Math.hypot(f.support.point[0], f.support.point[1]) < 1e-8, 'axis');
    const cap = (id, z) => face(id, f => f.support?.kind === 'plane' && Math.abs(f.support.point[2] - z) < 1e-8 && Math.abs(f.support.normal[2]) > .99999, 'plane');
    const lines = body(scene, 'ground').edges.filter(e => e.support?.kind === 'line' && Math.abs(e.support.axis[2]) > .99999 && Math.abs(e.support.point[0] - 10) < 1e-8 && Math.abs(e.support.point[1] + 2) < 1e-8);
    check(lines.length === 1, 'Exact visible original corner LINE');
    return { references: [axis('ground'), axis('moving'), cap('ground', 4), cap('moving', 0),
      face('ground', f => f.support?.kind === 'plane' && Math.abs(f.support.point[0]-10)<1e-8 && f.support.normal[0]>.99999, 'plane'),
      face('moving', f => f.support?.kind === 'plane' && Math.abs(f.support.point[0]-10)<1e-8 && f.support.normal[0]>.99999, 'plane')], line: { kind: 'edge', ...lines[0].selection, support: 'line' } };
  }
  const fields = () => page(roles => roles.map(role => document.querySelector('select[aria-label="' + role + '"]')?.value), roles);
  const picker = (slot, edge = false) => 'button[aria-label="' + (edge ? 'Seleccionar arista para ' + roles[slot] : 'Seleccionar ' + roles[slot] + ' en el modelo') + '"]';
  async function arm(slot, edge = false) { const selector = picker(slot, edge); if (!await page(selector => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true', selector)) await click(selector);
    await waitFor('actual armed role', () => page((selector, mode) => document.querySelector(selector)?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === mode, selector, edge ? 'edge' : 'face'));
    check(await page(() => document.querySelector('button[aria-label="Arrastrar posición"]')?.getAttribute('aria-pressed') === 'false' && document.querySelector('button[aria-label="Arrastrar giro"]')?.getAttribute('aria-pressed') === 'false'), 'Reference picking disables component drag'); }
  async function projection(scene, world, view = 'iso') {
    if (view === 'iso') await button('Isométrica', '.assembly-view-tools');
    else {
      check(view === 'bottom', 'Only the literal lower standard view supplements isometric picking');
      const selector = 'select[aria-label="Orientación de vista"]'; await assemblyNavigation.reveal(selector);
      await page(selector => { const e = document.querySelector(selector);
        if (!e || e.disabled || ![...e.options].some(o => o.value === 'bottom' && !o.disabled)) throw Error('Enabled lower standard view command');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, 'bottom'); e.dispatchEvent(new Event('change', { bubbles: true }));
      }, selector);
    }
    await frames();
    const rect = await page(() => { const r = document.querySelector('[aria-label="Visor 3D del ensamblaje"] canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const bounds = scene.visibleBounds, center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2), span = Math.max(1, Math.hypot(...bounds.max.map((v, i) => v - bounds.min[i]))), pixels = rect.height / (1.3 * span), r = sub(world, center);
    // Independent image bases: ISO looks from (1,1,1) with world Y up, so
    // right=(X-Z)/sqrt(2), up=(-X+2Y-Z)/sqrt(6). Inferior looks from -Y,
    // with right=X/up=Z. Neither basis is read from or injected into the camera.
    const point = { x: rect.x + rect.width / 2 + (view === 'bottom' ? r[0] : (r[0] - r[2]) / Math.sqrt(2)) * pixels,
      y: rect.y + rect.height / 2 - (view === 'bottom' ? r[2] : (-r[0] + 2 * r[1] - r[2]) / Math.sqrt(6)) * pixels };
    check(point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height, 'Literal projected material point inside current canvas');
    return { view, point, worldPoint: world, rect, sceneCenter: center, sceneSpan: span, pixelsPerMm: pixels };
  }
  async function hit(point) { await pointer('mouseMoved', point); await pointer('mousePressed', point, 1); await pointer('mouseReleased', point); }
  async function pick(base, slot, reference, world, { edge = false, reselect = false, view = 'iso' } = {}) {
    const projected = await projection(base.scene, world, view); await arm(slot, edge);
    const beforeFields = await fields(), serial = (await observe()).serial, stored = await page(() => localStorage.getItem('solidflow.autosave'));
    if (reselect) check(beforeFields[slot] === '', 'Current edit role is empty before actual pointer reselect');
    const keys = await page((role, reference) => { const stable = v => JSON.stringify(v, (_k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
      return [...document.querySelector('select[aria-label="' + role + '"]').options].filter(o => { try { return !o.disabled && stable(JSON.parse(o.value)) === stable(reference); } catch { return false; } }).map(o => o.value); }, roles[slot], reference);
    check(keys.length === 1, 'Actual full reference option for pointer hit'); await hit(projected.point);
    const observedFields = await fields(); evidence.pointerAttempts.push({ slot, role: roles[slot], edge, reselect, expected: keys[0], actual: observedFields[slot], ...projected });
    await waitFor('CDP selected ' + roles[slot], () => page((role, key) => document.querySelector('select[aria-label="' + role + '"]')?.value === key, roles[slot], keys[0]));
    const after = await fields(); beforeFields.forEach((value, i) => { if (i !== slot) check(after[i] === value, 'Pointer preserves every other role'); }); if (reselect) check(after[slot] === keys[0] && after[slot] !== beforeFields[slot], 'Current edit reselect restores exact full identity from an empty role');
    check((await observe()).serial === serial && await page(() => localStorage.getItem('solidflow.autosave')) === stored, 'Pointer selection does not perform CAD/history work');
    evidence.pointerHits.push({ slot, role: roles[slot], edge, reselect, reference, ...projected });
  }
  async function selectMoving() { (await assemblyNavigation.panel('components'), await page(() => { const list = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(e => e.querySelector('span')?.firstChild?.textContent === 'moving'); if (list.length !== 1 || list[0].disabled) throw Error('Exact moving tree row'); list[0].click(); }));
    await waitFor('moving selected', () => page(() => document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'moving')); }
  async function noIntentChange(label, beforeFields, serial, stored) { await frames(); check(canonical(await fields()) === canonical(beforeFields), label + ' preserves every current field');
    check((await observe()).serial === serial && await page(() => localStorage.getItem('solidflow.autosave')) === stored, label + ' no native/history mutation'); evidence.negatives.push({ label, fields: beforeFields }); }
  async function preview(text) { const before = await observe(); await button(text); return response(before.serial, 'preview-assembly'); }
  function ready(event, refs, label, anchored = false) {
    const v = event.response.value; evidence.lastReadyObservation = { label, status: v.status, hasToken: v.hasToken, checks: v.checks, message: v.message, motion: v.motion };
    check(v.status === 'ready' && v.hasToken && v.checks.length === 1 && v.checks.every(c => c.satisfied), label + ' current native ready capability');
    check(v.document.mates.length === 1 && v.document.mates[0].type === 'hinge' && v.document.mates[0].name === name, label + ' saved family/name');
    const m = v.document.mates[0]; check(canonical([...m.axis, ...m.axial, ...m.stops.angular]) === canonical(refs) && m.alignment === 'aligned' && !m.suppressed, label + ' all six exact pointer-derived roles');
    check(v.checks[0].constraintId === JSON.stringify([[], m.id]) && v.checks[0].lengthTolerance === 1e-6 && v.checks[0].angleTolerance === 1e-8, label + ' exact scoped final constraint check and unchanged requested bands');
    check(v.hinges?.length === 1, label + ' one final native support report'); const r = v.hinges[0];
    check(r.kind === 'hinge' && r.status === 'ok' && r.satisfied && r.supportOnly && r.qualifiedRotation && r.mateId === m.id
      && canonical(r.scopePath) === canonical([]) && canonical(r.componentPaths) === canonical({ axis: [['ground'], ['moving']], axial: [['ground'], ['moving']] }), label + ' current report purpose/scope/roles');
    check(r.angleToleranceRad === 1e-8 && r.lengthToleranceMm === 1e-6 && r.axisAngleRad + r.precision.directionRad <= r.angleToleranceRad && Math.max(r.transverseResidualMm, Math.abs(r.axialOffsetMm)) + r.precision.positionMm <= r.lengthToleranceMm, 'Native residuals plus uncertainty stay in unchanged bands');
    if (!anchored) { const root = v.scopes.find(s => s.definition.id === expected.id); check(root?.result.rank === 5 && root?.result.localDOF === 1, 'Actual local rank5/DOF1, not prescribed spin'); }
    check(m.stops.coordinate === 'directed-about-axis' && canonical(m.stops.arc) === canonical({start:330,sweep:60}), label + ' exact explicit saved arc');
    verifyStops(r,v.document,v.scene);
    geometry(v.scene, v.document); evidence.phases.push({ label, serial: event.serial, hinges: v.hinges, volume: v.scene.volume, area: v.scene.area }); return v;
  }
  function verifyStops(report,doc,scene){
    const stops=report.stops,arc={start:330,sweep:60};
    check(stops?.coordinate==='directed-about-axis'&&canonical(stops.arcDegrees)===canonical(arc)&&stops.fullCircle===false,'Fresh native explicit stop coordinate and arc');
    check(canonical(stops.componentPaths)===canonical([['ground'],['moving']]),'Current angular report owner paths');
    const values=[stops.angleRadians,stops.projectionLengths?.first,stops.projectionLengths?.second,stops.marginsRadians?.minimum,stops.marginsRadians?.maximum,stops.directionErrorRad];
    check(values.every(Number.isFinite)&&stops.directionErrorRad>=0&&stops.directionErrorRad<=1e-8&&stops.projectionLengths.first>0&&stops.projectionLengths.second>0,'Strict finite native stop measurement');
    const a=doc.occurrences.find(o=>o.id==='ground').pose,b=doc.occurrences.find(o=>o.id==='moving').pose;
    const savedAxis=doc.mates[0].axis[0];
    const matches=body(scene,'ground').faces.filter(face=>canonical({kind:'face',...face.selection,support:'axis'})===canonical(savedAxis));
    check(matches.length===1&&matches[0].support?.kind==='cylinder','Exact current selected ground cylinder axis for signed angular oracle');
    const localGuide=matches[0].support.axis;
    check(localGuide.length===3&&localGuide.every(Number.isFinite)&&Math.abs(Math.hypot(...localGuide)-1)<=1e-12,'Finite unit signed native local guide');
    near(localGuide[0],0,1e-12,'Selected guide local X');near(localGuide[1],0,1e-12,'Selected guide local Y');near(Math.abs(localGuide[2]),1,1e-12,'Selected guide is signed local Z');
    evidence.signedGuideObservations??=[];evidence.signedGuideObservations.push({documentSha256:digest(canonical(doc)),axis:savedAxis,localGuide:[...localGuide]});
    const guide=rotate(a.rotation,localGuide),first=rotate(a.rotation,[1,0,0]),second=rotate(b.rotation,[1,0,0]);
    const project=n=>n.map((x,i)=>x-guide[i]*dot(guide,n)),u=project(first),v=project(second),lu=Math.hypot(...u),lv=Math.hypot(...v);
    check(lu>0&&lv>0,'Independent projected material normals observable');
    const U=u.map(x=>x/lu),V=v.map(x=>x/lv),phase=Math.atan2(dot(guide,cross(U,V)),dot(U,V));
    const half=Math.PI/6,center=2*Math.PI,alpha=Math.atan2(Math.sin(phase-center),Math.cos(phase-center));
    near(stops.projectionLengths.first,lu,1e-8,'Independent first projection length');near(stops.projectionLengths.second,lv,1e-8,'Independent second projection length');
    near(Math.atan2(Math.sin(stops.angleRadians-phase),Math.cos(stops.angleRadians-phase)),0,1e-8,'Independent directed phase from original material normals');
    near(stops.marginsRadians.minimum,alpha+half,1e-8,'Independent lower interval margin');near(stops.marginsRadians.maximum,half-alpha,1e-8,'Independent upper interval margin');
    check(stops.marginsRadians.minimum-stops.directionErrorRad>=-1e-8&&stops.marginsRadians.maximum-stops.directionErrorRad>=-1e-8,'Both native margins retain unchanged angular band');
    check(['interior','minimum','maximum','both'].includes(stops.activity),'Explicit finite stop activity');
  }
  async function enableLimits() {
    if(!await page(()=>document.querySelector('input[aria-label="Limitar giro de bisagra"]')?.checked)) await click('input[aria-label="Limitar giro de bisagra"]');
    await waitFor('Six current hinge roles',()=>page(()=>!!document.querySelector('select[aria-label="Plano angular B de bisagra"]')));
    await control('input[aria-label="Inicio angular de bisagra en grados"]','330');
    await control('input[aria-label="Recorrido angular de bisagra en grados"]','60');
  }
  async function apply(event, label) { const before = await observe(); await click(APPLY); const e = await response(before.serial, 'apply-assembly'), v = e.response.value;
    check(e.hasToken && canonical({ ...v.document, updatedAt: event.response.value.document.updatedAt }) === canonical(event.response.value.document), 'Actual capability Apply retains exact candidate except history timestamp');
    geometry(v.scene, v.document); await recovery(v.document, label); return { document: v.document, scene: v.scene }; }
  async function cancel(base) { const before = await observe(); await click(CANCEL); const e = await response(before.serial, 'discard-assembly'); check(e.hasToken, 'Actual discarded native capability'); await recovery(base.document, 'Cancel');
    check(await page((apply, summary) => document.querySelector(apply)?.disabled === true && !document.querySelector(summary), APPLY, SUMMARY), 'Cancel revokes report/Apply'); }
  async function history(action, document) { const before = await observe(); await click('button[aria-label="' + action + ' ensamblaje"]'); const e = await response(before.serial, 'build-assembly');
    check(canonical(e.document) === canonical(document), 'Exact historical graph'); geometry(e.response.value, document); await recovery(document, action); return { document, scene: e.response.value }; }
  return async () => {
    const inputBytes = await fs.readFile(input); evidence.fixtureSha256 = digest(inputBytes); check(expected.id === 'original-hinge-picking' && !expected.mates.length, 'Original separated pointer fixture');
    await waitFor('initial renderer readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial discard', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]'); let event = await response(before.serial, 'build-assembly'), base = { document: event.document, scene: event.response.value };
    check(canonical(base.document) === canonical(expected), 'Exact actual Open'); geometry(base.scene, base.document); await recovery(base.document, 'Open');
    await control('select[aria-label="Tipo de relación"]', 'hinge'); await control('input[aria-label="Nombre de bisagra"]', name); await control('select[aria-label="Alineación de ejes de bisagra"]', 'aligned'); await enableLimits();
    // Same cylindrical faces, through their upper openings in the new ISO.
    // At local z=4 each ray has radius 1-1/sqrt(2)<1; Rx(-90deg) makes
    // the moving ray's local direction (1,-1,1), hence its opposite Y sign.
    const refs = originalReferences(base.scene), groundWall = [-Math.SQRT1_2, -Math.SQRT1_2, 3.5], movingWallLocal = [-Math.SQRT1_2, Math.SQRT1_2, 3.5],
      movingWall = placed(expected.occurrences[1].pose, movingWallLocal), movingCap = placed(expected.occurrences[1].pose, [5, 0, 0]);
    let projected = await projection(base.scene, [5, 0, 4]); await arm(0); let beforeFields = await fields(), serial = (await observe()).serial, stored = await page(() => localStorage.getItem('solidflow.autosave'));
    await hit(projected.point); await noIntentChange('actual planar face rejected for cylindrical-axis role', beforeFields, serial, stored);
    projected = await projection(base.scene, groundWall); await arm(0); beforeFields = await fields(); serial = (await observe()).serial; stored = await page(() => localStorage.getItem('solidflow.autosave'));
    await pointer('mouseMoved', projected.point); await pointer('mousePressed', projected.point, 1); await click(picker(0));
    await waitFor('picking explicitly canceled before release', () => page(() => document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-reference-picking') === ''));
    await pointer('mouseReleased', projected.point); await noIntentChange('canceled armed gesture late release', beforeFields, serial, stored);
    await selectMoving(); projected = await projection(base.scene, movingWall); before = await observe();
    (await assemblyNavigation.panel('properties'), await page(() => { const list = [...document.querySelectorAll('label.assembly-check')].filter(e => e.textContent.trim() === 'Visible'); if (list.length !== 1) throw Error('Unique Visible checkbox'); const input = list[0].querySelector('input'); if (!input.checked || input.disabled) throw Error('Visible original moving leaf'); input.click(); }));
    event = await response(before.serial, 'build-assembly'); const hidden = event.document; check(body(event.response.value, 'moving').visible === false, 'Actual source visibility hides the moving native body'); await recovery(hidden, 'Hide moving'); await frames();
    await arm(1); beforeFields = await fields(); serial = (await observe()).serial; stored = await page(() => localStorage.getItem('solidflow.autosave')); await hit(projected.point);
    await noIntentChange('hidden source at retained material pixel', beforeFields, serial, stored); await click(picker(1)); base = await history('Deshacer', expected);
    await control('input[aria-label="Nombre de bisagra"]', name); await control('select[aria-label="Alineación de ejes de bisagra"]', 'aligned'); await enableLimits();
    await pick(base, 0, refs.line, [10, -2, 2], { edge: true });
    await pick(base, 0, refs.references[0], groundWall);
    await pick(base, 1, refs.references[1], movingWall);
    await pick(base, 2, refs.references[2], [5, 0, 4]);
    // The same moving z=0 cap faces global -Y; Inferior exposes its interior
    // point at global x=25, clear of the ground leaf's x<=10 extent.
    await pick(base, 3, refs.references[3], movingCap, { view: 'bottom' });
    projected = await projection(base.scene, groundWall); await arm(4);
    beforeFields = await fields(); serial = (await observe()).serial; stored = await page(() => localStorage.getItem('solidflow.autosave'));
    check(beforeFields[4] === '', 'Angular material-plane role is empty before wrong-purpose cylinder input');
    await hit(projected.point);
    await noIntentChange('cylindrical face rejected for angular material-plane role', beforeFields, serial, stored);
    await pick(base, 4, refs.references[4], [10,0,2]);
    await pick(base, 5, refs.references[5], placed(expected.occurrences[1].pose,[10,0,2]));
    event = await preview('Añadir bisagra'); ready(event, refs.references, 'Six actual face picks Cancel'); await cancel(base);
    event = await preview('Añadir bisagra'); ready(event, refs.references, 'Six actual face picks retry'); base = await apply(event, 'Pointer author Apply'); const authored = base.document;
    await history('Deshacer', expected); base = await history('Rehacer', authored);
    await click('button[aria-label="Editar bisagra ' + name + '"]');
    const editFields = await fields(), editSerial = (await observe()).serial;
    await control('select[aria-label="Plano angular B de bisagra"]', ''); const clearedFields = await fields();
    check(clearedFields[5] === '' && editFields.every((value, slot) => slot === 5 || clearedFields[slot] === value), 'Clearing edit angular B preserves the other five full roles');
    check(await page(() => { const list = [...document.querySelectorAll('.assembly-hinge-panel button')].filter(e => e.textContent.trim() === 'Verificar edición de bisagra'); return list.length === 1 && list[0].disabled; }), 'Incomplete edit cannot submit');
    check((await observe()).serial === editSerial, 'Clearing a draft edit performs no native request'); await recovery(base.document, 'Incomplete edit preserves committed recovery');
    await pick(base, 5, refs.references[5], placed(base.document.occurrences.find(o=>o.id==='moving').pose,[10,0,2]), { reselect: true });
    name = 'Bisagra limitada reseleccionada'; await control('input[aria-label="Nombre de bisagra"]', name); event = await preview('Verificar edición de bisagra'); ready(event, refs.references, 'Current material edit reselect Cancel'); await cancel(base);
    event = await preview('Verificar edición de bisagra'); ready(event, refs.references, 'Edit retry'); base = await apply(event, 'Pointer edit Apply'); const edited = base.document;
    await history('Deshacer', authored); base = await history('Rehacer', edited);
    const selectedGuide=body(base.scene,'ground').faces.filter(f=>canonical({kind:'face',...f.selection,support:'axis'})===canonical(refs.references[0]));
    check(selectedGuide.length===1,'Exact current signed guide before drag');
    base = await require('./desktop-assembly-hinge-limits-drag.cjs')({...context,base,intent:{references:refs.references,guideSign:selectedGuide[0].support.axis[2]},callbacks:{
      ready:(event,label,options)=>ready(event,refs.references,label,true),
      apply:(event,label)=>apply(event,label), cancel:(current,label)=>cancel(current),
      history:(action,wanted,label)=>history(action,wanted),geometry:(scene,doc,label)=>geometry(scene,doc)
    }});
    const accepted = base.document;
    await button('Guardar como', ':is(.assembly-toolbar, .assembly-quickbar)'); await waitFor('actual original Save As', async () => { if (dialogCounts().saves !== 1 || !ipc.some(v => v.channel === 'document:save' && v.completed)) return false;
      try { return canonical(JSON.parse(await fs.readFile(output, 'utf8'))) === canonical(accepted); } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }); const savedBytes = await fs.readFile(output);
    before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)'); event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(accepted), 'Exact pointer-authored hinge reopening'); base = { document: event.document, scene: event.response.value }; geometry(base.scene, base.document); await recovery(base.document, 'Reopen');
    before = await observe(); await click('button[aria-label="Resolver ensamblaje"]'); event = await response(before.serial, 'preview-assembly'); ready(event, refs.references, 'Fresh reopened native limited hinge'); await cancel(base);
    await click('button[aria-label="Editar bisagra ' + name + '"]'); await page(() => document.querySelector('.assembly-hinge-panel')?.scrollIntoView({ block: 'center' })); if(process.env.SOLIDFLOW_UI_CAPTURE==='1') await capture(base.document); await button('Cancelar edición de bisagra'); await recovery(base.document, 'Final edit Cancel');
    check(evidence.pointerHits.length === 8 && evidence.pointerHits.filter(p => p.edge).length === 1 && evidence.pointerHits.filter(p => p.reselect).length === 1, 'Six author face picks, one staged LINE and one current angular edit reselect');
    check(evidence.negatives.length === 4 && dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Four bounded negative interactions and exact two Open/one Save As');
    check((await fs.readFile(input)).equals(inputBytes) && (await fs.readFile(output)).equals(savedBytes), 'Original and saved files stay byte-identical');
    check(ipc.every(v => v.completed) && !consoleErrors.length && !failedRequests.length && protocolResponses.every(v => v.status >= 200 && v.status < 400), 'No file/runtime/resource errors');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: accepted,
      limits: 'One original separated/tilted drilled-leaf pair, actual CDP six-face limited authoring, one staged LINE restored to a cylinder before authoring, one angular face edit reselect. Axis wrong-purpose and angular cylinder wrong-purpose, hidden material pixel and canceled armed gesture release are bounded actual interactions; no claim of a callback-before-render race or saved LINE authoring. Initial solved spin is observed, not prescribed; bounded actual drag is checked independently. No external app policy, arbitrary cameras/occlusion, human file dialogs or platform support claim.' });
  };
};
