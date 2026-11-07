'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

module.exports = function externalAxisWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, pointer, wheel, menuKey, capture, check, canonical, digest,
    checks, protocolResponses, consoleErrors, failedRequests, ipc, dialogCounts, initialReadyMs } = context;
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const AXIS = 'select[aria-label="Eje de revolución"]', PICK = 'button[aria-label="Seleccionar eje en pantalla"]';
  const externalAxis = { kind: 'external-sketch-line', sketchId: 'external-axis', entityId: 'axis-line' };
  const records = [], inputs = [], scans = [];
  const evidence = { partExternalAxis: { records, inputs, scans,
    scope: 'Original world/local/external-axis controls, invalid noncoplanar axis, exact-prefix pointer selection, Escape/wheel guards, Cancel/retry, native material edge ownership, history and two saved fresh rebuilds.',
    inputLimits: 'Actual CDP left press/release and wheel/key input. Parameter controls use visible hit-tested native setters and bubbling events. DOM scrolling only reveals controls. Hover scans read displayed candidate keys; no camera, worker response, handler, geometric reference or application state is injected.',
    limits: 'One original XY part and an explicit axis prism. Curve rejection and additional plane/solver/ownership cases belong to native tests. These checks do not establish external application parity, general assembly behavior or installed/platform acceptance.' } };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate(`(${fn.toString()})(...JSON.parse(${quote(JSON.stringify(args))}))`);
  const frames = () => page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (a, b, tolerance, label) => check(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a}, expected ${b}`);
  async function press(selector, label) {
    await page((selector, label) => {
      const caption = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim();
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || caption(e) === label);
      if (matches.length === 1) matches[0].scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }, selector, label ?? null);
    const inspect = () => page((selector, label) => {
      const caption = e => (e.matches('[data-assembly-command]') ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim();
      const matches = [...document.querySelectorAll(selector)].filter(e => label === null || caption(e) === label);
      if (matches.length !== 1) return { available: false, count: matches.length };
      const target = matches[0], r = target.getBoundingClientRect(), point = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const hit = document.elementFromPoint(point.x, point.y);
      return { available: !target.disabled && !target.closest('[hidden]') && r.width > 0 && r.height > 0
        && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!hit && (target === hit || target.contains(hit)),
        point, text: caption(target), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
    }, selector, label ?? null);
    let previous, stableSince = 0;
    const target = await waitFor('stationary external-axis control ' + (label ?? selector), async () => {
      const state = await inspect(), key = canonical(state);
      if (key !== previous) { previous = key; stableSince = Date.now(); }
      return state.available && Date.now() - stableSince >= 100 ? state : false;
    });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect()) === canonical(target), 'Actual axis control remains visible and stationary');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    inputs.push({ selector, ...(label ? { label } : {}), point: target.point, input: 'actual left press/release' });
  }
  async function change(selector, value, retain = true) {
    await page(selector => document.querySelector(selector)?.scrollIntoView({ block: 'center', behavior: 'instant' }), selector);
    await page((selector, value) => {
      const fields = [...document.querySelectorAll(selector)], field = fields[0], r = field?.getBoundingClientRect();
      const hit = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (fields.length !== 1 || !field || field.disabled || field.closest('[hidden]') || !r || r.width <= 0 || r.height <= 0
        || r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight || !hit || !(field === hit || field.contains(hit))) throw Error('One visible hit-tested enabled axis parameter required');
      if (field instanceof HTMLSelectElement && ![...field.options].some(option => option.value === value && !option.disabled)) throw Error('One enabled current axis option required');
      const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    inputs.push({ selector, value: String(value), input: 'visible native field setter and bubbling event' });
    if (retain) await waitFor('axis parameter retained ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, String(value)));
    await frames();
  }
  const idle = () => waitFor('closed idle axis editor', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  const ready = () => waitFor('native acceptable axis preview', () => page(selector => { const b = document.querySelector(selector); return !!b && !b.disabled; }, APPLY));
  async function fileCommand(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function built(after, predicate, volume, bounds, phase) {
    const row = await waitFor('external-axis native build ' + phase, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'No axis worker transport failure');
      return state.builds.filter(row => row.serial > after && row.features[0]?.id === 'axis-sketch' && predicate(row) && row.response).at(-1);
    });
    check(row.response.ok, row.response.error || 'Native axis build succeeds');
    const result = row.response.value;
    const expectedWarnings = volume === null ? [] : ['La pieza contiene 2 sólidos separados.'];
    check(!result.featureErrors.length && canonical(result.warnings) === canonical(expectedWarnings) && result.bodyCatalogActive,
      'Actual axis features retain the exact independent-solid warning and explicit body catalog: '
      + JSON.stringify({ phase, featureErrors: result.featureErrors, warnings: result.warnings, bodyCatalogActive: result.bodyCatalogActive,
        features: row.features, bodies: result.bodies?.map(body => ({ ref: body.ref, volume: body.volume })) }));
    const axisBody = result.bodies?.find(body => body.ref.bodyId === 'axis-body');
    check(axisBody?.ref.sourceFeatureId === 'axis-block' && axisBody.createdByFeatureId === 'axis-block', 'Read-only axis body preserves exact producer and identity');
    near(axisBody.volume, 8, 1e-6, 'Independent original prism volume');
    for (let i = 0; i < 3; i++) {
      near(axisBody.bounds.min[i], [-3, -4, 0][i], 1e-6, 'Unchanged axis prism minimum');
      near(axisBody.bounds.max[i], [-2, 4, 1][i], 1e-6, 'Unchanged axis prism maximum');
    }
    const revolved = result.bodies.filter(body => body.ref.bodyId !== 'axis-body');
    check(revolved.length === (volume === null ? 0 : 1), 'Only the independently authored revolution body is added');
    if (volume !== null) {
      near(revolved[0].volume, volume, 1e-5, 'Independent annulus revolution volume');
      for (let i = 0; i < 3; i++) {
        near(revolved[0].bounds.min[i], bounds.min[i], 1e-6, 'Independent annulus minimum');
        near(revolved[0].bounds.max[i], bounds.max[i], 1e-6, 'Independent annulus maximum');
      }
    }
    records.push({ phase, serial: row.serial, features: row.features,
      bodies: result.bodies.map(body => ({ ref: body.ref, createdByFeatureId: body.createdByFeatureId, volume: body.volume, bounds: body.bounds })),
      independentRevolutionVolume: volume, warnings: result.warnings });
    return row;
  }
  const last = row => row.features.at(-1), defaultBounds = { min: [-9, -3, -9], max: [9, 3, 9] };
  const externalBounds = { min: [-5, -3, -7], max: [9, 3, 7] }, materialBounds = { min: [-13, -3, -11], max: [9, 3, 11] };
  const originalCount = expected.features.length;
  async function arm() {
    const serial = (await observe()).serial;
    await press(PICK);
    await waitFor('prefix axes are actually displayed', () => page(() => {
      const host = document.querySelector('.viewport-canvas');
      return host?.dataset.partAxisPicking === 'true' && JSON.parse(host.dataset.partAxisCandidates || '[]').length > 5;
    }));
    check((await observe()).serial === serial, 'Arming axis selection performs no CAD work');
    const candidates = await page(() => JSON.parse(document.querySelector('.viewport-canvas').dataset.partAxisCandidates));
    const materialDeclarations = candidates.map(value => JSON.parse(value.key)).filter(value => value[0] === 'linear-edge');
    check(materialDeclarations.length === 12 && materialDeclarations.every(value => value[1] === 'axis-body'
      && value[2] === 'axis-block' && value[3] === 'axis-block'), 'Only the twelve original prism edges are offered; the revolution preview cannot become its own axis');
  }
  async function findAxis(key) {
    const rect = await page(() => {
      const canvas = document.querySelector('.viewport-canvas canvas'), r = canvas?.getBoundingClientRect();
      if (!r || !r.width || !r.height) throw Error('One actual displayed axis canvas required');
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    let attempts = 0;
    for (const dy of [-24, 24, -38, 38]) for (let distance = 0; distance < rect.width / 2 - 10; distance += 4) {
      for (const sign of distance ? [1, -1] : [1]) {
        const point = { x: rect.x + rect.width / 2 + sign * distance, y: rect.y + rect.height / 2 + dy };
        await pointer('mouseMoved', point); await frames(); attempts++;
        const hovered = await page(coincident => {
          const host = document.querySelector('.viewport-canvas');
          return coincident ? JSON.parse(host?.dataset.partAxisHoverChoices || '[]') : host?.dataset.partAxisHover;
        }, Array.isArray(key));
        const matches = Array.isArray(key) ? key.every(required => hovered.includes(required)) : hovered === key;
        if (matches) { scans.push({ key, point, attempts, hovered, input: 'actual pointer hover and DOM candidate-key readback' }); return point; }
      }
    }
    throw Error('Actual displayed axis hover not found: ' + key + ' after ' + attempts + ' pointer samples');
  }
  async function candidateKey(axisTuple) {
    return waitFor('displayed declared axis candidate', () => page(tuple => {
      const entries = JSON.parse(document.querySelector('.viewport-canvas')?.dataset.partAxisCandidates || '[]');
      return entries.find(value => value.key === JSON.stringify(tuple))?.key || false;
    }, axisTuple));
  }
  async function pickExternal() {
    await arm();
    const key = await candidateKey(['external-sketch-line', 'external-axis', 'axis-line']), point = await findAxis(key);
    const serial = (await observe()).serial;
    await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    await waitFor('accepted pointer axis ends selection', () => page(() => document.querySelector('.viewport-canvas')?.dataset.partAxisPicking === 'false'));
    return built(serial, row => last(row).type === 'revolve' && canonical(last(row).axis) === canonical(externalAxis), 240 * Math.PI, externalBounds, 'actual-external-line-pointer');
  }
  async function coincidentWorldAxis(originalRecovery) {
    const menu = '[role="menu"][aria-label="Elegir eje coincidente"]';
    const open = async () => {
      await arm();
      const world = await candidateKey(['principal-axis', 'Y']), local = await candidateKey(['sketch-axis', 'y']);
      const point = await findAxis([world, local]);
      await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
      await waitFor('actual coincident world/local axis menu', () => page(selector => {
        const popup = document.querySelector(selector);
        const labels = [...(popup?.querySelectorAll('[role="menuitem"]') ?? [])].map(button => button.textContent.trim());
        return labels.includes('Eje Y del origen') && labels.includes('Eje Y del croquis');
      }, menu));
    };
    await press('button[title="Vista frontal (Ctrl+1)"]');
    let serial = (await observe()).serial;
    await open(); await menuKey('Escape'); await frames();
    check(await page((selector, axis) => !document.querySelector(selector)
      && document.querySelector('.viewport-canvas')?.dataset.partAxisPicking === 'false'
      && document.querySelector(axis)?.value === 'sketch-y', menu, AXIS), 'Escape closes the coincident menu and picker without replacing legacy local Y');
    check((await observe()).serial === serial && await recovery() === originalRecovery, 'Coincident menu opening and Escape preserve exact native/recovery state');
    await open(); serial = (await observe()).serial;
    // The control helper moves the actual pointer from canvas into this DOM menu,
    // verifies that it remains hit-tested, then performs a real press/release.
    await press(menu + ' [role="menuitem"]', 'Eje Y del origen');
    const row = await built(serial, row => last(row).axis?.kind === 'principal-axis' && last(row).axis.axis === 'Y',
      336 * Math.PI, defaultBounds, 'coincident-world-y-pointer-menu');
    check(await page(selector => !document.querySelector(selector) && document.querySelector('.viewport-canvas')?.dataset.partAxisPicking === 'false', menu),
      'Actual coincident-menu choice closes both menu and axis picker');
    check(await recovery() === originalRecovery, 'World/local disambiguation remains an uncommitted preview');
    return row;
  }
  async function begin() {
    await press('.tree-row[data-feature-id="external-profile"]');
    await press('.ribbon-tabs button', 'Operaciones');
    const serial = (await observe()).serial; await press('button.command[title="Revolución"]');
    const row = await built(serial, row => row.features.length === originalCount + 1 && last(row).type === 'revolve' && !last(row).axis,
      336 * Math.PI, defaultBounds, 'new-local-y');
    check(last(row).bodyOperation?.mode === 'new', 'New revolution remains a separate body from its axis source');
    await ready(); return row;
  }
  async function edit(id) {
    await press('.tree-row[data-feature-id="' + id + '"]');
    await press('.selection-tools button[title="Editar operación"]'); await ready();
  }
  return async () => {
    await waitFor('initial external-axis document commands', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let serial = (await observe()).serial;
    await press('button[aria-label="Abrir (Ctrl+O)"]');
    await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
    const original = await built(serial, row => row.features.length === originalCount, null, null, 'original-prism-and-unused-profiles');
    check(canonical(original.features) === canonical(expected.features), 'Opened original recipe has exact four declarations');
    await idle(); const originalRecovery = await recovery();
    await begin();
    await coincidentWorldAxis(originalRecovery);
    serial = (await observe()).serial; await change(AXIS, 'principal-Z');
    const rejected = await waitFor('noncoplanar world axis is rejected', async () => (await observe()).builds.find(row => row.serial > serial
      && last(row).axis?.kind === 'principal-axis' && last(row).axis.axis === 'Z' && row.response));
    check(rejected.response.ok && rejected.response.value.featureErrors.some(error => error.id === last(rejected).id && /plano/i.test(error.message)), 'Native kernel rejects out-of-plane Z without substituting Y');
    check(await page(selector => document.querySelector(selector)?.disabled === true, APPLY), 'Invalid axis cannot be accepted');
    check(await recovery() === originalRecovery, 'Rejected external axis preserves committed recovery');
    serial = (await observe()).serial; await change(AXIS, JSON.stringify(['external-sketch-line', 'external-axis', 'axis-line']));
    await built(serial, row => canonical(last(row).axis) === canonical(externalAxis), 240 * Math.PI, externalBounds, 'external-dropdown');
    serial = (await observe()).serial; await change('input[aria-label="Ángulo"]', 90);
    await built(serial, row => last(row).angle === 90 && !last(row).reversed, 60 * Math.PI,
      { min: [2, -3, -7], max: [9, 3, 0] }, 'external-quarter');
    serial = (await observe()).serial; await press('input[aria-label="Invertir dirección"]');
    await built(serial, row => last(row).angle === 90 && last(row).reversed === true, 60 * Math.PI,
      { min: [2, -3, 0], max: [9, 3, 7] }, 'external-quarter-reversed');
    await change('input[aria-label="Ángulo"]', 360); await ready();
    await press('input[aria-label="Invertir dirección"]'); await ready();
    await change(AXIS, 'principal-Y'); await ready();
    await press('button[title="Vista frontal (Ctrl+1)"]'); await arm();
    let key = await candidateKey(['external-sketch-line', 'external-axis', 'axis-line']), point = await findAxis(key);
    let guardSerial = (await observe()).serial;
    await pointer('mousePressed', point, 1); await menuKey('Escape'); await pointer('mouseReleased', point, 0); await frames();
    check(await page(selector => document.querySelector('.viewport-canvas')?.dataset.partAxisPicking === 'false'
      && document.querySelector(selector)?.value === 'principal-Y', AXIS), 'Escape during press revokes axis selection and retains world Y');
    check((await observe()).serial === guardSerial && await recovery() === originalRecovery, 'Escape performs no CAD work or commit');
    await arm(); key = await candidateKey(['external-sketch-line', 'external-axis', 'axis-line']); point = await findAxis(key);
    guardSerial = (await observe()).serial;
    await pointer('mousePressed', point, 1); await wheel(point, -120); await pointer('mouseReleased', point, 0); await frames();
    check(await page(selector => document.querySelector('.viewport-canvas')?.dataset.partAxisPicking === 'true'
      && document.querySelector(selector)?.value === 'principal-Y', AXIS), 'Wheel during a press cancels only the stale gesture, retaining armed selector and world Y');
    check((await observe()).serial === guardSerial && await recovery() === originalRecovery, 'Zoom-only guard preserves CAD/recovery');
    point = await findAxis(key); serial = (await observe()).serial;
    await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    await built(serial, row => canonical(last(row).axis) === canonical(externalAxis), 240 * Math.PI, externalBounds, 'external-pointer-after-guard');
    await ready(); serial = (await observe()).serial; await press(CANCEL);
    const cancelled = await built(serial, row => row.features.length === originalCount, null, null, 'cancel-original-external-draft');
    check(canonical(cancelled.features) === canonical(expected.features) && await recovery() === originalRecovery, 'Cancel restores original body, profiles and exact recovery');
    await idle(); await begin(); const externalPreview = await pickExternal(); await ready();
    const revolve = last(externalPreview), bodyId = revolve.bodyOperation.bodyId;
    serial = (await observe()).serial; await press(APPLY);
    const committed = await built(serial, row => last(row).id === revolve.id, 240 * Math.PI, externalBounds, 'external-applied');
    await idle(); serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    await built(serial, row => row.features.length === originalCount, null, null, 'external-undo');
    await idle(); serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
    const redone = await built(serial, row => last(row).id === revolve.id, 240 * Math.PI, externalBounds, 'external-redo');
    check(canonical(redone.features) === canonical(committed.features), 'Redo restores exact external sketch reference and output identity');
    await idle(); await fileCommand('Guardar como…');
    await waitFor('external-axis save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 1
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const externalBytes = await fsp.readFile(output), externalSaved = JSON.parse(externalBytes.toString('utf8'));
    check(canonical(externalSaved.features) === canonical(redone.features), 'Saved external-axis declaration equals actual accepted features');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const externalReopened = await built(serial, row => last(row).id === revolve.id, 240 * Math.PI, externalBounds, 'external-saved-fresh-rebuild');
    check(canonical(externalReopened.features) === canonical(externalSaved.features), 'Fresh reopen preserves external sketch/entity IDs');
    await idle(); const externalRecovery = await recovery(); await edit(revolve.id); await arm();
    await change('select[aria-label="Orientación de vista"]', 'back', false);
    await press('button[title="Ajustar a pantalla (F)"]'); await frames();
    const matchingEdges = original.response.value.bodies[0].edges.filter(edge => edge.lines.length === 6
      && [0, 3].every(i => Math.abs(edge.lines[i] + 2) < 1e-6 && Math.abs(edge.lines[i + 2]) < 1e-6)
      && Math.abs(Math.min(edge.lines[1], edge.lines[4]) + 4) < 1e-6 && Math.abs(Math.max(edge.lines[1], edge.lines[4]) - 4) < 1e-6);
    check(matchingEdges.length === 1, 'Original prism provides one exact x=-2,z=0 vertical edge');
    const edge = matchingEdges[0].ref;
    key = await candidateKey(['linear-edge', 'axis-body', 'axis-block', edge.sourceFeatureId, edge.key]); point = await findAxis(key);
    serial = (await observe()).serial; await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    const materialPreview = await built(serial, row => last(row).axis?.kind === 'linear-edge', 432 * Math.PI, materialBounds, 'actual-body-owned-material-axis');
    const materialAxis = last(materialPreview).axis;
    check(canonical(materialAxis) === canonical({ kind: 'linear-edge', body: { bodyId: 'axis-body', sourceFeatureId: 'axis-block' }, edge }), 'Actual pointer persists exact current edge and its explicit body owner');
    check(last(materialPreview).bodyOperation.bodyId === bodyId && await recovery() === externalRecovery, 'Read-only axis selection preserves output body identity and committed external reference');
    await ready(); serial = (await observe()).serial; await press(CANCEL);
    const materialCancelled = await built(serial, row => last(row).id === revolve.id && last(row).axis?.kind === 'external-sketch-line', 240 * Math.PI, externalBounds, 'material-edit-cancel');
    check(canonical(materialCancelled.features) === canonical(externalSaved.features) && await recovery() === externalRecovery, 'Saved-axis Cancel restores exact external declaration/recovery');
    await idle(); await edit(revolve.id); await arm();
    key = await candidateKey(['linear-edge', 'axis-body', 'axis-block', edge.sourceFeatureId, edge.key]); point = await findAxis(key);
    serial = (await observe()).serial; await pointer('mousePressed', point, 1); await pointer('mouseReleased', point, 0);
    await built(serial, row => last(row).axis?.kind === 'linear-edge', 432 * Math.PI, materialBounds, 'material-edit-retry');
    await ready(); serial = (await observe()).serial; await press(APPLY);
    const materialCommitted = await built(serial, row => last(row).id === revolve.id && last(row).axis?.kind === 'linear-edge', 432 * Math.PI, materialBounds, 'material-applied');
    await idle(); await fileCommand('Guardar');
    await waitFor('material-axis save completed', async () => ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2
      && await page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
    const materialBytes = await fsp.readFile(output), materialSaved = JSON.parse(materialBytes.toString('utf8'));
    check(canonical(materialSaved.features) === canonical(materialCommitted.features), 'Saved material axis retains exact body state and native edge reference');
    serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
    const fresh = await built(serial, row => last(row).id === revolve.id && last(row).axis?.kind === 'linear-edge', 432 * Math.PI, materialBounds, 'material-saved-fresh-rebuild');
    check(canonical(fresh.features) === canonical(materialSaved.features) && fresh.response.value.bodies.some(body => body.ref.bodyId === bodyId), 'Fresh native reopen retains exact read-only axis ownership and independent output body');
    await idle();
    check(dialogCounts().opens === 3 && dialogCounts().saves === 1 && ipc.filter(event => event.channel === 'document:save' && event.completed).length === 2,
      'Three Open dialogs, one Save As dialog and two actual document writes only');
    const finalObservation = await observe();
    check(!finalObservation.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(event => event.completed), 'No axis worker/renderer/resource/unfinished IPC failure');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Production worker and WASM actually loaded');
    evidence.partExternalAxis.persistence = { inputSha256: digest(await fsp.readFile(input)), externalSha256: digest(externalBytes), materialSha256: digest(materialBytes),
      dialogs: dialogCounts(), geometricLimits: 'Independent annulus formula pi(R²-r²)H: 336pi/240pi/432pi mm³ at1e-5; quarter external60pi; bounds1e-6mm; original read-only prism8mm³ at1e-6. No BRep validity, surface area or STEP claim from renderer observation.' };
    evidence.savedSha256 = digest(materialBytes);
    await capture(materialSaved);
  };
};
