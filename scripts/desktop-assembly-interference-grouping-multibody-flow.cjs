'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Scripted real production controls with read-only observations of native replies.
module.exports = function groupingMultibodyInterferenceWorkflow(context) {
  const { expected, input, observe, waitFor, click, capture, evaluate, checks, ipc, check, canonical, digest,
    initialReadyMs, dialogCounts, consoleErrors, failedRequests } = context;
  const PANEL = '[role="region"][aria-label="Interferencias y holguras"]';
  const CHECK = 'button[aria-label="Comprobar interferencias"]';
  const SCOPE = 'select[aria-label="Ámbito de interferencias"]';
  const SELECTED = 'select[aria-label="Componentes seleccionados para interferencias"]';
  const WITHIN = 'input[aria-label="Incluir cuerpos de una misma pieza"]';
  const GROUP = 'input[aria-label="Agrupar subensamblajes raíz"]';
  const EXCLUDED = 'select[aria-label="Componentes excluidos de interferencias"]';
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
  async function inspect(current, sourcePath, gap, grouped) {
    const recovery = await page(() => localStorage.getItem('solidflow.autosave')), bytes = await fsp.readFile(sourcePath);
    const before = await observe(); await click(CHECK);
    const event = await responseAfter(before.serial, 'inspect-assembly-interferences'), report = event.response.value;
    check(canonical(event.current) === canonical(current) && report.kind === 'assembly-interference-report'
      && report.hasToken === false && report.options.clearance === gap && report.options.includeHidden === true,
    'Analysis did not use the committed document/options, or manufactured Apply authority.');
    check(event.options.includeWithinComponent === true && report.options.includeWithinComponent === true,
    'Analysis changed the explicit within-component pair policy.');
    check(event.options.treatSubassembliesAsComponents === grouped && report.options.treatSubassembliesAsComponents === grouped,
      'Actual worker request/report lost root-subassembly grouping intent.');
    const options = { clearance: gap, lengthTolerance: 1e-6, volumeTolerance: 1e-6, includeHidden: true,
      includeWithinComponent: true, treatSubassembliesAsComponents: grouped, scope: ALL };
    check(canonical(event.options) === canonical(options) && canonical(report.options) === canonical(options),
      'Actual worker request/report changed an inspection tolerance or option.');
    check(canonical(event.options.scope ?? ALL) === canonical(ALL) && canonical(report.options.scope ?? ALL) === canonical(ALL)
      && report.scopeSummary.mode === ALL.mode && report.scopeSummary.eligiblePairCount === report.potentialPairCount,
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
    // Policy: grouping omits all pairs sharing a root occurrence, including
    // same-leaf pairs when Within remains explicitly true. It never changes
    // that option or merges material. S={M}, G={S}; root reuses G twice.
    // Original M bodies: A=[0,2]x[0,3]x[0,4], B=[1,3]x[0,3]x[0,4].
    // Each V24/A52; internal Common V12. Four cross-root Commons have
    // matrix [[24,12],[12,24]]. Pair sums96/72 are not material union36.
    const trackedBytes = await fsp.readFile(input), beforeOpen = await observe();
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    const opened = await responseAfter(beforeOpen.serial, 'build-assembly');
    check(canonical(opened.document) === canonical(expected), 'Nested original multibody fixture bypassed real Open/build routing.');
    await idle('original reused nested multibody groups open');
    await waitFor('original nested multibody committed recovery', async () => {
      const saved = await page(() => localStorage.getItem('solidflow.autosave'));
      return !!saved && canonical(JSON.parse(saved)) === canonical(expected);
    });
    await control('input[aria-label="Holgura de comprobación"]', '0');
    const identity = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] }, scene = opened.response.value;
    // The engine deliberately reports the independent multi-solid part once
    // per reused definition. This expected warning is not a dropped body/error.
    const expectedWarnings = ['Original overlapping independent boxes: La pieza contiene 2 sólidos separados.'];
    const boxes = [
      { min: 0, max: 2, body: { bodyId: 'analysis-body-a', sourceFeatureId: 'box-a-extrude' } },
      { min: 1, max: 3, body: { bodyId: 'analysis-body-b', sourceFeatureId: 'box-b-extrude' } },
    ];
    const bodies = ['g-left', 'g-right'].flatMap(group => boxes.map(box => ({ ...box, group,
      component: { occurrencePath: [group, 's', 'm'], definition: { id: 'original-analysis-multibody', revision: 'r1' } } })));
    const reference = body => ({ component: body.component, body: body.body });
    const key = body => canonical(reference(body));
    check(scene.kind === 'assembly-scene' && scene.bodies.length === 4 && scene.solidCount === 4
      && scene.prototypeCount === 1,
    'Expected four placed native solids from one reused two-body prototype; actual=' + JSON.stringify({
      kind: scene.kind, bodyCount: scene.bodies.length, solidCount: scene.solidCount, prototypeCount: scene.prototypeCount, warnings: scene.warnings }));
    check(canonical(scene.warnings) === canonical(expectedWarnings), 'Unexpected native scene warning set: ' + JSON.stringify(scene.warnings));
    for (const expectedBody of bodies) {
      const matches = scene.bodies.filter(body => key(body) === key(expectedBody));
      check(matches.length === 1 && matches[0].visible && matches[0].solidCount === 1
        && canonical(matches[0].worldPose) === canonical(identity), 'Nested scene lost an exact source body, leaf occurrence or identity world pose.');
      const body = matches[0];
      close(body.volume, 24, 1e-5, 'Original 2x3x4 source body volume.');
      close(body.area, 52, 1e-5, 'Original 2x3x4 source body area.');
      near(body.bounds.min, [expectedBody.min, 0, 0], 1e-6, 'Original source body lower bounds.');
      near(body.bounds.max, [expectedBody.max, 3, 4], 1e-6, 'Original source body upper bounds.');
    }
    const recovery = await page(() => localStorage.getItem('solidflow.autosave'));
    async function unchanged() {
      check((await fsp.readFile(input)).equals(trackedBytes)
        && await page(() => localStorage.getItem('solidflow.autosave')) === recovery,
      'Grouping/internal-body inspection changed source bytes or committed recovery.');
      check(await page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true
        && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true
        && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true),
      'Grouping/internal-body inspection edited history or enabled Apply.');
    }
    async function controls(grouped, within) {
      check(await page((group, inner, scope, selected, excluded, groupValue, withinValue) => {
        const active = groupValue === 'true', include = withinValue === 'true';
        const groupControl = document.querySelector(group), withinControl = document.querySelector(inner);
        return groupControl?.checked === active && groupControl.disabled === false
          && withinControl?.checked === include && withinControl.disabled === false
          && document.querySelector(scope)?.value === 'all' && document.querySelector(scope)?.disabled === false
          && document.querySelector(selected)?.disabled === true && document.querySelector(excluded)?.disabled === false
          && document.querySelector(selected)?.selectedOptions.length === 0 && document.querySelector(excluded)?.selectedOptions.length === 0;
      }, GROUP, WITHIN, SCOPE, SELECTED, EXCLUDED, String(grouped), String(within)),
      'Combined policy controls lost an explicit boolean, all scope or editable exclusions.');
    }
    async function policy(selector, enabled, grouped, within) {
      check(await page(selector => document.querySelector(selector)?.checked, selector) === !enabled,
        'Expected the opposite policy checkbox state before its actual click.');
      const before = await observe();
      await click(selector);
      await waitFor('combined policy option reaches its real control', () => page((selector, value) =>
        document.querySelector(selector)?.checked === (value === 'true'), selector, String(enabled)));
      await cleared(); await controls(grouped, within); await unchanged();
      check((await observe()).serial === before.serial, 'Changing inspection options unexpectedly requested native geometry work.');
    }
    function verify(report, grouped) {
      const oracles = [];
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        if (grouped && bodies[i].group === bodies[j].group) continue;
        const first = bodies[i], second = bodies[j], min = Math.max(first.min, second.min), max = Math.min(first.max, second.max);
        oracles.push({ first, second, min, max, volume: (max - min) * 3 * 4 });
      }
      summary(report, 0, 0, 2, oracles.length);
      check(report.componentCount === 2 && report.bodyCount === 4 && report.pairs.length === oracles.length
        && report.testedPairCount === oracles.length && report.broadPhaseExcludedCount === 0,
      'Combined policy lost original leaf/body counts or exact eligible/native pair accounting.');
      check(canonical(report.warnings) === canonical(expectedWarnings), 'Unexpected native report warning set: ' + JSON.stringify(report.warnings));
      const seen = new Set();
      for (const oracle of oracles) {
        const expectedKeys = [key(oracle.first), key(oracle.second)].sort();
        const matches = report.pairs.filter(pair => canonical([key(pair.first), key(pair.second)].sort()) === canonical(expectedKeys));
        check(matches.length === 1, 'Missing or duplicate exact original multibody Common pair.');
        const pair = matches[0]; seen.add(pair.id);
        check(pair.status === 'overlap' && pair.solidCount === 1, 'Expected one actual Common solid per literal overlapping pair.');
        close(pair.intersectionVolume, oracle.volume, 1e-5, 'Literal internal/cross-root Common volume.');
        close(pair.minimumDistance, 0, 1e-6, 'Literal overlapping material distance.');
        check(pair.intersectionMesh?.vertexCount > 0 && pair.intersectionMesh.triangleCount >= 12
          && pair.intersectionMesh.normalCount === pair.intersectionMesh.vertexCount, 'Pair lacks its complete actual Common mesh.');
        near(pair.intersectionMesh.bounds.min, [oracle.min, 0, 0], 1e-6, 'Literal Common lower bounds.');
        near(pair.intersectionMesh.bounds.max, [oracle.max, 3, 4], 1e-6, 'Literal Common upper bounds.');
      }
      const internal = report.pairs.filter(pair => canonical(pair.first.component) === canonical(pair.second.component));
      check(internal.length === (grouped ? 0 : 2) && seen.size === report.pairs.length,
        'Grouping failed to take precedence over internal-body admission or report IDs are duplicated.');
      close(report.pairs.reduce((sum, pair) => sum + pair.intersectionVolume, 0), grouped ? 72 : 96, 1e-4,
        'Sum of pair observations (not a material union).');
      return [...seen].sort();
    }
    await controls(false, false);
    await policy(WITHIN, true, false, true);
    const initial = await inspect(expected, input, 0, false), initialIds = verify(initial, false);
    const initialInternal = initial.pairs.find(pair => canonical(pair.first.component) === canonical(pair.second.component));
    check(!!initialInternal, 'Explicit internal-body inspection did not produce its source-body pair.');
    await highlight(initialInternal); await policy(GROUP, true, true, true);
    const grouped = await inspect(expected, input, 0, true), groupedIds = verify(grouped, true);
    check(grouped.analysisId !== initial.analysisId && groupedIds.every(id => initialIds.includes(id)),
      'Combined grouped report reused analysis authority or relabelled original cross-root pairs.');
    await controls(true, true); await highlight(grouped.pairs[0]); await policy(GROUP, false, false, true);
    const restored = await inspect(expected, input, 0, false), restoredIds = verify(restored, false);
    check(restored.analysisId !== grouped.analysisId && canonical(restoredIds) === canonical(initialIds),
      'Disabling grouping failed to restore all six original pairs while Within remained true.');
    await controls(false, true); await highlight(restored.pairs.find(pair => pair.id === initialInternal.id)); await unchanged();
    check(dialogCounts().opens === 1 && dialogCounts().saves === 0 && dialogCounts().csvExports === 0
      && canonical(ipc.map(event => event.channel)) === canonical(['document:open']) && ipc.every(event => event.completed),
    'Read-only combined-policy inspection changed the native file sequence.');
    const final = await observe();
    check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Combined-policy renderer/worker failure.');
    check(final.assemblies.every(event => ['build-assembly', 'inspect-assembly-interferences'].includes(event.action))
      && phases.length === 3, 'Read-only combined-policy workflow unexpectedly solved, applied or edited geometry.');
    checks.push({ groupingMultibodyInputSha256: digest(trackedBytes), phases, scene,
      independentOracles: 'Original public M has separate 2x3x4 bodies A:x0..2,B:x1..3,y0..3,z0..4,V24/A52each,Common12. Root reuses G={S={M}} twice,all poses identity:2leaves,4bodies,1prototype. Withintrue persists: ungrouped6/grouped4/restored6 exact IDs; cross-root matrix[[24,12],[12,24]],pair sum72; all-pair sum96,not material union36. V/area1e-5,length/meshbounds1e-6,sum1e-4.',
      evidenceLimits: 'Scripted production controls, actual native worker exact leaf/body references, pair metrics/Common mesh bounds, selected pair ID in viewport and unchanged source/history/recovery. Checks root grouping precedence while Within stays true. Does not establish both body colors or rendered meshes, human pointer/native-dialog interaction, selected/excluded grouping, continuous collision, installed package, vendor equivalence or platform support.' });
    await capture(expected);
  };
};
