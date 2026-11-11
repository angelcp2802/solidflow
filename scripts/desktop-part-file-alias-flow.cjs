'use strict';
const fs = require('node:fs/promises');
const measurePlanarStep = require('./desktop-part-planar-step.cjs');

const min = [-10, -6, 0], max = [10, 6, 4];
const prism = {
  name: 'Original sequence prism', min, max, centroid: [0, 0, 2], volume: 960, area: 736,
  planes: [48, 80, 240].flatMap((area, axis) => [0, 1].map(side => {
    const coordinate = side ? max[axis] : min[axis];
    const atPlane = vector => vector.map((value, index) => index === axis ? coordinate : value);
    return { min: atPlane(min), max: atPlane(max), area,
      normal: [0, 1, 2].map(index => index === axis ? side ? 1 : -1 : 0) };
  })),
};

function measurePrismStl(bytes, check, near) {
  check(bytes.length === 684 && bytes.readUInt32LE(80) === 12, 'Exact 12 binary STL facets of the original prism');
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const faces = prism.planes.map(plane => ({ ...plane, missingCorners: [], areaSum: 0 }));
  let volume = 0;
  for (let index = 0; index < 12; index++) {
    const offset = 84 + 50 * index;
    const vectorAt = i => [0, 1, 2].map(axis => bytes.readFloatLE(i + 4 * axis));
    const normal = vectorAt(offset);
    const [a, b, c] = [12, 24, 36].map(delta => vectorAt(offset + delta));
    check(bytes.readUInt16LE(offset + 48) === 0 && [a, b, c].every(vertex =>
      vertex.every((value, axis) => value === min[axis] || value === max[axis])),
    'Every actual STL facet uses original prism corners and no attribute payload');
    const owners = faces.filter(plane => [a, b, c].every(vertex => vertex.every((value, axis) =>
      value >= plane.min[axis] && value <= plane.max[axis])));
    check(owners.length === 1, 'Each STL triangle lies on one exact original physical face');
    const face = owners[0], n = cross(b.map((value, axis) => value - a[axis]), c.map((value, axis) => value - a[axis]));
    const magnitude = Math.hypot(...n);
    check(magnitude > 0, 'STL triangle is nondegenerate');
    face.normal.forEach((value, axis) => {
      near(normal[axis], value, 1e-6, 'STL stored outward normal');
      near(n[axis] / magnitude, value, 1e-6, 'STL actual outward winding');
    });
    const [u, v] = [0, 1, 2].filter(axis => face.normal[axis] === 0);
    const corners = [a, b, c].map(vertex => Number(vertex[u] === max[u]) + 2 * Number(vertex[v] === max[v]));
    face.missingCorners.push([0, 1, 2, 3].find(value => !corners.includes(value)));
    face.areaSum += magnitude / 2;
    const bc = cross(b, c);
    volume += a.reduce((sum, value, axis) => sum + value * bc[axis], 0) / 6;
  }
  for (const face of faces) {
    check(face.missingCorners.length === 2 && face.missingCorners[0] + face.missingCorners[1] === 3,
      'Each original prism face has two complementary facets');
    near(face.areaSum, face.area, 1e-5, 'Independent rectangle area of STL face');
  }
  near(volume, 960, 1e-5, 'Independent signed STL volume');
  return { facets: 12, min, max, volume, area: faces.reduce((sum, face) => sum + face.areaSum, 0), faces };
}

// Use the same visible stationary pointer controls and test-owned native file
// queue as the operation aliases. All geometry and document snapshots are reads.
module.exports = async function partFileAliases(context) {
  const { document, savedBytes, output, partFileExports, snapshot, idle, waitFor,
    check, checks, canonical, digest, ipc, dialogCounts, menuKey } = context;
  const evidence = { exports: [], replacements: [], interactions: [],
    limits: 'Original planar prism, actual production controls and test-owned native dialog outcomes. STEP reader uses a separate instance of the same kernel family. STL uses independent binary triangle measurements.' };
  checks.push({ partFileAliases: evidence });
  const { page, press, change, file } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions: evidence.interactions });
  const near = (actual, wanted, tolerance, label) => check(Number.isFinite(actual) && Math.abs(actual - wanted) <= tolerance,
    label + ': actual=' + actual + ', expected=' + wanted + ', tolerance=' + tolerance);
  const discard = '[role="dialog"][aria-labelledby="discard-title"]';
  const fileTrigger = 'nav.part-main-menus [data-assembly-menu="file"]';
  const title = () => page(() => document.querySelector('.document-title')?.getAttribute('title'));
  const stableOwner = async () => {
    const { native, recovery, ui, dialogs, ipc } = await snapshot();
    return { serial: native.serial, builds: native.builds, workerErrors: native.workerErrors, recovery, ui, dialogs, ipc, title: await title() };
  };
  const savedUnchanged = async label => check((await fs.readFile(output)).equals(savedBytes), label + ' leaves exact saved part bytes');
  for (const [index, item] of partFileExports.entries()) {
    evidence.pending = item.surface + '/' + item.format + (item.canceled ? '/cancel' : '');
    if (item.surface === 'Evaluar' && index === 3) await press('.ribbon-tabs button', 'Evaluar');
    const before = await stableOwner();
    const label = 'Exportar ' + item.format.toUpperCase();
    if (item.surface === 'Archivo') await file(label);
    else await press('.commands button.command', label);
    const completed = await waitFor(evidence.pending + ' exact native outcome', async () => {
      const entries = ipc.slice(before.ipc.length);
      check(entries.length <= 1, 'Only the advertised part export can enter the native bridge');
      const entry = entries[0];
      return entry?.channel === 'document:export' && entry.completed && dialogCounts().geometryExports === index + 1
        && await page(() => ![...document.querySelectorAll('.toast')].some(e => e.textContent.includes('Exportando geometría')))
        ? entry.geometry : false;
    });
    check(completed.format === item.format && completed.name === document.name && completed.chosen === !item.canceled,
      'The exact export format, source and native picker decision match the invoked command');
    let geometry;
    if (item.canceled) {
      const exists = await fs.stat(item.file).then(() => true, error => {
        if (error.code !== 'ENOENT') throw error;
        return false;
      });
      check(!exists, 'Canceled native export produces no file');
    } else {
      const bytes = await fs.readFile(item.file);
      check(completed.bytes === bytes.length && completed.sha256 === digest(bytes), 'Native export writes the exact IPC byte range');
      geometry = item.format === 'step' ? await measurePlanarStep(bytes, check, [prism], { label: 'original prism', volume: 960, area: 736 })
        : measurePrismStl(bytes, check, near);
    }
    const after = await stableOwner();
    check(canonical({ ...after, dialogs: before.dialogs, ipc: before.ipc }) === canonical(before)
      && after.dialogs.opens === before.dialogs.opens && after.dialogs.saves === before.dialogs.saves,
    'Part export preserves the exact current recovery, history, model, selection and file ownership');
    await savedUnchanged('Part export');
    evidence.exports.push({ surface: item.surface, canceled: item.canceled, ...completed, geometry });
  }
  delete evidence.pending;

  await press('nav.part-main-menus [data-assembly-menu="edit"]');
  await press('nav.part-main-menus [role="menu"] > button[data-assembly-command]', 'Cambiar nombre de pieza');
  const name = '.modal-backdrop form.modal.small input[aria-label="Nombre de la pieza"]';
  await change(name, 'Original part with unsaved rename');
  await press('.modal-backdrop form.modal.small button.primary-button', 'Guardar');
  await idle();
  const dirty = await stableOwner(), renamed = JSON.parse(dirty.recovery);
  check(renamed.id === document.id && renamed.name === 'Original part with unsaved rename'
    && canonical(renamed.features) === canonical(document.features)
    && dirty.title.includes('Cambios sin guardar') && dirty.ui.history[0].disabled === false,
  'The first replacement challenges a real unsaved rename with available document Undo');

  async function replaceExample(label, cancelByKey, verify) {
    const before = await stableOwner();
    const openPrompt = async () => {
      await file(label);
      await waitFor('replacement prompt keeps the safe initial focus', () => page(selector => {
        const e = document.querySelector(selector);
        return !!e?.checkVisibility() && document.activeElement === e.querySelector('button.outline-button');
      }, discard));
    };
    await openPrompt();
    if (cancelByKey) await menuKey('Escape');
    else await press(discard + ' button.outline-button', 'Cancelar');
    await waitFor('replacement Cancel restores File menu focus', () => page((selector, trigger) =>
      !document.querySelector(selector) && document.activeElement?.matches(trigger), discard, fileTrigger));
    check(canonical(await stableOwner()) === canonical(before), 'Canceled example replacement preserves exact recovery, model, history and IPC');
    await savedUnchanged('Canceled example');
    await openPrompt(); await press(discard + ' button.primary-button', 'Continuar sin guardar');
    await idle();
    const after = await stableOwner(), next = JSON.parse(after.recovery);
    const build = after.builds.filter(row => row.serial > before.serial
      && row.response?.ok && canonical(row.features) === canonical(next.features)).at(-1);
    check(build && !build.response.value.featureErrors.length && !build.response.value.warnings.length,
      'Confirmed replacement rebuilds the exact new recovery document without native diagnostics');
    check(after.title.includes('Cambios sin guardar') && after.ui.history.every(action => action.disabled)
      && canonical(after.dialogs) === canonical(before.dialogs) && canonical(after.ipc) === canonical(before.ipc),
    'Confirmed built-in replacement owns a clean history and an unsaved new document without native file actions');
    await savedUnchanged('Confirmed example');
    verify(next, build.response.value);
    evidence.replacements.push({ label, cancellation: cancelByKey ? 'Escape' : 'Cancelar', document: next.name,
      recoverySha256: digest(after.recovery), buildSerial: build.serial, volume: build.response.value.volume, bounds: build.response.value.bounds });
  }
  await replaceExample('Ejemplo: cortes y salientes sucesivos', false, (next, model) => {
    check(canonical(next) === canonical(document) && model.bodies?.length === 1
      && canonical(model.bodies[0].ref) === canonical({ bodyId: 'seq-body', sourceFeatureId: 'seq-base' }),
    'The built-in sequence reopens the original prism and its four remaining sketch declarations');
    near(model.volume, 960, 1e-5, 'Independent sequence prism volume');
  });
  await replaceExample('Abrir pieza de ejemplo', true, (next, model) => {
    const types = next.features.map(feature => feature.type);
    const base = next.features[0], extrusion = next.features[1];
    check(next.name === 'Placa de montaje' && next.id !== document.id
      && types.join(',') === 'sketch,extrude,sketch,cut,sketch,cut,sketch,cut,sketch,cut'
      && base.profile.width === 100 && base.profile.height === 70 && extrusion.depth === 12 && extrusion.sketchId === base.id,
    'The mounting plate exposes its own base and four individually editable cuts');
    const centers = [[-35, -20], [35, -20], [35, 20], [-35, 20]];
    for (let index = 0; index < centers.length; index++) {
      const sketch = next.features[2 + index * 2], cut = next.features[3 + index * 2];
      check(sketch.profile.kind === 'circle' && sketch.profile.radius === 5
        && canonical(sketch.profile.center) === canonical(centers[index]) && cut.sketchId === sketch.id && cut.depth === 12,
      'The mounting plate preserves each literal cut profile and reference');
    }
    near(model.volume, (100 * 70 - 4 * Math.PI * 25) * 12, 1e-5, 'Independent through-hole plate volume');
    for (let axis = 0; axis < 3; axis++) {
      near(model.bounds.min[axis], [-50, -35, 0][axis], 1e-6, 'Mounting plate minimum bound');
      near(model.bounds.max[axis], [50, 35, 12][axis], 1e-6, 'Mounting plate maximum bound');
    }
  });
};
