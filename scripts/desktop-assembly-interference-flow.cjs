'use strict';
const fsp = require('node:fs/promises');

// Real production controls and read-only native worker observations. No model,
// report, placement, mesh or solver response is injected into the application.
module.exports = async function interferenceWorkflow(context) {
  const { interferencePath, interferenceFixture, output, observe, waitFor, click, capture, button, control, page, idle,
    responseAfter, checks, ipc, check, canonical, digest, near, close, dialogCounts, consoleErrors, failedRequests } = context;
  const PANEL = '[role="region"][aria-label="Interferencias y holguras"]';
  const CHECK = 'button[aria-label="Comprobar interferencias"]', GAP = 'input[aria-label="Holgura de comprobación"]';
  const SCOPE = 'select[aria-label="Ámbito de interferencias"]';
  const SELECTED = 'select[aria-label="Componentes seleccionados para interferencias"]';
  const EXCLUDED = 'select[aria-label="Componentes excluidos de interferencias"]';
  const ALL = { mode: 'all', selected: [], excluded: [] };
  const phases = [], revisedBytes = await fsp.readFile(output), revised = JSON.parse(revisedBytes.toString('utf8'));
  async function inspect(current, sourcePath, gap, scope = ALL) {
    const recovery = await page(() => localStorage.getItem('solidflow.autosave')), bytes = await fsp.readFile(sourcePath);
    const before = await observe(); await click(CHECK);
    const event = await responseAfter(before.serial, 'inspect-assembly-interferences'), report = event.response.value;
    check(canonical(event.current) === canonical(current) && report.kind === 'assembly-interference-report'
      && report.hasToken === false && report.options.clearance === gap && report.options.includeHidden === true,
    'Analysis did not use the committed document/options, or manufactured Apply authority.');
    check(canonical(event.options.scope ?? ALL) === canonical(scope) && canonical(report.options.scope ?? ALL) === canonical(scope)
      && report.scopeSummary.mode === scope.mode && report.scopeSummary.eligiblePairCount === report.potentialPairCount,
    'Analysis lost exact occurrence scope intent or its native pair accounting.');
    check(report.potentialPairCount === report.testedPairCount + report.broadPhaseExcludedCount,
      'Analysis silently dropped an eligible body pair.');
    await idle('actual native interference analysis completes');
    await waitFor('native report rows reach the rendered panel', () => page((panel, analysisId, encodedIds) => {
      const root = document.querySelector(panel); if (!root) return false;
      const ids = JSON.parse(encodedIds);
      const rows = [...root.querySelectorAll('[data-analysis-pair]')];
      return root.querySelector('[data-analysis-id]')?.getAttribute('data-analysis-id') === analysisId
        && rows.length === ids.length && ids.every(id => rows.some(row => row.getAttribute('data-analysis-pair') === id));
    }, PANEL, report.analysisId, JSON.stringify(report.pairs.map(pair => pair.id))));
    check((await fsp.readFile(sourcePath)).equals(bytes), 'Read-only analysis changed its source file.');
    check(await page(() => localStorage.getItem('solidflow.autosave')) === recovery, 'Read-only analysis changed committed recovery.');
    check(await page(() => document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true),
      'Read-only analysis enabled Apply.');
    phases.push({ phase: 'native-analysis', serial: event.serial, currentSha256: digest(canonical(event.current)), report });
    return report;
  }
  function summary(report, selected, excluded, eligible, pairs) {
    check(canonical(report.scopeSummary) === canonical({ mode: report.options.scope?.mode ?? 'all', selectedLeafCount: selected,
      excludedLeafCount: excluded, eligibleLeafCount: eligible, eligiblePairCount: pairs }), 'Incorrect scoped leaf/pair summary.');
  }
  async function cleared() {
    await waitFor('scope changes revoke the previous report and overlay selection', () => page(panel =>
      !document.querySelector(panel + ' [data-analysis-id]')
        && document.querySelectorAll(panel + ' button[aria-pressed="true"]').length === 0
        && !document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-analysis-pair'), PANEL));
  }
  async function components(selector, references) {
    const keys = references.map(value => JSON.stringify([value.occurrencePath, value.definition.id, value.definition.revision]));
    await page((selector, encoded) => {
      const input = document.querySelector(selector), keys = JSON.parse(encoded);
      if (!(input instanceof HTMLSelectElement) || !input.multiple || input.disabled) throw Error('Expected an enabled scope multiselect.');
      if (keys.some(key => ![...input.options].some(option => option.value === key))) throw Error('Exact scope component option missing.');
      for (const option of input.options) option.selected = keys.includes(option.value);
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, JSON.stringify(keys));
    await waitFor('exact component scope selections reach the rendered controls', () => page((selector, encoded) => {
      const input = document.querySelector(selector), keys = JSON.parse(encoded);
      return input instanceof HTMLSelectElement && [...input.selectedOptions].map(option => option.value).sort().join('\n') === keys.sort().join('\n');
    }, selector, JSON.stringify(keys)));
  }
  async function highlight(pair) {
    await page((panel, id) => {
      const rows = [...document.querySelectorAll(panel + ' [data-analysis-pair]')].filter(row => row.getAttribute('data-analysis-pair') === id);
      const buttons = rows[0] && [...rows[0].querySelectorAll('button')].filter(value => value.hasAttribute('aria-pressed'));
      if (rows.length !== 1 || buttons.length !== 1 || buttons[0].disabled) throw Error('Expected one actual report highlight control.');
      buttons[0].click();
    }, PANEL, pair.id);
    await waitFor('report pair is selected for native world overlay', () => page((panel, id) => {
      const row = [...document.querySelectorAll(panel + ' [data-analysis-pair]')].find(value => value.getAttribute('data-analysis-pair') === id);
      return !!row?.querySelector('button[aria-pressed="true"]')
        && document.querySelector('[aria-label="Visor 3D del ensamblaje"]')?.getAttribute('data-analysis-pair') === id;
    }, PANEL, pair.id));
  }
  await control(GAP, '1');
  const clearance = await inspect(revised, output, 1);
  summary(clearance, 0, 0, 3, 3);
  check(clearance.bodyCount === 3 && clearance.componentCount === 3 && clearance.potentialPairCount === 3
    && clearance.testedPairCount === 2 && clearance.broadPhaseExcludedCount === 1 && clearance.pairs.length === 2,
  'Expected two actual plate/pin clearances and one conservatively distant pin/pin pair.');
  for (const pair of clearance.pairs) {
    check(pair.status === 'clearance' && pair.intersectionVolume === 0 && pair.solidCount === 0
      && pair.intersectionMesh === null && pair.closestPoints, 'A separated plate/pin pair became a collision or lost its native witness.');
    close(pair.minimumDistance, .5, 1e-6, 'Independent R3 minus R2.5 clearance.');
    const sides = [pair.first, pair.second], points = [pair.closestPoints.first, pair.closestPoints.second];
    const plate = sides.findIndex(body => body.component.occurrencePath[0] === 'plate'), pin = 1 - plate;
    check(plate >= 0 && ['left', 'right'].includes(sides[pin].component.occurrencePath[0]), 'Wrong scoped body-pair identity.');
    const centerX = sides[pin].component.occurrencePath[0] === 'left' ? -10 : 10;
    close(Math.hypot(points[plate][0] - centerX, points[plate][1]), 3, 1e-6, 'Plate witness is on the original hole wall.');
    close(Math.hypot(points[pin][0] - centerX, points[pin][1]), 2.5, 1e-6, 'Pin witness is on its revised outer cylinder.');
    close(Math.hypot(...points[0].map((value, i) => value - points[1][i])), .5, 1e-6, 'Native witness separation.');
  }
  await highlight(clearance.pairs[0]); await control(GAP, '.25');
  await waitFor('changing clearance removes the previous report and selection', () => page(panel =>
    document.querySelectorAll(panel + ' [data-analysis-pair]').length === 0
      && document.querySelectorAll(panel + ' button[aria-pressed="true"]').length === 0, PANEL));
  const outside = await inspect(revised, output, .25);
  check(outside.pairs.length === 0 && outside.testedPairCount === 2 && outside.broadPhaseExcludedCount === 1,
    'Native-tested half-millimeter gaps incorrectly passed the quarter-millimeter threshold.');
  check((await fsp.readFile(output)).equals(revisedBytes), 'Analysis/options changed the saved revised assembly.');

  // Derive one original four-box input in the test-owned directory, before Open.
  // The tracked 2x3x4 mm box is reused by two one-child carrier occurrences at
  // x20 and x21; root A/B remain at x0/x1. No application state is injected.
  const trackedInterferenceBytes = await fsp.readFile(interferencePath), scopedFixture = structuredClone(interferenceFixture);
  const nestedDefinition = { id: 'original-analysis-carrier', revision: 'r1' }, boxDefinition = { id: 'original-analysis-box', revision: 'r1' };
  scopedFixture.definitions.push({ kind: 'assembly', ...nestedDefinition, name: 'Original reused analysis carrier',
    createdAt: scopedFixture.createdAt, updatedAt: scopedFixture.updatedAt, mates: [],
    occurrences: [{ ...structuredClone(scopedFixture.occurrences[0]), id: 'child', name: 'Original nested box', fixed: false }] });
  for (const [id, x] of [['nested-left', 20], ['nested-right', 21]]) scopedFixture.occurrences.push({
    ...structuredClone(scopedFixture.occurrences[0]), id, name: 'Original ' + id, fixed: false, definition: { ...nestedDefinition },
    pose: { translation: [x, 0, 0], rotation: [0, 0, 0, 1] } });
  await fsp.writeFile(interferencePath, JSON.stringify(scopedFixture));
  const scopedInputBytes = await fsp.readFile(interferencePath);
  const before = await observe(); await button('Abrir', '.assembly-toolbar');
  const opened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(opened.document) === canonical(scopedFixture), 'Collision fixture did not pass through actual file-open/build routing.');
  await idle('original collision fixture opens');
  const scopedRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
  const collision = await inspect(scopedFixture, interferencePath, .25);
  summary(collision, 0, 0, 4, 6);
  check(collision.bodyCount === 4 && collision.componentCount === 4 && collision.potentialPairCount === 6
    && collision.testedPairCount === 2 && collision.broadPhaseExcludedCount === 4 && collision.pairs.length === 2,
  'Expected two native overlaps and four distant pairs across the four original boxes.');
  const pair = collision.pairs.find(value => [value.first, value.second].every(body => body.component.occurrencePath.length === 1));
  check(!!pair, 'The original root box overlap is missing.');
  const paths = [pair.first.component.occurrencePath.join('/'), pair.second.component.occurrencePath.join('/')].sort();
  check(canonical(paths) === canonical(['box-a', 'box-b']) && pair.status === 'overlap' && pair.solidCount === 1,
    'Collision did not retain both independent occurrence identities and one Common solid.');
  for (const body of [pair.first, pair.second]) check(canonical(body.component.definition) === canonical({ id: 'original-analysis-box', revision: 'r1' })
    && canonical(body.body) === canonical({ bodyId: 'analysis-body', sourceFeatureId: 'box-extrude' }), 'Collision changed the exact source revision/body state.');
  close(pair.intersectionVolume, 12, 1e-5, 'Independent 1 by 3 by 4 Common volume.');
  close(pair.minimumDistance, 0, 1e-6, 'Overlapping material minimum distance.');
  check(pair.intersectionMesh && pair.intersectionMesh.vertexCount > 0 && pair.intersectionMesh.triangleCount >= 12
    && pair.intersectionMesh.normalCount === pair.intersectionMesh.vertexCount, 'Native collision did not provide a complete solid-only display mesh.');
  near(pair.intersectionMesh.bounds.min, [1, 0, 0], 1e-6, 'Actual Common mesh minimum.');
  near(pair.intersectionMesh.bounds.max, [2, 3, 4], 1e-6, 'Actual Common mesh maximum.');
  const nestedPair = collision.pairs.find(value => [value.first, value.second].every(body => body.component.occurrencePath.length === 2));
  check(!!nestedPair && nestedPair.status === 'overlap' && nestedPair.solidCount === 1, 'Reused nested instances lost their independent overlap.');
  close(nestedPair.intersectionVolume, 12, 1e-5, 'Independent nested Common volume.');
  near(nestedPair.intersectionMesh?.bounds.min, [21, 0, 0], 1e-6, 'Nested Common minimum.');
  near(nestedPair.intersectionMesh?.bounds.max, [22, 3, 4], 1e-6, 'Nested Common maximum.');
  await highlight(pair);
  await page(panel => { const detail = document.querySelector(panel + ' details'); if (!detail) throw Error('Scope disclosure missing.'); detail.open = true; }, PANEL);
  const rootSelection = ['box-a', 'box-b'].map(id => ({ occurrencePath: [id], definition: { ...boxDefinition } }));
  await control(SCOPE, 'among-selected'); await cleared(); await components(SELECTED, rootSelection);
  const amongScope = { mode: 'among-selected', selected: rootSelection, excluded: [] };
  const among = await inspect(scopedFixture, interferencePath, .25, amongScope);
  summary(among, 2, 0, 2, 1);
  check(among.bodyCount === 2 && among.componentCount === 2 && among.potentialPairCount === 1 && among.testedPairCount === 1
    && among.broadPhaseExcludedCount === 0 && among.pairs.length === 1 && among.pairs[0].id === pair.id,
  'Among-selected mode included a leaf outside its exact root selection.');
  await highlight(among.pairs[0]); await control(SCOPE, 'selected-against-rest'); await cleared();
  const crossScope = { ...amongScope, mode: 'selected-against-rest' };
  const cross = await inspect(scopedFixture, interferencePath, .25, crossScope);
  summary(cross, 2, 0, 4, 4);
  check(cross.bodyCount === 4 && cross.componentCount === 4 && cross.potentialPairCount === 4 && cross.testedPairCount === 0
    && cross.broadPhaseExcludedCount === 4 && cross.pairs.length === 0,
  'Cross-group mode tested an internal group pair or dropped an eligible distant pair.');
  await control(SCOPE, 'all'); await cleared();
  check(await page(selector => { const input = document.querySelector(selector); return input?.disabled === true && input.selectedOptions.length === 0; }, SELECTED),
    'Returning to all mode did not explicitly clear the selected component identities.');
  const leftChild = { occurrencePath: ['nested-left', 'child'], definition: { ...boxDefinition } };
  await components(EXCLUDED, [leftChild]);
  const excludedScope = { ...ALL, excluded: [leftChild] }, excluded = await inspect(scopedFixture, interferencePath, .25, excludedScope);
  summary(excluded, 0, 1, 3, 3);
  check(excluded.bodyCount === 3 && excluded.componentCount === 3 && excluded.potentialPairCount === 3 && excluded.testedPairCount === 1
    && excluded.broadPhaseExcludedCount === 2 && excluded.pairs.length === 1 && excluded.pairs[0].id === pair.id,
  'Excluding one nested instance also removed its reused sibling, or retained its overlap.');
  await control(SCOPE, 'selected-against-rest'); await cleared();
  const leftParent = { occurrencePath: ['nested-left'], definition: { ...nestedDefinition } };
  const rightChild = { occurrencePath: ['nested-right', 'child'], definition: { ...boxDefinition } };
  await components(SELECTED, [leftParent]); await components(EXCLUDED, [rightChild]);
  const prefixScope = { mode: 'selected-against-rest', selected: [leftParent], excluded: [rightChild] };
  const prefix = await inspect(scopedFixture, interferencePath, .25, prefixScope);
  summary(prefix, 1, 1, 3, 2);
  check(prefix.bodyCount === 3 && prefix.componentCount === 3 && prefix.potentialPairCount === 2 && prefix.testedPairCount === 0
    && prefix.broadPhaseExcludedCount === 2 && prefix.pairs.length === 0,
  'A selected subassembly prefix did not resolve its exact leaf separately from the excluded reused instance.');
  await components(EXCLUDED, [leftChild, rightChild]); await cleared();
  const dominatedScope = { ...prefixScope, excluded: [leftChild, rightChild] };
  const dominated = await inspect(scopedFixture, interferencePath, .25, dominatedScope);
  summary(dominated, 1, 2, 2, 0);
  check(dominated.bodyCount === 2 && dominated.componentCount === 2 && dominated.potentialPairCount === 0
    && dominated.testedPairCount === 0 && dominated.broadPhaseExcludedCount === 0 && dominated.pairs.length === 0,
  'An exclusion did not dominate a selected subassembly descendant.');
  await control(SCOPE, 'all'); await components(EXCLUDED, []); await cleared();
  check((await fsp.readFile(interferencePath)).equals(scopedInputBytes) && (await fsp.readFile(output)).equals(revisedBytes)
    && await page(() => localStorage.getItem('solidflow.autosave')) === scopedRecovery,
    'Scope edits changed committed assembly input or saved revised bytes.');
  await page(name => {
    const rows = [...document.querySelectorAll('[role="treeitem"]')].filter(row => row.querySelector('span')?.firstChild?.textContent === name);
    if (rows.length !== 1 || rows[0].disabled) throw Error('Expected the actual collision component tree control.');
    rows[0].click();
  }, 'Caja B');
  await waitFor('collision component exposes its actual movement controls', () => page(() =>
    document.querySelector('input[aria-label="Nombre del componente"]')?.value === 'Caja B'
      && !!document.querySelector('[aria-label="Mover componente con relaciones"]')));
  check(dialogCounts().opens === 10 && dialogCounts().saves === 2 && ipc.filter(event => event.channel === 'document:save').length === 5
    && ipc.every(event => event.completed), 'Read-only analysis unexpectedly wrote a document or changed the native file sequence.');
  const final = await observe(); check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Interference renderer/worker failure.');
  checks.push({ trackedInterferenceInputSha256: digest(trackedInterferenceBytes), interferenceInputSha256: digest(scopedInputBytes), unchangedRevisedFileSha256: digest(revisedBytes), phases,
    independentOracles: 'Plate holes R3/revised pinsR2.5: gap.5, native witnesses radial3/2.5; threshold.25 gives0hits; original boxes2x3x4 atx0/1/20/21: two CommonV12/boundsx1..2and21..22,y0..3,z0..4; all6pairs,amongroots1,crossroots4,oneexactnestedexclusion3,prefixcross2,excludedselecteddescendant0; V1e-5,length/meshbounds1e-6',
    evidenceLimits: 'Scripted real report controls and actual native worker DTOs/mesh extents; no state/report injection, human pointer/native-dialog interaction, continuous collision, installed package or general platform claim.' });
};
