'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original GPL-3.0 recipe: the same explicit boxes/noncommuting quarter-turns
// as kernel.assembly-step-multibody-fixture.test-utils.ts, declared here so
// normal Open owns a complete JSON document without a private fixture input.
function createOriginalDocuments() {
  const stamp = '2026-10-23T00:00:00.000Z', h = Math.SQRT1_2;
  const part = (id, revision, name, size) => ({ kind: 'part', id, revision, document: {
    version: 1, id, name, units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [size[0] / 2, size[1] / 2], width: size[0], height: size[1] } },
      { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth: size[2], symmetric: false,
        suppressed: false, bodyOperation: { mode: 'new', bodyId: 'box' } } ] } });
  const occurrence = (id, definition, rotation = [0, 0, 0, 1], translation = [0, 0, 0]) => ({ id, name: id,
    definition: { id: definition.id, revision: definition.revision }, pose: { rotation, translation }, fixed: false, suppressed: false, visible: true });
  const p = part('structure-part-P', 'p-r1', 'Pieza "gemela" ñ', [2, 3, 4]);
  p.document.features.push({ id: 'second-profile', name: 'Original offset rectangle', type: 'sketch', plane: 'XY', offset: 0,
    suppressed: false, profile: { kind: 'rectangle', center: [10.5, 1], width: 1, height: 2 } },
  { id: 'second-solid', name: 'Original disjoint prism', type: 'extrude', sketchId: 'second-profile', depth: 5,
    symmetric: false, suppressed: false, bodyOperation: { mode: 'new', bodyId: 'second-box' } });
  const q = part('structure-part-Q', 'q-r2', 'Pieza "gemela" ñ', [2, 3, 4]);
  const c = part('structure-part-C', 'c-r1', 'Pieza distinta Ω', [1, 2, 5]);
  const s = { kind: 'assembly', id: 'structure-S', revision: 's-r1', name: 'Módulo "S" ñ', createdAt: stamp, updatedAt: stamp,
    mates: [], occurrences: [occurrence('a', p), occurrence('b', q, [h, 0, 0, h], [10, 0, 0]), occurrence('c', c, [0, 0, h, h], [0, 10, 0])] };
  const g = { kind: 'assembly', id: 'structure-G', revision: 'g-r1', name: 'Grupo "G" Ω', createdAt: stamp, updatedAt: stamp,
    mates: [], occurrences: [occurrence('s', s, [0, h, 0, h], [0, 0, 20])] };
  return { assembly: { version: 2, kind: 'assembly', id: 'structure-root', revision: 'root-r1', name: 'Conjunto "Árbol" Ω', units: 'mm',
    createdAt: stamp, updatedAt: stamp, definitions: [p, q, c, s, g], mates: [],
    occurrences: [occurrence('left', g, [0, 0, h, h], [100, 0, 0]), occurrence('right', g, [h, 0, 0, h], [0, 100, 0])] }, part: structuredClone(q.document) };
}

// These eight world boxes are literal hand-derived quarter-turn results. No
// parser, exporter, imported document or scene supplies their expected values.
const BOXES = [
  [[97, 0, 18], [100, 4, 20], 24, 52], [[98, 0, 9], [100, 5, 10], 10, 34],
  [[100, 0, 8], [104, 3, 10], 24, 52], [[89, 0, 20], [90, 5, 22], 10, 34],
  [[0, 80, 0], [4, 82, 3], 24, 52], [[0, 90, 0], [5, 91, 2], 10, 34],
  [[0, 90, -4], [3, 92, 0], 24, 52], [[0, 78, 10], [5, 80, 11], 10, 34],
];

module.exports = function structuralStepWorkflow(context) {
  const { expected, input, output, structuralFiles, evaluate, observe, waitFor, click, menu, checks, check, canonical, digest,
    ipc, protocolResponses, consoleErrors, failedRequests, initialReadyMs, dialogCounts } = context;
  const IMPORT = 'button[aria-label="Importar STEP estructurado"]', EXPORT = 'button[aria-label="Exportar STEP estructurado del ensamblaje"]';
  const phases = [], exports = [], evidence = { scenario: 'original-structural-step-editor', phases, exports }; checks.push(evidence);
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); check(typeof json === 'string', 'Explicit serializable page data required.');
    return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (a, b, label, band = 1e-6) => check(Number.isFinite(a) && Math.abs(a - b) <= band, label + ': actual=' + a + ', expected=' + b);
  const vector = (a, b, label) => { check(Array.isArray(a) && a.length === b.length, label + ' dimensions'); a.forEach((v, i) => near(v, b[i], label + '[' + i + ']')); };
  const samePose = (a, b, label) => { vector(a.translation, b.translation, label + ' translation');
    check(Math.min(Math.hypot(...a.rotation.map((v, i) => v - b.rotation[i])), Math.hypot(...a.rotation.map((v, i) => v + b.rotation[i]))) <= 1e-10, label + ' proper rotation'); };
  function graphDocument(doc, imported) {
    check(doc.version === 2 && doc.kind === 'assembly' && doc.name === expected.name && doc.units === 'mm' && doc.mates.length === 0,
      'Actual v2 root retains Unicode/quoted name, millimetres and no fabricated mates.');
    check(doc.definitions.length === 5 && doc.definitions.filter(d => d.kind === 'part').length === 3, 'Exactly 3 part identities and 2 reused assembly definitions.');
    const find = (owner, name) => { const uses = owner.occurrences.filter(o => o.name === name); check(uses.length === 1, 'Exact original occurrence name ' + name); return uses[0]; };
    const def = use => { const ds = doc.definitions.filter(d => d.id === use.definition.id && d.revision === use.definition.revision); check(ds.length === 1, 'Exact unique definition tuple.'); return ds[0]; };
    const left = find(doc, 'left'), right = find(doc, 'right'); check(doc.occurrences.length === 2 && canonical(left.definition) === canonical(right.definition), 'Two roots reuse one G definition.');
    const g = def(left), su = find(g, 's'), s = def(su); check(g.kind === 'assembly' && g.occurrences.length === 1 && s.kind === 'assembly' && s.occurrences.length === 3, 'Original nested G/S boundaries survive.');
    const roles = ['a', 'b', 'c'].map(n => find(s, n)), [p, q, c] = roles.map(def);
    check(p.id !== q.id && p.document.name === q.document.name && p.document.name === 'Pieza "gemela" ñ' && c.document.name === 'Pieza distinta Ω', 'Same-name P/Q stay distinct products; Unicode names survive actual interchange.');
    const original = createOriginalDocuments().assembly, og = original.definitions.find(d => d.id === 'structure-G'), os = original.definitions.find(d => d.id === 'structure-S');
    [[left, original.occurrences[0]], [right, original.occurrences[1]], [su, og.occurrences[0]], ...roles.map((r, i) => [r, os.occurrences[i]])].forEach(([a, b], i) => samePose(a.pose, b.pose, 'Independent local pose ' + i));
    check([g, s].every(d => d.mates.length === 0), 'No nested mate is inferred.');
    if (imported) {
      check([left, right, su, ...roles].every(o => !o.fixed && !o.suppressed && o.visible), 'New neutral instances are active, visible and unfixed.');
      check(p.document.features.length === 1 && p.document.features[0].type === 'importedBodies' && p.document.features[0].bodies.length === 2,
        'ONE P product owns ONE importedBodies producer with TWO bodies.');
      check([q, c].every(d => d.document.features.length === 1 && d.document.features[0].type === 'importedSolid'), 'Single-solid Q/C retain single base representation.');
      for (const d of [p, q, c]) for (const f of d.document.features) for (const source of f.type === 'importedBodies' ? f.bodies.map(b => b.source) : [f.source]) {
        const bytes = Buffer.from(source.data, 'base64'); check(source.format === 'step' && source.encoding === 'base64' && bytes.toString('base64') === source.data && digest(bytes) === source.sha256, 'Every reopened base owns exact canonical STEP bytes/SHA.');
      }
      check(!canonical(doc).includes(structuralFiles.exported) && !canonical(doc).includes(structuralFiles.part), 'No neutral path or runtime grant is saved in the imported graph.');
    }
    return { p: p.id, q: q.id, c: c.id };
  }
  function geometry(scene, doc, label) {
    check(scene?.kind === 'assembly-scene' && scene.solidCount === 8 && scene.bodies.length === 8 && scene.prototypeCount === 3,
      label + ': 8 actual placed bodies, 3 part prototypes and retained multibody product.');
    near(scene.volume, 136, label + ' native aggregate V'); near(scene.area, 344, label + ' native aggregate BRep A');
    vector(scene.bounds.min, [0, 0, -4], label + ' world min'); vector(scene.bounds.max, [104, 92, 22], label + ' world max');
    const remaining = BOXES.map((box, index) => ({ box, index })); let meshArea = 0;
    for (const b of scene.bodies) {
      const matches = remaining.filter(({ box }) => box[0].every((v, i) => Math.abs(v - b.bounds.min[i]) <= 1e-6) && box[1].every((v, i) => Math.abs(v - b.bounds.max[i]) <= 1e-6));
      check(matches.length === 1 && b.solidCount === 1 && b.visible, label + ': unique literal placed box bounds, valid one-solid body.');
      const { box } = matches[0]; remaining.splice(remaining.indexOf(matches[0]), 1); near(b.volume, box[2], label + ' per-body native V'); near(b.area, box[3], label + ' per-body native BRep A');
      near(b.meshAreaMm2, box[3], label + ' independent planar mesh area'); meshArea += b.meshAreaMm2;
    }
    check(remaining.length === 0, label + ' all eight independent placements present'); near(meshArea, 344, label + ' total planar mesh area');
    graphDocument(doc, doc.id !== expected.id);
  }
  async function state() { return page(() => ({ recovery: localStorage.getItem('solidflow.autosave'), title: document.querySelector('.assembly-header > strong')?.textContent,
    file: document.querySelector('.assembly-file')?.textContent, undo: document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled,
    redo: document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled, apply: document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled,
    cancel: document.querySelector('button[aria-label="Cancelar vista previa del ensamblaje"]')?.disabled })); }
  async function idle(label) { await waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
    && !document.querySelector('.assembly-spinner') && document.querySelector('button[aria-label="Exportar STEP estructurado del ensamblaje"]')?.disabled === false)); }
  async function responseAfter(serial, action, ok = true) { return waitFor('actual ' + action, async () => { const es = (await observe()).assemblies.filter(e => e.serial > serial && e.action === action);
    check(es.length <= 1, 'No duplicate ' + action); const e = es[0]; if (!e?.response) return false;
    check(e.response.ok === ok, e.response.error || action + ' unexpected status'); return e; }); }
  async function builtAfter(serial, label, imported) {
    const event = await responseAfter(serial, 'build-assembly'); geometry(event.response.value, event.document, label); graphDocument(event.document, imported);
    await idle(label); await waitFor(label + ' exact committed recovery', async () => { const ui = await state(); return ui.recovery && canonical(JSON.parse(ui.recovery)) === canonical(event.document); });
    phases.push({ phase: label, serial: event.serial, documentSha256: digest(canonical(event.document)), scene: event.response.value }); return event.document;
  }
  async function button(label) { await page(label => { const bs = [...document.querySelectorAll('.assembly-toolbar button')].filter(b => b.textContent.trim() === label);
    if (bs.length !== 1 || bs[0].disabled) throw Error('Exact enabled toolbar action missing: ' + label); bs[0].click(); }, label); }
  async function confirmReplacement(part = false) {
    await waitFor('actual discard confirmation', () => page(part => !!document.querySelector(part ? '[role="dialog"][aria-labelledby="discard-title"]' : '[role="dialog"][aria-label="Cambios sin guardar"]'), part));
    await page(part => { const dialog = document.querySelector(part ? '[role="dialog"][aria-labelledby="discard-title"]' : '[role="dialog"][aria-label="Cambios sin guardar"]');
      const bs = [...dialog.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Continuar sin guardar'); if (bs.length !== 1 || bs[0].disabled) throw Error('Actual discard action absent.'); bs[0].click(); }, part);
  }
  async function noReplacementDialog(label) {
    check(await page(() => !document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')
      && !document.querySelector('[role="dialog"][aria-label="Cambios sin guardar"]')), label + ': clean document replacement requires no discard dialog.');
  }

  // The parent bundles exactly four fixed pure source modules with the declared
  // Vite dependency into this token-owned directory. No source compilation or
  // generic loader runs in the child. It reads actual exported disk bytes;
  // literal graph/pose/count and fresh BRep checks supply independent oracles.
  const { readStepAssemblyStructure } = require(path.join(path.dirname(input), 'structure-reader.cjs'));
  check(typeof readStepAssemblyStructure === 'function', 'Fixed test-owned structural reader is present.');
  function writtenGraph(bytes) {
    const graph = readStepAssemblyStructure(new Uint8Array(bytes));
    check(graph.definitions.length === 6 && graph.definitions.filter(d => d.kind === 'part').length === 3 && graph.definitions.filter(d => d.kind === 'assembly').length === 3,
      'Actual disk STEP graph has six products including its root, not one product per placed body.');
    const root = graph.definitions.find(d => d.id === graph.root), g = graph.definitions.find(d => d.id === root.occurrences[0].definition);
    check(root.name === expected.name && root.occurrences.length === 2 && new Set(root.occurrences.map(o => o.definition)).size === 1 && g.occurrences.length === 1, 'Actual exported root reuses G and preserves Unicode root name.');
    const s = graph.definitions.find(d => d.id === g.occurrences[0].definition), parts = s.occurrences.map(o => graph.definitions.find(d => d.id === o.definition));
    check(s.occurrences.length === 3 && new Set(parts.map(d => d.id)).size === 3 && canonical(parts.map(d => d.solids.length).sort()) === canonical([1, 1, 2]), 'Actual S uses three distinct parts, exactly ONE multibody product.');
    check(parts.filter(d => d.name === 'Pieza "gemela" ñ').length === 2 && parts.find(d => d.name === 'Pieza distinta Ω'), 'Actual file preserves duplicate names without identity merging.');
    check(graph.definitions.reduce((n, d) => n + d.occurrences.length, 0) === 6 && graph.definitions.reduce((n, d) => n + d.solids.length, 0) === 4, 'Six actual uses and four source-local solid entities produce eight placed bodies.');
    return graph;
  }
  let nativeRuntime;
  async function nativeGeometry(bytes, index) {
    nativeRuntime ??= require('replicad-opencascadejs')({ wasmBinary: await fsp.readFile(require.resolve('replicad-opencascadejs/wasm')), print: () => undefined });
    const oc = await nativeRuntime, owners = [], cleanup = [], file = '/desktop-structure-' + index + '.step';
    const own = x => { owners.push(x); return x; }; let primary, result;
    try {
      own({ delete: () => { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
      const reader = own(new oc.STEPControl_Reader()); check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Separate native reader accepts actual disk STEP.'); reader.SetSystemLengthUnit(1);
      const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'Separate native transfer completes all actual roots.');
      const shape = own(reader.OneShape()), valid = own(new oc.BRepCheck_Analyzer(shape, true, false, false)); check(!shape.IsNull() && valid.IsValid(), 'Fresh exported aggregate BRep is valid.');
      const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), remaining = [...BOXES], solids = []; let volume = 0, area = 0;
      while (explorer.More()) {
        check(solids.length < 8, 'No extra exported placed solid.'); const solid = own(explorer.Current()), good = own(new oc.BRepCheck_Analyzer(solid, true, false, false)); check(good.IsValid(), 'Fresh individual BRep valid.');
        const mass = own(new oc.GProp_GProps()), surface = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box());
        oc.BRepGProp.VolumeProperties(solid, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, surface, false, false); oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
        const min = [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max = [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()];
        const matches = remaining.filter(b => b[0].every((v, i) => Math.abs(v - min[i]) <= 1e-6) && b[1].every((v, i) => Math.abs(v - max[i]) <= 1e-6));
        check(matches.length === 1, 'Actual disk STEP body matches one independent literal placement.'); const box = matches[0]; remaining.splice(remaining.indexOf(box), 1);
        near(mass.Mass(), box[2], 'Fresh STEP native body V'); near(surface.Mass(), box[3], 'Fresh STEP native BRep body A'); volume += mass.Mass(); area += surface.Mass();
        solids.push({ min, max, volume: mass.Mass(), area: surface.Mass() }); explorer.Next();
      }
      check(solids.length === 8 && remaining.length === 0, 'Actual disk STEP retains eight valid solids.'); near(volume, 136, 'Fresh STEP native total V'); near(area, 344, 'Fresh STEP native total BRep A'); result = { solids, volume, area };
    } catch (error) { primary = error; } finally { for (const owner of owners.reverse()) { try { owner.delete(); } catch (error) { cleanup.push(error); } } }
    if (primary || cleanup.length) throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Independent STEP reading or cleanup failed.', { cause: primary ?? cleanup[0] }); return result;
  }
  async function exportCurrent(document, label, canceled = false) {
    await idle(label); const beforeUi = await state(), serial = (await observe()).serial, count = dialogCounts().geometryExports;
    check(beforeUi.apply && beforeUi.cancel, 'Only committed geometry is exported.'); await click(EXPORT);
    const event = await responseAfter(serial, 'export-assembly-step'); check(canonical(event.document) === canonical(document) && !event.hasToken, 'Structured export receives exact committed document without Apply authority.');
    check(Object.keys(event.response.value).sort().join(',') === 'size,type' && event.response.value.type === 'application/step' && event.response.value.size > 0, 'Actual export response is only Blob metadata.');
    await waitFor(label + ' actual export IPC complete', () => dialogCounts().geometryExports === count + 1 && ipc.filter(e => e.channel === 'document:export' && e.completed).length === count + 1); await idle(label + ' finished');
    check(canonical(await state()) === canonical(beforeUi), 'Export/dialog Cancel preserves committed recovery, path, title and history.');
    let actual = null;
    if (canceled) check(!fs.existsSync(structuralFiles.canceled), 'Canceled export creates no file.');
    else { const file = count === 1 ? structuralFiles.exported : structuralFiles.reexported, bytes = await fsp.readFile(file), transport = ipc.filter(e => e.channel === 'document:export').at(-1).geometry;
      check(bytes.length === event.response.value.size && transport.format === 'step' && transport.bytes === bytes.length && transport.sha256 === digest(bytes), 'Actual disk STEP matches production IPC bytes and ordinary STEP extension.');
      actual = { name: path.basename(file), bytes: bytes.length, sha256: digest(bytes), graph: writtenGraph(bytes), native: await nativeGeometry(bytes, count) }; }
    exports.push({ label, serial: event.serial, canceled, actual });
  }
  async function assemblyImport(mode, document) {
    await idle('structural import readiness'); const before = await state(), serial = (await observe()).serial, count = dialogCounts().stepImports;
    await click(IMPORT); await waitFor('actual readonly STEP picker', () => dialogCounts().stepImports === count + 1 && ipc.filter(e => e.channel === 'document:import-step' && e.completed).length === count + 1);
    if (mode === 'cancel') { await idle('canceled import idle'); check((await observe()).serial === serial && canonical(await state()) === canonical(before), 'Canceled import does no worker work and preserves exact committed state.'); return document; }
    const event = await responseAfter(serial, 'import-assembly-step', mode !== 'reject'); check(!event.hasToken, 'Structural import publishes no Apply capability.');
    if (mode === 'reject') { await idle('rejected structural input idle'); check(typeof event.response.error === 'string' && event.response.error.length > 0 && canonical(await state()) === canonical(before), 'Malformed native STEP rejects without publishing/replacing document, path, recovery or history.');
      phases.push({ phase: 'assembly/import-rejected', serial: event.serial, error: event.response.error }); return document; }
    graphDocument(event.response.value, true);
    const dirty = before.title.endsWith(' *');
    if (dirty) await confirmReplacement();
    const result = await builtAfter(serial, 'assembly/import-success', true);
    if (!dirty) await noReplacementDialog('clean assembly structural import');
    check(canonical(result) === canonical(event.response.value), 'Prepared actual importer output becomes exact committed build input.');
    const ui = await state(); check(ui.file === 'Sin guardar' && ui.title.endsWith(' *') && ui.undo && ui.redo && ui.apply && ui.cancel, 'Successful structural replacement clears file authority/history and remains unsaved without Apply token.'); return result;
  }
  return async () => {
    const original = await fsp.readFile(input); graphDocument(expected, false);
    await waitFor('actual initial production part readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.importStep === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]'); await confirmReplacement(true);
    let committed = await builtAfter(serial, 'original/open', false); check(canonical(committed) === canonical(expected), 'Open uses the exact original authored fixture.');
    await exportCurrent(committed, 'original/export-cancel', true); await exportCurrent(committed, 'original/export');
    committed = await assemblyImport('cancel', committed); committed = await assemblyImport('reject', committed); committed = await assemblyImport('success', committed);
    // Open a normal original v1 part through the real dialog, then exercise its
    // explicit menu import with the actual previously exported neutral bytes.
    const partSerial = (await observe()).serial;
    await button('Abrir'); await confirmReplacement(); await waitFor('actual original v1 part workspace', async () => {
      const builds = (await observe()).builds.filter(e => e.serial > partSerial && canonical(e.features) === canonical(createOriginalDocuments().part.features));
      if (!builds.at(-1)?.response) return false;
      check(builds.at(-1).response.ok, 'Original part actually builds before its structural import.');
      return page(() => !document.querySelector('.assembly-app') && document.querySelector('.statusbar')?.textContent.includes('Listo'));
    });
    const partTitle = await page(() => document.querySelector('.document-title')?.textContent ?? null);
    check(typeof partTitle === 'string' && partTitle.includes(createOriginalDocuments().part.name), 'Actual original part title supplies the pre-import dirty state.');
    const partDirty = partTitle.trimEnd().endsWith('*');
    serial = (await observe()).serial; await menu('Importar STEP estructurado…'); const imported = await responseAfter(serial, 'import-assembly-step'); graphDocument(imported.response.value, true);
    if (partDirty) await confirmReplacement(true);
    committed = await builtAfter(serial, 'part/import-success', true); check(canonical(committed) === canonical(imported.response.value), 'Part workspace commits exact actual imported graph.');
    if (!partDirty) await noReplacementDialog('clean part structural import');
    const unsaved = await state(); check(unsaved.file === 'Sin guardar' && unsaved.title.endsWith(' *') && unsaved.undo && unsaved.redo, 'Part→assembly replacement retains no neutral/part save target or old history.');
    await button('Guardar como'); await waitFor('actual structural assembly Save As', () => dialogCounts().saves === 1 && ipc.some(e => e.channel === 'document:save' && e.completed));
    await idle('actual structural Save As finished'); await waitFor('new saved path and clean title', async () => { const ui = await state(); return ui.file === path.basename(output) && ui.title === expected.name; });
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8')); check(canonical(saved) === canonical(committed), 'Save As owns exact imported graph/bases/assignments.');
    const importReads = ipc.filter(e => e.channel === 'document:import-step').length;
    await fsp.unlink(structuralFiles.exported); check(!fs.existsSync(structuralFiles.exported), 'Remove test-owned neutral input before autonomous saved reopening.');
    serial = (await observe()).serial; await button('Abrir'); committed = await builtAfter(serial, 'saved/reopen', true);
    check(canonical(committed) === canonical(saved) && ipc.filter(e => e.channel === 'document:import-step').length === importReads, 'Saved reopening preserves exact embedded sources/IDs without any neutral file read.');
    await exportCurrent(committed, 'reopened/reexport');
    check((await fsp.readFile(output)).equals(savedBytes) && (await fsp.readFile(input)).equals(original), 'Reopened structural export changes neither saved autonomous source nor original fixture bytes.');
    const counts = dialogCounts(); check(counts.opens === 3 && counts.saves === 1 && counts.stepImports === 4 && counts.geometryExports === 3 && counts.csvExports === 0, 'Exact bounded Open/Save/STEP input/export dialog counts.');
    check((await observe()).workerErrors.length === 0 && !consoleErrors.length && !failedRequests.length && ipc.every(e => e.completed), 'No worker/renderer/resource or incomplete IPC failures.');
    check(protocolResponses.some(e => /kernel\.worker-[\w-]+\.js$/.test(e.url) && e.status === 200) && protocolResponses.some(e => e.url.endsWith('.wasm') && e.status === 200), 'Real production worker/WASM loads observed.');
    Object.assign(evidence, { savedSha256: digest(savedBytes), importedDocumentSha256: digest(canonical(saved)),
      oracles: 'Eight original boxes; native V136/BRep A344 and independent planar mesh A344; all eight literal world bounds; absolute1e-6 bands. Six actual STEP products, six uses, four source-local solids, distinct same-name P/Q and P two solids in one product; separate fresh native BRep read of both actual export files.',
      limits: 'Scripted DOM and test-owned dialogs through production IPC/worker. No injected native response or document setter; no deterministic STEP bytes/revisions, arbitrary STEP dialect, human dialog, pointer, external application or platform claim. Import is replacement, not insertion or solver Apply.' });
  };
};
module.exports.createOriginalDocuments = createOriginalDocuments;
