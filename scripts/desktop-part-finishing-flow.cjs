'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString: quote } = require('./desktop-ui-source.cjs');

// Actual renderer input, original literal geometry and a separate native STEP reader.
// Observed edge DTOs are witnesses after pointer picking, never supplied to the UI.
module.exports = function finishingWorkflow(c) {
  const { expected, input, output, finishingFiles, evaluate, observe, waitFor, pointer, capture, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = c;
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(v => 'JSON.parse(' + quote(JSON.stringify(v)) + ')').join(',') + ')');
  const APPLY = 'button[title="Aceptar operación"]', CANCEL = 'button[title="Cancelar operación"]';
  const HOST = '.viewport-canvas[aria-label="Vista 3D de la pieza"]', CANVAS = HOST + ' > canvas:not([role="img"])';
  const records = [], interactions = [], exports = [];
  const evidence = { partFinishing: { records, interactions, exports } }; checks.push(evidence);
  const recovery = () => page(() => localStorage.getItem('solidflow.autosave'));
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const history = () => page(() => ['Deshacer (Ctrl+Z)', 'Rehacer (Ctrl+Y)'].map(title => {
    const found = [...document.querySelectorAll('button')].filter(e => e.title === title);
    if (found.length !== 1) throw Error('One current history button required');
    return { title, disabled: found[0].disabled };
  }));
  async function inspect(selector, label) {
    return page((selector, label) => {
      const commandLabel = e => (e.matches('[data-assembly-command]')
        ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(e => !label || commandLabel(e) === label);
      if (matches.length !== 1) return { count: matches.length };
      const e = matches[0], r = e.getBoundingClientRect(), point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      let left = 0, top = 0, right = innerWidth, bottom = innerHeight;
      for (let p = e.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { left = Math.max(left, b.left + p.clientLeft); right = Math.min(right, b.left + p.clientLeft + p.clientWidth); }
        if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) { top = Math.max(top, b.top + p.clientTop); bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight); }
      }
      const hit = document.elementFromPoint(point.x, point.y);
      return { count: 1, point, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, disabled: e.matches(':disabled'),
        available: !e.matches(':disabled') && !e.closest('[hidden]') && r.width > 0 && r.height > 0
          && r.left >= left && r.top >= top && r.right <= right && r.bottom <= bottom && !!hit && (hit === e || e.contains(hit)) };
    }, selector, label ?? '');
  }
  async function press(selector, label) {
    await page((selector, label) => {
      const commandLabel = e => (e.matches('[data-assembly-command]')
        ? e.querySelector(':scope > span:not(.assembly-menu-check)')?.textContent : e.textContent)?.trim() ?? '';
      const matches = [...document.querySelectorAll(selector)].filter(e => !label || commandLabel(e) === label);
      if (matches.length !== 1 || matches[0].closest('[hidden]')) throw Error('One mounted visible command required: ' + selector);
      matches[0].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector, label ?? '');
    let previous, since = 0;
    const target = await waitFor('stationary finishing control ' + (label ?? selector), async () => {
      const state = await inspect(selector, label), key = canonical(state);
      if (key !== previous) { previous = key; since = Date.now(); return false; }
      return state.available && Date.now() - since >= 120 ? state : false;
    }).catch(async error => { error.message += '; target=' + JSON.stringify(await inspect(selector, label)); throw error; });
    await pointer('mouseMoved', target.point);
    check(canonical(await inspect(selector, label)) === canonical(target), 'Command remains contained and hit-tested before actual pointer press');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ selector, label, point: target.point, input: 'CDP left press/release after legitimate DOM reveal' });
  }
  async function file(label) {
    await press('[data-assembly-menu="file"]');
    await press('.part-main-menus .assembly-menu-wrap:has(> [data-assembly-menu="file"][aria-expanded="true"]) > [role="menu"] > [role="menuitem"]', label);
  }
  async function idle() {
    await waitFor('finishing document idle', () => page(() => !document.querySelector('.property-manager') && document.querySelector('.statusbar')?.textContent.includes('Listo')));
  }
  const body = (result, id) => {
    const matches = result.bodies.filter(item => item.ref.bodyId === 'workflow-body-' + id);
    check(matches.length === 1, 'One exact current body ' + id); return matches[0];
  };
  function geometry(record, kind, originalB) {
    check(record.response.ok, record.response.error || 'Native finishing build failed');
    const result = record.response.value;
    check(result.bodyCatalogActive && result.bodies.length === 2 && result.featureErrors.length === 0
      && canonical(result.warnings) === canonical(['La pieza contiene 2 sólidos separados.']),
      'Exactly two healthy explicit bodies: ' + JSON.stringify({ serial: record.serial, kind,
        catalog: result.bodyCatalogActive, count: result.bodies?.length, featureErrors: result.featureErrors, warnings: result.warnings }));
    const a = body(result, 'a'), b = body(result, 'b');
    near(a.volume, kind === 'fillet' ? 236 + Math.PI : kind === 'chamfer' ? 238 : 240, 5e-6, 'Independent A volume');
    near(b.volume, 240, 5e-6, 'Independent untouched B volume');
    for (const [current, shift] of [[a, 0], [b, 20]]) {
      for (const [side, wanted] of [['min', [shift, 0, 0]], ['max', [shift + 10, 6, 4]]])
        wanted.forEach((value, axis) => near(current.bounds[side][axis], value, 5e-6, 'Independent body bounds'));
    }
    check(a.ref.sourceFeatureId === (kind ? record.features.at(-1).id : 'create-a') && a.createdByFeatureId === 'create-a', 'A producer/creator identity');
    check(b.ref.sourceFeatureId === 'create-b' && b.createdByFeatureId === 'create-b', 'B producer/creator identity');
    if (originalB) check(canonical(b) === canonical(originalB), 'B exact observed body, edge references and coordinates remain unchanged');
  }
  async function built(serial, predicate, kind, phase, originalB) {
    const record = await waitFor('native finishing ' + phase, async () => {
      const state = await observe(); check(state.workerErrors.length === 0, 'No worker errors');
      return state.builds.filter(r => r.serial > serial && predicate(r.features) && r.response).at(-1);
    });
    geometry(record, kind, originalB);
    records.push({ phase, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: record.response.value.bodies.map(b => ({ ref: b.ref, volume: b.volume, bounds: b.bounds })) });
    return record;
  }
  // Geometry targets are literal. The public Iso/Fit commands set the camera;
  // only the actual main-canvas rectangle is observed for pixel calibration.
  async function viewportPoint(world, expectedHover) {
    await page(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const target = await page((selector, world) => {
      const list = document.querySelectorAll(selector); if (list.length !== 1) throw Error('One main part renderer canvas required');
      const canvas = list[0], r = canvas.getBoundingClientRect(), aspect = r.width / r.height;
      const scale = r.height / (2 * 24.6 / Math.min(aspect, 1)), d = world.map((v, i) => v - [15, 3, 2][i]);
      const right = [1.4 / Math.sqrt(2.96), 0, -1 / Math.sqrt(2.96)];
      const up = [-1 / Math.sqrt(3.96 * 2.96), 2.96 / Math.sqrt(3.96 * 2.96), -1.4 / Math.sqrt(3.96 * 2.96)];
      const point = { x: r.left + r.width / 2 + d.reduce((s, v, i) => s + v * right[i], 0) * scale,
        y: r.top + r.height / 2 - d.reduce((s, v, i) => s + v * up[i], 0) * scale };
      return { point, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, scale,
        hit: document.elementFromPoint(point.x, point.y) === canvas && point.x > r.left && point.x < r.right && point.y > r.top && point.y < r.bottom };
    }, CANVAS, world);
    check(target.hit, 'Literal finishing target hits the observed main canvas: ' + JSON.stringify(target));
    await pointer('mouseMoved', target.point);
    if (expectedHover) await waitFor('actual hover identifies intended finishing edge', () => page(host => document.querySelector(host)?.getAttribute('data-part-hover-kind') === 'edge', HOST));
    check(await page((selector, point, rect) => { const e = document.querySelector(selector), r = e?.getBoundingClientRect();
      return !!r && r.left === rect.left && r.top === rect.top && r.width === rect.width && r.height === rect.height && document.elementFromPoint(point.x, point.y) === e;
    }, CANVAS, target.point, target.rect), 'Canvas target remains unobscured and stationary immediately before click');
    await pointer('mousePressed', target.point, 1); await pointer('mouseReleased', target.point, 0);
    interactions.push({ input: 'CDP viewport press/release', literalWorld: world, calibration: target,
      basis: 'public Iso/Fit; literal bounds [0,0,0] to [30,6,4], observed canvas rectangle' });
  }
  async function selectA() {
    await press('button[title="Vista isométrica (Ctrl+7)"]');
    await press('button[title="Ajustar a pantalla (F)"]');
    await press('button[data-part-selection-mode="body"]');
    await viewportPoint([5, 3, 4], false);
    await waitFor('actual viewport selects only original A', () => page(host => {
      const selected = JSON.parse(document.querySelector(host)?.getAttribute('data-part-selected-bodies') || '[]');
      return selected.length === 1 && selected[0].bodyId === 'workflow-body-a' && selected[0].sourceFeatureId === 'create-a';
    }, HOST));
  }
  async function layout(kind) {
    const result = await page(kind => {
      const panel = document.querySelector('.property-manager.property-manager-finish'), head = panel?.querySelector('.property-manager-header');
      const size = panel?.querySelector('input[aria-label="' + (kind === 'fillet' ? 'Radio del redondeo' : 'Distancia del chaflán') + '"]');
      const edges = panel?.querySelector('.edge-selection-list'), body = panel?.querySelector('.body-operation-panel'), name = panel?.querySelector('[aria-label="Nombre de operación"]');
      if (!panel || !head || !size || !edges || !body || !name) throw Error('One complete finish form required');
      const p = panel.getBoundingClientRect(), h = head.getBoundingClientRect(), clip = { left: p.left + panel.clientLeft, right: p.left + panel.clientLeft + panel.clientWidth,
        top: Math.max(h.bottom, p.top), bottom: Math.min(innerHeight, p.top + panel.clientTop + panel.clientHeight) };
      const visible = (e, header = false) => { const r = e.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { height: r.height, top: r.top, bottom: r.bottom, contained: r.width > 0 && r.height > 0 && r.left >= clip.left && r.right <= clip.right
          && r.top >= (header ? p.top : clip.top) && r.bottom <= clip.bottom && !!hit && (e === hit || e.contains(hit)) }; };
      const fields = [edges, size, body, name];
      return { scrollTop: panel.scrollTop, viewport: { width: innerWidth, height: innerHeight }, clip,
        order: fields.every((field, i) => !i || !!(fields[i - 1].compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING)),
        size: visible(size), value: size.value, edges: visible(edges), count: edges.querySelectorAll('button[aria-label^="Quitar arista"]').length,
        confirmation: ['Aceptar operación', 'Cancelar operación'].map(title => visible(head.querySelector('button[title="' + title + '"]'), true)),
        applyDisabled: head.querySelector('button[title="Aceptar operación"]').disabled };
    }, kind);
    check(result.scrollTop === 0 && result.order && result.size.height >= 28 && result.size.contained && result.edges.contained
      && result.value === '1' && result.count === 0 && result.applyDisabled && result.confirmation.every(b => b.contained),
      'Initial edges→size→bodies→name layout, real 28px input, visible selection and sticky confirmation, empty-edge rejection: ' + JSON.stringify(result));
    records.push({ phase: kind + '-initial-layout', layout: result });
  }
  async function prepare(kind, edge, baseline, originalB) {
    await selectA();
    await press('.ribbon-tabs button', 'Operaciones');
    await press('button.command[title="' + (kind === 'fillet' ? 'Redondeo' : 'Chaflán') + '"]');
    await waitFor('finish editor has current source', () => page(() => !!document.querySelector('.finish-view-switch button:not(:disabled)') && !document.querySelector('.property-manager')?.textContent.includes('Preparando la pieza')));
    await layout(kind);
    await viewportPoint([10, 6, 2], true);
    await waitFor('one actual selected corner edge', () => page((host, edge) => {
      const selected = JSON.parse(document.querySelector(host)?.getAttribute('data-part-selected-edges') || '[]');
      return selected.length === 1 && JSON.stringify(selected[0]) === JSON.stringify(edge);
    }, HOST, edge));
    await waitFor('finishing current preview ready', () => page(selector => !document.querySelector(selector)?.disabled, APPLY));
    const latest = (await observe()).builds.filter(r => r.features.at(-1)?.type === kind && r.features.at(-1)?.selection?.edges?.length === 1 && r.response).at(-1);
    check(!!latest, 'Actual selected-edge preview observed'); geometry(latest, kind, originalB);
    const feature = latest.features.at(-1);
    check(feature.size === 1 && feature.baseFeatureId === 'create-a' && canonical(feature.bodyScope) === canonical({ bodyId: 'workflow-body-a', sourceFeatureId: 'create-a' })
      && canonical(feature.selection) === canonical({ mode: 'selected', edges: [edge] }) && canonical(latest.features.slice(0, -1)) === canonical(expected.features),
      'Actual draft has exact original owner, selected edge, unit size and untouched prefix');
    await press('.finish-view-switch button', 'Vista previa');
    await waitFor('finish preview mode displayed', () => page(() => document.querySelector('.finish-view-switch button.active')?.textContent.trim() === 'Vista previa'));
    check(await recovery() === baseline, 'Finishing preview preserves exact committed recovery');
    return latest;
  }
  let nativePromise;
  async function nativeStep(bytes, kind) {
    const text = bytes.toString('utf8');
    check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text)
      && /SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'Complete millimetre STEP from the existing native export');
    nativePromise ??= fsp.readFile(require.resolve('replicad-opencascadejs/wasm')).then(wasmBinary => require('replicad-opencascadejs')({ wasmBinary, print: () => undefined }));
    const oc = await nativePromise, owners = [], cleanup = [], file = '/original-finishing.step';
    const own = item => { owners.push(item); return item; }; let primary, result;
    try {
      own({ delete: () => { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
      const reader = own(new oc.STEPControl_Reader());
      check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate STEP reader accepts actual export');
      reader.SetSystemLengthUnit(1); near(reader.SystemLengthUnit(), 1, 0, 'STEP reader millimetres');
      const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'All STEP roots transfer');
      const shape = own(reader.OneShape()), valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false));
      check(!shape.IsNull() && valid.IsValid(), 'Exported aggregate BRep valid');
      const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), solids = [];
      while (explorer.More()) {
        check(solids.length < 2, 'No extra exported solids');
        const solid = own(explorer.Current()), analyzer = own(new oc.BRepCheck_Analyzer(solid, true, false, false));
        check(analyzer.IsValid(), 'Each exported finishing solid is valid');
        const volume = own(new oc.GProp_GProps()), area = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
        oc.BRepGProp.VolumeProperties(solid, volume, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, area, false, false);
        oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
        solids.push({ volume: volume.Mass(), area: area.Mass(), min: [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max: [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()] });
        explorer.Next();
      }
      check(solids.length === 2, 'Exactly two valid independent STEP solids'); solids.sort((a, b) => a.min[0] - b.min[0]);
      const expectedVolume = kind === 'fillet' ? 236 + Math.PI : 238, expectedArea = kind === 'fillet' ? 238 + 2.5 * Math.PI : 239 + 4 * Math.SQRT2;
      solids.forEach((solid, i) => {
        near(solid.volume, i ? 240 : expectedVolume, 5e-6, 'Analytical exported solid volume'); near(solid.area, i ? 248 : expectedArea, 5e-6, 'Analytical exported solid area');
        for (const [side, wanted] of [['min', [i * 20, 0, 0]], ['max', [i * 20 + 10, 6, 4]]])
          wanted.forEach((value, axis) => near(solid[side][axis], value, 5e-6, 'Literal exported solid bounds'));
      });
      result = { kind, reader: 'separate native STEP reader; same kernel family, not independent interoperability', solids };
    } catch (error) { primary = error; }
    finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanup.push(error); } } }
    if (primary || cleanup.length) throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Finishing STEP measurement or cleanup failed', { cause: primary ?? cleanup[0] });
    return result;
  }
  return async () => {
    await waitFor('finishing file controls ready', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    let savedBytes;
    for (const [index, kind] of ['fillet', 'chamfer'].entries()) {
      let serial = (await observe()).serial;
      await press('button[aria-label="Abrir (Ctrl+O)"]');
      if (index === 0) await press('[role="dialog"][aria-labelledby="discard-title"] .primary-button', 'Continuar sin guardar');
      const original = await built(serial, features => canonical(features) === canonical(expected.features), null, kind + '-original'); await idle();
      const b = body(original.response.value, 'b'), a = body(original.response.value, 'a');
      const corners = a.edges.filter(edge => { const p = Array.from({ length: edge.lines.length / 3 }, (_, i) => edge.lines.slice(i * 3, i * 3 + 3));
        return p.length >= 2 && p.every(v => Math.abs(v[0] - 10) < 5e-7 && Math.abs(v[1] - 6) < 5e-7)
          && Math.abs(Math.min(...p.map(v => v[2]))) < 5e-7 && Math.abs(Math.max(...p.map(v => v[2])) - 4) < 5e-7; });
      check(corners.length === 1, 'One native witness for the literal A corner; reference is never injected');
      const baseline = await recovery(), oldHistory = await history();
      await prepare(kind, corners[0].ref, baseline, b);
      serial = (await observe()).serial; await press(CANCEL);
      await built(serial, features => canonical(features) === canonical(expected.features), null, kind + '-cancel', b); await idle();
      check(await recovery() === baseline && canonical(await history()) === canonical(oldHistory), 'Cancel restores exact document recovery and history availability');
      const preview = await prepare(kind, corners[0].ref, baseline, b), feature = preview.features.at(-1);
      serial = (await observe()).serial; await press(APPLY);
      const accepted = await built(serial, features => canonical(features) === canonical(preview.features), kind, kind + '-accepted', b); await idle();
      serial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
      await built(serial, features => canonical(features) === canonical(expected.features), null, kind + '-undo', b); await idle();
      serial = (await observe()).serial; await press('button[title="Rehacer (Ctrl+Y)"]');
      await built(serial, features => canonical(features) === canonical(accepted.features), kind, kind + '-redo', b); await idle();
      await file('Guardar como…');
      await waitFor('finishing actual save completes', () => page(() => !document.querySelector('.document-title')?.textContent.includes('*')));
      check(dialogCounts().saves === index + 1 && ipc.filter(e => e.channel === 'document:save' && e.completed).length === index + 1, 'Exact completed native document save');
      const path = index ? output : finishingFiles.fillet, bytes = await fsp.readFile(path), saved = JSON.parse(bytes);
      check(saved.id === expected.id && canonical(saved.features) === canonical(accepted.features), 'Native saved file has exact authored finish and original prefix');
      serial = (await observe()).serial; await press('button[aria-label="Abrir (Ctrl+O)"]');
      await built(serial, features => canonical(features) === canonical(saved.features), kind, kind + '-reopened', b); await idle();
      const beforeExport = await recovery(); await file('Exportar STEP');
      await waitFor('finishing STEP export completes', () => dialogCounts().geometryExports === index + 1 && ipc.filter(e => e.channel === 'document:export' && e.completed).length === index + 1);
      const step = await fsp.readFile(finishingFiles.steps[index]); exports.push({ ...await nativeStep(step, kind), stepSha256: digest(step), savedSha256: digest(bytes), featureId: feature.id });
      check(await recovery() === beforeExport && (await fsp.readFile(path)).equals(bytes), 'STEP export preserves exact saved bytes and recovery');
      savedBytes = bytes;
    }
    check(dialogCounts().opens === 4 && dialogCounts().saves === 2 && dialogCounts().geometryExports === 2, 'Only fixed original/saved opens, two saves and two STEP exports');
    const observed = await observe(); check(!observed.workerErrors.length && !consoleErrors.length && !failedRequests.length && ipc.every(e => e.completed), 'No worker, renderer, resource or unfinished IPC errors');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Real production worker and WASM loaded');
    evidence.savedSha256 = digest(savedBytes); evidence.partFinishing.originalSha256 = digest(await fsp.readFile(input));
    evidence.partFinishing.limits = 'Two original current-body single-edge cases; no all-edge/tangent propagation or general finishing coverage. STEP same kernel family; V/A/bounds tolerance5e-6, corner witness5e-7. No deadline changes.';
    await capture(JSON.parse(savedBytes));
  };
};
