'use strict';

const fs = require('node:fs/promises');

// The valid STEP was produced by the original rectangle workflow in this child.
// Only the owned dialog choice is substituted. IPC and the native reader run normally.
module.exports = async function singleStepImport(context) {
  const { files, page, press, file, observe, response, committed, recovery, waitFor,
    check, checks, near, canonical, digest, dialogCounts, ipc } = context;
  const before = await recovery();
  const originalFile = await fs.readFile(files.semicircle);
  const sourceBytes = await fs.readFile(files.steps.rectangle);
  const sourceSha = digest(sourceBytes);
  const malformed = Buffer.from('ISO-10303-21;\nOriginal invalid test file without a STEP header or solids.\n');
  await fs.writeFile(files.malformedStep, malformed, { flag: 'wx' });
  const imports = () => ipc.filter(event => event.channel === 'document:import-step' && event.completed);
  const evidence = { sourceSha256: sourceSha, sourceBytes: sourceBytes.length, phases: [] };
  checks.push({ singleStepImport: evidence });

  async function choose(ordinal) {
    await file('Importar STEP…');
    await waitFor('owned native STEP picker and read settle ' + ordinal, () =>
      dialogCounts().stepImports === ordinal && imports().length === ordinal);
  }
  const beforeCancel = (await observe()).serial;
  await choose(1);
  check(!imports()[0].stepRead && await recovery() === before && (await observe()).serial === beforeCancel,
    'Canceling the read-only STEP picker starts no native build or document replacement');
  evidence.phases.push({ kind: 'cancel-picker', serial: beforeCancel, recoverySha256: digest(before) });

  const beforeReject = (await observe()).serial;
  await choose(2);
  const rejected = await response(beforeReject, features => features.length === 1
    && features[0].type === 'importedSolid' && features[0].source.sha256 === digest(malformed), 'single-STEP-rejected');
  const error = rejected.response.ok ? rejected.response.value.featureErrors[0]?.message : rejected.response.error;
  check(typeof error === 'string' && error.length > 0, 'Malformed STEP is rejected by the actual native reader');
  await waitFor('malformed STEP has a visible diagnostic', () => page(message =>
    document.querySelector('.toast.toast-error[role="alert"]')?.textContent.includes(message), error));
  check(await recovery() === before && (await fs.readFile(files.semicircle)).equals(originalFile),
    'Malformed STEP preserves the current document and its exact saved file');
  evidence.phases.push({ kind: 'reject-malformed', serial: rejected.serial, recoverySha256: digest(before) });

  function geometry(record, phase) {
    const value = record.response.value;
    check(record.response.ok && value.featureErrors.length === 0 && value.warnings.length === 0
      && value.meshVertexCount > 0 && value.meshTriangleCount > 0, phase + ' has actual native geometry with no errors or warnings');
    near(value.volume, 36, 1e-5, phase + ' literal 6×2×3 prism volume');
    for (const [index, extent] of [6, 2, 3].entries()) {
      near(value.bounds.min[index], 0, 1e-6, phase + ' literal minimum bound');
      near(value.bounds.max[index], extent, 1e-6, phase + ' literal maximum bound');
    }
    return { volume: value.volume, bounds: value.bounds, vertices: value.meshVertexCount, triangles: value.meshTriangleCount };
  }

  const beforeImport = (await observe()).serial;
  await choose(3);
  const imported = await waitFor('standard STEP replaces the clean part with an autonomous imported solid', async () => {
    const bytes = await recovery();
    if (!bytes || bytes === before) return false;
    const document = JSON.parse(bytes);
    return document.features.length === 1 && document.features[0].type === 'importedSolid' ? document : false;
  });
  const feature = imported.features[0];
  const build = await response(beforeImport, features => canonical(features) === canonical(imported.features), 'single-STEP-imported');
  const measured = geometry(build, 'Imported STEP');
  const read = imports()[2].stepRead;
  check(imported.version === 1 && imported.name === 'rectangle' && imported.id !== JSON.parse(before).id
    && read.name === 'rectangle.step' && read.sha256 === sourceSha && read.bytes === sourceBytes.length && read.noPath
    && feature.source.format === 'step' && feature.source.encoding === 'base64' && feature.source.sha256 === sourceSha
    && Buffer.from(feature.source.data, 'base64').equals(sourceBytes) && !canonical(imported).includes(files.steps.rectangle),
  'The normal import retains exact source bytes in a distinct v1 document without the original path');
  const cleanStart = await committed(imported.features, 'single-STEP-imported');
  check(cleanStart.title.includes('*') && cleanStart.history.every(entry => entry.disabled), 'New imported part is unsaved with its own empty history');
  evidence.phases.push({ kind: 'imported', serial: build.serial, documentId: imported.id, featureId: feature.id, ...measured });

  await file('Guardar como…');
  await waitFor('actual imported document Save As completes', () => dialogCounts().saves === 4
    && ipc.filter(event => event.channel === 'document:save' && event.completed).length === 4);
  const bytes = await fs.readFile(files.imported);
  const saved = JSON.parse(bytes);
  check(canonical(saved) === canonical(imported), 'Save retains the imported document, feature and source bytes');
  const beforeOpen = (await observe()).serial;
  await press('button[aria-label="Abrir (Ctrl+O)"]');
  const reopened = await response(beforeOpen, features => canonical(features) === canonical(saved.features), 'single-STEP-reopened');
  const rebuilt = geometry(reopened, 'Reopened imported STEP');
  const restored = await committed(saved.features, 'single-STEP-reopened');
  check(canonical(JSON.parse(restored.recovery)) === canonical(saved) && !restored.title.includes('*')
    && restored.history.every(entry => entry.disabled) && canonical(rebuilt) === canonical(measured)
    && imports().length === 3 && dialogCounts().opens === 4,
  'Reopen rebuilds the autonomous source with the exact file identity and fresh history');
  evidence.phases.push({ kind: 'saved-and-reopened', serial: reopened.serial, savedSha256: digest(bytes), ...rebuilt });
};
