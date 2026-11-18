'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Original runtime recipe, using only the two tracked original STEP fixtures.
// Each source owns exact bytes; the renderer receives it only through normal Open.
function createOriginalDocument(root) {
  const source = name => {
    const bytes = fs.readFileSync(path.join(root, 'src/cad/fixtures/step-import', name));
    return { format: 'step', encoding: 'base64', data: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  return { version: 1, id: 'ui-imported-bodies-original', name: 'Original autonomous imported STEP bodies', units: 'mm',
    createdAt: '2026-10-23T00:00:00.000Z', updatedAt: '2026-10-23T00:00:00.000Z',
    features: [{ id: 'import-base', name: 'Original owned STEP bodies', type: 'importedBodies', suppressed: false,
      bodies: [{ bodyId: 'import-A', source: source('box-mm.step') }, { bodyId: 'import-B', source: source('box-translated-mm.step') }] }] };
}

module.exports = function importedBodiesWorkflow(context) {
  const { expected, input, output, evaluate, observe, waitFor, click, menu, checks, protocolResponses,
    consoleErrors, failedRequests, ipc, check, canonical, digest, initialReadyMs, dialogCounts } = context;
  const base = expected.features[0], phases = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(value => {
    const json = JSON.stringify(value); check(typeof json === 'string', 'Expected explicitly serializable page data.');
    return 'JSON.parse(' + encodeJavaScriptString(json) + ')';
  }).join(',') + ')');
  const near = (actual, wanted, label, band = 1e-6) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= band, label);
  const feature = suppressed => ({ ...base, suppressed });
  const hasFeature = (features, suppressed) => canonical(features) === canonical([feature(suppressed)]);
  function documentIdentity(value, suppressed) {
    check(value.version === 1 && value.id === expected.id && value.name === expected.name && value.units === 'mm'
      && value.createdAt === expected.createdAt, 'Original v1 imported-body document identity and units retained.');
    check(hasFeature(value.features, suppressed), 'Exact importedBodies producer, body IDs, source bytes/digests and suppression state retained.');
    check(value.features[0].bodies.every(body => body.source.format === 'step' && body.source.encoding === 'base64'
      && Buffer.from(body.source.data, 'base64').toString('base64') === body.source.data
      && digest(Buffer.from(body.source.data, 'base64')) === body.source.sha256), 'Owned source data remains canonical base64 with its exact original byte SHA-256.');
  }
  function geometry(event, suppressed) {
    check(event.response?.ok === true, event.response?.error || 'Actual build rejected outside the feature boundary.');
    const value = event.response.value;
    check(Array.isArray(value.featureErrors) && value.featureErrors.length === 0, 'Actual imported-body build has no feature errors.');
    check(canonical(value.warnings) === canonical(suppressed ? [] : ['La pieza contiene 2 sólidos separados.']), 'Only the existing informational two-solid warning appears for the active base.');
    if (suppressed) {
      check(value.bodyCatalogActive === false && (value.bodies ?? []).length === 0 && value.meshVertexCount === 0 && value.meshTriangleCount === 0,
        'Suppressing the complete base leaves no active catalog, body or rendered mesh.');
      near(value.volume, 0, 'Suppressed base has actual native aggregate volume zero.'); return;
    }
    check(value.bodyCatalogActive === true && value.bodies?.length === 2, 'Actual worker owns exactly two imported material bodies.');
    const actual = new Map(value.bodies.map(body => [body.ref.bodyId, body]));
    check(actual.size === 2, 'The shared producer never collapses the two explicit body identities.');
    for (const [id, min, max] of [['import-A', [0, 0, 0], [10, 6, 4]], ['import-B', [12, -4, 7], [22, 2, 11]]]) {
      const body = actual.get(id);
      check(body && canonical(body.ref) === canonical({ bodyId: id, sourceFeatureId: base.id }) && body.createdByFeatureId === base.id,
        'Current body ' + id + ' retains the exact shared base producer and distinct identity.');
      near(body.volume, 240, 'Actual native BRep volume 240 for ' + id);
      // These original boxes have planar faces: their actual worker mesh has the
      // same literal area. This is explicitly mesh area, not a new BRep-area DTO.
      near(body.meshAreaMm2, 248, 'Independent planar worker-mesh area 248 for ' + id);
      check(Number.isInteger(body.meshTriangleCount) && body.meshTriangleCount >= 12 && Number.isInteger(body.meshVertexCount) && body.meshVertexCount >= 8,
        'Current imported box has an actual finite worker mesh for ' + id);
      min.forEach((v, axis) => near(body.bounds.min[axis], v, 'Native independent minimum for ' + id + ' axis ' + axis));
      max.forEach((v, axis) => near(body.bounds.max[axis], v, 'Native independent maximum for ' + id + ' axis ' + axis));
    }
    near(value.volume, 480, 'Actual combined BRep volume retains both disjoint 240-mm³ bodies.');
  }
  async function buildAfter(serial, suppressed, label) {
    return waitFor('actual importedBodies build: ' + label, async () => {
      const state = await observe(); check(state.workerErrors.length === 0, 'No actual worker errors.');
      const event = state.builds.filter(e => e.serial > serial && hasFeature(e.features, suppressed) && e.response).at(-1);
      if (!event) return false;
      geometry(event, suppressed);
      phases.push({ phase: label, requestId: event.id, serial: event.serial, featuresSha256: digest(canonical(event.features)),
        nativeVolumeMm3: event.response.value.volume, bodies: event.response.value.bodies ?? [], warnings: event.response.value.warnings, suppressed });
      return event;
    });
  }
  async function recovery(suppressed, label) {
    return waitFor('committed importedBodies recovery: ' + label, async () => {
      const raw = await page(() => localStorage.getItem('solidflow.autosave')); if (!raw) return false;
      const value = JSON.parse(raw); if (value.id !== expected.id || !hasFeature(value.features, suppressed)) return false;
      documentIdentity(value, suppressed); return value;
    });
  }
  async function selectBase() {
    await page(name => {
      const rows = [...document.querySelectorAll('.tree-row')].filter(row => [...row.querySelectorAll('span')].some(span => span.textContent === name));
      if (rows.length !== 1) throw Error('Expected one original importedBodies feature row.'); rows[0].click();
    }, base.name);
    await waitFor('exact importedBodies tree row selected', () => page(name => [...document.querySelectorAll('.tree-row.selected')].some(row => [...row.querySelectorAll('span')].some(span => span.textContent === name)), base.name));
  }
  async function information(label) {
    const before = await page(() => localStorage.getItem('solidflow.autosave'));
    await selectBase();
    await page(name => {
      const rows = [...document.querySelectorAll('.tree-row')].filter(row => [...row.querySelectorAll('span')].some(span => span.textContent === name));
      if (rows.length !== 1) throw Error('Original importedBodies row missing.'); rows[0].dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, base.name);
    await waitFor('actual importedBodies geometry-base information: ' + label, () => page(() => {
      const manager = document.querySelector('.property-manager');
      const section = [...(manager?.querySelectorAll('.property-section') ?? [])].find(s => s.querySelector('h3')?.textContent.trim() === 'Geometría base');
      return manager?.querySelector('.property-title span')?.textContent === 'Cuerpos importados STEP'
        && section?.textContent.includes('2 cuerpos STEP están guardados dentro de esta pieza con identidades separadas.')
        && section.textContent.includes('no reconstruye el historial de diseño original')
        && section.querySelectorAll('input,select,textarea,button').length === 0;
    }));
    const serial = (await observe()).serial;
    await click('button[title="Cancelar operación"]');
    await waitFor('base information Cancel closes without mutation: ' + label, () => page(() => !document.querySelector('.property-manager')));
    await buildAfter(serial, false, 'information-cancel/' + label);
    check(await page(() => localStorage.getItem('solidflow.autosave')) === before, 'Read-only base information and Cancel preserve exact committed recovery bytes.');
    documentIdentity(JSON.parse(before), false);
  }
  async function history(title, suppressed, label) {
    const serial = (await observe()).serial;
    await click('button[title="' + title + '"]');
    await buildAfter(serial, suppressed, label); await recovery(suppressed, label);
  }
  return async () => {
    check(expected.features.length === 1 && base.type === 'importedBodies' && base.bodies.length === 2, 'Runtime fixture has one importedBodies base and two exact owned original STEP sources.');
    documentIdentity(expected, false);
    check(path.extname(input) === '.solidflow' && path.extname(output) === '.solidflow'
      && !fs.readdirSync(path.dirname(input)).some(name => /\.(step|stp)$/i.test(name)), 'Test-owned Open input contains all STEP bytes; no standalone source STEP file is present in its directory.');
    await waitFor('production worker/WASM bootstrap', async () => (await observe()).builds.some(e => e.response?.ok), initialReadyMs);
    const beforeOpen = (await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]');
    let discarded = false;
    await waitFor('normal initial Open or explicit discard confirmation', async () => {
      if (!discarded && await page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]'))) {
        await page(() => {
          const buttons = [...document.querySelectorAll('[role="dialog"][aria-labelledby="discard-title"] button')].filter(b => b.textContent.trim() === 'Continuar sin guardar');
          if (buttons.length !== 1 || buttons[0].disabled) throw Error('Expected exact enabled initial discard action.'); buttons[0].click();
        }); discarded = true;
      }
      return (await observe()).builds.some(e => e.serial > beforeOpen && hasFeature(e.features, false) && e.response);
    });
    await buildAfter(beforeOpen, false, 'fixture/open'); await recovery(false, 'fixture/open');
    await waitFor('two actual current body rows', () => page(() => document.querySelectorAll('[aria-label="Cuerpos sólidos"] .body-row').length === 2));
    await information('initial');
    await selectBase();
    let serial = (await observe()).serial; await click('button[title="Suprimir operación"]');
    await buildAfter(serial, true, 'base/suppress'); await recovery(true, 'base/suppress');
    await history('Deshacer (Ctrl+Z)', false, 'suppression/Undo');
    await history('Rehacer (Ctrl+Y)', true, 'suppression/Redo');
    await selectBase(); serial = (await observe()).serial; await click('button[title="Activar operación"]');
    await buildAfter(serial, false, 'base/reactivate'); await recovery(false, 'base/reactivate');
    await history('Deshacer (Ctrl+Z)', true, 'reactivation/Undo');
    await history('Rehacer (Ctrl+Y)', false, 'reactivation/Redo');
    serial = (await observe()).serial; await click('button[title="Reconstruir pieza"]');
    await buildAfter(serial, false, 'committed/fresh-rebuild');
    await menu('Guardar como…');
    await waitFor('actual importedBodies Save As IPC completed', () => dialogCounts().saves === 1 && ipc.filter(e => e.channel === 'document:save' && e.completed).length === 1);
    await waitFor('saved original importedBodies title is clean', () => page(name => {
      const title = document.querySelector('.document-title')?.textContent ?? ''; return title.includes(name) && !title.includes('*');
    }, expected.name));
    const savedBytes = await fsp.readFile(output), saved = JSON.parse(savedBytes.toString('utf8')); documentIdentity(saved, false);
    check(canonical(saved.features) === canonical(expected.features), 'Saved byte sources and both body IDs remain exactly the original single-base declaration.');
    serial = (await observe()).serial; await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await buildAfter(serial, false, 'saved/reopen-fresh-native-build');
    check(canonical(reopened.features) === canonical(saved.features), 'Fresh reopened actual worker input equals the actually saved feature/source table.');
    await recovery(false, 'saved/reopen'); await information('reopened');
    check((await fsp.readFile(output)).equals(savedBytes), 'Read-only reopened information leaves exact saved bytes unchanged.');
    check(dialogCounts().opens === 2 && dialogCounts().saves === 1 && dialogCounts().csvExports === 0, 'Exactly fixture Open, one Save As and saved-output Open.');
    check(ipc.filter(e => e.channel === 'document:open' && e.completed).length === 2
      && ipc.filter(e => e.channel === 'document:save' && e.completed).length === 1, 'Real production preload/file IPC counts match the test-owned dialogs.');
    check((await observe()).workerErrors.length === 0 && consoleErrors.length === 0 && failedRequests.length === 0, 'No worker, renderer or resource errors.');
    check(protocolResponses.some(a => /kernel\.worker-[\w-]+\.js$/.test(a.url) && a.status === 200)
      && protocolResponses.some(a => a.url.endsWith('.wasm') && a.status === 200), 'Actual production worker and WASM asset loads observed.');
    checks.push({ scenario: 'original-importedBodies-production-lifecycle', phases, savedBytesSha256: digest(savedBytes), savedFeaturesSha256: digest(canonical(saved.features)),
      sources: base.bodies.map(b => ({ bodyId: b.bodyId, sourceSha256: b.source.sha256, byteLength: Buffer.from(b.source.data, 'base64').length })),
      oracles: { nativeBodyVolumeMm3: 240, planarMeshAreaMm2: 248, nativeVolumeBandMm3: 1e-6, planarMeshAreaBandMm2: 1e-6, nativeBoundsBandMm: 1e-6 },
      limits: 'Scripted DOM/file-IPC original v1 base lifecycle only. Area is independently summed from the actual planar worker mesh; no new native-area DTO, viewport pointer, STEP import dialog, assembly structural UI or platform claim.' });
  };
};
module.exports.createOriginalDocument = createOriginalDocument;
