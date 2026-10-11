const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');

// Run with node --test explicitly; .node.cjs keeps Vitest from collecting it.
// Exercise the real main-process handlers against real temporary files without
// opening windows. Only Electron's window/dialog/protocol transport is replaced.
async function harness(t, { packaged = true, developmentUrl = 'https://evil.invalid/' } = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'solidflow-ipc-check-'));
  t.after(async () => {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(temporary).startsWith('solidflow-ipc-check-'));
    await fs.rm(temporary, { recursive: true, force: true });
  });
  const handlers = new Map();
  const protocols = new Map();
  const dialogQueue = [];
  const state = { dialogCalls: 0, fetched: null, error: null };
  let window;
  let ready;
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; window = this;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: 'solidflow://app/index.html' };
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.session = { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} };
    }
    isDestroyed() { return false; }
    loadURL(url) { this.url = url; this.webContents.mainFrame.url = url; return Promise.resolve(); }
    show() {}
    static getAllWindows() { return [window]; }
  }
  const electron = {
    app: {
      isPackaged: packaged, setName() {}, getPath: () => temporary, on() {}, quit() {},
      whenReady: () => ({ then(fn) { ready = Promise.resolve().then(fn); return ready; } }),
    },
    BrowserWindow: Window,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: {
      showErrorBox: (title, message) => { state.error = `${title}: ${message}`; },
      showSaveDialog: async (_window, options) => { state.dialogCalls++; state.lastDialog = options; return dialogQueue.shift(); },
      showOpenDialog: async () => { state.dialogCalls++; return dialogQueue.shift(); },
    },
    protocol: { registerSchemesAsPrivileged() {}, handle: (name, fn) => protocols.set(name, fn) },
    net: { fetch: async (url) => { state.fetched = url; return new Response('bytes', { headers: { 'Content-Type': 'text/javascript' } }); } },
  };
  vm.runInNewContext(await fs.readFile(path.join(ROOT, 'electron/main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : require(name), __dirname: path.join(ROOT, 'electron'),
    Buffer, URL, Uint8Array, Response, Headers, console: { ...console, error() {} },
    process: { platform: process.platform, env: { SOLIDFLOW_DEV_URL: developmentUrl } },
  });
  await ready.catch(() => {});
  await Promise.resolve();
  const event = window ? { sender: window.webContents, senderFrame: window.webContents.mainFrame } : null;
  return { temporary, handlers, protocols, dialogQueue, state, window, event };
}

const content = JSON.stringify({ version: 1, features: [], name: 'Test' });

test('packaged application ignores development URLs and keeps renderer isolation', async (t) => {
  const { window } = await harness(t);
  assert.equal(window.url, 'solidflow://app/index.html');
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
});

test('IPC rejects another renderer, subframes and URL prefix lookalikes before any dialog', async (t) => {
  const { handlers, window, event, state } = await harness(t);
  const save = handlers.get('document:save');
  await assert.rejects(save({ sender: {}, senderFrame: event.senderFrame }, { content }), /no autorizada/);
  await assert.rejects(save({ sender: event.sender, senderFrame: { url: window.url } }, { content }), /no autorizada/);
  event.senderFrame.url += '.evil';
  await assert.rejects(handlers.get('document:open')(event), /no autorizada/);
  assert.equal(state.dialogCalls, 0);
});

test('development accepts only loopback URLs, with exact document matching', async (t) => {
  const invalid = await harness(t, { packaged: false });
  assert.equal(invalid.window, undefined);
  assert.match(invalid.state.error, /servidor local/);
  const local = await harness(t, { packaged: false, developmentUrl: 'http://127.0.0.1:5173/' });
  local.event.senderFrame.url = 'http://127.0.0.1:5173.evil.invalid/';
  await assert.rejects(local.handlers.get('document:open')(local.event), /no autorizada/);
});

test('saving requires a native-dialog grant and preserves it for later saves', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t);
  const save = handlers.get('document:save');
  const selected = path.join(temporary, 'pieza.solidflow');
  await assert.rejects(save(event, { content, filePath: selected }), /Guardar como/);
  dialogQueue.push({ canceled: false, filePath: selected });
  assert.equal(await save(event, { content, name: 'CON' }), selected);
  assert.equal(path.basename(state.lastDialog.defaultPath), 'Pieza.solidflow');
  assert.equal(await fs.readFile(selected, 'utf8'), content);
  assert.equal(await save(event, { content, filePath: selected }), selected);
  assert.equal(state.dialogCalls, 1);
  assert.equal((await fs.readdir(temporary)).some(name => name.endsWith('.tmp')), false);
});

test('document writes count UTF-8 bytes and reject malformed payloads', async (t) => {
  const { handlers, event } = await harness(t);
  const save = handlers.get('document:save');
  await assert.rejects(save(event, { content: 'é'.repeat(10 * 1024 * 1024 + 1) }), /20 MB/);
  await assert.rejects(save(event, null), /no válido/);
  await assert.rejects(save(event, { content: '{broken' }), /JSON válido/);
  await assert.rejects(save(event, { content: '{}' }), /SolidFlow no válido/);
});

test('open grants a selected document, rejects oversized files and export preserves byte offsets', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t);
  const selected = path.join(temporary, 'open.solidflow');
  await fs.writeFile(selected, content);
  dialogQueue.push({ canceled: false, filePaths: [selected] });
  const opened = await handlers.get('document:open')(event);
  assert.equal(opened.content, content);
  assert.equal(opened.path, await fs.realpath(selected));
  assert.equal(await handlers.get('document:save')(event, { content, filePath: opened.path }), opened.path);
  const tooLarge = path.join(temporary, 'large.solidflow');
  const large = await fs.open(tooLarge, 'w'); await large.truncate(20 * 1024 * 1024 + 1); await large.close();
  dialogQueue.push({ canceled: false, filePaths: [tooLarge] });
  await assert.rejects(handlers.get('document:open')(event), /20 MB/);
  const exported = path.join(temporary, 'pieza.stl');
  dialogQueue.push({ canceled: false, filePath: exported });
  const source = new Uint8Array([99, 1, 2, 99]);
  await handlers.get('document:export')(event, { data: source.subarray(1, 3), name: 'Test', format: 'stl' });
  assert.deepEqual([...await fs.readFile(exported)], [1, 2]);
  await assert.rejects(handlers.get('document:export')(event, { data: new Uint8Array([1]), format: 'exe' }), /no válida/);
});

test('failed atomic replacement removes its temporary file', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t);
  const invalidTarget = path.join(temporary, 'folder.solidflow'); await fs.mkdir(invalidTarget);
  dialogQueue.push({ canceled: false, filePath: invalidTarget });
  await assert.rejects(handlers.get('document:save')(event, { content, name: 'Invalid' }));
  assert.equal((await fs.readdir(temporary)).some(name => name.endsWith('.tmp')), false);
});

test('application protocol confines assets to dist and limits eval to the CAD worker', async (t) => {
  const { protocols, state } = await harness(t);
  const serve = protocols.get('solidflow');
  assert.equal((await serve({ url: 'solidflow://evil/index.html', method: 'GET' })).status, 403);
  assert.equal((await serve({ url: 'solidflow://app/%2e%2e%2felectron/main.cjs', method: 'GET' })).status, 403);
  assert.equal((await serve({ url: 'solidflow://app/index.html', method: 'POST' })).status, 403);
  const worker = await serve({ url: 'solidflow://app/assets/kernel.worker-abc.js', method: 'GET' });
  assert.match(worker.headers.get('content-security-policy'), /unsafe-eval/);
  const document = await serve({ url: 'solidflow://app/index.html', method: 'GET' });
  assert.ok(!document.headers.get('content-security-policy').includes("'unsafe-eval'"));
  assert.ok(state.fetched.endsWith('/dist/index.html'));
  const wasm = await serve({ url: 'solidflow://app/assets/kernel.wasm', method: 'GET' });
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');
});
