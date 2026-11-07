// Production-loader smoke test: real Electron/Chromium, local app code, a hidden
// window, isolated temporary user data, no desktop or native UI automation.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { encodeJavaScriptString } = require('./desktop-ui-source.cjs');
const ROOT = path.resolve(__dirname, '..');

// Runs against the observed production worker asset in an independent dedicated
// worker. No fake dispatcher, WASM response, UI document or capability is injected.
function workerQueueProbe(url) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(url, { type: 'module' }), channel = new MessageChannel(), replies = [], events = [];
    const finish = (error, result) => {
      clearTimeout(timer); channel.port1.close(); channel.port2.close(); worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(Error('Production worker queue did not recover from malformed input.')), 15000);
    worker.onerror = event => finish(Error('Production probe worker failed: ' + event.message));
    worker.onmessage = event => {
      replies.push(event.data);
      events.push({ id: event.data?.id, origin: event.origin, sourceIsNull: event.source === null, ports: event.ports.length, isTrusted: event.isTrusted });
      if (replies.length !== 4) return;
      try {
        if (replies.some((reply, i) => reply?.id !== 101 + i) || replies.slice(0, 3).some(reply => reply.ok !== false || typeof reply.error !== 'string' || !reply.error)) throw Error('Malformed inputs did not produce ordered correlated failures.');
        const last = replies[3], value = last.value;
        if (!last.ok || !value || Math.abs(value.volume - 24) > 1e-6 || value.featureErrors.length || value.warnings.length
          || !value.vertices.length || !value.triangles.length || ![...value.vertices, ...value.normals].every(Number.isFinite)) throw Error('The worker did not rebuild the original 2 by 3 by 4 prism.');
        for (const [name, wanted] of [['min', [0, 0, 0]], ['max', [2, 3, 4]]]) if (value.bounds[name].length !== 3 || value.bounds[name].some((v, i) => !Number.isFinite(v) || Math.abs(v - wanted[i]) > 1e-6)) throw Error('Independent native prism bounds failed.');
        if (events.some(item => !item.isTrusted || item.origin !== '' || !item.sourceIsNull || item.ports !== 0)) throw Error('Unexpected dedicated worker response channel.');
        finish(null, { status: 'PASS', malformedWithoutId: 'no reply', portRejectionControl: { requestId: 100, followingBarrierId: 101, observedReplyIds: replies.map(reply => reply.id) },
          correlatedErrors: replies.slice(0, 3).map(reply => ({ id: reply.id, error: reply.error })), nativePrism: { volume: value.volume, bounds: value.bounds }, events });
      } catch (error) { finish(error); }
    };
    try {
      // This real transferred channel is outside the command protocol. The next
      // legitimate reply is an ordered barrier, not a timeout-based silence test.
      worker.postMessage({ id: 100, action: 'init' }, [channel.port2]);
      worker.postMessage(null);
      worker.postMessage({ id: 101, action: 'unknown-operation' });
      worker.postMessage({ id: 102, action: 'build' });
      worker.postMessage({ id: 103, action: 'build', features: null });
      worker.postMessage({ id: 104, action: 'build', features: [
      { id: 'profile', name: 'Original rectangle', type: 'sketch', plane: 'XY', offset: 0, suppressed: false, profile: { kind: 'rectangle', center: [1, 1.5], width: 2, height: 3 } },
      { id: 'solid', name: 'Original prism', type: 'extrude', sketchId: 'profile', depth: 4, symmetric: false, suppressed: false },
      ] });
    } catch (error) { finish(error); }
  });
}

async function launch() {
  await fs.access(path.join(ROOT, 'dist/index.html'));
  const { spawn } = require('node:child_process');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'solidflow-runtime-check-'));
  const environment = { ...process.env, SOLIDFLOW_SMOKE_DIR: temporary };
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.SOLIDFLOW_DEV_URL;
  // Hosted Linux CI uses Mesa llvmpipe, which Chromium blocklists for WebGL.
  // Permit that software renderer for this smoke test while keeping sandboxing.
  const electronArgs = process.platform === 'linux' && environment.CI === 'true'
    ? ['--ignore-gpu-blocklist', __filename] : [__filename];
  let child;
  let timer;
  try {
    const exitCode = await new Promise((resolve, reject) => {
      child = spawn(require('electron'), electronArgs, { cwd: ROOT, env: environment, stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
      timer = setTimeout(() => { child.kill(); reject(new Error('Electron no terminó en 45 segundos.')); }, 45_000);
    });
    process.exitCode = exitCode;
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && !child.killed) child.kill();
    if (!path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(temporary).startsWith('solidflow-runtime-check-')) {
      throw new Error('Ruta temporal inesperada; no se elimina.');
    }
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

function runInElectron() {
  const electron = require('electron');
  const { app } = electron;
  if (!process.env.SOLIDFLOW_SMOKE_DIR) throw new Error('Ejecuta esta prueba con node, no directamente con Electron.');
  app.setPath('userData', process.env.SOLIDFLOW_SMOKE_DIR);
  delete process.env.SOLIDFLOW_DEV_URL;
  const consoleErrors = [];
  const failedRequests = [];
  const loadedAssets = [];
  const protocolResponses = [];
  let finished = false;
  const timer = setTimeout(() => finish(1, 'No se alcanzó el estado listo en 35 segundos.'), 35_000);
  function finish(code, detail) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    console.log(JSON.stringify({ status: code === 0 ? 'PASS' : 'FAIL', detail, consoleErrors, failedRequests, loadedAssets, protocolResponses }, null, 2));
    // Successful readiness uses the normal window shutdown path.
    // A cancelled quit still fails at the Node launcher's existing deadline.
    if (code === 0) app.quit();
    else app.exit(code);
  }
  app.whenReady().then(() => {
    electron.session.defaultSession.webRequest.onCompleted({ urls: ['solidflow://*/*'] }, (details) => {
      loadedAssets.push({ url: details.url, status: details.statusCode });
    });
    electron.session.defaultSession.webRequest.onErrorOccurred({ urls: ['solidflow://*/*'] }, (details) => {
      failedRequests.push({ url: details.url, error: details.error });
    });
  });
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('console-message', (details) => {
      if (details.level === 'error' || details.level === 3) consoleErrors.push(details.message);
    });
    window.webContents.on('render-process-gone', (_event, details) => finish(1, `Renderer detenido: ${details.reason}`));
    window.webContents.on('did-fail-load', (_event, code, description) => finish(1, `Carga fallida: ${code} ${description}`));
    window.webContents.once('did-finish-load', async () => {
      try {
        const state = await window.webContents.executeJavaScript(`new Promise((resolve) => {
          const started = Date.now();
          const inspect = () => {
            const status = document.querySelector('.statusbar')?.textContent || '';
            if ((status.includes('Listo') && status.includes('Sólido')) || Date.now() - started > 25000) {
              resolve({ title: document.title, url: location.href, status, canvasCount: document.querySelectorAll('canvas').length, bridge: typeof window.solidflow?.saveDocument, text: document.body.innerText.slice(-1200) });
            } else setTimeout(inspect, 150);
          }; inspect();
        })`);
        const wasmLoaded = protocolResponses.some(asset => asset.url.endsWith('.wasm') && asset.status === 200);
        const valid = state.url === 'solidflow://app/index.html' && state.status.includes('Listo') && state.status.includes('Sólido') && state.canvasCount > 0 && state.bridge === 'function' && wasmLoaded && !consoleErrors.length && !failedRequests.length;
        let workerQueue;
        if (valid) {
          const asset = protocolResponses.find(item => /^solidflow:\/\/app\/assets\/kernel\.worker-[\w-]+\.js$/.test(item.url) && item.status === 200);
          if (!asset) throw Error('No observed production worker asset for the queue regression.');
          workerQueue = await window.webContents.executeJavaScript('(' + workerQueueProbe.toString() + ')(' + encodeJavaScriptString(asset.url) + ')');
        }
        finish(valid && workerQueue?.status === 'PASS' ? 0 : 1, { ...state, wasmLoaded, workerQueue });
      } catch (error) { finish(1, error.message); }
    });
  });
  // Hide the app's window and observe protocol responses. Linux CI also permits
  // the runner's software GPU through the launch switch above. The actual main
  // process, preload, renderer and worker code and sandbox settings are unchanged.
  const Module = require('node:module');
  const originalLoad = Module._load;
  class HiddenWindow extends electron.BrowserWindow {
    constructor(options) { super({ ...options, show: false }); }
    show() {}
  }
  // Worker requests are not all surfaced through session.webRequest. Observe
  // responses at the unchanged application protocol handler as well.
  const testingProtocol = new Proxy(electron.protocol, {
    get(target, key) {
      if (key === 'handle') return (scheme, handler) => target.handle(scheme, async request => {
        const response = await handler(request);
        protocolResponses.push({ url: request.url, status: response.status });
        return response;
      });
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const testingElectron = new Proxy(electron, { get(target, key) {
    if (key === 'BrowserWindow') return HiddenWindow;
    if (key === 'protocol') return testingProtocol;
    if (key === 'dialog') return new Proxy(electron.dialog, { get(dialog, member) {
      if (member === 'showErrorBox') return (title, message) => finish(1, `${title}: ${message}`);
      return Reflect.get(dialog, member);
    } });
    return Reflect.get(target, key);
  } });
  Module._load = function(request, parent, ...rest) {
    if (request === 'electron' && parent?.filename === path.join(ROOT, 'electron/main.cjs')) return testingElectron;
    return originalLoad.call(this, request, parent, ...rest);
  };
  try { require(path.join(ROOT, 'electron/main.cjs')); }
  finally { Module._load = originalLoad; }
}

if (process.versions.electron) runInElectron();
else launch().catch(error => { console.error(error.message); process.exitCode = 1; });
