'use strict';

// Original geometry is drawn by the caller. These operations exercise the real
// ribbon, SVG targets and visible controls; expected coordinates are literal.
module.exports = async function sketchTools(context) {
  const { page, press, change, check, checks, canonical, observe, response, sketch,
    selectAt, calibration, pointer, stroke, localHistory, zoom, committed, solid,
    recovery, original, waitFor, near } = context;
  const evidence = { tools: [], limits: 'One original XY 4x2 rectangle, edited through actual ribbon and SVG controls. Local Apply, exact local Undo/Redo and direct whole-edit Cancel; this does not claim all variants, physical hardware input or a saved modified-tool solid.' };
  checks.push({ sketchTools: evidence });
  const feature = original.record.features[0], baseline = feature.profile;
  const profileOf = record => record.features[0].profile;
  const point = (profile, id) => id === 'origin' ? { x: 0, y: 0 } : profile.points.find(value => value.id === id);
  const samePoint = (profile, id, x, y) => { const p = point(profile, id); return p && Math.abs(p.x - x) <= 1e-6 && Math.abs(p.y - y) <= 1e-6; };
  const lineAt = (profile, x1, y1, x2, y2) => profile.entities.filter(entity => entity.type === 'line' &&
    (samePoint(profile, entity.start, x1, y1) && samePoint(profile, entity.end, x2, y2)
      || samePoint(profile, entity.end, x1, y1) && samePoint(profile, entity.start, x2, y2)));
  const baselineEntities = new Set(baseline.entities.map(entity => entity.id));
  const top = lineAt(baseline, 0, 2, 4, 2), bottom = lineAt(baseline, 0, 0, 4, 0);
  check(top.length === 1 && bottom.length === 1, 'Literal original top and bottom edges are unique');
  const right = lineAt(baseline, 4, 0, 4, 2);
  check(right.length === 1, 'Literal original right edge is unique');
  function unchangedLines(profile, excludedIds, label) {
    for (const line of baseline.entities) {
      if (excludedIds.includes(line.id)) continue;
      const current = profile.entities.find(entity => entity.id === line.id);
      const start = point(baseline, line.start), end = point(baseline, line.end);
      check(canonical(current) === canonical(line)
        && samePoint(profile, line.start, start.x, start.y) && samePoint(profile, line.end, end.x, end.y),
        label + ' preserves each unaffected original line, endpoints and construction state');
    }
  }
  const treeToggle = 'button[data-part-tree-toggle="' + original.record.features[1].id + '"]';
  if (await page(selector => document.querySelector(selector)?.getAttribute('aria-expanded') === 'false', treeToggle)) await press(treeToggle);
  await press('.tree-row[data-feature-id="' + feature.id + '"][data-parent-feature-id="' + original.record.features[1].id + '"]');
  let serial = (await observe()).serial;
  await press('.selection-tools button[title="Editar operación"]');
  await waitFor('original rectangle sketch tools editor', () => page(() => !!document.querySelector('svg[aria-label="Editor de croquis multientidad"]')));
  await zoom();
  const initial = await sketch(serial, profile => canonical(profile) === canonical(baseline), 'tools-original-editor');
  const unchangedRecovery = async label => check(await recovery() === original.snapshot.recovery, label + ' preserves the exact committed document recovery');
  async function clickEntity(coordinates, entityId, tool) {
    await press('button.command[title="' + tool + '"]');
    const target = await calibration([coordinates]), p = target.points[0];
    check(await page((point, id) => document.elementFromPoint(point.x, point.y)
      ?.closest('[data-selection-kind="entity"]')?.getAttribute('data-selection-id') === id, p, entityId),
    tool + ' targets the exact current SVG line');
    await pointer('mouseMoved', p); await pointer('mousePressed', p, 1); await pointer('mouseReleased', p, 0);
    evidence.tools.push({ tool, input: 'Actual CDP SVG press/release', entityId, coordinates, point: p });
  }
  async function reset(before, after, label) {
    await localHistory(before, after, label);
    const afterSerial = (await observe()).serial; await press('button[title="Deshacer (Ctrl+Z)"]');
    const restored = await sketch(afterSerial, profile => canonical(profile) === canonical(profileOf(before)), label + '-reset');
    check(canonical(restored.features) === canonical(before.features), label + ' returns to the exact original source IDs and constraints');
    await unchangedRecovery(label);
  }
  async function invalidField(selector, apply, preview, label) {
    await change(selector, 0);
    await waitFor(label + ' invalid input blocks local Apply', () => page((selector, apply, preview) => document.querySelector(selector)?.getAttribute('aria-invalid') === 'true'
      && document.querySelector(apply)?.disabled && !document.querySelector(preview), selector, apply, preview));
    await unchangedRecovery(label + ' invalid input');
    evidence.tools.push({ tool: label, rejectedValue: '0', applyDisabled: true, previewAbsent: true });
    await change(selector, 0.5);
    await waitFor(label + ' corrected input has an applicable preview', () => page((apply, preview) => !!document.querySelector(preview) && !document.querySelector(apply)?.disabled, apply, preview));
  }
  async function applyFromRibbon(label) {
    const selector = 'button.command[title="' + label + '"]';
    await waitFor('enabled sketch Apply ribbon alias ' + label, () => page(selector => {
      const button = document.querySelector(selector);
      return !!button && !button.disabled;
    }, selector));
    const before = (await observe()).serial;
    await press(selector);
    evidence.tools.push({ tool: label, input: 'Actual CDP ribbon press/release' });
    return before;
  }

  // Open a different tool first so a no-op Relations button cannot pass.
  await selectAt([2, 0], 'entity');
  await press('button.command[title="Chaflán de croquis"]');
  await waitFor('different sketch tool is visible before Relations', () => page(() => !!document.querySelector('.chamfer-property')));
  serial = (await observe()).serial;
  await press('button.command[title="Relaciones de croquis"]');
  await waitFor('real Relations ribbon alias switches from chamfer to the existing inspector', () => page(() =>
    !!document.querySelector('.relation-choices') && !document.querySelector('.chamfer-property')));
  check((await observe()).serial === serial, 'Relations inspector alias dispatches no CAD build');
  await unchangedRecovery('Relations inspector alias');

  await selectAt([4, 2], 'point'); await press('button.command[title="Chaflán de croquis"]');
  await invalidField('input[aria-label="Distancia en A y B"]', 'button[aria-label="Aplicar chaflán"]', '[data-chamfer-preview="true"]', 'chamfer');
  serial = await applyFromRibbon('Aplicar chaflán');
  let changed = await sketch(serial, profile => profile.entities.filter(entity => !entity.construction).length === 5, 'tools-chamfer-local-apply');
  let profile = profileOf(changed);
  check(profile.entities.length === 7 && profile.entities.every(entity => entity.type === 'line')
    && lineAt(profile, 3.5, 2, 4, 1.5).filter(entity => !entity.construction).length === 1
    && lineAt(profile, 0, 2, 3.5, 2).length === 1 && lineAt(profile, 4, 0, 4, 1.5).length === 1,
    'Literal half-millimetre chamfer trims the incident sides and adds the fifth contour line');
  check(profile.entities.filter(entity => entity.construction).length === 2
    && lineAt(profile, 4, 2, 4, 1.5).some(entity => entity.construction)
    && lineAt(profile, 4, 2, 3.5, 2).some(entity => entity.construction),
    'Two construction supports retain both distances to the original corner');
  check([...baselineEntities].every(id => profile.entities.some(entity => entity.id === id)), 'Chamfer retains the original four line identities');
  unchangedLines(profile, [top[0].id, right[0].id], 'Chamfer');
  await reset(initial, changed, 'tools-chamfer');

  await selectAt([4, 2], 'point'); await press('button.command[title="Redondeo de croquis"]');
  await change('select[aria-label="Relación de radios"]', 'independent');
  await change('select[aria-label="Esquina original"]', 'delete');
  await invalidField('input[aria-label="Radio del redondeo"]', 'button[aria-label="Aplicar redondeo"]', '[data-fillet-preview="true"]', 'fillet');
  serial = await applyFromRibbon('Aplicar redondeo');
  changed = await sketch(serial, profile => profile.entities.some(entity => entity.type === 'arc'), 'tools-fillet-local-apply');
  profile = profileOf(changed);
  const arcs = profile.entities.filter(entity => entity.type === 'arc' && !entity.construction);
  check(arcs.length === 1 && profile.entities.filter(entity => !entity.construction).length === 5, 'One real corner fillet leaves four straight sides and one arc');
  const arc = arcs[0], centre = point(profile, arc.center);
  near(centre.x, 3.5, 1e-6, 'Literal fillet centre X'); near(centre.y, 1.5, 1e-6, 'Literal fillet centre Y');
  check(samePoint(profile, arc.start, 4, 1.5) && samePoint(profile, arc.end, 3.5, 2)
    || samePoint(profile, arc.end, 4, 1.5) && samePoint(profile, arc.start, 3.5, 2), 'Fillet endpoints are independently tangent to the original horizontal and vertical sides');
  const filletAngles = [arc.start, arc.end].map(id => {
    const endpoint = point(profile, id);
    near(Math.hypot(endpoint.x - centre.x, endpoint.y - centre.y), 0.5, 1e-6, 'Literal fillet radius');
    return Math.atan2(endpoint.y - centre.y, endpoint.x - centre.x);
  });
  const turn = 2 * Math.PI;
  const directedSweep = (arc.clockwise ? filletAngles[0] - filletAngles[1] : filletAngles[1] - filletAngles[0]);
  near((directedSweep + turn) % turn, Math.PI / 2, 1e-6, 'Actual saved direction describes the quarter-arc, not the major arc');
  check(lineAt(profile, 0, 2, 3.5, 2).length === 1 && lineAt(profile, 4, 0, 4, 1.5).length === 1,
    'Both adjacent contour lines end at the actual fillet contacts');
  unchangedLines(profile, [top[0].id, right[0].id], 'Fillet');
  await reset(initial, changed, 'tools-fillet');

  await selectAt([2, 2], 'entity'); await press('button.command[title="Simetría de croquis"]');
  check(await page(() => document.querySelector('button[aria-label="Aplicar simetría"]')?.disabled), 'Mirror requires its current explicit axis');
  await change('select[aria-label="Eje de simetría"]', bottom[0].id);
  await waitFor('real mirror preview', () => page(() => !!document.querySelector('[data-mirror-preview="true"]') && !document.querySelector('button[aria-label="Aplicar simetría"]')?.disabled));
  serial = await applyFromRibbon('Aplicar simetría');
  changed = await sketch(serial, profile => profile.entities.length === 5, 'tools-mirror-local-apply');
  profile = profileOf(changed);
  check(lineAt(profile, 0, -2, 4, -2).length === 1 && profile.entities.filter(entity => !baselineEntities.has(entity.id)).length === 1,
    'Mirror copies the selected y=2 line to literal y=-2 about the selected y=0 axis');
  unchangedLines(profile, [], 'Mirror');
  await reset(initial, changed, 'tools-mirror');

  await selectAt([2, 0], 'entity'); await press('button.command[title="Equidistancia de entidades"]');
  await press('.offset-property label:has(input[type="checkbox"])', 'Seleccionar cadena conectada');
  await press('.offset-property label:has(input[type="checkbox"])', 'Ambas direcciones');
  check(await page(() => {
    const controls = [...document.querySelectorAll('.offset-property label:has(input[type="checkbox"])')];
    const checked = label => controls.find(element => element.textContent.trim() === label)?.querySelector('input').checked;
    return checked('Ambas direcciones') === true && checked('Seleccionar cadena conectada') === false;
  }),
    'Offset uses both directions and one selected line, without connected-chain adoption');
  await invalidField('input[aria-label="Distancia de equidistancia"]', 'button[aria-label="Aplicar equidistancia"]', '[data-offset-preview="true"]', 'offset');
  serial = await applyFromRibbon('Aplicar equidistancia');
  changed = await sketch(serial, profile => profile.entities.length === 6, 'tools-offset-local-apply');
  profile = profileOf(changed);
  check(lineAt(profile, 0, 0.5, 4, 0.5).length === 1 && lineAt(profile, 0, -0.5, 4, -0.5).length === 1
    && profile.entities.filter(entity => !baselineEntities.has(entity.id)).length === 2, 'Two literal half-millimetre offsets retain the original finite endpoints');
  unchangedLines(profile, [], 'Offset');
  await reset(initial, changed, 'tools-offset');

  serial = (await observe()).serial; await clickEntity([2, 2], top[0].id, 'Recortar entidades');
  changed = await sketch(serial, profile => profile.entities.length === 3, 'tools-trim-local-apply');
  profile = profileOf(changed);
  check(!profile.entities.some(entity => entity.id === top[0].id) && profile.entities.every(entity => baselineEntities.has(entity.id)), 'Trim removes the selected whole top span between its two actual intersections');
  unchangedLines(profile, [top[0].id], 'Trim');
  await reset(initial, changed, 'tools-trim');

  serial = await stroke('Línea', [[1, 1], [3, 1]], true);
  const extendSource = await sketch(serial, profile => profile.entities.length === 5, 'tools-extend-original-inner-line');
  const innerLine = lineAt(profileOf(extendSource), 1, 1, 3, 1);
  check(innerLine.length === 1, 'Actual pointer drawing creates the literal inner finite line');
  serial = (await observe()).serial; await clickEntity([2.9, 1], innerLine[0].id, 'Extender entidades');
  changed = await sketch(serial, profile => lineAt(profile, 1, 1, 4, 1).length === 1, 'tools-extend-local-apply');
  check(profileOf(changed).entities.length === 5 && profileOf(changed).entities.some(entity => entity.id === innerLine[0].id),
    'Extend preserves the finite source line identity and reaches the first literal x=4 boundary');
  unchangedLines(profileOf(changed), [], 'Extend');
  await localHistory(extendSource, changed, 'tools-extend');
  check(canonical(profileOf(changed)) !== canonical(baseline), 'The redone Extend profile differs from the committed rectangle before Cancel');
  await unchangedRecovery('Extended draft before full Cancel');

  serial = (await observe()).serial; await press('button[title="Cancelar operación"]');
  const cancelled = solid(await response(serial, features => canonical(features) === canonical(original.record.features), 'tools-whole-edit-cancel'), 'rectangle', 'tools-whole-edit-cancel', 4);
  check(canonical(await committed(cancelled.features, 'tools-whole-edit-cancel')) === canonical(original.snapshot)
    && canonical(cancelled.response.value.bodies) === canonical(original.record.response.value.bodies), 'Direct whole-edit Cancel restores exact committed features, native geometry, history, dirty state and recovery');
  evidence.completedFamilies = ['relations-inspector', 'chamfer', 'fillet', 'mirror', 'offset', 'trim', 'extend'];
};
