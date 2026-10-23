'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Scripted real production controls with read-only observations of native replies.
module.exports = function multibodyInterferenceWorkflow(context) {
  const { expected, input, observe, waitFor, click, capture, evaluate, checks, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts, consoleErrors, failedRequests } = context;
  const PANEL = '[role="region"][aria-label="Interferencias y holguras"]';
  const CHECK = 'button[aria-label="Comprobar interferencias"]';
  const SCOPE = 'select[aria-label="Ámbito de interferencias"]';
  const SELECTED = 'select[aria-label="Componentes seleccionados para interferencias"]';
  const WITHIN = 'input[aria-label="Incluir cuerpos de una misma pieza"]';
  const ALL = { mode: 'all', selected: [], excluded: [] }, phases = [];
  const page = (fn, ...args) => evaluate('(' + fn.toString() + ')(' + args.map(encodeJavaScriptString).join(',') + ')');
  const close = (actual, desired, tolerance, message) => check(Number.isFinite(actual) && Math.abs(actual - desired) < tolerance,
    message + '; actual=' + actual + ', expected=' + desired + ', tolerance=' + tolerance);
  const near = (actual, desired, tolerance, message) => {
    check(Array.isArray(actual) && actual.length === desired.length, message + ' dimensions');
    actual.forEach((value, index) => close(value, desired[index], tolerance, message + '[' + index + ']'));
  };
  async function button(text, parent = '.assembly-app') {
    await page((text, parent) => {
      const buttons = [...document.querySelectorAll(parent + ' button')].filter(value => value.textContent.trim() === text);
      if (buttons.length !== 1 || buttons[0].disabled) throw Error('Expected one enabled assembly button: ' + text);
      buttons[0].click();
    }, text, parent);
  }
  async function control(selector, value) {
    await page((selector, value) => {
      const input = document.querySelector(selector);
      if (!input || input.disabled) throw Error('Expected an editable assembly control: ' + selector);
      const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      if (input instanceof HTMLSelectElement && ![...input.options].some(option => option.value === value)) throw Error('Actual scene option missing.');
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
    await waitFor('assembly control records ' + selector, () => page((selector, value) => document.querySelector(selector)?.value === value, selector, value));
  }
  async function idle(description) {
    await waitFor(description, () => page(() => document.querySelector('.assembly-app')?.getAttribute('aria-busy') === 'false'));
  }
  async function responseAfter(serial, action) {
    return waitFor('actual worker ' + action, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Observed a real assembly worker error.');
      const record = state.assemblies.filter(value => value.serial > serial && value.action === action && value.response).at(-1);
      if (!record) return false; check(record.response.ok, record.response.error || 'Assembly RPC failed.'); return record;
    });
  }
  async function inspect(current, sourcePath, gap, scope = ALL, includeWithinComponent = false) {
    const recovery = await page(() => localStorage.getItem('solidflow.autosave')), bytes = await fsp.readFile(sourcePath);
    const before = await observe(); await click(CHECK);
    const event = await responseAfter(before.serial, 'inspect-assembly-interferences'), report = event.response.value;
    check(canonical(event.current) === canonical(current) && report.kind === 'assembly-interference-report'
      && report.hasToken === false && report.options.clearance === gap && report.options.includeHidden === true,
    'Analysis did not use the committed document/options, or manufactured Apply authority.');
    check((event.options.includeWithinComponent ?? false) === includeWithinComponent
      && (report.options.includeWithinComponent ?? false) === includeWithinComponent,
    'Analysis changed the explicit within-component pair policy.');
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
  return async () => {
    await waitFor('initial production readiness', () => page(() => document.querySelector('.statusbar')?.textContent.includes('Listo')
      && typeof window.solidflow?.openDocument === 'function'), initialReadyMs);
    // Original two-body input: A=[0,2]x[0,3]x[0,4], B=[1,3]x[0,3]x[0,4].
    // Independent Common volume is 1x3x4=12 mm3. Only actual Open controls
    // provide the file; no document, native report or application state is injected.
    const multibodyTrackedBytes = await fsp.readFile(input), multibodyFixture = expected;
    const multibodyBefore = await observe(); await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    const multibodyOpened = await responseAfter(multibodyBefore.serial, 'build-assembly');
    check(canonical(multibodyOpened.document) === canonical(multibodyFixture), 'Original multibody fixture did not use real Open/build routing.');
    await idle('original two-body part opens');
    await waitFor('original multibody committed recovery', async () => {
      const saved = await page(() => localStorage.getItem('solidflow.autosave'));
      return !!saved && canonical(JSON.parse(saved)) === canonical(expected);
    });
    await control('input[aria-label="Holgura de comprobación"]', '.25');
    const multibodyScene = multibodyOpened.response.value;
    check(multibodyScene.bodies.length === 2 && multibodyScene.solidCount === 2 && multibodyScene.prototypeCount === 1,
      'Independent original extrusions did not retain two native bodies in one prototype.');
    const expectedBodyStates = [
      { bodyId: 'analysis-body-a', sourceFeatureId: 'box-a-extrude' },
      { bodyId: 'analysis-body-b', sourceFeatureId: 'box-b-extrude' },
    ];
    for (const [index, state] of expectedBodyStates.entries()) {
      const bodies = multibodyScene.bodies.filter(body => canonical(body.body) === canonical(state));
      check(bodies.length === 1 && canonical(bodies[0].component.occurrencePath) === canonical(['multibody'])
        && bodies[0].solidCount === 1, 'Original multibody scene lost an exact source body state.');
      close(bodies[0].volume, 24, 1e-5, 'Independent 2x3x4 source body volume.');
      close(bodies[0].area, 52, 1e-5, 'Independent source body area.');
      near(bodies[0].bounds.min, [index, 0, 0], 1e-6, 'Source body lower bounds.');
      near(bodies[0].bounds.max, [index + 2, 3, 4], 1e-6, 'Source body upper bounds.');
    }
    const multibodyRecovery = await page(() => localStorage.getItem('solidflow.autosave'));
    async function unchangedMultibody() {
      check((await fsp.readFile(input)).equals(multibodyTrackedBytes)
        && await page(() => localStorage.getItem('solidflow.autosave')) === multibodyRecovery,
      'Within-component analysis/options changed the source bytes or recovery.');
      check(await page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true
        && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true
        && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true),
      'Within-component inspection edited history or enabled Apply.');
    }
    async function within(enabled) {
      check(await page(selector => document.querySelector(selector)?.checked, WITHIN) === !enabled,
        'Expected the opposite within-component checkbox state before the actual click.');
      await click(WITHIN);
      await waitFor('within-component option reaches its real control', () => page((selector, expected) =>
        document.querySelector(selector)?.checked === (expected === 'true'), WITHIN, String(enabled)));
      await cleared(); await unchangedMultibody();
    }
    check(await page(selector => document.querySelector(selector)?.checked === false, WITHIN),
      'Within-component inspection was enabled by default.');
    const omitted = await inspect(multibodyFixture, input, .25);
    summary(omitted, 0, 0, 1, 0);
    check(omitted.bodyCount === 2 && omitted.componentCount === 1 && omitted.testedPairCount === 0
      && omitted.broadPhaseExcludedCount === 0 && omitted.pairs.length === 0, 'Default inspection admitted an internal pair.');
    await within(true);
    const internal = await inspect(multibodyFixture, input, .25, ALL, true);
    summary(internal, 0, 0, 1, 1);
    check(internal.bodyCount === 2 && internal.componentCount === 1 && internal.testedPairCount === 1
      && internal.broadPhaseExcludedCount === 0 && internal.pairs.length === 1, 'Opt-in inspection did not query exactly one internal body pair.');
    const internalPair = internal.pairs[0];
    check(internalPair.status === 'overlap' && internalPair.solidCount === 1
      && canonical(internalPair.first.component) === canonical(internalPair.second.component)
      && canonical([internalPair.first.body, internalPair.second.body].sort((a, b) => a.bodyId.localeCompare(b.bodyId))) === canonical(expectedBodyStates),
    'Internal pair did not retain two distinct exact body states in the same occurrence.');
    close(internalPair.intersectionVolume, 12, 1e-5, 'Independent within-component Common volume.');
    close(internalPair.minimumDistance, 0, 1e-6, 'Overlapping internal material distance.');
    check(internalPair.intersectionMesh?.vertexCount > 0 && internalPair.intersectionMesh.triangleCount >= 12
      && internalPair.intersectionMesh.normalCount === internalPair.intersectionMesh.vertexCount, 'Internal Common lacks its actual complete mesh.');
    near(internalPair.intersectionMesh.bounds.min, [1, 0, 0], 1e-6, 'Internal Common lower bounds.');
    near(internalPair.intersectionMesh.bounds.max, [2, 3, 4], 1e-6, 'Internal Common upper bounds.');
    await highlight(internalPair); await within(false);
    const disabledInternal = await inspect(multibodyFixture, input, .25);
    summary(disabledInternal, 0, 0, 1, 0);
    check(disabledInternal.pairs.length === 0 && disabledInternal.testedPairCount === 0, 'Disabling within-component analysis retained its old native pair.');
    await within(true);
    await page(panel => { const detail = document.querySelector(panel + ' details'); if (!detail) throw Error('Scope disclosure missing.'); detail.open = true; }, PANEL);
    await control(SCOPE, 'among-selected'); await cleared();
    const multibodyComponent = { occurrencePath: ['multibody'], definition: { id: 'original-analysis-multibody', revision: 'r1' } };
    await components(SELECTED, [multibodyComponent]);
    const multibodyAmongScope = { mode: 'among-selected', selected: [multibodyComponent], excluded: [] };
    const internalAmong = await inspect(multibodyFixture, input, .25, multibodyAmongScope, true);
    summary(internalAmong, 1, 0, 1, 1);
    check(internalAmong.pairs.length === 1 && internalAmong.testedPairCount === 1 && internalAmong.pairs[0].id === internalPair.id,
      'Among-selected opt-in inspection lost or relabelled the exact internal pair.');
    await highlight(internalAmong.pairs[0]); await control(SCOPE, 'selected-against-rest'); await cleared();
    const multibodyCrossScope = { ...multibodyAmongScope, mode: 'selected-against-rest' };
    const internalCross = await inspect(multibodyFixture, input, .25, multibodyCrossScope, true);
    summary(internalCross, 1, 0, 1, 0);
    check(internalCross.pairs.length === 0 && internalCross.testedPairCount === 0 && internalCross.broadPhaseExcludedCount === 0,
      'Selected-against-rest admitted an internal pair that does not cross the component selection.');
    await control(SCOPE, 'all'); await cleared(); await within(false); await unchangedMultibody();
    await within(true);
    const finalInternal = await inspect(multibodyFixture, input, .25, ALL, true);
    summary(finalInternal, 0, 0, 1, 1);
    check(finalInternal.pairs.length === 1 && finalInternal.pairs[0].id === internalPair.id,
      'Restoring all-components opt-in changed the exact original internal pair.');
    await highlight(finalInternal.pairs[0]); await unchangedMultibody();
    check(dialogCounts().opens === 1 && dialogCounts().saves === 0
      && canonical(ipc.map(event => event.channel)) === canonical(['document:open']) && ipc.every(event => event.completed),
    'Read-only multibody inspection changed the native file sequence.');
    const final = await observe();
    check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Multibody interference renderer/worker failure.');
    check(final.assemblies.every(event => ['build-assembly', 'inspect-assembly-interferences'].includes(event.action)),
      'Read-only multibody workflow unexpectedly solved, applied or edited geometry.');
    checks.push({ multibodyInputSha256: digest(multibodyTrackedBytes), phases, scene: multibodyScene,
      independentOracles: 'One original multibody occurrence; two independent2x3x4 solids,V24/A52each,x0..2and1..3; CommonV12,x1..2,y0..3,z0..4; default/disabled0pairs,optinall/among1pair,cross0pairs; unchangedhistory,recovery,input; V/area1e-5,length/meshbounds1e-6',
      evidenceLimits: 'Scripted production controls, real native worker body references/metrics/Common mesh extents, selected pair ID in viewport and unchanged file/history/recovery. Does not inspect both body colors or render meshes, human pointer/native-dialog interaction, continuous collision, installed package or general platform support.' });
    await capture(expected);
  };
};
