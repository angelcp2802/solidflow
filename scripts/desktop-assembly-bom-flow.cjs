'use strict';
const fsp = require('node:fs/promises');

// Counts and CSV records are independently declared here for the original
// tracked fixture. Only real DOM controls/native file IPC supply the result.
module.exports = async function bomWorkflow(context) {
  context = require('./desktop-assembly-navigation.cjs').withNavigation(context);
  const assemblyNavigation = context.assemblyNavigation;
  const { bomPath, bomFixture, bomCsvOutputs, observe, waitFor, click, capture, button, control, page, idle, responseAfter,
    checks, ipc, check, canonical, digest, close, dialogCounts, consoleErrors, failedRequests } = context;
  const REGION = '[aria-label="Lista de materiales del ensamblaje"]', MODE = 'select[aria-label="Modo de lista de materiales"]';
  const HIDDEN = 'input[aria-label="Incluir componentes ocultos en la lista de materiales"]', EXPORT = 'button[aria-label="Exportar lista de materiales CSV"]';
  const original = await fsp.readFile(bomPath), phases = [];
  let before = await observe(); await button('Abrir', ':is(.assembly-toolbar, .assembly-quickbar)');
  const opened = await responseAfter(before.serial, 'build-assembly');
  check(canonical(opened.document) === canonical(bomFixture), 'BOM fixture did not open through actual file routing.');
  await idle('original reusable BOM fixture opens');
  close(opened.response.value.volume, 368, 1e-7, 'Original active native volume 4x64+2x8+96');
  close(opened.response.value.area, 560, 1e-7, 'Original active native area 4x96+2x24+128');
  check(opened.response.value.solidCount === 7 && opened.response.value.bodies.length === 7 && opened.response.value.prototypeCount === 3,
    'Original active native leaves/revisions differ from the count fixture.');
  const start = await observe(), recovery = await page(() => localStorage.getItem('solidflow.autosave'));
  await require('./desktop-assembly-tree-controls.cjs')({ ...context, navigation: assemblyNavigation });
  await click('button[aria-label="Lista de materiales"]');
  await waitFor('BOM drawer is actually rendered', () => page(selector => !!document.querySelector(selector), REGION));
  async function table(phase) {
    const result = await page(selector => [...document.querySelectorAll(selector + ' tr[data-bom-row]')].map(row => ({
      item: row.cells[0].textContent.trim(), name: row.cells[2].querySelector('strong').textContent, id: row.cells[3].textContent,
      revision: row.cells[4].textContent, local: row.cells[5].textContent, total: Number(row.cells[6].textContent),
      selected: row.getAttribute('data-selected-member'), memberPaths: [...row.querySelector('select').options].filter(option => option.value).map(option => JSON.parse(option.value)),
    })), REGION);
    phases.push({ phase, rows: result }); return result;
  }
  function assertRows(actual, expected, phase) {
    check(canonical(actual.map(row => [row.item, row.id, row.revision, row.local, row.total, row.memberPaths])) === canonical(expected), phase + ' grouped quantities/full paths differ.');
  }
  const allP = [['g-a', 'p-a'], ['g-a', 'p-b'], ['g-b', 'p-a'], ['g-b', 'p-b']], allQ = [['g-a', 'q'], ['g-b', 'q']], p2 = [['p-r2']];
  assertRows(await table('bom/parts-default'), [
    ['1', 'bom-part', 'r1', '—', 4, allP], ['2', 'bom-small', 'r1', '—', 2, allQ], ['3', 'bom-part', 'r2', '—', 1, p2],
  ], 'Parts-only default');
  const common = 'Pieza "común", estándar', small = '=SUM(1,2)';
  async function chooseHidden() {
    await page(encodedPath => { const path = JSON.parse(encodedPath);
      const row = [...document.querySelectorAll('tr[data-bom-row]')].find(value => value.cells[3].textContent === 'bom-part' && value.cells[4].textContent === 'r1');
      if (!row) throw Error('Actual P(r1) row missing'); const select = row.querySelector('select');
      if (select.disabled || ![...select.options].some(option => option.value === JSON.stringify(path))) throw Error('Actual full hidden path choice missing');
      select.value = JSON.stringify(path); select.dispatchEvent(new Event('change', { bubbles: true }));
    }, JSON.stringify(['g-b', 'p-b']));
    await waitFor('BOM selection reaches the exact reused hidden occurrence', () => page(() => {
      const rows = [...document.querySelectorAll('[role="treeitem"]')], selected = rows.map((row, index) => row.getAttribute('aria-selected') === 'true' ? index : -1).filter(index => index >= 0);
      return selected.length === 1 && selected[0] === 6 && document.querySelector('tr[data-selected-member]')?.getAttribute('data-selected-member') === '["g-b","p-b"]';
    }));
  }
  await chooseHidden(); await table('bom/exact-hidden-member-selected');
  const headers = ['Item', 'Type', 'Name', 'Definition ID', 'Revision', 'Quantity per parent', 'Total quantity', 'Occurrence paths'];
  const text = value => "'" + value, paths = value => text(JSON.stringify(value));
  const golden = rows => Buffer.from('\ufeff' + [headers, ...rows].map(row => row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',') + '\r\n').join(''), 'utf8');
  async function exportCsv(phase, expected, output) {
    const prior = ipc.filter(value => value.channel === 'document:export').length;
    await click(EXPORT);
    await waitFor('BOM native export and rendered controls complete', () => ipc.filter(value => value.channel === 'document:export' && value.completed).length === prior + 1);
    await waitFor('BOM export returns to confirmed controls', () => page(selector => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false' && document.querySelector(selector)?.disabled === false, EXPORT));
    const entry = ipc.filter(value => value.channel === 'document:export').at(-1), bytes = golden(expected);
    check(entry.csv.bytes === bytes.length && entry.csv.sha256 === digest(bytes), 'Actual CSV IPC payload differs from independent golden records.');
    if (output) check((await fsp.readFile(output)).equals(bytes), 'Actual native CSV bytes differ from the requested table/filter.');
    else for (const file of bomCsvOutputs) check(await fsp.access(file).then(() => false, () => true), 'Cancelled CSV export wrote an output.');
    phases.push({ phase, bytes: bytes.length, csvSha256: digest(bytes), cancelled: !output });
  }
  const flat = [
    [text('1'), text('part'), text(common), text('bom-part'), text('r1'), '', '4', paths(allP)],
    [text('2'), text('part'), text(small), text('bom-small'), text('r1'), '', '2', paths(allQ)],
    [text('3'), text('part'), text(common), text('bom-part'), text('r2'), '', '1', paths(p2)],
  ];
  await exportCsv('bom/csv-cancelled', flat, null); await exportCsv('bom/csv-parts', flat, bomCsvOutputs[0]);
  await click(HIDDEN);
  await waitFor('BOM hidden filter removes inherited hidden uses', () => page(selector => document.querySelector(selector)?.checked === false && document.querySelectorAll('tr[data-bom-row]')[0]?.cells[6].textContent === '2', HIDDEN));
  assertRows(await table('bom/parts-visible'), [
    ['1', 'bom-part', 'r1', '—', 2, allP.slice(0, 2)], ['2', 'bom-small', 'r1', '—', 1, allQ.slice(0, 1)], ['3', 'bom-part', 'r2', '—', 1, p2],
  ], 'Parts-only visible');
  check(await page(() => document.querySelector('tr[data-selected-member]') === null), 'Filtering fabricated a selected member in the surviving row.');
  await control(MODE, 'top-level');
  await waitFor('BOM top-level rows render', () => page(() => document.querySelectorAll('tr[data-bom-row]').length === 2));
  assertRows(await table('bom/top-visible'), [
    ['1', 'bom-group', 'g1', '1', 1, [['g-a']]], ['2', 'bom-part', 'r2', '1', 1, p2],
  ], 'Top-level visible');
  await exportCsv('bom/csv-top-visible', [
    [text('1'), text('assembly'), text('Conjunto reutilizable'), text('bom-group'), text('g1'), '1', '1', paths([['g-a']])],
    [text('2'), text('part'), text(common), text('bom-part'), text('r2'), '1', '1', paths(p2)],
  ], bomCsvOutputs[1]);
  await control(MODE, 'indented');
  await waitFor('BOM hierarchy mode commits before changing its filter', () => page(selector => document.querySelector(selector)?.value === 'indented'
    && document.querySelectorAll('tr[data-bom-row]').length === 4 && document.querySelectorAll('tr[data-bom-row]')[1].cells[0].textContent === '1.1', MODE));
  await click(HIDDEN);
  await waitFor('BOM hierarchy includes both active reused groups', () => page(() => document.querySelectorAll('tr[data-bom-row]').length === 4 && document.querySelectorAll('tr[data-bom-row]')[0].cells[6].textContent === '2'));
  const groups = [['g-a'], ['g-b']];
  assertRows(await table('bom/indented-default'), [
    ['1', 'bom-group', 'g1', '2', 2, groups], ['1.1', 'bom-part', 'r1', '2', 4, allP], ['1.2', 'bom-small', 'r1', '1', 2, allQ], ['2', 'bom-part', 'r2', '1', 1, p2],
  ], 'Indented default');
  await exportCsv('bom/csv-indented', [
    [text('1'), text('assembly'), text('Conjunto reutilizable'), text('bom-group'), text('g1'), '2', '2', paths(groups)],
    [text('1.1'), text('part'), text(common), text('bom-part'), text('r1'), '2', '4', paths(allP)],
    [text('1.2'), text('part'), text(small), text('bom-small'), text('r1'), '1', '2', paths(allQ)],
    [text('2'), text('part'), text(common), text('bom-part'), text('r2'), '1', '1', paths(p2)],
  ], bomCsvOutputs[2]);
  const bomState = () => page(selector => {
    const panel = document.querySelector(selector);
    return panel && { rows: panel.querySelector('tbody')?.textContent,
      controls: [...panel.querySelectorAll('select,input')].map(el => [el.getAttribute('aria-label'), el.value, el.checked ?? null]) };
  }, REGION);
  const beforeTab = await bomState();
  await assemblyNavigation.ribbon('assembly');
  check(canonical(await bomState()) === canonical(beforeTab), 'Changing ribbon tab retains the open BOM rows, mode, filter and member choices.');
  await click('button[aria-label="Cerrar lista de materiales"]');
  await waitFor('BOM drawer closes without changing CAD state', () => page(selector => !document.querySelector(selector), REGION));
  await waitFor('BOM close reveals Evaluar and restores visible trigger focus', () => page(() => {
    const tab = document.querySelector('[data-assembly-command-tab="evaluate"]'), panel = document.querySelector('[data-assembly-command-panel="evaluate"]');
    const trigger = document.querySelector('button[aria-label="Lista de materiales"]'), rect = trigger?.getBoundingClientRect();
    return tab?.getAttribute('aria-selected') === 'true' && panel?.hidden === false && trigger && !trigger.disabled
      && document.activeElement === trigger && !!rect?.width && !!rect.height && !trigger.closest('[hidden]')
      && trigger.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  }));
  phases.push({ phase: 'bom/ribbon-change-close-focus', tab: 'evaluate', focusedControl: 'Lista de materiales' });
  await click('button[aria-label="Lista de materiales"]'); await waitFor('BOM drawer reopens', () => page(selector => !!document.querySelector(selector), REGION));
  const final = await observe();
  check(final.serial === start.serial && await page(() => localStorage.getItem('solidflow.autosave')) === recovery && (await fsp.readFile(bomPath)).equals(original),
    'BOM/filter/selection/export changed CAD requests, committed recovery or the source file.');
  check(await page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true
    && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true), 'BOM created a history transaction or Apply capability.');
  check(dialogCounts().opens === 13 && dialogCounts().saves === 3 && dialogCounts().csvExports === 4
    && ipc.filter(value => value.channel === 'document:save').length === 6 && ipc.every(value => value.completed), 'Unexpected BOM native file sequence.');
  check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'BOM renderer/worker failure.');
  await button('Frontal', '.assembly-view-tools'); await capture(bomFixture);
  checks.push({ bomInputSha256: digest(original), phases, geometry: { volume: opened.response.value.volume, area: opened.response.value.area, solids: opened.response.value.solidCount },
    independentOracles: 'Two active G, one hidden; each2P(r1)+Q; third G suppressed, rootP(r2), unused source. FlatP1=4/Q2/P2=1; visible2/1/1; top-visibleG1/P2=1; indentedG2,P local2/total4,Q1/2,P2=1. Real nativeV368/A560/7solids/3prototypes; 3 exact UTF8BOM+RFC4180+textmarker CSV files and one native cancellation; unchanged document/history/recovery/noCADrequests.',
    evidenceLimits: 'Declaration quantities, actual DOM and native export IPC only; no mass/material/configuration/BOM purchasing metadata, supplier resolution, spreadsheet execution or generic platform/complete assembly claim.' });
};
