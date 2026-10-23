const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { constants: fsConstants } = require('node:fs');
const { execFile, spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

// Run with node --test explicitly; .node.cjs keeps Vitest from collecting it.
// Exercise the real main-process handlers against real temporary files without
// opening windows. Only Electron's window/dialog/protocol transport is replaced.
async function harness(t, { packaged = true, developmentUrl = 'https://evil.invalid/', fileSystem = fs } = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'solidflow-ipc-check-'));
  t.after(async () => {
    assert.ok(path.resolve(temporary).startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(temporary).startsWith('solidflow-ipc-check-'));
    await fs.rm(temporary, { recursive: true, force: true });
  });
  const handlers = new Map();
  const protocols = new Map();
  const dialogQueue = [];
  const closeDialogQueue = [];
  const state = { dialogCalls: 0, closeDialogCalls: 0, fetched: null, error: null, consoleErrors: [] };
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
      showOpenDialog: async (_window, options) => { state.dialogCalls++; state.lastOpenDialog = options; return dialogQueue.shift(); },
      showMessageBoxSync: (owner, options) => {
        state.closeDialogCalls++; state.lastCloseDialog = { owner, options };
        const response = closeDialogQueue.shift();
        if (response instanceof Error) throw response;
        return typeof response === 'function' ? response() : response;
      },
    },
    protocol: { registerSchemesAsPrivileged() {}, handle: (name, fn) => protocols.set(name, fn) },
    net: { fetch: async (url) => { state.fetched = url; return new Response('bytes', { headers: { 'Content-Type': 'text/javascript' } }); } },
  };
  vm.runInNewContext(await fs.readFile(path.join(ROOT, 'electron/main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : name === 'node:fs/promises' ? fileSystem : require(name), __dirname: path.join(ROOT, 'electron'),
    Buffer, URL, Uint8Array, Response, Headers, console: { ...console, error(...args) { state.consoleErrors.push(args); } },
    process: { platform: process.platform, env: { SOLIDFLOW_DEV_URL: developmentUrl } },
  });
  await ready.catch(() => {});
  await Promise.resolve();
  const event = window ? { sender: window.webContents, senderFrame: window.webContents.mainFrame } : null;
  return { temporary, handlers, protocols, dialogQueue, closeDialogQueue, state, window, event };
}

const content = JSON.stringify({ version: 1, features: [], name: 'Test' });
// Original empty assembly transport fixture, without native data or file grants.
const assembly = { version: 2, kind: 'assembly', id: 'original-ipc-assembly', revision: 'r1', name: 'Original assembly', units: 'mm',
  definitions: [], occurrences: [], mates: [], createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' };
const assemblyContent = JSON.stringify(assembly);
// Original empty configured envelope: transport syntax, no geometry authority.
const configuredAssembly = { version: 3, kind: 'configured-assembly', source: assembly, catalog: [{
  definition: { id: assembly.id, revision: assembly.revision },
  configurations: [{ id: 'original-variant', name: 'Original variant', occurrences: [], mates: [] }],
}], rootConfiguration: 'original-variant' };

test('packaged application ignores development URLs and keeps renderer isolation', async (t) => {
  const { window } = await harness(t);
  assert.equal(window.url, 'solidflow://app/index.html');
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
});

test('dirty close defaults to editing and only accepts the exact native close button', async (t) => {
  const { window, closeDialogQueue, state } = await harness(t);
  let allowed = 0;
  const event = { preventDefault() { allowed++; } };
  for (const response of [0, undefined, -1, 2, '1', null]) {
    closeDialogQueue.push(response);
    assert.equal(window.webContents.emit('will-prevent-unload', event), true);
    assert.equal(allowed, 0);
    assert.equal(state.lastCloseDialog.owner, window);
    assert.deepEqual(JSON.parse(JSON.stringify(state.lastCloseDialog.options)), {
      type: 'question', title: 'Cerrar documento', message: 'Hay cambios sin guardar.',
      detail: 'Guarda el documento antes de cerrar si quieres conservar los cambios en un archivo. Las vistas previas sin aplicar se perderán.',
      buttons: ['Seguir editando', 'Cerrar sin guardar'], defaultId: 0, cancelId: 0, noLink: true,
    });
  }
  assert.equal(state.closeDialogCalls, 6); assert.equal(state.dialogCalls, 0); assert.deepEqual(state.consoleErrors, []);
});

test('explicit native close permits unloading without changing file permissions or committed bytes', async (t) => {
  const { window, handlers, event, temporary, dialogQueue, closeDialogQueue, state } = await harness(t);
  const selected = path.join(temporary, 'close-confirmation.solidflow'), save = handlers.get('document:save');
  dialogQueue.push({ canceled: false, filePath: selected });
  assert.equal(await save(event, { content: assemblyContent }), selected);
  let allowed = 0; closeDialogQueue.push(1);
  window.webContents.emit('will-prevent-unload', { preventDefault() { allowed++; } });
  assert.equal(allowed, 1); assert.equal(state.closeDialogCalls, 1);
  assert.equal(await fs.readFile(selected, 'utf8'), assemblyContent);
  assert.equal(await save(event, { content: assemblyContent, filePath: selected }), selected);
  await assert.rejects(save(event, { content: assemblyContent, filePath: path.join(temporary, 'unselected.solidflow') }), /Guardar como/);
  assert.equal(state.dialogCalls, 1); assert.deepEqual(await fs.readdir(temporary), ['close-confirmation.solidflow']);
});

test('native close confirmation failure keeps unloading blocked and reports the failure', async (t) => {
  const { window, closeDialogQueue, state } = await harness(t), failure = new Error('Original close-dialog transport failure');
  let allowed = 0; closeDialogQueue.push(failure);
  assert.doesNotThrow(() => window.webContents.emit('will-prevent-unload', { preventDefault() { allowed++; } }));
  assert.equal(allowed, 0); assert.equal(state.closeDialogCalls, 1); assert.equal(state.dialogCalls, 0);
  assert.equal(state.consoleErrors.length, 1);
  assert.equal(state.consoleErrors[0][0], 'No se pudo confirmar el cierre del documento:');
  assert.equal(state.consoleErrors[0][1], failure);
});

test('close confirmation cannot authorize a destroyed or replaced window', async (t) => {
  const destroyed = await harness(t); let allowed = 0;
  destroyed.window.isDestroyed = () => true;
  destroyed.closeDialogQueue.push(1);
  destroyed.window.webContents.emit('will-prevent-unload', { preventDefault() { allowed++; } });
  assert.equal(destroyed.state.closeDialogCalls, 0); assert.equal(allowed, 0);
  const closedDuringDialog = await harness(t);
  closedDuringDialog.closeDialogQueue.push(() => { closedDuringDialog.window.emit('closed'); return 1; });
  closedDuringDialog.window.webContents.emit('will-prevent-unload', { preventDefault() { allowed++; } });
  assert.equal(closedDuringDialog.state.closeDialogCalls, 1); assert.equal(allowed, 0);
  closedDuringDialog.window.webContents.emit('will-prevent-unload', { preventDefault() { allowed++; } });
  assert.equal(closedDuringDialog.state.closeDialogCalls, 1); assert.equal(allowed, 0);
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

test('assembly Save As writes exact v2 bytes atomically and retains only the chosen grant across document modes', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t);
  const save = handlers.get('document:save'), selected = path.join(temporary, 'assembly.solidflow');
  await assert.rejects(save(event, { content: assemblyContent, filePath: selected }), /Guardar como/);
  dialogQueue.push({ canceled: false, filePath: selected });
  assert.equal(await save(event, { content: assemblyContent, name: assembly.name }), selected);
  assert.equal(state.lastDialog.title, 'Guardar ensamblaje');
  assert.equal(await fs.readFile(selected, 'utf8'), assemblyContent);
  assert.equal(await save(event, { content, filePath: selected }), selected);
  assert.equal(await fs.readFile(selected, 'utf8'), content);
  assert.equal(await save(event, { content: assemblyContent, filePath: selected }), selected);
  await assert.rejects(save(event, { content: assemblyContent, filePath: path.join(temporary, 'unchosen.solidflow') }), /Guardar como/);
  assert.equal(state.dialogCalls, 1);
  assert.deepEqual(await fs.readdir(temporary), ['assembly.solidflow']);
});

test('opening v2 grants the selected document without granting a neighbouring path', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t);
  const selected = path.join(temporary, 'open-assembly.solidflow');
  await fs.writeFile(selected, assemblyContent);
  dialogQueue.push({ canceled: false, filePaths: [selected] });
  const opened = await handlers.get('document:open')(event);
  assert.equal(opened.path, await fs.realpath(selected)); assert.equal(opened.content, assemblyContent);
  assert.equal(state.lastOpenDialog.title, 'Abrir documento de SolidFlow');
  assert.equal(await handlers.get('document:save')(event, { content: assemblyContent, filePath: opened.path }), opened.path);
  await assert.rejects(handlers.get('document:save')(event, { content: assemblyContent, filePath: path.join(temporary, 'other.solidflow') }), /Guardar como/);
});

test('configured Save As and reopen preserve exact v3 bytes, cancellation and only the chosen document grant', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t), save = handlers.get('document:save');
  const selected = path.join(temporary, 'configured.solidflow'), bytes = JSON.stringify(configuredAssembly);
  await assert.rejects(save(event, { content: bytes, filePath: selected }), /Guardar como/);
  dialogQueue.push({ canceled: true });
  assert.equal(await save(event, { content: bytes, name: assembly.name }), null);
  assert.deepEqual(await fs.readdir(temporary), []);
  dialogQueue.push({ canceled: false, filePath: selected });
  assert.equal(await save(event, { content: bytes, name: assembly.name }), selected);
  assert.equal(state.lastDialog.title, 'Guardar ensamblaje configurado');
  assert.equal(await fs.readFile(selected, 'utf8'), bytes);
  dialogQueue.push({ canceled: false, filePaths: [selected] });
  const reopened = await handlers.get('document:open')(event);
  assert.equal(reopened.content, bytes); assert.equal(reopened.path, await fs.realpath(selected));
  assert.equal(await save(event, { content: bytes, filePath: reopened.path }), reopened.path);
  await assert.rejects(save(event, { content: bytes, filePath: path.join(temporary, 'other.solidflow') }), /Guardar como/);
  assert.deepEqual(await fs.readdir(temporary), ['configured.solidflow']);
});

test('configured transport rejects malformed wrappers, nested versions, catalog bounds and persisted authority before dialogs', async (t) => {
  const { handlers, event, temporary, state } = await harness(t), save = handlers.get('document:save');
  const variant = configuredAssembly.catalog[0].configurations[0], owner = configuredAssembly.catalog[0];
  const invalid = [
    { ...configuredAssembly, kind: 'assembly' }, { ...configuredAssembly, version: 4 },
    { ...configuredAssembly, generation: 3 }, { ...configuredAssembly, token: 'not-authority' },
    { ...configuredAssembly, source: configuredAssembly }, { ...configuredAssembly, source: { ...assembly, version: 1 } },
    { ...configuredAssembly, catalog: {} }, { ...configuredAssembly, catalog: Array(514).fill(owner) },
    { ...configuredAssembly, rootConfiguration: 1 }, { ...configuredAssembly, rootConfiguration: 'x\u0000y' },
    { ...configuredAssembly, catalog: [{ ...owner, configurations: Array(65).fill(variant) }] },
    { ...configuredAssembly, catalog: [{ ...owner, definition: { ...owner.definition, filePath: 'ungranted.solidflow' } }] },
    { ...configuredAssembly, catalog: [{ ...owner, configurations: [{ ...variant, id: '' }] }] },
    { ...configuredAssembly, catalog: [{ ...owner, configurations: [{ ...variant, name: 'x'.repeat(201) }] }] },
    { ...configuredAssembly, catalog: [{ ...owner, configurations: [{ ...variant, occurrences: Array(4097).fill({}) }] }] },
  ];
  for (const document of invalid) await assert.rejects(save(event, { content: JSON.stringify(document) }), /SolidFlow no válido/);
  assert.equal(state.dialogCalls, 0); assert.deepEqual(await fs.readdir(temporary), []);
});

test('v2 envelope rejects malformed metadata, hybrid fields and unbounded arrays before dialogs or writes', async (t) => {
  const { handlers, event, temporary, state } = await harness(t), save = handlers.get('document:save');
  const invalid = [
    { ...assembly, kind: 'part' }, { ...assembly, units: 'inch' }, { ...assembly, version: 3 },
    { ...assembly, id: '' }, { ...assembly, id: 'x\u0000y' }, { ...assembly, revision: 'r'.repeat(129) },
    { ...assembly, name: ' ' }, { ...assembly, name: 'x'.repeat(201) },
    { ...assembly, createdAt: 'yesterday' }, { ...assembly, createdAt: '2026-10-15' },
    { ...assembly, updatedAt: '2026-10-14T00:00:00.000Z' },
    { ...assembly, definitions: {} }, { ...assembly, occurrences: null }, { ...assembly, mates: 'mates' },
    { ...assembly, definitions: Array(513).fill(null) }, { ...assembly, occurrences: Array(4097).fill(null) },
    { ...assembly, mates: Array(4097).fill(null) }, { ...assembly, features: [] }, { ...assembly, filePath: 'injected.solidflow' },
    Object.fromEntries(Object.entries(assembly).filter(([key]) => key !== 'revision')),
  ];
  for (const document of invalid) await assert.rejects(save(event, { content: JSON.stringify(document) }), /SolidFlow no válido/);
  assert.equal(state.dialogCalls, 0); assert.deepEqual(await fs.readdir(temporary), []);
});

test('v2 JSON counts multibyte UTF-8 size before envelope validation or granting a path', async (t) => {
  const { handlers, event, temporary, state } = await harness(t);
  const oversized = JSON.stringify({ ...assembly, name: 'é'.repeat(10 * 1024 * 1024 + 1) });
  assert.ok(oversized.length < 20 * 1024 * 1024); assert.ok(Buffer.byteLength(oversized, 'utf8') > 20 * 1024 * 1024);
  await assert.rejects(handlers.get('document:save')(event, { content: oversized }), /20 MB/);
  assert.equal(state.dialogCalls, 0); assert.deepEqual(await fs.readdir(temporary), []);
});

test('cancelled assembly Save As and rejected envelopes preserve existing files and grant boundaries', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t), save = handlers.get('document:save');
  const selected = path.join(temporary, 'retained.solidflow'); await fs.writeFile(selected, content);
  dialogQueue.push({ canceled: true, filePath: selected });
  assert.equal(await save(event, { content: assemblyContent }), null);
  await assert.rejects(save(event, { content: JSON.stringify({ ...assembly, units: 'm' }), filePath: selected }), /SolidFlow no válido/);
  await assert.rejects(save(event, { content: assemblyContent, filePath: selected }), /Guardar como/);
  assert.equal(await fs.readFile(selected, 'utf8'), content); assert.deepEqual(await fs.readdir(temporary), ['retained.solidflow']);
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

test('CSV export writes exact UTF-8/BOM subarray bytes and grants no document path', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t);
  const selected = path.join(temporary, 'materiales.CSV');
  const bytes = Buffer.from('\ufeff"Name"\r\n"Écrou 🛠"\r\n', 'utf8');
  const backing = new Uint8Array(Buffer.concat([Buffer.from([0xff]), bytes, Buffer.from([0xff])]));
  dialogQueue.push({ canceled: false, filePath: selected });
  assert.equal(await handlers.get('document:export')(event, { data: backing.subarray(1, backing.length - 1), name: 'Materiales', format: 'csv' }), selected);
  assert.deepEqual(await fs.readFile(selected), bytes);
  assert.equal(state.lastDialog.title, 'Exportar lista de materiales');
  assert.equal(state.lastDialog.defaultPath, path.join(temporary, 'Materiales.csv'));
  assert.deepEqual(JSON.parse(JSON.stringify(state.lastDialog.filters)), [{ name: 'CSV', extensions: ['csv'] }]);
  await assert.rejects(handlers.get('document:save')(event, { content, filePath: selected }), /\.solidflow/);
  await assert.rejects(handlers.get('document:save')(event, { content, filePath: path.join(temporary, 'materiales.solidflow') }), /Guardar como/);
  assert.deepEqual(await fs.readdir(temporary), ['materiales.CSV']);
});

test('CSV, STEP and STL export snapshot the exact byte view before awaiting their native dialog', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t), exporting = handlers.get('document:export');
  for (const format of ['csv', 'step', 'stl']) {
    const selected = path.join(temporary, `owned.${format}`), backing = new Uint8Array([0xff, 65, 0xc3, 0xa9, 0xff]);
    let completeDialog;
    dialogQueue.push(new Promise(resolve => { completeDialog = resolve; }));
    const pending = exporting(event, { data: backing.subarray(1, 4), name: 'Original', format });
    backing.fill(0xff);
    completeDialog({ canceled: false, filePath: selected });
    assert.equal(await pending, selected);
    assert.deepEqual([...await fs.readFile(selected)], [65, 0xc3, 0xa9]);
  }
});

test('CSV rejects malformed UTF-8 before opening a dialog or writing any temporary file', async (t) => {
  const { handlers, event, temporary, state } = await harness(t), exporting = handlers.get('document:export');
  // Original invalid byte sequences: truncated, overlong, surrogate and > U+10FFFF.
  for (const data of [[0xc3], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xff]]) {
    await assert.rejects(exporting(event, { data: new Uint8Array(data), format: 'csv' }), /UTF-8 válido/);
  }
  assert.equal(state.dialogCalls, 0); assert.deepEqual(await fs.readdir(temporary), []);
});

test('CSV enforces the byte-based 20 MiB boundary and rejects empty or unsupported payloads before dialogs', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t), exporting = handlers.get('document:export');
  const maximum = 20 * 1024 * 1024;
  for (const data of [new Uint8Array(), new Uint8Array(maximum + 1), Buffer.from('é'.repeat(maximum / 2 + 1)), 'text']) {
    await assert.rejects(exporting(event, { data, format: 'csv' }), /20 MB/);
  }
  for (const format of ['CSV', 'xlsx', 'exe', undefined]) {
    await assert.rejects(exporting(event, { data: new Uint8Array([65]), format }), /no válida/);
  }
  assert.equal(state.dialogCalls, 0); assert.deepEqual(await fs.readdir(temporary), []);
  const selected = path.join(temporary, 'limit.csv'), bytes = new Uint8Array(maximum).fill(65);
  dialogQueue.push({ canceled: false, filePath: selected });
  assert.equal(await exporting(event, { data: bytes, format: 'csv' }), selected);
  assert.deepEqual(await fs.readFile(selected), Buffer.from(bytes));
});

test('cancelled CSV export and invalid chosen extensions preserve existing bytes and grant boundaries', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t), exporting = handlers.get('document:export');
  const retained = path.join(temporary, 'retained.csv'), wrong = path.join(temporary, 'retained.solidflow');
  await fs.writeFile(retained, 'original CSV'); await fs.writeFile(wrong, content);
  dialogQueue.push({ canceled: true, filePath: retained });
  assert.equal(await exporting(event, { data: new Uint8Array([65]), format: 'csv' }), null);
  for (const filePath of [wrong, path.join(temporary, 'wrong.csv.exe'), 'relative.csv']) {
    dialogQueue.push({ canceled: false, filePath });
    await assert.rejects(exporting(event, { data: new Uint8Array([65]), format: 'csv' }), /\.csv/);
  }
  assert.equal(await fs.readFile(retained, 'utf8'), 'original CSV'); assert.equal(await fs.readFile(wrong, 'utf8'), content);
  await assert.rejects(handlers.get('document:save')(event, { content, filePath: wrong }), /Guardar como/);
  assert.deepEqual((await fs.readdir(temporary)).sort(), ['retained.csv', 'retained.solidflow']);
});

test('CSV export rejects another renderer, wrong frames and navigated documents before showing a dialog', async (t) => {
  const { handlers, event, temporary, state } = await harness(t), exporting = handlers.get('document:export');
  const payload = { data: new Uint8Array([65]), format: 'csv' };
  await assert.rejects(exporting({ sender: {}, senderFrame: event.senderFrame }, payload), /no autorizada/);
  await assert.rejects(exporting({ sender: event.sender, senderFrame: { url: event.senderFrame.url } }, payload), /no autorizada/);
  event.senderFrame.url += '.evil';
  await assert.rejects(exporting(event, payload), /no autorizada/);
  assert.equal(state.dialogCalls, 0); assert.deepEqual(await fs.readdir(temporary), []);
});

test('CSV export rechecks navigation and main-frame identity after the save dialog before writing', async (t) => {
  for (const change of ['navigation', 'frame']) {
    const { handlers, event, temporary, dialogQueue, state } = await harness(t), exporting = handlers.get('document:export');
    const selected = path.join(temporary, 'not-written.csv'); await fs.writeFile(selected, 'retained');
    dialogQueue.push({ canceled: false, filePath: selected });
    const pending = exporting(event, { data: new Uint8Array([65]), format: 'csv' });
    const rejected = assert.rejects(pending, /no autorizada/);
    if (change === 'navigation') event.senderFrame.url = 'solidflow://app/another.html';
    else event.senderFrame = { url: event.senderFrame.url };
    await rejected;
    assert.equal(await fs.readFile(selected, 'utf8'), 'retained');
    assert.equal(state.dialogCalls, 1); assert.deepEqual(await fs.readdir(temporary), ['not-written.csv']);
  }
});

test('a pending CSV dialog serializes all file operations and releases the gate after cancellation', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t), exporting = handlers.get('document:export');
  let completeDialog;
  dialogQueue.push(new Promise(resolve => { completeDialog = resolve; }));
  const pending = exporting(event, { data: new Uint8Array([65]), format: 'csv' });
  await assert.rejects(handlers.get('document:open')(event), /operación de archivo actual/);
  await assert.rejects(handlers.get('document:save')(event, { content }), /operación de archivo actual/);
  await assert.rejects(exporting(event, { data: new Uint8Array([66]), format: 'csv' }), /operación de archivo actual/);
  assert.equal(state.dialogCalls, 1);
  completeDialog({ canceled: true }); assert.equal(await pending, null);
  const selected = path.join(temporary, 'after-cancel.csv'); dialogQueue.push({ canceled: false, filePath: selected });
  assert.equal(await exporting(event, { data: new Uint8Array([67]), format: 'csv' }), selected);
  assert.equal(await fs.readFile(selected, 'utf8'), 'C');
  assert.equal(state.dialogCalls, 2); assert.deepEqual(await fs.readdir(temporary), ['after-cancel.csv']);
});

test('failed CSV atomic replacement cleans its temporary file and does not grant a neighbouring document', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t);
  const target = path.join(temporary, 'folder.csv'); await fs.mkdir(target);
  dialogQueue.push({ canceled: false, filePath: target });
  await assert.rejects(handlers.get('document:export')(event, { data: new Uint8Array([65]), format: 'csv' }));
  assert.deepEqual(await fs.readdir(temporary), ['folder.csv']);
  await assert.rejects(handlers.get('document:save')(event, { content, filePath: path.join(temporary, 'folder.solidflow') }), /Guardar como/);
});

test('failed atomic replacement removes its temporary file', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t);
  const invalidTarget = path.join(temporary, 'folder.solidflow'); await fs.mkdir(invalidTarget);
  dialogQueue.push({ canceled: false, filePath: invalidTarget });
  await assert.rejects(handlers.get('document:save')(event, { content, name: 'Invalid' }));
  assert.equal((await fs.readdir(temporary)).some(name => name.endsWith('.tmp')), false);
});

test('STEP import returns exact selected bytes and a basename without granting write access', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t);
  const selected = path.join(temporary, 'Part.STP');
  const bytes = Buffer.from([73, 83, 79, 45, 0, 255, 13, 10]);
  await fs.writeFile(selected, bytes);
  dialogQueue.push({ canceled: false, filePaths: [selected] });
  const imported = await handlers.get('document:import-step')(event);
  assert.deepEqual(Object.keys(imported).sort(), ['data', 'name']);
  assert.equal(imported.name, 'Part.STP');
  assert.deepEqual([...imported.data], [...bytes]);
  await assert.rejects(handlers.get('document:save')(event, { content, filePath: path.join(temporary, 'Part.solidflow') }), /Guardar como/);
  assert.deepEqual(await fs.readFile(selected), bytes);
});

test('STEP import bounds reads, rejects other extensions and leaves cancelled selections untouched', async (t) => {
  const { handlers, event, temporary, dialogQueue } = await harness(t);
  const importing = handlers.get('document:import-step');
  dialogQueue.push({ canceled: true, filePaths: [] });
  assert.equal(await importing(event), null);
  dialogQueue.push({ canceled: false, filePaths: [path.join(temporary, 'piece.exe')] });
  await assert.rejects(importing(event), /\.step o \.stp/);
  const largePath = path.join(temporary, 'large.step');
  const large = await fs.open(largePath, 'w');
  await large.truncate(8 * 1024 * 1024 + 1); await large.close();
  dialogQueue.push({ canceled: false, filePaths: [largePath] });
  await assert.rejects(importing(event), /8 MB/);
  const emptyPath = path.join(temporary, 'empty.step'); await fs.writeFile(emptyPath, '');
  dialogQueue.push({ canceled: false, filePaths: [emptyPath] });
  await assert.rejects(importing(event), /vacío/);
});

test('STEP import checks the sender before and after the dialog and serializes file operations', async (t) => {
  const { handlers, event, temporary, dialogQueue, state } = await harness(t);
  const importing = handlers.get('document:import-step');
  await assert.rejects(importing({ sender: {}, senderFrame: event.senderFrame }), /no autorizada/);
  await assert.rejects(importing({ sender: event.sender, senderFrame: { url: event.senderFrame.url } }), /no autorizada/);
  assert.equal(state.dialogCalls, 0);
  dialogQueue.push({ canceled: false, filePaths: [path.join(temporary, 'not-read.step')] });
  const first = importing(event);
  const rejected = assert.rejects(first, /no autorizada/);
  const concurrent = assert.rejects(handlers.get('document:open')(event), /operación de archivo actual/);
  event.senderFrame.url = 'solidflow://app/another.html';
  await Promise.all([rejected, concurrent]);
  assert.equal(state.dialogCalls, 1);
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


const sourceDigest = bytes => createHash('sha256').update(bytes).digest('hex');
async function chooseSource(h, selected) {
  h.dialogQueue.push({ canceled: false, filePaths: [selected] });
  return h.handlers.get('source:choose')(h.event);
}
test('linked sources expose exact strict UTF8 bytes/digest through opaque read-only grants', async t => {
  const h=await harness(t), selected=path.join(h.temporary,'Original source.solidflow'), bytes=Buffer.from('{"name":"Original é"}\n','utf8');
  await fs.writeFile(selected,bytes);const chosen=await chooseSource(h,selected);
  assert.deepEqual(Object.keys(chosen).sort(),['content','grantId','name','sha256']);assert.match(chosen.grantId,/^[0-9a-f-]{36}$/);assert.equal(chosen.name,'Original source.solidflow');assert.equal(chosen.content,bytes.toString('utf8'));assert.equal(chosen.sha256,sourceDigest(bytes));assert.ok(!JSON.stringify(chosen).includes(h.temporary));
  assert.deepEqual(JSON.parse(JSON.stringify(await h.handlers.get('source:read')(h.event,chosen.grantId))),JSON.parse(JSON.stringify(chosen)));
  await assert.rejects(h.handlers.get('document:save')(h.event,{content,filePath:selected}),/Guardar como/);
  assert.equal(h.state.lastOpenDialog.title,'Elegir fuente enlazada de SolidFlow');assert.deepEqual(JSON.parse(JSON.stringify(h.state.lastOpenDialog.filters)),[{name:'Documento SolidFlow',extensions:['solidflow']}]);
});
test('linked source reads permit changed bytes and atomic replacement at the same canonical pathname',async t=>{
  const h=await harness(t),selected=path.join(h.temporary,'original.solidflow');await fs.writeFile(selected,'first');const a=await chooseSource(h,selected);
  await fs.writeFile(selected,'changed content');const b=await h.handlers.get('source:read')(h.event,a.grantId);assert.equal(b.content,'changed content');assert.equal(b.sha256,sourceDigest(Buffer.from('changed content')));assert.notEqual(a.sha256,b.sha256);
  const next=path.join(h.temporary,'replacement.solidflow');await fs.writeFile(next,'atomic update');await fs.rename(next,selected);const c=await h.handlers.get('source:read')(h.event,a.grantId);assert.equal(c.content,'atomic update');assert.equal(c.sha256,sourceDigest(Buffer.from('atomic update')));assert.equal(c.grantId,a.grantId);
});
test('linked source channels reject foreign callers, forged grants and raw paths before file IO',async t=>{
  let opens=0;const fileSystem={...fs,open:async(...args)=>{opens++;return fs.open(...args);}},h=await harness(t,{fileSystem});
  for(const channel of ['source:choose','source:read','source:release']){
    await assert.rejects(h.handlers.get(channel)({sender:{},senderFrame:h.event.senderFrame},'fake'),/no autorizada/);
    await assert.rejects(h.handlers.get(channel)({sender:h.event.sender,senderFrame:{url:h.window.url}},'fake'),/no autorizada/);
  }
  for(const payload of [null,{},h.temporary,'../original.solidflow','00000000-0000-4000-8000-000000000000'])await assert.rejects(h.handlers.get('source:read')(h.event,payload),/fuente/);
  await assert.rejects(h.handlers.get('source:choose')(h.event,{path:h.temporary}),/no válida/);assert.equal(opens,0);assert.equal(h.state.dialogCalls,0);
});
test('linked source cancellation, release and closed window revoke only read capabilities',async t=>{
  const h=await harness(t);h.dialogQueue.push({canceled:true,filePaths:[]});assert.equal(await h.handlers.get('source:choose')(h.event),null);
  const selected=path.join(h.temporary,'source.solidflow');await fs.writeFile(selected,content);const a=await chooseSource(h,selected);await h.handlers.get('source:release')(h.event,a.grantId);await h.handlers.get('source:release')(h.event,a.grantId);await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/no disponible/);
  const b=await chooseSource(h,selected);h.window.emit('closed');await assert.rejects(h.handlers.get('source:read')(h.event,b.grantId),/no autorizada/);assert.equal(await fs.readFile(selected,'utf8'),content);
});
test('linked source refuses invalid UTF8, nonregular/oversize inputs and filesystem path disclosure',async t=>{
  const h=await harness(t),invalid=path.join(h.temporary,'invalid.solidflow');await fs.writeFile(invalid,Buffer.from([0xc3,0x28]));
  for(const selected of [invalid,path.join(h.temporary,'missing.solidflow')]){await assert.rejects(chooseSource(h,selected),error=>!error.message.includes(h.temporary)&&/fuente/.test(error.message));}
  const directory=path.join(h.temporary,'directory.solidflow');await fs.mkdir(directory);await assert.rejects(chooseSource(h,directory),/fuente/);
  const large=path.join(h.temporary,'large.solidflow'),handle=await fs.open(large,'w');try{await handle.truncate(20*1024*1024+1);}finally{await handle.close();}await assert.rejects(chooseSource(h,large),/fuente/);
});
test('linked source rejects symlink retargeting instead of following a new source',async t=>{
  const h=await harness(t),first=path.join(h.temporary,'first.solidflow'),second=path.join(h.temporary,'second.solidflow'),link=path.join(h.temporary,'link.solidflow');await fs.writeFile(first,'first');await fs.writeFile(second,'second');
  try{await fs.symlink(first,link,'file');}catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('OS does not permit this process to create file symlinks');return;}throw error;}
  const a=await chooseSource(h,link);await fs.unlink(link);await fs.symlink(second,link,'file');await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/fuente/);assert.equal(await fs.readFile(first,'utf8'),'first');assert.equal(await fs.readFile(second,'utf8'),'second');
});
test('linked source rechecks sender after dialog, including cancellation, and shares the file operation gate',async t=>{
  const h=await harness(t);h.dialogQueue.push({canceled:true,filePaths:[]});const pending=h.handlers.get('source:choose')(h.event),rejected=assert.rejects(pending,/no autorizada/);const concurrent=assert.rejects(h.handlers.get('document:open')(h.event),/operación de archivo actual/);h.event.senderFrame.url='solidflow://app/replaced.html';await Promise.all([rejected,concurrent]);assert.equal(h.state.dialogCalls,1);
});
test('linked source growth during bounded read fails closed and closes the actual handle',async t=>{
  let grow=false,closed=0,selected;const fileSystem={...fs,open:async(...args)=>{const handle=await fs.open(...args);if(!grow)return handle;return {stat:options=>handle.stat(options),read:async(...readArgs)=>{if(grow){grow=false;await fs.appendFile(selected,'extra');}return handle.read(...readArgs);},close:async()=>{closed++;return handle.close();}};}};
  const h=await harness(t,{fileSystem});selected=path.join(h.temporary,'growing.solidflow');await fs.writeFile(selected,'start');const a=await chooseSource(h,selected);grow=true;await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/fuente/);assert.equal(closed,1);
});
test('linked source detects same-length replacement during read and rechecks sender after closing IO',async t=>{
  let action=null,selected,h;const fileSystem={...fs,open:async(...args)=>{const handle=await fs.open(...args);return {stat:options=>handle.stat(options),read:async(...readArgs)=>{const result=await handle.read(...readArgs);if(action==='replace'){action=null;const replacement=path.join(h.temporary,'new.solidflow');await fs.writeFile(replacement,'other');await fs.rename(replacement,selected);}return result;},close:async()=>{await handle.close();if(action==='navigate'){action=null;h.event.senderFrame.url='solidflow://app/other.html';}}};}};
  h=await harness(t,{fileSystem});selected=path.join(h.temporary,'stable.solidflow');await fs.writeFile(selected,'first');const a=await chooseSource(h,selected);action='replace';await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/fuente/);action='navigate';await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/no autorizada/);
});
test('linked source grant count is bounded and release permits a new native choice',async t=>{
  const h=await harness(t),selected=path.join(h.temporary,'bounded.solidflow');await fs.writeFile(selected,content);const grants=[];for(let i=0;i<512;i++)grants.push((await chooseSource(h,selected)).grantId);assert.equal(new Set(grants).size,512);
  await assert.rejects(h.handlers.get('source:choose')(h.event),/límite/);assert.equal(h.state.dialogCalls,512);await h.handlers.get('source:release')(h.event,grants[0]);assert.ok((await chooseSource(h,selected)).grantId);assert.equal(h.state.dialogCalls,513);
});
test('preload exposes linked source methods without a raw path or general IPC bridge',async()=>{
  let exposed;const calls=[];vm.runInNewContext(await fs.readFile(path.join(ROOT,'electron/preload.cjs'),'utf8'),{require:name=>{assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(name,value)=>{assert.equal(name,'solidflow');exposed=value;}},ipcRenderer:{invoke:(...args)=>{calls.push(args);return Promise.resolve(null);}}};}});
  await exposed.chooseLinkedSource();await exposed.readLinkedSource('opaque');await exposed.releaseLinkedSource('opaque');assert.deepEqual(calls,[['source:choose'],['source:read','opaque'],['source:release','opaque']]);assert.ok(Object.isFrozen(exposed));assert.equal(exposed.ipcRenderer,undefined);
});


test('linked source rejects canonical parent-directory retargeting through a real directory link',async t=>{
  const h=await harness(t),first=path.join(h.temporary,'first-dir'),second=path.join(h.temporary,'second-dir'),link=path.join(h.temporary,'source-link');await fs.mkdir(first);await fs.mkdir(second);await fs.writeFile(path.join(first,'source.solidflow'),'first');await fs.writeFile(path.join(second,'source.solidflow'),'second');
  try{await fs.symlink(first,link,'junction');}catch(error){if(['EPERM','EACCES','ENOTSUP'].includes(error.code)){t.skip('OS does not permit directory links');return;}throw error;}
  const a=await chooseSource(h,path.join(link,'source.solidflow'));assert.equal(a.content,'first');assert.equal((await fs.lstat(link)).isSymbolicLink(),true);
  if(process.platform==='win32')await fs.rmdir(link);else await fs.unlink(link);await fs.symlink(second,link,'junction');await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/fuente/);assert.equal(await fs.readFile(path.join(first,'source.solidflow'),'utf8'),'first');assert.equal(await fs.readFile(path.join(second,'source.solidflow'),'utf8'),'second');
});
test('linked source with unavailable file identity fails closed instead of attesting a stable handle',async t=>{
  let hide=false;const fileSystem={...fs,lstat:async(...args)=>{const stat=await fs.lstat(...args);if(hide)stat.ino=0n;return stat;}};
  const h=await harness(t,{fileSystem}),selected=path.join(h.temporary,'identity.solidflow');await fs.writeFile(selected,content);const a=await chooseSource(h,selected);hide=true;await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/fuente/);
});


test('linked source release is immediate during a pending read and cannot be undone by its result',async t=>{
  let wait=null,enteredResolve;const entered=new Promise(resolve=>{enteredResolve=resolve;});const fileSystem={...fs,open:async(...args)=>{const handle=await fs.open(...args);return {stat:options=>handle.stat(options),read:async(...readArgs)=>{if(wait){const barrier=wait;enteredResolve();await barrier;}return handle.read(...readArgs);},close:()=>handle.close()};}};
  const h=await harness(t,{fileSystem}),selected=path.join(h.temporary,'concurrent.solidflow');await fs.writeFile(selected,content);const a=await chooseSource(h,selected);let resume;wait=new Promise(resolve=>{resume=resolve;});const pending=h.handlers.get('source:read')(h.event,a.grantId);await entered;
  await h.handlers.get('source:release')(h.event,a.grantId);await h.handlers.get('source:release')(h.event,a.grantId);wait=null;resume();assert.equal((await pending).content,content);await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/no disponible/);
});
test('linked source release remains available during an unrelated pending native dialog',async t=>{
  const h=await harness(t),selected=path.join(h.temporary,'release-dialog.solidflow');await fs.writeFile(selected,content);const a=await chooseSource(h,selected);let resume;const delayed=new Promise(resolve=>{resume=resolve;});h.dialogQueue.push(delayed);const pending=h.handlers.get('source:choose')(h.event);await Promise.resolve();
  await h.handlers.get('source:release')(h.event,a.grantId);resume({canceled:true,filePaths:[]});assert.equal(await pending,null);await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/no disponible/);
});
test('linked source decodes an optional UTF8 BOM but hashes every original byte and keeps malformed UTF8 strict',async t=>{
  const h=await harness(t),selected=path.join(h.temporary,'bom.solidflow'),bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(content)]);await fs.writeFile(selected,bytes);const a=await chooseSource(h,selected);assert.equal(a.content,content);assert.equal(JSON.parse(a.content).version,1);assert.equal(a.sha256,sourceDigest(bytes));assert.notEqual(a.sha256,sourceDigest(Buffer.from(a.content)));
  await fs.writeFile(selected,Buffer.from([0xef,0xbb,0xbf,0xc3,0x28]));await assert.rejects(h.handlers.get('source:read')(h.event,a.grantId),/fuente/);
});

// Main opens the real canonical path. Keep a distinct dialog path on Windows
// so fault injection cannot silently miss an equivalent case/temporary alias.
// This prepares owned fixtures before arming faults; it does no IO in a hook.
async function readFaultSelection(raw){
  const canonicalSelected=await fs.realpath(raw),selected=process.platform==='win32'?raw.toUpperCase():raw;
  if(process.platform==='win32')assert.notEqual(selected,canonicalSelected,'Exercise a distinct Windows case alias');
  assert.equal(await fs.realpath(selected),canonicalSelected,'Selected alias resolves to the exact owned file');
  return {selected,canonicalSelected};
}

test('descriptor-first reads reject a different actual file before reading bytes and drain the real handle',async t=>{
  for(const channel of ['source:read','document:open','document:import-step']){
    let armed=false,selected,canonicalSelected,neighbour,reads=0,closed=0;
    const fileSystem={...fs,open:async(file,flags,...args)=>{
      if(!armed || file!==canonicalSelected)return fs.open(file,flags,...args);
      assert.equal(typeof flags,'number');
      if(process.platform==='win32')assert.equal(flags,fsConstants.O_RDONLY);
      else{assert.ok(flags&fsConstants.O_NOFOLLOW);assert.ok(flags&fsConstants.O_NONBLOCK);}
      const handle=await fs.open(neighbour,flags,...args);
      return {stat:options=>handle.stat(options),read:async(...params)=>{reads++;return handle.read(...params);},close:async()=>{closed++;await handle.close();}};
    }};
    const h=await harness(t,{fileSystem}),extension=channel==='document:import-step'?'step':'solidflow';
    selected=path.join(h.temporary,'selected.'+extension);neighbour=path.join(h.temporary,'different.'+extension);
    const selectedBytes=Buffer.from(content),otherBytes=Buffer.from('different original bytes');
    await fs.writeFile(selected,selectedBytes);await fs.writeFile(neighbour,otherBytes);
    ({selected,canonicalSelected}=await readFaultSelection(selected));
    const grant=channel==='source:read'?await chooseSource(h,selected):null;
    const request=()=>{if(channel!=='source:read')h.dialogQueue.push({canceled:false,filePaths:[selected]});return h.handlers.get(channel)(h.event,grant?.grantId);};
    armed=true;
    await assert.rejects(request());assert.equal(reads,0);assert.equal(closed,1);
    assert.deepEqual(await fs.readFile(selected),selectedBytes);assert.deepEqual(await fs.readFile(neighbour),otherBytes);
    if(extension==='solidflow')await assert.rejects(h.handlers.get('document:save')(h.event,{content,filePath:selected}),/Guardar como/);
    armed=false;const actual=await request();
    if(channel==='document:import-step')assert.deepEqual(Buffer.from(actual.data),selectedBytes);else assert.equal(actual.content,content);
  }
});

test('descriptor admission rejects nonregular handles before pathname admission or reading and leaves the file gate usable',async t=>{
  // Portable fault injection over a real owned file descriptor. The actual
  // kernel FIFO/open behavior is a separate POSIX-only child test below.
  for(const channel of ['source:read','document:open','document:import-step']){
    let armed=false,selected,canonicalSelected,reads=0,closed=0,pathStats=0;
    const fileSystem={...fs,lstat:async(...args)=>{if(armed && args[0]===canonicalSelected)pathStats++;return fs.lstat(...args);},open:async(...args)=>{
      const handle=await fs.open(...args);
      if(!armed || args[0]!==canonicalSelected)return handle;
      return {stat:async options=>{const actual=await handle.stat(options);return {...actual,isFile:()=>false};},
        read:async(...params)=>{reads++;return handle.read(...params);},close:async()=>{closed++;await handle.close();}};
    }};
    const h=await harness(t,{fileSystem});selected=path.join(h.temporary,'nonregular-observation.'+(channel==='document:import-step'?'step':'solidflow'));
    await fs.writeFile(selected,content);({selected,canonicalSelected}=await readFaultSelection(selected));const grant=channel==='source:read'?await chooseSource(h,selected):null;
    const request=()=>{if(channel!=='source:read')h.dialogQueue.push({canceled:false,filePaths:[selected]});return h.handlers.get(channel)(h.event,grant?.grantId);};
    armed=true;await assert.rejects(request());assert.equal(reads,0);assert.equal(closed,1);assert.equal(pathStats,0);
    armed=false;await request();assert.equal(await fs.readFile(selected,'utf8'),content);
  }
});

test('protected open failure is not retried with an unprotected flag or promoted to a read capability',async t=>{
  let fail=false,attempts=0,selected,canonicalSelected;
  const fileSystem={...fs,open:async(...args)=>{
    if(fail && args[0]===canonicalSelected){attempts++;const error=new Error('Original ELOOP '+selected);error.code='ELOOP';throw error;}
    return fs.open(...args);
  }};
  const h=await harness(t,{fileSystem});selected=path.join(h.temporary,'nofollow.solidflow');await fs.writeFile(selected,content);
  ({selected,canonicalSelected}=await readFaultSelection(selected));
  fail=true;await assert.rejects(chooseSource(h,selected),error=>/fuente/.test(error.message)&&!error.message.includes(h.temporary));assert.equal(attempts,1);
  fail=false;const grant=await chooseSource(h,selected);assert.equal(grant.content,content);
  fail=true;await assert.rejects(h.handlers.get('source:read')(h.event,grant.grantId),/fuente/);assert.equal(attempts,2);
  assert.equal(await fs.readFile(selected,'utf8'),content);
});

// The actual POSIX race is isolated in a killable Node process: a timed-out
// promise cannot cancel libuv's blocking open and would leave the test hanging.
const FIFO_TEST_NAME='POSIX FIFO replacement during protected open rejects without a writer';
test(FIFO_TEST_NAME,{skip:process.platform==='win32'?'POSIX FIFO/open flags are not exercised on Windows':false},async t=>{
  const channel=process.env.SOLIDFLOW_FIFO_READ_CHILD;
  if(channel==='source:read'||channel==='document:open'||channel==='document:import-step'){
    let armed=false,selected,canonicalSelected,backup,reads=0,closed=0;
    const fileSystem={...fs,open:async(...args)=>{
      if(!armed||args[0]!==canonicalSelected)return fs.open(...args);
      armed=false;await fs.rename(selected,backup);
      await new Promise((resolve,reject)=>execFile('mkfifo',[selected],{timeout:1500},error=>error?reject(error):resolve()));
      const handle=await fs.open(...args);
      return {stat:options=>handle.stat(options),read:async(...params)=>{reads++;return handle.read(...params);},close:async()=>{closed++;await handle.close();}};
    }};
    const h=await harness(t,{fileSystem});selected=path.join(h.temporary,'actual-fifo-race.'+(channel==='document:import-step'?'step':'solidflow'));backup=path.join(h.temporary,'original-backup');
    await fs.writeFile(selected,content);
    ({selected,canonicalSelected}=await readFaultSelection(selected));
    const grant=channel==='source:read'?await chooseSource(h,selected):null;
    const request=()=>{if(channel!=='source:read')h.dialogQueue.push({canceled:false,filePaths:[selected]});return h.handlers.get(channel)(h.event,grant?.grantId);};
    armed=true;await assert.rejects(request());assert.equal(reads,0);assert.equal(closed,1);assert.equal((await fs.lstat(selected)).isFIFO(),true);
    await fs.unlink(selected);await fs.rename(backup,selected);const restored=await request();
    if(channel==='document:import-step')assert.equal(Buffer.from(restored.data).toString('utf8'),content);else assert.equal(restored.content,content);
    return;
  }
  try{await new Promise((resolve,reject)=>execFile('mkfifo',['--help'],{timeout:1500},error=>error?.code==='ENOENT'?reject(error):resolve()));}
  catch(error){if(error.code==='ENOENT'){t.skip('mkfifo is not installed; no POSIX runtime result');return;}throw error;}
  const owned=await fs.mkdtemp(path.join(os.tmpdir(),'solidflow-ipc-fifo-parent-'));
  t.after(async()=>{assert.ok(path.resolve(owned).startsWith(path.resolve(os.tmpdir())+path.sep));assert.ok(path.basename(owned).startsWith('solidflow-ipc-fifo-parent-'));await fs.rm(owned,{recursive:true,force:true});});
  for(const target of ['source:read','document:open','document:import-step']){
    const result=await new Promise((resolve,reject)=>{
      const environment={...process.env,TMPDIR:owned,SOLIDFLOW_FIFO_READ_CHILD:target};
      delete environment.NODE_TEST_CONTEXT;
      const child=spawn(process.execPath,['--test','--test-name-pattern','^'+FIFO_TEST_NAME+'$',__filename],{cwd:ROOT,env:environment,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='',failure;
      const deadline=setTimeout(()=>{failure=Error('Protected '+target+' blocked on a FIFO without a writer.');child.kill('SIGKILL');},5000);
      child.stdout.on('data',bytes=>{stdout+=bytes;if(stdout.length>1024*1024){failure=Error('FIFO child output exceeded its bound.');child.kill('SIGKILL');}});
      child.stderr.on('data',bytes=>{stderr+=bytes;if(stderr.length>1024*1024){failure=Error('FIFO child error output exceeded its bound.');child.kill('SIGKILL');}});
      child.once('error',error=>{failure=error;});
      child.once('close',(code,signal)=>{clearTimeout(deadline);if(failure)reject(failure);else resolve({code,signal,stdout,stderr});});
    });
    assert.equal(result.code,0,'Actual POSIX '+target+' race failed: '+result.stdout+'\n'+result.stderr);assert.equal(result.signal,null);
  }
});
