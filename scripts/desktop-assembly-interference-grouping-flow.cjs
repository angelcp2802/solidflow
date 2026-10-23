'use strict';
const fsp = require('node:fs/promises');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');

// Scripted real production controls with read-only observations of native replies.
module.exports = function groupingInterferenceWorkflow(context) {
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
    check(event.options.includeWithinComponent === false && report.options.includeWithinComponent === false,
    'Analysis changed the explicit within-component pair policy.');
    check(event.options.treatSubassembliesAsComponents === grouped && report.options.treatSubassembliesAsComponents === grouped,
      'Actual worker request/report lost root-subassembly grouping intent.');
    const options = { clearance: gap, lengthTolerance: 1e-6, volumeTolerance: 1e-6, includeHidden: true,
      includeWithinComponent: false, treatSubassembliesAsComponents: grouped, scope: ALL };
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
    // Original direct CAD definitions. A:x1..5, B:x4..8, C:x3..7;
    // y-3..3,z0..4. S={A,B}; G={S,C}; two coincident reused root Gs.
    const trackedBytes = await fsp.readFile(input), beforeOpen = await observe();
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    await waitFor('initial replacement confirmation', () => page(() => !!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')));
    await button('Continuar sin guardar', '[role="dialog"][aria-labelledby="discard-title"]');
    const opened = await responseAfter(beforeOpen.serial, 'build-assembly');
    check(canonical(opened.document) === canonical(expected), 'Nested original fixture bypassed real Open/build routing.');
    await idle('original reused nested groups open');
    await waitFor('original nested committed recovery', async () => {
      const saved = await page(() => localStorage.getItem('solidflow.autosave'));
      return !!saved && canonical(JSON.parse(saved)) === canonical(expected);
    });
    await control('input[aria-label="Holgura de comprobación"]', '0');
    const scene = opened.response.value, identity = { translation: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const boxes = ['a', 'b', 'c'].map((role, index) => ({ role, min: [1, 4, 3][index], max: [5, 8, 7][index] }));
    const leaves = ['g-left', 'g-right'].flatMap(group => boxes.map(box => ({ ...box, group,
      component: { occurrencePath: box.role === 'c' ? [group, 'c'] : [group, 's', box.role],
        definition: { id: 'original-grouping-box-' + box.role, revision: 'r1' } },
      body: { bodyId: 'box', sourceFeatureId: 'solid' } })));
    const reference = body => ({ component: body.component, body: body.body });
    const key = body => canonical(reference(body));
    check(scene.kind === 'assembly-scene' && scene.bodies.length === 6 && scene.solidCount === 6
      && scene.prototypeCount === 3 && scene.warnings.length === 0, 'Expected six native solids from three reused prototypes.');
    for (const leaf of leaves) {
      const matches = scene.bodies.filter(body => key(body) === key(leaf));
      check(matches.length === 1 && matches[0].visible && matches[0].solidCount === 1
        && canonical(matches[0].worldPose) === canonical(identity), 'Nested scene lost an exact leaf/body identity or identity world pose.');
      const body = matches[0];
      close(body.volume, 96, 1e-5, 'Original 4x6x4 source volume.');
      close(body.area, 128, 1e-5, 'Original 4x6x4 source area.');
      near(body.bounds.min, [leaf.min, -3, 0], 1e-6, 'Original leaf lower bounds.');
      near(body.bounds.max, [leaf.max, 3, 4], 1e-6, 'Original leaf upper bounds.');
    }
    const recovery = await page(() => localStorage.getItem('solidflow.autosave'));
    async function unchanged() {
      check((await fsp.readFile(input)).equals(trackedBytes)
        && await page(() => localStorage.getItem('solidflow.autosave')) === recovery,
      'Grouping analysis/options changed source bytes or committed recovery.');
      check(await page(() => document.querySelector('button[aria-label="Deshacer ensamblaje"]')?.disabled === true
        && document.querySelector('button[aria-label="Rehacer ensamblaje"]')?.disabled === true
        && document.querySelector('button[aria-label="Aplicar ensamblaje"]')?.disabled === true),
      'Grouping inspection edited history or enabled Apply.');
    }
    async function controls(grouped) {
      check(await page((group, within, scope, selected, excluded, value) => {
        const active = value === 'true', option = document.querySelector(group), inner = document.querySelector(within);
        return option?.checked === active && option.disabled === false && inner?.checked === false && inner.disabled === false
          && document.querySelector(scope)?.value === 'all' && document.querySelector(scope)?.disabled === false
          && document.querySelector(selected)?.disabled === true && document.querySelector(excluded)?.disabled === false
          && document.querySelector(selected)?.selectedOptions.length === 0 && document.querySelector(excluded)?.selectedOptions.length === 0;
      }, GROUP, WITHIN, SCOPE, SELECTED, EXCLUDED, String(grouped)), 'Grouping controls failed to retain all-scope intent and editable exclusions.');
    }
    async function grouping(enabled) {
      check(await page(selector => document.querySelector(selector)?.checked, GROUP) === !enabled,
        'Expected the opposite grouping checkbox state before the actual click.');
      const before = await observe();
      await click(GROUP);
      await waitFor('grouping option reaches its real control', () => page((selector, value) =>
        document.querySelector(selector)?.checked === (value === 'true'), GROUP, String(enabled)));
      await cleared(); await controls(enabled); await unchanged();
      check((await observe()).serial === before.serial, 'Changing inspection options unexpectedly requested native geometry work.');
    }
    function verify(report, grouped) {
      const oracles = [];
      for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
        if (grouped && leaves[i].group === leaves[j].group) continue;
        const first = leaves[i], second = leaves[j], min = Math.max(first.min, second.min), max = Math.min(first.max, second.max);
        oracles.push({ first, second, min, max, volume: (max - min) * 6 * 4 });
      }
      summary(report, 0, 0, 6, oracles.length);
      check(report.componentCount === 6 && report.bodyCount === 6 && report.pairs.length === oracles.length
        && report.testedPairCount === oracles.length && report.broadPhaseExcludedCount === 0 && report.warnings.length === 0,
      'Grouping lost original leaf counts, warnings or exact eligible/native pair accounting.');
      const seen = new Set();
      for (const oracle of oracles) {
        const expectedKeys = [key(oracle.first), key(oracle.second)].sort();
        const pairs = report.pairs.filter(pair => canonical([key(pair.first), key(pair.second)].sort()) === canonical(expectedKeys));
        check(pairs.length === 1, 'Missing or duplicate exact original leaf/body Common pair.');
        const pair = pairs[0]; seen.add(pair.id);
        check(pair.status === 'overlap' && pair.solidCount === 1, 'Expected one native Common solid per literal overlapping pair.');
        close(pair.intersectionVolume, oracle.volume, 1e-5, 'Literal pair Common volume.');
        close(pair.minimumDistance, 0, 1e-6, 'Literal overlapping material distance.');
        check(pair.intersectionMesh?.vertexCount > 0 && pair.intersectionMesh.triangleCount >= 12
          && pair.intersectionMesh.normalCount === pair.intersectionMesh.vertexCount, 'Pair lacks its complete actual Common mesh.');
        near(pair.intersectionMesh.bounds.min, [oracle.min, -3, 0], 1e-6, 'Literal pair Common lower bounds.');
        near(pair.intersectionMesh.bounds.max, [oracle.max, 3, 4], 1e-6, 'Literal pair Common upper bounds.');
      }
      check(seen.size === report.pairs.length, 'Report pair identities are not unique.');
      close(report.pairs.reduce((sum, pair) => sum + pair.intersectionVolume, 0), grouped ? 576 : 864, 1e-4,
        'Sum of pair observations (not a material union).');
      return [...seen].sort();
    }
    await controls(false);
    const initial = await inspect(expected, input, 0, false), initialIds = verify(initial, false);
    await highlight(initial.pairs[0]); await grouping(true);
    const grouped = await inspect(expected, input, 0, true), groupedIds = verify(grouped, true);
    check(grouped.analysisId !== initial.analysisId && groupedIds.every(id => initialIds.includes(id)),
      'Grouped report reused analysis authority or changed original pair identities.');
    await controls(true); await highlight(grouped.pairs[0]); await grouping(false);
    const restored = await inspect(expected, input, 0, false), restoredIds = verify(restored, false);
    check(restored.analysisId !== grouped.analysisId && canonical(restoredIds) === canonical(initialIds),
      'Disabling grouping did not restore the exact fifteen original pair identities.');
    await controls(false); await highlight(restored.pairs[0]); await unchanged();
    check(dialogCounts().opens === 1 && dialogCounts().saves === 0 && dialogCounts().csvExports === 0
      && canonical(ipc.map(event => event.channel)) === canonical(['document:open']) && ipc.every(event => event.completed),
    'Read-only grouping inspection changed the native file sequence.');
    const final = await observe();
    check(!consoleErrors.length && !failedRequests.length && !final.workerErrors.length, 'Grouping interference renderer/worker failure.');
    check(final.assemblies.every(event => ['build-assembly', 'inspect-assembly-interferences'].includes(event.action))
      && phases.length === 3, 'Read-only grouping workflow unexpectedly solved, applied or edited geometry.');
    checks.push({ groupingInputSha256: digest(trackedBytes), phases, scene,
      independentOracles: 'Original direct 4x6x4 CAD boxes A:x1..5,B:x4..8,C:x3..7;y-3..3,z0..4,V96/A128. S={A,B};G={S,C};two reused root Gs,all poses identity. All15/grouped9/restored15; cross-root matrix [[96,24,48],[24,96,72],[48,72,96]],pair sum576,not union168. All pair sum864. V/area1e-5,length/meshbounds1e-6,sum1e-4.',
      evidenceLimits: 'Scripted production controls, real native worker exact leaf/body references, pair metrics/Common mesh bounds, selected pair ID in viewport, disabled grouping controls and unchanged source/history/recovery. No assertion of both body colors or render meshes, human pointer/native-dialog interaction, general grouping modes, continuous collision, installed package or platform support.' });
    await capture(expected);
  };
};
