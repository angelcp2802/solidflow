'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function faceLimitsWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, wheel, menuKey, capture, check, canonical, digest,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, dialogCounts, initialReadyMs } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const D1 = 'input[aria-label="Profundidad"]', TWO = 'input[aria-label="Dirección 2"]';
  const D2 = 'input[aria-label="Profundidad de dirección 2"]', END = 'select[aria-label="Condición final"]';
  const END2 = 'select[aria-label="Condición final de dirección 2"]';
  const TARGET = 'select[aria-label="Superficie de destino"]', TARGET2 = 'select[aria-label="Superficie de destino de dirección 2"]';
  const NAME = 'input[aria-label="Nombre de operación"]', PLANE = 'input[aria-label="Distancia del plano"]';
  const PICK = '.property-manager button.outline-button';
  const records = [], inputs = [], faces = [], guards = [];
  const evidence = { partFaceLimits: { records, inputs, faces, guards,
    provenance: 'The unchanged original independent-end-limit fixture: Cartesian stepped base, separate 12x8 read-only limit blocks and two rectangles, in millimetres. No imported model or saved topology is supplied.',
    scope: 'Real D1/D2 viewport face clicks, exact original face/body owners, held-gesture wheel/leave/Escape rejection, Cancel/retry, Apply, history, source-plane motion, two writes and fresh reopening.',
    inputLimits: 'Actual CDP pointer press/release, wheel and Escape. Visible parameter fields use native setters and bubbling events. View changes use existing presets and Fit controls. Read-only hover references locate displayed original faces; no camera, handler, React state, document or worker response is injected.',
    limits: 'Original parallel planar targets only. Native body volumes use1e-5mm3 and bounds1e-6mm. Analytical areas are expectations, not renderer BRep/area/STEP attestation. No curved-face, recipe, arbitrary-frame, physical keyboard, complete parity or installed-platform claim.' } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const last = row => row.features.at(-1);
  const originalCount = expected.features.length, originalCanonical = canonical(expected);
  const near = (actual, value, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - value) <= tolerance,
    `${label}: ${actual}, expected ${value}`);
  const base = { bodyId: 'limits-base-body', featureId: 'limits-upper', createdBy: 'limits-base', volume: 7056,
    min: [0, 0, -10], max: [20, 14, 20] };
  const top = { bodyId: 'limits-top-body', featureId: 'limits-top', createdBy: 'limits-top', volume: 288,
    min: [29, -1, 16], max: [41, 7, 19] };
  const bottom = { bodyId: 'limits-bottom-body', featureId: 'limits-bottom', createdBy: 'limits-bottom', volume: 576,
    min: [29, -1, -9], max: [41, 7, -3] };
  const originalOwners = [base, top, bottom];
  // 10*6*(19-(-9))=1680; surface=2*60+2*(10+6)*28=1016.
  const outerBoss = { volume: 1680, min: [30, 0, -9], max: [40, 6, 19] };
  // Editing only the second target to z-3 gives height22, V1320/A824.
  const editedBoss = { volume: 1320, min: [30, 0, -3], max: [40, 6, 19] };
  const faceEnd = ref => ({ kind: 'upToSurface', target: { kind: 'face', face: ref } });
  const planeEnd = name => ({ kind: 'upToSurface', target: { kind: 'plane', planeId: 'limits-' + name + '-plane' } });
  const owner = (operation, dimensions) => ({ bodyId: operation.bodyOperation.bodyId, featureId: operation.id, createdBy: operation.id, ...dimensions });
  let topFace, bottomFace, innerBottomFace, plainOperation, cutOperation;
  const plainOwners = (row, dimensions = outerBoss) => [...originalOwners, owner(last(row), dimensions)];
  // Cut footprint [10,14]x[4,7]:12*(8-(-9))+6*(19-8)=270 removed.
  const allOwners = (dimensions = outerBoss) => [{ ...base, featureId: cutOperation.id, volume: 6786 }, top, bottom, owner(plainOperation, dimensions)];
  const draft = (row, type = 'extrude', first = faceEnd(topFace), opposite = faceEnd(bottomFace)) => {
    const operation = last(row);
    return operation?.type === type && operation.sketchId === (type === 'cut' ? 'limits-cut-profile' : 'limits-plain-profile')
      && operation.depth === 13 && !operation.symmetric && !operation.thinWall
      && canonical(operation.endCondition) === canonical(first)
      && canonical(operation.secondDirection) === canonical({ enabled: true, depth: 7, endCondition: opposite })
      && (type === 'cut' ? canonical(operation.bodyScope) === canonical([{ bodyId: base.bodyId, sourceFeatureId: base.featureId }])
        : operation.bodyOperation?.mode === 'new');
  };
  async function visible(selector, label = null) {
    await page((selector, label) => {
      const caption = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim();
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || caption(e) === label);
      if (matches.length === 1) matches[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, label);
    return page((selector, label) => {
      const caption = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim();
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || caption(e) === label);
      if (matches.length !== 1) return { available: false, count: matches.length };
      const element = matches[0], r = element.getBoundingClientRect(), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      return { available: !element.disabled && !element.closest('[hidden]') && r.width > 0 && r.height > 0
        && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && (hit === element || element.contains(hit)),
        point, value: element.value, checked: element.checked, text: caption(element) };
    }, selector, label);
  }
  async function press(selector, label = null) {
    let previous, stationary = 0;
    const state = await waitFor('stationary face-limit control ' + (label ?? selector), async () => {
      const current = await visible(selector, label), signature = canonical(current);
      if (signature !== previous) { previous = signature; stationary = Date.now(); }
      return current.available && Date.now() - stationary >= 100 ? current : false;
    });
    await pointer('mouseMoved', state.point);
    check(canonical(await visible(selector, label)) === canonical(state), 'Face-limit control remains enabled, hit-tested and stationary');
    await pointer('mousePressed', state.point, 1); await pointer('mouseReleased', state.point, 0);
    inputs.push({ selector, ...(label ? { label } : {}), point: state.point, input: 'actual left press/release' });
  }
  async function change(selector, value, retain = true) {
    await waitFor('visible face-limit parameter ' + selector, async () => (await visible(selector)).available);
    await page((selector, value) => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (fields.length !== 1 || !field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight || !hit || !(field === hit || field.contains(hit))) throw Error('One visible enabled hit-tested face-limit parameter required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('One current enabled face-limit option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    inputs.push({ selector, value: String(value), input: 'visible native field setter and bubbling event' });
    if (retain) await waitFor('retained face-limit parameter ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)));
    await frames();
  }
  const idle = () => waitFor('closed idle face-limit editor', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  const ready = () => waitFor('native acceptable face-limit preview', () => page(selector => { const button = document.querySelector(selector); return !!button && !button.disabled; }, APPLY));
  function material(row, expectedOwners, phase, sourceOffset = 5) {
    check(row.response.ok, row.response.error || 'Native face-limit build succeeds');
    const result = row.response.value, actualOwners = typeof expectedOwners === 'function' ? expectedOwners(row) : expectedOwners;
    check(!result.featureErrors.length && result.bodyCatalogActive && result.bodies?.length === actualOwners.length,
      'Face-limit build retains exact successful inventory: ' + JSON.stringify({ phase, featureErrors: result.featureErrors, bodies: result.bodies }));
    check(canonical(result.warnings) === canonical([`La pieza contiene ${actualOwners.length} sólidos separados.`]), 'Exact independent-solid warning');
    const prefix = expected.features.map(item => item.id === 'limits-source-plane' ? { ...item, offset: sourceOffset } : item)
      .slice(0, Math.min(originalCount, row.features.length));
    check(canonical(row.features.slice(0, originalCount)) === canonical(prefix), 'Original declarations remain exact except the explicitly edited source distance');
    check(canonical(expected) === originalCanonical, 'The original fixture object remains unchanged');
    for (const expectedOwner of actualOwners) {
      const body = result.bodies.find(body => body.ref.bodyId === expectedOwner.bodyId);
      check(body?.ref.sourceFeatureId === expectedOwner.featureId && body.createdByFeatureId === expectedOwner.createdBy,
        'Exact current and creation owner identities for ' + expectedOwner.bodyId);
      near(body.volume, expectedOwner.volume, 1e-5, 'Independent face-limit owner volume');
      for (let axis = 0; axis < 3; axis++) {
        near(body.bounds.min[axis], expectedOwner.min[axis], 1e-6, 'Independent face-limit minimum');
        near(body.bounds.max[axis], expectedOwner.max[axis], 1e-6, 'Independent face-limit maximum');
      }
    }
    records.push({ phase, serial: row.serial, features: row.features,
      bodies: result.bodies.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, bounds: body.bounds })), warnings: result.warnings });
    return row;
  }
  async function built(after, predicate, expectedOwners, phase, sourceOffset = 5) {
    const row = await waitFor('native face-limit build ' + phase, async () => {
      const observation = await observe(); check(!observation.workerErrors.length, 'No face-limit worker transport failure');
      return observation.builds.filter(row => row.serial > after && row.features[0]?.id === 'limits-base-profile' && predicate(row) && row.response).at(-1);
    });
    return material(row, expectedOwners, phase, sourceOffset);
  }
  async function apply(row, expectedOwners, phase, committedFeatures = row.features, sourceOffset = 5) {
    await ready(); const serial = (await observe()).serial; await press(APPLY);
    const accepted = await built(serial, current => canonical(current.features) === canonical(committedFeatures), expectedOwners, phase, sourceOffset);
    await idle(); return accepted;
  }
  async function fileCommand(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function edit(id, field) {
    await idle(); await press('.tree-row[data-feature-id="' + id + '"]'); await press('.selection-tools button[title="Editar operación"]');
    await waitFor('saved editable face-limit parameter', async () => (await visible(field)).available);
  }
  async function begin(sketchId = 'limits-plain-profile', cut = false) {
    await idle(); await press('.tree-row[data-feature-id="' + sketchId + '"]'); await press('.ribbon-tabs button', 'Operaciones');
    await press('button.command[title="' + (cut ? 'Corte extruido' : 'Saliente/Base extruido') + '"]');
    await waitFor('current optional second direction', () => page((selector, cut) => {
      const field = document.querySelector(selector);
      return !!field && !field.checked && (cut || !field.disabled);
    }, TWO, cut));
    if (cut) await selectOnlyBase();
    else await change('select[aria-label="Resultado del saliente"]', 'new');
    await change(D1, 13); await change(NAME, cut ? 'Corte entre caras independientes' : 'Saliente entre caras independientes');
    await change(END, 'upToSurface'); await change(TARGET, 'plane:limits-top-plane');
    await press(TWO); await change(D2, 7); await change(END2, 'upToSurface'); await change(TARGET2, 'plane:limits-bottom-plane');
    await ready();
  }
  async function selectOnlyBase() {
    await waitFor('exact face-limit cut target list', () => page(() => document.querySelectorAll('.body-operation-panel .body-list label.body-row').length > 0));
    const rows = await page(() => [...document.querySelectorAll('.body-operation-panel .body-list label.body-row')].map((row, index) => ({
      index, name: row.querySelector('span')?.firstChild?.textContent.trim(), checked: row.querySelector('input').checked })));
    check(rows.filter(row => row.name === 'Original stepped base').length === 1, 'One exact original stepped cut target exists');
    for (const row of rows) if (row.checked !== (row.name === 'Original stepped base')) await press('.body-operation-panel .body-list label.body-row:nth-of-type(' + (row.index + 1) + ') input');
    check(await page(() => {
      const checked = [...document.querySelectorAll('.body-operation-panel .body-list label.body-row')].filter(row => row.querySelector('input').checked);
      return checked.length === 1 && checked[0].querySelector('span')?.firstChild?.textContent.trim() === 'Original stepped base';
    }), 'Only the stepped material owner is selected; read-only limits and boss are excluded');
    const label = 'Seleccionar cuerpos en el visor';
    const active = await page(label => [...document.querySelectorAll('.body-operation-panel button.outline-button')]
      .find(button => button.textContent.trim() === label)?.classList.contains('active'), label);
    if (active) await press('.body-operation-panel button.outline-button', label);
  }
  function originalFace(row, limit, z, normal) {
    const body = row.response.value.bodies.find(body => body.ref.bodyId === limit.bodyId);
    const matches = (body?.faces ?? []).filter(face => face.ref.sourceFeatureId === limit.featureId && face.frame
      && Math.abs(face.frame.origin[2] - z) < 1e-6 && Math.abs(face.frame.normal[2] - normal) < 1e-8);
    check(matches.length === 1, 'One original literal planar cap for ' + limit.bodyId + ' at z' + z);
    const face = matches[0];
    check(typeof face.ref.key === 'string' && /^face-v[12]\|/.test(face.ref.key), 'Original cap has an exact saved face reference');
    near(face.frame.normal[0], 0, 1e-8, 'Original cap normal X'); near(face.frame.normal[1], 0, 1e-8, 'Original cap normal Y');
    faces.push({ body: { bodyId: limit.bodyId, sourceFeatureId: limit.featureId }, createdByFeatureId: limit.createdBy,
      ref: face.ref, frame: face.frame, expectedZ: z, expectedNormalZ: normal });
    return face.ref;
  }
  async function view(name) {
    await change('select[aria-label="Orientación de vista"]', name, false);
    await press('button[title="Ajustar a pantalla (F)"]'); await frames();
  }
  async function arm(side) {
    await press(PICK, side === 'first' ? 'Seleccionar cara de destino' : 'Seleccionar cara de destino de dirección 2');
    await waitFor('presented original prefix face selection for ' + side, () => page(() => document.querySelector('.viewport-canvas')?.dataset.partReferencePicking === 'true'));
  }
  async function findFace(ref, viewName, z) {
    const rect = await page(() => {
      const canvas = document.querySelector('.viewport-canvas canvas'), r = canvas?.getBoundingClientRect();
      if (!r || !r.width || !r.height) throw Error('One displayed original-face canvas required');
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // Input calibration after actual preset/Fit: original bbox[0,-1,-10]..[41,14,20].
    // World point[40.5,3,z] lies in the 1mm cap ring outside the boss footprint.
    // These pixels nominate an input only; exact native FaceRef and hover must agree.
    const aspect = rect.width / rect.height, extent = 41 * .82 / Math.min(aspect, 1), scale = rect.height / (2 * extent);
    const relative = [20, -3.5, z - 5];
    const screen = viewName === 'iso'
      ? [(relative[0] - relative[2]) / Math.SQRT2, (-relative[0] + 2 * relative[1] - relative[2]) / Math.sqrt(6)]
      : [relative[0] * (viewName === 'back' ? -1 : 1), relative[1]];
    const predicted = { x: rect.x + rect.width / 2 + screen[0] * scale, y: rect.y + rect.height / 2 - screen[1] * scale };
    const offsets = [0, -2, 2, -4, 4, -6, 6];
    let attempts = 0;
    for (const dy of offsets) for (const dx of offsets) {
      const point = { x: predicted.x + dx, y: predicted.y + dy };
      if (point.x <= rect.x || point.y <= rect.y || point.x >= rect.x + rect.width || point.y >= rect.y + rect.height) continue;
      await pointer('mouseMoved', point); await frames(); attempts++;
      const hover = await page(() => {
        const raw = document.querySelector('.viewport-canvas')?.dataset.partHoverFace;
        return raw ? JSON.parse(raw) : null;
      });
      if (canonical(hover) === canonical(ref)) {
        inputs.push({ input: 'actual pointer hover with exact original FaceRef readback', point, predicted, view: viewName,
          expectedWorldPoint: [40.5, 3, z], originalRef: ref, hover, attempts });
        return point;
      }
    }
    throw Error('Original face was not visibly hovered: ' + JSON.stringify({ ref, viewName, z, predicted, attempts }));
  }
  async function pick(side, ref, viewName, z, predicate, expectedOwners, phase) {
    await view(viewName); await arm(side); const point = await findFace(ref, viewName, z);
    const serial = (await observe()).serial;
    await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    inputs.push({ input: 'actual viewport left press/release', side, point, view: viewName, originalRef: ref });
    await waitFor('accepted original face closes its owned request', () => page(() => document.querySelector('.viewport-canvas')?.dataset.partReferencePicking === 'false'));
    return built(serial, predicate, expectedOwners, phase);
  }
  async function guardedRole(side, ref, viewName, z, initialRecovery) {
    await view(viewName); await arm(side);
    for (const kind of ['wheel', 'leave']) {
      const point = await findFace(ref, viewName, z), before = await observe();
      const values = await page((first, second) => [document.querySelector(first)?.value, document.querySelector(second)?.value], TARGET, TARGET2);
      await pointer('mousePressed', point, 1);
      if (kind === 'wheel') await wheel(point, -120);
      else {
        const outside = await page(() => { const r = document.querySelector('.viewport-canvas').getBoundingClientRect(); return { x: Math.max(1, r.left - 4), y: r.top + r.height / 2 }; });
        await pointer('mouseMoved', outside, 1); await pointer('mouseMoved', point, 1);
      }
      await pointer('mouseReleased', point, 0); await frames();
      check(await page((first, second, values) => document.querySelector('.viewport-canvas')?.dataset.partReferencePicking === 'true'
        && document.querySelector(first)?.value === values[0] && document.querySelector(second)?.value === values[1], TARGET, TARGET2, values),
      'Held ' + side + ' ' + kind + ' gesture does not replace either target or end its request');
      check((await observe()).serial === before.serial && await recovery() === initialRecovery, 'Rejected face gesture performs no CAD work or committed write');
      guards.push({ side, kind, originalRef: ref, point, beforeSerial: before.serial, targetValues: values, rejected: true });
      // Actual Fit restores the wheel-altered view before the next independent attempt.
      await press('button[title="Ajustar a pantalla (F)"]'); await frames();
    }
    const point = await findFace(ref, viewName, z), serial = (await observe()).serial;
    await pointer('mousePressed', point, 1); await menuKey('Escape'); await pointer('mouseReleased', point, 0); await frames();
    await idle();
    check(await recovery() === initialRecovery, 'Held ' + side + ' Escape cancels the draft without committing either face target');
    check(await page(() => {
      const host = document.querySelector('.viewport-canvas');
      return host?.dataset.partReferencePicking === 'false' && host.dataset.partSelectedFace === '';
    }), 'Escape revokes the face request and the old release cannot select a browsing face');
    guards.push({ side, kind: 'Escape', originalRef: ref, point, beforeSerial: serial, rejected: true, result: 'draft Cancel; exact recovery retained' });
  }
  return async () => {
    const originalBytes = await fsp.readFile(input);
    await waitFor('initial original-face document commands', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, row => canonical(row.features) === canonical(expected.features), originalOwners, 'original-face-limit-fixture'); await idle();
    topFace = originalFace(original, top, 19, 1); bottomFace = originalFace(original, bottom, -9, -1);
    innerBottomFace = originalFace(original, bottom, -3, 1);
    check(canonical(topFace) !== canonical(bottomFace) && canonical(bottomFace) !== canonical(innerBottomFace), 'Three original caps have distinct exact references');
    const initialRecovery = await recovery();
    await begin(); await guardedRole('first', topFace, 'front', 19, initialRecovery);
    await begin();
    await pick('first', topFace, 'front', 19, row => draft(row, 'extrude', faceEnd(topFace), planeEnd('bottom')),
      row => plainOwners(row, editedBoss), 'first-face-before-second-held-guards');
    await guardedRole('second', bottomFace, 'back', -9, initialRecovery);
    await begin();
    await pick('first', topFace, 'front', 19, row => draft(row, 'extrude', faceEnd(topFace), planeEnd('bottom')),
      row => plainOwners(row, { volume: 1320, min: [30, 0, -3], max: [40, 6, 19] }), 'retry-first-original-face');
    let preview = await pick('second', bottomFace, 'back', -9, row => draft(row), plainOwners, 'retry-both-exterior-original-faces');
    plainOperation = last(preview);
    const accepted = await apply(preview, plainOwners, 'both-original-face-targets-applied');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(expected.features), originalOwners, 'undo-face-target-boss'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(accepted.features), plainOwners, 'redo-face-target-boss'); await idle();
    await begin('limits-cut-profile', true);
    await pick('first', topFace, 'front', 19, row => draft(row, 'cut', faceEnd(topFace), planeEnd('bottom')),
      row => [{ ...base, featureId: last(row).id, volume: 6858 }, top, bottom, owner(plainOperation, outerBoss)], 'cut-first-original-face');
    preview = await pick('second', bottomFace, 'back', -9, row => draft(row, 'cut'),
      row => [{ ...base, featureId: last(row).id, volume: 6786 }, top, bottom, owner(plainOperation, outerBoss)], 'cut-both-original-face-targets');
    cutOperation = last(preview);
    const complete = await apply(preview, allOwners(), 'cut-original-faces-applied');
    await fileCommand('Guardar como…');
    await waitFor('first face-target save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8'));
    check(canonical(saved.features) === canonical(complete.features), 'First write preserves both actual face targets on boss and cut');
    const savedRecovery = await recovery();
    await edit(plainOperation.id, TARGET2);
    await pick('second', innerBottomFace, 'iso', -3, row => draft(row, 'extrude', faceEnd(topFace), faceEnd(innerBottomFace)),
      row => plainOwners(row, editedBoss), 'saved-second-face-target-preview');
    check(await recovery() === savedRecovery, 'Saved face-target preview leaves committed recovery exact');
    await press(CANCEL); await idle();
    check(await recovery() === savedRecovery, 'Saved target Cancel restores both exact face references and downstream cut');
    await edit(plainOperation.id, TARGET2);
    preview = await pick('second', innerBottomFace, 'iso', -3, row => draft(row, 'extrude', faceEnd(topFace), faceEnd(innerBottomFace)),
      row => plainOwners(row, editedBoss), 'retry-saved-second-face-target');
    check(preview.features.length === originalCount + 1, 'Saved boss preview excludes its downstream cut');
    const editedFeatures = saved.features.map(item => item.id === plainOperation.id
      ? { ...item, secondDirection: { ...item.secondDirection, endCondition: faceEnd(innerBottomFace) } } : item);
    const edited = await apply(preview, allOwners(editedBoss), 'saved-second-face-target-applied', editedFeatures);
    check(canonical(edited.features.find(item => item.id === cutOperation.id)) === canonical(cutOperation), 'Boss endpoint edit retains both independent exterior cut targets');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(saved.features), allOwners(), 'undo-saved-second-face-target'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), allOwners(editedBoss), 'redo-saved-second-face-target'); await idle();
    const beforeSourceRecovery = await recovery();
    await edit('limits-source-plane', PLANE); serial = (await observe()).serial; await change(PLANE, 7);
    preview = await built(serial, row => last(row)?.id === 'limits-source-plane' && last(row).offset === 7,
      originalOwners, 'saved-source-plane-preview', 7);
    check(await recovery() === beforeSourceRecovery, 'Source motion preview retains committed face targets');
    const movedFeatures = edited.features.map(item => item.id === 'limits-source-plane' ? { ...item, offset: 7 } : item);
    const moved = await apply(preview, allOwners(editedBoss), 'source-motion-retains-both-world-face-ends', movedFeatures, 7);
    check(canonical(moved.features.find(item => item.id === plainOperation.id)) === canonical(edited.features.find(item => item.id === plainOperation.id))
      && canonical(moved.features.find(item => item.id === cutOperation.id)) === canonical(cutOperation), 'Source motion changes neither saved FaceRef nor nominal direction depths');
    serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => canonical(row.features) === canonical(edited.features), allOwners(editedBoss), 'undo-source-motion-with-face-ends'); await idle();
    serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    await built(serial, row => canonical(row.features) === canonical(moved.features), allOwners(editedBoss), 'redo-source-motion-with-face-ends', 7); await idle();
    await fileCommand('Guardar');
    await waitFor('second face-target save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const finalBytes = await fsp.readFile(output), finalSaved = JSON.parse(finalBytes.toString('utf8'));
    check(canonical(finalSaved.features) === canonical(moved.features), 'Second write retains original face targets and moved source');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    await built(serial, row => canonical(row.features) === canonical(finalSaved.features), allOwners(editedBoss), 'fresh-reopen-preserves-face-targets', 7); await idle();
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Original synthetic fixture file remains byte-identical');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1, 'Two bounded Open dialogs and one Save As dialog only');
    const observation = await observe();
    check(!observation.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No face-target worker, renderer, resource or unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production face-target worker and WASM actually loaded');
    evidence.partFaceLimits.persistence = { inputSha256: digest(originalBytes), initialSha256: digest(savedBytes), finalSha256: digest(finalBytes), dialogs: dialogCounts(),
      geometricLimits: 'Boss exterior facesz[-9,19]:V1680/analyticalA1016. Only second target edited to lower inward facez-3:V1320/analyticalA824. Separate stepped cutV6786=7056-(12*17+6*11). Source5->7 retains all anchored endpoints. Native rendererV1e-5mm3/bounds1e-6mm; no BRep/area/STEP/platform claim.' };
    evidence.savedSha256 = digest(finalBytes); await capture(finalSaved);
  };
};
