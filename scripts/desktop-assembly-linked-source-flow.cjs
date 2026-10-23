'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
module.exports = function linkedSourceWorkflow(context) {
  const { expected, input, files, original, evaluate, observe, waitFor, click, capture, checks, consoleErrors, failedRequests,
    ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const phases = [], APPLY = 'button[aria-label="Aplicar ensamblaje"]', CANCEL = 'button[aria-label="Cancelar vista previa del ensamblaje"]';
  const CHOOSE = 'button[aria-label="Vincular archivo de origen"]', REBIND = 'button[aria-label="Re-vincular archivo de origen"]',
    RELOAD = 'button[aria-label="Recargar origen enlazado"]', DETACH = 'button[aria-label="Desvincular archivo de origen"]';
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); if (json === undefined) throw Error('Page arguments must be JSON data');
    return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (a, b, t, label) => check(Number.isFinite(a) && Math.abs(a - b) <= t, label + ': ' + a + ' expected ' + b);
  const vector = (a, b, label) => { check(Array.isArray(a) && a.length === 3, label + ' shape'); a.forEach((v, i) => near(v, b[i], 1e-6, label + '[' + i + ']')); };
  async function button(text, parent = '.assembly-toolbar') { await page((text, parent) => {
    const rows = [...document.querySelectorAll(parent + ' button')].filter(x => x.textContent.trim() === text);
    if (rows.length !== 1 || rows[0].disabled) throw Error('One enabled button: ' + text); rows[0].click();
  }, text, parent); }
  async function response(serial, action) { return waitFor('actual worker ' + action, async () => {
    const state = await observe(); check(!state.workerErrors.length, 'No worker runtime errors');
    const event = state.assemblies.find(x => x.serial > serial && x.action === action && x.response);
    if (!event) return false; check(event.response.ok, event.response.error || 'Actual worker rejection');
    const v = event.response.value, scene = v?.kind === 'assembly-scene' ? v : v?.scene;
    phases.push({ action, serial: event.serial, status: v?.status, ...(scene ? { geometry: { volume: scene.volume, area: scene.area,
      solidCount: scene.solidCount, prototypeCount: scene.prototypeCount, bodies: scene.bodies.map(b => ({ component: b.component, body: b.body, volume: b.volume, area: b.area, bounds: b.bounds })) } } : {}) });
    return event;
  }); }
  async function recovery(doc, label) { await waitFor(label + ' exact committed recovery', async () => {
    const raw = await page(() => localStorage.getItem('solidflow.autosave'));
    return raw && canonical(JSON.parse(raw)) === canonical(doc) && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false');
  }); }
  async function idle() { await waitFor('idle committed controls', () => page(sel => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && document.querySelector(sel)?.disabled === true, APPLY)); }
  async function selectLeft() {
    await page(() => { const rows = [...document.querySelectorAll('.assembly-tree [role="treeitem"]')].filter(x => x.querySelector('span')?.firstChild?.textContent === 'left');
      if (rows.length !== 1 || rows[0].disabled) throw Error('Unique left source'); rows[0].click(); });
    await waitFor('selected exact source', () => page(() => document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'left'));
  }
  function geometry(scene, updated, nested) {
    check(scene.solidCount === 2 && scene.bodies.length === 2 && scene.prototypeCount === 1, 'Two placed solids from one current prototype');
    near(scene.volume, updated ? 72 : 48, 1e-5, 'Literal total volume'); near(scene.area, updated ? 132 : 104, 1e-5, 'Literal total area');
    for (const [owner, x] of [['left', -10], ['right', 20]]) {
      const rows = scene.bodies.filter(b => canonical(b.component.occurrencePath) === canonical(nested ? [owner, 'm'] : [owner]));
      check(rows.length === 1, 'Exact full reused occurrence path ' + owner); const body = rows[0];
      check(body.body.bodyId === 'original-linked-body' && body.component.definition.id === 'original-linked-part', 'Current original body identity');
      near(body.volume, updated ? 36 : 24, 1e-5, 'Each prism volume'); near(body.area, updated ? 66 : 52, 1e-5, 'Each prism area');
      vector(body.bounds.min, [x, 0, 0], owner + ' lower'); vector(body.bounds.max, [x + (updated ? 3 : 2), 3, 4], owner + ' upper');
    }
  }
  function selectedDefinition(doc) { const ref = doc.occurrences.find(x => x.id === 'left').definition;
    return doc.definitions.find(x => x.id === ref.id && x.revision === ref.revision); }
  function descriptor(doc, sourceFile, sha) { check(canonical(selectedDefinition(doc).sourceLink) === canonical({ kind: 'local-file', displayName: path.basename(sourceFile), contentSha256: sha }), 'Exact accepted source descriptor');
    check(!JSON.stringify(doc).includes('grantId') && !JSON.stringify(doc).includes(path.dirname(sourceFile)), 'Saved graph carries no capability or native path'); }
  async function ready(serial, action, base, updated, nested) {
    const event = await response(serial, action), v = event.response.value;
    check(v.status === 'ready' && v.hasToken, 'Actual private ready capability'); geometry(v.scene, updated, nested); await recovery(base, 'Unapplied preview');
    await waitFor('Apply enabled for exact candidate', () => page(sel => document.querySelector(sel)?.disabled === false, APPLY)); return event;
  }
  async function apply(preview, updated, nested) {
    await click(APPLY); const event = await response(preview.serial, 'apply-assembly'); geometry(event.response.value.scene, updated, nested);
    const proposed = structuredClone(preview.response.value.document), applied = event.response.value.document;
    // History owns updatedAt. All candidate content other than that single timestamp is exact.
    const actual = structuredClone(applied); delete proposed.updatedAt; delete actual.updatedAt;
    check(canonical(actual) === canonical(proposed), 'Apply retains exact reviewed cache and descriptor'); await recovery(applied, 'Apply'); return applied;
  }
  async function cancel(base) { await click(CANCEL); await recovery(base, 'Cancel'); await idle(); }
  async function history(aria, wanted, updated, nested) { const before = await observe(); await click('button[aria-label="' + aria + '"]');
    const event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(wanted), 'Exact graph/history restoration'); geometry(event.response.value, updated, nested); await recovery(wanted, aria); }
  async function open(base, initial) { const before = await observe();
    if (initial) { await click('button[aria-label="Abrir (Ctrl+O)"]'); await waitFor('initial discard dialog', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
      await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]'); }
    else await button('Abrir');
    const event = await response(before.serial, 'build-assembly'); check(canonical(event.document) === canonical(base), 'Real Open exact document'); await recovery(base, 'Open'); return event;
  }
  async function choosePreview(base, nested) { const before = await observe(); await click(CHOOSE); return ready(before.serial, 'preview-assembly', base, false, nested); }
  async function unchangedReload(base) { const before = await observe(), count = ipc.filter(x => x.channel === 'source:read').length; await click(RELOAD);
    await waitFor('actual unchanged read and status', async () => ipc.filter(x => x.channel === 'source:read' && x.completed).length === count + 1
      && await page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && document.querySelector('.assembly-status')?.textContent.includes('El archivo no ha cambiado')));
    await recovery(base, 'Unchanged reload'); const after = await observe();
    check(after.assemblies.filter(x => x.serial > before.serial && ['preview-assembly', 'review-assembly-part-update', 'review-assembly-document-update'].includes(x.action)).length === 0, 'Same bytes create no review, candidate or history'); }
  async function review(base, nested, chooser) {
    const before = await observe(); await click(chooser ? REBIND : RELOAD);
    const event = await response(before.serial, nested ? 'review-assembly-document-update' : 'review-assembly-part-update'), value = event.response.value;
    check(typeof value.reviewId === 'string' && !value.hasToken && value.endpoints.length === 0, 'Private source review without fabricated Apply authority');
    geometry(value.scene, true, nested); await recovery(base, 'Source review');
    return event;
  }
  return async () => {
    await waitFor('production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo') && typeof window.solidflow?.chooseLinkedSource === 'function'), initialReadyMs);
    const originalInput = await fs.readFile(input), originalV2 = await fs.readFile(files.assemblyParent);
    let finalDocument;
    for (const nested of [false, true]) {
      const base = nested ? original.assemblyParent : expected, sourceFile = nested ? files.assembly : files.part, saved = nested ? files.assemblyOutput : files.partOutput;
      const beforeBytes = Buffer.from(JSON.stringify(nested ? original.assemblyBefore : original.partBefore)), afterBytes = Buffer.from(JSON.stringify(nested ? original.assemblyAfter : original.partAfter));
      const opened = await open(base, !nested); geometry(opened.response.value, false, nested); await selectLeft();
      if (nested) {
        await fs.writeFile(sourceFile, JSON.stringify(original.assemblySameRevisionChanged)); const serial = (await observe()).serial; await click(CHOOSE);
        await waitFor('changed same revision rejected with guidance', () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && document.querySelector('.assembly-status')?.textContent.includes('revisión distinta')));
        await recovery(base, 'Same-revision rejection'); check((await observe()).assemblies.filter(x => x.serial > serial && x.action === 'review-assembly-document-update').length === 0, 'Same-revision source never enters private native review');
        check(await page(sel => document.querySelector(sel)?.disabled === true, APPLY), 'Rejected source has no Apply'); await fs.writeFile(sourceFile, beforeBytes);
      }
      let preview = await choosePreview(base, nested); descriptor(preview.response.value.document, sourceFile, digest(beforeBytes)); await cancel(base);
      check(!selectedDefinition(base).sourceLink, 'Cancel keeps original embedded source');
      preview = await choosePreview(base, nested); let linked = await apply(preview, false, nested); descriptor(linked, sourceFile, digest(beforeBytes)); await selectLeft(); await unchangedReload(linked);
      await fs.writeFile(sourceFile, afterBytes); const discarded = await review(linked, nested, false);
      const discard = 'button[aria-label="Cancelar actualización de ' + (nested ? 'subensamblaje' : 'pieza') + '"]'; await click(discard); await recovery(linked, 'Discard changed review'); await idle();
      await waitFor('canceled reviewed grant revoked', () => page(sel => document.querySelector(sel)?.disabled === true, RELOAD));
      const reviewed = await review(linked, nested, true); check(reviewed.response.value.reviewId !== discarded.response.value.reviewId, 'Retry creates a distinct private review');
      const beforeSolve = await observe(); await click('button[aria-label="Resolver actualización de ' + (nested ? 'subensamblaje' : 'pieza') + '"]');
      preview = await ready(beforeSolve.serial, nested ? 'preview-assembly-document-update' : 'preview-assembly-part-update', linked, true, nested);
      descriptor(preview.response.value.document, sourceFile, digest(afterBytes));
      check(preview.reviewId === reviewed.response.value.reviewId, 'Solve uses exact retained source review');
      if (!nested) check(canonical(preview.current) === canonical(linked), 'v1 reviewed preview exact committed base');
      const updated = await apply(preview, true, nested); descriptor(updated, sourceFile, digest(afterBytes));
      check(updated.id === base.id && updated.revision === base.revision && updated.mates.length === 0, 'Parent identity and empty relation set preserved');
      check(canonical(updated.occurrences.map(x => ({ ...x, definition: null }))) === canonical(base.occurrences.map(x => ({ ...x, definition: null }))), 'All original occurrence identities, flags and placements preserved');
      const target = updated.occurrences[0].definition;
      check(updated.occurrences.every(x => canonical(x.definition) === canonical(target)) && target.id === base.occurrences[0].definition.id
        && target.revision !== base.occurrences[0].definition.revision, 'Both reused roots share one newly reviewed source tuple');
      if (nested) check(target.revision === 'r1' && selectedDefinition(updated).occurrences[0].id === 'm', 'Authored v2 revision and local child identity retained');
      else check(canonical(selectedDefinition(updated).document) === canonical(original.partAfter), 'Exact original incoming v1 document cached');
      await history('Deshacer ensamblaje', linked, false, nested); await history('Rehacer ensamblaje', updated, true, nested); await selectLeft();
      check(await page(sel => document.querySelector(sel)?.disabled === true, RELOAD), 'Undo/Redo never resurrect file permission');
      // Detach is its own authenticated metadata-only edit; Cancel is atomic.
      const beforeDetach = await observe(); await click(DETACH); preview = await ready(beforeDetach.serial, 'preview-assembly', updated, true, nested); await cancel(updated);
      const retryDetach = await observe(); await click(DETACH); preview = await ready(retryDetach.serial, 'preview-assembly', updated, true, nested);
      const detached = await apply(preview, true, nested); check(!selectedDefinition(detached).sourceLink, 'Detach removes only source metadata');
      const a = structuredClone(detached), b = structuredClone(updated); delete a.updatedAt; delete b.updatedAt; delete selectedDefinition(b).sourceLink;
      check(canonical(a) === canonical(b), 'Detach preserves complete embedded geometry/cache/poses');
      await history('Deshacer ensamblaje', updated, true, nested);
      await button('Guardar como'); await waitFor('saved exact linked graph', async () => { try { return canonical(JSON.parse(await fs.readFile(saved, 'utf8'))) === canonical(updated); } catch (e) { if (e.code === 'ENOENT') return false; throw e; } });
      const reopened = await open(updated, false); geometry(reopened.response.value, true, nested); await selectLeft();
      check(await page(sel => document.querySelector(sel)?.disabled === true, RELOAD), 'Reopened descriptor provides no read authority');
      const beforeRebind = await observe(), chooserCount = dialogCounts().sourceOpens; await click(REBIND);
      await waitFor('explicit exact-file rebind', async () => dialogCounts().sourceOpens === chooserCount + 1 && await page(sel => document.querySelector(sel)?.disabled === false && document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false', RELOAD));
      await recovery(updated, 'Rebind unchanged metadata'); check((await observe()).assemblies.filter(x => x.serial > beforeRebind.serial && x.action === 'preview-assembly').length === 0, 'Exact rebind preserves document/history');
      await unchangedReload(updated); check((await fs.readFile(sourceFile)).equals(afterBytes), 'Source remains exact authored bytes; UI never writes it');
      finalDocument = updated;
    }
    check((await fs.readFile(input)).equals(originalInput) && (await fs.readFile(files.assemblyParent)).equals(originalV2), 'Original parent inputs byte-identical');
    const counts = dialogCounts(); check(counts.opens === 4 && counts.saves === 2 && counts.sourceOpens === 9 && counts.csvExports === 0, 'Exact ordinary/source picker and Save As queues');
    check(ipc.filter(x => x.channel === 'source:choose' && x.completed).length === 9 && ipc.filter(x => x.channel === 'source:read' && x.completed).length === 6, 'Actual isolated read-only source IPC counts');
    check(ipc.filter(x => x.source).every(x => x.source.hasGrant && x.source.noPath), 'Main returns opaque source grants without paths');
    check(ipc.filter(x => x.channel === 'source:release' && x.completed).length >= 6, 'Cancelled/history/reopened capabilities actually released');
    check(ipc.every(x => x.completed), 'All file IPC completed');
    await capture(finalDocument); const final = await observe(); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'No renderer/worker/resource errors');
    checks.push({ linkedSourceInputSha256: digest(originalInput), linkedSourceV2InputSha256: digest(originalV2), phases, finalDocument,
      independentOracles: 'Original rectangles [0,w]x[0,3], extrusion4: w2 V24/A52; w3 V36/A66. Two fixed uses translated -10,+20: totals48/104 to72/132; bounds[-10,0,0]..[-8/7,3,4] and[20,0,0]..[22/23,3,4]. V/A1e-5, bounds1e-6. Nested v2 adds identity m under each reused root. No reference application data.',
      limits: 'Production renderer and actual native worker/private Apply plus test-owned read-only dialog paths. No file watcher, human file-dialog interaction, network link, automatic source revision, general topology repair or platform support claim. Source-write steps are explicit original test-file edits between reads.' });
  };
};
