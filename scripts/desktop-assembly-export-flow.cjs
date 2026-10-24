'use strict';
const fsp = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Actual production worker/IPC bytes; all geometric expectations below are
// analytical boxes, independent of the assembly exporter and its helpers.
module.exports = function assemblyExportWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, assemblyExportOutputs, evaluate, observe, waitFor, click, capture, checks,
    protocolResponses, consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const STEP = 'button[aria-label="Exportar STEP plano del ensamblaje"]', STL = 'button[aria-label="Exportar STL del ensamblaje"]';
  const UNDO = 'button[aria-label="Deshacer ensamblaje"]', REDO = 'button[aria-label="Rehacer ensamblaje"]';
  const phases = [], exports = [], evidence = { scenario: 'original-flat-assembly-export', phases, exports };
  checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, desired, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - desired) <= tolerance,
    label + '; actual=' + actual + ', expected=' + desired + ', tolerance=' + tolerance);
  const near = (actual, desired, tolerance, label) => {
    check(Array.isArray(actual) && actual.length === desired.length, label + ' dimensions');
    actual.forEach((value, index) => close(value, desired[index], tolerance, label + '[' + index + ']'));
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const subtract = (a, b) => a.map((value, index) => value - b[index]);
  // World-space boxes obtained by hand from the declared quarter-turn poses.
  // first/legacy-child and coincident deliberately share all geometry.
  const boxes = [
    { name: 'first/legacy-child + coincident', min: [6, 1, -7], max: [10, 11, -1], copies: 2, volume: 240, area: 248 },
    { name: 'second/legacy-child (hidden)', min: [43, 0, -8], max: [53, 4, -2], copies: 1, volume: 240, area: 248 },
    { name: 'first/multi-child/A', min: [7, -2, 1], max: [10, 0, 5], copies: 1, volume: 24, area: 52 },
    { name: 'first/multi-child/B', min: [8, 8, 1], max: [10, 9, 4], copies: 1, volume: 6, area: 22 },
    { name: 'second/multi-child/A (hidden)', min: [40, 0, 0], max: [42, 3, 4], copies: 1, volume: 24, area: 52 },
    { name: 'second/multi-child/B (hidden)', min: [50, 0, 0], max: [51, 2, 3], copies: 1, volume: 6, area: 22 },
  ];
  function record(phase, event) {
    phases.push({ phase, serial: event.serial, action: event.action, documentSha256: digest(canonical(event.document)),
      scene: event.response.value });
  }
  async function responseAfter(serial, action) {
    return waitFor('actual ' + action + ' response after ' + serial, async () => {
      const events = (await observe()).assemblies.filter(value => value.serial > serial && value.action === action);
      check(events.length <= 1, 'Unexpected duplicate ' + action + ' request.');
      const event = events[0];
      if (!event?.response) return false;
      check(event.response.ok, event.response.error || 'Actual worker rejected ' + action + '.'); return event;
    });
  }
  async function idle(label) {
    await waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
      && !document.querySelector('.assembly-spinner')
      && document.querySelector('button[aria-label="Exportar STEP plano del ensamblaje"]')?.disabled === false
      && document.querySelector('button[aria-label="Exportar STL del ensamblaje"]')?.disabled === false));
  }
  async function button(label) { await assemblyNavigation.button(label, ':is(.assembly-toolbar, .assembly-quickbar)');
    await page(label => {
      const matches = [...document.querySelectorAll(':is(.assembly-toolbar, .assembly-quickbar) button')].filter(value => value.textContent.trim() === label);
      if (matches.length !== 1 || matches[0].disabled) throw Error('Exact enabled assembly toolbar control absent: ' + label);
      matches[0].click();
    }, label);
  }
  async function committedUi() {
    return page(() => ({ recovery: localStorage.getItem('solidflow.autosave'),
      title: document.querySelector('.assembly-shell-document > strong')?.textContent,
      file: document.querySelector('.assembly-shell-file')?.textContent,
      undoDisabled: document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled,
      redoDisabled: document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled,
      applyDisabled: document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled,
      cancelDisabled: document.querySelector('button[aria-label="Cancelar vista previa del ensamblaje"]')?.disabled,
      label: document.querySelector('.assembly-canvas-label span')?.textContent }));
  }
  async function recovery(document, label) {
    await waitFor(label + ' committed recovery', async () => {
      const stored = (await committedUi()).recovery;
      return !!stored && canonical(JSON.parse(stored)) === canonical(document);
    });
  }
  function geometry(scene, document) {
    const observation = { kind: scene?.kind, solidCount: scene?.solidCount, bodyCount: scene?.bodies?.length,
      prototypeCount: scene?.prototypeCount, warnings: scene?.warnings,
      bodies: scene?.bodies?.map(body => ({ component: body.component, body: body.body, solidCount: body.solidCount, visible: body.visible })) };
    checks.push({ flatExportSceneObservation: observation });
    check(scene.kind === 'assembly-scene' && scene.solidCount === 7 && scene.bodies.length === 7
      && scene.prototypeCount === 2 && canonical(scene.warnings) === canonical(['flat-explicit: La pieza contiene 2 sólidos separados.']),
      'Expected all seven active solids from two prototypes and the exact multibody warning; actual=' + JSON.stringify(observation));
    close(scene.volume, 780, 1e-6, 'Independent ALL volume'); close(scene.area, 892, 1e-6, 'Independent ALL area');
    near(scene.bounds.min, [6, -2, -8], 1e-6, 'ALL bounds minimum'); near(scene.bounds.max, [53, 11, 5], 1e-6, 'ALL bounds maximum');
    check(scene.bodies.filter(body => !body.visible).length === 3, 'Hidden subassembly must retain three active export bodies.');
    check(scene.bodies.every(body => !body.component.occurrencePath.some(id => id.startsWith('suppressed'))), 'Suppressed geometry entered scene.');
    check(canonical(document.definitions) === canonical(expected.definitions) && canonical(document.mates) === canonical(expected.mates),
      'Export workflow changed embedded source geometry or relations.');
  }
  function binaryStl(bytes) {
    check(bytes.length === 4284 && bytes.readUInt32LE(80) === 84, 'Expected seven boxes, 84 binary STL facets and 4284 bytes.');
    const groups = boxes.map(box => ({ ...box, triangles: 0, areaSum: 0, signedVolume: 0, faces: Array(6).fill(0),
      missingCorners: Array.from({ length: 6 }, () => Array(4).fill(0)) }));
    let volume = 0, area = 0; const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < 84; index++) {
      const offset = 84 + 50 * index, normal = [0, 1, 2].map(axis => bytes.readFloatLE(offset + 4 * axis));
      const vertices = [0, 1, 2].map(vertex => [0, 1, 2].map(axis => bytes.readFloatLE(offset + 12 + 12 * vertex + 4 * axis)));
      check([...normal, ...vertices.flat()].every(Number.isFinite), 'STL nonfinite coordinates or normal.');
      check(bytes.readUInt16LE(offset + 48) === 0, 'Unexpected STL attribute payload.');
      vertices.forEach(vertex => vertex.forEach((value, axis) => { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); }));
      const matches = [];
      for (const group of groups) {
        if (!vertices.every(vertex => vertex.every((value, axis) => Math.abs(value - group.min[axis]) <= 1e-6 || Math.abs(value - group.max[axis]) <= 1e-6))) continue;
        for (let face = 0; face < 6; face++) {
          const axis = Math.floor(face / 2), side = face % 2, coordinate = side ? group.max[axis] : group.min[axis];
          if (vertices.every(vertex => Math.abs(vertex[axis] - coordinate) <= 1e-6)) matches.push({ group, face, axis, sign: side ? 1 : -1 });
        }
      }
      check(matches.length === 1, 'STL facet does not belong to exactly one original box face.');
      const { group, face, axis, sign } = matches[0], product = cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0]));
      const magnitude = Math.hypot(...product), outward = [0, 0, 0]; outward[axis] = sign;
      check(magnitude > 0, 'Degenerate STL triangle.');
      near(normal, outward, 1e-6, 'STL outward stored normal'); near(product.map(value => value / magnitude), outward, 1e-6, 'STL outward vertex winding');
      const tangents = [0, 1, 2].filter(value => value !== axis), corners = vertices.map(vertex =>
        (Math.abs(vertex[tangents[0]] - group.max[tangents[0]]) <= 1e-6 ? 1 : 0)
        + (Math.abs(vertex[tangents[1]] - group.max[tangents[1]]) <= 1e-6 ? 2 : 0));
      check(new Set(corners).size === 3, 'STL facet repeats a box corner.');
      group.missingCorners[face][[0, 1, 2, 3].find(value => !corners.includes(value))]++;
      const triangleArea = magnitude / 2, signedVolume = dot(vertices[0], cross(vertices[1], vertices[2])) / 6;
      group.triangles++; group.faces[face]++; group.areaSum += triangleArea; group.signedVolume += signedVolume;
      area += triangleArea; volume += signedVolume;
    }
    for (const group of groups) {
      check(group.triangles === 12 * group.copies && group.faces.every(value => value === 2 * group.copies),
        'STL lost face/solid multiplicity for ' + group.name);
      // Each complementary triangle pair covers the rectangle once. Counting
      // missing opposite corners also permits the two coincident boxes to use
      // different diagonals, while rejecting duplicate half-face coverage.
      check(group.missingCorners.every(counts => counts[0] === counts[3] && counts[1] === counts[2]),
        'STL overlaps or leaves gaps within a box face: ' + group.name);
      close(group.areaSum, group.area * group.copies, 1e-6, group.name + ' STL area');
      close(group.signedVolume, group.volume * group.copies, 1e-6, group.name + ' STL oriented volume');
    }
    close(area, 892, 1e-6, 'STL ALL area'); close(volume, 780, 1e-6, 'STL ALL oriented volume');
    near(min, [6, -2, -8], 1e-6, 'STL ALL minimum'); near(max, [53, 11, 5], 1e-6, 'STL ALL maximum');
    return { kind: 'independent-binary-stl', triangles: 84, volume, area, bounds: { min, max },
      boxes: groups.map(({ name, copies, triangles, areaSum, signedVolume, faces }) => ({ name, copies, triangles, area: areaSum, volume: signedVolume, faces })) };
  }
  let nativeRuntime;
  async function nativeStep(bytes, index) {
    const text = bytes.toString('utf8');
    check(text.startsWith('ISO-10303-21;') && /END-ISO-10303-21;\s*$/.test(text) && /FILE_SCHEMA\s*\(/.test(text), 'STEP exchange header/footer/schema absent.');
    check(/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\.\s*\)/.test(text), 'STEP millimetre unit absent.');
    const breps = (text.match(/=\s*MANIFOLD_SOLID_BREP\s*\(/g) ?? []).length;
    check(breps === 7 && !/NEXT_ASSEMBLY_USAGE_OCCURRENCE\s*\(/.test(text), 'STEP must retain seven solids without assembly hierarchy.');
    // A separate native runtime in the test-owned main process reads the actual
    // disk bytes. It neither observes native worker handles nor supplies replies.
    nativeRuntime ??= require('replicad-opencascadejs')({ wasmBinary: await fsp.readFile(require.resolve('replicad-opencascadejs/wasm')),
      print: () => undefined });
    const oc = await nativeRuntime, owners = [], cleanup = [], nativePath = '/desktop-flat-export-' + index + '.step';
    const own = value => { owners.push(value); return value; }; let result, primary;
    try {
      own({ delete: () => { if (oc.FS.readdir('/').includes(nativePath.slice(1))) oc.FS.unlink(nativePath); } });
      oc.FS.writeFile(nativePath, bytes); const reader = own(new oc.STEPControl_Reader());
      check(reader.ReadFile(nativePath) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Fresh native STEP reader rejected actual export.');
      reader.SetSystemLengthUnit(1); close(reader.SystemLengthUnit(), 1, 0, 'Fresh STEP target millimetres');
      const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'Fresh STEP transfer incomplete.');
      const shape = own(reader.OneShape()); check(!shape.IsNull(), 'Fresh STEP has null topology.');
      const valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false)); check(valid.IsValid(), 'Fresh STEP aggregate BRep invalid.');
      const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
      const remaining = boxes.map(box => ({ ...box, remaining: box.copies })), solids = []; let volume = 0, area = 0;
      while (explorer.More()) {
        check(solids.length < 7, 'Fresh STEP has extra solid occurrences.');
        const solid = own(explorer.Current()), analyzer = own(new oc.BRepCheck_Analyzer(solid, true, false, false));
        check(!solid.IsNull() && analyzer.IsValid(), 'Fresh STEP contains invalid solid.');
        const mass = own(new oc.GProp_GProps()), surface = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
        oc.BRepGProp.VolumeProperties(solid, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, surface, false, false);
        oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
        const min = [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max = [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()];
        const matches = remaining.filter(box => box.remaining > 0 && box.min.every((value, axis) => Math.abs(value - min[axis]) <= 1e-6)
          && box.max.every((value, axis) => Math.abs(value - max[axis]) <= 1e-6));
        check(matches.length === 1, 'Fresh STEP solid differs from original analytical box placement.');
        const box = matches[0]; close(mass.Mass(), box.volume, 1e-6, box.name + ' STEP volume'); close(surface.Mass(), box.area, 1e-6, box.name + ' STEP area');
        box.remaining--; volume += mass.Mass(); area += surface.Mass(); solids.push({ name: box.name, volume: mass.Mass(), area: surface.Mass(), bounds: { min, max } });
        explorer.Next();
      }
      check(solids.length === 7 && remaining.every(box => box.remaining === 0), 'Fresh STEP lost hidden or coincident solid occurrences.');
      close(volume, 780, 1e-6, 'Fresh STEP ALL volume'); close(area, 892, 1e-6, 'Fresh STEP ALL area');
      result = { kind: 'fresh-native-step-reader', units: 'mm', manifoldSolidEntities: breps, solidCount: solids.length, volume, area, solids };
    } catch (error) { primary = error; }
    finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanup.push(error); } } }
    if (primary || cleanup.length) throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Fresh STEP verification or native/file cleanup failed.', { cause: primary ?? cleanup[0] });
    return result;
  }
  async function exportCommitted(format, document, label, canceled = false) {
    await idle(label + ' export readiness'); await recovery(document, label);
    const beforeUi = await committedUi(), before = await observe(), previousIpc = ipc.length, previousCount = dialogCounts().geometryExports;
    check(beforeUi.applyDisabled && beforeUi.cancelDisabled, 'Export requires committed geometry, without a preview.');
    await click(format === 'step' ? STEP : STL); const event = await responseAfter(before.serial, 'export-assembly');
    check(event.format === format && canonical(event.document) === canonical(document) && !event.hasToken,
      'Export worker did not receive the exact committed snapshot/format without Apply authority.');
    check(event.response.value.size > 0 && event.response.value.type === (format === 'step' ? 'application/step' : 'application/sla')
      && Object.keys(event.response.value).sort().join(',') === 'size,type', 'Export observer must retain only actual Blob metadata.');
    await waitFor(label + ' real export IPC and dialog complete', () => {
      const events = ipc.slice(previousIpc).filter(value => value.channel === 'document:export');
      return dialogCounts().geometryExports === previousCount + 1 && events.length === 1 && events[0].completed;
    });
    await idle(label + ' export finished');
    const message = canceled ? 'Exportación ' + (format === 'step' ? 'STEP plano' : 'STL') + ' cancelada.'
      : 'Geometría del ensamblaje exportada como ' + (format === 'step' ? 'STEP plano' : 'STL') + '.';
    await waitFor(label + ' actual export outcome visible', () => page(message => document.querySelector('.assembly-status > span')?.textContent === message, message));
    check(canonical(await committedUi()) === canonical(beforeUi), 'Export changed document recovery, history controls, dirty state, path or preview.');
    const events = (await observe()).assemblies.filter(value => value.serial > before.serial);
    check(events.length === 1 && events[0].action === 'export-assembly', 'Read-only export created extra build/solve/Apply work.');
    const transport = ipc.slice(previousIpc).filter(value => value.channel === 'document:export')[0].geometry;
    check(transport.format === format && transport.name === document.name && transport.bytes === event.response.value.size, 'Worker Blob and real export IPC differ.');
    let fileEvidence = null; const file = assemblyExportOutputs[previousCount];
    if (canceled) {
      for (const target of assemblyExportOutputs) { const exists = await fsp.access(target).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }); check(!exists, 'Canceled STEP dialog wrote an output.'); }
    } else {
      const bytes = await fsp.readFile(file); check(bytes.length === transport.bytes && digest(bytes) === transport.sha256, 'Real exported disk bytes differ from actual IPC byte view.');
      fileEvidence = { name: path.basename(file), bytes: bytes.length, sha256: digest(bytes),
        geometry: format === 'step' ? await nativeStep(bytes, previousCount) : binaryStl(bytes) };
    }
    exports.push({ phase: label, serial: event.serial, format, canceled, documentSha256: digest(canonical(event.document)),
      blob: event.response.value, transport, file: fileEvidence, before: beforeUi, after: await committedUi() });
  }
  async function history(action, wanted, label) {
    const before = await observe(); await click(action === 'undo' ? UNDO : REDO); const event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(wanted), label + ' failed to restore exactly one committed history snapshot.');
    geometry(event.response.value, event.document); await idle(label + ' rebuilt scene'); await recovery(event.document, label); record(label, event); return event.document;
  }
  return async function workflow() {
    const originalBytes = await fsp.readFile(input); evidence.fixtureSha256 = digest(originalBytes);
    check(expected.id === 'flat-export-root' && expected.mates.length === 0 && expected.occurrences.find(value => value.id === 'second')?.visible === false
      && expected.occurrences.filter(value => value.suppressed).length === 2, 'Expected original nested, hidden and suppressed fixture.');
    await waitFor('initial production part readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.exportDocument === 'function' && typeof window.require === 'undefined' && typeof window.process === 'undefined'), initialReadyMs);
    let before = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('isolated initial document replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await page(() => { const button = document.querySelector('[role="dialog"][aria-labelledby="discard-title"] .primary-button'); if (!button || button.disabled || button.textContent.trim() !== 'Continuar sin guardar') throw Error('Original discard confirmation absent.'); button.click(); });
    let event = await responseAfter(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(expected), 'Original fixture changed during open.');
    let committed = event.document; geometry(event.response.value, committed); record('open/original', event); await idle('original native scene ready'); await recovery(committed, 'original');
    const initial = await committedUi(); check(initial.file === 'input.solidflow' && initial.title === expected.name && initial.undoDisabled && initial.redoDisabled, 'Open did not establish clean document/path/history.');
    await exportCommitted('step', committed, 'original/canceled-step', true);
    await exportCommitted('step', committed, 'original/step'); await exportCommitted('stl', committed, 'original/stl');
    (await assemblyNavigation.panel('components'), await page(() => { const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.getAttribute('aria-level') === '1' && row.querySelector('span')?.firstChild?.textContent === 'first'); if (rows.length !== 1 || rows[0].disabled) throw Error('Original first component absent.'); rows[0].click(); }));
    await waitFor('original component rename control', () => page(() => document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'first'));
    before = await observe();
    const renameInteraction = (await assemblyNavigation.panel('components'), await page(() => {
      const input = document.querySelector('input[aria-label="Nombre del componente"]'); if (!input || input.disabled) throw Error('Rename control absent.');
      const focus = () => ({ value: document.querySelector('input[aria-label="Nombre del componente"]')?.value,
        hasFocus: document.hasFocus(), activeElement: { tag: document.activeElement?.tagName, label: document.activeElement?.getAttribute('aria-label') } });
      const focusout = [], observed = event => focusout.push({ type: event.type, bubbles: event.bubbles, isTrusted: event.isTrusted,
        targetLabel: event.target?.getAttribute('aria-label'), value: event.target?.value });
      const before = focus(); input.addEventListener('focusout', observed);
      try {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Renamed committed export');
        input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        return { before, after: focus(), focusout };
      } finally { input.removeEventListener('focusout', observed); }
    }));
    checks.push({ flatExportRenameInteraction: renameInteraction });
    event = await responseAfter(before.serial, 'build-assembly'); const renamed = event.document;
    const expectedRename = JSON.parse(JSON.stringify(expected)); expectedRename.occurrences.find(value => value.id === 'first').name = 'Renamed committed export'; expectedRename.updatedAt = renamed.updatedAt;
    check(canonical(renamed) === canonical(expectedRename) && renamed.updatedAt !== expected.updatedAt, 'Rename changed more than the selected occurrence name and update time.');
    geometry(event.response.value, renamed); record('rename/committed', event); await idle('renamed committed scene ready'); await recovery(renamed, 'rename');
    check((await committedUi()).title === expected.name + ' *', 'Committed rename should remain unsaved.');
    committed = renamed; await exportCommitted('step', committed, 'renamed/step');
    committed = await history('undo', expected, 'undo/original'); await exportCommitted('stl', committed, 'undo/stl');
    committed = await history('redo', renamed, 'redo/renamed'); await exportCommitted('step', committed, 'redo/step');
    await button('Guardar como');
    await waitFor('actual assembly Save As bytes and IPC', async () => {
      if (dialogCounts().saves !== 1 || !ipc.some(value => value.channel === 'document:save' && value.completed)) return false;
      try { return canonical(JSON.parse(await fsp.readFile(output, 'utf8'))) === canonical(committed); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    });
    await idle('Save As completed'); await waitFor('Save As records new path without dirty marker', async () => { const ui = await committedUi(); return ui.file === 'saved.solidflow' && ui.title === expected.name; });
    const savedBytes = await fsp.readFile(output);
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Export/Save As changed the original source file.');
    before = await observe(); await button('Abrir'); event = await responseAfter(before.serial, 'build-assembly');
    check(canonical(event.document) === canonical(committed), 'Save/reopen changed source graph, names, flags or placements.');
    geometry(event.response.value, event.document); record('reopen/committed', event); await idle('reopened committed native scene'); await recovery(event.document, 'reopen');
    check((await committedUi()).undoDisabled && (await committedUi()).redoDisabled, 'Reopen did not reset local history.');
    await exportCommitted('stl', event.document, 'reopened/stl'); await capture(event.document);
    const state = await observe(); check(!consoleErrors.length && !failedRequests.length && !state.workerErrors.length, 'Renderer/worker/request failure.');
    const pending = state.assemblyUi.filter(value => value.busy && value.stepExportDisabled !== null && value.stlExportDisabled !== null);
    check(pending.length > 0 && pending.every(value => value.stepExportDisabled && value.stlExportDisabled && value.applyDisabled), 'Export/Apply available during native work.');
    check(protocolResponses.some(value => /kernel\.worker-[\w-]+\.js$/.test(value.url) && value.status === 200)
      && protocolResponses.some(value => value.url.endsWith('.wasm') && value.status === 200), 'Actual production worker/WASM loads absent.');
    const counts = dialogCounts(); check(counts.opens === 2 && counts.saves === 1 && counts.csvExports === 0 && counts.geometryExports === 7
      && ipc.every(value => value.completed), 'Unexpected native dialog/IPC count or incomplete operation.');
    check(digest(await fsp.readFile(input)) === digest(originalBytes), 'Original fixture bytes changed.');
    check(digest(await fsp.readFile(output)) === digest(savedBytes), 'Reopened export changed saved source bytes.');
    Object.assign(evidence, { savedSha256: digest(savedBytes), finalDocument: committed,
      independentOracles: '7 active box solids including 3 hidden; coincident solid multiplicity2; V780 mm^3/A892 mm^2; bounds[6,-2,-8]..[53,11,5]; STEP fresh native reader valid BReps/per-solid V/A/bounds1e-6; binary STL84facets/4284bytes/corners/outward normals/winding/per-face multiplicity/per-solid and total V/A/bounds1e-6.',
      limits: 'Flat placed geometry only. Scripted controls, actual production preload/worker/IPC and test-owned native-dialog paths. Independent STEP reader lives only in this test-owned child. No assembly hierarchy/mates in exports, continuous collision, human dialogs, installed package or platform generalization.' });
  };
};
