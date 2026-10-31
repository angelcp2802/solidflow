'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
const { createOriginalDocuments: previousOriginals } = require('./desktop-assembly-step-flow.cjs');

// Reuse the accepted original P/Q/C -> S/G recipe, never a prefabricated STEP.
// New parent is an independently declared 10x6x4 box placed at X200.
function createOriginalDocuments() {
  const stamp = '2026-10-23T00:00:00.000Z', part = { kind: 'part', id: 'insertion-outside-box', revision: 'outside-r0', document: {
    version: 1, id: 'insertion-outside-box', name: 'Original outside box', units: 'mm', createdAt: stamp, updatedAt: stamp, features: [
      { id: 'outside-profile', name: 'Original 10x6 rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false,
        profile: { kind: 'rectangle', center: [5, 3], width: 10, height: 6 } },
      { id: 'outside-solid', name: 'Original 4mm prism', type: 'extrude', sketchId: 'outside-profile', depth: 4, symmetric: false,
        suppressed: false, bodyOperation: { mode: 'new', bodyId: 'outside' } } ] } };
  return { source: previousOriginals().assembly, parent: { version: 2, kind: 'assembly', id: 'step-insertion-parent', revision: 'parent-r0',
    name: 'Original structural insertion parent', units: 'mm', createdAt: stamp, updatedAt: stamp, definitions: [part], mates: [], occurrences: [
      { id: 'outside', name: 'outside', definition: { id: part.id, revision: part.revision }, pose: { rotation: [0, 0, 0, 1], translation: [200, 0, 0] },
        fixed: true, suppressed: false, visible: true } ] } };
}
// Independent literal world placements from the original quarter rotations.
const BOXES = [
  [[97, 0, 18], [100, 4, 20], 24, 52], [[98, 0, 9], [100, 5, 10], 10, 34],
  [[100, 0, 8], [104, 3, 10], 24, 52], [[89, 0, 20], [90, 5, 22], 10, 34],
  [[0, 80, 0], [4, 82, 3], 24, 52], [[0, 90, 0], [5, 91, 2], 10, 34],
  [[0, 90, -4], [3, 92, 0], 24, 52], [[0, 78, 10], [5, 80, 11], 10, 34],
];
const OUTSIDE = [[200, 0, 0], [210, 6, 4], 240, 248];

module.exports = function structuralStepInsertionWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { expected, input, output, insertionFiles, evaluate, observe, waitFor, click, checks, check, canonical, digest, ipc,
    protocolResponses, consoleErrors, failedRequests, initialReadyMs, dialogCounts } = context;
  const original = createOriginalDocuments(), parent = original.parent, phases = [], exports = [];
  const evidence = { scenario: 'original-direct-structural-step-insertion', phases, exports }; checks.push(evidence);
  const INSERT = 'button[aria-label="Insertar STEP estructurado"]', EXPORT = 'button[aria-label="Exportar STEP estructurado del ensamblaje"]';
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); check(typeof json === 'string', 'Expected explicitly serializable page data.');
    return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (a, b, label, band = 1e-6) => check(Number.isFinite(a) && Math.abs(a - b) <= band, label + '; actual=' + a + ', expected=' + b);
  const vector = (a, b, label) => { check(Array.isArray(a) && a.length === b.length, label + ' dimensions'); a.forEach((v, i) => near(v, b[i], label + '[' + i + ']')); };
  function samePose(a, b, label) {
    vector(a.translation, b.translation, label + ' translation');
    check(Math.min(Math.hypot(...a.rotation.map((v, i) => v - b.rotation[i])), Math.hypot(...a.rotation.map((v, i) => v + b.rotation[i]))) <= 1e-10, label + ' rotation');
  }
  const definition = (doc, ref) => { const all = doc.definitions.filter(d => d.id === ref.id && d.revision === ref.revision); check(all.length === 1, 'Exact unique definition tuple'); return all[0]; };
  const oneUse = (owner, name) => { const all = owner.occurrences.filter(o => o.name === name); check(all.length === 1, 'Exact original occurrence ' + name); return all[0]; };
  function importedGraph(doc, source) {
    check(source.kind === 'assembly' && source.name === expected.name && source.mates.length === 0 && source.occurrences.length === 2, 'Imported root stays a distinct reusable assembly.');
    const left = oneUse(source, 'left'), right = oneUse(source, 'right');
    check(canonical(left.definition) === canonical(right.definition), 'Imported source still reuses G twice.');
    const g = definition(doc, left.definition), su = oneUse(g, 's'), s = definition(doc, su.definition);
    check(g.kind === 'assembly' && g.name === 'Grupo "G" Ω' && g.occurrences.length === 1 && s.kind === 'assembly' && s.name === 'Módulo "S" ñ' && s.occurrences.length === 3, 'G/S boundaries and Unicode names survive actual insertion.');
    const uses = ['a', 'b', 'c'].map(n => oneUse(s, n)), [p, q, c] = uses.map(u => definition(doc, u.definition));
    check(p.kind === 'part' && q.kind === 'part' && c.kind === 'part' && p.id !== q.id && p.document.name === q.document.name && p.document.name === 'Pieza "gemela" ñ', 'Distinct same-name P/Q remain two parts.');
    check(p.document.features.length === 1 && p.document.features[0].type === 'importedBodies' && p.document.features[0].bodies.length === 2,
      'One P product owns one importedBodies base and two exact source bodies.');
    check([q, c].every(d => d.document.features.length === 1 && d.document.features[0].type === 'importedSolid'), 'Q/C remain single-solid autonomous bases.');
    const og = expected.definitions.find(d => d.id === 'structure-G'), os = expected.definitions.find(d => d.id === 'structure-S');
    [[left, expected.occurrences[0]], [right, expected.occurrences[1]], [su, og.occurrences[0]], ...uses.map((u, i) => [u, os.occurrences[i]])].forEach(([a, b], i) => samePose(a.pose, b.pose, 'Literal source-local pose ' + i));
    check([source, g, s].every(d => !d.mates.length) && [left, right, su, ...uses].every(u => !u.fixed && !u.suppressed && u.visible), 'No imported mates or hidden/fixed declarations are inferred.');
    for (const d of [p, q, c]) for (const f of d.document.features) for (const sourceBytes of f.type === 'importedBodies' ? f.bodies.map(b => b.source) : [f.source]) {
      const bytes = Buffer.from(sourceBytes.data, 'base64'); check(sourceBytes.format === 'step' && sourceBytes.encoding === 'base64' && bytes.toString('base64') === sourceBytes.data && digest(bytes) === sourceBytes.sha256, 'Every inserted source owns exact canonical bytes and SHA-256.');
    }
  }
  function parentGraph(doc, copies) {
    check(doc.id === parent.id && doc.revision === parent.revision && doc.name === parent.name && doc.createdAt === parent.createdAt && doc.units === 'mm' && doc.version === 2 && !doc.mates.length, 'Insertion preserves parent identity/revision/units/relations.');
    const outside = doc.occurrences.filter(o => o.id === 'outside'); check(outside.length === 1 && canonical(outside[0]) === canonical(parent.occurrences[0]), 'Original outside occurrence pose, flags and reference remain exact.');
    check(canonical(definition(doc, outside[0].definition)) === canonical(parent.definitions[0]), 'Original outside definition/recipe remains exact.');
    check(doc.occurrences.length === copies + 1 && doc.definitions.length === (copies ? 7 : 1), 'Insertion owns one reusable source graph without body-product flattening.');
    const inserted = doc.occurrences.filter(o => o.id !== 'outside'); check(new Set(doc.occurrences.map(o => o.id)).size === doc.occurrences.length, 'All root occurrence IDs remain distinct.');
    for (const use of inserted) {
      check(use.name === expected.name && !use.fixed && !use.suppressed && use.visible && canonical(use.pose) === canonical({ rotation: [0, 0, 0, 1], translation: [0, 0, 0] }), 'Fresh visible/unfixed source occurrence has identity local pose.');
      importedGraph(doc, definition(doc, use.definition));
    }
    if (copies === 2) check(canonical(inserted[0].definition) === canonical(inserted[1].definition), 'Second occurrence reuses the EXACT accepted source tuple; it is not a new neutral import.');
    check(!canonical(doc).includes(insertionFiles.exported) && !canonical(doc).includes(insertionFiles.parent), 'No runtime neutral/parent path enters the saved graph.');
    return inserted;
  }
  function expectedBoxes(copies) { return copies === -1 ? BOXES.map(b => ({ box: b, count: 1 })) : [{ box: OUTSIDE, count: 1 }, ...BOXES.map(b => ({ box: b, count: copies }))].filter(g => g.count); }
  function geometry(scene, doc, copies, label) {
    const count = copies === -1 ? 8 : 1 + 8 * copies, volume = copies === -1 ? 136 : 240 + 136 * copies, area = copies === -1 ? 344 : 248 + 344 * copies;
    check(scene?.kind === 'assembly-scene' && scene.bodies.length === count && scene.solidCount === count && scene.prototypeCount === (copies === -1 ? 3 : copies ? 4 : 1), label + ': exact actual body/solid/prototype counts.');
    near(scene.volume, volume, label + ' native total V'); near(scene.area, area, label + ' native total BRep A');
    vector(scene.bounds.min, copies === 0 ? OUTSIDE[0] : [0, 0, -4], label + ' native minimum'); vector(scene.bounds.max, copies === -1 ? [104, 92, 22] : copies === 0 ? OUTSIDE[1] : [210, 92, 22], label + ' native maximum');
    const remaining = expectedBoxes(copies), identities = new Set(), roots = new Map(); let meshArea = 0;
    for (const body of scene.bodies) {
      const matches = remaining.filter(({ box, count }) => count > 0 && box[0].every((v, i) => Math.abs(v - body.bounds.min[i]) <= 1e-6) && box[1].every((v, i) => Math.abs(v - body.bounds.max[i]) <= 1e-6));
      check(matches.length === 1 && body.solidCount === 1 && body.visible, label + ': one literal valid material body placement.'); const group = matches[0]; group.count--;
      near(body.volume, group.box[2], label + ' per-body native V'); near(body.area, group.box[3], label + ' per-body native BRep A'); near(body.meshAreaMm2, group.box[3], label + ' independent planar mesh A'); meshArea += body.meshAreaMm2;
      const key = canonical([body.component, body.body]); check(!identities.has(key), label + ': no repeated native occurrence/body identity.'); identities.add(key);
      const root = body.component.occurrencePath[0]; roots.set(root, (roots.get(root) ?? 0) + 1);
    }
    check(remaining.every(g => g.count === 0), label + ': all independent box multiplicities retained without Fuse.'); near(meshArea, area, label + ' total planar mesh A');
    if (copies >= 0) { const uses = parentGraph(doc, copies); check(roots.get('outside') === 1 && uses.every(use => roots.get(use.id) === 8) && roots.size === copies + 1, label + ': every inserted root owns its own eight full-path bodies.'); }
  }
  const pageState = () => page(() => ({ recovery: localStorage.getItem('solidflow.autosave'), title: document.querySelector('.assembly-shell-document > strong')?.textContent,
    file: document.querySelector('.assembly-shell-file')?.textContent, undo: document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled,
    redo: document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled, apply: document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled,
    cancel: document.querySelector('button[aria-label="Cancelar vista previa del ensamblaje"]')?.disabled }));
  async function idle(label) { await waitFor(label, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'
    && !document.querySelector('.assembly-spinner') && document.querySelector('button[aria-label="Insertar STEP estructurado"]')?.disabled === false
    && document.querySelector('button[aria-label="Exportar STEP estructurado del ensamblaje"]')?.disabled === false)); }
  async function responseAfter(serial, action, ok = true) { return waitFor('actual ' + action, async () => { const events = (await observe()).assemblies.filter(e => e.serial > serial && e.action === action); check(events.length <= 1, 'No duplicate ' + action);
    if (!events[0]?.response) return false; check(events[0].response.ok === ok, events[0].response.error || 'Unexpected action status'); return events[0]; }); }
  async function builtAfter(serial, copies, label) {
    const event = await responseAfter(serial, 'build-assembly'); geometry(event.response.value, event.document, copies, label); await idle(label);
    await waitFor(label + ' exact recovery', async () => { const ui = await pageState(); return ui.recovery && canonical(JSON.parse(ui.recovery)) === canonical(event.document); });
    phases.push({ phase: label, serial: event.serial, documentSha256: digest(canonical(event.document)), scene: event.response.value }); return event.document;
  }
  async function button(label) { await assemblyNavigation.button(label, ':is(.assembly-toolbar, .assembly-quickbar)'); await page(label => { const buttons = [...document.querySelectorAll(':is(.assembly-toolbar, .assembly-quickbar) button')].filter(b => b.textContent.trim() === label);
    if (buttons.length !== 1 || buttons[0].disabled) throw Error('Exact enabled toolbar button absent: ' + label); buttons[0].click(); }, label); }
  async function confirmInitialPart() {
    await waitFor('initial part discard confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await page(() => { const bs = [...document.querySelectorAll('[role="dialog"][aria-labelledby="discard-title"] button')].filter(b => b.textContent.trim() === 'Continuar sin guardar'); if (bs.length !== 1 || bs[0].disabled) throw Error('Exact initial discard button absent.'); bs[0].click(); });
  }
  async function noDiscard(label) { check(await page(() => !document.querySelector('[role="dialog"][aria-labelledby="discard-title"]') && !document.querySelector('[role="dialog"][aria-label="Cambios sin guardar"]')), label + ': insertion is an ordinary edit without document replacement confirmation.'); }

  // Same fixed four-module Vite bundle prepared by the shared parent harness;
  // actual disk STEP is parsed here, never supplied as an observer sidecar.
  const { readStepAssemblyStructure } = require(path.join(path.dirname(input), 'structure-reader.cjs'));
  function graph(bytes, copies) {
    const value = readStepAssemblyStructure(new Uint8Array(bytes)), root = value.definitions.find(d => d.id === value.root);
    const parts = value.definitions.filter(d => d.kind === 'part');
    check(value.definitions.length === (copies === -1 ? 6 : 8) && parts.length === (copies === -1 ? 3 : 4), 'Actual written graph retains all product identities.');
    check(canonical(parts.map(d => d.solids.length).sort()) === canonical(copies === -1 ? [1, 1, 2] : [1, 1, 1, 2]), 'Exactly one native multibody product, no body product splitting.');
    check(parts.filter(d => d.name === 'Pieza "gemela" ñ').length === 2 && parts.some(d => d.name === 'Pieza distinta Ω'), 'Actual STEP duplicate/Unicode product names stay distinct.');
    let source = root;
    if (copies !== -1) {
      check(root.name === parent.name && root.occurrences.length === 3, 'Actual reexport root owns outside plus two instances.');
      const uses = root.occurrences.filter(o => o.name === expected.name); check(uses.length === 2 && uses[0].definition === uses[1].definition, 'Actual disk graph reuses ONE accepted source root twice.'); source = value.definitions.find(d => d.id === uses[0].definition);
      check(root.occurrences.filter(o => o.name === 'outside').length === 1, 'Original outside product remains in the real output.');
    }
    check(source.name === expected.name && source.occurrences.length === 2 && source.occurrences[0].definition === source.occurrences[1].definition, 'Actual source product retains reused G boundary.');
    const g = value.definitions.find(d => d.id === source.occurrences[0].definition); check(g.occurrences.length === 1, 'Actual G contains one S.');
    const s = value.definitions.find(d => d.id === g.occurrences[0].definition); check(s.occurrences.length === 3 && new Set(s.occurrences.map(o => o.definition)).size === 3, 'Actual S uses three separate part identities.');
    check(value.definitions.reduce((n, d) => n + d.occurrences.length, 0) === (copies === -1 ? 6 : 9), 'Exact written product-instance incidence count.'); return value;
  }
  let nativeRuntime;
  async function nativeOutput(bytes, copies, index) {
    nativeRuntime ??= require('replicad-opencascadejs')({ wasmBinary: await fsp.readFile(require.resolve('replicad-opencascadejs/wasm')), print: () => undefined });
    const oc = await nativeRuntime, owners = [], cleanup = [], file = '/desktop-insertion-export-' + index + '.step'; const own = v => { owners.push(v); return v; }; let primary, result;
    try {
      own({ delete() { if (oc.FS.readdir('/').includes(file.slice(1))) oc.FS.unlink(file); } }); oc.FS.writeFile(file, bytes);
      const reader = own(new oc.STEPControl_Reader()); check(reader.ReadFile(file) === oc.IFSelect_ReturnStatus.IFSelect_RetDone, 'Fresh native reader accepts actual export.'); reader.SetSystemLengthUnit(1);
      const roots = reader.NbRootsForTransfer(); check(roots > 0 && reader.TransferRoots() === roots, 'Actual disk STEP transfers all roots.'); const shape = own(reader.OneShape()), good = own(new oc.BRepCheck_Analyzer(shape, true, false, false)); check(!shape.IsNull() && good.IsValid(), 'Actual native aggregate BRep valid.');
      const explorer = own(new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)), remaining = expectedBoxes(copies), solids = []; let volume = 0, area = 0;
      while (explorer.More()) {
        check(solids.length < (copies === -1 ? 8 : 17), 'No extra output solid.'); const solid = own(explorer.Current()), valid = own(new oc.BRepCheck_Analyzer(solid, true, false, false)); check(valid.IsValid(), 'Individual actual exported BRep valid.');
        const mass = own(new oc.GProp_GProps()), surface = own(new oc.GProp_GProps()), bounds = own(new oc.Bnd_Box()); oc.BRepGProp.VolumeProperties(solid, mass, 1e-10, false, false); oc.BRepGProp.SurfaceProperties(solid, surface, false, false); oc.BRepBndLib.AddOptimal(solid, bounds, false, false);
        const min = [bounds.GetXMin(), bounds.GetYMin(), bounds.GetZMin()], max = [bounds.GetXMax(), bounds.GetYMax(), bounds.GetZMax()];
        const matches = remaining.filter(g => g.count > 0 && g.box[0].every((v, i) => Math.abs(v - min[i]) <= 1e-6) && g.box[1].every((v, i) => Math.abs(v - max[i]) <= 1e-6)); check(matches.length === 1, 'Actual exported solid belongs to one literal box group.'); const g = matches[0]; g.count--;
        near(mass.Mass(), g.box[2], 'Fresh output BRep volume'); near(surface.Mass(), g.box[3], 'Fresh output BRep area'); volume += mass.Mass(); area += surface.Mass(); solids.push({ min, max, volume: mass.Mass(), area: surface.Mass() }); explorer.Next();
      }
      check(remaining.every(g => g.count === 0) && solids.length === (copies === -1 ? 8 : 17), 'All output body multiplicities retained including coincident separate occurrences.');
      near(volume, copies === -1 ? 136 : 512, 'Fresh output total V'); near(area, copies === -1 ? 344 : 936, 'Fresh output total BRep A'); result = { solids, volume, area };
    } catch (error) { primary = error; } finally { for (const owner of owners.reverse()) try { owner.delete(); } catch (error) { cleanup.push(error); } }
    if (primary || cleanup.length) throw new AggregateError(primary ? [primary, ...cleanup] : cleanup, 'Fresh STEP reading or cleanup failed.', { cause: primary ?? cleanup[0] }); return result;
  }
  async function exportCurrent(doc, copies, label) {
    await idle(label); const before = await pageState(), serial = (await observe()).serial, count = dialogCounts().geometryExports; await click(EXPORT);
    const event = await responseAfter(serial, 'export-assembly-step'); check(canonical(event.document) === canonical(doc) && !event.hasToken && event.response.value.type === 'application/step' && event.response.value.size > 0, 'Read-only export receives exact committed snapshot and actual STEP Blob.');
    await waitFor(label + ' real export IPC', () => dialogCounts().geometryExports === count + 1 && ipc.filter(e => e.channel === 'document:export' && e.completed).length === count + 1); await idle(label + ' export idle');
    check(canonical(await pageState()) === canonical(before), 'Export preserves recovery, path, saved and history state.');
    const file = count === 0 ? insertionFiles.exported : insertionFiles.reexported, bytes = await fsp.readFile(file), transport = ipc.filter(e => e.channel === 'document:export').at(-1).geometry;
    check(transport.format === 'step' && transport.name === doc.name && transport.bytes === bytes.length && event.response.value.size === bytes.length && transport.sha256 === digest(bytes), 'Actual disk export matches the production STEP write byte view.');
    exports.push({ label, serial: event.serial, bytes: bytes.length, sha256: digest(bytes), graph: graph(bytes, copies), native: await nativeOutput(bytes, copies, count) });
  }
  async function insertion(mode, doc) {
    await idle('insert readiness'); const before = await pageState(), serial = (await observe()).serial, count = dialogCounts().stepImports;
    await click(INSERT); await waitFor('actual readonly insertion STEP picker', () => dialogCounts().stepImports === count + 1 && ipc.filter(e => e.channel === 'document:import-step' && e.completed).length === count + 1);
    if (mode === 'cancel') { await idle('insert picker canceled'); check((await observe()).serial === serial && canonical(await pageState()) === canonical(before), 'Canceled insertion performs no native work or history/recovery/path mutation.'); await noDiscard('picker cancel'); return doc; }
    const event = await responseAfter(serial, 'insert-assembly-step', mode !== 'reject'); check(canonical(event.current) === canonical(doc) && !event.hasToken
      && canonical(event.scope) === canonical({ id: doc.id, revision: doc.revision }), 'Insertion binds the exact parent and root scope without Apply authority.');
    const sourceBytes = await fsp.readFile(mode === 'reject' ? insertionFiles.malformed : insertionFiles.exported);
    check(event.source.format === 'step' && event.source.encoding === 'base64' && event.source.sha256 === digest(sourceBytes)
      && Buffer.from(event.source.data, 'base64').equals(sourceBytes), 'Actual worker receives the exact owned dialog-selected STEP bytes.');
    if (mode === 'reject') { await idle('malformed insertion rejected'); check(typeof event.response.error === 'string' && event.response.error.length > 0 && canonical(await pageState()) === canonical(before), 'Malformed STEP inserts nothing and preserves exact history/recovery/file identity.'); await noDiscard('malformed rejection'); phases.push({ phase: 'insert/rejected-malformed', serial: event.serial, error: event.response.error }); return doc; }
    parentGraph(event.response.value, 1); const candidate = await builtAfter(serial, 1, 'insert/committed'); check(canonical(candidate) === canonical(event.response.value), 'Actual fully prepared native candidate is the exact ordinary committed edit.');
    const ui = await pageState(); check(ui.file === path.basename(insertionFiles.parent) && ui.title === parent.name + ' *' && ui.undo === false && ui.redo && ui.apply && ui.cancel, 'Insertion keeps saved parent path/baseline, creates one history step and no Apply preview.'); await noDiscard('successful insertion'); return candidate;
  }
  async function history(action, wanted, copies, label) {
    const serial = (await observe()).serial; await click('button[aria-label="' + (action === 'undo' ? 'Deshacer ensamblaje' : 'Rehacer ensamblaje') + '"]');
    const actual = await builtAfter(serial, copies, label); check(canonical(actual) === canonical(wanted), label + ': restores exact graph, IDs, sources, poses and timestamps.'); return actual;
  }
  return async () => {
    const sourceBytes = await fsp.readFile(input), parentBytes = await fsp.readFile(insertionFiles.parent);
    check(canonical(expected) === canonical(original.source), 'Source is the original public recipe, not prebuilt neutral data.');
    await waitFor('initial production part readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.importStep === 'function'), initialReadyMs);
    let serial = (await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]'); await confirmInitialPart(); let doc = await builtAfter(serial, -1, 'source/open'); check(canonical(doc) === canonical(expected), 'Real Open retains exact original source assembly.');
    await exportCurrent(doc, -1, 'source/structured-export');
    serial = (await observe()).serial; await button('Abrir'); doc = await builtAfter(serial, 0, 'parent/open'); check(canonical(doc) === canonical(parent), 'Original saved parent is opened independently.');
    const clean = await pageState(); check(clean.file === path.basename(insertionFiles.parent) && clean.title === parent.name && clean.undo && clean.redo && clean.apply && clean.cancel, 'Saved parent has clean baseline/path and empty history.');
    doc = await insertion('cancel', doc); doc = await insertion('reject', doc); const once = await insertion('success', doc);
    doc = await history('undo', parent, 0, 'insert/Undo'); const undone = await pageState();
    check(undone.redo === false && canonical({ ...undone, redo: clean.redo }) === canonical(clean), 'One Undo restores exact clean parent file/recovery state, with its single insertion available for Redo.');
    doc = await history('redo', once, 1, 'insert/Redo'); const firstUse = parentGraph(doc, 1)[0];
    const key = JSON.stringify([firstUse.definition.id, firstUse.definition.revision]);
    (await assemblyNavigation.panel('components'), await page(key => { const select = document.querySelector('select[aria-label="Origen del componente"]'); if (!select || select.disabled || ![...select.options].some(o => o.value === key)) throw Error('Exact accepted cached source tuple unavailable.');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, key); select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); }, key));
    const readCount = ipc.filter(e => e.channel === 'document:import-step').length; serial = (await observe()).serial;
    (await assemblyNavigation.panel('components'), await page(() => { const bs = [...document.querySelectorAll('.assembly-section button')].filter(b => b.textContent.trim() === 'Insertar otra ocurrencia'); if (bs.length !== 1 || bs[0].disabled) throw Error('Exact enabled cached-source insertion absent.'); bs[0].click(); }));
    const twice = await builtAfter(serial, 2, 'cached-source/second-occurrence'); check(ipc.filter(e => e.channel === 'document:import-step').length === readCount && !(await observe()).assemblies.some(e => e.serial > serial && e.action === 'insert-assembly-step'), 'Second occurrence reuses accepted embedded source without any neutral file read/reimport.');
    check(canonical(twice.definitions) === canonical(once.definitions) && canonical(twice.occurrences.find(o => o.id === firstUse.id)) === canonical(firstUse), 'Second reuse preserves original accepted cache and first inserted occurrence exactly.');
    await history('undo', once, 1, 'second-occurrence/Undo'); doc = await history('redo', twice, 2, 'second-occurrence/Redo');
    await button('Guardar como'); await waitFor('actual parent Save As IPC', () => dialogCounts().saves === 1 && ipc.some(e => e.channel === 'document:save' && e.completed)); await idle('saved parent idle');
    await waitFor('parent Save As clean title/path', async () => { const ui = await pageState(); return ui.file === path.basename(output) && ui.title === parent.name; });
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8')); check(canonical(saved) === canonical(doc), 'Save As writes exact composed graph/owned sources/body IDs.');
    await fsp.unlink(insertionFiles.exported); check(!fs.existsSync(insertionFiles.exported), 'Neutral input removed before saved-parent reopening.');
    serial = (await observe()).serial; await button('Abrir'); doc = await builtAfter(serial, 2, 'saved/reopen'); check(canonical(doc) === canonical(saved) && ipc.filter(e => e.channel === 'document:import-step').length === readCount, 'Fresh saved build preserves exact autonomous sources and never consults missing STEP.');
    await exportCurrent(doc, 2, 'saved/structured-reexport');
    check((await fsp.readFile(input)).equals(sourceBytes) && (await fsp.readFile(insertionFiles.parent)).equals(parentBytes) && (await fsp.readFile(output)).equals(savedBytes), 'Source, baseline parent and reopened saved file bytes remain exact.');
    const counts = dialogCounts(); check(counts.opens === 3 && counts.saves === 1 && counts.stepImports === 3 && counts.geometryExports === 2 && counts.csvExports === 0, 'Exact bounded source/parent/saved Open, STEP insertion and export queues.');
    check((await observe()).assemblies.filter(e => e.action === 'insert-assembly-step').length === 2, 'Only malformed and successful selections issue native insertion; canceled selection and accepted-source reuse do not.');
    check((await observe()).workerErrors.length === 0 && !consoleErrors.length && !failedRequests.length && ipc.every(e => e.completed), 'No worker/renderer/resource or incomplete IPC errors.');
    check(protocolResponses.some(e => /kernel\.worker-[\w-]+\.js$/.test(e.url) && e.status === 200) && protocolResponses.some(e => e.url.endsWith('.wasm') && e.status === 200), 'Actual production worker/WASM assets loaded.');
    Object.assign(evidence, { parentId: parent.id, parentRevision: parent.revision, savedSha256: digest(savedBytes),
      sourceSha256: digest(sourceBytes), baselineParentSha256: digest(parentBytes), nativeInsertionRequestCount: 2,
      oracles: 'Original source8 bodies V136/BRepA344; outsideboxV240/A248 bounds[200,0,0]..[210,6,4]; firstinsertion9/V376/A592; acceptedsource reuse17/V512/A936. All eight sourcebounds literal, exact coincidentmultiplicity2, native and planar-mesh areas separate; abs1e-6 mass/area/bounds,1e-10 quaternion equivalence.',
      limits: 'Actual production worker/file IPC with test-owned dialog substitutions. Root-scope insertion and cached reuse only; shared embedded-scope cases belong to separate native acceptance. No injected worker response, React setter, external-policy, pointer, human-dialog, platform, deterministic STEP bytes or general interchange claim.' });
  };
};
module.exports.createOriginalDocuments = createOriginalDocuments;
