'use strict';
// Instrumented production-loader regression: selected feature scope to dynamic ALL.
// Launches its own hidden test child; never attaches to an existing app/session.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const FIXTURE = path.join(__dirname, '..', 'src', 'cad', 'fixtures', 'pattern-all-original.json');
const PATTERN_ID = 'ui-all-P';
const PROFILE_PREFIX = 'solidflow-pattern-all-test-';
const INITIAL_READY_MS = 35_000;
const STEP_MS = 35_000;
// Separate multi-operation test budget; the standard desktop smoke is unchanged.
const TEST_MS = 180_000;
const fail = message => { throw new Error(message); };
const check = (condition, message) => { if (!condition) fail(message); };
const digest = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
function describeError(error) {
  return { name: error?.name ?? typeof error, message: error?.message ?? String(error),
    ...(error?.cause !== undefined ? { cause: describeError(error.cause) } : {}),
    ...(error instanceof AggregateError ? { errors: [...error.errors].map(describeError) } : {}) };
}
function under(directory, target) {
  const relative = path.relative(directory, target);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function closeError(code, signal) {
  const error = new Error(`Isolated Electron child closed with code=${String(code)}, signal=${String(signal)}.`);
  error.childCode = code; error.childSignal = signal;
  error.launcherExitCode = Number.isInteger(code) && code > 0 ? code : 1;
  return error;
}
function applicationRoot(configured) {
  check(typeof configured === 'string' && path.isAbsolute(configured), 'Expected an explicit absolute test application root.');
  const root = fs.realpathSync(configured), packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  check(packageJson.name === 'solidflow' && packageJson.main === 'electron/main.cjs', 'Unexpected test application root.');
  check(!process.env.SOLIDFLOW_DEV_URL, 'This test requires the production loader; do not supply a development URL.');
  return root;
}
async function productionHashes(root) {
  const files = ['electron/main.cjs', 'electron/preload.cjs', 'dist/index.html'];
  async function walk(directory) {
    for (const item of await fsp.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) await walk(absolute);
      else if (item.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
      else fail('Unexpected non-file production asset.');
    }
  }
  await walk(path.join(root, 'dist/assets'));
  return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async relative => [relative, digest(await fsp.readFile(path.join(root, relative)))])));
}
async function launch() {
  const root = applicationRoot(path.resolve(__dirname, '..')), requireFromRoot = createRequire(path.join(root, 'package.json'));
  const before = await productionHashes(root);
  const temporaryRoot = await fsp.realpath(os.tmpdir());
  const temporary = await fsp.mkdtemp(path.join(temporaryRoot, PROFILE_PREFIX)), token = randomUUID();
  let child, timer, closed = false, spawned = false, spawnError = false, primary, report;
  const teardown = [];
  try {
    for (const name of ['profile', 'session', 'logs', 'crashes']) await fsp.mkdir(path.join(temporary, name));
    await fsp.writeFile(path.join(temporary, '.test-owned.json'), JSON.stringify({ token }), { flag: 'wx' });
    await fsp.copyFile(FIXTURE, path.join(temporary, 'input.solidflow'), fs.constants.COPYFILE_EXCL);
    const environment = { ...process.env, SOLIDFLOW_PATTERN_UI_TEST_ROOT: root, SOLIDFLOW_PATTERN_UI_TEST_TEMP: temporary, SOLIDFLOW_PATTERN_UI_TEST_TOKEN: token };
    delete environment.ELECTRON_RUN_AS_NODE; delete environment.SOLIDFLOW_DEV_URL;
    const args = process.platform === 'linux' && environment.CI === 'true' ? ['--ignore-gpu-blocklist', __filename] : [__filename];
    await new Promise((resolve, reject) => {
      const rejectPrimary = error => { primary ??= error; reject(primary); };
      try { child = spawn(requireFromRoot('electron'), args, { cwd: root, env: environment, stdio: 'inherit', windowsHide: true }); }
      catch (error) { rejectPrimary(error); return; }
      spawned = !!child.pid;
      child.once('spawn', () => { spawned = true; });
      child.on('error', error => {
        spawnError = true;
        if (primary && primary !== error && !teardown.includes(error)) teardown.push(error);
        rejectPrimary(error);
      });
      child.once('close', (code, signal) => {
        closed = true;
        if (primary) { reject(primary); return; }
        if (code !== 0 || signal !== null) rejectPrimary(closeError(code, signal));
        else resolve();
      });
      timer = setTimeout(() => {
        // Capture timeout first: synchronous close during kill cannot win PASS.
        rejectPrimary(new Error(`Isolated ALL UI test exceeded ${TEST_MS} milliseconds; child close not yet observed.`));
        try { if (child.exitCode === null && child.signalCode === null) child.kill(); } catch (error) { teardown.push(error); }
      }, TEST_MS);
    });
    report = JSON.parse(await fsp.readFile(path.join(temporary, 'workflow-result.json'), 'utf8'));
    check(report.workflowStatus === 'PASS', 'The child did not record a successful complete UI workflow.');
  } catch (error) { primary ??= error; }
  finally {
    clearTimeout(timer);
    if (child && !closed && !(spawnError && !spawned && !child.pid)) {
      try { if (!child.killed && child.exitCode === null && child.signalCode === null) child.kill(); } catch (error) { teardown.push(error); }
      // No close grace extends the deadline. Retain isolated files if close is
      // unconfirmed; unref this owned child, never a shared stream/user process.
      if (!closed) {
        try { child.unref(); } catch (error) { teardown.push(error); }
        teardown.push(new Error('Child close was not observed. Isolated temporary profile retained; process-tree closure is not established.'));
      }
    }
    try {
      const after = await productionHashes(root);
      check(JSON.stringify(before) === JSON.stringify(after), 'Production main/preload/assets changed during the workflow.');
    } catch (error) { teardown.push(error); }
    if (!child || closed || spawnError && !spawned && !child.pid) {
      try {
        const resolved = await fsp.realpath(temporary), guard = JSON.parse(await fsp.readFile(path.join(resolved, '.test-owned.json'), 'utf8'));
        check(under(temporaryRoot, resolved) && path.basename(resolved).startsWith(PROFILE_PREFIX) && guard.token === token,
          'Unexpected temporary target; refuse cleanup.');
        await fsp.rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) { teardown.push(error); }
    }
  }
  if (primary || teardown.length) {
    if (teardown.length) throw new AggregateError(primary ? [primary, ...teardown] : teardown, 'Isolated ALL workflow and/or teardown failed.', { cause: primary ?? teardown[0] });
    throw primary;
  }
  console.log(JSON.stringify({ test: 'production-renderer-selected-to-ALL', status: 'PASS', productionInputHashes: before, ...report,
    childCloseObserved: true, isolatedTemporaryDeleted: true }, null, 2));
}

// Runs before any app bundle. This only observes/forwards the real Worker API;
// no CAD response, React state, document or IPC result is supplied by the test.
function installWorkerObserver() {
  const NativeWorker = globalThis.Worker;
  const observations = { serial: 0, eventSerial: 0, builds: [], ui: [], workerErrors: [] };
  const copy = value => JSON.parse(JSON.stringify(value));
  let previousUi;
  new MutationObserver(() => {
    const scope = document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]');
    const apply = document.querySelector('button[title="Aceptar operación"]');
    const sample = { scope: scope?.value ?? null, applyDisabled: apply ? apply.disabled : null }, key = JSON.stringify(sample);
    if (key !== previousUi && observations.ui.length < 512) {
      previousUi = key; observations.ui.push({ eventSerial: ++observations.eventSerial, ...sample });
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
  globalThis.Worker = new Proxy(NativeWorker, { construct(Target, args, newTarget) {
    const worker = Reflect.construct(Target, args, newTarget), send = worker.postMessage, pending = new Map();
    worker.postMessage = function(message, ...rest) {
      if (message?.action === 'build') {
        const record = { serial: ++observations.serial, eventSerial: ++observations.eventSerial, id: message.id, features: copy(message.features), response: null };
        if (observations.builds.length >= 256) observations.workerErrors.push('Observer build envelope exceeded256.');
        else { observations.builds.push(record); pending.set(message.id, record); }
      }
      return Reflect.apply(send, this, [message, ...rest]);
    };
    worker.addEventListener('message', event => {
      const record = pending.get(event.data?.id);
      if (!record) return;
      pending.delete(event.data.id);
      record.responseEventSerial = ++observations.eventSerial;
      if (!event.data.ok) record.response = { ok: false, error: event.data.error };
      else {
        const result = event.data.value;
        record.response = { ok: true, value: { bodyCatalogActive: result.bodyCatalogActive,
          bodies: result.bodies?.map(body => ({ ref: copy(body.ref), createdByFeatureId: body.createdByFeatureId,
            volume: body.volume, bounds: copy(body.bounds) })), featureErrors: copy(result.featureErrors), warnings: copy(result.warnings) } };
      }
    });
    worker.addEventListener('error', event => observations.workerErrors.push(event.message || 'Worker error'));
    return worker;
  } });
  Object.defineProperty(globalThis, '__solidflowUiTestObservation', { value: Object.freeze({ snapshot: () => copy(observations) }), configurable: false });
}
async function runInElectron() {
  const electron = require('electron'), { app } = electron, root = applicationRoot(process.env.SOLIDFLOW_PATTERN_UI_TEST_ROOT);
  const temporary = process.env.SOLIDFLOW_PATTERN_UI_TEST_TEMP, token = process.env.SOLIDFLOW_PATTERN_UI_TEST_TOKEN;
  check(temporary && path.isAbsolute(temporary) && token, 'Launch this test through its Node parent.');
  const owned = fs.realpathSync.native(temporary), guard = JSON.parse(fs.readFileSync(path.join(owned, '.test-owned.json'), 'utf8'));
  check(under(fs.realpathSync.native(os.tmpdir()), owned) && path.basename(owned).startsWith(PROFILE_PREFIX) && guard.token === token, 'Unexpected isolated profile.');
  app.setPath('userData', path.join(owned, 'profile')); app.setPath('sessionData', path.join(owned, 'session'));
  app.setPath('crashDumps', path.join(owned, 'crashes')); app.setAppLogsPath(path.join(owned, 'logs'));
  const input = path.join(owned, 'input.solidflow'), output = path.join(owned, 'saved.solidflow');
  const expected = JSON.parse(fs.readFileSync(input, 'utf8')), expectedIds = expected.features.map(feature => feature.id);
  const protocolResponses = [], consoleErrors = [], failedRequests = [], ipc = [], checks = [];
  let opens = 0, saves = 0, finished = false, window;
  const timeout = setTimeout(() => finish(new Error('The isolated UI workflow did not finish before its child deadline.')), TEST_MS - 10_000);
  function finish(error) {
    if (finished) return;
    finished = true; clearTimeout(timeout);
    const report = { workflowStatus: error ? 'FAIL' : 'PASS', checks, protocolResponses, consoleErrors, failedRequests,
      dialogSubstitutions: { opens, saves }, ipc, ...(error ? { error: describeError(error) } : {}) };
    try { fs.writeFileSync(path.join(owned, 'workflow-result.json'), JSON.stringify(report, null, 2)); }
    catch (writeError) { console.error(new AggregateError(error ? [error, writeError] : [writeError], 'Workflow evidence could not be written.', { cause: error ?? writeError })); process.exitCode = 1; }
    if (error) { console.error(error); process.exitCode = 1; }
    console.log(JSON.stringify({ test: 'production-renderer-selected-to-ALL', ...report }));
    // Successful workflow still requires the parent to observe close/code0.
    app.quit();
  }
  const evaluate = source => window.webContents.executeJavaScript(source, false);
  const observe = () => evaluate('globalThis.__solidflowUiTestObservation.snapshot()');
  async function waitFor(description, inspect, budget = STEP_MS) {
    const started = Date.now(); let last;
    while (Date.now() - started < budget) {
      last = await inspect();
      if (last) { checks.push(description); return last; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${description}; last observation=${JSON.stringify(last)}.`);
  }
  async function click(selector) {
    await evaluate(`(() => { const elements=[...document.querySelectorAll(${JSON.stringify(selector)})]; if(elements.length!==1||elements[0].disabled) throw Error('Expected one enabled control: '+${JSON.stringify(selector)}); elements[0].click(); })()`);
  }
  async function menu(label) {
    await evaluate(`(() => { const find=(selector,text)=>[...document.querySelectorAll(selector)].filter(x=>x.textContent.trim()===text); const top=find('nav .menu-wrap > button','Archivo'); if(top.length!==1) throw Error('Archivo menu is ambiguous'); top[0].click(); })()`);
    await evaluate(`(() => { const buttons=[...document.querySelectorAll('.dropdown button')].filter(x=>x.textContent.trim().startsWith(${JSON.stringify(label)})); if(buttons.length!==1||buttons[0].disabled) throw Error('Expected one enabled file menu action'); buttons[0].click(); })()`);
  }
  async function buildAfter(serial, scope) {
    return waitFor('healthy worker build for ' + scope, async () => {
      const state = await observe(); check(!state.workerErrors.length, 'Observed a real worker error.');
      const matches = state.builds.filter(record => record.serial > serial && record.features.map(feature => feature.id).join('|') === expectedIds.join('|')
        && record.features.at(-1)?.featurePattern?.scope === scope && record.response);
      const record = matches.at(-1); if (!record) return false;
      check(record.response.ok, record.response.error || 'Worker build rejected.');
      check(record.response.value.featureErrors.length === 0, 'Worker build returned feature errors.');
      check(record.response.value.bodyCatalogActive && record.response.value.bodies?.length === 4, 'Expected four independently owned current bodies.');
      return record;
    });
  }
  function assertBodies(record, all) {
    const actual = new Map(record.response.value.bodies.map(body => [body.ref.bodyId, body]));
    const desired = { S: ['seed-cut', 'create-S', 400 - 4 * Math.PI, [0, 0, 0], [10, 10, 4]],
      A: [PATTERN_ID, 'create-A', 800 - 8 * Math.PI, [20, 0, 0], [30, 10, 8]],
      B: [all ? PATTERN_ID : 'create-B', 'create-B', all ? 800 - 8 * Math.PI : 800, [20, 0, 0], [30, 10, 8]],
      C: ['create-C', 'create-C', 800, [50, 0, 0], [60, 10, 8]] };
    for (const [id, [source, creator, volume, min, max]] of Object.entries(desired)) {
      const body = actual.get(id); check(body?.ref.sourceFeatureId === source && body.createdByFeatureId === creator, 'Unexpected exact ref/creator for ' + id);
      check(Number.isFinite(body.volume) && Math.abs(body.volume - volume) < 1e-5, 'Unexpected independent volume for ' + id);
      for (const [side, expectedSide] of [['min', min], ['max', max]]) expectedSide.forEach((coordinate, index) =>
        check(Number.isFinite(body.bounds[side][index]) && Math.abs(body.bounds[side][index] - coordinate) < 1e-6, 'Unexpected independent bounds for ' + id));
    }
  }
  function assertAllDocument(document) {
    check(document.id === expected.id && document.features.map(feature => feature.id).join('|') === expectedIds.join('|'), 'Unexpected saved identities/prefix.');
    check(canonical(document.features.slice(0, -1)) === canonical(expected.features.slice(0, -1)), 'The original source/targets changed during the UI scope edit.');
    const feature = document.features.at(-1), operation = feature.featurePattern;
    check(feature.id === PATTERN_ID && feature.source.geometryPattern === false && operation.mode === 'regenerate' && operation.scope === 'all'
      && operation.reevaluateAt === 'patternInput' && !Object.hasOwn(operation, 'targets'), 'Saved ALL reverted to a selected target snapshot.');
    check(canonical(operation.bindings) === canonical([{ source: { bodyId: 'S', sourceFeatureId: 'seed-cut' }, targetBodyIds: 'scope' }]), 'The exact historical source or scope route changed.');
  }
  async function workflow() {
    await waitFor('initial renderer readiness', async () => evaluate(`(() => { const s=document.querySelector('.statusbar')?.textContent||''; return s.includes('Listo')&&s.includes('Sólido')&&document.querySelectorAll('canvas').length>0&&typeof window.solidflow?.openDocument==='function'&&typeof window.require==='undefined'&&typeof window.process==='undefined'; })()`), INITIAL_READY_MS);
    let serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    // The fresh test-owned production document starts dirty. Accept its actual
    // React discard dialog; never seed/replace renderer or persistence state.
    await waitFor('fresh isolated document asks to discard', () => evaluate(
      `document.querySelectorAll('[role="dialog"][aria-labelledby="discard-title"]').length === 1`));
    await evaluate(`(() => { const button=document.querySelector('[role="dialog"][aria-labelledby="discard-title"] .primary-button'); if(!button||button.disabled||button.textContent.trim()!=='Continuar sin guardar') throw Error('Expected exact enabled discard confirmation'); button.click(); })()`);
    await waitFor('fresh isolated discard dialog closes', () => evaluate(
      `!document.querySelector('[role="dialog"][aria-labelledby="discard-title"]')`));
    const selected = await buildAfter(serial, 'selected'); assertBodies(selected, false);
    await waitFor('loaded original document', () => evaluate(`document.querySelector('.document-title')?.textContent.includes('Original isolated ALL interaction')`));
    await evaluate(`(() => { const rows=[...document.querySelectorAll('.tree-row')].filter(row=>[...row.querySelectorAll('span')].some(span=>span.textContent==='UI ALL pattern original')); if(rows.length!==1) throw Error('Original pattern row missing/ambiguous'); rows[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true})); })()`);
    await waitFor('selected editor and exact A selection', () => evaluate(`(() => {const s=document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]'); const a=document.querySelector('input[aria-label="Aplicar repetición a Original A"]'); return s?.value==='selected'&&!s.disabled&&a?.checked;})()`));
    const beforeScopeChange = await observe(); serial = beforeScopeChange.serial;
    await evaluate(`(() => { const select=document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]'); if(!select||select.disabled||select.value!=='selected') throw Error('Selected scope is not editable'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'all'); select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const preview = await buildAfter(serial, 'all'); assertBodies(preview, true); assertAllDocument({ ...expected, features: preview.features });
    const pendingUi = (await observe()).ui.filter(sample => sample.eventSerial > beforeScopeChange.eventSerial
      && sample.eventSerial < preview.responseEventSerial && sample.scope === 'all');
    check(pendingUi.some(sample => sample.applyDisabled === true) && pendingUi.every(sample => sample.applyDisabled === true),
      'The real ALL editor did not keep Apply disabled before its observed worker response.');
    checks.push('observed ALL Apply disabled before the actual preview response');
    await waitFor('fresh ALL preview enables Apply without stale manual selection', () => evaluate(`(() => {const s=document.querySelector('select[aria-label="Alcance de los cuerpos de la repetición"]');const b=document.querySelector('button[title="Aceptar operación"]');return s?.value==='all'&&!b?.disabled&&!!b&&!document.querySelector('input[aria-label="Aplicar repetición a Original A"]');})()`));
    serial = (await observe()).serial;
    await click('button[title="Aceptar operación"]');
    await waitFor('React Apply leaves the property manager', () => evaluate(`!document.querySelector('.property-manager')`));
    const committed = await buildAfter(serial, 'all'); assertBodies(committed, true);
    await waitFor('committed ALL reaches autosave', async () => {
      const value = await evaluate(`localStorage.getItem('solidflow.autosave')`); if (!value) return false;
      const parsed = JSON.parse(value); if (parsed.id !== expected.id || parsed.features.at(-1)?.featurePattern?.scope !== 'all') return false;
      assertAllDocument(parsed); return true;
    });
    await menu('Guardar como…');
    await waitFor('real preload/IPC save completes', () => saves === 1 && ipc.some(event => event.channel === 'document:save' && event.completed));
    await waitFor('renderer records the completed save', () => evaluate(`(() => {const title=document.querySelector('.document-title')?.textContent||'';return title.includes('Original isolated ALL interaction')&&!title.includes('*');})()`));
    const saved = JSON.parse(await fsp.readFile(output, 'utf8')); assertAllDocument(saved);
    serial = (await observe()).serial;
    await click('button[aria-label="Abrir (Ctrl+O)"]');
    const reopened = await buildAfter(serial, 'all'); assertBodies(reopened, true);
    check(canonical(reopened.features) === canonical(saved.features), 'Reopened worker input differs from the actually saved file.');
    check(opens === 2 && saves === 1, 'Expected only fixture-open, isolated Save As and saved-output reopen.');
    check(!consoleErrors.length && !failedRequests.length, 'Renderer console/request failure occurred.');
    check(protocolResponses.some(asset => /kernel\.worker-[\w-]+\.js$/.test(asset.url) && asset.status === 200)
      && protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200), 'Real production worker/WASM loads were not observed.');
    checks.push({ independentBodyOracles: 'S400-4pi,A/B800-8pi,C800; bounds1e-6, volume1e-5',
      workerBuilds: [['selected', selected], ['preview', preview], ['committed', committed], ['reopened', reopened]].map(([phase, record]) => ({
        phase, requestId: record.id, serial: record.serial, featuresSha256: digest(canonical(record.features)), bodies: record.response.value.bodies })),
      savedPattern: saved.features.at(-1),
      savedContentSha256: digest(await fsp.readFile(output)), savedFeaturesSha256: digest(JSON.stringify(saved.features)) });
  }
  class HiddenWindow extends electron.BrowserWindow {
    constructor(options) {
      super({ ...options, show: false }); check(!window, 'Unexpected second test application window.'); window = this;
      const preferences = this.webContents.getLastWebPreferences();
      check(preferences.contextIsolation && !preferences.nodeIntegration && preferences.sandbox && preferences.webSecurity && !preferences.webviewTag,
        'The actual production security preferences changed.');
      // Electron44 SaveLastPreferences omits the preload path. Check the exact
      // original constructor input, unmodified super options and empty session
      // preload registry; the workflow separately requires the real bridge/IPC.
      const originalPreload = options?.webPreferences?.preload;
      check(typeof originalPreload === 'string' && path.isAbsolute(originalPreload)
        && path.resolve(originalPreload) === path.join(root, 'electron/preload.cjs'), 'The real production preload constructor path was replaced.');
      check(this.webContents.session.getPreloadScripts().length === 0, 'Unexpected additional session preload scripts.');
      this.webContents.on('preload-error', (_event, _preloadPath, error) =>
        finish(new Error('The actual production preload failed.', { cause: error })));
      checks.push({ productionSecurity: { contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration,
        sandbox: preferences.sandbox, webSecurity: preferences.webSecurity, webviewTag: preferences.webviewTag, originalPreload: true } });
      this.webContents.on('console-message', details => { if (details.level === 'error' || details.level === 3) consoleErrors.push(details.message); });
      this.webContents.on('render-process-gone', (_event, details) => finish(new Error('Renderer stopped: ' + details.reason)));
      this.webContents.on('did-fail-load', (_event, code, detail) => finish(new Error(`Renderer load failed: ${code} ${detail}`)));
      this.instrumentation = null;
    }
    show() { check(!this.isVisible(), 'The isolated test window became visible.'); }
    async loadURL(...args) {
      check(!this.instrumentation, 'Unexpected second production navigation in the test.');
      this.instrumentation = (async () => {
        // Initialize this test-owned target before awaiting renderer CDP calls.
        // The original preload also runs on this blank bootstrap; no app bundle,
        // worker or file IPC is supplied or invoked by this page.
        await super.loadURL('about:blank');
        this.webContents.debugger.attach('1.3');
        await this.webContents.debugger.sendCommand('Page.enable');
        await this.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: '(' + installWorkerObserver.toString() + ')();' });
        checks.push('test-owned blank target initialized before CDP observation');
      })();
      await this.instrumentation;
      this.webContents.once('did-finish-load', () => { workflow().then(() => finish(), finish); });
      return super.loadURL(...args);
    }
  }
  const testingProtocol = new Proxy(electron.protocol, { get(target, member) {
    if (member === 'handle') return (scheme, handler) => target.handle(scheme, async request => {
      const response = await handler(request); protocolResponses.push({ url: request.url, status: response.status });
      if (response.status >= 400) failedRequests.push({ url: request.url, status: response.status }); return response;
    });
    const value = Reflect.get(target, member); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const testingIpc = new Proxy(electron.ipcMain, { get(target, member) {
    if (member === 'handle') return (channel, handler) => target.handle(channel, async (event, payload) => {
      const observation = { channel, completed: false }; ipc.push(observation);
      const result = await handler(event, payload); observation.completed = true; return result;
    });
    const value = Reflect.get(target, member); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const testingDialog = new Proxy(electron.dialog, { get(target, member) {
    if (member === 'showOpenDialog') return async (_window, options) => {
      check(options.title === 'Abrir pieza de SolidFlow' && ++opens <= 2, 'Unexpected native open dialog request.');
      return { canceled: false, filePaths: [opens === 1 ? input : output] };
    };
    if (member === 'showSaveDialog') return async (_window, options) => {
      check(options.title === 'Guardar pieza' && ++saves === 1, 'Unexpected native save/export dialog request.');
      return { canceled: false, filePath: output };
    };
    if (member === 'showErrorBox') return (title, message) => finish(new Error(title + ': ' + message));
    const value = Reflect.get(target, member); return typeof value === 'function' ? () => fail('Unexpected native dialog method: ' + String(member)) : value;
  } });
  const testingElectron = new Proxy(electron, { get(target, member) {
    if (member === 'BrowserWindow') return HiddenWindow;
    if (member === 'dialog') return testingDialog;
    if (member === 'protocol') return testingProtocol;
    if (member === 'ipcMain') return testingIpc;
    return Reflect.get(target, member);
  } });
  const Module = require('node:module'), load = Module._load, main = path.join(root, 'electron/main.cjs');
  app.whenReady().then(() => {
    electron.session.defaultSession.webRequest.onErrorOccurred({ urls: ['solidflow://*/*'] }, details => {
      failedRequests.push({ url: details.url, error: details.error });
    });
  });
  Module._load = function(request, parent, ...rest) {
    return request === 'electron' && parent?.filename === main ? testingElectron : Reflect.apply(load, this, [request, parent, ...rest]);
  };
  try { require(main); } finally { Module._load = load; }
}
if (process.versions.electron) runInElectron().catch(error => { console.error(error); process.exitCode = 1; require('electron').app.quit(); });
else launch().catch(error => { console.error(error); process.exitCode = error?.launcherExitCode ?? error?.cause?.launcherExitCode ?? 1; });
