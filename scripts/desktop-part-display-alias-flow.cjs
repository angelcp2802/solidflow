'use strict';
const fs = require('node:fs/promises');

// The caller has drawn, saved and reopened the original eight-feature part.
// These commands change presentation only. Native observations remain read-only.
module.exports = async function partDisplayAliases(context) {
  const { waitFor, check, checks, canonical, observe, idle, snapshot, output, digest,
    cameraFrame, rasterComparison, waitForPresentation, document } = context;
  const interactions = [];
  const { page, press } = require('./desktop-part-pattern-actors.cjs')({ ...context, interactions });
  const evidence = { interactions, frames: {}, transitions: [], properties: [],
    limits: 'Original saved eight-feature planar part at the recorded window size. Actual CDP presses on contained, stationary controls. Fresh full unmasked central canvas crops use exact native bytes for opaque displays. No camera/model injection, GPU colour calibration, other-platform or human-use claim.' };
  checks.push({ partDisplayAliases: evidence });
  const EDGE = '.viewport-toolbar button[aria-label="Sombreado con aristas"]';
  const WIRE = '.viewport-toolbar button[aria-label="Vista de alambre"]';
  const GRID = '.viewport-toolbar button[aria-label="Mostrar cuadrícula"]';
  const RIBBON_EDGE = 'button.command[title="Aristas visibles"]';
  const RIBBON_GRID = 'button.command[title="Cuadrícula"]';
  const active = selector => page(selector => {
    const controls = document.querySelectorAll(selector);
    if (controls.length !== 1 || controls[0].disabled) throw Error('One current enabled display control required');
    return controls[0].classList.contains('active');
  }, selector);
  const tab = label => press('.ribbon-tabs button', label);

  await idle();
  await tab('Operaciones');
  await press('.tree-row[data-feature-id="' + document.features.at(-1).id + '"]:not([data-parent-feature-id])');
  const before = await snapshot();
  const savedBytes = await fs.readFile(output);
  const saved = JSON.parse(savedBytes.toString('utf8'));
  check(saved.id === document.id && canonical(saved.features) === canonical(document.features), 'Display aliases own the exact saved original part');
  check(await active(EDGE) && !await active(WIRE) && !await active(GRID), 'Original display begins with opaque shaded edges and no grid');
  const originalNative = before.native.builds.filter(record => record.response?.ok
    && canonical(record.features) === canonical(document.features)).at(-1);
  check(originalNative?.response.value.bodies.length === 1 && !originalNative.response.value.featureErrors.length,
    'The existing independent native original geometry is current before display commands');
  evidence.nativeWitness = { serial: originalNative.serial, body: originalNative.response.value.bodies[0],
    featuresSha256: digest(canonical(document.features)), recoverySha256: digest(before.recovery), savedSha256: digest(savedBytes) };

  async function unchanged(label) {
    check(canonical(await snapshot()) === canonical(before), label + ' preserves exact native observations, document, recovery, history, selection and file authority');
    check((await fs.readFile(output)).equals(savedBytes), label + ' preserves actual saved bytes');
  }
  async function frame(label) {
    await waitForPresentation('Display alias ' + label);
    let previous = '', since = 0;
    const result = await waitFor('exact stationary opaque display crop ' + label, async () => {
      const current = await cameraFrame();
      check(current.width > 0 && current.height > 0 && /^[a-f0-9]{64}$/.test(current.rawSha256)
        && current.maskedRects.length === 0 && current.unmaskedPixelCount === current.width * current.height
        && current.rawSha256 === current.sha256, 'Opaque display evidence has fresh native bytes and no excluded pixels');
      const signature = canonical(current);
      if (signature !== previous) { previous = signature; since = Date.now(); return false; }
      return Date.now() - since >= 500 ? current : false;
    });
    evidence.frames[label] = result;
    return result;
  }
  const baseline = await frame('edges-baseline');
  rasterComparison.retainBaseline(baseline);
  async function compare(current, label, restored) {
    const pixels = rasterComparison.compare(current);
    check(pixels.masks.identical && pixels.masks.expectedPixels === 0 && pixels.masks.actualPixels === 0
      && canonical(pixels.raw) === canonical(pixels.unmasked), 'Comparison uses the entire original unmasked crop');
    if (restored) {
      check(canonical(current) === canonical(baseline) && pixels.raw.changedPixels === 0 && pixels.raw.maxByteDelta === 0,
        label + ' restores exactly the original opaque native bitmap');
    } else {
      check(current.width === baseline.width && current.height === baseline.height && pixels.raw.changedPixels > 0
        && pixels.raw.maxByteDelta > 0 && current.rawSha256 !== baseline.rawSha256, label + ' has a genuine visible native raster effect');
    }
    evidence.transitions.push({ label, restored, pixels });
    await unchanged(label);
  }

  try {
    // Two different controls own one display state in both directions.
    await press(EDGE);
    check(!await active(EDGE) && !await active(WIRE), 'Viewport edge button selects shaded material without edge lines');
    const shaded = await frame('shaded-from-viewport'); await compare(shaded, 'Viewport shaded', false);
    await tab('Vistas');
    check(!await active(RIBBON_EDGE), 'Ribbon edge alias reflects the current shaded state');
    await press(RIBBON_EDGE);
    check(await active(RIBBON_EDGE) && await active(EDGE) && !await active(WIRE), 'Ribbon edge alias restores the shared shaded-with-edges state');
    await tab('Operaciones'); await compare(await frame('edges-restored-by-ribbon'), 'Ribbon edges restore', true);

    await press(WIRE);
    check(await active(WIRE) && !await active(EDGE), 'Wire control selects the actual wire display');
    const wire = await frame('wire-from-viewport'); await compare(wire, 'Viewport wire', false);
    rasterComparison.retainMovedBaseline(wire);
    await press(WIRE);
    check(!await active(WIRE) && await active(EDGE), 'Wire toggle returns to shaded with edges');
    await compare(await frame('edges-restored-by-wire'), 'Wire toggle restore', true);
    await press(WIRE);
    const repeatedWire = await frame('wire-repeated');
    const repeat = rasterComparison.compare(repeatedWire, wire);
    check(canonical(repeatedWire) === canonical(wire) && repeat.raw.changedPixels === 0 && repeat.raw.maxByteDelta === 0,
      'Repeated wire entry reproduces the exact original wire bitmap');
    evidence.wireRepeat = repeat;
    await press(EDGE);
    check(await active(EDGE) && !await active(WIRE), 'Edge control explicitly returns from wire to shaded with edges');
    await compare(await frame('edges-restored-from-wire-by-edge'), 'Cross-control wire restore', true);

    await tab('Vistas');
    await press(RIBBON_EDGE);
    check(!await active(RIBBON_EDGE) && !await active(EDGE) && !await active(WIRE), 'Ribbon edge toggle selects shaded without edges');
    const ribbonShaded = await frame('shaded-from-ribbon');
    check(canonical(ribbonShaded) === canonical(shaded), 'Both shaded entry points produce the exact same opaque bitmap');
    await compare(ribbonShaded, 'Ribbon shaded', false);
    await press(EDGE); await tab('Operaciones');
    await compare(await frame('edges-restored-from-ribbon-by-viewport'), 'Viewport restores ribbon toggle', true);

    // Menu grid already has its own route. Exercise the two remaining aliases.
    await tab('Vistas');
    check(!await active(RIBBON_GRID), 'Ribbon grid alias starts disabled in the display');
    await press(RIBBON_GRID);
    check(await active(RIBBON_GRID) && await active(GRID), 'Ribbon and viewport report the same visible grid');
    const grid = await frame('grid-from-ribbon'); await compare(grid, 'Ribbon grid', false);
    await press(GRID); await tab('Operaciones');
    await compare(await frame('grid-restored-by-viewport'), 'Viewport grid restore', true);
    await press(GRID);
    const viewportGrid = await frame('grid-from-viewport');
    check(canonical(viewportGrid) === canonical(grid), 'Both grid entry points produce the exact same native bitmap');
    await compare(viewportGrid, 'Viewport grid', false);
    await tab('Vistas'); await press(RIBBON_GRID); await tab('Operaciones');
    check(!await active(GRID), 'Grid aliases return to the original off state');
    await compare(await frame('grid-restored-by-ribbon'), 'Ribbon grid restore', true);

    for (const title of ['Propiedades físicas', 'Envolvente']) {
      await tab('Evaluar');
      await press('button.command[title="' + title + '"]');
      const panel = await waitFor('Evaluate ' + title + ' targets the current original piece', () => page(name => {
        const host = document.querySelector('.task-panel');
        if (!host || !host.querySelector('h3')?.textContent.includes('Propiedades físicas')
          || host.querySelector('.panel-intro')?.textContent !== name
          || !host.querySelector('form[aria-label="Material y apariencia de la pieza"]')) return false;
        const measured = [...host.querySelectorAll('[aria-label="Medidas de la pieza"] dt')]
          .map(dt => ({ name: dt.textContent.trim(), value: dt.nextElementSibling?.textContent.trim() }));
        return { name, measured, focusedTitle: document.activeElement?.getAttribute('title') };
      }, document.name));
      check(canonical(panel.measured) === canonical([
        { name: 'Volumen', value: '11,144 cm³' }, { name: 'Masa', value: 'Sin asignar' },
        { name: 'Envolvente X', value: '40.00 mm' }, { name: 'Envolvente Y', value: '30.00 mm' }, { name: 'Envolvente Z', value: '13.00 mm' },
        { name: 'Operaciones', value: '4' }, { name: 'Croquis', value: '4' },
      ]), 'Evaluate alias shows the independently checked original volume, bounds and feature counts');
      await unchanged('Open Evaluate ' + title);
      await press('.task-panel button[title="Cerrar panel"]');
      await waitFor('Evaluate properties panel closes', () => page(() => !document.querySelector('.task-panel')));
      await tab('Operaciones');
      await compare(await frame('after-evaluate-' + (title === 'Envolvente' ? 'bounds' : 'properties')), 'Close Evaluate ' + title, true);
      evidence.properties.push({ title, panel });
    }
    await unchanged('All display aliases completed');
    check((await observe()).serial === before.native.serial, 'All display commands complete without a kernel build or request');
  } finally { rasterComparison.clear(); }
};
